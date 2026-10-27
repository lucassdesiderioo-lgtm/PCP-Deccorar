#!/usr/bin/env node
/* teste_conta_aberta.js — o PDF cuja conta não fecha vira pendência gravada
 * (spec CENTRAL-DE-PENDENCIAS, fase 2, 27/10/2026).
 *
 *   node teste_conta_aberta.js
 *
 * A conta do PDF (leitura L4 da CONFERENCIA-DA-QUANTIDADE) compara as
 * persianas que a folha do ML declara com as que o sistema gravou. Quando ela
 * não fecha e a diferença não é uma venda sem etiqueta (que tem card próprio),
 * o aviso aparecia UMA VEZ, no upload, e sumia quando a tela fechava — o mesmo
 * modo de falhar da NF 8301. Agora o upload grava, e a linha fica em Admin →
 * Pendências até uma pessoa resolver, com motivo (decisão do dono: quem julga
 * é ele, olhando o PDF e o pedido no Mercado Livre).
 *
 * O que este arquivo trava:
 *   1. o PDF com conta que não fecha é gravado, uma vez só por PDF;
 *   2. o PDF com conta que fecha não grava nada;
 *   3. a venda sem etiqueta não entra aqui (tem card próprio);
 *   4. resolver pede uma das duas opções e o motivo, e fica o registro;
 *   5. o PDF resolvido que sobe de novo não reabre a pendência;
 *   6. a permissão, o modo teste e a tela.
 *
 * Os PDFs são os do caderno de casos reais (casos/), pelo upload de verdade.
 */
const {PDFDocument,StandardFonts}=require('pdf-lib');
const Database=require('better-sqlite3');
const express=require('express');
const fs=require('fs'), os=require('os'), path=require('path');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pcp-conta-'));
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

const caso=n=>JSON.parse(fs.readFileSync(path.join(__dirname,'casos',n),'utf8'));
const NAO_FECHA=caso('2026-10-19-nf-8196-pdf-nao-fecha.json');      // folha 6 · sistema 7
const FECHA=caso('2026-10-16-nf-8152.json');                         // folha 34 · sistema 34
const SEM_ETQ=caso('2026-10-21-venda-sem-etiqueta-2000018960012186.json'); // só a venda sem etiqueta

const latino=s=>String(s).replace(/[^\x20-\x7e -ÿ]/g,'?');
async function montarPdf(paginas){
  const d=await PDFDocument.create(), f=await d.embedFont(StandardFonts.Helvetica);
  for(const linhas of paginas){
    const p=d.addPage([595,Math.max(842,40+linhas.length*14)]); let y=p.getHeight()-40;
    for(const l of linhas){ p.drawText(latino(l),{x:30,y,size:9,font:f}); y-=14; }
  }
  return Buffer.from(await d.save());
}

const db=new Database(path.join(tmp,'t.db'));
db.exec(`CREATE TABLE skus (codigo TEXT PRIMARY KEY, largura_cm INT, altura_cm INT,
    cor_codigo TEXT, cor TEXT, tecido_codigo TEXT, modelo_id INT, estoque INT DEFAULT 0);
  CREATE TABLE cor (codigo TEXT PRIMARY KEY, nome TEXT);
  CREATE TABLE tecido (codigo TEXT PRIMARY KEY, nome TEXT);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, exige_medida INT DEFAULT 1, sob_medida INT DEFAULT 0);`);
const insSku=db.prepare('INSERT OR IGNORE INTO skus (codigo) VALUES (?)');
[NAO_FECHA,FECHA,SEM_ETQ].forEach(c=>c.paginas.forEach(p=>p.forEach(l=>{
  const m=String(l).match(/SKU:\s*(\S+)/); if(m) insSku.run(m[1].toUpperCase()); })));
const auditoria=[];
const app=express(); app.use(express.json({limit:'25mb'}));
app.locals.acesso={ auditar:(...a)=>auditoria.push(a) };
app.use((req,res,next)=>{ req.usuario={id:7,nome:'Quem Resolve'}; next(); });
require('./exp_route')(app, db);

let srv, base;
async function subir(c){
  const buf=await montarPdf(c.paginas);
  const r=await fetch(base+'/api/lote/upload',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({pdf:'data:application/pdf;base64,'+buf.toString('base64')})});
  return { status:r.status, corpo:await r.json() };
}
async function get(u){ const r=await fetch(base+u); return { status:r.status, corpo:await r.json() }; }
async function post(u,b){ const r=await fetch(base+u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}); return { status:r.status, corpo:await r.json() }; }
const abertas=()=>db.prepare("SELECT COUNT(*) n FROM pdf_conta_aberta WHERE resolvida_em IS NULL").get().n;
const todas=()=>db.prepare("SELECT COUNT(*) n FROM pdf_conta_aberta").get().n;

(async()=>{
  srv=app.listen(0); await new Promise(r=>srv.once('listening',r));
  base='http://127.0.0.1:'+srv.address().port;

  console.log('\n── 1. o PDF cuja conta não fecha fica gravado ──');
  let u=await subir(NAO_FECHA);
  eq('o upload aceitou', u.status, 200);
  eq('a resposta diz que abriu uma pendência', u.corpo.conta_aberta_nova, 1);
  let l=await get('/api/contaaberta');
  eq('a lista responde', l.status, 200);
  eq('uma linha aberta', (l.corpo||[]).length, 1);
  const a=(l.corpo||[])[0]||{};
  eq('com as persianas da folha', a.folha, 6);
  eq('com as que o sistema gravou', a.sistema, 7);
  eq('e a diferença sem explicação, com sinal', a.resto, -1);
  eq('diz as NFs do PDF em faixa, para achar o papel', a.nfs, 'NFs 8195 a 8200 (6)');
  eq('esperando há 0 dias', a.dias, 0);

  console.log('\n── 1-B. o mesmo PDF de novo não abre outra ──');
  /* O PDF montado de novo traz outra data de criação dentro, como o do ML
     baixado de novo: os bytes mudam e as vendas não. */
  await new Promise(r=>setTimeout(r,1100));
  u=await subir(NAO_FECHA);
  eq('o segundo upload não abre', u.corpo.conta_aberta_nova, 0);
  eq('continua uma linha', todas(), 1);

  console.log('\n── 2. o PDF que fecha não grava ──');
  u=await subir(FECHA);
  eq('o upload aceitou', u.status, 200);
  eq('nada aberto', u.corpo.conta_aberta_nova, 0);
  eq('continua uma linha', todas(), 1);

  console.log('\n── 3. a venda sem etiqueta tem card próprio ──');
  u=await subir(SEM_ETQ);
  eq('a venda sem etiqueta foi para o card dela', u.corpo.sem_etiqueta_novas, 1);
  eq('e não abriu conta aberta (a diferença está explicada)', u.corpo.conta_aberta_nova, 0);
  eq('continua uma linha', todas(), 1);

  console.log('\n── 4. uma pessoa resolve, com uma das duas opções e o motivo ──');
  let r=await post('/api/contaaberta/resolver',{id:a.id, resolucao:'conferido'});
  eq('sem motivo é recusado', r.status, 400);
  r=await post('/api/contaaberta/resolver',{id:a.id, resolucao:'qualquer', motivo:'x'});
  eq('opção desconhecida é recusada', r.status, 400);
  r=await post('/api/contaaberta/resolver',{id:999, resolucao:'conferido', motivo:'x'});
  eq('linha que não existe é 404', r.status, 404);
  eq('nada resolvido ainda', abertas(), 1);
  r=await post('/api/contaaberta/resolver',{id:a.id, resolucao:'conferido', motivo:'a etiqueta 2 é a segunda persiana do pacote do Roberto'});
  eq('com opção e motivo passa', r.status, 200);
  const g=db.prepare('SELECT * FROM pdf_conta_aberta WHERE id=?').get(a.id);
  eq('grava quem', g.resolvida_por, 'Quem Resolve');
  ok('grava quando', !!g.resolvida_em);
  eq('grava a opção', g.resolucao, 'conferido');
  ok('grava o motivo', /Roberto/.test(g.motivo||''));
  ok('vai para a auditoria', auditoria.some(x=>x[2]==='resolver_conta_aberta'), JSON.stringify(auditoria.map(x=>x[2])));
  eq('sai da lista', ((await get('/api/contaaberta')).corpo||[]).length, 0);
  r=await post('/api/contaaberta/resolver',{id:a.id, resolucao:'corrigido', motivo:'de novo'});
  eq('resolver de novo é 409', r.status, 409);

  console.log('\n── 5. o PDF resolvido que sobe de novo não reabre ──');
  u=await subir(NAO_FECHA);
  eq('não reabre', u.corpo.conta_aberta_nova, 0);
  eq('nada aberto', abertas(), 0);

  console.log('\n── 4-B. a segunda opção também vale ──');
  db.prepare("UPDATE pdf_conta_aberta SET resolvida_em=NULL, resolucao=NULL, resolvida_por=NULL, motivo=NULL").run();
  r=await post('/api/contaaberta/resolver',{id:a.id, resolucao:'corrigido', motivo:'cadastrei a peça que faltava na caixa 3'});
  eq('"corrigi o que faltava" passa', r.status, 200);

  console.log('\n── 6. a permissão, o modo teste e a tela ──');
  const app2=express(), db2=new Database(':memory:');
  const calar=console.log; console.log=()=>{};
  try{ require('./acesso')(app2, db2); } finally { console.log=calar; }
  const AC=app2.locals.acesso;
  eq('ler é @admin', AC.permDaRota('/api/contaaberta','GET'), '@admin');
  eq('resolver é @admin', AC.permDaRota('/api/contaaberta/resolver','POST'), '@admin');
  const tr=fs.readFileSync(path.join(__dirname,'teste_route.js'),'utf8');
  ok('pdf_conta_aberta está em TABELAS', /nome:'pdf_conta_aberta'/.test(tr));
  const idx=fs.readFileSync(path.join(__dirname,'public','index.html'),'utf8');
  ok('a aba Pendências chama a lista', idx.indexOf('/api/contaaberta')>=0);
  ok('o card mostra as duas opções', /conferi, o sistema está certo/i.test(idx) && /corrigi o que faltava/i.test(idx));
  ok('o número da aba soma o card', /carregarContaAberta\(\)/.test(idx));
  const blq=idx.slice(idx.indexOf('<div id="v-blq"'), idx.indexOf('<div id="v-cor"'));
  const cor=idx.slice(idx.indexOf('<div id="v-cor"'), idx.indexOf('<div id="v-tst"'));
  ok('a Mesa (o passivo) é desenhada na aba Pendências', blq.indexOf('id="corPassivo"')>=0 && cor.indexOf('id="corPassivo"')<0);
  ok('a decisão continua na tela da Mesa', cor.indexOf('id="corObjeto"')>=0 && blq.indexOf('id="corObjeto"')<0);
  ok('o link da Mesa leva para onde se decide', /corIrMesa\(\);corAbrir/.test(idx) && /corIrMesa\(\);corVencidos/.test(idx) && /corIrMesa\(\);corConferencias/.test(idx));
  const marc=idx.replace(/<script[\s\S]*?<\/script>/g,'');
  const ids={}; (marc.match(/\bid="[^"]+"/g)||[]).forEach(x=>{ ids[x]=(ids[x]||0)+1; });
  const rep=Object.keys(ids).filter(k=>ids[k]>1);
  ok('nenhum id repetido na marcação', rep.length===0, rep.join(', '));
})().catch(e=>{ falhas++; console.log('  FALHOU — o teste estourou: '+(e&&e.stack||e)); })
  .finally(()=>{
    try{ srv&&srv.close(); }catch(e){}
    try{ db.close(); }catch(e){}
    fs.rmSync(tmp,{recursive:true,force:true});
    console.log('\n'+(casos-falhas)+' ok, '+falhas+' falha(s)\n');
    process.exit(falhas?1:0);
  });
