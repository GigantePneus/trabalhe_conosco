import fs from 'fs';
import path from 'path';

process.env.CPF_HMAC_SECRET = process.env.CPF_HMAC_SECRET || 'dev-hmac-secret-gigante-pneus-local';

console.log('=====================================================');
console.log('🧪 TESTE DE VALIDAÇÃO DO EMPACOTAMENTO SERVERLESS VERCEL');
console.log('=====================================================');

// 1. Verificar se os artefatos foram gerados
const expectedEndpoints = [
  'api/candidaturas/enviar.js',
  'api/curriculos/visualizar.js',
  'api/curriculos/download.js',
  'api/integracoes/google/autorizar.js',
  'api/integracoes/google/callback.js'
];

console.log('\n1. Verificando presença dos artefatos JavaScript em /api...');
for (const endpoint of expectedEndpoints) {
  if (!fs.existsSync(endpoint)) {
    console.error(`❌ FALHA: Artefato ausente: ${endpoint}`);
    process.exit(1);
  }
  const stats = fs.statSync(endpoint);
  console.log(`  ✓ ${endpoint} (${(stats.size / 1024).toFixed(1)} KB)`);
}

// 2. Verificar que não há arquivos .ts concorrentes em api/
console.log('\n2. Verificando ausência de arquivos .ts em /api...');
function verifyNoTs(dir) {
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      verifyNoTs(full);
    } else if (entry.endsWith('.ts')) {
      console.error(`❌ FALHA: Arquivo .ts não empacotado encontrado em /api: ${full}`);
      process.exit(1);
    }
  }
}
verifyNoTs('api');
console.log('  ✓ Nenhum arquivo .ts residual em /api. Vercel utilizará os bundles .js.');

// 3. Teste de importação dinâmica ESM de todos os 5 módulos
console.log('\n3. Testando resolução dinâmica de módulos pelo Node.js ESM...');
const modules = {};
for (const endpoint of expectedEndpoints) {
  const fileUrl = new URL('../' + endpoint, import.meta.url).href;
  try {
    const mod = await import(fileUrl);
    modules[endpoint] = mod;
    console.log(`  ✓ Módulo carregado com sucesso: ${endpoint}`);
    if (typeof mod.default !== 'function') {
      console.error(`❌ FALHA: ${endpoint} não exporta uma função default como handler.`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`❌ FALHA DE IMPORTAÇÃO em ${endpoint}:`, err);
    process.exit(1);
  }
}

// 4. Teste funcional in-memory dos validadores de segurança sem gravar dados
console.log('\n4. Testando execução em memória dos validadores empacotados (CPF e Arquivo)...');
const enviarMod = modules['api/candidaturas/enviar.js'];

// Teste 4.1: Payload vazio
const r1 = await enviarMod.handleCandidatura({}, '127.0.0.1');
if (r1.statusCode === 400 && r1.data.mensagem.includes('Nome')) {
  console.log('  ✓ Validação de campos obrigatórios funcionando (400 retornado).');
} else {
  console.error('❌ Falha no teste 4.1:', r1);
  process.exit(1);
}

// Teste 4.2: CPF inválido
const r2 = await enviarMod.handleCandidatura({
  nome: 'Teste Auditoria',
  email: 'teste@gigantepneus.com.br',
  telefone: '11999999999',
  consentimento_lgpd: true,
  cpf: '111.111.111-11' // CPF com dígitos repetidos inválido
}, '127.0.0.1');
if (r2.statusCode === 400 && r2.data.mensagem.includes('CPF')) {
  console.log('  ✓ Validador de CPF empacotado funcionando (400 CPF inválido).');
} else {
  console.error('❌ Falha no teste 4.2:', r2);
  process.exit(1);
}

// Teste 4.3: Arquivo inválido (extensão proibida)
const r3 = await enviarMod.handleCandidatura({
  nome: 'Teste Auditoria',
  email: 'teste@gigantepneus.com.br',
  telefone: '11999999999',
  consentimento_lgpd: true,
  cpf: '52998224725', // Formato válido para teste de integridade sintática
  arquivo: {
    nome: 'executavel.exe',
    base64: Buffer.from('conteudo teste').toString('base64')
  }
}, '127.0.0.1');
if (r3.statusCode === 400 && r3.data.mensagem.includes('EXTENSAO_NAO_PERMITIDA')) {
  console.log('  ✓ Validador de arquivo empacotado funcionando (400 EXTENSAO_NAO_PERMITIDA).');
} else {
  console.error('❌ Falha no teste 4.3:', r3);
  process.exit(1);
}

// Teste 4.4: Arquivo com extensão .pdf mas assinatura binária falsa
const r4 = await enviarMod.handleCandidatura({
  nome: 'Teste Auditoria',
  email: 'teste@gigantepneus.com.br',
  telefone: '11999999999',
  consentimento_lgpd: true,
  cpf: '52998224725',
  arquivo: {
    nome: 'curriculo.pdf',
    base64: Buffer.from('conteudo texto falso nao pdf').toString('base64')
  }
}, '127.0.0.1');
if (r4.statusCode === 400 && r4.data.mensagem.includes('CONTEUDO_INVALIDO')) {
  console.log('  ✓ Validação profunda de assinatura binária (Magic Bytes) funcionando.');
} else {
  console.error('❌ Falha no teste 4.4:', r4);
  process.exit(1);
}

console.log('\n=====================================================');
console.log('🎉 TODOS OS TESTES DE EMPACOTAMENTO FORAM APROVADOS!');
console.log('   Nenhum dado real foi gravado ou alterado.');
console.log('=====================================================\n');
