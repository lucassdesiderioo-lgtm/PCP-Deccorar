// DUAS PESSOAS NO BOLETO E NA SOBRA — fase 6 da spec ACESSOS-UNIFICADOS
// (resposta P2 do dono, 21/10/2026: "quem pede nao aprova" vale tambem para a
// baixa de boleto e o descarte de sobra).
//
// ⚠️ ESCRITO ANTES DO CODIGO: dinheiro e estoque sao risco vermelho da §0.
//
// O QUE ELE PROVA:
//   1. PEDIR NAO MUDA NADA. O boleto continua em aberto (e na conta do
//      credito); a sobra continua disponivel (e no plano de corte).
//   2. QUEM PEDIU NAO APROVA, nem o Admin Geral — a regra do ajuste de
//      estoque do PCP (§18, R-EST-18). Outra pessoa aprova, e so ai a baixa
//      ou o descarte acontecem, com quem pediu E quem aprovou no rastro.
//   3. UM PEDIDO POR VEZ por boleto e por sobra.
//   4. RECUSAR exige motivo, e o pedido sai sem mexer em nada.
//   5. O que nao podia ser baixado/descartado e recusado JA NO PEDIDO — o
//      pedido nao vira fila de coisa impossivel.
const sobra=require('../dominio/sobra');
const etiqueta=require('../dominio/etiqueta');
const tecido=require('../dominio/tecido');
const endereco=require('../dominio/endereco');
const revendas=require('../dominio/revenda');
const pessoas=require('../nucleo/pessoas');
const {PAPEIS,CHAVES}=require('../nucleo/permissoes');

function porta(caminho){
  let m=null; try{ m=require(caminho); }catch(e){ m=null; }
  return (metodo,...args)=>{
    if(!m||typeof m[metodo]!=='function') throw new Error(caminho+' nao expoe '+metodo+'()');
    return m[metodo](...args);
  };
}
const bol=porta('../dominio/boleto');
const apr=porta('../dominio/aprovacao');

const LUCAS ={id:1,nome:'Lucas'};
const ISA   ={id:2,nome:'Isabela'};
const OUTRO_LUCAS={id:3,nome:'Lucas'};   // homonimo: a regra e por PESSOA, nao por nome

let cena=null;
function montar(){
  if(cena) return cena;
  pessoas.ligar(()=>[{id:7,nome:'Renato'}]);
  const linha=tecido.criarLinha({nome:'Rolo Aprova'});
  const ab=tecido.criarAbertura({nome:'3%',linha_id:linha.id});
  const cor=tecido.criarCor({nome:'Areia'});
  const t=tecido.criarTecido({linha_id:linha.id,abertura_id:ab.id,cor_id:cor.id});
  const h=endereco.criarHaste({nome:'SA',armazem_chave:'SOBRA'});
  const a=endereco.criarAndar({nome:'01',haste_id:h.id});
  const n=endereco.criarNivel({nome:'01',andar_id:a.id});
  const tb=revendas.tabelas()[0];
  revendas.definirDescontoTabela(tb.id,500,{nome:'teste'});
  const r=revendas.criar({razao_social:'Revenda Aprova LTDA',nome_fantasia:'APROVA',
    tabela_id:tb.id,desconto_centesimos:0},LUCAS);
  revendas.definirVendedor(r.id,7,LUCAS);
  revendas.definirLimite(r.id,500000,LUCAS);
  cena={tecido:t,nivel:n.id,revenda:r.id};
  return cena;
}
let nB=0;
const boleto=()=>bol('lancar',{revenda_id:montar().revenda, numero:'AP'+(++nB),
  valor_centavos:100000, vencimento:'2026-12-31'},LUCAS);
const novaSobra=()=>sobra.criar({codigo:etiqueta.imprimirLote(1,'Diretor').codigos[0],tecido_id:montar().tecido.id,
  largura:'1,20',altura:'1,50',condicao:'integra',nivel_id:montar().nivel},'Cortador');
const situacao=id=>bol('listar',{}).find(b=>b.id===id).situacao;

module.exports=[

/* ═══ O BOLETO ═══════════════════════════════════════════════════════════ */

{nome:'P2 — pedir a baixa NAO baixa: o boleto continua em aberto e na conta do credito',
 executar({igual}){
  const b=boleto();
  const antes=bol('credito',montar().revenda).valor_em_aberto_centavos;
  const p=apr('pedirBaixa',b.id,{},LUCAS);
  igual(p.status,'pendente','o pedido fica pendente');
  igual(situacao(b.id)!=='pago',true,'o boleto NAO foi baixado');
  igual(bol('credito',montar().revenda).valor_em_aberto_centavos,antes,'e continua comendo o limite');
  igual(apr('pendentes','baixa_boleto').some(x=>x.alvo_id===b.id&&x.pedido_por==='Lucas'),true,
    'e aparece na lista de quem aprova, com quem pediu');
 }},

{nome:'P2 — QUEM PEDIU NAO APROVA, nem com o mesmo nome em outra pessoa vale o contrario',
 executar({igual,recusa}){
  const b=boleto();
  const p=apr('pedirBaixa',b.id,{},LUCAS);
  recusa(()=>apr('aprovar',p.id,LUCAS),'mesma_pessoa','quem pediu tenta aprovar');
  igual(situacao(b.id)!=='pago',true,'e nada mudou');
  /* A regra e por PESSOA (id do PCP), e nao por nome: dois "Lucas" sao duas
     pessoas, e o homonimo pode aprovar. */
  const ok=apr('aprovar',p.id,OUTRO_LUCAS);
  igual(ok.status,'aprovado','o homonimo, outra pessoa, aprova');
 }},

{nome:'P2 — outra pessoa aprova: ai a baixa acontece, e o rastro tem os dois',
 executar({igual}){
  const b=boleto();
  const p=apr('pedirBaixa',b.id,{pago_em:'2026-10-20'},LUCAS);
  const r=apr('aprovar',p.id,ISA);
  igual(r.status,'aprovado','aprovado');
  const pago=bol('listar',{}).find(x=>x.id===b.id);
  igual(pago.situacao,'pago','o boleto agora esta pago');
  igual(pago.pago_por,'Lucas','pago_por e quem viu o pagamento e pediu');
  igual(String(pago.pago_em).slice(0,10),'2026-10-20','com a data que veio no pedido');
  const h=apr('porId',p.id);
  igual(h.decidido_por,'Isabela','e quem aprovou fica no pedido');
 }},

{nome:'P2 — um pedido por vez, e o impossivel e recusado ja no pedido',
 executar({igual,recusa}){
  const b=boleto();
  apr('pedirBaixa',b.id,{},LUCAS);
  recusa(()=>apr('pedirBaixa',b.id,{},ISA),'pedido_pendente','segundo pedido para o mesmo boleto');
  const c=boleto();
  bol('cancelar',c.id,'lancado errado',LUCAS);
  recusa(()=>apr('pedirBaixa',c.id,{},LUCAS),'boleto_cancelado','pedir baixa de cancelado');
  recusa(()=>apr('pedirBaixa',boleto().id,{pago_em:'31/12'},LUCAS),'data_invalida','data fora do formato');
 }},

{nome:'P2 — recusar exige motivo, e o boleto fica como estava',
 executar({igual,recusa}){
  const b=boleto();
  const p=apr('pedirBaixa',b.id,{},LUCAS);
  recusa(()=>apr('recusar',p.id,'',ISA),'motivo_obrigatorio','recusar sem motivo');
  const r=apr('recusar',p.id,'o pagamento nao caiu',ISA);
  igual(r.status,'recusado','recusado');
  igual(situacao(b.id)!=='pago',true,'o boleto continua em aberto');
  igual(apr('pendentes','baixa_boleto').some(x=>x.id===p.id),false,'e sai da lista');
  // E pode ser pedido de novo, quando o pagamento cair.
  igual(apr('pedirBaixa',b.id,{},LUCAS).status,'pendente','um pedido novo e aceito');
 }},

/* ═══ A SOBRA ════════════════════════════════════════════════════════════ */

{nome:'P2 — pedir o descarte NAO descarta: a sobra continua disponivel',
 executar({igual,recusa}){
  const s=novaSobra();
  recusa(()=>apr('pedirDescarte',s.id,'',LUCAS),'motivo_obrigatorio','pedir sem motivo');
  const p=apr('pedirDescarte',s.id,'rasgou na borda',LUCAS);
  igual(p.status,'pendente','pendente');
  igual(sobra.porId(s.id).status,'disponivel','a sobra continua disponivel — e no plano de corte');
  recusa(()=>apr('aprovar',p.id,LUCAS),'mesma_pessoa','quem pediu nao aprova');
  recusa(()=>apr('pedirDescarte',s.id,'de novo',ISA),'pedido_pendente','um pedido por vez');
  const r=apr('aprovar',p.id,ISA);
  igual(r.status,'aprovado','outra pessoa aprova');
  igual(sobra.porId(s.id).status,'descartada','e so ai a sobra sai');
 }},

{nome:'P2 — se a sobra foi usada no corte enquanto o pedido esperava, aprovar e recusado',
 executar({recusa,igual,db}){
  const s=novaSobra();
  const p=apr('pedirDescarte',s.id,'tom estranho',LUCAS);
  db.prepare("UPDATE sobra SET status='usada' WHERE id=?").run(s.id);
  recusa(()=>apr('aprovar',p.id,ISA),'sobra_indisponivel','a sobra ja nao esta disponivel');
  igual(apr('porId',p.id).status,'pendente','e o pedido espera quem recuse com motivo');
 }},

/* ═══ AS CHAVES ══════════════════════════════════════════════════════════ */

{nome:'P2 — aprovar sao chaves proprias, de supervisor, e nao estao na bancada nem na venda',
 executar({igual}){
  for(const k of ['boleto.aprovar_baixa','sobra.aprovar_descarte']){
    const c=CHAVES.find(x=>x.chave===k);
    igual(!!c,true,k+' existe');
    igual(c&&c.nivel,'supervisor',k+' e supervisor');
    igual(c&&c.sensivel,true,k+' e sensivel');
    igual(PAPEIS.cortador.includes(k)||PAPEIS.vendedor.includes(k),false,k+' nao e da bancada nem da venda');
  }
 }}

];
