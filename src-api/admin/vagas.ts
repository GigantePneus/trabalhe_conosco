import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseAdminInstance: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (supabaseAdminInstance) return supabaseAdminInstance;

  const supaUrl = process.env.SUPABASE_URL || process.env.SUPABASE_INTERNAL_URL || process.env.VITE_SUPABASE_URL;
  const supaServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supaUrl || !supaServiceKey) {
    throw new Error('CONFIG_ERROR: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente.');
  }

  supabaseAdminInstance = createClient(supaUrl, supaServiceKey, {
    auth: { persistSession: false }
  });
  return supabaseAdminInstance;
}

export type UserRole = 'franqueadora_admin' | 'rh_corporativo' | 'franqueado' | 'gerente';

export interface AuthUserContext {
  userId: string;
  email: string;
  nome: string;
  role: UserRole;
  isMasterOrRh: boolean;
  isFranqueado: boolean;
  isGerente: boolean;
  lojasAutorizadasIds: string[];
}

export interface ListarVagasFiltros {
  lojaId?: string;
  cidade?: string;
  titulo?: string;
  departamento?: string;
  status?: 'todas' | 'publicadas' | 'rascunhos' | 'desativadas';
  page?: number;
  limit?: number;
}

export interface VagaAdminItem {
  id: string;
  titulo: string;
  departamento: string | null;
  tipoVaga: string | null;
  descricao: string | null;
  requisitosRaw: string | null;
  ativo: boolean;
  publicada: boolean;
  status: 'publicada' | 'rascunho' | 'desativada';
  loja: {
    id: string | null;
    nome: string | null;
    cidade: string | null;
    estado: string | null;
    ativa?: boolean;
  } | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface CriarVagaInput {
  titulo: string;
  lojaId?: string | null;
  departamento?: string;
  tipoVaga?: string;
  descricao?: string;
  salary?: string;
  shortDescription?: string;
  workModel?: string;
  benefits?: string[];
  responsibilities?: string[];
  requirements?: string[];
  location?: string;
  heroImageUrl?: string;
}

export interface EditarVagaInput {
  vagaId: string;
  titulo?: string;
  lojaId?: string | null;
  departamento?: string;
  tipoVaga?: string;
  descricao?: string;
  salary?: string;
  shortDescription?: string;
  workModel?: string;
  benefits?: string[];
  responsibilities?: string[];
  requirements?: string[];
  location?: string;
}

export type AcaoStatusVaga = 'publicar' | 'despublicar' | 'desativar' | 'reativar';

export interface AlterarStatusVagaInput {
  vagaId: string;
  acao: AcaoStatusVaga;
}

export interface AdminAuditEntry {
  requestId: string;
  timestamp: string;
  operador: {
    userId: string;
    email: string;
    nome: string;
    role: UserRole;
  };
  operacao: 'LISTAR_VAGAS' | 'CONSULTAR_VAGA' | 'CRIAR_VAGA' | 'EDITAR_VAGA' | 'ALTERAR_STATUS_VAGA';
  registroAfetado?: {
    tipo: 'cargos';
    vagaId?: string;
    lojaId?: string | null;
  };
  resultado: 'SUCESSO' | 'FALHA' | 'ACESSO_NEGADO';
  detalhes?: Record<string, any>;
}

export function registrarAuditoria(entry: AdminAuditEntry): void {
  // Registra trilha de auditoria em formato estruturado JSON para os logs de runtime
  console.log(`[AUDITORIA_ADMIN] ${JSON.stringify(entry)}`);
}

export interface AuthUserResult {
  authorized: boolean;
  context?: AuthUserContext;
  statusCode?: number;
  error?: string;
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

/**
 * Validador estrito de autenticação e contexto multi-tenant no backend.
 * Extrai a identidade do usuário a partir do token JWT e verifica permissões e unidades em perfis e usuario_lojas.
 * Nenhuma chave estática compartilhada é aceita; toda chamada deve carregar um token autenticado de usuário.
 */
export async function verifyVagasAuth(token?: string | null): Promise<AuthUserResult> {
  const rawToken = token?.trim();
  if (!rawToken) {
    return { authorized: false, statusCode: 401, error: 'ACESSO_NEGADO: Token de autenticação não fornecido.' };
  }
  const cleanToken = rawToken.replace(/^Bearer\s+/i, '').trim();

  const adminClient = getSupabaseAdmin();

  // 1. Validação estrita do token de sessão no Supabase Auth
  const { data: userData, error: userError } = await adminClient.auth.getUser(cleanToken);
  if (userError || !userData?.user) {
    return { authorized: false, statusCode: 401, error: 'ACESSO_NEGADO: Sessão de usuário inválida ou expirada.' };
  }

  const userId = userData.user.id;

  // 3. Consulta de perfil institucional
  const { data: perfil, error: perfilError } = await adminClient
    .from('perfis')
    .select('id, nome, email, role, ativo')
    .eq('id', userId)
    .maybeSingle();

  if (perfilError || !perfil) {
    return { authorized: false, statusCode: 403, error: 'ACESSO_NEGADO: Perfil de usuário não encontrado.' };
  }

  if (!perfil.ativo) {
    return { authorized: false, statusCode: 403, error: 'ACESSO_NEGADO: Este usuário está desativado no sistema.' };
  }

  const role = perfil.role as UserRole;
  const isMasterOrRh = role === 'franqueadora_admin' || role === 'rh_corporativo';
  const isFranqueado = role === 'franqueado';
  const isGerente = role === 'gerente';

  // 4. Mapeamento de unidades autorizadas
  let lojasAutorizadasIds: string[] = [];
  if (isFranqueado || isGerente) {
    const { data: ulData, error: ulError } = await adminClient
      .from('usuario_lojas')
      .select('loja_id')
      .eq('user_id', userId);

    if (ulError) {
      return { authorized: false, statusCode: 500, error: 'Erro ao consultar unidades autorizadas do usuário.' };
    }

    lojasAutorizadasIds = (ulData || []).map(item => item.loja_id).filter(Boolean);

    if (lojasAutorizadasIds.length === 0) {
      return { authorized: false, statusCode: 403, error: 'ACESSO_NEGADO: Usuário operacional sem unidades autorizadas vinculadas.' };
    }
  }

  return {
    authorized: true,
    context: {
      userId,
      email: perfil.email || userData.user.email || '',
      nome: perfil.nome || 'Usuário RH',
      role,
      isMasterOrRh,
      isFranqueado,
      isGerente,
      lojasAutorizadasIds
    }
  };
}

/**
 * A. Listar vagas administrativas com suporte a filtros e paginação
 */
export async function handleListarVagas(
  filtros: ListarVagasFiltros = {},
  token?: string | null
): Promise<{
  statusCode: number;
  data: {
    success: boolean;
    vagas?: VagaAdminItem[];
    paginacao?: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
    mensagem?: string;
  };
}> {
  const auth = await verifyVagasAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, mensagem: auth.error || 'Acesso negado' } };
  }

  const { context } = auth;
  const adminClient = getSupabaseAdmin();

  const page = Math.max(Number(filtros.page) || 1, 1);
  const limit = Math.min(Math.max(Number(filtros.limit) || 20, 1), 100);
  const offset = (page - 1) * limit;

  // Monta consulta base em cargos
  let query = adminClient
    .from('cargos')
    .select(`
      id,
      titulo,
      departamento,
      tipo_vaga,
      descricao,
      requisitos,
      ativo,
      publicada,
      loja_id,
      criado_em,
      atualizado_em,
      lojas (
        id,
        nome,
        cidade,
        estado,
        ativa
      )
    `, { count: 'exact' });

  // 1. Isolamento multi-tenant obrigatório
  if (!context.isMasterOrRh) {
    query = query.in('loja_id', context.lojasAutorizadasIds);
  }

  // 2. Filtro de unidade específica
  if (filtros.lojaId && filtros.lojaId !== 'todas') {
    if (!context.isMasterOrRh && !context.lojasAutorizadasIds.includes(filtros.lojaId)) {
      return { statusCode: 403, data: { success: false, mensagem: 'ACESSO_NEGADO: Você não possui autorização para consultar esta unidade.' } };
    }
    query = query.eq('loja_id', filtros.lojaId);
  }

  // 3. Filtro por status
  const statusFilter = filtros.status || 'todas';
  if (statusFilter === 'publicadas') {
    query = query.eq('ativo', true).eq('publicada', true);
  } else if (statusFilter === 'rascunhos') {
    query = query.eq('ativo', true).eq('publicada', false);
  } else if (statusFilter === 'desativadas') {
    query = query.eq('ativo', false);
  }

  // 4. Filtro por título
  if (filtros.titulo && filtros.titulo.trim()) {
    query = query.ilike('titulo', `%${filtros.titulo.trim()}%`);
  }

  // 5. Filtro por departamento
  if (filtros.departamento && filtros.departamento.trim()) {
    query = query.ilike('departamento', `%${filtros.departamento.trim()}%`);
  }

  query = query.order('criado_em', { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    return { statusCode: 500, data: { success: false, mensagem: `Erro ao listar vagas: ${error.message}` } };
  }

  let mappedVagas: VagaAdminItem[] = (data || []).map((row: any) => {
    let statusCalculado: 'publicada' | 'rascunho' | 'desativada' = 'rascunho';
    if (!row.ativo) {
      statusCalculado = 'desativada';
    } else if (row.publicada) {
      statusCalculado = 'publicada';
    }

    return {
      id: row.id,
      titulo: row.titulo,
      departamento: row.departamento || null,
      tipoVaga: row.tipo_vaga || 'Presencial',
      descricao: row.descricao || null,
      requisitosRaw: row.requisitos || null,
      ativo: Boolean(row.ativo),
      publicada: Boolean(row.publicada),
      status: statusCalculado,
      loja: row.lojas ? {
        id: row.lojas.id,
        nome: row.lojas.nome,
        cidade: row.lojas.cidade,
        estado: row.lojas.estado,
        ativa: row.lojas.ativa
      } : null,
      criadoEm: row.criado_em,
      atualizadoEm: row.atualizado_em
    };
  });

  // Filtro em memória caso o filtro de cidade tenha sido solicitado
  if (filtros.cidade && filtros.cidade.trim()) {
    const targetCidade = filtros.cidade.trim().toLowerCase();
    mappedVagas = mappedVagas.filter(v => v.loja?.cidade?.toLowerCase().includes(targetCidade));
  }

  const total = count || mappedVagas.length;
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    statusCode: 200,
    data: {
      success: true,
      vagas: mappedVagas,
      paginacao: {
        total,
        page,
        limit,
        totalPages
      }
    }
  };
}

/**
 * B. Consultar detalhes administrativos de uma vaga
 */
export async function handleConsultarVaga(
  vagaId: string,
  token?: string | null
): Promise<{
  statusCode: number;
  data: {
    success: boolean;
    vaga?: VagaAdminItem & { detalhesLanding?: any };
    mensagem?: string;
  };
}> {
  if (!vagaId || typeof vagaId !== 'string') {
    return { statusCode: 400, data: { success: false, mensagem: 'Identificador de vaga (ID) é obrigatório.' } };
  }

  const auth = await verifyVagasAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, mensagem: auth.error || 'Acesso negado' } };
  }

  const { context } = auth;
  const adminClient = getSupabaseAdmin();

  const { data: row, error } = await adminClient
    .from('cargos')
    .select(`
      id,
      titulo,
      departamento,
      tipo_vaga,
      descricao,
      requisitos,
      ativo,
      publicada,
      loja_id,
      criado_em,
      atualizado_em,
      lojas (
        id,
        nome,
        cidade,
        estado,
        ativa
      )
    `)
    .eq('id', vagaId)
    .maybeSingle();

  if (error) {
    return { statusCode: 500, data: { success: false, mensagem: `Erro ao consultar vaga: ${error.message}` } };
  }

  if (!row) {
    return { statusCode: 404, data: { success: false, mensagem: 'Vaga não encontrada.' } };
  }

  // Validação de acesso à unidade
  if (!context.isMasterOrRh && row.loja_id) {
    if (!context.lojasAutorizadasIds.includes(row.loja_id)) {
      return { statusCode: 403, data: { success: false, mensagem: 'ACESSO_NEGADO: Você não possui autorização para acessar os dados desta vaga.' } };
    }
  }

  let statusCalculado: 'publicada' | 'rascunho' | 'desativada' = 'rascunho';
  if (!row.ativo) {
    statusCalculado = 'desativada';
  } else if (row.publicada) {
    statusCalculado = 'publicada';
  }

  let detalhesLanding = null;
  if (row.requisitos) {
    try {
      detalhesLanding = JSON.parse(row.requisitos);
    } catch {
      detalhesLanding = { raw: row.requisitos };
    }
  }

  return {
    statusCode: 200,
    data: {
      success: true,
      vaga: {
        id: row.id,
        titulo: row.titulo,
        departamento: row.departamento || null,
        tipoVaga: row.tipo_vaga || 'Presencial',
        descricao: row.descricao || null,
        requisitosRaw: row.requisitos || null,
        ativo: Boolean(row.ativo),
        publicada: Boolean(row.publicada),
        status: statusCalculado,
        loja: (() => {
          const l = (Array.isArray(row.lojas) ? row.lojas[0] : row.lojas) as any;
          return l ? {
            id: l.id,
            nome: l.nome,
            cidade: l.cidade,
            estado: l.estado,
            ativa: l.ativa
          } : null;
        })(),
        criadoEm: row.criado_em,
        atualizadoEm: row.atualizado_em,
        detalhesLanding
      }
    }
  };
}

/**
 * C. Criar nova vaga (Inicialmente como RASCUNHO / não publicada)
 */
export async function handleCriarVaga(
  input: CriarVagaInput,
  token?: string | null
): Promise<{
  statusCode: number;
  data: {
    success: boolean;
    vagaId?: string;
    mensagem: string;
  };
}> {
  const auth = await verifyVagasAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, mensagem: auth.error || 'Acesso negado' } };
  }

  const { context } = auth;
  const adminClient = getSupabaseAdmin();

  // 1. Bloqueio de perfil Gerente (somente leitura)
  if (context.isGerente) {
    return {
      statusCode: 403,
      data: { success: false, mensagem: 'ACESSO_NEGADO: Usuários com perfil Gerente não possuem permissão para criar vagas.' }
    };
  }

  // 2. Proteção contra injeção de campos reservados na criação
  const camposProibidosCriacao = ['publicada', 'ativo', 'id', 'criado_em', 'criadoEm', 'atualizado_em'];
  const tentouProibidosCriacao = camposProibidosCriacao.filter(f => f in (input as any));
  if (tentouProibidosCriacao.length > 0) {
    return {
      statusCode: 400,
      data: {
        success: false,
        mensagem: `Os campos ${tentouProibidosCriacao.join(', ')} não podem ser definidos na criação. Novas vagas iniciam obrigatoriamente como rascunho.`
      }
    };
  }

  // 3. Validações de título
  const titulo = input.titulo?.trim();
  if (!titulo || titulo.length < 3) {
    return {
      statusCode: 400,
      data: { success: false, mensagem: 'Título da vaga é obrigatório e deve conter ao menos 3 caracteres.' }
    };
  }

  // 3. Validação de Unidade / Loja
  let targetLojaId = input.lojaId ? input.lojaId.trim() : null;

  if (context.isFranqueado) {
    if (!targetLojaId) {
      return {
        statusCode: 400,
        data: { success: false, mensagem: 'Franqueados devem obrigatoriamente vincular a vaga a uma unidade autorizada.' }
      };
    }
    if (!context.lojasAutorizadasIds.includes(targetLojaId)) {
      return {
        statusCode: 403,
        data: { success: false, mensagem: 'ACESSO_NEGADO: Você não possui autorização para criar vagas nesta unidade.' }
      };
    }
  }

  // Validação se a loja informada existe e está ativa
  let lojaNome = 'Rede / Corporativo';
  let lojaCidade = '';
  let lojaEstado = '';

  if (targetLojaId) {
    const { data: lojaRecord, error: lojaErr } = await adminClient
      .from('lojas')
      .select('id, nome, cidade, estado, ativa')
      .eq('id', targetLojaId)
      .maybeSingle();

    if (lojaErr || !lojaRecord) {
      return { statusCode: 400, data: { success: false, mensagem: 'A unidade informada não foi localizada no sistema.' } };
    }

    if (!lojaRecord.ativa) {
      return { statusCode: 400, data: { success: false, mensagem: 'Não é possível vincular vagas a unidades inativas ou desativadas.' } };
    }

    lojaNome = lojaRecord.nome;
    lojaCidade = lojaRecord.cidade;
    lojaEstado = lojaRecord.estado;
  }

  // 4. Monta Landing/Requisitos no formato padrão do Trabalhe Conosco
  const landingPayload = {
    published: false, // OBRIGATÓRIO: Inicia sempre como Rascunho
    slug: slugify(titulo),
    title: titulo,
    heroImageUrl: input.heroImageUrl || '/imagens/banner%20vagas%20-%20gigante%20pneus.png',
    location: input.location || (lojaCidade && lojaEstado ? `${lojaCidade} - ${lojaEstado}` : lojaNome),
    workModel: input.workModel || input.tipoVaga || 'Presencial',
    shortDescription: input.shortDescription || input.descricao || 'Oportunidade para atuar em nossos centros automotivos com foco em excelência e desenvolvimento.',
    salary: input.salary || 'A combinar',
    benefits: Array.isArray(input.benefits) && input.benefits.length > 0
      ? input.benefits
      : ['Vale alimentação', 'Plano de saúde', 'Seguro de vida'],
    responsibilities: Array.isArray(input.responsibilities) && input.responsibilities.length > 0
      ? input.responsibilities
      : ['Executar as atividades técnicas e operacionais da função com foco em qualidade.'],
    requirements: Array.isArray(input.requirements) && input.requirements.length > 0
      ? input.requirements
      : ['Experiência prévia na função e perfil colaborativo.'],
    agentContext: input.descricao || ''
  };

  const requisitosSerialized = JSON.stringify(landingPayload);

  // 5. Inserção no banco
  const { data: inserted, error: insertError } = await adminClient
    .from('cargos')
    .insert([{
      titulo,
      loja_id: targetLojaId,
      departamento: input.departamento?.trim() || 'Operacional',
      tipo_vaga: input.tipoVaga?.trim() || 'Presencial',
      descricao: input.descricao?.trim() || landingPayload.shortDescription,
      requisitos: requisitosSerialized,
      ativo: true,
      publicada: false // OBRIGATÓRIO: Rascunho inicialmente
    }])
    .select('id')
    .single();

  if (insertError) {
    return {
      statusCode: 500,
      data: { success: false, mensagem: `Falha ao cadastrar vaga: ${insertError.message}` }
    };
  }

  registrarAuditoria({
    requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    operador: {
      userId: context.userId,
      email: context.email,
      nome: context.nome,
      role: context.role
    },
    operacao: 'CRIAR_VAGA',
    registroAfetado: {
      tipo: 'cargos',
      vagaId: inserted.id,
      lojaId: targetLojaId
    },
    resultado: 'SUCESSO',
    detalhes: { titulo, lojaId: targetLojaId }
  });

  return {
    statusCode: 201,
    data: {
      success: true,
      vagaId: inserted.id,
      mensagem: 'Vaga cadastrada com sucesso como RASCUNHO (não publicada).'
    }
  };
}

/**
 * D. Editar informações de uma vaga existente
 */
export async function handleEditarVaga(
  input: EditarVagaInput,
  token?: string | null
): Promise<{
  statusCode: number;
  data: {
    success: boolean;
    mensagem: string;
  };
}> {
  if (!input.vagaId) {
    return { statusCode: 400, data: { success: false, mensagem: 'Identificador de vaga (vagaId) é obrigatório.' } };
  }

  const auth = await verifyVagasAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, mensagem: auth.error || 'Acesso negado' } };
  }

  const { context } = auth;
  const adminClient = getSupabaseAdmin();

  if (context.isGerente) {
    return {
      statusCode: 403,
      data: { success: false, mensagem: 'ACESSO_NEGADO: Usuários com perfil Gerente não possuem permissão para editar vagas.' }
    };
  }

  // Proteção contra manipulação de campos de ciclo de vida via endpoint de edição
  const camposProibidosEdicao = ['publicada', 'ativo', 'id', 'criado_em', 'criadoEm', 'atualizado_em'];
  const tentouProibidosEdicao = camposProibidosEdicao.filter(f => f in (input as any));
  if (tentouProibidosEdicao.length > 0) {
    return {
      statusCode: 400,
      data: {
        success: false,
        mensagem: `Alteração não permitida para os campos: ${tentouProibidosEdicao.join(', ')}. O ciclo de vida da vaga deve ser alterado exclusivamente via ações de status ('publicar', 'despublicar', 'desativar', 'reativar').`
      }
    };
  }

  // 1. Busca a vaga atual
  const { data: vagaAtual, error: fetchErr } = await adminClient
    .from('cargos')
    .select('id, titulo, loja_id, requisitos, publicada, ativo')
    .eq('id', input.vagaId)
    .maybeSingle();

  if (fetchErr || !vagaAtual) {
    return { statusCode: 404, data: { success: false, mensagem: 'Vaga não encontrada para edição.' } };
  }

  // 2. Validação de autorização sobre a loja atual
  if (context.isFranqueado) {
    if (!vagaAtual.loja_id || !context.lojasAutorizadasIds.includes(vagaAtual.loja_id)) {
      return { statusCode: 403, data: { success: false, mensagem: 'ACESSO_NEGADO: Você só pode editar vagas de suas unidades autorizadas.' } };
    }
  }

  const updates: Record<string, any> = {
    atualizado_em: new Date().toISOString()
  };

  if (input.titulo && input.titulo.trim().length >= 3) {
    updates.titulo = input.titulo.trim();
  }
  if (input.departamento !== undefined) {
    updates.departamento = input.departamento?.trim() || null;
  }
  if (input.tipoVaga !== undefined) {
    updates.tipo_vaga = input.tipoVaga?.trim() || 'Presencial';
  }
  if (input.descricao !== undefined) {
    updates.descricao = input.descricao?.trim() || null;
  }

  // Validação de alteração de unidade
  if (input.lojaId !== undefined) {
    const novaLojaId = input.lojaId ? input.lojaId.trim() : null;

    if (context.isFranqueado) {
      if (!novaLojaId || !context.lojasAutorizadasIds.includes(novaLojaId)) {
        return { statusCode: 403, data: { success: false, mensagem: 'ACESSO_NEGADO: Você não pode transferir vagas para unidades não autorizadas.' } };
      }
    }

    if (novaLojaId) {
      const { data: lojaCheck, error: errLoja } = await adminClient
        .from('lojas')
        .select('id, ativa')
        .eq('id', novaLojaId)
        .maybeSingle();

      if (errLoja || !lojaCheck || !lojaCheck.ativa) {
        return { statusCode: 400, data: { success: false, mensagem: 'A unidade informada não existe ou está inativa.' } };
      }
    }

    updates.loja_id = novaLojaId;
  }

  // Atualização dos requisitos / landing content mantendo os campos existentes
  let existingLanding: any = {};
  try {
    existingLanding = JSON.parse(vagaAtual.requisitos || '{}');
  } catch {}

  const mergedLanding = {
    ...existingLanding,
    title: updates.titulo || existingLanding.title || vagaAtual.titulo,
    shortDescription: input.shortDescription || updates.descricao || existingLanding.shortDescription,
    salary: input.salary || existingLanding.salary,
    workModel: input.workModel || updates.tipo_vaga || existingLanding.workModel,
    benefits: Array.isArray(input.benefits) ? input.benefits : existingLanding.benefits,
    responsibilities: Array.isArray(input.responsibilities) ? input.responsibilities : existingLanding.responsibilities,
    requirements: Array.isArray(input.requirements) ? input.requirements : existingLanding.requirements,
    location: input.location || existingLanding.location,
    published: vagaAtual.publicada // Preserva o status de publicação intacto
  };

  updates.requisitos = JSON.stringify(mergedLanding);

  const { error: updateErr } = await adminClient
    .from('cargos')
    .update(updates)
    .eq('id', input.vagaId);

  if (updateErr) {
    return { statusCode: 500, data: { success: false, mensagem: `Falha ao atualizar vaga: ${updateErr.message}` } };
  }

  registrarAuditoria({
    requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    operador: {
      userId: context.userId,
      email: context.email,
      nome: context.nome,
      role: context.role
    },
    operacao: 'EDITAR_VAGA',
    registroAfetado: {
      tipo: 'cargos',
      vagaId: input.vagaId,
      lojaId: vagaAtual.loja_id
    },
    resultado: 'SUCESSO',
    detalhes: { camposAtualizados: Object.keys(updates) }
  });

  return { statusCode: 200, data: { success: true, mensagem: 'Dados da vaga atualizados com sucesso.' } };
}

/**
 * E. Publicar, despublicar, desativar ou reativar vaga
 */
export async function handleAlterarStatusVaga(
  input: AlterarStatusVagaInput,
  token?: string | null
): Promise<{
  statusCode: number;
  data: {
    success: boolean;
    novoStatus?: 'publicada' | 'rascunho' | 'desativada';
    mensagem: string;
  };
}> {
  if (!input.vagaId || !input.acao) {
    return { statusCode: 400, data: { success: false, mensagem: 'Identificador (vagaId) e ação são obrigatórios.' } };
  }

  const acoesValidas = ['publicar', 'despublicar', 'desativar', 'reativar'];
  if (!acoesValidas.includes(input.acao)) {
    return { statusCode: 400, data: { success: false, mensagem: `Ação de status inválida: "${input.acao}". Use: publicar, despublicar, desativar ou reativar.` } };
  }

  const auth = await verifyVagasAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, mensagem: auth.error || 'Acesso negado' } };
  }

  const { context } = auth;
  const adminClient = getSupabaseAdmin();

  if (context.isGerente) {
    return {
      statusCode: 403,
      data: { success: false, mensagem: 'ACESSO_NEGADO: Usuários com perfil Gerente não possuem permissão para alterar status de vagas.' }
    };
  }

  // 1. Busca vaga
  const { data: vaga, error: fetchErr } = await adminClient
    .from('cargos')
    .select('id, titulo, loja_id, requisitos, publicada, ativo')
    .eq('id', input.vagaId)
    .maybeSingle();

  if (fetchErr || !vaga) {
    return { statusCode: 404, data: { success: false, mensagem: 'Vaga não encontrada.' } };
  }

  // 2. Validação de autorização por franquia
  if (context.isFranqueado) {
    if (!vaga.loja_id || !context.lojasAutorizadasIds.includes(vaga.loja_id)) {
      return { statusCode: 403, data: { success: false, mensagem: 'ACESSO_NEGADO: Você só pode alterar status de vagas das suas unidades autorizadas.' } };
    }
  }

  const updates: Record<string, any> = {
    atualizado_em: new Date().toISOString()
  };

  let novoStatus: 'publicada' | 'rascunho' | 'desativada' = 'rascunho';
  let mensagemSucesso = '';

  let landingContent: any = {};
  try {
    landingContent = JSON.parse(vaga.requisitos || '{}');
  } catch {}

  switch (input.acao) {
    case 'publicar': {
      // Valida se a loja está ativa antes de publicar
      if (vaga.loja_id) {
        const { data: lojaCheck } = await adminClient
          .from('lojas')
          .select('ativa')
          .eq('id', vaga.loja_id)
          .single();

        if (lojaCheck && !lojaCheck.ativa) {
          return { statusCode: 400, data: { success: false, mensagem: 'Não é possível publicar vagas vinculadas a unidades desativadas.' } };
        }
      }

      updates.publicada = true;
      updates.ativo = true;
      landingContent.published = true;
      novoStatus = 'publicada';
      mensagemSucesso = `Vaga "${vaga.titulo}" publicada com sucesso e visível no site.`;
      break;
    }

    case 'despublicar': {
      updates.publicada = false;
      updates.ativo = true;
      landingContent.published = false;
      novoStatus = 'rascunho';
      mensagemSucesso = `Vaga "${vaga.titulo}" alterada para RASCUNHO (oculta do site).`;
      break;
    }

    case 'desativar': {
      updates.ativo = false;
      updates.publicada = false;
      landingContent.published = false;
      novoStatus = 'desativada';
      mensagemSucesso = `Vaga "${vaga.titulo}" desativada e arquivada com sucesso.`;
      break;
    }

    case 'reativar': {
      updates.ativo = true;
      updates.publicada = false; // Reativa como rascunho por segurança
      landingContent.published = false;
      novoStatus = 'rascunho';
      mensagemSucesso = `Vaga "${vaga.titulo}" reativada com sucesso como RASCUNHO.`;
      break;
    }

    default:
      return { statusCode: 400, data: { success: false, mensagem: `Ação inválida: "${input.acao}". Use: publicar, despublicar, desativar ou reativar.` } };
  }

  updates.requisitos = JSON.stringify(landingContent);

  const { error: updErr } = await adminClient
    .from('cargos')
    .update(updates)
    .eq('id', input.vagaId);

  if (updErr) {
    return { statusCode: 500, data: { success: false, mensagem: `Falha ao alterar status da vaga: ${updErr.message}` } };
  }

  registrarAuditoria({
    requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    operador: {
      userId: context.userId,
      email: context.email,
      nome: context.nome,
      role: context.role
    },
    operacao: 'ALTERAR_STATUS_VAGA',
    registroAfetado: {
      tipo: 'cargos',
      vagaId: input.vagaId,
      lojaId: vaga.loja_id
    },
    resultado: 'SUCESSO',
    detalhes: { acao: input.acao, novoStatus }
  });

  return {
    statusCode: 200,
    data: {
      success: true,
      novoStatus,
      mensagem: mensagemSucesso
    }
  };
}

/**
 * F. Listar lojas/unidades (somente leitura, respeitando permissões)
 */
export async function handleListarLojas(
  token?: string | null
): Promise<{
  statusCode: number;
  data: {
    success: boolean;
    lojas?: Array<{
      id: string;
      nome: string;
      cidade: string | null;
      estado: string | null;
      ativa: boolean;
    }>;
    mensagem?: string;
  };
}> {
  const auth = await verifyVagasAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, mensagem: auth.error || 'Acesso negado' } };
  }

  const { context } = auth;
  const adminClient = getSupabaseAdmin();

  let query = adminClient
    .from('lojas')
    .select('id, nome, cidade, estado, ativa')
    .order('nome', { ascending: true });

  // Franqueados e gerentes veem apenas suas lojas autorizadas
  if (!context.isMasterOrRh) {
    query = query.in('id', context.lojasAutorizadasIds);
  }

  const { data, error } = await query;

  if (error) {
    return { statusCode: 500, data: { success: false, mensagem: `Erro ao listar lojas: ${error.message}` } };
  }

  return {
    statusCode: 200,
    data: {
      success: true,
      lojas: (data || []).map((l: any) => ({
        id: l.id,
        nome: l.nome,
        cidade: l.cidade || null,
        estado: l.estado || null,
        ativa: Boolean(l.ativa)
      }))
    }
  };
}

/**
 * Handler HTTP principal para execução como Serverless Function (Vercel)
 */
export default async function vercelAdminVagasHandler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  try {
    // 1. GET: Listar ou Consultar vaga específica (ou listar lojas)
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');

      // Suporte unificado para listar_lojas
      if (url.pathname.endsWith('/lojas') || url.searchParams.has('lojas')) {
        const result = await handleListarLojas(token);
        res.statusCode = result.statusCode;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result.data));
        return;
      }

      const vagaId = url.searchParams.get('id');

      if (vagaId) {
        const result = await handleConsultarVaga(vagaId, token);
        res.statusCode = result.statusCode;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result.data));
        return;
      }

      const filtros: ListarVagasFiltros = {
        lojaId: url.searchParams.get('lojaId') || undefined,
        cidade: url.searchParams.get('cidade') || undefined,
        titulo: url.searchParams.get('titulo') || undefined,
        departamento: url.searchParams.get('departamento') || undefined,
        status: (url.searchParams.get('status') as any) || 'todas',
        page: url.searchParams.get('page') ? Number(url.searchParams.get('page')) : 1,
        limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : 20
      };

      const result = await handleListarVagas(filtros, token);
      res.statusCode = result.statusCode;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result.data));
      return;
    }

    // 2. POST: Criar nova vaga
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const result = await handleCriarVaga(body, token);
      return res.status(result.statusCode).json(result.data);
    }

    // 3. PATCH / PUT: Editar vaga ou Alterar status
    if (req.method === 'PATCH' || req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (body?.acao) {
        const result = await handleAlterarStatusVaga(body, token);
        return res.status(result.statusCode).json(result.data);
      }

      const result = await handleEditarVaga(body, token);
      return res.status(result.statusCode).json(result.data);
    }

    res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'PUT']);
    return res.status(405).json({ success: false, mensagem: `Método ${req.method} não permitido.` });
  } catch (err: any) {
    return res.status(500).json({ success: false, mensagem: err?.message || 'Erro interno no servidor.' });
  }
}
