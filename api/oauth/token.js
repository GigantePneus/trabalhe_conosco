// mcp-server/src/oauth.ts
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
function getSigningSecret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "gigante_default_secure_secret_key_2026";
}
function signHmacPayload(type, payload, ttlSeconds) {
  const secret = getSigningSecret();
  const exp = Math.floor(Date.now() / 1e3) + ttlSeconds;
  const data = { ...payload, __typ: type, __exp: exp, __jti: randomBytes(8).toString("hex") };
  const jsonStr = JSON.stringify(data);
  const dataB64 = Buffer.from(jsonStr).toString("base64url");
  const hmac = createHmac("sha256", secret).update(dataB64).digest("base64url");
  return `gig_${type}_${dataB64}.${hmac}`;
}
function verifyHmacPayload(token, expectedType) {
  if (!token || !token.startsWith(`gig_${expectedType}_`)) return null;
  const parts = token.slice(`gig_${expectedType}_`.length).split(".");
  if (parts.length !== 2) return null;
  const [dataB64, signature] = parts;
  const secret = getSigningSecret();
  const expectedHmac = createHmac("sha256", secret).update(dataB64).digest("base64url");
  if (signature !== expectedHmac) return null;
  try {
    const jsonStr = Buffer.from(dataB64, "base64url").toString("utf-8");
    const data = JSON.parse(jsonStr);
    if (data.__typ !== expectedType) return null;
    if (typeof data.__exp === "number" && data.__exp < Math.floor(Date.now() / 1e3)) return null;
    return data;
  } catch {
    return null;
  }
}
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
function verifyPkceS256(verifier, challenge) {
  if (!verifier || !challenge) return false;
  const hash = createHash("sha256").update(verifier).digest("base64url");
  return hash === challenge;
}
async function handleOAuthToken(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }
  let bodyStr = "";
  req.on("data", (c) => {
    bodyStr += c;
  });
  req.on("end", async () => {
    let grantType = "";
    let code = "";
    let redirectUri = "";
    let clientId = "";
    let codeVerifier = "";
    let refreshToken = "";
    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("application/json")) {
      try {
        const body = JSON.parse(bodyStr || "{}");
        grantType = body.grant_type;
        code = body.code;
        redirectUri = body.redirect_uri;
        clientId = body.client_id;
        codeVerifier = body.code_verifier;
        refreshToken = body.refresh_token;
      } catch {
      }
    } else {
      const formData = new URLSearchParams(bodyStr);
      grantType = formData.get("grant_type") || "";
      code = formData.get("code") || "";
      redirectUri = formData.get("redirect_uri") || "";
      clientId = formData.get("client_id") || "";
      codeVerifier = formData.get("code_verifier") || "";
      refreshToken = formData.get("refresh_token") || "";
    }
    if (grantType === "authorization_code") {
      if (!code) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_request", error_description: "Par\xE2metro code ausente." }));
        return;
      }
      let entry = authCodes.get(code);
      if (entry) {
        authCodes.delete(code);
      } else {
        const hmacCode = verifyHmacPayload(code, "code");
        if (hmacCode) {
          entry = {
            code,
            clientId: hmacCode.clientId,
            redirectUri: hmacCode.redirectUri,
            codeChallenge: hmacCode.codeChallenge,
            codeChallengeMethod: "S256",
            scope: hmacCode.scope,
            context: hmacCode.context,
            expiresAt: hmacCode.__exp * 1e3
          };
        }
      }
      if (!entry) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_grant", error_description: "C\xF3digo de autoriza\xE7\xE3o inv\xE1lido ou j\xE1 utilizado." }));
        return;
      }
      if (entry.expiresAt <= Date.now()) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_grant", error_description: "C\xF3digo de autoriza\xE7\xE3o expirado." }));
        return;
      }
      if (entry.codeChallenge) {
        const pkceValid = verifyPkceS256(codeVerifier, entry.codeChallenge);
        if (!pkceValid) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_grant", error_description: "PKCE verification failed: code_verifier incompat\xEDvel." }));
          return;
        }
      }
      const expiresIn = 3600;
      const tokenPayload = {
        clientId: entry.clientId,
        context: entry.context,
        scope: entry.scope
      };
      const accessToken = signHmacPayload("at", tokenPayload, expiresIn);
      const newRefreshToken = signHmacPayload("rt", tokenPayload, 30 * 86400);
      const expiresAt = Date.now() + expiresIn * 1e3;
      const tokenRecord = {
        accessToken,
        refreshToken: newRefreshToken,
        clientId: entry.clientId,
        context: entry.context,
        scope: entry.scope,
        expiresAt
      };
      activeTokens.set(accessToken, tokenRecord);
      refreshTokens.set(newRefreshToken, tokenRecord);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Pragma": "no-cache"
      });
      res.end(JSON.stringify({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: expiresIn,
        refresh_token: newRefreshToken,
        scope: entry.scope
      }));
      return;
    }
    if (grantType === "refresh_token") {
      if (!refreshToken) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_request", error_description: "Par\xE2metro refresh_token ausente." }));
        return;
      }
      const existingRecord = refreshTokens.get(refreshToken);
      if (!existingRecord) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_grant", error_description: "Refresh token inv\xE1lido ou revogado." }));
        return;
      }
      refreshTokens.delete(refreshToken);
      activeTokens.delete(existingRecord.accessToken);
      const newAccessToken = `gigante_mcp_at_${randomBytes(32).toString("base64url")}`;
      const newRefreshToken = `gigante_mcp_rt_${randomBytes(32).toString("base64url")}`;
      const expiresIn = 3600;
      const expiresAt = Date.now() + expiresIn * 1e3;
      const newRecord = {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        clientId: existingRecord.clientId,
        context: existingRecord.context,
        scope: existingRecord.scope,
        expiresAt
      };
      activeTokens.set(newAccessToken, newRecord);
      refreshTokens.set(newRefreshToken, newRecord);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      });
      res.end(JSON.stringify({
        access_token: newAccessToken,
        token_type: "Bearer",
        expires_in: expiresIn,
        refresh_token: newRefreshToken,
        scope: existingRecord.scope
      }));
      return;
    }
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unsupported_grant_type", error_description: "Use authorization_code ou refresh_token." }));
  });
}

// src-api/oauth/token.ts
async function oauthTokenHandler(req, res) {
  return handleOAuthToken(req, res);
}
export {
  oauthTokenHandler as default
};
