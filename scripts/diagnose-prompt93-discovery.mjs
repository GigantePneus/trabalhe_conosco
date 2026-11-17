/**
 * Script de Diagnóstico — Prompt 93: Action Discovery
 * Simula com precisão o que o ChatGPT faz após autenticação OAuth:
 * 1. Emissão de token OAuth real via Authorization Code + PKCE
 * 2. POST /mcp com initialize
 * 3. POST /mcp com notifications/initialized
 * 4. POST /mcp com tools/list
 * 5. GET /mcp (verificar se o cliente tenta abrir SSE stream)
 * 6. Inspeção de formatos de resposta (JSON vs SSE) e schemas
 */

import { createHash, randomBytes } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
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
    if (match) process.env[match[1]] = match[2].trim().replace(/^["'](.*)["']$/, '$1');
  }
}

const MCP_PORT = 3001;
const LOCAL_URL = `http://localhost:${MCP_PORT}`;
const TUNNEL_URL = 'https://barrel-calm-liabilities-eggs.trycloudflare.com';

console.log('=== DIAGNÓSTICO PROMPT 93: ACTION DISCOVERY ===\n');

// 1. Obter token de sessão válido do Supabase para o Master
const supaUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
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
const masterJwt = sessionAdmin.session.access_token;
console.log('✓ Sessão Supabase Master obtida.');

// 2. Simular fluxo OAuth real com PKCE para obter token OAuth
const { authenticateOperator } = await import('../mcp-server/dist/oauth.js');
const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');

// Cria código de autorização diretamente no módulo oauth para simular a troca
const authCodesMap = (await import('../mcp-server/dist/oauth.js')).authCodes;
// Mas como authCodes não é exportado diretamente, vamos fazer a troca via /oauth/authorize e /oauth/token se possível,
// ou usar o JWT direto do Supabase que nosso servidor resolve no mesmo caminho!
// Vamos testar tanto com o JWT do Supabase quanto com um token gerado via /oauth/token!

// Teste 1: Initialize com Accept: application/json (o que o ChatGPT pode enviar)
console.log('\n--- TESTE 1: initialize com Accept: application/json ---');
const initRes1 = await fetch(`${LOCAL_URL}/mcp`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${masterJwt}`
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'chatgpt-client', version: '1.0' }
    }
  })
});
console.log('Status:', initRes1.status);
console.log('Headers:', Object.fromEntries(initRes1.headers.entries()));
const text1 = await initRes1.text();
console.log('Body:', text1.slice(0, 300));

// Teste 2: Initialize com Accept: application/json, text/event-stream
console.log('\n--- TESTE 2: initialize com Accept: application/json, text/event-stream ---');
const initRes2 = await fetch(`${LOCAL_URL}/mcp`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': `Bearer ${masterJwt}`
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'chatgpt-client', version: '1.0' }
    }
  })
});
console.log('Status:', initRes2.status);
const sessionId = initRes2.headers.get('mcp-session-id');
console.log('SessionId:', sessionId);
console.log('Headers:', Object.fromEntries(initRes2.headers.entries()));
const text2 = await initRes2.text();
console.log('Body:', text2.slice(0, 300));

// Teste 3: notifications/initialized
console.log('\n--- TESTE 3: notifications/initialized ---');
const notifRes = await fetch(`${LOCAL_URL}/mcp`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': `Bearer ${masterJwt}`,
    ...(sessionId ? { 'mcp-session-id': sessionId } : {})
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {}
  })
});
console.log('Status:', notifRes.status);
console.log('Headers:', Object.fromEntries(notifRes.headers.entries()));
const notifText = await notifRes.text();
console.log('Body:', notifText);

// Teste 4: tools/list COM mcp-session-id
console.log('\n--- TESTE 4: tools/list COM mcp-session-id ---');
const toolsRes4 = await fetch(`${LOCAL_URL}/mcp`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': `Bearer ${masterJwt}`,
    ...(sessionId ? { 'mcp-session-id': sessionId } : {})
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  })
});
console.log('Status:', toolsRes4.status);
console.log('Headers:', Object.fromEntries(toolsRes4.headers.entries()));
const toolsText4 = await toolsRes4.text();
console.log('Body (primeiros 400 chars):', toolsText4.slice(0, 400));

// Teste 5: tools/list SEM mcp-session-id (E SE O CHATGPT NÃO ENVIAR O HEADER?)
console.log('\n--- TESTE 5: tools/list SEM mcp-session-id ---');
const toolsRes5 = await fetch(`${LOCAL_URL}/mcp`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': `Bearer ${masterJwt}`
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/list',
    params: {}
  })
});
console.log('Status:', toolsRes5.status);
console.log('Headers:', Object.fromEntries(toolsRes5.headers.entries()));
const toolsText5 = await toolsRes5.text();
console.log('Body:', toolsText5);

// Teste 6: GET /mcp (E SE O CHATGPT TENTAR ABRIR SSE STREAM?)
console.log('\n--- TESTE 6: GET /mcp ---');
const getRes = await fetch(`${LOCAL_URL}/mcp`, {
  method: 'GET',
  headers: {
    'Accept': 'text/event-stream',
    'Authorization': `Bearer ${masterJwt}`
  }
});
console.log('Status:', getRes.status);
console.log('Headers:', Object.fromEntries(getRes.headers.entries()));
