#!/usr/bin/env node
/* gravar_nf_da_nota.js — grava a NF das caixas cuja etiqueta nao traz "NF:" e
 * que entraram ANTES da conferencia da nota (R-CONF-07, 12/11/2026).
 *
 *   node gravar_nf_da_nota.js              so mostra (nao grava nada)
 *   node gravar_nf_da_nota.js --aplicar    faz backup e grava
 *
 * POR QUE EXISTE. A etiqueta da rota JADLOG nao traz a linha "NF:", e a nota
 * dela e a pagina seguinte do PDF. Ate a R-CONF-07 o upload ligava essa pagina
 * e deixava `lote.nf` VAZIO; desde ela, o upload le o numero da nota (depois de
 * conferir) e grava. As caixas que entraram antes ficaram sem NF, e subir o PDF
 * de novo nao regrava venda repetida (R-PDF-06) — por isso a busca da devolucao
 * pela NF nao as acha.
 *
 * O CRITERIO E ESTREITO. Uma caixa so ganha NF quando TUDO vale:
 *   1. a NF dela esta vazia (NF que existe nunca se troca);
 *   2. o PDF dela ainda esta em `lotes/` (o cron apaga em 7 dias);
 *   3. o leitor de hoje (`parse.js`) acha nesse PDF a MESMA etiqueta: pela
 *      mesma chave (pack, venda, ou o envio quando a caixa nao tem nenhum dos
 *      dois), na mesma pagina, com o mesmo SKU;
 *   4. a nota passou na conferencia (numero livre, primeira folha, mesma UF)
 *      e e a mesma pagina de nota que a caixa ja imprime.
 * Faltou uma, a caixa fica como esta, e o script diz qual faltou. So a coluna
 * `nf` muda: estagio, saldo, impressao e o resto da linha nao se tocam.
 */
const fs=require('fs'), path=require('path');

const vazia=v=>v==null || String(v).trim()==='';

/* A conta, separada do disco para o teste: `lerPdf(srcfile)` devolve as
   ordens do parse.js daquele PDF, ou null quando o arquivo nao existe mais. */
async function analisar(db, lerPdf){
  const cols=new Set(db.prepare(`SELECT name FROM pragma_table_info('lote')`).all().map(c=>c.name));
  const temEnvio=cols.has('envio');
  const caixas=db.prepare(`SELECT id,codigo,nf,packId,venda,${temEnvio?'envio':'NULL envio'},srcfile,labelPage,danfePage,estagio
    FROM lote WHERE (nf IS NULL OR TRIM(nf)='') AND srcfile IS NOT NULL AND labelPage IS NOT NULL ORDER BY id`).all();
  const porPdf=new Map(), out=[];
  for(const cx of caixas){
    if(!porPdf.has(cx.srcfile)) porPdf.set(cx.srcfile, await lerPdf(cx.srcfile));
    const ordens=porPdf.get(cx.srcfile);
    if(!ordens){ out.push({caixa:cx, gravar:false, porque:'o PDF '+path.basename(cx.srcfile)+' ja saiu de lotes/ (7 dias)'}); continue; }
    const o=ordens.find(x=>
      (cx.packId && x.packId===cx.packId) || (cx.venda && x.venda===cx.venda)
      || (!cx.packId && !cx.venda && cx.envio && x.envio===cx.envio));
    if(!o){ out.push({caixa:cx, gravar:false, porque:'o leitor de hoje nao acha esta etiqueta no PDF'}); continue; }
    if(o.labelPage!==cx.labelPage){ out.push({caixa:cx, gravar:false, porque:'a etiqueta esta em outra pagina do PDF ('+o.labelPage+' e nao '+cx.labelPage+'): confira a mao'}); continue; }
    if(String(o.sku||'').toUpperCase()!==String(cx.codigo||'').toUpperCase()){
      out.push({caixa:cx, gravar:false, porque:'o SKU nao bate: a folha diz '+(o.sku||'-')+' e a caixa e '+(cx.codigo||'-')}); continue;
    }
    if(o.danfePage==null){
      const m=String(o.conflito||'').split(' · ').find(s=>/nota/.test(s));
      out.push({caixa:cx, gravar:false, porque:'a nota nao passou na conferencia'+(m?': '+m:'')}); continue;
    }
    if(vazia(o.nf)){ out.push({caixa:cx, gravar:false, porque:'a nota da pagina seguinte nao tem numero lido'}); continue; }
    if(cx.danfePage!=null && cx.danfePage!==o.danfePage){
      out.push({caixa:cx, gravar:false, porque:'a caixa imprime a nota da pagina '+cx.danfePage+' e a conferida e a '+o.danfePage+': confira a mao'}); continue;
    }
    out.push({caixa:cx, nf:String(o.nf), gravar:true, porque:'a nota conferida e a NF '+o.nf});
  }
  return out;
}

function gravar(db, lista){
  const up=db.prepare(`UPDATE lote SET nf=? WHERE id=? AND (nf IS NULL OR TRIM(nf)='')`);
  let n=0;
  db.transaction(()=>{ for(const r of lista) if(r.gravar) n+=up.run(r.nf, r.caixa.id).changes; })();
  return n;
}

module.exports={analisar, gravar};

if(require.main===module) (async()=>{
  const Database=require('better-sqlite3');
  const {parsePdf}=require('./parse');
  const C=require('./caminhos');
  const APLICAR=process.argv.includes('--aplicar');

  async function lerPdf(srcfile){
    const arq=path.join(C.LOTES, path.basename(srcfile));
    if(!fs.existsSync(arq)) return null;
    return parsePdf(new Uint8Array(fs.readFileSync(arq)));
  }

  console.log('banco:', C.BANCO);
  const db=new Database(C.BANCO);
  const lista=await analisar(db, lerPdf);
  const vai=lista.filter(r=>r.gravar), fica=lista.filter(r=>!r.gravar);
  const chave=c=>c.packId?'pack '+c.packId:c.venda?'venda '+c.venda:'envio '+(c.envio||'-');
  const linha=r=>'  caixa #'+r.caixa.id+'  '+chave(r.caixa)+'  '+(r.caixa.codigo||'-')+'  ('+r.caixa.estagio+')  — '+r.porque;
  console.log('\ncaixas sem NF com o PDF registrado: '+lista.length);
  console.log('\nO QUE VOU GRAVAR ('+vai.length+'):'); vai.forEach(r=>console.log(linha(r)));
  console.log('\nFICAM SEM NF ('+fica.length+'):'); fica.forEach(r=>console.log(linha(r)));
  if(!vai.length){ console.log('\nnada a gravar.'); db.close(); return; }
  if(!APLICAR){ console.log('\nsimulacao: nada foi gravado. Para gravar: node gravar_nf_da_nota.js --aplicar'); db.close(); return; }
  fs.mkdirSync(C.BACKUPS,{recursive:true});
  const bkp=path.join(C.BACKUPS,'dados-antes-nf-da-nota-'+new Date().toISOString().replace(/[:.]/g,'-')+'.db');
  await db.backup(bkp);   // assincrono: sem o await o backup nao existe (§15)
  console.log('\nbackup: '+bkp);
  console.log('gravadas: '+gravar(db, vai));
  db.close();
})().catch(e=>{ console.error(e); process.exit(1); });
