#!/usr/bin/env node
/* Rastreia uma venda do Mercado Livre pelo sistema inteiro.
 *
 *   node rastrear.js 2000014596231013 [outro numero...]
 *   node rastrear.js --auditar [dias]      confere o SKU de TODOS os volumes
 *
 * O primeiro modo serve a "o cliente reclamou — o que o sistema soube dessa
 * venda?". O segundo responde a pergunta que vem depois: "isso acontece em
 * quantas mais?" — relendo a folha de controle de cada PDF e comparando com o
 * SKU que ficou gravado no volume.
 *
 * SO LE. Nao grava, nao corrige, nao apaga. Pode rodar em producao.
 */
const fs=require('fs'), path=require('path');
const Database=require('better-sqlite3');

const DB=process.env.PCP_DB||'/opt/expedicao/dados.db';
const LOTES=process.env.PCP_LOTES||'/opt/expedicao/lotes';
const MAX_PDF=25;   // quantos PDFs recentes varrer quando o volume nao esta no banco

const args=process.argv.slice(2);
const MODO_AUDITAR=args[0]==='--auditar';
const DIAS=MODO_AUDITAR?(parseInt(args[1],10)||7):0;
const alvos=MODO_AUDITAR?[]:args.map(s=>String(s).replace(/\D/g,'')).filter(Boolean);
if(!MODO_AUDITAR && !alvos.length){
  console.log('uso: node rastrear.js <numero da venda ou do pack> [mais numeros...]');
  console.log('     node rastrear.js --auditar [dias]   confere o SKU de TODOS os volumes');
  process.exit(1);
}

const T=s=>console.log(s);
const linha=()=>T('─'.repeat(72));
const tit=s=>{ T(''); linha(); T(s); linha(); };
const db=new Database(DB,{readonly:true});

// ── leitura crua do PDF ─────────────────────────────────────────────────────
function pageLines(tc){
  const items=tc.items.filter(it=>it.str&&it.str.trim()!=='');
  const rows={};
  for(const it of items){ const yb=Math.round(it.transform[5]/3)*3; (rows[yb]=rows[yb]||[]).push({x:it.transform[4],s:it.str}); }
  return Object.keys(rows).map(Number).sort((a,b)=>b-a)
    .map(y=>rows[y].sort((a,b)=>a.x-b.x).map(o=>o.s).join(' ').replace(/\s+/g,' ').trim());
}
/* Lista TUDO que o PDF traz, sem a deduplicacao do parse.js — e essa diferenca,
   bruto x o que o parse aceitou, que revela o problema. Os blocos da folha de
   controle saem pelo mesmo tokenizer da 2a passada do parse (o que le Pack ID e
   Venda antes do SKU), nunca pelo split de "Desenho do tecido". */
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
function mostrarVolume(v,pre){
  T((pre||'')+'#'+v.id+'  SKU '+(v.codigo||'(sem SKU)')+'  ·  '+(v.buyer||'')+
    '  ·  NF '+(v.nf||'—')+'  ·  '+v.estagio+
    (v.embalado_em?'  ·  impresso '+v.embalado_em:'')+
    (v.reimpressoes?'  ·  reimpressa '+v.reimpressoes+'x':''));
  T((pre||'')+'   pack '+(v.packId||'—')+'   venda '+(v.venda||'—')+'   data '+v.data);
}

// ── MODO 1: rastrear numeros ────────────────────────────────────────────────
async function rastrear(){
  tit('1. O QUE O BANCO SABE SOBRE OS NUMEROS INFORMADOS');
  const achados=[];
  for(const num of alvos){
    const rs=db.prepare(`SELECT * FROM lote WHERE venda=? OR packId=? OR codes LIKE ? ORDER BY id`)
      .all(num,num,'%'+num+'%');
    T('');
    if(!rs.length){ T(num+'  →  NAO EXISTE NO SISTEMA'); continue; }
    T(num+'  →  '+rs.length+' volume(s)');
    rs.forEach(v=>{ mostrarVolume(v,'   '); achados.push(v); });
  }

  tit('2. OUTROS VOLUMES DO MESMO PACK / DO MESMO CLIENTE');
  const packs=new Set(achados.map(v=>v.packId).filter(Boolean));
  const clientes=new Set(achados.map(v=>v.buyer+'|'+v.data).filter(Boolean));
  if(!packs.size && !clientes.size) T('(nada a comparar — nenhum volume achado no banco)');
  for(const p of packs){
    const irmaos=db.prepare('SELECT * FROM lote WHERE packId=? ORDER BY id').all(p);
    T(''); T('pack '+p+' → '+irmaos.length+' volume(s) no banco');
    irmaos.forEach(v=>mostrarVolume(v,'   '));
  }
  for(const k of clientes){
    const [buyer,data]=k.split('|');
    const irmaos=db.prepare('SELECT * FROM lote WHERE buyer=? AND data=? ORDER BY id').all(buyer,data);
    T(''); T('cliente "'+buyer+'" em '+data+' → '+irmaos.length+' volume(s) no banco');
    irmaos.forEach(v=>mostrarVolume(v,'   '));
  }

  tit('3. DEVOLUCOES LIGADAS A ESSES NUMEROS');
  let houve=false;
  for(const num of alvos){
    db.prepare(`SELECT * FROM devolucao WHERE codigo_ml LIKE ? OR venda_id IN
        (SELECT id FROM lote WHERE venda=? OR packId=?)`).all('%'+num+'%',num,num)
      .forEach(d=>{ houve=true;
        T(''); T('devolucao #'+d.id+' ('+d.data+')  cliente '+(d.buyer||'—'));
        T('   SKU que voltou (fisico): '+(d.sku_fisico||'—'));
        T('   SKU da venda           : '+(d.sku_venda||'—')+
          (d.sku_venda&&d.sku_fisico&&d.sku_venda!==d.sku_fisico?'   ← DIVERGENCIA':''));
        T('   destinacao: '+(d.destinacao||'—')+'   motivo: '+(d.motivo||'—'));
      });
  }
  if(!houve) T('(nenhuma)');

  tit('4. O PDF DE ORIGEM — O QUE O MERCADO LIVRE MANDOU');
  let arquivos=[...new Set(achados.map(v=>v.srcfile).filter(Boolean))];
  if(!arquivos.length){
    T('Nenhum volume no banco aponta pra um PDF. Varrendo os '+MAX_PDF+' PDFs mais recentes…');
    arquivos=pdfsRecentes();
  }
  if(!arquivos.length){ T('(nenhum PDF disponivel — os arquivos saem depois de 7 dias)'); return; }

  for(const arq of arquivos){
    if(!fs.existsSync(arq)){ T(''); T(arq+' → nao esta mais no servidor (limpeza de 7 dias)'); continue; }
    let insp; try{ insp=await inspecionar(arq); }catch(e){ T(''); T(arq+' → nao deu pra ler: '+e.message); continue; }
    const bate=b=>alvos.some(n=>b.venda===n||b.packId===n);
    if(!insp.etiquetas.some(bate) && !insp.blocos.some(bate) && arquivos.length>1) continue;

    T(''); T(path.basename(arq)+'  ('+insp.paginas+' paginas)');
    /* So os itens do caso: a folha inteira tem dezenas de linhas e o que
       interessa e a vizinhanca dos numeros informados. */
    T(''); T('  FOLHA DE CONTROLE — os itens procurados e seus vizinhos:');
    insp.blocos.forEach((b,i)=>{
      const perto=insp.blocos.slice(Math.max(0,i-1),i+2).some(bate);
      if(perto) T('     '+(bate(b)?'→ ':'  ')+'SKU '+b.sku+'   pack '+(b.packId||'—')+'   venda '+(b.venda||'—'));
    });
    T('');
    T('  CONFERENCIA — o SKU gravado x o que a folha de controle diz:');
    const vols=db.prepare('SELECT * FROM lote WHERE srcfile=? ORDER BY id').all(arq);
    const porPack={},porVenda={};
    insp.blocos.forEach(b=>{ if(b.packId&&!porPack[b.packId])porPack[b.packId]=b.sku;
                             if(b.venda&&!porVenda[b.venda])porVenda[b.venda]=b.sku; });
    vols.filter(v=>alvos.includes(v.packId)||alvos.includes(v.venda)).forEach(v=>{
      const esperado=(v.venda&&porVenda[v.venda])||(v.packId&&porPack[v.packId])||null;
      const ok=esperado&&String(v.codigo||'').toUpperCase()===String(esperado).toUpperCase();
      T('     #'+v.id+'  gravado '+(v.codigo||'—')+'   folha diz '+(esperado||'?')+
        (esperado?(ok?'   ok':'   ←←← DIVERGENCIA'):'   (nao achei na folha)'));
    });
  }
  T('');
}

// ── MODO 2: auditar todos os volumes ────────────────────────────────────────
async function auditar(){
  tit('AUDITORIA — o SKU gravado bate com a folha de controle? ('+DIAS+' dias)');
  const arqs=db.prepare(`SELECT DISTINCT srcfile FROM lote
    WHERE srcfile IS NOT NULL AND data >= date('now','localtime','-'||?||' day')`).all(DIAS)
    .map(r=>r.srcfile).filter(a=>{ try{ return fs.existsSync(a); }catch(e){ return false; } });
  if(!arqs.length){ T('Nenhum PDF disponivel no periodo (os arquivos saem depois de 7 dias).'); return; }

  let conferidos=0, semFolha=0; const div=[];
  for(const arq of arqs){
    let insp; try{ insp=await inspecionar(arq); }catch(e){ T('  '+path.basename(arq)+': nao deu pra ler'); continue; }
    const porPack={},porVenda={};
    insp.blocos.forEach(b=>{ if(b.packId&&!porPack[b.packId])porPack[b.packId]=b.sku;
                             if(b.venda&&!porVenda[b.venda])porVenda[b.venda]=b.sku; });
    for(const v of db.prepare('SELECT * FROM lote WHERE srcfile=? ORDER BY id').all(arq)){
      const esperado=(v.venda&&porVenda[v.venda])||(v.packId&&porPack[v.packId])||null;
      if(!esperado){ semFolha++; continue; }
      conferidos++;
      if(String(v.codigo||'').toUpperCase()!==String(esperado).toUpperCase())
        div.push({v,esperado,arq:path.basename(arq)});
    }
  }
  T('');
  T('PDFs lidos          : '+arqs.length);
  T('Volumes conferidos  : '+conferidos);
  T('Sem par na folha    : '+semFolha+'  (nao da pra conferir)');
  T('DIVERGENCIAS        : '+div.length+(conferidos?'   ('+(100*div.length/conferidos).toFixed(1)+'%)':''));
  if(!div.length){ T(''); T('Nenhuma divergencia — o SKU gravado bate com a folha em todos.'); return; }
  T('');
  linha();
  T('OS VOLUMES COM SKU DIFERENTE DA FOLHA DE CONTROLE');
  linha();
  div.forEach(d=>{
    T('');
    T('#'+d.v.id+'  '+(d.v.buyer||'—')+'   NF '+(d.v.nf||'—')+'   '+d.v.data+'   ('+d.v.estagio+')');
    T('   GRAVADO no sistema : '+(d.v.codigo||'—')+'   ← foi esse que a bancada bipou e mandou');
    T('   FOLHA DE CONTROLE  : '+d.esperado+'   ← e esse que o cliente comprou');
    T('   pack '+(d.v.packId||'—')+'   venda '+(d.v.venda||'—'));
  });
  T('');
  T('Confira uma dessas NFs contra o pedido no Mercado Livre: ela diz qual das');
  T('duas leituras esta certa, e e o que decide o lado da correcao.');
  T('');
}

(MODO_AUDITAR?auditar():rastrear()).catch(e=>{ console.error(e); process.exit(1); });
