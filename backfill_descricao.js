#!/usr/bin/env node
/* Regrava o TITULO DO ANUNCIO dos volumes que entraram com ele decapitado.
 *
 *   node backfill_descricao.js          so mostra
 *   node backfill_descricao.js --aplicar  regrava
 *
 * QUANDO RODAR: uma vez, no deploy de 17/09/2026. Ate ali a leitura da folha
 * recortava a descricao a partir da palavra "Persiana" (folha.js), e como o ML
 * escreve o titulo com ela NO FIM — "Cortina Rolo Blackout 1,50x1,50 Blecaute
 * Persiana Cinza" — o que ficou gravado foi "Persiana Cinza". Na tela de
 * Bloqueados isso nao identifica anuncio nenhum: quem vai resolver o volume
 * tinha que abrir a venda no Mercado Livre so pra descobrir de que anuncio se
 * tratava, que e exatamente o trabalho que o campo existe pra poupar.
 *
 * O parse ja grava certo daqui pra frente. Este script e so pro que ja esta no
 * banco — e SO consegue alcancar o volume cujo PDF ainda esta no disco, porque
 * o cron apaga os lotes em 7 dias. Volume mais velho que isso fica como esta:
 * o titulo nao se inventa de memoria.
 *
 * NAO MEXE EM SALDO, NEM EM ESTAGIO, NEM EM BLOQUEIO. Ele reescreve texto de
 * exibicao, e so quando o PDF diz outra coisa — entao nao ha o que carimbar em
 * data errada (a regra dos tres scripts de passivo, §5, nao se aplica aqui).
 *
 * A `familia_sku` (conferencia 5) NAO e refeita de proposito: ela e historia do
 * que o sistema viu no upload, e reescrever historia com a regua de hoje e como
 * auditar com regua diferente da que gravou (§5). Ela volta a aprender sozinha,
 * do titulo certo, no proximo PDF.
 */
const Database=require('better-sqlite3');
const fs=require('fs'); const path=require('path');
const {lerFolha,itemDaFolha,irmaosDe}=require('./folha');

const DB=require('./caminhos').BANCO;
const APLICAR=process.argv.includes('--aplicar');

(async()=>{
const db=new Database(DB);

const alvo=db.prepare(`SELECT id,data,codigo,nf,buyer,packId,venda,srcfile,estagio,descricao
  FROM lote
  WHERE COALESCE(teste,0)=0 AND srcfile IS NOT NULL
  ORDER BY id`).all();

console.log('banco:',DB);
console.log('volumes no banco:',alvo.length);

const porArquivo={}; let semArquivo=0;
for(const v of alvo){
  if(!fs.existsSync(v.srcfile)){ semArquivo++; continue; }
  (porArquivo[v.srcfile]=porArquivo[v.srcfile]||[]).push(v);
}
const arquivos=Object.keys(porArquivo);
if(semArquivo) console.log('volumes cujo PDF ja saiu do disco (limpeza de 7 dias):',semArquivo);
if(!arquivos.length){ console.log('Nenhum PDF no disco. Nada a fazer.'); db.close(); return; }

/* Le cada item do lote_item que veio da folha pra poder corrigir a descricao
   das pecas do pacote junto — a tela da Etiqueta de Venda mostra o texto delas
   na hora do bipe, e meia correcao deixaria as duas telas discordando. */
const itensDo=db.prepare("SELECT id,codigo,descricao FROM lote_item WHERE lote_id=? AND origem='folha' ORDER BY id");

const mudancas=[], itensMud=[], ilegiveis=[];
let n=0;
for(const arq of arquivos){
  n++;
  let f; try{ f=await lerFolha(arq); }
  catch(e){ ilegiveis.push(path.basename(arq)); continue; }
  for(const v of porArquivo[arq]){
    const b=itemDaFolha(v,f.blocos);
    if(!b) continue;                                  // a folha nao fala deste volume
    if(b.desc && b.desc!==v.descricao) mudancas.push({v, de:v.descricao, para:b.desc});
    /* As pecas, na MESMA ordem em que o upload as gravou: o pai primeiro,
       depois os irmaos (parse.js). Casar por posicao e por codigo evita
       escrever a descricao de uma peca na linha de outra. */
    const linhas=itensDo.all(v.id);
    if(!linhas.length) continue;
    const blocos=[b].concat(irmaosDe(f.blocos,b));
    linhas.forEach((l,k)=>{
      const bl=blocos[k];
      if(!bl || !bl.desc) return;
      if(String(bl.sku||'').toUpperCase()!==String(l.codigo||'').toUpperCase()) return;
      if(bl.desc!==l.descricao) itensMud.push({id:l.id, codigo:l.codigo, de:l.descricao, para:bl.desc});
    });
  }
  process.stdout.write('\r  lendo PDFs: '+n+'/'+arquivos.length+'   ');
}
console.log(''); console.log('');
if(ilegiveis.length) console.log('PDFs que nao deram pra ler:',ilegiveis.join(', '));

if(!mudancas.length && !itensMud.length){
  console.log('Todo anuncio gravado ja bate com o PDF. Nada a corrigir.');
  db.close(); return;
}

console.log('── ANUNCIOS A CORRIGIR ─────────────────────────────────────────────');
console.log('');
for(const m of mudancas){
  console.log('  #'+m.v.id+'  '+(m.v.buyer||'—')+'  ·  NF '+(m.v.nf||'—')+'  ·  '+m.v.data
    +'  ·  '+(m.v.estagio||''));
  console.log('        estava: '+JSON.stringify(m.de));
  console.log('        no PDF: '+JSON.stringify(m.para));
}
if(itensMud.length){
  console.log('');
  console.log('  e '+itensMud.length+' peca(s) de pacote (lote_item) com o mesmo recorte.');
}

if(!APLICAR){
  console.log('');
  console.log('SIMULACAO — nada foi gravado.');
  console.log('  regravar:  node backfill_descricao.js --aplicar');
  db.close(); return;
}

const dest=path.join(path.dirname(DB),'backups');
fs.mkdirSync(dest,{recursive:true});
const bkp=path.join(dest,'antes-backfill-descricao-'+new Date().toISOString().replace(/[:.]/g,'-')+'.db');
await db.backup(bkp);
console.log(''); console.log('backup ->',bkp);

const upLote=db.prepare('UPDATE lote SET descricao=? WHERE id=?');
const upItem=db.prepare('UPDATE lote_item SET descricao=? WHERE id=?');
db.transaction(()=>{
  for(const m of mudancas) upLote.run(m.para,m.v.id);
  for(const i of itensMud) upItem.run(i.para,i.id);
})();

console.log('anuncios corrigidos:',mudancas.length,' · pecas de pacote:',itensMud.length);
console.log('');
console.log('A aba Bloqueados passa a mostrar o titulo inteiro do anuncio — o mesmo');
console.log('texto que aparece na tela do Mercado Livre.');
db.close();
})();
