/* sobmedida_pendencias.js — A PORTA por onde as filas do sob medida entram na
 * central de Pendências (spec docs/arquivo/PENDENCIAS-NO-MENU.md, fase 3).
 *
 * O sob medida sobe dentro de um try/catch no server.js para que um tecido.db
 * quebrado não derrube a expedição (CLAUDE.md §19). Por isso a central não faz
 * `require` do domínio de lá: ela pergunta por esta porta, que o server.js liga
 * com o que o `montar()` devolveu (`pendenciasParaPcp`).
 *
 * ⚠️ SEM A PORTA, A LINHA NÃO VIRA ZERO: `contar` ESTOURA, e a central diz "não
 * consegui contar" naquela linha (`n: null`) — zero seria "nada esperando", e
 * mentir isso é o pior que a central pode fazer. As outras linhas seguem.
 */
let porta = null;

const ligar  = fn => { porta = (typeof fn === 'function') ? fn : null; };
const ligada = () => !!porta;

/* `usuario` ausente: o total da fila. Presente: o usuário do sob medida
   (`daSessaoDoPcp`) — o que ESTA pessoa resolve, pela régua do dono de lá. */
function contar(tipo, usuario){
  if(!porta) throw new Error('o módulo sob medida não subiu neste boot');
  const r = arguments.length > 1 ? porta(tipo, usuario) : porta(tipo);
  return { n:r && r.n != null ? r.n : null, desde:r ? r.desde || null : null };
}

module.exports = { ligar, ligada, contar };
