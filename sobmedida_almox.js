/* A PORTA DO ESTOQUE DO SOB MEDIDA NO ALMOXARIFADO DO PCP — spec
 * COMPRAS-E-RECEBIMENTO, fase 10 (R-CMP-50).
 *
 * O PCP e dono do endereco; o rolo e a sobra continuam no `tecido.db`. Para o
 * saldo ser UM SO para quem olha (o painel do almoxarifado e a 503), o PCP le
 * os rolos e as sobras do sob medida por aqui, e o "um so por nivel" vale entre
 * os dois lados. Mesmo desenho do `sobmedida_material.js`: nunca estoura, e
 * quando nao responde DIZ que o sob medida ficou de fora.
 */
let porta = null;
const ligar  = p => { porta = (p && typeof p.estoque === 'function') ? p : null; };
const ligada = () => !!porta;
function estoque(){
  if(!porta) return { fora:true, itens:[], motivo:'o sob medida não está ligado neste servidor: rolos e sobras dele não estão nesta lista' };
  try{ return { fora:false, itens:porta.estoque() || [] }; }
  catch(e){ return { fora:true, itens:[], motivo:'o sob medida não respondeu (' + (e && e.message) + '): rolos e sobras dele não estão nesta lista' }; }
}
/* Os codigos do sob medida guardados num nivel do PCP (rolos so: a sobra
   divide nivel, o rolo nao). */
function rolosNoNivel(nivel_pcp_id){
  return (estoque().itens || []).filter(x => x.tipo === 'rolo' && x.nivel_pcp_id === +nivel_pcp_id).map(x => x.codigo);
}
module.exports = { ligar, ligada, estoque, rolosNoNivel };
