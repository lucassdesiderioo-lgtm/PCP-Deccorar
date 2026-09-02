#!/usr/bin/env node
/* Preenche `lote.despachar_em` nos volumes que entraram ANTES de o parse ler
 * essa linha da etiqueta.
 *
 *   node backfill_despacho.js              so mostra
 *   node backfill_despacho.js --aplicar    faz backup e grava
 *
 * POR QUE E OBRIGATORIO RODAR JUNTO COM O DEPLOY
 * A fila "Faltam imprimir" passou a filtrar por prazo de despacho em vez de dia
 * de importacao (fila_dia.js), e volume sem data conta como "vence hoje" — de
 * proposito, porque volume invisivel e pior que volume cedo demais.
 *
 * So que TODO volume ja gravado esta sem data. Sem este backfill, os pendentes
 * antigos — que hoje ficam fora da tela porque nao sao do dia — apareceriam
 * todos de uma vez na fila do dia do deploy. O contrario do que a mudanca
 * existe para fazer.
 *
 * O DADO NAO PRECISA SER ADIVINHADO: o PDF original de cada lote fica salvo em
 * /opt/expedicao/lotes e o volume guarda o caminho em `srcfile`. Este script
 * reabre esses PDFs e le a linha "Despachar:" de cada etiqueta, casando pelo
 * Pack ID e pela Venda — as mesmas chaves que o parse usa.
 *
 * O que nao der para ler continua NULL, e continua entrando na fila. Volume sem
 * PDF salvo, ou de um layout antigo, tem que aparecer para alguem decidir — nao
 * sumir por falta de dado.
 */
const Database=require('better-sqlite3');
const fs=require('fs'); const path=require('path');
const {dataDespacho}=require('./parse');
const {pageLines}=require('./folha');

const DB=process.env.PCP_DB||'/opt/expedicao/dados.db';
const APLICAR=process.argv.includes('--aplicar');

/* A data e lida com o PDF na mao, hoje, mas a etiqueta fala de um prazo que era
   futuro QUANDO O LOTE ENTROU. Um "20/dez" num lote de dezembro lido em marco
   cairia no ano errado pela regra da virada. Por isso a referencia de tempo e a
   data de entrada do volume, nao o relogio de agora. */
function refDoLote(dataEntrada){
  const d=new Date(String(dataEntrada||'')+'T12:00:00');
  return isNaN(d.getTime())? new Date() : d;
}

(async()=>{
const db=new Database(DB);
const alvo=db.prepare(`SELECT id,data,codigo,nf,packId,venda,srcfile,estagio
  FROM lote WHERE despachar_em IS NULL ORDER BY id`).all();

console.log('banco:',DB);
console.log('volumes sem data de despacho:',alvo.length);
if(!alvo.length){ console.log('Nada a fazer.'); db.close(); return; }

/* Um PDF por vez: abrir o mesmo arquivo uma vez por volume seria lento e
   inutil — um lote tem dezenas de volumes no mesmo PDF. */
const porArquivo={};
const semArquivo=[];
for(const v of alvo){
  if(!v.srcfile || !fs.existsSync(v.srcfile)){ semArquivo.push(v); continue; }
  (porArquivo[v.srcfile]=porArquivo[v.srcfile]||[]).push(v);
}

const pdfjs=require('pdfjs-dist/legacy/build/pdf.js');
const achados=[]; const naoAchados=[];
const arquivos=Object.keys(porArquivo);
let n=0;
for(const arq of arquivos){
  n++;
  let mapa={};
  try{
    const pdf=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(arq))}).promise;
    for(let p=1;p<=pdf.numPages;p++){
      const lines=pageLines(await (await pdf.getPage(p)).getTextContent());
      const t=lines.join('\n');
      if(/SKU:/.test(t)) continue;                       // folha de controle
      if(!/Pack ID:|Venda:/.test(t)) continue;           // nao e etiqueta
      const g=re=>{ const m=t.match(re); return m?m[1].replace(/\s+/g,''):null; };
      const pk=g(/Pack ID:\s*([\d ]+)/), vd=g(/Venda:\s*([\d ]+)/);
      if(pk) mapa['p:'+pk]=t;
      if(vd) mapa['v:'+vd]=t;
    }
  }catch(e){
    console.log('  !! nao deu pra ler '+path.basename(arq)+': '+e.message);
    porArquivo[arq].forEach(v=>naoAchados.push({v,por:'PDF ilegivel'}));
    continue;
  }
  for(const v of porArquivo[arq]){
    const t=(v.venda&&mapa['v:'+v.venda])||(v.packId&&mapa['p:'+v.packId])||null;
    if(!t){ naoAchados.push({v,por:'etiqueta nao encontrada no PDF'}); continue; }
    const d=dataDespacho(t, refDoLote(v.data));
    if(!d){ naoAchados.push({v,por:'sem a linha Despachar:'}); continue; }
    achados.push({v,data:d});
  }
  process.stdout.write('\r  lendo PDFs: '+n+'/'+arquivos.length+'   ');
}
console.log('');
console.log('');

semArquivo.forEach(v=>naoAchados.push({v,por:'PDF do lote nao esta mais no disco'}));

console.log('COM DATA LIDA:',achados.length);
const porData={}; achados.forEach(a=>porData[a.data]=(porData[a.data]||0)+1);
Object.keys(porData).sort().forEach(d=>console.log('  '+d+'  ->  '+porData[d]));

if(naoAchados.length){
  console.log('');
  console.log('SEM DATA (continuam NULL, e continuam aparecendo na fila):',naoAchados.length);
  const porMotivo={}; naoAchados.forEach(x=>porMotivo[x.por]=(porMotivo[x.por]||0)+1);
  Object.keys(porMotivo).forEach(m=>console.log('  '+String(porMotivo[m]).padStart(4)+'x  '+m));
}

/* O numero que importa: quantos PENDENTES continuariam na fila do dia. */
const hoje=db.prepare("SELECT date('now','localtime') d").get().d;
const pendSemData=naoAchados.filter(x=>x.v.estagio==='pendente').length;
const pendVencidos=achados.filter(a=>a.v.estagio==='pendente' && a.data<=hoje).length;
const pendFuturos=achados.filter(a=>a.v.estagio==='pendente' && a.data>hoje).length;
console.log('');
console.log('DEPOIS DISSO, a fila do dia teria:');
console.log('  '+(pendVencidos+pendSemData)+' volume(s)  ('+pendVencidos+' com prazo vencido/hoje + '+pendSemData+' sem data)');
console.log('  '+pendFuturos+' volume(s) no painel "Pra despachar depois"');

if(!APLICAR){
  console.log('');
  console.log('SIMULACAO — nada foi gravado. Para gravar: node backfill_despacho.js --aplicar');
  db.close(); return;
}
if(!achados.length){ console.log(''); console.log('Nada a gravar.'); db.close(); return; }

const dest=path.join(path.dirname(DB),'backups');
fs.mkdirSync(dest,{recursive:true});
const bkp=path.join(dest,'antes-backfill-'+new Date().toISOString().replace(/[:.]/g,'-')+'.db');
await db.backup(bkp);
console.log(''); console.log('backup ->',bkp);

const up=db.prepare('UPDATE lote SET despachar_em=? WHERE id=? AND despachar_em IS NULL');
db.transaction(()=>{ achados.forEach(a=>up.run(a.data,a.v.id)); })();
console.log('gravados:',achados.length);
db.close();
})().catch(e=>{ console.error('erro:',e.message); process.exit(1); });
