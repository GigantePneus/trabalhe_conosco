// ==============================================================================
// SUÍTE DE TESTES UNITÁRIOS - BARRA DE PROGRESSO INTELIGENTE (PROMPTS 61 & 62)
// PROJETO: Trabalhe Conosco — Gigante Pneus Multi-Lojas
// ==============================================================================

import assert from 'assert';
import { 
  calculateFormProgress, 
  getProgressMessage, 
  defaultIsValidCPF 
} from '../services/formProgressService.ts';

console.log('==============================================================================');
console.log('TESTES DO CÁLCULO INTELIGENTE DO PROGRESSO (CandidateFormProgress - V1)');
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

// Estado inicial novo, estritamente em branco e sem valores padrão
const novoFormularioParams = {
  formData: {
    nome: '',
    cpf: '',
    email: '',
    telefone: '',
    cidade: '',
    escolaridade: '',
    apresentacao_pessoal: '',
    consentimento_lgpd: false,
    candidatura_espontanea: false,
    aceita_outras_vagas: false,
    linkedin_url: ''
  },
  selectedCargoIds: [],
  tipoExperiencia: null,
  experienciaData: {
    cargo_funcao: '',
    ultima_empresa: '',
    area_atuacao: '',
    tempo_experiencia: '',
    disponibilidade_inicio: ''
  }
};

// ------------------------------------------------------------------------------
// PARTE 1: Mensagens Contextuais por Faixa (Prompt 61)
// ------------------------------------------------------------------------------
console.log('--- 1. Mensagens Contextuais por Faixa ---');

runTest('Faixa 0% a 24%: "Vamos começar seu cadastro"', () => {
  assert.strictEqual(getProgressMessage(0), 'Vamos começar seu cadastro');
  assert.strictEqual(getProgressMessage(15), 'Vamos começar seu cadastro');
  assert.strictEqual(getProgressMessage(24), 'Vamos começar seu cadastro');
});

runTest('Faixa 25% a 49%: "Você está avançando!"', () => {
  assert.strictEqual(getProgressMessage(25), 'Você está avançando!');
  assert.strictEqual(getProgressMessage(35), 'Você está avançando!');
  assert.strictEqual(getProgressMessage(49), 'Você está avançando!');
});

runTest('Faixa 50% a 74%: "Já passamos da metade!"', () => {
  assert.strictEqual(getProgressMessage(50), 'Já passamos da metade!');
  assert.strictEqual(getProgressMessage(60), 'Já passamos da metade!');
  assert.strictEqual(getProgressMessage(74), 'Já passamos da metade!');
});

runTest('Faixa 75% a 99%: "Falta pouco para concluir!"', () => {
  assert.strictEqual(getProgressMessage(75), 'Falta pouco para concluir!');
  assert.strictEqual(getProgressMessage(88), 'Falta pouco para concluir!');
  assert.strictEqual(getProgressMessage(99), 'Falta pouco para concluir!');
});

runTest('100%: "Tudo pronto para enviar!"', () => {
  assert.strictEqual(getProgressMessage(100), 'Tudo pronto para enviar!');
});

// ------------------------------------------------------------------------------
// PARTE 2: Os 16 Cenários Específicos do PROMPT 62
// ------------------------------------------------------------------------------
console.log('\n--- 2. Os 16 Cenários Específicos do Prompt 62 ---');

// Cenário 1: Formulário totalmente novo inicia em 0%
runTest('Cenário 1: Formulário totalmente novo inicia em exatamente 0%', () => {
  const result = calculateFormProgress(novoFormularioParams);
  assert.strictEqual(result.progress, 0, `Esperado 0%, obtido ${result.progress}%`);
  assert.strictEqual(result.message, 'Vamos começar seu cadastro');
  assert.strictEqual(result.sectionStatus.identificacao, false);
  assert.strictEqual(result.sectionStatus.apresentacao, false);
  assert.strictEqual(result.sectionStatus.experiencia, false);
  assert.strictEqual(result.sectionStatus.vagas, false);
  assert.strictEqual(result.sectionStatus.lgpd, false);
});

// Cenário 2: Experiência não selecionada não pontua
runTest('Cenário 2: Experiência não selecionada (tipoExperiencia: null) não pontua', () => {
  const params = {
    ...novoFormularioParams,
    tipoExperiencia: null,
    experienciaData: {
      cargo_funcao: 'Mecânico',
      ultima_empresa: 'Oficina X',
      area_atuacao: 'Mecânica',
      tempo_experiencia: '1 a 2 anos',
      disponibilidade_inicio: 'Imediata'
    }
  };
  const result = calculateFormProgress(params);
  // Mesmo com dados preenchidos no state, se tipoExperiencia for null, a seção 3 deve pontuar 0
  assert.strictEqual(result.sectionStatus.experiencia, false);
  assert.strictEqual(result.progress, 0);
});

// Cenário 3: Candidatura espontânea desmarcada não pontua
runTest('Cenário 3: Candidatura espontânea desmarcada (sem vagas) não pontua', () => {
  const params = {
    ...novoFormularioParams,
    formData: { ...novoFormularioParams.formData, candidatura_espontanea: false },
    selectedCargoIds: []
  };
  const result = calculateFormProgress(params);
  assert.strictEqual(result.sectionStatus.vagas, false);
  assert.strictEqual(result.progress, 0);
});

// Cenário 4: Ampliação de oportunidades não pontua
runTest('Cenário 4: Ampliação de oportunidades (aceita_outras_vagas: true) não pontua por si só', () => {
  const params = {
    ...novoFormularioParams,
    formData: { 
      ...novoFormularioParams.formData, 
      aceita_outras_vagas: true, 
      candidatura_espontanea: false 
    },
    selectedCargoIds: []
  };
  const result = calculateFormProgress(params);
  assert.strictEqual(result.sectionStatus.vagas, false);
  assert.strictEqual(result.progress, 0);
});

// Cenário 5: Escolaridade vazia não pontua
runTest('Cenário 5: Escolaridade vazia ("") não pontua na seção de identificação', () => {
  const paramsComEscolaridadeVazia = {
    ...novoFormularioParams,
    formData: {
      ...novoFormularioParams.formData,
      nome: 'Alexsandro Ignacio',
      cpf: '529.982.247-25',
      email: 'alexsandro@exemplo.com',
      telefone: '(11) 98765-4321',
      cidade: 'Campinas',
      escolaridade: '' // Não selecionada
    }
  };
  const result = calculateFormProgress(paramsComEscolaridadeVazia);
  // 5 de 6 campos preenchidos -> 16.66% arredondado para 17%
  assert.strictEqual(result.sectionStatus.identificacao, false);
  assert.strictEqual(result.progress, 17);

  // Agora preenche escolaridade -> deve completar a Seção 1 (20%)
  const paramsComEscolaridade = {
    ...paramsComEscolaridadeVazia,
    formData: { ...paramsComEscolaridadeVazia.formData, escolaridade: 'Ensino Médio' }
  };
  const result2 = calculateFormProgress(paramsComEscolaridade);
  assert.strictEqual(result2.sectionStatus.identificacao, true);
  assert.strictEqual(result2.progress, 20);
});

// Cenário 6: Disponibilidade vazia não pontua
runTest('Cenário 6: Disponibilidade vazia não pontua e não completa a seção de experiência', () => {
  // Caso Primeiro Emprego sem disponibilidade
  const paramsPE = {
    ...novoFormularioParams,
    tipoExperiencia: 'primeiro_emprego',
    experienciaData: { ...novoFormularioParams.experienciaData, disponibilidade_inicio: '' }
  };
  const resPE = calculateFormProgress(paramsPE);
  assert.strictEqual(resPE.sectionStatus.experiencia, false);
  assert.strictEqual(resPE.progress, 10); // Apenas os 10% da escolha

  // Caso Com Experiência sem disponibilidade
  const paramsCE = {
    ...novoFormularioParams,
    tipoExperiencia: 'com_experiencia',
    experienciaData: {
      cargo_funcao: 'Alinhador',
      ultima_empresa: 'Oficina Central',
      area_atuacao: 'Mecânica e Serviços Automotivos',
      tempo_experiencia: '1 a 2 anos',
      disponibilidade_inicio: '' // Vazio
    }
  };
  const resCE = calculateFormProgress(paramsCE);
  assert.strictEqual(resCE.sectionStatus.experiencia, false);
  assert.strictEqual(resCE.progress, 16); // 4 de 5 campos preenchidos = (4/5)*20 = 16%
});

// Cenário 7: Habilidades não selecionadas não pontuam
runTest('Cenário 7: Habilidades/outros campos opcionais não pontuam nem impedem avanço', () => {
  const params = {
    ...novoFormularioParams,
    formData: {
      ...novoFormularioParams.formData,
      linkedin_url: '' // Opcional
    }
  };
  const result = calculateFormProgress(params);
  assert.strictEqual(result.progress, 0);
});

// Cenário 8: Primeiro emprego selecionado conscientemente
runTest('Cenário 8: Primeiro emprego selecionado conscientemente com disponibilidade completa a seção', () => {
  const params = {
    ...novoFormularioParams,
    tipoExperiencia: 'primeiro_emprego',
    experienciaData: {
      ...novoFormularioParams.experienciaData,
      disponibilidade_inicio: 'Imediata'
    }
  };
  const result = calculateFormProgress(params);
  assert.strictEqual(result.sectionStatus.experiencia, true);
  assert.strictEqual(result.progress, 20);
});

// Cenário 9: Experiência anterior com campos incompletos
runTest('Cenário 9: Experiência anterior com campos incompletos pontua proporcionalmente e não completa', () => {
  const params = {
    ...novoFormularioParams,
    tipoExperiencia: 'com_experiencia',
    experienciaData: {
      cargo_funcao: 'Mecânico',
      ultima_empresa: '', // Faltando
      area_atuacao: 'Mecânica e Serviços Automotivos',
      tempo_experiencia: '', // Faltando
      disponibilidade_inicio: 'Em 15 dias'
    }
  };
  const result = calculateFormProgress(params);
  assert.strictEqual(result.sectionStatus.experiencia, false);
  // 3 de 5 campos preenchidos -> (3/5)*20 = 12%
  assert.strictEqual(result.progress, 12);
});

// Cenário 10: Alteração de primeiro emprego para experiência anterior (dados ocultos não pontuam)
runTest('Cenário 10: Alteração de primeiro emprego para com experiência: dados ocultos não pontuam', () => {
  // Quando com_experiencia está ativo mas campos de cargo/empresa estão vazios
  const params = {
    ...novoFormularioParams,
    tipoExperiencia: 'com_experiencia',
    experienciaData: {
      cargo_funcao: '',
      ultima_empresa: '',
      area_atuacao: '',
      tempo_experiencia: '',
      disponibilidade_inicio: 'Imediata'
    }
  };
  const result = calculateFormProgress(params);
  assert.strictEqual(result.sectionStatus.experiencia, false);
  // Apenas disponibilidade está preenchida = 1 de 5 campos = 4%
  assert.strictEqual(result.progress, 4);
});

// Cenário 11: Remoção de uma vaga selecionada
runTest('Cenário 11: Remoção de uma vaga selecionada sem candidatura espontânea zera a seção 4', () => {
  const comVaga = {
    ...novoFormularioParams,
    selectedCargoIds: ['vaga-123'],
    formData: { ...novoFormularioParams.formData, candidatura_espontanea: false }
  };
  const resComVaga = calculateFormProgress(comVaga);
  assert.strictEqual(resComVaga.sectionStatus.vagas, true);
  assert.strictEqual(resComVaga.progress, 20);

  // Candidato desmarca a vaga
  const semVaga = {
    ...comVaga,
    selectedCargoIds: []
  };
  const resSemVaga = calculateFormProgress(semVaga);
  assert.strictEqual(resSemVaga.sectionStatus.vagas, false);
  assert.strictEqual(resSemVaga.progress, 0);
});

// Cenário 12: Candidatura espontânea selecionada
runTest('Cenário 12: Candidatura espontânea selecionada pontua 20% mesmo sem selecionar vagas da lista', () => {
  const params = {
    ...novoFormularioParams,
    selectedCargoIds: [],
    formData: { ...novoFormularioParams.formData, candidatura_espontanea: true }
  };
  const result = calculateFormProgress(params);
  assert.strictEqual(result.sectionStatus.vagas, true);
  assert.strictEqual(result.progress, 20);
});

// Cenário 13: Consentimento LGPD desmarcado
runTest('Cenário 13: Consentimento LGPD desmarcado não pontua na Seção 5 e impede 100%', () => {
  const paramsQuaseCompleto = {
    formData: {
      nome: 'Alexsandro Ignacio',
      cpf: '529.982.247-25',
      email: 'alexsandro@exemplo.com',
      telefone: '(11) 98765-4321',
      cidade: 'Campinas',
      escolaridade: 'Ensino Médio',
      apresentacao_pessoal: 'Profissional dedicado com vasta experiência em alinhamento e montagem de pneus automotivos.',
      candidatura_espontanea: true,
      consentimento_lgpd: false // DESMARCADO
    },
    selectedCargoIds: [],
    tipoExperiencia: 'primeiro_emprego',
    experienciaData: {
      cargo_funcao: '',
      ultima_empresa: '',
      area_atuacao: '',
      tempo_experiencia: '',
      disponibilidade_inicio: 'Imediata'
    }
  };
  const result = calculateFormProgress(paramsQuaseCompleto);
  assert.strictEqual(result.sectionStatus.lgpd, false);
  // Seções 1, 2, 3, 4 completas (80%), Seção 5 pendente (0%) -> Total 80%
  assert.strictEqual(result.progress, 80);
  assert.strictEqual(result.message, 'Falta pouco para concluir!');
});

// Cenário 14: Currículo ausente com todos os demais requisitos válidos
runTest('Cenário 14: Currículo ausente com todos os demais requisitos válidos não impede os 100%', () => {
  const paramsSemCurriculo = {
    formData: {
      nome: 'Alexsandro Ignacio',
      cpf: '529.982.247-25',
      email: 'alexsandro@exemplo.com',
      telefone: '(11) 98765-4321',
      cidade: 'Campinas',
      escolaridade: 'Ensino Médio',
      apresentacao_pessoal: 'Profissional dedicado com vasta experiência em alinhamento e montagem de pneus automotivos.',
      candidatura_espontanea: true,
      consentimento_lgpd: true
    },
    selectedCargoIds: [],
    tipoExperiencia: 'primeiro_emprego',
    experienciaData: {
      cargo_funcao: '',
      ultima_empresa: '',
      area_atuacao: '',
      tempo_experiencia: '',
      disponibilidade_inicio: 'Imediata'
    }
    // curriculo não fornecido
  };
  const result = calculateFormProgress(paramsSemCurriculo);
  assert.strictEqual(result.sectionStatus.lgpd, true);
  assert.strictEqual(result.progress, 100);
  assert.strictEqual(result.message, 'Tudo pronto para enviar!');
});

// Cenário 15: Formulário completo atinge exatamente 100%
runTest('Cenário 15: Formulário completo atinge exatamente 100% com mensagem final', () => {
  const paramsCompleto = {
    formData: {
      nome: 'Carlos Eduardo',
      cpf: '529.982.247-25',
      email: 'carlos.eduardo@teste.com',
      telefone: '(41) 99888-7766',
      cidade: 'Curitiba',
      escolaridade: 'Técnico',
      apresentacao_pessoal: 'Tenho ampla experiência como mecânico automotivo e montador de pneus para veículos leves e pesados.',
      consentimento_lgpd: true,
      candidatura_espontanea: false
    },
    selectedCargoIds: ['vaga-mecanico-01'],
    tipoExperiencia: 'com_experiencia',
    experienciaData: {
      cargo_funcao: 'Mecânico Geral',
      ultima_empresa: 'Centro Automotivo Pinhais',
      area_atuacao: 'Mecânica e Serviços Automotivos',
      tempo_experiencia: 'Mais de 5 anos',
      disponibilidade_inicio: 'Imediata'
    }
  };
  const result = calculateFormProgress(paramsCompleto);
  assert.strictEqual(result.sectionStatus.identificacao, true);
  assert.strictEqual(result.sectionStatus.apresentacao, true);
  assert.strictEqual(result.sectionStatus.experiencia, true);
  assert.strictEqual(result.sectionStatus.vagas, true);
  assert.strictEqual(result.sectionStatus.lgpd, true);
  assert.strictEqual(result.progress, 100);
  assert.strictEqual(result.message, 'Tudo pronto para enviar!');
});

// Cenário 16: Dados restaurados apresentam percentual correspondente ao preenchimento
runTest('Cenário 16: Dados restaurados/preenchidos parcialmente refletem percentual exato', () => {
  // Simulando candidato preenchendo apenas Identificação (20%) e Apresentação (20%) = 40%
  const paramsParcial = {
    ...novoFormularioParams,
    formData: {
      ...novoFormularioParams.formData,
      nome: 'Marcos Vinicius',
      cpf: '529.982.247-25',
      email: 'marcos@email.com',
      telefone: '(19) 98111-2233',
      cidade: 'Campinas',
      escolaridade: 'Superior',
      apresentacao_pessoal: 'Prezados recrutadores da Gigante Pneus, tenho interesse em trabalhar como auxiliar administrativo.'
    }
  };
  const result = calculateFormProgress(paramsParcial);
  assert.strictEqual(result.sectionStatus.identificacao, true);
  assert.strictEqual(result.sectionStatus.apresentacao, true);
  assert.strictEqual(result.sectionStatus.experiencia, false);
  assert.strictEqual(result.sectionStatus.vagas, false);
  assert.strictEqual(result.sectionStatus.lgpd, false);
  assert.strictEqual(result.progress, 40);
  assert.strictEqual(result.message, 'Você está avançando!');
});

console.log('\n==============================================================================');
console.log(`RESULTADO FINAL DOS TESTES: ${passCount} PASSOU | ${failCount} FALHOU`);
console.log('==============================================================================');

if (failCount > 0) {
  process.exit(1);
}
