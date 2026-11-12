// A PORTA DO MATERIAL DO PCP PARA A FICHA E A EMBALAGEM DESTE MODULO — spec
// FICHAS-NO-CADASTRO-UNICO (11/11/2026). As duas fichas tecnicas puxam do
// MESMO cadastro de material (o do PCP, tela 1101); este modulo nao abre o
// dados.db, e as tres coisas que precisa de la chegam por aqui, ligadas no
// montar() pelo server.js — o mesmo desenho do `materiais.js` e do `pessoas.js`.
//
//   custo(ids)    o custo da unidade de cada material (a conta da ficha da 404)
//   baixar(a)     a baixa pela ficha na embalagem (so o que sai pela ficha)
//   extra(a)      o "material extra a decidir" da peca recusada
//
// ⚠️ SEM A PORTA, NADA TRAVA A BANCADA (#6): o custo sai indefinido, a baixa
// fica pendente na propria linha (sm_pedido_material.baixa_resultado) e o
// material extra nao e registrado — e cada uma diz isso. O motivo atravessa.
let porta=null;
const ligar=p=>{ porta=(p&&typeof p.baixarMaterial==='function')?p:null; };
const ligada=()=>!!porta;

function custo(ids){
  if(!porta||typeof porta.custoMaterial!=='function') return null;
  try{ return porta.custoMaterial(ids)||{}; }catch(e){ return null; }
}
function baixar(a){
  if(!porta) throw new Error('a porta do material do PCP não está ligada neste servidor');
  return porta.baixarMaterial(a);
}
function extra(a){
  if(!porta||typeof porta.materialExtra!=='function') return null;
  return porta.materialExtra(a);
}
module.exports={ligar,ligada,custo,baixar,extra};
