#!/usr/bin/env node
/* teste_admin_telas.js — O ADMIN DE 16 ABAS VIRA TELAS (spec
 * ACESSO-POR-TELA-E-NIVEL, fase 5, R-TEL-05; decisão D2 (A) do dono).
 *
 *   node teste_admin_telas.js
 *
 * Trava:
 *   - cada aba é uma tela com endereço próprio (`/admin/...`), número e as
 *     permissões da linha dela no mapa; Planejamento, Relatórios e Acessos são
 *     as telas que já existiam (sai o iframe);
 *   - quem abre uma tela do Admin abre só ela: as abas somem, e as cargas das
 *     outras não rodam;
 *   - a porta (`/`, `/admin`, `/index.html`) leva cada pessoa à primeira tela
 *     que ela alcança, e o link antigo `/admin#dv` leva à tela nova;
 *   - a tela abre pelo NÍVEL da pessoa e pela permissão (o Supervisor com
 *     `compras.ver` não abre a 501, que é de nível Admin).
 */
const fs = require('fs'), path = require('path');
const M = require('./telas');
const P = require('./perfis_acesso');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, a, e){ ok(desc, a === e, 'esperado ' + JSON.stringify(e) + ', veio ' + JSON.stringify(a)); }

const B = P.montar();
let ADM = null;
try{ ADM = require('./admin_telas'); ADM(B.app, B.db); }catch(e){ console.log('  (admin_telas.js: ' + e.message + ')'); }
const sessao = nome => { const p = B.pessoas.find(x => x.nome.indexOf(nome) === 0); return Object.assign(B.db.prepare('SELECT * FROM usuarios WHERE id=?').get(p.id), { areas:[] }); };
function abrir(rota, u){
  const h = B.rotas['GET ' + rota];
  const out = { status:200, body:'', redir:null, tipo:null };
  if(!h) return null;
  const res = { status(c){ out.status = c; return res; }, send(b){ out.body = String(b); return res; }, type(t){ out.tipo = t; return res; },
    json(b){ out.body = JSON.stringify(b); out.json = b; return res; }, redirect(u){ out.redir = u; return res; },
    sendFile(f){ out.body = fs.readFileSync(f, 'utf8'); return res; }, set(){ return res; } };
  h({ usuario:u, params:{}, query:{}, headers:{}, path:rota }, res);
  return out;
}
const ADMIN = M.TELAS.filter(t => t.rota.indexOf('/admin/') === 0);

console.log('\n── 1. cada aba é uma tela com endereço próprio ──');
eq('são 12 telas novas em /admin/ (Planejamento, Relatórios e Acessos já tinham endereço; a 903 saiu em 11/11/2026)', ADMIN.filter(t => t.aba).length, 12);
/* ARRUMAR-O-LUGAR fase 2 (11/11/2026): seis abas da 501 viraram telas /admin/
   com o `cmp` delas — o mesmo index.html, abrindo o painel de Compras só com a
   aba (teste_501_so_compra.js). */
eq('e mais 6 que eram abas da 501 (1101, 1102, 1103, 1201, 1301 e 1302)', ADMIN.filter(t => t.cmp).map(t => t.n).join(','), '1101,1102,1103,1201,1301,1302');
ok('o módulo admin_telas.js existe', typeof ADM === 'function');
for(const t of ADMIN){
  const d = B.AC.permDaRota(t.rota, 'GET'), arr = Array.isArray(d) ? d : [d];
  ok(t.n + ' ' + t.rota + ' abre com as permissões da linha do mapa', JSON.stringify(arr) === JSON.stringify(t.perms), JSON.stringify(d));
  const r = abrir(t.rota, sessao('Lucas'));
  const aba = t.aba || 'compras';
  ok('   e responde com a tela dela (TELA_ADMIN = ' + aba + (t.cmp ? ' · ' + t.cmp : '') + ')', !!r && r.body.indexOf('"aba":"' + aba + '"') >= 0
    && (!t.cmp || r.body.indexOf('"cmp":"' + t.cmp + '"') >= 0) && r.body.indexOf('<div class="tabs"') >= 0);
}
const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
ok('saiu o iframe (Planejamento, Relatórios e Acessos abrem a tela deles)', html.indexOf('<iframe') < 0);
ok('com TELA_ADMIN, a faixa de abas some', /TELA_ADMIN[\s\S]{0,400}\.tabs[\s\S]{0,80}display\s*=\s*['"]none/.test(html) || /\.tabs'\)\.style\.display='none'/.test(html));
ok('clicar no caminho para outra aba leva à tela dela (ROTA_DA_ABA)', /ROTA_DA_ABA/.test(html) && /location\.href\s*=\s*ROTA_DA_ABA/.test(html));
ok('a carga de 4 s (produção, cadastro) só roda nas telas dela', /naTela\('prod','est','cad','pend'\)/.test(html));
ok('a carga de 30 s das Pendências só roda na 204', /naTela\('blq'\)/.test(html));

const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const iAuth = srv.indexOf("require('./auth')(app, db)"), iAdm = srv.indexOf("require('./admin_telas')(app, db)"), iSt = srv.indexOf('express.static(');
ok('server.js: admin_telas DEPOIS do auth e ANTES do static (armadilha #3)', iAuth >= 0 && iAdm > iAuth && iSt > iAdm, [iAuth, iAdm, iSt].join(','));
ok('server.js: o static não entrega o index.html no / (index:false)', srv.indexOf("express.static(path.join(__dirname, 'public'), { index:false })") >= 0);
const authTxt = fs.readFileSync(path.join(__dirname, 'auth.js'), 'utf8');
ok('auth.js: as telas /admin/ entram na lista protegida (sem sessão, 302)', /indexOf\('\/admin\/'\)===0\) TELAS\[t\.rota\]='admin'/.test(authTxt));
const semSessao = abrir('/admin/estoque', null);
ok('a tela do Admin sem sessão manda ao login', !!semSessao && /\/login/.test(semSessao.redir || ''), JSON.stringify(semSessao && semSessao.redir));

console.log('\n── 2. a porta do Admin e o link antigo ──');
for(const r of ['/', '/admin', '/index.html']){
  const o = abrir(r, sessao('Ana'));
  ok(r + ' responde com a porta (não com as 16 abas)', !!o && /PORTA_ADMIN/.test(o.body) && o.body.indexOf('<div class="tabs"') < 0);
}
const porta = (abrir('/admin', sessao('Ana')) || { body:'' }).body;
const abas = ['prod','pb','blq','cor','dv','est','ct','plan','cad','pend','ficha','compras','acs','cd','tst','rel'];
ok('a porta conhece o link antigo de cada uma das 16 abas', abas.every(a => porta.indexOf('"' + a + '"') >= 0), abas.filter(a => porta.indexOf('"' + a + '"') < 0).join(','));
const minhas = abrir('/api/telas/minhas', sessao('Ana'));
ok('/api/telas/minhas diz as telas que a pessoa abre', !!minhas && Array.isArray(minhas.json && minhas.json.telas));
const nAna = ((minhas && minhas.json && minhas.json.telas) || []).map(t => t.n);
ok('   a Ana (Admin) abre a 301 Estoque e a 253 Baixa', nAna.indexOf(301) >= 0 && nAna.indexOf(253) >= 0, nAna.join(','));
ok('   e não abre a 901 Acessos', nAna.indexOf(901) < 0);
eq('a permissão de /api/telas/minhas é estar logado', B.AC.permDaRota('/api/telas/minhas', 'GET'), '@logado');

console.log('\n── 3. a tela abre pelo nível E pela permissão (D2 A) ──');
const dec = (nome, rota) => B.AC.decidir(sessao(nome), rota, 'GET').ok;
eq('Igor (Supervisor + baixa por exceção): nível Admin pela migração, abre a 253', dec('Igor', '/admin/devolucoes'), true);
eq('   mas não a 903 Modo teste', dec('Igor', '/admin/teste'), false);
eq('   e abre a 301 Estoque (todo nível Admin)', dec('Igor', '/admin/estoque'), true);
eq('Lia (só o dinheiro): não abre a 253 Baixa', dec('Lia', '/admin/devolucoes'), false);
eq('Carla (Comprador) abre a 501 Compras', dec('Carla', '/admin/compras'), true);
eq('Sergio (Supervisor) não abre a 501, mesmo que lhe dessem compras.ver', dec('Sergio', '/admin/compras'), false);
B.db.prepare("INSERT INTO usuario_excecao (usuario_id,chave,concede) VALUES (?,'compras.ver',1)").run(B.pessoas.find(p => /^Sergio/.test(p.nome)).id);
eq('   com compras.ver (Supervisor) no banco, a 501 continua fechada: a tela é de nível Admin', dec('Sergio', '/admin/compras'), false);
eq('Edvaldo (Operação) não abre nenhuma tela do Admin', ADMIN.some(t => dec('Edvaldo', t.rota)), false);
eq('Lucas (Admin Geral) abre todas', ADMIN.every(t => dec('Lucas', t.rota)), true);

B.fechar();
console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
process.exit(falhas ? 1 : 0);
