/* teste_qr.js — o QR da previa da etiqueta do kit (spec GERADOR-ETIQUETA-KIT).
 *
 * ⚠️ ESTE TESTE NAO OLHA SE O DESENHO "PARECE UM QR". Um QR quase certo tem
 * exatamente a mesma cara de um QR certo — o erro aparece no celular de outra
 * pessoa, semanas depois, com o rolo de etiquetas ja colado nas caixas. Entao
 * aqui ele e LIDO DE VOLTA:
 *
 *   1. um decodificador, escrito neste arquivo, tira a mascara pelo formato
 *      gravado na propria matriz, desentrelaca os blocos e exige o texto
 *      original de volta — o mesmo caminho que um leitor faz;
 *   2. a paridade Reed-Solomon e conferida pela propriedade matematica dela
 *      (a mensagem inteira avaliada nas raizes do gerador tem que dar zero),
 *      que e independente de como ela foi calculada;
 *   3. os padroes fixos e o formato sao conferidos posicao a posicao.
 *
 * O decodificador ser independente e o ponto: se ele copiasse o codificador,
 * os dois errariam juntos e o teste passaria.
 *
 * Rode:  node teste_qr.js
 */
const QR = require('./public/qr.js');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

// ── O DECODIFICADOR, escrito aqui e so aqui ──────────────────────────────
/* ⚠️ ESTA LEITURA É ESCRITA PELA REGRA DO PADRÃO, DE PROPÓSITO — e é a lição
   mais cara deste arquivo.
   Até 17/09/2026 ela relia o formato do mesmo jeito que o `qr.js` o gravava. O
   gerador escrevia os 15 bits na ordem invertida, o teste os lia invertidos
   também, e os dois concordavam: 31 casos verdes e NENHUM celular lendo o QR.
   Um teste que reusa a convenção do código que ele testa não testa nada — ele
   pergunta a si mesmo.
   As duas cópias, como o padrão manda (as posições NÃO são simétricas):
     vertical (coluna 8):  bit 0..5 → linha i · 6,7 → linha i+1 · 8..14 → tam-15+i
     horizontal (linha 8): bit 0..7 → coluna tam-1-i · 8 → coluna 7 · 9..14 → 14-i */
function lerFormatoPadrao(m, horizontal){
  const t = m.length;
  let f = 0;
  for(let i=0;i<15;i++){
    let b;
    if(horizontal){
      if(i < 8)        b = m[8][t-1-i];
      else if(i === 8) b = m[8][7];
      else             b = m[8][14-i];
    } else {
      if(i < 6)      b = m[i][8];
      else if(i < 8) b = m[i+1][8];
      else           b = m[t-15+i][8];
    }
    if(b) f |= (1<<i);
  }
  const cru = f;
  f ^= 0x5412;                       // desfaz o XOR do padrao
  const dado = f >> 10;
  // confere o BCH: o resto da divisao tem que ser o que esta gravado
  let resto = (dado << 10);
  for(let i=14;i>=10;i--) if((resto>>i)&1) resto ^= 0x537 << (i-10);
  return { cru, nivel: dado >> 3, mascara: dado & 0b111, bchOk: (f & 0x3FF) === resto };
}
function lerFormato(m){ return lerFormatoPadrao(m, false); }
function mascarar(i,j,k){
  switch(k){
    case 0: return (i+j)%2===0;
    case 1: return i%2===0;
    case 2: return j%3===0;
    case 3: return (i+j)%3===0;
    case 4: return (Math.floor(i/2)+Math.floor(j/3))%2===0;
    case 5: return ((i*j)%2+(i*j)%3)===0;
    case 6: return (((i*j)%2+(i*j)%3)%2)===0;
    default: return ((((i+j)%2)+((i*j)%3))%2)===0;
  }
}
function decodificar(m){
  const tam = m.length, v = (tam-17)/4;
  const info = QR.VERSOES[v], reservadas = QR.reservadasDe(v);
  const { mascara, nivel, bchOk } = lerFormato(m);

  // 1. tira a mascara e le os bits no mesmo zigue-zague
  const limpa = m.map((l,i) => l.map((c,j) => (!reservadas[i][j] && mascarar(i,j,mascara)) ? (c^1) : c));
  let bits = '';
  let subindo = true;
  for(let c = tam-1; c > 0; c -= 2){
    if(c === 6) c--;
    for(let k = 0; k < tam; k++){
      const l = subindo ? tam-1-k : k;
      for(const cc of [c, c-1]) if(!reservadas[l][cc]) bits += limpa[l][cc] ? '1' : '0';
    }
    subindo = !subindo;
  }
  const todos = [];
  for(let i=0; i+8 <= bits.length; i+=8) todos.push(parseInt(bits.substr(i,8),2));

  // 2. desentrelaca: refaz os blocos na ordem em que o codificador os teceu
  const tamanhos = [];
  info.blocos.forEach(([quantos,t]) => { for(let i=0;i<quantos;i++) tamanhos.push(t); });
  const blocos = tamanhos.map(() => []), ecs = tamanhos.map(() => []);
  let p = 0;
  const maior = Math.max(...tamanhos);
  for(let i=0;i<maior;i++) tamanhos.forEach((t,b) => { if(i<t) blocos[b].push(todos[p++]); });
  for(let i=0;i<info.ec;i++) tamanhos.forEach((t,b) => ecs[b].push(todos[p++]));

  // 3. le o cabecalho e os bytes
  let fluxo = '';
  blocos.forEach(b => b.forEach(x => { fluxo += x.toString(2).padStart(8,'0'); }));
  const modo = parseInt(fluxo.substr(0,4), 2);
  const bitsContador = v >= 10 ? 16 : 8;
  const quantos = parseInt(fluxo.substr(4, bitsContador), 2);
  const bytes = [];
  for(let i=0;i<quantos;i++) bytes.push(parseInt(fluxo.substr(4+bitsContador+i*8, 8), 2));
  const texto = Buffer.from(bytes).toString('utf8');
  return { texto, modo, nivel, mascara, bchOk, versao: v, blocos, ecs };
}
// A paridade esta certa se a mensagem inteira zera nas raizes do gerador.
// Nao repete a conta do codificador — pergunta outra coisa.
function paridadeFecha(dados, ec){
  const msg = dados.concat(ec);
  for(let i=0;i<ec.length;i++){
    let acc = 0;
    // avalia o polinomio em a^i (Horner, em GF(256))
    msg.forEach(c => { acc = QR.mul(acc, QR.EXP[i]) ^ c; });
    if(acc !== 0) return false;
  }
  return true;
}

const LINK = 'https://drive.google.com/drive/folders/1H8Pe8XngnQChRFoJ1MBl7Ni4hi3HGHqb';
const LINK_LONGO = LINK + '?usp=drive_link';

console.log('\n── 1. o texto volta inteiro (o caminho do leitor) ──');
[['KITINSTALACAO', 'o codigo do kit'],
 [LINK, 'o link do Drive'],
 [LINK_LONGO, 'o link com ?usp=drive_link'],
 ['a', 'um caractere so'],
 ['SEU MANUAL ESTÁ AQUI', 'com acento (UTF-8)'],
 ['x'.repeat(200), '200 caracteres (versao alta)']
].forEach(([texto, desc]) => {
  const d = decodificar(QR.modulos(texto));
  eq('volta o mesmo texto — ' + desc, d.texto, texto);
});

console.log('\n── 2. o FORMATO contra a tabela PUBLICADA do padrao ──');
/* ⚠️ O CASO QUE FALTAVA, E QUE CUSTOU TRÊS RODADAS.
   Os 15 bits do formato do nivel M sao valores FIXOS e publicados no padrao,
   um por mascara. Eles nao dependem de nada deste projeto — e e exatamente por
   isso que estao aqui: sao a unica coisa neste arquivo que o `qr.js` nao pode
   influenciar. Se o gerador mudar de ideia sobre como monta o formato, estes
   oito numeros nao mudam junto. */
const FORMATO_M = [0x5412, 0x5125, 0x5E7C, 0x5B4B, 0x45F9, 0x40CE, 0x4F97, 0x4AA0];
/* As oito de uma vez, sem depender de qual mascara o gerador escolheu: o valor
   gravado na matriz tem que ser o da TABELA para a mascara que ele diz ter
   usado — nas DUAS copias, que e o que um leitor com a etiqueta rasgada usa. */
[['KITINSTALACAO',1], ['https://www.google.com',2], [LINK,5], ['x'.repeat(100),7]]
  .forEach(([txt, versao]) => {
    const m = QR.modulos(txt, { versao });
    const vert = lerFormatoPadrao(m, false), horiz = lerFormatoPadrao(m, true);
    ok('v'+versao+': o formato gravado e o valor PUBLICADO da mascara '+vert.mascara,
      vert.cru === FORMATO_M[vert.mascara],
      'gravado 0x' + vert.cru.toString(16) + ', tabela 0x' + (FORMATO_M[vert.mascara]||0).toString(16));
    ok('v'+versao+': a segunda copia diz o MESMO (etiqueta rasgada le a outra)',
      horiz.cru === vert.cru,
      'vertical 0x'+vert.cru.toString(16)+' × horizontal 0x'+horiz.cru.toString(16));
    ok('v'+versao+': nivel M (00) e BCH fechando nas duas copias',
      vert.nivel === 0 && vert.bchOk && horiz.bchOk);
  });
/* E a afirmacao exata que estava errada, escrita como caso para nunca voltar:
   o modulo (8,0) carrega o bit 14 do formato, nao o bit 0. */
{
  const m = QR.modulos('TESTE', { versao:1 });
  const f = lerFormatoPadrao(m, false).cru;
  eq('o modulo (8,0) carrega o bit 14 do formato — nao o bit 0',
    m[8][0], (f >> 14) & 1);
  eq('e o modulo sempre escuro (tam-8,8) NAO e area de formato', m[m.length-8][8], 1);
}

console.log('\n── 3. o cabecalho e o formato ──');
let d = decodificar(QR.modulos(LINK));
eq('modo byte (0100)', d.modo, 0b0100);
eq('nivel de correcao M (00)', d.nivel, 0b00);
ok('o BCH do formato fecha', d.bchOk);
ok('a mascara gravada e uma das oito', d.mascara >= 0 && d.mascara <= 7);
/* As duas copias do formato tem que dizer a MESMA coisa: leitor que so enxerga
   um canto (etiqueta rasgada, dedo em cima) le a outra. As DUAS pela regra do
   padrao — era aqui que a convencao torta passava despercebida. */
const m1 = QR.modulos(LINK);
eq('as duas copias do formato concordam',
  lerFormatoPadrao(m1, true).cru, lerFormatoPadrao(m1, false).cru);

console.log('\n── 3. a correcao de erro fecha sozinha ──');
d = decodificar(QR.modulos(LINK));
ok('todos os blocos zeram nas raizes do gerador',
  d.blocos.every((b,i) => paridadeFecha(b, d.ecs[i])),
  'blocos: ' + d.blocos.length);
/* Uma versao de cada forma de repartir bloco — a v8 tem blocos de tamanhos
   DIFERENTES, que e onde o entrelacamento costuma quebrar. */
[[3,'um bloco so'],[4,'dois blocos iguais'],[6,'quatro blocos'],
 [8,'blocos de tamanhos diferentes'],[9,'3+2 blocos'],[10,'4+1 e contador de 16 bits']
].forEach(([v, desc]) => {
  const texto = 'D'.repeat(QR.cabem(v));
  const dd = decodificar(QR.modulos(texto, {versao:v}));
  ok('v'+v+' ('+desc+'): texto inteiro e paridade fechando',
    dd.texto === texto && dd.blocos.every((b,i) => paridadeFecha(b, dd.ecs[i])),
    'versao lida ' + dd.versao);
});

console.log('\n── 4. os padroes fixos ──');
const m = QR.modulos(LINK);
const tam = m.length;
const finderOk = (l,c) => {
  for(let i=0;i<7;i++) for(let j=0;j<7;j++){
    const borda = (i===0||i===6||j===0||j===6);
    const miolo = (i>=2&&i<=4&&j>=2&&j<=4);
    if(m[l+i][c+j] !== ((borda||miolo)?1:0)) return false;
  }
  return true;
};
ok('os tres finders estao inteiros', finderOk(0,0) && finderOk(0,tam-7) && finderOk(tam-7,0));
ok('nao ha finder no quarto canto (e assim que o leitor sabe a orientacao)',
  !finderOk(tam-7,tam-7));
let timingOk = true;
for(let i=8;i<tam-8;i++) if(m[6][i] !== (i%2===0?1:0) || m[i][6] !== (i%2===0?1:0)) timingOk = false;
ok('as duas linhas de timing alternam', timingOk);
eq('o modulo sempre escuro esta la', m[tam-8][8], 1);
ok('o silencio nao entra na matriz (quem poe e o SVG)', m.every(l => l.length === tam));

console.log('\n── 5. a versao: a MENOR que couber ──');
/* Versao menor = modulo maior no papel. Numa etiqueta de 35 mm e isso que
   decide se o leitor acha o QR — por isso nunca se arredonda para cima. */
eq('13 caracteres cabem na versao 1', QR.versaoPara('KITINSTALACAO'), 1);
eq('o link do Drive (68 chars) pede a versao 5', QR.versaoPara(LINK), 5);
eq('com ?usp=drive_link (83 chars) sobe para a versao 6', QR.versaoPara(LINK_LONGO), 6);
ok('cada versao aceita o tamanho que promete e recusa um a mais',
  [1,2,3,4,5,6,7,8,9,10].every(v => {
    const cabe = QR.cabem(v);
    const acima = QR.versaoPara('x'.repeat(cabe+1));
    // na ultima versao "um a mais" nao sobe de versao: nao cabe em nenhuma
    return QR.versaoPara('x'.repeat(cabe)) <= v && (v === QR.MAIOR ? acima === null : acima > v);
  }));
eq('texto grande demais devolve null, nunca um QR torto', QR.versaoPara('x'.repeat(300)), null);
ok('...e pedir para desenhar esse texto LANCA, em vez de devolver meia etiqueta',
  (()=>{ try{ QR.modulos('x'.repeat(300)); return false; }catch(e){ return true; } })());

console.log('\n── 6. o mesmo texto sempre desenha o mesmo QR ──');
/* Previa que muda de desenho a cada tecla faria o Admin achar que o QR e
   aleatorio — e esconderia a diferenca entre "mudou o link" e "mudou o
   desenho". A escolha de mascara e por penalidade, entao e deterministica. */
const a = QR.modulos(LINK).map(l=>l.join('')).join('|');
const b = QR.modulos(LINK).map(l=>l.join('')).join('|');
eq('duas chamadas, o mesmo desenho', a, b);
ok('link diferente, QR diferente', a !== QR.modulos(LINK_LONGO).map(l=>l.join('')).join('|'));

console.log('\n' + (falhas ? falhas + ' FALHA(S) em ' + n + ' casos' : 'todos os ' + n + ' casos passaram'));
process.exit(falhas ? 1 : 0);
