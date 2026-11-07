// O QUE ESTE MODULO GUARDA EM CADA ENDERECO DO PCP — spec COMPRAS-E-RECEBIMENTO,
// fase 10 (R-CMP-50). O saldo e um so para quem olha: o painel do almoxarifado
// do PCP mostra os volumes de la E os rolos e sobras daqui, lidos por esta
// funcao (devolvida pelo montar(), a porta de volta). So o que esta na
// estante: rolo nao encerrado, sobra disponivel, com nivel do PCP.
const db=require('../nucleo/db');
function estoque(){
  const rolos=db.prepare(`SELECT r.codigo, r.saldo, r.largura, r.nivel_pcp_id, r.nivel_pcp_nome, t.codigo tecido
    FROM rolo r JOIN tecido t ON t.id=r.tecido_id WHERE r.status<>'encerrado' AND r.nivel_pcp_id IS NOT NULL`).all()
    .map(r=>({tipo:'rolo',codigo:r.codigo,item:'rolo '+r.tecido+' '+String(r.largura).replace('.',',')+' m',saldo:r.saldo,unidade:'m',
      nivel_pcp_id:r.nivel_pcp_id,nivel_pcp_nome:r.nivel_pcp_nome}));
  const sobras=db.prepare(`SELECT s.codigo, s.largura, s.altura, s.nivel_pcp_id, s.nivel_pcp_nome, t.codigo tecido
    FROM sobra s JOIN tecido t ON t.id=s.tecido_id WHERE s.status='disponivel' AND s.nivel_pcp_id IS NOT NULL`).all()
    .map(s=>({tipo:'sobra',codigo:s.codigo,item:'sobra '+s.tecido+' '+String(s.largura).replace('.',',')+' × '+String(s.altura).replace('.',','),
      saldo:Math.round(s.largura*s.altura*1000)/1000,unidade:'m²',nivel_pcp_id:s.nivel_pcp_id,nivel_pcp_nome:s.nivel_pcp_nome}));
  return rolos.concat(sobras);
}
module.exports={estoque};
