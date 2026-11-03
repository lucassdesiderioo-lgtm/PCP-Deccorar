#!/usr/bin/env node
/* teste_devolucao_casos_tela.js — a TELA de Devoluções → Em andamento
 * (public/devolucao-casos.html), num navegador de verdade.
 *
 *   node teste_devolucao_casos_tela.js
 *
 * Nasceu do CONSERTO de 03/11/2026: o dono digitou o responsável e o valor do
 * ML, clicou um dos dois "Salvar" do caso, e o outro campo voltou ao que era —
 * cada "Salvar" gravava só o seu bloco e o caso inteiro era redesenhado por
 * cima do que estava digitado. E no "ML devolve" o responsável era gravado e
 * não aparecia. Os dois só se veem com a tela aberta: a rota respondia 200.
 *
 * O que este arquivo trava, em uma linha cada:
 *   - "Salvar alterações" grava TODO campo mudado do caso, de qualquer bloco;
 *   - uma ação (etapa, prazo…) não apaga o que está digitado em outro bloco;
 *   - campo mudado e não salvo fica marcado, e Fechar pergunta antes;
 *   - o recusado fica no campo, marcado, e o resto é gravado;
 *   - cada campo do lançamento e do caso chega ao banco (varredura);
 *   - a revisão do frete do "ML devolve", de ponta a ponta, pela tela;
 *   - a 400 px a página não rola de lado.
 *
 * ⚠️ PRECISA DE NAVEGADOR (Playwright + Chromium). Sem eles o arquivo diz
 * "PULADO" e sai sem falhar — e isso NÃO é aprovação: o CI do GitHub não tem
 * navegador, então lá esta tela não é conferida. Rode aqui ou no Mac.
 *
 * ⚠️ NÃO SOBE O server.js. A porta dele é fixa (3010), e rodar isto no
 * servidor de produção bateria na produção. Aqui sobe um Express só com as
 * rotas das devoluções, num banco temporário e numa porta livre.
 */
const fs = require('fs'), os = require('os'), path = require('path');

let chromium;
try { chromium = require('playwright').chromium; }
catch(e){ console.log('PULADO: sem Playwright neste computador — a tela NÃO foi conferida.'); process.exit(0); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-devtela-'));
process.env.PCP_DEVOLUCOES_DIR = path.join(tmp, 'devolucoes');
const Database = require('better-sqlite3');
const express = require('express');
const db = new Database(path.join(tmp, 'dados.db'));
db.exec(`CREATE TABLE skus (codigo TEXT PRIMARY KEY, estoque INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, cor TEXT, buyer TEXT,
    city TEXT, nf TEXT, venda TEXT, packId TEXT, data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
  INSERT INTO skus (codigo) VALUES ('BK140140BEGE');
  INSERT INTO lote (codigo,buyer,nf,venda) VALUES ('BK140140BEGE','Compradora Tela','9001','2000000000090001');`);

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){ ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado)); }
function secao(t){ console.log('\n── ' + t + ' ──'); }

/* Quem é quem: 1 é o Admin Geral (tudo, inclusive o dinheiro). */
const PERMS = { 1: new Set(['devolucao.lancar','devolucao.acompanhar','devolucao.dinheiro','devolucao.registrar','devolucao.baixar','listas.editar']) };
const app = express();
app.use(express.json({ limit:'25mb' }));
app.locals.acesso = {
  podePermissao(u, chave){ return !!(u && PERMS[u.id] && PERMS[u.id].has(chave)); },
  auditar(){}
};
app.use((req, res, next) => { req.usuario = { id:1, nome:'Lucas Tela' }; next(); });
app.get('/api/auth/eu', (req, res) => res.json({ logado:true, nome:'Lucas Tela', destino:{} }));
app.get('/api/teste', (req, res) => res.json({ ativo:false }));
app.get('/api/skus', (req, res) => res.json(db.prepare('SELECT * FROM skus').all()));
require('./cad_route')(app, db);
require('./dev_route')(app, db);
require('./devcaso_route')(app, db);
app.get('/devolucao-casos', (req, res) => res.sendFile(path.join(__dirname, 'public', 'devolucao-casos.html')));
app.use(express.static(path.join(__dirname, 'public')));

const caso = (id) => db.prepare('SELECT * FROM devolucao_caso WHERE id=?').get(id);
const dia = (k) => db.prepare("SELECT date('now','localtime',?) d").get((k>=0?'+':'')+k+' days').d;

const srv = app.listen(0, async () => {
  const B = 'http://127.0.0.1:' + srv.address().port;
  let b;
  try { b = await chromium.launch(); }
  catch(e){ console.log('PULADO: sem Chromium neste computador — a tela NÃO foi conferida.'); srv.close(); fim(true); return; }
  const erros = [];
  try {
    const pg = async (w) => {
      const p = await (await b.newContext({ viewport:{ width:w||1440, height:1000 } })).newPage();
      p.on('pageerror', e => erros.push(e.message));
      return p;
    };
    const api = async (p, metodo, url, corpo) => (await p.request[metodo.toLowerCase()](B + url, corpo ? { data:corpo } : undefined)).json();
    let p = await pg();
    const tr = await api(p, 'POST', '/api/devolucao-casos/transportadoras', { nome:'Transp Tela' });

    /* ═════════ 1. o lançamento: cada campo chega ao banco ═════════ */
    secao('o lançamento — cada campo do formulário chega ao banco');
    await p.goto(B + '/devolucao-casos'); await p.waitForTimeout(800);
    eq('o "passado em" já vem com hoje', await p.inputValue('#lPassado'), dia(0));
    await p.fill('#lVenda', '2000000000090001'); await p.waitForTimeout(900);
    eq('achar a venda preenche a NF', await p.inputValue('#lNf'), '9001');
    await p.selectOption('#lMotivo', 'Falta de kit');
    await p.fill('#lPrazo', dia(6)); await p.fill('#lResp', 'Renato Tela'); await p.fill('#lObs', 'obs do lançamento');
    await p.fill('#lCep', '80010-000'); await p.selectOption('#lTransp', String(tr.id));
    await p.fill('#lCusto', '35,50'); await p.selectOption('#lSit', 'pedir'); await p.fill('#lValor', '120,00');
    await p.fill('#lEtiqueta', '10,00');
    await p.click('#lPub [data-pub="1"]');
    await p.fill('#lLink', 'https://www.mercadolivre.com.br/reclamacao/1');
    await p.fill('#lMsgMl', 'linha 1\nlinha 2');
    await p.click('#btLancar'); await p.waitForTimeout(1000);
    const cid = +((await p.textContent('#lMsg')).match(/#(\d+)/) || [])[1];
    const c1 = caso(cid) || {};
    eq('lançou', !!cid, true);
    eq('   motivo', c1.motivo, 'Falta de kit');
    eq('   prazo', c1.prazo, dia(6));
    eq('   responsável', c1.responsavel, 'Renato Tela');
    eq('   observação', c1.obs, 'obs do lançamento');
    eq('   passado em', c1.passado_em, dia(0));
    eq('   CEP', c1.cep, '80010000');
    eq('   já nasce em Coleta pedida', c1.etapa, 'coleta_pedida');
    eq('   custo da tentativa', db.prepare('SELECT custo FROM devolucao_coleta WHERE caso_id=?').get(cid).custo, 35.5);
    eq('   situação do valor', c1.valor_ml_situacao, 'pedir');
    eq('   valor do ML', c1.valor_ml, 120);
    eq('   custo da etiqueta', c1.custo_etiqueta, 10);
    eq('   publicidade', c1.publicidade, 1);
    eq('   link', c1.link_ml, 'https://www.mercadolivre.com.br/reclamacao/1');
    eq('   mensagem, com a quebra de linha', c1.mensagem_ml, 'linha 1\nlinha 2');

    /* ═════════ 2. o defeito que o dono pegou ═════════ */
    secao('o caso — dois campos de blocos diferentes, UM clique (o defeito de 03/11)');
    await p.locator('#listaColeta .linha', { hasText:'#'+cid }).locator('.t1').click(); await p.waitForTimeout(800);
    await p.fill('#eResp', 'Fulano Novo'); await p.fill('#dValor', '77,70');
    ok('os dois ficam marcados como não salvos', await p.$eval('#eResp', e => e.classList.contains('naosalvo')) && await p.$eval('#dValor', e => e.classList.contains('naosalvo')));
    ok('   e a barra diz quais', /Responsável/.test(await p.textContent('#barraSujo')) && /Valor do ML/.test(await p.textContent('#barraSujo')));
    await p.click('#btValor'); await p.waitForTimeout(1200);
    eq('clicando o "Salvar" do dinheiro: o responsável é gravado', caso(cid).responsavel, 'Fulano Novo');
    eq('   e o valor também', caso(cid).valor_ml, 77.7);
    ok('   a tela diz o que salvou', /Salvo/.test(await p.textContent('#cMsg')));
    eq('   e a barra some', await p.isVisible('#barraSujo'), false);
    await p.fill('#dValor', '88,80'); await p.fill('#eObs', 'outra obs');
    await p.click('#btEditar'); await p.waitForTimeout(1200);
    eq('clicando o "Salvar" do lançamento: o valor é gravado', caso(cid).valor_ml, 88.8);
    eq('   e a observação também', caso(cid).obs, 'outra obs');

    secao('o caso — uma ação não apaga o que está digitado em outro bloco');
    await p.fill('#eResp', 'Digitado Antes'); await p.fill('#dEtiqueta', '12,00');
    await p.click('#painel [data-etapa="docs_enviados"]').catch(() => {});
    await p.waitForTimeout(400);
    await p.click('#painel [data-etapa="lancado"]'); await p.waitForTimeout(1200);
    eq('a etapa andou', caso(cid).etapa, 'lancado');
    eq('o responsável digitado continua no campo', await p.inputValue('#eResp'), 'Digitado Antes');
    eq('   o custo da etiqueta também', await p.inputValue('#dEtiqueta'), '12,00');
    ok('   os dois continuam marcados', await p.$eval('#eResp', e => e.classList.contains('naosalvo')));
    eq('   e nada foi gravado sem pedir', caso(cid).responsavel, 'Fulano Novo');
    await p.fill('#novoPrazo', dia(9)); await p.click('#btPrazo'); await p.waitForTimeout(1200);
    eq('o prazo novo foi lançado', caso(cid).prazo, dia(9));
    eq('   e o responsável digitado continua', await p.inputValue('#eResp'), 'Digitado Antes');
    eq('   e o campo do prazo, que era da ação, não volta', await p.inputValue('#novoPrazo'), '');
    await p.click('#btSalvarTudo'); await p.waitForTimeout(1200);
    eq('"Salvar alterações" da barra grava o responsável', caso(cid).responsavel, 'Digitado Antes');
    eq('   e o custo da etiqueta', caso(cid).custo_etiqueta, 12);

    secao('o caso — o recusado fica no campo, e o resto é gravado');
    await p.fill('#eResp', 'Grava Este'); await p.fill('#dValor', 'abc');
    await p.click('#btSalvarTudo'); await p.waitForTimeout(1200);
    eq('o responsável foi gravado', caso(cid).responsavel, 'Grava Este');
    eq('o valor impossível não', caso(cid).valor_ml, 88.8);
    eq('   e continua no campo', await p.inputValue('#dValor'), 'abc');
    ok('   marcado', await p.$eval('#dValor', e => e.classList.contains('naosalvo')));
    ok('   e a tela diz que não salvou, e por quê', /NÃO salvo/.test(await p.textContent('#cMsg')), await p.textContent('#cMsg'));

    secao('o caso — Fechar com campo não salvo pergunta antes');
    let perguntou = '';
    p.once('dialog', d => { perguntou = d.message(); d.dismiss(); });
    await p.click('#painel button:has-text("Fechar")'); await p.waitForTimeout(300);
    ok('perguntou, dizendo o campo', /Valor do ML/.test(perguntou), perguntou);
    eq('   e, recusando, o caso continua aberto', await p.isVisible('#painel'), true);
    await p.click('#btDescartar'); await p.waitForTimeout(200);
    eq('"Descartar" devolve o valor gravado', await p.inputValue('#dValor'), '88,80');
    let pergunta2 = '';
    p.once('dialog', d => { pergunta2 = d.message(); d.accept(); });
    await p.click('#painel button:has-text("Fechar")'); await p.waitForTimeout(300);
    eq('sem nada digitado, fecha sem perguntar', pergunta2, '');

    /* ═════════ 3. a varredura dos campos do caso ═════════ */
    secao('o caso — varredura: cada campo do "Editar" e do dinheiro chega ao banco');
    await p.locator('#listaColeta .linha', { hasText:'#'+cid }).locator('.t1').click(); await p.waitForTimeout(800);
    const novos = { eNf:'9999', eSku:'BK140140BEGE', eResp:'Varredura', eObs:'obs varredura', eLink:'https://www.mercadolivre.com.br/x/2', eMsgMl:'msg varredura' };
    for(const k of Object.keys(novos)) await p.fill('#'+k, novos[k]);
    await p.selectOption('#eMotivo', 'Comando quebrado'); await p.selectOption('#ePub', '0');
    await p.fill('#dValor', '99,90'); await p.fill('#dEtiqueta', '5,00');
    await p.fill('#painel [data-custot]', '41,00');
    await p.click('#btSalvarTudo'); await p.waitForTimeout(1500);
    const cv = caso(cid);
    eq('   NF', cv.nf, '9999'); eq('   SKU', cv.sku, 'BK140140BEGE'); eq('   responsável', cv.responsavel, 'Varredura');
    eq('   observação', cv.obs, 'obs varredura'); eq('   link', cv.link_ml, 'https://www.mercadolivre.com.br/x/2');
    eq('   mensagem', cv.mensagem_ml, 'msg varredura'); eq('   motivo', cv.motivo, 'Comando quebrado');
    eq('   publicidade', cv.publicidade, 0); eq('   valor do ML', cv.valor_ml, 99.9); eq('   custo da etiqueta', cv.custo_etiqueta, 5);
    eq('   custo da tentativa', db.prepare('SELECT custo FROM devolucao_coleta WHERE caso_id=?').get(cid).custo, 41);
    eq('   e nada ficou marcado', await p.isVisible('#barraSujo'), false);
    await p.selectOption('#qMotivo', 'Falta de kit'); await p.waitForTimeout(1000);
    eq('o motivo do alto salva ao escolher', caso(cid).motivo, 'Falta de kit');
    await p.click('#painel button:has-text("Fechar")');

    /* ═════════ 4. o ML devolve: responsável e revisão do frete ═════════ */
    secao('o ML devolve — o responsável aparece, e a revisão do frete pela tela');
    const ml = await api(p, 'POST', '/api/devolucao-casos', { tipo:'ml', venda:'2000000000090077', publicidade:false });
    await p.goto(B + '/devolucao-casos'); await p.waitForTimeout(800);
    await p.locator('#listaMl .linha', { hasText:'#'+ml.id }).locator('.t1').click(); await p.waitForTimeout(800);
    await p.fill('#eResp', 'Resp do ML'); await p.click('#btEditar'); await p.waitForTimeout(1000);
    ok('o responsável aparece no caso do ML devolve', /Resp do ML/.test(await p.locator('#painel .dados').first().textContent()));
    eq('antes de chegar não há o botão da revisão', await p.$('#btRevisao'), null);
    await p.click('#btChegou'); await p.waitForTimeout(1000);
    await p.fill('#eObs', 'digitado antes de pedir revisão');
    await p.fill('#rvNumero', 'REV-77'); await p.click('#btRevisao'); await p.waitForTimeout(1000);
    ok('a revisão foi pedida', !!caso(ml.id).revisao_pedida_em);
    eq('   com o número', caso(ml.id).revisao_numero, 'REV-77');
    eq('   e a observação digitada continua no campo', await p.inputValue('#eObs'), 'digitado antes de pedir revisão');
    await p.fill('#rvValor', '48,70'); await p.click('#btRevDevolveu'); await p.waitForTimeout(1000);
    eq('"ML devolveu", com o valor', caso(ml.id).revisao_resultado + '/' + caso(ml.id).valor_revisao, 'devolveu/48.7');
    await p.fill('#dEtiqueta', '48,70'); await p.click('#btValor'); await p.waitForTimeout(1000);
    eq('o frete cobrado pelo "Salvar alterações" do dinheiro', caso(ml.id).custo_etiqueta, 48.7);
    eq('   e a observação foi junto', caso(ml.id).obs, 'digitado antes de pedir revisão');

    /* ═════════ 5. o celular ═════════ */
    secao('a 400 px — a página não rola de lado, e o caso abre');
    const p4 = await pg(400);
    await p4.goto(B + '/devolucao-casos'); await p4.waitForTimeout(800);
    let m = await p4.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    eq('a lista', m[0] <= m[1], true);
    await p4.locator('#listaMl .linha', { hasText:'#'+ml.id }).locator('.t1').click(); await p4.waitForTimeout(800);
    await p4.fill('#eResp', 'x');
    m = await p4.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    eq('o caso aberto, com a barra de não salvo', m[0] <= m[1], true);

    eq('nenhum erro de JavaScript na tela', JSON.stringify(erros), '[]');
  } catch(e){ falhas++; console.log('ESTOUROU: ' + e.stack); }
  await b.close(); srv.close(); fim();
});

function fim(pulado){
  db.close(); fs.rmSync(tmp, { recursive:true, force:true });
  if(pulado) process.exit(0);
  console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
  process.exit(falhas ? 1 : 0);
}
