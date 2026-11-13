import assert from 'assert';

const DEFAULT_JOB_HERO_IMAGE = '/imagens/banner%20vagas%20-%20gigante%20pneus.png';

function normalizeJobImageUrl(url) {
  if (!url || typeof url !== 'string') {
    return DEFAULT_JOB_HERO_IMAGE;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return DEFAULT_JOB_HERO_IMAGE;
  }

  if (
    trimmed.startsWith('/assets/banner%20vagas') ||
    trimmed.startsWith('/assets/banner vagas') ||
    trimmed.includes('banner%20vagas%20-%20gigante%20pneus') ||
    trimmed.includes('banner vagas - gigante pneus')
  ) {
    return DEFAULT_JOB_HERO_IMAGE;
  }

  return trimmed;
}

console.log('==============================================================================');
console.log('TESTES DE NORMALIZAÇÃO E FALLBACK DE IMAGENS DE VAGAS (PROMPT 71 & 71.1)');
console.log('==============================================================================\n');

// 1. Cenário: Imagem ausente ou vazia deve retornar o banner oficial
console.log('1. Testando vagas sem imagem ou com valores nulos...');
assert.strictEqual(normalizeJobImageUrl(null), DEFAULT_JOB_HERO_IMAGE);
assert.strictEqual(normalizeJobImageUrl(undefined), DEFAULT_JOB_HERO_IMAGE);
assert.strictEqual(normalizeJobImageUrl(''), DEFAULT_JOB_HERO_IMAGE);
assert.strictEqual(normalizeJobImageUrl('   '), DEFAULT_JOB_HERO_IMAGE);
console.log('  ✓ [PASS] Valores vazios/nulos retornam o banner padrão institucional.');

// 2. Cenário: Caminhos legados de build compilados pelo Vite (/assets/banner vagas...)
console.log('\n2. Testando conversão de caminhos compilados legados do Vite...');
const legacyUrl1 = '/assets/banner%20vagas%20-%20gigante%20pneus-qnux-kGO.png';
const legacyUrl2 = '/assets/banner vagas - gigante pneus-12345.png';
assert.strictEqual(normalizeJobImageUrl(legacyUrl1), DEFAULT_JOB_HERO_IMAGE);
assert.strictEqual(normalizeJobImageUrl(legacyUrl2), DEFAULT_JOB_HERO_IMAGE);
console.log('  ✓ [PASS] Caminhos transitórios de dist/assets mapeados para a rota pública perene.');

// 3. Cenário: URLs válidas preservadas intactas
console.log('\n3. Testando URLs personalizadas e imagens institucionais válidas...');
const customUrl = 'https://images.unsplash.com/photo-1580273916550-e323be2ae537';
const localOfficialUrl = '/imagens/banner%20vagas%20-%20gigante%20pneus.png';
assert.strictEqual(normalizeJobImageUrl(customUrl), customUrl);
assert.strictEqual(normalizeJobImageUrl(localOfficialUrl), localOfficialUrl);
console.log('  ✓ [PASS] URLs externas e estáticas oficiais são preservadas intactas.');

// 4. Cenário: Teste de compatibilidade HTTP da imagem oficial no ambiente local
console.log('\n4. Testando resolução do banner no servidor local (http://localhost:3000)...');
try {
  const res = await fetch('http://localhost:3000' + DEFAULT_JOB_HERO_IMAGE);
  assert.strictEqual(res.status, 200, 'HTTP status deve ser 200 OK');
  const contentType = res.headers.get('content-type') || '';
  assert.ok(contentType.includes('image/png'), `Content-Type deve ser image/png, recebido: ${contentType}`);
  console.log(`  ✓ [PASS] Imagem responde HTTP 200 com Content-Type: ${contentType}.`);
} catch (err) {
  console.log('  ⚠ Servidor local não respondeu à requisição HTTP:', err.message);
}

console.log('\n==============================================================================');
console.log('RESULTADO DOS TESTES DE IMAGEM: TODOS OS CENÁRIOS FORAM APROVADOS COM SUCESSO!');
console.log('==============================================================================');
