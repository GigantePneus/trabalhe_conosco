// ==============================================================================
// GERADOR DE BACKUP REAL E RECUPERÁVEL DE HOMOLOGAÇÃO
// PROJETO: Trabalhe Conosco — Gigante Pneus Multi-Lojas
// ==============================================================================

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match) {
      process.env[match[1]] = match[2].trim().replace(/^["'](.*)["']$/, '$1');
    }
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://hidayzojjztfyuefmknz.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error('❌ Chave de serviço (SUPABASE_SERVICE_ROLE_KEY) não configurada.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false }
});

async function main() {
  console.log('--- Iniciando Extração Segura de Dados de Homologação ---');

  const { data: candidatos, error: errCand } = await supabase.from('candidatos').select('*').order('criado_em');
  if (errCand) throw errCand;

  const { data: curriculos, error: errCurr } = await supabase.from('candidato_curriculos').select('*').order('criado_em');
  if (errCurr) throw errCurr;

  const { data: candidaturas, error: errCands } = await supabase.from('candidaturas').select('*').order('criado_em');
  if (errCands) throw errCands;

  const { data: logs, error: errLogs } = await supabase.from('logs_acesso_curriculos').select('*').order('criado_em');
  if (errLogs) throw errLogs;

  const { data: transacoes, error: errTrans } = await supabase.from('upload_transacoes').select('*').order('criado_em');
  if (errTrans) throw errTrans;

  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupJsonPath = path.join(backupDir, `backup_homologacao_${timestamp}.json`);
  const backupSqlPath = path.join(backupDir, `restauracao_homologacao_${timestamp}.sql`);

  // Arquivos reais do Google Drive identificados
  const realDriveFiles = curriculos
    .filter(c => c.google_drive_file_id && !c.google_drive_file_id.startsWith('mock_') && !c.google_drive_file_id.startsWith('gdrive_file_'))
    .map(c => ({
      curriculo_id: c.id,
      candidato_id: c.candidato_id,
      google_drive_file_id: c.google_drive_file_id,
      google_drive_folder_id: c.google_drive_folder_id,
      nome_arquivo: c.nome_arquivo,
      tamanho_bytes: c.tamanho_bytes
    }));

  const backupPayload = {
    metadata: {
      origem: 'Supabase Oficial Gigante Pneus (hidayzojjztfyuefmknz)',
      ambiente: 'Homologação Pré-V1',
      gerado_em: new Date().toISOString(),
      totais: {
        candidatos: candidatos.length,
        curriculos: curriculos.length,
        candidaturas: candidaturas.length,
        logs_acesso_curriculos: logs.length,
        upload_transacoes: transacoes.length,
        arquivos_reais_google_drive: realDriveFiles.length
      }
    },
    arquivos_google_drive: realDriveFiles,
    tabelas: {
      candidatos,
      candidato_curriculos: curriculos,
      candidaturas,
      logs_acesso_curriculos: logs,
      upload_transacoes: transacoes
    }
  };

  fs.writeFileSync(backupJsonPath, JSON.stringify(backupPayload, null, 2), 'utf-8');
  console.log(`✅ Backup JSON gerado com sucesso: ${backupJsonPath}`);

  // Gerar Script SQL de Restauração Idempotente
  let sqlScript = `-- ==============================================================================
-- SCRIPT DE RESTAURAÇÃO DOS DADOS DE HOMOLOGAÇÃO
-- Gerado em: ${new Date().toISOString()}
-- Total Candidatos: ${candidatos.length} | Candidaturas: ${candidaturas.length}
-- ==============================================================================

BEGIN;

`;

  // Insert Candidatos
  for (const c of candidatos) {
    sqlScript += `INSERT INTO public.candidatos (id, nome, email, cpf_hash, cpf_mascarado, cpf_criptografado, telefone, cidade, estado, escolaridade, linkedin_url, aceita_outras_vagas, consentimento_lgpd, consentimento_versao, consentimento_em, retencao_meses, retencao_ate, origem, criado_em, atualizado_em)
VALUES ('${c.id}', ${escapeSql(c.nome)}, ${escapeSql(c.email)}, ${escapeSql(c.cpf_hash)}, ${escapeSql(c.cpf_mascarado)}, ${escapeSql(c.cpf_criptografado)}, ${escapeSql(c.telefone)}, ${escapeSql(c.cidade)}, ${escapeSql(c.estado)}, ${escapeSql(c.escolaridade)}, ${escapeSql(c.linkedin_url)}, ${c.aceita_outras_vagas ? 'true' : 'false'}, ${c.consentimento_lgpd ? 'true' : 'false'}, ${escapeSql(c.consentimento_versao)}, '${c.consentimento_em}', ${c.retencao_meses}, '${c.retencao_ate}', ${escapeSql(c.origem)}, '${c.criado_em}', '${c.atualizado_em}')
ON CONFLICT (id) DO NOTHING;\n\n`;
  }

  // Insert Curriculos
  for (const curr of curriculos) {
    sqlScript += `INSERT INTO public.candidato_curriculos (id, candidato_id, google_drive_file_id, google_drive_folder_id, nome_arquivo, mime_type, tamanho_bytes, md5_checksum, upload_status, criado_em)
VALUES ('${curr.id}', ${curr.candidato_id ? `'${curr.candidato_id}'` : 'NULL'}, ${escapeSql(curr.google_drive_file_id)}, ${escapeSql(curr.google_drive_folder_id)}, ${escapeSql(curr.nome_arquivo)}, ${escapeSql(curr.mime_type)}, ${curr.tamanho_bytes || 'NULL'}, ${escapeSql(curr.md5_checksum)}, ${escapeSql(curr.upload_status)}, '${curr.criado_em}')
ON CONFLICT (id) DO NOTHING;\n\n`;
  }

  // Insert Candidaturas
  for (const cand of candidaturas) {
    sqlScript += `INSERT INTO public.candidaturas (id, candidato_id, cargo_id, loja_id, curriculo_id, vaga_interesse, status, observacoes_operacionais, pontuacao_ia, resumo_ia, parecer_ia, classificacao_ia, habilidades_identificadas, dados_formulario, dados_extras, criado_em, atualizado_em)
VALUES ('${cand.id}', '${cand.candidato_id}', ${cand.cargo_id ? `'${cand.cargo_id}'` : 'NULL'}, ${cand.loja_id ? `'${cand.loja_id}'` : 'NULL'}, ${cand.curriculo_id ? `'${cand.curriculo_id}'` : 'NULL'}, ${escapeSql(cand.vaga_interesse)}, ${escapeSql(cand.status)}, ${escapeSql(cand.observacoes_operacionais)}, ${cand.pontuacao_ia || 0}, ${escapeSql(cand.resumo_ia)}, ${escapeSql(cand.parecer_ia)}, ${escapeSql(cand.classificacao_ia)}, '${JSON.stringify(cand.habilidades_identificadas || []).replace(/'/g, "''")}'::jsonb, '${JSON.stringify(cand.dados_formulario || {}).replace(/'/g, "''")}'::jsonb, '${JSON.stringify(cand.dados_extras || {}).replace(/'/g, "''")}'::jsonb, '${cand.criado_em}', '${cand.atualizado_em}')
ON CONFLICT (id) DO NOTHING;\n\n`;
  }

  // Insert Logs Acesso
  for (const log of logs) {
    sqlScript += `INSERT INTO public.logs_acesso_curriculos (id, candidato_id, curriculo_id, candidato_email_hash, google_drive_file_id, usuario_id, usuario_role, ip_origem, user_agent, motivo_acesso, criado_em)
VALUES ('${log.id}', ${log.candidato_id ? `'${log.candidato_id}'` : 'NULL'}, ${log.curriculo_id ? `'${log.curriculo_id}'` : 'NULL'}, ${escapeSql(log.candidato_email_hash)}, ${escapeSql(log.google_drive_file_id)}, ${log.usuario_id ? `'${log.usuario_id}'` : 'NULL'}, ${escapeSql(log.usuario_role)}, ${escapeSql(log.ip_origem)}, ${escapeSql(log.user_agent)}, ${escapeSql(log.motivo_acesso)}, '${log.criado_em}')
ON CONFLICT (id) DO NOTHING;\n\n`;
  }

  // Insert Upload Transacoes
  for (const t of transacoes) {
    sqlScript += `INSERT INTO public.upload_transacoes (id, sessao_token_hash, google_drive_file_id, google_drive_folder_id, nome_arquivo, mime_type, tamanho_bytes, status, tentativas_reconciliacao, erro_reconciliacao, ip_origem, expira_em, criado_em, concluido_em)
VALUES ('${t.id}', ${escapeSql(t.sessao_token_hash)}, ${escapeSql(t.google_drive_file_id)}, ${escapeSql(t.google_drive_folder_id)}, ${escapeSql(t.nome_arquivo)}, ${escapeSql(t.mime_type)}, ${t.tamanho_bytes || 'NULL'}, ${escapeSql(t.status)}, ${t.tentativas_reconciliacao || 0}, ${escapeSql(t.erro_reconciliacao)}, ${escapeSql(t.ip_origem)}, '${t.expira_em}', '${t.criado_em}', ${t.concluido_em ? `'${t.concluido_em}'` : 'NULL'})
ON CONFLICT (id) DO NOTHING;\n\n`;
  }

  sqlScript += `COMMIT;\n`;

  fs.writeFileSync(backupSqlPath, sqlScript, 'utf-8');
  console.log(`✅ Script SQL de Restauração gerado: ${backupSqlPath}`);

  console.log('\n--- Resumo do Backup ---');
  console.log(`Candidatos: ${candidatos.length}`);
  console.log(`Candidaturas: ${candidaturas.length}`);
  console.log(`Currículos: ${curriculos.length}`);
  console.log(`Logs de Acesso: ${logs.length}`);
  console.log(`Transações de Upload: ${transacoes.length}`);
  console.log(`Arquivos no Google Drive: ${realDriveFiles.length}`);
}

function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

main().catch(err => {
  console.error('Erro na extração de backup:', err);
  process.exit(1);
});
