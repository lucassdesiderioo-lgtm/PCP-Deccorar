#!/usr/bin/env node
/* teste_pendencias_sobmedida.js — o sob medida na central de Pendências (spec
 * docs/specs/PENDENCIAS-NO-MENU.md, fase 3, 12/11/2026).
 *
 *   node teste_pendencias_sobmedida.js
 *
 * O que trava (o lado de lá — a conta de cada fila e a régua de pessoa — está
 * no tecido/teste/pendencias_pcp.test.js):
 *   1. as cinco linhas: tela dona no mapa do sob medida, chave que existe, frase,
 *      e quem resolve escrito em palavras;
 *   2. SEM A PORTA, a linha não vira zero: diz que não conseguiu contar;
 *   3. a etiqueta: só quem tem a chave E abre a tela dona; o usuário do sob
 *      medida vai à porta (é ele que leva a régua de pessoa);
 *   4. "abre a tela" do sob medida é o portão de lá (abre_tela.js), e não o
 *      decidir do PCP; o ☰ Menu e a etiqueta usam a mesma conta;
 *   5. a caixinha: a ação do sob medida que cria pendência responde
 *      `pendencias`, com o caminho julgado pelo usuário do PCP (o portão de lá
 *      troca o req.usuario); a recusa não ganha nada;
 *   6. o lugar: o server.js liga a porta, e o nav.js do sob medida carrega a
 *      caixinha.
 */
const fs = require('fs'), path = require('path');
let casos = 0, falhas = 0;
function ok(desc, cond, detalhe){
  casos++;
  if(cond) console.log('  ok  ' + casos + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + casos + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}

const PEND = require('./pendencias_dominio');
const SMP = require('./sobmedida_pendencias');
const AT = require('./abre_tela');
const M = require('./telas');
const PERM = require('./permissoes');

const SM = ['sm_baixa_boleto','sm_descarte_sobra','sm_correcao_corte','sm_pedido_aprovar','sm_conferir'];
const TELA = { sm_baixa_boleto:616, sm_descarte_sobra:603, sm_correcao_corte:602, sm_pedido_aprovar:611, sm_conferir:606 };
const linha = c => PEND.LINHAS.find(L => L.chave === c);

console.log('\n1. as cinco linhas do sob medida');
SM.forEach(c => {
  const L = linha(c) || {};
  const t = M.telasSobMedida().find(x => x.n === L.tela);
  ok(c + ' existe, na tela ' + TELA[c], L.tela === TELA[c] && !!t, JSON.stringify({ tela:L.tela }));
  ok(c + ': a rota da tela dona é a do mapa de lá', t && L.onde && L.onde.url === t.rota, (t && t.rota) + ' x ' + (L.onde && L.onde.url));
  ok(c + ': toda chave de quem resolve existe no registro do PCP', L.perm && L.perm.length && L.perm.every(k => PERM.some(p => p.chave === k)), JSON.stringify(L.perm));
  ok(c + ': tem frase para a caixinha (um e vários)', Array.isArray(L.frase) && L.frase.length === 2);
  ok(c + ': quem resolve é escrito em palavras, e não a chave', PEND.quem(L) && !/sobmedida\./.test(PEND.quem(L)), PEND.quem(L));
});

console.log('\n2. sem a porta, não vira zero');
SMP.ligar(null);
let estourou = false; try{ linha('sm_baixa_boleto').contar({}); }catch(e){ estourou = true; }
ok('a linha estoura sem a porta (a central diz "não consegui contar")', estourou);
const soSm = { tem:() => true, abre:r => AT.ehSobMedida(r), sm:{ id:1, nome:'X', permissoes:[], setores:[] }, quem:{ id:1, nome:'X' } };
let m = PEND.minhas({}, soSm);
ok('na etiqueta, sem a porta, as telas do sob medida dizem erro ("?"), nunca zero',
   m.erro === true && SM.every(c => m.por_tela[TELA[c]] && m.por_tela[TELA[c]].erro === true), JSON.stringify(m));

console.log('\n3. a etiqueta: chave E tela dona; o usuário de lá vai à porta');
const chamadas = [];
SMP.ligar(function(tipo, u){
  chamadas.push({ tipo, u, args:arguments.length });
  const total = { baixa_boleto:3, descarte_sobra:2, correcao_corte:1, pedido_aprovar:4, conferir:5 }[tipo];
  if(arguments.length < 2) return { n:total, desde:'2026-11-01 10:00:00' };
  if(!u) return { n:0, desde:null };
  return { n:u.id === 50 ? total - 1 : total, desde:'2026-11-01 10:00:00' };   // a pessoa 50 "pediu" uma
});
ok('contar sem pessoa é o total da fila', SMP.contar('baixa_boleto').n === 3 && chamadas.pop().args === 1);
const usm = { id:50, nome:'Fulana', permissoes:['boleto.aprovar_baixa'], setores:[] };
const fulana = { tem:c => c === 'sobmedida.boleto.aprovar_baixa', abre:r => r === '/sobmedida/financeiro', sm:usm, quem:{ id:50, nome:'Fulana' } };
m = PEND.minhas({}, fulana);
ok('quem aprova baixa e abre a 616 vê a bolinha da 616', m.por_tela[616] && m.por_tela[616].n === 2, JSON.stringify(m));
ok('…com o usuário do sob medida passado à porta (a régua de pessoa é de lá)', chamadas.some(c => c.tipo === 'baixa_boleto' && c.u === usm));
ok('…e só ela: as outras filas do sob medida não aparecem', Object.keys(m.por_tela).join(',') === '616', Object.keys(m.por_tela).join(','));
ok('o total do botão é o da pessoa', m.total === 2, m.total);
m = PEND.minhas({}, Object.assign({}, fulana, { abre:() => false }));
ok('com a chave e sem abrir a tela dona, nada', !m.por_tela[616] && m.total === 0, JSON.stringify(m));
m = PEND.minhas({}, Object.assign({}, fulana, { tem:() => false }));
ok('abrindo a tela e sem a chave de quem resolve, nada', !m.por_tela[616], JSON.stringify(m));
const vend = { tem:c => c === 'sobmedida.pedido.aprovar', abre:r => r === '/sobmedida/pedidos', sm:{ id:7, nome:'Renato', permissoes:['pedido.aprovar'], setores:[] }, quem:{ id:7, nome:'Renato' } };
m = PEND.minhas({}, vend);
ok('o vendedor com "aprovar" (só a carteira dele) vê a 611', m.por_tela[611] && m.por_tela[611].n === 4, JSON.stringify(m));
m = PEND.minhas({}, Object.assign({}, vend, { tem:c => c === 'sobmedida.pedido.aprovar_qualquer' }));
ok('quem aprova qualquer pedido também', m.por_tela[611] && m.por_tela[611].n === 4);

console.log('\n4. "abre a tela" do sob medida é o portão de lá');
const decidiu = [];
const ac = chaves => ({
  permissoesDe: () => new Set(chaves),
  decidir: (u, r) => { decidiu.push(r); return { ok:r === '/admin/estoque' }; }
});
const u = { id:50, nome:'Fulana' };
ok('com a entrada e a chave da tela, abre a 616',
   AT.abre(ac(['sobmedida.modulo.entrar','sobmedida.boleto.ler']), u, '/sobmedida/financeiro') === true);
ok('sem a entrada no módulo, não abre (mesmo com a chave da tela)',
   AT.abre(ac(['sobmedida.boleto.ler']), u, '/sobmedida/financeiro') === false);
ok('com a entrada e sem a chave da tela, não abre',
   AT.abre(ac(['sobmedida.modulo.entrar']), u, '/sobmedida/financeiro') === false);
decidiu.length = 0;
AT.abre(ac(['sobmedida.modulo.entrar','sobmedida.boleto.ler']), u, '/sobmedida/financeiro');
ok('…e o decidir do PCP não é perguntado sobre a tela de lá', decidiu.length === 0, decidiu.join(','));
ok('a tela do PCP continua pelo decidir', AT.abre(ac([]), u, '/admin/estoque') === true && AT.abre(ac([]), u, '/admin/skus') === false);
ok('a tela pelo número acha as duas operações', AT.telaDe(616).rota === '/sobmedida/financeiro' && AT.telaDe(301).rota === '/admin/estoque');
const at = fs.readFileSync(path.join(__dirname, 'admin_telas.js'), 'utf8');
ok('o ☰ Menu usa a mesma conta (abre_tela.js), sem uma segunda cópia',
   /require\('\.\/abre_tela'\)/.test(at) && !/daSessaoDoPcp/.test(at.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
const pr = fs.readFileSync(path.join(__dirname, 'pendencias_route.js'), 'utf8');
ok('a etiqueta pergunta ao abre_tela.js (as duas operações)', /AT\.abre\(ac, u, r, sm\)/.test(pr) && /AT\.usuarioSm\(ac, u\)/.test(pr));

console.log('\n5. a caixinha nas ações do sob medida');
const VIG = require('./pendencias_vigia');
[['/sobmedida/api/boletos/12/baixa','sm_baixa_boleto'], ['/sobmedida/api/sobras/3/descartar','sm_descarte_sobra'],
 ['/sobmedida/api/planos/9/correcao','sm_correcao_corte']].forEach(([r, c]) => {
  ok(r + ' é vigiada, pela linha ' + c, (VIG.vigiaDe(r) || []).indexOf(c) >= 0, JSON.stringify(VIG.vigiaDe(r)));
});
/* ③ REVISÃO: todo envio cria, por definição, um pedido esperando aprovação — a
   caixinha apareceria em todo envio, o motivo da 251 (D11). O pedido fica na
   central e na bolinha; a caixinha, não. */
ok('enviar pedido (611) NÃO mostra a caixinha', VIG.vigiaDe('/sobmedida/api/pedidos/4/enviar') == null);
ok('a entrada de rolo do sob medida (aposentada, sempre recusa) não está na lista', VIG.vigiaDe('/sobmedida/api/rolos') == null);
/* ③ REVISÃO (rodada 2): só cria cadastro "a conferir" quem NÃO tem
   cadastro.editar — a bancada, na 604, que não abre a 606: a caixinha sairia
   sem botão em toda haste ou nível criado (o motivo da D11). A tabela §3.2 da
   spec só lista 602, 603 e 616. O cadastro fica na central e na bolinha. */
['hastes','andares','niveis','fornecedores'].forEach(r =>
  ok('criar ' + r + ' no sob medida NÃO mostra a caixinha', VIG.vigiaDe('/sobmedida/api/' + r) == null));
ok('a frase do cadastro a conferir diz que é do sob medida (aparece também na 502 do PCP)', /sob medida/.test(PEND.frase(linha('sm_conferir'), 1)) && /sob medida/.test(PEND.frase(linha('sm_conferir'), 2)), PEND.frase(linha('sm_conferir'), 1));
ok('a prévia da correção (que não cria nada) não é vigiada', VIG.vigiaDe('/sobmedida/api/planos/9/correcao/previa') == null);
ok('aprovar e recusar a baixa não são vigiados', VIG.vigiaDe('/sobmedida/api/boletos/baixas/3/aprovar') == null);
ok('o recebimento do PCP (o rolo do sob medida pode criar largura nova) olha o cadastro a conferir', (VIG.vigiaDe('/api/recebimento') || []).indexOf('sm_conferir') >= 0);

const express = require('express');
let baixas = 3;
SMP.ligar(tipo => ({ n:tipo === 'baixa_boleto' ? baixas : 0, desde:null }));
const app = express(); app.use(express.json());
const pcp = { id:50, nome:'Fulana', areas:[] };
app.use((req, res, next) => { req.usuario = pcp; next(); });
app.locals.acesso = ac(['sobmedida.modulo.entrar','sobmedida.boleto.ler']);
VIG(app, {});
/* o portão do sob medida TROCA o req.usuario pelo de lá, como o montar.js */
app.use('/sobmedida', (req, res, next) => { req.usuario = { id:50, nome:'Fulana', permissoes:['boleto.ler'], setores:[], via:'pcp' }; next(); });
app.post('/sobmedida/api/boletos/:id/baixa', (req, res) => {
  if(req.query.modo === 'recusa') return res.status(400).json({ ok:false, motivo:'ja_pedida', mensagem:'já pedida' });
  baixas++; res.json({ ok:true, dados:{ id:+req.params.id } });
});
(async () => {
  const srv = app.listen(0); const base = 'http://127.0.0.1:' + srv.address().port;
  const post = async url => { const r = await fetch(base + url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:'{}' }); return { status:r.status, corpo:await r.json() }; };
  let r = await post('/sobmedida/api/boletos/12/baixa');
  const p = (r.corpo.pendencias || [])[0] || {};
  ok('pedir a baixa responde com a caixinha', p.chave === 'sm_baixa_boleto' && p.n === 1, JSON.stringify(r.corpo));
  ok('…apontando a 616 do sob medida, com o botão (quem pediu abre a tela)', p.tela === 616 && p.rota === '/sobmedida/financeiro' && p.pode === true, JSON.stringify(p));
  ok('…e a frase diz o que nasceu', /baixa de boleto espera outra pessoa aprovar/.test(p.frase || ''), p.frase);
  ok('a resposta da rota continua inteira ({ok, dados})', r.corpo.ok === true && r.corpo.dados && r.corpo.dados.id === 12);
  r = await post('/sobmedida/api/boletos/12/baixa?modo=recusa');
  ok('a recusa (ok:false) não ganha caixinha', r.status === 400 && !r.corpo.pendencias, JSON.stringify(r.corpo));
  app.locals.acesso = ac(['sobmedida.modulo.entrar']);   // sem a chave da 616
  r = await post('/sobmedida/api/boletos/13/baixa');
  const q = (r.corpo.pendencias || [])[0] || {};
  ok('quem não abre a 616 recebe quem resolve, sem o botão', q.pode === false && q.rota === null && /baixa/i.test(q.quem || ''), JSON.stringify(q));
  srv.close();

  console.log('\n6. o lugar');
  const sv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  ok('o server.js liga a porta com o que o montar() devolveu', /require\('\.\/sobmedida_pendencias'\)\.ligar\(sm && sm\.pendenciasParaPcp\)/.test(sv));
  const mt = fs.readFileSync(path.join(__dirname, 'tecido', 'montar.js'), 'utf8');
  ok('o montar() do sob medida devolve a porta', /pendenciasParaPcp:/.test(mt));
  const nav = fs.readFileSync(path.join(__dirname, 'tecido', 'public', 'nav.js'), 'utf8');
  ok('o nav.js do sob medida carrega a caixinha', nav.indexOf("'/pendencias_aviso.js'") >= 0);
  const dom = fs.readFileSync(path.join(__dirname, 'pendencias_dominio.js'), 'utf8');
  ok('a central não faz require do domínio do sob medida (a porta é a única)', !/require\('\.\/tecido\//.test(dom));

  console.log('\n' + (falhas ? falhas + ' FALHA(S) em ' : 'tudo certo: ') + casos + ' casos');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', e); process.exit(1); });
