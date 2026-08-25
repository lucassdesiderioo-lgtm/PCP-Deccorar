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
  const controlText=controlLines.join('\n');
  /* AS DUAS LEITURAS FICAM SEPARADAS, DE PROPOSITO.
     Antes elas se misturavam num mapa so e a primeira a escrever mandava — foi
     assim que o SKU errado chegou no cliente sem ninguem perceber. Separadas,
     uma vira TESTEMUNHA da outra: quando discordam sobre o mesmo volume, o
     upload nao escolhe — bloqueia e manda alguem conferir (§6: melhor reter
     que adivinhar). O SKU de um registro nunca e sobrescrito; a cor pode ser
     completada, mas so quando o SKU e o mesmo. */
  const leitura1={pack:{},venda:{}};   // por BLOCO — a que manda
  const leitura2={pack:{},venda:{}};   // item a item (tokenizer) — a testemunha
  const guardar=(onde,rec)=>{
    const grava=(mapa,chave)=>{
      if(!chave) return;
      if(!mapa[chave]) mapa[chave]=rec;
      else if(!mapa[chave].cor && rec.cor && mapa[chave].sku===rec.sku) mapa[chave].cor=rec.cor;
    };
    grava(onde.pack,rec.packId); grava(onde.venda,rec.venda);
  };
  const put=rec=>guardar(leitura1,rec);
  const byPack=leitura1.pack, byVenda=leitura1.venda;

  /* LEITURA 1 (a que manda): UM BLOCO POR ITEM.
     A folha do Mercado Livre monta cada item em cinco linhas fixas:

        <identificacao>  Persiana ... 1,60x1,40 Blecaute Cinza
        Pack ID: 2000014610097547   SKU: BK160140CINZA
        Venda: 2000018016683414     Quantidade: 1
        Tiago Sanches               Cor: Cinza
                                    Desenho do tecido: Blackout

     Entao o item nao precisa de separador nenhum: ele E a janela de linhas em
     volta do seu proprio "SKU:". Tudo que sai dali — pack, venda, comprador,
     cor, descricao — e do MESMO item, e nao ha como herdar campo do vizinho.
     Era exatamente essa heranca que mandava a peca errada.

     De quebra, o bloco traz duas coisas que nenhuma leitura anterior via: o
     COMPRADOR (que tambem esta na etiqueta, e por isso liga uma na outra sem
     depender do Pack ID) e a DESCRICAO com a medida escrita por extenso (que
     confere o proprio SKU). Ambas viram conferencia la embaixo. */
  /* A montagem do bloco mora no folha.js — o mesmo codigo que a auditoria usa
     pra reler o PDF depois. Se fossem duas copias, a conferencia poderia
     "confirmar" um volume com uma regua diferente da que o gravou. */
  const itensFolha=require('./folha').itensDaFolha(controlLines);
  itensFolha.forEach(put);
  /* As cores que a propria folha usa, para a conferencia 4 la embaixo. Sai do
     documento e nao de uma lista no codigo: cor nova do catalogo entra sozinha,
     sem ninguem lembrar de vir aqui. */
  const semAcento=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9]/g,'');
  const coresDaFolha=new Set(itensFolha.map(i=>semAcento(i.cor)).filter(c=>c && c.length>2));

  /* LEITURA 2 (a testemunha): o tokenizer, que percorre a folha inteira e fecha
     cada "SKU:" com o Pack ID e a Venda que vieram antes dele. Ele NAO decide
     nada — existe para discordar. Le por um caminho diferente do bloco, entao
     quando os dois chegam ao mesmo SKU para o mesmo volume, a chance de ambos
     errarem igual e pequena; quando discordam, o volume e retido. */
  { const tok=/(Pack ID:\s*([\d ]+))|(Venda:\s*([\d ]+))|(SKU:\s*(\S+))|(Cor:\s*([^\n]+))/g; let m,pk=null,vd=null,last=null;
    while((m=tok.exec(controlText))){
      if(m[2])pk=m[2].replace(/\s+/g,'');
      else if(m[4])vd=m[4].replace(/\s+/g,'');
      else if(m[6]){ last={packId:pk,venda:vd,sku:m[6].trim(),cor:null}; guardar(leitura2,last); pk=null;vd=null; }
      else if(m[8]&&last&&!last.cor) last.cor=m[8].trim();
    } }
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
    /* O VOLUME SO PASSA SE TUDO CONCORDAR. Sao tres conferencias independentes,
       e qualquer uma delas segura a peca — o preco de reter um volume e uma
       conversa; o de mandar a peca errada e a reputacao no Mercado Livre. */
    const busca=(L)=>(venda&&L.venda[venda])||(packId&&L.pack[packId])||null;
    const r1=busca(leitura1), r2=busca(leitura2), rec=r1||r2;
    const motivos=[];

    // 1. as duas leituras da folha discordam sobre o SKU deste volume
    if(r1&&r2&&r1.sku!==r2.sku) motivos.push('leituras divergem: '+r1.sku+' / '+r2.sku);

    /* 2. O COMPRADOR DA ETIQUETA NAO E O DO ITEM.
       A etiqueta traz o nome de quem comprou e o bloco da folha tambem. Se o
       volume foi casado com o item errado, o Pack ID pode ate coincidir, mas o
       NOME nao vai — e essa e a unica conferencia que nao depende do numero que
       justamente desalinha. So acusa quando os dois nomes existem: nome que nao
       deu pra ler nao vira acusacao. */
    const nomeChave=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim();
    if(rec && rec.comprador && buyer){
      const a=nomeChave(buyer), b=nomeChave(rec.comprador);
      if(a && b && a!==b && a.indexOf(b)<0 && b.indexOf(a)<0)
        motivos.push('comprador nao bate: etiqueta "'+buyer+'" / folha "'+rec.comprador+'"');
    }

    /* 3. A DESCRICAO DO ANUNCIO NAO BATE COM O SKU.
       A folha escreve a medida por extenso ("1,60x1,40") ao lado do SKU
       (BK160140...). Sao a mesma informacao por dois caminhos: o codigo e o
       texto do anuncio. Discordaram, alguma das duas esta trocada. Vale so
       quando o codigo carrega medida no formato antigo — SKU e etiqueta livre
       (§7), e ausencia de medida no codigo nunca vira acusacao. */
    if(rec && rec.larg && rec.alt){
      const m=String(rec.sku||'').match(/(\d{3})(\d{3})/);
      if(m && (+m[1]!==rec.larg || +m[2]!==rec.alt))
        motivos.push('descricao diz '+rec.larg+'x'+rec.alt+' e o SKU e '+rec.sku);
    }

    /* 4. A COR DO ANUNCIO NAO BATE COM A COR NO CODIGO.
       Medida sozinha nao separa duas pecas do mesmo cliente que so diferem na
       cor — e cliente com dois itens de SKUs diferentes existe (1 em 46 no PDF
       de 24/08: BK160160CINZA e BK160160BEGE, mesma medida). Sem esta, um
       vinculo trocado entre esses dois passaria por todas as outras.
       A lista de cores sai da PROPRIA folha (os campos "Cor:"), nunca de uma
       lista fixa no codigo: cor nova entra sozinha. So acusa quando da pra ler
       cor nos DOIS lados — SKU e etiqueta livre (§7), e codigo sem cor nao e
       acusacao. */
    if(rec && rec.cor && coresDaFolha.size>1){
      const cod=semAcento(rec.sku), corItem=semAcento(rec.cor);
      if(corItem && !cod.includes(corItem)){
        const outra=[...coresDaFolha].find(c=>c!==corItem && c.length>2 && cod.includes(c));
        if(outra) motivos.push('anuncio diz cor '+rec.cor+' e o SKU e '+rec.sku);
      }
    }
    const conflito=motivos.length?motivos.join(' · '):null;
    let danfePage=null;
    if(nf&&danfeByNf[nf]) danfePage=danfeByNf[nf];
    else if(pages[p+1]&&pages[p+1].type==='danfe') danfePage=p+1;
    orders.push({sku:rec?rec.sku:null,cor:(rec&&rec.cor)||'',conflito,
      /* A descricao do anuncio vai junto: e ela que diz a LINHA do produto
         ("Cortina Rolo Blackout" x "Toucher Rolo Evolux"), a unica dimensao que
         medida e cor nao separam. O upload guarda e aprende com ela. */
      descricao:(rec&&rec.desc)||null,
      buyer:buyer||'(sem nome)',city,nf,packId,venda,codes:[...codes],labelPage:p-1,danfePage:danfePage!=null?danfePage-1:null});
  }
  return orders;
}
module.exports={parsePdf};
