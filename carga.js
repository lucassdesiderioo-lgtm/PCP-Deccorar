/* O QUE ESTA PRA CARREGAR.
 *
 * Dono unico da pergunta. O carregamento a faz TRES vezes por caminhos
 * diferentes — a lista "faltam carregar", o contador do topo e o bipe da
 * etiqueta — e com reguas diferentes o pior dos tres e o bipe: o volume esta
 * na mao da pessoa, na frente do carro, e a tela responde "nao encontrado".
 * Ali nao da pra conferir nada; o que a equipe aprende e que o sistema erra.
 *
 * A REGRA: `estagio='embalado'`, SEM olhar o dia da importacao.
 *
 * Etiqueta de venda impressa e volume que ainda nao subiu no carro esta
 * FISICAMENTE na fabrica ate alguem carregar, e nao existe hora em que ele
 * deixe de estar. Enquanto as tres consultas filtravam por
 * `data=date('now','localtime')`, o volume embalado ontem e nao carregado
 * ontem sumia das tres de uma vez — e nao havia nenhuma outra tela em que ele
 * reaparecesse. Em 26/08/2026 eram os volumes #643 a #648, impressos no dia
 * anterior: fora da lista, fora do contador, e "nao encontrado" no bipe.
 *
 * Terceira porta da mesma doenca dos volumes fantasmas (§5) e da fila por
 * prazo de despacho (§7). As duas primeiras eram tela mostrando trabalho que
 * nao existe; esta e tela escondendo trabalho que existe, que e pior: o ruido
 * a equipe aprende a ignorar, mas o volume escondido ninguem procura.
 *
 * O ATRASADO NAO SE MISTURA COM O DIA. A lista sai com ele em cima e marcado:
 * um passivo antigo diluido no meio do trabalho de hoje viraria uma lista que
 * nunca zera, e lista que nunca zera e lista que ninguem le ate o fim.
 */

/* Condicao SQL sobre a tabela `lote`. Sem parametros: nao depende de data
   nenhuma, que e justamente o ponto. */
const PRA_CARREGAR = "estagio='embalado'";

/* O mais velho primeiro. O atraso vai na frente porque e ele que corre risco
   de perder o prazo — e porque um volume que ja dormiu embalado uma vez e o
   candidato a dormir de novo. */
const ORDEM_CARGA = "data ASC, id ASC";

/* Volume embalado num dia anterior ao de hoje. `hoje` entra como parametro em
   vez de ser lido aqui para a rota resolver a data pelo SQLite, no fuso local,
   sem depender do relogio do processo Node. */
function atrasado(volume, hoje){
  return !!(volume && volume.data && hoje && volume.data < hoje);
}

module.exports = { PRA_CARREGAR, ORDEM_CARGA, atrasado };
