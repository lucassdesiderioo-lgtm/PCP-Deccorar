#!/usr/bin/env node
/* teste_inventario.js — a conferencia de estoque em tres papeis.
 *
 *   node teste_inventario.js
 *
 * Fase 2 da spec ESTOQUE-LIVRO-E-CONFERENCIA (26/09/2026). Os casos sao os da
 * §9 da spec, e cada um foi conferido REINTRODUZINDO o defeito que ele pega:
 *
 *   - o JSON de quem conta nao traz saldo (nem a resposta do "terminei");
 *   - bateu confirma sozinho; diferente vai para recontagem;
 *   - a recontagem pela mesma pessoa e recusada;
 *   - a aprovacao por quem contou e recusada, INCLUSIVE ADMIN GERAL;
 *   - aprovar aplica a diferenca contra o saldo guardado, com uma embalagem e
 *     uma etiqueta no meio;
 *   - rejeitar nao apaga;
 *   - e o livro fecha: SUM(delta) = skus.estoque depois de tudo.
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-inventario-'));
const db = new Database(path.join(tmp, 't.db'));
db.exec(`
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, nome TEXT, sob_medida INTEGER DEFAULT 0, exige_medida INTEGER DEFAULT 1);
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, largura_cm INTEGER, altura_cm INTEGER,
    cor_codigo TEXT, tecido_codigo TEXT, modelo_id INTEGER, ativo INTEGER DEFAULT 1);
  CREATE TABLE ajuste_estoque (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, antes INTEGER,
    depois INTEGER, delta INTEGER, motivo TEXT, obs TEXT, usuario_id INTEGER, usuario_nome TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')), data TEXT DEFAULT (date('now','localtime')),
    teste INTEGER DEFAULT 0);
  INSERT INTO modelo (id,nome,sob_medida) VALUES (1,'Rolô',0),(2,'Sob medida',1);
  INSERT INTO skus (codigo,descricao,estoque,largura_cm,altura_cm,cor,modelo_id) VALUES
    ('BK140140BEGE','Rolo 1,40',10,140,140,'Bege',1),
    ('BK160160CINZA','Rolo 1,60',4,160,160,'Cinza',1),
    ('BK120120BEGE','Rolo 1,20',6,120,120,'Bege',1),
    ('BK100100CINZA','Rolo 1,00',3,100,100,'Cinza',1),
    ('BK180150BEGE','Rolo 1,80',5,180,150,'Bege',1),
    ('SOBMEDIDA','Sob medida',0,NULL,NULL,'',2);
`);
const ESTOQUE = require('./estoque_dominio');
ESTOQUE.garantirSchema(db);   // o livro, com a abertura carimbando o saldo semeado

const PERMS = {};              // quem tem o que: PERMS[id] = Set de chaves
const rotas = {};
const app = {
  locals:{ acesso:{
    podePermissao(u, chave){ return !!(u && PERMS[u.id] && PERMS[u.id].has(chave)); },
    auditar(){}
  }},
  get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; }
};
require('./inventario_route')(app, db);

const ANA  = {id:1, nome:'Ana'};    // conta
const JOAO = {id:2, nome:'Joao'};   // reconta
const BIA  = {id:3, nome:'Bia'};    // terceira
const LUCAS= {id:4, nome:'Lucas'};  // aprova (e e quem vai tentar aprovar o que contou)
PERMS[1] = new Set(['contagem.contar','contagem.recontar']);
PERMS[2] = new Set(['contagem.contar','contagem.recontar']);
PERMS[3] = new Set(['contagem.contar','contagem.recontar']);
PERMS[4] = new Set(['contagem.contar','contagem.recontar','contagem.aprovar','contagem.planejar','custo.ver']);

function chamar(metodo, rota, corpo, quem, query){
  const h = rotas[metodo+' '+rota];
  if(!h) throw new Error('rota nao registrada: '+metodo+' '+rota);
  const out = { status:200, body:null };
  const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; return res; } };
  h({ body: corpo||{}, query: query||{}, params:{}, headers:{}, usuario: quem }, res);
  return out;
}
const saldo = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
const item  = c => db.prepare('SELECT * FROM inventario_item WHERE codigo=? ORDER BY id DESC LIMIT 1').get(c) || {};
const bipar = (cod, vezes, quem, papel) => { let r;
  for(let i=0;i<vezes;i++) r = chamar('POST', papel==='recontar' ? '/api/inventario/recontar' : '/api/inventario/contar', {codigo:cod}, quem);
  return r; };
const terminar = (cod, quem, papel) => chamar('POST','/api/inventario/terminar-sku',{codigo:cod, papel:papel||'contar'}, quem);
/* O livro fecha? A regua da fase 1, conferida depois de cada passo que mexe. */
function livroFecha(){
  return db.prepare(`SELECT s.codigo, s.estoque, COALESCE((SELECT SUM(delta) FROM movimento_estoque m WHERE m.codigo=s.codigo),0) soma
    FROM skus s`).all().filter(r => r.estoque !== r.soma);
}
/* Varre o JSON inteiro atras de qualquer chave que carregue saldo ou contagem
   de outra pessoa. Olhar so o nivel de cima deixaria passar um `estoque`
   pendurado dentro de cada item. */
function chavesDe(o, acc){
  acc = acc || new Set();
  if(Array.isArray(o)) o.forEach(x => chavesDe(x, acc));
  else if(o && typeof o === 'object') for(const k in o){ acc.add(k); chavesDe(o[k], acc); }
  return acc;
}
const PROIBIDAS = ['estoque','saldo','saldo_na_contagem','saldo2','saldo3','contado1','contado2','contado3','diferenca','sistema'];

console.log('\n=== 1. ABRIR A CONFERENCIA ===\n');

let r = chamar('GET','/api/inventario/sugestao',{},LUCAS);
ok('a sugestao do dia vem, e sem sob medida', r.body.sugestao.length > 0 && !r.body.sugestao.some(s => s.codigo==='SOBMEDIDA'),
   JSON.stringify(r.body));
ok('   nunca conferido vem marcado como tal', r.body.sugestao.every(s => s.nunca === true));

r = chamar('POST','/api/inventario/abrir',{tipo:'ciclico', codigos:['BK140140BEGE','BK160160CINZA','BK120120BEGE','BK100100CINZA','SOBMEDIDA']},LUCAS);
eq('abrir: quatro SKUs entram', r.body.itens, 4);
ok('   e o sob medida fica de fora, DITO', (r.body.sob_medida||[]).indexOf('SOBMEDIDA') >= 0, JSON.stringify(r.body));
r = chamar('POST','/api/inventario/abrir',{tipo:'ciclico', codigos:['BK140140BEGE']},LUCAS);
eq('o mesmo SKU nao entra em duas conferencias abertas', r.status, 409);
r = chamar('POST','/api/inventario/abrir',{tipo:'ciclico', codigos:['NAOEXISTE']},LUCAS);
eq('SKU fora do cadastro e recusado', r.status, 400);

console.log('\n=== 2. A CONTAGEM E CEGA ===\n');

r = chamar('GET','/api/inventario/minha-lista',{},ANA);
eq('a lista de quem conta tem os quatro', r.body.itens.length, 4);
let chaves = chavesDe(r.body);
ok('o JSON da lista NAO traz saldo nem contagem', PROIBIDAS.every(k => !chaves.has(k)),
   'veio: ' + PROIBIDAS.filter(k => chaves.has(k)).join(','));
ok('   mas traz o que a peca E (medida), para conferir com a prateleira',
   r.body.itens.some(i => i.largura_cm === 140 && i.altura_cm === 140));

r = bipar('BK140140BEGE', 8, ANA);
eq('o bipe responde so o contado', r.body.contado, 8);
chaves = chavesDe(r.body);
ok('o JSON do bipe NAO traz saldo', PROIBIDAS.every(k => !chaves.has(k)), 'veio: ' + [...chaves].join(','));

r = chamar('POST','/api/inventario/contar',{codigo:'BK140140BEGE'},JOAO);
eq('outra pessoa nao soma na contagem que a Ana esta fazendo', r.status, 409);
ok('   e a recusa diz quem esta contando', /Ana/.test(r.body.erro||''), r.body.erro);

r = chamar('POST','/api/inventario/contar',{codigo:'NAOEXISTE'},ANA);
eq('SKU fora do cadastro: recusa dizendo', r.status, 404);
r = chamar('POST','/api/inventario/contar',{codigo:'BK140140BEGE', quantidade:1.5},ANA);
eq('meia persiana nao existe', r.status, 400);

console.log('\n=== 3. BATEU CONFIRMA SOZINHO ===\n');

bipar('BK160160CINZA', 4, ANA);
r = terminar('BK160160CINZA', ANA);
eq('terminar responde ok', r.body.ok, true);
chaves = chavesDe(r.body);
ok('o "terminei" NAO diz se bateu', !chaves.has('status') && !chaves.has('bateu') && PROIBIDAS.every(k => !chaves.has(k)),
   'veio: ' + [...chaves].join(','));
eq('4 contados com 4 no sistema: confirmado sem aprovacao', item('BK160160CINZA').status, 'confirmado');
eq('   e o saldo nao andou', saldo('BK160160CINZA'), 4);
eq('   e nenhuma linha no livro', db.prepare("SELECT COUNT(*) n FROM movimento_estoque WHERE tipo='inventario'").get().n, 0);

/* Zero e resposta: "nao tem nenhuma" termina sem bipe. */
r = terminar('BK100100CINZA', ANA);
eq('terminar sem bipe nenhum e contagem ZERO', item('BK100100CINZA').contado1, 0);
eq('   e 0 contra 3 no sistema vai para recontagem', item('BK100100CINZA').status, 'recontar');

console.log('\n=== 4. DIFERENTE VAI PARA RECONTAGEM — DE OUTRA PESSOA ===\n');

r = terminar('BK140140BEGE', ANA);
eq('8 contra 10: vai para recontagem', item('BK140140BEGE').status, 'recontar');
eq('   o saldo guardado e o do momento da contagem', item('BK140140BEGE').saldo_na_contagem, 10);
eq('   e o saldo NAO andou', saldo('BK140140BEGE'), 10);

r = chamar('GET','/api/inventario/recontagem',{},ANA);
ok('na lista de recontagem da Ana NAO aparece o que ela contou',
   !r.body.itens.some(i => i.codigo === 'BK140140BEGE'), JSON.stringify(r.body.itens.map(i=>i.codigo)));
r = chamar('POST','/api/inventario/recontar',{codigo:'BK140140BEGE'},ANA);
eq('a Ana recontar o que ela contou e recusado', r.status, 403);
r = terminar('BK140140BEGE', ANA, 'recontar');
eq('   nem terminando direto', r.status, 403);

r = chamar('GET','/api/inventario/recontagem',{},JOAO);
ok('o Joao ve a recontagem', r.body.itens.some(i => i.codigo === 'BK140140BEGE'));
chaves = chavesDe(r.body);
ok('   SEM o saldo e SEM a contagem da Ana', PROIBIDAS.every(k => !chaves.has(k)),
   'veio: ' + PROIBIDAS.filter(k => chaves.has(k)).join(','));

r = chamar('POST','/api/inventario/contar',{codigo:'BK140140BEGE'},JOAO);
eq('bipar pela tela de CONTAR um SKU em recontagem e recusado', r.status, 409);

/* A FABRICA NAO PARA: entre a 1ª contagem e a recontagem, a bancada embala 2 e
   a Etiqueta de Venda imprime 1. O saldo vai de 10 a 11, e a prateleira de 8 a
   9. A recontagem que acha 9 concorda com a 1ª: as duas acharam -2. */
ESTOQUE.movimentar(db, {codigo:'BK140140BEGE', delta:+2, tipo:'embalagem', referencia:'montagem:1'});
ESTOQUE.movimentar(db, {codigo:'BK140140BEGE', delta:-1, tipo:'etiqueta', referencia:'lote:1'});
eq('com a embalagem e a etiqueta, o saldo e 11', saldo('BK140140BEGE'), 11);
bipar('BK140140BEGE', 9, JOAO, 'recontar');
terminar('BK140140BEGE', JOAO, 'recontar');
eq('a recontagem que acha a MESMA diferenca vai para aprovacao', item('BK140140BEGE').status, 'aprovar');
eq('   com a diferenca -2', item('BK140140BEGE').diferenca, -2);

console.log('\n=== 5. NINGUEM APROVA O QUE CONTOU — NEM O ADMIN GERAL ===\n');

/* O Lucas conta o BK120120BEGE e depois tenta aprovar. Ele tem TODAS as
   chaves aqui; em producao, o Admin Geral passa em toda chave por nivel — e
   ainda assim nao pode. */
bipar('BK120120BEGE', 5, LUCAS);
terminar('BK120120BEGE', LUCAS);
bipar('BK120120BEGE', 5, JOAO, 'recontar');
terminar('BK120120BEGE', JOAO, 'recontar');
eq('5 contra 6, duas vezes: vai para aprovacao', item('BK120120BEGE').status, 'aprovar');

r = chamar('GET','/api/inventario/aprovacao',{},LUCAS);
const lin = r.body.itens.find(i => i.codigo === 'BK120120BEGE') || {};
eq('a fila marca que o Lucas NAO pode aprovar este', lin.pode_aprovar, false);
ok('   e diz por que', /contou/.test(lin.por_que_nao||''), lin.por_que_nao);
r = chamar('POST','/api/inventario/aprovar',{id:lin.id, motivo:'Perda ou avaria'},LUCAS);
eq('aprovar o que contou e recusado', r.status, 403);
r = chamar('POST','/api/inventario/aprovar',{id:lin.id, motivo:'Perda ou avaria'},JOAO);
eq('quem recontou tambem nao aprova', r.status, 403);
eq('   e o saldo nao andou', saldo('BK120120BEGE'), 6);

/* O Admin Geral de verdade: a funcao nao pergunta chave, pergunta pessoa. */
eq('outraPessoa: o mesmo id e a mesma pessoa, com qualquer permissao',
   ESTOQUE.outraPessoa({id:4, nome:'Lucas'}, [{id:4, nome:'Lucas'}]), false);
eq('outraPessoa: sem id, o nome normalizado decide', ESTOQUE.outraPessoa({nome:' lucas '}, [{nome:'Lucas'}]), false);
eq('outraPessoa: vazio nao e igual a vazio', ESTOQUE.outraPessoa({nome:'Bia'}, [{nome:''}]), true);
eq('outraPessoa: quem pergunta sem nome e sem id nao e ninguem', ESTOQUE.outraPessoa({}, []), false);

console.log('\n=== 6. APROVAR APLICA A DIFERENCA CONTRA O SALDO GUARDADO ===\n');

const bk = (chamar('GET','/api/inventario/aprovacao',{},LUCAS).body.itens.find(i => i.codigo==='BK140140BEGE')) || {};
eq('o Lucas pode aprovar o BK140140BEGE (ele nao contou)', bk.pode_aprovar, true);
eq('   a fila mostra as duas contagens', (bk.contagens||[]).length, 2);
ok('   e o valor da diferenca so para quem tem custo.ver', 'valor_diferenca' in bk);
r = chamar('POST','/api/inventario/aprovar',{id:bk.id},LUCAS);
eq('aprovar sem motivo e recusado', r.status, 400);
r = chamar('POST','/api/inventario/aprovar',{id:bk.id, motivo:'Outro'},LUCAS);
eq('"Outro" sem observacao e recusado', r.status, 400);
r = chamar('POST','/api/inventario/aprovar',{id:bk.id, motivo:'Perda ou avaria'},LUCAS);
eq('aprovar responde ok', r.body.ok, true);
eq('o saldo e 11 + (-2) = 9: a embalagem e a etiqueta do meio continuam valendo', saldo('BK140140BEGE'), 9);
const mov = db.prepare("SELECT * FROM movimento_estoque WHERE tipo='inventario' AND codigo='BK140140BEGE'").get() || {};
eq('   a linha do livro e `inventario` com delta -2', mov.delta, -2);
eq('   assinada por quem aprovou', mov.aprovado_por, 'Lucas');
ok('   e diz quem contou', /Ana/.test(mov.usuario_nome||'') && /Joao/.test(mov.usuario_nome||''), mov.usuario_nome);
eq('   o item guarda a linha do livro', item('BK140140BEGE').movimento_id, mov.id);
eq('   e o rastro no ajuste_estoque (o historico da aba Estoque)',
   db.prepare("SELECT delta FROM ajuste_estoque WHERE codigo='BK140140BEGE'").get().delta, -2);
eq('o livro fecha em todo SKU', livroFecha().length, 0);

console.log('\n=== 7. A TERCEIRA CONTAGEM DECIDE PELO ACORDO ===\n');

// BK100100CINZA: 1ª = 0 contra 3. A recontagem acha 3 (bateu com o sistema).
bipar('BK100100CINZA', 3, JOAO, 'recontar');
terminar('BK100100CINZA', JOAO, 'recontar');
eq('a recontagem discorda da 1ª: vai para a TERCEIRA', item('BK100100CINZA').status, 'terceira');
r = chamar('GET','/api/inventario/recontagem',{},JOAO);
ok('a terceira nao aparece para quem ja contou', !r.body.itens.some(i => i.codigo==='BK100100CINZA'));
r = chamar('POST','/api/inventario/recontar',{codigo:'BK100100CINZA'},ANA);
eq('nem para a Ana, da 1ª', r.status, 403);
bipar('BK100100CINZA', 3, BIA, 'recontar');
terminar('BK100100CINZA', BIA, 'recontar');
eq('a terceira concorda com a 2ª em ZERO: o sistema estava certo, confirmado', item('BK100100CINZA').status, 'confirmado');
eq('   e o saldo nao andou', saldo('BK100100CINZA'), 3);

console.log('\n=== 8. REJEITAR NAO APAGA ===\n');

const bb = (chamar('GET','/api/inventario/aprovacao',{},ANA).body.itens.find(i => i.codigo==='BK120120BEGE')) || {};
r = chamar('POST','/api/inventario/rejeitar',{id:bb.id, motivo:'Contagem anterior errada'},ANA);
eq('a Ana (que nao contou este) rejeita', r.body.ok, true);
const rej = db.prepare("SELECT * FROM inventario_item WHERE codigo='BK120120BEGE' ORDER BY id").all();
eq('o item rejeitado continua la', rej[0].status, 'rejeitado');
eq('   com o motivo', rej[0].motivo, 'Contagem anterior errada');
eq('   e nasceu um item novo, a contar do zero', rej[1] && rej[1].status, 'a_contar');
eq('   que aponta para o rejeitado', rej[1] && rej[1].anterior_id, rej[0].id);
eq('   e o saldo nao andou', saldo('BK120120BEGE'), 6);

console.log('\n=== 9. A PRATELEIRA QUE NAO ESTAVA NO PLANO ===\n');

r = chamar('POST','/api/inventario/contar',{codigo:'BK180150BEGE'},ANA);
eq('SKU fora do ciclo entra na conferencia aberta', r.body.ok, true);
eq('   marcado como fora do plano', item('BK180150BEGE').fora_do_plano, 1);
r = chamar('POST','/api/inventario/contar',{codigo:'SOBMEDIDA'},ANA);
eq('sob medida nao se conta: nao tem estoque', r.status, 409);

console.log('\n=== 10. A IDADE DA CONFERENCIA LE O INVENTARIO ===\n');

const INV = require('./inventario_dominio');
const conf = INV.conferencias(db);
ok('confirmado conta como conferencia', !!conf.BK160160CINZA);
ok('aprovado conta como conferencia', !!conf.BK140140BEGE);
ok('rejeitado NAO conta', !conf.BK120120BEGE);
ok('a sugestao nao repete o que foi conferido HOJE', !INV.sugestao(db, 50).some(s => s.codigo === 'BK160160CINZA'));
ok('e a sugestao seguinte nao repete o que esta num item aberto',
   !INV.sugestao(db, 50).some(s => s.codigo === 'BK120120BEGE'));

console.log('\n=== 11. PERMISSAO: TERMINAR PEDE A CHAVE DA RODADA ===\n');

PERMS[5] = new Set(['contagem.contar']);    // conta mas nao reconta
const CARLA = {id:5, nome:'Carla'};
bipar('BK180150BEGE', 0, CARLA);
r = terminar('BK180150BEGE', CARLA, 'recontar');
eq('sem contagem.recontar, terminar uma recontagem e recusado', r.status, 403);

console.log('\n=== 12. O CICLO SE ENCERRA ===\n');

const ciclo = db.prepare('SELECT id FROM inventario_ciclo ORDER BY id LIMIT 1').get().id;
r = chamar('POST','/api/inventario/encerrar',{ciclo_id:ciclo},LUCAS);
ok('encerrar tira o que ninguem contou', r.body.nao_contados >= 1, JSON.stringify(r.body));
eq('e fecha o ciclo quando nada mais anda', db.prepare('SELECT status FROM inventario_ciclo WHERE id=?').get(ciclo).status, 'fechado');
eq('o livro fecha no fim de tudo', livroFecha().length, 0);

console.log('\n' + (falhas ? 'FALHARAM ' + falhas + ' de ' + n : 'TODOS OS ' + n + ' CASOS PASSARAM') + '\n');
db.close(); fs.rmSync(tmp, {recursive:true, force:true});
process.exit(falhas ? 1 : 0);
