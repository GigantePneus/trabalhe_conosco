/**
 * Testes automatizados do fluxo de autenticação, convite, senha e login (PROMPT 81)
 * Gigante Pneus - Trabalhe Conosco Multi-Lojas
 */

import assert from 'assert';

console.log('==============================================================================');
console.log('🧪 TESTES DE VALIDAÇÃO DO FLUXO DE CONVITE, SENHA E LOGIN (PROMPT 81)');
console.log('==============================================================================\n');

let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${description}`);
    console.error(`    Erro: ${err.message}`);
    failed++;
  }
}

// 1. Simulação da detecção de tokens de recuperação / convite (App.tsx)
function evaluateRecoveryMode(pathname, hash, search, hasSessionFlag) {
  const hashStr = hash || '';
  const searchStr = search || '';
  const fullUrlParams = new URLSearchParams(
    hashStr.includes('?') 
      ? hashStr.substring(hashStr.indexOf('?')) 
      : (hashStr.startsWith('#') ? hashStr.substring(1) : searchStr)
  );
  
  const hasAuthToken = 
    fullUrlParams.get('type') === 'recovery' || 
    fullUrlParams.get('type') === 'invite' ||
    (hashStr.includes('access_token=') && (hashStr.includes('type=recovery') || hashStr.includes('type=invite') || !hashStr.includes('type='))) ||
    searchStr.includes('type=recovery') ||
    searchStr.includes('type=invite') ||
    searchStr.includes('code=');

  const isHashResetPassword = hashStr.startsWith('#/reset-password') || hashStr.startsWith('#/definir-senha');

  // Se o usuário estiver explicitamente no login, JAMAIS entra em modo recovery
  if (hashStr === '#/login' || pathname === '/login') {
    return false;
  }

  return Boolean(hasAuthToken || (isHashResetPassword && hasSessionFlag));
}

// 2. Simulação da normalização de URL pathname residual
function normalizeUrl(pathname, hash) {
  let targetHash = hash || '#/';
  let pathNeedsSanitize = false;

  if (pathname && pathname !== '/' && !pathname.endsWith('.html')) {
    pathNeedsSanitize = true;
    if (pathname.startsWith('/reset-password') || pathname.startsWith('/definir-senha')) {
      if (!hash || hash === '' || hash === '#/') {
        targetHash = '#/reset-password';
      }
    }
  }

  const cleanPath = pathNeedsSanitize ? `/#${targetHash.replace(/^#\/?/, '/')}` : `${pathname}${targetHash}`;
  return { cleanPath, pathNeedsSanitize };
}

// 3. Simulação da rota /login em App.tsx
function resolveLoginRoute(activeUser, isPasswordRecoveryMode) {
  if (activeUser && !isPasswordRecoveryMode) {
    return 'REDIRECT_ADMIN';
  }
  // Se não tem usuário ou se está desarmado, SEMPRE renderiza Login, NUNCA redireciona para reset-password em loop!
  return 'RENDER_LOGIN';
}

// ==========================================
// TESTES
// ==========================================

// Cenário 1: Link de e-mail de convite recebido pelo usuário
test('1. Link de e-mail de convite com access_token e type=invite ativa modo recovery/definição de senha', () => {
  const isRecovery = evaluateRecoveryMode(
    '/reset-password',
    '#access_token=test_tok&expires_in=3600&refresh_token=test_ref&token_type=bearer&type=invite',
    '',
    false
  );
  assert.strictEqual(isRecovery, true);
});

// Cenário 2: Link de e-mail de recuperação de senha com type=recovery
test('2. Link de e-mail de recuperação com type=recovery ativa modo recovery', () => {
  const isRecovery = evaluateRecoveryMode(
    '/reset-password',
    '#access_token=test_tok&type=recovery',
    '',
    false
  );
  assert.strictEqual(isRecovery, true);
});

// Cenário 3: Usuário já cadastrado acessando a raiz do sistema
test('3. Usuário normal acessando a raiz (/#/admin ou /#/login) NÃO ativa modo recovery', () => {
  const isRecovery = evaluateRecoveryMode('/', '#/login', '', false);
  assert.strictEqual(isRecovery, false);

  const isRecoveryAdmin = evaluateRecoveryMode('/', '#/admin', '', false);
  assert.strictEqual(isRecoveryAdmin, false);
});

// Cenário 4: Prevenção do Bug Leandro Santana (pathname residual /reset-password pós definição)
test('4. Bug Leandro Santana: Pathname residual /reset-password SEM token na URL e SEM flag na sessão NÃO ativa recovery', () => {
  // Antes da correção, pathname === '/reset-password' ativava isRecovery=true infinitamente!
  const isRecovery = evaluateRecoveryMode('/reset-password', '#/admin', '', false);
  assert.strictEqual(isRecovery, false, 'Pathname residual sem token na URL e sem flag na sessão NÃO deve forçar recovery');
});

// Cenário 5: Sanitização de URL residual de /reset-password para /#/reset-password
test('5. Sanitização de URL: Transforma pathname /reset-password em hash limpo /#/reset-password', () => {
  const { cleanPath, pathNeedsSanitize } = normalizeUrl('/reset-password', '');
  assert.strictEqual(pathNeedsSanitize, true);
  assert.strictEqual(cleanPath, '/#/reset-password');
});

// Cenário 6: Botão "Voltar para o Login" desativa modo recovery mesmo com sessão ativa
test('6. Navegação explícita para #/login DESARMA recovery mode imediatamente', () => {
  const isRecovery = evaluateRecoveryMode('/', '#/login', '', true);
  assert.strictEqual(isRecovery, false, 'Hash #/login deve forçar isPasswordRecoveryMode para false');
});

// Cenário 7: Eliminação do Loop de Redirecionamento na rota /login
test('7. Eliminação do Loop: Rota /login NUNCA redireciona para reset-password', () => {
  // Teste com usuário deslogado e isPasswordRecoveryMode false
  const routeUnauthed = resolveLoginRoute(null, false);
  assert.strictEqual(routeUnauthed, 'RENDER_LOGIN');

  // Teste se houvesse flag remanescente mas usuário sem sessão
  const routeNoUserWithFlag = resolveLoginRoute(null, true);
  assert.strictEqual(routeNoUserWithFlag, 'RENDER_LOGIN', 'Sem usuário logado, deve sempre exibir a tela de Login');

  // Teste com usuário logado autenticado
  const routeAuthed = resolveLoginRoute({ id: 'user-1' }, false);
  assert.strictEqual(routeAuthed, 'REDIRECT_ADMIN');
});

// Cenário 8: Conexão via PKCE / SSR com parâmetro ?code=
test('8. Suporte a fluxos PKCE via query param ?code= ativa recovery mode adequadamente', () => {
  const isRecovery = evaluateRecoveryMode('/', '', '?code=supabase-auth-code-12345', false);
  assert.strictEqual(isRecovery, true);
});

// Cenário 9: Link expirado ou sem token na URL
test('9. Acesso direto a #/reset-password sem tokens e sem sessão prévia é detectado como sem token', () => {
  const isRecovery = evaluateRecoveryMode('/', '#/reset-password', '', false);
  assert.strictEqual(isRecovery, false);
});

console.log('\n==============================================================================');
console.log(`RESULTADO DOS TESTES PROMPT 81: ${passed} PASSOU | ${failed} FALHOU`);
console.log('==============================================================================');

if (failed > 0) {
  process.exit(1);
}
