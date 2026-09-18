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
  /* O texto grande: duas linhas, a esquerda.
     ⚠️ A `largura` CAIU DE 58 PARA 53 EM 18/09/2026, e nao foi estetica: foram
     os 5 mm que o QR precisava para sair de 15,4 mm (modulo de 3 pontos, no
     limite do que a ZD220 imprime) para 25,6 mm. O custo esta escrito e e
     real: a letra das duas linhas caiu de 4,3 para 3,9 mm e o
     `limiteDeCaracteres()` de 16 para 15. */
  texto:  { x:3, topo:4, largura:53, entrelinha:8.4, capAlvo:6.0, capMin:3.6 },
  // A seta em circulo, entre o texto e o QR: ela APONTA PARA O QR, porque e
  // isso que a frase diz ("seu manual esta AQUI"). Andou 5,5 mm para a
  // esquerda junto com o bloco de texto; o desenho e o raio nao mudaram.
  seta:   { cx:62, cy:11, raio:5 },
  /* As barras, embaixo do texto, com o codigo escrito por extenso.
     ⚠️ NADA AQUI MUDOU, de proposito. Elas estao em y 20..28,5 e o QR comeca
     em x 70,5 — nao se encostam, entao o QR podia crescer sem que a largura
     das barras encolhesse. Estreitar este bloco afinaria a barra, e a
     Embalagem bipa este codigo dezenas de vezes por dia. */
  barras: { x:3, topo:20, largura:58, altura:8.5, cap:2.8, folga:1.2, espaco:0.2 },
  /* O QR, a direita, com a legenda embaixo.
     ⚠️ A `folga` NAO E ESTETICA: e o silencio que o leitor precisa para achar
     o QR (o padrao pede 4 modulos livres em volta) — e por isso ela e um
     MINIMO, nao o valor final: quem manda e `4 x o modulo`, que cresce quando
     o link encurta. Encostar a legenda faz o celular demorar ou desistir, e
     ninguem associa isso a distancia do texto.

     ⚠️ O `envelope` E O QR MAIS OS DOIS SILENCIOS, de ponta a ponta: sao
     (modulos + 8) modulos. E ele, nao a `lado`, que limita o tamanho do
     modulo — porque a folga FAZ PARTE do espaco, e um QR que cresce comendo
     o proprio silencio le PIOR, nao melhor. Os 31 mm sao o menor dos dois
     espacos que sobram: na horizontal, da borda da seta (67) ate a borda da
     etiqueta; na vertical, do topo ate a linha de base da legenda. */
  qr:     { x:70.5, topo:2.5, lado:26, cap:2.6, folga:2.4, envelope:31 }
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

/* ⚠️ O QR DA TELA TEM QUE CAIR NA GRADE DE PIXELS, e isto nao e capricho: foi
   o que impediu o celular de ler a previa da fase 2.
   Com o QR de 20 mm e 37 modulos numa tela de 4,6 px/mm, cada modulo pedia
   2,49 px. O navegador arredonda cada borda para o pixel mais proximo, e a
   grade sai com modulos de 2 e de 3 px ALTERNANDO — inclusive na linha de
   timing, que e justamente a regua que o leitor usa para medir o modulo e
   montar a grade. Ele procura passo constante e acha passo que respira.
   Por isso a previa arredonda o modulo para o pixel cheio e reposiciona o QR
   em pixel inteiro. O deslocamento e menor que meio milimetro e NAO vai para o
   papel: la quem desenha o QR e a impressora, com modulo inteiro em pontos. */
function gradeDoQr(escala, mods){
  const q = DESENHO.qr;
  /* Arredonda para BAIXO, nunca para cima: arredondando para cima o QR fica
     MAIOR que o espaco reservado e come a folga do silencio — que e o que faz
     o leitor achar o codigo. Um QR ligeiramente menor e fiel; um QR que invade
     a legenda troca um problema de leitura por outro.

     ⚠️ E SAO DOIS TETOS, NAO UM. O primeiro e a caixa (`lado`). O segundo e o
     ENVELOPE: o QR mais os 4 modulos de silencio de cada lado, que na conta
     sao (mods + 8) modulos. Sem o segundo, um link curto — poucos modulos,
     modulo grande — faria o silencio crescer para fora da etiqueta, e o QR
     sairia grande e ilegivel, com a legenda encostada e a borda cortada. O
     leitor nao acha codigo sem silencio, e o defeito tem a cara do de sempre:
     o desenho continua com cara de QR. */
  const passoPx = Math.max(1, Math.min(
    Math.floor((q.lado * escala) / mods),
    Math.floor((q.envelope * escala) / (mods + 8))
  ));
  const lado = (passoPx * mods) / escala;
  // a origem tambem tem que cair em pixel cheio, senao a primeira coluna de
  // modulos nasce meio pixel deslocada e o arredondamento volta
  const x = Math.round((q.x + (q.lado - lado) / 2) * escala) / escala;
  const topo = Math.round((q.topo + (q.lado - lado) / 2) * escala) / escala;
  return { x, topo, lado, passo: passoPx / escala, passoPx };
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
  /* O TAMANHO QUE O QR VAI TER NO PAPEL, e nao o da caixa reservada. Eram
     coisas diferentes e ninguem via: a caixa dizia 20 mm e a ZD220 imprimia
     15,4, porque o modulo arredonda para ponto cheio. O numero que interessa a
     quem confere a etiqueta e este, entao ele sai daqui para a tela. A grade
     e a de 8 pontos por milimetro da impressora — na tela o QR tem o tamanho
     que o monitor der. */
  let qrPapel = null;
  if(versaoQr){
    const g = gradeDoQr(8, 17 + 4*versaoQr);
    qrPapel = { lado:g.lado, modulo:g.passo, pontos:g.passoPx };
  }
  return { cap, capLegenda:capLeg, cabe, versaoQr, qrPapel, problemas,
           limite:limiteDeCaracteres() };
}

/* ═══ A ETIQUETA COMO LISTA ════════════════════════════════════════════════

   ⚠️ ESTA E A PECA QUE FAZ A PREVIA E O PAPEL SEREM A MESMA ETIQUETA.

   Ate a fase 2 o desenho morava DENTRO da funcao que faz SVG, e isso bastava
   porque so a tela desenhava. Na fase 3 o PDF passou a desenhar tambem — e se
   ele repetisse as posicoes, a etiqueta da tela e a do rolo divergiriam no dia
   em que alguem ajustasse uma das duas. A divergencia so apareceria com o rolo
   impresso, que e exatamente o que esta spec veio consertar.

   Entao ha UM desenho e DOIS desenhistas: `elementos()` diz o que existe e
   onde, em milimetros, e cada lado sabe so como traçar retangulo, texto,
   circulo e poligono.

   As convencoes, que os dois lados obedecem:
     · tudo em MILIMETROS, com a origem no canto SUPERIOR esquerdo
     · `base` do texto e a LINHA DE BASE, medida de cima para baixo
     · texto ja vem com o `x` do comeco — nao ha "centralizar", porque
       centralizar de dois jeitos diferentes da dois lugares diferentes
     · `cor` so existe em dois valores: 'preto' e 'branco' (a seta)

   ⚠️ A `escala` NAO E COSMETICA, e vale para os dois. Ela e quantos pontos da
   grade valem um milimetro: na tela sao pixels, no papel sao os 8 pontos por
   milimetro da ZD220 a 203 dpi. E ela que faz o modulo do QR cair em ponto
   inteiro dos dois lados — a grade que respira nao le no celular nem no
   leitor (ver `gradeDoQr`). */
function elementos(conteudo, opcoes){
  const o = opcoes || {}, c = conteudo || {};
  const escala = o.escala || 8;
  const m = medir(c);
  const itens = [];

  // 1. o texto grande, duas linhas
  const t = DESENHO.texto;
  [c.linha1 || '', c.linha2 || ''].forEach((linha, i) => {
    if(!linha) return;
    itens.push({ tipo:'texto', texto:linha, x:t.x,
      base: t.topo + m.cap + i*t.entrelinha, cap:m.cap, espaco:0, cor:'preto' });
  });

  /* 2. a seta em circulo, apontando para o QR — porque e isso que a frase diz.
     ⚠️ SETA COM HASTE, NAO UM TRIANGULO SOZINHO. A primeira versao era um
     triangulo cheio dentro do circulo, e isso nao se le como seta: se le como
     BOTAO DE PLAY. Numa etiqueta que manda apontar a camera para um QR, um
     simbolo de video e a pior confusao possivel. */
  const s = DESENHO.seta, r = s.raio;
  itens.push({ tipo:'circulo', cx:s.cx, cy:s.cy, raio:r, cor:'preto' });
  const haste = r*0.56, meia = r*0.16, ponta = r*0.40, aba = r*0.50;
  const recuo = ponta - aba*0.1;
  itens.push({ tipo:'poligono', cor:'branco', pontos:[
    [s.cx-haste, s.cy-meia], [s.cx+recuo, s.cy-meia], [s.cx+recuo, s.cy-aba],
    [s.cx+haste, s.cy],      [s.cx+recuo, s.cy+aba], [s.cx+recuo, s.cy+meia],
    [s.cx-haste, s.cy+meia]
  ]});

  // 3. as barras e o codigo escrito por extenso
  const b = DESENHO.barras;
  if(c.codigo && B){
    const bits = B.modulos(c.codigo);
    const passo = b.largura / bits.length;
    let i = 0;
    while(i < bits.length){
      if(bits[i] === '1'){
        let j = i; while(j < bits.length && bits[j] === '1') j++;
        itens.push({ tipo:'ret', x:b.x + i*passo, y:b.topo,
          largura:(j-i)*passo, altura:b.altura, cor:'preto' });
        i = j;
      } else i++;
    }
    const larg = larguraDoTexto(c.codigo, b.cap) +
                 b.espaco * Math.max(0, String(c.codigo).length - 1);
    itens.push({ tipo:'texto', texto:c.codigo, x:b.x + b.largura/2 - larg/2,
      base: b.topo + b.altura + b.folga + b.cap, cap:b.cap, espaco:b.espaco, cor:'preto' });
  }

  // 4. o QR e a legenda
  const q = DESENHO.qr;
  let g = null;
  if(c.link && m.versaoQr && Q){
    const mods = Q.modulos(c.link);
    g = gradeDoQr(escala, mods.length);
    for(let i=0;i<mods.length;i++){
      let j = 0;
      while(j < mods.length){
        if(mods[i][j]){
          let k = j; while(k < mods.length && mods[i][k]) k++;
          itens.push({ tipo:'ret', x:g.x + j*g.passo, y:g.topo + i*g.passo,
            largura:(k-j)*g.passo, altura:g.passo, cor:'preto' });
          j = k;
        } else j++;
      }
    }
  }
  /* A legenda desce do QR DESENHADO, nao da caixa reservada — e o silencio
     dela e `4 x o modulo`, com a `folga` de MINIMO.
     ⚠️ MEDIR DA CAIXA ERA CERTO ENQUANTO O MODULO TINHA MEIO MILIMETRO E A
     FOLGA FIXA DAVA OS 4 MODULOS POR ACASO. Com o QR grande o modulo passou a
     variar de 0,375 a 1 mm conforme o tamanho do link, e uma folga fixa de
     2,4 mm e silencio de sobra num caso e silencio de MENOS no outro — sem
     mudar nada na tela, porque a legenda continua no mesmo lugar de sempre. */
  if(c.qr_legenda){
    const larg = larguraDoTexto(c.qr_legenda, m.capLegenda);
    const baixo = g ? (g.topo + g.lado) : (q.topo + q.lado);
    const silencio = g ? Math.max(q.folga, 4 * g.passo) : q.folga;
    itens.push({ tipo:'texto', texto:c.qr_legenda, x:q.x + q.lado/2 - larg/2,
      base: baixo + silencio + m.capLegenda, cap:m.capLegenda,
      espaco:0, cor:'preto' });
  }
  return itens;
}

// ── o desenho em SVG (so no navegador) ───────────────────────────────────
const NS = 'http://www.w3.org/2000/svg';
function no(tipo, atributos){
  const el = document.createElementNS(NS, tipo);
  Object.keys(atributos||{}).forEach(k => el.setAttribute(k, atributos[k]));
  return el;
}
const TINTA = cor => cor === 'branco' ? '#fff' : '#000';

/* A etiqueta inteira, em SVG, com o viewBox em MILIMETROS — o desenho e o
   mesmo em qualquer tamanho de tela. Quem chama decide quantos pixels vale um
   milimetro (a previa usa o tamanho proporcional; nao existe "tamanho real"
   no navegador, que nao sabe o tamanho fisico do monitor).

   Daqui para baixo NAO HA DESENHO NENHUM: so a traducao de cada item da lista
   para o no de SVG equivalente. Medida escrita aqui seria a segunda regua. */
function svg(conteudo, opcoes){
  const o = opcoes || {};
  const escala = o.escala || 4;                 // px por mm
  const el = no('svg', {
    viewBox:'0 0 '+ETIQUETA.largura+' '+ETIQUETA.altura,
    width: ETIQUETA.largura*escala, height: ETIQUETA.altura*escala,
    'shape-rendering':'crispEdges'
  });
  el.appendChild(no('rect', { width:ETIQUETA.largura, height:ETIQUETA.altura, fill:'#fff' }));

  elementos(conteudo, { escala }).forEach(it => {
    if(it.tipo === 'ret'){
      // As barras e os modulos do QR: aqui o `crispEdges` do pai e o que faz
      // cada faixa cair em pixel cheio, e e por isso que ele esta la.
      el.appendChild(no('rect', { x:it.x, y:it.y, width:it.largura, height:it.altura,
        fill:TINTA(it.cor) }));
    } else if(it.tipo === 'circulo'){
      el.appendChild(no('circle', { cx:it.cx, cy:it.cy, r:it.raio, fill:TINTA(it.cor),
        'shape-rendering':'geometricPrecision' }));
    } else if(it.tipo === 'poligono'){
      el.appendChild(no('polygon', { points: it.pontos.map(p => p.join(',')).join(' '),
        fill:TINTA(it.cor), 'shape-rendering':'geometricPrecision' }));
    } else if(it.tipo === 'texto'){
      const t = no('text', { x:it.x, y:it.base,
        'font-family':'Arial, Helvetica, sans-serif', 'font-weight':'700',
        'font-size':(it.cap/0.716), fill:TINTA(it.cor),
        'shape-rendering':'geometricPrecision' });
      if(it.espaco) t.setAttribute('letter-spacing', it.espaco);
      t.textContent = it.texto;
      el.appendChild(t);
    }
  });
  return el;
}

const api = { svg, elementos, medir, larguraDoTexto, capParaLinhas, capParaLegenda,
              limiteDeCaracteres, gradeDoQr, ETIQUETA, DESENHO, LARGURA };
if(typeof window !== 'undefined') window.kitEtiqueta = api;
if(typeof module !== 'undefined' && module.exports) module.exports = api;
})();
