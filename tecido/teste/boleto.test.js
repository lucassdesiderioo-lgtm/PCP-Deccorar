// O BOLETO E O CREDITO — secao 4.13 da spec SOBMEDIDA-PEDIDO-REVENDA (fase 6-C1).
//
// ⚠️ ESTE ARQUIVO FOI ESCRITO ANTES DO CODIGO. A fase mexe em schema e em
// dinheiro, entao e risco vermelho da secao 0 do CLAUDE.md, e ali o teste vem
// antes. As regras daqui saem da spec, nao do que o codigo devolveu.
//
// O QUE ELE EXISTE PARA PROVAR, em seis frases:
//
//   1. O CREDITO MOSTRA, NAO TRAVA (secao 4.13). Nao ha nada aqui que recuse
//      pedido por limite estourado — a decisao do dono e que nao se perde
//      venda. O que muda e a cor.
//   2. NEGATIVO FICA NEGATIVO. Limite estourado e justamente o que a tela
//      existe para mostrar; cortar em zero seria o MAX(0,…) do saldo do PCP
//      (§2) pela porta do credito.
//   3. SEM LIMITE LANCADO NAO HA DISPONIVEL. E `null`, nunca zero e nunca
//      "infinito" — e a regra 4 do custo: numero indefinido nao vira numero.
//   4. SO O BOLETO EM ABERTO CONTA. Pago sai, cancelado sai. Vencido FICA:
//      ele e o que mais conta, e o vencimento e marca, nao segunda conta.
//   5. NUMERO REPETIDO E O MESMO TITULO LANCADO DUAS VEZES, e ele zeraria o
//      limite de alguem por engano. Recusado.
//   6. "APROVADO SEM BOLETO" SO VALE PARA QUEM PAGA EM BOLETO. A fabrica
//      recebe em PIX e cartao tambem (dono, 26/09/2026), e cobrar boleto de
//      quem paga no cartao e aviso disparando no caso normal — a #6.
const pedido=require('../dominio/pedido');
const revendas=require('../dominio/revenda');
const catalogo=require('../dominio/catalogo_sm');
const tecido=require('../dominio/tecido');
const custo=require('../dominio/custo');
const config=require('../nucleo/config');
const pessoas=require('../nucleo/pessoas');

/* Funcao que ainda nao existe da VERMELHO, nunca derruba a rodada (§7-B,
   armadilha #33): suite que morre no meio faz o defeito aparecer como
   "travou" em vez de falhar, e os casos de baixo nunca rodam. */
function porta(caminho){
  let m=null; try{ m=require(caminho); }catch(e){ m=null; }
  return (metodo,...args)=>{
    if(!m||typeof m[metodo]!=='function')
      throw new Error(caminho+' nao expoe '+metodo+'()');
    return m[metodo](...args);
  };
}
const bol=porta('../dominio/boleto');

const DO_PCP=[{id:7,nome:'Renato'},{id:8,nome:'Carla'}];
const RENATO ={id:7,nome:'Renato',papel:'vendedor'};
const CARLA  ={id:8,nome:'Carla', papel:'vendedor'};
const DIRETOR={id:1,nome:'Lucas', papel:'diretor'};
// Quem le a carteira mas nao lanca nem baixa.
const SO_LE  ={id:9,nome:'Ze',    papel:'vendedor'};

let base=null;
function cena(){
  if(base) return base;
  pessoas.ligar(()=>DO_PCP);
  const l=tecido.criarLinha({nome:'Rolô'});
  const screen1=tecido.criarAbertura({nome:'Screen 1%',linha_id:l.id});
  const branco=tecido.criarCor({nome:'Branco'});
  tecido.criarTecido({linha_id:l.id,abertura_id:screen1.id,cor_id:branco.id});
  const m=catalogo.modeloPorNome('Rolô');
  catalogo.ligarColecao({modelo_id:m.id,abertura_id:screen1.id,
    preco_m2_centavos:11000,largura_max_mm:2800});
  catalogo.ligarCorAcessorio({modelo_id:m.id,cor_id:branco.id});
  base={m,screen1,branco};
  return base;
}
const peca=b=>({modelo_id:b.m.id, abertura_id:b.screen1.id,
  cor_tecido_id:b.branco.id, cor_acessorio_id:b.branco.id,
  largura_mm:1000, altura_mm:1000,
  comando:'direito', rolamento:'frente', adicional:'nenhum', reducao:'nao'});

function limpar(db){
  try{ db.prepare('DELETE FROM sm_boleto').run(); }catch(e){}
  for(const t of ['sm_recusa','sm_pendencia']){ try{ db.prepare('DELETE FROM '+t).run(); }catch(e){} }
  for(const t of ['sm_pedido_componente','sm_pedido_item_preco','sm_pedido_alteracao',
                  'sm_pedido_marco','sm_pedido_prazo','sm_pedido_item','sm_pedido',
                  'sm_etiqueta_impressao'])
    db.prepare('DELETE FROM '+t).run();
  db.prepare('DELETE FROM sm_revenda').run();
  db.prepare('UPDATE sm_tabela_preco SET desconto_centesimos=NULL').run();
  config.gravar('pedidoNumeroInicial','5000','teste');
  cena();
}

const formaPorNome=n=>revendas.formasPagamento().find(f=>f.nome===n);

let nRev=0;
/* Uma revenda com tabela lancada. `forma` e o nome da forma de pagamento —
   o PIX e o cartao existem no cadastro desde a fase 2, e e por isso que o
   "aprovado sem boleto" precisa olhar para ela. */
function revendaCom(opcoes){
  const o=opcoes||{};
  const t=revendas.tabelas()[0];
  revendas.definirDescontoTabela(t.id,500,{nome:'teste'});
  const r=revendas.criar({razao_social:'Revenda '+(++nRev)+' LTDA',
    nome_fantasia:'LAR '+nRev, tabela_id:t.id, desconto_centesimos:0,
    forma_pagamento_id:(formaPorNome(o.forma||'Boleto')||{}).id},DIRETOR);
  revendas.definirVendedor(r.id,o.vendedor||7,DIRETOR);
  if(o.limite!==undefined) revendas.definirLimite(r.id,o.limite,DIRETOR);
  return revendas.porId(r.id);
}

function aprovado(revenda_id,quem){
  const b=cena();
  const p=pedido.criar({revenda_id, tipo:'pedido'},DIRETOR);
  pedido.acrescentarItem(p.id,peca(b),DIRETOR);
  pedido.enviar(p.id,DIRETOR,'2026-09-22 10:00');
  return pedido.aprovar(p.id,quem||RENATO);
}

let nBol=0;
const lancar=(revenda_id,extra)=>bol('lancar',Object.assign({
  revenda_id, numero:'B'+String(++nBol).padStart(5,'0'),
  valor_centavos:100000, vencimento:'2026-12-31'
},extra||{}),DIRETOR);

const hoje=db=>db.prepare("SELECT date('now','localtime') v").get().v;
const dmenos=(db,n)=>db.prepare("SELECT date('now','localtime','-'||?||' days') v").get(String(n)).v;

module.exports=[

/* ═══ 1. O DISPONIVEL ════════════════════════════════════════════════════ */

{nome:'4.13 — disponivel = limite − boletos em aberto',
 executar({igual,db}){
  limpar(db);
  const r=revendaCom({limite:500000});            // R$ 5.000,00
  lancar(r.id,{valor_centavos:250000});
  lancar(r.id,{valor_centavos:100000});
  const c=bol('credito',r.id);
  igual(c.valor_limite_credito_centavos,500000,'o limite');
  igual(c.valor_em_aberto_centavos,350000,'o que esta em aberto');
  igual(c.valor_disponivel_centavos,150000,'e o que sobra');
  igual(c.estourado,false,'nao estourou');
 }},

{nome:'4.13 — o exemplo da spec: dois boletos de 2.500 num limite de 5.000 dao ZERO',
 executar({igual,db}){
  limpar(db);
  const r=revendaCom({limite:500000});
  lancar(r.id,{valor_centavos:250000});
  lancar(r.id,{valor_centavos:250000});
  igual(bol('credito',r.id).valor_disponivel_centavos,0,'zero, como a §4.13 escreve');
 }},

{nome:'4.13 — ESTOURADO fica NEGATIVO, e nao e cortado em zero',
 executar({igual,db}){
  limpar(db);
  const r=revendaCom({limite:500000});
  lancar(r.id,{valor_centavos:700000});
  const c=bol('credito',r.id);
  /* Zerar apagaria o tamanho do buraco: R$ 2.000 estourado e R$ 1 estourado
     ficariam iguais na tela. E o MAX(0,…) do saldo do PCP (§2) pela porta do
     credito, e o mesmo motivo do prazo vencido da fase 3. */
  igual(c.valor_disponivel_centavos,-200000,'o quanto passou');
  igual(c.estourado,true,'e a marca');
 }},

{nome:'4.13 — MOSTRA, NAO TRAVA: o pedido entra e e aprovado com o limite estourado',
 executar({igual,db}){
  limpar(db);
  const r=revendaCom({limite:100000});
  lancar(r.id,{valor_centavos:900000});
  igual(bol('credito',r.id).estourado,true,'estourado');
  /* Decisao do dono, 22/09/2026: nao se perde venda. Nao ha nada no
     dominio do pedido que leia credito, e este caso existe para que
     ninguem acrescente depois sem decidir. */
  const p=aprovado(r.id);
  igual(p.marco,'aprovado','o pedido foi aprovado do mesmo jeito');
 }},

{nome:'4.13 — sem limite lancado, o disponivel e NULL: nao ha o que dizer',
 executar({igual,db}){
  limpar(db);
  const r=revendaCom({});                          // sem limite
  lancar(r.id,{valor_centavos:100000});
  const c=bol('credito',r.id);
  igual(c.valor_limite_credito_centavos,null,'sem limite');
  igual(c.valor_disponivel_centavos,null,'entao nao ha disponivel — e nao e zero');
  igual(c.estourado,false,'e nao se estoura um limite que nao existe');
  igual(c.valor_em_aberto_centavos,100000,'mas o que ela deve continua sendo verdade');
 }},

/* ═══ 2. O QUE CONTA E O QUE SAI DA CONTA ════════════════════════════════ */

{nome:'4.13 — boleto PAGO sai da conta, e a baixa grava quem e quando',
 executar({igual,db}){
  limpar(db);
  const r=revendaCom({limite:500000});
  const b1=lancar(r.id,{valor_centavos:200000});
  lancar(r.id,{valor_centavos:100000});
  igual(bol('credito',r.id).valor_em_aberto_centavos,300000,'os dois em aberto');
  const pago=bol('baixar',b1.id,{},DIRETOR);
  igual(pago.situacao,'pago','o boleto ficou pago');
  igual(pago.pago_por,'Lucas','com quem deu a baixa');
  igual(!!pago.pago_em,true,'e quando');
  igual(bol('credito',r.id).valor_em_aberto_centavos,100000,'so o outro conta');
 }},

{nome:'4.13 — baixar duas vezes e recusado: o rastro nao pode virar dois',
 executar({igual,recusa,db}){
  limpar(db);
  const r=revendaCom({limite:500000});
  const b1=lancar(r.id,{});
  bol('baixar',b1.id,{},DIRETOR);
  recusa(()=>bol('baixar',b1.id,{},CARLA),'boleto_pago','a segunda baixa');
  igual(bol('porId',b1.id).pago_por,'Lucas','e o nome do primeiro continua');
 }},

{nome:'4.13 — a baixa se desfaz, com motivo, e o boleto volta para a conta',
 executar({igual,recusa,db}){
  limpar(db);
  const r=revendaCom({limite:500000});
  const b1=lancar(r.id,{valor_centavos:200000});
  bol('baixar',b1.id,{},DIRETOR);
  /* Baixa dada na linha errada acontece, e sem caminho de volta o jeito
     vira lancar o boleto de novo — que e numero repetido, o caso abaixo.
     Trava que nao sabe liberar e trava que a equipe contorna (§5). */
  recusa(()=>bol('reabrir',b1.id,'',DIRETOR),'motivo_obrigatorio','sem motivo');
  const volta=bol('reabrir',b1.id,'baixa na linha errada',DIRETOR);
  igual(volta.situacao,'aberto','voltou a aberto');
  igual(bol('credito',r.id).valor_em_aberto_centavos,200000,'e conta de novo');
 }},

{nome:'4.13 — boleto CANCELADO sai da conta, e cancelar exige motivo',
 executar({igual,recusa,db}){
  limpar(db);
  const r=revendaCom({limite:500000});
  const b1=lancar(r.id,{valor_centavos:200000});
  recusa(()=>bol('cancelar',b1.id,'',DIRETOR),'motivo_obrigatorio','sem motivo');
  const c=bol('cancelar',b1.id,'titulo emitido em duplicidade',DIRETOR);
  igual(c.situacao,'cancelado','cancelado');
  igual(c.cancelado_motivo,'titulo emitido em duplicidade','com o porque');
  igual(bol('credito',r.id).valor_em_aberto_centavos,0,'e fora da conta');
 }},

{nome:'4.13 — VENCIDO continua em aberto: o vencimento e marca, nao segunda conta',
 executar({igual,db}){
  limpar(db);
  const r=revendaCom({limite:500000});
  lancar(r.id,{valor_centavos:200000, vencimento:dmenos(db,10)});
  lancar(r.id,{valor_centavos:100000, vencimento:'2099-12-31'});
  const c=bol('credito',r.id);
  /* Tirar o vencido da soma faria o limite de quem NAO paga parecer mais
     folgado que o de quem paga em dia — exatamente ao contrario. */
  igual(c.valor_em_aberto_centavos,300000,'os dois somam');
  igual(c.vencidos,1,'e um deles esta vencido');
  igual(c.valor_vencido_centavos,200000,'com o valor a parte');
 }},

{nome:'4.13 — boleto de revenda INATIVA continua contando',
 executar({igual,db}){
  limpar(db);
  const r=revendaCom({limite:500000});
  lancar(r.id,{valor_centavos:200000});
  revendas.editar(r.id,{ativo:0},DIRETOR);
  igual(bol('credito',r.id).valor_em_aberto_centavos,200000,
    'divida nao some porque o cadastro foi desativado');
 }},

/* ═══ 3. O QUE O LANCAMENTO RECUSA ═══════════════════════════════════════ */

{nome:'4.13 — numero repetido na MESMA revenda e recusado (e o mesmo titulo duas vezes)',
 executar({igual,recusa,db}){
  limpar(db);
  const r=revendaCom({limite:500000});
  bol('lancar',{revenda_id:r.id,numero:'12345',valor_centavos:100000,
    vencimento:'2026-12-31'},DIRETOR);
  /* Lancado duas vezes, ele zera o limite de alguem por engano — e o modo
     de falhar e otimista ao contrario: o vendedor para de vender achando
     que a revenda estourou. */
  recusa(()=>bol('lancar',{revenda_id:r.id,numero:'12345',valor_centavos:100000,
    vencimento:'2026-12-31'},DIRETOR),'numero_repetido','o repetido');
  igual(bol('credito',r.id).valor_em_aberto_centavos,100000,'e a conta nao dobrou');
 }},

{nome:'4.13 — o MESMO numero em OUTRA revenda passa: o numero e do banco dela',
 executar({igual,db}){
  limpar(db);
  const a=revendaCom({limite:500000}), b=revendaCom({limite:500000});
  bol('lancar',{revenda_id:a.id,numero:'1',valor_centavos:100000,vencimento:'2026-12-31'},DIRETOR);
  bol('lancar',{revenda_id:b.id,numero:'1',valor_centavos:100000,vencimento:'2026-12-31'},DIRETOR);
  igual(bol('credito',a.id).valor_em_aberto_centavos,100000,'a primeira');
  igual(bol('credito',b.id).valor_em_aberto_centavos,100000,'e a segunda');
 }},

{nome:'4.13 — valor impossivel e RECUSADO dizendo o campo, nunca clampado',
 executar({recusa,igual,db}){
  limpar(db);
  const r=revendaCom({limite:500000});
  /* Clampar em zero e apagar dinheiro em silencio — a armadilha #25 do §6 e
     a #33 do §7-B, pela porta do boleto. */
  recusa(()=>lancar(r.id,{valor_centavos:0}),'valor_invalido','zero');
  recusa(()=>lancar(r.id,{valor_centavos:-500}),'valor_invalido','negativo');
  recusa(()=>lancar(r.id,{valor_centavos:10.5}),'valor_invalido','fracao de centavo');
  recusa(()=>lancar(r.id,{valor_centavos:'abc'}),'valor_invalido','texto');
  igual(bol('listar',{revenda_id:r.id}).length,0,'e nenhum foi gravado');
 }},

{nome:'4.13 — vencimento tem que ser data que EXISTE, e o numero nao pode faltar',
 executar({recusa,db}){
  limpar(db);
  const r=revendaCom({limite:500000});
  recusa(()=>lancar(r.id,{vencimento:'2026-02-30'}),'data_invalida','30 de fevereiro');
  recusa(()=>lancar(r.id,{vencimento:'amanha'}),'data_invalida','por extenso');
  recusa(()=>lancar(r.id,{vencimento:''}),'data_invalida','vazio');
  recusa(()=>bol('lancar',{revenda_id:r.id,numero:'  ',valor_centavos:1000,
    vencimento:'2026-12-31'},DIRETOR),'numero_obrigatorio','sem numero');
 }},

{nome:'4.13 — boleto sem revenda que exista e recusado',
 executar({recusa,db}){
  limpar(db);
  recusa(()=>lancar(99999,{}),'revenda_inexistente','revenda que nao existe');
 }},

{nome:'4.13 — o PEDIDO e opcional, e quando vem tem que ser DAQUELA revenda',
 executar({igual,recusa,db}){
  limpar(db);
  const a=revendaCom({limite:500000}), b=revendaCom({limite:500000});
  const p=aprovado(a.id);
  /* Nem todo titulo e de um pedido so — ha parcela e ha boleto de varios.
     Por isso o campo e opcional; o que nao pode e apontar o pedido de
     OUTRA revenda, que faria a conta de uma aparecer na carteira da outra. */
  const semPedido=lancar(a.id,{});
  igual(semPedido.pedido_id,null,'sem pedido, passa');
  const comPedido=lancar(a.id,{pedido_id:p.id});
  igual(comPedido.pedido_numero,pedido.porId(p.id).numero,'com pedido, ele e nomeado');
  recusa(()=>lancar(b.id,{pedido_id:p.id}),'pedido_de_outra_revenda','o pedido do vizinho');
 }},

{nome:'4.13 — o pedido tambem se aponta pelo NUMERO, que e o que quem lanca tem na mao',
 executar({igual,recusa,db}){
  limpar(db);
  const r=revendaCom({limite:500000});
  const p=aprovado(r.id);
  const num=pedido.porId(p.id).numero;
  /* O id e de banco e ninguem o le no papel do boleto. Resolver o numero no
     servidor evita a tela varrer /api/pedidos — o que pediria dela uma chave
     que quem lanca boleto pode nao ter, e daria 403 numa tela que abre. */
  igual(lancar(r.id,{pedido_numero:String(num)}).pedido_numero,num,'pelo numero');
  recusa(()=>lancar(r.id,{pedido_numero:'999999'}),'pedido_inexistente','numero que nao existe');
 }},

/* ═══ 4. APROVADO SEM BOLETO — e ele so vale para quem paga em boleto ════ */

{nome:'4.13 — "aprovado sem boleto" conta a parte, e NAO entra no disponivel',
 executar({igual,db}){
  limpar(db);
  const r=revendaCom({limite:500000, forma:'Boleto'});
  lancar(r.id,{valor_centavos:100000});
  aprovado(r.id);
  const c=bol('credito',r.id);
  /* A pergunta 6 da §8 responde "os dois, mostrados separados". Somar faria
     um numero so que nao e nem divida nem compromisso, e ninguem saberia o
     que ele e. */
  igual(c.valor_em_aberto_centavos,100000,'a divida e so o boleto');
  igual(c.valor_disponivel_centavos,400000,'e o disponivel nao mudou');
  igual(c.aprovados_sem_boleto,1,'o pedido aprovado e contado a parte');
  igual(c.valor_aprovado_sem_boleto_centavos>0,true,'com o valor dele ao lado');
 }},

{nome:'4.13 — quem paga em PIX ou CARTAO nao tem "aprovado sem boleto"',
 executar({igual,db}){
  limpar(db);
  const pix=revendaCom({limite:500000, forma:'PIX'});
  aprovado(pix.id);
  /* Dono, 26/09/2026: "nem todo pedido fazemos boleto — as vezes o cliente
     paga por pix, as vezes por cartao". Cobrar boleto de quem paga no PIX e
     aviso disparando no caso normal, e aviso assim some junto com a lista
     (armadilha #6). */
  igual(bol('credito',pix.id).aprovados_sem_boleto,null,
    'para quem nao paga em boleto a pergunta nem se faz');
 }},

{nome:'4.13 — o pedido que JA TEM boleto apontado sai do "sem boleto"',
 executar({igual,db}){
  limpar(db);
  const r=revendaCom({limite:500000, forma:'Boleto'});
  const p=aprovado(r.id);
  igual(bol('credito',r.id).aprovados_sem_boleto,1,'antes');
  lancar(r.id,{pedido_id:p.id});
  igual(bol('credito',r.id).aprovados_sem_boleto,0,'depois');
 }},

{nome:'4.13 — pedido ENVIADO e ORCAMENTO nao entram: eles ainda nao foram aceitos',
 executar({igual,db}){
  limpar(db);
  const b=cena();
  const r=revendaCom({limite:500000, forma:'Boleto'});
  const p=pedido.criar({revenda_id:r.id, tipo:'pedido'},DIRETOR);
  pedido.acrescentarItem(p.id,peca(b),DIRETOR);
  pedido.enviar(p.id,DIRETOR,'2026-09-22 10:00');
  igual(bol('credito',r.id).aprovados_sem_boleto,0,'enviado ainda espera o vendedor');
 }},

{nome:'4.13 — pedido CANCELADO nao entra no "sem boleto"',
 executar({igual,db}){
  limpar(db);
  const r=revendaCom({limite:500000, forma:'Boleto'});
  const p=aprovado(r.id);
  pedido.cancelar(p.id,'cliente desistiu',DIRETOR);
  igual(bol('credito',r.id).aprovados_sem_boleto,0,'cancelado nao e compromisso');
 }},

/* ═══ 5. A TAREFA SEMANAL — a carteira do vendedor ═══════════════════════ */

{nome:'4.13 — a carteira lista os em aberto das revendas DAQUELE vendedor',
 executar({igual,db}){
  limpar(db);
  const meu=revendaCom({limite:500000, vendedor:7});
  const dela=revendaCom({limite:500000, vendedor:8});
  lancar(meu.id,{valor_centavos:200000});
  lancar(dela.id,{valor_centavos:300000});
  const c=bol('carteira',RENATO);
  igual(c.revendas.length,1,'so a carteira dele');
  igual(c.revendas[0].revenda_id,meu.id,'a revenda dele');
  igual(c.valor_em_aberto_centavos,200000,'e a soma e so a dele');
 }},

{nome:'4.13 — quem aprova qualquer carteira ve a lista inteira',
 executar({igual,db}){
  limpar(db);
  const a=revendaCom({limite:500000, vendedor:7});
  const b=revendaCom({limite:500000, vendedor:8});
  lancar(a.id,{valor_centavos:200000});
  lancar(b.id,{valor_centavos:300000});
  const c=bol('carteira',DIRETOR);
  igual(c.revendas.length,2,'as duas');
  igual(c.valor_em_aberto_centavos,500000,'e a soma da casa');
 }},

{nome:'4.13 — a tarefa semanal vem por PRIORIDADE, e nao por ordem alfabetica',
 executar({igual,db}){
  limpar(db);
  /* Nomes escolhidos para que o alfabetico dê o contrario do certo: "AAA"
     esta em dia e "ZZZ" estourou. Alfabetico poria a que nao precisa de nada
     em cima — e quem le uma lista de trabalho le de cima para baixo. E a
     regra da tela azul do operador (§3) e do atrasado do Carregamento (#9). */
  const emDia=revendaCom({limite:900000}); 
  const estourada=revendaCom({limite:100000});
  const vencida=revendaCom({limite:900000});
  db.prepare('UPDATE sm_revenda SET nome_fantasia=? WHERE id=?').run('AAA em dia',emDia.id);
  db.prepare('UPDATE sm_revenda SET nome_fantasia=? WHERE id=?').run('ZZZ estourada',estourada.id);
  db.prepare('UPDATE sm_revenda SET nome_fantasia=? WHERE id=?').run('MMM vencida',vencida.id);
  lancar(emDia.id,{valor_centavos:10000});
  lancar(estourada.id,{valor_centavos:500000});
  lancar(vencida.id,{valor_centavos:20000, vencimento:dmenos(db,5)});
  const nomes=bol('carteira',DIRETOR).revendas.map(r=>r.revenda_nome);
  igual(nomes[0],'ZZZ estourada','a estourada primeiro');
  igual(nomes[1],'MMM vencida','depois a que tem vencido');
  igual(nomes[2],'AAA em dia','e a que esta em dia por ultimo');
 }},

{nome:'4.13 — revenda sem boleto em aberto NAO entra na tarefa semanal',
 executar({igual,db}){
  limpar(db);
  const a=revendaCom({limite:500000, vendedor:7});
  const b=revendaCom({limite:500000, vendedor:7});
  lancar(a.id,{valor_centavos:200000});
  /* Lista que traz quem nao tem nada a revisar e lista que ninguem le ate o
     fim — a mesma razao do card de caixa de varias pecas do §5. */
  igual(bol('carteira',RENATO).revendas.length,1,'so quem tem o que revisar');
 }},

/* ═══ 6. A JANELA — o dado velho tem que se denunciar ════════════════════ */

{nome:'4.13 — o credito diz DESDE QUANDO ninguem mexe nos boletos da revenda',
 executar({igual,db}){
  limpar(db);
  const r=revendaCom({limite:500000});
  igual(bol('credito',r.id).ultimo_movimento,null,'sem boleto nenhum, nao ha data');
  lancar(r.id,{});
  /* Numero sem a janela ao lado engana (armadilha #16 do §19). Aqui o modo
     de falhar e o OTIMISTA: ninguem lanca, e o disponivel fica igual ao
     limite — uma mentira que nao parece erro, porque o numero so fica maior. */
  igual(String(bol('credito',r.id).ultimo_movimento||'').slice(0,10),hoje(db),
    'lancou hoje, a data e de hoje');
 }},

/* ═══ 7. QUEM VE O QUE ═══════════════════════════════════════════════════ */

{nome:'4.13 — quem nao tem `custo.ver` NAO RECEBE os campos de dinheiro',
 executar({igual,db}){
  limpar(db);
  const r=revendaCom({limite:500000});
  lancar(r.id,{valor_centavos:200000});
  const c=bol('credito',r.id);
  /* A poda pergunta pelo PAPEL (nucleo/permissoes.js → pode), e nao por uma
     lista de chaves: quem monta o usuario e o portao do modulo. */
  const podado=custo.podar({papel:'producao'},c);
  /* A poda corta por PADRAO DE NOME (§19) — e por isso TODO campo de
     dinheiro daqui comeca com `valor_`. Um `em_aberto_centavos` nao casaria
     com o padrao e viajaria pelo fio em silencio, que foi como o
     `resumo.valor_parado` chegou a bancada. */
  igual(podado.valor_em_aberto_centavos,undefined,'o que ela deve nao viaja');
  igual(podado.valor_disponivel_centavos,undefined,'nem o disponivel');
  igual(podado.valor_limite_credito_centavos,undefined,'nem o limite');
  igual(podado.estourado,c.estourado,'mas a MARCA fica: ela nao e dinheiro');
  igual(custo.podar({papel:'vendedor'},c).valor_disponivel_centavos,
    c.valor_disponivel_centavos,'e quem tem a chave recebe tudo');
 }},

{nome:'4.13 — as duas chaves existem, e LER nao e EDITAR',
 executar({igual}){
  const {CHAVES,PAPEIS}=require('../nucleo/permissoes');
  const tem=k=>CHAVES.some(c=>c.chave===k);
  igual(tem('boleto.ler'),true,'ler existe');
  igual(tem('boleto.editar'),true,'editar existe');
  /* O vendedor faz a tarefa semanal da carteira dele, entao LE. Lancar e dar
     baixa e de quem responde pelo dinheiro — e hoje isso e o diretor, que
     recebe pelo `*`. O dia em que houver financeiro com login proprio, nasce
     a area; ate la, uma chave sem ninguem atras seria a divida 18. */
  igual(PAPEIS.vendedor.indexOf('boleto.ler')>=0,true,'o vendedor le');
  igual(PAPEIS.vendedor.indexOf('boleto.editar')<0,true,'e nao lanca nem baixa');
  igual(PAPEIS.cortador.indexOf('boleto.ler')<0,true,'e a bancada nao ve boleto');
 }},

/* ═══ 8. O SELO NO QUADRO ════════════════════════════════════════════════ */

{nome:'4.13 — o cartao do Quadro ganha o selo de CREDITO ESTOURADO',
 executar({igual,db}){
  limpar(db);
  const kanban=require('../dominio/kanban');
  const r=revendaCom({limite:100000, forma:'Boleto'});
  lancar(r.id,{valor_centavos:900000});
  const p=aprovado(r.id);
  const q=kanban.quadro();
  const achar=()=>{
    for(const col of q.colunas) for(const c of col.cartoes) if(c.pedido_id===p.id) return c;
    return null;
  };
  const cartao=achar();
  igual(!!cartao,true,'o cartao esta no quadro');
  igual((cartao.retido||[]).some(x=>/cr[ée]dito/i.test(x)),true,
    'com o selo — e a 6-A deixou o gancho escrito para isto');
 }},

{nome:'4.13 — cartao CANCELADO nao ganha selo de credito: ele nao espera nada',
 executar({igual,db}){
  limpar(db);
  const kanban=require('../dominio/kanban');
  const r=revendaCom({limite:100000, forma:'Boleto'});
  lancar(r.id,{valor_centavos:900000});
  const p=aprovado(r.id);
  pedido.cancelar(p.id,'cliente desistiu',DIRETOR);
  const q=kanban.quadro();
  for(const col of q.colunas) for(const c of col.cartoes)
    if(c.pedido_id===p.id) igual((c.retido||[]).length,0,'sem selo no morto');
 }},

{nome:'4.13 — sem limite lancado nao ha selo: nao se estoura o que nao existe',
 executar({igual,db}){
  limpar(db);
  const kanban=require('../dominio/kanban');
  const r=revendaCom({forma:'Boleto'});            // sem limite
  lancar(r.id,{valor_centavos:900000});
  const p=aprovado(r.id);
  const q=kanban.quadro();
  for(const col of q.colunas) for(const c of col.cartoes)
    if(c.pedido_id===p.id) igual((c.retido||[]).some(x=>/cr[ée]dito/i.test(x)),false,
      'revenda sem limite nao aparece estourada');
 }},

/* ═══ 9. A LISTA ═════════════════════════════════════════════════════════ */

{nome:'4.13 — a lista filtra por revenda e por situacao, e o vencido vem marcado',
 executar({igual,db}){
  limpar(db);
  const r=revendaCom({limite:500000});
  const b1=lancar(r.id,{valor_centavos:100000, vencimento:dmenos(db,5)});
  const b2=lancar(r.id,{valor_centavos:200000, vencimento:'2099-01-01'});
  bol('baixar',b2.id,{},DIRETOR);
  const abertos=bol('listar',{revenda_id:r.id, situacao:'aberto'});
  igual(abertos.length,1,'um em aberto');
  igual(abertos[0].id,b1.id,'o que nao foi pago');
  igual(abertos[0].vencido,true,'e ele esta vencido');
  igual(bol('listar',{revenda_id:r.id, situacao:'pago'}).length,1,'e um pago');
  igual(bol('listar',{revenda_id:r.id}).length,2,'sem filtro, os dois');
 }},

{nome:'4.13 — a lista nomeia a revenda e o pedido, nunca so o id',
 executar({igual,db}){
  limpar(db);
  const r=revendaCom({limite:500000});
  const p=aprovado(r.id);
  lancar(r.id,{pedido_id:p.id});
  const l=bol('listar',{revenda_id:r.id})[0];
  /* Id de banco em tela e o "— Correcao de contagem" do §2 outra vez. */
  igual(l.revenda_nome,revendas.porId(r.id).nome_fantasia,'o nome da revenda');
  igual(l.pedido_numero,pedido.porId(p.id).numero,'e o numero do pedido');
 }}

];
