/**
 * Testes automatizados de responsividade do Banco de Talentos e Painel RH (PROMPT 83)
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
console.log('🧪 TESTES DE VALIDAÇÃO DE RESPONSIVIDADE DO BANCO DE TALENTOS (PROMPT 83)');
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

const adminDashboardCode = readFileSync(join(rootDir, 'components', 'AdminDashboard.tsx'), 'utf-8');

// Teste 1: Tabela Desktop com largura mínima e rolagem horizontal contida
test('1. Tabela Desktop possui min-w e container com rolagem horizontal interna (overflow-x-auto)', () => {
  assert.ok(adminDashboardCode.includes('overflow-x-auto custom-scrollbar'), 'Deve possuir container com rolagem horizontal');
  assert.ok(adminDashboardCode.includes('min-w-[960px]'), 'Tabela desktop deve possuir min-w-[960px] para não espremer colunas');
  assert.ok(adminDashboardCode.includes('hidden lg:block'), 'Tabela desktop deve ser exibida apenas em telas lg e superiores');
});

// Teste 2: Prevenção de quebra de palavra no nome do candidato
test('2. Nome do candidato na tabela desktop possui whitespace-nowrap', () => {
  assert.ok(
    adminDashboardCode.includes('font-black text-gray-900 dark:text-white uppercase whitespace-nowrap'),
    'Nome do candidato não pode quebrar palavra por palavra'
  );
});

// Teste 3: Visualização em Cartões para Mobile e Tablets (< lg)
test('3. Possui visualização alternativa em cartões responsivos para mobile e tablets (< lg)', () => {
  assert.ok(adminDashboardCode.includes('block lg:hidden space-y-3.5'), 'Deve possuir container block lg:hidden com cartões');
  assert.ok(adminDashboardCode.includes('Abrir Dossiê Profissional'), 'Cartão mobile deve conter botão para abrir dossiê');
});

// Teste 4: Grade de Filtros com Breakpoints Intermediários (Notebooks e Telas Menores)
test('4. Barra de filtros utiliza grid responsivo com 1 col (mobile), 2 (tablet), 3 (notebook) e 5 (desktop grande)', () => {
  assert.ok(
    adminDashboardCode.includes('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3'),
    'Grid de filtros deve ter breakpoints sm, lg e xl equilibrados'
  );
});

// Teste 5: Proporções adaptativas da Sidebar e Conteúdo Principal
test('5. Sidebar possui largura adaptativa (md:w-64 lg:w-72 shrink-0) e conteúdo com min-w-0', () => {
  assert.ok(adminDashboardCode.includes('md:w-64 lg:w-72'), 'Sidebar deve ter md:w-64 e lg:w-72');
  assert.ok(adminDashboardCode.includes('shrink-0'), 'Sidebar deve possuir shrink-0');
  assert.ok(adminDashboardCode.includes('min-w-0 w-full'), 'Conteúdo principal deve ter min-w-0 para respeitar overflow');
});

// Teste 6: Dossiê Digital (Modal) completamente responsivo
test('6. Modal do Dossiê Digital possui padding responsivo, break-words e rolagem vertical contida', () => {
  assert.ok(adminDashboardCode.includes('max-h-[94vh] overflow-hidden'), 'Modal deve limitar altura a 94vh');
  assert.ok(adminDashboardCode.includes('overflow-y-auto flex-grow space-y-6 sm:space-y-8 custom-scrollbar'), 'Corpo do modal deve ter rolagem vertical');
  assert.ok(adminDashboardCode.includes('break-words'), 'Campos de texto do dossiê devem ter break-words');
});

console.log('\n==============================================================================');
console.log(`RESULTADO DOS TESTES PROMPT 83: ${passed} PASSOU | ${failed} FALHOU`);
console.log('==============================================================================');

if (failed > 0) {
  process.exit(1);
}
