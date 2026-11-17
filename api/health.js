// src-api/health.ts
async function healthHandler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.statusCode = 200;
  res.end(JSON.stringify({
    status: "ok",
    service: "gigante-pneus-mcp-remote",
    protocol: "streamable-http",
    version: "1.2.0",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  }));
}
export {
  healthHandler as default
};
