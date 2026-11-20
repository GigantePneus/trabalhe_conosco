import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkState() {
  const { data: rows, error } = await supabase
    .from('candidaturas')
    .select('id, cargo_id, vaga_interesse, status, loja_id, lojas(nome)');

  if (error) throw error;

  const stats = {};
  rows.forEach(r => {
    const loja = r.lojas?.nome || 'Sem Loja';
    if (!stats[loja]) stats[loja] = { total: 0, cargos: {}, semCargoId: 0, comCargoId: 0 };
    stats[loja].total++;
    if (r.cargo_id) stats[loja].comCargoId++;
    else stats[loja].semCargoId++;
    stats[loja].cargos[r.vaga_interesse] = (stats[loja].cargos[r.vaga_interesse] || 0) + 1;
  });

  console.log('ESTADO APÓS PADRONIZAÇÃO:');
  console.log(JSON.stringify(stats, null, 2));
}

checkState().catch(console.error);
