/* O melhor preco — COMPRAS.md §5.
 *
 * "Este e o coracao do modulo, e e onde quase todo sistema de compras erra."
 *
 * O erro e comparar preco de tabela. Ninguem compra fracao de embalagem: se voce
 * precisa de 7 m e o fornecedor vende barra de 6 m, voce leva 12 m e paga por
 * 12. Quem ordena pelo preco por metro escolhe errado nessa hora.
 *
 * Fica em modulo proprio, sem Express e sem SQL, porque a §9 e explicita:
 * "custo de SKU nunca e calculado em duas partes do sistema". Aqui e o unico
 * lugar que sabe transformar necessidade em desembolso.
 */

/* Uma oferta contra uma necessidade N (em unidade de CONSUMO). */
function avaliarOferta(oferta, N){
  const fator    = +oferta.fator || 1;
  const multiplo = +oferta.multiplo || 1;
  const minimo   = +oferta.qtd_minima || 1;
  const preco    = +oferta.preco || 0;
  const frete    = +oferta.frete || 0;

  /* Regra 2 do §13: nunca se compra fracao de embalagem. Sobe para o inteiro,
     depois para o multiplo, depois respeita o minimo do fornecedor. */
  let embalagens = Math.ceil(N / fator);
  if(embalagens < 1) embalagens = 1;
  embalagens = Math.ceil(embalagens / multiplo) * multiplo;
  if(embalagens < minimo) embalagens = minimo;

  const qtdComprada = embalagens * fator;
  const desembolso  = embalagens * preco + frete;

  return {
    oferta_id: oferta.id,
    fornecedor_id: oferta.fornecedor_id,
    fornecedor: oferta.fornecedor_nome,
    embalagem: oferta.embalagem,
    fator, multiplo, minimo, frete,
    preco_embalagem: preco,
    embalagens,
    qtd_comprada: qtdComprada,
    desembolso,
    sobra: qtdComprada - N,
    /* Os TRES numeros que a regra 3 do §13 manda mostrar sempre. Ordenar por um
       so, escondendo os outros, e como o comprador e enganado. */
    preco_unitario: preco / fator,          // R$ por metro / por unidade
    custo_efetivo:  desembolso / N,         // quanto o pedido custou por unidade usada
    prazo: oferta.prazo_entrega != null ? oferta.prazo_entrega : oferta.prazo_fornecedor,
    pagamento: oferta.pagamento,
    regime: oferta.regime,
    atualizado_em: oferta.atualizado_em
  };
}

/* Compara todas as ofertas de um item.
 *
 * `sobraAproveitavel` decide o criterio, e a razao esta no §5:
 *   1 -> a sobra vira estoque e serve na proxima peca. Pagar por ela nao e
 *        perda, entao ordena por PRECO UNITARIO.
 *   0 -> o que sobrou virou lixo e tem que entrar na conta: CUSTO EFETIVO.
 *
 * O exemplo dos 250 parafusos mostra o limite honesto do custo efetivo: a caixa
 * de 500 deixa 250 de sobra, mas nao e prejuizo — e o parafuso da semana que vem.
 */
function comparar(ofertas, N, opcoes){
  const o = opcoes || {};
  const sobraAproveitavel = o.sobra_aproveitavel !== 0;
  const criterio = sobraAproveitavel ? 'preco_unitario' : 'custo_efetivo';

  const linhas = ofertas.map(of => avaliarOferta(of, N));
  if(!linhas.length) return { necessidade:N, criterio, linhas:[], avisos:['nenhum fornecedor cadastrado para este item'] };

  linhas.sort((a,b) => a[criterio] - b[criterio] || a.desembolso - b.desembolso);
  linhas[0].vencedor = true;
  linhas[0].motivo = sobraAproveitavel
    ? 'mais barato por ' + (o.unidade || 'unidade')
    : 'menor custo efetivo — a sobra deste item não se aproveita';

  const avisos = [];

  /* O frete pode inverter a ordem, e esconder isso e como um numero vira decisao
     errada sem ninguem perceber (§5). A comparacao de UM item usa o frete fixo
     da oferta; o rateio do pedido inteiro e outro momento. */
  const porDesembolso = linhas.slice().sort((a,b) => a.desembolso - b.desembolso);
  if(porDesembolso[0].oferta_id !== linhas[0].oferta_id){
    const dif = linhas[0].desembolso - porDesembolso[0].desembolso;
    avisos.push('Pelo preço unitário ' + linhas[0].fornecedor + ' ganha. Mas o desembolso de '
      + porDesembolso[0].fornecedor + ' é R$ ' + dif.toFixed(2) + ' menor neste pedido.');
  }

  /* Regimes diferentes: avisa e NAO bloqueia. Comparar Simples com nao-Simples e
     comparar maca com laranja, mas quem sabe disso e o comprador. */
  const regimes = [...new Set(linhas.map(l => l.regime).filter(Boolean))];
  if(regimes.length > 1)
    avisos.push('Há fornecedores de regimes diferentes (' + regimes.join(', ')
      + '). Confira se os preços estão na mesma base antes de decidir.');

  /* Prazo aparece na linha e NAO ordena — vira aviso so quando ha data. */
  if(o.dias_ate != null && linhas[0].prazo != null && linhas[0].prazo > o.dias_ate){
    const aTempo = linhas.find(l => l.prazo != null && l.prazo <= o.dias_ate);
    let fim = '';
    if(aTempo){
      const dif = aTempo.desembolso - linhas[0].desembolso;
      /* "por R$ -24,26 a mais" mente quando a alternativa e MAIS BARATA — e esse
         e justamente o caso em que o comprador deve trocar sem pensar. */
      fim = ' — ' + aTempo.fornecedor + ' chega a tempo'
          + (dif > 0  ? ' por R$ ' + dif.toFixed(2) + ' a mais'
           : dif < 0  ? ' e ainda R$ ' + (-dif).toFixed(2) + ' mais barato'
                      : ' pelo mesmo valor');
    }
    avisos.push('⏱ ' + linhas[0].fornecedor + ' entrega em ' + linhas[0].prazo
      + ' dias, depois da produção prevista' + fim);
  }

  return { necessidade:N, criterio, sobra_aproveitavel:sobraAproveitavel?1:0, linhas, avisos };
}

/* Rateio do frete do PEDIDO inteiro, proporcional ao valor de cada item (§5).
 *
 * Ha um problema de ordem que o documento faz questao de registrar: o rateio
 * depende do pedido inteiro, e a comparacao de um item acontece antes do pedido
 * existir. Por isso sao dois momentos — e esta funcao e o segundo. */
function ratearFrete(itens, freteDoPedido){
  const total = itens.reduce((s,i) => s + i.desembolso, 0);
  if(!(total > 0) || !(freteDoPedido > 0)) return itens.map(i => Object.assign({frete_rateado:0}, i));
  return itens.map(i => {
    const parte = freteDoPedido * (i.desembolso / total);
    return Object.assign({}, i, {
      frete_rateado: parte,
      preco_comparado: (i.desembolso + parte) / i.qtd_comprada
    });
  });
}

module.exports = { avaliarOferta, comparar, ratearFrete };
