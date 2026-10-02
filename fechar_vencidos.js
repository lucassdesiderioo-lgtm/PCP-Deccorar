#!/usr/bin/env node
/* Fecha em lote os volumes PENDENTES cujo prazo de despacho ja passou.
 *
 *   node fechar_vencidos.js               so mostra
 *   node fechar_vencidos.js --aplicar     faz backup e grava
 *   node fechar_vencidos.js --ate 2026-08-24 [--aplicar]
 *
 * QUANDO ISTO E CORRETO — E SO ENTAO
 * Existe um passivo de volumes que sairam de verdade e o sistema nunca soube:
 * a impressao era recusada por falta de estoque, a bancada imprimia a etiqueta
 * direto do PDF do Mercado Livre e despachava, e o volume ficava `pendente`
 * para sempre. Enquanto a fila filtrava por dia de importacao esses volumes
 * eram invisiveis; passando a filtrar por prazo (fila_dia.js), eles aparecem
 * todos de uma vez.
 *
 * Fechar em lote so vale quando alguem CONFERIU que nao ha venda pendente no
 * Mercado Livre no periodo — ou seja, que tudo ali ja foi entregue. Se houver
 * uma venda real atrasada no meio, ela some da fila junto com o ruido, e essa
 * e a peca que ninguem mais vai procurar. Por isso o script nao adivinha
 * periodo nenhum: ele mostra o que vai fazer, quebrado por dia, e espera o
 * --aplicar.
 *
 * A DATA DA SAIDA e a data de despacho da etiqueta, nao hoje. Marcar tudo hoje
 * criaria um pico falso de dezenas de carregamentos no relatorio de hoje e
 * esvaziaria os dias em que as pecas realmente sairam. Volume sem data lida usa
 * a data de entrada, que e a melhor aproximacao que existe. A HORA (15:00) e
 * convencao — o limite do despacho —, nao medicao: nao ha registro da hora real
 * e fingir precisao seria pior que assumir a convencao.
 *
 * NAO MEXE NO ESTOQUE, pela mesma razao do regularizar_saida.js: a peca nunca
 * somou +1 (nao passou pela embalagem), entao nao pode baixar -1 agora.
 * NAO TOCA EM `bloqueado`: aquilo e outro problema (SKU fora do cadastro ou
 * divergencia de leitura) e se resolve por outro caminho.
 * NAO TOCA NO QUE VENCE DEPOIS DE HOJE: venda futura nao foi despachada.
 *
 * ⚠️ DESDE 02/10/2026 (fase 3 da Mesa de correcoes) A REGRA E O EFEITO MORAM NO
 * `correcoes.js` — acao "Fechar vencidos", a mesma do botao da aba Correcoes.
 * Mudou junto: `--ate` no futuro e RECUSADO (antes ele fecharia venda futura),
 * e a caixa de COLETA sai com `retirado_em`. O bloco vira UMA linha em
 * `correcao`, que se desfaz pela tela.
 */
const Database=require('better-sqlite3');
const path=require('path'); const fs=require('fs');
const COR=require('./correcoes');

const DB=require('./caminhos').BANCO;
const args=process.argv.slice(2);
const APLICAR=args.includes('--aplicar');
const iAte=args.indexOf('--ate');
const ATE=(iAte>=0 && args[iAte+1] && /^\d{4}-\d{2}-\d{2}$/.test(args[iAte+1])) ? args[iAte+1] : null;
const iMot=args.indexOf('--motivo');
const MOTIVO=(iMot>=0&&args[iMot+1])?args[iMot+1]:'fechado em bloco pelo terminal (node fechar_vencidos.js --aplicar)';
const QUEM={id:null,nome:'terminal (fechar_vencidos.js)'};

(async()=>{
const db=new Database(DB);
const hoje=db.prepare("SELECT date('now','localtime') d").get().d;
const limite=ATE||hoje;

/* Data de corte no futuro: venda futura nao foi despachada. A recusa e a da
   Mesa, com a frase dela. */
if(limite>hoje){ console.log('erro: a data de corte ('+limite+') está no futuro — venda futura não foi despachada'); db.close(); process.exit(1); }
COR.garantirSchema(db);
/* Vencidos ou de hoje, e o volume sem data lida — a regua e a da Mesa
   (`vencidosAte`), a mesma do botao. */
const alvo=COR.vencidosAte(db,limite);

console.log('banco:',DB);
console.log('fechando o que vence ate:',limite,(ATE?'(--ate)':'(hoje)'));
console.log('');
if(!alvo.length){ console.log('Nada a fechar.'); db.close(); return; }

const porDia={};
alvo.forEach(v=>{ const k=v.despachar_em||('(sem data, entrou '+v.data+')');
  porDia[k]=(porDia[k]||0)+1; });
console.log('VOLUMES A FECHAR:',alvo.length);
Object.keys(porDia).sort().forEach(k=>console.log('  '+k.padEnd(34)+porDia[k]));

/* O que fica de fora, para o numero ser conferivel dos dois lados. */
const futuros=db.prepare(`SELECT COUNT(*) c FROM lote
  WHERE estagio='pendente' AND despachar_em IS NOT NULL AND despachar_em>?`).get(limite).c;
const bloqueados=db.prepare("SELECT COUNT(*) c FROM lote WHERE estagio='bloqueado'").get().c;
console.log('');
console.log('FICAM DE FORA:');
console.log('  '+futuros+' pendente(s) com prazo futuro — nao foram despachados');
console.log('  '+bloqueados+' bloqueado(s) — outro problema, outro caminho');

console.log('');
console.log('amostra do que sera fechado:');
alvo.slice(0,8).forEach(v=>console.log('  #'+String(v.id).padEnd(5)+' '+
  String(v.codigo||'(sem SKU)').padEnd(20)+' NF '+String(v.nf||'-').padEnd(6)+
  String(v.buyer||'').slice(0,26).padEnd(26)+' -> saida em '+(v.despachar_em||v.data)));
if(alvo.length>8) console.log('  ... e mais '+(alvo.length-8));

if(!APLICAR){
  console.log('');
  console.log('SIMULACAO — nada foi gravado.');
  console.log('So aplique depois de conferir que NAO ha venda pendente no Mercado Livre nesse periodo:');
  console.log('  node fechar_vencidos.js --aplicar');
  db.close(); return;
}

const dest=path.join(path.dirname(DB),'backups');
fs.mkdirSync(dest,{recursive:true});
const bkp=path.join(dest,'antes-fechar-'+new Date().toISOString().replace(/[:.]/g,'-')+'.db');
await db.backup(bkp);
console.log(''); console.log('backup ->',bkp);

/* A data da saida e a do volume, as 15:00 (§8) — o carimbo e da Mesa. */
db.transaction(()=>{ COR.executar(db,{acao:'vencidos',tipo:'periodo',id:0,params:{ate:limite},motivo:MOTIVO,quem:QUEM}); })();
console.log('fechados:',alvo.length,'· o bloco virou uma correção na aba Correções (dá para desfazer lá)');

const {VENCE_HOJE}=require('./fila_dia');
const resta=db.prepare(`SELECT COUNT(*) c FROM lote WHERE estagio='pendente' AND `+VENCE_HOJE).get().c;
console.log('');
console.log('a fila "Faltam imprimir" agora tem:',resta);
db.close();
})().catch(e=>{ console.error('erro:',e.message); process.exit(1); });
