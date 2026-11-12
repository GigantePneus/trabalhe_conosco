// services/storage/googleOAuthService.ts
import crypto from "crypto";
import fs from "fs";
import path from "path";
var GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
var DEFAULT_CORPORATE_EMAIL = "mktgigantepneus@gmail.com";
var FORBIDDEN_PERSONAL_ACCOUNTS = ["alexignaciomkt", "alexignaciomkt@gmail.com"];
var GoogleOAuthService = class _GoogleOAuthService {
  constructor(configOverride, fetchImpl) {
    this.cachedAccessToken = null;
    this.cachedTokenExpiry = 0;
    this.configOverride = configOverride;
    this.fetchImpl = fetchImpl || globalThis.fetch.bind(globalThis);
  }
  static {
    this.consumedStateNonces = /* @__PURE__ */ new Map();
  }
  getConfig() {
    const clientId = this.configOverride?.clientId ?? process.env.GOOGLE_CLIENT_ID ?? "";
    const clientSecret = this.configOverride?.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? "";
    const redirectUri = this.configOverride?.redirectUri ?? process.env.GOOGLE_OAUTH_REDIRECT_URI ?? "https://trabalheconosco.gigantepneus.com.br/api/integracoes/google/callback";
    const refreshToken = this.configOverride?.refreshToken ?? process.env.GOOGLE_REFRESH_TOKEN ?? "";
    const authorizedEmail = (this.configOverride?.authorizedEmail ?? process.env.GOOGLE_AUTHORIZED_EMAIL ?? DEFAULT_CORPORATE_EMAIL).toLowerCase().trim();
    const stateSecret = this.configOverride?.stateSecret ?? process.env.GOOGLE_OAUTH_STATE_SECRET ?? (clientSecret || "default-gigante-state-secret");
    const isLocalDev = process.env.NODE_ENV !== "production" && !process.env.VERCEL;
    const persistRefreshTokenLocally = this.configOverride?.persistRefreshTokenLocally ?? isLocalDev;
    const envFilePath = this.configOverride?.envFilePath ?? path.resolve(process.cwd(), ".env.local");
    return {
      clientId,
      clientSecret,
      redirectUri,
      refreshToken,
      authorizedEmail,
      stateSecret,
      persistRefreshTokenLocally,
      envFilePath
    };
  }
  /**
   * Gera um parâmetro `state` criptográfico assinado com HMAC-SHA256.
   * Previne ataques CSRF sem depender de arquivos locais.
   */
  generateState(adminIdentifier = "admin") {
    const { stateSecret } = this.getConfig();
    const payload = {
      nonce: crypto.randomBytes(16).toString("hex"),
      iat: Date.now(),
      exp: Date.now() + 10 * 60 * 1e3,
      // 10 minutos de validade
      sub: adminIdentifier
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
    const signature = crypto.createHmac("sha256", stateSecret || "state-fallback").update(payloadB64).digest("base64url");
    return `${payloadB64}.${signature}`;
  }
  /**
   * Valida a assinatura HMAC, a expiração e garante que o `state` não foi reutilizado (anti-replay).
   */
  verifyState(state, consumeNonce = false) {
    if (!state || typeof state !== "string" || !state.includes(".")) {
      return { valid: false, reason: "OAUTH_STATE_INVALID: Par\xE2metro state ausente ou malformado." };
    }
    const parts = state.split(".");
    if (parts.length !== 2) {
      return { valid: false, reason: "OAUTH_STATE_INVALID: Estrutura do state inv\xE1lida." };
    }
    const [payloadB64, receivedSig] = parts;
    const { stateSecret } = this.getConfig();
    const expectedSig = crypto.createHmac("sha256", stateSecret || "state-fallback").update(payloadB64).digest("base64url");
    const sigBufferA = Buffer.from(receivedSig);
    const sigBufferB = Buffer.from(expectedSig);
    if (sigBufferA.length !== sigBufferB.length || !crypto.timingSafeEqual(sigBufferA, sigBufferB)) {
      return {
        valid: false,
        reason: "OAUTH_STATE_INVALID: Assinatura criptogr\xE1fica do state n\xE3o confere (CSRF detectado)."
      };
    }
    try {
      const decoded = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
      if (!decoded.exp || Date.now() > decoded.exp) {
        return { valid: false, reason: "OAUTH_STATE_EXPIRED: O par\xE2metro state expirou." };
      }
      const nonce = decoded.nonce;
      if (!nonce) {
        return { valid: false, reason: "OAUTH_STATE_INVALID: Nonce ausente no state." };
      }
      const now = Date.now();
      for (const [k, expTime] of _GoogleOAuthService.consumedStateNonces.entries()) {
        if (now > expTime) {
          _GoogleOAuthService.consumedStateNonces.delete(k);
        }
      }
      if (_GoogleOAuthService.consumedStateNonces.has(nonce)) {
        return {
          valid: false,
          reason: "OAUTH_STATE_REPLAYED: Este state j\xE1 foi utilizado anteriormente e n\xE3o pode ser reutilizado."
        };
      }
      if (consumeNonce) {
        _GoogleOAuthService.consumedStateNonces.set(nonce, decoded.exp);
      }
      return { valid: true, nonce };
    } catch {
      return { valid: false, reason: "OAUTH_STATE_INVALID: Falha ao decodificar payload do state." };
    }
  }
  /**
   * Persiste com segurança o `GOOGLE_REFRESH_TOKEN` no arquivo `.env.local` apenas em desenvolvimento local,
   * preservando todas as variáveis existentes e restringindo as permissões do arquivo (0o600).
   */
  persistRefreshTokenToEnvLocal(refreshToken) {
    const config = this.getConfig();
    if (!config.persistRefreshTokenLocally || !config.envFilePath) {
      return false;
    }
    const isDefaultProjectEnv = path.resolve(config.envFilePath) === path.resolve(process.cwd(), ".env.local");
    if (isDefaultProjectEnv && refreshToken.includes("mock")) {
      return false;
    }
    try {
      let existingContent = "";
      if (fs.existsSync(config.envFilePath)) {
        existingContent = fs.readFileSync(config.envFilePath, "utf-8");
      }
      const lines = existingContent.split(/\r?\n/);
      let found = false;
      const updatedLines = lines.map((line) => {
        if (/^\s*GOOGLE_REFRESH_TOKEN\s*=/.test(line)) {
          found = true;
          return `GOOGLE_REFRESH_TOKEN=${refreshToken}`;
        }
        return line;
      });
      if (!found) {
        if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1].trim() !== "") {
          updatedLines.push("");
        }
        updatedLines.push(`GOOGLE_REFRESH_TOKEN=${refreshToken}`);
      }
      fs.writeFileSync(config.envFilePath, updatedLines.join("\n"), {
        encoding: "utf-8",
        mode: 384
      });
      try {
        fs.chmodSync(config.envFilePath, 384);
      } catch {
      }
      return true;
    } catch {
      return false;
    }
  }
  /**
   * Constrói a URL oficial de autorização OAuth 2.0 do Google.
   * Solicita exclusivamente o escopo `drive.file` e `access_type=offline`.
   */
  buildAuthorizationUrl(state) {
    const config = this.getConfig();
    if (!config.clientId || !config.redirectUri) {
      throw new Error("OAUTH_CONFIG_MISSING: GOOGLE_CLIENT_ID e GOOGLE_OAUTH_REDIRECT_URI s\xE3o obrigat\xF3rios.");
    }
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: GOOGLE_DRIVE_FILE_SCOPE,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      login_hint: config.authorizedEmail || DEFAULT_CORPORATE_EMAIL,
      state
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }
  /**
   * Processa o callback OAuth 2.0, consome o `state` (uso único), troca o `code` por tokens,
   * valida a conta corporativa e salva o `refresh_token` com segurança no ambiente local.
   */
  async handleCallback(code, state) {
    const stateCheck = this.verifyState(state, true);
    if (!stateCheck.valid) {
      throw new Error(stateCheck.reason || "OAUTH_STATE_INVALID");
    }
    if (!code || typeof code !== "string") {
      throw new Error("OAUTH_CODE_MISSING: C\xF3digo de autoriza\xE7\xE3o n\xE3o informado.");
    }
    const config = this.getConfig();
    if (!config.clientId || !config.clientSecret) {
      throw new Error("OAUTH_CONFIG_MISSING: Credenciais OAuth do cliente n\xE3o configuradas no backend.");
    }
    const body = new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code"
    });
    const tokenRes = await this.fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(15e3)
    });
    if (!tokenRes.ok) {
      throw new Error(`OAUTH_TOKEN_EXCHANGE_FAILED: Google retornou HTTP ${tokenRes.status}.`);
    }
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error("OAUTH_NO_ACCESS_TOKEN: O Google n\xE3o retornou um access_token v\xE1lido.");
    }
    if (!tokenData.refresh_token) {
      throw new Error(
        "OAUTH_NO_REFRESH_TOKEN: O Google n\xE3o retornou refresh_token. Revogue o acesso anterior em myaccount.google.com/permissions e autorize novamente com prompt=consent."
      );
    }
    const aboutRes = await this.fetchImpl(
      "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        },
        signal: AbortSignal.timeout(1e4)
      }
    );
    if (!aboutRes.ok) {
      throw new Error(
        `OAUTH_USER_VERIFY_FAILED: N\xE3o foi poss\xEDvel verificar o usu\xE1rio autorizador (HTTP ${aboutRes.status}).`
      );
    }
    const aboutData = await aboutRes.json();
    const userEmail = (aboutData.user?.emailAddress || "").toLowerCase().trim();
    if (FORBIDDEN_PERSONAL_ACCOUNTS.some((acc) => userEmail.includes(acc)) || userEmail !== config.authorizedEmail) {
      throw new Error(
        `OAUTH_UNAUTHORIZED_ACCOUNT: Conta '${userEmail}' n\xE3o autorizada. Utilize exclusivamente a conta corporativa '${config.authorizedEmail}'.`
      );
    }
    this.cachedAccessToken = tokenData.access_token;
    this.cachedTokenExpiry = Date.now() + ((tokenData.expires_in || 3600) - 60) * 1e3;
    process.env.GOOGLE_REFRESH_TOKEN = tokenData.refresh_token;
    const persistedLocally = this.persistRefreshTokenToEnvLocal(tokenData.refresh_token);
    return {
      success: true,
      authorizedEmail: userEmail,
      hasRefreshToken: true,
      refreshTokenObtained: true,
      persistedLocally,
      scope: tokenData.scope || GOOGLE_DRIVE_FILE_SCOPE,
      expiresIn: tokenData.expires_in || 3600
    };
  }
  /**
   * Obtém um `access_token` válido, renovando-o automaticamente via `GOOGLE_REFRESH_TOKEN` quando necessário.
   */
  async getValidAccessToken(forceRefresh = false) {
    if (!forceRefresh && this.cachedAccessToken && Date.now() < this.cachedTokenExpiry) {
      return this.cachedAccessToken;
    }
    const config = this.getConfig();
    if (!config.refreshToken) {
      throw new Error("OAUTH_REFRESH_TOKEN_MISSING: GOOGLE_REFRESH_TOKEN n\xE3o est\xE1 configurado no ambiente.");
    }
    if (!config.clientId || !config.clientSecret) {
      throw new Error("OAUTH_CONFIG_MISSING: GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET ausente no backend.");
    }
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token"
    });
    const response = await this.fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(15e3)
    });
    if (!response.ok) {
      throw new Error(`OAUTH_REFRESH_FAILED: Falha ao renovar access_token (HTTP ${response.status}).`);
    }
    const data = await response.json();
    if (!data.access_token) {
      throw new Error("OAUTH_REFRESH_FAILED: Resposta de renova\xE7\xE3o n\xE3o cont\xE9m access_token.");
    }
    this.cachedAccessToken = data.access_token;
    this.cachedTokenExpiry = Date.now() + ((data.expires_in || 3600) - 60) * 1e3;
    return this.cachedAccessToken;
  }
  clearTokenCache() {
    this.cachedAccessToken = null;
    this.cachedTokenExpiry = 0;
  }
};
var googleOAuthService = new GoogleOAuthService();

// src-api/integracoes/google/callback.ts
async function handleGoogleCallback(query, oauthService = googleOAuthService) {
  if (query.error) {
    return {
      statusCode: 400,
      data: {
        success: false,
        mensagem: `Autoriza\xE7\xE3o recusada pelo provedor OAuth (${query.error}).`
      }
    };
  }
  const state = query.state || "";
  const code = query.code || "";
  const stateVerification = oauthService.verifyState(state);
  if (!stateVerification.valid) {
    return {
      statusCode: 403,
      data: {
        success: false,
        mensagem: stateVerification.reason || "Par\xE2metro state inv\xE1lido ou expirado (prote\xE7\xE3o CSRF)."
      }
    };
  }
  if (!code) {
    return {
      statusCode: 400,
      data: {
        success: false,
        mensagem: "C\xF3digo de autoriza\xE7\xE3o OAuth (code) ausente na requisi\xE7\xE3o de callback."
      }
    };
  }
  try {
    const result = await oauthService.handleCallback(code, state);
    return {
      statusCode: 200,
      data: {
        success: true,
        mensagem: "Conta corporativa autorizada com sucesso via OAuth 2.0 (escopo drive.file). Tokens validados com seguran\xE7a no backend.",
        authorizedEmail: result.authorizedEmail,
        hasRefreshToken: result.hasRefreshToken,
        scope: result.scope
      }
    };
  } catch (err) {
    const msg = err?.message || "Erro desconhecido no callback OAuth.";
    const status = msg.includes("OAUTH_STATE") || msg.includes("OAUTH_UNAUTHORIZED_ACCOUNT") ? 403 : msg.includes("OAUTH_NO_REFRESH_TOKEN") || msg.includes("OAUTH_CODE_MISSING") ? 400 : 502;
    return {
      statusCode: status,
      data: {
        success: false,
        mensagem: msg
      }
    };
  }
}
async function vercelCallbackHandler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", ["GET"]);
      return res.status(405).json({ success: false, mensagem: `M\xE9todo ${req.method} n\xE3o permitido.` });
    }
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const urlObj = new URL(req.url || "/api/integracoes/google/callback", "http://localhost");
    const query = {
      code: req.query?.code ?? urlObj.searchParams.get("code") ?? void 0,
      state: req.query?.state ?? urlObj.searchParams.get("state") ?? void 0,
      error: req.query?.error ?? urlObj.searchParams.get("error") ?? void 0
    };
    const result = await handleGoogleCallback(query);
    return res.status(result.statusCode).json(result.data);
  } catch (err) {
    console.error("[VercelHandler][CallbackException]", err);
    return res.status(500).json({ success: false, mensagem: err?.message || "Erro interno no servidor." });
  }
}
export {
  vercelCallbackHandler as default,
  handleGoogleCallback
};
