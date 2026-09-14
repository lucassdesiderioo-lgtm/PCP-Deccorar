#!/usr/bin/env node
/* GRAVA A DESCRICAO QUE FALTOU, RELENDO OS PDFs QUE AINDA ESTAO NO SERVIDOR.
 *
 *   node backfill_descricao.js            simula (nao grava nada)
 *   node backfill_descricao.js --aplicar  grava, depois de fazer backup
 *   node backfill_descricao.js --db <arq> outro banco
 *
 * Por que existe, e por que tem pressa: ate 14/09/2026 a leitura do bloco perdia
 * o titulo de parte dos itens (§5, armadilha #4 — o bloco comeca no titulo, e o
 * titulo nao e a palavra "Persiana"). Esses volumes ficaram sem
 * `lote.descricao`, e sem ela nao ha conferencia 3, 5 nem 6 — nem hoje nem
 * numa auditoria futura.
 *
 * O conserto vale para os proximos uploads. Para os que ja entraram, a unica
 * fonte e o PDF em `lotes/` — e o cron o apaga em **7 dias**. Depois disso a
 * descricao daqueles volumes nao se reconstroi de lugar nenhum.
 *
 * Regras, e as tres importam:
 *   · so preenche quem esta VAZIO — `COALESCE(descricao,'')=''`, o mesmo
 *     criterio que o relatorio usa (ver a nota no SELECT). Nunca sobrescreve
 *     descricao ja gravada: o que esta la foi o que o parse leu na hora, e
 *     reescrever historia com uma leitura de hoje ninguem audita depois;
 *   · le pelo `folha.js`, o mesmo dono que grava no upload. Regua propria aqui
 *     produziria uma descricao que nenhuma tela usa;
 *   · backup por `db.backup()` antes de gravar (§12 — `cp dados.db` sai vazio).
 *
 * NAO mexe em estagio, bloqueio nem SKU. Descricao e texto do anuncio: ela
 * explica o volume, nao decide nada sobre ele.
 */
const fs=require('fs'), path=require('path');
const Database=require('better-sqlite3');
const {lerFolha,itemDaFolha}=require('./folha');

const args=process.argv.slice(2);
const APLICAR=args.includes('--aplicar');
const iDb=args.indexOf('--db');
const CAMINHO=(iDb>=0&&args[iDb+1]) ? args[iDb+1]
  : (fs.existsSync('/opt/expedicao/dados.db') ? '/opt/expedicao/dados.db'
                                              : path.join(__dirname,'dados.db'));
if(!fs.existsSync(CAMINHO)){
  console.error('nao achei o banco em '+CAMINHO+' — passe o caminho com --db <arquivo>');
  process.exit(2);
}
const db=new Database(CAMINHO);

(async()=>{
  /* ⚠️ "SEM DESCRICAO" E `COALESCE(descricao,'')=''`, NUNCA `IS NULL`.
     O relatorio (`conferir_medidas.js`) conta em JS, com `!v.descricao`, que
     pega NULL E string vazia. Enquanto aqui a pergunta era `IS NULL`, os dois
     respondiam coisas diferentes sobre os MESMOS volumes: em 14/09/2026 o
     relatorio achou 60 volumes do dia para recuperar e este script disse
     "nada a fazer" — sem erro, sem aviso, e a janela de 7 dias correndo.
     Duas reguas para a mesma pergunta e o defeito que este projeto persegue
     desde a armadilha #12; aqui ele quase custou a descricao de um dia inteiro. */
  const vols=db.prepare(`SELECT id,codigo,buyer,nf,packId,venda,data,srcfile
    FROM lote WHERE COALESCE(descricao,'')='' AND srcfile IS NOT NULL ORDER BY id`).all();
  /* Volume sem PDF de origem nao entra na conta acima, e e ele que explica a
     diferenca entre este numero e o do relatorio. Dizer isso e mais barato que
     alguem comparar os dois e achar que um deles mente. */
  const semArquivo=db.prepare(`SELECT COUNT(*) n FROM lote
    WHERE COALESCE(descricao,'')='' AND srcfile IS NULL`).get().n;
  const porArquivo={}; vols.forEach(v=>{ (porArquivo[v.srcfile]=porArquivo[v.srcfile]||[]).push(v); });
  const arquivos=Object.keys(porArquivo).filter(a=>fs.existsSync(a)).sort();
  const sumidos=Object.keys(porArquivo).length-arquivos.length;

  console.log('');
  console.log('DESCRICAO QUE FALTOU — relendo os PDFs ainda no servidor');
  console.log(APLICAR?'MODO: APLICAR (vai gravar)':'MODO: SIMULACAO (nao grava nada)');
  console.log('volumes sem descricao com PDF de origem: '+vols.length);
  if(semArquivo) console.log('(+ '+semArquivo+' sem descricao e sem PDF de origem — esses nunca terao como ser recuperados)');
  if(sumidos>0) console.log(sumidos+' arquivo(s) ja apagados pelo cron dos 7 dias — esses nao ha como recuperar');
  console.log('');

  const achados=[]; let semItem=0, semTitulo=0;
  for(const arq of arquivos){
    let f; try{ f=await lerFolha(arq); }
    catch(e){ console.log('   '+path.basename(arq)+': nao deu pra ler ('+(e.message||e)+')'); continue; }
    for(const v of porArquivo[arq]){
      const it=itemDaFolha(v,f.blocos);
      if(!it){ semItem++; continue; }
      if(!it.desc){ semTitulo++; continue; }
      achados.push({id:v.id, codigo:v.codigo, data:v.data, desc:it.desc});
    }
    console.log('   '+path.basename(arq)+': '+porArquivo[arq].length+' sem descricao, '+
      porArquivo[arq].filter(v=>{ const it=itemDaFolha(v,f.blocos); return it&&it.desc; }).length+' recuperaveis');
  }
  console.log('');
  console.log('  recuperaveis .................. '+achados.length);
  console.log('  sem casar com item da folha ... '+semItem);
  console.log('  item achado, sem titulo ....... '+semTitulo);
  console.log('');
  achados.slice(0,8).forEach(a=>console.log('   #'+a.id+'  '+a.codigo+'  "'+String(a.desc).slice(0,70)+'"'));
  if(achados.length>8) console.log('   ... e mais '+(achados.length-8));
  console.log('');

  if(!achados.length){ console.log('nada a fazer.'); db.close(); return; }
  if(!APLICAR){
    console.log('Simulacao. Para gravar: node backfill_descricao.js --aplicar');
    db.close(); return;
  }
  const dest=path.join(path.dirname(CAMINHO),'backups');
  try{ fs.mkdirSync(dest,{recursive:true}); }catch(e){}
  const arqBk=path.join(dest,'antes-backfill-descricao-'+Date.now()+'.db');
  await db.backup(arqBk);
  console.log('backup: '+arqBk);
  /* A guarda de novo no UPDATE, e com o MESMO criterio do SELECT: entre a
     leitura e a gravacao alguem pode ter subido um PDF que preencheu a linha. */
  const up=db.prepare("UPDATE lote SET descricao=? WHERE id=? AND COALESCE(descricao,'')=''");
  let n=0; db.transaction(()=>{ for(const a of achados) n+=up.run(a.desc,a.id).changes; })();
  console.log('gravados: '+n+' volume(s).');
  console.log('Confira com: node conferir_medidas.js --tudo');
  db.close();
})().catch(e=>{ console.error(e); process.exit(1); });
