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
const MODO_DANFE=args[0]==='--danfe';
const DIAS=MODO_AUDITAR?(parseInt(args[1],10)||7):0;
const NF_ALVO=MODO_DANFE?String(args[1]||'').replace(/\D/g,''):null;
const alvos=(MODO_AUDITAR||MODO_DANFE)?[]:args.map(s=>String(s).replace(/\D/g,'')).filter(Boolean);
if(!MODO_AUDITAR && !MODO_DANFE && !alvos.length){
  console.log('uso: node rastrear.js <numero da venda ou do pack> [mais numeros...]');
  console.log('     node rastrear.js --auditar [dias]   confere o SKU de TODOS os volumes');
  console.log('     node rastrear.js --danfe [NF]       mostra o texto da nota de um volume');
  process.exit(1);
}

const T=s=>console.log(s);
const linha=()=>T('─'.repeat(72));
const tit=s=>{ T(''); linha(); T(s); linha(); };
const db=new Database(DB,{readonly:true});

// ── leitura crua do PDF: mesmo modulo que a tela usa (folha.js) ─────────────
// Auditar com uma regua diferente da que a tela usa daria dois numeros pra
// mesma pergunta — e o errado seria sempre o que ninguem estivesse olhando.
const {lerFolha:inspecionar,mapasDaFolha,skuDaFolha}=require('./folha');
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
    const mapas=mapasDaFolha(insp.blocos);
    vols.filter(v=>alvos.includes(v.packId)||alvos.includes(v.venda)).forEach(v=>{
      const esperado=skuDaFolha(v,mapas);
      const ok=esperado&&String(v.codigo||'').toUpperCase()===String(esperado).toUpperCase();
      T('     #'+v.id+'  gravado '+(v.codigo||'—')+'   folha diz '+(esperado||'?')+
        (esperado?(ok?'   ok':'   ←←← DIVERGENCIA'):'   (nao achei na folha)'));
    });
  }
  T('');
}

// ── MODO 2: auditar todos os volumes ────────────────────────────────────────
async function auditar(){
  tit('AUDITORIA — o SKU gravado bate com a folha de controle? '+(DIAS===1?'(hoje)':'('+DIAS+' dias)'));
  const arqs=db.prepare(`SELECT DISTINCT srcfile FROM lote
    WHERE srcfile IS NOT NULL AND data >= date('now','localtime','-'||?||' day')`).all(DIAS-1)
    .map(r=>r.srcfile).filter(a=>{ try{ return fs.existsSync(a); }catch(e){ return false; } });
  if(!arqs.length){ T('Nenhum PDF disponivel no periodo (os arquivos saem depois de 7 dias).'); return; }

  let conferidos=0, semFolha=0; const div=[];
  for(const arq of arqs){
    let insp; try{ insp=await inspecionar(arq); }catch(e){ T('  '+path.basename(arq)+': nao deu pra ler'); continue; }
    const mapas=mapasDaFolha(insp.blocos);
    for(const v of db.prepare('SELECT * FROM lote WHERE srcfile=? ORDER BY id').all(arq)){
      const esperado=skuDaFolha(v,mapas);
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

/* ── MODO 3: o que a NOTA FISCAL diz ────────────────────────────────────────
   Investigacao pra uma pergunta so: a DANFE descreve a mercadoria de um jeito
   que da pra conferir contra a folha de controle? Se descrever, o PDF passa a
   ter DUAS fontes independentes sobre o que o cliente comprou — hoje tem uma
   so, e as duas leituras do parse leem o MESMO papel.
   Despeja o texto cru da pagina da nota daquele volume. So le. */
async function verDanfe(){
  const v = NF_ALVO
    ? db.prepare(`SELECT * FROM lote WHERE nf=? AND srcfile IS NOT NULL AND danfePage IS NOT NULL
                  ORDER BY id DESC LIMIT 1`).get(NF_ALVO)
    : db.prepare(`SELECT * FROM lote WHERE srcfile IS NOT NULL AND danfePage IS NOT NULL
                  AND codigo IS NOT NULL ORDER BY id DESC LIMIT 1`).get();
  if(!v){ T(NF_ALVO?('Nenhum volume com a NF '+NF_ALVO+' e nota no PDF.'):'Nenhum volume com nota no PDF.'); return; }
  tit('A NOTA FISCAL DO VOLUME #'+v.id);
  T('cliente '+(v.buyer||'—')+'   NF '+(v.nf||'—')+'   data '+v.data);
  T('SKU gravado pela folha de controle: '+(v.codigo||'—'));
  T('');
  if(!fs.existsSync(v.srcfile)){ T('O PDF ja saiu do servidor (limpeza de 7 dias).'); return; }
  const pdfjs=require('pdfjs-dist/legacy/build/pdf.js');
  const {pageLines}=require('./folha');
  const pdf=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(v.srcfile))}).promise;
  const pag=v.danfePage+1;                       // danfePage e 0-based
  if(pag<1||pag>pdf.numPages){ T('Pagina da nota fora do PDF ('+pag+' de '+pdf.numPages+').'); return; }
  const linhas=pageLines(await (await pdf.getPage(pag)).getTextContent());
  linha();
  T('TEXTO DA PAGINA '+pag+' (a nota):');
  linha();
  linhas.forEach(l=>T('  '+l));
  T('');
  T('Procure aqui a descricao do produto: se a nota disser o que e a peca, ela');
  T('vira a segunda testemunha — independente da folha de controle.');
  T('');
}

(MODO_AUDITAR?auditar():(MODO_DANFE?verDanfe():rastrear())).catch(e=>{ console.error(e); process.exit(1); });
