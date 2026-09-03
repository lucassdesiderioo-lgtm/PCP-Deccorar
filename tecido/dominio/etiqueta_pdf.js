// A ETIQUETA DE SOBRA EM PDF, uma por pagina, no tamanho da bobina.
//
// Por que no servidor e nao pelo `window.print()` do navegador:
//
//   A folha impressa pelo navegador so sai certa se quem imprime escolher
//   "margens: Nenhuma" e escala 100% — TODA VEZ. Errou uma, o Chrome ajusta a
//   pagina, as barras esticam e o leitor recusa. Pior: ele ainda carimba
//   cabecalho e rodape (a URL e o "8/32") que, numa etiqueta de 35 mm, caem
//   em cima do codigo.
//
//   E a mesma licao da armadilha #6 do CLAUDE.md: o que so funciona quando o
//   operador acerta a configuracao e o que vai falhar. Aqui a pagina JA nasce
//   no tamanho certo e nao ha o que ajustar.
//
// NENHUMA MEDIDA MORA AQUI. Todas vem do cadastro (Cadastros -> Parametros),
// porque a etiqueta e um objeto fisico que a equipe ajusta olhando o
// resultado na bancada: "a letra ta pequena", "a barra some quando amassa".
// Cada um desses ajustes era um deploy.
const {PDFDocument, StandardFonts, rgb} = require('pdf-lib');
const barras = require('../public/barras.js');
const config = require('../nucleo/config');
const {ErroDeRegra} = require('../nucleo/erros');

// PDF mede em pontos (1 pt = 1/72 pol). A bobina e medida em milimetros.
const MM = 72 / 25.4;
const PT_MM = 25.4 / 72;

/* Modulo e a barra fina do codigo. A 203 dpi (a Zebra ZD220) 1 mm sao 8
   pontos de impressao; abaixo de 0,25 mm o modulo vira 2 pontos e a leitura
   passa a falhar em etiqueta amassada — que e o estado normal de uma etiqueta
   que passou um mes na prateleira.

   Ele NAO e cadastravel de proposito: e calculado para o codigo caber na
   largura util. Um campo aqui deixaria alguem gerar 300 etiquetas
   tecnicamente ilegiveis sem nenhum aviso, e o erro so apareceria no bipe. */
const MODULO_MIN_MM = 0.25;
const MODULO_MAX_MM = 0.50;

// Quanto o codigo ocupa, em modulos, ja com os silencios obrigatorios dos
// dois lados — sem eles o leitor nao acha onde o codigo comeca.
const modulosDe = codigo => barras.modulos(codigo).length + 20;

/* As medidas, lidas do cadastro. Uma funcao e nao uma constante: o diretor
   muda o numero na tela e o PDF seguinte ja sai diferente, sem reiniciar. */
function medidas(){
  return {
    largura: config.ler('etqLargura'),
    altura:  config.ler('etqAltura'),
    margem:  config.ler('etqMargem'),
    barra:   config.ler('etqBarraAltura'),
    fonte:   config.ler('etqFonteCodigo')
  };
}

/* O VERTICAL TEM QUE FECHAR, e e aqui que se descobre.
   margem + barra + respiro + letra + margem <= altura da etiqueta

   Cadastravel quer dizer que alguem VAI digitar 40 mm de barra numa etiqueta
   de 35. Recusar na tela custa um aviso; nao recusar custa o rolo inteiro
   impresso com o codigo cortado — e o operador descobre na prateleira. */
const RESPIRO_MM = 1;

function conferir(m){
  const letra = m.fonte * PT_MM;
  const usado = m.margem + m.barra + RESPIRO_MM + letra + m.margem;
  const sobra = m.altura - usado;
  return {
    letra, usado, sobra, cabe: sobra >= 0,
    // A frase e para quem cadastrou, e diz o que fazer — nao o que houve.
    recado: 'Nao cabe na etiqueta de '+num(m.altura)+' mm: as barras ('+num(m.barra)+
      ' mm), o codigo escrito ('+num(letra)+' mm com fonte '+num(m.fonte)+
      ' pt) e as duas margens de '+num(m.margem)+' mm somam '+num(usado)+
      ' mm. Reduza a altura das barras ou a fonte do codigo, ou use uma bobina mais alta.'
  };
}

const num = v => String(Math.round(v*100)/100).replace('.',',');

/* Largura do modulo para o codigo caber na area util.
   `cabe:false` quer dizer que nem no modulo minimo o codigo entra na largura
   — a etiqueta sai, mas MARCADA. O desfecho ruim aqui nao e o erro: e a
   etiqueta sair bonita, colada na peca, e nao bipar. */
function moduloPara(codigo, m){
  m = m || medidas();
  const util = m.largura - 2*m.margem;
  const ideal = util / modulosDe(codigo);
  const mm = Math.min(MODULO_MAX_MM, ideal);
  return {mm, cabe: mm >= MODULO_MIN_MM};
}

/* Uma pagina por etiqueta. `codigos` e a lista do lote, na ordem impressa. */
async function gerar(codigos){
  const lista = (codigos||[]).map(c => String(c||'').trim()).filter(Boolean);
  if(!lista.length)
    throw new ErroDeRegra('lote_vazio','Nao ha etiqueta nenhuma para gerar.');

  const m = medidas();
  const v = conferir(m);
  if(!v.cabe) throw new ErroDeRegra('etiqueta_nao_cabe', v.recado);

  const doc = await PDFDocument.create();
  doc.setTitle('Etiquetas de sobra — tecido');
  const mono = await doc.embedFont(StandardFonts.CourierBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);

  for(const codigo of lista){
    const pagina = doc.addPage([m.largura*MM, m.altura*MM]);
    desenhar(pagina, codigo, m, mono, sans);
  }
  return Buffer.from(await doc.save());
}

function desenhar(pagina, codigo, m, mono, sans){
  const {mm, cabe} = moduloPara(codigo, m);
  const bits = barras.modulos(codigo);
  const silencio = 10 * mm;
  const larguraCodigo = (bits.length * mm) + 2*silencio;

  // Centralizado: a Zebra tem folga de alinhamento de bobina, e codigo colado
  // numa borda e codigo que sai cortado quando a bobina anda.
  const x0 = ((m.largura - larguraCodigo) / 2 + silencio) * MM;
  const yBarra = (m.altura - m.margem - m.barra) * MM;

  // Barras vizinhas viram um retangulo so — menos objetos no PDF e menos
  // chance de o rasterizador abrir uma fresta entre elas.
  let i = 0;
  while(i < bits.length){
    if(bits[i] === '1'){
      let j = i; while(j < bits.length && bits[j] === '1') j++;
      pagina.drawRectangle({
        x: x0 + i*mm*MM, y: yBarra,
        width: (j-i)*mm*MM, height: m.barra*MM,
        color: rgb(0,0,0)
      });
      i = j;
    } else i++;
  }

  /* O CODIGO ESCRITO E O QUE O OPERADOR PROCURA. Ele passa o olho na estante
     lendo numero, e usa o leitor so para confirmar. Tambem e a saida quando o
     leitor falha — etiqueta amassada, poeira de tecido na lente: ele digita e
     continua trabalhando, em vez de parar a bancada.

     A fonte encolhe SO se o codigo nao couber na largura. Preferir imprimir
     um pouco menor a nao imprimir: aqui o texto e para olho humano, e olho
     humano le 18 pt quando esperava 22. O que nunca pode encolher calado e o
     modulo da barra, e esse nao e cadastravel. */
  const utilTexto = (m.largura - 2*m.margem) * MM;
  let tam = m.fonte;
  while(tam > 5 && mono.widthOfTextAtSize(codigo, tam) > utilTexto) tam -= 0.5;
  const largura = mono.widthOfTextAtSize(codigo, tam);

  /* A FAIXA DO TEXTO e o que sobra entre a margem de baixo e a barra. As
     posicoes sao calculadas dentro dela, e nao somando margens no olho:
     com fonte grande, um chute de 1 mm faz o rabo do "S" invadir a marca, e
     isso so apareceria na etiqueta impressa. */
  const faixaBase = m.margem;                        // piso da faixa
  const faixaTopo = m.altura - m.margem - m.barra - RESPIRO_MM;
  const faixa = faixaTopo - faixaBase;
  const letra = tam * PT_MM;

  // A marca so entra se sobrar espaco DE VERDADE depois da letra. Ela e
  // conforto; o codigo e o trabalho — quando disputam, o codigo ganha.
  const marca = cabe ? 'SOBRA' : 'SOBRA · CONFERIR LEITURA';
  const tamMarca = 6, alturaMarca = tamMarca * PT_MM;
  const larguraMarca = sans.widthOfTextAtSize(marca, tamMarca);
  const temMarca = (faixa - letra) >= (alturaMarca + 1) && larguraMarca <= utilTexto;

  // Codigo centrado no que resta da faixa depois de reservar a marca.
  const baseCodigo = temMarca
    ? faixaBase + alturaMarca + 0.8 + Math.max(0,(faixa - letra - alturaMarca - 0.8))/2
    : faixaBase + Math.max(0,(faixa - letra))/2;

  pagina.drawText(codigo, {
    x: (m.largura*MM - largura) / 2,
    y: baseCodigo * MM,
    size: tam, font: mono, color: rgb(0,0,0)
  });

  // A marca diz de que sistema a etiqueta e: na prateleira ela convive com a
  // etiqueta de SKU do Mercado Livre, e as duas tem codigo de barras.
  // Codigo que nao caiu na largura sai ACUSADO aqui.
  if(temMarca) pagina.drawText(marca, {
    x: (m.largura*MM - larguraMarca) / 2,
    y: faixaBase * MM,
    size: tamMarca, font: sans, color: rgb(.35,.35,.35)
  });
}

module.exports = {gerar, moduloPara, medidas, conferir, MODULO_MIN_MM, MODULO_MAX_MM};
