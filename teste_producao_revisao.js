#!/usr/bin/env node
/* teste_producao_revisao.js — a revisao pela etiqueta de SKU em serie e o
 * tradutor nas telas que bipam SKU (spec PRODUCAO-MAPA-E-MOTOR v7, §14.2, §14.5
 * e §14.7, 25/11/2026).
 *
 *   node teste_producao_revisao.js
 *
 * Sobe as rotas de verdade da Revisao num banco temporario e um app de mentira.
 * Nao abre porta.
 */
const Database = require('better-sqlite3');
let n = 0, falhas = 0;
function ok(desc, cond, det){ n++; if(cond) console.log('  ok  ' + n + ' — ' + desc); else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (det ? '\n         ' + det : '')); } }
function eq(desc, a, e){ ok(desc, a === e, 'esperado ' + JSON.stringify(e) + ', veio ' + JSON.stringify(a)); }

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '', cor_codigo TEXT, estoque INTEGER DEFAULT 0,
    alvo INTEGER DEFAULT 0, modelo_id INTEGER, largura_cm INTEGER, altura_cm INTEGER, tecido_codigo TEXT, tem_ficha INTEGER DEFAULT 1);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
  CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, modo TEXT DEFAULT 'hoje', situacao TEXT DEFAULT 'aguardando',
    revisado_em TEXT DEFAULT (datetime('now','localtime')), embalado_em TEXT, data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0, revisao_id INTEGER);
  CREATE TABLE producao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, qtd INTEGER, produzido INTEGER DEFAULT 0,
    data TEXT DEFAULT (date('now','localtime')), origem TEXT DEFAULT 'manual', urgente INTEGER DEFAULT 0, teste INTEGER DEFAULT 0);
  CREATE TABLE revisao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, inicio TEXT, fim TEXT, segundos INTEGER,
    data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')), modo TEXT DEFAULT 'hoje',
    teste INTEGER DEFAULT 0, usuario_id INTEGER, usuario_nome TEXT);
  CREATE TABLE componente (id INTEGER PRIMARY KEY, nome TEXT, unidade TEXT);
  CREATE TABLE ficha_formula (id INTEGER PRIMARY KEY, modelo_id INTEGER, etapa TEXT, ordem INTEGER, ativo INTEGER DEFAULT 1);
  INSERT INTO modelo (id,nome) VALUES (1,'Rolô');
  INSERT INTO componente VALUES (2,'Tubo 32','m');
  INSERT INTO ficha_formula VALUES (10,1,'corte_tecido',1,1),(11,1,'corte_tubo',2,1);
  INSERT INTO skus (codigo,cor_codigo,modelo_id,largura_cm,altura_cm) VALUES ('BK150150BEGE','BEGE',1,150,150);
`);
require('./ficha_dominio').calcularFicha = (d, sku) => ({ sku, linhas:[
  { formula_id:10, tecido:true, componente_id:9, corte:{ largura:147, altura:165 } },
  { formula_id:11, componente_id:2, componente_nome:'Tubo 32', corte:{ largura:147 } } ] });
require('./estoque_dominio').garantirSchema(db);
const ETQ = require('./etiqueta_producao'), CORTE = require('./corte_bancada'), MONT = require('./montagem_persiana');
require('./producao_lista').garantirSchema(db);
const ANA = { id:1, nome:'Ana' }, JOAO = { id:2, nome:'João' }, RUI = { id:3, nome:'Rui' };

const rotas = {};
const app = { locals:{}, use(f){ this.mw = f; }, get(p, h){ rotas['GET ' + p] = h; }, post(p, h){ rotas['POST ' + p] = h; }, delete(){} };
require('./revisao_route')(app, db);
db.prepare("INSERT INTO config (chave,valor) VALUES ('rev_minimo_seg','0') ON CONFLICT(chave) DO UPDATE SET valor='0'").run();
function chamar(m, rota, corpo, u){
  const h = rotas[m + ' ' + rota]; const out = { status:200, body:null };
  const res = { status(c){ out.status = c; return res; }, json(b){ out.body = b; return res; } };
  try{ h({ body:corpo || {}, params:{}, query:{}, headers:{}, usuario:u }, res); }catch(e){ return { status:500, body:{ erro:e.message } }; }
  return out;
}

/* uma persiana montada: etiquetas, corte, montagem */
ETQ.imprimirMaco(db, 'TC', 5, ANA); ETQ.imprimirMaco(db, 'TB', 5, ANA);
const ps = ETQ.imprimirPersianas(db, [{ sku:'BK150150BEGE', quantidade:3 }], 'dia', ANA).etiquetas.map(e => e.codigo);
CORTE.iniciar(db, { tipo:'tecido', item:'BK150150BEGE', quantidade:2, etiqueta:'TC000001' }, ANA); CORTE.bipar(db, 'TC000002', ANA);
CORTE.iniciar(db, { tipo:'tubo', item:'c2:147', quantidade:2, etiqueta:'TB000001' }, JOAO); CORTE.bipar(db, 'TB000002', JOAO);
MONT.iniciar(db, { sku:'BK150150BEGE', quantidade:1 }, JOAO);
MONT.bipar(db, ps[0], JOAO); MONT.bipar(db, 'TC000001', JOAO); MONT.bipar(db, 'TB000001', JOAO); MONT.bipar(db, ps[0], JOAO);

console.log('\n── 1. a revisão pela etiqueta em série ──');
let r = chamar('POST', '/api/revisao', { codigo:ps[1], segundos:40 }, RUI);
eq('a etiqueta que não passou pela montagem é recusada (409)', r.status, 409);
ok('...dizendo o caminho (107)', /montagem \(107\)/.test(r.body.erro), r.body.erro);
eq('...e nada grava', db.prepare('SELECT COUNT(*) n FROM revisao').get().n, 0);
r = chamar('POST', '/api/revisao', { codigo:'TC000003', segundos:40 }, RUI);
eq('a etiqueta de tecido na revisão é recusada (409)', r.status, 409);
r = chamar('POST', '/api/revisao', { codigo:ps[0], segundos:40 }, RUI);
eq('a persiana montada revisa (200)', r.status, 200);
eq('...a revisão grava o SKU dela', db.prepare('SELECT codigo FROM revisao ORDER BY id DESC').get().codigo, 'BK150150BEGE');
eq('...a peça vai para a fila da embalagem', db.prepare("SELECT COUNT(*) n FROM fila WHERE codigo='BK150150BEGE' AND situacao='aguardando'").get().n, 1);
const per = db.prepare('SELECT * FROM persiana WHERE codigo=?').get(ps[0]);
ok('...e a persiana fica revisada, ligada à revisão', per.situacao === 'revisada' && per.revisao_id === db.prepare('SELECT MAX(id) m FROM revisao').get().m);
eq('...o carrinho da revisão esvazia', MONT.noCarrinho(db).BK150150BEGE || 0, 0);
r = chamar('POST', '/api/revisao', { codigo:ps[0], segundos:40 }, RUI);
eq('revisar a mesma persiana de novo é recusado (409)', r.status, 409);
ok('...dizendo que já foi revisada', /já foi revisada/.test(r.body.erro), r.body.erro);

console.log('\n── 2. desfazer devolve a persiana ao carrinho ──');
r = chamar('POST', '/api/revisao/desfazer', {}, RUI);
eq('desfaz a da persiana (a última)', r.status, 200);
eq('a persiana volta ao carrinho', db.prepare('SELECT situacao FROM persiana WHERE codigo=?').get(ps[0]).situacao, 'montada');
eq('...sem a revisão ligada', db.prepare('SELECT revisao_id FROM persiana WHERE codigo=?').get(ps[0]).revisao_id, null);
r = chamar('POST', '/api/revisao', { codigo:ps[0], segundos:40 }, RUI);
eq('e pode ser revisada de novo', r.status, 200);
r = chamar('POST', '/api/revisao', { codigo:'BK150150BEGE', segundos:40 }, RUI);
eq('a peça antiga, pelo SKU, revisa como sempre (§14.7)', r.status, 200);
r = chamar('POST', '/api/revisao/cancelar', { codigo:ps[0], segundos:5 }, RUI);
eq('cancelar pela etiqueta em série grava o evento com o SKU', db.prepare("SELECT codigo FROM revisao_evento WHERE tipo='cancelada' ORDER BY id DESC").get().codigo, 'BK150150BEGE');

console.log('\n── 3. o tradutor na porta das outras telas ──');
const MW = require('./codigo_serie');
const mw = (() => { let f; require('./codigo_serie')({ use(x){ f = x; } }, db); return f; })();
function passa(method, url, body){ const req = { method, path:url.split('?')[0], url, body }; mw(req, {}, () => {}); return req; }
let q = passa('POST', '/api/montagem', { codigo:ps[0], segundos:50 });
eq('a Embalagem recebe o SKU no lugar da etiqueta em série', q.body.codigo, 'BK150150BEGE');
q = passa('POST', '/api/montagem', { codigo:'BK150150BEGE' });
eq('...e o SKU comum passa como veio', q.body.codigo, 'BK150150BEGE');
q = passa('POST', '/api/carregar/peca', { code:'X', sku:ps[0] });
eq('a Conferência peça a peça recebe o SKU', q.body.sku, 'BK150150BEGE');
eq('...e o código da etiqueta de VENDA não é mexido', q.body.code, 'X');
q = passa('POST', '/api/carregamento/sobra', { code:'X', skus:[ps[0], 'BK150150BEGE'] });
eq('a venda cancelada recebe a lista de SKUs traduzida', q.body.skus.join(','), 'BK150150BEGE,BK150150BEGE');
q = passa('POST', '/api/inventario/bipe', { codigo:ps[1] });
eq('o Inventário recebe o SKU (mesmo de etiqueta ainda não usada)', q.body.codigo, 'BK150150BEGE');
q = passa('POST', '/api/lote/conferir', { id:1, codigo:ps[0] });
eq('a persiana da caixa de várias, na Etiqueta de Venda, recebe o SKU', q.body.codigo, 'BK150150BEGE');
q = passa('GET', '/api/proximo/' + ps[0] + '?modo=coleta');
eq('o bipe do SKU na Etiqueta de Venda vira o SKU, com o filtro', q.url, '/api/proximo/BK150150BEGE?modo=coleta');
q = passa('POST', '/api/revisao', { codigo:ps[0] });
eq('a REVISÃO não passa pelo tradutor (ela liga a persiana)', q.body.codigo, ps[0]);
q = passa('POST', '/api/montagem', { codigo:'TC000001' });
eq('a etiqueta de tecido não vira SKU', q.body.codigo, 'TC000001');
q = passa('POST', '/api/montagem', { codigo:'PS99999999' });
eq('a etiqueta em série que não existe passa como veio', q.body.codigo, 'PS99999999');

console.log('\n' + (falhas ? falhas + ' de ' + n + ' casos FALHARAM' : 'todos os ' + n + ' casos passaram'));
process.exit(falhas ? 1 : 0);
