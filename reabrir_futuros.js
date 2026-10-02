#!/usr/bin/env node
/* Reabre volumes carimbados como carregados numa data que ainda nao chegou.
 *
 *   node reabrir_futuros.js               so mostra
 *   node reabrir_futuros.js --aplicar     faz backup e grava
 *
 * POR QUE EXISTE
 * Em 26/08/2026 o regularizar_saida.js fechou 27 volumes de um passivo antigo.
 * Ele tinha acabado de passar a carimbar a saida na data DO VOLUME em vez de
 * hoje — o que estava certo —, mas sem a guarda que o fechar_vencidos.js ja
 * tinha: "venda futura nao foi despachada". Quatro volumes com despacho
 * marcado pra frente (27/08, 31/08, 14/09 e 17/09) foram fechados com data no
 * futuro. Eles nao sairam: estavam na fabrica esperando o prazo, com a
 * etiqueta impressa adiantada.
 *
 * O dano nao e a data feia no relatorio. E que o volume ficou `carregado` e
 * por isso NAO vai aparecer na tela de carregamento no dia em que ele
 * realmente tiver que sair — a peca fica na prateleira e ninguem e cobrado.
 *
 * A guarda foi para o regularizar_saida.js no mesmo commit, entao isto aqui e
 * reparo de uma vez so. Se um dia voltar a achar linha, alguem furou a guarda.
 *
 * O CRITERIO E ESTREITO DE PROPOSITO: so `carregado_em` com data MAIOR QUE
 * HOJE. Nao ha volume que tenha saido amanha; nao existe interpretacao
 * alternativa dessa linha, e por isso ela pode ser corrigida sem perguntar.
 *
 * VOLTA PARA `embalado`, que e de onde esses volumes vieram: a etiqueta de
 * venda ja tinha sido impressa (e por isso o estoque ja baixou). A simulacao
 * mostra volume por volume antes de gravar.
 *
 * NAO MEXE NO ESTOQUE: carregar nunca mexeu, entao descarregar tambem nao.
 *
 * ⚠️ DESDE 02/10/2026 (fase 3 da Mesa de correcoes) A REGRA E O EFEITO MORAM NO
 * `correcoes.js` — acao "Reabrir venda futura", a mesma do botao. Mudou junto:
 * o volume que NUNCA teve etiqueta impressa volta a `pendente`, e nao a
 * `embalado` (embalado sem a baixa da etiqueta e a armadilha #27), e o que
 * saiu numa saida registrada e recusado. Cada um vira uma linha em `correcao`.
 */
const Database=require('better-sqlite3');
const path=require('path'), fs=require('fs');
const COR=require('./correcoes');

const DB=require('./caminhos').BANCO;
const APLICAR=process.argv.slice(2).includes('--aplicar');
const iMot=process.argv.indexOf('--motivo');
const MOTIVO=(iMot>=0&&process.argv[iMot+1])?process.argv[iMot+1]:'reaberto pelo terminal (node reabrir_futuros.js --aplicar)';
const QUEM={id:null,nome:'terminal (reabrir_futuros.js)'};

(async()=>{
const db=new Database(DB);
const hoje=db.prepare("SELECT date('now','localtime') d").get().d;
COR.garantirSchema(db);
/* Os candidatos sao os de saida no futuro; quem decide se vale e o que
   acontece com cada um e a previa da Mesa. */
const candidatos=db.prepare(`SELECT id FROM lote
  WHERE carregado_em IS NOT NULL AND date(carregado_em) > date('now','localtime')
  ORDER BY date(carregado_em), id`).all();
const alvo=[], recusados=[];
for(const c of candidatos){
  try{ const p=COR.previa(db,{acao:'reabrir',tipo:'lote',id:c.id}); alvo.push(Object.assign({resumo:p.resumo},p.antes.lote)); }
  catch(e){ recusados.push({id:c.id,por:e.message}); }
}

console.log('banco:',DB);
console.log('hoje :',hoje);
console.log('');
if(!alvo.length){
  console.log(recusados.length ? 'Nada a reabrir. Recusados: '+recusados.map(r=>'#'+r.id+' — '+r.por).join('; ')
                               : 'Nenhum volume carregado em data futura. Nada a fazer.');
  db.close(); return;
}
alvo.forEach(v=>{
  console.log('#'+v.id+'  '+(v.codigo||'(sem SKU)')+'  NF '+(v.nf||'-')+'  '+(v.buyer||''));
  console.log('    carregado_em '+v.carregado_em+'  ← data que ainda nao chegou');
  console.log('    despacho previsto: '+(v.despachar_em||'(nao lido na etiqueta)'));
  console.log('    '+v.resumo);
});
if(recusados.length){
  console.log('');
  console.log('NAO SERAO TOCADOS:');
  recusados.forEach(r=>console.log('  #'+r.id+' — '+r.por));
}
console.log('');
console.log('resumo: '+alvo.length+' volume(s) a reabrir');

if(!APLICAR){
  console.log('');
  console.log('SIMULACAO — nada foi gravado. Para gravar: acrescente --aplicar');
  db.close(); return;
}

const dest=path.join(path.dirname(DB),'backups');
fs.mkdirSync(dest,{recursive:true});
const arq=path.join(dest,'antes-reabrir-'+new Date().toISOString().replace(/[:.]/g,'-')+'.db');
await db.backup(arq);
console.log(''); console.log('backup ->',arq);

db.transaction(()=>{ alvo.forEach(v=>COR.executar(db,{acao:'reabrir',tipo:'lote',id:v.id,motivo:MOTIVO,quem:QUEM})); })();
console.log('reabertos:',alvo.length,'· cada um virou uma correção na aba Correções');

const esperando=db.prepare(`SELECT COUNT(*) c FROM lote WHERE estagio='embalado'`).get().c;
console.log('volumes embalados esperando carregamento, agora:',esperando);
db.close();
})().catch(e=>{ console.error('erro:',e.message); process.exit(1); });
