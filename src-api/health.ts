export default async function healthHandler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 200;
  res.end(JSON.stringify({
    status: 'ok',
    service: 'gigante-pneus-mcp-remote',
    protocol: 'streamable-http',
    version: '1.2.0',
    timestamp: new Date().toISOString()
  }));
}
