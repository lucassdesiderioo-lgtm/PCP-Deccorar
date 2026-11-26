/* prioridade_dia.js — DONO ÚNICO de "o que é prioridade da fábrica agora"
 * (spec PRIORIDADE-PROXIMA-SAIDA, decisão do dono de 26/11/2026).
 *
 * A fábrica sobe o PDF do dia seguinte no fim do dia anterior (na sexta, o da
 * segunda). A venda que vence até a PRÓXIMA SAÍDA vira prioridade assim que o
 * PDF dela sobe, e não à meia-noite — e não importa o dia em que o PDF subiu.
 *
 *   PRÓXIMA SAÍDA  o próximo dia de coleta depois de hoje: segunda a sexta (não
 *                  há coleta no sábado, decisão do dono), pulando o dia que a 206
 *                  marca "sem coleta" (`saida_dia.sem_coleta`).
 *   PRIORIDADE     a venda já no sistema (o PDF subiu), sem etiqueta impressa
 *                  (`estagio='pendente'`), com SKU lido, que vence até a próxima
 *                  saída — e a atrasada e a sem data lida, como sempre.
 *   HOJE e PRÓXIMA dentro da prioridade, a que vence hoje (ou já venceu, ou não
 *                  tem data) é "hoje", a régua do `fila_dia.js`; o resto é a
 *                  "próxima saída". Hoje fica em cima e usa o livre primeiro.
 *
 * ⚠️ O `fila_dia.js` NÃO MUDOU e continua sendo "trabalho de IMPRESSÃO de hoje":
 * a lista "Faltam imprimir" da 201, a trava da 201, o fechar vencidos e as
 * barras da 202. Isto aqui é a prioridade da PRODUÇÃO e da EMBALAGEM, e a tarja
 * "sem estoque" da 201.
 * ⚠️ NENHUMA CONTA DE LIVRE AQUI (#12): o livre é do `baixa_dominio`.
 */
'use strict';
const { VARIAS } = require('./carga');

const DSEM = ['dom','seg','ter','qua','qui','sex','sab'];
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const up = s => String(s == null ? '' : s).trim().toUpperCase();

function hoje(db){ return db.prepare("SELECT date('now','localtime') d").get().d; }
function addDias(iso, n){
  const m = String(iso).match(ISO);
  const d = new Date(+m[1], +m[2]-1, +m[3]); d.setDate(d.getDate() + n);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function diaSemana(iso){ const m = String(iso).match(ISO); return new Date(+m[1], +m[2]-1, +m[3]).getDay(); }

/* O dia marcado "sem coleta" na 206. Banco sem a tabela (um script, um teste):
   nenhum dia é sem coleta. */
function semColeta(db, d){
  try{ const r = db.prepare('SELECT sem_coleta FROM saida_dia WHERE data=?').get(d); return !!(r && r.sem_coleta); }
  catch(e){ return false; }
}

/* O próximo dia de coleta depois de `h` (hoje, se não vier). Três semanas sem
   coleta nenhuma não existem; se existirem, vale o dia seguinte. */
function proximaSaida(db, h){
  h = h || hoje(db);
  let d = h;
  for(let i = 0; i < 21; i++){
    d = addDias(d, 1);
    const w = diaSemana(d);
    if(w === 0 || w === 6) continue;
    if(semColeta(db, d)) continue;
    return d;
  }
  return addDias(h, 1);
}

/* "amanhã" ou "seg 30/11", para o cartão. */
function rotulo(db, d, h){
  h = h || hoje(db);
  if(d === addDias(h, 1)) return 'amanhã';
  const m = String(d).match(ISO);
  return m ? DSEM[diaSemana(d)] + ' ' + m[3] + '/' + m[2] : String(d);
}

/* A condição SQL sobre `lote` (com apelido, se houver). A data entra escrita
   porque é a mesma conta para todo o SELECT; ela é conferida antes. */
function regua(alias, ate){
  if(!ISO.test(String(ate))) throw new Error('prioridade_dia: data da próxima saída inválida: ' + ate);
  const p = alias ? alias + '.' : '';
  return `${p}estagio='pendente' AND ${p}codigo IS NOT NULL AND `
       + `(${p}despachar_em IS NULL OR ${p}despachar_em<='${ate}')`;
}

/* Peças que a prioridade pede, por SKU (maiúscula), separadas em `hoje` e
   `proxima`: a venda comum vale 1; a caixa de várias vale o `qtd` de cada item
   (a régua do `tarja_estoque.pedidoHoje`). */
function pedido(db){
  const h = hoje(db), ate = proximaSaida(db, h);
  const m = new Map();
  const soma = (c, quando, n) => {
    const k = up(c), o = m.get(k) || { hoje:0, proxima:0 };
    o[quando] += n; m.set(k, o);
  };
  const QUANDO = `CASE WHEN l.despachar_em IS NULL OR l.despachar_em<=date('now','localtime') THEN 'hoje' ELSE 'proxima' END`;
  for(const r of db.prepare(`SELECT l.codigo c, ${QUANDO} q, COUNT(*) n FROM lote l
      WHERE ${regua('l', ate)} AND NOT COALESCE(${VARIAS('l')},0) GROUP BY UPPER(l.codigo), q`).all()) soma(r.c, r.q, r.n);
  for(const r of db.prepare(`SELECT i.codigo c, ${QUANDO} q, SUM(MAX(1, COALESCE(i.qtd,1))) n
      FROM lote_item i JOIN lote l ON l.id=i.lote_id
      WHERE ${regua('l', ate)} AND ${VARIAS('l')} GROUP BY UPPER(i.codigo), q`).all()) soma(r.c, r.q, r.n);
  m.ate = ate; m.hoje = h; m.rotulo = rotulo(db, ate, h);
  return m;
}

module.exports = { proximaSaida, rotulo, regua, pedido, addDias, hoje };
