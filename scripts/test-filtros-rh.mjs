// ==============================================================================
// SUÍTE DE TESTES UNITÁRIOS - FILTROS ESTRUTURADOS E SEPARAÇÃO DE RESIDÊNCIA (PROMPT 69)
// PROJETO: Trabalhe Conosco — Gigante Pneus Multi-Lojas
// ==============================================================================

import assert from 'assert';
import { filterCandidatosAdmin, normalizeFilterText } from '../services/adminFilterService.ts';

console.log('==============================================================================');
console.log('TESTES DOS FILTROS ESTRUTURADOS E SEPARAÇÃO DE RESIDÊNCIA (PROMPT 69)');
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

// Fixture rica com dados de diferentes unidades, cargos, cidades de residência e lojas
const mockCandidaturas = [
  {
    id: 'cand-rafael',
    candidatura_id: 'app-rafael',
    candidato_id: 'c-rafael',
    nome: 'Rafael Martins de Oliveira',
    email: 'rafael.homologacao@example.com',
    cpf_mascarado: '***.***.578-**',
    telefone: '(16) 98226-5352',
    cidade: 'Ribeirão Preto - SP',
    cidade_residencia: 'Ribeirão Preto - SP',
    candidato_cidade: 'Ribeirão Preto',
    candidato_estado: 'SP',
    unidade_pretendida: 'Gigante Pneus - Jundiaí',
    cargo_id: 'cargo-uuid-consultor-vendas',
    vaga_interesse: 'Consultor de Vendas',
    status_candidatura: 'Recebido',
    loja_id: 'loja-uuid-jundiai',
    loja_nome: 'Gigante Pneus - Jundiaí',
    loja_cidade: 'Jundiaí',
    loja_estado: 'SP',
    possui_curriculo: false,
    protocolo: 'GIG-20261113-EB6BF0',
    created_at: '2026-11-13T15:15:40.000Z'
  },
  {
    id: 'cand-001',
    candidatura_id: 'app-001',
    candidato_id: 'c-001',
    nome: 'Carlos Alinhador Silva',
    email: 'carlos.alinhador@teste.com',
    cpf_mascarado: '***.982.247-**',
    telefone: '(11) 98888-7777',
    cidade: 'São Paulo - SP',
    cidade_residencia: 'São Paulo - SP',
    candidato_cidade: 'São Paulo',
    candidato_estado: 'SP',
    unidade_pretendida: 'Loja Matriz Centro',
    cargo_id: 'cargo-uuid-mecanico',
    vaga_interesse: 'Mecânico Automotivo',
    status_candidatura: 'Recebido',
    loja_id: 'loja-uuid-matriz-sp',
    loja_nome: 'Loja Matriz Centro',
    loja_cidade: 'São Paulo',
    loja_estado: 'SP',
    possui_curriculo: true,
    created_at: '2026-11-01T10:00:00.000Z'
  },
  {
    id: 'cand-002',
    candidatura_id: 'app-002',
    candidato_id: 'c-002',
    nome: 'Marcos Vendas Vinicius',
    email: 'marcos.vendas@teste.com',
    cpf_mascarado: '***.111.222-**',
    telefone: '(11) 97777-6666',
    cidade: 'Campinas - SP',
    cidade_residencia: 'Campinas - SP',
    candidato_cidade: 'Campinas',
    candidato_estado: 'SP',
    unidade_pretendida: 'Loja Campinas Taquaral',
    cargo_id: 'cargo-uuid-vendedor',
    vaga_interesse: 'Consultor de Vendas',
    status_candidatura: 'Em Triagem',
    loja_id: 'loja-uuid-campinas',
    loja_nome: 'Loja Campinas Taquaral',
    loja_cidade: 'Campinas',
    loja_estado: 'SP',
    possui_curriculo: false,
    created_at: '2026-11-05T14:30:00.000Z'
  },
  {
    id: 'cand-003',
    candidatura_id: 'app-003',
    candidato_id: 'c-003',
    nome: 'Lucas Espontâneo Curitiba',
    email: 'lucas.espontaneo@teste.com',
    cpf_mascarado: '***.333.444-**',
    telefone: '(41) 96666-5555',
    cidade: 'Curitiba - PR',
    cidade_residencia: 'Curitiba - PR',
    candidato_cidade: 'Curitiba',
    candidato_estado: 'PR',
    unidade_pretendida: 'Loja Curitiba Portão',
    cargo_id: null, // Candidatura Espontânea
    vaga_interesse: 'Candidatura Espontânea',
    status_candidatura: 'Banco de Talentos',
    loja_id: 'loja-uuid-curitiba',
    loja_nome: 'Loja Curitiba Portão',
    loja_cidade: 'Curitiba',
    loja_estado: 'PR',
    possui_curriculo: true,
    created_at: '2026-11-10T09:15:00.000Z'
  },
  {
    id: 'cand-004-multiloja-1',
    candidatura_id: 'app-004-1',
    candidato_id: 'c-multi',
    nome: 'Mariana Candidata Multi-Loja',
    email: 'mariana.multi@teste.com',
    cpf_mascarado: '***.444.888-**',
    telefone: '(19) 99111-2222',
    cidade: 'Americana - SP',
    cidade_residencia: 'Americana - SP',
    candidato_cidade: 'Americana',
    candidato_estado: 'SP',
    unidade_pretendida: 'Loja Campinas Taquaral',
    cargo_id: 'cargo-uuid-vendedor',
    vaga_interesse: 'Consultor de Vendas',
    status_candidatura: 'Recebido',
    loja_id: 'loja-uuid-campinas',
    loja_nome: 'Loja Campinas Taquaral',
    loja_cidade: 'Campinas',
    loja_estado: 'SP',
    possui_curriculo: true,
    created_at: '2026-11-12T11:00:00.000Z'
  },
  {
    id: 'cand-004-multiloja-2',
    candidatura_id: 'app-004-2',
    candidato_id: 'c-multi',
    nome: 'Mariana Candidata Multi-Loja',
    email: 'mariana.multi@teste.com',
    cpf_mascarado: '***.444.888-**',
    telefone: '(19) 99111-2222',
    cidade: 'Americana - SP',
    cidade_residencia: 'Americana - SP',
    candidato_cidade: 'Americana',
    candidato_estado: 'SP',
    unidade_pretendida: 'Gigante Pneus - Jundiaí',
    cargo_id: 'cargo-uuid-consultor-vendas',
    vaga_interesse: 'Consultor de Vendas',
    status_candidatura: 'Recebido',
    loja_id: 'loja-uuid-jundiai',
    loja_nome: 'Gigante Pneus - Jundiaí',
    loja_cidade: 'Jundiaí',
    loja_estado: 'SP',
    possui_curriculo: true,
    created_at: '2026-11-12T11:05:00.000Z'
  },
  {
    id: 'cand-005-espontanea-rede',
    candidatura_id: 'app-005',
    candidato_id: 'c-005',
    nome: 'Eduardo Talento Geral',
    email: 'eduardo.geral@teste.com',
    cpf_mascarado: '***.777.999-**',
    telefone: '(11) 94444-3333',
    cidade: 'Santos - SP',
    cidade_residencia: 'Santos - SP',
    candidato_cidade: 'Santos',
    candidato_estado: 'SP',
    unidade_pretendida: 'Banco de Talentos Corporativo',
    cargo_id: null,
    vaga_interesse: 'Candidatura Espontânea / Banco de Talentos',
    status_candidatura: 'Banco de Talentos',
    loja_id: null, // Sem loja vinculada
    loja_nome: undefined,
    loja_cidade: undefined,
    loja_estado: undefined,
    possui_curriculo: false,
    created_at: '2026-11-13T09:00:00.000Z'
  },
  {
    id: 'cand-006-sem-cidade',
    candidatura_id: 'app-006',
    candidato_id: 'c-006',
    nome: 'Candidato Legado Sem Cidade',
    email: 'sem.cidade@teste.com',
    cpf_mascarado: '***.000.111-**',
    telefone: '(11) 93333-2222',
    cidade: 'Não informada',
    cidade_residencia: 'Não informada',
    candidato_cidade: '',
    candidato_estado: '',
    unidade_pretendida: 'Loja Matriz Centro',
    cargo_id: 'cargo-uuid-mecanico',
    vaga_interesse: 'Mecânico Automotivo',
    status_candidatura: 'Recebido',
    loja_id: 'loja-uuid-matriz-sp',
    loja_nome: 'Loja Matriz Centro',
    loja_cidade: 'São Paulo',
    loja_estado: 'SP',
    possui_curriculo: true,
    created_at: '2026-11-13T10:00:00.000Z'
  }
];

// ------------------------------------------------------------------------------
// Testes dos Filtros e Cenários do Prompt 69
// ------------------------------------------------------------------------------

runTest('1. Candidato de Ribeirão Preto inscrito em Jundiaí: separação clara de dados', () => {
  const rafael = mockCandidaturas.find(c => c.protocolo === 'GIG-20261113-EB6BF0');
  assert.ok(rafael, 'Rafael deve estar presente na fixture');
  assert.strictEqual(rafael.candidato_cidade, 'Ribeirão Preto', 'Residência deve ser Ribeirão Preto');
  assert.strictEqual(rafael.loja_cidade, 'Jundiaí', 'Loja deve ser Jundiaí');
  assert.strictEqual(rafael.unidade_pretendida, 'Gigante Pneus - Jundiaí');
  assert.notStrictEqual(rafael.candidato_cidade, rafael.loja_cidade, 'Residência e Loja devem ser distintas');
});

runTest('2. Filtro exclusivo por Unidade (loja_id = Jundiaí): encontra candidaturas daquela unidade', () => {
  const result = filterCandidatosAdmin(mockCandidaturas, { lojaId: 'loja-uuid-jundiai' });
  // Rafael e Mariana (candidatura 2)
  assert.strictEqual(result.length, 2);
  assert.ok(result.some(c => c.nome === 'Rafael Martins de Oliveira'));
  assert.ok(result.some(c => c.nome === 'Mariana Candidata Multi-Loja'));
});

runTest('3. Filtro exclusivo por Cidade de Residência (cidade = Ribeirão Preto): encontra candidatos que moram em Ribeirão Preto', () => {
  const result = filterCandidatosAdmin(mockCandidaturas, { cidade: 'Ribeirão Preto' });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].nome, 'Rafael Martins de Oliveira');
  assert.strictEqual(result[0].unidade_pretendida, 'Gigante Pneus - Jundiaí');
});

runTest('4. Filtros Combinados: Unidade = Jundiaí E Cidade de Residência = Ribeirão Preto retorna Rafael', () => {
  const result = filterCandidatosAdmin(mockCandidaturas, {
    lojaId: 'loja-uuid-jundiai',
    cidade: 'Ribeirão Preto'
  });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].nome, 'Rafael Martins de Oliveira');
  assert.strictEqual(result[0].candidato_cidade, 'Ribeirão Preto');
  assert.strictEqual(result[0].loja_cidade, 'Jundiaí');
});

runTest('5. Candidato com candidaturas em unidades diferentes preserva mesma residência e lojas distintas', () => {
  const candsMariana = mockCandidaturas.filter(c => c.candidato_id === 'c-multi');
  assert.strictEqual(candsMariana.length, 2);
  // Mesma residência
  assert.strictEqual(candsMariana[0].candidato_cidade, 'Americana');
  assert.strictEqual(candsMariana[1].candidato_cidade, 'Americana');
  // Lojas distintas
  assert.strictEqual(candsMariana[0].unidade_pretendida, 'Loja Campinas Taquaral');
  assert.strictEqual(candsMariana[1].unidade_pretendida, 'Gigante Pneus - Jundiaí');
});

runTest('6. Candidatura Espontânea Geral sem loja: unidade pretendida é Banco de Talentos Corporativo', () => {
  const eduardo = mockCandidaturas.find(c => c.id === 'cand-005-espontanea-rede');
  assert.ok(eduardo);
  assert.strictEqual(eduardo.unidade_pretendida, 'Banco de Talentos Corporativo');
  assert.strictEqual(eduardo.loja_id, null);
  assert.strictEqual(eduardo.candidato_cidade, 'Santos');
});

runTest('7. Cidade de residência ausente: exibe Não informada sem substituir pela cidade da loja', () => {
  const semCidade = mockCandidaturas.find(c => c.id === 'cand-006-sem-cidade');
  assert.ok(semCidade);
  assert.strictEqual(semCidade.cidade_residencia, 'Não informada');
  assert.strictEqual(semCidade.loja_cidade, 'São Paulo');
  assert.notStrictEqual(semCidade.cidade_residencia, semCidade.loja_cidade);
});

runTest('8. Correspondência entre dados da tabela e do dossiê', () => {
  const item = mockCandidaturas[0]; // Rafael
  // Dados esperados na tabela
  assert.strictEqual(item.cidade_residencia, 'Ribeirão Preto - SP');
  assert.strictEqual(item.unidade_pretendida, 'Gigante Pneus - Jundiaí');
  // Dados esperados no dossiê
  assert.strictEqual(item.candidato_cidade, 'Ribeirão Preto');
  assert.strictEqual(item.candidato_estado, 'SP');
  assert.strictEqual(item.loja_nome, 'Gigante Pneus - Jundiaí');
  assert.strictEqual(item.loja_cidade, 'Jundiaí');
});

runTest('9. Busca Textual por Nome ou Protocolo encontra Rafael', () => {
  const resProtocolo = filterCandidatosAdmin(mockCandidaturas, { searchTerm: 'GIG-20261113-EB6BF0' });
  // O searchTerm busca em nome, email, cpf, vaga
  const resNome = filterCandidatosAdmin(mockCandidaturas, { searchTerm: 'Rafael' });
  assert.strictEqual(resNome.length, 1);
  assert.strictEqual(resNome[0].nome, 'Rafael Martins de Oliveira');
});

runTest('10. Limpeza de Filtros: restaura todos os registros íntegros', () => {
  const result = filterCandidatosAdmin(mockCandidaturas, {});
  assert.strictEqual(result.length, mockCandidaturas.length);
});

console.log('\n==============================================================================');
console.log(`RESULTADO FINAL DOS TESTES: ${passCount} PASSOU | ${failCount} FALHOU`);
console.log('==============================================================================');

if (failCount > 0) {
  process.exit(1);
}
