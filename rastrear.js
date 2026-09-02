#!/usr/bin/env node
/* Rastreia uma venda do Mercado Livre pelo sistema inteiro.
 *
 *   node rastrear.js 2000014596231013 [outro numero...]
 *   node rastrear.js --auditar [dias]      confere o SKU de TODOS os volumes
 *   node rastrear.js --lote [data]         "subi N e apareceram M" — onde foi o resto
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
const MODO_FOLHA=args[0]==='--folha';
const MODO_ML=args[0]==='--ml';
const MODO_LOTE=args[0]==='--lote';
const MODO=[MODO_AUDITAR,MODO_DANFE,MODO_FOLHA,MODO_ML,MODO_LOTE].some(Boolean);
const DIAS=MODO_AUDITAR?(parseInt(args[1],10)||7):(MODO_ML?(parseInt(args[1],10)||7):0);
const NF_ALVO=MODO_DANFE?String(args[1]||'').replace(/\D/g,''):null;
const ACHAR=MODO_FOLHA?String(args[1]||'').trim():null;
const DATA_LOTE=MODO_LOTE?String(args[1]||'').trim():null;   // vazio = hoje
const alvos=MODO?[]:args.map(s=>String(s).replace(/\D/g,'')).filter(Boolean);
if(!MODO && !alvos.length){
  console.log('uso: node rastrear.js <numero da venda ou do pack> [mais numeros...]');
  console.log('     node rastrear.js --auditar [dias]   confere o SKU de TODOS os volumes');
  console.log('     node rastrear.js --danfe [NF]       mostra o texto da nota de um volume');
  console.log('     node rastrear.js --folha [texto]    mostra a FOLHA DE CONTROLE crua');
  console.log('     node rastrear.js --ml [dias]        confere o SKU contra a planilha do ML');
  console.log('     node rastrear.js --lote [data]      "subi N pecas e apareceram M"');
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

/* ── MODO 4: a FOLHA DE CONTROLE crua ───────────────────────────────────────
   O parse so extrai Pack ID, Venda, SKU e Cor dela. Se a folha trouxer tambem
   o comprador ou a NF ao lado de cada item, existe uma ligacao etiqueta->item
   que NAO passa pelo Pack ID — e o Pack ID e exatamente o que desalinha. Este
   modo despeja o texto como ele e, pra decidir olhando. */
async function verFolha(){
  const arq=db.prepare(`SELECT srcfile FROM lote
    WHERE srcfile IS NOT NULL AND data >= date('now','localtime','-7 day')
    GROUP BY srcfile ORDER BY MAX(id) DESC LIMIT 1`).get();
  if(!arq||!fs.existsSync(arq.srcfile)){ T('Nenhum PDF recente disponivel no servidor.'); return; }
  const pdfjs=require('pdfjs-dist/legacy/build/pdf.js');
  const {pageLines}=require('./folha');
  const pdf=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(arq.srcfile))}).promise;

  /* Guarda o texto de todas as paginas uma vez so: os tres blocos abaixo leem
     o mesmo material por angulos diferentes. */
  const pgs=[];
  for(let p=1;p<=pdf.numPages;p++){
    const linhas=pageLines(await (await pdf.getPage(p)).getTextContent());
    const t=linhas.join('\n');
    let tipo='outro';
    if(/SKU:/.test(t)) tipo='FOLHA';
    else if(/DANFE/.test(t)||/Chave de acesso/i.test(t)) tipo='danfe';
    else if(/Pack ID:/.test(t)||/Venda:/.test(t)) tipo='etiqueta';
    pgs.push({p,linhas,t,tipo});
  }

  /* 1. A ESTRUTURA. Se cada etiqueta tiver a folha do item logo em seguida, a
     ligacao etiqueta->SKU e POSICIONAL — muito mais firme que casar por Pack
     ID, que e justamente o que desalinha. O mapa responde isso de relance. */
  tit('COMO O PDF E MONTADO — '+path.basename(arq.srcfile)+' ('+pdf.numPages+' paginas)');
  T('');
  T('  '+pgs.slice(0,16).map(x=>x.p+':'+x.tipo).join('   '));
  if(pgs.length>16) T('  … (padrao das 16 primeiras paginas)');
  const conta={};
  pgs.forEach(x=>{ conta[x.tipo]=(conta[x.tipo]||0)+1; });
  T('');
  T('  total por tipo: '+Object.keys(conta).map(k=>k+'='+conta[k]).join('   '));

  /* 2. A ETIQUETA inteira: e nela que a busca por "mais alguma coisa que ligue"
     comeca — qualquer campo aqui que tambem apareca na folha serve de ponte. */
  const etq=pgs.find(x=>x.tipo==='etiqueta');
  if(etq){
    tit('UMA ETIQUETA DE VENDA INTEIRA (pagina '+etq.p+')');
    etq.linhas.forEach(l=>T('    '+l));
  }

  /* 3. A FOLHA. Com um termo, so a vizinhanca dele: e o que vem GRUDADO no item
     que interessa, nao a folha inteira. */
  const folhas=pgs.filter(x=>x.tipo==='FOLHA');
  if(!folhas.length){ T(''); T('Nenhuma pagina de folha de controle nesse PDF.'); return; }
  tit('A FOLHA DE CONTROLE (paginas '+folhas.map(f=>f.p).join(', ')+')');
  const alvo=ACHAR?ACHAR.toLowerCase():null;
  folhas.slice(0,2).forEach(f=>{
    T(''); T('── pagina '+f.p+' ──');
    if(alvo){
      const hits=f.linhas.map((l,i)=>({l,i})).filter(o=>o.l.toLowerCase().indexOf(alvo)>=0);
      if(!hits.length){ T('  (nao achei "'+ACHAR+'" nesta pagina)'); return; }
      hits.slice(0,3).forEach(h=>{ T('');
        f.linhas.slice(Math.max(0,h.i-12),h.i+13).forEach((l,k)=>
          T((k+Math.max(0,h.i-12)===h.i?'  → ':'    ')+l)); });
    } else {
      f.linhas.slice(0,70).forEach(l=>T('    '+l));
      if(f.linhas.length>70) T('    … (+'+(f.linhas.length-70)+' linhas — passe um nome ou NF pra ver so a vizinhanca)');
    }
  });
  T('');
  T('O que procurar: comprador, NF ou qualquer campo que apareca JUNTO do SKU e');
  T('TAMBEM na etiqueta acima. Se houver, o volume pode ser casado com o item');
  T('por ele — sem depender do Pack ID.');
  T('');
}

/* ── MODO 5: conferir contra a planilha do Mercado Livre ────────────────────
   A `venda_futura` guarda venda -> SKU vindo da planilha do ML, que nao passa
   pelo PDF. Onde o volume tem numero de venda, da pra conferir uma fonte
   contra a outra. (Ela e limpa quando a venda sai da planilha, entao so vale
   pro que ainda nao foi despachado.) */
function conferirML(){
  tit('O SKU DO PDF x O SKU DA PLANILHA DO MERCADO LIVRE ('+DIAS+' dias)');
  let temVF=true;
  try{ db.prepare('SELECT 1 FROM venda_futura LIMIT 1').get(); }catch(e){ temVF=false; }
  if(!temVF){ T('A tabela venda_futura nao existe — nenhuma planilha foi importada ainda.'); return; }
  const r=db.prepare(`SELECT COUNT(*) total,
      SUM(CASE WHEN venda IS NOT NULL AND venda<>'' THEN 1 ELSE 0 END) com_venda
    FROM lote WHERE data >= date('now','localtime','-'||?||' day')`).get(DIAS);
  const casam=db.prepare(`SELECT COUNT(*) n FROM lote l JOIN venda_futura v ON v.venda_id=l.venda
    WHERE l.data >= date('now','localtime','-'||?||' day')`).get(DIAS).n;
  T('');
  T('Volumes no periodo        : '+r.total);
  T('  com numero de venda     : '+r.com_venda+'   (sem numero nao da pra casar)');
  T('  casando com a planilha  : '+casam);
  const div=db.prepare(`SELECT l.id,l.buyer,l.nf,l.data,l.estagio,l.codigo pdf,v.codigo ml
    FROM lote l JOIN venda_futura v ON v.venda_id=l.venda
    WHERE l.codigo IS NOT NULL AND UPPER(l.codigo)<>UPPER(v.codigo)
      AND l.data >= date('now','localtime','-'||?||' day') ORDER BY l.id DESC`).all(DIAS);
  T('  DIVERGENCIAS            : '+div.length);
  if(div.length){
    T(''); linha(); T('O PDF E O MERCADO LIVRE DISCORDAM'); linha();
    div.forEach(d=>{ T('');
      T('#'+d.id+'  '+(d.buyer||'—')+'   NF '+(d.nf||'—')+'   '+d.data+'   ('+d.estagio+')');
      T('   PDF diz : '+d.pdf);
      T('   ML  diz : '+d.ml);
    });
  }
  T('');
  if(!casam) T('Nenhum volume casou. Ou os volumes nao trazem numero de venda, ou a\nplanilha importada nao cobre esse periodo.');
  T('');
}

/* ── MODO 6: A ESCADA DO LOTE ───────────────────────────────────────────────
   "Subi um PDF com 41 persianas e so aparecem 35."

   O numero do PDF e o numero da tela contam coisas diferentes, e entre um e
   outro existem CINCO degraus onde um volume sai da conta — todos por regra,
   nenhum visivel. Ate aqui a unica saida era abrir o banco na mao e conferir
   volume a volume, e por isso a pergunta virava desconfianca do sistema.

   Este modo desce a escada inteira em voz alta: quantas PECAS a folha diz,
   quantos VOLUMES viraram etiqueta, quantos foram gravados, quantos ficaram
   retidos e quantos ja estavam cobertos por estoque. O degrau onde a conta
   muda e a resposta.

   SO LE. */
async function verLote(){
  const hoje=db.prepare("SELECT date('now','localtime') d").get().d;
  const dia=DATA_LOTE||hoje;
  tit('DE ONDE VEM A DIFERENCA ENTRE O PDF E A TELA — '+dia+(dia===hoje?' (hoje)':''));

  const vols=db.prepare('SELECT * FROM lote WHERE data=? ORDER BY id').all(dia);
  if(!vols.length){ T(''); T('Nenhum volume gravado em '+dia+'.'); T(''); return; }
  const arqs=[...new Set(vols.map(v=>v.srcfile).filter(Boolean))];

  /* ── 1. O QUE CADA PDF TRAZ x O QUE ELE GRAVOU ───────────────────────────
     A folha conta PECAS (o campo Quantidade), a etiqueta conta VOLUMES, e o
     sistema grava um volume por etiqueta. Item com Quantidade 2 e uma peca a
     mais na contagem da mao e nenhuma linha a mais no banco. */
  let pecas=0, itens=0, etqs=0, gravados=0, semPdf=0;
  const multi=[], orfas=[];
  const chaves=new Set();
  vols.forEach(v=>{ if(v.packId)chaves.add('p:'+v.packId); if(v.venda)chaves.add('v:'+v.venda); });

  for(const arq of arqs){
    const n=db.prepare('SELECT COUNT(*) n FROM lote WHERE data=? AND srcfile=?').get(dia,arq).n;
    gravados+=n;
    if(!fs.existsSync(arq)){ semPdf++; T(''); T('  '+path.basename(arq)+': o PDF ja saiu do servidor — '+n+' volume(s) sem conferir'); continue; }
    let insp; try{ insp=await inspecionar(arq); }
    catch(e){ semPdf++; T(''); T('  '+path.basename(arq)+': nao deu pra ler'); continue; }
    const p=insp.blocos.reduce((a,b)=>a+(b.qtd||1),0);
    pecas+=p; itens+=insp.blocos.length; etqs+=insp.etiquetas.length;
    insp.blocos.filter(b=>(b.qtd||1)>1).forEach(b=>multi.push(b));
    /* Etiqueta do PDF que nao virou volume no dia. Desde a armadilha #5 a
       dedup olha o HISTORICO INTEIRO, entao o motivo quase sempre e que o
       volume ja existe de antes — e ai o que interessa nao e o numero, e QUAL
       volume ja existia e o que aconteceu com ele. Sem isso o operador ve
       "6 recusadas" e nao tem como saber se foi acerto ou perda. */
    insp.etiquetas.forEach(e=>{
      const tem=(e.packId&&chaves.has('p:'+e.packId))||(e.venda&&chaves.has('v:'+e.venda));
      if(tem) return;
      const antigo=db.prepare(`SELECT id,data,estagio,buyer,codigo FROM lote
        WHERE (packId=? AND packId IS NOT NULL) OR (venda=? AND venda IS NOT NULL)
        ORDER BY id LIMIT 1`).get(e.packId,e.venda);
      orfas.push({arq:path.basename(arq),pagina:e.pagina,packId:e.packId,venda:e.venda,antigo});
    });
    T('');
    T('  '+path.basename(arq)+'   ('+insp.paginas+' paginas)');
    T('     itens na folha    : '+insp.blocos.length);
    T('     PECAS na folha    : '+p+'   (soma das Quantidades)');
    T('     etiquetas no PDF  : '+insp.etiquetas.length);
    T('     volumes gravados  : '+n);
  }

  T('');
  linha();
  T('A CONTA, DEGRAU POR DEGRAU');
  linha();
  if(semPdf<arqs.length){
    T('');
    T('PECAS que a folha declara     : '+pecas+'   ← e este o numero que se conta na mao');
    if(pecas!==itens)
      T('  em itens (etiquetas)        : '+itens+'   ← '+(pecas-itens)+' peca(s) viajam junto de outra');
    T('etiquetas no(s) PDF(s)        : '+etqs);
  }
  T('volumes GRAVADOS no dia       : '+vols.length+'   ← uma linha por etiqueta, nunca por peca');

  const bSku=vols.filter(v=>v.estagio==='bloqueado'&&!/^divergencia/.test(String(v.bloqueio||''))).length;
  const bDiv=vols.filter(v=>v.estagio==='bloqueado'&&/^divergencia/.test(String(v.bloqueio||''))).length;
  const todosPend=vols.filter(v=>v.estagio==='pendente'&&v.codigo);
  const andando=vols.filter(v=>v.estagio!=='pendente'&&v.estagio!=='bloqueado').length;
  T('  - retidos: SKU sem cadastro : '+bSku+(bSku?'   (Admin > Bloqueados)':''));
  T('  - retidos: divergencia      : '+bDiv+(bDiv?'   (Admin > Bloqueados, em vermelho)':''));
  if(andando) T('  - ja embalados/carregados   : '+andando);
  T('  = PENDENTES                 : '+todosPend.length);

  /* ── 2. O PRAZO DE DESPACHO (§8, armadilha #7) ───────────────────────────
     Nem todo volume de um lote sai no mesmo dia: a etiqueta traz "Despachar:
     qua 26/ago" e no PDF de 25/08 as 14 etiquetas tinham CINCO datas. O que
     vence depois nao esta na fila de hoje — esta no painel "Pra despachar
     depois", e e um dos degraus que mais come volume.

     A regra vem do fila_dia.js, o dono unico. Uma ferramenta de diagnostico
     com regua propria e pior que nenhuma: confirmaria com autoridade um
     numero que a tela nao usa. */
  /* O corte e sempre HOJE, mesmo analisando um dia passado: e assim que a tela
     decide, e a pergunta aqui e sempre "por que a tela mostra este numero". */
  const {VENCE_HOJE}=require('./fila_dia');
  const venceDepois=todosPend.filter(v=>v.despachar_em && v.despachar_em>hoje);
  const jaVenceu=todosPend.filter(v=>v.despachar_em && v.despachar_em<hoje);
  const semData=todosPend.filter(v=>!v.despachar_em);
  const pend=todosPend.filter(v=>!v.despachar_em || v.despachar_em<=hoje);
  if(venceDepois.length||jaVenceu.length||semData.length!==todosPend.length){
    T('  - so despacham depois de hoje: '+venceDepois.length+
      (venceDepois.length?'   (painel "Pra despachar depois")':''));
    T('  = FILA DE HOJE deste lote   : '+pend.length+
      (jaVenceu.length?'   (dos quais '+jaVenceu.length+' ja venceram — saem em vermelho)':'')+
      (semData.length?'   ('+semData.length+' sem data lida na etiqueta)':''));
  }
  /* A tela nao mostra so este lote: ela mostra TODO pendente que vence hoje,
     inclusive o que entrou dias atras. Comparar o numero do PDF com o da tela
     sem isso da diferenca nos dois sentidos. */
  const filaTela=db.prepare('SELECT COUNT(*) c FROM lote WHERE '+VENCE_HOJE+" AND estagio='pendente' AND codigo IS NOT NULL").get().c;
  T('');
  T('"Faltam imprimir" na tela     : '+filaTela+
    (filaTela!==pend.length?'   ← inclui pendente de outros dias que vence hoje':''));

  /* ── 3. O ULTIMO DEGRAU: quem ja tinha estoque nao vira ordem ────────────
     A queda mais legitima de todas: venda com peca pronta na prateleira sai
     direto pra etiqueta, sem passar pela producao. A tela vermelha mostra o
     que falta PRODUZIR, nunca o que falta EXPEDIR. */
  T('');
  /* A conta sai do `urgencia.js`, o dono unico — nunca de uma copia aqui. Uma
     ferramenta de diagnostico com regua propria e pior que nenhuma: ela
     confirma com autoridade um numero que a tela nao usa (mesmo motivo pelo
     qual a fila de hoje vem do `fila_dia.js`). */
  const linhas=require('./urgencia').calcular(db, dia)
    .map(l=>({c:l.codigo, q:l.pendentes, est:l.estoque, u:l.urgente}));
  let urg=0, cobertos=0;
  linhas.forEach(l=>{ urg+=l.u; cobertos+=l.q-l.u; });
  T('  - cobertos por estoque      : '+cobertos+'   (saem direto pra Etiqueta de Venda)');
  T('  = URGENTES (tela vermelha)  : '+urg);
  const lancados=db.prepare("SELECT COALESCE(SUM(qtd),0) n FROM producao WHERE data=? AND origem='ml'").get(dia).n;
  const manual=db.prepare("SELECT COALESCE(SUM(qtd),0) n FROM producao WHERE data=? AND COALESCE(origem,'')<>'ml'").get(dia).n;
  T('');
  T('ordens do PDF ja lancadas     : '+lancados+(lancados!==urg?'   ← diferente do calculo acima: falta clicar em "Lancar urgentes"':''));
  if(manual) T('ordens lancadas na mao        : '+manual+'   (nao vem do PDF; somam na tela)');
  T('a tela vermelha soma          : '+(lancados+manual)+'   ← o numero que o operador ve');

  if(linhas.length){
    T('');
    linha();
    T('POR SKU — pendente, estoque, urgente');
    linha();
    linhas.forEach(l=>T('  '+String(l.c).padEnd(24)+' pendentes '+String(l.q).padStart(3)+
      '   estoque '+String(l.est).padStart(3)+'   urgente '+String(l.u).padStart(3)+
      (l.u<l.q?'   ← '+(l.q-l.u)+' ja tem pronta':'')));
  }

  if(multi.length){
    T('');
    linha();
    T('ITENS COM MAIS DE UMA PECA — a diferenca que a contagem na mao acusa');
    linha();
    T('');
    T('Sao '+multi.reduce((a,b)=>a+(b.qtd-1),0)+' peca(s) alem do numero de volumes. O sistema grava UM volume');
    T('por etiqueta, entao esses itens entram como 1 e a fabrica precisa produzir');
    T('a quantidade cheia — confira estes na mao antes de fechar o dia:');
    multi.forEach(b=>T('  '+String(b.sku).padEnd(24)+' Quantidade '+b.qtd+'   '+(b.comprador||'—')+
      '   venda '+(b.venda||'—')));
  }
  if(orfas.length){
    T('');
    linha();
    T('ETIQUETAS DO PDF QUE NAO VIRARAM VOLUME NESTE DIA');
    linha();
    T('');
    T('A dedup olha o historico inteiro (armadilha #5): pack/venda que ja existe');
    T('nao entra de novo. Com o volume antigo ao lado da pra ver se foi acerto');
    T('(ja despachado) ou se ficou parado em algum lugar:');
    orfas.slice(0,20).forEach(o=>{
      T('  pag '+o.pagina+'   pack '+(o.packId||'—')+'   venda '+(o.venda||'—'));
      T('     ja existia: '+(o.antigo
        ? '#'+o.antigo.id+'  '+(o.antigo.codigo||'(sem SKU)')+'  '+(o.antigo.buyer||'—')+
          '  '+o.antigo.data+'  ('+o.antigo.estagio+')'
        : 'NAO ACHEI no banco — esta etiqueta nao entrou e nao existe. Investigue.'));
    });
    if(orfas.length>20) T('  … e mais '+(orfas.length-20));
  }
  T('');
}

(MODO_AUDITAR?auditar():MODO_DANFE?verDanfe():MODO_FOLHA?verFolha():MODO_ML?Promise.resolve(conferirML()):MODO_LOTE?verLote():rastrear())
  .catch(e=>{ console.error(e); process.exit(1); });
