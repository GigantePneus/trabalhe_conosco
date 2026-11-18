import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerGiganteTools } from '../mcp-server/src/tools.js';
import { resolveOAuthTokenContext } from '../mcp-server/src/oauth.js';

export default async function mcpServerlessHandler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, mcp-session-id');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const pathname = (req.url || '').split('?')[0];
  if (pathname.endsWith('/health') && req.method === 'GET') {
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
    return;
  }

  // Normalização universal do cabeçalho Accept para compatibilidade com ChatGPT
  const rawAccept = req.headers['accept'] || '';
  if (!rawAccept.includes('application/json') || !rawAccept.includes('text/event-stream')) {
    req.headers['accept'] = 'application/json, text/event-stream';
  }

  const authHeader = req.headers['authorization'] || '';
  let incomingToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!incomingToken) {
    const url = new URL(req.url, 'http://localhost');
    incomingToken = (url.searchParams.get('access_token') || url.searchParams.get('token') || '').trim();
  }

  if (!incomingToken) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'ACESSO_NEGADO: Token de autenticação Bearer JWT ou OAuth é obrigatório.' },
      id: null
    }));
    return;
  }

  const operatorContext = await resolveOAuthTokenContext(incomingToken);
  if (!operatorContext) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'ACESSO_NEGADO: Sessão de operador inválida, desativada ou expirada.' },
      id: null
    }));
    return;
  }

  const host = req.headers['x-forwarded-host'] || req.headers['host'] || 'trabalheconosco.gigantepneus.com.br';
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const baseUrl = `${proto}://${host}`;
  const backendToken = operatorContext.supabaseSessionToken || incomingToken;

  const server = new McpServer({
    name: 'gigante-pneus-trabalhe-conosco-remoto',
    version: '1.2.0',
    description: 'Servidor MCP Administrativo — Gestão de vagas, candidatos e currículos Gigante Pneus'
  });

  registerGiganteTools(server, {
    getApiUrl: () => baseUrl,
    getAuthToken: () => backendToken
  });

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  await server.connect(transport);
  await transport.handleRequest(req, res);
}
