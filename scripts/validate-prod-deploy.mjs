async function checkProduction() {
  console.log('================================================================');
  console.log('🌐 VALIDANDO DEPLOY DE PRODUÇÃO: GIGANTE PNEUS');
  console.log('================================================================\n');

  const cacheBuster = Date.now();
  const prodUrl = `https://trabalheconosco.gigantepneus.com.br/?cb=${cacheBuster}`;
  const ogImageUrl = `https://trabalheconosco.gigantepneus.com.br/og-trabalhe-conosco.png?cb=${cacheBuster}`;

  console.log(`1. Testando página inicial em ${prodUrl}...`);
  const res = await fetch(prodUrl, { headers: { 'Cache-Control': 'no-cache' } });
  console.log(`   HTTP Status: ${res.status} ${res.statusText}`);
  const html = await res.text();

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const ogTitleMatch = html.match(/<meta property=["']og:title["'] content=["']([^"']+)["']/i);
  const ogDescMatch = html.match(/<meta property=["']og:description["'] content=["']([^"']+)["']/i);
  const ogImageMatch = html.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);
  const ogWidthMatch = html.match(/<meta property=["']og:image:width["'] content=["']([^"']+)["']/i);
  const ogHeightMatch = html.match(/<meta property=["']og:image:height["'] content=["']([^"']+)["']/i);
  const twitterCardMatch = html.match(/<meta name=["']twitter:card["'] content=["']([^"']+)["']/i);
  const twitterImageMatch = html.match(/<meta name=["']twitter:image["'] content=["']([^"']+)["']/i);
  const faviconMatch = html.match(/<link rel=["']icon["'][^>]*href=["']([^"']+)["']/i);

  console.log('\n2. Metatags encontradas no HTML de produção:');
  console.log(`   - <title>: ${titleMatch ? titleMatch[1] : 'NÃO ENCONTRADO'}`);
  console.log(`   - og:title: ${ogTitleMatch ? ogTitleMatch[1] : 'NÃO ENCONTRADO'}`);
  console.log(`   - og:description: ${ogDescMatch ? ogDescMatch[1] : 'NÃO ENCONTRADO'}`);
  console.log(`   - og:image: ${ogImageMatch ? ogImageMatch[1] : 'NÃO ENCONTRADO'}`);
  console.log(`   - og:image:width: ${ogWidthMatch ? ogWidthMatch[1] : 'NÃO ENCONTRADO'}`);
  console.log(`   - og:image:height: ${ogHeightMatch ? ogHeightMatch[1] : 'NÃO ENCONTRADO'}`);
  console.log(`   - twitter:card: ${twitterCardMatch ? twitterCardMatch[1] : 'NÃO ENCONTRADO'}`);
  console.log(`   - twitter:image: ${twitterImageMatch ? twitterImageMatch[1] : 'NÃO ENCONTRADO'}`);
  console.log(`   - favicon: ${faviconMatch ? faviconMatch[1] : 'NÃO ENCONTRADO'}`);

  console.log(`\n3. Testando resposta HTTP da imagem de compartilhamento em ${ogImageUrl}...`);
  const imgRes = await fetch(ogImageUrl, { headers: { 'Cache-Control': 'no-cache' } });
  console.log(`   HTTP Status: ${imgRes.status} ${imgRes.statusText}`);
  console.log(`   Content-Type: ${imgRes.headers.get('content-type')}`);
  console.log(`   Content-Length: ${imgRes.headers.get('content-length')} bytes`);

  const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
  if (imgBuffer.length > 24 && imgBuffer.slice(0, 8).toString('hex') === '89504e470d0a1a0a') {
    const width = imgBuffer.readUInt32BE(16);
    const height = imgBuffer.readUInt32BE(20);
    console.log(`   Dimensões reais da imagem em produção: ${width}x${height}`);
  }

  console.log('\n4. Testando rota de candidatura em produção (sem enviar dados)...');
  const candSlug = '6828d1fc-f39a-4979-ab85-6a43f7cbbf0b';
  const candUrl = `https://trabalheconosco.gigantepneus.com.br/#/candidatar/${candSlug}`;
  console.log(`   URL: ${candUrl}`);
  // Como o hash é client-side, o servidor entrega o index.html com 200 OK
  const candRes = await fetch(`https://trabalheconosco.gigantepneus.com.br/`);
  console.log(`   HTTP Status de entrega do shell: ${candRes.status}`);

  console.log('\n================================================================');
  if (ogImageMatch?.[1]?.includes('og-trabalhe-conosco.png') && imgRes.status === 200) {
    console.log('🎉 DEPLOY CONCLUÍDO COM SUCESSO! A PRODUÇÃO ESTÁ ATUALIZADA!');
  } else {
    console.log('⏳ Vercel ainda está compilando/distribuindo o deploy. Aguardando...');
  }
  console.log('================================================================');
}

checkProduction().catch(console.error);
