#!/usr/bin/env node
/* FASE 3 da spec COMPRAS-E-RECEBIMENTO — o recebimento (R-CMP-28 a 37).
 *
 *   node teste_recebimento.js
 *
 * ⚠️ ESCRITO ANTES DO CODIGO (risco vermelho) e conferido reintroduzindo cada
 * defeito. Trava: o JSON da fila sem preco e sem o esperado (contagem cega); os
 * tres modos; a pesagem obrigatoria e cega na compra por kg; as duas reguas e o
 * pior desvio; as tres faixas; o retido fora do saldo; liberar (aceitar,
 * aceitar e reclamar, devolver) com quem e quando; o custo por unidade
 * RECEBIDA; o fator real; o prazo medido com 3 recebimentos; o "levar para".
 */
const { bancada, MODULOS } = require('./util_teste_compras');
const B = bancada({ modulos: MODULOS.concat(['material_route', 'compra_route', 'recebimento_route']) });
const { db, get, post, ok, fim, secao } = B;

const AG   = { id:1, nome:'Lucas', admin_geral:true, permissoes:['alcada.definir'] };
const REC  = { id:2, nome:'Edu', permissoes:['pedido.ver','pedido.receber','pedido.devolver'] };
const LIB  = { id:3, nome:'Beto', permissoes:['recebimento.liberar','compras.ver'] };

const PRECO = ['preco_unit','preco_pago','preco_unid_compra','valor_previsto','valor','desembolso','custo','custo_unit','preco','frete','valor_pago'];
const ESPERADO = ['qtd_consumo','qtd_declarada','qtd_embalagem','falta_consumo','falta_embalagem','qtd_compra','esperado_nota_kg','esperado_cadastro_kg','peso_padrao_kg'];
function chaves(o, acc){ acc = acc || new Set(); if(Array.isArray(o)) o.forEach(x => chaves(x, acc)); else if(o && typeof o === 'object') for(const k of Object.keys(o)){ acc.add(k); chaves(o[k], acc); } return acc; }

(async () => {
  db.exec('CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, pin_hash TEXT, salt TEXT, areas TEXT, ativo INTEGER DEFAULT 1)');
  for(const p of [AG, REC, LIB]) db.prepare('INSERT OR IGNORE INTO usuarios (id,nome,pin_hash,salt,areas) VALUES (?,?,?,?,?)').run(p.id, p.nome, 'x', 'y', '');
  const alm = db.prepare("SELECT id FROM almoxarifado WHERE nome='Comandos e montagem'").get().id;
  const exp = db.prepare("SELECT id FROM almoxarifado WHERE nome='Expedição'").get().id;
  const forn = (await post('/api/fornecedores', { nome:'Metal Sul', prazo_entrega:15 }, AG)).corpo.id;
  const tubo = (await post('/api/componentes', { nome:'Tubo 38', unidade:'un', modo_saldo:'quantidade', almoxarifado_id:alm, peso_padrao_kg:0.667 }, AG)).corpo.id;
  const cafe = (await post('/api/componentes', { nome:'Café', unidade:'un', modo_saldo:'sem', vai_ficha:0, almoxarifado_id:exp }, AG)).corpo.id;
  const comando = (await post('/api/componentes', { nome:'Comando', unidade:'un', modo_saldo:'quantidade', almoxarifado_id:alm }, AG)).corpo.id;
  const rolo = (await post('/api/componentes', { nome:'Tecido ML 3,20', unidade:'m', modo_saldo:'volume' }, AG)).corpo.id;
  const ofT = (await post('/api/ofertas', { fornecedor_id:forn, componente_id:tubo, embalagem:'barra', fator:1, preco:8 }, AG)).corpo.id;
  const ofC = (await post('/api/ofertas', { fornecedor_id:forn, componente_id:comando, embalagem:'caixa 10', fator:10, preco:50 }, AG)).corpo.id;
  const ofR = (await post('/api/ofertas', { fornecedor_id:forn, componente_id:rolo, embalagem:'rolo', fator:50, preco:400 }, AG)).corpo.id;
  const pedir = async (itens, compra) => {
    const id = (await post('/api/pedidos', { itens }, AG)).corpo.pedidos[0].id;
    await post('/api/pedidos/' + id + '/comprar', Object.assign({ canal:'direto', numero_externo:'N' + id, comprado_em:'2026-10-20' }, compra || {}), AG);
    return id;
  };
  const saldo = id => db.prepare('SELECT estoque, custo_medio FROM componente WHERE id=?').get(id);

  /* pedido A: 400 kg de tubo, declarados 600 tubos, R$ 12,50/kg = R$ 5.000 */
  const pA = await pedir([{ oferta_id:ofT, necessidade:600, unidade_compra:'kg', qtd_compra:400, preco_unid_compra:12.5, qtd_declarada:600 }]);
  const iA = db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pA).id;
  /* pedido B: 2 caixas de comando (20 un) e 6 cafes por compra rapida */
  const pB = await pedir([{ oferta_id:ofC, necessidade:20 }]);
  const iB = db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pB).id;
  const pC = (await post('/api/compras/rapida', { componente_id:cafe, quantidade:6, valor_total:90, canal:'mercado_livre', loja:'Café do Sul', numero_externo:'X1' }, AG)).corpo.id;
  const iC = db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pC).id;
  const pD = await pedir([{ oferta_id:ofR, necessidade:100 }]);
  const iD = db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pD).id;

  secao('a fila: quem recebe nao ve preco nem o esperado (R-CMP-28, R-CMP-29)');
  const fila = (await get('/api/recebimento/aguardando', REC)).corpo;
  const ks = chaves(fila);
  ok('a fila traz os pedidos comprados', fila.some(p => p.id === pA) && fila.some(p => p.id === pC));
  ok('NENHUM campo de preco viaja', PRECO.every(k => !ks.has(k)), () => PRECO.filter(k => ks.has(k)).join(','));
  const itA = fila.find(p => p.id === pA).itens[0];
  ok('o item por quantidade NAO traz o pedido nem o declarado (contagem cega)', ESPERADO.every(k => !(k in itA)), () => Object.keys(itA).join(','));
  ok('o item por kg diz que precisa pesar, sem dizer o peso esperado', itA.pesar === true);
  ok('o item diz o modo', itA.modo_saldo === 'quantidade');
  ok('e o "levar para": o almoxarifado padrao', itA.levar_para && itA.levar_para.id === alm && itA.levar_para.nome === 'Comandos e montagem');
  const itC = fila.find(p => p.id === pC).itens[0];
  ok('o item sem saldo MOSTRA o que foi pedido (para o "chegou tudo")', itC.modo_saldo === 'sem' && itC.pedido === 6);

  secao('a pesagem obrigatoria na compra por kg (R-CMP-30)');
  let r = await post('/api/recebimento', { pedido_id:pA, itens:[{ pedido_item_id:iA, qtd_contada:600 }] }, REC);
  ok('sem os dois pesos o item nao fecha', r.status === 400 && /peso/i.test(r.corpo.erro), () => JSON.stringify(r.corpo));
  r = await post('/api/recebimento', { pedido_id:pA, itens:[{ pedido_item_id:iA, qtd_contada:600, peso_1_kg:0.66 }] }, REC);
  ok('so com um peso tambem nao', r.status === 400);
  ok('e nada entrou no saldo', saldo(tubo).estoque === 0);

  secao('as duas reguas e o pior desvio (R-CMP-31) · as tres faixas (R-CMP-32)');
  /* 600 contados, 10 pesam 6,60 kg: 0,660 por tubo. Nota: 400/600 = 0,6667 → 1,0%.
     Cadastro: 0,667 → 1,05%. Pior = 1,05% -> dentro do aviso (2%): entra. */
  r = await post('/api/recebimento', { pedido_id:pA, itens:[{ pedido_item_id:iA, qtd_contada:600, peso_1_kg:0.66, peso_10_kg:6.6, almoxarifado_id:alm }] }, REC);
  ok('recebe', r.status === 200, () => JSON.stringify(r.corpo));
  let ri = db.prepare('SELECT * FROM recebimento_item WHERE pedido_item_id=? ORDER BY id DESC').get(iA);
  ok('grava o esperado pela nota (400 kg / 600)', Math.abs(ri.esperado_nota_kg - 400 / 600) < 1e-6, () => ri.esperado_nota_kg);
  ok('grava o esperado pelo cadastro (0,667)', ri.esperado_cadastro_kg === 0.667);
  ok('o desvio e o PIOR dos dois (1,05%)', Math.abs(ri.desvio_pct - Math.abs(0.66 - 0.667) / 0.667 * 100) < 0.01, () => ri.desvio_pct);
  ok('faixa ok', ri.faixa === 'ok');
  ok('o fator real e gravado (kg por unidade = 0,66)', Math.abs(ri.fator_real - 0.66) < 1e-9);
  ok('entra no saldo: 600', saldo(tubo).estoque === 600);
  ok('a resposta NAO traz o desvio nem o esperado para quem recebe', !('desvio_pct' in (r.corpo.itens ? r.corpo.itens[0] : {})) && JSON.stringify(r.corpo).indexOf('esperado') < 0);

  secao('o custo e por unidade RECEBIDA (R-CMP-34)');
  ok('R$ 5.000 / 600 = R$ 8,3333 por tubo', Math.abs(saldo(tubo).custo_medio - 5000 / 600) < 1e-4, () => saldo(tubo).custo_medio);

  /* pedido E: 400 kg, declarados 600, mas chegam 610 — retem (passou do declarado).
     A entrega ABAIXO do declarado entra e so e cobrada no fechamento (decisao do
     dono, 07/11/2026): esse caminho e o do teste_revisao_compras.js. */
  const pE = await pedir([{ oferta_id:ofT, necessidade:600, unidade_compra:'kg', qtd_compra:400, preco_unid_compra:12.5, qtd_declarada:600 }]);
  const iE = db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pE).id;
  r = await post('/api/recebimento', { pedido_id:pE, itens:[{ pedido_item_id:iE, qtd_contada:610, peso_1_kg:0.656, peso_10_kg:6.56 }] }, REC);
  ri = db.prepare('SELECT * FROM recebimento_item WHERE pedido_item_id=?').get(iE);
  ok('contagem acima do declarado: RETEM', ri.faixa === 'retido', () => JSON.stringify(ri));
  ok('o retido NAO entra no saldo', saldo(tubo).estoque === 600);
  ok('a resposta a quem recebe diz que ficou retido, sem numero de desvio', r.corpo.retidos === 1);
  ok('o pedido continua aberto (o item nao foi recebido)', db.prepare('SELECT status FROM pedido_compra WHERE id=?').get(pE).status !== 'recebido');

  /* pedido F: peso 3% abaixo do cadastro e da nota: AVISO — entra, e vai para ciencia */
  const pF = await pedir([{ oferta_id:ofT, necessidade:600, unidade_compra:'kg', qtd_compra:400, preco_unid_compra:12.5, qtd_declarada:600 }]);
  const iF = db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pF).id;
  await post('/api/recebimento', { pedido_id:pF, itens:[{ pedido_item_id:iF, qtd_contada:600, peso_1_kg:0.647, peso_10_kg:6.47 }] }, REC);
  const rF = db.prepare('SELECT * FROM recebimento_item WHERE pedido_item_id=?').get(iF);
  ok('desvio entre 2% e 5%: AVISO', rF.faixa === 'aviso', () => rF.faixa + ' ' + rF.desvio_pct);
  ok('o aviso ENTRA no saldo', saldo(tubo).estoque === 1200);

  /* pedido G: peso 10% abaixo: RETEM, mesmo com a contagem certa */
  const pG = await pedir([{ oferta_id:ofT, necessidade:600, unidade_compra:'kg', qtd_compra:400, preco_unid_compra:12.5, qtd_declarada:600 }]);
  const iG = db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pG).id;
  await post('/api/recebimento', { pedido_id:pG, itens:[{ pedido_item_id:iG, qtd_contada:600, peso_1_kg:0.6, peso_10_kg:6.0 }] }, REC);
  const rG = db.prepare('SELECT * FROM recebimento_item WHERE pedido_item_id=?').get(iG);
  ok('acima de 5%: RETEM (o fornecedor faturou 400 kg e mandou 360)', rG.faixa === 'retido');
  ok('e nao entra', saldo(tubo).estoque === 1200);

  /* sem cadastro de peso E sem historico: a regua da nota funciona sozinha */
  const tubo41 = (await post('/api/componentes', { nome:'Tubo 41', unidade:'un', modo_saldo:'quantidade', almoxarifado_id:alm }, AG)).corpo.id;
  const of41 = (await post('/api/ofertas', { fornecedor_id:forn, componente_id:tubo41, embalagem:'barra', fator:1, preco:8 }, AG)).corpo.id;
  const pH = await pedir([{ oferta_id:of41, necessidade:600, unidade_compra:'kg', qtd_compra:400, preco_unid_compra:12.5, qtd_declarada:600 }]);
  const iH = db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pH).id;
  await post('/api/recebimento', { pedido_id:pH, itens:[{ pedido_item_id:iH, qtd_contada:600, peso_1_kg:0.6, peso_10_kg:6.0 }] }, REC);
  const rH = db.prepare('SELECT * FROM recebimento_item WHERE pedido_item_id=?').get(iH);
  ok('sem peso no cadastro nem historico, a regua da nota pega sozinha (10% → retido)', rH.esperado_cadastro_kg == null && rH.faixa === 'retido', () => JSON.stringify(rH));

  secao('o retido sai com um toque, nunca fica preso (R-CMP-33)');
  const ret = (await get('/api/recebimento/retidos', LIB)).corpo;
  ok('a lista de retidos traz os tres', [iE, iG, iH].every(id => ret.itens.some(x => x.pedido_item_id === id)), () => JSON.stringify(ret).slice(0, 300));
  ok('e a de avisos para dar ciencia traz o do pedido F', ret.avisos.some(x => x.pedido_item_id === iF));
  const idE = (ret.itens.find(x => x.pedido_item_id === iE) || {}).id;
  r = await post('/api/recebimento/itens/' + idE + '/decidir', { decisao:'aceitar' }, LIB);
  ok('decidir sem motivo e recusado', r.status === 400 && /motivo/i.test(r.corpo.erro));
  r = await post('/api/recebimento/itens/' + idE + '/decidir', { decisao:'ignorar', motivo:'x' }, LIB);
  ok('decisao fora da lista e recusada', r.status === 400);
  r = await post('/api/recebimento/itens/' + idE + '/decidir', { decisao:'aceitar', motivo:'10 a mais, aceito' }, LIB);
  ok('aceitar entra no saldo: +610', r.status === 200 && saldo(tubo).estoque === 1810, () => JSON.stringify(r.corpo) + ' ' + saldo(tubo).estoque);
  const dE = db.prepare('SELECT * FROM recebimento_item WHERE id=?').get(idE);
  ok('grava quem, quando e o motivo', dE.decisao === 'aceitar' && dE.decidido_por === 'Beto' && dE.decidido_por_id === LIB.id && dE.decidido_em && dE.motivo_decisao);
  const custoE = db.prepare("SELECT custo_unit FROM movimento_componente WHERE componente_id=? ORDER BY id DESC").get(tubo).custo_unit;
  ok('e o custo do aceito e por RECEBIDO: R$ 5.000 / 610 (nao / 600)', Math.abs(custoE - 5000 / 610) < 1e-6, () => custoE);
  r = await post('/api/recebimento/itens/' + idE + '/decidir', { decisao:'aceitar', motivo:'de novo' }, LIB);
  ok('decidir de novo e recusado (409)', r.status === 409);
  const idG = (ret.itens.find(x => x.pedido_item_id === iG) || {}).id;
  r = await post('/api/recebimento/itens/' + idG + '/decidir', { decisao:'devolver', motivo:'tubo fino', motivo_devolucao:'defeito' }, LIB);
  ok('devolver: nada entra, e o item fica devendo (a caminho)', r.status === 200 && saldo(tubo).estoque === 1810
     && db.prepare('SELECT qtd_devolvida FROM recebimento_item WHERE id=?').get(idG).qtd_devolvida === 600
     && db.prepare("SELECT status FROM pedido_item WHERE id=?").get(iG).status !== 'recebido');
  const idH = (ret.itens.find(x => x.pedido_item_id === iH) || {}).id;
  r = await post('/api/recebimento/itens/' + idH + '/decidir', { decisao:'aceitar_reclamar', motivo:'aceito e cobro desconto' }, LIB);
  ok('aceitar e reclamar: entra, e fica marcado para cobrar o fornecedor', r.status === 200 && saldo(tubo41).estoque === 600
     && db.prepare('SELECT decisao FROM recebimento_item WHERE id=?').get(idH).decisao === 'aceitar_reclamar');
  const idF = (ret.avisos.find(x => x.pedido_item_id === iF) || {}).id;
  r = await post('/api/recebimento/itens/' + idF + '/ciencia', { motivo:'' }, LIB);
  ok('dar ciencia do aviso: grava quem e quando, e nao mexe no saldo', r.status === 200 && saldo(tubo).estoque === 1810 && db.prepare('SELECT decisao FROM recebimento_item WHERE id=?').get(idF).decisao === 'ciente');
  const L = require('./pendencias_dominio').LINHAS;
  ok('a central conta retidos e avisos pela conta do dominio (zerados agora)', L.find(l => l.chave === 'recebimento_retido').contar(db).n === 0 && L.find(l => l.chave === 'recebimento_aviso').contar(db).n === 0);
  r = await post('/api/recebimento/itens/' + idF + '/decidir', { decisao:'aceitar', motivo:'x' }, null);
  ok('sem login nada grava (401)', r.status === 401);

  secao('os outros dois modos (R-CMP-29)');
  r = await post('/api/recebimento', { pedido_id:pC, itens:[{ pedido_item_id:iC, chegou_tudo:true }] }, REC);
  ok('sem saldo: "chegou tudo" recebe o que foi pedido', r.status === 200 && db.prepare('SELECT qtd_recebida FROM pedido_item WHERE id=?').get(iC).qtd_recebida === 6, () => JSON.stringify(r.corpo));
  ok('e o pedido fecha', db.prepare('SELECT status FROM pedido_compra WHERE id=?').get(pC).status === 'recebido');
  ok('o custo do cafe: R$ 90 / 6 = R$ 15', Math.abs(saldo(cafe).custo_medio - 15) < 1e-9);
  r = await post('/api/recebimento', { pedido_id:pB, itens:[{ pedido_item_id:iB, qtd_contada:18 }] }, REC);
  ok('por quantidade sem kg: conta 18 comandos (de 20) e entra, parcial', r.status === 200 && saldo(comando).estoque === 18 && db.prepare('SELECT status FROM pedido_compra WHERE id=?').get(pB).status === 'parcial');
  ok('o custo do comando: R$ 50 a caixa de 10 = R$ 5', Math.abs(saldo(comando).custo_medio - 5) < 1e-9);
  r = await post('/api/recebimento', { pedido_id:pD, itens:[{ pedido_item_id:iD, qtd_contada:100 }] }, REC);
  ok('por volume: sem a lista de volumes e recusado', r.status === 400 && /volume/i.test(r.corpo.erro));
  r = await post('/api/recebimento', { pedido_id:pD, itens:[{ pedido_item_id:iD, volumes:[{ metragem:50 }, { metragem:49.5 }] }] }, REC);
  ok('por volume: um registro por volume, a metragem da etiqueta do fornecedor (99,5 m)', r.status === 200 && saldo(rolo).estoque === 99.5, () => JSON.stringify(r.corpo) + saldo(rolo).estoque);
  r = await post('/api/recebimento', { pedido_id:pB, itens:[{ pedido_item_id:iB, qtd_contada:-1 }] }, REC);
  ok('contagem negativa e recusada', r.status === 400);

  secao('o "levar para" grava o lugar real (R-CMP-37)');
  const rB = db.prepare('SELECT almoxarifado_id FROM recebimento_item WHERE pedido_item_id=?').get(iB);
  ok('sem escolher, vale o padrao do material', rB.almoxarifado_id === alm);
  ok('escolhido, vale o escolhido (nao e trava)', db.prepare('SELECT almoxarifado_id FROM recebimento_item WHERE pedido_item_id=?').get(iA).almoxarifado_id === alm);

  secao('o prazo do fornecedor e medido (R-CMP-36)');
  let pz = (await get('/api/compras/prazo?fornecedor_id=' + forn, AG)).corpo;
  ok('com 3 ou mais recebimentos, vale o medido', pz.fonte === 'medido' && pz.n >= 3, () => JSON.stringify(pz));
  ok('e ele e a media de dias entre a compra e o recebimento', pz.dias > 0);
  const forn2 = (await post('/api/fornecedores', { nome:'Novo', prazo_entrega:9 }, AG)).corpo.id;
  pz = (await get('/api/compras/prazo?fornecedor_id=' + forn2, AG)).corpo;
  ok('abaixo de 3, vale o digitado, e diz qual', pz.fonte === 'digitado' && pz.dias === 9, () => JSON.stringify(pz));
  const pzc = (await get('/api/compras/prazo?componente_id=' + tubo, AG)).corpo;
  ok('o prazo tambem se mede por material', pzc.fonte === 'medido');

  secao('o fator real vira historico (R-CMP-35)');
  const fx = require('./recebimento_dominio').fatorMedio(db, tubo);
  ok('a media dos fatores medidos do material', fx && fx.n >= 4 && fx.kg_por_unidade > 0.6 && fx.kg_por_unidade < 0.7, () => JSON.stringify(fx));

  fim();
})().catch(e => { console.error(e); process.exit(1); });
