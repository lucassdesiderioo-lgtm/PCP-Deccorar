// DUAS PESSOAS NA BAIXA DE BOLETO E NO DESCARTE DE SOBRA.
//
// Fase 6 da spec ACESSOS-UNIFICADOS (resposta P2 do dono, 21/10/2026): "quem
// pede nao aprova" vale tambem aqui, como no ajuste de estoque do PCP (§18,
// R-EST-18) e na correcao de corte deste modulo. Quem pede nao aprova o
// proprio pedido, nem o Admin Geral.
//
// ⚠️ ESTE ARQUIVO NAO BAIXA NEM DESCARTA NADA SOZINHO. O efeito continua com
// o dono de sempre — `boleto.baixar` e `sobra.descartar` —, chamado so na
// aprovacao. Pedir grava uma linha e mais nada: o boleto continua em aberto
// (comendo o limite) e a sobra continua disponivel (e no plano de corte).
//
// ⚠️ A REGRA E POR PESSOA (o id do PCP), E NAO POR NOME. Dois "Lucas" sao
// duas pessoas; comparar o nome deixaria o homonimo de fora e, pior, um nome
// trocado no cadastro abriria a porta. Sem id dos dois lados (pedido antigo,
// usuario de teste), cai para o nome — que e o que a correcao de corte faz.
const db=require('../nucleo/db');
const dia=require('../nucleo/dia');
const {exigir}=require('../nucleo/erros');
const boleto=require('./boleto');
const sobra=require('./sobra');
const prazo=require('./prazo');

const TIPOS={ baixa_boleto:'baixa de boleto', descarte_sobra:'descarte de sobra' };

const linha=id=>{
  const a=db.prepare('SELECT * FROM sm_aprovacao WHERE id=?').get(Number(id));
  exigir(a,'aprovacao_inexistente','Este pedido de aprovação não existe.');
  return a;
};
const decorar=a=>a?{...a, dados:a.dados?JSON.parse(a.dados):{}}:a;
const porId=id=>decorar(linha(id));

const pendenteDe=(tipo,alvo)=>db.prepare(
  "SELECT * FROM sm_aprovacao WHERE tipo=? AND alvo_id=? AND status='pendente'").get(tipo,Number(alvo));

function semOutroPendente(tipo,alvo){
  const p=pendenteDe(tipo,alvo);
  exigir(!p,'pedido_pendente','Já existe um pedido de '+TIPOS[tipo]+' esperando aprovação, feito por '+
    (p&&p.pedido_por||'alguém')+' em '+(p&&String(p.pedido_em).slice(0,16))+'. Espere a decisão.');
}

function gravar(tipo,alvo,dados,motivo,usuario){
  const info=db.prepare(`INSERT INTO sm_aprovacao(tipo,alvo_id,dados,motivo,pedido_por,pedido_por_id)
    VALUES(?,?,?,?,?,?)`).run(tipo,Number(alvo),JSON.stringify(dados||{}),motivo||null,
    (usuario&&usuario.nome)||null,(usuario&&usuario.id!=null)?Number(usuario.id):null);
  return porId(info.lastInsertRowid);
}

/* ── PEDIR ────────────────────────────────────────────────────────────────
   O que nao poderia ser feito e recusado JA NO PEDIDO, com a mesma frase do
   dono do efeito: o pedido nao vira fila de coisa impossivel esperando
   alguem recusar. */
function pedirBaixa(boletoId,dados,usuario){
  const b=boleto.porId(boletoId);
  exigir(!b.cancelado_em,'boleto_cancelado',
    'Este boleto foi cancelado em '+b.cancelado_em+' — não há o que baixar.');
  exigir(!b.pago_em,'boleto_pago',
    'Este boleto já foi baixado por '+(b.pago_por||'alguém')+' em '+b.pago_em+'.');
  const quando=(dados&&dados.pago_em)?prazo.dataValida(dados.pago_em):null;
  exigir(!((dados&&dados.pago_em)&&!quando),'data_invalida',
    'A data do pagamento tem que existir, no formato AAAA-MM-DD.');
  semOutroPendente('baixa_boleto',b.id);
  return gravar('baixa_boleto',b.id,quando?{pago_em:quando}:{},null,usuario);
}

function pedirDescarte(sobraId,motivo,usuario){
  const s=sobra.porId(sobraId);
  exigir(s,'sobra_inexistente','Sobra não encontrada.');
  exigir(s.status==='disponivel','sobra_indisponivel','A sobra '+s.codigo+' já está como "'+s.status+'".');
  const texto=String(motivo||'').trim();
  exigir(texto,'motivo_obrigatorio','Diga por que esta sobra está sendo descartada.');
  semOutroPendente('descarte_sobra',s.id);
  return gravar('descarte_sobra',s.id,{},texto,usuario);
}

/* ── DECIDIR ──────────────────────────────────────────────────────────── */
function pendente(id){
  const a=linha(id);
  exigir(a.status==='pendente','aprovacao_decidida','Este pedido já foi '+
    (a.status==='aprovado'?'aprovado':'recusado')+' por '+(a.decidido_por||'alguém')+'.');
  return a;
}

const mesmaPessoa=(a,usuario)=>{
  if(a.pedido_por_id!=null && usuario && usuario.id!=null) return Number(a.pedido_por_id)===Number(usuario.id);
  return !!(a.pedido_por && usuario && usuario.nome &&
    a.pedido_por.trim().toUpperCase()===String(usuario.nome).trim().toUpperCase());
};

function aprovar(id,usuario){
  const a=pendente(id);
  exigir(!mesmaPessoa(a,usuario),'mesma_pessoa','Você pediu esta '+TIPOS[a.tipo]+
    ' — quem aprova é outra pessoa.');
  const quemPediu={id:a.pedido_por_id, nome:a.pedido_por};
  return db.transaction(()=>{
    /* O efeito e refeito AGORA pelo dono dele, com as guardas dele: entre
       pedir e aprovar o boleto pode ter sido baixado ou cancelado, e a sobra
       pode ter ido para um corte. Recusado, o pedido continua pendente e
       espera alguem recusar com motivo. */
    if(a.tipo==='baixa_boleto') boleto.baixar(a.alvo_id,JSON.parse(a.dados||'{}'),quemPediu);
    else if(a.tipo==='descarte_sobra') sobra.descartar(a.alvo_id,a.motivo,a.pedido_por);
    else exigir(false,'tipo_desconhecido','Tipo de pedido desconhecido.');
    db.prepare(`UPDATE sm_aprovacao SET status='aprovado', decidido_por=?, decidido_por_id=?, decidido_em=?
      WHERE id=?`).run((usuario&&usuario.nome)||null,(usuario&&usuario.id!=null)?Number(usuario.id):null,dia.agora(),a.id);
    return porId(a.id);
  })();
}

function recusar(id,motivo,usuario){
  const a=pendente(id);
  const t=String(motivo||'').trim();
  exigir(t,'motivo_obrigatorio','Diga por que o pedido foi recusado — quem pediu vai ler.');
  db.prepare(`UPDATE sm_aprovacao SET status='recusado', decidido_por=?, decidido_por_id=?, decidido_em=?,
    decisao_motivo=? WHERE id=?`).run((usuario&&usuario.nome)||null,(usuario&&usuario.id!=null)?Number(usuario.id):null,
    dia.agora(),t,a.id);
  return porId(a.id);
}

/* As que esperam decisao, de um tipo, das mais antigas para as novas: quem
   pediu primeiro espera ha mais tempo. */
const pendentes=tipo=>db.prepare(`SELECT * FROM sm_aprovacao WHERE status='pendente'
  ${tipo?'AND tipo=?':''} ORDER BY id`).all(...(tipo?[tipo]:[])).map(decorar);

/* Para as listas: o pedido pendente de cada alvo, para a tela dizer "baixa
   pedida por X" ao lado do boleto e nao oferecer um segundo pedido. */
function pendentePorAlvo(tipo){
  const m={};
  pendentes(tipo).forEach(a=>{ m[a.alvo_id]={id:a.id, por:a.pedido_por, em:a.pedido_em}; });
  return m;
}

module.exports={pedirBaixa,pedirDescarte,aprovar,recusar,pendentes,pendentePorAlvo,porId,TIPOS};
