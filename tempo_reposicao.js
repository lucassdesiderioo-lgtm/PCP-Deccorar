#!/usr/bin/env node
/* Quanto tempo uma peca leva da revisao ate virar estoque.
 *
 *   node tempo_reposicao.js            ultimos 90 dias
 *   node tempo_reposicao.js 30         outra janela
 *   node tempo_reposicao.js --db <caminho>
 *
 * PARA QUE SERVE: o "dias de cobertura" do Planejamento e o unico parametro do
 * alvo que hoje e palpite — 10 porque alguem escolheu 10. Ele deveria sair do
 * tempo real de reposicao: se a peca fica pronta em 2 dias, 10 dias de cobertura
 * e folga tripla; se leva 8, e aperto.
 *
 * O QUE ELE MEDE, E O QUE NAO MEDE. A tabela `fila` guarda os dois carimbos da
 * MESMA peca: `revisado_em` (quando entrou na fila) e `embalado_em` (quando
 * virou estoque). A diferenca e o tempo de ACABAMENTO — revisao, espera na
 * bancada, embalagem com kit.
 *
 * NAO E o lead time cheio de producao: o que vem antes da revisao (corte, costura,
 * montagem do tubo) nao tem carimbo em lugar nenhum do sistema. Entao este numero
 * e um PISO — o tempo real de reposicao e ele mais o que a fabrica leva antes.
 * Dizer o contrario faria o parametro parecer medido quando so metade dele foi.
 *
 * A JANELA CORTA OS DOIS CARIMBOS, e nao so o da embalagem. Cortando so um, a
 * peca revisada ha meses e embalada ontem entrava inteira e trazia consigo todo
 * o tempo que passou PARADA NA FILA — que nao e tempo de trabalho. Na primeira
 * medicao real (01/09/2026, 589 pecas) isso deu uma distribuicao com dois
 * corcovas: um grupo saindo em menos de uma hora e outro em cinco a dez dias.
 * Meia hora e dez dias nao sao o mesmo trabalho feito devagar — o segundo grupo
 * era a fila acumulada no periodo de testes.
 *
 * SO LE.
 */
const fs = require('fs');
const Database = require('better-sqlite3');

const argv = process.argv.slice(2);
const valorDe = (f, padrao) => { const i = argv.indexOf(f); return i >= 0 && argv[i+1] ? argv[i+1] : padrao; };
const CAMINHO = valorDe('--db', '/opt/expedicao/dados.db');
const DIAS = (() => { const n = argv.find(a => /^\d+$/.test(a)); return n ? +n : 90; })();

if(!fs.existsSync(CAMINHO)){ console.error('Banco nao encontrado: ' + CAMINHO); process.exit(1); }
const db = new Database(CAMINHO, {readonly:true});

const linhas = db.prepare(`SELECT codigo,
    (julianday(embalado_em) - julianday(revisado_em)) * 24 AS horas
  FROM fila
  WHERE situacao='embalado' AND embalado_em IS NOT NULL AND revisado_em IS NOT NULL
    AND date(embalado_em) >= date('now','localtime','-'||?||' day')
    AND date(revisado_em) >= date('now','localtime','-'||?||' day')
    AND COALESCE(teste,0)=0`).all(DIAS, DIAS)
  .filter(r => r.horas != null && r.horas >= 0);

const T = s => console.log(s);
const risca = () => T('─'.repeat(66));

T('');
risca();
T('TEMPO DE ACABAMENTO — da revisao ate virar estoque (' + DIAS + ' dias)');
risca();

if(linhas.length < 5){
  T('');
  T('  Só ' + linhas.length + ' peça(s) com os dois carimbos nesse período.');
  T('  Pouco para tirar conclusão. Duas causas possíveis:');
  T('    · a fila foi limpa e o histórico de `embalado` é curto;');
  T('    · a embalagem vem sendo feita sem a peça ter passado pela fila');
  T('      (o /api/montagem aceita, e nesse caso não há o par de carimbos).');
  T('  Tente uma janela maior: node tempo_reposicao.js 180');
  T('');
  db.close(); return;
}

/* MEDIANA, NAO MEDIA. Uma peca esquecida no carrinho por duas semanas puxa a
   media para cima e faz o parametro do alvo ficar folgado sem motivo. A mediana
   descreve a peca do meio, que e a que a fabrica realmente repete. */
const ord = linhas.map(l => l.horas).sort((a,b) => a-b);
const pct = p => ord[Math.min(ord.length-1, Math.floor(ord.length*p))];
const mediana = pct(0.5), p90 = pct(0.9);
const media = ord.reduce((a,b)=>a+b,0) / ord.length;
const hDia = h => (h/24);
const fmt = h => h < 24 ? (h.toFixed(1) + ' h') : (hDia(h).toFixed(1) + ' dias');

T('');
T('  peças medidas   : ' + linhas.length);
T('  mediana         : ' + fmt(mediana) + '   ← a peça do meio');
T('  média           : ' + fmt(media));
T('  90% saem em até : ' + fmt(p90));
T('');

/* A SUGESTAO E DO PISO, E ELA DIZ ISSO. O alvo cobre a venda enquanto a
   reposicao acontece; cobrir so a mediana deixa metade das reposicoes atrasadas,
   por isso o p90 e a base — e ainda assim com a ressalva do lead time completo. */
const sugerido = Math.max(1, Math.ceil(hDia(p90)));
T('  Pelo que o sistema consegue medir, a reposição do acabamento fecha em');
T('  ' + fmt(p90) + ' em 90% dos casos.');
T('');
T('  ⚠ ISTO É UM PISO. O que vem ANTES da revisão — corte, costura, montagem —');
T('  não tem carimbo no sistema, então não está aqui. O tempo real de reposição');
T('  é este mais o da produção, que só quem está no chão sabe dizer.');
T('');
T('  Dias de cobertura = (este número) + (o que a produção leva antes) + folga.');
T('  Só a parte medida já pede ' + sugerido + ' dia(s).');

/* DUAS CORCOVAS NAO SAO UMA MEDIA. Quando o p90 e muitas vezes a mediana, nao ha
   um processo com variacao: ha dois comportamentos diferentes misturados — o
   trabalho que flui e a peca que ficou parada. Tirar um parametro da media dos
   dois da um numero que nao descreve nenhum deles. Foi o que apareceu na
   primeira medicao real: metade saindo em menos de uma hora, metade em dias. */
if(mediana > 0 && p90 / mediana >= 5){
  const rapidas = ord.filter(h => h <= mediana*2).length;
  T('');
  T('  ⚠ A DISTRIBUIÇÃO TEM DUAS CORCOVAS — não tire média disto.');
  T('    ' + rapidas + ' peça(s) saem em até ' + fmt(mediana*2) + ';');
  T('    as outras ' + (ord.length-rapidas) + ' levam até ' + fmt(ord[ord.length-1]) + '.');
  T('    Isso não é o mesmo trabalho feito devagar: quase sempre é peça que ficou');
  T('    PARADA NA FILA, e fila parada não é tempo de bancada. Meça de novo com');
  T('    uma janela curta (node tempo_reposicao.js 14) para pegar só o fluxo atual.');
}

/* Por SKU so quando ha amostra que sustente: media de duas pecas nao e media. */
const porSku = {};
linhas.forEach(l => { (porSku[l.codigo] = porSku[l.codigo] || []).push(l.horas); });
const comAmostra = Object.keys(porSku).filter(c => porSku[c].length >= 5);
if(comAmostra.length){
  T('');
  risca();
  T('POR SKU  (só os que têm 5+ peças medidas)');
  risca();
  T('');
  T('  ' + 'SKU'.padEnd(28) + 'peças'.padStart(6) + 'mediana'.padStart(12));
  comAmostra
    .map(c => { const v = porSku[c].slice().sort((a,b)=>a-b);
                return { c, n:v.length, med:v[Math.floor(v.length/2)] }; })
    .sort((a,b) => b.med - a.med)
    .forEach(r => T('  ' + r.c.slice(0,27).padEnd(28) +
      String(r.n).padStart(6) + fmt(r.med).padStart(12)));
  T('');
  T('  SKU que demora mais que os outros é candidato a cobertura maior — ou');
  T('  a um gargalo que vale olhar na bancada.');
}
T('');
db.close();
