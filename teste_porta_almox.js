#!/usr/bin/env node
/* FASE 10 da spec COMPRAS-E-RECEBIMENTO — um sistema de almoxarifado (R-CMP-50).
 *
 *   node teste_porta_almox.js
 *
 * ⚠️ ESCRITO ANTES DO CODIGO e conferido reintroduzindo cada defeito. Sobe o PCP
 * e o sob medida DE VERDADE, cada um no seu banco, ligados como no server.js.
 * Trava:
 *   - a migracao dos enderecos ROLO e SOBRA para o PCP, com a conferencia: todo
 *     rolo e toda sobra com o mesmo endereco, e a contagem por endereco antes =
 *     depois; rodar de novo nao duplica;
 *   - o sob medida le os enderecos do PCP pela porta (o espelho), e a bancada
 *     que cria o buraco novo o cria NO PCP;
 *   - renomear la e recusado (e no PCP), e o nome do PCP chega ao espelho;
 *   - mover o rolo leva o nivel do PCP junto;
 *   - porta caida: o endereco nao some, e a tela diz "sem atualizacao";
 *   - "um so por nivel" vale entre os dois lados;
 *   - o saldo numa lista so (volumes do PCP + rolos e sobras do sob medida).
 * O corte nao muda: a suite do sob medida (cd tecido && npm test) roda igual.
 */
const fs = require('fs'), path = require('path'), os = require('os');
const dirSm = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-almox-'));
process.env.BANCO_TECIDO = path.join(dirSm, 'sob-medida.db');
const { bancada, MODULOS } = require('./util_teste_compras');
const B = bancada({ modulos: MODULOS.concat(['material_route', 'compra_route', 'recebimento_route', 'nota_route', 'almox_route']) });
const { db, post, ok, fim, secao } = B;
const AG = { id:1, nome:'Lucas', admin_geral:true, permissoes:['alcada.definir'] };
const A = require('./almox_dominio');
const sm = require('./tecido/montar').montar(B.app, null, {
  materiais: () => [], pessoas: () => [], permissoes: () => [],
  enderecos: { niveis: id => A.paraSobMedida(db, id), criar: b => A.criarParcial(db, b), ocupado: id => A.ocupadoPorVolume(db, id) } });
require('./sobmedida_almox').ligar({ estoque:sm.estoqueParaPcp });
const smdb = require('./tecido/nucleo/db');
const endereco = require('./tecido/dominio/endereco');
const rolo = require('./tecido/dominio/rolo');
const tecido = require('./tecido/dominio/tecido');
const EP = require('./tecido/nucleo/enderecos_pcp');
const MIG = require('./migrar_enderecos_sobmedida');

(async () => {
  db.exec('CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, pin_hash TEXT, salt TEXT, areas TEXT, ativo INTEGER DEFAULT 1)');
  /* O sob medida ANTES da migracao: enderecos, tres rolos e duas sobras. */
  const lin = tecido.criarLinha({ nome:'Rolo' }), ab = tecido.criarAbertura({ nome:'BK', linha_id:lin.id }), cor = tecido.criarCor({ nome:'Bege' });
  const t = tecido.criarTecido({ linha_id:lin.id, abertura_id:ab.id, cor_id:cor.id });
  const h = endereco.criarHaste({ nome:'A', armazem_chave:'ROLO' }), d = endereco.criarAndar({ nome:'1', haste_id:h.id });
  const n1 = endereco.criarNivel({ nome:'1', andar_id:d.id }).id, n2 = endereco.criarNivel({ nome:'2', andar_id:d.id }).id, n3 = endereco.criarNivel({ nome:'3', andar_id:d.id }).id;
  const hs = endereco.criarHaste({ nome:'S', armazem_chave:'SOBRA' }), ds = endereco.criarAndar({ nome:'1', haste_id:hs.id });
  const ns = endereco.criarNivel({ nome:'1', andar_id:ds.id }).id;
  const r1 = rolo.entrada({ tecido_id:t.id, largura:'3,20', metragem:'50', nivel_id:n1 }, 'Lucas');
  rolo.entrada({ tecido_id:t.id, largura:'3,20', metragem:'40', nivel_id:n2 }, 'Lucas');
  rolo.entrada({ tecido_id:t.id, largura:'2,80', metragem:'30' }, 'Lucas');   // sem endereco
  for(const c of ['S-000001', 'S-000002'])
    smdb.prepare("INSERT INTO sobra (codigo,tecido_id,largura,altura,condicao,nivel_id,status) VALUES (?,?,1.2,0.8,'integra',?,'disponivel')").run(c, t.id, ns);

  secao('a migracao dos enderecos para o PCP, com a conferencia');
  const plano = MIG.planejar(db, smdb);
  ok('o plano diz o que vai migrar (ROLO: 3 niveis, 2 rolos; SOBRA: 1 nivel, 2 sobras)', plano.find(p => p.chave === 'ROLO').niveis === 3 && plano.find(p => p.chave === 'ROLO').rolos === 2 && plano.find(p => p.chave === 'SOBRA').sobras === 2, () => JSON.stringify(plano));
  ok('planejar nao grava nada', db.prepare("SELECT COUNT(*) n FROM almoxarifado WHERE origem_sm IS NOT NULL").get().n === 0);
  const antes = MIG.enderecosSm(smdb);
  let conf = MIG.aplicar(db, smdb);
  ok('aplicado: zero divergencia, quatro conferidos (2 rolos com endereco + 2 sobras)', conf.divergencias.length === 0 && conf.conferidos === 4, () => JSON.stringify(conf));
  const almR = db.prepare("SELECT * FROM almoxarifado WHERE origem_sm='ROLO'").get();
  ok('nascem "Tecidos novos" (ROLO) e "Sobras de tecido" (SOBRA) no PCP', almR && almR.nome === 'Tecidos novos' && !!db.prepare("SELECT 1 FROM almoxarifado WHERE origem_sm='SOBRA' AND nome='Sobras de tecido'").get());
  ok('os enderecos vieram com os mesmos nomes e o id antigo guardado', db.prepare("SELECT COUNT(*) n FROM alm_nivel WHERE origem_sm_id IS NOT NULL").get().n === 4);
  const rr = smdb.prepare('SELECT * FROM rolo WHERE id=?').get(r1.id);
  ok('o rolo guarda o nivel do PCP e o nome dele', rr.nivel_pcp_id && rr.nivel_pcp_nome === 'Tecidos novos · A · 1 · 1', () => JSON.stringify(rr));
  ok('o nivel_id de sempre NAO mudou (corte, sobra e plano continuam iguais)', rr.nivel_id === n1);
  const depois = MIG.enderecosPcp(db, smdb);
  ok('o endereco de cada rolo e sobra e o mesmo antes e depois', Object.keys(antes).length === 4 && Object.keys(antes).every(k => antes[k] === depois[k]), () => JSON.stringify({ antes, depois }));
  /* a conferencia ACUSA: um rolo apontado para o nivel errado do PCP */
  const certo = smdb.prepare('SELECT nivel_pcp_id FROM rolo WHERE id=?').get(r1.id).nivel_pcp_id;
  const errado = db.prepare('SELECT id FROM alm_nivel WHERE id<>? LIMIT 1').get(certo).id;
  smdb.prepare('UPDATE rolo SET nivel_pcp_id=? WHERE id=?').run(errado, r1.id);
  const ruim = MIG.conferir(db, smdb, antes);
  ok('a conferencia acusa o rolo fora do endereco (e a contagem por endereco que mudou)', ruim.divergencias.length >= 2 && ruim.divergencias.some(x => /^rolo:/.test(x)), () => JSON.stringify(ruim));
  smdb.prepare('UPDATE rolo SET nivel_pcp_id=? WHERE id=?').run(certo, r1.id);
  conf = MIG.aplicar(db, smdb);
  ok('rodar de novo nao duplica nada, e confere de novo', conf.divergencias.length === 0 && db.prepare('SELECT COUNT(*) n FROM alm_nivel').get().n === 4 && db.prepare('SELECT COUNT(*) n FROM almoxarifado WHERE origem_sm IS NOT NULL').get().n === 2);

  secao('o sob medida le os enderecos do PCP pela porta');
  A.criarEnderecos(db, almR.id, { haste:'B', andares:['1'], niveis:['1'] });
  let arv = endereco.arvore('ROLO');
  ok('o endereco criado no PCP aparece no sob medida (o espelho)', arv.some(x => x.nome === 'B' && x.andares[0].niveis.length === 1), () => JSON.stringify(arv.map(x => x.nome)));
  const novo = endereco.criarNivel({ nome:'4', andar_id:d.id }, { nome:'Bancada', permissoes:[] });
  const pcpN4 = db.prepare("SELECT n.id FROM alm_nivel n JOIN alm_andar d ON d.id=n.andar_id JOIN alm_haste h ON h.id=d.haste_id WHERE h.almoxarifado_id=? AND h.nome='A' AND n.nome='4'").get(almR.id);
  ok('a bancada cria o buraco novo: ele nasce NO PCP e chega ao espelho, com o id de la', !!pcpN4 && smdb.prepare('SELECT pcp_id FROM nivel WHERE id=?').get(novo.id).pcp_id === pcpN4.id);
  ok('e continua marcado para conferir, como antes (R-SME-01)', smdb.prepare('SELECT conferir, criado_por FROM nivel WHERE id=?').get(novo.id).criado_por === 'Bancada');
  const rotas = require('./tecido/rotas/cadastros').rotas;
  const put = rotas.find(x => x.metodo === 'PUT' && x.caminho === '/api/niveis/:id');
  let erro = null; try{ put.manipulador({ params:{ id:n3 }, corpo:{ nome:'3B' } }); }catch(e){ erro = e; }
  ok('renomear no sob medida e recusado, dizendo que e no PCP', erro && /PCP/.test(erro.mensagem || erro.message));
  const p3 = smdb.prepare('SELECT pcp_id FROM nivel WHERE id=?').get(n3).pcp_id;
  A.renomear(db, 'nivel', p3, { nome:'3-fundo' });
  endereco.arvore('ROLO');
  ok('renomeado no PCP, o espelho recebe o nome na proxima leitura', smdb.prepare('SELECT nome FROM nivel WHERE id=?').get(n3).nome === '3-fundo');

  secao('mover o rolo leva o nivel do PCP junto');
  rolo.mover(r1.id, n3, 'Lucas');
  const rm = smdb.prepare('SELECT * FROM rolo WHERE id=?').get(r1.id);
  ok('o rolo no nivel novo tem o nivel do PCP e o nome novo', rm.nivel_pcp_id === p3 && rm.nivel_pcp_nome === 'Tecidos novos · A · 1 · 3-fundo', () => JSON.stringify(rm));

  secao('um so por nivel entre os dois lados');
  const comp = (await post('/api/componentes', { nome:'Rolo ML', unidade:'m', modo_saldo:'volume', um_por_nivel:1, almoxarifado_id:almR.id }, AG)).corpo.id;
  const forn = (await post('/api/fornecedores', { nome:'ML' }, AG)).corpo.id;
  const of = (await post('/api/ofertas', { fornecedor_id:forn, componente_id:comp, embalagem:'rolo', fator:50, preco:400 }, AG)).corpo.id;
  const pid = (await post('/api/pedidos', { itens:[{ oferta_id:of, necessidade:50 }] }, AG)).corpo.pedidos[0].id;
  await post('/api/pedidos/' + pid + '/comprar', { canal:'mercado_livre', numero_externo:'1', comprado_em:'2026-11-01' }, AG);
  await post('/api/recebimento', { pedido_id:pid, itens:[{ pedido_item_id:db.prepare('SELECT id FROM pedido_item WHERE pedido_id=?').get(pid).id, volumes:[{ metragem:50 }] }] }, AG);
  const pcpN1 = smdb.prepare('SELECT pcp_id FROM nivel WHERE id=?').get(n2).pcp_id;   // o nivel 2 tem um rolo do sob medida
  erro = null; try{ A.mover(db, 'M-000001', { nivel_id:pcpN1 }, AG); }catch(e){ erro = e; }
  ok('o volume do PCP nao entra no nivel onde ha um rolo do sob medida (diz qual)', erro && erro.status === 409 && /R-\d{6}/.test(erro.message), () => erro ? erro.message : 'passou');
  A.mover(db, 'M-000001', { nivel_id:pcpN4.id }, AG);
  erro = null; try{ rolo.mover(r1.id, novo.id, 'Lucas'); }catch(e){ erro = e; }
  ok('e o rolo do sob medida nao entra no nivel onde ha um volume do PCP (diz qual)', erro && /M-000001/.test(erro.mensagem || erro.message), () => erro ? erro.message : 'passou');

  secao('o saldo numa lista so');
  let est = A.estoque(db, almR.id);
  ok('o painel do almoxarifado traz os rolos do sob medida E o volume do PCP', est.itens.some(x => x.origem === 'sob medida' && /^R-/.test(x.codigo)) && est.itens.some(x => x.origem === 'PCP' && x.codigo === 'M-000001') && !est.sob_medida_fora, () => JSON.stringify(est).slice(0, 300));
  const estS = A.estoque(db, db.prepare("SELECT id FROM almoxarifado WHERE origem_sm='SOBRA'").get().id);
  ok('e o das sobras traz as duas sobras', estS.itens.filter(x => /^S-/.test(x.codigo)).length === 2);
  require('./sobmedida_almox').ligar(null);
  est = A.estoque(db, almR.id);
  ok('sem a porta, o PCP lista o que e dele e DIZ que o sob medida ficou de fora', est.sob_medida_fora === true && /sob medida/.test(est.motivo) && est.itens.some(x => x.codigo === 'M-000001'));
  require('./sobmedida_almox').ligar({ estoque:sm.estoqueParaPcp });

  secao('se a porta cair, o endereco nao some');
  EP.ligar(null);
  const e1 = endereco.estadoPcp();
  ok('o estado diz "sem atualizacao", com o motivo', e1.migrado && e1.sem_atualizacao && /ligada/.test(e1.motivo), () => JSON.stringify(e1));
  arv = endereco.arvore('ROLO');
  ok('a arvore continua com os enderecos conhecidos (nunca vazia)', arv.length >= 2);
  ok('o rolo continua com o nome do endereco gravado', smdb.prepare('SELECT nivel_pcp_nome FROM rolo WHERE id=?').get(r1.id).nivel_pcp_nome === 'Tecidos novos · A · 1 · 3-fundo');
  erro = null; try{ endereco.criarNivel({ nome:'9', andar_id:d.id }, { nome:'X', permissoes:[] }); }catch(e){ erro = e; }
  ok('criar endereco sem a porta e recusado (nao nasce so de um lado)', erro && /PCP/.test(erro.mensagem || erro.message));
  fim();
})().catch(e => { console.error(e); process.exit(1); });
