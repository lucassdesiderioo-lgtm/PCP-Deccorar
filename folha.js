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

/* ── A MEDIDA ESCRITA NO ANUNCIO — dono unico ────────────────────────────────
 *
 * ⚠️ ELA DESLIGOU A CONFERENCIA 3 EM SILENCIO POR MESES.
 *
 * A leitura era `(\d)[,.](\d{2})x(\d)[,.](\d{2})` — um digito, virgula, dois
 * digitos. Isso le "1,60x1,40" e NAO le "170x170", que e como boa parte dos
 * anuncios escreve a mesma medida (em centimetros, sem virgula). Nesses, `larg`
 * e `alt` voltavam NULL, e a conferencia 3 do parse.js so acusa "quando os dois
 * lados existem": sem medida do anuncio, ela nao acusava nada.
 *
 * O modo de falhar e o pior que existe aqui: nao ha erro, nao ha bloqueio, e a
 * tela fica igual a de um volume conferido. Em 14/09/2026 um volume com anuncio
 * "170x170" e SKU BK160160BEGE passou limpo pela expedicao — a trava nao foi
 * contornada, ela nunca chegou a rodar. E a mesma doenca do §5: "uma trava que
 * para de acusar faz o mesmo silencio de 'esta tudo certo'".
 *
 * Agora a mesma medida e lida escrita de qualquer jeito, e devolvida SEMPRE em
 * centimetros inteiros — que e a unidade das colunas de `skus` (§7).
 *
 * ⚠️ E NAO HA "o formato": a auditoria de 14/09/2026 achou 41 volumes em 753
 * cujo titulo escreve a medida ROTULADA — "1,00 L X 1,00 A" (L de largura, A de
 * altura). Nenhum deles estava sendo conferido, e nada na tela dizia isso. Cada
 * formato novo que o anuncio inventa e mais um pedaco do catalogo saindo da
 * conferencia em silencio: quando mexer aqui, conferir o ponto cego com
 * `node conferir_medidas.js`, que conta exatamente isso.
 *
 * Duas guardas contra o oposto (acusar inocente, armadilha #10):
 *   - so vale medida PLAUSIVEL de persiana (30 a 400 cm). "Kit 3x2" nao e medida;
 *   - titulo que diz DUAS medidas diferentes devolve null. Nao e "bate" nem
 *     "nao bate": e "nao da pra dizer", e duvida nunca vira acusacao.
 */
/* O rotulo (L de largura, A de altura) vem colado no numero tanto quanto
   separado dele — "1,00 L X 1,00 A" e "1,65lx0,75a" sao o mesmo anuncio escrito
   por duas pessoas. Ele nao e enfeite: quando vem INVERTIDO e a unica coisa que
   diz que o primeiro numero e a altura, e ler na ordem errada nao da erro —
   acusa o volume certo, ou cala no errado. */
const MEDIDA=/(?<!\d)(\d{1,3})(?:[,.](\d{1,2}))?\s*(?:cm|mm|m)?\s*([lahLAH])?\s*[xX×]\s*(\d{1,3})(?:[,.](\d{1,2}))?\s*(?:cm|mm|m)?\s*([lahLAH])?(?![A-Za-z0-9])/g;
const PLAUSIVEL=v=>v>=30&&v<=400;
/* Sem parte decimal o numero ja E centimetro ("170"); com ela e metro e vira
   centimetro ("1,7" e "1,70" sao os mesmos 170 — o decimal completa a direita). */
const emCm=(inteiro,dec)=>(dec==null||dec==='')?+inteiro
  :Math.round(+inteiro*100+ +String(dec).padEnd(2,'0'));
function medidaDaDescricao(desc){
  const s=String(desc||''); const achadas=[]; let inicio=null,m;
  MEDIDA.lastIndex=0;
  while((m=MEDIDA.exec(s))){
    let l=emCm(m[1],m[2]), a=emCm(m[4],m[5]);
    const r1=String(m[3]||'').toLowerCase(), r2=String(m[6]||'').toLowerCase();
    /* "1,60 A x 1,40 L" e altura x largura. So inverte quando os DOIS rotulos
       estao escritos e dizem isso — um rotulo sozinho nao decide nada. */
    if((r1==='a'||r1==='h') && r2==='l'){ const t=l; l=a; a=t; }
    if(!PLAUSIVEL(l)||!PLAUSIVEL(a)) continue;
    if(inicio==null) inicio=m.index;
    achadas.push(l+'x'+a);
  }
  if(!achadas.length) return null;
  if(new Set(achadas).size>1) return null;   // o anuncio diz duas medidas: nao da pra dizer
  const [l,a]=achadas[0].split('x');
  return {larg:+l,alt:+a,inicio};
}

/* ── A MEDIDA ESCRITA DENTRO DO CODIGO DO SKU — dono unico ───────────────────
 *
 * O codigo e etiqueta livre (§7) e pode nao carregar medida nenhuma: null aqui
 * e "nao da pra conferir", nunca "nao bate". O que ele carrega vem em dois
 * formatos — `BK160140BEGE` e `BK110X240BEGE` (ou `ROLO SOB MEDIDA 137x212`) —
 * e o segundo era invisivel para a leitura antiga, que exigia os seis digitos
 * colados. Mais um lugar por onde a conferencia 3 saia de cena calada.
 *
 * As bordas (`(?<!\d)` / `(?!\d)`) existem para nao recortar tres digitos do
 * meio de um numero maior e comparar contra uma medida que ninguem escreveu.
 */
const MEDIDA_COD=/(?<!\d)(\d{3})\s*[xX]?\s*(\d{3})(?!\d)/;
function medidaDoCodigo(cod){
  const m=String(cod||'').match(MEDIDA_COD);
  return m?{larg:+m[1],alt:+m[2]}:null;
}

/* ── CONFERENCIA 6: o anuncio contra o CADASTRO (§5 do CLAUDE.md) ────────────
 *
 * A conferencia 3 compara o anuncio com a medida escrita dentro do CODIGO, e o
 * codigo e etiqueta livre: SKU que nao carrega medida no texto nunca foi
 * conferido por ela. Quem sabe mesmo o que a peca e sao as COLUNAS de `skus`.
 *
 * Mora aqui, e nao dentro do upload, porque a mesma pergunta e feita em dois
 * lugares: o exp_route.js a faz no volume que ENTRA, e o conferir_medidas.js a
 * faz no que JA ESTA GRAVADO. Duas copias dariam dois numeros para a mesma
 * pergunta — e o errado seria sempre o que ninguem estivesse olhando.
 *
 * Devolve null quando nao da pra conferir (falta medida de um dos lados, ou o
 * modelo nao cobra medida — acessorio nao tem largura e isso nao e pendencia,
 * §7). Silencio por falta de dado nunca vira bloqueio.
 */
function conflitoDeMedida(anuncio, cadastro, sku){
  const a=anuncio||{}, c=cadastro||{};
  const exige=(c.exige_medida==null)?1:c.exige_medida;
  if(!exige || !a.larg || !a.alt || !c.larg || !c.alt) return null;
  if(+c.larg===+a.larg && +c.alt===+a.alt) return null;
  return 'o anuncio diz '+a.larg+'x'+a.alt+' e o cadastro de '+sku+' e '+c.larg+'x'+c.alt;
}

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
    const med=medidaDaDescricao(desc);
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
      /* Sempre em centimetros inteiros, a mesma unidade das colunas de `skus`
         (§7) — o anuncio escrevendo "1,60x1,40" ou "160x140" da no mesmo. */
      larg: med?med.larg:null, alt: med?med.alt:null
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
    /* A mesma leitura do parse (medidaDoCodigo) — cobertura medida com uma
       regua diferente da que acusa contaria protecao que nao existe. */
    medida: !!(item && item.larg && item.alt && medidaDoCodigo(cod)),
    cor: !!(corItem && (cod.includes(corItem) ||
            [...(coresConhecidas||[])].some(c=>c!==corItem && c.length>2 && cod.includes(c)))),
    comprador: !!(item && item.comprador && volume && volume.buyer)
  };
}

module.exports={lerFolha,mapasDaFolha,skuDaFolha,itemDaFolha,itensDaFolha,travasAtivas,pageLines,
                medidaDaDescricao,medidaDoCodigo,conflitoDeMedida};
