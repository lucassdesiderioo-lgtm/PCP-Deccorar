#!/usr/bin/env node
/* Fecha em bloco as caixas com etiqueta impressa e NUNCA conferidas, ate uma
 * data de corte — a linha ambar do Carregamento.
 *
 *   node fechar_conferencias_antigas.js --ate 2026-10-15             so mostra
 *   node fechar_conferencias_antigas.js --ate 2026-10-15 --aplicar   backup e grava
 *   ... --aplicar --motivo "texto"   o motivo que vai para o historico da Mesa
 *
 * Fase 0 da spec CONFERENCIA-E-BAIXA (22/10/2026). A tela do Carregamento
 * ficou um tempo com problema, e mais de 500 caixas se acumularam como
 * impressas e nao conferidas. Quase todas sairam de verdade.
 *
 * A DATA DE CORTE E OBRIGATORIA E NUNCA E HOJE. O script nao adivinha periodo:
 * quem escolhe e quem passou na area e no canto e separou as caixas de venda
 * cancelada que ainda estao na fabrica. A caixa impressa hoje e trabalho da
 * conferencia.
 *
 * NAO MEXE NO ESTOQUE: a baixa dessas caixas aconteceu na impressao.
 *
 * Quem fecha e a acao "Fechar conferencias antigas" da Mesa de correcoes — a
 * mesma do botao (R-COR-05) —, com UMA linha em `correcao` e desfazer pela tela.
 */
const Database=require('better-sqlite3');
const path=require('path'); const fs=require('fs');
const CAMINHOS=require('./caminhos');

const args=process.argv.slice(2);
const APLICAR=args.includes('--aplicar');
const iAte=args.indexOf('--ate');
const ATE=(iAte>=0 && args[iAte+1] && /^\d{4}-\d{2}-\d{2}$/.test(args[iAte+1])) ? args[iAte+1] : null;

if(!ATE){
  console.error('Falta a data de corte: --ate AAAA-MM-DD (nunca hoje).');
  console.error('Escolha o dia ate onde alguem conferiu a area e o canto.');
  process.exit(2);
}

(async()=>{
const db=new Database(CAMINHOS.BANCO);
const COR=require('./correcoes');
COR.garantirSchema(db);

let p;
try{ p=COR.previa(db,{acao:'conferencias',tipo:'bloco',id:0,params:{ate:ATE}}); }
catch(e){
  if(e.status===409){ console.log('Nada a fechar: '+e.message+'.'); db.close(); return; }
  if(e.status===400){ console.error('Recusado: '+e.message+'.'); db.close(); process.exit(2); }
  throw e;
}
const alvo=p.lista;

console.log('banco:',CAMINHOS.BANCO);
console.log('fechando as impressas e nao conferidas ate:',ATE);
console.log('');
console.log(p.resumo);
console.log('');
console.log('amostra do que sera fechado:');
alvo.slice(0,10).forEach(v=>console.log('  #'+String(v.id).padEnd(6)+' '+
  String(v.codigo||'(sem SKU)').padEnd(20)+' NF '+String(v.nf||'-').padEnd(7)+
  String(v.buyer||'').slice(0,26).padEnd(26)+(v.coleta?' coleta':' agencia')));
if(alvo.length>10) console.log('  ... e mais '+(alvo.length-10));

if(!APLICAR){
  console.log('');
  console.log('SIMULACAO — nada foi gravado.');
  console.log('So aplique depois de passar na area e no canto:');
  console.log('  node fechar_conferencias_antigas.js --ate '+ATE+' --aplicar --motivo "..."');
  db.close(); return;
}

fs.mkdirSync(CAMINHOS.BACKUPS,{recursive:true});
const bkp=path.join(CAMINHOS.BACKUPS,'antes-conferencias-'+new Date().toISOString().replace(/[:.]/g,'-')+'.db');
await db.backup(bkp);
console.log(''); console.log('backup ->',bkp);

const T=COR.terminal('fechar_conferencias_antigas.js', process.argv);
const r=db.transaction(()=>COR.executar(db,{acao:'conferencias',tipo:'bloco',id:0,params:{ate:ATE},
  motivo:T.motivo,quem:T.quem}))();
console.log('fechadas:',alvo.length,'· correcao #'+r.correcao_id+' (desfaz pela Mesa de correcoes)');
db.close();
})().catch(e=>{ console.error('erro:',e.message); process.exit(1); });
