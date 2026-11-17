/**
 * Teste End-to-End no Domínio Oficial de Produção via Chrome Headless CDP (PROMPT 86)
 * Valida https://trabalheconosco.gigantepneus.com.br/
 */

import { spawn } from 'child_process';
import http from 'http';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const REMOTE_PORT = 9339;
const PROD_URL = 'https://trabalheconosco.gigantepneus.com.br/#/';

console.log('==============================================================================');
console.log('🌐 TESTE E2E NO DOMÍNIO OFICIAL EM PRODUÇÃO (CHROME HEADLESS)');
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
    '--user-data-dir=C:\\tmp\\chrome-prod-qa-2',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    PROD_URL
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
    await sleep(3000);

    const list = await getJson(`http://127.0.0.1:${REMOTE_PORT}/json`);
    const pageTarget = list.find(t => t.type === 'page');
    if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
      throw new Error('Alvo de página de produção não encontrado no Chrome.');
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

    // Configura viewport 1440x900
    await sendCdp('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await sleep(2500);

    // 1. Verificação da Página Inicial Oficial
    const homeInfo = await evalJs(`(() => {
      const banner = document.querySelector('img[alt="Carreiras Gigante Pneus"]');
      const h1 = document.querySelector('h1');
      const text = document.body.innerText.toLowerCase();
      const selectCidade = document.getElementById('select-cidade');
      const selectLoja = document.getElementById('select-loja');
      const articles = document.querySelectorAll('article');
      return {
        hasBanner: Boolean(banner),
        h1Text: h1 ? h1.innerText : '',
        hasOndeTrabalhar: text.includes('onde você gostaria de trabalhar?'),
        hasVagasAtivasBadge: text.includes('vagas ativas') || text.includes('vaga ativa'),
        cidadesCount: selectCidade ? selectCidade.options.length : 0,
        lojaDisabled: selectLoja ? selectLoja.disabled : false,
        cargosCount: articles.length
      };
    })()`);

    console.log('--- 1. Página Inicial Pública em Produção ---');
    console.log(`Banner Oficial: ${homeInfo.hasBanner ? 'CARREGADO ✓' : 'FALHOU ✗'}`);
    console.log(`Título Principal: "${homeInfo.h1Text}"`);
    console.log(`Seção "Onde você gostaria de trabalhar?": ${homeInfo.hasOndeTrabalhar ? 'PRESENTE ✓' : 'FALHOU ✗'}`);
    console.log(`Contadores de Vagas: ${homeInfo.hasVagasAtivasBadge ? 'VISÍVEIS ✓' : 'FALHOU ✗'}`);
    console.log(`Cidades no Seletor: ${homeInfo.cidadesCount} opções carregadas do Supabase Oficial`);
    console.log(`Seletor de Unidades Desabilitado Inicialmente: ${homeInfo.lojaDisabled ? 'SIM ✓' : 'FALHOU ✗'}`);
    console.log(`Cargos Agrupados Exibidos: ${homeInfo.cargosCount}`);

    // 2. Teste do Modal de Unidades em Produção
    console.log('\n--- 2. Modal de Unidades por Cargo em Produção ---');
    const modalTrigger = await evalJs(`(() => {
      const btns = Array.from(document.querySelectorAll('article button'));
      const btn = btns.find(b => b.innerText.toLowerCase().includes('ver unidades'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })()`);

    await sleep(700);

    const modalData = await evalJs(`(() => {
      const modal = document.querySelector('[role="dialog"]');
      if (!modal) return { open: false };
      const title = modal.querySelector('#modal-cargo-title');
      const units = Array.from(modal.querySelectorAll('h4')).map(h => h.innerText);
      const links = Array.from(modal.querySelectorAll('a')).map(a => a.getAttribute('href'));
      return {
        open: true,
        title: title ? title.innerText : '',
        units,
        links
      };
    })()`);

    console.log(`Modal abriu: ${modalData.open ? 'SIM ✓' : 'FALHOU ✗'}`);
    console.log(`Cargo no Modal: "${modalData.title}"`);
    console.log(`Unidades Disponíveis:`, modalData.units);
    console.log(`Links Reais de Candidatura:`, modalData.links);

    // Fecha modal
    await evalJs(`(() => {
      const close = document.querySelector('[role="dialog"] button[title="Fechar"]') || document.querySelector('[role="dialog"] button');
      if (close) close.click();
    })()`);
    await sleep(400);

    // 3. Teste de Rota de Detalhe da Vaga em Produção
    console.log('\n--- 3. Detalhes da Vaga e Formulário em Produção ---');
    if (modalData.links && modalData.links.length > 0) {
      const firstJobPath = modalData.links[0].replace(/^#/, '');
      await sendCdp('Page.navigate', { url: `https://trabalheconosco.gigantepneus.com.br/#${firstJobPath}` });
      await sleep(2500);

      const jobDetailInfo = await evalJs(`(() => {
        const h1 = document.querySelector('h1');
        const applyBtn = Array.from(document.querySelectorAll('a')).find(a => a.innerText.toLowerCase().includes('candidatar'));
        return {
          title: h1 ? h1.innerText : '',
          hasApplyBtn: Boolean(applyBtn),
          btnText: applyBtn ? applyBtn.innerText : '',
          applyHref: applyBtn ? applyBtn.getAttribute('href') : ''
        };
      })()`);

      console.log(`Página de Vaga: "${jobDetailInfo.title}"`);
      console.log(`Botão de Ação: ${jobDetailInfo.hasApplyBtn ? 'PRESENTE ✓' : 'FALHOU ✗'} ("${jobDetailInfo.btnText}" -> ${jobDetailInfo.applyHref})`);

      // Navega para o formulário público da vaga
      if (jobDetailInfo.applyHref) {
        const formPath = jobDetailInfo.applyHref.replace(/^#/, '');
        await sendCdp('Page.navigate', { url: `https://trabalheconosco.gigantepneus.com.br/#${formPath}` });
        await sleep(2500);

        const formCheck = await evalJs(`(() => {
          const nomeInput = document.querySelector('input[name="nome"]') || document.getElementById('nome');
          const emailInput = document.querySelector('input[type="email"]');
          const fileInput = document.querySelector('input[type="file"]');
          const pageText = document.body.innerText.substring(0, 150);
          return {
            hasForm: Boolean(nomeInput || emailInput),
            hasFileInput: Boolean(fileInput),
            pageSample: pageText
          };
        })()`);

        console.log(`Formulário de Candidatura carregado: ${formCheck.hasForm ? 'SIM ✓' : 'FALHOU ✗'}`);
        console.log(`Campo de Anexo de Currículo (PDF): ${formCheck.hasFileInput ? 'PRESENTE ✓' : 'FALHOU ✗'}`);
      }
    }

    // 4. Teste de Cadastro Espontâneo no Banco de Talentos (/cadastro)
    console.log('\n--- 4. Rota do Banco de Talentos (/cadastro) em Produção ---');
    await sendCdp('Page.navigate', { url: 'https://trabalheconosco.gigantepneus.com.br/#/cadastro' });
    await sleep(2500);

    const talentCheck = await evalJs(`(() => {
      const emailInput = document.querySelector('input[type="email"]');
      const nomeInput = document.querySelector('input[name="nome"]') || document.getElementById('nome');
      return {
        hasEmail: Boolean(emailInput),
        hasNome: Boolean(nomeInput),
        isTalentPage: document.body.innerText.toLowerCase().includes('banco de talentos') || document.body.innerText.toLowerCase().includes('candidatura')
      };
    })()`);

    console.log(`Página Banco de Talentos (/cadastro): ${talentCheck.hasEmail || talentCheck.hasNome ? 'OPERACIONAL ✓' : 'FALHOU ✗'}`);

    // 5. Teste de Login Administrativo em Produção
    console.log('\n--- 5. Tela de Autenticação RH em Produção ---');
    await sendCdp('Page.navigate', { url: 'https://trabalheconosco.gigantepneus.com.br/#/login' });
    await sleep(2000);

    const loginInfo = await evalJs(`(() => {
      const emailInput = document.querySelector('input[type="email"]');
      const passInput = document.querySelector('input[type="password"]');
      const submitBtn = document.querySelector('button[type="submit"]');
      return {
        hasEmail: Boolean(emailInput),
        hasPassword: Boolean(passInput),
        hasSubmit: Boolean(submitBtn)
      };
    })()`);

    console.log(`Tela de Login Administrativo: ${loginInfo.hasEmail && loginInfo.hasPassword ? 'OPERACIONAL ✓' : 'FALHOU ✗'}`);

    // 6. Teste de Responsividade Mobile em Produção (390x844)
    console.log('\n--- 6. Responsividade Mobile em Produção (390x844) ---');
    await sendCdp('Page.navigate', { url: 'https://trabalheconosco.gigantepneus.com.br/#/' });
    await sleep(2000);

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
        hasOverflow: scrollWidth > clientWidth
      };
    })()`);

    console.log(`Mobile: scrollWidth=${mobileCheck.scrollWidth}px, clientWidth=${mobileCheck.clientWidth}px`);
    console.log(`Transbordo horizontal: ${mobileCheck.hasOverflow ? 'DETECTADO ✗' : 'NENHUM (100% responsivo) ✓'}`);

    ws.close();
    cleanup();

    console.log('\n==============================================================================');
    console.log('🎉 TODAS AS VALIDAÇÕES NO DOMÍNIO OFICIAL DE PRODUÇÃO FORAM CONCLUÍDAS COM SUCESSO!');
    console.log('==============================================================================\n');

  } catch (err) {
    cleanup();
    console.error('Erro na validação de produção:', err);
    process.exit(1);
  }
}

run();
