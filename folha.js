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
  const etiquetas=[], ctrlLinhas=[];
  for(let p=1;p<=pdf.numPages;p++){
    const lines=pageLines(await (await pdf.getPage(p)).getTextContent());
    const text=lines.join('\n');
    if(/SKU:/.test(text)){ lines.forEach(x=>ctrlLinhas.push(x)); }
    else if(/Pack ID:/.test(text)||/Venda:/.test(text)){
      const g=re=>{ const m=text.match(re); return m?m[1].replace(/\s+/g,''):null; };
      etiquetas.push({pagina:p,packId:g(/Pack ID:\s*([\d ]+)/),venda:g(/Venda:\s*([\d ]+)/),
                      nf:(text.match(/NF:\s*(\d+)/)||[])[1]||null});
    }
  }
  return {paginas:pdf.numPages, etiquetas, blocos:itensDaFolha(ctrlLinhas)};
}

/* UM BLOCO POR ITEM — o mesmo criterio que o parse.js usa para gravar.
 *
 * A folha do ML monta cada item em cinco linhas, em duas colunas:
 *
 *     <identificacao>  Persiana ... 1,60x1,40 Blecaute Cinza
 *     Pack ID: 2000014610097547   SKU: BK160140CINZA
 *     Venda: 2000018016683414     Quantidade: 1
 *     Tiago Sanches               Cor: Cinza
 *                                 Desenho do tecido: Blackout
 *
 * Pack, venda, comprador e cor vem NA LINHA DO SKU ou abaixo; so a descricao
 * fica acima. Procurar pack/venda/comprador para tras pega o do item anterior
 * quando ele nao fecha com "Desenho do tecido" — e nem todo item fecha.
 *
 * Esta funcao mora aqui e nao no parse porque a auditoria precisa reler a folha
 * com a MESMA regua que a gravou. Duas reguas dariam dois numeros para a mesma
 * pergunta, e o errado seria sempre o que ninguem estivesse olhando.
 */
function itensDaFolha(linhas){
  linhas=linhas||[];
  const idxSku=[]; linhas.forEach((l,k)=>{ if(/SKU:\s*\S/.test(l)) idxSku.push(k); });
  const itens=[];
  linhas.forEach((l,i)=>{
    const ms=l.match(/SKU:\s*(\S+)/); if(!ms) return;
    const j=idxSku.indexOf(i);
    const antes=(j>0)?idxSku[j-1]+1:0;
    const depois=(j<idxSku.length-1)?idxSku[j+1]:linhas.length;
    const daqui=linhas.slice(i, Math.min(depois, i+4));
    const acima=linhas.slice(Math.max(antes, i-2), i+1);
    const pega=re=>{ for(const x of daqui){ const mm=x.match(re); if(mm) return mm[1]; } return null; };
    let desc=''; for(const x of acima){ const mm=x.match(/(Persiana[^|]*)$/); if(mm){ desc=mm[1].trim(); break; } }
    let comprador=''; for(const x of daqui){
      const mm=x.match(/^(.+?)\s+(?:Cor:|Quantidade:)/);
      if(mm && !/^(Pack ID|Venda|SKU|Desenho)/.test(mm[1]) && !/Persiana/i.test(mm[1])){ comprador=mm[1].trim(); break; }
    }
    const med=desc.match(/(\d)[,.](\d{2})\s*[xX]\s*(\d)[,.](\d{2})/);
    itens.push({
      packId:(pega(/Pack ID:\s*([\d ]+)/)||'').replace(/\s+/g,'')||null,
      venda:(pega(/Venda:\s*([\d ]+)/)||'').replace(/\s+/g,'')||null,
      sku:ms[1].trim(), cor:(pega(/Cor:\s*([^\n|]+)/)||'').trim()||null,
      comprador:comprador||null, desc:desc||null,
      larg: med?+(med[1]+med[2]):null, alt: med?+(med[3]+med[4]):null
    });
  });
  return itens;
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

/* O item inteiro (nao so o SKU), pela mesma ordem de chaves do parse. */
function itemDaFolha(volume, itens){
  return (volume.venda && (itens||[]).find(i=>i.venda===volume.venda))
      || (volume.packId && (itens||[]).find(i=>i.packId===volume.packId))
      || null;
}

/* QUAIS TRAVAS ESTAO DE FATO ATIVAS NESTE VOLUME.
 *
 * Cada conferencia do §5 depende de um dado existir dos DOIS lados. Quando o
 * dado some, a trava para de acusar em silencio — e silencio parece "tudo
 * certo". Medir a cobertura e o que transforma esse silencio em numero: se um
 * dia os codigos de SKU deixarem de carregar a cor, a linha da cor despenca na
 * auditoria e alguem pergunta por que, em vez de descobrir pela reclamacao.
 */
function travasAtivas(volume, item, coresConhecidas){
  const cod=String((volume&&volume.codigo)||'').toUpperCase().normalize('NFD')
    .replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9]/g,'');
  const corItem=String((item&&item.cor)||'').toUpperCase().normalize('NFD')
    .replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9]/g,'');
  return {
    medida: !!(item && item.larg && item.alt && /(\d{3})(\d{3})/.test(cod)),
    cor: !!(corItem && (cod.includes(corItem) ||
            [...(coresConhecidas||[])].some(c=>c!==corItem && c.length>2 && cod.includes(c)))),
    comprador: !!(item && item.comprador && volume && volume.buyer)
  };
}

module.exports={lerFolha,mapasDaFolha,skuDaFolha,itemDaFolha,itensDaFolha,travasAtivas,pageLines};
