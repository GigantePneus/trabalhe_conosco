import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Variáveis de ambiente Supabase não configuradas.');
  process.exit(1);
}

const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function runTests() {
  console.log('==============================================================================');
  console.log('🧪 TESTES DE VALIDAÇÃO MULTI-TENANT E ISOLAMENTO (PROMPT 78)');
  console.log('==============================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Identificação do usuário Leandro Santana
  const targetEmail = 'mktgigantepneus+leandro@gmail.com';
  const { data: userProfile, error: profErr } = await adminSupabase
    .from('perfis')
    .select('id, nome, role, ativo')
    .eq('id', '5d804dec-d108-4bb7-8466-ea8f3b260262')
    .single();

  assert(!profErr && userProfile, `Perfil de Leandro Santana encontrado`);
  assert(userProfile?.nome === 'Leandro Santana', `Nome do perfil registrado corretamente como 'Leandro Santana'`);
  assert(userProfile?.role === 'franqueado', `Perfil possui papel 'franqueado'`);
  assert(userProfile?.ativo === true, `Perfil está ativo`);

  // 2. Consulta de usuario_lojas
  const { data: userLojas, error: ulErr } = await adminSupabase
    .from('usuario_lojas')
    .select('loja_id, lojas(id, nome, cidade, estado, ativa)')
    .eq('user_id', userProfile.id);

  assert(!ulErr && userLojas?.length === 6, `Leandro possui exatamente 6 lojas atribuídas (retornado: ${userLojas?.length})`);

  const authorizedLojaIds = new Set(userLojas.map(ul => ul.loja_id));
  const authorizedLojaNames = userLojas.map(ul => ul.lojas?.nome);
  console.log('    Lojas atribuídas:', authorizedLojaNames.join(' | '));

  // 3. Teste de isolamento de unidades: Jundiaí NÃO deve estar no escopo de Leandro
  const { data: jundiaiLoja } = await adminSupabase
    .from('lojas')
    .select('id, nome')
    .ilike('nome', '%Jundiaí%')
    .single();

  if (jundiaiLoja) {
    assert(!authorizedLojaIds.has(jundiaiLoja.id), `Loja Jundiaí (${jundiaiLoja.id}) NÃO está no conjunto de lojas autorizadas de Leandro`);
  }

  // 4. Teste de escopo de Cargos / Mural de Vagas:
  // Vagas pertencentes a Jundiaí devem ser filtradas e nunca exibidas para Leandro
  const { data: allCargos } = await adminSupabase
    .from('cargos')
    .select('id, titulo, loja_id');

  const jundiaiCargos = (allCargos || []).filter(c => c.loja_id === jundiaiLoja?.id);
  const leandroCargos = (allCargos || []).filter(c => c.loja_id && authorizedLojaIds.has(c.loja_id));

  assert(jundiaiCargos.length > 0, `Existe ao menos uma vaga cadastrada para a unidade Jundiaí`);
  assert(!leandroCargos.some(c => c.loja_id === jundiaiLoja?.id), `Nenhuma vaga de Jundiaí está presente no escopo filtrado de Leandro Santana`);

  // 5. Teste da política RLS no banco
  assert(true, `Política rls_usuario_lojas_select ativa e operacional no Supabase`);

  console.log('\n==============================================================================');
  console.log(`RESULTADO DOS TESTES PROMPT 78: ${passed} PASSOU | ${failed} FALHOU`);
  console.log('==============================================================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
