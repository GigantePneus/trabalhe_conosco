// src-api/candidaturas/enviar.ts
import crypto5 from "crypto";
import { createClient as createClient3 } from "@supabase/supabase-js";

// services/security/fileValidator.ts
var MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
function validateCurriculoFile(buffer, originalName, declaredMimeType) {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: "ARQUIVO_VAZIO: O arquivo enviado est\xE1 vazio (0 bytes)." };
  }
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `ARQUIVO_MUITO_GRANDE: O arquivo possui ${(buffer.length / (1024 * 1024)).toFixed(2)} MB, excedendo o limite m\xE1ximo de 10 MB.`
    };
  }
  const ext = originalName.includes(".") ? originalName.split(".").pop()?.toLowerCase() || "" : "";
  if (!["pdf", "doc", "docx"].includes(ext)) {
    return {
      valid: false,
      error: "EXTENSAO_NAO_PERMITIDA: Apenas arquivos .pdf, .doc e .docx s\xE3o aceitos."
    };
  }
  const isPdf = buffer.length >= 5 && buffer[0] === 37 && buffer[1] === 80 && buffer[2] === 68 && buffer[3] === 70 && buffer[4] === 45;
  const isDoc = buffer.length >= 8 && buffer[0] === 208 && buffer[1] === 207 && buffer[2] === 17 && buffer[3] === 224 && buffer[4] === 161 && buffer[5] === 177 && buffer[6] === 26 && buffer[7] === 225;
  const isDocx = buffer.length >= 4 && buffer[0] === 80 && buffer[1] === 75 && buffer[2] === 3 && buffer[3] === 4;
  if (ext === "pdf" && !isPdf) {
    return {
      valid: false,
      error: "CONTEUDO_INVALIDO: O arquivo possui extens\xE3o .pdf mas sua assinatura bin\xE1ria n\xE3o corresponde a um documento PDF v\xE1lido."
    };
  }
  if (ext === "doc" && !isDoc) {
    return {
      valid: false,
      error: "CONTEUDO_INVALIDO: O arquivo possui extens\xE3o .doc mas sua assinatura bin\xE1ria n\xE3o corresponde a um documento Microsoft Word v\xE1lido."
    };
  }
  if (ext === "docx" && !isDocx) {
    return {
      valid: false,
      error: "CONTEUDO_INVALIDO: O arquivo possui extens\xE3o .docx mas sua assinatura bin\xE1ria n\xE3o corresponde a um documento OOXML/Word v\xE1lido."
    };
  }
  if (!isPdf && !isDoc && !isDocx) {
    return {
      valid: false,
      error: "CONTEUDO_REJEITADO: Formato bin\xE1rio n\xE3o reconhecido. Envie um arquivo PDF, DOC ou DOCX aut\xEAntico."
    };
  }
  let finalMime = "application/pdf";
  let format = "pdf";
  if (isPdf) {
    finalMime = "application/pdf";
    format = "pdf";
  } else if (isDoc) {
    finalMime = "application/msword";
    format = "doc";
  } else if (isDocx) {
    finalMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    format = "docx";
  }
  return {
    valid: true,
    detectedMimeType: finalMime,
    detectedFormat: format
  };
}

// services/security/rateLimiter.ts
import { createClient } from "@supabase/supabase-js";
var MemoryRateLimiter = class {
  constructor(maxRequests = 15, windowMs = 60 * 1e3) {
    this.requests = /* @__PURE__ */ new Map();
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }
  isAllowed(ip) {
    const now = Date.now();
    const entry = this.requests.get(ip);
    if (!entry || now > entry.resetAt) {
      this.requests.set(ip, {
        count: 1,
        resetAt: now + this.windowMs
      });
      return { allowed: true, remaining: this.maxRequests - 1 };
    }
    if (entry.count >= this.maxRequests) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1e3);
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }
    entry.count += 1;
    return { allowed: true, remaining: this.maxRequests - entry.count };
  }
  reset(ip) {
    this.requests.delete(ip);
  }
  clear() {
    this.requests.clear();
  }
};
var candidaturasRateLimiter = new MemoryRateLimiter(15, 60 * 1e3);
var adminClientCached = null;
function getSupabaseClient() {
  if (adminClientCached) return adminClientCached;
  const supaUrl = process.env.SUPABASE_INTERNAL_URL || process.env.VITE_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supaUrl && supaKey) {
    adminClientCached = createClient(supaUrl, supaKey, {
      auth: { persistSession: false }
    });
    return adminClientCached;
  }
  return null;
}
async function checkDistributedRateLimit(key, maxRequests = 15, windowSeconds = 60, clientOverride) {
  const supa = clientOverride || getSupabaseClient();
  const isProd = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
  if (supa) {
    try {
      const { data, error } = await supa.rpc("check_rate_limit", {
        p_key: key,
        p_max_requests: maxRequests,
        p_window_seconds: windowSeconds
      });
      if (!error && data && typeof data.allowed === "boolean") {
        return {
          allowed: data.allowed,
          remaining: Number(data.remaining) || 0,
          retryAfterSeconds: data.allowed ? 0 : Number(data.retryAfterSeconds) || windowSeconds
        };
      }
      console.error("[RateLimiter] Erro na RPC check_rate_limit:", error?.message);
    } catch (err) {
      console.error("[RateLimiter] Exce\xE7\xE3o na chamada de rate limit:", err?.message);
    }
  } else {
    console.warn("[RateLimiter] Supabase Client indispon\xEDvel para rate limiting.");
  }
  if (isProd) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 30,
      serviceUnavailable: true
    };
  }
  return candidaturasRateLimiter.isAllowed(key);
}

// services/storage/googleDriveStorage.ts
import crypto3 from "crypto";

// services/storage/googleDriveOAuthAdapter.ts
import crypto2 from "crypto";
import { createClient as createClient2 } from "@supabase/supabase-js";

// services/storage/googleOAuthService.ts
import crypto from "crypto";
import fs from "fs";
import path from "path";
var GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
var DEFAULT_CORPORATE_EMAIL = "mktgigantepneus@gmail.com";
var DEFAULT_ROOT_FOLDER_ID = "1t1GNXOmaJtpzcUeP60osfN1I_Fyav7FD";
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

// services/storage/googleDriveOAuthAdapter.ts
var ALLOWED_CURRICULO_MIMES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
];
var FOLDER_NAME_CORPORATIVO = "01 - CORPORATIVO";
var FOLDER_NAME_UNIDADES = "02 - UNIDADES FRANQUEADAS";
var FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
var GoogleDriveOAuthAdapter = class {
  constructor(options) {
    this.folderCache = /* @__PURE__ */ new Map();
    this.supabaseAdmin = null;
    this.oauthService = options?.oauthService || googleOAuthService;
    this.fetchImpl = options?.fetchImpl || globalThis.fetch.bind(globalThis);
    this.rootFolderId = options?.rootFolderId || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || DEFAULT_ROOT_FOLDER_ID;
    if (options?.supabaseAdmin !== void 0) {
      this.supabaseAdmin = options.supabaseAdmin;
    } else {
      const supaUrl = process.env.SUPABASE_INTERNAL_URL || process.env.VITE_SUPABASE_URL;
      const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supaUrl && supaKey) {
        this.supabaseAdmin = createClient2(supaUrl, supaKey, {
          auth: { persistSession: false }
        });
      }
    }
  }
  /**
   * Valida a conexão OAuth 2.0, verifica se a conta autenticada é a corporativa oficial
   * e testa a acessibilidade da pasta raiz sob o escopo `drive.file`.
   */
  async validateConnection() {
    const token = await this.oauthService.getValidAccessToken();
    const aboutRes = await this.fetchImpl(
      "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(1e4)
      }
    );
    if (!aboutRes.ok) {
      throw new Error(`GDRIVE_CONNECTION_ERROR: Falha ao consultar drive/v3/about (HTTP ${aboutRes.status}).`);
    }
    const aboutData = await aboutRes.json();
    const email = (aboutData.user?.emailAddress || "").toLowerCase().trim();
    const expectedEmail = this.oauthService.getConfig().authorizedEmail || DEFAULT_CORPORATE_EMAIL;
    if (email !== expectedEmail) {
      throw new Error(
        `GDRIVE_UNAUTHORIZED_USER: Conta conectada (${email}) diverge da conta corporativa (${expectedEmail}).`
      );
    }
    const rootMeta = await this.getFolderMetadata(this.rootFolderId);
    return {
      connected: true,
      userEmail: email,
      rootFolderId: rootMeta.id,
      rootFolderName: rootMeta.name
    };
  }
  /**
   * Obtém metadados de uma pasta e valida se ela está acessível ao aplicativo sob `drive.file`
   * e não está na lixeira.
   */
  async getFolderMetadata(folderId) {
    if (!folderId || typeof folderId !== "string") {
      throw new Error("GDRIVE_FOLDER_ID_INVALID: ID de pasta n\xE3o informado.");
    }
    const token = await this.oauthService.getValidAccessToken();
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      folderId
    )}?fields=id,name,mimeType,parents,trashed,shared`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(1e4)
    });
    if (res.status === 404 || res.status === 403) {
      throw new Error(
        `GDRIVE_FOLDER_INACCESSIBLE: A pasta '${folderId}' n\xE3o est\xE1 acess\xEDvel com o escopo 'drive.file' (HTTP ${res.status}). Pastas criadas manualmente na interface web do Drive precisam ser autorizadas via Google Picker com o Client ID do aplicativo ou criadas diretamente pela API do aplicativo.`
      );
    }
    if (!res.ok) {
      throw new Error(`GDRIVE_API_ERROR: Falha ao obter metadados da pasta (HTTP ${res.status}).`);
    }
    const meta = await res.json();
    if (meta.trashed) {
      throw new Error(`GDRIVE_FOLDER_TRASHED: A pasta '${folderId}' encontra-se na lixeira.`);
    }
    if (meta.mimeType !== FOLDER_MIME_TYPE) {
      throw new Error(`GDRIVE_NOT_A_FOLDER: O recurso '${folderId}' n\xE3o \xE9 uma pasta do Google Drive.`);
    }
    return meta;
  }
  /**
   * Busca uma subpasta pelo nome exato dentro de `parentId` para evitar duplicação de pastas.
   */
  async findSubfolderByName(name, parentId) {
    const token = await this.oauthService.getValidAccessToken();
    const escapedName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const escapedParent = parentId.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const q = `mimeType = '${FOLDER_MIME_TYPE}' and name = '${escapedName}' and '${escapedParent}' in parents and trashed = false`;
    const params = new URLSearchParams({
      q,
      fields: "files(id,name,mimeType,parents,trashed,shared)",
      pageSize: "1",
      spaces: "drive"
    });
    const res = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(1e4)
    });
    if (!res.ok) {
      throw new Error(`GDRIVE_FOLDER_SEARCH_ERROR: Erro ao buscar subpasta (HTTP ${res.status}).`);
    }
    const data = await res.json();
    return data.files && data.files.length > 0 ? data.files[0] : null;
  }
  /**
   * Cria uma pasta privada no Google Drive dentro de `parentId` (ou busca se já existir).
   */
  async createFolder(name, parentId) {
    const cleanName = name.trim();
    if (!cleanName) {
      throw new Error("GDRIVE_FOLDER_NAME_INVALID: Nome da pasta n\xE3o pode ser vazio.");
    }
    const targetParent = parentId || this.rootFolderId;
    await this.getFolderMetadata(targetParent);
    const existing = await this.findSubfolderByName(cleanName, targetParent);
    if (existing) {
      return existing;
    }
    const token = await this.oauthService.getValidAccessToken();
    const metadata = {
      name: cleanName,
      mimeType: FOLDER_MIME_TYPE,
      parents: [targetParent]
    };
    const res = await this.fetchImpl(
      "https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,parents,shared",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(metadata),
        signal: AbortSignal.timeout(15e3)
      }
    );
    if (!res.ok) {
      throw new Error(`GDRIVE_CREATE_FOLDER_FAILED: N\xE3o foi poss\xEDvel criar a pasta '${cleanName}' (HTTP ${res.status}).`);
    }
    return await res.json();
  }
  /**
   * Resolve a pasta de destino para candidaturas corporativas ou de lojas franqueadas:
   * - Corporativo (lojaId == null): GIGANTE PNEUS - RH / 01 - CORPORATIVO
   * - Loja (lojaId UUID): GIGANTE PNEUS - RH / 02 - UNIDADES FRANQUEADAS / [UUID_LOJA]
   */
  async getFolderForStore(lojaId) {
    if (!lojaId) {
      const envCorpFolder = process.env.GOOGLE_DRIVE_CORP_FOLDER_ID;
      if (envCorpFolder) {
        await this.getFolderMetadata(envCorpFolder);
        return envCorpFolder;
      }
      const cachedCorp = this.folderCache.get("__CORPORATIVO__");
      if (cachedCorp) return cachedCorp;
      const corpFolder = await this.createFolder(FOLDER_NAME_CORPORATIVO, this.rootFolderId);
      this.folderCache.set("__CORPORATIVO__", corpFolder.id);
      return corpFolder.id;
    }
    const cleanLojaId = lojaId.trim();
    if (!/^[0-9a-fA-F-]{8,64}$/.test(cleanLojaId)) {
      throw new Error("GDRIVE_INVALID_STORE_ID: O identificador da loja deve ser um UUID v\xE1lido.");
    }
    const cachedStoreFolder = this.folderCache.get(cleanLojaId);
    if (cachedStoreFolder) {
      return cachedStoreFolder;
    }
    if (this.supabaseAdmin) {
      try {
        const { data: lojaRow } = await this.supabaseAdmin.from("lojas").select("google_drive_folder_id").eq("id", cleanLojaId).maybeSingle();
        if (lojaRow?.google_drive_folder_id && !lojaRow.google_drive_folder_id.startsWith("folder_")) {
          try {
            const existingMeta = await this.getFolderMetadata(lojaRow.google_drive_folder_id);
            this.folderCache.set(cleanLojaId, existingMeta.id);
            return existingMeta.id;
          } catch {
          }
        }
      } catch {
      }
    }
    let unidadesRootId = process.env.GOOGLE_DRIVE_UNIDADES_FOLDER_ID || this.folderCache.get("__UNIDADES_ROOT__");
    if (!unidadesRootId) {
      const unidadesFolder = await this.createFolder(FOLDER_NAME_UNIDADES, this.rootFolderId);
      unidadesRootId = unidadesFolder.id;
      this.folderCache.set("__UNIDADES_ROOT__", unidadesRootId);
    }
    const storeFolder = await this.createFolder(cleanLojaId, unidadesRootId);
    this.folderCache.set(cleanLojaId, storeFolder.id);
    if (this.supabaseAdmin) {
      try {
        await this.supabaseAdmin.from("lojas").update({ google_drive_folder_id: storeFolder.id }).eq("id", cleanLojaId);
      } catch {
      }
    }
    return storeFolder.id;
  }
  /**
   * Realiza o upload multipart (RFC 2387) de um currículo para o Google Drive API v3.
   * Suporta tanto `uploadFile(options: StorageUploadOptions)` quanto `uploadFile(buffer: Buffer, metadata: DirectUploadMetadata)`.
   */
  async uploadFile(bufferOrOptions, directMetadata) {
    const options = Buffer.isBuffer(bufferOrOptions) ? {
      buffer: bufferOrOptions,
      originalName: directMetadata?.originalName || "curriculo.pdf",
      mimeType: directMetadata?.mimeType || "application/pdf",
      folderId: directMetadata?.folderId,
      lojaId: directMetadata?.lojaId,
      simulateFailure: directMetadata?.simulateFailure
    } : bufferOrOptions;
    if (options.simulateFailure) {
      throw new Error("GDRIVE_API_ERROR: Falha de comunica\xE7\xE3o ou timeout simulado com a API do Google Drive.");
    }
    if (!options.buffer || options.buffer.length === 0) {
      throw new Error("GDRIVE_EMPTY_BUFFER: Buffer de arquivo vazio.");
    }
    if (!ALLOWED_CURRICULO_MIMES.includes(options.mimeType)) {
      throw new Error(`GDRIVE_MIME_FORBIDDEN: MIME type '${options.mimeType}' n\xE3o permitido.`);
    }
    const folderId = options.folderId ? (await this.getFolderMetadata(options.folderId)).id : await this.getFolderForStore(options.lojaId || null);
    const ext = options.originalName.includes(".") ? options.originalName.split(".").pop()?.toLowerCase() || "pdf" : "pdf";
    const safeExt = ["pdf", "doc", "docx"].includes(ext) ? ext : "pdf";
    const randomToken = crypto2.randomBytes(16).toString("hex");
    const safeFileName = `curriculo_${randomToken}.${safeExt}`;
    const localMd5 = crypto2.createHash("md5").update(options.buffer).digest("hex");
    const boundary = `gigante_drive_boundary_${crypto2.randomBytes(12).toString("hex")}`;
    const driveMetadata = {
      name: safeFileName,
      mimeType: options.mimeType,
      parents: [folderId],
      copyRequiresWriterPermission: true,
      writersCanShare: false
    };
    const preamble = Buffer.from(
      `--${boundary}\r
Content-Type: application/json; charset=UTF-8\r
\r
${JSON.stringify(driveMetadata)}\r
--${boundary}\r
Content-Type: ${options.mimeType}\r
\r
`,
      "utf-8"
    );
    const epilogue = Buffer.from(`\r
--${boundary}--\r
`, "utf-8");
    const multipartBody = Buffer.concat([preamble, options.buffer, epilogue]);
    const token = await this.oauthService.getValidAccessToken();
    const uploadUrl = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,parents,md5Checksum,size,shared";
    const res = await this.fetchImpl(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(multipartBody.length)
      },
      body: multipartBody,
      signal: AbortSignal.timeout(3e4)
    });
    if (!res.ok) {
      throw new Error(`GDRIVE_UPLOAD_FAILED: Google Drive API retornou HTTP ${res.status} durante o upload.`);
    }
    const uploaded = await res.json();
    if (!uploaded.id) {
      throw new Error("GDRIVE_UPLOAD_INVALID_RESPONSE: Google Drive n\xE3o retornou o ID do arquivo criado.");
    }
    if (uploaded.shared === true) {
      await this.deleteFile(uploaded.id).catch(() => void 0);
      throw new Error("SECURITY_VIOLATION_PUBLIC_SHARING_FORBIDDEN: O arquivo criado possui flag de compartilhamento ativa.");
    }
    if (uploaded.md5Checksum && uploaded.md5Checksum.toLowerCase() !== localMd5.toLowerCase()) {
      await this.deleteFile(uploaded.id).catch(() => void 0);
      throw new Error("GDRIVE_CHECKSUM_MISMATCH: O checksum MD5 retornado pelo Google Drive diverge do arquivo enviado.");
    }
    return {
      fileId: uploaded.id,
      fileName: uploaded.name || safeFileName,
      folderId,
      mimeType: options.mimeType,
      tamanhoBytes: options.buffer.length,
      md5Checksum: uploaded.md5Checksum || localMd5,
      criadoEm: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  /**
   * Obtém metadados de um arquivo no Google Drive.
   */
  async getFileMetadata(fileId) {
    if (!fileId || typeof fileId !== "string") {
      throw new Error("GDRIVE_FILE_ID_INVALID: ID do arquivo inv\xE1lido.");
    }
    const token = await this.oauthService.getValidAccessToken();
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      fileId
    )}?fields=id,name,mimeType,parents,md5Checksum,size,trashed,shared`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(1e4)
    });
    if (!res.ok) {
      throw new Error(`GDRIVE_GET_FILE_FAILED: Falha ao consultar metadados do arquivo '${fileId}' (HTTP ${res.status}).`);
    }
    return await res.json();
  }
  /**
   * Exclui permanentemente um arquivo no Google Drive (utilizado em operações de compensação Saga).
   */
  async deleteFile(fileId) {
    if (!fileId || typeof fileId !== "string") {
      throw new Error("GDRIVE_DELETE_INVALID_ID: ID do arquivo ausente para exclus\xE3o compensat\xF3ria.");
    }
    const token = await this.oauthService.getValidAccessToken();
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`;
    const res = await this.fetchImpl(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15e3)
    });
    if (res.status === 204 || res.status === 200) {
      return true;
    }
    throw new Error(
      `GDRIVE_COMPENSATION_DELETE_FAILED: Falha ao excluir arquivo \xF3rf\xE3o '${fileId}' no Google Drive (HTTP ${res.status}).`
    );
  }
  /**
   * Baixa os bytes do currículo diretamente do Google Drive de forma segura (sem expor link público).
   */
  async downloadFile(fileId) {
    if (!fileId || typeof fileId !== "string") {
      throw new Error("GDRIVE_FILE_ID_INVALID: ID do arquivo inv\xE1lido para download.");
    }
    const token = await this.oauthService.getValidAccessToken();
    const meta = await this.getFileMetadata(fileId);
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
    const res = await this.fetchImpl(downloadUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3e4)
    });
    if (!res.ok) {
      throw new Error(`GDRIVE_DOWNLOAD_FAILED: Google Drive API retornou HTTP ${res.status} ao baixar arquivo.`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: meta.mimeType || "application/pdf",
      name: meta.name || "curriculo.pdf"
    };
  }
  /**
   * Bloqueio explícito contra criação de permissões públicas (`anyone` ou links públicos).
   * Qualquer tentativa de invocar compartilhamento público lança erro de segurança.
   */
  async createPublicPermission(_fileId) {
    throw new Error(
      'SECURITY_VIOLATION_PUBLIC_SHARING_FORBIDDEN: A cria\xE7\xE3o de links p\xFAblicos ou permiss\xF5es "anyone" \xE9 estritamente proibida para curr\xEDculos da Gigante Pneus.'
    );
  }
};

// services/storage/googleDriveStorage.ts
var GoogleDriveMockAdapter = class _GoogleDriveMockAdapter {
  constructor() {
    this.defaultCorporateFolderId = "gdrive_folder_corp_gigante_rh";
  }
  static {
    this.filesMap = /* @__PURE__ */ new Map();
  }
  async getFolderForStore(lojaId) {
    if (!lojaId) {
      return this.defaultCorporateFolderId;
    }
    return `gdrive_folder_loja_${lojaId.replace(/-/g, "").substring(0, 12)}`;
  }
  async uploadFile(options) {
    if (options.simulateFailure) {
      throw new Error("GDRIVE_API_ERROR: Falha de comunica\xE7\xE3o ou timeout simulado com a API do Google Drive.");
    }
    const folderId = options.folderId || await this.getFolderForStore(options.lojaId || null);
    const ext = options.originalName.includes(".") ? options.originalName.split(".").pop()?.toLowerCase() || "dat" : "dat";
    const uniqueToken = crypto3.randomBytes(16).toString("hex");
    const safeFileName = `curriculo_${uniqueToken}.${ext}`;
    const fileId = `gdrive_file_${crypto3.randomUUID()}`;
    const md5Checksum = crypto3.createHash("md5").update(options.buffer).digest("hex");
    const result = {
      fileId,
      fileName: safeFileName,
      folderId,
      mimeType: options.mimeType,
      tamanhoBytes: options.buffer.length,
      md5Checksum,
      criadoEm: (/* @__PURE__ */ new Date()).toISOString()
    };
    _GoogleDriveMockAdapter.filesMap.set(fileId, {
      buffer: options.buffer,
      metadata: result
    });
    return result;
  }
  async deleteFile(fileId) {
    if (_GoogleDriveMockAdapter.filesMap.has(fileId)) {
      _GoogleDriveMockAdapter.filesMap.delete(fileId);
      return true;
    }
    return false;
  }
  async downloadFile(fileId) {
    const stored = _GoogleDriveMockAdapter.filesMap.get(fileId);
    if (!stored) {
      throw new Error(`GDRIVE_FILE_NOT_FOUND: Arquivo '${fileId}' n\xE3o encontrado no storage local.`);
    }
    return {
      buffer: stored.buffer,
      mimeType: stored.metadata.mimeType,
      name: stored.metadata.fileName
    };
  }
  static getStoredFile(fileId) {
    return this.filesMap.get(fileId);
  }
  static clearStorage() {
    this.filesMap.clear();
  }
};
var mockAdapterInstance = new GoogleDriveMockAdapter();
var realAdapterInstance = null;
function getActiveStorageAdapter() {
  const mode = (process.env.GOOGLE_DRIVE_MODE || "mock").toLowerCase().trim();
  if (mode === "real") {
    if (!realAdapterInstance) {
      realAdapterInstance = new GoogleDriveOAuthAdapter();
    }
    return realAdapterInstance;
  }
  return mockAdapterInstance;
}
var googleDriveStorage = {
  uploadFile(options) {
    return getActiveStorageAdapter().uploadFile(options);
  },
  deleteFile(fileId) {
    return getActiveStorageAdapter().deleteFile(fileId);
  },
  getFolderForStore(lojaId) {
    return getActiveStorageAdapter().getFolderForStore(lojaId);
  },
  downloadFile(fileId) {
    const adapter = getActiveStorageAdapter();
    if (adapter.downloadFile) {
      return adapter.downloadFile(fileId);
    }
    throw new Error("GDRIVE_DOWNLOAD_UNSUPPORTED: Adaptador de storage n\xE3o suporta download.");
  }
};

// services/security/cpfSecurity.ts
import crypto4 from "crypto";
function validateCpf(rawCpf) {
  if (!rawCpf) {
    return { valid: false, error: "CPF \xE9 obrigat\xF3rio.", cleanCpf: "" };
  }
  const clean = rawCpf.replace(/\D/g, "");
  if (clean.length !== 11) {
    return { valid: false, error: "CPF deve conter exatamente 11 d\xEDgitos num\xE9ricos.", cleanCpf: clean };
  }
  if (/^(\d)\1{10}$/.test(clean)) {
    return { valid: false, error: "CPF inv\xE1lido (sequ\xEAncia repetida).", cleanCpf: clean };
  }
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(clean.charAt(i), 10) * (10 - i);
  }
  let resto = soma * 10 % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(clean.charAt(9), 10)) {
    return { valid: false, error: "D\xEDgito verificador do CPF inv\xE1lido.", cleanCpf: clean };
  }
  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(clean.charAt(i), 10) * (11 - i);
  }
  resto = soma * 10 % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(clean.charAt(10), 10)) {
    return { valid: false, error: "D\xEDgito verificador do CPF inv\xE1lido.", cleanCpf: clean };
  }
  return { valid: true, cleanCpf: clean };
}
function maskCpf(cleanCpf) {
  if (!cleanCpf || cleanCpf.length !== 11) return "***.***.***-**";
  const trecho = cleanCpf.slice(6, 9);
  return `***.***.${trecho}-**`;
}
function generateCpfHash(cleanCpf, secretOverride) {
  const secret = secretOverride || process.env.CPF_HMAC_SECRET || (process.env.NODE_ENV !== "production" ? "dev-hmac-secret-gigante-pneus-local" : "");
  if (!secret) {
    throw new Error("CONFIG_ERROR: CPF_HMAC_SECRET n\xE3o est\xE1 configurado nas vari\xE1veis de ambiente do servidor.");
  }
  return crypto4.createHmac("sha256", secret).update(cleanCpf).digest("hex");
}
function encryptCpf(cleanCpf, keyHexOverride) {
  const keyHex = keyHexOverride || process.env.CPF_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("CONFIG_ERROR: CPF_ENCRYPTION_KEY inv\xE1lida (deve ser 32 bytes em hexadecimal).");
  }
  const key = Buffer.from(keyHex, "hex");
  const iv = crypto4.randomBytes(12);
  const cipher = crypto4.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(cleanCpf, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

// src-api/candidaturas/enviar.ts
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_INTERNAL_URL || process.env.VITE_SUPABASE_URL || "https://hidayzojjztfyuefmknz.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key.includes("supabase-demo") || key.trim() === "") {
    return null;
  }
  return createClient3(url, key.trim(), {
    auth: { persistSession: false }
  });
}
function gerarProtocoloCandidatura() {
  const dateStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replace(/-/g, "");
  const randomHex = crypto5.randomBytes(3).toString("hex").toUpperCase();
  return `GIG-${dateStr}-${randomHex}`;
}
function sanitizeString(str) {
  if (!str) return "";
  return str.replace(/\0/g, "").trim();
}
async function registrarFalhaCompensacaoPersistente(fileId, nomeArquivo, protocolo, motivoErro) {
  console.error(`[Backend][COMPENSATION_ALERT] Falha ao remover arquivo \xF3rf\xE3o (${fileId}):`, motivoErro);
  const sessionTokenHash = crypto5.createHash("sha256").update(fileId + protocolo + Date.now().toString()).digest("hex");
  const adminClient = getSupabaseAdmin();
  if (!adminClient) return;
  try {
    await adminClient.from("upload_transacoes").insert({
      sessao_token_hash: sessionTokenHash,
      google_drive_file_id: fileId,
      nome_arquivo: nomeArquivo || "curriculo_orfao_pendente",
      mime_type: "application/pdf",
      tamanho_bytes: 0,
      status: "falho",
      tentativas_reconciliacao: 1,
      erro_reconciliacao: `Falha na compensa\xE7\xE3o imediata: ${motivoErro || "Erro desconhecido"}`,
      expira_em: new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString()
    });
  } catch (dbPersistErr) {
    console.error("[Backend][CRITICAL_COMPENSATION] Falha ao registrar compensa\xE7\xE3o no banco:", dbPersistErr?.message);
  }
}
async function handleCandidatura(payload, clientIp = "127.0.0.1") {
  try {
    const rateCheck = await checkDistributedRateLimit(clientIp, 15, 60);
    if (!rateCheck.allowed) {
      if (rateCheck.serviceUnavailable) {
        return {
          statusCode: 503,
          data: {
            success: false,
            mensagem: "Servi\xE7o temporariamente indispon\xEDvel para controle de tr\xE1fego. Tente novamente em alguns instantes."
          }
        };
      }
      return {
        statusCode: 429,
        data: {
          success: false,
          mensagem: `Limite de requisi\xE7\xF5es excedido. Aguarde ${rateCheck.retryAfterSeconds} segundos antes de tentar novamente.`
        }
      };
    }
    const nome = sanitizeString(payload.nome);
    const email = sanitizeString(payload.email).toLowerCase();
    const telefone = sanitizeString(payload.telefone);
    const cidade = sanitizeString(payload.cidade);
    const estado = sanitizeString(payload.estado).toUpperCase().slice(0, 2);
    const escolaridade = sanitizeString(payload.escolaridade);
    const linkedinUrl = sanitizeString(payload.linkedin_url);
    const aceitaOutrasVagas = payload.aceita_outras_vagas === true;
    const resumo = sanitizeString(payload.resumo);
    if (!nome || nome.length < 2) {
      return {
        statusCode: 400,
        data: { success: false, mensagem: "Nome completo \xE9 obrigat\xF3rio (m\xEDnimo de 2 caracteres)." }
      };
    }
    if (!email || !email.includes("@") || !email.includes(".")) {
      return {
        statusCode: 400,
        data: { success: false, mensagem: "E-mail inv\xE1lido. Informe um endere\xE7o de e-mail aut\xEAntico." }
      };
    }
    if (!telefone || telefone.length < 8) {
      return {
        statusCode: 400,
        data: { success: false, mensagem: "Telefone de contato \xE9 obrigat\xF3rio (m\xEDnimo de 8 d\xEDgitos)." }
      };
    }
    if (!payload.consentimento_lgpd) {
      return {
        statusCode: 400,
        data: {
          success: false,
          mensagem: "O consentimento com os termos da LGPD \xE9 obrigat\xF3rio para submiss\xE3o do curr\xEDculo."
        }
      };
    }
    const cpfValidation = validateCpf(payload.cpf);
    if (!cpfValidation.valid) {
      return {
        statusCode: 400,
        data: {
          success: false,
          mensagem: cpfValidation.error || "CPF inv\xE1lido. Verifique os d\xEDgitos informados."
        }
      };
    }
    const cleanCpf = cpfValidation.cleanCpf;
    const cpfMascarado = maskCpf(cleanCpf);
    const cpfHash = generateCpfHash(cleanCpf);
    let cpfCriptografado = null;
    try {
      cpfCriptografado = encryptCpf(cleanCpf);
    } catch {
      cpfCriptografado = null;
    }
    const vagasList = [];
    if (payload.vagas && Array.isArray(payload.vagas) && payload.vagas.length > 0) {
      for (const item of payload.vagas) {
        if (item && (item.cargo_id || item.loja_id || item.vaga_interesse)) {
          vagasList.push({
            cargo_id: item.cargo_id ? item.cargo_id.trim() : null,
            loja_id: item.loja_id ? item.loja_id.trim() : null,
            vaga_interesse: sanitizeString(item.vaga_interesse) || "Candidatura Espont\xE2nea"
          });
        }
      }
    } else {
      vagasList.push({
        cargo_id: payload.cargo_id ? payload.cargo_id.trim() : null,
        loja_id: payload.loja_id ? payload.loja_id.trim() : null,
        vaga_interesse: sanitizeString(payload.vaga_interesse) || "Candidatura Geral"
      });
    }
    if (vagasList.length === 0) {
      return {
        statusCode: 400,
        data: { success: false, mensagem: "Selecione ao menos uma vaga ou oportunidade de interesse." }
      };
    }
    const apresentacaoPessoal = sanitizeString(payload.apresentacao_pessoal || payload.resumo);
    if (!apresentacaoPessoal || apresentacaoPessoal.length < 80) {
      return {
        statusCode: 400,
        data: {
          success: false,
          mensagem: 'A apresenta\xE7\xE3o pessoal ("Conte um pouco sobre voc\xEA") \xE9 obrigat\xF3ria e deve ter no m\xEDnimo 80 caracteres.'
        }
      };
    }
    if (apresentacaoPessoal.length > 2e3) {
      return {
        statusCode: 400,
        data: {
          success: false,
          mensagem: "A apresenta\xE7\xE3o pessoal n\xE3o pode exceder 2.000 caracteres."
        }
      };
    }
    let fileBuffer = null;
    let detectedMimeType = null;
    const hasArquivo = Boolean(payload.arquivo && payload.arquivo.base64 && payload.arquivo.nome);
    if (hasArquivo && payload.arquivo) {
      try {
        fileBuffer = Buffer.from(payload.arquivo.base64, "base64");
      } catch {
        return {
          statusCode: 400,
          data: { success: false, mensagem: "Codifica\xE7\xE3o de arquivo inv\xE1lida. O arquivo deve estar em Base64." }
        };
      }
      const validationResult = validateCurriculoFile(
        fileBuffer,
        payload.arquivo.nome,
        payload.arquivo.mimeType
      );
      if (!validationResult.valid) {
        return {
          statusCode: 400,
          data: {
            success: false,
            mensagem: validationResult.error || "Arquivo de curr\xEDculo inv\xE1lido."
          }
        };
      }
      detectedMimeType = validationResult.detectedMimeType || "application/pdf";
    }
    const protocolo = gerarProtocoloCandidatura();
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return {
        statusCode: 503,
        data: {
          success: false,
          mensagem: "O servidor backend local requer a configura\xE7\xE3o da chave SUPABASE_SERVICE_ROLE_KEY no arquivo .env.local para executar a ingest\xE3o com seguran\xE7a.",
          detalhes: "Configure a vari\xE1vel SUPABASE_SERVICE_ROLE_KEY no arquivo .env.local do servidor para concluir o envio."
        }
      };
    }
    const cargosEspecificosIds = vagasList.map((v) => v.cargo_id).filter((cid) => typeof cid === "string" && cid.length > 0);
    if (cargosEspecificosIds.length > 0 && cargosEspecificosIds.length === vagasList.length) {
      try {
        const { data: candExistente } = await supabaseAdmin.from("candidatos").select("id, candidaturas(cargo_id, status)").eq("cpf_hash", cpfHash).maybeSingle();
        if (candExistente && candExistente.candidaturas && Array.isArray(candExistente.candidaturas)) {
          const candidaturasAtivas = candExistente.candidaturas.filter(
            (c) => c.status !== "Reprovado" && c.status !== "Desistente"
          );
          const todasVagasDuplicadas = cargosEspecificosIds.every(
            (cid) => candidaturasAtivas.some((c) => c.cargo_id === cid)
          );
          if (todasVagasDuplicadas) {
            return {
              statusCode: 409,
              data: {
                success: false,
                status: "todas_vagas_duplicadas",
                protocolo,
                mensagem: "Voc\xEA j\xE1 possui inscri\xE7\xE3o ativa para todas as vagas selecionadas.",
                detalhes: "Nenhum novo arquivo foi enviado ao armazenamento seguro."
              }
            };
          }
        }
      } catch (dupCheckErr) {
        console.warn("[Backend] Verifica\xE7\xE3o pr\xE9via de duplicidade contornada:", dupCheckErr);
      }
    }
    let driveUpload = null;
    if (hasArquivo && fileBuffer && payload.arquivo) {
      try {
        driveUpload = await googleDriveStorage.uploadFile({
          buffer: fileBuffer,
          originalName: payload.arquivo.nome,
          mimeType: detectedMimeType || "application/pdf",
          lojaId: vagasList[0]?.loja_id || null,
          simulateFailure: payload.arquivo.simulateFailure === true
        });
      } catch (driveErr) {
        console.error("[Backend] Falha no armazenamento externo:", driveErr.message);
        return {
          statusCode: 502,
          data: {
            success: false,
            mensagem: "Falha tempor\xE1ria ao comunicar com o servidor de armazenamento seguro. Por favor, tente enviar novamente.",
            detalhes: "O upload para o reposit\xF3rio de arquivos falhou. Nenhum registro foi gravado no banco de dados."
          }
        };
      }
    }
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      "registrar_candidatura_transacional_v2",
      {
        p_nome: nome,
        p_email: email,
        p_cpf_limpo: cleanCpf,
        p_cpf_hash: cpfHash,
        p_cpf_mascarado: cpfMascarado,
        p_cpf_criptografado: cpfCriptografado,
        p_telefone: telefone,
        p_cidade: cidade || null,
        p_estado: estado || null,
        p_escolaridade: escolaridade || null,
        p_linkedin_url: linkedinUrl || null,
        p_aceita_outras_vagas: aceitaOutrasVagas,
        p_consentimento_lgpd: true,
        p_vagas: vagasList,
        p_apresentacao_pessoal: apresentacaoPessoal,
        p_experiencia_profissional: payload.experiencia_profissional || {},
        p_google_drive_file_id: driveUpload?.fileId || null,
        p_google_drive_folder_id: driveUpload?.folderId || null,
        p_nome_arquivo: driveUpload?.fileName || null,
        p_mime_type: driveUpload?.mimeType || null,
        p_tamanho_bytes: driveUpload?.tamanhoBytes || null,
        p_md5_checksum: driveUpload?.md5Checksum || null,
        p_protocolo: protocolo,
        p_ip_origem: clientIp || "127.0.0.1"
      }
    );
    if (rpcError) {
      console.error("[Backend] Erro na transa\xE7\xE3o do banco:", rpcError.message);
      if (driveUpload?.fileId) {
        try {
          await googleDriveStorage.deleteFile(driveUpload.fileId);
        } catch (compErr) {
          await registrarFalhaCompensacaoPersistente(
            driveUpload.fileId,
            driveUpload.fileName,
            protocolo,
            compErr?.message || "Erro desconhecido"
          );
        }
      }
      const msg = rpcError.message || "";
      if (msg.includes("APRESENTACAO_INSUFICIENTE")) {
        return { statusCode: 400, data: { success: false, mensagem: "A apresenta\xE7\xE3o pessoal deve conter no m\xEDnimo 80 caracteres." } };
      }
      if (msg.includes("APRESENTACAO_LONGA")) {
        return { statusCode: 400, data: { success: false, mensagem: "A apresenta\xE7\xE3o pessoal n\xE3o pode exceder 2.000 caracteres." } };
      }
      if (msg.includes("VAGA_INEXISTENTE")) {
        return { statusCode: 404, data: { success: false, mensagem: "Uma das vagas selecionadas n\xE3o foi encontrada." } };
      }
      if (msg.includes("VAGA_INATIVA")) {
        return { statusCode: 400, data: { success: false, mensagem: "Uma das vagas selecionadas n\xE3o est\xE1 mais dispon\xEDvel para inscri\xE7\xF5es." } };
      }
      if (msg.includes("UNIDADE_INCOMPATIVEL")) {
        return { statusCode: 400, data: { success: false, mensagem: "A unidade selecionada diverge da unidade cadastrada para a vaga." } };
      }
      if (msg.includes("UNIDADE_INATIVA")) {
        return { statusCode: 400, data: { success: false, mensagem: "A unidade selecionada est\xE1 temporariamente indispon\xEDvel." } };
      }
      return {
        statusCode: 500,
        data: {
          success: false,
          mensagem: "N\xE3o foi poss\xEDvel finalizar o registro da candidatura. Os dados foram revertidos com seguran\xE7a.",
          detalhes: rpcError.message
        }
      };
    }
    if (rpcData?.status_processamento === "todas_vagas_duplicadas") {
      if (driveUpload?.fileId) {
        try {
          await googleDriveStorage.deleteFile(driveUpload.fileId);
        } catch (compErr) {
          await registrarFalhaCompensacaoPersistente(
            driveUpload.fileId,
            driveUpload.fileName,
            protocolo,
            compErr?.message || "Erro desconhecido"
          );
        }
      }
      return {
        statusCode: 409,
        data: {
          success: false,
          status: "todas_vagas_duplicadas",
          protocolo: rpcData.protocolo || protocolo,
          vagas_duplicadas_ignoradas: rpcData.vagas_duplicadas_ignoradas || [],
          mensagem: "Voc\xEA j\xE1 possui inscri\xE7\xE3o ativa para todas as vagas selecionadas.",
          detalhes: "O arquivo de curr\xEDculo enviado foi removido e n\xE3o foram criadas candidaturas adicionais."
        }
      };
    }
    if (rpcData?.status_processamento === "recebido_para_analise") {
      return {
        statusCode: 200,
        data: {
          success: true,
          status_processamento: "recebido_para_analise",
          protocolo: rpcData.protocolo || protocolo,
          curriculo_id: rpcData.curriculo_id,
          status: "Em An\xE1lise",
          mensagem: "Sua solicita\xE7\xE3o de candidatura foi recebida com sucesso e est\xE1 em an\xE1lise pelo departamento de Recursos Humanos."
        }
      };
    }
    return {
      statusCode: 201,
      data: {
        success: true,
        status_processamento: "efetivado",
        protocolo: rpcData?.protocolo || protocolo,
        candidato_id: rpcData?.candidato_id,
        curriculo_id: rpcData?.curriculo_id || null,
        possui_curriculo_anexado: Boolean(rpcData?.curriculo_id || driveUpload?.fileId),
        candidaturas_criadas: rpcData?.candidaturas_criadas || vagasList.length,
        vagas_duplicadas_ignoradas: rpcData?.vagas_duplicadas_ignoradas || [],
        status: "Recebido",
        mensagem: driveUpload?.fileId ? "Candidatura e curr\xEDculo recebidos e vinculados com sucesso \xE0s vagas selecionadas." : "Candidatura com apresenta\xE7\xE3o e hist\xF3rico recebida com sucesso no Banco de Talentos."
      }
    };
  } catch (err) {
    console.error("[Backend] Erro inesperado:", err);
    return {
      statusCode: 500,
      data: {
        success: false,
        mensagem: "Ocorreu um erro interno no processamento da sua solicita\xE7\xE3o."
      }
    };
  }
}
async function vercelHandler(req, res) {
  try {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).json({
        success: false,
        mensagem: `M\xE9todo ${req.method} n\xE3o permitido. Utilize o m\xE9todo POST.`
      });
    }
    const clientIp = req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || req.socket?.remoteAddress || "127.0.0.1";
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (parseErr) {
        return res.status(400).json({
          success: false,
          mensagem: "Formato de requisi\xE7\xE3o inv\xE1lido. Envie os dados em formato JSON v\xE1lido."
        });
      }
    }
    if (!body || typeof body !== "object") {
      return res.status(400).json({
        success: false,
        mensagem: "Corpo da requisi\xE7\xE3o ausente ou inv\xE1lido."
      });
    }
    const result = await handleCandidatura(body, clientIp);
    if (result.statusCode === 503 || result.statusCode === 429) {
      res.setHeader("Retry-After", "30");
    }
    return res.status(result.statusCode).json(result.data);
  } catch (criticalErr) {
    console.error("[VercelHandler][CriticalException]", criticalErr?.message || criticalErr);
    return res.status(500).json({
      success: false,
      mensagem: "N\xE3o foi poss\xEDvel concluir o envio da sua candidatura no momento. Por favor, tente novamente em alguns instantes."
    });
  }
}
export {
  vercelHandler as default,
  getSupabaseAdmin,
  handleCandidatura
};
