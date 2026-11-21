#!/usr/bin/env node
/* teste_manual.js — o MANUAL DO SISTEMA (spec docs/specs/MANUAL-DO-SISTEMA.md,
 * fase 1, 21/11/2026): uma ficha por tela em docs/manual/, lida pelo "?" de
 * toda tela e pela 907 Manual, e o RETRATO que faz a ficha não ficar para trás.
 *
 *   node teste_manual.js
 *
 * Três partes, as da §8.1 da spec:
 *   A  o leitor e o formato — tela sem ficha, ficha sem tela, cabeçalho pela
 *      metade, cartão ou parâmetro que não existe, ação sem texto, jargão
 *   B  o retrato — texto, cartão ou botão que mudou sem a linha datada em
 *      "Mudanças" é recusado pelo manual_retrato.js, e o teste exige que o
 *      retrato bata com os arquivos
 *   C  as rotas e o acesso — a conta do portão, D7 (só o que a pessoa opera),
 *      D8 ("ver todas" é permissão), leitura pura, nada de dinheiro
 *
 * Não abre porta nem toca no banco de verdade: o banco de exemplo é o do
 * perfis_acesso.js, numa pasta temporária.
 *
 * ⚠️ A LISTA RASCUNHOS_INICIAIS SÓ ENCOLHE (R-ORG-14 aplicada ao manual):
 * são as telas que existiam em 21/11/2026 e subiram em rascunho na fase 1.
 * Tela nova nasce `pronta`; ficha escrita sai daqui, e ficha escrita que
 * continua aqui reprova.
 */
const fs = require('fs'), os = require('os'), path = require('path');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe !== undefined ? '\n         ' + (typeof detalhe === 'string' ? detalhe : JSON.stringify(detalhe)) : '')); }
}
const eq = (desc, a, b) => ok(desc, JSON.stringify(a) === JSON.stringify(b), 'esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a));
const lista = a => a.length ? a.join(', ') : '(nenhum)';

let MAN;
try{ MAN = require('./manual'); }
catch(e){ console.log('  FALHOU — o manual.js não carrega: ' + e.message); process.exit(1); }
const M = require('./telas');
const PERMISSOES = require('./permissoes');
const TSM = require('./tecido/nucleo/telas');

/* As 53 telas das duas operações que existiam em 21/11/2026 — as que a fase 1
   sobe em rascunho. Esta lista NÃO cresce; ela encolhe conforme as fases 2 a 4
   escrevem as fichas. */
const RASCUNHOS_INICIAIS = [101,102,103,104,105,106, 201,202,204,205,206, 251,252,253, 301,302,303,
  401,402,403,404, 501,502,503,504, 901,902,904,905,906,907, 1101,1102,1103,1201,1301,1302,
  601,602,603,604,605,606,607,608,609,610,611,612,613,614,615,616];
const RASCUNHOS_DE_21_11 = RASCUNHOS_INICIAIS.slice();   // a cópia de 21/11/2026, para o A4 comparar

/* ═════════════════════════════════════════════════════════════════════════ */
console.log('\n── A. o leitor e o formato ──');

const L = MAN.lerTudo();
ok('A1 o manual.js lê docs/manual/ sem erro de leitura', L.erros.length === 0, L.erros.join(' · '));
const telas = MAN.telasTodas();
ok('   as duas operações estão no mapa que o manual lê (36 + 17 = 53 telas)', telas.length === 53, 'achou ' + telas.length);
const fichas = Array.from(L.fichas.values());
const cab = fichas.filter(f => !(f.n > 0 && f.titulo && ['pronta','rascunho'].includes(f.situacao) && /^\d{4}-\d{2}-\d{2}$/.test(f.atualizada_em || '') && Array.isArray(f.cartoes) && Array.isArray(f.parametros)));
ok('   toda ficha tem o cabeçalho inteiro (tela, titulo, situacao, atualizada_em, cartoes, parametros)', !cab.length, lista(cab.map(f => f.arquivo)));

const semFicha = telas.filter(t => !L.fichas.has(t.n)).map(t => t.n);
ok('A2 toda tela do telas.js e do tecido/nucleo/telas.js tem UMA ficha em docs/manual/ (tela nova sem ficha reprova — a régua D6)', !semFicha.length, 'sem ficha: ' + lista(semFicha));
ok('   nenhum número tem duas fichas', L.duplicadas.length === 0, lista(L.duplicadas));
ok('   o nome do arquivo começa pelo número da tela (NNN-nome.md)', fichas.every(f => new RegExp('^' + f.n + '-[a-z0-9-]+\\.md$').test(f.arquivo)), lista(fichas.filter(f => !new RegExp('^' + f.n + '-').test(f.arquivo)).map(f => f.arquivo)));

const orfas = fichas.filter(f => !telas.some(t => t.n === f.n)).map(f => f.arquivo);
ok('A3 toda ficha aponta uma tela que existe no mapa (ficha órfã de tela que saiu reprova — a regra morta por outro lado)', !orfas.length, lista(orfas));

const rascunhos = fichas.filter(f => f.situacao === 'rascunho').map(f => f.n);
const foraDaLista = rascunhos.filter(x => RASCUNHOS_INICIAIS.indexOf(x) < 0);
ok('A4 `situacao: rascunho` só nas telas da lista RASCUNHOS_INICIAIS (tela nova nasce pronta)', !foraDaLista.length, 'rascunho fora da lista: ' + lista(foraDaLista));
const arrumado = RASCUNHOS_INICIAIS.filter(x => L.fichas.has(x) && L.fichas.get(x).situacao === 'pronta');
ok('   ficha já escrita que continua na lista reprova (a lista só encolhe)', !arrumado.length, 'escrita e ainda na lista: ' + lista(arrumado));
ok('   a lista não cresceu desde 21/11/2026', RASCUNHOS_INICIAIS.every(x => RASCUNHOS_DE_21_11.indexOf(x) >= 0) && RASCUNHOS_INICIAIS.length <= RASCUNHOS_DE_21_11.length);

const prontas = fichas.filter(f => f.situacao === 'pronta');
const SECOES = ['Para que serve', 'Onde entra no fluxo', 'Botões e ações', 'O que a tela mostra', 'Por que a tela faz isso', 'Perguntas frequentes', 'Mudanças'];
const semSecao = prontas.filter(f => JSON.stringify(f.ordemSecoes) !== JSON.stringify(SECOES)).map(f => f.n + ' ' + JSON.stringify(f.ordemSecoes));
ok('A5 ficha pronta tem as sete seções, na ordem', !semSecao.length, lista(semSecao));
const fluxoAMao = prontas.filter(f => (f.secoes.fluxoExtra || '').split(/\n+/).filter(Boolean).length > 1).map(f => f.n);
ok('   "Onde entra no fluxo" traz no máximo UMA frase além do gerado', !fluxoAMao.length, lista(fluxoAMao));
const semMud = prontas.filter(f => !f.secoes.mudancas.length).map(f => f.n);
ok('A6 ficha pronta tem pelo menos uma linha datada em "Mudanças" (é assim que a tela nova chega ao "O que mudou")', !semMud.length, lista(semMud));
const todasMud = fichas.filter(f => !f.secoes.mudancas.length).map(f => f.n);
ok('   e a de rascunho também tem a sua ("ficha criada em rascunho")', !todasMud.length, lista(todasMud));

const CARTOES = MAN.cartoesExistentes();
ok('A7 os cartões de docs/regras/ foram lidos (mais de 300)', CARTOES.size > 300, 'achou ' + CARTOES.size);
ok('   o exemplo do README.md não conta como cartão', !CARTOES.has('R-EST-01') || fs.readFileSync(path.join(__dirname, 'docs/regras/estoque.md'), 'utf8').includes('### R-EST-01'));
const cartFantasma = [];
fichas.forEach(f => f.cartoes.forEach(c => { if(!CARTOES.has(c)) cartFantasma.push(f.n + ':' + c); }));
ok('   todo cartão citado numa ficha existe (regra que deixou de valer quebra a ficha que a citava)', !cartFantasma.length, lista(cartFantasma));
ok('   o código de cartão tem a forma R-XXX-NN', fichas.every(f => f.cartoes.every(c => /^R-[A-Z]{2,5}-\d{2}$/.test(c))));

const CHAVES_CODIGO = MAN.chavesDeConfigNoCodigo();
ok('A8 as chaves de config lidas pelo código foram levantadas (mais de 20)', CHAVES_CODIGO.size > 20, 'achou ' + CHAVES_CODIGO.size);
const parFantasma = [];
fichas.forEach(f => f.parametros.forEach(p => { if(!MAN.parametroExiste(p, CHAVES_CODIGO)) parFantasma.push(f.n + ':' + p); }));
ok('   todo parâmetro citado numa ficha é lido pelo código (parâmetro que saiu do sistema reprova)', !parFantasma.length, lista(parFantasma));
ok('   um parâmetro por dia da semana (corte_seg…) vale pelo prefixo que o código monta', MAN.parametroExiste('corte_seg', CHAVES_CODIGO) && MAN.parametroExiste('despacho_dom', CHAVES_CODIGO));
ok('   um nome inventado não vale', !MAN.parametroExiste('chave_que_nao_existe_xyz', CHAVES_CODIGO));

const acoesPorTela = MAN.acoesDaTela;
const semBotao = [];
prontas.forEach(f => acoesPorTela(f.n).forEach(a => { if(!MAN.citaAcao(f, a)) semBotao.push(f.n + ':' + a.chave); }));
ok('A9 toda ação (permissão com `tela: n`) tem o rótulo citado em "Botões e ações" da ficha pronta', !semBotao.length, lista(semBotao));
ok('   a conta das ações lê o permissoes.js (101 tem Revisar peças e Devolver peça à produção)', acoesPorTela(101).map(a => a.chave).sort().join(',') === 'revisao.executar,revisao.rejeitar', JSON.stringify(acoesPorTela(101)));
ok('   e no sob medida lê o TELA_DA_CHAVE (602 tem plano.calcular)', acoesPorTela(602).some(a => a.chave === 'sobmedida.plano.calcular' && a.rotulo));

const jargao = [];
fichas.forEach(f => { const j = MAN.jargaoNoCorpo(f); if(j.length) jargao.push(f.n + ': ' + j.join(' | ')); });
ok('A10 o corpo da ficha não tem R$, nome de arquivo .js/.html, /api/, SELECT nem código de cartão', !jargao.length, lista(jargao));
ok('   o detector pega cada um', ['custa R$ 10', 'veja o parse.js', 'abra o operador.html', 'chame /api/skus', 'rode SELECT * FROM x', 'o cartão R-EST-01 diz'].every(t => MAN.jargaoNoCorpo({ corpo:t }).length === 1));
ok('   e deixa passar texto de fábrica', MAN.jargaoNoCorpo({ corpo:'A peça entra na fila depois de revisada. O selo diz Coleta.' }).length === 0);

/* lê = uma linha de código (sem comentário) com readFileSync/readdirSync/existsSync E "manual" no caminho */
const leitores = fs.readdirSync(__dirname).filter(f => /\.js$/.test(f) && f !== 'manual.js' && !/^teste_/.test(f))
  .filter(f => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .some(l => /(readFileSync|readdirSync|existsSync)\s*\(/.test(l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')) && /manual/i.test(l)));
ok('A11 só o manual.js lê a pasta docs/manual/ (dono único)', !leitores.length, lista(leitores));

const G = L.glossario;
ok('A12 o glossário tem um ### Termo por entrada, sem repetição, e mais de 10 termos', G.length > 10 && new Set(G.map(g => g.termo.toLowerCase())).size === G.length, G.map(g => g.termo).join(', '));
const termosCitados = [];
fichas.forEach(f => (f.termos || []).forEach(t => { if(!G.some(g => g.termo.toLowerCase() === t.toLowerCase())) termosCitados.push(f.n + ':' + t); }));
ok('   todo termo citado em [[Termo]] numa ficha existe no glossário', !termosCitados.length, lista(termosCitados));
ok('   os termos que a bancada lê na tela estão lá: corte, despacho, Pack ID, comprometido, livre, coleta', ['corte','despacho','pack id','comprometido','livre','coleta'].every(t => G.some(g => g.termo.toLowerCase() === t)), G.map(g => g.termo).join(', '));

/* ═════════════════════════════════════════════════════════════════════════ */
console.log('\n── B. o retrato — texto, cartão ou botão que mudou sem a linha de "Mudanças" é recusado ──');

const RET = MAN.lerRetrato();
ok('B1 o retrato existe (docs/manual/retrato.json) e tem as fichas e os cartões citados', RET && RET.fichas && RET.cartoes && Object.keys(RET.fichas).length === fichas.length, RET ? Object.keys(RET.fichas || {}).length + ' fichas no retrato' : 'sem retrato');
const agora = MAN.retratoDe(L);
const recusas = MAN.confrontar(RET, agora, L);
ok('   o retrato bate com os arquivos: nada mudou sem a linha (rode node manual_retrato.js depois de mexer na ficha ou no cartão)', recusas.length === 0, recusas.join('\n         '));
ok('   e nenhuma impressão digital diverge (mudou e não regravou o retrato — ou regravou e não subiu)', JSON.stringify(agora) === JSON.stringify(RET), MAN.diferencas(RET, agora).join(' · '));

/* Para os casos B2 a B9 monta-se uma pasta de mentira com duas fichas e um
   arquivo de regras, e muda-se uma coisa de cada vez. */
function pastaFalsa(){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-manual-'));
  fs.mkdirSync(path.join(dir, 'manual')); fs.mkdirSync(path.join(dir, 'regras'));
  fs.writeFileSync(path.join(dir, 'regras', 'teste.md'), '# Regras\n\n### R-TST-01 · Uma regra\n- Regra:            revisar não mexe no estoque.\n- Por quê:          ainda falta embalar.\n\n### R-TST-02 · Outra\n- Regra:            o kit é conferido.\n');
  const ficha = (n, titulo, corpo, mud) => '---\ntela: ' + n + '\ntitulo: ' + titulo + '\nsituacao: pronta\natualizada_em: 2026-11-21\ncartoes: R-TST-01\nparametros: \n---\n\n## Para que serve\n' + corpo + '\n\n## Onde entra no fluxo\n\n## Botões e ações\n- **Revisar peças** — bipa início e fim.\n\n## O que a tela mostra\n- **O cronômetro** — o tempo da revisão.\n\n## Por que a tela faz isso\n\n## Perguntas frequentes\n\n## Mudanças\n' + mud + '\n';
  fs.writeFileSync(path.join(dir, 'manual', '101-revisao.md'), ficha(101, 'Revisão', 'Revisar a peça.', '- 20/11/2026 — ficha escrita'));
  fs.writeFileSync(path.join(dir, 'manual', '102-embalagem.md'), ficha(102, 'Embalagem', 'Embalar a peça.', '- 20/11/2026 — ficha escrita'));
  fs.writeFileSync(path.join(dir, 'manual', 'glossario.md'), '# Glossário\n\n### Corte\nO horário limite.\n');
  return dir;
}
function leFalsa(dir, acoes){
  const Lf = MAN.lerTudo({ pastaManual:path.join(dir, 'manual'), pastaRegras:path.join(dir, 'regras'), acoes: acoes || { 101:[{ chave:'revisao.executar', rotulo:'Revisar peças' }], 102:[] } });
  return Lf;
}
const d0 = pastaFalsa();
const L0 = leFalsa(d0);
const R0 = MAN.retratoDe(L0);
ok('   (a pasta de mentira lê duas fichas e dois cartões)', L0.fichas.size === 2 && Object.keys(R0.cartoes).length === 1 && R0.cartoes['R-TST-01'], JSON.stringify(R0));

/* B2: o corpo mudou, a data da última linha de Mudanças é a mesma */
let d = pastaFalsa();
fs.writeFileSync(path.join(d, 'manual', '101-revisao.md'), fs.readFileSync(path.join(d, 'manual', '101-revisao.md'), 'utf8').replace('Revisar a peça.', 'Revisar a peça com calma.'));
let rec = MAN.confrontar(R0, MAN.retratoDe(leFalsa(d)), leFalsa(d));
ok('B2 corpo mudado sem linha nova em "Mudanças" é RECUSADO, e a recusa diz a ficha', rec.length === 1 && /101/.test(rec[0]) && /Mudanças/.test(rec[0]), rec);
/* ...e com a linha nova, passa */
fs.writeFileSync(path.join(d, 'manual', '101-revisao.md'), fs.readFileSync(path.join(d, 'manual', '101-revisao.md'), 'utf8').replace('## Mudanças\n', '## Mudanças\n- 21/11/2026 — a frase ficou mais clara\n'));
rec = MAN.confrontar(R0, MAN.retratoDe(leFalsa(d)), leFalsa(d));
ok('   com a linha datada de hoje, passa', rec.length === 0, rec);

/* B3: a linha Regra: do cartão mudou e a ficha que o cita ficou quieta */
d = pastaFalsa();
fs.writeFileSync(path.join(d, 'regras', 'teste.md'), fs.readFileSync(path.join(d, 'regras', 'teste.md'), 'utf8').replace('revisar não mexe no estoque.', 'revisar SOMA no estoque.'));
rec = MAN.confrontar(R0, MAN.retratoDe(leFalsa(d)), leFalsa(d));
ok('B3 cartão mudado e a ficha que o cita sem linha nova é RECUSADO, dizendo o cartão e a ficha', rec.length === 2 && rec.every(r => /R-TST-01/.test(r)) && rec.some(r => /101/.test(r)) && rec.some(r => /102/.test(r)), rec);
ok('   cartão que NENHUMA ficha cita não é cobrado', (() => { const dd = pastaFalsa();
  fs.writeFileSync(path.join(dd, 'regras', 'teste.md'), fs.readFileSync(path.join(dd, 'regras', 'teste.md'), 'utf8').replace('o kit é conferido.', 'o kit é exigido.'));
  return MAN.confrontar(R0, MAN.retratoDe(leFalsa(dd)), leFalsa(dd)).length === 0; })());

/* B4: uma permissão nova pendurou na tela, e a ficha não ganhou linha */
d = pastaFalsa();
let Ld = leFalsa(d, { 101:[{ chave:'revisao.executar', rotulo:'Revisar peças' }, { chave:'revisao.cancelar', rotulo:'Cancelar revisão' }], 102:[] });
rec = MAN.confrontar(R0, MAN.retratoDe(Ld), Ld);
ok('B4 ação nova na tela sem linha nova em "Mudanças" é RECUSADA, dizendo a chave', rec.length === 1 && /revisao\.cancelar/.test(rec[0]) && /101/.test(rec[0]), rec);

/* B5: só a seção Mudanças mudou */
d = pastaFalsa();
fs.writeFileSync(path.join(d, 'manual', '101-revisao.md'), fs.readFileSync(path.join(d, 'manual', '101-revisao.md'), 'utf8').replace('## Mudanças\n', '## Mudanças\n- 21/11/2026 — só uma linha a mais\n'));
rec = MAN.confrontar(R0, MAN.retratoDe(leFalsa(d)), leFalsa(d));
ok('B5 acrescentar só uma linha em "Mudanças" não pede outra linha', rec.length === 0, rec);

/* B6: só o cabeçalho mudou (atualizada_em, cartoes) */
d = pastaFalsa();
fs.writeFileSync(path.join(d, 'manual', '101-revisao.md'), fs.readFileSync(path.join(d, 'manual', '101-revisao.md'), 'utf8').replace('atualizada_em: 2026-11-21', 'atualizada_em: 2026-11-22').replace('cartoes: R-TST-01', 'cartoes: R-TST-01, R-TST-02'));
rec = MAN.confrontar(R0, MAN.retratoDe(leFalsa(d)), leFalsa(d));
ok('B6 mudar só o cabeçalho não pede linha (arrumação não é mudança para quem usa)', rec.length === 0, rec);

/* B7: rascunho que vira pronta */
const dR = pastaFalsa();
fs.writeFileSync(path.join(dR, 'manual', '102-embalagem.md'), fs.readFileSync(path.join(dR, 'manual', '102-embalagem.md'), 'utf8').replace('situacao: pronta', 'situacao: rascunho'));
const RR = MAN.retratoDe(leFalsa(dR));
d = pastaFalsa();   // a 102 pronta de novo, sem linha nova
rec = MAN.confrontar(RR, MAN.retratoDe(leFalsa(d)), leFalsa(d));
ok('B7 rascunho que vira pronta conta como mudança e precisa da linha ("ficha escrita")', rec.length === 1 && /102/.test(rec[0]), rec);

/* B8 e B9: as datas */
d = pastaFalsa();
fs.writeFileSync(path.join(d, 'manual', '101-revisao.md'), fs.readFileSync(path.join(d, 'manual', '101-revisao.md'), 'utf8').replace('atualizada_em: 2026-11-21', 'atualizada_em: 2026-11-10'));
let probs = MAN.validar(leFalsa(d));
ok('B8 `atualizada_em` menor que a última linha de "Mudanças" reprova', probs.some(p => /101/.test(p) && /atualizada_em/.test(p)), probs);
d = pastaFalsa();
fs.writeFileSync(path.join(d, 'manual', '101-revisao.md'), fs.readFileSync(path.join(d, 'manual', '101-revisao.md'), 'utf8').replace('- 20/11/2026 — ficha escrita', '- 20/11/2099 — ficha escrita'));
probs = MAN.validar(leFalsa(d));
ok('B9 linha de "Mudanças" com data no futuro reprova', probs.some(p => /101/.test(p) && /futuro/.test(p)), probs);
ok('   e as fichas de verdade passam no validar (datas, seções, cabeçalho)', MAN.validar(L).length === 0, MAN.validar(L).slice(0, 8));

/* o script: recusa sem gravar; grava quando passa */
const dS = pastaFalsa();
const RS = MAN.retratoDe(leFalsa(dS));
fs.writeFileSync(path.join(dS, 'manual', 'retrato.json'), JSON.stringify(RS, null, 1));
fs.writeFileSync(path.join(dS, 'manual', '101-revisao.md'), fs.readFileSync(path.join(dS, 'manual', '101-revisao.md'), 'utf8').replace('Revisar a peça.', 'Revisar a peça devagar.'));
const RETRATO = require('./manual_retrato');
let saida = RETRATO.rodar({ pastaManual:path.join(dS, 'manual'), pastaRegras:path.join(dS, 'regras'), acoes:{ 101:[{ chave:'revisao.executar', rotulo:'Revisar peças' }], 102:[] }, calado:true });
ok('   manual_retrato.js RECUSA regravar quando falta a linha, e o arquivo fica como estava', saida.recusas.length === 1 && JSON.stringify(JSON.parse(fs.readFileSync(path.join(dS, 'manual', 'retrato.json'), 'utf8'))) === JSON.stringify(RS), saida.recusas);
fs.writeFileSync(path.join(dS, 'manual', '101-revisao.md'), fs.readFileSync(path.join(dS, 'manual', '101-revisao.md'), 'utf8').replace('## Mudanças\n', '## Mudanças\n- 21/11/2026 — devagar\n'));
saida = RETRATO.rodar({ pastaManual:path.join(dS, 'manual'), pastaRegras:path.join(dS, 'regras'), acoes:{ 101:[{ chave:'revisao.executar', rotulo:'Revisar peças' }], 102:[] }, calado:true });
ok('   e grava quando a linha veio', saida.recusas.length === 0 && saida.gravou && JSON.parse(fs.readFileSync(path.join(dS, 'manual', 'retrato.json'), 'utf8')).fichas['101'].mudanca.indexOf('21/11/2026') === 0, saida);
ok('   o retrato é gravado com as chaves em ordem (o diff do git fica legível)', (() => { const t = fs.readFileSync(path.join(dS, 'manual', 'retrato.json'), 'utf8'); return t.indexOf('"101"') < t.indexOf('"102"') && t.indexOf('"cartoes"') < t.indexOf('"fichas"'); })());
[d0, dS, dR].forEach(x => fs.rmSync(x, { recursive:true, force:true }));

/* ═════════════════════════════════════════════════════════════════════════ */
console.log('\n── C. as rotas e o acesso — a conta do portão, D7 e D8 ──');

const P = require('./perfis_acesso');
const B = P.montar();
require('./manual_route')(B.app, B.db);
const AT = require('./abre_tela');
const user = nome => Object.assign(B.db.prepare('SELECT * FROM usuarios WHERE id=?').get(B.pessoas.find(p => p.nome.indexOf(nome) === 0).id), { areas:[] });
function chamar(rota, usuario, extra){
  const h = B.rotas['GET ' + rota];
  if(!h) return { status:null, body:{ erro:'rota não registrada: ' + rota } };
  let status = 200, body = null;
  const res = { status(c){ status = c; return res; }, json(b){ body = b; return res; }, send(b){ body = b; return res; }, type(){ return res; }, set(){ return res; } };
  h(Object.assign({ usuario, params:{}, query:{} }, extra || {}), res);
  return { status, body };
}
const ROTAS = ['/api/manual/minhas', '/api/manual/todas', '/api/manual/ficha/:n', '/api/manual/mapa', '/api/manual/glossario', '/api/manual/mudancas'];
ok('   as seis rotas da §6 estão registradas, e nenhuma de escrita', ROTAS.every(r => B.rotas['GET ' + r]) && !Object.keys(B.rotas).some(k => /^(POST|PUT|PATCH|DELETE) \/api\/manual/.test(k)), Object.keys(B.rotas).filter(k => /manual/.test(k)).join(', '));

/* C1: pessoa a pessoa, o "minhas" é exatamente o que o portão abre */
let dif = [];
for(const p of B.pessoas){
  const u = user(p.nome);
  const r = chamar('/api/manual/minhas', u);
  const doManual = (r.body.fichas || []).map(f => f.n).sort((a, b) => a - b);
  const sm = AT.usuarioSm(B.AC, u);
  const doPortao = telas.filter(t => AT.abre(B.AC, u, t.rota, sm)).map(t => t.n).sort((a, b) => a - b);
  if(JSON.stringify(doManual) !== JSON.stringify(doPortao)) dif.push(p.nome + ': manual ' + JSON.stringify(doManual) + ' × portão ' + JSON.stringify(doPortao));
}
ok('C1 /api/manual/minhas devolve exatamente as telas que o portão abre, pessoa a pessoa (a conta do portão, #12)', !dif.length, dif.join('\n         '));
const edv = chamar('/api/manual/minhas', user('Edvaldo')).body;
ok('   o Edvaldo (Revisão) recebe a 101, a 105 e a 251, e nenhuma do Admin', [101,105,251].every(x => edv.fichas.some(f => f.n === x)) && !edv.fichas.some(f => /^\/admin\//.test(f.rota)), JSON.stringify(edv.fichas.map(f => f.n)));
ok('   e a resposta diz que ele NÃO vê todas (ver_todas:false)', edv.ver_todas === false);
ok('   a resposta traz os módulos na ordem do menu e os nomes dos blocos', Array.isArray(edv.modulos) && edv.modulos[0].chave === 'comercial' && edv.blocos && edv.blocos.comum === 'Comum');

/* C2 e C3: a ficha de uma tela */
const naoOpera = chamar('/api/manual/ficha/:n', user('Edvaldo'), { params:{ n:'202' } });
eq('C2 /api/manual/ficha/202 para quem não opera a 202 volta SÓ nome, módulo, nível e opera:false', naoOpera.body, { n:202, nome:'Conferência', modulo:'expedicao', bloco:'comum', nivel:'operacao', opera:false });
const opera = chamar('/api/manual/ficha/:n', user('Edvaldo'), { params:{ n:'101' } });
ok('C3 /api/manual/ficha/101 para quem opera volta a ficha com as seções, as ações e os parâmetros', opera.status === 200 && opera.body.opera === true && opera.body.secoes && Array.isArray(opera.body.acoes) && Array.isArray(opera.body.parametros), JSON.stringify(opera.body).slice(0, 300));
ok('   as ações vêm do permissoes.js, com rótulo e descrição', opera.body.acoes.some(a => a.chave === 'revisao.executar' && a.rotulo === 'Revisar peças' && a.desc));
B.db.prepare("INSERT OR REPLACE INTO config (chave,valor) VALUES ('rev_minimo_seg','15')").run();
const opera2 = chamar('/api/manual/ficha/:n', user('Edvaldo'), { params:{ n:'101' } }).body;
ok('   o parâmetro vem com o VALOR DE HOJE do config (rev_minimo_seg = 15)', opera2.parametros.some(p => p.chave === 'rev_minimo_seg' && p.valor === '15'), JSON.stringify(opera2.parametros));
B.db.prepare("UPDATE config SET valor='10' WHERE chave='rev_minimo_seg'").run();
ok('   mudou no config, mudou na ficha, sem mexer em arquivo nenhum', chamar('/api/manual/ficha/:n', user('Edvaldo'), { params:{ n:'101' } }).body.parametros.some(p => p.chave === 'rev_minimo_seg' && p.valor === '10'));
ok('   "Onde entra no fluxo" é gerado do liga: a 101 manda para a 102 e recebe da 105', opera.body.secoes.fluxo && opera.body.secoes.fluxo.manda_para.some(x => x.n === 102) && opera.body.secoes.fluxo.recebe_de.some(x => x.n === 105), JSON.stringify(opera.body.secoes.fluxo));
ok('   e cada tela ligada diz se a pessoa a opera (a 102 não, para o Edvaldo)', opera.body.secoes.fluxo.manda_para.find(x => x.n === 102).opera === false);
ok('   a ficha em rascunho vem marcada (situacao:"rascunho") — a tarja se desenha na tela', opera.body.situacao === 'rascunho' || opera.body.situacao === 'pronta');
const semN = chamar('/api/manual/ficha/:n', user('Edvaldo'), { params:{ n:'999' } });
ok('   tela que não existe é 404', semN.status === 404);
const porRota = chamar('/api/manual/ficha/:n', user('Edvaldo'), { params:{ n:'aqui' }, query:{ rota:'/operador' } });
ok('   /api/manual/ficha/aqui?rota=/operador acha a ficha pela rota (é o que o "?" pergunta)', porRota.status === 200 && porRota.body.n === 101, JSON.stringify(porRota.body).slice(0, 120));
const porRotaSm = chamar('/api/manual/ficha/:n', user('Tom'), { params:{ n:'aqui' }, query:{ rota:'/sobmedida/corte' } });
ok('   e pela rota do sob medida também (/sobmedida/corte → 602, para quem corta)', porRotaSm.status === 200 && porRotaSm.body.n === 602 && porRotaSm.body.opera === true, JSON.stringify(porRotaSm.body).slice(0, 160));

/* C4: ver todas */
const todasEdv = chamar('/api/manual/todas', user('Edvaldo'));
ok('C4 /api/manual/todas é 403 sem manual.ver_todas, mesmo para quem opera telas', todasEdv.status === 403);
const todasAna = chamar('/api/manual/todas', user('Ana'));
ok('   e 403 para a Ana (Admin), que opera quase tudo mas não tem a chave', todasAna.status === 403);
const idSergio = B.pessoas.find(p => p.nome.indexOf('Sergio') === 0).id;
B.db.prepare('INSERT INTO usuario_excecao (usuario_id,chave,concede) VALUES (?,?,1)').run(idSergio, 'manual.ver_todas');
const todasSergio = chamar('/api/manual/todas', user('Sergio'));
ok('   com a chave (Supervisor, por exceção), volta as 53 fichas', todasSergio.status === 200 && todasSergio.body.fichas.length === 53, todasSergio.status + ' ' + (todasSergio.body.fichas || []).length);
ok('   e cada ficha das 53 diz se ele a opera (opera:true/false), para a tela marcar', todasSergio.body.fichas.some(f => f.opera === true) && todasSergio.body.fichas.some(f => f.opera === false));
ok('   com a chave, a ficha de uma tela que ele NÃO opera vem inteira', chamar('/api/manual/ficha/:n', user('Sergio'), { params:{ n:'1302' } }).body.secoes !== undefined);
const idEdv = B.pessoas.find(p => p.nome.indexOf('Edvaldo') === 0).id;
B.db.prepare('INSERT INTO usuario_excecao (usuario_id,chave,concede) VALUES (?,?,1)').run(idEdv, 'manual.ver_todas');
ok('   a chave é de nível Supervisor: dada por exceção a quem é Operação, não vale (o teto do nível)', chamar('/api/manual/todas', user('Edvaldo')).status === 403);
B.db.prepare("DELETE FROM usuario_excecao WHERE chave='manual.ver_todas'").run();

/* C5: o mapa */
const mapa = chamar('/api/manual/mapa', user('Edvaldo')).body;
ok('C5 /api/manual/mapa volta as 53 telas só com número, nome, módulo, bloco e nível — nenhuma seção', mapa.telas.length === 53 && mapa.telas.every(t => t.n && t.nome && t.modulo && !t.secoes && !t.corpo), JSON.stringify(mapa.telas[0]));
ok('   com as ligações (de → para) e opera:true só nas da pessoa', Array.isArray(mapa.ligacoes) && mapa.ligacoes.some(l => l.de === 101 && l.para === 102) && mapa.telas.filter(t => t.opera).map(t => t.n).sort().join(',') === edv.fichas.map(f => f.n).sort().join(','));

/* C6: o que mudou */
const mud = chamar('/api/manual/mudancas', user('Edvaldo')).body;
ok('C6 /api/manual/mudancas volta as linhas de "Mudanças" só das telas da pessoa, com a tela, mais recentes em cima', Array.isArray(mud.mudancas) && mud.mudancas.every(x => edv.fichas.some(f => f.n === x.n) && x.data && x.texto && x.nome) && mud.mudancas.every((x, i, a) => i === 0 || a[i-1].ordem >= x.ordem), JSON.stringify(mud.mudancas).slice(0, 200));
ok('   e diz a janela (dias)', mud.dias === 30);

/* C7: a porta */
ok('C7 sem login, as seis rotas são 401', ROTAS.every(r => chamar(r, null, { params:{ n:'101' } }).status === 401));
const lucas = user('Lucas');
ok('   o Admin Geral passa por nível: vê todas, e a ficha inteira de qualquer tela', chamar('/api/manual/todas', lucas).status === 200 && chamar('/api/manual/ficha/:n', lucas, { params:{ n:'613' } }).body.secoes !== undefined);
ok('   as linhas do permDaRota: /api/manual/todas pede manual.ver_todas, o resto manual.ler, e a tela /manual pede manual.ler', B.AC.permDaRota('/api/manual/todas', 'GET') === 'manual.ver_todas' && B.AC.permDaRota('/api/manual/minhas', 'GET') === 'manual.ler' && B.AC.permDaRota('/api/manual/ficha/101', 'GET') === 'manual.ler' && B.AC.permDaRota('/manual', 'GET') === 'manual.ler', [B.AC.permDaRota('/api/manual/todas', 'GET'), B.AC.permDaRota('/api/manual/minhas', 'GET'), B.AC.permDaRota('/manual', 'GET')].join(' '));
ok('   as duas chaves existem no registro, penduradas na 907, nos níveis da spec', (() => { const a = PERMISSOES.find(p => p.chave === 'manual.ler'), b = PERMISSOES.find(p => p.chave === 'manual.ver_todas');
  return a && a.tela === 907 && a.nivel === 'operacao' && !a.sensivel && b && b.tela === 907 && b.nivel === 'supervisor' && !b.sensivel; })());
const comChave = B.db.prepare("SELECT s.nome FROM setores s JOIN setor_permissao sp ON sp.setor_id=s.id WHERE sp.chave IN ('manual.ler','manual.ver_todas')").all().map(r => r.nome).filter(x => x !== 'Admin Geral');
ok('   nascem SÓ para o Admin Geral: nenhum setor as recebe (R-ALC-06, sem backfill)', !comChave.length, lista(comChave));
ok('   a 907 está no mapa: /manual, Administração · Comum, nível Operação, abre com manual.ler', (() => { const t = M.porNumero(907); return t && t.rota === '/manual' && t.modulo === 'administracao' && t.bloco === 'comum' && t.nivel === 'operacao' && JSON.stringify(t.perms) === '["manual.ler"]'; })());

/* C8: o sob medida pela conta de lá */
const tom = chamar('/api/manual/minhas', user('Tom')).body;
/* O Tom (Sob medida / Bancada) abre a entrada, o corte, as sobras, os rolos, as
   etiquetas e a produção pelo portão de lá — e NÃO o catálogo (608) nem a
   bancada de bipe (613), que pede um setor de produção. É a conta do portão, e
   o manual tem que dizer exatamente isso. */
ok('C8 quem está só na bancada do sob medida vê as fichas 6xx que o portão de lá deixa (pelo setor, não pela chave escrita)', [601,602,603,604,605,612].every(x => tom.fichas.some(f => f.n === x)) && !tom.fichas.some(f => f.n === 608 || f.n === 613), JSON.stringify(tom.fichas.map(f => f.n)));
ok('   e a ficha da 602 vem inteira para ele; a da 613, só o resumo', chamar('/api/manual/ficha/:n', user('Tom'), { params:{ n:'602' } }).body.opera === true && chamar('/api/manual/ficha/:n', user('Tom'), { params:{ n:'613' } }).body.secoes === undefined);
ok('   quem é Operação da medida padrão não vê as 6xx que não opera', !edv.fichas.some(f => f.n >= 601 && f.n <= 699));

/* C9: leitura pura */
const fonte = fs.readFileSync(path.join(__dirname, 'manual_route.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
ok('C9 o manual_route.js não tem rota de escrita nem UPDATE/INSERT/DELETE (leitura pura; o teste_quem.js não ganha caso)', !/\bapp\.(post|put|patch|delete)\s*\(/.test(fonte) && !/\b(INSERT|UPDATE|DELETE)\b/.test(fonte));
ok('   e não lê o nome de quem fez do req.usuario (a permissão pode; a autoria não)', !/req\.usuario\.nome/.test(fonte));

/* C10: nada de dinheiro, nome de pessoa, saldo ou venda nas respostas */
const tudo = JSON.stringify([chamar('/api/manual/todas', lucas).body, mapa, mud, chamar('/api/manual/glossario', user('Edvaldo')).body]);
ok('C10 nenhuma resposta traz R$, saldo, venda nem nome de pessoa do banco de exemplo', !/R\$/.test(tudo) && !/"saldo"|"estoque":\s*\d|"venda":/.test(tudo) && !B.pessoas.some(p => tudo.indexOf(p.nome.split(' ')[0] + ' (') >= 0), tudo.slice(0, 200));
const glo = chamar('/api/manual/glossario', user('Edvaldo')).body;
ok('   o glossário volta os termos, para qualquer pessoa com manual.ler', Array.isArray(glo.termos) && glo.termos.length > 10 && glo.termos.every(t => t.termo && t.texto));
B.fechar();

console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
process.exit(falhas ? 1 : 0);
