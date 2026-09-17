// QR (modelo 2, modo byte, correcao M) em SVG, escrito aqui em vez de trazer
// biblioteca — pelo mesmo motivo do `barras.js` ao lado: a previa da etiqueta
// do kit roda sem CDN, e um gerador de QR cabe num arquivo que se le.
//
// ⚠️ QUEM DESENHA O QR IMPRESSO NAO E ESTE ARQUIVO. Na etiqueta que sai da
// ZD220 o QR e desenhado pela PROPRIA IMPRESSORA (ZPL `^BQ` com `^FDMA,<link>`)
// a partir do mesmo texto. Este arquivo serve a PREVIA. Por isso o que a previa
// prova e o CONTEUDO — que o link salvo virou QR e abre a pasta certa —, nunca
// o traco do papel. Um dia em que os dois discordem, o texto e a fonte unica: o
// `config.kit_etq_link`.
//
// A correcao e M (~15%) porque e o que a spec do gerador pediu, e porque o QR
// vai colado numa caixa que viaja: mancha e dobra comem modulo.
//
// Conferido pelo `teste_qr.js`, que nao "olha se parece certo": ele DECODIFICA
// de volta (tira a mascara, le o formato, desentrelaca os blocos) e exige o
// texto original, e confere a paridade Reed-Solomon pela propriedade
// matematica dela. QR que nao escaneia e QR que nao existe.
(function(){

// ── as tabelas do padrao, versoes 1 a 10, nivel M ────────────────────────
// dados      : codewords de DADOS da versao
// ec         : codewords de correcao POR BLOCO
// blocos     : [[quantos, codewords de dado em cada], ...]
// alinhamento: centros dos padroes de alinhamento
const VERSOES = {
  1:  { dados:16,  ec:10, blocos:[[1,16]],          alinhamento:[] },
  2:  { dados:28,  ec:16, blocos:[[1,28]],          alinhamento:[6,18] },
  3:  { dados:44,  ec:26, blocos:[[1,44]],          alinhamento:[6,22] },
  4:  { dados:64,  ec:18, blocos:[[2,32]],          alinhamento:[6,26] },
  5:  { dados:86,  ec:24, blocos:[[2,43]],          alinhamento:[6,30] },
  6:  { dados:108, ec:16, blocos:[[4,27]],          alinhamento:[6,34] },
  7:  { dados:124, ec:18, blocos:[[4,31]],          alinhamento:[6,22,38] },
  8:  { dados:154, ec:22, blocos:[[2,38],[2,39]],   alinhamento:[6,24,42] },
  9:  { dados:182, ec:22, blocos:[[3,36],[2,37]],   alinhamento:[6,26,46] },
  10: { dados:216, ec:26, blocos:[[4,43],[1,44]],   alinhamento:[6,28,50] }
};
// Bits sobrando depois dos codewords (o padrao manda enche-los de zero).
const RESTO = {1:0,2:7,3:7,4:7,5:7,6:7,7:0,8:0,9:0,10:0};
const MAIOR = 10;

// Quantos BYTES cabem numa versao: os codewords de dado menos o cabecalho
// (4 bits de modo + o contador, que passa de 8 para 16 bits na versao 10).
function cabem(v){
  const bitsContador = v >= 10 ? 16 : 8;
  return Math.floor((VERSOES[v].dados * 8 - 4 - bitsContador) / 8);
}
// A MENOR versao que aguenta o texto. Menor versao = modulo maior no papel,
// que e o que decide se o leitor acha o QR numa etiqueta de 35 mm.
function versaoPara(texto){
  const n = bytesDe(texto).length;
  for(let v=1; v<=MAIOR; v++) if(cabem(v) >= n) return v;
  return null;   // nao cabe: quem chama decide o que dizer (nunca inventa)
}
// UTF-8. O link e ASCII na pratica, mas acento colado num link nao pode virar
// byte torto em silencio.
function bytesDe(texto){
  const s = String(texto == null ? '' : texto);
  if(typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(s));
  return Array.from(Buffer.from(s, 'utf8'));
}

// ── GF(256), o corpo onde o Reed-Solomon vive ────────────────────────────
const EXP = new Array(512), LOG = new Array(256);
(function(){
  let x = 1;
  for(let i=0;i<255;i++){ EXP[i]=x; LOG[x]=i; x<<=1; if(x & 0x100) x^=0x11D; }
  for(let i=255;i<512;i++) EXP[i]=EXP[i-255];
})();
function mul(a,b){ return (a===0||b===0) ? 0 : EXP[LOG[a]+LOG[b]]; }

// Polinomio gerador de grau n: (x-a^0)(x-a^1)...(x-a^(n-1))
function gerador(n){
  let g = [1];
  for(let i=0;i<n;i++){
    const novo = new Array(g.length+1).fill(0);
    for(let j=0;j<g.length;j++){
      // g[0] e o coeficiente de MAIOR grau: multiplicar por x mantem o indice,
      // multiplicar pela raiz empurra um. Trocar estas duas linhas de lugar
      // gera o polinomio com os coeficientes invertidos — e o QR sai com
      // paridade errada, que nenhuma olhada no desenho acusa (so o leitor,
      // quando a etiqueta ja esta colada).
      novo[j] ^= g[j];
      novo[j+1] ^= mul(g[j], EXP[i]);
    }
    g = novo;
  }
  return g;
}
// O resto da divisao da mensagem pelo gerador — a paridade.
function paridade(dados, n){
  const g = gerador(n);
  const r = dados.concat(new Array(n).fill(0));
  for(let i=0;i<dados.length;i++){
    const c = r[i];
    if(!c) continue;
    for(let j=0;j<g.length;j++) r[i+j] ^= mul(g[j], c);
  }
  return r.slice(dados.length);
}

// ── texto -> codewords, ja entrelacados ──────────────────────────────────
function codewords(texto, v){
  const bytes = bytesDe(texto), info = VERSOES[v];
  if(bytes.length > cabem(v)) throw new Error('texto nao cabe na versao '+v);

  // 1. o fluxo de bits: modo byte (0100), contador, dados, terminador.
  let bits = '0100';
  bits += bytes.length.toString(2).padStart(v >= 10 ? 16 : 8, '0');
  bytes.forEach(b => { bits += b.toString(2).padStart(8,'0'); });
  const alvo = info.dados * 8;
  bits += '0'.repeat(Math.min(4, alvo - bits.length));   // terminador
  while(bits.length % 8) bits += '0';                     // fecha o byte

  const dados = [];
  for(let i=0;i<bits.length;i+=8) dados.push(parseInt(bits.substr(i,8),2));
  // 2. enchimento ate a capacidade, alternando os dois bytes do padrao.
  const ENCHER = [0xEC, 0x11];
  for(let i=0; dados.length < info.dados; i++) dados.push(ENCHER[i % 2]);

  // 3. reparte em blocos e calcula a paridade de cada um.
  const blocosDados = [], blocosEc = [];
  let p = 0;
  info.blocos.forEach(([quantos, tamanho]) => {
    for(let i=0;i<quantos;i++){
      const bloco = dados.slice(p, p+tamanho); p += tamanho;
      blocosDados.push(bloco);
      blocosEc.push(paridade(bloco, info.ec));
    }
  });

  // 4. ENTRELACA: primeiro byte de cada bloco, depois o segundo, e assim por
  //    diante — e so entao a paridade, do mesmo jeito. E isso que faz um
  //    borrao na etiqueta estragar um pedaco de cada bloco em vez de um bloco
  //    inteiro, que e onde a correcao desiste.
  const saida = [];
  const maiorDado = Math.max(...blocosDados.map(b => b.length));
  for(let i=0;i<maiorDado;i++) blocosDados.forEach(b => { if(i<b.length) saida.push(b[i]); });
  for(let i=0;i<info.ec;i++) blocosEc.forEach(b => saida.push(b[i]));
  return saida;
}

// ── a matriz ──────────────────────────────────────────────────────────────
const RESERVADO = 2;   // posicao de funcao: nunca recebe dado nem mascara

function novaMatriz(tam){
  const m = [];
  for(let i=0;i<tam;i++) m.push(new Array(tam).fill(null));
  return m;
}
function porFinder(m, linha, coluna){
  for(let i=-1;i<=7;i++) for(let j=-1;j<=7;j++){
    const l = linha+i, c = coluna+j;
    if(l<0||c<0||l>=m.length||c>=m.length) continue;
    const borda = (i===0||i===6) && j>=0 && j<=6;
    const lado  = (j===0||j===6) && i>=0 && i<=6;
    const miolo = i>=2 && i<=4 && j>=2 && j<=4;
    m[l][c] = (borda||lado||miolo) ? 1 : 0;
  }
}
function porAlinhamento(m, v){
  const centros = VERSOES[v].alinhamento, tam = m.length;
  for(const l of centros) for(const c of centros){
    // os tres cantos ja tem finder: alinhamento ali nao existe
    if((l===6&&c===6) || (l===6&&c===tam-7) || (l===tam-7&&c===6)) continue;
    for(let i=-2;i<=2;i++) for(let j=-2;j<=2;j++){
      const borda = Math.max(Math.abs(i),Math.abs(j));
      m[l+i][c+j] = (borda===1) ? 0 : 1;
    }
  }
}
function porFixos(m, v){
  const tam = m.length;
  porFinder(m, 0, 0); porFinder(m, 0, tam-7); porFinder(m, tam-7, 0);
  porAlinhamento(m, v);
  for(let i=8;i<tam-8;i++){ m[6][i] = (i%2===0)?1:0; m[i][6] = (i%2===0)?1:0; }
  m[tam-8][8] = 1;   // o modulo sempre escuro
  // as casas do formato ficam reservadas ate o fim (a mascara ainda nao foi escolhida)
  for(let i=0;i<9;i++){ if(m[8][i]===null) m[8][i]=RESERVADO; if(m[i][8]===null) m[i][8]=RESERVADO; }
  for(let i=0;i<8;i++){ if(m[8][tam-1-i]===null) m[8][tam-1-i]=RESERVADO; if(m[tam-1-i][8]===null) m[tam-1-i][8]=RESERVADO; }
  if(v >= 7){
    for(let i=0;i<18;i++){
      const l = Math.floor(i/3), c = i%3;
      m[tam-11+c][l] = RESERVADO; m[l][tam-11+c] = RESERVADO;
    }
  }
}
// Zigue-zague: duas colunas por vez, da direita para a esquerda, pulando a
// coluna 6 (o timing vertical mora nela).
function porDados(m, bytes, resto){
  const tam = m.length;
  let bits = '';
  bytes.forEach(b => { bits += b.toString(2).padStart(8,'0'); });
  bits += '0'.repeat(resto);
  let n = 0, subindo = true;
  for(let c = tam-1; c > 0; c -= 2){
    if(c === 6) c--;
    for(let k = 0; k < tam; k++){
      const l = subindo ? tam-1-k : k;
      for(const cc of [c, c-1]){
        if(m[l][cc] !== null) continue;
        m[l][cc] = (n < bits.length && bits[n] === '1') ? 1 : 0;
        n++;
      }
    }
    subindo = !subindo;
  }
}
function mascarar(i, j, n){
  switch(n){
    case 0: return (i+j)%2===0;
    case 1: return i%2===0;
    case 2: return j%3===0;
    case 3: return (i+j)%3===0;
    case 4: return (Math.floor(i/2)+Math.floor(j/3))%2===0;
    case 5: return ((i*j)%2 + (i*j)%3)===0;
    case 6: return (((i*j)%2 + (i*j)%3)%2)===0;
    default: return ((((i+j)%2) + ((i*j)%3))%2)===0;
  }
}
// Formato: 2 bits de nivel (M = 00) + 3 de mascara, com BCH(15,5) e o XOR do
// padrao — sem ele um QR todo branco teria formato valido.
function bitsDoFormato(mascara){
  const dado = (0b00 << 3) | mascara;
  let resto = dado << 10;
  for(let i=14;i>=10;i--) if((resto >> i) & 1) resto ^= 0x537 << (i-10);
  return ((dado << 10) | resto) ^ 0x5412;
}
function bitsDaVersao(v){
  let resto = v << 12;
  for(let i=17;i>=12;i--) if((resto >> i) & 1) resto ^= 0x1F25 << (i-12);
  return (v << 12) | resto;
}
function porFormato(m, mascara, v){
  const tam = m.length, f = bitsDoFormato(mascara);
  const bit = i => (f >> i) & 1;
  for(let i=0;i<=5;i++)  m[8][i] = bit(i);
  m[8][7] = bit(6); m[8][8] = bit(7); m[7][8] = bit(8);
  for(let i=9;i<=14;i++) m[14-i][8] = bit(i);
  // A segunda copia: SETE modulos na coluna de baixo e OITO na linha da
  // direita. Um a mais na vertical passa por cima do modulo sempre escuro
  // (m[tam-8][8]) — e um leitor que procura esse modulo desiste do QR.
  for(let i=0;i<=6;i++)  m[tam-1-i][8] = bit(i);
  for(let i=7;i<=14;i++) m[8][tam-15+i] = bit(i);
  if(v >= 7){
    const b = bitsDaVersao(v);
    for(let i=0;i<18;i++){
      const val = (b >> i) & 1, l = Math.floor(i/3), c = i%3;
      m[tam-11+c][l] = val; m[l][tam-11+c] = val;
    }
  }
}
// As quatro penalidades do padrao. Elas medem o que confunde leitor: listra
// longa, mancha quadrada, coisa parecida com finder no meio do dado, e
// desequilibrio entre claro e escuro.
function penalidade(m){
  const tam = m.length;
  let p = 0;
  const seq = (ler) => {
    for(let i=0;i<tam;i++){
      let corrida = 1;
      for(let j=1;j<tam;j++){
        if(ler(i,j) === ler(i,j-1)) corrida++;
        else { if(corrida >= 5) p += 3 + (corrida-5); corrida = 1; }
      }
      if(corrida >= 5) p += 3 + (corrida-5);
    }
  };
  seq((i,j)=>m[i][j]); seq((i,j)=>m[j][i]);
  for(let i=0;i<tam-1;i++) for(let j=0;j<tam-1;j++){
    const a = m[i][j];
    if(a===m[i][j+1] && a===m[i+1][j] && a===m[i+1][j+1]) p += 3;
  }
  const ALARME = ['1011101 0000','0000 1011101'].map(s=>s.replace(/ /g,''));
  const linha = (i,j)=>m[i][j], coluna = (i,j)=>m[j][i];
  [linha, coluna].forEach(ler => {
    for(let i=0;i<tam;i++){
      let s = '';
      for(let j=0;j<tam;j++) s += ler(i,j) ? '1' : '0';
      ALARME.forEach(a => {
        let de = 0;
        while((de = s.indexOf(a, de)) !== -1){ p += 40; de++; }
      });
    }
  });
  let escuros = 0;
  for(let i=0;i<tam;i++) for(let j=0;j<tam;j++) if(m[i][j]) escuros++;
  const pct = escuros * 100 / (tam*tam);
  p += Math.floor(Math.abs(pct-50)/5) * 10;
  return p;
}

/* Quais casas sao de FUNCAO (finder, timing, alinhamento, formato, versao) —
   as que nunca recebem dado nem mascara. O teste decodifica por esta mesma
   resposta: se ele tivesse a sua propria copia das posicoes, os dois estariam
   de acordo sobre um mapa que nenhum leitor de verdade usa. */
function reservadasDe(v){
  const m = novaMatriz(17 + 4*v);
  porFixos(m, v);
  return m.map(l => l.map(c => c !== null));
}

// Texto -> matriz de 0/1. E a saida pura: nao toca em `document`, e e por ela
// que o teste decodifica de volta.
function modulos(texto, opcoes){
  const o = opcoes || {};
  const v = o.versao || versaoPara(texto);
  if(!v) throw new Error('texto longo demais para um QR ate a versao '+MAIOR);
  const tam = 17 + 4*v;

  const base = novaMatriz(tam);
  porFixos(base, v);
  const reservadas = reservadasDe(v);
  porDados(base, codewords(texto, v), RESTO[v]);

  // Escolhe a mascara pela penalidade, como manda o padrao — mascara fixa
  // deixa QR com listra que certos leitores recusam.
  let melhor = null, melhorP = Infinity;
  for(let k=0;k<8;k++){
    const m = base.map(l => l.slice());
    for(let i=0;i<tam;i++) for(let j=0;j<tam;j++)
      if(!reservadas[i][j] && mascarar(i,j,k)) m[i][j] ^= 1;
    porFormato(m, k, v);
    const p = penalidade(m);
    if(p < melhorP){ melhorP = p; melhor = m; melhor.mascara = k; }
  }
  melhor.versao = v;
  return melhor;
}

// Desenha em SVG. `modulo` e o lado de um quadradinho, em px.
function svg(texto, opcoes){
  const o = opcoes || {};
  const m = modulos(texto, o);
  const modulo = o.modulo || 3, tam = m.length;
  // Silencio de 4 modulos dos dois lados: sem ele o leitor nao acha o QR.
  const silencio = (o.silencio === undefined ? 4 : o.silencio) * modulo;
  const lado = tam*modulo + silencio*2;

  const ns = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(ns, 'svg');
  el.setAttribute('viewBox', '0 0 '+lado+' '+lado);
  el.setAttribute('width', lado); el.setAttribute('height', lado);
  el.setAttribute('shape-rendering', 'crispEdges');

  const fundo = document.createElementNS(ns, 'rect');
  fundo.setAttribute('width', lado); fundo.setAttribute('height', lado);
  fundo.setAttribute('fill', '#fff');
  el.appendChild(fundo);

  // Junta os escuros vizinhos da linha num retangulo so — menos nos no SVG.
  for(let i=0;i<tam;i++){
    let j = 0;
    while(j < tam){
      if(m[i][j]){
        let k = j; while(k < tam && m[i][k]) k++;
        const r = document.createElementNS(ns, 'rect');
        r.setAttribute('x', silencio + j*modulo);
        r.setAttribute('y', silencio + i*modulo);
        r.setAttribute('width', (k-j)*modulo);
        r.setAttribute('height', modulo);
        r.setAttribute('fill', '#000');
        el.appendChild(r);
        j = k;
      } else j++;
    }
  }
  return el;
}

const api = { svg, modulos, versaoPara, cabem, codewords, bytesDe, reservadasDe,
              paridade, EXP, LOG, mul, VERSOES, RESTO, MAIOR };
if(typeof window !== 'undefined') window.qr = api;
if(typeof module !== 'undefined' && module.exports) module.exports = api;
})();
