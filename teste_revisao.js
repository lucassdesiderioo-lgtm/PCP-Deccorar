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
  INSERT INTO skus (codigo,estoque) VALUES ('BK140140BEGE',5),('BK160140CINZA',0);
  INSERT INTO producao (codigo,qtd,produzido) VALUES ('BK140140BEGE',3,1);
`);
/* O livro nasce com a abertura (uma linha por SKU com saldo), como no boot. */
ESTOQUE.garantirSchema(db);

const rotas = {};
const app = { locals:{}, get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; } };
require('./revisao_route')(app, db);

function revisar(corpo){
  const h = rotas['POST /api/revisao'];
  if(!h) throw new Error('rota nao registrada: POST /api/revisao');
  const out = { status:200, body:null };
  const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; return res; } };
  h({ body: corpo, params:{}, headers:{}, usuario:{id:1,nome:'Ana'} }, res);
  return out;
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
   (revisar({ codigo:'BK160140CINZA', segundos:10 }), saldo('BK160140CINZA')), 0);
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

db.close(); fs.rmSync(tmp, { recursive:true, force:true });
console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
process.exit(falhas ? 1 : 0);
