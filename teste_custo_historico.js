#!/usr/bin/env node
/* O histórico de custo aceita o custo INDEFINIDO — e salvar a ficha não mente.
 *
 *   node teste_custo_historico.js
 *
 * O QUE ORIGINOU ESTE TESTE (CONSERTO de 11/11/2026):
 *
 * Em 07/11 a Fita crepe perdeu a oferta (a loja ML/SHOPI foi desativada), e o
 * custo de material das persianas do ROLO BK ML passou a ser INDEFINIDO — que
 * pela regra 4 do §7-B nunca vira zero. O `custo_dominio.registrar` grava essa
 * passagem no histórico com o custo vazio, de propósito ("um SKU que TINHA
 * custo e passou a não ter precisa deixar rastro"). Só que a tabela
 * `custo_sku_historico` nasceu com `custo_material` e `custo_total` NOT NULL:
 * o banco recusava, o `POST /api/formulas` estourava DEPOIS de gravar a linha,
 * e a 404 dizia "não salvou" sobre uma linha que tinha salvado. O histórico de
 * custo parou de andar no mesmo dia.
 *
 * Sobe um banco temporário com a tabela COMO ELA ESTÁ EM PRODUÇÃO. Não abre
 * porta, não toca no banco de produção.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-custohist-'));
const db = new Database(path.join(tmp, 't.db'));
db.pragma('foreign_keys = ON');

let casos = 0, falhas = 0;
function caso(nome, f){
  casos++;
  try{ f(); console.log('  ✓ ' + nome); }
  catch(e){ falhas++; console.log('  ✗ ' + nome + '\n      ' + e.message); }
}
function igual(a, b, msg){ if(a !== b) throw new Error((msg ? msg + ': ' : '') + 'esperava ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a)); }
function sim(v, msg){ if(!v) throw new Error(msg || 'esperava verdadeiro'); }

/* ── O BANCO DE PRODUÇÃO: a tabela com NOT NULL, e o usuario_id que entrou por
   ALTER depois (fase 7 da QUEM-FEZ), no fim — é como o sqlite_master de lá
   descreve a tabela. Linhas antigas, para provar que nenhuma se perde. ────── */
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0);
  CREATE TABLE auditoria (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, usuario_nome TEXT,
    categoria TEXT, acao TEXT, alvo TEXT, detalhe TEXT, ip TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')), data TEXT DEFAULT (date('now','localtime')));
  CREATE TABLE custo_sku_historico (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    sku            TEXT NOT NULL,
    custo_material REAL NOT NULL,
    custo_mo       REAL DEFAULT 0,
    custo_total    REAL NOT NULL,
    custo_medio    REAL,
    origem         TEXT,
    motivo         TEXT,
    referencia     TEXT,
    usuario_nome   TEXT,
    criado_em      TEXT DEFAULT (datetime('now','localtime')),
    data           TEXT DEFAULT (date('now','localtime'))
  );
  CREATE INDEX idx_custo_sku ON custo_sku_historico(sku, data);
  ALTER TABLE custo_sku_historico ADD COLUMN usuario_id INTEGER;
`);
const antigas = db.prepare(`INSERT INTO custo_sku_historico
  (sku,custo_material,custo_mo,custo_total,custo_medio,origem,motivo,usuario_nome,criado_em,data,usuario_id)
  VALUES (?,?,0,?,NULL,'ficha',?,?,?,?,?)`);
antigas.run('BK100100BRANCO', 40.5, 40.5, 'marco inicial do histórico', 'custo_base', '2026-09-01 10:00:00', '2026-09-01', null);
antigas.run('BK150150BRANCO', 55.25, 55.25, 'fórmula alterada', 'Lucas', '2026-10-02 11:00:00', '2026-10-02', 1);
const COLUNAS_ANTES = db.prepare("SELECT name FROM pragma_table_info('custo_sku_historico')").all().map(r => r.name);
const LINHAS_ANTES = db.prepare('SELECT * FROM custo_sku_historico ORDER BY id').all();

/* O boot de verdade: o schema de SKU e o de Compras, que é onde a tabela mora. */
require('./sku_schema').garantirSchema(db);
require('./compras_schema').garantirSchemaCompras(db);

const notnull = c => db.prepare("SELECT \"notnull\" n FROM pragma_table_info('custo_sku_historico') WHERE name=?").get(c).n;

caso('o banco que já existe passa a aceitar custo vazio (custo_material e custo_total)', () => {
  igual(notnull('custo_material'), 0, 'custo_material');
  igual(notnull('custo_total'), 0, 'custo_total');
  igual(notnull('sku'), 1, 'sku continua obrigatório');
});
caso('nenhuma linha antiga se perde, e nenhum valor muda', () => {
  igual(JSON.stringify(db.prepare('SELECT * FROM custo_sku_historico ORDER BY id').all()), JSON.stringify(LINHAS_ANTES));
});
caso('as colunas ficam as mesmas, na mesma ordem (o usuario_id do ALTER no fim)', () => {
  igual(db.prepare("SELECT name FROM pragma_table_info('custo_sku_historico')").all().map(r => r.name).join(','), COLUNAS_ANTES.join(','));
});
caso('o índice por SKU e data continua lá', () => {
  sim(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_custo_sku' AND tbl_name='custo_sku_historico'").get(), 'idx_custo_sku sumiu');
});
caso('o id continua de onde parou (a linha nova não reaproveita número)', () => {
  const r = db.prepare("INSERT INTO custo_sku_historico (sku,custo_material,custo_total) VALUES ('X',1,1)").run();
  igual(Number(r.lastInsertRowid), 3);
  db.prepare("DELETE FROM custo_sku_historico WHERE sku='X'").run();
});
caso('rodar o schema de novo não refaz nada (uma vez só)', () => {
  require('./compras_schema').garantirSchemaCompras(db);
  igual(notnull('custo_material'), 0);
  igual(JSON.stringify(db.prepare('SELECT * FROM custo_sku_historico ORDER BY id').all()), JSON.stringify(LINHAS_ANTES));
});

/* ── O CASO DA FÁBRICA: o modelo com custo, e um material que perde o preço ── */
db.prepare("INSERT INTO modelo (id,codigo,nome,exige_medida,sob_medida) VALUES (2,'ROLO','ROLO BK ML',1,0)").run();
db.prepare("UPDATE skus SET modelo_id=2, largura_cm=100, altura_cm=100 WHERE 0").run();
db.prepare("INSERT INTO skus (codigo,modelo_id,largura_cm,altura_cm) VALUES ('BK100100BRANCO',2,100,100)").run();
const comp = db.prepare("INSERT INTO componente (nome,unidade,ativo) VALUES (?,?,1)");
const TUBO = comp.run('Tubo 32 mm', 'm').lastInsertRowid;
const FITA = comp.run('Fita crepe 4,8 mm', 'm').lastInsertRowid;
const forn = db.prepare("INSERT INTO fornecedor (nome,ativo) VALUES ('Fornecedor',1)").run().lastInsertRowid;
const of = db.prepare('INSERT INTO oferta (componente_id,fornecedor_id,embalagem,preco,fator,ativo) VALUES (?,?,?,?,?,1)');
of.run(TUBO, forn, 'barra 6 m', 66, 6);
const OF_FITA = of.run(FITA, forn, 'rolo 50 m', 10, 50).lastInsertRowid;
db.prepare("INSERT INTO ficha_formula (id,modelo_id,componente_id,expressao,ordem) VALUES (1,2,?,'largura / 100',0)").run(TUBO);
db.prepare("INSERT INTO ficha_formula (id,modelo_id,componente_id,expressao,ordem) VALUES (2,2,?,'largura / 100',1)").run(FITA);

/* A rota de verdade, num app de mentira (sem porta). */
const rotas = {};
const AUDIT = [];
const app = { locals:{ acesso:{ auditar:(req, cat, acao, alvo, det) => AUDIT.push({ cat, acao, alvo, det }) } },
  get(){}, delete(p, ...h){ rotas['DELETE ' + p] = h[h.length - 1]; }, use(){},
  post(p, ...h){ rotas['POST ' + p] = h[h.length - 1]; } };
require('./ficha_route')(app, db);
function salvar(body){
  let st = 200, out = null;
  const res = { status(s){ st = s; return this; }, json(j){ out = j; return this; } };
  try{ rotas['POST /api/formulas']({ body, usuario:{ id:1, nome:'Lucas' }, params:{}, query:{}, headers:{}, socket:{} }, res); }
  catch(e){ return { st:500, out:{ erro:'a rota estourou: ' + e.message } }; }
  return { st, out };
}
const historico = () => db.prepare("SELECT custo_material, custo_total, motivo FROM custo_sku_historico WHERE sku='BK100100BRANCO' ORDER BY id").all();

caso('com todo preço lançado, salvar a linha registra o custo novo', () => {
  const r = salvar({ id:1, modelo_id:2, componente_id:TUBO, expressao:'largura / 100', corte_largura:'largura - 3' });
  igual(r.st, 200, JSON.stringify(r.out));
  const h = historico();
  sim(h.length >= 2 && h[h.length - 1].custo_material != null, 'esperava uma linha nova com o custo: ' + JSON.stringify(h));
});
caso('A FITA PERDE O PREÇO: salvar a ficha responde ok (o defeito de 07/11 dava 500)', () => {
  db.prepare('UPDATE oferta SET ativo=0 WHERE id=?').run(OF_FITA);
  const r = salvar({ id:1, modelo_id:2, componente_id:TUBO, expressao:'largura / 100', corte_largura:'largura - 3', planejamento:true });
  igual(r.st, 200, JSON.stringify(r.out));
  igual(r.out && r.out.ok, true, JSON.stringify(r.out));
});
caso('e o histórico guarda a passagem para INDEFINIDO, com o custo vazio — nunca zero', () => {
  const h = historico();
  const u = h[h.length - 1];
  igual(u.custo_material, null, 'custo_material');
  igual(u.custo_total, null, 'custo_total');
});
caso('e a linha da ficha ficou gravada como foi mandada', () => {
  const f = db.prepare('SELECT expressao, corte_largura, planejamento FROM ficha_formula WHERE id=1').get();
  igual(f.expressao, 'largura / 100'); igual(f.corte_largura, 'largura - 3'); igual(f.planejamento, 1);
});
caso('salvar de novo, ainda indefinido, não repete a linha (só registra o que mudou)', () => {
  const n = historico().length;
  salvar({ id:1, modelo_id:2, componente_id:TUBO, expressao:'largura / 100', corte_largura:'largura - 3' });
  igual(historico().length, n);
});

/* ── SE O HISTÓRICO FALHAR POR OUTRO MOTIVO, O SALVAR NÃO MENTE ─────────────
   A linha já está gravada quando o histórico roda; responder erro faz a 404
   dizer "não salvou" sobre o que salvou. O mesmo cuidado que a troca de preço
   (compras_route) já tinha: o erro vai para o log. */
caso('o histórico estourando por outro motivo: a linha grava e o salvar responde ok', () => {
  const CUSTO = require('./custo_dominio');
  const orig = CUSTO.porModelo;
  const log = console.log; const linhasLog = [];
  CUSTO.porModelo = () => { throw new Error('falha simulada no histórico'); };
  console.log = (...a) => linhasLog.push(a.join(' '));
  let r;
  try{ r = salvar({ id:2, modelo_id:2, componente_id:FITA, expressao:'2 * largura / 100' }); }
  finally{ CUSTO.porModelo = orig; console.log = log; }
  igual(r.st, 200, JSON.stringify(r.out));
  igual(db.prepare('SELECT expressao FROM ficha_formula WHERE id=2').get().expressao, '2 * largura / 100');
  sim(linhasLog.some(l => /falha simulada/.test(l)), 'o erro tem que ir para o log, e não sumir calado');
  sim(AUDIT.some(x => x.acao === 'historico_custo_falhou' && /falha simulada/.test(x.det || '')), 'e para a auditoria, onde alguém vê sem abrir o servidor: ' + JSON.stringify(AUDIT));
  db.prepare("UPDATE ficha_formula SET expressao='largura / 100' WHERE id=2").run();
});

/* ── A MIGRAÇÃO QUE FALHA NÃO DERRUBA O SERVIDOR (③ REVISÃO) ───────────────
   O garantirSchemaCompras roda no require('./db'), sem try: um throw ali para
   a fábrica inteira por causa de uma tabela de histórico. */
function bancoCom(ddl){
  const d = new Database(':memory:');
  d.exec("CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '', estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0)");
  d.exec(ddl);
  d.exec("INSERT INTO custo_sku_historico (sku,custo_material,custo_total) VALUES ('A',1,1)");
  return d;
}
const nnDe = (d, c) => d.prepare("SELECT \"notnull\" n FROM pragma_table_info('custo_sku_historico') WHERE name=?").get(c).n;
caso('SQL fora do padrão: o boot NÃO estoura, avisa no log, e a tabela fica como estava', () => {
  const d = bancoCom("CREATE TABLE custo_sku_historico (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT NOT NULL, custo_material DOUBLE NOT NULL, custo_mo REAL DEFAULT 0, custo_total DOUBLE NOT NULL, custo_medio REAL, origem TEXT, motivo TEXT, referencia TEXT, usuario_nome TEXT, criado_em TEXT, data TEXT, usuario_id INTEGER)");
  const log = console.log; const L = [];
  console.log = (...a) => L.push(a.join(' '));
  try{
    require('./sku_schema').garantirSchema(d);
    require('./compras_schema').garantirSchemaCompras(d);
  }finally{ console.log = log; }
  igual(nnDe(d, 'custo_material'), 1);
  igual(d.prepare('SELECT COUNT(*) c FROM custo_sku_historico').get().c, 1);
  sim(L.some(l => /custo_sku_historico/.test(l) && /NÃO/.test(l)), 'tem que dizer no log que NÃO migrou: ' + JSON.stringify(L));
  sim(!L.some(l => /passou a aceitar/.test(l)), 'e não pode anunciar que migrou: ' + JSON.stringify(L));
  d.close();
});
caso('a guarda olha as DUAS colunas: só custo_total NOT NULL também migra', () => {
  const d = bancoCom("CREATE TABLE custo_sku_historico (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT NOT NULL, custo_material REAL, custo_mo REAL DEFAULT 0, custo_total REAL NOT NULL, custo_medio REAL, origem TEXT, motivo TEXT, referencia TEXT, usuario_nome TEXT, criado_em TEXT, data TEXT, usuario_id INTEGER)");
  const log = console.log; console.log = () => {};
  try{
    require('./sku_schema').garantirSchema(d);
    require('./compras_schema').garantirSchemaCompras(d);
  }finally{ console.log = log; }
  igual(nnDe(d, 'custo_total'), 0, 'custo_total');
  igual(nnDe(d, 'custo_material'), 0, 'custo_material');
  igual(d.prepare('SELECT COUNT(*) c FROM custo_sku_historico').get().c, 1);
  d.close();
});

/* ── O BANCO NOVO nasce aceitando o vazio ─────────────────────────────────── */
caso('instalação limpa: a tabela já nasce aceitando custo vazio', () => {
  const db2 = new Database(':memory:');
  db2.exec("CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '', estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0)");
  require('./sku_schema').garantirSchema(db2);
  require('./compras_schema').garantirSchemaCompras(db2);
  const nn = c => db2.prepare("SELECT \"notnull\" n FROM pragma_table_info('custo_sku_historico') WHERE name=?").get(c).n;
  igual(nn('custo_material'), 0); igual(nn('custo_total'), 0);
  db2.close();
});

db.close();
fs.rmSync(tmp, { recursive:true, force:true });
console.log('\n' + (casos - falhas) + ' ok, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);
