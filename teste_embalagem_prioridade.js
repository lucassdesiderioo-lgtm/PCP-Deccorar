#!/usr/bin/env node
/* teste_embalagem_prioridade.js — o que a 102 embala primeiro e a peça reservada
 * para quem embala (spec EMBALAGEM-PRIORIDADE, 23/11/2026).
 *
 *   node teste_embalagem_prioridade.js
 *
 * Banco temporário com as rotas de verdade da Embalagem; app de mentira, sem porta.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, a, e){ ok(desc, JSON.stringify(a) === JSON.stringify(e), 'esperado ' + JSON.stringify(e) + ', veio ' + JSON.stringify(a)); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-prio-'));
const db = new Database(path.join(tmp, 't.db'));
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '', cor_codigo TEXT,
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER, largura_cm INTEGER, altura_cm INTEGER);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
  CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT,
    modo TEXT DEFAULT 'hoje', situacao TEXT DEFAULT 'aguardando',
    revisado_em TEXT DEFAULT (datetime('now','localtime')), embalado_em TEXT,
    data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0, revisao_id INTEGER);
  CREATE TABLE producao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, qtd INTEGER,
    produzido INTEGER DEFAULT 0, data TEXT DEFAULT (date('now','localtime')),
    origem TEXT DEFAULT 'manual', urgente INTEGER DEFAULT 0, teste INTEGER DEFAULT 0);
  CREATE TABLE revisao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, inicio TEXT, fim TEXT,
    segundos INTEGER, data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')),
    modo TEXT DEFAULT 'hoje', teste INTEGER DEFAULT 0, usuario_id INTEGER, usuario_nome TEXT);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, estagio TEXT DEFAULT 'pendente',
    despachar_em TEXT, embalado_em TEXT, teste INTEGER DEFAULT 0);
  CREATE TABLE lote_item (id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER, codigo TEXT, qtd INTEGER DEFAULT 1);
  INSERT INTO modelo (id,nome,exige_medida,sob_medida) VALUES (1,'Rolô',1,0),(2,'Acessório',0,0);
  INSERT INTO skus (codigo,cor,estoque,modelo_id,largura_cm,altura_cm) VALUES
    ('BEGE140',  'Bege',  0,1,140,140),
    ('CINZA160', 'Cinza', 1,1,160,160),
    ('BRANCO120','Branco',0,1,120,140),
    ('REPO180',  'Cinza', 5,1,180,160),
    ('DEV150',   'Cinza', 3,1,150,150),
    ('HOJE100',  'Bege',  2,1,100,140),
    ('KIT32',    '',      2,2,NULL,NULL);
`);
require('./estoque_dominio').garantirSchema(db);
require('./baixa_dominio').garantirSchema(db);

const rotas = {};
const app = { locals:{}, get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; }, delete(p,h){ rotas['DELETE '+p]=h; } };
require('./mont_route')(app, db);
require('./cad_route')(app, db);
db.prepare("INSERT INTO config (chave,valor) VALUES ('emb_minimo_seg','0') ON CONFLICT(chave) DO UPDATE SET valor='0'").run();
const KIT = 'KITENVIO2026';
db.prepare("INSERT INTO config (chave,valor) VALUES ('kit_codigo',?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run(KIT);

const ANA = { id:1, nome:'Ana' }, RUI = { id:2, nome:'Rui' };
function chamar(metodo, rota, corpo, usuario){
  const h = rotas[metodo + ' ' + rota];
  if(!h) return { status:'rota nao registrada', body:{} };
  const out = { status:200, body:null };
  const res = { status(c){ out.status = c; return res; }, json(b){ out.body = b; return res; }, send(b){ out.body = b; return res; } };
  try{ h({ body:corpo || {}, params:{}, query:{}, headers:{}, usuario: usuario === undefined ? ANA : usuario }, res); }
  catch(e){ return { status:500, body:{ erro:String(e.message || e) } }; }
  return out;
}
const venda = (c, desp) => db.prepare('INSERT INTO lote (codigo,despachar_em) VALUES (?,?)').run(c, desp === undefined ? null : desp);
const fila = (c, modo) => db.prepare('INSERT INTO fila (codigo,modo) VALUES (?,?)').run(c, modo).lastInsertRowid;
const prio = u => chamar('GET', '/api/montagem/prioridade', {}, u === undefined ? ANA : u).body;
const sit = id => db.prepare('SELECT situacao FROM fila WHERE id=?').get(id).situacao;

/* O dia: BEGE140 tem 4 vendas de hoje e saldo 0 → 4 paradas.
          CINZA160 tem 3 vendas e saldo 1 → 2 paradas.
          BRANCO120 tem 2 vendas, saldo 0, e NENHUMA peça aqui → 2 paradas, na produção.
          HOJE100 tem 1 venda e saldo 2 → coberto. */
for(let i=0;i<4;i++) venda('BEGE140');
for(let i=0;i<3;i++) venda('CINZA160');
venda('BRANCO120'); venda('BRANCO120', '2000-01-01');      // uma sem data, outra vencida: as duas são do dia
venda('HOJE100');
venda('REPO180', '2099-12-31');                            // futura: nunca vermelha
venda('REPO180', '2099-12-31'); venda('REPO180', '2099-12-31'); venda('REPO180', '2099-12-31');
venda('REPO180', '2099-12-31'); venda('REPO180', '2099-12-31');
const bEst = fila('BEGE140', 'estoque');                   // a mais antiga do SKU, de reposição
const bHoje = fila('BEGE140', 'hoje');
const bHoje2 = fila('BEGE140', 'hoje');
fila('CINZA160', 'hoje'); fila('CINZA160', 'estoque');
fila('HOJE100', 'hoje');
db.prepare("INSERT INTO producao (codigo,qtd,produzido) VALUES ('HOJE100',2,1)").run();
fila('REPO180', 'estoque'); fila('REPO180', 'estoque');
fila('DEV150', 'devolucao');
fila('KIT32', 'estoque');
/* EXC: 1 venda de hoje sem peça e 3 peças aqui — 1 é do dia, 2 sobram para a reposição. */
db.prepare("INSERT INTO skus (codigo,cor,estoque,modelo_id,largura_cm,altura_cm) VALUES ('EXC110','Bege',0,1,110,110)").run();
venda('EXC110'); fila('EXC110','estoque'); fila('EXC110','estoque'); fila('EXC110','estoque');

console.log('\n── 1. os quatro blocos ──');
let p = prio();
eq('bloco 1: os SKUs com venda de hoje sem peça E peça aqui, mais paradas primeiro', p.dia.linhas.map(d => d.codigo), ['BEGE140','CINZA160','EXC110']);
const B = p.dia.linhas[0];
eq('BEGE140: 4 paradas, 3 aqui (de todo modo) → 3 para embalar', [B.paradas, B.aqui, B.para_embalar], [4, 3, 3]);
eq('…e os quadradinhos só da embalagem: 3 amarelos, nenhum listrado', B.quadros, { amarelo:3, listrado:0 });
ok('o cartão não fala de estoque nem de produção (24/11/2026)', !('com_peca' in B) && !('na_producao' in B) && !('verde' in B.quadros) && !('cinza' in B.quadros));
const C = p.dia.linhas[1];
eq('CINZA160: 2 paradas, 2 aqui → 2 para embalar', [C.paradas, C.aqui, C.para_embalar], [2, 2, 2]);
ok('BRANCO120 (2 paradas, nenhuma peça aqui) sai do vermelho: a embalagem não tem o que fazer nele', !p.dia.linhas.some(d => d.codigo === 'BRANCO120'));
const X = p.dia.linhas[2];
eq('EXC110: 1 parada, 3 aqui → só 1 para embalar no vermelho', [X.paradas, X.aqui, X.para_embalar], [1, 3, 1]);
eq('…e as 2 que sobram descem para a reposição', (p.reposicao.find(x => x.codigo === 'EXC110') || {}).aqui, 2);
eq('a barra: faltam embalar 6 peças do dia (3 + 2 + 1)', p.dia.faltam_embalar, 6);
eq('a conta das vendas de hoje continua (a faixa "todas têm peça")', [p.dia.m, p.dia.n, p.dia.todas], [11, 2, false]);
ok('venda futura nunca é vermelha (REPO180)', !p.dia.linhas.some(d => d.codigo === 'REPO180'));
eq('bloco 2: HOJE100, com a ordem do dia (pede 2, falta 1)', p.hoje.map(x => [x.codigo, x.ordem_pede, x.falta, x.aqui]), [['HOJE100', 2, 1, 1]]);
ok('o SKU vermelho não se repete nos outros blocos', !p.hoje.concat(p.reposicao, p.devolucao).some(x => ['BEGE140','CINZA160'].includes(x.codigo)));
eq('bloco 3: REPO180 e a sobra do EXC110', p.reposicao.map(x => [x.codigo, x.aqui]).sort(), [['EXC110', 2], ['REPO180', 2]]);
eq('bloco 4: DEV150', p.devolucao.map(x => [x.codigo, x.aqui]), [['DEV150', 1]]);
eq('kit fica fora dos blocos', p.outros.map(x => x.codigo), ['KIT32']);
eq('a medida sai do cadastro', B.medida, '1,40 × 1,40');
eq('a reserva solta em 5 minutos', p.reserva_min, 5);

console.log('\n── 2. o empate: quem tem peça aqui vem em cima ──');
venda('BRANCO120');                                        // BRANCO120 sobe para 3 paradas, igual a… ninguém
fila('BRANCO120', 'hoje');                                 // agora BRANCO120: 3 vendas, 1 aqui
venda('DEV150'); venda('DEV150'); venda('DEV150'); venda('DEV150'); venda('DEV150');   // DEV150: 5 vendas, saldo 3 → 2 paradas
p = prio();
eq('BRANCO120 (3 paradas) passa a CINZA160 (2)', p.dia.linhas.map(d => d.codigo).slice(0, 3), ['BEGE140','BRANCO120','CINZA160']);
const iC = p.dia.linhas.findIndex(d => d.codigo === 'CINZA160'), iD = p.dia.linhas.findIndex(d => d.codigo === 'DEV150');
ok('DEV150 (devolução) virou vermelho: embalada, destrava a venda', iD >= 0);
ok('empate em 2 paradas: os dois têm peça aqui, vale a revisada antes', iC < iD);
db.prepare("DELETE FROM lote WHERE codigo='DEV150'").run();

console.log('\n── 3. a reserva ──');
let r = chamar('POST', '/api/montagem/reservar', { codigo:'BEGE140' }, null);
eq('sem login: 401', r.status, 401);
r = chamar('POST', '/api/montagem/reservar', { codigo:'bege140' });
eq('Ana reserva: 200', r.status, 200);
eq('…a linha de modo hoje antes da de reposição mais antiga', r.body.fila_id, bHoje);
p = prio(RUI);
eq('Rui vê 2 aqui e 1 sendo embalada pela Ana', [p.dia.linhas[0].aqui, p.dia.linhas[0].sendo], [2, ['Ana']]);
eq('…com o quadradinho listrado', p.dia.linhas[0].quadros, { amarelo:2, listrado:1 });
eq('…e 2 para ele embalar', p.dia.linhas[0].para_embalar, 2);
ok('a peça reservada pela Ana continua nos ids do Rui (soltar a reserva não é peça nova da Revisão)', p.dia.linhas[0].ids.includes(bHoje));
p = prio(ANA);
eq('Ana vê a dela como aqui (3), marcada como minha', [p.dia.linhas[0].aqui, p.dia.linhas[0].minha], [3, true]);
r = chamar('POST', '/api/montagem/reservar', { codigo:'BEGE140' });
eq('Ana bipa o mesmo SKU em outro tablet: a mesma reserva', [r.body.fila_id, r.body.nova], [bHoje, false]);
eq('…e só uma reserva dela', db.prepare('SELECT COUNT(*) c FROM embalagem_reserva WHERE usuario_id=1').get().c, 1);
r = chamar('POST', '/api/montagem/reservar', { codigo:'BEGE140' }, RUI);
eq('Rui reserva a segunda hoje', r.body.fila_id, bHoje2);
r = chamar('POST', '/api/montagem/reservar', { codigo:'BEGE140' }, { id:3, nome:'Lia' });
eq('Lia fica com a de reposição', r.body.fila_id, bEst);
r = chamar('POST', '/api/montagem/reservar', { codigo:'BEGE140' }, { id:4, nome:'Edu' });
eq('Edu: todas com outras pessoas → 409 no 1º bipe', [r.status, r.body.motivo], [409, 'reservada']);
ok('…dizendo quem', /sendo embalada por (Ana|Rui|Lia)/.test(r.body.erro), r.body.erro);
r = chamar('POST', '/api/montagem/reservar', { codigo:'KIT32' });
eq('kit não reserva', [r.status, r.body.sem_reserva], [200, true]);
r = chamar('POST', '/api/montagem/reservar', { codigo:'REPO180' }, { id:3, nome:'Lia' });
ok('Lia bipa outro SKU: a reserva troca', db.prepare('SELECT codigo FROM embalagem_reserva WHERE usuario_id=3').get().codigo === 'REPO180');
ok('…e a peça de reposição da BEGE140 volta livre', !db.prepare('SELECT 1 FROM embalagem_reserva WHERE fila_id=?').get(bEst));

console.log('\n── 4. o bipe final consome a reservada ──');
r = chamar('POST', '/api/montagem', { codigo:'BEGE140', segundos:60, kit_ok:1, kit_codigo:KIT }, RUI);
eq('Rui embala: 200', r.status, 200);
eq('…a linha dele (a 2ª hoje), não a mais antiga', [sit(bHoje2), sit(bHoje), sit(bEst)], ['embalado', 'aguardando', 'aguardando']);
ok('…e a reserva dele some', !db.prepare('SELECT 1 FROM embalagem_reserva WHERE usuario_id=2').get());
eq('a barra anda: 1 venda destravada', prio().dia.n, 3);

console.log('\n── 5. a reserva vence em 5 minutos ──');
db.prepare("UPDATE embalagem_reserva SET ultimo_bipe=datetime('now','localtime','-6 minutes') WHERE usuario_id=1").run();
p = prio(RUI);
eq('vencida, a peça da Ana volta a ser aqui para o Rui', p.dia.linhas[0].sendo, []);
r = chamar('POST', '/api/montagem/reservar', { codigo:'BEGE140' });
ok('Ana bipa de novo depois de vencida: ganha uma peça de volta', r.status === 200 && r.body.fila_id != null, JSON.stringify(r.body));
db.prepare("UPDATE embalagem_reserva SET ultimo_bipe=datetime('now','localtime','-4 minutes') WHERE usuario_id=1").run();
r = chamar('POST', '/api/montagem/renovar', { codigo:'BEGE140' });
eq('o bipe do kit renova', r.body.reservada, true);
eq('…e com 4 min ela ainda vale', prio(RUI).dia.linhas[0].sendo, ['Ana']);

console.log('\n── 6. o bipe fora da prioridade fica registrado ──');
r = chamar('POST', '/api/montagem/renovar', { codigo:'REPO180', codigo_dia:'BEGE140', segundos:12 }, { id:3, nome:'Lia' });
const ev = db.prepare("SELECT * FROM montagem_evento WHERE tipo='fora_prioridade'").get();
eq('fora_prioridade: quem, o SKU embalado e o do dia', [ev && ev.usuario_nome, ev && ev.codigo, ev && ev.detalhe], ['Lia', 'REPO180', 'BEGE140']);
r = chamar('POST', '/api/montagem/cancelar', { codigo:'REPO180', trocou:1, codigo_dia:'BEGE140', segundos:15 }, { id:3, nome:'Lia' });
const ev2 = db.prepare("SELECT * FROM montagem_evento WHERE tipo='trocou_prioridade'").get();
eq('trocar pelo botão (sem peça do dia na mão): o evento e a reserva solta', [ev2 && ev2.detalhe, !!db.prepare('SELECT 1 FROM embalagem_reserva WHERE usuario_id=3').get()], ['BEGE140', false]);

console.log('\n── 7. cancelar e defeito soltam; o defeito marca a reservada ──');
chamar('POST', '/api/montagem/cancelar', { codigo:'BEGE140', segundos:5 });
ok('cancelar solta a reserva da Ana', !db.prepare('SELECT 1 FROM embalagem_reserva WHERE usuario_id=1').get());
r = chamar('POST', '/api/montagem/reservar', { codigo:'BEGE140' }, RUI);
eq('Rui reserva a hoje que sobrou', r.body.fila_id, bHoje);
const MOT = (db.prepare("SELECT valor FROM listas WHERE tipo='rejeicao' AND ativo=1 ORDER BY ordem,id").get() || {}).valor;
if(MOT){
  r = chamar('POST', '/api/montagem/defeito', { codigo:'BEGE140', motivo:MOT, segundos:20 }, RUI);
  eq('defeito: 200', r.status, 200);
  eq('…marca a reservada (a hoje), e não a mais antiga (a de reposição)', [sit(bHoje), sit(bEst)], ['defeito', 'aguardando']);
  ok('…e a reserva solta', !db.prepare('SELECT 1 FROM embalagem_reserva WHERE usuario_id=2').get());
} else {
  ok('(sem a lista de motivos neste banco: o defeito é conferido no teste_defeito_volta.js)', true);
}

console.log('\n── 8. sem reserva (página antiga em cache): a ordem hoje → estoque → devolução ──');
const x1 = fila('REPO180', 'devolucao'), x2 = fila('REPO180', 'hoje');
db.prepare('DELETE FROM embalagem_reserva').run();
r = chamar('POST', '/api/montagem', { codigo:'REPO180', segundos:60, kit_ok:1, kit_codigo:KIT });
eq('sem reserva, sai a de modo hoje, mesmo sendo a mais nova', sit(x2), 'embalado');
ok('…e a devolução fica para o fim', sit(x1) === 'aguardando');
r = chamar('POST', '/api/montagem/reservar', { codigo:'REPO180' }, RUI);
const depoisRui = r.body.fila_id;
r = chamar('POST', '/api/montagem', { codigo:'REPO180', segundos:60, kit_ok:1, kit_codigo:KIT });
ok('sem reserva, a Ana não pega a peça reservada pelo Rui', sit(depoisRui) === 'aguardando');

console.log('\n── 8-B. a peça reservada por outra pessoa não se consome no fim (③ revisão) ──');
db.prepare('DELETE FROM embalagem_reserva').run();
const u1 = fila('UNICA', 'estoque');
db.prepare("INSERT INTO skus (codigo,cor,estoque,modelo_id,largura_cm,altura_cm) VALUES ('UNICA','Bege',0,1,110,110)").run();
r = chamar('POST', '/api/montagem/reservar', { codigo:'UNICA' });
eq('caso A: Ana reserva a única', r.body.fila_id, u1);
r = chamar('POST', '/api/montagem', { codigo:'UNICA', segundos:60, kit_ok:1, kit_codigo:KIT }, RUI);
eq('…Rui, sem reserva (página antiga), leva 409 reservada no fim', [r.status, r.body.motivo], [409, 'reservada']);
eq('…e a peça da Ana continua esperando', sit(u1), 'aguardando');
r = chamar('POST', '/api/montagem', { codigo:'UNICA', segundos:60, kit_ok:1, kit_codigo:KIT });
eq('…Ana fecha: 200, a linha dela', [r.status, sit(u1)], [200, 'embalado']);
const u2 = fila('UNICA', 'estoque');
chamar('POST', '/api/montagem/reservar', { codigo:'UNICA' });
db.prepare("UPDATE embalagem_reserva SET ultimo_bipe=datetime('now','localtime','-6 minutes') WHERE usuario_id=1").run();
r = chamar('POST', '/api/montagem/reservar', { codigo:'UNICA' }, RUI);
eq('caso B: a da Ana venceu, Rui reserva a mesma', r.body.fila_id, u2);
r = chamar('POST', '/api/montagem', { codigo:'UNICA', segundos:60, kit_ok:1, kit_codigo:KIT });
eq('…Ana (reserva vencida) leva 409 no fim', [r.status, r.body.motivo], [409, 'reservada']);
r = chamar('POST', '/api/montagem', { codigo:'UNICA', segundos:60, kit_ok:1, kit_codigo:KIT }, RUI);
eq('…Rui, com a reserva válida, fecha', [r.status, sit(u2)], [200, 'embalado']);

console.log('\n── 8-C. trocar para a peça do dia não perde a embalagem de antes (③ revisão) ──');
db.prepare('DELETE FROM embalagem_reserva').run();
const t1 = fila('UNICA', 'estoque'), t2 = fila('BEGE140', 'hoje');
chamar('POST', '/api/montagem/reservar', { codigo:'UNICA' });
chamar('POST', '/api/montagem/reservar', { codigo:'BEGE140' }, RUI);
const livresBege = db.prepare("SELECT id FROM fila WHERE codigo='BEGE140' AND situacao='aguardando' AND id NOT IN (SELECT fila_id FROM embalagem_reserva)").all().map(x=>x.id);
for(const id of livresBege) db.prepare('INSERT INTO embalagem_reserva (fila_id,codigo,usuario_id,usuario_nome) VALUES (?,?,?,?)').run(id,'BEGE140',9,'Zé');
r = chamar('POST', '/api/montagem/reservar', { codigo:'BEGE140' });
eq('Ana tenta a do dia e todas estão com outros: 409', r.status, 409);
eq('…e a reserva dela de antes continua', (db.prepare('SELECT fila_id FROM embalagem_reserva WHERE usuario_id=1').get() || {}).fila_id, t1);
db.prepare('DELETE FROM embalagem_reserva WHERE usuario_id IN (2,9)').run();
r = chamar('POST', '/api/montagem/reservar', { codigo:'BEGE140' });
ok('com peça livre, a reserva passa para a do dia', r.status === 200 && db.prepare('SELECT codigo FROM embalagem_reserva WHERE usuario_id=1').get().codigo === 'BEGE140');
chamar('POST', '/api/montagem/cancelar', { codigo:'UNICA', trocou:1, manter:1, codigo_dia:'BEGE140', segundos:9 });
eq('o cancelar da troca não solta a reserva nova', (db.prepare('SELECT codigo FROM embalagem_reserva WHERE usuario_id=1').get() || {}).codigo, 'BEGE140');
void t2;
db.prepare('DELETE FROM embalagem_reserva').run();
chamar('POST', '/api/montagem/reservar', { codigo:'UNICA' });
r = chamar('POST', '/api/montagem/reservar', { codigo:'BRANCO999' });
eq('reservar SKU sem nenhuma peça esperando: fila_id nulo', [r.status, r.body.fila_id], [200, null]);
eq('…e a reserva de antes continua (a troca não acontece)', (db.prepare('SELECT codigo FROM embalagem_reserva WHERE usuario_id=1').get() || {}).codigo, 'UNICA');

console.log('\n── 8-D. o SKU do dia com todas as peças com outra pessoa (③ revisão) ──');
db.prepare('DELETE FROM embalagem_reserva').run();
db.prepare("INSERT INTO skus (codigo,cor,estoque,modelo_id,largura_cm,altura_cm) VALUES ('UMA120','Bege',0,1,120,120)").run();
venda('UMA120'); venda('UMA120');
fila('UMA120', 'estoque');
chamar('POST', '/api/montagem/reservar', { codigo:'UMA120' });          // Ana fica com a única
p = prio(RUI);
const todos = p.dia.linhas.concat(p.hoje, p.reposicao, p.devolucao);
ok('para o Rui, UMA120 não está em bloco nenhum (nada para ele embalar)', !todos.some(x => x.codigo === 'UMA120'));
eq('mas vem na lista das que estão só com outra pessoa, para o bipe dele dizer quem está com ela', (p.so_reservadas || []).filter(x => x.codigo === 'UMA120').map(x => x.sendo), [['Ana']]);
ok('com os ids da fila (soltar a reserva depois não acende a faixa NOVA)', ((p.so_reservadas || []).find(x => x.codigo === 'UMA120') || {}).ids?.length === 1);
r = chamar('POST', '/api/montagem/reservar', { codigo:'UMA120' }, RUI);
eq('e o bipe do Rui é 409 reservada (não "não passou pela Revisão")', [r.status, r.body.motivo], [409, 'reservada']);
db.prepare('DELETE FROM embalagem_reserva').run();

console.log('\n── 9. o dia feito ──');
db.prepare("DELETE FROM lote").run();
p = prio();
eq('sem venda de hoje parada: bloco 1 vazio', [p.dia.linhas.length, p.dia.m], [0, 0]);
venda('HOJE100');
p = prio();
eq('todas com peça ✓', [p.dia.m, p.dia.n, p.dia.todas], [1, 1, true]);

console.log('\n── 10. a tela 102 (o texto do código) ──');
{
  const tela = fs.readFileSync(path.join(__dirname, 'public', 'montagem.html'), 'utf8');
  ok('o bipe durante a troca não vale e diz isso', /if\(emb && emb\.trocando\)\{ emb\.foraErro=/.test(tela));
  ok('a troca pergunta ao servidor (fila_id nulo = não está aqui), e não à lista parada', /else if\(r\.fila_id==null\)/.test(tela) && !/function trocar[\s\S]{0,600}naoNaFila/.test(tela));
  ok('cancelar e defeito ficam barrados durante a troca', /async function cancelarEmb\(\)\{\s*const cur=emb; if\(!cur \|\| cur\.enviando \|\| cur\.trocando\)/.test(tela) && /async function enviarDefeito[^{]*\{\s*const cur=emb; if\(!cur \|\| cur\.enviando \|\| cur\.trocando\)/.test(tela));
  ok('o botão "Vou embalar a do dia" também reserva antes de cancelar', /trocar\(i\|\|null, true\)/.test(tela) && /if\(info && !peloBotao\)\{ abrir\(info\); return; \}/.test(tela));
  ok('o registro da troca grava o SKU para onde se trocou', /codigo_dia:\(info\?info\.codigo:dia\)/.test(tela));
  ok('depois da recusa, o aviso não manda trocar pela mesma peça', /emb\.foraRecusada===d\.codigo\?'':/.test(tela));
  ok('o cartão do dia mostra "para embalar", e não estoque nem produção (24/11/2026)', /<span>para embalar<\/span>/.test(tela) && !/com peça'/.test(tela) && !/na produção'/.test(tela));
  ok('a barra do topo diz quantas peças do dia faltam embalar', /faltam embalar <b>'\+fe\+'<\/b>/.test(tela));
  ok('a peça só com outra pessoa entra na trava da Revisão da tela (FILA), e não vira "não passou pela Revisão"', /p\.so_reservadas/.test(tela));
  ok('e os ids dela entram no que a tela já viu (a faixa NOVA)', /const todos=\[\]\.concat\([^)]*p\.so_reservadas/.test(tela));
  ok('o aviso do bipe fora da prioridade conta só o que é para embalar do dia', /d\.para_embalar/.test(tela.slice(tela.indexOf('function mostrarFora'), tela.indexOf('function renovar'))));
  ok('o selo NOVA só com peça aqui', /NOVA===d\.codigo&&d\.aqui/.test(tela));
  ok('a faixa NOVA nasce dos ids da fila, e não do número "aqui"', /VISTOS\.has\(id\)/.test(tela));
  ok('sem a prioridade, a lista cai no /api/fila', /fetch\('\/api\/fila'\)/.test(tela));
}

/* A permissão das rotas novas (reservar, renovar, prioridade) é conferida pelo
   teste_cobertura.js, que sobe os módulos de verdade: rota sem linha nasce negada. */

fs.rmSync(tmp, { recursive:true, force:true });
console.log(falhas ? '\n' + falhas + ' de ' + n + ' FALHARAM' : '\ntodos os ' + n + ' passaram');
process.exit(falhas ? 1 : 0);
