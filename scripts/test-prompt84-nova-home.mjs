/**
 * Testes automatizados da Nova Experiência da Página Inicial (PROMPT 84)
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
console.log('🧪 TESTES DE VALIDAÇÃO DA NOVA EXPERIÊNCIA DA PÁGINA INICIAL (PROMPT 84)');
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

const publicJobsBoardCode = readFileSync(join(rootDir, 'components', 'PublicJobsBoard.tsx'), 'utf-8');

// Teste 1: Preservação da identidade visual e banner oficial
test('1. Preserva o banner oficial da LP e a identidade visual da Gigante Pneus', () => {
  assert.ok(publicJobsBoardCode.includes('banner LP - Gigante Pneus.png'), 'Deve manter o banner oficial LP');
  assert.ok(publicJobsBoardCode.includes('Carreiras Gigante Pneus'), 'Deve manter a marcação institucional');
  assert.ok(publicJobsBoardCode.includes('Vagas Abertas'), 'Deve manter o título principal');
  assert.ok(publicJobsBoardCode.includes('#ffcc00'), 'Deve manter as cores institucionais amarela');
  assert.ok(publicJobsBoardCode.includes('#072a5a'), 'Deve manter as cores institucionais azul marinho');
});

// Teste 2: Nova Seção de Busca com título e texto de apoio exatos
test('2. Nova Seção de Busca com título "Onde você gostaria de trabalhar?" e texto de apoio', () => {
  assert.ok(publicJobsBoardCode.includes('Onde você gostaria de trabalhar?'), 'Deve conter o título exato exigido no prompt');
  assert.ok(
    publicJobsBoardCode.includes('Escolha a cidade ou unidade de sua preferência e descubra as oportunidades disponíveis.'),
    'Deve conter o texto de apoio exato exigido no prompt'
  );
});

// Teste 3: Seletores dinâmicos e encadeados (Cidade e Unidade)
test('3. Possui dois seletores encadeados: Seletor 1 (Cidade) e Seletor 2 (Unidade)', () => {
  assert.ok(publicJobsBoardCode.includes('id="select-cidade"'), 'Deve conter o seletor de cidades');
  assert.ok(publicJobsBoardCode.includes('id="select-loja"'), 'Deve conter o seletor de lojas/unidades');
  assert.ok(publicJobsBoardCode.includes('availableCidades'), 'Deve extrair lista dinâmica de cidades');
  assert.ok(publicJobsBoardCode.includes('availableLojasForCidade'), 'Deve encadear as unidades da cidade selecionada');
  assert.ok(publicJobsBoardCode.includes('disabled={selectedCidadeUf === \'todas\'}'), 'Seletor de loja deve estar desabilitado enquanto não selecionar cidade');
});

// Teste 4: Formatação de Cidade — UF e exclusão de lojas inativas
test('4. Cidades formatadas como "Cidade — UF" filtradas de lojas ativas (ativa = true)', () => {
  assert.ok(publicJobsBoardCode.includes('.eq(\'ativa\', true)'), 'Deve consultar somente lojas ativas no Supabase');
  assert.ok(publicJobsBoardCode.includes('${c} — ${u}'), 'Deve formatar a cidade como Cidade — UF');
  assert.ok(publicJobsBoardCode.includes('new Set<string>()'), 'Deve eliminar duplicidades de cidades');
});

// Teste 5: Agrupamento de Vagas por Cargo (Eliminação de repetição de cards)
test('5. Agrupa vagas equivalentes por cargo exibindo 1 único card por função', () => {
  assert.ok(publicJobsBoardCode.includes('groupedJobs = useMemo<GroupedCargo[]>'), 'Deve possuir lógica de agrupamento de vagas por cargo');
  assert.ok(publicJobsBoardCode.includes('cargoTitle.toLowerCase()'), 'Deve agrupar com chave de título normalizada');
  assert.ok(publicJobsBoardCode.includes('totalUnidades > 1'), 'Deve distinguir cargos em múltiplas unidades vs unidade única');
});

// Teste 6: Modal/Drawer de Unidades quando cargo está disponível em múltiplas lojas
test('6. Possui Modal/Drawer elegante para seleção de unidade quando disponível em múltiplas lojas', () => {
  assert.ok(publicJobsBoardCode.includes('setModalGroup(group)'), 'Ao clicar em cargo com múltiplas unidades, deve abrir o modal');
  assert.ok(publicJobsBoardCode.includes('modalGroup && ('), 'Deve renderizar a modal de seleção de unidades');
  assert.ok(publicJobsBoardCode.includes('id="modal-cargo-title"'), 'Modal deve ser acessível e exibir título do cargo');
  assert.ok(publicJobsBoardCode.includes('Candidatar-se nesta unidade'), 'Modal deve ter botão para candidatar-se na unidade específica');
  assert.ok(publicJobsBoardCode.includes('aria-modal="true"'), 'Modal deve ter atributos de acessibilidade');
});

// Teste 7: Vínculo Real com vaga_id e loja_id preservado
test('7. Preserva link direto para /vagas/${vaga.vagaId} garantindo integridade de vaga_id e loja_id', () => {
  assert.ok(publicJobsBoardCode.includes('to={`/vagas/${singleVaga.vagaId}`}'), 'Link direto do card único deve usar o vagaId real');
  assert.ok(publicJobsBoardCode.includes('to={`/vagas/${vaga.vagaId}`}'), 'Link dentro da modal deve usar o vagaId real');
});

// Teste 8: Candidatura Espontânea / Banco de Talentos
test('8. Candidatura Espontânea visível e fallback amigável quando cidade não tem vagas abertas', () => {
  assert.ok(publicJobsBoardCode.includes('to="/cadastro"'), 'Deve possuir links para /cadastro (Banco de Talentos)');
  assert.ok(publicJobsBoardCode.includes('Não encontrou uma vaga para o seu perfil?'), 'Seção de destaque permanente de Banco de Talentos');
  assert.ok(publicJobsBoardCode.includes('Nenhuma vaga aberta para'), 'Mensagem amigável quando a cidade selecionada não tem vagas abertas');
});

// Teste 9: Indicadores Precisos de Vagas no Header / Banner
test('9. Exibe indicadores precisos: total de vagas ativas, cargos distintos e unidades contratando', () => {
  assert.ok(publicJobsBoardCode.includes('totalVagasPublicadas'), 'Deve calcular total de vagas ativas');
  assert.ok(publicJobsBoardCode.includes('totalCargosDistintos'), 'Deve calcular total de cargos distintos');
  assert.ok(publicJobsBoardCode.includes('totalUnidadesContratando'), 'Deve calcular total de unidades com vagas');
});

// Teste 10: Responsividade e Layout
test('10. Suporte total a layout responsivo sem overflow horizontal', () => {
  assert.ok(publicJobsBoardCode.includes('grid grid-cols-1 md:grid-cols-2 gap-5'), 'Seletores responsivos');
  assert.ok(publicJobsBoardCode.includes('grid grid-cols-1 lg:grid-cols-2 gap-6'), 'Grid de cards responsivo');
  assert.ok(publicJobsBoardCode.includes('max-w-lg w-full max-h-[85vh]'), 'Modal com dimensões seguras e responsivas');
});

console.log('\n------------------------------------------------------------------------------');
console.log(`TOTAL DE TESTES: ${passed + failed} | PASSOU: ${passed} | FALHOU: ${failed}`);
console.log('------------------------------------------------------------------------------\n');

if (failed > 0) {
  process.exit(1);
}
