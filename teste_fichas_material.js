#!/usr/bin/env node
/* AS FICHAS NO CADASTRO UNICO — spec FICHAS-NO-CADASTRO-UNICO (11/11/2026), as
 * partes do PCP das fases 1, 3, 4 e 5. O lado do sob medida (a lista de
 * material, a baixa uma vez por peca, a recusa) e o tecido/teste/ficha_material.
 *
 *   node teste_fichas_material.js
 *
 * ⚠️ ESCRITO JUNTO COM O CODIGO, risco vermelho (mexe em saldo de material).
 * Sobe as rotas de verdade num banco temporario e numa porta livre (a bancada
 * do util_teste_compras) — nunca a 3010.
 */
const { bancada, MODULOS } = require('./util_teste_compras');
const B = bancada({ modulos: MODULOS.concat(['mont_route', 'material_extra_route']) });
const { db, get, post, ok, fim, secao } = B;

const ADM = { id:1, nome:'Lucas', admin_geral:true };
const SUP = { id:5, nome:'Sergio', permissoes:['material.extra'] };
const OPE = { id:9, nome:'Bia' };

const cfg = (k, v) => db.prepare("INSERT INTO config (chave,valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run(k, v);
const saldo = id => db.prepare('SELECT estoque FROM componente WHERE id=?').get(id).estoque;
const MAT = require('./material_dominio');

(async () => {
  /* ── o cenario: um modelo, um SKU, tres materiais e uma familia de tecido ── */
  db.pragma('foreign_keys = OFF');   // o cenario e montado por SQL; as rotas rodam com a FK de volta
  db.exec("INSERT INTO modelo (id,codigo,nome,sob_medida) VALUES (50,'ROLOT','Rolo teste',0)");
  db.exec("INSERT INTO skus (codigo,descricao,estoque,modelo_id,largura_cm,altura_cm,cor_codigo,tem_ficha) VALUES ('RT160','t',0,50,160,140,'BEGE',1)");
  const novo = (b) => db.prepare('INSERT INTO componente (nome,unidade,modo_saldo,vai_ficha,estoque) VALUES (?,?,?,1,?)').run(b.nome, b.unidade, b.modo, b.estoque || 0).lastInsertRowid;
  const tubo = novo({ nome:'Tubo 32', unidade:'m', modo:'quantidade', estoque:100 });
  const paraf = novo({ nome:'Parafuso', unidade:'un', modo:'quantidade', estoque:500 });
  const rolo = novo({ nome:'Rolo X', unidade:'m', modo:'volume', estoque:0 });
  db.prepare("INSERT INTO componente (nome,unidade,modo_saldo,vai_ficha,familia,cor,largura_bobina_cm) VALUES ('Blackout bege 3,20','m','volume',1,'bk_t','BEGE',320)").run();
  const fins = (comp, expr, fam) => db.prepare('INSERT INTO ficha_formula (modelo_id,componente_id,familia,expressao,ativo,ordem) VALUES (50,?,?,?,1,1)').run(comp || null, fam || null, expr).lastInsertRowid;
  fins(tubo, 'largura / 100'); fins(paraf, '4'); fins(null, '(altura + 20) / 200', 'bk_t');
  const morta = fins(rolo, '1'); db.prepare('UPDATE ficha_formula SET ativo=0 WHERE id=?').run(morta);
  cfg('kit_codigo', 'KIT1');
  db.pragma('foreign_keys = ON');

  secao('fase 1 · o codigo de cadastro');
  ok('o codigo sai do id: MAT-0001', MAT.codigoCadastro(1) === 'MAT-0001' && MAT.codigoCadastro(12345) === 'MAT-12345' && MAT.codigoCadastro(null) === null);
  let r = await get('/api/componentes', ADM);
  const T = () => r.corpo.find(c => c.id === tubo);
  ok('a leitura traz o codigo de cada material', T().codigo_cadastro === MAT.codigoCadastro(tubo), () => JSON.stringify(T()));
  ok('cada material tem um codigo diferente', new Set(r.corpo.map(c => c.codigo_cadastro)).size === r.corpo.length);
  await post('/api/componentes', { id:tubo, estoque_minimo:5 }, ADM);
  r = await get('/api/componentes', ADM);
  ok('editar nao muda o codigo', T().codigo_cadastro === MAT.codigoCadastro(tubo));

  secao('fase 1 · usado em');
  ok('o material direto aparece no modelo, com a formula', T().usado_em.some(u => u.modelo === 'Rolo teste' && u.expressao === 'largura / 100' && u.operacao === 'padrao'), () => JSON.stringify(T().usado_em));
  const tec = r.corpo.find(c => c.familia === 'bk_t');
  ok('o tecido aparece pela familia', tec.usado_em.some(u => u.familia === 'bk_t'), () => JSON.stringify(tec.usado_em));
  ok('a linha desativada nao conta', r.corpo.find(c => c.id === rolo).usado_em.length === 0);
  ok('o "usado em" nao leva dinheiro', r.corpo.every(c => (c.usado_em || []).every(u => !Object.keys(u).some(k => /preco|custo|valor/.test(k)))));

  secao('fase 4 · "pela ficha" so por quantidade e com contagem na 504');
  r = await post('/api/componentes', { id:rolo, como_sai:'ficha' }, ADM);
  ok('material por volume e recusado', r.status === 400 && /quantidade/.test(r.corpo.erro), () => JSON.stringify(r.corpo));
  r = await post('/api/componentes', { id:tubo, como_sai:'ficha' }, ADM);
  ok('sem contagem resolvida e recusado (diz a 504)', r.status === 400 && /504/.test(r.corpo.erro));
  db.exec("INSERT INTO almoxarifado (id,nome) VALUES (77,'Almox T')");
  db.exec("INSERT INTO contagem_material (id,almoxarifado_id,situacao) VALUES (88,77,'terminada')");
  db.prepare("INSERT INTO contagem_material_item (contagem_id,componente_id,contado,situacao) VALUES (88,?,100,'aprovado')").run(tubo);
  r = await post('/api/componentes', { id:tubo, como_sai:'ficha' }, ADM);
  ok('com a contagem aprovada, passa', r.status === 200 && db.prepare('SELECT como_sai FROM componente WHERE id=?').get(tubo).como_sai === 'ficha', () => JSON.stringify(r.corpo));
  r = await post('/api/componentes', { id:tubo, modo_saldo:'volume' }, ADM);
  ok('o material que sai pela ficha nao vira "por volume" pelo cadastro', r.status === 400);

  secao('fase 4 · a baixa na embalagem');
  const antesT = saldo(tubo), antesP = saldo(paraf);
  r = await post('/api/montagem', { codigo:'RT160', kit_ok:1 }, OPE);
  ok('a embalagem passa', r.status === 200, () => JSON.stringify(r.corpo));
  ok('o tubo (pela ficha) baixou o consumo: 1,60 m', Math.abs(saldo(tubo) - (antesT - 1.6)) < 1e-9, () => saldo(tubo));
  ok('o parafuso (pela contagem) NAO baixou', saldo(paraf) === antesP);
  const mv = db.prepare("SELECT * FROM movimento_componente WHERE componente_id=? ORDER BY id DESC LIMIT 1").get(tubo);
  ok('a linha do livro diz a operacao, o motivo e a embalagem', mv.operacao === 'padrao' && mv.motivo === 'ficha' && /^montagem:\d+$/.test(mv.referencia), () => JSON.stringify(mv));
  const meio = saldo(tubo);
  db.exec("INSERT INTO fila (codigo,modo,situacao) VALUES ('RT160','devolucao','aguardando')");
  r = await post('/api/montagem', { codigo:'RT160', kit_ok:1 }, OPE);
  ok('a devolucao reembalada NAO baixa material', r.status === 200 && saldo(tubo) === meio, () => saldo(tubo));
  ok('e a linha da embalagem guarda o modo', db.prepare("SELECT modo FROM montagem ORDER BY id DESC LIMIT 1").get().modo === 'devolucao');

  secao('fase 3 · consumido por operacao');
  r = await get('/api/componentes', ADM);
  ok('o mes conta a embalagem de estoque e nao a devolucao: 1,6 m no padrao', Math.abs(T().consumo_mes.padrao - 1.6) < 1e-9 && T().consumo_mes.sobmedida === 0, () => JSON.stringify(T().consumo_mes));
  ok('o parafuso (pela contagem) tambem aparece, estimado pela ficha: 4', r.corpo.find(c => c.id === paraf).consumo_mes.padrao === 4);

  secao('fase 4 · o material extra');
  r = await post('/api/rejeicao', { codigo:'RT160', motivo:'Tecido manchado' }, OPE);
  ok('a peca com problema e registrada', r.status === 200);
  let me = db.prepare('SELECT * FROM material_extra ORDER BY id DESC LIMIT 1').get();
  ok('e vira "material extra a decidir", com a ficha como sugestao', me && me.origem === 'revisao' && me.decisao == null && JSON.parse(me.sugestao).some(s => s.componente_id === tubo), () => JSON.stringify(me));
  ok('e nao baixou nada sozinha', saldo(tubo) === meio);
  r = await get('/api/material-extra', SUP);
  ok('a 106 lista a linha pendente', r.status === 200 && r.corpo.linhas.some(l => l.id === me.id) && r.corpo.pendentes.n >= 1);
  r = await post('/api/material-extra/' + me.id + '/decidir', { decisao:'usou', itens:[{ componente_id:tubo, quantidade:1.6 }] }, { id:9, nome:'Bia', permissoes:['material.extra'] });
  ok('quem registrou o problema nao decide (409)', r.status === 409, () => JSON.stringify(r.corpo));
  r = await post('/api/material-extra/' + me.id + '/decidir', { decisao:'usou', itens:[{ componente_id:rolo, quantidade:1 }] }, SUP);
  ok('material por volume e recusado', r.status === 400);
  r = await post('/api/material-extra/' + me.id + '/decidir', { decisao:'usou', itens:[{ componente_id:tubo, quantidade:'1,6' }] }, SUP);
  ok('o Supervisor decide "usou" e o material baixa', r.status === 200 && Math.abs(saldo(tubo) - (meio - 1.6)) < 1e-9, () => JSON.stringify(r.corpo) + ' ' + saldo(tubo));
  const mv2 = db.prepare("SELECT * FROM movimento_componente WHERE referencia=?").get('material_extra:' + me.id);
  ok('a linha do livro diz quem decidiu e o motivo material_extra', mv2 && mv2.motivo === 'material_extra' && mv2.usuario_nome === 'Sergio' && mv2.operacao === 'padrao');
  r = await post('/api/material-extra/' + me.id + '/decidir', { decisao:'nao_usou' }, SUP);
  ok('decidida nao se decide de novo (409)', r.status === 409);
  await post('/api/rejeicao', { codigo:'RT160', motivo:'Base torta' }, OPE);
  const me2 = db.prepare('SELECT id FROM material_extra ORDER BY id DESC LIMIT 1').get().id;
  const s0 = saldo(tubo);
  r = await post('/api/material-extra/' + me2 + '/decidir', { decisao:'nao_usou', obs:'só reapertou' }, SUP);
  ok('"nao precisou" fecha sem mexer no saldo', r.status === 200 && saldo(tubo) === s0);
  r = await post('/api/material-extra/' + me2 + '/decidir', {}, SUP);
  ok('sem escolher a decisao e 400 ou 409', r.status === 400 || r.status === 409);
  r = await post('/api/material-extra/999/decidir', { decisao:'nao_usou' }, SUP);
  ok('linha que nao existe e 404', r.status === 404);
  r = await post('/api/material-extra/' + me2 + '/decidir', { decisao:'nao_usou' }, null);
  ok('sem login e 401 (o portao)', r.status === 401);

  secao('a central de Pendencias conta as pendentes');
  await post('/api/rejeicao', { codigo:'RT160', motivo:'Outro' }, OPE);
  ok('a pendencia "Material extra a decidir" existe na central', require('fs').readFileSync('pendencias_dominio.js', 'utf8').includes("chave:'material_extra'"));
  ok('e a conta e a da tela dona', require('./material_extra_dominio').pendentes(db).n === 1);

  secao('alcada: a chave e a tela nascem so para o Admin Geral');
  const P = require('./permissoes');
  const lista = P.PERMISSOES || P.REGISTRO || P;
  const reg = (Array.isArray(lista) ? lista : (lista.lista || [])).find(p => p.chave === 'material.extra');
  ok('material.extra existe, nivel Supervisor, sensivel, na tela 106', reg && reg.nivel === 'supervisor' && reg.sensivel && reg.tela === 106, () => JSON.stringify(reg));
  const T106 = require('./telas').TELAS.find(t => t.n === 106);
  ok('a 106 esta no mapa: Producao, Comum, Supervisor', T106 && T106.modulo === 'producao' && T106.bloco === 'comum' && T106.nivel === 'supervisor');
  const src = require('fs').readFileSync('acesso.js', 'utf8');
  ok('nenhum setor nativo recebe material.extra pelo seed', !/['"]material\.extra['"]/.test(src.replace(/pre\('\/api\/material-extra'\)\) return 'material\.extra'/, '')));

  secao('fase 5 · o catalogo unico');
  r = await get('/api/catalogo/sobmedida', ADM);
  ok('sem a porta do sob medida, a lista vem vazia dizendo que esta fora', r.status === 200 && r.corpo.fora === true && Array.isArray(r.corpo.produtos), () => JSON.stringify(r.corpo));
  require('./sobmedida_material').ligarFicha({ linhas:() => [], embalado:() => [], produtos:() => [{ id:3, nome:'Romana', ativo:1, materiais:2, preco_m2_centavos:99 }] });
  r = await get('/api/catalogo/sobmedida', ADM);
  ok('com a porta: nome, ativo e quantos materiais — e nada de preco', r.corpo.produtos.length === 1 && r.corpo.produtos[0].nome === 'Romana' && !('preco_m2_centavos' in r.corpo.produtos[0]));
  secao('item 1 · o custo da persiana sob medida numa medida, na 404');
  const CAD = { id:21, nome:'Cad', permissoes:['modelo.cadastrar'] };
  const CUS = { id:22, nome:'Cus', permissoes:['modelo.cadastrar','custo.ver'] };
  let pedida = null;
  require('./sobmedida_material').ligarFicha({ linhas:() => [], embalado:() => [], produtos:() => [],
    naMedida:(id, l, a) => { pedida = [id, l, a]; return { linhas:[
      { nome:'Parafuso', unidade:'un', quando:'sempre', quantidade:6, custo_unitario:0.1, custo_centavos:60 },
      { nome:'Bando', unidade:'m', quando:'bando', quantidade:1.5, custo_unitario:10, custo_centavos:1500 },
      { nome:'Corrente', unidade:'m', quando:'com_comando', quantidade:2, custo_unitario:1, custo_centavos:200 },
      { nome:'Cordao', unidade:'m', quando:'sem_comando', quantidade:2, custo_unitario:null, custo_centavos:null }],
      sem_custo:[], custo_material_centavos:1560, custo_material_piso_centavos:1560 }; } });
  r = await get('/api/catalogo/sobmedida/3/medida?largura=150&altura=200', CUS);
  ok('a medida chega ao sob medida em milimetros', r.status === 200 && pedida && pedida[0] === 3 && pedida[1] === 1500 && pedida[2] === 2000, () => JSON.stringify([r.status, r.corpo, pedida]));
  ok('com custo.ver: a lista com o R$, e o total do que entra sempre', r.corpo.linhas.length === 4 &&
    r.corpo.linhas[0].custo_centavos === 60 && r.corpo.custo_sempre_centavos === 60, () => JSON.stringify(r.corpo));
  ok('③ o que depende de escolha sai POR ESCOLHA, e nunca somado (com e sem comando nao andam juntos)',
    !('custo_opcional_centavos' in r.corpo) && Array.isArray(r.corpo.por_escolha) &&
    r.corpo.por_escolha.find(e => e.quando === 'bando').custo_centavos === 1500 &&
    r.corpo.por_escolha.find(e => e.quando === 'com_comando').custo_centavos === 200 &&
    r.corpo.por_escolha.find(e => e.quando === 'sem_comando').custo_centavos === null, () => JSON.stringify(r.corpo));
  ok('③ a linha de escolha sem preco nao torna indefinido o que entra sempre', r.corpo.custo_sempre_centavos === 60 &&
    !(r.corpo.sem_custo || []).includes('Cordao'), () => JSON.stringify(r.corpo));
  r = await get('/api/catalogo/sobmedida/3/medida?largura=150&altura=200', CAD);
  ok('sem custo.ver: a quantidade vem, e nenhum campo de custo viaja', r.status === 200 && r.corpo.linhas.length === 4 &&
    r.corpo.linhas[0].quantidade === 6 && !/custo/.test(JSON.stringify(r.corpo)), () => JSON.stringify(r.corpo));
  r = await get('/api/catalogo/sobmedida/3/medida?largura=abc&altura=200', CUS);
  ok('medida impossivel e recusada (400), e nao vira zero', r.status === 400, () => JSON.stringify([r.status, r.corpo]));
  require('./sobmedida_material').ligarFicha(null);
  r = await get('/api/catalogo/sobmedida/3/medida?largura=150&altura=200', CUS);
  ok('sem o sob medida ligado, a resposta diz que esta fora', r.status === 200 && r.corpo.fora === true, () => JSON.stringify(r.corpo));

  require('./sobmedida_material').ligarFicha({ linhas:() => [{ componente_id:paraf, expressao:'6', quando:'sempre', produto:'Romana', produto_id:3 }], embalado:() => [{ componente_id:paraf, quantidade:12 }], produtos:() => [] });
  r = await get('/api/componentes', ADM);
  const P2 = r.corpo.find(c => c.id === paraf);
  ok('o "usado em" junta a ficha do sob medida', P2.usado_em.some(u => u.operacao === 'sobmedida' && u.modelo === 'Romana'), () => JSON.stringify(P2.usado_em));
  ok('e o consumido do mes junta o sob medida', P2.consumo_mes.sobmedida === 12, () => JSON.stringify(P2.consumo_mes));
  require('./sobmedida_material').ligarFicha(null);

  /* ── ③ REVISAO (11/11/2026): os achados confirmados pelo verificador ──── */
  secao('③ 1 · o modo teste nao mexe no que e de verdade');
  const PORTA = require('./porta_material_sm')(db);
  cfg('modo_teste', '1');
  const sAntes = saldo(tubo);
  let rb = PORTA.baixarMaterial({ itens:[{ componente_id:tubo, quantidade:2 }], referencia:'sm_item:1' });
  ok('a baixa do sob medida (peca de verdade) fica ADIADA com o modo teste ligado', rb && rb.adiado === true && saldo(tubo) === sAntes, () => JSON.stringify(rb));
  const ex = PORTA.materialExtra({ referencia:'sm_item:1', descricao:'pedido 1 · peca 1', motivo:'x', sugestao:[], registrado_por:'Ana', registrado_por_id:301 });
  ok('o material extra da recusa do sob medida nasce de verdade (teste=0)', db.prepare('SELECT teste FROM material_extra WHERE id=?').get(ex.id).teste === 0);
  r = await post('/api/material-extra/' + ex.id + '/decidir', { decisao:'usou', itens:[{ componente_id:tubo, quantidade:1 }] }, SUP);
  ok('decidir uma linha de VERDADE com o modo teste ligado e recusado (409)', r.status === 409 && /modo teste/i.test(r.corpo.erro || ''), () => JSON.stringify(r.corpo));
  ok('e o saldo nao mexeu', saldo(tubo) === sAntes);
  cfg('modo_teste', '0');
  rb = PORTA.baixarMaterial({ itens:[{ componente_id:tubo, quantidade:2 }], referencia:'sm_item:1' });
  ok('fora do modo teste a baixa do sob medida acontece, e de verdade (teste=0)', !rb.adiado && saldo(tubo) === sAntes - 2 &&
    db.prepare("SELECT teste FROM movimento_componente WHERE referencia='sm_item:1'").get().teste === 0);

  secao('③ 2 · a linha de ficha minuscula nao trava a baixa do SKU');
  const cola = novo({ nome:'Cola', unidade:'l', modo:'quantidade', estoque:10 });
  db.prepare("INSERT INTO contagem_material_item (contagem_id,componente_id,contado,situacao) VALUES (88,?,10,'aprovado')").run(cola);
  db.prepare("UPDATE componente SET como_sai='ficha' WHERE id=?").run(cola);
  fins(cola, '0.0004');
  const t0 = saldo(tubo), nExtra0 = db.prepare('SELECT COUNT(*) n FROM material_extra').get().n;
  r = await post('/api/montagem', { codigo:'RT160', kit_ok:1 }, OPE);
  ok('o tubo baixa normalmente com uma linha de 0,0004 na ficha', r.status === 200 && Math.abs(saldo(tubo) - (t0 - 1.6)) < 1e-9, () => saldo(tubo));
  ok('e nao nasce linha de falha a cada embalagem', db.prepare("SELECT COUNT(*) n FROM material_extra WHERE origem='falha_baixa'").get().n === 0);

  secao('③ 3 · a 106 recusa o numero escrito pela metade');
  await post('/api/rejeicao', { codigo:'RT160', motivo:'Mais um' }, OPE);
  const me3 = db.prepare("SELECT id FROM material_extra WHERE origem='revisao' AND decisao IS NULL ORDER BY id DESC LIMIT 1").get().id;
  const t1 = saldo(tubo);
  r = await post('/api/material-extra/' + me3 + '/decidir', { decisao:'usou', itens:[{ componente_id:tubo, quantidade:'3abc' }] }, SUP);
  ok('"3abc" e recusado (400) e o saldo nao mexe', r.status === 400 && saldo(tubo) === t1, () => r.status + ' ' + saldo(tubo));
  r = await post('/api/material-extra/' + me3 + '/decidir', { decisao:'usou', itens:[{ componente_id:tubo, quantidade:'0.0004' }] }, SUP);
  ok('quantidade que vira zero e 400, e nao 500', r.status === 400, () => r.status + ' ' + JSON.stringify(r.corpo));

  secao('③ 4 · a ficha que nao da a quantidade vira material extra');
  db.prepare('UPDATE ficha_formula SET ativo=0 WHERE componente_id=?').run(cola);
  fins(cola, '1 / (altura - 140)');
  const n4 = db.prepare("SELECT COUNT(*) n FROM material_extra WHERE origem='falha_baixa'").get().n;
  r = await post('/api/montagem', { codigo:'RT160', kit_ok:1 }, OPE);
  const fx = db.prepare("SELECT * FROM material_extra WHERE origem='falha_baixa' ORDER BY id DESC LIMIT 1").get();
  ok('a embalagem passa e uma linha diz que a ficha nao deu a quantidade da Cola', r.status === 200 &&
    db.prepare("SELECT COUNT(*) n FROM material_extra WHERE origem='falha_baixa'").get().n === n4 + 1 && /Cola/.test(fx.motivo), () => JSON.stringify(fx));
  db.prepare('UPDATE ficha_formula SET ativo=0 WHERE componente_id=?').run(cola);
  db.pragma('foreign_keys = OFF');
  db.exec("INSERT INTO skus (codigo,descricao,estoque,modelo_id,tem_ficha) VALUES ('RTSEM','sem medida',0,50,1)");
  db.pragma('foreign_keys = ON');
  const n5 = db.prepare("SELECT COUNT(*) n FROM material_extra WHERE origem='falha_baixa'").get().n;
  r = await post('/api/montagem', { codigo:'RTSEM', kit_ok:1 }, OPE);
  ok('o SKU sem medida, com material pela ficha no modelo, tambem vira linha', r.status === 200 &&
    db.prepare("SELECT COUNT(*) n FROM material_extra WHERE origem='falha_baixa'").get().n === n5 + 1);

  secao('③ rodada 2 · a sugestao e so o que faltou, e o negativo nao some');
  ok('a sugestao da linha "nao deu a quantidade" e SO o material que faltou, sem quantidade (nunca o que ja baixou)', (() => {
    const sg = JSON.parse(fx.sugestao); return sg.length === 1 && sg[0].componente_id === cola && sg[0].quantidade == null; })(), () => fx.sugestao);
  db.prepare('UPDATE ficha_formula SET ativo=0 WHERE componente_id=?').run(cola);
  fins(cola, 'altura - 200');
  const n6 = db.prepare("SELECT COUNT(*) n FROM material_extra WHERE origem='falha_baixa'").get().n;
  r = await post('/api/montagem', { codigo:'RT160', kit_ok:1 }, OPE);
  ok('a formula que da NEGATIVO num material pela ficha vira linha, e nao some', r.status === 200 &&
    db.prepare("SELECT COUNT(*) n FROM material_extra WHERE origem='falha_baixa'").get().n === n6 + 1);
  db.prepare('UPDATE ficha_formula SET ativo=0 WHERE componente_id=?').run(cola);
  db.pragma('foreign_keys = OFF');
  db.exec("INSERT INTO skus (codigo,descricao,estoque,modelo_id,tem_ficha) VALUES ('REV1','revenda',5,50,0)");
  db.pragma('foreign_keys = ON');
  fins(cola, '1');
  const n7 = db.prepare("SELECT COUNT(*) n FROM material_extra WHERE origem='falha_baixa'").get().n;
  r = await post('/api/montagem', { codigo:'REV1', kit_ok:1 }, OPE);
  ok('o SKU de revenda (sem ficha) nao gera linha sobre a ficha do modelo', r.status === 200 &&
    db.prepare("SELECT COUNT(*) n FROM material_extra WHERE origem='falha_baixa'").get().n === n7);
  db.prepare('UPDATE ficha_formula SET ativo=0 WHERE componente_id=?').run(cola);

  fim();
})();
