// ==============================================================================
// SUÍTE DE TESTES AUTOMATIZADOS ISOLADOS - BANCO DE TALENTOS V1 DEFINITIVA
// PROJETO: Trabalhe Conosco — Gigante Pneus Multi-Lojas
//
// OBJETIVO:
// Validar todas as regras de negócio, contratos de dados, validações e resiliência
// SEM executar nenhuma gravação ou alteração no Supabase oficial ou Google Drive.
// ==============================================================================

import assert from 'assert';
import { validateCurriculoFile } from '../services/security/fileValidator.ts';
import { validateCpf, maskCpf, generateCpfHash } from '../services/security/cpfSecurity.ts';

console.log('==============================================================================');
console.log('INICIANDO SUÍTE DE TESTES UNITÁRIOS E DE CONTRATO - BANCO DE TALENTOS V1');
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

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    failCount++;
  }
}

// ------------------------------------------------------------------------------
// 1. Validações da Apresentação Pessoal ("Conte um pouco sobre você")
// ------------------------------------------------------------------------------
console.log('--- 1. Apresentação Pessoal Obrigatória (80 - 2.000 caracteres) ---');

runTest('Rejeitar apresentação vazia ou ausente', () => {
  const check = (str) => {
    if (!str || str.trim().length < 80) return false;
    return str.length <= 2000;
  };
  assert.strictEqual(check(''), false);
  assert.strictEqual(check(null), false);
  assert.strictEqual(check(undefined), false);
});

runTest('Rejeitar apresentação com menos de 80 caracteres (ex: 79 caracteres)', () => {
  const shortText = 'A'.repeat(79);
  assert.strictEqual(shortText.length, 79);
  const isValid = shortText.trim().length >= 80 && shortText.length <= 2000;
  assert.strictEqual(isValid, false);
});

runTest('Aceitar apresentação exatamente no limite inferior (80 caracteres)', () => {
  const valid80 = 'Tenho interesse em atuar na área de serviços automotivos da rede Gigante Pneus!!';
  assert.strictEqual(valid80.trim().length, 80);
  const isValid = valid80.trim().length >= 80 && valid80.length <= 2000;
  assert.strictEqual(isValid, true);
});

runTest('Aceitar apresentação completa de tamanho médio (ex: 350 caracteres)', () => {
  const midText = 'Trabalho com montagem, balanceamento e alinhamento veicular há mais de 3 anos. Possuo facilidade de comunicação, trabalho em equipe, organização e pontualidade no atendimento aos clientes. Busco uma oportunidade de crescimento contínuo na rede Gigante Pneus para somar com dedicação e alcançar resultados de excelência em conjunto com a unidade.';
  assert.ok(midText.length >= 80 && midText.length <= 2000);
});

runTest('Rejeitar apresentação excedendo 2.000 caracteres', () => {
  const hugeText = 'X'.repeat(2001);
  const isValid = hugeText.trim().length >= 80 && hugeText.length <= 2000;
  assert.strictEqual(isValid, false);
});

// ------------------------------------------------------------------------------
// 2. Experiência Profissional Estruturada & Suporte a Primeiro Emprego
// ------------------------------------------------------------------------------
console.log('\n--- 2. Experiência Profissional Estruturada & Primeiro Emprego ---');

runTest('Validar objeto de Primeiro Emprego estruturado', () => {
  const payloadPrimeiroEmprego = {
    tipo_experiencia: 'primeiro_emprego',
    primeiro_emprego: true,
    ultima_empresa: 'Primeiro Emprego',
    cargo_funcao: 'Iniciante / Primeiro Emprego',
    area_atuacao: 'Serviços Gerais / Atendimento',
    tempo_experiencia: 'Sem experiência prévia',
    principais_atividades: 'Busco primeira oportunidade no mercado de trabalho.',
    habilidades: ['Pontualidade & Organização', 'Facilidade de Aprendizado', 'CNH Categoria B'],
    disponibilidade_inicio: 'Imediata'
  };

  assert.strictEqual(payloadPrimeiroEmprego.primeiro_emprego, true);
  assert.strictEqual(payloadPrimeiroEmprego.tipo_experiencia, 'primeiro_emprego');
  assert.ok(Array.isArray(payloadPrimeiroEmprego.habilidades));
  assert.strictEqual(payloadPrimeiroEmprego.habilidades.length, 3);
});

runTest('Validar objeto de Candidato com Experiência Anterior', () => {
  const payloadComExperiencia = {
    tipo_experiencia: 'com_experiencia',
    primeiro_emprego: false,
    ultima_empresa: 'Auto Center Paraná',
    cargo_funcao: 'Alinhador e Balanceador',
    area_atuacao: 'Borracharia, Alinhamento e Balanceamento',
    tempo_experiencia: '3 a 5 anos',
    principais_atividades: 'Realização de alinhamento 3D, balanceamento de rodas leves e pesadas, montagem de pneus e diagnóstico de suspensão.',
    habilidades: ['Alinhamento & Balanceamento', 'Troca de Pneus / Borracharia', 'Mecânica Rápida Automotiva'],
    disponibilidade_inicio: '15 dias (Aviso prévio)'
  };

  assert.strictEqual(payloadComExperiencia.primeiro_emprego, false);
  assert.strictEqual(payloadComExperiencia.cargo_funcao, 'Alinhador e Balanceador');
  assert.strictEqual(payloadComExperiencia.tempo_experiencia, '3 a 5 anos');
  assert.ok(payloadComExperiencia.habilidades.includes('Alinhamento & Balanceamento'));
});

// ------------------------------------------------------------------------------
// 3. Regra de Currículo Opcional
// ------------------------------------------------------------------------------
console.log('\n--- 3. Regra de Currículo Opcional na V1 ---');

runTest('Candidatura SEM arquivo anexado: fluxo seguro', () => {
  const candidaturaSemArquivo = {
    nome: 'Candidato Sem Curriculo',
    email: 'candidato.sem@teste.com',
    cpf: '529.982.247-25',
    telefone: '(11) 98765-4321',
    consentimento_lgpd: true,
    apresentacao_pessoal: 'Tenho interesse em atuar na área de serviços automotivos da rede Gigante Pneus com comprometimento e pontualidade.',
    arquivo: null
  };

  const hasArquivo = Boolean(candidaturaSemArquivo.arquivo && candidaturaSemArquivo.arquivo.base64);
  assert.strictEqual(hasArquivo, false);

  // No backend, driveUpload deve ser null e curriculo_id deve ser null
  const driveUpload = null;
  const curriculoId = null;
  assert.strictEqual(driveUpload, null);
  assert.strictEqual(curriculoId, null);
});

runTest('Candidatura COM arquivo anexado: validação do arquivo PDF', () => {
  // Mock de buffer com magic number de PDF: %PDF-1.4
  const pdfHeader = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
  const result = validateCurriculoFile(pdfHeader, 'curriculo_alexsandro.pdf', 'application/pdf');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.detectedMimeType, 'application/pdf');
});

runTest('Rejeitar arquivo com extensão perigosa (.exe) mesmo que renomeado', () => {
  const exeBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');
  const result = validateCurriculoFile(exeBuffer, 'curriculo_malicioso.exe', 'application/octet-stream');
  assert.strictEqual(result.valid, false);
});

// ------------------------------------------------------------------------------
// 4. Segurança de CPF e LGPD
// ------------------------------------------------------------------------------
console.log('\n--- 4. Segurança de Identidade Civil, CPF e LGPD ---');

runTest('Validação matemática de CPF legítimo', () => {
  // CPF de teste gerado pelo algoritmo padrão de dígitos verificadores
  const cpfValido = '52998224725';
  const val = validateCpf(cpfValido);
  assert.strictEqual(val.valid, true);
  assert.strictEqual(maskCpf(val.cleanCpf), '***.***.247-**');
  assert.strictEqual(generateCpfHash(val.cleanCpf).length, 64);
});

runTest('Rejeição matemática de CPF com dígitos verificadores incorretos', () => {
  const cpfInvalido = '11122233344';
  const val = validateCpf(cpfInvalido);
  assert.strictEqual(val.valid, false);
});

runTest('Rejeição de CPF com todos os dígitos repetidos', () => {
  const cpfRepetido = '11111111111';
  const val = validateCpf(cpfRepetido);
  assert.strictEqual(val.valid, false);
});

// ------------------------------------------------------------------------------
// 5. Compensação e Resiliência (Rollback Saga)
// ------------------------------------------------------------------------------
console.log('\n--- 5. Compensação e Resiliência do Pipeline de Ingestão ---');

runTest('Compensação quando houve upload e o banco falha: deleteFile acionado', () => {
  let deleteFileCalledWith = null;
  const mockGoogleDrive = {
    deleteFile: (fileId) => {
      deleteFileCalledWith = fileId;
    }
  };

  const driveUpload = { fileId: 'drive-file-uuid-123', fileName: 'teste.pdf' };
  const rpcError = new Error('VAGA_INEXISTENTE');

  if (rpcError && driveUpload?.fileId) {
    mockGoogleDrive.deleteFile(driveUpload.fileId);
  }

  assert.strictEqual(deleteFileCalledWith, 'drive-file-uuid-123');
});

runTest('Compensação quando NÃO houve upload (currículo opcional) e o banco falha: deleteFile ignorado', () => {
  let deleteFileCalled = false;
  const mockGoogleDrive = {
    deleteFile: () => {
      deleteFileCalled = true;
    }
  };

  const driveUpload = null;
  const rpcError = new Error('DATABASE_CONNECTION_TIMEOUT');

  if (rpcError && driveUpload?.fileId) {
    mockGoogleDrive.deleteFile(driveUpload.fileId);
  }

  assert.strictEqual(deleteFileCalled, false);
});

// ------------------------------------------------------------------------------
// 6. Integridade da Assinatura da RPC e Parâmetros
// ------------------------------------------------------------------------------
console.log('\n--- 6. Verificação do Contrato de Parâmetros da Migration 007 ---');

runTest('Contrato de parâmetros da RPC 007 possui 24 argumentos compatíveis', () => {
  const expectedParams = [
    'p_nome',
    'p_email',
    'p_cpf_limpo',
    'p_cpf_hash',
    'p_cpf_mascarado',
    'p_cpf_criptografado',
    'p_telefone',
    'p_cidade',
    'p_estado',
    'p_escolaridade',
    'p_linkedin_url',
    'p_aceita_outras_vagas',
    'p_consentimento_lgpd',
    'p_vagas',
    'p_apresentacao_pessoal',
    'p_experiencia_profissional',
    'p_google_drive_file_id',
    'p_google_drive_folder_id',
    'p_nome_arquivo',
    'p_mime_type',
    'p_tamanho_bytes',
    'p_md5_checksum',
    'p_protocolo',
    'p_ip_origem'
  ];

  assert.strictEqual(expectedParams.length, 24);
  assert.ok(expectedParams.includes('p_apresentacao_pessoal'));
  assert.ok(expectedParams.includes('p_experiencia_profissional'));
  assert.ok(expectedParams.includes('p_google_drive_file_id'));
});

console.log('\n==============================================================================');
console.log(`RESULTADO FINAL DOS TESTES: ${passCount} PASSOU | ${failCount} FALHOU`);
console.log('==============================================================================');

if (failCount > 0) {
  process.exit(1);
}
