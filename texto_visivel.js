/* O QUE DE UM ARQUIVO PODE CHEGAR A QUEM USA O SISTEMA — usado pelo
   `teste_linguagem.js` (spec NAVEGACAO-E-LINGUAGEM, fase 3).

   Em .js: os LITERAIS de texto ('...', "...", `...`). Comentario fica de fora
   (a Regra B nao vale para comentario), e expressao regular tambem — `/'/`
   num regex nao abre string nenhuma, e um leitor que nao sabe disso passa a
   achar comentario dentro de string e string dentro de comentario. Foi o que
   o leitor improvisado da fase 2 fez: acusou dez comentarios.

   Em .html: o texto fora de <script>, <style> e <!-- -->, e os literais de
   texto de dentro dos <script>.

   Devolve [{linha, texto}]. Nao tenta ser um parser de JavaScript: so precisa
   saber onde comeca e termina cada comentario, string e regex. */
'use strict';

// Depois destes caracteres, uma `/` abre expressao regular; depois de
// qualquer outra coisa (nome, numero, `)`, `]`), e divisao.
const ANTES_DE_REGEX = '(,=:[!&|?{};+-*%<>~^';
const PALAVRAS_ANTES_DE_REGEX = /(?:^|[^\w$])(return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;

function literaisJs(src, linhaBase){
  const out = [];
  let i = 0, n = src.length, ln = linhaBase || 1;
  let ultimo = '';            // ultimo trecho de codigo que nao era espaco
  const avanca = (ate) => { for(let k = i; k < ate && k < n; k++) if(src[k] === '\n') ln++; i = ate; };
  while(i < n){
    const c = src[i];
    if(c === '\n'){ ln++; i++; continue; }
    if(c === ' ' || c === '\t' || c === '\r'){ i++; continue; }
    if(c === '/' && src[i+1] === '/'){ const j = src.indexOf('\n', i); avanca(j < 0 ? n : j); continue; }
    if(c === '/' && src[i+1] === '*'){ const j = src.indexOf('*/', i + 2); avanca(j < 0 ? n : j + 2); continue; }
    if(c === '/'){
      const ant = ultimo.slice(-1);
      const ehRegex = !ultimo || ANTES_DE_REGEX.indexOf(ant) >= 0 || PALAVRAS_ANTES_DE_REGEX.test(ultimo);
      if(ehRegex){
        let j = i + 1, classe = false;
        while(j < n && src[j] !== '\n'){
          if(src[j] === '\\'){ j += 2; continue; }
          if(src[j] === '[') classe = true;
          else if(src[j] === ']') classe = false;
          else if(src[j] === '/' && !classe) break;
          j++;
        }
        j++;
        while(j < n && /[a-z]/i.test(src[j])) j++;
        avanca(j); ultimo = 'r'; continue;
      }
      i++; ultimo += '/'; continue;
    }
    if(c === "'" || c === '"' || c === '`'){
      const linha = ln; let j = i + 1, txt = '';
      while(j < n && src[j] !== c){
        if(src[j] === '\\'){ txt += src.slice(j, j + 2); j += 2; continue; }
        if(c === '`' && src[j] === '$' && src[j+1] === '{'){
          // ${ ... } dentro do template: o que esta dentro e codigo
          let prof = 1, k = j + 2;
          while(k < n && prof){ if(src[k] === '{') prof++; else if(src[k] === '}') prof--; k++; }
          for(const x of literaisJs(src.slice(j + 2, k - 1), 1)) out.push({linha: linha, texto: x.texto});
          txt += ' '; j = k; continue;
        }
        if(c !== '`' && src[j] === '\n') break;
        txt += src[j]; j++;
      }
      // SQL dentro de template carrega comentario `/* ... */`, e ele nao chega
      // a tela: o banco o descarta. Mensagem de tela nunca traz `/*`.
      out.push({linha, texto: c === '`' ? txt.replace(/\/\*[\s\S]*?\*\//g, ' ') : txt});
      avanca(j + 1); ultimo = 'x'; continue;
    }
    // codigo comum: guarda o fim para decidir se uma `/` seguinte e regex
    let j = i;
    if(/[\w$]/.test(c)){ while(j < n && /[\w$]/.test(src[j])) j++; }
    else j = i + 1;
    ultimo = (ultimo + src.slice(i, j)).slice(-20);
    i = j;
  }
  return out;
}

function textoHtml(src){
  const out = [];
  const linhaDe = (pos) => src.slice(0, pos).split('\n').length;
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while((m = re.exec(src))){
    if(/src=/.test(m[0].slice(0, m[0].indexOf('>')))) continue;
    for(const x of literaisJs(m[1], linhaDe(m.index + m[0].indexOf('>') + 1))) out.push(x);
  }
  const branco = (t) => t.replace(/[^\n]/g, ' ');
  const fora = src
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, branco)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, branco)
    .replace(/<!--[\s\S]*?-->/g, branco);
  fora.split('\n').forEach((t, k) => { if(t.trim()) out.push({linha: k + 1, texto: t}); });
  return out;
}

function textoVisivel(arquivo, src){
  return /\.html?$/i.test(arquivo) ? textoHtml(src) : literaisJs(src, 1);
}

module.exports = {textoVisivel, literaisJs, textoHtml};
