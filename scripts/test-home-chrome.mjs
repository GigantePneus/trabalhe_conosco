/**
 * Teste End-to-End da Nova Experiência da Página Inicial via Chrome Headless CDP (PROMPT 84)
 * Testa renderização real, interações, seletores encadeados, modal de unidades e ausência de overflow.
 */

import { spawn } from 'child_process';
import http from 'http';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const REMOTE_PORT = 9336;
const APP_URL = 'http://localhost:3000/#/';

console.log('==============================================================================');
console.log('🖥️ TESTE E2E DA NOVA PÁGINA INICIAL NO GOOGLE CHROME HEADLESS (PROMPT 84)');
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

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${REMOTE_PORT}`,
    '--user-data-dir=C:\\tmp\\chrome-home-qa-3',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    APP_URL
  ]);

  let isKilled = false;
  const cleanup = () => {
    if (!isKilled) {
      isKilled = true;
      try { chromeProcess.kill(); } catch (e) {}
    }
  };

  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);

  try {
    await sleep(2500);

    const list = await getJson(`http://127.0.0.1:${REMOTE_PORT}/json`);
    const pageTarget = list.find(t => t.type === 'page');
    if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
      throw new Error('Alvo de página não encontrado no Chrome.');
    }
    console.log(`✓ Chrome conectado na porta ${REMOTE_PORT}`);

    const { WebSocket } = await import('ws');
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

    let messageId = 1;
    const callbacks = new Map();

    ws.on('message', (msg) => {
      const parsed = JSON.parse(msg.toString());
      if (parsed.id && callbacks.has(parsed.id)) {
        const { resolve, reject } = callbacks.get(parsed.id);
        callbacks.delete(parsed.id);
        if (parsed.error) reject(parsed.error);
        else resolve(parsed.result);
      }
    });

    await new Promise((resolve) => ws.on('open', resolve));

    async function sendCdp(method, params = {}) {
      const id = messageId++;
      return new Promise((resolve, reject) => {
        callbacks.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    async function evalJs(expression) {
      const res = await sendCdp('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      return res.result ? res.result.value : null;
    }

    // 1. Configura viewport desktop 1440x900
    await sendCdp('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await sleep(2000);

    // Verificação 1: Presença do Banner, Cabeçalho e Contadores
    const headerInfo = await evalJs(`(() => {
      const banner = document.querySelector('img[alt="Carreiras Gigante Pneus"]');
      const h1 = document.querySelector('h1');
      const text = document.body.innerText.toLowerCase();
      return {
        hasBanner: Boolean(banner),
        h1Text: h1 ? h1.innerText : '',
        hasOndeTrabalhar: text.includes('onde você gostaria de trabalhar?'),
        hasVagasAtivasBadge: text.includes('vagas ativas') || text.includes('vaga ativa'),
        hasCargosBadge: text.includes('cargos') || text.includes('cargo'),
        hasUnidadesBadge: text.includes('unidades') || text.includes('unidade')
      };
    })()`);

    console.log('--- 1. Cabeçalho e Banner Oficial ---');
    console.log(`Banner visível: ${headerInfo.hasBanner ? 'SIM ✓' : 'NÃO ✗'}`);
    console.log(`Título H1: "${headerInfo.h1Text}"`);
    console.log(`Seção "Onde você gostaria de trabalhar?": ${headerInfo.hasOndeTrabalhar ? 'SIM ✓' : 'NÃO ✗'}`);
    console.log(`Badges de Contadores presentes: ${headerInfo.hasVagasAtivasBadge && headerInfo.hasCargosBadge && headerInfo.hasUnidadesBadge ? 'SIM ✓' : 'NÃO ✗'}`);

    // Verificação 2: Seletores de Cidade e Unidade
    const selectorsInfo = await evalJs(`(() => {
      const selectCidade = document.getElementById('select-cidade');
      const selectLoja = document.getElementById('select-loja');
      return {
        hasSelectCidade: Boolean(selectCidade),
        cidadeOptionsCount: selectCidade ? selectCidade.options.length : 0,
        cidadeSample: selectCidade ? Array.from(selectCidade.options).slice(0, 5).map(o => o.text) : [],
        hasSelectLoja: Boolean(selectLoja),
        lojaDisabled: selectLoja ? selectLoja.disabled : false
      };
    })()`);

    console.log('\n--- 2. Seletores Encadeados ---');
    console.log(`Seletor de Cidades: ${selectorsInfo.hasSelectCidade ? 'SIM ✓' : 'NÃO ✗'} (${selectorsInfo.cidadeOptionsCount} opções)`);
    console.log(`Exemplos de cidades formatadas:`, selectorsInfo.cidadeSample);
    console.log(`Seletor de Loja desabilitado antes de escolher cidade: ${selectorsInfo.lojaDisabled ? 'SIM ✓' : 'NÃO ✗'}`);

    // Verificação 3: Cards Agrupados e Modal de Unidades
    const cardsInfo = await evalJs(`(() => {
      const articles = document.querySelectorAll('article');
      const titles = Array.from(articles).map(a => {
        const h2 = a.querySelector('h2');
        return h2 ? h2.innerText : '';
      });
      return {
        articlesCount: articles.length,
        titles
      };
    })()`);

    console.log('\n--- 3. Cards de Vagas Agrupadas ---');
    console.log(`Total de cards de funções exibidos: ${cardsInfo.articlesCount}`);
    console.log(`Cargos listados:`, cardsInfo.titles);

    // Verificação 4: Clique em "Ver unidades" para abrir o Modal
    console.log('\n--- 4. Teste do Modal de Seleção de Unidades ---');
    const clickBtnResult = await evalJs(`(() => {
      const buttons = Array.from(document.querySelectorAll('article button'));
      const btn = buttons.find(b => b.innerText.toLowerCase().includes('ver unidades'));
      if (btn) {
        btn.click();
        return { clicked: true, btnText: btn.innerText };
      }
      return { clicked: false, allBtns: buttons.map(b => b.innerText) };
    })()`);

    console.log(`Clique no botão "Ver unidades":`, clickBtnResult);
    await sleep(600);

    const modalInfo = await evalJs(`(() => {
      const modal = document.querySelector('[role="dialog"]');
      if (!modal) return { isOpen: false };
      const title = modal.querySelector('#modal-cargo-title');
      const units = Array.from(modal.querySelectorAll('h4')).map(h => h.innerText);
      const links = Array.from(modal.querySelectorAll('a')).map(a => a.getAttribute('href'));
      return {
        isOpen: true,
        title: title ? title.innerText : '',
        units,
        links
      };
    })()`);

    console.log(`Modal abriu com sucesso: ${modalInfo.isOpen ? 'SIM ✓' : 'NÃO ✗'}`);
    console.log(`Título da Modal: "${modalInfo.title}"`);
    console.log(`Unidades ofertadas:`, modalInfo.units);
    console.log(`Links reais para /vagas/:`, modalInfo.links);

    // Fecha o modal pelo botão Fechar
    await evalJs(`(() => {
      const closeBtn = Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => b.innerText.toLowerCase().includes('fechar') || b.getAttribute('title') === 'Fechar');
      if (closeBtn) closeBtn.click();
    })()`);
    await sleep(400);

    // Verificação 5: Filtro por cidade sem vagas (ex: Aracajú — SE)
    console.log('\n--- 5. Teste de Cidade Sem Vagas Publicadas ---');
    await evalJs(`(() => {
      const select = document.getElementById('select-cidade');
      const opt = Array.from(select.options).find(o => o.text.includes('Aracajú') || o.text.includes('Uberlândia'));
      if (opt) {
        select.value = opt.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await sleep(600);

    const emptyCityInfo = await evalJs(`(() => {
      const text = document.body.innerText.toLowerCase();
      const links = Array.from(document.querySelectorAll('a'));
      const talentLink = links.find(a => a.getAttribute('href') === '#/cadastro' && a.innerText.toLowerCase().includes('banco de talentos'));
      return {
        hasEmptyMessage: text.includes('nenhuma vaga aberta para'),
        hasBancoTalentosBtn: Boolean(talentLink),
        talentBtnText: talentLink ? talentLink.innerText : ''
      };
    })()`);

    console.log(`Exibiu mensagem amigável: ${emptyCityInfo.hasEmptyMessage ? 'SIM ✓' : 'NÃO ✗'}`);
    console.log(`Botão para Banco de Talentos presente: ${emptyCityInfo.hasBancoTalentosBtn ? 'SIM ✓' : 'NÃO ✗'} ("${emptyCityInfo.talentBtnText}")`);

    // Verificação 6: Teste de Responsividade Mobile (390x844) sem overflow
    console.log('\n--- 6. Teste de Responsividade Mobile (390x844) ---');
    await sendCdp('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true
    });
    await sleep(600);

    const mobileCheck = await evalJs(`(() => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      return {
        scrollWidth,
        clientWidth,
        hasHorizontalOverflow: scrollWidth > clientWidth
      };
    })()`);

    console.log(`Mobile: scrollWidth=${mobileCheck.scrollWidth}px, clientWidth=${mobileCheck.clientWidth}px`);
    console.log(`Transbordo horizontal: ${mobileCheck.hasHorizontalOverflow ? 'FALHOU (Overflow detectado)' : 'NENHUM (100% responsivo) ✓'}`);

    ws.close();
    cleanup();

    console.log('\n==============================================================================');
    console.log('🎉 TODOS OS TESTES E2E VISUAIS NO CHROME FORAM EXECUTADOS COM SUCESSO!');
    console.log('==============================================================================\n');

  } catch (err) {
    cleanup();
    console.error('Erro durante o teste E2E:', err);
    process.exit(1);
  }
}

run();
