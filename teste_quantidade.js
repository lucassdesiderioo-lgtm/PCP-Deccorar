#!/usr/bin/env node
/* teste_quantidade.js — a conferência da quantidade no upload do PDF do ML
 * (spec docs/specs/CONFERENCIA-DA-QUANTIDADE.md, fase 1).
 *
 *   node teste_quantidade.js
 *
 * O caso que originou estes testes: NF 8196, Roberto, 19/10/2026. Um pacote de
 * DOIS SKUs (BK120120BEGE + BK140140BEGE) numa etiqueta só. O sistema gravou
 * uma persiana, e o cliente recebeu uma. O caminho, reproduzido com a folha
 * real: a segunda persiana (o "irmão", sem pack, venda nem nome) só era aceita
 * quando TODA etiqueta do PDF achava item na folha; bastava uma etiqueta de
 * outro cliente sem item para o irmão sumir de todas as caixas — e a caixa que
 * casou certinho passava com 1 peça, sem reter e sem aviso.
 *
 * O que este arquivo trava:
 *   1. o irmão do pacote num PDF que não fecha RETÉM a caixa, com as duas peças
 *      escritas, em vez de sumir;
 *   2. o pacote num PDF que fecha continua como era (retido para assinar);
 *   3. o `Quantidade:` caído além das 4 linhas é lido pela folha crua e retém;
 *   4. a quantidade que só a leitura item a item viu não é jogada fora: retém;
 *   5. a venda comum e a de 2 unidades do MESMO SKU, lidas igual por todo
 *      mundo, NÃO são retidas (R-VOL-04 — trava que dispara à toa é desvio);
 *   6. a conta do PDF inteiro (peças da folha × peças gravadas) vai na resposta
 *      do upload, e diz quando não fecha;
 *   7. quem assina o pacote libera a caixa retida por quantidade, pelo card que
 *      já existe.
 *
 * Sobe o upload de verdade (exp_route + parse.js reais) sobre um banco
 * temporário, com PDFs montados no formato da folha do ML. Não toca no
 * servidor.
 */
const {PDFDocument,StandardFonts}=require('pdf-lib');
const Database=require('better-sqlite3');
const express=require('express');
const fs=require('fs'), os=require('os'), path=require('path');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pcp-qtd-'));
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

const db=new Database(path.join(tmp,'t.db'));
db.exec(`CREATE TABLE skus (codigo TEXT PRIMARY KEY, largura_cm INT, altura_cm INT,
    cor_codigo TEXT, cor TEXT, tecido_codigo TEXT, modelo_id INT, estoque INT DEFAULT 0);
  CREATE TABLE cor (codigo TEXT PRIMARY KEY, nome TEXT);
  CREATE TABLE tecido (codigo TEXT PRIMARY KEY, nome TEXT);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, exige_medida INT DEFAULT 1, sob_medida INT DEFAULT 0);
  INSERT INTO skus (codigo) VALUES ('BK120120BEGE'),('BK140140BEGE'),('BK160160CINZA'),('BK160160BEGE'),('BK150150BEGE');`);
const app=express(); app.use(express.json({limit:'25mb'}));
app.locals.acesso={ auditar:()=>{} };
app.use((req,res,next)=>{ req.usuario={id:1,nome:'Quem Assina'}; next(); });
require('./exp_route')(app, db);

/* ── o PDF, no formato do ML ─────────────────────────────────────────────── */
function etiqueta(o){
  return ['lucas desiderio lucas des #136721278','Rua Jussara 1250 Tamboré',
    o.pack?('Pack ID: '+o.pack):('Venda: '+o.venda),
    'Despachar: sexta 16/out',
    'TER 20/10/2026 NF: '+o.nf, o.nome+' (APELIDO)',
    'Endereço: Rua Um 1','Cidade de destino : Curitiba, Paraná'];
}
async function pdf(etiquetas, folha){
  const d=await PDFDocument.create(), f=await d.embedFont(StandardFonts.Helvetica);
  const pag=ls=>{ const p=d.addPage([595,842]); let y=800;
    for(const l of ls){ p.drawText(l,{x:30,y,size:9,font:f}); y-=14; } };
  etiquetas.forEach(e=>pag(etiqueta(e)));
  pag(['Despachem as suas vendas o quanto antes. Não demore, o seu comprador está esperando.',
       'Identifiicação Produtos'].concat(folha));
  return Buffer.from(await d.save());
}

/* A folha do Roberto, como o ML mandou (print do dono, 27/10/2026), com os
   nomes trocados. O irmão vem logo abaixo, sem pack, sem venda e sem nome. */
const ROBERTO=[
  'LESLWOUN55IWDHI3GZ6UYKB4FA Cortina Rolo Blackout 1,20x1,20 Blecaute Persiana Bege',
  'Pack ID: 2000015590336287 SKU: BK120120BEGE',
  'Venda: 2000019049592564 Quantidade: 1',
  'Cliente Roberto Teste Cor: Bege',
  'Desenho do tecido: Liso',
  'Cortina Rolo Blackout 1,40x1,40 Persiana Blecaute Bege',
  'SKU: BK140140BEGE',
  'Quantidade: 1',
  'Cor: Bege',
  'Desenho do tecido: Liso'];
const JULIANE=[
  '434MYMXU3VN4NGY5XLEX4XKMPU Cortina Rolo Blackout 1,60x1,60 Persiana Home Office Cinza',
  'Venda: 2000019048761546 SKU: BK160160CINZA',
  'Cliente Juliane Teste Quantidade: 1',
  'Cor: Cinza',
  'Desenho do tecido: Liso'];
const ETQ_ROBERTO={pack:'20000 15590336287', nf:'8196', nome:'Cliente Roberto Teste'};
const ETQ_JULIANE={venda:'2000019048761546', nf:'8197', nome:'Cliente Juliane Teste'};

async function main(){
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
    console.log('\n── 1. o Roberto: pacote de 2 SKUs num PDF que NÃO fecha ──');
    /* Uma etiqueta de outro cliente sem item na folha: o PDF não fecha. */
    let r=await subir(await pdf([ETQ_ROBERTO, ETQ_JULIANE, {pack:'2000015599999999', nf:'8198', nome:'Cliente Sem Item'}],
      ROBERTO.concat(JULIANE)));
    eq('o upload responde ok', r.status, 200);
    let v=vol("packId='2000015590336287'");
    ok('a caixa do Roberto existe', !!v);
    eq('ela fica RETIDA, e não passa com 1 peça', v&&v.estagio, 'bloqueado');
    ok('retida no card do pacote (quem assina libera)', /^pacote:/.test(v&&v.bloqueio||''), v&&v.bloqueio);
    eq('com as DUAS persianas escritas', v&&pecas(v.id), '1xBK120120BEGE + 1xBK140140BEGE');
    ok('e o motivo diz que o PDF não fechou', /nao fecha|não fecha/i.test(v&&v.bloqueio||''), v&&v.bloqueio);
    const sem=vol("packId='2000015599999999'");
    ok('a etiqueta sem item continua retida como sempre', sem && sem.estagio==='bloqueado' && /^divergencia:/.test(sem.bloqueio||''), sem&&sem.bloqueio);
    eq('a Juliane, que não tem dúvida nenhuma, segue', vol("venda='2000019048761546'").estagio, 'pendente');
    limpar();

    console.log('\n── 2. o mesmo pacote num PDF que fecha: como sempre ──');
    r=await subir(await pdf([ETQ_ROBERTO, ETQ_JULIANE], ROBERTO.concat(JULIANE)));
    v=vol("packId='2000015590336287'");
    eq('retida para assinar (R-VOL-04)', v&&v.estagio, 'bloqueado');
    eq('com as duas persianas', v&&pecas(v.id), '1xBK120120BEGE + 1xBK140140BEGE');
    ok('e o motivo não acusa PDF quebrado', !/nao fecha|não fecha/i.test(v&&v.bloqueio||''), v&&v.bloqueio);
    eq('a conta do PDF fecha (2 peças de um lado, 2 do outro + 1)', r.body.conta_pdf && r.body.conta_pdf.fecha, true);
    limpar();

    console.log('\n── 3. o "Quantidade: 2" caído além das 4 linhas do SKU ──');
    /* O título comprido desfaz o pareamento das colunas e empurra a
       quantidade para baixo (os Tóquio). A leitura por bloco olha só 4 linhas
       a partir do SKU; a folha crua olha até o próximo item. */
    r=await subir(await pdf([{venda:'2000019000000301', nf:'9301', nome:'Cliente Toquio Teste'}],[
      'AAAAAAAAAAAAAAAAAAAAAAAAAA Cortina Rolo Blackout Medida L 1,50 X A 1,50 Blecaute Roller Cor Bege Claro -',
      'Venda: 2000019000000301',
      'SKU: BK150150BEGE',
      'Cliente Toquio Teste',
      'Tóquio 002',
      'Acabamento branco',
      'Quantidade: 2',
      'Cor: Bege claro - Tóquio 002',
      'Desenho do tecido: Liso']));
    v=vol("venda='2000019000000301'");
    eq('a caixa fica retida', v&&v.estagio, 'bloqueado');
    ok('no card do pacote, dizendo que a quantidade está em dúvida', /^pacote: .*quantidade/i.test(v&&v.bloqueio||''), v&&v.bloqueio);
    eq('com o MAIOR número lido já preenchido', v&&pecas(v.id), '2xBK150150BEGE');
    limpar();

    console.log('\n── 4. a quantidade que só a leitura item a item viu ──');
    /* A leitura por bloco não casa este item com a etiqueta (há dois números
       livres acima do SKU, e ambiguidade não se desempata por chute); a
       testemunha casa, e até aqui a quantidade dela era jogada fora. */
    r=await subir(await pdf([{venda:'2000019000000401', nf:'9401', nome:'Cliente Testemunha Teste'}],[
      'BBBBBBBBBBBBBBBBBBBBBBBBBB Cortina Rolo Blackout 1,60x1,60 Persiana Bege',
      'Pack ID: 2000015000000499',
      'Venda: 2000019000000401',
      'Linha solta do anuncio',
      'SKU: BK160160BEGE',
      'Cliente Testemunha Teste Quantidade: 2',
      'Cor: Bege',
      'Desenho do tecido: Liso']));
    v=vol("venda='2000019000000401'");
    ok('a caixa existe', !!v);
    eq('ela fica retida, e não passa com 1', v&&v.estagio, 'bloqueado');
    eq('com as 2 peças escritas', v&&pecas(v.id), '2xBK160160BEGE');
    limpar();

    console.log('\n── 4-B. o irmão que a leitura por bloco toma por cliente ──');
    /* O irmão do pacote não tem pack, venda nem nome — mas aqui uma linha solta
       de texto, só letras, cai logo abaixo do SKU dele, e a leitura por bloco a
       toma por NOME de comprador. Com "comprador", o irmão deixa de ser irmão
       e a caixa passaria com 1 peça. A folha crua só reconhece o começo de uma
       venda por pack ou venda, e por isso conta as duas persianas. */
    r=await subir(await pdf([{pack:'20000 15000000451', nf:'9451', nome:'Cliente Irmao Teste'}],[
      'DDDDDDDDDDDDDDDDDDDDDDDDDD Cortina Rolo Blackout 1,20x1,20 Blecaute Persiana Bege',
      'Pack ID: 2000015000000451 SKU: BK120120BEGE',
      'Venda: 2000019000000451 Quantidade: 1',
      'Cliente Irmao Teste Cor: Bege',
      'Desenho do tecido: Liso',
      'Cortina Rolo Blackout 1,40x1,40 Persiana Blecaute Bege',
      'SKU: BK140140BEGE',
      'Bege Claro Acabamento Branco',
      'Quantidade: 1',
      'Cor: Bege',
      'Desenho do tecido: Liso']));
    v=vol("packId='2000015000000451'");
    eq('a caixa fica retida', v&&v.estagio, 'bloqueado');
    eq('com as duas persianas escritas', v&&pecas(v.id), '1xBK120120BEGE + 1xBK140140BEGE');
    limpar();

    console.log('\n── 5. quem todo mundo lê igual não é retido ──');
    r=await subir(await pdf([ETQ_JULIANE, {venda:'2000018936112906', nf:'8152', nome:'Cliente Jose Teste'}],
      JULIANE.concat([
      'CLONAPDJCJOV3PLRFXO6FTJRUA Persiana Rolo Tela Solar 1% 1,20 Larg X 1,20 Alt - Premium',
      'Venda: 2000018936112906 SKU: BK120120BEGE',
      'Cliente Jose Teste Quantidade: 2',
      'Cor: Bege'])));
    eq('a venda comum segue', vol("venda='2000019048761546'").estagio, 'pendente');
    v=vol("venda='2000018936112906'");
    eq('a de 2 unidades do MESMO SKU segue (R-VOL-04)', v&&v.estagio, 'pendente');
    eq('com as 2 peças gravadas', v&&pecas(v.id), '2xBK120120BEGE');
    eq('nenhum volume retido por quantidade', r.body.quantidade_duvida, 0);
    eq('e a conta do PDF fecha', r.body.conta_pdf && r.body.conta_pdf.fecha, true);
    eq('com 3 peças na folha', r.body.conta_pdf && r.body.conta_pdf.folha, 3);
    eq('e 3 peças no sistema', r.body.conta_pdf && r.body.conta_pdf.sistema, 3);
    limpar();

    console.log('\n── 6. a conta do PDF inteiro ──');
    /* Um item inteiro na folha (pack, venda, nome) sem etiqueta no PDF: a folha
       declara 2 peças e o sistema gravou 1. */
    r=await subir(await pdf([ETQ_JULIANE], JULIANE.concat([
      'CCCCCCCCCCCCCCCCCCCCCCCCCC Cortina Rolo Blackout 1,60x1,60 Persiana Bege',
      'Pack ID: 2000015000000699 SKU: BK160160BEGE',
      'Venda: 2000019000000601 Quantidade: 1',
      'Cliente Sem Etiqueta Cor: Bege',
      'Desenho do tecido: Liso'])));
    ok('a resposta traz a conta', !!r.body.conta_pdf, JSON.stringify(r.body));
    eq('e diz que não fecha', r.body.conta_pdf && r.body.conta_pdf.fecha, false);
    eq('2 peças na folha', r.body.conta_pdf && r.body.conta_pdf.folha, 2);
    eq('1 no sistema', r.body.conta_pdf && r.body.conta_pdf.sistema, 1);
    limpar();

    console.log('\n── 7. quem assina o pacote libera ──');
    await subir(await pdf([{venda:'2000019000000301', nf:'9301', nome:'Cliente Toquio Teste'}],[
      'AAAAAAAAAAAAAAAAAAAAAAAAAA Cortina Rolo Blackout Medida L 1,50 X A 1,50 Blecaute Roller Cor Bege Claro -',
      'Venda: 2000019000000301','SKU: BK150150BEGE','Cliente Toquio Teste','Tóquio 002',
      'Acabamento branco','Quantidade: 2','Cor: Bege claro - Tóquio 002','Desenho do tecido: Liso']));
    v=vol("venda='2000019000000301'");
    let l=await (await fetch(base+'/api/pacote/pendentes')).json();
    ok('a caixa aparece no card do pacote', l.some(x=>x.id===(v&&v.id)), JSON.stringify(l.map(x=>x.id)));
    let rr=await (await fetch(base+'/api/pacote/resolver',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id:v.id, itens:[{codigo:'BK150150BEGE',qtd:2}]})})).json();
    eq('o card libera', rr.ok, true);
    eq('a caixa vira pendente', vol("venda='2000019000000301'").estagio, 'pendente');
    eq('com as 2 peças, assinadas', pecas(v.id), '2xBK150150BEGE');
  } finally { srv.close(); }
}

main().catch(e=>{ falhas++; console.log('  FALHOU — o teste estourou: '+(e&&e.stack||e)); })
  .finally(()=>{
    db.close(); fs.rmSync(tmp,{recursive:true,force:true});
    console.log('\n'+(casos-falhas)+' ok, '+falhas+' falha(s)\n');
    process.exit(falhas?1:0);
  });
