#!/usr/bin/env node
/* teste_defeito_volta.js — a peça com defeito volta da Embalagem para a Revisão
 * (spec EMBALAGEM-DEFEITO-VOLTA, cartão R-EMB-11, 21/11/2026).
 *
 *   node teste_defeito_volta.js
 *
 * Sobe um banco temporário com as rotas de verdade da Embalagem, da Revisão e
 * da peça com problema, e um app de mentira. Não abre porta.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, a, e){ ok(desc, a === e, 'esperado ' + JSON.stringify(e) + ', veio ' + JSON.stringify(a)); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-defeito-'));
const db = new Database(path.join(tmp, 't.db'));
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '', cor_codigo TEXT,
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER, largura_cm INTEGER, altura_cm INTEGER);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
  CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT,
    modo TEXT DEFAULT 'hoje', situacao TEXT DEFAULT 'aguardando',
    revisado_em TEXT DEFAULT (datetime('now','localtime')), embalado_em TEXT,
    data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
  CREATE TABLE producao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, qtd INTEGER,
    produzido INTEGER DEFAULT 0, data TEXT DEFAULT (date('now','localtime')),
    origem TEXT DEFAULT 'manual', urgente INTEGER DEFAULT 0, teste INTEGER DEFAULT 0);
  CREATE TABLE revisao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, inicio TEXT, fim TEXT,
    segundos INTEGER, data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')),
    modo TEXT DEFAULT 'hoje', teste INTEGER DEFAULT 0, usuario_id INTEGER, usuario_nome TEXT);
  INSERT INTO modelo (id,nome,exige_medida) VALUES (1,'Rolô',1),(2,'Acessório',0);
  INSERT INTO skus (codigo,estoque,modelo_id,largura_cm,altura_cm,cor_codigo) VALUES
    ('BK140140BEGE',3,1,140,140,'BEGE'),('KIT32',2,2,NULL,NULL,NULL);
`);
require('./estoque_dominio').garantirSchema(db);
/* O material extra da peca com problema (§24): a ficha pede o Compras inteiro,
   entao o teste escuta a chamada ao dono dele, que e o que importa aqui. */
const ME = require('./material_extra_dominio'), extras = [];
ME.registrarRevisao = (d, a) => { extras.push(a); return { id:extras.length }; };

const rotas = {};
const app = { locals:{}, get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; }, delete(p,h){ rotas['DELETE '+p]=h; } };
require('./revisao_route')(app, db);
require('./mont_route')(app, db);
require('./cad_route')(app, db);
db.prepare("INSERT INTO config (chave,valor) VALUES ('emb_minimo_seg','0') ON CONFLICT(chave) DO UPDATE SET valor='0'").run();
db.prepare("INSERT INTO config (chave,valor) VALUES ('rev_minimo_seg','0') ON CONFLICT(chave) DO UPDATE SET valor='0'").run();
const KIT = (db.prepare("SELECT valor FROM config WHERE chave='kit_codigo'").get() || {}).valor || 'KITENVIO2026';
db.prepare("INSERT INTO config (chave,valor) VALUES ('kit_codigo',?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run(KIT);

const ANA = { id:1, nome:'Ana' }, RUI = { id:2, nome:'Rui' };
function chamar(metodo, rota, corpo, usuario, params){
  const h = rotas[metodo + ' ' + rota];
  if(!h) return { status:'rota nao registrada', body:{} };
  const out = { status:200, body:null };
  const res = { status(c){ out.status = c; return res; }, json(b){ out.body = b; return res; }, send(b){ out.body = b; return res; } };
  try{ h({ body:corpo || {}, params:params || {}, query:{}, headers:{}, usuario: usuario === undefined ? ANA : usuario }, res); }
  catch(e){ return { status:500, body:{ erro:String(e.message || e) } }; }
  return out;
}
const est = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
const nMont = () => db.prepare('SELECT COUNT(*) c FROM montagem').get().c;
const livroOk = () => db.prepare('SELECT COALESCE(SUM(delta),0) s FROM movimento_estoque WHERE codigo=?').get('BK140140BEGE').s === est('BK140140BEGE');
const motivos = db.prepare("SELECT valor FROM listas WHERE tipo='rejeicao' AND ativo=1 ORDER BY ordem,id").all().map(r => r.valor);
const MOT = motivos[0];
const revisar = (u) => chamar('POST', '/api/revisao', { codigo:'BK140140BEGE', segundos:30 }, u || RUI);

console.log('\n── 1. a Embalagem devolve a persiana ──');
ok('há motivos na lista da Revisão', motivos.length > 0);
revisar();
const fila1 = db.prepare("SELECT id FROM fila WHERE codigo='BK140140BEGE' AND situacao='aguardando'").get().id;
const e0 = est('BK140140BEGE'), m0 = nMont();
let r = chamar('POST', '/api/montagem/defeito', { codigo:'BK140140BEGE', motivo:'', segundos:20 });
eq('sem motivo: 400', r.status, 400);
r = chamar('POST', '/api/montagem/defeito', { codigo:'BK140140BEGE', motivo:'inventado', segundos:20 });
eq('motivo fora da lista: 400', r.status, 400);
r = chamar('POST', '/api/montagem/defeito', { codigo:'BK140140BEGE', motivo:MOT }, null);
eq('sem login: 401', r.status, 401);
eq('…e a linha continua esperando', db.prepare('SELECT situacao FROM fila WHERE id=?').get(fila1).situacao, 'aguardando');
r = chamar('POST', '/api/montagem/defeito', { codigo:'KIT32', motivo:MOT });
eq('kit não volta para a Revisão: 400', r.status, 400);
r = chamar('POST', '/api/montagem/defeito', { codigo:'bk140140bege', motivo:MOT, obs:'risco no tecido', segundos:20 });
eq('persiana com motivo: 200', r.status, 200);
eq('a linha da fila passa a defeito (não é apagada)', db.prepare('SELECT situacao FROM fila WHERE id=?').get(fila1).situacao, 'defeito');
eq('nada embalou', nMont(), m0);
eq('o estoque não mexeu', est('BK140140BEGE'), e0);
ok('o livro continua batendo', livroOk());
const vol = db.prepare('SELECT * FROM embalagem_defeito ORDER BY id DESC').get();
ok('a volta guarda quem achou, pelo id', vol && vol.achou_por_id === 1 && vol.achou_por === 'Ana' && vol.motivo === MOT && vol.obs === 'risco no tecido');
r = chamar('POST', '/api/montagem/defeito', { codigo:'BK140140BEGE', motivo:MOT });
eq('sem peça esperando: 409 sem_revisao', r.body && r.body.motivo, 'sem_revisao');
r = chamar('POST', '/api/montagem', { codigo:'BK140140BEGE', kit_ok:1, kit_codigo:KIT, segundos:60 });
eq('a peça devolvida não embala sem revisar de novo (R-EMB-02)', r.body && r.body.motivo, 'sem_revisao');

console.log('\n── 2. a Revisão vê a volta ──');
r = chamar('GET', '/api/revisao/defeitos');
ok('a volta aparece aberta, com medida e quem achou', r.body.abertas.length === 1 && r.body.abertas[0].largura_cm === 140 && r.body.abertas[0].achou_por === 'Ana');
ok('os setores vêm da lista fixa', r.body.setores.map(s => s.chave).join(',') === 'corte_tecido,corte_tubo,kit_comando,montagem,outro');
r = chamar('POST', '/api/revisao/desfazer', {}, RUI);
ok('o desfazer da revisão diz que a peça voltou por defeito', r.status >= 400 && /defeito/.test(r.body.erro || ''), JSON.stringify(r.body));

console.log('\n── 3. "tem defeito": vai ao setor ──');
r = chamar('POST', '/api/revisao/defeitos/:id/decidir', { decisao:'defeito' }, RUI, { id:vol.id });
eq('sem setor: 400', r.status, 400);
r = chamar('POST', '/api/revisao/defeitos/:id/decidir', { decisao:'defeito', setor:'montagem' }, null, { id:vol.id });
eq('sem login: 401', r.status, 401);
r = chamar('POST', '/api/revisao/defeitos/:id/decidir', { decisao:'defeito', setor:'corte_tecido', obs:'manchado' }, ANA, { id:vol.id });
eq('quem achou também confere (Q4): 200', r.status, 200);
const rj = db.prepare('SELECT * FROM rejeicao WHERE id=?').get(r.body.rejeicao_id);
ok('vira peça com problema achada na embalagem, com o setor', rj && rj.origem === 'embalagem' && rj.setor === 'Corte de tecido' && rj.motivo === MOT && rj.usuario_id === 1);
ok('…com as duas observações', rj && /risco no tecido/.test(rj.obs) && /manchado/.test(rj.obs));
ok('…e vira material extra a decidir na 106 (③ REVISÃO)', extras.some(a => a.referencia === 'rejeicao:' + (rj && rj.id) && a.sku === 'BK140140BEGE'));
eq('a volta sai do bloco', chamar('GET', '/api/revisao/defeitos').body.abertas.length, 0);
r = chamar('POST', '/api/revisao/defeitos/:id/decidir', { decisao:'sem_defeito' }, RUI, { id:vol.id });
eq('decidida não se decide de novo: 409', r.status, 409);
eq('o estoque continua sem mexer', est('BK140140BEGE'), e0);

console.log('\n── 4. "não tem defeito": revisa de novo ──');
revisar();
chamar('POST', '/api/montagem/defeito', { codigo:'BK140140BEGE', motivo:MOT, segundos:10 }, ANA);
const vol2 = db.prepare('SELECT id FROM embalagem_defeito ORDER BY id DESC').get().id;
const rj0 = db.prepare('SELECT COUNT(*) c FROM rejeicao').get().c;
r = chamar('POST', '/api/revisao/defeitos/:id/decidir', { decisao:'sem_defeito' }, RUI, { id:vol2 });
eq('sem defeito: 200', r.status, 200);
eq('não vira peça com problema', db.prepare('SELECT COUNT(*) c FROM rejeicao').get().c, rj0);
eq('a peça NÃO volta sozinha para a fila', db.prepare("SELECT COUNT(*) c FROM fila WHERE codigo='BK140140BEGE' AND situacao='aguardando'").get().c, 0);
revisar();
r = chamar('POST', '/api/montagem', { codigo:'BK140140BEGE', kit_ok:1, kit_codigo:KIT, segundos:60 });
ok('revisada de novo, ela embala e soma +1', r.body && r.body.ok && est('BK140140BEGE') === e0 + 1, JSON.stringify(r.body));
ok('o livro continua batendo', livroOk());
r = chamar('POST', '/api/revisao/defeitos/:id/decidir', { decisao:'talvez' }, RUI, { id:999 });
eq('volta que não existe: 404', r.status, 404);

console.log('\n── 5. a 104 conta as duas origens ──');
chamar('POST', '/api/rejeicao', { codigo:'BK140140BEGE', motivo:MOT, segundos:30 }, RUI);
r = chamar('GET', '/api/rejeicao/resumo');
const po = {}; (r.body.porOrigem || []).forEach(o => po[o.origem] = o.qtd);
ok('achado na revisão e achado na embalagem, separados', po.revisao === 1 && po.embalagem === 1, JSON.stringify(r.body.porOrigem));
ok('o setor responsável aparece', (r.body.porSetor || []).some(s => s.setor === 'Corte de tecido' && s.qtd === 1));
db.prepare("INSERT INTO rejeicao (codigo,motivo) VALUES ('BK140140BEGE','antiga')").run();
r = chamar('GET', '/api/rejeicao/resumo');
ok('a peça com problema de antes (sem origem) conta como achada na revisão', (r.body.porOrigem || []).find(o => o.origem === 'revisao').qtd === 2);

console.log('\n── 6. permissão e telas ──');
const app2 = { locals:{}, router:{ stack:[] }, get(){}, post(){}, delete(){} };
require('./acesso')(app2, db);
const AC = app2.locals.acesso;
eq('marcar defeito é da Embalagem', AC.permDaRota('/api/montagem/defeito', 'POST'), 'embalagem.executar');
eq('decidir é de quem registra peça com problema', AC.permDaRota('/api/revisao/defeitos/7/decidir', 'POST'), 'revisao.rejeitar');
eq('ver as voltas é da Revisão', AC.permDaRota('/api/revisao/defeitos', 'GET'), 'revisao.executar');
const tela102 = fs.readFileSync(path.join(__dirname, 'public', 'montagem.html'), 'utf8');
const tela101 = fs.readFileSync(path.join(__dirname, 'public', 'operador.html'), 'utf8');
ok('a 102 tem o botão, só para persiana', /id="defBt"/.test(tela102) && /emb\.persiana\)\?'':'none'/.test(tela102));
ok('a 102 manda para a rota nova', /\/api\/montagem\/defeito/.test(tela102));
ok('a 101 mostra o bloco das voltas e decide pela rota', /Voltaram da embalagem por defeito/.test(tela101) && /\/decidir/.test(tela101));
ok('os botões de decidir levam data-perm', (tela101.match(/data-perm="revisao\.rejeitar"/g) || []).length >= 2);
const tr = fs.readFileSync(path.join(__dirname, 'teste_route.js'), 'utf8');
ok('a tabela nova está na lista do modo teste', /nome:'embalagem_defeito'/.test(tr));
/* ③ REVISÃO: o foco volta ao bipe depois de devolver, e só o campo de observação o segura */
ok('a 102 devolve o foco ao bipe depois de devolver à Revisão', /fecharDefeito\(\);[^\n]*keep\(\)/.test(tela102));
ok('só o campo de observação segura o foco, não os botões do painel', /a\.id==='defObs'/.test(tela102) && !/closest\('#defPainel'\)\) return/.test(tela102));
ok('a 101 não escreve por cima da revisão em andamento', /if\(!emRev\)\{[^}]*banner\('err','Enviada ao setor/.test(tela101));
const cor = fs.readFileSync(path.join(__dirname, 'correcoes.js'), 'utf8');
ok('a Mesa não chama de "embalada" a linha que voltou por defeito', /situacao === 'defeito'/.test(cor));

db.close(); fs.rmSync(tmp, { recursive:true, force:true });
console.log('\n' + (falhas ? falhas + ' de ' + n + ' FALHARAM' : 'todos os ' + n + ' passaram'));
process.exit(falhas ? 1 : 0);
