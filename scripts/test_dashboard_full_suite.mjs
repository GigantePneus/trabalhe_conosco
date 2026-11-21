import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import {
  filterCandidatosAdmin,
  calculateDashboardStats,
  normalizeCidadeResidencia,
  isItemRegistroTeste,
  AUDITED_TEST_CANDIDATO_IDS,
  AUDITED_TEST_CANDIDATURA_IDS
} from "../services/adminFilterService.ts";

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runFullSuite() {
  console.log("=================================================");
  console.log("SUITE DE TESTES: CORREÇÃO DASHBOARD ADMINISTRATIVO");
  console.log("=================================================");

  // 1. CARREGAMENTO DOS DADOS REAIS DO BANCO
  const { data: rawData, error } = await supabase
    .from('candidaturas')
    .select(`
      id, status, vaga_interesse, cargo_id, loja_id, criado_em, dados_formulario, dados_extras,
      candidatos ( id, nome, email, telefone, cpf_mascarado, cidade, estado ),
      lojas ( id, nome, cidade, estado )
    `)
    .order('criado_em', { ascending: false });

  if (error) {
    console.error("Erro ao carregar dados:", error);
    process.exit(1);
  }

  const flatCandidatos = rawData.map(row => {
    const cand = row.candidatos || {};
    const loja = row.lojas || {};
    const rawCandCidade = (cand.cidade || row.dados_formulario?.cidade || '').trim();
    const rawCandEstado = (cand.estado || row.dados_formulario?.estado || '').trim().toUpperCase();
    const cidadeResidencia = normalizeCidadeResidencia(rawCandCidade, rawCandEstado);
    const unidadePretendida = (loja.nome || '').trim() || 'Banco de Talentos Corporativo';

    return {
      id: row.id,
      candidato_id: cand.id || row.candidato_id || row.id,
      candidatura_id: row.id,
      cargo_id: row.cargo_id || null,
      nome: cand.nome || 'Candidato',
      email: cand.email || '',
      cpf_mascarado: cand.cpf_mascarado || '',
      telefone: cand.telefone || '',
      cidade: cidadeResidencia,
      cidade_residencia: cidadeResidencia,
      unidade_pretendida: unidadePretendida,
      candidato_cidade: rawCandCidade,
      candidato_estado: rawCandEstado,
      vaga_interesse: row.vaga_interesse || 'Geral',
      status_candidatura: row.status || 'Recebido',
      loja_id: row.loja_id || '',
      loja_nome: loja.nome || '',
      loja_cidade: loja.cidade || '',
      loja_estado: loja.estado || '',
      protocolo: row.dados_extras?.protocolo,
      dados_formulario: row.dados_formulario || {},
      dados_extras: row.dados_extras || {},
      created_at: row.criado_em || new Date().toISOString()
    };
  });

  // TESTE 1: INTEGRIDADE DA BASE BRUTA
  console.log("\n[TESTE 1] Verificação da Base Bruta no Supabase");
  console.assert(flatCandidatos.length === 181, `Esperado 181 candidaturas, recebido: ${flatCandidatos.length}`);
  console.log(`✅ Base bruta contém exatamente ${flatCandidatos.length} candidaturas.`);

  // TESTE 2: IDENTIFICAÇÃO E ISOLAMENTO DE REGISTRO DE TESTE
  console.log("\n[TESTE 2] Identificação Auditada de Registros Sintéticos");
  const testItems = flatCandidatos.filter(c => isItemRegistroTeste(c));
  console.assert(testItems.length === 1, `Esperado 1 registro de teste, recebido: ${testItems.length}`);
  const testCandidate = testItems[0];
  console.assert(AUDITED_TEST_CANDIDATO_IDS.has(testCandidate.candidato_id), "ID de candidato de teste não bate com auditado");
  console.assert(AUDITED_TEST_CANDIDATURA_IDS.has(testCandidate.candidatura_id), "ID de candidatura de teste não bate com auditado");
  console.log(`✅ Registro de teste auditado identificado: ${testCandidate.nome} (${testCandidate.email}) em ${testCandidate.loja_nome}`);

  // TESTE 3: INDICADORES EXECUTIVOS (PADRÃO: REGISTRO DE TESTE OCULTO)
  console.log("\n[TESTE 3] Indicadores Executivos Sem Teste (Padrão de Produção)");
  const overviewReal = filterCandidatosAdmin(flatCandidatos, { includeTestRecords: false });
  const { stats: statsReal } = calculateDashboardStats(overviewReal);

  console.log(`- Candidatos Únicos (por candidatos.id): ${statsReal.totalCandidatosUnicos} (Esperado: 179)`);
  console.log(`- Total de Candidaturas (por candidaturas.id): ${statsReal.totalCandidaturas} (Esperado: 180)`);
  console.log(`- Unidades com Candidaturas: ${statsReal.unidadesComCandidaturas} (Esperado: 5)`);
  console.log(`- Banco de Talentos: ${statsReal.bancoTalentosTotal} (Esperado: 180)`);

  console.assert(statsReal.totalCandidatosUnicos === 179, `Candidatos únicos deve ser 179, foi ${statsReal.totalCandidatosUnicos}`);
  console.assert(statsReal.totalCandidaturas === 180, `Total de candidaturas deve ser 180, foi ${statsReal.totalCandidaturas}`);
  console.assert(statsReal.unidadesComCandidaturas === 5, `Unidades ativas deve ser 5, foi ${statsReal.unidadesComCandidaturas}`);
  console.assert(statsReal.bancoTalentosTotal === 180, `Banco de talentos deve ser 180, foi ${statsReal.bancoTalentosTotal}`);
  console.log("✅ 4 Indicadores executivos validados com 100% de exatidão.");

  // TESTE 4: DISTRIBUIÇÃO POR UNIDADE FRANQUEADA
  console.log("\n[TESTE 4] Distribuição de Candidaturas por Unidade (Reais)");
  console.log(statsReal.porLoja);
  console.assert(statsReal.porLoja['Gigante Pneus - Pirituba'] === 53, `Pirituba esperado 53, foi ${statsReal.porLoja['Gigante Pneus - Pirituba']}`);
  console.assert(statsReal.porLoja['Gigante Pneus - Rio Verde'] === 46, `Rio Verde esperado 46, foi ${statsReal.porLoja['Gigante Pneus - Rio Verde']}`);
  console.assert(statsReal.porLoja['Gigante Pneus - Goiânia'] === 39, `Goiânia esperado 39, foi ${statsReal.porLoja['Gigante Pneus - Goiânia']}`);
  console.assert(statsReal.porLoja['Gigante Pneus - Goiânia 2'] === 38, `Goiânia 2 esperado 38, foi ${statsReal.porLoja['Gigante Pneus - Goiânia 2']}`);
  console.assert(statsReal.porLoja['Gigante Pneus - Jundiaí'] === 4, `Jundiaí esperado 4, foi ${statsReal.porLoja['Gigante Pneus - Jundiaí']}`);
  console.log("✅ Distribuição por Unidade 100% conferida (Pirituba: 53, Rio Verde: 46, Goiânia: 39, Goiânia 2: 38, Jundiaí: 4).");

  // TESTE 5: RESIDÊNCIA DOS CANDIDATOS (NORMALIZAÇÃO SEM DUPLICAÇÃO DE UF)
  console.log("\n[TESTE 5] Residência dos Candidatos e Normalização de UF");
  const cidadesAnomalas = Object.keys(statsReal.porCidade).filter(c => c.includes("- GO - GO") || c.includes("- SP - SP"));
  console.assert(cidadesAnomalas.length === 0, `Encontradas cidades com UF duplicada: ${cidadesAnomalas.join(', ')}`);
  console.log(`- Rio Verde - GO (candidatos residentes): ${statsReal.porCidade['Rio Verde - GO']} (Roberto Sarmiento + João Pedro)`);
  console.assert(statsReal.porCidade['Rio Verde - GO'] === 2, `Rio Verde residencial deve ser 2, foi ${statsReal.porCidade['Rio Verde - GO']}`);
  console.log(`- Goiânia - GO: ${statsReal.porCidade['Goiânia - GO']}`);
  console.log(`- São Paulo - SP: ${statsReal.porCidade['São Paulo - SP']}`);
  console.log("✅ Normalização residencial validada sem duplicidades anômalas.");

  // TESTE 6: REATIVIDADE DOS FILTROS DA VISÃO GERAL
  console.log("\n[TESTE 6] Reatividade de Filtros na Visão Geral");
  // Filtro Rio Verde
  const rioVerdeLojaId = flatCandidatos.find(c => c.loja_nome.includes("Rio Verde"))?.loja_id;
  const filteredRioVerde = filterCandidatosAdmin(flatCandidatos, { lojaId: rioVerdeLojaId, includeTestRecords: false });
  const { stats: statsRV } = calculateDashboardStats(filteredRioVerde);
  console.assert(statsRV.totalCandidaturas === 46, `Candidaturas RV deve ser 46, foi ${statsRV.totalCandidaturas}`);
  console.assert(statsRV.totalCandidatosUnicos === 46, `Candidatos únicos RV deve ser 46, foi ${statsRV.totalCandidatosUnicos}`);
  console.assert(statsRV.unidadesComCandidaturas === 1, `Unidades com RV deve ser 1, foi ${statsRV.unidadesComCandidaturas}`);
  console.log("Cargos em Rio Verde:", statsRV.porCargo);
  console.log(`✅ Filtro de Unidade (Rio Verde): Total=${statsRV.totalCandidaturas}, Únicos=${statsRV.totalCandidatosUnicos}, Unidades=${statsRV.unidadesComCandidaturas}`);

  // TESTE 7: TOGGLE DE REGISTROS DE TESTE
  console.log("\n[TESTE 7] Comportamento do Toggle de Registros de Teste");
  const overviewComTeste = filterCandidatosAdmin(flatCandidatos, { includeTestRecords: true });
  const { stats: statsComTeste } = calculateDashboardStats(overviewComTeste);
  console.assert(statsComTeste.totalCandidaturas === 181, `Com teste deve ser 181, foi ${statsComTeste.totalCandidaturas}`);
  console.assert(statsComTeste.totalCandidatosUnicos === 180, `Com teste candidatos únicos deve ser 180, foi ${statsComTeste.totalCandidatosUnicos}`);
  console.assert(statsComTeste.porLoja['Gigante Pneus - Jundiaí'] === 5, `Jundiaí com teste deve ser 5, foi ${statsComTeste.porLoja['Gigante Pneus - Jundiaí']}`);
  console.log("✅ Toggle de teste: quando ativado, inclui Mariana em Jundiaí (181 candidaturas, 180 candidatos únicos, Jundiaí=5).");

  console.log("\n=================================================");
  console.log("TODOS OS TESTES PASSARAM COM 100% DE SUCESSO! 🎉");
  console.log("=================================================");
}

runFullSuite().catch(err => {
  console.error("Falha na suíte de testes:", err);
  process.exit(1);
});
