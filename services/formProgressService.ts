/**
 * Serviço de Cálculo Inteligente de Progresso do Cadastro (Prompt 61 & 62)
 * Projeto: Trabalhe Conosco — Gigante Pneus Multi-Lojas
 */

export interface ProgressCalculationParams {
  formData: {
    nome: string;
    cpf: string;
    email: string;
    telefone: string;
    cidade: string;
    escolaridade: string;
    apresentacao_pessoal: string;
    consentimento_lgpd: boolean;
    candidatura_espontanea: boolean;
    aceita_outras_vagas?: boolean;
    linkedin_url?: string;
  };
  selectedCargoIds: string[];
  tipoExperiencia: 'com_experiencia' | 'primeiro_emprego' | null | '';
  experienciaData: {
    cargo_funcao: string;
    ultima_empresa: string;
    area_atuacao: string;
    tempo_experiencia: string;
    disponibilidade_inicio: string;
  };
  isValidCpfFn?: (cpf: string) => boolean;
}

export interface ProgressResult {
  progress: number;
  message: string;
  sectionStatus: {
    identificacao: boolean;
    apresentacao: boolean;
    experiencia: boolean;
    vagas: boolean;
    lgpd: boolean;
  };
}

/**
 * Validação matemática simplificada de CPF
 */
export const defaultIsValidCPF = (cpf: string): boolean => {
  if (!cpf) return false;
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(clean.charAt(i), 10) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(clean.charAt(9), 10)) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(clean.charAt(i), 10) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === parseInt(clean.charAt(10), 10);
};

/**
 * Obtém a mensagem contextual de acordo com a faixa percentual definida no Prompt 61
 */
export const getProgressMessage = (progress: number): string => {
  if (progress < 25) return 'Vamos começar seu cadastro';
  if (progress < 50) return 'Você está avançando!';
  if (progress < 75) return 'Já passamos da metade!';
  if (progress < 100) return 'Falta pouco para concluir!';
  return 'Tudo pronto para enviar!';
};

/**
 * Calcula o progresso inteligente do formulário de candidatura (Prompt 61 & 62)
 * Peso equilibrado de 20% para cada uma das 5 seções funcionais.
 * 
 * Inicia estritamente em 0% quando o formulário é novo, sem atribuição de pontos
 * a valores padrão ou seleções automáticas.
 */
export const calculateFormProgress = (params: ProgressCalculationParams): ProgressResult => {
  const { formData, selectedCargoIds, tipoExperiencia, experienciaData, isValidCpfFn = defaultIsValidCPF } = params;

  // 1. Seção de Identificação (Peso: 20%)
  // Avalia: Nome completo (>=2 chars), CPF matematicamente válido, E-mail válido,
  // Telefone (>=10 dígitos), Cidade (>=2 chars) e Escolaridade selecionada (não vazia).
  // LinkedIn e aceita_outras_vagas são opcionais e NÃO pontuam.
  const nomeValido = Boolean(formData.nome && formData.nome.trim().length >= 2);
  const cpfValido = Boolean(formData.cpf && isValidCpfFn(formData.cpf));
  const emailValido = Boolean(formData.email && formData.email.includes('@') && formData.email.includes('.'));
  const telefoneValido = Boolean(formData.telefone && formData.telefone.replace(/\D/g, '').length >= 10);
  const cidadeValida = Boolean(formData.cidade && formData.cidade.trim().length >= 2);
  const escolaridadeValida = Boolean(formData.escolaridade && formData.escolaridade.trim().length > 0);

  const camposIdValidos = [nomeValido, cpfValido, emailValido, telefoneValido, cidadeValida, escolaridadeValida].filter(Boolean).length;
  // Cada campo vale 20 / 6 = 3.333%
  const sec1Score = (camposIdValidos / 6) * 20;
  const sec1Completa = camposIdValidos === 6;

  // 2. Seção de Apresentação Pessoal (Peso: 20%)
  // Válida entre 80 e 2.000 caracteres. Cálculo progressivo de 0 a 80 chars.
  const apresentacaoRaw = formData.apresentacao_pessoal ? formData.apresentacao_pessoal.trim() : '';
  const apresentacaoLen = apresentacaoRaw.length;
  let sec2Score = 0;
  let sec2Completa = false;

  if (apresentacaoLen >= 80 && formData.apresentacao_pessoal.length <= 2000) {
    sec2Score = 20;
    sec2Completa = true;
  } else if (apresentacaoLen > 0 && apresentacaoLen < 80) {
    sec2Score = (apresentacaoLen / 80) * 20;
  } else {
    sec2Score = 0;
  }

  // 3. Seção de Experiência Profissional (Peso: 20%)
  // Antes de o candidato escolher entre "com_experiencia" e "primeiro_emprego", pontua 0%.
  // • Primeiro Emprego: 10% pela escolha consciente + 10% pela seleção de disponibilidade = 20%
  // • Com Experiência: 4% cargo + 4% empresa + 4% área + 4% tempo + 4% disponibilidade = 20%
  let sec3Score = 0;
  let sec3Completa = false;

  const disponibilidadeValida = Boolean(experienciaData.disponibilidade_inicio && experienciaData.disponibilidade_inicio.trim().length > 0);

  if (tipoExperiencia === 'primeiro_emprego') {
    // Escolha de primeiro emprego pontua 10%, e disponibilidade pontua os outros 10%
    const pontosPrimeiroEmprego = 10;
    const pontosDisp = disponibilidadeValida ? 10 : 0;
    sec3Score = pontosPrimeiroEmprego + pontosDisp;
    sec3Completa = disponibilidadeValida;
  } else if (tipoExperiencia === 'com_experiencia') {
    const cargoValido = Boolean(experienciaData.cargo_funcao && experienciaData.cargo_funcao.trim().length >= 2);
    const empresaValida = Boolean(experienciaData.ultima_empresa && experienciaData.ultima_empresa.trim().length >= 2);
    const areaValida = Boolean(experienciaData.area_atuacao && experienciaData.area_atuacao.trim().length > 0);
    const tempoValido = Boolean(experienciaData.tempo_experiencia && experienciaData.tempo_experiencia.trim().length > 0);

    const camposExpValidos = [cargoValido, empresaValida, areaValida, tempoValido, disponibilidadeValida].filter(Boolean).length;
    sec3Score = (camposExpValidos / 5) * 20;
    sec3Completa = camposExpValidos === 5;
  } else {
    // Nenhuma opção de experiência selecionada -> 0%
    sec3Score = 0;
    sec3Completa = false;
  }

  // 4. Seção de Vagas e Oportunidades (Peso: 20%)
  // Concluída quando há ao menos uma vaga selecionada OU candidatura espontânea marcada conscientemente.
  // Ampliação de oportunidades (aceita_outras_vagas) é opcional e não altera o percentual.
  const sec4Completa = (Array.isArray(selectedCargoIds) && selectedCargoIds.length > 0) || formData.candidatura_espontanea === true;
  const sec4Score = sec4Completa ? 20 : 0;

  // 5. Seção de Currículo e Consentimento LGPD (Peso: 20%)
  // O currículo é opcional e não penaliza o progresso.
  // Concluída estritamente quando o consentimento obrigatório LGPD for assinalado (true).
  const sec5Completa = formData.consentimento_lgpd === true;
  const sec5Score = sec5Completa ? 20 : 0;

  // Somatório ponderado das 5 seções
  const totalRaw = sec1Score + sec2Score + sec3Score + sec4Score + sec5Score;
  const finalProgress = Math.min(100, Math.max(0, Math.round(totalRaw)));

  return {
    progress: finalProgress,
    message: getProgressMessage(finalProgress),
    sectionStatus: {
      identificacao: sec1Completa,
      apresentacao: sec2Completa,
      experiencia: sec3Completa,
      vagas: sec4Completa,
      lgpd: sec5Completa
    }
  };
};
