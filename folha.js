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

/* O QUE E CADA PAGINA DO PDF — 'control' (folha), 'danfe' (nota), 'label'
   (etiqueta) ou 'other'.
 *
 * A ORDEM DOS TESTES E A REGRA, nao estilo: a folha de controle ganha de tudo
 * (e a unica que traz "SKU:"), a nota vem antes da etiqueta porque a DANFE
 * tambem carrega numeros de venda no corpo, e "other" e o resto.
 *
 * Mora aqui pelo mesmo motivo do itensDaFolha: o parse.js classifica para
 * GRAVAR o volume (e e daqui que sai a pagina da nota que vai ser impressa), o
 * rastrear.js e o conferir_nf.js classificam para CONFERIR o que ficou gravado.
 * Com duas copias, a conferencia chamaria de nota uma pagina que o parse nao
 * chamou — e diria com autoridade que a impressao esta certa olhando outro
 * papel. */
function tipoDaPagina(texto){
  const t=String(texto||'');
  if(/SKU:/.test(t)) return 'control';
  if(/DANFE/.test(t)||/Chave de acesso/i.test(t)) return 'danfe';
  if(/Pack ID:/.test(t)||/Venda:/.test(t)) return 'label';
  return 'other';
}

/* O NUMERO DA NOTA dentro de uma pagina de DANFE — a chave que liga a etiqueta
   ("NF: 5416") a pagina que vai ser impressa junto com ela. Mesma regua nos
   dois lados pelo motivo acima. Devolve so digitos, ou null. */
function nfDaNota(texto){
  const m=String(texto||'').match(/N[úu]mero\s*([\d.,]+)/i);
  return m?m[1].replace(/\D/g,'')||null:null;
}

/* Devolve {paginas, etiquetas:[{pagina,packId,venda,nf}], notas:[{pagina,nf}],
   blocos:[{packId,venda,sku}]}.
   Os blocos saem pelo tokenizer item a item — o mesmo criterio que o parse.js usa
   para decidir o SKU (leitura 1). E de proposito: a auditoria pergunta "o volume
   gravado bate com o que a folha diz", e a folha, aqui, fala pela leitura que
   manda. */
async function lerFolha(arquivo){
  const pdfjs=require('pdfjs-dist/legacy/build/pdf.js');
  const pdf=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(arquivo))}).promise;
  const etiquetas=[], notas=[], ctrlLinhas=[];
  for(let p=1;p<=pdf.numPages;p++){
    const lines=pageLines(await (await pdf.getPage(p)).getTextContent());
    const text=lines.join('\n');
    const tipo=tipoDaPagina(text);
    if(tipo==='control'){ lines.forEach(x=>ctrlLinhas.push(x)); }
    else if(tipo==='danfe'){ notas.push({pagina:p,nf:nfDaNota(text)}); }
    else if(tipo==='label'){
      const g=re=>{ const m=text.match(re); return m?m[1].replace(/\s+/g,''):null; };
      etiquetas.push({pagina:p,packId:g(/Pack ID:\s*([\d ]+)/),venda:g(/Venda:\s*([\d ]+)/),
                      nf:(text.match(/NF:\s*(\d+)/)||[])[1]||null});
    }
  }
  return {paginas:pdf.numPages, etiquetas, notas, blocos:itensDaFolha(ctrlLinhas)};
}

/* O TITULO DO ANUNCIO, SEM O CODIGO DA COLUNA DA ESQUERDA.
 *
 * A linha de cima do bloco traz duas colunas: a identificacao do envio
 * (`RZ3OQY65HJJ3DJLW6PE4Z2J3OQ`) e o titulo do anuncio, como o ML escreveu.
 * O codigo nao e o anuncio — ninguem o reconhece na tela do Mercado Livre —,
 * entao ele sai e o resto da linha fica INTEIRO.
 *
 * So sai o que e claramente codigo: um bloco colado de maiusculas COM digito.
 * Palavra de titulo em caixa alta ("BLACKOUT") nao tem digito e fica onde
 * esta — podar por tamanho comeria a primeira palavra de um titulo gritado.
 */
function tituloDoAnuncio(linha){
  const s=String(linha||'').trim();
  const m=s.match(/^([A-Z0-9]{6,})\s+(?=\S)/);
  if(m && /[0-9]/.test(m[1]) && /[A-Z]/.test(m[1])) return s.slice(m[0].length).trim();
  return s;
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
    /* A DESCRICAO E A LINHA INTEIRA DO ANUNCIO, NAO O PEDACO A PARTIR DE
       "Persiana".
       Ate 17/09/2026 o recorte era `/(Persiana[^|]*)$/`: pegava do "Persiana"
       ate o fim da linha. Nos titulos em que a palavra vem NO COMECO
       ("Persiana Cortina Rolo Blackout 1,60x1,40 ...") isso devolvia a linha
       toda por acaso; nos em que ela vem NO FIM — que e como o ML escreve hoje
       ("Cortina Rolo Blackout 1,50x1,50 Blecaute Persiana Cinza") — sobrava
       "Persiana Cinza", e com ela iam embora a LINHA do produto e a MEDIDA.
       O estrago era em tres lugares de uma vez: a tela de Bloqueados mostrava
       "anuncio: Persiana Cinza", que nao identifica venda nenhuma no ML e
       obrigava a abrir o pedido la pra saber de que anuncio se tratava; a
       conferencia 3 (§5) ficava sem medida para conferir e parava de acusar em
       silencio; e a conferencia 5 aprendia "PERSIANA CINZA" como familia — que
       muda com a COR, quando a familia e justamente a linha do produto.

       Quem manda agora e a estrutura da folha, nao a palavra: a candidata e a
       linha acima do "SKU:" que NAO e linha de campo. A ancora continua de pe
       so como guarda contra o cabecalho da pagina ("Identifiicação Produtos",
       "Despachem as suas vendas o quanto antes."), que aparece acima do
       primeiro item — e ela aceita tambem a MEDIDA escrita por extenso, que e
       o mesmo dado que a conferencia 3 ja le e nao envelhece como lista de
       palavras: titulo de persiana traz um ou o outro, cabecalho nao traz
       nenhum. */
    const ehCampo=x=>/(?:Pack ID|Venda|SKU|Quantidade|Cor|Desenho do tecido)\s*:/.test(x);
    const ehAnuncio=x=>/Persiana/i.test(x)||/(\d)[,.](\d{2})\s*[xX]\s*(\d)[,.](\d{2})/.test(x);
    let desc=''; for(const x of acima){ if(!ehCampo(x)&&ehAnuncio(x)){ desc=tituloDoAnuncio(x); break; } }
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
      /* QUANTIDADE — quantas PECAS aquele item tem.
         Um volume nao e uma peca: o item que diz "Quantidade: 3" e uma
         etiqueta so, e o sistema grava uma linha so em `lote`. Quem conta as
         persianas do PDF na mao chega a um numero maior que o do sistema, e
         ate aqui nao havia onde ver por que. Ninguem DECIDE nada com este
         campo — ele existe pra `rastrear.js --lote` conseguir explicar a
         diferenca em vez de deixar o operador achando que sumiu peca. */
      qtd: Math.max(1, parseInt(pega(/Quantidade:\s*(\d+)/)||'1',10)||1),
      larg: med?+(med[1]+med[2]):null, alt: med?+(med[3]+med[4]):null
    });
  });
  return itens;
}

/* ── O PACOTE DE VARIOS PRODUTOS (15/09/2026) ───────────────────────────────
 *
 * O Mercado Livre passou a despachar mais de um produto na MESMA etiqueta. O
 * painel dele chama isso de "Pacote de 2 produtos · 3 unidades"; na folha de
 * controle sai assim (PDF real, NF 6585, Fabiano Pereira):
 *
 *     RZ3OQY... Cortina Rolo Blackout 1,20x1,20 Blecaute Persiana Bege
 *     Pack ID: 2000015040457349   SKU: BK120120BEGE
 *     Venda: 2000018468081338     Quantidade: 1
 *     Fabiano Pereira             Cor: Bege
 *                                 Desenho do tecido: Liso
 *     Cortina Rolo Blackout 1,40x1,40 Persiana Blecaute Bege     <- o IRMAO
 *     SKU: BK140140BEGE
 *     Quantidade: 2
 *     Cor: Bege
 *     Desenho do tecido: Liso
 *
 * O item IRMAO nao traz Pack ID, nem Venda, nem comprador — so descricao, SKU,
 * quantidade, cor e tecido. Ele nao tem identidade propria porque a identidade
 * dele E A DO ITEM DE CIMA: os dois viajam na mesma etiqueta, na mesma caixa.
 *
 * ⚠️ NAO CONFUNDIR COM O CASO ABRAAO (§5, armadilha #4). La o item tambem vinha
 * sem Pack ID, mas trazia `Venda:` E o comprador: era um item inteiro cuja
 * etiqueta veio pela venda em vez do pack. Herdar o pack do vizinho ali mandou
 * a peca errada pro cliente, e e por isso que a janela do bloco nao olha pra
 * tras. Aqui os TRES campos faltam DE UMA VEZ — e e isso que separa os dois
 * casos sem adivinhacao: o irmao e o unico item que nao tem como ser
 * identificado sozinho. Um item com venda ou comprador NUNCA e irmao.
 *
 * Devolve [{pai, irmaos:[...]}] so dos grupos que tem irmao. */
function irmaosDoPacote(blocos){
  const grupos=[]; let atual=null;
  (blocos||[]).forEach(b=>{
    const orfao = !b.packId && !b.venda && !b.comprador;
    if(!orfao){ atual={pai:b, irmaos:[]}; grupos.push(atual); return; }
    /* Orfao antes de qualquer item identificado nao e irmao de ninguem: e folha
       que comeca torta, e isso e outro problema — nao se inventa um pai. */
    if(atual) atual.irmaos.push(b);
  });
  return grupos.filter(g=>g.irmaos.length);
}

/* Os irmaos de UM item, pela mesma regua. Devolve [] quando o item viaja
   sozinho, que e o caso normal. */
function irmaosDe(blocos, pai){
  const g=irmaosDoPacote(blocos).find(x=>x.pai===pai);
  return g?g.irmaos:[];
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

module.exports={lerFolha,mapasDaFolha,skuDaFolha,itemDaFolha,itensDaFolha,travasAtivas,pageLines,
                tipoDaPagina,nfDaNota,irmaosDoPacote,irmaosDe,tituloDoAnuncio};
