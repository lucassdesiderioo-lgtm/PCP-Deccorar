// O DESENHO da etiqueta do kit — 100 x 35 mm, Zebra ZD220 (spec
// GERADOR-ETIQUETA-KIT, R3).
//
// ⚠️ ESTE ARQUIVO E O DONO UNICO DO DESENHO, e e por isso que ele existe
// separado da tela. A previa (fase 2) le daqui, e o ZPL que vai para a
// impressora (fase 3) sai DAQUI TAMBEM — as posicoes ja estao em MILIMETROS,
// que a 203 dpi viram pontos multiplicando por 8. Uma previa com as medidas
// dela e um ZPL com as dele seriam duas etiquetas diferentes, e a diferenca so
// apareceria com o rolo impresso: exatamente o que esta spec veio consertar.
//
// O que NAO e o mesmo nos dois lados, e esta escrito para ninguem se enganar:
// quem DESENHA o QR e as barras. Na previa e o navegador (`qr.js`,
// `barras.js`); no papel e a propria impressora (`^BQ`, `^BC`). O que os dois
// compartilham e o CONTEUDO e o LUGAR — o link, o codigo, e onde cada coisa
// fica.
(function(){

const B = (typeof window !== 'undefined' && window.barras) ? window.barras
        : (typeof require !== 'undefined' ? require('./barras.js') : null);
const Q = (typeof window !== 'undefined' && window.qr) ? window.qr
        : (typeof require !== 'undefined' ? require('./qr.js') : null);

// ── as medidas, em milimetros ────────────────────────────────────────────
const ETIQUETA = { largura:100, altura:35 };
const DESENHO = {
  // O texto grande: duas linhas, a esquerda.
  texto:  { x:3, topo:4, largura:58, entrelinha:8.4, capAlvo:6.0, capMin:3.6 },
  // A seta em circulo, entre o texto e o QR: ela APONTA PARA O QR, porque e
  // isso que a frase diz ("seu manual esta AQUI").
  seta:   { cx:67.5, cy:11, raio:5 },
  // As barras, embaixo do texto, com o codigo escrito por extenso.
  barras: { x:3, topo:20, largura:58, altura:8.5, cap:2.8, folga:1.2 },
  /* O QR, a direita, com a legenda embaixo.
     ⚠️ A `folga` NAO E ESTETICA: e o silencio que o leitor precisa para achar
     o QR (o padrao pede 4 modulos livres em volta). Com o QR de 20 mm, cada
     modulo tem meio milimetro — encostar a legenda faz o celular demorar ou
     desistir, e ninguem associa isso a distancia do texto. */
  qr:     { x:76, topo:3, lado:20, cap:2.6, folga:2.4 }
};

/* Larguras das letras, em milesimos do tamanho da fonte (Helvetica Bold).
   Aproximacao de proposito: no navegador a fonte e Arial/Helvetica e na Zebra
   e a Swiss 721 — a MESMA familia, com as mesmas proporcoes. E essa tabela que
   permite decidir o tamanho da letra sem `document`, do mesmo jeito nos dois
   lados. Letra que falta na tabela vale 600. */
const LARGURA = {
  ' ':278,'!':333,'"':474,'&':722,'(':333,')':333,'*':389,'+':584,',':278,
  '-':333,'.':278,'/':278,':':333,';':333,'?':611,
  '0':556,'1':556,'2':556,'3':556,'4':556,'5':556,'6':556,'7':556,'8':556,'9':556,
  'A':722,'B':722,'C':722,'D':722,'E':667,'F':611,'G':778,'H':722,'I':278,'J':556,
  'K':722,'L':611,'M':833,'N':722,'O':778,'P':667,'Q':778,'R':722,'S':667,'T':611,
  'U':722,'V':667,'W':944,'X':667,'Y':667,'Z':611
};
// Acento nao muda a largura da letra — "ESTÁ" ocupa o mesmo que "ESTA".
function semAcento(ch){
  return ch.normalize ? ch.normalize('NFD').replace(/[̀-ͯ]/g,'') : ch;
}
// Largura de um texto, em mm, para uma altura de MAIUSCULA (cap) em mm.
// A relacao cap/tamanho da fonte na Helvetica e 0,716.
function larguraDoTexto(texto, cap){
  const fonte = cap / 0.716;
  let mil = 0;
  for(const ch of String(texto||'')){
    const base = semAcento(ch).toUpperCase() || ch;
    mil += (LARGURA[base] !== undefined ? LARGURA[base] : 600);
  }
  return mil * fonte / 1000;
}
/* O maior tamanho de letra em que as duas linhas cabem na largura do bloco.
   ⚠️ A LETRA ENCOLHE ATE O MINIMO, E DEPOIS DISSO A RESPOSTA E "NAO CABE" —
   nunca "sai pela borda". Texto cortado no papel e uma etiqueta que o cliente
   le pela metade, e ninguem na fabrica ve isso acontecer: a etiqueta sai da
   impressora ja errada, aos 200. */
function capParaLinhas(linhas){
  const l = DESENHO.texto;
  let cap = l.capAlvo;
  while(cap > l.capMin){
    if(linhas.every(t => larguraDoTexto(t, cap) <= l.largura)) return { cap, cabe:true };
    cap = Math.round((cap - 0.1) * 100) / 100;
  }
  const cabe = linhas.every(t => larguraDoTexto(t, l.capMin) <= l.largura);
  return { cap:l.capMin, cabe };
}
/* QUANTOS CARACTERES cabem numa linha, no tamanho minimo, com a largura MEDIA
   das maiusculas. E o numero do `maxlength` da tela — uma cerca grossa, para
   ninguem colar um paragrafo no campo.
   ⚠️ ELE NAO E A REGRA DE "CABE NA ETIQUETA", e nao pode virar: 16 letras
   estreitas cabem com folga e 16 'M' nao cabem. Quem responde isso e a MEDIDA
   (`capParaLinhas`), e e ela que o servidor usa para recusar. Contar caractere
   como se toda letra tivesse a mesma largura era o chute da fase 1 com outro
   numero. */
function limiteDeCaracteres(){
  const l = DESENHO.texto;
  const larguraMedia = larguraDoTexto('ABCDEFGHIJKLMNOPQRSTUVWXYZ', l.capMin) / 26;
  return Math.floor(l.largura / larguraMedia);
}
/* A legenda do QR tambem encolhe para caber embaixo dele — os 10 caracteres
   que a spec permite so cabem em letra menor que a alvo, e recusar os 10
   seria a trava discordando da regra escrita. */
function capParaLegenda(legenda){
  const q = DESENHO.qr;
  let cap = q.cap;
  while(cap > 1.6){
    if(larguraDoTexto(legenda, cap) <= q.lado) return cap;
    cap = Math.round((cap - 0.1) * 100) / 100;
  }
  return 1.6;
}

/* O que esta certo e o que nao esta, ANTES de imprimir (R7). Devolve sempre a
   lista inteira de problemas: dizer um por vez faz a pessoa corrigir, salvar,
   descobrir o seguinte e concluir que o sistema inventa impedimento novo a
   cada tentativa. */
function medir(conteudo){
  const c = conteudo || {};
  const linhas = [c.linha1 || '', c.linha2 || ''];
  const { cap, cabe } = capParaLinhas(linhas);
  const problemas = [];
  const capLeg = capParaLegenda(String(c.qr_legenda || ''));
  if(!cabe) problemas.push('o texto não cabe na etiqueta nem na letra menor — encurte a linha 1 ou a 2');
  const legenda = String(c.qr_legenda || '');
  if(larguraDoTexto(legenda, capLeg) > DESENHO.qr.lado)
    problemas.push('a legenda do QR não cabe embaixo do QR nem na letra menor');
  let versaoQr = null;
  if(c.link){
    versaoQr = Q ? Q.versaoPara(c.link) : null;
    if(!versaoQr) problemas.push('o link é comprido demais para virar QR');
  } else problemas.push('falta o link do manual');
  if(!c.codigo) problemas.push('falta o Código do kit');
  else if(larguraDoTexto(c.codigo, DESENHO.barras.cap) > DESENHO.barras.largura)
    problemas.push('o Código do kit é comprido demais para caber embaixo das barras');
  return { cap, capLegenda:capLeg, cabe, versaoQr, problemas, limite:limiteDeCaracteres() };
}

// ── o desenho em SVG (so no navegador) ───────────────────────────────────
const NS = 'http://www.w3.org/2000/svg';
function no(tipo, atributos){
  const el = document.createElementNS(NS, tipo);
  Object.keys(atributos||{}).forEach(k => el.setAttribute(k, atributos[k]));
  return el;
}
function texto(conteudo, x, y, cap, extra){
  const el = no('text', Object.assign({
    x, y, 'font-family':'Arial, Helvetica, sans-serif', 'font-weight':'700',
    'font-size':(cap/0.716), fill:'#000'
  }, extra||{}));
  el.textContent = conteudo;
  return el;
}
// Um retangulo por faixa escura — o mesmo desenho que a impressora faz com
// barra cheia, e o minimo de nos para a tela redesenhar a cada tecla.
function faixas(pai, bits, x, y, largura, altura){
  const passo = largura / bits.length;
  let i = 0;
  while(i < bits.length){
    if(bits[i] === '1'){
      let j = i; while(j < bits.length && bits[j] === '1') j++;
      pai.appendChild(no('rect', { x:x + i*passo, y, width:(j-i)*passo, height:altura, fill:'#000' }));
      i = j;
    } else i++;
  }
}

/* A etiqueta inteira, em SVG, com o viewBox em MILIMETROS — o desenho e o
   mesmo em qualquer tamanho de tela. Quem chama decide quantos pixels vale um
   milimetro (a previa usa o tamanho proporcional; nao existe "tamanho real"
   no navegador, que nao sabe o tamanho fisico do monitor). */
function svg(conteudo, opcoes){
  const o = opcoes || {}, c = conteudo || {};
  const escala = o.escala || 4;                 // px por mm
  const m = medir(c);
  const el = no('svg', {
    viewBox:'0 0 '+ETIQUETA.largura+' '+ETIQUETA.altura,
    width: ETIQUETA.largura*escala, height: ETIQUETA.altura*escala,
    'shape-rendering':'crispEdges'
  });
  el.appendChild(no('rect', { width:ETIQUETA.largura, height:ETIQUETA.altura, fill:'#fff' }));

  // 1. o texto grande, duas linhas
  const t = DESENHO.texto;
  [c.linha1 || '', c.linha2 || ''].forEach((linha, i) => {
    if(!linha) return;
    el.appendChild(texto(linha, t.x, t.topo + m.cap + i*t.entrelinha, m.cap,
      { 'shape-rendering':'geometricPrecision' }));
  });

  // 2. a seta em circulo, apontando para o QR
  const s = DESENHO.seta;
  el.appendChild(no('circle', { cx:s.cx, cy:s.cy, r:s.raio, fill:'#000' }));
  /* ⚠️ SETA COM HASTE, NAO UM TRIANGULO SOZINHO. A primeira versao era um
     triangulo cheio dentro do circulo — e isso nao se le como seta, se le como
     BOTAO DE PLAY. Numa etiqueta que manda apontar a camera para um QR, um
     simbolo de video e a pior confusao possivel. */
  const r = s.raio;
  const haste = r*0.56, meia = r*0.16, ponta = r*0.40, aba = r*0.50;
  el.appendChild(no('path', {
    d: 'M '+(s.cx-haste)+' '+(s.cy-meia)+
       ' L '+(s.cx+ponta-aba*0.1)+' '+(s.cy-meia)+
       ' L '+(s.cx+ponta-aba*0.1)+' '+(s.cy-aba)+
       ' L '+(s.cx+haste)+' '+s.cy+
       ' L '+(s.cx+ponta-aba*0.1)+' '+(s.cy+aba)+
       ' L '+(s.cx+ponta-aba*0.1)+' '+(s.cy+meia)+
       ' L '+(s.cx-haste)+' '+(s.cy+meia)+' Z',
    fill:'#fff', 'shape-rendering':'geometricPrecision'
  }));

  // 3. as barras e o codigo escrito
  const b = DESENHO.barras;
  if(c.codigo && B){
    const bits = B.modulos(c.codigo);
    faixas(el, bits, b.x, b.topo, b.largura, b.altura);
    el.appendChild(texto(c.codigo, b.x + b.largura/2, b.topo + b.altura + b.folga + b.cap,
      b.cap, { 'text-anchor':'middle', 'letter-spacing':'0.2',
               'shape-rendering':'geometricPrecision' }));
  }

  // 4. o QR e a legenda
  const q = DESENHO.qr;
  if(c.link && m.versaoQr && Q){
    const mods = Q.modulos(c.link);
    const passo = q.lado / mods.length;
    for(let i=0;i<mods.length;i++){
      let j = 0;
      while(j < mods.length){
        if(mods[i][j]){
          let k = j; while(k < mods.length && mods[i][k]) k++;
          el.appendChild(no('rect', { x:q.x + j*passo, y:q.topo + i*passo,
            width:(k-j)*passo, height:passo, fill:'#000' }));
          j = k;
        } else j++;
      }
    }
  }
  if(c.qr_legenda){
    el.appendChild(texto(c.qr_legenda, q.x + q.lado/2, q.topo + q.lado + q.folga + m.capLegenda,
      m.capLegenda, { 'text-anchor':'middle', 'shape-rendering':'geometricPrecision' }));
  }
  return el;
}

const api = { svg, medir, larguraDoTexto, capParaLinhas, capParaLegenda,
              limiteDeCaracteres, ETIQUETA, DESENHO, LARGURA };
if(typeof window !== 'undefined') window.kitEtiqueta = api;
if(typeof module !== 'undefined' && module.exports) module.exports = api;
})();
