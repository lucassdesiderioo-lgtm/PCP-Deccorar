/* valor.js — DONO ÚNICO DE "ESTA PESSOA VÊ ESTE DINHEIRO?" (R-VAL, spec
 * ARRUMAR-O-LUGAR, fase 1, 11/11/2026).
 *
 * O dono: "sempre que uma tela tiver valor, ela tem que estar linkada ao
 * acessos". Cada tela com dinheiro declara no mapa (`telas.js` e
 * `tecido/nucleo/telas.js`) a chave da caixinha "Ver valores (R$)". Quem tem
 * a chave vê; quem não tem, abre a tela com "—", e quem tira é o servidor.
 *
 * ⚠️ QUEM LANÇA DINHEIRO VÊ O QUE LANÇA (R-VAL-04). Lançar às cegas seria a
 * armadilha #6: o pedido criado sem ver o preço, a nota lançada sem ver o
 * total. Por isso uma chave de valor tem as suas EQUIVALENTES — as ações que
 * lançam aquele mesmo dinheiro. A lista é nomeada aqui, uma vez, e as rotas e
 * o aviso da barra perguntam a este arquivo (#12: duas listas divergiriam).
 *
 * ⚠️ O SOB MEDIDA PODA NO MÓDULO DELE (`tecido/dominio/custo.js`, podarVenda e
 * podarCusto). A equivalência de lá (quem lança nota do rolo vê o custo) está
 * repetida aqui só para o AVISO da barra, e o `teste_valor.js` confere que as
 * duas dizem o mesmo.
 */
const QUEM_LANCA = {
  'compras.valores':     ['pedido.criar','pedido.aprovar','pedido.pagar','nota.lancar','preco.lancar','custo.ver'],
  'devolucao.valores':   ['devolucao.dinheiro'],
  'sobmedida.custo.ver': ['sobmedida.rolo.nota'],
  /* o preço por m² e o do componente, o boleto e o limite de crédito — quem
     SÓ MONTA PEDIDO não entra: ali o preço é calculado, e não lançado. */
  'sobmedida.preco.ver': ['sobmedida.catalogo.editar','sobmedida.boleto.editar','sobmedida.credito.editar']
};

/* `tem(chave)` é a pergunta de permissão de quem chama (o podePermissao do
   acesso.js, ou um Set). Devolve se a pessoa vê o dinheiro daquela chave. */
function ve(tem, chave){
  const t = typeof tem === 'function' ? tem : (c => tem && typeof tem.has === 'function' ? tem.has(c) : (tem || []).indexOf(c) >= 0);
  if(t(chave)) return true;
  return (QUEM_LANCA[chave] || []).some(c => t(c));
}

/* A tela com dinheiro em que a pessoa NÃO vê o valor principal (o primeiro da
   lista `valor`). É o que acende a linha "os valores em R$ desta tela não
   aparecem para o seu acesso" na barra. O Admin Geral vê tudo. */
function semValor(tela, tem, adminGeral){
  const v = (tela && tela.valor) || [];
  if(adminGeral || !v.length) return false;
  return !ve(tem, v[0]);
}

module.exports = { QUEM_LANCA, ve, semValor };
