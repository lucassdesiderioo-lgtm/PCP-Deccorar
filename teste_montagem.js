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
 * ⚠️ O QUE ESTE ARQUIVO TRAVA E QUE **NAO** E BUG (§4): embalar SEM a peca
 * estar na fila continua somando +1 no estoque, com `modo='estoque'`. A fila
 * nao e obrigatoria para embalar — e e isso que torna o `limpar_fila.js`
 * seguro. Quem "consertar" isso trava a bancada.
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

function chamar(metodo, rota, corpo){
  const h = rotas[metodo+' '+rota];
  if(!h) throw new Error('rota nao registrada: '+metodo+' '+rota);
  const out = { status:200, body:null };
  const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; return res; },
                send(b){ out.body=b; return res; } };
  h({ body: corpo||{}, params:{}, headers:{}, usuario:{id:1,nome:'Bancada'} }, res);
  return out;
}
const estoqueDe = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
const nMontagem = () => db.prepare('SELECT COUNT(*) c FROM montagem').get().c;
const cfgSet = (k,v) => db.prepare("INSERT INTO config (chave,valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run(k,v);
const filaSit = id => db.prepare('SELECT situacao FROM fila WHERE id=?').get(id).situacao;
const novaFila = (cod,modo,teste) => db.prepare("INSERT INTO fila (codigo,modo,teste) VALUES (?,?,?)").run(cod,modo,teste||0).lastInsertRowid;

cfgSet('kit_codigo','KITENVIO2026');

console.log('\n── 1. o SKU tem que existir (era a unica rota do fluxo que nao conferia) ──');
let antes = nMontagem();
let r = chamar('POST','/api/montagem',{codigo:'NAOEXISTE', kit_ok:1});
eq('SKU fora do cadastro → 404', r.status, 404);
ok('a mensagem diz o codigo', /NAOEXISTE/.test((r.body&&r.body.erro)||''), JSON.stringify(r.body));
eq('e NADA foi gravado em montagem (antes respondia ok:true e a peca sumia)', nMontagem(), antes);

console.log('\n── 2. o kit (o bloqueio saiu da tela e virou trava de servidor) ──');
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

/* ⚠️ ISTO E REGRA, NAO BUG (§4): a fila nao e obrigatoria para embalar. E o que
   torna `node limpar_fila.js` seguro — limpar a fila nao pode travar a bancada. */
r = chamar('POST','/api/montagem',{codigo:'BK160160CINZA', kit_ok:1});
eq('SEM fila, embalar continua somando +1 (REGRA do §4, nao conserte)', estoqueDe('BK160160CINZA'), 8);
eq('e a resposta diz que nao havia fila', r.body.naFila, false);
eq('sem fila nao abate ordem: o modo vira "estoque"', db.prepare("SELECT produzido FROM producao WHERE codigo='BK160160CINZA'").get().produzido, 1);

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
eq('em modo teste a embalagem funciona', r.status, 200);
eq('mas NAO consome a linha real da fila', filaSit(fReal), 'aguardando');
eq('e a resposta diz que nao pegou fila', r.body.naFila, false);
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

console.log('\n── 7. o que ja valia continua valendo ──');
r = chamar('POST','/api/montagem',{});
eq('sem codigo → 400', r.status, 400);
r = chamar('GET','/api/montagem/hoje');
ok('o resumo do dia continua respondendo', Array.isArray(r.body));
r = chamar('GET','/api/fila');
ok('a fila continua respondendo', Array.isArray(r.body));

console.log('\n────────────────────────────────────────────');
console.log(falhas ? '  ' + falhas + ' de ' + n + ' FALHARAM' : '  todos os ' + n + ' casos passaram');
try{ db.close(); fs.rmSync(tmp,{recursive:true,force:true}); }catch(e){}
process.exit(falhas ? 1 : 0);
