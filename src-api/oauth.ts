import {
  handleOAuthMetadata,
  handleOAuthAuthorize,
  handleOAuthToken,
  handleOAuthUserinfo,
  handleOAuthRevoke
} from '../mcp-server/src/oauth.js';

export default async function oauthRouterHandler(req: any, res: any) {
  const url = req.url || '';
  const pathname = url.split('?')[0];

  const host = req.headers['x-forwarded-host'] || req.headers['host'] || 'trabalheconosco.gigantepneus.com.br';
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const issuerUrl = `${proto}://${host}`;

  if (pathname.includes('/.well-known/') || pathname.endsWith('/metadata')) {
    return handleOAuthMetadata(req, res, issuerUrl);
  }
  if (pathname.endsWith('/authorize')) {
    return handleOAuthAuthorize(req, res);
  }
  if (pathname.endsWith('/token')) {
    return handleOAuthToken(req, res);
  }
  if (pathname.endsWith('/userinfo')) {
    return handleOAuthUserinfo(req, res);
  }
  if (pathname.endsWith('/revoke')) {
    return handleOAuthRevoke(req, res);
  }

  // Fallback padrão: metadados OAuth RFC 8414
  return handleOAuthMetadata(req, res, issuerUrl);
}
