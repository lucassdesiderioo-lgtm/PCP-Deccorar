// A ETIQUETA DE PRODUCAO NO PAPEL — 100 × 35 mm, Zebra ZD220, 203 dpi.
//
// ⚠️ ELE NAO DECIDE NADA DO CONTEUDO. A lista vem pronta do
// `dominio/etiqueta_producao.js`; aqui so se decide ONDE cada coisa fica. E a
// mesma separacao do `kit_etiqueta.js` do PCP (§4): quem sabe O QUE dizer nao
// sabe ONDE por, e juntar os dois faz a regra mudar quando alguem mexe no
// desenho.
//
// ⚠️ E AS BARRAS SAO AS DO `etiqueta_pdf.js`, nao uma segunda copia. Aquele
// arquivo ja desenha o CODE128 da etiqueta de sobra e da de rolo; uma terceira
// tabela seria a terceira etiqueta a divergir no dia em que alguem ajustasse
// uma delas — e a divergencia so apareceria no bipe (§15 do CLAUDE.md).
const {PDFDocument, StandardFonts, rgb} = require('pdf-lib');
const {ErroDeRegra} = require('../nucleo/erros');
const barras = require('../../public/barras.js');
const sobraPdf = require('./etiqueta_pdf');

const MM = 72/25.4;
const PT_MM = 25.4/72;

/* ⚠️ O TAMANHO NAO E CADASTRAVEL, ao contrario da etiqueta de sobra. Aquela
   sai numa bobina que a fabrica troca; esta e a etiqueta de producao da
   spec (secao 4.14), 100 × 35, e a serralheria, a colecao e a embalagem
   colam a MESMA. Um campo aqui faria os cinco setores poderem divergir. */
const ETQ = {largura:100, altura:35, margem:3};
const BARRA_MM = 8;      // altura das barras
const MODULO_MIN_MM = 0.25;   // abaixo disto a ZD220 nao resolve amassado
const MODULO_MAX_MM = 0.40;

const modulosDe = codigo => barras.modulos(codigo).length + 20;

/* ⚠️ O CODIGO OCUPA A FAIXA DE BAIXO INTEIRA, e nao uma coluna ao lado do
   texto. A primeira versao desta etiqueta reservava 38 mm para ele, numa
   coluna a direita — e o modulo caiu para 0,23 mm, ABAIXO dos 0,25 que a
   ZD220 resolve numa etiqueta amassada. Ela sairia bonita, colada na peca, e
   nao biparia; quem descobriria seria a bancada, na fase 5, com a peca na
   mao. Texto e codigo disputando a mesma largura e disputa que o codigo
   sempre perde, porque o texto cabe encolhendo e o modulo nao.

   `cabe:false` quer dizer que nem no minimo ele entra — a etiqueta sai, mas
   MARCADA. */
const FAIXA_CODIGO_MM = 66;

function moduloDe(codigo){
  const ideal = FAIXA_CODIGO_MM / modulosDe(String(codigo||''));
  const mm = Math.min(MODULO_MAX_MM, ideal);
  return {mm, cabe: mm >= MODULO_MIN_MM};
}

/* ⚠️ HELVETICA ESCREVE EM WinAnsi, e o texto aqui vem de campo livre (o nome
   da revenda, o nome do componente). Emoji e seta estouram o `pdf-lib` no
   MEIO da geracao, com o rolo pela metade e sem dizer por que — foi a licao
   da folha do pedido (§19, fase 3). Vira '?', e a etiqueta sai. */
const txt = v => String(v==null?'':v)
  .replace(/[≥→⚠–—“”‘’]/g, c => ({'≥':'>=','→':'->','⚠':'!','–':'-','—':'-',
    '“':'"','”':'"','‘':"'",'’':"'"}[c]))
  .replace(/[^\x20-\x7E\xA0-\xFF]/g,'?');

/* ⚠️ NADA AQUI TERMINA EM "…" (secao 8.2 da spec SOBMEDIDA-CADASTRO-DE-
   PRODUTO, dono, 28/10/2026). Ate aqui a linha que nao cabia era cortada, e o
   Painel central de 6 folhas com comando perdia justamente as escolhas que a
   bancada precisa ler — texto cortado manda conferir na tela, e conferir na
   tela e o que a etiqueta existe para dispensar.

   A ordem e: (1) a linha cabe → sai como sempre, no mesmo lugar e no mesmo
   tamanho (o Rolo nao muda); (2) nao cabe → ENCOLHE ate um piso legivel, no
   mesmo lugar; (3) nem assim → QUEBRA EM DUAS (ou mais) linhas, pelo " · "
   primeiro, depois pelo espaco, e so no limite no meio da palavra; e as linhas
   da etiqueta se reacomodam de cima para baixo. Se ainda faltar altura, tudo
   encolhe junto, a tarefa por ultimo. Nunca some palavra. */
const PISO_TEXTO_MM = 10.0;         // abaixo disto mora o codigo de barras
const TOPO_MM = ETQ.altura - ETQ.margem;

const largura = (fonte, tam, t) => fonte.widthOfTextAtSize(t, tam) * PT_MM;

/* Quebra o texto em linhas que cabem em `limite` mm. Corta pelo separador da
   etiqueta (" · ") primeiro, que e onde a frase ja se divide; depois pelo
   espaco; e so a palavra sozinha maior que a linha e partida no meio. */
function quebrar(texto, fonte, tam, limite){
  const pedacos = [];
  txt(texto).split('  ·  ').forEach((p,i,a)=>pedacos.push(p + (i<a.length-1?'  ·':'')));
  const linhas = [];
  let atual = '';
  const caber = t => largura(fonte, tam, t) <= limite;
  const empurrar = parte => {
    const tentativa = atual ? atual + ' ' + parte : parte;
    if(caber(tentativa)){ atual = tentativa; return; }
    if(atual){ linhas.push(atual); atual = ''; }
    if(caber(parte)){ atual = parte; return; }
    // Maior que a linha sozinha: pela palavra, e no limite pela letra.
    const palavras = parte.split(' ');
    if(palavras.length > 1){ palavras.forEach(empurrar); return; }
    let resto = parte;
    while(resto){
      let n = resto.length;
      while(n > 1 && !caber(resto.slice(0,n))) n--;
      if(n < resto.length){ linhas.push(resto.slice(0,n)); resto = resto.slice(n); }
      else { atual = resto; resto = ''; }
    }
  };
  pedacos.forEach(empurrar);
  if(atual) linhas.push(atual);
  // O separador que sobrou no fim da linha quebrada sai: a quebra ja separa.
  return linhas.length ? linhas.map(l => l.replace(/\s+·$/,'')) : [''];
}

/* Os blocos, de cima para baixo, na ordem em que a bancada procura: de quem
   e (pedido e peca), para quem e quando, o que a peca e, o trabalho, e os
   extras. `y` e onde cada um sempre saiu; `min` e o menor tamanho em que ele
   ainda sai numa linha so antes de quebrar. */
function blocosDe(e, reservado){
  const L = ETQ.largura - 2*ETQ.margem;
  /* A linha do tecido costuma ter o NOME DO PRODUTO (Romana, Painel), e
     escrever os dois gastava a linha que as escolhas precisam. Quando a
     colecao comeca pelo produto, o produto fica e a palavra repetida sai —
     so no papel; o dado continua inteiro. */
  const col = (e.produto && String(e.colecao||'').indexOf(e.produto+' ')===0)
    ? String(e.colecao).slice(e.produto.length+1) : e.colecao;
  const baixo = [e.extra].concat(e.extras||[]).filter(Boolean).join('  ·  ');
  return [
    {bloco:'cabeca', texto:(e.pedido_item||e.pedido_numero)+'  ·  '+e.peca, y:27.5, tam:11, min:8,
      fonte:'forte', largura:L-reservado},
    {bloco:'base', texto:[e.revenda, e.cliente_final, e.prazo].filter(Boolean).join('  ·  '),
      y:23.5, tam:7.5, min:6, fonte:'normal', cinza:true, largura:L},
    {bloco:'produto', texto:[e.produto, e.medida, col, e.escolhas||e.comando].filter(Boolean).join('  ·  '),
      y:19.8, tam:7.5, min:6, fonte:'normal', largura:L},
    /* ⚠️ A TAREFA E A MAIOR LETRA DO CORPO, e e de proposito. Tudo o mais
       identifica a peca; esta linha e o trabalho — `TUBO 32 · CORTAR 0,970`.
       O serralheiro le isso de relance, com a peca na mao, e e o unico numero
       que ele nao pode conferir depois: o tubo cortado nao volta. */
    {bloco:'tarefa', texto:e.tarefa, y:14.6, tam:10, min:8, fonte:'forte', largura:L},
    /* O que muda com o setor (o kit, a reducao, os gomos, as vias) e os
       EXTRAS do insumo (marca, modelo, fabricacao). Campo vazio nao sai — o
       extrasDe ja o tirou da lista. */
    {bloco:'extras', texto:baixo, y:10.8, tam:7, min:5.5, fonte:'normal', cinza:true, largura:L}
  ].filter(b => String(b.texto||'').trim());
}

/* O DIAGRAMA: onde cada linha de texto fica. Separado do desenho para o teste
   conferir, linha a linha, que nada sai da etiqueta, nada encosta no codigo e
   nenhuma palavra some. */
function diagramar(e, f, reservado){
  const m = ETQ.margem;
  const blocos = blocosDe(e, reservado||0);
  const fonte = b => f[b.fonte];

  // (1) e (2): cabe numa linha, no tamanho de sempre ou encolhendo ate o piso.
  const umaLinha = blocos.map(b => {
    for(let t=b.tam; t>=b.min-1e-9; t=Math.round((t-0.25)*100)/100)
      if(largura(fonte(b), t, txt(b.texto)) <= b.largura) return t;
    return null;
  });
  if(umaLinha.every(t => t!=null))
    return {linhas: blocos.map((b,i) => ({bloco:b.bloco, texto:txt(b.texto), x:m, y:b.y,
      tam:umaLinha[i], fonte:fonte(b), cinza:!!b.cinza}))};

  // (3): quem nao coube quebra; a etiqueta se reacomoda de cima para baixo, e
  // se faltar altura tudo encolhe junto — a tarefa e a ultima a perder letra.
  // A CABECA fica onde sempre esteve quando cabe numa linha: a unidade (2/4)
  // e a marca de refeita moram ao lado dela, na mesma altura.
  const cabecaFixa = blocos[0] && blocos[0].bloco==='cabeca' && umaLinha[0]!=null;
  const fluem = cabecaFixa ? blocos.slice(1) : blocos;
  const tamUma = cabecaFixa ? umaLinha.slice(1) : umaLinha;
  const topoFluxo = cabecaFixa ? blocos[0].y - umaLinha[0]*PT_MM*0.30 - 0.6 : TOPO_MM;
  const ASC=0.78, DESC=0.30;
  for(let escala=1; ; escala=Math.round((escala-0.04)*100)/100){
    const linhas = [];
    fluem.forEach((b,i) => {
      const alvo = b.bloco==='tarefa' ? Math.max(b.min*0.8, b.tam*Math.sqrt(escala)) : b.tam*escala;
      const tam = tamUma[i]!=null ? Math.min(tamUma[i], b.bloco==='tarefa'?tamUma[i]:alvo) : Math.min(alvo, b.min);
      const t = txt(b.texto);
      const partes = largura(fonte(b), tam, t) <= b.largura ? [t] : quebrar(b.texto, fonte(b), tam, b.largura);
      partes.forEach(x => linhas.push({bloco:b.bloco, texto:x, x:m, tam, fonte:fonte(b), cinza:!!b.cinza}));
    });
    const altura = linhas.reduce((s,l) => s + l.tam*PT_MM*(ASC+DESC), 0);
    const cabe = altura <= topoFluxo - PISO_TEXTO_MM;
    if(cabe || escala<=0.3){
      // Cada linha desce o quanto ela mesma mede; a folga que sobra se reparte.
      const folga = Math.max(0, (topoFluxo - PISO_TEXTO_MM) - altura) / Math.max(1, linhas.length);
      let topo = topoFluxo;
      linhas.forEach(l => {
        l.y = topo - l.tam*PT_MM*ASC;
        topo = l.y - l.tam*PT_MM*DESC - folga;
      });
      if(cabecaFixa) linhas.unshift({bloco:'cabeca', texto:txt(blocos[0].texto), x:m, y:blocos[0].y,
        tam:umaLinha[0], fonte:fonte(blocos[0]), cinza:false});
      return {linhas};
    }
  }
}

async function gerar(etiquetas){
  const lista = (etiquetas||[]).filter(e => e && String(e.codigo||'').trim());
  if(!lista.length)
    throw new ErroDeRegra('lote_vazio','Nao ha etiqueta nenhuma para imprimir.');

  const doc = await PDFDocument.create();
  doc.setTitle('Etiquetas de produção — sob medida');
  const mono   = await doc.embedFont(StandardFonts.CourierBold);
  const forte  = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);

  for(const e of lista){
    const pagina = doc.addPage([ETQ.largura*MM, ETQ.altura*MM]);
    desenhar(pagina, e, {mono, forte, normal});
  }
  return Buffer.from(await doc.save());
}

function desenhar(pagina, e, f){
  const m = ETQ.margem;
  /* O que fica fora do diagrama — a unidade, a marca de refeita e o codigo
     escrito — e curto e tem lugar proprio. Se um dia nao couber, encolhe:
     nunca corta. */
  const escreve = (t, {x, y, tam, fonte, cor, largura:lim}) => {
    const s = txt(t);
    let size = tam;
    while(lim && size>4 && largura(fonte, size, s) > lim) size = Math.round((size-0.25)*100)/100;
    pagina.drawText(s, {x:x*MM, y:y*MM, size, font:fonte, color: cor || rgb(0,0,0)});
  };
  const cinza = rgb(.35,.35,.35);

  /* ── DE CIMA PARA BAIXO, na ordem em que a bancada procura ──────────────
     de quem e (pedido e peca), para quem e quando, o que a peca e, e so
     entao o trabalho. */
  /* ⚠️ A PECA REFEITA SAI MARCADA, EM VERMELHO E NO CANTO DE CIMA (fase
     5-B2, secao 4.16). O CODIGO e o mesmo de sempre — ele e da peca, nao do
     papel, e codigo novo partiria a historia dela em duas —, e e justamente
     por isso que a marca importa: sem ela ficam duas etiquetas IGUAIS na
     bancada e nada dizendo qual e a da peca boa. O vermelho vai no canto de
     cima porque e o primeiro lugar onde o olho cai; embaixo, junto do
     codigo, ele disputaria espaco com o "CONFERIR LEITURA". */
  const marca = e.refeitas>0 ? ('REFAZER '+(e.refeitas+1)+'\u00AA VEZ') : '';
  let reservado = 0;
  /* ⚠️ A UNIDADE E O CANTO DE CIMA, EM LETRA GRANDE (secao 8.1 da spec
     SOBMEDIDA-CADASTRO-DE-PRODUTO): "2/4" e o que a bancada conta para ver se
     alguma vareta ficou para tras, e e o primeiro lugar onde o olho cai. A
     marca de refeita fica logo a esquerda dela, em vermelho. */
  const unidade = e.unidade || '';
  if(unidade){
    const larg = f.forte.widthOfTextAtSize(txt(unidade), 11) * PT_MM;
    escreve(unidade, {x:ETQ.largura-m-larg, y:27.5, tam:11, fonte:f.forte});
    reservado = larg + 3;
  }
  if(marca){
    const larg = f.forte.widthOfTextAtSize(txt(marca), 9) * PT_MM;
    escreve(marca, {x:ETQ.largura-m-reservado-larg, y:28, tam:9, fonte:f.forte, cor:rgb(.72,0,0)});
    reservado += larg + 3;
  }
  /* A BASE, igual em todas (secao 8.2): pedido e item (1027/02), a peca do
     pedido, revenda e CLIENTE FINAL quando houver, a entrega; e o produto, a
     medida, a cor e as escolhas. Onde cada linha fica e o `diagramar`. */
  diagramar(e, f, reservado).linhas.forEach(l => pagina.drawText(l.texto,
    {x:l.x*MM, y:l.y*MM, size:l.tam, font:l.fonte, color:l.cinza?cinza:rgb(0,0,0)}));

  /* ── A FAIXA DE BAIXO: o codigo ─────────────────────────────────────── */
  const {mm, cabe} = moduloDe(e.codigo);
  const bits = barras.modulos(e.codigo);
  const silencio = 10*mm;

  sobraPdf.desenharBarras(pagina, bits,
    {x0:(m+silencio)*MM, y:m*MM, altura:6, modulo:mm});

  /* O CODIGO ESCRITO fica ao lado das barras, nao embaixo: a faixa tem 6 mm
     de altura e o texto sob elas encostaria na margem. E ele e o que o
     operador procura e o que ele digita quando o leitor falha — poeira de
     tecido na lente para a bancada, nao o trabalho. */
  const fimBarras = m + bits.length*mm + 2*silencio + 2;
  escreve(e.codigo, {x:fimBarras, y:m+3.4, tam:9, fonte:f.mono,
    largura:ETQ.largura-m-fimBarras});
  escreve(e.setor.toUpperCase(), {x:fimBarras, y:m, tam:6.5, fonte:f.normal,
    cor:cinza, largura:ETQ.largura-m-fimBarras});

  // Codigo que nao coube na largura sai ACUSADO: melhor a bancada saber que
  // pode nao bipar do que descobrir com a peca na mao.
  if(!cabe) escreve('CONFERIR LEITURA',
    {x:fimBarras, y:m+7, tam:6, fonte:f.normal, cor:rgb(.6,0,0)});
}

module.exports={gerar, moduloDe, diagramar, txt, ETQ, PISO_TEXTO_MM, MODULO_MIN_MM, MODULO_MAX_MM};
