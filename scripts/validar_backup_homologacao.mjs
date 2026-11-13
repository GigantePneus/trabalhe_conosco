// ==============================================================================
// VALIDAÇÃO E AUDITORIA PROFUNDA DOS ARQUIVOS DE BACKUP DE HOMOLOGAÇÃO (PROMPT 65)
// ==============================================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';

const backupsDir = path.resolve(process.cwd(), 'backups');
const jsonFile = path.join(backupsDir, 'backup_homologacao_2026-11-13T13-59-40-079Z.json');
const sqlFile = path.join(backupsDir, 'restauracao_homologacao_2026-11-13T13-59-40-079Z.sql');

console.log('==============================================================================');
console.log('AUDITORIA E VALIDAÇÃO DOS ARQUIVOS DE BACKUP DE HOMOLOGAÇÃO');
console.log('==============================================================================\n');

// 1. Existência e Tamanhos
console.log('1. Verificando existência física dos arquivos:');
if (!fs.existsSync(jsonFile) || !fs.existsSync(sqlFile)) {
  console.error('❌ Um ou ambos os arquivos de backup não foram localizados.');
  process.exit(1);
}

const jsonStats = fs.statSync(jsonFile);
const sqlStats = fs.statSync(sqlFile);

console.log(`  ✓ JSON: ${jsonFile} (${(jsonStats.size / 1024).toFixed(2)} KB)`);
console.log(`  ✓ SQL:  ${sqlFile} (${(sqlStats.size / 1024).toFixed(2)} KB)`);

// 2. Hashes SHA-256 dos Arquivos
console.log('\n2. Gerando Hashes SHA-256 de Integridade Criptográfica:');
const jsonBuffer = fs.readFileSync(jsonFile);
const sqlBuffer = fs.readFileSync(sqlFile);

const jsonHash = crypto.createHash('sha256').update(jsonBuffer).digest('hex');
const sqlHash = crypto.createHash('sha256').update(sqlBuffer).digest('hex');

console.log(`  • SHA-256 (JSON): ${jsonHash}`);
console.log(`  • SHA-256 (SQL):  ${sqlHash}`);

// 3. Validação Estrutural e Contagens no JSON
console.log('\n3. Validando estrutura de dados e integridade do manifesto JSON:');
const jsonData = JSON.parse(jsonBuffer.toString('utf-8'));

const totais = jsonData.metadata?.totais || {};
console.log(`  • Candidatos: ${totais.candidatos} (Esperado: 6)`);
console.log(`  • Candidaturas: ${totais.candidaturas} (Esperado: 8)`);
console.log(`  • Currículos: ${totais.curriculos} (Esperado: 6)`);
console.log(`  • Logs de Acesso: ${totais.logs_acesso_curriculos} (Esperado: 8)`);
console.log(`  • Upload Transações: ${totais.upload_transacoes} (Esperado: 13)`);
console.log(`  • Arquivos Google Drive no Manifesto: ${totais.arquivos_reais_google_drive} (Esperado: 4)`);

assert.strictEqual(totais.candidatos, 6);
assert.strictEqual(totais.candidaturas, 8);
assert.strictEqual(totais.curriculos, 6);
assert.strictEqual(totais.logs_acesso_curriculos, 8);
assert.strictEqual(totais.upload_transacoes, 13);
assert.strictEqual(totais.arquivos_reais_google_drive, 4);
console.log('  ✓ Todas as contagens conferem rigorosamente com o inventário.');

// 4. Integridade Relacional e Chaves Estrangeiras
console.log('\n4. Verificando integridade relacional entre as tabelas:');
const candIds = new Set(jsonData.tabelas.candidatos.map(c => c.id));
const currIds = new Set(jsonData.tabelas.candidato_curriculos.map(c => c.id));

// Todas as candidaturas apontam para candidatos existentes
for (const cand of jsonData.tabelas.candidaturas) {
  assert.ok(candIds.has(cand.candidato_id), `Candidatura ${cand.id} aponta para candidato inexistente ${cand.candidato_id}`);
  if (cand.curriculo_id) {
    assert.ok(currIds.has(cand.curriculo_id), `Candidatura ${cand.id} aponta para currículo inexistente ${cand.curriculo_id}`);
  }
}
console.log('  ✓ FKs de candidaturas -> candidatos e candidaturas -> curriculos são 100% íntegras.');

// 5. Verificação Sintática do Script SQL de Restauração
console.log('\n5. Verificando sintaxe e estrutura transacional do script SQL:');
const sqlText = sqlBuffer.toString('utf-8');

assert.ok(sqlText.startsWith('-- =============================================================================='), 'Cabeçalho SQL presente');
assert.ok(sqlText.includes('BEGIN;'), 'Transação BEGIN presente');
assert.ok(sqlText.endsWith('COMMIT;\n') || sqlText.includes('COMMIT;'), 'Transação COMMIT presente');

// Ordem estrita de restauração (Candidatos primeiro, depois Curriculos, depois Candidaturas, depois Logs e Uploads)
const posCandidatos = sqlText.indexOf('INSERT INTO public.candidatos');
const posCurriculos = sqlText.indexOf('INSERT INTO public.candidato_curriculos');
const posCandidaturas = sqlText.indexOf('INSERT INTO public.candidaturas');
const posLogs = sqlText.indexOf('INSERT INTO public.logs_acesso_curriculos');
const posUploads = sqlText.indexOf('INSERT INTO public.upload_transacoes');

assert.ok(posCandidatos > 0 && posCandidatos < posCurriculos, 'Candidatos inseridos antes de Currículos');
assert.ok(posCurriculos < posCandidaturas, 'Currículos inseridos antes de Candidaturas');
assert.ok(posCandidaturas < posLogs, 'Candidaturas inseridas antes de Logs');
assert.ok(posLogs < posUploads, 'Logs inseridos antes de Uploads');
console.log('  ✓ Ordem topológica de restauração (respeito a Foreign Keys) perfeitamente validada.');

// 6. Manifesto do Google Drive
console.log('\n6. Auditoria dos Documentos no Google Drive:');
const driveManifest = jsonData.arquivos_google_drive || [];
console.log(`  • Arquivos reais mapeados: ${driveManifest.length}`);
for (const f of driveManifest) {
  console.log(`    - ID: ${f.google_drive_file_id} | Nome: ${f.nome_arquivo} | Tamanho: ${(f.tamanho_bytes / 1024).toFixed(1)} KB`);
}

// 7. Verificação de Gitignore
console.log('\n7. Verificando se os backups estão ignorados pelo Git:');
const gitignoreContent = fs.readFileSync(path.resolve(process.cwd(), '.gitignore'), 'utf-8');
assert.ok(gitignoreContent.includes('backups/'), '.gitignore contém backups/');
console.log('  ✓ Diretório backups/ protegido e ignorado pelo Git.');

console.log('\n==============================================================================');
console.log('STATUS DA VALIDAÇÃO DO BACKUP:');
console.log('BACKUP GERADO — ESTRUTURA E RELACIONAMENTOS VALIDADOS COM SUCESSO');
console.log('Classificação formal: BACKUP GERADO — RESTAURAÇÃO NÃO TESTADA EM SERVIDOR DEDICADO');
console.log('==============================================================================');
