#!/usr/bin/env node
/* teste_revisao_tela_unica_tela.js — a TELA da 101 Revisão em tela única
 * (spec REVISAO-TELA-UNICA, 23/11/2026), num navegador de verdade, com as
 * rotas de verdade (revisao_route, plan_route, exp_route) num banco temporário
 * e numa porta livre. NÃO sobe o server.js (a 3010 é a produção).
 *
 *   node teste_revisao_tela_unica_tela.js
 *
 *   1  abre direto no bipe, sem escolher cor; Hoje em destaque com os cartões
 *   2  o bipe abre a revisão dizendo para onde a peça vai
 *   3  "↩ Devoluções" não sai com a revisão aberta; sem ela, vai à 251, que
 *      mostra "← Voltar para a Revisão"
 *   4  "Ver a semana" abre por cima e fecha
 *   5  terminado o dia: faixa verde e os próximos dias no destaque
 *   6  a venda nova de hoje: faixa vermelha
 *   7  o tablet deitado (1180) e o celular (400) não rolam de lado; nenhum
 *      erro de script
 *
 * Sem Playwright/Chromium diz "PULADO" e sai sem falhar.
 */
const fs = require('fs'), os = require('os'), path = require('path');
let chromium;
try { chromium = require('playwright').chromium; }
catch(e){ console.log('PULADO: sem Playwright neste computador — a tela NÃO foi conferida.'); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-revtela-'));
process.env.PCP_DIR = tmp;
const express = require('express');
const db = require('./db');
const LISTA = require('./revisao_lista');

let n = 0, falhas = 0;
function ok(desc, cond, det){ n++; if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (det !== undefined ? '\n         ' + JSON.stringify(det) : '')); } }

const app = express(); app.use(express.json());
app.locals.acesso = { auditar(){}, podePermissao(){ return true; }, ehAdminGeral(){ return false; } };
app.use((q, r, nx) => { q.usuario = { id:1, nome:'Ana' }; nx(); });
let PERMS = ['revisao.executar','revisao.rejeitar','devolucao.registrar'];
app.get('/api/telas/minhas', (q, r) => r.json({ telas:[], perms:PERMS }));
app.get('/api/auth/eu', (q, r) => r.json({ logado:true, nome:'Ana', destino:{} }));
app.get('/api/teste/ativo', (q, r) => r.json({ ativo:false }));
require('./exp_route')(app, db); require('./plan_route')(app, db); require('./revisao_route')(app, db); require('./cad_route')(app, db);
app.get('/api/skus', (q, r) => r.json(db.prepare('SELECT * FROM skus').all()));
app.get('/operador', (q, r) => r.sendFile(path.join(__dirname, 'public', 'operador.html')));
app.get('/devolucao', (q, r) => r.sendFile(path.join(__dirname, 'public', 'devolucao.html')));
app.use(express.static(path.join(__dirname, 'public')));

const hoje = db.prepare("SELECT date('now','localtime') d").get().d, J = LISTA.janela(hoje);
db.exec(`INSERT OR IGNORE INTO modelo (id,codigo,nome,sob_medida,exige_medida) VALUES (1,'ROLO','Rolô',0,1)`);
const ins = db.prepare('INSERT INTO skus (codigo,estoque,modelo_id,largura_cm,altura_cm) VALUES (?,?,1,?,?)');
[['BK140160CINZA',0,140,160],['BK100160BEGE',0,100,160],['BK160140BEGE',1,160,140],['BK150160PRETO',0,150,160],['BK180160BRANCO',0,180,160]].forEach(x => ins.run(...x));
const vf = db.prepare(`INSERT INTO venda_futura (venda_id,codigo,data_venda,data_envio,unidades,grupo,estado) VALUES (?,?,?,?,1,'fabrica','x')`);
let k = 0; const v = (c, d, q) => { for(let i = 0; i < q; i++) vf.run('v' + (++k), c, hoje, d); };
v('BK140160CINZA', hoje, 2); v('BK140160CINZA', J[0], 1); v('BK100160BEGE', hoje, 1);
v('BK160140BEGE', J[0], 3); v('BK150160PRETO', J[J.length-1], 2);
const ordem = (c, q) => { for(let i = 0; i < q; i++) db.prepare("INSERT INTO lote (codigo,estagio,venda) VALUES (?,'pendente',?)").run(c, 'L' + c + Math.random());
  db.prepare("INSERT INTO producao (codigo,qtd,origem,urgente) VALUES (?,?,'ml',1)").run(c, q); };
ordem('BK140160CINZA', 2); ordem('BK100160BEGE', 1);
db.prepare("INSERT OR REPLACE INTO config (chave,valor) VALUES ('rev_minimo_seg','0')").run();

const srv = app.listen(0, async () => {
  const base = 'http://localhost:' + srv.address().port;
  let b;
  try { b = await chromium.launch(); }
  catch(e){ console.log('PULADO: sem Chromium neste computador — a tela NÃO foi conferida.'); srv.close(); process.exit(0); }
  const p = await b.newPage({ viewport:{ width:1180, height:820 } });
  const erros = []; p.on('pageerror', e => erros.push(e.message));
  const largura = () => p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  try {
    console.log('\n── 1. abre direto no bipe, com Hoje em destaque ──');
    await p.goto(base + '/operador'); await p.waitForTimeout(1200);
    ok('não pede para escolher cor', !(await p.$('#escolha')) && !(await p.$('.esc')));
    ok('o campo do bipe tem o foco', await p.evaluate(() => document.activeElement.id) === 'scan');
    ok('o bloco Hoje aparece', await p.isVisible('.foco.fh'));
    const cartoes = await p.$$eval('.foco.fh .cd', l => l.map(x => x.dataset.cod));
    ok('com os dois SKUs de hoje', cartoes.length === 2 && cartoes.includes('BK140160CINZA'), cartoes);
    ok('o cartão mostra a medida grande', /1,40 × 1,60/.test(await p.textContent('.foco.fh')));
    ok('"depois de hoje" e "completar o alvo" ficam pequenos', await p.isVisible('.depois .mini'));

    console.log('\n── 2. a revisão diz para onde a peça vai ──');
    await p.fill('#scan', 'BK140160CINZA'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
    ok('a revisão abre com o cronômetro', await p.isVisible('#timer'));
    ok('"Vai para: venda de hoje"', /Vai para: venda de hoje/.test(await p.textContent('#banner')));

    console.log('\n── 3. Devoluções ──');
    await p.click('#btDev'); await p.waitForTimeout(300);
    ok('com a revisão aberta, não sai da tela', /\/operador/.test(p.url()));
    ok('e diz por quê', /Termine ou cancele a revisão aberta/.test(await p.textContent('#banner')));
    await p.click('#cancBt'); await p.waitForTimeout(500);
    await p.click('#btDev'); await p.waitForURL(/devolucao/); await p.waitForTimeout(600);
    ok('sem revisão aberta, vai à 251', /\/devolucao\?de=revisao/.test(p.url()));
    ok('a 251 mostra "← Voltar para a Revisão"', /Voltar para a Revisão/.test(await p.textContent('#voltaRev')));
    await p.click('#voltaRev'); await p.waitForURL(/operador/); await p.waitForTimeout(800);
    ok('e o botão volta para a Revisão', /\/operador/.test(p.url()));

    console.log('\n── 4. Ver a semana ──');
    await p.click('#btSemana'); await p.waitForTimeout(500);
    ok('a semana abre por cima', await p.isVisible('#semana .sbox'));
    ok('com um dia por coluna da janela', (await p.$$eval('#semana thead th', l => l.length)) === J.length + 4);
    await p.click('#smFecha'); await p.waitForTimeout(200);
    ok('e fecha', !(await p.isVisible('#semana')));

    console.log('\n── 4-B. desfazer a última não dispara a faixa de venda nova (③ REVISÃO) ──');
    await p.fill('#scan', 'BK100160BEGE'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    await p.fill('#scan', 'BK100160BEGE'); await p.keyboard.press('Enter'); await p.waitForTimeout(3800);
    ok('a última de hoje do BEGE foi revisada', /Revisada/.test(await p.textContent('#banner')));
    await p.click('#desfBt'); await p.waitForTimeout(200); await p.click('#desfSim'); await p.waitForTimeout(3800);
    ok('a revisão foi desfeita', /Revisão desfeita/.test(await p.textContent('#banner')));
    ok('e a faixa de venda nova NÃO apareceu', !(await p.isVisible('#faixaNova')));

    console.log('\n── 4-C. a bancada (③ REVISÃO) ──');
    await p.fill('#scan', 'BK140160CINZA'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    const antes = db.prepare('SELECT COUNT(*) n FROM revisao').get().n;
    await p.click('.cd[data-cod="BK100160BEGE"], .mini [data-cod="BK100160BEGE"]').catch(()=>{});
    await p.waitForTimeout(400);
    ok('tocar no cartão de OUTRO SKU não fecha a revisão aberta', db.prepare('SELECT COUNT(*) n FROM revisao').get().n === antes && /Vai para/.test(await p.textContent('#banner')));
    await p.click('#btSemana'); await p.waitForTimeout(400);
    await p.evaluate(() => { const s = document.getElementById('scan'); s.focus(); s.value = 'BK140160CINZA'; });
    await p.keyboard.press('Enter'); await p.waitForTimeout(500);
    ok('o bipe com a semana aberta fecha a semana (a pessoa vê o que gravou)', !(await p.isVisible('#semana')));
    ok('e a revisão fechou à vista', /Revisada/.test(await p.textContent('#banner')));
    await p.waitForTimeout(3500);
    ok('o cabeçalho de Hoje concorda no singular', !/1 já revisadas/.test(await p.textContent('#tiles')), await p.textContent('#tiles .fcab'));
    db.prepare("DELETE FROM revisao WHERE id=(SELECT MAX(id) FROM revisao)").run();
    db.prepare("DELETE FROM fila WHERE id=(SELECT MAX(id) FROM fila)").run();

    console.log('\n── 5. terminado o dia ──');
    db.prepare("INSERT INTO revisao (codigo,segundos,modo,usuario_id) VALUES ('BK140160CINZA',60,'hoje',1),('BK140160CINZA',60,'hoje',1),('BK100160BEGE',60,'hoje',1)").run();
    await p.waitForTimeout(3500);
    ok('a faixa verde "Hoje está terminado"', /Hoje está terminado/.test(await p.textContent('#tiles')));
    ok('os próximos dias sobem para o destaque', await p.isVisible('.foco.fp'));
    ok('o topo conta as revisadas da pessoa', (await p.textContent('#cQtd')) === '3');

    console.log('\n── 6. a venda nova de hoje ──');
    ordem('BK180160BRANCO', 1);
    await p.waitForTimeout(3500);
    ok('a faixa vermelha aparece', await p.isVisible('#faixaNova'));
    ok('dizendo qual', /1,80 × 1,60/.test(await p.textContent('#faixaNova')), await p.textContent('#faixaNova'));
    await p.click('#fxOk'); await p.waitForTimeout(200);
    ok('e fecha no "Entendi"', !(await p.isVisible('#faixaNova')));
    ok('Hoje volta ao destaque', await p.isVisible('.foco.fh'));

    console.log('\n── 6-A. venda nova de um SKU que já tinha saído de Hoje pelo estoque (③ REVISÃO, rodada 2) ──');
    /* O 1,80 BRANCO sai de Hoje porque o estoque cobriu (atendidas), e depois
       o PDF traz 1 venda nova dele: a faixa tem que aparecer. */
    db.prepare("UPDATE skus SET estoque=1 WHERE codigo='BK180160BRANCO'").run();
    await p.waitForTimeout(3500);
    ok('o BRANCO saiu de Hoje (o estoque cobriu)', !(await p.$('.foco.fh .cd[data-cod="BK180160BRANCO"]')));
    db.prepare("INSERT INTO lote (codigo,estagio,venda) VALUES ('BK180160BRANCO','pendente','novaB')").run();
    await p.waitForTimeout(3500);
    ok('a venda nova dele traz a faixa de novo', await p.isVisible('#faixaNova'));
    if(await p.isVisible('#faixaNova')) await p.click('#fxOk');

    console.log('\n── 6-B. sem a chave da 251, o "↩ Devoluções" some (③ REVISÃO) ──');
    PERMS = ['revisao.executar'];
    await p.reload(); await p.waitForTimeout(1200);
    ok('quem só revisa não vê o botão', !(await p.isVisible('#btDev')));
    PERMS = ['revisao.executar','revisao.rejeitar','devolucao.registrar'];
    await p.reload(); await p.waitForTimeout(1200);

    console.log('\n── 7. larguras e erros ──');
    let w = await largura(); ok('1180 px: nada rola de lado', w[0] <= w[1], w);
    await p.setViewportSize({ width:400, height:800 }); await p.waitForTimeout(300);
    w = await largura(); ok('400 px: nada rola de lado', w[0] <= w[1], w);
    ok('nenhum erro de script', erros.length === 0, erros);
  } catch(e){ falhas++; console.log('  FALHOU — o teste parou: ' + (e.message || e)); }
  await b.close(); srv.close();
  console.log('\n' + (falhas ? falhas + ' FALHA(S) de ' + n : 'todos os ' + n + ' casos passaram'));
  process.exit(falhas ? 1 : 0);
});
