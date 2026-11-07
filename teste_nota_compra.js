#!/usr/bin/env node
/* FASE 4 da spec COMPRAS-E-RECEBIMENTO — nota fiscal e custo (R-CMP-22 a 27).
 *
 *   node teste_nota_compra.js
 *
 * ⚠️ ESCRITO ANTES DO CODIGO e conferido reintroduzindo cada defeito. Trava: o
 * rateio pelo valor; o custo pago e o liquido; no Simples os dois sao iguais; o
 * regime gravado na nota nao muda quando o config muda; a compra sem nota; o
 * custo medio andando pelo LIQUIDO ÷ quantidade recebida; a poda (nota, impostos
 * e parcelas so com custo.ver ou nota.lancar).
 */
const { bancada, MODULOS } = require('./util_teste_compras');
const B = bancada({ modulos: MODULOS.concat(['material_route', 'compra_route', 'recebimento_route', 'nota_route']) });
const { db, get, post, ok, fim, secao } = B;
const AG  = { id:1, nome:'Lucas', admin_geral:true, permissoes:['alcada.definir'] };
const NOT = { id:2, nome:'Nina', permissoes:['nota.lancar','compras.ver'] };
const LEI = { id:3, nome:'Leo', permissoes:['compras.ver'] };
const quase = (a, b) => Math.abs(a - b) < 1e-6;

(async () => {
  db.exec('CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, pin_hash TEXT, salt TEXT, areas TEXT, ativo INTEGER DEFAULT 1)');
  const forn = (await post('/api/fornecedores', { nome:'Metal Sul' }, AG)).corpo.id;
  const tubo = (await post('/api/componentes', { nome:'Tubo 38', unidade:'un', modo_saldo:'quantidade' }, AG)).corpo.id;
  const base = (await post('/api/componentes', { nome:'Base', unidade:'un', modo_saldo:'quantidade' }, AG)).corpo.id;
  const ofT = (await post('/api/ofertas', { fornecedor_id:forn, componente_id:tubo, embalagem:'un', fator:1, preco:10 }, AG)).corpo.id;
  const ofB = (await post('/api/ofertas', { fornecedor_id:forn, componente_id:base, embalagem:'un', fator:1, preco:5 }, AG)).corpo.id;
  const pid = (await post('/api/pedidos', { itens:[{ oferta_id:ofT, necessidade:100 }, { oferta_id:ofB, necessidade:100 }] }, AG)).corpo.pedidos[0].id;
  await post('/api/pedidos/' + pid + '/comprar', { canal:'direto', numero_externo:'OC1', comprado_em:'2026-11-01' }, AG);
  const its = db.prepare('SELECT id, componente_id FROM pedido_item WHERE pedido_id=? ORDER BY id').all(pid);
  const iT = its[0].id, iB = its[1].id;
  await post('/api/recebimento', { pedido_id:pid, itens:[{ pedido_item_id:iT, qtd_contada:100 }, { pedido_item_id:iB, qtd_contada:100 }] }, AG);
  const cm = id => db.prepare('SELECT custo_medio, estoque FROM componente WHERE id=?').get(id);
  ok('antes da nota, o custo medio e o preco do pedido (R$ 10 e R$ 5)', quase(cm(tubo).custo_medio, 10) && quase(cm(base).custo_medio, 5));

  secao('o regime e a tabela de credito (R-CMP-25)');
  ok('o regime vigente nasce Simples Nacional', (await get('/api/notas/regime', NOT)).corpo.vigente === 'simples');
  ok('a tabela de credito nasce com o Simples sem credito nenhum',
     db.prepare("SELECT COUNT(*) n FROM regra_credito WHERE regime='simples' AND aproveita=0").get().n >= 2);

  secao('a nota no Simples: rateio e custo pago = liquido (R-CMP-23, R-CMP-24)');
  /* produtos: tubo R$ 1.000, base R$ 500 = R$ 1.500. Frete do total da nota R$ 150,
     desconto R$ 30: rateados pelo valor (2/3 e 1/3). IPI do tubo R$ 50, ICMS do tubo R$ 120. */
  let r = await post('/api/notas', { pedido_id:pid, numero:'1234', serie:'1', emitente_cnpj:'12.345.678/0001-99', emitente_nome:'Metal Sul',
    emissao:'2026-11-05', frete_total:150, desconto_total:30, itens:[
      { pedido_item_id:iT, descricao:'TUBO 38', ncm:'73063000', cfop:'5102', unidade:'UN', quantidade:100, valor_produto:1000, ipi:50, icms:120 },
      { pedido_item_id:iB, descricao:'BASE', ncm:'73269090', cfop:'5102', unidade:'UN', quantidade:100, valor_produto:500 } ] }, NOT);
  ok('lanca a nota', r.status === 200, () => JSON.stringify(r.corpo));
  const nid = r.corpo.id;
  const nT = db.prepare('SELECT * FROM nota_compra_item WHERE nota_id=? AND pedido_item_id=?').get(nid, iT);
  const nB = db.prepare('SELECT * FROM nota_compra_item WHERE nota_id=? AND pedido_item_id=?').get(nid, iB);
  ok('o frete do total e rateado pelo valor: R$ 100 e R$ 50', quase(nT.frete, 100) && quase(nB.frete, 50), () => nT.frete + ' ' + nB.frete);
  ok('o desconto do total tambem: R$ 20 e R$ 10', quase(nT.desconto, 20) && quase(nB.desconto, 10));
  ok('custo pago do tubo = 1000 − 20 + 100 + 50 (IPI) = 1130 — o ICMS nao entra', quase(nT.custo_pago, 1130), () => nT.custo_pago);
  ok('no Simples o credito e zero: liquido = pago', quase(nT.custo_liquido, 1130) && nT.credito_icms === 0 && nT.credito_ipi === 0);
  ok('os valores do item ficam como vieram (ICMS, IPI, CFOP, NCM)', nT.icms === 120 && nT.ipi === 50 && nT.cfop === '5102' && nT.ncm === '73063000');
  const nota = db.prepare('SELECT * FROM nota_compra WHERE id=?').get(nid);
  ok('a nota grava o regime da data dela', nota.regime === 'simples');

  secao('o custo medio anda pelo LIQUIDO ÷ recebido (R-CMP-26)');
  ok('tubo: 1130 / 100 = R$ 11,30', quase(cm(tubo).custo_medio, 11.3), () => cm(tubo).custo_medio);
  ok('base: (500 − 10 + 50) / 100 = R$ 5,40', quase(cm(base).custo_medio, 5.4), () => cm(base).custo_medio);
  ok('o saldo nao mexe (a nota nao e entrada)', cm(tubo).estoque === 100);

  secao('o regime muda: a nota antiga nao ganha credito retroativo (R-CMP-25)');
  r = await post('/api/notas/regime', { vigente:'real' }, NOT);
  ok('so o Admin Geral muda o regime', r.status === 403);
  r = await post('/api/notas/regras', { regime:'real', imposto:'icms', aproveita:1, vigente_desde:'2026-11-06' }, AG);
  ok('a tabela de credito ganha uma regra (Lucro Real aproveita ICMS)', r.status === 200, () => JSON.stringify(r.corpo));
  await post('/api/notas/regras', { regime:'real', imposto:'ipi', aproveita:1, vigente_desde:'2026-11-06' }, AG);
  r = await post('/api/notas/regime', { vigente:'real' }, AG);
  ok('o Admin Geral muda o regime vigente', r.status === 200 && (await get('/api/notas/regime', NOT)).corpo.vigente === 'real');
  ok('a nota do Simples continua Simples, e o liquido dela nao mudou',
     db.prepare('SELECT regime FROM nota_compra WHERE id=?').get(nid).regime === 'simples' && quase(db.prepare('SELECT custo_liquido FROM nota_compra_item WHERE id=?').get(nT.id).custo_liquido, 1130));

  /* uma nota nova no Lucro Real: credito de ICMS e IPI */
  const pid2 = (await post('/api/pedidos', { itens:[{ oferta_id:ofT, necessidade:100 }] }, AG)).corpo.pedidos[0].id;
  await post('/api/pedidos/' + pid2 + '/comprar', { canal:'direto', numero_externo:'OC2', comprado_em:'2026-11-06' }, AG);
  const i2 = db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pid2).id;
  r = await post('/api/notas', { pedido_id:pid2, numero:'1300', emissao:'2026-11-07', itens:[{ pedido_item_id:i2, quantidade:100, valor_produto:1000, ipi:50, icms:120, icms_st:30 }] }, NOT);
  const n2 = db.prepare('SELECT * FROM nota_compra_item WHERE nota_id=?').get(r.corpo.id);
  ok('no Real: pago = 1000 + 50 + 30 (ST) = 1080', quase(n2.custo_pago, 1080), () => n2.custo_pago);
  ok('credito de ICMS 120 e de IPI 50 (a tabela diz que aproveita)', n2.credito_icms === 120 && n2.credito_ipi === 50);
  ok('liquido = 1080 − 170 = 910', quase(n2.custo_liquido, 910), () => n2.custo_liquido);
  ok('a nota grava "real"', db.prepare('SELECT regime FROM nota_compra WHERE id=?').get(r.corpo.id).regime === 'real');
  /* nota ANTES do recebimento: o recebimento usa o liquido da nota */
  await post('/api/recebimento', { pedido_id:pid2, itens:[{ pedido_item_id:i2, qtd_contada:100 }] }, AG);
  const ult = db.prepare("SELECT custo_unit FROM movimento_componente WHERE componente_id=? AND motivo='recebimento' ORDER BY id DESC").get(tubo).custo_unit;
  ok('recebido depois da nota: entra pelo liquido ÷ recebido (R$ 9,10)', quase(ult, 9.1), () => ult);

  secao('compra sem nota (R-CMP-22)');
  const cafe = (await post('/api/componentes', { nome:'Café', unidade:'un', modo_saldo:'sem', vai_ficha:0 }, AG)).corpo.id;
  const pr = (await post('/api/compras/rapida', { componente_id:cafe, quantidade:6, valor_total:90, canal:'loja_fisica', numero_externo:'cupom 1' }, AG)).corpo.id;
  const ir = db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pr).id;
  r = await post('/api/notas', { pedido_id:pr, sem_nota:true, itens:[{ pedido_item_id:ir, quantidade:6, valor_pago:96 }] }, NOT);
  ok('sem nota e registro, marcado', r.status === 200 && db.prepare('SELECT sem_nota FROM nota_compra WHERE id=?').get(r.corpo.id).sem_nota === 1, () => JSON.stringify(r.corpo));
  const ns = db.prepare('SELECT * FROM nota_compra_item WHERE nota_id=?').get(r.corpo.id);
  ok('o valor pago digitado e o custo pago e o liquido', quase(ns.custo_pago, 96) && quase(ns.custo_liquido, 96));
  r = await post('/api/notas', { pedido_id:pr, sem_nota:true, itens:[{ pedido_item_id:ir, quantidade:6 }] }, NOT);
  ok('sem nota e sem valor pago e recusado', r.status === 400);
  r = await post('/api/notas', { pedido_id:pid, numero:'', itens:[{ pedido_item_id:iT, quantidade:1, valor_produto:1 }] }, NOT);
  ok('nota (com nota) sem numero e recusada', r.status === 400 && /número/i.test(r.corpo.erro));
  r = await post('/api/notas', { pedido_id:pid, numero:'9', itens:[{ pedido_item_id:iT, quantidade:1, valor_produto:-1 }] }, NOT);
  ok('valor negativo e recusado, dizendo o campo', r.status === 400);

  secao('a poda (R-CMP-27)');
  r = await get('/api/notas?pedido_id=' + pid, NOT);
  ok('quem lanca nota le as notas', r.status === 200 && r.corpo.length >= 1);
  const ped = (await get('/api/pedidos/' + pid, LEI)).corpo;
  ok('quem so ve compras NAO recebe as notas no pedido', !('notas' in ped));
  const ped2 = (await get('/api/pedidos/' + pid, NOT)).corpo;
  ok('quem lanca nota recebe as notas no pedido', Array.isArray(ped2.notas) && ped2.notas.length >= 1);
  const fila = JSON.stringify((await get('/api/recebimento/aguardando', AG)).corpo);
  ok('nada da nota vaza para a fila do Recebimento', !/custo|icms|ipi|valor/i.test(fila));
  r = await post('/api/notas', { pedido_id:pid, numero:'1', itens:[{ pedido_item_id:iT, quantidade:1, valor_produto:1 }] }, null);
  ok('sem login nada grava (401)', r.status === 401);

  fim();
})().catch(e => { console.error(e); process.exit(1); });
