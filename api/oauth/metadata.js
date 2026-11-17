// mcp-server/src/oauth.ts
import { createClient } from "@supabase/supabase-js";
var authCodes = /* @__PURE__ */ new Map();
var activeTokens = /* @__PURE__ */ new Map();
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of authCodes.entries()) {
    if (entry.expiresAt <= now) authCodes.delete(code);
  }
  for (const [token, entry] of activeTokens.entries()) {
    if (entry.expiresAt <= now) activeTokens.delete(token);
  }
}, 5 * 60 * 1e3).unref();
function handleOAuthMetadata(req, res, issuerUrl) {
  const metadata = {
    issuer: issuerUrl,
    authorization_endpoint: `${issuerUrl}/oauth/authorize`,
    token_endpoint: `${issuerUrl}/oauth/token`,
    revocation_endpoint: `${issuerUrl}/oauth/revoke`,
    userinfo_endpoint: `${issuerUrl}/oauth/userinfo`,
    jwks_uri: `${issuerUrl}/oauth/jwks`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: ["openid", "profile", "email", "admin", "vagas:read", "vagas:write"],
    service_documentation: `${issuerUrl}/health`
  };
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=3600",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(metadata, null, 2));
}

// src-api/oauth/metadata.ts
async function oauthMetadataHandler(req, res) {
  const host = req.headers["x-forwarded-host"] || req.headers["host"] || "trabalheconosco.gigantepneus.com.br";
  const proto = req.headers["x-forwarded-proto"] || (host.includes("localhost") ? "http" : "https");
  const issuerUrl = `${proto}://${host}`;
  return handleOAuthMetadata(req, res, issuerUrl);
}
export {
  oauthMetadataHandler as default
};
