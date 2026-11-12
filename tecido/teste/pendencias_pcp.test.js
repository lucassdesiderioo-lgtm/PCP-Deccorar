// AS FILAS DO SOB MEDIDA NA CENTRAL DO PCP — spec PENDENCIAS-NO-MENU, fase 3
// (12/11/2026). O dominio/pendencias_pcp.js so conta o que a tela dona lista,
// e a regra de pessoa e a do dono: quem pediu a baixa ou o descarte nao aprova
// (pelo id), quem pediu a correcao nao aprova (pelo nome), o vendedor ve a
// carteira dele, e o cadastro a conferir nao tem regra de pessoa.
const db=require('../nucleo/db');
const sobra=require('../dominio/sobra');
const etiqueta=require('../dominio/etiqueta');
const tecido=require('../dominio/tecido');
const endereco=require('../dominio/endereco');
const revendas=require('../dominio/revenda');
const boleto=require('../dominio/boleto');
const aprovacao=require('../dominio/aprovacao');
const corte=require('../dominio/corte');
const pedido=require('../dominio/pedido');
const conferir=require('../dominio/conferir');
const largura=require('../dominio/largura');
const pessoas=require('../nucleo/pessoas');
const P=require('../dominio/pendencias_pcp');

const LUCAS={id:1,nome:'Lucas'}, ISA={id:2,nome:'Isabela'};
const VEND7={id:7,nome:'Renato',permissoes:['pedido.aprovar'],setores:[]};
const VEND8={id:8,nome:'Paula',permissoes:['pedido.aprovar'],setores:[]};
const CHEFE={id:9,nome:'Chefe',permissoes:['pedido.aprovar_qualquer'],setores:[]};
const ISA_T={...ISA,permissoes:['revenda.editar'],setores:[]};   // ve a carteira inteira na 616

let cena=null;
function montar(){
  if(cena) return cena;
  pessoas.ligar(()=>[{id:7,nome:'Renato'},{id:8,nome:'Paula'}]);
  const linha=tecido.criarLinha({nome:'Rolo Pend'});
  const ab=tecido.criarAbertura({nome:'5%',linha_id:linha.id});
  const cor=tecido.criarCor({nome:'Gelo'});
  const t=tecido.criarTecido({linha_id:linha.id,abertura_id:ab.id,cor_id:cor.id});
  const h=endereco.criarHaste({nome:'PD',armazem_chave:'SOBRA'});
  const a=endereco.criarAndar({nome:'01',haste_id:h.id});
  const n=endereco.criarNivel({nome:'01',andar_id:a.id});
  const tb=revendas.tabelas()[0];
  revendas.definirDescontoTabela(tb.id,500,{nome:'teste'});
  const r7=revendas.criar({razao_social:'Revenda Sete LTDA',nome_fantasia:'SETE',tabela_id:tb.id,desconto_centesimos:0},LUCAS);
  revendas.definirVendedor(r7.id,7,LUCAS); revendas.definirLimite(r7.id,500000,LUCAS);
  const r8=revendas.criar({razao_social:'Revenda Oito LTDA',nome_fantasia:'OITO',tabela_id:tb.id,desconto_centesimos:0},LUCAS);
  revendas.definirVendedor(r8.id,8,LUCAS);
  cena={tecido:t,nivel:n.id,r7:r7.id,r8:r8.id};
  return cena;
}
let nB=0;
const novoBoleto=()=>boleto.lancar({revenda_id:montar().r7,numero:'PD'+(++nB),valor_centavos:100000,vencimento:'2026-12-31'},LUCAS);
const novaSobra=()=>sobra.criar({codigo:etiqueta.imprimirLote(1,'Diretor').codigos[0],tecido_id:montar().tecido.id,
  largura:'1,20',altura:'1,50',condicao:'integra',nivel_id:montar().nivel},'Cortador');
/* O pedido enviado e a correcao entram direto no banco: o que se testa aqui e a
   conta e a regra de pessoa, e nao o caminho do pedido ou do corte (que tem os
   testes dele). As listas sao as do dono. */
let nP=900;
const pedidoEnviado=rev=>db.prepare("INSERT INTO sm_pedido(numero,revenda_id,tipo,marco,enviado_em) VALUES(?,?,'pedido','enviado','2026-11-10 09:00:00')")
  .run(++nP,rev).lastInsertRowid;
const correcaoPedida=por=>{
  const pl=db.prepare("INSERT INTO plano(tecido_id,usuario_nome,confirmado) VALUES(?,?,1)").run(montar().tecido.id,'Cortador').lastInsertRowid;
  return db.prepare("INSERT INTO plano_correcao(plano_id,edicoes,pedida_por,pedida_em) VALUES(?,'[]',?,'2026-11-09 08:00:00')").run(pl,por).lastInsertRowid;
};

module.exports=[

{nome:'pendencias_pcp — a baixa de boleto conta o que a 616 lista, e quem pediu nao a ve',
 executar({igual}){
  const antes=P.contar('baixa_boleto').n;
  aprovacao.pedirBaixa(novoBoleto().id,{},LUCAS);
  const r=P.contar('baixa_boleto');
  igual(r.n,antes+1,'o total sobe um');
  igual(r.n,aprovacao.pendentes('baixa_boleto').length,'o total e a lista da tela dona');
  igual(!!r.desde,true,'e diz desde quando espera');
  const LUCAS_T={...LUCAS,permissoes:['revenda.editar'],setores:[]};
  igual(P.contar('baixa_boleto',LUCAS_T).n,r.n-1,'quem pediu nao ve a dele');
  igual(P.contar('baixa_boleto',ISA_T).n,r.n,'quem ve a carteira inteira ve todas');
  igual(P.contar('baixa_boleto',{id:3,nome:'Lucas',permissoes:['revenda.editar'],setores:[]}).n,r.n,'o homonimo e outra pessoa (pelo id)');
  /* ③ REVISAO: a 616 so mostra a baixa dentro da CARTEIRA da pessoa
     (boleto.carteira): sem carteira, a tela nao mostra nada, e a bolinha que
     contasse a baixa nunca zeraria. */
  igual(P.contar('baixa_boleto',{id:4,nome:'Fina',permissoes:['boleto.aprovar_baixa'],setores:[]}).n,0,'sem carteira (nem a casa inteira), a tela nao mostra: zero');
  igual(P.contar('baixa_boleto',VEND7).n,r.n,'o vendedor da revenda ve a baixa da carteira dele');
  /* a OITO tambem tem boleto em aberto: a carteira da Paula NAO e vazia, e
     mesmo assim a baixa da SETE nao e dela (③ REVISAO, rodada 2) */
  boleto.lancar({revenda_id:montar().r8,numero:'PD8'+(++nB),valor_centavos:50000,vencimento:'2026-12-31'},LUCAS);
  igual(P.contar('baixa_boleto',VEND8).n,0,'a vendedora de outra carteira (com boleto em aberto) nao ve a baixa da SETE');
 }},

{nome:'pendencias_pcp — a baixa de um boleto cancelado ou pago nao conta na bolinha (a 616 so desenha o boleto em aberto)',
 executar({igual}){
  const QUALQUER={id:9,nome:'Chefe',permissoes:['pedido.aprovar_qualquer'],setores:[]};
  const b=novoBoleto();
  aprovacao.pedirBaixa(b.id,{},LUCAS);
  const antes=P.contar('baixa_boleto',QUALQUER).n;
  boleto.cancelar(b.id,'lancado em dobro',LUCAS);
  igual(P.contar('baixa_boleto',QUALQUER).n,antes-1,'cancelado o boleto, a baixa dele sai da bolinha');
 }},

{nome:'pendencias_pcp — o descarte de sobra conta o que a 603 lista, e quem pediu nao o ve',
 executar({igual}){
  aprovacao.pedirDescarte(novaSobra().id,'rasgou',LUCAS);
  const r=P.contar('descarte_sobra');
  igual(r.n,aprovacao.pendentes('descarte_sobra').length,'o total e a lista da tela dona');
  igual(P.contar('descarte_sobra',LUCAS).n,r.n-1,'quem pediu nao ve o dele');
  igual(P.contar('descarte_sobra',ISA).n,r.n,'outra pessoa ve todos');
 }},

{nome:'pendencias_pcp — a correcao de corte conta o que a 602 lista, e quem pediu (pelo nome) nao a ve',
 executar({igual}){
  correcaoPedida('Lucas');
  const r=P.contar('correcao_corte');
  igual(r.n,corte.correcoes({status:'pendente'}).length,'o total e a lista da tela dona');
  igual(r.desde,'2026-11-09 08:00:00','desde a correcao mais antiga');
  igual(P.contar('correcao_corte',LUCAS).n,r.n-1,'quem pediu nao ve a dela');
  igual(P.contar('correcao_corte',{id:3,nome:'lucas '}).n,r.n-1,'a regra do dono e pelo nome (a tabela nao guarda o id)');
  igual(P.contar('correcao_corte',ISA).n,r.n,'outra pessoa ve');
  igual(corte.pediuACorrecao({pedida_por:'Lucas'},'LUCAS'),true,'e a mesma regra que o aprovar usa');
 }},

{nome:'pendencias_pcp — o pedido esperando aprovacao: o total, a carteira do vendedor e quem aprova qualquer',
 executar({igual}){
  pedidoEnviado(montar().r7); pedidoEnviado(montar().r7); pedidoEnviado(montar().r8);
  const r=P.contar('pedido_aprovar');
  igual(r.n,pedido.listar({marco:'enviado'}).length,'o total e a lista dos enviados');
  igual(P.contar('pedido_aprovar',VEND7).n,pedido.fila(VEND7).length,'o vendedor ve a fila dele, a da tela');
  igual(P.contar('pedido_aprovar',VEND7).n,2,'as duas da carteira dele');
  igual(P.contar('pedido_aprovar',VEND8).n,1,'a outra vendedora ve a dela');
  igual(P.contar('pedido_aprovar',CHEFE).n,r.n,'quem aprova qualquer ve todos');
 }},

{nome:'pendencias_pcp — o cadastro a conferir conta o que a 606 lista, sem regra de pessoa',
 executar({igual}){
  largura.garantir('2,93','Bancada');
  const r=P.contar('conferir');
  igual(r.n,conferir.listar().length,'o total e a lista da tela dona');
  igual(r.n>=1,true,'a largura criada na bancada entra');
  igual(P.contar('conferir',ISA).n,r.n,'todo mundo que resolve ve todos');
 }},

{nome:'pendencias_pcp — sem entrada no sob medida nada e da pessoa, e tipo desconhecido estoura',
 executar({igual,recusa}){
  igual(P.contar('baixa_boleto',null).n,0,'usuario null: zero da pessoa');
  let estourou=false; try{ P.contar('outra_coisa'); }catch(e){ estourou=true; }
  igual(estourou,true,'tipo que nao existe nao vira zero calado');
 }},

{nome:'pendencias_pcp — so numero e data: nada de cliente, revenda ou valor',
 executar({igual}){
  P.TIPOS.forEach(t=>{
    const r=P.contar(t);
    igual(Object.keys(r).sort().join(','),'desde,n','a resposta de '+t+' e so n e desde');
  });
  const src=require('fs').readFileSync(require('path').join(__dirname,'..','dominio','pendencias_pcp.js'),'utf8')
    .replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
  igual(/\b(SELECT|FROM|db\.prepare)\b/.test(src),false,'e nenhuma consulta propria: a conta e do dono (#12)');
 }}
];
