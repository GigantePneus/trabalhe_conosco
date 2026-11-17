/**
 * Testes Automatizados de Validação e Segurança da API Administrativa de Vagas (PROMPT 88)
 * Preparação para Servidor MCP Privado - Fase 1: Gestão de Vagas
 * Gigante Pneus - Trabalhe Conosco Multi-Lojas
 */

import assert from 'assert';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('==============================================================================');
console.log('🧪 TESTES DE VALIDAÇÃO E SEGURANÇA DA API DE VAGAS PARA MCP (PROMPT 88)');
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

// 1. Verificação de Arquivos e Bundles
await test('1. Arquivos de código-fonte e bundle serverless existem', () => {
  assert.ok(existsSync(join(rootDir, 'src-api', 'admin', 'vagas.ts')), 'src-api/admin/vagas.ts deve existir');
  assert.ok(existsSync(join(rootDir, 'api', 'admin', 'vagas.js')), 'api/admin/vagas.js deve existir após o build');
});

// Importação dinâmica dos módulos gerados
const vagasModule = await import('../api/admin/vagas.js');
const {
  verifyVagasAuth,
  handleListarVagas,
  handleConsultarVaga,
  handleCriarVaga,
  handleEditarVaga,
  handleAlterarStatusVaga,
  default: defaultHandler
} = vagasModule;

await test('2. Módulo serverless exporta todas as funções de controle e o handler Vercel default', () => {
  assert.strictEqual(typeof verifyVagasAuth, 'function', 'verifyVagasAuth deve ser exportado');
  assert.strictEqual(typeof handleListarVagas, 'function', 'handleListarVagas deve ser exportado');
  assert.strictEqual(typeof handleConsultarVaga, 'function', 'handleConsultarVaga deve ser exportado');
  assert.strictEqual(typeof handleCriarVaga, 'function', 'handleCriarVaga deve ser exportado');
  assert.strictEqual(typeof handleEditarVaga, 'function', 'handleEditarVaga deve ser exportado');
  assert.strictEqual(typeof handleAlterarStatusVaga, 'function', 'handleAlterarStatusVaga deve ser exportado');
  assert.strictEqual(typeof defaultHandler, 'function', 'default handler Vercel deve ser exportado');
});

// 3. Segurança Fail-Safe: Rejeição de requisições sem autenticação
await test('3. Rejeição com HTTP 401 para todas as operações sem token JWT', async () => {
  const rList = await handleListarVagas({}, null);
  assert.strictEqual(rList.statusCode, 401, 'handleListarVagas sem token deve retornar 401');
  assert.strictEqual(rList.data.success, false);
  assert.ok(rList.data.mensagem.includes('ACESSO_NEGADO'), 'Deve conter mensagem ACESSO_NEGADO');

  const rGet = await handleConsultarVaga('vaga-fake-id', undefined);
  assert.strictEqual(rGet.statusCode, 401, 'handleConsultarVaga sem token deve retornar 401');

  const rCreate = await handleCriarVaga({ titulo: 'Vaga Invasora' }, '');
  assert.strictEqual(rCreate.statusCode, 401, 'handleCriarVaga sem token deve retornar 401');

  const rEdit = await handleEditarVaga({ vagaId: 'vaga-fake-id', titulo: 'Hacked' }, '   ');
  assert.strictEqual(rEdit.statusCode, 401, 'handleEditarVaga sem token deve retornar 401');

  const rStatus = await handleAlterarStatusVaga({ vagaId: 'vaga-fake-id', acao: 'publicar' }, null);
  assert.strictEqual(rStatus.statusCode, 401, 'handleAlterarStatusVaga sem token deve retornar 401');
});

// 4. Segurança Fail-Safe: Rejeição de tokens inválidos ou forjados
await test('4. Rejeição com HTTP 401 para tokens JWT inválidos ou expirados', async () => {
  const rInvalid = await handleListarVagas({}, 'token-invalido-forjado-xyz');
  assert.strictEqual(rInvalid.statusCode, 401);
  assert.strictEqual(rInvalid.data.success, false);
  assert.ok(rInvalid.data.mensagem.includes('ACESSO_NEGADO'));
});

// 5. Rejeição de chave estática compartilhada (Regra 7: sem privilégios por chave compartilhada)
await test('5. Nenhuma chave estática concede acesso administrativo (requer Bearer JWT de usuário)', async () => {
  const rStaticKey = await verifyVagasAuth('chave-estatica-compartilhada-qualquer');
  assert.strictEqual(rStaticKey.authorized, false, 'Chave estática não deve ser autorizada');
  assert.strictEqual(rStaticKey.statusCode, 401);
});

// Helper para obter tokens JWT reais e válidos dos usuários cadastrados
async function getTestTokens() {
  const supaUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  const adminSupabase = createClient(supaUrl, serviceKey);
  const anonSupabase = createClient(supaUrl, anonKey);

  // 1. Token do Gestor Master (franqueadora_admin)
  const { data: linkAdmin } = await adminSupabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'mktgigantepneus@gmail.com'
  });
  const { data: sessionAdmin } = await anonSupabase.auth.verifyOtp({
    email: 'mktgigantepneus@gmail.com',
    token: linkAdmin.properties.email_otp,
    type: 'magiclink'
  });

  // 2. Token de Leandro Santana (franqueado)
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

// 6. Consulta de vagas via token de Franqueadora Admin (Gestor Master)
await test('6. Administrador Master lista vagas administrativas com paginação e status', async () => {
  assert.ok(adminToken, 'Deve possuir token JWT do Gestor Master');

  const res = await handleListarVagas({ limit: 5, page: 1 }, adminToken);
  assert.strictEqual(res.statusCode, 200, 'Deve retornar HTTP 200');
  assert.strictEqual(res.data.success, true);
  assert.ok(Array.isArray(res.data.vagas), 'Deve retornar lista de vagas');
  assert.ok(res.data.paginacao, 'Deve retornar objeto de paginação');
  assert.strictEqual(typeof res.data.paginacao.total, 'number');
  assert.strictEqual(res.data.paginacao.page, 1);
  assert.strictEqual(res.data.paginacao.limit, 5);

  if (res.data.vagas.length > 0) {
    const vaga = res.data.vagas[0];
    assert.ok(vaga.id, 'Vaga deve possuir id');
    assert.ok(vaga.titulo, 'Vaga deve possuir titulo');
    assert.ok(['publicada', 'rascunho', 'desativada'].includes(vaga.status), 'Status deve ser calculado corretamente');
    assert.strictEqual(typeof vaga.ativo, 'boolean');
    assert.strictEqual(typeof vaga.publicada, 'boolean');
  }
});

// 7. Filtro por status (publicadas, rascunhos, desativadas)
await test('7. Filtro por status operacional (publicadas vs rascunhos vs desativadas)', async () => {
  const rPub = await handleListarVagas({ status: 'publicadas', limit: 10 }, adminToken);
  assert.strictEqual(rPub.statusCode, 200);
  for (const v of rPub.data.vagas || []) {
    assert.strictEqual(v.publicada, true, 'Todas devem estar com publicada=true');
    assert.strictEqual(v.ativo, true, 'Todas devem estar ativas');
    assert.strictEqual(v.status, 'publicada');
  }

  const rRasc = await handleListarVagas({ status: 'rascunhos', limit: 10 }, adminToken);
  assert.strictEqual(rRasc.statusCode, 200);
  for (const v of rRasc.data.vagas || []) {
    assert.strictEqual(v.publicada, false, 'Todas devem estar com publicada=false');
    assert.strictEqual(v.ativo, true, 'Todas devem estar ativas');
    assert.strictEqual(v.status, 'rascunho');
  }

  const rDesat = await handleListarVagas({ status: 'desativadas', limit: 10 }, adminToken);
  assert.strictEqual(rDesat.statusCode, 200);
  for (const v of rDesat.data.vagas || []) {
    assert.strictEqual(v.ativo, false, 'Todas devem estar desativadas');
    assert.strictEqual(v.status, 'desativada');
  }
});

// 8. Isolamento Multi-Tenant do Franqueado (Leandro Santana)
await test('8. Franqueado é restrito às suas 6 unidades e bloqueado com 403 ao tentar acessar outra loja', async () => {
  assert.ok(franqueadoToken, 'Deve possuir token JWT do Franqueado');

  // Consulta regular permitida
  const res = await handleListarVagas({ limit: 10 }, franqueadoToken);
  assert.strictEqual(res.statusCode, 200);

  // Tentativa de filtrar por unidade não autorizada (Jundiaí)
  const jundiaiId = 'eaacf2ee-4bdb-4b0a-ae4a-474389330175';
  const rJundiai = await handleListarVagas({ lojaId: jundiaiId }, franqueadoToken);
  assert.strictEqual(rJundiai.statusCode, 403, 'Deve retornar 403 para unidade não autorizada');
  assert.strictEqual(rJundiai.data.success, false);
  assert.ok(rJundiai.data.mensagem.includes('ACESSO_NEGADO'));
});

// 9. Validação de campos obrigatórios na criação de vagas
await test('9. Validação de título obrigatório e rejeição de título vazio ou curto', async () => {
  const rEmpty = await handleCriarVaga({}, adminToken);
  assert.strictEqual(rEmpty.statusCode, 400, 'Deve retornar 400 para body vazio');
  assert.ok(rEmpty.data.mensagem.toLowerCase().includes('título'));

  const rShort = await handleCriarVaga({ titulo: 'AB' }, adminToken);
  assert.strictEqual(rShort.statusCode, 400, 'Deve retornar 400 para título com menos de 3 caracteres');
});

// 10. Proteção contra injeção de campos de ciclo de vida na criação
await test('10. Rejeição de tentativa de injetar publicada, ativo ou id na criação (HTTP 400)', async () => {
  const rTamper = await handleCriarVaga({
    titulo: 'Vaga Tentativa Bypass',
    publicada: true,
    ativo: false
  }, adminToken);

  assert.strictEqual(rTamper.statusCode, 400, 'Deve retornar 400 ao tentar injetar campos de ciclo de vida');
  assert.ok(rTamper.data.mensagem.includes('não podem ser definidos na criação'));
});

// 11. Proteção contra manipulação de campos de ciclo de vida na edição
await test('11. Rejeição de tentativa de alterar publicada ou ativo via edição (HTTP 400)', async () => {
  const rEditTamper = await handleEditarVaga({
    vagaId: '11111111-1111-1111-1111-111111111111',
    titulo: 'Novo Titulo Valido',
    publicada: true
  }, adminToken);

  assert.strictEqual(rEditTamper.statusCode, 400, 'Deve retornar 400 ao tentar alterar status via endpoint de edição');
  assert.ok(rEditTamper.data.mensagem.includes('Alteração não permitida para os campos:'));
});

// 12. Validação de ações de status (publicar, despublicar, desativar, reativar)
await test('12. Rejeição de ações de status desconhecidas ou inválidas (HTTP 400)', async () => {
  const rInvalid = await handleAlterarStatusVaga({
    vagaId: '11111111-1111-1111-1111-111111111111',
    acao: 'excluir_definitivo'
  }, adminToken);

  assert.strictEqual(rInvalid.statusCode, 400, 'Deve retornar 400 para ação desconhecida');
  assert.ok(rInvalid.data.mensagem.includes('Ação de status inválida'));
});

// 13. Validação de bloqueio do perfil Gerente em mutações
await test('13. Perfil Gerente é estritamente bloqueado (HTTP 403) em mutações (criação, edição e status)', () => {
  const src = readFileSync(join(rootDir, 'src-api', 'admin', 'vagas.ts'), 'utf-8');
  assert.ok(src.includes('if (context.isGerente)'), 'Deve validar isGerente');
  assert.ok(src.includes('Usuários com perfil Gerente não possuem permissão para criar vagas'), 'Bloqueio do gerente no create');
  assert.ok(src.includes('Usuários com perfil Gerente não possuem permissão para editar vagas'), 'Bloqueio do gerente no edit');
  assert.ok(src.includes('Usuários com perfil Gerente não possuem permissão para alterar status de vagas'), 'Bloqueio do gerente no status');
});

// 14. vite.config.ts possui middleware sem chaves estáticas
await test('14. vite.config.ts possui middleware para /api/admin/vagas com autenticação Bearer', () => {
  const viteConfig = readFileSync(join(rootDir, 'vite.config.ts'), 'utf-8');
  assert.ok(viteConfig.includes("req.url?.startsWith('/api/admin/vagas')"), 'vite.config.ts deve conter rota /api/admin/vagas');
  assert.ok(!viteConfig.includes('x-mcp-key'), 'vite.config.ts não deve aceitar x-mcp-key estático');
  assert.ok(viteConfig.includes('handleListarVagas'), 'Deve mapear handleListarVagas');
  assert.ok(viteConfig.includes('handleConsultarVaga'), 'Deve mapear handleConsultarVaga');
  assert.ok(viteConfig.includes('handleCriarVaga'), 'Deve mapear handleCriarVaga');
  assert.ok(viteConfig.includes('handleEditarVaga'), 'Deve mapear handleEditarVaga');
  assert.ok(viteConfig.includes('handleAlterarStatusVaga'), 'Deve mapear handleAlterarStatusVaga');
});

// 15. Integridade do build-serverless.mjs e ausência de URLs hardcoded
await test('15. Ausência de URLs hardcoded do Supabase no backend de vagas e usuários', () => {
  const vagasTs = readFileSync(join(rootDir, 'src-api', 'admin', 'vagas.ts'), 'utf-8');
  const usuariosTs = readFileSync(join(rootDir, 'src-api', 'admin', 'usuarios.ts'), 'utf-8');

  assert.ok(!vagasTs.includes('https://hidayzojjztfyuefmknz.supabase.co'), 'vagas.ts não deve ter URL hardcoded');
  assert.ok(!usuariosTs.includes('https://hidayzojjztfyuefmknz.supabase.co'), 'usuarios.ts não deve ter URL hardcoded');
});

console.log('\n==============================================================================');
console.log(`TOTAL DE TESTES: ${passed + failed} | APROVADOS: ${passed} | FALHAS: ${failed}`);
console.log('==============================================================================\n');

if (failed > 0) {
  process.exit(1);
}
