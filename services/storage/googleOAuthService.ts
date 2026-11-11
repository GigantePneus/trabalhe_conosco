import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const DEFAULT_CORPORATE_EMAIL = 'mktgigantepneus@gmail.com';
export const DEFAULT_ROOT_FOLDER_ID = '1t1GNXOmaJtpzcUeP60osfN1I_Fyav7FD';
export const FORBIDDEN_PERSONAL_ACCOUNTS = ['alexignaciomkt', 'alexignaciomkt@gmail.com'];

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken?: string;
  authorizedEmail?: string;
  stateSecret?: string;
  persistRefreshTokenLocally?: boolean;
  envFilePath?: string;
}

export interface TokenRefreshResult {
  accessToken: string;
  expiresIn: number;
  scope: string;
  tokenType: string;
}

export interface OAuthCallbackResult {
  success: boolean;
  authorizedEmail: string;
  hasRefreshToken: boolean;
  scope: string;
  expiresIn: number;
  refreshTokenObtained?: boolean;
  persistedLocally?: boolean;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * Serviço de gerenciamento OAuth 2.0 exclusivo para o Backend.
 * Compatível com Vercel Serverless Functions (stateless HMAC state + proteção anti-replay + cache em memória).
 * Nunca expõe tokens em logs, URLs ou respostas públicas.
 */
export class GoogleOAuthService {
  private static consumedStateNonces = new Map<string, number>();
  private cachedAccessToken: string | null = null;
  private cachedTokenExpiry = 0;
  private configOverride?: Partial<GoogleOAuthConfig>;
  private fetchImpl: FetchLike;

  constructor(configOverride?: Partial<GoogleOAuthConfig>, fetchImpl?: FetchLike) {
    this.configOverride = configOverride;
    this.fetchImpl = fetchImpl || globalThis.fetch.bind(globalThis);
  }

  public getConfig(): GoogleOAuthConfig {
    const clientId = this.configOverride?.clientId ?? process.env.GOOGLE_CLIENT_ID ?? '';
    const clientSecret = this.configOverride?.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? '';
    const redirectUri =
      this.configOverride?.redirectUri ??
      process.env.GOOGLE_OAUTH_REDIRECT_URI ??
      'https://trabalheconosco.gigantepneus.com.br/api/integracoes/google/callback';
    const refreshToken = this.configOverride?.refreshToken ?? process.env.GOOGLE_REFRESH_TOKEN ?? '';
    const authorizedEmail =
      (this.configOverride?.authorizedEmail ??
        process.env.GOOGLE_AUTHORIZED_EMAIL ??
        DEFAULT_CORPORATE_EMAIL).toLowerCase().trim();
    const stateSecret =
      this.configOverride?.stateSecret ??
      process.env.GOOGLE_OAUTH_STATE_SECRET ??
      (clientSecret || 'default-gigante-state-secret');

    const isLocalDev = process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
    const persistRefreshTokenLocally =
      this.configOverride?.persistRefreshTokenLocally ?? isLocalDev;
    const envFilePath =
      this.configOverride?.envFilePath ?? path.resolve(process.cwd(), '.env.local');

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
  public generateState(adminIdentifier = 'admin'): string {
    const { stateSecret } = this.getConfig();
    const payload = {
      nonce: crypto.randomBytes(16).toString('hex'),
      iat: Date.now(),
      exp: Date.now() + 10 * 60 * 1000, // 10 minutos de validade
      sub: adminIdentifier
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
    const signature = crypto
      .createHmac('sha256', stateSecret || 'state-fallback')
      .update(payloadB64)
      .digest('base64url');

    return `${payloadB64}.${signature}`;
  }

  /**
   * Valida a assinatura HMAC, a expiração e garante que o `state` não foi reutilizado (anti-replay).
   */
  public verifyState(
    state?: string | null,
    consumeNonce = false
  ): { valid: boolean; reason?: string; nonce?: string } {
    if (!state || typeof state !== 'string' || !state.includes('.')) {
      return { valid: false, reason: 'OAUTH_STATE_INVALID: Parâmetro state ausente ou malformado.' };
    }

    const parts = state.split('.');
    if (parts.length !== 2) {
      return { valid: false, reason: 'OAUTH_STATE_INVALID: Estrutura do state inválida.' };
    }

    const [payloadB64, receivedSig] = parts;
    const { stateSecret } = this.getConfig();
    const expectedSig = crypto
      .createHmac('sha256', stateSecret || 'state-fallback')
      .update(payloadB64)
      .digest('base64url');

    const sigBufferA = Buffer.from(receivedSig);
    const sigBufferB = Buffer.from(expectedSig);
    if (sigBufferA.length !== sigBufferB.length || !crypto.timingSafeEqual(sigBufferA, sigBufferB)) {
      return {
        valid: false,
        reason: 'OAUTH_STATE_INVALID: Assinatura criptográfica do state não confere (CSRF detectado).'
      };
    }

    try {
      const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
      if (!decoded.exp || Date.now() > decoded.exp) {
        return { valid: false, reason: 'OAUTH_STATE_EXPIRED: O parâmetro state expirou.' };
      }

      const nonce = decoded.nonce as string;
      if (!nonce) {
        return { valid: false, reason: 'OAUTH_STATE_INVALID: Nonce ausente no state.' };
      }

      // Limpeza periódica de nonces expirados
      const now = Date.now();
      for (const [k, expTime] of GoogleOAuthService.consumedStateNonces.entries()) {
        if (now > expTime) {
          GoogleOAuthService.consumedStateNonces.delete(k);
        }
      }

      if (GoogleOAuthService.consumedStateNonces.has(nonce)) {
        return {
          valid: false,
          reason: 'OAUTH_STATE_REPLAYED: Este state já foi utilizado anteriormente e não pode ser reutilizado.'
        };
      }

      if (consumeNonce) {
        GoogleOAuthService.consumedStateNonces.set(nonce, decoded.exp);
      }

      return { valid: true, nonce };
    } catch {
      return { valid: false, reason: 'OAUTH_STATE_INVALID: Falha ao decodificar payload do state.' };
    }
  }

  /**
   * Persiste com segurança o `GOOGLE_REFRESH_TOKEN` no arquivo `.env.local` apenas em desenvolvimento local,
   * preservando todas as variáveis existentes e restringindo as permissões do arquivo (0o600).
   */
  private persistRefreshTokenToEnvLocal(refreshToken: string): boolean {
    const config = this.getConfig();
    if (!config.persistRefreshTokenLocally || !config.envFilePath) {
      return false;
    }

    // Nunca grava tokens fictícios de suítes de teste no arquivo real .env.local do projeto
    const isDefaultProjectEnv =
      path.resolve(config.envFilePath) === path.resolve(process.cwd(), '.env.local');
    if (isDefaultProjectEnv && refreshToken.includes('mock')) {
      return false;
    }

    try {
      let existingContent = '';
      if (fs.existsSync(config.envFilePath)) {
        existingContent = fs.readFileSync(config.envFilePath, 'utf-8');
      }

      const lines = existingContent.split(/\r?\n/);
      let found = false;
      const updatedLines = lines.map(line => {
        if (/^\s*GOOGLE_REFRESH_TOKEN\s*=/.test(line)) {
          found = true;
          return `GOOGLE_REFRESH_TOKEN=${refreshToken}`;
        }
        return line;
      });

      if (!found) {
        if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1].trim() !== '') {
          updatedLines.push('');
        }
        updatedLines.push(`GOOGLE_REFRESH_TOKEN=${refreshToken}`);
      }

      fs.writeFileSync(config.envFilePath, updatedLines.join('\n'), {
        encoding: 'utf-8',
        mode: 0o600
      });

      try {
        fs.chmodSync(config.envFilePath, 0o600);
      } catch {
        // Ignora caso o sistema de arquivos do Windows não suporte chmod POSIX completo
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
  public buildAuthorizationUrl(state: string): string {
    const config = this.getConfig();
    if (!config.clientId || !config.redirectUri) {
      throw new Error('OAUTH_CONFIG_MISSING: GOOGLE_CLIENT_ID e GOOGLE_OAUTH_REDIRECT_URI são obrigatórios.');
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: GOOGLE_DRIVE_FILE_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      login_hint: config.authorizedEmail || DEFAULT_CORPORATE_EMAIL,
      state
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Processa o callback OAuth 2.0, consome o `state` (uso único), troca o `code` por tokens,
   * valida a conta corporativa e salva o `refresh_token` com segurança no ambiente local.
   */
  public async handleCallback(code: string, state: string): Promise<OAuthCallbackResult> {
    const stateCheck = this.verifyState(state, true); // Consome o nonce para impedir reutilização
    if (!stateCheck.valid) {
      throw new Error(stateCheck.reason || 'OAUTH_STATE_INVALID');
    }

    if (!code || typeof code !== 'string') {
      throw new Error('OAUTH_CODE_MISSING: Código de autorização não informado.');
    }

    const config = this.getConfig();
    if (!config.clientId || !config.clientSecret) {
      throw new Error('OAUTH_CONFIG_MISSING: Credenciais OAuth do cliente não configuradas no backend.');
    }

    const body = new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code'
    });

    const tokenRes = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(15000)
    });

    if (!tokenRes.ok) {
      throw new Error(`OAUTH_TOKEN_EXCHANGE_FAILED: Google retornou HTTP ${tokenRes.status}.`);
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    };

    if (!tokenData.access_token) {
      throw new Error('OAUTH_NO_ACCESS_TOKEN: O Google não retornou um access_token válido.');
    }

    if (!tokenData.refresh_token) {
      throw new Error(
        'OAUTH_NO_REFRESH_TOKEN: O Google não retornou refresh_token. Revogue o acesso anterior em myaccount.google.com/permissions e autorize novamente com prompt=consent.'
      );
    }

    // Verifica qual conta Google realizou a autorização usando drive/v3/about
    const aboutRes = await this.fetchImpl(
      'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        },
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!aboutRes.ok) {
      throw new Error(
        `OAUTH_USER_VERIFY_FAILED: Não foi possível verificar o usuário autorizador (HTTP ${aboutRes.status}).`
      );
    }

    const aboutData = (await aboutRes.json()) as { user?: { emailAddress?: string } };
    const userEmail = (aboutData.user?.emailAddress || '').toLowerCase().trim();

    if (
      FORBIDDEN_PERSONAL_ACCOUNTS.some(acc => userEmail.includes(acc)) ||
      userEmail !== config.authorizedEmail
    ) {
      throw new Error(
        `OAUTH_UNAUTHORIZED_ACCOUNT: Conta '${userEmail}' não autorizada. Utilize exclusivamente a conta corporativa '${config.authorizedEmail}'.`
      );
    }

    // Atualiza em memória e persiste com segurança no .env.local (apenas após validar a conta corporativa)
    this.cachedAccessToken = tokenData.access_token;
    this.cachedTokenExpiry = Date.now() + ((tokenData.expires_in || 3600) - 60) * 1000;
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
  public async getValidAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.cachedAccessToken && Date.now() < this.cachedTokenExpiry) {
      return this.cachedAccessToken;
    }

    const config = this.getConfig();
    if (!config.refreshToken) {
      throw new Error('OAUTH_REFRESH_TOKEN_MISSING: GOOGLE_REFRESH_TOKEN não está configurado no ambiente.');
    }

    if (!config.clientId || !config.clientSecret) {
      throw new Error('OAUTH_CONFIG_MISSING: GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET ausente no backend.');
    }

    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token'
    });

    const response = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error(`OAUTH_REFRESH_FAILED: Falha ao renovar access_token (HTTP ${response.status}).`);
    }

    const data = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    };

    if (!data.access_token) {
      throw new Error('OAUTH_REFRESH_FAILED: Resposta de renovação não contém access_token.');
    }

    this.cachedAccessToken = data.access_token;
    this.cachedTokenExpiry = Date.now() + ((data.expires_in || 3600) - 60) * 1000;

    return this.cachedAccessToken;
  }

  public clearTokenCache(): void {
    this.cachedAccessToken = null;
    this.cachedTokenExpiry = 0;
  }
}

export const googleOAuthService = new GoogleOAuthService();
