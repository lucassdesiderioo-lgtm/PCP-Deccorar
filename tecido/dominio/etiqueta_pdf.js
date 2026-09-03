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

/* O TRACO DAS BARRAS, num lugar so. A etiqueta de sobra e a de rolo tem
   medidas diferentes e o MESMO desenho de codigo — duas copias divergiriam
   no dia em que alguem ajustasse uma delas, e a divergencia so apareceria no
   bipe de uma das duas.

   Barras vizinhas viram um retangulo so: menos objetos no PDF e menos chance
   de o rasterizador da impressora abrir uma fresta entre elas. */
// x0 e y chegam em PONTOS (ja convertidos); altura e modulo em MILIMETROS.
// A mistura e proposital: quem chama ja calculou a posicao no seu proprio
// layout, e as medidas da barra vem do cadastro, que fala em mm.
function desenharBarras(pagina, bits, {x0, y, altura, modulo}){
  let i = 0;
  while(i < bits.length){
    if(bits[i] === '1'){
      let j = i; while(j < bits.length && bits[j] === '1') j++;
      pagina.drawRectangle({
        x: x0 + i*modulo*MM, y,
        width: (j-i)*modulo*MM, height: altura*MM,
        color: rgb(0,0,0)
      });
      i = j;
    } else i++;
  }
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

  desenharBarras(pagina, bits, {x0, y:yBarra, altura:m.barra, modulo:mm});

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

/* ═══ A ETIQUETA DO ROLO ═══════════════════════════════════════════════════

   Outro objeto, outro uso, outros parametros — e nao um "reaproveita os da
   sobra", que faria mexer numa estragar a outra.

     sobra   colada na peca dobrada, lida DE PERTO, na mao
     rolo    colada DENTRO do tubo de papelao, lida DE LONGE, na estante

   Por isso o codigo do rolo nasce em 54 pt (contra 22 da sobra): quem procura
   o rolo esta a dois metros da prateleira, e chegar perto de cada tubo para
   ler o numero e o que faz o operador desistir e "pegar aquele que parece".

   ⚠️ O QUE VAI NA ETIQUETA E O QUE NAO MUDA DE LUGAR.
   O codigo, o tecido e a largura da bobina sao do rolo e viajam com ele. O
   ENDERECO nao entra: o tubo sai da estante e volta em outro buraco, e uma
   etiqueta colada dizendo "A-1-1" passaria a mentir no primeiro dia. Onde o
   rolo esta e pergunta para a tela, que sabe a resposta de agora. */
function medidasRolo(){
  return {
    largura: config.ler('etqRoloLargura'),
    altura:  config.ler('etqRoloAltura'),
    margem:  config.ler('etqRoloMargem'),
    barra:   config.ler('etqRoloBarra'),
    fonte:   config.ler('etqRoloFonte')
  };
}

// Quanto o miolo ocupa na vertical: barras, codigo grande e as tres linhas
// de apoio (tecido, bobina, metragem).
const APOIO_PT = 13;
const LINHAS_APOIO = 3;

function conferirRolo(m){
  const letra = m.fonte * PT_MM;
  const apoio = LINHAS_APOIO * (APOIO_PT * PT_MM + 1.5);
  const usado = m.margem + m.barra + RESPIRO_MM + letra + 2 + apoio + m.margem;
  const sobra = m.altura - usado;
  return {
    letra, apoio, usado, sobra, cabe: sobra >= 0,
    recado: 'Nao cabe na etiqueta de rolo de '+num(m.altura)+' mm: as barras ('+
      num(m.barra)+' mm), o codigo ('+num(letra)+' mm com fonte '+num(m.fonte)+
      ' pt), as tres linhas de apoio e as margens de '+num(m.margem)+
      ' mm somam '+num(usado)+' mm. Reduza a fonte do codigo ou use bobina mais alta.'
  };
}

/* `rolos` sao objetos com codigo, tecido (texto), largura e saldo. Quem monta
   esse texto e a rota — o dominio da etiqueta nao sabe juntar linha, colecao
   e cor, e nem deve: isso ja tem dono em dominio/tecido.js (`descrever`). */
async function gerarRolo(rolos){
  const lista = (rolos||[]).filter(r => r && String(r.codigo||'').trim());
  if(!lista.length)
    throw new ErroDeRegra('lote_vazio','Nao ha rolo nenhum para etiquetar.');

  const m = medidasRolo();
  const v = conferirRolo(m);
  if(!v.cabe) throw new ErroDeRegra('etiqueta_nao_cabe', v.recado);

  const doc = await PDFDocument.create();
  doc.setTitle('Etiquetas de rolo — tecido');
  const mono = await doc.embedFont(StandardFonts.CourierBold);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);

  for(const r of lista){
    const pagina = doc.addPage([m.largura*MM, m.altura*MM]);
    desenharRolo(pagina, r, m, mono, negrito, sans);
  }
  return Buffer.from(await doc.save());
}

function desenharRolo(pagina, rolo, m, mono, negrito, sans){
  const codigo = String(rolo.codigo).trim();
  const {mm} = moduloPara(codigo, m);
  const bits = barras.modulos(codigo);
  const silencio = 10 * mm;
  const larguraCodigo = (bits.length * mm) + 2*silencio;
  const utilTexto = (m.largura - 2*m.margem) * MM;
  const meio = m.largura*MM/2;

  // De cima para baixo: barras, codigo grande, depois as linhas de apoio.
  const yBarra = (m.altura - m.margem - m.barra) * MM;
  desenharBarras(pagina, bits, {
    x0: ((m.largura - larguraCodigo)/2 + silencio) * MM,
    y: yBarra, altura: m.barra, modulo: mm});

  // O CODIGO, do tamanho que der para ler da estante.
  let tam = m.fonte;
  while(tam > 8 && mono.widthOfTextAtSize(codigo, tam) > utilTexto) tam -= 1;
  const yCodigo = yBarra - RESPIRO_MM*MM - tam;
  pagina.drawText(codigo, {
    x: meio - mono.widthOfTextAtSize(codigo, tam)/2,
    y: yCodigo, size: tam, font: mono, color: rgb(0,0,0)
  });

  /* As linhas de apoio respondem "e este mesmo?" sem abrir a tela. Elas nao
     substituem o sistema — a metragem impressa envelhece no primeiro corte —
     e por isso a metragem sai marcada com a data de quando foi impressa.
     Numero sem data e numero que alguem vai usar achando que e de hoje. */
  const apoio = [
    String(rolo.tecido||'').trim(),
    'Bobina ' + num(rolo.largura) + ' m',
    rolo.saldo!=null ? ('Tinha ' + num(rolo.saldo) + ' m em ' + (rolo.impresso_em||'')) : ''
  ].filter(Boolean);

  let y = yCodigo - 6*MM;
  apoio.forEach((linha, i) => {
    const fonte = i===0 ? negrito : sans;
    let t = APOIO_PT;
    while(t > 6 && fonte.widthOfTextAtSize(linha, t) > utilTexto) t -= 0.5;
    pagina.drawText(linha, {
      x: meio - fonte.widthOfTextAtSize(linha, t)/2,
      y, size: t, font: fonte,
      color: i===0 ? rgb(0,0,0) : rgb(.35,.35,.35)
    });
    y -= (t * PT_MM + 1.5) * MM;
  });
}

module.exports = {gerar, gerarRolo, moduloPara, medidas, medidasRolo,
  conferir, conferirRolo, MODULO_MIN_MM, MODULO_MAX_MM};
