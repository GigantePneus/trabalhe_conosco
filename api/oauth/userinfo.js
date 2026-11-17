// mcp-server/src/oauth.ts
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
function getSigningSecret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "gigante_default_secure_secret_key_2026";
}
function verifyHmacPayload(token, expectedType) {
  if (!token || !token.startsWith(`gig_${expectedType}_`)) return null;
  const parts = token.slice(`gig_${expectedType}_`.length).split(".");
  if (parts.length !== 2) return null;
  const [dataB64, signature] = parts;
  const secret = getSigningSecret();
  const expectedHmac = createHmac("sha256", secret).update(dataB64).digest("base64url");
  if (signature !== expectedHmac) return null;
  try {
    const jsonStr = Buffer.from(dataB64, "base64url").toString("utf-8");
    const data = JSON.parse(jsonStr);
    if (data.__typ !== expectedType) return null;
    if (typeof data.__exp === "number" && data.__exp < Math.floor(Date.now() / 1e3)) return null;
    return data;
  } catch {
    return null;
  }
}
var authCodes = /* @__PURE__ */ new Map();
var activeTokens = /* @__PURE__ */ new Map();
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of authCodes.entries()) {
    if (entry.expiresAt <= now) authCodes.delete(code);
  }
  for (const [token, entry] of activeTokens.entries()) {
    if (entry.expiresAt <= now) activeTokens.delete(token);
  }
}, 5 * 60 * 1e3).unref();
function getSupabaseClients() {
  const supaUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !serviceKey) {
    throw new Error("CONFIG_ERROR: Vari\xE1veis de ambiente do Supabase ausentes no MCP Server.");
  }
  const adminClient = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });
  const anonClient = createClient(supaUrl, anonKey || serviceKey, { auth: { persistSession: false } });
  return { adminClient, anonClient };
}
async function authenticateOperator(email, password, existingToken) {
  const { adminClient, anonClient } = getSupabaseClients();
  let userId;
  let userEmail;
  let sessionToken;
  if (existingToken) {
    const { data: userData, error: userErr } = await adminClient.auth.getUser(existingToken);
    if (userErr || !userData?.user) {
      return { success: false, error: "Sess\xE3o do Supabase inv\xE1lida ou expirada." };
    }
    userId = userData.user.id;
    userEmail = userData.user.email || email;
    sessionToken = existingToken;
  } else if (email && password) {
    const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    if (signInErr || !signInData?.user || !signInData?.session) {
      return { success: false, error: "Credenciais administrativas inv\xE1lidas. Verifique e-mail e senha." };
    }
    userId = signInData.user.id;
    userEmail = signInData.user.email || email;
    sessionToken = signInData.session.access_token;
  } else {
    return { success: false, error: "E-mail e senha s\xE3o obrigat\xF3rios." };
  }
  const { data: perfil, error: perfilErr } = await adminClient.from("perfis").select("id, nome, email, role, ativo").eq("id", userId).maybeSingle();
  if (perfilErr || !perfil) {
    return { success: false, error: "Perfil de usu\xE1rio n\xE3o encontrado no sistema Trabalhe Conosco." };
  }
  if (!perfil.ativo) {
    return { success: false, error: "Este usu\xE1rio est\xE1 desativado no sistema." };
  }
  const role = perfil.role;
  const isMasterOrRh = role === "franqueadora_admin" || role === "rh_corporativo";
  let lojasAutorizadasIds = [];
  if (!isMasterOrRh) {
    const { data: ulData, error: ulErr } = await adminClient.from("usuario_lojas").select("loja_id").eq("user_id", userId);
    if (ulErr) {
      return { success: false, error: "Erro ao consultar unidades autorizadas." };
    }
    lojasAutorizadasIds = (ulData || []).map((u) => u.loja_id).filter(Boolean);
    if (lojasAutorizadasIds.length === 0) {
      return { success: false, error: "Usu\xE1rio sem unidades autorizadas vinculadas no sistema." };
    }
  }
  return {
    success: true,
    context: {
      userId,
      email: userEmail,
      nome: perfil.nome || "Operador RH",
      role,
      isMasterOrRh,
      lojasAutorizadasIds,
      supabaseSessionToken: sessionToken
    }
  };
}
async function resolveOAuthTokenContext(token) {
  const cleanToken = token.replace(/^Bearer\s+/i, "").trim();
  if (!cleanToken) return null;
  const entry = activeTokens.get(cleanToken);
  if (entry) {
    if (entry.expiresAt > Date.now()) {
      return entry.context;
    }
    activeTokens.delete(cleanToken);
  }
  const hmacData = verifyHmacPayload(cleanToken, "at");
  if (hmacData && hmacData.context) {
    return hmacData.context;
  }
  const auth = await authenticateOperator("", void 0, cleanToken);
  if (auth.success && auth.context) {
    return auth.context;
  }
  return null;
}
async function handleOAuthUserinfo(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization");
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const context = await resolveOAuthTokenContext(token);
  if (!context) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_token", error_description: "Token inv\xE1lido ou expirado." }));
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    sub: context.userId,
    email: context.email,
    name: context.nome,
    role: context.role,
    is_master: context.isMasterOrRh,
    lojas_autorizadas: context.lojasAutorizadasIds,
    aud: "gigante-pneus-mcp"
  }, null, 2));
}

// src-api/oauth/userinfo.ts
async function oauthUserinfoHandler(req, res) {
  return handleOAuthUserinfo(req, res);
}
export {
  oauthUserinfoHandler as default
};
