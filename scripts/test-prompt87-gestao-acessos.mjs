/**
 * Testes Automatizados de Validação e Diagnóstico: Gestão de Acessos (PROMPT 87)
 * Gigante Pneus - Trabalhe Conosco Multi-Lojas
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('==============================================================================');
console.log('🧪 TESTES DE VALIDAÇÃO DA GESTÃO DE ACESSOS E MULTI-TENANT (PROMPT 87)');
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

const adminDashboardCode = readFileSync(join(rootDir, 'components', 'AdminDashboard.tsx'), 'utf-8');
const usuariosApiCode = readFileSync(join(rootDir, 'src-api', 'admin', 'usuarios.ts'), 'utf-8');
const { handleListarUsuarios } = await import('../api/admin/usuarios.js');
const { createClient } = await import('@supabase/supabase-js');

const supaUrl = process.env.VITE_SUPABASE_URL || 'https://hidayzojjztfyuefmknz.supabase.co';
const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supaClient = createClient(supaUrl, supaKey);

// Teste 1: Carga automática ao entrar na aba 'acessos'
await test('1. AdminDashboard possui useEffect para carregar automaticamente ao acessar a aba acessos', () => {
  assert.ok(adminDashboardCode.includes('activeTab === \'acessos\' && isGestorMaster'), 'Deve monitorar activeTab acessos e isGestorMaster');
  assert.ok(adminDashboardCode.includes('carregarAdminUsuarios()'), 'Deve disparar carregarAdminUsuarios no useEffect');
});

// Teste 2: Estados distintos implementados no Frontend (Carregamento, Erro, Vazio e Populado)
await test('2. Frontend possui estados distintos para Carregamento, Erro, Lista Vazia e Lista Populada', () => {
  assert.ok(adminDashboardCode.includes('loadingAdminUsers'), 'Deve possuir estado de carregamento');
  assert.ok(adminDashboardCode.includes('adminUsersError'), 'Deve possuir estado de erro de consulta');
  assert.ok(adminDashboardCode.includes('Falha na Consulta de Usuários'), 'Deve exibir card de erro em caso de falha');
  assert.ok(adminDashboardCode.includes('Tentar novamente'), 'Deve oferecer botão para tentar novamente');
  assert.ok(adminDashboardCode.includes('Nenhum franqueado ou gerente cadastrado no momento'), 'Deve ter mensagem clara de lista vazia');
});

// Teste 3: Erro de API NÃO é mascarado como lista vazia
await test('3. Erros de rede ou API não são mascarados como lista vazia', () => {
  const hasErrorBranch = adminDashboardCode.includes('adminUsersError ?') && adminDashboardCode.includes('colSpan={5}');
  assert.ok(hasErrorBranch, 'A tabela deve possuir branch dedicado para renderizar o erro');
});

// Teste 4: Fallback resiliente via Supabase RLS caso a API serverless oscile
await test('4. Frontend possui fallback resiliente de consulta direta via Supabase RLS', () => {
  assert.ok(adminDashboardCode.includes('supabase.from(\'perfis\')'), 'Deve consultar perfis como fallback');
  assert.ok(adminDashboardCode.includes('supabase.from(\'usuario_lojas\')'), 'Deve consultar usuario_lojas como fallback');
});

// Teste 5: Consulta ao banco retorna Leandro Santana e suas 6 unidades
await test('5. Dados reais: Leandro Santana possui perfil ativo e exatamente 6 lojas autorizadas', async () => {
  const { data: perfil, error: pErr } = await supaClient
    .from('perfis')
    .select('id, nome, email, role, ativo')
    .eq('email', 'mktgigantepneus+leandro@gmail.com')
    .single();

  assert.ok(!pErr && perfil, 'Perfil de Leandro Santana deve existir no banco');
  assert.strictEqual(perfil.role, 'franqueado', 'Perfil de Leandro deve ser franqueado');
  assert.strictEqual(perfil.ativo, true, 'Perfil de Leandro deve estar ativo');

  const { data: ulData, error: ulErr } = await supaClient
    .from('usuario_lojas')
    .select('loja_id')
    .eq('user_id', perfil.id);

  assert.ok(!ulErr && ulData, 'Deve consultar vínculos de usuario_lojas');
  assert.strictEqual(ulData.length, 6, `Leandro deve possuir exatamente 6 lojas (encontrado: ${ulData.length})`);
});

// Teste 6: Rejeição estrita de acesso na API para tokens inexistentes ou inválidos (HTTP 403)
await test('6. API /api/admin/usuarios bloqueia requisições sem token (HTTP 403)', async () => {
  const result = await handleListarUsuarios(null);
  assert.strictEqual(result.statusCode, 403, 'Deve retornar 403 para token nulo');
  assert.strictEqual(result.data.success, false, 'Deve retornar success: false');
});

// Teste 7: Rejeição estrita de acesso na API para token inválido (HTTP 403)
await test('7. API /api/admin/usuarios bloqueia requisições com token inválido (HTTP 403)', async () => {
  const result = await handleListarUsuarios('token-falso-invalido');
  assert.strictEqual(result.statusCode, 403, 'Deve retornar 403 para token inválido');
  assert.strictEqual(result.data.success, false, 'Deve retornar success: false');
});

// Teste 8: Resiliência de variáveis de ambiente no backend
await test('8. Backend suporta SUPABASE_URL, SUPABASE_INTERNAL_URL e VITE_SUPABASE_URL', () => {
  assert.ok(usuariosApiCode.includes('process.env.SUPABASE_URL'), 'Deve checar process.env.SUPABASE_URL');
  assert.ok(usuariosApiCode.includes('process.env.SUPABASE_INTERNAL_URL'), 'Deve checar process.env.SUPABASE_INTERNAL_URL');
  assert.ok(usuariosApiCode.includes('process.env.VITE_SUPABASE_URL'), 'Deve checar process.env.VITE_SUPABASE_URL');
});

console.log('\n------------------------------------------------------------------------------');
console.log(`TOTAL DE TESTES: ${passed + failed} | PASSOU: ${passed} | FALHOU: ${failed}`);
console.log('------------------------------------------------------------------------------\n');

if (failed > 0) {
  process.exit(1);
}
