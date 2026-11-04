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
db.exec(`CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, modo TEXT, situacao TEXT DEFAULT 'aguardando', teste INTEGER DEFAULT 0);
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, estoque INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, cor TEXT, buyer TEXT,
    city TEXT, nf TEXT, venda TEXT, packId TEXT, data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
  INSERT INTO skus (codigo) VALUES ('BK140140BEGE');
  ALTER TABLE skus ADD COLUMN largura_cm INTEGER; ALTER TABLE skus ADD COLUMN altura_cm INTEGER;
  ALTER TABLE skus ADD COLUMN cor_codigo TEXT; ALTER TABLE skus ADD COLUMN descricao TEXT; ALTER TABLE skus ADD COLUMN tecido_codigo TEXT;
  INSERT INTO skus (codigo,largura_cm,altura_cm,cor_codigo) VALUES ('BK150150BRANCO',150,150,'BRANCO');
  INSERT INTO lote (codigo,buyer,nf,venda) VALUES ('BK140140BEGE','Compradora Tela','9001','2000000000090001');
  CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nome TEXT, ativo INTEGER DEFAULT 1);
  INSERT INTO usuarios (id,nome,ativo) VALUES (1,'Lucas Tela',1),(2,'Renato Tela',1),(3,'Edvaldo Tela',1),(4,'Saiu Tela',0);`);

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){ ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado)); }
let SEC=''; function secao(t){ SEC=t; console.log('\n── ' + t + ' ──'); }
/* A lista em dois grupos (fase 2): o "Esperando outros" nasce recolhido;
   para clicar num caso de lá, o teste abre o grupo, como a pessoa faria. */
const abreFora = (pg) => pg.evaluate(() => document.querySelectorAll("details.foraGrupo").forEach(d => { d.open = true; }));

/* Quem é quem: 1 é o Admin Geral (tudo, inclusive o dinheiro). */
/* 2 só acompanha: desde 03/11/2026 vê e lança os valores do caso, sem a
   baixa do reembolso. QUEM troca a pessoa da sessão no meio do teste. */
const PERMS = { 1: new Set(['devolucao.lancar','devolucao.acompanhar','devolucao.dinheiro','devolucao.registrar','devolucao.baixar','listas.editar']),
                2: new Set(['devolucao.acompanhar']),
                /* 3 só registra a peça (o Edvaldo). */
                3: new Set(['devolucao.registrar']) };
let QUEM = 1;
const app = express();
app.use(express.json({ limit:'25mb' }));
app.locals.acesso = {
  podePermissao(u, chave){ return !!(u && PERMS[u.id] && PERMS[u.id].has(chave)); },
  auditar(){}
};
app.use((req, res, next) => { req.usuario = QUEM === 1 ? { id:1, nome:'Lucas Tela' } : QUEM === 2 ? { id:2, nome:'Renato Tela' } : { id:3, nome:'Edvaldo Tela' }; next(); });
app.get('/api/auth/eu', (req, res) => res.json({ logado:true, nome:'Lucas Tela', destino:{} }));
app.get('/api/teste', (req, res) => res.json({ ativo:false }));
app.get('/api/skus', (req, res) => res.json(db.prepare('SELECT * FROM skus').all()));
require('./cad_route')(app, db);
require('./dev_route')(app, db);
require('./devcaso_route')(app, db);
app.get('/devolucao-casos', (req, res) => res.sendFile(path.join(__dirname, 'public', 'devolucao-casos.html')));
app.get('/devolucao', (req, res) => res.sendFile(path.join(__dirname, 'public', 'devolucao.html')));
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
      p.on('pageerror', e => erros.push(SEC+' · '+e.message));
      return p;
    };
    /* O lançamento exige motivo, SKU, comprador, responsável e link (04/11/2026):
       os casos de antes não falam disso e ganham valores de teste; quem testa
       a obrigação manda a chave (o SKU e o comprador só se a venda não está no lote). */
    const PAD_LANCAR = (c) => {
      const lt = db.prepare('SELECT codigo,buyer FROM lote WHERE venda=? OR packId=?').get(c.venda||'', c.venda||'') || {};
      const pad = { motivo:'Falta de kit', responsavel_id:1, link_ml:'https://www.mercadolivre.com.br/reclamacao/tela' };
      if(!lt.codigo) pad.sku = 'BK140140BEGE';
      /* Um nome por caso: o mesmo nome em todos juntaria os casos no "mesmo comprador". */
      if(!lt.buyer) pad.comprador = 'Cliente ' + String(c.venda||c.nf||'x').replace(/\D/g,'').slice(-6).replace(/\d/g, d => 'abcdefghij'[d]);
      for(const k of Object.keys(pad)) if(k in c) delete pad[k];
      return Object.assign(pad, c);
    };
    const api = async (p, metodo, url, corpo) => {
      if(metodo === 'POST' && url === '/api/devolucao-casos' && corpo) corpo = PAD_LANCAR(corpo);
      return (await p.request[metodo.toLowerCase()](B + url, corpo ? { data:corpo } : undefined)).json();
    };
    let p = await pg();
    const tr = await api(p, 'POST', '/api/devolucao-casos/transportadoras', { nome:'Transp Tela' });

    /* ═════════ 1. o lançamento: cada campo chega ao banco ═════════ */
    secao('o lançamento — cada campo do formulário chega ao banco');
    await p.goto(B + '/devolucao-casos'); await p.waitForTimeout(800);
    eq('o "passado em" já vem com hoje', await p.inputValue('#lPassado'), dia(0));
    await p.fill('#lVenda', '2000000000090001'); await p.waitForTimeout(900);
    eq('achar a venda preenche a NF', await p.inputValue('#lNf'), '9001');
    await p.selectOption('#lMotivo', 'Falta de kit');
    await p.fill('#lPrazo', dia(6)); await p.selectOption('#lResp', '2'); await p.fill('#lObs', 'obs do lançamento');
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
    eq('   responsável: a pessoa escolhida, pelo id', c1.responsavel_id + '/' + c1.responsavel_nome, '2/Renato Tela');
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
    eq('   a reclamação aberta hoje (o campo já vinha com hoje)', c1.aberta_em, dia(0));
    eq('   e o prazo da coleta, 20 dias depois', c1.prazo_coleta, dia(20));

    /* ═════════ 1-B. os dois prazos e os campos novos do lançamento ═════════ */
    secao('o lançamento — os dois prazos, a data agendada e o limite do frete');
    await p.fill('#lVenda', '2000000000090055'); await p.waitForTimeout(700);
    await p.fill('#lPrazo', dia(3));
    await p.selectOption('#lMotivo', 'Falta de kit'); await p.fill('#lSku', 'BK140140BEGE'); await p.fill('#lComprador', 'Cliente Sem Venda');
    await p.selectOption('#lResp', '2'); await p.fill('#lLink', 'https://www.mercadolivre.com.br/reclamacao/2');
    await p.fill('#lAberta', dia(-2));
    ok('a tela mostra até quando coletar', /Coletar até .*20 dias corridos/.test(await p.textContent('#lColetaAte')), await p.textContent('#lColetaAte'));
    await p.selectOption('#lTransp', String(tr.id));
    await p.fill('#lAgenda', dia(25));
    ok('agendada depois do prazo da coleta: a tela avisa antes de gravar', /Depois do prazo da coleta/.test(await p.textContent('#lAgendaAviso')));
    await p.fill('#lLimite', '174,87'); await p.fill('#lCusto', '200');
    await p.click('#lPub [data-pub="0"]');
    await p.click('#btLancar'); await p.waitForTimeout(1000);
    const cid2 = +((await p.textContent('#lMsg')).match(/#(\d+)/) || [])[1];
    const c2 = caso(cid2) || {};
    eq('lançou mesmo com o aviso (avisa, não trava)', !!cid2, true);
    eq('   a abertura', c2.aberta_em, dia(-2));
    eq('   o prazo da coleta', c2.prazo_coleta, dia(18));
    eq('   o limite do frete', c2.limite_frete, 174.87);
    eq('   a data agendada na 1ª tentativa', (db.prepare('SELECT agendada_para d FROM devolucao_coleta WHERE caso_id=?').get(cid2) || {}).d, dia(25));
    eq('   e a abertura volta a hoje para o próximo lançamento', await p.inputValue('#lAberta'), dia(0));
    const linha2 = await p.locator('#listaColeta .linha', { hasText:'#'+cid2 }).textContent();
    ok('na lista, o chip diz qual prazo: o do comprovante, que vence antes', /comprovante: faltam 3 dias/.test(linha2), linha2);
    await abreFora(p); await p.locator('#listaColeta .linha', { hasText:'#'+cid2 }).locator('.t1').click(); await p.waitForTimeout(800);
    const dados2 = await p.locator('#painel .dados').first().textContent();
    ok('o caso mostra os dois prazos', /Mandar o comprovante até/.test(dados2) && /Coletar até/.test(dados2) && /Reclamação aberta em/.test(dados2), dados2);
    ok('a tentativa avisa a data depois do prazo', /depois do prazo da coleta/.test(await p.textContent('#painel')));
    ok('   e o custo acima do limite', /passa do limite do frete/.test(await p.textContent('#painel')));
    await p.fill('[data-agenda]', dia(10)); await p.fill('#dLimite', '250'); await p.fill('#eAberta', dia(-1));
    await p.click('#btSalvarTudo'); await p.waitForTimeout(1500);
    eq('um "Salvar alterações": a data agendada', (db.prepare('SELECT agendada_para d FROM devolucao_coleta WHERE caso_id=?').get(cid2) || {}).d, dia(10));
    eq('   o limite do frete', caso(cid2).limite_frete, 250);
    eq('   e a abertura, com o prazo da coleta recalculado', caso(cid2).aberta_em + '/' + caso(cid2).prazo_coleta, dia(-1) + '/' + dia(19));
    ok('   e os avisos somem', !/depois do prazo da coleta|passa do limite/.test(await p.textContent('#painel')));
    await p.fill('#novoPrazo', dia(5)); await p.click('#btPrazo'); await p.waitForTimeout(1000);
    eq('o prazo novo vai para o prazo escolhido (o próximo: comprovante)', caso(cid2).prazo + '/' + caso(cid2).prazo_original, dia(5) + '/' + dia(3));
    await p.selectOption('#novoPrazoQual', 'coleta'); await p.fill('#novoPrazo', dia(25)); await p.click('#btPrazo'); await p.waitForTimeout(1000);
    eq('   e escolhendo o da coleta, vai para ele', caso(cid2).prazo_coleta + '/' + caso(cid2).prazo_coleta_original, dia(25) + '/' + dia(19));
    await p.click('#painel button:has-text("Fechar")'); await p.waitForTimeout(300);

    /* ═════════ 2. o defeito que o dono pegou ═════════ */
    secao('o caso — dois campos de blocos diferentes, UM clique (o defeito de 03/11)');
    await abreFora(p); await p.locator('#listaColeta .linha', { hasText:'#'+cid }).locator('.t1').click(); await p.waitForTimeout(800);
    /* Desde a fase 3 (DEVOLUCOES-PROXIMO-PASSO) o responsável é uma escolha;
       o campo de texto que prova o "nada some calado" é a observação. */
    await p.fill('#eObs', 'Fulano Novo'); await p.fill('#dValor', '77,70');
    ok('os dois ficam marcados como não salvos', await p.$eval('#eObs', e => e.classList.contains('naosalvo')) && await p.$eval('#dValor', e => e.classList.contains('naosalvo')));
    ok('   e a barra diz quais', /Observação/.test(await p.textContent('#barraSujo')) && /Valor do ML/.test(await p.textContent('#barraSujo')));
    await p.click('#btValor'); await p.waitForTimeout(1200);
    eq('clicando o "Salvar" do dinheiro: a observação é gravada', caso(cid).obs, 'Fulano Novo');
    eq('   e o valor também', caso(cid).valor_ml, 77.7);
    ok('   a tela diz o que salvou', /Salvo/.test(await p.textContent('#cMsg')));
    eq('   e a barra some', await p.isVisible('#barraSujo'), false);
    await p.fill('#dValor', '88,80'); await p.selectOption('#eResp', '2');
    await p.click('#btEditar'); await p.waitForTimeout(1200);
    eq('clicando o "Salvar" do lançamento: o valor é gravado', caso(cid).valor_ml, 88.8);
    eq('   e o responsável escolhido também', caso(cid).responsavel_id, 2);

    secao('o caso — uma ação não apaga o que está digitado em outro bloco');
    await p.fill('#eObs', 'Digitado Antes'); await p.fill('#dEtiqueta', '12,00');
    await p.click('#painel [data-etapa="docs_enviados"]').catch(() => {});
    await p.waitForTimeout(400);
    await p.click('#painel [data-etapa="lancado"]'); await p.waitForTimeout(1200);
    eq('a etapa andou', caso(cid).etapa, 'lancado');
    eq('a observação digitada continua no campo', await p.inputValue('#eObs'), 'Digitado Antes');
    eq('   o custo da etiqueta também', await p.inputValue('#dEtiqueta'), '12,00');
    ok('   os dois continuam marcados', await p.$eval('#eObs', e => e.classList.contains('naosalvo')));
    eq('   e nada foi gravado sem pedir', caso(cid).obs, 'Fulano Novo');
    await p.fill('#novoPrazo', dia(9)); await p.click('#btPrazo'); await p.waitForTimeout(1200);
    eq('o prazo novo foi lançado', caso(cid).prazo, dia(9));
    eq('   e a observação digitada continua', await p.inputValue('#eObs'), 'Digitado Antes');
    eq('   e o campo do prazo, que era da ação, não volta', await p.inputValue('#novoPrazo'), '');
    await p.click('#btSalvarTudo'); await p.waitForTimeout(1200);
    eq('"Salvar alterações" da barra grava a observação', caso(cid).obs, 'Digitado Antes');
    eq('   e o custo da etiqueta', caso(cid).custo_etiqueta, 12);

    secao('o caso — o recusado fica no campo, e o resto é gravado');
    await p.fill('#eObs', 'Grava Este'); await p.fill('#dValor', 'abc');
    await p.click('#btSalvarTudo'); await p.waitForTimeout(1200);
    eq('a observação foi gravada', caso(cid).obs, 'Grava Este');
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
    await abreFora(p); await p.locator('#listaColeta .linha', { hasText:'#'+cid }).locator('.t1').click(); await p.waitForTimeout(800);
    const novos = { eNf:'9999', eSku:'BK140140BEGE', eObs:'obs varredura', eLink:'https://www.mercadolivre.com.br/x/2', eMsgMl:'msg varredura' };
    for(const k of Object.keys(novos)) await p.fill('#'+k, novos[k]);
    await p.selectOption('#eMotivo', 'Comando quebrado'); await p.selectOption('#ePub', '0'); await p.selectOption('#eResp', '1');
    await p.fill('#dValor', '99,90'); await p.fill('#dEtiqueta', '5,00');
    await p.fill('#painel [data-custot]', '41,00');
    await p.click('#btSalvarTudo'); await p.waitForTimeout(1500);
    const cv = caso(cid);
    eq('   NF', cv.nf, '9999'); eq('   SKU', cv.sku, 'BK140140BEGE'); eq('   responsável', cv.responsavel_id + '/' + cv.responsavel_nome, '1/Lucas Tela');
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
    await abreFora(p); await p.locator('#listaMl .linha', { hasText:'#'+ml.id }).locator('.t1').click(); await p.waitForTimeout(800);
    await p.selectOption('#eResp', '2'); await p.click('#btEditar'); await p.waitForTimeout(1000);
    ok('o responsável aparece no caso do ML devolve', /Renato Tela/.test(await p.locator('#painel .dados').first().textContent()));
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

    /* ═════════ 4-B. quem só acompanha: vê e lança os valores, sem a baixa ═════════ */
    secao('quem só acompanha — os valores do caso, sem a baixa do reembolso');
    QUEM = 2;
    const pa = await pg();
    await pa.goto(B + '/devolucao-casos'); await pa.waitForTimeout(800);
    await abreFora(pa); await pa.locator('#listaColeta .linha', { hasText:'#'+cid2 }).locator('.t1').click(); await pa.waitForTimeout(800);
    ok('vê o bloco Valores do caso', /Valores do caso/.test(await pa.textContent('#painel')));
    ok('   com o custo das tentativas', /Custo/.test(await pa.locator('#painel table').first().textContent()));
    await pa.fill('#dValor', '99,90'); await pa.click('#btSalvarTudo'); await pa.waitForTimeout(1200);
    eq('   e salva o valor do ML', caso(cid2).valor_ml, 99.9);
    eq('não vê a baixa do reembolso', await pa.$('[data-reemb]'), null);
    eq('   nem o encerrar como perda', await pa.$('#btPerda'), null);
    QUEM = 1;

    /* ═════════ 4-C. a etiqueta de devolução do ML (NF 8207) ═════════ */
    secao('a etiqueta de devolução não acha o caso: o Edvaldo toca no caso esperado do SKU');
    const e1 = await api(p, 'POST', '/api/devolucao-casos', { tipo:'ml', venda:'2000015571773263', nf:'8207', sku:'BK150150BRANCO', comprador:'Maria Consuelo Bermudez', publicidade:true });
    QUEM = 3;
    const pe = await pg();
    await pe.goto(B + '/devolucao'); await pe.waitForTimeout(900);
    await pe.fill('#dvCod', '48323653161'); await pe.waitForTimeout(1200);
    ok('o bipe da etiqueta de devolução não acha o caso (sem tarja)', !/Devolução esperada — caso/.test(await pe.textContent('#dvVenda')));
    await pe.click('[data-cor="BRANCO"]'); await pe.waitForTimeout(200);
    await pe.click('[data-med="150x150"]'); await pe.waitForTimeout(900);
    const esp = await pe.textContent('#dvEsp');
    ok('escolhido o SKU, aparece a devolução esperada', /Devolução esperada com este SKU/.test(esp) && esp.includes('#'+e1.id+' ') && /NF 8207/.test(esp), esp);
    await pe.click('[data-dvcaso="'+e1.id+'"]'); await pe.waitForTimeout(300);
    ok('   tocada, ela fica marcada e diz o que vai acontecer', /fica revisado/.test(await pe.textContent('#dvEsp')));
    for(const [k, v] of [['embalagem','intacta'],['tecido','intacto'],['tubo','ok'],['base','ok'],['comando','quebrado'],['kit','com kit'],['destinacao','reembalar']])
      await pe.click('.dvOp[data-p="'+k+'"][data-v="'+v+'"]');
    await pe.click('#dvSalvar'); await pe.waitForTimeout(1200);
    eq('salvou e ligou: o caso fica revisado', caso(e1.id).etapa, 'revisado');
    ok('   e a tela diz', (await pe.textContent('#dvMsg')).includes('caso #'+e1.id+' revisado'), await pe.textContent('#dvMsg'));

    secao('o "Já revisei no ML" do ML devolve, pela tela do caso');
    QUEM = 1;
    await p.goto(B + '/devolucao-casos'); await p.waitForTimeout(900);
    const lin1 = await p.locator('#listaMl .linha', { hasText:'#'+e1.id }).textContent();
    ok('a lista diz o que falta para encerrar: a baixa e o "Já revisei"', /para encerrar falta: dar a baixa · marcar "Já revisei" no ML/.test(lin1), lin1);
    await abreFora(p); await p.locator('#listaMl .linha', { hasText:'#'+e1.id }).locator('.t1').click(); await p.waitForTimeout(800);
    await p.click('#btAvisoML'); await p.waitForTimeout(1000);
    eq('marcado: a etapa vai a "Já revisei no ML"', caso(e1.id).etapa, 'ml_revisei');
    eq('   e sem a baixa o caso continua aberto', caso(e1.id).encerrado_em, null);
    ok('   e diz que falta só a baixa (o caso #20)', /para encerrar falta: dar a baixa/.test(await p.textContent('#painel .chips')) && !/Já revisei" no ML/.test(await p.textContent('#painel .chips')), await p.textContent('#painel .chips'));
    ok('o número bipado da etiqueta de devolução aparece no caso', /Etiqueta de devolução\s*48323653161/.test(await p.locator('#painel .dados').first().textContent()));
    eq('   e o botão abre a devolução no ML pela busca', await p.getAttribute('#painel a:has-text("Abrir esta devolução no ML")', 'href'),
       'https://vendedores.mercadolivre.com.br/post-purchase/post-sales?main.filter=returns&search.value=48323653161');

    secao('a baixa dentro do caso');
    await p.click('#btBaixa'); await p.waitForTimeout(400);
    ok('sem a reputação, a tela pede antes de gravar', /reputação/.test(await p.textContent('#cMsg')));
    eq('   e nada foi gravado', caso(e1.id).encerrado_em, null);
    await p.selectOption('#bxRep', 'nao'); await p.selectOption('#bxMot', 'Falta de kit');
    await p.click('#btBaixa'); await p.waitForTimeout(1300);
    eq('"Dar baixa" no caso: o ML devolve encerra', caso(e1.id).saida, 'revisado_ml');
    eq('   a devolução ficou com a baixa, a reputação e o motivo', JSON.stringify(db.prepare('SELECT baixado, reputacao, motivo FROM devolucao WHERE id=?').get(caso(e1.id).devolucao_id)),
       JSON.stringify({ baixado:1, reputacao:'nao', motivo:'Falta de kit' }));
    ok('   e o caso mostra a baixa dada', /Baixa dada/.test(await p.textContent('#painel')));
    await p.click('#painel button:has-text("Fechar")'); await p.waitForTimeout(300);

    secao('o Edvaldo digita os últimos números do Pack ID impresso');
    const s1 = await api(p, 'POST', '/api/devolucao-casos', { tipo:'ml', venda:'2000015571798765', nf:'8301', sku:'BK150150BRANCO', comprador:'Pack Um', publicidade:false });
    const s2 = await api(p, 'POST', '/api/devolucao-casos', { tipo:'ml', venda:'2000015571898765', nf:'8302', sku:'BK150150BRANCO', comprador:'Pack Dois', publicidade:false });
    QUEM = 3;
    const pe2 = await pg();
    await pe2.goto(B + '/devolucao'); await pe2.waitForTimeout(900);
    await pe2.fill('#dvCod', '48323600000'); await pe2.waitForTimeout(1200);
    ok('o bipe que não acha diz para digitar os últimos números do Pack ID', /últimos números do Pack ID/.test(await pe2.textContent('#dvVenda')), await pe2.textContent('#dvVenda'));
    await pe2.fill('#dvCod', '98765'); await pe2.waitForTimeout(1200);
    const vz = await pe2.textContent('#dvVenda');
    ok('dois casos terminam igual: aparecem os dois para tocar', vz.includes('#'+s1.id+' ') && vz.includes('#'+s2.id+' ') && /Mais de um caso/.test(vz), vz);
    await pe2.click('[data-dvsuf="'+s2.id+'"]'); await pe2.waitForTimeout(300);
    ok('   tocado, vira a devolução esperada', (await pe2.textContent('#dvVenda')).includes('Devolução esperada — caso #'+s2.id));
    await pe2.click('[data-cor="BRANCO"]'); await pe2.waitForTimeout(200);
    await pe2.click('[data-med="150x150"]'); await pe2.waitForTimeout(600);
    for(const [k, v] of [['embalagem','intacta'],['tecido','intacto'],['tubo','ok'],['base','ok'],['comando','perfeito'],['kit','com kit'],['destinacao','reembalar']])
      await pe2.click('.dvOp[data-p="'+k+'"][data-v="'+v+'"]');
    await pe2.click('#dvSalvar'); await pe2.waitForTimeout(1200);
    eq('   salvou e ligou o caso certo', caso(s2.id).etapa + '/' + caso(s1.id).etapa, 'revisado/aguardando');
    QUEM = 1;

    secao('a revisão que ficou solta: "Ligar" pela tela do caso');
    const e2 = await api(p, 'POST', '/api/devolucao-casos', { tipo:'ml', venda:'2000015571779999', nf:'8208', sku:'BK150150BRANCO', publicidade:false });
    const solta = await api(p, 'POST', '/api/devolucao', { codigo_ml:'48323650000', sku_fisico:'BK150150BRANCO', destinacao:'reembalar' });
    await p.goto(B + '/devolucao-casos'); await p.waitForTimeout(900);
    await abreFora(p); await p.locator('#listaMl .linha', { hasText:'#'+e2.id }).locator('.t1').click(); await p.waitForTimeout(1200);
    ok('o caso mostra a revisão sem caso do mesmo SKU', (await p.textContent('#soltasBox')).includes('Ligar a revisão #'+solta.id), await p.textContent('#soltasBox'));
    await p.fill('#eObs', 'digitado antes de ligar');
    await p.click('[data-ligar="'+solta.id+'"]'); await p.waitForTimeout(1300);
    eq('ligou', caso(e2.id).devolucao_id, solta.id);
    eq('   o caso fica revisado', caso(e2.id).etapa, 'revisado');
    eq('   e o que estava digitado no caso continua no campo', await p.inputValue('#eObs'), 'digitado antes de ligar');
    await p.fill('#eObs', ''); await p.click('#btEditar'); await p.waitForTimeout(600);
    await p.click('#painel button:has-text("Fechar")'); await p.waitForTimeout(300);

    secao('a revisão que ficou solta: "Ligar" pela Baixa, no Admin');
    const e3 = await api(p, 'POST', '/api/devolucao-casos', { tipo:'ml', venda:'2000015571778888', nf:'8209', sku:'BK150150BRANCO', comprador:'Fulana Baixa', publicidade:false });
    const solta3 = await api(p, 'POST', '/api/devolucao', { codigo_ml:'48323651111', sku_fisico:'BK150150BRANCO', destinacao:'reembalar' });
    const pa2 = await pg();
    /* O Admin inteiro não sobe aqui (dezenas de rotas): o card da Baixa é
       o pedaço do index.html que desenha a lista e o "Ligar", tirado do
       próprio arquivo — o que roda é o código de verdade. */
    const idx = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    const fns = idx.slice(idx.indexOf('var DVMOTIVOS=[];'), idx.indexOf('var DVESC={};'));
    const iLg = idx.indexOf('var lg=e.target.closest');
    const lgBloco = idx.slice(iLg, idx.indexOf('var b=e.target.closest(\'.dvBaixa\');', iLg));
    await pa2.goto(B + '/devolucao-casos'); await pa2.waitForTimeout(400);
    await pa2.evaluate((codigo) => { document.body.innerHTML = '<div id="dvAdmLista"></div>'; const sc = document.createElement('script'); sc.textContent = codigo; document.body.appendChild(sc); },
      fns + '\nvar DVESC={};\ndocument.addEventListener("click",function(e){ ' + lgBloco + ' });\ncarregarDev();');
    await pa2.waitForTimeout(1500);
    const cardB = await pa2.textContent('#dvEsp'+solta3.id);
    ok('o card sem caso mostra o caso esperado do SKU', cardB.includes('Ligar ao caso #'+e3.id), cardB);
    await pa2.click('.dvLigar[data-dev="'+solta3.id+'"][data-caso="'+e3.id+'"]'); await pa2.waitForTimeout(1200);
    eq('   "Ligar" pela Baixa liga', caso(e3.id).devolucao_id, solta3.id);
    /* A página emprestada para a Baixa fica sem a lista, e o relógio de 30 s
       da tela de casos continuaria chamando carregar() nela: fecha. */
    await pa2.close();

    secao('três peças do mesmo SKU: o cartão de cada uma e o "Conferir no ML"');
    const e4 = await api(p, 'POST', '/api/devolucao-casos', { tipo:'ml', venda:'2000015571700777', nf:'8401', sku:'BK140140BEGE', comprador:'Cliente Certo', publicidade:false });
    const pA = await api(p, 'POST', '/api/devolucao', { codigo_ml:'48323600011', sku_fisico:'BK140140BEGE', destinacao:'estoque', tecido:'rasgado', obs:'veio sem kit' });
    const pB = await api(p, 'POST', '/api/devolucao', { codigo_ml:'48323600022', sku_fisico:'BK140140BEGE', destinacao:'reembalar', tecido:'intacto' });
    await p.goto(B + '/devolucao-casos'); await p.waitForTimeout(900);
    await abreFora(p); await p.locator('#listaMl .linha', { hasText:'#'+e4.id }).locator('.t1').click(); await p.waitForTimeout(1200);
    const sb4 = await p.textContent('#soltasBox');
    ok('a lista mostra a venda do caso e avisa que há mais de uma peça', sb4.includes('2000015571700777') && /há 2 peças deste SKU/.test(sb4), sb4);
    ok('   cada peça com a etiqueta bipada, a triagem e a observação', sb4.includes('48323600011') && sb4.includes('rasgado') && sb4.includes('veio sem kit') && sb4.includes('48323600022'), sb4);
    eq('   e o "Conferir no ML" de cada uma procura a etiqueta dela', await p.getAttribute('#soltasBox a:has-text("Conferir no ML")', 'href'),
       'https://vendedores.mercadolivre.com.br/post-purchase/post-sales?main.filter=returns&search.value=48323600022');
    await p.click('[data-ligar="'+pA.id+'"]'); await p.waitForTimeout(1300);
    eq('ligou a primeira (a errada)', caso(e4.id).devolucao_id, pA.id);
    await p.selectOption('#bxRep', 'sim'); await p.selectOption('#bxMot', 'Falta de kit');
    await p.click('#btBaixa'); await p.waitForTimeout(1300);
    await p.click('#btAvisoML'); await p.waitForTimeout(1300);
    eq('   baixa e "Já revisei": encerrou', caso(e4.id).saida, 'revisado_ml');

    secao('desligar a peça errada pela tela do caso');
    const pq = await p.textContent('#painel');
    ok('o caso encerrado mostra a peça revisada, com a etiqueta e o desligar', pq.includes('A peça revisada') && pq.includes('48323600011') && pq.includes('veio sem kit') && /não é a peça certa/.test(pq), pq.slice(0, 600));
    await p.click('#btDesligar'); await p.waitForTimeout(400);
    ok('sem o motivo, a tela pede antes de gravar', /por que/.test(await p.textContent('#cMsg')));
    eq('   e nada mudou', caso(e4.id).devolucao_id, pA.id);
    await p.fill('#dsMotivo', 'a etiqueta 48323600011 é de outra venda');
    let dlg = '';
    p.removeAllListeners('dialog'); p.once('dialog', d => { dlg = d.message(); d.accept(); });
    await p.click('#btDesligar'); await p.waitForTimeout(1500);
    ok('a confirmação avisa que a baixa é desfeita e o caso reabre', /baixa dada nesta peça será desfeita/.test(dlg) && /reaberto/.test(dlg), dlg);
    eq('desligou: sem revisão, em "Chegou", reaberto', caso(e4.id).devolucao_id + '/' + caso(e4.id).etapa + '/' + caso(e4.id).encerrado_em, 'null/chegou/null');
    eq('   a baixa da peça errada foi desfeita', db.prepare('SELECT baixado FROM devolucao WHERE id=?').get(pA.id).baixado, 0);
    const sb5 = await p.textContent('#soltasBox');
    ok('   e o caso volta a listar as duas peças para ligar a certa', sb5.includes('Ligar a revisão #'+pA.id) && sb5.includes('Ligar a revisão #'+pB.id), sb5);
    await p.click('[data-ligar="'+pB.id+'"]'); await p.waitForTimeout(1300);
    eq('ligou a certa', caso(e4.id).devolucao_id, pB.id);
    ok('   e a história diz o que foi desligado e por quê', /desligada/.test(await p.textContent('#painel')) && /outra venda/.test(await p.textContent('#painel')));
    await p.click('#painel button:has-text("Fechar")'); await p.waitForTimeout(300);

    secao('três peças do mesmo SKU sem Pack ID: o nome e a cidade do remetente acham o caso');
    db.prepare("INSERT OR IGNORE INTO skus (codigo,largura_cm,altura_cm,cor_codigo) VALUES ('BK150150CINZA',150,150,'CINZA')").run();
    db.prepare("INSERT INTO lote (codigo,buyer,nf,venda,city) VALUES ('BK150150CINZA','Maria Consuelo Bermudez','8901','2000015571700901','Governador Celso Ramos, Santa Catarina')").run();
    db.prepare("INSERT INTO lote (codigo,buyer,nf,venda,city) VALUES ('BK150150CINZA','José Ávila Santos','8902','2000015571700902','Jundiaí, São Paulo')").run();
    const f1 = await api(p, 'POST', '/api/devolucao-casos', { tipo:'ml', venda:'2000015571700901', publicidade:false });
    const f2 = await api(p, 'POST', '/api/devolucao-casos', { tipo:'ml', venda:'2000015571700902', publicidade:false });
    const f3 = await api(p, 'POST', '/api/devolucao-casos', { tipo:'ml', venda:'2000015571700903', sku:'BK150150CINZA', comprador:'Sem Venda Silva', publicidade:false });
    QUEM = 3;
    const pf = await pg();
    await pf.goto(B + '/devolucao'); await pf.waitForTimeout(900);
    await pf.fill('#dvCod', '48323699999'); await pf.waitForTimeout(1200);
    await pf.click('[data-cor="CINZA"]'); await pf.waitForTimeout(200);
    await pf.click('[data-med="150x150"]'); await pf.waitForTimeout(900);
    let espF = await pf.textContent('#dvEsp');
    ok('os três casos aparecem, com o nome e a cidade do comprador', espF.includes('#'+f1.id+' ') && espF.includes('#'+f2.id+' ') && espF.includes('#'+f3.id+' ') && /Governador Celso Ramos/.test(espF) && /Jundiaí/.test(espF), espF);
    ok('   e o campo de filtrar pelo remetente aparece', await pf.isVisible('#dvEspFiltro'));
    await pf.fill('#dvEspFiltro', 'celso'); await pf.waitForTimeout(300);
    let vis = await pf.$$eval('#dvEsp [data-dvcaso]', bs => bs.filter(b => b.offsetParent !== null).map(b => +b.getAttribute('data-dvcaso')));
    eq('"celso" deixa só o caso de Governador Celso Ramos', vis.join(','), String(f1.id));
    await pf.fill('#dvEspFiltro', 'AVILA'); await pf.waitForTimeout(300);
    vis = await pf.$$eval('#dvEsp [data-dvcaso]', bs => bs.filter(b => b.offsetParent !== null).map(b => +b.getAttribute('data-dvcaso')));
    eq('   sem acento e sem diferença de maiúscula: "AVILA" acha José Ávila', vis.join(','), String(f2.id));
    await pf.fill('#dvEspFiltro', 'bermudez'); await pf.waitForTimeout(300);
    await pf.click('[data-dvcaso="'+f1.id+'"]'); await pf.waitForTimeout(400);
    eq('   tocado, o filtro continua escrito', await pf.inputValue('#dvEspFiltro'), 'bermudez');
    for(const [k, v] of [['embalagem','intacta'],['tecido','intacto'],['tubo','ok'],['base','ok'],['comando','perfeito'],['kit','com kit'],['destinacao','reembalar']])
      await pf.click('.dvOp[data-p="'+k+'"][data-v="'+v+'"]');
    await pf.click('#dvSalvar'); await pf.waitForTimeout(1200);
    eq('salvou e ligou o caso certo', caso(f1.id).etapa + '/' + caso(f2.id).etapa + '/' + caso(f3.id).etapa, 'revisado/aguardando/aguardando');
    for(const w of [400, 768]){
      const pw = await pg(w);
      await pw.goto(B + '/devolucao'); await pw.waitForTimeout(900);
      await pw.fill('#dvCod', '48323699998'); await pw.waitForTimeout(1200);
      await pw.click('[data-cor="CINZA"]'); await pw.waitForTimeout(200);
      await pw.click('[data-med="150x150"]'); await pw.waitForTimeout(900);
      const mw = await pw.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth, !!document.getElementById('dvEspFiltro')]);
      ok('a ' + w + ' px a lista com o filtro não rola de lado', mw[2] && mw[0] <= mw[1], JSON.stringify(mw));
    }
    QUEM = 1;

    /* ═════════ O PRÓXIMO PASSO e os dois grupos (spec DEVOLUCOES-PROXIMO-PASSO) ═════════ */
    secao('o próximo passo — o cartão no alto do caso e a lista em dois grupos');
    QUEM = 1;
    const ppC = await api(p, 'POST', '/api/devolucao-casos', { tipo:'coleta', venda:'2000000000097001', sku:'BK140140BEGE', prazo:dia(5), publicidade:false });
    const ppM = await api(p, 'POST', '/api/devolucao-casos', { tipo:'ml', venda:'2000000000097002', sku:'BK140140BEGE', publicidade:false });
    const pp = await pg();
    await pp.goto(B + '/devolucao-casos'); await pp.waitForTimeout(900);
    const linC = await pp.locator('#listaColeta .linha', { hasText:'#'+ppC.id+' ' }).first();
    ok('a linha do caso diz o próximo passo', /→ Pedir a coleta/.test(await linC.textContent()), await linC.textContent());
    ok('   e o caso nosso fica no grupo de cima (fora do "Esperando outros")', await linC.evaluate(e => !e.closest('details')));
    const linM = pp.locator('#listaMl details.foraGrupo .linha', { hasText:'#'+ppM.id+' ' });
    eq('o ML devolve aguardando fica em "Esperando outros"', await linM.count(), 1);
    eq('   que nasce recolhido', await pp.$eval('#listaMl details.foraGrupo', d => d.open), false);
    ok('   e o título diz quantos', /Esperando outros \(\d+\)/.test(await pp.textContent('#listaMl details.foraGrupo summary')));
    ok('o título do card diz quantos esperam a gente', /esperando a gente/.test(await pp.textContent('#nColeta')), await pp.textContent('#nColeta'));
    await pp.click('#listaMl details.foraGrupo summary'); await pp.waitForTimeout(200);
    await pp.evaluate(() => carregar()); await pp.waitForTimeout(600);
    eq('aberto à mão, o grupo continua aberto depois do redesenho', await pp.$eval('#listaMl details.foraGrupo', d => d.open), true);
    await linC.locator('.t1').click(); await pp.waitForTimeout(900);
    ok('o caso abre com o cartão "Próximo passo"', /Próximo passo/.test(await pp.textContent('#cxProximo')) && /Pedir a coleta/.test(await pp.textContent('#cxProximo')));
    ok('   antes de qualquer bloco do caso', await pp.evaluate(() => { const c = document.getElementById('cxProximo'), b = document.querySelector('#painel .bloco'); return !!(c && b && (c.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)); }));
    ok('   com o "até" e de quem é a vez', /até/.test(await pp.textContent('#cxProximo')) && /vez de: a gente/.test(await pp.textContent('#cxProximo')), await pp.textContent('#cxProximo'));
    await pp.click('#cxProximo [data-irpasso]'); await pp.waitForTimeout(400);
    ok('"Ir para a ação" leva ao bloco da coleta e o destaca', await pp.evaluate(() => { const d = document.querySelector('#painel .bloco.destaque h3'); return !!d && d.textContent.indexOf('Coleta — tentativas') === 0; }));
    await pp.evaluate(() => fechar()); await pp.waitForTimeout(300);
    await abreFora(pp); await pp.locator('#listaMl .linha', { hasText:'#'+ppM.id+' ' }).locator('.t1').click(); await pp.waitForTimeout(900);
    ok('o ML devolve aguardando: o cartão é cinza, "esperando o Mercado Livre"', await pp.$eval('#cxProximo', e => e.classList.contains('fora')) && /Esperando o Mercado Livre/.test(await pp.textContent('#cxProximo')), await pp.textContent('#cxProximo'));
    ok('   e não pede ação', /nada a fazer/.test(await pp.textContent('#cxProximo')));
    for(const w of [400, 768]){
      const pw = await pg(w);
      await pw.goto(B + '/devolucao-casos'); await pw.waitForTimeout(900);
      let mw = await pw.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      ok('a ' + w + ' px a lista em dois grupos não rola de lado', mw[0] <= mw[1], JSON.stringify(mw));
      await pw.locator('#listaColeta .linha', { hasText:'#'+ppC.id+' ' }).first().locator('.t1').click(); await pw.waitForTimeout(900);
      mw = await pw.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth, !!document.getElementById('cxProximo')]);
      ok('   e o caso com o cartão do passo também não', mw[2] && mw[0] <= mw[1], JSON.stringify(mw));
      await pw.close();
    }
    await pp.close();

    /* ═════════ O RESPONSÁVEL COMO PESSOA e "Meus casos" (fase 3) ═════════ */
    secao('o responsável — a escolha entre as pessoas, e o "Meus casos"');
    QUEM = 1;
    const pr = await pg();
    await pr.goto(B + '/devolucao-casos'); await pr.waitForTimeout(900);
    const opts = await pr.$$eval('#lResp option', os => os.map(o => o.textContent));
    eq('o lançamento oferece só quem lança ou acompanha, ativo', opts.join('|'), '— escolher —|Lucas Tela|Renato Tela');
    const velho = await api(pr, 'POST', '/api/devolucao-casos', { tipo:'coleta', venda:'2000000000098001', sku:'BK140140BEGE', prazo:dia(7), responsavel:'Escrito à mão', publicidade:false });
    db.prepare('UPDATE devolucao_caso SET responsavel_id=NULL, responsavel_nome=NULL WHERE id=?').run(velho.id);   // o caso de antes da regra
    await pr.evaluate(() => carregar()); await pr.waitForTimeout(700);
    ok('o caso de antes mostra o texto livre na lista', /Escrito à mão/.test(await pr.locator('#listaColeta .linha', { hasText:'#'+velho.id+' ' }).first().textContent()));
    await pr.locator('#listaColeta .linha', { hasText:'#'+velho.id+' ' }).first().locator('.t1').click(); await pr.waitForTimeout(900);
    ok('   e no caso, ao lado da escolha vazia', /antes, escrito à mão: “Escrito à mão”/.test(await pr.textContent('#painel')) && await pr.inputValue('#eResp') === '');
    await pr.selectOption('#eResp', '2'); await pr.click('#btSalvarTudo'); await pr.waitForTimeout(1200);
    eq('escolher a pessoa pelo "Salvar alterações" grava o id', caso(velho.id).responsavel_id + '/' + caso(velho.id).responsavel, '2/Escrito à mão');
    ok('   e o caso passa a mostrar a pessoa', /Renato Tela/.test(await pr.locator('#painel .dados').first().textContent()));
    await pr.evaluate(() => fechar()); await pr.close();
    QUEM = 2;
    const pm = await pg();
    await pm.goto(B + '/devolucao-casos'); await pm.waitForTimeout(1000);
    const meus = db.prepare('SELECT id FROM devolucao_caso WHERE encerrado_em IS NULL AND responsavel_id=2').all().map(x => x.id).sort((a,b) => a-b);
    /* Desde 04/11/2026 o "Meus casos" é a opção "Eu" do "Casos de:". */
    ok('a opção "Eu" diz quantos casos são da pessoa', (await pm.textContent('#casosDe option[value="eu"]')).includes('('+meus.length+')'), await pm.textContent('#casosDe option[value="eu"]'));
    await pm.selectOption('#casosDe', 'eu'); await pm.waitForTimeout(300); await abreFora(pm);
    const vistos = await pm.$$eval('#listaColeta .linha, #listaMl .linha', ls => ls.map(l => +l.getAttribute('data-id')).sort((a,b) => a-b));
    eq('"Meus casos" deixa só os casos em que o Renato é o responsável', vistos.join(','), meus.join(','));
    ok('   e a tela diz que está filtrando', /só os casos em que você é o responsável/.test(await pm.textContent('#meusAviso')));
    await pm.evaluate(() => carregar()); await pm.waitForTimeout(700);
    eq('   o filtro continua depois do redesenho', (await pm.$$eval('#listaColeta .linha, #listaMl .linha', ls => ls.length)), meus.length);
    await pm.selectOption('#casosDe', 'todos'); await pm.waitForTimeout(300);
    ok('desligado, volta a lista inteira', (await pm.$$eval('#listaColeta .linha, #listaMl .linha', ls => ls.length)) > meus.length);
    await pm.close();
    db.prepare('UPDATE devolucao_caso SET responsavel_id=NULL, responsavel_nome=NULL WHERE responsavel_id=1').run();
    QUEM = 1;
    const pz = await pg();
    await pz.goto(B + '/devolucao-casos'); await pz.waitForTimeout(1000);
    const total = await pz.$$eval('#listaColeta .linha, #listaMl .linha', ls => ls.length);
    await pz.selectOption('#casosDe', 'eu'); await pz.waitForTimeout(300);
    eq('quem não tem caso nenhum vê a lista inteira', await pz.$$eval('#listaColeta .linha, #listaMl .linha', ls => ls.length), total);
    ok('   e a tela diz isso', /nenhum caso aberto: mostrando todos/.test(await pz.textContent('#meusAviso')), await pz.textContent('#meusAviso'));
    await pz.close();

    /* ═════════ O QUE O LANÇAMENTO EXIGE (04/11/2026) ═════════ */
    secao('o lançamento — os campos obrigatórios marcados, e o "falta" dos casos antigos');
    QUEM = 1;
    const po = await pg();
    await po.goto(B + '/devolucao-casos'); await po.waitForTimeout(900);
    await po.click('#tpMl'); await po.waitForTimeout(200);
    ok('o responsável aparece também no ML devolve', await po.isVisible('#lResp'));
    ok('   e os obrigatórios têm a marca *', (await po.$$eval('#cardLancar .obrig', e => e.length)) >= 5);
    await po.fill('#lVenda', '2000000000096001'); await po.waitForTimeout(700);
    await po.fill('#lObs', 'obs que não pode sumir'); await po.click('#lPub [data-pub="0"]');
    await po.click('#btLancar'); await po.waitForTimeout(900);
    ok('lançar sem eles: a recusa diz todos de uma vez', /Para lançar, falta: motivo · SKU · comprador · responsável · link da conversa/.test(await po.textContent('#lMsg')), await po.textContent('#lMsg'));
    const marcados = await po.$$eval('#cardLancar .campoFalta', es => es.map(e => e.id).sort().join(','));
    eq('   e marca os cinco campos', marcados, 'lComprador,lLink,lMotivo,lResp,lSku');
    eq('   sem apagar o digitado', await po.inputValue('#lObs') + '|' + await po.inputValue('#lVenda'), 'obs que não pode sumir|2000000000096001');
    eq('   e nenhum caso nasceu', db.prepare("SELECT COUNT(*) n FROM devolucao_caso WHERE venda='2000000000096001'").get().n, 0);
    await po.fill('#lLink', 'https://www.mercadolivre.com.br/reclamacao/96001'); await po.waitForTimeout(100);
    eq('digitar no campo tira a marca dele', await po.$eval('#lLink', e => e.classList.contains('campoFalta')), false);
    await po.selectOption('#lMotivo', 'Falta de kit'); await po.fill('#lSku', 'BK140140BEGE'); await po.fill('#lComprador', 'Fulana Obrigatoria');
    await po.selectOption('#lResp', '2'); await po.click('#btLancar'); await po.waitForTimeout(1000);
    const nob = db.prepare("SELECT * FROM devolucao_caso WHERE venda='2000000000096001'").get() || {};
    eq('completo, lança o ML devolve com o responsável', nob.tipo + '/' + nob.responsavel_id, 'ml/2');
    const DDt = require('./devcaso_dominio');
    const antigo = DDt.lancar(db, { tipo:'ml', venda:'2000000000096002', publicidade:false }, { nome:'Script' }, { semObrigatorios:true });
    await po.evaluate(() => carregar()); await po.waitForTimeout(700); await abreFora(po);
    const linA = await po.locator('#listaMl .linha', { hasText:'#'+antigo.id+' ' }).first().textContent();
    ok('o caso antigo incompleto mostra "falta: …" na lista', /falta: motivo · SKU · comprador · responsável · link da conversa/.test(linA), linA);
    await po.locator('#listaMl .linha', { hasText:'#'+antigo.id+' ' }).first().locator('.t1').click(); await po.waitForTimeout(900);
    ok('   e no caso aberto', /falta: motivo/.test(await po.locator('#painel .chips').first().textContent()));
    await po.close();

    /* ═════════ "CASOS DE:", O QUADRO POR RESPONSÁVEL E O DESEMPENHO (04/11/2026) ═════════ */
    secao('casos de cada responsável — o filtro, o quadro e o histórico');
    QUEM = 1;
    const pcd = await pg();
    await pcd.goto(B + '/devolucao-casos'); await pcd.waitForTimeout(1000);
    const jl = await api(pcd, 'GET', '/api/devolucao-casos');
    const deRen = jl.coleta.concat(jl.ml).filter(c => c.responsavel_id === 2).map(c => c.id).sort((a,b) => a-b);
    ok('há casos do Renato para o teste', deRen.length > 0, JSON.stringify(deRen));
    await pcd.selectOption('#casosDe', '2'); await pcd.waitForTimeout(300); await abreFora(pcd);
    eq('"Casos de: Renato Tela" mostra só os dele', (await pcd.$$eval('#listaColeta .linha, #listaMl .linha', ls => ls.map(l => +l.getAttribute('data-id')).sort((a,b) => a-b))).join(','), deRen.join(','));
    ok('   e a tela diz de quem', /Mostrando os casos de Renato Tela/.test(await pcd.textContent('#meusAviso')));
    const semRe = jl.coleta.concat(jl.ml).filter(c => !c.responsavel_id).map(c => c.id).sort((a,b) => a-b);
    await pcd.selectOption('#casosDe', 'sem'); await pcd.waitForTimeout(300); await abreFora(pcd);
    eq('"Sem responsável" mostra os sem pessoa escolhida', (await pcd.$$eval('#listaColeta .linha, #listaMl .linha', ls => ls.map(l => +l.getAttribute('data-id')).sort((a,b) => a-b))).join(','), semRe.join(','));
    await pcd.selectOption('#casosDe', 'todos'); await pcd.waitForTimeout(300);
    const linR = jl.por_responsavel.find(x => x.id === 2);
    const txtQ = await pcd.textContent('#porResp');
    ok('o quadro "Por responsável" mostra a linha do Renato com o número do servidor', /Renato Tela/.test(txtQ) && (await pcd.$eval('#porResp [data-casosde="2"] td:nth-child(2)', e => e.textContent)) === String(linR.casos), txtQ);
    await pcd.click('#porResp [data-casosde="2"]'); await pcd.waitForTimeout(300);
    eq('   tocar na linha filtra os casos dela', await pcd.inputValue('#casosDe'), '2');
    await pcd.click('#porResp [data-casosde="2"]'); await pcd.waitForTimeout(300);
    eq('   tocar de novo volta para todos', await pcd.inputValue('#casosDe'), 'todos');
    // o histórico: um caso encerrado do Renato, no mês atual
    const cdes = await api(pcd, 'POST', '/api/devolucao-casos', { tipo:'ml', venda:'2000000000099501', publicidade:false, responsavel_id:2 });
    db.prepare("UPDATE devolucao_caso SET etapa='encerrado', saida='revisado_ml', encerrado_em=datetime('now','localtime') WHERE id=?").run(cdes.id);
    await pcd.click('#tabs [data-t="des"]'); await pcd.waitForTimeout(900);
    const jd = await api(pcd, 'GET', '/api/devolucao-casos/desempenho?mes=' + dia(0).slice(0,7));
    const pRen = jd.pessoas.find(x => x.id === 2) || {};
    const txtD = await pcd.textContent('#desBox');
    ok('a aba Desempenho mostra o Renato com os números do servidor', /Renato Tela/.test(txtD) && txtD.indexOf('Revisado (ML devolve): ' + (pRen.saidas||{}).revisado_ml) >= 0, txtD.slice(0,300));
    const iRen = jd.pessoas.findIndex(x => x.id === 2);
    await pcd.click('#desBox [data-des="' + iRen + '"]'); await pcd.waitForTimeout(200);
    ok('   tocar na pessoa abre a lista dos casos dela', await pcd.isVisible('#desDet' + iRen) && (await pcd.textContent('#desDet' + iRen)).includes('#' + cdes.id));
    for(const w of [400, 768]){
      await pcd.setViewportSize({ width:w, height:900 }); await pcd.waitForTimeout(300);
      const mw = await pcd.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      ok('a ' + w + ' px a aba Desempenho não rola de lado', mw[0] <= mw[1], JSON.stringify(mw));
      await pcd.click('#tabs [data-t="and"]'); await pcd.waitForTimeout(400);
      const mw2 = await pcd.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      ok('   nem a lista com o quadro', mw2[0] <= mw2[1], JSON.stringify(mw2));
      await pcd.click('#tabs [data-t="des"]'); await pcd.waitForTimeout(500);
    }
    await pcd.close();

    /* ═════════ 5. o celular ═════════ */
    secao('a 400 px — a página não rola de lado, e o caso abre');
    const p4 = await pg(400);
    await p4.goto(B + '/devolucao-casos'); await p4.waitForTimeout(800);
    let m = await p4.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    eq('a lista', m[0] <= m[1], true);
    await abreFora(p4); await p4.locator('#listaMl .linha', { hasText:'#'+ml.id }).locator('.t1').click(); await p4.waitForTimeout(800);
    await p4.fill('#eObs', 'x');
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
