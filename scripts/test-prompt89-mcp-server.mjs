/**
 * Teste de Validação e Homologação do MCP Server — Prompt 89
 * Gigante Pneus — Trabalhe Conosco Multi-Lojas
 * 
 * Executa testes de conformidade do protocolo MCP (JSON-RPC via stdio):
 * - Handshake de inicialização (initialize, notifications/initialized)
 * - Descoberta de ferramentas (tools/list com as 7 tools obrigatórias)
 * - Chamadas reais de ferramentas (tools/call com token JWT Master e Franqueado)
 * - Validação de segurança e isolamento multi-tenant via MCP
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// Carrega .env.local
const envLocalPath = resolve(rootDir, '.env.local');
if (existsSync(envLocalPath)) {
  const content = readFileSync(envLocalPath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match) {
      process.env[match[1]] = match[2].trim().replace(/^["'](.*)["']$/, '$1');
    }
  }
}

console.log('==============================================================================');
console.log('🧪 TESTES DE VALIDAÇÃO DO MCP SERVER (PROMPT 89 — GIGANTE PNEUS)');
console.log('==============================================================================\n');

let passed = 0;
let failed = 0;

async function test(description, fn) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${description}`);
    console.error(`    Erro: ${err.message}`);
    failed++;
  }
}

// 1. Verificação de Arquivos e Estrutura do MCP Server
await test('1. Estrutura de arquivos do mcp-server está completa e compilada', () => {
  const mcpDir = resolve(rootDir, 'mcp-server');
  assert.ok(existsSync(resolve(mcpDir, 'package.json')), 'mcp-server/package.json deve existir');
  assert.ok(existsSync(resolve(mcpDir, 'tsconfig.json')), 'mcp-server/tsconfig.json deve existir');
  assert.ok(existsSync(resolve(mcpDir, 'src', 'index.ts')), 'mcp-server/src/index.ts deve existir');
  assert.ok(existsSync(resolve(mcpDir, 'dist', 'index.js')), 'mcp-server/dist/index.js deve existir (compilado)');
});

// Helper para comunicação JSON-RPC com o processo MCP via stdio
class McpClient {
  constructor(envOverrides = {}) {
    this.env = {
      ...process.env,
      GIGANTE_API_URL: 'http://localhost:3000',
      ...envOverrides
    };
    this.process = null;
    this.messageId = 1;
    this.pendingRequests = new Map();
    this.buffer = '';
  }

  async start() {
    const entrypoint = resolve(rootDir, 'mcp-server', 'dist', 'index.js');
    this.process = spawn('node', [entrypoint], {
      env: this.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.process.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          if (msg.id && this.pendingRequests.has(msg.id)) {
            const { resolve, reject } = this.pendingRequests.get(msg.id);
            this.pendingRequests.delete(msg.id);
            if (msg.error) {
              reject(new Error(`MCP Error ${msg.error.code}: ${msg.error.message}`));
            } else {
              resolve(msg.result);
            }
          }
        } catch (e) {
          // Linha não-JSON, ignora
        }
      }
    });

    // Espera inicialização do processo
    await new Promise((r) => setTimeout(r, 600));
  }

  sendRequest(method, params = {}) {
    const id = this.messageId++;
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP Request timeout para ${method} (id=${id})`));
      }, 10000);

      this.pendingRequests.set(id, {
        resolve: (val) => {
          clearTimeout(timeout);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        }
      });

      this.process.stdin.write(JSON.stringify(payload) + '\n');
    });
  }

  sendNotification(method, params = {}) {
    const payload = {
      jsonrpc: '2.0',
      method,
      params
    };
    this.process.stdin.write(JSON.stringify(payload) + '\n');
  }

  stop() {
    if (this.process) {
      try {
        this.process.kill();
      } catch {}
      this.process = null;
    }
  }
}

// 2. Handshake MCP e Verificação de Ferramentas
let discoveredTools = [];
await test('2. Protocolo MCP: inicialização e descoberta das 7 ferramentas obrigatórias', async () => {
  const client = new McpClient({ GIGANTE_AUTH_TOKEN: 'token-temporario-teste' });
  await client.start();

  try {
    // Handshake
    const initResult = await client.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-runner', version: '1.0.0' }
    });

    assert.ok(initResult, 'initResult deve existir');
    assert.strictEqual(initResult.serverInfo?.name, 'gigante-pneus-trabalhe-conosco');

    client.sendNotification('notifications/initialized');

    // Descoberta de ferramentas
    const toolsResult = await client.sendRequest('tools/list');
    assert.ok(toolsResult?.tools, 'Deve retornar lista de tools');
    discoveredTools = toolsResult.tools;

    const toolNames = discoveredTools.map((t) => t.name);

    const requiredTools = [
      'listar_lojas',
      'listar_vagas',
      'consultar_vaga',
      'criar_vaga',
      'editar_vaga',
      'publicar_vaga',
      'desativar_vaga'
    ];

    for (const reqTool of requiredTools) {
      assert.ok(toolNames.includes(reqTool), `Ferramenta obrigatória "${reqTool}" deve estar exposta no MCP`);
    }

    assert.strictEqual(toolNames.length, 7, 'O MCP deve expor exatamente as 7 ferramentas administrativas');
  } finally {
    client.stop();
  }
});

// Helper para obter tokens JWT dos usuários no Supabase
async function getTestTokens() {
  const supaUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  const adminSupabase = createClient(supaUrl, serviceKey);
  const anonSupabase = createClient(supaUrl, anonKey);

  // 1. Gestor Master (franqueadora_admin)
  const { data: linkAdmin } = await adminSupabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'mktgigantepneus@gmail.com'
  });
  const { data: sessionAdmin } = await anonSupabase.auth.verifyOtp({
    email: 'mktgigantepneus@gmail.com',
    token: linkAdmin.properties.email_otp,
    type: 'magiclink'
  });

  // 2. Leandro Santana (franqueado)
  const { data: linkLeandro } = await adminSupabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'mktgigantepneus+leandro@gmail.com'
  });
  const { data: sessionLeandro } = await anonSupabase.auth.verifyOtp({
    email: 'mktgigantepneus+leandro@gmail.com',
    token: linkLeandro.properties.email_otp,
    type: 'magiclink'
  });

  return {
    adminToken: sessionAdmin?.session?.access_token,
    franqueadoToken: sessionLeandro?.session?.access_token
  };
}

const { adminToken, franqueadoToken } = await getTestTokens();

// 3. Teste de Chamada de Ferramenta: listar_lojas via MCP com Gestor Master
await test('3. Ferramenta MCP "listar_lojas" executa via stdio com token Master', async () => {
  const client = new McpClient({ GIGANTE_AUTH_TOKEN: adminToken });
  await client.start();

  try {
    await client.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-runner', version: '1.0.0' }
    });
    client.sendNotification('notifications/initialized');

    const result = await client.sendRequest('tools/call', {
      name: 'listar_lojas',
      arguments: {}
    });

    assert.ok(result?.content?.[0]?.text, 'Deve retornar conteúdo de texto');
    const text = result.content[0].text;
    assert.ok(text.includes('[HTTP 200]'), 'Deve retornar código HTTP 200');
    assert.ok(text.includes('"success": true'), 'Deve retornar success: true');
    assert.ok(text.includes('"lojas":'), 'Deve conter o array de lojas');
  } finally {
    client.stop();
  }
});

// 4. Teste de Chamada de Ferramenta: listar_vagas com filtros via MCP
let sampleVagaId = null;
await test('4. Ferramenta MCP "listar_vagas" executa com filtros e paginação via stdio', async () => {
  const client = new McpClient({ GIGANTE_AUTH_TOKEN: adminToken });
  await client.start();

  try {
    await client.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-runner', version: '1.0.0' }
    });
    client.sendNotification('notifications/initialized');

    const result = await client.sendRequest('tools/call', {
      name: 'listar_vagas',
      arguments: {
        limit: 5,
        status: 'todas'
      }
    });

    assert.ok(result?.content?.[0]?.text, 'Deve retornar conteúdo');
    const text = result.content[0].text;
    assert.ok(text.includes('[HTTP 200]'), 'Deve retornar HTTP 200');
    assert.ok(text.includes('"vagas":'), 'Deve conter array de vagas');
    assert.ok(text.includes('"paginacao":'), 'Deve conter dados de paginação');

    // Extrai o primeiro ID para testar consultar_vaga
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.vagas && parsed.vagas.length > 0) {
        sampleVagaId = parsed.vagas[0].id;
      }
    }
  } finally {
    client.stop();
  }
});

// 5. Teste de Chamada de Ferramenta: consultar_vaga via MCP
await test('5. Ferramenta MCP "consultar_vaga" retorna detalhes completos de vaga existente', async () => {
  if (!sampleVagaId) {
    console.log('    (Nenhuma vaga existente encontrada para consultar; pulando)');
    return;
  }

  const client = new McpClient({ GIGANTE_AUTH_TOKEN: adminToken });
  await client.start();

  try {
    await client.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-runner', version: '1.0.0' }
    });
    client.sendNotification('notifications/initialized');

    const result = await client.sendRequest('tools/call', {
      name: 'consultar_vaga',
      arguments: {
        vagaId: sampleVagaId
      }
    });

    assert.ok(result?.content?.[0]?.text);
    const text = result.content[0].text;
    assert.ok(text.includes('[HTTP 200]'), 'Deve retornar HTTP 200');
    assert.ok(text.includes(sampleVagaId), 'Deve conter o ID consultado');
    assert.ok(text.includes('"titulo":'), 'Deve conter o título da vaga');
    assert.ok(text.includes('"status":'), 'Deve conter o status da vaga');
  } finally {
    client.stop();
  }
});

// 6. Teste de Rejeição de Token Inválido no MCP Server
await test('6. MCP Server repassa e reporta erro HTTP 401 para token inválido', async () => {
  const client = new McpClient({ GIGANTE_AUTH_TOKEN: 'token-jwt-totalmente-invalido' });
  await client.start();

  try {
    await client.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-runner', version: '1.0.0' }
    });
    client.sendNotification('notifications/initialized');

    const result = await client.sendRequest('tools/call', {
      name: 'listar_lojas',
      arguments: {}
    });

    assert.ok(result?.content?.[0]?.text);
    const text = result.content[0].text;
    assert.ok(text.includes('[HTTP 401]'), 'Deve indicar HTTP 401 no texto de retorno');
    assert.ok(text.includes('ACESSO_NEGADO'), 'Deve reportar ACESSO_NEGADO');
  } finally {
    client.stop();
  }
});

// 7. Teste de Isolamento Multi-Tenant do Franqueado via MCP Server
await test('7. Franqueado tem visibilidade estrita de suas 6 unidades ao usar o MCP Server', async () => {
  assert.ok(franqueadoToken, 'Deve possuir token do Franqueado');

  const client = new McpClient({ GIGANTE_AUTH_TOKEN: franqueadoToken });
  await client.start();

  try {
    await client.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-runner', version: '1.0.0' }
    });
    client.sendNotification('notifications/initialized');

    const result = await client.sendRequest('tools/call', {
      name: 'listar_lojas',
      arguments: {}
    });

    assert.ok(result?.content?.[0]?.text);
    const text = result.content[0].text;
    assert.ok(text.includes('[HTTP 200]'));

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    assert.ok(jsonMatch, 'Deve conter JSON válido');
    const parsed = JSON.parse(jsonMatch[0]);
    assert.strictEqual(parsed.success, true);
    assert.ok(Array.isArray(parsed.lojas), 'Deve conter lista de lojas');
    assert.strictEqual(parsed.lojas.length, 6, 'Franqueado deve ter visibilidade restrita a exatamente 6 unidades');

    // Validação de que não possui acesso a Jundiaí (eaacf2ee-4bdb-4b0a-ae4a-474389330175)
    const lojaJundiai = parsed.lojas.find((l) => l.id === 'eaacf2ee-4bdb-4b0a-ae4a-474389330175');
    assert.strictEqual(lojaJundiai, undefined, 'Franqueado não deve ver unidade fora de sua franquia');
  } finally {
    client.stop();
  }
});

console.log('\n==============================================================================');
console.log(`TOTAL DE TESTES MCP: ${passed + failed} | APROVADOS: ${passed} | FALHAS: ${failed}`);
console.log('==============================================================================\n');

if (failed > 0) {
  process.exit(1);
}
