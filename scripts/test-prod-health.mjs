/**
 * Validação Pós-Publicação no Domínio Oficial
 * https://trabalheconosco.gigantepneus.com.br/
 */

import https from 'https';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function run() {
  console.log('==============================================================================');
  console.log('🌐 VALIDAÇÃO DO DOMÍNIO OFICIAL EM PRODUÇÃO');
  console.log('==============================================================================\n');

  const prodUrl = 'https://trabalheconosco.gigantepneus.com.br/';
  const res = await fetchUrl(prodUrl);

  console.log(`URL Oficial: ${prodUrl}`);
  console.log(`HTTP Status: ${res.status}`);
  console.log(`Vercel Edge ID: ${res.headers['x-vercel-id'] || 'N/A'}`);
  console.log(`Cache Status: ${res.headers['x-vercel-cache'] || 'N/A'}`);
  console.log(`Idade do Cache: ${res.headers['age'] || '0'}s`);

  // Extrai nome do script principal
  const scriptMatches = res.body.match(/src="([^"]+\.js)"/g) || [];
  console.log(`Scripts referenciados no index.html:`, scriptMatches);

  // Testa API pública de candidatos/vagas se aplicável
  const apiUrl = 'https://trabalheconosco.gigantepneus.com.br/api/candidaturas/enviar';
  // Envia POST vazio para testar se a API serverless está respondendo 400 (validação OK)
  const apiTest = await new Promise((resolve) => {
    const req = https.request(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (apiRes) => {
      let apiData = '';
      apiRes.on('data', c => apiData += c);
      apiRes.on('end', () => resolve({ status: apiRes.statusCode, body: apiData }));
    });
    req.on('error', (e) => resolve({ status: 500, error: e.message }));
    req.write(JSON.stringify({}));
    req.end();
  });

  console.log(`\nEndpoint Serverless /api/candidaturas/enviar:`);
  console.log(`HTTP Status retornado: ${apiTest.status} (esperado: 400 para payload vazio)`);
  console.log(`Corpo da resposta:`, apiTest.body ? apiTest.body.substring(0, 120) : 'vazio');

  console.log('\n==============================================================================');
  console.log('✅ VALIDAÇÃO INICIAL DE REDE CONCLUÍDA');
  console.log('==============================================================================');
}

run().catch(console.error);
