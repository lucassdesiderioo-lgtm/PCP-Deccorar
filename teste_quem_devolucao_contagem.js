#!/usr/bin/env node
/* teste_quem_devolucao_contagem.js — QUEM FEZ na Devolução (receber a peça, a
 * baixa e as devoluções em andamento), na contagem de material e no
 * Inventário. Spec QUEM-FEZ-E-REVISAO, fase 5 (05/11/2026).
 *
 *   node teste_quem_devolucao_contagem.js
 *
 * Três coisas:
 *   1. sem login nada grava: toda rota de escrita responde 401 e o banco não
 *      muda (regra-mãe, spec §2.3);
 *   2. o id de quem fez entra ao lado do nome: `devolucao.revisado_por_id`,
 *      `devolucao_caso.criado_por_id` e `encerrado_por_id`,
 *      `devolucao_evento.usuario_id` em TODO evento, `devolucao_coleta` e
 *      `devolucao_anexo.usuario_id`, `contagem.usuario_id`,
 *      `contagem_pendente.contado_por_id` e `aprovado_por_id`;
 *   3. as colunas novas nascem no CREATE e chegam pelo ALTER no banco antigo,
 *      no fim da tabela (§17).
 *
 * Três bancos temporários, handlers chamados direto, um `app` de mentira cada.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-quem-dev-'));
process.env.PCP_DIR = tmp;
process.env.PCP_DEVOLUCOES_DIR = path.join(tmp, 'devolucoes');

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra ? '   ' + extra : '')); } };
const cols = (d, t) => d.prepare(`SELECT name FROM pragma_table_info('${t}')`).all().map(x => x.name);

function montar(d, mods, permite){
  const rotas = {};
  const app = { locals:{ acesso:{
      podePermissao(u, chave){ return !!u && (!permite || permite(u, chave)); },
      permissoesDe(){ return new Set(['contagem.contar','contagem.desempatar']); },
      ehAdminGeral(){ return false; }, auditar(){} } },
    get:(p,...h)=>{ rotas['GET '+p]=h[h.length-1]; },
    post:(p,...h)=>{ rotas['POST '+p]=h[h.length-1]; },
    delete:(p,...h)=>{ rotas['DELETE '+p]=h[h.length-1]; },
    use:()=>{} };
  mods.forEach(m => require(m)(app, d));
  return rotas;
}
function chamador(rotas){
  return (k, body, usuario, params) => {
    const out = { status:200, body:null };
    if(!rotas[k]) return { status:-1, body:{ __sem_rota:k } };
    const res = { status(c){ out.status = c; return res; }, json(o){ out.body = o; return res; },
      send(o){ out.body = o; return res; }, setHeader(){}, type(){ return res; }, sendFile(){ return res; },
      redirect(){ out.status = 302; return res; } };
    try{ rotas[k]({ body:body||{}, params:params||{}, query:{}, headers:{}, usuario:usuario||null }, res); }
    catch(e){ out.status = 500; out.body = { __estourou:String(e.message||e) }; }
    return out;
  };
}

/* ══════════════════ A. DEVOLUÇÃO ══════════════════ */
const dbA = new Database(path.join(tmp, 'a.db'));
dbA.exec(`
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT, estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0);
  CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, modo TEXT DEFAULT 'hoje',
    situacao TEXT DEFAULT 'aguardando', revisado_em TEXT DEFAULT (datetime('now','localtime')), embalado_em TEXT,
    data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, cor TEXT, buyer TEXT, city TEXT, nf TEXT,
    venda TEXT, packId TEXT, data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
  CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nome TEXT, ativo INTEGER DEFAULT 1);
  INSERT INTO usuarios (id,nome) VALUES (1,'Lucas'),(2,'Renato'),(4,'Edvaldo');
  INSERT INTO skus (codigo,estoque) VALUES ('BK140140BEGE',2);
  INSERT INTO lote (codigo,buyer,nf,venda,packId) VALUES ('BK140140BEGE','Joao Lima','8040','2000015512825367',NULL);
`);
const rA = montar(dbA, ['./cad_route','./dev_route','./devcaso_route']);
const A = chamador(rA);
const LUCAS = {id:1,nome:'Lucas'}, RENATO = {id:2,nome:'Renato'}, EDVALDO = {id:4,nome:'Edvaldo'};
const FOTO = 'data:image/jpeg;base64,' + Buffer.alloc(4000, 7).toString('base64');
const retratoA = () => JSON.stringify(['devolucao','devolucao_caso','devolucao_evento','devolucao_coleta',
  'devolucao_anexo','transportadora','fila'].map(t => dbA.prepare('SELECT * FROM '+t+' ORDER BY id').all()));

console.log('\n── A1. o caso, a devolução e a transportadora de partida (com login) ──');
let r = A('POST /api/devolucao-casos/transportadoras', { nome:'Leva e Traz' }, RENATO);
const tid = (dbA.prepare('SELECT id FROM transportadora').get() || {}).id;
ok('a transportadora entra', r.status === 200 && tid, JSON.stringify(r));
r = A('POST /api/devolucao-casos', { tipo:'coleta', venda:'2000015512825367', prazo:dbA.prepare("SELECT date('now','localtime','+5 days') d").get().d,
  publicidade:false, motivo:'Avaria no transporte', responsavel_id:2, link_ml:'https://www.mercadolivre.com.br/x' }, LUCAS);
const casoId = r.body && (r.body.id || (r.body.caso && r.body.caso.id));
ok('o caso é lançado', r.status === 200 && casoId, JSON.stringify(r.body));
const caso = () => dbA.prepare('SELECT * FROM devolucao_caso WHERE id=?').get(casoId);

console.log('\n── A2. sem login, toda escrita da devolução responde 401 e nada muda ──');
const antesA = retratoA();
const escritasA = Object.keys(rA).filter(k => /^(POST|DELETE) \/api\/devolucao/.test(k));
/* + 5 do envio de item faltante (ITEM-FALTANTE, 06/11/2026): enviar, cobranca, reputacao, confirmado e entregue-sem-confirmacao. */
ok('as escritas da devolução estão todas na conta (3 da peça + 29 dos casos)', escritasA.length === 32, escritasA.length);
escritasA.forEach(k => {
  const x = A(k, { id:1, ids:[1], sku_fisico:'BK140140BEGE', motivo:'x', para:'chegou', tipo:'doc', arquivo:FOTO,
    transportadora_id:tid, nome:'Outra', caso_id:casoId, devolucao_id:1, prazo:'2099-01-01', texto:'x' }, null, { id:casoId, tid });
  ok('   ' + k + ' → 401', x.status === 401, x.status + ' ' + JSON.stringify(x.body).slice(0,90));
});
ok('o banco não mudou', retratoA() === antesA);

console.log('\n── A3. o id de quem fez ──');
const c0 = caso();
ok('devolucao_caso.criado_por_id = quem lançou', c0.criado_por_id === 1 && c0.criado_por === 'Lucas', c0.criado_por_id + '/' + c0.criado_por);
r = A('POST /api/devolucao-casos/:id/coleta', { transportadora_id:tid, cep:'80010-000' }, RENATO, { id:casoId });
ok('a coleta é pedida', r.status === 200, JSON.stringify(r.body));
const k = dbA.prepare('SELECT * FROM devolucao_coleta WHERE caso_id=?').get(casoId) || {};
ok('devolucao_coleta.usuario_id ao lado do nome', k.usuario_id === 2 && k.usuario === 'Renato', k.usuario_id + '/' + k.usuario);
r = A('POST /api/devolucao-casos/:id/anexo', { tipo:'doc', doc_tipo:'Etiqueta de coleta', arquivo:FOTO }, RENATO, { id:casoId });
const an = dbA.prepare('SELECT * FROM devolucao_anexo WHERE caso_id=?').get(casoId) || {};
ok('devolucao_anexo.usuario_id ao lado do nome', r.status === 200 && an.usuario_id === 2 && an.usuario === 'Renato', r.status + ' ' + an.usuario_id);
r = A('POST /api/devolucao-casos/:id/chegou', {}, RENATO, { id:casoId });
ok('a caixa chegou', r.status === 200, JSON.stringify(r.body));
r = A('POST /api/devolucao', { sku_fisico:'BK140140BEGE', codigo_ml:'2000015512825367', destinacao:'reembalar', caso_id:casoId }, EDVALDO);
ok('receber a peça (com login) grava', r.status === 200 && r.body.id, JSON.stringify(r.body));
const dv = dbA.prepare('SELECT * FROM devolucao WHERE id=?').get(r.body.id) || {};
ok('devolucao.revisado_por_id e revisado_por = quem recebeu', dv.revisado_por_id === 4 && dv.revisado_por === 'Edvaldo', dv.revisado_por_id + '/' + dv.revisado_por);
r = A('POST /api/devolucao/baixa', { id:dv.id, reputacao:'nao', motivo:'Avaria no transporte' }, LUCAS);
ok('a baixa grava quem deu (já gravava)', r.status === 200 && dbA.prepare('SELECT baixado_por_id FROM devolucao WHERE id=?').get(dv.id).baixado_por_id === 1, JSON.stringify(r.body));
r = A('POST /api/devolucao-casos/:id/perda', { valor_perdido:'10,00' }, LUCAS, { id:casoId });
const cF = caso();
if(r.status === 200)
  ok('devolucao_caso.encerrado_por_id = quem encerrou', cF.encerrado_por_id === 1 && cF.encerrado_por === 'Lucas', cF.encerrado_por_id + '/' + cF.encerrado_por);
else {
  /* "perda" pode ser recusada pelo caminho do caso; encerra-se pela reembolso. */
  r = A('POST /api/devolucao-casos/:id/reembolso', {}, LUCAS, { id:casoId });
  const c2 = caso();
  ok('devolucao_caso.encerrado_por_id = quem encerrou', c2.encerrado_por_id === 1, r.status + ' ' + JSON.stringify(r.body) + ' ' + c2.encerrado_por_id);
}
const semId = dbA.prepare('SELECT COUNT(*) n, GROUP_CONCAT(tipo) t FROM devolucao_evento WHERE caso_id=? AND usuario_id IS NULL').get(casoId);
const totEv = dbA.prepare('SELECT COUNT(*) n FROM devolucao_evento WHERE caso_id=?').get(casoId).n;
ok('TODO evento do caso tem o usuario_id (' + totEv + ' eventos)', totEv >= 5 && semId.n === 0, semId.n + ' sem id: ' + semId.t);
const evNome = dbA.prepare("SELECT usuario, usuario_id FROM devolucao_evento WHERE caso_id=? AND tipo='lancado'").get(casoId) || {};
ok('   e o nome continua ao lado (o retrato)', evNome.usuario === 'Lucas' && evNome.usuario_id === 1, JSON.stringify(evNome));

console.log('\n── A4. as colunas: CREATE no banco novo, ALTER no fim do banco antigo ──');
['revisado_por_id','revisado_por'].forEach(c => ok('banco novo: devolucao.' + c, cols(dbA,'devolucao').indexOf(c) >= 0));
['criado_por_id','encerrado_por_id'].forEach(c => ok('banco novo: devolucao_caso.' + c, cols(dbA,'devolucao_caso').indexOf(c) >= 0));
ok('banco novo: devolucao_coleta.usuario_id', cols(dbA,'devolucao_coleta').indexOf('usuario_id') >= 0);
ok('banco novo: devolucao_anexo.usuario_id', cols(dbA,'devolucao_anexo').indexOf('usuario_id') >= 0);
const velho = new Database(path.join(tmp, 'velho.db'));
velho.exec(`CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, estoque INTEGER DEFAULT 0);
  CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, modo TEXT);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, buyer TEXT, city TEXT, nf TEXT, venda TEXT, packId TEXT, teste INTEGER DEFAULT 0);
  CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nome TEXT, ativo INTEGER DEFAULT 1);
  CREATE TABLE devolucao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo_ml TEXT, sku_fisico TEXT, sku_venda TEXT, venda_id INTEGER, buyer TEXT, embalagem TEXT, tecido TEXT, tubo TEXT, base TEXT, comando TEXT, kit TEXT, destinacao TEXT, obs TEXT, reputacao TEXT, motivo TEXT, baixado INTEGER DEFAULT 0, baixado_em TEXT, recebido_em TEXT, data TEXT, teste INTEGER DEFAULT 0, baixado_por_id INTEGER, baixado_por TEXT);
  CREATE TABLE devolucao_coleta (id INTEGER PRIMARY KEY AUTOINCREMENT, caso_id INTEGER NOT NULL, transportadora_id INTEGER, cep TEXT, pedida_em TEXT, custo REAL, resultado TEXT DEFAULT 'aguardando', obs TEXT, usuario TEXT, criado_em TEXT, teste INTEGER DEFAULT 0, agendada_para TEXT);
  CREATE TABLE devolucao_anexo (id INTEGER PRIMARY KEY AUTOINCREMENT, caso_id INTEGER NOT NULL, tipo TEXT NOT NULL, doc_tipo TEXT, arquivo TEXT, usuario TEXT, criado_em TEXT, teste INTEGER DEFAULT 0);`);
montar(velho, ['./cad_route','./dev_route','./devcaso_route']);
ok('banco antigo: devolucao ganha as duas no fim', cols(velho,'devolucao').slice(-2).join(',') === 'revisado_por_id,revisado_por', cols(velho,'devolucao').slice(-3).join(','));
ok('banco antigo: devolucao_coleta ganha o usuario_id no fim', cols(velho,'devolucao_coleta').slice(-1)[0] === 'usuario_id', cols(velho,'devolucao_coleta').slice(-2).join(','));
ok('banco antigo: devolucao_anexo ganha o usuario_id no fim', cols(velho,'devolucao_anexo').slice(-1)[0] === 'usuario_id');
ok('banco antigo: devolucao_caso ganha criado_por_id e encerrado_por_id', ['criado_por_id','encerrado_por_id'].every(c => cols(velho,'devolucao_caso').indexOf(c) >= 0));
const ordemNova = cols(dbA,'devolucao').slice(-2).join(',');
ok('a ordem do banco novo bate com a do antigo (§17)', ordemNova === 'revisado_por_id,revisado_por', ordemNova);

/* ══════════════════ B. CONTAGEM DE MATERIAL ══════════════════ */
const dbB = new Database(path.join(tmp, 'b.db'));
dbB.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '', estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0);
  CREATE TABLE ajuste_estoque (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, antes INTEGER, depois INTEGER, delta INTEGER,
    motivo TEXT, obs TEXT, usuario_id INTEGER, usuario_nome TEXT, criado_em TEXT DEFAULT (datetime('now','localtime')),
    data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
  CREATE TABLE auditoria (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, usuario_nome TEXT, categoria TEXT, acao TEXT,
    alvo TEXT, detalhe TEXT, ip TEXT, criado_em TEXT, data TEXT);
`);
require('./compras_schema').garantirSchemaCompras(dbB);
const tubo = dbB.prepare("INSERT INTO componente (codigo,nome,unidade,estoque,ativo) VALUES ('TUBO32','Tubo 32 mm','m',10,1)").run().lastInsertRowid;
let AJUSTA = false;
const rB = montar(dbB, ['./cont_route'], (u, chave) => chave === 'contagem.ajustar' ? AJUSTA : true);
const B = chamador(rB);
const ANA = {id:7,nome:'Ana'}, BIA = {id:8,nome:'Bia'};
const retratoB = () => JSON.stringify(['contagem','contagem_pendente','componente','ajuste_estoque','skus']
  .map(t => dbB.prepare('SELECT * FROM '+t).all()));

console.log('\n── B1. sem login, toda escrita da contagem responde 401 e nada muda ──');
/* uma sessão em andamento, de antes do deploy (a porta de lançar material saiu: 504) */
dbB.prepare("INSERT INTO contagem (codigo,sessao,tipo,componente_id,qtd,usuario_id,usuario_nome) VALUES ('Tubo 32 mm','S0','componente',?,3,7,'Ana')").run(tubo);
const antesB = retratoB();
const escritasB = Object.keys(rB).filter(k => /^(POST|DELETE) \/api\/contagem/.test(k));
ok('as 7 escritas da contagem estão na conta', escritasB.length === 7, escritasB.join(' | '));
escritasB.forEach(k => {
  const x = B(k, { codigo:'TUBO32', componente_id:tubo, sessao:'S0', quantidade:1, ids:[1],
    itens:[{ tipo:'componente', componente_id:tubo }] }, null, { sessao:'S0' });
  ok('   ' + k + ' → 401', x.status === 401, x.status + ' ' + JSON.stringify(x.body).slice(0,90));
});
ok('o banco não mudou', retratoB() === antesB);

console.log('\n── B2. o id de quem contou e de quem aprovou ──');
const linhaC = dbB.prepare("SELECT * FROM contagem WHERE sessao='S0'").get() || {};
ok('contagem.usuario_id e usuario_nome em cada lançamento', linhaC.usuario_id === 7 && linhaC.usuario_nome === 'Ana', linhaC.usuario_id + '/' + linhaC.usuario_nome);
r = B('POST /api/contagem/lancar', { sessao:'S0', itens:[{ tipo:'componente', componente_id:tubo }] }, ANA);
ok('sem contagem.ajustar vira pendente', r.status === 200 && r.body.pendente === 1, JSON.stringify(r.body));
const pend = dbB.prepare('SELECT * FROM contagem_pendente ORDER BY id DESC').get() || {};
ok('contagem_pendente.contado_por_id = quem contou', pend.contado_por_id === 7 && pend.contado_por === 'Ana', pend.contado_por_id + '/' + pend.contado_por);
r = B('POST /api/contagem/pendentes/aprovar', { ids:[pend.id] }, BIA);
const pend2 = dbB.prepare('SELECT * FROM contagem_pendente WHERE id=?').get(pend.id) || {};
ok('contagem_pendente.aprovado_por_id = quem aprovou', r.status === 200 && pend2.aprovado_por_id === 8 && pend2.aprovado_por === 'Bia', pend2.aprovado_por_id + '/' + pend2.aprovado_por);
AJUSTA = true;
dbB.prepare("INSERT INTO contagem (codigo,sessao,tipo,componente_id,qtd,usuario_id,usuario_nome) VALUES ('Tubo 32 mm','S1','componente',?,2,8,'Bia')").run(tubo);
r = B('POST /api/contagem/ajustar', { sessao:'S1', itens:[{ tipo:'componente', componente_id:tubo }] }, BIA);
const dir = dbB.prepare('SELECT * FROM contagem_pendente ORDER BY id DESC').get() || {};
ok('o caminho direto grava os dois ids', r.status === 200 && dir.contado_por_id === 8 && dir.aprovado_por_id === 8, JSON.stringify(dir));
ok('banco novo: as colunas no CREATE', ['contado_por_id','aprovado_por_id'].every(c => cols(dbB,'contagem_pendente').indexOf(c) >= 0)
  && ['usuario_id','usuario_nome'].every(c => cols(dbB,'contagem').indexOf(c) >= 0));
const velhoB = new Database(path.join(tmp, 'velhoB.db'));
velhoB.exec(`CREATE TABLE skus (codigo TEXT PRIMARY KEY, estoque INTEGER DEFAULT 0);
  CREATE TABLE contagem (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, contado_em TEXT, sessao TEXT, teste INTEGER DEFAULT 0, tipo TEXT DEFAULT 'sku', componente_id INTEGER, qtd REAL DEFAULT 1);
  CREATE TABLE contagem_pendente (id INTEGER PRIMARY KEY AUTOINCREMENT, sessao TEXT, codigo TEXT, contado INTEGER, sistema_era INTEGER, operacao TEXT, contado_por TEXT, criado_em TEXT, aprovado INTEGER DEFAULT 0, aprovado_por TEXT, aprovado_em TEXT, tipo TEXT DEFAULT 'sku', componente_id INTEGER);`);
require('./compras_schema').garantirSchemaCompras(velhoB);
montar(velhoB, ['./cont_route']);
ok('banco antigo: contagem ganha usuario_id e usuario_nome no fim', cols(velhoB,'contagem').slice(-2).join(',') === 'usuario_id,usuario_nome', cols(velhoB,'contagem').slice(-3).join(','));
ok('banco antigo: contagem_pendente ganha os dois ids no fim', cols(velhoB,'contagem_pendente').slice(-2).join(',') === 'contado_por_id,aprovado_por_id', cols(velhoB,'contagem_pendente').slice(-3).join(','));
ok('a ordem do banco novo bate com a do antigo (§17)',
  cols(dbB,'contagem_pendente').slice(-2).join(',') === 'contado_por_id,aprovado_por_id' && cols(dbB,'contagem').slice(-2).join(',') === 'usuario_id,usuario_nome',
  cols(dbB,'contagem_pendente').slice(-4).join(',') + ' | ' + cols(dbB,'contagem').slice(-4).join(','));

/* ══════════════════ C. INVENTÁRIO ══════════════════ */
const dbC = new Database(path.join(tmp, 'c.db'));
dbC.exec(`
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, nome TEXT, sob_medida INTEGER DEFAULT 0, exige_medida INTEGER DEFAULT 1);
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '', estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0,
    largura_cm INTEGER, altura_cm INTEGER, cor_codigo TEXT, tecido_codigo TEXT, modelo_id INTEGER, ativo INTEGER DEFAULT 1);
  CREATE TABLE ajuste_estoque (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, antes INTEGER, depois INTEGER, delta INTEGER, motivo TEXT,
    obs TEXT, usuario_id INTEGER, usuario_nome TEXT, criado_em TEXT DEFAULT (datetime('now','localtime')), data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, estagio TEXT DEFAULT 'pendente', embalado_em TEXT, baixado_em TEXT, teste INTEGER DEFAULT 0);
  CREATE TABLE lote_item (id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER, codigo TEXT, qtd INTEGER DEFAULT 1);
  CREATE TABLE venda_futura (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, data_venda TEXT, data_envio TEXT, cancelada INTEGER DEFAULT 0);
  CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nome TEXT, ativo INTEGER DEFAULT 1);
  INSERT INTO modelo (id,nome) VALUES (1,'Rolô');
  INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('BK100140BEGE',5,1),('BK110140BEGE',5,1);
  INSERT INTO usuarios (id,nome) VALUES (1,'Ana'),(2,'Bia');
`);
require('./estoque_dominio').garantirSchema(dbC);
const rC = montar(dbC, ['./inventario_route']);
const C = chamador(rC);
const tabelasC = dbC.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x => x.name);
const retratoC = () => JSON.stringify(tabelasC.map(t => dbC.prepare('SELECT * FROM '+t).all()));

console.log('\n── C1. sem login, toda escrita do Inventário responde 401 e nada muda ──');
const antesC = retratoC();
const escritasC = Object.keys(rC).filter(k => /^(POST|DELETE) /.test(k));
ok('as 11 escritas do Inventário estão na conta', escritasC.length === 11, escritasC.length);
escritasC.forEach(k => {
  const x = C(k, { codigo:'BK100140BEGE', codigos:['BK100140BEGE'], tipo:'diaria', id:1, motivo:'x', usuario_id:1, confirmar:true }, null);
  ok('   ' + k + ' → 401', x.status === 401, x.status + ' ' + JSON.stringify(x.body).slice(0,90));
});
ok('o banco não mudou', retratoC() === antesC);

console.log('\n' + (falhas ? falhas + ' FALHA(S) em ' + casos + ' casos' : 'TUDO OK — ' + casos + ' casos'));
fs.rmSync(tmp, { recursive:true, force:true });
process.exit(falhas ? 1 : 0);
