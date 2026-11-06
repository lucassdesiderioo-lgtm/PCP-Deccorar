/* tarja_estoque.js — DONO ÚNICO de "a fila de hoje tem peça livre para todas?"
 * (CONSERTO de 06/11/2026, dívida 21 do CLAUDE.md §14).
 *
 * A Etiqueta de Venda mostra a fila "Faltam imprimir" em pedaços — a linha por
 * SKU na Agência, a linha na Coleta, e as peças dentro de cada caixa de várias
 * persianas. Cada pedaço comparava o livre só com a sua parte, e o SKU que tinha
 * alguma peça, mas não para todas, ficava sem a tarja: a venda era recusada só
 * no bipe. Aqui se soma o que a FILA INTEIRA DE HOJE pede de cada SKU (a mesma
 * régua do `fila_dia.filaDoDia`, com as peças da caixa de várias pelo
 * `SUM(qtd)` do `lote_item`), e cada pedaço recebe `pedido_hoje` e `falta`.
 *
 * ⚠️ ISTO SÓ AVISA. A trava da impressão (`/api/embalar`, etq_route.js) continua
 * recusando caixa a caixa, como sempre — não há regra nova de estoque.
 * ⚠️ O LIVRE NÃO SE CALCULA AQUI: ele chega pronto (saldo − caixa impressa,
 * `baixa_dominio.reservados`), do `livre()` do exp_route. Uma segunda conta de
 * livre seria a armadilha #12.
 * ⚠️ SOB MEDIDA NUNCA GANHA TARJA: a peça é feita para o pedido e não usa
 * estoque (§7), e a impressão a deixa passar.
 */
'use strict';
const { filaDoDia } = require('./fila_dia');
const { VARIAS } = require('./carga');

const up = s => String(s == null ? '' : s).toUpperCase();

/* Peças que a fila de HOJE pede, por SKU (código em maiúscula): a venda comum
   vale 1 peça; a caixa de várias vale o `qtd` de cada item. */
function pedidoHoje(db){
  const m = new Map();
  const soma = (c, n) => m.set(up(c), (m.get(up(c)) || 0) + n);
  for(const r of db.prepare(`SELECT l.codigo c, COUNT(*) n FROM lote l
      WHERE ${filaDoDia('l')} AND NOT COALESCE(${VARIAS('l')},0) GROUP BY UPPER(l.codigo)`).all()) soma(r.c, r.n);
  for(const r of db.prepare(`SELECT i.codigo c, SUM(MAX(1, COALESCE(i.qtd,1))) n
      FROM lote_item i JOIN lote l ON l.id=i.lote_id
      WHERE ${filaDoDia('l')} AND ${VARIAS('l')} GROUP BY UPPER(i.codigo)`).all()) soma(r.c, r.n);
  return m;
}

/* O SKU é sob medida? Pergunta à parte, e protegida: banco antigo sem a coluna
   `modelo.sob_medida` responde "não", e a lista continua saindo. */
function sobMedida(db){
  try{
    const q = db.prepare(`SELECT COALESCE(m.sob_medida,0) s FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id WHERE s.codigo=?`);
    return c => { const r = q.get(up(c)); return !!(r && r.s); };
  }catch(e){ return () => false; }
}

/* Marca cada pedaço (linha por SKU ou peça da caixa) com `pedido_hoje`,
   `falta` e `sob_medida`. `estoque` já é o LIVRE. Sem o número do cadastro
   (SKU não achado) a falta fica 0: não há o que comparar, e a trava do SKU não
   cadastrado (§6) é que cuida dele. */
function marcar(db, pedacos, ped){
  ped = ped || pedidoHoje(db);
  const sm = sobMedida(db);
  for(const p of pedacos){
    const c = up(p.codigo);
    p.sob_medida = sm(c);
    p.pedido_hoje = ped.get(c) || 0;
    p.falta = (p.sob_medida || p.estoque == null) ? 0 : Math.max(0, p.pedido_hoje - Math.max(0, p.estoque));
  }
  return pedacos;
}

module.exports = { pedidoHoje, marcar };
