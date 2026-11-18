// mcp-server/src/oauth.ts
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
function getSigningSecret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "gigante_default_secure_secret_key_2026";
}
function signHmacPayload(type, payload, ttlSeconds) {
  const secret = getSigningSecret();
  const exp = Math.floor(Date.now() / 1e3) + ttlSeconds;
  const data = { ...payload, __typ: type, __exp: exp, __jti: randomBytes(8).toString("hex") };
  const jsonStr = JSON.stringify(data);
  const dataB64 = Buffer.from(jsonStr).toString("base64url");
  const hmac = createHmac("sha256", secret).update(dataB64).digest("base64url");
  return `gig_${type}_${dataB64}.${hmac}`;
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
var refreshTokens = /* @__PURE__ */ new Map();
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
function verifyPkceS256(verifier, challenge) {
  if (!verifier || !challenge) return false;
  const hash = createHash("sha256").update(verifier).digest("base64url");
  return hash === challenge;
}
async function getRequestBody(req) {
  if (req.body !== void 0 && req.body !== null) {
    if (typeof req.body === "string") return req.body;
    if (typeof req.body === "object") {
      const contentType = req.headers["content-type"] || "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        return new URLSearchParams(req.body).toString();
      }
      return JSON.stringify(req.body);
    }
  }
  return new Promise((resolve) => {
    let bodyStr = "";
    req.on("data", (c) => {
      bodyStr += c;
    });
    req.on("end", () => resolve(bodyStr));
    req.on("error", () => resolve(""));
    if (req.readableEnded) {
      resolve(bodyStr);
    }
  });
}
function handleOAuthMetadata(req, res, issuerUrl) {
  const metadata = {
    issuer: issuerUrl,
    authorization_endpoint: `${issuerUrl}/oauth/authorize`,
    token_endpoint: `${issuerUrl}/oauth/token`,
    revocation_endpoint: `${issuerUrl}/oauth/revoke`,
    userinfo_endpoint: `${issuerUrl}/oauth/userinfo`,
    jwks_uri: `${issuerUrl}/oauth/jwks`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: ["openid", "profile", "email", "admin", "vagas:read", "vagas:write"],
    service_documentation: `${issuerUrl}/health`
  };
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=3600",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(metadata, null, 2));
}
function renderAuthorizeHtml(params) {
  const errorHtml = params.errorMessage ? `<div style="background-color: #fee2e2; border-left: 4px solid #ef4444; color: #b91c1c; padding: 12px; margin-bottom: 20px; border-radius: 4px; font-size: 14px;">
        \u26A0\uFE0F ${params.errorMessage}
      </div>` : "";
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gigante Pneus \u2014 Autoriza\xE7\xE3o ChatGPT</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background-color: #1e293b; border: 1px solid #334155; border-radius: 12px; width: 100%; max-width: 440px; padding: 32px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
    .header { text-align: center; margin-bottom: 24px; }
    .badge { display: inline-block; background-color: #facc15; color: #000; font-weight: 800; font-size: 11px; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
    h1 { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 8px; }
    p.sub { font-size: 13px; color: #94a3b8; line-height: 1.5; }
    .scopes { background-color: #0f172a; border-radius: 8px; padding: 14px; margin: 20px 0; font-size: 13px; }
    .scopes-title { font-weight: 600; color: #facc15; margin-bottom: 6px; }
    .scope-item { display: flex; align-items: center; gap: 8px; color: #cbd5e1; margin-top: 4px; }
    .form-group { margin-bottom: 16px; }
    label { display: block; font-size: 13px; font-weight: 500; color: #cbd5e1; margin-bottom: 6px; }
    input[type="email"], input[type="password"] { width: 100%; padding: 10px 12px; background-color: #0f172a; border: 1px solid #475569; border-radius: 6px; color: #fff; font-size: 14px; outline: none; transition: border-color 0.2s; }
    input:focus { border-color: #facc15; }
    .actions { margin-top: 24px; display: flex; flex-direction: column; gap: 10px; }
    button.btn-primary { background-color: #facc15; color: #000; font-weight: 700; border: none; padding: 12px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: background-color 0.2s; }
    button.btn-primary:hover { background-color: #eab308; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="badge">Gigante Pneus</div>
      <h1>Conectar ao ChatGPT</h1>
      <p class="sub">O assistente de IA est\xE1 solicitando autoriza\xE7\xE3o para gerenciar vagas e unidades no sistema Trabalhe Conosco.</p>
    </div>

    ${errorHtml}

    <div class="scopes">
      <div class="scopes-title">Permiss\xF5es Solicitadas:</div>
      <div class="scope-item">\u2713 Consulta de lojas e unidades autorizadas</div>
      <div class="scope-item">\u2713 Gest\xE3o de vagas (cria\xE7\xE3o em rascunho)</div>
      <div class="scope-item">\u2713 Isolamento rigoroso de permiss\xF5es e franquias</div>
    </div>

    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${encodeURIComponent(params.clientId || "")}">
      <input type="hidden" name="redirect_uri" value="${encodeURIComponent(params.redirectUri || "")}">
      <input type="hidden" name="state" value="${encodeURIComponent(params.state || "")}">
      <input type="hidden" name="scope" value="${encodeURIComponent(params.scope || "")}">
      <input type="hidden" name="code_challenge" value="${encodeURIComponent(params.codeChallenge || "")}">
      <input type="hidden" name="code_challenge_method" value="${encodeURIComponent(params.codeChallengeMethod || "S256")}">

      <div class="form-group">
        <label for="email">E-mail Administrativo</label>
        <input type="email" id="email" name="email" required placeholder="seu.email@gigantepneus.com.br" autofocus>
      </div>

      <div class="form-group">
        <label for="password">Senha de Acesso</label>
        <input type="password" id="password" name="password" required placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022">
      </div>

      <div class="actions">
        <button type="submit" class="btn-primary">Autorizar Conex\xE3o Segura</button>
      </div>
    </form>

    <div class="footer">
      Ambiente Seguro com Autentica\xE7\xE3o Supabase & PKCE S256
    </div>
  </div>
</body>
</html>`;
}
async function handleOAuthAuthorize(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET") {
    const clientId = url.searchParams.get("client_id") || "chatgpt-client";
    const redirectUri = url.searchParams.get("redirect_uri") || "";
    const state = url.searchParams.get("state") || "";
    const scope = url.searchParams.get("scope") || "admin";
    const codeChallenge = url.searchParams.get("code_challenge") || "";
    const codeChallengeMethod = url.searchParams.get("code_challenge_method") || "S256";
    const html = renderAuthorizeHtml({
      clientId,
      redirectUri,
      state,
      scope,
      codeChallenge,
      codeChallengeMethod
    });
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }
  if (req.method === "POST") {
    const bodyStr = await getRequestBody(req);
    let email = "";
    let password = "";
    let sessionToken = "";
    let clientId = "";
    let redirectUri = "";
    let state = "";
    let scope = "";
    let codeChallenge = "";
    let codeChallengeMethod = "S256";
    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("application/json")) {
      try {
        const body = JSON.parse(bodyStr || "{}");
        email = body.email;
        password = body.password;
        sessionToken = body.session_token || "";
        clientId = body.client_id || "chatgpt-client";
        redirectUri = body.redirect_uri || "";
        state = body.state || "";
        scope = body.scope || "admin";
        codeChallenge = body.code_challenge || "";
        codeChallengeMethod = body.code_challenge_method || "S256";
      } catch {
      }
    } else {
      const formData = new URLSearchParams(bodyStr);
      email = formData.get("email") || "";
      password = formData.get("password") || "";
      sessionToken = formData.get("session_token") || "";
      clientId = formData.get("client_id") || "chatgpt-client";
      redirectUri = decodeURIComponent(formData.get("redirect_uri") || "");
      state = formData.get("state") || "";
      scope = formData.get("scope") || "admin";
      codeChallenge = formData.get("code_challenge") || "";
      codeChallengeMethod = formData.get("code_challenge_method") || "S256";
    }
    const auth = await authenticateOperator(email, password, sessionToken);
    if (!auth.success || !auth.context) {
      if (contentType.includes("application/json")) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "access_denied", error_description: auth.error || "Credenciais inv\xE1lidas" }));
        return;
      }
      const html = renderAuthorizeHtml({
        clientId,
        redirectUri,
        state,
        scope,
        codeChallenge,
        codeChallengeMethod,
        errorMessage: auth.error
      });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    const codePayload = {
      clientId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod: "S256",
      scope,
      context: auth.context
    };
    const code = signHmacPayload("code", codePayload, 300);
    const expiresAt = Date.now() + 5 * 60 * 1e3;
    authCodes.set(code, {
      ...codePayload,
      code,
      expiresAt
    });
    if (contentType.includes("application/json")) {
      const targetUrl = new URL(redirectUri || "http://localhost");
      targetUrl.searchParams.set("code", code);
      if (state) targetUrl.searchParams.set("state", state);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        code,
        state,
        redirect_url: targetUrl.toString()
      }));
      return;
    }
    if (redirectUri) {
      const targetUrl = new URL(redirectUri);
      targetUrl.searchParams.set("code", code);
      if (state) targetUrl.searchParams.set("state", state);
      res.writeHead(302, { Location: targetUrl.toString() });
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code, state }));
  }
}
async function handleOAuthToken(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }
  const bodyStr = await getRequestBody(req);
  let grantType = "";
  let code = "";
  let redirectUri = "";
  let clientId = "";
  let codeVerifier = "";
  let refreshToken = "";
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("application/json")) {
    try {
      const body = JSON.parse(bodyStr || "{}");
      grantType = body.grant_type;
      code = body.code;
      redirectUri = body.redirect_uri;
      clientId = body.client_id;
      codeVerifier = body.code_verifier;
      refreshToken = body.refresh_token;
    } catch {
    }
  } else {
    const formData = new URLSearchParams(bodyStr);
    grantType = formData.get("grant_type") || "";
    code = formData.get("code") || "";
    redirectUri = formData.get("redirect_uri") || "";
    clientId = formData.get("client_id") || "";
    codeVerifier = formData.get("code_verifier") || "";
    refreshToken = formData.get("refresh_token") || "";
  }
  if (grantType === "authorization_code") {
    if (!code) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_request", error_description: "Par\xE2metro code ausente." }));
      return;
    }
    let entry = authCodes.get(code);
    if (entry) {
      authCodes.delete(code);
    } else {
      const hmacCode = verifyHmacPayload(code, "code");
      if (hmacCode) {
        entry = {
          code,
          clientId: hmacCode.clientId,
          redirectUri: hmacCode.redirectUri,
          codeChallenge: hmacCode.codeChallenge,
          codeChallengeMethod: "S256",
          scope: hmacCode.scope,
          context: hmacCode.context,
          expiresAt: hmacCode.__exp * 1e3
        };
      }
    }
    if (!entry) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_grant", error_description: "C\xF3digo de autoriza\xE7\xE3o inv\xE1lido ou j\xE1 utilizado." }));
      return;
    }
    if (entry.expiresAt <= Date.now()) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_grant", error_description: "C\xF3digo de autoriza\xE7\xE3o expirado." }));
      return;
    }
    if (entry.codeChallenge) {
      const pkceValid = verifyPkceS256(codeVerifier, entry.codeChallenge);
      if (!pkceValid) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_grant", error_description: "PKCE verification failed: code_verifier incompat\xEDvel." }));
        return;
      }
    }
    const expiresIn = 3600;
    const tokenPayload = {
      clientId: entry.clientId,
      context: entry.context,
      scope: entry.scope
    };
    const accessToken = signHmacPayload("at", tokenPayload, expiresIn);
    const newRefreshToken = signHmacPayload("rt", tokenPayload, 30 * 86400);
    const expiresAt = Date.now() + expiresIn * 1e3;
    const tokenRecord = {
      accessToken,
      refreshToken: newRefreshToken,
      clientId: entry.clientId,
      context: entry.context,
      scope: entry.scope,
      expiresAt
    };
    activeTokens.set(accessToken, tokenRecord);
    refreshTokens.set(newRefreshToken, tokenRecord);
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Pragma": "no-cache"
    });
    res.end(JSON.stringify({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: expiresIn,
      refresh_token: newRefreshToken,
      scope: entry.scope
    }));
    return;
  }
  if (grantType === "refresh_token") {
    if (!refreshToken) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_request", error_description: "Par\xE2metro refresh_token ausente." }));
      return;
    }
    const existingRecord = refreshTokens.get(refreshToken);
    if (!existingRecord) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_grant", error_description: "Refresh token inv\xE1lido ou revogado." }));
      return;
    }
    refreshTokens.delete(refreshToken);
    activeTokens.delete(existingRecord.accessToken);
    const newAccessToken = `gigante_mcp_at_${randomBytes(32).toString("base64url")}`;
    const newRefreshToken = `gigante_mcp_rt_${randomBytes(32).toString("base64url")}`;
    const expiresIn = 3600;
    const expiresAt = Date.now() + expiresIn * 1e3;
    const newRecord = {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      clientId: existingRecord.clientId,
      context: existingRecord.context,
      scope: existingRecord.scope,
      expiresAt
    };
    activeTokens.set(newAccessToken, newRecord);
    refreshTokens.set(newRefreshToken, newRecord);
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    });
    res.end(JSON.stringify({
      access_token: newAccessToken,
      token_type: "Bearer",
      expires_in: expiresIn,
      refresh_token: newRefreshToken,
      scope: existingRecord.scope
    }));
    return;
  }
  res.writeHead(400, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "unsupported_grant_type", error_description: "Use authorization_code ou refresh_token." }));
}
async function handleOAuthRevoke(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const bodyStr = await getRequestBody(req);
  let tokenToRevoke = "";
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("application/json")) {
    try {
      tokenToRevoke = JSON.parse(bodyStr || "{}").token;
    } catch {
    }
  } else {
    const formData = new URLSearchParams(bodyStr);
    tokenToRevoke = formData.get("token") || "";
  }
  if (tokenToRevoke) {
    activeTokens.delete(tokenToRevoke);
    refreshTokens.delete(tokenToRevoke);
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: true, message: "Token revogado com sucesso." }));
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

// src-api/oauth.ts
async function oauthRouterHandler(req, res) {
  const url = req.url || "";
  const pathname = url.split("?")[0];
  const host = req.headers["x-forwarded-host"] || req.headers["host"] || "trabalheconosco.gigantepneus.com.br";
  const proto = req.headers["x-forwarded-proto"] || (host.includes("localhost") ? "http" : "https");
  const issuerUrl = `${proto}://${host}`;
  if (pathname.includes("/.well-known/") || pathname.endsWith("/metadata")) {
    return handleOAuthMetadata(req, res, issuerUrl);
  }
  if (pathname.endsWith("/authorize")) {
    return handleOAuthAuthorize(req, res);
  }
  if (pathname.endsWith("/token")) {
    return handleOAuthToken(req, res);
  }
  if (pathname.endsWith("/userinfo")) {
    return handleOAuthUserinfo(req, res);
  }
  if (pathname.endsWith("/revoke")) {
    return handleOAuthRevoke(req, res);
  }
  return handleOAuthMetadata(req, res, issuerUrl);
}
export {
  oauthRouterHandler as default
};
