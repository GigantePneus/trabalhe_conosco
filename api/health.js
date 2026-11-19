// src-api/health.ts
async function healthHandler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.statusCode = 200;
  res.end(JSON.stringify({
    status: "ok",
    service: "gigante-pneus-mcp-remote",
    protocol: "streamable-http",
    version: "1.4.0",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  }));
}
export {
  healthHandler as default
};
