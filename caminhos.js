/* DONO UNICO DE "ONDE OS DADOS MORAM".
 *
 * Ate aqui `/opt/expedicao` estava escrito 29 vezes, em 25 arquivos. Isso nao
 * era so repeticao: era o sistema so conseguir rodar NAQUELE caminho. `db.js`
 * abria `/opt/expedicao/dados.db` sem escape nenhum, entao um clone limpo — a
 * maquina de quem desenvolve, um runner de CI, um segundo servidor, um backup
 * restaurado noutra pasta — morria no `require`, antes de existir rota:
 *
 *     TypeError: Cannot open database because the directory does not exist
 *
 * O defeito nunca aparecia em produção, porque la a pasta existe. Ele so
 * aparece onde ninguem nunca tinha rodado — e foi um runner de CI limpo que
 * mostrou, em 15/09/2026.
 *
 * ⚠️ O PADRAO CONTINUA `/opt/expedicao`, E ISSO NAO E DETALHE.
 * O deploy do §13 e `git pull && pm2 restart expedicao` — ninguem edita
 * variavel de ambiente no servidor. Se o padrao mudasse, o proximo pull
 * apontaria a producao para um banco VAZIO, e o sintoma seria o pior possivel:
 * o sistema sobe, as telas abrem, e o estoque inteiro "sumiu". Mexer aqui tem
 * que ser invisivel para o servidor que ja roda, e e.
 *
 * ⚠️ OS NOMES DE VARIAVEL NAO SAO NOVOS. `PCP_DB`, `PCP_LOTES` e
 * `PCP_COLETAS_DIR` ja eram lidos por treze scripts e pelo carreg_route — o
 * que faltava era um lugar que soubesse de todos. Inventar `PCP_BANCO` aqui
 * criaria duas reguas para a mesma pergunta, que e a armadilha #12 por outra
 * porta: as duas "certas", cada uma na sua.
 *
 * A PRECEDENCIA E A ESPECIFICA PRIMEIRO: quem exporta `PCP_DB` continua
 * mandando no banco mesmo com `PCP_DIR` apontando noutro lugar. Se fosse ao
 * contrario, o `PCP_DIR` de um teste sequestraria o `PCP_DB` que alguem passou
 * de proposito — e o script gravaria no banco errado em silencio.
 */
const path = require('path');

const BASE = process.env.PCP_DIR || '/opt/expedicao';
const de = (env, nome) => process.env[env] || path.join(BASE, nome);

module.exports = {
  BASE,
  BANCO:   de('PCP_DB',          'dados.db'),
  LOTES:   de('PCP_LOTES',       'lotes'),
  COLETAS: de('PCP_COLETAS_DIR', 'coletas'),
  BACKUPS: de('PCP_BACKUPS',     'backups')
};
