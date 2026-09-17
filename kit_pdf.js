/* kit_pdf.js — A ETIQUETA DO KIT NO PAPEL (spec GERADOR-ETIQUETA-KIT, fase 3).
 *
 * ⚠️ AQUI NAO HA NENHUMA MEDIDA, e isso e o ponto do arquivo.
 * Tudo o que existe e onde fica sai de `public/kit_etiqueta.js` -> `elementos()`,
 * a MESMA lista que a previa da tela desenha. Um desenho, dois desenhistas: a
 * previa traduz a lista para SVG, este arquivo traduz para PDF. Medida escrita
 * aqui seria a segunda regua — e a divergencia entre as duas so apareceria com
 * o rolo impresso, que e exatamente o que esta spec veio consertar.
 *
 * ── POR QUE PDF, E NAO ZPL ────────────────────────────────────────────────
 * A §6 da spec pedia ZPL enviado a impressora. A Zebra da fabrica esta ligada
 * por USB no COMPUTADOR, nao na rede: o servidor nao tem como falar com ela.
 * Entao o caminho e o mesmo do sob medida (`tecido/dominio/etiqueta_pdf.js`):
 * o servidor devolve um PDF com a pagina JA no tamanho da etiqueta, e quem
 * imprime nao tem o que configurar.
 *
 * ⚠️ E O QR AGORA E DESENHADO POR NOS, NAO PELA IMPRESSORA. Ate a fase 2 o
 * CLAUDE.md dizia que no papel quem desenha o QR e a ZD220 (`^BQ`). Com PDF
 * isso deixou de valer, e o defeito da grade que quebrou a previa (modulo em
 * pixel quebrado, timing que respira) passou a ser possivel TAMBEM NO PAPEL.
 * Por isso a `escala` daqui e 8: a 203 dpi um milimetro tem 8 pontos de
 * impressao, e a `gradeDoQr` faz o modulo cair em ponto INTEIRO da impressora.
 * Sem isso o rasterizador da Zebra arredonda cada borda e a grade sai com
 * modulos de 4 e 5 pontos alternando — o mesmo defeito, no papel, onde ele
 * custa o rolo inteiro.
 */
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const DESENHO = require('./public/kit_etiqueta.js');

// PDF mede em pontos de 1/72 pol; a etiqueta e medida em milimetros.
const MM = 72 / 25.4;
// Pontos de impressao por milimetro na ZD220 (203 dpi). E a grade em que o
// modulo do QR tem que caber inteiro.
const PONTOS_POR_MM = 8;
/* O teto do lote. Nao e limite tecnico: e a diferenca entre "errei uma
   etiqueta" e "errei o rolo". Quem digita 5000 por engano descobre no papel. */
const MAX = 500;

const A = DESENHO.ETIQUETA;

/* O que impede a impressao (R7). Devolve a lista INTEIRA, porque dizer um
   problema por vez faz a pessoa corrigir, tentar, descobrir o seguinte e
   concluir que o sistema inventa impedimento novo a cada clique. */
function conferir(conteudo, quantidade){
  const problemas = DESENHO.medir(conteudo || {}).problemas.slice();
  const q = Number(quantidade);
  if(!Number.isInteger(q) || q < 1)
    problemas.push('a quantidade tem que ser um número de 1 a ' + MAX);
  else if(q > MAX)
    problemas.push('o máximo por vez são ' + MAX + ' etiquetas — divida em lotes');
  return { pronta: problemas.length === 0, problemas };
}

/* Uma pagina por etiqueta, todas iguais — e de proposito. O rolo da ZD220 e
   continuo: uma pagina do tamanho exato da etiqueta faz a impressora avancar
   exatamente uma, sem margem para ajustar e sem nada para configurar. */
async function gerar(conteudo, quantidade){
  const q = Number(quantidade);
  const v = conferir(conteudo, q);
  if(!v.pronta){ const e = new Error(v.problemas[0]); e.problemas = v.problemas; throw e; }

  const itens = DESENHO.elementos(conteudo, { escala: PONTOS_POR_MM });
  const doc = await PDFDocument.create();
  doc.setTitle('Etiquetas do kit de instalação');
  const fonte = await doc.embedFont(StandardFonts.HelveticaBold);

  for(let i=0;i<q;i++){
    const pagina = doc.addPage([A.largura*MM, A.altura*MM]);
    desenhar(pagina, itens, fonte);
  }
  return Buffer.from(await doc.save());
}

const TINTA = cor => cor === 'branco' ? rgb(1,1,1) : rgb(0,0,0);
// A lista mede de cima para baixo (como a tela); o PDF mede de baixo para
// cima. A conversao mora num lugar so, aqui.
const deCima = mm => (A.altura - mm) * MM;

/* Circulo e poligono saem os dois como CAMINHO, pelo mesmo `drawSvgPath`.
   O `drawCircle` do pdf-lib fecha o caminho depois do `Q` que restaura o
   estado grafico — um viewer de tela releva, o rasterizador de uma impressora
   nao tem obrigacao nenhuma de relevar, e o defeito so apareceria no papel.
   Quatro bezieres com o kappa de sempre desenham o circulo exato. */
const KAPPA = 0.5522847498307936;
function caminhoDoCirculo(cx, cy, r){
  const k = r*KAPPA;
  return 'M '+(cx-r)+' '+cy+
    ' C '+(cx-r)+' '+(cy-k)+' '+(cx-k)+' '+(cy-r)+' '+cx+' '+(cy-r)+
    ' C '+(cx+k)+' '+(cy-r)+' '+(cx+r)+' '+(cy-k)+' '+(cx+r)+' '+cy+
    ' C '+(cx+r)+' '+(cy+k)+' '+(cx+k)+' '+(cy+r)+' '+cx+' '+(cy+r)+
    ' C '+(cx-k)+' '+(cy+r)+' '+(cx-r)+' '+(cy+k)+' '+(cx-r)+' '+cy+' Z';
}
/* ⚠️ O `drawSvgPath` JA VIRA O EIXO Y — o caminho vai em coordenadas de cima
   para baixo, como a lista, e a origem e o topo da etiqueta. Inverter o sinal
   aqui tambem seria virar duas vezes: a seta saia 28 mm ACIMA da pagina, e o
   PDF abria normal, com o circulo preto e sem seta dentro. */
function traçar(pagina, d, cor){
  pagina.drawSvgPath(d, { x:0, y:A.altura*MM, color:TINTA(cor), borderWidth:0, scale:MM });
}

function desenhar(pagina, itens, fonte){
  for(const it of itens){
    if(it.tipo === 'ret'){
      pagina.drawRectangle({
        x: it.x*MM, y: deCima(it.y + it.altura),
        width: it.largura*MM, height: it.altura*MM, color: TINTA(it.cor)
      });
    } else if(it.tipo === 'circulo'){
      traçar(pagina, caminhoDoCirculo(it.cx, it.cy, it.raio), it.cor);
    } else if(it.tipo === 'poligono'){
      // pdf-lib nao tem poligono: o caminho e escrito a mao, que e o que o SVG
      // tambem faz. Os PONTOS continuam vindo da lista.
      traçar(pagina, it.pontos.map((p, i) => (i ? 'L ' : 'M ') + p[0] + ' ' + p[1]).join(' ') + ' Z', it.cor);
    } else if(it.tipo === 'texto'){
      /* A relacao entre a altura de MAIUSCULA (que e como o desenho fala) e o
         tamanho da fonte na Helvetica e 0,716 — a mesma constante que a tela
         usa. Duas constantes seriam duas letras de tamanhos diferentes. */
      const tam = it.cap / 0.716 * MM;
      const y = deCima(it.base);
      if(!it.espaco){
        pagina.drawText(it.texto, { x: it.x*MM, y, size: tam, font: fonte, color: TINTA(it.cor) });
      } else {
        // Letra a letra, porque o PDF nao tem espacamento entre caracteres —
        // e o espacamento esta na LISTA, entao ele vale para os dois lados.
        let x = it.x*MM;
        for(const ch of String(it.texto)){
          pagina.drawText(ch, { x, y, size: tam, font: fonte, color: TINTA(it.cor) });
          x += fonte.widthOfTextAtSize(ch, tam) + it.espaco*MM;
        }
      }
    }
  }
}

module.exports = { gerar, conferir, MAX, PONTOS_POR_MM, MM };
