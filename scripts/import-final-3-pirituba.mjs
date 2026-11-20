import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import { handleImportarCurriculoDrive, handleVincularCandidatoLoja } from '../api/admin/candidatos.js';
import { handleVisualizarCurriculo } from '../api/curriculos/visualizar.js';
import { toCanonicalCargo } from '../services/cargoEquivalenceService.ts';

dotenv.config({ path: '.env.local' });

const supaUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

const adminSupabase = createClient(supaUrl, serviceKey);
const anonSupabase = createClient(supaUrl, anonKey);

const UNIDADE_PIRITUBA_ID = 'a5486659-5d74-4bf8-9d0d-55032376198a';
const UNIDADE_PIRITUBA_NOME = 'Gigante Pneus - Pirituba';

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

const candidatesToImport = [
  {
    nome: 'Renato Muniz dos Santos',
    email: 'renatomuniz.santos@gmail.com',
    telefone: '11992855920',
    cidade: 'São Paulo',
    estado: 'SP',
    escolaridade: 'Superior Incompleto',
    profissaoIdentificada: 'Almoxarife / Conferente',
    cargoPretendido: 'Estoquista', // toCanonicalCargo('Almoxarife / Conferente')
    driveOrigemId: '1jxaaN7pkO_264aFRgLgr3BgnMW1zCvFv',
    nomeArquivo: 'RENATO MUNIZ DOS SANTOS.pdf',
    ext: 'pdf',
    tipoMime: 'application/pdf',
    localFile: 'scripts/RENATO MUNIZ DOS SANTOS.pdf'
  },
  {
    nome: 'Ricardo Leite de Barros',
    email: 'ricardo.leite.de.barros@candidato.gigantepneus.com.br',
    telefone: '11978860299',
    cidade: 'São Paulo',
    estado: 'SP',
    escolaridade: 'Ensino Médio Completo',
    profissaoIdentificada: 'Alinhador e Mecânico de Suspensão',
    cargoPretendido: 'Alinhador Automotivo', // toCanonicalCargo('Alinhador e Mecânico de Suspensão')
    driveOrigemId: '1TGFijlKgq15jVTE2nEf-7SezxcgK7e-8',
    nomeArquivo: 'Ricardo.jpeg',
    ext: 'jpeg',
    tipoMime: 'image/jpeg',
    localFile: 'scripts/Ricardo.jpeg'
  },
  {
    nome: 'Zeus Carlos de Sá',
    email: 'zeusthormiorni20@gmail.com',
    telefone: '11964118339',
    cidade: 'São Paulo',
    estado: 'SP',
    escolaridade: 'Ensino Médio Completo',
    profissaoIdentificada: 'Auxiliar de Mecânico Automotivo',
    cargoPretendido: 'Auxiliar de Pátio / Auxiliar de Mecânico', // toCanonicalCargo('Auxiliar de Mecânico Automotivo')
    driveOrigemId: '1UkmroZiu9yDVr91llgF_wof_eq4WO0bU',
    nomeArquivo: 'Zeus Carlos deSá.pdf',
    ext: 'pdf',
    tipoMime: 'application/pdf',
    localFile: 'scripts/Zeus Carlos deSá.pdf'
  }
];

async function run() {
  console.log(`==============================================================================`);
  console.log(`🚀 IMPORTAÇÃO FINAL DOS 3 CURRÍCULOS PENDENTES - PIRITUBA`);
  console.log(`Unidade: ${UNIDADE_PIRITUBA_NOME} (${UNIDADE_PIRITUBA_ID})`);
  console.log(`==============================================================================\n`);

  const token = await getMasterToken();
  console.log('✅ Token Master obtido com sucesso!');

  const report = [];

  for (let i = 0; i < candidatesToImport.length; i++) {
    const item = candidatesToImport[i];
    console.log(`\n------------------------------------------------------------------------------`);
    console.log(`[${i + 1}/3] Processando: "${item.nome}"`);
    console.log(`Arquivo: "${item.nomeArquivo}" (Origem ID: ${item.driveOrigemId})`);
    console.log(`Profissão Identificada: "${item.profissaoIdentificada}"`);
    console.log(`Cargo Canônico: "${item.cargoPretendido}"`);

    // 1. Validar / ler buffer local
    if (!fs.existsSync(item.localFile)) {
      throw new Error(`Arquivo não encontrado: ${item.localFile}`);
    }
    const fileBuffer = fs.readFileSync(item.localFile);
    const md5Hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
    console.log(`Tamanho local: ${fileBuffer.length} bytes | MD5: ${md5Hash}`);

    // 2. Checar duplicidade de candidato no Supabase
    const { data: candExistente } = await adminSupabase
      .from('candidatos')
      .select('id, nome, email, telefone')
      .or(`email.eq.${item.email},telefone.eq.${item.telefone}`)
      .maybeSingle();

    let candidatoId;
    if (candExistente) {
      candidatoId = candExistente.id;
      console.log(`⚠️ Candidato já existe no Supabase (ID: ${candidatoId}). Reaproveitando.`);
    } else {
      const slug = item.nome.toLowerCase().replace(/[^a-z0-9]/g, '.');
      const cpfPlaceholder = crypto.createHash('sha256').update(slug + '-pirituba-final').digest('hex');
      const { data: novoCand, error: candErr } = await adminSupabase
        .from('candidatos')
        .insert({
          nome: item.nome,
          email: item.email,
          telefone: item.telefone,
          cidade: item.cidade,
          estado: item.estado,
          escolaridade: item.escolaridade,
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

      if (candErr) throw new Error(`Erro ao cadastrar candidato: ${candErr.message}`);
      candidatoId = novoCand.id;
      console.log(`✅ Novo candidato inserido com sucesso! ID: ${candidatoId}`);
    }

    // 3. Executar handleImportarCurriculoDrive
    console.log(`Executando handleImportarCurriculoDrive (conversão se aplicável)...`);
    const importRes = await handleImportarCurriculoDrive({
      candidatoId: candidatoId,
      arquivoBase64: fileBuffer.toString('base64'),
      nomeArquivo: item.nomeArquivo,
      tipoMime: item.tipoMime,
      lojaId: UNIDADE_PIRITUBA_ID,
      cargo: item.cargoPretendido
    }, token);

    if (importRes.statusCode !== 200 && importRes.statusCode !== 201) {
      throw new Error(`Erro na importação do currículo: ${JSON.stringify(importRes.data)}`);
    }

    const curriculoId = importRes.data.curriculo_id;
    const convertidoPdf = !!importRes.data.convertido_para_pdf;
    const driveFileId = importRes.data.google_drive_file_id || importRes.data.nome_arquivo;
    console.log(`✅ Currículo importado no Drive! ID: ${curriculoId} | Convertido PDF: ${convertidoPdf} | Drive File ID: ${driveFileId}`);

    // 4. Vincular formalmente ao Banco de Talentos de Pirituba
    console.log(`Vinculando ao Banco de Talentos de Pirituba (${item.cargoPretendido})...`);
    const vincRes = await handleVincularCandidatoLoja({
      candidatoId: candidatoId,
      lojaId: UNIDADE_PIRITUBA_ID,
      cargoPretendido: item.cargoPretendido,
      apresentacaoPessoal: `Candidato importado da migração de Pirituba (${item.profissaoIdentificada}).`
    }, token);

    if (vincRes.statusCode !== 200 && vincRes.statusCode !== 201) {
      throw new Error(`Erro ao vincular à unidade: ${JSON.stringify(vincRes.data)}`);
    }

    const candidaturaId = vincRes.data.candidatura_id;
    console.log(`✅ Candidatura vinculada com sucesso! ID: ${candidaturaId}`);

    // 5. Testar endpoint de visualização do currículo
    console.log(`Validando abertura do PDF via handleVisualizarCurriculo...`);
    const viewRes = await handleVisualizarCurriculo({
      curriculoId: curriculoId,
      token: token
    });

    const viewOk = viewRes.statusCode === 200 && viewRes.buffer && viewRes.buffer.length > 0;
    console.log(`Visualização PDF: Status ${viewRes.statusCode} | Buffer: ${viewRes.buffer?.length || 0} bytes | MIME: ${viewRes.mimeType} | Sucesso: ${viewOk ? 'SIM ✅' : 'NÃO ❌'}`);

    report.push({
      nome: item.nome,
      profissaoOriginal: item.profissaoIdentificada,
      cargoCanonico: item.cargoPretendido,
      arquivoOriginal: item.nomeArquivo,
      convertidoPdf,
      candidatoId,
      candidaturaId,
      curriculoId,
      driveFileId,
      visualizacaoStatus: viewRes.statusCode,
      visualizacaoBytes: viewRes.buffer?.length || 0,
      visualizacaoMime: viewRes.mimeType,
      visualizacaoSucesso: viewOk
    });
  }

  // Salvar relatório consolidado
  fs.writeFileSync('scripts/relatorio_importacao_final_pirituba.json', JSON.stringify(report, null, 2));
  console.log('\n==============================================================================');
  console.log('🎉 IMPORTAÇÃO DOS 3 ARQUIVOS CONCLUÍDA COM SUCESSO!');
  console.log('Relatório salvo em scripts/relatorio_importacao_final_pirituba.json');
  console.log('==============================================================================\n');
  console.log(JSON.stringify(report, null, 2));
}

run().catch(err => {
  console.error('❌ Falha na importação:', err);
  process.exit(1);
});
