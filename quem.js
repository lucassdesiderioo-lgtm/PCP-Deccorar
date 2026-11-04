/* quem.js — DONO UNICO de "quem esta fazendo isto" (spec QUEM-FEZ-E-REVISAO §2).
 *
 * Toda acao que grava, grava junto `usuario_id` e `usuario_nome` do login ativo:
 *   - `usuario_id` e o que manda: o nome pode mudar, o id nao;
 *   - `usuario_nome` e o RETRATO do momento, para leitura humana e para a
 *     historia nao depender de a pessoa ainda existir no cadastro.
 *
 * A origem e SEMPRE o servidor (`req.usuario`, posto pelo auth.js a partir da
 * sessao do PIN) — NUNCA um campo mandado pela tela. Campo vindo da tela e
 * campo que se falsifica ou se esquece.
 *
 * Acao de operacao sem login nao grava: `exigir` responde 401. O auth.js ja
 * barra antes; esta e a outra ponta da mesma regra, para que nenhuma linha de
 * producao nasca com `usuario_id` vazio — nem num teste, nem num script, nem no
 * dia em que alguem mexer na ordem do server.js.
 */
function quem(req){
  const u = req && req.usuario;
  if(!u || u.id == null || u.id === '') return null;
  return { usuario_id: u.id, usuario_nome: u.nome != null ? String(u.nome) : null };
}

/* Para as rotas: devolve o quem, ou responde 401 e devolve null. */
function exigir(req, res){
  const q = quem(req);
  if(!q){ res.status(401).json({ erro:'Entre com o seu PIN antes — sem login nada é gravado.', motivo:'sem_login' }); return null; }
  return q;
}

module.exports = { quem, exigir };
