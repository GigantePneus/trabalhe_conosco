import { handleOAuthMetadata } from '../../mcp-server/src/oauth.js';

export default async function oauthMetadataHandler(req: any, res: any) {
  const host = req.headers['x-forwarded-host'] || req.headers['host'] || 'trabalheconosco.gigantepneus.com.br';
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const issuerUrl = `${proto}://${host}`;
  return handleOAuthMetadata(req, res, issuerUrl);
}
