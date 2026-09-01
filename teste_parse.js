#!/usr/bin/env node
/* Testes do parse.js — o ponto onde um erro vira peca errada na casa do cliente.
 *
 *   node teste_parse.js
 *
 * A folha de controle e montada AQUI COMO ELA E DE VERDADE: duas colunas, cinco
 * linhas por item, como sai do Mercado Livre.
 *
 *     4BVE2EWNHBN7FGCRMBQPADFXJA Persiana ... 1,60x1,40 Blecaute Cinza
 *     Pack ID: 2000014610097547 SKU: BK160140CINZA
 *     Venda: 2000018016683414 Quantidade: 1
 *     Tiago Sanches Cor: Cinza
 *     Desenho do tecido: Blackout
 *
 * A primeira versao destes testes inventava um layout de um campo por linha —
 * e por isso passava sem provar nada sobre o documento real. Se o Mercado Livre
 * mudar o formato, e aqui que a mudanca tem que ser copiada, do PDF verdadeiro.
 *
 * O caso 2 e o do Abraao Amorim (20/08/2026): ele comprou 3 x BK140140BEGE e
 * recebeu uma BK160140BEGE, porque o item de cima — sem Pack ID — emprestou o
 * SKU dele pro pack do de baixo.
 *
 * Nao toca no banco nem na rede.
 */
const {PDFDocument,StandardFonts}=require('pdf-lib');
const fs=require('fs'), os=require('os'), path=require('path');
const {parsePdf}=require('./parse');

let falhas=0, casos=0, ULTIMO_PDF=null;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pcp-parse-'));

/* Um item da folha, do jeito do ML. `pack` e `venda` sao opcionais: item sem
   Pack ID existe e foi exatamente o que quebrou tudo. */
function item(o){
  const l1=(o.id||'IDENT'+Math.abs(o.sku.length*7))+' Persiana Cortina Rolo Blackout '+o.medida+' Blecaute '+o.cor;
  const l2=(o.pack?('Pack ID: '+o.pack+' '):'')+(!o.pack&&o.venda?('Venda: '+o.venda+' '):'')+'SKU: '+o.sku;
  const q=o.qtd||1;
  const l3=(o.pack&&o.venda)?('Venda: '+o.venda+' Quantidade: '+q):(o.comprador+' Quantidade: '+q);
  const l4=(o.pack&&o.venda)?(o.comprador+' Cor: '+o.cor):('Cor: '+o.cor);
  return [l1,l2,l3,l4,'Desenho do tecido: '+(o.tecido||'Liso')];
}
function etiqueta(o){
  return ['lucas desiderio lucas des #136721278','Rua Jussara 1250 Tamboré',
    (o.pack?('Pack ID: '+o.pack):('Venda: '+o.venda)),'Despachar: seg 24/ago, antes das 15:00 h',
    'QUA 26/08/2026 NF: '+o.nf, o.comprador+' (LOJA)',
    'Endereço: Rua Manoel Carvalho 75','Cidade de destino : Campinas, São Paulo'];
}
async function montar(itens, etiquetas){
  const d=await PDFDocument.create(), f=await d.embedFont(StandardFonts.Helvetica);
  const pag=ls=>{ const p=d.addPage([595,842]); let y=800;
    for(const l of ls){ p.drawText(l,{x:30,y,size:9,font:f}); y-=14; } };
  etiquetas.forEach(e=>pag(etiqueta(e)));            // etiquetas primeiro, como no PDF real
  pag(['Despachem as suas vendas o quanto antes.','Identifiicação Produtos']
      .concat(itens.map(item).reduce((a,b)=>a.concat(b),[])));
  const arq=path.join(tmp,'t'+casos+'.pdf');
  fs.writeFileSync(arq, await d.save());
  ULTIMO_PDF=arq;                                    // pro caso 9, que rele a folha
  return parsePdf(new Uint8Array(fs.readFileSync(arq)));
}
function conferir(nome, orders, esperado){
  casos++;
  const erros=[];
  if(orders.length!==Object.keys(esperado).length)
    erros.push('volumes: esperava '+Object.keys(esperado).length+', veio '+orders.length);
  for(const o of orders){
    const chave=o.packId||o.venda;
    if(!(chave in esperado)){ erros.push('volume inesperado: '+chave); continue; }
    if(o.sku!==esperado[chave]) erros.push(chave+': esperava '+esperado[chave]+', veio '+o.sku);
    if(o.conflito) erros.push(chave+': marcou conflito a toa — '+o.conflito);
  }
  if(erros.length){ falhas++; console.log('FALHOU  '+nome); erros.forEach(e=>console.log('        '+e)); }
  else console.log('ok      '+nome);
}

(async()=>{
  // ── 1. o caso comum ────────────────────────────────────────────────────────
  conferir('folha normal — cada item com seu pack',
    await montar([
      {pack:'111',venda:'901',sku:'BK160160BRANCO',medida:'1,60x1,60',cor:'Branco',comprador:'Joao Silva'},
      {pack:'222',venda:'902',sku:'BK140140BEGE',  medida:'1,40x1,40',cor:'Bege',  comprador:'Maria Souza'},
    ],[
      {pack:'111',nf:'1',comprador:'Joao Silva'},
      {pack:'222',nf:'2',comprador:'Maria Souza'},
    ]),
    {'111':'BK160160BRANCO','222':'BK140140BEGE'});

  // ── 2. Abraao Amorim: item SEM Pack ID em cima do item dele ───────────────
  conferir('item sem Pack ID nao empresta o SKU pro vizinho (caso Abraao)',
    await montar([
      {venda:'2000018008570820',sku:'BK160140BEGE',medida:'1,60x1,40',cor:'Bege',comprador:'Vizinho De Cima'},
      {pack:'2000014596231011',venda:'2000018002409801',sku:'BK140140BEGE',medida:'1,40x1,40',cor:'Bege',comprador:'Abraao Amorim'},
      {pack:'2000014596273015',venda:'2000018002409854',sku:'BK140140BEGE',medida:'1,40x1,40',cor:'Bege',comprador:'Abraao Amorim'},
      {pack:'2000014596231013',venda:'2000018002409874',sku:'BK140140BEGE',medida:'1,40x1,40',cor:'Bege',comprador:'Abraao Amorim'},
    ],[
      {venda:'2000018008570820',nf:'5400',comprador:'Vizinho De Cima'},
      {pack:'2000014596231011',nf:'5416',comprador:'Abraao Amorim'},
      {pack:'2000014596273015',nf:'5397',comprador:'Abraao Amorim'},
      {pack:'2000014596231013',nf:'5407',comprador:'Abraao Amorim'},
    ]),
    {'2000018008570820':'BK160140BEGE','2000014596231011':'BK140140BEGE',
     '2000014596273015':'BK140140BEGE','2000014596231013':'BK140140BEGE'});

  // ── 3. acessorio (sem medida na descricao) no meio da folha ───────────────
  conferir('acessorio no meio nao desloca os itens seguintes',
    await montar([
      {pack:'111',venda:'901',sku:'BK160160BRANCO',medida:'1,60x1,60',cor:'Branco',comprador:'Joao Silva'},
      {pack:'222',venda:'902',sku:'ACESSORIOSPERSIANAS',medida:'',cor:'Branco',comprador:'Maria Souza',tecido:'—'},
      {pack:'333',venda:'903',sku:'BK150150CINZA',medida:'1,50x1,50',cor:'Cinza',comprador:'Ana Costa'},
    ],[
      {pack:'111',nf:'1',comprador:'Joao Silva'},
      {pack:'222',nf:'2',comprador:'Maria Souza'},
      {pack:'333',nf:'3',comprador:'Ana Costa'},
    ]),
    {'111':'BK160160BRANCO','222':'ACESSORIOSPERSIANAS','333':'BK150150CINZA'});

  // ── 4. etiqueta que traz Venda em vez de Pack ID ──────────────────────────
  conferir('volume casado pela Venda quando a etiqueta nao traz Pack ID',
    await montar([
      {venda:'901',sku:'BK160140BRANCO',medida:'1,60x1,40',cor:'Branco',comprador:'Joao Silva'},
      {pack:'222',venda:'902',sku:'BK140140BEGE',medida:'1,40x1,40',cor:'Bege',comprador:'Maria Souza'},
    ],[
      {venda:'901',nf:'1',comprador:'Joao Silva'},
      {pack:'222',nf:'2',comprador:'Maria Souza'},
    ]),
    {'901':'BK160140BRANCO','222':'BK140140BEGE'});

  /* ── 5. A DESCRICAO acusa o SKU trocado ────────────────────────────────────
        A folha escreve a medida por extenso ao lado do codigo. Se as duas
        discordarem, o item esta corrompido e o volume tem que ficar retido —
        nao adianta as leituras concordarem sobre um SKU que o proprio anuncio
        desmente. */
  casos++;
  {
    const os_=await montar([
      {pack:'111',venda:'901',sku:'BK160140BEGE',medida:'1,40x1,40',cor:'Bege',comprador:'Joao Silva'},
    ],[{pack:'111',nf:'1',comprador:'Joao Silva'}]);
    const v=os_[0]||{};
    if(v.conflito && /140x140/.test(v.conflito)) console.log('ok      a descricao do anuncio acusa o SKU trocado');
    else { falhas++; console.log('FALHOU  a descricao do anuncio acusa o SKU trocado');
      console.log('        conflito veio: '+JSON.stringify(v.conflito)); }
  }

  /* ── 6. O COMPRADOR acusa a etiqueta casada com o item errado ──────────────
        A conferencia que nao depende do Pack ID: se o volume foi parar no item
        de outra pessoa, o nome da etiqueta nao bate com o da folha. */
  casos++;
  {
    const os_=await montar([
      {pack:'111',venda:'901',sku:'BK160160BRANCO',medida:'1,60x1,60',cor:'Branco',comprador:'Joao Silva'},
    ],[{pack:'111',nf:'1',comprador:'Outra Pessoa Completamente'}]);
    const v=os_[0]||{};
    if(v.conflito && /comprador/.test(v.conflito)) console.log('ok      o comprador acusa o volume casado com outro item');
    else { falhas++; console.log('FALHOU  o comprador acusa o volume casado com outro item');
      console.log('        conflito veio: '+JSON.stringify(v.conflito)); }
  }

  /* ── 7. A COR acusa quando a medida nao separa ─────────────────────────────
        Dois itens do MESMO cliente, mesma medida, cores diferentes (o caso
        Carlos Henrique no PDF de 24/08). Aqui o nome nao desempata e a medida
        tambem nao — so a cor do anuncio contra a cor do codigo. */
  casos++;
  {
    const os_=await montar([
      {pack:'111',venda:'901',sku:'BK160160CINZA',medida:'1,60x1,60',cor:'Cinza',comprador:'Carlos Henrique'},
      {pack:'222',venda:'902',sku:'BK160160BEGE', medida:'1,60x1,60',cor:'Bege', comprador:'Carlos Henrique'},
      // o terceiro tem a cor do anuncio brigando com a cor do codigo
      {pack:'333',venda:'903',sku:'BK160160BEGE', medida:'1,60x1,60',cor:'Cinza',comprador:'Outro Cliente'},
    ],[
      {pack:'111',nf:'1',comprador:'Carlos Henrique'},
      {pack:'222',nf:'2',comprador:'Carlos Henrique'},
      {pack:'333',nf:'3',comprador:'Outro Cliente'},
    ]);
    const bons=os_.filter(o=>['111','222'].includes(o.packId));
    const ruim=os_.find(o=>o.packId==='333')||{};
    const erros=[];
    bons.forEach(o=>{ if(o.conflito) erros.push('acusou a toa em '+o.packId+': '+o.conflito); });
    if(!ruim.conflito || !/cor/.test(ruim.conflito)) erros.push('nao acusou a cor trocada: '+JSON.stringify(ruim.conflito));
    if(erros.length){ falhas++; console.log('FALHOU  a cor do anuncio acusa quando a medida nao separa');
      erros.forEach(e=>console.log('        '+e)); }
    else console.log('ok      a cor do anuncio acusa quando a medida nao separa');
  }

  // ── 8. a cor sobrevive (a tela de carregamento usa) ───────────────────────
  casos++;
  {
    const cs=await montar([{pack:'111',venda:'901',sku:'BK160160BRANCO',medida:'1,60x1,60',cor:'Branco',comprador:'Joao Silva'}],
      [{pack:'111',nf:'1',comprador:'Joao Silva'}]);
    if(/branco/i.test((cs[0]||{}).cor||'')) console.log('ok      a cor da folha continua chegando no volume');
    else { falhas++; console.log('FALHOU  a cor da folha continua chegando no volume — veio '+JSON.stringify((cs[0]||{}).cor)); }
  }

  /* ── 9. UM ITEM, TRES PECAS, UM VOLUME ────────────────────────────────────
        O item que diz "Quantidade: 3" tem UMA etiqueta e por isso vira UM
        volume — e quem contou as persianas na folha achou tres. Nao e erro de
        leitura: e a diferenca entre contar peca e contar volume, e foi ela que
        fez o PDF de 41 aparecer como 35 na tela.

        O teste trava as duas metades: a folha tem que ENTREGAR o 3 (senao o
        `--lote` nao consegue explicar a diferenca a ninguem) e o parse tem que
        continuar gravando UM volume (senao nasceria uma etiqueta de venda que
        o Mercado Livre nao emitiu). */
  casos++;
  {
    const os_=await montar([
      {pack:'111',venda:'901',sku:'BK140140BEGE',medida:'1,40x1,40',cor:'Bege',comprador:'Abraao Amorim',qtd:3},
      {pack:'222',venda:'902',sku:'BK160160CINZA',medida:'1,60x1,60',cor:'Cinza',comprador:'Maria Souza'},
    ],[
      {pack:'111',nf:'1',comprador:'Abraao Amorim'},
      {pack:'222',nf:'2',comprador:'Maria Souza'},
    ]);
    const {lerFolha}=require('./folha');
    const insp=await lerFolha(ULTIMO_PDF);
    const b=insp.blocos.find(x=>x.sku==='BK140140BEGE')||{};
    const pecas=insp.blocos.reduce((a,x)=>a+(x.qtd||1),0);
    const erros=[];
    if(b.qtd!==3) erros.push('a folha nao entregou a Quantidade: veio '+JSON.stringify(b.qtd));
    if(pecas!==4) erros.push('pecas da folha: esperava 4, veio '+pecas);
    if(os_.length!==2) erros.push('volumes: esperava 2 (uma etiqueta por item), veio '+os_.length);
    if(os_.some(o=>o.conflito)) erros.push('marcou conflito a toa: '+os_.map(o=>o.conflito).filter(Boolean).join(' / '));
    if(erros.length){ falhas++; console.log('FALHOU  item com Quantidade 3 e 3 pecas em 1 volume');
      erros.forEach(e=>console.log('        '+e)); }
    else console.log('ok      item com Quantidade 3 e 3 pecas em 1 volume');
  }

  /* ── 12. O NOME PARTIDO PELO PDF NAO VIRA O COMPRADOR ─────────────────────
        "Dona Lizete (CONTADOR)" quebrado em duas linhas deixava "CONTADOR)" na
        linha de cima do endereco, e era ISSO que virava o comprador do volume.
        Em 31/08/2026 acusou os tres volumes da Dona Lizete, todos corretos. */
  casos++;
  {
    const {nomeDaEtiqueta}=require('./parse');
    const layouts=[
      [['Dona Lizete (CONTADOR)','Endereço: Rua X'],'Dona Lizete','tudo numa linha'],
      [['Dona Lizete','CONTADOR)','Endereço: Rua X'],'Dona Lizete','o ")" ficou orfao — o caso real'],
      [['Dona Lizete (','CONTADOR)','Endereço: Rua X'],'Dona Lizete','quebrou no meio do parentese'],
      [['Dona Lizete','(CONTADOR)','Endereço: Rua X'],'Dona Lizete','o parentetico inteiro embaixo'],
      [['Tiago Sanches','Endereço: Rua X'],'Tiago Sanches','nome sem papel nenhum'],
    ];
    const erros=[];
    layouts.forEach(([ls,esperado,quando])=>{
      const veio=nomeDaEtiqueta(ls);
      if(veio!==esperado) erros.push(quando+': esperava "'+esperado+'", veio "'+veio+'"');
    });
    if(erros.length){ falhas++; console.log('FALHOU  o nome partido pelo PDF e remontado');
      erros.forEach(e=>console.log('        '+e)); }
    else console.log('ok      o nome partido pelo PDF e remontado');
  }

  /* ── 13. COR COM NOME COMERCIAL NAO E DIVERGENCIA ─────────────────────────
        "Tóquio 004 - Cinza com acabamento branco" e um SKU CINZA dizem a mesma
        coisa. Em 31/08/2026 cinco volumes seguidos foram retidos por isso.
        O caso REAL (anuncio de uma cor, codigo de outra) tem que continuar
        sendo acusado — e a segunda metade deste caso. */
  casos++;
  {
    const os_=await montar([
      {pack:'111',venda:'901',sku:'BK180150CINZA',medida:'1,80x1,50',cor:'Tóquio 004 - Cinza com acabamento branco',comprador:'Marcelo Sousa'},
      {pack:'222',venda:'902',sku:'BK180150BEGE', medida:'1,80x1,50',cor:'Bege claro - Tóquio 002',comprador:'Monica Gusmao'},
      {pack:'333',venda:'903',sku:'BK150150BEGE', medida:'1,50x1,50',cor:'Cinza',comprador:'Outro Cliente'},
      // um item de cor simples, para "BEGE" existir entre as cores da folha
      {pack:'444',venda:'904',sku:'BK150150BEGE', medida:'1,50x1,50',cor:'Bege',comprador:'Mais Um Cliente'},
    ],[
      {pack:'111',nf:'1',comprador:'Marcelo Sousa'},
      {pack:'222',nf:'2',comprador:'Monica Gusmao'},
      {pack:'333',nf:'3',comprador:'Outro Cliente'},
      {pack:'444',nf:'4',comprador:'Mais Um Cliente'},
    ]);
    const erros=[];
    ['111','222','444'].forEach(k=>{ const v=os_.find(o=>o.packId===k)||{};
      if(v.conflito) erros.push('reteve a toa em '+k+': '+v.conflito); });
    const real=os_.find(o=>o.packId==='333')||{};
    if(!real.conflito || !/cor/.test(real.conflito))
      erros.push('parou de acusar a cor trocada de verdade: '+JSON.stringify(real.conflito));
    if(erros.length){ falhas++; console.log('FALHOU  cor com nome comercial passa, cor trocada continua retida');
      erros.forEach(e=>console.log('        '+e)); }
    else console.log('ok      cor com nome comercial passa, cor trocada continua retida');
  }

  /* ── 14. DUAS LETRAS NO NOME NAO SAO OUTRO CLIENTE ────────────────────────
        "Rufiino" x "Rufino" e digitacao do ML. Mas a tolerancia nao pode virar
        porta: nomes de pessoas diferentes tem que continuar acusando, e e isso
        que a segunda metade cobre — e a unica conferencia que nao depende do
        Pack ID. */
  casos++;
  {
    const {mesmoNomeComRepeticao}=require('./parse');
    const chave=s=>String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim();
    const mesma=(x,y)=>mesmoNomeComRepeticao(chave(x),chave(y));
    const erros=[];
    if(!mesma('Ryta de Kassia Andrade Rufiino','Ryta De Kassia Andrade Rufino'))
      erros.push('nao reconheceu a mesma pessoa com a letra dobrada (caso Ryta)');
    /* O que NAO pode passar: letra TROCADA e outra pessoa, por mais parecida
       que seja. Marcelo/Marcela esta a duas letras e sao dois clientes. */
    [['Silvia Carolina Souza','Evandro Pereira Lima'],
     ['Ana Paula Ayres Serpa','Ana Paula Ayres Costa'],
     ['Marcelo Sousa Silva','Marcela Sousa Silvo'],
     ['Marcelo Sousa Silva','Marcela Sousa Silva'],
     ['Joao Pedro Lima','Joana Pedro Lima']].forEach(([x,y])=>{
      if(mesma(x,y)) erros.push('tratou como a mesma pessoa: "'+x+'" e "'+y+'"');
    });
    if(erros.length){ falhas++; console.log('FALHOU  erro de digitacao passa, cliente diferente nao');
      erros.forEach(e=>console.log('        '+e)); }
    else console.log('ok      erro de digitacao passa, cliente diferente nao');
  }

  try{ fs.rmSync(tmp,{recursive:true,force:true}); }catch(e){}
  console.log('');
  console.log(falhas? (falhas+' de '+casos+' FALHARAM') : ('todos os '+casos+' casos passaram'));
  process.exit(falhas?1:0);
})();
