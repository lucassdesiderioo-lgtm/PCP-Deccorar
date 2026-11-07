#!/usr/bin/env node
/* A REVISÃO DO PR #305 (COMPRAS-E-RECEBIMENTO), 07/11/2026.
 *
 *   node teste_revisao_compras.js
 *
 * Etapa ③ REVISÃO do protocolo (CLAUDE.md §0): os agentes acharam furos que os
 * testes das fases não pegavam, o verificador confirmou cada um, e cada caso
 * abaixo foi ESCRITO ANTES do conserto e conferido reprovando sem ele.
 */
const fs = require('fs'), path = require('path');
const { bancada, MODULOS } = require('./util_teste_compras');
const B = bancada({ modulos: MODULOS.concat(['material_route', 'compra_route', 'recebimento_route', 'nota_route', 'almox_route', 'programada_route', 'contagem_material_route', 'teste_route']) });
const { db, get, post, ok, fim, secao, chamar } = B;

const AG   = { id:1, nome:'Lucas', admin_geral:true, permissoes:['alcada.definir'] };
const REC  = { id:2, nome:'Edu', permissoes:['pedido.ver','pedido.receber','pedido.devolver'] };
const SUP  = { id:3, nome:'Sup', permissoes:['compras.ver'] };
const NOTA = { id:4, nome:'Nina', permissoes:['nota.lancar','pedido.ver'] };

function chaves(o, acc){ acc = acc || new Set(); if(Array.isArray(o)) o.forEach(x => chaves(x, acc)); else if(o && typeof o === 'object') for(const k of Object.keys(o)){ acc.add(k); chaves(o[k], acc); } return acc; }
const DINHEIRO_OU_ESPERADO = /^(valor|preco|desembolso|frete|desconto|custo|qtd_|alcada)/;

(async () => {
  db.exec('CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, pin_hash TEXT, salt TEXT, areas TEXT, ativo INTEGER DEFAULT 1)');
  for(const p of [AG, REC, SUP, NOTA]) db.prepare('INSERT OR IGNORE INTO usuarios (id,nome,pin_hash,salt,areas) VALUES (?,?,?,?,?)').run(p.id, p.nome, 'x', 'y', '');
  const alm = db.prepare("SELECT id FROM almoxarifado WHERE nome='Comandos e montagem'").get().id;
  const forn = (await post('/api/fornecedores', { nome:'Metal Sul', prazo_entrega:15 }, AG)).corpo.id;
  const tubo = (await post('/api/componentes', { nome:'Tubo 38', unidade:'un', modo_saldo:'quantidade', almoxarifado_id:alm, peso_padrao_kg:0.667 }, AG)).corpo.id;
  const ofT = (await post('/api/ofertas', { fornecedor_id:forn, componente_id:tubo, embalagem:'barra', fator:1, preco:8 }, AG)).corpo.id;
  await post('/api/compras/alcadas', { usuario_id:1, limite:5000 }, AG);
  const pedir = async (itens, compra) => {
    const id = (await post('/api/pedidos', { itens }, AG)).corpo.pedidos[0].id;
    await post('/api/pedidos/' + id + '/comprar', Object.assign({ canal:'direto', numero_externo:'N' + id, comprado_em:'2026-10-20' }, compra || {}), AG);
    return id;
  };

  secao('o pedido pelo fio: quem só recebe não lê preço, declarado, kg nem alçada (R-CMP-28/29/30)');
  const pA = await pedir([{ oferta_id:ofT, necessidade:600, unidade_compra:'kg', qtd_compra:400, preco_unid_compra:12.5, qtd_declarada:600 }]);
  let r = await get('/api/pedidos/' + pA, REC);
  const kRec = [...chaves(r.corpo)].filter(k => DINHEIRO_OU_ESPERADO.test(k));
  ok('GET /api/pedidos/:id a quem só recebe: abre (o nome dos itens), sem dinheiro e sem o esperado', r.status === 200 && kRec.length === 0, () => r.status + ' ' + kRec.join(','));
  r = await get('/api/pedidos', REC);
  const kLis = [...chaves(r.corpo)].filter(k => DINHEIRO_OU_ESPERADO.test(k));
  ok('a lista de pedidos a quem só recebe: sem valor', r.status === 200 && kLis.length === 0, () => kLis.join(','));
  r = await get('/api/pedidos/' + pA + '/whatsapp', REC);
  ok('o texto de WhatsApp (que tem preço) é recusado a quem só recebe', r.status === 403, () => r.status);
  r = await get('/api/pedidos/' + pA, SUP);
  ok('quem vê compras continua vendo o pedido inteiro', r.status === 200 && r.corpo.valor_previsto > 0 && r.corpo.itens[0].qtd_declarada === 600, () => JSON.stringify(r.corpo).slice(0, 200));

  secao('os anexos da nota só para quem vê a nota (R-CMP-27)');
  const b64 = Buffer.from('<nfe><ICMS>123,45</ICMS></nfe>').toString('base64');
  const anX = (await post('/api/compras/anexos', { pedido_id:pA, tipo:'xml', nome:'nota.xml', base64:b64 }, AG)).corpo.id;
  const anO = (await post('/api/compras/anexos', { pedido_id:pA, tipo:'orcamento', nome:'orc.pdf', base64:Buffer.from('orc').toString('base64') }, AG)).corpo.id;
  r = await get('/api/compras/anexos/' + anX, SUP);
  ok('o XML da nota é recusado a quem só vê compras (sem custo.ver nem nota.lancar)', r.status === 403, () => r.status);
  r = await get('/api/compras/anexos?pedido_id=' + pA, SUP);
  ok('e a lista não mostra o XML a ele (o orçamento continua)', Array.isArray(r.corpo) && !r.corpo.some(a => a.id === anX) && r.corpo.some(a => a.id === anO), () => JSON.stringify(r.corpo));
  r = await get('/api/compras/anexos/' + anO, SUP);
  ok('o orçamento ele baixa', r.status === 200);
  r = await get('/api/compras/anexos/' + anX, NOTA);
  ok('quem lança nota baixa o XML', r.status === 200);

  secao('endereço criado, renomeado ou desativado grava quem fez (§10)');
  const aud = [];
  B.app.locals.acesso.auditar = (req, cat, acao, alvo, det) => aud.push({ quem:req.usuario && req.usuario.nome, cat, acao, alvo, det });
  r = await post('/api/almoxarifados/' + alm + '/enderecos', { haste:'H9', andares:['A1'], niveis:['N1'] }, AG);
  ok('criar endereço responde', r.status === 200, () => JSON.stringify(r.corpo));
  ok('e criar endereço vira linha na auditoria, com quem', aud.some(x => x.cat === 'almoxarifado' && x.quem === 'Lucas' && /enderecos/.test(x.acao)), () => JSON.stringify(aud));
  const nv = db.prepare("SELECT n.id FROM alm_nivel n JOIN alm_andar d ON d.id=n.andar_id JOIN alm_haste h ON h.id=d.haste_id WHERE h.nome='H9'").get().id;
  aud.length = 0;
  r = await post('/api/enderecos/nivel/' + nv, { nome:'N1b' }, AG);
  ok('renomear o nível vira linha na auditoria', r.status === 200 && aud.some(x => x.cat === 'almoxarifado' && /enderecos\/:tipo/.test(x.acao)), () => r.status + JSON.stringify(aud));
  aud.length = 0;
  r = await post('/api/enderecos/nivel/' + nv, { ativo:false }, AG);
  ok('desativar o nível vira linha na auditoria', r.status === 200 && aud.length === 1, () => r.status + JSON.stringify(aud));

  secao('a nota que chega DEPOIS corrige o custo do material sem saldo (o cafe)');
  const cafe = (await post('/api/componentes', { nome:'Cafe 500g', unidade:'un', modo_saldo:'sem', vai_ficha:0 }, AG)).corpo.id;
  const ofC = (await post('/api/ofertas', { fornecedor_id:forn, componente_id:cafe, embalagem:'un', fator:1, preco:10 }, AG)).corpo.id;
  const pC = await pedir([{ oferta_id:ofC, necessidade:10 }]);
  const iC = db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pC).id;
  r = await post('/api/recebimento', { pedido_id:pC, itens:[{ pedido_item_id:iC, chegou_tudo:true }] }, AG);
  const cm = () => db.prepare('SELECT custo_medio FROM componente WHERE id=?').get(cafe).custo_medio;
  ok('recebido pelo pedido: R$ 10', r.status === 200 && Math.abs(cm() - 10) < 1e-6, () => JSON.stringify(r.corpo) + ' ' + cm());
  r = await post('/api/notas', { pedido_id:pC, numero:'7701', emissao:'2026-11-07', itens:[{ pedido_item_id:iC, quantidade:10, valor_produto:120 }] }, AG);
  ok('a nota cobrou R$ 120 por 10: o custo medio do cafe vira R$ 12 (sem saldo nao e "nada a corrigir")', r.status === 200 && Math.abs(cm() - 12) < 1e-6, () => r.status + ' ' + cm());

  secao('a nota do pedido inteiro, com so metade recebida, nao dobra o custo da unidade');
  const parafuso = (await post('/api/componentes', { nome:'Parafuso 4x40', unidade:'un', modo_saldo:'quantidade', almoxarifado_id:alm }, AG)).corpo.id;
  const ofP = (await post('/api/ofertas', { fornecedor_id:forn, componente_id:parafuso, embalagem:'un', fator:1, preco:8 }, AG)).corpo.id;
  const pP = await pedir([{ oferta_id:ofP, necessidade:100 }]);
  const iP = db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pP).id;
  await post('/api/recebimento', { pedido_id:pP, itens:[{ pedido_item_id:iP, qtd_contada:50 }] }, AG);
  r = await post('/api/notas', { pedido_id:pP, numero:'7702', emissao:'2026-11-07', itens:[{ pedido_item_id:iP, quantidade:100, valor_produto:1000 }] }, AG);
  const cP = db.prepare('SELECT custo_medio FROM componente WHERE id=?').get(parafuso).custo_medio;
  ok('nota de 100 por R$ 1000 com 50 recebidos: cada parafuso custa R$ 10, e nao R$ 20', r.status === 200 && Math.abs(cP - 10) < 1e-6, () => r.status + ' ' + cP);

  secao('o pedido esperando aprovacao nao conta como "a caminho" na compra programada');
  const P = require('./programada_dominio');
  const fita = (await post('/api/componentes', { nome:'Fita dupla face', unidade:'un', modo_saldo:'quantidade', almoxarifado_id:alm, estoque_minimo:50 }, AG)).corpo.id;
  const ofF = (await post('/api/ofertas', { fornecedor_id:forn, componente_id:fita, embalagem:'un', fator:1, preco:10 }, AG)).corpo.id;
  const pF = (await post('/api/pedidos', { itens:[{ oferta_id:ofF, necessidade:1000 }] }, AG)).corpo.pedidos[0].id;
  r = await post('/api/pedidos/' + pF + '/comprar', { canal:'direto', numero_externo:'NF1', comprado_em:'2026-10-20' }, AG);
  ok('R$ 10.000 passa da alcada de R$ 5.000: espera aprovacao', db.prepare('SELECT status FROM pedido_compra WHERE id=?').get(pF).status === 'aguardando_aprovacao', () => JSON.stringify(r.corpo));
  ok('e o a caminho da fita e zero (o Recebimento nem o mostra)', P.aCaminho(db, fita) === 0, () => P.aCaminho(db, fita));
  ok('entao a fita aparece para comprar pelo minimo', P.pelaData(db).some(x => x.componente_id === fita), () => JSON.stringify(P.pelaData(db).map(x => x.nome)));

  secao('o modo de saldo nao muda com saldo, e o tecido de antes vira volume ETIQUETADO na 504 (decisao do dono)');
  const tec = (await post('/api/componentes', { nome:'Blackout areia 3,20', unidade:'m', modo_saldo:'quantidade', familia:'BLACKOUT', cor:'AREIA', largura_bobina_cm:320, almoxarifado_id:alm }, AG)).corpo.id;
  require('./componente_dominio').movimentar(db, { componente_id:tec, delta:120, motivo:'ajuste', referencia:'saldo de antes' });
  r = await post('/api/componentes', { id:tec, modo_saldo:'volume' }, AG);
  ok('com saldo, trocar para "por volume" e recusado, dizendo o caminho (a 504)', r.status === 400 && /504|etiquet/i.test(r.corpo.erro || ''), () => JSON.stringify(r));
  ok('e o modo continua "quantidade"', db.prepare('SELECT modo_saldo FROM componente WHERE id=?').get(tec).modo_saldo === 'quantidade');
  const APR = { id:6, nome:'Aprova', permissoes:['contagem.aprovar'] };
  r = await get('/api/contagem-material/a-etiquetar', APR);
  ok('a 504 lista o tecido de saldo antigo a etiquetar, sem o saldo (contagem cega)', r.status === 200 && r.corpo.some(x => x.id === tec) && ![...chaves(r.corpo)].some(k => /estoque|saldo/.test(k)), () => JSON.stringify(r.corpo));
  r = await post('/api/contagem-material/etiquetar', { componente_id:tec, volumes:[{ metragem:50 }, { metragem:0 }] }, APR);
  ok('metragem zero e recusada, e nada muda', r.status === 400 && db.prepare('SELECT modo_saldo FROM componente WHERE id=?').get(tec).modo_saldo === 'quantidade');
  r = await post('/api/contagem-material/etiquetar', { componente_id:tec, volumes:[{ metragem:50 }, { metragem:48.5 }] }, APR);
  const tc = db.prepare('SELECT modo_saldo, estoque FROM componente WHERE id=?').get(tec);
  ok('etiquetado: vira "por volume", com dois volumes', r.status === 200 && tc.modo_saldo === 'volume' && db.prepare("SELECT COUNT(*) n FROM volume_material WHERE componente_id=? AND situacao<>'encerrado'").get(tec).n === 2, () => JSON.stringify(r.corpo) + JSON.stringify(tc));
  ok('o saldo passa a ser a soma dos volumes (98,5), e a diferenca fica no livro com quem', Math.abs(tc.estoque - 98.5) < 1e-6
     && db.prepare("SELECT usuario_nome FROM movimento_componente WHERE componente_id=? AND motivo='contagem' ORDER BY id DESC").get(tec).usuario_nome === 'Aprova');
  r = await post('/api/contagem-material/etiquetar', { componente_id:tec, volumes:[{ metragem:10 }] }, APR);
  ok('etiquetar de novo e recusado (ja e por volume)', r.status === 400);

  secao('o modo teste cobre as tabelas novas da Compras (o que nasce em teste sai no "apagar tudo")');
  r = await get('/api/teste', AG);
  const cob = Object.keys((r.corpo && r.corpo.rotulos) || {});
  const NOVAS = ['volume_material','volume_evento','contagem_material','contagem_material_item','contagem_material_linha','nota_compra','nota_compra_item','pagamento_parcela','compra_anexo'];
  ok('as nove tabelas novas tem o gatilho do modo teste', NOVAS.every(t => cob.indexOf(t) >= 0) && !(r.corpo.naoCobertas || []).some(x => NOVAS.indexOf(x.tabela) >= 0), () => NOVAS.filter(t => cob.indexOf(t) < 0).join(',') + ' ' + JSON.stringify(r.corpo.naoCobertas));
  ok('e a nota baixada da Receita NAO (o NSU ja passou: apagada, ela nao volta)', cob.indexOf('dfe_documento') < 0);

  secao('compra por kg em partes: a parcial entra; a diferenca do declarado so e cobrada no fechamento (decisao do dono)');
  const t2 = (await post('/api/componentes', { nome:'Tubo 56', unidade:'un', modo_saldo:'quantidade', almoxarifado_id:alm }, AG)).corpo.id;
  const of2 = (await post('/api/ofertas', { fornecedor_id:forn, componente_id:t2, embalagem:'barra', fator:1, preco:8 }, AG)).corpo.id;
  const pK = await pedir([{ oferta_id:of2, necessidade:600, unidade_compra:'kg', qtd_compra:400, preco_unid_compra:12.5, qtd_declarada:600 }]);
  const iK = db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pK).id;
  const sd = () => db.prepare('SELECT estoque, custo_medio FROM componente WHERE id=?').get(t2);
  r = await post('/api/recebimento', { pedido_id:pK, itens:[{ pedido_item_id:iK, qtd_contada:300, peso_1_kg:0.667, peso_10_kg:6.67 }] }, AG);
  let rk = db.prepare('SELECT * FROM recebimento_item WHERE pedido_item_id=? ORDER BY id DESC').get(iK);
  ok('a primeira metade (300 de 600, peso certo) ENTRA, sem reter', r.status === 200 && rk.faixa === 'ok' && sd().estoque === 300, () => JSON.stringify(rk));
  ok('o peso e conferido pela regua da nota proporcional (400 kg / 600 = 0,667 por tubo)', Math.abs(rk.esperado_nota_kg - 400 / 600) < 1e-3, () => rk.esperado_nota_kg);
  ok('e o custo e pelo declarado: R$ 5.000 / 600 (nao / 300)', Math.abs(sd().custo_medio - 5000 / 600) < 1e-4, () => sd().custo_medio);
  ok('o pedido fica parcial (o resto segue a caminho)', db.prepare('SELECT status FROM pedido_compra WHERE id=?').get(pK).status === 'parcial');
  r = await post('/api/recebimento', { pedido_id:pK, itens:[{ pedido_item_id:iK, qtd_contada:290, peso_1_kg:0.678, peso_10_kg:6.78 }] }, AG);
  rk = db.prepare('SELECT * FROM recebimento_item WHERE pedido_item_id=? ORDER BY id DESC').get(iK);
  ok('a segunda entrega (290) entra tambem: 590 de 600, sem reter', r.status === 200 && rk.faixa === 'ok' && sd().estoque === 590, () => JSON.stringify(rk));
  r = await post('/api/pedidos/' + pK + '/fechar', { motivo:'fornecedor não vai entregar' }, AG);
  ok('fechar com falta responde', r.status === 200, () => JSON.stringify(r));
  const retK = (await get('/api/recebimento/retidos', AG)).corpo.itens.filter(x => x.pedido_item_id === iK);
  ok('e a diferenca (590 de 600 declarados) vai para quem libera decidir', retK.length === 1 && retK[0].qtd_contada === 590 && retK[0].qtd_declarada === 600, () => JSON.stringify(retK));
  ok('o kg inteiro chegou (400): cada tubo passa a custar R$ 5.000 / 590 (R-CMP-34)', Math.abs(sd().custo_medio - 5000 / 590) < 1e-4, () => sd().custo_medio);
  r = await post('/api/recebimento/itens/' + retK[0].id + '/decidir', { decisao:'aceitar_reclamar', motivo:'cobrar os 10 tubos' }, AG);
  ok('decidir a diferenca nao mexe no saldo (o que chegou ja entrou)', r.status === 200 && sd().estoque === 590, () => JSON.stringify(r) + sd().estoque);
  const pX = await pedir([{ oferta_id:of2, necessidade:600, unidade_compra:'kg', qtd_compra:400, preco_unid_compra:12.5, qtd_declarada:600 }]);
  const iX = db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pX).id;
  r = await post('/api/recebimento', { pedido_id:pX, itens:[{ pedido_item_id:iX, qtd_contada:610, peso_1_kg:0.656, peso_10_kg:6.56 }] }, AG);
  ok('a entrega que passa do declarado (610 de 600) RETEM na hora', r.corpo.retidos === 1, () => JSON.stringify(r.corpo));

  fim();
})().catch(e => { console.error(e); process.exit(1); });
