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

/* Corta o texto que nao cabe na largura, em vez de deixar vazar por cima do
   codigo de barras. Quem sobra escrito e o comeco, que e o que identifica. */
function cortar(s, fonte, tam, larguraMM){
  let t = txt(s);
  const limite = larguraMM*MM;
  if(fonte.widthOfTextAtSize(t,tam) <= limite) return t;
  while(t.length>1 && fonte.widthOfTextAtSize(t+'…',tam) > limite) t=t.slice(0,-1);
  return t+'…';
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
  const escreve = (t, {x, y, tam, fonte, cor, largura}) => {
    const s = largura ? cortar(t, fonte, tam, largura) : txt(t);
    pagina.drawText(s, {x:x*MM, y:y*MM, size:tam, font:fonte,
      color: cor || rgb(0,0,0)});
  };
  const cinza = rgb(.35,.35,.35);
  const L = ETQ.largura - 2*m;          // largura util

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
  if(marca){
    const larg = f.forte.widthOfTextAtSize(txt(marca), 9) * PT_MM;
    escreve(marca, {x:ETQ.largura-m-larg, y:28, tam:9, fonte:f.forte, cor:rgb(.72,0,0)});
    reservado = larg + 3;
  }
  escreve(e.pedido_numero+'  ·  '+e.peca,
    {x:m, y:27.5, tam:11, fonte:f.forte, largura:L-reservado});
  escreve([e.revenda, e.prazo].filter(Boolean).join('  ·  '),
    {x:m, y:23.5, tam:7.5, fonte:f.normal, cor:cinza, largura:L});
  escreve([e.medida, e.colecao, e.comando].filter(Boolean).join('  ·  '),
    {x:m, y:19.8, tam:7.5, fonte:f.normal, largura:L});

  /* ⚠️ A TAREFA E A MAIOR LETRA DA ETIQUETA, e e de proposito. Tudo o mais
     identifica a peca; esta linha e o trabalho — `TUBO 32 · CORTAR 0,970`. O
     serralheiro le isso de relance, com a peca na mao, e e o unico numero
     que ele nao pode conferir depois: o tubo cortado nao volta. */
  escreve(e.tarefa, {x:m, y:14.6, tam:10, fonte:f.forte, largura:L});
  if(e.extra) escreve(e.extra, {x:m, y:10.8, tam:7, fonte:f.normal, cor:cinza, largura:L});

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

module.exports={gerar, moduloDe, ETQ, MODULO_MIN_MM, MODULO_MAX_MM};
