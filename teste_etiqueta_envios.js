#!/usr/bin/env node
/* teste_etiqueta_envios.js — a etiqueta nova do ML, "Etiqueta válida para
 * envíos" (NF 9124, 04/11/2026), e a forma 6 de ligar etiqueta e folha.
 *
 *   node teste_etiqueta_envios.js
 *
 * A etiqueta de 04/11/2026 chegou SEM a linha "Despachar:", sem rota, sem
 * "Endereço:" e com a NF escrita "Nota fiscal #9124" (o pdf.js lê "fiiscal").
 * O que este arquivo trava:
 *
 *   1. esse formato vira COLETA sozinho (decisão do dono, 04/11/2026), e a
 *      etiqueta que só perdeu a linha "Despachar:" continua retida (#21);
 *   2. a NF e o comprador são lidos do jeito novo — sem eles o volume entrava
 *      sem NF e a conferência do comprador parava calada;
 *   3. a forma 6: o número do código de barras da etiqueta está dentro da
 *      identificação da folha ("MEL48405880346FMXDF01"). Ele acha o item quando
 *      pack e venda não acham, retém quando aponta um item diferente do pack,
 *      e conta as peças: os itens da folha com o mesmo número são da mesma
 *      caixa — e qualquer leitura dizendo mais RETÉM (R-VOL-09);
 *   4. a folha antiga (identificação sem o número) não muda nada.
 *
 * ⚠️ Não há ainda um PDF REAL com mais de um SKU neste formato. O caso de dois
 * SKUs (bloco 6) é montado aqui à mão, no layout do PDF de 04/11/2026.
 *
 * Sobe o upload de verdade (exp_route + parse.js) num banco temporário.
 */
const {PDFDocument,StandardFonts}=require('pdf-lib');
const Database=require('better-sqlite3');
const express=require('express');
const fs=require('fs'), os=require('os'), path=require('path');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pcp-envios-'));
process.env.PCP_DIR=tmp;

let casos=0, falhas=0;
function ok(desc, cond, detalhe){
  casos++;
  if(cond) console.log('  ok  '+casos+' — '+desc);
  else { falhas++; console.log('  FALHOU '+casos+' — '+desc+(detalhe?'\n         '+detalhe:'')); }
}
function eq(desc, achado, esperado){
  ok(desc, achado===esperado, 'esperado '+JSON.stringify(esperado)+', veio '+JSON.stringify(achado));
}

const {modalidadeDespacho,nomeDaEtiqueta,nfDaEtiqueta,envioDaEtiqueta}=require('./parse');
const {itensDaFolha}=require('./folha');

const db=new Database(path.join(tmp,'t.db'));
db.exec(`CREATE TABLE skus (codigo TEXT PRIMARY KEY, largura_cm INT, altura_cm INT,
    cor_codigo TEXT, cor TEXT, tecido_codigo TEXT, modelo_id INT, estoque INT DEFAULT 0);
  CREATE TABLE cor (codigo TEXT PRIMARY KEY, nome TEXT);
  CREATE TABLE tecido (codigo TEXT PRIMARY KEY, nome TEXT);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, exige_medida INT DEFAULT 1, sob_medida INT DEFAULT 0);
  INSERT INTO skus (codigo) VALUES ('BK150150CINZA'),('BK120120BEGE'),('BK160160CINZA');`);
const app=express(); app.use(express.json({limit:'25mb'}));
app.locals.acesso={ auditar:()=>{} };
app.use((req,res,next)=>{ req.usuario={id:1,nome:'Quem Sobe'}; next(); });
require('./exp_route')(app, db);

/* ── a etiqueta nova, linha a linha como o pdf.js leu o PDF de 04/11/2026 ── */
function etiquetaNova(o){
  const e=String(o.envio);
  return ['lucas desiderio lucas des #136721278','Rua Jussara 1250 Tamboré','Barueri BR-SP 06465070',
    'Pack ID: '+o.pack,
    o.semFrase?'':'Etiqueta válida para envíos',
    e.slice(0,6)+' '+e.slice(6),
    (o.nfEscrita||'Nota fiiscal #')+o.nf,
    'Destinatario:', o.nome+' (APELIDO)'].filter(Boolean);
}
/* A etiqueta de sempre, para o bloco 7 (a folha antiga). */
function etiquetaVelha(o){
  return ['lucas desiderio lucas des #136721278','Rua Jussara 1250 Tamboré',
    'Pack ID: '+o.pack,'Despachar: sexta 06/nov',
    'TER 10/11/2026 NF: '+o.nf, o.nome+' (APELIDO)',
    'Endereço: Rua Um 1','Cidade de destino : Curitiba, Paraná'];
}
/* Um item da folha nova. `envio` vai no MEL; sem `pack`/`venda`/`nome` o item
   é o irmão do pacote. */
function itemNovo(o){
  const l=[];
  l.push((o.id!==undefined?o.id:('MEL'+o.envio+'FMXDF01'))+' Cortina Rolo Blackout '+o.medida+' Persiana '+o.cor);
  l.push((o.pack?'Pack ID: '+o.pack+' ':'')+(!o.pack&&o.venda?'Venda: '+o.venda+' ':'')+'SKU: '+o.sku);
  if(o.pack&&o.venda) l.push('Venda: '+o.venda+' Quantidade: '+(o.qtd||1));
  else l.push((o.nome?o.nome+' ':'')+'Quantidade: '+(o.qtd||1));
  l.push((o.pack&&o.venda&&o.nome?o.nome+' ':'')+'Cor: '+o.cor);
  l.push('Desenho do tecido: Liso');
  return l;
}
async function pdf(etiquetas, folha){
  const d=await PDFDocument.create(), f=await d.embedFont(StandardFonts.Helvetica);
  const pag=ls=>{ const p=d.addPage([595,842]); let y=800;
    for(const l of ls){ p.drawText(l,{x:30,y,size:9,font:f}); y-=14; } };
  etiquetas.forEach(pag);
  pag(['Despache a sua venda o quanto antes. Não demore, o seu comprador está esperando.',
       'Identifiicação Produto'].concat(folha));
  return Buffer.from(await d.save());
}

/* O caso real, com o nome trocado. */
const ELAINE={pack:'2000015817769511', venda:'2000019290872456', envio:'48405880346', nf:'9124',
  nome:'Cliente Elaine Teste', sku:'BK150150CINZA', medida:'1,50x1,50', cor:'Cinza'};

async function main(){
  console.log('\n── 0. as leituras soltas ──');
  const txt=etiquetaNova(ELAINE).join('\n');
  eq('o formato novo é coleta', modalidadeDespacho(txt), 'coleta');
  eq('sem "Despachar:" e sem a frase continua null (retém)',
    modalidadeDespacho(etiquetaNova({...ELAINE, semFrase:true}).join('\n')), null);
  eq('"Despachar:" num formato estranho continua desconhecida, mesmo com a frase',
    modalidadeDespacho(txt+'\nDespachar: amanhã de manhã'), 'desconhecida');
  eq('a coleta de sempre não mudou', modalidadeDespacho('Despachar: quinta 10/set'), 'coleta');
  eq('a agência de sempre não mudou', modalidadeDespacho('Despachar: qua 9/set, antes das 15:45 h'), 'agencia');
  eq('a NF "Nota fiiscal #9124"', nfDaEtiqueta(txt), '9124');
  eq('a NF "Nota fiscal #9124"', nfDaEtiqueta('Nota fiscal #9124'), '9124');
  eq('a NF de sempre', nfDaEtiqueta('DOM 01/11/2026 NF: 8809'), '8809');
  eq('o comprador debaixo do "Destinatario:"', nomeDaEtiqueta(etiquetaNova(ELAINE)), 'Cliente Elaine Teste');
  eq('o comprador na mesma linha do "Destinatario:"', nomeDaEtiqueta(['Destinatario: Ana Paula Souza (ANA)']), 'Ana Paula Souza');
  eq('o comprador de sempre (acima do "Endereço:")',
    nomeDaEtiqueta(['Dona Lizete (CONTADOR)','Endereço: Rua 1']), 'Dona Lizete');
  eq('o número do código de barras', envioDaEtiqueta(etiquetaNova(ELAINE)), '48405880346');
  eq('a etiqueta de sempre não tem envio lido', envioDaEtiqueta(etiquetaVelha({pack:'1',nf:'1',nome:'A B'})), null);
  const its=itensDaFolha(itemNovo(ELAINE));
  eq('a folha nova: o MEL vira envio', its[0]&&its[0].envio, '48405880346');
  eq('e a descrição continua sem o MEL', its[0]&&its[0].desc, 'Cortina Rolo Blackout 1,50x1,50 Persiana Cinza');
  const velho=itensDaFolha(itemNovo({...ELAINE, id:'CLONAPDJCJOV3PLRFXO6FTJRUA'}));
  eq('a folha antiga: sem envio', velho[0]&&velho[0].envio, null);

  const srv=app.listen(0); await new Promise(r=>srv.once('listening',r));
  const base='http://127.0.0.1:'+srv.address().port;
  async function subir(buf){
    const r=await fetch(base+'/api/lote/upload',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({pdf:'data:application/pdf;base64,'+buf.toString('base64')})});
    return {status:r.status, body:await r.json()};
  }
  const vol=w=>db.prepare('SELECT * FROM lote WHERE '+w+' ORDER BY id DESC').get();
  const pecas=id=>db.prepare('SELECT codigo,qtd FROM lote_item WHERE lote_id=? ORDER BY id').all(id)
    .map(i=>i.qtd+'x'+i.codigo).join(' + ');
  const limpar=()=>db.exec('DELETE FROM lote_item; DELETE FROM lote;');
  try{
    console.log('\n── 1. o caso de 04/11/2026: uma persiana, etiqueta nova ──');
    let r=await subir(await pdf([etiquetaNova(ELAINE)], itemNovo(ELAINE)));
    eq('o upload responde ok', r.status, 200);
    let v=vol("packId='2000015817769511'");
    ok('a caixa existe', !!v);
    eq('ela NÃO fica retida', v&&v.estagio, 'pendente');
    eq('sem motivo de bloqueio', v&&v.bloqueio, null);
    eq('é coleta', v&&v.modalidade, 'coleta');
    eq('com a NF', v&&v.nf, '9124');
    eq('com o comprador', v&&v.buyer, 'Cliente Elaine Teste');
    eq('com o SKU da folha', v&&v.codigo, 'BK150150CINZA');
    eq('sem data de despacho (vai para a lista de hoje)', v&&v.despachar_em, null);
    ok('o número do código de barras fica nos códigos do volume',
      JSON.parse(v&&v.codes||'[]').includes('48405880346'), v&&v.codes);
    limpar();

    console.log('\n── 2. a etiqueta que só perdeu a linha "Despachar:" continua retida ──');
    r=await subir(await pdf([etiquetaNova({...ELAINE, semFrase:true})], itemNovo(ELAINE)));
    v=vol("packId='2000015817769511'");
    eq('retida', v&&v.estagio, 'bloqueado');
    ok('por modalidade', /^modalidade:/.test(v&&v.bloqueio||''), v&&v.bloqueio);
    limpar();

    console.log('\n── 3. a conferência do comprador volta a rodar ──');
    r=await subir(await pdf([etiquetaNova({...ELAINE, nome:'Roberto Carlos Pereira'})], itemNovo(ELAINE)));
    v=vol("packId='2000015817769511'");
    eq('comprador trocado retém', v&&v.estagio, 'bloqueado');
    ok('dizendo que o comprador não bate', /comprador nao bate/.test(v&&v.bloqueio||''), v&&v.bloqueio);
    limpar();

    console.log('\n── 4. forma 6: o MEL acha o item quando pack e venda não acham ──');
    /* A folha trouxe só a venda (o pack se perdeu na leitura), e a etiqueta só
       traz o pack. Sem o MEL, a etiqueta fica sem item e é retida. */
    r=await subir(await pdf([etiquetaNova(ELAINE)], itemNovo({...ELAINE, pack:null})));
    v=vol("packId='2000015817769511'");
    eq('a caixa segue', v&&v.estagio, 'pendente');
    eq('com o SKU certo', v&&v.codigo, 'BK150150CINZA');
    eq('a conta do PDF fecha', r.body.conta_pdf && r.body.conta_pdf.fecha, true);
    limpar();

    console.log('\n── 5. forma 6: pack e MEL apontando itens diferentes ──');
    r=await subir(await pdf([etiquetaNova(ELAINE)], [].concat(
      itemNovo({...ELAINE, envio:'48400000001'}),
      itemNovo({pack:'2000015800000002', venda:'2000019200000002', envio:'48405880346',
        nome:'Outra Cliente Teste', sku:'BK160160CINZA', medida:'1,60x1,60', cor:'Cinza'}))));
    v=vol("packId='2000015817769511'");
    eq('retém', v&&v.estagio, 'bloqueado');
    ok('dizendo que o código da etiqueta aponta outro item',
      /^divergencia:.*codigo de barras/.test(v&&v.bloqueio||''), v&&v.bloqueio);
    limpar();

    console.log('\n── 6. forma 6: dois SKUs com o mesmo MEL (montado à mão) ──');
    /* O segundo item tem venda e comprador próprios, então não é "irmão" pela
       ausência — sem o MEL, a caixa passaria com UMA persiana. */
    r=await subir(await pdf([etiquetaNova(ELAINE)], [].concat(
      itemNovo(ELAINE),
      itemNovo({pack:'2000015817769511', venda:'2000019290872499', envio:'48405880346',
        nome:'Cliente Elaine Teste', sku:'BK120120BEGE', medida:'1,20x1,20', cor:'Bege'}))));
    v=vol("packId='2000015817769511'");
    eq('a caixa fica RETIDA, e não passa com 1', v&&v.estagio, 'bloqueado');
    ok('no card do pacote', /^pacote:/.test(v&&v.bloqueio||''), v&&v.bloqueio);
    ok('dizendo o que o código da etiqueta achou', /codigo de barras/.test(v&&v.bloqueio||''), v&&v.bloqueio);
    eq('com as DUAS persianas escritas', v&&pecas(v.id), '1xBK150150CINZA + 1xBK120120BEGE');
    limpar();

    console.log('\n── 7. o irmão do pacote com o MEL: as leituras concordam ──');
    r=await subir(await pdf([etiquetaNova(ELAINE)], [].concat(
      itemNovo(ELAINE),
      itemNovo({envio:'48405880346', sku:'BK120120BEGE', medida:'1,20x1,20', cor:'Bege'}))));
    v=vol("packId='2000015817769511'");
    eq('retida para assinar, como todo pacote (R-VOL-04)', v&&v.estagio, 'bloqueado');
    eq('com as duas persianas', v&&pecas(v.id), '1xBK150150CINZA + 1xBK120120BEGE');
    ok('sem dúvida de quantidade (o MEL concorda)', !/codigo de barras|em duvida/.test(v&&v.bloqueio||''), v&&v.bloqueio);
    limpar();

    console.log('\n── 8. a etiqueta e a folha de sempre não mudam ──');
    r=await subir(await pdf([etiquetaVelha(ELAINE)], itemNovo({...ELAINE, id:'CLONAPDJCJOV3PLRFXO6FTJRUA'})));
    v=vol("packId='2000015817769511'");
    eq('segue', v&&v.estagio, 'pendente');
    eq('coleta pela linha "Despachar:"', v&&v.modalidade, 'coleta');
    eq('NF de sempre', v&&v.nf, '9124');
    eq('comprador de sempre', v&&v.buyer, 'Cliente Elaine Teste');
    limpar();
  } finally {
    srv.close();
    try{ db.close(); fs.rmSync(tmp,{recursive:true,force:true}); }catch(e){}
  }
  console.log('');
  console.log(falhas? (falhas+' de '+casos+' FALHARAM') : ('todos os '+casos+' casos passaram'));
  process.exit(falhas?1:0);
}
main().catch(e=>{ console.error(e); process.exit(1); });
