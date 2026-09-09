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

/* Condicao SQL sobre a tabela `lote`. Sem parametros: o ESTAGIO nao depende de
   data nenhuma, que e justamente o ponto. */
const PRA_CARREGAR = "estagio='embalado'";

/* QUEM DECIDE O PRAZO E O fila_dia.js, NAO ESTE ARQUIVO.
   "Isto vence hoje?" ja tem dono (§8, armadilha #7) e a resposta tem que ser a
   mesma na Etiqueta de Venda e aqui: se as duas telas discordassem sobre o que
   e trabalho de hoje, o volume sairia de uma e entraria na outra no mesmo dia.
   O que e desta casa e so o estagio. */
const {VENCE_HOJE} = require('./fila_dia');
const DO_DIA = PRA_CARREGAR + ' AND ' + VENCE_HOJE;

/* O mais velho primeiro. O atraso vai na frente porque e ele que corre risco
   de perder o prazo — e porque um volume que ja dormiu embalado uma vez e o
   candidato a dormir de novo. */
const ORDEM_CARGA = "COALESCE(despachar_em,data) ASC, id ASC";

/* ATRASO SE MEDE PELO PRAZO, NAO PELA DATA DE ENTRADA.
   Volume impresso ontem com despacho marcado pra semana que vem nao esta
   atrasado: esta adiantado. Marca-lo de atrasado manda a equipe por no carro
   hoje uma venda que so despacha depois — e ai a peca vai embora semanas antes
   do combinado. Foi o que aconteceu com quatro volumes em 26/08/2026 (o da
   Lucelia despacha 17/09).
   Sem prazo lido na etiqueta, a data de entrada e a melhor aproximacao: volume
   embalado num dia anterior e passivo ate prova em contrario. */
function atrasado(volume, hoje){
  if(!volume || !hoje) return false;
  const prazo = volume.despachar_em || volume.data;
  return !!(prazo && prazo < hoje);
}

/* Venda futura: existe, esta na fabrica, mas nao e da carga de hoje. Sai numa
   linha a parte na tela — nem escondida (que foi o buraco de #9) nem cobrada
   junto com o dia. */
function futuro(volume, hoje){
  return !!(volume && hoje && volume.despachar_em && volume.despachar_em > hoje);
}

/* COLETA: O CAMINHAO DO MERCADO LIVRE VEM BUSCAR (desde 10/09/2026).
   E a segunda porta de saida da fabrica, e a caixa dela NAO VAI NO CARRO. A
   modalidade e lida da etiqueta pelo parse.js (a de coleta vem sem hora na
   linha "Despachar:") e gravada em `lote.modalidade`. NULL — todo volume
   anterior a coluna, e o que nao deu pra ler — e agencia, que e o que sempre
   existiu: nao se manda pro canto da coleta um volume por falta de dado.
   Esta e a UNICA definicao de "isto e coleta?": a lista do carregamento, o
   bipe, a tarja da Etiqueta de Venda e o relogio de despacho leem daqui. Duas
   reguas mandariam a mesma caixa pro carro numa tela e pro canto na outra. */
function COLETA(alias){
  const p = alias ? alias+'.' : '';
  return `COALESCE(${p}modalidade,'agencia')='coleta'`;
}
function AGENCIA(alias){
  const p = alias ? alias+'.' : '';
  return `COALESCE(${p}modalidade,'agencia')<>'coleta'`;
}
function ehColeta(volume){
  return !!(volume && volume.modalidade === 'coleta');
}

/* ESPERANDO O CAMINHAO: bipada no carregamento (`carregado`, com a hora em
   `carregado_em`) e ainda nao levada (`retirado_em` vazio). O bipe acontece
   quando a caixa vai pro lugar reservado, nao quando o motorista chega — e e
   este conjunto que a conferencia com o motorista fecha, TODO de uma vez.
   Sem filtro por dia, pela mesma razao do PRA_CARREGAR: caixa separada ontem
   e nao retirada esta fisicamente no canto da coleta ate alguem levar. */
const AGUARDA_CAMINHAO = "estagio='carregado' AND " + COLETA() + " AND retirado_em IS NULL";

module.exports = { PRA_CARREGAR, DO_DIA, ORDEM_CARGA, atrasado, futuro,
                   COLETA, AGENCIA, ehColeta, AGUARDA_CAMINHAO };
