// A ETIQUETA DE SOBRA EM PDF, no tamanho da bobina: 100 x 35 mm, uma por
// pagina.
//
// Por que no servidor e nao pelo `window.print()` do navegador:
//
//   A folha impressa pelo navegador so sai certa se quem imprime escolher
//   "margens: Nenhuma" e escala 100% — TODA VEZ. Errou uma, o Chrome ajusta a
//   pagina, as barras esticam e o leitor recusa. Pior: ele ainda carimba
//   cabecalho e rodape (a URL e o "8/32") que, numa etiqueta de 35 mm, caem
//   em cima do codigo.
//
//   E a mesma licao da etiqueta de SKU no §7 do CLAUDE.md, e a mesma licao da
//   armadilha #6: uma coisa que so funciona quando o operador acerta a
//   configuracao e uma coisa que vai falhar. Aqui a pagina JA nasce 100x35 e
//   nao ha o que ajustar.
//
// Uma etiqueta que nao bipa e uma etiqueta que nao existe, e o erro so
// apareceria na bancada, com o rolo de etiqueta ja gasto.
const {PDFDocument, StandardFonts, rgb} = require('pdf-lib');
const barras = require('../public/barras.js');

// PDF mede em pontos (1 pt = 1/72 pol). A bobina e medida em milimetros.
const MM = 72 / 25.4;

const LARGURA_MM = 100;
const ALTURA_MM  = 35;

// Margem fisica da etiqueta. A Zebra nao imprime coladinho na borda, e o
// silencio do CODE128 (as 10 barras vazias de cada lado) tem que caber DENTRO
// da area impressa — sem ele o leitor nao acha o comeco do codigo.
const MARGEM_MM = 4;

// Altura da barra. Regra pratica de leitura: barra curta demais obriga o
// operador a mirar, e mirar na bancada e o que faz ele desistir do leitor e
// digitar. Sobra espaco para o codigo escrito embaixo, que e a saida quando o
// leitor falha.
const BARRA_MM = 16;

// Modulo (a barra fina) em milimetros. A 203 dpi, 1 mm = 8 pontos de
// impressao; abaixo de ~0,25 mm o modulo vira 2 pontos e a leitura comeca a
// falhar em etiqueta amassada. O teto existe para o codigo curto nao virar um
// borrao gordo que estoura a largura.
const MODULO_MIN_MM = 0.25;
const MODULO_MAX_MM = 0.50;

// Quanto o codigo ocupa, em modulos, ja com os silencios obrigatorios.
const modulosDe = codigo => barras.modulos(codigo).length + 20;

/* Largura do modulo para o codigo caber na area util.
   Devolve tambem se coube: codigo comprido demais para 100 mm nao pode sair
   pequeno demais em silencio — ele sairia impresso e nao bipaia, que e o
   pior desfecho possivel. */
function moduloPara(codigo){
  const util = LARGURA_MM - 2*MARGEM_MM;
  const ideal = util / modulosDe(codigo);
  const mm = Math.min(MODULO_MAX_MM, ideal);
  return {mm, cabe: mm >= MODULO_MIN_MM};
}

/* Uma pagina por etiqueta. `codigos` e a lista do lote, na ordem impressa. */
async function gerar(codigos){
  const lista = (codigos||[]).map(c => String(c||'').trim()).filter(Boolean);
  if(!lista.length) throw new Error('nenhuma etiqueta para gerar');

  const doc = await PDFDocument.create();
  doc.setTitle('Etiquetas de sobra — tecido');
  const mono = await doc.embedFont(StandardFonts.CourierBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);

  for(const codigo of lista){
    const pagina = doc.addPage([LARGURA_MM*MM, ALTURA_MM*MM]);
    desenhar(pagina, codigo, mono, sans);
  }
  return Buffer.from(await doc.save());
}

function desenhar(pagina, codigo, mono, sans){
  const {mm, cabe} = moduloPara(codigo);
  const bits = barras.modulos(codigo);
  const silencio = 10 * mm;
  const larguraCodigo = (bits.length * mm) + 2*silencio;

  // Centralizado na etiqueta: a Zebra tem folga de alinhamento de bobina, e
  // codigo colado numa borda e codigo que sai cortado quando a bobina anda.
  const x0 = ((LARGURA_MM - larguraCodigo) / 2 + silencio) * MM;
  const yBarra = (ALTURA_MM - MARGEM_MM - BARRA_MM) * MM;

  // Barras vizinhas viram um retangulo so — menos objetos no PDF e menos
  // chance de o rasterizador da impressora abrir uma fresta entre elas.
  let i = 0;
  while(i < bits.length){
    if(bits[i] === '1'){
      let j = i; while(j < bits.length && bits[j] === '1') j++;
      pagina.drawRectangle({
        x: x0 + i*mm*MM, y: yBarra,
        width: (j-i)*mm*MM, height: BARRA_MM*MM,
        color: rgb(0,0,0)
      });
      i = j;
    } else i++;
  }

  // O CODIGO ESCRITO EMBAIXO NAO E ENFEITE: quando o leitor falha — etiqueta
  // amassada, poeira de tecido na lente — o cortador digita e continua
  // trabalhando. Sem ele, leitor com problema para a bancada.
  const tam = 11;
  const largura = mono.widthOfTextAtSize(codigo, tam);
  pagina.drawText(codigo, {
    x: (LARGURA_MM*MM - largura) / 2,
    y: (MARGEM_MM + 5.5) * MM,
    size: tam, font: mono, color: rgb(0,0,0)
  });

  // A marca diz de que sistema a etiqueta e. Na prateleira ela convive com a
  // etiqueta de SKU do Mercado Livre, e as duas tem codigo de barras.
  const marca = cabe ? 'SOBRA' : 'SOBRA · CODIGO LONGO, CONFERIR LEITURA';
  const tamMarca = 6;
  pagina.drawText(marca, {
    x: (LARGURA_MM*MM - sans.widthOfTextAtSize(marca, tamMarca)) / 2,
    y: MARGEM_MM * MM * 0.6,
    size: tamMarca, font: sans, color: rgb(.35,.35,.35)
  });
}

module.exports = {gerar, moduloPara, LARGURA_MM, ALTURA_MM, MODULO_MIN_MM};
