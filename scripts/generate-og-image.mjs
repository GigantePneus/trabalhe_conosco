import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = process.cwd();
const tempHtmlPath = resolve(projectRoot, 'temp_og_render.html');
const tempPngPath = resolve(projectRoot, 'public', 'og-trabalhe-conosco.png');

// Codificar imagens em base64 para o HTML carregar de forma 100% autônoma
const logoDarkBase64 = readFileSync(resolve(projectRoot, 'public/imagens/logo gigante dark.png')).toString('base64');
const bannerBase64 = readFileSync(resolve(projectRoot, 'public/imagens/banner LP - Gigante Pneus.png')).toString('base64');
const iconBase64 = readFileSync(resolve(projectRoot, 'public/icon.png')).toString('base64');

const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
  
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  html, body {
    width: 1200px;
    height: 630px;
    overflow: hidden;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #09090b;
  }
  
  .og-container {
    position: relative;
    width: 1200px;
    height: 630px;
    display: flex;
    background: radial-gradient(circle at 80% 30%, #7f1d1d 0%, #1c1917 50%, #0c0a09 100%);
    color: #ffffff;
    overflow: hidden;
  }

  /* Fundo decorativo com foto da equipe/oficina */
  .bg-banner {
    position: absolute;
    right: -20px;
    top: 0;
    width: 680px;
    height: 630px;
    background-image: url('data:image/png;base64,${bannerBase64}');
    background-size: cover;
    background-position: center right;
    mask-image: linear-gradient(to right, transparent 0%, rgba(0,0,0,0.4) 25%, rgba(0,0,0,0.95) 70%, black 100%);
    -webkit-mask-image: linear-gradient(to right, transparent 0%, rgba(0,0,0,0.5) 25%, rgba(0,0,0,0.95) 70%, black 100%);
    filter: brightness(0.92) contrast(1.05);
  }

  /* Gradiente sobreposto para garantir contraste perfeito no texto */
  .overlay-gradient {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, #09090b 0%, #09090b 46%, rgba(9,9,11,0.85) 65%, rgba(9,9,11,0.2) 100%);
  }

  /* Conteúdo à esquerda */
  .content {
    position: relative;
    z-index: 10;
    width: 720px;
    height: 100%;
    padding: 56px 64px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .top-section {
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .logo-wrapper {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .logo-img {
    height: 68px;
    width: auto;
    object-fit: contain;
    filter: drop-shadow(0 4px 12px rgba(0,0,0,0.5));
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(220, 38, 38, 0.18);
    border: 1px solid rgba(239, 68, 68, 0.45);
    color: #fca5a5;
    padding: 6px 16px;
    border-radius: 9999px;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    width: fit-content;
  }

  .badge-dot {
    width: 8px;
    height: 8px;
    background: #ef4444;
    border-radius: 50%;
    box-shadow: 0 0 10px #ef4444;
  }

  .main-title {
    font-size: 56px;
    font-weight: 900;
    line-height: 1.08;
    letter-spacing: -0.03em;
    color: #ffffff;
  }

  .main-title .highlight {
    background: linear-gradient(135deg, #ef4444 0%, #f87171 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .subtitle {
    font-size: 20px;
    line-height: 1.45;
    color: #d1d5db;
    font-weight: 400;
    max-width: 600px;
  }

  /* Tags de áreas de atuação */
  .tags-container {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 6px;
  }

  .tag-item {
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #f3f4f6;
    padding: 6px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
  }

  /* Rodapé */
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 18px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .footer-url {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #9ca3af;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .footer-url .url-text {
    color: #ffffff;
    font-weight: 700;
  }

  .footer-brand {
    font-size: 13px;
    color: #6b7280;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  /* Selo flutuante à direita */
  .seal-floating {
    position: absolute;
    bottom: 40px;
    right: 48px;
    z-index: 12;
    display: flex;
    align-items: center;
    gap: 14px;
    background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(239, 68, 68, 0.3);
    padding: 12px 20px;
    border-radius: 16px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
  }

  .seal-icon {
    width: 48px;
    height: 48px;
    object-fit: contain;
  }

  .seal-text {
    display: flex;
    flex-direction: column;
  }

  .seal-title {
    font-size: 14px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: 0.02em;
  }

  .seal-sub {
    font-size: 12px;
    font-weight: 500;
    color: #f87171;
  }
</style>
</head>
<body>
  <div class="og-container">
    <div class="bg-banner"></div>
    <div class="overlay-gradient"></div>

    <div class="content">
      <div class="top-section">
        <div class="logo-wrapper">
          <img class="logo-img" src="data:image/png;base64,${logoDarkBase64}" alt="Gigante Pneus e Mecânica" />
        </div>

        <div class="badge">
          <div class="badge-dot"></div>
          Oportunidades de Carreira
        </div>

        <h1 class="main-title">
          Trabalhe <span class="highlight">Conosco</span>
        </h1>

        <p class="subtitle">
          Faça parte da Gigante Pneus! Confira nossas vagas abertas e cadastre-se em nosso Banco de Talentos.
        </p>

        <div class="tags-container">
          <span class="tag-item">Oficina Mecânica</span>
          <span class="tag-item">Alinhamento & Pneus</span>
          <span class="tag-item">Vendas & Consultoria</span>
          <span class="tag-item">Administrativo</span>
        </div>
      </div>

      <div class="footer">
        <div class="footer-url">
          <span>Portal Oficial:</span>
          <span class="url-text">trabalheconosco.gigantepneus.com.br</span>
        </div>
        <div class="footer-brand">Rede Multi-Lojas • Brasil</div>
      </div>
    </div>

    <div class="seal-floating">
      <img class="seal-icon" src="data:image/png;base64,${iconBase64}" alt="Selo Oficial Gigante Pneus" />
      <div class="seal-text">
        <span class="seal-title">Autocenter Oficial</span>
        <span class="seal-sub">Sua Carreira Acelera Aqui</span>
      </div>
    </div>
  </div>
</body>
</html>`;

writeFileSync(tempHtmlPath, htmlContent, 'utf-8');
console.log('Arquivo HTML temporário gerado:', tempHtmlPath);

// Executa Chrome Headless para tirar o screenshot exato de 1200x630
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const cmd = `"${chromePath}" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,630 --screenshot="${tempPngPath}" "file:///${tempHtmlPath.replace(/\\/g, '/')}"`;

console.log('Executando Chrome headless...');
execSync(cmd, { stdio: 'inherit' });

if (existsSync(tempHtmlPath)) {
  unlinkSync(tempHtmlPath);
}

console.log('✅ Imagem Open Graph gerada com sucesso em:', tempPngPath);
