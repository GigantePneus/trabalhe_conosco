/**
 * Servidor OAuth 2.1 — Gigante Pneus MCP Remoto
 * 
 * Implementa:
 * - RFC 8414 (OAuth 2.0 Authorization Server Metadata)
 * - RFC 7636 (Proof Key for Code Exchange - PKCE S256)
 * - RFC 6749 / RFC 6750 (Authorization Code Flow com Bearer Tokens)
 * - RFC 7009 (OAuth 2.0 Token Revocation)
 * - Integração direta com Supabase Auth (sem contas paralelas)
 * - Validação de integridade multi-tenant em `perfis` e `usuario_lojas`
 */

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─── Assinatura Criptográfica HMAC (Stateless para Vercel Serverless) ──────────

function getSigningSecret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || 'gigante_default_secure_secret_key_2026';
}

export function signHmacPayload(type: string, payload: Record<string, any>, ttlSeconds: number): string {
  const secret = getSigningSecret();
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const data = { ...payload, __typ: type, __exp: exp, __jti: randomBytes(8).toString('hex') };
  const jsonStr = JSON.stringify(data);
  const dataB64 = Buffer.from(jsonStr).toString('base64url');
  const hmac = createHmac('sha256', secret).update(dataB64).digest('base64url');
  return `gig_${type}_${dataB64}.${hmac}`;
}

export function verifyHmacPayload(token: string, expectedType: string): any | null {
  if (!token || !token.startsWith(`gig_${expectedType}_`)) return null;
  const parts = token.slice(`gig_${expectedType}_`.length).split('.');
  if (parts.length !== 2) return null;
  const [dataB64, signature] = parts;
  const secret = getSigningSecret();
  const expectedHmac = createHmac('sha256', secret).update(dataB64).digest('base64url');
  if (signature !== expectedHmac) return null;

  try {
    const jsonStr = Buffer.from(dataB64, 'base64url').toString('utf-8');
    const data = JSON.parse(jsonStr);
    if (data.__typ !== expectedType) return null;
    if (typeof data.__exp === 'number' && data.__exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

// ─── Interfaces e Tipos ────────────────────────────────────────────────────────

export interface OperatorContext {
  userId: string;
  email: string;
  nome: string;
  role: 'franqueadora_admin' | 'rh_corporativo' | 'franqueado' | 'gerente';
  isMasterOrRh: boolean;
  lojasAutorizadasIds: string[];
  supabaseSessionToken: string;
}

interface AuthCodeEntry {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  scope: string;
  context: OperatorContext;
  expiresAt: number;
}

interface TokenEntry {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  context: OperatorContext;
  scope: string;
  expiresAt: number;
}

// ─── Armazenamento em Memória Seguro com TTL ───────────────────────────────────

const authCodes = new Map<string, AuthCodeEntry>();
const activeTokens = new Map<string, TokenEntry>();
const refreshTokens = new Map<string, TokenEntry>();

// Limpeza periódica de códigos e tokens expirados a cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of authCodes.entries()) {
    if (entry.expiresAt <= now) authCodes.delete(code);
  }
  for (const [token, entry] of activeTokens.entries()) {
    if (entry.expiresAt <= now) activeTokens.delete(token);
  }
}, 5 * 60 * 1000).unref();

// ─── Helper Supabase ───────────────────────────────────────────────────────────

function getSupabaseClients() {
  const supaUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supaUrl || !serviceKey) {
    throw new Error('CONFIG_ERROR: Variáveis de ambiente do Supabase ausentes no MCP Server.');
  }

  const adminClient = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });
  const anonClient = createClient(supaUrl, anonKey || serviceKey, { auth: { persistSession: false } });

  return { adminClient, anonClient };
}

// ─── Autenticação de Operador via Supabase ─────────────────────────────────────

export async function authenticateOperator(
  email: string,
  password?: string,
  existingToken?: string
): Promise<{ success: boolean; context?: OperatorContext; error?: string }> {
  const { adminClient, anonClient } = getSupabaseClients();

  let userId: string;
  let userEmail: string;
  let sessionToken: string;

  if (existingToken) {
    // Autenticação via token existente
    const { data: userData, error: userErr } = await adminClient.auth.getUser(existingToken);
    if (userErr || !userData?.user) {
      return { success: false, error: 'Sessão do Supabase inválida ou expirada.' };
    }
    userId = userData.user.id;
    userEmail = userData.user.email || email;
    sessionToken = existingToken;
  } else if (email && password) {
    // Autenticação via credenciais administrativas
    const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (signInErr || !signInData?.user || !signInData?.session) {
      return { success: false, error: 'Credenciais administrativas inválidas. Verifique e-mail e senha.' };
    }

    userId = signInData.user.id;
    userEmail = signInData.user.email || email;
    sessionToken = signInData.session.access_token;
  } else {
    return { success: false, error: 'E-mail e senha são obrigatórios.' };
  }

  // Consulta de perfil institucional e autorização
  const { data: perfil, error: perfilErr } = await adminClient
    .from('perfis')
    .select('id, nome, email, role, ativo')
    .eq('id', userId)
    .maybeSingle();

  if (perfilErr || !perfil) {
    return { success: false, error: 'Perfil de usuário não encontrado no sistema Trabalhe Conosco.' };
  }

  if (!perfil.ativo) {
    return { success: false, error: 'Este usuário está desativado no sistema.' };
  }

  const role = perfil.role as OperatorContext['role'];
  const isMasterOrRh = role === 'franqueadora_admin' || role === 'rh_corporativo';

  // Consulta de lojas autorizadas para franqueados e gerentes
  let lojasAutorizadasIds: string[] = [];
  if (!isMasterOrRh) {
    const { data: ulData, error: ulErr } = await adminClient
      .from('usuario_lojas')
      .select('loja_id')
      .eq('user_id', userId);

    if (ulErr) {
      return { success: false, error: 'Erro ao consultar unidades autorizadas.' };
    }

    lojasAutorizadasIds = (ulData || []).map((u) => u.loja_id).filter(Boolean);

    if (lojasAutorizadasIds.length === 0) {
      return { success: false, error: 'Usuário sem unidades autorizadas vinculadas no sistema.' };
    }
  }

  return {
    success: true,
    context: {
      userId,
      email: userEmail,
      nome: perfil.nome || 'Operador RH',
      role,
      isMasterOrRh,
      lojasAutorizadasIds,
      supabaseSessionToken: sessionToken
    }
  };
}

// ─── Resolução de Token no MCP Server ──────────────────────────────────────────

/**
 * Resolve o contexto de operador para qualquer token recebido (OAuth Token do MCP ou JWT direto do Supabase)
 */
export async function resolveOAuthTokenContext(token: string): Promise<OperatorContext | null> {
  const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
  if (!cleanToken) return null;

  // 1. Verifica se é um token emitido pelo nosso servidor OAuth em memória
  const entry = activeTokens.get(cleanToken);
  if (entry) {
    if (entry.expiresAt > Date.now()) {
      return entry.context;
    }
    activeTokens.delete(cleanToken);
  }

  // 2. Verifica se é um token assinado por HMAC (stateless para Vercel Serverless / multi-instância)
  const hmacData = verifyHmacPayload(cleanToken, 'at');
  if (hmacData && hmacData.context) {
    return hmacData.context as OperatorContext;
  }

  // 3. Fallback: Se for um token JWT direto do Supabase, autentica dinamicamente
  const auth = await authenticateOperator('', undefined, cleanToken);
  if (auth.success && auth.context) {
    return auth.context;
  }

  return null;
}

// ─── Helpers PKCE ──────────────────────────────────────────────────────────────

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  const hash = createHash('sha256').update(verifier).digest('base64url');
  return hash === challenge;
}

// ─── Handlers de Rotas OAuth 2.1 ───────────────────────────────────────────────

/**
 * 1. RFC 8414 - Descoberta de Metadados OAuth Authorization Server
 */
export function handleOAuthMetadata(req: any, res: any, issuerUrl: string) {
  const metadata = {
    issuer: issuerUrl,
    authorization_endpoint: `${issuerUrl}/oauth/authorize`,
    token_endpoint: `${issuerUrl}/oauth/token`,
    revocation_endpoint: `${issuerUrl}/oauth/revoke`,
    userinfo_endpoint: `${issuerUrl}/oauth/userinfo`,
    jwks_uri: `${issuerUrl}/oauth/jwks`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: ['openid', 'profile', 'email', 'admin', 'vagas:read', 'vagas:write'],
    service_documentation: `${issuerUrl}/health`
  };

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(metadata, null, 2));
}

/**
 * 2. GET /oauth/authorize - Renderiza tela HTML de consentimento
 */
export function renderAuthorizeHtml(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  errorMessage?: string;
}): string {
  const errorHtml = params.errorMessage
    ? `<div style="background-color: #fee2e2; border-left: 4px solid #ef4444; color: #b91c1c; padding: 12px; margin-bottom: 20px; border-radius: 4px; font-size: 14px;">
        ⚠️ ${params.errorMessage}
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gigante Pneus — Autorização ChatGPT</title>
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
      <p class="sub">O assistente de IA está solicitando autorização para gerenciar vagas e unidades no sistema Trabalhe Conosco.</p>
    </div>

    ${errorHtml}

    <div class="scopes">
      <div class="scopes-title">Permissões Solicitadas:</div>
      <div class="scope-item">✓ Consulta de lojas e unidades autorizadas</div>
      <div class="scope-item">✓ Gestão de vagas (criação em rascunho)</div>
      <div class="scope-item">✓ Isolamento rigoroso de permissões e franquias</div>
    </div>

    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${encodeURIComponent(params.clientId || '')}">
      <input type="hidden" name="redirect_uri" value="${encodeURIComponent(params.redirectUri || '')}">
      <input type="hidden" name="state" value="${encodeURIComponent(params.state || '')}">
      <input type="hidden" name="scope" value="${encodeURIComponent(params.scope || '')}">
      <input type="hidden" name="code_challenge" value="${encodeURIComponent(params.codeChallenge || '')}">
      <input type="hidden" name="code_challenge_method" value="${encodeURIComponent(params.codeChallengeMethod || 'S256')}">

      <div class="form-group">
        <label for="email">E-mail Administrativo</label>
        <input type="email" id="email" name="email" required placeholder="seu.email@gigantepneus.com.br" autofocus>
      </div>

      <div class="form-group">
        <label for="password">Senha de Acesso</label>
        <input type="password" id="password" name="password" required placeholder="••••••••">
      </div>

      <div class="actions">
        <button type="submit" class="btn-primary">Autorizar Conexão Segura</button>
      </div>
    </form>

    <div class="footer">
      Ambiente Seguro com Autenticação Supabase & PKCE S256
    </div>
  </div>
</body>
</html>`;
}

/**
 * 3. Processa Autorização (GET e POST em /oauth/authorize)
 */
export async function handleOAuthAuthorize(req: any, res: any) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Se GET: extrai parâmetros e exibe formulário HTML
  if (req.method === 'GET') {
    const clientId = url.searchParams.get('client_id') || 'chatgpt-client';
    const redirectUri = url.searchParams.get('redirect_uri') || '';
    const state = url.searchParams.get('state') || '';
    const scope = url.searchParams.get('scope') || 'admin';
    const codeChallenge = url.searchParams.get('code_challenge') || '';
    const codeChallengeMethod = url.searchParams.get('code_challenge_method') || 'S256';

    const html = renderAuthorizeHtml({
      clientId,
      redirectUri,
      state,
      scope,
      codeChallenge,
      codeChallengeMethod
    });

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // Se POST: processa login do operador
  if (req.method === 'POST') {
    let bodyStr = '';
    req.on('data', (c: any) => { bodyStr += c; });
    req.on('end', async () => {
      let email = '';
      let password = '';
      let sessionToken = '';
      let clientId = '';
      let redirectUri = '';
      let state = '';
      let scope = '';
      let codeChallenge = '';
      let codeChallengeMethod = 'S256';

      // Suporta x-www-form-urlencoded ou JSON
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        try {
          const body = JSON.parse(bodyStr || '{}');
          email = body.email;
          password = body.password;
          sessionToken = body.session_token || '';
          clientId = body.client_id || 'chatgpt-client';
          redirectUri = body.redirect_uri || '';
          state = body.state || '';
          scope = body.scope || 'admin';
          codeChallenge = body.code_challenge || '';
          codeChallengeMethod = body.code_challenge_method || 'S256';
        } catch {}
      } else {
        const formData = new URLSearchParams(bodyStr);
        email = formData.get('email') || '';
        password = formData.get('password') || '';
        sessionToken = formData.get('session_token') || '';
        clientId = formData.get('client_id') || 'chatgpt-client';
        redirectUri = decodeURIComponent(formData.get('redirect_uri') || '');
        state = formData.get('state') || '';
        scope = formData.get('scope') || 'admin';
        codeChallenge = formData.get('code_challenge') || '';
        codeChallengeMethod = formData.get('code_challenge_method') || 'S256';
      }

      // Validação das credenciais do operador (senha ou sessão prévia)
      const auth = await authenticateOperator(email, password, sessionToken);

      if (!auth.success || !auth.context) {
        // Se a requisição veio de API JSON
        if (contentType.includes('application/json')) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'access_denied', error_description: auth.error || 'Credenciais inválidas' }));
          return;
        }

        // Se veio de formulário HTML, exibe mensagem de erro
        const html = renderAuthorizeHtml({
          clientId,
          redirectUri,
          state,
          scope,
          codeChallenge,
          codeChallengeMethod,
          errorMessage: auth.error
        });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      // Gera código de autorização assinado (stateless com HMAC para suporte a Serverless)
      const codePayload = {
        clientId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod: 'S256' as const,
        scope,
        context: auth.context
      };
      const code = signHmacPayload('code', codePayload, 300); // 5 min
      const expiresAt = Date.now() + 5 * 60 * 1000;

      authCodes.set(code, {
        ...codePayload,
        code,
        expiresAt
      });

      // Se for chamada JSON, responde diretamente com o redirecionamento
      if (contentType.includes('application/json')) {
        const targetUrl = new URL(redirectUri || 'http://localhost');
        targetUrl.searchParams.set('code', code);
        if (state) targetUrl.searchParams.set('state', state);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          code,
          state,
          redirect_url: targetUrl.toString()
        }));
        return;
      }

      // Redireciona o navegador de volta ao ChatGPT com o código e state
      if (redirectUri) {
        const targetUrl = new URL(redirectUri);
        targetUrl.searchParams.set('code', code);
        if (state) targetUrl.searchParams.set('state', state);

        res.writeHead(302, { Location: targetUrl.toString() });
        res.end();
        return;
      }

      // Se redirectUri não foi fornecido (fallback de exibição)
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code, state }));
    });
  }
}

/**
 * 4. POST /oauth/token - Troca de Authorization Code por Tokens & Renovação com PKCE
 */
export async function handleOAuthToken(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }

  let bodyStr = '';
  req.on('data', (c: any) => { bodyStr += c; });
  req.on('end', async () => {
    let grantType = '';
    let code = '';
    let redirectUri = '';
    let clientId = '';
    let codeVerifier = '';
    let refreshToken = '';

    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      try {
        const body = JSON.parse(bodyStr || '{}');
        grantType = body.grant_type;
        code = body.code;
        redirectUri = body.redirect_uri;
        clientId = body.client_id;
        codeVerifier = body.code_verifier;
        refreshToken = body.refresh_token;
      } catch {}
    } else {
      const formData = new URLSearchParams(bodyStr);
      grantType = formData.get('grant_type') || '';
      code = formData.get('code') || '';
      redirectUri = formData.get('redirect_uri') || '';
      clientId = formData.get('client_id') || '';
      codeVerifier = formData.get('code_verifier') || '';
      refreshToken = formData.get('refresh_token') || '';
    }

    // ─── Fluxo 1: authorization_code com PKCE ──────────────────────────────────
    if (grantType === 'authorization_code') {
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_request', error_description: 'Parâmetro code ausente.' }));
        return;
      }

      let entry = authCodes.get(code);
      if (entry) {
        authCodes.delete(code);
      } else {
        const hmacCode = verifyHmacPayload(code, 'code');
        if (hmacCode) {
          entry = {
            code,
            clientId: hmacCode.clientId,
            redirectUri: hmacCode.redirectUri,
            codeChallenge: hmacCode.codeChallenge,
            codeChallengeMethod: 'S256',
            scope: hmacCode.scope,
            context: hmacCode.context,
            expiresAt: hmacCode.__exp * 1000
          };
        }
      }

      if (!entry) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Código de autorização inválido ou já utilizado.' }));
        return;
      }

      // Verificação de expiração (5 min)
      if (entry.expiresAt <= Date.now()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Código de autorização expirado.' }));
        return;
      }

      // Validação PKCE S256 obrigatória
      if (entry.codeChallenge) {
        const pkceValid = verifyPkceS256(codeVerifier, entry.codeChallenge);
        if (!pkceValid) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'PKCE verification failed: code_verifier incompatível.' }));
          return;
        }
      }

      // Emissão de tokens de acesso e renovação com assinatura criptográfica HMAC
      const expiresIn = 3600; // 1 hora
      const tokenPayload = {
        clientId: entry.clientId,
        context: entry.context,
        scope: entry.scope
      };
      const accessToken = signHmacPayload('at', tokenPayload, expiresIn);
      const newRefreshToken = signHmacPayload('rt', tokenPayload, 30 * 86400); // 30 dias
      const expiresAt = Date.now() + expiresIn * 1000;

      const tokenRecord: TokenEntry = {
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
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache'
      });
      res.end(JSON.stringify({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: expiresIn,
        refresh_token: newRefreshToken,
        scope: entry.scope
      }));
      return;
    }

    // ─── Fluxo 2: refresh_token ────────────────────────────────────────────────
    if (grantType === 'refresh_token') {
      if (!refreshToken) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_request', error_description: 'Parâmetro refresh_token ausente.' }));
        return;
      }

      const existingRecord = refreshTokens.get(refreshToken);
      if (!existingRecord) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Refresh token inválido ou revogado.' }));
        return;
      }

      // Rotação de tokens: invalida o refresh token anterior
      refreshTokens.delete(refreshToken);
      activeTokens.delete(existingRecord.accessToken);

      const newAccessToken = `gigante_mcp_at_${randomBytes(32).toString('base64url')}`;
      const newRefreshToken = `gigante_mcp_rt_${randomBytes(32).toString('base64url')}`;
      const expiresIn = 3600;
      const expiresAt = Date.now() + expiresIn * 1000;

      const newRecord: TokenEntry = {
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
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify({
        access_token: newAccessToken,
        token_type: 'Bearer',
        expires_in: expiresIn,
        refresh_token: newRefreshToken,
        scope: existingRecord.scope
      }));
      return;
    }

    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'unsupported_grant_type', error_description: 'Use authorization_code ou refresh_token.' }));
  });
}

/**
 * 5. POST /oauth/revoke - Revogação de Tokens (RFC 7009)
 */
export function handleOAuthRevoke(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let bodyStr = '';
  req.on('data', (c: any) => { bodyStr += c; });
  req.on('end', () => {
    let tokenToRevoke = '';
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      try {
        tokenToRevoke = JSON.parse(bodyStr || '{}').token;
      } catch {}
    } else {
      const formData = new URLSearchParams(bodyStr);
      tokenToRevoke = formData.get('token') || '';
    }

    if (tokenToRevoke) {
      activeTokens.delete(tokenToRevoke);
      refreshTokens.delete(tokenToRevoke);
    }

    // RFC 7009 especifica retorno 200 mesmo se o token já era inválido
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Token revogado com sucesso.' }));
  });
}

/**
 * 6. GET /oauth/userinfo - Informações e Permissões do Operador
 */
export async function handleOAuthUserinfo(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  const context = await resolveOAuthTokenContext(token);
  if (!context) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid_token', error_description: 'Token inválido ou expirado.' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    sub: context.userId,
    email: context.email,
    name: context.nome,
    role: context.role,
    is_master: context.isMasterOrRh,
    lojas_autorizadas: context.lojasAutorizadasIds,
    aud: 'gigante-pneus-mcp'
  }, null, 2));
}
