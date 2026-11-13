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

async function runTests() {
  console.log('==============================================================================');
  console.log('🧪 TESTES DO SELETOR DE UNIDADES E STATUS DAS LOJAS (PROMPT 76)');
  console.log('==============================================================================');

  const { data: todasLojas, error } = await supabaseAdmin
    .from('lojas')
    .select('id, nome, cidade, estado, ativa')
    .order('nome');

  if (error || !todasLojas) {
    console.error('❌ Erro ao consultar lojas:', error);
    process.exit(1);
  }

  const idsAlvosInexistentes = [
    'a0000000-0000-0000-0000-000000000001', // Matriz Lapa
    'a0000000-0000-0000-0000-000000000002', // Santo André
    'a0000000-0000-0000-0000-000000000003', // Campinas
    'e0000000-0000-0000-0000-000000000099'  // Teste Gigante Pneus
  ];

  // 1. Confirmar que as 4 lojas alvos estão com ativa = false
  for (const id of idsAlvosInexistentes) {
    const loja = todasLojas.find(l => l.id === id);
    if (!loja) {
      console.log(`  ✓ [PASS] Loja ${id} não existe no banco.`);
    } else if (loja.ativa === false) {
      console.log(`  ✓ [PASS] Loja ${loja.nome} (${id}) confirmada como INATIVA (ativa = false).`);
    } else {
      console.error(`❌ [FAIL] Loja ${loja.nome} ainda está marcada como ativa!`);
      process.exit(1);
    }
  }

  // 2. Verificar filtragem de lojas ativas para o seletor da interface
  const lojasAtivas = todasLojas.filter(l => l.ativa);
  console.log(`\n  Total de lojas cadastradas: ${todasLojas.length}`);
  console.log(`  Total de lojas ATIVAS disponíveis no seletor: ${lojasAtivas.length}`);

  if (lojasAtivas.length !== 24) {
    console.warn(`⚠️ Quantidade esperada de lojas ativas era 24, encontrada: ${lojasAtivas.length}`);
  } else {
    console.log(`  ✓ [PASS] Exatamente 24 unidades operacionais ativas na rede.`);
  }

  // 3. Confirmar que NENHUMA das 4 unidades inexistentes está no conjunto ativo
  const vazamento = lojasAtivas.some(l => idsAlvosInexistentes.includes(l.id));
  if (vazamento) {
    console.error('❌ [FAIL] Uma ou mais lojas inexistentes vazaram para a lista de ativas!');
    process.exit(1);
  } else {
    console.log('  ✓ [PASS] Nenhuma das 4 unidades inexistentes aparece no seletor de ativas.');
  }

  // 4. Confirmar que a unidade Jundiaí (referência da homologação) está ativa
  const jundiai = lojasAtivas.find(l => l.id === 'eaacf2ee-4bdb-4b0a-ae4a-474389330175');
  if (jundiai) {
    console.log(`  ✓ [PASS] Unidade de referência ${jundiai.nome} (${jundiai.cidade}-${jundiai.estado}) ativa e disponível.`);
  } else {
    console.error('❌ [FAIL] Unidade Jundiaí não encontrada no seletor de ativas!');
    process.exit(1);
  }

  console.log('\n==============================================================================');
  console.log('🎉 AUDITORIA E VALIDAÇÃO DO SELETOR DE LOJAS CONCLUÍDAS COM SUCESSO!');
  console.log('==============================================================================\n');
}

runTests().catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
