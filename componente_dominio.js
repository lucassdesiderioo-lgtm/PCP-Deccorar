/* O DONO UNICO de componente.estoque e de movimento_componente.
 *
 * COMPRAS.md §13, regra 10: "componente.estoque so muda por
 * dominio/componente.js, e todo movimento deixa registro."
 *
 * Isso nao e preciosismo de arquitetura. O ARQUITETURA-ALVO registra que
 * skus.estoque tem NOVE donos espalhados pelo codigo, e que reconstruir a
 * historia depois de uma divergencia e impossivel por causa disso. O estoque de
 * componente nasce com um dono so — e a chance de nao repetir o erro.
 *
 * Regra 16: o custo medio SO se move no recebimento, e so aqui dentro.
 *
 * Nenhuma funcao daqui abre transacao: quem chama decide o escopo, porque uma
 * entrada de recebimento e varias linhas que precisam entrar ou nao entrar
 * juntas.
 */

/* Saldo e custo medio atuais. */
function saldo(db, componente_id){
  const c = db.prepare('SELECT estoque, custo_medio FROM componente WHERE id=?').get(componente_id);
  return c || { estoque:0, custo_medio:0 };
}

/* Movimento generico. `custo_unit` so faz sentido na ENTRADA — e ele que
   alimenta o custo medio. */
function movimentar(db, args){
  const { componente_id, delta, motivo, referencia, custo_unit, usuario_id, usuario_nome, teste } = args;
  if(!componente_id) throw new Error('movimento sem componente');
  if(!Number.isFinite(delta) || delta === 0) throw new Error('movimento com delta inválido');

  const atual = saldo(db, componente_id);
  const estoqueAntes = +atual.estoque || 0;
  const novo = estoqueAntes + delta;

  let custoMedio = +atual.custo_medio || 0;
  if(delta > 0 && custo_unit != null && Number.isFinite(custo_unit)){
    /* Media ponderada do que foi realmente pago pelo material que ESTA em
       estoque (§6). Se o saldo estava negativo ou zerado, a entrada define o
       custo — nao ha o que ponderar. */
    const base = Math.max(0, estoqueAntes);
    custoMedio = (base + delta) > 0
      ? (base * custoMedio + delta * custo_unit) / (base + delta)
      : custo_unit;
  }

  db.prepare('UPDATE componente SET estoque=?, custo_medio=? WHERE id=?')
    .run(novo, custoMedio, componente_id);
  db.prepare(`INSERT INTO movimento_componente
      (componente_id,delta,saldo_apos,motivo,referencia,custo_unit,usuario_id,usuario_nome,teste)
      VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(componente_id, delta, novo, motivo || 'ajuste', referencia || null,
         (delta > 0 && custo_unit != null) ? custo_unit : null,
         usuario_id || null, usuario_nome || null, teste ? 1 : 0);

  return { saldo_apos:novo, custo_medio:custoMedio };
}

/* Entrada por recebimento. */
function entrada(db, args){
  return movimentar(db, Object.assign({ motivo:'recebimento' }, args));
}

/* Correcao do custo medio quando a nota cobrou diferente do que o pedido
   congelou (§6: "o preco pago manda").
 *
 * Nao gera movimento de estoque — a quantidade nao mudou, so o que ela custou.
 * Aplica a diferenca proporcional a quantidade que entrou, sobre o saldo atual:
 * se metade ja foi consumida, so metade da correcao ainda esta no estoque.
 *
 * Fica aqui, e nao no route, porque custo medio tem dono unico (regra 16). */
function corrigirCustoPago(db, args){
  const { componente_id, quantidade, custo_antigo, custo_novo } = args;
  if(!(quantidade > 0) || custo_antigo == null || custo_novo == null) return null;
  if(custo_antigo === custo_novo) return null;
  const c = saldo(db, componente_id);
  const est = +c.estoque || 0;
  if(est <= 0) return null;                    // nada em estoque para corrigir
  const afetada = Math.min(quantidade, est);   // parte que ainda esta la
  const novo = (+c.custo_medio || 0) + (custo_novo - custo_antigo) * afetada / est;
  db.prepare('UPDATE componente SET custo_medio=? WHERE id=?').run(novo, componente_id);
  return { custo_medio:novo };
}

module.exports = { saldo, movimentar, entrada, corrigirCustoPago };
