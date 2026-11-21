/* manual.js — O MANUAL DO SISTEMA: dono único de ler, validar e montar a ficha
 * de cada tela (spec docs/specs/MANUAL-DO-SISTEMA.md, fase 1, 21/11/2026).
 *
 * Uma ficha por tela em docs/manual/NNN-nome.md, em língua de fábrica, lida
 * pelo "?" de toda tela e pela 907 Manual. O que o sistema já sabe, o manual
 * LÊ na hora e nunca copia: que telas existem e a que se ligam (telas.js e
 * tecido/nucleo/telas.js), que ações cada tela tem (permissoes.js e o
 * TELA_DA_CHAVE do sob medida), o valor de hoje de cada parâmetro (config).
 * O que uma pessoa escreve — para que serve, o que cada botão faz — é texto, e
 * o RETRATO (docs/manual/retrato.json) impede que ele fique para trás: texto,
 * cartão de regra ou ação que mudou sem a linha datada em "Mudanças" é
 * recusado pelo manual_retrato.js, e o teste_manual.js exige que o retrato bata
 * com os arquivos.
 *
 * ⚠️ ESTE É O ÚNICO ARQUIVO QUE LÊ docs/manual/ (A11 do teste_manual.js). A
 * rota (manual_route.js), o script do retrato e o teste leem por aqui: um
 * segundo leitor seria conferir com uma régua diferente da que serve a tela.
 *
 * ⚠️ A FICHA É LIDA NO BOOT pela rota (§12 do CLAUDE.md, "a tela servida é a
 * lida no boot"): editou a ficha, reinicia o servidor. O deploy já faz isso.
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const M = require('./telas');
const MO = require('./modulos');
const PERMISSOES = require('./permissoes');

const PASTA_MANUAL = path.join(__dirname, 'docs', 'manual');
const PASTA_REGRAS = path.join(__dirname, 'docs', 'regras');
const RETRATO = 'retrato.json';
const GLOSSARIO = 'glossario.md';

/* As sete seções da ficha, na ordem (§3.2 da spec). */
const SECOES = ['Para que serve', 'Onde entra no fluxo', 'Botões e ações', 'O que a tela mostra', 'Por que a tela faz isso', 'Perguntas frequentes', 'Mudanças'];
const CHAVE_SECAO = { 'Para que serve':'paraQueServe', 'Onde entra no fluxo':'fluxoExtra', 'Botões e ações':'botoes', 'O que a tela mostra':'mostra',
  'Por que a tela faz isso':'porque', 'Perguntas frequentes':'perguntas', 'Mudanças':'mudancasTexto' };

/* ── as telas das duas operações ───────────────────────────────────────── */
function telasTodas(){
  const out = M.TELAS.map(t => ({ n:t.n, nome:t.nome, rota:t.rota, modulo:t.modulo, bloco:t.bloco, nivel:t.nivel,
    liga:(t.liga || []).slice(), perms:(t.perms || []).slice(), onde:t.onde, sobmedida:false }));
  let TSM = {};
  try{ TSM = require('./tecido/nucleo/telas').TELAS; }catch(e){}
  for(const [rota, t] of Object.entries(TSM)){
    if(t.apelido) continue;
    out.push({ n:t.numero, nome:t.nome, rota:'/sobmedida' + (rota === '/' ? '' : rota), modulo:t.modulo, bloco:t.bloco, nivel:t.nivel,
      liga:(t.liga || []).slice(), perms:['sobmedida.' + t.permissao], onde:t.contexto === 'operacao' ? 'tablet' : 'computador', sobmedida:true });
  }
  return out.sort((a, b) => a.n - b.n);
}
function telaPorNumero(n){ return telasTodas().find(t => t.n === +n) || null; }
function telaPorRota(rota){ const r = String(rota || '').replace(/\/+$/, '') || '/'; return telasTodas().find(t => t.rota === r) || null; }

/* ── as ações (permissões) penduradas em cada tela ─────────────────────── */
function acoesDaTela(n){
  n = +n;
  const out = PERMISSOES.filter(p => p.tela === n).map(p => ({ chave:p.chave, rotulo:p.rotulo || p.chave, desc:p.desc || '', sensivel:!!p.sensivel }));
  try{
    const T = require('./tecido/nucleo/telas');
    const CH = require('./tecido/nucleo/permissoes').CHAVES;
    for(const [k, tela] of Object.entries(T.TELA_DA_CHAVE || {})){
      if(tela !== n) continue;
      const c = CH.find(x => x.chave === k);
      out.push({ chave:'sobmedida.' + k, rotulo:(c && c.nome) || k, desc:'', sensivel:false });
    }
  }catch(e){}
  return out;
}

/* ── o cabeçalho e as seções de uma ficha ──────────────────────────────── */
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normaliza = s => semAcento(s).toLowerCase().replace(/\s+/g, ' ').trim();
function impressao(txt){ return crypto.createHash('sha1').update(String(txt || ''), 'utf8').digest('hex').slice(0, 16); }

/* Uma linha de "Mudanças": "- 21/11/2026 — o que mudou". Aceita —, – ou -. */
const RE_MUDANCA = /^-\s*(\d{2})\/(\d{2})\/(\d{4})\s*[—–-]\s*(.+?)\s*$/;
function dataIso(d, m, a){ return a + '-' + m + '-' + d; }

function parseFicha(arquivo, src){
  const f = { arquivo, n:0, titulo:'', situacao:'', atualizada_em:'', cartoes:[], parametros:[], secoes:{}, ordemSecoes:[], corpo:'', termos:[], erros:[] };
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(src);
  if(!m){ f.erros.push(arquivo + ': sem cabeçalho (--- … ---)'); return f; }
  for(const linha of m[1].split(/\r?\n/)){
    const kv = /^([a-z_]+):\s*(.*)$/.exec(linha.trim()); if(!kv) continue;
    const k = kv[1], v = kv[2].trim();
    if(k === 'tela') f.n = +v;
    else if(k === 'titulo') f.titulo = v;
    else if(k === 'situacao') f.situacao = v;
    else if(k === 'atualizada_em') f.atualizada_em = v;
    else if(k === 'cartoes') f.cartoes = v ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
    else if(k === 'parametros') f.parametros = v ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
  }
  const corpoTodo = m[2] || '';
  // as seções: "## Nome" até o próximo "## "
  const partes = corpoTodo.split(/^## /m);
  const semSecao = partes.shift();   // o que vem antes da primeira seção
  for(const p of partes){
    const nl = p.indexOf('\n');
    const nome = (nl < 0 ? p : p.slice(0, nl)).trim();
    const texto = (nl < 0 ? '' : p.slice(nl + 1)).trim();
    f.ordemSecoes.push(nome);
    const chave = CHAVE_SECAO[nome] || ('outra:' + nome);
    f.secoes[chave] = texto;
  }
  f.secoes.mudancas = (f.secoes.mudancasTexto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const mm = RE_MUDANCA.exec(l);
    return mm ? { data: mm[1] + '/' + mm[2] + '/' + mm[3], iso: dataIso(mm[1], mm[2], mm[3]), texto: mm[4] } : { data:null, iso:null, texto:l, invalida:true };
  });
  // o CORPO que o retrato fotografa: tudo menos a seção "Mudanças" e o cabeçalho
  const semMudancas = SECOES.filter(s => s !== 'Mudanças').map(s => f.secoes[CHAVE_SECAO[s]] || '').join('\n');
  f.corpo = (semSecao.trim() ? semSecao.trim() + '\n' : '') + semMudancas.split(/\r?\n/).map(l => l.trim().replace(/\s+/g, ' ')).join('\n').trim();
  const termos = []; const re = /\[\[([^\]]+)\]\]/g; let t;
  while((t = re.exec(corpoTodo))) termos.push(t[1].trim());
  f.termos = Array.from(new Set(termos));
  return f;
}

function parseGlossario(src){
  const out = [];
  const partes = String(src || '').split(/^### /m); partes.shift();
  for(const p of partes){
    const nl = p.indexOf('\n');
    const termo = (nl < 0 ? p : p.slice(0, nl)).trim();
    const texto = (nl < 0 ? '' : p.slice(nl + 1)).trim().replace(/\s*\n\s*/g, ' ');
    if(termo) out.push({ termo, texto });
  }
  return out;
}

/* ── ler a pasta inteira ───────────────────────────────────────────────── */
/* opts: pastaManual, pastaRegras (os dois só para o teste), acoes (mapa n →
   [{chave,rotulo}] no lugar do permissoes.js, só para o teste). */
function lerTudo(opts){
  opts = opts || {};
  const pasta = opts.pastaManual || PASTA_MANUAL;
  const L = { fichas:new Map(), glossario:[], erros:[], duplicadas:[], pastaManual:pasta, pastaRegras:opts.pastaRegras || PASTA_REGRAS,
    acoes: opts.acoes || null };
  let arquivos = [];
  try{ arquivos = fs.readdirSync(pasta).filter(f => /\.md$/i.test(f)).sort(); }
  catch(e){ L.erros.push('não deu para ler ' + pasta + ': ' + e.message); return L; }
  for(const a of arquivos){
    let src = '';
    try{ src = fs.readFileSync(path.join(pasta, a), 'utf8'); }catch(e){ L.erros.push(a + ': ' + e.message); continue; }
    if(a === GLOSSARIO){ L.glossario = parseGlossario(src); continue; }
    const f = parseFicha(a, src);
    f.erros.forEach(e => L.erros.push(e));
    if(!f.n){ L.erros.push(a + ': sem `tela:` no cabeçalho'); continue; }
    if(L.fichas.has(f.n)){ L.duplicadas.push(f.n + ' (' + L.fichas.get(f.n).arquivo + ' e ' + a + ')'); continue; }
    L.fichas.set(f.n, f);
  }
  return L;
}
function acoesDe(L, n){ return L && L.acoes ? (L.acoes[n] || []) : acoesDaTela(n); }

/* ── os cartões de docs/regras/ ────────────────────────────────────────── */
const RE_CARTAO = /^### (R-[A-Z]{2,5}-\d{2})\b/;
function cartoesTexto(pastaRegras){
  const pasta = pastaRegras || PASTA_REGRAS;
  const out = new Map();
  let arquivos = [];
  try{ arquivos = fs.readdirSync(pasta).filter(f => /\.md$/i.test(f) && f.toLowerCase() !== 'readme.md').sort(); }catch(e){ return out; }
  for(const a of arquivos){
    const linhas = fs.readFileSync(path.join(pasta, a), 'utf8').split(/\r?\n/);
    let atual = null, texto = [];
    const fecha = () => { if(atual) out.set(atual, texto.map(l => l.trim().replace(/\s+/g, ' ')).filter(Boolean).join('\n')); atual = null; texto = []; };
    for(const l of linhas){
      const m = RE_CARTAO.exec(l);
      if(m){ fecha(); atual = m[1]; texto = [l]; continue; }
      if(atual && (/^##? /.test(l) || /^---\s*$/.test(l))){ fecha(); continue; }
      if(atual) texto.push(l);
    }
    fecha();
  }
  return out;
}
function cartoesExistentes(pastaRegras){ return new Set(cartoesTexto(pastaRegras).keys()); }

/* ── as chaves de config que o código lê ───────────────────────────────── */
/* Toda string literal com cara de chave (`'rev_minimo_seg'`, `'cnpj'`) nos .js
   da raiz, fora os testes e este arquivo. É varredura por texto, como o
   teste_caminhos.js: um nome inventado não aparece em lugar nenhum. */
function chavesDeConfigNoCodigo(){
  const set = new Set();
  let arquivos = [];
  try{ arquivos = fs.readdirSync(__dirname).filter(f => /\.js$/.test(f) && !/^teste_/.test(f) && f !== 'manual.js'); }catch(e){}
  for(const a of arquivos){
    let src = ''; try{ src = fs.readFileSync(path.join(__dirname, a), 'utf8'); }catch(e){ continue; }
    const re = /['"]([a-z][a-z0-9_]{2,})['"]/g; let m;
    while((m = re.exec(src))) set.add(m[1]);
  }
  return set;
}
/* `corte_seg`, `despacho_dom`: o código monta `'corte_' + dia`, então vale o prefixo. */
function parametroExiste(chave, set){
  if(!chave) return false;
  if(set.has(chave)) return true;
  const m = /^(.+_)([a-z]{3})$/.exec(chave);
  return !!(m && set.has(m[1]));
}

/* ── o que não entra numa ficha ────────────────────────────────────────── */
const JARGAO = [
  [/R\$/, 'R$'],
  [/\b[\w-]+\.(?:js|html)\b/, 'nome de arquivo'],
  [/\/api\//, '/api/'],
  [/\bSELECT\b/, 'SQL'],
  [/\bR-[A-Z]{2,5}-\d{2}\b/, 'código de cartão']
];
function jargaoNoCorpo(f){
  const txt = String((f && f.corpo) || '');
  return JARGAO.filter(([re]) => re.test(txt)).map(([, nome]) => nome);
}
function citaAcao(f, acao){
  const txt = normaliza((f.secoes && f.secoes.botoes) || '');
  return txt.indexOf(normaliza(acao.rotulo)) >= 0;
}

/* ── validar: o que o teste e o boot acusam ────────────────────────────── */
function hojeIso(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function validar(L){
  const probs = [];
  for(const f of L.fichas.values()){
    const id = f.n + ' (' + f.arquivo + ')';
    if(!f.titulo) probs.push(id + ': sem titulo');
    if(!['pronta', 'rascunho'].includes(f.situacao)) probs.push(id + ': situacao tem que ser pronta ou rascunho');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(f.atualizada_em || '')) probs.push(id + ': atualizada_em fora do formato aaaa-mm-dd');
    if(!f.secoes.mudancas.length) probs.push(id + ': sem linha em "Mudanças"');
    const invalidas = f.secoes.mudancas.filter(m => m.invalida);
    if(invalidas.length) probs.push(id + ': linha de "Mudanças" fora do formato "- dd/mm/aaaa — texto": ' + invalidas[0].texto);
    const ultima = f.secoes.mudancas.filter(m => m.iso).map(m => m.iso).sort().pop();
    if(ultima && f.atualizada_em && f.atualizada_em < ultima) probs.push(id + ': atualizada_em (' + f.atualizada_em + ') é menor que a última linha de "Mudanças" (' + ultima + ')');
    const hoje = hojeIso();
    f.secoes.mudancas.filter(m => m.iso && m.iso > hoje).forEach(m => probs.push(id + ': linha de "Mudanças" com data no futuro: ' + m.data));
    if(f.situacao === 'pronta'){
      if(JSON.stringify(f.ordemSecoes) !== JSON.stringify(SECOES)) probs.push(id + ': ficha pronta sem as sete seções na ordem (' + f.ordemSecoes.join(' · ') + ')');
      if((f.secoes.fluxoExtra || '').split(/\n+/).filter(Boolean).length > 1) probs.push(id + ': "Onde entra no fluxo" é gerado; cabe no máximo uma frase a mais');
    }
  }
  return probs;
}

/* ── o retrato ─────────────────────────────────────────────────────────── */
function ordenado(o){
  if(Array.isArray(o)) return o.map(ordenado);
  if(o && typeof o === 'object'){ const r = {}; Object.keys(o).sort().forEach(k => { r[k] = ordenado(o[k]); }); return r; }
  return o;
}
function assinaturaMudanca(f){
  const ms = f.secoes.mudancas.filter(m => m.iso);
  if(!ms.length) return '';
  const u = ms.slice().sort((a, b) => a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0).pop();
  return u.data + ' — ' + u.texto;
}
function retratoDe(L){
  const cards = cartoesTexto(L.pastaRegras);
  const citados = new Set();
  const fichas = {};
  for(const f of L.fichas.values()){
    f.cartoes.forEach(c => citados.add(c));
    fichas[f.n] = { corpo: impressao(f.corpo), mudanca: assinaturaMudanca(f), situacao: f.situacao,
      acoes: acoesDe(L, f.n).map(a => a.chave).sort() };
  }
  const cartoes = {};
  Array.from(citados).sort().forEach(c => { if(cards.has(c)) cartoes[c] = impressao(cards.get(c)); });
  return ordenado({ cartoes, fichas });
}
/* As recusas: o que mudou sem a linha que o explica (B2 a B4, B7 da spec). */
function confrontar(antigo, novo, L){
  const rec = [];
  if(!antigo || !antigo.fichas) return rec;
  const nomeDe = n => { const f = L && L.fichas.get(+n); return n + (f ? ' ' + f.titulo : ''); };
  for(const [n, nf] of Object.entries(novo.fichas || {})){
    const af = antigo.fichas[n]; if(!af) continue;   // ficha nova: o A6 cobra a primeira linha
    const mesmaLinha = af.mudanca === nf.mudanca;
    if((af.corpo !== nf.corpo || af.situacao !== nf.situacao) && mesmaLinha)
      rec.push('ficha ' + nomeDe(n) + ': o texto mudou e não há linha nova em "Mudanças" (a última ainda é "' + (nf.mudanca || 'nenhuma') + '")');
    const novasAcoes = (nf.acoes || []).filter(c => (af.acoes || []).indexOf(c) < 0);
    if(novasAcoes.length && mesmaLinha)
      rec.push('ficha ' + nomeDe(n) + ': ação nova na tela (' + novasAcoes.join(', ') + ') e nenhuma linha nova em "Mudanças"');
  }
  for(const [c, h] of Object.entries(novo.cartoes || {})){
    const ah = antigo.cartoes && antigo.cartoes[c]; if(!ah || ah === h) continue;
    for(const f of (L ? Array.from(L.fichas.values()) : [])){
      if(f.cartoes.indexOf(c) < 0) continue;
      const af = antigo.fichas[f.n], nf = novo.fichas[f.n];
      if(af && nf && af.mudanca === nf.mudanca)
        rec.push('cartão ' + c + ' mudou e a ficha ' + nomeDe(f.n) + ' que o cita não ganhou linha em "Mudanças"');
    }
  }
  return rec;
}
function diferencas(a, b){
  const out = [];
  const A = (a || {}).fichas || {}, Bf = (b || {}).fichas || {};
  for(const k of new Set([...Object.keys(A), ...Object.keys(Bf)])) if(JSON.stringify(A[k]) !== JSON.stringify(Bf[k])) out.push('ficha ' + k);
  const Ac = (a || {}).cartoes || {}, Bc = (b || {}).cartoes || {};
  for(const k of new Set([...Object.keys(Ac), ...Object.keys(Bc)])) if(Ac[k] !== Bc[k]) out.push('cartão ' + k);
  return out;
}
function lerRetrato(pastaManual){
  try{ return JSON.parse(fs.readFileSync(path.join(pastaManual || PASTA_MANUAL, RETRATO), 'utf8')); }catch(e){ return null; }
}
function gravarRetrato(retrato, pastaManual){
  fs.writeFileSync(path.join(pastaManual || PASTA_MANUAL, RETRATO), JSON.stringify(ordenado(retrato), null, 1) + '\n');
}

/* ── montar a ficha para a tela ────────────────────────────────────────── */
/* Uma seção vira itens: "- **Nome** — texto" → {nome, texto}; linha solta →
   {texto}. É o que a 907 e o "?" desenham. */
function itens(txt){
  return String(txt || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const m = /^-\s*\*\*(.+?)\*\*\s*[—–-]?\s*(.*)$/.exec(l);
    if(m) return { nome: m[1].trim(), texto: m[2].trim() };
    return { texto: l.replace(/^-\s*/, '') };
  });
}
function fluxoDe(tela, telas, opera){
  const porN = {}; telas.forEach(t => { porN[t.n] = t; });
  const ref = n => ({ n, nome:(porN[n] || {}).nome || String(n), opera: !!opera(porN[n]) });
  const manda = (tela.liga || []).filter(x => typeof x === 'number' && porN[x]).map(ref);
  const outros = (tela.liga || []).filter(x => typeof x !== 'number').map(String);
  const recebe = telas.filter(t => t.n !== tela.n && (t.liga || []).some(x => x === tela.n)).map(t => ref(t.n));
  return { recebe_de: recebe, manda_para: manda, outros };
}
/* ctx: { L, telas, opera(tela) → bool, valorDe(chave) → string|null } */
function montar(n, ctx){
  const tela = (ctx.telas || telasTodas()).find(t => t.n === +n);
  if(!tela) return null;
  const f = ctx.L.fichas.get(tela.n);
  const base = { n:tela.n, nome:tela.nome, rota:tela.rota, modulo:tela.modulo, bloco:tela.bloco, nivel:tela.nivel, sobmedida:!!tela.sobmedida };
  const fluxo = fluxoDe(tela, ctx.telas || telasTodas(), ctx.opera || (() => false));
  const acoes = acoesDe(ctx.L, tela.n);
  const out = Object.assign(base, { opera:true, situacao: f ? f.situacao : 'sem_ficha', titulo: f ? f.titulo : tela.nome, atualizada_em: f ? f.atualizada_em : null,
    cartoes: f ? f.cartoes : [], termos: f ? f.termos : [],
    secoes: {
      para_que_serve: itens(f && f.secoes.paraQueServe),
      fluxo: Object.assign(fluxo, { extra: f ? (f.secoes.fluxoExtra || '') : '' }),
      botoes: itens(f && f.secoes.botoes),
      mostra: itens(f && f.secoes.mostra),
      porque: itens(f && f.secoes.porque),
      perguntas: itens(f && f.secoes.perguntas),
      mudancas: f ? f.secoes.mudancas.filter(m => m.iso).map(m => ({ data:m.data, iso:m.iso, texto:m.texto })).sort((a, b) => a.iso < b.iso ? 1 : -1) : []
    },
    acoes,
    parametros: (f ? f.parametros : []).map(c => ({ chave:c, valor: ctx.valorDe ? ctx.valorDe(c) : null }))
  });
  return out;
}
/* Só o que se mostra de uma tela que a pessoa NÃO opera (D7). */
function resumo(tela){ return { n:tela.n, nome:tela.nome, modulo:tela.modulo, bloco:tela.bloco, nivel:tela.nivel, opera:false }; }

/* As linhas de "Mudanças" das telas pedidas, dos últimos `dias`, mais recentes em cima. */
function mudancasRecentes(L, telas, dias){
  const corte = new Date(); corte.setDate(corte.getDate() - (dias || 30));
  const iso = corte.getFullYear() + '-' + String(corte.getMonth() + 1).padStart(2, '0') + '-' + String(corte.getDate()).padStart(2, '0');
  const out = [];
  for(const t of telas){
    const f = L.fichas.get(t.n); if(!f) continue;
    f.secoes.mudancas.filter(m => m.iso && m.iso >= iso).forEach(m => out.push({ n:t.n, nome:t.nome, rota:t.rota, data:m.data, iso:m.iso, texto:m.texto, ordem:m.iso }));
  }
  return out.sort((a, b) => a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : a.n - b.n);
}

module.exports = { PASTA_MANUAL, PASTA_REGRAS, SECOES, telasTodas, telaPorNumero, telaPorRota, acoesDaTela, acoesDe, lerTudo, parseFicha, parseGlossario,
  cartoesTexto, cartoesExistentes, chavesDeConfigNoCodigo, parametroExiste, jargaoNoCorpo, citaAcao, validar,
  impressao, retratoDe, confrontar, diferencas, lerRetrato, gravarRetrato, montar, resumo, fluxoDe, itens, mudancasRecentes, normaliza,
  modulos: () => MO.MODULOS.map(m => ({ chave:m.chave, nome:m.nome })), blocos: () => MO.BLOCOS };
