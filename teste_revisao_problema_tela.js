#!/usr/bin/env node
/* teste_revisao_problema_tela.js — o botão "Peça com problema" da 101 Revisão,
 * num navegador de verdade, com toque de iPad (CONSERTO de 23/11/2026).
 *
 *   node teste_revisao_problema_tela.js
 *
 * O dono: "o botão aparece mas não consigo clicar, quando clico nele ele pisca
 * o campo de SKU". A tela devolve o foco ao campo do bipe 50 ms depois de ele
 * perder o foco (o `keep`), e isso roubava o toque do campo da observação, com
 * a janela do motivo aberta. E a recusa do servidor aparecia como "Voltou para
 * a produção", sem nada gravado.
 *
 * NÃO sobe o servidor: as rotas são de mentira (page.route), só o bastante para
 * a tela abrir. Sem Playwright/Chromium diz "PULADO" e sai sem falhar.
 */
const fs = require('fs'), path = require('path');
let pw;
try { pw = require('playwright'); }
catch(e){ console.log('PULADO: sem Playwright neste computador — a tela NÃO foi conferida.'); process.exit(0); }
const PUB = path.join(__dirname, 'public');

let n = 0, falhas = 0;
function ok(desc, cond, det){ n++; if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (det !== undefined ? '\n         ' + JSON.stringify(det) : '')); } }

async function abrir(browser, opc){
  opc = opc || {};
  const ctx = await browser.newContext(Object.assign({}, pw.devices['iPad (gen 7) landscape']));
  const p = await ctx.newPage();
  const erros = [], posts = [];
  p.on('pageerror', e => erros.push(e.message));
  const J = {
    '/api/skus': [{ codigo:'BK140160CINZA', cor:'CINZA', largura_cm:140, altura_cm:160 }],
    '/api/producao': [], '/api/revisao/dia': [], '/api/revisao/hoje': [], '/api/revisao/defeitos': [],
    '/api/revisao/lista': { hoje:'2026-11-23', dias:[], ate:null, hoje_lista:[], proximos_lista:[], alvo_lista:[],
      totais:{ hoje:0, hoje_revisadas:0, proximos:0, alvo:0 }, hoje_terminado:false, sem_venda_hoje:true, minhas:{ qtd:0, media_seg:null } },
    '/api/revisao/ultima': { minimo_seg:0, desfazer:null }, '/api/revisao/status': { lancado:false, corte:'10:30' },
    '/api/listas/rejeicao': opc.motivos !== undefined ? opc.motivos : [{ valor:'Tecido manchado' }, { valor:'Medida errada' }],
    '/api/auth/eu': { logado:true, nome:'Ana', destino:{} },
    '/api/telas/minhas': { telas:[], perms:['revisao.executar','revisao.rejeitar'] },
    '/api/teste/ativo': { ativo:false }, '/api/inventario/tarja': {}
  };
  await p.route('**/*', async r => {
    const u = new URL(r.request().url());
    if(u.pathname === '/operador') return r.fulfill({ body:fs.readFileSync(path.join(PUB, 'operador.html')), contentType:'text/html' });
    if(u.pathname.startsWith('/api/')){
      if(r.request().method() === 'POST'){
        posts.push({ rota:u.pathname, corpo:r.request().postDataJSON() });
        if(u.pathname === '/api/rejeicao' && opc.recusa) return r.fulfill({ status:403, json:{ erro:'Sem permissão para registrar peça com problema' } });
        return r.fulfill({ json:{ ok:true } });
      }
      return r.fulfill({ json: J[u.pathname] !== undefined ? J[u.pathname] : {} });
    }
    const f = path.join(PUB, u.pathname);
    if(f.startsWith(PUB) && fs.existsSync(f) && fs.statSync(f).isFile())
      return r.fulfill({ body:fs.readFileSync(f), contentType: f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream' });
    return r.fulfill({ status:404, body:'' });
  });
  await p.addInitScript(() => { try{ localStorage.setItem('rev_modo','hoje'); }catch(e){} });
  await p.goto('http://pcp.local/operador');
  await p.waitForTimeout(700);
  await p.fill('#scan', 'BK140160CINZA'); await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  return { p, ctx, erros, posts };
}

(async () => {
  let browser;
  try { browser = await pw.chromium.launch(); }
  catch(e){ console.log('PULADO: sem Chromium neste computador — a tela NÃO foi conferida.'); process.exit(0); }

  console.log('\n── 1. o toque no botão abre a janela do motivo ──');
  let t = await abrir(browser);
  ok('o botão aparece com a revisão aberta', await t.p.isVisible('#rjBt'));
  await t.p.tap('#rjBt'); await t.p.waitForTimeout(300);
  ok('a janela do motivo abre', !!(await t.p.$('#rjBox')));

  console.log('\n── 2. o campo da observação não perde o foco para o bipe ──');
  await t.p.tap('#rjObs'); await t.p.waitForTimeout(300);
  const foco = await t.p.evaluate(() => document.activeElement && document.activeElement.id);
  ok('tocar na observação deixa o foco nela (não pisca o campo do SKU)', foco === 'rjObs', foco);
  await t.p.keyboard.type('borda solta'); await t.p.waitForTimeout(100);
  ok('o que se digita fica na observação', (await t.p.inputValue('#rjObs')) === 'borda solta');
  ok('e nada caiu no campo do bipe', (await t.p.inputValue('#scan')) === '');

  console.log('\n── 3. escolher o motivo grava e fecha ──');
  await t.p.tap('.rjOp'); await t.p.waitForTimeout(400);
  const post = t.posts.find(x => x.rota === '/api/rejeicao');
  ok('o motivo foi enviado', !!post);
  ok('com a observação digitada', post && post.corpo.obs === 'borda solta', post);
  ok('a janela fechou', !(await t.p.$('#rjBox')));
  ok('a tela diz que voltou para a produção', /Voltou para a produção/.test(await t.p.textContent('#banner')));
  ok('o foco voltou ao bipe depois', await t.p.evaluate(() => document.activeElement.id) === 'scan');
  ok('sem erro de script', t.erros.length === 0, t.erros);
  await t.ctx.close();

  console.log('\n── 4. o bipe com a janela aberta não fecha a revisão por baixo ──');
  t = await abrir(browser);
  await t.p.tap('#rjBt'); await t.p.waitForTimeout(200);
  await t.p.evaluate(() => { const s = document.getElementById('scan'); s.focus(); s.value = 'BK140160CINZA'; });
  await t.p.keyboard.press('Enter'); await t.p.waitForTimeout(300);
  ok('nenhuma revisão foi gravada por baixo da janela', !t.posts.some(x => x.rota === '/api/revisao'), t.posts);
  ok('a janela continua aberta', !!(await t.p.$('#rjBox')));
  await t.ctx.close();

  console.log('\n── 5. a recusa do servidor não vira "voltou para a produção" ──');
  t = await abrir(browser, { recusa:true });
  await t.p.tap('#rjBt'); await t.p.waitForTimeout(200);
  await t.p.tap('.rjOp'); await t.p.waitForTimeout(400);
  const ban = await t.p.textContent('#banner');
  ok('a tela não diz que voltou', !/Voltou para a produção/.test(ban), ban);
  ok('a tela mostra a recusa', /não foi registrada/i.test(ban) && /Sem permissão/.test(ban), ban);
  ok('a revisão continua aberta (dá para tentar de novo)', await t.p.isVisible('#rjBt'));
  await t.ctx.close();

  console.log('\n── 6. sem motivo cadastrado, a janela diz o que fazer ──');
  t = await abrir(browser, { motivos:[] });
  await t.p.tap('#rjBt'); await t.p.waitForTimeout(200);
  ok('a janela avisa que não há motivo cadastrado', /Nenhum motivo cadastrado/i.test(await t.p.textContent('#rjBox')));
  await t.ctx.close();

  await browser.close();
  console.log('\n' + (falhas ? falhas + ' FALHA(S) de ' + n : 'todos os ' + n + ' casos passaram'));
  process.exit(falhas ? 1 : 0);
})();
