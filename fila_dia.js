/* QUAL VOLUME E TRABALHO DE HOJE.
 *
 * Dono unico da pergunta. A tela de Etiqueta de Venda faz essa pergunta duas
 * vezes por caminhos diferentes: a lista "Faltam imprimir" mostra o que falta,
 * e o bipe do SKU procura qual volume imprimir. Se as duas usarem reguas
 * diferentes, a lista cobra um volume que o leitor nao acha — e o operador fica
 * bipando um codigo que a tela diz que existe. Pior que a fila errada.
 *
 * A REGRA: manda a data de despacho carimbada na etiqueta pelo Mercado Livre
 * ("Despachar: qua 26/ago"), nao o dia em que o PDF foi subido. Um lote traz
 * volumes de varias datas ao mesmo tempo — no PDF de 25/08 as 14 etiquetas
 * tinham cinco datas diferentes, so 6 para o dia seguinte.
 *
 * Entram tres casos:
 *   - vence hoje                  o trabalho do dia
 *   - ja venceu                   atraso tem que gritar, nao sumir da tela
 *   - sem data lida (NULL)        volume invisivel e pior que volume cedo demais
 *
 * E NAO ha filtro por `data` (o dia da importacao): um volume que entrou ontem
 * e vence hoje e trabalho de hoje — e era justamente ele que desaparecia.
 */

/* Condicao SQL sobre a tabela `lote`. Sem parametros de proposito: data
   resolvida pelo proprio SQLite, no fuso local, para nao depender do relogio
   do processo Node. */
const VENCE_HOJE = "(despachar_em IS NULL OR despachar_em<=date('now','localtime'))";

/* O volume mais urgente primeiro: o que ja venceu na frente, depois por data,
   e o id so desempata. Sem isso o bipe pegaria "o de menor id", que pode ser um
   volume de prazo folgado enquanto um atrasado espera. NULLS first e o que o
   SQLite ja faz em ORDER BY ASC, e e o certo aqui: data desconhecida se trata
   como urgente. */
const ORDEM_URGENCIA = "despachar_em ASC, id ASC";

module.exports = { VENCE_HOJE, ORDEM_URGENCIA };
