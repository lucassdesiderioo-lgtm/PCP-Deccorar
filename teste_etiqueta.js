#!/usr/bin/env node
/* Testes da Etiqueta de Venda — a saída do estoque.
 *
 *   node teste_etiqueta.js
 *
 * O QUE ORIGINOU ESTES TESTES (01/09/2026): a baixa era fixa em UMA peça por
 * volume. Quando a produção passou a contar peças (dívida 11), o envio de
 * "Quantidade: 3" virou 3 ordens → 3 embalagens → +3 no estoque, e a impressão
 * baixava −1: sobravam 2 peças no saldo que fisicamente foram na caixa do
 * cliente. Furo silencioso, porque nada na tela dizia que o volume levava mais
 * de uma peça.
 *
 * A embalagem é sempre separada — uma peça por saco, independente da quantidade
 * (regra do dono da operação). Logo: entra +1 por peça embalada, e sai o tanto
 * que o volume leva.
 *
 * Sobe um banco temporário e chama os handlers direto, com um `app` de mentira
 * que só guarda as rotas. Não abre porta, não toca no banco de produção.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-etq-'));
const db = new Database(path.join(tmp, 't.db'));
db.exec(`
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT,
    exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
  CREATE TABLE cor (codigo TEXT PRIMARY KEY, nome TEXT);
  CREATE TABLE tecido (codigo TEXT PRIMARY KEY, nome TEXT);
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER,
    largura_cm INTEGER, altura_cm INTEGER, cor_codigo TEXT, tecido_codigo TEXT);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, cor TEXT, buyer TEXT,
    city TEXT, nf TEXT, packId TEXT, venda TEXT, estagio TEXT DEFAULT 'pendente',
    embalado_em TEXT, data TEXT DEFAULT (date('now','localtime')), despachar_em TEXT,
    pecas INTEGER DEFAULT 1);
`);
db.prepare("INSERT INTO modelo (id,codigo,nome,sob_medida) VALUES (1,'ROLO','Rolô',0)").run();
db.prepare("INSERT INTO modelo (id,codigo,nome,sob_medida) VALUES (2,'SOBMED','Sob medida',1)").run();
const sku = db.prepare("INSERT INTO skus (codigo,estoque,modelo_id) VALUES (?,?,?)");
sku.run('BK140140BEGE', 5, 1);
sku.run('BK160160CINZA', 2, 1);
sku.run('SOBMEDIDA', 0, 2);

const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
const vol = db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,venda,estagio,data,pecas)
  VALUES (?,?,?,?,?,'pendente',?,?)`);
vol.run('BK140140BEGE','Abraao Amorim','1','111','901',hoje,3);   // id 1 — o caso
vol.run('BK140140BEGE','Maria Souza',  '2','112','902',hoje,1);   // id 2
vol.run('BK160160CINZA','Joao Silva',  '3','113','903',hoje,3);   // id 3 — falta peça
vol.run('SOBMEDIDA','Lucelia',         '4','114','904',hoje,2);   // id 4 — sob medida
db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,venda,estagio,data,pecas)
  VALUES ('BK140140BEGE','Antigo','5','115','905','pendente',?,NULL)`).run(hoje); // id 5

const rotas = {};
const app = { get:(p,...h)=>{ rotas['GET '+p]=h[h.length-1]; },
              post:(p,...h)=>{ rotas['POST '+p]=h[h.length-1]; }, locals:{} };
require('./etq_route')(app, db);

const chamar = (k, body, params) => new Promise(r => {
  const res = { json:o=>r(o), status(){ return this; }, send:o=>r(o) };
  rotas[k]({ body:body||{}, params:params||{}, query:{}, headers:{} }, res);
});
const estoqueDe = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra ? '   ' + extra : '')); } };

(async () => {
  // ── O BIPE MOSTRA QUANTAS PECAS ──────────────────────────────────────────
  const px = await chamar('GET /api/proximo/:sku', null, {sku:'BK140140BEGE'});
  ok('o bipe do SKU diz quantas peças o volume leva',
     px.pedido && px.pedido.pecas === 3, JSON.stringify(px.pedido));

  // ── A BAIXA E DO TAMANHO DO VOLUME ───────────────────────────────────────
  const antes = estoqueDe('BK140140BEGE');
  const r1 = await chamar('POST /api/embalar', {id:1});
  ok('volume de 3 peças baixa 3 do estoque (5 → 2)',
     r1.ok && estoqueDe('BK140140BEGE') === antes-3,
     'antes ' + antes + ' depois ' + estoqueDe('BK140140BEGE'));
  ok('e a resposta diz quantas saíram', r1.pecas === 3, JSON.stringify(r1));
  /* A conta velha baixava 1 e deixava 2 peças fantasmas no saldo — peças que
     foram na caixa do cliente e continuavam contando como estoque. */
  ok('a conta velha (baixar 1) deixaria 4 no saldo', estoqueDe('BK140140BEGE') !== 4);

  const r2 = await chamar('POST /api/embalar', {id:2});
  ok('volume de 1 peça continua baixando 1 (2 → 1)',
     r2.ok && estoqueDe('BK140140BEGE') === 1, 'veio ' + estoqueDe('BK140140BEGE'));

  // ── PASSIVO ANTIGO: pecas NULL vale 1 ────────────────────────────────────
  const r5 = await chamar('POST /api/embalar', {id:5});
  ok('volume gravado antes da coluna existir baixa 1 (1 → 0)',
     r5.ok && estoqueDe('BK140140BEGE') === 0, 'veio ' + estoqueDe('BK140140BEGE'));

  // ── A TRAVA E PELO QUE O VOLUME LEVA, E DIZ O QUE FALTA ──────────────────
  const r3 = await chamar('POST /api/embalar', {id:3});
  ok('volume de 3 peças com 2 em estoque é recusado', !!r3.erro, JSON.stringify(r3));
  ok('e a mensagem diz quantas faltam, não só "sem estoque"',
     /3 peças/.test(r3.erro||'') && /Falta 1\./.test(r3.erro||''), r3.erro);
  ok('recusado não mexe no estoque nem no volume',
     estoqueDe('BK160160CINZA') === 2 &&
     db.prepare('SELECT estagio FROM lote WHERE id=3').get().estagio === 'pendente');

  // ── SOB MEDIDA: nem trava nem baixa, mesmo com 2 pecas ───────────────────
  const r4 = await chamar('POST /api/embalar', {id:4});
  ok('sob medida imprime com estoque zero (a peça é feita pro pedido)', !!r4.ok,
     JSON.stringify(r4));
  ok('e não abre buraco no saldo: continua zero', estoqueDe('SOBMEDIDA') === 0,
     'veio ' + estoqueDe('SOBMEDIDA'));

  // ── O QUE JA ANDOU NAO ANDA DE NOVO ──────────────────────────────────────
  const rep = await chamar('POST /api/embalar', {id:1});
  ok('o mesmo volume não baixa duas vezes', !!rep.erro && estoqueDe('BK140140BEGE') === 0,
     JSON.stringify(rep));

  console.log('');
  console.log(falhas ? ('FALHARAM ' + falhas + ' de ' + casos)
                     : ('todos os ' + casos + ' casos passaram'));
  try{ fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){}
  process.exit(falhas ? 1 : 0);
})();
