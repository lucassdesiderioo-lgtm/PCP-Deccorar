#!/usr/bin/env node
/* Fecha volumes que SAIRAM DE VERDADE mas o sistema nao soube.
 *
 *   node regularizar_saida.js 440 484 485             so mostra
 *   node regularizar_saida.js 440 484 485 --aplicar   faz backup e grava
 *
 * POR QUE ISSO EXISTE
 * A impressao da etiqueta de venda e recusada quando o SKU esta com estoque
 * zero ("Sem estoque desse SKU"). Quando isso acontece com uma venda que a
 * fabrica RESOLVEU na mao — peca sob medida, produto novo do catalogo — quem
 * esta na bancada imprime a etiqueta direto do PDF do Mercado Livre e despacha.
 * A peca vai embora e o volume fica `pendente` no sistema para sempre. Pior:
 * cada PDF novo reimporta esse volume, entao ele engorda a fila todo dia.
 *
 * O sistema nao tem como adivinhar isso — so quem despachou sabe. Por isso os
 * IDs vem na linha de comando, um a um. Nao ha heuristica aqui de proposito:
 * "volume velho e pendente" tambem descreve a venda que a equipe ESQUECEU, e
 * fechar essa sozinho apagaria da fila justamente a peca que falta.
 *
 * O QUE ELE FAZ
 *   1. marca o volume como `carregado`, com a data de hoje
 *   2. apaga as duplicatas `pendente` do MESMO volume (mesmo packId ou venda),
 *      que sao as copias que os PDFs seguintes criaram
 *
 * O QUE ELE NAO FAZ: mexer no estoque. A peca nunca somou +1 (nao passou pela
 * embalagem) e por isso nao pode baixar -1 agora. Os dois lados faltaram, e o
 * saldo ja esta certo. Descontar aqui abriria um buraco de uma peca no SKU.
 */
const Database=require('better-sqlite3');
const path=require('path');

const DB=process.env.PCP_DB||'/opt/expedicao/dados.db';
const args=process.argv.slice(2);
const APLICAR=args.includes('--aplicar');
const ids=args.filter(a=>/^\d+$/.test(a)).map(Number);

if(!ids.length){
  console.log('uso: node regularizar_saida.js <id> [<id>...] [--aplicar]');
  console.log('     os ids saem da lista "Faltam imprimir" ou do limpar_fantasmas.js');
  process.exit(1);
}

(async()=>{
const db=new Database(DB);
const achar=db.prepare('SELECT id,data,codigo,buyer,nf,packId,venda,estagio FROM lote WHERE id=?');
const plano=[], recusados=[];

for(const id of ids){
  const v=achar.get(id);
  if(!v){ recusados.push({id,por:'nao existe'}); continue; }
  if(v.estagio==='carregado'){ recusados.push({id,por:'ja esta carregado'}); continue; }
  /* Copias do mesmo volume que os PDFs seguintes criaram. So as `pendente`
     saem: uma copia que andou e historia de verdade, nao ruido. */
  const copias=db.prepare(`SELECT id,data,estagio FROM lote
    WHERE id<>? AND estagio='pendente'
      AND ((packId IS NOT NULL AND packId=?) OR (venda IS NOT NULL AND venda=?))`).all(v.id,v.packId,v.venda);
  plano.push({v,copias});
}

console.log('banco:',DB); console.log('');
for(const {v,copias} of plano){
  console.log('#'+v.id+'  '+v.data+'  '+(v.codigo||'(sem SKU)')+'  NF '+(v.nf||'-')+'  '+(v.buyer||''));
  console.log('    '+v.estagio+' -> carregado');
  console.log('    copias a apagar: '+(copias.length? copias.map(c=>'#'+c.id+' de '+c.data).join(', ') : 'nenhuma'));
}
if(recusados.length){
  console.log('');
  console.log('NAO SERAO TOCADOS:');
  recusados.forEach(r=>console.log('  #'+r.id+' — '+r.por));
}

const nCop=plano.reduce((s,p)=>s+p.copias.length,0);
console.log('');
console.log('resumo: '+plano.length+' volume(s) a fechar, '+nCop+' copia(s) a apagar');

if(!APLICAR){ console.log(''); console.log('SIMULACAO — nada foi gravado. Para gravar: acrescente --aplicar'); db.close(); return; }
if(!plano.length){ console.log(''); console.log('Nada a fazer.'); db.close(); return; }

const dest=path.join(path.dirname(DB),'backups');
require('fs').mkdirSync(dest,{recursive:true});
const arq=path.join(dest,'antes-regularizar-'+new Date().toISOString().replace(/[:.]/g,'-')+'.db');
await db.backup(arq);
console.log(''); console.log('backup ->',arq);

const fechar=db.prepare("UPDATE lote SET estagio='carregado', carregado_em=datetime('now','localtime') WHERE id=?");
const del=db.prepare('DELETE FROM lote WHERE id=?');
db.transaction(()=>{
  for(const {v,copias} of plano){ fechar.run(v.id); copias.forEach(c=>del.run(c.id)); }
})();
console.log('fechados:',plano.length,'· copias apagadas:',nCop);

const resta=db.prepare(`SELECT COUNT(*) c FROM lote
  WHERE data=date('now','localtime') AND estagio='pendente'`).get().c;
console.log('faltam imprimir hoje, agora:',resta);
db.close();
})().catch(e=>{ console.error('erro:',e.message); process.exit(1); });
