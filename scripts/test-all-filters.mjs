import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { filterCandidatosAdmin, getUniqueCargos } from '../services/adminFilterService.js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PIRITUBA_ID = 'a5486659-5d74-4bf8-9d0d-55032376198a';
const GOIANIA_1_ID = '5cfb824e-7031-4ea0-94ae-a464f6332091';
const GOIANIA_2_ID = '1cbb63f7-0e2f-4042-a56d-245479cfa1b0';
const JUNDIAI_ID = 'eaacf2ee-4bdb-4b0a-ae4a-474389330175';

async function testAllFilters() {
  console.log('=== TESTE DE HOMOLOGAÇÃO DOS FILTROS DO BANCO DE TALENTOS ===\n');

  // Carrega candidaturas no mesmo formato do AdminDashboard
  const { data: rows, error: qErr } = await supabase
    .from('candidaturas')
    .select(`
      id,
      cargo_id,
      vaga_interesse,
      status,
      loja_id,
      criado_em,
      candidatos (id, nome, email, telefone, cidade, estado, cpf_mascarado, escolaridade, aceita_outras_vagas),
      lojas (id, nome, cidade, estado),
      candidato_curriculos (id, nome_arquivo, google_drive_file_id, tamanho_bytes)
    `);

  if (qErr) throw qErr;

  const { data: cargosRes } = await supabase
    .from('cargos')
    .select('id, titulo, loja_id');

  const items = rows.map(r => ({
    id: r.id,
    candidatura_id: r.id,
    candidato_id: r.candidatos?.id,
    nome: r.candidatos?.nome || '',
    email: r.candidatos?.email || '',
    telefone: r.candidatos?.telefone || '',
    cpf_mascarado: r.candidatos?.cpf_mascarado || '',
    cidade: r.candidatos?.cidade || '',
    cidade_residencia: r.candidatos?.cidade || '',
    unidade_pretendida: r.lojas?.nome || '',
    vaga_interesse: r.vaga_interesse || '',
    status_candidatura: r.status || '',
    loja_id: r.loja_id,
    loja_nome: r.lojas?.nome,
    cargo_id: r.cargo_id,
    created_at: r.criado_em,
    possui_curriculo: Boolean(r.candidato_curriculos?.[0]?.google_drive_file_id || r.candidato_curriculos?.google_drive_file_id)
  }));

  // 1. Testa Dropdown de Cargos Únicos
  const btCargos = items.map(i => i.vaga_interesse).filter(Boolean);
  const uniqueCargos = getUniqueCargos(cargosRes || [], btCargos);
  console.log('Cargos únicos no dropdown:', uniqueCargos.map(c => c.titulo));
  const hasBorracheiroInDropdown = uniqueCargos.some(c => c.titulo === 'Borracheiro');
  console.log(`Borracheiro presente no dropdown? ${hasBorracheiroInDropdown ? 'SIM (OK)' : 'NÃO (FALHA)'}\n`);

  // 2. Bateria de Testes Estruturados
  const testCases = [
    // Pirituba
    { lojaId: PIRITUBA_ID, lojaNome: 'Pirituba', cargo: '', esperado: 50, desc: 'Todos os cargos' },
    { lojaId: PIRITUBA_ID, lojaNome: 'Pirituba', cargo: 'Mecânico Automotivo', esperado: 9, desc: 'Mecânico Automotivo' },
    { lojaId: PIRITUBA_ID, lojaNome: 'Pirituba', cargo: 'Alinhador Automotivo', esperado: 1, desc: 'Alinhador Automotivo' },
    { lojaId: PIRITUBA_ID, lojaNome: 'Pirituba', cargo: 'Auxiliar de Pátio / Auxiliar de Mecânico', esperado: 18, desc: 'Auxiliar de Pátio / Auxiliar de Mecânico' },
    { lojaId: PIRITUBA_ID, lojaNome: 'Pirituba', cargo: 'Estoquista', esperado: 19, desc: 'Estoquista' },
    { lojaId: PIRITUBA_ID, lojaNome: 'Pirituba', cargo: 'Borracheiro', esperado: 3, desc: 'Borracheiro' },
    { lojaId: PIRITUBA_ID, lojaNome: 'Pirituba', cargo: 'espontanea', esperado: 0, desc: 'Candidatura Espontânea (deve ser 0)' },

    // Goiânia 1
    { lojaId: GOIANIA_1_ID, lojaNome: 'Goiânia 1', cargo: '', esperado: 39, desc: 'Todos os cargos' },
    { lojaId: GOIANIA_1_ID, lojaNome: 'Goiânia 1', cargo: 'Mecânico Automotivo', esperado: 4, desc: 'Mecânico Automotivo' },
    { lojaId: GOIANIA_1_ID, lojaNome: 'Goiânia 1', cargo: 'Recepcionista de Centro Automotivo', esperado: 18, desc: 'Recepcionista de Centro Automotivo' },
    { lojaId: GOIANIA_1_ID, lojaNome: 'Goiânia 1', cargo: 'Consultor de Vendas', esperado: 17, desc: 'Consultor de Vendas' },
    { lojaId: GOIANIA_1_ID, lojaNome: 'Goiânia 1', cargo: 'espontanea', esperado: 0, desc: 'Candidatura Espontânea (deve ser 0)' },

    // Goiânia 2
    { lojaId: GOIANIA_2_ID, lojaNome: 'Goiânia 2', cargo: '', esperado: 38, desc: 'Todos os cargos' },
    { lojaId: GOIANIA_2_ID, lojaNome: 'Goiânia 2', cargo: 'Mecânico Automotivo', esperado: 3, desc: 'Mecânico Automotivo' },
    { lojaId: GOIANIA_2_ID, lojaNome: 'Goiânia 2', cargo: 'Recepcionista de Centro Automotivo', esperado: 19, desc: 'Recepcionista de Centro Automotivo' },
    { lojaId: GOIANIA_2_ID, lojaNome: 'Goiânia 2', cargo: 'Consultor de Vendas', esperado: 16, desc: 'Consultor de Vendas' },
    { lojaId: GOIANIA_2_ID, lojaNome: 'Goiânia 2', cargo: 'espontanea', esperado: 0, desc: 'Candidatura Espontânea (deve ser 0)' },

    // Jundiaí
    { lojaId: JUNDIAI_ID, lojaNome: 'Jundiaí', cargo: '', esperado: 5, desc: 'Todos os cargos' },
    { lojaId: JUNDIAI_ID, lojaNome: 'Jundiaí', cargo: 'Mecânico Automotivo', esperado: 4, desc: 'Mecânico Automotivo' },
    { lojaId: JUNDIAI_ID, lojaNome: 'Jundiaí', cargo: 'Consultor de Vendas', esperado: 1, desc: 'Consultor de Vendas' }
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const res = filterCandidatosAdmin(items, {
      lojaId: tc.lojaId,
      cargoId: tc.cargo,
      cargosList: cargosRes || []
    });

    const isOk = res.length === tc.esperado;
    if (isOk) passed++;
    else failed++;

    const statusTag = isOk ? '✅ OK' : '❌ FALHA';
    console.log(`${statusTag} | ${tc.lojaNome.padEnd(12)} | ${tc.desc.padEnd(42)} | Encontrados: ${res.length} (Esperado: ${tc.esperado})`);
  }

  console.log(`\n======================================================`);
  console.log(`Total de testes: ${testCases.length} | Passaram: ${passed} | Falharam: ${failed}`);
  console.log(`======================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

testAllFilters().catch(console.error);
