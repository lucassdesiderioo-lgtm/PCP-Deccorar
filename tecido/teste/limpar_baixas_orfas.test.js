// O SCRIPT DOS PEDIDOS DE BAIXA ORFAOS (CONSERTO de 12/11/2026, R-SMF-12).
// Antes do conserto, cancelar o boleto deixava a baixa pedida `pendente` para
// sempre. O teste monta esse estado como ele ficou no banco (o cancelamento
// gravado direto, sem o conserto) e confere que o script: so simula sem
// --aplicar; fecha so o pedido de boleto cancelado, com rastro e sem apagar;
// nao acha nada na segunda rodada; e faz o backup de verdade.
const fs=require('fs');
const revendas=require('../dominio/revenda');
const boleto=require('../dominio/boleto');
const aprovacao=require('../dominio/aprovacao');
const pessoas=require('../nucleo/pessoas');
const orfas=require('../limpar_baixas_orfas');

const LUCAS={id:1,nome:'Lucas'};
let rev=null, n=0;
function novoBoleto(){
  if(!rev){
    pessoas.ligar(()=>[{id:7,nome:'Renato'}]);
    const tb=revendas.tabelas()[0];
    revendas.definirDescontoTabela(tb.id,500,{nome:'teste'});
    rev=revendas.criar({razao_social:'Revenda Orfa LTDA',nome_fantasia:'ORFA',tabela_id:tb.id,
      desconto_centesimos:0},LUCAS).id;
    revendas.definirLimite(rev,500000,LUCAS);
  }
  return boleto.lancar({revenda_id:rev,numero:'OR'+(++n),valor_centavos:10000,vencimento:'2026-12-31'},LUCAS);
}
/* o cancelamento como era ANTES do conserto: so o boleto, o pedido fica */
const cancelarComoAntes=(db,id)=>db.prepare(`UPDATE sm_boleto SET cancelado_em='2026-11-05 10:00:00',
  cancelado_por='Carla', cancelado_motivo='lancado em dobro' WHERE id=?`).run(id);

module.exports=[

{nome:'orfas — simular so lista; aplicar fecha o pedido do boleto cancelado, com rastro, e nao apaga',
 executar({igual,db}){
  const orfao=novoBoleto();
  const pOrfao=aprovacao.pedirBaixa(orfao.id,{},LUCAS);
  cancelarComoAntes(db,orfao.id);
  const vivo=novoBoleto();
  const pVivo=aprovacao.pedirBaixa(vivo.id,{},LUCAS);

  const l=orfas.levantar();
  igual(l.length,1,'acha so o pedido do boleto cancelado');
  igual(l[0].id,pOrfao.id,'o pedido certo');
  igual(aprovacao.porId(pOrfao.id).status,'pendente','levantar nao grava nada');

  const r=orfas.aplicar();
  igual(r.fechados,1,'fechou um');
  const h=aprovacao.porId(pOrfao.id);
  igual(h.status,'cancelado','status cancelado');
  igual(h.decidido_por,'Carla','quem cancelou o boleto');
  igual(h.decidido_em,'2026-11-05 10:00:00','na data do cancelamento');
  igual(/lancado em dobro/.test(h.decisao_motivo),true,'com o motivo do cancelamento');
  igual(aprovacao.porId(pVivo.id).status,'pendente','o pedido do boleto em aberto nao se mexe');
  igual(boleto.porId(vivo.id).cancelado_em,null,'nem o boleto dele');
  igual(orfas.levantar().length,0,'a segunda rodada nao acha nada');
  igual(orfas.aplicar().fechados,0,'e nao grava nada');
 }},

{nome:'orfas — o backup existe no disco depois do await',
 async executar({igual}){
  const arq=await orfas.fazerBackup();
  igual(fs.existsSync(arq)&&fs.statSync(arq).size>0,true,'o arquivo de backup existe e nao e vazio');
  fs.unlinkSync(arq);
 }}

];
