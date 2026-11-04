#!/usr/bin/env node
/* teste_revisao.js — a revisao NAO mexe no estoque (armadilha #1, CLAUDE.md §2).
 *
 *   node teste_revisao.js
 *
 * A REGRA, do dono da operacao: "ela so pode passar a ser estoque depois da
 * montagem/embalagem". A peca revisada ainda nao esta pronta — falta embalar e
 * conferir o kit. Revisar so:
 *   - grava o tempo em `revisao`, com o modo da tela (vermelho = 'hoje',
 *     azul = 'estoque');
 *   - poe a peca na `fila` como 'aguardando', no mesmo modo.
 * O saldo (`skus.estoque`) e o livro (`movimento_estoque`) nao andam. Quem soma
 * +1 e a embalagem (mont_route.js, teste_montagem.js).
 *
 * Ate 20/10/2026 nenhum teste chamava esta rota: ela morava no server.js, que
 * abre porta e banco real. A regra mais "consertavel" do sistema — a que parece
 * bug — estava protegida so pelo CLAUDE.md. A rota foi para o revisao_route.js
 * sem mudar uma linha, e este arquivo e o que ela ganhou com isso.
 *
 * Sobe um banco temporario e chama o handler direto, com um `app` de mentira.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');
const ESTOQUE = require('./estoque_dominio');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-revisao-'));
const db = new Database(path.join(tmp, 't.db'));

/* Mesmo CREATE do db.js (skus, producao, revisao, fila). Copia consciente: o
   teste tem que subir sem o db.js, que aponta para a pasta do servidor (§13). */
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, criado_em TEXT DEFAULT (datetime('now','localtime')));
  CREATE TABLE producao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, qtd INTEGER,
    produzido INTEGER DEFAULT 0, data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')),
    origem TEXT DEFAULT 'manual', urgente INTEGER DEFAULT 0, teste INTEGER DEFAULT 0);
  CREATE TABLE revisao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, inicio TEXT, fim TEXT,
    segundos INTEGER, data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')),
    modo TEXT DEFAULT 'hoje', teste INTEGER DEFAULT 0);
  CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT,
    modo TEXT DEFAULT 'hoje', situacao TEXT DEFAULT 'aguardando',
    revisado_em TEXT DEFAULT (datetime('now','localtime')), embalado_em TEXT,
    data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, packId TEXT, venda TEXT,
    estagio TEXT DEFAULT 'pendente', data TEXT DEFAULT (date('now','localtime')));
  INSERT INTO skus (codigo,estoque) VALUES ('BK140140BEGE',5),('BK160140CINZA',0);
  INSERT INTO producao (codigo,qtd,produzido) VALUES ('BK140140BEGE',3,1);
`);
/* O livro nasce com a abertura (uma linha por SKU com saldo), como no boot. */
ESTOQUE.garantirSchema(db);

const rotas = {};
const app = { locals:{}, get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; } };
require('./revisao_route')(app, db);

const ANA = { id:1, nome:'Ana' }, BIA = { id:2, nome:'Bia' };
function chamar(metodo, rota, corpo, usuario){
  const h = rotas[metodo+' '+rota];
  /* Rota ausente ou que estoura vira VERMELHO, e nao "travou": senao a
     rodada morre no meio e os casos de baixo nunca rodam (§7-B, #33). */
  if(!h) return { status:'rota nao registrada', body:{} };
  const out = { status:200, body:null };
  const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; return res; } };
  try{ h({ body: corpo||{}, params:{}, query:{}, headers:{}, usuario: usuario===undefined ? ANA : usuario }, res); }
  catch(e){ return { status:500, body:{ erro:String(e.message||e) } }; }
  return out;
}
/* A revisao de verdade dura mais que a barreira (QUEM-FEZ-E-REVISAO §3.1):
   sem `segundos` no corpo, o teste manda 30. Os blocos 1 a 6 sao de antes da
   barreira, e o que eles conferem nao depende do tempo. */
function revisar(corpo, usuario){
  const c = Object.assign({}, corpo);
  if(c.segundos === undefined) c.segundos = 30;
  return chamar('POST', '/api/revisao', c, usuario);
}
const saldo  = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
const livro  = c => db.prepare('SELECT COUNT(*) n, COALESCE(SUM(delta),0) s FROM movimento_estoque WHERE codigo=?').get(c);
const contar = t => db.prepare('SELECT COUNT(*) n FROM '+t).get().n;

console.log('\n── 1. revisar NAO mexe no estoque (armadilha #1) ──');
const livroAntes = livro('BK140140BEGE');
let r = revisar({ codigo:'BK140140BEGE', segundos:42.4, modo:'hoje' });
eq('a revisao responde ok', r.status, 200);
eq('o saldo continua 5 depois de revisar', saldo('BK140140BEGE'), 5);
eq('o livro nao ganhou linha nenhuma', livro('BK140140BEGE').n, livroAntes.n);
eq('a soma do livro continua batendo com o saldo', livro('BK140140BEGE').s, saldo('BK140140BEGE'));
for(let i=0;i<4;i++) revisar({ codigo:'BK140140BEGE', segundos:30, modo:'estoque' });
eq('cinco revisoes seguidas e o saldo ainda e 5', saldo('BK140140BEGE'), 5);
eq('SKU zerado revisado continua zerado (nao vira +1)',
   (revisar({ codigo:'BK160140CINZA', segundos:30 }), saldo('BK160140CINZA')), 0);
eq('a ordem do dia nao anda na revisao (quem abate e a embalagem)',
   db.prepare("SELECT produzido FROM producao WHERE codigo='BK140140BEGE'").get().produzido, 1);

console.log('\n── 2. a peca vai para a fila, aguardando, no modo da tela ──');
const fila = db.prepare("SELECT codigo,modo,situacao FROM fila ORDER BY id").all();
eq('uma linha de fila por revisao', fila.length, 6);
ok('toda linha nasce aguardando', fila.every(f => f.situacao === 'aguardando'), JSON.stringify(fila));
eq('a revisao da tela vermelha vai como hoje', fila[0].modo, 'hoje');
eq('a revisao da tela azul vai como estoque', fila[1].modo, 'estoque');
eq('sem modo no corpo, vale hoje', fila[5].modo, 'hoje');
eq('modo desconhecido vira hoje, nunca outra coisa',
   (revisar({ codigo:'BK140140BEGE', modo:'qualquer' }), db.prepare('SELECT modo FROM fila ORDER BY id DESC').get().modo), 'hoje');
const rev = db.prepare('SELECT codigo,segundos,modo FROM revisao ORDER BY id').all();
eq('a revisao grava o tempo arredondado', rev[0].segundos, 42);
eq('a revisao e a fila tem o mesmo modo', rev[1].modo, 'estoque');

console.log('\n── 3. o codigo bipado e normalizado ──');
r = revisar({ codigo:'  bk140140bege ' });
eq('minuscula e espaco sao aceitos', r.status, 200);
eq('e gravados no codigo do cadastro', db.prepare('SELECT codigo FROM fila ORDER BY id DESC').get().codigo, 'BK140140BEGE');

console.log('\n── 4. SKU fora do cadastro e recusado, sem gravar nada ──');
const antesRev = contar('revisao'), antesFila = contar('fila');
r = revisar({ codigo:'BK999999NADA' });
eq('SKU sem cadastro leva 404', r.status, 404);
ok('a recusa diz qual SKU', /BK999999NADA/.test(r.body && r.body.erro), JSON.stringify(r.body));
eq('nenhuma revisao gravada', contar('revisao'), antesRev);
eq('nada entrou na fila', contar('fila'), antesFila);
r = revisar({});
eq('sem codigo leva 400', r.status, 400);
eq('e tambem nao grava', contar('fila'), antesFila);

console.log('\n── 5. a resposta: estoque e campo antigo (armadilha #2) ──');
r = revisar({ codigo:'BK140140BEGE' });
/* O campo continua vindo (a tela ignora), e o que ele diz e o saldo de
   SEMPRE — nunca o saldo + 1. Se um dia ele vier 6, alguem pos a revisao para
   somar estoque. */
eq('o estoque devolvido e o saldo atual, sem somar a peca revisada', r.body.estoque, 5);

console.log('\n── 6. QUEM REVISOU fica gravado (fase 4 da ACESSOS-UNIFICADOS, divida 9) ──');
/* A tabela deste teste nasce SEM as colunas — e o banco de producao de hoje. A
   rota tem que garanti-las sozinha (o ALTER guardado), senao o INSERT estoura
   no primeiro bipe depois do deploy. */
r = revisar({ codigo:'BK160140CINZA' });
eq('revisa normalmente', r.status, 200);
const ultRev = db.prepare('SELECT * FROM revisao ORDER BY id DESC LIMIT 1').get();
eq('grava o id de quem revisou', ultRev.usuario_id, 1);
eq('e o nome, como retrato (a pessoa pode mudar de nome depois)', ultRev.usuario_nome, 'Ana');

/* ══ QUEM-FEZ-E-REVISAO, fase 1 (04/11/2026) ══════════════════════════════
   Os 12 casos da spec §7, escritos ANTES do codigo (risco 🔴). O defeito que
   abriu a spec: dois bipes colados viravam inicio + fim, a revisao de 1 s
   entrava e a peca ia para a fila da embalagem sem ninguem ter revisado — e
   nao havia volta. */
const ev = (tipo) => db.prepare('SELECT * FROM revisao_evento WHERE tipo=? ORDER BY id').all(tipo);
const temTabela = t => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
/* Comeca do zero: os blocos de cima deixaram revisao e fila cheias. */
db.exec('DELETE FROM revisao; DELETE FROM fila;');

console.log('\n── 7. a barreira de 15 s (caso 1 e 2 da spec) ──');
ok('a tabela revisao_evento existe', temTabela('revisao_evento'));
eq('o limite mora em config.rev_minimo_seg, com 15 de partida',
   (db.prepare("SELECT valor FROM config WHERE chave='rev_minimo_seg'").get()||{}).valor, '15');
let antesR = contar('revisao'), antesF = contar('fila');
r = revisar({ codigo:'BK140140BEGE', segundos:14, modo:'hoje' });
eq('14 s e recusado com 409', r.status, 409);
eq('o motivo e rapido_demais', r.body && r.body.motivo, 'rapido_demais');
eq('e a resposta diz o minimo', r.body && r.body.minimo, 15);
eq('nao cria revisao', contar('revisao'), antesR);
eq('nao cria linha na fila', contar('fila'), antesF);
const rap = temTabela('revisao_evento') ? ev('rapido_demais') : [];
eq('grava o evento rapido_demais', rap.length, 1);
eq('com o id de quem bipou', rap[0] && rap[0].usuario_id, 1);
eq('e o nome', rap[0] && rap[0].usuario_nome, 'Ana');
eq('e os segundos que a pessoa levou', rap[0] && rap[0].segundos, 14);
eq('1 s (o bipe duplo) tambem e recusado', revisar({ codigo:'BK140140BEGE', segundos:1 }).status, 409);
eq('sem segundos nenhum (0) e recusado — nao vira revisao de graca',
   chamar('POST','/api/revisao',{ codigo:'BK140140BEGE' }).status, 409);
r = revisar({ codigo:'BK140140BEGE', segundos:15, modo:'hoje' });
eq('15 s passa', r.status, 200);
const r15 = db.prepare('SELECT * FROM revisao ORDER BY id DESC LIMIT 1').get();
eq('cria a revisao com usuario_id', r15 && r15.usuario_id, 1);
const f15 = db.prepare('SELECT * FROM fila ORDER BY id DESC LIMIT 1').get();
eq('e a fila aponta para ela (fila.revisao_id)', f15 && f15.revisao_id, r15 && r15.id);
db.prepare("UPDATE config SET valor='20' WHERE chave='rev_minimo_seg'").run();
eq('o numero manda: com 20 no config, 18 s e recusado', revisar({ codigo:'BK140140BEGE', segundos:18 }).status, 409);
db.prepare("UPDATE config SET valor='15' WHERE chave='rev_minimo_seg'").run();

console.log('\n── 8. sem login nao grava (caso 3) ──');
antesR = contar('revisao'); antesF = contar('fila');
r = revisar({ codigo:'BK140140BEGE', segundos:40 }, null);
eq('revisao sem login leva 401', r.status, 401);
eq('nao cria revisao', contar('revisao'), antesR);
eq('nem fila', contar('fila'), antesF);
eq('usuario sem id tambem e recusado', revisar({ codigo:'BK140140BEGE', segundos:40 }, { nome:'Fulano' }).status, 401);
eq('cancelar sem login leva 401', chamar('POST','/api/revisao/cancelar',{ codigo:'BK140140BEGE', segundos:3 }, null).status, 401);
eq('desfazer sem login leva 401', chamar('POST','/api/revisao/desfazer',{}, null).status, 401);

console.log('\n── 9. cancelar (caso 4) ──');
antesR = contar('revisao'); antesF = contar('fila');
r = chamar('POST','/api/revisao/cancelar',{ codigo:' bk140140bege ', segundos:3, modo:'hoje' }, BIA);
eq('cancelar responde ok', r.status, 200);
eq('nao cria revisao', contar('revisao'), antesR);
eq('nao cria fila', contar('fila'), antesF);
const can = temTabela('revisao_evento') ? ev('cancelada') : [];
eq('grava o evento cancelada', can.length, 1);
eq('com quem cancelou', can[0] && can[0].usuario_id, 2);
eq('e o codigo normalizado', can[0] && can[0].codigo, 'BK140140BEGE');
eq('cancelar sem codigo leva 400', chamar('POST','/api/revisao/cancelar',{}, BIA).status, 400);
eq('cancelar nao mexe no estoque', saldo('BK140140BEGE'), 5);

console.log('\n── 10. desfazer a ultima (caso 5, 10) ──');
db.exec('DELETE FROM revisao; DELETE FROM fila;');
const ORDEM = require('./ordem_dia');
const revHoje = () => { const o = chamar('GET','/api/revisao/hoje'); return JSON.stringify(o.body); };
const odAntes = JSON.stringify(ORDEM.linhas(db)), hojeAntes = revHoje();
r = revisar({ codigo:'BK140140BEGE', segundos:40, modo:'hoje' });
const rid = db.prepare('SELECT MAX(id) m FROM revisao').get().m;
ok('depois da revisao a ordem do dia mudou (senao o caso 10 nao prova nada)', JSON.stringify(ORDEM.linhas(db)) !== odAntes);
let u = chamar('GET','/api/revisao/ultima');
eq('a ultima diz o minimo', u.body && u.body.minimo_seg, 15);
eq('a ultima aponta a revisao que acabou de fechar', u.body && u.body.desfazer && u.body.desfazer.revisao_id, rid);
eq('com o codigo', u.body && u.body.desfazer && u.body.desfazer.codigo, 'BK140140BEGE');
eq('e pode desfazer', u.body && u.body.desfazer && u.body.desfazer.pode, true);
r = chamar('POST','/api/revisao/desfazer',{ revisao_id: rid });
eq('desfazer responde ok', r.status, 200);
eq('a revisao foi apagada', db.prepare('SELECT COUNT(*) n FROM revisao WHERE id=?').get(rid).n, 0);
eq('a linha da fila foi apagada', db.prepare('SELECT COUNT(*) n FROM fila WHERE revisao_id=?').get(rid).n, 0);
const des = temTabela('revisao_evento') ? ev('desfeita') : [];
eq('grava o evento desfeita', des.length, 1);
eq('com quem desfez', des[0] && des[0].usuario_id, 1);
eq('e a copia da revisao (id, codigo, segundos, modo)',
   des[0] && [des[0].revisao_id, des[0].codigo, des[0].segundos, des[0].modo].join('|'), rid+'|BK140140BEGE|40|hoje');
eq('a ordem do dia voltou ao numero de antes', JSON.stringify(ORDEM.linhas(db)), odAntes);
eq('o /api/revisao/hoje voltou ao de antes', revHoje(), hojeAntes);
eq('desfazer nao mexe no estoque', saldo('BK140140BEGE'), 5);

console.log('\n── 11. desfazer nao volta duas seguidas (caso 8) ──');
revisar({ codigo:'BK140140BEGE', segundos:40 });
const r1 = db.prepare('SELECT MAX(id) m FROM revisao').get().m;
revisar({ codigo:'BK160140CINZA', segundos:40 });
const r2 = db.prepare('SELECT MAX(id) m FROM revisao').get().m;
eq('desfaz a ultima (r2)', chamar('POST','/api/revisao/desfazer',{ revisao_id:r2 }).status, 200);
u = chamar('GET','/api/revisao/ultima');
eq('depois de desfazer, nao ha o que desfazer', u.body && u.body.desfazer, null);
r = chamar('POST','/api/revisao/desfazer',{ revisao_id:r1 });
eq('a anterior (r1) e recusada', r.status, 409);
eq('com o motivo nao_e_a_ultima', r.body && r.body.motivo, 'nao_e_a_ultima');
eq('e a r1 continua de pe', db.prepare('SELECT COUNT(*) n FROM revisao WHERE id=?').get(r1).n, 1);
eq('desfazer sem id tambem nao acha a r1', chamar('POST','/api/revisao/desfazer',{}).status, 409);
revisar({ codigo:'BK160140CINZA', segundos:40 });
const r3 = db.prepare('SELECT MAX(id) m FROM revisao').get().m;
eq('a proxima revisao fecha e o desfazer volta', chamar('GET','/api/revisao/ultima').body.desfazer.revisao_id, r3);

console.log('\n── 12. ja embalada nao se desfaz (caso 6) ──');
db.prepare("UPDATE fila SET situacao='embalado', embalado_em=datetime('now','localtime') WHERE revisao_id=?").run(r3);
u = chamar('GET','/api/revisao/ultima');
eq('a ultima ainda aparece, para a tela dizer o porque', u.body.desfazer && u.body.desfazer.revisao_id, r3);
eq('mas nao pode', u.body.desfazer && u.body.desfazer.pode, false);
eq('porque foi embalada', u.body.desfazer && u.body.desfazer.motivo, 'embalada');
antesR = contar('revisao'); antesF = contar('fila');
const antesEv = temTabela('revisao_evento') ? contar('revisao_evento') : 0;
r = chamar('POST','/api/revisao/desfazer',{ revisao_id:r3 });
eq('desfazer a embalada leva 409', r.status, 409);
eq('com o motivo embalada', r.body && r.body.motivo, 'embalada');
ok('e a mensagem diz que ja foi embalada', /embalada/i.test(r.body && r.body.erro || ''), JSON.stringify(r.body));
eq('nada apagado em revisao', contar('revisao'), antesR);
eq('nada apagado na fila', contar('fila'), antesF);
eq('nenhum evento gravado (a transacao voltou)', temTabela('revisao_evento') ? contar('revisao_evento') : 0, antesEv);
/* A peca saiu da fila por outra porta (limpar_fila, Mesa): nao esta mais
   aguardando, e o desfazer tambem nao apaga a revisao sozinha. */
revisar({ codigo:'BK140140BEGE', segundos:40 });
const r4 = db.prepare('SELECT MAX(id) m FROM revisao').get().m;
db.prepare('DELETE FROM fila WHERE revisao_id=?').run(r4);
r = chamar('POST','/api/revisao/desfazer',{ revisao_id:r4 });
eq('sem a linha na fila, recusa', r.status, 409);
eq('e a revisao fica', db.prepare('SELECT COUNT(*) n FROM revisao WHERE id=?').get(r4).n, 1);

console.log('\n── 13. so a propria (caso 7) ──');
revisar({ codigo:'BK140140BEGE', segundos:40 }, ANA);
const ra = db.prepare('SELECT MAX(id) m FROM revisao').get().m;
revisar({ codigo:'BK160140CINZA', segundos:40 }, BIA);
const rb = db.prepare('SELECT MAX(id) m FROM revisao').get().m;
r = chamar('POST','/api/revisao/desfazer',{ revisao_id:ra }, BIA);
eq('Bia nao desfaz a revisao da Ana', r.status, 409);
eq('motivo nao_e_sua', r.body && r.body.motivo, 'nao_e_sua');
eq('a revisao da Ana fica', db.prepare('SELECT COUNT(*) n FROM revisao WHERE id=?').get(ra).n, 1);
eq('a ultima da Ana e a dela, mesmo com a Bia depois no mesmo tablet',
   chamar('GET','/api/revisao/ultima',null,ANA).body.desfazer.revisao_id, ra);
eq('a ultima da Bia e a dela', chamar('GET','/api/revisao/ultima',null,BIA).body.desfazer.revisao_id, rb);
eq('a Ana desfaz a dela', chamar('POST','/api/revisao/desfazer',{ revisao_id:ra }, ANA).status, 200);
eq('e a da Bia continua', db.prepare('SELECT COUNT(*) n FROM revisao WHERE id=?').get(rb).n, 1);
eq('id que nao existe leva 404', chamar('POST','/api/revisao/desfazer',{ revisao_id:999999 }).status, 404);

console.log('\n── 14. so do dia (caso 9) ──');
revisar({ codigo:'BK140140BEGE', segundos:40 }, ANA);
const ro = db.prepare('SELECT MAX(id) m FROM revisao').get().m;
db.prepare("UPDATE revisao SET data=date('now','localtime','-1 day') WHERE id=?").run(ro);
u = chamar('GET','/api/revisao/ultima',null,ANA);
ok('a revisao de ontem nao aparece para desfazer', !(u.body.desfazer && u.body.desfazer.revisao_id === ro), JSON.stringify(u.body));
r = chamar('POST','/api/revisao/desfazer',{ revisao_id:ro }, ANA);
eq('desfazer a de ontem leva 409', r.status, 409);
eq('motivo outro_dia', r.body && r.body.motivo, 'outro_dia');
eq('e ela fica', db.prepare('SELECT COUNT(*) n FROM revisao WHERE id=?').get(ro).n, 1);

console.log('\n── 15. peca com problema grava o id (rejeicao.usuario_id) ──');
const appC = { locals:{}, get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; }, delete(){}, put(){} };
require('./cad_route')(appC, db);
r = chamar('POST','/api/rejeicao',{ codigo:'bk140140bege', motivo:'Medida errada', segundos:50, modo:'hoje' }, BIA);
eq('a rejeicao responde ok', r.status, 200);
const rj = db.prepare('SELECT * FROM rejeicao ORDER BY id DESC LIMIT 1').get();
eq('grava o usuario_id', rj && rj.usuario_id, 2);
eq('e o nome continua na coluna de sempre', rj && rj.usuario, 'Bia');
eq('rejeicao sem login leva 401', chamar('POST','/api/rejeicao',{ codigo:'BK140140BEGE', motivo:'Outro' }, null).status, 401);

console.log('\n── 16. permDaRota: as tres rotas novas sao revisao.executar (caso 12) ──');
{
  const dbA = new Database(':memory:');
  dbA.exec(`CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT,
    pin_hash TEXT, salt TEXT, areas TEXT, ativo INTEGER DEFAULT 1);
    CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);`);
  const appA = { locals:{}, router:{ stack:[] }, get(){}, post(){}, delete(){} };
  require('./acesso')(appA, dbA);
  const P = appA.locals.acesso.permDaRota;
  eq('POST /api/revisao/cancelar', P('/api/revisao/cancelar','POST'), 'revisao.executar');
  eq('POST /api/revisao/desfazer', P('/api/revisao/desfazer','POST'), 'revisao.executar');
  eq('GET /api/revisao/ultima',    P('/api/revisao/ultima','GET'), 'revisao.executar');
  eq('o POST /api/revisao continua revisao.executar', P('/api/revisao','POST'), 'revisao.executar');
  dbA.close();
}

console.log('\n── 17. modo teste (caso 11) ──');
db.exec('DELETE FROM revisao; DELETE FROM fila; DELETE FROM revisao_evento;');
revisar({ codigo:'BK140140BEGE', segundos:40 }, ANA);
const rReal = db.prepare('SELECT MAX(id) m FROM revisao').get().m;
const appT = { locals:{}, get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; } };
require('./teste_route')(appT, db);
const tst = chamar('GET','/api/teste');
ok('revisao_evento esta coberta pelo modo teste',
   !(tst.body.naoCobertas||[]).some(x => x.tabela === 'revisao_evento') && db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='trg_teste_revisao_evento'").get(),
   JSON.stringify(tst.body.naoCobertas));
db.prepare("INSERT OR REPLACE INTO config (chave,valor) VALUES ('modo_teste','1')").run();
r = chamar('POST','/api/revisao/desfazer',{ revisao_id:rReal }, ANA);
eq('em modo teste, a revisao de verdade nao se desfaz', r.status, 409);
eq('motivo modo_teste', r.body && r.body.motivo, 'modo_teste');
eq('e ela fica', db.prepare('SELECT COUNT(*) n FROM revisao WHERE id=?').get(rReal).n, 1);
chamar('POST','/api/revisao/cancelar',{ codigo:'BK140140BEGE', segundos:2 }, ANA);
revisar({ codigo:'BK140140BEGE', segundos:3 }, ANA);
revisar({ codigo:'BK140140BEGE', segundos:40 }, ANA);
const rTeste = db.prepare('SELECT MAX(id) m FROM revisao').get().m;
eq('a revisao de teste se desfaz em modo teste', chamar('POST','/api/revisao/desfazer',{ revisao_id:rTeste }, ANA).status, 200);
const evT = db.prepare('SELECT tipo, teste FROM revisao_evento ORDER BY id').all();
eq('tres eventos de teste (cancelada, rapido_demais, desfeita)', evT.length, 3);
ok('todos marcados teste=1', evT.every(e => e.teste === 1), JSON.stringify(evT));
r = chamar('POST','/api/teste/limpar',{}, ANA);
eq('o "apagar tudo" apaga os eventos de teste', contar('revisao_evento'), 0);
eq('e a revisao de verdade continua', db.prepare('SELECT COUNT(*) n FROM revisao WHERE id=?').get(rReal).n, 1);
eq('fora do modo teste ela volta a poder ser desfeita', chamar('GET','/api/revisao/ultima',null,ANA).body.desfazer.revisao_id, rReal);

db.close(); fs.rmSync(tmp, { recursive:true, force:true });
console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
process.exit(falhas ? 1 : 0);
