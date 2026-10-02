#!/usr/bin/env node
/* Fecha volumes que SAIRAM DE VERDADE mas o sistema nao soube.
 *
 *   node regularizar_saida.js 440 484 485             so mostra
 *   node regularizar_saida.js 440 484 485 --aplicar   faz backup e grava
 *   ... --aplicar --motivo "texto"    o motivo que vai para o historico da Mesa
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
 *   1. marca o volume como `carregado`, na data de despacho DELE (nao hoje)
 *   2. apaga as duplicatas `pendente` do MESMO volume (mesmo packId ou venda),
 *      que sao as copias que os PDFs seguintes criaram
 *
 * O QUE ELE NAO FAZ: mexer no estoque. A peca nunca somou +1 (nao passou pela
 * embalagem) e por isso nao pode baixar -1 agora. Os dois lados faltaram, e o
 * saldo ja esta certo. Descontar aqui abriria um buraco de uma peca no SKU.
 */
const Database=require('better-sqlite3');
const path=require('path');

const DB=require('./caminhos').BANCO;
const args=process.argv.slice(2);
const APLICAR=args.includes('--aplicar');
// o texto depois de --motivo nunca e id, nem quando e so numero
const iMot=args.indexOf('--motivo');
const ids=args.filter((a,i)=>/^\d+$/.test(a) && !(iMot>=0 && i===iMot+1)).map(Number);

if(!ids.length){
  console.log('uso: node regularizar_saida.js <id> [<id>...] [--aplicar]');
  console.log('     os ids saem da lista "Faltam imprimir" ou do limpar_fantasmas.js');
  process.exit(1);
}

(async()=>{
const db=new Database(DB);
const achar=db.prepare('SELECT id,data,codigo,buyer,nf,packId,venda,estagio,despachar_em FROM lote WHERE id=?');
const plano=[], recusados=[];

const COR=require('./correcoes');
COR.garantirSchema(db);
for(const id of ids){
  const v=achar.get(id);
  if(!v){ recusados.push({id,por:'nao existe'}); continue; }
  /* A REGUA E A DA MESA DE CORRECOES (fase 3, 02/10/2026): ja saiu, venda
     cancelada e VENDA FUTURA NAO FOI DESPACHADA sao recusados por ela. A
     guarda da futura e a que este script perdeu em 26/08/2026 — quatro volumes
     fechados com data de setembro antes de ela existir. */
  const vale=COR.ACOES.saida.valePara(db, v);
  if(vale!==true){ recusados.push({id,por:vale}); continue; }
  /* Copias do mesmo volume que os PDFs seguintes criaram. So as `pendente`
     saem, e saem como FANTASMA, pela acao da Mesa: uma copia que andou e
     historia de verdade, nao ruido. */
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

/* A DATA DA SAIDA E A DO VOLUME, NAO HOJE (15:00, convencao do §8) — e quem
   carimba agora e a acao "Dar saida" da Mesa (fase 3, 02/10/2026): cada volume
   ganha a sua linha em `correcao`, com desfazer, e a coleta ganha o
   `retirado_em` que este script nao gravava (sem ele a caixa cairia no card
   "esperando o caminhao"). As copias saem como fantasma, pela mesma Mesa. */
const T=COR.terminal('regularizar_saida.js', process.argv);
const naoApagadas=[]; let nCopApagadas=0;
db.transaction(()=>{
  for(const {v,copias} of plano){
    COR.executar(db,{acao:'saida',tipo:'lote',id:v.id,motivo:T.motivo,quem:T.quem});
    copias.forEach(c=>{
      try{ COR.executar(db,{acao:'fantasma',tipo:'lote',id:c.id,motivo:T.motivo,quem:T.quem}); nCopApagadas++; }
      catch(e){ naoApagadas.push('#'+c.id+' — '+e.message); }
    });
  }
})();
console.log('fechados:',plano.length,'· copias apagadas:',nCopApagadas);
if(naoApagadas.length){ console.log('copias NAO apagadas (olhe pela Mesa de correcoes):'); naoApagadas.forEach(r=>console.log('  '+r)); }

const resta=db.prepare(`SELECT COUNT(*) c FROM lote
  WHERE data=date('now','localtime') AND estagio='pendente'`).get().c;
console.log('faltam imprimir hoje, agora:',resta);
db.close();
})().catch(e=>{ console.error('erro:',e.message); process.exit(1); });
