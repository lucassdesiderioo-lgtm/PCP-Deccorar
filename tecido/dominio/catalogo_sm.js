// AS REGRAS DO CATALOGO DO SOB MEDIDA — modelo, colecoes de venda, escada de
// tubos, ficha tecnica, faixas de suporte e preco.
//
// Nao conhece Express, req nem res. Quem calcula uma persiana e o
// dominio/persiana.js; aqui so se decide o que pode ser CADASTRADO.
//
// ⚠️ TRES REGRAS ATRAVESSAM O ARQUIVO INTEIRO, e todas sao licao paga do PCP:
//
//   1. CAMPO AUSENTE NAO E CAMPO VAZIO. Editar so mexe no que veio no corpo
//      (divida 15 do CLAUDE.md: o POST /api/skus zerava o estoque quando o
//      corpo nao trazia `estoque` — sem erro, sem log e sem rastro).
//   2. NUMERO IMPOSSIVEL E RECUSADO, NUNCA CLAMPADO. Clampar e apagar em
//      silencio, que e o mesmo defeito por outra porta (armadilha #25).
//   3. NADA E GRAVADO ANTES DE VALIDAR. A recusa que ja escreveu metade e
//      pior que a recusa: ela deixa o cadastro num estado que ninguem pediu.
const {ErroDeRegra,exigir}=require('../nucleo/erros');
const u=require('../nucleo/unidade');
const dCat=require('../dados/catalogo_sm');
const dAbertura=require('../dados/abertura');
const dCor=require('../dados/cor');
const materiais=require('../nucleo/materiais');
const dTecido=require('../dados/tecido');
const dSetor=require('../dados/etiqueta_producao');
const db=require('../nucleo/db');
const ESC=require('./escolhas');

/* As duas palavras que uma referencia de ficha pode ter alem de uma chave de
   componente. Elas sao reservadas: um componente chamado 'final' faria a
   ficha dizer duas coisas com a mesma palavra. */
const REF_RESERVADAS=['final','degrau','folha'];

/* AS PECAS PRONTAS DE CALCULO (secao 2 da spec SOBMEDIDA-CADASTRO-DE-PRODUTO).
   O produto liga uma; a conta mora no persiana.js, e cada uma diz o que
   devolve para a ficha medir e contar. Conta nova entra por spec, como peca
   pronta nova — nunca digitada na tela. */
const CALCULOS=[
  {chave:'escada', nome:'Escada de tubos', quantidades:[]},
  {chave:'gomos',  nome:'Gomos e varetas (Romana)', quantidades:['gomos','varetas']},
  {chave:'folhas', nome:'Folhas, transpasse e vias (Painel)', quantidades:['folhas','vias','lados']},
  {chave:'nenhum', nome:'Nenhum', quantidades:[]}
];
const QUANTIDADES_REF=['gomos','varetas','folhas','vias','lados'];
/* Os `quando` das escolhas novas (secao 4.2): a linha entra pelo acionamento
   ou pela abertura escolhida. A corda do Painel e `com_comando`, e no painel
   sem comando ela nao entra — nao baixa estoque nem custa. */
const QUANDOS=['sempre','bando','barra','sem_adicional','reducao',
  'com_comando','sem_comando','abertura_lateral','abertura_central'];

const modeloOuErro=id=>{
  const m=dCat.modelo(id);
  exigir(m,'modelo_inexistente','Modelo nao encontrado.');
  return m;
};

// ── Modelo ────────────────────────────────────────────────────────────────
/* ⚠️ O PRODUTO INATIVO NAO APARECE PARA QUEM VENDE (secao 3.2 da spec
   SOBMEDIDA-CADASTRO-DE-PRODUTO). Ele nasce inativo para o dono conferir no
   simulador antes de a revenda ver — e a lista do pedido e a primeira porta
   por onde a revenda o veria. Sem filtro (a chamada antiga, sem argumento) a
   lista continua inteira: e o que o cadastro usa. */
function listarModelos(f){
  const todos=dCat.modelos();
  if(f&&f.inativos===false) return todos.filter(m=>m.ativo);
  return todos;
}
const modeloPorNome=nome=>dCat.modeloPorNome(nome);

/* O modelo INTEIRO, numa leitura so: e assim que a tela de catalogo e o
   calculo enxergam a mesma coisa. Duas montagens diferentes do mesmo modelo
   seriam duas reguas (armadilha #12). */
function modelo(id){
  const m=modeloOuErro(id);
  return Object.assign({},m,{
    colecoes: dCat.colecoes(id),
    cores_acessorio: dCat.coresAcessorio(id),
    degraus: dCat.degraus(id),
    ficha: dCat.ficha(id),
    faixas_suporte: dCat.faixas(id),
    reducao: dCat.reducaoRegra(id)||{modelo_id:id,m2_acima_mm2:null,largura_acima_mm:null},
    /* O que a tela precisa para OFERECER so o que o servidor aceita: os
       `quando` e as referencias validas, e os setores do cadastro. Uma lista
       copiada no navegador divergiria na primeira fase que acrescentasse um. */
    escolhas: ESC.doModelo(dCat.escolhas(id)),
    quandos: QUANDOS.slice(), refs_reservadas: REF_RESERVADAS.slice(),
    calculos: CALCULOS, quantidades_ref: QUANTIDADES_REF.slice(),
    setores: dSetor.setores().map(s=>({chave:s.chave,nome:s.nome}))
  });
}

/* Quem pode ver o modelo inteiro. O inativo so para quem edita o catalogo —
   para o resto, a mesma recusa do calculo, com o nome dele. */
function modeloParaVer(id,podeVerInativo){
  const m=modelo(id);
  exigir(m.ativo||podeVerInativo,'modelo_indisponivel','O modelo '+m.nome+' está desativado.');
  return m;
}

function nomeNovo(bruto,id){
  const nome=String(bruto==null?'':bruto).trim();
  exigir(nome,'nome_vazio','Informe o nome do modelo.');
  const ja=dCat.modeloPorNome(nome);
  if(ja&&ja.id!==id)
    throw new ErroDeRegra('modelo_repetido','O modelo "'+nome+'" ja existe.');
  return nome;
}

/* Os limites do modelo, validados juntos e antes de gravar. Vazio de
   proposito (null) apaga o limite — e decisao de quem editou; ausente nao
   mexe. O minimo faturado e o unico que nao pode ficar vazio: a coluna e NOT
   NULL desde a migracao 16, porque o preco sem minimo cobraria 0,10 m². */
function limitesModelo(d){
  const fora={};
  [['largura_max_mm','a largura maxima'],['altura_max_mm','a altura maxima'],
   ['m2_max_mm2','o m² maximo']].forEach(([c,oque])=>{
    if(d[c]!==undefined) fora[c]=d[c]==null||d[c]===''?null:u.mm(d[c],oque);
  });
  if(d.m2_min_faturado_mm2!==undefined){
    exigir(d.m2_min_faturado_mm2!=null&&d.m2_min_faturado_mm2!=='','minimo_obrigatorio',
      'O mínimo faturado não fica vazio. Para não cobrar mínimo, lance 0,000.');
    fora.m2_min_faturado_mm2=u.mm(d.m2_min_faturado_mm2,'o minimo faturado');
  }
  if(d.ordem!==undefined) fora.ordem=d.ordem;
  if(d.calculo!==undefined){
    exigir(CALCULOS.some(c=>c.chave===d.calculo),'calculo_invalido',
      'O cálculo é um dos do sistema: '+CALCULOS.map(c=>c.nome).join(', ')+'.');
    fora.calculo=d.calculo;
  }
  [['gomo_max_mm','o limite do gomo'],['transpasse_mm','o transpasse']].forEach(([c,oque])=>{
    if(d[c]===undefined) return;
    const v=u.mm(d[c],oque);
    exigir(v>0||c==='transpasse_mm','numero_invalido',oque.charAt(0).toUpperCase()+oque.slice(1)+
      ' tem que ser maior que zero.');
    fora[c]=v;
  });
  return fora;
}

/* ⚠️ O PRODUTO NOVO NASCE INATIVO — decisao do dono em 27/10/2026. A revenda
   nao ve e o pedido nao aceita ate o dono conferir no simulador e ativar.
   Conferir depois de ativar seria conferir com a revenda ja vendendo. */
function criarModelo(d,usuario){
  const nome=nomeNovo(d.nome);
  const lim=limitesModelo(d);
  return dCat.criarModelo(Object.assign({nome, m2_min_faturado_mm2:1500000},lim,{
    ordem:d.ordem, criado_por: usuario&&usuario.nome, ativo:0}));
}

function editarModelo(id,d,usuario){
  const m=modeloOuErro(id);
  /* O ativo tem porta propria, com a regra do "Copia de". Deixa-lo entrar por
     aqui seria o segundo caminho para ativar — e o que pula a regra. */
  if(d.ativo!==undefined) throw new ErroDeRegra('ativo_por_outra_porta',
    'Ativar e desativar é no botão Ativar, que confere o nome antes.');
  const campos=limitesModelo(d);
  if(d.nome!==undefined) campos.nome=nomeNovo(d.nome,m.id);
  return dCat.atualizarModelo(m.id,campos);
}

/* ⚠️ "COPIA DE…" NAO ATIVA (secao 3.2). O duplicar propoe esse nome, e um
   produto que sai para a revenda chamado "Cópia de Rolô" e o sinal de que
   ninguem conferiu — e o nome que ela le no orcamento. */
const NOME_DE_COPIA=/^\s*c[óo]pia\s+de\b/i;
function ativarModelo(id,ativo,usuario){
  const m=modeloOuErro(id);
  if(ativo) exigir(!NOME_DE_COPIA.test(m.nome),'nome_de_copia',
    'O nome "'+m.nome+'" ainda é o da cópia. Dê ao produto o nome que a revenda vai ler '+
    'antes de ativar.');
  return dCat.atualizarModelo(m.id,{ativo:ativo?1:0});
}

/* ── DUPLICAR (secao 3.1) ─────────────────────────────────────────────────
   COPIA DE TUDO, NUMA TRANSACAO SO: colecoes com preco, cores de acessorio,
   escada de tubos, ficha, faixas de suporte, regra da reducao — e, nas fases
   seguintes, as escolhas ligadas e o calculo, que moram nas mesmas tabelas e
   por isso vem junto sem linha nova aqui (as colunas saem do pragma).

   ⚠️ O COMPONENTE NAO SE COPIA, e e de proposito. Ele e do sistema, nao do
   produto: o preco do bandô por metro e um so, e o setor e o codigo do kit
   tambem. A copia aponta para o MESMO componente pela ficha. */
const FILHAS=['sm_modelo_colecao','sm_modelo_cor_acessorio','sm_degrau_tubo',
  'sm_ficha_linha','sm_faixa_suporte','sm_reducao_regra','sm_modelo_escolha'];
/* Acrescentada pela fase que cria a tabela — um nome a mais aqui, e o duplicar
   leva junto. */
const filhas=()=>FILHAS.concat(FILHAS_EXTRAS);
const FILHAS_EXTRAS=[];

function nomeDeCopia(original){
  const raiz='Cópia de '+original;
  if(!dCat.modeloPorNome(raiz)) return raiz;
  for(let n=2;;n++) if(!dCat.modeloPorNome(raiz+' '+n)) return raiz+' '+n;
}

function duplicarModelo(id,d,usuario){
  const m=modeloOuErro(id);
  const nome=(d&&d.nome!=null&&String(d.nome).trim())?nomeNovo(d.nome):nomeDeCopia(m.nome);
  const quem=usuario&&usuario.nome;
  return db.transaction(()=>{
    const novo=dCat.copiarModelo(m.id,nome,quem);
    const mapas={};
    for(const t of filhas()) mapas[t]=dCat.copiarFilhas(t,m.id,novo);
    /* ⚠️ O PRECO COPIADO DEIXA LINHA, com a marca de onde veio. Preco que
       aparece sem rastro e a metade do registro que falta quando alguem
       pergunta "de onde veio esse numero?" (secao 3.2). */
    for(const [antigo,nova] of mapas.sm_modelo_colecao){
      const c=dCat.colecao(nova);
      if(c&&c.preco_m2_centavos!=null) dCat.registrarPreco({alvo:'colecao',alvo_id:nova,de:null,
        para:c.preco_m2_centavos,usuario_nome:quem,detalhe:'copiado de '+m.nome});
    }
    for(const f of DEPOIS_DE_COPIAR) f(mapas,m,novo,quem);
    return dCat.modelo(novo);
  })();
}
/* O que uma fase seguinte precisa fazer depois da copia (o preco por cor
   aponta para a colecao copiada, e nao para o modelo). */
const DEPOIS_DE_COPIAR=[];

// ── As escolhas do cliente (secao 4 da spec SOBMEDIDA-CADASTRO-DE-PRODUTO) ─
/* Ligar e desligar. ⚠️ A DEPENDENCIA E CONFERIDA NOS DOIS SENTIDOS: o lado da
   corrente nao liga sem o acionamento (ele so aparece "com comando"), e o
   acionamento nao desliga com o lado da corrente ligado — senao sobraria uma
   escolha obrigatoria que nunca aparece, e o pedido seria recusado sem
   ninguem entender por que. */
function ligarEscolha(modelo_id,escolha,ligada){
  const m=modeloOuErro(modelo_id);
  const e=ESC.porChave(escolha);
  exigir(e,'escolha_inexistente','A escolha "'+escolha+'" não existe. As escolhas são: '+
    ESC.ESCOLHAS.map(x=>x.chave).join(', ')+'.');
  const atuais=dCat.escolhas(m.id);
  if(ligada){
    for(const dep of Object.keys(e.depende||{}))
      exigir(atuais.includes(dep),'depende_de','"'+e.nome+'" só existe com "'+ESC.porChave(dep).nome+
        '" ligado. Ligue "'+ESC.porChave(dep).nome+'" antes.');
    dCat.ligarEscolha(m.id,e.chave,ESC.ESCOLHAS.indexOf(e)+1);
  }else{
    const orfa=ESC.ESCOLHAS.find(x=>atuais.includes(x.chave)&&x.depende&&x.depende[e.chave]!==undefined);
    exigir(!orfa,'tem_dependente','"'+(orfa&&orfa.nome)+'" depende de "'+e.nome+'". Desligue "'+
      (orfa&&orfa.nome)+'" antes.');
    dCat.desligarEscolha(m.id,e.chave);
  }
  return modelo(m.id).escolhas;
}

// ── Colecao de venda ──────────────────────────────────────────────────────
const colecoesDe=modelo_id=>dCat.colecoes(modelo_id);
const colecaoDe=(modelo_id,abertura_id)=>dCat.colecaoDe(modelo_id,abertura_id);

/* Os limites da colecao, validados juntos. Nao ha "grava o que der": ou os
   numeros do corpo passam todos, ou nada e escrito (regra 3). */
function limites(d){
  const fora={};
  if(d.preco_m2_centavos!==undefined) fora.preco_m2_centavos=
    d.preco_m2_centavos==null?null:u.centavos(d.preco_m2_centavos,'o preco do m²');
  ['largura_max_mm','altura_max_mm'].forEach(c=>{
    if(d[c]!==undefined) fora[c]=d[c]==null?null:u.mm(d[c],'o limite '+c);
  });
  ['m2_max_mm2','m2_min_faturado_mm2'].forEach(c=>{
    if(d[c]!==undefined) fora[c]=d[c]==null?null:u.mm(d[c],'o limite '+c);
  });
  if(d.ordem!==undefined) fora.ordem=d.ordem;
  if(d.ativo!==undefined) fora.ativo=d.ativo?1:0;
  return fora;
}

/* ⚠️ LIGAR, E NAO CADASTRAR. A colecao ja existe no cadastro de tecido
   (Cadastros -> Tecido -> Colecao); aqui so se diz que o modelo a vende, por
   quanto e ate que medida. Uma segunda lista de colecoes divergiria no
   primeiro tecido novo, e o pedido chegaria ao plano de corte pedindo um
   tecido que o estoque nao reconhece. */
function ligarColecao(d,usuario){
  const m=modeloOuErro(d.modelo_id);
  const a=dAbertura.porId(d.abertura_id);
  exigir(a,'colecao_inexistente',
    'Esta colecao nao existe no cadastro de tecido. Cadastre em Cadastros -> Tecido -> Colecao.');
  if(dCat.colecaoDe(m.id,a.id))
    throw new ErroDeRegra('colecao_repetida','O modelo '+m.nome+' ja vende a colecao "'+a.nome+'".');
  const valores=limites(d);
  const nova=dCat.criarColecao(Object.assign({modelo_id:m.id,abertura_id:a.id},valores));
  if(valores.preco_m2_centavos!=null)
    dCat.registrarPreco({alvo:'colecao',alvo_id:nova.id,de:null,
      para:valores.preco_m2_centavos,usuario_nome:usuario&&usuario.nome});
  return dCat.colecao(nova.id);
}

function editarColecao(id,d){
  const c=dCat.colecao(id);
  exigir(c,'colecao_inexistente','Colecao de venda nao encontrada.');
  /* O preco tem porta PROPRIA (definirPrecoColecao), com historico. Deixa-lo
     entrar por aqui seria o segundo caminho de escrita no mesmo numero — a
     armadilha #12, e a mesma que o tecido/preco ja fechou. */
  if(d.preco_m2_centavos!==undefined)
    throw new ErroDeRegra('preco_por_outra_porta',
      'O preco do m² se muda no botao Preco, que grava o historico de quem mudou e de quanto para quanto.');
  return dCat.atualizarColecao(id,limites(d));
}

function definirPrecoColecao(id,valor,usuario){
  const c=dCat.colecao(id);
  exigir(c,'colecao_inexistente','Colecao de venda nao encontrada.');
  const novo=u.centavos(valor,'o preco do m²');
  if(c.preco_m2_centavos===novo) return Object.assign({},c,{mudou:false});
  dCat.atualizarColecao(id,{preco_m2_centavos:novo});
  dCat.registrarPreco({alvo:'colecao',alvo_id:id,de:c.preco_m2_centavos,para:novo,
    usuario_nome:usuario&&usuario.nome});
  return Object.assign({},dCat.colecao(id),{mudou:true,preco_anterior:c.preco_m2_centavos});
}

// ── Cor de acessorio ──────────────────────────────────────────────────────
function ligarCorAcessorio(d){
  const m=modeloOuErro(d.modelo_id);
  const c=dCor.porId(d.cor_id);
  exigir(c,'cor_inexistente','Esta cor nao existe no cadastro. Cadastre em Cadastros -> Tecido -> Cor.');
  return dCat.criarCorAcessorio({modelo_id:m.id,cor_id:c.id,ordem:d.ordem});
}

// ── Componente ────────────────────────────────────────────────────────────
const listarComponentes=()=>dCat.componentes();

const COBRANCAS=['m2_colecao','metro','peca'];

/* ⚠️ O COMPONENTE NOVO E O QUE DEIXA O DONO MONTAR A ROMANA SOZINHO (secao 2
   da spec SOBMEDIDA-CADASTRO-DE-PRODUTO). Ate aqui os doze da semente eram
   os unicos, e vareta, trilho e corda so entrariam por INSERT a mao — que e o
   desvio da armadilha #6 pela porta do cadastro (a #33 do CLAUDE.md).

   A chave e o nome por que a FICHA se refere a ele, e por isso ela segue as
   regras de uma referencia: minuscula, sem espaco, e nunca uma das palavras
   reservadas — um componente chamado "final" faria a ficha dizer duas coisas
   com a mesma palavra. */
function criarComponente(d,usuario){
  const chave=String(d.chave||'').trim().toLowerCase();
  exigir(/^[a-z][a-z0-9_]*$/.test(chave),'chave_invalida',
    'A chave do componente é uma palavra só, minúscula, sem espaço e sem acento (ex.: vareta, base_conica).');
  exigir(REF_RESERVADAS.indexOf(chave)<0,'chave_reservada',
    '"'+chave+'" é palavra reservada da ficha ('+REF_RESERVADAS.join(', ')+'). Escolha outra chave.');
  if(dCat.componentePorChave(chave))
    throw new ErroDeRegra('componente_repetido','Já existe o componente "'+chave+'".');
  const nome=String(d.nome||'').trim();
  exigir(nome,'nome_vazio','Informe o nome do componente.');
  const setor=String(d.setor||'').trim();
  exigir(dSetor.setor(setor),'setor_inexistente','O setor "'+setor+'" não está no cadastro de setores. '+
    'Os setores são: '+dSetor.setores().map(s=>s.nome).join(', ')+'.');
  const cobra=d.unidade_cobranca==null||d.unidade_cobranca===''?null:String(d.unidade_cobranca);
  exigir(cobra==null||COBRANCAS.indexOf(cobra)>=0,'cobranca_invalida',
    'A cobrança é: m2_colecao, metro, peca — ou vazia, para quem não cobra.');
  const codigo=d.codigo_barras==null||String(d.codigo_barras).trim()===''?null:String(d.codigo_barras).trim();
  if(codigo&&dCat.componentePorCodigo(codigo))
    throw new ErroDeRegra('codigo_repetido','O código de barras "'+codigo+'" já é de outro componente.');
  const preco=d.preco_centavos==null||d.preco_centavos===''?null:u.centavos(d.preco_centavos,'o preço');
  const lim={};
  ['largura_max_mm','altura_max_mm'].forEach(c=>{
    lim[c]=d[c]==null||d[c]===''?null:u.mm(d[c],'o limite do componente'); });
  return db.transaction(()=>{
    const c=dCat.criarComponente(Object.assign({chave,nome,setor,
      gera_etiqueta:d.gera_etiqueta===undefined?1:(d.gera_etiqueta?1:0),
      eh_kit:d.eh_kit?1:0, usa_faixa_suporte:d.usa_faixa_suporte?1:0,
      codigo_barras:codigo, preco_centavos:preco, unidade_cobranca:cobra,
      ordem:dCat.componentes().length+1},lim));
    if(preco!=null) dCat.registrarPreco({alvo:'componente',alvo_id:c.id,de:null,para:preco,
      usuario_nome:usuario&&usuario.nome});
    return c;
  })();
}

function definirPrecoComponente(id,valor,usuario){
  const c=dCat.componente(id);
  exigir(c,'componente_inexistente','Componente nao encontrado.');
  const novo=valor==null?null:u.centavos(valor,'o preco do componente');
  if(c.preco_centavos===novo) return Object.assign({},c,{mudou:false});
  dCat.atualizarComponente(id,{preco_centavos:novo});
  dCat.registrarPreco({alvo:'componente',alvo_id:id,de:c.preco_centavos,para:novo,
    usuario_nome:usuario&&usuario.nome});
  return Object.assign({},dCat.componente(id),{mudou:true,preco_anterior:c.preco_centavos});
}

// ── A escada de tubos ─────────────────────────────────────────────────────
/* ⚠️ A ESCADA TEM QUE SUBIR, nos DOIS limites.
   Ela promete "o primeiro degrau onde a persiana cabe". Um degrau que aceita
   menos largura que o de baixo quebra a promessa em silencio: a persiana
   PULA aquele tubo e vai para o seguinte, e o unico jeito de descobrir e
   comparando a etiqueta com o que a serralheria esperava. */
function validarEscada(modelo_id, id, dados){
  const lista=dCat.degraus(modelo_id)
    .map(d=>d.id===id?Object.assign({},d,dados):d)
    .sort((a,b)=>a.ordem-b.ordem);
  for(let i=1;i<lista.length;i++){
    const ant=lista[i-1], d=lista[i];
    if(d.largura_max_mm<=ant.largura_max_mm)
      throw new ErroDeRegra('escada_fora_de_ordem','O degrau "'+d.nome+'" aceita ate '+
        u.emMetros(d.largura_max_mm)+' de largura, que nao e mais que os '+
        u.emMetros(ant.largura_max_mm)+' do "'+ant.nome+'" logo abaixo. A escada tem que subir.');
    if(d.m2_max_mm2<=ant.m2_max_mm2)
      throw new ErroDeRegra('escada_fora_de_ordem','O degrau "'+d.nome+'" aceita ate '+
        u.emM2(d.m2_max_mm2)+' m², que nao e mais que os '+u.emM2(ant.m2_max_mm2)+
        ' m² do "'+ant.nome+'" logo abaixo. A escada tem que subir.');
  }
}

function camposDegrau(d){
  const fora={};
  ['largura_max_mm','desconto_mm','acrescimo_altura_tecido_mm','m2_max_mm2'].forEach(c=>{
    if(d[c]!==undefined) fora[c]=u.mm(d[c],'o campo '+c);
  });
  if(d.nome!==undefined){
    const n=String(d.nome||'').trim();
    exigir(n,'nome_vazio','Informe o nome do degrau.');
    fora.nome=n;
  }
  if(d.ordem!==undefined) fora.ordem=d.ordem;
  ['aceita_bando','aceita_reducao','ativo'].forEach(c=>{
    if(d[c]!==undefined) fora[c]=d[c]?1:0;
  });
  return fora;
}

function criarDegrau(d){
  const m=modeloOuErro(d.modelo_id);
  const campos=camposDegrau(d);
  ['nome','largura_max_mm','m2_max_mm2','desconto_mm','acrescimo_altura_tecido_mm'].forEach(c=>
    exigir(campos[c]!==undefined,'campo_obrigatorio','O degrau precisa de '+c+'.'));
  const ordem=d.ordem==null?(dCat.degraus(m.id).length+1):d.ordem;
  if(dCat.degraus(m.id).some(x=>x.ordem===ordem))
    throw new ErroDeRegra('degrau_repetido','Ja existe um degrau na posicao '+ordem+' deste modelo.');
  // Valida a escada com o degrau novo JA dentro, antes de escrever nada.
  const futuro=dCat.degraus(m.id).concat([Object.assign({id:-1,ordem},campos)]).sort((a,b)=>a.ordem-b.ordem);
  for(let i=1;i<futuro.length;i++){
    if(futuro[i].largura_max_mm<=futuro[i-1].largura_max_mm||futuro[i].m2_max_mm2<=futuro[i-1].m2_max_mm2)
      throw new ErroDeRegra('escada_fora_de_ordem','O degrau "'+futuro[i].nome+
        '" nao e maior que o "'+futuro[i-1].nome+'" logo abaixo. A escada tem que subir.');
  }
  return dCat.criarDegrau(Object.assign({modelo_id:m.id,ordem},campos));
}

function editarDegrau(id,d){
  const atual=dCat.degrau(id);
  exigir(atual,'degrau_inexistente','Degrau nao encontrado.');
  const campos=camposDegrau(d);
  validarEscada(atual.modelo_id,id,campos);   // recusa ANTES de gravar
  return dCat.atualizarDegrau(id,campos);
}

/* ── O MATERIAL DE COMPRA DO PCP (fase 4-C) ────────────────────────────────
   O tubo da persiana sob medida e o MESMO tubo da medida padrao, e Compras e
   um so (decisao do dono, 24/09/2026). Aqui se aponta qual item do cadastro
   de material do PCP corresponde a cada peca daqui.

   ⚠️ O TUBO LIGA NO DEGRAU, O RESTO NO COMPONENTE. Tubo 32 e Tubo 41 sao
   itens de estoque diferentes — o material MUDA com o degrau, e o
   sm_componente tem uma linha so, chamada "Tubo". Deixar as duas pontas
   aceitarem o tubo seria duas afirmacoes sobre o mesmo fato, e elas divergem
   no primeiro dia em que alguem editar so uma.

   ⚠️ NAO HA FATOR DIGITADO. Quem diz como a peca vira quantidade e a UNIDADE
   do item do PCP: `m` le a medida de consumo da ficha (nunca a de corte —
   armadilha #18), `un` conta pecas. Um numero digitado ao lado seria a
   segunda regua da mesma conta, e erraria em silencio. Unidade que a peca
   nao sabe dizer e RECUSADA, em vez de convertida por chute. */
function materialOuErro(componente_id){
  const m=materiais.porId(componente_id);
  exigir(m,'material_inexistente',
    'Não existe material com este id no cadastro de Compras do PCP. '+
    'Cadastre-o em Admin → Compras → Componentes e escolha de novo.');
  exigir(materiais.UNIDADES.indexOf(m.unidade)>=0,'unidade_nao_suportada',
    'O material "'+m.nome+'" é comprado em "'+m.unidade+'", e uma persiana não sabe '+
    'dizer quanto disso ela gasta. Só "m" (lê a medida de consumo da ficha) e '+
    '"un" (conta peças) têm conversão decidida.');
  return m;
}

/* Um item comprado em METRO precisa de uma linha de ficha com medida de
   CONSUMO — senao a conta nao existe e o vinculo nasceria mudo, somando zero
   para sempre sem ninguem saber. E a divida 18 do CLAUDE.md (a regra inerte)
   barrada na hora do cadastro, que e o unico lugar onde alguem esta olhando. */
function exigirMedida(m, linhas, oque){
  if(m.unidade!=='m') return;
  exigir(linhas.some(l=>l.consumo_ref_largura),'sem_medida_para_metro',
    'O material "'+m.nome+'" é comprado em metro, e '+oque+' não tem medida de '+
    'consumo na ficha. Sem ela não há o que converter em metro.');
  /* Peca que tem largura E altura de consumo e um RETANGULO — metro linear
     nao a descreve, e escolher um dos dois lados seria inventar. E o caso do
     tecido, que por decisao do dono nem vai para o Compras do PCP (o estoque
     dele mora aqui e ja tem painel). */
  exigir(!linhas.some(l=>l.consumo_ref_largura&&l.consumo_ref_altura),'peca_e_retangulo',
    oque.charAt(0).toUpperCase()+oque.slice(1)+' se mede por largura E altura, e o '+
    'material "'+m.nome+'" é comprado em metro linear. Metro não descreve área — '+
    'não há conversão a fazer aqui.');
}

/* Componente que nao gera etiqueta nunca sairia da conta de compra: quem tira
   a peca de la e a impressao da etiqueta dela (fase 4-C). Ligado assim, o
   material so subiria, para sempre — e numero que so sobe a equipe aprende a
   ignorar. Recusar com o motivo escrito e melhor que entregar esse numero. */
function exigirEtiqueta(c,m){
  exigir(c.gera_etiqueta,'componente_sem_etiqueta',
    'O componente "'+c.nome+'" não gera etiqueta de produção, então nada o tiraria '+
    'da lista de compras depois — o material "'+m.nome+'" só subiria. Enquanto o bipe '+
    'da bancada (fase 5) não existir, só peça com etiqueta pode apontar material.');
}

function ligarMaterialDoDegrau(id, componente_id, usuario){
  const d=dCat.degrau(id);
  exigir(d,'degrau_inexistente','Degrau nao encontrado.');
  if(componente_id==null||componente_id==='')
    return dCat.atualizarDegrau(id,{componente_id:null});
  const m=materialOuErro(componente_id);
  const linha=dCat.fichaLinhaDe(d.modelo_id,'tubo','sempre');
  exigirMedida(m, linha?[linha]:[], 'o tubo');
  return dCat.atualizarDegrau(id,{componente_id:m.id});
}

function ligarMaterialDoComponente(id, componente_id, usuario){
  const c=dCat.componente(id);
  exigir(c,'componente_inexistente','Componente nao encontrado.');
  /* A recusa DIZ para onde ir. Trava que so nega ensina a equipe a tentar de
     novo do mesmo jeito; esta manda para a tela da escada, que e onde a
     resposta cabe. */
  exigir(String(c.chave)!=='tubo','tubo_liga_no_degrau',
    'O tubo não se liga aqui: o material muda com o degrau da escada '+
    '(Tubo 32 e Tubo 41 são itens de estoque diferentes). Aponte o material '+
    'em cada degrau, na escada de tubos.');
  if(componente_id==null||componente_id==='')
    return dCat.atualizarComponente(id,{componente_id:null});
  const m=materialOuErro(componente_id);
  exigirEtiqueta(c,m);
  exigirMedida(m, dCat.fichaLinhasDoComponente(id), 'o componente "'+c.nome+'"');
  return dCat.atualizarComponente(id,{componente_id:m.id});
}

// ── A ficha ───────────────────────────────────────────────────────────────
const fichaDe=modelo_id=>dCat.ficha(modelo_id);
const fichaLinhaDe=(modelo_id,chave,quando)=>dCat.fichaLinhaDe(modelo_id,chave,quando||'sempre');

/* ⚠️ A REFERENCIA NAO PODE OLHAR PARA A FRENTE.
   A ficha e calculada em ordem: o tubo sai do final, o tecido sai do tubo, a
   base sai do tecido. Uma linha que se mede por um componente que ainda nao
   foi calculado nao tem resposta — e sem esta guarda ela nao daria erro
   nenhum: a medida sairia vazia e a etiqueta iria para a bancada assim. */
function validarReferencia(linha, ref, ondeLer){
  if(ref==null||ref==='') return;
  if(REF_RESERVADAS.indexOf(ref)>=0) return;
  const linhas=dCat.ficha(linha.modelo_id);
  const alvo=linhas.find(l=>l.chave===ref);
  if(!alvo) throw new ErroDeRegra('referencia_inexistente',
    'A ficha do modelo nao tem nenhuma linha de "'+ref+'" para medir '+ondeLer+
    '. As palavras reservadas sao: final, degrau.');
  if(alvo.ordem>=linha.ordem) throw new ErroDeRegra('referencia_adiantada',
    '"'+linha.chave+'" e calculado antes de "'+ref+'" e nao pode se medir por ele. '+
    'Mude a ordem das duas linhas, ou escolha outra referencia.');
}

function camposFicha(d){
  const fora={};
  ['ajuste_largura_mm','ajuste_altura_mm','consumo_ajuste_largura_mm','consumo_ajuste_altura_mm']
    .forEach(c=>{ if(d[c]!==undefined) fora[c]=u.ajuste(d[c],'o ajuste'); });
  ['ref_largura','ref_altura','consumo_ref_largura','consumo_ref_altura'].forEach(c=>{
    if(d[c]!==undefined) fora[c]=d[c]==null||d[c]===''?null:String(d[c]).trim();
  });
  if(d.quando!==undefined){
    exigir(QUANDOS.indexOf(d.quando)>=0,'quando_invalido',
      'O "quando" da linha so pode ser: '+QUANDOS.join(', ')+'.');
    fora.quando=d.quando;
  }
  if(d.ordem!==undefined) fora.ordem=d.ordem;
  if(d.quantidade_ref!==undefined){
    const q=d.quantidade_ref==null||d.quantidade_ref===''?null:String(d.quantidade_ref).trim();
    exigir(q==null||QUANTIDADES_REF.indexOf(q)>=0,'quantidade_ref_invalida',
      'A quantidade por referência é uma de: '+QUANTIDADES_REF.join(', ')+' — ou vazia, para a quantidade fixa.');
    fora.quantidade_ref=q;
  }
  if(d.quantidade!==undefined){
    const q=Number(d.quantidade);
    exigir(Number.isInteger(q)&&q>0,'quantidade_invalida','A quantidade tem que ser inteira e maior que zero.');
    fora.quantidade=q;
  }
  if(d.ativo!==undefined) fora.ativo=d.ativo?1:0;
  return fora;
}

function editarFichaLinha(id,d){
  const atual=dCat.fichaLinha(id);
  exigir(atual,'ficha_linha_inexistente','Linha da ficha nao encontrada.');
  const campos=camposFicha(d);
  const futuro=Object.assign({},atual,campos);
  validarReferencia(futuro,futuro.ref_largura,'a largura de corte');
  validarReferencia(futuro,futuro.ref_altura,'a altura de corte');
  validarReferencia(futuro,futuro.consumo_ref_largura,'a largura de consumo');
  validarReferencia(futuro,futuro.consumo_ref_altura,'a altura de consumo');
  return dCat.atualizarFichaLinha(id,campos);
}

function criarFichaLinha(d){
  const m=modeloOuErro(d.modelo_id);
  const c=dCat.componente(d.componente_id)||dCat.componentePorChave(d.componente);
  exigir(c,'componente_inexistente','Componente nao encontrado.');
  const campos=camposFicha(d);
  const ordem=campos.ordem==null?(dCat.ficha(m.id).length+1):campos.ordem;
  const quando=campos.quando||'sempre';
  if(dCat.fichaLinhaDe(m.id,c.chave,quando))
    throw new ErroDeRegra('ficha_linha_repetida',
      'A ficha ja tem uma linha de "'+c.nome+'" para o caso "'+quando+'".');
  const futuro=Object.assign({modelo_id:m.id,chave:c.chave},campos,{ordem,quando});
  validarReferencia(futuro,futuro.ref_largura,'a largura de corte');
  validarReferencia(futuro,futuro.ref_altura,'a altura de corte');
  return dCat.criarFichaLinha(Object.assign({modelo_id:m.id,componente_id:c.id},campos,{ordem,quando}));
}

// ── Faixas de suporte ─────────────────────────────────────────────────────
function criarFaixaSuporte(d){
  const m=modeloOuErro(d.modelo_id);
  const largura=u.mm(d.largura_max_mm,'a largura da faixa');
  const q=Number(d.quantidade);
  exigir(Number.isInteger(q)&&q>0,'quantidade_invalida','A quantidade de suportes tem que ser inteira e maior que zero.');
  if(dCat.faixas(m.id).some(f=>f.largura_max_mm===largura))
    throw new ErroDeRegra('faixa_repetida','Ja existe faixa ate '+u.emMetros(largura)+' neste modelo.');
  return dCat.criarFaixa({modelo_id:m.id,largura_max_mm:largura,quantidade:q});
}
const apagarFaixaSuporte=id=>{ dCat.apagarFaixa(id); return {apagada:true}; };

function definirReducaoRegra(d){
  const m=modeloOuErro(d.modelo_id);
  return dCat.gravarReducaoRegra({
    modelo_id:m.id,
    m2_acima_mm2: d.m2_acima_mm2==null?null:u.mm(d.m2_acima_mm2,'o m² da regra'),
    largura_acima_mm: d.largura_acima_mm==null?null:u.mm(d.largura_acima_mm,'a largura da regra')
  });
}

/* ── AS CORES QUE ESTA COLECAO TEM DE VERDADE ─────────────────────────────
   O pedido exige a cor do tecido, e "tem de verdade" quer dizer: existe ITEM
   DE TECIDO cadastrado para a linha e a colecao desta colecao de venda. Cor
   cadastrada sem item nao aparece em tela nenhuma do modulo e o corte nao a
   encontra — e o beco descrito no README: a bancada acaba bipando "a cor
   parecida". Oferecer aqui uma cor assim poria no pedido uma escolha que a
   fabrica nao consegue cumprir. */
function coresDaColecao(id){
  const c=dCat.colecao(id);
  exigir(c,'colecao_inexistente','Colecao de venda nao encontrada.');
  // A ordem vem do `listar`, que ja ordena pelo cadastro (linha, colecao,
  // cor). Reordenar aqui por nome faria a lista sair diferente da de
  // Cadastros, e quem confere as duas acharia que sao coisas diferentes.
  return dTecido.listar()
    .filter(t=>t.linha_id===c.linha_id&&t.abertura_id===c.abertura_id&&t.disponivel===1)
    .map(t=>({cor_id:t.cor_id, cor_nome:t.cor_nome, tecido_id:t.id, codigo:t.codigo}));
}

const historicoPreco=(alvo,alvo_id)=>dCat.historicoPreco(alvo,alvo_id);

module.exports={
  coresDaColecao,
  listarModelos, modelo, modeloParaVer, modeloPorNome, criarModelo, editarModelo, ativarModelo,
  duplicarModelo, FILHAS_EXTRAS, DEPOIS_DE_COPIAR, ligarEscolha,
  colecoesDe, colecaoDe, ligarColecao, editarColecao, definirPrecoColecao,
  ligarCorAcessorio,
  listarComponentes, criarComponente, definirPrecoComponente, COBRANCAS,
  criarDegrau, editarDegrau,
  ligarMaterialDoDegrau, ligarMaterialDoComponente,
  fichaDe, fichaLinhaDe, criarFichaLinha, editarFichaLinha,
  criarFaixaSuporte, apagarFaixaSuporte, definirReducaoRegra,
  historicoPreco, QUANDOS, REF_RESERVADAS, CALCULOS, QUANTIDADES_REF
};
