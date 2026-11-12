/* dominio/pendencias_pcp.js — o que espera uma pessoa decidir no sob medida,
 * para a central de Pendências do PCP (spec docs/specs/PENDENCIAS-NO-MENU.md,
 * fase 3, 12/11/2026).
 *
 * ⚠️ NENHUMA CONTA MORA AQUI (#12): cada fila é a MESMA função que a tela dona
 * usa para desenhar a lista dela — a 616 (baixa de boleto), a 603 (descarte de
 * sobra), a 602 (correção de corte), a 611 (pedido esperando aprovação) e a
 * 606 (cadastro a conferir). Este arquivo só conta o que elas devolvem.
 *
 * ⚠️ "O QUE ESTA PESSOA RESOLVE" É A RÉGUA DO DONO: quem pediu a baixa ou o
 * descarte não aprova (`aprovacao.mesmaPessoa`, pelo id); quem pediu a correção
 * não aprova (`corte.pediuACorrecao`, pelo nome — a tabela não guarda o id); o
 * vendedor aprova só a carteira dele (`pedido.fila`). O cadastro a conferir não
 * tem régua de pessoa.
 *
 * ⚠️ SÓ NÚMERO E DATA: nada de cliente, revenda, valor ou SKU sai daqui.
 *
 * Quem chama é o PCP, pela porta do `montar()` (sobmedida_pendencias.js):
 * `contar(tipo)` é o total; `contar(tipo, usuario)` é o da pessoa, com o
 * usuário do sob medida (as chaves sem o prefixo, como o portão as lê).
 */
const aprovacao=require('./aprovacao');
const corte=require('./corte');
const pedido=require('./pedido');
const conferir=require('./conferir');

const TIPOS={
  baixa_boleto:{ lista:()=>aprovacao.pendentes('baixa_boleto'), em:a=>a.pedido_em,
    daPessoa:(l,u)=>l.filter(a=>!aprovacao.mesmaPessoa(a,u)) },
  descarte_sobra:{ lista:()=>aprovacao.pendentes('descarte_sobra'), em:a=>a.pedido_em,
    daPessoa:(l,u)=>l.filter(a=>!aprovacao.mesmaPessoa(a,u)) },
  correcao_corte:{ lista:()=>corte.correcoes({status:'pendente'}), em:k=>k.pedida_em,
    daPessoa:(l,u)=>l.filter(k=>!corte.pediuACorrecao(k,u&&u.nome)) },
  pedido_aprovar:{ lista:()=>pedido.listar({marco:'enviado'}), em:p=>p.enviado_em,
    daPessoa:(l,u)=>pedido.fila(u) },
  conferir:{ lista:()=>conferir.listar(), em:x=>x.criado_em, daPessoa:l=>l }
};

/* A data mais antiga da fila (quem espera há mais tempo). */
function maisAntiga(datas){
  const d=datas.filter(Boolean).map(x=>String(x).slice(0,19)).sort();
  return d.length?d[0]:null;
}

function contar(tipo,usuario){
  const T=TIPOS[tipo];
  if(!T) throw new Error('tipo de pendência desconhecido: '+tipo);
  let l=T.lista();
  if(usuario!==undefined){
    if(!usuario) return {n:0, desde:null};   // sem entrada no sob medida, nada é dela
    l=T.daPessoa(l,usuario);
  }
  return {n:l.length, desde:maisAntiga(l.map(T.em))};
}

module.exports={contar, TIPOS:Object.keys(TIPOS)};
