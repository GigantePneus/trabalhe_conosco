import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import { toCanonicalCargo } from '../services/cargoEquivalenceService.js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function padronizar() {
  console.log('=== PADRONIZAÇÃO CONTROLADA DE CARGOS EM CANDIDATURAS ===\n');

  // 1. Busca todas as candidaturas
  const { data: candidaturas, error } = await supabase
    .from('candidaturas')
    .select(`
      id,
      candidato_id,
      loja_id,
      cargo_id,
      vaga_interesse,
      status,
      lojas (id, nome),
      candidatos (id, nome)
    `);

  if (error) throw error;

  console.log(`Total de candidaturas recuperadas: ${candidaturas.length}`);

  let updatedCount = 0;
  let alreadyCanonicalCount = 0;
  const auditLog = [];

  for (const cand of candidaturas) {
    const rawCargo = cand.vaga_interesse || '';
    const canonical = toCanonicalCargo(rawCargo);

    if (rawCargo === canonical) {
      alreadyCanonicalCount++;
      continue;
    }

    console.log(`[ATUALIZAR] Candidatura ID ${cand.id} (${cand.candidatos?.nome || 'Sem Nome'}) - Loja: ${cand.lojas?.nome}`);
    console.log(`   DE: "${rawCargo}" -> PARA: "${canonical}" (cargo_id preservado como null)`);

    const { error: updErr } = await supabase
      .from('candidaturas')
      .update({
        vaga_interesse: canonical,
        atualizado_em: new Date().toISOString()
      })
      .eq('id', cand.id);

    if (updErr) {
      console.error(`   [ERRO] Falha ao atualizar ID ${cand.id}:`, updErr.message);
      continue;
    }

    updatedCount++;
    auditLog.push({
      candidaturaId: cand.id,
      candidatoId: cand.candidato_id,
      candidatoNome: cand.candidatos?.nome,
      lojaId: cand.loja_id,
      lojaNome: cand.lojas?.nome,
      cargoAnterior: rawCargo,
      cargoPadronizado: canonical,
      timestamp: new Date().toISOString()
    });
  }

  console.log(`\n======================================================`);
  console.log(`Resultado da Padronização:`);
  console.log(`- Registros atualizados com sucesso: ${updatedCount}`);
  console.log(`- Registros já canônicos (sem alteração): ${alreadyCanonicalCount}`);
  console.log(`- Total conferido: ${candidaturas.length}`);
  console.log(`======================================================\n`);

  fs.writeFileSync('scripts/audit_log_padronizacao.json', JSON.stringify(auditLog, null, 2));
  console.log('Log de auditoria salvo em scripts/audit_log_padronizacao.json');
}

padronizar().catch(console.error);
