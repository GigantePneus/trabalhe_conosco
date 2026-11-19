#!/usr/bin/env node
/**
 * MCP Server Remoto (Streamable HTTP + OAuth 2.1) — Gigante Pneus — Trabalhe Conosco
 * 
 * Protocolos:
 * - Streamable HTTP (MCP RFC para conexões remotas de IA)
 * - OAuth 2.1 com PKCE S256 (RFC 8414, RFC 7636, RFC 6749)
 * - OpenAPI 3.0 para Custom GPT Actions
 * 
 * Autenticação:
 * - Validação de tokens OAuth emitidos ou JWT direto do Supabase
 * - Resolução de operador autenticado em `perfis` e `usuario_lojas`
 * - AsyncLocalStorage isola a identidade de cada operador por requisição sem vazamento
 */

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerGiganteTools } from './tools.js';
import {
  handleOAuthMetadata,
  handleOAuthAuthorize,
  handleOAuthToken,
  handleOAuthRevoke,
  handleOAuthUserinfo,
  resolveOAuthTokenContext
} from './oauth.js';

// ─── Carregamento de Ambiente ──────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..', '..');

const envLocalPath = resolve(rootDir, '.env.local');
if (existsSync(envLocalPath)) {
  const content = readFileSync(envLocalPath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["'](.*)["']$/, '$1');
    }
  }
}

const PORT = Number(process.env.MCP_REMOTE_PORT || process.env.PORT || 3001);
const HOST = process.env.MCP_REMOTE_HOST || '0.0.0.0';
const API_BASE_URL = process.env.GIGANTE_API_URL || 'http://localhost:3000';
const GLOBAL_FALLBACK_TOKEN = process.env.GIGANTE_AUTH_TOKEN || '';

// Contexto isolado por requisição via AsyncLocalStorage
interface RequestContext {
  token: string;
}
const requestContext = new AsyncLocalStorage<RequestContext>();

// ─── Fábrica do Servidor MCP ──────────────────────────────────────────────────

function createMcpServerInstance(): McpServer {
  const server = new McpServer({
    name: 'gigante-pneus-trabalhe-conosco-remoto',
    version: '1.4.0',
    description: 'Servidor MCP Remoto — Gestão de vagas e lojas Gigante Pneus Multi-Lojas'
  });

  // Registra as 7 ferramentas administrativas reutilizando a lógica compartilhada
  registerGiganteTools(server, {
    getApiUrl: () => API_BASE_URL,
    getAuthToken: () => {
      const store = requestContext.getStore();
      return store?.token || GLOBAL_FALLBACK_TOKEN;
    }
  });

  return server;
}

// ─── Especificação OpenAPI 3.0 para ChatGPT Actions ────────────────────────────

function getOpenApiSpec(baseUrl: string) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Trabalhe Conosco Gigante Pneus — API Administrativa',
      version: '1.0.0',
      description: 'API administrativa para gestão de vagas e unidades da Gigante Pneus.'
    },
    servers: [{ url: baseUrl }],
    components: {
      securitySchemes: {
        OAuth2: {
          type: 'oauth2',
          description: 'Fluxo OAuth 2.1 Authorization Code com PKCE',
          flows: {
            authorizationCode: {
              authorizationUrl: `${baseUrl}/oauth/authorize`,
              tokenUrl: `${baseUrl}/oauth/token`,
              scopes: {
                admin: 'Acesso administrativo completo',
                'vagas:read': 'Consultar vagas e unidades',
                'vagas:write': 'Criar e gerenciar vagas'
              }
            }
          }
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT de sessão do operador administrativo'
        }
      }
    },
    security: [{ OAuth2: ['admin'] }, { BearerAuth: [] }],
    paths: {
      '/api/admin/lojas': {
        get: {
          operationId: 'listarLojas',
          summary: 'Listar unidades autorizadas da rede Gigante Pneus',
          responses: { '200': { description: 'Lista de unidades' } }
        }
      },
      '/api/admin/vagas': {
        get: {
          operationId: 'listarVagas',
          summary: 'Listar ou consultar vagas com filtros',
          parameters: [
            { name: 'id', in: 'query', schema: { type: 'string' } },
            { name: 'lojaId', in: 'query', schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['todas', 'publicadas', 'rascunhos', 'desativadas'] } },
            { name: 'titulo', in: 'query', schema: { type: 'string' } },
            { name: 'page', in: 'query', schema: { type: 'integer' } },
            { name: 'limit', in: 'query', schema: { type: 'integer' } }
          ],
          responses: { '200': { description: 'Lista ou detalhes da vaga' } }
        },
        post: {
          operationId: 'criarVaga',
          summary: 'Criar vaga como Rascunho',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['titulo'], properties: { titulo: { type: 'string' }, lojaId: { type: 'string' } } } } }
          },
          responses: { '201': { description: 'Vaga criada com sucesso' } }
        },
        patch: {
          operationId: 'editarOuPublicarVaga',
          summary: 'Editar vaga ou alterar status de publicação',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: { vagaId: { type: 'string' }, acao: { type: 'string' } } } } }
          },
          responses: { '200': { description: 'Operação concluída' } }
        }
      }
    }
  };
}

// ─── Servidor HTTP ─────────────────────────────────────────────────────────────

const httpServer = http.createServer(async (req, res) => {
  // CORS Headers universais
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, mcp-session-id, x-requested-with');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Identificação do Host e Issuer
  const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
  const host = req.headers['host'] || `localhost:${PORT}`;
  const baseUrl = `${proto}://${host}`;
  const url = new URL(req.url || '/', baseUrl);

  // 1. Healthcheck e diagnóstico
  if (url.pathname === '/health' || url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'gigante-pneus-mcp-remote',
      transport: 'streamable-http',
      mcpEndpoint: '/mcp',
      oauthEndpoints: {
        authorization: '/oauth/authorize',
        token: '/oauth/token',
        revocation: '/oauth/revoke',
        userinfo: '/oauth/userinfo',
        discovery: '/.well-known/oauth-authorization-server'
      },
      backendApi: API_BASE_URL,
      version: '1.1.0',
      timestamp: new Date().toISOString()
    }, null, 2));
    return;
  }

  // 2. RFC 8414 - Descoberta de Metadados OAuth
  if (
    url.pathname === '/.well-known/oauth-authorization-server' ||
    url.pathname === '/.well-known/openid-configuration'
  ) {
    return handleOAuthMetadata(req, res, baseUrl);
  }

  // 3. OAuth Authorize (/oauth/authorize)
  if (url.pathname === '/oauth/authorize') {
    return handleOAuthAuthorize(req, res);
  }

  // 4. OAuth Token (/oauth/token)
  if (url.pathname === '/oauth/token') {
    return handleOAuthToken(req, res);
  }

  // 5. OAuth Revoke (/oauth/revoke)
  if (url.pathname === '/oauth/revoke') {
    return handleOAuthRevoke(req, res);
  }

  // 6. OAuth Userinfo (/oauth/userinfo)
  if (url.pathname === '/oauth/userinfo') {
    return handleOAuthUserinfo(req, res);
  }

  // 7. Especificação OpenAPI para ChatGPT Actions
  if (url.pathname === '/openapi.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getOpenApiSpec(baseUrl), null, 2));
    return;
  }

  // 8. Endpoint MCP Streamable HTTP (/mcp)
  if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) {
    // Normalização universal do cabeçalho Accept:
    // O SDK MCP Streamable HTTP rejeita com HTTP 406 Not Acceptable se o cliente não listar
    // tanto application/json quanto text/event-stream. Clientes como o conector MCP do ChatGPT
    // enviam apenas application/json ou */*.
    const rawAccept = req.headers['accept'] || '';
    if (!rawAccept.includes('application/json') || !rawAccept.includes('text/event-stream')) {
      req.headers['accept'] = 'application/json, text/event-stream';
    }

    const authHeader = req.headers['authorization'] || '';
    let incomingToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    // Suporte a token via query string (muito comum em EventSource / conexões SSE)
    if (!incomingToken) {
      incomingToken = (url.searchParams.get('access_token') || url.searchParams.get('token') || '').trim();
    }

    if (!incomingToken && GLOBAL_FALLBACK_TOKEN) {
      incomingToken = GLOBAL_FALLBACK_TOKEN;
    }

    // Fail-safe de autenticação para chamadas POST / GET
    if (!incomingToken && (req.method === 'POST' || req.method === 'GET')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'ACESSO_NEGADO: Token de autenticação Bearer JWT ou OAuth é obrigatório para acessar o MCP administrativo.'
        },
        id: null
      }));
      return;
    }

    // Resolução segura da identidade do operador (OAuth token ou Supabase JWT)
    let backendToken = incomingToken;
    if (incomingToken) {
      const operatorContext = await resolveOAuthTokenContext(incomingToken);
      if (!operatorContext) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'ACESSO_NEGADO: Sessão de operador inválida, desativada ou expirada.'
          },
          id: null
        }));
        return;
      }
      backendToken = operatorContext.supabaseSessionToken || incomingToken;
    }

    // Executa a requisição encapsulada no contexto do operador autenticado.
    // Utiliza instância stateless por requisição (sessionIdGenerator: undefined, enableJsonResponse: true)
    // conforme o padrão oficial do Streamable HTTP para evitar colisões e garantir compatibilidade
    // imediata com a descoberta de ações do ChatGPT (initialize -> notifications/initialized -> tools/list).
    await requestContext.run({ token: backendToken }, async () => {
      try {
        const mcpServerInstance = createMcpServerInstance();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });

        await mcpServerInstance.connect(transport);
        await transport.handleRequest(req, res);
      } catch (err: any) {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: err.message || 'Erro interno no MCP Server' },
            id: null
          }));
        }
      }
    });
    return;
  }

  // 9. Rota não encontrada
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, mensagem: `Rota não encontrada: ${req.url}` }));
});

httpServer.listen(PORT, HOST, () => {
  console.log('==============================================================================');
  console.log('🚀 MCP SERVER REMOTO INICIADO (STREAMABLE HTTP + OAUTH 2.1 PKCE)');
  console.log('==============================================================================');
  console.log(`📡 Endereço Local    : http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`🔗 Endpoint MCP       : http://localhost:${PORT}/mcp`);
  console.log(`🔑 OAuth Authorize    : http://localhost:${PORT}/oauth/authorize`);
  console.log(`🎟️  OAuth Token        : http://localhost:${PORT}/oauth/token`);
  console.log(`🔎 OAuth Discovery    : http://localhost:${PORT}/.well-known/oauth-authorization-server`);
  console.log(`📋 OpenAPI Spec       : http://localhost:${PORT}/openapi.json`);
  console.log(`🏥 Healthcheck        : http://localhost:${PORT}/health`);
  console.log(`🌐 Backend API        : ${API_BASE_URL}`);
  console.log('==============================================================================');
});
