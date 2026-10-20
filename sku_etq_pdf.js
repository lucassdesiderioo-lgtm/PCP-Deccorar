/* sku_etq_pdf.js — A ETIQUETA DE SKU NO PAPEL (100 x 35 mm, Zebra ZD220).
 *
 * ── POR QUE PDF, E NAO A PAGINA DO NAVEGADOR (20/10/2026) ───────────────────
 * Ate aqui a etiqueta de SKU (botao "etiqueta" no Cadastro de SKU) era uma
 * pagina HTML com `@page{size:100mm 35mm}` impressa pelo navegador. Ela so
 * encaixava no rolo quando quem imprimia acertava margens "Nenhuma" e escala
 * 100% — TODA VEZ —; baixava o gerador de barras da internet a cada impressao
 * (sem internet, a etiqueta saia sem barras) e o `page-break-after` em toda
 * etiqueta podia soltar uma em branco no fim. E a mesma licao do sob medida
 * (`tecido/dominio/etiqueta_pdf.js`) e do kit (`kit_pdf.js`): a pagina NASCE no
 * tamanho da etiqueta, e quem imprime nao tem o que configurar.
 *
 * ⚠️ O QUE VAI ESCRITO NAO MUDOU, e e regra (§7): titulo, medida em metros,
 * M², cor, barras CODE128-B e o codigo por extenso — as mesmas frases da pagina
 * antiga. Persiana sem medida continua recusada; acessorio (modelo com
 * `exige_medida = 0`) sai com a descricao em destaque e sem M².
 *
 * ⚠️ AS BARRAS SAO DO `public/barras.js`, o mesmo arquivo que o sob medida e
 * o kit usam. Duas tabelas CODE128 seriam duas etiquetas diferentes para o
 * mesmo codigo, e a divergencia so apareceria no bipe.
 *
 * Travado pelo `teste_etiqueta_sku.js`, que le as barras de volta do PDF.
 */
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const barras = require('./public/barras.js');

const ETIQUETA = { largura:100, altura:35 };
const MM = 72 / 25.4;          // o PDF mede em pontos de 1/72 pol
const PT = 25.4 / 72;          // um ponto tipografico em mm
const CAP = 0.716;             // altura da maiuscula / tamanho, na Helvetica (a mesma do kit)
/* O teto do lote — o mesmo da tela antiga. Nao e limite tecnico: e a
   diferenca entre "errei uma etiqueta" e "errei o rolo". */
const MAX = 200;

/* A area onde se escreve: 2 mm dos lados e 1,5 mm em cima e embaixo, como a
   pagina antiga. A ZD220 nao imprime colado na borda do rolo. */
const LADO = 2, CIMA = 1.5, BAIXO = 1.5;
const LARGURA_UTIL = ETIQUETA.largura - 2*LADO;

/* As barras. Modulo e a barra fina. A 203 dpi um milimetro tem 8 pontos de
   impressao, e o modulo tem que cair em ponto INTEIRO — senao o rasterizador
   arredonda cada borda e as barras saem de larguras alternadas (§4, #31).
   Abaixo de 0,25 mm (2 pontos) o leitor passa a falhar em etiqueta amassada:
   codigo que so caberia assim e recusado, nao impresso ilegivel. O silencio
   de 10 modulos dos dois lados e o que deixa o leitor achar o comeco. */
const PONTOS_POR_MM = 8;
const MODULO_MIN = 0.25, MODULO_MAX = 0.5, SILENCIO = 10;
const BARRA_ALTURA = 9, BARRA_ALTURA_MIN = 6, BARRA_ATE_CODIGO = 0.8;

/* O que vai escrito — as mesmas frases da pagina antiga (index.html ate
   20/10/2026). Devolve { erro } quando a etiqueta nao pode sair. */
function conteudo(sku){
  const s = sku || {};
  const exigeMedida = (s.exige_medida === undefined || s.exige_medida === null) ? 1 : s.exige_medida;
  const temMedida = (s.largura_cm != null && s.altura_cm != null);
  if(exigeMedida && !temMedida)
    return { erro:'Este SKU não tem medida cadastrada. Abra a aba "Pendências de SKU" ou edite o produto '+
                   'e preencha largura e altura antes de imprimir.' };
  const cor = s.cor_codigo || '';
  const desc = String(s.descricao || '').trim();
  if(temMedida){
    const L = (s.largura_cm/100).toFixed(2), A = (s.altura_cm/100).toFixed(2);
    const m2 = ((s.largura_cm/100)*(s.altura_cm/100)).toFixed(2);
    /* Sem descricao, o titulo usa o TECIDO cadastrado; "BLACKOUT" so quando o
       SKU nao tem tecido nenhum — como na pagina antiga. */
    return { codigo:s.codigo, comMedida:true,
      titulo:'ROLO SOBRE MEDIDA - '+(desc || ((s.tecido_nome || 'BLACKOUT')+' ML '+cor)),
      destaque:L+' X '+A,
      info:'M² '+m2+(cor ? ' · '+cor : '') };
  }
  /* Sem medida, o destaque e a descricao — e ela que diz o que a pessoa tem na
     mao ("Kit 32 mm completo"). Sem M²: area de acessorio nao existe, e
     "M² 0.00" seria um numero falso na etiqueta. */
  return { codigo:s.codigo, comMedida:false,
    titulo:String(s.modelo_nome || '').trim() || 'ACESSORIO',
    destaque:desc || s.codigo,
    info:cor };
}

/* Quanto as barras ocupam, ou por que nao cabem. */
function medidaDasBarras(codigo){
  let bits;
  try{ bits = barras.modulos(codigo); }
  catch(e){ return { erro:'o código "'+codigo+'" tem caractere que o código de barras não aceita (só letras sem acento, números e sinais simples)' }; }
  const cabe = LARGURA_UTIL / (bits.length + 2*SILENCIO);
  const modulo = Math.min(MODULO_MAX, Math.floor(cabe*PONTOS_POR_MM)/PONTOS_POR_MM);
  if(modulo < MODULO_MIN)
    return { erro:'o código "'+codigo+'" é comprido demais para caber nas barras da etiqueta de '+
                  ETIQUETA.largura+' mm sem ficar ilegível para o leitor' };
  return { bits, modulo };
}

/* O que impede a impressao. Devolve a lista INTEIRA, como o kit: um problema
   por vez faz a pessoa corrigir, tentar e descobrir o seguinte. */
function conferir(sku, quantidade){
  const problemas = [];
  const c = conteudo(sku);
  if(c.erro) problemas.push(c.erro);
  else { const b = medidaDasBarras(c.codigo); if(b.erro) problemas.push(b.erro); }
  const q = Number(quantidade);
  if(!Number.isInteger(q) || q < 1) problemas.push('a quantidade tem que ser um número de 1 a '+MAX);
  else if(q > MAX) problemas.push('o máximo por vez são '+MAX+' etiquetas — divida em lotes');
  return { pronta: problemas.length === 0, problemas };
}

/* A Helvetica do PDF so escreve o que o WinAnsi tem. Uma seta ou um emoji na
   descricao derrubaria a impressao inteira; aqui o caractere sai, e o resto
   da etiqueta continua. */
function escrevivel(fonte, texto){
  let out = '';
  for(const ch of String(texto)){ try{ fonte.encodeText(ch); out += ch; }catch(e){} }
  return out.replace(/\s+/g,' ').trim();
}
const largura = (fonte, t, tam) => fonte.widthOfTextAtSize(t, tam) * PT;

/* Cabe em uma linha: encolhe ate o minimo; se nem assim couber, corta com
   reticencias — que avisam que tem mais, em vez de sumir com o fim calado. */
function umaLinha(fonte, texto, tamanhos, max){
  for(const tam of tamanhos) if(largura(fonte, texto, tam) <= max) return { linhas:[texto], tam };
  const tam = tamanhos[tamanhos.length-1];
  return { linhas:[cortar(fonte, texto, tam, max)], tam };
}
function cortar(fonte, texto, tam, max){
  let t = texto;
  while(t.length && largura(fonte, t+'…', tam) > max) t = t.slice(0,-1);
  return t.replace(/\s+$/,'')+'…';
}
/* Ate duas linhas, quebrando na palavra (a descricao do acessorio). */
function duasLinhas(fonte, texto, tamanhos, max){
  for(const tam of tamanhos){
    const l = quebrar(fonte, texto, tam, max);
    if(l.length <= 2) return { linhas:l, tam };
  }
  const tam = tamanhos[tamanhos.length-1];
  const l = quebrar(fonte, texto, tam, max);
  return { linhas:[l[0], cortar(fonte, l.slice(1).join(' '), tam, max)], tam };
}
function quebrar(fonte, texto, tam, max){
  const linhas = []; let atual = '';
  for(const p of texto.split(' ')){
    const t = atual ? atual+' '+p : p;
    if(largura(fonte, t, tam) <= max || !atual) atual = t;
    else { linhas.push(atual); atual = p; }
  }
  if(atual) linhas.push(atual);
  return linhas.map(l => largura(fonte, l, tam) <= max ? l : cortar(fonte, l, tam, max));
}

/* O DESENHO: a lista do que vai na etiqueta, em mm, medida de cima para
   baixo. O PDF so traduz esta lista — e o teste confere a lista e o PDF. */
async function desenho(sku, fonteDada){
  const c = conteudo(sku);
  if(c.erro) throw new Error(c.erro);
  const b = medidaDasBarras(c.codigo);
  if(b.erro) throw new Error(b.erro);
  const fonte = fonteDada || await (await PDFDocument.create()).embedFont(StandardFonts.HelveticaBold);

  const blocos = [];
  const texto = (t, tamanhos, duas) => {
    const limpo = escrevivel(fonte, t);
    if(!limpo) return;
    const r = duas ? duasLinhas(fonte, limpo, tamanhos, LARGURA_UTIL - 2) : umaLinha(fonte, limpo, tamanhos, LARGURA_UTIL);
    const cap = r.tam*CAP*PT, passo = r.tam*1.15*PT;
    blocos.push({ tipo:'texto', linhas:r.linhas, tam:r.tam, cap, passo, altura: cap + (r.linhas.length-1)*passo });
  };
  texto(c.titulo, [8, 7, 6]);
  if(c.comMedida) texto(c.destaque, [19, 16, 14]);
  else texto(c.destaque, [12, 11, 10], true);
  if(c.info) texto(c.info, [7.5, 6.5, 6]);
  const tamCodigo = 8, capCodigo = tamCodigo*CAP*PT;

  /* O vertical: os blocos de texto em cima, as barras e o codigo embaixo, e a
     sobra repartida por igual entre eles — o `space-between` da pagina antiga. */
  const util = ETIQUETA.altura - CIMA - BAIXO;
  const textoAltura = blocos.reduce((s,k) => s + k.altura, 0);
  let barra = BARRA_ALTURA;
  let sobra = util - textoAltura - barra - BARRA_ATE_CODIGO - capCodigo;
  if(sobra < 0){ barra = Math.max(BARRA_ALTURA_MIN, barra + sobra); sobra = util - textoAltura - barra - BARRA_ATE_CODIGO - capCodigo; }
  if(sobra < 0) throw new Error('o texto desta etiqueta não cabe em '+ETIQUETA.altura+' mm');
  const vao = sobra / blocos.length;   // um vao depois de cada bloco de texto

  const itens = [];
  let y = CIMA;
  for(const k of blocos){
    k.linhas.forEach((l, i) => {
      const w = largura(fonte, l, k.tam);
      itens.push({ tipo:'texto', texto:l, tam:k.tam, cap:k.cap, x:(ETIQUETA.largura - w)/2, base:y + k.cap + i*k.passo, largura:w });
    });
    y += k.altura + vao;
  }
  // as barras, centradas e no grid de pontos da impressora
  const m = b.modulo, larguraBarras = b.bits.length*m;
  const x0 = Math.round(((ETIQUETA.largura - larguraBarras)/2)*PONTOS_POR_MM)/PONTOS_POR_MM;
  for(let i=0; i<b.bits.length; ){
    if(b.bits[i] !== '1'){ i++; continue; }
    let j = i; while(j < b.bits.length && b.bits[j] === '1') j++;
    itens.push({ tipo:'ret', x:x0 + i*m, topo:y, largura:(j-i)*m, altura:barra });
    i = j;
  }
  const cod = escrevivel(fonte, c.codigo), wc = largura(fonte, cod, tamCodigo);
  itens.push({ tipo:'texto', texto:cod, tam:tamCodigo, cap:capCodigo, x:(ETIQUETA.largura - wc)/2,
               base:y + barra + BARRA_ATE_CODIGO + capCodigo, largura:wc });
  return { itens, modulo:m };
}

/* Uma pagina por etiqueta, todas iguais: o rolo da ZD220 e continuo, e a
   pagina do tamanho exato faz a impressora avancar exatamente uma. */
async function gerar(sku, quantidade){
  const v = conferir(sku, quantidade);
  if(!v.pronta){ const e = new Error(v.problemas[0]); e.problemas = v.problemas; throw e; }
  const doc = await PDFDocument.create();
  doc.setTitle('Etiqueta ' + sku.codigo);
  const fonte = await doc.embedFont(StandardFonts.HelveticaBold);
  const { itens } = await desenho(sku, fonte);
  const preto = rgb(0,0,0);
  for(let n=0; n<Number(quantidade); n++){
    const pag = doc.addPage([ETIQUETA.largura*MM, ETIQUETA.altura*MM]);
    for(const it of itens){
      if(it.tipo === 'ret')
        pag.drawRectangle({ x:it.x*MM, y:(ETIQUETA.altura - it.topo - it.altura)*MM,
                            width:it.largura*MM, height:it.altura*MM, color:preto });
      else
        pag.drawText(it.texto, { x:it.x*MM, y:(ETIQUETA.altura - it.base)*MM, size:it.tam, font:fonte, color:preto });
    }
  }
  return Buffer.from(await doc.save());
}

module.exports = { conteudo, conferir, desenho, gerar, MAX, ETIQUETA };
