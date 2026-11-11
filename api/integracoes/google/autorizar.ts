import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { GoogleOAuthService, googleOAuthService } from '../../../services/storage/googleOAuthService';

const SUPABASE_URL = process.env.SUPABASE_INTERNAL_URL || process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const ADMIN_COOKIE_NAME = 'gigante_admin_session';

/**
 * Cria um cookie assinado HttpOnly para a sessão administrativa segura no navegador.
 */
export function createAdminSessionCookie(adminId: string): string {
  const secret = process.env.GOOGLE_ADMIN_SETUP_TOKEN || 'cookie-secret-gigante-admin';
  const expires = Date.now() + 30 * 60 * 1000; // 30 minutos
  const payload = Buffer.from(JSON.stringify({ adminId, exp: expires })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const cookieValue = `${payload}.${signature}`;

  const isProd = process.env.NODE_ENV === 'production';
  return `${ADMIN_COOKIE_NAME}=${cookieValue}; Path=/api/integracoes/google; HttpOnly; SameSite=Lax${isProd ? '; Secure' : ''}; Max-Age=1800`;
}

/**
 * Valida o cookie HttpOnly de sessão administrativa.
 */
export function verifyAdminSessionCookie(cookieHeader?: string): { valid: boolean; adminId?: string } {
  if (!cookieHeader) return { valid: false };

  const match = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith(`${ADMIN_COOKIE_NAME}=`));
  if (!match) return { valid: false };

  const value = match.split('=')[1];
  if (!value || !value.includes('.')) return { valid: false };

  const [payloadB64, sig] = value.split('.');
  const secret = process.env.GOOGLE_ADMIN_SETUP_TOKEN || 'cookie-secret-gigante-admin';
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

  const bufA = Buffer.from(sig);
  const bufB = Buffer.from(expectedSig);
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return { valid: false };
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (!payload.exp || Date.now() > payload.exp) {
      return { valid: false };
    }
    return { valid: true, adminId: payload.adminId };
  } catch {
    return { valid: false };
  }
}

/**
 * Valida a autorização administrativa:
 * 1. Sessão via Cookie HttpOnly (`gigante_admin_session`)
 * 2. Header `x-admin-token` ou `Authorization: Bearer`
 * 3. Token Supabase JWT de usuário com role `franqueadora_admin`
 */
export async function verifyAdminAuthorization(headers: Record<string, string | string[] | undefined>): Promise<{
  authorized: boolean;
  adminId?: string;
  error?: string;
  cookieToSet?: string;
}> {
  // 1. Verificação de Cookie HttpOnly
  const cookieHeader = (headers['cookie'] || headers['Cookie']) as string;
  const cookieAuth = verifyAdminSessionCookie(cookieHeader);
  if (cookieAuth.valid) {
    return { authorized: true, adminId: cookieAuth.adminId };
  }

  // 2. Verificação de Token de Setup (Header)
  const authHeader = (headers['authorization'] || headers['Authorization'] || '') as string;
  const adminHeader = (headers['x-admin-token'] || headers['X-Admin-Token'] || '') as string;
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const candidateToken = adminHeader.trim() || bearerToken;

  const setupSecret = process.env.GOOGLE_ADMIN_SETUP_TOKEN;
  if (candidateToken && setupSecret && setupSecret.length >= 8) {
    const bufA = Buffer.from(candidateToken);
    const bufB = Buffer.from(setupSecret);
    if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
      const cookie = createAdminSessionCookie('setup_token_admin');
      return { authorized: true, adminId: 'setup_token_admin', cookieToSet: cookie };
    }
  }

  // 3. Verificação de JWT Supabase (franqueadora_admin)
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && bearerToken) {
    try {
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
      });
      const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(bearerToken);
      if (!userErr && userData?.user?.id) {
        const { data: perfil } = await supabaseAdmin
          .from('perfis')
          .select('role, ativo')
          .eq('id', userData.user.id)
          .maybeSingle();

        if (perfil && perfil.ativo === true && perfil.role === 'franqueadora_admin') {
          const cookie = createAdminSessionCookie(userData.user.id);
          return { authorized: true, adminId: userData.user.id, cookieToSet: cookie };
        }
      }
    } catch {
      // Ignora e rejeita abaixo
    }
  }

  return {
    authorized: false,
    error: 'ADMIN_AUTH_REQUIRED: Autenticação administrativa necessária para iniciar fluxo OAuth.'
  };
}

export async function handleGoogleAuthorize(
  headers: Record<string, string | string[] | undefined>,
  oauthService: GoogleOAuthService = googleOAuthService
): Promise<{
  statusCode: number;
  redirectUrl?: string;
  cookieToSet?: string;
  data: { success: boolean; mensagem: string; authorizationUrl?: string };
}> {
  const authCheck = await verifyAdminAuthorization(headers);
  if (!authCheck.authorized) {
    return {
      statusCode: 401,
      data: {
        success: false,
        mensagem: authCheck.error || 'Acesso negado.'
      }
    };
  }

  try {
    const state = oauthService.generateState(authCheck.adminId || 'admin');
    const authorizationUrl = oauthService.buildAuthorizationUrl(state);

    return {
      statusCode: 200,
      redirectUrl: authorizationUrl,
      cookieToSet: authCheck.cookieToSet,
      data: {
        success: true,
        mensagem: 'URL de autorização OAuth 2.0 gerada com segurança.',
        authorizationUrl
      }
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      data: {
        success: false,
        mensagem: err.message || 'Erro ao construir URL de autorização OAuth.'
      }
    };
  }
}

export default async function vercelAuthorizeHandler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, mensagem: `Método ${req.method} não permitido.` });
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  const result = await handleGoogleAuthorize(req.headers || {});

  if (result.cookieToSet) {
    res.setHeader('Set-Cookie', result.cookieToSet);
  }

  const acceptHeader = (req.headers?.['accept'] || '') as string;
  if (result.statusCode === 200 && result.redirectUrl && acceptHeader.includes('text/html')) {
    res.writeHead(302, { Location: result.redirectUrl });
    return res.end();
  }

  return res.status(result.statusCode).json(result.data);
}
