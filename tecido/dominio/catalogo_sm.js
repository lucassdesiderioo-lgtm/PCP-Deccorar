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
const dTecido=require('../dados/tecido');

/* As duas palavras que uma referencia de ficha pode ter alem de uma chave de
   componente. Elas sao reservadas: um componente chamado 'final' faria a
   ficha dizer duas coisas com a mesma palavra. */
const REF_RESERVADAS=['final','degrau'];
const QUANDOS=['sempre','bando','barra','sem_adicional','reducao'];

const modeloOuErro=id=>{
  const m=dCat.modelo(id);
  exigir(m,'modelo_inexistente','Modelo nao encontrado.');
  return m;
};

// ── Modelo ────────────────────────────────────────────────────────────────
const listarModelos=()=>dCat.modelos();
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
    reducao: dCat.reducaoRegra(id)||{modelo_id:id,m2_acima_mm2:null,largura_acima_mm:null}
  });
}

function criarModelo(d,usuario){
  const nome=String(d.nome||'').trim();
  exigir(nome,'nome_vazio','Informe o nome do modelo.');
  if(dCat.modeloPorNome(nome))
    throw new ErroDeRegra('modelo_repetido','O modelo "'+nome+'" ja existe.');
  return dCat.criarModelo({
    nome,
    largura_max_mm: d.largura_max_mm==null?null:u.mm(d.largura_max_mm,'a largura maxima'),
    altura_max_mm:  d.altura_max_mm==null?null:u.mm(d.altura_max_mm,'a altura maxima'),
    m2_max_mm2:     d.m2_max_mm2==null?null:u.mm(d.m2_max_mm2,'o m² maximo'),
    m2_min_faturado_mm2: d.m2_min_faturado_mm2==null?1500000:u.mm(d.m2_min_faturado_mm2,'o minimo faturado'),
    ordem:d.ordem, criado_por: usuario&&usuario.nome
  });
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
  listarModelos, modelo, modeloPorNome, criarModelo,
  colecoesDe, colecaoDe, ligarColecao, editarColecao, definirPrecoColecao,
  ligarCorAcessorio,
  listarComponentes, definirPrecoComponente,
  criarDegrau, editarDegrau,
  fichaDe, fichaLinhaDe, criarFichaLinha, editarFichaLinha,
  criarFaixaSuporte, apagarFaixaSuporte, definirReducaoRegra,
  historicoPreco, QUANDOS, REF_RESERVADAS
};
