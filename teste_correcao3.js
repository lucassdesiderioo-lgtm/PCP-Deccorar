#!/usr/bin/env node
/* teste_correcao3.js — A MESA DE CORRECOES, fase 3: o terminal com a mesma regua.
 *
 *   node teste_correcao3.js
 *
 * Fase 3 da spec MESA-DE-CORRECOES (02/10/2026): os cinco scripts de passivo
 * (`limpar_fantasmas`, `regularizar_saida`, `fechar_vencidos`,
 * `reabrir_futuros`, `limpar_fila`) passam a chamar o `correcoes.js` e a gravar
 * em `correcao`. O caso da spec e este: SCRIPT E BOTAO PRODUZEM O MESMO
 * ANTES/DEPOIS PARA O MESMO CASO.
 *
 * Monta o mesmo cenario em dois bancos. No A corrige pelo botao (as rotas da
 * Mesa); no B roda os scripts de verdade, como processo, apontados por PCP_DB.
 * Os dois bancos tem que terminar iguais, linha por linha.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-correcao3-'));
const ARQ_A = path.join(tmp, 'a', 'dados.db'), ARQ_B = path.join(tmp, 'b', 'dados.db');
fs.mkdirSync(path.dirname(ARQ_A)); fs.mkdirSync(path.dirname(ARQ_B));

const MEM = new Database(':memory:');
const D = k => MEM.prepare("SELECT date('now','localtime',?) d").get((k>=0?'+':'')+k+' days').d;
function montar(arq){
  const db = new Database(arq);
  db.exec(`
    CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
    CREATE TABLE modelo (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, nome TEXT,
      exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
    CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
      estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER);
    CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, cor TEXT DEFAULT '',
      buyer TEXT DEFAULT '', city TEXT DEFAULT '', nf TEXT, packId TEXT, venda TEXT,
      codes TEXT DEFAULT '[]', srcfile TEXT, labelPage INTEGER, danfePage INTEGER,
      estagio TEXT DEFAULT 'pendente', embalado_em TEXT, carregado_em TEXT,
      data TEXT, criado_em TEXT DEFAULT '2026-01-01 00:00:00',
      teste INTEGER DEFAULT 0, reimpressoes INTEGER DEFAULT 0, reimpresso_em TEXT, bloqueio TEXT,
      descricao TEXT, despachar_em TEXT, bloqueio_resolvido TEXT, resolvido_por TEXT, resolvido_em TEXT,
      modalidade TEXT, retirado_em TEXT, impresso_por TEXT, conferido_por TEXT, conferido_em TEXT,
      no_carro_em TEXT, no_carro_por TEXT, saida_id INTEGER, saiu_em TEXT, saiu_por TEXT,
      cancelada_em TEXT, cancelada_origem TEXT, cancelada_estagio TEXT, cancelada_motivo TEXT,
      cancelada_varias INTEGER DEFAULT 0, cancelada_aviso_em TEXT,
      cancelada_resolvida_em TEXT, cancelada_resolvida_por TEXT, cancelada_voltou INTEGER);
    CREATE TABLE lote_item (id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER NOT NULL,
      codigo TEXT, qtd INTEGER DEFAULT 1, cor TEXT, descricao TEXT, origem TEXT DEFAULT 'folha',
      conferido_em TEXT, conferido_por TEXT, criado_em TEXT DEFAULT '2026-01-01 00:00:00',
      teste INTEGER DEFAULT 0, conferidos INTEGER DEFAULT 0);
    CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT,
      modo TEXT DEFAULT 'hoje', situacao TEXT DEFAULT 'aguardando',
      revisado_em TEXT, embalado_em TEXT, data TEXT, teste INTEGER DEFAULT 0);
    INSERT INTO modelo (codigo,nome) VALUES ('ROLO','Rolô');
    INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('BK140140BEGE',5,1);
  `);
  const v = (o) => { const c = Object.keys(o);
    return db.prepare('INSERT INTO lote ('+c.join(',')+') VALUES ('+c.map(()=>'?').join(',')+')').run(c.map(k=>o[k])).lastInsertRowid; };
  // 1: o original, que ja andou; 2: o fantasma dele, com uma peca
  v({codigo:'BK140140BEGE', buyer:'Original', venda:'500', estagio:'embalado', embalado_em:D(-30)+' 10:00:00', data:D(-30), despachar_em:D(-29)});
  const fan = v({codigo:'BK140140BEGE', buyer:'Original', venda:'500', estagio:'pendente', data:D(-3), despachar_em:D(-29)});
  db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd) VALUES (?, 'BK140140BEGE', 1)").run(fan);
  // 3: a saida por id
  v({codigo:'BK140140BEGE', buyer:'Saiu Por Fora', venda:'501', estagio:'pendente', data:D(-7), despachar_em:D(-5)});
  // 4 e 5: os vencidos (o 5 e coleta); 6: o que vence depois do corte
  v({codigo:'BK140140BEGE', buyer:'Vencido', venda:'502', estagio:'pendente', data:D(-9), despachar_em:D(-8)});
  v({codigo:'BK140140BEGE', buyer:'Vencido Coleta', venda:'503', estagio:'pendente', data:D(-9), despachar_em:D(-6), modalidade:'coleta'});
  v({codigo:'BK140140BEGE', buyer:'Vence Depois', venda:'504', estagio:'pendente', data:D(-1), despachar_em:D(4)});
  // 7: a futura fechada que nunca foi impressa; 8: a que foi
  v({codigo:'BK140140BEGE', buyer:'Futura Nunca Impressa', venda:'505', estagio:'carregado', carregado_em:D(6)+' 15:00:00', data:D(-2), despachar_em:D(6)});
  v({codigo:'BK140140BEGE', buyer:'Futura Impressa', venda:'506', estagio:'carregado', embalado_em:D(-2)+' 09:00:00', carregado_em:D(8)+' 15:00:00', data:D(-2), despachar_em:D(8)});
  // a fila: duas aguardando e uma embalada
  db.prepare("INSERT INTO fila (codigo,revisado_em,data) VALUES ('BK140140BEGE',?,?)").run(D(-40)+' 08:00:00', D(-40));
  db.prepare("INSERT INTO fila (codigo,revisado_em,data,modo) VALUES ('BK140140BEGE',?,?,'devolucao')").run(D(-2)+' 08:00:00', D(-2));
  db.prepare("INSERT INTO fila (codigo,revisado_em,data,situacao,embalado_em) VALUES ('BK140140BEGE',?,?,'embalado',?)")
    .run(D(-20)+' 08:00:00', D(-20), D(-19)+' 08:00:00');
  db.close();
}
montar(ARQ_A);
montar(ARQ_B);

/* ─── A: pelo botao ─────────────────────────────────────────────────────── */
const dbA = new Database(ARQ_A);
const rotas = {};
const app = {
  locals:{ acesso:{ podePermissao(){ return true; }, auditar(){} } },
  get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; }
};
require('./correcao_route')(app, dbA);
const LUCAS = {id:1, nome:'Lucas'};
function exec(acao, tipo, id, params){
  const out = { status:200, body:null };
  const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; return res; } };
  rotas['POST /api/correcao/executar']({ body:{acao,tipo,id,params,motivo:'teste'}, query:{}, params:{}, headers:{}, usuario:LUCAS }, res);
  return out;
}
console.log('\n=== 1. O BOTAO (banco A) ===\n');
eq('fantasma #2 pelo botão', exec('fantasma','lote',2).status, 200);
eq('saída do #3 pelo botão', exec('saida','lote',3).status, 200);
eq('vencidos até ontem pelo botão', exec('vencidos','bloco',0,{ate:D(-1)}).status, 200);
eq('reabrir #7 pelo botão', exec('reabrir','lote',7).status, 200);
eq('reabrir #8 pelo botão', exec('reabrir','lote',8).status, 200);
eq('tirar da fila #1 pelo botão', exec('fila','fila',1).status, 200);
eq('tirar da fila #2 pelo botão', exec('fila','fila',2).status, 200);
dbA.close();

/* ─── B: pelo terminal ──────────────────────────────────────────────────── */
console.log('\n=== 2. O TERMINAL (banco B) ===\n');
const env = Object.assign({}, process.env, { PCP_DB: ARQ_B });
function rodar(args){
  try{ return { ok:true, out:execFileSync('node', args, { env, encoding:'utf8', cwd:__dirname }) }; }
  catch(e){ return { ok:false, out:(e.stdout||'') + (e.stderr||'') }; }
}
let r;
r = rodar(['limpar_fantasmas.js','--aplicar']);           ok('limpar_fantasmas --aplicar roda', r.ok, r.out);
r = rodar(['regularizar_saida.js','3','--aplicar']);      ok('regularizar_saida 3 --aplicar roda', r.ok, r.out);
r = rodar(['fechar_vencidos.js','--ate',D(-1),'--aplicar']); ok('fechar_vencidos --ate ontem --aplicar roda', r.ok, r.out);
r = rodar(['reabrir_futuros.js','--aplicar']);            ok('reabrir_futuros --aplicar roda', r.ok, r.out);
r = rodar(['limpar_fila.js','--confirmar']);              ok('limpar_fila --confirmar roda', r.ok, r.out);

/* ─── comparar ──────────────────────────────────────────────────────────── */
console.log('\n=== 3. OS DOIS BANCOS TERMINAM IGUAIS ===\n');
const A = new Database(ARQ_A, { readonly:true }), B = new Database(ARQ_B, { readonly:true });
const todos = (db, sql) => JSON.stringify(db.prepare(sql).all());
const SQL_LOTE = 'SELECT id,estagio,carregado_em,retirado_em,embalado_em FROM lote ORDER BY id';
eq('os volumes são os mesmos, no mesmo estágio e com o mesmo carimbo', todos(B, SQL_LOTE), todos(A, SQL_LOTE));
eq('as peças: o fantasma sai COM a peça nos dois (o script deixava órfã)',
   todos(B, 'SELECT id,lote_id FROM lote_item ORDER BY id'), todos(A, 'SELECT id,lote_id FROM lote_item ORDER BY id'));
eq('a fila é a mesma — e a linha embalada ficou nos dois',
   todos(B, 'SELECT id,situacao FROM fila ORDER BY id'), todos(A, 'SELECT id,situacao FROM fila ORDER BY id'));
const SQL_COR = 'SELECT acao,alvo_tipo,alvo_id,antes,depois FROM correcao ORDER BY id';
const ca = A.prepare(SQL_COR).all(), cb = B.prepare(SQL_COR).all();
eq('o terminal gravou o mesmo número de correções que o botão', cb.length, ca.length);
ok('CADA CORREÇÃO TEM O MESMO ANTES E O MESMO DEPOIS', JSON.stringify(cb) === JSON.stringify(ca),
   ca.map((c,i) => c.acao + ':' + c.alvo_id + (JSON.stringify(c) === JSON.stringify(cb[i]||{}) ? ' ok' : ' DIFERENTE')).join(' · '));
const quem = B.prepare('SELECT DISTINCT usuario_nome FROM correcao').all().map(x => x.usuario_nome);
ok('no terminal, quem fez é o script — não um nome inventado', quem.length && quem.every(q => /^terminal: /.test(q)), JSON.stringify(quem));
eq('o volume que vence depois do corte ficou pendente nos dois', B.prepare('SELECT estagio FROM lote WHERE id=6').get().estagio, 'pendente');
eq('a futura nunca impressa voltou a PENDENTE pelo script também', B.prepare('SELECT estagio FROM lote WHERE id=7').get().estagio, 'pendente');
eq('a coleta fechada pelo script ganhou retirado_em', B.prepare('SELECT retirado_em FROM lote WHERE id=5').get().retirado_em, D(-6)+' 15:00:00');
A.close(); B.close();

/* ─── o motivo do terminal ──────────────────────────────────────────────── */
console.log('\n=== 4. O MOTIVO ===\n');
const T = require('./correcoes').terminal('x.js', ['--aplicar','--motivo','conferido no painel']);
eq('--motivo vai para o histórico', T.motivo, 'conferido no painel');
eq('sem --motivo, o motivo diz de onde veio', require('./correcoes').terminal('x.js', ['--aplicar']).motivo, 'rodado pelo terminal: x.js');

console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
try{ fs.rmSync(tmp, { recursive:true, force:true }); }catch(e){}
process.exit(falhas ? 1 : 0);
