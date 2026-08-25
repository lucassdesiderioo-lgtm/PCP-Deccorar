/* Leitura CRUA da folha de controle do PDF do Mercado Livre.
 *
 * Dono unico da pergunta "o que este PDF diz, de verdade?". O parse.js le a
 * folha para GRAVAR o volume; este modulo le para CONFERIR o que ja foi gravado.
 * Duas copias dessa leitura significaria auditar com uma regua diferente da que
 * produziu o numero — e a auditoria passaria a mentir junto.
 *
 * Aqui nao ha deduplicacao nem escolha: devolve tudo que esta escrito, na ordem
 * em que aparece. Quem compara decide.
 */
const fs=require('fs');

function pageLines(tc){
  const items=tc.items.filter(it=>it.str&&it.str.trim()!=='');
  const rows={};
  for(const it of items){ const yb=Math.round(it.transform[5]/3)*3; (rows[yb]=rows[yb]||[]).push({x:it.transform[4],s:it.str}); }
  return Object.keys(rows).map(Number).sort((a,b)=>b-a)
    .map(y=>rows[y].sort((a,b)=>a.x-b.x).map(o=>o.s).join(' ').replace(/\s+/g,' ').trim());
}

/* Devolve {paginas, etiquetas:[{pagina,packId,venda,nf}], blocos:[{packId,venda,sku}]}.
   Os blocos saem pelo tokenizer item a item — o mesmo criterio que o parse.js usa
   para decidir o SKU (leitura 1). E de proposito: a auditoria pergunta "o volume
   gravado bate com o que a folha diz", e a folha, aqui, fala pela leitura que
   manda. */
async function lerFolha(arquivo){
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
  return {paginas:pdf.numPages,etiquetas,blocos};
}

/* Mapas pack->sku e venda->sku, primeira ocorrencia manda (igual ao parse). */
function mapasDaFolha(blocos){
  const porPack={}, porVenda={};
  (blocos||[]).forEach(b=>{
    if(b.packId && !porPack[b.packId]) porPack[b.packId]=b.sku;
    if(b.venda && !porVenda[b.venda]) porVenda[b.venda]=b.sku;
  });
  return {porPack,porVenda};
}

/* O SKU que a folha atribui a um volume ja gravado. NULL quando a folha nao
   fala daquele volume — que nao e o mesmo que "bate": e "nao da pra conferir". */
function skuDaFolha(volume, mapas){
  return (volume.venda && mapas.porVenda[volume.venda])
      || (volume.packId && mapas.porPack[volume.packId])
      || null;
}

module.exports={lerFolha,mapasDaFolha,skuDaFolha,pageLines};
