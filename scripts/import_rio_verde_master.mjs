import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import { handleImportarCurriculoDrive, handleVincularCandidatoLoja } from '../api/admin/candidatos.js';
import { handleVisualizarCurriculo } from '../api/curriculos/visualizar.js';

dotenv.config({ path: '.env.local' });

const supaUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

const adminSupabase = createClient(supaUrl, serviceKey);
const anonSupabase = createClient(supaUrl, anonKey);

const UNIDADE_RIO_VERDE_ID = '8e875780-e672-4c0a-91d6-c91651d888b8';
const UNIDADE_RIO_VERDE_NOME = 'Gigante Pneus - Rio Verde';
const EMAIL_PADRAO_SEM_CONTATO = 'naotem@naotem.com';

async function getMasterToken() {
  const { data: linkAdmin, error: linkErr } = await adminSupabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'mktgigantepneus@gmail.com'
  });
  if (linkErr) throw new Error(`Falha ao gerar link OTP: ${linkErr.message}`);

  const { data: sessionAdmin, error: authErr } = await anonSupabase.auth.verifyOtp({
    email: 'mktgigantepneus@gmail.com',
    token: linkAdmin.properties.email_otp,
    type: 'magiclink'
  });
  if (authErr) throw new Error(`Falha ao verificar OTP: ${authErr.message}`);

  const token = sessionAdmin?.session?.access_token;
  if (!token) throw new Error('Falha ao obter token Master');
  return token;
}

export async function runRioVerdeImport({ dryRun = true } = {}) {
  console.log(`==============================================================================`);
  console.log(`🚀 IMPORTAÇÃO OFICIAL - ${UNIDADE_RIO_VERDE_NOME} (${UNIDADE_RIO_VERDE_ID})`);
  console.log(`Modo: ${dryRun ? 'DRY-RUN (SIMULAÇÃO SEM GRAVAÇÃO)' : 'PRODUÇÃO ATIVA'}`);
  console.log(`==============================================================================\n`);

  const candidates = JSON.parse(fs.readFileSync('scripts/rio_verde_candidates_with_naotem_rule.json', 'utf-8'));
  const inv = JSON.parse(fs.readFileSync('scripts/rio_verde_inventory_hashed.json', 'utf-8'));

  console.log(`Total de candidatos únicos para importar: ${candidates.length}`);

  if (dryRun) {
    console.log('✅ Validação do plano concluída em modo seguro (Dry-run). Nenhuma gravação efetuada.');
    return { success: true, dryRun: true, total: candidates.length };
  }

  // Se for produção real, executa
  const token = await getMasterToken();
  const report = [];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const fileItem = inv.find(item => item.index === c.index);

    console.log(`\n[${i + 1}/${candidates.length}] Processando: ${c.nome} (${c.cargo})`);
    console.log(`   E-mail: ${c.email} | Telefone: ${c.telefone || 'PENDENTE'}`);

    // 1. Checar duplicidade (REGRA 6: IGNORAR naotem@naotem.com como chave de duplicidade!)
    let candExistente = null;

    if (c.email && c.email !== EMAIL_PADRAO_SEM_CONTATO) {
      const { data } = await adminSupabase
        .from('candidatos')
        .select('id, nome, email, telefone')
        .eq('email', c.email)
        .maybeSingle();
      candExistente = data;
    }

    if (!candExistente && c.telefone && c.telefone !== 'PENDENTE') {
      const { data } = await adminSupabase
        .from('candidatos')
        .select('id, nome, email, telefone')
        .eq('telefone', c.telefone)
        .maybeSingle();
      candExistente = data;
    }

    let candidatoId;
    if (candExistente) {
      candidatoId = candExistente.id;
      console.log(`   ⚠️ Candidato já existente no Supabase (ID: ${candidatoId}, Nome: ${candExistente.nome}). Reaproveitando SEM sobrescrever dados.`);
    } else {
      const slug = c.nome.toLowerCase().replace(/[^a-z0-9]/g, '.');
      const seed = c.email === EMAIL_PADRAO_SEM_CONTATO
        ? `${slug}-${c.telefone || 'semtel'}-rioverde-2026`
        : `${c.email}-rioverde-2026`;
      const cpfPlaceholder = crypto.createHash('sha256').update(seed).digest('hex');

      const { data: novoCand, error: candErr } = await adminSupabase
        .from('candidatos')
        .insert({
          nome: c.nome,
          email: c.email,
          telefone: c.telefone ? c.telefone.trim() : null,
          cidade: c.cidade ? c.cidade.split(' - ')[0] : 'Rio Verde',
          estado: 'GO',
          escolaridade: 'Não informada',
          cpf_hash: cpfPlaceholder,
          cpf_mascarado: 'CPF Pendente',
          origem: 'migracao_drive',
          aceita_outras_vagas: true,
          consentimento_lgpd: true,
          consentimento_versao: 'mcp-migracao-2026',
          retencao_meses: 12,
          retencao_ate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single();

      if (candErr) throw new Error(`Erro ao cadastrar candidato ${c.nome}: ${candErr.message}`);
      candidatoId = novoCand.id;
      console.log(`   ✅ Novo candidato inserido no banco! ID: ${candidatoId}`);
    }

    // 2. Anexar Currículo via MCP / handleImportarCurriculoDrive
    const fileBuffer = fs.readFileSync(fileItem.localPath);
    const mimeType = fileItem.ext === 'jpeg' ? 'image/jpeg' : 'application/pdf';

    const importRes = await handleImportarCurriculoDrive({
      candidatoId: candidatoId,
      arquivoBase64: fileBuffer.toString('base64'),
      nomeArquivo: fileItem.name,
      tipoMime: mimeType,
      lojaId: UNIDADE_RIO_VERDE_ID,
      cargo: c.cargo
    }, token);

    if (importRes.statusCode !== 200 && importRes.statusCode !== 201) {
      throw new Error(`Erro na importação do currículo de ${c.nome}: ${JSON.stringify(importRes.data)}`);
    }

    const curriculoId = importRes.data.curriculo_id;

    // 3. Vincular Candidatura ao Banco de Talentos de Rio Verde
    const vincRes = await handleVincularCandidatoLoja({
      candidatoId: candidatoId,
      lojaId: UNIDADE_RIO_VERDE_ID,
      cargoPretendido: c.cargo,
      apresentacaoPessoal: `Candidato importado do acervo histórico de Rio Verde (${c.cargo}).`
    }, token);

    if (vincRes.statusCode !== 200 && vincRes.statusCode !== 201) {
      throw new Error(`Erro ao vincular candidatura de ${c.nome}: ${JSON.stringify(vincRes.data)}`);
    }

    report.push({
      candidatoId,
      nome: c.nome,
      email: c.email,
      telefone: c.telefone,
      cargo: c.cargo,
      curriculoId,
      candidaturaId: vincRes.data.candidatura_id
    });
  }

  fs.writeFileSync('scripts/relatorio_importacao_final_rio_verde.json', JSON.stringify(report, null, 2));
  console.log('\n🎉 IMPORTAÇÃO DE RIO VERDE CONCLUÍDA COM SUCESSO!');
  return { success: true, total: report.length };
}

// Se rodado diretamente, executa em dryRun por padrão de segurança
if (process.argv[1]?.endsWith('import_rio_verde_master.mjs')) {
  runRioVerdeImport({ dryRun: true }).catch(console.error);
}
