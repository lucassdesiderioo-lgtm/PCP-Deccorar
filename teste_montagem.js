#!/usr/bin/env node
/* teste_montagem.js — a EMBALAGEM, que e a porta de entrada do estoque.
 *
 *   node teste_montagem.js
 *
 * O QUE ORIGINOU ESTES TESTES (divida 14 do §14, fechada em 17/09/2026). Esta
 * era a rota menos protegida do sistema, e e a que a operacao usa dezenas de
 * vezes por dia:
 *
 *  1. QUATRO ESCRITAS, NENHUMA EM TRANSACAO (montagem, fila, skus, producao).
 *     Com better-sqlite3 cada statement auto-commita sozinho, entao falha no
 *     meio deixava estado impossivel: peca fora da fila e fora do estoque (a
 *     persiana existe na prateleira e em lugar nenhum do sistema), ou estoque
 *     +1 com a ordem do dia ainda pedindo a peca — e ai o operador produz de
 *     novo.
 *
 *  2. SKU NAO CADASTRADO ERA ACEITO. O `UPDATE skus` pegava 0 linhas em
 *     silencio e a resposta era {ok:true, estoque:0}: a peca sumia. Era a UNICA
 *     rota do fluxo que gravava sem conferir o cadastro — /api/revisao,
 *     /api/devolucao e /api/embalar sempre conferiram.
 *
 *  3. O BLOQUEIO DO KIT EXISTIA SO NA TELA. `kit_ok` vinha do corpo com
 *     default 1 e nao era conferido; o "⚠ FALTOU O KIT" era um `if` do
 *     navegador. Quem chamasse a rota por fora embalava sem kit — e kit
 *     esquecido e motivo de devolucao recorrente (§4).
 *
 *  4. DIVIDA 1c: a fila era consumida sem olhar `teste`, entao a embalagem em
 *     MODO TESTE comia a linha REAL da bancada, que ficava presa em 'embalado'
 *     e sumia quando os testes fossem apagados.
 *
 *  5. §2.4: o `kit_codigo` aceitava o codigo de uma persiana. A partir dali
 *     aquele SKU ficava INEMBALAVEL PARA SEMPRE — o `if(KIT && code===KIT)` da
 *     tela roda antes da busca de SKU, e todo bipe dele respondia "Bipe o SKU
 *     primeiro". Ninguem associaria isso a uma edicao no Admin.
 *
 * ⚠️ DESDE 21/11/2026 A PERSIANA SO EMBALA SE VEIO DA REVISAO (R-EMB-02,
 * secao 10): sem linha na fila e 409. Kit, acessorio e sob medida (modelo sem
 * medida) embalam sem fila, como antes. Tirar da fila uma peca que existe
 * passou a ter consequencia: ela precisa ser revisada de novo.
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-mont-'));
const db = new Database(path.join(tmp, 't.db'));
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0);
  CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT,
    modo TEXT DEFAULT 'hoje', situacao TEXT DEFAULT 'aguardando',
    revisado_em TEXT DEFAULT (datetime('now','localtime')), embalado_em TEXT,
    data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
  CREATE TABLE producao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, qtd INTEGER,
    produzido INTEGER DEFAULT 0, data TEXT DEFAULT (date('now','localtime')),
    origem TEXT DEFAULT 'manual', urgente INTEGER DEFAULT 0, teste INTEGER DEFAULT 0);
  INSERT INTO skus (codigo,estoque) VALUES ('BK140140BEGE',0),('BK160160CINZA',5);
`);

const rotas = {};
const app = { locals:{}, get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; },
              delete(p,h){ rotas['DELETE '+p]=h; } };
const auditoria = [];
app.locals.acesso = { auditar(req,cat,acao,alvo,detalhe){ auditoria.push({cat,acao,alvo,detalhe}); } };
/* O livro de movimentos de pe (fase 1, 21/09/2026). Em producao quem chama
   isto e o `db.js`; aqui, que sobe sem ele, o teste chama — e a abertura
   carimba o saldo semeado como linha inicial, igual ao deploy. */
require('./estoque_dominio').garantirSchema(db);
require('./mont_route')(app, db);

function chamar(metodo, rota, corpo, usuario){
  const h = rotas[metodo+' '+rota];
  if(!h) throw new Error('rota nao registrada: '+metodo+' '+rota);
  const out = { status:200, body:null };
  const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; return res; },
                send(b){ out.body=b; return res; } };
  h({ body: corpo||{}, params:{}, headers:{}, usuario: usuario===undefined ? {id:1,nome:'Bancada'} : usuario }, res);
  return out;
}
const estoqueDe = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
const nMontagem = () => db.prepare('SELECT COUNT(*) c FROM montagem').get().c;
const cfgSet = (k,v) => db.prepare("INSERT INTO config (chave,valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run(k,v);
const filaSit = id => db.prepare('SELECT situacao FROM fila WHERE id=?').get(id).situacao;
const novaFila = (cod,modo,teste) => db.prepare("INSERT INTO fila (codigo,modo,teste) VALUES (?,?,?)").run(cod,modo,teste||0).lastInsertRowid;

/* O MINIMO DE 45 s (EMBALAGEM-TEMPO-MINIMO, 21/11/2026) nasce no boot da rota.
   As secoes 1 a 8 nao sao sobre tempo: o minimo fica em 0 ate a secao 9. */
const minimoNoBoot = (db.prepare("SELECT valor FROM config WHERE chave='emb_minimo_seg'").get()||{}).valor;
cfgSet('emb_minimo_seg','0');
cfgSet('kit_codigo','KITENVIO2026');

console.log('\n── 1. o SKU tem que existir (era a unica rota do fluxo que nao conferia) ──');
let antes = nMontagem();
let r = chamar('POST','/api/montagem',{codigo:'NAOEXISTE', kit_ok:1});
eq('SKU fora do cadastro → 404', r.status, 404);
ok('a mensagem diz o codigo', /NAOEXISTE/.test((r.body&&r.body.erro)||''), JSON.stringify(r.body));
eq('e NADA foi gravado em montagem (antes respondia ok:true e a peca sumia)', nMontagem(), antes);

console.log('\n── 2. o kit (o bloqueio saiu da tela e virou trava de servidor) ──');
/* Desde 21/11/2026 a persiana so embala vindo da revisao (secao 10): a peca
   entra na fila antes, para a chamada chegar ao kit. */
novaFila('BK140140BEGE','estoque'); novaFila('BK140140BEGE','estoque');
antes = nMontagem();
r = chamar('POST','/api/montagem',{codigo:'BK140140BEGE', kit_ok:0});
eq('kit_ok falso → 400', r.status, 400);
ok('a recusa e a mesma frase da bancada', /FALTOU O KIT/.test((r.body&&r.body.erro)||''), JSON.stringify(r.body));
eq('e nada foi gravado', nMontagem(), antes);
eq('e o estoque NAO subiu (antes gravava kit_ok=0 e somava +1 assim mesmo)', estoqueDe('BK140140BEGE'), 0);

r = chamar('POST','/api/montagem',{codigo:'BK140140BEGE', kit_ok:1, kit_codigo:'OUTRACOISA'});
eq('codigo de kit que nao bate → 400', r.status, 400);
eq('e o estoque nao subiu', estoqueDe('BK140140BEGE'), 0);

r = chamar('POST','/api/montagem',{codigo:'BK140140BEGE', kit_ok:1, kit_codigo:'kitenvio2026'});
eq('o codigo certo passa (a regua ignora caixa e simbolos, como a tela)', r.status, 200);
eq('e o estoque subiu 1', estoqueDe('BK140140BEGE'), 1);

/* DECIDIDO EM 17/09/2026: conferir SO QUANDO VIER. Exigir o codigo travaria o
   tablet que estiver com a pagina em cache — trava que dispara no caso normal
   vira desvio (armadilha #6). O passo de exigir espera o refresh nos tablets. */
r = chamar('POST','/api/montagem',{codigo:'BK140140BEGE', kit_ok:1});
eq('sem o campo, a chamada passa (tablet com pagina velha nao trava)', r.status, 200);
eq('e soma normalmente', estoqueDe('BK140140BEGE'), 2);

console.log('\n── 3. a fila, e o que NAO e bug (§4) ──');
const fHoje = novaFila('BK160160CINZA','hoje');
db.prepare("INSERT INTO producao (codigo,qtd,produzido) VALUES ('BK160160CINZA',3,0)").run();
r = chamar('POST','/api/montagem',{codigo:'BK160160CINZA', kit_ok:1});
eq('a linha da fila e consumida', filaSit(fHoje), 'embalado');
eq('o estoque sobe', estoqueDe('BK160160CINZA'), 6);
eq('fila modo "hoje" ABATE a ordem do dia', db.prepare("SELECT produzido FROM producao WHERE codigo='BK160160CINZA'").get().produzido, 1);
eq('e a resposta diz que abateu', r.body.abatido, true);

const fEst = novaFila('BK160160CINZA','estoque');
r = chamar('POST','/api/montagem',{codigo:'BK160160CINZA', kit_ok:1});
eq('fila modo "estoque" NAO abate a ordem (armadilha #20)', db.prepare("SELECT produzido FROM producao WHERE codigo='BK160160CINZA'").get().produzido, 1);
eq('mas vira estoque igual', estoqueDe('BK160160CINZA'), 7);
eq('e a linha saiu da fila', filaSit(fEst), 'embalado');

/* ⚠️ DESDE 21/11/2026 A PERSIANA SO EMBALA SE VEIO DA REVISAO (R-EMB-02,
   decisao do dono; spec EMBALAGEM-SO-DA-REVISAO). Ate ali embalar sem fila
   somava +1 — e foi assim que uma persiana nao revisada entrou no estoque. */
r = chamar('POST','/api/montagem',{codigo:'BK160160CINZA', kit_ok:1});
eq('SEM fila, a persiana e recusada (409)', r.status, 409);
eq('e o estoque NAO sobe', estoqueDe('BK160160CINZA'), 7);
eq('a ordem do dia nao anda', db.prepare("SELECT produzido FROM producao WHERE codigo='BK160160CINZA'").get().produzido, 1);

console.log('\n── 4. as quatro escritas sao UMA transacao ──');
console.log('     (o erro de SQL que aparece abaixo E O CASO: e o log que nao existia)');
db.exec('ALTER TABLE producao RENAME TO producao_guardada');
const fQuebra = novaFila('BK160160CINZA','hoje');
const estAntes = estoqueDe('BK160160CINZA'); antes = nMontagem();
r = chamar('POST','/api/montagem',{codigo:'BK160160CINZA', kit_ok:1});
eq('quebra no meio → 500, e nao mais ok:true', r.status, 500);
eq('o estoque NAO andou', estoqueDe('BK160160CINZA'), estAntes);
eq('a linha da fila continua aguardando (a peca nao sumiu da bancada)', filaSit(fQuebra), 'aguardando');
eq('e nao sobrou linha em montagem', nMontagem(), antes);
db.exec('ALTER TABLE producao_guardada RENAME TO producao');

console.log('\n── 5. divida 1c: modo teste nao come a fila REAL ──');
const fReal = novaFila('BK140140BEGE','hoje',0);
cfgSet('modo_teste','1');
r = chamar('POST','/api/montagem',{codigo:'BK140140BEGE', kit_ok:1});
eq('em modo teste, so com a linha REAL na fila, a persiana e recusada (409)', r.status, 409);
eq('e a linha real NAO e consumida', filaSit(fReal), 'aguardando');
eq('a recusa e a da revisao: a fila de teste esta vazia', r.body && r.body.motivo, 'sem_revisao');
const fTeste = novaFila('BK140140BEGE','hoje',1);
r = chamar('POST','/api/montagem',{codigo:'BK140140BEGE', kit_ok:1});
eq('a linha de TESTE, essa sim, e consumida', filaSit(fTeste), 'embalado');
eq('e a real continua intacta', filaSit(fReal), 'aguardando');
cfgSet('modo_teste','0');
r = chamar('POST','/api/montagem',{codigo:'BK140140BEGE', kit_ok:1});
eq('fora do modo teste, a linha real volta a ser consumida', filaSit(fReal), 'embalado');

console.log('\n── 6. §2.4: o codigo do kit nao pode ser um SKU de persiana ──');
r = chamar('POST','/api/config/kit',{kit:'BK160160CINZA', confirmar:true});
eq('gravar um SKU cadastrado como codigo do kit → 400', r.status, 400);
ok('a mensagem explica o estrago', /inembal|persiana|SKU/i.test((r.body&&r.body.erro)||''), JSON.stringify(r.body));
eq('e o codigo do kit continua o que era', db.prepare("SELECT valor FROM config WHERE chave='kit_codigo'").get().valor, 'KITENVIO2026');
r = chamar('POST','/api/config/kit',{kit:'KITNOVO2027', confirmar:true});
eq('codigo que nao e SKU continua gravando normalmente', r.status, 200);
eq('gravou', db.prepare("SELECT valor FROM config WHERE chave='kit_codigo'").get().valor, 'KITNOVO2027');
r = chamar('POST','/api/config/kit',{kit:'OUTRO'});
eq('e a trava do `confirmar` (R8) continua de pe', r.status, 409);

console.log('\n── 6-B. QUEM EMBALOU fica gravado (fase 4 da ACESSOS-UNIFICADOS, divida 9) ──');
{
  const ult = db.prepare('SELECT * FROM montagem ORDER BY id DESC LIMIT 1').get();
  ok('a ultima embalagem existe', !!ult);
  if(ult){
    eq('grava o id de quem embalou', ult.usuario_id, 1);
    eq('e o nome, como retrato', ult.usuario_nome, 'Bancada');
  }
}

console.log('\n── 6-C. sem login nao embala (QUEM-FEZ-E-REVISAO fase 2, 04/11/2026) ──');
/* A regra-mae da spec (§2.3): acao de operacao sem login nao grava. A
   embalagem ja gravava quem fez, mas lia `req.usuario` direto e, sem ele,
   gravava a linha e o +1 do livro com a pessoa vazia. Quem responde agora e o
   `quem.js` — o mesmo da revisao. */
{
  const cod = 'BK160160CINZA';
  const fid = novaFila(cod,'hoje');
  db.prepare("INSERT INTO producao (codigo,qtd,produzido) VALUES (?,1,0)").run(cod);
  const foto = () => JSON.stringify({
    montagem: nMontagem(), est: estoqueDe(cod), fila: filaSit(fid),
    livro: db.prepare('SELECT COUNT(*) n FROM movimento_estoque').get().n,
    prod: db.prepare("SELECT SUM(produzido) p FROM producao WHERE codigo=?").get(cod).p });
  const antes = foto();
  const kitAgora = db.prepare("SELECT valor FROM config WHERE chave='kit_codigo'").get().valor;
  const corpo = { codigo:cod, segundos:40, kit_ok:1, kit_codigo:kitAgora };
  let r = chamar('POST','/api/montagem',corpo,null);
  eq('sem login leva 401', r.status, 401);
  ok('e a recusa diz para entrar com o PIN', /PIN/.test(r.body && r.body.erro || ''), JSON.stringify(r.body));
  eq('nada mudou: embalagem, saldo, fila, livro e ordem do dia', foto(), antes);
  eq('usuario sem id tambem leva 401', chamar('POST','/api/montagem',corpo,{nome:'Fulano'}).status, 401);
  eq('e continua sem mudar nada', foto(), antes);
  /* O 401 vem antes de olhar o cadastro: quem nao esta logado nao descobre
     se um SKU existe, nem se o kit bate. */
  eq('SKU que nao existe, sem login, e 401 e nao 404',
     chamar('POST','/api/montagem',{codigo:'NAOEXISTE', segundos:40, kit_ok:1},null).status, 401);
  eq('kit faltando, sem login, e 401 e nao 400',
     chamar('POST','/api/montagem',{codigo:cod, segundos:40, kit_ok:0},null).status, 401);

  r = chamar('POST','/api/montagem',corpo,{id:7,nome:'Carla'});
  eq('logada, a Carla embala', r.status, 200);
  const m = db.prepare('SELECT * FROM montagem ORDER BY id DESC LIMIT 1').get();
  eq('a embalagem e da Carla (id)', m.usuario_id, 7);
  eq('e o nome dela, como retrato', m.usuario_nome, 'Carla');
  const mv = db.prepare("SELECT * FROM movimento_estoque WHERE referencia=?").get('montagem:'+m.id);
  ok('o +1 entrou no livro', !!mv && mv.delta === 1, JSON.stringify(mv));
  eq('e a linha do livro diz que foi a Carla (id)', mv && mv.usuario_id, 7);
  eq('e o nome dela', mv && mv.usuario_nome, 'Carla');
}

console.log('\n── 7. o que ja valia continua valendo ──');
r = chamar('POST','/api/montagem',{});
eq('sem codigo → 400', r.status, 400);
r = chamar('GET','/api/montagem/hoje');
ok('o resumo do dia continua respondendo', Array.isArray(r.body));
r = chamar('GET','/api/fila');
ok('a fila continua respondendo', Array.isArray(r.body));

console.log('\n── 8. sob medida NÃO soma na embalagem (R-EST-05, CONSERTO de 04/11/2026) ──');
/* Achado pelo teste_regras_estoque.js: a embalagem somava +1 para QUALQUER
   SKU, e a Conferencia nao baixa sob medida (§7) — cada SOBMEDIDA embalado
   deixava o saldo dele 1 acima, para sempre. A embalagem continua sendo
   registrada (montagem, fila, ordem do dia); so o saldo nao anda. */
db.exec(`CREATE TABLE IF NOT EXISTS modelo (id INTEGER PRIMARY KEY, nome TEXT, sob_medida INTEGER DEFAULT 0);
  INSERT INTO modelo (id,nome,sob_medida) VALUES (91,'Rolô',0),(92,'Sob medida',1);`);
try{ db.exec('ALTER TABLE skus ADD COLUMN modelo_id INTEGER'); }catch(e){}
db.prepare("INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('SOBMEDIDA',0,92),('BK100100BEGE',0,91)").run();
{
  const movs = c => db.prepare('SELECT COUNT(*) n FROM movimento_estoque WHERE codigo=?').get(c).n;
  const ant = db.prepare('SELECT COUNT(*) n FROM montagem').get().n;
  novaFila('SOBMEDIDA','hoje'); novaFila('BK100100BEGE','hoje');
  let r8 = chamar('POST','/api/montagem',{codigo:'SOBMEDIDA', kit_ok:1});
  eq('a embalagem do sob medida responde ok', r8.status, 200);
  eq('o saldo do sob medida continua zero', db.prepare("SELECT estoque FROM skus WHERE codigo='SOBMEDIDA'").get().estoque, 0);
  eq('   e nenhuma linha no livro', movs('SOBMEDIDA'), 0);
  eq('   mas a embalagem fica registrada', db.prepare('SELECT COUNT(*) n FROM montagem').get().n, ant + 1);
  r8 = chamar('POST','/api/montagem',{codigo:'BK100100BEGE', kit_ok:1});
  eq('o SKU de modelo comum continua somando +1', db.prepare("SELECT estoque FROM skus WHERE codigo='BK100100BEGE'").get().estoque, 1);
  eq('   com a linha de embalagem no livro', movs('BK100100BEGE'), 1);
}

console.log('\n── 9. o tempo minimo da embalagem (EMBALAGEM-TEMPO-MINIMO, 21/11/2026) ──');
/* Decisao do dono: o bipe que fecha a embalagem com menos de 45 s desde o
   primeiro e RECUSADO, como a revisao abaixo de 15 s (R-REV-07). Nada grava —
   nem a embalagem, nem o +1, nem a fila, nem a ordem do dia — e a embalagem
   continua aberta na tela. A trava e do servidor. */
eq('o boot semeia o minimo de 45 s no config', minimoNoBoot, '45');
cfgSet('emb_minimo_seg','45');
{
  db.prepare("INSERT INTO skus (codigo,estoque) VALUES ('BK130130TEMPO',3)").run();
  const fid = novaFila('BK130130TEMPO','hoje');
  db.prepare("INSERT INTO producao (codigo,qtd) VALUES ('BK130130TEMPO',1)").run();
  const prod = () => db.prepare("SELECT produzido FROM producao WHERE codigo='BK130130TEMPO'").get().produzido;
  const movs = () => db.prepare("SELECT COUNT(*) n FROM movimento_estoque WHERE codigo='BK130130TEMPO'").get().n;
  const evs = () => db.prepare("SELECT * FROM montagem_evento WHERE codigo='BK130130TEMPO' ORDER BY id").all();
  const antesM = nMontagem(), antesMov = movs();

  let r9 = chamar('POST','/api/montagem',{codigo:'BK130130TEMPO', kit_ok:1, segundos:44});
  eq('44 s → 409', r9.status, 409);
  eq('   com o motivo rapido_demais', r9.body && r9.body.motivo, 'rapido_demais');
  eq('   devolvendo o minimo que vale', r9.body && r9.body.minimo, 45);
  eq('   e os segundos lidos', r9.body && r9.body.segundos, 44);
  /* ③ REVISAO (achado 1, confirmado no navegador): a frase do servidor e o que
     o tablet com a PAGINA ANTIGA em cache mostra — e la a embalagem ja foi
     descartada. "A embalagem continua... bipe o SKU de novo" fazia abrir uma
     embalagem nova sem kit, e a peca ia para o saco sem o +1. A frase tem que
     valer nas duas paginas. */
  ok('   a frase diz que NADA foi gravado e manda refazer SKU, kit e SKU',
     /não foi gravada/i.test((r9.body&&r9.body.erro)||'') && /bipe o SKU agora/.test((r9.body&&r9.body.erro)||'')
     && /espere 45 s antes de bipar o kit e o SKU/.test((r9.body&&r9.body.erro)||'')
     && !/embalagem continua/i.test((r9.body&&r9.body.erro)||''), JSON.stringify(r9.body));
  eq('   NADA em montagem', nMontagem(), antesM);
  eq('   o estoque NAO subiu', estoqueDe('BK130130TEMPO'), 3);
  eq('   nenhuma linha no livro', movs(), antesMov);
  eq('   a peca continua na fila', filaSit(fid), 'aguardando');
  eq('   a ordem do dia nao andou', prod(), 0);
  const e1 = evs();
  eq('   a recusa fica registrada (montagem_evento)', e1.length, 1);
  ok('   com o tipo, os segundos e quem fez', e1[0] && e1[0].tipo==='rapido_demais' && e1[0].segundos===44
     && e1[0].usuario_id===1 && e1[0].usuario_nome==='Bancada', JSON.stringify(e1[0]));

  r9 = chamar('POST','/api/montagem',{codigo:'BK130130TEMPO', kit_ok:1});
  eq('sem segundos no corpo (vale 0) → 409', r9.status, 409);
  r9 = chamar('POST','/api/montagem',{codigo:'BK130130TEMPO', kit_ok:1, segundos:'abc'});
  eq('segundos que nao e numero → 409', r9.status, 409);
  eq('   e o estoque continua 3', estoqueDe('BK130130TEMPO'), 3);

  r9 = chamar('POST','/api/montagem',{codigo:'BK130130TEMPO', kit_ok:0, segundos:10});
  eq('sem o kit, a frase do kit vem antes da do tempo (400)', r9.status, 400);
  r9 = chamar('POST','/api/montagem',{codigo:'BK130130TEMPO', kit_ok:1, segundos:10}, null);
  eq('sem login → 401, antes do tempo', r9.status, 401);

  cfgSet('emb_minimo_seg','60');
  r9 = chamar('POST','/api/montagem',{codigo:'BK130130TEMPO', kit_ok:1, segundos:50});
  eq('o minimo vem do config: com 60, 50 s → 409', r9.status, 409);
  eq('   devolvendo 60', r9.body && r9.body.minimo, 60);
  cfgSet('emb_minimo_seg','45');

  r9 = chamar('POST','/api/montagem',{codigo:'BK130130TEMPO', kit_ok:1, segundos:45});
  eq('45 s exatos → 200', r9.status, 200);
  eq('   o estoque sobe +1', estoqueDe('BK130130TEMPO'), 4);
  eq('   a fila foi consumida', filaSit(fid), 'embalado');
  eq('   a ordem do dia andou', prod(), 1);
  eq('   e a embalagem aceita nao vira evento', evs().length, 4);

  const tr = fs.readFileSync(path.join(__dirname,'teste_route.js'),'utf8');
  ok('montagem_evento esta nas TABELAS do modo teste', /nome:'montagem_evento'/.test(tr));
  const tela = fs.readFileSync(path.join(__dirname,'public','montagem.html'),'utf8');
  ok('a tela trata a recusa rapido_demais', /rapido_demais/.test(tela));
  /* ③ REVISAO (achado 2, confirmado no navegador): o bipe durante a resposta
     abria uma embalagem nova escondida, e o aviso da recusa apagava o desenho
     dela. A embalagem fica de pe ate a resposta, e o bipe nesse meio e ignorado. */
  const fin = tela.slice(tela.indexOf('async function finish()'));
  ok('a embalagem NAO e zerada antes da resposta do servidor',
     fin.indexOf("fetch('/api/montagem'") > 0 && fin.indexOf('emb=null') > fin.indexOf("fetch('/api/montagem'"));
  ok('o bipe com o envio no ar e ignorado (emb.enviando)', /emb\s*&&\s*emb\.enviando/.test(tela));
  ok('nao existe mais o aviso que apagava a embalagem nova', !/A embalagem de '\+cur\.codigo\+' NÃO foi gravada/.test(tela));
  ok('na recusa a tela segue com a mesma embalagem e nao decide sozinha',
     /motivo==='rapido_demais'\)\{\s*cur\.enviando=false;\s*rapidoDemais\(cur/.test(tela) && !/seg\s*<\s*EMB_MIN/.test(tela));
  /* ③ REVISAO r2: sem o cur.enviando=false a primeira recusa deixava a
     embalagem presa para sempre (todo bipe ignorado). E o envio tem limite de
     tempo: pendurado, cai no "Falha de conexao" em vez de travar a bancada. */
  ok('o envio tem limite de tempo (AbortController)', /AbortController[\s\S]{0,200}abort\(\)/.test(fin) && /signal:/.test(fin));
  /* ③ REVISAO r3: o limite cobre tambem a leitura da resposta, e e cancelado
     depois dela — sem o clearTimeout, o abort dispararia 20 s depois de toda
     embalagem que deu certo. E a falha de conexao avisa que a peca PODE ter
     sido gravada (a resposta se perde depois da gravacao, §12): rebipar
     somaria +1 duas vezes. */
  ok('a leitura da resposta fica dentro do limite, e o limite e cancelado',
     /resp\.json\(\);\s*\}\s*finally\{\s*if\(prazo\)\s*clearTimeout\(prazo\);\s*\}/.test(fin));
  const pegaErro = fin.slice(fin.indexOf('}catch(e){'));
  ok('a falha de conexao avisa que pode ter gravado e mostra o contador',
     /pode ter sido gravada/i.test(pegaErro) && /stats\(\)/.test(pegaErro.slice(0, 1200)));
}

console.log('\n── 10. a persiana so embala se veio da revisao (EMBALAGEM-SO-DA-REVISAO, 21/11/2026) ──');
/* Decisao do dono: "a tela de embalagem so pode seguir com alguma embalagem
   vindo da revisao". Vale SO para persiana (modelo com medida): kit,
   acessorio e sob medida nao passam pela Revisao. Sem excecao: a peca que
   sumiu da fila e revisada de novo. */
{
  cfgSet('emb_minimo_seg','0');
  try{ db.exec('ALTER TABLE modelo ADD COLUMN exige_medida INTEGER DEFAULT 1'); }catch(e){}
  db.exec("UPDATE modelo SET exige_medida=0 WHERE id=92");
  db.exec("INSERT INTO modelo (id,nome,sob_medida,exige_medida) VALUES (93,'Acessório',0,0)");
  db.prepare("INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('BK150150REV',0,91),('BK170170SEMMOD',0,NULL),('KIT32',0,93)").run();
  const kit = db.prepare("SELECT valor FROM config WHERE chave='kit_codigo'").get().valor;
  const corpo = c => ({codigo:c, segundos:60, kit_ok:1, kit_codigo:kit});
  const livro = () => db.prepare('SELECT COUNT(*) n FROM movimento_estoque').get().n;
  const ev0 = db.prepare("SELECT COALESCE(MAX(id),0) m FROM montagem_evento").get().m;
  const evs = () => db.prepare("SELECT * FROM montagem_evento WHERE tipo='sem_revisao' AND id>? ORDER BY id").all(ev0);
  db.prepare("INSERT INTO producao (codigo,qtd,produzido) VALUES ('BK150150REV',2,0)").run();
  const prod = () => db.prepare("SELECT SUM(produzido) p FROM producao WHERE codigo='BK150150REV'").get().p;

  const foto = () => JSON.stringify({m:nMontagem(), e:estoqueDe('BK150150REV'), l:livro(), p:prod()});
  let a = foto();
  let r10 = chamar('POST','/api/montagem',corpo('BK150150REV'),{id:5,nome:'Bia'});
  eq('persiana sem fila → 409', r10.status, 409);
  eq('   com o motivo sem_revisao', r10.body && r10.body.motivo, 'sem_revisao');
  ok('   a frase manda levar para a Revisao e diz que nada gravou',
     /Revisão/.test(r10.body&&r10.body.erro||'') && /NADA foi gravado/.test(r10.body&&r10.body.erro||''), JSON.stringify(r10.body));
  eq('   nada mudou: embalagem, saldo, livro e ordem do dia', foto(), a);
  const ev = evs();
  eq('   a recusa vira uma linha em montagem_evento', ev.length, 1);
  eq('   com quem bipou', ev[0] && ev[0].usuario_id, 5);

  const fe = novaFila('BK150150REV','hoje');
  db.prepare("UPDATE fila SET situacao='embalado' WHERE id=?").run(fe);
  eq('linha da fila ja embalada nao conta → 409', chamar('POST','/api/montagem',corpo('BK150150REV')).status, 409);

  /* a ordem: login → SKU → revisao → kit → tempo */
  eq('sem login continua 401 (antes da revisao)', chamar('POST','/api/montagem',corpo('BK150150REV'),null).status, 401);
  eq('SKU que nao existe continua 404', chamar('POST','/api/montagem',corpo('NAOEXISTE2')).status, 404);
  r10 = chamar('POST','/api/montagem',{codigo:'BK150150REV', segundos:60, kit_ok:0});
  eq('sem revisao E sem kit: a recusa e a da revisao', r10.body && r10.body.motivo, 'sem_revisao');
  cfgSet('emb_minimo_seg','45');
  r10 = chamar('POST','/api/montagem',{codigo:'BK150150REV', segundos:10, kit_ok:1, kit_codigo:kit});
  eq('sem revisao E rapido demais: a recusa e a da revisao', r10.body && r10.body.motivo, 'sem_revisao');
  cfgSet('emb_minimo_seg','0');

  const f1 = novaFila('BK150150REV','hoje');
  r10 = chamar('POST','/api/montagem',corpo('BK150150REV'));
  eq('com a peca na fila → 200', r10.status, 200);
  eq('   o estoque sobe +1', estoqueDe('BK150150REV'), 1);
  eq('   a linha da fila e consumida', filaSit(f1), 'embalado');
  eq('   a ordem do dia anda', prod(), 1);
  eq('e a proxima, sem outra linha na fila, e recusada', chamar('POST','/api/montagem',corpo('BK150150REV')).status, 409);

  const fd = novaFila('BK150150REV','devolucao');
  r10 = chamar('POST','/api/montagem',corpo('BK150150REV'));
  eq('a devolucao reembalada (entra pela fila) passa', r10.status, 200);
  eq('   e a linha dela e consumida', filaSit(fd), 'embalado');

  eq('SKU sem modelo conta como persiana → 409', chamar('POST','/api/montagem',corpo('BK170170SEMMOD')).status, 409);
  r10 = chamar('POST','/api/montagem',corpo('KIT32'));
  eq('kit/acessorio (modelo sem medida) embala sem fila', r10.status, 200);
  eq('   e soma +1', estoqueDe('KIT32'), 1);
  eq('sob medida (modelo sem medida) embala sem fila', chamar('POST','/api/montagem',corpo('SOBMEDIDA')).status, 200);
  eq('e o kit nao vira evento de recusa', evs().length, 6);

  /* ③ REVISAO: a trava perguntava em maiuscula e a transacao consumia com
     comparacao exata — uma linha em minuscula autorizava +1 para sempre. */
  db.prepare("INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('BK190190MIN',0,91)").run();
  const fmin = db.prepare("INSERT INTO fila (codigo,modo) VALUES ('bk190190min','estoque')").run().lastInsertRowid;
  eq('linha da fila em minuscula: a primeira embala', chamar('POST','/api/montagem',corpo('BK190190MIN')).status, 200);
  eq('   e a linha e consumida', filaSit(fmin), 'embalado');
  eq('   e a segunda, sem outra linha, e recusada', chamar('POST','/api/montagem',corpo('BK190190MIN')).status, 409);
  eq('   o estoque subiu so 1', estoqueDe('BK190190MIN'), 1);

  const tela = fs.readFileSync(path.join(__dirname,'public','montagem.html'),'utf8');
  ok('a tela trata a recusa sem_revisao', /sem_revisao/.test(tela));
  ok('no 1o bipe a tela confere a fila (e pergunta de novo antes de recusar)',
     /async function conferirRevisao/.test(tela) && /conferirRevisao[\s\S]{0,600}await carregarFila\(\)/.test(tela));
  ok('sem conexao a tela diz "Sem conexão", e nao "Não passou pela Revisão" (③)',
     /if\(!leu\)\{\s*banner\('err','Sem conexão'/.test(tela) && /catch\(e\)\{ return false; \}/.test(tela));
  ok('a regra da tela e a mesma do servidor: so persiana (exige_medida)', /exige_medida===0\) return false/.test(tela));
}

console.log('\n────────────────────────────────────────────');
console.log(falhas ? '  ' + falhas + ' de ' + n + ' FALHARAM' : '  todos os ' + n + ' casos passaram');
try{ db.close(); fs.rmSync(tmp,{recursive:true,force:true}); }catch(e){}
process.exit(falhas ? 1 : 0);
