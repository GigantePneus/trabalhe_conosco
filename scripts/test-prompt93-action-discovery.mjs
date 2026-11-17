/**
 * Teste Automatizado de Resolução do Prompt 93
 * Validação do Fluxo Completo de Descoberta de Ferramentas MCP (Action Discovery)
 * 
 * Sequência MCP RFC Streamable HTTP:
 * 1. GET /health
 * 2. POST /mcp sem autenticação -> Confirma HTTP 401
 * 3. Emissão de Token OAuth 2.1 com PKCE S256 via Sessão Supabase
 * 4. POST /mcp initialize -> Confirma HTTP 200 e capabilities
 * 5. POST /mcp notifications/initialized -> Confirma HTTP 202
 * 6. POST /mcp tools/list -> Confirma HTTP 200 e exatamente 7 ferramentas
 * 7. POST /mcp tools/call (listar_lojas) -> Confirma execução com sucesso
 * 8. Revalidação via Túnel Público Cloudflare HTTPS
 */

import crypto from 'node:crypto';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// Carregar variáveis locais
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

const LOCAL_MCP_URL = 'http://localhost:3001';
const PUBLIC_TUNNEL_URL = 'https://barrel-calm-liabilities-eggs.trycloudflare.com';

function base64UrlEncode(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest();
}

async function runPrompt93Tests() {
  console.log('================================================================');
  console.log('🧪 TESTE AUTOMATIZADO PROMPT 93: MCP ACTION DISCOVERY');
  console.log('================================================================\n');

  // ─── 1. Healthcheck ──────────────────────────────────────────────────────────
  console.log('1️⃣  Testando Healthcheck local...');
  const healthRes = await fetch(`${LOCAL_MCP_URL}/health`);
  assert.strictEqual(healthRes.status, 200, `Healthcheck falhou: HTTP ${healthRes.status}`);
  const healthData = await healthRes.json();
  console.log(`   ✅ Healthcheck OK: status="${healthData.status}", service="${healthData.service}"\n`);

  // ─── 2. Teste de Rejeição sem Autenticação ────────────────────────────────────
  console.log('2️⃣  Testando POST /mcp sem autenticação...');
  const unauthRes = await fetch(`${LOCAL_MCP_URL}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {} }
    })
  });
  assert.strictEqual(unauthRes.status, 401, `Esperava HTTP 401, recebeu ${unauthRes.status}`);
  console.log(`   ✅ Rejeição não autenticada confirmada: HTTP 401\n`);

  // ─── 3. Obtenção de Token OAuth 2.1 via PKCE ─────────────────────────────────
  console.log('3️⃣  Obtendo Token OAuth 2.1 via PKCE S256 (Operador Franqueadora Admin)...');
  const supaUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  assert.ok(supaUrl && serviceKey && anonKey, 'Chaves do Supabase necessárias no .env.local');

  const adminSupabase = createClient(supaUrl, serviceKey);
  const anonSupabase = createClient(supaUrl, anonKey);

  const { data: linkAdmin } = await adminSupabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'mktgigantepneus@gmail.com'
  });
  const { data: sessionAdmin } = await anonSupabase.auth.verifyOtp({
    email: 'mktgigantepneus@gmail.com',
    token: linkAdmin.properties.email_otp,
    type: 'magiclink'
  });

  const supabaseSessionToken = sessionAdmin?.session?.access_token;
  assert.ok(supabaseSessionToken, 'Falha ao obter token de sessão no Supabase');

  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const codeChallenge = base64UrlEncode(sha256(codeVerifier));
  const state = base64UrlEncode(crypto.randomBytes(16));

  // Solicita autorização OAuth passando a sessão autenticada do operador
  const authBody = new URLSearchParams({
    client_id: 'chatgpt-gigante-mcp',
    redirect_uri: 'https://chatgpt.com/api/aip/callback',
    response_type: 'code',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: state,
    session_token: supabaseSessionToken
  });

  const authRes = await fetch(`${LOCAL_MCP_URL}/oauth/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: authBody.toString(),
    redirect: 'manual'
  });

  assert.strictEqual(authRes.status, 302, `Esperava redirecionamento 302, obteve ${authRes.status}`);
  const redirectLocation = authRes.headers.get('location') || '';
  const redirectUrl = new URL(redirectLocation);
  const code = redirectUrl.searchParams.get('code');
  assert.ok(code, 'Código de autorização não retornado');

  // Troca de Código por Token OAuth
  const tokenRes = await fetch(`${LOCAL_MCP_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: 'chatgpt-gigante-mcp',
      redirect_uri: 'https://chatgpt.com/api/aip/callback',
      code: code,
      code_verifier: codeVerifier
    }).toString()
  });

  assert.strictEqual(tokenRes.status, 200, `Falha na emissão do token: ${tokenRes.status}`);
  const tokenData = await tokenRes.json();
  assert.ok(tokenData.access_token, 'Token OAuth ausente na resposta');
  console.log(`   ✅ Token OAuth 2.1 emitido com sucesso (tipo: ${tokenData.token_type}, expira em: ${tokenData.expires_in}s)\n`);

  const oauthAccessToken = tokenData.access_token;

  // ─── 4. Sequência MCP do ChatGPT com Token OAuth ─────────────────────────────
  console.log('4️⃣  Executando Sequência Completa do Protocolo MCP...');

  // A. initialize
  console.log('   -> Enviando "initialize" (Accept: application/json)...');
  const initRes = await fetch(`${LOCAL_MCP_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json', // Simula o ChatGPT sem text/event-stream explícito
      'Authorization': `Bearer ${oauthAccessToken}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'init-chatgpt-1',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'ChatGPT-Action-Discovery', version: '1.0.0' }
      }
    })
  });

  assert.strictEqual(initRes.status, 200, `Initialize falhou com HTTP ${initRes.status}`);
  const initContentType = initRes.headers.get('content-type') || '';
  assert.ok(initContentType.includes('application/json'), `Content-Type inesperado: ${initContentType}`);
  const initJson = await initRes.json();
  assert.strictEqual(initJson.jsonrpc, '2.0');
  assert.strictEqual(initJson.id, 'init-chatgpt-1');
  assert.ok(initJson.result?.serverInfo?.name, 'serverInfo ausente');
  console.log(`   ✅ Initialize bem-sucedido: Server "${initJson.result.serverInfo.name}" (Protocolo: ${initJson.result.protocolVersion})`);

  // B. notifications/initialized
  console.log('   -> Enviando "notifications/initialized"...');
  const notifRes = await fetch(`${LOCAL_MCP_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${oauthAccessToken}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    })
  });

  assert.strictEqual(notifRes.status, 202, `notifications/initialized falhou com HTTP ${notifRes.status}`);
  console.log(`   ✅ Notificação initialized aceita: HTTP 202`);

  // C. tools/list (A etapa exata que falhava no ChatGPT)
  console.log('   -> Enviando "tools/list" (Action Discovery)...');
  const toolsRes = await fetch(`${LOCAL_MCP_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${oauthAccessToken}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'list-chatgpt-tools',
      method: 'tools/list',
      params: {}
    })
  });

  assert.strictEqual(toolsRes.status, 200, `tools/list falhou com HTTP ${toolsRes.status}`);
  const toolsContentType = toolsRes.headers.get('content-type') || '';
  assert.ok(toolsContentType.includes('application/json'), `Content-Type inesperado em tools/list: ${toolsContentType}`);
  const toolsJson = await toolsRes.json();
  assert.strictEqual(toolsJson.jsonrpc, '2.0');
  assert.strictEqual(toolsJson.id, 'list-chatgpt-tools');
  assert.ok(Array.isArray(toolsJson.result?.tools), 'tools não é um array');

  const tools = toolsJson.result.tools;
  const toolNames = tools.map(t => t.name);
  console.log(`   ✅ Descoberta de ferramentas concluída com sucesso!`);
  console.log(`   📊 Total de ferramentas descobertas: ${tools.length}`);
  console.log(`   🛠️  Ferramentas:`, toolNames);

  assert.strictEqual(tools.length, 7, `Esperava exatamente 7 ferramentas, encontrou ${tools.length}`);
  const expectedTools = [
    'listar_lojas',
    'listar_vagas',
    'consultar_vaga',
    'criar_vaga',
    'editar_vaga',
    'publicar_vaga',
    'desativar_vaga'
  ];
  for (const expected of expectedTools) {
    assert.ok(toolNames.includes(expected), `Ferramenta ausente: ${expected}`);
  }

  // D. tools/call (listar_lojas)
  console.log('   -> Testando execução da ferramenta "listar_lojas"...');
  const callRes = await fetch(`${LOCAL_MCP_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${oauthAccessToken}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'call-listar-lojas',
      method: 'tools/call',
      params: {
        name: 'listar_lojas',
        arguments: {}
      }
    })
  });

  assert.strictEqual(callRes.status, 200, `tools/call falhou: HTTP ${callRes.status}`);
  const callJson = await callRes.json();
  assert.ok(callJson.result?.content?.[0]?.text, 'Resultado de execução ausente');
  console.log(`   ✅ Execução de "listar_lojas" realizada com sucesso no backend autenticado!\n`);

  // ─── 5. Teste via Túnel Cloudflare Público ─────────────────────────────────────
  console.log('5️⃣  Validando Descoberta via Túnel Cloudflare Público...');
  console.log(`   🌐 URL: ${PUBLIC_TUNNEL_URL}/mcp`);

  try {
    const publicInitRes = await fetch(`${PUBLIC_TUNNEL_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${oauthAccessToken}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'public-init',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'ChatGPT-Public-Check', version: '1.0.0' }
        }
      })
    });

    assert.strictEqual(publicInitRes.status, 200, `Túnel público initialize: HTTP ${publicInitRes.status}`);

    const publicToolsRes = await fetch(`${PUBLIC_TUNNEL_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${oauthAccessToken}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'public-tools-list',
        method: 'tools/list',
        params: {}
      })
    });

    assert.strictEqual(publicToolsRes.status, 200, `Túnel público tools/list: HTTP ${publicToolsRes.status}`);
    const publicToolsJson = await publicToolsRes.json();
    assert.strictEqual(publicToolsJson.result?.tools?.length, 7, 'Ferramentas via túnel público != 7');
    console.log(`   ✅ Descoberta via Túnel Público HTTPS confirmada! 7 ferramentas retornadas com status HTTP 200.\n`);
  } catch (err) {
    console.error(`   ⚠️ Erro ao verificar túnel público: ${err.message}`);
    throw err;
  }

  console.log('================================================================');
  console.log('🎉 TODOS OS TESTES DO PROMPT 93 PASSARAM COM SUCESSO ABSOLUTO!');
  console.log('================================================================');
}

runPrompt93Tests().catch(err => {
  console.error('\n❌ ERRO NO TESTE:', err);
  process.exit(1);
});
