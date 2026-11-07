/* A ETIQUETA DA CASA DO VOLUME (spec COMPRAS-E-RECEBIMENTO, R-CMP-39), em PDF,
 * no rolo da Zebra ZD220 (100 × 35 mm, 203 dpi) — a mesma porta do kit, do SKU
 * e do sob medida. O CODE128 sai do `public/barras.js` (uma tabela so no
 * projeto), com o modulo em ponto inteiro da impressora (0,375 mm).
 */
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const barras = require('./public/barras.js');
const MM = 72 / 25.4;
const ETIQUETA = { largura:100, altura:35 };
const MODULO = 0.375;

function limpo(t){ return String(t == null ? '' : t).replace(/[^\x20-\x7E -ÿ]/g, '').trim(); }
function caber(fonte, texto, tam, max){
  let t = limpo(texto);
  while(t.length > 1 && fonte.widthOfTextAtSize(t, tam) > max) t = t.slice(0, -1);
  return t;
}

async function gerar(v){
  const doc = await PDFDocument.create();
  doc.setTitle('Volume ' + v.codigo);
  const fonte = await doc.embedFont(StandardFonts.HelveticaBold);
  const pag = doc.addPage([ETIQUETA.largura * MM, ETIQUETA.altura * MM]);
  const preto = rgb(0, 0, 0);
  const util = (ETIQUETA.largura - 6) * MM;
  const linha = (texto, tam, yMm) => {
    const t = caber(fonte, texto, tam, util);
    const w = fonte.widthOfTextAtSize(t, tam);
    pag.drawText(t, { x:(ETIQUETA.largura * MM - w) / 2, y:(ETIQUETA.altura - yMm) * MM, size:tam, font:fonte, color:preto });
  };
  linha(v.material, 9, 5.5);
  linha(String(v.qtd_inicial).replace('.', ',') + ' ' + (v.unidade || '') + (v.endereco ? '  ·  ' + v.endereco : ''), 8, 10);
  const bits = barras.modulos(v.codigo);
  const larg = bits.length * MODULO;
  const x0 = Math.round(((ETIQUETA.largura - larg) / 2) * 8) / 8;
  const topo = 12, alt = 15;
  for(let i = 0; i < bits.length; ){
    if(bits[i] !== '1'){ i++; continue; }
    let j = i; while(j < bits.length && bits[j] === '1') j++;
    pag.drawRectangle({ x:(x0 + i * MODULO) * MM, y:(ETIQUETA.altura - topo - alt) * MM, width:(j - i) * MODULO * MM, height:alt * MM, color:preto });
    i = j;
  }
  linha(v.codigo, 10, 32);
  return Buffer.from(await doc.save());
}

module.exports = { gerar, ETIQUETA };
