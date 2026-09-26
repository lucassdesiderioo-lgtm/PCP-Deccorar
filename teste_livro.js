#!/usr/bin/env node
/* teste_livro.js — o LIVRO DE MOVIMENTOS da persiana.
 *
 *   node teste_livro.js
 *
 * Fase 1 da spec ESTOQUE-LIVRO-E-CONFERENCIA (21/09/2026). O saldo tinha SETE
 * donos; aqui se trava que passou a ter um.
 *
 * O CASO QUE VALE MAIS QUE TODOS OS OUTROS e a VARREDURA da secao 9: ela le os
 * `.js` do projeto e RECUSA `UPDATE skus SET estoque` fora do
 * `estoque_dominio.js`. Sem ela, a arrumacao dura ate o proximo modulo — porque
 * modulo novo se escreve copiando o de cima, e o de cima escrevia direto na
 * coluna. E o mesmo desenho do ultimo caso do `teste_caminhos.js`, que varre
 * atras do caminho fixo do servidor escrito em codigo — e que, por ser uma
 * varredura de texto, acusaria este comentario se ele citasse o literal.
 *
 * Sobe um banco temporario e chama os modulos de verdade, com um `app` de
 * mentira que so guarda as rotas. Nao abre porta, nao toca no banco de producao.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
const eq = (desc, achado, esperado) =>
  ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
function recusa(desc, fn, pedaco){
  let erro = null;
  try{ fn(); }catch(e){ erro = e.message || String(e); }
  ok(desc, !!erro && (!pedaco || erro.toLowerCase().indexOf(pedaco.toLowerCase()) >= 0),
     erro ? ('veio: ' + erro) : 'NAO recusou');
}

const ESTOQUE = require('./estoque_dominio');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-livro-'));
const db = new Database(path.join(tmp, 't.db'));

/* Copia consciente do CREATE dos donos de cada tabela: o teste tem que subir
   sem o `db.js`, que aponta para a pasta fixa do servidor (§13). */
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER,
    largura_cm INTEGER, altura_cm INTEGER, cor_codigo TEXT, tecido_codigo TEXT,
    tem_ficha INTEGER DEFAULT 1, custo_direto REAL, ativo INTEGER DEFAULT 1);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, nome TEXT,
    exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
  INSERT INTO modelo (id,codigo,nome,sob_medida) VALUES (1,'ROLO','Rolô',0),(2,'SOBMED','Sob medida',1);
  INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('BK140140BEGE',10,1),('BK160160CINZA',0,1),('SOBMEDIDA',0,2);
  INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('BK120120BEGE',NULL,1);
`);

console.log('\n=== 1. A ABERTURA — a historia comeca, e so uma vez ===\n');

ESTOQUE.garantirSchema(db);
const movs = c => db.prepare('SELECT * FROM movimento_estoque WHERE codigo=? ORDER BY id').all(c);
const saldo = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
const todos = () => db.prepare('SELECT COUNT(*) n FROM movimento_estoque').get().n;

eq('SKU com saldo ganha UMA linha de abertura', movs('BK140140BEGE').length, 1);
eq('   com o saldo daquele momento', movs('BK140140BEGE')[0].delta, 10);
eq('   e o tipo `abertura`', movs('BK140140BEGE')[0].tipo, 'abertura');
eq('SKU zerado NAO ganha linha — delta zero nao e movimento', movs('BK160160CINZA').length, 0);
eq('NULL vira 0 (o buraco por onde o saldo parava de andar)', saldo('BK120120BEGE'), 0);
eq('   e tambem sem linha', movs('BK120120BEGE').length, 0);

const antesDeRepetir = todos();
ESTOQUE.garantirSchema(db);
ESTOQUE.garantirSchema(db);
eq('rodar de novo NAO refaz a abertura — e evento, nao rotina', todos(), antesDeRepetir);

console.log('\n=== 2. O QUE `movimentar` RECUSA ===\n');

recusa('SKU que nao existe', () => ESTOQUE.movimentar(db, {codigo:'NAOEXISTE', delta:1, tipo:'embalagem'}), 'nao cadastrado');
recusa('delta zero', () => ESTOQUE.movimentar(db, {codigo:'BK140140BEGE', delta:0, tipo:'ajuste'}), 'delta invalido');
recusa('delta fracionario — nao existe meia persiana',
       () => ESTOQUE.movimentar(db, {codigo:'BK140140BEGE', delta:1.5, tipo:'ajuste'}), 'delta invalido');
recusa('delta que nao e numero',
       () => ESTOQUE.movimentar(db, {codigo:'BK140140BEGE', delta:'dois', tipo:'ajuste'}), 'delta invalido');
recusa('tipo fora da lista fechada',
       () => ESTOQUE.movimentar(db, {codigo:'BK140140BEGE', delta:1, tipo:'sumiu'}), 'tipo invalido');
recusa('sem SKU nenhum', () => ESTOQUE.movimentar(db, {delta:1, tipo:'ajuste'}), 'sem SKU');
eq('e nenhuma recusa mexeu no saldo', saldo('BK140140BEGE'), 10);

console.log('\n=== 3. O SALDO NEGATIVO FICA NEGATIVO ===\n');

/* O `MAX(0, ...)` dos sete donos apagava justamente o SINAL de que peca saiu
   sem registro. Quem impede o negativo na operacao normal e a trava da Etiqueta
   de Venda, nao um corte escondido na escrita. */
ESTOQUE.movimentar(db, {codigo:'BK160160CINZA', delta:-3, tipo:'etiqueta', referencia:'lote:99'});
eq('saiu mais do que entrou, e o saldo diz isso', saldo('BK160160CINZA'), -3);
eq('   o livro registra o saldo depois', movs('BK160160CINZA')[0].saldo_depois, -3);

console.log('\n=== 4. A SOMA DO LIVRO E O SALDO ===\n');

ESTOQUE.movimentar(db, {codigo:'BK140140BEGE', delta:+1, tipo:'embalagem', referencia:'montagem:1'});
ESTOQUE.movimentar(db, {codigo:'BK140140BEGE', delta:-2, tipo:'etiqueta',  referencia:'lote:1'});
ESTOQUE.movimentar(db, {codigo:'BK140140BEGE', delta:+4, tipo:'inventario', motivo:'Correcao de contagem'});

function somaBate(){
  return db.prepare(`SELECT s.codigo, s.estoque,
      COALESCE((SELECT SUM(delta) FROM movimento_estoque m WHERE m.codigo=s.codigo),0) soma
    FROM skus s`).all().filter(r => (+r.estoque||0) !== r.soma);
}
eq('SUM(delta) = skus.estoque para TODO SKU', somaBate().length, 0);
eq('   e o saldo chegou onde a conta manda (10+1-2+4)', saldo('BK140140BEGE'), 13);

console.log('\n=== 5. QUEM FEZ, E COM QUE REFERENCIA ===\n');

ESTOQUE.movimentar(db, {codigo:'BK140140BEGE', delta:-1, tipo:'ajuste', motivo:'Peca quebrada',
  referencia:'ajuste:7', usuario:{id:3, nome:'Ana'}, aprovado_por:'Lucas'});
const ult = movs('BK140140BEGE').slice(-1)[0];
eq('quem fez', ult.usuario_nome, 'Ana');
eq('   o id', ult.usuario_id, 3);
eq('   quem aprovou', ult.aprovado_por, 'Lucas');
eq('   o motivo', ult.motivo, 'Peca quebrada');
eq('   e o que causou', ult.referencia, 'ajuste:7');

console.log('\n=== 6. O EXTRATO ===\n');

const ex = ESTOQUE.extrato(db, 'BK140140BEGE');
eq('traz o livro do SKU', ex.length, 5);
eq('   do mais novo para o mais velho', ex[0].tipo, 'ajuste');
eq('   e o mais velho e a abertura', ex[ex.length-1].tipo, 'abertura');
eq('so daquele SKU', ESTOQUE.extrato(db, 'BK160160CINZA').length, 1);
eq('SKU sem movimento devolve lista vazia', ESTOQUE.extrato(db, 'BK120120BEGE').length, 0);

console.log('\n=== 7. A TRANSACAO E DE QUEM CHAMA ===\n');

/* A embalagem sao quatro escritas que entram ou nao entram juntas (§4, #26) e a
   etiqueta de uma caixa de pacote sao N baixas que valem como uma (§5, #23).
   Se `movimentar` abrisse transacao propria, a de fora nao poderia desfazer. */
const antesDoRollback = saldo('BK140140BEGE');
try{
  db.transaction(()=>{
    ESTOQUE.movimentar(db, {codigo:'BK140140BEGE', delta:+5, tipo:'embalagem'});
    throw new Error('falhou no meio');
  })();
}catch(e){}
eq('o rollback de quem chama desfaz o movimento', saldo('BK140140BEGE'), antesDoRollback);
eq('   e a linha do livro tambem', movs('BK140140BEGE').length, 5);

console.log('\n=== 8. SOB MEDIDA NAO TEM MOVIMENTO ===\n');

/* Isto NAO e trava do dominio — e regra de quem chama (§7). O dominio move
   qualquer SKU cadastrado; quem nao chama para sob medida e a embalagem e a
   etiqueta. O caso existe para dizer onde a regra mora. */
eq('sob medida comeca e continua em zero', saldo('SOBMEDIDA'), 0);
eq('   e sem linha nenhuma no livro', movs('SOBMEDIDA').length, 0);

console.log('\n=== 9. O FLUXO REAL — a soma tem que bater DEPOIS de tudo ===\n');

/* ⚠️ ESTA E A SECAO QUE VALE, e as oito de cima sao a preparacao dela. Testar o
   dominio isolado prova que `movimentar` faz a conta; nao prova que a fabrica
   passou a usar `movimentar`. Aqui sobem os modulos DE VERDADE — a embalagem, a
   etiqueta e o modo teste — e a pergunta e sempre a mesma:
   `SUM(delta) = skus.estoque` para todo SKU.

   E a regra 8 da spec (§3.3.8): se alguem escrever no saldo por fora, isto
   quebra. A varredura da secao 10 pega quem escreve; esta pega quem MOVE sem
   escrever no livro — sao dois buracos diferentes. */
const Database2 = Database;
const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-livro-fluxo-'));
const d2 = new Database2(path.join(tmp2, 't.db'));
d2.exec(`
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT,
    exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
  CREATE TABLE cor (codigo TEXT PRIMARY KEY, nome TEXT);
  CREATE TABLE tecido (codigo TEXT PRIMARY KEY, nome TEXT);
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER,
    largura_cm INTEGER, altura_cm INTEGER, cor_codigo TEXT, tecido_codigo TEXT);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, cor TEXT, buyer TEXT,
    city TEXT, nf TEXT, packId TEXT, venda TEXT, estagio TEXT DEFAULT 'pendente',
    embalado_em TEXT, data TEXT DEFAULT (date('now','localtime')), despachar_em TEXT,
    modalidade TEXT, reimpressoes INTEGER DEFAULT 0, reimpresso_em TEXT, teste INTEGER DEFAULT 0,
    impresso_por TEXT);
  CREATE TABLE lote_item (id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER NOT NULL,
    codigo TEXT, qtd INTEGER DEFAULT 1, cor TEXT, descricao TEXT, origem TEXT DEFAULT 'folha',
    conferido_em TEXT, conferido_por TEXT, teste INTEGER DEFAULT 0, conferidos INTEGER DEFAULT 0);
  CREATE TABLE montagem (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, inicio TEXT, fim TEXT,
    segundos INTEGER, kit_ok INTEGER DEFAULT 1, data TEXT DEFAULT (date('now','localtime')),
    criado_em TEXT DEFAULT (datetime('now','localtime')), teste INTEGER DEFAULT 0);
  CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, modo TEXT DEFAULT 'hoje',
    situacao TEXT DEFAULT 'aguardando', revisado_em TEXT DEFAULT (datetime('now','localtime')),
    embalado_em TEXT, data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
  CREATE TABLE producao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, qtd INTEGER,
    produzido INTEGER DEFAULT 0, data TEXT DEFAULT (date('now','localtime')),
    origem TEXT DEFAULT 'manual', urgente INTEGER DEFAULT 0, teste INTEGER DEFAULT 0);
  CREATE TABLE revisao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, modo TEXT, teste INTEGER DEFAULT 0);
  CREATE TABLE devolucao (id INTEGER PRIMARY KEY AUTOINCREMENT, teste INTEGER DEFAULT 0);
  CREATE TABLE rejeicao (id INTEGER PRIMARY KEY AUTOINCREMENT, teste INTEGER DEFAULT 0);
  CREATE TABLE contagem (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, teste INTEGER DEFAULT 0);
  CREATE TABLE contagem_pendente (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, teste INTEGER DEFAULT 0);
  CREATE TABLE ajuste_estoque (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, teste INTEGER DEFAULT 0);
  CREATE TABLE movimento_componente (id INTEGER PRIMARY KEY AUTOINCREMENT, teste INTEGER DEFAULT 0);
  CREATE TABLE componente (id INTEGER PRIMARY KEY AUTOINCREMENT, estoque REAL DEFAULT 0, custo_medio REAL DEFAULT 0);
  INSERT INTO modelo (id,codigo,nome,sob_medida) VALUES (1,'ROLO','Rolô',0),(2,'SOBMED','Sob medida',1);
  INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('BK140140BEGE',2,1),('BK120120BEGE',5,1),('SOBMEDIDA',0,2);
`);
const hoje = d2.prepare("SELECT date('now','localtime') d").get().d;
const vol = d2.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,venda,estagio,data,despachar_em)
  VALUES (?,?,?,?,?,'pendente',?,?)`);
vol.run('BK140140BEGE','Ana','1','111','901',hoje,hoje);   // 1 — volume simples
vol.run('BK120120BEGE','Fabiano','2','112','902',hoje,hoje); // 2 — a caixa de PACOTE
vol.run('SOBMEDIDA','Geison','3','113','903',hoje,hoje);   // 3 — sob medida
d2.prepare("INSERT INTO lote_item (lote_id,codigo,qtd,conferidos) VALUES (2,'BK120120BEGE',1,1)").run();
d2.prepare("INSERT INTO lote_item (lote_id,codigo,qtd,conferidos) VALUES (2,'BK140140BEGE',2,2)").run();

const rotas2 = {};
const app2 = { get:(p,...h)=>{ rotas2['GET '+p]=h[h.length-1]; },
               post:(p,...h)=>{ rotas2['POST '+p]=h[h.length-1]; },
               delete:()=>{}, use:()=>{}, locals:{} };
ESTOQUE.garantirSchema(d2);
require('./mont_route')(app2, d2);
require('./etq_route')(app2, d2);
require('./teste_route')(app2, d2);      // por ultimo, como no server.js (§11)

function chamar2(metodo, rota, corpo, params){
  const h = rotas2[metodo+' '+rota];
  if(!h) throw new Error('rota nao registrada: '+metodo+' '+rota);
  const out = { status:200, body:null };
  const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; return res; },
                send(b){ out.body=b; return res; }, setHeader(){}, end(){} };
  h({ body:corpo||{}, params:params||{}, query:{}, headers:{}, usuario:{id:1,nome:'Ana'} }, res);
  return out;
}
const saldo2 = c => d2.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
function desacordo(){
  return d2.prepare(`SELECT s.codigo, s.estoque,
      COALESCE((SELECT SUM(delta) FROM movimento_estoque m WHERE m.codigo=s.codigo),0) soma
    FROM skus s`).all().filter(r => (+r.estoque||0) !== r.soma)
    .map(r => r.codigo + ': coluna ' + r.estoque + ' × livro ' + r.soma);
}
const bate = etapa => ok('a soma do livro bate com o saldo — ' + etapa,
                         desacordo().length === 0, desacordo().join(' · '));

bate('logo depois da abertura');

chamar2('POST','/api/montagem',{codigo:'BK140140BEGE',segundos:30});
eq('EMBALAR soma +1', saldo2('BK140140BEGE'), 3);
bate('depois de embalar');

chamar2('POST','/api/embalar',{id:1});
eq('a ETIQUETA baixa 1', saldo2('BK140140BEGE'), 2);
bate('depois da etiqueta');

/* A REIMPRESSAO NAO BAIXA (armadilha #1-B). A rota dela mora no `exp_route`,
   que arrasta o leitor de PDF inteiro; o que importa aqui e a guarda que
   protege o saldo, e ela esta no `/api/embalar`: volume que ja andou e
   recusado. Sem ela, cada papel preso furaria o estoque. */
const r2 = chamar2('POST','/api/embalar',{id:1});
ok('imprimir de novo o mesmo volume e RECUSADO', /ja foi processada/.test((r2.body&&r2.body.erro)||''),
   JSON.stringify(r2.body));
eq('   o saldo nao se mexeu', saldo2('BK140140BEGE'), 2);
eq('   e nao ha segunda linha de baixa para o volume 1',
   d2.prepare("SELECT COUNT(*) n FROM movimento_estoque WHERE referencia='lote:1'").get().n, 1);
bate('depois da tentativa de segunda impressao');

chamar2('POST','/api/embalar',{id:2});
eq('a CAIXA DE PACOTE baixa por peca — 1 de BK120120BEGE', saldo2('BK120120BEGE'), 4);
eq('   e 2 de BK140140BEGE', saldo2('BK140140BEGE'), 0);
eq('   sao DUAS linhas de livro, uma por SKU, com a mesma referencia do volume',
   d2.prepare("SELECT COUNT(*) n FROM movimento_estoque WHERE referencia='lote:2'").get().n, 2);
bate('depois do pacote');

chamar2('POST','/api/embalar',{id:3});
eq('SOB MEDIDA imprime e NAO baixa (§7)', saldo2('SOBMEDIDA'), 0);
eq('   e nao deixa linha no livro',
   d2.prepare("SELECT COUNT(*) n FROM movimento_estoque WHERE codigo='SOBMEDIDA'").get().n, 0);
bate('depois do sob medida');

console.log('\n── o modo teste, que e onde a soma quebraria calada ──');

chamar2('POST','/api/teste/ligar',{});
chamar2('POST','/api/montagem',{codigo:'BK120120BEGE',segundos:10});
chamar2('POST','/api/montagem',{codigo:'BK120120BEGE',segundos:10});
eq('em modo teste a embalagem soma igual', saldo2('BK120120BEGE'), 6);
eq('   e as linhas nascem marcadas teste=1',
   d2.prepare("SELECT COUNT(*) n FROM movimento_estoque WHERE teste=1").get().n, 2);
bate('com o modo teste ligado');

chamar2('POST','/api/teste/limpar',{});
eq('APAGAR devolve o saldo a foto', saldo2('BK120120BEGE'), 4);
eq('   e as linhas de teste sumiram do livro',
   d2.prepare("SELECT COUNT(*) n FROM movimento_estoque WHERE teste=1").get().n, 0);
bate('depois de APAGAR os testes');

chamar2('POST','/api/teste/ligar',{});
chamar2('POST','/api/montagem',{codigo:'BK120120BEGE',segundos:10});
chamar2('POST','/api/teste/manter',{});
eq('MANTER promove a producao de teste', saldo2('BK120120BEGE'), 5);
eq('   e promove a linha do livro junto',
   d2.prepare("SELECT COUNT(*) n FROM movimento_estoque WHERE teste=1").get().n, 0);
bate('depois de MANTER os testes');

d2.close(); fs.rmSync(tmp2, {recursive:true, force:true});

console.log('\n=== 10. A VARREDURA — ninguem mais escreve na coluna ===\n');

/* Sem este caso a arrumacao dura ate o proximo modulo: modulo novo se escreve
   copiando o de cima. Os `teste_*.js` ficam de fora porque ali o `UPDATE` e
   MONTAGEM DE CENARIO, nao escrita de producao — um teste que semeia saldo nao
   e um oitavo dono. */
const raiz = __dirname;
const ignora = { 'estoque_dominio.js':1 };
/* ⚠️ `teste_route.js` NAO E TESTE — e o modulo do MODO TESTE (§11), que so tem
   o nome parecido, e ele restaura a foto do estoque. Isenta-lo por causa do
   prefixo deixaria de fora um dono de verdade da coluna. O CI faz essa mesma
   excecao pelo mesmo motivo — e foi a varredura que achou isto. */
const ehTeste = f => /^teste_/.test(f) && f !== 'teste_route.js';
const suspeitos = [];
fs.readdirSync(raiz).filter(f => /\.js$/.test(f) && !ehTeste(f) && !ignora[f]).forEach(f => {
  const texto = fs.readFileSync(path.join(raiz, f), 'utf8');
  /* Pega `UPDATE skus SET estoque=`, `SET estoque =`, e tambem o upsert
     `DO UPDATE SET ... estoque=excluded.estoque`, que e como o cadastro de SKU
     apagava saldo sem nunca escrever a palavra UPDATE ao lado de skus. */
  const re = /UPDATE\s+skus\s+SET[^;'"`]*\bestoque\s*=|estoque\s*=\s*excluded\.estoque/ig;
  const achou = texto.match(re);
  if(achou) suspeitos.push(f + ' -> ' + achou.join(' | '));
});
ok('nenhum .js de producao escreve em skus.estoque fora do estoque_dominio.js',
   suspeitos.length === 0, suspeitos.join('\n         '));

/* E a varredura tem que ser capaz de ACUSAR — senao ela e um verde que ninguem
   conferiu, que e pior que vermelho (§10, #29). */
const iscaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-isca-'));
fs.writeFileSync(path.join(iscaDir, 'falso_route.js'), "db.prepare('UPDATE skus SET estoque=? WHERE codigo=?').run(1,'X');");
fs.writeFileSync(path.join(iscaDir, 'falso_upsert.js'), "ON CONFLICT(codigo) DO UPDATE SET descricao=excluded.descricao, estoque=excluded.estoque");
fs.writeFileSync(path.join(iscaDir, 'inocente.js'), "db.prepare('UPDATE skus SET alvo=? WHERE codigo=?').run(1,'X');");
const pegos = fs.readdirSync(iscaDir).filter(f => {
  const t = fs.readFileSync(path.join(iscaDir, f), 'utf8');
  return /UPDATE\s+skus\s+SET[^;'"`]*\bestoque\s*=|estoque\s*=\s*excluded\.estoque/i.test(t);
});
eq('a varredura pega o UPDATE direto e o upsert, e deixa o `alvo` em paz', pegos.length, 2);
ok('   e os dois que ela pegou sao os certos',
   pegos.indexOf('falso_route.js') >= 0 && pegos.indexOf('falso_upsert.js') >= 0, pegos.join(', '));
fs.rmSync(iscaDir, {recursive:true, force:true});

console.log('\n' + (falhas ? 'FALHARAM ' + falhas + ' de ' + n : 'TODOS OS ' + n + ' CASOS PASSARAM') + '\n');
db.close(); fs.rmSync(tmp, {recursive:true, force:true});
process.exit(falhas ? 1 : 0);
