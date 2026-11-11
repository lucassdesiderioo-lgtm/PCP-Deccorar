#!/usr/bin/env node
/* teste_501_so_compra.js — A 501 FICA SÓ COM COMPRA (spec ARRUMAR-O-LUGAR, fase 2).
 *
 *   node teste_501_so_compra.js
 *
 * Seis abas da 501 viram telas no módulo do assunto delas (1101 Materiais, 1102
 * Fornecedores, 1103 Almoxarifados e endereços, 1201 Recebimento retido, 1301
 * Notas fiscais de compra, 1302 Certificado digital), e a parte de material da
 * 302 vai para a 504 (decisão do dono: "a"). Trava:
 *   - cada tela nova no mapa, no módulo e bloco do "Onde mora", abrindo com as
 *     MESMAS chaves que mostravam a aba (ninguém ganha nem perde, pessoa a pessoa);
 *   - a 501 com as quatro abas de compra, e o link antigo levando à tela nova;
 *   - o Fiscal inaugurado e a lista do que está fora do lugar encolhida;
 *   - a caixinha de cada ação pendurada na tela nova na tela de Acessos;
 *   - a aprovação da contagem de material e os ajustes antigos de material na
 *     504, para quem tem a chave de aprovar ou de ajustar, e fora da 302.
 */
const fs = require('fs'), path = require('path');
const M = require('./telas');
const MO = require('./modulos');
const PERMISSOES = require('./permissoes');
const P = require('./perfis_acesso');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
const ler = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ABAS_JS = ler('public/compras_abas.js');
const INDEX = ler('public/index.html');

/* As abas como o compras_abas.js as registra: id, perms e le (a regra de quem
   VIA a aba na 501 — é a mesma que abre a tela nova). */
function registro(id){
  const m = ABAS_JS.match(new RegExp("registrar\\(\\s*\\{\\s*id\\s*:\\s*'" + id + "'[^\\n]*"));
  if(!m) return null;
  const lista = k => { const x = m[0].match(new RegExp(k + "\\s*:\\s*\\[([^\\]]*)\\]")); return x ? x[1].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean) : null; };
  return { perms: lista('perms'), le: lista('le'), tela: (m[0].match(/tela\s*:\s*(\d+)/) || [])[1] };
}

const NOVAS = [
  { n:1101, cmp:'materiais',    rota:'/admin/materiais',          modulo:'cadastros',    nivel:'admin' },
  { n:1102, cmp:'fornecedores', rota:'/admin/fornecedores',       modulo:'cadastros',    nivel:'admin' },
  { n:1103, cmp:'almox',        rota:'/admin/almoxarifados',      modulo:'cadastros',    nivel:'admin' },
  { n:1201, cmp:'retidos',      rota:'/admin/recebimento-retido', modulo:'almoxarifado', nivel:'admin' },
  { n:1301, cmp:'notas',        rota:'/admin/notas',              modulo:'fiscal',       nivel:'admin' },
  { n:1302, cmp:'certificado',  rota:'/admin/certificado',        modulo:'fiscal',       nivel:'admin_geral' }
];

console.log('\n── 1. as seis telas novas no mapa ──');
for(const e of NOVAS){
  const t = M.porNumero(e.n);
  ok(e.n + ' existe, em ' + e.rota, !!t && t.rota === e.rota, JSON.stringify(t && { rota:t.rota }));
  if(!t) continue;
  ok('   módulo ' + e.modulo + ', bloco Comum, nível ' + e.nivel, t.modulo === e.modulo && t.bloco === 'comum' && t.nivel === e.nivel,
    JSON.stringify({ modulo:t.modulo, bloco:t.bloco, nivel:t.nivel }));
  ok('   mostra a aba "' + e.cmp + '" do compras_abas.js, e diz a que se liga', t.cmp === e.cmp && Array.isArray(t.liga) && t.liga.length > 0);
  const r = registro(e.cmp) || {};
  /* Quem via a aba: tinha alguma de `perms` E alguma de `le` (quando há). A
     tela abre por uma lista só: ela tem que ser a que decide de fato. */
  const decide = r.le || r.perms || [];
  ok('   abre com as chaves que mostravam a aba (' + decide.join(', ') + ')',
    JSON.stringify((t.perms || []).slice().sort()) === JSON.stringify(decide.slice().sort()), JSON.stringify(t.perms));
  ok('   o registro da aba diz a tela dela', +r.tela === e.n, JSON.stringify(r));
}
ok('a 1301 mostra dinheiro (as notas) e declara a chave do valor', (M.porNumero(1301) || {}).valor && M.porNumero(1301).valor[0] === 'compras.valores');

console.log('\n── 2. a 501 fica só com compra ──');
const t501 = M.porNumero(501);
ok('a 501 declara só as quatro abas de compra',
  JSON.stringify((t501.abas || []).map(a => a.id)) === JSON.stringify(['lista','pedidos','rapida','programada']), JSON.stringify((t501.abas || []).map(a => a.id)));
ok('as abas que saíram não aparecem mais na 501 (o registro delas aponta outra tela)',
  NOVAS.every(e => +((registro(e.cmp) || {}).tela) !== 501));
ok('o compras_abas.js desenha a aba sozinha, sem a faixa, quando a tela é uma das novas (TELA_ADMIN.cmp)', /TELA_ADMIN[\s\S]{0,200}cmp/.test(ABAS_JS));
ok('o link antigo da 501 numa aba que saiu leva à tela nova (o hash e a aba lembrada)', /location\.(replace|href)/.test(ABAS_JS) && /location\.hash/.test(ABAS_JS));
ok('o index.html abre a aba da tela nova (CMP.abrir com o cmp da tela)', /TELA\s*&&\s*TELA\.cmp/.test(INDEX));
const porta = ler('admin_telas.js');
ok('o admin_telas.js manda o cmp da tela no TELA_ADMIN', /cmp\s*:\s*t\.cmp/.test(porta));

console.log('\n── 3. o Fiscal inaugurado e o que estava fora do lugar ──');
ok('o módulo Fiscal existe (inaugurado pela 1301)', (MO.porChave('fiscal') || {}).situacao === 'existe');
const fora = MO.FORA_DO_LUGAR.map(f => f.item);
ok('a lista do que está fora do lugar perdeu os seis itens da 501 e o da 302', !fora.some(i => /^501\//.test(i) || i === '302/material'), fora.join(', '));
ok('fica só o 902/horarios (é da fase 3)', JSON.stringify(fora) === JSON.stringify(['902/horarios']), fora.join(', '));
ok('nenhum número novo fora da faixa do módulo', NOVAS.every(e => MO.moduloDaFaixa(e.n) === e.modulo));

console.log('\n── 4. a caixinha de cada ação na tela nova (tela de Acessos) ──');
const infoPerm = {}; PERMISSOES.forEach(p => infoPerm[p.chave] = p);
const TELA_DA_ACAO = { 'componente.cadastrar':1101, 'fornecedor.cadastrar':1102, 'almoxarifado.cadastrar':1103,
  'recebimento.liberar':1201, 'nota.lancar':1301, 'certificado.gerenciar':1302 };
for(const [c, t] of Object.entries(TELA_DA_ACAO))
  ok(c + ' aparece pendurada na ' + t, infoPerm[c] && infoPerm[c].tela === t, JSON.stringify(infoPerm[c] && infoPerm[c].tela));

console.log('\n── 5. ninguém ganha nem perde, pessoa a pessoa ──');
const B = P.montar();
try{
  const pode = (u, r) => B.AC.decidir(u, r, 'GET').ok;
  const perm = (u, lista) => { const ps = B.AC.permissoesDe(u.id); return B.AC.ehAdminGeral && B.AC.ehAdminGeral(u.id) || (lista || []).some(c => ps.has(c)); };
  for(const p of B.pessoas){
    const u = B.db.prepare('SELECT * FROM usuarios WHERE id=?').get(p.id);
    const difs = [];
    for(const e of NOVAS){
      const r = registro(e.cmp) || {};
      /* ANTES: a pessoa abria a 501 e a aba aparecia para ela. */
      const via = pode(u, '/admin/compras') && (!r.perms || perm(u, r.perms)) && (!r.le || perm(u, r.le));
      const abre = pode(u, e.rota);
      /* O ÚNICO GANHO ACEITO, e nomeado: a 1301 abre com custo.ver ("e as de
         leitura de hoje", spec §8), e quem tem custo.ver sem nenhuma chave da
         501 passa a ver na tela as notas que já lia pela rota (/api/notas
         aceita custo.ver). Nada que ele não lesse antes. */
      const aceito = e.n === 1301 && abre && !via && B.AC.permissoesDe(u.id).has('custo.ver') && pode(u, '/api/notas');
      if(via !== abre && !aceito) difs.push(e.n + (abre ? ' ganhou' : ' perdeu'));
    }
    ok(p.nome + ': abre as telas novas exatamente onde via as abas', !difs.length, difs.join(' · '));
  }
}finally{ B.fechar(); }

console.log('\n── 6. a parte de material da 302 vai para a 504 ──');
const t504 = M.porNumero(504);
ok('a 504 abre também para quem aprova a contagem de material ou os ajustes antigos',
  ['contagem.contar','contagem.aprovar','contagem.ajustar'].every(c => t504.perms.indexOf(c) >= 0), JSON.stringify(t504.perms));
const t302 = M.porNumero(302);
ok('a 302 não tem mais a parte de material', !(t302.partes || []).some(x => x.id === 'material'), JSON.stringify(t302.partes));
const C504 = ler('public/contagem-material.html');
ok('a 504 desenha a aprovação da contagem de material', /aprov_material\.js/.test(C504));
const APR = fs.existsSync(path.join(__dirname, 'public', 'aprov_material.js')) ? ler('public/aprov_material.js') : '';
ok('…pela rota da contagem por almoxarifado (contagem.aprovar)', /\/api\/contagem-material\/pendentes/.test(APR) && /contagem\.aprovar/.test(APR));
ok('…e os ajustes antigos de material, que só se rejeitam (contagem.ajustar)', /\/api\/contagem\/pendentes\/rejeitar/.test(APR) && /contagem\.ajustar/.test(APR) && !/pendentes\/aprovar/.test(APR));
ok('a 302 não desenha mais a aprovação de material nem o cartão "Material"', !/cmAprov/.test(INDEX) && !/contagemAprov/.test(INDEX) && !/>Material<\/div>/.test(INDEX));
ok('os ajustes antigos que ficam na 302 são só os de peça', /ctPendentes[\s\S]{0,600}tipo\s*!==\s*['"]componente['"]/.test(INDEX));
ok('o compras_abas.js não tem mais a aprovação da contagem (mudou de casa)', !/contagemAprov/.test(ABAS_JS));

console.log('\n' + (falhas ? falhas + ' FALHA(S) em ' : 'todos os ') + n + ' casos' + (falhas ? '' : ' passaram'));
process.exit(falhas ? 1 : 0);
