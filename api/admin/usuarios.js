// src-api/admin/usuarios.ts
import { createClient } from "@supabase/supabase-js";
var supabaseAdminInstance = null;
function getSupabaseAdmin() {
  if (supabaseAdminInstance) return supabaseAdminInstance;
  const supaUrl = process.env.SUPABASE_INTERNAL_URL || process.env.VITE_SUPABASE_URL;
  const supaServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !supaServiceKey) {
    throw new Error("CONFIG_ERROR: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente.");
  }
  supabaseAdminInstance = createClient(supaUrl, supaServiceKey, {
    auth: { persistSession: false }
  });
  return supabaseAdminInstance;
}
async function verifyFranqueadoraAdmin(token) {
  const cleanToken = token?.trim();
  if (!cleanToken) {
    return { authorized: false, error: "ACESSO_NEGADO: Token de autentica\xE7\xE3o n\xE3o fornecido." };
  }
  const adminClient = getSupabaseAdmin();
  const { data: userData, error: userError } = await adminClient.auth.getUser(cleanToken);
  if (userError || !userData?.user) {
    return { authorized: false, error: "ACESSO_NEGADO: Sess\xE3o de usu\xE1rio inv\xE1lida ou expirada." };
  }
  const { data: perfil, error: perfilError } = await adminClient.from("perfis").select("role, ativo").eq("id", userData.user.id).maybeSingle();
  if (perfilError || !perfil || perfil.role !== "franqueadora_admin" || !perfil.ativo) {
    return { authorized: false, error: "ACESSO_NEGADO: Apenas administradores corporativos (franqueadora_admin) podem gerenciar acessos." };
  }
  return { authorized: true, adminId: userData.user.id };
}
async function handleListarUsuarios(token) {
  const authCheck = await verifyFranqueadoraAdmin(token);
  if (!authCheck.authorized) {
    return { statusCode: 403, data: { success: false, mensagem: authCheck.error } };
  }
  const adminClient = getSupabaseAdmin();
  const { data: perfis, error: perfisErr } = await adminClient.from("perfis").select("id, nome, email, role, ativo, criado_em").order("nome", { ascending: true });
  if (perfisErr) {
    return { statusCode: 500, data: { success: false, mensagem: "Erro ao consultar perfis de usu\xE1rios." } };
  }
  const { data: ulData, error: ulErr } = await adminClient.from("usuario_lojas").select("user_id, loja_id");
  const { data: lojasData } = await adminClient.from("lojas").select("id, nome, cidade, estado");
  const lojasMap = new Map((lojasData || []).map((l) => [l.id, l]));
  const userLojasMap = /* @__PURE__ */ new Map();
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
  const usuarios = (perfis || []).map((p) => ({
    id: p.id,
    email: p.email,
    nome: p.nome || "Sem nome informado",
    role: p.role,
    ativo: p.ativo ?? true,
    criado_em: p.criado_em,
    lojas: userLojasMap.get(p.id) || []
  }));
  return { statusCode: 200, data: { success: true, usuarios } };
}
async function handleCriarUsuario(params, token) {
  const authCheck = await verifyFranqueadoraAdmin(token);
  if (!authCheck.authorized) {
    return { statusCode: 403, data: { success: false, mensagem: authCheck.error || "Acesso negado." } };
  }
  const email = params.email?.trim().toLowerCase();
  const nome = params.nome?.trim();
  const role = params.role;
  const lojaIds = Array.isArray(params.lojaIds) ? params.lojaIds.filter(Boolean) : [];
  if (!email || !email.includes("@") || !nome) {
    return { statusCode: 400, data: { success: false, mensagem: "Nome completo e e-mail corporativo v\xE1lido s\xE3o obrigat\xF3rios." } };
  }
  if (role !== "franqueado" && role !== "gerente") {
    return { statusCode: 400, data: { success: false, mensagem: "Perfil inv\xE1lido. Nesta tela s\xE3o permitidos apenas franqueado ou gerente." } };
  }
  if (lojaIds.length === 0) {
    return { statusCode: 400, data: { success: false, mensagem: "Selecione ao menos uma unidade para vincular ao usu\xE1rio." } };
  }
  const adminClient = getSupabaseAdmin();
  const { data: lojasEncontradas, error: lojasErr } = await adminClient.from("lojas").select("id, nome, ativa").in("id", lojaIds).eq("ativa", true);
  if (lojasErr || !lojasEncontradas || lojasEncontradas.length !== lojaIds.length) {
    return { statusCode: 400, data: { success: false, mensagem: "Uma ou mais unidades informadas n\xE3o existem ou est\xE3o inativas no sistema." } };
  }
  if (params.simulado) {
    return {
      statusCode: 201,
      data: {
        success: true,
        usuarioId: "simulated-user-" + Math.random().toString(36).substring(2, 9),
        mensagem: `[SIMULA\xC7\xC3O] Convite validado com sucesso para ${nome} (${email}) com perfil '${role}' vinculado a ${lojaIds.length} unidade(s).`
      }
    };
  }
  const targetRedirectUrl = params.redirectTo?.trim() || (process.env.APP_URL ? `${process.env.APP_URL}/reset-password` : "https://trabalheconosco.gigantepneus.com.br/reset-password");
  const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { nome },
    redirectTo: targetRedirectUrl
  });
  if (inviteErr || !inviteData?.user) {
    return {
      statusCode: 400,
      data: {
        success: false,
        mensagem: `N\xE3o foi poss\xEDvel enviar o convite ao usu\xE1rio: ${inviteErr?.message || "Erro desconhecido"}`
      }
    };
  }
  const newUserId = inviteData.user.id;
  try {
    const { error: perfilErr } = await adminClient.from("perfis").insert({
      id: newUserId,
      nome,
      email,
      role,
      ativo: params.ativo !== false
    });
    if (perfilErr) {
      throw new Error(`Erro ao gravar perfil: ${perfilErr.message}`);
    }
    const inserts = lojaIds.map((loja_id) => ({
      user_id: newUserId,
      loja_id
    }));
    const { error: ulErr } = await adminClient.from("usuario_lojas").insert(inserts);
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
  } catch (err) {
    await adminClient.auth.admin.deleteUser(newUserId).catch(() => {
    });
    return {
      statusCode: 500,
      data: { success: false, mensagem: `Falha na grava\xE7\xE3o do perfil ou associa\xE7\xF5es: ${err.message}` }
    };
  }
}
async function handleAtualizarUsuario(params, token) {
  const authCheck = await verifyFranqueadoraAdmin(token);
  if (!authCheck.authorized) {
    return { statusCode: 403, data: { success: false, mensagem: authCheck.error || "Acesso negado." } };
  }
  const { userId, nome, role, lojaIds, ativo } = params;
  if (!userId) {
    return { statusCode: 400, data: { success: false, mensagem: "Identificador do usu\xE1rio (userId) obrigat\xF3rio." } };
  }
  const adminClient = getSupabaseAdmin();
  const { data: perfilAtual, error: fetchErr } = await adminClient.from("perfis").select("*").eq("id", userId).single();
  if (fetchErr || !perfilAtual) {
    return { statusCode: 404, data: { success: false, mensagem: "Usu\xE1rio n\xE3o encontrado." } };
  }
  if (perfilAtual.role === "franqueadora_admin" && authCheck.adminId !== userId) {
    return { statusCode: 403, data: { success: false, mensagem: "N\xE3o \xE9 permitido modificar administradores master por este canal." } };
  }
  const updates = {};
  if (nome !== void 0) updates.nome = nome.trim();
  if (ativo !== void 0) updates.ativo = ativo;
  if (role !== void 0 && (role === "franqueado" || role === "gerente")) updates.role = role;
  if (Object.keys(updates).length > 0) {
    updates.atualizado_em = (/* @__PURE__ */ new Date()).toISOString();
    const { error: updErr } = await adminClient.from("perfis").update(updates).eq("id", userId);
    if (updErr) {
      return { statusCode: 500, data: { success: false, mensagem: `Erro ao atualizar dados cadastrais: ${updErr.message}` } };
    }
  }
  if (lojaIds !== void 0 && Array.isArray(lojaIds)) {
    const validLojaIds = lojaIds.filter(Boolean);
    if (validLojaIds.length === 0) {
      return { statusCode: 400, data: { success: false, mensagem: "Ao menos uma unidade deve ser vinculada ao usu\xE1rio." } };
    }
    const { data: lojasValidas, error: errVal } = await adminClient.from("lojas").select("id").in("id", validLojaIds).eq("ativa", true);
    if (errVal || !lojasValidas || lojasValidas.length !== validLojaIds.length) {
      return { statusCode: 400, data: { success: false, mensagem: "Uma ou mais unidades informadas n\xE3o existem ou est\xE3o inativas." } };
    }
    await adminClient.from("usuario_lojas").delete().eq("user_id", userId);
    const newAssocs = validLojaIds.map((loja_id) => ({
      user_id: userId,
      loja_id
    }));
    const { error: insErr } = await adminClient.from("usuario_lojas").insert(newAssocs);
    if (insErr) {
      return { statusCode: 500, data: { success: false, mensagem: `Erro ao atualizar unidades autorizadas: ${insErr.message}` } };
    }
  }
  return {
    statusCode: 200,
    data: { success: true, mensagem: "Usu\xE1rio e permiss\xF5es de unidades atualizados com sucesso." }
  };
}
async function vercelAdminUsuariosHandler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  try {
    if (req.method === "GET") {
      const result = await handleListarUsuarios(token);
      return res.status(result.statusCode).json(result.data);
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const result = await handleCriarUsuario(body, token);
      return res.status(result.statusCode).json(result.data);
    }
    if (req.method === "PATCH" || req.method === "PUT") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const result = await handleAtualizarUsuario(body, token);
      return res.status(result.statusCode).json(result.data);
    }
    res.setHeader("Allow", ["GET", "POST", "PATCH", "PUT"]);
    return res.status(405).json({ success: false, mensagem: `M\xE9todo ${req.method} n\xE3o permitido.` });
  } catch (err) {
    return res.status(500).json({ success: false, mensagem: err?.message || "Erro interno no servidor." });
  }
}
export {
  vercelAdminUsuariosHandler as default,
  handleAtualizarUsuario,
  handleCriarUsuario,
  handleListarUsuarios
};
