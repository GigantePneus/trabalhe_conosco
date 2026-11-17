import { handleOAuthAuthorize } from '../../mcp-server/src/oauth.js';

export default async function oauthAuthorizeHandler(req: any, res: any) {
  return handleOAuthAuthorize(req, res);
}
