#!/usr/bin/env node
/* A NOTA FISCAL DE CADA VOLUME — quem divide venda, quem divide NF, e o que a
 * impressao faz com isso.
 *
 *   node conferir_nf.js              todo o historico
 *   node conferir_nf.js 30           so os ultimos 30 dias
 *   node conferir_nf.js --pdf [30]   rele tambem os PDFs ainda no servidor
 *
 * Responde tres perguntas que nenhuma tela responde hoje:
 *
 *   1. existe VENDA com mais de um SKU?
 *   2. existe CLIENTE com mais de uma persiana na MESMA NF?
 *   3. o que a impressao de NF faz nesses casos?
 *
 * As duas primeiras parecem a mesma pergunta e nao sao. A regra do dono (§5 do
 * CLAUDE.md) e "uma venda = uma etiqueta = uma persiana", entao venda repetida
 * seria uma contradicao do documento de origem. NF repetida nao: a nota e do
 * PEDIDO, e nada impede o cliente levar tres persianas numa nota so — sao tres
 * vendas, tres etiquetas, tres caixas e UMA nota. E ai a mesma pagina de nota e
 * impressa tres vezes, uma por caixa, o que esta certo e nunca foi conferido.
 *
 * SO LE. Nao grava, nao corrige, nao apaga. Pode rodar em producao.
 */
const fs=require('fs'), path=require('path');
const Database=require('better-sqlite3');

const DB=process.env.PCP_DB||'/opt/expedicao/dados.db';

const args=process.argv.slice(2);
const COM_PDF=args.includes('--pdf');
const DIAS=parseInt(args.find(a=>/^\d+$/.test(a))||'0',10);

/* A regua de "estes dois volumes sao do mesmo cliente?" e a MESMA da conferencia
   2 do upload (parse.js). Com outra normalizacao este relatorio chamaria de
   gente diferente quem o upload ja aceitou como a mesma pessoa — e a lista de
   alarme viria cheia de falso positivo, que e a armadilha #10: trava que acusa
   inocente para de proteger contra o culpado. */
const {mesmoCliente}=require('./nome');
/* "O que e esta pagina do PDF" e "qual o numero desta nota" saem do folha.js,
   que e por onde o parse.js gravou. Conferir a impressao com outra regua seria
   conferir olhando um papel diferente do que a impressao usa. */
const {lerFolha,tipoDaPagina,nfDaNota}=require('./folha');

const T=s=>console.log(s);
const linha=()=>T('─'.repeat(74));
const tit=s=>{ T(''); linha(); T(s); linha(); };
const db=new Database(DB,{readonly:true});

/* Volume de modo teste nao e venda de ninguem (§11) e ficaria no meio da lista
   como se fosse. O recorte por dias e opcional: a pergunta e "existe algum", e
   ela vale pro historico inteiro. */
const JANELA = DIAS ? " AND data >= date('now','localtime','-'||?||' day')" : '';
const P = DIAS ? [DIAS] : [];
const BASE = "COALESCE(teste,0)=0"+JANELA;

const total=db.prepare('SELECT COUNT(*) c FROM lote WHERE '+BASE).get(...P).c;
const periodo=db.prepare('SELECT MIN(data) a, MAX(data) b FROM lote WHERE '+BASE).get(...P);

tit('A NOTA FISCAL DOS VOLUMES — '+total+' volume(s)'+(DIAS?(' nos ultimos '+DIAS+' dias'):' no historico inteiro'));
T('banco '+DB);
if(periodo&&periodo.a) T('de '+periodo.a+' a '+periodo.b+'   (volumes de modo teste ficam de fora)');

/* ── 1. UMA VENDA COM MAIS DE UM SKU ────────────────────────────────────────
   O esperado aqui e ZERO, por dois motivos somados: a regra do dono diz que
   cada venda tem a sua etiqueta e a sua persiana, e a deduplicacao do upload
   (armadilha #5) recusa Pack ID ou Venda que ja exista no historico. Linha
   nesta lista e uma das duas coisas: volume gravado ANTES de 25/08/2026, quando
   a dedup so olhava o dia, ou o Mercado Livre repetindo um numero que ele
   promete nao repetir. Nos dois casos e pra olhar, nao pra consertar daqui. */
function porChave(coluna,rotulo,artigo){
  const g=db.prepare(`SELECT ${coluna} chave, COUNT(*) volumes, COUNT(DISTINCT codigo) skus,
      GROUP_CONCAT(DISTINCT codigo) lista, GROUP_CONCAT(DISTINCT buyer) compradores,
      GROUP_CONCAT(DISTINCT nf) nfs, MIN(data) de, MAX(data) ate
    FROM lote WHERE ${coluna} IS NOT NULL AND ${coluna}<>'' AND ${BASE}
    GROUP BY ${coluna} HAVING COUNT(*)>1 ORDER BY COUNT(*) DESC, MAX(data) DESC`).all(...P);
  if(!g.length){ T('  '+artigo+' '+rotulo+' aparece em mais de um volume.'); return g; }
  T('  '+g.length+' '+rotulo+'(s) em mais de um volume:');
  T('');
  g.slice(0,40).forEach(o=>{
    T('  '+rotulo+' '+o.chave+'   '+o.volumes+' volumes, '+o.skus+' SKU(s) — '+(o.lista||'(sem SKU)'));
    T('      cliente(s) '+(o.compradores||'—')+'   NF '+(o.nfs||'—')+'   '+o.de+(o.de!==o.ate?(' a '+o.ate):''));
  });
  if(g.length>40) T('  … e mais '+(g.length-40));
  return g;
}

tit('1. UMA VENDA COM MAIS DE UM SKU');
T('');
T('A regra do dono: uma venda = uma etiqueta = uma persiana. Aqui isso e medido');
T('contra o que ficou GRAVADO — e a dedup do upload ja recusa venda repetida,');
T('entao o esperado e vazio. O que a folha do PDF diz esta na secao 4.');
T('');
const porVenda=porChave('venda','venda','nenhuma');
T('');
const porPack=porChave('packId','pack','nenhum');

const vendaMultiSku=porVenda.filter(o=>o.skus>1);
const packMultiSku=porPack.filter(o=>o.skus>1);

/* ── 2. O MESMO CLIENTE COM MAIS DE UMA PERSIANA NA MESMA NF ────────────────
   Esta e a que pode ter resposta, e nao e defeito: a NF e do pedido, a etiqueta
   e do volume. Tres persianas numa nota so sao tres vendas, tres etiquetas,
   tres caixas — e UMA nota, impressa tres vezes.
   O que E defeito e a mesma NF com clientes DIFERENTES: ou a nota de uma pessoa
   esta colada na caixa de outra, ou o "NF:" foi lido errado da etiqueta. Os
   dois grupos saem separados, porque so o segundo pede acao. */
tit('2. O MESMO CLIENTE COM MAIS DE UMA PERSIANA NA MESMA NF');

const nfs=db.prepare(`SELECT nf, COUNT(*) volumes, COUNT(DISTINCT codigo) skus,
    GROUP_CONCAT(DISTINCT codigo) lista, MIN(data) de, MAX(data) ate
  FROM lote WHERE nf IS NOT NULL AND nf<>'' AND ${BASE}
  GROUP BY nf HAVING COUNT(*)>1 ORDER BY COUNT(*) DESC, MAX(data) DESC`).all(...P);

const volumesDaNf=db.prepare(`SELECT id,codigo,buyer,estagio,data,danfePage
  FROM lote WHERE nf=? AND ${BASE} ORDER BY id`);

const mesmaPessoa=[], pessoasDiferentes=[];
for(const o of nfs){
  const vs=volumesDaNf.all(o.nf,...P);
  /* Um grupo so e "o mesmo cliente" quando TODOS batem contra o primeiro. Nome
     que nao deu pra ler (mesmoCliente devolve null) nao acusa ninguem — e a
     regra dos dois lados do §5: silencio por falta de dado nao vira alarme. */
  const base=vs.find(v=>v.buyer)||vs[0];
  const divergentes=vs.filter(v=>mesmoCliente(base.buyer,v.buyer)===false);
  (divergentes.length?pessoasDiferentes:mesmaPessoa).push({nf:o.nf,o,vs,divergentes});
}

T('');
if(!nfs.length){
  T('  Nenhuma NF aparece em mais de um volume: cada nota tem exatamente uma');
  T('  persiana. Nao ha cliente com duas pecas na mesma nota no periodo.');
}else{
  T('  '+nfs.length+' NF(s) com mais de um volume — '+mesmaPessoa.length+' do mesmo cliente, '
    +pessoasDiferentes.length+' com clientes diferentes.');
}

if(mesmaPessoa.length){
  T('');
  T('  ── o mesmo cliente, varias pecas na mesma nota (normal) ──');
  mesmaPessoa.slice(0,40).forEach(g=>{
    T('');
    T('  NF '+g.nf+'   '+g.o.volumes+' persianas, '+g.o.skus+' SKU(s)   '+g.o.de);
    T('      '+(g.vs.find(v=>v.buyer)||{}).buyer);
    g.vs.forEach(v=>T('      #'+v.id+'  '+String(v.codigo||'(sem SKU)').padEnd(20)
      +String(v.estagio||'').padEnd(10)+'  nota pag '+(v.danfePage!=null?(v.danfePage+1):'— NENHUMA')));
  });
  if(mesmaPessoa.length>40) T('  … e mais '+(mesmaPessoa.length-40));
}

if(pessoasDiferentes.length){
  T('');
  T('  ⚠ ── a MESMA NF com clientes DIFERENTES — isto e pra olhar hoje ──');
  T('  Ou a nota de uma pessoa esta na caixa de outra, ou o "NF:" da etiqueta');
  T('  foi lido errado. Confira cada uma contra o pedido no Mercado Livre.');
  pessoasDiferentes.forEach(g=>{
    T('');
    T('  NF '+g.nf+'   '+g.o.volumes+' volumes   '+g.o.de);
    g.vs.forEach(v=>T('      #'+v.id+'  '+String(v.codigo||'(sem SKU)').padEnd(20)
      +String(v.buyer||'(sem nome)').padEnd(28)+String(v.estagio||'').padEnd(10)
      +'nota pag '+(v.danfePage!=null?(v.danfePage+1):'—')));
  });
}

/* ── 3. O QUE A IMPRESSAO FAZ COM ISSO ──────────────────────────────────────
   O GET /api/print/:id monta o PDF com duas paginas: a etiqueta do volume e a
   pagina da nota (`danfePage`). Tres coisas podem dar errado e nenhuma aparece
   em tela nenhuma hoje — quem cola a etiqueta nao tem a nota certa do lado pra
   comparar, entao o erro sai pela porta. */
tit('3. O QUE A IMPRESSAO DE NF FAZ COM ISSO');

const semNota=db.prepare(`SELECT COUNT(*) c FROM lote
  WHERE danfePage IS NULL AND ${BASE}`).get(...P).c;
const semNf=db.prepare(`SELECT COUNT(*) c FROM lote
  WHERE (nf IS NULL OR nf='') AND ${BASE}`).get(...P).c;
const semNotaAtivos=db.prepare(`SELECT id,codigo,buyer,nf,estagio,data FROM lote
  WHERE danfePage IS NULL AND estagio IN ('pendente','embalado') AND ${BASE}
  ORDER BY data DESC, id DESC LIMIT 20`).all(...P);

T('');
T('  Cada impressao leva 2 paginas: a etiqueta e a pagina da nota.');
T('');
T('  sem numero de NF lido da etiqueta ...... '+semNf);
T('  sem pagina de nota no PDF .............. '+semNota+'   (imprimem so a etiqueta)');

if(semNotaAtivos.length){
  T('');
  T('  Desses, os que ainda vao ser impressos ou carregados:');
  semNotaAtivos.forEach(v=>T('      #'+v.id+'  '+String(v.codigo||'(sem SKU)').padEnd(20)
    +'NF '+String(v.nf||'—').padEnd(8)+String(v.estagio||'').padEnd(10)+v.data+'   '+(v.buyer||'')));
}

/* Volumes da mesma NF apontando para paginas DIFERENTES. A nota e uma so: se as
   paginas divergem, uma das duas nao e a nota daquele pedido. */
const notaDiscordante=[];
for(const g of mesmaPessoa.concat(pessoasDiferentes)){
  const pags=[...new Set(g.vs.map(v=>v.danfePage).filter(p=>p!=null))];
  if(pags.length>1) notaDiscordante.push({nf:g.nf,pags,vs:g.vs});
}
T('');
if(!nfs.length){
  T('  Nenhuma NF repetida, entao nenhuma nota e impressa mais de uma vez.');
}else if(!notaDiscordante.length){
  T('  As '+nfs.length+' NF(s) repetidas apontam todas para a MESMA pagina de nota —');
  T('  cada caixa leva uma via da mesma nota, que e o certo.');
}else{
  T('  ⚠ '+notaDiscordante.length+' NF(s) cujos volumes apontam para paginas de nota DIFERENTES:');
  notaDiscordante.forEach(d=>{
    T('      NF '+d.nf+'  paginas '+d.pags.map(p=>p+1).join(' e '));
    d.vs.forEach(v=>T('        #'+v.id+'  '+String(v.codigo||'').padEnd(20)+'pag '+(v.danfePage!=null?(v.danfePage+1):'—')));
  });
}

/* O PDF de origem some em 7 dias (cron). Depois disso a rota devolve 410 e o
   volume nao imprime mais nada — nem a etiqueta. Volume ainda pendente nessa
   situacao e trabalho que nao tem como ser feito pela tela. */
const pdfSumiu=db.prepare(`SELECT id,codigo,buyer,nf,estagio,data,srcfile FROM lote
  WHERE estagio='pendente' AND ${BASE} ORDER BY data DESC, id DESC`).all(...P)
  .filter(v=>!v.srcfile||!fs.existsSync(v.srcfile));
if(pdfSumiu.length){
  T('');
  T('  ⚠ '+pdfSumiu.length+' volume(s) ainda PENDENTES cujo PDF ja saiu do servidor —');
  T('  a impressao devolve 410 e nao sai nem etiqueta nem nota:');
  pdfSumiu.slice(0,15).forEach(v=>T('      #'+v.id+'  '+String(v.codigo||'').padEnd(20)
    +'NF '+String(v.nf||'—').padEnd(8)+v.data+'   '+(v.buyer||'')));
  if(pdfSumiu.length>15) T('      … e mais '+(pdfSumiu.length-15));
}

/* ── 4. O QUE A FOLHA DO PDF DIZ ────────────────────────────────────────────
   A secao 1 le o que ficou GRAVADO, e o gravado ja passou pela dedup: se o PDF
   trouxesse a mesma venda com dois SKUs, o segundo teria sido recusado e nao
   apareceria la. A pergunta "o documento de origem repete venda?" so tem
   resposta relendo o documento — e e isto aqui.
   De quebra sai a divida #11 (o campo Quantidade) e a nota de mais de uma
   folha, que e o que decide se a impressao esta saindo completa. */
/* O que a folha achou, para o veredito no fim nao repetir a leitura nem contar
   por conta propria. `lido` distingue "li e nao achei nada" de "nao li". */
const folha={lido:false, pdfs:0, vendaDupla:[], comQtd:[], notaGrossa:[]};

async function verPdfs(){
  tit('4. O QUE A FOLHA DE CONTROLE DOS PDFs DIZ');
  const arqs=db.prepare(`SELECT srcfile, COUNT(*) volumes, MIN(data) de, MAX(data) ate
    FROM lote WHERE srcfile IS NOT NULL AND ${BASE}
    GROUP BY srcfile ORDER BY MAX(id) DESC`).all(...P).filter(a=>fs.existsSync(a.srcfile));
  T('');
  if(!arqs.length){ T('  Nenhum PDF ainda no servidor (a limpeza apaga em 7 dias).'); return; }
  T('  '+arqs.length+' PDF(s) ainda no servidor.');
  folha.lido=true; folha.pdfs=arqs.length;

  const {comQtd,vendaDupla,notaGrossa}=folha;
  let itens=0;
  for(const a of arqs){
    let f; try{ f=await lerFolha(a.srcfile); }
    catch(e){ T('  (nao deu pra ler '+path.basename(a.srcfile)+': '+(e.message||e)+')'); continue; }
    itens+=f.blocos.length;

    /* A MESMA "Venda:" com SKUs diferentes DENTRO da folha. E a unica forma de
       o PDF dizer "esta venda tem duas pecas diferentes", e o banco nunca
       mostraria: o segundo volume e recusado pela dedup antes de existir. */
    const porVendaFolha={};
    f.blocos.forEach(b=>{ if(b.venda) (porVendaFolha[b.venda]=porVendaFolha[b.venda]||[]).push(b); });
    Object.keys(porVendaFolha).forEach(v=>{
      const sk=[...new Set(porVendaFolha[v].map(b=>b.sku))];
      if(porVendaFolha[v].length>1)
        vendaDupla.push({arq:path.basename(a.srcfile),venda:v,itens:porVendaFolha[v],skus:sk});
    });

    /* Quantidade > 1: o item e UMA etiqueta e vira UM volume (armadilha #8), e
       ninguem decide nada com este campo (divida #11). Ele sai aqui so pra
       pergunta continuar viva com numero do lado. */
    f.blocos.filter(b=>b.qtd>1).forEach(b=>comQtd.push({arq:path.basename(a.srcfile),b}));

    /* Nota de mais de uma folha: a impressao leva SO a primeira pagina, entao
       aqui e onde se ve se ela esta saindo incompleta. */
    const pags={};
    (f.notas||[]).forEach(n=>{ if(n.nf) (pags[n.nf]=pags[n.nf]||[]).push(n.pagina); });
    Object.keys(pags).forEach(nf=>{ if(pags[nf].length>1)
      notaGrossa.push({arq:path.basename(a.srcfile),nf,paginas:pags[nf]}); });
  }

  T('  '+itens+' item(ns) de folha lidos.');
  T('');
  T('  ── a mesma Venda com mais de um item na folha ──');
  if(!vendaDupla.length) T('    nenhuma: cada "Venda:" da folha aparece uma vez so, com um SKU so.');
  else vendaDupla.forEach(d=>{
    T('    ⚠ venda '+d.venda+' ('+path.basename(d.arq)+'): '+d.itens.length+' itens, SKU(s) '+d.skus.join(' / '));
    d.itens.forEach(b=>T('        '+String(b.sku).padEnd(22)+'pack '+String(b.packId||'—').padEnd(18)
      +'qtd '+b.qtd+'   '+(b.comprador||'')));
  });

  T('');
  T('  ── itens com Quantidade maior que 1 (divida #11) ──');
  if(!comQtd.length) T('    nenhum: todos os itens vieram com Quantidade 1.');
  else{
    T('    O item e UMA etiqueta e vira UM volume — nada se perdeu (armadilha #8).');
    T('    O que este campo significa de verdade ainda e pergunta em aberto.');
    comQtd.slice(0,25).forEach(x=>T('        '+String(x.b.sku).padEnd(22)+'qtd '+x.b.qtd
      +'   venda '+String(x.b.venda||'—').padEnd(18)+(x.b.comprador||'')));
    if(comQtd.length>25) T('        … e mais '+(comQtd.length-25));
  }

  T('');
  T('  ── notas com mais de uma folha ──');
  if(!notaGrossa.length) T('    nenhuma: toda nota cabe numa pagina, e a impressao sai completa.');
  else{
    T('    ⚠ A impressao leva SO a primeira pagina da nota. Estas saem incompletas:');
    notaGrossa.forEach(n=>T('        NF '+n.nf+' ('+n.arq+'): paginas '+n.paginas.join(', ')));
  }
}

/* ── o veredito, em uma linha por pergunta ──────────────────────────────────
   Relatorio que termina sem responder a pergunta que motivou a leitura e
   relatorio que ninguem le duas vezes. */
function veredito(){
  tit('RESPOSTA');
  T('');
  T('  1. venda com mais de um SKU gravado ....... '
    +(vendaMultiSku.length?('⚠ '+vendaMultiSku.length+' — olhar'):'nenhuma'));
  /* Tres respostas diferentes, e so uma delas e "esta tudo certo": li e nao
     achei, nao li, ou li e nao havia o que ler. Juntar as duas ultimas num
     "nenhuma" seria dar por conferido o que ninguem olhou. */
  const semFolha = COM_PDF ? 'nenhum PDF no servidor pra ler' : 'nao foi lida (--pdf)';
  T('     a mesma venda com 2 itens NA FOLHA ..... '
    +(folha.lido?(folha.vendaDupla.length?('⚠ '+folha.vendaDupla.length+' — olhar'):'nenhuma'):semFolha));
  T('  2. cliente com mais de uma persiana na NF . '
    +(mesmaPessoa.length?(mesmaPessoa.length+' NF(s) — normal, a nota e do pedido'):'nenhuma'));
  T('  3. NF com clientes diferentes ............. '
    +(pessoasDiferentes.length?('⚠ '+pessoasDiferentes.length+' — olhar hoje'):'nenhuma'));
  T('  4. volumes que imprimem sem nota .......... '
    +(semNota?('⚠ '+semNota):'nenhum'));
  T('     notas de mais de uma folha ............. '
    +(folha.lido?(folha.notaGrossa.length?('⚠ '+folha.notaGrossa.length+' — imprimem incompletas'):'nenhuma'):semFolha));
  T('');
  if(!COM_PDF){
    T('  A folha dos PDFs nao foi lida, e o banco nao responde a pergunta 1 sozinho:');
    T('  a dedup recusa a venda repetida antes de ela virar linha. Para perguntar ao');
    T('  DOCUMENTO — e nao ao que ficou gravado: node conferir_nf.js --pdf');
  }
  T('');
}

(COM_PDF?verPdfs():Promise.resolve()).then(veredito).catch(e=>{
  console.error(e); process.exit(1);
});
