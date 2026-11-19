// ==============================================================================
// SUÍTE DE TESTES UNITÁRIOS - DROPDOWNS DE CARGOS UNIFICADOS (BANCO DE TALENTOS & IA)
// PROJETO: Trabalhe Conosco — Gigante Pneus Multi-Lojas
// ==============================================================================

import assert from 'assert';
import {
  getUniqueCargos,
  filterCandidatosAdmin,
  normalizeFilterText
} from '../services/adminFilterService.ts';

console.log('==============================================================================');
console.log('TESTES DOS DROPDOWNS DE CARGOS UNIFICADOS - BANCO DE TALENTOS E IA');
console.log('==============================================================================\n');

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    failCount++;
  }
}

// ------------------------------------------------------------------------------
// Fixture de Vagas cadastradas por loja (simulando múltiplas lojas com as mesmas vagas)
// ------------------------------------------------------------------------------
const mockCargosPorLoja = [
  // Loja 1: Jundiaí
  { id: 'vaga-mec-jundiai', titulo: 'Mecânico Automotivo', nome: 'Mecânico Automotivo', loja_id: 'loja-jundiai', requisitos: 'Experiência em suspensão e freios na loja Jundiaí' },
  { id: 'vaga-alin-jundiai', titulo: 'Alinhador Automotivo', nome: 'Alinhador Automotivo', loja_id: 'loja-jundiai', requisitos: 'Alinhamento 3D' },
  { id: 'vaga-vendas-jundiai', titulo: 'Consultor de Vendas', nome: 'Consultor de Vendas', loja_id: 'loja-jundiai', requisitos: 'Vendas de pneus e serviços automotivos' },
  
  // Loja 2: Campinas (com variações de caixa e espaços extras para testar normalização)
  { id: 'vaga-mec-campinas', titulo: '  Mecânico Automotivo  ', nome: 'Mecânico Automotivo', loja_id: 'loja-campinas', requisitos: 'Experiência em injeção e suspensão Campinas' },
  { id: 'vaga-alin-campinas', titulo: 'alinhador automotivo', nome: 'alinhador automotivo', loja_id: 'loja-campinas', requisitos: 'Alinhamento a laser e 3D' },
  { id: 'vaga-estoque-campinas', titulo: 'Estoquista', nome: 'Estoquista', loja_id: 'loja-campinas', requisitos: 'Controle de entrada e saída de pneus' },
  
  // Loja 3: Ribeirão Preto
  { id: 'vaga-vendas-ribeirao', titulo: 'CONSULTOR DE VENDAS', nome: 'CONSULTOR DE VENDAS', loja_id: 'loja-ribeirao', requisitos: 'Atendimento balcão' },
  { id: 'vaga-aux-ribeirao', titulo: 'Auxiliar de Pátio / Auxiliar de Mecânico', nome: 'Auxiliar de Pátio / Auxiliar de Mecânico', loja_id: 'loja-ribeirao', requisitos: 'Apoio na oficina' },
  
  // Loja 4: Sorocaba
  { id: 'vaga-recep-sorocaba', titulo: 'Recepcionista de Centro Automotivo', nome: 'Recepcionista de Centro Automotivo', loja_id: 'loja-sorocaba', requisitos: 'Recepção e abertura de OS' },
  { id: 'vaga-mec-sorocaba', titulo: 'Mecânico Automotivo', nome: 'Mecânico Automotivo', loja_id: 'loja-sorocaba', requisitos: 'Mecânica geral Sorocaba' },
  { id: 'vaga-aux-sorocaba', titulo: 'auxiliar de pátio / auxiliar de mecânico', nome: 'auxiliar de pátio / auxiliar de mecânico', loja_id: 'loja-sorocaba', requisitos: 'Apoio' },
];

// ------------------------------------------------------------------------------
// Fixture de Candidatos associados a diferentes vagas e lojas
// ------------------------------------------------------------------------------
const mockCandidatos = [
  {
    id: 'cand-001',
    nome: 'Carlos Mecânico',
    cargo_id: 'vaga-mec-jundiai',
    vaga_interesse: 'Mecânico Automotivo',
    loja_id: 'loja-jundiai',
    status: 'Recebido',
    cidade: 'Jundiaí - SP'
  },
  {
    id: 'cand-002',
    nome: 'Marcos Mecânico',
    cargo_id: 'vaga-mec-campinas',
    vaga_interesse: 'Mecânico Automotivo',
    loja_id: 'loja-campinas',
    status: 'Em Triagem',
    cidade: 'Campinas - SP'
  },
  {
    id: 'cand-003',
    nome: 'Julio Mecânico Sorocaba',
    cargo_id: 'vaga-mec-sorocaba',
    vaga_interesse: 'Mecânico Automotivo',
    loja_id: 'loja-sorocaba',
    status: 'Aprovado',
    cidade: 'Sorocaba - SP'
  },
  {
    id: 'cand-004',
    nome: 'Ana Vendas Jundiaí',
    cargo_id: 'vaga-vendas-jundiai',
    vaga_interesse: 'Consultor de Vendas',
    loja_id: 'loja-jundiai',
    status: 'Recebido',
    cidade: 'Jundiaí - SP'
  },
  {
    id: 'cand-005',
    nome: 'Beatriz Vendas Ribeirão',
    cargo_id: 'vaga-vendas-ribeirao',
    vaga_interesse: 'Consultor de Vendas',
    loja_id: 'loja-ribeirao',
    status: 'Recebido',
    cidade: 'Ribeirão Preto - SP'
  },
  {
    id: 'cand-006',
    nome: 'Lucas Espontâneo Geral',
    cargo_id: null,
    vaga_interesse: 'Candidatura Espontânea',
    loja_id: null,
    status: 'Banco de Talentos',
    cidade: 'Santos - SP'
  },
  {
    id: 'cand-007',
    nome: 'Diego Alinhador',
    cargo_id: 'vaga-alin-campinas',
    vaga_interesse: 'Alinhador Automotivo',
    loja_id: 'loja-campinas',
    status: 'Em Triagem',
    cidade: 'Sumaré - SP'
  }
];

// ------------------------------------------------------------------------------
// TESTE 1: Deduplicação e contagem exata de cargos únicos
// ------------------------------------------------------------------------------
runTest('1. Deduplicação: 11 vagas em 4 lojas geram exatamente 6 cargos únicos', () => {
  const uniques = getUniqueCargos(mockCargosPorLoja);
  assert.strictEqual(uniques.length, 6, `Esperava 6 cargos únicos, obteve ${uniques.length}`);
});

// ------------------------------------------------------------------------------
// TESTE 2: Ordenação alfabética rigorosa em português (pt-BR)
// ------------------------------------------------------------------------------
runTest('2. Ordenação Alfabética: títulos vêm ordenados de A a Z em pt-BR', () => {
  const uniques = getUniqueCargos(mockCargosPorLoja);
  const titulos = uniques.map(u => u.titulo);
  
  const titulosEsperados = [
    'Alinhador Automotivo',
    'Auxiliar de Pátio / Auxiliar de Mecânico',
    'Consultor de Vendas',
    'Estoquista',
    'Mecânico Automotivo',
    'Recepcionista de Centro Automotivo'
  ];

  assert.deepStrictEqual(titulos, titulosEsperados);
});

// ------------------------------------------------------------------------------
// TESTE 3: Normalização de espaços e maiúsculas/minúsculas
// ------------------------------------------------------------------------------
runTest('3. Normalização: agrupa variações com espaços extras e maiúsculas/minúsculas', () => {
  const uniques = getUniqueCargos(mockCargosPorLoja);
  
  const mecs = uniques.find(u => u.normalizedTitulo === normalizeFilterText('Mecânico Automotivo'));
  assert.ok(mecs, 'Mecânico Automotivo deve existir no mapa');
  // Deve ter agrupado os 3 IDs das 3 lojas
  assert.strictEqual(mecs.vagaIds.length, 3);
  assert.ok(mecs.vagaIds.includes('vaga-mec-jundiai'));
  assert.ok(mecs.vagaIds.includes('vaga-mec-campinas'));
  assert.ok(mecs.vagaIds.includes('vaga-mec-sorocaba'));

  const alin = uniques.find(u => u.normalizedTitulo === normalizeFilterText('Alinhador Automotivo'));
  assert.ok(alin);
  assert.strictEqual(alin.vagaIds.length, 2);
  assert.ok(alin.vagaIds.includes('vaga-alin-jundiai'));
  assert.ok(alin.vagaIds.includes('vaga-alin-campinas'));
});

// ------------------------------------------------------------------------------
// TESTE 4: Banco de Talentos - Filtragem por Cargo Unificado (todas as unidades)
// ------------------------------------------------------------------------------
runTest('4. Banco de Talentos: selecionar "Mecânico Automotivo" retorna os 3 candidatos de todas as lojas', () => {
  const result = filterCandidatosAdmin(mockCandidatos, {
    cargoId: 'Mecânico Automotivo',
    cargosList: mockCargosPorLoja
  });

  assert.strictEqual(result.length, 3);
  const nomes = result.map(r => r.nome).sort();
  assert.deepStrictEqual(nomes, ['Carlos Mecânico', 'Julio Mecânico Sorocaba', 'Marcos Mecânico']);
});

// ------------------------------------------------------------------------------
// TESTE 5: Banco de Talentos - Combinação Unidade + Cargo
// ------------------------------------------------------------------------------
runTest('5. Banco de Talentos: combinar Unidade "Campinas" + Cargo "Mecânico Automotivo" retorna apenas Marcos', () => {
  const result = filterCandidatosAdmin(mockCandidatos, {
    lojaId: 'loja-campinas',
    cargoId: 'Mecânico Automotivo',
    cargosList: mockCargosPorLoja
  });

  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].nome, 'Marcos Mecânico');
  assert.strictEqual(result[0].loja_id, 'loja-campinas');
});

// ------------------------------------------------------------------------------
// TESTE 6: Banco de Talentos - Candidatura Espontânea
// ------------------------------------------------------------------------------
runTest('6. Banco de Talentos: selecionar "espontanea" retorna candidaturas espontâneas', () => {
  const result = filterCandidatosAdmin(mockCandidatos, {
    cargoId: 'espontanea',
    cargosList: mockCargosPorLoja
  });

  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].nome, 'Lucas Espontâneo Geral');
});

// ------------------------------------------------------------------------------
// TESTE 7: Análise de IA - Matching de Talentos por Cargo (todas as lojas)
// ------------------------------------------------------------------------------
runTest('7. Análise de IA: selecionar cargo unificado encontra todos os candidatos correspondentes', () => {
  const selectedAiCargo = 'Consultor de Vendas';
  const selectedAiLojaId = ''; // Todas as unidades

  const normalizedSelected = normalizeFilterText(selectedAiCargo);
  const matchingVagaIds = new Set(
    mockCargosPorLoja
      .filter(c => normalizeFilterText(c.titulo || c.nome) === normalizedSelected)
      .map(c => c.id)
  );

  const matched = mockCandidatos.filter(cand => {
    const candTitleNorm = normalizeFilterText(cand.vaga_interesse);
    const matchCargo =
      candTitleNorm === normalizedSelected ||
      Boolean(cand.cargo_id && matchingVagaIds.has(cand.cargo_id));
    if (!matchCargo) return false;
    if (selectedAiLojaId && selectedAiLojaId.trim() !== '') {
      if (cand.loja_id !== selectedAiLojaId) return false;
    }
    return true;
  });

  assert.strictEqual(matched.length, 2);
  const nomes = matched.map(c => c.nome).sort();
  assert.deepStrictEqual(nomes, ['Ana Vendas Jundiaí', 'Beatriz Vendas Ribeirão']);
});

// ------------------------------------------------------------------------------
// TESTE 8: Análise de IA - Combinação de Cargo + Unidade
// ------------------------------------------------------------------------------
runTest('8. Análise de IA: selecionar cargo "Consultor de Vendas" + Unidade "Jundiaí" filtra apenas Ana', () => {
  const selectedAiCargo = 'Consultor de Vendas';
  const selectedAiLojaId = 'loja-jundiai';

  const normalizedSelected = normalizeFilterText(selectedAiCargo);
  const matchingVagaIds = new Set(
    mockCargosPorLoja
      .filter(c => normalizeFilterText(c.titulo || c.nome) === normalizedSelected)
      .map(c => c.id)
  );

  const matched = mockCandidatos.filter(cand => {
    const candTitleNorm = normalizeFilterText(cand.vaga_interesse);
    const matchCargo =
      candTitleNorm === normalizedSelected ||
      Boolean(cand.cargo_id && matchingVagaIds.has(cand.cargo_id));
    if (!matchCargo) return false;
    if (selectedAiLojaId && selectedAiLojaId.trim() !== '') {
      if (cand.loja_id !== selectedAiLojaId) return false;
    }
    return true;
  });

  assert.strictEqual(matched.length, 1);
  assert.strictEqual(matched[0].nome, 'Ana Vendas Jundiaí');
});

// ------------------------------------------------------------------------------
// TESTE 9: Resolução de Contexto da IA (handleAnalyzeTalent)
// ------------------------------------------------------------------------------
runTest('9. IA Context Resolution: preserva vaga específica do candidato para requisitos precisos', () => {
  const candidate = mockCandidatos.find(c => c.nome === 'Marcos Mecânico');
  const selectedAiCargo = 'Mecânico Automotivo';

  // Lógica de resolução implementada no handleAnalyzeTalent
  const cargoContext =
    (candidate.cargo_id && mockCargosPorLoja.find(c => c.id === candidate.cargo_id)) ||
    mockCargosPorLoja.find(c => normalizeFilterText(c.titulo || c.nome) === normalizeFilterText(selectedAiCargo || candidate.vaga_interesse));

  assert.ok(cargoContext);
  assert.strictEqual(cargoContext.id, 'vaga-mec-campinas');
  assert.ok(cargoContext.requisitos.includes('Campinas'));
});

// ------------------------------------------------------------------------------
// TESTE 10: Robustez com array vazio, nulo ou nomes sem título
// ------------------------------------------------------------------------------
runTest('10. Robustez: lida graciosamente com arrays vazios, campos nulos ou sem título', () => {
  const vazio = getUniqueCargos([]);
  assert.deepStrictEqual(vazio, []);

  const itensInvalidos = [
    { id: '1', titulo: null, nome: 'Cargo Nome Fallback' },
    { id: '2', titulo: '', nome: '' },
    { id: '3' }
  ];
  const resultado = getUniqueCargos(itensInvalidos);
  assert.strictEqual(resultado.length, 1);
  assert.strictEqual(resultado[0].titulo, 'Cargo Nome Fallback');
});

console.log('\n==============================================================================');
console.log(`RESULTADO FINAL DOS TESTES: ${passCount} PASSOU | ${failCount} FALHOU`);
console.log('==============================================================================');

if (failCount > 0) {
  process.exit(1);
}
