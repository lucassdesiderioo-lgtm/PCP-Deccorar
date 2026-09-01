#!/usr/bin/env node
/* Testes do cruzamento PDF × estoque — a ordem de produção urgente.
 *
 *   node teste_cruzamento.js
 *
 * ⚠️ A REGRA QUE ESTES TESTES PROTEGEM: **uma venda = uma etiqueta = uma
 * persiana** (§2). Não se junta etiqueta, pacote nem caixa. Cada linha de
 * `lote` é uma peça, então contar volumes É contar peças.
 *
 * Isso não é detalhe: em 01/09/2026 o cruzamento foi alterado para multiplicar
 * o volume pela "Quantidade" da folha, e a alteração foi revertida no mesmo dia
 * por contrariar a regra da operação. O caso 1 aqui existe para que ninguém
 * repita a tentativa sem quebrar um teste antes.
 *
 * Sobe um banco temporário e chama os handlers direto, com um `app` de mentira
 * que só guarda as rotas. Não abre porta, não toca no banco de produção.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-cruz-'));
const db = new Database(path.join(tmp, 't.db'));
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0);
  CREATE TABLE producao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, qtd INTEGER,
    produzido INTEGER DEFAULT 0, data TEXT DEFAULT (date('now','localtime')),
    origem TEXT DEFAULT 'manual', urgente INTEGER DEFAULT 0, teste INTEGER DEFAULT 0);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, packId TEXT, venda TEXT,
    estagio TEXT DEFAULT 'pendente', data TEXT DEFAULT (date('now','localtime')));
`);

const sku = db.prepare("INSERT INTO skus (codigo,estoque) VALUES (?,?)");
sku.run('BK140140BEGE', 0);    // sem estoque: toda venda vira urgente
sku.run('BK160160CINZA', 2);   // com estoque: o estoque abate
sku.run('BK150150BRANCO', 9);  // estoque de sobra: nada urgente

const hoje  = db.prepare("SELECT date('now','localtime') d").get().d;
const ontem = db.prepare("SELECT date('now','localtime','-1 day') d").get().d;
const vol = db.prepare("INSERT INTO lote (codigo,packId,venda,estagio,data) VALUES (?,?,?,?,?)");

/* O CLIENTE QUE COMPROU TRÊS: são três vendas, três etiquetas, três volumes —
   é assim que o Mercado Livre despacha e é assim que a fábrica trabalha. */
vol.run('BK140140BEGE','111','901','pendente',hoje);
vol.run('BK140140BEGE','112','902','pendente',hoje);
vol.run('BK140140BEGE','113','903','pendente',hoje);
/* Duas vendas com 2 em estoque: 2 − 2 = 0 urgentes. */
vol.run('BK160160CINZA','221','921','pendente',hoje);
vol.run('BK160160CINZA','222','922','pendente',hoje);
/* Estoque de sobra. */
vol.run('BK150150BRANCO','331','931','pendente',hoje);
/* Já embalado não é trabalho de produção: sai da conta. */
vol.run('BK140140BEGE','114','904','embalado',hoje);
/* Bloqueado também não gera ordem — ninguém sabe ainda qual peça é. */
vol.run('BK140140BEGE','115','905','bloqueado',hoje);
/* De ontem: o cruzamento é do dia da importação. */
vol.run('BK140140BEGE','116','906','pendente',ontem);

const rotas = {};
const app = { get:(p,...h)=>{ rotas['GET '+p]=h[h.length-1]; },
              post:(p,...h)=>{ rotas['POST '+p]=h[h.length-1]; }, locals:{} };
require('./cruz_route')(app, db);

const chamar = (k, body) => new Promise(r => {
  const res = { json:o=>r(o), status(){ return this; }, send:o=>r(o) };
  rotas[k]({ body:body||{}, query:{}, headers:{} }, res);
});

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra ? '   ' + extra : '')); } };

(async () => {
  const l = await chamar('GET /api/cruzamento');
  const por = {}; l.forEach(x => por[x.codigo] = x);

  // ── UMA ETIQUETA, UMA PERSIANA ───────────────────────────────────────────
  ok('quem comprou 3 vezes gera 3 volumes e 3 urgentes',
     por.BK140140BEGE.pendentes === 3 && por.BK140140BEGE.urgente === 3,
     JSON.stringify(por.BK140140BEGE));
  /* Se alguém multiplicar o volume por uma "quantidade", este caso quebra: são
     3 etiquetas de 1 peça, e o número é 3 — nunca 9, nunca 1. */
  ok('a conta é por etiqueta: nada multiplica o volume',
     por.BK140140BEGE.pendentes === 3);

  // ── O ESTOQUE ABATE ──────────────────────────────────────────────────────
  ok('2 vendas com 2 em estoque não geram urgência',
     por.BK160160CINZA.pendentes === 2 && por.BK160160CINZA.urgente === 0,
     JSON.stringify(por.BK160160CINZA));
  ok('e as duas contam como cobertas pelo estoque',
     por.BK160160CINZA.cobertos === 2);
  ok('estoque de sobra não gera ordem nenhuma',
     por.BK150150BRANCO.urgente === 0, JSON.stringify(por.BK150150BRANCO));

  // ── O QUE NÃO ENTRA ──────────────────────────────────────────────────────
  ok('volume já embalado não vira ordem', por.BK140140BEGE.pendentes === 3);
  ok('volume bloqueado também não: ninguém sabe qual peça é',
     por.BK140140BEGE.pendentes === 3);
  ok('e o cruzamento é do dia da importação (o de ontem fica fora)',
     por.BK140140BEGE.pendentes === 3);

  // ── APLICAR: o que vai pra produção ──────────────────────────────────────
  const ap = await chamar('POST /api/cruzamento/aplicar');
  ok('lança 3 urgentes', ap.urgentes === 3, 'veio ' + ap.urgentes);
  const ordens = db.prepare("SELECT codigo, qtd FROM producao WHERE origem='ml' ORDER BY codigo").all();
  ok('grava a ordem com a quantidade certa',
     (ordens.find(o => o.codigo === 'BK140140BEGE') || {}).qtd === 3,
     JSON.stringify(ordens));
  ok('e não lança ordem para quem tem estoque',
     !ordens.find(o => o.codigo === 'BK150150BRANCO') &&
     !ordens.find(o => o.codigo === 'BK160160CINZA'), JSON.stringify(ordens));

  /* Idempotência: subir o mesmo PDF duas vezes não pode duplicar a ordem. */
  const ap2 = await chamar('POST /api/cruzamento/aplicar');
  const ordens2 = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(qtd),0) t FROM producao WHERE origem='ml'").get();
  ok('reaplicar não duplica: mesma quantidade de ordens e mesmo total',
     ap2.urgentes === 3 && ordens2.n === ordens.length && ordens2.t === 3,
     JSON.stringify(ordens2));

  /* O lançamento MANUAL não é apagado pelo recálculo (§5: "manual e PDF não se
     conversam"). Se fosse, o recálculo comeria a produção lançada à mão. */
  db.prepare("INSERT INTO producao (codigo,qtd,origem) VALUES ('BK140140BEGE',9,'manual')").run();
  await chamar('POST /api/cruzamento/aplicar');
  ok('o recálculo não apaga o lançamento manual',
     !!db.prepare("SELECT 1 FROM producao WHERE origem='manual' AND qtd=9").get());

  /* Produzir e expedir corrige o número sozinho: o volume sai de `pendente` e o
     estoque baixa junto. É o que substituiu a foto_estoque na Fase 3. */
  db.prepare("UPDATE lote SET estagio='embalado' WHERE packId='111'").run();
  const l2 = await chamar('GET /api/cruzamento');
  ok('reaplicar depois de expedir não infla: cai para 2',
     (l2.find(x => x.codigo === 'BK140140BEGE') || {}).urgente === 2,
     JSON.stringify(l2.find(x => x.codigo === 'BK140140BEGE')));

  console.log('');
  console.log(falhas ? ('FALHARAM ' + falhas + ' de ' + casos)
                     : ('todos os ' + casos + ' casos passaram'));
  try{ fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){}
  process.exit(falhas ? 1 : 0);
})();
