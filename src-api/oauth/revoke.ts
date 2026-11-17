import { handleOAuthRevoke } from '../../mcp-server/src/oauth.js';

export default async function oauthRevokeHandler(req: any, res: any) {
  return handleOAuthRevoke(req, res);
}
