/* Leitura da planilha de vendas do Mercado Livre (Fase 1 do planejamento).
 *
 * Sem dependencia nova: o deploy aqui e "git pull + pm2 restart", sem
 * npm install (CLAUDE.md secao 13). Um require('xlsx') derrubaria o server
 * inteiro num boot sem a lib instalada. Entao o .xlsx e lido com os modulos
 * nativos do Node: .xlsx e um ZIP de XML, e o zlib faz o inflate.
 *
 * Exporta lerPlanilha(buffer) -> array de linhas, cada linha um array de
 * strings por coluna (indice 0 = coluna A). Aceita tambem .csv como
 * alternativa (mesmo formato de saida), util para conferencia rapida.
 */
const zlib = require('zlib');

/* ---- ZIP: le o diretorio central e devolve {nome: Buffer} ---- */
function descompactar(buf){
  const EOCD = 0x06054b50;            // fim do diretorio central
  let p = -1;
  for(let i = buf.length - 22; i >= 0; i--){
    if(buf.readUInt32LE(i) === EOCD){ p = i; break; }
  }
  if(p < 0) throw new Error('arquivo nao parece um .xlsx (zip) valido');
  const total = buf.readUInt16LE(p + 10);
  let off = buf.readUInt32LE(p + 16);
  const arquivos = {};
  for(let n = 0; n < total; n++){
    if(buf.readUInt32LE(off) !== 0x02014b50) break; // assinatura de entrada
    const metodo   = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen  = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commLen  = buf.readUInt16LE(off + 32);
    const loff     = buf.readUInt32LE(off + 42); // offset do cabecalho local
    const nome     = buf.toString('utf8', off + 46, off + 46 + nameLen);
    // o cabecalho local traz seus proprios tamanhos de nome/extra; os dados
    // comecam depois deles. Uso o compSize do diretorio central (confiavel
    // mesmo quando o header local vem com data descriptor / tamanhos zerados).
    const lNameLen  = buf.readUInt16LE(loff + 26);
    const lExtraLen = buf.readUInt16LE(loff + 28);
    const dstart = loff + 30 + lNameLen + lExtraLen;
    const dados = buf.slice(dstart, dstart + compSize);
    arquivos[nome] = metodo === 0 ? dados : zlib.inflateRawSync(dados);
    off += 46 + nameLen + extraLen + commLen;
  }
  return arquivos;
}

/* ---- XML: utilidades minimas ---- */
function decodeEntidades(s){
  return String(s)
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
function textoDeT(bloco){
  // concatena todo <t ...>...</t> dentro do bloco (trata <r><t>..</t></r>)
  let out = '';
  const re = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let m;
  while((m = re.exec(bloco))) out += m[1];
  return decodeEntidades(out);
}

/* ---- sharedStrings.xml -> array de strings ---- */
function lerSharedStrings(xml){
  if(!xml) return [];
  const s = xml.toString('utf8');
  const arr = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while((m = re.exec(s))) arr.push(textoDeT(m[1]));
  return arr;
}

/* ---- coluna "W23" -> indice 22 ---- */
function colParaIndice(ref){
  const letras = ref.replace(/[0-9]+$/, '');
  let n = 0;
  for(let i = 0; i < letras.length; i++) n = n * 26 + (letras.charCodeAt(i) - 64);
  return n - 1;
}

/* ---- worksheet -> array de linhas (arrays de string) ---- */
function lerPlanilhaXml(xml, shared){
  const s = xml.toString('utf8');
  const linhas = [];
  const reRow = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let mr;
  while((mr = reRow.exec(s))){
    const corpo = mr[1];
    const cols = [];
    const reC = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let mc;
    while((mc = reC.exec(corpo))){
      const attrs = mc[1] || '';
      const inner = mc[2] || '';
      const refM = attrs.match(/\br="([A-Z]+)\d+"/);
      const idx = refM ? colParaIndice(refM[1]) : cols.length;
      const tM = attrs.match(/\bt="([^"]+)"/);
      const tipo = tM ? tM[1] : 'n';
      let valor = '';
      if(tipo === 'inlineStr'){
        valor = textoDeT(inner);
      } else {
        const vM = inner.match(/<v[^>]*>([\s\S]*?)<\/v>/);
        const bruto = vM ? vM[1] : '';
        if(tipo === 's'){ valor = shared[+bruto] || ''; }
        else { valor = decodeEntidades(bruto); }
      }
      cols[idx] = valor;
    }
    for(let i = 0; i < cols.length; i++) if(cols[i] == null) cols[i] = '';
    linhas.push(cols);
  }
  return linhas;
}

/* ---- CSV simples (aspas + virgula/ponto-e-virgula) ---- */
function lerCsv(txt){
  const sep = (txt.split('\n')[0].match(/;/g) || []).length >
              (txt.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  for(let i = 0; i < txt.length; i++){
    const c = txt[i];
    if(aspas){
      if(c === '"'){ if(txt[i+1] === '"'){ campo += '"'; i++; } else aspas = false; }
      else campo += c;
    } else {
      if(c === '"') aspas = true;
      else if(c === sep){ linha.push(campo); campo = ''; }
      else if(c === '\n'){ linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
      else if(c === '\r'){ /* ignora */ }
      else campo += c;
    }
  }
  if(campo.length || linha.length){ linha.push(campo); linhas.push(linha); }
  return linhas;
}

/* ---- entrada principal ---- */
function lerPlanilha(buf){
  // .xlsx (e outros OOXML) comecam com "PK" (0x50 0x4b)
  if(buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b){
    const arq = descompactar(buf);
    const shared = lerSharedStrings(arq['xl/sharedStrings.xml']);
    // escolhe a primeira planilha (menor N em xl/worksheets/sheetN.xml)
    let alvo = null, menor = Infinity;
    for(const nome in arq){
      const m = nome.match(/^xl\/worksheets\/sheet(\d+)\.xml$/);
      if(m && +m[1] < menor){ menor = +m[1]; alvo = nome; }
    }
    if(!alvo) throw new Error('xlsx sem planilha de dados');
    return lerPlanilhaXml(arq[alvo], shared);
  }
  // fallback: CSV/TSV em texto
  return lerCsv(buf.toString('utf8'));
}

/* ---- datas ---- */
const MESES = { janeiro:1, fevereiro:2, marco:3, 'março':3, abril:4, maio:5,
  junho:6, julho:7, agosto:8, setembro:9, outubro:10, novembro:11, dezembro:12 };

function iso(y, m, d){
  return String(y).padStart(4,'0') + '-' + String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0');
}

// Data da venda: aceita serial do Excel, dd/mm/aaaa e ISO. Devolve 'aaaa-mm-dd' ou null.
function parseDataVenda(cel){
  if(cel == null) return null;
  const s = String(cel).trim();
  if(!s) return null;
  if(/^\d+(\.\d+)?$/.test(s)){                 // serial do Excel
    const serial = Math.floor(+s);
    if(serial > 0 && serial < 80000){
      const base = Date.UTC(1899, 11, 30);      // epoca do Excel
      const dt = new Date(base + serial * 86400000);
      return iso(dt.getUTCFullYear(), dt.getUTCMonth()+1, dt.getUTCDate());
    }
  }
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);   // ISO
  if(m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // dd/mm/aaaa
  if(m) return iso(+m[3], +m[2], +m[1]);
  // por extenso, como vem do ML: "14 de agosto de 2026 08:38 hs."
  m = s.toLowerCase().match(/(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/);
  if(m && MESES[m[2]]) return iso(+m[3], MESES[m[2]], +m[1]);
  const t = Date.parse(s);
  if(!isNaN(t)){ const dt = new Date(t); return iso(dt.getFullYear(), dt.getMonth()+1, dt.getDate()); }
  return null;
}

// Estado ("Para enviar no dia 17 de agosto") -> 'aaaa-mm-dd' futura, ou null.
// hojeRef e injetavel para teste; por padrao usa a data atual.
function parseDataEnvio(cel, hojeRef){
  if(cel == null) return null;
  const s = String(cel).toLowerCase();
  const m = s.match(/dia\s+(\d{1,2})\s+de\s+([a-zç]+)/);
  if(!m) return null;
  const dia = +m[1];
  const mes = MESES[m[2]];
  if(!mes || dia < 1 || dia > 31) return null;
  const hoje = hojeRef ? new Date(hojeRef) : new Date();
  let ano = hoje.getFullYear();
  let cand = new Date(ano, mes - 1, dia);
  // envio e sempre futuro/recente: se caiu muito no passado, e do ano que vem
  const diffDias = (cand - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) / 86400000;
  if(diffDias < -200){ ano++; cand = new Date(ano, mes - 1, dia); }
  return iso(cand.getFullYear(), cand.getMonth()+1, cand.getDate());
}

module.exports = { lerPlanilha, parseDataVenda, parseDataEnvio };
