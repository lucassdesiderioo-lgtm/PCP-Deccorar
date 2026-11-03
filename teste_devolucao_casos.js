#!/usr/bin/env node
/* teste_devolucao_casos.js — as devoluções EM ANDAMENTO (spec
 * docs/specs/DEVOLUCOES-ACOMPANHAMENTO.md, §10).
 *
 *   node teste_devolucao_casos.js
 *
 * Banco temporário, handlers chamados direto com um `app` de mentira, nunca
 * toca em /opt/expedicao. Os números dos casos são os da §10 da spec — cada
 * fase acrescenta os seus no mesmo commit do código, e foram escritos ANTES
 * dele (risco 🔴, §0 do CLAUDE.md).
 *
 * O que este arquivo trava, em uma linha cada:
 *   - o caso nasce antes da peça, e nunca há dois abertos com a mesma venda (R1, R2);
 *   - o prazo manda na cor e na ordem, e os limites são do `config` (R3);
 *   - caso parado grita, e o "ML devolve" só mostra a espera (R4, R5);
 *   - prorrogar é pedido; o prazo original fica guardado (R6);
 *   - vencido não encerra sozinho; perda é decisão do admin geral (R7, R16);
 *   - a lista de motivos é UMA, e o acréscimo dos três novos roda uma vez só (R12);
 *   - todo passo vira história (R20); o modo teste cobre as tabelas novas (§11).
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-devcasos-'));
/* A pasta dos anexos desta rodada (fase 4). Antes de qualquer require nosso:
   o caminhos.js lê o ambiente no carregamento. */
process.env.PCP_DEVOLUCOES_DIR = path.join(tmp, 'devolucoes');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}
function secao(t){ console.log('\n── ' + t + ' ──'); }

/* ── o banco: as tabelas dos outros módulos que as rotas leem ── */
const db = new Database(path.join(tmp, 't.db'));
db.exec(`
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT, estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0);
  CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT,
    modo TEXT DEFAULT 'hoje', situacao TEXT DEFAULT 'aguardando',
    revisado_em TEXT DEFAULT (datetime('now','localtime')), embalado_em TEXT,
    data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
  CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, cor TEXT, buyer TEXT,
    city TEXT, nf TEXT, venda TEXT, packId TEXT, data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
  INSERT INTO skus (codigo,estoque) VALUES ('BK160160BRANCO',3),('BK140140BEGE',2),('BK160140BEGE',1);
  INSERT INTO lote (codigo,buyer,nf,venda,packId) VALUES
    ('BK160160BRANCO','Maria Souza','7336','2000018711038526','2000099900000001'),
    ('BK140140BEGE','Joao Lima','8040','2000015512825367',NULL),
    ('BK160140BEGE','Carla Dias','7451','2000018750385396','2000099900000003'),
    ('BK160160BRANCO','Maria Souza','6001','2000000000006001','2000099900006001'),
    ('BK160140BEGE','Carla Dias','6003','2000000000006003','2000099900006003');
`);

/* Quem é quem. O Lucas é o admin geral (tem tudo, inclusive o dinheiro); o
   Renato acompanha; a Ana lança. A régua de permissão é a do acesso.js de
   verdade: aqui ela é de mentira, mas a pergunta é a mesma (podePermissao). */
const PERMS = {
  1: new Set(['devolucao.lancar','devolucao.acompanhar','devolucao.dinheiro','devolucao.registrar','devolucao.baixar','listas.editar']),
  2: new Set(['devolucao.acompanhar']),
  3: new Set(['devolucao.lancar','devolucao.acompanhar','devolucao.baixar']),
  4: new Set(['devolucao.registrar'])
};
const NOMES = {1:'Lucas', 2:'Renato', 3:'Ana', 4:'Edvaldo'};
const AUDIT = [];
const rotas = {};
const app = {
  locals:{ acesso:{
    podePermissao(u, chave){ return !!(u && PERMS[u.id] && PERMS[u.id].has(chave)); },
    auditar(req, cat, acao, alvo, detalhe){ AUDIT.push({uid:(req.usuario||{}).id, cat, acao, alvo, detalhe}); }
  }},
  get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; }, delete(p,h){ rotas['DELETE '+p]=h; }
};
require('./cad_route')(app, db);
require('./dev_route')(app, db);
require('./devcaso_route')(app, db);

function chamar(metodo, rota, corpo, quem, params, query){
  const h = rotas[metodo+' '+rota];
  if(!h) throw new Error('rota nao registrada: '+metodo+' '+rota);
  const out = { status:200, body:null };
  const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; return res; },
                sendFile(f){ out.arquivo=f; return res; }, type(){ return res; }, send(b){ out.body=b; return res; },
                redirect(u){ out.status=302; out.para=u; return res; } };
  /* O "via publicidade?" é obrigatório no lançamento (AJUSTE de 03/11/2026).
     Os casos de antes dele não falam de publicidade, e mudar cada um mudaria
     a entrada de 338 casos que não são sobre isso: quem não diz nada lança
     com "não". Quem testa a obrigação manda a chave, mesmo vazia. */
  if(metodo === 'POST' && rota === '/api/devolucao-casos' && corpo && !('publicidade' in corpo))
    corpo = Object.assign({ publicidade:false }, corpo);
  const uid = quem || 1;
  h({ body: corpo||{}, params: params||{}, query: query||{}, headers:{}, usuario: quem === 'ninguem' ? null : {id:uid, nome:NOMES[uid]} }, res);
  return out;
}
const dia = (k) => db.prepare("SELECT date('now','localtime',?) d").get((k>=0?'+':'')+k+' days').d;
const caso = (id) => db.prepare('SELECT * FROM devolucao_caso WHERE id=?').get(id);
const eventos = (id) => db.prepare('SELECT * FROM devolucao_evento WHERE caso_id=? ORDER BY id').all(id);
const contar = (t, w) => db.prepare('SELECT COUNT(*) n FROM '+t+(w?' WHERE '+w:'')).get().n;
const daLista = (lista, id) => (lista||[]).find(c => c.id === id);
const lista = (quem) => chamar('GET','/api/devolucao-casos',null,quem||1).body;

/* ═════════════════════════ FASE 1 — caso e prazo ═════════════════════════ */

secao('1. lançar um caso "nós coletamos"');
let r = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'9990001', nf:'5001', sku:'BK140140BEGE',
  motivo:'Avaria no transporte', prazo:dia(5) }, 3);
eq('lança (200)', r.status, 200);
const c1 = caso(r.body.id);
eq('nasce na etapa lancado', c1 && c1.etapa, 'lancado');
ok('com etapa_desde gravado', !!(c1 && c1.etapa_desde));
eq('quem lançou fica gravado', c1 && c1.criado_por, 'Ana');
const ev1 = eventos(c1.id);
ok('e o lançamento gravou um evento', ev1.length === 1 && ev1[0].para === 'lancado' && ev1[0].usuario === 'Ana', JSON.stringify(ev1));

secao('2. a venda que existe no lote preenche SKU, comprador e NF');
r = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'2000 0000 0000 6001', prazo:dia(4) }, 3);
eq('lança', r.status, 200);
const c2 = caso(r.body.id);
eq('o SKU veio do lote', c2.sku, 'BK160160BRANCO');
eq('o comprador veio do lote', c2.comprador, 'Maria Souza');
eq('a NF veio do lote', c2.nf, '6001');
ok('e o vínculo com o volume', c2.lote_id > 0);
eq('a venda é gravada sem os espaços do bipe', c2.venda, '2000000000006001');
r = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000099900006003' }, 3);
const c2b = caso(r.body.id);
eq('o pack bipado no lugar da venda acha o volume, e grava a venda de verdade', c2b.venda, '2000000000006003');
eq('   e o pack ao lado', c2b.pack_id, '2000099900006003');
r = chamar('GET','/api/devolucao-casos/venda/:cod',null,3,{cod:'2000015512825367'});
ok('a tela de lançar acha a venda antes de gravar (o preenchimento)', r.body.achou === true && r.body.venda.codigo === 'BK140140BEGE', JSON.stringify(r.body));

secao('3. a venda que NÃO existe no lote é aceita (devolução antiga)');
r = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'1234567', nf:'99', sku:'160160branco', prazo:dia(6) }, 3);
eq('lança', r.status, 200);
const c3 = caso(r.body.id);
eq('o SKU fica como veio', c3.sku, '160160branco');
eq('sem vínculo com volume', c3.lote_id, null);
eq('sem venda e sem NF é recusado', chamar('POST','/api/devolucao-casos',{ tipo:'ml' }, 3).status, 400);

secao('4. dois casos ABERTOS com a mesma venda: recusado');
r = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'9990001' }, 3);
eq('recusado (409)', r.status, 409);
ok('dizendo qual caso já existe', new RegExp('#' + c1.id).test(r.body.erro || ''), JSON.stringify(r.body));
eq('e nada novo foi gravado', contar('devolucao_caso',"venda='9990001'"), 1);

secao('5. a mesma venda, com o caso anterior ENCERRADO, é aceita');
db.prepare("UPDATE devolucao_caso SET etapa='encerrado', encerrado_em=datetime('now','localtime'), saida='perda_prazo' WHERE id=?").run(c1.id);
r = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'9990001' }, 3);
eq('aceita', r.status, 200);
const c5 = r.body.id;

secao('6. prazo: obrigatório no "nós coletamos", e não no "ML devolve"');
r = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'777001' }, 3);
eq('coleta sem prazo é recusada', r.status, 400);
ok('   e diz que falta o prazo', /prazo/i.test(r.body.erro || ''), JSON.stringify(r.body));
eq('coleta com data impossível é recusada', chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'777001', prazo:'2026-13-40' }, 3).status, 400);
r = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'777002' }, 3);
eq('ml sem prazo é aceito', r.status, 200);
eq('   e nasce aguardando chegar', caso(r.body.id).etapa, 'aguardando');
eq('tipo desconhecido é recusado', chamar('POST','/api/devolucao-casos',{ tipo:'shopee', venda:'777003' }, 3).status, 400);

secao('7. o motivo é da lista motivo_devolucao');
r = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'777004', motivo:'Inventei agora' }, 3);
eq('motivo fora da lista é recusado', r.status, 400);
ok('   nomeando o motivo', /Inventei agora/.test(r.body.erro || ''), JSON.stringify(r.body));
eq('motivo da lista é aceito', chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'777004', motivo:'Falta de kit' }, 3).status, 200);
eq('motivo em branco é aceito (escolhe-se depois)', chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'777005' }, 3).status, 200);

secao('8. a cor do prazo');
const comPrazo = {};
for(const k of [5,3,1,0,-1]){
  const rr = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'88800'+(k+2), prazo:dia(k) }, 3);
  comPrazo[k] = rr.body.id;
}
let L = lista();
eq('a 5 dias: sem cor', daLista(L.coleta, comPrazo[5]).cor, '');
eq('a 3 dias: âmbar', daLista(L.coleta, comPrazo[3]).cor, 'ambar');
eq('a 1 dia: vermelho', daLista(L.coleta, comPrazo[1]).cor, 'vermelho');
eq('vence hoje: vermelho, ainda não vencido', daLista(L.coleta, comPrazo[0]).cor, 'vermelho');
eq('venceu ontem: vencido', daLista(L.coleta, comPrazo[-1]).cor, 'vencido');
eq('   com os dias negativos', daLista(L.coleta, comPrazo[-1]).dias_prazo, -1);

secao('9. os limites são do config, não do código');
ok('os três limites nascem no config', ['devol_prazo_ambar','devol_prazo_vermelho','devol_parado_dias']
  .every(k => db.prepare('SELECT valor FROM config WHERE chave=?').get(k)), JSON.stringify(db.prepare("SELECT * FROM config WHERE chave LIKE 'devol%'").all()));
db.prepare("UPDATE config SET valor='4' WHERE chave='devol_prazo_ambar'").run();
L = lista();
eq('com âmbar em 4, o de 5 dias continua sem cor', daLista(L.coleta, comPrazo[5]).cor, '');
db.prepare("UPDATE config SET valor='5' WHERE chave='devol_prazo_ambar'").run();
eq('com âmbar em 5, o de 5 dias fica âmbar', daLista(lista().coleta, comPrazo[5]).cor, 'ambar');
db.prepare("UPDATE config SET valor='3' WHERE chave='devol_prazo_ambar'").run();

secao('10. a lista do "nós coletamos" vai pelo prazo, nunca pela data de lançamento');
L = lista();
const ord = L.coleta.map(c => c.dias_prazo);
ok('ordenada do mais vencido para o prazo mais longo', ord.every((v,i) => i === 0 || ord[i-1] <= v), JSON.stringify(ord));
eq('o vencido está no topo', L.coleta[0].cor, 'vencido');
ok('o lançado por último (prazo −1) vem antes do lançado primeiro (prazo 5)',
   L.coleta.findIndex(c => c.id === comPrazo[-1]) < L.coleta.findIndex(c => c.id === comPrazo[5]));
ok('caso encerrado não aparece na lista dos abertos', !daLista(L.coleta, c1.id));

secao('11. caso parado grita');
db.prepare("UPDATE devolucao_caso SET etapa_desde=datetime('now','localtime','-2 days') WHERE id=?").run(comPrazo[5]);
db.prepare("UPDATE devolucao_caso SET etapa_desde=datetime('now','localtime','-1 days') WHERE id=?").run(comPrazo[3]);
L = lista();
eq('parado há 2 dias: parado', daLista(L.coleta, comPrazo[5]).parado, true);
eq('   e diz há quantos dias', daLista(L.coleta, comPrazo[5]).dias_parado, 2);
eq('parado há 1 dia: ainda não', daLista(L.coleta, comPrazo[3]).parado, false);

secao('12. o "ML devolve" só mostra a espera');
db.prepare("UPDATE devolucao_caso SET criado_em=datetime('now','localtime','-6 days'), etapa_desde=datetime('now','localtime','-6 days') WHERE id=?").run(c5);
L = lista();
const m5 = daLista(L.ml, c5);
eq('devolve os dias esperando', m5 && m5.dias_esperando, 6);
eq('sem cor de prazo', m5 && m5.cor, '');
eq('e não grita parado, mesmo há 6 dias (R5)', m5 && m5.parado, false);
const esp = L.ml.map(c => c.dias_esperando);
ok('a lista do ML vai do que espera há mais tempo para o mais novo', esp.every((v,i) => i === 0 || esp[i-1] >= v), JSON.stringify(esp));

secao('13. pedir prorrogação é evento, e o prazo não muda');
const pAntes = caso(comPrazo[1]).prazo;
r = chamar('POST','/api/devolucao-casos/:id/prorrogacao',{ texto:'pedi pelo chat' }, 2, {id:comPrazo[1]});
eq('responde ok', r.status, 200);
eq('o prazo continua o mesmo', caso(comPrazo[1]).prazo, pAntes);
ok('e gravou o evento do pedido', eventos(comPrazo[1]).some(e => e.tipo === 'prorrogacao_pedida' && e.usuario === 'Renato'));
eq('no "ML devolve" não há prazo para prorrogar', chamar('POST','/api/devolucao-casos/:id/prorrogacao',{}, 2, {id:c5}).status, 400);

secao('14. o prazo novo guarda o original, e o segundo não sobrescreve o primeiro');
r = chamar('POST','/api/devolucao-casos/:id/prazo',{ prazo:dia(8) }, 2, {id:comPrazo[1]});
eq('lança o prazo novo', r.status, 200);
eq('o prazo mudou', caso(comPrazo[1]).prazo, dia(8));
eq('o original ficou guardado', caso(comPrazo[1]).prazo_original, pAntes);
chamar('POST','/api/devolucao-casos/:id/prazo',{ prazo:dia(12) }, 2, {id:comPrazo[1]});
eq('o segundo prazo novo muda o prazo', caso(comPrazo[1]).prazo, dia(12));
eq('   e o original continua o PRIMEIRO', caso(comPrazo[1]).prazo_original, pAntes);
ok('cada troca gravou um evento de → para', eventos(comPrazo[1]).filter(e => e.tipo === 'prazo').length === 2);
eq('prazo novo impossível é recusado', chamar('POST','/api/devolucao-casos/:id/prazo',{ prazo:'ontem' }, 2, {id:comPrazo[1]}).status, 400);

secao('15. vencido não encerra sozinho');
for(let i = 0; i < 3; i++){ lista(); chamar('GET','/api/devolucao-casos/:id',null,1,{id:comPrazo[-1]}); chamar('GET','/api/devolucao-casos/encerrados',null,1); }
const cv = caso(comPrazo[-1]);
eq('depois de várias leituras, continua aberto', cv.encerrado_em, null);
eq('   na mesma etapa', cv.etapa, 'lancado');
eq('   e sem saída', cv.saida, null);

secao('16. encerrar como perda é do admin geral');
r = chamar('POST','/api/devolucao-casos/:id/perda',{ valor_perdido:'164,04' }, 3, {id:comPrazo[-1]});
eq('sem devolucao.dinheiro: 403', r.status, 403);
eq('   e nada mudou', caso(comPrazo[-1]).encerrado_em, null);
r = chamar('POST','/api/devolucao-casos/:id/perda',{ valor_perdido:'164,04' }, 1, {id:comPrazo[-1]});
eq('com a chave: encerra', r.status, 200);
const cp = caso(comPrazo[-1]);
eq('saida = perda_prazo', cp.saida, 'perda_prazo');
eq('etapa encerrado', cp.etapa, 'encerrado');
eq('com quem', cp.encerrado_por, 'Lucas');
ok('e quando', !!cp.encerrado_em);
eq('o valor perdido em reais', cp.valor_perdido, 164.04);
eq('encerrar de novo é recusado (409)', chamar('POST','/api/devolucao-casos/:id/perda',{}, 1, {id:comPrazo[-1]}).status, 409);
ok('a decisão foi para a auditoria', AUDIT.some(a => a.acao === 'perda_prazo' && a.uid === 1), JSON.stringify(AUDIT));

secao('17. toda mudança de etapa grava evento de → para, com quem');
r = chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'coleta_pedida' }, 2, {id:comPrazo[3]});
eq('muda a etapa', r.status, 200);
let ult = eventos(comPrazo[3]).pop();
ok('evento lancado → coleta_pedida, pelo Renato', ult.tipo === 'etapa' && ult.de === 'lancado' && ult.para === 'coleta_pedida' && ult.usuario === 'Renato', JSON.stringify(ult));
const desde = caso(comPrazo[3]).etapa_desde;
ok('e o relógio do parado recomeça', desde && desde.slice(0,10) === dia(0), desde);
eq('etapa que não é do tipo é recusada', chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'aguardando' }, 2, {id:comPrazo[3]}).status, 400);
eq('revisado não se marca à mão (é o bipe do Edvaldo)', chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'revisado' }, 2, {id:comPrazo[3]}).status, 400);
eq('encerrado não se marca à mão', chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'encerrado' }, 2, {id:comPrazo[3]}).status, 400);
eq('a mesma etapa de novo é recusada', chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'coleta_pedida' }, 2, {id:comPrazo[3]}).status, 400);
eq('mexer em caso encerrado é recusado (409)', chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'coleta_pedida' }, 2, {id:comPrazo[-1]}).status, 409);
eq('caso que não existe: 404', chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'coleta_pedida' }, 2, {id:99999}).status, 404);
r = chamar('POST','/api/devolucao-casos/:id/editar',{ motivo:'Comando quebrado' }, 3, {id:comPrazo[3]});
eq('editar o motivo', r.status, 200);
eq('   grava o motivo', caso(comPrazo[3]).motivo, 'Comando quebrado');
ok('   sem apagar o que não veio (campo ausente não é vazio)', caso(comPrazo[3]).prazo === dia(3) && caso(comPrazo[3]).venda === '888005');
ult = eventos(comPrazo[3]).pop();
ok('   e a edição também é evento', ult.tipo === 'editado' && /motivo/.test(ult.texto || ''), JSON.stringify(ult));
r = chamar('GET','/api/devolucao-casos/:id',null,2,{id:comPrazo[3]});
ok('o caso aberto traz a história inteira', r.body.eventos && r.body.eventos.length === eventos(comPrazo[3]).length, JSON.stringify(r.body).slice(0,200));

secao('18. os três motivos novos: acréscimo de uma vez só');
function bootListas(prepara){
  const d = new Database(':memory:');
  d.exec('CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT)');
  if(prepara) prepara(d);
  const a = { get(){}, post(){}, delete(){} };
  require('./cad_route')(a, d);
  return d;
}
const motivos = (d) => d.prepare("SELECT valor FROM listas WHERE tipo='motivo_devolucao' AND ativo=1 ORDER BY ordem,id").all().map(x => x.valor);
let d1 = bootListas();
eq('banco vazio recebe os 7', motivos(d1).length, 7);
ok('   com os três novos', ['Falta de kit','Comando quebrado','Chegou amassada'].every(v => motivos(d1).includes(v)), JSON.stringify(motivos(d1)));
const d2 = bootListas((d) => {
  d.exec("CREATE TABLE listas (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, valor TEXT, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1)");
  ['Comprador se arrependeu','Enviado medida ou cor errada','Avaria no transporte','Defeito de fabricacao']
    .forEach((v,i) => d.prepare("INSERT INTO listas (tipo,valor,ordem) VALUES ('motivo_devolucao',?,?)").run(v,i));
});
eq('banco que já tinha os 4 recebe só os 3 novos (7 no total)', motivos(d2).length, 7);
eq('   sem repetir nenhum', new Set(motivos(d2)).size, 7);
d2.prepare("DELETE FROM listas WHERE valor='Chegou amassada'").run();
require('./cad_route')({ get(){}, post(){}, delete(){} }, d2);
ok('o motivo apagado depois não volta no boot seguinte', !motivos(d2).includes('Chegou amassada'), JSON.stringify(motivos(d2)));
d2.prepare("UPDATE listas SET ativo=0 WHERE valor='Falta de kit'").run();
require('./cad_route')({ get(){}, post(){}, delete(){} }, d2);
ok('nem o desativado pela tela', !motivos(d2).includes('Falta de kit'));
d1.close(); d2.close();

secao('19. modo teste: as tabelas novas estão cobertas');
require('./estoque_dominio');
const rotasT = {};
require('./teste_route')({ get(p,h){ rotasT['GET '+p]=h; }, post(p,h){ rotasT['POST '+p]=h; } }, db);
function chamarT(m, p){ const out={}; rotasT[m+' '+p]({body:{}}, { json(b){ out.body=b; } }); return out.body; }
let t = chamarT('GET','/api/teste');
const nc = (t.naoCobertas || []).map(x => x.tabela);
ok('devolucao_caso e devolucao_evento NÃO estão em naoCobertas', !nc.includes('devolucao_caso') && !nc.includes('devolucao_evento'), JSON.stringify(t.naoCobertas));
ok('   e aparecem na contagem do modo teste', 'devolucao_caso' in t.itens && 'devolucao_evento' in t.itens, JSON.stringify(t.itens));
chamarT('POST','/api/teste/ligar');
r = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'TESTE-555' }, 3);
const ct = r.body.id;
eq('o caso lançado em teste nasce marcado', caso(ct).teste, 1);
ok('   e o evento dele também', eventos(ct).every(e => e.teste === 1));
const reais = contar('devolucao_caso','teste=0');
chamarT('POST','/api/teste/limpar');
eq('"apagar tudo" apaga o caso de teste', caso(ct), undefined);
eq('   e os eventos dele', eventos(ct).length, 0);
eq('   e não toca nos casos reais', contar('devolucao_caso','teste=0'), reais);

secao('20. lancar_casos_iniciais.js — os 6 casos de 29/10/2026');
(async () => {
  const LC = require('./lancar_casos_iniciais');
  const antes20 = contar('devolucao_caso');
  const sim = await LC.rodar(db, { aplicar:false });
  eq('sem --aplicar: não grava nada', contar('devolucao_caso'), antes20);
  eq('   mas diz que lançaria os 6', sim.lancaria.length, 6);
  const ap = await LC.rodar(db, { aplicar:true, backupDir: path.join(tmp,'bk') });
  eq('com --aplicar: grava 6', contar('devolucao_caso') - antes20, 6);
  ok('   e fez backup antes', ap.backup && fs.existsSync(ap.backup), JSON.stringify(ap));
  const c7336 = db.prepare("SELECT * FROM devolucao_caso WHERE nf='7336' AND tipo='coleta' AND responsavel='Renato'").get();
  ok('a NF 7336 achou a venda no lote e usou o SKU de lá', c7336 && c7336.sku === 'BK160160BRANCO' && c7336.lote_id > 0, JSON.stringify(c7336));
  eq('   tipo coleta, responsável Renato, passado em 29/10', c7336 && c7336.passado_em, '2026-10-29');
  eq('   prazo 03/11/2026', c7336 && c7336.prazo, '2026-11-03');
  eq('   valor do ML 132,72, já veio', c7336 && (c7336.valor_ml + '/' + c7336.valor_ml_situacao), '132.72/ja_veio');
  eq('   motivo em branco (o dono escolhe na tela)', c7336 && c7336.motivo, null);
  const c8040 = db.prepare("SELECT * FROM devolucao_caso WHERE nf='8040' AND responsavel='Renato'").get();
  eq('a 8040 tem o valor pedido, ainda sem número', c8040 && (c8040.valor_ml + '/' + c8040.valor_ml_situacao), 'null/pedido');
  ok('   e o status da tabela em obs', c8040 && /Aguardando ML passar valor/.test(c8040.obs || ''));
  const c8271 = db.prepare("SELECT * FROM devolucao_caso WHERE nf='8271'").get();
  ok('a venda que não está no lote grava o SKU como veio e marca para conferir', c8271 && c8271.sku === '150150bege' && /conferir/i.test(c8271.obs || ''), JSON.stringify(c8271));
  await LC.rodar(db, { aplicar:true, backupDir: path.join(tmp,'bk') });
  eq('rodar de novo não duplica', contar('devolucao_caso') - antes20, 6);
  ok('todo caso inicial nasceu com o evento de lançamento', db.prepare(
    "SELECT COUNT(*) n FROM devolucao_caso c WHERE responsavel='Renato' AND NOT EXISTS (SELECT 1 FROM devolucao_evento e WHERE e.caso_id=c.id)").get().n === 0);

  /* ═══════════════════════ FASE 2 — a chegada ═══════════════════════ */
  db.exec(`INSERT INTO lote (codigo,buyer,nf,venda,packId) VALUES
    ('BK140140BEGE','Rita Melo','9101','2000000000009101','2000099900009101'),
    ('BK160140BEGE','Ivo Reis','9102','2000000000009102',NULL),
    ('BK160160BRANCO','Lia Paz','9103','2000000000009103',NULL)`);
  const B = (cod) => chamar('GET','/api/devolucao/buscar/:cod',null,4,{cod});
  r = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000000000009101', motivo:'Falta de kit' }, 3);
  const k21 = r.body.id;
  r = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'2000000000009102', motivo:'Chegou amassada', prazo:dia(6) }, 3);
  const k29 = r.body.id;

  secao('21. o bipe do Edvaldo acha o caso aberto pela venda');
  r = B('2000000000009101');
  ok('devolve o caso', r.body.caso && r.body.caso.id === k21, JSON.stringify(r.body));
  eq('   com o motivo do caso (a tarja)', r.body.caso && r.body.caso.motivo, 'Falta de kit');
  eq('   e continua devolvendo a venda do lote, como hoje', r.body.venda && r.body.venda.codigo, 'BK140140BEGE');

  secao('22. acha também pelo pack e pela NF');
  r = B('2000 0999 0000 9101');
  ok('pelo pack, mesmo com espaços', r.body.caso && r.body.caso.id === k21, JSON.stringify(r.body));
  r = B('9102');
  ok('pela NF (a caixa que veio por transportadora)', r.body.caso && r.body.caso.id === k29, JSON.stringify(r.body));
  eq('   e pela NF o volume vem do caso', r.body.venda && r.body.venda.codigo, 'BK160140BEGE');

  secao('23. sem caso, o bipe responde IGUAL a hoje');
  r = B('2000000000009103');
  eq('as mesmas duas chaves de sempre', Object.keys(r.body).sort().join(','), 'achou,venda');
  eq('achou a venda do lote', r.body.achou, true);
  r = B('5555555555');
  eq('sem venda e sem caso: as duas chaves', Object.keys(r.body).sort().join(','), 'achou,venda');
  eq('   achou:false', r.body.achou, false);

  secao('24. salvar a revisão com caso liga o caso');
  r = chamar('POST','/api/devolucao',{ codigo_ml:'2000000000009101', caso_id:k21, sku_fisico:'BK140140BEGE', destinacao:'estoque', kit:'faltando' }, 4);
  eq('salva', r.status, 200);
  let k = caso(k21);
  eq('devolucao_id ligado à revisão', k.devolucao_id, r.body.id);
  ok('chegou_em gravado', !!k.chegou_em);
  eq('etapa revisado', k.etapa, 'revisado');
  ok('com evento do Edvaldo', eventos(k21).some(e => e.para === 'revisado' && e.usuario === 'Edvaldo'));
  eq('a resposta diz qual caso ligou', r.body.caso_id, k21);
  const dv24 = db.prepare('SELECT * FROM devolucao WHERE id=?').get(r.body.id);
  eq('a triagem continua igual (R13)', dv24.kit, 'faltando');
  eq('nenhum caso ganhou motivo da triagem', caso(k21).motivo, 'Falta de kit');

  secao('25. salvar SEM caso grava igual a hoje, e não toca em caso nenhum');
  const ligados = contar('devolucao_caso','devolucao_id IS NOT NULL');
  const evAntes = contar('devolucao_evento');
  r = chamar('POST','/api/devolucao',{ codigo_ml:'2000000000009103', sku_fisico:'BK160160BRANCO', destinacao:'estoque' }, 4);
  eq('salva', r.status, 200);
  eq('nenhum caso novo ligado', contar('devolucao_caso','devolucao_id IS NOT NULL'), ligados);
  eq('nenhum evento novo', contar('devolucao_evento'), evAntes);
  eq('a resposta não fala de caso', r.body.caso_id, undefined);

  secao('26. reembalar com caso continua indo para a fila');
  r = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'7770026', sku:'BK160140BEGE' }, 3);
  const k26 = r.body.id;
  const filaAntes = contar('fila',"modo='devolucao'");
  r = chamar('POST','/api/devolucao',{ codigo_ml:'7770026', caso_id:k26, sku_fisico:'BK160140BEGE', destinacao:'reembalar' }, 4);
  eq('responde naFila', r.body.naFila, true);
  eq('entrou na fila com modo devolucao', contar('fila',"modo='devolucao'"), filaAntes + 1);
  eq('e o caso foi ligado', caso(k26).devolucao_id, r.body.id);

  secao('27. o botão "chegou", e revisar depois não regrava a chegada');
  r = chamar('POST','/api/devolucao-casos/:id/chegou',{}, 2, {id:k29});
  eq('marca a chegada', r.status, 200);
  k = caso(k29);
  eq('etapa chegou', k.etapa, 'chegou');
  ok('chegou_em gravado', !!k.chegou_em);
  db.prepare("UPDATE devolucao_caso SET chegou_em='2026-11-01 08:00:00' WHERE id=?").run(k29);
  eq('"chegou" de novo é recusado (409)', chamar('POST','/api/devolucao-casos/:id/chegou',{}, 2, {id:k29}).status, 409);
  r = chamar('POST','/api/devolucao-casos/:id/aviso-ml',{}, 2, {id:k29});
  eq('avisar o ML que recebemos', r.status, 200);
  eq('   leva a ML avisado', caso(k29).etapa, 'ml_avisado');
  eq('   e não se avisa duas vezes', chamar('POST','/api/devolucao-casos/:id/aviso-ml',{}, 2, {id:k29}).status, 409);
  /* O tablet sem o refresh não manda o caso_id: o servidor acha sozinho pela etiqueta. */
  r = chamar('POST','/api/devolucao',{ codigo_ml:'9102', sku_fisico:'BK160140BEGE', destinacao:'descarte' }, 4);
  eq('a revisão sem caso_id liga pelo código bipado', caso(k29).devolucao_id, r.body.id);
  eq('revisar depois não regrava chegou_em', caso(k29).chegou_em, '2026-11-01 08:00:00');
  eq('e marca revisado', caso(k29).etapa, 'revisado');
  eq('"chegou" no caso que não chegou pelo ML devolve sem prazo também funciona',
     chamar('POST','/api/devolucao-casos/:id/chegou',{}, 2, {id:c2b.id}).status, 200);

  secao('28. a baixa da devolução ligada: o motivo vem do caso, e o "ML devolve" encerra');
  const pend = chamar('GET','/api/devolucao/pendentes',null,3).body;
  const p28 = pend.find(d => d.id === caso(k21).devolucao_id);
  eq('a lista de pendentes traz o motivo do caso', p28 && p28.caso_motivo, 'Falta de kit');
  eq('   e o número do caso', p28 && p28.caso_id, k21);
  r = chamar('POST','/api/devolucao/baixa',{ id:caso(k21).devolucao_id, reputacao:'nao' }, 3);
  eq('a baixa sem motivo escolhido passa', r.status, 200);
  eq('   e grava o motivo do caso', db.prepare('SELECT motivo FROM devolucao WHERE id=?').get(caso(k21).devolucao_id).motivo, 'Falta de kit');
  k = caso(k21);
  eq('o caso "ML devolve" encerra', k.saida, 'revisado_ml');
  ok('   com quem e quando', k.encerrado_por === 'Ana' && !!k.encerrado_em, JSON.stringify(k));
  r = chamar('POST','/api/devolucao/baixa',{ id: (function(){ const x = chamar('POST','/api/devolucao',{ codigo_ml:'9999000', sku_fisico:'BK140140BEGE', destinacao:'estoque' }, 4); return x.body.id; })(), reputacao:'nao' }, 3);
  eq('a baixa SEM caso e sem motivo continua aceita (como hoje)', r.status, 200);

  secao('29. o "nós coletamos" revisado NÃO encerra com a baixa da devolução');
  r = chamar('POST','/api/devolucao/baixa',{ id:caso(k29).devolucao_id, reputacao:'sim', motivo:'Avaria no transporte' }, 3);
  eq('a baixa passa', r.status, 200);
  eq('o caso continua aberto (espera a baixa do reembolso)', caso(k29).encerrado_em, null);
  eq('   revisado', caso(k29).etapa, 'revisado');
  eq('a baixa grava o motivo que a pessoa escolheu', db.prepare('SELECT motivo FROM devolucao WHERE id=?').get(caso(k29).devolucao_id).motivo, 'Avaria no transporte');
  eq('   e o motivo do caso não muda por isso (um motivo por caso)', caso(k29).motivo, 'Chegou amassada');

  secao('30. SKU não cadastrado continua recusado, com caso ou sem');
  r = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'7770030' }, 3);
  const k30 = r.body.id;
  r = chamar('POST','/api/devolucao',{ codigo_ml:'7770030', caso_id:k30, sku_fisico:'NAOEXISTE1', destinacao:'estoque' }, 4);
  eq('recusado (400)', r.status, 400);
  ok('   nomeando o SKU', /NAOEXISTE1/.test(r.body.erro || ''));
  eq('   e o caso não foi tocado', caso(k30).devolucao_id, null);
  eq('   nem a etapa', caso(k30).etapa, 'aguardando');
  eq('   nem a chegada', caso(k30).chegou_em, null);

  /* ═════════════════ FASE 3 — transportadora e tentativas ═════════════════ */
  const T = (corpo, quem) => chamar('POST','/api/devolucao-casos/transportadoras', corpo, quem || 2);
  const transp = (quem) => chamar('GET','/api/devolucao-casos/transportadoras', null, quem || 2).body;

  secao('31. cadastro de transportadora: cadastrar, editar, desativar');
  r = T({ nome:'Rapidão Sul', contato:'Marta', canal:'WhatsApp 41 9999-0000' });
  eq('cadastra', r.status, 200);
  const tA = r.body.id;
  const tB = T({ nome:'Leva e Traz' }).body.id;
  const tC = T({ nome:'Expressa Norte' }).body.id;
  eq('sem nome é recusado', T({ contato:'x' }).status, 400);
  r = chamar('POST','/api/devolucao-casos/transportadoras/:tid', { canal:'e-mail' }, 2, { tid:tA });
  eq('edita', r.status, 200);
  let tx = transp().transportadoras.find(t => t.id === tA);
  eq('   o campo editado muda', tx.canal, 'e-mail');
  eq('   e o que não veio fica (campo ausente não é vazio)', tx.contato, 'Marta');
  chamar('POST','/api/devolucao-casos/transportadoras/:tid', { ativo:0 }, 2, { tid:tC });
  ok('desativada não aparece para escolher', !transp().transportadoras.some(t => t.id === tC));
  ok('   mas aparece na lista completa do cadastro, para reativar',
     chamar('GET','/api/devolucao-casos/transportadoras', null, 2, {}, { todas:'1' }).body.transportadoras.some(t => t.id === tC && t.ativo === 0));

  r = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'7770031', prazo:dia(7) }, 3);
  const k31 = r.body.id;
  eq('pedir coleta com transportadora desativada é recusado',
     chamar('POST','/api/devolucao-casos/:id/coleta',{ transportadora_id:tC, cep:'80010-000' }, 2, {id:k31}).status, 400);

  secao('32. tentativa com custo vazio: aceita, e o custo fica NULO (nunca zero)');
  r = chamar('POST','/api/devolucao-casos/:id/coleta',{ transportadora_id:tA, cep:'80010-000', custo:'' }, 2, {id:k31});
  eq('pede a coleta', r.status, 200);
  const t32 = db.prepare('SELECT * FROM devolucao_coleta WHERE caso_id=?').get(k31);
  eq('custo NULL', t32.custo, null);
  eq('resultado aguardando', t32.resultado, 'aguardando');
  eq('o CEP gravado só com os dígitos', t32.cep, '80010000');
  eq('o caso foi para coleta pedida', caso(k31).etapa, 'coleta_pedida');
  eq('e o CEP do caso ficou gravado', caso(k31).cep, '80010000');
  eq('custo impossível é recusado', chamar('POST','/api/devolucao-casos/:id/coleta',{ transportadora_id:tA, custo:'abc' }, 2, {id:k31}).status, 400);
  eq('segunda tentativa com uma aguardando é recusada (409)',
     chamar('POST','/api/devolucao-casos/:id/coleta',{ transportadora_id:tB }, 2, {id:k31}).status, 409);
  eq('no "ML devolve" não há coleta nossa', chamar('POST','/api/devolucao-casos/:id/coleta',{ transportadora_id:tA }, 2, {id:c5}).status, 400);

  secao('33. "não achou o cliente" abre a próxima tentativa e volta a coleta pedida');
  chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'a_caminho' }, 2, {id:k31});
  r = chamar('POST','/api/devolucao-casos/:id/coleta-resultado',{ tentativa_id:t32.id, resultado:'nao_encontrou', custo:'45,00' }, 2, {id:k31});
  eq('registra', r.status, 200);
  const tents = db.prepare('SELECT * FROM devolucao_coleta WHERE caso_id=? ORDER BY id').all(k31);
  eq('a primeira ficou nao_encontrou', tents[0].resultado, 'nao_encontrou');
  eq('   com o custo que veio', tents[0].custo, 45);
  eq('abriu a segunda tentativa', tents.length, 2);
  eq('   aguardando', tents[1].resultado, 'aguardando');
  eq('   com o custo vazio (ainda não se sabe se a segunda ida cobra)', tents[1].custo, null);
  eq('   mesma transportadora e mesmo CEP', tents[1].transportadora_id + '/' + tents[1].cep, tA + '/80010000');
  eq('a etapa voltou para coleta pedida', caso(k31).etapa, 'coleta_pedida');
  ok('e virou história', eventos(k31).some(e => e.tipo === 'coleta' && /não achou/i.test(e.texto || '')));
  eq('o resultado de uma tentativa já fechada é recusado (409)',
     chamar('POST','/api/devolucao-casos/:id/coleta-resultado',{ tentativa_id:t32.id, resultado:'coletou' }, 2, {id:k31}).status, 409);
  eq('resultado desconhecido é recusado',
     chamar('POST','/api/devolucao-casos/:id/coleta-resultado',{ tentativa_id:tents[1].id, resultado:'sumiu' }, 2, {id:k31}).status, 400);
  r = chamar('POST','/api/devolucao-casos/:id/coleta-resultado',{ tentativa_id:tents[1].id, resultado:'coletou' }, 2, {id:k31});
  eq('"coletou" fecha a tentativa', r.status, 200);
  eq('   e leva o caso a caminho', caso(k31).etapa, 'a_caminho');

  secao('34. as tentativas são numeradas por caso');
  r = chamar('GET','/api/devolucao-casos/:id',null,2,{id:k31});
  eq('o caso traz as tentativas numeradas', (r.body.tentativas || []).map(t => t.numero).join(','), '1,2');
  eq('   com o nome da transportadora', r.body.tentativas[0].transportadora, 'Rapidão Sul');
  r = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'7770034', prazo:dia(7) }, 3);
  const k34 = r.body.id;
  chamar('POST','/api/devolucao-casos/:id/coleta',{ transportadora_id:tB, cep:'80020-100' }, 2, {id:k34});
  eq('outro caso começa na 1ª de novo', chamar('GET','/api/devolucao-casos/:id',null,2,{id:k34}).body.tentativas[0].numero, 1);

  secao('35. a sugestão pelo CEP: quem já coletou, 5 dígitos antes de 3');
  const tD = T({ nome:'Cinco Dígitos' }).body.id;
  const tE = T({ nome:'Três Dígitos' }).body.id;
  function coletaFeita(transp, cep){
    const rr = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'S'+Math.random().toString().slice(2,12), prazo:dia(7) }, 3);
    chamar('POST','/api/devolucao-casos/:id/coleta',{ transportadora_id:transp, cep }, 2, {id:rr.body.id});
    const tt = db.prepare('SELECT id FROM devolucao_coleta WHERE caso_id=?').get(rr.body.id);
    chamar('POST','/api/devolucao-casos/:id/coleta-resultado',{ tentativa_id:tt.id, resultado:'coletou' }, 2, {id:rr.body.id});
  }
  coletaFeita(tD, '80010-500'); coletaFeita(tE, '80099-000'); coletaFeita(tE, '80098-000'); coletaFeita(tE, '80097-000');
  r = chamar('GET','/api/devolucao-casos/transportadoras/sugestao',null,2,{},{ cep:'80010-999' });
  const sug = r.body.sugestoes || [];
  ok('sugere quem coletou na região', sug.length >= 2, JSON.stringify(r.body));
  const iUlt5 = sug.map(x => x.casa).lastIndexOf(5), iPri3 = sug.map(x => x.casa).indexOf(3);
  ok('quem casa pelos 5 dígitos vem antes de quem casa pelos 3, mesmo com menos vezes', iUlt5 >= 0 && iPri3 > iUlt5, JSON.stringify(sug));
  ok('   e a "Cinco Dígitos" (1 vez, em 80010) está entre as de 5', sug.some(x => x.nome === 'Cinco Dígitos' && x.casa === 5), JSON.stringify(sug));
  const s3 = sug.find(x => x.nome === 'Três Dígitos');
  ok('quem casa só pelos 3 vem depois, com as vezes e a última', s3 && s3.casa === 3 && s3.vezes === 3 && !!s3.ultima, JSON.stringify(s3));
  ok('a Rapidão Sul (coletou em 80010) também casa pelos 5', sug.some(x => x.nome === 'Rapidão Sul' && x.casa === 5));
  const i5 = sug.filter(x => x.casa === 5).map(x => x.vezes);
  ok('   entre as de 5, ordenadas por vezes', i5.every((v,i) => i === 0 || i5[i-1] >= v), JSON.stringify(sug));
  eq('CEP de outra região não sugere ninguém', (chamar('GET','/api/devolucao-casos/transportadoras/sugestao',null,2,{},{ cep:'01000-000' }).body.sugestoes || []).length, 0);

  secao('36. quem só teve "não achou" naquele CEP não é sugerido');
  const tF = T({ nome:'Só Falhou' }).body.id;
  r = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'7770036', prazo:dia(7) }, 3);
  chamar('POST','/api/devolucao-casos/:id/coleta',{ transportadora_id:tF, cep:'80010-111' }, 2, {id:r.body.id});
  const t36 = db.prepare('SELECT id FROM devolucao_coleta WHERE caso_id=?').get(r.body.id);
  chamar('POST','/api/devolucao-casos/:id/coleta-resultado',{ tentativa_id:t36.id, resultado:'nao_encontrou' }, 2, {id:r.body.id});
  const sug36 = chamar('GET','/api/devolucao-casos/transportadoras/sugestao',null,2,{},{ cep:'80010-999' }).body.sugestoes || [];
  ok('"Só Falhou" fica fora', !sug36.some(x => x.nome === 'Só Falhou'), JSON.stringify(sug36));
  ok('nem a tentativa aguardando conta como "coletou"', !sug36.some(x => x.nome === 'Leva e Traz'));

  /* ═══════════════ FASE 4 — documentos e a foto do comprador ═══════════════ */
  const FOTO = 'data:image/jpeg;base64,' + Buffer.alloc(4000, 7).toString('base64');
  const PDF  = 'data:application/pdf;base64,' + Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(3000, 32)]).toString('base64');
  const DIR_DV = process.env.PCP_DEVOLUCOES_DIR;
  const anexar = (id, corpo, quem) => chamar('POST','/api/devolucao-casos/:id/anexo', corpo, quem || 2, {id});
  const anexos = (id) => db.prepare('SELECT * FROM devolucao_anexo WHERE caso_id=? ORDER BY id').all(id);

  secao('37. a lista doc_devolucao nasce com os 2 documentos, por acréscimo de uma vez só');
  const docs = (d) => d.prepare("SELECT valor FROM listas WHERE tipo='doc_devolucao' AND ativo=1 ORDER BY ordem,id").all().map(x => x.valor);
  eq('no banco do teste, os dois', docs(db).join(' | '), 'Etiqueta de coleta | Comprovante de pagamento da transportadora');
  let d37 = bootListas();
  eq('banco vazio recebe os 2', docs(d37).length, 2);
  d37.prepare("DELETE FROM listas WHERE valor='Etiqueta de coleta'").run();
  require('./cad_route')({ get(){}, post(){}, delete(){} }, d37);
  ok('o documento apagado depois não volta no boot seguinte', !docs(d37).includes('Etiqueta de coleta'), JSON.stringify(docs(d37)));
  d37.close();

  r = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'7770037', prazo:dia(7) }, 3);
  const k37 = r.body.id;

  secao('38. ir para "Documentos ao ML" faltando um documento: recusado, nomeando o que falta');
  r = chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'docs_enviados' }, 2, {id:k37});
  eq('recusado', r.status, 400);
  ok('   nomeando os dois que faltam', /Etiqueta de coleta/.test(r.body.erro || '') && /Comprovante de pagamento/.test(r.body.erro || ''), JSON.stringify(r.body));
  eq('   e a etapa não mudou', caso(k37).etapa, 'lancado');
  r = anexar(k37, { tipo:'doc', doc_tipo:'Etiqueta de coleta', arquivo:PDF });
  eq('anexa a etiqueta (PDF)', r.status, 200);
  r = chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'docs_enviados' }, 2, {id:k37});
  eq('com um só, ainda recusa', r.status, 400);
  ok('   nomeando só o que falta', !/Etiqueta de coleta/.test(r.body.erro || '') && /Comprovante de pagamento/.test(r.body.erro || ''), JSON.stringify(r.body));

  secao('39. com todos anexados, avança');
  eq('anexa o comprovante (foto)', anexar(k37, { tipo:'doc', doc_tipo:'Comprovante de pagamento da transportadora', arquivo:FOTO }).status, 200);
  r = chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'docs_enviados' }, 2, {id:k37});
  eq('avança', r.status, 200);
  eq('   para Documentos ao ML', caso(k37).etapa, 'docs_enviados');
  ok('cada anexo virou história', eventos(k37).filter(e => e.tipo === 'anexo').length === 2);
  r = chamar('GET','/api/devolucao-casos/:id',null,2,{id:k37});
  eq('o caso lista os anexos', (r.body.anexos || []).length, 2);
  ok('   e diz quais documentos a lista pede, e se estão', (r.body.docs || []).every(x => x.ok === true), JSON.stringify(r.body.docs));

  secao('40. documento desativado na lista deixa de ser exigido');
  r = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'7770040', prazo:dia(7) }, 3);
  const k40 = r.body.id;
  anexar(k40, { tipo:'doc', doc_tipo:'Etiqueta de coleta', arquivo:PDF });
  db.prepare("UPDATE listas SET ativo=0 WHERE tipo='doc_devolucao' AND valor='Comprovante de pagamento da transportadora'").run();
  eq('com o comprovante desativado, a etiqueta basta', chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'docs_enviados' }, 2, {id:k40}).status, 200);
  eq('anexar um tipo desativado é recusado', anexar(k40, { tipo:'doc', doc_tipo:'Comprovante de pagamento da transportadora', arquivo:PDF }).status, 400);
  db.prepare("UPDATE listas SET ativo=1 WHERE tipo='doc_devolucao'").run();

  secao('41. anexo vazio ou que não é imagem nem PDF: recusado');
  const n41 = anexos(k40).length;
  eq('sem arquivo', anexar(k40, { tipo:'doc', doc_tipo:'Etiqueta de coleta' }).status, 400);
  eq('foto vazia (não é prova)', anexar(k40, { tipo:'doc', doc_tipo:'Etiqueta de coleta', arquivo:'data:image/jpeg;base64,AAAA' }).status, 400);
  eq('texto qualquer', anexar(k40, { tipo:'doc', doc_tipo:'Etiqueta de coleta', arquivo:'data:text/plain;base64,' + Buffer.alloc(5000,65).toString('base64') }).status, 400);
  eq('"PDF" que não começa com %PDF', anexar(k40, { tipo:'doc', doc_tipo:'Etiqueta de coleta', arquivo:'data:application/pdf;base64,' + Buffer.alloc(5000,65).toString('base64') }).status, 400);
  eq('tipo de documento fora da lista', anexar(k40, { tipo:'doc', doc_tipo:'Inventado', arquivo:PDF }).status, 400);
  eq('tipo de anexo desconhecido', anexar(k40, { tipo:'outro', arquivo:PDF }).status, 400);
  eq('nada foi gravado', anexos(k40).length, n41);

  secao('42. o arquivo vai para PCP_DEVOLUCOES_DIR, nunca para lotes/');
  const a42 = anexos(k37)[0];
  ok('o caminho está dentro da pasta das devoluções', a42.arquivo.indexOf(DIR_DV) === 0, a42.arquivo);
  ok('   e o arquivo existe, com o conteúdo', fs.existsSync(a42.arquivo) && fs.readFileSync(a42.arquivo).slice(0,4).toString() === '%PDF');
  ok('   e não está em lotes/', !/\/lotes\//.test(a42.arquivo));
  r = chamar('GET','/api/devolucao-casos/anexo/:aid',null,2,{aid:a42.id});
  eq('a rota devolve o arquivo', r.arquivo, a42.arquivo);

  secao('43. o disco recusa: o anexo não existe no banco');
  const nAntes = contar('devolucao_anexo');
  fs.renameSync(DIR_DV, DIR_DV + '.bak');
  fs.writeFileSync(DIR_DV, 'sou um arquivo no lugar da pasta');
  r = anexar(k40, { tipo:'doc', doc_tipo:'Etiqueta de coleta', arquivo:PDF });
  fs.unlinkSync(DIR_DV); fs.renameSync(DIR_DV + '.bak', DIR_DV);
  ok('a gravação falha com erro', r.status >= 500, JSON.stringify(r));
  eq('nenhuma linha nova no banco', contar('devolucao_anexo'), nAntes);
  eq('nem evento de anexo', eventos(k40).filter(e => e.tipo === 'anexo').length, 1);

  secao('44. devolver ao comprador: foto obrigatória, e só o admin geral');
  r = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'7770044', motivo:'Chegou amassada', prazo:dia(7) }, 3);
  const k44 = r.body.id;
  r = chamar('POST','/api/devolucao-casos/:id/devolver-comprador',{ valor_devolvido:'189,90' }, 1, {id:k44});
  eq('sem a foto do comprador: recusado', r.status, 400);
  ok('   dizendo que falta a foto', /foto/i.test(r.body.erro || ''), JSON.stringify(r.body));
  eq('   e continua aberto', caso(k44).encerrado_em, null);
  eq('a foto do comprador tem que ser imagem (PDF não serve)', anexar(k44, { tipo:'foto_comprador', arquivo:PDF }).status, 400);
  eq('anexa a foto do comprador', anexar(k44, { tipo:'foto_comprador', arquivo:FOTO }).status, 200);
  r = chamar('POST','/api/devolucao-casos/:id/devolver-comprador',{ valor_devolvido:'189,90' }, 3, {id:k44});
  eq('sem devolucao.dinheiro: 403', r.status, 403);
  eq('   e nada mudou', caso(k44).encerrado_em, null);
  r = chamar('POST','/api/devolucao-casos/:id/devolver-comprador',{ valor_devolvido:'189,90' }, 1, {id:k44});
  eq('com as duas coisas: encerra', r.status, 200);
  k = caso(k44);
  eq('saida = devolvido_comprador', k.saida, 'devolvido_comprador');
  eq('   com quem', k.encerrado_por, 'Lucas');
  ok('   e quando', !!k.encerrado_em);
  eq('   e o valor devolvido', k.valor_devolvido, 189.9);
  ok('a decisão foi para a auditoria', AUDIT.some(a => a.acao === 'devolvido_comprador' && a.uid === 1));
  ok('o modo teste cobre os anexos e as tentativas', ['devolucao_anexo','devolucao_coleta'].every(t =>
     new RegExp("nome:'" + t + "'").test(fs.readFileSync(path.join(__dirname,'teste_route.js'),'utf8'))));

  /* ═════════════════════ FASE 5 — o dinheiro e o relatório ═════════════════════ */
  const DINHEIRO_CHAVES = ['valor_ml','custo','valor_devolvido','valor_perdido','saldo'];
  function chavesDe(o, acc){
    acc = acc || new Set();
    if(Array.isArray(o)) o.forEach(x => chavesDe(x, acc));
    else if(o && typeof o === 'object') for(const k of Object.keys(o)){ acc.add(k); chavesDe(o[k], acc); }
    return acc;
  }
  const mes = dia(0).slice(0,7);
  const valor = (id, corpo, quem) => chamar('POST','/api/devolucao-casos/:id/valor', corpo, quem || 1, {id});

  /* Um caso de coleta com valor e duas tentativas com custo, para a conta. */
  r = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'7770045', motivo:'Comando quebrado', prazo:dia(7) }, 3);
  const k45 = r.body.id;
  eq('lançar valor do ML sem a chave do dinheiro: 403', valor(k45, { valor_ml:'150,00' }, 2).status, 403);
  eq('lançar valor do ML com a chave', valor(k45, { valor_ml:'150,00' }).status, 200);
  eq('   o valor gravado', caso(k45).valor_ml, 150);
  eq('   e a situação vira "já veio"', caso(k45).valor_ml_situacao, 'ja_veio');
  chamar('POST','/api/devolucao-casos/:id/coleta',{ transportadora_id:tA, cep:'80010-000', custo:'40' }, 2, {id:k45});
  let tt = db.prepare("SELECT id FROM devolucao_coleta WHERE caso_id=? AND resultado='aguardando'").get(k45);
  chamar('POST','/api/devolucao-casos/:id/coleta-resultado',{ tentativa_id:tt.id, resultado:'nao_encontrou' }, 2, {id:k45});
  tt = db.prepare("SELECT id FROM devolucao_coleta WHERE caso_id=? AND resultado='aguardando'").get(k45);

  secao('45. quem NÃO tem devolucao.dinheiro não recebe nenhum valor pelo fio');
  const fios = {
    lista: chamar('GET','/api/devolucao-casos',null,2).body,
    caso: chamar('GET','/api/devolucao-casos/:id',null,2,{id:k45}).body,
    encerrados: chamar('GET','/api/devolucao-casos/encerrados',null,2).body,
    relatorio: chamar('GET','/api/devolucao-casos/relatorio',null,2,{},{ mes }).body
  };
  for(const [nome, corpo] of Object.entries(fios)){
    const ks = chavesDe(corpo);
    const vazou = DINHEIRO_CHAVES.filter(k => ks.has(k));
    ok(nome + ': nenhuma chave de dinheiro', vazou.length === 0, 'vazou: ' + vazou.join(', '));
  }
  ok('o relatório para quem não tem a chave ainda conta os casos por motivo', (fios.relatorio.por_motivo || []).length > 0, JSON.stringify(fios.relatorio).slice(0,300));
  const comD = chamar('GET','/api/devolucao-casos/:id',null,1,{id:k45}).body;
  ok('o admin geral recebe os valores', comD.caso.valor_ml === 150 && 'saldo' in comD.caso, JSON.stringify(comD.caso).slice(0,300));
  ok('   e os custos das tentativas', comD.tentativas.every(t => 'custo' in t));

  secao('46. o saldo do caso: valor do ML menos os custos; custo vazio → incompleto');
  eq('com a 2ª tentativa sem custo: saldo nulo', comD.caso.saldo, null);
  eq('   e incompleto', comD.caso.incompleto, true);
  valor(k45, { tentativa_id:tt.id, custo:'35,50' });
  let cd = chamar('GET','/api/devolucao-casos/:id',null,1,{id:k45}).body.caso;
  eq('com todos os custos: 150 − 40 − 35,50 = 74,50', cd.saldo, 74.5);
  eq('   e não é mais incompleto', cd.incompleto, false);
  r = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'7770046', prazo:dia(7) }, 3);
  cd = chamar('GET','/api/devolucao-casos/:id',null,1,{id:r.body.id}).body.caso;
  eq('sem valor do ML lançado: saldo nulo, incompleto', cd.saldo + '/' + cd.incompleto, 'null/true');
  ok('a mudança de valor virou história sem o número (quem acompanha vê a história)',
     eventos(k45).some(e => e.tipo === 'valor') && !eventos(k45).some(e => /150|35[,.]5/.test((e.texto||'') + (e.de||'') + (e.para||''))));
  eq('custo impossível é recusado', valor(k45, { tentativa_id:tt.id, custo:'-3' }).status, 400);

  secao('47. o total do mês com algum valor faltando sai como piso');
  let rel = chamar('GET','/api/devolucao-casos/relatorio',null,1,{},{ mes }).body;
  eq('há caso sem valor do ML e tentativa sem custo no mês: piso', rel.dinheiro && rel.dinheiro.piso, true);
  ok('   e diz o que falta', rel.dinheiro && (rel.dinheiro.faltam || []).length > 0, JSON.stringify(rel.dinheiro));
  ok('os totais existem em reais', rel.dinheiro && typeof rel.dinheiro.valor_ml === 'number' && typeof rel.dinheiro.custos === 'number', JSON.stringify(rel.dinheiro));

  secao('48. a baixa do reembolso: só admin geral, e encerra o "nós coletamos" já revisado');
  eq('sem a chave: 403', chamar('POST','/api/devolucao-casos/:id/reembolso',{ resultado:'recebido' }, 3, {id:k29}).status, 403);
  eq('caso ainda não revisado: recusado', chamar('POST','/api/devolucao-casos/:id/reembolso',{ resultado:'recebido' }, 1, {id:k45}).status, 400);
  eq('resultado desconhecido: recusado', chamar('POST','/api/devolucao-casos/:id/reembolso',{ resultado:'talvez' }, 1, {id:k29}).status, 400);
  r = chamar('POST','/api/devolucao-casos/:id/reembolso',{ resultado:'recebido' }, 1, {id:k29});
  eq('com a chave, no caso revisado: encerra', r.status, 200);
  eq('   saida = reembolso_recebido', caso(k29).saida, 'reembolso_recebido');
  eq('   com quem', caso(k29).encerrado_por, 'Lucas');
  r = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'2000000000009103', prazo:dia(7) }, 3);
  const k48 = r.body.id;
  chamar('POST','/api/devolucao',{ codigo_ml:'2000000000009103', caso_id:k48, sku_fisico:'BK160160BRANCO', destinacao:'estoque' }, 4);
  eq('"não recebido" também encerra', chamar('POST','/api/devolucao-casos/:id/reembolso',{ resultado:'nao_recebido' }, 1, {id:k48}).status, 200);
  eq('   saida = reembolso_nao_recebido', caso(k48).saida, 'reembolso_nao_recebido');
  eq('no "ML devolve" não há reembolso de coleta', chamar('POST','/api/devolucao-casos/:id/reembolso',{ resultado:'recebido' }, 1, {id:c5}).status, 400);

  secao('49. valor do ML a pedir há 2 dias entra no parado');
  r = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'7770049', prazo:dia(9) }, 3);
  const k49 = r.body.id;
  r = chamar('POST','/api/devolucao-casos/:id/situacao-valor',{ situacao:'pedir' }, 2, {id:k49});
  eq('quem acompanha marca "precisamos pedir"', r.status, 200);
  eq('   situação gravada', caso(k49).valor_ml_situacao, 'pedir');
  eq('situação desconhecida é recusada', chamar('POST','/api/devolucao-casos/:id/situacao-valor',{ situacao:'xyz' }, 2, {id:k49}).status, 400);
  eq('com 0 dias, não está parado', daLista(lista(2).coleta, k49).parado, false);
  db.prepare("UPDATE devolucao_caso SET valor_ml_desde=datetime('now','localtime','-2 days') WHERE id=?").run(k49);
  const l49 = daLista(lista(2).coleta, k49);
  eq('pedir há 2 dias: parado, mesmo com a etapa recém mexida', l49.parado, true);
  eq('   e diz que é o valor', l49.parado_valor, true);
  eq('   sem mandar o valor junto', 'valor_ml' in l49, false);
  db.prepare("UPDATE devolucao_caso SET valor_ml_situacao='pedido' WHERE id=?").run(k49);
  eq('já pedido (esperando o ML): não grita pelo valor', daLista(lista(2).coleta, k49).parado_valor, false);

  secao('50. o relatório por motivo conta a devolução ligada UMA vez');
  db.exec("UPDATE devolucao_caso SET criado_em = datetime('now','localtime') WHERE id IN (SELECT id FROM devolucao_caso)");
  db.exec("UPDATE devolucao SET data = date('now','localtime')");
  rel = chamar('GET','/api/devolucao-casos/relatorio',null,1,{},{ mes }).body;
  const pm = (m) => (rel.por_motivo || []).find(x => x.motivo === m) || { qtd:0 };
  const esperadoFalta = db.prepare("SELECT COUNT(*) n FROM devolucao_caso WHERE motivo='Falta de kit' AND teste=0").get().n
    + db.prepare("SELECT COUNT(*) n FROM devolucao d WHERE motivo='Falta de kit' AND NOT EXISTS (SELECT 1 FROM devolucao_caso c WHERE c.devolucao_id=d.id)").get().n;
  eq('"Falta de kit": caso + baixa ligada contam uma vez', pm('Falta de kit').qtd, esperadoFalta);
  const semCaso = db.prepare("SELECT COUNT(*) n FROM devolucao d WHERE motivo='Avaria no transporte' AND NOT EXISTS (SELECT 1 FROM devolucao_caso c WHERE c.devolucao_id=d.id)").get().n;
  const casosAvaria = db.prepare("SELECT COUNT(*) n FROM devolucao_caso WHERE motivo='Avaria no transporte'").get().n;
  eq('a devolução antiga sem caso conta pelo motivo da baixa', pm('Avaria no transporte').qtd, semCaso + casosAvaria);
  const r50 = chamar('POST','/api/devolucao',{ codigo_ml:'NOVA50', sku_fisico:'BK140140BEGE', destinacao:'estoque' }, 4);
  chamar('POST','/api/devolucao/baixa',{ id:r50.body.id, reputacao:'nao', motivo:'Defeito de fabricacao' }, 3);
  const antes50 = pm('Defeito de fabricacao').qtd;
  rel = chamar('GET','/api/devolucao-casos/relatorio',null,1,{},{ mes }).body;
  eq('uma baixa nova sem caso soma 1 no motivo dela', pm('Defeito de fabricacao').qtd, antes50 + 1);
  ok('o total bate com a soma das linhas', rel.total === (rel.por_motivo || []).reduce((a,x) => a + x.qtd, 0), JSON.stringify(rel).slice(0,200));

  secao('51. o relatório separa perda por prazo de devolvido ao comprador');
  ok('perda por prazo em reais, à parte', rel.dinheiro && rel.dinheiro.perda_prazo === 164.04, JSON.stringify(rel.dinheiro));
  ok('devolvido ao comprador em reais, à parte', rel.dinheiro && rel.dinheiro.devolvido_comprador === 189.9, JSON.stringify(rel.dinheiro));
  ok('e por motivo, cada uma no seu', (rel.por_motivo || []).some(x => x.motivo === 'Chegou amassada' && x.devolvido_comprador === 189.9), JSON.stringify(rel.por_motivo));
  eq('quem não tem a chave não recebe o bloco do dinheiro', 'dinheiro' in chamar('GET','/api/devolucao-casos/relatorio',null,2,{},{ mes }).body, false);
  eq('mês impossível é recusado', chamar('GET','/api/devolucao-casos/relatorio',null,1,{},{ mes:'2026-13' }).status, 400);

  secao('52. a auditoria: ver valores no máximo 1 vez a cada 30 min; cada decisão, sempre');
  PERMS[5] = new Set(['devolucao.acompanhar','devolucao.dinheiro']); NOMES[5] = 'Outra';
  const vistas = (uid) => AUDIT.filter(a => a.acao === 'viu_valores' && a.uid === uid).length;
  const v0 = vistas(5);
  for(let i = 0; i < 4; i++){ chamar('GET','/api/devolucao-casos',null,5); chamar('GET','/api/devolucao-casos/:id',null,5,{id:k45}); chamar('GET','/api/devolucao-casos/relatorio',null,5,{},{mes}); }
  eq('doze leituras com valores: uma linha só', vistas(5) - v0, 1);
  const vQuem = vistas(2);
  chamar('GET','/api/devolucao-casos',null,2);
  eq('quem não vê valores não gera linha de "viu valores"', vistas(2), vQuem);
  const dec0 = AUDIT.filter(a => a.acao === 'valor').length;
  valor(k45, { valor_ml:'151' }, 5); valor(k45, { valor_ml:'152' }, 5);
  eq('duas decisões de valor: duas linhas', AUDIT.filter(a => a.acao === 'valor').length - dec0, 2);

  /* ═══════ AS ABAS: uma entrada só, "Devoluções" (AJUSTE de 03/11/2026) ═══════
     O dono: "concentramos em um único lugar as devoluções". Juntar é na
     NAVEGAÇÃO: cada aba aparece pela permissão de verdade, e quem tranca
     continua sendo a chave de cada tela e de cada rota. */
  secao('abas — cada pessoa vê só as abas que a permissão dela alcança');
  const abas = (quem) => chamar('GET','/api/devolucao/abas',null,quem).body;
  eq('Edvaldo (só registrar): só Receber peça', JSON.stringify(abas(4)), JSON.stringify({ receber:true, andamento:false, baixa:false }));
  eq('Renato (só acompanhar): só Em andamento', JSON.stringify(abas(2)), JSON.stringify({ receber:false, andamento:true, baixa:false }));
  eq('Ana (lança, acompanha e dá baixa): Em andamento e Baixa', JSON.stringify(abas(3)), JSON.stringify({ receber:false, andamento:true, baixa:true }));
  eq('o admin geral: as três', JSON.stringify(abas(1)), JSON.stringify({ receber:true, andamento:true, baixa:true }));
  PERMS[6] = new Set(['devolucao.lancar']); NOMES[6] = 'SoLanca';
  eq('quem só lança também vê Em andamento', abas(6).andamento, true);

  secao('abas — a porta única "Devoluções" leva à primeira aba que a pessoa alcança');
  const porta = (quem) => chamar('GET','/devolucoes',null,quem);
  eq('Edvaldo vai à tela de sempre', porta(4).para, '/devolucao');
  eq('Renato vai a Em andamento', porta(2).para, '/devolucao-casos');
  eq('o admin geral vai a Em andamento', porta(1).para, '/devolucao-casos');
  PERMS[7] = new Set(['devolucao.baixar']); NOMES[7] = 'SoBaixa';
  eq('quem só dá baixa vai ao Admin, na aba Devoluções', porta(7).para, '/admin#dv');
  PERMS[8] = new Set([]); NOMES[8] = 'Nada';
  eq('quem não tem nada vai à tela de sempre (e o portão responde como hoje)', porta(8).para, '/devolucao');
  eq('sem sessão vai ao login, e volta à porta depois', porta('ninguem').para, '/login?r=%2Fdevolucoes');

  secao('abas — o rodapé tem uma entrada só, e as duas telas têm a faixa');
  const NAV = fs.readFileSync(path.join(__dirname,'public','nav.js'),'utf8');
  ok('o rodapé não tem mais o link "Devoluções em andamento"', !/Devoluções em andamento/.test(NAV) && !/navDevCasos/.test(NAV));
  ok('o "Devoluções" do rodapé aponta para a porta única', /href="\/devolucoes"/.test(NAV));
  ok('   e fica aceso nas duas telas', /\/devolucao-casos/.test(NAV));
  for(const tela of ['devolucao.html','devolucao-casos.html']){
    const H = fs.readFileSync(path.join(__dirname,'public',tela),'utf8');
    ok(tela + ' pede as abas ao servidor (/api/devolucao/abas)', /\/api\/devolucao\/abas/.test(H));
    ok(tela + ' liga as três abas às três telas', /'\/devolucao'/.test(H) && /'\/devolucao-casos'/.test(H) && /'\/admin#dv'/.test(H));
  }
  const ADM = fs.readFileSync(path.join(__dirname,'public','index.html'),'utf8');
  ok('o admin abre direto na aba pelo endereço (#dv)', /location\.hash/.test(ADM) && /data-t="dv"/.test(ADM));

  /* ═══════ A BUSCA (AJUSTE de 03/11/2026): "já foi lançada?" ═══════
     O dono lança muitas reclamações e precisa saber se a de agora já existe.
     A busca acha pelo número da NF, da venda ou do pack — aberto OU encerrado. */
  const busca = (q, quem) => chamar('GET','/api/devolucao-casos/buscar',null,quem || 2,{},{ q });
  r = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'2000077700001234', nf:'55123', prazo:dia(7) }, 3);
  const kB = r.body.id;
  valor(kB, { valor_ml:'99,00' });

  secao('busca — acha pela NF, pela venda e pelo pack');
  let rb = busca('55123');
  eq('pela NF', (rb.body.casos || []).some(c => c.id === kB), true);
  rb = busca('2000 0777 0000 1234');
  eq('pela venda, com os espaços do bipe', (rb.body.casos || []).some(c => c.id === kB), true);
  rb = busca('2000099900009101');
  eq('pelo pack', (rb.body.casos || []).some(c => c.id === k21), true);

  secao('busca — acha o aberto E o encerrado, dizendo qual é');
  rb = busca('7770044');
  const enc = (rb.body.casos || []).find(c => c.id === k44);
  ok('o caso encerrado aparece', !!enc, JSON.stringify(rb.body));
  ok('   dizendo como encerrou', enc && !!enc.encerrado_em && /comprador/i.test(enc.saida_nome || ''), JSON.stringify(enc));
  rb = busca('55123');
  const abr = (rb.body.casos || []).find(c => c.id === kB);
  ok('o aberto aparece com a etapa', abr && !abr.encerrado_em && abr.etapa_nome === 'Lançado', JSON.stringify(abr));

  secao('busca — pedaço do número, e o mínimo de 3 dígitos');
  rb = busca('0001234');
  eq('o final da venda acha', (rb.body.casos || []).some(c => c.id === kB), true);
  eq('menos de 3 dígitos é recusado', busca('55').status, 400);
  eq('vazio é recusado', busca('').status, 400);
  rb = busca('987654321987');
  eq('número que não existe: lista vazia, sem erro', rb.status + '/' + (rb.body.casos || []).length, '200/0');

  secao('busca — o dinheiro não viaja a quem não tem a chave');
  const ks = chavesDe(busca('55123', 2).body);
  ok('sem a chave: nenhum valor', !DINHEIRO_CHAVES.some(k => ks.has(k)), [...ks].join(','));
  ok('com a chave: o valor vem', (busca('55123', 1).body.casos || []).some(c => c.valor_ml === 99));

  /* ── AJUSTE de 03/11/2026: publicidade, mensagem do ML, link da conversa ── */
  secao('publicidade — obrigatória no lançamento, Sim ou Não');
  const lan = (corpo, quem) => chamar('POST','/api/devolucao-casos', Object.assign({ tipo:'ml' }, corpo), quem || 3);
  let rp = lan({ venda:'8800001', publicidade:undefined });
  eq('sem a resposta: recusado', rp.status, 400);
  ok('   e a recusa diz o que falta', /publicidade/i.test(rp.body.erro || ''), rp.body.erro);
  eq('   e nada foi gravado', contar('devolucao_caso',"venda='8800001'"), 0);
  eq('valor impossível: recusado', lan({ venda:'8800001', publicidade:'talvez' }).status, 400);
  eq('vazio de propósito: recusado', lan({ venda:'8800001', publicidade:'' }).status, 400);
  rp = lan({ venda:'8800001', publicidade:true });
  eq('Sim lança', rp.status, 200);
  const pSim = rp.body.id;
  eq('   e grava 1', caso(pSim).publicidade, 1);
  rp = lan({ venda:'8800002', publicidade:'nao' });
  const pNao = rp.body.id;
  eq('Não lança e grava 0', caso(pNao).publicidade, 0);
  eq('"sim" em texto também vale', caso(lan({ venda:'8800003', publicidade:'sim' }).body.id).publicidade, 1);
  ok('a lista leva a publicidade', daLista(chamar('GET','/api/devolucao-casos',null,2).body.ml, pSim).publicidade === 1);
  ok('   e a busca também', (chamar('GET','/api/devolucao-casos/buscar',null,2,{},{ q:'8800001' }).body.casos || []).some(c => c.id === pSim && c.publicidade === 1));
  ok('o lançamento conta na história', /publicidade/i.test(eventos(pSim)[0].texto || ''), eventos(pSim)[0].texto);

  secao('publicidade — editar corrige, e campo ausente não apaga');
  rp = chamar('POST','/api/devolucao-casos/:id/editar',{ obs:'outra coisa' }, 3, { id:pSim });
  eq('editar outro campo não mexe na publicidade', caso(pSim).publicidade, 1);
  rp = chamar('POST','/api/devolucao-casos/:id/editar',{ publicidade:false }, 3, { id:pSim });
  eq('editar corrige para Não', caso(pSim).publicidade, 0);
  ok('   e a história diz o que mudou', eventos(pSim).some(e => e.tipo === 'editado' && /publicidade: sim → não/.test(e.texto || '')), JSON.stringify(eventos(pSim).map(e=>e.texto)));
  eq('editar para vazio é recusado', chamar('POST','/api/devolucao-casos/:id/editar',{ publicidade:'' }, 3, { id:pSim }).status, 400);
  eq('   e o valor fica', caso(pSim).publicidade, 0);
  chamar('POST','/api/devolucao-casos/:id/editar',{ publicidade:true }, 3, { id:pSim });

  secao('publicidade — os casos de antes ficam "não informado"');
  const LCp = require('./lancar_casos_iniciais');
  ok('o script dos casos iniciais não manda publicidade, e não é recusado', typeof LCp.rodar === 'function');
  db.prepare("INSERT INTO devolucao_caso (tipo,venda,etapa) VALUES ('ml','8800009','aguardando')").run();
  const pVelho = db.prepare("SELECT id FROM devolucao_caso WHERE venda='8800009'").get().id;
  eq('caso antigo: publicidade vazia, não zero', caso(pVelho).publicidade, null);

  secao('publicidade — entra no relatório do mês');
  const mesP = dia(0).slice(0,7);
  const relP = chamar('GET','/api/devolucao-casos/relatorio',null,2,{},{ mes:mesP }).body;
  ok('o relatório traz os três números', relP.publicidade && 'sim' in relP.publicidade && 'nao' in relP.publicidade && 'nao_informado' in relP.publicidade, JSON.stringify(relP.publicidade));
  const casosMes = db.prepare("SELECT publicidade FROM devolucao_caso WHERE teste=0 AND substr(criado_em,1,7)=?").all(mesP);
  eq('   o "sim" bate com o banco', relP.publicidade.sim, casosMes.filter(c => c.publicidade === 1).length);
  eq('   o "não" bate com o banco', relP.publicidade.nao, casosMes.filter(c => c.publicidade === 0).length);
  eq('   o "não informado" bate com o banco', relP.publicidade.nao_informado, casosMes.filter(c => c.publicidade == null).length);
  eq('   e os três somam os casos', relP.publicidade.sim + relP.publicidade.nao + relP.publicidade.nao_informado, relP.casos);
  ok('cada motivo diz quantos foram via publicidade', relP.por_motivo.every(l => typeof l.publicidade === 'number'), JSON.stringify(relP.por_motivo[0]));
  eq('   e a soma por motivo é o "sim"', relP.por_motivo.reduce((a,l) => a + l.publicidade, 0), relP.publicidade.sim);

  secao('mensagem do ML — texto longo, com quebra de linha');
  const msgML = 'Olá, o comprador abriu uma reclamação.\n\nMotivo: chegou com defeito.\n' + 'x'.repeat(3000);
  rp = lan({ venda:'8800010', publicidade:false, mensagem_ml:msgML });
  const pMsg = rp.body.id;
  eq('a mensagem é gravada inteira, com as quebras', caso(pMsg).mensagem_ml, msgML);
  ok('   e a história não copia o texto', eventos(pMsg).every(e => (e.texto || '').length < 500));
  chamar('POST','/api/devolucao-casos/:id/editar',{ mensagem_ml:'nova mensagem' }, 3, { id:pMsg });
  eq('editar troca a mensagem', caso(pMsg).mensagem_ml, 'nova mensagem');
  ok('   e a história diz só que mudou', eventos(pMsg).some(e => e.tipo === 'editado' && /mensagem do ML/.test(e.texto) && !/nova mensagem/.test(e.texto)), JSON.stringify(eventos(pMsg).map(e=>e.texto)));
  chamar('POST','/api/devolucao-casos/:id/editar',{ obs:'x' }, 3, { id:pMsg });
  eq('editar outro campo não apaga a mensagem', caso(pMsg).mensagem_ml, 'nova mensagem');
  eq('mensagem grande demais é recusada', lan({ venda:'8800011', publicidade:false, mensagem_ml:'y'.repeat(20001) }).status, 400);

  secao('link da conversa — só http(s), e abre direto');
  const LINK = 'https://www.mercadolivre.com.br/vendas/reclamacoes/123456/detalhe';
  rp = lan({ venda:'8800012', publicidade:false, link_ml:'  ' + LINK + '  ' });
  const pLink = rp.body.id;
  eq('o link é gravado sem os espaços', caso(pLink).link_ml, LINK);
  ok('   e vem no detalhe do caso', chamar('GET','/api/devolucao-casos/:id',null,2,{ id:pLink }).body.caso.link_ml === LINK);
  ['javascript:alert(1)', 'mercadolivre.com.br/x', 'ftp://a.b/c', 'https://a b.com', 'data:text/html,oi']
    .forEach(l => eq('link "'+l+'" é recusado', lan({ venda:'8800013', publicidade:false, link_ml:l }).status, 400));
  eq('link comprido demais é recusado', lan({ venda:'8800013', publicidade:false, link_ml:'https://a.com/'+'z'.repeat(2100) }).status, 400);
  eq('editar com link impossível é recusado', chamar('POST','/api/devolucao-casos/:id/editar',{ link_ml:'javascript:x' }, 3, { id:pLink }).status, 400);
  eq('   e o link fica', caso(pLink).link_ml, LINK);
  chamar('POST','/api/devolucao-casos/:id/editar',{ link_ml:'' }, 3, { id:pLink });
  eq('vazio de propósito apaga o link', caso(pLink).link_ml, null);

  secao('passado em — nasce no dia do lançamento (AJUSTE de 03/11/2026)');
  rp = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'8800020', prazo:dia(5), publicidade:false }, 3);
  eq('coleta sem "passado em": grava o dia do lançamento', caso(rp.body.id).passado_em, dia(0));
  rp = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'8800021', prazo:dia(5), passado_em:dia(-2), publicidade:false }, 3);
  eq('com a data informada, vale a informada', caso(rp.body.id).passado_em, dia(-2));
  eq('data impossível é recusada, e não vira hoje', chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'8800022', prazo:dia(5), passado_em:'2026-02-31', publicidade:false }, 3).status, 400);
  rp = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'8800023', publicidade:false }, 3);
  eq('no "ML devolve" não há a quem passar: fica vazio', caso(rp.body.id).passado_em, null);

  /* ── AJUSTE de 03/11/2026 (2): desfazer, lançar completo, mesmo comprador ── */
  secao('desfazer — o clique errado na etapa volta, com a data de antes');
  const lanC = (corpo, quem) => chamar('POST','/api/devolucao-casos', Object.assign({ tipo:'coleta', prazo:dia(6), publicidade:false }, corpo), quem || 3);
  const det = (id, quem) => chamar('GET','/api/devolucao-casos/:id',null,quem || 3,{ id }).body;
  const desf = (id, quem) => chamar('POST','/api/devolucao-casos/:id/desfazer-etapa',{}, quem || 3, { id });
  let dz = lanC({ venda:'8800030' }).body.id;
  db.prepare("UPDATE devolucao_caso SET etapa_desde='2026-10-20 08:00:00' WHERE id=?").run(dz);
  eq('antes de mudar não há o que desfazer', det(dz).desfazer, null);
  chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'coleta_pedida' }, 3, { id:dz });
  eq('mudou para Coleta pedida', caso(dz).etapa, 'coleta_pedida');
  ok('quem mudou vê o desfazer, voltando para Lançado', det(dz, 3).desfazer && det(dz, 3).desfazer.para === 'lancado', JSON.stringify(det(dz,3).desfazer));
  eq('outra pessoa não vê o desfazer', det(dz, 2).desfazer, null);
  eq('   e se tentar, é recusada', desf(dz, 2).status, 403);
  eq('   e a etapa não mexe', caso(dz).etapa, 'coleta_pedida');
  eq('quem mudou desfaz', desf(dz, 3).status, 200);
  eq('   a etapa volta', caso(dz).etapa, 'lancado');
  eq('   e a data da etapa volta a de antes (o "parado" não zera)', caso(dz).etapa_desde, '2026-10-20 08:00:00');
  ok('   e a história guarda o clique e o desfeito', eventos(dz).some(e => e.tipo === 'etapa' && e.para === 'coleta_pedida') && eventos(dz).some(e => e.tipo === 'desfeito' && e.de === 'coleta_pedida' && e.para === 'lancado'), JSON.stringify(eventos(dz).map(e => e.tipo)));
  eq('desfazer duas vezes não volta mais uma', desf(dz, 3).status, 409);
  eq('   e o desfazer some do caso', det(dz, 3).desfazer, null);
  chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'coleta_pedida' }, 3, { id:dz });
  chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'a_caminho' }, 3, { id:dz });
  eq('com duas mudanças, desfaz só a última', (desf(dz, 3), caso(dz).etapa), 'coleta_pedida');
  chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'a_caminho' }, 3, { id:dz });
  chamar('POST','/api/devolucao-casos/:id/chegou',{}, 3, { id:dz });
  eq('depois da chegada não desfaz a etapa de antes', desf(dz, 3).status, 409);
  eq('   e a chegada fica', caso(dz).etapa, 'chegou');
  dz = lanC({ venda:'8800031' }).body.id;
  chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'coleta_pedida' }, 3, { id:dz });
  chamar('POST','/api/devolucao-casos/:id/editar',{ obs:'anotei' }, 3, { id:dz });
  eq('editar o lançamento depois não impede o desfazer', desf(dz, 3).status, 200);
  dz = lanC({ venda:'8800032' }).body.id;
  chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'coleta_pedida' }, 3, { id:dz });
  chamar('POST','/api/devolucao-casos/:id/perda',{}, 1, { id:dz });
  eq('caso encerrado não desfaz', desf(dz, 3).status, 409);

  secao('lançar completo — coleta e valor já no lançamento');
  const tL = chamar('POST','/api/devolucao-casos/transportadoras',{ nome:'Rápido Lançar' }, 2).body.id;
  rp = lanC({ venda:'8800040', comprador:'Fulano Completo', cep:'01310-100', coleta:{ transportadora_id:tL, custo:'45,90' }, valor_ml:'120,00', valor_ml_situacao:'pedir' }, 1);
  eq('lança com tudo', rp.status, 200);
  const cL = rp.body.id;
  eq('   o caso já nasce em Coleta pedida', caso(cL).etapa, 'coleta_pedida');
  eq('   o CEP só com os números', caso(cL).cep, '01310100');
  const tentL = db.prepare('SELECT * FROM devolucao_coleta WHERE caso_id=?').all(cL);
  eq('   a 1ª tentativa registrada', tentL.length + '/' + (tentL[0] && tentL[0].transportadora_id) + '/' + (tentL[0] && tentL[0].custo), '1/' + tL + '/45.9');
  eq('   o valor do ML gravado', caso(cL).valor_ml, 120);
  eq('   e a situação do valor', caso(cL).valor_ml_situacao, 'pedir');
  ok('   e o valor entra na auditoria', AUDIT.some(a => a.acao === 'valor' && a.alvo === String(cL)));
  rp = lanC({ venda:'8800047', valor_ml:'80' }, 1);
  eq('valor sem situação escolhida: "já veio", como na tela do caso', caso(rp.body.id).valor_ml_situacao, 'ja_veio');
  const antesL = contar('devolucao_caso');
  eq('sem a chave do dinheiro, valor no lançamento é recusado', lanC({ venda:'8800041', valor_ml:'50' }, 3).status, 403);
  eq('   e o custo da coleta também', lanC({ venda:'8800041', coleta:{ transportadora_id:tL, custo:'10' } }, 3).status, 403);
  eq('   e nada foi gravado', contar('devolucao_caso'), antesL);
  rp = lanC({ venda:'8800042', coleta:{ transportadora_id:tL }, valor_ml_situacao:'ja_veio' }, 3);
  eq('sem a chave: coleta sem custo e a situação do valor passam', rp.status, 200);
  eq('   a tentativa fica com o custo vazio, não zero', db.prepare('SELECT custo FROM devolucao_coleta WHERE caso_id=?').get(rp.body.id).custo, null);
  eq('transportadora que não existe: recusado', lanC({ venda:'8800043', coleta:{ transportadora_id:99999 } }, 1).status, 400);
  eq('   e o caso não nasce pela metade', contar('devolucao_caso',"venda='8800043'"), 0);
  eq('situação do valor impossível: recusado e nada gravado', lanC({ venda:'8800044', valor_ml_situacao:'xyz' }, 1).status + '/' + contar('devolucao_caso',"venda='8800044'"), '400/0');
  eq('no "ML devolve" não se pede coleta', chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'8800045', publicidade:false, coleta:{ transportadora_id:tL } }, 1).status, 400);
  eq('   e nada foi gravado', contar('devolucao_caso',"venda='8800045'"), 0);
  rp = lanC({ venda:'8800046', coleta:{ transportadora_id:'' }, valor_ml:'', valor_ml_situacao:'' }, 3);
  eq('bloco vazio é como não ter vindo', rp.status + '/' + caso(rp.body.id).etapa, '200/lancado');

  secao('mesmo comprador — a coleta sabe que são várias da mesma pessoa');
  const m1 = lanC({ venda:'8800050', comprador:'Maria da Silva Souza' }).body.id;
  const m2 = lanC({ venda:'8800051', comprador:'MARIA DA SILVA SOUZA' }).body.id;
  const m3 = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'8800052', comprador:'Maria da Sílva Souza', publicidade:false }, 3).body.id;
  const mOutra = lanC({ venda:'8800053', comprador:'José Pereira Lima' }).body.id;
  const mFechado = lanC({ venda:'8800054', comprador:'Maria da Silva Souza' }).body.id;
  chamar('POST','/api/devolucao-casos/:id/perda',{}, 1, { id:mFechado });
  const lstM = chamar('GET','/api/devolucao-casos',null,2).body;
  const todosM = lstM.coleta.concat(lstM.ml);
  const irm = (id) => (daLista(todosM, id) || {}).mesmo_comprador;
  eq('o caso diz quais outros abertos são da mesma pessoa', JSON.stringify(irm(m1)), JSON.stringify([m2, m3]));
  eq('   nos dois sentidos, e nos dois tipos', JSON.stringify(irm(m3)), JSON.stringify([m1, m2]));
  eq('   outra pessoa não entra', JSON.stringify(irm(mOutra)), '[]');
  ok('   o encerrado não conta', !irm(m1).includes(mFechado));
  eq('o detalhe do caso traz os mesmos', JSON.stringify((det(m2, 2).mesmo_comprador || []).map(x => x.id)), JSON.stringify([m1, m3]));
  ok('   com a venda e a etapa de cada um', (det(m2, 2).mesmo_comprador || []).every(x => x.venda && x.etapa_nome));
  db.exec("INSERT INTO lote (codigo,buyer,nf,venda,packId) VALUES ('BK100100BEGE','Maria da Silva Souza','7777','8800059',NULL)");
  const vm = chamar('GET','/api/devolucao-casos/venda/:cod',null,3,{ cod:'8800059' }).body;
  eq('ao lançar, a venda achada avisa os casos abertos do comprador', JSON.stringify((vm.comprador_casos || []).map(x => x.id)), JSON.stringify([m1, m2, m3]));

  secao('motivo removido da lista — o caso que já usa ele não perde');
  db.prepare("INSERT INTO listas (tipo,valor,ordem,ativo) VALUES ('motivo_devolucao','Motivo que vai sair',99,1)").run();
  const mr = lanC({ venda:'8800060', motivo:'Motivo que vai sair' }).body.id;
  db.prepare("UPDATE listas SET ativo=0 WHERE tipo='motivo_devolucao' AND valor='Motivo que vai sair'").run();
  rp = chamar('POST','/api/devolucao-casos/:id/editar',{ motivo:'Motivo que vai sair', obs:'mudei só a observação' }, 3, { id:mr });
  eq('editar outro campo mandando o mesmo motivo passa', rp.status, 200);
  eq('   e o motivo fica', caso(mr).motivo, 'Motivo que vai sair');
  eq('trocar PARA um motivo removido é recusado', chamar('POST','/api/devolucao-casos/:id/editar',{ motivo:'Motivo que vai sair' }, 3, { id:m1 }).status, 400);

  secao('motivos — o cadastro aparece para quem tem listas.editar');
  eq('quem tem a chave vê o cadastro', chamar('GET','/api/devolucao-casos',null,1).body.pode.listas, true);
  eq('quem não tem não vê', chamar('GET','/api/devolucao-casos',null,2).body.pode.listas, false);

  fim();
})().catch(e => { console.log('ESTOUROU: ' + e.stack); falhas++; fim(); });

function fim(){
  db.close(); fs.rmSync(tmp, { recursive:true, force:true });
  console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
  process.exit(falhas ? 1 : 0);
}
