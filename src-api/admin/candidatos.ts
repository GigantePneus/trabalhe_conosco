/**
 * API Administrativa de Candidatos e Currículos (Fase 2 - MCP)
 * Sistema Trabalhe Conosco — Gigante Pneus Multi-Lojas
 * 
 * Fornece os serviços de backend para:
 * 1. listar_candidatos
 * 2. consultar_candidato
 * 3. verificar_duplicidade
 * 4. criar_candidato
 * 5. editar_candidato
 * 6. anexar_curriculo
 * 7. consultar_curriculos
 * 8. vincular_candidato_loja
 * 
 * Segurança:
 * - Validação de JWT e perfil institucional (perfis e usuario_lojas)
 * - Isolamento multi-tenant estrito (Franqueadora/RH global vs Franqueado/Gerente loja autorizada)
 * - Trilha de auditoria estruturada
 * - Validação binária de arquivos e conformidade LGPD
 */

import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateCurriculoFile } from '../../services/security/fileValidator';
import { validateCpf, maskCpf, generateCpfHash, encryptCpf } from '../../services/security/cpfSecurity';
import { googleDriveStorage } from '../../services/storage/googleDriveStorage';
import { convertCurriculoToPdf } from '../../services/storage/curriculoPdfConverter';
import { toCanonicalCargo } from '../../services/cargoEquivalenceService';

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

export interface AuthUserResult {
  authorized: boolean;
  context?: AuthUserContext;
  statusCode?: number;
  error?: string;
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
  operacao: string;
  registroAfetado?: {
    tipo: 'candidatos' | 'candidaturas' | 'candidato_curriculos';
    id?: string;
    lojaId?: string | null;
  };
  resultado: 'SUCESSO' | 'FALHA' | 'ACESSO_NEGADO';
  detalhes?: Record<string, any>;
}

export function registrarAuditoria(entry: AdminAuditEntry): void {
  console.log(`[AUDITORIA_ADMIN_CANDIDATOS] ${JSON.stringify(entry)}`);
}

/**
 * Validação de autenticação de operador
 */
export async function verifyCandidatosAuth(token?: string | null): Promise<AuthUserResult> {
  const rawToken = token?.trim();
  if (!rawToken) {
    return { authorized: false, statusCode: 401, error: 'ACESSO_NEGADO: Token de autenticação não fornecido.' };
  }
  const cleanToken = rawToken.replace(/^Bearer\s+/i, '').trim();

  const adminClient = getSupabaseAdmin();

  const { data: userData, error: userError } = await adminClient.auth.getUser(cleanToken);
  if (userError || !userData?.user) {
    return { authorized: false, statusCode: 401, error: 'ACESSO_NEGADO: Sessão de usuário inválida ou expirada.' };
  }

  const userId = userData.user.id;

  const { data: perfil, error: perfilError } = await adminClient
    .from('perfis')
    .select('id, nome, email, role, ativo')
    .eq('id', userId)
    .maybeSingle();

  if (perfilError || !perfil) {
    return { authorized: false, statusCode: 403, error: 'ACESSO_NEGADO: Perfil institucional não localizado.' };
  }

  if (!perfil.ativo) {
    return { authorized: false, statusCode: 403, error: 'ACESSO_NEGADO: Usuário institucional desativado.' };
  }

  const role = perfil.role as UserRole;
  const isMasterOrRh = role === 'franqueadora_admin' || role === 'rh_corporativo';
  const isFranqueado = role === 'franqueado';
  const isGerente = role === 'gerente';

  let lojasAutorizadasIds: string[] = [];
  if (isFranqueado || isGerente) {
    const { data: ulData, error: ulError } = await adminClient
      .from('usuario_lojas')
      .select('loja_id')
      .eq('user_id', userId);

    if (ulError) {
      return { authorized: false, statusCode: 500, error: 'Erro ao consultar unidades do operador.' };
    }

    lojasAutorizadasIds = (ulData || []).map(item => item.loja_id).filter(Boolean);

    if (lojasAutorizadasIds.length === 0) {
      return { authorized: false, statusCode: 403, error: 'ACESSO_NEGADO: Usuário operacional sem unidades autorizadas.' };
    }
  }

  return {
    authorized: true,
    context: {
      userId,
      email: perfil.email || userData.user.email || '',
      nome: perfil.nome || 'Operador RH',
      role,
      isMasterOrRh,
      isFranqueado,
      isGerente,
      lojasAutorizadasIds
    }
  };
}

// ─── 1. LISTAR CANDIDATOS ──────────────────────────────────────────────────────

export interface ListarCandidatosFiltros {
  nome?: string;
  email?: string;
  telefone?: string;
  cidade?: string;
  estado?: string;
  lojaId?: string;
  cargo?: string;
  status?: string;
  origem?: string;
  page?: number;
  limit?: number;
}

export async function handleListarCandidatos(
  filtros: ListarCandidatosFiltros = {},
  token?: string | null
) {
  const auth = await verifyCandidatosAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, error: auth.error } };
  }
  const { isMasterOrRh, lojasAutorizadasIds } = auth.context;

  const adminClient = getSupabaseAdmin();
  const page = Math.max(1, Number(filtros.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filtros.limit) || 20));
  const offset = (page - 1) * limit;

  try {
    // Consulta primária a partir de candidaturas para respeitar integridade multi-lojas
    let query = adminClient
      .from('candidaturas')
      .select(`
        id,
        candidato_id,
        cargo_id,
        loja_id,
        curriculo_id,
        vaga_interesse,
        status,
        apresentacao_pessoal,
        criado_em,
        candidatos!inner (
          id,
          nome,
          email,
          telefone,
          cidade,
          estado,
          escolaridade,
          origem,
          cpf_mascarado,
          criado_em
        ),
        lojas (
          id,
          nome,
          cidade,
          estado
        ),
        candidato_curriculos (
          id,
          nome_arquivo,
          tamanho_bytes,
          mime_type
        )
      `, { count: 'exact' });

    // Restrição multi-tenant
    if (!isMasterOrRh) {
      if (filtros.lojaId) {
        if (!lojasAutorizadasIds.includes(filtros.lojaId)) {
          return { statusCode: 403, data: { success: false, error: 'ACESSO_NEGADO: Unidade não permitida para seu perfil.' } };
        }
        query = query.eq('loja_id', filtros.lojaId);
      } else {
        query = query.in('loja_id', lojasAutorizadasIds);
      }
    } else if (filtros.lojaId) {
      query = query.eq('loja_id', filtros.lojaId);
    }

    if (filtros.status && filtros.status !== 'todos') {
      query = query.eq('status', filtros.status);
    }

    if (filtros.cargo) {
      query = query.ilike('vaga_interesse', `%${filtros.cargo.trim()}%`);
    }

    if (filtros.nome) {
      query = query.ilike('candidatos.nome', `%${filtros.nome.trim()}%`);
    }

    if (filtros.email) {
      query = query.ilike('candidatos.email', `%${filtros.email.trim()}%`);
    }

    if (filtros.telefone) {
      query = query.ilike('candidatos.telefone', `%${filtros.telefone.trim()}%`);
    }

    if (filtros.cidade) {
      query = query.ilike('candidatos.cidade', `%${filtros.cidade.trim()}%`);
    }

    if (filtros.estado) {
      query = query.eq('candidatos.estado', filtros.estado.trim().toUpperCase());
    }

    if (filtros.origem) {
      query = query.eq('candidatos.origem', filtros.origem.trim());
    }

    query = query.order('criado_em', { ascending: false }).range(offset, offset + limit - 1);

    const { data: rows, count, error } = await query;
    if (error) {
      return { statusCode: 500, data: { success: false, error: `Erro na consulta: ${error.message}` } };
    }

    const items = (rows || []).map((row: any) => {
      const cand = row.candidatos || {};
      const loja = row.lojas || {};
      const rawCurr = row.candidato_curriculos;
      const curr = Array.isArray(rawCurr) ? rawCurr[0] : rawCurr;

      const isCpfPendente = cand.origem === 'migracao_drive' ||
        cand.cpf_mascarado === '***.***.***-**' ||
        (cand.cpf_mascarado || '').includes('Pendente');

      return {
        candidatura_id: row.id,
        candidato_id: cand.id,
        nome: cand.nome,
        email: cand.email,
        telefone: cand.telefone,
        cidade: cand.cidade,
        estado: cand.estado,
        escolaridade: cand.escolaridade,
        origem: cand.origem,
        cpf_status: isCpfPendente ? 'pendente_migracao' : 'validado',
        cpf_mascarado: isCpfPendente ? 'CPF Pendente (Migração)' : cand.cpf_mascarado,
        cpf_informado: !isCpfPendente,
        vaga_interesse: row.vaga_interesse,
        status_candidatura: row.status,
        loja: loja.id ? { id: loja.id, nome: loja.nome, cidade: loja.cidade, estado: loja.estado } : null,
        curriculo: curr ? {
          id: curr.id,
          nome_arquivo: curr.nome_arquivo,
          tamanho_bytes: curr.tamanho_bytes,
          url_visualizacao: `/api/curriculos/visualizar?id=${curr.id}`
        } : null,
        criado_em: row.criado_em
      };
    });

    registrarAuditoria({
      requestId: `req_${Date.now()}`,
      timestamp: new Date().toISOString(),
      operador: auth.context,
      operacao: 'LISTAR_CANDIDATOS',
      resultado: 'SUCESSO',
      detalhes: { filtros, totalEncontrado: count, retornados: items.length }
    });

    return {
      statusCode: 200,
      data: {
        success: true,
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
        candidatos: items
      }
    };
  } catch (err: any) {
    return { statusCode: 500, data: { success: false, error: err.message || 'Erro interno' } };
  }
}

// ─── 2. CONSULTAR CANDIDATO ───────────────────────────────────────────────────

export async function handleConsultarCandidato(candidatoId: string, token?: string | null) {
  const auth = await verifyCandidatosAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, error: auth.error } };
  }
  const { isMasterOrRh, lojasAutorizadasIds } = auth.context;

  if (!candidatoId || !candidatoId.trim()) {
    return { statusCode: 400, data: { success: false, error: 'ID do candidato (UUID) é obrigatório.' } };
  }

  const adminClient = getSupabaseAdmin();

  try {
    // 1. Dados cadastrais do candidato
    const { data: cand, error: candErr } = await adminClient
      .from('candidatos')
      .select('*')
      .eq('id', candidatoId.trim())
      .maybeSingle();

    if (candErr || !cand) {
      return { statusCode: 404, data: { success: false, error: 'Candidato não localizado.' } };
    }

    // 2. Candidaturas associadas
    const { data: cands, error: candsErr } = await adminClient
      .from('candidaturas')
      .select(`
        id,
        cargo_id,
        loja_id,
        curriculo_id,
        vaga_interesse,
        status,
        apresentacao_pessoal,
        experiencia_profissional,
        dados_formulario,
        criado_em,
        lojas (
          id,
          nome,
          cidade,
          estado
        )
      `)
      .eq('candidato_id', candidatoId.trim())
      .order('criado_em', { ascending: false });

    if (candsErr) {
      return { statusCode: 500, data: { success: false, error: `Erro ao buscar candidaturas: ${candsErr.message}` } };
    }

    // Verificação multi-tenant para Franqueados / Gerentes
    if (!isMasterOrRh) {
      const temAcesso = (cands || []).some(c => c.loja_id && lojasAutorizadasIds.includes(c.loja_id));
      if (!temAcesso) {
        return { statusCode: 403, data: { success: false, error: 'ACESSO_NEGADO: Candidato não vinculado a nenhuma de suas unidades autorizadas.' } };
      }
    }

    // 3. Currículos associados
    const { data: curriculos, error: currErr } = await adminClient
      .from('candidato_curriculos')
      .select('id, nome_arquivo, mime_type, tamanho_bytes, upload_status, criado_em')
      .eq('candidato_id', candidatoId.trim())
      .order('criado_em', { ascending: false });

    const curriculosFormatados = (curriculos || []).map(c => ({
      id: c.id,
      nome_arquivo: c.nome_arquivo,
      mime_type: c.mime_type,
      tamanho_bytes: c.tamanho_bytes,
      upload_status: c.upload_status,
      criado_em: c.criado_em,
      url_visualizacao: `/api/curriculos/visualizar?id=${c.id}`
    }));

    const isCpfPendente = !cand.cpf_criptografado ||
      cand.origem === 'migracao_drive' ||
      cand.cpf_mascarado === '***.***.***-**' ||
      (cand.cpf_mascarado || '').includes('Pendente');

    return {
      statusCode: 200,
      data: {
        success: true,
        candidato: {
          id: cand.id,
          nome: cand.nome,
          email: cand.email,
          telefone: cand.telefone,
          cidade: cand.cidade,
          estado: cand.estado,
          escolaridade: cand.escolaridade,
          linkedin_url: cand.linkedin_url,
          aceita_outras_vagas: cand.aceita_outras_vagas,
          origem: cand.origem,
          cpf_status: isCpfPendente ? 'pendente_migracao' : 'validado',
          cpf_mascarado: isCpfPendente ? 'CPF Pendente (Migração)' : cand.cpf_mascarado,
          cpf_informado: !isCpfPendente,
          criado_em: cand.criado_em,
          atualizado_em: cand.atualizado_em,
          candidaturas: (cands || []).map(c => ({
            id: c.id,
            cargo_id: c.cargo_id,
            loja: c.lojas ? { id: (c.lojas as any).id, nome: (c.lojas as any).nome, cidade: (c.lojas as any).cidade } : null,
            vaga_interesse: c.vaga_interesse,
            status: c.status,
            apresentacao_pessoal: c.apresentacao_pessoal,
            experiencia_profissional: c.experiencia_profissional,
            criado_em: c.criado_em
          })),
          curriculos: curriculosFormatados
        }
      }
    };
  } catch (err: any) {
    return { statusCode: 500, data: { success: false, error: err.message || 'Erro interno' } };
  }
}

// ─── 3. VERIFICAR DUPLICIDADE ─────────────────────────────────────────────────

export interface VerificarDuplicidadeInput {
  email?: string;
  telefone?: string;
  cpf?: string;
  nome?: string;
}

export async function handleVerificarDuplicidade(
  params: VerificarDuplicidadeInput,
  token?: string | null
) {
  const auth = await verifyCandidatosAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, error: auth.error } };
  }

  const adminClient = getSupabaseAdmin();
  const correspondencias: Array<{
    candidato_id: string;
    nome: string;
    email: string;
    telefone: string;
    cpf_mascarado: string;
    tipo_correspondencia: string;
    score_confianca: 'alto' | 'medio' | 'baixo';
  }> = [];

  const vistos = new Set<string>();

  try {
    // 1. Busca por e-mail exato (normalizado)
    if (params.email && params.email.trim()) {
      const cleanEmail = params.email.trim().toLowerCase();
      const { data: rowsEmail } = await adminClient
        .from('candidatos')
        .select('id, nome, email, telefone, cpf_mascarado')
        .ilike('email', cleanEmail);

      for (const r of rowsEmail || []) {
        if (!vistos.has(r.id)) {
          vistos.add(r.id);
          correspondencias.push({
            candidato_id: r.id,
            nome: r.nome,
            email: r.email,
            telefone: r.telefone,
            cpf_mascarado: r.cpf_mascarado,
            tipo_correspondencia: 'email_exato',
            score_confianca: 'alto'
          });
        }
      }
    }

    // 2. Busca por CPF
    if (params.cpf && params.cpf.trim()) {
      const cpfVal = validateCpf(params.cpf);
      if (cpfVal.valid) {
        const cpfHash = generateCpfHash(cpfVal.cleanCpf);
        const { data: rowsCpf } = await adminClient
          .from('candidatos')
          .select('id, nome, email, telefone, cpf_mascarado')
          .eq('cpf_hash', cpfHash);

        for (const r of rowsCpf || []) {
          if (!vistos.has(r.id)) {
            vistos.add(r.id);
            correspondencias.push({
              candidato_id: r.id,
              nome: r.nome,
              email: r.email,
              telefone: r.telefone,
              cpf_mascarado: r.cpf_mascarado,
              tipo_correspondencia: 'cpf_exato',
              score_confianca: 'alto'
            });
          }
        }
      }
    }

    // 3. Busca por Telefone (somente dígitos)
    if (params.telefone && params.telefone.trim()) {
      const cleanPhone = params.telefone.replace(/\D/g, '');
      if (cleanPhone.length >= 8) {
        const phoneSuffix = cleanPhone.slice(-8);
        const { data: rowsTel } = await adminClient
          .from('candidatos')
          .select('id, nome, email, telefone, cpf_mascarado')
          .ilike('telefone', `%${phoneSuffix}%`);

        for (const r of rowsTel || []) {
          if (!vistos.has(r.id)) {
            vistos.add(r.id);
            correspondencias.push({
              candidato_id: r.id,
              nome: r.nome,
              email: r.email,
              telefone: r.telefone,
              cpf_mascarado: r.cpf_mascarado,
              tipo_correspondencia: 'telefone_semelhante',
              score_confianca: 'medio'
            });
          }
        }
      }
    }

    // 4. Busca por Nome (indício de homônimo)
    if (params.nome && params.nome.trim().length >= 4) {
      const cleanNome = params.nome.trim();
      const { data: rowsNome } = await adminClient
        .from('candidatos')
        .select('id, nome, email, telefone, cpf_mascarado')
        .ilike('nome', `%${cleanNome}%`)
        .limit(5);

      for (const r of rowsNome || []) {
        if (!vistos.has(r.id)) {
          vistos.add(r.id);
          correspondencias.push({
            candidato_id: r.id,
            nome: r.nome,
            email: r.email,
            telefone: r.telefone,
            cpf_mascarado: r.cpf_mascarado,
            tipo_correspondencia: 'nome_semelhante',
            score_confianca: 'baixo'
          });
        }
      }
    }

    const duplicidadeEncontrada = correspondencias.length > 0;
    const temCorrespondenciaExata = correspondencias.some(c => c.score_confianca === 'alto');

    return {
      statusCode: 200,
      data: {
        success: true,
        duplicidade_encontrada: duplicidadeEncontrada,
        recomendacao: temCorrespondenciaExata
          ? 'Candidato já cadastrado no sistema. Utilize o candidato_id correspondente para associar novas unidades ou currículos.'
          : (duplicidadeEncontrada ? 'Possível duplicidade identificada por telefone ou nome. Verifique os dados antes de cadastrar.' : 'Nenhuma duplicidade encontrada. Apto para criação.'),
        total_correspondencias: correspondencias.length,
        correspondencias
      }
    };
  } catch (err: any) {
    return { statusCode: 500, data: { success: false, error: err.message || 'Erro interno' } };
  }
}

// ─── 4. CRIAR CANDIDATO ───────────────────────────────────────────────────────

export interface CriarCandidatoInput {
  nome: string;
  email: string;
  telefone: string;
  cidade?: string;
  estado?: string;
  escolaridade?: string;
  linkedinUrl?: string;
  cpf?: string;
  aceitaOutrasVagas?: boolean;
  origem?: string;
}

export async function handleCriarCandidato(
  payload: CriarCandidatoInput,
  token?: string | null
) {
  const auth = await verifyCandidatosAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, error: auth.error } };
  }

  if (!payload.nome || payload.nome.trim().length < 2) {
    return { statusCode: 400, data: { success: false, error: 'Nome do candidato é obrigatório (mín. 2 caracteres).' } };
  }

  if (!payload.email || !payload.email.includes('@')) {
    return { statusCode: 400, data: { success: false, error: 'E-mail válido é obrigatório.' } };
  }

  if (!payload.telefone || payload.telefone.trim().length < 8) {
    return { statusCode: 400, data: { success: false, error: 'Telefone de contato é obrigatório.' } };
  }

  const adminClient = getSupabaseAdmin();
  const cleanEmail = payload.email.trim().toLowerCase();

  try {
    // 1. Idempotência / Prevenção de duplicidade por e-mail
    const { data: candExistente } = await adminClient
      .from('candidatos')
      .select('id, nome, email, telefone, cpf_mascarado, criado_em')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (candExistente) {
      return {
        statusCode: 200,
        data: {
          success: true,
          ja_existente: true,
          candidato_id: candExistente.id,
          mensagem: 'Candidato já cadastrado com este e-mail. Registro reaproveitado com sucesso.',
          candidato: candExistente
        }
      };
    }

    // 2. Tratamento seguro de CPF
    let cpfHash: string;
    let cpfMascarado: string;
    let cpfCriptografado: string | null = null;
    const isCpfPendente = !payload.cpf || !payload.cpf.trim();

    if (!isCpfPendente) {
      const cpfVal = validateCpf(payload.cpf!);
      if (cpfVal.valid) {
        cpfHash = generateCpfHash(cpfVal.cleanCpf);
        cpfMascarado = maskCpf(cpfVal.cleanCpf);
        cpfCriptografado = encryptCpf(cpfVal.cleanCpf);

        // Previne colisão por CPF
        const { data: candCpf } = await adminClient
          .from('candidatos')
          .select('id, nome, email')
          .eq('cpf_hash', cpfHash)
          .maybeSingle();

        if (candCpf) {
          return {
            statusCode: 409,
            data: {
              success: false,
              candidato_id: candCpf.id,
              error: `Já existe um candidato cadastrado com este CPF (${candCpf.email}).`
            }
          };
        }
      } else {
        // Se CPF inválido foi fornecido
        return { statusCode: 400, data: { success: false, error: `CPF inválido: ${cpfVal.error}` } };
      }
    } else {
      // Quando não há CPF (migração de currículos antigos):
      // Gera hash único e determinístico baseado no e-mail para cumprir NOT NULL UNIQUE sem violar integridade
      // e registra no banco como 'CPF Pendente' (respeitando o limite VARCHAR(14) da coluna)
      cpfHash = crypto.createHash('sha256').update(`MIGRACAO_${cleanEmail}`).digest('hex');
      cpfMascarado = 'CPF Pendente';
      cpfCriptografado = null;
    }

    // 3. Inserção do Candidato no Banco de Talentos
    const { data: novoCandidato, error: insertErr } = await adminClient
      .from('candidatos')
      .insert({
        nome: payload.nome.trim(),
        email: cleanEmail,
        cpf_hash: cpfHash,
        cpf_mascarado: cpfMascarado,
        cpf_criptografado: cpfCriptografado,
        telefone: payload.telefone.trim(),
        cidade: payload.cidade?.trim() || null,
        estado: payload.estado?.trim().toUpperCase() || null,
        escolaridade: payload.escolaridade?.trim() || null,
        linkedin_url: payload.linkedinUrl?.trim() || null,
        aceita_outras_vagas: payload.aceitaOutrasVagas ?? true,
        consentimento_lgpd: true,
        consentimento_versao: 'mcp-migracao-2026',
        consentimento_em: new Date().toISOString(),
        retencao_meses: 12,
        retencao_ate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        origem: payload.origem?.trim() || 'migracao_drive'
      })
      .select('id, nome, email, telefone, cidade, estado, origem, criado_em')
      .single();

    if (insertErr || !novoCandidato) {
      return { statusCode: 500, data: { success: false, error: `Erro ao criar candidato: ${insertErr?.message}` } };
    }

    registrarAuditoria({
      requestId: `req_${Date.now()}`,
      timestamp: new Date().toISOString(),
      operador: auth.context,
      operacao: 'CRIAR_CANDIDATO',
      registroAfetado: { tipo: 'candidatos', id: novoCandidato.id },
      resultado: 'SUCESSO',
      detalhes: { nome: novoCandidato.nome, email: novoCandidato.email, origem: novoCandidato.origem, isCpfPendente }
    });

    return {
      statusCode: 201,
      data: {
        success: true,
        candidato_id: novoCandidato.id,
        mensagem: isCpfPendente
          ? 'Candidato cadastrado no Banco de Talentos com CPF pendente (registro de migração).'
          : 'Candidato cadastrado com sucesso no Banco de Talentos.',
        candidato: {
          ...novoCandidato,
          cpf_status: isCpfPendente ? 'pendente_migracao' : 'validado',
          cpf_mascarado: isCpfPendente ? 'CPF Pendente (Migração)' : cpfMascarado,
          cpf_informado: !isCpfPendente
        }
      }
    };
  } catch (err: any) {
    return { statusCode: 500, data: { success: false, error: err.message || 'Erro interno' } };
  }
}

// ─── 5. EDITAR CANDIDATO ──────────────────────────────────────────────────────

export interface EditarCandidatoInput {
  candidatoId: string;
  nome?: string;
  email?: string;
  telefone?: string;
  cidade?: string;
  estado?: string;
  escolaridade?: string;
  linkedinUrl?: string;
  aceitaOutrasVagas?: boolean;
}

export async function handleEditarCandidato(
  payload: EditarCandidatoInput,
  token?: string | null
) {
  const auth = await verifyCandidatosAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, error: auth.error } };
  }

  if (!payload.candidatoId || !payload.candidatoId.trim()) {
    return { statusCode: 400, data: { success: false, error: 'ID do candidato (UUID) é obrigatório.' } };
  }

  const adminClient = getSupabaseAdmin();
  const updateData: Record<string, any> = {
    atualizado_em: new Date().toISOString()
  };

  if (payload.nome && payload.nome.trim()) updateData.nome = payload.nome.trim();
  if (payload.email && payload.email.trim()) updateData.email = payload.email.trim().toLowerCase();
  if (payload.telefone && payload.telefone.trim()) updateData.telefone = payload.telefone.trim();
  if (payload.cidade !== undefined) updateData.cidade = payload.cidade?.trim() || null;
  if (payload.estado !== undefined) updateData.estado = payload.estado?.trim().toUpperCase() || null;
  if (payload.escolaridade !== undefined) updateData.escolaridade = payload.escolaridade?.trim() || null;
  if (payload.linkedinUrl !== undefined) updateData.linkedin_url = payload.linkedinUrl?.trim() || null;
  if (payload.aceitaOutrasVagas !== undefined) updateData.aceita_outras_vagas = Boolean(payload.aceitaOutrasVagas);

  try {
    const { data: updated, error } = await adminClient
      .from('candidatos')
      .update(updateData)
      .eq('id', payload.candidatoId.trim())
      .select('id, nome, email, telefone, cidade, estado, atualizado_em')
      .single();

    if (error || !updated) {
      return { statusCode: 500, data: { success: false, error: `Erro ao atualizar candidato: ${error?.message}` } };
    }

    registrarAuditoria({
      requestId: `req_${Date.now()}`,
      timestamp: new Date().toISOString(),
      operador: auth.context,
      operacao: 'EDITAR_CANDIDATO',
      registroAfetado: { tipo: 'candidatos', id: payload.candidatoId },
      resultado: 'SUCESSO',
      detalhes: { camposAtualizados: Object.keys(updateData) }
    });

    return {
      statusCode: 200,
      data: {
        success: true,
        mensagem: 'Dados do candidato atualizados com sucesso.',
        candidato: updated
      }
    };
  } catch (err: any) {
    return { statusCode: 500, data: { success: false, error: err.message || 'Erro interno' } };
  }
}

// ─── 6. ANEXAR CURRÍCULO ──────────────────────────────────────────────────────

export interface AnexarCurriculoInput {
  candidatoId: string;
  arquivoBase64: string;
  nomeArquivo: string;
  mimeType?: string;
  lojaId?: string | null;
  cargoId?: string | null;
  cargo?: string | null;
}

export async function handleAnexarCurriculo(
  payload: AnexarCurriculoInput,
  token?: string | null
) {
  const auth = await verifyCandidatosAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, error: auth.error } };
  }

  if (!payload.candidatoId || !payload.candidatoId.trim()) {
    return { statusCode: 400, data: { success: false, error: 'candidatoId (UUID) é obrigatório.' } };
  }

  if (!payload.arquivoBase64 || !payload.nomeArquivo) {
    return { statusCode: 400, data: { success: false, error: 'arquivoBase64 e nomeArquivo são obrigatórios.' } };
  }

  const adminClient = getSupabaseAdmin();

  try {
    // 1. Confirma existência do candidato
    const { data: cand, error: candErr } = await adminClient
      .from('candidatos')
      .select('id, nome, email')
      .eq('id', payload.candidatoId.trim())
      .maybeSingle();

    if (candErr || !cand) {
      return { statusCode: 404, data: { success: false, error: 'Candidato não localizado para anexação.' } };
    }

    // 2. Decodificação do Buffer
    const cleanBase64 = payload.arquivoBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    // 3. Validação Binária Estrita (Magic Numbers, Extensão e Limite de 10 MB)
    const fileValidation = validateCurriculoFile(buffer, payload.nomeArquivo, payload.mimeType);
    if (!fileValidation.valid) {
      return {
        statusCode: 400,
        data: { success: false, error: fileValidation.error || 'Arquivo de currículo inválido.' }
      };
    }

    const detectedMime = fileValidation.detectedMimeType || payload.mimeType || 'application/pdf';
    const md5Checksum = crypto.createHash('md5').update(buffer).digest('hex');

    // 4. Prevenção de anexos duplicados
    const { data: currExistente } = await adminClient
      .from('candidato_curriculos')
      .select('id, nome_arquivo, tamanho_bytes, criado_em')
      .eq('candidato_id', cand.id)
      .eq('md5_checksum', md5Checksum)
      .maybeSingle();

    if (currExistente) {
      return {
        statusCode: 200,
        data: {
          success: true,
          ja_anexado: true,
          curriculo_id: currExistente.id,
          mensagem: 'Este mesmo arquivo de currículo já está anexado ao candidato.',
          url_visualizacao: `/api/curriculos/visualizar?id=${currExistente.id}`
        }
      };
    }

    // 4.1 Resolução da Unidade e Cargo para Organização Hierárquica no Google Drive
    let resolvedLojaId = payload.lojaId?.trim() || null;
    let resolvedCargoId = payload.cargoId?.trim() || null;
    let resolvedCargoNome = payload.cargo?.trim() || null;

    if (!resolvedLojaId || (!resolvedCargoId && !resolvedCargoNome)) {
      const { data: candidaturas } = await adminClient
        .from('candidaturas')
        .select('id, loja_id, cargo_id, status, cargos(titulo, departamento)')
        .eq('candidato_id', cand.id)
        .order('criado_em', { ascending: false });

      if (candidaturas && candidaturas.length > 0) {
        const candAtiva = candidaturas.find((c: any) => c.status !== 'Reprovado' && c.status !== 'Desistente') || candidaturas[0];
        if (!resolvedLojaId && candAtiva.loja_id) {
          resolvedLojaId = candAtiva.loja_id;
        }
        if (!resolvedCargoId && !resolvedCargoNome) {
          resolvedCargoId = candAtiva.cargo_id || null;
          const cargoObj = candAtiva.cargos as any;
          resolvedCargoNome = cargoObj?.titulo || null;
        }
      }
    }

    const isCorporativoExplicit =
      resolvedLojaId === 'corporativo' ||
      resolvedLojaId === '00000000-0000-0000-0000-000000000000';

    if (!resolvedLojaId && !isCorporativoExplicit) {
      return {
        statusCode: 422,
        data: {
          success: false,
          error:
            'INFORMACOES_UNIDADE_AUSENTES: O candidato não possui unidade vinculada nem candidaturas ativas para direcionamento da pasta no Google Drive. Informe lojaId e/ou cargo no payload para anexar o currículo na pasta correta.'
        }
      };
    }

    // 4.2 Padronização e Conversão Institucional para PDF (PDF, DOC, DOCX, RTF, JPG, JPEG, PNG)
    let convertedPdfResult;
    try {
      convertedPdfResult = await convertCurriculoToPdf({
        buffer,
        originalName: payload.nomeArquivo,
        format: fileValidation.detectedFormat!
      });
    } catch (convErr: any) {
      // "Se a conversão falhar, registrar o erro e não marcar o currículo como concluído."
      return {
        statusCode: 422,
        data: {
          success: false,
          error: `FALHA_CONVERSAO_PDF: O arquivo não pôde ser padronizado para PDF institucional: ${convErr.message}`
        }
      };
    }

    // 5. Upload seguro para o Google Drive corporativo da Gigante Pneus (sempre em PDF padronizado)
    let driveUpload;
    try {
      driveUpload = await googleDriveStorage.uploadFile({
        buffer: convertedPdfResult.pdfBuffer,
        originalName: convertedPdfResult.pdfFileName,
        mimeType: 'application/pdf',
        lojaId: isCorporativoExplicit ? null : resolvedLojaId,
        cargoId: resolvedCargoId,
        cargoNome: resolvedCargoNome
      });
    } catch (driveErr: any) {
      return {
        statusCode: 502,
        data: {
          success: false,
          error: `Falha no armazenamento do Google Drive: ${driveErr.message}`
        }
      };
    }

    // 6. Registro na tabela candidato_curriculos
    const { data: novoCurriculo, error: insertCurrErr } = await adminClient
      .from('candidato_curriculos')
      .insert({
        candidato_id: cand.id,
        google_drive_file_id: driveUpload.fileId,
        google_drive_folder_id: driveUpload.folderId,
        nome_arquivo: driveUpload.fileName || convertedPdfResult.pdfFileName,
        mime_type: 'application/pdf',
        tamanho_bytes: driveUpload.tamanhoBytes || convertedPdfResult.pdfBuffer.length,
        md5_checksum: md5Checksum,
        upload_status: 'concluido'
      })
      .select('id, nome_arquivo, mime_type, tamanho_bytes, criado_em')
      .single();

    if (insertCurrErr || !novoCurriculo) {
      // Compensação: tenta remover arquivo órfão no Drive
      try { await googleDriveStorage.deleteFile(driveUpload.fileId); } catch {}
      return {
        statusCode: 500,
        data: { success: false, error: `Erro ao registrar currículo no banco: ${insertCurrErr?.message}` }
      };
    }

    // 7. Atualização retroativa em candidaturas do candidato sem currículo associado
    await adminClient
      .from('candidaturas')
      .update({ curriculo_id: novoCurriculo.id })
      .eq('candidato_id', cand.id)
      .is('curriculo_id', null);

    registrarAuditoria({
      requestId: `req_${Date.now()}`,
      timestamp: new Date().toISOString(),
      operador: auth.context,
      operacao: 'ANEXAR_CURRICULO',
      registroAfetado: { tipo: 'candidato_curriculos', id: novoCurriculo.id },
      resultado: 'SUCESSO',
      detalhes: { candidatoId: cand.id, nomeArquivo: novoCurriculo.nome_arquivo }
    });

    return {
      statusCode: 201,
      data: {
        success: true,
        curriculo_id: novoCurriculo.id,
        nome_arquivo: novoCurriculo.nome_arquivo,
        mime_type: novoCurriculo.mime_type,
        tamanho_bytes: novoCurriculo.tamanho_bytes,
        convertido_para_pdf: convertedPdfResult.converted,
        formato_original: convertedPdfResult.originalFormat,
        mensagem: convertedPdfResult.converted
          ? `Currículo (${convertedPdfResult.originalFormat.toUpperCase()}) padronizado com sucesso para PDF institucional e armazenado no Google Drive.`
          : 'Currículo anexado e armazenado com sucesso no Google Drive corporativo.',
        url_visualizacao: `/api/curriculos/visualizar?id=${novoCurriculo.id}`
      }
    };
  } catch (err: any) {
    return { statusCode: 500, data: { success: false, error: err.message || 'Erro interno' } };
  }
}

/**
 * Alias de importação de currículos do Drive institucional, reutilizando integralmente a lógica de
 * validação, conversão para PDF, deduplicação por hash e organização hierárquica por loja e cargo.
 */
export const handleImportarCurriculoDrive = handleAnexarCurriculo;

// ─── 7. CONSULTAR CURRÍCULOS ──────────────────────────────────────────────────

export async function handleConsultarCurriculos(
  candidatoId?: string,
  tokenOrCurriculoId?: string | null,
  maybeToken?: string | null
) {
  let curriculoId: string | undefined;
  let token: string | null | undefined;

  if (maybeToken !== undefined) {
    curriculoId = tokenOrCurriculoId || undefined;
    token = maybeToken;
  } else {
    token = tokenOrCurriculoId;
  }

  const auth = await verifyCandidatosAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, error: auth.error } };
  }

  if (!candidatoId && !curriculoId) {
    return { statusCode: 400, data: { success: false, error: 'Informe candidatoId ou curriculoId.' } };
  }

  const adminClient = getSupabaseAdmin();

  try {
    let query = adminClient
      .from('candidato_curriculos')
      .select('id, candidato_id, nome_arquivo, mime_type, tamanho_bytes, upload_status, criado_em');

    if (curriculoId) {
      query = query.eq('id', curriculoId.trim());
    } else if (candidatoId) {
      query = query.eq('candidato_id', candidatoId.trim());
    }

    const { data: rows, error } = await query.order('criado_em', { ascending: false });
    if (error) {
      return { statusCode: 500, data: { success: false, error: `Erro na consulta: ${error.message}` } };
    }

    const curriculos = (rows || []).map(c => ({
      id: c.id,
      candidato_id: c.candidato_id,
      nome_arquivo: c.nome_arquivo,
      mime_type: c.mime_type,
      tamanho_bytes: c.tamanho_bytes,
      upload_status: c.upload_status,
      criado_em: c.criado_em,
      url_visualizacao_segura: `/api/curriculos/visualizar?id=${c.id}`
    }));

    return {
      statusCode: 200,
      data: {
        success: true,
        total: curriculos.length,
        curriculos
      }
    };
  } catch (err: any) {
    return { statusCode: 500, data: { success: false, error: err.message || 'Erro interno' } };
  }
}

// ─── 8. VINCULAR CANDIDATO À LOJA ─────────────────────────────────────────────

export interface VincularCandidatoLojaInput {
  candidatoId: string;
  lojaId: string;
  cargoPretendido?: string;
  cargoId?: string | null;
  apresentacaoPessoal?: string;
  experienciaProfissional?: Record<string, any>;
}

function sanitizarApresentacaoPessoal(texto?: string): string | null {
  if (!texto || !texto.trim()) {
    return 'Candidato importado e vinculado ao Banco de Talentos da unidade através do MCP Administrativo Trabalhe Conosco Gigante Pneus.';
  }
  const clean = texto.trim();
  if (clean.length < 80) {
    return `${clean} — Cadastro registrado e integrado ao Banco de Talentos via MCP Administrativo Gigante Pneus.`;
  }
  return clean.slice(0, 2000);
}

export async function handleVincularCandidatoLoja(
  payload: VincularCandidatoLojaInput,
  token?: string | null
) {
  const auth = await verifyCandidatosAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, error: auth.error } };
  }
  const { isMasterOrRh, lojasAutorizadasIds } = auth.context;

  if (!payload.candidatoId || !payload.lojaId) {
    return { statusCode: 400, data: { success: false, error: 'candidatoId e lojaId são obrigatórios.' } };
  }

  // Restrição de loja
  if (!isMasterOrRh && !lojasAutorizadasIds.includes(payload.lojaId)) {
    return { statusCode: 403, data: { success: false, error: 'ACESSO_NEGADO: Você não tem permissão para vincular candidatos a esta unidade.' } };
  }

  const adminClient = getSupabaseAdmin();

  try {
    // 1. Confirma existência de candidato e loja
    const [{ data: cand }, { data: loja }] = await Promise.all([
      adminClient.from('candidatos').select('id, nome, email, telefone').eq('id', payload.candidatoId).maybeSingle(),
      adminClient.from('lojas').select('id, nome, cidade, estado, ativa').eq('id', payload.lojaId).maybeSingle()
    ]);

    if (!cand) return { statusCode: 404, data: { success: false, error: 'Candidato não localizado.' } };
    if (!loja) return { statusCode: 404, data: { success: false, error: 'Unidade (loja) não localizada.' } };
    if (!loja.ativa) return { statusCode: 400, data: { success: false, error: 'Unidade temporariamente desativada.' } };

    const rawPretendido = (payload.cargoPretendido || 'Banco de Talentos').trim();
    const cargoPretendido = toCanonicalCargo(rawPretendido);

    // 2. Busca último currículo do candidato para associar
    const { data: ultCurr } = await adminClient
      .from('candidato_curriculos')
      .select('id')
      .eq('candidato_id', cand.id)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 3. Prevenção de duplicidade: verifica se já existe candidatura espontânea para esta loja
    const { data: candExistente } = await adminClient
      .from('candidaturas')
      .select('id, status, vaga_interesse, criado_em')
      .eq('candidato_id', cand.id)
      .eq('loja_id', loja.id)
      .is('cargo_id', null)
      .maybeSingle();

    if (candExistente) {
      // Atualiza os dados da candidatura existente de forma idempotente
      const { data: candAtualizada, error: updErr } = await adminClient
        .from('candidaturas')
        .update({
          vaga_interesse: cargoPretendido,
          status: 'Banco de Talentos',
          curriculo_id: ultCurr?.id || null,
          apresentacao_pessoal: sanitizarApresentacaoPessoal(payload.apresentacaoPessoal),
          experiencia_profissional: payload.experienciaProfissional || {},
          atualizado_em: new Date().toISOString()
        })
        .eq('id', candExistente.id)
        .select('id, candidato_id, loja_id, vaga_interesse, status')
        .single();

      if (updErr) {
        return { statusCode: 500, data: { success: false, error: `Erro ao atualizar vínculo: ${updErr.message}` } };
      }

      return {
        statusCode: 200,
        data: {
          success: true,
          ja_vinculado: true,
          tipo_vinculo: 'banco_de_talentos',
          vaga_aberta: false,
          notificacoes_disparadas: false,
          candidatura_id: candAtualizada.id,
          loja: { id: loja.id, nome: loja.nome, cidade: loja.cidade, estado: loja.estado },
          mensagem: `Candidato já estava vinculado à unidade ${loja.nome}. Registro atualizado no Banco de Talentos (não vinculado a vaga aberta).`,
          vinculo: candAtualizada
        }
      };
    }

    // 4. Criação da Inscrição/Candidatura que oficializa o vínculo multi-tenant
    // Importante: cargo_id é estritamente null para não associar a vaga aberta nem inflar contadores
    const { data: novaCandidatura, error: insertCandErr } = await adminClient
      .from('candidaturas')
      .insert({
        candidato_id: cand.id,
        cargo_id: null,
        loja_id: loja.id,
        curriculo_id: ultCurr?.id || null,
        vaga_interesse: cargoPretendido || 'Banco de Talentos Geral',
        status: 'Banco de Talentos',
        apresentacao_pessoal: sanitizarApresentacaoPessoal(payload.apresentacaoPessoal),
        experiencia_profissional: payload.experienciaProfissional || {},
        dados_formulario: {
          origem: 'mcp_migracao_drive',
          tipo_registro: 'banco_de_talentos',
          vaga_aberta: false,
          disparo_mensagens: false,
          notificacoes_automaticas_desativadas: true,
          nome: cand.nome,
          email: cand.email,
          telefone: cand.telefone,
          loja_nome: loja.nome,
          observacao_vinculo: 'Registro alocado diretamente no Banco de Talentos da unidade. Não associado a vaga aberta.'
        }
      })
      .select('id, candidato_id, loja_id, vaga_interesse, status, criado_em')
      .single();

    if (insertCandErr || !novaCandidatura) {
      return { statusCode: 500, data: { success: false, error: `Erro ao criar vínculo: ${insertCandErr?.message}` } };
    }

    registrarAuditoria({
      requestId: `req_${Date.now()}`,
      timestamp: new Date().toISOString(),
      operador: auth.context,
      operacao: 'VINCULAR_CANDIDATO_LOJA',
      registroAfetado: { tipo: 'candidaturas', id: novaCandidatura.id, lojaId: loja.id },
      resultado: 'SUCESSO',
      detalhes: { candidatoId: cand.id, lojaId: loja.id, cargoPretendido, tipoVinculo: 'banco_de_talentos', vagaAberta: false }
    });

    return {
      statusCode: 201,
      data: {
        success: true,
        tipo_vinculo: 'banco_de_talentos',
        vaga_aberta: false,
        notificacoes_disparadas: false,
        candidatura_id: novaCandidatura.id,
        candidato_id: cand.id,
        loja: { id: loja.id, nome: loja.nome, cidade: loja.cidade, estado: loja.estado },
        vaga_interesse: novaCandidatura.vaga_interesse,
        status: novaCandidatura.status,
        mensagem: `Candidato vinculado com sucesso ao Banco de Talentos da unidade ${loja.nome}. O registro não conta como candidatura a vaga aberta e não dispara mensagens automáticas.`
      }
    };
  } catch (err: any) {
    return { statusCode: 500, data: { success: false, error: err.message || 'Erro interno' } };
  }
}

/**
 * Handler HTTP principal para execução como Serverless Function (Vercel)
 */
export default async function vercelAdminCandidatosHandler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  try {
    const url = new URL(req.url, 'http://localhost');

    // 1. GET: Consultar candidato, currículos, duplicidade ou Listar candidatos
    if (req.method === 'GET') {
      const candidatoId = url.searchParams.get('id');
      const modo = url.searchParams.get('modo');

      if (modo === 'curriculos' || url.pathname.endsWith('/curriculos')) {
        const id = candidatoId || url.searchParams.get('candidatoId');
        if (!id) return res.status(400).json({ success: false, error: 'ID do candidato obrigatório.' });
        const result = await handleConsultarCurriculos(id, token);
        return res.status(result.statusCode).json(result.data);
      }

      if (modo === 'duplicidade' || url.searchParams.get('duplicidade')) {
        const result = await handleVerificarDuplicidade({
          email: url.searchParams.get('email') || undefined,
          telefone: url.searchParams.get('telefone') || undefined,
          cpf: url.searchParams.get('cpf') || undefined,
          nome: url.searchParams.get('nome') || undefined
        }, token);
        return res.status(result.statusCode).json(result.data);
      }

      if (candidatoId) {
        const result = await handleConsultarCandidato(candidatoId, token);
        return res.status(result.statusCode).json(result.data);
      }

      const filtros = {
        nome: url.searchParams.get('nome') || undefined,
        email: url.searchParams.get('email') || undefined,
        telefone: url.searchParams.get('telefone') || undefined,
        cidade: url.searchParams.get('cidade') || undefined,
        estado: url.searchParams.get('estado') || undefined,
        lojaId: url.searchParams.get('lojaId') || undefined,
        cargo: url.searchParams.get('cargo') || undefined,
        status: url.searchParams.get('status') || undefined,
        origem: url.searchParams.get('origem') || undefined,
        page: url.searchParams.get('page') ? Number(url.searchParams.get('page')) : 1,
        limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : 20
      };

      const result = await handleListarCandidatos(filtros, token);
      return res.status(result.statusCode).json(result.data);
    }

    // 2. POST: Criar candidato, anexar currículo, vincular loja ou verificar duplicidade
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const acao = body?.acao || url.searchParams.get('acao');

      if (acao === 'duplicidade' || acao === 'verificar_duplicidade') {
        const result = await handleVerificarDuplicidade(body, token);
        return res.status(result.statusCode).json(result.data);
      }

      if (acao === 'anexar_curriculo' || acao === 'curriculo' || acao === 'importar_curriculo_drive') {
        const result = await handleAnexarCurriculo(body, token);
        return res.status(result.statusCode).json(result.data);
      }

      if (acao === 'vincular_loja' || acao === 'vincular') {
        const result = await handleVincularCandidatoLoja(body, token);
        return res.status(result.statusCode).json(result.data);
      }

      const result = await handleCriarCandidato(body, token);
      return res.status(result.statusCode).json(result.data);
    }

    // 3. PATCH / PUT: Editar candidato
    if (req.method === 'PATCH' || req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const candidatoId = url.searchParams.get('id') || body?.candidatoId || body?.id;
      const result = await handleEditarCandidato({ ...body, candidatoId }, token);
      return res.status(result.statusCode).json(result.data);
    }

    res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'PUT']);
    return res.status(405).json({ success: false, mensagem: `Método ${req.method} não permitido.` });
  } catch (err: any) {
    return res.status(500).json({ success: false, mensagem: err?.message || 'Erro interno no servidor.' });
  }
}
