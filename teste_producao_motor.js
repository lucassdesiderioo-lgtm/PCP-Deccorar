#!/usr/bin/env node
/* teste_producao_motor.js — a conta das listas, o corte, a montagem e as rotas
 * da producao da medida padrao (spec PRODUCAO-MAPA-E-MOTOR v7, §14, 25/11/2026).
 *
 *   node teste_producao_motor.js
 *
 * A necessidade vem da lista da 101 (revisao_lista.montar) e o que cada SKU
 * usa vem da ficha (ficha_dominio.calcularFicha): os dois sao trocados por
 * respostas fixas, porque e a conta DESTE modulo que se testa — a deles tem
 * teste proprio. Nao abre porta.
 */
const Database = require('better-sqlite3');
let n = 0, falhas = 0;
function ok(desc, cond, det){ n++; if(cond) console.log('  ok  ' + n + ' — ' + desc); else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (det ? '\n         ' + det : '')); } }
function eq(desc, a, e){ ok(desc, a === e, 'esperado ' + JSON.stringify(e) + ', veio ' + JSON.stringify(a)); }

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '', cor_codigo TEXT, estoque INTEGER DEFAULT 0,
    alvo INTEGER DEFAULT 0, modelo_id INTEGER, largura_cm INTEGER, altura_cm INTEGER, tecido_codigo TEXT, tem_ficha INTEGER DEFAULT 1);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
  CREATE TABLE componente (id INTEGER PRIMARY KEY, nome TEXT, unidade TEXT);
  CREATE TABLE ficha_formula (id INTEGER PRIMARY KEY, modelo_id INTEGER, etapa TEXT, ordem INTEGER, ativo INTEGER DEFAULT 1);
  CREATE TABLE tecido (codigo TEXT PRIMARY KEY, nome TEXT);
  INSERT INTO modelo (id,nome) VALUES (1,'Rolô');
  INSERT INTO componente VALUES (2,'Tubo 32','m'),(3,'Base','m');
  INSERT INTO ficha_formula VALUES (10,1,'corte_tecido',1,1),(11,1,'corte_tubo',2,1),(12,1,'corte_tubo',3,1);
  INSERT INTO skus (codigo,cor_codigo,modelo_id,largura_cm,altura_cm,estoque) VALUES
    ('BK150150BEGE','BEGE',1,150,150,5),('BK150150CINZA','CINZA',1,150,150,0),('BK100100BRANCO','BRANCO',1,100,100,0);
`);
/* A ficha: o tecido largura−3 × altura+15, o tubo e a base largura−3. O BRANCO
   nao tem ficha: tem que ficar fora. */
require('./ficha_dominio').calcularFicha = (d, sku) => {
  const s = d.prepare('SELECT * FROM skus WHERE codigo=?').get(sku);
  if(s.codigo === 'BK100100BRANCO') return { sku, linhas:[], pendencia:'ficha pendente' };
  return { sku, linhas:[
    { formula_id:10, tecido:true, componente_id:9, componente_nome:'Blackout', corte:{ largura:s.largura_cm-3, altura:s.altura_cm+15 } },
    { formula_id:11, componente_id:2, componente_nome:'Tubo 32', corte:{ largura:s.largura_cm-3 } },
    { formula_id:12, componente_id:3, componente_nome:'Base', corte:{ largura:s.largura_cm-3 } } ] };
};
/* A necessidade (a lista da 101). */
let NEC;
const DIAS = [{ dia:'2026-11-26', rotulo:'amanhã' }, { dia:'2026-11-27', rotulo:'sex 27/11' }];
function nec(c, hoje, d1, d2, alvo){ return { codigo:c, hoje, hoje_na_embalagem:0, alvo, dias:[{ dia:DIAS[0].dia, rotulo:'amanhã', n:d1 }, { dia:DIAS[1].dia, rotulo:'sex', n:d2 }] }; }
require('./revisao_lista').montar = () => ({ dias:DIAS, hoje:'2026-11-25', hoje_lista:NEC.filter(x => x.hoje), proximos_lista:NEC.filter(x => !x.hoje && (x.dias[0].n || x.dias[1].n)), alvo_lista:NEC.filter(x => x.alvo) });
NEC = [nec('BK150150BEGE', 10, 4, 2, 6), nec('BK150150CINZA', 3, 0, 0, 0), nec('BK100100BRANCO', 2, 0, 0, 0)];

const ETQ = require('./etiqueta_producao');
const L = require('./producao_lista');
const CORTE = require('./corte_bancada');
const MONT = require('./montagem_persiana');
L.garantirSchema(db);
const ANA = { id:1, nome:'Ana' }, JOAO = { id:2, nome:'João' }, MARIA = { id:9, nome:'Maria' };
const saldo0 = db.prepare('SELECT SUM(estoque) s FROM skus').get().s;
function recusa(desc, fn, re){ let e = null; try{ fn(); }catch(x){ e = x; } ok(desc, e && e instanceof ETQ.Recusa && (!re || re.test(e.message)), e ? e.message : 'não recusou'); }

console.log('\n── 1. a ficha e quem fica fora ──');
let p = L.pecasDoSku(db, 'BK150150BEGE');
eq('o tecido do BEGE é o próprio SKU', p.tecido.item, 'BK150150BEGE');
eq('o corte do tecido: 147 × 165', p.tecido.texto, 'corte 147 × 165');
eq('o tubo é a PRIMEIRA linha de corte de tubo (o tubo, não a base)', p.tubo.item, 'c2:147');
eq('o BEGE e o CINZA usam o MESMO tubo', L.pecasDoSku(db, 'BK150150CINZA').tubo.item, 'c2:147');
let et = L.etiquetas(db);
ok('o SKU sem ficha fica fora, com o motivo', et.fora.some(x => x.codigo === 'BK100100BRANCO' && /ficha/.test(x.motivo)));

console.log('\n── 2. a aba de etiquetas: o dia primeiro ──');
eq('o dia pede 13 (10 BEGE + 3 CINZA)', et.dia.total, 13);
ok('os próximos dias estão fechados', et.proximos.aberto === false);
ok('o alvo está fechado', et.alvo.aberto === false);
ok('sem nada cortado, o dia avisa "sem cortado"', et.dia.itens.every(x => x.sem_cortado));
recusa('imprimir os próximos dias antes do dia é recusado', () => L.paraImprimir(db, 'proximos'), /hoje/);
let r = ETQ.imprimirPersianas(db, L.paraImprimir(db, 'dia'), 'dia', MARIA);
eq('imprime as 13 do dia', r.etiquetas.length, 13);
et = L.etiquetas(db);
ok('o dia fica "toda impressa"', et.dia.total === 0 && et.dia.impresso);
recusa('imprimir o dia de novo é recusado: nunca duas vezes a mesma peça', () => L.paraImprimir(db, 'dia'), /já tem etiqueta/);
ok('os próximos dias abrem', et.proximos.aberto === true);
eq('...mas sem tecido e tubo cortados LIVRES não sai nenhuma', et.proximos.total, 0);
eq('...e a falta continua dita (6)', et.proximos.falta, 6);
recusa('imprimir os próximos sem cortado livre é recusado, dizendo por quê', () => L.paraImprimir(db, 'proximos'), /cortados livres/);

console.log('\n── 3. venda nova depois da impressão: só a diferença ──');
NEC[1].hoje = 5;
et = L.etiquetas(db);
eq('o dia volta a pedir só as 2 novas', et.dia.total, 2);
ok('...com o aviso de "novas desde a última impressão"', et.dia.novas && et.dia.novas.n === 2);
ok('...e os próximos dias voltam a fechar', et.proximos.aberto === false);
ETQ.imprimirPersianas(db, L.paraImprimir(db, 'dia'), 'dia', MARIA);
eq('impressas as 2, a numeração do CINZA continua (nº 4 e 5)', db.prepare("SELECT GROUP_CONCAT(numero) g FROM (SELECT numero FROM etiqueta_producao WHERE sku='BK150150CINZA' ORDER BY numero)").get().g, '1,2,3,4,5');

console.log('\n── 4. o corte de tecido ──');
ETQ.imprimirMaco(db, 'TC', 40, MARIA); ETQ.imprimirMaco(db, 'TB', 40, MARIA);
let lt = L.listaTecido(db);
let beg = lt.itens.find(x => x.chave === 'BK150150BEGE');
eq('a lista do tecido pede o BEGE de hoje: 10', beg && beg.hoje, 10);
eq('...com a medida do SKU final em destaque', beg && beg.titulo, '1,50 × 1,50');
recusa('iniciar sem etiqueta do maço é recusado', () => CORTE.iniciar(db, { tipo:'tecido', item:'BK150150BEGE', quantidade:3, etiqueta:'' }, ANA), /não reconhecida/);
recusa('iniciar com etiqueta de TUBO no tecido é recusado', () => CORTE.iniciar(db, { tipo:'tecido', item:'BK150150BEGE', quantidade:3, etiqueta:'TB000001' }, ANA), /não é etiqueta de tecido/);
let a = CORTE.iniciar(db, { tipo:'tecido', item:'BK150150BEGE', quantidade:3, etiqueta:'TC000001' }, ANA);
eq('INÍCIO: a primeira etiqueta já é a peça 1', a.pecas.length, 1);
eq('...faltam 2', a.faltam, 2);
recusa('um segundo corte aberto da mesma pessoa é recusado', () => CORTE.iniciar(db, { tipo:'tubo', item:'c2:147', quantidade:1, etiqueta:'TB000001' }, ANA), /aberto/);
lt = L.listaTecido(db); beg = lt.itens.find(x => x.chave === 'BK150150BEGE');
eq('o que está em corte já sai da lista (10 − 3 = 7)', beg.hoje, 7);
recusa('bipar a mesma etiqueta duas vezes no lote é recusado', () => CORTE.bipar(db, 'TC000001', ANA), /já foi bipada/);
r = CORTE.bipar(db, 'TC000002', ANA);
ok('a 2ª etiqueta conta, o corte continua', r.aberto && r.aberto.faltam === 1);
r = CORTE.bipar(db, 'TC000003', ANA);
ok('a 3ª fecha o corte', !!r.fechado && r.fechado.situacao === 'fechado');
eq('3 tecidos BEGE na prateleira', CORTE.naPrateleira(db, 'tecido').BK150150BEGE, 3);
recusa('a etiqueta usada não se usa de novo noutro corte', () => CORTE.iniciar(db, { tipo:'tecido', item:'BK150150BEGE', quantidade:1, etiqueta:'TC000002' }, ANA), /já foi usada/);
// peca unica: a mesma etiqueta duas vezes
CORTE.iniciar(db, { tipo:'tecido', item:'BK150150CINZA', quantidade:1, etiqueta:'TC000004' }, ANA);
recusa('peça única: o fim com OUTRA etiqueta é recusado', () => CORTE.bipar(db, 'TC000005', ANA), /bipe de novo a TC 000004/);
r = CORTE.bipar(db, 'TC000004', ANA);
ok('peça única: a mesma etiqueta fecha', !!r.fechado);
eq('...e a TC000005 continua livre', db.prepare("SELECT situacao FROM etiqueta_producao WHERE codigo='TC000005'").get().situacao, 'livre');
// perdida e cancelar
CORTE.iniciar(db, { tipo:'tecido', item:'BK150150BEGE', quantidade:3, etiqueta:'TC000005' }, ANA);
recusa('peça perdida sem motivo é recusada', () => CORTE.perdida(db, '', ANA), /motivo/);
r = CORTE.perdida(db, 'Corte torto', ANA);
ok('peça perdida: conta no lote', r.aberto && r.aberto.faltam === 1 && r.aberto.perdidas === 1);
r = CORTE.bipar(db, 'TC000006', ANA);
ok('...e o lote fecha com 2 boas e 1 perdida', r.fechado && r.fechado.perdidas === 1);
eq('5 tecidos BEGE na prateleira', CORTE.naPrateleira(db, 'tecido').BK150150BEGE, 5);
CORTE.iniciar(db, { tipo:'tecido', item:'BK150150BEGE', quantidade:2, etiqueta:'TC000007' }, ANA);
CORTE.cancelar(db, ANA);
eq('cancelar devolve a etiqueta ao maço', db.prepare("SELECT situacao FROM etiqueta_producao WHERE codigo='TC000007'").get().situacao, 'livre');
eq('...e não deixa peça', CORTE.naPrateleira(db, 'tecido').BK150150BEGE, 5);
ok('o corte do dia conta as peças boas (sem a perdida)', CORTE.doDia(db, ANA, 'tecido').pecas === 6);

console.log('\n── 5. a serralheria: o tubo soma as cores ──');
let lb = L.listaTubo(db);
let tubo = lb.itens.find(x => x.chave === 'c2:147');
eq('o tubo de 147 pede BEGE + CINZA de hoje (10 + 5)', tubo && tubo.hoje, 15);
ok('...e diz os SKUs que serve', tubo && tubo.skus.join(',') === 'BK150150BEGE,BK150150CINZA');
CORTE.iniciar(db, { tipo:'tubo', item:'c2:147', quantidade:6, etiqueta:'TB000001' }, JOAO);
for(let i = 2; i <= 6; i++) CORTE.bipar(db, 'TB00000' + i, JOAO);
eq('6 tubos na prateleira', CORTE.naPrateleira(db, 'tubo')['c2:147'], 6);
tubo = L.listaTubo(db).itens.find(x => x.chave === 'c2:147');
eq('a lista do tubo desconta os 6 (15 − 6 = 9)', tubo.hoje, 9);

console.log('\n── 6. a regra F: próximos dias e alvo só até o cortado livre ──');
// cortar mais tecido e tubo para sobrar
CORTE.iniciar(db, { tipo:'tecido', item:'BK150150BEGE', quantidade:13, etiqueta:'TC000008', entrada_inicial:true }, ANA);
for(let i = 9; i <= 20; i++) CORTE.bipar(db, 'TC0000' + (i < 10 ? '0' + i : i), ANA);
CORTE.iniciar(db, { tipo:'tubo', item:'c2:147', quantidade:12, etiqueta:'TB000007', entrada_inicial:true }, JOAO);
for(let i = 8; i <= 18; i++) CORTE.bipar(db, 'TB0000' + (i < 10 ? '0' + i : i), JOAO);
eq('18 tecidos BEGE na prateleira', CORTE.naPrateleira(db, 'tecido').BK150150BEGE, 18);
eq('18 tubos de 147', CORTE.naPrateleira(db, 'tubo')['c2:147'], 18);
et = L.etiquetas(db);
const px = et.proximos.itens.find(x => x.sku === 'BK150150BEGE');
/* livre tecido BEGE = 18 − 10 etiquetas livres = 8; livre tubo = 18 − 15 livres (BEGE 10 + CINZA 5) = 3 */
eq('o tubo limita: só 3 dos 6 do BEGE (18 tubos − 15 etiquetas que já vão usar)', px.n, 3);
eq('...e a falta continua 6', px.falta, 6);
ok('o alvo continua fechado: amanhã ainda não está todo impresso', et.alvo.aberto === false);
ETQ.imprimirPersianas(db, L.paraImprimir(db, 'proximos'), 'proximos', MARIA);
et = L.etiquetas(db);
eq('impressas as 3: amanhã (4) ainda tem 1 sem etiqueta', et.proximos.falta_amanha, 1);
CORTE.iniciar(db, { tipo:'tubo', item:'c2:147', quantidade:10, etiqueta:'TB000019', entrada_inicial:true }, JOAO);
for(let i = 20; i <= 28; i++) CORTE.bipar(db, 'TB0000' + i, JOAO);
et = L.etiquetas(db);
eq('com mais tubo, os próximos liberam os 3 que faltavam', et.proximos.total, 3);
ETQ.imprimirPersianas(db, L.paraImprimir(db, 'proximos'), 'proximos', MARIA);
et = L.etiquetas(db);
ok('amanhã todo impresso: o alvo abre', et.alvo.aberto === true);
/* tecido livre BEGE = 18 − 16 livres = 2 */
eq('o alvo pode 2 (o tecido livre que sobra)', et.alvo.total, 2);
const al = L.paraImprimir(db, 'alvo', 20);
eq('pedir 20 do alvo imprime só as 2 que cabem', al.reduce((s, x) => s + x.quantidade, 0), 2);
recusa('alvo sem quantidade é recusado', () => L.paraImprimir(db, 'alvo', 0), /quantas/);

console.log('\n── 7. a montagem: quatro bipes por peça ──');
let lm = L.listaMontagem(db);
let mb = lm.itens.find(x => x.chave === 'BK150150BEGE');
ok('a lista da montagem diz o que há cortado (18 tecidos · 28 tubos)', mb && mb.tecido === 18 && mb.tubo === 28, JSON.stringify(mb));
recusa('montar mais do que há cortado é recusado', () => MONT.iniciar(db, { sku:'BK150150CINZA', quantidade:2 }, JOAO), /Só há tecido e tubo cortados para 1/);
a = MONT.iniciar(db, { sku:'BK150150BEGE', quantidade:2 }, JOAO);
eq('começa pedindo ① a etiqueta de SKU', a.vez, 'persiana');
const psB = db.prepare("SELECT codigo FROM etiqueta_producao WHERE sku='BK150150BEGE' AND situacao='livre' ORDER BY numero").all().map(x => x.codigo);
const psC = db.prepare("SELECT codigo FROM etiqueta_producao WHERE sku='BK150150CINZA' AND situacao='livre' ORDER BY numero").all().map(x => x.codigo);
recusa('fora de ordem (o tecido no lugar do ①) é recusado, dizendo o que é a vez', () => MONT.bipar(db, 'TC000001', JOAO), /① a etiqueta de SKU/);
recusa('a etiqueta de SKU de OUTRO SKU é recusada', () => MONT.bipar(db, psC[0], JOAO), /outro SKU/);
r = MONT.bipar(db, psB[0], JOAO);
eq('① aceita: agora é ② o tecido', r.aberto.vez, 'tecido');
recusa('o tecido CINZA no BEGE é recusado, dizendo as duas medidas', () => MONT.bipar(db, 'TC000004', JOAO), /cortado como 1,50 × 1,50 CINZA\. O BK150150BEGE pede 1,50 × 1,50 BEGE/);
recusa('etiqueta de tecido do maço que não foi cortada é recusada', () => MONT.bipar(db, 'TC000040', JOAO), /não foi cortado/);
r = MONT.bipar(db, 'TC000001', JOAO);
eq('② aceita: agora é ③ o tubo', r.aberto.vez, 'tubo');
r = MONT.bipar(db, 'TB000001', JOAO);
ok('③ aceita: a peça 2 começa pelo ①', r.aberto.vez === 'persiana' && r.aberto.peca_vez === 2);
recusa('o tecido já usado numa persiana não serve para outra', () => { MONT.bipar(db, psB[1], JOAO); MONT.bipar(db, 'TC000001', JOAO); }, /já foi usado/);
MONT.bipar(db, 'TC000002', JOAO); r = MONT.bipar(db, 'TB000002', JOAO);
eq('com ①②③ das duas, a fase é "montando"', r.aberto.fase, 'montando');
recusa('no "montando", o tecido não fecha peça', () => MONT.bipar(db, 'TC000003', JOAO), /④/);
r = MONT.bipar(db, psB[1], JOAO);
ok('④ da peça 2 fecha só ela', r.aberto && r.aberto.pecas.filter(x => x.situacao === 'montada').length === 1);
r = MONT.bipar(db, psB[0], JOAO);
ok('④ da peça 1 fecha o lote', !!r.fechado);
eq('2 persianas no carrinho da revisão', MONT.noCarrinho(db).BK150150BEGE, 2);
eq('o tecido saiu da prateleira (18 − 2)', CORTE.naPrateleira(db, 'tecido').BK150150BEGE, 16);
eq('o tubo também (28 − 2)', CORTE.naPrateleira(db, 'tubo')['c2:147'], 26);
mb = L.listaMontagem(db).itens.find(x => x.chave === 'BK150150BEGE');
eq('a lista da montagem desconta o carrinho (10 − 2 = 8 hoje)', mb.hoje, 8);
const pr = MONT.porEtiqueta(db, psB[0]);
ok('a persiana sabe quem cortou o tecido, o tubo e quem montou', pr.tecido.nome === 'Ana' && pr.tubo.nome === 'João' && pr.montagem.nome === 'João');
// cancelar no meio
MONT.iniciar(db, { sku:'BK150150BEGE', quantidade:1 }, JOAO);
MONT.bipar(db, psB[2], JOAO); MONT.bipar(db, 'TC000003', JOAO);
MONT.cancelar(db, JOAO);
eq('cancelar devolve a etiqueta de SKU', db.prepare('SELECT situacao FROM etiqueta_producao WHERE codigo=?').get(psB[2]).situacao, 'livre');
eq('...e o tecido volta para a prateleira', db.prepare("SELECT cp.situacao FROM corte_peca cp JOIN etiqueta_producao e ON e.id=cp.etiqueta_id WHERE e.codigo='TC000003'").get().situacao, 'prateleira');

console.log('\n── 8. nada disso mexe em saldo ──');
eq('o estoque dos SKUs não mudou', db.prepare('SELECT SUM(estoque) s FROM skus').get().s, saldo0);

console.log('\n── 9. as rotas ──');
const rotas = {};
const app = { locals:{ acesso:{ podePermissao:(u, c) => !!(u && u.pode && u.pode.includes(c)) } },
  get(p, h){ rotas['GET ' + p] = h; }, post(p, h){ rotas['POST ' + p] = h; }, delete(){}, put(){}, patch(){} };
require('./producao_route')(app, db);
async function chamar(m, rota, corpo, u, params){
  const h = rotas[m + ' ' + rota]; const out = { status:200, body:null };
  const res = { status(c){ out.status = c; return res; }, json(b){ out.body = b; return res; } };
  await h({ body:corpo || {}, params:params || {}, query:{}, headers:{}, usuario:u }, res); return out;
}
(async () => {
  let x = await chamar('POST', '/api/producao/etiquetas/maco', { tipo:'TC', quantidade:2 }, undefined);
  eq('sem login, nenhuma escrita grava (401)', x.status, 401);
  x = await chamar('POST', '/api/producao/etiquetas/maco', { tipo:'TC', quantidade:2 }, MARIA);
  ok('o maço sai em PDF', x.status === 200 && x.body.tipo === 'pdf' && x.body.quantidade === 2);
  x = await chamar('GET', '/api/producao/etiquetas', {}, MARIA);
  ok('a aba traz a conta, os maços, as não usadas e o histórico', x.body.aba && x.body.macos.TC && Array.isArray(x.body.nao_usadas) && Array.isArray(x.body.historico));
  ok('quem não tem "corrigir" não vê o cancelar', x.body.pode_cancelar === false);
  x = await chamar('POST', '/api/producao/etiquetas/fora', { sku:'BK150150BEGE', quantidade:1, motivo:'Outro' }, MARIA);
  eq('fora do planejamento "Outro" sem texto é recusado', x.status, 400);
  x = await chamar('POST', '/api/producao/etiquetas/fora', { sku:'BK150150BEGE', quantidade:1, motivo:'Teste' }, MARIA);
  ok('fora do planejamento com motivo da lista imprime', x.status === 200 && x.body.tipo === 'pdf', JSON.stringify(x.body).slice(0, 200));
  x = await chamar('POST', '/api/producao/corte/tecido/iniciar', { item:'BK999', quantidade:1, etiqueta:'TC000021' }, ANA, { tipo:'tecido' });
  eq('o corte recusa item fora da lista (409)', x.status, 409);
  x = await chamar('POST', '/api/producao/corte/tecido/iniciar', { item:'BK150150BEGE', quantidade:1, etiqueta:'TC000021', entrada_inicial:true }, ANA, { tipo:'tecido' });
  eq('a entrada inicial sem "corrigir" é recusada (403)', x.status, 403);
  x = await chamar('POST', '/api/producao/corte/tecido/iniciar', { item:'BK150150BEGE', quantidade:1, etiqueta:'TC000021' }, ANA, { tipo:'tecido' });
  ok('iniciar pela rota', x.status === 200 && x.body.aberto, JSON.stringify(x.body));
  x = await chamar('POST', '/api/producao/corte/tecido/bipar', { codigo:'TC000021' }, ANA, { tipo:'tecido' });
  ok('fechar pela rota devolve o tempo (ou null, sem histórico)', x.status === 200 && x.body.fechado && 'tempo' in x.body);
  x = await chamar('GET', '/api/producao/traduzir/:codigo', {}, ANA, { codigo:psB[0] });
  ok('o tradutor da rota devolve o SKU e o rótulo', x.body.etiqueta && x.body.sku === 'BK150150BEGE' && /Nº/.test(x.body.rotulo));
  x = await chamar('GET', '/api/producao/persiana/:codigo', {}, ANA, { codigo:psB[0] });
  ok('quem fez a persiana, pela rota', x.body.tecido.nome === 'Ana' && x.body.montagem.nome === 'João');
  x = await chamar('GET', '/api/producao/etiquetas/contar', {}, MARIA);
  ok('a bolinha só leva o número', typeof x.body.hoje === 'number' && Object.keys(x.body).length === 1);

  console.log('\n── 10. a alçada (R-ALC) ──');
  const REG = require('./permissoes');
  const nv = { 'producao.cortar_tecido':['operacao',108], 'producao.cortar_tubo':['operacao',110], 'producao.montar':['operacao',107],
    'producao.etiqueta':['supervisor',401], 'producao.corrigir':['supervisor',401] };
  ok('as cinco chaves existem, com nível e tela', Object.keys(nv).every(k => { const p = REG.find(x => x.chave === k); return p && p.nivel === nv[k][0] && p.tela === nv[k][1]; }));
  ok('"corrigir" é sensível', REG.find(x => x.chave === 'producao.corrigir').sensivel === true);
  const src = require('fs').readFileSync(require('path').join(__dirname, 'acesso.js'), 'utf8');
  const fora = src.split('\n').filter(l => /producao\.(cortar_tecido|cortar_tubo|montar|etiqueta|corrigir)/.test(l) && !/return /.test(l) && !/\['producao\.[a-z_]+', *'[a-z_]+'\]/.test(l));   /* a linha do PERM_AREA (a área de chegada) não dá chave a ninguém */
  ok('nenhum setor nativo recebe as chaves novas pelo seed (só o Admin Geral, R-ALC-06)', fora.length === 0, fora.join(' | '));
  const T = require('./telas').TELAS;
  ok('107, 108 e 110 no mapa: Produção · Medida padrão · Operação', [107,108,110].every(nu => { const t = T.find(x => x.n === nu); return t && t.modulo === 'producao' && t.bloco === 'medida_padrao' && t.nivel === 'operacao'; }));
  ok('a 401 abre para o Supervisor com a chave das etiquetas', (t => t.nivel === 'supervisor' && t.perms.includes('producao.etiqueta'))(T.find(x => x.n === 401)));

  console.log('\n── 11. o que a ③ REVISÃO achou ──');
  /* a mesma peça não se desconta duas vezes: o tecido já bipado numa montagem
     aberta sai da prateleira e conta uma vez só */
  const tec0 = L.listaTecido(db).itens.find(x => x.chave === 'BK150150BEGE');
  const mon0 = L.listaMontagem(db).itens.find(x => x.chave === 'BK150150BEGE');
  MONT.iniciar(db, { sku:'BK150150BEGE', quantidade:1 }, JOAO);
  MONT.bipar(db, psB[2], JOAO); MONT.bipar(db, 'TC000003', JOAO);
  const tec1 = L.listaTecido(db).itens.find(x => x.chave === 'BK150150BEGE');
  const mon1 = L.listaMontagem(db).itens.find(x => x.chave === 'BK150150BEGE');
  eq('a montagem aberta sai da lista da montagem (uma peça)', (mon0 ? mon0.hoje + mon0.dias.reduce((s, d) => s + d.n, 0) + (mon0.alvo || 0) : 0) - (mon1 ? mon1.hoje + mon1.dias.reduce((s, d) => s + d.n, 0) + (mon1.alvo || 0) : 0), 1);
  eq('...e a lista do tecido NÃO desconta a mesma peça duas vezes', JSON.stringify(tec1 && [tec1.hoje, tec1.alvo]), JSON.stringify(tec0 && [tec0.hoje, tec0.alvo]));
  MONT.cancelar(db, JOAO);
  /* dois lotes ao mesmo tempo não prometem o mesmo tecido */
  const RUI = { id:7, nome:'Rui' };
  MONT.iniciar(db, { sku:'BK150150CINZA', quantidade:1 }, ANA);
  recusa('o segundo lote não pega o tecido que o primeiro reservou', () => MONT.iniciar(db, { sku:'BK150150CINZA', quantidade:1 }, RUI), /separado para outra montagem/);
  MONT.cancelar(db, ANA);
  /* a recusa da etiqueta usada diz quando, por quem, sem a data do banco */
  recusa('a etiqueta usada diz "em dd/mm às hh:mm, por …"', () => CORTE.iniciar(db, { tipo:'tecido', item:'BK150150BEGE', quantidade:1, etiqueta:'TC000002' }, ANA), /em \d\d\/\d\d às \d\d:\d\d, por Ana/);
  /* a bancada mostra a próxima LIVRE do maço */
  const MARIA2 = { id:9, nome:'Maria', pode:['producao.corrigir','producao.cortar_tecido'] };
  x = await chamar('GET', '/api/producao/corte/tecido', {}, MARIA2, { tipo:'tecido' });
  eq('a "próxima etiqueta" é a menor livre do maço', x.body.proxima, ETQ.rotulo(db.prepare("SELECT * FROM etiqueta_producao WHERE tipo='TC' AND situacao='livre' ORDER BY numero LIMIT 1").get()));
  ok('...e a entrada inicial recebe a lista do que se conhece', Array.isArray(x.body.itens_entrada) && x.body.itens_entrada.some(i => i.chave === 'BK150150BEGE'));
  x = await chamar('POST', '/api/producao/corte/tecido/iniciar', { item:'INVENTADO', quantidade:1, etiqueta:'TC000022', entrada_inicial:true }, MARIA2, { tipo:'tecido' });
  eq('a entrada inicial recusa item inventado (409)', x.status, 409);
  eq('...e a etiqueta continua livre', db.prepare("SELECT situacao FROM etiqueta_producao WHERE codigo='TC000022'").get().situacao, 'livre');
  /* o PDF que não sai não deixa etiqueta gravada */
  db.prepare("INSERT INTO skus (codigo,cor_codigo,modelo_id,largura_cm,altura_cm) VALUES ('BKSEMMEDIDA','BEGE',1,NULL,NULL)").run();
  const ps0 = db.prepare("SELECT COUNT(*) n FROM etiqueta_producao WHERE tipo='PS'").get().n;
  x = await chamar('POST', '/api/producao/etiquetas/fora', { sku:'BKSEMMEDIDA', quantidade:2, motivo:'Teste' }, MARIA);
  ok('o fora do planejamento de um SKU sem medida é recusado antes de gravar', x.status >= 400, JSON.stringify(x.body));
  eq('...e nenhuma etiqueta nasce', db.prepare("SELECT COUNT(*) n FROM etiqueta_producao WHERE tipo='PS'").get().n, ps0);
  /* o teto de 200 por vez */
  recusa('mais de 200 de uma vez é recusado', () => ETQ.imprimirMaco(db, 'TC', 201, MARIA), /1 a 200/);
  /* o tempo da montagem conta do primeiro ① */
  MONT.iniciar(db, { sku:'BK150150BEGE', quantidade:1 }, JOAO);
  db.prepare("UPDATE montagem_lote SET inicio='2000-01-01 00:00:00' WHERE situacao='aberto'").run();
  MONT.bipar(db, psB[2], JOAO);
  ok('o início do lote é o primeiro ① (e não a hora do "iniciar")', !/^2000/.test(db.prepare("SELECT inicio FROM montagem_lote WHERE situacao='aberto'").get().inicio));
  MONT.cancelar(db, JOAO);

  console.log('\n' + (falhas ? falhas + ' de ' + n + ' casos FALHARAM' : 'todos os ' + n + ' casos passaram'));
  process.exit(falhas ? 1 : 0);
})();
