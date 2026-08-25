#!/usr/bin/env node
/* Rastreia uma venda do Mercado Livre pelo sistema inteiro.
 *
 *   node rastrear.js 2000014596231013 [outro numero...]
 *
 * Serve pra UMA pergunta: "o cliente reclamou — o que o sistema soube dessa
 * venda?". Mostra o volume no lote, os irmaos do mesmo pack/cliente, as
 * devolucoes ligadas, e — o passo que fecha o diagnostico — RELE o PDF de
 * origem e compara o que o Mercado Livre mandou com o que entrou no banco.
 *
 * SO LE. Nao grava, nao corrige, nao apaga. Pode rodar em producao.
 */
const fs=require('fs'), path=require('path');
const Database=require('better-sqlite3');

const DB=process.env.PCP_DB||'/opt/expedicao/dados.db';
const LOTES=process.env.PCP_LOTES||'/opt/expedicao/lotes';
const MAX_PDF=25;   // quantos PDFs recentes varrer quando o volume nao esta no banco

const alvos=process.argv.slice(2).map(s=>String(s).replace(/\D/g,'')).filter(Boolean);
if(!alvos.length){
  console.log('uso: node rastrear.js <numero da venda ou do pack> [mais numeros...]');
  process.exit(1);
}

const T=s=>console.log(s);
const linha=()=>T('─'.repeat(72));
const tit=s=>{ T(''); linha(); T(s); linha(); };

const db=new Database(DB,{readonly:true});

// ── 1. o que o banco sabe ───────────────────────────────────────────────────
function achar(num){
  return db.prepare(`SELECT * FROM lote
    WHERE venda=? OR packId=? OR codes LIKE ? ORDER BY id`).all(num,num,'%'+num+'%');
}
function mostrarVolume(v,pre){
  T((pre||'')+'#'+v.id+'  SKU '+(v.codigo||'(sem SKU)')+'  ·  '+(v.buyer||'')+
    '  ·  NF '+(v.nf||'—')+'  ·  '+v.estagio+
    (v.embalado_em?'  ·  impresso '+v.embalado_em:'')+
    (v.reimpressoes?'  ·  reimpressa '+v.reimpressoes+'x':''));
  T((pre||'')+'   pack '+(v.packId||'—')+'   venda '+(v.venda||'—')+'   data '+v.data);
}

tit('1. O QUE O BANCO SABE SOBRE OS NUMEROS INFORMADOS');
const achados=[], semRegistro=[];
for(const num of alvos){
  const rs=achar(num);
  if(!rs.length){ T(''); T(num+'  →  NAO EXISTE NO SISTEMA'); semRegistro.push(num); continue; }
  T('');
  T(num+'  →  '+rs.length+' volume(s)');
  rs.forEach(v=>{ mostrarVolume(v,'   '); achados.push(v); });
}

// ── 2. os irmaos: mesmo pack, mesmo cliente no mesmo dia ────────────────────
tit('2. OUTROS VOLUMES DO MESMO PACK / DO MESMO CLIENTE');
const packs=new Set(achados.map(v=>v.packId).filter(Boolean));
const chavesCli=new Set(achados.map(v=>v.buyer+'|'+v.data).filter(Boolean));
if(!packs.size && !chavesCli.size) T('(nada a comparar — nenhum volume achado no banco)');
for(const p of packs){
  const irmaos=db.prepare('SELECT * FROM lote WHERE packId=? ORDER BY id').all(p);
  T(''); T('pack '+p+' → '+irmaos.length+' volume(s) no banco');
  irmaos.forEach(v=>mostrarVolume(v,'   '));
}
for(const k of chavesCli){
  const [buyer,data]=k.split('|');
  const irmaos=db.prepare('SELECT * FROM lote WHERE buyer=? AND data=? ORDER BY id').all(buyer,data);
  T(''); T('cliente "'+buyer+'" em '+data+' → '+irmaos.length+' volume(s) no banco');
  irmaos.forEach(v=>mostrarVolume(v,'   '));
}

// ── 3. devolucoes ligadas ───────────────────────────────────────────────────
tit('3. DEVOLUCOES LIGADAS A ESSES NUMEROS');
let houve=false;
for(const num of alvos){
  const ds=db.prepare(`SELECT * FROM devolucao WHERE codigo_ml LIKE ? OR venda_id IN
      (SELECT id FROM lote WHERE venda=? OR packId=?)`).all('%'+num+'%',num,num);
  ds.forEach(d=>{ houve=true;
    T('');
    T('devolucao #'+d.id+' ('+d.data+')  cliente '+(d.buyer||'—'));
    T('   SKU que voltou (fisico): '+(d.sku_fisico||'—'));
    T('   SKU da venda           : '+(d.sku_venda||'—')+
      (d.sku_venda&&d.sku_fisico&&d.sku_venda!==d.sku_fisico?'   ← DIVERGENCIA':''));
    T('   destinacao: '+(d.destinacao||'—')+'   motivo: '+(d.motivo||'—'));
  });
}
if(!houve) T('(nenhuma)');

// ── 4. o PDF de origem: o que o ML mandou x o que entrou ────────────────────
function pageLines(tc){
  const items=tc.items.filter(it=>it.str&&it.str.trim()!=='');
  const rows={};
  for(const it of items){ const yb=Math.round(it.transform[5]/3)*3; (rows[yb]=rows[yb]||[]).push({x:it.transform[4],s:it.str}); }
  return Object.keys(rows).map(Number).sort((a,b)=>b-a)
    .map(y=>rows[y].sort((a,b)=>a.x-b.x).map(o=>o.s).join(' ').replace(/\s+/g,' ').trim());
}
/* Inspecao CRUA: lista tudo que o PDF traz, SEM a deduplicacao do parse.js.
   E essa diferenca — bruto x o que o parse aceita — que revela o problema. */
async function inspecionar(arquivo){
  const pdfjs=require('pdfjs-dist/legacy/build/pdf.js');
  const pdf=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(arquivo))}).promise;
  const etiquetas=[], ctrl=[];
  for(let p=1;p<=pdf.numPages;p++){
    const lines=pageLines(await (await pdf.getPage(p)).getTextContent());
    const text=lines.join('\n');
    if(/SKU:/.test(text)) ctrl.push(text);
    else if(/Pack ID:/.test(text)||/Venda:/.test(text)){
      const g=re=>{ const m=text.match(re); return m?m[1].replace(/\s+/g,''):null; };
      etiquetas.push({pagina:p,packId:g(/Pack ID:\s*([\d ]+)/),venda:g(/Venda:\s*([\d ]+)/),
                      nf:(text.match(/NF:\s*(\d+)/)||[])[1]||null});
    }
  }
  // blocos SKU da folha de controle, todos, na ordem em que aparecem
  const blocos=[], tok=/(Pack ID:\s*([\d ]+))|(Venda:\s*([\d ]+))|(SKU:\s*(\S+))/g;
  const texto=ctrl.join('\n'); let m,pk=null,vd=null;
  while((m=tok.exec(texto))){
    if(m[2])pk=m[2].replace(/\s+/g,'');
    else if(m[4])vd=m[4].replace(/\s+/g,'');
    else if(m[6]){ blocos.push({packId:pk,venda:vd,sku:m[6].trim()}); pk=null; vd=null; }
  }
  return {etiquetas,blocos,paginas:pdf.numPages};
}
function pdfsRecentes(){
  try{
    return fs.readdirSync(LOTES).filter(f=>/\.pdf$/i.test(f))
      .map(f=>({f:path.join(LOTES,f),t:fs.statSync(path.join(LOTES,f)).mtimeMs}))
      .sort((a,b)=>b.t-a.t).slice(0,MAX_PDF).map(o=>o.f);
  }catch(e){ return []; }
}

(async()=>{
  tit('4. O PDF DE ORIGEM — O QUE O MERCADO LIVRE MANDOU');
  let arquivos=[...new Set(achados.map(v=>v.srcfile).filter(Boolean))];
  if(!arquivos.length){
    T('Nenhum volume no banco aponta pra um PDF. Varrendo os '+MAX_PDF+' PDFs mais');
    T('recentes de '+LOTES+' atras dos numeros informados…');
    arquivos=pdfsRecentes();
  }
  if(!arquivos.length){ T('(nenhum PDF disponivel — os arquivos saem depois de 7 dias)'); return; }

  for(const arq of arquivos){
    if(!fs.existsSync(arq)){ T(''); T(arq+' → nao esta mais no servidor (limpeza de 7 dias)'); continue; }
    let insp; try{ insp=await inspecionar(arq); }catch(e){ T(''); T(arq+' → nao deu pra ler: '+e.message); continue; }
    const bate=b=>alvos.some(n=>b.venda===n||b.packId===n);
    const relevante=insp.etiquetas.some(bate)||insp.blocos.some(bate);
    if(!relevante && arquivos.length>1) continue;   // varredura: so mostra o PDF do caso

    T(''); T(path.basename(arq)+'  ('+insp.paginas+' paginas)');
    T('');
    T('  FOLHA DE CONTROLE — o que o cliente comprou:');
    insp.blocos.forEach(b=>T('     SKU '+b.sku+'   pack '+(b.packId||'—')+'   venda '+(b.venda||'—')));
    T('');
    T('  ETIQUETAS DE VENDA no PDF: '+insp.etiquetas.length);
    insp.etiquetas.forEach(e=>T('     pag '+e.pagina+'   pack '+(e.packId||'—')+'   venda '+(e.venda||'—')+'   NF '+(e.nf||'—')));

    // veredito por pack
    const porPack={};
    insp.etiquetas.forEach(e=>{ if(e.packId) (porPack[e.packId]=porPack[e.packId]||[]).push(e); });
    T('');
    T('  CONFERENCIA — PDF x BANCO:');
    Object.keys(porPack).forEach(p=>{
      const noPdf=porPack[p].length;
      const noBanco=db.prepare('SELECT COUNT(*) n FROM lote WHERE packId=?').get(p).n;
      const skusPdf=[...new Set(insp.blocos.filter(b=>b.packId===p).map(b=>b.sku))];
      const alerta=(noPdf>noBanco)?'   ←←← '+(noPdf-noBanco)+' VOLUME(S) PERDIDO(S)':'';
      T('     pack '+p+':  '+noPdf+' etiqueta(s) no PDF  ·  '+noBanco+' volume(s) no banco'+alerta);
      if(skusPdf.length>1) T('        SKUs desse pack: '+skusPdf.join(', '));
    });
  }
  T('');
})();
