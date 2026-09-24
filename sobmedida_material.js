/* A PORTA POR ONDE O CONSUMO DE MATERIAL DO SOB MEDIDA ENTRA NO COMPRAS.
 *
 * Fase 4-C da spec SOBMEDIDA-PEDIDO-REVENDA. O tubo da persiana sob medida e
 * o MESMO tubo da medida padrao, comprado do mesmo fornecedor, e Compras e um
 * so — decisao do dono, 24/09/2026. Separar as compras compraria o mesmo tubo
 * duas vezes, perdendo escala.
 *
 * E o caminho de volta do `tecido/nucleo/materiais.js`: la o PCP entrega a
 * lista de material para o cadastro do sob medida apontar; aqui o sob medida
 * entrega quanto cada material ja esta vendido e ainda nao produzido.
 *
 * ⚠️ POR QUE UMA PORTA, E NAO UM `require` DIRETO DO MODULO. Sao dois bancos,
 * e o sob medida sobe dentro de um try/catch no server.js justamente para que
 * um tecido.db corrompido nao derrube a expedicao junto (CLAUDE.md §19). Um
 * require direto aqui desfaria isso: a lista de compras passaria a depender do
 * boot do outro modulo, e quem despacha o dia ficaria sem tela por causa de
 * um assunto que nao e dele.
 *
 * ⚠️ SEM A PORTA, A LISTA NAO CALA — mas tambem nao recusa. Aqui a regra do
 * `pessoas.js` ("sem a porta, recusa") nao cabe: recusar deixaria o comprador
 * sem lista nenhuma por causa do sob medida. O que ela faz e DIZER que o sob
 * medida ficou de fora, com o motivo. Silencio ali seria um total incompleto
 * com cara de completo, que e a regra 4 do custo pela porta do Compras.
 */
let porta = null;

// Chamada uma vez, no server.js, com o que o montar() do sob medida devolveu.
// `null` desliga — e o teste usa isso para provar o caso de ela nao existir.
const ligar  = fn => { porta = (typeof fn === 'function') ? fn : null; };
const ligada = () => !!porta;

/* Devolve sempre a MESMA forma, com `fora` dizendo se o numero e confiavel.
 * Nunca estoura: o modulo do outro lado pode tropecar (banco travado, disco
 * cheio), e o Compras nao pode cair junto — mas o motivo real atravessa, em
 * vez de um generico. "Falhou" sem dizer o que faz alguem procurar no lugar
 * errado a tarde inteira. */
function consumo(){
  if(!porta) return { fora:true, materiais:[], pendencias:[],
    motivo:'O módulo sob medida não subiu neste boot, então o material vendido por '+
           'ele NÃO está somado abaixo. O resto da lista está completo.' };
  try{
    const r = porta() || {};
    return { fora:false, materiais:r.materiais||[], pendencias:r.pendencias||[], motivo:null };
  }catch(e){
    return { fora:true, materiais:[], pendencias:[],
      motivo:'O sob medida não respondeu ('+(e&&e.message||e)+'), então o material '+
             'vendido por ele NÃO está somado abaixo.' };
  }
}

module.exports = { ligar, ligada, consumo };
