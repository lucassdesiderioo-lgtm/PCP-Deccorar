#!/usr/bin/env node
/* Testes do parse.js — o ponto onde um erro vira peca errada na casa do cliente.
 *
 *   node teste_parse.js
 *
 * Monta PDFs sinteticos com a estrutura da folha de controle do Mercado Livre e
 * confere o SKU que sai pra cada volume. O caso 2 e o do Abraao Amorim
 * (20/08/2026): ele comprou 3 x BK140140BEGE e recebeu uma BK160140BEGE, porque
 * o SKU do item de cima colou no Pack ID do dele.
 *
 * Nao toca no banco nem na rede. Roda em qualquer maquina com o repo instalado.
 */
const {PDFDocument,StandardFonts}=require('pdf-lib');
const fs=require('fs'), os=require('os'), path=require('path');
const {parsePdf}=require('./parse');

let falhas=0, casos=0;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pcp-parse-'));

async function montar(linhasControle, etiquetas){
  const d=await PDFDocument.create(), f=await d.embedFont(StandardFonts.Helvetica);
  const pag=ls=>{ const p=d.addPage([595,842]); let y=790;
    for(const l of ls){ p.drawText(l,{x:40,y,size:10,font:f}); y-=16; } };
  pag(linhasControle);
  etiquetas.forEach(e=>pag(e));
  const arq=path.join(tmp,'t'+(casos)+'.pdf');
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
  }
  if(erros.length){ falhas++; console.log('FALHOU  '+nome); erros.forEach(e=>console.log('        '+e)); }
  else console.log('ok      '+nome);
}

(async()=>{
  // ── 1. o caso comum: itens bem separados, cada um com pack e tecido ────────
  conferir('folha limpa — um item por pedaco',
    await montar([
      'Pack ID: 111', 'Venda: 901', 'SKU: BK160160BRANCO', 'Cor: BRANCO', 'Desenho do tecido ---',
      'Pack ID: 222', 'Venda: 902', 'SKU: BK140140BEGE',   'Cor: BEGE',   'Desenho do tecido ---',
    ],[
      ['Pack ID: 111','NF: 1','Cidade de destino : Curitiba','Joao','Endereço: Rua A'],
      ['Pack ID: 222','NF: 2','Cidade de destino : Recife','Maria','Endereço: Rua B'],
    ]),
    {'111':'BK160160BRANCO','222':'BK140140BEGE'});

  // ── 2. Abraao Amorim: item SEM Pack ID em cima gruda no pack do de baixo ───
  conferir('item sem Pack ID nao empresta o SKU pro vizinho (caso Abraao)',
    await montar([
      'Venda: 2000018008570820', 'SKU: BK160140BEGE', 'Cor: BEGE',
      'Pack ID: 2000014596231011', 'SKU: BK140140BEGE', 'Cor: BEGE', 'Desenho do tecido ---',
      'Pack ID: 2000014596273015', 'SKU: BK140140BEGE', 'Cor: BEGE', 'Desenho do tecido ---',
      'Pack ID: 2000014596231013', 'SKU: BK140140BEGE', 'Cor: BEGE', 'Desenho do tecido ---',
    ],[
      ['Pack ID: 2000014596231011','NF: 5416','Cidade de destino : Curitiba','Abraao Amorim','Endereço: Rua X'],
      ['Pack ID: 2000014596273015','NF: 5397','Cidade de destino : Curitiba','Abraao Amorim','Endereço: Rua X'],
      ['Pack ID: 2000014596231013','NF: 5407','Cidade de destino : Curitiba','Abraao Amorim','Endereço: Rua X'],
    ]),
    {'2000014596231011':'BK140140BEGE','2000014596273015':'BK140140BEGE','2000014596231013':'BK140140BEGE'});

  // ── 3. acessorio (sem tecido, sem "Desenho do tecido") no meio da folha ────
  conferir('acessorio no meio nao desloca os itens seguintes',
    await montar([
      'Pack ID: 111', 'SKU: BK160160BRANCO', 'Cor: BRANCO', 'Desenho do tecido ---',
      'Pack ID: 222', 'SKU: ACESSORIOSPERSIANAS',
      'Pack ID: 333', 'SKU: BK150150CINZA', 'Cor: CINZA', 'Desenho do tecido ---',
    ],[
      ['Pack ID: 111','NF: 1','Cidade de destino : Curitiba','Joao','Endereço: Rua A'],
      ['Pack ID: 222','NF: 2','Cidade de destino : Recife','Maria','Endereço: Rua B'],
      ['Pack ID: 333','NF: 3','Cidade de destino : Bahia','Ana','Endereço: Rua C'],
    ]),
    {'111':'BK160160BRANCO','222':'ACESSORIOSPERSIANAS','333':'BK150150CINZA'});

  // ── 4. etiqueta que traz Venda em vez de Pack ID ───────────────────────────
  conferir('volume casado pela Venda quando a etiqueta nao traz Pack ID',
    await montar([
      'Venda: 901', 'SKU: BK160140BRANCO', 'Cor: BRANCO', 'Desenho do tecido ---',
      'Pack ID: 222', 'Venda: 902', 'SKU: BK140140BEGE', 'Cor: BEGE', 'Desenho do tecido ---',
    ],[
      ['Venda: 901','NF: 1','Cidade de destino : Curitiba','Joao','Endereço: Rua A'],
      ['Pack ID: 222','NF: 2','Cidade de destino : Recife','Maria','Endereço: Rua B'],
    ]),
    {'901':'BK160140BRANCO','222':'BK140140BEGE'});

  /* ── 5. a TESTEMUNHA: quando as duas leituras discordam sobre o mesmo volume,
        o parse marca `conflito` e o upload retem a peca em vez de escolher.
        Este e o caso do Abraao visto pelo outro lado — la o teste cobra o SKU
        certo, aqui cobra que a discordancia apareca. */
  casos++;
  {
    const os_=await montar([
      'Pack ID: 111', 'SKU: BK160160BRANCO', 'Cor: BRANCO', 'Desenho do tecido ---',
      'Venda: 900', 'SKU: BK160140BEGE', 'Cor: BEGE',
      'Pack ID: 777', 'SKU: BK140140BEGE', 'Cor: BEGE', 'Desenho do tecido ---',
    ],[
      ['Pack ID: 111','NF: 1','Cidade de destino : Curitiba','Joao','Endereço: Rua A'],
      ['Pack ID: 777','NF: 2','Cidade de destino : Recife','Cliente Teste','Endereço: Rua B'],
    ]);
    const alvo=os_.find(o=>o.packId==='777')||{}, limpo=os_.find(o=>o.packId==='111')||{};
    const erros=[];
    if(!alvo.conflito) erros.push('o volume com leituras discordantes nao foi marcado');
    else if(!/BK140140BEGE/.test(alvo.conflito)||!/BK160140BEGE/.test(alvo.conflito))
      erros.push('o conflito nao nomeia as duas leituras: '+alvo.conflito);
    if(alvo.sku!=='BK140140BEGE') erros.push('mesmo em conflito, o SKU exibido vem da leitura 1');
    if(limpo.conflito) erros.push('volume sem discordancia foi marcado a toa');
    if(erros.length){ falhas++; console.log('FALHOU  leituras discordantes viram conflito');
      erros.forEach(e=>console.log('        '+e)); }
    else console.log('ok      leituras discordantes viram conflito (peca fica retida)');
  }

  // ── 6. a cor sobrevive (ela vem da folha, e a tela de carregamento usa) ────
  casos++;
  const cs=await montar(
    ['Pack ID: 111','Venda: 901','SKU: BK160160BRANCO','Cor: BRANCO','Desenho do tecido ---'],
    [['Pack ID: 111','NF: 1','Cidade de destino : Curitiba','Joao','Endereço: Rua A']]);
  if((cs[0]||{}).cor==='BRANCO') console.log('ok      a cor da folha continua chegando no volume');
  else { falhas++; console.log('FALHOU  a cor da folha continua chegando no volume — veio '+JSON.stringify((cs[0]||{}).cor)); }

  try{ fs.rmSync(tmp,{recursive:true,force:true}); }catch(e){}
  console.log('');
  console.log(falhas? (falhas+' de '+casos+' FALHARAM') : ('todos os '+casos+' casos passaram'));
  process.exit(falhas?1:0);
})();
