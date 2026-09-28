#!/usr/bin/env node
/* teste_ajuste.js — o ajuste manual de estoque em duas pessoas.
 *
 *   node teste_ajuste.js
 *
 * Fase 3 da spec ESTOQUE-LIVRO-E-CONFERENCIA (28/09/2026). Escrito ANTES do
 * codigo, como a §0 pede no risco vermelho. Os casos sao os da §9 da spec,
 * mais os das duas decisoes do dono:
 *   - o pedido e em DELTA, com o saldo do momento guardado ao lado;
 *   - os pedidos moram em `ajuste_pedido`, e o `ajuste_estoque` continua sendo
 *     so o historico do que FOI aplicado — cinco lugares o leem assim.
 *
 * Sobe um banco temporario e chama os handlers direto, com um `app` de
 * mentira. Nao abre porta, nao toca no banco de producao.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-ajuste-'));
const db = new Database(path.join(tmp, 't.db'));
db.exec(`
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0);
  CREATE TABLE ajuste_estoque (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, antes INTEGER,
    depois INTEGER, delta INTEGER, motivo TEXT, obs TEXT, usuario_id INTEGER, usuario_nome TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')), data TEXT DEFAULT (date('now','localtime')),
    teste INTEGER DEFAULT 0);
  INSERT INTO skus (codigo,descricao,estoque) VALUES ('BK140140BEGE','Rolo 1,40',10),
    ('BK160160CINZA','Rolo 1,60',4), ('BK120120BEGE','Rolo 1,20',6);
`);
const ESTOQUE = require('./estoque_dominio');
ESTOQUE.garantirSchema(db);

const PERMS = {};
const rotas = {};
const app = {
  locals:{ acesso:{
    podePermissao(u, chave){ return !!(u && PERMS[u.id] && PERMS[u.id].has(chave)); },
    auditar(){}
  }},
  get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; }
};
require('./ajuste_route')(app, db);

const ANA   = {id:1, nome:'Ana'};    // pede
const JOAO  = {id:2, nome:'Joao'};   // aprova
const LUCAS = {id:4, nome:'Lucas'};  // tem TUDO, e ainda assim nao aprova o que pediu
PERMS[1] = new Set(['estoque.ajustar']);
PERMS[2] = new Set(['estoque.ajustar','estoque.aprovar_ajuste']);
PERMS[4] = new Set(['estoque.ajustar','estoque.aprovar_ajuste','custo.ver']);

function chamar(metodo, rota, corpo, quem, params){
  const h = rotas[metodo+' '+rota];
  if(!h) throw new Error('rota nao registrada: '+metodo+' '+rota);
  const out = { status:200, body:null };
  const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; return res; } };
  h({ body: corpo||{}, query:{}, params: params||{}, headers:{}, usuario: quem }, res);
  return out;
}
const saldo = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
const pedido = id => db.prepare('SELECT * FROM ajuste_pedido WHERE id=?').get(id) || {};
const aprovar = (id, quem) => chamar('POST','/api/estoque/ajuste/:id/aprovar',{},quem,{id:String(id)});
const recusar = (id, quem, resposta) => chamar('POST','/api/estoque/ajuste/:id/recusar',{resposta},quem,{id:String(id)});
function livroFecha(){
  return db.prepare(`SELECT s.codigo, s.estoque, COALESCE((SELECT SUM(delta) FROM movimento_estoque m WHERE m.codigo=s.codigo),0) soma
    FROM skus s`).all().filter(r => r.estoque !== r.soma);
}

console.log('\n=== 1. PEDIR NAO MEXE NO SALDO ===\n');

let r = chamar('POST','/api/estoque/ajuste',{codigo:'BK140140BEGE', delta:-2, motivo:'Peca quebrada'},ANA);
eq('pedir responde ok', r.body && r.body.ok, true);
const p1 = r.body.id;
eq('o saldo NAO andou', saldo('BK140140BEGE'), 10);
eq('nenhuma linha no livro', db.prepare("SELECT COUNT(*) n FROM movimento_estoque WHERE tipo='ajuste'").get().n, 0);
eq('e nenhuma no historico de ajustes aplicados', db.prepare('SELECT COUNT(*) n FROM ajuste_estoque').get().n, 0);
eq('o pedido guarda o DELTA', pedido(p1).delta, -2);
eq('   e o saldo do momento do pedido', pedido(p1).saldo_no_pedido, 10);
eq('   e quem pediu', pedido(p1).pedido_por, 'Ana');
eq('   e nasce pendente', pedido(p1).status, 'pendente');

r = chamar('POST','/api/estoque/ajuste',{codigo:'BK160160CINZA', estoque:7, motivo:'Peca encontrada'},ANA);
const p2 = r.body.id;
eq('pedir por SALDO NOVO vira delta contra o saldo de agora (4 -> 7 = +3)', pedido(p2).delta, 3);

r = chamar('POST','/api/estoque/ajuste',{codigo:'BK140140BEGE', delta:-1, motivo:'Peca quebrada'},ANA);
eq('um segundo pedido pendente do MESMO SKU e recusado', r.status, 409);
r = chamar('POST','/api/estoque/ajuste',{codigo:'BK120120BEGE', delta:-1},ANA);
eq('sem motivo e recusado', r.status, 400);
r = chamar('POST','/api/estoque/ajuste',{codigo:'BK120120BEGE', delta:-1, motivo:'Outro'},ANA);
eq('"Outro" sem observacao e recusado', r.status, 400);
r = chamar('POST','/api/estoque/ajuste',{codigo:'BK120120BEGE', delta:0, motivo:'Peca perdida'},ANA);
eq('delta zero nao e ajuste', r.status, 400);
r = chamar('POST','/api/estoque/ajuste',{codigo:'BK120120BEGE', delta:1.5, motivo:'Peca perdida'},ANA);
eq('meia persiana nao existe', r.status, 400);
r = chamar('POST','/api/estoque/ajuste',{codigo:'BK120120BEGE', estoque:6, motivo:'Peca perdida'},ANA);
eq('saldo novo igual ao de agora nao e ajuste', r.status, 400);
r = chamar('POST','/api/estoque/ajuste',{codigo:'NAOEXISTE', delta:1, motivo:'Peca perdida'},ANA);
eq('SKU fora do cadastro e recusado', r.status, 404);

console.log('\n=== 2. QUEM PEDIU NAO APROVA — NEM COM TODAS AS CHAVES ===\n');

r = chamar('POST','/api/estoque/ajuste',{codigo:'BK120120BEGE', delta:-1, motivo:'Peca perdida'},LUCAS);
const p3 = r.body.id;
r = chamar('GET','/api/estoque/ajuste/pendentes',{},LUCAS);
const l3 = (r.body.itens||[]).find(i => i.id === p3) || {};
eq('a fila marca que o Lucas NAO pode aprovar o proprio pedido', l3.pode_aprovar, false);
ok('   e diz por que', /pediu/.test(l3.por_que_nao||''), l3.por_que_nao);
r = aprovar(p3, LUCAS);
eq('aprovar o proprio pedido e recusado', r.status, 403);
eq('   e o saldo nao andou', saldo('BK120120BEGE'), 6);
r = aprovar(p1, ANA);
eq('quem so tem estoque.ajustar nao aprova (sem a chave)', r.status, 403);

console.log('\n=== 3. APROVAR APLICA O DELTA SOBRE O SALDO DE AGORA ===\n');

/* A fabrica nao para: entre o pedido e a aprovacao a bancada embala 2. */
ESTOQUE.movimentar(db, {codigo:'BK140140BEGE', delta:+2, tipo:'embalagem', referencia:'montagem:1'});
eq('com a embalagem no meio, o saldo e 12', saldo('BK140140BEGE'), 12);
r = chamar('GET','/api/estoque/ajuste/pendentes',{},JOAO);
const l1 = (r.body.itens||[]).find(i => i.id === p1) || {};
eq('a fila mostra o saldo de agora', l1.saldo_agora, 12);
eq('   e o saldo depois (12 - 2)', l1.saldo_depois, 10);
ok('   e o que mexeu no saldo desde o pedido', (l1.extrato||[]).some(m => m.tipo === 'embalagem'), JSON.stringify(l1.extrato));
r = aprovar(p1, JOAO);
eq('o Joao aprova', r.body && r.body.ok, true);
eq('o saldo e 12 - 2 = 10: a embalagem do meio continua valendo', saldo('BK140140BEGE'), 10);
const mov = db.prepare("SELECT * FROM movimento_estoque WHERE tipo='ajuste' AND codigo='BK140140BEGE'").get() || {};
eq('   a linha do livro e `ajuste` com delta -2', mov.delta, -2);
eq('   assinada por quem aprovou', mov.aprovado_por, 'Joao');
eq('   com quem pediu', mov.usuario_nome, 'Ana');
eq('   e a referencia aponta o pedido', mov.referencia, 'ajuste:' + p1);
eq('o pedido fica aprovado', pedido(p1).status, 'aprovado');
eq('   e guarda a linha do livro', pedido(p1).movimento_id, mov.id);
const hist = db.prepare("SELECT * FROM ajuste_estoque WHERE codigo='BK140140BEGE'").get() || {};
eq('o historico de ajustes aplicados ganha a linha', hist.delta, -2);
eq('   com o antes e o depois de VERDADE (12 -> 10)', hist.antes + '->' + hist.depois, '12->10');
r = aprovar(p1, JOAO);
eq('aprovar duas vezes e recusado', r.status, 409);
eq('   e o saldo nao anda de novo', saldo('BK140140BEGE'), 10);

console.log('\n=== 4. RECUSAR NAO APAGA ===\n');

r = recusar(p2, JOAO, '');
eq('recusar sem resposta e recusado', r.status, 400);
r = recusar(p2, JOAO, 'contei de novo e sao 4 mesmo');
eq('recusar com resposta', r.body && r.body.ok, true);
eq('o pedido continua la, recusado', pedido(p2).status, 'recusado');
eq('   com a resposta', pedido(p2).resposta, 'contei de novo e sao 4 mesmo');
eq('   e o saldo nao andou', saldo('BK160160CINZA'), 4);

console.log('\n=== 5. QUEM PEDIU PODE DESISTIR DO PROPRIO PEDIDO ===\n');

/* Sem isso, um pedido errado travaria o SKU (um pendente por vez) ate outra
   pessoa aparecer — a trava que so sabe acusar. */
r = recusar(p3, LUCAS, 'pedi no SKU errado');
eq('o Lucas desiste do proprio pedido', r.body && r.body.ok, true);
eq('   e o pedido fica "desistido", nao apagado', pedido(p3).status, 'desistido');
r = chamar('POST','/api/estoque/ajuste',{codigo:'BK120120BEGE', delta:-1, motivo:'Peca perdida'},ANA);
eq('e o SKU aceita um pedido novo', r.body && r.body.ok, true);
const p4 = r.body.id;
r = recusar(p4, {id:5, nome:'Carla'}, 'nao');
eq('quem nao pediu e nao tem estoque.aprovar_ajuste NAO recusa o pedido de outra pessoa', r.status, 403);
r = recusar(p4, LUCAS, 'nao tem motivo');
eq('o Lucas (com a chave) recusa o pedido da Ana', r.body && r.body.ok, true);
eq('   e o status e RECUSADO, nao "desistido"', pedido(p4).status, 'recusado');

console.log('\n=== 6. O CAMINHO ANTIGO RECUSA ===\n');

const velha = rotas['POST /api/estoque'];
ok('POST /api/estoque existe (para recusar, dizendo o caminho)', typeof velha === 'function');
if(velha){
  r = chamar('POST','/api/estoque',{codigo:'BK140140BEGE', estoque:99, motivo:'Peca encontrada'},LUCAS);
  eq('o ajuste direto e recusado', r.status, 410);
  ok('   dizendo para pedir', /pe[cç]a|pedir|pedido/i.test((r.body||{}).erro||''), (r.body||{}).erro);
  eq('   e o saldo nao andou', saldo('BK140140BEGE'), 10);
}

console.log('\n=== 7. O LIVRO FECHA ===\n');

eq('SUM(delta) = skus.estoque em todo SKU', livroFecha().length, 0);

console.log('\n' + (falhas ? 'FALHARAM ' + falhas + ' de ' + n : 'TODOS OS ' + n + ' CASOS PASSARAM') + '\n');
db.close(); fs.rmSync(tmp, {recursive:true, force:true});
process.exit(falhas ? 1 : 0);
