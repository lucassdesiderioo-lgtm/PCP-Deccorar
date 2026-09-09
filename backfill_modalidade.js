#!/usr/bin/env node
/* Preenche `lote.modalidade` ('agencia' | 'coleta') nos volumes que entraram
 * ANTES de o parse ler isso da etiqueta.
 *
 *   node backfill_modalidade.js              so mostra
 *   node backfill_modalidade.js --aplicar    faz backup e grava
 *
 * QUANDO RODAR: uma vez, no deploy da coleta (10/09/2026). Todo volume gravado
 * ate ali esta com modalidade NULL, e NULL conta como agencia em todo lugar —
 * o que sempre existiu, entao nada quebra sem este script. Ele existe para o
 * caso em que o PDF de coleta foi subido ANTES do deploy: esses volumes
 * estariam com NULL e apareceriam na lista do CARRO, e a caixa que o caminhao
 * vem buscar iria pra agencia.
 *
 * O DADO NAO E ADIVINHADO: o PDF de cada lote fica em /opt/expedicao/lotes e o
 * volume guarda o caminho em `srcfile`. Reabre o PDF e le a linha "Despachar:"
 * da etiqueta pela MESMA funcao do parse (modalidadeDespacho), casando por
 * Pack ID e Venda. So mexe em quem esta NULL e ainda nao foi carregado —
 * volume que ja saiu, saiu por onde saiu; reclassificar historia nao muda
 * nada e confundiria o relatorio.
 */
const Database=require('better-sqlite3');
const fs=require('fs'); const path=require('path');
const {modalidadeDespacho}=require('./parse');
const {pageLines}=require('./folha');

const DB=process.env.PCP_DB||'/opt/expedicao/dados.db';
const APLICAR=process.argv.includes('--aplicar');

(async()=>{
const db=new Database(DB);
const alvo=db.prepare(`SELECT id,data,codigo,nf,buyer,packId,venda,srcfile,estagio
  FROM lote WHERE modalidade IS NULL AND estagio IN ('pendente','bloqueado','embalado') ORDER BY id`).all();

console.log('banco:',DB);
console.log('volumes sem modalidade (ainda na fabrica):',alvo.length);
if(!alvo.length){ console.log('Nada a fazer.'); db.close(); return; }

const porArquivo={}; const semArquivo=[];
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
    const m=modalidadeDespacho(t);
    if(!m){ naoAchados.push({v,por:'sem a linha Despachar:'}); continue; }
    achados.push({v,modalidade:m});
  }
  process.stdout.write('\r  lendo PDFs: '+n+'/'+arquivos.length+'   ');
}
console.log(''); console.log('');
semArquivo.forEach(v=>naoAchados.push({v,por:'PDF do lote nao esta mais no disco'}));

const col=achados.filter(a=>a.modalidade==='coleta'), ag=achados.filter(a=>a.modalidade==='agencia');
console.log('COM MODALIDADE LIDA:',achados.length,'  (agencia '+ag.length+' · coleta '+col.length+')');
if(col.length){
  console.log('');
  console.log('COLETA — o caminhao vem buscar, NAO vai no carro:');
  col.forEach(a=>console.log('  #'+a.v.id+'  '+(a.v.estagio||'').padEnd(9)+' '+String(a.v.codigo||'').padEnd(18)+' NF '+(a.v.nf||'—')+'  '+(a.v.buyer||'')));
}
if(naoAchados.length){
  console.log('');
  console.log('SEM MODALIDADE (continuam NULL = agencia):',naoAchados.length);
  const porMotivo={}; naoAchados.forEach(x=>porMotivo[x.por]=(porMotivo[x.por]||0)+1);
  Object.keys(porMotivo).forEach(m=>console.log('  '+String(porMotivo[m]).padStart(4)+'x  '+m));
}

if(!APLICAR){
  console.log('');
  console.log('SIMULACAO — nada foi gravado. Para gravar: node backfill_modalidade.js --aplicar');
  db.close(); return;
}
if(!achados.length){ console.log(''); console.log('Nada a gravar.'); db.close(); return; }

const dest=path.join(path.dirname(DB),'backups');
fs.mkdirSync(dest,{recursive:true});
const bkp=path.join(dest,'antes-backfill-modalidade-'+new Date().toISOString().replace(/[:.]/g,'-')+'.db');
await db.backup(bkp);
console.log(''); console.log('backup ->',bkp);

const up=db.prepare('UPDATE lote SET modalidade=? WHERE id=? AND modalidade IS NULL');
db.transaction(()=>{ achados.forEach(a=>up.run(a.modalidade,a.v.id)); })();
console.log('gravados:',achados.length);
db.close();
})().catch(e=>{ console.error('erro:',e.message); process.exit(1); });
