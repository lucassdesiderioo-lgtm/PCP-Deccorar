#!/usr/bin/env node
/* teste_lugar.js — O LUGAR DE CADA TELA (spec ORGANIZACAO-DO-SISTEMA, fase 2,
 * cartões R-ORG-01, 02, 04, 05, 06, 07 e 14).
 *
 *   node teste_lugar.js
 *
 * Lê o mapa das duas operações (`telas.js` e `tecido/nucleo/telas.js`) contra
 * a lista única de módulos (`modulos.js`). Reprova:
 *   - tela sem módulo, ou com módulo fora da lista dos 18 (R-ORG-01, 02);
 *   - bloco que não é do tipo do módulo (R-ORG-05);
 *   - tela sem `liga`, ou ligada a um número que não existe (R-ORG-07);
 *   - tela NOVA fora da faixa do módulo dela, ou na faixa 600 (R-ORG-06);
 *   - a lista dos números antigos crescendo (R-ORG-06);
 *   - tela ou aba fora do lugar que não está na lista nomeada, e item da lista
 *     que já está no lugar (R-ORG-04, 14);
 *   - aba registrada no `compras_abas.js` sem declaração no mapa (R-ORG-04);
 *   - tela num módulo reservado fora da lista (quem cria inaugura, R-ORG-01).
 *
 * ⚠️ FORA DO LUGAR É O MÓDULO DECLARADO DIFERENTE DO MÓDULO EM QUE O MENU MOSTRA A
 * TELA (`moduloHoje`). Na fase 2 o menu ia pela centena; desde a fase 3 (menu
 * único) ele vai pelo módulo declarado, e por isso nenhuma tela está mais fora.
 * A aba e a parte estão fora quando o assunto delas não é o da tela. Item
 * arrumado esquecido na lista reprova.
 */
const fs = require('fs'), path = require('path');
const MO = require('./modulos');
const M = require('./telas');
let TSM = {}; try{ TSM = require('./tecido/nucleo/telas').TELAS; }catch(e){}

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
const lista = a => a.length ? a.join(', ') : '';

/* ── as telas das duas operações, numa forma só ─────────────────────────── */
const sm = Object.entries(TSM).filter(([, t]) => !t.apelido)
  .map(([rota, t]) => ({ n:t.numero, nome:t.nome, rota:'/sobmedida' + rota, modulo:t.modulo, bloco:t.bloco, liga:t.liga, sobmedida:true }));
const TODAS = M.TELAS.map(t => Object.assign({}, t)).concat(sm);
const NUMS = new Set(TODAS.map(t => t.n));

/* ── 1. a lista de módulos (R-ORG-01) ─────────────────────────────────── */
const CHAVES = MO.MODULOS.map(m => m.chave);
ok('são exatamente 18 módulos', MO.MODULOS.length === 18, 'são ' + MO.MODULOS.length);
ok('chave, nome e faixa de cada módulo são únicos',
  new Set(CHAVES).size === 18 && new Set(MO.MODULOS.map(m => m.nome)).size === 18 && new Set(MO.MODULOS.map(m => m.faixa)).size === 18);
const ESPERADO = {
  producao:100, expedicao:200, posvenda:250, estoque:300, planejamento:400, compras:500, frota:700, ml:800,
  administracao:900, comercial:1000, cadastros:1100, almoxarifado:1200, fiscal:1300, financeiro:1400,
  instalacao:1500, relatorios:1600, pessoas:1700, portal:1800 };
const faixaErrada = Object.entries(ESPERADO).filter(([k, f]) => (MO.porChave(k) || {}).faixa !== f).map(([k]) => k);
ok('as faixas são as confirmadas pelo dono (10/11/2026)', !faixaErrada.length, lista(faixaErrada));
ok('nenhum módulo mora na faixa 600, que está fechada', !MO.MODULOS.some(m => m.faixa === 600));
const tipoRuim = MO.MODULOS.filter(m => !MO.BLOCOS_DO_TIPO[m.tipo]).map(m => m.chave);
ok('todo módulo tem um tipo que conhece os blocos dele', !tipoRuim.length, lista(tipoRuim));
ok('Relatórios aceita bloco de operação e de canal (decisão do dono, 10/11/2026)',
  ['medida_padrao','sob_medida','mercado_livre','revenda','consumidor_final','comum']
    .every(b => MO.blocosDe('relatorios').indexOf(b) >= 0));

/* ── 2. toda tela tem módulo da lista (R-ORG-02) ──────────────────────── */
const semModulo = TODAS.filter(t => !t.modulo).map(t => t.n);
ok('toda tela das duas operações declara o módulo', !semModulo.length, 'sem módulo: ' + lista(semModulo));
const inventado = TODAS.filter(t => t.modulo && CHAVES.indexOf(t.modulo) < 0).map(t => t.n + ':' + t.modulo);
ok('nenhuma tela aponta um módulo fora da lista', !inventado.length, lista(inventado));

/* ── 3. o bloco é do tipo do módulo (R-ORG-05) ────────────────────────── */
const blocoRuim = TODAS.filter(t => t.modulo && CHAVES.indexOf(t.modulo) >= 0 && MO.blocosDe(t.modulo).indexOf(t.bloco) < 0)
  .map(t => t.n + ':' + t.modulo + '/' + t.bloco);
ok('o bloco de cada tela é um dos blocos do tipo do módulo dela', !blocoRuim.length, lista(blocoRuim));

/* ── 4. toda tela diz a que se liga (R-ORG-07) ────────────────────────── */
const semLiga = TODAS.filter(t => !Array.isArray(t.liga) || !t.liga.length).map(t => t.n);
ok('toda tela declara a que se liga', !semLiga.length, lista(semLiga));
const ligaFantasma = [];
TODAS.forEach(t => (t.liga || []).forEach(x => {
  if(typeof x === 'number' ? !NUMS.has(x) : !(typeof x === 'string' && x.trim())) ligaFantasma.push(t.n + '→' + x);
}));
ok('toda ligação aponta uma tela que existe, ou um cadastro com nome', !ligaFantasma.length, lista(ligaFantasma));

/* ── 5. o número (R-ORG-06) ───────────────────────────────────────────── */
const ANTIGOS = [101,102,103,104,105, 201,202,203,204,205,206, 251,252,253, 301,302,303, 401,402,403,404,
  501,502,503,504, 601,602,603,604,605,606,607,608,609,610,611,612,613,614,615,616, 901,902,903,904,905];
ok('a lista dos números antigos não cresce nem muda (são os de 10/11/2026)',
  JSON.stringify(MO.NUMEROS_ANTIGOS.slice().sort((a, b) => a - b)) === JSON.stringify(ANTIGOS),
  'modulos.js tem: ' + lista(MO.NUMEROS_ANTIGOS));
const novaNa600 = TODAS.filter(t => t.n >= 600 && t.n < 700 && ANTIGOS.indexOf(t.n) < 0).map(t => t.n);
ok('nenhuma tela nova na faixa 600', !novaNa600.length, lista(novaNa600));
const foraDaFaixa = TODAS.filter(t => ANTIGOS.indexOf(t.n) < 0 && MO.moduloDaFaixa(t.n) !== t.modulo)
  .map(t => t.n + ' (' + t.modulo + ', faixa de ' + MO.moduloDaFaixa(t.n) + ')');
ok('tela nova recebe número na faixa do módulo dela', !foraDaFaixa.length, lista(foraDaFaixa));

/* ── 6. as abas da 501 estão declaradas (R-ORG-04) ────────────────────── */
const t501 = M.porNumero(501) || {};
const abasCodigo = [];
fs.readFileSync(path.join(__dirname, 'public', 'compras_abas.js'), 'utf8')
  .replace(/registrar\(\s*\{\s*id\s*:\s*'([a-z_]+)'/g, (m, id) => { abasCodigo.push(id); return m; });
/* As abas que viraram telas (ARRUMAR-O-LUGAR fase 2, 11/11/2026) continuam
   registradas no compras_abas.js, com o `tela:` delas: a declaração é a TELA
   do mapa que tem aquele `cmp`, e não mais a aba da 501. */
const abasMapa = (t501.abas || []).map(a => a.id).concat(TODAS.filter(t => t.cmp).map(t => t.cmp));
const semDecl = abasCodigo.filter(id => abasMapa.indexOf(id) < 0);
const semCodigo = abasMapa.filter(id => abasCodigo.indexOf(id) < 0);
ok('as abas da 501 que o compras_abas.js registra são as declaradas no mapa (são ' + abasCodigo.length + ')',
  abasCodigo.length >= 10 && !semDecl.length && !semCodigo.length,
  (semDecl.length ? 'sem declaração: ' + lista(semDecl) + ' ' : '') + (semCodigo.length ? 'declarada sem código: ' + lista(semCodigo) : ''));
const abaSemModulo = TODAS.flatMap(t => (t.abas || []).concat(t.partes || []).filter(a => CHAVES.indexOf(a.modulo) < 0).map(a => t.n + '/' + a.id));
ok('toda aba e toda parte declarada aponta um módulo da lista', !abaSemModulo.length, lista(abaSemModulo));

/* ── 7. a lista nomeada do que está fora do lugar (R-ORG-14) ──────────── */
const foraDeFato = [];
TODAS.forEach(t => {
  const hoje = M.moduloHoje(t.n);
  if(t.modulo !== hoje) foraDeFato.push(String(t.n));
  (t.abas || []).concat(t.partes || []).forEach(a => { if(a.modulo !== t.modulo) foraDeFato.push(t.n + '/' + a.id); });
});
const nomeada = MO.FORA_DO_LUGAR.map(f => f.item);
const naoListado = foraDeFato.filter(x => nomeada.indexOf(x) < 0);
const arrumado = nomeada.filter(x => foraDeFato.indexOf(x) < 0);
ok('o que está fora do lugar está na lista nomeada', !naoListado.length, 'fora do lugar sem estar na lista: ' + lista(naoListado));
ok('item da lista que já está no lugar sai dela (a lista só encolhe)', !arrumado.length, 'já arrumado e ainda na lista: ' + lista(arrumado));
ok('a lista não tem item repetido', new Set(nomeada).size === nomeada.length);
const semMotivo = MO.FORA_DO_LUGAR.filter(f => !f.spec).map(f => f.item);
ok('cada item da lista diz que spec o arruma', !semMotivo.length, lista(semMotivo));

/* ── 8. módulo reservado: quem cria a primeira tela inaugura (R-ORG-01) ─ */
const emReservado = TODAS.filter(t => (MO.porChave(t.modulo) || {}).situacao === 'reservado' && nomeada.indexOf(String(t.n)) < 0)
  .map(t => t.n + ':' + t.modulo);
ok('tela no lugar num módulo reservado inaugura o módulo (situação "existe")', !emReservado.length, lista(emReservado));

/* ── 9. o inventário da spec §5, tela a tela ──────────────────────────── */
const INV = {   // as 45 telas do §5 da spec, sem faltar nenhuma (③ REVISÃO: eram 26)
  101:['producao','medida_padrao'], 102:['producao','medida_padrao'], 103:['comercial','mercado_livre'],
  104:['producao','medida_padrao'], 105:['producao','medida_padrao'],
  106:['producao','comum'],   // FICHAS-NO-CADASTRO-UNICO (11/11/2026): o material extra, das duas operacoes
  201:['expedicao','comum'], 202:['expedicao','comum'], 204:['expedicao','comum'], 205:['expedicao','comum'], 206:['expedicao','comum'],
  251:['posvenda','mercado_livre'], 252:['posvenda','mercado_livre'], 253:['posvenda','mercado_livre'],
  301:['estoque','medida_padrao'], 302:['estoque','medida_padrao'], 303:['estoque','medida_padrao'],
  401:['planejamento','medida_padrao'], 402:['cadastros','medida_padrao'], 403:['cadastros','medida_padrao'], 404:['cadastros','medida_padrao'],
  501:['compras','comum'], 502:['almoxarifado','comum'], 503:['almoxarifado','comum'], 504:['almoxarifado','comum'],
  901:['administracao','comum'], 902:['cadastros','comum'], 903:['administracao','comum'], 904:['relatorios','comum'], 905:['relatorios','medida_padrao'],
  601:['administracao','comum'], 602:['producao','sob_medida'], 603:['almoxarifado','sob_medida'], 604:['almoxarifado','sob_medida'],
  605:['almoxarifado','sob_medida'], 606:['cadastros','sob_medida'], 607:['relatorios','sob_medida'], 608:['cadastros','sob_medida'],
  609:['comercial','revenda'], 610:['comercial','revenda'], 611:['comercial','revenda'], 612:['producao','sob_medida'],
  613:['producao','sob_medida'], 614:['planejamento','sob_medida'], 615:['relatorios','sob_medida'], 616:['financeiro','revenda'],
  /* ARRUMAR-O-LUGAR fase 2 (11/11/2026): o "Onde mora" da spec */
  1101:['cadastros','comum'], 1102:['cadastros','comum'], 1103:['cadastros','comum'], 1201:['almoxarifado','comum'],
  1301:['fiscal','comum'], 1302:['fiscal','comum'] };
const semInv = TODAS.filter(t => !INV[t.n]).map(t => t.n), semMapa = Object.keys(INV).filter(k => !NUMS.has(+k));
ok('o inventário tem as telas do mapa, e só elas (as 45 de 10/11/2026 e as 6 da fase 2 da ARRUMAR-O-LUGAR)', !semInv.length && !semMapa.length,
  (semInv.length ? 'tela nova fora do inventário: ' + lista(semInv) + ' — declare-a no INV com o módulo e o bloco do "Onde mora" da spec dela. ' : '')
  + (semMapa.length ? 'no inventário e fora do mapa: ' + lista(semMapa) : ''));
const divergeInv = Object.entries(INV).filter(([num, [mod, bl]]) => {
  const t = TODAS.find(x => x.n === +num); return !t || t.modulo !== mod || t.bloco !== bl;
}).map(([num]) => num);
ok('as telas batem com o inventário do §5 da spec', !divergeInv.length, lista(divergeInv));
const abaEsperada = { lista:'compras', pedidos:'compras', rapida:'compras', programada:'compras', materiais:'cadastros',
  fornecedores:'cadastros', almox:'cadastros', retidos:'almoxarifado', notas:'fiscal', certificado:'fiscal' };
const abaDiverge = (t501.abas || []).filter(a => abaEsperada[a.id] !== a.modulo).map(a => a.id);
ok('as abas da 501 batem com o inventário do §5', !abaDiverge.length, lista(abaDiverge));
const PARTES = { '902/horarios':'administracao' };   // a 302/material foi para a 504 (ARRUMAR-O-LUGAR fase 2)
const partesMapa = {};
TODAS.forEach(t => (t.partes || []).forEach(p => { partesMapa[t.n + '/' + p.id] = p.modulo; }));
const parteDiverge = Object.keys(PARTES).filter(k => partesMapa[k] !== PARTES[k])
  .concat(Object.keys(partesMapa).filter(k => !PARTES[k]));
ok('as partes (902/horarios) batem com o inventário do §5, e não há outra', !parteDiverge.length, lista(parteDiverge));

console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);
