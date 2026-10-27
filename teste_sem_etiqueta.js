#!/usr/bin/env node
/* teste_sem_etiqueta.js — a venda da folha do ML que não tem etiqueta no PDF não
 * pode sumir (spec CONFERENCIA-DA-QUANTIDADE, fase 1-B).
 *
 *   node teste_sem_etiqueta.js
 *
 * O caso real: NF 8301, venda 2000018960012186, BK180150BEGE. A folha do ML
 * listou a venda, a etiqueta dela não veio em PDF nenhum, e o sistema nunca
 * criou a caixa: ela não apareceu em tela nenhuma, ATRASOU no Mercado Livre e
 * saiu impressa por fora — sem conferência, com o saldo 1 acima. O aviso do
 * upload (PR #236) aparece uma vez só; esta fase grava a venda numa lista que
 * fica em Admin → Bloqueados até alguém resolver.
 *
 * O que este arquivo trava:
 *   1. o upload grava a venda da folha sem etiqueta, uma vez só por venda;
 *   2. a venda cuja etiqueta JÁ entrou por outro PDF não é gravada;
 *   3. a etiqueta chegando num PDF depois resolve a venda sozinha;
 *   4. uma pessoa resolve com motivo obrigatório (cancelada no ML, ou saiu por
 *      fora), e fica o registro de quem e quando;
 *   5. a lista diz há quantos dias a venda espera;
 *   6. a aba Bloqueados mostra o card e conta a venda, e a Etiqueta de Venda
 *      mostra só o aviso de uma linha, sem botão (decisão do dono, 27/10/2026);
 *   7. a lista entra na cobertura do modo teste.
 *
 * Upload de verdade (exp_route + parse.js) num banco temporário.
 */
const {PDFDocument,StandardFonts}=require('pdf-lib');
const Database=require('better-sqlite3');
const express=require('express');
const fs=require('fs'), os=require('os'), path=require('path');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pcp-semetq-'));
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
  INSERT INTO skus (codigo) VALUES ('BK180150BEGE'),('BK160160CINZA'),('BK160160BEGE');`);
const app=express(); app.use(express.json({limit:'25mb'}));
app.locals.acesso={ auditar:()=>{} };
app.use((req,res,next)=>{ req.usuario={id:7,nome:'Quem Resolve'}; next(); });
require('./exp_route')(app, db);

function etiqueta(o){
  return ['lucas desiderio lucas des #136721278','Rua Jussara 1250 Tamboré',
    o.pack?('Pack ID: '+o.pack):('Venda: '+o.venda),'Despachar: segunda 19/out',
    'SEG 20/10/2026 NF: '+o.nf, o.nome+' (APELIDO)','Endereço: (removido)','Cidade de destino : (removida)'];
}
async function pdf(etiquetas, folha){
  const d=await PDFDocument.create(), f=await d.embedFont(StandardFonts.Helvetica);
  const pag=ls=>{ const p=d.addPage([595,842]); let y=800;
    for(const l of ls){ p.drawText(l,{x:30,y,size:9,font:f}); y-=14; } };
  etiquetas.forEach(e=>pag(etiqueta(e)));
  pag(['Despachem as suas vendas o quanto antes.','Identifiicação Produtos'].concat(folha));
  return Buffer.from(await d.save());
}
const JULIANE=['434MYMXU3VN4NGY5XLEX4XKMPU Cortina Rolo Blackout 1,60x1,60 Persiana Home Office Cinza',
  'Venda: 2000019048761546 SKU: BK160160CINZA','Cliente A Quantidade: 1','Cor: Cinza','Desenho do tecido: Liso'];
const NF8301=['BOVBK6CG3RLDDHOCLLZM6EN2A4 Cortina Rolo Blackout 1,80x1,50 Blecaute Persiana Bege',
  'Venda: 2000018960012186 SKU: BK180150BEGE','Cliente B Quantidade: 1','Cor: Bege','Desenho do tecido: Liso'];
const OUTRA=['QQQQQQQQQQQQQQQQQQQQQQQQQQ Cortina Rolo Blackout 1,60x1,60 Persiana Bege',
  'Venda: 2000019000000777 SKU: BK160160BEGE','Cliente C Quantidade: 1','Cor: Bege','Desenho do tecido: Liso'];
const ETQ_A={venda:'2000019048761546', nf:'8197', nome:'Cliente A'};
const ETQ_8301={venda:'2000018960012186', nf:'8301', nome:'Cliente B'};
const ETQ_C={venda:'2000019000000777', nf:'8400', nome:'Cliente C'};

async function main(){
  const srv=app.listen(0); await new Promise(r=>srv.once('listening',r));
  const base='http://127.0.0.1:'+srv.address().port;
  const subir=async buf=>{
    const r=await fetch(base+'/api/lote/upload',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({pdf:'data:application/pdf;base64,'+buf.toString('base64')})});
    return {status:r.status, body:await r.json()};
  };
  const lista=async()=>(await fetch(base+'/api/semetiqueta')).json();
  const resolver=async corpo=>{
    const r=await fetch(base+'/api/semetiqueta/resolver',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(corpo)});
    return {status:r.status, body:await r.json()};
  };
  try{
    console.log('\n── 1. o upload grava a venda da folha sem etiqueta (NF 8301) ──');
    let r=await subir(await pdf([ETQ_A], JULIANE.concat(NF8301)));
    eq('o upload responde ok', r.status, 200);
    eq('a resposta conta a venda nova sem etiqueta', r.body.sem_etiqueta_novas, 1);
    let l=await lista();
    eq('a lista tem a venda', l.map(x=>x.venda).join(','), '2000018960012186');
    eq('com o SKU', l[0]&&l[0].sku, 'BK180150BEGE');
    eq('com a quantidade', l[0]&&l[0].qtd, 1);
    eq('esperando há 0 dias (vista hoje)', l[0]&&l[0].dias, 0);
    ok('com a data em que foi vista', /^\d{4}-\d{2}-\d{2}/.test(l[0]&&l[0].visto_em||''), l[0]&&l[0].visto_em);
    eq('a venda comum entrou como caixa, e não como pendência', db.prepare("SELECT COUNT(*) n FROM lote WHERE venda='2000019048761546'").get().n, 1);

    console.log('\n── 2. o mesmo PDF de novo não duplica ──');
    r=await subir(await pdf([ETQ_A], JULIANE.concat(NF8301)));
    eq('nenhuma venda nova sem etiqueta', r.body.sem_etiqueta_novas, 0);
    eq('a lista continua com uma', (await lista()).length, 1);

    console.log('\n── 3. a venda cuja etiqueta já entrou por outro PDF não é gravada ──');
    await subir(await pdf([ETQ_C], OUTRA));
    r=await subir(await pdf([ETQ_A], JULIANE.concat(OUTRA)));
    eq('a venda que já tem caixa não vira pendência', r.body.sem_etiqueta_novas, 0);
    eq('a lista não ganhou ninguém', (await lista()).map(x=>x.venda).join(','), '2000018960012186');

    console.log('\n── 4. a etiqueta chega num PDF depois: a venda se resolve sozinha ──');
    db.prepare("UPDATE venda_sem_etiqueta SET visto_em=datetime('now','localtime','-2 day')").run();
    eq('esperando há 2 dias', (await lista())[0].dias, 2);
    r=await subir(await pdf([ETQ_8301], NF8301));
    eq('a resposta conta a resolvida', r.body.sem_etiqueta_resolvidas, 1);
    eq('a lista esvazia', (await lista()).length, 0);
    let row=db.prepare("SELECT * FROM venda_sem_etiqueta WHERE venda='2000018960012186'").get();
    eq('resolvida pela etiqueta', row&&row.resolucao, 'etiqueta');
    ok('com a data', !!(row&&row.resolvida_em));
    eq('e a caixa existe agora', db.prepare("SELECT COUNT(*) n FROM lote WHERE venda='2000018960012186'").get().n, 1);

    console.log('\n── 5. uma pessoa resolve, com motivo ──');
    /* Uma venda nova sem etiqueta para resolver à mão. */
    const SEM=['WWWWWWWWWWWWWWWWWWWWWWWWWW Cortina Rolo Blackout 1,60x1,60 Persiana Bege',
      'Venda: 2000019000000888 SKU: BK160160BEGE','Cliente D Quantidade: 1','Cor: Bege','Desenho do tecido: Liso'];
    const SEM2=['XXXXXXXXXXXXXXXXXXXXXXXXXX Cortina Rolo Blackout 1,60x1,60 Persiana Cinza',
      'Venda: 2000019000000999 SKU: BK160160CINZA','Cliente E Quantidade: 1','Cor: Cinza','Desenho do tecido: Liso'];
    await subir(await pdf([ETQ_A], JULIANE.concat(SEM).concat(SEM2)));
    l=await lista();
    eq('as duas estão na lista', l.map(x=>x.venda).sort().join(','), '2000019000000888,2000019000000999');
    const a=l.find(x=>x.venda==='2000019000000888'), b=l.find(x=>x.venda==='2000019000000999');
    let x=await resolver({id:a.id, resolucao:'por_fora', motivo:''});
    eq('sem motivo é recusado (400)', x.status, 400);
    x=await resolver({id:a.id, resolucao:'qualquer', motivo:'teste'});
    eq('resolução desconhecida é recusada (400)', x.status, 400);
    x=await resolver({id:a.id, resolucao:'por_fora', motivo:'impressa direto do ML no dia 21'});
    eq('com motivo, resolve', x.body.ok, true);
    ok('e lembra o saldo que ficou 1 acima', /estoque|saldo/i.test(x.body.aviso||''), x.body.aviso);
    row=db.prepare('SELECT * FROM venda_sem_etiqueta WHERE id=?').get(a.id);
    eq('gravado como "saiu por fora"', row.resolucao, 'por_fora');
    eq('com o motivo', row.motivo, 'impressa direto do ML no dia 21');
    eq('e quem resolveu', row.resolvida_por, 'Quem Resolve');
    x=await resolver({id:b.id, resolucao:'cancelada', motivo:'cancelada pelo comprador'});
    eq('cancelada no ML também resolve', x.body.ok, true);
    eq('a lista esvazia', (await lista()).length, 0);
    x=await resolver({id:b.id, resolucao:'cancelada', motivo:'de novo'});
    eq('resolver de novo é recusado (409)', x.status, 409);
    x=await resolver({id:999999, resolucao:'cancelada', motivo:'x'});
    eq('venda que não existe é 404', x.status, 404);

    console.log('\n── 6. as telas ──');
    const idx=fs.readFileSync(path.join(__dirname,'public','index.html'),'utf8');
    ok('a aba Bloqueados tem o card da venda sem etiqueta', /id="semEtqCard"/.test(idx));
    ok('e o card entra na conta da aba', /carregarSemEtq\(\)/.test(idx) && /n\+nd\+nm\+np\+ns/.test(idx));
    const emb=fs.readFileSync(path.join(__dirname,'public','embalagem.html'),'utf8');
    ok('a Etiqueta de Venda lê a lista', /\/api\/semetiqueta/.test(emb));
    ok('e manda para Admin → Bloqueados, sem botão de resolver', /Admin → Bloqueados/.test(emb) && !/semetiqueta\/resolver/.test(emb));

    console.log('\n── 7. o modo teste cobre a lista ──');
    const tr=fs.readFileSync(path.join(__dirname,'teste_route.js'),'utf8');
    ok('venda_sem_etiqueta está em TABELAS', /nome:'venda_sem_etiqueta'/.test(tr));
  } finally { srv.close(); }
}

main().catch(e=>{ falhas++; console.log('  FALHOU — o teste estourou: '+(e&&e.stack||e)); })
  .finally(()=>{
    db.close(); fs.rmSync(tmp,{recursive:true,force:true});
    console.log('\n'+(casos-falhas)+' ok, '+falhas+' falha(s)\n');
    process.exit(falhas?1:0);
  });
