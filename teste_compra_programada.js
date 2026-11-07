#!/usr/bin/env node
/* FASE 7 da spec COMPRAS-E-RECEBIMENTO — a compra programada (R-CMP-46 a 48).
 *
 *   node teste_compra_programada.js
 *
 * ⚠️ ESCRITO ANTES DO CODIGO e conferido reintroduzindo cada defeito. Trava: a
 * lista do mes para quem nao tem saldo (media mensal arredondada para a
 * embalagem da ultima compra); o "pedir ate" pela data; o ponto de pedido e o
 * MAIOR entre o minimo e o calculado pela data, nunca a soma; sempre desconta o
 * que esta a caminho; sem consumo medido nao entra pela data, so pelo minimo;
 * e a sugestao vira pedido em rascunho com um clique.
 */
const { bancada, MODULOS } = require('./util_teste_compras');
const B = bancada({ modulos: MODULOS.concat(['material_route', 'compra_route', 'recebimento_route', 'nota_route', 'almox_route', 'contagem_material_route', 'programada_route']) });
const { db, get, post, ok, fim, secao } = B;
const AG = { id:1, nome:'Lucas', admin_geral:true, permissoes:['alcada.definir'] };
const DOM = require('./componente_dominio');
const P = require('./programada_dominio');

(async () => {
  db.exec('CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, pin_hash TEXT, salt TEXT, areas TEXT, ativo INTEGER DEFAULT 1)');
  const forn = (await post('/api/fornecedores', { nome:'Atacado', prazo_entrega:10 }, AG)).corpo.id;
  const cafe = (await post('/api/componentes', { nome:'Café', unidade:'un', modo_saldo:'sem', vai_ficha:0 }, AG)).corpo.id;
  const ofC = (await post('/api/ofertas', { fornecedor_id:forn, componente_id:cafe, embalagem:'fardo 10', fator:10, preco:150 }, AG)).corpo.id;

  secao('a lista do mes (R-CMP-46)');
  /* compra de 1 fardo (10 cafes) recebida ha 120 dias e outra hoje: 20 em 4 meses = 5/mes */
  const p1 = (await post('/api/pedidos', { itens:[{ oferta_id:ofC, necessidade:10 }] }, AG)).corpo.pedidos[0].id;
  await post('/api/pedidos/' + p1 + '/comprar', { canal:'direto', numero_externo:'1', comprado_em:'2026-07-01' }, AG);
  await post('/api/recebimento', { pedido_id:p1, itens:[{ pedido_item_id:db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(p1).id, chegou_tudo:true }] }, AG);
  db.prepare("UPDATE movimento_componente SET criado_em=datetime('now','localtime','-120 days') WHERE componente_id=? AND motivo='recebimento'").run(cafe);
  const p2 = (await post('/api/pedidos', { itens:[{ oferta_id:ofC, necessidade:10 }] }, AG)).corpo.pedidos[0].id;
  await post('/api/pedidos/' + p2 + '/comprar', { canal:'direto', numero_externo:'2', comprado_em:'2026-11-01' }, AG);
  await post('/api/recebimento', { pedido_id:p2, itens:[{ pedido_item_id:db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(p2).id, chegou_tudo:true }] }, AG);
  let pn = (await get('/api/compras/programada', AG)).corpo;
  const lc = pn.lista_mes.find(x => x.componente_id === cafe);
  ok('o cafe esta na lista do mes', !!lc, () => JSON.stringify(pn));
  ok('media 20 em 4 meses = 5 por mes, e diz de quantos meses', lc && lc.media_mes === 5 && lc.meses === 4, () => JSON.stringify(lc));
  ok('a sugestao sobe para a embalagem da ultima compra: 1 fardo de 10', lc && lc.sugestao === 10 && lc.fator === 10);
  ok('a tela sabe o dia da lista (padrao dia 1)', pn.dia === 1);

  secao('vira pedido com um clique');
  let r = await post('/api/compras/programada/pedido', { itens:[{ componente_id:cafe, quantidade:10 }] }, AG);
  ok('gera um rascunho', r.status === 200 && r.corpo.pedidos.length === 1, () => JSON.stringify(r.corpo));
  const pr = db.prepare('SELECT * FROM pedido_compra WHERE id=?').get(r.corpo.pedidos[0].id);
  ok('em rascunho (editavel), do fornecedor da ultima compra', pr.status === 'rascunho' && pr.fornecedor_id === forn);
  ok('com 1 fardo de 10, ao preco da oferta', db.prepare('SELECT qtd_embalagem, qtd_consumo, preco_unit FROM pedido_item WHERE pedido_id=?').get(pr.id).qtd_consumo === 10);
  r = await post('/api/compras/programada/pedido', { itens:[{ componente_id:cafe, quantidade:0 }] }, AG);
  ok('quantidade zero e recusada', r.status === 400);

  secao('o aviso pela data (R-CMP-47) e o maior, nunca a soma (R-CMP-48)');
  const alm = db.prepare("SELECT id FROM almoxarifado LIMIT 1").get().id;
  const tubo = (await post('/api/componentes', { nome:'Tubo', unidade:'m', modo_saldo:'quantidade', almoxarifado_id:alm, estoque_minimo:30, margem_dias:5 }, AG)).corpo.id;
  const ofT = (await post('/api/ofertas', { fornecedor_id:forn, componente_id:tubo, embalagem:'barra 6 m', fator:6, preco:30 }, AG)).corpo.id;
  DOM.entrada(db, { componente_id:tubo, delta:200, custo_unit:5, referencia:'x' });
  pn = (await get('/api/compras/programada', AG)).corpo;
  ok('sem consumo medido, nao entra pela data — e com 200 de saldo, nem pelo minimo', !pn.pela_data.some(x => x.componente_id === tubo));
  /* duas contagens com 10 dias: consumo 100 m / 10 dias = 10 m/dia; saldo agora 100 */
  const C = require('./contagem_material_dominio');
  const c1 = C.abrir(db, alm, AG).id; C.linha(db, c1, { componente_id:tubo, tipo:'inteiro', medida_m:1, quantidade:200 }, AG); C.terminar(db, c1, AG);
  db.prepare("UPDATE contagem_material_item SET contado_em=datetime('now','localtime','-10 days') WHERE contagem_id=?").run(c1);
  db.prepare("UPDATE movimento_componente SET criado_em=datetime('now','localtime','-11 days') WHERE componente_id=?").run(tubo);   // o que entrou antes da 1a contagem
  DOM.movimentar(db, { componente_id:tubo, delta:-100, motivo:'contagem', referencia:'x' });
  const c2 = C.abrir(db, alm, AG).id; C.linha(db, c2, { componente_id:tubo, tipo:'inteiro', medida_m:1, quantidade:100 }, AG); C.terminar(db, c2, AG);
  pn = (await get('/api/compras/programada', AG)).corpo;
  let lt = pn.pela_data.find(x => x.componente_id === tubo);
  /* 100 m ÷ 10 m/dia = 10 dias; prazo 10 (digitado) + margem 5 = 15 > 10: pedir ate ja passou */
  ok('100 m a 10 m/dia acaba em 10 dias; com prazo 10 e margem 5, ja passou do "pedir ate": entra', !!lt && lt.dias_ate_acabar === 10 && lt.gatilho === 'data', () => JSON.stringify(lt));
  ok('o ponto pela data = 10 m/dia × (10 + 5) = 150', lt && lt.ponto_data === 150);
  ok('o ponto e o MAIOR entre o minimo (30) e o da data (150), nunca a soma (180)', lt && lt.ponto === 150);
  ok('a sugestao enche ate o ponto, na embalagem (150 − 100 = 50 → 9 barras = 54 m)', lt && lt.sugestao === 54, () => JSON.stringify(lt));
  ok('e diz qual prazo valeu (o digitado, sem 3 recebimentos)', lt && lt.prazo_fonte === 'digitado');

  /* o que esta a caminho desconta */
  const p3 = (await post('/api/pedidos', { itens:[{ oferta_id:ofT, necessidade:120 }] }, AG)).corpo.pedidos[0].id;
  await post('/api/pedidos/' + p3 + '/comprar', { canal:'direto', numero_externo:'3', comprado_em:'2026-11-06' }, AG);
  pn = (await get('/api/compras/programada', AG)).corpo;
  lt = pn.pela_data.find(x => x.componente_id === tubo);
  ok('com 120 m a caminho, o disponivel e 220 e o tubo sai da lista (22 dias > 15)', !lt, () => JSON.stringify(lt));
  ok('a conta do "a caminho" e a mesma do dominio', P.aCaminho(db, tubo) === 120);

  /* o minimo maior que a data: o gatilho e o minimo */
  db.prepare('UPDATE componente SET estoque_minimo=400 WHERE id=?').run(tubo);
  pn = (await get('/api/compras/programada', AG)).corpo;
  lt = pn.pela_data.find(x => x.componente_id === tubo);
  ok('minimo 400 contra 220 disponiveis: entra pelo minimo, e o ponto e 400 (o maior)', lt && lt.ponto === 400 && lt.gatilho === 'minimo', () => JSON.stringify(lt));

  r = await post('/api/compras/programada/pedido', { itens:[{ componente_id:cafe, quantidade:5 }] }, null);
  ok('sem login nada grava (401)', r.status === 401);
  fim();
})().catch(e => { console.error(e); process.exit(1); });
