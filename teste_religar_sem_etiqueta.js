#!/usr/bin/env node
/* teste_religar_sem_etiqueta.js — o script que fecha o card "venda na folha
 * sem etiqueta" cuja etiqueta estava no PDF (29/10/2026, NF 8827 e 8828).
 *
 *   node teste_religar_sem_etiqueta.js
 *
 * Monta, numa pasta temporaria, o banco e o PDF do caso real
 * (casos/2026-10-29-nf-8828.json) e roda o script como no servidor. Trava:
 * a simulacao nao grava; o --aplicar faz backup e fecha SO o card cuja caixa
 * esta no sistema com o mesmo SKU; o resto fica aberto, dizendo por que; e
 * rodar de novo nao fecha nada. Nao toca no servidor.
 */
const {PDFDocument,StandardFonts}=require('pdf-lib');
const Database=require('better-sqlite3');
const {execFileSync}=require('child_process');
const fs=require('fs'), os=require('os'), path=require('path');

let casos=0, falhas=0;
function ok(desc, cond, detalhe){
  casos++;
  if(cond) console.log('  ok  '+casos+' — '+desc);
  else { falhas++; console.log('  FALHOU '+casos+' — '+desc+(detalhe?'\n         '+detalhe:'')); }
}

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pcp-religar-'));
const latino=s=>String(s).replace(/[^\x20-\x7e -ÿ]/g,'?');
async function montarPdf(paginas){
  const d=await PDFDocument.create(), f=await d.embedFont(StandardFonts.Helvetica);
  for(const linhas of paginas){
    const p=d.addPage([595,Math.max(842,40+linhas.length*14)]); let y=p.getHeight()-40;
    for(const l of linhas){ p.drawText(latino(l),{x:30,y,size:9,font:f}); y-=14; }
  }
  return Buffer.from(await d.save());
}
const rodar=(...a)=>execFileSync(process.execPath,[path.join(__dirname,'religar_sem_etiqueta.js'),...a],
  {env:{...process.env, PCP_DIR:tmp}, encoding:'utf8', stdio:['ignore','pipe','ignore']});

(async()=>{
  const caso=JSON.parse(fs.readFileSync(path.join(__dirname,'casos','2026-10-29-nf-8828.json'),'utf8'));
  fs.mkdirSync(path.join(tmp,'lotes'),{recursive:true});
  fs.writeFileSync(path.join(tmp,'lotes','1793264623433.pdf'), await montarPdf(caso.paginas));

  const db=new Database(path.join(tmp,'dados.db'));
  db.exec(`CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, nf TEXT, packId TEXT, venda TEXT, estagio TEXT DEFAULT 'pendente');
    CREATE TABLE venda_sem_etiqueta (id INTEGER PRIMARY KEY AUTOINCREMENT, venda TEXT, packId TEXT, sku TEXT,
      qtd INTEGER DEFAULT 1, pdf TEXT, visto_em TEXT, ultimo_visto_em TEXT,
      resolvida_em TEXT, resolucao TEXT, resolvida_por TEXT, motivo TEXT, teste INTEGER DEFAULT 0);`);
  const cx=db.prepare('INSERT INTO lote (codigo,nf,packId,venda) VALUES (?,?,?,?)');
  cx.run('BK180150CINZA','8828','2000015735133241',null);   // as duas do caso: caixa so com o pack
  cx.run('BK180150CINZA','8827','2000015735133243',null);
  cx.run('BK999','8803','2000015739279681',null);           // caixa de outro SKU no pack da folha
  const card=db.prepare('INSERT INTO venda_sem_etiqueta (venda,sku,pdf) VALUES (?,?,?)');
  card.run('2000019201782254','BK180150CINZA','1793264623433.pdf');   // 1 fecha
  card.run('2000019201782272','BK180150CINZA','1793264623433.pdf');   // 2 fecha
  card.run('2000019206213048','BK160160BEGE','1793264623433.pdf');    // 3 SKU nao bate
  card.run('2000019185354834','BK130130CINZA','1793264623433.pdf');   // 4 sem caixa no sistema
  card.run('2000019201782254','BK180150CINZA','1700000000000.pdf');   // 5 PDF ja apagado
  db.close();
  const abertos=()=>{ const d=new Database(path.join(tmp,'dados.db'),{readonly:true});
    const r=d.prepare('SELECT id FROM venda_sem_etiqueta WHERE resolvida_em IS NULL ORDER BY id').all().map(x=>x.id);
    d.close(); return r; };

  console.log('\n── a simulacao ──');
  const sim=rodar();
  ok('a simulacao nao grava nada', JSON.stringify(abertos())==='[1,2,3,4,5]', JSON.stringify(abertos()));
  ok('a simulacao diz que vai fechar 2', /O QUE VOU FECHAR \(2\)/.test(sim), sim);
  ok('e diz por que cada um fica', /confira a mao/.test(sim) && /nao esta no sistema/.test(sim) && /saiu de lotes/.test(sim), sim);
  ok('sem --aplicar nao ha backup', !fs.existsSync(path.join(tmp,'backups')));

  console.log('\n── o --aplicar ──');
  const ap=rodar('--aplicar');
  ok('fecha so os dois cards cuja caixa esta no sistema com o mesmo SKU', JSON.stringify(abertos())==='[3,4,5]', JSON.stringify(abertos()));
  const bk=fs.existsSync(path.join(tmp,'backups'))?fs.readdirSync(path.join(tmp,'backups')):[];
  ok('faz o backup antes', bk.some(f=>/^dados-antes-religar-.*\.db$/.test(f)), JSON.stringify(bk)+'\n'+ap);
  const d=new Database(path.join(tmp,'dados.db'),{readonly:true});
  const f1=d.prepare('SELECT * FROM venda_sem_etiqueta WHERE id=1').get();
  ok('fecha como o upload fecha (resolucao etiqueta), dizendo que foi a releitura',
     f1.resolucao==='etiqueta' && /releitura/.test(f1.resolvida_por) && /2000015735133241/.test(f1.motivo||''), JSON.stringify(f1));
  ok('nao mexe em caixa nenhuma', d.prepare('SELECT COUNT(*) n FROM lote').get().n===3
     && d.prepare("SELECT COUNT(*) n FROM lote WHERE venda IS NOT NULL").get().n===0);
  d.close();

  console.log('\n── de novo ──');
  const de=rodar('--aplicar');
  ok('rodar de novo nao fecha nada', /nada a fechar/.test(de) && JSON.stringify(abertos())==='[3,4,5]', de);
})().catch(e=>{ falhas++; console.log('  FALHOU — o teste estourou: '+(e&&e.stack||e)); })
  .finally(()=>{
    fs.rmSync(tmp,{recursive:true,force:true});
    console.log('\n'+(casos-falhas)+' ok, '+falhas+' falha(s)\n');
    process.exit(falhas?1:0);
  });
