import { handleOAuthToken } from '../../mcp-server/src/oauth.js';

export default async function oauthTokenHandler(req: any, res: any) {
  return handleOAuthToken(req, res);
}
