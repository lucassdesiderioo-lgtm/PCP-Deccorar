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
function telaPorRota(rota){
  const r = String(rota || '').replace(/\/+$/, '') || '/';
  const t = telasTodas().find(x => x.rota === r);
  if(t) return t;
  /* o apelido do sob medida (`/sobmedida/inicio` é a 601) acha a tela dele (③ REVISÃO, 22/11/2026) */
  try{
    const TSM = require('./tecido/nucleo/telas').TELAS;
    const m = /^\/sobmedida(\/.*)?$/.exec(r);
    const a = m ? TSM[m[1] || '/'] : null;
    if(a && a.apelido) return telasTodas().find(x => x.n === a.numero) || null;
  }catch(e){}
  return null;
}

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
  const f = { arquivo, n:0, titulo:'', situacao:'', atualizada_em:'', cartoes:[], parametros:[], rotulos:{}, secoes:{}, ordemSecoes:[], corpo:'', termos:[], erros:[] };
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
    else if(k === 'parametros'){
      /* `chave = Nome para quem lê` (③ REVISÃO, 22/11/2026): a chave do config
         é o que o código lê; o nome é o que a tela escreve. A chave sozinha
         chegava à tela como "rev minimo seg" — chave de banco em tela. */
      f.parametros = []; f.rotulos = {};
      (v ? v.split(',') : []).map(s => s.trim()).filter(Boolean).forEach(s => {
        const pm = /^([a-z0-9_]+)\s*(?:=\s*(.+?))?$/i.exec(s);
        const chave = pm ? pm[1] : s;
        f.parametros.push(chave);
        if(pm && pm[2]) f.rotulos[chave] = pm[2].trim();
      });
    }
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
/* O SEGREDO DA CONFIG NUNCA É PARÂMETRO DE FICHA (③ REVISÃO, 22/11/2026). A
   `config` guarda o `backup_token` — o que protege o /baixar-backup, que entrega
   o banco inteiro —, e `parametroExiste` só sabe que a palavra aparece no
   código. Duas trancas: o `validar` reprova a ficha que o lista, e o `montar`
   não o deixa viajar mesmo assim. */
const SEGREDO = /token|senha|secret|segredo|cifrad|_pin\b|^pin_|chave_/i;
function parametroPermitido(chave){ return !!chave && !SEGREDO.test(String(chave)); }

/* ── o que não entra numa ficha ────────────────────────────────────────── */
const JARGAO = [
  [/R\$/, 'R$'],
  [/\b[\w-]+\.(?:js|html)\b/, 'nome de arquivo'],
  [/\/api\//, '/api/'],
  [/\bSELECT\b/, 'SQL'],
  [/\bR-[A-Z]{2,5}-\d{2}\b/, 'código de cartão'],
  [/\b[a-z]+_[a-z0-9_]+\b/, 'nome de tabela ou coluna']
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
    (f.parametros || []).filter(c => !parametroPermitido(c)).forEach(c => probs.push(id + ': o parâmetro ' + c + ' é segredo, e não entra numa ficha'));
    (f.parametros || []).filter(c => !(f.rotulos || {})[c]).forEach(c => probs.push(id + ': o parâmetro ' + c + ' não tem nome para quem lê — escreva "' + c + ' = Nome do parâmetro" em parametros:'));
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
/* As linhas datadas de "Mudanças", na ordem do arquivo. O retrato guarda a LISTA
   inteira — e não só a mais recente —, porque "linha nova" é: toda linha de
   antes continua lá e há pelo menos uma a mais. Guardar só a última deixava
   passar o texto da última editado no lugar de uma linha nova, e recusava a
   linha legítima datada pelo dia da regra (19/11) numa ficha nascida em 21/11
   (③ REVISÃO, 22/11/2026). */
function linhasMudanca(f){
  return f.secoes.mudancas.filter(m => m.iso).map(m => m.data + ' — ' + m.texto);
}
function linhaNova(antes, depois){
  antes = antes || []; depois = depois || [];
  if(depois.length <= antes.length) return false;
  const sobra = depois.slice();
  for(const l of antes){ const i = sobra.indexOf(l); if(i < 0) return false; sobra.splice(i, 1); }
  return true;
}
function retratoDe(L){
  const cards = cartoesTexto(L.pastaRegras);
  const citados = new Set();
  const fichas = {};
  for(const f of L.fichas.values()){
    f.cartoes.forEach(c => citados.add(c));
    fichas[f.n] = { corpo: impressao(f.corpo), linhas: linhasMudanca(f), situacao: f.situacao,
      acoes: acoesDe(L, f.n).map(a => a.chave).sort() };
  }
  const cartoes = {};
  Array.from(citados).sort().forEach(c => { if(cards.has(c)) cartoes[c] = impressao(cards.get(c)); });
  return ordenado({ cartoes, fichas });
}
/* As recusas: o que mudou sem a linha que o explica (B2 a B4, B7 e B10 a B14).
   `opts.primeiro`: gravar um retrato do zero, de propósito — o primeiro
   aconteceu em 21/11/2026; sem a opção, retrato ausente é recusa, porque apagar
   o arquivo seria o jeito de passar por cima de toda a régua. */
function confrontar(antigo, novo, L, opts){
  const rec = [];
  opts = opts || {};
  if(!antigo || !antigo.fichas){
    if(!opts.primeiro) rec.push('não há retrato antigo (retrato.json): o primeiro retrato aconteceu em 21/11/2026 — para gravar um do zero, de propósito, rode com --primeiro-retrato');
    return rec;
  }
  const nomeDe = n => { const f = L && L.fichas.get(+n); return n + (f ? ' ' + f.titulo : ''); };
  /* o retrato de antes de 22/11/2026 guardava só a última linha (`mudanca`) */
  const linhasDe = af => af.linhas || (af.mudanca ? [af.mudanca] : []);
  for(const [n, nf] of Object.entries(novo.fichas || {})){
    const af = antigo.fichas[n];
    if(!af){   // ficha nova nasce com UMA linha ("ficha criada"); com história, a entrada foi apagada do retrato
      if((nf.linhas || []).length > 1) rec.push('ficha ' + nomeDe(n) + ' não está no retrato e já tem ' + nf.linhas.length + ' linhas em "Mudanças": a entrada dela foi apagada do retrato — volte-a');
      continue;
    }
    const nova = linhaNova(linhasDe(af), nf.linhas);
    const ultima = (nf.linhas || []).slice(-1)[0] || 'nenhuma';
    if((af.corpo !== nf.corpo || af.situacao !== nf.situacao) && !nova)
      rec.push('ficha ' + nomeDe(n) + ': o texto mudou e não há linha nova em "Mudanças" (a última ainda é "' + ultima + '")');
    const novasAcoes = (nf.acoes || []).filter(c => (af.acoes || []).indexOf(c) < 0);
    if(novasAcoes.length && !nova)
      rec.push('ficha ' + nomeDe(n) + ': ação nova na tela (' + novasAcoes.join(', ') + ') e nenhuma linha nova em "Mudanças"');
  }
  for(const [c, h] of Object.entries(novo.cartoes || {})){
    const ah = antigo.cartoes && antigo.cartoes[c]; if(!ah || ah === h) continue;
    for(const f of (L ? Array.from(L.fichas.values()) : [])){
      if(f.cartoes.indexOf(c) < 0) continue;
      const af = antigo.fichas[f.n], nf = novo.fichas[f.n];
      if(af && nf && !linhaNova(linhasDe(af), nf.linhas))
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
  /* As STRINGS do `liga` ('skus', 'lote', 'venda_futura (planilha do ML)') são
     nome de tabela, escritas para quem edita o mapa (R-ORG-07). Não chegam à
     ficha: só as telas numeradas (③ REVISÃO, 22/11/2026). */
  const recebe = telas.filter(t => t.n !== tela.n && (t.liga || []).some(x => x === tela.n)).map(t => ref(t.n));
  return { recebe_de: recebe, manda_para: manda };
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
    parametros: (f ? f.parametros : []).filter(parametroPermitido).map(c => ({ chave:c, rotulo:(f.rotulos || {})[c] || null, valor: ctx.valorDe ? ctx.valorDe(c) : null }))
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
  cartoesTexto, cartoesExistentes, chavesDeConfigNoCodigo, parametroExiste, parametroPermitido, jargaoNoCorpo, citaAcao, validar,
  impressao, linhasMudanca, linhaNova, retratoDe, confrontar, diferencas, lerRetrato, gravarRetrato, montar, resumo, fluxoDe, itens, mudancasRecentes, normaliza,
  modulos: () => MO.MODULOS.map(m => ({ chave:m.chave, nome:m.nome })), blocos: () => MO.BLOCOS };
