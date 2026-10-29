#!/usr/bin/env node
/* religar_sem_etiqueta.js — fecha o card "venda na folha sem etiqueta" cuja
 * etiqueta ESTAVA no PDF, e a folha e que nao sabia ler.
 *
 *   node religar_sem_etiqueta.js              so mostra (nao grava nada)
 *   node religar_sem_etiqueta.js --aplicar    faz backup e fecha os cards
 *
 * POR QUE EXISTE (29/10/2026). O titulo longo do anuncio ("Tóquio 004 - Cinza
 * Com Acabamento Branco") deixava o Pack ID numa linha acima do `SKU:` e a
 * Venda embaixo. A folha lia so a venda; a etiqueta traz so o pack; e as NF
 * 8827 e 8828 viraram card de "sem etiqueta" com a caixa ja no sistema. O
 * `folha.js` foi consertado, mas o card gravado guarda so a venda e a caixa
 * so o pack: o fechamento automatico do upload nunca os acha, e subir o PDF
 * de novo e recusado (R-PDF-06). Nenhum dos dois botoes da tela serve — a
 * venda nao foi cancelada e a etiqueta nao saiu por fora.
 *
 * O CRITERIO E ESTREITO. Um card so fecha quando as TRES coisas valem:
 *   1. o PDF dele ainda esta em `lotes/` (o cron apaga em 7 dias);
 *   2. a folha desse PDF, relida pelo `folha.js` de hoje, da o Pack ID da
 *      venda do card (ou a venda, se o card guardou o pack);
 *   3. existe caixa em `lote` com esse numero E com o SKU do card.
 * Faltou uma, o card fica, e o script diz qual faltou. Card fechado aqui sai
 * como o do upload (`resolucao='etiqueta'`), com o motivo dizendo que foi a
 * releitura. Nao mexe em caixa, em saldo nem em nenhuma outra tabela.
 */
const fs=require('fs'), path=require('path');

/* A conta, separada do disco para o teste: `lerItens(pdf)` devolve os itens
   da folha daquele PDF, ou null quando o arquivo nao existe mais. */
async function analisar(db, lerItens){
  const abertos=db.prepare(`SELECT * FROM venda_sem_etiqueta WHERE resolvida_em IS NULL ORDER BY id`).all();
  const porPdf=new Map(), out=[];
  const caixa=db.prepare(`SELECT id,codigo,nf,packId,venda,estagio FROM lote
    WHERE (? IS NOT NULL AND packId=?) OR (? IS NOT NULL AND venda=?) ORDER BY id LIMIT 1`);
  for(const c of abertos){
    if(!c.pdf){ out.push({card:c, fechar:false, porque:'o card nao guardou o nome do PDF'}); continue; }
    if(!porPdf.has(c.pdf)) porPdf.set(c.pdf, await lerItens(c.pdf));
    const itens=porPdf.get(c.pdf);
    if(!itens){ out.push({card:c, fechar:false, porque:'o PDF '+c.pdf+' ja saiu de lotes/ (7 dias): resolva pela tela'}); continue; }
    const it=itens.find(i=>(c.venda && i.venda===c.venda) || (c.packId && i.packId===c.packId));
    if(!it){ out.push({card:c, fechar:false, porque:'a folha relida nao traz esta venda'}); continue; }
    const pk=it.packId||null, ve=it.venda||null;
    const cx=caixa.get(pk,pk,ve,ve);
    if(!cx){ out.push({card:c, fechar:false, porque:'a caixa '+(pk?'do pack '+pk:'da venda')+' nao esta no sistema: a etiqueta falta mesmo'}); continue; }
    if(c.sku && String(cx.codigo||'').toUpperCase()!==String(c.sku).toUpperCase()){
      out.push({card:c, caixa:cx, fechar:false, porque:'a caixa #'+cx.id+' e de '+cx.codigo+', e o card diz '+c.sku+': confira a mao'}); continue;
    }
    out.push({card:c, caixa:cx, fechar:true,
      porque:'a etiqueta estava no PDF: a folha relida da o pack '+(pk||'-')+', caixa #'+cx.id+' NF '+(cx.nf||'-')});
  }
  return out;
}

function fechar(db, lista){
  const up=db.prepare(`UPDATE venda_sem_etiqueta SET resolvida_em=datetime('now','localtime'),
      resolucao='etiqueta', resolvida_por='sistema (releitura da folha)', motivo=?
    WHERE id=? AND resolvida_em IS NULL`);
  let n=0;
  db.transaction(()=>{ for(const r of lista) if(r.fechar) n+=up.run(r.porque, r.card.id).changes; })();
  return n;
}

module.exports={analisar, fechar};

if(require.main===module) (async()=>{
  const Database=require('better-sqlite3');
  const pdfjs=require('pdfjs-dist/legacy/build/pdf.js');
  const {pageLines,tipoDaPagina,itensDaFolha}=require('./folha');
  const C=require('./caminhos');
  const APLICAR=process.argv.includes('--aplicar');

  async function lerItens(nome){
    const arq=path.join(C.LOTES, path.basename(nome));
    if(!fs.existsSync(arq)) return null;
    const doc=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(arq))}).promise;
    const folha=[];
    for(let p=1;p<=doc.numPages;p++){
      const linhas=pageLines(await (await doc.getPage(p)).getTextContent());
      if(tipoDaPagina(linhas.join('\n'))==='control') folha.push(...linhas);
    }
    return itensDaFolha(folha);
  }

  console.log('banco:', C.BANCO);
  const db=new Database(C.BANCO);
  const tem=db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='venda_sem_etiqueta'`).get();
  if(!tem){ console.log('nao ha a tabela venda_sem_etiqueta neste banco: nada a fazer'); return; }
  const lista=await analisar(db, lerItens);
  const vai=lista.filter(r=>r.fechar), fica=lista.filter(r=>!r.fechar);
  const linha=r=>'  card #'+r.card.id+'  venda '+(r.card.venda||'-')+'  '+(r.card.sku||'-')+'  — '+r.porque;
  console.log('\ncards abertos: '+lista.length);
  console.log('\nO QUE VOU FECHAR ('+vai.length+'):'); vai.forEach(r=>console.log(linha(r)));
  console.log('\nFICAM ABERTOS ('+fica.length+'):'); fica.forEach(r=>console.log(linha(r)));
  if(!vai.length){ console.log('\nnada a fechar.'); return; }
  if(!APLICAR){ console.log('\nsimulacao: nada foi gravado. Para fechar: node religar_sem_etiqueta.js --aplicar'); return; }
  fs.mkdirSync(C.BACKUPS,{recursive:true});
  const bkp=path.join(C.BACKUPS,'dados-antes-religar-'+new Date().toISOString().replace(/[:.]/g,'-')+'.db');
  await db.backup(bkp);   // assincrono: sem o await o backup nao existe (§15)
  console.log('\nbackup: '+bkp);
  console.log('fechados: '+fechar(db, vai));
  db.close();
})().catch(e=>{ console.error(e); process.exit(1); });
