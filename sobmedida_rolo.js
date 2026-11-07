/* A PORTA DO TECIDO DO SOB MEDIDA NO RECEBIMENTO DO PCP — spec
 * COMPRAS-E-RECEBIMENTO, fase 9 (R-CMP-49).
 *
 * O tecido do sob medida e comprado pela 501 e recebido pela 502, e o rolo
 * NASCE la (`tecido.db`), pela funcao que o montar() do modulo devolve. Mesmo
 * desenho do `sobmedida_material.js`: o PCP nao faz `require` do modulo — um
 * `tecido.db` corrompido nao derruba a expedicao (CLAUDE.md §19).
 *
 * ⚠️ SEM A PORTA, O RECEBIMENTO DO TECIDO DO SOB MEDIDA RECUSA — nunca entra no
 * estoque do PCP no lugar do rolo. Tecido recebido no lugar errado e o tecido
 * que o corte nao acha.
 */
let porta = null;
const ligar  = p => { porta = (p && typeof p.criarRolos === 'function') ? p : null; };
const ligada = () => !!porta;

function criarRolos(a){
  if(!porta) throw new Error('o módulo sob medida não está ligado neste servidor: o tecido dele não pode ser recebido agora (o rolo nasce lá). Avise o suporte.');
  return porta.criarRolos(a);
}
function tecidos(){
  if(!porta || typeof porta.tecidos !== 'function') return { fora:true, tecidos:[], motivo:'o sob medida não está ligado neste servidor' };
  try{ return { fora:false, tecidos:porta.tecidos() }; }catch(e){ return { fora:true, tecidos:[], motivo:'o sob medida não respondeu (' + (e && e.message) + ')' }; }
}
module.exports = { ligar, ligada, criarRolos, tecidos };
