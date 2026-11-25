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
function eq(desc, a, e, d){ ok(desc, a === e, 'esperado ' + JSON.stringify(e) + ', veio ' + JSON.stringify(a) + (d ? ' ' + d : '')); }

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

q = passa('POST', '/api/carregar', { code:'X', sku:ps[0] });
eq('o bipe da Conferência (/api/carregar) também recebe o SKU', q.body.sku, 'BK150150BEGE');

console.log('\n── 4. o que a ③ REVISÃO achou ──');
r = chamar('POST', '/api/revisao', { codigo:'PS99999999', segundos:40 }, RUI);
eq('a etiqueta em série que não existe é recusada (409)', r.status, 409);
ok('...dizendo "Etiqueta não reconhecida"', /não reconhecida/.test(r.body.erro), r.body.erro);
db.prepare("INSERT INTO skus (codigo,cor_codigo,modelo_id,largura_cm,altura_cm) VALUES ('PS12345678','BEGE',1,150,150)").run();
r = chamar('POST', '/api/revisao', { codigo:'PS12345678', segundos:40 }, RUI);
eq('o SKU antigo com a forma de etiqueta revisa como sempre (200)', r.status, 200);
/* a persiana com defeito que volta não é a mesma que a fila escolheu */
MONT.iniciar(db, { sku:'BK150150BEGE', quantidade:1 }, JOAO);
MONT.bipar(db, ps[1], JOAO); MONT.bipar(db, 'TC000002', JOAO); MONT.bipar(db, 'TB000002', JOAO); MONT.bipar(db, ps[1], JOAO);
r = chamar('POST', '/api/revisao', { codigo:ps[1], segundos:40 }, RUI);
eq('a segunda persiana revisa', r.status, 200);
const rev0 = db.prepare('SELECT revisao_id FROM persiana WHERE codigo=?').get(ps[0]).revisao_id;
const rev1 = db.prepare('SELECT revisao_id FROM persiana WHERE codigo=?').get(ps[1]).revisao_id;
MONT.revisaoApagada(db, rev0, true);   // a embalagem devolveu por defeito; a fila escolheu a revisão da 1ª
eq('a da revisão apagada volta ao carrinho, marcada', db.prepare('SELECT situacao||voltou_defeito s FROM persiana WHERE codigo=?').get(ps[0]).s, 'montada1');
r = chamar('POST', '/api/revisao', { codigo:ps[1], segundos:40 }, RUI);
eq('mas quem voltou fisicamente foi a 2ª: bipá-la revisa (200), sem "já revisada"', r.status, 200, JSON.stringify(r.body));
const a0 = db.prepare('SELECT situacao, revisao_id FROM persiana WHERE codigo=?').get(ps[0]);
const a1 = db.prepare('SELECT situacao, revisao_id FROM persiana WHERE codigo=?').get(ps[1]);
ok('...e as duas trocam de lugar: a 1ª fica com a revisão da 2ª', a0.situacao === 'revisada' && a0.revisao_id === rev1, JSON.stringify(a0));
ok('...e a 2ª com a revisão nova', a1.situacao === 'revisada' && a1.revisao_id > rev1, JSON.stringify(a1));
eq('nenhuma fica marcada', db.prepare('SELECT COUNT(*) n FROM persiana WHERE voltou_defeito=1').get().n, 0);
/* a peça com problema sai do carrinho */
CORTE.iniciar(db, { tipo:'tecido', item:'BK150150BEGE', quantidade:1, etiqueta:'TC000003' }, ANA); CORTE.bipar(db, 'TC000003', ANA);
CORTE.iniciar(db, { tipo:'tubo', item:'c2:147', quantidade:1, etiqueta:'TB000003' }, JOAO); CORTE.bipar(db, 'TB000003', JOAO);
MONT.iniciar(db, { sku:'BK150150BEGE', quantidade:1 }, JOAO);
MONT.bipar(db, ps[2], JOAO);
const tcLivre = db.prepare("SELECT e.codigo FROM corte_peca cp JOIN etiqueta_producao e ON e.id=cp.etiqueta_id WHERE cp.situacao='prateleira' AND cp.tipo='tecido' LIMIT 1").get();
const tbLivre = db.prepare("SELECT e.codigo FROM corte_peca cp JOIN etiqueta_producao e ON e.id=cp.etiqueta_id WHERE cp.situacao='prateleira' AND cp.tipo='tubo' LIMIT 1").get();
ok('há tecido e tubo para a 3ª', !!(tcLivre && tbLivre));
if(tcLivre && tbLivre){ MONT.bipar(db, tcLivre.codigo, JOAO); MONT.bipar(db, tbLivre.codigo, JOAO); MONT.bipar(db, ps[2], JOAO); }
const car0 = MONT.noCarrinho(db).BK150150BEGE || 0;
ok('a peça com problema sai do carrinho', MONT.comProblema(db, ps[2]) && (MONT.noCarrinho(db).BK150150BEGE || 0) === car0 - 1);
r = chamar('POST', '/api/revisao', { codigo:ps[2], segundos:40 }, RUI);
eq('...e volta a ser revisável depois de consertada', r.status, 200);

console.log('\n── 5. a tela 101 pergunta ao servidor se a persiana revisa ──');
const rotP = {};
require('./producao_route')({ locals:{ acesso:{ podePermissao:() => true } }, use(){}, get(p, h){ rotP['GET ' + p] = h; }, post(){}, delete(){}, put(){}, patch(){} }, db);
function ler(codigo){ const out = {}; rotP['GET /api/producao/persiana/:codigo']({ params:{ codigo }, query:{}, body:{}, usuario:RUI }, { status(c){ out.status = c; return this; }, json(b){ out.body = b; return this; } }); return out.body; }
MONT.comProblema(db, ps[2]) || db.prepare("UPDATE persiana SET situacao='problema' WHERE codigo=?").run(ps[2]);
ok('a persiana com problema, consertada, é revisável na tela', ler(ps[2]).revisavel === true, JSON.stringify(ler(ps[2])));
r = chamar('POST', '/api/revisao', { codigo:ps[2], segundos:40 }, RUI);
const rv2 = db.prepare('SELECT revisao_id FROM persiana WHERE codigo=?').get(ps[2]).revisao_id;
ok('a já revisada, sem marcada do SKU, não é revisável, com o motivo', ler(ps[1]).revisavel === false && /já foi revisada/.test(ler(ps[1]).motivo));
MONT.revisaoApagada(db, rv2, true);
ok('...e com uma marcada do SKU, a troca é revisável na tela', ler(ps[1]).revisavel === true);
/* a volta da embalagem decidida "tem defeito" tira a marcada do carrinho */
const DEF = require('./defeito_dominio'); DEF.garantir(db);
db.exec("CREATE TABLE IF NOT EXISTS rejeicao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, motivo TEXT, obs TEXT, segundos INTEGER, modo TEXT, usuario TEXT, data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')), teste INTEGER DEFAULT 0, usuario_id INTEGER, origem TEXT, setor TEXT)");
db.prepare("INSERT INTO embalagem_defeito (codigo, motivo) VALUES ('BK150150BEGE','Tecido manchado')").run();
const idv = db.prepare('SELECT MAX(id) m FROM embalagem_defeito').get().m;
const car1 = MONT.noCarrinho(db).BK150150BEGE || 0;
try{ DEF.decidir(db, idv, { decisao:'defeito', setor:DEF.SETORES[0].chave }, { usuario_id:3, usuario_nome:'Rui' }); }catch(e){ console.log('   (decidir: ' + e.message + ')'); }
eq('com defeito, a persiana marcada sai do carrinho', (MONT.noCarrinho(db).BK150150BEGE || 0), car1 - 1);
eq('...fica "com problema", sem a marca', db.prepare('SELECT situacao||voltou_defeito s FROM persiana WHERE codigo=?').get(ps[2]).s, 'problema0');
ok('...e sem marcada, a já revisada volta a ser recusada', ler(ps[1]).revisavel === false);

console.log('\n' + (falhas ? falhas + ' de ' + n + ' casos FALHARAM' : 'todos os ' + n + ' casos passaram'));
process.exit(falhas ? 1 : 0);
