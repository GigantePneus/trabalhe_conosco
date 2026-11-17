/**
 * Teste de Validação e Homologação do MCP Remoto (Streamable HTTP) — Prompt 90
 * Gigante Pneus — Trabalhe Conosco Multi-Lojas
 * 
 * Valida:
 * - Inicialização do servidor remoto HTTP (Streamable HTTP / SSE)
 * - Healthcheck e OpenAPI Spec
 * - Rejeição fail-safe de requisições sem token (HTTP 401)
 * - Protocolo MCP remoto (initialize, tools/list)
 * - Presença das 7 ferramentas administrativas
 * - Isolamento multi-tenant (Master vs Franqueado)
 * - Trava de segurança contra alterações acidentais (confirmacao: true em publicação e desativação)
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
console.log('🧪 TESTES DE VALIDAÇÃO DO MCP REMOTO HTTP (PROMPT 90 — GIGANTE PNEUS)');
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

const TEST_PORT = 3005;
const MCP_URL = `http://localhost:${TEST_PORT}`;

// 1. Verificação de Arquivos e Estrutura do MCP Remoto
await test('1. Estrutura de arquivos do adaptador remoto compilado existe', () => {
  const mcpDir = resolve(rootDir, 'mcp-server');
  assert.ok(existsSync(resolve(mcpDir, 'src', 'remote.ts')), 'src/remote.ts deve existir');
  assert.ok(existsSync(resolve(mcpDir, 'src', 'tools.ts')), 'src/tools.ts deve existir');
  assert.ok(existsSync(resolve(mcpDir, 'dist', 'remote.js')), 'dist/remote.js deve existir (compilado)');
  assert.ok(existsSync(resolve(mcpDir, 'dist', 'tools.js')), 'dist/tools.js deve existir (compilado)');
});

// Helper para obter tokens JWT dos usuários no Supabase
async function getTestTokens() {
  const supaUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  const adminSupabase = createClient(supaUrl, serviceKey);
  const anonSupabase = createClient(supaUrl, anonKey);

  // 1. Gestor Master
  const { data: linkAdmin } = await adminSupabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'mktgigantepneus@gmail.com'
  });
  const { data: sessionAdmin } = await anonSupabase.auth.verifyOtp({
    email: 'mktgigantepneus@gmail.com',
    token: linkAdmin.properties.email_otp,
    type: 'magiclink'
  });

  // 2. Franqueado (Leandro Santana)
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

// Inicialização do processo do MCP Server Remoto
let remoteProcess = null;

async function startRemoteServer() {
  const entrypoint = resolve(rootDir, 'mcp-server', 'dist', 'remote.js');
  remoteProcess = spawn('node', [entrypoint], {
    env: {
      ...process.env,
      MCP_REMOTE_PORT: String(TEST_PORT),
      GIGANTE_API_URL: 'http://localhost:3000'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  remoteProcess.stderr.on('data', (d) => {
    console.error('[REMOTE STDERR]', d.toString());
  });
  remoteProcess.stdout.on('data', (d) => {
    // console.log('[REMOTE STDOUT]', d.toString());
  });

  // Aguarda até o servidor responder em /health
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${MCP_URL}/health`);
      if (res.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Falha ao iniciar o MCP Server Remoto no tempo limite.');
}

function stopRemoteServer() {
  if (remoteProcess) {
    try {
      remoteProcess.kill();
    } catch {}
    remoteProcess = null;
  }
}

try {
  await startRemoteServer();

  // 2. Healthcheck e Diagnóstico
  await test('2. Endpoint /health responde com status OK e metadados de transporte', async () => {
    const res = await fetch(`${MCP_URL}/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
    assert.strictEqual(data.service, 'gigante-pneus-mcp-remote');
    assert.strictEqual(data.transport, 'streamable-http');
    assert.strictEqual(data.mcpEndpoint, '/mcp');
  });

  // 3. Especificação OpenAPI para ChatGPT Actions
  await test('3. Endpoint /openapi.json retorna especificação OpenAPI 3.0 válida', async () => {
    const res = await fetch(`${MCP_URL}/openapi.json`);
    assert.strictEqual(res.status, 200);
    const spec = await res.json();
    assert.strictEqual(spec.openapi, '3.0.3');
    assert.ok(spec.info?.title.includes('Gigante Pneus'));
    assert.ok(spec.paths['/api/admin/lojas'], 'Deve conter rota de lojas');
    assert.ok(spec.paths['/api/admin/vagas'], 'Deve conter rota de vagas');
    assert.ok(spec.components?.securitySchemes?.BearerAuth, 'Deve declarar autenticação Bearer');
  });

  // 4. Segurança Fail-Safe: Rejeição de requisição sem token (HTTP 401)
  await test('4. Rejeição com HTTP 401 para requisições ao /mcp sem token Bearer', async () => {
    const res = await fetch(`${MCP_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } }
      })
    });

    assert.strictEqual(res.status, 401, 'Requisição sem token deve retornar HTTP 401');
    const data = await res.json();
    assert.strictEqual(data.error?.code, -32001);
    assert.ok(data.error?.message.includes('ACESSO_NEGADO'));
  });

  // Helper para enviar mensagens MCP via Streamable HTTP com autenticação Bearer
  async function sendMcpPost(token, jsonRpcPayload, sessionId = null) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Authorization': `Bearer ${token}`
    };
    if (sessionId) {
      headers['mcp-session-id'] = sessionId;
    }

    const res = await fetch(`${MCP_URL}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify(jsonRpcPayload)
    });

    const receivedSessionId = res.headers.get('mcp-session-id') || sessionId;
    const text = await res.text();
    // O retorno pode ser SSE ("event: message\ndata: {...}") ou JSON direto
    let parsedJson = null;
    if (text.includes('data:')) {
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data:')) {
          const jsonStr = trimmed.slice(5).trim();
          try {
            parsedJson = JSON.parse(jsonStr);
            break;
          } catch {}
        }
      }
    } else {
      try {
        parsedJson = JSON.parse(text);
      } catch {}
    }

    return { status: res.status, rawText: text, json: parsedJson, sessionId: receivedSessionId };
  }

  // 5. Handshake e Descoberta das 7 Ferramentas via Streamable HTTP
  let toolsList = [];
  let adminSessionId = null;
  await test('5. Handshake inicial e descoberta das 7 ferramentas administrativas via Streamable HTTP', async () => {
    // 5.1 Initialize
    const initRes = await sendMcpPost(adminToken, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'chatgpt-client', version: '1.0' }
      }
    });

    if (initRes.status !== 200) {
      throw new Error(`initRes status ${initRes.status}: ${initRes.rawText}`);
    }
    assert.strictEqual(initRes.status, 200);
    assert.ok(initRes.json?.result?.serverInfo, 'Deve retornar serverInfo');
    assert.strictEqual(initRes.json.result.serverInfo.name, 'gigante-pneus-trabalhe-conosco-remoto');
    adminSessionId = initRes.sessionId;
    assert.ok(adminSessionId, 'Deve gerar e retornar mcp-session-id');

    // 5.2 Descoberta de Ferramentas (tools/list) usando a sessão criada
    const toolsRes = await sendMcpPost(adminToken, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    }, adminSessionId);

    if (toolsRes.status !== 200) {
      throw new Error(`toolsRes status ${toolsRes.status}: ${toolsRes.rawText}`);
    }
    assert.strictEqual(toolsRes.status, 200);
    assert.ok(Array.isArray(toolsRes.json?.result?.tools), 'Deve retornar lista de tools');
    toolsList = toolsRes.json.result.tools;

    const toolNames = toolsList.map((t) => t.name);
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
      assert.ok(toolNames.includes(reqTool), `Ferramenta "${reqTool}" deve estar exposta no MCP Remoto`);
    }

    assert.strictEqual(toolNames.length, 7, 'O MCP Remoto deve expor exatamente as 7 ferramentas administrativas');
  });

  // 6. Execução de listar_lojas via MCP Remoto com Gestor Master
  await test('6. Ferramenta "listar_lojas" via MCP Remoto retorna lojas da rede', async () => {
    const callRes = await sendMcpPost(adminToken, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'listar_lojas',
        arguments: {}
      }
    }, adminSessionId);

    assert.strictEqual(callRes.status, 200);
    const textContent = callRes.json?.result?.content?.[0]?.text;
    assert.ok(textContent, 'Deve conter texto de resposta');
    assert.ok(textContent.includes('[HTTP 200]'));
    assert.ok(textContent.includes('"success": true'));
    assert.ok(textContent.includes('"lojas":'));
  });

  // 7. Isolamento Multi-Tenant no MCP Remoto (Franqueado restrito a 6 unidades)
  await test('7. Isolamento Multi-Tenant: Franqueado acessando o MCP Remoto vê apenas suas 6 lojas', async () => {
    assert.ok(franqueadoToken, 'Deve possuir token do Franqueado');

    // Executa a chamada com o token do Franqueado (AsyncLocalStorage vincula o contexto por requisição)
    const callRes = await sendMcpPost(franqueadoToken, {
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: {
        name: 'listar_lojas',
        arguments: {}
      }
    }, adminSessionId);

    assert.strictEqual(callRes.status, 200);
    const textContent = callRes.json?.result?.content?.[0]?.text;
    assert.ok(textContent);
    assert.ok(textContent.includes('[HTTP 200]'));

    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    assert.ok(jsonMatch);
    const parsed = JSON.parse(jsonMatch[0]);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.lojas.length, 6, 'Franqueado deve ter visibilidade restrita a exatamente 6 lojas');
  });

  // 8. Trava de Segurança: publicação sem confirmação explícita é bloqueada
  await test('8. Trava de Segurança: publicar_vaga sem confirmacao: true é bloqueada imediatamente', async () => {
    const callRes = await sendMcpPost(adminToken, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'publicar_vaga',
        arguments: {
          vagaId: 'vaga-fake-id',
          acao: 'publicar',
          confirmacao: false // Sem confirmação
        }
      }
    }, adminSessionId);

    assert.strictEqual(callRes.status, 200);
    const textContent = callRes.json?.result?.content?.[0]?.text;
    assert.ok(textContent);
    assert.ok(
      textContent.includes('CONFIRMAÇÃO EXIGIDA') || textContent.includes('AÇÃO BLOQUEADA'),
      'Deve retornar aviso de confirmação exigida'
    );
  });

  // 9. Trava de Segurança: desativação sem confirmação explícita é bloqueada
  await test('9. Trava de Segurança: desativar_vaga sem confirmacao: true é bloqueada imediatamente', async () => {
    const callRes = await sendMcpPost(adminToken, {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'desativar_vaga',
        arguments: {
          vagaId: 'vaga-fake-id',
          confirmacao: false // Sem confirmação
        }
      }
    }, adminSessionId);

    assert.strictEqual(callRes.status, 200);
    const textContent = callRes.json?.result?.content?.[0]?.text;
    assert.ok(textContent);
    assert.ok(
      textContent.includes('CONFIRMAÇÃO EXIGIDA') || textContent.includes('AÇÃO BLOQUEADA'),
      'Deve retornar aviso de confirmação exigida para desativação'
    );
  });

  // 10. Listar vagas com filtros operacionais no MCP Remoto
  await test('10. Ferramenta "listar_vagas" executa com filtros operacionais via MCP Remoto', async () => {
    const callRes = await sendMcpPost(adminToken, {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'listar_vagas',
        arguments: {
          limit: 3,
          status: 'todas'
        }
      }
    }, adminSessionId);

    assert.strictEqual(callRes.status, 200);
    const textContent = callRes.json?.result?.content?.[0]?.text;
    assert.ok(textContent);
    assert.ok(textContent.includes('[HTTP 200]'));
    assert.ok(textContent.includes('"vagas":'));
    assert.ok(textContent.includes('"paginacao":'));
  });
} finally {
  stopRemoteServer();
}

console.log('\n==============================================================================');
console.log(`TOTAL DE TESTES MCP REMOTO: ${passed + failed} | APROVADOS: ${passed} | FALHAS: ${failed}`);
console.log('==============================================================================\n');

if (failed > 0) {
  process.exit(1);
}
