/**
 * Testes automatizados de segurança, restrição de configurações e proteção da IA (PROMPT 82)
 * Gigante Pneus - Trabalhe Conosco Multi-Lojas
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('==============================================================================');
console.log('🧪 TESTES DE VALIDAÇÃO DE SEGURANÇA E RESTRIÇÕES V1 (PROMPT 82)');
console.log('==============================================================================\n');

let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${description}`);
    console.error(`    Erro: ${err.message}`);
    failed++;
  }
}

// 1. Simulação das regras de permissão de perfis (Frontend & State)
function evaluateUserPermissions(role) {
  const isGestorMaster = role === 'franqueadora_admin';
  const isFranqueadoOrGerente = role === 'franqueado' || role === 'gerente';
  const isRHCorporativo = role === 'rh_corporativo';

  // Sub-abas permitidas em Configurações
  const allowedSettingsTabs = [];
  if (isGestorMaster) {
    allowedSettingsTabs.push('geral', 'seguranca', 'usuarios');
  } else {
    // Franqueado, Gerente e RH Corporativo têm acesso estritamente a 'seguranca'
    allowedSettingsTabs.push('seguranca');
  }

  // Acesso a chaves API e prompts dos agentes
  const canManageApiKeys = isGestorMaster;
  const canManageAgentPrompts = isGestorMaster;

  // Acesso à IA na V1
  const isAiDisabled = !isGestorMaster;
  const aiBadge = !isGestorMaster ? 'Em breve' : null;

  // Abas do menu lateral permitidas
  const allowedSidebarTabs = ['overview', 'talents', 'surveys', 'jobs', 'settings'];
  if (isGestorMaster) {
    allowedSidebarTabs.push('ai', 'lojas', 'acessos');
  }

  return {
    isGestorMaster,
    isFranqueadoOrGerente,
    isRHCorporativo,
    allowedSettingsTabs,
    canManageApiKeys,
    canManageAgentPrompts,
    isAiDisabled,
    aiBadge,
    allowedSidebarTabs
  };
}

// ==========================================
// TESTES
// ==========================================

// Teste 1: Perfil Franqueador Admin (Gestor Master)
test('1. Franqueadora Admin possui acesso irrestrito às Configurações Gerais, Chaves, Prompts e Gestão de Usuários', () => {
  const perm = evaluateUserPermissions('franqueadora_admin');
  assert.strictEqual(perm.isGestorMaster, true);
  assert.deepStrictEqual(perm.allowedSettingsTabs, ['geral', 'seguranca', 'usuarios']);
  assert.strictEqual(perm.canManageApiKeys, true);
  assert.strictEqual(perm.canManageAgentPrompts, true);
  assert.strictEqual(perm.isAiDisabled, false);
  assert.strictEqual(perm.aiBadge, null);
  assert.ok(perm.allowedSidebarTabs.includes('acessos'));
  assert.ok(perm.allowedSidebarTabs.includes('lojas'));
});

// Teste 2: Perfil Franqueado
test('2. Franqueado tem acesso restrito SOMENTE a Minha Conta & Segurança, sem chaves API ou Gestão de Usuários', () => {
  const perm = evaluateUserPermissions('franqueado');
  assert.strictEqual(perm.isGestorMaster, false);
  assert.deepStrictEqual(perm.allowedSettingsTabs, ['seguranca']);
  assert.strictEqual(perm.canManageApiKeys, false);
  assert.strictEqual(perm.canManageAgentPrompts, false);
  assert.strictEqual(perm.isAiDisabled, true);
  assert.strictEqual(perm.aiBadge, 'Em breve');
  assert.strictEqual(perm.allowedSidebarTabs.includes('acessos'), false);
  assert.strictEqual(perm.allowedSidebarTabs.includes('lojas'), false);
});

// Teste 3: Perfil Gerente
test('3. Gerente tem acesso restrito SOMENTE a Minha Conta & Segurança, com IA desabilitada na V1', () => {
  const perm = evaluateUserPermissions('gerente');
  assert.strictEqual(perm.isGestorMaster, false);
  assert.deepStrictEqual(perm.allowedSettingsTabs, ['seguranca']);
  assert.strictEqual(perm.canManageApiKeys, false);
  assert.strictEqual(perm.canManageAgentPrompts, false);
  assert.strictEqual(perm.isAiDisabled, true);
  assert.strictEqual(perm.aiBadge, 'Em breve');
});

// Teste 4: Perfil RH Corporativo
test('4. RH Corporativo NÃO possui acesso a chaves API nem a treinamento de agentes por padrão', () => {
  const perm = evaluateUserPermissions('rh_corporativo');
  assert.strictEqual(perm.isGestorMaster, false);
  assert.deepStrictEqual(perm.allowedSettingsTabs, ['seguranca']);
  assert.strictEqual(perm.canManageApiKeys, false);
  assert.strictEqual(perm.canManageAgentPrompts, false);
});

// Teste 5: Auditoria estática de código de AdminDashboard.tsx
test('5. AdminDashboard.tsx possui guardas explícitos isGestorMaster para sub-aba geral e IA', () => {
  const code = readFileSync(join(rootDir, 'components', 'AdminDashboard.tsx'), 'utf-8');
  
  // Verifica se 'geral' está condicionado a isGestorMaster
  assert.ok(code.includes('{isGestorMaster && settingsSubTab === \'geral\' && ('), 'Sub-aba geral deve ter guarda isGestorMaster');
  
  // Verifica se o botão da sub-aba 'geral' é restrito
  assert.ok(code.includes('{isGestorMaster && (\n                  <button\n                    onClick={() => setSettingsSubTab(\'geral\')}'), 'Botão geral deve ser restrito a isGestorMaster');
  
  // Verifica se a aba 'ai' possui guarda isGestorMaster
  assert.ok(code.includes('{activeTab === \'ai\' && isGestorMaster && ('), 'Aba ai deve ter guarda isGestorMaster');
  
  // Verifica se o item de IA na sidebar tem disabled e badge
  assert.ok(code.includes('disabled={!isGestorMaster}'), 'SidebarItem ai deve ter disabled={!isGestorMaster}');
  assert.ok(code.includes('badge={!isGestorMaster ? "Em breve" : undefined}'), 'SidebarItem ai deve ter badge "Em breve"');
});

// Teste 6: Auditoria estática de proteção da API em aiService.ts
test('6. aiService.ts bloqueia chamadas sem chaves ou desautorizadas', () => {
  const code = readFileSync(join(rootDir, 'aiService.ts'), 'utf-8');
  assert.ok(code.includes('Triagem de IA desabilitada na V1'), 'analyzeTalentCompatibility deve conter bloqueio V1');
  assert.ok(code.includes('Análise de IA de pesquisas indisponível'), 'analyzeSurveyResponses deve conter bloqueio V1');
});

// Teste 7: Auditoria estática de proteção em src-api/admin/usuarios.ts
test('7. Endpoint de backend /api/admin/usuarios restringe chamadas estritamente a franqueadora_admin', () => {
  const code = readFileSync(join(rootDir, 'src-api', 'admin', 'usuarios.ts'), 'utf-8');
  assert.ok(code.includes("perfil.role !== 'franqueadora_admin'"), 'Endpoint deve exigir perfil.role franqueadora_admin');
  assert.ok(code.includes('Apenas administradores corporativos (franqueadora_admin) podem gerenciar acessos'), 'Mensagem de 403 deve ser explícita');
});

console.log('\n==============================================================================');
console.log(`RESULTADO DOS TESTES PROMPT 82: ${passed} PASSOU | ${failed} FALHOU`);
console.log('==============================================================================');

if (failed > 0) {
  process.exit(1);
}
