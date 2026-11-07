#!/usr/bin/env node
/* FASE 6 da spec COMPRAS-E-RECEBIMENTO — contagem de material e consumo
 * (R-CMP-42 a 45).
 *
 *   node teste_contagem_material.js
 *
 * ⚠️ ESCRITO ANTES DO CODIGO e conferido reintroduzindo cada defeito. Trava: a
 * contagem e de UMA pessoa, CEGA (o saldo nao viaja), por almoxarifado; tubo
 * cortado ainda e material (inteiros e cortados, convertidos em metro); dentro
 * da tolerancia aplica sozinha, acima vai para quem aprova; zero e lancamento
 * valido, e nao contado nao e zero; o consumo pela contagem e `null` com uma
 * contagem so; a media de compra de quem nao tem saldo diz de quantos meses
 * saiu e acusa pouco historico.
 */
const { bancada, MODULOS } = require('./util_teste_compras');
const B = bancada({ modulos: MODULOS.concat(['material_route', 'compra_route', 'recebimento_route', 'nota_route', 'almox_route', 'contagem_material_route']) });
const { db, get, post, ok, fim, secao } = B;
const AG  = { id:1, nome:'Lucas', admin_geral:true, permissoes:['alcada.definir'] };
const ANA = { id:2, nome:'Ana', permissoes:['contagem.contar'] };
const BIA = { id:3, nome:'Bia', permissoes:['contagem.contar'] };
const APR = { id:4, nome:'Caio', permissoes:['contagem.aprovar'] };
const DOM = require('./componente_dominio');

(async () => {
  db.exec('CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, pin_hash TEXT, salt TEXT, areas TEXT, ativo INTEGER DEFAULT 1)');
  const alm = db.prepare("SELECT id FROM almoxarifado WHERE nome='Comandos e montagem'").get().id;
  const exp = db.prepare("SELECT id FROM almoxarifado WHERE nome='Expedição'").get().id;
  const mk = async (b) => (await post('/api/componentes', Object.assign({ almoxarifado_id:alm }, b), AG)).corpo.id;
  const tubo = await mk({ nome:'Tubo 38', unidade:'m', modo_saldo:'quantidade', tol_aviso_pct:2 });
  const comando = await mk({ nome:'Comando', unidade:'un', modo_saldo:'quantidade', tol_aviso_pct:2 });
  const fita = await mk({ nome:'Fita crepe', unidade:'un', modo_saldo:'quantidade' });
  const cafe = await mk({ nome:'Café', unidade:'un', modo_saldo:'sem', vai_ficha:0 });
  const parafuso = (await post('/api/componentes', { nome:'Parafuso', unidade:'un', modo_saldo:'quantidade', almoxarifado_id:exp }, AG)).corpo.id;
  db.transaction(() => {
    DOM.entrada(db, { componente_id:tubo, delta:120, custo_unit:5, referencia:'teste' });
    DOM.entrada(db, { componente_id:comando, delta:100, custo_unit:3, referencia:'teste' });
    DOM.entrada(db, { componente_id:fita, delta:10, custo_unit:1, referencia:'teste' });
    DOM.entrada(db, { componente_id:parafuso, delta:500, custo_unit:0.1, referencia:'teste' });
  })();
  const est = id => db.prepare('SELECT estoque FROM componente WHERE id=?').get(id).estoque;

  secao('uma pessoa, cega, por almoxarifado (R-CMP-42)');
  let r = await post('/api/contagem-material/abrir', { almoxarifado_id:alm }, ANA);
  ok('abre a contagem do almoxarifado', r.status === 200 && r.corpo.id > 0, () => JSON.stringify(r.corpo));
  const cid = r.corpo.id;
  const c = (await get('/api/contagem-material/' + cid, ANA)).corpo;
  ok('lista so os materiais por quantidade e por volume DESTE almoxarifado', c.itens.some(i => i.componente_id === tubo) && !c.itens.some(i => i.componente_id === cafe) && !c.itens.some(i => i.componente_id === parafuso));
  ok('SEM o saldo (nem estoque, nem sistema, nem diferenca)', JSON.stringify(c).search(/estoque|saldo|sistema|diferenca/) < 0, () => JSON.stringify(c).slice(0, 300));
  r = await post('/api/contagem-material/abrir', { almoxarifado_id:alm }, BIA);
  ok('o almoxarifado com contagem aberta nao abre outra', r.status === 409, () => JSON.stringify(r));
  r = await post('/api/contagem-material/' + cid + '/linha', { componente_id:comando, quantidade:99 }, BIA);
  ok('quem nao abriu nao lanca (uma pessoa)', r.status === 403);

  secao('tubo cortado ainda e material (R-CMP-43)');
  r = await post('/api/contagem-material/' + cid + '/linha', { componente_id:tubo, tipo:'inteiro', medida_m:6, quantidade:15 }, ANA);
  ok('15 barras inteiras de 6 m', r.status === 200, () => JSON.stringify(r.corpo));
  await post('/api/contagem-material/' + cid + '/linha', { componente_id:tubo, tipo:'cortado', medida_m:1.57, quantidade:10 }, ANA);
  await post('/api/contagem-material/' + cid + '/linha', { componente_id:tubo, tipo:'cortado', medida_m:2.4, quantidade:5 }, ANA);
  r = await post('/api/contagem-material/' + cid + '/linha', { componente_id:tubo, tipo:'cortado', quantidade:3 }, ANA);
  ok('cortado sem a medida e recusado', r.status === 400 && /medida/i.test(r.corpo.erro));
  r = await post('/api/contagem-material/' + cid + '/linha', { componente_id:comando, tipo:'cortado', medida_m:1, quantidade:3 }, ANA);
  ok('material que nao e em metro nao tem "cortado"', r.status === 400);
  const c2 = (await get('/api/contagem-material/' + cid, ANA)).corpo;
  const lt = c2.itens.find(i => i.componente_id === tubo);
  ok('quem conta nao faz conta: a tela recebe o total em metro (90 + 15,7 + 12 = 117,7)', Math.abs(lt.contado - 117.7) < 1e-9, () => JSON.stringify(lt));

  secao('a tolerancia aplica sozinha, e acima vai para quem aprova (R-CMP-42)');
  await post('/api/contagem-material/' + cid + '/linha', { componente_id:comando, quantidade:80 }, ANA);
  await post('/api/contagem-material/' + cid + '/linha', { componente_id:fita, quantidade:0 }, ANA);
  r = await post('/api/contagem-material/' + cid + '/terminar', {}, BIA);
  ok('quem nao abriu nao termina', r.status === 403);
  /* entrou material DEPOIS de contar: a diferenca vale sobre o saldo de agora */
  DOM.entrada(db, { componente_id:comando, delta:5, custo_unit:3, referencia:'chegou no meio' });
  r = await post('/api/contagem-material/' + cid + '/terminar', {}, ANA);
  ok('termina', r.status === 200, () => JSON.stringify(r.corpo));
  ok('tubo: 117,7 contra 120 (1,9%) — dentro de 2%: aplicou sozinho', est(tubo) === 117.7, () => est(tubo));
  ok('pelo livro do material, motivo contagem, com quem contou', db.prepare("SELECT usuario_id FROM movimento_componente WHERE componente_id=? AND motivo='contagem'").get(tubo).usuario_id === ANA.id);
  ok('comando: 80 contra 100 (20%) — acima: NAO aplicou, espera aprovacao', est(comando) === 105);
  ok('fita: zero e lancamento valido (10 → 0 vai para aprovacao, nao some)', est(fita) === 10 &&
     db.prepare("SELECT situacao FROM contagem_material_item WHERE componente_id=? AND contagem_id=?").get(fita, cid).situacao === 'pendente');
  const pend = (await get('/api/contagem-material/pendentes', APR)).corpo;
  ok('a fila de aprovacao traz comando e fita', pend.some(p => p.componente_id === comando) && pend.some(p => p.componente_id === fita));
  const pc = pend.find(p => p.componente_id === comando);
  r = await post('/api/contagem-material/itens/' + pc.id + '/aprovar', { motivo:'' }, ANA);
  ok('quem contou nao aprova (outra pessoa)', r.status === 403);
  r = await post('/api/contagem-material/itens/' + pc.id + '/aprovar', { motivo:'' }, APR);
  ok('aprovar sem motivo e recusado', r.status === 400);
  r = await post('/api/contagem-material/itens/' + pc.id + '/aprovar', { motivo:'sumiram 20' }, APR);
  ok('aprovado: aplica a DIFERENCA (−20) sobre o saldo de agora (105 → 85)', r.status === 200 && est(comando) === 85, () => est(comando));
  r = await post('/api/contagem-material/itens/' + pc.id + '/aprovar', { motivo:'de novo' }, APR);
  ok('aprovar de novo e recusado (409)', r.status === 409);
  const pf = pend.find(p => p.componente_id === fita);
  r = await post('/api/contagem-material/itens/' + pf.id + '/rejeitar', { motivo:'contar de novo' }, APR);
  ok('rejeitar nao mexe no saldo', r.status === 200 && est(fita) === 10);
  const L = require('./pendencias_dominio').LINHAS.find(l => l.chave === 'contagem_material');
  ok('a central conta os pendentes pela conta do dominio (zerada)', L && L.contar(db).n === 0);

  secao('o consumo pela contagem (R-CMP-44)');
  let cons = (await get('/api/contagem-material/consumo?componente_id=' + tubo, AG)).corpo;
  ok('com UMA contagem o consumo e null ("nao da pra dizer"), nunca zero', cons.consumo === null && /duas contagens/i.test(cons.motivo), () => JSON.stringify(cons));
  /* segunda contagem, 10 dias depois: entrou 60, contou 150 → consumo 117,7 + 60 − 150 = 27,7 */
  db.prepare("UPDATE contagem_material SET terminada_em=datetime('now','localtime','-10 days') WHERE id=?").run(cid);
  /* tudo o que entrou ANTES da primeira contagem fica antes dela tambem */
  db.prepare("UPDATE movimento_componente SET criado_em=datetime('now','localtime','-11 days') WHERE componente_id=?").run(tubo);
  db.prepare("UPDATE contagem_material_item SET contado_em=datetime('now','localtime','-10 days') WHERE contagem_id=?").run(cid);
  DOM.entrada(db, { componente_id:tubo, delta:60, custo_unit:5, referencia:'compra' });
  const c3 = (await post('/api/contagem-material/abrir', { almoxarifado_id:alm }, BIA)).corpo.id;
  await post('/api/contagem-material/' + c3 + '/linha', { componente_id:tubo, tipo:'inteiro', medida_m:6, quantidade:25 }, BIA);
  await post('/api/contagem-material/' + c3 + '/terminar', {}, BIA);
  cons = (await get('/api/contagem-material/consumo?componente_id=' + tubo, AG)).corpo;
  ok('consumo = anterior + entradas − atual = 117,7 + 60 − 150 = 27,7', Math.abs(cons.consumo - 27.7) < 1e-6, () => JSON.stringify(cons));
  ok('e por dia, sobre os 10 dias', Math.abs(cons.por_dia - 2.77) < 1e-6, () => JSON.stringify(cons));
  ok('material nao contado nesta rodada (comando) nao virou zero', est(comando) === 85);

  secao('o consumo de quem nao tem saldo e a media das compras (R-CMP-45)');
  db.transaction(() => {
    DOM.entrada(db, { componente_id:cafe, delta:6, custo_unit:15, referencia:'compra 1' });
    DOM.movimentar(db, { componente_id:cafe, delta:-6, motivo:'consumo', referencia:'sem saldo' });
  })();
  let mc = (await get('/api/contagem-material/consumo?componente_id=' + cafe, AG)).corpo;
  ok('a media mensal diz de quantos meses saiu', mc.meses != null && mc.meses >= 1 && mc.por_mes > 0, () => JSON.stringify(mc));
  ok('com menos de 3 meses, tarja "pouco historico"', mc.pouco_historico === true);
  db.prepare("UPDATE movimento_componente SET criado_em=datetime('now','localtime','-120 days'), data=date('now','localtime','-120 days') WHERE componente_id=? AND motivo='recebimento'").run(cafe);
  DOM.entrada(db, { componente_id:cafe, delta:6, custo_unit:15, referencia:'compra 2' });
  mc = (await get('/api/contagem-material/consumo?componente_id=' + cafe, AG)).corpo;
  ok('com 4 meses de historia: 12 cafes / 4 meses = 3 por mes, sem tarja', mc.meses === 4 && Math.abs(mc.por_mes - 3) < 1e-9 && mc.pouco_historico === false, () => JSON.stringify(mc));

  secao('a frequencia (R-CMP-42)');
  const venc = (await get('/api/contagem-material/a-contar?almoxarifado_id=' + exp, ANA)).corpo;
  ok('o parafuso nunca contado esta na lista "a contar"', venc.some(v => v.componente_id === parafuso));
  r = await post('/api/contagem-material/abrir', { almoxarifado_id:exp }, null);
  ok('sem login nada grava (401)', r.status === 401);

  fim();
})().catch(e => { console.error(e); process.exit(1); });
