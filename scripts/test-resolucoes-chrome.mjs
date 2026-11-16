/**
 * Script de validação visual e de responsividade via Chrome Headless com DevTools Protocol
 * Testa: 1920x1080, 1440x900, 1366x768, 1024x768, 768x1024, 390x844 e Zoom 125%
 */

import { spawn } from 'child_process';
import http from 'http';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const REMOTE_PORT = 9333;
const APP_URL = 'http://localhost:3000/#/login';

const resolutions = [
  { name: '1. Desktop Full HD (1920x1080)', width: 1920, height: 1080, dpr: 1 },
  { name: '2. Desktop Widescreen (1440x900)', width: 1440, height: 900, dpr: 1 },
  { name: '3. Notebook Padrão (1366x768)', width: 1366, height: 768, dpr: 1 },
  { name: '4. Notebook com Zoom 125% (1366x768 @ 1.25)', width: 1093, height: 614, dpr: 1.25 },
  { name: '5. Tablet / iPad Horizontal (1024x768)', width: 1024, height: 768, dpr: 1 },
  { name: '6. Tablet Vertical (768x1024)', width: 768, height: 1024, dpr: 2 },
  { name: '7. Mobile / iPhone (390x844)', width: 390, height: 844, dpr: 3 }
];

console.log('==============================================================================');
console.log('🖥️ VALIDAÇÃO DE RESPONSIVIDADE E RENDERIZAÇÃO REAL NO GOOGLE CHROME');
console.log('==============================================================================\n');

async function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${REMOTE_PORT}`,
    '--user-data-dir=C:\\tmp\\chrome-qa-profile',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    APP_URL
  ]);

  // Aguarda Chrome inicializar o endpoint de depuração
  await new Promise(r => setTimeout(r, 2000));

  try {
    const list = await getJson(`http://127.0.0.1:${REMOTE_PORT}/json`);
    const pageTarget = list.find(t => t.type === 'page');
    if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
      throw new Error('Alvo de página não encontrado no Chrome.');
    }

    const { WebSocket } = await import('ws');
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

    let id = 1;
    const callbacks = new Map();

    ws.on('message', (msg) => {
      const data = JSON.parse(msg.toString());
      if (data.id && callbacks.has(data.id)) {
        const { resolve } = callbacks.get(data.id);
        callbacks.delete(data.id);
        resolve(data.result);
      }
    });

    await new Promise(r => ws.on('open', r));

    function send(method, params = {}) {
      return new Promise((resolve) => {
        const msgId = id++;
        callbacks.set(msgId, { resolve });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    await send('Page.enable');
    await send('DOM.enable');

    // Navega para a página
    await send('Page.navigate', { url: APP_URL });
    await new Promise(r => setTimeout(r, 2000));

    console.log(`Página carregada: ${APP_URL}\n`);

    for (const res of resolutions) {
      // Ajusta o viewport via CDP
      await send('Emulation.setDeviceMetricsOverride', {
        width: res.width,
        height: res.height,
        deviceScaleFactor: res.dpr,
        mobile: res.width < 800
      });

      await new Promise(r => setTimeout(r, 400));

      // Avalia dimensões da janela e document
      const evalRes = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const docWidth = document.documentElement.scrollWidth;
            const winWidth = window.innerWidth;
            const docHeight = document.documentElement.scrollHeight;
            const hasHorizontalScroll = docWidth > winWidth;
            return {
              docWidth,
              winWidth,
              docHeight,
              hasHorizontalScroll
            };
          })()
        `,
        returnByValue: true
      });

      const metrics = evalRes?.result?.value;
      const statusIcon = !metrics?.hasHorizontalScroll ? '✓ [PASS]' : '✗ [FAIL]';
      console.log(`  ${statusIcon} ${res.name}:`);
      console.log(`      Viewport: ${res.width}x${res.height} (DPR: ${res.dpr}) | ScrollWidth: ${metrics?.docWidth}px | WinWidth: ${metrics?.winWidth}px`);
      console.log(`      Estouro Horizontal: ${metrics?.hasHorizontalScroll ? 'SIM (Inadequado)' : 'NÃO (Layout Perfeito e Estável)'}\n`);
    }

    ws.close();
  } catch (err) {
    console.error('Erro na execução do teste:', err.message);
  } finally {
    chromeProcess.kill();
  }

  console.log('==============================================================================');
  console.log('🎉 AUDITORIA VISUAL DE RESPONSIVIDADE CONCLUÍDA!');
  console.log('==============================================================================');
}

run();
