// O PEDIDO SOB MEDIDA — dono unico do ciclo (secoes 4.8, 4.9, 4.10, 4.11 e
// 4.18 da spec SOBMEDIDA-PEDIDO-REVENDA).
//
//   rascunho   se edita a vontade, e o preco lido e o de HOJE
//   enviado    numero, preco, tabela e prazo ficam GRAVADOS
//   aprovado   a ficha e explodida e gravada — e nada mais muda
//
// ⚠️ A FRASE QUE GOVERNA O ARQUIVO INTEIRO: CONGELADO E CONGELADO. Depois do
// envio nenhuma leitura volta ao catalogo ou ao cadastro da revenda. Um
// reajuste de terca nao pode mexer no que foi vendido na segunda — e a
// armadilha #15 do CLAUDE.md (preco no cadastro anda para tras) pela porta da
// venda. Depois da aprovacao nem a ficha se rele: a persiana e cortada como a
// etiqueta dela ja diz, e na bancada vence a etiqueta.
//
// ⚠️ ELE NAO CALCULA PERSIANA. Quem responde "o que esta persiana e, e quanto
// custa" e o dominio/persiana.js, e quem responde "quando fica pronta" e o
// dominio/prazo.js. Uma segunda conta aqui seria a armadilha #12: duas telas
// certas, cada uma na sua regua, com a bancada cortando por uma e a revenda
// cobrada pela outra.
const {ErroDeRegra,exigir}=require('../nucleo/erros');
const db=require('../nucleo/db');
const d=require('./../dados/pedido');
const dRevenda=require('../dados/revenda');
const dRolo=require('../dados/rolo');
const persiana=require('./persiana');
const prazo=require('./prazo');
const config=require('../nucleo/config');
const dia=require('../nucleo/dia');
const u=require('../nucleo/unidade');
const {pode}=require('../nucleo/permissoes');

const TIPOS=['orcamento','pedido'];
const ENTREGAS=['entrega','retira'];

/* As escolhas que descrevem UMA persiana. A lista e uma so para nao existir o
   campo que o acrescentar conhece e o editar esquece — foi assim que o
   `estoque` sumiu do POST /api/skus do PCP (armadilha #25). */
const ESCOLHAS=['modelo_id','abertura_id','cor_tecido_id','cor_acessorio_id',
  'largura_mm','altura_mm','comando','rolamento','adicional','reducao'];

const nome=usuario=>(usuario&&usuario.nome)||null;
const ativo=i=>!i.cancelado_em;

function pedidoOuErro(id){
  const p=d.porId(id);
  exigir(p,'pedido_inexistente','Este pedido nao existe.');
  return p;
}

/* ⚠️ CADA MARCO TEM A SUA RECUSA, com o nome do estado em que o pedido esta.
   "Nao pode" sem dizer o que esta acontecendo e o que faz a equipe procurar
   um caminho por fora (armadilha #6): quem le "pedido_aprovado" sabe que o
   caminho e cancelar o item e lancar outro; quem le "nao_permitido" liga
   para alguem. */
function exigirRascunho(p){
  if(p.marco==='aprovado') throw new ErroDeRegra('pedido_aprovado',
    'O pedido '+(p.numero||p.id)+' ja foi aprovado, e pedido aprovado nao se altera — nem pelo admin. '+
    'Para corrigir: cancele o item com o motivo e lance outro.');
  if(p.marco==='cancelado') throw new ErroDeRegra('pedido_cancelado',
    'O pedido '+(p.numero||p.id)+' foi cancelado em '+p.cancelado_em+'.');
  if(p.marco==='enviado') throw new ErroDeRegra('pedido_enviado',
    'O pedido '+(p.numero||p.id)+' ja foi enviado. Reabra antes de editar — a volta fica registrada, '+
    'e o reenvio recalcula preco e prazo.');
}

// ── O cabecalho ───────────────────────────────────────────────────────────
function camposCabecalho(dados,revenda){
  const fora={};
  if(dados.tipo!==undefined){
    exigir(TIPOS.includes(dados.tipo),'tipo_invalido','O pedido e "orcamento" ou "pedido".');
    fora.tipo=dados.tipo;
  }
  if(dados.entrega!==undefined&&dados.entrega!==null&&dados.entrega!==''){
    exigir(ENTREGAS.includes(dados.entrega),'entrega_invalida','A saida e "entrega" ou "retira".');
    fora.entrega=dados.entrega;
  }
  if(dados.observacao!==undefined) fora.observacao=dados.observacao==null?null:String(dados.observacao).trim();
  if(dados.endereco_entrega_id!==undefined){
    if(dados.endereco_entrega_id===null||dados.endereco_entrega_id==='') fora.endereco_entrega_id=null;
    else{
      const e=dRevenda.endereco(revenda.id,Number(dados.endereco_entrega_id));
      exigir(e,'endereco_de_outra_revenda',
        'Este endereco de entrega nao e desta revenda. A caixa iria para a porta errada.');
      fora.endereco_entrega_id=e.id;
    }
  }
  return fora;
}

function criar(dados,usuario){
  const dd=dados||{};
  const rev=dRevenda.porId(dd.revenda_id);
  exigir(rev,'revenda_inexistente','Escolha a revenda para quem este pedido e.');
  exigir(rev.ativo===1,'revenda_inativa',
    'A revenda "'+rev.nome_fantasia+'" esta desativada. Reative em Revendas antes de lancar para ela.');

  const campos=camposCabecalho(dd,rev);
  return db.transaction(()=>{
    const p=d.criar(Object.assign({
      revenda_id:rev.id, tipo:'orcamento', marco:'rascunho',
      entrega:rev.entrega, criado_por:nome(usuario)},campos));
    d.criarMarco({pedido_id:p.id, marco:'rascunho', detalhe:null, usuario_nome:nome(usuario)});
    return porId(p.id);
  })();
}

function editar(id,dados,usuario){
  const p=pedidoOuErro(id);
  exigirRascunho(p);
  const campos=camposCabecalho(dados||{},{id:p.revenda_id});
  /* ⚠️ A REVENDA NAO TROCA depois de criado, e isso e trava. Ela decide a
     tabela, o desconto, o endereco e a carteira: trocar no meio deixaria os
     itens lancados com o preco de uma e o dono de outra, sem nada em tela
     dizendo que houve troca. O caminho e criar outro pedido. */
  if(dados&&dados.revenda_id!==undefined&&Number(dados.revenda_id)!==p.revenda_id)
    throw new ErroDeRegra('revenda_nao_troca',
      'A revenda de um pedido nao se troca — ela decide tabela, desconto e carteira. Lance outro pedido.');
  d.atualizar(p.id,campos);
  return porId(p.id);
}

/* ⚠️ VIRAR PEDIDO E UM ATO PROPRIO, e nao um efeito do envio. Orcamento so
   simula (secao 4.10); transformar um em pedido e decisao comercial, e ela
   fica registrada com quem. E e isso que faz "orcamento nao queima numero"
   ser regra de verdade em vez de coincidencia: o numero nasce no envio, e o
   envio recusa quem ainda e orcamento. */
function virarPedido(id,usuario){
  const p=pedidoOuErro(id);
  exigirRascunho(p);
  if(p.tipo==='pedido') throw new ErroDeRegra('ja_e_pedido','Este ja e um pedido.');
  d.atualizar(p.id,{tipo:'pedido'});
  d.criarAlteracao({pedido_id:p.id,item_id:null,o_que:'tipo',antes:'orcamento',depois:'pedido',
    motivo:null,usuario_nome:nome(usuario)});
  return porId(p.id);
}

// ── Os itens ──────────────────────────────────────────────────────────────
/* Calcula a persiana E confere o que so o pedido exige. O simulador nao pede
   a cor do tecido porque ali ela so escreve o nome na frase; aqui ela decide
   QUAL rolo sai da prateleira, e nao se corta sem saber a cor. */
function calcularItem(escolha,revenda_id){
  exigir(escolha&&escolha.cor_tecido_id,'cor_tecido_obrigatoria',
    'Escolha a cor do tecido. No pedido ela nao e detalhe: e ela que diz qual rolo sai da prateleira.');
  const entrada={};
  for(const c of ESCOLHAS) entrada[c]=escolha[c];
  entrada.revenda_id=revenda_id;
  return persiana.calcular(entrada);
}

function gravarEscolhas(escolha,r){
  const fora={};
  for(const c of ESCOLHAS) fora[c]=escolha[c];
  fora.largura_mm=r.medida.largura_mm;
  fora.altura_mm=r.medida.altura_mm;
  fora.adicional=r.adicional;
  fora.reducao=r.reducao.aplicada?'pedida':'nao';
  fora.tecido_id=r.tecido_id;
  return fora;
}

function acrescentarItem(pedido_id,escolha,usuario){
  const p=pedidoOuErro(pedido_id);
  exigirRascunho(p);
  const r=calcularItem(escolha,p.revenda_id);
  return db.transaction(()=>{
    const item=d.criarItem(Object.assign({pedido_id:p.id, n:d.proximoN(p.id)},gravarEscolhas(escolha,r)));
    return item;
  })();
}

function editarItem(pedido_id,item_id,escolha,usuario){
  const p=pedidoOuErro(pedido_id);
  exigirRascunho(p);
  const item=d.item(p.id,item_id);
  exigir(item,'item_inexistente','Esta peca nao e deste pedido.');
  const r=calcularItem(escolha,p.revenda_id);
  d.atualizarItem(item.id,gravarEscolhas(escolha,r));
  return d.item(p.id,item.id);
}

function removerItem(pedido_id,item_id,usuario){
  const p=pedidoOuErro(pedido_id);
  exigirRascunho(p);
  const item=d.item(p.id,item_id);
  exigir(item,'item_inexistente','Esta peca nao e deste pedido.');
  /* ⚠️ APAGAR SO NO RASCUNHO QUE NUNCA FOI ENVIADO. Depois que o numero
     existe, a revenda ja tem a lista por escrito — a peca que sai de la sai
     CANCELADA, com motivo, e continua aparecendo. Sumir em silencio de uma
     lista que alguem imprimiu e o que faz a conferencia virar discussao. */
  exigir(!p.numero,'pedido_ja_numerado',
    'Este pedido ja foi enviado uma vez. A peca nao se apaga: cancele com o motivo, e ela fica na lista.');
  d.apagarItem(item.id);
  return {removido:true};
}

/* ⚠️ CANCELAR EXIGE MOTIVO, e o motivo e a peca de informacao, nao o
   formalismo. "Sumiu do pedido" sem por que vira ligacao para o vendedor
   semanas depois, quando ninguem lembra. */
function cancelarItem(pedido_id,item_id,motivo,usuario){
  const p=pedidoOuErro(pedido_id);
  if(p.marco==='cancelado') throw new ErroDeRegra('pedido_cancelado','Este pedido ja foi cancelado inteiro.');
  const item=d.item(p.id,item_id);
  exigir(item,'item_inexistente','Esta peca nao e deste pedido.');
  exigir(!item.cancelado_em,'item_cancelado','Esta peca ja estava cancelada.');
  const m=String(motivo||'').trim();
  exigir(m,'motivo_obrigatorio','Diga por que esta peca saiu — cancelar sem motivo e apagar.');
  return db.transaction(()=>{
    d.atualizarItem(item.id,{cancelado_em:dia.agora(),cancelado_por:nome(usuario),cancelado_motivo:m});
    d.criarAlteracao({pedido_id:p.id,item_id:item.id,o_que:'peca cancelada',
      antes:item.resumo||('peca '+item.n),depois:null,motivo:m,usuario_nome:nome(usuario)});
    return porId(p.id);
  })();
}

// ── O tecido esta na fabrica? ─────────────────────────────────────────────
/* ⚠️ SINAL, NUNCA TRAVA (secao 4.10). O pedido de um tecido que nao esta na
   estante entra normalmente, marcado, e o vendedor negocia prazo maior — e a
   peca entra na necessidade de compra. Travar aqui seria a armadilha #6: a
   venda existe, e quem e recusado vende por fora.
//
   ⚠️ E ELE NAO E A RESPOSTA DO PLANO DE CORTE. Quem decide de onde a peca
   sai, entre rolo e sobra, e o plano — aqui a pergunta e mais grossa: "ha
   bobina deste tecido, larga o bastante?". Falso alarme custa uma conversa;
   por isso ele nunca segura nada. */
function conferirTecido(r){
  if(!r.tecido_id) return {sem:1, motivo:'A cor do tecido nao foi resolvida no cadastro.'};
  const tec=(r.componentes||[]).find(c=>c.chave==='tecido');
  const precisa=tec&&tec.largura_corte_mm!=null?tec.largura_corte_mm/1000:0;
  const rolos=dRolo.disponiveis(r.tecido_id);
  if(!rolos.length)
    return {sem:1, motivo:'Nao ha rolo deste tecido na estante. O pedido entra; o vendedor negocia o prazo.'};
  const larga=rolos.reduce((a,b)=>b.largura>a?b.largura:a,0);
  if(larga<precisa-0.001)
    return {sem:1, motivo:'O corte pede '+u.emMetros(tec.largura_corte_mm)+' de largura, e a bobina mais '+
      'larga na estante tem '+larga.toFixed(3).replace('.',',')+'. Nao ha emenda.'};
  return {sem:0, motivo:null};
}

// ── O ENVIO — e aqui que tudo congela ─────────────────────────────────────
/* ⚠️ O NUMERO INICIAL EM BRANCO RECUSA O ENVIO (secao 4.18). Em branco e
   "ainda nao se sabe"; um default chutado faria o numero parecer decidido, e
   o plano de corte agrupa o tom unico pelo TEXTO do pedido olhando para tras
   — um 4272 novo colado num 4272 do Decorsoft herdaria o tom de outra casa, e
   a persiana sairia de um rolo escolhido para outro cliente. */
function numeroInicial(){
  const bruto=String(config.ler('pedidoNumeroInicial')||'').trim();
  exigir(bruto,'numero_inicial_em_branco',
    'Antes do primeiro envio, lance em Parametros o ultimo numero de pedido do Decorsoft. '+
    'Sem ele a numeracao daqui comecaria em cima da de la, e o plano de corte herdaria o tom de outra casa.');
  const n=Number(bruto);
  exigir(isFinite(n)&&Number.isInteger(n)&&n>=0,'numero_inicial_invalido',
    'O ultimo numero do Decorsoft tem que ser um inteiro, e esta lancado como "'+bruto+'".');
  return n;
}

/* ⚠️ NUNCA DESCE. Quem manda e o MAIOR entre o parametro e o que ja foi
   usado: baixar o parametro (por engano, ou porque o Decorsoft foi desligado)
   nao pode fazer a numeracao voltar por cima de pedido que existe. */
const proximoNumero=()=>Math.max(d.maiorNumero(),numeroInicial())+1;

function enviar(id,usuario,quando){
  const p=pedidoOuErro(id);
  if(p.marco==='enviado') throw new ErroDeRegra('pedido_enviado','Este pedido ja foi enviado.');
  exigirRascunho(p);
  exigir(p.tipo==='pedido','ainda_e_orcamento',
    'Isto ainda e um orcamento: ele so simula o preco de hoje. Transforme em pedido primeiro — '+
    'e ai o preco e o prazo congelam.');

  const itens=d.itens(p.id).filter(ativo);
  exigir(itens.length,'pedido_vazio','Acrescente ao menos uma persiana antes de enviar.');

  const rev=dRevenda.porId(p.revenda_id);
  const numero=p.numero||proximoNumero();

  // 1. calcula tudo ANTES de gravar qualquer coisa: recusa nao deixa meio
  //    pedido enviado, e nao queima numero.
  const calculados=[], falta=[];
  for(const item of itens){
    const r=calcularItem(item,p.revenda_id);
    const pr=r.preco.revenda;
    for(const f of (pr?pr.sem_preco:r.preco.sem_preco))
      if(!falta.includes(f)) falta.push(f);
    calculados.push({item,r,tecido:conferirTecido(r)});
  }

  /* ⚠️ CUSTO INDEFINIDO NUNCA VIRA ZERO (regra 4), e congelar um total que
     nao existe seria gravar zero com cara de preco. A recusa NOMEIA o que
     falta — no simulador isso e um aviso em ambar, aqui e uma trava, porque
     do envio em diante o numero vira compromisso com a revenda. */
  exigir(!falta.length,'sem_preco',
    'Nao da para congelar o preco deste pedido. Falta lancar: '+falta.join(', ')+'.');

  const momento=quando||dia.agora();
  const pr=prazo.calcular(momento);

  return db.transaction(()=>{
    let semTecido=0;
    for(const {item,r,tecido} of calculados){
      d.atualizarItem(item.id,Object.assign(gravarEscolhas(item,r),{
        degrau_nome:r.degrau.nome,
        m2_real_mm2:r.preco.m2_real_mm2, m2_cobrado_mm2:r.preco.m2_cobrado_mm2,
        valor_subtotal_centavos:r.preco.valor_subtotal_centavos,
        valor_final_centavos:r.preco.revenda?r.preco.revenda.valor_final_centavos:null,
        resumo:r.resumo, sem_tecido:tecido.sem, sem_tecido_motivo:tecido.motivo}));
      d.apagarLinhas(item.id);
      r.preco.linhas.forEach((l,i)=>d.criarLinha({item_id:item.id, ordem:i+1,
        chave:l.chave, nome:l.nome, unidade:l.unidade,
        preco_unitario_centavos:l.preco_unitario_centavos, base:l.base,
        valor_centavos:l.valor_centavos}));
      if(tecido.sem) semTecido=1;
    }

    /* ⚠️ O TOTAL E A SOMA DAS PECAS, e o arredondamento mora na peca. Cada
       persiana ja saiu arredondada uma vez (secao 4.1), e e o valor dela que
       a revenda ve linha a linha no PDF — somar os arredondados e o unico
       jeito de o total da folha fechar com as parcelas impressas nela. */
    const total=calculados.reduce((s,c)=>s+(c.r.preco.valor_subtotal_centavos||0),0);
    d.atualizar(p.id,{
      marco:'enviado', numero,
      enviado_em:momento, enviado_por:nome(usuario),
      tabela_id:rev.tabela_id, tabela_nome:rev.tabela_nome,
      tabela_desconto_centesimos:rev.tabela_desconto_centesimos,
      desconto_centesimos:rev.desconto_centesimos,
      valor_total_centavos:total,
      prazo_prometido:pr.entrega, prazo_atual:pr.entrega,
      sem_tecido:semTecido});
    d.criarMarco({pedido_id:p.id, marco:'enviado',
      detalhe:'pedido '+numero+' · '+u.emReais(total)+' · pronto '+pr.entrega_extenso,
      usuario_nome:nome(usuario)});
    return porId(p.id);
  })();
}

/* ⚠️ O NUMERO FICA. Reabrir devolve o pedido ao rascunho e apaga o que estava
   congelado — menos o numero, que ja foi dito a revenda por escrito. Numero
   que volta para o bolo e numero que um dia sai duas vezes. */
function reabrir(id,motivo,usuario){
  const p=pedidoOuErro(id);
  if(p.marco==='aprovado') throw new ErroDeRegra('pedido_aprovado',
    'Pedido aprovado nao se reabre — nem pelo admin. Cancele o item com o motivo e lance outro.');
  if(p.marco==='cancelado') throw new ErroDeRegra('pedido_cancelado','Este pedido foi cancelado.');
  exigir(p.marco==='enviado','pedido_rascunho','Este pedido ja esta em rascunho.');
  const m=String(motivo||'').trim();
  exigir(m,'motivo_obrigatorio','Diga por que o pedido voltou — a revenda ja tinha o preco e a data.');
  return db.transaction(()=>{
    d.atualizar(p.id,{marco:'rascunho', enviado_em:null, enviado_por:null,
      tabela_id:null, tabela_nome:null, tabela_desconto_centesimos:null,
      desconto_centesimos:null, valor_total_centavos:null,
      prazo_prometido:null, prazo_atual:null});
    d.criarMarco({pedido_id:p.id, marco:'rascunho', detalhe:m, usuario_nome:nome(usuario)});
    return porId(p.id);
  })();
}

// ── A APROVACAO — e aqui que a ficha explode ──────────────────────────────
/* ⚠️ QUEM APROVA E O VENDEDOR DA CARTEIRA (secao 4.12), e a excecao e por
   CHAVE, nao por cargo escrito num if: `pedido.aprovar_qualquer` existe para
   a fila nao parar em ferias. Revenda sem vendedor apontado tambem cai na
   chave — sem dono, quem decide e quem responde pela casa. */
function exigirCarteira(p,usuario){
  if(pode(usuario,'pedido.aprovar_qualquer')) return;
  exigir(p.vendedor_usuario_id,'revenda_sem_vendedor',
    'A revenda "'+p.revenda_nome+'" nao tem vendedor apontado. Quem aprova, entao, e a chefia.');
  exigir(usuario&&Number(usuario.id)===Number(p.vendedor_usuario_id),'carteira_de_outro',
    'A revenda "'+p.revenda_nome+'" e da carteira de '+p.vendedor_nome+'.');
}

function aprovar(id,usuario){
  const p=pedidoOuErro(id);
  if(p.marco==='aprovado') throw new ErroDeRegra('pedido_aprovado','Este pedido ja foi aprovado.');
  if(p.marco==='cancelado') throw new ErroDeRegra('pedido_cancelado','Este pedido foi cancelado.');
  exigir(p.marco==='enviado','pedido_rascunho','So se aprova pedido enviado.');
  exigirCarteira(p,usuario);

  const itens=d.itens(p.id).filter(ativo);
  exigir(itens.length,'pedido_vazio','Todas as pecas deste pedido foram canceladas.');

  // Calcula tudo antes de gravar — recusa nao deixa meia ficha explodida.
  const explodidos=itens.map(item=>({item, r:calcularItem(item,p.revenda_id)}));

  return db.transaction(()=>{
    for(const {item,r} of explodidos){
      /* ⚠️ O TUBO QUE MUDOU ENTRE O ENVIO E A APROVACAO DEIXA LINHA, em vez
         de silencio. O preco congelou no envio e a ficha congela aqui (as
         duas datas sao da spec, 4.8 e 4.11); se alguem mexeu na escada no
         meio, a fabrica vai cortar um tubo diferente do que foi vendido. E
         evento raro e caro — o tipo de coisa que ninguem procura depois se
         nao estiver escrito. */
      if(item.degrau_nome&&item.degrau_nome!==r.degrau.nome)
        d.criarAlteracao({pedido_id:p.id, item_id:item.id, o_que:'degrau',
          antes:item.degrau_nome, depois:r.degrau.nome,
          motivo:'a escada de tubos mudou entre o envio e a aprovacao',
          usuario_nome:nome(usuario)});

      d.apagarComponentes(item.id);
      r.componentes.forEach((c,i)=>d.criarComponente({item_id:item.id, ordem:i+1,
        chave:c.chave, nome:c.nome, setor:c.setor, quantidade:c.quantidade,
        gera_etiqueta:c.gera_etiqueta?1:0, eh_kit:c.eh_kit?1:0,
        codigo_barras:c.codigo_barras,
        suportes:(r.kit&&r.kit.chave===c.chave)?r.kit.suportes:null,
        largura_corte_mm:c.largura_corte_mm, altura_corte_mm:c.altura_corte_mm,
        consumo_largura_mm:c.consumo_largura_mm, consumo_altura_mm:c.consumo_altura_mm}));
    }
    d.atualizar(p.id,{marco:'aprovado', aprovado_em:dia.agora(), aprovado_por:nome(usuario)});
    d.criarMarco({pedido_id:p.id, marco:'aprovado', detalhe:null, usuario_nome:nome(usuario)});
    return porId(p.id);
  })();
}

function cancelar(id,motivo,usuario){
  const p=pedidoOuErro(id);
  if(p.marco==='cancelado') throw new ErroDeRegra('pedido_cancelado','Este pedido ja foi cancelado.');
  const m=String(motivo||'').trim();
  exigir(m,'motivo_obrigatorio','Diga por que o pedido foi cancelado.');
  return db.transaction(()=>{
    d.atualizar(p.id,{marco:'cancelado', cancelado_em:dia.agora(),
      cancelado_por:nome(usuario), cancelado_motivo:m});
    d.criarMarco({pedido_id:p.id, marco:'cancelado', detalhe:m, usuario_nome:nome(usuario)});
    return porId(p.id);
  })();
}

// ── O PRAZO NEGOCIADO ─────────────────────────────────────────────────────
/* ⚠️ NAO APAGA O PROMETIDO (secao 4.9). O gerencial precisa dos dois: com um
   numero so, o pedido empurrado tres vezes pareceria entregue em dia, e a
   fabrica nunca saberia que atrasa. */
function negociarPrazo(id,dados,usuario){
  const p=pedidoOuErro(id);
  exigir(p.prazo_prometido,'sem_prazo',
    'Este pedido ainda nao foi enviado, entao nao ha prazo prometido para renegociar.');
  const m=String((dados&&dados.motivo)||'').trim();
  exigir(m,'motivo_obrigatorio',
    'Diga por que a data mudou — prazo que anda sem motivo vira ligacao da revenda para o vendedor.');
  const para=prazo.dataValida((dados&&dados.para)||'');
  exigir(para,'data_invalida','Informe a data nova no formato AAAA-MM-DD, e uma data que exista.');
  return db.transaction(()=>{
    d.criarPrazo({pedido_id:p.id, de:p.prazo_atual, para, motivo:m, usuario_nome:nome(usuario)});
    d.atualizar(p.id,{prazo_atual:para});
    return porId(p.id);
  })();
}

// ── A LEITURA ─────────────────────────────────────────────────────────────
const congelado=p=>p.marco==='enviado'||p.marco==='aprovado';

/* Um item lido. No rascunho o preco e o de HOJE — orcamento e "preco atual,
   sem congelar" (secao 4.10), e gravar um numero no rascunho faria o
   orcamento envelhecer calado: a pessoa abriria amanha e leria o de ontem com
   cara de atual. Do envio em diante sai o que esta gravado, e so ele. */
function lerItem(p,item){
  const comum={id:item.id, n:item.n, cancelado_em:item.cancelado_em,
    cancelado_por:item.cancelado_por, cancelado_motivo:item.cancelado_motivo,
    tecido_id:item.tecido_id, sem_tecido:item.sem_tecido, sem_tecido_motivo:item.sem_tecido_motivo};
  for(const c of ESCOLHAS) comum[c]=item[c];

  if(congelado(p)) return Object.assign(comum,{
    degrau_nome:item.degrau_nome,
    m2_real_mm2:item.m2_real_mm2, m2_cobrado_mm2:item.m2_cobrado_mm2,
    m2_real:u.emM2(item.m2_real_mm2), m2_cobrado:u.emM2(item.m2_cobrado_mm2),
    valor_subtotal_centavos:item.valor_subtotal_centavos,
    valor_subtotal:u.emReais(item.valor_subtotal_centavos),
    valor_final_centavos:item.valor_final_centavos,
    valor_final:u.emReais(item.valor_final_centavos),
    resumo:item.resumo,
    linhas:d.linhas(item.id),
    componentes:d.componentes(item.id),
    sem_preco:[]});

  let r=null, erro=null;
  try{ r=calcularItem(item,p.revenda_id); }catch(e){ erro=e.mensagem||e.message; }
  if(!r) return Object.assign(comum,{erro, linhas:[], componentes:[], sem_preco:['a peca nao calcula']});
  const pr=r.preco.revenda;
  return Object.assign(comum,{
    degrau_nome:r.degrau.nome,
    m2_real_mm2:r.preco.m2_real_mm2, m2_cobrado_mm2:r.preco.m2_cobrado_mm2,
    m2_real:r.preco.m2_real, m2_cobrado:r.preco.m2_cobrado,
    valor_subtotal_centavos:r.preco.valor_subtotal_centavos,
    valor_subtotal:r.preco.valor_subtotal,
    valor_final_centavos:pr?pr.valor_final_centavos:null,
    valor_final:pr?pr.valor_final:null,
    resumo:r.resumo, avisos:r.avisos,
    linhas:r.preco.linhas,
    componentes:[],                       // a ficha so existe a partir da aprovacao
    sem_preco:pr?pr.sem_preco:r.preco.sem_preco});
}

function lerPrazo(p){
  if(!p.prazo_prometido) return null;
  const hist=d.prazos(p.id);
  return {
    prometido:p.prazo_prometido, prometido_extenso:prazo.porExtenso(p.prazo_prometido),
    atual:p.prazo_atual, atual_extenso:prazo.porExtenso(p.prazo_atual),
    negociado:p.prazo_atual!==p.prazo_prometido,
    dias_uteis_restantes:prazo.diasUteis(dia.hoje(),p.prazo_atual),
    historico:hist};
}

function porId(id){
  const p=d.porId(id);
  if(!p) return null;
  const itens=d.itens(p.id).map(i=>lerItem(p,i));
  const vivos=itens.filter(i=>!i.cancelado_em);

  const total=vivos.reduce((s,i)=>s+(i.valor_subtotal_centavos||0),0);
  const temTudo=!vivos.some(i=>i.valor_subtotal_centavos==null);
  const totalRev=vivos.reduce((s,i)=>s+(i.valor_final_centavos||0),0);
  const temRev=vivos.length>0&&!vivos.some(i=>i.valor_final_centavos==null);
  const falta=[];
  for(const i of vivos) for(const f of (i.sem_preco||[])) if(!falta.includes(f)) falta.push(f);

  return {
    id:p.id, numero:p.numero, tipo:p.tipo, marco:p.marco, congelado:congelado(p),
    revenda:{id:p.revenda_id, nome_fantasia:p.revenda_nome,
             vendedor_usuario_id:p.vendedor_usuario_id, vendedor_nome:p.vendedor_nome},
    entrega:p.entrega, endereco_entrega_id:p.endereco_entrega_id, observacao:p.observacao,
    sem_tecido:p.sem_tecido,
    enviado_em:p.enviado_em, enviado_por:p.enviado_por,
    aprovado_em:p.aprovado_em, aprovado_por:p.aprovado_por,
    cancelado_em:p.cancelado_em, cancelado_por:p.cancelado_por, cancelado_motivo:p.cancelado_motivo,
    criado_em:p.criado_em, criado_por:p.criado_por,
    itens,
    preco:{
      tabela:p.tabela_id==null?null:{id:p.tabela_id, nome:p.tabela_nome,
        desconto_centesimos:p.tabela_desconto_centesimos,
        desconto:u.emPercentual(p.tabela_desconto_centesimos)},
      desconto_centesimos:p.desconto_centesimos,
      desconto:u.emPercentual(p.desconto_centesimos),
      /* ⚠️ O TOTAL E SEMPRE A SOMA DAS PECAS QUE CONTINUAM DE PE; a coluna
         guarda o que o ENVIO prometeu. Os dois aparecem lado a lado quando
         divergem — e a mesma forma do prazo prometido x atual. Um numero so
         faria a peca cancelada sumir da lista e continuar no total, ou o
         contrario: o total baixar sem nada dizer que a revenda recebeu outro
         por escrito. */
      valor_total_centavos:temTudo?total:null, valor_total:temTudo?u.emReais(total):null,
      valor_piso_centavos:total, valor_piso:u.emReais(total),
      valor_revenda_centavos:temRev?totalRev:null, valor_revenda:temRev?u.emReais(totalRev):null,
      valor_enviado_centavos:p.valor_total_centavos,
      valor_enviado:u.emReais(p.valor_total_centavos),
      mudou_depois_do_envio:p.valor_total_centavos!=null&&p.valor_total_centavos!==total,
      sem_preco:falta},
    prazo:lerPrazo(p),
    marcos:d.marcos(p.id), alteracoes:d.alteracoes(p.id)
  };
}

function listar(filtro){
  return d.listar(filtro).map(p=>({
    id:p.id, numero:p.numero, tipo:p.tipo, marco:p.marco,
    revenda_id:p.revenda_id, revenda_nome:p.revenda_nome,
    vendedor_usuario_id:p.vendedor_usuario_id, vendedor_nome:p.vendedor_nome,
    enviado_em:p.enviado_em, aprovado_em:p.aprovado_em,
    valor_total_centavos:p.valor_total_centavos, valor_total:u.emReais(p.valor_total_centavos),
    prazo_prometido:p.prazo_prometido, prazo_atual:p.prazo_atual,
    prazo_extenso:p.prazo_atual?prazo.porExtenso(p.prazo_atual):null,
    dias_uteis_restantes:p.prazo_atual?prazo.diasUteis(dia.hoje(),p.prazo_atual):null,
    sem_tecido:p.sem_tecido, criado_em:p.criado_em
  }));
}

/* A FILA DO VENDEDOR: o que esta esperando a aprovacao DELE. Quem tem
   `pedido.aprovar_qualquer` ve a fila inteira — e a mesma chave que deixa a
   chefia destravar a fila quando o vendedor esta de ferias. */
function fila(usuario){
  const f={marco:'enviado'};
  if(!pode(usuario,'pedido.aprovar_qualquer')) f.vendedor_usuario_id=usuario&&usuario.id;
  return listar(f);
}

module.exports={criar,editar,virarPedido,
  acrescentarItem,editarItem,removerItem,cancelarItem,
  enviar,reabrir,aprovar,cancelar,negociarPrazo,
  porId,listar,fila,proximoNumero,TIPOS,ESCOLHAS};
