#!/usr/bin/env node
/* Remove os VOLUMES FANTASMAS da fila de impressao.
 *
 *   node limpar_fantasmas.js              so mostra (nao apaga nada)
 *   node limpar_fantasmas.js --aplicar    faz backup e apaga
 *
 * O QUE E UM FANTASMA
 * Ate 25/08/2026 a deduplicacao do upload so comparava com os volumes do
 * PROPRIO DIA. Resubir um PDF — ou subir um lote reemitido que repete vendas
 * de dias anteriores — reinseria cada volume como PENDENTE de hoje, mesmo que
 * o volume ja tivesse sido impresso e despachado. A fila "Faltam imprimir"
 * passava a cobrar etiquetas de peças que ja estavam no caminhao.
 *
 * O upload nao duplica mais (exp_route.js). Este script limpa o que ja entrou.
 *
 * O CRITERIO, E POR QUE ELE E ESTREITO
 * Apaga um volume so quando as TRES coisas valem:
 *   1. ele esta 'pendente'  — nunca foi impresso (imprimir vira 'embalado')
 *   2. existe outro volume com o MESMO packId ou venda e id MENOR — ou seja,
 *      o mesmo volume do Mercado Livre ja tinha entrado antes
 *   3. esse volume anterior esta 'embalado' ou 'carregado' — ele ANDOU, entao
 *      a peca real e a dele e a duvida acabou
 *
 * Duplicata cujo irmao mais antigo esta 'pendente' ou 'bloqueado' NAO e
 * apagada: ali ainda pode haver escolha a fazer (um bloqueado que so entrou
 * pendente na segunda vez porque o SKU foi cadastrado no meio). Ela e listada
 * a parte, para alguem olhar. Fila errada e ruim; apagar a etiqueta de uma
 * venda real e pior.
 *
 * O volume que fica e sempre o MAIS ANTIGO — e ele que carrega a historia
 * (embalado_em, carregado_em, reimpressoes).
 *
 * ⚠️ A REGUA NAO MORA MAIS AQUI, E DESDE 02/10/2026 ELA E A DA MESA DE
 * CORRECOES (`correcoes.js → classificarFantasmas`). O laco estava escrito nos
 * dois lugares, e o botao da Mesa e este terminal discordariam sobre qual
 * volume e fantasma no dia em que um deles mudasse — a armadilha #12 na porta
 * mais cara que existe, que e a que apaga linha. O script continua util para a
 * operacao em massa; o que ele perdeu foi a opiniao propria.
 */
const Database=require('better-sqlite3');
const path=require('path');
const CORRECOES=require('./correcoes');

const DB=require('./caminhos').BANCO;
const APLICAR=process.argv.includes('--aplicar');
const valorDe=(f,padrao)=>{ const i=process.argv.indexOf(f); return i>=0&&process.argv[i+1]?process.argv[i+1]:padrao; };
/* Quem fez, na correcao: o terminal nao tem pessoa logada. */
const QUEM={id:null,nome:'terminal (limpar_fantasmas.js)'};

(async()=>{
const db=new Database(DB);

/* A classificacao vem da Mesa (a chave do volume no ML, o irmao mais antigo, e
   o "andou" que encerra a duvida). Uma copia aqui seria a segunda regua. */
const cls=CORRECOES.classificarFantasmas(db);
const fantasmas=cls.fantasmas, duvidosos=cls.duvidosos;

const linha=o=>`  #${String(o.v.id).padEnd(6)} ${o.v.data}  ${String(o.v.codigo||'(sem SKU)').padEnd(18)} `+
  `NF ${String(o.v.nf||'-').padEnd(6)} ${String(o.v.buyer||'').slice(0,24).padEnd(24)}`+
  `  ja era #${o.anterior.id} de ${o.anterior.data} (${o.anterior.estagio})`;

console.log('banco:',DB);
console.log('volumes no total:',cls.total);
console.log('');
console.log('FANTASMAS — pendentes cujo volume real ja foi embalado/carregado:',fantasmas.length);
fantasmas.slice(0,40).forEach(o=>console.log(linha(o)));
if(fantasmas.length>40) console.log('  ... e mais',fantasmas.length-40);

if(duvidosos.length){
  console.log('');
  console.log('DUVIDOSOS — duplicados cujo irmao ainda nao andou. NAO serao apagados:',duvidosos.length);
  duvidosos.slice(0,20).forEach(o=>console.log(linha(o)));
  if(duvidosos.length>20) console.log('  ... e mais',duvidosos.length-20);
  console.log('  (olhe caso a caso: pode ser um bloqueado que so virou pendente na segunda entrada)');
}

const porDia={};
fantasmas.forEach(o=>porDia[o.v.data]=(porDia[o.v.data]||0)+1);
if(fantasmas.length){
  console.log('');
  console.log('por dia:'); Object.keys(porDia).sort().forEach(d=>console.log('  '+d+'  '+porDia[d]));
}

if(!APLICAR){
  console.log('');
  console.log(fantasmas.length? 'SIMULACAO — nada foi apagado. Para apagar: node limpar_fantasmas.js --aplicar'
                              : 'Nada a fazer.');
  db.close(); return;
}
if(!fantasmas.length){ console.log(''); console.log('Nada a apagar.'); db.close(); return; }

/* Backup ANTES de tocar em qualquer linha, pelo db.backup() — `cp dados.db`
   copia 4 KB e deixa os dados no -wal (§12). */
const dest=path.join(path.dirname(DB),'backups');
require('fs').mkdirSync(dest,{recursive:true});
const arq=path.join(dest,'antes-limpeza-'+new Date().toISOString().replace(/[:.]/g,'-')+'.db');
await db.backup(arq);
console.log(''); console.log('backup ->',arq);

/* O EFEITO TAMBEM E DA MESA desde a fase 3 (02/10/2026): cada fantasma passa
   pelo MESMO `executar` do botao — apaga o volume E as pecas dele (este script
   deixava o `lote_item` orfao), e grava uma linha em `correcao`, com motivo,
   que se desfaz pela aba Correcoes. Botao e terminal deixam o banco igual. */
CORRECOES.garantirSchema(db);
const MOTIVO=valorDe('--motivo','limpeza em massa pelo terminal (node limpar_fantasmas.js --aplicar)');
db.transaction(()=>{ fantasmas.forEach(o=>CORRECOES.executar(db,{acao:'fantasma',tipo:'lote',id:o.v.id,
  motivo:MOTIVO,quem:QUEM})); })();
console.log('apagados:',fantasmas.length,'· cada um virou uma correção na aba Correções (dá para desfazer lá)');

const resta=db.prepare(`SELECT COUNT(*) c FROM lote
  WHERE data=date('now','localtime') AND estagio='pendente'`).get().c;
console.log('faltam imprimir hoje, agora:',resta);
db.close();
})().catch(e=>{ console.error('erro:',e.message); process.exit(1); });
