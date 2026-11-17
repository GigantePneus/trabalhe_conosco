import { handleOAuthUserinfo } from '../../mcp-server/src/oauth.js';

export default async function oauthUserinfoHandler(req: any, res: any) {
  return handleOAuthUserinfo(req, res);
}
