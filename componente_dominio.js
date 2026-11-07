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

/* Material se mede em metro, unidade e quilo — nunca em decimo de milimetro. O
 * que a soma de ponto flutuante produz (3,5 + 0,2 = 3,7000000000000006) nao e
 * precisao, e ruido, e ele COMPOE: cada contagem grava o lixo da anterior e a
 * tela acaba mostrando "3,699999999999999 m".
 *
 * Como esta funcao e o dono unico do saldo, o corte mora aqui — arredondar so na
 * hora de exibir deixaria o numero sujo no banco e nas comparacoes.
 *
 * Custo medio e outra escala: R$ 0,0825 por parafuso e um preco de verdade.
 * Seis casas matam o ruido sem tocar em centavo nenhum. */
const q3 = n => Math.round((+n||0)*1000)/1000;
const m6 = n => Math.round((+n||0)*1e6)/1e6;

/* Saldo e custo medio atuais. */
function saldo(db, componente_id){
  const c = db.prepare('SELECT estoque, custo_medio FROM componente WHERE id=?').get(componente_id);
  return c || { estoque:0, custo_medio:0 };
}

/* Movimento generico. `custo_unit` so faz sentido na ENTRADA — e ele que
   alimenta o custo medio. */
function movimentar(db, args){
  const { componente_id, motivo, referencia, custo_unit, usuario_id, usuario_nome, teste } = args;
  if(!componente_id) throw new Error('movimento sem componente');
  if(!Number.isFinite(args.delta)) throw new Error('movimento com delta inválido');
  /* Arredonda ANTES de conferir o zero: 0,0004 m nao e movimento de material, e
     resto de conta. Assim o extrato soma exatamente o saldo, sem sobra. */
  const delta = q3(args.delta);
  if(delta === 0) throw new Error('movimento com delta inválido');

  const atual = saldo(db, componente_id);
  const estoqueAntes = +atual.estoque || 0;
  const novo = q3(estoqueAntes + delta);

  let custoMedio = +atual.custo_medio || 0;
  if(delta > 0 && custo_unit != null && Number.isFinite(custo_unit)){
    /* Media ponderada do que foi realmente pago pelo material que ESTA em
       estoque (§6). Se o saldo estava negativo ou zerado, a entrada define o
       custo — nao ha o que ponderar. */
    const base = Math.max(0, estoqueAntes);
    custoMedio = m6((base + delta) > 0
      ? (base * custoMedio + delta * custo_unit) / (base + delta)
      : custo_unit);
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
  const novo = m6((+c.custo_medio || 0) + (custo_novo - custo_antigo) * afetada / est);
  db.prepare('UPDATE componente SET custo_medio=? WHERE id=?').run(novo, componente_id);
  return { custo_medio:novo };
}

/* O CUSTO MEDIO DO MATERIAL SEM SALDO (o cafe, R-CMP-45): ele nao guarda
   estoque — entra e sai na mesma hora —, entao a correcao "sobre o saldo de
   agora" nunca o alcancaria. O custo dele e a media ponderada de TODAS as
   compras aceitas, pelo custo da unidade de cada recebimento (que a nota
   corrige). Mora aqui porque o custo medio tem dono unico (revisao do PR #305:
   o UPDATE morava no recebimento_dominio). */
function recalcularMediaSemSaldo(db, componente_id){
  const m = db.prepare(`SELECT SUM(ri.qtd_contada*ri.custo_unit) v, SUM(ri.qtd_contada) q FROM recebimento_item ri
    JOIN pedido_item pi ON pi.id=ri.pedido_item_id
    WHERE pi.componente_id=? AND ri.custo_unit IS NOT NULL AND ri.qtd_contada > 0
      AND (ri.decisao IS NULL OR ri.decisao IN ('aceitar','aceitar_reclamar','ciente'))`).get(componente_id);
  if(!m || !(m.q > 0)) return null;
  const novo = m6(m.v / m.q);
  db.prepare('UPDATE componente SET custo_medio=? WHERE id=?').run(novo, componente_id);
  return { custo_medio:novo };
}

module.exports = { saldo, movimentar, entrada, corrigirCustoPago, recalcularMediaSemSaldo };
