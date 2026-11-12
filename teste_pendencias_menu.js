#!/usr/bin/env node
/* teste_pendencias_menu.js — a etiqueta vermelha das pendências no ☰ Menu
 * (spec docs/specs/PENDENCIAS-NO-MENU.md, fase 2, 12/11/2026).
 *
 *   node teste_pendencias_menu.js
 *
 * O que trava:
 *   1. só entra a linha em que a pessoa tem a chave de quem resolve E abre a
 *      tela dona (D1); a linha sem chave própria vale para quem abre a tela;
 *   2. o número por tela soma as linhas da mesma tela, e a mais antiga diz os
 *      dias;
 *   3. a linha que não deu para contar marca erro, e não vira zero;
 *   4. a cancelada nas duas linhas conta uma vez no total — e só se a pessoa
 *      vê as duas;
 *   5. a rota é @logado, pergunta pela própria pessoa e manda só números;
 *   6. o menu tem onde pendurar a bolinha, e os dois nav.js a pedem.
 */
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-pendmenu-'));
process.env.PCP_DIR = tmp;

let casos = 0, falhas = 0;
function ok(desc, cond, detalhe){
  casos++;
  if(cond) console.log('  ok  ' + casos + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + casos + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
const PEND = require('./pendencias_dominio');
const M = require('./telas');
const rotaDe = n => (M.TELAS.find(t => t.n === n) || {}).rota;

/* As linhas com números fixos: o teste é da escolha, não da conta de cada tela
   (essa é do teste_pendencias.js). */
const ontem = (() => { const d = new Date(Date.now() - 2 * 86400000), z = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' 08:00:00'; })();
const FIXO = {
  bloqueados:{ n:2, desde:ontem }, correcoes:{ n:1, desde:null, canceladas:[77] },
  ajuste:{ n:3, desde:ontem }, sobras:{ n:1, desde:null, canceladas:[77] },
  recebimento_retido:{ n:1, desde:null }, recebimento_aviso:{ n:2, desde:null },
  devolucoes:'erro'
};
const original = {}, origMinha = {};
PEND.LINHAS.forEach(L => {
  original[L.chave] = L.contar; origMinha[L.chave] = L.minha; delete L.minha;
  L.contar = () => { const f = FIXO[L.chave]; if(f === 'erro') throw new Error('quebrou'); return f || { n:0, desde:null }; };
});
const pessoa = (chaves, telas) => ({ tem:c => chaves.includes(c), abre:r => telas.some(n => rotaDe(n) === r) });

console.log('\n1 a 4. a conta do que a pessoa resolve');
let r = PEND.minhas(null, pessoa(['estoque.aprovar_ajuste'], [301]));
ok('quem só aprova ajuste vê só a 301', Object.keys(r.por_tela).join() === '301' && r.por_tela[301].n === 3 && r.total === 3, JSON.stringify(r));
ok('…e os dias da mais antiga', r.por_tela[301].dias === 2, JSON.stringify(r.por_tela[301]));
r = PEND.minhas(null, pessoa(['estoque.aprovar_ajuste'], []));
ok('com a chave, mas sem abrir a tela dona, não vê nada', r.total === 0 && !Object.keys(r.por_tela).length, JSON.stringify(r));
r = PEND.minhas(null, pessoa([], [301]));
ok('abrindo a tela, mas sem a chave, não vê nada', r.total === 0, JSON.stringify(r));
r = PEND.minhas(null, pessoa([], [204]));
ok('Bloqueados (sem chave própria) vale para quem abre a 204', r.por_tela[204] && r.por_tela[204].n === 2, JSON.stringify(r));
r = PEND.minhas(null, pessoa(['recebimento.liberar'], [1201]));
ok('duas linhas na mesma tela somam (1201 = retido + aviso)', r.por_tela[1201].n === 3 && r.total === 3, JSON.stringify(r));
r = PEND.minhas(null, pessoa(['devolucao.baixar'], [253]));
ok('linha que não deu para contar marca erro, e não vira zero', r.por_tela[253].erro === true && r.por_tela[253].n === 0 && r.erro === true && r.total === 0, JSON.stringify(r));
r = PEND.minhas(null, pessoa(['correcao.executar','cancelamento.confirmar'], [204, 202]));
ok('a cancelada nas duas linhas conta uma vez no total', r.total === 2 + 1 + 1 - 1, JSON.stringify(r));
ok('…mas cada tela mostra a sua', r.por_tela[202].n === 1 && r.por_tela[204].n === 3, JSON.stringify(r.por_tela));
r = PEND.minhas(null, pessoa(['cancelamento.confirmar'], [202]));
ok('quem vê só uma das duas linhas não desconta', r.total === 1, JSON.stringify(r));
r = PEND.minhas(null, pessoa([], []));
ok('quem não resolve nada vê zero', r.total === 0 && !r.erro, JSON.stringify(r));
ok('nenhuma chave de dado de tela viaja (só números)', !/codigo|buyer|cliente|saldo|sku/i.test(JSON.stringify(PEND.minhas(null, pessoa(['estoque.aprovar_ajuste','recebimento.liberar'], [301, 1201, 204])))));

PEND.LINHAS.forEach(L => { L.contar = original[L.chave]; if(origMinha[L.chave]) L.minha = origMinha[L.chave]; });

console.log('\n5. a rota');
const express = require('express');
const db = require('./db.js');
const app = express(); app.use(express.json());
let eu = { id:5, nome:'Quem Olha', areas:[] };
app.use((req,res,next) => { if(eu) req.usuario = eu; next(); });
['sku_cad_route','exp_route','mont_route','carreg_route','est_route','cont_route','inventario_route','ajuste_route',
 'correcao_route','dev_route','cad_route','sku_route','compras_route','pendencias_route']
  .forEach(m => { try{ require('./' + m)(app, db); }catch(e){} });
require('./acesso')(app, db);
const AC = app.locals.acesso;
ok('a rota é @logado no permDaRota', AC.permDaRota('/api/pendencias/minhas', 'GET') === '@logado');
/* ③ REVISÃO da fase 2: a linha tem que apontar a tela onde a decisão MORA — a
   tela cuja porta aceita a chave de quem resolve. "Sem acordo" apontava a 303,
   que só abre com contar/desempatar, e quem tem contagem.resolver nunca via. */
const PERMS = require('./permissoes');
const nivelDe = c => (PERMS.find(x => x.chave === c) || {}).nivel;
const telaDaChave = c => (PERMS.find(x => x.chave === c) || {}).tela;
PEND.LINHAS.filter(L => L.perm.length).forEach(L => {
  const exige = [].concat(AC.permDaRota(rotaDe(L.tela), 'GET'));
  /* a chave abre a tela, ou pendura nela (é ali que a ação mora, R-ALC-03) */
  const abre = L.perm.some(c => exige.includes(c) || telaDaChave(c) === L.tela
    || (exige.includes('@admin') && ['admin','admin_geral'].includes(nivelDe(c))));
  ok(L.chave + ': a chave de resolver abre a tela ' + L.tela + ' ou mora nela', abre, 'a tela pede ' + JSON.stringify(exige) + ', a linha resolve com ' + JSON.stringify(L.perm));
});
const pergunta = [];
let chavesDeEu = ['estoque.aprovar_ajuste'];
AC.podePermissao = (u, c) => { pergunta.push(u && u.id); return chavesDeEu.includes(c); };
AC.decidir = (u, rota) => ({ ok: rota === '/admin/estoque' });
db.prepare("INSERT OR IGNORE INTO skus (codigo, estoque) VALUES ('BKMENU1', 5)").run();
db.prepare("INSERT INTO ajuste_pedido (codigo, delta, saldo_no_pedido, motivo, pedido_por, status, pedido_em) VALUES ('BKMENU1',-1,5,'Perda','Fulano','pendente',datetime('now','localtime'))").run();
(async () => {
  const srv = app.listen(0); const base = 'http://127.0.0.1:' + srv.address().port;
  let res = await fetch(base + '/api/pendencias/minhas?usuario=1'); let j = await res.json();
  ok('responde com o pedido de ajuste na 301', res.status === 200 && j.por_tela && j.por_tela[301] && j.por_tela[301].n === 1 && j.total === 1, JSON.stringify(j));
  ok('pergunta pela pessoa do login, e não pela do parâmetro', pergunta.length && pergunta.every(x => x === 5), JSON.stringify(pergunta));
  ok('nada de SKU, cliente ou saldo na resposta', !/BKMENU|Fulano|saldo|codigo/.test(JSON.stringify(j)), JSON.stringify(j));
  /* ③ REVISÃO: a etiqueta pergunta ao DONO quem pode decidir, pessoa a pessoa —
     quem pediu o ajuste não o aprova (R-EST-20), e não pode ver a bolinha dele. */
  db.prepare("INSERT INTO ajuste_pedido (codigo, delta, saldo_no_pedido, motivo, pedido_por, pedido_por_id, status, pedido_em) VALUES ('BKMENU1',1,5,'Achei','Quem Olha',5,'pendente',datetime('now','localtime'))").run();
  j = await (await fetch(base + '/api/pendencias/minhas')).json();
  ok('o pedido de ajuste da própria pessoa não entra na etiqueta dela', j.por_tela[301] && j.por_tela[301].n === 1, JSON.stringify(j));
  /* a venda cancelada aguardando confirmação: só quem confirma, e nunca quem marcou (R-REC-06) */
  require('./cancel_conf').garantir(db);
  db.prepare("INSERT INTO cancelamento_caixa (lote_id, situacao, marcado_por, marcado_por_id) VALUES (901,'aguardando','Quem Olha',5)").run();
  db.prepare("INSERT INTO cancelamento_caixa (lote_id, situacao, marcado_por, marcado_por_id) VALUES (902,'aguardando','Outra',9)").run();
  chavesDeEu = ['carregamento.executar'];
  AC.decidir = (u, rota) => ({ ok: rota === '/carregamento' });
  j = await (await fetch(base + '/api/pendencias/minhas')).json();
  ok('quem só confere (sem confirmar) não vê a cancelada aguardando confirmação', !j.por_tela[202] || j.por_tela[202].n === 0, JSON.stringify(j));
  chavesDeEu = ['cancelamento.confirmar'];
  j = await (await fetch(base + '/api/pendencias/minhas')).json();
  ok('quem confirma vê só a que outra pessoa marcou', j.por_tela[202] && j.por_tela[202].n === 1, JSON.stringify(j));
  chavesDeEu = ['estoque.aprovar_ajuste']; AC.decidir = (u, rota) => ({ ok: rota === '/admin/estoque' });
  eu = null;
  res = await fetch(base + '/api/pendencias/minhas');
  ok('sem login: 401', res.status === 401);
  srv.close();

  console.log('\n6. o menu e as duas operações');
  const T = require('./public/menu_telas.js').MENU_TELAS;
  const h = T.html({ telas:[{ n:301, nome:'Estoque', rota:'/admin/estoque', modulo:'estoque', bloco:'comum' }], modulos:[{ chave:'estoque', nome:'Estoque' }], blocos:{} }, '/x');
  ok('cada tela do menu leva o número para pendurar a bolinha', /data-n="301"/.test(h), h);
  ok('o menu_telas.js tem a bolinha e a pergunta à rota', typeof T.etiquetas === 'function' && typeof T.pendencias === 'function'
    && fs.readFileSync(path.join(__dirname, 'public', 'menu_telas.js'), 'utf8').indexOf("'/api/pendencias/minhas'") >= 0);
  const mt = fs.readFileSync(path.join(__dirname, 'public', 'menu_telas.js'), 'utf8');
  ok('a pergunta é de 60 s e não pergunta com a aba escondida', /setInterval\(pedirPendencias, 60000\)/.test(mt) && /document\.hidden/.test(mt));
  ok('zero não desenha bolinha; erro desenha "?"', /if\(!t \|\| \(!t\.n && !t\.erro\)\) return;/.test(mt) && /'\?'/.test(mt));
  const navP = fs.readFileSync(path.join(__dirname, 'public', 'nav.js'), 'utf8');
  const navS = fs.readFileSync(path.join(__dirname, 'tecido', 'public', 'nav.js'), 'utf8');
  ok('o nav.js da medida padrão pede a bolinha com o botão ☰ Menu', /MENU_TELAS\.pendencias\(m, document\.getElementById\('sessMenu'\)\)/.test(navP));
  ok('ao voltar para a aba, a etiqueta pergunta de novo', /visibilitychange/.test(mt));
  ok('o nav.js do sob medida também', /MENU_TELAS\.pendencias\(MENU\.painel, MENU\.botao\)/.test(navS) && /MENU\.botao=bm/.test(navS));

  console.log('\n' + (falhas ? falhas + ' FALHA(S) em ' : 'tudo certo: ') + casos + ' casos');
  try{ fs.rmSync(tmp, { recursive:true, force:true }); }catch(e){}
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', e); process.exit(1); });
