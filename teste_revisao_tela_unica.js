#!/usr/bin/env node
/* teste_revisao_tela_unica.js — a lista da 101 Revisão em tela única (spec
 * REVISAO-TELA-UNICA, 23/11/2026) e o modo que o SERVIDOR decide.
 *
 *   node teste_revisao_tela_unica.js
 *
 *   1  a janela dos próximos dias: até sexta; na sexta e no sábado só a segunda
 *   2  as três partes: Hoje (a ordem do dia), Próximos dias (a falta por dia da
 *      401) e Completar o alvo (o precisa menos a falta da janela) — e a soma
 *      das três é o precisa da 401 (nenhuma conta própria)
 *   3  a peça vai para a primeira necessidade: hoje → próximos dias → alvo, e
 *      o modo gravado bate; o corpo não manda
 *   4  a peça revisada e ainda não embalada sai dos próximos dias e do alvo
 *   5  "Hoje terminado" quando a ordem do dia zera
 *   6  sob medida não tem alvo; SKU sem nada a fazer não aparece
 *   7  a semana (só leitura)
 *
 * Sobe um banco temporário (PCP_DIR) e chama os handlers direto.
 */
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-revlista-'));
process.env.PCP_DIR = tmp;

let n = 0, falhas = 0;
function ok(desc, cond, det){ n++; if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (det !== undefined ? '\n         ' + JSON.stringify(det) : '')); } }
const eq = (desc, a, b) => ok(desc, JSON.stringify(a) === JSON.stringify(b), { esperado:b, veio:a });

const LISTA = require('./revisao_lista');

console.log('\n── 1. a janela dos próximos dias ──');
eq('segunda: de terça a sexta', LISTA.janela('2026-11-23'), ['2026-11-24','2026-11-25','2026-11-26','2026-11-27']);
eq('quinta: só sexta', LISTA.janela('2026-11-26'), ['2026-11-27']);
eq('sexta: só a segunda seguinte', LISTA.janela('2026-11-27'), ['2026-11-30']);
eq('sábado: só a segunda', LISTA.janela('2026-11-28'), ['2026-11-30']);
eq('domingo: de segunda a sexta', LISTA.janela('2026-11-29'), ['2026-11-30','2026-12-01','2026-12-02','2026-12-03','2026-12-04']);
eq('a virada do mês e do ano', LISTA.janela('2026-12-31'), ['2027-01-01']);

/* ── o banco ── */
const db = require('./db');
const rotas = {};
const app = { get(p,...h){ rotas['GET '+p] = h[h.length-1]; }, post(p,...h){ rotas['POST '+p] = h[h.length-1]; },
  put(){}, delete(){}, patch(){}, use(){}, locals:{ acesso:{ auditar(){}, podePermissao(){ return true; }, ehAdminGeral(){ return false; } } } };
require('./exp_route')(app, db);
require('./plan_route')(app, db);
require('./revisao_route')(app, db);
function chamar(metodo, rota, corpo){
  const h = rotas[metodo+' '+rota];
  if(!h) return { status:'sem rota' };
  const out = { status:200 };
  const res = { status(c){ out.status = c; return res; }, json(b){ out.body = b; return res; }, send(b){ out.body = b; return res; }, setHeader(){} };
  try{ h({ body:corpo||{}, params:{}, query:{}, headers:{}, usuario:{ id:1, nome:'Ana' } }, res); }
  catch(e){ return { status:500, body:{ erro:String(e.stack||e) } }; }
  return out;
}
const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
const JAN = LISTA.janela(hoje), D0 = JAN[0];

db.exec(`INSERT OR IGNORE INTO modelo (id,codigo,nome,sob_medida,exige_medida) VALUES (1,'ROLO','Rolô',0,1),(2,'SOBMEDIDA','Sob medida',1,0)`);
const sku = db.prepare('INSERT INTO skus (codigo,estoque,modelo_id,largura_cm,altura_cm) VALUES (?,?,?,?,?)');
sku.run('BK140160CINZA', 0, 1, 140, 160);   // A: 2 vendas hoje sem peça, 1 no primeiro dia da janela
sku.run('BK120160BEGE', 1, 1, 120, 160);    // B: 3 vendas no primeiro dia, 1 livre
sku.run('BK100140PRETO', 0, 1, 100, 140);   // C: sem venda, só o alvo mínimo
sku.run('SOBMEDIDA', 0, 2, null, null);     // sob medida com venda
sku.run('BK180140CINZA', 50, 1, 180, 140);  // D: estoque cheio, nada a fazer
const vf = db.prepare(`INSERT INTO venda_futura (venda_id,codigo,data_venda,data_envio,unidades,grupo,estado) VALUES (?,?,?,?,1,'fabrica','x')`);
let k = 0; const venda = (c, envio) => vf.run('v'+(++k), c, hoje, envio);
venda('BK140160CINZA', hoje); venda('BK140160CINZA', hoje); venda('BK140160CINZA', D0);
venda('BK120160BEGE', D0); venda('BK120160BEGE', D0); venda('BK120160BEGE', D0);
venda('SOBMEDIDA', D0);
/* As duas vendas de hoje de A estão na Etiqueta de Venda (o PDF) e viraram ordem urgente. */
db.prepare("INSERT INTO lote (codigo,estagio,venda) VALUES ('BK140160CINZA','pendente','v1'),('BK140160CINZA','pendente','v2')").run();
db.prepare("INSERT INTO producao (codigo,qtd,origem,urgente) VALUES ('BK140160CINZA',2,'ml',1)").run();

const DEMANDA = require('./demanda_dominio');
const precisa = c => (DEMANDA.calcular(db).linhas.find(l => l.codigo === c) || {}).precisa;
const L = () => chamar('GET', '/api/revisao/lista').body;
const item = (l, c) => l.hoje_lista.concat(l.proximos_lista, l.alvo_lista).find(x => x.codigo === c);

console.log('\n── 2. as três partes ──');
let l = L();
eq('a rota responde', !!l, true);
eq('Hoje: só A, com 2', l.hoje_lista.map(x => [x.codigo, x.hoje]), [['BK140160CINZA', 2]]);
let a = item(l, 'BK140160CINZA'), b = item(l, 'BK120160BEGE'), c = item(l, 'BK100140PRETO');
eq('A falta 1 no primeiro dia da janela', a.dias[0].n, 1);
eq('B falta 2 no primeiro dia (3 vendas − 1 livre)', b.dias[0].n, 2);
ok('B está em Próximos dias e não em Hoje', l.proximos_lista.some(x => x.codigo === 'BK120160BEGE') && !l.hoje_lista.some(x => x.codigo === 'BK120160BEGE'));
ok('A aparece também em "depois de hoje"', l.proximos_lista.some(x => x.codigo === 'BK140160CINZA'));
eq('C só no alvo', [c.hoje, c.proximos, c.alvo > 0], [0, 0, true]);
eq('A: hoje + próximos + alvo = o precisa da 401', a.hoje + a.proximos + a.alvo, precisa('BK140160CINZA'));
eq('B: próximos + alvo = o precisa da 401', b.proximos + b.alvo, precisa('BK120160BEGE'));
eq('C: o alvo = o precisa da 401', c.alvo, precisa('BK100140PRETO'));
eq('o primeiro dia diz "amanhã" quando é amanhã', l.dias[0].rotulo === 'amanhã', D0 === db.prepare("SELECT date('now','localtime','+1 day') d").get().d);
ok('sob medida: nenhum alvo', !item(l, 'SOBMEDIDA') || item(l, 'SOBMEDIDA').alvo === 0, item(l, 'SOBMEDIDA'));
ok('D, com estoque cheio, não aparece', !item(l, 'BK180140CINZA'));
eq('os totais somam as listas', l.totais.hoje, 2);
eq('Hoje ainda não terminou', l.hoje_terminado, false);

console.log('\n── 3. a peça vai para a primeira necessidade ──');
const modoUltima = () => db.prepare('SELECT modo FROM revisao ORDER BY id DESC').get().modo;
const filaUltima = () => db.prepare('SELECT modo FROM fila ORDER BY id DESC').get().modo;
const rev = (codigo, modo) => chamar('POST', '/api/revisao', { codigo, segundos:30, modo });
eq('a 1ª de A cobre a venda de hoje', (rev('BK140160CINZA', 'estoque'), modoUltima()), 'hoje');
eq('a fila tem o mesmo modo', filaUltima(), 'hoje');
eq('Hoje de A desce para 1', item(L(), 'BK140160CINZA').hoje, 1);
eq('a 2ª também é de hoje', (rev('BK140160CINZA'), modoUltima()), 'hoje');
l = L();
eq('Hoje zerou', l.totais.hoje, 0);
eq('e o dia está terminado', l.hoje_terminado, true);
eq('a 3ª de A vai para estoque (próximos dias)', (rev('BK140160CINZA', 'hoje'), modoUltima()), 'estoque');

console.log('\n── 4. a peça revisada e não embalada sai dos próximos dias e do alvo ──');
a = item(L(), 'BK140160CINZA');
eq('A: o primeiro dia já não falta', a.dias[0].n, 0);
const alvoA = a.alvo;
rev('BK140160CINZA');
eq('a 4ª de A desce o alvo em 1', item(L(), 'BK140160CINZA').alvo, alvoA - 1);
eq('a revisada hoje para estoque conta no andamento', item(L(), 'BK140160CINZA').revisadas_estoque, 2);
const bAntes = item(L(), 'BK120160BEGE').dias[0].n;
rev('BK120160BEGE');
eq('B: uma revisada sai do primeiro dia', item(L(), 'BK120160BEGE').dias[0].n, bAntes - 1);
eq('B foi gravada como estoque (não tem ordem de hoje)', modoUltima(), 'estoque');

console.log('\n── 5. sem ordem do dia, não é "terminado" ──');
db.prepare("DELETE FROM producao").run();
l = L();
eq('sem venda de hoje no PDF', l.sem_venda_hoje, true);
eq('e não "terminado"', l.hoje_terminado, false);

console.log('\n── 6. a semana ──');
const s = chamar('GET', '/api/revisao/semana').body;
ok('a semana traz os dias da janela', s && s.dias.length === JAN.length, s && s.dias);
ok('cada linha tem um número por dia', s && s.linhas.every(x => x.dias.length === JAN.length));
ok('nenhum valor em reais na lista', !/preco|valor|custo/i.test(JSON.stringify(L())));

console.log('\n── 7. a mesma venda não conta em Hoje e em Próximos dias (③ REVISÃO) ──');
/* E: a venda v está no PDF de hoje (ordem urgente de 1), e a planilha diz
   amanhã ("Pronto para coleta" indo para a próxima coleta). */
db.prepare("INSERT OR REPLACE INTO config (chave,valor) VALUES ('rev_minimo_seg','0')").run();
sku.run('BK130160BEGE', 0, 1, 130, 160);
vf.run('vE', 'BK130160BEGE', hoje, D0);
db.prepare("INSERT INTO lote (codigo,estagio,venda) VALUES ('BK130160BEGE','pendente','vE')").run();
db.prepare("INSERT INTO producao (codigo,qtd,origem,urgente) VALUES ('BK130160BEGE',1,'ml',1)").run();
let e = item(L(), 'BK130160BEGE');
eq('E: 1 em Hoje', e.hoje, 1);
eq('E: e nada nos Próximos dias (a mesma venda)', e.proximos, 0);
eq('E: Hoje + Próximos + Alvo = o precisa da 401', e.hoje + e.proximos + e.alvo, precisa('BK130160BEGE'));
rev('BK130160BEGE');
e = item(L(), 'BK130160BEGE');
eq('E revisada para hoje: os Próximos dias continuam zerados', e ? e.proximos : 0, 0);

console.log('\n── 8. toda peça na fila que vira +1 é descontada (③ REVISÃO) ──');
sku.run('BK110160BEGE', 0, 1, 110, 160);
vf.run('vF', 'BK110160BEGE', hoje, D0);
eq('F: falta 1 no primeiro dia', item(L(), 'BK110160BEGE').dias[0].n, 1);
db.prepare("INSERT INTO fila (codigo,modo,situacao) VALUES ('BK110160BEGE','devolucao','aguardando')").run();
eq('a peça de devolução esperando a embalagem desconta', item(L(), 'BK110160BEGE') ? item(L(), 'BK110160BEGE').dias[0].n : 0, 0);
sku.run('BK110140PRETO', 0, 1, 110, 140);
vf.run('vG', 'BK110140PRETO', hoje, D0);
db.prepare("INSERT INTO fila (codigo,modo,situacao,data) VALUES ('BK110140PRETO','hoje','aguardando',date('now','localtime','-1 day'))").run();
eq('a peça de hoje de ONTEM esperando a embalagem desconta', item(L(), 'BK110140PRETO') ? item(L(), 'BK110140PRETO').dias[0].n : 0, 0);

console.log('\n── 9. a lista que falha diz que falhou (③ REVISÃO) ──');
const orig = DEMANDA.porDia;
DEMANDA.porDia = () => { throw new Error('quebrou de propósito'); };
const rr = chamar('GET', '/api/revisao/lista');
DEMANDA.porDia = orig;
eq('500, e não uma lista sem número', rr.status, 500);
ok('com o motivo, sem a pilha do erro', rr.body && /^Não deu para montar a lista/.test(rr.body.erro || '') && !/at /.test(rr.body.erro), rr.body);

console.log('\n' + (falhas ? falhas + ' FALHA(S) de ' + n : 'todos os ' + n + ' casos passaram'));
process.exit(falhas ? 1 : 0);
