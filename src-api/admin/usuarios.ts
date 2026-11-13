import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseAdminInstance: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (supabaseAdminInstance) return supabaseAdminInstance;

  const supaUrl = process.env.SUPABASE_INTERNAL_URL || process.env.VITE_SUPABASE_URL;
  const supaServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supaUrl || !supaServiceKey) {
    throw new Error('CONFIG_ERROR: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente.');
  }

  supabaseAdminInstance = createClient(supaUrl, supaServiceKey, {
    auth: { persistSession: false }
  });
  return supabaseAdminInstance;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  nome: string;
  role: string;
  ativo: boolean;
  criado_em: string;
  lojas: Array<{ id: string; nome: string; cidade: string; estado: string }>;
}

export interface CriarUsuarioParams {
  email: string;
  nome: string;
  role: 'franqueado' | 'gerente';
  lojaIds: string[];
  ativo?: boolean;
  redirectTo?: string;
  simulado?: boolean;
}

export interface AtualizarUsuarioParams {
  userId: string;
  nome?: string;
  role?: 'franqueado' | 'gerente';
  lojaIds?: string[];
  ativo?: boolean;
}

/**
 * Validador estrito de autorização: apenas usuários autenticados com perfil 'franqueadora_admin' ativo.
 */
async function verifyFranqueadoraAdmin(token?: string | null): Promise<{ authorized: boolean; adminId?: string; error?: string }> {
  const cleanToken = token?.trim();
  if (!cleanToken) {
    return { authorized: false, error: 'ACESSO_NEGADO: Token de autenticação não fornecido.' };
  }

  const adminClient = getSupabaseAdmin();
  const { data: userData, error: userError } = await adminClient.auth.getUser(cleanToken);
  if (userError || !userData?.user) {
    return { authorized: false, error: 'ACESSO_NEGADO: Sessão de usuário inválida ou expirada.' };
  }

  const { data: perfil, error: perfilError } = await adminClient
    .from('perfis')
    .select('role, ativo')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (perfilError || !perfil || perfil.role !== 'franqueadora_admin' || !perfil.ativo) {
    return { authorized: false, error: 'ACESSO_NEGADO: Apenas administradores corporativos (franqueadora_admin) podem gerenciar acessos.' };
  }

  return { authorized: true, adminId: userData.user.id };
}

/**
 * Endpoint para listar usuários institucionais e suas lojas associadas.
 */
export async function handleListarUsuarios(token?: string | null): Promise<{
  statusCode: number;
  data: { success: boolean; usuarios?: AdminUserListItem[]; mensagem?: string };
}> {
  const authCheck = await verifyFranqueadoraAdmin(token);
  if (!authCheck.authorized) {
    return { statusCode: 403, data: { success: false, mensagem: authCheck.error } };
  }

  const adminClient = getSupabaseAdmin();

  // 1. Busca todos os perfis cadastrados
  const { data: perfis, error: perfisErr } = await adminClient
    .from('perfis')
    .select('id, nome, email, role, ativo, criado_em')
    .order('nome', { ascending: true });

  if (perfisErr) {
    return { statusCode: 500, data: { success: false, mensagem: 'Erro ao consultar perfis de usuários.' } };
  }

  // 2. Busca todas as associações de lojas
  const { data: ulData, error: ulErr } = await adminClient
    .from('usuario_lojas')
    .select('user_id, loja_id');

  // 3. Busca mapa de lojas
  const { data: lojasData } = await adminClient
    .from('lojas')
    .select('id, nome, cidade, estado');

  const lojasMap = new Map((lojasData || []).map(l => [l.id, l]));

  const userLojasMap = new Map<string, Array<{ id: string; nome: string; cidade: string; estado: string }>>();
  if (ulData) {
    for (const item of ulData) {
      const loja = lojasMap.get(item.loja_id);
      if (loja) {
        const arr = userLojasMap.get(item.user_id) || [];
        arr.push(loja);
        userLojasMap.set(item.user_id, arr);
      }
    }
  }

  const usuarios: AdminUserListItem[] = (perfis || []).map(p => ({
    id: p.id,
    email: p.email,
    nome: p.nome || 'Sem nome informado',
    role: p.role,
    ativo: p.ativo ?? true,
    criado_em: p.criado_em,
    lojas: userLojasMap.get(p.id) || []
  }));

  return { statusCode: 200, data: { success: true, usuarios } };
}

/**
 * Endpoint para criar usuário com perfil franqueado/gerente e vincular unidades autorizadas.
 */
export async function handleCriarUsuario(
  params: CriarUsuarioParams,
  token?: string | null
): Promise<{
  statusCode: number;
  data: { success: boolean; usuarioId?: string; mensagem: string };
}> {
  const authCheck = await verifyFranqueadoraAdmin(token);
  if (!authCheck.authorized) {
    return { statusCode: 403, data: { success: false, mensagem: authCheck.error || 'Acesso negado.' } };
  }

  const email = params.email?.trim().toLowerCase();
  const nome = params.nome?.trim();
  const role = params.role;
  const lojaIds = Array.isArray(params.lojaIds) ? params.lojaIds.filter(Boolean) : [];

  if (!email || !email.includes('@') || !nome) {
    return { statusCode: 400, data: { success: false, mensagem: 'Nome completo e e-mail corporativo válido são obrigatórios.' } };
  }

  if (role !== 'franqueado' && role !== 'gerente') {
    return { statusCode: 400, data: { success: false, mensagem: 'Perfil inválido. Nesta tela são permitidos apenas franqueado ou gerente.' } };
  }

  if (lojaIds.length === 0) {
    return { statusCode: 400, data: { success: false, mensagem: 'Selecione ao menos uma unidade para vincular ao usuário.' } };
  }

  const adminClient = getSupabaseAdmin();

  // Valida se as lojas existem e estão ativas
  const { data: lojasEncontradas, error: lojasErr } = await adminClient
    .from('lojas')
    .select('id, nome, ativa')
    .in('id', lojaIds)
    .eq('ativa', true);

  if (lojasErr || !lojasEncontradas || lojasEncontradas.length !== lojaIds.length) {
    return { statusCode: 400, data: { success: false, mensagem: 'Uma ou mais unidades informadas não existem ou estão inativas no sistema.' } };
  }

  // Se for simulação controlada para testes automatizados, valida parâmetros e lojas sem disparar SMTP real
  if (params.simulado) {
    return {
      statusCode: 201,
      data: {
        success: true,
        usuarioId: 'simulated-user-' + Math.random().toString(36).substring(2, 9),
        mensagem: `[SIMULAÇÃO] Convite validado com sucesso para ${nome} (${email}) com perfil '${role}' vinculado a ${lojaIds.length} unidade(s).`
      }
    };
  }

  // 1. Envia convite de acesso oficial via Supabase Auth Admin API (inviteUserByEmail)
  // O usuário recebe um e-mail com link exclusivo para definição de sua senha pessoal.
  const targetRedirectUrl = params.redirectTo?.trim() || 
    (process.env.APP_URL ? `${process.env.APP_URL}/reset-password` : 'https://trabalheconosco.gigantepneus.com.br/reset-password');

  const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { nome },
    redirectTo: targetRedirectUrl
  });

  if (inviteErr || !inviteData?.user) {
    return {
      statusCode: 400,
      data: {
        success: false,
        mensagem: `Não foi possível enviar o convite ao usuário: ${inviteErr?.message || 'Erro desconhecido'}`
      }
    };
  }

  const newUserId = inviteData.user.id;

  try {
    // 2. Cria registro em public.perfis
    const { error: perfilErr } = await adminClient
      .from('perfis')
      .insert({
        id: newUserId,
        nome,
        email,
        role,
        ativo: params.ativo !== false
      });

    if (perfilErr) {
      throw new Error(`Erro ao gravar perfil: ${perfilErr.message}`);
    }

    // 3. Cria associações em public.usuario_lojas
    const inserts = lojaIds.map(loja_id => ({
      user_id: newUserId,
      loja_id
    }));

    const { error: ulErr } = await adminClient
      .from('usuario_lojas')
      .insert(inserts);

    if (ulErr) {
      throw new Error(`Erro ao associar unidades: ${ulErr.message}`);
    }

    return {
      statusCode: 201,
      data: {
        success: true,
        usuarioId: newUserId,
        mensagem: `Convite enviado com sucesso para '${nome}' (${email}) com perfil '${role}' e vinculado a ${lojaIds.length} unidade(s).`
      }
    };
  } catch (err: any) {
    // Rollback atômico: desfaz o convite em auth.users caso haja falha ao persistir perfil/vínculos
    await adminClient.auth.admin.deleteUser(newUserId).catch(() => {});
    return {
      statusCode: 500,
      data: { success: false, mensagem: `Falha na gravação do perfil ou associações: ${err.message}` }
    };
  }
}

/**
 * Endpoint para atualizar unidades autorizadas ou situação de um usuário existente.
 */
export async function handleAtualizarUsuario(
  params: AtualizarUsuarioParams,
  token?: string | null
): Promise<{
  statusCode: number;
  data: { success: boolean; mensagem: string };
}> {
  const authCheck = await verifyFranqueadoraAdmin(token);
  if (!authCheck.authorized) {
    return { statusCode: 403, data: { success: false, mensagem: authCheck.error || 'Acesso negado.' } };
  }

  const { userId, nome, role, lojaIds, ativo } = params;
  if (!userId) {
    return { statusCode: 400, data: { success: false, mensagem: 'Identificador do usuário (userId) obrigatório.' } };
  }

  const adminClient = getSupabaseAdmin();

  // 1. Busca perfil atual
  const { data: perfilAtual, error: fetchErr } = await adminClient
    .from('perfis')
    .select('*')
    .eq('id', userId)
    .single();

  if (fetchErr || !perfilAtual) {
    return { statusCode: 404, data: { success: false, mensagem: 'Usuário não encontrado.' } };
  }

  // Impede alteração de contas master franqueadora_admin por este fluxo simplificado
  if (perfilAtual.role === 'franqueadora_admin' && authCheck.adminId !== userId) {
    return { statusCode: 403, data: { success: false, mensagem: 'Não é permitido modificar administradores master por este canal.' } };
  }

  // Atualiza perfil se necessário
  const updates: Record<string, any> = {};
  if (nome !== undefined) updates.nome = nome.trim();
  if (ativo !== undefined) updates.ativo = ativo;
  if (role !== undefined && (role === 'franqueado' || role === 'gerente')) updates.role = role;

  if (Object.keys(updates).length > 0) {
    updates.atualizado_em = new Date().toISOString();
    const { error: updErr } = await adminClient
      .from('perfis')
      .update(updates)
      .eq('id', userId);

    if (updErr) {
      return { statusCode: 500, data: { success: false, mensagem: `Erro ao atualizar dados cadastrais: ${updErr.message}` } };
    }
  }

  // Atualiza vínculos de lojas se lojaIds foi informado
  if (lojaIds !== undefined && Array.isArray(lojaIds)) {
    const validLojaIds = lojaIds.filter(Boolean);
    if (validLojaIds.length === 0) {
      return { statusCode: 400, data: { success: false, mensagem: 'Ao menos uma unidade deve ser vinculada ao usuário.' } };
    }

    // Valida se as novas lojas existem e estão ativas
    const { data: lojasValidas, error: errVal } = await adminClient
      .from('lojas')
      .select('id')
      .in('id', validLojaIds)
      .eq('ativa', true);

    if (errVal || !lojasValidas || lojasValidas.length !== validLojaIds.length) {
      return { statusCode: 400, data: { success: false, mensagem: 'Uma ou mais unidades informadas não existem ou estão inativas.' } };
    }

    // Remove associações antigas
    await adminClient.from('usuario_lojas').delete().eq('user_id', userId);

    // Insere as novas associações
    const newAssocs = validLojaIds.map(loja_id => ({
      user_id: userId,
      loja_id
    }));

    const { error: insErr } = await adminClient.from('usuario_lojas').insert(newAssocs);
    if (insErr) {
      return { statusCode: 500, data: { success: false, mensagem: `Erro ao atualizar unidades autorizadas: ${insErr.message}` } };
    }
  }

  return {
    statusCode: 200,
    data: { success: true, mensagem: 'Usuário e permissões de unidades atualizados com sucesso.' }
  };
}

/**
 * Handler HTTP Vercel Serverless
 */
export default async function vercelAdminUsuariosHandler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  try {
    if (req.method === 'GET') {
      const result = await handleListarUsuarios(token);
      return res.status(result.statusCode).json(result.data);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const result = await handleCriarUsuario(body, token);
      return res.status(result.statusCode).json(result.data);
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const result = await handleAtualizarUsuario(body, token);
      return res.status(result.statusCode).json(result.data);
    }

    res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'PUT']);
    return res.status(405).json({ success: false, mensagem: `Método ${req.method} não permitido.` });
  } catch (err: any) {
    return res.status(500).json({ success: false, mensagem: err?.message || 'Erro interno no servidor.' });
  }
}
