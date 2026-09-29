#!/usr/bin/env node
/* teste_correcao.js — a Mesa de correcoes, fase 1.
 *
 *   node teste_correcao.js
 *
 * Fase 1 da spec MESA-DE-CORRECOES (29/09/2026). Escrito ANTES do codigo,
 * como a §0 pede no risco vermelho. Os casos sao os da §6 da spec, mais os das
 * decisoes do dono (29/09/2026):
 *   1-A  "voltou" desfaz as baixas que o LIVRO registrou; volume anterior ao
 *        livro volta pela peca, e a previa diz isso;
 *   2    sob medida nunca baixou: "voltou" e recusado;
 *   3    caixa de varias persianas fica fora desta fase;
 *   4    o card sabe que ja foi decidido pela tabela `correcao`, sem coluna;
 *   5    descartar fantasma APAGA a linha (como o script), e desfazer devolve.
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-correcao-'));
const db = new Database(path.join(tmp, 't.db'));
db.exec(`
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, nome TEXT, sob_medida INTEGER DEFAULT 0, exige_medida INTEGER DEFAULT 1);
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, cor TEXT DEFAULT '', buyer TEXT DEFAULT '',
    nf TEXT, packId TEXT, venda TEXT, codes TEXT DEFAULT '[]', estagio TEXT DEFAULT 'pendente',
    embalado_em TEXT, carregado_em TEXT, data TEXT DEFAULT (date('now','localtime')),
    criado_em TEXT DEFAULT (datetime('now','localtime')), teste INTEGER DEFAULT 0, bloqueio TEXT,
    despachar_em TEXT, modalidade TEXT, saida_id INTEGER, cancelada_em TEXT, cancelada_origem TEXT,
    cancelada_estagio TEXT, cancelada_motivo TEXT, cancelada_varias INTEGER DEFAULT 0, cancelada_aviso_em TEXT);
  CREATE TABLE lote_item (id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER NOT NULL, codigo TEXT,
    qtd INTEGER DEFAULT 1, cor TEXT, descricao TEXT, origem TEXT DEFAULT 'folha', conferido_em TEXT,
    conferido_por TEXT, criado_em TEXT DEFAULT (datetime('now','localtime')), teste INTEGER DEFAULT 0,
    conferidos INTEGER DEFAULT 0);
  INSERT INTO modelo (id,nome,sob_medida,exige_medida) VALUES (1,'Rolô',0,1),(2,'Sob medida',1,0);
  INSERT INTO skus (codigo,descricao,estoque,modelo_id) VALUES ('BK140140BEGE','Rolo 1,40',10,1),
    ('BK160160CINZA','Rolo 1,60',4,1), ('SOBMEDIDA','Sob medida',0,2);
`);
const ESTOQUE = require('./estoque_dominio');
ESTOQUE.garantirSchema(db);

const L = (o) => db.prepare(`INSERT INTO lote (${Object.keys(o).join(',')}) VALUES (${Object.keys(o).map(()=>'?').join(',')})`)
  .run(...Object.values(o)).lastInsertRowid;
const CANC = { estagio:'cancelado', cancelada_em:'2026-09-28 09:00:00', cancelada_origem:'import',
  cancelada_motivo:'Cancelada pelo comprador' };

// FANTASMAS
const v1 = L({codigo:'BK140140BEGE', buyer:'Ana Paula', nf:'7001', venda:'2000001', estagio:'embalado', embalado_em:'2026-09-20 10:00:00'});
const v2 = L({codigo:'BK140140BEGE', buyer:'Ana Paula', nf:'7001', venda:'2000001', estagio:'pendente'});
db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd,descricao) VALUES (?,?,1,'Rolo 1,40')").run(v2,'BK140140BEGE');
const v4 = L({codigo:'BK160160CINZA', buyer:'Bruno', nf:'7002', packId:'3000004', estagio:'pendente'});
const v5 = L({codigo:'BK160160CINZA', buyer:'Bruno', nf:'7002', packId:'3000004', estagio:'pendente'});
const v6 = L({codigo:'BK160160CINZA', buyer:'Carla', nf:'7003', venda:'2000006', estagio:'pendente'});

// CANCELADAS
const c10 = L(Object.assign({codigo:'BK140140BEGE', buyer:'Denise Souza', nf:'7010', venda:'2000010',
  cancelada_estagio:'embalado', embalado_em:'2026-09-27 10:00:00'}, CANC));
ESTOQUE.movimentar(db, {codigo:'BK140140BEGE', delta:-1, tipo:'etiqueta', referencia:'lote:'+c10});
const c11 = L(Object.assign({codigo:'BK160160CINZA', buyer:'Edu', nf:'7011', venda:'2000011',
  cancelada_estagio:'carregado', modalidade:'coleta'}, CANC));          // antes do livro: sem linha
const c12 = L(Object.assign({codigo:'SOBMEDIDA', buyer:'Fabio', nf:'7012', venda:'2000012',
  cancelada_estagio:'embalado'}, CANC));
const c13 = L({codigo:'BK140140BEGE', buyer:'Gil', nf:'7013', venda:'2000013', estagio:'embalado',
  cancelada_varias:1, cancelada_aviso_em:'2026-09-28 09:00:00', cancelada_motivo:'Cancelada'});
db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd) VALUES (?,?,1),(?,?,1)").run(c13,'BK140140BEGE',c13,'BK160160CINZA');
const c14 = L(Object.assign({codigo:'BK140140BEGE', buyer:'Hugo', nf:'7014', venda:'2000014',
  cancelada_estagio:'pendente'}, CANC));
const c16 = L(Object.assign({codigo:'BK160160CINZA', buyer:'Iara', nf:'7016', venda:'2000016',
  cancelada_estagio:'embalado'}, CANC));
ESTOQUE.movimentar(db, {codigo:'BK160160CINZA', delta:-1, tipo:'etiqueta', referencia:'lote:'+c16});

const AUD = [];
const rotas = {};
const app = {
  locals:{ acesso:{ auditar(req, mod, acao, alvo, det){ AUD.push({mod, acao, alvo, det}); } } },
  get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; }
};
require('./correcao_route')(app, db);
const CANCD = require('./cancelada_dominio');

const LUCAS = {id:4, nome:'Lucas'};
function chamar(metodo, rota, corpo, quem, params, query){
  const h = rotas[metodo+' '+rota];
  if(!h) throw new Error('rota nao registrada: '+metodo+' '+rota);
  const out = { status:200, body:null };
  const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; return res; } };
  h({ body: corpo||{}, query: query||{}, params: params||{}, headers:{}, usuario: quem }, res);
  return out;
}
const objeto = (id) => chamar('GET','/api/correcao/:tipo/:id',{},LUCAS,{tipo:'lote', id:String(id)}).body || {};
const acao = (obj, a) => ((obj.acoes||[]).find(x => x.id === a)) || {};
const previa = (a, id, params) => chamar('POST','/api/correcao/previa',{acao:a, tipo:'lote', id, params},LUCAS);
const executar = (a, id, params, motivo, quem) => chamar('POST','/api/correcao/executar',
  {acao:a, tipo:'lote', id, params, motivo}, quem === undefined ? LUCAS : quem);
const desfazer = (id, motivo) => chamar('POST','/api/correcao/:id/desfazer',{motivo},LUCAS,{id:String(id)});
const saldo = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
const existe = id => !!db.prepare('SELECT 1 FROM lote WHERE id=?').get(id);
const nCorr = () => db.prepare('SELECT COUNT(*) n FROM correcao').get().n;
const nMov = () => db.prepare('SELECT COUNT(*) n FROM movimento_estoque').get().n;
function livroFecha(){
  return db.prepare(`SELECT s.codigo, s.estoque, COALESCE((SELECT SUM(delta) FROM movimento_estoque m WHERE m.codigo=s.codigo),0) soma
    FROM skus s`).all().filter(r => r.estoque !== r.soma);
}
const noCard = id => CANCD.listar(db).some(v => v.id === id);

console.log('\n=== 1. A ACAO QUE NAO VALE APARECE COM O MOTIVO ===\n');

let o = objeto(v2);
eq('o volume 2 abre', o.dados && o.dados.id, v2);
eq('fantasma vale para o pendente cujo irmao mais antigo ja andou', acao(o,'fantasma').vale, true);
eq('   e a cancelada nao vale para ele', acao(o,'cancelada').vale, false);
ok('   dizendo por que', !!acao(o,'cancelada').motivo, JSON.stringify(acao(o,'cancelada')));
o = objeto(v5);
eq('fantasma NAO vale se o irmao mais antigo ainda esta pendente', acao(o,'fantasma').vale, false);
ok('   e o motivo nomeia o irmao e o estagio dele', new RegExp('#'+v4+'\\b').test(acao(o,'fantasma').motivo||'') && /pendente/.test(acao(o,'fantasma').motivo||''),
  acao(o,'fantasma').motivo);
o = objeto(v6);
eq('fantasma NAO vale para volume sem irmao mais antigo', acao(o,'fantasma').vale, false);
o = objeto(v1);
eq('fantasma NAO vale para o mais antigo, que ja andou (e a historia)', acao(o,'fantasma').vale, false);
o = objeto(c13);
eq('caixa de varias persianas: a cancelada fica fora desta fase', acao(o,'cancelada').vale, false);
ok('   e diz que e a caixa de varias', /v[aá]rias/.test(acao(o,'cancelada').motivo||''), acao(o,'cancelada').motivo);
o = objeto(c14);
eq('cancelada antes da etiqueta nao tem o que decidir', acao(o,'cancelada').vale, false);
eq('volume que nao existe da 404', chamar('GET','/api/correcao/:tipo/:id',{},LUCAS,{tipo:'lote', id:'999'}).status, 404);

console.log('\n=== 2. A PREVIA NAO GRAVA ===\n');

let antesMov = nMov();
let r = previa('fantasma', v2);
eq('previa do fantasma responde', r.body && r.body.ok, true);
ok('   e existe e continua existindo', existe(v2));
eq('   nenhuma correcao gravada', nCorr(), 0);
eq('   e nao mexe em estoque', (r.body.estoque||[]).length, 0);
r = previa('cancelada', c10, {voltou:true});
eq('previa do "voltou" diz +1 no BK140140BEGE', JSON.stringify(r.body.estoque), JSON.stringify([{codigo:'BK140140BEGE', delta:1}]));
eq('   e que veio do livro', r.body.fonte, 'livro');
eq('   e o saldo nao andou', saldo('BK140140BEGE'), 9);
eq('   nem o livro', nMov(), antesMov);
eq('   nem a tabela de correcoes', nCorr(), 0);
r = previa('fantasma', v5);
eq('previa de acao que nao vale e recusada', r.status, 409);

console.log('\n=== 3. DESCARTAR FANTASMA — fica o mais antigo ===\n');

r = executar('fantasma', v2, {}, '');
eq('sem motivo e recusado', r.status, 400);
ok('   e o volume continua', existe(v2));
r = executar('fantasma', v2, {}, 'PDF subido duas vezes', null);
eq('sem pessoa logada e recusado', r.status, 401);
r = executar('fantasma', v5, {}, 'tentando');
eq('executar o que nao vale e recusado (irmao pendente)', r.status, 409);
ok('   e o 5 continua', existe(v5));
let pas = chamar('GET','/api/correcao/passivo',{},LUCAS).body || {};
const fantAntes = (pas.fantasmas||[]).length;
ok('o contador de fantasmas conta o volume 2', (pas.fantasmas||[]).some(f => f.id === v2), JSON.stringify(pas.fantasmas));
ok('   e nao conta o 5 (irmao pendente)', !(pas.fantasmas||[]).some(f => f.id === v5));
r = executar('fantasma', v2, {}, 'PDF subido duas vezes');
eq('executar responde ok', r.body && r.body.ok, true);
const corrF = r.body.correcao_id;
ok('o volume 2 saiu', !existe(v2));
ok('o volume 1 — o mais antigo — ficou', existe(v1));
eq('as pecas dele sairam junto', db.prepare('SELECT COUNT(*) n FROM lote_item WHERE lote_id=?').get(v2).n, 0);
let c = db.prepare('SELECT * FROM correcao WHERE id=?').get(corrF) || {};
eq('a correcao guarda a acao', c.acao, 'fantasma');
eq('   o volume', c.alvo_id, v2);
eq('   o motivo', c.motivo, 'PDF subido duas vezes');
eq('   e quem fez', c.usuario_nome, 'Lucas');
let antes = {}; try{ antes = JSON.parse(c.antes); }catch(e){}
eq('o antes guarda a linha inteira', antes.lote && antes.lote.buyer, 'Ana Paula');
eq('   e as pecas', (antes.itens||[]).length, 1);
ok('foi para a auditoria', AUD.some(a => a.acao === 'fantasma' && String(a.alvo) === String(v2)), JSON.stringify(AUD));
pas = chamar('GET','/api/correcao/passivo',{},LUCAS).body || {};
eq('o contador de fantasmas baixou um', (pas.fantasmas||[]).length, fantAntes - 1);

console.log('\n=== 4. DESFAZER O FANTASMA DEVOLVE A MESMA LINHA ===\n');

r = desfazer(corrF, '');
eq('desfazer sem motivo e recusado', r.status, 400);
r = desfazer(corrF, 'era outra venda');
eq('desfazer responde ok', r.body && r.body.ok, true);
ok('o volume 2 voltou, com o mesmo id', existe(v2));
const l2 = db.prepare('SELECT * FROM lote WHERE id=?').get(v2) || {};
eq('   no mesmo estagio', l2.estagio, 'pendente');
eq('   com o mesmo cliente', l2.buyer, 'Ana Paula');
eq('   e com as pecas', db.prepare('SELECT COUNT(*) n FROM lote_item WHERE lote_id=?').get(v2).n, 1);
c = db.prepare('SELECT * FROM correcao WHERE id=?').get(corrF) || {};
ok('a correcao fica marcada como desfeita, com quem', !!c.desfeita_em && c.desfeita_por === 'Lucas');
r = desfazer(corrF, 'de novo');
eq('desfazer duas vezes e recusado', r.status, 409);

console.log('\n=== 5. CANCELADA DEPOIS DA ETIQUETA — "a persiana voltou" ===\n');

ok('antes da decisao, o 10 esta no card', noCard(c10));
antesMov = nMov();
r = executar('cancelada', c10, {voltou:true}, 'caixa achada na area');
eq('executar responde ok', r.body && r.body.ok, true);
const corrV = r.body.correcao_id;
eq('o saldo subiu exatamente um', saldo('BK140140BEGE'), 10);
eq('exatamente UM movimento no livro', nMov(), antesMov + 1);
const mv = db.prepare('SELECT * FROM movimento_estoque ORDER BY id DESC LIMIT 1').get() || {};
eq('   do tipo cancelamento', mv.tipo, 'cancelamento');
eq('   com a referencia da correcao', mv.referencia, 'correcao:' + corrV);
ok('   e o motivo diz o volume e o cliente', /#?10\b/.test(mv.motivo||'') && /Denise/.test(mv.motivo||''), mv.motivo);
eq('o livro fecha com o saldo', livroFecha().length, 0);
ok('o card deixa de mostrar o 10 (decidido)', !noCard(c10));
r = executar('cancelada', c10, {voltou:false}, 'de novo');
eq('decidir de novo e recusado', r.status, 409);
o = objeto(c10);
ok('   e a acao diz que ja foi decidida', /decidid/.test(acao(o,'cancelada').motivo||''), acao(o,'cancelada').motivo);
ok('o historico do objeto traz a correcao', (o.historico||[]).some(h => h.id === corrV));

console.log('\n=== 6. VOLUME ANTERIOR AO LIVRO VOLTA PELA PECA ===\n');

r = previa('cancelada', c11, {voltou:true});
eq('previa: +1 no BK160160CINZA', JSON.stringify(r.body.estoque), JSON.stringify([{codigo:'BK160160CINZA', delta:1}]));
eq('   e diz que foi pela peca', r.body.fonte, 'peca');
ok('   com aviso escrito', (r.body.avisos||[]).length > 0, JSON.stringify(r.body.avisos));
const s16 = saldo('BK160160CINZA');
r = executar('cancelada', c11, {voltou:true}, 'voltou do canto');
eq('executa', r.body && r.body.ok, true);
eq('   +1 no saldo', saldo('BK160160CINZA'), s16 + 1);
eq('o livro fecha', livroFecha().length, 0);

console.log('\n=== 7. SOB MEDIDA NUNCA BAIXOU ===\n');

o = objeto(c12);
eq('a cancelada vale para o sob medida (so o "nao voltou")', acao(o,'cancelada').vale, true);
r = previa('cancelada', c12, {voltou:true});
eq('"voltou" no sob medida e recusado', r.status, 409);
ok('   dizendo que e sob medida', /sob medida/i.test((r.body||{}).erro||''), JSON.stringify(r.body));
antesMov = nMov();
r = executar('cancelada', c12, {voltou:false}, 'peca sob medida descartada');
eq('"nao voltou" passa', r.body && r.body.ok, true);
eq('   sem movimento nenhum', nMov(), antesMov);
ok('   e sai do card', !noCard(c12));

console.log('\n=== 8. DESFAZER O "VOLTOU" ===\n');

antesMov = nMov();
r = desfazer(corrV, 'a caixa era de outra venda');
eq('desfazer responde ok', r.body && r.body.ok, true);
eq('o saldo volta', saldo('BK140140BEGE'), 9);
eq('com um movimento a mais (nada se apaga do livro)', nMov(), antesMov + 1);
const mv2 = db.prepare('SELECT * FROM movimento_estoque ORDER BY id DESC LIMIT 1').get() || {};
eq('   do tipo correcao', mv2.tipo, 'correcao');
eq('   e -1', mv2.delta, -1);
eq('o livro fecha', livroFecha().length, 0);
ok('o 10 volta para o card', noCard(c10));

console.log('\n=== 9. DESFAZER RECUSA O VOLUME QUE ANDOU ===\n');

r = executar('cancelada', c16, {voltou:false}, 'nao voltou');
const corrN = r.body && r.body.correcao_id;
db.prepare("UPDATE lote SET cancelada_estagio='carregado' WHERE id=?").run(c16);
r = desfazer(corrN, 'errei');
eq('o volume mudou depois da correcao: desfazer e recusado', r.status, 409);
ok('   dizendo o que mudou', /cancelada_estagio/.test((r.body||{}).erro||''), JSON.stringify(r.body));
ok('   e a correcao continua ativa', !db.prepare('SELECT desfeita_em FROM correcao WHERE id=?').get(corrN).desfeita_em);

console.log('\n=== 10. BUSCA, PASSIVO E HISTORICO ===\n');

let b = chamar('GET','/api/correcao/buscar',{},LUCAS,{},{q:String(c10)}).body || {};
ok('busca pelo numero do volume', (b.volumes||[]).some(v => v.id === c10), JSON.stringify(b));
b = chamar('GET','/api/correcao/buscar',{},LUCAS,{},{q:'2000011'}).body || {};
ok('busca pela venda', (b.volumes||[]).some(v => v.id === c11));
b = chamar('GET','/api/correcao/buscar',{},LUCAS,{},{q:'denise'}).body || {};
ok('busca pelo cliente, sem maiuscula', (b.volumes||[]).some(v => v.id === c10));
b = chamar('GET','/api/correcao/buscar',{},LUCAS,{},{q:'7013'}).body || {};
ok('busca pela NF', (b.volumes||[]).some(v => v.id === c13));
pas = chamar('GET','/api/correcao/passivo',{},LUCAS).body || {};
ok('as canceladas a decidir trazem o 10 (desfeito)', (pas.canceladas||[]).some(v => v.id === c10));
ok('   e nao trazem as decididas (11, 12)', !(pas.canceladas||[]).some(v => v.id === c11 || v.id === c12));
ok('   nem a caixa de varias, que e desta fase nao', !(pas.canceladas||[]).some(v => v.id === c13));
const h = chamar('GET','/api/correcao/historico',{},LUCAS).body || {};
ok('o historico traz as correcoes, a mais nova em cima', (h.itens||[]).length >= 5 && h.itens[0].id > h.itens[h.itens.length-1].id,
  JSON.stringify((h.itens||[]).map(x=>x.id)));

console.log('\n=== 11. AS TRES PONTAS E O MODO TESTE ===\n');

const perm = require('./permissoes').find(p => p.chave === 'correcao.executar') || {};
eq('a chave existe, nivel admin', perm.nivel, 'admin');
eq('   e sensivel', perm.sensivel, true);
const txtAcesso = fs.readFileSync(path.join(__dirname, 'acesso.js'), 'utf8');
ok('o permDaRota declara /api/correcao', /pre\('\/api\/correcao'\)\)\s*return 'correcao\.executar'/.test(txtAcesso));
const txtTeste = fs.readFileSync(path.join(__dirname, 'teste_route.js'), 'utf8');
ok('`correcao` esta em TABELAS do modo teste', /nome:'correcao'/.test(txtTeste));
ok('o livro fecha no fim de tudo', livroFecha().length === 0, JSON.stringify(livroFecha()));

console.log('\n' + (falhas ? falhas + ' FALHA(S) em ' + n + ' casos' : 'tudo certo — ' + n + ' casos') + '\n');
try{ db.close(); fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){}
process.exit(falhas ? 1 : 0);
