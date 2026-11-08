#!/usr/bin/env node
/* Testes da spec RELATORIOS-UNIFICADOS (08/11/2026) — a central de relatórios
 * na 904 e a 905 Minha produção.
 *
 *   node teste_relatorios.js
 *
 * Sobe um banco temporário com as tabelas dos donos de verdade (plan_route,
 * exp_route, mont_route, cad_route, dev_route, devcaso_route, o inventário, o
 * fim do dia) e chama as rotas direto. Não toca em produção.
 *
 * O que trava (§3 e §4 da spec):
 *  - a semana é de segunda a domingo, e a da reunião é a última completa;
 *  - a venda cancelada e o modo teste ficam fora; conta-se PEÇA (Unidades);
 *  - o item faltante não é devolução; a taxa é devoluções ÷ vendas;
 *  - a caixa da coleta sai quando o caminhão leva, e não no bipe;
 *  - "sem registro" não é zero;
 *  - nenhum valor em reais sai de rota nenhuma;
 *  - cada pessoa vê só o que é dela, e a equipe sem nome não leva nome nem id;
 *  - o relatório do mês das devoluções é o MESMO do período;
 *  - o retrato diário das pendências (R7) é uma linha por dia;
 *  - o relatorios_dominio.js não tem SQL (a central não conta nada).
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-rel-'));
process.env.PCP_DIR = tmp;

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra !== undefined ? '   ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };

const db = new Database(path.join(tmp, 't.db'));
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '', estoque INTEGER DEFAULT 0,
    alvo INTEGER DEFAULT 0, modelo_id INTEGER, largura_cm INTEGER, altura_cm INTEGER, cor_codigo TEXT, tecido_codigo TEXT, ativo INTEGER DEFAULT 1);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, sob_medida INTEGER DEFAULT 0, exige_medida INTEGER DEFAULT 1);
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nome TEXT);
  CREATE TABLE revisao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, inicio TEXT, fim TEXT, segundos INTEGER,
    data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')), modo TEXT DEFAULT 'hoje',
    teste INTEGER DEFAULT 0, usuario_id INTEGER, usuario_nome TEXT);
  CREATE TABLE producao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, qtd INTEGER, produzido INTEGER DEFAULT 0,
    data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')),
    origem TEXT DEFAULT 'manual', urgente INTEGER DEFAULT 0, teste INTEGER DEFAULT 0);
  CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, situacao TEXT, teste INTEGER DEFAULT 0);
`);
db.prepare("INSERT INTO modelo (id,codigo,nome) VALUES (1,'ROLO','Rolô')").run();
db.prepare("INSERT INTO usuarios (id,nome) VALUES (7,'Ana Revisora'),(8,'Bruno Embalador')").run();

const rotas = {};
const PERMS = {};   // uid -> Set de chaves (o podePermissao de mentira)
const app = { get:(p,...h)=>{ rotas['GET '+p]=h[h.length-1]; }, post:(p,...h)=>{ rotas['POST '+p]=h[h.length-1]; },
  put(){}, delete(){}, patch(){}, use(){},
  locals:{ acesso:{ auditar(){}, podePermissao(u, c){ return !!(u && PERMS[u.id] && PERMS[u.id].has(c)); } } } };
for(const m of ['plan_route', 'exp_route', 'mont_route', 'cad_route', 'dev_route', 'devcaso_route', 'pendencias_route', 'rel_route'])
  require('./' + m)(app, db);
require('./baixa_dominio');
try{ db.exec('ALTER TABLE lote ADD COLUMN baixado_em TEXT'); }catch(e){}
for(const c of ['usuario_id INTEGER', 'usuario_nome TEXT']) try{ db.exec('ALTER TABLE montagem ADD COLUMN ' + c); }catch(e){}
require('./inventario_dominio').garantirSchema(db);
require('./fim_dia').garantir(db);

const chamar = (k, query, usuario) => new Promise(r => {
  if(!rotas[k]) return r({ __sem_rota:k });
  let st = 200;
  const res = { json:o=>r(Object.assign({ __st:st }, o)), status(n){ st = n; return res; }, send:o=>r(o), setHeader(){} };
  try{ rotas[k]({ body:{}, params:{}, query:query||{}, headers:{}, usuario: usuario === undefined ? { id:1, nome:'Dono' } : usuario }, res); }
  catch(e){ r({ __st:500, __erro:String(e.stack||e) }); }
});

const REL = require('./relatorios_dominio');
const D = REL.ultimoDomingo(db);              // o domingo da última semana completa
const S = n => REL.mais(D, n);                // S(-6) é a segunda dessa semana
const hoje = require('./relogio').hoje();

/* nenhuma chave de dinheiro em lugar nenhum da resposta */
const DINHEIRO = /valor|custo|preco|preço|frete|saldo|dinheiro|centavo|reais/i;
const chavesDe = (o, acc = []) => { if(o && typeof o === 'object') for(const k of Object.keys(o)){ acc.push(k); chavesDe(o[k], acc); } return acc; };

(async () => {
  /* ═════════ 0. A semana ═════════ */
  ok('a semana da reunião termina num domingo, antes de hoje', new Date(D + 'T12:00:00Z').getUTCDay() === 0 && D < hoje, D);
  ok('e é a ÚLTIMA completa: o próximo domingo já é hoje ou depois', REL.mais(D, 7) >= hoje, { D, hoje });

  /* ═════════ 1. Vendas: peça, sem cancelada, sem teste ═════════ */
  const vf = db.prepare(`INSERT INTO venda_futura (venda_id,codigo,data_venda,unidades,grupo,estado,cancelada,teste) VALUES (?,?,?,?,?,?,?,?)`);
  vf.run('v1', 'A', S(-6), 3, 'entregue', 'Entregue', 0, 0);       // segunda: 3 peças
  vf.run('v2', 'A', S(0), 1, 'pos_venda', 'Devolução', 0, 0);      // domingo: o pós-venda conta
  vf.run('v3', 'A', S(-3), 5, 'cancelada', 'Cancelada', 1, 0);     // cancelada: fora
  vf.run('v4', 'A', S(-3), 9, 'entregue', 'Entregue', 0, 1);       // teste: fora
  vf.run('v5', 'B', S(1), 4, 'entregue', 'Entregue', 0, 0);        // segunda seguinte: outra semana
  vf.run('v6', 'B', S(-7), 2, 'entregue', 'Entregue', 0, 0);       // domingo anterior: semana anterior
  db.prepare("INSERT INTO skus (codigo,cor_codigo,largura_cm,altura_cm,modelo_id) VALUES ('A','BEGE',140,140,1),('B','CINZA',160,160,1)").run();

  /* ═════════ 2. Devoluções e item faltante ═════════ */
  db.prepare("INSERT INTO devolucao (codigo_ml,sku_fisico,motivo,data,teste) VALUES ('x','A','Defeito',?,0)").run(S(-2));
  db.prepare("INSERT INTO devolucao (codigo_ml,sku_fisico,motivo,data,teste) VALUES ('y','A','Defeito',?,1)").run(S(-2));
  const dc = db.prepare("INSERT INTO devolucao_caso (tipo,etapa,venda,sku,motivo,criado_em,teste) VALUES (?,'aguardando',?,?,?,?,0)");
  dc.run('ml', 'p1', 'A', 'Arrependimento', S(-1) + ' 10:00:00');
  dc.run('envio', 'p2', 'B', 'Falta de kit', S(-1) + ' 11:00:00');

  /* ═════════ 3. Embalagem e saída ═════════ */
  const mt = db.prepare("INSERT INTO montagem (codigo,segundos,data,teste,usuario_id) VALUES (?,?,?,?,?)");
  mt.run('A', 60, S(-5), 0, 8); mt.run('A', 80, S(-5), 0, 8); mt.run('A', 100, S(-4), 0, 7); mt.run('A', 50, S(-4), 1, 8);
  const lt = db.prepare(`INSERT INTO lote (codigo,estagio,data,embalado_em,baixado_em,carregado_em,retirado_em,despachar_em,modalidade,teste,impresso_por_id,conferido_por_id,conferido_em)
    VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?)`);
  const l1 = lt.run('A', 'carregado', S(-6), S(-6) + ' 09:00:00', S(-5) + ' 09:00:00', S(-5) + ' 10:00:00', null, S(-5), 'agencia', 7, 8, S(-5) + ' 09:00:00').lastInsertRowid;
  db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd) VALUES (?,?,2)").run(l1, 'A');                       // caixa de 2 peças
  lt.run('A', 'carregado', S(-6), S(-6) + ' 09:00:00', S(-4) + ' 09:00:00', S(-3) + ' 10:00:00', null, S(-4), 'agencia', 7, 8, S(-4) + ' 09:00:00');   // agência atrasada
  // coleta: bipada no canto NO PRAZO, mas o caminhão só levou depois -> atrasada
  lt.run('A', 'carregado', S(-6), S(-6) + ' 09:00:00', S(-4) + ' 09:00:00', S(-4) + ' 08:00:00', S(-2) + ' 15:00:00', S(-3), 'coleta', 7, 8, S(-4) + ' 08:00:00');

  /* ═════════ 4. O resumo da semana ═════════ */
  const s = await chamar('GET /api/rel/semana', {});
  ok('a rota do resumo responde', s.__st === 200 && s.semana, s);
  ok('a semana é de segunda a domingo', s.semana.de === S(-6) && s.semana.ate === D, s.semana);
  ok('vendas da semana em PEÇA: 3 + 1 (o pós-venda conta); a cancelada e o teste fora', s.semana.vendas === 4, s.semana);
  ok('a semana anterior pega o domingo anterior (2)', s.anterior.vendas === 2, s.anterior);
  ok('devoluções: a sem caso + o caso "ML devolve"; o item faltante à parte', s.semana.devolucoes === 2 && s.semana.item_faltante === 1, s.semana);
  ok('a taxa de devolução é devoluções ÷ vendas (2 ÷ 4 = 50%)', s.semana.taxa_devolucao === 50, s.semana.taxa_devolucao);
  ok('embaladas: as 3 de verdade (a de teste fora)', s.semana.embaladas === 3, s.semana);
  ok('saiu: em PEÇA — a caixa de 2 conta 2', s.semana.saiu === 2 + 1 + 1, s.semana.saiu);
  ok('despacho: 1 no prazo, 2 atrasadas — a coleta conta pelo caminhão, e não pelo bipe',
     s.semana.despacho && s.semana.despacho.no_prazo === 1 && s.semana.despacho.atrasado === 2, s.semana.despacho);
  ok('o despacho no prazo em % (1 de 3)', s.semana.despacho_no_prazo_pct === 33.3, s.semana.despacho_no_prazo_pct);
  ok('"sem registro" não é zero: antes da primeira embalagem, a semana sai null', s.semanas[2].embaladas === null, s.semanas[2]);
  ok('a média de 4 semanas só usa as que têm registro, e diz de quantas', s.media4.vendas && s.media4.vendas.semanas === 1 && s.media4.vendas.media === 2, s.media4.vendas);
  ok('o resumo diz desde quando cada número existe', s.desde.vendas === S(-7) && s.desde.embalagem === S(-5), s.desde);
  const s2 = await chamar('GET /api/rel/semana', { domingo: S(-7) });
  ok('as setas trocam de semana (domingo dado)', s2.semana.ate === S(-7) && s2.semana.vendas === 2, s2.semana);
  ok('um dia qualquer vira o domingo da semana dele', (await chamar('GET /api/rel/semana', { domingo: S(-3) })).semana.ate === D);

  /* ═════════ 5. Vendas: o mês a mês e o período ═════════ */
  const v = await chamar('GET /api/rel/vendas', { de: S(-6), ate: D });
  ok('o período soma as peças sem a cancelada (4)', v.periodo.total === 4, v.periodo);
  ok('o SKU que mais vende vem primeiro', v.periodo.top_skus[0].codigo === 'A' && v.periodo.top_skus[0].pecas === 4, v.periodo.top_skus);
  ok('a cor e a medida saem do CADASTRO', v.periodo.cores[0].cor === 'BEGE' && v.periodo.medidas[0].medida === '140×140', v.periodo);
  ok('o mês a mês existe, e o mês de hoje vem marcado parcial com a projeção',
     Array.isArray(v.meses) && v.meses.some(m => m.mes === hoje.slice(0, 7) ? (m.parcial && m.projecao != null) : true), v.meses);
  const vm = require('./demanda_dominio').vendasPorMes(db);
  ok('o mês a mês soma igual ao dia a dia (uma régua só)', vm.reduce((a, m) => a + m.pecas, 0) === 3 + 1 + 4 + 2, vm);

  /* ═════════ 6. O relatório do mês das devoluções é o do período ═════════ */
  const DEV = require('./devcaso_dominio');
  const mesD = S(-1).slice(0, 7);
  const rm = DEV.relatorio(db, mesD, false), rp = DEV.relatorioPeriodo(db, mesD + '-01', mesD + '-31', false);
  ok('o mês e o período dão o mesmo total', rm.total === rp.total && rm.casos === rp.casos && rm.sem_caso === rp.sem_caso, { rm, rp });
  ok('e o mês continua dizendo qual é', rm.mes === mesD);
  ok('por tipo: ML devolve, nós coletamos, item faltante e sem caso', rp.por_tipo.ml >= 1 && rp.por_tipo.envio >= 1 && rp.por_tipo.sem_caso >= 1, rp.por_tipo);

  /* ═════════ 7. Expedição e estoque ═════════ */
  db.prepare("INSERT INTO fim_dia (dia, ids, teste) VALUES (?, '[1,2,3]', 0)").run(S(-3));
  const ex = await chamar('GET /api/rel/expedicao', { de: S(-6), ate: D });
  ok('a expedição traz o despacho dia a dia', ex.dias.length === 7 && ex.dias.reduce((a, d) => a + d.atrasado, 0) === 2, ex.dias);
  ok('e a coleta que não passou, com as caixas', ex.coleta_nao_passou.length === 1 && ex.coleta_nao_passou[0].caixas === 3, ex.coleta_nao_passou);
  db.prepare("INSERT INTO producao (codigo,qtd,data,origem,urgente) VALUES ('A',2,?,'ml',1),('B',1,?,'ml',1),('A',5,?,'manual',0)").run(S(-2), S(-2), S(-2));
  const es = await chamar('GET /api/rel/estoque', { de: S(-6), ate: D });
  ok('falta de estoque: só a urgência do PDF (a ordem manual fora)', es.urgencia.dias.reduce((a, d) => a + d.pecas, 0) === 3, es.urgencia);
  ok('e de quais SKUs', es.urgencia.skus[0].codigo === 'A' && es.urgencia.skus[0].pecas === 2, es.urgencia.skus);
  ok('o acerto do inventário mês a mês (6 meses)', Array.isArray(es.acuracidade) && es.acuracidade.length === 6, es.acuracidade);

  /* ═════════ 8. O retrato diário das pendências (R7) ═════════ */
  const PDIA = require('./pendencias_dia');
  PDIA.gravar(db, { total:5, sem_etiqueta:1, linhas:[{ chave:'bloqueados', n:2 }, { chave:'sku', n:3 }] });
  PDIA.gravar(db, { total:4, sem_etiqueta:0, linhas:[{ chave:'bloqueados', n:1 }, { chave:'sku', n:3 }] });
  const pd = PDIA.porPeriodo(db, hoje, hoje);
  ok('uma linha por dia, com o ÚLTIMO retrato', pd.length === 1 && pd[0].total === 4 && pd[0].bloqueados === 1, pd);
  ok('a falha ao gravar não derruba nada (vai ao log)', (() => { try{ PDIA.gravar(db, {}); return true; }catch(e){ return false; } })());

  /* ═════════ 9. Por pessoa ═════════ */
  const rv = db.prepare("INSERT INTO revisao (codigo,segundos,data,teste,usuario_id) VALUES (?,?,?,?,?)");
  rv.run('A', 30, S(-5), 0, 7); rv.run('A', 50, S(-5), 0, 7); rv.run('A', 40, S(-5), 0, 8); rv.run('A', 10, S(-5), 0, null);
  PERMS[20] = new Set(['produtividade.equipe']);
  PERMS[21] = new Set(['produtividade.equipe', 'produtividade.nominal']);
  const pe = await chamar('GET /api/rel/pessoas', { de: S(-6), ate: D }, { id:20, nome:'Sup' });
  const revE = pe.etapas.find(e => e.chave === 'revisao');
  ok('a equipe: o total e quantas pessoas (com 2, sem a distribuição — ver o caso 10-B)', revE.total === 3 && revE.pessoas === 2
     && revE.por_pessoa === null, revE);
  rv.run('A', 30, S(-5), 0, 9); rv.run('A', 30, S(-5), 0, 9); rv.run('A', 30, S(-5), 0, 9);
  const pe3 = (await chamar('GET /api/rel/pessoas', { de: S(-6), ate: D }, { id:20, nome:'Sup' })).etapas.find(e => e.chave === 'revisao');
  ok('com 3 pessoas ou mais, menor/mediana/maior por pessoa (1, 2, 3)', pe3.pessoas === 3 && pe3.por_pessoa
     && pe3.por_pessoa.menor === 1 && pe3.por_pessoa.mediana === 2 && pe3.por_pessoa.maior === 3, pe3);
  ok('a revisão sem id não é de ninguém (fica fora)', revE.total === 3);
  ok('SEM a de nome: nenhum nome e nenhum id viajam', !pe.com_nome && !JSON.stringify(pe).includes('Ana') && !pe.etapas.some(e => e.lista), pe);
  const pn = await chamar('GET /api/rel/pessoas', { de: S(-6), ate: D }, { id:21, nome:'Admin' });
  const revN = pn.etapas.find(e => e.chave === 'revisao');
  ok('COM a de nome: cada pessoa, com o nome do cadastro (quem não está no cadastro sai como "pessoa #id")', pn.com_nome && revN.lista.length === 3 && revN.lista.some(p => p.nome === 'Ana Revisora' && p.qtd === 2) && revN.lista.some(p => p.nome === 'pessoa #9'), revN);
  const ana = revN.lista.find(p => p.nome === 'Ana Revisora');
  ok('o tempo é a mediana, com o maior ao lado (30 e 50 → 40)', ana.tempo_mediana === 40 && ana.tempo_maior === 50, ana);
  const embN = pn.etapas.find(e => e.chave === 'embalagem');
  ok('a embalagem de teste não conta para ninguém', embN.total === 3, embN);
  ok('etiquetas impressas e conferidas, pelo id', pn.etapas.find(e => e.chave === 'etiqueta').total === 3
     && pn.etapas.find(e => e.chave === 'conferencia').total === 3, pn.etapas);

  /* ═════════ 10. A minha produção ═════════ */
  db.prepare("INSERT INTO revisao (codigo,segundos,data,teste,usuario_id) VALUES ('A',20,?,0,7),('A',20,?,0,8)").run(hoje, hoje);
  const mi = await chamar('GET /api/rel/minha', {}, { id:7, nome:'Ana Revisora' });
  const hojeR = mi.periodos.find(p => p.chave === 'hoje').etapas.find(e => e.chave === 'revisao');
  ok('a minha produção de hoje: só a da pessoa logada', hojeR.qtd === 1, mi);
  ok('três períodos: hoje, nesta semana e neste mês', mi.periodos.map(p => p.chave).join() === 'hoje,semana,mes');
  ok('"nesta semana" começa na segunda', new Date(mi.periodos[1].de + 'T12:00:00Z').getUTCDay() === 1, mi.periodos[1]);
  ok('não há parâmetro de pessoa: pedir a de outro não muda nada',
     JSON.stringify((await chamar('GET /api/rel/minha', { usuario_id:8, id:8 }, { id:7, nome:'Ana Revisora' })).periodos) === JSON.stringify(mi.periodos));
  ok('sem login é 401', (await chamar('GET /api/rel/minha', {}, null)).__st === 401);

  /* ═════════ 10-B. A revisão (③): o que a tela mostraria errado ═════════ */
  const vMes = (await chamar('GET /api/rel/vendas', {})).meses.find(m => m.parcial);
  ok('o mês de hoje (parcial) compara PELA PROJEÇÃO, e diz isso — mês pela metade contra mês cheio seria queda falsa',
     !vMes || (vMes.crescimento_pela_projecao === true), vMes);
  const peq = (await chamar('GET /api/rel/pessoas', { de: S(-6), ate: D }, { id:20, nome:'Sup' })).etapas.find(e => e.chave === 'embalagem');
  ok('sem nome, com MENOS DE 3 pessoas na etapa, só o total viaja (o menor e o maior seriam o número de alguém)',
     peq.pessoas === 2 && peq.por_pessoa === null && peq.total === 3, peq);
  const sF = await chamar('GET /api/rel/semana', { domingo: REL.mais(D, 14) });
  ok('uma semana que ainda não acabou não se pede: volta para a última completa', sF.semana.ate === D, sF.semana);
  ok('e o ▶ não passa da última completa', (await chamar('GET /api/rel/semana', {})).proxima === null);

  /* ═════════ 11. Nenhum valor em reais ═════════ */
  for(const [k, q, u] of [['GET /api/rel/semana', {}], ['GET /api/rel/vendas', {}], ['GET /api/rel/producao', {}], ['GET /api/rel/expedicao', {}],
                          ['GET /api/rel/estoque', {}], ['GET /api/rel/pessoas', {}, { id:21, nome:'Admin' }], ['GET /api/rel/minha', {}, { id:7, nome:'Ana' }]]){
    const r = await chamar(k, q, u);
    const ruins = chavesDe(r).filter(c => DINHEIRO.test(c));
    ok(k + ': nenhuma chave de dinheiro', r.__st === 200 && !ruins.length, ruins.length ? ruins : r);
  }

  /* ═════════ 12. A central não conta nada ═════════ */
  const fonte = fs.readFileSync(path.join(__dirname, 'relatorios_dominio.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok('o relatorios_dominio.js não tem SQL (pergunta aos donos)', !/\.prepare\(|\.exec\(|SELECT\s/i.test(fonte));

  /* ═════════ 13. Alçada ═════════ */
  const T = require('./telas').TELAS.find(t => t.n === 905);
  ok('a 905 está no mapa: nível Operação, aberta com "Ver a própria produção"',
     T && T.rota === '/minha-producao' && T.nivel === 'operacao' && T.perms.join() === 'produtividade.propria', T);
  const P = require('./permissoes');
  const lista = P.PERMISSOES || P.LISTA || P;
  const prop = (Array.isArray(lista) ? lista : []).find(x => x.chave === 'produtividade.propria');
  ok('a permissão aponta para a tela onde é usada (905)', !prop || prop.tela === 905, prop);
  const ac = fs.readFileSync(path.join(__dirname, 'acesso.js'), 'utf8');
  ok('as rotas da minha produção e do por pessoa têm linha própria, ANTES do /api/rel',
     ac.indexOf("eq('/api/rel/minha')") > 0 && ac.indexOf("eq('/api/rel/minha')") < ac.indexOf("if(pre('/api/rel')) return 'relatorios.ver'")
     && ac.indexOf("eq('/api/rel/pessoas')") < ac.indexOf("if(pre('/api/rel')) return 'relatorios.ver'"));
  const au = fs.readFileSync(path.join(__dirname, 'auth.js'), 'utf8');
  ok('a 905 está na lista protegida do auth.js (sem sessão vai ao login)', /'\/minha-producao':/.test(au) && /'\/minha-producao\.html':/.test(au));

  console.log('\n' + (falhas ? 'FALHARAM ' + falhas + ' de ' + casos : 'todos os ' + casos + ' casos passaram'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
