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
/* A MEDIDA DENTRO DO TITULO DO ANUNCIO — dono unico (23/09/2026).
 *
 * O Mercado Livre escreve a mesma medida de tres jeitos, e o terceiro e o que
 * derrubava a conferencia 3 em silencio:
 *
 *     1,60x1,40                    a maioria
 *     1,80 X 1,50                  com espaco
 *     Medida L 1,80 X A 1,50       anuncio de CATALOGO, com "L" e "A" no meio
 *
 * O `L` e o `A` sao rotulo de largura e altura — o mesmo dado, escrito por
 * extenso. O regex antigo parava no espaco antes do `A` e nao casava nada, e ai
 * `ehAnuncio` dizia que aquela linha nem era titulo: o anuncio saia vazio, a
 * conferencia 3 ficava sem um dos lados e parava de acusar SEM AVISAR — que e
 * o silencio da armadilha #10.
 *
 * Eram os cinco produtos "Tóquio" do PDF de 23/09, 5 em 28. Ter a conta num
 * lugar so e o que impede a proxima variacao de formato ser consertada em um
 * dos dois lugares e esquecida no outro. */
const MEDIDA_TITULO=/(\d)[,.](\d{2})\s*(?:[xX]|\s[xX]\s)\s*(?:A\s*)?(\d)[,.](\d{2})/;
function medidaDoTitulo(texto){
  const m=String(texto||'').match(MEDIDA_TITULO);
  return m ? { larg:+(m[1]+m[2]), alt:+(m[3]+m[4]) } : null;
}

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
/* ⚠️ A SEGUNDA PASSADA: O IDENTIFICADOR QUE FICOU ACIMA DO `SKU:` (23/09/2026).
 *
 * A leitura principal monta o item da linha do `SKU:` PARA BAIXO e nunca olha
 * para tras — e a regra da armadilha #4, e ela existe porque olhar para tras
 * herdou o Pack ID do vizinho e mandou a peca errada pro Abraao.
 *
 * Mas ha um caso em que o dado esta acima e e mesmo dele. Quando a descricao do
 * anuncio e longa, ela quebra em duas linhas e desfaz o pareamento das colunas:
 *
 *     ...Blecaute Roller Cor Bege Claro -
 *     Venda: 2000018596292056 Tóquio 002     <- a venda sobe
 *     SKU: BK180150BEGE
 *     Paula Cristine Lupepso
 *
 * Sao os produtos "Tóquio", e no PDF de 23/09 eram 5 em 28. A folha NAO esta
 * sem o dado e a etiqueta tambem nao — e o pareamento que se desfez. Trata-los
 * como leitura quebrada retem cinco volumes que nao tem duvida nenhuma, e
 * mandar alguem reabrir cinco pedidos no ML para reler um numero que o
 * documento ja traz e a armadilha #10: a trava que acusa o inocente.
 *
 * O QUE MANTEM O CASO ABRAAO FECHADO e a palavra REIVINDICADO. So entra aqui
 * quem ficou sem pack E sem venda, e so se a janela acima tiver EXATAMENTE UMA
 * linha cujo numero nenhum outro item pegou. No caso Abraao o pack de cima
 * pertence ao vizinho — esta reivindicado, e por isso nao e oferecido. Duas
 * livres tambem nao resolvem: ambiguidade nao se desempata por chute.
 *
 * E nao afrouxa o pacote (§5-B): o irmao de verdade nao tem venda em lugar
 * nenhum, entao nao ha o que reivindicar e ele segue sendo peca a mais.
 * Validado contra os dois PDFs reais — resolve os 5 Tóquio e nao toca no
 * irmao `BK130130BRANCO`. Casos 22 e 23 do `teste_parse.js`.
 */
function reivindicarAcima(linhas, itens, janelas){
  const usadas=new Set(), packs=new Set();
  itens.forEach(it=>{ if(it.venda) usadas.add(it.venda); if(it.packId) packs.add(it.packId); });
  itens.forEach((it,n)=>{
    if(it.venda || it.packId) return;                 // ja se identifica sozinho
    const j=janelas[n]; if(!j) return;
    const livres=[];
    for(let k=j.de; k<j.ate; k++){
      const linha=String(linhas[k]||'');
      const v=(linha.match(/Venda:\s*([\d ]+)/)||[])[1];
      const p=(linha.match(/Pack ID:\s*([\d ]+)/)||[])[1];
      if(v){ const x=v.replace(/\s+/g,''); if(x && !usadas.has(x)) livres.push({venda:x}); }
      if(p){ const x=p.replace(/\s+/g,''); if(x && !packs.has(x)) livres.push({packId:x}); }
    }
    if(livres.length!==1) return;                     // zero ou ambiguo: nao mexe
    if(livres[0].venda){ it.venda=livres[0].venda; usadas.add(it.venda); }
    else { it.packId=livres[0].packId; packs.add(it.packId); }
  });
}

function itensDaFolha(linhas){
  linhas=linhas||[];
  const idxSku=[]; linhas.forEach((l,k)=>{ if(/SKU:\s*\S/.test(l)) idxSku.push(k); });
  const itens=[], janelas=[];
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
    const ehAnuncio=x=>/Persiana/i.test(x)||MEDIDA_TITULO.test(x);
    /* ⚠️ O TITULO QUE QUEBRA EM DUAS LINHAS (23/09/2026). O anuncio de catalogo
       e longo e o PDF o parte no meio:

           ...Blecaute Roller Cor Bege Claro -
           Tóquio 002

       Pegar so a primeira metade deixa o anuncio truncado na tela de Bloqueados
       (onde alguem precisa RECONHECER a venda no Mercado Livre) e, quando a
       medida cai na segunda linha, tira um dos lados da conferencia 3.
       A emenda so acontece quando a linha seguinte NAO e campo e NAO e outro
       anuncio — o mesmo cuidado que o `modalidadeDespacho` ja toma com a linha
       "Despachar:" partida (§8-B). Linha de campo nunca vira parte do titulo. */
    /* A JANELA VAI ATE O SKU ANTERIOR, E A BUSCA E DE BAIXO PRA CIMA.
       `acima` olhava 2 linhas para tras, e isso bastava no layout normal. No
       anuncio de catalogo nao: o identificador vem em linha PROPRIA e empurra o
       titulo para tres linhas acima —

           Cortina Rolo Blackout Medida L 1,80 X A 1,50 ... Cor Bege Claro -
           E4M2YZZCLZMRDKXC6QUEAE7FSI
           Tóquio 002
           Venda: 2000018578029006
           SKU: BK180150BEGE

       `antes` (a linha logo depois do SKU anterior) ja e a guarda que impede
       pegar o titulo do vizinho, entao a janela pode ir ate la. E a varredura e
       DE BAIXO PRA CIMA porque o titulo de um item e o mais PROXIMO dele: com a
       janela larga, procurar de cima acharia primeiro o que estiver mais longe. */
    const largo=linhas.slice(antes, i);
    const soCodigo=x=>/^[A-Z0-9]{6,}$/.test(String(x||'').trim()) && /[0-9]/.test(x);
    let desc='';
    for(let k=largo.length-1;k>=0;k--){
      const x=largo[k];
      if(ehCampo(x)||!ehAnuncio(x)) continue;
      /* A CONTINUACAO DO TITULO PARTIDO. Junta o que vem depois dele ate a
         primeira linha de campo, pulando o identificador do envio — ele nao e
         anuncio e ninguem o reconhece na tela do ML. */
      const partes=[tituloDoAnuncio(x)];
      for(let m=k+1;m<largo.length;m++){
        const y=String(largo[m]||'').trim();
        if(ehCampo(y)) break;
        if(!y || soCodigo(y)) continue;
        partes.push(y);
      }
      desc=partes.join(' ').trim(); break;
    }
    let comprador=''; for(const x of daqui){
      const mm=x.match(/^(.+?)\s+(?:Cor:|Quantidade:)/);
      if(mm && !/^(Pack ID|Venda|SKU|Desenho)/.test(mm[1]) && !/Persiana/i.test(mm[1])){ comprador=mm[1].trim(); break; }
    }
    /* O NOME SOZINHO NA LINHA (23/09/2026). A busca acima depende das duas
       colunas da folha casarem — o nome a esquerda, `Cor:` ou `Quantidade:` a
       direita. Quando a descricao do anuncio e longa e quebra linha, o
       pareamento se desfaz e o comprador cai sozinho:

         SKU: BK180150BEGE
         Paula Cristine Lupepso      <- sem nada a direita
         Quantidade: 1

       Sao os produtos "Tóquio", cujo nome comercial de cor estoura a largura.
       Sem isto o comprador vinha `null` e a conferencia 2 (§5) — a UNICA que
       nao depende do Pack ID — ficava desligada justamente neles.

       O criterio e estreito de proposito: so letras e espacos (nome nao tem
       digito nem dois-pontos, o que ja derruba `Tóquio 002` e os codigos de
       identificacao), duas palavras ou mais, e nunca a linha do proprio SKU.
       Nome ilegivel continua virando `null`, nunca acusacao (regra dos dois
       lados, armadilha #10). */
    if(!comprador) for(const x of daqui.slice(1)){
      const t=String(x||'').trim();
      if(/[:0-9]/.test(t)) continue;
      if(/persiana|cortina|blackout|rol[oô]/i.test(t)) continue;
      if(!/^[A-Za-zÀ-ÿ'’.\- ]+$/.test(t)) continue;
      if(t.split(/\s+/).length<2) continue;
      comprador=t; break;
    }
    const med=medidaDoTitulo(desc);   // regua unica: ver MEDIDA_TITULO
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
      larg: med?med.larg:null, alt: med?med.alt:null
    });
    janelas.push({de:antes, ate:i});
  });
  reivindicarAcima(linhas, itens, janelas);
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

/* A LICENCA PRA LER AUSENCIA COMO PACOTE (§5, armadilha #23).
 *
 * Um item sem Pack ID, sem Venda e sem comprador tem duas leituras possiveis,
 * e elas sao OPOSTAS:
 *
 *   pacote de verdade   1 etiqueta, 2 itens — TODA etiqueta achou o seu item
 *   leitura quebrada    2 etiquetas, 2 itens — uma etiqueta ficou SEM item
 *
 * A evidencia que separa as duas nao esta no item: esta na conta do documento.
 * O orfao so vale como irmao quando NENHUMA etiqueta do PDF ficou sem item na
 * folha. Sobrou etiqueta orfa, o pdf.js comeu campo, e tratar aquilo como peca
 * a mais juntaria duas vendas separadas numa caixa que nao existe — o erro
 * contrario ao que o pacote veio consertar.
 *
 * DONO UNICO, e aqui isso nao e estilo: o upload (parse.js) e o
 * backfill_pacote.js tem que ler pela MESMA regua. Uma copia solta no backfill
 * grava peca que o upload teria retido — e o backfill grava em cima de volume
 * que JA ANDOU, onde o erro custa baixa de estoque, nao um card na tela.
 */
function etiquetasSemItem(etiquetas, blocos){
  const m=mapasDaFolha(blocos);
  return (etiquetas||[]).filter(e =>
    !((e.venda&&m.porVenda[e.venda])||(e.packId&&m.porPack[e.packId])));
}
function pdfFecha(etiquetas, blocos){ return etiquetasSemItem(etiquetas,blocos).length===0; }

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
                tipoDaPagina,nfDaNota,irmaosDoPacote,irmaosDe,tituloDoAnuncio,medidaDoTitulo,
                etiquetasSemItem,pdfFecha};
