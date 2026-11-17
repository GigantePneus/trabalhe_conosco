#!/usr/bin/env node
/**
 * MCP Server (STDIO) — Gigante Pneus — Trabalhe Conosco
 * 
 * Transporte: stdio (padrão oficial para clientes locais)
 * Autenticação: Bearer JWT de operador administrativo via GIGANTE_AUTH_TOKEN
 * API Backend: http://localhost:3000 (dev) ou URL de produção
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerGiganteTools } from './tools.js';

const API_BASE_URL = process.env.GIGANTE_API_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.GIGANTE_AUTH_TOKEN || '';

if (!AUTH_TOKEN) {
  console.error('[MCP-STDIO] ⚠️  GIGANTE_AUTH_TOKEN não definido. Todas as chamadas serão rejeitadas pela API.');
}

const server = new McpServer({
  name: 'gigante-pneus-trabalhe-conosco',
  version: '1.0.0',
  description: 'Gestão administrativa de vagas e lojas do sistema Trabalhe Conosco — Gigante Pneus Multi-Lojas'
});

registerGiganteTools(server, {
  getApiUrl: () => API_BASE_URL,
  getAuthToken: () => AUTH_TOKEN
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP-STDIO] 🚀 Gigante Pneus MCP Server rodando via stdio');
  console.error(`[MCP-STDIO] 🔗 API: ${API_BASE_URL}`);
  console.error(`[MCP-STDIO] 🔑 Token: ${AUTH_TOKEN ? '***configurado***' : '⚠️  NÃO DEFINIDO'}`);
}

main().catch((error) => {
  console.error('[MCP-STDIO] ❌ Erro fatal:', error);
  process.exit(1);
});
