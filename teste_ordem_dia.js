#!/usr/bin/env node
/* Testes da tela vermelha — "o que ainda falta das ordens de hoje".
 *
 *   node teste_ordem_dia.js
 *
 * O CASO QUE ESTES TESTES PROTEGEM (08/09/2026): 140 etiquetas do dia
 * despachadas, zero volume pendente, e a tela vermelha dizendo "4 peça(s)
 * URGENTE(S) para hoje". Eram peças revisadas na tela AZUL e embaladas como
 * estoque: a venda saiu da prateleira, mas a ordem — que só é abatida pela
 * embalagem de fila modo 'hoje' — ficou aberta. Tile e aviso liam réguas
 * diferentes (o tile contava revisão de qualquer modo, o aviso só modo 'hoje'),
 * e o número foi lido como peça perdida.
 *
 * Sobe um banco temporário e chama os handlers direto. Não toca em produção.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-ordem-'));
const db = new Database(path.join(tmp, 't.db'));
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0);
  CREATE TABLE producao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, qtd INTEGER,
    produzido INTEGER DEFAULT 0, data TEXT DEFAULT (date('now','localtime')),
    origem TEXT DEFAULT 'manual', urgente INTEGER DEFAULT 0, teste INTEGER DEFAULT 0);
  CREATE TABLE revisao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, segundos INTEGER,
    data TEXT DEFAULT (date('now','localtime')), modo TEXT DEFAULT 'hoje', teste INTEGER DEFAULT 0);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, packId TEXT, venda TEXT,
    estagio TEXT DEFAULT 'pendente', data TEXT DEFAULT (date('now','localtime')));
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
`);

const sku = db.prepare("INSERT INTO skus (codigo,estoque) VALUES (?,?)");
const ord = db.prepare("INSERT INTO producao (codigo,qtd,produzido,origem,urgente) VALUES (?,?,?,?,?)");
const rev = db.prepare("INSERT INTO revisao (codigo,segundos,modo) VALUES (?,10,?)");
const vol = db.prepare("INSERT INTO lote (codigo,packId,venda,estagio) VALUES (?,?,?,?)");

/* O CASO REAL: 5 urgentes, 5 revisões vermelhas e 5 azuis, produzido=4 (o
   recálculo do dia zerou o abatimento da primeira), TODOS os volumes já fora. */
sku.run('BK150150BEGE', 5);
ord.run('BK150150BEGE', 5, 4, 'ml', 1);
for(let i=0;i<4;i++) rev.run('BK150150BEGE','hoje');
for(let i=0;i<5;i++) rev.run('BK150150BEGE','estoque');
for(let i=0;i<5;i++) vol.run('BK150150BEGE','1'+i,'9'+i,'embalado');

/* Trabalho de verdade: 3 urgentes, 1 revisada, 2 volumes pendentes, sem estoque. */
sku.run('BK140140BEGE', 0);
ord.run('BK140140BEGE', 3, 1, 'ml', 1);
rev.run('BK140140BEGE','hoje');
vol.run('BK140140BEGE','21','81','embalado');
vol.run('BK140140BEGE','22','82','pendente');
vol.run('BK140140BEGE','23','83','pendente');

/* Coberto por estoque que ENTROU depois do lançamento: 2 urgentes, nenhuma
   revisão vermelha, 2 pendentes e 2 na prateleira. */
sku.run('BK160160CINZA', 2);
ord.run('BK160160CINZA', 2, 0, 'ml', 1);
vol.run('BK160160CINZA','31','71','pendente');
vol.run('BK160160CINZA','32','72','pendente');

/* Ordem MANUAL: produção sem venda. Não há volume para comparar — nunca
   "atendida", sempre falta até revisar. */
sku.run('BK120120BRANCO', 9);
ord.run('BK120120BRANCO', 4, 0, 'manual', 0);
rev.run('BK120120BRANCO','hoje');

/* Meio a meio: 4 urgentes, 2 revisadas, 1 pendente sem estoque → 1 pra
   produzir e 1 que saiu do estoque. */
sku.run('BK180180BEGE', 0);
ord.run('BK180180BEGE', 4, 2, 'ml', 1);
rev.run('BK180180BEGE','hoje'); rev.run('BK180180BEGE','hoje');
vol.run('BK180180BEGE','41','61','embalado');
vol.run('BK180180BEGE','42','62','embalado');
vol.run('BK180180BEGE','43','63','carregado');
vol.run('BK180180BEGE','44','64','pendente');

const rotas = {};
const app = { get:(p,...h)=>{ rotas['GET '+p]=h[h.length-1]; },
              post:(p,...h)=>{ rotas['POST '+p]=h[h.length-1]; }, locals:{} };
require('./modo_route')(app, db);
require('./st_route')(app, db);

const chamar = (k, body) => new Promise(r => {
  const res = { json:o=>r(o), status(){ return this; }, send:o=>r(o) };
  rotas[k]({ body:body||{}, query:{}, headers:{} }, res);
});

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra ? '   ' + extra : '')); } };
const j = o => JSON.stringify(o);

(async () => {
  const dia = await chamar('GET /api/revisao/dia');
  const por = {}; dia.forEach(x => por[x.codigo] = x);

  // ── O CASO DE 08/09: a venda saiu, a ordem ficou ─────────────────────────
  const c = por.BK150150BEGE;
  ok('revisão azul não conta como revisão do pedido: 4/5',
     c.revisadas === 4 && c.falta === 1, j(c));
  ok('mas a venda já saiu: 1 atendida, nada a produzir',
     c.atendidas === 1 && c.a_produzir === 0, j(c));
  ok('e a tela sabe que foi despacho, não estoque (pendentes 0)',
     c.pendentes === 0, j(c));
  ok('o produzido segue como está no banco (é história, não régua)',
     c.produzido === 4, j(c));

  // ── Trabalho de verdade continua sendo cobrado ───────────────────────────
  const t = por.BK140140BEGE;
  ok('2 pendentes sem estoque e 2 por revisar: 2 a produzir, 0 atendidas',
     t.falta === 2 && t.a_produzir === 2 && t.atendidas === 0, j(t));

  // ── Coberto por estoque: também não é trabalho ───────────────────────────
  const e = por.BK160160CINZA;
  ok('estoque cobre os pendentes: 2 atendidas, 0 a produzir',
     e.atendidas === 2 && e.a_produzir === 0, j(e));
  ok('e a tela distingue: ainda há pendentes (tem estoque, não despachou)',
     e.pendentes === 2, j(e));

  // ── Manual: sem venda, sem "atendida" ────────────────────────────────────
  const m = por.BK120120BRANCO;
  ok('ordem manual nunca é atendida por estoque: falta 3, a produzir 3',
     m.atendidas === 0 && m.a_produzir === 3 && m.qtd_urgente === 0, j(m));

  // ── Meio a meio ──────────────────────────────────────────────────────────
  const h = por.BK180180BEGE;
  ok('4 urgentes, 2 revisadas, 1 pendente: 1 a produzir e 1 já saiu',
     h.falta === 2 && h.a_produzir === 1 && h.atendidas === 1, j(h));

  // ── Ordem da lista: quem tem trabalho vem antes de quem só tem ordem aberta
  ok('quem tem o que produzir vem primeiro; o coberto vai pro fim',
     dia[0].codigo === 'BK120120BRANCO' && dia[dia.length-1].a_produzir === 0, j(dia.map(x=>x.codigo+':'+x.a_produzir)));

  // ── O aviso de status lê a MESMA conta ───────────────────────────────────
  const s = await chamar('GET /api/revisao/status');
  ok('urgentes lançados: 5+3+2+4 = 14', s.urgentes === 14, j(s));
  ok('reposição (manual): 4', s.reposicao === 4, j(s));
  ok('urgentesFalta é só o que falta PRODUZIR de urgente: 2+1 = 3',
     s.urgentesFalta === 3, j(s));
  ok('atendidas somadas: 1+2+1 = 4 — o número que era lido como "pendente"',
     s.atendidas === 4, j(s));
  const somaTile = dia.reduce((a,x)=>a+x.urgentes_falta,0);
  ok('tile e aviso batem: soma dos tiles = urgentesFalta',
     somaTile === s.urgentesFalta, somaTile+' vs '+s.urgentesFalta);

  // ── Sem ordem nenhuma: nada explode, lancado=false ───────────────────────
  db.prepare('DELETE FROM producao').run();
  const s2 = await chamar('GET /api/revisao/status');
  const d2 = await chamar('GET /api/revisao/dia');
  ok('dia sem lançamento: lista vazia e lancado=false',
     d2.length === 0 && s2.lancado === false && s2.urgentesFalta === 0 && s2.atendidas === 0, j(s2));

  console.log('');
  console.log(falhas ? ('FALHARAM ' + falhas + ' de ' + casos)
                     : ('todos os ' + casos + ' casos passaram'));
  try{ fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){}
  process.exit(falhas ? 1 : 0);
})();
