#!/usr/bin/env node
/* teste_gravar_nf_da_nota.js — o script que grava a NF das caixas cuja etiqueta
 * nao traz "NF:" e que entraram antes da conferencia da nota (R-CONF-07,
 * 12/11/2026).
 *
 *   node teste_gravar_nf_da_nota.js
 *
 * Monta, numa pasta temporaria, um banco e um PDF na ordem do real (etiqueta,
 * nota, etiqueta, nota... e a folha) e roda o script como no servidor. Trava:
 * a simulacao nao grava; o --aplicar faz backup e grava SO a NF vazia cuja nota
 * passou na conferencia (numero livre, primeira folha, mesma UF); NF que ja
 * existe nao se troca; a caixa cujo PDF sumiu, cuja nota nao confere ou cujo
 * SKU nao bate fica como esta, dizendo por que; e rodar de novo nao grava nada.
 * Nao toca no servidor.
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

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pcp-gravarnf-'));
const latino=s=>String(s).replace(/[^\x20-\x7e -ÿ]/g,'?');
async function montarPdf(paginas){
  const d=await PDFDocument.create(), f=await d.embedFont(StandardFonts.Helvetica);
  for(const linhas of paginas){
    const p=d.addPage([595,842]); let y=800;
    for(const l of linhas){ p.drawText(latino(l),{x:30,y,size:9,font:f}); y-=14; }
  }
  return Buffer.from(await d.save());
}
const SCRIPT=path.join(__dirname,'gravar_nf_da_nota.js');
const rodar=(...a)=>{
  try{ return execFileSync(process.execPath,[SCRIPT,...a],
    {env:{...process.env, PCP_DIR:tmp}, encoding:'utf8', stdio:['ignore','pipe','pipe']}); }
  catch(e){ return 'ERRO: '+(e.stdout||'')+(e.stderr||e.message); }
};

/* Uma etiqueta do jeito do ML: com pack, com envio so, com ou sem "NF:". */
function etq(o){
  return ['lucas desiderio lucas des #136721278','Rua Jussara 1250 Tamboré']
    .concat(o.pack?['Pack ID: '+o.pack]:['Envio: '+o.envio.slice(0,6)+' '+o.envio.slice(6)])
    .concat(['Despachar: quinta 12/nov','XSP1', o.envio.slice(0,6)+' '+o.envio.slice(6),'JADLOG'])
    .concat(o.nf?['SEX 13/11/2026 NF: '+o.nf]:[])
    .concat([o.comprador,'(APELIDO)','Endereço: Rua X 1,','Cidade de destino: '+o.cidade,'Complemento: casa']);
}
const danfe=o=>['1 - Saida Chave de acesso','35261140119477000105550020000'+o.nf+'1',
  'Número '+o.nf+'/Serie 2','Remetente: LUCAS','CNPJ: 40119477000105 INSCRIÇÃO ESTADUAL: 1 UF: SP',
  'DESTINATARIO: Outra Pessoa','UF: '+o.uf,'DANFE SIMPLIFICADO'];
const medida=s=>s.slice(2,3)+','+s.slice(3,5)+'x'+s.slice(5,6)+','+s.slice(6,8);
const item=v=>['X'+v.envio.slice(-4)+'ABC1 Cortina Rolo Blackout '+medida(v.sku)+' Persiana Bege',
  (v.pack?'Pack ID: '+v.pack:'Envio: '+v.envio)+' SKU: '+v.sku, v.comprador+' Quantidade: 1','Cor: Bege','Desenho do tecido: Liso'];

(async()=>{
  /* As caixas do PDF:
       A  so com "Envio:", sem NF, SP, nota 501 de SP        -> grava 501
       B  com pack, sem NF, BA, nota 502 de SP               -> NAO grava (UF)
       C  com pack e "NF: 503"                               -> ja tem NF, nao mexe
       D  so com "Envio:", sem NF, SP, nota 504 de SP        -> grava 504 (rodada 2: nada)
     E a caixa E do banco aponta um PDF que ja saiu de lotes/, e a F e a A com
     outro SKU no banco (nao pode gravar). */
  const V=[
    {k:'A', envio:'48502318254', sku:'BK130130BEGE', comprador:'Ana Lima', cidade:'Campinas, São Paulo', nota:{nf:'501',uf:'SP'}},
    {k:'B', pack:'2000015974927591', envio:'48485819541', sku:'BK150150BEGE', comprador:'Beto Reis', cidade:'Salvador, Bahia', nota:{nf:'502',uf:'SP'}},
    {k:'C', pack:'2000015974927593', envio:'48485819542', sku:'BK140140BEGE', comprador:'Caio Melo', nf:'503', cidade:'Santos, São Paulo', nota:{nf:'503',uf:'SP'}},
    {k:'D', envio:'48490199401', sku:'BK100100BEGE', comprador:'Dora Paz', cidade:'São Paulo, São Paulo', nota:{nf:'504',uf:'SP'}}];
  const paginas=[];
  V.forEach(v=>{ paginas.push(etq(v)); paginas.push(danfe(v.nota)); });
  paginas.push(['Despachem as suas vendas o quanto antes.','Identifiicação Produtos'].concat(...V.map(item)));
  fs.mkdirSync(path.join(tmp,'lotes'),{recursive:true});
  const SRC=path.join(tmp,'lotes','1794000000000.pdf');
  fs.writeFileSync(SRC, await montarPdf(paginas));

  const db=new Database(path.join(tmp,'dados.db'));
  db.exec(`CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, nf TEXT, packId TEXT, venda TEXT,
    codes TEXT DEFAULT '[]', srcfile TEXT, labelPage INTEGER, danfePage INTEGER, estagio TEXT DEFAULT 'pendente',
    teste INTEGER DEFAULT 0, envio TEXT);`);
  const ins=db.prepare('INSERT INTO lote (codigo,nf,packId,envio,codes,srcfile,labelPage,danfePage,estagio) VALUES (?,?,?,?,?,?,?,?,?)');
  ins.run('BK130130BEGE',null,null,'48502318254','["48502318254"]',SRC,0,1,'pendente');                // 1 A
  ins.run('BK150150BEGE',null,'2000015974927591',null,'["2000015974927591","48485819541"]',SRC,2,3,'embalado');  // 2 B (envio vazio: antes do deploy)
  ins.run('BK140140BEGE','503','2000015974927593',null,'["2000015974927593"]',SRC,4,5,'pendente');      // 3 C
  ins.run('BK100100BEGE','',null,'48490199401','["48490199401"]',SRC,6,7,'pendente');                   // 4 D (NF vazia em texto)
  ins.run('BK160160BEGE',null,'2000015000000777',null,'[]',path.join(tmp,'lotes','1700000000000.pdf'),0,1,'pendente'); // 5 PDF sumiu
  ins.run('BK999',null,null,'48502318254','["48502318254"]',SRC,0,1,'pendente');                       // 6 A com outro SKU
  db.close();
  const nfs=()=>{ const d=new Database(path.join(tmp,'dados.db'),{readonly:true});
    const r={}; d.prepare('SELECT id,nf FROM lote ORDER BY id').all().forEach(x=>{ r[x.id]=x.nf; }); d.close(); return r; };

  console.log('\n── gravar a NF da nota conferida nas caixas sem NF ──');
  ok('o script existe', fs.existsSync(SCRIPT));

  const antes=nfs();
  const sim=rodar();
  ok('simular nao grava nada', JSON.stringify(nfs())===JSON.stringify(antes), sim);
  ok('a simulacao diz que vai gravar a 501 na caixa #1', /#1\b[^\n]*501/.test(sim), sim);
  ok('a simulacao diz que vai gravar a 504 na caixa #4', /#4\b[^\n]*504/.test(sim), sim);
  ok('e diz por que a #2 fica sem NF (o estado da nota)', /#2\b[^\n]*(SP|BA|estado|UF)/i.test(sim), sim);
  ok('e que o PDF da #5 saiu de lotes/', /#5\b[^\n]*(PDF|lotes)/i.test(sim), sim);
  ok('e que a #6 nao bate o SKU', /#6\b[^\n]*(SKU|BK999|bate)/i.test(sim), sim);
  ok('a #3, que ja tem NF, nem entra na lista', !/#3\b/.test(sim), sim);
  ok('a simulacao nao fez backup', !fs.existsSync(path.join(tmp,'backups')) || !fs.readdirSync(path.join(tmp,'backups')).length);

  const apl=rodar('--aplicar');
  const depois=nfs();
  ok('--aplicar grava a 501 na #1', depois[1]==='501', JSON.stringify(depois));
  ok('--aplicar grava a 504 na #4 (NF vazia em texto conta como vazia)', depois[4]==='504', JSON.stringify(depois));
  ok('a #2 (estado diferente) continua sem NF', !depois[2], JSON.stringify(depois));
  ok('a #3 continua com a NF que tinha', depois[3]==='503', JSON.stringify(depois));
  ok('a #5 (PDF sumiu) continua sem NF', !depois[5], JSON.stringify(depois));
  ok('a #6 (outro SKU) continua sem NF', !depois[6], JSON.stringify(depois));
  const bk=fs.existsSync(path.join(tmp,'backups'))?fs.readdirSync(path.join(tmp,'backups')):[];
  ok('o --aplicar fez backup antes', bk.some(f=>/^dados-antes-nf-da-nota-.*\.db$/.test(f)), JSON.stringify(bk)+'\n'+apl);
  if(bk.length){
    const b=new Database(path.join(tmp,'backups',bk[0]),{readonly:true});
    ok('e o backup e de ANTES (a #1 sem NF nele)', !b.prepare('SELECT nf FROM lote WHERE id=1').get().nf);
    b.close();
  }
  ok('o --aplicar diz quantas gravou', /gravad[ao]s?:\s*2\b/i.test(apl), apl);

  const outra=rodar('--aplicar');
  ok('rodar de novo nao grava nada', JSON.stringify(nfs())===JSON.stringify(depois) && /nada a gravar/i.test(outra), outra);
  ok('e nao faz outro backup', (fs.readdirSync(path.join(tmp,'backups'))).length===bk.length);

  /* So mexe na coluna nf: o resto da linha fica como estava. */
  const d=new Database(path.join(tmp,'dados.db'),{readonly:true});
  const l1=d.prepare('SELECT * FROM lote WHERE id=1').get(), l2=d.prepare('SELECT * FROM lote WHERE id=2').get();
  d.close();
  ok('so a NF mudou na #1 (estagio, pagina e codes iguais)', l1.estagio==='pendente' && l1.danfePage===1 && l1.codes==='["48502318254"]' && l1.codigo==='BK130130BEGE');
  ok('a #2 nao mudou em nada', l2.estagio==='embalado' && l2.danfePage===3 && l2.nf===null);
})().catch(e=>{ falhas++; console.log('  FALHOU — o teste estourou: '+(e&&e.stack||e)); })
  .finally(()=>{
    try{ fs.rmSync(tmp,{recursive:true,force:true}); }catch(e){}
    console.log('\n'+(casos-falhas)+' ok, '+falhas+' falha(s)\n');
    process.exit(falhas?1:0);
  });
