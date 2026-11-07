#!/usr/bin/env node
/* FASE 9 da spec COMPRAS-E-RECEBIMENTO — o sob medida pela mesma porta
 * (R-CMP-11, R-CMP-49).
 *
 *   node teste_porta_sobmedida.js
 *
 * ⚠️ ESCRITO ANTES DO CODIGO e conferido reintroduzindo cada defeito. Sobe o
 * PCP (as rotas de compra) e o sob medida DE VERDADE (`tecido/montar.js`), cada
 * um no seu banco temporario, ligados pela porta como no server.js. Trava:
 *   - o fornecedor do sob medida migra para o do PCP (simula sem gravar; o
 *     texto antigo do rolo fica; rodar de novo nao duplica);
 *   - o recebimento do tecido do sob medida CRIA O ROLO LA, com fornecedor,
 *     nota e preco por m², e nao poe nada no estoque do PCP;
 *   - sem a porta, o recebimento desse tecido recusa (nunca cai no PCP);
 *   - a entrada antiga de rolo do sob medida e recusada, dizendo o caminho.
 */
const fs = require('fs'), path = require('path'), os = require('os');
const dirSm = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-porta-'));
process.env.BANCO_TECIDO = path.join(dirSm, 'sob-medida.db');
const { bancada, MODULOS } = require('./util_teste_compras');
const B = bancada({ modulos: MODULOS.concat(['material_route', 'compra_route', 'recebimento_route', 'nota_route', 'almox_route']) });
const { db, get, post, ok, fim, secao } = B;
const AG = { id:1, nome:'Lucas', admin_geral:true, permissoes:['alcada.definir'] };
const sm = require('./tecido/montar').montar(B.app, null, {
  materiais: () => db.prepare('SELECT id,nome,unidade,marca,modelo FROM componente WHERE ativo=1').all(),
  pessoas: () => [], permissoes: () => [] });
const SR = require('./sobmedida_rolo');
SR.ligar({ criarRolos:sm.criarRolosDoRecebimento, tecidos:sm.tecidosParaCompras });   // como no server.js
const smdb = require('./tecido/nucleo/db');
const MIG = require('./migrar_fornecedor_sobmedida');

(async () => {
  db.exec('CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, pin_hash TEXT, salt TEXT, areas TEXT, ativo INTEGER DEFAULT 1)');
  /* o cadastro de tecido do sob medida e os fornecedores de antes */
  const lin = smdb.prepare("INSERT INTO linha(nome) VALUES('Rolo')").run().lastInsertRowid;
  const ab = smdb.prepare("INSERT INTO abertura(linha_id,nome) VALUES(?,'Blackout')").run(lin).lastInsertRowid;
  const cor = smdb.prepare("INSERT INTO cor(nome) VALUES('Bege')").run().lastInsertRowid;
  const tec = smdb.prepare("INSERT INTO tecido(codigo,linha_id,abertura_id,cor_id) VALUES('ROLO-BK-BEGE',?,?,?)").run(lin, ab, cor).lastInsertRowid;
  const fEco = smdb.prepare("INSERT INTO fornecedor(nome) VALUES('Ecotex')").run().lastInsertRowid;
  smdb.prepare("INSERT INTO fornecedor(nome) VALUES('  textil SUL ')").run();
  smdb.prepare("INSERT INTO rolo(codigo,tecido_id,largura,metragem_inicial,saldo,fornecedor,fornecedor_id) VALUES('R-000001',?,3.2,50,50,'Ecotex ltda',?)").run(tec, fEco);
  const pcpTextil = (await post('/api/fornecedores', { nome:'Textil Sul', cnpj:'11222333000144' }, AG)).corpo.id;

  secao('o fornecedor do sob medida migra para o do PCP (R-CMP-11)');
  const plano = MIG.planejar(db, smdb);
  ok('a simulacao nao grava nada', db.prepare('SELECT COUNT(*) n FROM fornecedor').get().n === 1 && smdb.prepare('SELECT COUNT(*) n FROM fornecedor WHERE fornecedor_pcp_id IS NOT NULL').get().n === 0);
  ok('"  textil SUL " liga ao "Textil Sul" do PCP (sem diferenca de maiuscula e espaco)', plano.some(p => /textil/i.test(p.nome) && p.acao === 'ligar' && p.pcp_id === pcpTextil), () => JSON.stringify(plano));
  ok('"Ecotex" nao existe no PCP: sera criado', plano.some(p => p.nome === 'Ecotex' && p.acao === 'criar_no_pcp'));
  MIG.aplicar(db, smdb);
  const eco = smdb.prepare("SELECT fornecedor_pcp_id p FROM fornecedor WHERE nome='Ecotex'").get().p;
  ok('aplicado: o Ecotex nasce no PCP e o do sob medida aponta para ele', eco && db.prepare('SELECT nome FROM fornecedor WHERE id=?').get(eco).nome === 'Ecotex');
  ok('o rolo antigo ganha o fornecedor do PCP ao lado, e o texto antigo fica', smdb.prepare("SELECT fornecedor, fornecedor_pcp_id FROM rolo WHERE codigo='R-000001'").get().fornecedor === 'Ecotex ltda'
     && smdb.prepare("SELECT fornecedor_pcp_id FROM rolo WHERE codigo='R-000001'").get().fornecedor_pcp_id === eco);
  MIG.aplicar(db, smdb);
  ok('rodar de novo nao duplica no PCP', db.prepare("SELECT COUNT(*) n FROM fornecedor WHERE nome='Ecotex'").get().n === 1 && MIG.planejar(db, smdb).every(p => p.acao === 'ja_ligado'));

  secao('o recebimento do tecido do sob medida cria o rolo LA (R-CMP-49)');
  const tecidos = SR.tecidos();
  ok('a porta lista os tecidos do sob medida para o cadastro de material', !tecidos.fora && tecidos.tecidos.some(t => t.id === tec && /Blackout/.test(t.nome)), () => JSON.stringify(tecidos));
  const comp = (await post('/api/componentes', { nome:'Blackout bege 3,20 (sob medida)', unidade:'m', modo_saldo:'volume', familia:'BK', cor:'BEGE', largura_bobina_cm:320, sm_tecido_id:tec }, AG)).corpo.id;
  ok('o material do PCP aponta o tecido do sob medida', db.prepare('SELECT sm_tecido_id FROM componente WHERE id=?').get(comp).sm_tecido_id === tec);
  let r = await post('/api/componentes', { id:comp, sm_tecido_id:99999 }, AG);
  ok('tecido do sob medida que nao existe e recusado', r.status === 400, () => JSON.stringify(r));
  const of = (await post('/api/ofertas', { fornecedor_id:pcpTextil, componente_id:comp, embalagem:'rolo 50 m', fator:50, preco:900 }, AG)).corpo.id;
  const pid = (await post('/api/pedidos', { itens:[{ oferta_id:of, necessidade:100 }] }, AG)).corpo.pedidos[0].id;
  await post('/api/pedidos/' + pid + '/comprar', { canal:'direto', numero_externo:'T1', comprado_em:'2026-11-03' }, AG);
  const it = db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pid).id;
  const antes = smdb.prepare('SELECT COUNT(*) n FROM rolo').get().n;
  r = await post('/api/recebimento', { pedido_id:pid, nota_fiscal:'4455', itens:[{ pedido_item_id:it, volumes:[{ metragem:50 }, { metragem:48 }] }] }, AG);
  ok('recebe', r.status === 200, () => JSON.stringify(r.corpo));
  const novos = smdb.prepare('SELECT * FROM rolo WHERE id>? ORDER BY id').all(antes);
  ok('nasceram DOIS rolos no sob medida, com a metragem de cada um', novos.length === 2 && novos[0].metragem_inicial === 50 && novos[1].saldo === 48, () => JSON.stringify(novos));
  ok('com o tecido, a largura da bobina (3,20) e a nota', novos.every(n => n.tecido_id === tec && n.largura === 3.2 && n.nf === '4455'));
  ok('com o fornecedor do PCP (pelo espelho do sob medida)', novos.every(n => n.fornecedor_pcp_id === pcpTextil && n.fornecedor_id === smdb.prepare("SELECT id FROM fornecedor WHERE fornecedor_pcp_id=?").get(pcpTextil).id));
  ok('e o preco por m²: R$ 900 / 50 m = R$ 18/m ÷ 3,20 = R$ 5,625/m²', novos.every(n => Math.abs(n.preco_m2 - 5.625) < 1e-6), () => novos.map(n => n.preco_m2).join(','));
  ok('o movimento de entrada do rolo esta no livro do sob medida', smdb.prepare("SELECT COUNT(*) n FROM movimento_rolo WHERE motivo='entrada' AND rolo_id IN (?,?)").get(novos[0].id, novos[1].id).n === 2);
  ok('NADA entrou no estoque do PCP (o rolo e do sob medida)', db.prepare('SELECT estoque FROM componente WHERE id=?').get(comp).estoque === 0);
  ok('nem volume do PCP', db.prepare('SELECT COUNT(*) n FROM volume_material WHERE componente_id=?').get(comp).n === 0);
  ok('a resposta diz os rolos criados', (r.corpo.rolos || []).length === 2 && /^R-/.test(r.corpo.rolos[0].codigo), () => JSON.stringify(r.corpo));
  ok('chegaram 98 m de 100 m: o pedido fica parcial (o resto segue a caminho)', db.prepare('SELECT status FROM pedido_compra WHERE id=?').get(pid).status === 'parcial');

  secao('revisao do PR #305: o recebimento que falha no meio nao deixa rolo orfao no sob medida');
  const cor2 = smdb.prepare("INSERT INTO cor(nome) VALUES('Cinza')").run().lastInsertRowid;
  const tec2 = smdb.prepare("INSERT INTO tecido(codigo,linha_id,abertura_id,cor_id) VALUES('ROLO-BK-CINZA',?,?,?)").run(lin, ab, cor2).lastInsertRowid;
  const comp2 = (await post('/api/componentes', { nome:'Blackout bege 2,80 (sob medida)', unidade:'m', modo_saldo:'volume', familia:'BK', cor:'BEGE', largura_bobina_cm:280, sm_tecido_id:tec2 }, AG)).corpo.id;
  const of2 = (await post('/api/ofertas', { fornecedor_id:pcpTextil, componente_id:comp2, embalagem:'rolo 50 m', fator:50, preco:800 }, AG)).corpo.id;
  const pidO = (await post('/api/pedidos', { itens:[{ oferta_id:of, necessidade:50 }, { oferta_id:of2, necessidade:50 }] }, AG)).corpo.pedidos[0].id;
  await post('/api/pedidos/' + pidO + '/comprar', { canal:'direto', numero_externo:'T9', comprado_em:'2026-11-03' }, AG);
  const itsO = db.prepare('SELECT id, componente_id FROM pedido_item WHERE pedido_id=? ORDER BY id').all(pidO);
  smdb.prepare('UPDATE tecido SET ativo=0 WHERE id=?').run(tec2);   // o segundo rolo vai ser recusado LA
  const rolosAntes = smdb.prepare('SELECT COUNT(*) n FROM rolo').get().n;
  r = await post('/api/recebimento', { pedido_id:pidO, nota_fiscal:'9001', itens:itsO.map(i => ({ pedido_item_id:i.id, volumes:[{ metragem:50 }] })) }, AG);
  ok('o segundo tecido recusado la derruba o recebimento', r.status >= 400, () => JSON.stringify(r));
  ok('e o PRIMEIRO rolo tambem nao ficou no sob medida (nada de rolo orfao)', smdb.prepare('SELECT COUNT(*) n FROM rolo').get().n === rolosAntes, () => smdb.prepare('SELECT COUNT(*) n FROM rolo').get().n + ' vs ' + rolosAntes);
  ok('nem recebimento no PCP', db.prepare('SELECT COUNT(*) n FROM recebimento WHERE pedido_id=?').get(pidO).n === 0);
  smdb.prepare('UPDATE tecido SET ativo=1 WHERE id=?').run(tec2);

  secao('revisao do PR #305: o tecido do sob medida RETIDO, quando aceito, vira rolo la (e nao estoque no PCP)');
  db.prepare('UPDATE componente SET peso_padrao_kg=0.4 WHERE id=?').run(comp);
  const pidK = (await post('/api/pedidos', { itens:[{ oferta_id:of, necessidade:50, unidade_compra:'kg', qtd_compra:20, preco_unid_compra:45 }] }, AG)).corpo.pedidos[0].id;
  await post('/api/pedidos/' + pidK + '/comprar', { canal:'direto', numero_externo:'T10', comprado_em:'2026-11-03' }, AG);
  const itK = db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pidK).id;
  r = await post('/api/recebimento', { pedido_id:pidK, nota_fiscal:'9002', itens:[{ pedido_item_id:itK, volumes:[{ metragem:30 }, { metragem:20 }], peso_1_kg:0.9, peso_10_kg:9 }] }, AG);
  ok('pesado fora da tolerancia: fica retido', r.status === 200 && r.corpo.retidos === 1, () => JSON.stringify(r.corpo));
  const riK = db.prepare("SELECT ri.id FROM recebimento_item ri WHERE ri.pedido_item_id=? AND ri.faixa='retido'").get(itK).id;
  const rolosK = smdb.prepare('SELECT COUNT(*) n FROM rolo').get().n;
  r = await post('/api/recebimento/itens/' + riK + '/decidir', { decisao:'aceitar', motivo:'conferido na balanca' }, AG);
  ok('aceitar responde', r.status === 200, () => JSON.stringify(r));
  ok('nasceram os DOIS rolos la, com a metragem de cada volume', smdb.prepare('SELECT COUNT(*) n FROM rolo').get().n === rolosK + 2
     && smdb.prepare('SELECT metragem_inicial m FROM rolo ORDER BY id DESC LIMIT 2').all().map(x => x.m).sort().join(',') === '20,30');
  ok('e NADA entrou no estoque do PCP', db.prepare('SELECT estoque FROM componente WHERE id=?').get(comp).estoque === 0, () => db.prepare('SELECT estoque FROM componente WHERE id=?').get(comp).estoque);

  secao('revisao do PR #305: o material por volume RETIDO, quando aceito, nasce com os volumes etiquetados');
  const alm = db.prepare('SELECT id FROM almoxarifado LIMIT 1').get().id;
  const compV = (await post('/api/componentes', { nome:'Cordao 2mm', unidade:'m', modo_saldo:'volume', almoxarifado_id:alm }, AG)).corpo.id;
  const ofV = (await post('/api/ofertas', { fornecedor_id:pcpTextil, componente_id:compV, embalagem:'carretel', fator:100, preco:50 }, AG)).corpo.id;
  const pidV = (await post('/api/pedidos', { itens:[{ oferta_id:ofV, necessidade:200, unidade_compra:'carretel', qtd_compra:2, preco_unid_compra:50, qtd_declarada:200 }] }, AG)).corpo.pedidos[0].id;
  await post('/api/pedidos/' + pidV + '/comprar', { canal:'direto', numero_externo:'T11', comprado_em:'2026-11-03' }, AG);
  const itV = db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pidV).id;
  r = await post('/api/recebimento', { pedido_id:pidV, itens:[{ pedido_item_id:itV, volumes:[{ metragem:100 }, { metragem:105 }] }] }, AG);
  ok('chegou 205 de 200 declarados: retido', r.status === 200 && r.corpo.retidos === 1, () => JSON.stringify(r.corpo));
  const riV = db.prepare("SELECT id FROM recebimento_item WHERE pedido_item_id=? AND faixa='retido'").get(itV).id;
  r = await post('/api/recebimento/itens/' + riV + '/decidir', { decisao:'aceitar', motivo:'veio um pedaco a mais, aceito' }, AG);
  ok('aceitar responde', r.status === 200, () => JSON.stringify(r));
  const vols = db.prepare("SELECT saldo m FROM volume_material WHERE componente_id=? ORDER BY id").all(compV);
  ok('nasceram os DOIS volumes, com a metragem de cada um', vols.length === 2 && vols.map(v => v.m).join(',') === '100,105', () => JSON.stringify(vols));
  ok('e o saldo e a soma dos volumes (205)', Math.abs(db.prepare('SELECT estoque FROM componente WHERE id=?').get(compV).estoque - 205) < 1e-6);

  secao('sem a porta, o tecido do sob medida nao e recebido');
  const pid2 = (await post('/api/pedidos', { itens:[{ oferta_id:of, necessidade:50 }] }, AG)).corpo.pedidos[0].id;
  await post('/api/pedidos/' + pid2 + '/comprar', { canal:'direto', numero_externo:'T2', comprado_em:'2026-11-03' }, AG);
  const it2 = db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pid2).id;
  const guarda = sm; SR.ligar(null);
  r = await post('/api/recebimento', { pedido_id:pid2, itens:[{ pedido_item_id:it2, volumes:[{ metragem:50 }] }] }, AG);
  ok('recusa, dizendo que o sob medida nao esta ligado', r.status >= 400 && /sob medida/i.test(r.corpo.erro || ''), () => JSON.stringify(r));
  ok('e nada foi gravado no PCP', db.prepare('SELECT COUNT(*) n FROM recebimento WHERE pedido_id=?').get(pid2).n === 0);
  SR.ligar({ criarRolos:guarda.criarRolosDoRecebimento, tecidos:guarda.tecidosParaCompras });

  secao('a entrada antiga de rolo do sob medida esta aposentada');
  const rotas = require('./tecido/rotas/rolos').rotas;
  const ent = rotas.find(x => x.metodo === 'POST' && x.caminho === '/api/rolos');
  let erro = null;
  try{ ent.manipulador({ corpo:{ tecido_id:tec, largura:3.2, metragem:50 }, usuario:{ nome:'X' } }); }catch(e){ erro = e; }
  ok('a rota de entrada recusa, dizendo que o rolo nasce pelo Recebimento do PCP', erro && /Recebimento/i.test(erro.mensagem || erro.message), () => erro ? erro.message : 'passou');
  fim();
})().catch(e => { console.error(e); process.exit(1); });
