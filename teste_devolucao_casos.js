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
  CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nome TEXT, ativo INTEGER DEFAULT 1);
  INSERT INTO usuarios (id,nome) VALUES (1,'Lucas'),(2,'Renato'),(3,'Ana'),(4,'Edvaldo');
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
  /* O QUE O LANÇAMENTO EXIGE (04/11/2026): motivo, SKU, comprador,
     responsável e link. Os casos de antes da regra não falam disso; quem não
     manda a chave ganha um valor de teste — o SKU e o comprador só quando a
     venda não está no lote (lá eles vêm da venda, como no servidor). Quem
     testa a obrigação manda a chave, mesmo vazia. */
  if(metodo === 'POST' && rota === '/api/devolucao-casos' && corpo && !corpo._cru){
    const DD = require('./devcaso_dominio');
    const lt = DD.buscarLote(db, String(corpo.venda||corpo.pack_id||'').replace(/\s+/g,'')) || DD.buscarLotePorNF(db, corpo.nf);
    const pad = { motivo:'Avaria no transporte', responsavel_id:1, link_ml:'https://www.mercadolivre.com.br/reclamacao/teste' };
    if(!(lt && lt.codigo)) pad.sku = 'BK140140BEGE';
    if(!(lt && lt.buyer)) pad.comprador = 'Comprador Teste';
    for(const k of Object.keys(pad)) if(k in corpo) delete pad[k];
    corpo = Object.assign(pad, corpo);
  }
  if(corpo && corpo._cru){ corpo = Object.assign({}, corpo); delete corpo._cru; }
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

  secao('28. a baixa da devolução ligada: o motivo vem do caso; o "ML devolve" encerra com a baixa E o "Já revisei"');
  const pend = chamar('GET','/api/devolucao/pendentes',null,3).body;
  const p28 = pend.find(d => d.id === caso(k21).devolucao_id);
  eq('a lista de pendentes traz o motivo do caso', p28 && p28.caso_motivo, 'Falta de kit');
  eq('   e o número do caso', p28 && p28.caso_id, k21);
  r = chamar('POST','/api/devolucao/baixa',{ id:caso(k21).devolucao_id, reputacao:'nao' }, 3);
  eq('a baixa sem motivo escolhido passa', r.status, 200);
  eq('   e grava o motivo do caso', db.prepare('SELECT motivo FROM devolucao WHERE id=?').get(caso(k21).devolucao_id).motivo, 'Falta de kit');
  /* Desde 03/11/2026 (decisão do dono): o "ML devolve" só encerra depois de
     alguém marcar "Já revisei" no ML — sem isso o ML entende que a peça chegou
     como esperado e o prazo de contestar passa. */
  eq('a baixa sozinha NÃO encerra o "ML devolve"', caso(k21).encerrado_em, null);
  eq('   e a lista diz que falta o "Já revisei"', (daLista(lista(2).ml, k21) || {}).falta_revisei, true);
  r = chamar('POST','/api/devolucao-casos/:id/aviso-ml',{}, 3, {id:k21});
  eq('"Já revisei no ML" marcado', r.status, 200);
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
  const DINHEIRO_CHAVES = ['valor_ml','custo','valor_devolvido','valor_perdido','saldo','custo_etiqueta','valor_revisao'];
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
  /* Desde 03/11/2026 (decisão do dono): quem lança e quem acompanha vê e
     lança os valores do caso; a chave do dinheiro fica com as decisões. */
  eq('quem não lança nem acompanha não lança valor: 403', valor(k45, { valor_ml:'150,00' }, 4).status, 403);
  eq('quem acompanha lança o valor do ML', valor(k45, { valor_ml:'150,00' }, 2).status, 200);
  eq('o valor perdido e o devolvido continuam da chave do dinheiro', valor(k45, { valor_perdido:'10' }, 2).status, 403);
  eq('   e o devolvido também', valor(k45, { valor_devolvido:'10' }, 3).status, 403);
  eq('com a chave, de novo: nada muda e passa', valor(k45, { valor_ml:'150,00' }).status, 200);
  eq('   o valor gravado', caso(k45).valor_ml, 150);
  eq('   e a situação vira "já veio"', caso(k45).valor_ml_situacao, 'ja_veio');
  chamar('POST','/api/devolucao-casos/:id/coleta',{ transportadora_id:tA, cep:'80010-000', custo:'40' }, 2, {id:k45});
  let tt = db.prepare("SELECT id FROM devolucao_coleta WHERE caso_id=? AND resultado='aguardando'").get(k45);
  chamar('POST','/api/devolucao-casos/:id/coleta-resultado',{ tentativa_id:tt.id, resultado:'nao_encontrou' }, 2, {id:k45});
  tt = db.prepare("SELECT id FROM devolucao_coleta WHERE caso_id=? AND resultado='aguardando'").get(k45);

  secao('45. quem não lança nem acompanha não recebe valor; o total do mês é só da chave do dinheiro');
  const fios = {
    lista: chamar('GET','/api/devolucao-casos',null,4).body,
    caso: chamar('GET','/api/devolucao-casos/:id',null,4,{id:k45}).body,
    encerrados: chamar('GET','/api/devolucao-casos/encerrados',null,4).body,
    relatorio: chamar('GET','/api/devolucao-casos/relatorio',null,4,{},{ mes }).body,
    'relatório de quem acompanha': chamar('GET','/api/devolucao-casos/relatorio',null,2,{},{ mes }).body,
    'relatório de quem lança': chamar('GET','/api/devolucao-casos/relatorio',null,3,{},{ mes }).body
  };
  for(const [nome, corpo] of Object.entries(fios)){
    const ks = chavesDe(corpo);
    const vazou = DINHEIRO_CHAVES.filter(k => ks.has(k));
    ok(nome + ': nenhuma chave de dinheiro', vazou.length === 0, 'vazou: ' + vazou.join(', '));
  }
  ok('o relatório para quem não tem a chave ainda conta os casos por motivo', (fios.relatorio.por_motivo || []).length > 0, JSON.stringify(fios.relatorio).slice(0,300));
  const comA = chamar('GET','/api/devolucao-casos/:id',null,2,{id:k45}).body;
  ok('quem acompanha recebe os valores do caso', comA.caso.valor_ml === 150 && 'saldo' in comA.caso && comA.tentativas.every(t => 'custo' in t), JSON.stringify(comA.caso).slice(0,300));
  ok('   e na lista também', (daLista(chamar('GET','/api/devolucao-casos',null,3).body.coleta, k45) || {}).valor_ml === 150);
  eq('   e o "pode" diz que vê valores, sem dizer que tem o dinheiro', JSON.stringify([lista(2).pode.valores, lista(2).pode.dinheiro]), '[true,false]');
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
  eq('   e a quem não lança nem acompanha, sem mandar o valor junto', 'valor_ml' in daLista(lista(4).coleta, k49), false);
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
  eq('quem só dá baixa vai à tela 253 (Admin → Devoluções, desde a fase 5 da ACESSO-POR-TELA-E-NIVEL)', porta(7).para, '/admin/devolucoes');
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
    ok(tela + ' liga as três abas às três telas', /'\/devolucao'/.test(H) && /'\/devolucao-casos'/.test(H) && /'\/admin\/devolucoes'/.test(H));
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

  secao('busca — o valor não viaja a quem não lança nem acompanha');
  const ks = chavesDe(busca('55123', 4).body);
  ok('sem lançar nem acompanhar: nenhum valor', !DINHEIRO_CHAVES.some(k => ks.has(k)), [...ks].join(','));
  ok('quem acompanha: o valor vem', (busca('55123', 2).body.casos || []).some(c => c.valor_ml === 99));

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
  /* AJUSTE de 04/11/2026: o desfazer depois da chegada desfaz a CHEGADA (o
     último clique), e não a etapa de antes dela. */
  eq('depois da chegada, o desfazer volta a chegada', desf(dz, 3).status, 200);
  eq('   e o caso volta a "A caminho"', caso(dz).etapa, 'a_caminho');
  eq('   e a etapa de antes da chegada não se desfaz em seguida', desf(dz, 3).status, 409);
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
  /* Quem lança, lança os valores (decisão do dono, 03/11/2026). */
  rp = lanC({ venda:'8800041', valor_ml:'50', coleta:{ transportadora_id:tL, custo:'10' } }, 3);
  eq('quem lança e acompanha, sem a chave do dinheiro, lança valor e custo', rp.status, 200);
  eq('   o valor gravado', caso(rp.body.id).valor_ml, 50);
  eq('   e o custo da tentativa', db.prepare('SELECT custo FROM devolucao_coleta WHERE caso_id=?').get(rp.body.id).custo, 10);
  eq('   (um caso a mais)', contar('devolucao_caso'), antesL + 1);
  rp = lanC({ venda:'8800042', coleta:{ transportadora_id:tL }, valor_ml_situacao:'ja_veio' }, 3);
  eq('coleta sem custo e a situação do valor passam', rp.status, 200);
  eq('   a tentativa fica com o custo vazio, não zero', db.prepare('SELECT custo FROM devolucao_coleta WHERE caso_id=?').get(rp.body.id).custo, null);
  eq('transportadora que não existe: recusado', lanC({ venda:'8800043', coleta:{ transportadora_id:99999 } }, 1).status, 400);
  eq('   e o caso não nasce pela metade', contar('devolucao_caso',"venda='8800043'"), 0);
  eq('situação do valor impossível: recusado e nada gravado', lanC({ venda:'8800044', valor_ml_situacao:'xyz' }, 1).status + '/' + contar('devolucao_caso',"venda='8800044'"), '400/0');
  eq('no "ML devolve" não se pede coleta', chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'8800045', publicidade:false, coleta:{ transportadora_id:tL } }, 1).status, 400);
  eq('   e nada foi gravado', contar('devolucao_caso',"venda='8800045'"), 0);
  rp = lanC({ venda:'8800046', coleta:{ transportadora_id:'' }, valor_ml:'', valor_ml_situacao:'' }, 3);
  eq('bloco vazio é como não ter vindo', rp.status + '/' + caso(rp.body.id).etapa, '200/lancado');

  secao('mesmo comprador — a coleta sabe que são várias da mesma pessoa');
  const m1 = lanC({ venda:'8800050', comprador:'Rosangela da Paz Arruda' }).body.id;
  const m2 = lanC({ venda:'8800051', comprador:'ROSANGELA DA PAZ ARRUDA' }).body.id;
  const m3 = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'8800052', comprador:'Rosângela da Paz Arruda', publicidade:false }, 3).body.id;
  const mOutra = lanC({ venda:'8800053', comprador:'José Pereira Lima' }).body.id;
  const mFechado = lanC({ venda:'8800054', comprador:'Rosangela da Paz Arruda' }).body.id;
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
  db.exec("INSERT INTO lote (codigo,buyer,nf,venda,packId) VALUES ('BK100100BEGE','Rosangela da Paz Arruda','7777','8800059',NULL)");
  const vm = chamar('GET','/api/devolucao-casos/venda/:cod',null,3,{ cod:'8800059' }).body;
  eq('ao lançar, a venda achada avisa os casos abertos do comprador', JSON.stringify((vm.comprador_casos || []).map(x => x.id)), JSON.stringify([m1, m2, m3]));

  secao('revisão (dupla checagem) — o que a revisão independente achou');
  const antesR = contar('devolucao_caso');
  rp = lanC({ venda:'8800070', coleta:{ transportadora_id:'', custo:'50' } }, 1);
  eq('custo sem transportadora é recusado, e não some calado', rp.status, 400);
  ok('   e a recusa diz o que fazer', /transportadora/i.test(rp.body.erro || ''), rp.body.erro);
  eq('   e nada foi gravado', contar('devolucao_caso'), antesR);
  PERMS[6] = new Set(['devolucao.lancar']); NOMES[6] = 'Só lança';
  eq('quem só lança não pede a coleta no lançamento', lanC({ venda:'8800071', coleta:{ transportadora_id:tL } }, 6).status, 403);
  eq('   nem marca a situação do valor', lanC({ venda:'8800071', valor_ml_situacao:'pedir' }, 6).status, 403);
  eq('   mas lança o caso simples', lanC({ venda:'8800071' }, 6).status, 200);
  const NM = require('./nome');
  eq('"Ana" não é a mesma pessoa que "Luciana Souza"', NM.mesmaPessoaPorPalavras('Ana', 'Luciana Souza'), false);
  eq('"Maria Silva" não é "Rosemaria Silva Santos"', NM.mesmaPessoaPorPalavras('Maria Silva', 'Rosemaria Silva Santos'), false);
  eq('um nome só não junta ninguém', NM.mesmaPessoaPorPalavras('Maria', 'Maria Silva'), false);
  eq('"Maria Silva" é "Maria da Silva" (palavras inteiras)', NM.mesmaPessoaPorPalavras('Maria Silva', 'Maria da Silva'), true);
  eq('"Maria Souza" × "Maria da Silva Souza": avisa (o ML abrevia o meio)', NM.mesmaPessoaPorPalavras('Maria Souza', 'Maria da Silva Souza'), true);
  eq('sobrenome do fim diferente não junta', NM.mesmaPessoaPorPalavras('Maria Silva', 'Maria Silva Santos'), false);
  eq('acento e maiúscula não separam', NM.mesmaPessoaPorPalavras('JOSÉ PEREIRA', 'José Pereira'), true);
  eq('a letra dobrada do ML continua juntando', NM.mesmaPessoaPorPalavras('Ryta Rufiino', 'Ryta Rufino'), true);
  eq('nome vazio: sem resposta (null)', NM.mesmaPessoaPorPalavras('', 'Ana Souza'), null);
  const a1 = lanC({ venda:'8800072', comprador:'Ana' }).body.id;
  lanC({ venda:'8800073', comprador:'Luciana Souza' });
  const lstR = chamar('GET','/api/devolucao-casos',null,2).body;
  eq('na lista, "Ana" não ganha irmão falso', JSON.stringify((daLista(lstR.coleta.concat(lstR.ml), a1) || {}).mesmo_comprador), '[]');
  dz = lanC({ venda:'8800074' }).body.id;
  db.prepare("UPDATE devolucao_caso SET etapa='docs_enviados' WHERE id=?").run(dz);
  chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'a_caminho' }, 3, { id:dz });
  eq('desfazer para "Documentos ao ML" sem os documentos é recusado', desf(dz, 3).status, 400);
  eq('   e o caso fica onde estava', caso(dz).etapa, 'a_caminho');
  const colsC = db.prepare("SELECT sql FROM sqlite_master WHERE name='devolucao_caso'").get().sql;
  const colsE = db.prepare("SELECT sql FROM sqlite_master WHERE name='devolucao_evento'").get().sql;
  ok('§17: as colunas novas estão no CREATE do código', ['publicidade','mensagem_ml','link_ml'].every(k => new RegExp('\\b'+k+'\\b').test(require('fs').readFileSync(require('path').join(__dirname,'devcaso_dominio.js'),'utf8').split('CREATE TABLE IF NOT EXISTS devolucao_caso')[1].split(')`);')[0])));
  ok('§17: e as do evento também', ['usuario_id','etapa_desde_antes'].every(k => new RegExp('\\b'+k+'\\b').test(require('fs').readFileSync(require('path').join(__dirname,'devcaso_dominio.js'),'utf8').split('CREATE TABLE IF NOT EXISTS devolucao_evento')[1].split(')`);')[0])));

  /* ── AJUSTE de 03/11/2026 (4): trocar o tipo do caso, e o custo da etiqueta ── */
  secao('trocar o tipo — ML devolve → Nós coletamos');
  const troca = (id, corpo, quem) => chamar('POST','/api/devolucao-casos/:id/tipo', corpo, quem || 3, { id });
  let tp = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'8800080', publicidade:false }, 3).body.id;
  db.prepare("UPDATE devolucao_caso SET etapa_desde='2026-10-25 09:00:00' WHERE id=?").run(tp);
  eq('sem o prazo do ML: recusado', troca(tp, { para:'coleta' }).status, 400);
  eq('   e o caso continua ML devolve', caso(tp).tipo, 'ml');
  eq('quem só acompanha não troca', troca(tp, { para:'coleta', prazo:dia(5) }, 2).status, 403);
  eq('com o prazo: troca', troca(tp, { para:'coleta', prazo:dia(5) }).status, 200);
  eq('   vira Nós coletamos', caso(tp).tipo, 'coleta');
  eq('   Aguardando vira Lançado', caso(tp).etapa, 'lancado');
  eq('   com o prazo gravado', caso(tp).prazo, dia(5));
  eq('   e o "passado em" vazio ganha o dia do lançamento', caso(tp).passado_em, caso(tp).criado_em.slice(0,10));
  eq('   e a data da etapa não zera', caso(tp).etapa_desde, '2026-10-25 09:00:00');
  ok('   e a história diz a troca', eventos(tp).some(e => e.tipo === 'tipo' && e.de === 'ml' && e.para === 'coleta'), JSON.stringify(eventos(tp).map(e => e.tipo)));
  eq('trocar para o mesmo tipo é recusado', troca(tp, { para:'coleta', prazo:dia(5) }).status, 400);
  eq('tipo que não existe é recusado', troca(tp, { para:'outro' }).status, 400);

  secao('trocar o tipo — Nós coletamos → ML devolve');
  chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'coleta_pedida' }, 3, { id:tp });
  eq('sem coleta nem valor: troca', troca(tp, { para:'ml' }).status, 200);
  eq('   Coleta pedida (à mão) vira Aguardando', caso(tp).etapa, 'aguardando');
  eq('   e o prazo fica guardado', caso(tp).prazo, dia(5));
  eq('   e o desfazer do clique de antes não volta para o outro tipo', det(tp, 3).desfazer, null);
  rp = lanC({ venda:'8800081', coleta:{ transportadora_id:tL } }, 3);
  eq('com coleta pedida: recusado', troca(rp.body.id, { para:'ml' }).status, 409);
  ok('   e a recusa diz por quê', /coleta/i.test(troca(rp.body.id, { para:'ml' }).body.erro || ''));
  eq('   e o caso fica', caso(rp.body.id).tipo, 'coleta');
  rp = lanC({ venda:'8800082', valor_ml:'90' }, 1);
  eq('com valor do ML lançado: recusado', troca(rp.body.id, { para:'ml' }).status, 409);
  rp = lanC({ venda:'8800083' }, 3);
  db.prepare("UPDATE devolucao_caso SET etapa='ml_avisado', chegou_em=datetime('now','localtime') WHERE id=?").run(rp.body.id);
  troca(rp.body.id, { para:'ml' });
  eq('ML avisado vira Chegou', caso(rp.body.id).etapa, 'chegou');
  rp = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'8800084', publicidade:false }, 3);
  db.prepare("UPDATE devolucao_caso SET etapa='revisado' WHERE id=?").run(rp.body.id);
  troca(rp.body.id, { para:'coleta', prazo:dia(3) });
  eq('Revisado fica Revisado', caso(rp.body.id).etapa, 'revisado');
  eq('caso encerrado não troca', troca(mFechado, { para:'ml' }).status, 409);

  secao('custo da etiqueta de devolução — no ML devolve também há custo');
  rp = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'8800090', publicidade:false, custo_etiqueta:'48,70' }, 1);
  eq('lançar com o custo da etiqueta (com a chave do dinheiro)', rp.status, 200);
  const ce = rp.body.id;
  eq('   gravado', caso(ce).custo_etiqueta, 48.7);
  eq('quem lança, sem a chave do dinheiro, também lança a etiqueta', chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'8800091', publicidade:false, custo_etiqueta:'48,70' }, 3).status, 200);
  eq('   gravado', (db.prepare("SELECT custo_etiqueta v FROM devolucao_caso WHERE venda='8800091'").get() || {}).v, 48.7);
  eq('custo impossível: recusado', chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'8800092', publicidade:false, custo_etiqueta:'abc' }, 1).status, 400);
  eq('corrigir pelo "Salvar valores"', chamar('POST','/api/devolucao-casos/:id/valor',{ custo_etiqueta:'50' }, 1, { id:ce }).status, 200);
  eq('   corrigido', caso(ce).custo_etiqueta, 50);
  ok('   a história diz o que mudou, sem o número', eventos(ce).some(e => e.tipo === 'valor' && /etiqueta/.test(e.texto) && !/50/.test(e.texto)), JSON.stringify(eventos(ce).map(e=>e.texto)));
  eq('   e vai para a auditoria', AUDIT.some(a => a.acao === 'valor' && a.alvo === String(ce)), true);
  eq('quem não lança nem acompanha: o "Salvar valores" é recusado', chamar('POST','/api/devolucao-casos/:id/valor',{ custo_etiqueta:'1' }, 4, { id:ce }).status, 403);
  eq('quem acompanha salva a etiqueta', chamar('POST','/api/devolucao-casos/:id/valor',{ custo_etiqueta:'50' }, 2, { id:ce }).status, 200);
  ok('o custo não viaja a quem não lança nem acompanha (caso)', !chavesDe(det(ce, 4)).has('custo_etiqueta'));
  ok('   nem na lista', !chavesDe(chamar('GET','/api/devolucao-casos',null,4).body).has('custo_etiqueta'));
  eq('   e viaja a quem acompanha', det(ce, 2).caso.custo_etiqueta, 50);
  const relCE = chamar('GET','/api/devolucao-casos/relatorio',null,1,{},{ mes:dia(0).slice(0,7) }).body;
  eq('o relatório soma as etiquetas', relCE.dinheiro.custo_etiqueta,
     Math.round(db.prepare("SELECT SUM(custo_etiqueta) s FROM devolucao_caso WHERE teste=0 AND substr(criado_em,1,7)=?").get(dia(0).slice(0,7)).s * 100) / 100);
  ok('   e quem não tem a chave não vê', !chavesDe(chamar('GET','/api/devolucao-casos/relatorio',null,2,{},{ mes:dia(0).slice(0,7) }).body).has('custo_etiqueta'));

  /* ── AJUSTE de 03/11/2026 (5): a revisão do frete no "ML devolve" ── */
  secao('revisão do frete — só no ML devolve, e só depois de a caixa chegar');
  const pedeRev = (id, corpo, quem) => chamar('POST','/api/devolucao-casos/:id/revisao-frete', corpo || {}, quem || 2, { id });
  const respRev = (id, corpo, quem) => chamar('POST','/api/devolucao-casos/:id/revisao-frete-resposta', corpo || {}, quem || 2, { id });
  const rv = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000000000009301', publicidade:true, custo_etiqueta:'48,70' }, 1).body.id;
  eq('antes de a caixa chegar: recusado', pedeRev(rv).status, 409);
  chamar('POST','/api/devolucao-casos/:id/chegou',{}, 2, { id:rv });
  eq('quem não acompanha não pede', pedeRev(rv, {}, 4).status, 403);
  rp = pedeRev(rv, { numero:'  REV-5603716835 ' });
  eq('depois de chegar: pede', rp.status, 200);
  ok('   grava a data do pedido', !!caso(rv).revisao_pedida_em);
  eq('   e o número, sem os espaços', caso(rv).revisao_numero, 'REV-5603716835');
  ok('   e a história', eventos(rv).some(e => e.tipo === 'revisao_frete'));
  eq('pedir de novo: recusado', pedeRev(rv).status, 409);
  const rvc = lanC({ venda:'8800100' }, 3).body.id;
  chamar('POST','/api/devolucao-casos/:id/chegou',{}, 2, { id:rvc });
  eq('no Nós coletamos: recusado', pedeRev(rvc).status, 400);

  secao('revisão do frete — pendente aparece, e grita depois de 2 dias');
  let lr = daLista(chamar('GET','/api/devolucao-casos',null,2).body.ml, rv);
  eq('a lista diz que a revisão está pendente', lr.revisao_pendente, true);
  eq('   há 0 dias', lr.dias_revisao, 0);
  eq('   e ainda não é parada', lr.revisao_parada, false);
  db.prepare("UPDATE devolucao_caso SET revisao_pedida_em=datetime('now','localtime','-3 days') WHERE id=?").run(rv);
  lr = daLista(chamar('GET','/api/devolucao-casos',null,2).body.ml, rv);
  eq('com 3 dias: parada', lr.dias_revisao + '/' + lr.revisao_parada, '3/true');

  secao('revisão do frete — com revisão pendente, a baixa NÃO encerra o ML devolve (decisão do dono)');
  r = chamar('POST','/api/devolucao',{ codigo_ml:'2000000000009301', caso_id:rv, sku_fisico:'BK140140BEGE', destinacao:'estoque' }, 4);
  eq('a peça é revisada', caso(rv).etapa, 'revisado');
  r = chamar('POST','/api/devolucao/baixa',{ id:caso(rv).devolucao_id, reputacao:'nao' }, 3);
  eq('a baixa passa', r.status, 200);
  eq('   e o caso continua aberto', caso(rv).encerrado_em, null);
  ok('   e a história diz que espera a revisão', eventos(rv).some(e => /revis[ãa]o do frete/i.test(e.texto || '') && /baixa/i.test(e.texto || '')), JSON.stringify(eventos(rv).map(e=>e.texto)));

  secao('revisão do frete — a resposta do ML');
  eq('resposta impossível: recusada', respRev(rv, { resultado:'talvez' }).status, 400);
  eq('quem não acompanha não lança a resposta', respRev(rv, { resultado:'devolveu', valor_revisao:'48,70' }, 4).status, 403);
  eq('   e nada mudou', caso(rv).revisao_resultado, null);
  rp = respRev(rv, { resultado:'devolveu', valor_revisao:'48,70' }, 1);
  eq('"ML devolveu", com o valor (Admin Geral)', rp.status, 200);
  eq('   o resultado', caso(rv).revisao_resultado, 'devolveu');
  eq('   o valor', caso(rv).valor_revisao, 48.7);
  ok('   e a data da resposta', !!caso(rv).revisao_resp_em);
  eq('   o caso já baixado, sem o "Já revisei", continua aberto', caso(rv).encerrado_em, null);
  chamar('POST','/api/devolucao-casos/:id/aviso-ml',{}, 2, { id:rv });
  eq('   e com o "Já revisei" encerra', caso(rv).saida, 'revisado_ml');
  ok('   a história diz o que mudou, sem o número', eventos(rv).some(e => e.tipo === 'revisao_frete' && /atendeu/.test(e.texto) && !/48/.test(e.texto)), JSON.stringify(eventos(rv).map(e=>e.texto)));
  ok('   e a auditoria grava o valor', AUDIT.some(a => a.acao === 'valor' && a.alvo === String(rv)));
  ok('o valor devolvido não viaja a quem não lança nem acompanha', !chavesDe(det(rv, 4)).has('valor_revisao'));
  ok('   e viaja a quem acompanha', chavesDe(det(rv, 2)).has('valor_revisao'));
  const rv2 = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000000000009302', publicidade:false }, 3).body.id;
  eq('resposta sem pedido: recusada', respRev(rv2, { resultado:'negou' }).status, 409);
  chamar('POST','/api/devolucao-casos/:id/chegou',{}, 2, { id:rv2 });
  pedeRev(rv2);
  eq('"ML negou" (quem acompanha)', respRev(rv2, { resultado:'negou' }).status, 200);
  eq('   resposta duas vezes: recusada', respRev(rv2, { resultado:'devolveu' }).status, 409);
  eq('   e o caso ainda não baixado continua aberto', caso(rv2).encerrado_em, null);
  r = chamar('POST','/api/devolucao',{ codigo_ml:'2000000000009302', caso_id:rv2, sku_fisico:'BK140140BEGE', destinacao:'estoque' }, 4);
  chamar('POST','/api/devolucao-casos/:id/aviso-ml',{}, 2, { id:rv2 });
  eq('com a revisão respondida e o "Já revisei", ainda espera a baixa', caso(rv2).encerrado_em, null);
  chamar('POST','/api/devolucao/baixa',{ id:caso(rv2).devolucao_id, reputacao:'nao' }, 3);
  eq('   e a baixa encerra', caso(rv2).saida, 'revisado_ml');
  rp = respRev(rv2, { resultado:'devolveu' });
  eq('o valor devolvido depois, pelo "Salvar valores"', chamar('POST','/api/devolucao-casos/:id/valor',{ valor_revisao:'10' }, 1, { id:rv2 }).status, 200);
  eq('   gravado mesmo com o caso encerrado', caso(rv2).valor_revisao, 10);

  secao('revisão do frete — o relatório do mês');
  const relRv = chamar('GET','/api/devolucao-casos/relatorio',null,1,{},{ mes:dia(0).slice(0,7) }).body.dinheiro;
  const somaRv = db.prepare("SELECT SUM(valor_revisao) s FROM devolucao_caso WHERE teste=0 AND substr(criado_em,1,7)=?").get(dia(0).slice(0,7)).s;
  eq('soma o frete devolvido na revisão', relRv.frete_devolvido, Math.round(somaRv * 100) / 100);
  eq('e o prejuízo é o cobrado menos o devolvido', relRv.frete_prejuizo, Math.round((relRv.custo_etiqueta - relRv.frete_devolvido) * 100) / 100);

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

  /* ═══════ OS DOIS PRAZOS DO ML (AJUSTE de 03/11/2026, dono) ═══════
     No "nós coletamos" o ML dá dois prazos: mandar o comprovante do
     agendamento (o prazo que já existia) e coletar até 20 dias corridos
     depois da abertura da reclamação. A lista mostra o PRÓXIMO aberto. */
  const lanP = (corpo, quem) => chamar('POST','/api/devolucao-casos', Object.assign({ tipo:'coleta', prazo:dia(6), publicidade:false }, corpo), quem || 3);
  const detP = (id, quem) => chamar('GET','/api/devolucao-casos/:id',null,quem || 3,{ id }).body;

  secao('dois prazos — o da coleta nasce da abertura da reclamação');
  rp = lanP({ venda:'8810001' });
  eq('sem a data da abertura: lança', rp.status, 200);
  let pz = caso(rp.body.id);
  eq('   a reclamação foi aberta hoje', pz.aberta_em, dia(0));
  eq('   e o prazo da coleta é 20 dias corridos depois', pz.prazo_coleta, dia(20));
  eq('   o prazo do comprovante é o informado', pz.prazo, dia(6));
  rp = lanP({ venda:'8810002', aberta_em:dia(-5) });
  eq('com a abertura informada, o prazo da coleta conta dela', caso(rp.body.id).prazo_coleta, dia(15));
  eq('abertura impossível: recusada', lanP({ venda:'8810003', aberta_em:'2026-02-31' }).status, 400);
  eq('abertura no futuro: recusada', lanP({ venda:'8810003', aberta_em:dia(2) }).status, 400);
  db.prepare("UPDATE config SET valor='10' WHERE chave='devol_coleta_dias'").run();
  rp = lanP({ venda:'8810004' });
  eq('os 20 dias são do config (devol_coleta_dias)', caso(rp.body.id).prazo_coleta, dia(10));
  db.prepare("UPDATE config SET valor='20' WHERE chave='devol_coleta_dias'").run();
  eq('   e o padrão gravado é 20', db.prepare("SELECT valor FROM config WHERE chave='devol_coleta_dias'").get().valor, '20');
  rp = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'8810005', publicidade:false }, 3);
  eq('o "ML devolve" não tem prazo da coleta', String(caso(rp.body.id).prazo_coleta), 'null');

  secao('dois prazos — a cor e a lista vão pelo próximo prazo aberto');
  const pzA = lanP({ venda:'8810010', prazo:dia(3), aberta_em:dia(-19) }).body.id;   // coleta vence amanhã
  let sp = detP(pzA).caso;
  eq('o próximo prazo é o mais perto dos abertos: o da coleta', sp.prazo_qual, 'coleta');
  eq('   faltando 1 dia', sp.dias_prazo, 1);
  eq('   e a cor vem dele', sp.cor, 'vermelho');
  eq('   o caso mostra os dois prazos', (sp.prazos || []).map(x => x.qual).join(','), 'comprovante,coleta');
  const pzB = lanP({ venda:'8810011', prazo:dia(2) }).body.id;
  sp = detP(pzB).caso;
  eq('com o comprovante mais perto, o próximo é o do comprovante', sp.prazo_qual + '/' + sp.dias_prazo, 'comprovante/2');
  ok('   e o nome do prazo vai junto', /comprovante/i.test(sp.prazo_nome || ''), sp.prazo_nome);
  db.prepare("UPDATE devolucao_caso SET etapa='docs_enviados' WHERE id=?").run(pzB);
  sp = detP(pzB).caso;
  ok('com os documentos ao ML, o do comprovante está cumprido', (sp.prazos || []).find(x => x.qual === 'comprovante').feito === true, JSON.stringify(sp.prazos));
  eq('   e o próximo passa a ser o da coleta', sp.prazo_qual + '/' + sp.dias_prazo, 'coleta/20');
  db.prepare("UPDATE devolucao_caso SET etapa='a_caminho' WHERE id=?").run(pzB);
  sp = detP(pzB).caso;
  ok('coletado: os dois cumpridos', (sp.prazos || []).every(x => x.feito), JSON.stringify(sp.prazos));
  eq('   e não há prazo correndo, nem cor', JSON.stringify([sp.prazo_qual, sp.dias_prazo, sp.cor]), '[null,null,""]');
  const pzC = lanP({ venda:'8810013', prazo:dia(2) }).body.id;
  const ord2 = lista(3).coleta.map(c => c.id);
  ok('na lista, a coleta que vence amanhã vem antes do comprovante em 2 dias', ord2.indexOf(pzA) < ord2.indexOf(pzC), JSON.stringify(ord2));
  ok('   e o coletado vai ao fim', ord2.indexOf(pzB) > ord2.indexOf(pzC));
  const pzV = lanP({ venda:'8810014', prazo:dia(5), aberta_em:dia(-25) }).body.id;
  sp = detP(pzV).caso;
  eq('coleta vencida: vencido', sp.cor + '/' + sp.prazo_qual, 'vencido/coleta');
  lista(3); detP(pzV);
  eq('   e não encerra sozinho (R7)', caso(pzV).encerrado_em, null);

  secao('dois prazos — o caso antigo, sem a abertura, só tem o do comprovante');
  db.prepare('UPDATE devolucao_caso SET aberta_em=NULL, prazo_coleta=NULL WHERE id=?').run(pzC);
  sp = detP(pzC).caso;
  eq('um prazo só', (sp.prazos || []).length, 1);
  eq('   o do comprovante', sp.prazo_qual + '/' + sp.dias_prazo, 'comprovante/2');

  secao('dois prazos — o prazo novo e a prorrogação valem para o prazo aberto');
  rp = chamar('POST','/api/devolucao-casos/:id/prorrogacao',{}, 2, { id:pzA });
  eq('pedir prorrogação', rp.status, 200);
  let evp = eventos(pzA).filter(e => e.tipo === 'prorrogacao_pedida').pop();
  ok('   a história diz qual prazo', /coleta/.test(evp.texto) && evp.de === dia(1), JSON.stringify(evp));
  rp = chamar('POST','/api/devolucao-casos/:id/prazo',{ prazo:dia(8) }, 2, { id:pzA });
  eq('o prazo novo (o ML aceitou)', rp.status, 200);
  pz = caso(pzA);
  eq('   mudou o prazo da coleta', pz.prazo_coleta, dia(8));
  eq('   guardou o original', pz.prazo_coleta_original, dia(1));
  eq('   e não mexeu no do comprovante', pz.prazo, dia(3));
  chamar('POST','/api/devolucao-casos/:id/prazo',{ prazo:dia(9) }, 2, { id:pzA });
  eq('o segundo prazo novo não sobrescreve o original (R6)', caso(pzA).prazo_coleta_original, dia(1));
  rp = chamar('POST','/api/devolucao-casos/:id/prazo',{ prazo:dia(4), qual:'comprovante' }, 2, { id:pzA });
  eq('dá para dizer qual prazo mudou', rp.status + '/' + caso(pzA).prazo, '200/' + dia(4));
  eq('   e o original do comprovante fica guardado', caso(pzA).prazo_original, dia(3));
  eq('prazo desconhecido: recusado', chamar('POST','/api/devolucao-casos/:id/prazo',{ prazo:dia(4), qual:'outro' }, 2, { id:pzA }).status, 400);
  ok('a história do prazo novo diz qual', eventos(pzA).filter(e => e.tipo === 'prazo').some(e => /coleta/.test(e.texto)) &&
     eventos(pzA).filter(e => e.tipo === 'prazo').some(e => /comprovante/.test(e.texto)));

  secao('dois prazos — corrigir a data da abertura');
  const pzE = lanP({ venda:'8810020' }).body.id;
  rp = chamar('POST','/api/devolucao-casos/:id/editar',{ aberta_em:dia(-4) }, 3, { id:pzE });
  eq('editar a abertura', rp.status, 200);
  eq('   recalcula o prazo da coleta', caso(pzE).prazo_coleta, dia(16));
  ok('   e vai para a história', eventos(pzE).some(e => e.tipo === 'editado' && /aberta em/.test(e.texto)), JSON.stringify(eventos(pzE).map(e=>e.texto)));
  eq('abertura impossível na edição: recusada', chamar('POST','/api/devolucao-casos/:id/editar',{ aberta_em:'31/02' }, 3, { id:pzE }).status, 400);
  chamar('POST','/api/devolucao-casos/:id/prazo',{ prazo:dia(30), qual:'coleta' }, 2, { id:pzE });
  chamar('POST','/api/devolucao-casos/:id/editar',{ aberta_em:dia(-6) }, 3, { id:pzE });
  eq('com prazo novo do ML lançado, corrigir a abertura não o desfaz', caso(pzE).prazo_coleta, dia(30));

  secao('dois prazos — trocar para "nós coletamos" ganha o prazo da coleta');
  const pzT = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'8810030', publicidade:false }, 3).body.id;
  rp = chamar('POST','/api/devolucao-casos/:id/tipo',{ para:'coleta', prazo:dia(5), aberta_em:dia(-2) }, 3, { id:pzT });
  eq('troca', rp.status, 200);
  eq('   com a abertura informada', caso(pzT).aberta_em + '/' + caso(pzT).prazo_coleta, dia(-2) + '/' + dia(18));
  const pzT2 = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'8810031', publicidade:false }, 3).body.id;
  chamar('POST','/api/devolucao-casos/:id/tipo',{ para:'coleta', prazo:dia(5) }, 3, { id:pzT2 });
  eq('   sem ela, a abertura é o dia do lançamento', caso(pzT2).aberta_em, String(caso(pzT2).criado_em).slice(0,10));

  secao('a data agendada da coleta — avisa, não trava');
  const tP = chamar('POST','/api/devolucao-casos/transportadoras',{ nome:'Prazo Teste' }, 2).body.id;
  const pzG = lanP({ venda:'8810040' }).body.id;                 // coleta até dia(20)
  rp = chamar('POST','/api/devolucao-casos/:id/coleta',{ transportadora_id:tP, agendada_para:dia(25) }, 2, { id:pzG });
  eq('agendada depois do prazo da coleta: passa', rp.status, 200);
  let tg = detP(pzG).tentativas[0];
  eq('   a data gravada', tg.agendada_para, dia(25));
  ok('   e a tentativa avisa', /depois do prazo da coleta/.test(tg.aviso_agenda || ''), JSON.stringify(tg));
  rp = chamar('POST','/api/devolucao-casos/:id/coleta-agenda',{ tentativa_id:tg.id, agendada_para:dia(12) }, 2, { id:pzG });
  eq('remarcar a data agendada', rp.status, 200);
  tg = detP(pzG).tentativas[0];
  ok('   dentro do prazo: sem aviso', tg.agendada_para === dia(12) && !tg.aviso_agenda, JSON.stringify(tg));
  ok('   e vai para a história', eventos(pzG).some(e => /agendada/.test(e.texto || '')));
  eq('data impossível: recusada', chamar('POST','/api/devolucao-casos/:id/coleta-agenda',{ tentativa_id:tg.id, agendada_para:'2026-13-01' }, 2, { id:pzG }).status, 400);
  eq('tentativa de outro caso: 404', chamar('POST','/api/devolucao-casos/:id/coleta-agenda',{ tentativa_id:tg.id, agendada_para:dia(3) }, 2, { id:pzA }).status, 404);
  eq('no lançamento também', lanP({ venda:'8810041', coleta:{ transportadora_id:tP, agendada_para:dia(4) } }).status, 200);
  eq('   gravada na 1ª tentativa', db.prepare("SELECT k.agendada_para d FROM devolucao_coleta k JOIN devolucao_caso c ON c.id=k.caso_id WHERE c.venda='8810041'").get().d, dia(4));

  secao('o limite do frete do ML — avisa, não trava');
  rp = lanP({ venda:'8810050', limite_frete:'174,87', coleta:{ transportadora_id:tP, custo:'200' } });
  eq('lança com o limite e um custo acima dele', rp.status, 200);
  const pzL = rp.body.id;
  eq('   o limite gravado', caso(pzL).limite_frete, 174.87);
  tg = detP(pzL).tentativas[0];
  ok('   a tentativa avisa que passou do limite', /limite do frete/.test(tg.aviso_limite || ''), JSON.stringify(tg));
  const tgId = tg.id;
  eq('baixar o custo pelo "Salvar valores" (quem acompanha)', valor(pzL, { tentativa_id:tgId, custo:'150' }, 2).status, 200);
  ok('   sem aviso', !detP(pzL).tentativas[0].aviso_limite);
  eq('   o custo igual ao limite não avisa', valor(pzL, { tentativa_id:tgId, custo:'174,87' }, 2).status + '/' + !!detP(pzL).tentativas[0].aviso_limite, '200/false');
  eq('corrigir o limite (quem acompanha)', valor(pzL, { limite_frete:'100' }, 2).status, 200);
  ok('   e o aviso volta', /limite do frete/.test(detP(pzL).tentativas[0].aviso_limite || ''));
  eq('limite impossível: recusado', valor(pzL, { limite_frete:'-1' }, 2).status, 400);
  ok('o limite não viaja a quem não lança nem acompanha', !chavesDe(detP(pzL, 4)).has('limite_frete') && !chavesDe(detP(pzL, 4)).has('aviso_limite'));
  ok('a história diz que o limite mudou, sem o número', eventos(pzL).some(e => /limite do frete/.test(e.texto || '')) && !eventos(pzL).some(e => /174|100[,.]/.test(e.texto || '')));
  eq('no "ML devolve" não há limite de frete', chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'8810051', publicidade:false, limite_frete:'50' }, 3).status, 400);

  /* ═══════ A REVISÃO QUE NÃO ACHOU O CASO (CONSERTO de 03/11/2026, NF 8207) ═══════
     O Edvaldo bipou a etiqueta de DEVOLUÇÃO do ML (48323653161): ela não é venda,
     pack nem NF, e o caso ficou solto. Agora o caso se acha pelo SKU, e a revisão
     solta se liga pela tela do caso ou pela Baixa. */
  secao('revisão solta — as devoluções esperadas pelo SKU');
  db.prepare("INSERT OR IGNORE INTO skus (codigo,estoque) VALUES ('BK150150BRANCO',0)").run();
  const sx = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571773263', nf:'8207', sku:'BK150150BRANCO', comprador:'Maria Consuelo Bermudez', publicidade:true }, 3).body.id;
  chamar('POST','/api/devolucao-casos/:id/chegou',{}, 2, { id:sx });
  let esp = chamar('GET','/api/devolucao/esperadas',null,4,{},{ sku:'BK150150BRANCO' });
  eq('quem registra a peça vê os casos esperados do SKU', esp.status, 200);
  ok('   o caso #' + sx + ' está lá', (esp.body.casos || []).some(c => c.id === sx), JSON.stringify(esp.body));
  ok('   com NF e comprador, para o Edvaldo reconhecer', (esp.body.casos || []).some(c => c.id === sx && c.nf === '8207' && /Consuelo/.test(c.comprador)));
  ok('   e sem nenhum valor em reais', !DINHEIRO_CHAVES.some(k => chavesDe(esp.body).has(k)));
  eq('SKU de outro produto não traz o caso', (chamar('GET','/api/devolucao/esperadas',null,4,{},{ sku:'BK140140BEGE' }).body.casos || []).some(c => c.id === sx), false);
  eq('sem SKU: recusado', chamar('GET','/api/devolucao/esperadas',null,4,{},{}).status, 400);

  secao('revisão solta — o bipe da etiqueta de devolução não acha, e o toque na lista liga');
  r = chamar('POST','/api/devolucao',{ codigo_ml:'48323653161', sku_fisico:'BK150150BRANCO', destinacao:'reembalar', caso_id:sx }, 4);
  eq('salvando com o caso escolhido na lista, liga', r.body.caso_id, sx);
  eq('   e o caso fica revisado', caso(sx).etapa, 'revisado');
  eq('o caso revisado sai da lista de esperados', (chamar('GET','/api/devolucao/esperadas',null,4,{},{ sku:'BK150150BRANCO' }).body.casos || []).some(c => c.id === sx), false);

  secao('revisão solta — ligar depois, pela tela do caso');
  const sy = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571779999', nf:'8208', sku:'BK150150BRANCO', publicidade:false }, 3).body.id;
  const solta = chamar('POST','/api/devolucao',{ codigo_ml:'48323650000', sku_fisico:'BK150150BRANCO', destinacao:'reembalar' }, 4).body.id;
  eq('a revisão pela etiqueta de devolução fica solta', caso(sy).devolucao_id, null);
  let rs = chamar('GET','/api/devolucao-casos/:id/revisoes-soltas',null,2,{ id:sy });
  eq('o caso lista as revisões sem caso', rs.status, 200);
  ok('   a do mesmo SKU vem, marcada', (rs.body.revisoes || []).some(d => d.id === solta && d.mesmo_sku === true), JSON.stringify(rs.body));
  ok('   e a que já tem caso não vem', !(rs.body.revisoes || []).some(d => d.id === caso(sx).devolucao_id));
  r = chamar('POST','/api/devolucao-casos/:id/ligar',{ devolucao_id:solta }, 2, { id:sy });
  eq('"Ligar a este caso"', r.status, 200);
  eq('   ligou', caso(sy).devolucao_id, solta);
  eq('   revisado', caso(sy).etapa, 'revisado');
  ok('   com chegada', !!caso(sy).chegou_em);
  ok('   e a história diz que foi ligada à mão', eventos(sy).some(e => e.tipo === 'revisado' && /ligad/.test(e.texto || '')), JSON.stringify(eventos(sy).map(e=>e.texto)));
  eq('ligar de novo: recusado', chamar('POST','/api/devolucao-casos/:id/ligar',{ devolucao_id:solta }, 2, { id:sy }).status, 409);
  eq('a mesma revisão em outro caso: recusado', chamar('POST','/api/devolucao-casos/:id/ligar',{ devolucao_id:solta }, 2, { id:lanP({ venda:'8810090' }).body.id }).status, 409);
  eq('revisão que não existe: 404', chamar('POST','/api/devolucao-casos/:id/ligar',{ devolucao_id:999999 }, 2, { id:lanP({ venda:'8810091' }).body.id }).status, 404);

  secao('revisão solta — SKU diferente pede confirmação, e a confirmação vira evidência');
  const sz = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571778888', sku:'BK160160BRANCO', publicidade:false }, 3).body.id;
  const outra = chamar('POST','/api/devolucao',{ codigo_ml:'48323651111', sku_fisico:'BK140140BEGE', destinacao:'estoque' }, 4).body.id;
  r = chamar('POST','/api/devolucao-casos/:id/ligar',{ devolucao_id:outra }, 2, { id:sz });
  eq('SKU recebido diferente do vendido: pede confirmação (409)', r.status + '/' + (r.body.sku_diferente === true), '409/true');
  eq('   e nada foi ligado', caso(sz).devolucao_id, null);
  r = chamar('POST','/api/devolucao-casos/:id/ligar',{ devolucao_id:outra, confirmar:true }, 2, { id:sz });
  eq('confirmando, liga', r.status + '/' + caso(sz).devolucao_id, '200/' + outra);
  ok('   e a história registra a divergência', eventos(sz).some(e => /diferente/.test(e.texto || '') && /BK140140BEGE/.test(e.texto || '')), JSON.stringify(eventos(sz).map(e=>e.texto)));

  secao('revisão solta — ligar pela Baixa');
  const sb = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571777777', sku:'BK160140BEGE', publicidade:false }, 3).body.id;
  const soltaB = chamar('POST','/api/devolucao',{ codigo_ml:'48323652222', sku_fisico:'BK160140BEGE', destinacao:'estoque' }, 4).body.id;
  const pendB = chamar('GET','/api/devolucao/pendentes',null,3).body.find(d => d.id === soltaB);
  ok('a Baixa sabe que a revisão está sem caso', pendB && !pendB.caso_id, JSON.stringify(pendB));
  r = chamar('POST','/api/devolucao/ligar-caso',{ devolucao_id:soltaB, caso_id:sb }, 3);
  eq('ligar pela Baixa (quem dá baixa)', r.status, 200);
  eq('   ligou', caso(sb).devolucao_id, soltaB);
  eq('   e a Baixa passa a mostrar o caso', (chamar('GET','/api/devolucao/pendentes',null,3).body.find(d => d.id === soltaB) || {}).caso_id, sb);
  eq('quem só registra não liga pela Baixa', chamar('POST','/api/devolucao/ligar-caso',{ devolucao_id:soltaB, caso_id:sb }, 4).status, 403);

  secao('revisão solta — ligada depois da baixa, o "ML devolve" segue a regra');
  const sl = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571776666', sku:'BK140140BEGE', publicidade:false }, 3).body.id;
  const soltaL = chamar('POST','/api/devolucao',{ codigo_ml:'48323653333', sku_fisico:'BK140140BEGE', destinacao:'estoque' }, 4).body.id;
  chamar('POST','/api/devolucao/baixa',{ id:soltaL, reputacao:'nao', motivo:'Comprador se arrependeu' }, 3);
  chamar('POST','/api/devolucao-casos/:id/ligar',{ devolucao_id:soltaL }, 2, { id:sl });
  eq('ligada já baixada: falta só o "Já revisei"', caso(sl).encerrado_em + '/' + (daLista(lista(2).ml, sl) || {}).falta_revisei, 'null/true');
  chamar('POST','/api/devolucao-casos/:id/aviso-ml',{}, 2, { id:sl });
  eq('   e com ele encerra', caso(sl).saida, 'revisado_ml');

  secao('"Já revisei no ML" — só depois da revisão, e uma vez');
  const ja = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571775555', sku:'BK140140BEGE', publicidade:false }, 3).body.id;
  chamar('POST','/api/devolucao-casos/:id/chegou',{}, 2, { id:ja });
  eq('antes da revisão do Edvaldo: recusado', chamar('POST','/api/devolucao-casos/:id/aviso-ml',{}, 2, { id:ja }).status, 400);
  chamar('POST','/api/devolucao',{ codigo_ml:'2000015571775555', sku_fisico:'BK140140BEGE', destinacao:'estoque' }, 4);
  eq('revisado: a lista diz que falta o "Já revisei"', (daLista(lista(2).ml, ja) || {}).falta_revisei, true);
  eq('marcar', chamar('POST','/api/devolucao-casos/:id/aviso-ml',{}, 2, { id:ja }).status, 200);
  eq('   a etapa vai a "Já revisei no ML"', caso(ja).etapa, 'ml_revisei');
  eq('   e não falta mais', (daLista(lista(2).ml, ja) || {}).falta_revisei, false);
  eq('marcar de novo: recusado', chamar('POST','/api/devolucao-casos/:id/aviso-ml',{}, 2, { id:ja }).status, 409);
  eq('   ainda aberto, esperando a baixa', caso(ja).encerrado_em, null);

  secao('"revisar no ML até" — o prazo do ML devolve');
  const pr = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571774444', sku:'BK140140BEGE', publicidade:false }, 3).body.id;
  r = chamar('POST','/api/devolucao-casos/:id/chegou',{ revisar_ate:dia(1) }, 2, { id:pr });
  eq('a chegada já pode trazer o prazo', r.status + '/' + caso(pr).revisar_ate, '200/' + dia(1));
  let lp = daLista(lista(2).ml, pr);
  eq('o prazo dá a cor (falta 1 dia: vermelho)', lp.cor + '/' + lp.dias_prazo, 'vermelho/1');
  eq('   e diz qual prazo', lp.prazo_qual, 'revisar');
  eq('editar o prazo', chamar('POST','/api/devolucao-casos/:id/editar',{ revisar_ate:dia(5) }, 3, { id:pr }).status + '/' + caso(pr).revisar_ate, '200/' + dia(5));
  eq('data impossível: recusada', chamar('POST','/api/devolucao-casos/:id/editar',{ revisar_ate:'2026-02-30' }, 3, { id:pr }).status, 400);
  const prs = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571773333', publicidade:false }, 3).body.id;
  eq('ML devolve sem o prazo: sem cor, como antes', (daLista(lista(2).ml, prs) || {}).cor, '');
  const ordML = lista(2).ml.map(c => c.id);
  ok('na lista, o ML devolve com prazo vem antes do sem prazo', ordML.indexOf(pr) < ordML.indexOf(prs), JSON.stringify(ordML));
  chamar('POST','/api/devolucao',{ codigo_ml:'2000015571774444', sku_fisico:'BK140140BEGE', destinacao:'estoque' }, 4);
  chamar('POST','/api/devolucao-casos/:id/aviso-ml',{}, 2, { id:pr });
  lp = daLista(lista(2).ml, pr);
  eq('com o "Já revisei", o prazo está cumprido: sem cor', lp.cor + '/' + lp.dias_prazo, '/null');

  secao('a revisão no ML pede o valor E/OU a reputação, e não fecha sem resposta');
  const rq = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571772222', sku:'BK140140BEGE', publicidade:false }, 3).body.id;
  chamar('POST','/api/devolucao-casos/:id/chegou',{}, 2, { id:rq });
  eq('pedido sem dizer o que se pede: recusado', pedeRev(rq, { pede:'' }).status, 400);
  eq('pedido impossível: recusado', pedeRev(rq, { pede:'tudo' }).status, 400);
  eq('pedir o valor e a reputação', pedeRev(rq, { pede:'ambos', numero:'SR-1' }).status, 200);
  eq('   gravado', caso(rq).revisao_pede, 'ambos');
  ok('   e a história diz o que se pediu', eventos(rq).some(e => /valor/.test(e.texto || '') && /reputa/.test(e.texto || '')), JSON.stringify(eventos(rq).map(e=>e.texto)));
  chamar('POST','/api/devolucao',{ codigo_ml:'2000015571772222', sku_fisico:'BK140140BEGE', destinacao:'estoque' }, 4);
  chamar('POST','/api/devolucao/baixa',{ id:caso(rq).devolucao_id, reputacao:'sim' }, 3);
  chamar('POST','/api/devolucao-casos/:id/aviso-ml',{}, 2, { id:rq });
  eq('baixa e "Já revisei" feitos, revisão sem resposta: NÃO fecha', caso(rq).encerrado_em, null);
  eq('a resposta "atendeu"', respRev(rq, { resultado:'devolveu' }).status, 200);
  eq('   e aí fecha', caso(rq).saida, 'revisado_ml');
  const rq2 = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571771111', sku:'BK140140BEGE', publicidade:false }, 3).body.id;
  chamar('POST','/api/devolucao-casos/:id/chegou',{}, 2, { id:rq2 });
  eq('pedir só a reputação', pedeRev(rq2, { pede:'reputacao' }).status, 200);
  eq('   sem pedido de valor, o valor devolvido é recusado', respRev(rq2, { resultado:'devolveu', valor_revisao:'10' }).status, 400);
  eq('o pedido antigo, sem dizer o que pede, ainda responde (casos de antes)', (function(){
    const v = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571770000', publicidade:false }, 3).body.id;
    chamar('POST','/api/devolucao-casos/:id/chegou',{}, 2, { id:v });
    db.prepare("UPDATE devolucao_caso SET revisao_pedida_em=datetime('now','localtime') WHERE id=?").run(v);
    return respRev(v, { resultado:'negou' }).status; })(), 200);

  /* ═══════ O CASO #20 DE NOVO (03/11/2026): parado em "Já revisei" sem dizer
     que faltava a BAIXA; e a etiqueta de devolução só traz o Pack ID impresso. ═══════ */
  secao('o caso diz o que falta para encerrar');
  const f1 = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571700001', sku:'BK150150BRANCO', publicidade:false }, 3).body.id;
  eq('antes da revisão: não falta nada para encerrar (espera a peça)', JSON.stringify((daLista(lista(2).ml, f1) || {}).falta), '[]');
  const rf1 = chamar('POST','/api/devolucao',{ codigo_ml:'2000015571700001', sku_fisico:'BK150150BRANCO', destinacao:'estoque' }, 4).body.id;
  let lf = daLista(lista(2).ml, f1);
  ok('revisada: falta a baixa e o "Já revisei"', JSON.stringify(lf.falta) === JSON.stringify(['dar a baixa','marcar "Já revisei" no ML']), JSON.stringify(lf.falta));
  chamar('POST','/api/devolucao-casos/:id/aviso-ml',{}, 2, { id:f1 });
  lf = daLista(lista(2).ml, f1);
  eq('com o "Já revisei": falta só a baixa (o caso #20)', JSON.stringify(lf.falta), JSON.stringify(['dar a baixa']));
  eq('   e o caso mostra o mesmo', JSON.stringify(chamar('GET','/api/devolucao-casos/:id',null,2,{ id:f1 }).body.caso.falta), JSON.stringify(['dar a baixa']));
  pedeRev(f1, { pede:'valor' });
  eq('com revisão no ML pedida: falta também a resposta', JSON.stringify(daLista(lista(2).ml, f1).falta), JSON.stringify(['dar a baixa','resposta da revisão no ML']));
  respRev(f1, { resultado:'negou' });

  secao('a baixa dentro do caso');
  eq('o caso diz se a pessoa dá baixa', lista(3).pode.baixar + '/' + lista(2).pode.baixar, 'true/false');
  eq('o caso traz a revisão ligada sem baixa', chamar('GET','/api/devolucao-casos/:id',null,3,{ id:f1 }).body.caso.dev_baixado, 0);
  r = chamar('POST','/api/devolucao/baixa',{ id:rf1, reputacao:'nao' }, 3);
  eq('a baixa (a mesma rota da aba Baixa), sem motivo escolhido', r.status, 200);
  eq('   encerra o ML devolve que só esperava por ela', caso(f1).saida, 'revisado_ml');
  eq('   e a devolução ficou com baixa', db.prepare('SELECT baixado FROM devolucao WHERE id=?').get(rf1).baixado, 1);

  secao('o número bipado da etiqueta de devolução fica no caso');
  const g1 = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571711111', sku:'BK150150BRANCO', publicidade:false }, 3).body.id;
  chamar('POST','/api/devolucao',{ codigo_ml:'48323699991', sku_fisico:'BK150150BRANCO', destinacao:'estoque', caso_id:g1 }, 4);
  eq('ligado pelo toque: o número bipado vai para o caso', caso(g1).etiqueta_devolucao, '48323699991');
  const g2 = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571722222', sku:'BK150150BRANCO', publicidade:false }, 3).body.id;
  const sg2 = chamar('POST','/api/devolucao',{ codigo_ml:'48323699992', sku_fisico:'BK150150BRANCO', destinacao:'estoque' }, 4).body.id;
  chamar('POST','/api/devolucao-casos/:id/ligar',{ devolucao_id:sg2 }, 2, { id:g2 });
  eq('ligado pelo "Ligar": também', caso(g2).etiqueta_devolucao, '48323699992');
  const g3 = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571733333', sku:'BK150150BRANCO', publicidade:false }, 3).body.id;
  chamar('POST','/api/devolucao',{ codigo_ml:'2000015571733333', sku_fisico:'BK150150BRANCO', destinacao:'estoque' }, 4);
  eq('bipada a própria venda: não vira "etiqueta de devolução"', caso(g3).etiqueta_devolucao, null);
  ok('a busca acha pelo número da etiqueta de devolução', (chamar('GET','/api/devolucao-casos/buscar',null,2,{},{ q:'48323699992' }).body.casos || []).some(c => c.id === g2));
  ok('   e a história conta qual etiqueta foi bipada', eventos(g1).some(e => /48323699991/.test(e.texto || '')), JSON.stringify(eventos(g1).map(e=>e.texto)));
  const g4 = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571744444', sku:'BK140140BEGE', publicidade:false }, 3).body.id;
  db.prepare("UPDATE devolucao_caso SET etiqueta_devolucao='48323699994' WHERE id=?").run(g4);
  let bz = chamar('GET','/api/devolucao/buscar/:cod',null,4,{ cod:'48323699994' }).body;
  eq('o bipe acha o caso pelo número já gravado', (bz.caso || {}).id, g4);

  secao('o Edvaldo acha pelos últimos números do Pack ID impresso');
  const p1 = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571798765', pack_id:'2000099999912345', sku:'BK140140BEGE', publicidade:false }, 3).body.id;
  bz = chamar('GET','/api/devolucao/buscar/:cod',null,4,{ cod:'98765' }).body;
  eq('os 5 últimos da venda acham o caso', (bz.caso || {}).id, p1);
  eq('os últimos do pack também', ((chamar('GET','/api/devolucao/buscar/:cod',null,4,{ cod:'912345' }).body).caso || {}).id, p1);
  eq('4 números não bastam (podem ser NF)', ((chamar('GET','/api/devolucao/buscar/:cod',null,4,{ cod:'8765' }).body).caso || {}).id, undefined);
  const p2 = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571898765', sku:'BK140140BEGE', publicidade:false }, 3).body.id;
  bz = chamar('GET','/api/devolucao/buscar/:cod',null,4,{ cod:'98765' }).body;
  eq('dois casos com os mesmos finais: nenhum é escolhido sozinho', bz.caso, undefined);
  ok('   e os dois vêm para ele tocar no certo', (bz.casos || []).map(c => c.id).sort().join(',') === [p1, p2].sort().join(','), JSON.stringify(bz));
  eq('   a resposta sem caso continua com as duas chaves de sempre quando nada bate', Object.keys(chamar('GET','/api/devolucao/buscar/:cod',null,4,{ cod:'9087601' }).body).sort().join(','), 'achou,venda');
  eq('o código de 11 números da etiqueta não vira "últimos números"', ((chamar('GET','/api/devolucao/buscar/:cod',null,4,{ cod:'15571798765' }).body).caso || {}).id, undefined);
  r = chamar('POST','/api/devolucao',{ codigo_ml:'98765', sku_fisico:'BK140140BEGE', destinacao:'estoque', caso_id:p1 }, 4);
  eq('salvar com o caso tocado liga', caso(p1).devolucao_id, r.body.id);
  eq('   e os finais digitados não viram "etiqueta de devolução"', caso(p1).etiqueta_devolucao, null);
  ok('a lista de esperadas traz venda e pack, para comparar com a etiqueta', (chamar('GET','/api/devolucao/esperadas',null,4,{},{ sku:'BK140140BEGE' }).body.casos || []).some(c => c.id === p2 && c.venda === '2000015571898765' && 'pack_id' in c));

  secao('desligar a revisão errada — três 150×150 cinza, ligada a peça de outro cliente');
  const dw = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571700001', nf:'8301', sku:'BK150150CINZA', comprador:'Cliente Certo', motivo:'Comprador se arrependeu', publicidade:false }, 3).body.id;
  db.prepare("INSERT OR IGNORE INTO skus (codigo,estoque) VALUES ('BK150150CINZA',0)").run();
  const pecaErrada = chamar('POST','/api/devolucao',{ codigo_ml:'48323600001', sku_fisico:'BK150150CINZA', destinacao:'estoque', tecido:'ok', obs:'risco no tecido' }, 4).body.id;
  const pecaCerta  = chamar('POST','/api/devolucao',{ codigo_ml:'48323600002', sku_fisico:'BK150150CINZA', destinacao:'reembalar', tecido:'ok' }, 4).body.id;
  rs = chamar('GET','/api/devolucao-casos/:id/revisoes-soltas',null,2,{ id:dw });
  const rsE = (rs.body.revisoes || []).find(d => d.id === pecaErrada) || {};
  ok('a lista de revisões soltas traz a triagem e a observação, para separar as iguais', rsE.tecido === 'ok' && rsE.obs === 'risco no tecido' && 'embalagem' in rsE && 'kit' in rsE, JSON.stringify(rsE));
  chamar('POST','/api/devolucao-casos/:id/ligar',{ devolucao_id:pecaErrada }, 2, { id:dw });
  chamar('POST','/api/devolucao/baixa',{ id:pecaErrada, reputacao:'sim', motivo:'Comprador se arrependeu' }, 3);
  /* quem deu a baixa (fase 1 da ACESSO-POR-TELA-E-NIVEL): o caso mostra o nome */
  const detBx = chamar("GET","/api/devolucao-casos/:id",null,2,{ id:dw }).body;
  const cBx = detBx.caso || detBx;
  ok('o caso mostra quem deu a baixa e quando', !!cBx.dev_baixado_em && !!cBx.dev_baixado_por, JSON.stringify({ em:cBx.dev_baixado_em, por:cBx.dev_baixado_por }));
  chamar('POST','/api/devolucao-casos/:id/aviso-ml',{}, 2, { id:dw });
  eq('ligada, baixada e "Já revisei": o caso encerrou', caso(dw).saida, 'revisado_ml');
  eq('   e a etiqueta da peça errada foi gravada no caso', caso(dw).etiqueta_devolucao, '48323600001');
  const detW = chamar("GET","/api/devolucao-casos/:id",null,2,{ id:dw }).body;
  ok('o caso mostra a revisão ligada, com a etiqueta bipada e a triagem', detW.revisao && detW.revisao.id === pecaErrada && detW.revisao.codigo_ml === '48323600001' && detW.revisao.obs === 'risco no tecido', JSON.stringify(detW.revisao));
  ok('   e sem nenhum valor em reais', detW.revisao && !Object.keys(detW.revisao).some(k => /valor|custo|saldo/.test(k)));

  eq('desligar sem motivo: recusado (400)', chamar('POST','/api/devolucao-casos/:id/desligar-revisao',{}, 2, { id:dw }).status, 400);
  eq('   motivo só de espaços também', chamar('POST','/api/devolucao-casos/:id/desligar-revisao',{ motivo:'   ' }, 2, { id:dw }).status, 400);
  eq('quem só lança não desliga (403)', chamar('POST','/api/devolucao-casos/:id/desligar-revisao',{ motivo:'x' }, 6, { id:dw }).status, 403);
  eq('   e nada mudou', caso(dw).devolucao_id + '/' + caso(dw).saida, pecaErrada + '/revisado_ml');
  r = chamar('POST','/api/devolucao-casos/:id/desligar-revisao',{ motivo:'a etiqueta 48323600001 é da venda de outro cliente' }, 2, { id:dw });
  eq('desligar com motivo (quem acompanha)', r.status, 200);
  const dwc = caso(dw);
  eq('   o caso fica sem revisão', dwc.devolucao_id, null);
  eq('   volta para "Chegou"', dwc.etapa, 'chegou');
  ok('   com a data da chegada de antes', !!dwc.chegou_em);
  eq('   e REABRE (estava encerrado por esta peça)', (dwc.encerrado_em || null) + '/' + (dwc.saida || null) + '/' + (dwc.encerrado_por || null), 'null/null/null');
  eq('   a etiqueta da peça errada sai do caso', dwc.etiqueta_devolucao, null);
  const dErr = db.prepare('SELECT * FROM devolucao WHERE id=?').get(pecaErrada);
  eq('a baixa da peça errada é DESFEITA (decisão do dono)', dErr.baixado + '/' + dErr.baixado_em + '/' + dErr.reputacao + '/' + dErr.motivo, '0/null/null/null');
  eq('   e quem deu a baixa sai junto (fase 1 da ACESSO-POR-TELA-E-NIVEL)', dErr.baixado_por_id + '/' + dErr.baixado_por, 'null/null');
  eq('   e ela volta a ser revisão solta, pendente na Baixa', (chamar('GET','/api/devolucao/pendentes',null,3).body.find(d => d.id === pecaErrada) || {}).caso_id || null, null);
  ok('   ...e aparece na Baixa', chamar('GET','/api/devolucao/pendentes',null,3).body.some(d => d.id === pecaErrada));
  const evD = eventos(dw);
  ok('a história diz o que foi desligado, por quê e por quem', evD.some(e => e.tipo === 'desligado' && /#'?\d+/.test(e.texto || '') && /outro cliente/.test(e.texto || '') && /48323600001/.test(e.texto || '') && e.usuario === 'Renato'), JSON.stringify(evD.map(e => [e.tipo, e.texto, e.usuario])));
  ok('   diz que a baixa foi desfeita, com a reputação e o motivo que tinha', evD.some(e => /baixa/.test(e.texto || '') && /desfeita/.test(e.texto || '') && /sim/.test(e.texto || '') && /arrependeu/.test(e.texto || '')), JSON.stringify(evD.map(e => e.texto)));
  ok('   e avisa que o "Já revisei" tinha sido marcado com a peça desligada', evD.some(e => /Já revisei/.test(e.texto || '') && /de novo/.test(e.texto || '')), JSON.stringify(evD.map(e => e.texto)));
  eq('desligar de novo: o caso não tem revisão (409)', chamar('POST','/api/devolucao-casos/:id/desligar-revisao',{ motivo:'x' }, 2, { id:dw }).status, 409);
  eq('caso que não existe: 404', chamar('POST','/api/devolucao-casos/:id/desligar-revisao',{ motivo:'x' }, 2, { id:999999 }).status, 404);
  eq('a lista de abertos volta a ter o caso', !!daLista(lista(2).ml, dw), true);

  r = chamar('POST','/api/devolucao-casos/:id/ligar',{ devolucao_id:pecaCerta }, 2, { id:dw });
  eq('liga a peça certa', r.status + '/' + caso(dw).devolucao_id, '200/' + pecaCerta);
  eq('   com a etiqueta certa no caso', caso(dw).etiqueta_devolucao, '48323600002');
  chamar('POST','/api/devolucao/baixa',{ id:pecaCerta, reputacao:'nao', motivo:'Comprador se arrependeu' }, 3);
  eq('   baixa sem o "Já revisei" de novo: ainda aberto', caso(dw).encerrado_em, null);
  chamar('POST','/api/devolucao-casos/:id/aviso-ml',{}, 2, { id:dw });
  eq('   "Já revisei" de novo: encerra', caso(dw).saida, 'revisado_ml');
  const dErr2 = db.prepare('SELECT baixado FROM devolucao WHERE id=?').get(pecaErrada);
  eq('a peça errada continua solta e sem baixa, esperando o caso dela', dErr2.baixado, 0);

  secao('desligar — o que não se desfaz por aqui');
  const dn = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'2000015571700002', sku:'BK150150CINZA', prazo:dia(5), publicidade:false }, 3).body.id;
  const pn = chamar('POST','/api/devolucao',{ codigo_ml:'2000015571700002', sku_fisico:'BK150150CINZA', destinacao:'estoque' }, 4).body.id;
  eq('o "nós coletamos" ligado pelo bipe', caso(dn).devolucao_id, pn);
  r = chamar('POST','/api/devolucao-casos/:id/desligar-revisao',{ motivo:'peça trocada' }, 2, { id:dn });
  eq('aberto, ele desliga também', r.status + '/' + caso(dn).etapa + '/' + caso(dn).devolucao_id, '200/chegou/null');
  eq('   e a venda bipada NÃO vira etiqueta de devolução para apagar', caso(dn).etiqueta_devolucao, null);
  chamar('POST','/api/devolucao-casos/:id/ligar',{ devolucao_id:pn }, 2, { id:dn });
  chamar('POST','/api/devolucao-casos/:id/perda',{ valor_perdido:'10' }, 1, { id:dn });
  eq('encerrado como perda: recusado (409)', chamar('POST','/api/devolucao-casos/:id/desligar-revisao',{ motivo:'x' }, 1, { id:dn }).status, 409);
  eq('   e continua ligado e encerrado', caso(dn).devolucao_id + '/' + caso(dn).saida, pn + '/perda_prazo');
  const dzD = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571700003', sku:'BK150150CINZA', publicidade:false }, 3).body.id;
  chamar('POST','/api/devolucao',{ codigo_ml:'2000015571700003', sku_fisico:'BK150150CINZA', destinacao:'estoque' }, 4);
  chamar('POST','/api/devolucao-casos/:id/desligar-revisao',{ motivo:'trocada' }, 2, { id:dzD });
  eq('depois de desligar, o desfazer de etapa não volta a etapa de antes', chamar('GET','/api/devolucao-casos/:id',null,2,{ id:dzD }).body.desfazer, null);

  secao('esperadas: a cidade do comprador, para comparar com o remetente da etiqueta');
  db.prepare("INSERT OR IGNORE INTO skus (codigo,estoque) VALUES ('BK150150CINZA',0)").run();
  db.prepare("INSERT INTO lote (codigo,buyer,nf,venda,packId,city) VALUES ('BK150150CINZA','Maria Consuelo Bermudez','8901','2000015571700901',NULL,'Governador Celso Ramos, Santa Catarina')").run();
  const ec1 = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571700901', publicidade:false }, 3).body.id;
  const ec2 = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571700902', sku:'BK150150CINZA', comprador:'Fulano Sem Venda', publicidade:false }, 3).body.id;
  const espC = chamar('GET','/api/devolucao/esperadas',null,4,{},{ sku:'BK150150CINZA' }).body.casos || [];
  eq('o caso com venda no sistema traz a cidade da venda', (espC.find(c => c.id === ec1) || {}).cidade, 'Governador Celso Ramos, Santa Catarina');
  eq('   o caso sem venda no sistema vem sem cidade', (espC.find(c => c.id === ec2) || {}).cidade, null);
  ok('   e nenhum valor em reais viaja na lista', espC.every(c => !Object.keys(c).some(k => /valor|custo|saldo|limite/.test(k))), JSON.stringify(espC[0]));

  /* ═══ O PRÓXIMO PASSO (spec DEVOLUCOES-PROXIMO-PASSO, fase 1) ═══
     Uma linha do mapa (§3 da spec) por caso: monta o estado, confere a frase,
     a vez, o prazo e a ação. Escritos antes do código. */
  secao('próximo passo — o mapa do "nós coletamos" (C1 a C13)');
  {
    const DD = require('./devcaso_dominio');
    const H = dia(0), LIM = { ambar:3, vermelho:1, parado:2, coleta:20 };
    /* Os casos de mentira têm os valores em reais preenchidos: se alguém um
       dia puser o número na frase, a varredura lá embaixo pega. */
    const base = (x) => Object.assign({ id:900, tipo:'coleta', etapa:'lancado', criado_em:H, etapa_desde:H,
      prazo:dia(5), prazo_coleta:dia(15), cep:'88000000', valor_ml:164.04, limite_frete:99.9, custo_etiqueta:48.7 }, x);
    const PASSOS = [];
    const P = (c, ctx) => { const r = DD.proximoPasso(c, Object.assign({ h:H, lim:LIM, tentativas:[], docs:[], avisado:false }, ctx)); if(r) PASSOS.push(r); return r; };
    const T = (resultado, agendada_para) => ({ id:1, resultado, agendada_para: agendada_para || null });
    const DOCS = [{ doc:'Etiqueta de coleta', ok:false }, { doc:'Comprovante de pagamento da transportadora', ok:true }];
    let p;
    p = P(base({ prazo:dia(-1) }));
    eq('C1 vencido: a vez é do dinheiro', p.vez, 'dinheiro');
    eq('   a ação é lançar o prazo novo', p.acao, 'prazo');
    ok('   a frase diz o prazo vencido e a perda', /venceu em/.test(p.texto) && /perda/.test(p.texto), p.texto);
    eq('   e o "até" é o prazo vencido', p.ate, dia(-1));
    p = P(base({ prazo:dia(-1) }), { tentativas:[T('aguardando', dia(2))] });
    eq('C1 vem antes de tudo, mesmo com coleta agendada', p.acao, 'prazo');
    p = P(base());
    eq('C2 sem transportadora: pedir a coleta (nós)', p.vez+'/'+p.acao, 'nos/pedir_coleta');
    ok('   a frase fala da transportadora', /Pedir a coleta/.test(p.texto), p.texto);
    eq('   até o prazo da coleta', p.ate, dia(15));
    p = P(base({ etapa:'coleta_pedida' }), { tentativas:[T('aguardando')] });
    eq('C3 coleta pedida sem data: confirmar a data', p.vez+'/'+p.acao, 'nos/agendar');
    ok('   a frase pede a data', /data da coleta/.test(p.texto), p.texto);
    p = P(base({ etapa:'coleta_pedida' }), { tentativas:[T('nao_encontrou', dia(-2)), T('aguardando')] });
    eq('C4 não achou o cliente: remarcar', p.vez+'/'+p.acao, 'nos/agendar');
    ok('   antes do prazo da coleta, escrito na frase', /Remarcar/.test(p.texto) && p.texto.indexOf(dia(15).split('-').reverse().join('/')) >= 0, p.texto);
    p = P(base({ etapa:'coleta_pedida' }), { tentativas:[T('aguardando', dia(3))], docs:DOCS });
    eq('C5 agendada e documento faltando: mandar o comprovante', p.vez+'/'+p.acao, 'nos/docs');
    ok('   e a frase lista o que falta, e só o que falta', /Etiqueta de coleta/.test(p.texto) && !/Comprovante de pagamento/.test(p.texto), p.texto);
    eq('   até o prazo do comprovante', p.ate, dia(5));
    p = P(base({ etapa:'coleta_pedida' }), { tentativas:[T('aguardando', dia(3))], docs:[{doc:'Etiqueta de coleta',ok:true}] });
    ok('C5 com tudo anexado: marcar "Documentos ao ML"', p.acao === 'docs' && /Documentos ao ML/.test(p.texto), p.texto);
    p = P(base({ etapa:'docs_enviados' }), { tentativas:[T('aguardando', dia(3))] });
    eq('C6 documentos no ML, data por vir: a vez é da transportadora', p.vez, 'transportadora');
    eq('   até o dia da coleta', p.ate, dia(3));
    ok('   e não é vez nossa', p.nossa === false);
    p = P(base({ etapa:'docs_enviados' }), { tentativas:[T('aguardando', dia(0))] });
    eq('C6 a coleta é hoje: ainda é da transportadora', p.vez, 'transportadora');
    p = P(base({ etapa:'docs_enviados' }), { tentativas:[T('aguardando', dia(-1))] });
    eq('C7 a data passou: ligar para a transportadora', p.vez+'/'+p.acao, 'nos/resultado_coleta');
    ok('   a frase diz qual coleta', /Ligar para a transportadora/.test(p.texto), p.texto);
    p = P(base({ etapa:'a_caminho', etapa_desde:H }), { tentativas:[T('coletou', dia(-1))] });
    eq('C8 a caminho: acompanhar a entrega (transportadora)', p.vez+'/'+p.acao, 'transportadora/chegou');
    p = P(base({ etapa:'a_caminho', etapa_desde:dia(-3) }), { tentativas:[T('coletou', dia(-4))] });
    eq('C8 a caminho parado há 3 dias: a vez volta para nós', p.vez, 'nos');
    ok('   cobrar a transportadora', /Cobrar a transportadora/.test(p.texto), p.texto);
    p = P(base({ etapa:'chegou', chegou_em:H }));
    eq('C9 chegou sem revisão: Receber peça', p.vez+'/'+p.acao, 'receber_peca/revisar');
    p = P(base({ etapa:'revisado', chegou_em:H, devolucao_id:5 }));
    eq('C10 revisado sem avisar o ML: avisar', p.vez+'/'+p.acao, 'nos/aviso_ml');
    p = P(base({ etapa:'revisado', chegou_em:H, devolucao_id:5 }), { avisado:true });
    eq('C11 valor sem situação: pedir ao ML', p.vez+'/'+p.acao, 'nos/valor');
    p = P(base({ etapa:'revisado', chegou_em:H, devolucao_id:5, valor_ml_situacao:'pedir' }), { avisado:true });
    eq('C11 "a pedir": pedir ao ML', p.vez+'/'+p.acao, 'nos/valor');
    p = P(base({ etapa:'revisado', chegou_em:H, devolucao_id:5, valor_ml_situacao:'pedido', valor_ml_desde:dia(-1) }), { avisado:true });
    eq('C12 "pedido" há 1 dia: a vez é do ML', p.vez, 'ml');
    ok('   e a frase diz há quanto tempo', /pedido há 1 dia/.test(p.texto), p.texto);
    p = P(base({ etapa:'revisado', chegou_em:H, devolucao_id:5, valor_ml_situacao:'pedido', valor_ml_desde:dia(-2) }), { avisado:true });
    eq('C12 "pedido" há 2 dias (o parado): a vez volta para nós', p.vez, 'nos');
    ok('   cobrar o ML', /Cobrar o ML/.test(p.texto), p.texto);
    p = P(base({ etapa:'revisado', chegou_em:H, devolucao_id:5, valor_ml_situacao:'ja_veio' }), { avisado:true });
    eq('C13 "já veio": dar a baixa do reembolso (dinheiro)', p.vez+'/'+p.acao, 'dinheiro/reembolso');
    p = P(base({ etapa:'ml_avisado', chegou_em:H }));
    eq('o aviso antes da revisão não pula a revisão (C9)', p.acao, 'revisar');
    eq('caso encerrado não tem passo', P(base({ encerrado_em:H })), null);
    p = P(base({ etapa:'a_caminho', prazo:dia(-3) }), { tentativas:[T('coletou')] });
    ok('o prazo do comprovante cumprido (a caminho) não grita vencido', p.acao !== 'prazo', p.texto);

    secao('próximo passo — o mapa do "ML devolve" (M1 a M5)');
    const mb = (x) => Object.assign({ id:901, tipo:'ml', etapa:'aguardando', criado_em:dia(-4), etapa_desde:dia(-4), custo_etiqueta:48.7, valor_revisao:48.7 }, x);
    p = P(mb({ etapa:'revisado', chegou_em:H, devolucao_id:7, dev_baixado:1, revisar_ate:dia(-1) }));
    eq('M1 "revisar no ML até" vencido: marcar "Já revisei" hoje', p.vez+'/'+p.acao, 'nos/revisei');
    ok('   a frase diz que o prazo venceu', /venceu em/.test(p.texto), p.texto);
    p = P(mb({ etapa:'chegou', chegou_em:H, revisar_ate:dia(-1) }));
    eq('M1 vencido sem a peça revisada: revisar hoje', p.vez+'/'+p.acao, 'receber_peca/revisar');
    p = P(mb());
    eq('M2 aguardando chegar: a vez é do ML', p.vez, 'ml');
    ok('   "nada a fazer", há N dias', /Nada a fazer/.test(p.texto) && /há 4 dias/.test(p.texto), p.texto);
    p = P(mb({ etapa:'chegou', chegou_em:H }));
    eq('M3 chegou sem revisão: Receber peça', p.vez+'/'+p.acao, 'receber_peca/revisar');
    p = P(mb({ etapa:'revisado', chegou_em:H, devolucao_id:7, dev_baixado:0 }));
    eq('M4 revisado sem baixa: dar a baixa', p.vez+'/'+p.acao, 'nos/baixa');
    p = P(mb({ etapa:'revisado', chegou_em:H, devolucao_id:7, dev_baixado:1, revisar_ate:dia(4) }));
    eq('M4 com baixa: marcar "Já revisei"', p.vez+'/'+p.acao, 'nos/revisei');
    eq('   até o "revisar no ML até"', p.ate, dia(4));
    ok('   e lembra de pedir a revisão do valor ou da reputação', /revisão do valor ou da reputação/.test(p.texto), p.texto);
    p = P(mb({ etapa:'ml_revisei', chegou_em:H, devolucao_id:7, dev_baixado:1, revisao_pedida_em:dia(-1) }));
    eq('M5 revisão pedida há 1 dia: a vez é do ML', p.vez+'/'+p.acao, 'ml/revisao_frete');
    p = P(mb({ etapa:'ml_revisei', chegou_em:H, devolucao_id:7, dev_baixado:1, revisao_pedida_em:dia(-3) }));
    eq('M5 revisão pedida há 3 dias (o parado): a vez volta para nós', p.vez, 'nos');
    ok('   cobrar o ML', /Cobrar o ML/.test(p.texto), p.texto);

    secao('próximo passo — sem reais, e o mesmo na lista e no caso');
    const todos = [];
    const pc = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'2000015571709001', sku:'BK140140BEGE', prazo:dia(5), publicidade:false }, 3).body.id;
    let L = lista(2);
    const lp = daLista(L.coleta, pc);
    ok('a lista traz o passo do caso aberto', !!(lp && lp.proximo && lp.proximo.acao === 'pedir_coleta'), JSON.stringify(lp && lp.proximo));
    const dp = chamar('GET','/api/devolucao-casos/:id',null,2,{ id:pc }).body.caso.proximo;
    eq('o caso diz o mesmo passo que a lista', JSON.stringify(dp), JSON.stringify(lp.proximo));
    db.prepare("UPDATE devolucao_caso SET valor_ml=164.04, limite_frete=99.9 WHERE id=?").run(pc);
    for(const c of L.coleta.concat(L.ml)) if(c.proximo) todos.push(c.proximo);
    for(const c of lista(1).coleta.concat(lista(1).ml)) if(c.proximo) todos.push(c.proximo);
    ok('vários casos abertos têm passo', todos.length >= 4, String(todos.length));
    const linhasMapa = PASSOS.length;
    for(const x of PASSOS) todos.push(x);
    ok('   e a varredura inclui as frases de todas as linhas do mapa', linhasMapa >= 25, String(linhasMapa));
    ok('nenhum passo fala em reais (R$, valor em número com vírgula ou ponto)', todos.every(p => !/R\$|\d+[,.]\d{1,2}\b|reais/i.test(p.texto)), JSON.stringify(todos.find(p => /R\$|\d+,\d{2}\b/.test(p.texto))));
    ok('e o passo só tem as chaves de passo', todos.every(p => Object.keys(p).every(k => ['texto','vez','ate','acao','quem','nossa'].indexOf(k) >= 0)), JSON.stringify(todos[0]));
    ok('encerrado não leva passo', chamar('GET','/api/devolucao-casos/encerrados',null,1).body.casos.every(c => !c.proximo));
    // o passo anda com o caso, pelas rotas de verdade
    const tr = db.prepare("SELECT id FROM transportadora WHERE ativo=1 LIMIT 1").get();
    chamar('POST','/api/devolucao-casos/:id/coleta',{ transportadora_id: tr.id, cep:'88000000' }, 2, { id:pc });
    eq('pedida a coleta sem data: o passo vira "confirmar a data"', daLista(lista(2).coleta, pc).proximo.acao, 'agendar');
    const tid = db.prepare('SELECT id FROM devolucao_coleta WHERE caso_id=? ORDER BY id DESC').get(pc).id;
    chamar('POST','/api/devolucao-casos/:id/coleta-agenda',{ tentativa_id:tid, agendada_para:dia(2) }, 2, { id:pc });
    eq('agendada: o passo vira "mandar o comprovante"', daLista(lista(2).coleta, pc).proximo.acao, 'docs');
    chamar('POST','/api/devolucao-casos/:id/coleta-resultado',{ tentativa_id:tid, resultado:'nao_encontrou' }, 2, { id:pc });
    const pr = daLista(lista(2).coleta, pc).proximo;
    ok('não achou o cliente: o passo vira "remarcar"', pr.acao === 'agendar' && /Remarcar/.test(pr.texto), pr.texto);
  }

  /* ═══ FASE 3 — o responsável como pessoa e "Meus casos" (🔴, teste antes) ═══ */
  secao('responsável — as colunas novas, num banco novo e num antigo');
  {
    const DD = require('./devcaso_dominio');
    const cols = (d) => d.prepare("SELECT name FROM pragma_table_info('devolucao_caso')").all().map(x => x.name);
    ok('banco novo: responsavel_id e responsavel_nome no CREATE', cols(db).indexOf('responsavel_id') >= 0 && cols(db).indexOf('responsavel_nome') >= 0, cols(db).join(','));
    const novo = new Database(':memory:');
    novo.exec("CREATE TABLE devolucao_caso (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, etapa TEXT NOT NULL, venda TEXT, encerrado_em TEXT)");
    DD.garantir(novo);
    const cn = cols(novo);
    ok('banco antigo: o ALTER acrescenta as duas no fim', cn.slice(-2).join(',') === 'responsavel_id,responsavel_nome', cn.slice(-4).join(','));
    const zero = new Database(':memory:'); DD.garantir(zero);
    const cz = cols(zero);
    ok('   e a ordem do banco novo é a mesma do antigo depois do ALTER (§17)', cz.slice(-2).join(',') === 'responsavel_id,responsavel_nome', cz.slice(-4).join(','));
    const antigo = new Database(':memory:');
    antigo.exec("CREATE TABLE devolucao_caso (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, etapa TEXT NOT NULL, venda TEXT, encerrado_em TEXT, responsavel TEXT)");
    antigo.prepare("INSERT INTO devolucao_caso (tipo,etapa,responsavel) VALUES ('coleta','lancado','Renato do texto')").run();
    DD.garantir(antigo);
    const ra = antigo.prepare('SELECT responsavel, responsavel_id, responsavel_nome FROM devolucao_caso').get();
    eq('   o texto livre antigo fica como estava, sem conversão', ra.responsavel + '/' + ra.responsavel_id + '/' + ra.responsavel_nome, 'Renato do texto/null/null');
    novo.close(); zero.close(); antigo.close();
  }

  secao('responsável — quem pode ser escolhido');
  db.exec("CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, ativo INTEGER DEFAULT 1)");
  db.exec("DELETE FROM usuarios");
  db.prepare("INSERT INTO usuarios (id,nome,ativo) VALUES (1,'Lucas',1),(2,'Renato',1),(3,'Ana',1),(4,'Edvaldo',1),(6,'Só lança',1),(7,'SoBaixa',1),(8,'Nada',1),(9,'Ex-acompanha',0)").run();
  PERMS[9] = new Set(['devolucao.acompanhar']); NOMES[9] = 'Ex-acompanha';
  r = chamar('GET','/api/devolucao-casos/responsaveis',null,2);
  eq('a lista responde (quem acompanha)', r.status, 200);
  const rIds = (r.body.pessoas || []).map(x => x.id).sort((a,b) => a-b).join(',');
  eq('só pessoa ativa que lança ou acompanha: Lucas, Renato, Ana, Só lança', rIds, '1,2,3,6');
  ok('   e só viajam id e nome', (r.body.pessoas || []).every(x => Object.keys(x).sort().join(',') === 'id,nome'), JSON.stringify(r.body.pessoas));
  eq('   e diz quem é a pessoa logada (para o "Meus casos")', r.body.eu, 2);
  ok('   em ordem de nome', (r.body.pessoas || []).map(x => x.nome).join('|') === (r.body.pessoas || []).map(x => x.nome).sort((a,b) => a.localeCompare(b,'pt-BR')).join('|'));

  secao('responsável — escolher a pessoa no caso');
  const rc = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'2000015571709301', sku:'BK140140BEGE', prazo:dia(5), responsavel:'Texto de antes', publicidade:false }, 3).body.id;
  /* O caso de antes da regra (04/11/2026): só o texto livre, sem a pessoa. */
  db.prepare('UPDATE devolucao_caso SET responsavel_id=NULL, responsavel_nome=NULL WHERE id=?').run(rc);
  eq('o caso de antes, com texto livre, fica como estava', caso(rc).responsavel, 'Texto de antes');
  eq('   e o texto livre não conta como responsável: o caso diz que falta', chamar('GET','/api/devolucao-casos/:id',null,2,{ id:rc }).body.caso.falta_lancamento.join(), 'responsável');
  r = chamar('POST','/api/devolucao-casos/:id/editar',{ responsavel_id:2 }, 3, { id:rc });
  eq('escolher o Renato (200)', r.status, 200);
  eq('   grava o id', caso(rc).responsavel_id, 2);
  eq('   e o nome como retrato', caso(rc).responsavel_nome, 'Renato');
  eq('   e o texto livre de antes não é apagado', caso(rc).responsavel, 'Texto de antes');
  ok('   e vai para a história', eventos(rc).some(e => e.tipo === 'editado' && /responsável: Texto de antes → Renato/.test(e.texto || '')), JSON.stringify(eventos(rc).slice(-1)));
  r = chamar('POST','/api/devolucao-casos/:id/editar',{ responsavel_id:2 }, 3, { id:rc });
  eq('escolher a mesma pessoa de novo não grava outra linha na história', eventos(rc).filter(e => e.tipo === 'editado').length, 1);
  for(const [uid, rot] of [[4,'quem só recebe a peça'],[7,'quem só dá baixa'],[9,'pessoa inativa'],[999,'pessoa que não existe'],['abc','id impossível']]){
    r = chamar('POST','/api/devolucao-casos/:id/editar',{ responsavel_id:uid }, 3, { id:rc });
    eq('recusa '+rot+' (400)', r.status, 400);
  }
  eq('   e nada mudou', caso(rc).responsavel_id + '/' + caso(rc).responsavel_nome, '2/Renato');
  r = chamar('POST','/api/devolucao-casos/:id/editar',{ responsavel_id:'' }, 3, { id:rc });
  eq('vazio de propósito tira a pessoa', caso(rc).responsavel_id + '/' + caso(rc).responsavel_nome, 'null/null');
  eq('   e o texto antigo continua lá', caso(rc).responsavel, 'Texto de antes');
  r = chamar('POST','/api/devolucao-casos/:id/editar',{ obs:'só a observação' }, 3, { id:rc });
  eq('editar outro campo não mexe no responsável (campo ausente não é vazio)', caso(rc).responsavel_id, null);
  const rc2 = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571709302', sku:'BK140140BEGE', responsavel_id:6, publicidade:false }, 3);
  eq('o lançamento já escolhe a pessoa', rc2.status + '/' + caso(rc2.body.id).responsavel_id + '/' + caso(rc2.body.id).responsavel_nome, '200/6/Só lança');
  r = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'2000015571709303', sku:'BK140140BEGE', responsavel_id:4, publicidade:false }, 3);
  eq('   e recusa quem não pode (400), sem nascer o caso', r.status + '/' + contar('devolucao_caso', "venda='2000015571709303'"), '400/0');
  const nl = daLista(lista(2).ml, rc2.body.id);
  eq('a lista leva o id e o nome da pessoa (o "Meus casos" filtra por ele)', nl && (nl.responsavel_id + '/' + nl.responsavel_nome), '6/Só lança');

  /* ═══ O QUE O LANÇAMENTO EXIGE (decisão do dono, 04/11/2026) ═══
     Motivo, SKU, comprador, responsável e link da conversa, nos dois tipos.
     `_cru` desliga o completar do helper: aqui o corpo é exatamente este. */
  secao('lançamento — os cinco campos obrigatórios');
  {
    const DD = require('./devcaso_dominio');
    const cheio = (x) => Object.assign({ _cru:true, tipo:'coleta', venda:'2000015571709401', prazo:dia(5), publicidade:false,
      motivo:'Avaria no transporte', sku:'BK140140BEGE', comprador:'Maria Teste', responsavel_id:2,
      link_ml:'https://www.mercadolivre.com.br/reclamacao/9401' }, x);
    const n0 = contar('devolucao_caso');
    for(const [k, nome] of [['motivo','motivo'],['sku','SKU'],['comprador','comprador'],['responsavel_id','responsável'],['link_ml','link da conversa']]){
      for(const tipo of ['coleta','ml']){
        const r1 = chamar('POST','/api/devolucao-casos', cheio({ tipo, [k]:'' }), 3);
        ok('sem '+nome+' ('+tipo+'): 400 nomeando o campo', r1.status === 400 && r1.body.erro.indexOf(nome) >= 0 && (r1.body.faltam||[]).join() === k, JSON.stringify(r1.body));
      }
    }
    eq('   e nenhum caso nasceu', contar('devolucao_caso'), n0);
    r = chamar('POST','/api/devolucao-casos', { _cru:true, tipo:'ml', venda:'2000015571709402', publicidade:false }, 3);
    eq('faltando os cinco: uma recusa só, com os cinco', r.status + ' ' + (r.body.faltam||[]).join(','), '400 motivo,sku,comprador,responsavel_id,link_ml');
    ok('   e a frase diz todos', /Para lançar, falta: motivo · SKU · comprador · responsável · link da conversa\./.test(r.body.erro), r.body.erro);
    r = chamar('POST','/api/devolucao-casos', cheio({ responsavel_id:undefined, responsavel:'Escrito à mão' }), 3);
    eq('o texto livre de responsável não basta', r.status + ' ' + (r.body.faltam||[]).join(), '400 responsavel_id');
    db.prepare("INSERT INTO lote (codigo,buyer,nf,venda) VALUES ('BK160140BEGE','Joao Lima','9410','2000015571709410')").run();
    r = chamar('POST','/api/devolucao-casos', cheio({ venda:'2000015571709410', sku:'', comprador:'' }), 3);
    eq('a venda achada no sistema preenche SKU e comprador, e lança', r.status, 200);
    const cs = caso(r.body.id);
    eq('   com os da venda', cs.sku + '/' + cs.comprador, 'BK160140BEGE/Joao Lima');
    r = chamar('POST','/api/devolucao-casos', cheio({}), 3);
    eq('com os cinco, lança', r.status, 200);
    const cc = r.body.id;
    eq('   e o caso completo não tem "falta"', JSON.stringify(chamar('GET','/api/devolucao-casos/:id',null,2,{ id:cc }).body.caso.falta_lancamento), '[]');
    const semReg = DD.lancar(db, { tipo:'ml', venda:'2000015571709403', publicidade:false }, { nome:'Script' }, { semObrigatorios:true });
    ok('o script dos casos iniciais (semObrigatorios) lança sem eles', !!(semReg && semReg.id));
    const fl = chamar('GET','/api/devolucao-casos/:id',null,2,{ id:semReg.id }).body.caso.falta_lancamento;
    eq('o caso incompleto diz o que falta', fl.join(' · '), 'motivo · SKU · comprador · responsável · link da conversa');
    const nl = daLista(lista(2).ml, semReg.id);
    eq('   a lista também', (nl.falta_lancamento||[]).length, 5);
    ok('   sem valor em reais', fl.every(x => !/R\$|\d/.test(x)));
    chamar('POST','/api/devolucao-casos/:id/editar',{ motivo:'Avaria no transporte', sku:'BK140140BEGE', comprador:'Fulano', responsavel_id:3, link_ml:'https://www.mercadolivre.com.br/x/9403' }, 1, { id:semReg.id });
    eq('completado pelo editar, o "falta" some', chamar('GET','/api/devolucao-casos/:id',null,2,{ id:semReg.id }).body.caso.falta_lancamento.length, 0);
    const sem2 = DD.lancar(db, { tipo:'coleta', venda:'2000015571709404', prazo:dia(3), publicidade:false }, { nome:'Script' }, { semObrigatorios:true });
    chamar('POST','/api/devolucao-casos/:id/perda',{ valor_perdido:'1' }, 1, { id:sem2.id });
    eq('o encerrado não cobra o que falta', JSON.stringify(chamar('GET','/api/devolucao-casos/encerrados',null,1).body.casos.find(c => c.id === sem2.id).falta_lancamento), '[]');
  }

  /* ═══ OS CASOS DE CADA RESPONSÁVEL E O HISTÓRICO DE DESEMPENHO (04/11/2026) ═══
     Spec docs/arquivo/DEVOLUCOES-DESEMPENHO.md. Escritos antes do código. */
  secao('por responsável — o quadro dos casos abertos');
  {
    const L = lista(1);
    const todos = L.coleta.concat(L.ml);
    const pr = L.por_responsavel || [];
    eq('a soma do quadro é o total de abertos', pr.reduce((s, x) => s + x.casos, 0), todos.length);
    const ren = pr.find(x => x.id === 2) || {};
    const deRen = todos.filter(c => c.responsavel_id === 2);
    eq('a linha do Renato conta os casos dele', ren.casos, deRen.length);
    eq('   os que esperam a gente', ren.esperando, deRen.filter(c => !c.proximo || c.proximo.nossa).length);
    eq('   os vencidos', ren.vencidos, deRen.filter(c => c.cor === 'vencido').length);
    eq('   os que vencem hoje ou amanhã', ren.vermelhos, deRen.filter(c => c.cor === 'vermelho').length);
    eq('   os parados', ren.parados, deRen.filter(c => c.parado || c.revisao_parada).length);
    const sem = pr.find(x => x.id === null);
    eq('o texto livre conta como "Sem responsável"', sem && sem.casos, todos.filter(c => !c.responsavel_id).length);
    ok('   e a linha diz o nome', sem && sem.nome === 'Sem responsável');
    ok('o quadro não leva valor em reais', pr.every(x => !Object.keys(x).some(k => /valor|custo|saldo|limite/.test(k))));
  }

  secao('desempenho — o histórico por responsável, mês a mês');
  {
    const ins = db.prepare(`INSERT INTO devolucao_caso (tipo,venda,etapa,etapa_desde,prazo,prazo_original,prazo_coleta,revisar_ate,
        aberta_em,criado_em,encerrado_em,saida,responsavel,responsavel_id,responsavel_nome,teste)
      VALUES (@tipo,@venda,@etapa,@ed,@prazo,@po,@pc,@ra,@ab,@cr,@enc,@saida,@rt,@rid,@rnome,0)`);
    const ev = db.prepare('INSERT INTO devolucao_evento (caso_id,tipo,de,para,texto,usuario,criado_em) VALUES (?,?,?,?,?,?,?)');
    const caso0 = { tipo:'coleta', venda:null, etapa:'encerrado', ed:null, prazo:null, po:null, pc:null, ra:null, ab:null, cr:null, enc:null, saida:null, rt:null, rid:null, rnome:null };
    const novo = (x, evs) => {
      const id = ins.run(Object.assign({}, caso0, x)).lastInsertRowid;
      for(const [tipo, para, data] of evs) ev.run(id, tipo, null, para, null, 'Teste', data);
      return id;
    };
    // A: Renato, comprovante cumprido, coleta vencida, reembolso; 19 dias; três vezes parado (3, 8 e 6 dias).
    const A = novo({ venda:'DSP-A', prazo:'2026-07-05', pc:'2026-07-10', ab:'2026-07-01', cr:'2026-07-01 09:00:00', enc:'2026-07-20 10:00:00', saida:'reembolso_recebido', rid:2, rnome:'Renato' },
      [['lancado','lancado','2026-07-01 09:00:00'],['etapa','docs_enviados','2026-07-04 10:00:00'],['coleta','a_caminho','2026-07-12 10:00:00'],
       ['chegou','chegou','2026-07-13 10:00:00'],['revisado','revisado','2026-07-14 10:00:00'],['encerrado','encerrado','2026-07-20 10:00:00']]);
    // B: Renato (com um intervalo de exatamente 2 dias, o limite do parado), comprovante prorrogado de 03/07 para 08/07 e cumprido em 06/07 (pelo original seria vencido); perda; 7 dias.
    const B = novo({ venda:'DSP-B', prazo:'2026-07-08', po:'2026-07-03', ab:'2026-07-02', cr:'2026-07-02 09:00:00', enc:'2026-07-09 10:00:00', saida:'perda_prazo', rid:2, rnome:'Renato' },
      [['lancado','lancado','2026-07-02 09:00:00'],['etapa','docs_enviados','2026-07-06 10:00:00'],['chegou','chegou','2026-07-08 10:00:00'],['encerrado','encerrado','2026-07-09 10:00:00']]);
    // C: Renato, ML devolve, "Já revisei" depois do "revisar até": vencido; 10 dias.
    const C = novo({ tipo:'ml', venda:'DSP-C', ra:'2026-07-10', cr:'2026-07-01 09:00:00', enc:'2026-07-11 10:00:00', saida:'revisado_ml', rid:2, rnome:'Renato' },
      [['lancado','aguardando','2026-07-01 09:00:00'],['chegou','chegou','2026-07-02 10:00:00'],['revisado','revisado','2026-07-03 10:00:00'],
       ['aviso_ml','ml_revisei','2026-07-11 09:00:00'],['encerrado','encerrado','2026-07-11 10:00:00']]);
    // D: só o texto livre: "Sem responsável".
    const D = novo({ venda:'DSP-D', ab:'2026-07-01', cr:'2026-07-01 09:00:00', enc:'2026-07-15 10:00:00', saida:'devolvido_comprador', rt:'Fulano à mão' },
      [['lancado','lancado','2026-07-01 09:00:00'],['encerrado','encerrado','2026-07-15 10:00:00']]);
    // E: aberto (não conta); F: encerrado em junho (não conta).
    novo({ venda:'DSP-E', etapa:'lancado', cr:'2026-07-01 09:00:00', rid:2, rnome:'Renato' }, [['lancado','lancado','2026-07-01 09:00:00']]);
    novo({ venda:'DSP-F', cr:'2026-06-01 09:00:00', enc:'2026-06-20 10:00:00', saida:'reembolso_recebido', rid:2, rnome:'Renato' },
      [['lancado','lancado','2026-06-01 09:00:00'],['encerrado','encerrado','2026-06-20 10:00:00']]);

    r = chamar('GET','/api/devolucao-casos/desempenho',null,2,{},{ mes:'2026-07' });
    eq('a rota responde para quem acompanha', r.status, 200);
    const pess = r.body.pessoas || [];
    const ren = pess.find(x => x.id === 2) || {};
    eq('o Renato tem os três casos encerrados no mês (o aberto e o de junho ficam fora)', ren.casos, 3);
    eq('   prazos cumpridos: o comprovante de A e o de B (pelo prazo final)', ren.prazos && ren.prazos.cumpridos, 2);
    eq('   prazos vencidos: a coleta de A e o "revisar até" de C', ren.prazos && ren.prazos.vencidos, 2);
    eq('   e diz quantos foram prorrogados', ren.prazos && ren.prazos.prorrogados, 1);
    eq('   como encerraram', JSON.stringify(ren.saidas), JSON.stringify({ reembolso_recebido:1, perda_prazo:1, revisado_ml:1 }));
    eq('   o tempo até encerrar é a MEDIANA (7, 10, 19 → 10), não a média', ren.dias_mediana, 10);
    eq('   com o maior ao lado', ren.dias_maior, 19);
    eq('   as vezes parado (gaps de 3, 8 e 6 dias em A; 4 e 2 — o limite exato — em B; 8 em C)', ren.vezes_parado, 6);
    eq('   e o maior intervalo parado', ren.maior_parado, 8);
    eq('   a lista dos casos dele, para abrir', (ren.lista || []).map(x => x.id).sort((a,b) => a-b).join(','), [A,B,C].sort((a,b) => a-b).join(','));
    const semR = pess.find(x => x.id === null) || {};
    eq('o caso com só o texto livre vai para "Sem responsável"', (semR.lista || []).map(x => x.id).join(), String(D));
    eq('   e sem prazo decidido não vira "0 de 0"', semR.prazos && semR.prazos.decididos, 0);
    ok('nenhum valor em reais no histórico', JSON.stringify(r.body).search(/valor_|custo|saldo|limite_frete/) < 0);
    r = chamar('GET','/api/devolucao-casos/desempenho',null,2,{},{ mes:'2026-13' });
    eq('mês impossível: 400', r.status, 400);
    r = chamar('GET','/api/devolucao-casos/desempenho',null,2,{},{ mes:'2026-05' });
    eq('mês sem caso encerrado: lista vazia', (r.body.pessoas || []).length, 0);
  }

  /* CONSERTO de 04/11/2026: o caso que já chegou não volta para antes da
     chegada. As etapas à mão (MANUAIS) são todas de antes dela; com a caixa
     na fábrica, a tela não as oferece e a rota recusa. */
  secao('CHEGOU: o caso não volta para antes da chegada');
  {
    let r = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'7770801', sku:'BK160140BEGE' }, 3);
    const mlA = r.body.id;
    r = chamar('GET','/api/devolucao-casos/:id',null,2,{id:mlA});
    eq('ML devolve aguardando: a tela recebe as etapas à mão de sempre', JSON.stringify(r.body.manuais), JSON.stringify(['aguardando']));
    chamar('POST','/api/devolucao-casos/:id/chegou',{}, 2, {id:mlA});
    r = chamar('GET','/api/devolucao-casos/:id',null,2,{id:mlA});
    eq('ML devolve chegado: nenhuma etapa à mão para a tela', JSON.stringify(r.body.manuais), '[]');
    r = chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'aguardando' }, 2, {id:mlA});
    eq('   e a rota recusa voltar a "Aguardando chegar" (400)', r.status, 400);
    ok('   dizendo por quê', /já chegou/.test(r.body && (r.body.erro || r.body.mensagem || JSON.stringify(r.body))));
    eq('   e o caso fica em "Chegou"', caso(mlA).etapa, 'chegou');

    r = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'7770802', sku:'BK160140BEGE' }, 3);
    const mlR = r.body.id;
    r = chamar('POST','/api/devolucao',{ codigo_ml:'7770802', caso_id:mlR, sku_fisico:'BK160140BEGE', destinacao:'estoque' }, 4);
    eq('ML devolve revisado pelo bipe', caso(mlR).etapa, 'revisado');
    r = chamar('GET','/api/devolucao-casos/:id',null,2,{id:mlR});
    eq('   nenhuma etapa à mão para a tela', JSON.stringify(r.body.manuais), '[]');
    eq('   e a rota recusa voltar a "Aguardando chegar" (400)', chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'aguardando' }, 2, {id:mlR}).status, 400);
    eq('   e o caso continua revisado', caso(mlR).etapa, 'revisado');

    r = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'7770803', sku:'BK160140BEGE', prazo:dia(6) }, 3);
    const co = r.body.id;
    eq('nós coletamos não chegado: a etapa à mão continua (200)', chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'coleta_pedida' }, 2, {id:co}).status, 200);
    chamar('POST','/api/devolucao-casos/:id/chegou',{}, 2, {id:co});
    r = chamar('GET','/api/devolucao-casos/:id',null,2,{id:co});
    eq('nós coletamos chegado: nenhuma etapa à mão para a tela', JSON.stringify(r.body.manuais), '[]');
    for(const para of ['lancado','coleta_pedida','docs_enviados','a_caminho'])
      eq('   e a rota recusa voltar a "'+para+'" (400)', chamar('POST','/api/devolucao-casos/:id/etapa',{ para }, 2, {id:co}).status, 400);
    eq('   e o caso fica em "Chegou"', caso(co).etapa, 'chegou');
    /* Desde 04/11/2026 o desfazer existe aqui, mas é o da CHEGADA (o último
       clique), e não uma etapa à mão de antes dela. */
    ok('   e o único desfazer é o da própria chegada', r.body.desfazer && r.body.desfazer.de === 'chegou' && r.body.desfazer.chegada === true, JSON.stringify(r.body.desfazer));
  }

  /* AJUSTE de 04/11/2026: o "A caixa chegou" clicado por engano se desfaz
     pelo mesmo "↩ Desfazer", nas mesmas condições — e só sem revisão ligada. */
  secao('DESFAZER A CHEGADA');
  {
    const det2 = (id, quem) => chamar('GET','/api/devolucao-casos/:id',null,quem || 3,{ id }).body;
    const desf2 = (id, quem) => chamar('POST','/api/devolucao-casos/:id/desfazer-etapa',{}, quem || 3, { id });
    let r = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'7770901', sku:'BK160140BEGE' }, 3);
    const m1 = r.body.id;
    db.prepare("UPDATE devolucao_caso SET etapa_desde='2026-10-21 09:00:00' WHERE id=?").run(m1);
    chamar('POST','/api/devolucao-casos/:id/chegou',{}, 3, {id:m1});
    ok('ML devolve: quem marcou a chegada vê o desfazer, voltando para "Aguardando chegar"',
       det2(m1,3).desfazer && det2(m1,3).desfazer.para === 'aguardando' && /Aguardando chegar/.test(det2(m1,3).desfazer.nome), JSON.stringify(det2(m1,3).desfazer));
    eq('   outra pessoa não vê', det2(m1,2).desfazer, null);
    eq('   e se tentar, é recusada (403)', desf2(m1,2).status, 403);
    eq('   e a chegada fica', caso(m1).etapa, 'chegou');
    eq('quem marcou desfaz (200)', desf2(m1,3).status, 200);
    eq('   o caso volta a "Aguardando chegar"', caso(m1).etapa, 'aguardando');
    eq('   com a data da etapa de antes', caso(m1).etapa_desde, '2026-10-21 09:00:00');
    eq('   e a chegada sai (chegou_em vazio)', caso(m1).chegou_em, null);
    ok('   e a história guarda a chegada e o desfeito', eventos(m1).some(e => e.tipo === 'desfeito' && e.de === 'chegou' && e.para === 'aguardando'), JSON.stringify(eventos(m1).map(e => e.tipo)));
    eq('   e a caixa pode ser marcada de novo', chamar('POST','/api/devolucao-casos/:id/chegou',{}, 3, {id:m1}).status, 200);

    r = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'7770902', sku:'BK160140BEGE', prazo:dia(6) }, 3);
    const c1 = r.body.id;
    chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'coleta_pedida' }, 3, {id:c1});
    chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'a_caminho' }, 3, {id:c1});
    chamar('POST','/api/devolucao-casos/:id/chegou',{}, 3, {id:c1});
    eq('nós coletamos: desfazer a chegada (200)', desf2(c1,3).status, 200);
    eq('   volta a "A caminho"', caso(c1).etapa, 'a_caminho');
    eq('   sem a chegada', caso(c1).chegou_em, null);
    ok('   e os botões de etapa voltam', (det2(c1,3).manuais || []).length > 0, JSON.stringify(det2(c1,3).manuais));

    r = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'7770903', sku:'BK160140BEGE' }, 3);
    const m2 = r.body.id;
    chamar('POST','/api/devolucao-casos/:id/chegou',{}, 3, {id:m2});
    chamar('POST','/api/devolucao',{ codigo_ml:'7770903', caso_id:m2, sku_fisico:'BK160140BEGE', destinacao:'estoque' }, 4);
    eq('com a peça já revisada, não há desfazer da chegada', det2(m2,3).desfazer, null);
    eq('   e se tentar, é recusado (409)', desf2(m2,3).status, 409);
    ok('   e a chegada fica', !!caso(m2).chegou_em);

    /* A revisão ligada também trava mesmo se o último andar ainda fosse a chegada. */
    r = chamar('POST','/api/devolucao-casos',{ tipo:'ml', venda:'7770905', sku:'BK160140BEGE' }, 3);
    const m3 = r.body.id;
    chamar('POST','/api/devolucao-casos/:id/chegou',{}, 3, {id:m3});
    const dv = db.prepare('SELECT id FROM devolucao ORDER BY id DESC LIMIT 1').get().id;
    db.prepare('UPDATE devolucao_caso SET devolucao_id=? WHERE id=?').run(dv, m3);
    eq('com revisão ligada (sem evento novo), também não desfaz', desf2(m3,3).status, 409);

    r = chamar('POST','/api/devolucao-casos',{ tipo:'coleta', venda:'7770904', sku:'BK160140BEGE', prazo:dia(6) }, 3);
    const c2 = r.body.id;
    chamar('POST','/api/devolucao-casos/:id/etapa',{ para:'a_caminho' }, 3, {id:c2});
    chamar('POST','/api/devolucao-casos/:id/chegou',{}, 3, {id:c2});
    chamar('POST','/api/devolucao-casos/:id/aviso-ml',{}, 3, {id:c2});
    eq('depois do "Avisamos o ML", a chegada não se desfaz (409)', desf2(c2,3).status, 409);
    ok('   e a chegada fica', !!caso(c2).chegou_em);
  }

  fim();
})().catch(e => { console.log('ESTOUROU: ' + e.stack); falhas++; fim(); });

function fim(){
  db.close(); fs.rmSync(tmp, { recursive:true, force:true });
  console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
  process.exit(falhas ? 1 : 0);
}
