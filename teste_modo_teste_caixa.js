#!/usr/bin/env node
/* O MODO TESTE E A CAIXA DE VERDADE (22/10/2026).
 *
 *   node teste_modo_teste_caixa.js
 *
 * O modo teste so marca o que NASCE enquanto ele esta ligado (trigger de
 * INSERT). O que se FAZ numa caixa que ja existia nao e marcado: imprimir ou
 * conferir uma caixa de verdade em modo teste deixava a caixa impressa ou
 * baixada, e o "apagar tudo" devolvia o saldo pela foto — a conferida ficava
 * marcada como baixada e nunca mais baixava (estoque 1 acima, para sempre).
 *
 * A regra: com o modo teste ligado, as quatro portas que mexem em estoque —
 * imprimir, conferir (e peca a peca), o Sobrou e o "foi no caminhao" — so
 * aceitam caixa de teste. Fora do modo teste nada muda.
 *
 * Escrito ANTES do codigo (§0, risco vermelho). Banco temporario.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-modoteste-'));
process.env.PCP_DIR = tmp;

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra !== undefined ? '   ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const eq = (n, a, b) => ok(n, a === b, 'esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a));

const db = new Database(path.join(tmp, 't.db'));
db.exec(`CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE cor (codigo TEXT PRIMARY KEY, nome TEXT);
  CREATE TABLE tecido (codigo TEXT PRIMARY KEY, nome TEXT);
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER,
    largura_cm INTEGER, altura_cm INTEGER, cor_codigo TEXT, tecido_codigo TEXT);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, sob_medida INTEGER DEFAULT 0,
    exige_medida INTEGER DEFAULT 1);
  INSERT INTO modelo (id,codigo,nome,sob_medida) VALUES (1,'ROLO','Rolô',0);
  INSERT INTO skus (codigo,estoque,modelo_id,largura_cm,altura_cm) VALUES
    ('BK140140BEGE',10,1,140,140),('BK120120BEGE',10,1,120,120);`);

const rotas = {};
const app = { get:(p,...h)=>{ rotas['GET '+p]=h[h.length-1]; },
              post:(p,...h)=>{ rotas['POST '+p]=h[h.length-1]; },
              use:()=>{}, locals:{ acesso:{ auditar(){} } } };
require('./exp_route')(app, db);
require('./etq_route')(app, db);
require('./carreg_route')(app, db);
require('./saida_route')(app, db);
const ESTOQUE = require('./estoque_dominio');
ESTOQUE.garantirSchema(db);
ESTOQUE.abertura(db);

const LUCAS = {id:2, nome:'Lucas'};
const chamar = (k, body, params) => new Promise(r => {
  if(!rotas[k]) return r({ __sem_rota:k });
  let st = 200;
  const res = { json:o=>r(Object.assign({__st:st}, o)), status(n){ st = n; return res; }, send:o=>r(o), setHeader(){} };
  try{ rotas[k]({ body:body||{}, params:params||{}, query:{}, headers:{}, usuario:LUCAS }, res); }
  catch(e){ r({ __st:500, __erro:String(e.message||e) }); }
});
const lote = id => db.prepare('SELECT * FROM lote WHERE id=?').get(id);
const saldo = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
function volume(o){
  const c = Object.keys(o);
  return db.prepare('INSERT INTO lote ('+c.join(',')+') VALUES ('+c.map(()=>'?').join(',')+')').run(c.map(k=>o[k])).lastInsertRowid;
}
const HOJE = db.prepare("SELECT date('now','localtime') d").get().d;
const modoTeste = on => db.prepare(`INSERT INTO config (chave,valor) VALUES ('modo_teste',?)
  ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor`).run(on ? '1' : '0');

// Caixas de VERDADE (teste=0), de antes de ligar o modo teste
const Rpend = volume({codigo:'BK140140BEGE', buyer:'Real Pendente', nf:'8001', venda:'2000018800000001', codes:'["2000018800000001"]',
  estagio:'pendente', data:HOJE, despachar_em:HOJE, modalidade:'agencia', criado_em:HOJE+' 07:00:00'});
const Rimp = volume({codigo:'BK140140BEGE', buyer:'Real Impressa', nf:'8002', venda:'2000018800000002', codes:'["2000018800000002"]',
  estagio:'embalado', embalado_em:HOJE+' 08:00:00', data:HOJE, modalidade:'agencia', impresso_por:'Joao'});
const Rcol = volume({codigo:'BK140140BEGE', buyer:'Real Coleta', nf:'8003', venda:'2000018800000003', codes:'["2000018800000003"]',
  estagio:'embalado', embalado_em:HOJE+' 08:00:00', data:HOJE, modalidade:'coleta', impresso_por:'Joao'});
const Rvar = volume({codigo:'BK120120BEGE', buyer:'Real Varias', nf:'8004', packId:'2000015800000004', codes:'["2000015800000004"]',
  estagio:'embalado', embalado_em:HOJE+' 08:00:00', data:HOJE, modalidade:'agencia', impresso_por:'Joao'});
db.prepare('INSERT INTO lote_item (lote_id,codigo,qtd,conferidos) VALUES (?,?,?,?)').run(Rvar,'BK120120BEGE',2,2);

modoTeste(true);
// Caixas de TESTE (nascidas com o modo ligado: teste=1)
const Tpend = volume({codigo:'BK140140BEGE', buyer:'Teste Pendente', nf:'9001', venda:'2000018900000001', codes:'["2000018900000001"]',
  estagio:'pendente', data:HOJE, despachar_em:HOJE, modalidade:'agencia', teste:1, criado_em:HOJE+' 09:00:00'});
const Timp = volume({codigo:'BK140140BEGE', buyer:'Teste Impressa', nf:'9002', venda:'2000018900000002', codes:'["2000018900000002"]',
  estagio:'embalado', embalado_em:HOJE+' 09:00:00', data:HOJE, modalidade:'agencia', impresso_por:'Joao', teste:1});

(async () => {
  let r;
  const s0 = saldo('BK140140BEGE');
  console.log('\n=== 1. COM O MODO TESTE LIGADO, A CAIXA DE VERDADE E RECUSADA ===\n');
  r = await chamar('POST /api/embalar', {id:Rpend});
  ok('imprimir a etiqueta de uma venda de verdade é recusado', !!r.erro && /modo teste/i.test(r.erro), r);
  eq('   a venda continua pendente', lote(Rpend).estagio, 'pendente');
  r = await chamar('POST /api/carregar', {code:'2000018800000002'});
  ok('conferir uma caixa de verdade é recusado', r.ok === false && r.motivo === 'modo_teste' && /modo teste/i.test(r.aviso||''), r);
  ok('   a caixa não foi conferida nem baixou', !lote(Rimp).conferido_em && !lote(Rimp).baixado_em, lote(Rimp));
  eq('   e o saldo não mexeu', saldo('BK140140BEGE'), s0);
  r = await chamar('POST /api/carregar', {code:'2000018800000003'});
  ok('a coleta de verdade também (bipe do canto)', r.ok === false && r.motivo === 'modo_teste', r);
  eq('   continua embalada', lote(Rcol).estagio, 'embalado');
  r = await chamar('POST /api/carregar/peca', {lote_id:Rvar, sku:'BK120120BEGE'});
  ok('o bipe peça a peça da caixa de várias de verdade também', r.ok === false && r.motivo === 'modo_teste', r);
  r = await chamar('POST /api/carregamento/sobra', {code:'2000018800000002'});
  ok('o Sobrou de uma caixa de verdade também', r.ok === false && r.motivo === 'modo_teste', r);
  eq('   continua embalada', lote(Rimp).estagio, 'embalado');
  r = await chamar('POST /api/saida/abrir', {});
  r = await chamar('POST /api/saida/levou', {id:Rimp});
  ok('o "foi no caminhão" de uma caixa de verdade também', r.ok === false && r.motivo === 'modo_teste', r);

  console.log('\n=== 2. A CAIXA DE TESTE PASSA ===\n');
  r = await chamar('GET /api/proximo/:sku', null, {sku:'BK140140BEGE'});
  const prox = r.proximo || r.volume || r.pedido || r;
  ok('o bipe do SKU na Etiqueta de Venda acha a venda de TESTE, e não a de verdade mais antiga',
     JSON.stringify(r).includes('Teste Pendente') && !JSON.stringify(r).includes('Real Pendente'), JSON.stringify(r).slice(0,300));
  void prox;
  r = await chamar('POST /api/embalar', {id:Tpend});
  ok('imprimir a venda de teste passa', !r.erro && lote(Tpend).estagio === 'embalado', r);
  r = await chamar('POST /api/carregar', {code:'2000018900000002'});
  ok('conferir a caixa de teste passa', r.ok !== false && r.motivo !== 'modo_teste', r);
  ok('   e ela baixa (no saldo do modo teste, que a foto devolve)', !!lote(Timp).baixado_em);

  console.log('\n=== 3. COM O MODO TESTE DESLIGADO, NADA MUDA ===\n');
  modoTeste(false);
  const s1 = saldo('BK140140BEGE');
  r = await chamar('POST /api/carregar', {code:'2000018800000002'});
  ok('a caixa de verdade volta a ser conferida', r.ok !== false && !!lote(Rimp).baixado_em, r);
  eq('   e baixa −1', saldo('BK140140BEGE'), s1 - 1);
  r = await chamar('POST /api/embalar', {id:Rpend});
  ok('e a venda de verdade volta a imprimir', !r.erro && lote(Rpend).estagio === 'embalado', r);

  console.log('\n' + casos + ' casos · ' + falhas + ' falha(s)\n');
  try{ fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){}
  process.exit(falhas ? 1 : 0);
})();
