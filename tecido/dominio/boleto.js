// O BOLETO E O CREDITO — dono unico (secao 4.13 da spec
// SOBMEDIDA-PEDIDO-REVENDA, fase 6-C1).
//
//   limite disponivel = limite − boletos em aberto
//
// ⚠️ MOSTRA, NAO TRAVA. Nao ha uma linha neste arquivo que recuse pedido por
// credito, e isso nao e esquecimento: e a decisao do dono de 22/09/2026, e o
// motivo esta na spec — nao se perde venda. O que o limite estourado muda e a
// COR: o selo no cartao do Quadro e a linha vermelha na carteira. Quem um dia
// quiser a trava tem que decidir isso com o dono, e a §4.13 avisa por que ela
// nao entra antes de a baixa estar sendo feita de verdade (armadilha #6).
//
// ⚠️ O TITULO E LANCADO, NAO GERADO. O boleto de verdade nasce no banco, com
// numero e codigo de barras proprios; um numero inventado aqui seria a segunda
// regua contra o extrato — e a que erra se descobre na cobranca de um cliente.
//
// ⚠️ E O MODO DE FALHAR DESTE DESENHO E O OTIMISTA. Se ninguem lancar, o "em
// aberto" fica zero e o disponivel fica igual ao limite: uma mentira que NAO
// PARECE ERRO, porque o numero so fica maior. Por isso `credito` devolve
// `ultimo_movimento` e a tela escreve desde quando ninguem mexe — numero sem a
// janela ao lado engana (armadilha #16 do §19).
//
// ⚠️ TODO CAMPO DE DINHEIRO DAQUI COMECA COM `valor_`. A poda do `custo.js`
// corta por PADRAO DE NOME, nao por lista: um `em_aberto_centavos` nao casaria
// com `preco|valor|custo|nf|fornecedor` e viajaria pelo fio para quem nao tem
// `custo.ver` — foi assim que o `resumo.valor_parado` do painel gerencial
// chegou a bancada (§19).
const d=require('../dados/boleto');
const dRevenda=require('../dados/revenda');
const db=require('../nucleo/db');
const dia=require('../nucleo/dia');
const prazo=require('./prazo');
const {ErroDeRegra,exigir}=require('../nucleo/erros');

const nome=usuario=>(usuario&&usuario.nome)||null;

const porId=id=>{
  const b=d.porId(id);
  exigir(b,'boleto_inexistente','Este boleto nao existe.');
  return b;
};

/* ── O LANCAMENTO ─────────────────────────────────────────────────────────
   ⚠️ NUMERO IMPOSSIVEL E RECUSADO DIZENDO O CAMPO, NUNCA CLAMPADO. Clampar em
   zero e apagar dinheiro em silencio, que e a armadilha #25 (§6) e a #33
   (§7-B) pela porta do boleto — e aqui o silencio custa o limite de alguem. */
function valorOuErro(v){
  const n=Number(String(v===undefined||v===null?'':v).replace(',','.'));
  exigir(isFinite(n)&&Number.isInteger(n)&&n>0,'valor_invalido',
    'O valor do boleto tem que ser centavo inteiro e maior que zero, e veio "'+v+'". '+
    'R$ 1.000,00 se escreve 100000.');
  return n;
}
function vencimentoOuErro(v){
  const data=prazo.dataValida(v);
  exigir(data,'data_invalida',
    'O vencimento tem que ser uma data que existe, no formato AAAA-MM-DD, e veio "'+
    (v===undefined||v===null?'':v)+'".');
  return data;
}

function lancar(dados,usuario){
  const x=dados||{};
  const rev=dRevenda.porId(x.revenda_id);
  exigir(rev,'revenda_inexistente','Revenda nao encontrada.');

  const numero=String(x.numero||'').trim();
  exigir(numero,'numero_obrigatorio',
    'Informe o numero do boleto — e por ele que se acha o titulo no banco.');

  const valor=valorOuErro(x.valor_centavos);
  const vencimento=vencimentoOuErro(x.vencimento);

  /* ⚠️ REPETIDO NA MESMA REVENDA E O MESMO TITULO LANCADO DUAS VEZES, e ele
     come o limite dela em dobro. O modo de falhar e PESSIMISTA: o vendedor
     para de vender achando que a revenda estourou, e ninguem procura o
     motivo num boleto a mais. Em outra revenda o mesmo numero passa — o
     numero e do banco dela, e dois bancos repetem numero sem erro nenhum. */
  exigir(!d.porNumero(rev.id,numero),'numero_repetido',
    'A revenda '+rev.nome_fantasia+' ja tem o boleto '+numero+' lancado. '+
    'Numero repetido come o limite dela duas vezes.');

  /* ⚠️ O NUMERO DO PEDIDO TAMBEM SERVE, e e o que quem lanca tem na mao: o
     id e de banco, e ninguem o le no papel do boleto. Resolver isso aqui
     evita a tela ter que varrer `/api/pedidos` — o que exigiria dela uma
     chave que quem lanca boleto pode nao ter, e daria 403 numa tela que abre
     (§10, armadilha #29). */
  let pedido_id=null;
  const temId=x.pedido_id!==undefined&&x.pedido_id!==null&&String(x.pedido_id)!=='';
  const temNum=x.pedido_numero!==undefined&&x.pedido_numero!==null&&String(x.pedido_numero).trim()!=='';
  if(temId||temNum){
    const p=temId
      ? db.prepare('SELECT id,revenda_id,numero FROM sm_pedido WHERE id=?').get(x.pedido_id)
      : db.prepare('SELECT id,revenda_id,numero FROM sm_pedido WHERE numero=?')
          .get(Number(String(x.pedido_numero).trim()));
    exigir(p,'pedido_inexistente','Este pedido nao existe.');
    /* Apontar o pedido do vizinho faria a conta de uma revenda aparecer na
       carteira da outra — e o vendedor cobraria quem nao deve. */
    exigir(p.revenda_id===rev.id,'pedido_de_outra_revenda',
      'O pedido '+p.numero+' nao e da '+rev.nome_fantasia+'.');
    pedido_id=p.id;
  }

  const emitido=x.emitido_em?prazo.dataValida(x.emitido_em):null;
  exigir(!(x.emitido_em&&!emitido),'data_invalida',
    'A data de emissao tem que existir, no formato AAAA-MM-DD.');

  return d.criar({revenda_id:rev.id, pedido_id, numero, valor_centavos:valor,
    vencimento, emitido_em:emitido,
    observacao:String(x.observacao||'').trim()||null,
    criado_por:nome(usuario)});
}

/* ── A BAIXA ──────────────────────────────────────────────────────────────
   ⚠️ BAIXAR DUAS VEZES E RECUSADO. Nao e preciosismo: a segunda baixa
   sobrescreveria quem deu a primeira, e o titulo passaria a dizer que foi
   baixado por quem so clicou de novo — o rastro viraria dois. */
function baixar(id,dados,usuario){
  const b=porId(id);
  exigir(!b.cancelado_em,'boleto_cancelado',
    'Este boleto foi cancelado em '+b.cancelado_em+' — nao ha o que baixar.');
  exigir(!b.pago_em,'boleto_pago',
    'Este boleto ja foi baixado por '+(b.pago_por||'alguem')+' em '+b.pago_em+'.');
  const quando=(dados&&dados.pago_em)?prazo.dataValida(dados.pago_em):null;
  exigir(!((dados&&dados.pago_em)&&!quando),'data_invalida',
    'A data do pagamento tem que existir, no formato AAAA-MM-DD.');
  return d.atualizar(b.id,{pago_em:quando||dia.agora(), pago_por:nome(usuario)});
}

/* ⚠️ A BAIXA SE DESFAZ, E COM MOTIVO. Baixa dada na linha errada acontece, e
   sem caminho de volta o jeito vira lancar o titulo de novo — que e numero
   repetido, e ai a conta dobra. Trava que sabe acusar e nao sabe liberar e
   trava que a equipe aprende a contornar (§5 do CLAUDE.md). */
function reabrir(id,motivo,usuario){
  const b=porId(id);
  exigir(!b.cancelado_em,'boleto_cancelado','Este boleto foi cancelado.');
  exigir(b.pago_em,'boleto_aberto','Este boleto ja esta em aberto.');
  const m=String(motivo||'').trim();
  exigir(m,'motivo_obrigatorio',
    'Diga por que a baixa esta sendo desfeita — desfazer sem motivo e so apagar.');
  return d.atualizar(b.id,{pago_em:null, pago_por:null,
    reaberto_em:dia.agora(), reaberto_por:nome(usuario), reaberto_motivo:m});
}

function cancelar(id,motivo,usuario){
  const b=porId(id);
  exigir(!b.cancelado_em,'boleto_cancelado','Este boleto ja estava cancelado.');
  const m=String(motivo||'').trim();
  exigir(m,'motivo_obrigatorio',
    'Diga por que o titulo saiu — cancelar sem motivo e apagar.');
  return d.atualizar(b.id,{cancelado_em:dia.agora(), cancelado_por:nome(usuario),
    cancelado_motivo:m});
}

/* ⚠️ O SQLite DEVOLVE 0 e 1, e a tela le booleano. Converter aqui, e nao em
   cada tela, e o que impede uma escrever `if(b.vencido)` e a outra
   `if(b.vencido===true)` — a segunda daria sempre falso. */
const listar=filtro=>d.listar(filtro).map(b=>Object.assign({},b,{vencido:!!b.vencido}));

/* ── O CREDITO ────────────────────────────────────────────────────────────
   A conta da §4.13, e as tres regras que ela carrega. */
function credito(revenda_id){
  const rev=dRevenda.porId(revenda_id);
  exigir(rev,'revenda_inexistente','Revenda nao encontrada.');
  const a=d.emAberto(rev.id);
  const limite=rev.valor_limite_credito_centavos;

  /* ⚠️ SEM LIMITE LANCADO NAO HA DISPONIVEL — e `null`, nunca zero e nunca
     "o que ela deve". E a regra 4 do custo (§7-B): numero indefinido nao vira
     numero certo. E nao se estoura um limite que nao existe. */
  const disponivel = limite===null||limite===undefined ? null : limite-a.valor;

  /* ⚠️ NEGATIVO FICA NEGATIVO. Zerar apagaria o TAMANHO do buraco: dois mil
     estourados e um real estourado ficariam iguais na tela. E o MAX(0, …) do
     saldo do PCP (§2) pela porta do credito, e a mesma regra do prazo vencido
     da fase 3. */

  /* ⚠️ "APROVADO SEM BOLETO" SO EXISTE PARA QUEM PAGA EM BOLETO. A fabrica
     recebe em PIX e cartao tambem (dono, 26/09/2026); cobrar titulo de quem
     paga no cartao e aviso disparando no caso normal, e aviso assim some
     junto com a lista inteira (armadilha #6). `null` aqui quer dizer "a
     pergunta nem se faz", que nao e zero. */
  const ehBoleto=/boleto/i.test(String(rev.forma_pagamento_nome||''));
  const ap=ehBoleto?d.aprovadosSemBoleto(rev.id):null;

  return {
    revenda_id:rev.id, revenda_nome:rev.nome_fantasia,
    vendedor_usuario_id:rev.vendedor_usuario_id, vendedor_nome:rev.vendedor_nome,
    forma_pagamento_nome:rev.forma_pagamento_nome||null,
    valor_limite_credito_centavos:limite===undefined?null:limite,
    limite_revisado_em:rev.limite_revisado_em||null,
    limite_vencido:!!rev.limite_vencido,
    em_aberto:a.quantos, valor_em_aberto_centavos:a.valor,
    vencidos:a.vencidos||0, valor_vencido_centavos:a.valor_vencido||0,
    valor_disponivel_centavos:disponivel,
    /* `estourado` NAO e dinheiro, e por isso o nome nao leva `valor_`: e a
       marca que sobrevive a poda e acende o selo para quem nao ve preco. */
    estourado: disponivel!==null && disponivel<0,
    aprovados_sem_boleto: ap?ap.quantos:null,
    valor_aprovado_sem_boleto_centavos: ap?ap.valor:null,
    ultimo_movimento:d.ultimoMovimento(rev.id)||null
  };
}

/* ── A TAREFA SEMANAL (secao 4.13) ────────────────────────────────────────
   "Tarefa semanal do vendedor com o financeiro: revisar os boletos em aberto
   da carteira. O sistema lista."

   ⚠️ QUEM APROVA QUALQUER CARTEIRA VE A LISTA INTEIRA. E a mesma regra da
   fila do vendedor da fase 3: a chave larga existe para a casa nao parar numa
   semana de ferias.

   ⚠️ E REVENDA SEM NADA EM ABERTO NAO ENTRA. Lista que traz quem nao tem o
   que revisar e lista que ninguem le ate o fim — a regra do card de caixa de
   varias pecas do §5. */
function carteira(usuario){
  const {pode}=require('../nucleo/permissoes');
  const tudo=pode(usuario,'pedido.aprovar_qualquer')||pode(usuario,'revenda.editar');
  const quem=tudo?undefined:(usuario&&usuario.id);
  /* ⚠️ A ORDEM E DE PRIORIDADE, NAO ALFABETICA — e isso so apareceu com a
     tela aberta. Alfabetico poe "CASA NOVA" em cima de quem estourou o
     limite, e quem le uma lista de trabalho le de cima para baixo: a revenda
     que precisa de ligacao hoje ficaria no meio. E a mesma regra da tela azul
     do operador (§3: "a ordem e de prioridade, nao de quantidade") e do
     atrasado que sai marcado e em cima no Carregamento (§5, #9).
     Desempata: estourado · mais vencido · mais em aberto · nome. */
  const revendas=d.revendasComAberto(quem).map(r=>credito(r.id)).sort((a,b)=>
    (b.estourado-a.estourado) ||
    (b.valor_vencido_centavos-a.valor_vencido_centavos) ||
    (b.valor_em_aberto_centavos-a.valor_em_aberto_centavos) ||
    String(a.revenda_nome).localeCompare(String(b.revenda_nome)));
  return {
    carteira_inteira:!!tudo,
    vendedor_usuario_id:tudo?null:(usuario&&usuario.id)||null,
    revendas,
    valor_em_aberto_centavos:revendas.reduce((s,r)=>s+r.valor_em_aberto_centavos,0),
    valor_vencido_centavos:revendas.reduce((s,r)=>s+r.valor_vencido_centavos,0),
    estouradas:revendas.filter(r=>r.estourado).length
  };
}

// As revendas estouradas, num conjunto — o selo do Quadro le daqui.
const estouradas=()=>d.estouradas();

module.exports={lancar,baixar,reabrir,cancelar,listar,porId,credito,carteira,estouradas};
