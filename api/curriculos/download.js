// src-api/curriculos/visualizar.ts
import crypto4 from "crypto";
import { createClient as createClient2 } from "@supabase/supabase-js";

// services/storage/googleDriveStorage.ts
import crypto3 from "crypto";

// services/storage/googleDriveOAuthAdapter.ts
import crypto2 from "crypto";
import { createClient } from "@supabase/supabase-js";

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
        this.supabaseAdmin = createClient(supaUrl, supaKey, {
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

// src-api/curriculos/visualizar.ts
var supabaseAdminInstance = null;
function getSupabaseAdmin() {
  if (supabaseAdminInstance) return supabaseAdminInstance;
  const supaUrl = process.env.SUPABASE_INTERNAL_URL || process.env.VITE_SUPABASE_URL;
  const supaServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !supaServiceKey) {
    throw new Error("CONFIG_ERROR: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente.");
  }
  supabaseAdminInstance = createClient2(supaUrl, supaServiceKey, {
    auth: { persistSession: false }
  });
  return supabaseAdminInstance;
}
async function handleVisualizarCurriculo(params) {
  const cleanToken = params.token?.trim();
  const cleanCurriculoId = params.curriculoId?.trim() || void 0;
  const cleanFileId = params.fileId?.trim() || void 0;
  const clientIp = params.clientIp;
  const userAgent = params.userAgent;
  if (!cleanToken) {
    return {
      statusCode: 401,
      error: "ACESSO_NEGADO: Token de autentica\xE7\xE3o n\xE3o fornecido. Acesso restrito a recrutadores autenticados."
    };
  }
  if (!cleanCurriculoId && !cleanFileId) {
    return {
      statusCode: 400,
      error: "PARAMETRO_INVALIDO: Informe curriculoId ou fileId v\xE1lido."
    };
  }
  const supabaseAdmin = getSupabaseAdmin();
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(cleanToken);
  if (userError || !userData?.user) {
    return {
      statusCode: 401,
      error: "ACESSO_NEGADO: Sess\xE3o de usu\xE1rio inv\xE1lida ou expirada."
    };
  }
  const authUser = userData.user;
  const { data: perfilRow, error: perfilErr } = await supabaseAdmin.from("perfis").select("id, role, ativo").eq("id", authUser.id).maybeSingle();
  if (perfilErr || !perfilRow) {
    return {
      statusCode: 403,
      error: "ACESSO_NEGADO: Perfil interno de recrutador n\xE3o localizado para este usu\xE1rio."
    };
  }
  if (perfilRow.ativo === false) {
    return {
      statusCode: 403,
      error: "ACESSO_BLOQUEADO: Usu\xE1rio institucional desativado."
    };
  }
  const userRole = perfilRow.role;
  let query = supabaseAdmin.from("candidato_curriculos").select("id, candidato_id, google_drive_file_id, nome_arquivo, mime_type, tamanho_bytes");
  if (cleanCurriculoId) {
    query = query.eq("id", cleanCurriculoId);
  } else if (cleanFileId) {
    query = query.eq("google_drive_file_id", cleanFileId);
  }
  const { data: currRow, error: currErr } = await query.maybeSingle();
  if (currErr || !currRow || !currRow.google_drive_file_id) {
    return {
      statusCode: 404,
      error: "CURRICULO_NAO_ENCONTRADO: O curr\xEDculo solicitado n\xE3o foi encontrado no sistema."
    };
  }
  const isGlobalStaff = userRole === "franqueadora_admin" || userRole === "rh_corporativo";
  if (!isGlobalStaff) {
    if (userRole === "gerente" || userRole === "franqueado") {
      const { data: userLojas, error: lojasErr } = await supabaseAdmin.from("usuario_lojas").select("loja_id").eq("user_id", authUser.id);
      if (lojasErr || !userLojas || userLojas.length === 0) {
        return {
          statusCode: 403,
          error: "ACESSO_NEGADO: Nenhuma unidade autorizada vinculada a este usu\xE1rio."
        };
      }
      const allowedLojaIds = new Set(userLojas.map((ul) => ul.loja_id));
      const { data: cands } = await supabaseAdmin.from("candidaturas").select("loja_id").eq("curriculo_id", currRow.id);
      const hasStoreAccess = (cands || []).some(
        (c) => c.loja_id && allowedLojaIds.has(c.loja_id)
      );
      if (!hasStoreAccess) {
        return {
          statusCode: 403,
          error: "ACESSO_NEGADO: Voc\xEA n\xE3o possui autoriza\xE7\xE3o para visualizar curr\xEDculos desta unidade."
        };
      }
    } else {
      return {
        statusCode: 403,
        error: "ACESSO_NEGADO: Papel de usu\xE1rio sem permiss\xE3o para download de curr\xEDculos."
      };
    }
  }
  let emailHash = "0000000000000000000000000000000000000000000000000000000000000000";
  if (currRow.candidato_id) {
    const { data: candRow } = await supabaseAdmin.from("candidatos").select("email").eq("id", currRow.candidato_id).maybeSingle();
    if (candRow?.email) {
      emailHash = crypto4.createHash("sha256").update(candRow.email.toLowerCase().trim()).digest("hex");
    }
  }
  try {
    const { error: insertErr } = await supabaseAdmin.from("logs_acesso_curriculos").insert({
      candidato_id: currRow.candidato_id,
      curriculo_id: currRow.id,
      candidato_email_hash: emailHash,
      google_drive_file_id: currRow.google_drive_file_id,
      usuario_id: authUser.id,
      usuario_role: userRole,
      ip_origem: clientIp || "127.0.0.1",
      user_agent: userAgent || "Painel RH Gigante Pneus",
      motivo_acesso: "Visualiza\xE7\xE3o de Curr\xEDculo no Painel Administrativo"
    });
    if (insertErr) {
      console.error("[Auditoria] Erro ao registrar logs_acesso_curriculos:", JSON.stringify(insertErr));
    }
  } catch (auditErr) {
    console.error("[Auditoria] Exce\xE7\xE3o ao registrar logs_acesso_curriculos:", auditErr?.message);
  }
  try {
    const fileData = await googleDriveStorage.downloadFile(currRow.google_drive_file_id);
    return {
      statusCode: 200,
      buffer: fileData.buffer,
      mimeType: currRow.mime_type || fileData.mimeType || "application/pdf",
      fileName: currRow.nome_arquivo || fileData.name || "curriculo.pdf"
    };
  } catch (downloadErr) {
    console.error("[Backend] Erro ao obter arquivo do Google Drive:", downloadErr?.message);
    return {
      statusCode: 502,
      error: `FALHA_DOWNLOAD_DRIVE: N\xE3o foi poss\xEDvel baixar o arquivo do Google Drive (${downloadErr?.message}).`
    };
  }
}
async function vercelHandler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", ["GET"]);
      return res.status(405).json({ success: false, error: `M\xE9todo ${req.method} n\xE3o permitido.` });
    }
    const authHeader = req.headers?.authorization;
    const bearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const urlObj = new URL(req.url || "/api/curriculos/visualizar", "http://localhost");
    const token = (bearerToken || req.query?.token || urlObj.searchParams.get("token") || "").trim() || void 0;
    const curriculoId = (req.query?.id || req.query?.curriculoId || urlObj.searchParams.get("id") || urlObj.searchParams.get("curriculoId") || "").trim() || void 0;
    const fileId = (req.query?.fileId || urlObj.searchParams.get("fileId") || "").trim() || void 0;
    const clientIp = req.headers?.["x-forwarded-for"]?.split(",")[0].trim() || req.socket?.remoteAddress || "127.0.0.1";
    const userAgent = req.headers?.["user-agent"] || "";
    const result = await handleVisualizarCurriculo({
      curriculoId,
      fileId,
      token,
      clientIp,
      userAgent
    });
    if (result.statusCode === 200 && result.buffer) {
      res.setHeader("Content-Type", result.mimeType || "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${result.fileName || "curriculo.pdf"}"`);
      res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
      return res.status(200).send(result.buffer);
    }
    return res.status(result.statusCode).json({ success: false, error: result.error });
  } catch (err) {
    console.error("[VercelHandler][VisualizarException]", err);
    return res.status(500).json({ success: false, error: err?.message || "Erro interno no servidor." });
  }
}

// src-api/curriculos/download.ts
var download_default = vercelHandler;
export {
  download_default as default
};
