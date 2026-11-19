// src-api/admin/candidatos.ts
import crypto5 from "crypto";
import { createClient as createClient2 } from "@supabase/supabase-js";

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

// services/security/cpfSecurity.ts
import crypto from "crypto";
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
  return crypto.createHmac("sha256", secret).update(cleanCpf).digest("hex");
}
function encryptCpf(cleanCpf, keyHexOverride) {
  const keyHex = keyHexOverride || process.env.CPF_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("CONFIG_ERROR: CPF_ENCRYPTION_KEY inv\xE1lida (deve ser 32 bytes em hexadecimal).");
  }
  const key = Buffer.from(keyHex, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(cleanCpf, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

// services/storage/googleDriveStorage.ts
import crypto4 from "crypto";

// services/storage/googleDriveOAuthAdapter.ts
import crypto3 from "crypto";
import { createClient } from "@supabase/supabase-js";

// services/storage/googleOAuthService.ts
import crypto2 from "crypto";
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
  sanitizeEnvValue(val) {
    if (!val || typeof val !== "string") return "";
    let cleaned = val.trim();
    if (cleaned.startsWith('"') && cleaned.endsWith('"') || cleaned.startsWith("'") && cleaned.endsWith("'")) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    cleaned = cleaned.replace(/[\r\n\t]/g, "").trim();
    return cleaned;
  }
  getConfig() {
    const clientId = this.sanitizeEnvValue(this.configOverride?.clientId ?? process.env.GOOGLE_CLIENT_ID);
    const clientSecret = this.sanitizeEnvValue(this.configOverride?.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET);
    const redirectUri = this.sanitizeEnvValue(
      this.configOverride?.redirectUri ?? process.env.GOOGLE_OAUTH_REDIRECT_URI ?? "https://trabalheconosco.gigantepneus.com.br/api/integracoes/google/callback"
    );
    const refreshToken = this.sanitizeEnvValue(this.configOverride?.refreshToken ?? process.env.GOOGLE_REFRESH_TOKEN);
    const authorizedEmail = this.sanitizeEnvValue(
      this.configOverride?.authorizedEmail ?? process.env.GOOGLE_AUTHORIZED_EMAIL ?? DEFAULT_CORPORATE_EMAIL
    ).toLowerCase();
    const stateSecret = this.sanitizeEnvValue(
      this.configOverride?.stateSecret ?? process.env.GOOGLE_OAUTH_STATE_SECRET ?? (clientSecret || "default-gigante-state-secret")
    );
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
      nonce: crypto2.randomBytes(16).toString("hex"),
      iat: Date.now(),
      exp: Date.now() + 10 * 60 * 1e3,
      // 10 minutos de validade
      sub: adminIdentifier
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
    const signature = crypto2.createHmac("sha256", stateSecret || "state-fallback").update(payloadB64).digest("base64url");
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
    const expectedSig = crypto2.createHmac("sha256", stateSecret || "state-fallback").update(payloadB64).digest("base64url");
    const sigBufferA = Buffer.from(receivedSig);
    const sigBufferB = Buffer.from(expectedSig);
    if (sigBufferA.length !== sigBufferB.length || !crypto2.timingSafeEqual(sigBufferA, sigBufferB)) {
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
      let errorDetail = "";
      try {
        const errJson = await tokenRes.json();
        errorDetail = errJson.error_description || errJson.error || "";
      } catch {
      }
      const safeSuffix = errorDetail ? `: ${errorDetail}` : "";
      throw new Error(`OAUTH_TOKEN_EXCHANGE_FAILED: Google retornou HTTP ${tokenRes.status}${safeSuffix}.`);
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
      let errorDetail = "";
      try {
        const errorJson = await response.json();
        errorDetail = errorJson.error_description || errorJson.error || "";
      } catch {
        try {
          errorDetail = (await response.text()).slice(0, 200);
        } catch {
        }
      }
      const safeSuffix = errorDetail ? `: ${errorDetail}` : "";
      throw new Error(`OAUTH_REFRESH_FAILED: Falha ao renovar access_token (HTTP ${response.status}${safeSuffix}).`);
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
function formatStoreFolderName(loja) {
  let nome = (loja.nome || "").trim();
  const uf = (loja.estado || "").trim().toUpperCase();
  if (!/^gigante\s*pneus/i.test(nome)) {
    nome = `Gigante Pneus \u2013 ${nome}`;
  }
  nome = nome.replace(/\s*[-–—]\s*/g, " \u2013 ");
  if (uf && !new RegExp(`[\u2013-]\\s*${uf}$`, "i").test(nome) && !nome.includes(`/${uf}`)) {
    nome = `${nome} \u2013 ${uf}`;
  }
  return nome;
}
function normalizeCargoSubfolderName(rawTitle) {
  if (!rawTitle || typeof rawTitle !== "string") {
    return "Banco de Talentos - Espont\xE2nea";
  }
  const clean = rawTitle.trim();
  if (!clean || clean.toLowerCase() === "geral" || clean.toLowerCase().includes("espontanea") || clean.toLowerCase().includes("espont\xE2nea") || clean.toLowerCase().includes("banco de talentos")) {
    return "Banco de Talentos - Espont\xE2nea";
  }
  const lower = clean.toLowerCase();
  if (/mecanic|mecânic/i.test(lower)) {
    if (/auxiliar.*(mecanic|mecânic)/i.test(lower)) {
      return "Auxiliar de Mec\xE2nico";
    }
    return "Mec\xE2nico";
  }
  if (/alinhad/i.test(lower)) {
    return "Alinhador";
  }
  if (/vend|comercial|consultor/i.test(lower)) {
    return "Consultor de Vendas";
  }
  if (/estoqu|almoxar/i.test(lower)) {
    return "Estoquista";
  }
  if (/auxiliar.*p[aá]tio/i.test(lower)) {
    return "Auxiliar de P\xE1tio";
  }
  if (/recep|atendent/i.test(lower)) {
    return "Recepcionista";
  }
  return clean.replace(/[/\\?%*:|"<>]/g, " - ").replace(/\s+/g, " ").trim();
}
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
   * Busca uma subpasta pelo nome exato ou normalizado dentro de `parentId` para evitar duplicação de pastas.
   */
  async findSubfolderByName(name, parentId) {
    const token = await this.oauthService.getValidAccessToken();
    const cleanName = name.trim();
    const escapedParent = parentId.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const q = `mimeType = '${FOLDER_MIME_TYPE}' and '${escapedParent}' in parents and trashed = false`;
    const params = new URLSearchParams({
      q,
      fields: "files(id,name,mimeType,parents,trashed,shared)",
      pageSize: "100",
      spaces: "drive"
    });
    const res = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(1e4)
    });
    if (!res.ok) {
      throw new Error(`GDRIVE_FOLDER_SEARCH_ERROR: Erro ao buscar subpastas em '${parentId}' (HTTP ${res.status}).`);
    }
    const data = await res.json();
    if (!data.files || data.files.length === 0) return null;
    const normalize = (s) => s.replace(/[-–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
    const targetNorm = normalize(cleanName);
    const exact = data.files.find((f) => f.name === cleanName);
    if (exact) return exact;
    const normalizedMatch = data.files.find((f) => normalize(f.name) === targetNorm);
    if (normalizedMatch) return normalizedMatch;
    return null;
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
   * Resolve a pasta de destino da unidade franqueada ou corporativo:
   * - Corporativo: GIGANTE PNEUS - RH / 01 - CORPORATIVO
   * - Loja Franqueada: GIGANTE PNEUS - RH / 02 - UNIDADES FRANQUEADAS / Gigante Pneus – [Loja] – [UF]
   */
  async getFolderForStore(lojaId) {
    if (!lojaId || lojaId === "corporativo" || lojaId === "00000000-0000-0000-0000-000000000000") {
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
    let lojaRow = null;
    if (this.supabaseAdmin) {
      try {
        const { data } = await this.supabaseAdmin.from("lojas").select("id, nome, cidade, estado, google_drive_folder_id").eq("id", cleanLojaId).maybeSingle();
        lojaRow = data;
        if (lojaRow?.google_drive_folder_id && !lojaRow.google_drive_folder_id.startsWith("folder_")) {
          try {
            const existingMeta = await this.getFolderMetadata(lojaRow.google_drive_folder_id);
            if (!existingMeta.trashed && existingMeta.mimeType === FOLDER_MIME_TYPE) {
              this.folderCache.set(cleanLojaId, existingMeta.id);
              return existingMeta.id;
            }
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
    const storeFolderName = formatStoreFolderName(lojaRow || { nome: cleanLojaId });
    const storeFolder = await this.createFolder(storeFolderName, unidadesRootId);
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
   * Resolve a hierarquia completa de armazenamento:
   * - Unidade Franqueada: GIGANTE PNEUS - RH / 02 - UNIDADES FRANQUEADAS / Gigante Pneus – [Loja] – [UF] / [Cargo Normalizado]
   * - Corporativo: GIGANTE PNEUS - RH / 01 - CORPORATIVO / [Cargo Normalizado]
   */
  async getFolderForStoreAndCargo(options) {
    const storeFolderId = await this.getFolderForStore(options.lojaId || null);
    let storeFolderName = FOLDER_NAME_CORPORATIVO;
    if (options.lojaId && options.lojaId !== "corporativo") {
      try {
        const meta = await this.getFolderMetadata(storeFolderId);
        storeFolderName = meta.name;
      } catch {
        storeFolderName = "Unidade Franqueada";
      }
    }
    let rawCargo = options.cargoNome?.trim() || null;
    if (!rawCargo && options.cargoId && this.supabaseAdmin) {
      try {
        const { data: cargoRow } = await this.supabaseAdmin.from("cargos").select("titulo").eq("id", options.cargoId.trim()).maybeSingle();
        if (cargoRow?.titulo) {
          rawCargo = cargoRow.titulo;
        }
      } catch {
      }
    }
    const cargoFolderName = normalizeCargoSubfolderName(rawCargo);
    const cacheKey = `cargo_${storeFolderId}_${cargoFolderName}`;
    let targetFolderId = this.folderCache.get(cacheKey);
    if (!targetFolderId) {
      const cargoFolder = await this.createFolder(cargoFolderName, storeFolderId);
      targetFolderId = cargoFolder.id;
      this.folderCache.set(cacheKey, targetFolderId);
    }
    return {
      storeFolderId,
      targetFolderId,
      storeFolderName,
      cargoFolderName
    };
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
      cargoId: directMetadata?.cargoId,
      cargoNome: directMetadata?.cargoNome,
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
    let folderId = options.folderId;
    if (!folderId) {
      const resolved = await this.getFolderForStoreAndCargo({
        lojaId: options.lojaId || null,
        cargoId: options.cargoId || null,
        cargoNome: options.cargoNome || null
      });
      folderId = resolved.targetFolderId;
    } else {
      folderId = (await this.getFolderMetadata(folderId)).id;
    }
    const ext = options.originalName.includes(".") ? options.originalName.split(".").pop()?.toLowerCase() || "pdf" : "pdf";
    const safeExt = ["pdf", "doc", "docx"].includes(ext) ? ext : "pdf";
    const randomToken = crypto3.randomBytes(16).toString("hex");
    const safeFileName = `curriculo_${randomToken}.${safeExt}`;
    const localMd5 = crypto3.createHash("md5").update(options.buffer).digest("hex");
    const boundary = `gigante_drive_boundary_${crypto3.randomBytes(12).toString("hex")}`;
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
    this.defaultUnidadesRootFolderId = "gdrive_folder_unidades_root";
    _GoogleDriveMockAdapter.foldersMap.set(this.defaultCorporateFolderId, {
      id: this.defaultCorporateFolderId,
      name: "01 - CORPORATIVO"
    });
    _GoogleDriveMockAdapter.foldersMap.set(this.defaultUnidadesRootFolderId, {
      id: this.defaultUnidadesRootFolderId,
      name: "02 - UNIDADES FRANQUEADAS"
    });
  }
  static {
    this.filesMap = /* @__PURE__ */ new Map();
  }
  static {
    this.foldersMap = /* @__PURE__ */ new Map();
  }
  async getFolderForStore(lojaId) {
    if (!lojaId) {
      return this.defaultCorporateFolderId;
    }
    const cleanId = lojaId.replace(/[^a-zA-Z0-9]/g, "").substring(0, 12);
    const storeFolderId = `gdrive_folder_loja_${cleanId}`;
    if (!_GoogleDriveMockAdapter.foldersMap.has(storeFolderId)) {
      _GoogleDriveMockAdapter.foldersMap.set(storeFolderId, {
        id: storeFolderId,
        name: `Gigante Pneus \u2013 Loja ${cleanId}`,
        parentId: this.defaultUnidadesRootFolderId
      });
    }
    return storeFolderId;
  }
  async getFolderForStoreAndCargo(options) {
    const storeFolderId = await this.getFolderForStore(options.lojaId || null);
    const storeObj = _GoogleDriveMockAdapter.foldersMap.get(storeFolderId);
    const storeFolderName = options.storeName || storeObj?.name || (options.lojaId ? "Gigante Pneus \u2013 Unidade" : "01 - CORPORATIVO");
    const cargoFolderName = normalizeCargoSubfolderName(options.cargoNome);
    const cargoSlug = cargoFolderName.toLowerCase().replace(/[^a-z0-9]/g, "_").substring(0, 20);
    const targetFolderId = `${storeFolderId}_cargo_${cargoSlug}`;
    if (!_GoogleDriveMockAdapter.foldersMap.has(targetFolderId)) {
      _GoogleDriveMockAdapter.foldersMap.set(targetFolderId, {
        id: targetFolderId,
        name: cargoFolderName,
        parentId: storeFolderId
      });
    }
    return {
      storeFolderId,
      targetFolderId,
      storeFolderName,
      cargoFolderName
    };
  }
  async uploadFile(options) {
    if (options.simulateFailure) {
      throw new Error("GDRIVE_API_ERROR: Falha de comunica\xE7\xE3o ou timeout simulado com a API do Google Drive.");
    }
    let folderId = options.folderId;
    if (!folderId) {
      const hierarchy = await this.getFolderForStoreAndCargo({
        lojaId: options.lojaId || null,
        cargoId: options.cargoId || null,
        cargoNome: options.cargoNome || null
      });
      folderId = hierarchy.targetFolderId;
    }
    const ext = options.originalName.includes(".") ? options.originalName.split(".").pop()?.toLowerCase() || "dat" : "dat";
    const uniqueToken = crypto4.randomBytes(16).toString("hex");
    const safeFileName = `curriculo_${uniqueToken}.${ext}`;
    const fileId = `gdrive_file_${crypto4.randomUUID()}`;
    const md5Checksum = crypto4.createHash("md5").update(options.buffer).digest("hex");
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
  static getFolders() {
    return Array.from(this.foldersMap.values());
  }
  static clearStorage() {
    this.filesMap.clear();
    this.foldersMap.clear();
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
  getFolderForStoreAndCargo(options) {
    const adapter = getActiveStorageAdapter();
    if (adapter.getFolderForStoreAndCargo) {
      return adapter.getFolderForStoreAndCargo(options);
    }
    return adapter.getFolderForStore(options.lojaId || null).then((fid) => ({
      storeFolderId: fid,
      targetFolderId: fid,
      storeFolderName: "Unidade",
      cargoFolderName: "Geral"
    }));
  },
  downloadFile(fileId) {
    const adapter = getActiveStorageAdapter();
    if (adapter.downloadFile) {
      return adapter.downloadFile(fileId);
    }
    throw new Error("GDRIVE_DOWNLOAD_UNSUPPORTED: Adaptador de storage n\xE3o suporta download.");
  }
};

// src-api/admin/candidatos.ts
var supabaseAdminInstance = null;
function getSupabaseAdmin() {
  if (supabaseAdminInstance) return supabaseAdminInstance;
  const supaUrl = process.env.SUPABASE_URL || process.env.SUPABASE_INTERNAL_URL || process.env.VITE_SUPABASE_URL;
  const supaServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !supaServiceKey) {
    throw new Error("CONFIG_ERROR: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente.");
  }
  supabaseAdminInstance = createClient2(supaUrl, supaServiceKey, {
    auth: { persistSession: false }
  });
  return supabaseAdminInstance;
}
function registrarAuditoria(entry) {
  console.log(`[AUDITORIA_ADMIN_CANDIDATOS] ${JSON.stringify(entry)}`);
}
async function verifyCandidatosAuth(token) {
  const rawToken = token?.trim();
  if (!rawToken) {
    return { authorized: false, statusCode: 401, error: "ACESSO_NEGADO: Token de autentica\xE7\xE3o n\xE3o fornecido." };
  }
  const cleanToken = rawToken.replace(/^Bearer\s+/i, "").trim();
  const adminClient = getSupabaseAdmin();
  const { data: userData, error: userError } = await adminClient.auth.getUser(cleanToken);
  if (userError || !userData?.user) {
    return { authorized: false, statusCode: 401, error: "ACESSO_NEGADO: Sess\xE3o de usu\xE1rio inv\xE1lida ou expirada." };
  }
  const userId = userData.user.id;
  const { data: perfil, error: perfilError } = await adminClient.from("perfis").select("id, nome, email, role, ativo").eq("id", userId).maybeSingle();
  if (perfilError || !perfil) {
    return { authorized: false, statusCode: 403, error: "ACESSO_NEGADO: Perfil institucional n\xE3o localizado." };
  }
  if (!perfil.ativo) {
    return { authorized: false, statusCode: 403, error: "ACESSO_NEGADO: Usu\xE1rio institucional desativado." };
  }
  const role = perfil.role;
  const isMasterOrRh = role === "franqueadora_admin" || role === "rh_corporativo";
  const isFranqueado = role === "franqueado";
  const isGerente = role === "gerente";
  let lojasAutorizadasIds = [];
  if (isFranqueado || isGerente) {
    const { data: ulData, error: ulError } = await adminClient.from("usuario_lojas").select("loja_id").eq("user_id", userId);
    if (ulError) {
      return { authorized: false, statusCode: 500, error: "Erro ao consultar unidades do operador." };
    }
    lojasAutorizadasIds = (ulData || []).map((item) => item.loja_id).filter(Boolean);
    if (lojasAutorizadasIds.length === 0) {
      return { authorized: false, statusCode: 403, error: "ACESSO_NEGADO: Usu\xE1rio operacional sem unidades autorizadas." };
    }
  }
  return {
    authorized: true,
    context: {
      userId,
      email: perfil.email || userData.user.email || "",
      nome: perfil.nome || "Operador RH",
      role,
      isMasterOrRh,
      isFranqueado,
      isGerente,
      lojasAutorizadasIds
    }
  };
}
async function handleListarCandidatos(filtros = {}, token) {
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
    let query = adminClient.from("candidaturas").select(`
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
      `, { count: "exact" });
    if (!isMasterOrRh) {
      if (filtros.lojaId) {
        if (!lojasAutorizadasIds.includes(filtros.lojaId)) {
          return { statusCode: 403, data: { success: false, error: "ACESSO_NEGADO: Unidade n\xE3o permitida para seu perfil." } };
        }
        query = query.eq("loja_id", filtros.lojaId);
      } else {
        query = query.in("loja_id", lojasAutorizadasIds);
      }
    } else if (filtros.lojaId) {
      query = query.eq("loja_id", filtros.lojaId);
    }
    if (filtros.status && filtros.status !== "todos") {
      query = query.eq("status", filtros.status);
    }
    if (filtros.cargo) {
      query = query.ilike("vaga_interesse", `%${filtros.cargo.trim()}%`);
    }
    if (filtros.nome) {
      query = query.ilike("candidatos.nome", `%${filtros.nome.trim()}%`);
    }
    if (filtros.email) {
      query = query.ilike("candidatos.email", `%${filtros.email.trim()}%`);
    }
    if (filtros.telefone) {
      query = query.ilike("candidatos.telefone", `%${filtros.telefone.trim()}%`);
    }
    if (filtros.cidade) {
      query = query.ilike("candidatos.cidade", `%${filtros.cidade.trim()}%`);
    }
    if (filtros.estado) {
      query = query.eq("candidatos.estado", filtros.estado.trim().toUpperCase());
    }
    if (filtros.origem) {
      query = query.eq("candidatos.origem", filtros.origem.trim());
    }
    query = query.order("criado_em", { ascending: false }).range(offset, offset + limit - 1);
    const { data: rows, count, error } = await query;
    if (error) {
      return { statusCode: 500, data: { success: false, error: `Erro na consulta: ${error.message}` } };
    }
    const items = (rows || []).map((row) => {
      const cand = row.candidatos || {};
      const loja = row.lojas || {};
      const rawCurr = row.candidato_curriculos;
      const curr = Array.isArray(rawCurr) ? rawCurr[0] : rawCurr;
      const isCpfPendente = cand.origem === "migracao_drive" || cand.cpf_mascarado === "***.***.***-**" || (cand.cpf_mascarado || "").includes("Pendente");
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
        cpf_status: isCpfPendente ? "pendente_migracao" : "validado",
        cpf_mascarado: isCpfPendente ? "CPF Pendente (Migra\xE7\xE3o)" : cand.cpf_mascarado,
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
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      operador: auth.context,
      operacao: "LISTAR_CANDIDATOS",
      resultado: "SUCESSO",
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
  } catch (err) {
    return { statusCode: 500, data: { success: false, error: err.message || "Erro interno" } };
  }
}
async function handleConsultarCandidato(candidatoId, token) {
  const auth = await verifyCandidatosAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, error: auth.error } };
  }
  const { isMasterOrRh, lojasAutorizadasIds } = auth.context;
  if (!candidatoId || !candidatoId.trim()) {
    return { statusCode: 400, data: { success: false, error: "ID do candidato (UUID) \xE9 obrigat\xF3rio." } };
  }
  const adminClient = getSupabaseAdmin();
  try {
    const { data: cand, error: candErr } = await adminClient.from("candidatos").select("*").eq("id", candidatoId.trim()).maybeSingle();
    if (candErr || !cand) {
      return { statusCode: 404, data: { success: false, error: "Candidato n\xE3o localizado." } };
    }
    const { data: cands, error: candsErr } = await adminClient.from("candidaturas").select(`
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
      `).eq("candidato_id", candidatoId.trim()).order("criado_em", { ascending: false });
    if (candsErr) {
      return { statusCode: 500, data: { success: false, error: `Erro ao buscar candidaturas: ${candsErr.message}` } };
    }
    if (!isMasterOrRh) {
      const temAcesso = (cands || []).some((c) => c.loja_id && lojasAutorizadasIds.includes(c.loja_id));
      if (!temAcesso) {
        return { statusCode: 403, data: { success: false, error: "ACESSO_NEGADO: Candidato n\xE3o vinculado a nenhuma de suas unidades autorizadas." } };
      }
    }
    const { data: curriculos, error: currErr } = await adminClient.from("candidato_curriculos").select("id, nome_arquivo, mime_type, tamanho_bytes, upload_status, criado_em").eq("candidato_id", candidatoId.trim()).order("criado_em", { ascending: false });
    const curriculosFormatados = (curriculos || []).map((c) => ({
      id: c.id,
      nome_arquivo: c.nome_arquivo,
      mime_type: c.mime_type,
      tamanho_bytes: c.tamanho_bytes,
      upload_status: c.upload_status,
      criado_em: c.criado_em,
      url_visualizacao: `/api/curriculos/visualizar?id=${c.id}`
    }));
    const isCpfPendente = !cand.cpf_criptografado || cand.origem === "migracao_drive" || cand.cpf_mascarado === "***.***.***-**" || (cand.cpf_mascarado || "").includes("Pendente");
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
          cpf_status: isCpfPendente ? "pendente_migracao" : "validado",
          cpf_mascarado: isCpfPendente ? "CPF Pendente (Migra\xE7\xE3o)" : cand.cpf_mascarado,
          cpf_informado: !isCpfPendente,
          criado_em: cand.criado_em,
          atualizado_em: cand.atualizado_em,
          candidaturas: (cands || []).map((c) => ({
            id: c.id,
            cargo_id: c.cargo_id,
            loja: c.lojas ? { id: c.lojas.id, nome: c.lojas.nome, cidade: c.lojas.cidade } : null,
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
  } catch (err) {
    return { statusCode: 500, data: { success: false, error: err.message || "Erro interno" } };
  }
}
async function handleVerificarDuplicidade(params, token) {
  const auth = await verifyCandidatosAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, error: auth.error } };
  }
  const adminClient = getSupabaseAdmin();
  const correspondencias = [];
  const vistos = /* @__PURE__ */ new Set();
  try {
    if (params.email && params.email.trim()) {
      const cleanEmail = params.email.trim().toLowerCase();
      const { data: rowsEmail } = await adminClient.from("candidatos").select("id, nome, email, telefone, cpf_mascarado").ilike("email", cleanEmail);
      for (const r of rowsEmail || []) {
        if (!vistos.has(r.id)) {
          vistos.add(r.id);
          correspondencias.push({
            candidato_id: r.id,
            nome: r.nome,
            email: r.email,
            telefone: r.telefone,
            cpf_mascarado: r.cpf_mascarado,
            tipo_correspondencia: "email_exato",
            score_confianca: "alto"
          });
        }
      }
    }
    if (params.cpf && params.cpf.trim()) {
      const cpfVal = validateCpf(params.cpf);
      if (cpfVal.valid) {
        const cpfHash = generateCpfHash(cpfVal.cleanCpf);
        const { data: rowsCpf } = await adminClient.from("candidatos").select("id, nome, email, telefone, cpf_mascarado").eq("cpf_hash", cpfHash);
        for (const r of rowsCpf || []) {
          if (!vistos.has(r.id)) {
            vistos.add(r.id);
            correspondencias.push({
              candidato_id: r.id,
              nome: r.nome,
              email: r.email,
              telefone: r.telefone,
              cpf_mascarado: r.cpf_mascarado,
              tipo_correspondencia: "cpf_exato",
              score_confianca: "alto"
            });
          }
        }
      }
    }
    if (params.telefone && params.telefone.trim()) {
      const cleanPhone = params.telefone.replace(/\D/g, "");
      if (cleanPhone.length >= 8) {
        const phoneSuffix = cleanPhone.slice(-8);
        const { data: rowsTel } = await adminClient.from("candidatos").select("id, nome, email, telefone, cpf_mascarado").ilike("telefone", `%${phoneSuffix}%`);
        for (const r of rowsTel || []) {
          if (!vistos.has(r.id)) {
            vistos.add(r.id);
            correspondencias.push({
              candidato_id: r.id,
              nome: r.nome,
              email: r.email,
              telefone: r.telefone,
              cpf_mascarado: r.cpf_mascarado,
              tipo_correspondencia: "telefone_semelhante",
              score_confianca: "medio"
            });
          }
        }
      }
    }
    if (params.nome && params.nome.trim().length >= 4) {
      const cleanNome = params.nome.trim();
      const { data: rowsNome } = await adminClient.from("candidatos").select("id, nome, email, telefone, cpf_mascarado").ilike("nome", `%${cleanNome}%`).limit(5);
      for (const r of rowsNome || []) {
        if (!vistos.has(r.id)) {
          vistos.add(r.id);
          correspondencias.push({
            candidato_id: r.id,
            nome: r.nome,
            email: r.email,
            telefone: r.telefone,
            cpf_mascarado: r.cpf_mascarado,
            tipo_correspondencia: "nome_semelhante",
            score_confianca: "baixo"
          });
        }
      }
    }
    const duplicidadeEncontrada = correspondencias.length > 0;
    const temCorrespondenciaExata = correspondencias.some((c) => c.score_confianca === "alto");
    return {
      statusCode: 200,
      data: {
        success: true,
        duplicidade_encontrada: duplicidadeEncontrada,
        recomendacao: temCorrespondenciaExata ? "Candidato j\xE1 cadastrado no sistema. Utilize o candidato_id correspondente para associar novas unidades ou curr\xEDculos." : duplicidadeEncontrada ? "Poss\xEDvel duplicidade identificada por telefone ou nome. Verifique os dados antes de cadastrar." : "Nenhuma duplicidade encontrada. Apto para cria\xE7\xE3o.",
        total_correspondencias: correspondencias.length,
        correspondencias
      }
    };
  } catch (err) {
    return { statusCode: 500, data: { success: false, error: err.message || "Erro interno" } };
  }
}
async function handleCriarCandidato(payload, token) {
  const auth = await verifyCandidatosAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, error: auth.error } };
  }
  if (!payload.nome || payload.nome.trim().length < 2) {
    return { statusCode: 400, data: { success: false, error: "Nome do candidato \xE9 obrigat\xF3rio (m\xEDn. 2 caracteres)." } };
  }
  if (!payload.email || !payload.email.includes("@")) {
    return { statusCode: 400, data: { success: false, error: "E-mail v\xE1lido \xE9 obrigat\xF3rio." } };
  }
  if (!payload.telefone || payload.telefone.trim().length < 8) {
    return { statusCode: 400, data: { success: false, error: "Telefone de contato \xE9 obrigat\xF3rio." } };
  }
  const adminClient = getSupabaseAdmin();
  const cleanEmail = payload.email.trim().toLowerCase();
  try {
    const { data: candExistente } = await adminClient.from("candidatos").select("id, nome, email, telefone, cpf_mascarado, criado_em").eq("email", cleanEmail).maybeSingle();
    if (candExistente) {
      return {
        statusCode: 200,
        data: {
          success: true,
          ja_existente: true,
          candidato_id: candExistente.id,
          mensagem: "Candidato j\xE1 cadastrado com este e-mail. Registro reaproveitado com sucesso.",
          candidato: candExistente
        }
      };
    }
    let cpfHash;
    let cpfMascarado;
    let cpfCriptografado = null;
    const isCpfPendente = !payload.cpf || !payload.cpf.trim();
    if (!isCpfPendente) {
      const cpfVal = validateCpf(payload.cpf);
      if (cpfVal.valid) {
        cpfHash = generateCpfHash(cpfVal.cleanCpf);
        cpfMascarado = maskCpf(cpfVal.cleanCpf);
        cpfCriptografado = encryptCpf(cpfVal.cleanCpf);
        const { data: candCpf } = await adminClient.from("candidatos").select("id, nome, email").eq("cpf_hash", cpfHash).maybeSingle();
        if (candCpf) {
          return {
            statusCode: 409,
            data: {
              success: false,
              candidato_id: candCpf.id,
              error: `J\xE1 existe um candidato cadastrado com este CPF (${candCpf.email}).`
            }
          };
        }
      } else {
        return { statusCode: 400, data: { success: false, error: `CPF inv\xE1lido: ${cpfVal.error}` } };
      }
    } else {
      cpfHash = crypto5.createHash("sha256").update(`MIGRACAO_${cleanEmail}`).digest("hex");
      cpfMascarado = "CPF Pendente";
      cpfCriptografado = null;
    }
    const { data: novoCandidato, error: insertErr } = await adminClient.from("candidatos").insert({
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
      consentimento_versao: "mcp-migracao-2026",
      consentimento_em: (/* @__PURE__ */ new Date()).toISOString(),
      retencao_meses: 12,
      retencao_ate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1e3).toISOString(),
      origem: payload.origem?.trim() || "migracao_drive"
    }).select("id, nome, email, telefone, cidade, estado, origem, criado_em").single();
    if (insertErr || !novoCandidato) {
      return { statusCode: 500, data: { success: false, error: `Erro ao criar candidato: ${insertErr?.message}` } };
    }
    registrarAuditoria({
      requestId: `req_${Date.now()}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      operador: auth.context,
      operacao: "CRIAR_CANDIDATO",
      registroAfetado: { tipo: "candidatos", id: novoCandidato.id },
      resultado: "SUCESSO",
      detalhes: { nome: novoCandidato.nome, email: novoCandidato.email, origem: novoCandidato.origem, isCpfPendente }
    });
    return {
      statusCode: 201,
      data: {
        success: true,
        candidato_id: novoCandidato.id,
        mensagem: isCpfPendente ? "Candidato cadastrado no Banco de Talentos com CPF pendente (registro de migra\xE7\xE3o)." : "Candidato cadastrado com sucesso no Banco de Talentos.",
        candidato: {
          ...novoCandidato,
          cpf_status: isCpfPendente ? "pendente_migracao" : "validado",
          cpf_mascarado: isCpfPendente ? "CPF Pendente (Migra\xE7\xE3o)" : cpfMascarado,
          cpf_informado: !isCpfPendente
        }
      }
    };
  } catch (err) {
    return { statusCode: 500, data: { success: false, error: err.message || "Erro interno" } };
  }
}
async function handleEditarCandidato(payload, token) {
  const auth = await verifyCandidatosAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, error: auth.error } };
  }
  if (!payload.candidatoId || !payload.candidatoId.trim()) {
    return { statusCode: 400, data: { success: false, error: "ID do candidato (UUID) \xE9 obrigat\xF3rio." } };
  }
  const adminClient = getSupabaseAdmin();
  const updateData = {
    atualizado_em: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (payload.nome && payload.nome.trim()) updateData.nome = payload.nome.trim();
  if (payload.email && payload.email.trim()) updateData.email = payload.email.trim().toLowerCase();
  if (payload.telefone && payload.telefone.trim()) updateData.telefone = payload.telefone.trim();
  if (payload.cidade !== void 0) updateData.cidade = payload.cidade?.trim() || null;
  if (payload.estado !== void 0) updateData.estado = payload.estado?.trim().toUpperCase() || null;
  if (payload.escolaridade !== void 0) updateData.escolaridade = payload.escolaridade?.trim() || null;
  if (payload.linkedinUrl !== void 0) updateData.linkedin_url = payload.linkedinUrl?.trim() || null;
  if (payload.aceitaOutrasVagas !== void 0) updateData.aceita_outras_vagas = Boolean(payload.aceitaOutrasVagas);
  try {
    const { data: updated, error } = await adminClient.from("candidatos").update(updateData).eq("id", payload.candidatoId.trim()).select("id, nome, email, telefone, cidade, estado, atualizado_em").single();
    if (error || !updated) {
      return { statusCode: 500, data: { success: false, error: `Erro ao atualizar candidato: ${error?.message}` } };
    }
    registrarAuditoria({
      requestId: `req_${Date.now()}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      operador: auth.context,
      operacao: "EDITAR_CANDIDATO",
      registroAfetado: { tipo: "candidatos", id: payload.candidatoId },
      resultado: "SUCESSO",
      detalhes: { camposAtualizados: Object.keys(updateData) }
    });
    return {
      statusCode: 200,
      data: {
        success: true,
        mensagem: "Dados do candidato atualizados com sucesso.",
        candidato: updated
      }
    };
  } catch (err) {
    return { statusCode: 500, data: { success: false, error: err.message || "Erro interno" } };
  }
}
async function handleAnexarCurriculo(payload, token) {
  const auth = await verifyCandidatosAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, error: auth.error } };
  }
  if (!payload.candidatoId || !payload.candidatoId.trim()) {
    return { statusCode: 400, data: { success: false, error: "candidatoId (UUID) \xE9 obrigat\xF3rio." } };
  }
  if (!payload.arquivoBase64 || !payload.nomeArquivo) {
    return { statusCode: 400, data: { success: false, error: "arquivoBase64 e nomeArquivo s\xE3o obrigat\xF3rios." } };
  }
  const adminClient = getSupabaseAdmin();
  try {
    const { data: cand, error: candErr } = await adminClient.from("candidatos").select("id, nome, email").eq("id", payload.candidatoId.trim()).maybeSingle();
    if (candErr || !cand) {
      return { statusCode: 404, data: { success: false, error: "Candidato n\xE3o localizado para anexa\xE7\xE3o." } };
    }
    const cleanBase64 = payload.arquivoBase64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    const fileValidation = validateCurriculoFile(buffer, payload.nomeArquivo, payload.mimeType);
    if (!fileValidation.valid) {
      return {
        statusCode: 400,
        data: { success: false, error: fileValidation.error || "Arquivo de curr\xEDculo inv\xE1lido." }
      };
    }
    const detectedMime = fileValidation.detectedMimeType || payload.mimeType || "application/pdf";
    const md5Checksum = crypto5.createHash("md5").update(buffer).digest("hex");
    const { data: currExistente } = await adminClient.from("candidato_curriculos").select("id, nome_arquivo, tamanho_bytes, criado_em").eq("candidato_id", cand.id).eq("md5_checksum", md5Checksum).maybeSingle();
    if (currExistente) {
      return {
        statusCode: 200,
        data: {
          success: true,
          ja_anexado: true,
          curriculo_id: currExistente.id,
          mensagem: "Este mesmo arquivo de curr\xEDculo j\xE1 est\xE1 anexado ao candidato.",
          url_visualizacao: `/api/curriculos/visualizar?id=${currExistente.id}`
        }
      };
    }
    let resolvedLojaId = payload.lojaId?.trim() || null;
    let resolvedCargoId = payload.cargoId?.trim() || null;
    let resolvedCargoNome = payload.cargo?.trim() || null;
    if (!resolvedLojaId || !resolvedCargoId && !resolvedCargoNome) {
      const { data: candidaturas } = await adminClient.from("candidaturas").select("id, loja_id, cargo_id, status, cargos(titulo, departamento)").eq("candidato_id", cand.id).order("criado_em", { ascending: false });
      if (candidaturas && candidaturas.length > 0) {
        const candAtiva = candidaturas.find((c) => c.status !== "Reprovado" && c.status !== "Desistente") || candidaturas[0];
        if (!resolvedLojaId && candAtiva.loja_id) {
          resolvedLojaId = candAtiva.loja_id;
        }
        if (!resolvedCargoId && !resolvedCargoNome) {
          resolvedCargoId = candAtiva.cargo_id || null;
          const cargoObj = candAtiva.cargos;
          resolvedCargoNome = cargoObj?.titulo || null;
        }
      }
    }
    const isCorporativoExplicit = resolvedLojaId === "corporativo" || resolvedLojaId === "00000000-0000-0000-0000-000000000000";
    if (!resolvedLojaId && !isCorporativoExplicit) {
      return {
        statusCode: 422,
        data: {
          success: false,
          error: "INFORMACOES_UNIDADE_AUSENTES: O candidato n\xE3o possui unidade vinculada nem candidaturas ativas para direcionamento da pasta no Google Drive. Informe lojaId e/ou cargo no payload para anexar o curr\xEDculo na pasta correta."
        }
      };
    }
    let driveUpload;
    try {
      driveUpload = await googleDriveStorage.uploadFile({
        buffer,
        originalName: payload.nomeArquivo,
        mimeType: detectedMime,
        lojaId: isCorporativoExplicit ? null : resolvedLojaId,
        cargoId: resolvedCargoId,
        cargoNome: resolvedCargoNome
      });
    } catch (driveErr) {
      return {
        statusCode: 502,
        data: {
          success: false,
          error: `Falha no armazenamento do Google Drive: ${driveErr.message}`
        }
      };
    }
    const { data: novoCurriculo, error: insertCurrErr } = await adminClient.from("candidato_curriculos").insert({
      candidato_id: cand.id,
      google_drive_file_id: driveUpload.fileId,
      google_drive_folder_id: driveUpload.folderId,
      nome_arquivo: driveUpload.fileName || payload.nomeArquivo,
      mime_type: driveUpload.mimeType || detectedMime,
      tamanho_bytes: driveUpload.tamanhoBytes || buffer.length,
      md5_checksum: md5Checksum,
      upload_status: "concluido"
    }).select("id, nome_arquivo, mime_type, tamanho_bytes, criado_em").single();
    if (insertCurrErr || !novoCurriculo) {
      try {
        await googleDriveStorage.deleteFile(driveUpload.fileId);
      } catch {
      }
      return {
        statusCode: 500,
        data: { success: false, error: `Erro ao registrar curr\xEDculo no banco: ${insertCurrErr?.message}` }
      };
    }
    await adminClient.from("candidaturas").update({ curriculo_id: novoCurriculo.id }).eq("candidato_id", cand.id).is("curriculo_id", null);
    registrarAuditoria({
      requestId: `req_${Date.now()}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      operador: auth.context,
      operacao: "ANEXAR_CURRICULO",
      registroAfetado: { tipo: "candidato_curriculos", id: novoCurriculo.id },
      resultado: "SUCESSO",
      detalhes: { candidatoId: cand.id, nomeArquivo: novoCurriculo.nome_arquivo }
    });
    return {
      statusCode: 201,
      data: {
        success: true,
        curriculo_id: novoCurriculo.id,
        nome_arquivo: novoCurriculo.nome_arquivo,
        tamanho_bytes: novoCurriculo.tamanho_bytes,
        mensagem: "Curr\xEDculo anexado e armazenado com sucesso no Google Drive corporativo.",
        url_visualizacao: `/api/curriculos/visualizar?id=${novoCurriculo.id}`
      }
    };
  } catch (err) {
    return { statusCode: 500, data: { success: false, error: err.message || "Erro interno" } };
  }
}
async function handleConsultarCurriculos(candidatoId, tokenOrCurriculoId, maybeToken) {
  let curriculoId;
  let token;
  if (maybeToken !== void 0) {
    curriculoId = tokenOrCurriculoId || void 0;
    token = maybeToken;
  } else {
    token = tokenOrCurriculoId;
  }
  const auth = await verifyCandidatosAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, error: auth.error } };
  }
  if (!candidatoId && !curriculoId) {
    return { statusCode: 400, data: { success: false, error: "Informe candidatoId ou curriculoId." } };
  }
  const adminClient = getSupabaseAdmin();
  try {
    let query = adminClient.from("candidato_curriculos").select("id, candidato_id, nome_arquivo, mime_type, tamanho_bytes, upload_status, criado_em");
    if (curriculoId) {
      query = query.eq("id", curriculoId.trim());
    } else if (candidatoId) {
      query = query.eq("candidato_id", candidatoId.trim());
    }
    const { data: rows, error } = await query.order("criado_em", { ascending: false });
    if (error) {
      return { statusCode: 500, data: { success: false, error: `Erro na consulta: ${error.message}` } };
    }
    const curriculos = (rows || []).map((c) => ({
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
  } catch (err) {
    return { statusCode: 500, data: { success: false, error: err.message || "Erro interno" } };
  }
}
function sanitizarApresentacaoPessoal(texto) {
  if (!texto || !texto.trim()) {
    return "Candidato importado e vinculado ao Banco de Talentos da unidade atrav\xE9s do MCP Administrativo Trabalhe Conosco Gigante Pneus.";
  }
  const clean = texto.trim();
  if (clean.length < 80) {
    return `${clean} \u2014 Cadastro registrado e integrado ao Banco de Talentos via MCP Administrativo Gigante Pneus.`;
  }
  return clean.slice(0, 2e3);
}
async function handleVincularCandidatoLoja(payload, token) {
  const auth = await verifyCandidatosAuth(token);
  if (!auth.authorized || !auth.context) {
    return { statusCode: auth.statusCode || 401, data: { success: false, error: auth.error } };
  }
  const { isMasterOrRh, lojasAutorizadasIds } = auth.context;
  if (!payload.candidatoId || !payload.lojaId) {
    return { statusCode: 400, data: { success: false, error: "candidatoId e lojaId s\xE3o obrigat\xF3rios." } };
  }
  if (!isMasterOrRh && !lojasAutorizadasIds.includes(payload.lojaId)) {
    return { statusCode: 403, data: { success: false, error: "ACESSO_NEGADO: Voc\xEA n\xE3o tem permiss\xE3o para vincular candidatos a esta unidade." } };
  }
  const adminClient = getSupabaseAdmin();
  try {
    const [{ data: cand }, { data: loja }] = await Promise.all([
      adminClient.from("candidatos").select("id, nome, email, telefone").eq("id", payload.candidatoId).maybeSingle(),
      adminClient.from("lojas").select("id, nome, cidade, estado, ativa").eq("id", payload.lojaId).maybeSingle()
    ]);
    if (!cand) return { statusCode: 404, data: { success: false, error: "Candidato n\xE3o localizado." } };
    if (!loja) return { statusCode: 404, data: { success: false, error: "Unidade (loja) n\xE3o localizada." } };
    if (!loja.ativa) return { statusCode: 400, data: { success: false, error: "Unidade temporariamente desativada." } };
    const cargoPretendido = (payload.cargoPretendido || "Banco de Talentos").trim();
    const { data: ultCurr } = await adminClient.from("candidato_curriculos").select("id").eq("candidato_id", cand.id).order("criado_em", { ascending: false }).limit(1).maybeSingle();
    const { data: candExistente } = await adminClient.from("candidaturas").select("id, status, vaga_interesse, criado_em").eq("candidato_id", cand.id).eq("loja_id", loja.id).is("cargo_id", null).maybeSingle();
    if (candExistente) {
      const { data: candAtualizada, error: updErr } = await adminClient.from("candidaturas").update({
        vaga_interesse: cargoPretendido,
        status: "Banco de Talentos",
        curriculo_id: ultCurr?.id || null,
        apresentacao_pessoal: sanitizarApresentacaoPessoal(payload.apresentacaoPessoal),
        experiencia_profissional: payload.experienciaProfissional || {},
        atualizado_em: (/* @__PURE__ */ new Date()).toISOString()
      }).eq("id", candExistente.id).select("id, candidato_id, loja_id, vaga_interesse, status").single();
      if (updErr) {
        return { statusCode: 500, data: { success: false, error: `Erro ao atualizar v\xEDnculo: ${updErr.message}` } };
      }
      return {
        statusCode: 200,
        data: {
          success: true,
          ja_vinculado: true,
          tipo_vinculo: "banco_de_talentos",
          vaga_aberta: false,
          notificacoes_disparadas: false,
          candidatura_id: candAtualizada.id,
          loja: { id: loja.id, nome: loja.nome, cidade: loja.cidade, estado: loja.estado },
          mensagem: `Candidato j\xE1 estava vinculado \xE0 unidade ${loja.nome}. Registro atualizado no Banco de Talentos (n\xE3o vinculado a vaga aberta).`,
          vinculo: candAtualizada
        }
      };
    }
    const { data: novaCandidatura, error: insertCandErr } = await adminClient.from("candidaturas").insert({
      candidato_id: cand.id,
      cargo_id: null,
      loja_id: loja.id,
      curriculo_id: ultCurr?.id || null,
      vaga_interesse: cargoPretendido || "Banco de Talentos Geral",
      status: "Banco de Talentos",
      apresentacao_pessoal: sanitizarApresentacaoPessoal(payload.apresentacaoPessoal),
      experiencia_profissional: payload.experienciaProfissional || {},
      dados_formulario: {
        origem: "mcp_migracao_drive",
        tipo_registro: "banco_de_talentos",
        vaga_aberta: false,
        disparo_mensagens: false,
        notificacoes_automaticas_desativadas: true,
        nome: cand.nome,
        email: cand.email,
        telefone: cand.telefone,
        loja_nome: loja.nome,
        observacao_vinculo: "Registro alocado diretamente no Banco de Talentos da unidade. N\xE3o associado a vaga aberta."
      }
    }).select("id, candidato_id, loja_id, vaga_interesse, status, criado_em").single();
    if (insertCandErr || !novaCandidatura) {
      return { statusCode: 500, data: { success: false, error: `Erro ao criar v\xEDnculo: ${insertCandErr?.message}` } };
    }
    registrarAuditoria({
      requestId: `req_${Date.now()}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      operador: auth.context,
      operacao: "VINCULAR_CANDIDATO_LOJA",
      registroAfetado: { tipo: "candidaturas", id: novaCandidatura.id, lojaId: loja.id },
      resultado: "SUCESSO",
      detalhes: { candidatoId: cand.id, lojaId: loja.id, cargoPretendido, tipoVinculo: "banco_de_talentos", vagaAberta: false }
    });
    return {
      statusCode: 201,
      data: {
        success: true,
        tipo_vinculo: "banco_de_talentos",
        vaga_aberta: false,
        notificacoes_disparadas: false,
        candidatura_id: novaCandidatura.id,
        candidato_id: cand.id,
        loja: { id: loja.id, nome: loja.nome, cidade: loja.cidade, estado: loja.estado },
        vaga_interesse: novaCandidatura.vaga_interesse,
        status: novaCandidatura.status,
        mensagem: `Candidato vinculado com sucesso ao Banco de Talentos da unidade ${loja.nome}. O registro n\xE3o conta como candidatura a vaga aberta e n\xE3o dispara mensagens autom\xE1ticas.`
      }
    };
  } catch (err) {
    return { statusCode: 500, data: { success: false, error: err.message || "Erro interno" } };
  }
}
async function vercelAdminCandidatosHandler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET") {
      const candidatoId = url.searchParams.get("id");
      const modo = url.searchParams.get("modo");
      if (modo === "curriculos" || url.pathname.endsWith("/curriculos")) {
        const id = candidatoId || url.searchParams.get("candidatoId");
        if (!id) return res.status(400).json({ success: false, error: "ID do candidato obrigat\xF3rio." });
        const result2 = await handleConsultarCurriculos(id, token);
        return res.status(result2.statusCode).json(result2.data);
      }
      if (modo === "duplicidade" || url.searchParams.get("duplicidade")) {
        const result2 = await handleVerificarDuplicidade({
          email: url.searchParams.get("email") || void 0,
          telefone: url.searchParams.get("telefone") || void 0,
          cpf: url.searchParams.get("cpf") || void 0,
          nome: url.searchParams.get("nome") || void 0
        }, token);
        return res.status(result2.statusCode).json(result2.data);
      }
      if (candidatoId) {
        const result2 = await handleConsultarCandidato(candidatoId, token);
        return res.status(result2.statusCode).json(result2.data);
      }
      const filtros = {
        nome: url.searchParams.get("nome") || void 0,
        email: url.searchParams.get("email") || void 0,
        telefone: url.searchParams.get("telefone") || void 0,
        cidade: url.searchParams.get("cidade") || void 0,
        estado: url.searchParams.get("estado") || void 0,
        lojaId: url.searchParams.get("lojaId") || void 0,
        cargo: url.searchParams.get("cargo") || void 0,
        status: url.searchParams.get("status") || void 0,
        origem: url.searchParams.get("origem") || void 0,
        page: url.searchParams.get("page") ? Number(url.searchParams.get("page")) : 1,
        limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 20
      };
      const result = await handleListarCandidatos(filtros, token);
      return res.status(result.statusCode).json(result.data);
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const acao = body?.acao || url.searchParams.get("acao");
      if (acao === "duplicidade" || acao === "verificar_duplicidade") {
        const result2 = await handleVerificarDuplicidade(body, token);
        return res.status(result2.statusCode).json(result2.data);
      }
      if (acao === "anexar_curriculo" || acao === "curriculo") {
        const result2 = await handleAnexarCurriculo(body, token);
        return res.status(result2.statusCode).json(result2.data);
      }
      if (acao === "vincular_loja" || acao === "vincular") {
        const result2 = await handleVincularCandidatoLoja(body, token);
        return res.status(result2.statusCode).json(result2.data);
      }
      const result = await handleCriarCandidato(body, token);
      return res.status(result.statusCode).json(result.data);
    }
    if (req.method === "PATCH" || req.method === "PUT") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const candidatoId = url.searchParams.get("id") || body?.candidatoId || body?.id;
      const result = await handleEditarCandidato({ ...body, candidatoId }, token);
      return res.status(result.statusCode).json(result.data);
    }
    res.setHeader("Allow", ["GET", "POST", "PATCH", "PUT"]);
    return res.status(405).json({ success: false, mensagem: `M\xE9todo ${req.method} n\xE3o permitido.` });
  } catch (err) {
    return res.status(500).json({ success: false, mensagem: err?.message || "Erro interno no servidor." });
  }
}
export {
  vercelAdminCandidatosHandler as default,
  handleAnexarCurriculo,
  handleConsultarCandidato,
  handleConsultarCurriculos,
  handleCriarCandidato,
  handleEditarCandidato,
  handleListarCandidatos,
  handleVerificarDuplicidade,
  handleVincularCandidatoLoja,
  registrarAuditoria,
  verifyCandidatosAuth
};
