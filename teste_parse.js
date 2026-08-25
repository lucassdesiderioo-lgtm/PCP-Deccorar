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

let falhas=0, casos=0;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pcp-parse-'));

/* Um item da folha, do jeito do ML. `pack` e `venda` sao opcionais: item sem
   Pack ID existe e foi exatamente o que quebrou tudo. */
function item(o){
  const l1=(o.id||'IDENT'+Math.abs(o.sku.length*7))+' Persiana Cortina Rolo Blackout '+o.medida+' Blecaute '+o.cor;
  const l2=(o.pack?('Pack ID: '+o.pack+' '):'')+(!o.pack&&o.venda?('Venda: '+o.venda+' '):'')+'SKU: '+o.sku;
  const l3=(o.pack&&o.venda)?('Venda: '+o.venda+' Quantidade: 1'):(o.comprador+' Quantidade: 1');
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

  // ── 7. a cor sobrevive (a tela de carregamento usa) ───────────────────────
  casos++;
  {
    const cs=await montar([{pack:'111',venda:'901',sku:'BK160160BRANCO',medida:'1,60x1,60',cor:'Branco',comprador:'Joao Silva'}],
      [{pack:'111',nf:'1',comprador:'Joao Silva'}]);
    if(/branco/i.test((cs[0]||{}).cor||'')) console.log('ok      a cor da folha continua chegando no volume');
    else { falhas++; console.log('FALHOU  a cor da folha continua chegando no volume — veio '+JSON.stringify((cs[0]||{}).cor)); }
  }

  try{ fs.rmSync(tmp,{recursive:true,force:true}); }catch(e){}
  console.log('');
  console.log(falhas? (falhas+' de '+casos+' FALHARAM') : ('todos os '+casos+' casos passaram'));
  process.exit(falhas?1:0);
})();
