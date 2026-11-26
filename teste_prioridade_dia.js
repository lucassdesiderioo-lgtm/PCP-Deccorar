#!/usr/bin/env node
/* teste_prioridade_dia.js — a venda da próxima saída vira prioridade assim que
 * o PDF sobe (spec PRIORIDADE-PROXIMA-SAIDA, decisão do dono de 26/11/2026).
 *
 *   node teste_prioridade_dia.js
 *
 *   1  a próxima saída: segunda a sexta, sem sábado, pulando o "sem coleta" da 206
 *   2  o pedido da prioridade: hoje e próxima, sem a de mais adiante nem a impressa
 *   3  a urgência pela régua nova, qualquer que seja o dia do upload
 *   4  a virada do dia: a primeira leitura refaz a urgência uma vez
 *   5  a tarja: hoje usa o livre primeiro, a próxima saída conta junto
 *   6  a 102: a venda da próxima saída é vermelha, atrás da de hoje
 *   7  a 101: a venda de amanhã subida ontem fica em Hoje, e não conta duas vezes
 *
 * Sobe um banco temporário (PCP_DIR) e chama os donos e as rotas direto.
 */
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-prioridade-'));
process.env.PCP_DIR = tmp;

let n = 0, falhas = 0;
function ok(desc, cond, det){ n++; if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (det !== undefined ? '\n         ' + JSON.stringify(det) : '')); } }
const eq = (desc, a, b) => ok(desc, JSON.stringify(a) === JSON.stringify(b), { esperado:b, veio:a });

const db = require('./db');
const rotas = {};
const app = { get(p,...h){ rotas['GET '+p] = h[h.length-1]; }, post(p,...h){ rotas['POST '+p] = h[h.length-1]; },
  put(){}, delete(){}, patch(){}, use(){}, locals:{ acesso:{ auditar(){}, podePermissao(){ return true; }, ehAdminGeral(){ return false; } } } };
require('./exp_route')(app, db);
require('./plan_route')(app, db);
require('./mont_route')(app, db);
require('./cad_route')(app, db);
require('./revisao_route')(app, db);
try{ require('./coleta_horario').garantirSchema && require('./coleta_horario').garantirSchema(db); }catch(e){}
function chamar(metodo, rota, corpo){
  const h = rotas[metodo+' '+rota];
  if(!h) return { status:'sem rota' };
  const out = { status:200 };
  const res = { status(c){ out.status = c; return res; }, json(b){ out.body = b; return res; }, send(b){ out.body = b; return res; }, setHeader(){} };
  try{ h({ body:corpo||{}, params:{}, query:{}, headers:{}, usuario:{ id:1, nome:'Ana' } }, res); }
  catch(e){ return { status:500, body:{ erro:String(e.stack||e) } }; }
  return out;
}

const P = require('./prioridade_dia');
const URG = require('./urgencia');
const T = require('./tarja_estoque');

console.log('\n── 1. a próxima saída ──');
db.exec(`CREATE TABLE IF NOT EXISTS saida_dia (data TEXT PRIMARY KEY, sem_coleta INTEGER DEFAULT 0)`);
eq('quarta 25/11: quinta', P.proximaSaida(db, '2026-11-25'), '2026-11-26');
eq('sexta 27/11 (o PDF da segunda sobe na sexta): segunda', P.proximaSaida(db, '2026-11-27'), '2026-11-30');
eq('sábado: segunda (não há coleta no sábado)', P.proximaSaida(db, '2026-11-28'), '2026-11-30');
eq('domingo: segunda', P.proximaSaida(db, '2026-11-29'), '2026-11-30');
db.prepare("INSERT INTO saida_dia (data,sem_coleta) VALUES ('2026-11-26',1) ON CONFLICT(data) DO UPDATE SET sem_coleta=1").run();
eq('quarta com a quinta "sem coleta" na 206: sexta', P.proximaSaida(db, '2026-11-25'), '2026-11-27');
db.prepare("DELETE FROM saida_dia WHERE data='2026-11-26'").run();
eq('o rótulo: "amanhã"', P.rotulo(db, '2026-11-26', '2026-11-25'), 'amanhã');
eq('o rótulo: "seg 30/11"', P.rotulo(db, '2026-11-30', '2026-11-27'), 'seg 30/11');
let erro = null; try{ P.regua('l', "2026-11-26' OR 1=1 --"); }catch(e){ erro = e; }
ok('a régua recusa data que não é data', !!erro);

/* ── o banco: datas relativas a hoje ── */
const hoje = P.hoje(db), ate = P.proximaSaida(db), ontem = P.addDias(hoje, -1), longe = P.addDias(hoje, 30);
db.exec(`INSERT OR IGNORE INTO modelo (id,codigo,nome,sob_medida,exige_medida) VALUES (1,'ROLO','Rolô',0,1)`);
const sku = db.prepare('INSERT INTO skus (codigo,estoque,modelo_id,largura_cm,altura_cm) VALUES (?,?,1,140,160)');
sku.run('HOJEAMANHA', 2);   // saldo 2, 1 em caixa impressa → 1 livre · 1 venda de hoje · 2 da próxima saída
sku.run('SOAMANHA', 0);     // 0 livre · 2 da próxima saída (subidas ONTEM)
sku.run('LONGE', 0);        // só vende daqui a 30 dias
sku.run('COBERTO', 5);      // 1 de hoje e 1 da próxima, com sobra
const lote = db.prepare('INSERT INTO lote (codigo,estagio,venda,despachar_em,data) VALUES (?,?,?,?,?)');
let k = 0; const v = (c, desp, data, est) => lote.run(c, est || 'pendente', 'v'+(++k), desp, data || hoje);
v('HOJEAMANHA', hoje); v('HOJEAMANHA', ate); v('HOJEAMANHA', ate);
v('SOAMANHA', ate, ontem); v('SOAMANHA', ate, ontem);
v('LONGE', longe);
v('COBERTO', hoje); v('COBERTO', ate);
v('HOJEAMANHA', ate, hoje, 'embalado');     // impressa: não é prioridade

console.log('\n── 2. o pedido da prioridade ──');
const ped = P.pedido(db);
eq('a próxima saída vem junto', ped.ate, ate);
eq('HOJEAMANHA: 1 de hoje e 2 da próxima (a impressa fora)', ped.get('HOJEAMANHA'), { hoje:1, proxima:2 });
eq('SOAMANHA: 2 da próxima, mesmo subidas ontem', ped.get('SOAMANHA'), { hoje:0, proxima:2 });
ok('LONGE (depois da próxima saída) fica fora', !ped.has('LONGE'));

console.log('\n── 3. a urgência pela régua nova ──');
const u = {}; URG.calcular(db).forEach(x => { u[x.codigo] = x; });
eq('HOJEAMANHA: 3 pendentes, 1 livre, 2 urgentes', [u.HOJEAMANHA.pendentes, u.HOJEAMANHA.urgente], [3, 2]);
eq('SOAMANHA: subida ontem, conta (2 urgentes)', u.SOAMANHA && u.SOAMANHA.urgente, 2);
ok('LONGE não é urgente', !u.LONGE);
eq('COBERTO: nada urgente', u.COBERTO.urgente, 0);
eq('com a data explícita (o rastrear), a régua antiga: só o PDF daquele dia', URG.calcular(db, ontem).map(x => [x.codigo, x.pendentes]), [['SOAMANHA', 2]]);

console.log('\n── 4. a virada do dia ──');
db.prepare("DELETE FROM producao").run();
db.prepare("DELETE FROM config WHERE chave='urgencia_dia'").run();
const ORDEM = require('./ordem_dia');
const ord = () => db.prepare("SELECT codigo, qtd FROM producao WHERE data=date('now','localtime') AND origem='ml' ORDER BY codigo").all();
const l1 = ORDEM.linhas(db);
eq('a primeira leitura do dia lança as urgentes', ord(), [{ codigo:'HOJEAMANHA', qtd:2 }, { codigo:'SOAMANHA', qtd:2 }]);
ok('e a ordem do dia já mostra', l1.some(x => x.codigo === 'SOAMANHA' && x.a_produzir === 2), l1);
db.prepare("DELETE FROM producao WHERE codigo='SOAMANHA'").run();
ORDEM.linhas(db);
ok('a segunda leitura não refaz (o dia já foi aplicado)', !ord().some(x => x.codigo === 'SOAMANHA'));
db.prepare("DELETE FROM producao").run();
db.prepare("DELETE FROM config WHERE chave='urgencia_dia'").run();
db.prepare("INSERT INTO producao (codigo,qtd,origem,urgente) VALUES ('HOJEAMANHA',1,'ml',1)").run();
ORDEM.linhas(db);
eq('com ordem do PDF de hoje gravada, a leitura não a refaz', ord(), [{ codigo:'HOJEAMANHA', qtd:1 }]);
db.prepare("DELETE FROM producao").run();
URG.aplicar(db);
eq('o upload (aplicar) volta à conta de agora', ord().length, 2);

console.log('\n── 5. a tarja ──');
const livre = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque - (require('./baixa_dominio').reservados(db)[c] || 0);
const tj = c => T.marcar(db, [{ codigo:c, estoque:livre(c) }], T.pedidoPrioridade(db))[0];
const a = tj('HOJEAMANHA');
eq('HOJEAMANHA: hoje coberto, faltam 2 com a próxima', [a.falta_hoje, a.falta, a.pedido_hoje, a.pedido_proxima], [0, 2, 1, 2]);
ok('o rótulo da próxima saída vai junto', !!a.proxima_rotulo);
eq('COBERTO: sem falta', tj('COBERTO').falta, 0);
const velha = T.marcar(db, [{ codigo:'HOJEAMANHA', estoque:1 }], T.pedidoHoje(db))[0];
eq('com o pedido de hoje (a régua antiga), só hoje', [velha.falta, velha.pedido_proxima], [0, 0]);
const pend = chamar('GET', '/api/pendentes').body || [];
const lp = pend.find(x => String(x.codigo).toUpperCase() === 'HOJEAMANHA');
ok('a 201: a lista "Faltam imprimir" continua só com a de hoje', lp && lp.qtd === 1, pend);
ok('e a linha leva a falta da próxima saída', lp && lp.falta === 2 && lp.pedido_proxima === 2, lp);
ok('SOAMANHA não entra na lista de hoje', !pend.some(x => String(x.codigo).toUpperCase() === 'SOAMANHA'));
const fut = chamar('GET', '/api/pendentes/futuros').body || [];
const fs1 = fut.find(x => String(x.codigo).toUpperCase() === 'SOAMANHA');
ok('o painel "depois": a da próxima saída ganha a tarja nova', fs1 && fs1.falta === 2, fut);
const fl = fut.find(x => String(x.codigo).toUpperCase() === 'LONGE');
ok('e a de mais adiante fica com a regra de antes (sem falta)', fl && fl.falta === undefined, fl);

console.log('\n── 6. a 102 Embalagem ──');
const fila = c => db.prepare("INSERT INTO fila (codigo,modo) VALUES (?,'hoje')").run(c);
fila('SOAMANHA'); fila('HOJEAMANHA');
sku.run('SOHOJE', 0); v('SOHOJE', hoje); fila('SOHOJE');
const pr = chamar('GET', '/api/montagem/prioridade').body;
const L = pr && pr.dia ? pr.dia.linhas : [];
const d = c => L.find(x => x.codigo === c);
ok('SOAMANHA é vermelha (a venda da próxima saída)', d('SOAMANHA') && d('SOAMANHA').paradas_proxima === 2, L);
ok('HOJEAMANHA é vermelha pela próxima saída', d('HOJEAMANHA') && d('HOJEAMANHA').paradas === 2 && d('HOJEAMANHA').paradas_hoje === 0);
eq('a de hoje fica em cima', L[0] && L[0].codigo, 'SOHOJE');
ok('e a próxima saída vem com o rótulo', pr.dia.proxima && pr.dia.proxima.data === ate);
eq('o topo conta as da próxima saída à parte', pr.dia.faltam_embalar_proxima, 2);
ok('a peça da próxima saída não fica no âmbar', !pr.hoje.some(x => x.codigo === 'SOAMANHA'));

console.log('\n── 7. a 101 Revisão ──');
db.prepare("DELETE FROM fila").run();
db.prepare("DELETE FROM producao").run();
URG.aplicar(db);
const vf = db.prepare(`INSERT INTO venda_futura (venda_id,codigo,data_venda,data_envio,unidades,grupo,estado) VALUES (?,?,?,?,1,'fabrica','x')`);
/* As duas de SOAMANHA estão também na planilha, no dia da próxima saída. */
const vs = db.prepare("SELECT venda FROM lote WHERE codigo='SOAMANHA'").all().map(r => r.venda);
vs.forEach(x => vf.run(x, 'SOAMANHA', ontem, ate));
const lista = chamar('GET', '/api/revisao/lista').body;
const it = lista.hoje_lista.concat(lista.proximos_lista, lista.alvo_lista).find(x => x.codigo === 'SOAMANHA');
eq('a venda de amanhã subida ontem está em Hoje', it && it.hoje, 2);
eq('e não conta de novo nos próximos dias', it && it.proximos, 0);

console.log('\n' + (falhas ? 'FALHARAM ' + falhas + ' de ' + n : 'todos os ' + n + ' casos passaram'));
process.exit(falhas ? 1 : 0);
