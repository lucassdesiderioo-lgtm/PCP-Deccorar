#!/usr/bin/env node
/* teste_inventario.js — a conferencia de estoque em duas pessoas (versao 2).
 *
 *   node teste_inventario.js
 *
 * Spec ESTOQUE-LIVRO-E-CONFERENCIA, fase 2 (26/09/2026) refeita pela versao 2
 * (04/11/2026), e fase 3 (quinzenal e geral). Os casos sao os da §10 da spec:
 *
 *   - o JSON de quem conta nao traz saldo nem contagem anterior;
 *   - A=B aplica SOZINHO; A≠B pede C; C bate com um e aplica; C nao bate e vai
 *     para a fila do admin; o admin precisa de motivo e nao pode ter contado;
 *   - a mesma pessoa e recusada em qualquer posicao, INCLUSIVE ADMIN GERAL;
 *   - embalagem e etiqueta ENTRE A e B nao geram furo falso (§5.5);
 *   - embalagem ou etiqueta DURANTE a contagem invalida so ela (§5.5-B);
 *   - a lista do dia: 8, uma vez por dia, ordem, folga, sobra de ontem, fim
 *     de semana, antes das 7h;
 *   - o rodizio, a tarja e as 10h;
 *   - a quinzenal e a geral;
 *   - e o livro fecha: SUM(delta) = skus.estoque depois de tudo.
 *
 * Sobe um banco temporario e chama os handlers direto, com um `app` de
 * mentira. O relogio e trocado pelo `relogio.fixar`. Nao abre porta.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');
const RELOGIO = require('./relogio');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, JSON.stringify(achado) === JSON.stringify(esperado), 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

RELOGIO.fixar('2026-11-09 06:30:00');     // segunda-feira, antes das 7h
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
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, estagio TEXT DEFAULT 'pendente',
    embalado_em TEXT, baixado_em TEXT, teste INTEGER DEFAULT 0);
  CREATE TABLE lote_item (id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER, codigo TEXT, qtd INTEGER DEFAULT 1);
  CREATE TABLE venda_futura (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, data_venda TEXT, data_envio TEXT, cancelada INTEGER DEFAULT 0);
  CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nome TEXT, ativo INTEGER DEFAULT 1);
  INSERT INTO modelo (id,nome,sob_medida) VALUES (1,'Rolô',0),(2,'Sob medida',1);
`);
// 14 SKUs ativos de rolo + 1 sob medida + 1 inativo
const SKUS = [];
for(let i = 0; i < 14; i++){
  const c = 'BK' + String(100 + i * 10) + '140BEGE';
  SKUS.push(c);
  db.prepare('INSERT INTO skus (codigo,descricao,estoque,largura_cm,altura_cm,cor,modelo_id) VALUES (?,?,?,?,?,?,1)')
    .run(c, 'Rolo', 5, 100 + i * 10, 140, 'Bege');
}
db.exec(`INSERT INTO skus (codigo,descricao,estoque,modelo_id) VALUES ('SOBMEDIDA','Sob medida',0,2);
  INSERT INTO skus (codigo,descricao,estoque,modelo_id,ativo) VALUES ('BKVELHOINATIVO','velho',3,1,0);`);
const ESTOQUE = require('./estoque_dominio');
ESTOQUE.garantirSchema(db);   // o livro, com a abertura carimbando o saldo semeado

/* Vendas: os quatro primeiros SKUs vendem (tem cobertura), em ritmos diferentes. */
const venda = db.prepare("INSERT INTO venda_futura (codigo,data_venda) VALUES (?, date('now','localtime','-2 days'))");
[[SKUS[0], 30], [SKUS[1], 3], [SKUS[2], 60], [SKUS[3], 10]].forEach(([c, k]) => { for(let i = 0; i < k; i++) venda.run(c); });

const PERMS = {};              // quem tem o que: PERMS[id] = Set de chaves
const ADMIN_GERAL = new Set();
const rotas = {};
const app = {
  locals:{ acesso:{
    podePermissao(u, chave){ return !!(u && (ADMIN_GERAL.has(u.id) || (PERMS[u.id] && PERMS[u.id].has(chave)))); },
    permissoesDe(uid){ return ADMIN_GERAL.has(uid) ? new Set(['contagem.contar','contagem.desempatar']) : (PERMS[uid] || new Set()); },
    ehAdminGeral(uid){ return ADMIN_GERAL.has(uid); },
    auditar(){}
  }},
  get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; }
};
require('./inventario_route')(app, db);
const INV = require('./inventario_dominio');

const CONTA = ['contagem.contar','contagem.desempatar'];
const gente = [[1,'Ana'],[2,'Bia'],[3,'Caio'],[4,'Davi'],[5,'Lucas']];
gente.forEach(([id,nome]) => db.prepare('INSERT INTO usuarios (id,nome) VALUES (?,?)').run(id, nome));
const ANA={id:1,nome:'Ana'}, BIA={id:2,nome:'Bia'}, CAIO={id:3,nome:'Caio'}, DAVI={id:4,nome:'Davi'}, LUCAS={id:5,nome:'Lucas'};
PERMS[1] = new Set(CONTA); PERMS[2] = new Set(CONTA); PERMS[3] = new Set(CONTA);
PERMS[4] = new Set(['contagem.desempatar']);   // so desempata: nunca e escalado
ADMIN_GERAL.add(5);                            // o dono: passa em tudo por nivel, e NAO entra no rodizio

function chamar(metodo, rota, corpo, quem, query){
  const h = rotas[metodo+' '+rota];
  if(!h) throw new Error('rota nao registrada: '+metodo+' '+rota);
  let st = 200, out;
  const res = { status(s){ st = s; return this; }, json(o){ out = o; return this; } };
  h({ body: corpo || {}, usuario: quem, query: query || {} }, res);
  return Object.assign({ __st: st }, out);
}
const hoje = q => chamar('GET','/api/inventario/hoje',null,q);
const bipe = (q, c, extra) => chamar('POST','/api/inventario/bipe',Object.assign({codigo:c}, extra || {}),q);
const term = (q, c, extra) => chamar('POST','/api/inventario/terminar',Object.assign({codigo:c}, extra || {}),q);
function contarN(q, c, k){ if(k === 0) return bipe(q, c, {abrir:true}); let r; for(let i = 0; i < k; i++) r = bipe(q, c); return r; }
const item = c => db.prepare('SELECT * FROM inventario_item WHERE codigo=? ORDER BY id DESC LIMIT 1').get(c);
const saldo = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
function livroBate(){
  const ruins = db.prepare(`SELECT s.codigo FROM skus s LEFT JOIN (SELECT codigo, SUM(delta) t FROM movimento_estoque GROUP BY codigo) m
    ON m.codigo=s.codigo WHERE COALESCE(m.t,0) <> s.estoque`).all();
  return ruins.length === 0 ? true : ruins.map(r => r.codigo).join(',');
}
function varreSaldo(o){
  const proib = /^(saldo|estoque|saldo_na_contagem|saldo2|saldo3|contado1|contado2|contado3|diferenca)$/;
  const achou = [];
  (function v(x){ if(x && typeof x === 'object'){ for(const k in x){ if(proib.test(k)) achou.push(k); v(x[k]); } } })(o);
  return achou;
}

console.log('\n── antes das 7h e no fim de semana não há lista ──');
eq('antes das 7h a lista vem vazia', hoje(ANA).itens.length, 0);
eq('antes das 7h nenhum ciclo do dia nasceu', db.prepare("SELECT COUNT(*) n FROM inventario_ciclo WHERE tipo='diario'").get().n, 0);
RELOGIO.fixar('2026-11-08 09:00:00');   // domingo
eq('domingo não gera lista', hoje(ANA).itens.length, 0);
RELOGIO.fixar('2026-11-07 09:00:00');   // sábado
eq('sábado não gera lista (padrão segunda a sexta)', db.prepare("SELECT COUNT(*) n FROM inventario_ciclo").get().n + hoje(ANA).itens.length, 0);

console.log('\n── a lista do dia: 8 SKUs, na ordem, uma vez por dia ──');
/* Travou ontem: o SKU 13 (que nunca vende) teve a etiqueta recusada. E o SKU
   12 foi "conferido" ha 2 dias: a folga o tira da lista. */
INV.registrarRecusa(db, { codigo: SKUS[13], usuario_nome:'Edu', lote_id: 1 });
db.prepare(`INSERT INTO inventario_ciclo (id,tipo,aberto_por,aberto_em,status,data) VALUES (900,'ciclico','x','2026-11-07 08:00:00','fechado','2026-11-07')`).run();
db.prepare(`INSERT INTO inventario_item (ciclo_id,codigo,status,contado1,saldo_na_contagem,em1) VALUES (900,?,'confirmado',5,5,'2026-11-07 08:10:00')`).run(SKUS[12]);
db.prepare(`INSERT INTO inventario_item (ciclo_id,codigo,status,contado1,saldo_na_contagem,em1) VALUES (900,?,'confirmado',5,5,'2026-10-20 08:10:00')`).run(SKUS[11]);
RELOGIO.fixar('2026-11-09 07:05:00');   // segunda, 7h05
const l1 = hoje(ANA);
const ciclo1 = db.prepare("SELECT * FROM inventario_ciclo WHERE tipo='diario'").get();
ok('às 7h a lista do dia nasceu', !!ciclo1 && ciclo1.data === '2026-11-09');
const itensDia = db.prepare('SELECT codigo, degrau FROM inventario_item WHERE ciclo_id=? ORDER BY ordem').all(ciclo1.id);
eq('a lista tem 8 SKUs', itensDia.length, 8);
eq('o 1º é o que TRAVOU na etiqueta (degrau 1), mesmo sem venda', itensDia[0], { codigo:SKUS[13], degrau:1 });
eq('depois a menor cobertura: 5 peças ÷ 2/dia antes de 5 ÷ 1/dia antes de 5 ÷ 0,33/dia antes de 5 ÷ 0,1/dia',
   itensDia.slice(1, 5).map(i => i.codigo), [SKUS[2], SKUS[0], SKUS[3], SKUS[1]]);
ok('depois os nunca conferidos (degrau 3)', itensDia.slice(5).every(i => i.degrau === 3), JSON.stringify(itensDia));
ok('o conferido há 2 dias NÃO entra (folga de 7)', !itensDia.some(i => i.codigo === SKUS[12]));
ok('sob medida e inativo nunca entram', !itensDia.some(i => i.codigo === 'SOBMEDIDA' || i.codigo === 'BKVELHOINATIVO'));
hoje(BIA); hoje(ANA);
eq('a lista nasce UMA vez por dia', db.prepare("SELECT COUNT(*) n FROM inventario_ciclo WHERE tipo='diario'").get().n, 1);
RELOGIO.fixar('2026-11-09 15:00:00');
INV.registrarRecusa(db, { codigo: SKUS[12], usuario_nome:'Edu', lote_id: 2 });
hoje(ANA);
RELOGIO.fixar('2026-11-09 07:05:00');
eq('e não muda durante o dia (a recusa da tarde fica para amanhã)', db.prepare('SELECT COUNT(*) n FROM inventario_item WHERE ciclo_id=?').get(ciclo1.id).n, 8);

console.log('\n── o rodízio e a tarja ──');
const esc = db.prepare('SELECT usuario_nome FROM inventario_escala WHERE ciclo_id=? ORDER BY id').all(ciclo1.id).map(e => e.usuario_nome);
eq('às 7h escalou duas pessoas, as há mais tempo sem escala (empate: nome)', esc, ['Ana','Bia']);
ok('o Admin Geral não entra no rodízio só pelo nível', esc.indexOf('Lucas') < 0);
ok('quem só desempata nunca é escalado', esc.indexOf('Davi') < 0);
const tA = chamar('GET','/api/inventario/tarja',null,ANA).tarja;
ok('a tarja diz o nome da outra escalada e o prazo', tA && /sua e de Bia/.test(tA.texto) && /faltam 8 de 8/.test(tA.texto) && /até 10h/.test(tA.texto), tA && tA.texto);
eq('quem não é escalada não recebe a tarja antes das 10h', chamar('GET','/api/inventario/tarja',null,CAIO).tarja, null);
eq('quem não tem a chave não recebe a tarja', chamar('GET','/api/inventario/tarja',null,{id:77,nome:'Zé'}).tarja, null);
eq('quem não é escalada não vê a lista antes das 10h', hoje(CAIO).itens.length, 0);
eq('e o bipe dela é recusado', bipe(CAIO, SKUS[2]).motivo, 'nao_escalada');

console.log('\n── o JSON de quem conta é cego ──');
const lA = hoje(ANA);
eq('a escalada vê os 8', lA.itens.length, 8);
eq('nenhum saldo, estoque ou contagem no JSON da lista', varreSaldo(lA), []);

console.log('\n── A = B: aplica sozinho ──');
// SKU 2: sistema 5. A e B contam 3 → −2, sem aprovação.
let r = contarN(ANA, SKUS[2], 3);
eq('o bipe responde só "contado"', Object.keys(r).sort(), ['__st','codigo','contado','ok']);
r = term(ANA, SKUS[2]);
eq('o terminei não diz se bateu', varreSaldo(r), []);
eq('A=3 contra 5: vai para a 2ª contagem', item(SKUS[2]).status, 'recontar');
eq('a mesma pessoa é recusada como B', bipe(ANA, SKUS[2]).motivo, 'mesma_pessoa');
const vistoB = hoje(BIA).itens.find(i => i.codigo === SKUS[2]);
ok('B vê o SKU como 2ª contagem, sem o número da 1ª', vistoB && vistoB.rodada === 2 && varreSaldo(vistoB).length === 0);
contarN(BIA, SKUS[2], 3); term(BIA, SKUS[2]);
eq('A=B=3 contra 5: aplicou SOZINHO, sem aprovação', item(SKUS[2]).status, 'aplicado');
eq('o saldo virou 3', saldo(SKUS[2]), 3);
const lin = db.prepare("SELECT * FROM movimento_estoque WHERE codigo=? AND tipo='inventario'").get(SKUS[2]);
ok('uma linha `inventario` −2 no livro, em nome de quem fechou (B), sem motivo', lin && lin.delta === -2 && lin.usuario_nome === 'Bia' && lin.motivo === null, JSON.stringify(lin));
eq('nada na fila do admin', chamar('GET','/api/inventario/aprovacao',null,LUCAS).itens.length, 0);

console.log('\n── A = B = sistema: confirma, nenhuma linha ──');
contarN(ANA, SKUS[0], 5); term(ANA, SKUS[0]);
eq('A=5 com 5: confirmado na 1ª', item(SKUS[0]).status, 'confirmado');
eq('nenhuma linha de inventário', db.prepare("SELECT COUNT(*) n FROM movimento_estoque WHERE codigo=? AND tipo='inventario'").get(SKUS[0]).n, 0);

console.log('\n── A ≠ B: a 3ª contagem ──');
contarN(ANA, SKUS[3], 3); term(ANA, SKUS[3]);
contarN(BIA, SKUS[3], 4); term(BIA, SKUS[3]);
eq('A=3, B=4: pede a 3ª', item(SKUS[3]).status, 'terceira');
eq('quem contou A não faz a C', bipe(ANA, SKUS[3]).motivo, 'mesma_pessoa');
eq('quem contou B não faz a C', bipe(BIA, SKUS[3]).motivo, 'mesma_pessoa');
ok('a 3ª aparece para quem desempata, mesmo fora da escala e antes das 10h', hoje(DAVI).itens.some(i => i.codigo === SKUS[3] && i.rodada === 3));
const tD = chamar('GET','/api/inventario/tarja',null,DAVI).tarja;
ok('e a tarja volta para ele dizendo da 3ª', tD && /3ª contagem/.test(tD.texto), tD && tD.texto);
contarN(DAVI, SKUS[3], 3); term(DAVI, SKUS[3]);
eq('C=3 bateu com A: aplicou sozinho', item(SKUS[3]).status, 'aplicado');
eq('saldo 5 → 3', saldo(SKUS[3]), 3);

contarN(ANA, SKUS[1], 3); term(ANA, SKUS[1]);
contarN(BIA, SKUS[1], 4); term(BIA, SKUS[1]);
contarN(LUCAS, SKUS[1], 5); term(LUCAS, SKUS[1]);
eq('A=3, B=4, C=5 (sistema 5): ninguém bateu → fila do admin', item(SKUS[1]).status, 'aprovar');
eq('o saldo NÃO mudou', saldo(SKUS[1]), 5);
const fila = chamar('GET','/api/inventario/aprovacao',null,DAVI).itens;
ok('a fila mostra as três contagens e os três saldos', fila.length === 1 && fila[0].contagens.length === 3 && fila[0].sem_acordo);
const idF = fila[0].id;
eq('o Admin Geral que contou a C não resolve', chamar('POST','/api/inventario/aprovar',{id:idF,motivo:'Outro',obs:'x'},LUCAS).motivo, 'mesma_pessoa');
PERMS[4].add('contagem.resolver');
eq('resolver sem motivo é recusado', chamar('POST','/api/inventario/aprovar',{id:idF},DAVI).__st, 400);
eq('"Outro" sem observação é recusado', chamar('POST','/api/inventario/aprovar',{id:idF,motivo:'Outro'},DAVI).__st, 400);
r = chamar('POST','/api/inventario/aprovar',{id:idF,motivo:'Perda ou avaria',diferenca:-1},DAVI);
eq('Davi (não contou) aplica −1 com motivo', [r.ok, saldo(SKUS[1])], [true, 4]);
eq('o item fica decidido, com quem e o motivo', [item(SKUS[1]).status, item(SKUS[1]).decidido_por, item(SKUS[1]).motivo], ['aprovado','Davi','Perda ou avaria']);

console.log('\n── o que andou ENTRE as contagens não atrapalha (§5.5) ──');
// SKU 4: sistema 5, prateleira tem 3 (furo −2)
contarN(ANA, SKUS[4], 3); term(ANA, SKUS[4]);
ESTOQUE.movimentar(db, { codigo:SKUS[4], delta:1, tipo:'embalagem', referencia:'montagem:1' });   // +1 na prateleira
db.prepare("INSERT INTO lote (codigo,estagio,embalado_em) VALUES (?, 'embalado', datetime('now','localtime'))").run(SKUS[4]); // etiqueta: −1 no livre
contarN(BIA, SKUS[4], 3); term(BIA, SKUS[4]);   // prateleira: 3 +1 −1 = 3
eq('embalagem e etiqueta entre A e B: as diferenças batem (−2 e −2) e aplica', item(SKUS[4]).status, 'aplicado');
eq('o −2 vale sobre o saldo de agora (5 +1 −2 = 4)', saldo(SKUS[4]), 4);

console.log('\n── mexeram DURANTE a contagem: conta de novo (§5.5-B) ──');
contarN(ANA, SKUS[5], 2);
ESTOQUE.movimentar(db, { codigo:SKUS[5], delta:1, tipo:'embalagem', referencia:'montagem:2' });
r = term(ANA, SKUS[5]);
ok('a embalagem no meio da contagem: 409, "conte de novo"', r.__st === 409 && r.invalidada && /conte de novo/.test(r.erro), JSON.stringify(r));
eq('a contagem não foi gravada (continua a 1ª, sem contado1)', [item(SKUS[5]).status, item(SKUS[5]).contado1, item(SKUS[5]).rascunho], ['a_contar', null, null]);
contarN(ANA, SKUS[5], 6); term(ANA, SKUS[5]);
eq('recontada na hora pela MESMA pessoa (não é 2ª contagem): 6 com 6, confirma', item(SKUS[5]).status, 'confirmado');
contarN(ANA, SKUS[6], 1);
db.prepare("INSERT INTO lote (codigo,estagio,embalado_em) VALUES (?, 'embalado', datetime('now','localtime'))").run(SKUS[6]);
eq('a etiqueta impressa no meio também invalida (o livre mudou)', term(ANA, SKUS[6]).invalidada, true);
contarN(ANA, SKUS[6], 4); term(ANA, SKUS[6]);
eq('e recontando bate com o livre (5 − 1)', item(SKUS[6]).status, 'confirmado');
contarN(ANA, SKUS[13], 0);
const lt = db.prepare("SELECT id FROM lote WHERE codigo=?").get(SKUS[4]);
db.prepare("UPDATE lote SET baixado_em=datetime('now','localtime') WHERE id=?").run(lt.id);
ESTOQUE.movimentar(db, { codigo:SKUS[4], delta:-1, tipo:'conferencia', referencia:'lote:'+lt.id });
ok('conferência de OUTRO SKU não invalida', !term(ANA, SKUS[13], {nenhuma:true}).invalidada);

console.log('\n── "Não tem nenhuma" e a lista que não muda ──');
eq('"não tem nenhuma" com 5 no sistema: vai para a 2ª', item(SKUS[13]).status, 'recontar');
contarN(BIA, SKUS[13], 2);
eq('"não tem nenhuma" depois de bipar é recusado', term(BIA, SKUS[13], {nenhuma:true}).motivo, 'bipou');
eq('SKU fora da lista do dia é recusado no bipe', bipe(ANA, SKUS[9]).motivo, 'fora_da_lista');

console.log('\n── às 10h, o que a escalada não começou abre para o setor ──');
RELOGIO.fixar('2026-11-09 10:01:00');
eq('as duas começaram: não abre para todos', hoje(CAIO).itens.length, 0);
console.log('\n── dia seguinte: sobra de ontem primeiro ──');
RELOGIO.fixar('2026-11-10 07:10:00');
const l2 = hoje(CAIO);
const ciclo2 = db.prepare("SELECT * FROM inventario_ciclo WHERE tipo='diario' AND data='2026-11-10'").get();
const it2 = db.prepare('SELECT codigo, degrau, status, contado1 FROM inventario_item WHERE ciclo_id=? ORDER BY ordem, id').all(ciclo2.id);
const sobras = it2.filter(i => i.degrau === 0).map(i => i.codigo).sort();
eq('o que ficou sem contagens entra no topo (degrau 0)', sobras, [SKUS[13]]);
eq('a sobra guarda a 1ª contagem feita ontem (o "não tem nenhuma")', it2.find(i => i.codigo === SKUS[13]).contado1, 0);
ok('e a contagem pela metade de ontem não vem junto', it2.find(i => i.codigo === SKUS[13]).status === 'recontar');
eq('a lista completa com o que a FOLGA deixa: 1 sobra + 1 travou + 4 nunca conferidos + 1 há mais de 7 dias (o resto foi conferido ontem)', it2.length, 7);
ok('a recusa de ontem à tarde entrou hoje (degrau 1)', it2.some(i => i.codigo === SKUS[12] && i.degrau === 1), JSON.stringify(it2));
const esc2 = db.prepare('SELECT usuario_nome FROM inventario_escala WHERE ciclo_id=? ORDER BY id').all(ciclo2.id).map(e => e.usuario_nome);
eq('a escala de hoje pega quem está há mais tempo sem escala (Caio nunca foi) e depois o nome', esc2, ['Caio','Ana']);
db.prepare('UPDATE usuarios SET ativo=0 WHERE id=3').run();
RELOGIO.fixar('2026-11-10 10:30:00');
const l3 = hoje(BIA);
ok('às 10h, com a escalada sem começar, a lista abre para o setor', l3.itens.length > 0);
const marca = db.prepare("SELECT usuario_nome FROM inventario_escala WHERE ciclo_id=? AND abriu_para_todos_em IS NOT NULL").all(ciclo2.id).map(e => e.usuario_nome).sort();
eq('e a escala registra quem não começou', marca, ['Ana','Caio']);
const tB = chamar('GET','/api/inventario/tarja',null,BIA).tarja;
ok('a tarja aparece para o setor', tB && /aberta para todo o setor/.test(tB.texto), tB && tB.texto);

console.log('\n── rodízio: bloqueado, fora do rodízio, menos de duas pessoas ──');
RELOGIO.fixar('2026-11-11 07:05:00');
chamar('POST','/api/inventario/rodizio',{usuario_id:2, fora:true},LUCAS);
hoje(ANA);
const ciclo3 = db.prepare("SELECT * FROM inventario_ciclo WHERE tipo='diario' AND data='2026-11-11'").get();
eq('com Caio bloqueado e Bia fora do rodízio, só Ana sobra: não há escala', db.prepare('SELECT COUNT(*) n FROM inventario_escala WHERE ciclo_id=?').get(ciclo3.id).n, 0);
const tL = chamar('GET','/api/inventario/tarja',null,LUCAS).tarja;
ok('o aviso vai para quem planeja', tL && tL.tipo === 'aviso' && /só 1 pessoa/.test(tL.texto), tL && tL.texto);
ok('sem escala, a lista fica aberta para quem conta', hoje(ANA).itens.length > 0);
chamar('POST','/api/inventario/rodizio',{usuario_id:2, fora:false},LUCAS);
db.prepare('UPDATE usuarios SET ativo=1 WHERE id=3').run();

console.log('\n── mandar contar de novo: na diária, volta amanhã do zero ──');
// fecha um SKU na fila com 3 contagens sem acordo
RELOGIO.fixar('2026-11-11 08:00:00');
const sk = db.prepare("SELECT codigo FROM inventario_item WHERE ciclo_id=? AND status='a_contar' ORDER BY ordem LIMIT 1").get(ciclo3.id).codigo;
contarN(ANA, sk, 1); term(ANA, sk);
contarN(BIA, sk, 2); term(BIA, sk);
contarN(CAIO, sk, 3); term(CAIO, sk);
eq('três contagens sem acordo', item(sk).status, 'aprovar');
r = chamar('POST','/api/inventario/rejeitar',{id:item(sk).id, motivo:'Contagem anterior errada'},DAVI);
ok('mandar contar de novo na diária: volta amanhã', r.ok && r.amanha === true && !r.novo_item);
RELOGIO.fixar('2026-11-12 07:05:00');
hoje(ANA);
const ciclo4 = db.prepare("SELECT * FROM inventario_ciclo WHERE tipo='diario' AND data='2026-11-12'").get();
const volta = db.prepare('SELECT * FROM inventario_item WHERE ciclo_id=? AND codigo=?').get(ciclo4.id, sk);
ok('no dia seguinte ele está na lista, degrau 0, do zero', volta && volta.degrau === 0 && volta.contado1 === null && volta.anterior_id, JSON.stringify(volta));

console.log('\n── a quinzenal ──');
// base da quinzenal: a do deploy (o primeiro garantirSchema). Pondo a base 15 dias atrás, ela abre hoje.
db.prepare("UPDATE config SET valor='2026-11-01' WHERE chave='quinzenal_base'").run();
RELOGIO.fixar('2026-11-16 07:05:00');      // segunda: 15 dias depois de 01/11
hoje(ANA);
const q = db.prepare("SELECT * FROM inventario_ciclo WHERE tipo='quinzenal'").get();
ok('a quinzenal abriu sozinha no 15º dia', q && q.data === '2026-11-16');
eq('prazo de 3 dias úteis (seg, ter, qua)', q.prazo, '2026-11-18');
eq('a diária fica suspensa (nenhuma diária no dia)', db.prepare("SELECT COUNT(*) n FROM inventario_ciclo WHERE tipo='diario' AND data='2026-11-16'").get().n, 0);
const nq = db.prepare('SELECT COUNT(*) n FROM inventario_item WHERE ciclo_id=?').get(q.id).n;
ok('ela passa por todos os SKUs com saldo (14) e nenhum sob medida/inativo', nq === 14 &&
   !db.prepare("SELECT 1 FROM inventario_item WHERE ciclo_id=? AND codigo IN ('SOBMEDIDA','BKVELHOINATIVO')").get(q.id), 'veio ' + nq);
ok('a tarja diz "quinzenal" e o prazo', /quinzenal: faltam .* — prazo quarta 18\/11/.test((chamar('GET','/api/inventario/tarja',null,
   db.prepare('SELECT usuario_id id, usuario_nome nome FROM inventario_escala WHERE ciclo_id=? LIMIT 1').get(q.id)).tarja||{}).texto||''));
INV.registrarRecusa(db, { codigo: SKUS[11], usuario_nome:'Edu', lote_id: 3 });
const escq = db.prepare('SELECT usuario_id id, usuario_nome nome FROM inventario_escala WHERE ciclo_id=? LIMIT 1').get(q.id);
eq('o SKU que travou durante a quinzenal sobe para o topo', hoje(escq).itens[0].codigo, SKUS[11]);
const skq = hoje(escq).itens[1].codigo;
contarN(escq, skq, 1); term(escq, skq);     // fica na 2ª contagem
ok('(a contagem da quinzenal ficou no meio: 2ª ou 3ª)', ['recontar','terceira'].indexOf(item(skq).status) >= 0);
RELOGIO.fixar('2026-11-19 07:05:00');      // quinta: depois do prazo
hoje(ANA);
eq('fim do prazo: a quinzenal fecha', db.prepare('SELECT status FROM inventario_ciclo WHERE id=?').get(q.id).status, 'fechado');
ok('o que ninguém contou fecha como "não conferido"', db.prepare("SELECT COUNT(*) n FROM inventario_item WHERE ciclo_id=? AND status='nao_conferido'").get(q.id).n >= 10);
const d5 = db.prepare("SELECT * FROM inventario_ciclo WHERE tipo='diario' AND data='2026-11-19'").get();
ok('no dia seguinte a diária volta', !!d5);
ok('e a divergência da quinzenal não se perde: vai para o topo da diária', !!db.prepare("SELECT 1 FROM inventario_item WHERE ciclo_id=? AND codigo=? AND degrau=0 AND status IN ('recontar','terceira')").get(d5.id, skq));
const rel = chamar('GET','/api/inventario/relatorio',null,LUCAS);
ok('o relatório lista os não conferidos da quinzenal', rel.nao_conferidos.some(x => x.tipo === 'quinzenal'));

console.log('\n── a geral: expedição parada, e zero só com as duas pessoas ──');
eq('abrir a geral sem confirmar é recusado', chamar('POST','/api/inventario/geral/abrir',{},LUCAS).motivo, 'confirmar');
r = chamar('POST','/api/inventario/geral/abrir',{confirmar:true},LUCAS);
ok('confirmando, abre', r.ok && r.itens > 0, JSON.stringify(r));
const g = r.ciclo_id;
const gsku = db.prepare("SELECT codigo FROM inventario_item WHERE ciclo_id=? ORDER BY codigo LIMIT 1").get(g).codigo;
const antesG = saldo(gsku);
let p = chamar('POST','/api/inventario/geral/terminar-prateleira',{},CAIO);
ok('"terminei a prateleira" primeiro pergunta, com quantos SKUs', p.confirmar && p.n > 0);
chamar('POST','/api/inventario/geral/terminar-prateleira',{confirmar:true},CAIO);
eq('a zero de UMA pessoa não mexe no saldo', saldo(gsku), antesG);
chamar('POST','/api/inventario/geral/terminar-prateleira',{confirmar:true},BIA);
eq('as duas confirmaram zero: o SKU vira zero', saldo(gsku), 0);

console.log('\n── o relatório de furos ──');
PERMS[4].add('contagem.relatorio');
const relL = chamar('GET','/api/inventario/relatorio',{},DAVI);
const f = relL.furos.find(x => x.codigo === SKUS[2]);
ok('o furo −2 aparece com quem contou (A e B), aplicado sozinho', f && f.diferenca === -2 && f.sozinho && f.contagens.map(c => c.por).join() === 'Ana,Bia');
ok('e traz o extrato do SKU', f && Array.isArray(f.extrato) && f.extrato.some(m => m.tipo === 'inventario'));
ok('sem custo.ver, o JSON não traz R$', !('valor_periodo' in relL) && relL.furos.every(x => !('valor_diferenca' in x)));
ok('a escala do período aparece, com quem não contou', relL.escala.some(e => e.nao_contou && e.nome === 'Caio'));

console.log('\n── o livro fecha ──');
eq('SUM(delta) = skus.estoque para todo SKU', livroBate(), true);

RELOGIO.fixar(null);
db.close(); fs.rmSync(tmp, { recursive:true, force:true });
console.log('\n' + (falhas ? falhas + ' FALHA(S) em ' + n : 'tudo certo: ' + n + ' casos'));
process.exit(falhas ? 1 : 0);
