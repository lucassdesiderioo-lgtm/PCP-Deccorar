#!/usr/bin/env node
/* teste_mapa.js — o MAPA DE TELAS (spec ACESSO-POR-TELA-E-NIVEL, R-TEL e R-ALC).
 *
 *   node teste_mapa.js
 *
 * Trava:
 *   - uma tela = uma linha (`telas.js`): número único, módulo que existe, nível,
 *     permissão que existe; `.html` em public/ sem linha no mapa REPROVA (R-ALC-02);
 *   - toda permissão de permissoes.js tem nível e a TELA onde é usada (R-ALC-03);
 *   - toda tela do sob medida tem número 6xx e nível;
 *   - a trava do servidor e o destino depois do PIN saem do mapa;
 *   - NINGUÉM GANHA NEM PERDE: o que cada pessoa do banco de exemplo abre, as
 *     permissões dela e para onde vai depois do PIN são idênticos ao retrato de
 *     ANTES do mapa (teste_mapa_antes.json, gravado com o código de 04/11/2026).
 */
const fs = require('fs'), path = require('path');
const M = require('./telas');
const PERMISSOES = require('./permissoes');
const P = require('./perfis_acesso');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
const infoPerm = {}; PERMISSOES.forEach(p => infoPerm[p.chave] = p);

console.log('\n── 1. cada linha do mapa está completa ──');
const nums = M.TELAS.map(t => t.n);
ok('nenhum número repetido', new Set(nums).size === nums.length, nums.join(','));
const rotas = M.TELAS.map(t => t.rota);
ok('nenhum endereço repetido', new Set(rotas).size === rotas.length);
const semNivel = M.TELAS.filter(t => M.NIVEIS.indexOf(t.nivel) < 0).map(t => t.n);
ok('toda tela tem nível válido', !semNivel.length, semNivel.join(','));
const semPerm = M.TELAS.filter(t => !Array.isArray(t.perms) || !t.perms.length).map(t => t.n);
ok('toda tela tem ao menos uma permissão', !semPerm.length, semPerm.join(','));
const permFantasma = [];
M.TELAS.forEach(t => (t.perms||[]).forEach(c => { if(c !== '@admin' && !infoPerm[c]) permFantasma.push(t.n + ':' + c); }));
ok('toda permissão de tela existe em permissoes.js', !permFantasma.length, permFantasma.join(' '));
const semModulo = M.TELAS.filter(t => !M.MODULOS[M.moduloDe(t.n)]).map(t => t.n);
ok('toda tela está num módulo que existe (a centena)', !semModulo.length, semModulo.join(','));
const abaixo = M.TELAS.filter(t => {
  const niv = (t.perms||[]).map(c => c === '@admin' ? 'admin' : (infoPerm[c]||{}).nivel).map(M.ordemNivel);
  return niv.length && Math.min.apply(null, niv) > M.ordemNivel(t.nivel);
}).map(t => t.n);
ok('o nível da tela nunca é menor que a permissão mais baixa que a abre', !abaixo.length, abaixo.join(','));
ok('as telas 101 a 904 da spec estão todas no mapa',
  [101,102,103,104,105,201,202,203,204,205,251,252,253,301,302,303,401,402,403,404,501,502,901,902,903,904].every(x => M.porNumero(x)));

console.log('\n── 2. tela fora do mapa reprova ──');
const FORA = { 'login':'o login', 'setor':'a escolha de operação', 'index':'o Admin antigo — cada aba é uma linha com `aba`', 'admin_porta':'a porta do Admin, que só redireciona' };
const htmls = fs.readdirSync(path.join(__dirname, 'public')).filter(f => /\.html$/.test(f))
  .concat(fs.readdirSync(path.join(__dirname, 'views')).filter(f => /\.html$/.test(f)));
const orfas = htmls.map(f => f.replace(/\.html$/, '')).filter(b => !FORA[b] && !M.porRota('/' + b));
ok('todo .html de public/ e views/ tem linha no mapa (ou é login, setor ou o Admin)', !orfas.length, orfas.join(', '));
const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const abasHtml = Array.from(new Set((html.match(/class="tab[^"]*" data-t="([a-z]+)"/g) || []).map(s => s.replace(/.*data-t="/, '').slice(0, -1))));
const abasMapa = M.TELAS.filter(t => t.aba).map(t => t.aba);
const semLinha = abasHtml.filter(a => abasMapa.indexOf(a) < 0);
ok('as ' + abasHtml.length + ' abas do Admin são todas linhas do mapa', abasHtml.length === 16 && !semLinha.length, semLinha.join(','));

console.log('\n── 3. toda permissão tem nível e a tela onde é usada (R-ALC-03) ──');
const semTela = PERMISSOES.filter(p => !p.tela).map(p => p.chave);
ok('toda permissão tem `tela`', !semTela.length, semTela.slice(0, 12).join(', ') + (semTela.length > 12 ? ' …(+' + (semTela.length-12) + ')' : ''));
const SM = M.telasSobMedida();
const existe = x => !!M.porNumero(x) || SM.some(t => t.n === +x);
const telaFantasma = PERMISSOES.filter(p => p.tela && !existe(p.tela)).map(p => p.chave + '→' + p.tela);
ok('e a tela dela existe no mapa', !telaFantasma.length, telaFantasma.join(', '));
const permSemNivel = PERMISSOES.filter(p => M.NIVEIS.indexOf(p.nivel) < 0).map(p => p.chave);
ok('toda permissão tem nível válido', !permSemNivel.length, permSemNivel.join(', '));

console.log('\n── 4. as telas do sob medida têm número 6xx e nível ──');
let TSM = {}; try{ TSM = require('./tecido/nucleo/telas').TELAS; }catch(e){}
const smSem = Object.entries(TSM).filter(([r, t]) => !(t.numero >= 601 && t.numero <= 699) || M.NIVEIS.indexOf(t.nivel) < 0 || !t.nome).map(([r]) => r);
ok('toda tela de tecido/nucleo/telas.js tem número 6xx, nome e nível', Object.keys(TSM).length > 0 && !smSem.length, smSem.join(', '));
const smNums = SM.map(t => t.n);
ok('nenhum número repetido no sob medida (o apelido /inicio não conta)', new Set(smNums).size === smNums.length, smNums.join(','));
const smNivel = Object.entries(TSM).filter(([r, t]) => {
  const k = require('./tecido/nucleo/permissoes').CHAVES.find(c => c.chave === t.permissao);
  return !k || M.ordemNivel(k.nivel) > M.ordemNivel(t.nivel);
}).map(([r]) => r);
ok('o nível da tela do sob medida não é menor que o da permissão que a abre', !smNivel.length, smNivel.join(', '));

console.log('\n── 5. a trava do servidor e o destino leem do mapa ──');
const B = P.montar();
const difRota = M.TELAS.filter(t => {
  const d = B.AC.permDaRota(t.rota, 'GET'); const arr = Array.isArray(d) ? d : [d];
  return JSON.stringify(arr) !== JSON.stringify(t.perms);
}).map(t => t.n + ' ' + t.rota + ' → ' + JSON.stringify(B.AC.permDaRota(t.rota, 'GET')));
ok('o permDaRota de cada tela é exatamente a permissão do mapa', !difRota.length, difRota.join(' | '));
const D = require('./destino');
const esperado = [['admin','/admin']].concat(M.CHEGADA.map(x => [M.porNumero(x).area, M.porNumero(x).rota]));
ok('o destino depois do PIN sai do mapa, na ordem de chegada', JSON.stringify(D.PADRAO) === JSON.stringify(esperado), JSON.stringify(D.PADRAO));
const acs = fs.readFileSync(path.join(__dirname, 'acesso.js'), 'utf8');
ok('o acesso.js não escreve mais as telas à mão (eq(\'/operador\') sumiu)', !/eq\('\/operador'\)/.test(acs) && /require\('\.\/telas'\)/.test(acs));

console.log('\n── 6. NINGUÉM GANHA NEM PERDE — pessoa a pessoa ──');
const antes = JSON.parse(fs.readFileSync(path.join(__dirname, 'teste_mapa_antes.json'), 'utf8'));
ok('o retrato de antes tem as ' + P.PERFIS.length + ' pessoas', Object.keys(antes).length === P.PERFIS.length);
for(const p of B.pessoas){
  const agora = P.retrato(B, p), era = antes[p.nome] || {};
  ok(p.nome + ': abre as mesmas telas', JSON.stringify(agora.abre) === JSON.stringify(era.abre),
     'antes ' + JSON.stringify(era.abre) + '\n         agora ' + JSON.stringify(agora.abre));
  ok(p.nome + ': as mesmas permissões e o mesmo destino', JSON.stringify(agora.perms) === JSON.stringify(era.perms) && agora.destino === era.destino,
     'destino ' + era.destino + ' → ' + agora.destino);
}
B.fechar();

console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
process.exit(falhas ? 1 : 0);
