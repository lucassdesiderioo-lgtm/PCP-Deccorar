const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.js';
function pageLines(tc){
  const items=tc.items.filter(it=>it.str&&it.str.trim()!=='');
  const rows={};
  for(const it of items){ const yb=Math.round(it.transform[5]/3)*3; (rows[yb]=rows[yb]||[]).push({x:it.transform[4],s:it.str}); }
  return Object.keys(rows).map(Number).sort((a,b)=>b-a).map(y=>rows[y].sort((a,b)=>a.x-b.x).map(o=>o.s).join(' ').replace(/\s+/g,' ').trim());
}
async function parsePdf(uint8){
  const pdf=await pdfjs.getDocument({data:uint8}).promise;
  const N=pdf.numPages, pages=[], controlLines=[];
  for(let p=1;p<=N;p++){
    const lines=pageLines(await (await pdf.getPage(p)).getTextContent());
    const text=lines.join('\n'); let type='other';
    if(/SKU:/.test(text)) type='control';
    else if(/DANFE/.test(text)||/Chave de acesso/i.test(text)) type='danfe';
    else if(/Pack ID:/.test(text)||/Venda:/.test(text)) type='label';
    pages[p]={type,lines,text};
    if(type==='control') controlLines.push.apply(controlLines,lines);
  }
  const byPack={},byVenda={}, controlText=controlLines.join('\n');
  /* O SKU de um registro NUNCA e sobrescrito: quem chega primeiro manda, e a
     ordem das duas leituras abaixo e o que decide qual peca o cliente recebe.
     A cor pode ser completada depois, mas so quando o SKU e o mesmo — nunca
     puxando junto o SKU de outro item. */
  const put=rec=>{
    const grava=(mapa,chave)=>{
      if(!chave) return;
      if(!mapa[chave]) mapa[chave]=rec;
      else if(!mapa[chave].cor && rec.cor && mapa[chave].sku===rec.sku) mapa[chave].cor=rec.cor;
    };
    grava(byPack,rec.packId); grava(byVenda,rec.venda);
  };

  /* LEITURA 1 (a que manda): item a item, na ordem em que aparecem na folha.
     Cada "SKU:" fecha o registro com o Pack ID e a Venda que vieram antes dele,
     e depois zera os dois — item que nao traz Pack ID fica com pack nulo em vez
     de herdar o do vizinho. */
  { const tok=/(Pack ID:\s*([\d ]+))|(Venda:\s*([\d ]+))|(SKU:\s*(\S+))|(Cor:\s*([^\n]+))/g; let m,pk=null,vd=null,last=null;
    while((m=tok.exec(controlText))){
      if(m[2])pk=m[2].replace(/\s+/g,'');
      else if(m[4])vd=m[4].replace(/\s+/g,'');
      else if(m[6]){ last={packId:pk,venda:vd,sku:m[6].trim(),cor:null}; put(last); pk=null;vd=null; }
      else if(m[8]&&last&&!last.cor) last.cor=m[8].trim();
    } }

  /* LEITURA 2 (so completa o que faltou): fatia a folha por "Desenho do tecido".
     Ela RODAVA PRIMEIRO e mandava o SKU errado pro cliente. O pedaco so casa
     item com item quando ha exatamente um de cada dentro dele — e nao ha:
     acessorio nao tem desenho de tecido, entao dois itens caem no mesmo pedaco,
     e ai o `match` pega o PRIMEIRO "SKU:" com o PRIMEIRO "Pack ID:", que sao de
     itens diferentes quando o de cima nao traz pack. Foi assim que o Abraao
     Amorim (3 x BK140140BEGE) recebeu uma BK160140BEGE: o SKU do vizinho de
     cima colou no pack dele.
     Fica como reforco — pedaco com mais de um SKU e recusado, e o `put` acima
     ja impede qualquer troca de SKU. */
  for(const blk of controlText.split(/Desenho do tecido[^\n]*/)){
    if(!/Pack ID:|Venda:/.test(blk)) continue;
    const todos=blk.match(/SKU:\s*\S+/g);
    if(!todos||todos.length!==1) continue;         // pedaco grudado: nao da pra confiar
    const ms=blk.match(/SKU:\s*(\S+)/);
    const mp=blk.match(/Pack ID:\s*([\d ]+)/),mv=blk.match(/Venda:\s*([\d ]+)/),mc=blk.match(/Cor:\s*([^\n]+)/);
    put({packId:mp?mp[1].replace(/\s+/g,''):null,venda:mv?mv[1].replace(/\s+/g,''):null,sku:ms[1].trim(),cor:mc?mc[1].trim():null});
  }
  const danfeByNf={};
  for(let p=1;p<=N;p++){ if(pages[p].type!=='danfe')continue; const mm=pages[p].text.match(/N[úu]mero\s*([\d.,]+)/i); if(mm) danfeByNf[mm[1].replace(/\D/g,'')]=p; }
  const orders=[], seen=new Set();
  for(let p=1;p<=N;p++){
    if(pages[p].type!=='label')continue;
    const t=pages[p].text, lines=pages[p].lines;
    const grab=re=>{ const mm=t.match(re); return mm?mm[1].replace(/\s+/g,''):null; };
    const packId=grab(/Pack ID:\s*([\d ]+)/), venda=grab(/Venda:\s*([\d ]+)/);
    const nf=(t.match(/NF:\s*(\d+)/)||[])[1]||null;
    const city=((t.match(/Cidade de destino\s*:\s*(.+)/)||[])[1]||'').trim();
    let buyer=''; const ei=lines.findIndex(l=>/^Endereço:/.test(l));
    if(ei>0){ buyer=lines[ei-1]; if(ei>1&&/^\(/.test(buyer)) buyer=lines[ei-2]+' '+buyer; }
    buyer=buyer.replace(/\s*\([^)]*\)\s*$/,'').trim();
    if((packId&&seen.has('p:'+packId))||(venda&&seen.has('v:'+venda))) continue;
    if(packId)seen.add('p:'+packId); if(venda)seen.add('v:'+venda);
    const codes=new Set(); if(packId)codes.add(packId); if(venda)codes.add(venda);
    for(const ln of lines){ const c=ln.replace(/\s+/g,'');
      if(/^[0-9]{8,}$/.test(c)) codes.add(c);
      else if(/^[0-9]{8,}\$[0-9]+$/.test(c)) codes.add(c.replace(/\D/g,'')); }
    const rec=(packId&&byPack[packId])||(venda&&byVenda[venda])||null;
    let danfePage=null;
    if(nf&&danfeByNf[nf]) danfePage=danfeByNf[nf];
    else if(pages[p+1]&&pages[p+1].type==='danfe') danfePage=p+1;
    orders.push({sku:rec?rec.sku:null,cor:rec?rec.cor:'',buyer:buyer||'(sem nome)',city,nf,packId,venda,codes:[...codes],labelPage:p-1,danfePage:danfePage!=null?danfePage-1:null});
  }
  return orders;
}
module.exports={parsePdf};
