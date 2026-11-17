// mcp-server/src/oauth.ts
import { createClient } from "@supabase/supabase-js";
var authCodes = /* @__PURE__ */ new Map();
var activeTokens = /* @__PURE__ */ new Map();
var refreshTokens = /* @__PURE__ */ new Map();
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of authCodes.entries()) {
    if (entry.expiresAt <= now) authCodes.delete(code);
  }
  for (const [token, entry] of activeTokens.entries()) {
    if (entry.expiresAt <= now) activeTokens.delete(token);
  }
}, 5 * 60 * 1e3).unref();
function handleOAuthRevoke(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  let bodyStr = "";
  req.on("data", (c) => {
    bodyStr += c;
  });
  req.on("end", () => {
    let tokenToRevoke = "";
    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("application/json")) {
      try {
        tokenToRevoke = JSON.parse(bodyStr || "{}").token;
      } catch {
      }
    } else {
      const formData = new URLSearchParams(bodyStr);
      tokenToRevoke = formData.get("token") || "";
    }
    if (tokenToRevoke) {
      activeTokens.delete(tokenToRevoke);
      refreshTokens.delete(tokenToRevoke);
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: "Token revogado com sucesso." }));
  });
}

// src-api/oauth/revoke.ts
async function oauthRevokeHandler(req, res) {
  return handleOAuthRevoke(req, res);
}
export {
  oauthRevokeHandler as default
};
