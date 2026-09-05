// DONO UNICO de sobra.status. Nenhum outro arquivo escreve nessa coluna.
//
// R12: usada num plano, a sobra sai INTEIRA — mesmo carregando varias pecas.
// R13: disponivel -> usada  ou  disponivel -> descartada. Nao existe reserva.
// R14: obrigatorios sao codigo, tecido, largura, altura, condicao e endereco.
//      Origem e opcional e nunca trava o lancamento: no mutirao do acervo
//      ninguem sabe de que rolo o retalho saiu, e exigir isso pararia a
//      catalogacao inteira por um dado que nao muda decisao nenhuma.
// Correcao: o que foi lancado errado (tecido, medida, condicao, endereco) se
//      corrige enquanto a sobra esta disponivel, e cada campo corrigido deixa
//      linha em sobra_correcao. O codigo (a etiqueta colada) nao se edita.
//      A chefia corrige; a bancada APONTA (sobra_proposta) e a chefia aceita
//      ou recusa — aceitar passa pelo mesmo `corrigir`.
const db=require('../nucleo/db');
const dia=require('../nucleo/dia');
const {ErroDeRegra,exigir}=require('../nucleo/erros');
const dSobra=require('../dados/sobra');
const dProposta=require('../dados/sobra_proposta');
const dTecido=require('../dados/tecido');
const dCondicao=require('../dados/condicao_sobra');
const endereco=require('./endereco');
const etiqueta=require('./etiqueta');

// Limites de sanidade. Nao sao regra de negocio — sao a defesa contra o
// operador digitar centimetros num campo que fala metros. 190 no lugar de
// 1,90 entraria calado e viraria uma sobra de 190 metros na prateleira.
const MAX_LARGURA=10, MAX_ALTURA=60;

function medida(valor,rotulo,maximo){
  const n=Number(String(valor==null?'':valor).replace(',','.').trim());
  exigir(isFinite(n)&&n>0,'medida_invalida','Informe '+rotulo+' em metros (ex.: 1,90).');
  exigir(n<=maximo,'medida_absurda',
    rotulo.charAt(0).toUpperCase()+rotulo.slice(1)+' de '+n+' m? O campo e em METROS — 1,90 e um metro e noventa.');
  // 3 casas: milimetro e o limite do que a bancada mede, e o resto e ruido
  // que se acumula em cada conta de area.
  return Math.round(n*1000)/1000;
}

// As mesmas guardas servem ao lancamento e a correcao: uma regua so para o
// que entra e para o que e consertado, senao a correcao aceitaria o que o
// lancamento recusa.
function tecidoValido(tecido_id){
  const tecido=dTecido.porId(tecido_id);
  exigir(tecido,'tecido_inexistente','Escolha o tecido.');
  exigir(tecido.ativo,'tecido_inativo','O tecido '+tecido.codigo+' esta desativado.');
  return tecido;
}
function condicaoValida(chave){
  const cond=dCondicao.porChave(chave);
  exigir(cond,'condicao_invalida','Escolha a condicao do retalho.');
  exigir(cond.ativo,'condicao_inativa','A condicao "'+cond.nome+'" saiu do cadastro.');
  return cond;
}
const nomeTecido=t=>[t.linha_nome,t.abertura_nome,t.cor_nome].join(' · ');

function criar(dados,usuarioNome){
  const tecido=tecidoValido(dados.tecido_id);

  const largura=medida(dados.largura,'a largura',MAX_LARGURA);
  const altura=medida(dados.altura,'a altura',MAX_ALTURA);

  const cond=condicaoValida(dados.condicao);

  // Sobra so endereca no armazem SOBRA. Endereco trocado e sobra que ninguem
  // acha — e sobra que ninguem acha e o problema que o modulo veio resolver.
  endereco.exigirArmazem(dados.nivel_id,'SOBRA');

  // A etiqueta e conferida ANTES de gravar qualquer coisa: assim a recusa que
  // chega na bancada e a frase do dominio, e nao o UNIQUE do banco.
  const codigo=etiqueta.conferir(dados.codigo);

  return db.transaction(()=>{
    const id=dSobra.criar({
      codigo,
      tecido_id:tecido.id, largura, altura, condicao:cond.chave,
      nivel_id:dados.nivel_id,
      origem:dados.origem||'inventario',
      origem_rolo_id:dados.origem_rolo_id, origem_sobra_id:dados.origem_sobra_id,
      criado_por:usuarioNome
    });
    // Dentro da mesma transacao: se a reserva falhar, a sobra nao acontece.
    etiqueta.reservar(codigo,id);
    return comEndereco(dSobra.porId(id));
  })();
}

/* ── CORRIGIR O QUE FOI LANCADO ERRADO ────────────────────────────────────
   A sobra e cadastro feito na bancada, e cadastro feito na bancada erra de um
   jeito previsivel: o mutirao LEMBRA o tecido entre um retalho e o seguinte —
   e o que faz ele render — e o primeiro retalho da prateleira nova entra com
   a cor do anterior. Ate aqui a unica saida era o descarte, que e da chefia
   e mede a peca como PERDA no refugo — para uma peca que esta inteira na
   prateleira. O que a bancada fazia de verdade era deixar errado, e o plano
   de corte passava a oferecer um retalho bege para uma peca cinza.

   Mesma porta do rolo (mover, nota): NADA muda sem linha de historico —
   de -> para, por campo, com quem e quando. Salvar sem mudar nada nao grava
   linha: historico que nao conta nada ninguem le.

   QUEM CORRIGE E A CHEFIA (decisao do dono, 05/09/2026). Quem PERCEBE o erro
   e a bancada, com o retalho na mao — por isso ela APONTA (`propor`), e a
   chefia aceita ou recusa. A aceitacao passa por este mesmo `corrigir`: uma
   porta so para mudar a sobra, venha a mudanca de quem vier.

   SO A SOBRA DISPONIVEL SE CORRIGE. A usada ja entrou num plano confirmado
   com aquele tecido e aquela medida; a descartada ja virou linha de refugo
   com aquela area. Mexer nas duas reescreveria uma historia que ja foi
   contada em outra tabela. */

/* O que muda, campo a campo, entre a sobra como esta e o que foi pedido.
   E a MESMA conta para corrigir e para apontar: a bancada nao pode propor o
   que a chefia nao poderia gravar, e a chefia nao pode ver uma diferenca
   diferente da que a bancada viu. Devolve `novo` (o que gravar) e `mudancas`
   (o que dizer), e recusa pelo caminho de sempre o que nao passa nas guardas. */
function diferencas(s,dados){
  const veio=k=>dados[k]!==undefined&&dados[k]!==null&&String(dados[k]).trim()!=='';
  const novo={}, mudancas=[];

  if(veio('tecido_id')){
    const t=tecidoValido(dados.tecido_id);
    if(t.id!==s.tecido_id){
      novo.tecido_id=t.id;
      mudancas.push({campo:'tecido',de:nomeTecido(s),para:nomeTecido(t)});
    }
  }
  if(veio('largura')){
    const l=medida(dados.largura,'a largura',MAX_LARGURA);
    if(Math.abs(l-s.largura)>0.0005){ novo.largura=l; mudancas.push({campo:'largura',de:s.largura,para:l}); }
  }
  if(veio('altura')){
    const a=medida(dados.altura,'a altura',MAX_ALTURA);
    if(Math.abs(a-s.altura)>0.0005){ novo.altura=a; mudancas.push({campo:'altura',de:s.altura,para:a}); }
  }
  if(veio('condicao')){
    const c=condicaoValida(dados.condicao);
    if(c.chave!==s.condicao){
      novo.condicao=c.chave;
      mudancas.push({campo:'condicao',de:s.condicao_nome||s.condicao,para:c.nome});
    }
  }
  if(veio('nivel_id')){
    endereco.exigirArmazem(dados.nivel_id,'SOBRA');
    if(Number(dados.nivel_id)!==Number(s.nivel_id)){
      novo.nivel_id=Number(dados.nivel_id);
      mudancas.push({campo:'endereco',de:endereco.descrever(s.nivel_id),para:endereco.descrever(dados.nivel_id)});
    }
  }
  return {novo,mudancas};
}

const sobraCorrigivel=id=>{
  const s=dSobra.porId(id);
  exigir(s,'sobra_inexistente','Sobra nao encontrada.');
  exigir(s.status==='disponivel','sobra_indisponivel',
    'A sobra '+s.codigo+' esta como "'+s.status+'" e nao se corrige mais — o que ela era ja ficou registrado.');
  return s;
};

// `proposta_id` e interno: so o `aceitar` passa, para o historico saber de
// qual apontamento a correcao nasceu.
function corrigir(id,dados,usuarioNome,proposta_id){
  const s=sobraCorrigivel(id);
  const {novo,mudancas}=diferencas(s,dados);

  // A resposta leva o que mudou NESTA chamada: e isso que a auditoria da rota
  // e o aviso da tela precisam dizer, e nao o historico inteiro da sobra.
  if(!mudancas.length) return {...comEndereco(s), mudancas:[]};

  return db.transaction(()=>{
    dSobra.atualizar(id,novo);
    for(const m of mudancas)
      dSobra.registrarCorrecao({sobra_id:id,...m,usuario_nome:usuarioNome,proposta_id:proposta_id||null});
    return {...comEndereco(dSobra.porId(id)), mudancas};
  })();
}

/* ── A BANCADA APONTA, A CHEFIA ACEITA ────────────────────────────────────
   O apontamento guarda SO os campos que a bancada quer mudar (o resto fica
   NULL) e o motivo. Uma sobra tem no maximo UM apontamento pendente: dois
   apontamentos discordando entre si sobre a mesma sobra nao e informacao,
   e ruido para quem decide — a segunda pessoa ve que ja foi apontado e fala
   com a primeira. E apontar sem mudar nada e recusado, nao aceito em
   silencio: a bancada iria embora achando que avisou.

   O 'de' de cada item e como a sobra ESTA AGORA. Numa proposta pendente e
   exatamente o que a chefia precisa comparar; numa ja decidida o 'de' e
   historia, e quem a conta e a sobra_correcao, nao a proposta. */
function itensDaProposta(p){
  const s=dSobra.porId(p.sobra_id);
  const itens=[];
  if(p.tecido_id!=null) itens.push({campo:'tecido',
    de:nomeTecido(s), para:[p.tecido_linha_nome,p.tecido_abertura_nome,p.tecido_cor_nome].join(' · ')});
  if(p.largura!=null) itens.push({campo:'largura',de:s.largura,para:p.largura});
  if(p.altura!=null) itens.push({campo:'altura',de:s.altura,para:p.altura});
  if(p.condicao!=null) itens.push({campo:'condicao',de:s.condicao_nome||s.condicao,para:p.condicao_nome||p.condicao});
  if(p.nivel_id!=null) itens.push({campo:'endereco',de:endereco.descrever(s.nivel_id),para:endereco.descrever(p.nivel_id)});
  return {...p, itens,
    sobra_tecido:nomeTecido(s), sobra_largura:s.largura, sobra_altura:s.altura,
    sobra_condicao:s.condicao_nome||s.condicao, sobra_endereco:endereco.descrever(s.nivel_id)};
}

function propor(sobra_id,dados,usuarioNome){
  const s=sobraCorrigivel(sobra_id);
  const {novo,mudancas}=diferencas(s,dados);
  exigir(mudancas.length,'nada_mudou',
    'Nada esta diferente do que ja esta gravado. Marque o que esta errado antes de enviar.');
  const pend=dProposta.pendenteDe(s.id);
  exigir(!pend,'proposta_pendente',
    'A sobra '+s.codigo+' ja tem um apontamento esperando a chefia. Fale com quem apontou, ou espere a decisao.');

  const id=dProposta.criar({sobra_id:s.id, ...novo,
    motivo:String(dados.motivo||'').trim()||null, criado_por:usuarioNome});
  return itensDaProposta(dProposta.porId(id));
}

const propostaPendente=id=>{
  const p=dProposta.porId(id);
  exigir(p,'proposta_inexistente','Apontamento nao encontrado.');
  exigir(p.status==='pendente','proposta_decidida',
    'Este apontamento ja foi '+(p.status==='aceita'?'aceito':'recusado')+' por '+(p.decidido_por||'alguem')+'.');
  return p;
};

/* Aceitar E corrigir: a mesma porta, com o rastro apontando para a proposta.
   Se a sobra mudou entre o apontamento e a decisao (a chefia corrigiu direto,
   por exemplo), o que ja esta igual nao vira mudanca — a resposta diz o que
   de fato mudou, que pode ser nada. */
function aceitar(id,usuarioNome){
  const p=propostaPendente(id);
  return db.transaction(()=>{
    const s=corrigir(p.sobra_id,{
      tecido_id:p.tecido_id, largura:p.largura, altura:p.altura,
      condicao:p.condicao, nivel_id:p.nivel_id
    },usuarioNome,p.id);
    dProposta.decidir(id,'aceita',usuarioNome,dia.agora(),null);
    // A sobra e relida DEPOIS da decisao: e ela que traz `propostas_pendentes`,
    // e devolver a leitura de antes diria que ainda ha algo esperando.
    return {proposta:dProposta.porId(id), sobra:{...comEndereco(dSobra.porId(p.sobra_id)), mudancas:s.mudancas}, mudancas:s.mudancas};
  })();
}

// Recusar exige motivo: a bancada vai ler a decisao na propria sobra, e um
// "nao" sem explicacao ensina a nao apontar mais.
function recusar(id,motivo,usuarioNome){
  const p=propostaPendente(id);
  const texto=String(motivo||'').trim();
  exigir(texto,'motivo_obrigatorio','Diga por que o apontamento esta sendo recusado — quem apontou vai ler.');
  dProposta.decidir(id,'recusada',usuarioNome,dia.agora(),texto);
  return itensDaProposta(dProposta.porId(id));
}

// Baixa por uso no plano de corte (fase 6). Sai inteira, sempre.
function marcarUsada(id,plano_id,usuarioNome){
  const s=dSobra.porId(id);
  exigir(s,'sobra_inexistente','Sobra nao encontrada.');
  exigir(s.status==='disponivel','sobra_indisponivel',
    'A sobra '+s.codigo+' esta como "'+s.status+'" e nao pode ser usada.');
  dSobra.baixar(id,'usada',dia.agora(),usuarioNome,'plano '+plano_id);
  return dSobra.porId(id);
}

// Descarte. So a chefia chega aqui (a rota pede 'sobra.descartar', que nao
// esta no papel do cortador) — baixa de sobra sem trava e o furo classico de
// inventario. E a perda fica MEDIDA em refugo: sobra que some sem linha
// nenhuma some tambem do relatorio que explica o desperdicio do mes.
function descartar(id,motivo,usuarioNome){
  const s=dSobra.porId(id);
  exigir(s,'sobra_inexistente','Sobra nao encontrada.');
  exigir(s.status==='disponivel','sobra_indisponivel',
    'A sobra '+s.codigo+' ja esta como "'+s.status+'".');
  const texto=String(motivo||'').trim();
  exigir(texto,'motivo_obrigatorio','Diga por que esta sobra esta sendo descartada.');

  return db.transaction(()=>{
    dSobra.baixar(id,'descartada',dia.agora(),usuarioNome,texto);
    db.prepare(`INSERT INTO refugo(tecido_id,largura,altura,area,motivo,usuario_nome)
      VALUES(?,?,?,?,'descarte',?)`).run(s.tecido_id,s.largura,s.altura,s.area,usuarioNome||null);
    return dSobra.porId(id);
  })();
}

/* O ENDERECO VAI ESCRITO NA RESPOSTA. A sobra tem endereco obrigatorio
   justamente para ser achada na prateleira — e a lista mostrava tudo menos
   isso. `endereco.descrever` e o dono unico do formato ('SOBRA · S1-01-04');
   escrever o mesmo texto em SQL aqui seria uma segunda regua, e as duas
   divergiriam no dia em que alguem mudasse o separador. */
const comEndereco=s=>s?{...s, endereco:s.nivel_id?endereco.descrever(s.nivel_id):''}:s;

module.exports={
  criar, corrigir, propor, aceitar, recusar, marcarUsada, descartar,
  listar:f=>dSobra.listar(f).map(comEndereco),
  porId:id=>comEndereco(dSobra.porId(id)),
  correcoes:id=>dSobra.correcoes(id),
  propostas:f=>dProposta.listar(f).map(itensDaProposta),
  propostasPendentes:()=>dProposta.quantasPendentes(),
  porCodigo:c=>comEndereco(dSobra.porCodigo(etiqueta.limpar(c))),
  candidatas:tecido_id=>dSobra.candidatas(tecido_id),
  resumo:()=>dSobra.resumoPorTecido()
};
