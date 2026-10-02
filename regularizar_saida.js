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
 *   1. marca o volume como `carregado`, na data de despacho DELE (nao hoje)
 *   2. apaga as duplicatas `pendente` do MESMO volume (mesmo packId ou venda),
 *      que sao as copias que os PDFs seguintes criaram
 *
 * ⚠️ DESDE 02/10/2026 (fase 3 da Mesa de correcoes) A REGRA E O EFEITO MORAM NO
 * `correcoes.js` — acao "Dar saida", a mesma do botao da aba Correcoes. Este
 * script so escolhe os ids, mostra, faz o backup e chama a Mesa. Mudou junto,
 * e de proposito: a caixa de COLETA sai com `retirado_em` (sem ele ficava no
 * card "esperando o caminhao" de um caminhao que ja foi), a venda cancelada e
 * recusada, e a copia sai com as pecas dela. Cada volume vira uma linha em
 * `correcao`, que se desfaz pela tela.
 *
 * O QUE ELE NAO FAZ: mexer no estoque. A peca nunca somou +1 (nao passou pela
 * embalagem) e por isso nao pode baixar -1 agora. Os dois lados faltaram, e o
 * saldo ja esta certo. Descontar aqui abriria um buraco de uma peca no SKU.
 */
const Database=require('better-sqlite3');
const path=require('path');
const COR=require('./correcoes');

const DB=require('./caminhos').BANCO;
const args=process.argv.slice(2);
const APLICAR=args.includes('--aplicar');
const iMot=args.indexOf('--motivo');
const MOTIVO=(iMot>=0&&args[iMot+1])?args[iMot+1]:'regularizado pelo terminal (node regularizar_saida.js --aplicar)';
const ids=args.filter((a,i)=>/^\d+$/.test(a)&&args[i-1]!=='--motivo').map(Number);
const QUEM={id:null,nome:'terminal (regularizar_saida.js)'};

if(!ids.length){
  console.log('uso: node regularizar_saida.js <id> [<id>...] [--aplicar] [--motivo "texto"]');
  console.log('     os ids saem da lista "Faltam imprimir" ou do limpar_fantasmas.js');
  process.exit(1);
}

(async()=>{
const db=new Database(DB);
COR.garantirSchema(db);
const plano=[], recusados=[];

/* A PREVIA DA MESA para cada id: e ela que diz se vale (venda futura, ja
   carregado, cancelada) e o que vai acontecer. Nenhuma regra mora aqui. */
for(const id of ids){
  try{ plano.push({id, p:COR.previa(db,{acao:'saida',tipo:'lote',id})}); }
  catch(e){ recusados.push({id,por:e.message}); }
}

console.log('banco:',DB); console.log('');
for(const {id,p} of plano){
  const v=p.antes.lote;
  console.log('#'+id+'  '+v.data+'  '+(v.codigo||'(sem SKU)')+'  NF '+(v.nf||'-')+'  '+(v.buyer||''));
  console.log('    '+p.resumo);
}
if(recusados.length){
  console.log('');
  console.log('NAO SERAO TOCADOS:');
  recusados.forEach(r=>console.log('  #'+r.id+' — '+r.por));
}

const nCop=plano.reduce((s,x)=>s+x.p.antes.copias.length,0);
console.log('');
console.log('resumo: '+plano.length+' volume(s) a fechar, '+nCop+' copia(s) a apagar');

if(!APLICAR){ console.log(''); console.log('SIMULACAO — nada foi gravado. Para gravar: acrescente --aplicar'); db.close(); return; }
if(!plano.length){ console.log(''); console.log('Nada a fazer.'); db.close(); return; }

const dest=path.join(path.dirname(DB),'backups');
require('fs').mkdirSync(dest,{recursive:true});
const arq=path.join(dest,'antes-regularizar-'+new Date().toISOString().replace(/[:.]/g,'-')+'.db');
await db.backup(arq);
console.log(''); console.log('backup ->',arq);

db.transaction(()=>{
  for(const {id} of plano) COR.executar(db,{acao:'saida',tipo:'lote',id,motivo:MOTIVO,quem:QUEM});
})();
console.log('fechados:',plano.length,'· copias apagadas:',nCop,'· cada um virou uma correção na aba Correções');

const resta=db.prepare(`SELECT COUNT(*) c FROM lote
  WHERE data=date('now','localtime') AND estagio='pendente'`).get().c;
console.log('faltam imprimir hoje, agora:',resta);
db.close();
})().catch(e=>{ console.error('erro:',e.message); process.exit(1); });
