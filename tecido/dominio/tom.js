// A ORIGEM DE TOM — dono unico de "de que lote de tecido esta fonte veio"
// (spec CORTE-EM-ETAPAS, fase 4, R9).
//
//   rolo                            o proprio rolo
//   sobra que nasceu de rolo        aquele rolo (origem_rolo_id)
//   sobra que nasceu de sobra       sobe pela origem_sobra_id ate achar o rolo
//   sobra sem rolo na cadeia        SEM origem: cada uma e sozinha
//                                   (o mutirao do acervo nao sabia de onde
//                                   o retalho saiu)
//
// Pecas do mesmo pedido em fontes da MESMA origem sao como fonte unica: o tom
// e o do rolo, e e o mesmo. Em origens diferentes, quem garante o tom e o
// operador, com o tecido na mao — o "Conferi o tecido" do Cortando (R11).
//
// ⚠️ A CHAVE DA SOBRA SEM ORIGEM E A PROPRIA SOBRA ('sobra:<id>'), e nao um
// "sem origem" comum a todas. Juntar as sobras do mutirao numa origem so
// diria que todas tem o mesmo tom — que e justamente o que ninguem sabe.
const db=require('../nucleo/db');

const pSobra=db.prepare('SELECT id, codigo, origem_rolo_id, origem_sobra_id FROM sobra WHERE id=?');
const pRolo=db.prepare('SELECT id, codigo FROM rolo WHERE id=?');

function deSobra(id,visto){
  const v=visto||new Set();
  const s=pSobra.get(id);
  if(!s) return {chave:'sobra:'+id, rolo_id:null, codigo:null};
  if(s.origem_rolo_id){
    const r=pRolo.get(s.origem_rolo_id);
    return {chave:'rolo:'+s.origem_rolo_id, rolo_id:s.origem_rolo_id, codigo:r?r.codigo:null};
  }
  // Cadeia de sobra-de-sobra: sobe ate o rolo. A guarda contra laco existe
  // porque cadastro feito a mao pode apontar uma sobra para ela mesma.
  if(s.origem_sobra_id&&!v.has(s.origem_sobra_id)){
    v.add(s.id);
    const acima=deSobra(s.origem_sobra_id,v);
    if(acima.rolo_id) return acima;
  }
  return {chave:'sobra:'+s.id, rolo_id:null, codigo:null};
}

/** A origem de tom de uma fonte do plano. */
function origem(fonte,id){
  if(fonte==='rolo'){
    const r=pRolo.get(id);
    return {chave:'rolo:'+id, rolo_id:Number(id), codigo:r?r.codigo:null};
  }
  return deSobra(Number(id));
}

// A frase que a tela mostra: "do rolo R-000032", ou "sem origem conhecida".
const descrever=o=>o.rolo_id?'do rolo '+(o.codigo||o.rolo_id):'sem origem conhecida (cada sobra assim e sozinha)';

module.exports={origem, descrever};
