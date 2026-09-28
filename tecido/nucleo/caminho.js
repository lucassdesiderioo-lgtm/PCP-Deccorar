/* DONO UNICO DE "ONDE O tecido.db FICA".
 *
 * Nasceu em 28/09/2026, quando o backup diario passou a cobrir os dois bancos.
 * Ate ali so o `nucleo/db.js` sabia responder isto — e ele so responde ABRINDO
 * o banco. Quem precisa do caminho sem abrir nada (o `backup.js`, que copia em
 * readonly) teria que repetir a conta, e aí seriam duas reguas para a mesma
 * pergunta: no dia em que uma mudasse, o backup ficaria verde copiando um
 * arquivo que o servidor nao usa. E um backup que copia o banco errado e pior
 * que nenhum, porque ninguem vai procurar.
 *
 * ⚠️ O PADRAO NAO MUDA, E ISSO E A LINHA MAIS IMPORTANTE DAQUI.
 * Continua `<este modulo>/tecido.db`, exatamente como estava no `db.js`. O
 * deploy e `git pull && pm2 restart` (§13): se o padrao andasse, o proximo pull
 * apontaria a producao para um banco VAZIO, e o sintoma seria o pior que
 * existe — o sistema sobe, as telas abrem, e o sob medida inteiro "sumiu". E a
 * mesma lição do `caminhos.js` da raiz, que guarda o caminho de producao.
 *
 * ⚠️ E ELE NAO SEGUE O `PCP_DIR`, DE PROPOSITO. O banco do PCP mora onde o
 * `caminhos.js` manda; este mora ao lado do modulo. Sao dois caminhos
 * diferentes, e no servidor eles coincidem por acaso — o repo e a pasta de
 * producao sao a mesma. Juntar os dois agora seria mover o arquivo de lugar,
 * que e justamente o que o paragrafo de cima proibe. Quem quiser mover usa
 * `BANCO_TECIDO`, o nome que o modulo ja lia antes de este arquivo existir:
 * inventar um nome novo criaria a segunda regua pela outra ponta.
 */
const path = require('path');

module.exports = {
  BANCO: process.env.BANCO_TECIDO || path.join(__dirname, '..', 'tecido.db')
};
