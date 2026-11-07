#!/usr/bin/env node
/* FASE 5 da spec COMPRAS-E-RECEBIMENTO — almoxarifados e volumes (R-CMP-06,
 * R-CMP-38 a 41).
 *
 *   node teste_almoxarifado.js
 *
 * ⚠️ ESCRITO ANTES DO CODIGO e conferido reintroduzindo cada defeito. Trava: o
 * endereco haste -> andar -> nivel por almoxarifado; o volume nascendo no
 * recebimento, um por volume, com etiqueta (M-000001); "um por nivel" recusando
 * o nivel ocupado e dizendo qual volume esta la; mover por bipe; abrir o rolo
 * do ML encerra o volume e lanca a saida do saldo inteiro; o saldo do material
 * por volume e a soma dos volumes nao encerrados; a etiqueta em PDF.
 */
const { bancada, MODULOS } = require('./util_teste_compras');
const B = bancada({ modulos: MODULOS.concat(['material_route', 'compra_route', 'recebimento_route', 'nota_route', 'almox_route']) });
const { db, get, post, del, ok, fim, secao } = B;
const AG  = { id:1, nome:'Lucas', admin_geral:true, permissoes:['alcada.definir'] };
const OP  = { id:2, nome:'Edu', permissoes:['volume.movimentar','pedido.receber','pedido.ver'] };
const CAD = { id:3, nome:'Cris', permissoes:['almoxarifado.cadastrar'] };

(async () => {
  db.exec('CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, pin_hash TEXT, salt TEXT, areas TEXT, ativo INTEGER DEFAULT 1)');
  const alm = (await post('/api/almoxarifados', { nome:'Tecidos ML' }, AG)).corpo.id;

  secao('o endereco: haste -> andar -> nivel (R-CMP-38)');
  let r = await post('/api/almoxarifados/' + alm + '/enderecos', { haste:'H1', andares:['A1','A2'], niveis:['N1','N2'] }, CAD);
  ok('cria a haste H1 com 2 andares de 2 niveis', r.status === 200 && r.corpo.niveis === 4, () => JSON.stringify(r.corpo));
  r = await post('/api/almoxarifados/' + alm + '/enderecos', { haste:'H1', andares:['A1'], niveis:['N1'] }, CAD);
  ok('repetir o mesmo endereco nao duplica', r.status === 200 && db.prepare('SELECT COUNT(*) n FROM alm_nivel').get().n === 4);
  r = await post('/api/almoxarifados/' + alm + '/enderecos', { haste:'', andares:['A1'], niveis:['N1'] }, CAD);
  ok('haste sem nome e recusada', r.status === 400);
  const end = (await get('/api/almoxarifados/' + alm + '/enderecos', OP)).corpo;
  ok('a arvore volta com o nome completo e o codigo de bipe de cada nivel', end.niveis.length === 4 && end.niveis.every(n => /^E-\d{6}$/.test(n.codigo) && /Tecidos ML · H1 · A\d · N\d/.test(n.nome)), () => JSON.stringify(end.niveis[0]));
  const n1 = end.niveis[0], n2 = end.niveis[1];

  /* um rolo do ML: material por volume, um por nivel */
  const forn = (await post('/api/fornecedores', { nome:'Textil' }, AG)).corpo.id;
  const rolo = (await post('/api/componentes', { nome:'Tecido ML 3,20', unidade:'m', modo_saldo:'volume', um_por_nivel:1, almoxarifado_id:alm }, AG)).corpo.id;
  const of = (await post('/api/ofertas', { fornecedor_id:forn, componente_id:rolo, embalagem:'rolo', fator:50, preco:500 }, AG)).corpo.id;
  const pid = (await post('/api/pedidos', { itens:[{ oferta_id:of, necessidade:150 }] }, AG)).corpo.pedidos[0].id;
  await post('/api/pedidos/' + pid + '/comprar', { canal:'direto', numero_externo:'1', comprado_em:'2026-11-01' }, AG);
  const it = db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pid).id;

  secao('o volume nasce no recebimento, com etiqueta (R-CMP-39)');
  r = await post('/api/recebimento', { pedido_id:pid, itens:[{ pedido_item_id:it, volumes:[{ metragem:50 }, { metragem:49.5 }, { metragem:50.2 }] }] }, OP);
  ok('recebe tres rolos', r.status === 200 && r.corpo.volumes.length === 3, () => JSON.stringify(r.corpo));
  const vs = db.prepare('SELECT * FROM volume_material ORDER BY id').all();
  ok('um volume por rolo, com codigo M-000001..3', vs.length === 3 && vs[0].codigo === 'M-000001' && vs[2].codigo === 'M-000003');
  ok('cada um com a metragem dele, saldo = inicial, situacao guardado', vs[1].qtd_inicial === 49.5 && vs[1].saldo === 49.5 && vs.every(v => v.situacao === 'guardado'));
  ok('ligado ao recebimento de origem e ao almoxarifado', vs.every(v => v.recebimento_item_id && v.almoxarifado_id === alm));
  ok('e sem endereco ainda (falta guardar)', vs.every(v => v.nivel_id == null));
  const saldoMat = () => db.prepare('SELECT estoque FROM componente WHERE id=?').get(rolo).estoque;
  const somaVol = () => db.prepare("SELECT ROUND(COALESCE(SUM(saldo),0),3) s FROM volume_material WHERE componente_id=? AND situacao<>'encerrado'").get(rolo).s;
  ok('o saldo do material e a soma dos volumes nao encerrados (149,7)', saldoMat() === 149.7 && somaVol() === 149.7, () => saldoMat() + ' x ' + somaVol());
  const sem = (await get('/api/volumes?sem_endereco=1', OP)).corpo;
  ok('a lista "falta guardar" traz os tres', sem.length === 3);

  secao('guardar e mover por bipe (R-CMP-41) · um por nivel (R-CMP-06)');
  r = await post('/api/volumes/M-000001/mover', { nivel:n1.codigo }, OP);
  ok('guarda o M-000001 no nivel bipado', r.status === 200 && db.prepare("SELECT nivel_id FROM volume_material WHERE codigo='M-000001'").get().nivel_id === n1.id, () => JSON.stringify(r.corpo));
  r = await post('/api/volumes/M-000002/mover', { nivel:n1.codigo }, OP);
  ok('o nivel ocupado recusa, dizendo qual volume esta la', r.status === 409 && /M-000001/.test(r.corpo.erro), () => JSON.stringify(r.corpo));
  ok('e o M-000002 continua sem endereco', db.prepare("SELECT nivel_id FROM volume_material WHERE codigo='M-000002'").get().nivel_id == null);
  r = await post('/api/volumes/m-000002/mover', { nivel_id:n2.id }, OP);
  ok('o codigo e lido sem diferenca de maiuscula, e o nivel tambem por escolha (id)', r.status === 200);
  r = await post('/api/volumes/M-000001/mover', { nivel:n1.codigo }, OP);
  ok('mover para o proprio lugar nao e recusa', r.status === 200);
  r = await post('/api/volumes/M-000009/mover', { nivel:n1.codigo }, OP);
  ok('volume que nao existe: 404', r.status === 404);
  r = await post('/api/volumes/M-000003/mover', { nivel:'E-999999' }, OP);
  ok('nivel que nao existe: 404', r.status === 404);
  ok('mover NAO mexe no saldo', saldoMat() === 149.7);
  const hist = db.prepare("SELECT COUNT(*) n FROM volume_evento WHERE volume_id=(SELECT id FROM volume_material WHERE codigo='M-000001')").get().n;
  ok('cada movimento fica na historia do volume, com quem', hist >= 2 && db.prepare("SELECT usuario_id FROM volume_evento ORDER BY id DESC").get().usuario_id === OP.id);

  /* material que nao e um por nivel divide o nivel */
  const cx = (await post('/api/componentes', { nome:'Caixa de comando', unidade:'un', modo_saldo:'volume', almoxarifado_id:alm }, AG)).corpo.id;
  const ofc = (await post('/api/ofertas', { fornecedor_id:forn, componente_id:cx, embalagem:'cx', fator:1, preco:5 }, AG)).corpo.id;
  const pc = (await post('/api/pedidos', { itens:[{ oferta_id:ofc, necessidade:2 }] }, AG)).corpo.pedidos[0].id;
  await post('/api/pedidos/' + pc + '/comprar', { canal:'direto', numero_externo:'2', comprado_em:'2026-11-01' }, AG);
  await post('/api/recebimento', { pedido_id:pc, itens:[{ pedido_item_id:db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pc).id, volumes:[{ metragem:1 }] }] }, OP);
  r = await post('/api/volumes/M-000004/mover', { nivel:n1.codigo }, OP);
  ok('a caixa (sem "um por nivel") divide o nivel com o rolo', r.status === 200, () => JSON.stringify(r.corpo));

  secao('abrir o rolo do ML e consumir o rolo (R-CMP-40)');
  r = await post('/api/volumes/M-000002/abrir', {}, OP);
  ok('abrir encerra o volume', r.status === 200 && db.prepare("SELECT situacao FROM volume_material WHERE codigo='M-000002'").get().situacao === 'encerrado');
  ok('e lanca a saida do saldo INTEIRO (49,5 m)', saldoMat() === 100.2, () => saldoMat());
  const mv = db.prepare("SELECT * FROM movimento_componente WHERE componente_id=? ORDER BY id DESC").get(rolo);
  ok('pelo livro do material, motivo "abertura", com quem', mv.motivo === 'abertura' && mv.delta === -49.5 && mv.usuario_id === OP.id);
  ok('grava quem encerrou e quando', !!db.prepare("SELECT encerrado_em FROM volume_material WHERE codigo='M-000002' AND encerrado_por_id=?").get(OP.id));
  ok('o nivel do rolo aberto fica livre', db.prepare("SELECT COUNT(*) n FROM volume_material WHERE nivel_id=? AND situacao<>'encerrado'").get(n2.id).n === 0);
  r = await post('/api/volumes/M-000002/abrir', {}, OP);
  ok('abrir de novo e recusado (409)', r.status === 409);
  r = await post('/api/volumes/M-000002/mover', { nivel:n2.codigo }, OP);
  ok('volume encerrado nao se move', r.status === 409);
  ok('o saldo continua a soma dos nao encerrados', saldoMat() === somaVol());
  r = await post('/api/volumes/M-000003/abrir', {}, null);
  ok('sem login nada grava (401)', r.status === 401);

  secao('a etiqueta da casa');
  const et = await B.chamar('GET', '/api/volumes/M-000001/etiqueta', undefined, OP);
  ok('sai em PDF', et.status === 200 && /pdf/.test(et.tipo), () => et.status + ' ' + et.tipo);
  const ler = await get('/api/volumes/M-000001', OP);
  ok('o bipe do volume diz o material, o saldo e o endereco', ler.corpo.material === 'Tecido ML 3,20' && ler.corpo.saldo === 50 && /H1/.test(ler.corpo.endereco || ''), () => JSON.stringify(ler.corpo));
  const bipNivel = await get('/api/enderecos/' + n1.codigo, OP);
  ok('o bipe do nivel diz o que esta guardado nele', bipNivel.status === 200 && bipNivel.corpo.volumes.some(v => v.codigo === 'M-000001'));

  secao('o almoxarifado com volume dentro nao se apaga');
  r = await del('/api/almoxarifados/' + alm, AG);
  ok('desativa (nao apaga)', r.status === 200 && !!db.prepare('SELECT 1 FROM almoxarifado WHERE id=? AND ativo=0').get(alm));

  fim();
})().catch(e => { console.error(e); process.exit(1); });
