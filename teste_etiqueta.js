#!/usr/bin/env node
/* Testes da Etiqueta de Venda — a saída do estoque.
 *
 *   node teste_etiqueta.js
 *
 * ⚠️ A REGRA QUE ESTES TESTES PROTEGEM: **uma venda = uma etiqueta = uma
 * persiana** (§2). Cada impressão baixa exatamente UMA peça, porque cada
 * etiqueta é de uma peça. Não se junta etiqueta, pacote nem caixa.
 *
 * Em 01/09/2026 a baixa foi alterada para descontar uma "quantidade" do volume,
 * e a alteração foi revertida no mesmo dia por contrariar a regra da operação.
 * O caso 1 aqui existe para que a tentativa quebre um teste antes de chegar ao
 * saldo.
 *
 * A rota não tinha teste nenhum até aqui, e ela mexe em `skus.estoque` — que é
 * a coluna que não se reconstrói (§14).
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
    embalado_em TEXT, data TEXT DEFAULT (date('now','localtime')), despachar_em TEXT);
`);
db.prepare("INSERT INTO modelo (id,codigo,nome,sob_medida) VALUES (1,'ROLO','Rolô',0)").run();
db.prepare("INSERT INTO modelo (id,codigo,nome,sob_medida) VALUES (2,'SOBMED','Sob medida',1)").run();
db.prepare("INSERT INTO cor (codigo,nome) VALUES ('BEGE','Bege')").run();
const sku = db.prepare(`INSERT INTO skus (codigo,estoque,modelo_id,largura_cm,altura_cm,cor_codigo)
  VALUES (?,?,?,?,?,?)`);
sku.run('BK140140BEGE', 2, 1, 140, 140, 'BEGE');
sku.run('BK160160CINZA', 0, 1, 160, 160, null);
sku.run('SOBMEDIDA', 0, 2, null, null, null);

const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
const amanha = db.prepare("SELECT date('now','localtime','+9 day') d").get().d;
const vol = db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,venda,estagio,data,despachar_em)
  VALUES (?,?,?,?,?,'pendente',?,?)`);
vol.run('BK140140BEGE','Abraao Amorim','1','111','901',hoje,hoje);   // id 1
vol.run('BK140140BEGE','Abraao Amorim','2','112','902',hoje,hoje);   // id 2 — mesma pessoa, outra venda
vol.run('BK140140BEGE','Maria Souza',  '3','113','903',hoje,amanha); // id 3 — venda futura
vol.run('BK160160CINZA','Joao Silva',  '4','114','904',hoje,hoje);   // id 4 — sem estoque
vol.run('SOBMEDIDA','Lucelia',         '5','115','905',hoje,hoje);   // id 5 — sob medida
db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,venda,estagio,data)
  VALUES ('BK140140BEGE','Pedro','6','116','906','bloqueado',?)`).run(hoje);  // id 6

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
  // ── CADA ETIQUETA BAIXA UMA PECA ─────────────────────────────────────────
  const r1 = await chamar('POST /api/embalar', {id:1});
  ok('imprimir a etiqueta baixa UMA peça (2 → 1)',
     r1.ok && estoqueDe('BK140140BEGE') === 1, 'veio ' + estoqueDe('BK140140BEGE'));
  const r2 = await chamar('POST /api/embalar', {id:2});
  ok('a segunda venda do mesmo cliente baixa outra (1 → 0)',
     r2.ok && estoqueDe('BK140140BEGE') === 0, 'veio ' + estoqueDe('BK140140BEGE'));
  ok('o volume andou para embalado, com carimbo de hora',
     db.prepare("SELECT estagio,embalado_em FROM lote WHERE id=1").get().estagio === 'embalado' &&
     !!db.prepare("SELECT embalado_em FROM lote WHERE id=1").get().embalado_em);

  // ── A TRAVA DE ESTOQUE ───────────────────────────────────────────────────
  const r3 = await chamar('POST /api/embalar', {id:3});
  ok('sem peça na prateleira não imprime — nem a venda futura',
     !!r3.erro && estoqueDe('BK140140BEGE') === 0, JSON.stringify(r3));
  ok('e o volume recusado continua pendente',
     db.prepare("SELECT estagio FROM lote WHERE id=3").get().estagio === 'pendente');
  const r4 = await chamar('POST /api/embalar', {id:4});
  ok('SKU com estoque zero também é recusado', !!r4.erro, JSON.stringify(r4));

  // ── SOB MEDIDA: nem trava nem baixa (§7) ─────────────────────────────────
  const r5 = await chamar('POST /api/embalar', {id:5});
  ok('sob medida imprime com estoque zero — a peça é feita pro pedido', !!r5.ok,
     JSON.stringify(r5));
  ok('e não abre buraco no saldo: continua zero', estoqueDe('SOBMEDIDA') === 0,
     'veio ' + estoqueDe('SOBMEDIDA'));

  // ── O QUE A TRAVA DO §6 SEGURA ───────────────────────────────────────────
  const r6 = await chamar('POST /api/embalar', {id:6});
  ok('volume bloqueado não imprime (SKU fora do cadastro)', !!r6.erro,
     JSON.stringify(r6));

  // ── NADA ANDA DUAS VEZES ─────────────────────────────────────────────────
  db.prepare("UPDATE skus SET estoque=5 WHERE codigo='BK140140BEGE'").run();
  const rep = await chamar('POST /api/embalar', {id:1});
  ok('o mesmo volume não baixa duas vezes, nem com estoque sobrando',
     !!rep.erro && estoqueDe('BK140140BEGE') === 5, JSON.stringify(rep));

  // ── O BIPE DO SKU ────────────────────────────────────────────────────────
  const px = await chamar('GET /api/proximo/:sku', null, {sku:'BK140140BEGE'});
  ok('o bipe acha a próxima venda e diz o que a peça é',
     px.cadastrado && px.pedido && px.peca && px.peca.medida === '140 × 140',
     JSON.stringify(px.peca));
  /* Venda futura entra na busca (o que decide é a ORDEM, §8): esgotadas as de
     hoje, o bipe segue trabalhando em vez de dizer que não há nada. */
  ok('e marca quando a venda escolhida é adiantada', px.adiantado === true,
     JSON.stringify({adiantado:px.adiantado, prazo:px.pedido&&px.pedido.despachar_em}));
  const nx = await chamar('GET /api/proximo/:sku', null, {sku:'NAOEXISTE'});
  ok('SKU fora do cadastro responde que não é cadastrado', nx.cadastrado === false);

  console.log('');
  console.log(falhas ? ('FALHARAM ' + falhas + ' de ' + casos)
                     : ('todos os ' + casos + ' casos passaram'));
  try{ fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){}
  process.exit(falhas ? 1 : 0);
})();
