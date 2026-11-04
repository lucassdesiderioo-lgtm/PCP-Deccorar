#!/usr/bin/env node
/* teste_devolucao.js — as devolucoes do Mercado Livre (CLAUDE.md §9).
 *
 *   node teste_devolucao.js
 *
 * O fluxo tem duas etapas, com responsabilidades separadas:
 *   1. quem RECEBE a peca registra o SKU que esta VENDO (o fisico) e a triagem;
 *   2. quem olha o ML responde reputacao e motivo comercial, e da baixa.
 *
 * Regras que este arquivo trava:
 *   - o SKU fisico tem que estar cadastrado (a trava do §6 vale aqui);
 *   - a busca pela venda original ACHA a venda, mas a rota grava o que o
 *     operador mandou como `sku_fisico` — nunca o SKU da venda. A diferenca e
 *     a evidencia de envio errado, e preencher sozinho apagaria essa evidencia;
 *   - venda que nao existe no sistema nao trava nada (o vinculo e bonus);
 *   - `reembalar` poe a peca na fila com modo 'devolucao', e SO ela: a peca
 *     segue para a embalagem e so la vira estoque. Registrar NAO mexe no saldo;
 *   - a baixa grava reputacao e motivo, e tira da lista de pendentes.
 *
 * Ate 20/10/2026 o §9 nao tinha teste nenhum.
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-devolucao-'));
const db = new Database(path.join(tmp, 't.db'));
/* Mesmo CREATE do db.js (skus, fila) e o pedaco da `lote` que a busca le. */
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, estoque INTEGER DEFAULT 0);
  CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT,
    modo TEXT DEFAULT 'hoje', situacao TEXT DEFAULT 'aguardando',
    revisado_em TEXT DEFAULT (datetime('now','localtime')), embalado_em TEXT,
    data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, cor TEXT, buyer TEXT,
    city TEXT, nf TEXT, venda TEXT, packId TEXT, data TEXT DEFAULT (date('now','localtime')));
  INSERT INTO skus (codigo,estoque) VALUES ('BK140140BEGE',4),('BK160140BEGE',2);
  INSERT INTO lote (codigo,buyer,venda,packId) VALUES ('BK160140BEGE','Abraao Amorim','2000018016683414','2000014610097547');
`);

const rotas = {};
const app = { locals:{}, get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; } };
require('./dev_route')(app, db);

function chamar(metodo, rota, corpo, params){
  const h = rotas[metodo+' '+rota];
  if(!h) throw new Error('rota nao registrada: '+metodo+' '+rota);
  const out = { status:200, body:null };
  const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; return res; } };
  h({ body: corpo||{}, params: params||{}, query:{}, headers:{}, usuario:{id:1,nome:'Ana'} }, res);
  return out;
}
const saldo = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
const contar = (t, w) => db.prepare('SELECT COUNT(*) n FROM '+t+(w?' WHERE '+w:'')).get().n;

console.log('\n── 1. a busca acha a venda original pelo codigo da etiqueta ──');
let r = chamar('GET','/api/devolucao/buscar/:cod',null,{cod:'2000018016683414'});
eq('acha pela venda', r.body.achou, true);
eq('e devolve o SKU que foi ENVIADO', r.body.venda.codigo, 'BK160140BEGE');
r = chamar('GET','/api/devolucao/buscar/:cod',null,{cod:'2000 0146 1009 7547'});
eq('acha pelo pack, mesmo com espaco no meio do numero', r.body.achou, true);
r = chamar('GET','/api/devolucao/buscar/:cod',null,{cod:'1111111111'});
eq('venda que nao existe responde achou:false, sem erro', r.body.achou, false);
eq('e sem venda', r.body.venda, null);

console.log('\n── 2. o SKU gravado e o que o operador VE, nunca o da venda ──');
r = chamar('POST','/api/devolucao',{ codigo_ml:'2000018016683414', sku_fisico:' bk140140bege ',
  sku_venda:'BK160140BEGE', destinacao:'estoque', embalagem:'ok' });
eq('registra', r.status, 200);
const d1 = db.prepare('SELECT * FROM devolucao WHERE id=?').get(r.body.id);
eq('o sku_fisico e o que veio, normalizado', d1.sku_fisico, 'BK140140BEGE');
eq('o sku_venda fica do lado — a divergencia continua visivel', d1.sku_venda, 'BK160140BEGE');
eq('a devolucao nasce pendente de baixa', d1.baixado, 0);

console.log('\n── 3. registrar NAO mexe no estoque; so reembalar vai para a fila ──');
eq('o saldo do SKU fisico nao andou', saldo('BK140140BEGE'), 4);
eq('o saldo do SKU da venda nao andou', saldo('BK160140BEGE'), 2);
eq('destino estoque nao entra na fila', r.body.naFila, false);
eq('a fila continua vazia', contar('fila'), 0);
r = chamar('POST','/api/devolucao',{ sku_fisico:'BK140140BEGE', destinacao:'reembalar' });
eq('reembalar responde naFila', r.body.naFila, true);
const f = db.prepare('SELECT codigo,modo,situacao FROM fila').get();
eq('a peca entra na fila com modo devolucao', f && f.modo, 'devolucao');
eq('aguardando, como toda peca que vai embalar', f && f.situacao, 'aguardando');
eq('e o saldo continua o mesmo ate a embalagem', saldo('BK140140BEGE'), 4);
r = chamar('POST','/api/devolucao',{ sku_fisico:'BK140140BEGE', destinacao:'descarte' });
eq('descarte nao entra na fila', contar('fila'), 1);

console.log('\n── 4. sem venda no sistema, tudo funciona (o vinculo e bonus) ──');
r = chamar('POST','/api/devolucao',{ codigo_ml:'9999', sku_fisico:'BK160140BEGE', destinacao:'estoque' });
eq('registra devolucao antiga sem venda', r.status, 200);

console.log('\n── 5. a trava do cadastro (§6) vale aqui ──');
const antes = contar('devolucao');
r = chamar('POST','/api/devolucao',{ sku_fisico:'BK999999NADA', destinacao:'reembalar' });
eq('SKU fora do cadastro e recusado', r.status, 400);
ok('e a recusa diz qual', /BK999999NADA/.test(r.body.erro), JSON.stringify(r.body));
eq('nada foi gravado', contar('devolucao'), antes);
eq('e nada entrou na fila', contar('fila'), 1);
r = chamar('POST','/api/devolucao',{ destinacao:'reembalar' });
eq('sem SKU e recusado', r.status, 400);

console.log('\n── 6. a baixa (etapa do admin) ──');
eq('quatro pendentes antes da baixa', chamar('GET','/api/devolucao/pendentes').body.length, 4);
r = chamar('POST','/api/devolucao/baixa',{ id:d1.id, reputacao:'sim', motivo:'envio errado' });
eq('a baixa responde ok', r.body.ok, true);
const d1b = db.prepare('SELECT * FROM devolucao WHERE id=?').get(d1.id);
eq('grava a reputacao', d1b.reputacao, 'sim');
eq('grava o motivo', d1b.motivo, 'envio errado');
eq('marca como baixada', d1b.baixado, 1);
ok('com data da baixa', !!d1b.baixado_em);
eq('sai da lista de pendentes', chamar('GET','/api/devolucao/pendentes').body.length, 3);
eq('baixa sem id e recusada', chamar('POST','/api/devolucao/baixa',{}).status, 400);

/* 26/10/2026: a baixa respondia ok para id que nao existe, e regravava a data
   de quem ja tinha dado baixa. Resposta que diz que gravou sem ter gravado e o
   pior tipo de silencio. */
r = chamar('POST','/api/devolucao/baixa',{ id:99999, reputacao:'sim', motivo:'x' });
eq('baixa de devolução que não existe é recusada (404)', r.status, 404);
ok('   e diz que não achou', /não encontrada/i.test(r.body.erro || ''), JSON.stringify(r.body));
db.prepare("UPDATE devolucao SET baixado_em='2026-01-01 10:00:00' WHERE id=?").run(d1.id);
r = chamar('POST','/api/devolucao/baixa',{ id:d1.id, reputacao:'nao', motivo:'outro' });
eq('baixa repetida é recusada (409)', r.status, 409);
const d1c = db.prepare('SELECT * FROM devolucao WHERE id=?').get(d1.id);
ok('   e não regrava data, reputação nem motivo',
   d1c.baixado_em === '2026-01-01 10:00:00' && d1c.reputacao === 'sim' && d1c.motivo === 'envio errado', JSON.stringify(d1c));
eq('o contador de hoje conta as quatro', chamar('GET','/api/devolucao/hoje').body.qtd, 4);

console.log('\n── 7. a baixa grava QUEM deu (spec ACESSO-POR-TELA-E-NIVEL, fase 1) ──');
/* Ate 04/11/2026 a baixa guardava so a hora: quem deu ficava fora do banco, e
   so a devolucao ligada a um caso ganhava um evento com o nome. */
const cols = db.prepare("SELECT name FROM pragma_table_info('devolucao')").all().map(c => c.name);
ok('a tabela tem baixado_por_id e baixado_por', cols.includes('baixado_por_id') && cols.includes('baixado_por'), cols.join(','));
eq('a baixado_por_id vem DEPOIS da teste (o ALTER acrescenta no fim, §17)', cols.indexOf('baixado_por_id') > cols.indexOf('teste'), true);
eq('d1, baixada pela Ana, guarda o id dela', d1c.baixado_por_id, 1);
eq('   e o nome como retrato', d1c.baixado_por, 'Ana');
/* a 409 não regrava quem: outra pessoa tenta de novo e o nome fica */
rotas['POST /api/devolucao/baixa']({ body:{ id:d1.id, reputacao:'nao', motivo:'x' }, params:{}, query:{}, headers:{}, usuario:{id:7,nome:'Renato'} },
  { status(){ return this; }, json(){ return this; } });
const d1d = db.prepare('SELECT * FROM devolucao WHERE id=?').get(d1.id);
ok('a baixa repetida por outra pessoa não regrava quem deu', d1d.baixado_por_id === 1 && d1d.baixado_por === 'Ana', JSON.stringify(d1d));
const pend = chamar('GET','/api/devolucao/pendentes').body;
const d2 = pend[0];
const out = {};
rotas['POST /api/devolucao/baixa']({ body:{ id:d2.id, reputacao:'nao', motivo:'arrependimento' }, params:{}, query:{}, headers:{}, usuario:{id:7,nome:'Renato'} },
  { status(c){ out.s=c; return this; }, json(b){ out.b=b; return this; } });
const d2b = db.prepare('SELECT * FROM devolucao WHERE id=?').get(d2.id);
ok('outra pessoa dá a baixa e o nome é o dela', d2b.baixado_por_id === 7 && d2b.baixado_por === 'Renato', JSON.stringify(d2b));
r = chamar('POST','/api/devolucao/baixa',{ id:d2.id, reputacao:'sim', motivo:'y' });
ok('a recusa da baixa repetida diz quem deu', /por Renato/.test(r.body.erro || ''), JSON.stringify(r.body));
/* baixa antiga, sem o nome: nao se inventa de memoria */
db.prepare("UPDATE devolucao SET baixado=1, baixado_em='2026-10-01 09:00:00', baixado_por_id=NULL, baixado_por=NULL WHERE id=?").run(pend[1].id);
r = chamar('POST','/api/devolucao/baixa',{ id:pend[1].id, reputacao:'sim', motivo:'y' });
ok('a baixa antiga continua sem nome, e a recusa não inventa um', r.status === 409 && !/ por /.test(r.body.erro || ''), JSON.stringify(r.body));
/* sem sessao (script) a baixa nao grava nome falso */
const pend2 = chamar('GET','/api/devolucao/pendentes').body;
rotas['POST /api/devolucao/baixa']({ body:{ id:pend2[0].id, reputacao:'nao', motivo:'z' }, params:{}, query:{}, headers:{} },
  { status(){ return this; }, json(){ return this; } });
const d4 = db.prepare('SELECT * FROM devolucao WHERE id=?').get(pend2[0].id);
ok('sem pessoa na sessão, quem deu fica vazio (nunca um nome inventado)', d4.baixado === 1 && d4.baixado_por_id == null && d4.baixado_por == null, JSON.stringify(d4));

/* banco de PRODUCAO: a tabela ja existe sem as colunas, e o boot as acrescenta */
const db2 = new Database(path.join(tmp, 'antigo.db'));
db2.exec(`CREATE TABLE devolucao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo_ml TEXT, sku_fisico TEXT, sku_venda TEXT, venda_id INTEGER, buyer TEXT, embalagem TEXT, tecido TEXT, tubo TEXT, base TEXT, comando TEXT, kit TEXT, destinacao TEXT, obs TEXT, reputacao TEXT, motivo TEXT, baixado INTEGER DEFAULT 0, baixado_em TEXT, recebido_em TEXT, data TEXT, teste INTEGER DEFAULT 0);
  INSERT INTO devolucao (sku_fisico,baixado,baixado_em) VALUES ('X',1,'2026-10-01 09:00:00');
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, estoque INTEGER DEFAULT 0);
  CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, modo TEXT, situacao TEXT, revisado_em TEXT, embalado_em TEXT, data TEXT, teste INTEGER DEFAULT 0);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, cor TEXT, buyer TEXT, city TEXT, nf TEXT, venda TEXT, packId TEXT, data TEXT);`);
require('./dev_route')({ locals:{}, get(){}, post(){} }, db2);
const cols2 = db2.prepare("SELECT name FROM pragma_table_info('devolucao')").all().map(c => c.name);
ok('banco que já existia ganha as duas colunas no boot (ALTER guardado)', cols2.includes('baixado_por_id') && cols2.includes('baixado_por'), cols2.join(','));
const velha = db2.prepare('SELECT * FROM devolucao').get();
ok('   e a baixa antiga fica sem nome (não se inventa)', velha.baixado_por == null && velha.baixado_por_id == null && velha.baixado_em === '2026-10-01 09:00:00');
db2.close();

db.close(); fs.rmSync(tmp, { recursive:true, force:true });
console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
process.exit(falhas ? 1 : 0);
