#!/usr/bin/env node
/* teste_casos_reais.js — o caderno de casos reais (spec CONFERENCIA-DA-QUANTIDADE
 * §4, regra R-INV-01).
 *
 *   node teste_casos_reais.js
 *
 * Cada arquivo de `casos/` é um problema que aconteceu de verdade: o texto do
 * PDF do Mercado Livre (com nomes e endereços trocados) e o que DEVIA ter saído
 * para a venda do caso. Este teste remonta o PDF, sobe pelo upload de verdade
 * (exp_route + parse.js) num banco temporário e exige o resultado.
 *
 * Os testes do parse montam a folha À MÃO, no formato que alguém achou que o
 * ML usa. O caderno usa o texto que o ML MANDOU — é onde os problemas aparecem.
 *
 * Caso novo entra pelo `registrar_caso.js` ANTES do conserto, reprovando; o
 * conserto é o que o faz passar. Caso gravado nunca se apaga: se um dia o ML
 * mudar o formato e um caso velho deixar de fazer sentido, ele ganha uma nota.
 *
 * Não toca no servidor.
 */
const {PDFDocument,StandardFonts}=require('pdf-lib');
const Database=require('better-sqlite3');
const express=require('express');
const fs=require('fs'), os=require('os'), path=require('path');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pcp-casos-'));
process.env.PCP_DIR=tmp;

let casos=0, falhas=0;
function ok(desc, cond, detalhe){
  casos++;
  if(cond) console.log('  ok  '+casos+' — '+desc);
  else { falhas++; console.log('  FALHOU '+casos+' — '+desc+(detalhe?'\n         '+detalhe:'')); }
}

const DIR=path.join(__dirname,'casos');
const arquivos=fs.existsSync(DIR)?fs.readdirSync(DIR).filter(f=>/\.json$/.test(f)).sort():[];

/* A fonte padrão do PDF só escreve o alfabeto latino: o resto vira "?", o que
   não muda nada que o leitor procura (números, "SKU:", "Quantidade:"). */
const latino=s=>String(s).replace(/[^\x20-\x7e\u00a0-\u00ff]/g,'?');
async function montarPdf(paginas){
  const d=await PDFDocument.create(), f=await d.embedFont(StandardFonts.Helvetica);
  for(const linhas of paginas){
    const p=d.addPage([595,Math.max(842,40+linhas.length*14)]); let y=p.getHeight()-40;
    for(const l of linhas){ p.drawText(latino(l),{x:30,y,size:9,font:f}); y-=14; }
  }
  return Buffer.from(await d.save());
}

async function rodar(caso){
  const db=new Database(':memory:');
  /* Todo SKU do caso existe no cadastro: o que o caderno confere é a LEITURA,
     e um SKU fora do cadastro retém por outro motivo (§6). */
  db.exec(`CREATE TABLE skus (codigo TEXT PRIMARY KEY, largura_cm INT, altura_cm INT,
      cor_codigo TEXT, cor TEXT, tecido_codigo TEXT, modelo_id INT, estoque INT DEFAULT 0);
    CREATE TABLE cor (codigo TEXT PRIMARY KEY, nome TEXT);
    CREATE TABLE tecido (codigo TEXT PRIMARY KEY, nome TEXT);
    CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, exige_medida INT DEFAULT 1, sob_medida INT DEFAULT 0);`);
  const ins=db.prepare('INSERT OR IGNORE INTO skus (codigo) VALUES (?)');
  caso.paginas.forEach(p=>p.forEach(l=>{ const m=String(l).match(/SKU:\s*(\S+)/); if(m) ins.run(m[1].toUpperCase()); }));
  const app=express(); app.use(express.json({limit:'25mb'}));
  app.locals.acesso={auditar:()=>{}};
  app.use((req,res,next)=>{ req.usuario={id:1,nome:'Caderno'}; next(); });
  require('./exp_route')(app, db);
  const srv=app.listen(0); await new Promise(r=>srv.once('listening',r));
  try{
    const buf=await montarPdf(caso.paginas);
    const r=await fetch('http://127.0.0.1:'+srv.address().port+'/api/lote/upload',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({pdf:'data:application/pdf;base64,'+buf.toString('base64')})});
    const corpo=await r.json();
    ok(caso.id+': o upload aceitou o PDF', r.status===200 && corpo.ok, JSON.stringify(corpo));
    for(const e of caso.esperado){
      const v=db.prepare('SELECT * FROM lote WHERE packId=? OR venda=?').get(e.chave,e.chave);
      ok(caso.id+': a venda '+e.chave+' entrou', !!v);
      if(!v) continue;
      const itens=db.prepare('SELECT codigo,qtd FROM lote_item WHERE lote_id=? ORDER BY id').all(v.id);
      const pecas=(itens.length?itens.map(i=>i.qtd+'x'+i.codigo):['1x'+v.codigo]);
      ok(caso.id+': '+e.chave+' com as peças '+e.pecas.join(' + '),
         JSON.stringify(pecas.slice().sort())===JSON.stringify(e.pecas.slice().sort()),
         'gravado: '+pecas.join(' + '));
      if(e.estagio) ok(caso.id+': '+e.chave+' fica '+e.estagio, v.estagio===e.estagio, 'veio '+v.estagio+' · '+(v.bloqueio||''));
      if(e.card) ok(caso.id+': '+e.chave+' no card '+e.card, String(v.bloqueio||'').startsWith(e.card+':'), v.bloqueio);
    }
  } finally { srv.close(); db.close(); }
}

(async()=>{
  console.log('\n── o caderno de casos reais: '+arquivos.length+' caso(s) ──');
  ok('há caso no caderno', arquivos.length>0);
  for(const f of arquivos){
    const caso=JSON.parse(fs.readFileSync(path.join(DIR,f),'utf8'));
    console.log('\n'+caso.id+' — '+(caso.o_que_aconteceu||''));
    ok(f+': tem páginas e o que devia sair', Array.isArray(caso.paginas)&&caso.paginas.length>0
       && Array.isArray(caso.esperado)&&caso.esperado.length>0);
    /* Nome de cliente não entra no caderno (decisão do dono, 27/10/2026). */
    const texto=JSON.stringify(caso.paginas);
    ok(f+': sem endereço de cliente', !/Endere[çc]o:\s*(?!\(removido\))\S/.test(texto) && !/CEP:\s*\d/.test(texto));
    await rodar(caso);
  }
})().catch(e=>{ falhas++; console.log('  FALHOU — o teste estourou: '+(e&&e.stack||e)); })
  .finally(()=>{
    fs.rmSync(tmp,{recursive:true,force:true});
    console.log('\n'+(casos-falhas)+' ok, '+falhas+' falha(s)\n');
    process.exit(falhas?1:0);
  });
