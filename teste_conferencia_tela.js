#!/usr/bin/env node
/* teste_conferencia_tela.js — a TELA de Conferência (/carregamento) num
 * navegador de verdade, com as rotas de verdade. Desde 25/11/2026 é a tela
 * dos CARRINHOS (spec CONFERENCIA-CARRINHOS, fases 1 e 2); até ali ela
 * conferia a tela da CONFERENCIA-EXPEDICAO (lista única, viagem, sobras).
 *
 *   node teste_conferencia_tela.js
 *
 * NAO sobe o server.js (a porta 3010 e fixa e, no servidor, bateria na
 * producao): monta um Express so com as rotas da expedicao, num banco
 * temporario e numa porta livre, e o Chromium clica como a bancada clicaria:
 *
 *   1  as duas barras, os destinos (A, B e Carro da agência) e a lista
 *   2  o bipe sem modo: coleta no carrinho ativo, agência no Carro da agência,
 *      a etiqueta do carrinho troca o ativo, a conferida sem carrinho entra
 *      sem baixar de novo
 *   3  a recontagem cega e o "não achei" (sem mexer no estoque)
 *   4  a entrega: carrinho, foto, número e fechar; a agência com quem levou
 *   5  a venda cancelada separada (bipe + SKU), sem mexer no saldo
 *   6  a 400, 768 e 1024 px nada rola de lado; nenhum erro de script
 *
 * Sem Playwright/Chromium diz "PULADO" e sai sem falhar — o CI do GitHub nao
 * tem navegador, e la esta tela nao e conferida.
 */
const fs = require('fs'), os = require('os'), path = require('path');
let chromium;
try { chromium = require('playwright').chromium; }
catch(e){ console.log('PULADO: sem Playwright neste computador — a tela NÃO foi conferida.'); process.exit(0); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-conftela-'));
process.env.PCP_DIR = tmp;
const Database = require('better-sqlite3');
const express = require('express');
const db = new Database(path.join(tmp, 'dados.db'));
db.exec(`CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, sob_medida INTEGER DEFAULT 0, exige_medida INTEGER DEFAULT 1);
  CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nome TEXT, ativo INTEGER DEFAULT 1);
  INSERT INTO usuarios (id,nome) VALUES (1,'Ana Bancada'),(2,'Beto Carro'),(3,'Gestora Tela');
  INSERT INTO modelo (id,codigo,nome) VALUES (1,'ROLO','Rolô');
  INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('BK140140BEGE',10,1),('BK120120BEGE',10,1);`);

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){ n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe !== undefined ? '\n         ' + (typeof detalhe === 'string' ? detalhe : JSON.stringify(detalhe)) : '')); } }
const eq = (desc, a, b) => ok(desc, JSON.stringify(a) === JSON.stringify(b), 'esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a));
const secao = t => console.log('\n── ' + t + ' ──');

/* Quem e quem: 1 confere (Ana), 2 opera e leva o carro (Beto), 3 e a gestao. */
const PERMS = { 1:['carregamento.executar'], 2:['carregamento.executar'], 3:['carregamento.executar','cancelamento.confirmar'] };
const NOMES = { 1:'Ana Bancada', 2:'Beto Carro', 3:'Gestora Tela' };
let QUEM = 1;
const app = express();
app.use(express.json({ limit:'25mb' }));
app.locals.acesso = { podePermissao(u, c){ return !!(u && (PERMS[u.id] || []).includes(c)); }, auditar(){} };
app.use((req, res, next) => { req.usuario = { id:QUEM, nome:NOMES[QUEM] }; next(); });
app.get('/api/auth/eu', (req, res) => res.json({ logado:true, nome:NOMES[QUEM], destino:{} }));
app.get('/api/auth/pessoas', (req, res) => res.json(db.prepare('SELECT id,nome FROM usuarios WHERE ativo=1 ORDER BY nome').all()));
app.get('/api/teste/ativo', (req, res) => res.json({ ativo:false }));
require('./exp_route')(app, db);
require('./carreg_route')(app, db);
require('./saida_route')(app, db);
require('./cad_route')(app, db);
require('./carrinho_route')(app, db);
const ESTOQUE = require('./estoque_dominio'); ESTOQUE.garantirSchema(db); ESTOQUE.abertura(db);
require('./correcoes').garantirSchema(db);
app.get('/carregamento', (req, res) => res.sendFile(path.join(__dirname, 'public', 'carregamento.html')));
app.use(express.static(path.join(__dirname, 'public')));

const lote = id => db.prepare('SELECT * FROM lote WHERE id=?').get(id);
const saldo = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
const HOJE = db.prepare("SELECT date('now','localtime') d").get().d;
const ONTEM = db.prepare("SELECT date('now','localtime','-1 day') d").get().d;
const H9 = HOJE + ' 09:00:00';
function vol(o){ const c = Object.keys(o);
  return db.prepare('INSERT INTO lote ('+c.join(',')+') VALUES ('+c.map(()=>'?').join(',')+')').run(c.map(k=>o[k])).lastInsertRowid; }
let k = 0;
function caixa(buyer, o){ const v = '20000190000' + String(10000 + (++k));
  return { id:vol(Object.assign({ codigo:'BK140140BEGE', buyer, nf:String(9100 + k), venda:v, codes:JSON.stringify([v]),
    embalado_em:H9, data:HOJE, despachar_em:HOJE, impresso_por:'Impressora' }, o)), code:v }; }
// agencia: duas impressas (a conferir) e uma ja conferida; coleta: uma a levar ao canto e uma no canto
const ag1 = caixa('Agencia Um Conferir', { estagio:'embalado', modalidade:'agencia' });
const ag2 = caixa('Agencia Dois Conferida', { estagio:'embalado', modalidade:'agencia', conferido_em:H9, conferido_por:'Joao', baixado_em:H9 });
const ag3 = caixa('Agencia Tres Conferida', { estagio:'embalado', modalidade:'agencia', conferido_em:H9, conferido_por:'Joao', baixado_em:H9 });
const co1 = caixa('Coleta Um Bancada', { estagio:'embalado', modalidade:'coleta' });
const co2 = caixa('Coleta Dois No Canto', { estagio:'carregado', modalidade:'coleta', carregado_em:H9, conferido_em:H9, conferido_por:'Joao', baixado_em:H9 });
const co3 = caixa('Coleta Tres Cancelar', { estagio:'carregado', modalidade:'coleta', carregado_em:H9, conferido_em:H9, conferido_por:'Joao', baixado_em:H9 });
const co4 = caixa('Coleta Quatro Recusar', { codigo:'BK120120BEGE', estagio:'carregado', modalidade:'coleta', carregado_em:H9, conferido_em:H9, conferido_por:'Joao', baixado_em:H9 });

/* A foto da tela do motorista: um PNG de 200×200 com ruído — a tela reduz e
   recomprime em JPEG, e o servidor recusa foto de menos de 2 KB. */
const FOTO = path.join(tmp, 'foto.png');
(function(){ const zlib = require('zlib'), W = 200, H = 200;
  const crc = b => { let c, t = []; for(let n=0;n<256;n++){ c=n; for(let k=0;k<8;k++) c = c&1 ? 0xedb88320^(c>>>1) : c>>>1; t[n]=c>>>0; }
    let x = 0xffffffff; for(const v of b) x = t[(x^v)&0xff]^(x>>>8); return (x^0xffffffff)>>>0; };
  const bloco = (tipo, dados) => { const l = Buffer.alloc(4); l.writeUInt32BE(dados.length);
    const td = Buffer.concat([Buffer.from(tipo), dados]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4); ihdr[8]=8; ihdr[9]=2;
  const cru = Buffer.alloc((W*3+1)*H); for(let i=0;i<cru.length;i++) cru[i] = (i % (W*3+1)) ? (i*7919)&255 : 0;
  fs.writeFileSync(FOTO, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), bloco('IHDR',ihdr), bloco('IDAT',zlib.deflateSync(cru)), bloco('IEND',Buffer.alloc(0))]));
})();
const srv = app.listen(0, async () => {
  const B = 'http://127.0.0.1:' + srv.address().port;
  let b;
  try { b = await chromium.launch(); }
  catch(e){ console.log('PULADO: sem Chromium neste computador — a tela NÃO foi conferida.'); srv.close(); fim(); return; }
  const erros = [];
  try {
    const ctx = await b.newContext({ viewport:{ width:1440, height:1000 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => erros.push(e.message));
    p.on('dialog', d => d.accept());
    const abrir = async () => { await p.goto(B + '/carregamento'); await p.waitForTimeout(900); };
    const texto = async sel => (await p.textContent(sel)) || '';
    const bipar = async code => { await p.fill('#scan', code); await p.press('#scan', 'Enter'); await p.waitForTimeout(700); };
    const filtro = async t => { await p.click('#filtros button:has-text("'+t+'")'); await p.waitForTimeout(200); };
    const destino = async nome => texto('.dc:has-text("'+nome+'") .q');

    secao('1. as barras, os destinos e a lista');
    await abrir();
    ok('as duas barras aparecem', /Entrega do dia/.test(await texto('#barras')) && /Bipar o que foi impresso hoje/.test(await texto('#barras')), await texto('#barras'));
    ok('os destinos: Carrinho A, Carrinho B e Carro da agência', /Carrinho A/.test(await texto('#painel')) && /Carrinho B/.test(await texto('#painel')) && /Carro da agência/.test(await texto('#painel')));
    ok('nenhum carrinho nasce ativo: a tela pede para escolher (R-CRR-02)', !/ATIVO/.test(await texto('#painel')) && /Escolha o carrinho/.test(await texto('#painel')), await texto('#painel'));
    ok('"Faltam bipar" traz a agência e a coleta impressas', /Agencia Um Conferir/.test(await texto('#lista')) && /Coleta Um Bancada/.test(await texto('#lista')), await texto('#lista'));
    ok('o topo diz o segundo bipe e onde muda', /Segundo bipe \(SKU\): desligado · muda na 906 Parâmetros/.test(await texto('#parSegundo')), await texto('#parSegundo'));

    secao('2. o bipe sem modo');
    const s0 = saldo('BK140140BEGE');
    await bipar(co1.code);
    ok('coleta sem carrinho escolhido: recusada, e nada baixa', /Escolha o carrinho/.test(await texto('#banner')) && saldo('BK140140BEGE') === s0, await texto('#banner'));
    await p.click('#filtros button:has-text("Nos carrinhos")'); await p.waitForTimeout(200);
    ok('depois de tocar num filtro, o foco volta ao campo do bipe', await p.evaluate(() => document.activeElement && document.activeElement.id) === 'scan');
    await p.keyboard.type('CARRINHO-A'); await p.keyboard.press('Enter'); await p.waitForTimeout(700);
    ok('o leitor (teclado, sem clicar no campo) troca o ativo para o A', /ATIVO/.test(await texto('.dc:has-text("Carrinho A")')), await texto('#painel'));
    await bipar(co1.code);
    ok('coleta: conferida no Carrinho A', /Conferida — no Carrinho A/.test(await texto('#banner')), await texto('#banner'));
    eq('   o carrinho A tem 1', await destino('Carrinho A'), '1');
    eq('   e baixou 1', saldo('BK140140BEGE'), s0 - 1);
    await bipar(ag1.code);
    ok('agência: vai sozinha para o Carro da agência', /Carro da agência/.test(await texto('#banner')) && lote(ag1.id).carrinho === 'AG', await texto('#banner'));
    await bipar('CARRINHO-B');
    ok('a etiqueta do carrinho troca o ativo para o B', /ATIVO/.test(await texto('.dc:has-text("Carrinho B")')), await texto('#painel'));
    await filtro('Conferidas sem carrinho');
    ok('as conferidas de antes aparecem sem carrinho', /Coleta Dois No Canto/.test(await texto('#lista')) && /Agencia Dois Conferida/.test(await texto('#lista')), await texto('#lista'));
    const s1 = saldo('BK140140BEGE');
    await bipar(co2.code);
    ok('a conferida sem carrinho entra no B pelo bipe', /já estava conferida/.test(await texto('#banner')) && lote(co2.id).carrinho === 'B', await texto('#banner'));
    eq('   sem baixar de novo', saldo('BK140140BEGE'), s1);
    await bipar(co4.code);   // mais uma no B

    secao('3. a recontagem cega');
    await p.click('.dc:has-text("Carrinho B") button:has-text("Recontar")'); await p.waitForTimeout(300);
    ok('a recontagem não mostra o número esperado', !/2 caixas|Na conferência/.test(await texto('#painel')), await texto('#painel'));
    await bipar(co2.code);
    await p.click('text=Terminei a recontagem'); await p.waitForTimeout(700);
    ok('faltou uma: a lista aparece', /Faltam 1 no carrinho/.test(await texto('#painel')) && /Coleta Quatro Recusar/.test(await texto('#painel')), await texto('#painel'));
    await bipar(co4.code);
    ok('o bipe depois de "Terminei" é o achei: a conta refaz e bate', /Bateu/.test(await texto('#painel')), await texto('#painel'));
    await p.click('#painel button:has-text("Concluir")'); await p.waitForTimeout(400);
    await p.click('.dc:has-text("Carrinho B") button:has-text("Recontar")'); await p.waitForTimeout(300);
    await bipar(co2.code);
    await p.click('text=Terminei a recontagem'); await p.waitForTimeout(700);
    const s2 = saldo('BK120120BEGE');
    await p.click('#painel .cx:has-text("Coleta Quatro Recusar") button:has-text("Não achei")'); await p.waitForTimeout(700);
    ok('"não achei" tira do carrinho', lote(co4.id).carrinho === null && !!lote(co4.id).nao_achada_em);
    eq('   sem mexer no estoque', saldo('BK120120BEGE'), s2);
    await p.click('#painel button:has-text("Concluir")'); await p.waitForTimeout(500);

    secao('4. a entrega');
    await p.click('.dc:has-text("Carrinho A") button:has-text("Entregar")'); await p.waitForTimeout(800);
    if(/Seguir sem elas/.test(await texto('#painel'))){ await p.click('text=Seguir sem elas →'); await p.waitForTimeout(300); }
    ok('passo dos carrinhos, com o A marcado', /☑ Carrinho A/.test(await texto('#painel')), await texto('#painel'));
    await p.click('#painel button:has-text("Continuar")'); await p.waitForTimeout(300);
    await p.setInputFiles('#fotoIn', FOTO); await p.waitForTimeout(800);
    await p.click('#painel button:has-text("Continuar")'); await p.waitForTimeout(300);
    await p.fill('#numEnt', '3'); await p.click('#painel button:has-text("Comparar e fechar")'); await p.waitForTimeout(800);
    ok('número diferente: não bateu, e o liberar aparece', /Não bateu/.test(await texto('#painel')) && !!(await p.$('#painel button:has-text("Liberar com divergência")')), await texto('#painel'));
    eq('   nada saiu', lote(co1.id).saida_id, null);
    /* O botão é do nav.js (data-perm) e este Express não manda o menu: o clique
       sai pela função da tela, como o botão faria. */
    await p.evaluate(() => fecharEntrega(true)); await p.waitForTimeout(700);
    ok('liberar sem motivo: o bloco da divergência e o campo continuam', !!(await p.$('#motivoLib')) && /Escreva o motivo/.test(await texto('#painel')), await texto('#painel'));
    // a caixa a mais é bipada na hora: vai para o carrinho entregue (A), não para o ativo (B)
    await p.click('#painel button:has-text("Recontar Carrinho A")').catch(()=>{});
    await p.waitForTimeout(200);
    if(/Recontar/.test(await texto('#titEsq'))){ await p.click('text=Desistir'); await p.waitForTimeout(300); }
    ok('(o ativo continua o B)', /ATIVO/.test(await texto('.dc:has-text("Carrinho B")')));
    await p.click('.dc:has-text("Carrinho A") button:has-text("Entregar")'); await p.waitForTimeout(800);
    if(/Seguir sem elas/.test(await texto('#painel'))){ await p.click('text=Seguir sem elas →'); await p.waitForTimeout(300); }
    await p.click('#painel button:has-text("Continuar")'); await p.waitForTimeout(300);
    await p.setInputFiles('#fotoIn', FOTO); await p.waitForTimeout(800);
    await p.click('#painel button:has-text("Continuar")'); await p.waitForTimeout(300);
    await p.fill('#numEnt', '2'); await p.click('#painel button:has-text("Comparar e fechar")'); await p.waitForTimeout(800);
    const extra = caixa('Coleta Extra No Caminhao', { estagio:'embalado', modalidade:'coleta' });
    await bipar(extra.code);
    ok('na divergência, a caixa achada vai para o carrinho entregue (A)', lote(extra.id).carrinho === 'A', lote(extra.id).carrinho);
    ok('...e a tela pede para comparar de novo', /Comparar e fechar/.test(await texto('#banner')) && !/Não bateu/.test(await texto('#painel')), await texto('#banner'));
    await p.fill('#numEnt', '2'); await p.click('#painel button:has-text("Comparar e fechar")'); await p.waitForTimeout(900);
    ok('número certo: entrega fechada', /Entrega fechada/.test(await texto('#banner')) && !!lote(co1.id).saida_id && lote(co1.id).saiu_por === 'coleta', await texto('#banner'));
    await p.click('.dc:has-text("Carro da agência") button:has-text("Entregar")'); await p.waitForTimeout(800);
    if(/Seguir sem elas/.test(await texto('#painel'))){ await p.click('text=Seguir sem elas →'); await p.waitForTimeout(300); }
    await p.click('#painel button:has-text("Continuar")'); await p.waitForTimeout(300);
    await p.setInputFiles('#fotoIn', FOTO); await p.waitForTimeout(800);
    await p.click('#painel button:has-text("Continuar")'); await p.waitForTimeout(500);
    ok('agência: pede quem levou', !!(await p.$('#quemLevou')));
    await p.selectOption('#quemLevou', '2'); await p.fill('#numEnt', '1');
    await p.click('#painel button:has-text("Comparar e fechar")'); await p.waitForTimeout(900);
    ok('agência fechada com quem levou', /Entrega fechada/.test(await texto('#banner')) && lote(ag1.id).saiu_por === 'agencia', await texto('#banner'));
    await p.click('text=Histórico do dia'); await p.waitForTimeout(400);
    ok('o histórico do dia mostra as duas entregas', (await texto('#hist')).split('entregou').length - 1 === 2, await texto('#hist'));

    secao('5. a venda cancelada');
    const s3 = saldo('BK140140BEGE');
    await p.click('text=✕ Venda cancelada'); await p.waitForTimeout(400);
    await bipar(co3.code); await bipar('BK140140BEGE');
    await p.click('#painel button:text-is("Venda cancelada")'); await p.waitForTimeout(300);
    await p.click('text=Separar como venda cancelada'); await p.waitForTimeout(900);
    ok('separada: a caixa sai das listas', lote(co3.id).estagio === 'cancelado', lote(co3.id).estagio);
    eq('   e o saldo não mexeu', saldo('BK140140BEGE'), s3);

    secao('6. nada rola de lado');
    for(const w of [400, 768, 1024]){
      await p.setViewportSize({ width:w, height:900 }); await abrir();
      const m = await p.evaluate(() => ({ sw:document.documentElement.scrollWidth, cw:document.documentElement.clientWidth }));
      ok('a ' + w + ' px a página não rola de lado', m.sw <= m.cw, m);
    }
    await p.screenshot({ path:path.join(tmp, 'tela-400.png'), fullPage:true });
    if(process.env.SALVAR_TELA) fs.copyFileSync(path.join(tmp, 'tela-400.png'), process.env.SALVAR_TELA);
    eq('nenhum erro de script em tudo isso', erros, []);
  } catch(e){ falhas++; console.log('  FALHOU — o teste estourou: ' + (e && e.stack || e)); }
  await b.close(); srv.close(); fim();
});
function fim(){
  console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)');
  try{ fs.rmSync(tmp, { recursive:true, force:true }); }catch(e){}
  process.exit(falhas ? 1 : 0);
}
