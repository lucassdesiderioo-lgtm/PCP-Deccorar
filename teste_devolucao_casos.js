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
  1: new Set(['devolucao.lancar','devolucao.acompanhar','devolucao.dinheiro','devolucao.registrar','devolucao.baixar']),
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
                sendFile(f){ out.arquivo=f; return res; }, type(){ return res; }, send(b){ out.body=b; return res; } };
  const uid = quem || 1;
  h({ body: corpo||{}, params: params||{}, query: query||{}, headers:{}, usuario:{id:uid, nome:NOMES[uid]} }, res);
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

  fim();
})().catch(e => { console.log('ESTOUROU: ' + e.stack); falhas++; fim(); });

function fim(){
  db.close(); fs.rmSync(tmp, { recursive:true, force:true });
  console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
  process.exit(falhas ? 1 : 0);
}
