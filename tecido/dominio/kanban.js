// O KANBAN — secao 4.17 da spec SOBMEDIDA-PEDIDO-REVENDA (fase 6-A).
//
// Onde esta cada pedido, numa tela so. E o "onde esta o pedido X" do
// pronto-quando da fase 6, e e o que torna visivel o que a 5-B1 passou a
// gravar: ate aqui o andamento de um pedido so se via abrindo a bancada de
// cada setor, um por um.
//
// ⚠️ AS COLUNAS SAO LIVRES, AS ETAPAS NAO. A spec escreve isso com todas as
// letras, e o motivo e o de sempre: "renomear 'Em producao' desligaria a
// trava em silencio". O nome da coluna e cadastro (`sm_kanban_coluna`); o
// que ela aponta e a lista fechada logo abaixo, que e CODIGO.
//
// ⚠️ E A ETAPA E DERIVADA, NUNCA GRAVADA — nao ha coluna dela no `sm_pedido`.
// Uma coluna gravada seria a segunda afirmacao sobre o mesmo fato e
// divergiria do `pronto_em` no primeiro bipe que ninguem replicasse: a
// armadilha #12 dentro do quadro.
const {ErroDeRegra,exigir}=require('../nucleo/erros');
const d=require('../dados/kanban');
const etq=require('./etiqueta_producao');
const prazo=require('./prazo');
const dia=require('../nucleo/dia');

/* ── A LISTA FECHADA ──────────────────────────────────────────────────────
   Seis etapas, e cada uma com NOME legivel: chave de banco em tela e o
   "— Correcao de contagem" do §2 do CLAUDE.md.

   ⚠️ A SPEC LISTA SEIS MARCOS — orcamento, enviado, aprovado, em producao,
   pronto, entregue — e a lista daqui NAO e ela. Tres diferencas, e as tres
   sao decisao:

   1. `edicao` no lugar de `orcamento`. O pedido REABERTO (fase 3) volta a
      `marco='rascunho'` e continua com o numero dele: chamar aquilo de
      "orcamento" seria mentira na tela. Os dois estao sendo editados e nada
      foi prometido — e a mesma etapa, e o numero no cartao separa um do
      outro.
   2. `cancelado` entrou. Ele nao esta na lista da spec, e e resposta
      legitima para "onde esta o pedido X" — e o unico estado em que um
      pedido some sem ter ido a lugar nenhum.
   3. `entregue` NAO entrou. Nada no sob medida marca entrega hoje, e coluna
      que nunca recebe cartao e paisagem — a divida 18. Ela nasce na 6-C,
      junto com o boleto e a NF, que sao o que a torna verdadeira. */
const ETAPAS=[
  {chave:'edicao',    nome:'Em edição'},
  {chave:'enviado',   nome:'Enviado'},
  {chave:'aprovado',  nome:'Aprovado'},
  {chave:'producao',  nome:'Em produção'},
  {chave:'pronto',    nome:'Pronto'},
  {chave:'cancelado', nome:'Cancelado'}
];
const nomeDaEtapa=chave=>(ETAPAS.find(e=>e.chave===chave)||{}).nome||chave;

/* ⚠️ A ORDEM DAS PERGUNTAS E A REGRA, e a primeira e a que mais importa:
   CANCELADO VENCE TUDO. Cancelar nao apaga historia — um pedido cancelado
   depois de pronto continua com `pronto_em` gravado —, entao perguntar pelo
   pronto antes deixaria ele na coluna Pronto para sempre. */
function etapaDe(p, temBipe){
  if(!p) return null;
  if(p.cancelado_em||p.marco==='cancelado') return 'cancelado';
  if(p.marco==='rascunho') return 'edicao';
  if(p.marco==='enviado')  return 'enviado';
  if(p.pronto_em) return 'pronto';
  const bipou = temBipe===undefined ? d.comBipe().has(p.id) : !!temBipe;
  return bipou ? 'producao' : 'aprovado';
}

/* ── O QUADRO ─────────────────────────────────────────────────────────────
   Tres consultas no total, e nao tres por pedido. */
function quadro(){
  const linhas=d.pedidos();
  const bipados=d.comBipe();
  const setores=etq.setores();

  const barras=new Map();
  for(const s of d.porSetor()){
    if(!barras.has(s.id)) barras.set(s.id,{});
    barras.get(s.id)[s.setor]={total:s.total, feitos:s.feitos};
  }

  const hoje=dia.hoje();
  const cartaoDe=p=>{
    const b=barras.get(p.id)||{};
    /* ⚠️ SEM FICHA, SEM BARRINHA. A ficha so e explodida na APROVACAO (fase
       3): antes disso nao ha componente nenhum, e uma barrinha zerada ali
       diria "nada foi feito" quando a verdade e "ainda nao ha o que fazer". */
    const linhasSetor=setores.filter(s=>b[s.chave]).map(s=>({
      setor:s.chave, nome:s.nome,
      total:b[s.chave].total, feitos:b[s.chave].feitos
    }));
    /* O selo de RETIDO. Hoje so o "sem tecido" do envio — credito estourado
       e o outro selo da spec e depende do boleto, que e a fase 6-C. Selo que
       nunca acende seria regra escrita sem ninguem atras. */
    const retido=[];
    /* ⚠️ CANCELADO NÃO ESTÁ RETIDO, ELE ESTÁ MORTO. "Retido" quer dizer
       parado esperando alguma coisa, e o cancelado não espera nada: o selo
       ali é ruído numa coluna que já é toda de pedido morto. Ruído
       permanente é o que faz a equipe parar de ler o selo no cartão em que
       ele significa alguma coisa (§5). **Só apareceu abrindo a tela.** */
    const morto=p.cancelado_em||p.marco==='cancelado';
    if(p.sem_tecido&&!morto) retido.push('sem tecido');
    return {
      pedido_id:p.id, numero:p.numero, tipo:p.tipo,
      revenda:p.revenda_nome, vendedor:p.vendedor_nome,
      prazo:p.prazo_atual||p.prazo_prometido||null,
      prazo_extenso:p.prazo_atual?prazo.porExtenso(p.prazo_atual):null,
      /* Dias de FABRICA, como a fila do vendedor (fase 3): tres dias de
         calendario com feriado no meio podem ser zero de trabalho. */
      dias_uteis:p.prazo_atual?prazo.diasUteis(hoje,p.prazo_atual):null,
      /* ⚠️ `|| 0` AQUI SERIA "DE GRAÇA". O valor é o que o ENVIO congelou
         (fase 3): o orçamento não tem nenhum e o reaberto perdeu o dele.
         `R$ 0,00` se lê como "não vale nada", e a verdade é "não vale nada
         AINDA" — é a regra 4 do custo, e é o mesmo defeito que só apareceu
         renderizando a tela na fase 3. **Aqui também só apareceu abrindo.** */
      valor_total_centavos:p.valor_total_centavos==null?null:p.valor_total_centavos,
      setores:linhasSetor, retido
    };
  };

  const ativas=d.colunas().filter(c=>c.ativo);
  const porEtapa={};
  ativas.forEach(c=>{ porEtapa[c.etapa]=[]; });
  const fora={};

  for(const p of linhas){
    const etapa=etapaDe(p,bipados.has(p.id));
    if(porEtapa[etapa]) porEtapa[etapa].push(cartaoDe(p));
    /* ⚠️ PEDIDO NAO SOME DO QUADRO EM SILENCIO. Desativar uma coluna nao
       pode fazer trabalho desaparecer de uma tela que responde "onde esta o
       pedido X" — ele vira aviso, com a etapa nomeada e a contagem. */
    else fora[etapa]=(fora[etapa]||0)+1;
  }

  const colunas=ativas.map(c=>{
    const cartoes=porEtapa[c.etapa]||[];
    /* O total da coluna soma só o que EXISTE, e diz quando ficou incompleto.
       É o `piso` que a fábrica já lê em toda tela de dinheiro deste projeto
       (§18 e §7-B, regra 4): custo indefinido nunca vira zero, e um total
       que engoliu o desconhecido mente para baixo sem nada avisando. */
    const comValor=cartoes.filter(x=>x.valor_total_centavos!=null);
    return {id:c.id, nome:c.nome, etapa:c.etapa, ordem:c.ordem,
      quantidade:cartoes.length,
      valor_total_centavos:comValor.length
        ? comValor.reduce((s,x)=>s+x.valor_total_centavos,0) : null,
      valor_piso:comValor.length>0&&comValor.length<cartoes.length,
      cartoes};
  });

  return {colunas,
    /* Etapa sem pedido nenhum nao vira aviso: aviso que aparece todo dia sem
       nada atras e paisagem, e ai ninguem o le no dia em que ele significa
       alguma coisa (a regra do card de caixa de varias pecas do §5). */
    fora:Object.keys(fora).map(e=>({etapa:e, etapa_nome:nomeDaEtapa(e), quantidade:fora[e]}))};
}

// ── O cadastro das colunas ────────────────────────────────────────────────
function criarColuna(dados){
  const nome=String((dados&&dados.nome)||'').trim();
  exigir(nome,'nome_vazio','Dê um nome à coluna.');
  const etapa=String((dados&&dados.etapa)||'').trim();
  /* A recusa DIZ quais etapas existem: sem isso quem cadastra tenta de novo
     com outro palpite, e a trava vira adivinhação. */
  exigir(ETAPAS.some(e=>e.chave===etapa),'etapa_inexistente',
    'A etapa "'+etapa+'" não existe. As que existem são: '+
    ETAPAS.map(e=>e.chave+' ('+e.nome+')').join(', ')+'.');
  const jaTem=d.colunaPorEtapa(etapa);
  if(jaTem)
    throw new ErroDeRegra('etapa_repetida',
      'A etapa '+nomeDaEtapa(etapa)+' já é da coluna "'+jaTem.nome+'". '+
      'Duas colunas na mesma etapa mostrariam o mesmo pedido duas vezes.');
  return d.criarColuna({nome, etapa, ordem:(dados&&dados.ordem)||0});
}

function atualizarColuna(id,dados){
  exigir(d.colunaPorId(id),'coluna_inexistente','Coluna não encontrada.');
  const campos=Object.assign({},dados);
  if(campos.nome!==undefined){
    campos.nome=String(campos.nome).trim();
    exigir(campos.nome,'nome_vazio','Dê um nome à coluna.');
  }
  return d.atualizarColuna(id,campos);
}

module.exports={etapas:()=>ETAPAS.slice(), nomeDaEtapa, etapaDe, quadro,
  colunas:()=>d.colunas(), criarColuna, atualizarColuna};
