// AS REGRAS DA REVENDA — secoes 4.12 e 4.13 da spec SOBMEDIDA-PEDIDO-REVENDA.
//
// Nao conhece Express. Quem calcula uma persiana e o dominio/persiana.js;
// aqui so se decide o que pode ser CADASTRADO sobre quem compra.
//
// ⚠️ AS TRES REGRAS DO CATALOGO VALEM INTEIRAS AQUI, e sao licao paga do PCP:
//   1. CAMPO AUSENTE NAO E CAMPO VAZIO (divida 15: o POST /api/skus zerava o
//      estoque quando o corpo nao trazia `estoque`, sem erro e sem rastro).
//   2. NUMERO IMPOSSIVEL E RECUSADO, NUNCA CLAMPADO (armadilha #25).
//   3. NADA E GRAVADO ANTES DE VALIDAR.
//
// ⚠️ E A QUARTA, DESTA FASE: O VENDEDOR E GENTE DO PCP. O vinculo e pelo id,
// e o nome fica gravado como RETRATO — a carteira precisa continuar legivel
// daqui a um ano, mesmo que a pessoa saia da empresa. Quem entrega a lista e
// o nucleo/pessoas.js, porta unica.
const {ErroDeRegra,exigir}=require('../nucleo/erros');
const d=require('../dados/revenda');
const pessoas=require('../nucleo/pessoas');
const dia=require('../nucleo/dia');

/* ── O DESCONTO, EM CENTESIMOS DE POR CENTO ───────────────────────────────
   500 = 5,00%. Inteiro, como toda unidade deste modulo, e pelo mesmo motivo:
   a conta do preco EMPILHA (tabela e depois desconto), e percentual em ponto
   flutuante compoe ruido a cada degrau.

   O teto e 100%: acima disso o preco vira negativo, e "a revenda paga menos
   que zero" nao e desconto — e um numero que ninguem vai olhar duas vezes
   porque a tela continua mostrando dinheiro. */
function centesimos(valor,oque){
  const o=oque||'o desconto';
  if(valor===null||valor===undefined||String(valor).trim()==='')
    throw new ErroDeRegra('desconto_invalido','Informe '+o+'.');
  const n=Number(String(valor).trim().replace(',','.'));
  if(!isFinite(n)||!Number.isInteger(n)||n<0||n>10000)
    throw new ErroDeRegra('desconto_invalido',
      o+' vai de 0 a 10000 centesimos de por cento (10000 = 100%), inteiro, e veio "'+valor+'". '+
      '5,00% se escreve 500.');
  return n;
}

/* ── O CNPJ ───────────────────────────────────────────────────────────────
   Recusa o torto, aceita o vazio. Revenda sem CNPJ existe — a que ainda nao
   mandou o cartao, e a pessoa fisica —, e travar por isso faria o cadastro
   esperar papel, que e a armadilha #6: a equipe lanca com um CNPJ qualquer
   so para a tela aceitar, e a partir dali a nota sai errada.

   O digito verificador, por outro lado, nao dispara no caso normal: CNPJ
   certo passa sempre. Ele so pega dedo trocado — que e o erro que vira nota
   fiscal recusada semanas depois, longe de quem digitou. */
function cnpjValido(digitos){
  if(digitos.length!==14) return false;
  if(/^(\d)\1{13}$/.test(digitos)) return false;
  const dig=(base,pesos)=>{
    let s=0; for(let i=0;i<pesos.length;i++) s+=Number(base[i])*pesos[i];
    const r=s%11; return r<2?0:11-r;
  };
  return dig(digitos,[5,4,3,2,9,8,7,6,5,4,3,2])===Number(digitos[12])
      && dig(digitos,[6,5,4,3,2,9,8,7,6,5,4,3,2])===Number(digitos[13]);
}

function cnpj(valor){
  if(valor===null||valor===undefined) return undefined;   // ausente: nao mexe
  const t=String(valor).trim();
  if(t==='') return null;                                 // vazio EXPLICITO: apaga
  const digitos=t.replace(/\D/g,'');
  exigir(cnpjValido(digitos),'cnpj_invalido',
    'O CNPJ "'+t+'" nao fecha no digito verificador. Confira, ou deixe em branco por enquanto.');
  return digitos;
}

const texto=v=>v===undefined?undefined:(v===null?null:String(v).trim());

const ENTREGAS=['entrega','retira'];

/* Os campos livres, num lugar so. Campo que entra aqui e campo que o
   `editar` sabe preservar quando nao vem — e a lista e uma so para nao
   existir o campo que uma das duas rotas conhece e a outra nao. */
const LIVRES=['razao_social','fiscal_cep','fiscal_logradouro','fiscal_numero',
  'fiscal_complemento','fiscal_bairro','fiscal_cidade','fiscal_uf','observacao'];

function camposComuns(dados){
  const fora={};
  for(const c of LIVRES) if(dados[c]!==undefined) fora[c]=texto(dados[c]);
  if(dados.nome_fantasia!==undefined){
    const n=texto(dados.nome_fantasia);
    exigir(n,'nome_obrigatorio','Diga como a equipe chama esta revenda (nome fantasia).');
    fora.nome_fantasia=n;
  }
  if(dados.cnpj!==undefined){ const c=cnpj(dados.cnpj); if(c!==undefined) fora.cnpj=c; }
  if(dados.desconto_centesimos!==undefined)
    fora.desconto_centesimos=centesimos(dados.desconto_centesimos,'o desconto da revenda');
  if(dados.entrega!==undefined){
    const e=String(dados.entrega).trim();
    exigir(ENTREGAS.includes(e),'entrega_invalida','A revenda ou recebe ("entrega") ou busca ("retira").');
    fora.entrega=e;
  }
  if(dados.tabela_id!==undefined){
    if(dados.tabela_id===null||dados.tabela_id==='') fora.tabela_id=null;
    else{
      exigir(d.tabela(dados.tabela_id),'tabela_inexistente','Esta tabela de preco nao existe.');
      fora.tabela_id=Number(dados.tabela_id);
    }
  }
  if(dados.forma_pagamento_id!==undefined){
    if(dados.forma_pagamento_id===null||dados.forma_pagamento_id==='') fora.forma_pagamento_id=null;
    else{
      exigir(d.formaPagamento(dados.forma_pagamento_id),'forma_pagamento_inexistente',
        'Esta forma de pagamento nao existe no cadastro.');
      fora.forma_pagamento_id=Number(dados.forma_pagamento_id);
    }
  }
  if(dados.ativo!==undefined) fora.ativo=dados.ativo?1:0;
  return fora;
}

/* ⚠️ O LIMITE DE CREDITO TEM PORTA PROPRIA, como o preco do m² do tecido e o
   da colecao. Deixa-lo entrar pelo `editar` seria o segundo caminho de
   escrita no mesmo numero (armadilha #12), e — pior — um numero que decide
   credito mudaria sem historico: daqui a um mes ninguem sabe quem autorizou
   os R$ 20.000. */
function recusarLimitePeloEditar(dados){
  if(dados.valor_limite_credito_centavos!==undefined||dados.limite_revisado_em!==undefined)
    throw new ErroDeRegra('limite_por_outra_porta',
      'O limite de credito se muda no botao Limite, que grava quem mudou, de quanto para quanto e quando.');
  if(dados.vendedor_usuario_id!==undefined||dados.vendedor_nome!==undefined)
    throw new ErroDeRegra('vendedor_por_outra_porta',
      'O vendedor da carteira se troca no botao Vendedor — o nome dele fica gravado junto, e isso e historia.');
}

// ── A revenda ─────────────────────────────────────────────────────────────
const listar=filtro=>d.listar(filtro);

function porId(id){
  const r=d.porId(id);
  exigir(r,'revenda_inexistente','Revenda nao encontrada.');
  return Object.assign({},r,{enderecos:d.enderecos(r.id), contatos:d.contatos(r.id)});
}

function criar(dados,usuario){
  const razao=texto(dados.razao_social);
  exigir(razao,'razao_social_obrigatoria','A razao social e o nome que vai na nota fiscal.');
  const campos=camposComuns(dados);
  exigir(campos.nome_fantasia,'nome_obrigatorio','Diga como a equipe chama esta revenda (nome fantasia).');
  exigir(!d.porNome(campos.nome_fantasia),'nome_repetido',
    'Ja existe uma revenda chamada "'+campos.nome_fantasia+'".');
  campos.razao_social=razao;
  campos.criado_por=usuario&&usuario.nome;
  return d.criar(campos);
}

function editar(id,dados,usuario){
  const r=d.porId(id);
  exigir(r,'revenda_inexistente','Revenda nao encontrada.');
  recusarLimitePeloEditar(dados);
  const campos=camposComuns(dados);
  if(campos.nome_fantasia&&campos.nome_fantasia.toLowerCase()!==r.nome_fantasia.toLowerCase()){
    exigir(!d.porNome(campos.nome_fantasia),'nome_repetido',
      'Ja existe uma revenda chamada "'+campos.nome_fantasia+'".');
  }
  if(dados.razao_social!==undefined)
    exigir(campos.razao_social,'razao_social_obrigatoria','A razao social e o nome que vai na nota fiscal.');
  return d.atualizar(id,campos);
}

// ── O vendedor da carteira ────────────────────────────────────────────────
function definirVendedor(id,usuario_id,usuario){
  const r=d.porId(id);
  exigir(r,'revenda_inexistente','Revenda nao encontrada.');
  if(usuario_id===null||usuario_id===undefined||usuario_id==='')
    return d.atualizar(id,{vendedor_usuario_id:null,vendedor_nome:null});
  const p=pessoas.porId(usuario_id);
  exigir(p,'vendedor_inexistente',
    'Nao ha ninguem com este id no PCP. O vendedor e uma pessoa do cadastro do PCP, '+
    'e quem cria gente la e Admin -> Acessos.');
  return d.atualizar(id,{vendedor_usuario_id:p.id, vendedor_nome:p.nome});
}

/* A CARTEIRA E DERIVADA, e nao uma tabela. Ela e "o conjunto de revendas que
   este vendedor atende" (secao 4.12) — uma segunda tabela dizendo a mesma
   coisa divergiria no primeiro vendedor trocado, e as duas estariam certas
   cada uma na sua regua (armadilha #12).

   ⚠️ QUEM ESTA SEM VENDEDOR APARECE, e com o nome escrito por extenso. O
   "pronto quando" desta fase e cada revenda com um vendedor: esconder as sem
   vendedor faria a tela dizer que o trabalho acabou. */
function carteiras(){
  const todas=d.listar();
  const por=new Map();
  for(const r of todas){
    const chave=r.vendedor_usuario_id===null?'':String(r.vendedor_usuario_id);
    if(!por.has(chave)) por.set(chave,{
      vendedor_usuario_id:r.vendedor_usuario_id,
      vendedor_nome:r.vendedor_nome||'— sem vendedor —',
      revendas:[]});
    por.get(chave).revendas.push(r);
  }
  return [...por.values()].sort((a,b)=>
    (a.vendedor_usuario_id===null)-(b.vendedor_usuario_id===null)||
    String(a.vendedor_nome).localeCompare(String(b.vendedor_nome)));
}

// ── O limite de credito ───────────────────────────────────────────────────
/* ⚠️ MOSTRA, NAO TRAVA (secao 4.13). Nao ha nada aqui que recuse pedido por
   credito, e nao e esquecimento: o limite disponivel depende da baixa dos
   boletos, e boleto e a fase 6. Trava ligada sobre dado velho e a armadilha
   #6 — e o dono decidiu que nao se perde venda por isso. */
function definirLimite(id,valor,usuario){
  const r=d.porId(id);
  exigir(r,'revenda_inexistente','Revenda nao encontrada.');
  let novo=null;
  if(!(valor===null||valor===undefined||String(valor).trim()==='')){
    const n=Number(String(valor).trim().replace(',','.'));
    if(!isFinite(n)||!Number.isInteger(n)||n<0)
      throw new ErroDeRegra('limite_invalido',
        'O limite tem que ser centavo inteiro e nao negativo, e veio "'+valor+'". '+
        'R$ 5.000,00 se escreve 500000.');
    novo=n;
  }
  if(r.valor_limite_credito_centavos===novo) return Object.assign({},porId(id),{mudou:false});
  d.atualizar(id,{valor_limite_credito_centavos:novo, limite_revisado_em:dia.hoje()});
  d.registrarPreco({alvo:'revenda',alvo_id:id,de:r.valor_limite_credito_centavos,para:novo,
    usuario_nome:usuario&&usuario.nome});
  return Object.assign({},porId(id),{mudou:true,limite_anterior:r.valor_limite_credito_centavos});
}

/* Revisar sem mudar o numero TAMBEM e revisao — e e o caso mais comum: o
   vendedor olha, conclui que o limite esta bom e carimba. Sem este botao a
   unica forma de sair da lista de vencidos seria mudar o limite, e aí a
   equipe mudaria o numero so para a tela parar de cobrar. */
function revisarLimite(id,usuario){
  const r=d.porId(id);
  exigir(r,'revenda_inexistente','Revenda nao encontrada.');
  exigir(r.valor_limite_credito_centavos!==null,'sem_limite',
    'Esta revenda nao tem limite lancado — nao ha o que revisar.');
  d.atualizar(id,{limite_revisado_em:dia.hoje()});
  d.registrarPreco({alvo:'revenda',alvo_id:id,de:r.valor_limite_credito_centavos,
    para:r.valor_limite_credito_centavos, usuario_nome:usuario&&usuario.nome});
  return porId(id);
}

const limitesVencidos=()=>d.vencidos();
const historicoLimite=id=>d.historico('revenda',id);

// ── As tabelas A/B/C ──────────────────────────────────────────────────────
const tabelas=()=>d.tabelas();
const historicoTabela=id=>d.historico('tabela',id);

function definirDescontoTabela(id,valor,usuario){
  const t=d.tabela(id);
  exigir(t,'tabela_inexistente','Esta tabela de preco nao existe.');
  const novo=(valor===null||valor===undefined||String(valor).trim()==='')
    ? null : centesimos(valor,'o desconto da tabela '+t.nome);
  if(t.desconto_centesimos===novo) return Object.assign({},t,{mudou:false});
  d.gravarDescontoTabela(id,novo);
  d.registrarPreco({alvo:'tabela',alvo_id:id,de:t.desconto_centesimos,para:novo,
    usuario_nome:usuario&&usuario.nome});
  return Object.assign({},d.tabela(id),{mudou:true,desconto_anterior:t.desconto_centesimos});
}

const formasPagamento=()=>d.formasPagamento();

// ── Enderecos ─────────────────────────────────────────────────────────────
function daRevenda(id){
  const r=d.porId(id);
  exigir(r,'revenda_inexistente','Revenda nao encontrada.');
  return r;
}

function camposEndereco(dados){
  const fora={};
  for(const c of ['cep','logradouro','numero','complemento','bairro','cidade','uf'])
    if(dados[c]!==undefined) fora[c]=texto(dados[c]);
  if(dados.apelido!==undefined){
    const a=texto(dados.apelido);
    exigir(a,'apelido_obrigatorio','De um apelido ao endereco ("Loja centro", "Deposito") — '+
      'e por ele que quem lanca o pedido escolhe para onde a caixa vai.');
    fora.apelido=a;
  }
  if(dados.padrao!==undefined) fora.padrao=dados.padrao?1:0;
  if(dados.ativo!==undefined) fora.ativo=dados.ativo?1:0;
  return fora;
}

/* ⚠️ UM PADRAO SO. Dois enderecos marcados como padrao fariam a tela do
   pedido escolher o primeiro que a consulta devolvesse — ou seja, por sorte,
   e a caixa iria para a loja errada sem ninguem ter escolhido nada. */
function criarEndereco(dados){
  const r=daRevenda(dados.revenda_id);
  const campos=camposEndereco(dados);
  exigir(campos.apelido,'apelido_obrigatorio','De um apelido ao endereco.');
  exigir(!d.enderecoPorApelido(r.id,campos.apelido),'apelido_repetido',
    'Esta revenda ja tem um endereco chamado "'+campos.apelido+'".');
  if(campos.padrao===1) d.tirarPadrao(r.id);
  campos.revenda_id=r.id;
  return d.criarEndereco(campos);
}

function editarEndereco(revenda_id,id,dados){
  const r=daRevenda(revenda_id);
  const e=d.endereco(r.id,id);
  exigir(e,'endereco_inexistente','Este endereco nao e desta revenda.');
  const campos=camposEndereco(dados);
  if(campos.apelido&&campos.apelido.toLowerCase()!==e.apelido.toLowerCase())
    exigir(!d.enderecoPorApelido(r.id,campos.apelido),'apelido_repetido',
      'Esta revenda ja tem um endereco chamado "'+campos.apelido+'".');
  if(campos.padrao===1) d.tirarPadrao(r.id);
  return d.atualizarEndereco(r.id,id,campos);
}

function apagarEndereco(revenda_id,id){
  const r=daRevenda(revenda_id);
  exigir(d.endereco(r.id,id),'endereco_inexistente','Este endereco nao e desta revenda.');
  d.apagarEndereco(r.id,id);
  return {apagado:true};
}

// ── Contatos ──────────────────────────────────────────────────────────────
function camposContato(dados){
  const fora={};
  for(const c of ['papel','telefone','email']) if(dados[c]!==undefined) fora[c]=texto(dados[c]);
  if(dados.nome!==undefined){
    const n=texto(dados.nome);
    exigir(n,'nome_obrigatorio','O contato precisa de um nome — telefone sem dono nao se usa.');
    fora.nome=n;
  }
  if(dados.principal!==undefined) fora.principal=dados.principal?1:0;
  if(dados.ativo!==undefined) fora.ativo=dados.ativo?1:0;
  return fora;
}

function criarContato(dados){
  const r=daRevenda(dados.revenda_id);
  const campos=camposContato(dados);
  exigir(campos.nome,'nome_obrigatorio','O contato precisa de um nome.');
  campos.revenda_id=r.id;
  return d.criarContato(campos);
}

function editarContato(revenda_id,id,dados){
  const r=daRevenda(revenda_id);
  exigir(d.contato(r.id,id),'contato_inexistente','Este contato nao e desta revenda.');
  return d.atualizarContato(r.id,id,camposContato(dados));
}

function apagarContato(revenda_id,id){
  const r=daRevenda(revenda_id);
  exigir(d.contato(r.id,id),'contato_inexistente','Este contato nao e desta revenda.');
  d.apagarContato(r.id,id);
  return {apagado:true};
}

module.exports={listar,porId,criar,editar,
  definirVendedor,carteiras,
  definirLimite,revisarLimite,limitesVencidos,historicoLimite,
  tabelas,definirDescontoTabela,historicoTabela,formasPagamento,
  criarEndereco,editarEndereco,apagarEndereco,
  criarContato,editarContato,apagarContato,
  cnpjValido,centesimos};
