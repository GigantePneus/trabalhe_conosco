import { GoogleOAuthService, googleOAuthService } from '../../../services/storage/googleOAuthService';

export interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
}

export async function handleGoogleCallback(
  query: CallbackQuery,
  oauthService: GoogleOAuthService = googleOAuthService
): Promise<{
  statusCode: number;
  data: {
    success: boolean;
    mensagem: string;
    authorizedEmail?: string;
    hasRefreshToken?: boolean;
    scope?: string;
  };
}> {
  if (query.error) {
    return {
      statusCode: 400,
      data: {
        success: false,
        mensagem: `Autorização recusada pelo provedor OAuth (${query.error}).`
      }
    };
  }

  const state = query.state || '';
  const code = query.code || '';

  const stateVerification = oauthService.verifyState(state);
  if (!stateVerification.valid) {
    return {
      statusCode: 403,
      data: {
        success: false,
        mensagem: stateVerification.reason || 'Parâmetro state inválido ou expirado (proteção CSRF).'
      }
    };
  }

  if (!code) {
    return {
      statusCode: 400,
      data: {
        success: false,
        mensagem: 'Código de autorização OAuth (code) ausente na requisição de callback.'
      }
    };
  }

  try {
    const result = await oauthService.handleCallback(code, state);

    // NUNCA expõe refresh_token ou access_token na resposta HTTP ou em logs
    return {
      statusCode: 200,
      data: {
        success: true,
        mensagem:
          'Conta corporativa autorizada com sucesso via OAuth 2.0 (escopo drive.file). Tokens validados com segurança no backend.',
        authorizedEmail: result.authorizedEmail,
        hasRefreshToken: result.hasRefreshToken,
        scope: result.scope
      }
    };
  } catch (err: any) {
    const msg = err?.message || 'Erro desconhecido no callback OAuth.';
    const status =
      msg.includes('OAUTH_STATE') || msg.includes('OAUTH_UNAUTHORIZED_ACCOUNT')
        ? 403
        : msg.includes('OAUTH_NO_REFRESH_TOKEN') || msg.includes('OAUTH_CODE_MISSING')
        ? 400
        : 502;

    return {
      statusCode: status,
      data: {
        success: false,
        mensagem: msg
      }
    };
  }
}

export default async function vercelCallbackHandler(req: any, res: any) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ success: false, mensagem: `Método ${req.method} não permitido.` });
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    const urlObj = new URL(req.url || '/api/integracoes/google/callback', 'http://localhost');
    const query: CallbackQuery = {
      code: req.query?.code ?? urlObj.searchParams.get('code') ?? undefined,
      state: req.query?.state ?? urlObj.searchParams.get('state') ?? undefined,
      error: req.query?.error ?? urlObj.searchParams.get('error') ?? undefined
    };

    const result = await handleGoogleCallback(query);
    return res.status(result.statusCode).json(result.data);
  } catch (err: any) {
    console.error('[VercelHandler][CallbackException]', err);
    return res.status(500).json({ success: false, mensagem: err?.message || 'Erro interno no servidor.' });
  }
}

