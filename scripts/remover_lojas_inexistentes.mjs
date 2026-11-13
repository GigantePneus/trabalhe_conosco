import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supaUrl = process.env.SUPABASE_INTERNAL_URL || process.env.VITE_SUPABASE_URL;
const supaServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supaUrl || !supaServiceKey) {
  console.error('Configuração ausente: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabaseAdmin = createClient(supaUrl, supaServiceKey, {
  auth: { persistSession: false }
});

async function main() {
  console.log('====================================================================');
  console.log('🗑️  EXCLUSÃO SEGURA DE LOJAS INEXISTENTES AUTORIZADAS (PROMPT 76)');
  console.log('====================================================================');

  const lojasParaRemover = [
    { id: 'a0000000-0000-0000-0000-000000000001', nome: 'Gigante Pneus - Matriz (Lapa/SP)' },
    { id: 'a0000000-0000-0000-0000-000000000002', nome: 'Gigante Pneus - Santo André' },
    { id: 'a0000000-0000-0000-0000-000000000003', nome: 'Gigante Pneus - Campinas' }
  ];

  for (const loja of lojasParaRemover) {
    console.log(`Excluindo loja ${loja.nome} (${loja.id})...`);
    const { data, error } = await supabaseAdmin
      .from('lojas')
      .delete()
      .eq('id', loja.id)
      .select();

    if (error) {
      console.error(`❌ Erro ao excluir ${loja.nome}:`, error.message);
      process.exit(1);
    } else {
      console.log(`  ✓ Excluída com sucesso:`, data);
    }
  }

  // Consulta saldo restante de lojas
  const { data: lojasRestantes, error: errRestantes } = await supabaseAdmin
    .from('lojas')
    .select('id, nome, cidade, estado, ativa')
    .order('nome');

  if (errRestantes) {
    console.error('Erro ao consultar lojas restantes:', errRestantes);
    process.exit(1);
  }

  const ativas = lojasRestantes.filter(l => l.ativa);
  const inativas = lojasRestantes.filter(l => !l.ativa);

  console.log('\n====================================================================');
  console.log(`📊 TOTAL DE LOJAS RESTANTES NO BANCO: ${lojasRestantes.length}`);
  console.log(`   - Ativas: ${ativas.length}`);
  console.log(`   - Inativas: ${inativas.length}`);
  console.log('====================================================================\n');
}

main().catch(err => {
  console.error('Falha na execução:', err);
  process.exit(1);
});
