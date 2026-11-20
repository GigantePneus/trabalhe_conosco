import { isEmailNotificavel, filterNotificableRecipients, BLOCKED_NOTIFICATION_EMAILS, BLOCKED_NOTIFICATION_DOMAINS } from '../services/security/notificationBlocker.ts';

console.log('=== TESTE DE BLOQUEIO DE NOTIFICAÇÕES ===');

const testCases = [
  { input: 'naotem@naotem.com', expected: false, desc: 'E-mail substituto exato' },
  { input: 'NAOTEM@NAOTEM.COM', expected: false, desc: 'E-mail substituto em maiúsculas' },
  { input: '  naotem@naotem.com  ', expected: false, desc: 'E-mail substituto com espaços' },
  { input: 'outro@naotem.com', expected: false, desc: 'Qualquer e-mail no domínio naotem.com' },
  { input: null, expected: false, desc: 'Valor nulo' },
  { input: '', expected: false, desc: 'String vazia' },
  { input: 'email_invalido_sem_arroba', expected: false, desc: 'E-mail sem arroba' },
  { input: 'candidato.real@gmail.com', expected: true, desc: 'E-mail legítimo real Gmail' },
  { input: 'joedson@hotmail.com', expected: true, desc: 'E-mail legítimo real Hotmail' },
  { input: 'mktgigantepneus@gmail.com', expected: true, desc: 'E-mail corporativo legítimo' }
];

let failed = 0;

testCases.forEach((tc, idx) => {
  const result = isEmailNotificavel(tc.input);
  const ok = result === tc.expected;
  if (!ok) failed++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] Teste ${idx + 1}: ${tc.desc} ("${tc.input}") => ${result} (Esperado: ${tc.expected})`);
});

const listToFilter = [
  'naotem@naotem.com',
  'candidato1@gmail.com',
  'outro@naotem.com',
  'candidato2@outlook.com'
];

const filtered = filterNotificableRecipients(listToFilter);
console.log('\nTeste de filtragem de lista de destinatários:');
console.log('Original:', listToFilter);
console.log('Filtrada:', filtered);

const filterOk = filtered.length === 2 && filtered.includes('candidato1@gmail.com') && filtered.includes('candidato2@outlook.com');
console.log(`Filtragem em lote: ${filterOk ? 'PASS ✅' : 'FAIL ❌'}`);

if (failed === 0 && filterOk) {
  console.log('\n🎉 TODOS OS TESTES DE BLOQUEIO DE NOTIFICAÇÃO PASSARAM COM SUCESSO!');
} else {
  console.error('\n❌ Houve falha nos testes!');
  process.exit(1);
}
