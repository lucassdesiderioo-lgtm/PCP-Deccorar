#!/usr/bin/env node
/* teste_conferencia_tela.js — a TELA de Conferência (/carregamento) num
 * navegador de verdade, com as rotas de verdade (spec CONFERENCIA-EXPEDICAO,
 * fases 1 a 4, 03/11/2026).
 *
 *   node teste_conferencia_tela.js
 *
 * NAO sobe o server.js (a porta 3010 e fixa e, no servidor, bateria na
 * producao): monta um Express so com as rotas da expedicao, num banco
 * temporario e numa porta livre, e o Chromium clica como a bancada clicaria:
 *
 *   1  a lista unica, com a marcacao, e sem os blocos que sairam
 *   2  o bipe de conferencia move a caixa de "Esperando" para "Conferidas"
 *   3  a viagem a agencia: abrir, bipar o que ficou, fechar com foto,
 *      numero e QUEM LEVOU
 *   4  o fim do dia: "a coleta nao passou" e o selo "de ontem" no dia seguinte
 *   5  a venda cancelada: o operador separa (bipe + SKU) sem mexer no saldo,
 *      a gestao confirma (o saldo volta) ou recusa (a caixa volta a lista)
 *   6  a 400 px nada rola de lado; e nenhum erro de script em tudo isso
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
app.get('/api/teste', (req, res) => res.json({ ativo:false }));
require('./exp_route')(app, db);
require('./carreg_route')(app, db);
require('./saida_route')(app, db);
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
    let respostaDialogo = null;
    p.on('dialog', d => d.accept(respostaDialogo == null ? undefined : respostaDialogo));
    const abrir = async () => { await p.goto(B + '/carregamento'); await p.waitForTimeout(900); };
    const texto = async sel => (await p.textContent(sel)) || '';
    const bipar = async code => { await p.fill('#scan', code); await p.press('#scan', 'Enter'); await p.waitForTimeout(700); };

    /* ═════ 1 ═════ */
    secao('1. a lista única, e os blocos que saíram');
    await abrir();
    const esp = await texto('#espL'), conf = await texto('#confL');
    ok('Esperando conferência traz as de agência e as de coleta', /Agencia Um Conferir/.test(esp) && /Coleta Um Bancada/.test(esp), esp);
    ok('Conferidas traz a agência conferida e a coleta no canto', /Agencia Dois Conferida/.test(conf) && /Coleta Dois No Canto/.test(conf), conf);
    ok('cada caixa leva a marcação Coleta ou Agência', (await p.$$('#espL .tag.col')).length === 1 && (await p.$$('#espL .tag.age')).length === 1);
    for(const id of ['nCar','nFal','nAdi','pendAviso','sobrasCard','pFalD'])
      ok('saiu da tela: #' + id, !(await p.$('#' + id)));
    ok('o "Conferir carga do carro" saiu', !/Conferir carga do carro/.test(await texto('body')));

    /* ═════ 2 ═════ */
    secao('2. o bipe de conferência');
    await bipar(ag1.code);
    ok('o banner diz que conferiu', /conferi|área|ÁREA/i.test(await texto('#banner')), await texto('#banner'));
    await p.waitForTimeout(500); await abrir();
    ok('a caixa passou de Esperando para Conferidas', !/Agencia Um Conferir/.test(await texto('#espL')) && /Agencia Um Conferir/.test(await texto('#confL')));

    /* ═════ 3 ═════ */
    secao('3. a viagem à agência: abrir, bipar o que ficou, fechar com quem levou');
    QUEM = 2; await abrir();
    await p.click('text=🚗 Viagem à agência'); await p.waitForTimeout(900);
    ok('abrir põe no carro as três conferidas de agência', /3 no carro/.test(await texto('#banner')), await texto('#banner'));
    ok('a faixa diz que o bipe é o que FICOU', /FICOU NA FÁBRICA/.test(await texto('#modoBar')), await texto('#modoBar'));
    await bipar(ag3.code);
    ok('bipar a caixa que ficou tira ela do carro', /Ficou na fábrica/.test(await texto('#banner')) && !lote(ag3.id).saida_id, await texto('#banner'));
    const opcoes = await p.$$eval('#quemLevou option', os => os.map(o => o.textContent));
    ok('"Quem levou" lista as pessoas do cadastro', opcoes.includes('Beto Carro') && opcoes.includes('Ana Bancada'), opcoes);
    const foto = path.join(tmp, 'atendente.png'); fs.writeFileSync(foto, await p.screenshot());
    await p.setInputFiles('#fotoInV', foto); await p.waitForTimeout(500);
    await p.fill('#atQtd', '2');
    await p.click('text=Fechar viagem'); await p.waitForTimeout(600);
    ok('sem quem levou, a tela pede e não fecha', /Quem levou/.test(await texto('#banner')) && !db.prepare("SELECT 1 FROM saida WHERE tipo='agencia' AND fechada_em IS NOT NULL").get(), await texto('#banner'));
    await p.selectOption('#quemLevou', { label:'Beto Carro' });
    await p.click('text=Fechar viagem'); await p.waitForTimeout(900);
    const sv = db.prepare("SELECT * FROM saida WHERE tipo='agencia' AND fechada_em IS NOT NULL").get() || {};
    ok('fechou: a viagem tem a foto, os números e quem levou', !!sv.foto && sv.qtd_sistema === 2 && sv.qtd_externa === 2 && sv.quem_levou === 'Beto Carro', sv);
    eq('   e quem fechou é o login', sv.fechado_por, 'Beto Carro');
    ok('o histórico da viagem mostra quem levou', /levou: Beto Carro/.test(await texto('#viagemHist')), await texto('#viagemHist'));

    /* ═════ 4 ═════ */
    secao('4. o fim do dia: a coleta não passou');
    const antes = JSON.stringify(lote(co2.id));
    await p.click('#btnNaoPassou'); await p.waitForTimeout(800);
    ok('registrar avisa quantas ficaram', /a coleta não passou/i.test(await texto('#banner')), await texto('#banner'));
    ok('a linha do fim do dia diz quem registrou', /Registrado hoje por/.test(await texto('#fimInfo')), await texto('#fimInfo'));
    eq('a caixa não mudou nada', JSON.stringify(lote(co2.id)), antes);
    db.prepare('UPDATE fim_dia SET dia=?').run(ONTEM);
    await abrir();
    const primeira = await p.$eval('#confL .row', e => e.textContent).catch(() => '');
    ok('no dia seguinte, a que ficou vem EM CIMA com o selo "de ontem"', /de ontem/.test(primeira), primeira);

    /* ═════ 5 ═════ */
    secao('5. a venda cancelada: separa, e outra pessoa confirma ou recusa');
    QUEM = 1; await abrir();
    const s0 = saldo('BK140140BEGE');
    await p.click('#btnSobrou'); await p.waitForTimeout(300);
    ok('a faixa vira VENDA CANCELADA', /VENDA CANCELADA/.test(await texto('#modoBar')), await texto('#modoBar'));
    await bipar(co3.code);
    await bipar('BK140140BEGE');
    await p.click('#banner button:text-is("Venda cancelada")'); await p.waitForTimeout(300);
    await p.click('text=Separar como venda cancelada'); await p.waitForTimeout(900);
    ok('separada: o banner manda separar e esperar a confirmação', /Separada/.test(await texto('#banner')) && /confirma/i.test(await texto('#banner')), await texto('#banner'));
    eq('   separar NÃO mexe no saldo', saldo('BK140140BEGE'), s0);
    ok('   e a caixa saiu da lista de saída', !/Coleta Tres Cancelar/.test(await texto('#confL')));
    ok('a lista "aguardando confirmação" mostra a caixa, sem botões para quem não pode',
       /Coleta Tres Cancelar/.test(await texto('#cancL')) && !(await p.$('#cancL >> text=Confirmar no ML')), await texto('#cancL'));
    // a mesma pessoa separa a segunda, para a gestao recusar
    await p.click('#btnSobrou'); await p.waitForTimeout(200);
    await bipar(co4.code); await bipar('BK120120BEGE');
    await p.click('#banner button:text-is("Motorista recusou")'); await p.waitForTimeout(300);
    await p.click('text=Separar como venda cancelada'); await p.waitForTimeout(900);
    QUEM = 3; await abrir();
    ok('para a gestão, os botões aparecem', !!(await p.$('#cancL >> text=Confirmar no ML')) && !!(await p.$('#cancL >> text=Recusar')));
    await p.click('#cancL .row:has-text("Coleta Tres Cancelar") button:text-is("Confirmar no ML")'); await p.waitForTimeout(900);
    ok('confirmar: o banner diz que o estoque voltou', /voltou \+1/.test(await texto('#banner')), await texto('#banner'));
    eq('   +1 no saldo', saldo('BK140140BEGE'), s0 + 1);
    const s1 = saldo('BK120120BEGE');
    respostaDialogo = 'No ML a venda segue ativa';
    await p.click('#cancL .row:has-text("Coleta Quatro Recusar") button:text-is("Recusar")'); await p.waitForTimeout(900);
    respostaDialogo = null;
    ok('recusar: a caixa volta para a lista de saída', /Coleta Quatro Recusar/.test(await texto('#confL')) && lote(co4.id).estagio === 'carregado', await texto('#confL'));
    eq('   e o saldo não mexeu', saldo('BK120120BEGE'), s1);
    ok('a lista das canceladas zera', /Nenhuma venda cancelada esperando/.test(await texto('#cancL')), await texto('#cancL'));

    /* ═════ 6 ═════ */
    secao('6. no celular nada rola de lado');
    await p.setViewportSize({ width:400, height:900 }); await abrir();
    const m = await p.evaluate(() => ({ sw:document.documentElement.scrollWidth, cw:document.documentElement.clientWidth }));
    ok('a 400 px a página não rola de lado', m.sw <= m.cw, m);
    /* O cabecalho da lista nasceu ambar: a classe `conf` ja era de um botao
       antigo (o "Conferir carga do carro"). So apareceu abrindo a tela. */
    const fundo = await p.$eval('#confT', e => getComputedStyle(e).backgroundColor);
    ok('o cabeçalho "Conferidas" não herda a cor de outra regra', fundo === 'rgb(250, 251, 253)', fundo);
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
