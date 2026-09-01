#!/usr/bin/env node
/* Testes do cruzamento PDF × estoque — a ordem de produção urgente.
 *
 *   node teste_cruzamento.js
 *
 * O QUE ORIGINOU ESTES TESTES: a dívida 11 do §14, a de maior risco do
 * CLAUDE.md. O item da folha que diz "Quantidade: 3" tem UMA etiqueta e vira UM
 * volume — o parse está certo em gravar uma linha só (armadilha #8). Mas a
 * fábrica precisa das TRÊS persianas, e o cruzamento contava volumes com
 * COUNT(*): aquele envio gerava 1 ordem urgente, a bancada produzia 1, e o
 * cliente que comprou 3 recebia 1.
 *
 * O erro não aparecia em tela nenhuma antes da reclamação: a tela mostrava "1"
 * e o "1" tinha sido produzido, então a conta fechava com ela mesma.
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
    estagio TEXT DEFAULT 'pendente', data TEXT DEFAULT (date('now','localtime')),
    pecas INTEGER DEFAULT 1);
`);

const sku = db.prepare("INSERT INTO skus (codigo,estoque) VALUES (?,?)");
sku.run('BK140140BEGE', 0);    // sem estoque: tudo vira urgente
sku.run('BK160160CINZA', 2);   // com estoque: o estoque abate
sku.run('BK150150BRANCO', 9);  // estoque de sobra: nada urgente

const hoje  = db.prepare("SELECT date('now','localtime') d").get().d;
const ontem = db.prepare("SELECT date('now','localtime','-1 day') d").get().d;
const vol = db.prepare("INSERT INTO lote (codigo,packId,venda,estagio,data,pecas) VALUES (?,?,?,?,?,?)");

/* O CASO DA DÍVIDA: um envio, uma etiqueta, TRÊS persianas. */
vol.run('BK140140BEGE','111','901','pendente',hoje,3);
/* E um envio normal do mesmo SKU, para o total ser 3+1 e não só 3. */
vol.run('BK140140BEGE','112','902','pendente',hoje,1);
/* Dois volumes de 2 peças cada, com 2 em estoque: 4 − 2 = 2 urgentes. */
vol.run('BK160160CINZA','221','921','pendente',hoje,2);
vol.run('BK160160CINZA','222','922','pendente',hoje,2);
/* Estoque cobre: 2 peças contra 9 em estoque, nada urgente. */
vol.run('BK150150BRANCO','331','931','pendente',hoje,2);
/* Já embalado não é trabalho: sai da conta. */
vol.run('BK140140BEGE','113','903','embalado',hoje,5);
/* Bloqueado também não gera ordem — ninguém sabe ainda qual peça é. */
vol.run('BK140140BEGE','114','904','bloqueado',hoje,4);
/* De ontem: o cruzamento é do dia da importação. */
vol.run('BK140140BEGE','115','905','pendente',ontem,7);
/* PASSIVO ANTIGO: linha gravada antes da coluna existir, com pecas NULL.
   Tem que valer 1 — é o que o sistema assumia até agora. */
db.prepare("INSERT INTO lote (codigo,packId,venda,estagio,data,pecas) VALUES ('BK150150BRANCO','332','932','pendente',?,NULL)").run(hoje);

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

  // ── A DÍVIDA 11 ──────────────────────────────────────────────────────────
  ok('conta PEÇAS, não volumes: 3 + 1 = 4 pendentes em 2 volumes',
     por.BK140140BEGE.pendentes === 4 && por.BK140140BEGE.volumes === 2,
     JSON.stringify(por.BK140140BEGE));
  ok('e o urgente sai em peças: 4 sem estoque = 4 a produzir',
     por.BK140140BEGE.urgente === 4, 'veio ' + por.BK140140BEGE.urgente);
  ok('a conta velha (1 por volume) não é mais o que a tela mostra',
     por.BK140140BEGE.urgente !== 2);

  // ── O ESTOQUE ABATE, EM PEÇAS ────────────────────────────────────────────
  ok('2 volumes de 2 peças com 2 em estoque = 2 urgentes',
     por.BK160160CINZA.pendentes === 4 && por.BK160160CINZA.urgente === 2,
     JSON.stringify(por.BK160160CINZA));
  ok('estoque de sobra não gera ordem nenhuma',
     por.BK150150BRANCO.urgente === 0, JSON.stringify(por.BK150150BRANCO));

  // ── PASSIVO ANTIGO: pecas NULL vale 1 ────────────────────────────────────
  ok('volume gravado antes da coluna existir vale 1 peça (2 + 1 = 3)',
     por.BK150150BRANCO.pendentes === 3, 'veio ' + por.BK150150BRANCO.pendentes);

  // ── O QUE NÃO ENTRA ──────────────────────────────────────────────────────
  ok('volume já embalado não vira ordem (as 5 peças ficam de fora)',
     por.BK140140BEGE.pendentes === 4);
  ok('volume bloqueado também não: ninguém sabe qual peça é',
     por.BK140140BEGE.pendentes === 4);
  ok('e o cruzamento é do dia da importação (as 7 de ontem ficam fora)',
     por.BK140140BEGE.pendentes === 4);

  // ── APLICAR: o que vai pra produção ──────────────────────────────────────
  const ap = await chamar('POST /api/cruzamento/aplicar');
  ok('lança as ordens em peças (4 + 2 = 6 urgentes)', ap.urgentes === 6,
     'veio ' + ap.urgentes);
  const ordens = db.prepare("SELECT codigo, qtd FROM producao WHERE origem='ml' ORDER BY codigo").all();
  ok('grava a ordem do SKU de 3 peças com a quantidade certa',
     (ordens.find(o => o.codigo === 'BK140140BEGE') || {}).qtd === 4,
     JSON.stringify(ordens));
  ok('e não lança ordem para quem tem estoque',
     !ordens.find(o => o.codigo === 'BK150150BRANCO'), JSON.stringify(ordens));

  /* Idempotência: subir o mesmo PDF duas vezes não pode duplicar a ordem. Era
     verdade antes desta mudança e tem que continuar sendo. */
  const ap2 = await chamar('POST /api/cruzamento/aplicar');
  const ordens2 = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(qtd),0) t FROM producao WHERE origem='ml'").get();
  ok('reaplicar não duplica: mesma quantidade de ordens e mesmo total',
     ap2.urgentes === 6 && ordens2.n === ordens.length && ordens2.t === 6,
     JSON.stringify(ordens2));

  /* O lançamento MANUAL não é apagado pelo recálculo (§5: "manual e PDF não se
     conversam"). Se fosse, o recálculo comeria a produção lançada à mão. */
  db.prepare("INSERT INTO producao (codigo,qtd,origem) VALUES ('BK140140BEGE',9,'manual')").run();
  await chamar('POST /api/cruzamento/aplicar');
  ok('o recálculo não apaga o lançamento manual',
     !!db.prepare("SELECT 1 FROM producao WHERE origem='manual' AND qtd=9").get());

  console.log('');
  console.log(falhas ? ('FALHARAM ' + falhas + ' de ' + casos)
                     : ('todos os ' + casos + ' casos passaram'));
  try{ fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){}
  process.exit(falhas ? 1 : 0);
})();
