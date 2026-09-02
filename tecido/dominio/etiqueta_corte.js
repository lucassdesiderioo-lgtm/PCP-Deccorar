// Le o PDF de etiquetas de producao (Decorsoft) e devolve as pecas a cortar.
//
// A etiqueta sai em QUATRO vias por item — BASE, COLEÇÃO, EMBALAGEM, PERFIL —
// e as quatro repetem o cabecalho. So a via COLEÇÃO interessa aqui, porque so
// ela traz a MEDIDA DO CORTE DO TECIDO:
//
//   4272-9                                   pedido - item
//   03/11                                    peca 3 das 11 do pedido
//   ROGERIO GOMES                            cliente
//   COLEÇÃO
//   ROLO SOB MEDIDA - SCREEN 1% BRANCO 3.00M
//   1.500  X  1.400                          a persiana ACABADA
//   SCREEN 1% BRANCO 3.00M                   o tecido
//   2.417 M2 - (1.465x1.650)                 <- O CORTE. E esta que o plano usa.
//
// UM ITEM PODE TER VARIAS PECAS. O pedido 4272 tem 11 persianas; o item -9
// tem duas iguais (03/11 e 04/11) e o -14 tem tres. Cada peca imprime o seu
// proprio jogo de vias, com codigo proprio no rodape. Por isso o leitor conta
// UMA PECA POR VIA COLEÇÃO — nunca uma por item.
//
// E o que agrupa para o TOM UNICO e o PEDIDO (4272), nao o item: as onze
// persianas sao da mesma casa e o cliente as ve lado a lado.
//
// A medida acabada NAO serve para cortar: a largura do tecido e menor que a
// da persiana montada (ponteiras e tubo entram na conta) e a altura e maior
// (sobra para enrolar no tubo e para a barra). Cortar pela medida acabada
// erraria as duas dimensoes, e para lados diferentes.
//
// Nao ha dependencia de PDF aqui: os fluxos do arquivo sao Flate (zlib, que
// vem no Node) e o texto e UTF-16BE. Uma biblioteca de PDF inteira para ler
// quatro campos seria peso sem troco.
const zlib=require('zlib');
const {ErroDeRegra,exigir}=require('../nucleo/erros');

// ── 1. o texto de dentro do PDF ──────────────────────────────────────────
function extrairTexto(buffer){
  const trechos=[];
  let i=0;
  while(true){
    const ini=buffer.indexOf('stream',i);
    if(ini<0) break;
    let p=ini+6;
    if(buffer[p]===0x0d) p++;
    if(buffer[p]===0x0a) p++;
    const fim=buffer.indexOf('endstream',p);
    if(fim<0) break;
    i=fim+9;
    let conteudo;
    try{ conteudo=zlib.inflateSync(buffer.slice(p,fim)); }catch(e){ continue; }
    if(conteudo.indexOf('Tj')<0&&conteudo.indexOf('TJ')<0) continue;
    lerStrings(conteudo).forEach(t=>trechos.push(t));
  }
  return trechos;
}

// As strings de um fluxo de conteudo: tudo entre parenteses, respeitando a
// barra invertida. O desescape acontece em BYTES — desescapar depois de
// decodificar quebraria o alinhamento do UTF-16 e embaralharia justamente a
// medida do corte, que vem entre parenteses escapados.
function lerStrings(buf){
  const saida=[];
  for(let i=0;i<buf.length;i++){
    if(buf[i]!==0x28) continue;               // (
    const bytes=[];
    let nivel=1, j=i+1;
    for(;j<buf.length;j++){
      const b=buf[j];
      if(b===0x5c){                            // barra invertida
        const s=buf[j+1];
        const octal=/[0-7]/.test(String.fromCharCode(s));
        if(octal){
          let d='';
          while(d.length<3&&/[0-7]/.test(String.fromCharCode(buf[j+1]))) d+=String.fromCharCode(buf[++j]);
          bytes.push(parseInt(d,8)&0xff);
        } else { bytes.push(s); j++; }
        continue;
      }
      if(b===0x28){ nivel++; bytes.push(b); continue; }
      if(b===0x29){ nivel--; if(!nivel) break; bytes.push(b); continue; }
      bytes.push(b);
    }
    saida.push(decodificar(Buffer.from(bytes)));
    i=j;
  }
  return saida;
}

// Texto do gerador vem em UTF-16BE (dois bytes por caractere), as vezes com
// marca de ordem. Sem esta conversao cada letra chega com um nulo colado.
function decodificar(b){
  if(b.length>=2&&b[0]===0xfe&&b[1]===0xff) return b.slice(2).swap16().toString('utf16le');
  let nulos=0;
  for(let i=0;i<b.length;i+=2) if(b[i]===0) nulos++;
  if(b.length>=4&&b.length%2===0&&nulos>b.length/4)
    return Buffer.from(b).swap16().toString('utf16le');
  return b.toString('latin1');
}

// ── 2. as pecas ──────────────────────────────────────────────────────────
const PEDIDO=/^\s*(\d{2,8})\s*-\s*(\d{1,3})\s*$/;      // 4272-9
const SEQUENCIA=/^\s*(\d{1,3})\s*\/\s*(\d{1,3})\s*$/;   // 03/11
const CORTE=/\((\d+[.,]?\d*)\s*[xX]\s*(\d+[.,]?\d*)\)/; // (1.465x1.650)
const ACABADA=/^\s*\d+[.,]\d+\s*$/;

// '1.465' e um metro e quarenta e seis e meio: o gerador usa ponto decimal
// com tres casas (milimetro). Nao e separador de milhar — 1.465 metros de
// persiana nao existe.
const numero=t=>Number(String(t).replace(',','.'));

function lerPecas(buffer){
  const linhas=extrairTexto(buffer).map(t=>t.replace(/\s+/g,' ').trim()).filter(Boolean);
  exigir(linhas.length,'arquivo_ilegivel',
    'Nao consegui ler texto neste arquivo. Ele e o PDF de etiquetas de producao?');

  // Cada via comeca no numero do pedido. Fatiar por ele separa as quatro
  // vias de um item e os itens entre si.
  const blocos=[];
  let atual=null;
  for(const l of linhas){
    if(PEDIDO.test(l)){ atual={pedido:l.match(PEDIDO)[1], item:l.match(PEDIDO)[2], linhas:[]}; blocos.push(atual); }
    else if(atual) atual.linhas.push(l);
  }

  const pecas=[];
  for(const b of blocos){
    // So a via COLEÇÃO tem a medida do corte. As outras tres repetem o
    // cabecalho e falariam de tubo, base e embalagem.
    const ehColecao=b.linhas.some(l=>/COLE[CÇ]/i.test(l));
    if(!ehColecao) continue;

    const linhaCorte=b.linhas.find(l=>CORTE.test(l)&&/M2/i.test(l))||b.linhas.find(l=>CORTE.test(l));
    if(!linhaCorte) continue;
    const m=linhaCorte.match(CORTE);
    const largura=numero(m[1]), altura=numero(m[2]);
    if(!(largura>0&&altura>0)) continue;

    // O cliente e a primeira linha com letras que nao e a sequencia nem a via.
    const cliente=b.linhas.find(l=>/[A-Za-zÀ-ÿ]/.test(l)&&!SEQUENCIA.test(l)&&
      !/COLE[CÇ]/i.test(l))||null;
    const seq=b.linhas.find(l=>SEQUENCIA.test(l));
    // O codigo proprio da peca, no rodape, antes do site.
    const iSite=b.linhas.findIndex(l=>/DECCORAR/i.test(l));
    const codigo=iSite>0?(b.linhas.slice(0,iSite).reverse().find(l=>/^\d{2,8}$/.test(l))||null):null;
    // O tecido: a linha do produto ou a que se repete logo antes da medida.
    const produto=b.linhas.find(l=>/SOB MEDIDA/i.test(l))||null;
    const idx=b.linhas.indexOf(linhaCorte);
    const tecidoTexto=(idx>0?b.linhas[idx-1]:null)||produto;

    // A medida acabada, so para conferencia na tela — nunca para cortar.
    const medidas=b.linhas.filter(l=>ACABADA.test(l)).map(numero);
    const acabada=medidas.length>=2?{largura:medidas[0],altura:medidas[1]}:null;

    pecas.push({
      // O PEDIDO e o que agrupa no tom unico. O item e a sequencia sao
      // identificacao, para o operador achar a etiqueta na bancada.
      pedido:b.pedido,
      item:b.item,
      pedido_item:b.pedido+'-'+b.item,
      sequencia:seq?seq.replace(/\s+/g,''):null,
      codigo,
      cliente, produto, tecido_texto:tecidoTexto,
      largura, altura, acabada,
      area:Math.round(largura*altura*1000)/1000
    });
  }

  exigir(pecas.length,'sem_colecao',
    'Li o arquivo mas nao achei nenhuma via COLEÇÃO com a medida do corte entre parenteses. Confira se e o PDF de etiquetas de producao.');
  return pecas;
}

// Sugere o tecido cadastrado que combina com o texto da etiqueta. E palpite
// para adiantar a tela: quem decide continua sendo o botao que o operador
// aperta.
function casarTecido(texto,tecidos){
  const limpo=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().replace(/[^A-Z0-9]/g,'');
  const alvo=limpo(texto);
  if(!alvo) return null;
  let melhor=null;
  for(const t of tecidos){
    if(!t.ativo) continue;
    const cor=limpo(t.cor_nome), ab=limpo(t.abertura_nome);
    if(!cor||!ab) continue;
    if(alvo.includes(cor)&&alvo.includes(ab)){
      const nota=cor.length+ab.length;
      if(!melhor||nota>melhor.nota) melhor={tecido:t,nota};
    }
  }
  return melhor?melhor.tecido:null;
}

module.exports={lerPecas, casarTecido, extrairTexto};
