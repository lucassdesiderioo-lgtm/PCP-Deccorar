#!/usr/bin/env node
/* teste_parametros_onde.js — TODO AJUSTE DA 906 DIZ A TELA ONDE VALE (AJUSTE de
 * 24/11/2026, decisão do dono: "deve informar de qual tela é a informação").
 *
 *   node teste_parametros_onde.js
 *
 * `parametros_onde.js` é o dono único de "este parâmetro vale em que tela": a
 * chave aponta números de tela, e o número e o nome saem dos dois mapas
 * (`telas.js` e `tecido/nucleo/telas.js`), nunca escritos à mão. A 906 lê pela
 * rota `/api/parametros/onde` e escreve "vale na NNN Nome →" em todo card e em
 * toda linha — com link só para a tela que a pessoa abre.
 *
 * Parâmetro novo sem a tela reprova aqui.
 */
const fs = require('fs'), os = require('os'), path = require('path');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
const ler = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

console.log('\n── 1. o dono único ──');
let O = null;
try{ O = require('./parametros_onde'); }catch(e){}
ok('parametros_onde.js existe', !!O);
if(!O){ console.log('\n' + falhas + ' FALHA(S) em ' + n); process.exit(1); }

const M = require('./telas');
const existe = num => !!M.porNumero(num) || M.telasSobMedida().some(t => t.n === num);
for(const [chave, nums] of Object.entries(O.ONDE)){
  ok('   ' + chave + ' aponta telas que existem no mapa', Array.isArray(nums) && nums.length > 0 && nums.every(existe), JSON.stringify(nums));
}

console.log('\n── 2. todo parâmetro da 906 tem a tela ──');
for(const c of ['emb_minimo_seg', 'rev_minimo_seg', 'conf_carregamento'])
  ok('a medida padrão: ' + c, Array.isArray(O.ONDE[c]) && O.ONDE[c].length > 0);
ok('   a embalagem vale na 102 e a revisão na 101', JSON.stringify(O.ONDE.emb_minimo_seg) === '[102]' && JSON.stringify(O.ONDE.rev_minimo_seg) === '[101]');
ok('   o segundo bipe vale na 202', JSON.stringify(O.ONDE.conf_carregamento) === '[202]');

/* os parâmetros do sob medida: os do banco novo, pelas migrações de lá */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-onde-'));
process.env.BANCO_TECIDO = path.join(tmp, 'sm_teste.db');
let chavesSm = [];
try{
  const d = require('./tecido/nucleo/db');
  require('./tecido/nucleo/schema').aplicar(d);
  chavesSm = d.prepare('SELECT chave FROM parametro').all().map(r => r.chave);
}catch(e){ console.log('  (não deu para abrir o banco do sob medida: ' + e.message + ')'); }
ok('o banco novo do sob medida tem parâmetros', chavesSm.length > 0, String(chavesSm.length));
const semTela = chavesSm.filter(c => !(O.ONDE[c] && O.ONDE[c].length));
ok('todo parâmetro do sob medida diz a tela onde vale', semTela.length === 0, semTela.join(', '));
/* ③ REVISÃO: a ligação conferida contra quem LÊ cada número (grep no código de lá). */
const MEDIDA_PADRAO = ['emb_minimo_seg', 'rev_minimo_seg', 'conf_carregamento', 'feriados', 'etiqueta_parada_dias'];   // a etiqueta parada: PRODUCAO-MAPA-E-MOTOR v7
const sobra = Object.keys(O.ONDE).filter(c => MEDIDA_PADRAO.indexOf(c) < 0 && chavesSm.indexOf(c) < 0);
ok('nenhuma chave no ONDE que não seja parâmetro (a esquecida)', chavesSm.length === 0 || sobra.length === 0, sobra.join(', '));
const igual = (c, v) => JSON.stringify(O.ONDE[c]) === JSON.stringify(v);
ok('o tempo máximo do bipe vale só nos Indicadores (a bancada não o lê)', igual('bipeAbertoMaxHoras', [615]), JSON.stringify(O.ONDE.bipeAbertoMaxHoras));
ok('o tempo máximo do corte vale só no Painel (o corte não o lê)', igual('corteTempoMaxHoras', [607]), JSON.stringify(O.ONDE.corteTempoMaxHoras));
ok('a lista de medidas da sobra vale no Corte e nas Sobras', ['sobraLarguraMin','sobraLarguraMax','sobraAlturaMin','sobraAlturaMax'].every(c => igual(c, [602, 603])));
ok('a revisão do limite de crédito vale no Financeiro e nas Revendas', igual('creditoRevisaoMeses', [616, 610]), JSON.stringify(O.ONDE.creditoRevisaoMeses));
ok('os feriados valem nos Pedidos e nas Revendas', igual('feriados', [611, 610]), JSON.stringify(O.ONDE.feriados));

console.log('\n── 3. o número e o nome saem do mapa ──');
const m = O.mapa();
ok('mapa() devolve número, nome e endereço', m.emb_minimo_seg && m.emb_minimo_seg[0].n === 102 && m.emb_minimo_seg[0].nome === M.porNumero(102).nome && m.emb_minimo_seg[0].rota === M.porNumero(102).rota, JSON.stringify(m.emb_minimo_seg));
const sm = M.telasSobMedida().find(t => t.n === 602);
ok('   a tela do sob medida vem com o endereço de lá', m.margem && m.margem[0].n === 602 && m.margem[0].rota === sm.rota, JSON.stringify(m.margem));
ok('   nenhum nome escrito à mão no dono', !/nome\s*:\s*'/.test(ler('parametros_onde.js')));

console.log('\n── 4. a rota ──');
const AT = ler('admin_telas.js');
ok('GET /api/parametros/onde registrada no admin_telas.js', /app\.get\('\/api\/parametros\/onde'/.test(AT));
const AC = ler('acesso.js');
ok('   com linha no permDaRota: quem abre a 906', /eq\('\/api\/parametros\/onde'\)\)\s*return\s*\['sobmedida\.parametro\.ler',\s*'sobmedida\.parametro\.editar',\s*'@admin'\]/.test(AC));

console.log('\n── 5. a tela ──');
const PAR = ler('public/parametros.html');
ok('a 906 lê a rota', /\/api\/parametros\/onde/.test(PAR));
ok('   o segundo bipe diz a tela', /partBipe[\s\S]{0,900}valeNa\('conf_carregamento'\)/.test(PAR));
ok('   cada linha do tempo mínimo diz a tela', /function partTempos[\s\S]{0,1200}valeNa\(chave\)/.test(PAR) && /linha\('embalagem','emb_minimo_seg'/.test(PAR) && /linha\('revisao','rev_minimo_seg'/.test(PAR) && /function partTempos/.test(PAR));
ok('   o card de Feriados diz a tela', /Feriados<\/h2>'\+valeNa\('feriados'\)\+'/.test(PAR));
ok('   cada parâmetro do sob medida diz a tela', /function linhaParam[\s\S]{0,400}valeNa\(p\.chave\)/.test(PAR));
const fn = (PAR.match(/function valeNa\(chave\)\{[\s\S]*?\n\}/) || [''])[0];
ok('   a função valeNa existe', !!fn);
if(fn){
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const valeNa = new Function('ONDE', 'ABRE', 'esc', fn + '; return valeNa;')(
    { emb_minimo_seg:[{ n:102, nome:'Embalagem', rota:'/montagem' }], rev_minimo_seg:[{ n:101, nome:'Revisão', rota:'/operador' }] },
    new Set(['/montagem']), esc);
  const a = valeNa('emb_minimo_seg'), b = valeNa('rev_minimo_seg'), c = valeNa('nao_existe');
  ok('   a tela que a pessoa abre vira link', /href="\/montagem"/.test(a) && /102 Embalagem/.test(a) && /vale na/i.test(a), a);
  ok('   a tela que ela não abre aparece sem link', !/href/.test(b) && /101 Revisão/.test(b), b);
  ok('   sem tela conhecida, nada (não inventa)', c === '', c);
}

try{ fs.rmSync(tmp, { recursive:true, force:true }); }catch(e){}
console.log('\n' + (falhas ? falhas + ' FALHA(S) em ' + n : 'TODOS OS ' + n + ' PASSARAM'));
process.exit(falhas ? 1 : 0);
