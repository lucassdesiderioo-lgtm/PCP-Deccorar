// ⚠️ O DONO UNICO DE "O QUE ESTA PERSIANA E".
//
// Entra: modelo, colecao, cor, medida ACABADA e as escolhas (comando,
// rolamento, bando ou barra, reducao). Sai: o degrau, os componentes com
// medida de corte e de consumo, o kit, o preco, os avisos — e as recusas,
// sempre dizendo qual limite estourou.
//
// Tudo que precisar responder essa pergunta chama ESTA funcao: o simulador de
// hoje, o pedido da fase 3, a explosao da ficha na aprovacao (fase 3) e a
// etiqueta da fase 4. Uma segunda conta em qualquer uma delas seria a
// armadilha #12 do CLAUDE.md — duas telas certas, cada uma na sua regua, e a
// bancada cortando por uma enquanto o cliente foi cobrado pela outra.
//
// ⚠️ ELE NAO GRAVA NADA. Na aprovacao o pedido CONGELA o resultado (secao 4.11
// da spec): a persiana aprovada hoje continua sendo cortada com o desconto de
// hoje, mesmo que alguem mude o cadastro amanha. Ficha relida ao vivo faria a
// etiqueta impressa e a tela discordarem, e na bancada vence a etiqueta.
const {ErroDeRegra,exigir}=require('../nucleo/erros');
const u=require('../nucleo/unidade');
const catalogo=require('./catalogo_sm');
const dRevenda=require('../dados/revenda');
const dTecido=require('../dados/tecido');

const COMANDOS={direito:'direito', esquerdo:'esquerdo'};
const ROLAMENTOS={frente:'pela frente', tras:'por trás'};
const ADICIONAIS=['nenhum','bando','barra'];

/* A frase do bando e PARTE DA REGRA, e nao um texto de erro qualquer (secao
   4.6): "opcao que some sem motivo vira desconfianca da tela". Ela e sempre
   a mesma, e o motivo especifico vai entre parenteses. */
const FRASE_BANDO='O bandô não é possível nesta medida: o tubo enrolado não cabe dentro do bandô.';

/* O adicional pode chegar como texto ou como lista — o formulario tem duas
   caixinhas, e o fio carrega as duas. Bando E barra na mesma persiana nao
   existe (secao 4.6), e recusar aqui e o que faz a regra existir fora do
   navegador: um `if` de tela nao protege quem chama a rota por fora
   (armadilha #26 do CLAUDE.md). */
function normalizarAdicional(valor){
  let lista;
  if(Array.isArray(valor)) lista=valor.filter(v=>v&&v!=='nenhum');
  else if(valor==null||valor===''||valor==='nenhum') lista=[];
  else lista=[valor];
  if(lista.length>1)
    throw new ErroDeRegra('bando_e_barra',
      'Uma persiana leva bandô OU barra niveladora, nunca os dois. Escolha um.');
  const a=lista[0]||'nenhum';
  exigir(ADICIONAIS.indexOf(a)>=0,'adicional_invalido',
    'O adicional so pode ser: nenhum, bandô ou barra niveladora.');
  return a;
}

function escolherDegrau(degraus, largura_mm, area_mm2){
  for(const d of degraus)
    if(largura_mm<=d.largura_max_mm && area_mm2<=d.m2_max_mm2) return d;

  /* A RECUSA DIZ QUAL LIMITE ESTOUROU. "Nao cabe" manda a revenda adivinhar
     se o problema e a largura, a altura ou o conjunto — e ela vai ligar para
     o vendedor perguntar. */
  const topo=degraus[degraus.length-1];
  const motivos=[];
  if(largura_mm>topo.largura_max_mm)
    motivos.push('a largura de '+u.emMetros(largura_mm)+' passa dos '+
      u.emMetros(topo.largura_max_mm)+' do '+topo.nome);
  if(area_mm2>topo.m2_max_mm2)
    motivos.push('a área de '+u.emM2(area_mm2)+' m² passa dos '+
      u.emM2(topo.m2_max_mm2)+' m² do '+topo.nome);
  throw new ErroDeRegra('medida_acima_da_escada',
    'Esta medida não é possível: '+motivos.join(' e ')+', que é o maior tubo.');
}

/* Os tres tetos, do mais especifico para o mais geral. Vale sempre o mais
   restritivo (secao 4.4) — e a recusa nomeia QUEM recusou, porque "acima do
   limite" sem dono nao diz onde mexer. */
function conferirTeto(onde, nome, motivo, limites, largura_mm, altura_mm, area_mm2){
  if(limites.largura_max_mm!=null && largura_mm>limites.largura_max_mm)
    throw new ErroDeRegra(motivo,'A largura de '+u.emMetros(largura_mm)+' passa dos '+
      u.emMetros(limites.largura_max_mm)+' que '+onde+' '+nome+' aceita.');
  if(limites.altura_max_mm!=null && altura_mm>limites.altura_max_mm)
    throw new ErroDeRegra(motivo,'A altura de '+u.emMetros(altura_mm)+' passa dos '+
      u.emMetros(limites.altura_max_mm)+' que '+onde+' '+nome+' aceita.');
  if(limites.m2_max_mm2!=null && area_mm2>limites.m2_max_mm2)
    throw new ErroDeRegra(motivo,'A área de '+u.emM2(area_mm2)+' m² passa dos '+
      u.emM2(limites.m2_max_mm2)+' m² que '+onde+' '+nome+' aceita.');
}

function calcular(escolha){
  const e=escolha||{};

  // ── 1. O catalogo ───────────────────────────────────────────────────────
  const modelo=catalogo.modelo(e.modelo_id);
  exigir(modelo.ativo,'modelo_indisponivel','O modelo '+modelo.nome+' está desativado.');

  const colecao=catalogo.colecaoDe(modelo.id,e.abertura_id);
  exigir(colecao,'colecao_fora_do_modelo',
    'Esta coleção não é vendida no modelo '+modelo.nome+'.');
  exigir(colecao.disponivel,'colecao_indisponivel',
    'A coleção "'+colecao.colecao_nome+'" está desativada e não pode ser vendida.');

  exigir(e.cor_acessorio_id,'cor_acessorio_obrigatoria',
    'Escolha a cor dos acessórios — ela nunca tem padrão escondido.');
  const cor=(modelo.cores_acessorio||[]).find(c=>c.cor_id===Number(e.cor_acessorio_id));
  exigir(cor,'cor_acessorio_fora_do_modelo',
    'Esta cor de acessório não está liberada no modelo '+modelo.nome+'.');
  /* Cor desativada NAO vende, e a trava e do servidor. A tela ja filtra, mas
     "desativar um cadastro que nao desativa nada e pior que nao ter o botao"
     (README do modulo): ele promete uma coisa e faz outra, em silencio. */
  exigir(cor.ativo&&cor.cor_ativa,'cor_acessorio_indisponivel',
    'A cor de acessório "'+cor.cor_nome+'" está desativada.');

  /* A cor do TECIDO e opcional na fase 1 (o simulador nao precisa dela para
     cortar), mas quando vem tem que existir como ITEM DE TECIDO — e o elo da
     secao 4.3, e o beco que o README descreve: cor cadastrada sem item nao
     aparece em tela nenhuma, e a bancada "bipa a cor parecida". */
  let corTecido=null, tecido_id=null;
  if(e.cor_tecido_id){
    const item=dTecido.porCombinacao(colecao.linha_id,colecao.abertura_id,Number(e.cor_tecido_id));
    exigir(item,'tecido_inexistente','Não existe o item de tecido '+colecao.linha_nome+' · '+
      colecao.colecao_nome+' nessa cor. Cadastre em Cadastros → Tecido → Item de tecido.');
    corTecido=dTecido.porId(item.id).cor_nome;
    /* ⚠️ O `tecido_id` SAI DAQUI, e nao e reencontrado depois pelo nome da
       cor. Quem resolve a combinacao linha+colecao+cor e esta funcao; o
       pedido (fase 3) GRAVA o id resolvido no lancamento, e e por ele que a
       peca vai ao plano de corte. Procurar de novo la fora seria a segunda
       regua da armadilha #12 — e a que erra e a que manda o rolo errado. */
    tecido_id=item.id;
  }

  // ── 2. As escolhas obrigatorias ─────────────────────────────────────────
  exigir(e.comando&&COMANDOS[e.comando],'comando_obrigatorio',
    'Escolha o lado do comando: direito ou esquerdo.');
  exigir(e.rolamento&&ROLAMENTOS[e.rolamento],'rolamento_obrigatorio',
    'Escolha o rolamento: desce pela frente ou por trás.');
  const adicional=normalizarAdicional(e.adicional);

  // ── 3. A medida ─────────────────────────────────────────────────────────
  const largura_mm=u.mm(e.largura_mm,'a largura acabada');
  const altura_mm=u.mm(e.altura_mm,'a altura acabada');
  const area_mm2=u.areaMm2(largura_mm,altura_mm);

  conferirTeto('a coleção',colecao.colecao_nome,'medida_acima_da_colecao',
    colecao,largura_mm,altura_mm,area_mm2);
  conferirTeto('o modelo',modelo.nome,'medida_acima_do_modelo',
    modelo,largura_mm,altura_mm,area_mm2);

  // ── 4. A escada de tubos ────────────────────────────────────────────────
  const degraus=modelo.degraus.filter(d=>d.ativo);
  exigir(degraus.length,'escada_vazia',
    'O modelo '+modelo.nome+' não tem escada de tubos cadastrada.');
  const degrau=escolherDegrau(degraus,largura_mm,area_mm2);

  /* ── 5. O adicional cabe? ───────────────────────────────────────────────
     ⚠️ A DISPONIBILIDADE E CALCULADA SEMPRE, e nao so quando alguem pede.
     A secao 4.6 manda a opcao de bando SUMIR DA TELA na hora, com a frase —
     e uma tela so consegue fazer isso se souber ANTES de tentar. Descobrir
     pela recusa daria a frase certa e nenhuma persiana calculada junto, e a
     revenda leria "deu erro" em vez de "nesta medida nao tem bando".
     Quem escolhe o indisponivel continua sendo RECUSADO logo abaixo: a tela
     esconder o botao nao e a regra, e a regra que existe fora do navegador. */
  const componenteDe=chave=>modelo.ficha.find(l=>l.chave===chave);
  function cabe(chave, frase, semFicha){
    const c=componenteDe(chave);
    if(!c) return {disponivel:false, motivo:semFicha};
    if(chave==='bando'&&!degrau.aceita_bando)
      return {disponivel:false, motivo:frase+' ('+degrau.nome+' não aceita bandô.)'};
    if(c.componente_altura_max_mm!=null&&altura_mm>c.componente_altura_max_mm)
      return {disponivel:false, motivo:frase+' (a altura vai até '+
        u.emMetros(c.componente_altura_max_mm)+', e esta é '+u.emMetros(altura_mm)+'.)'};
    if(c.componente_largura_max_mm!=null&&largura_mm>c.componente_largura_max_mm)
      return {disponivel:false, motivo:frase+' (a largura vai até '+
        u.emMetros(c.componente_largura_max_mm)+'.)'};
    return {disponivel:true, motivo:null};
  }
  const podeBando=cabe('bando',FRASE_BANDO,FRASE_BANDO+' (Este modelo não tem bandô na ficha.)');
  const podeBarra=cabe('barra','A barra niveladora não é possível nesta medida.',
    'Este modelo não tem barra niveladora na ficha.');

  if(adicional==='bando') exigir(podeBando.disponivel,'bando_indisponivel',podeBando.motivo);
  if(adicional==='barra') exigir(podeBarra.disponivel,'barra_indisponivel',podeBarra.motivo);

  // ── 6. A reducao de peso ────────────────────────────────────────────────
  const regra=modelo.reducao||{};
  const automatica=(regra.m2_acima_mm2!=null&&area_mm2>regra.m2_acima_mm2)
                 ||(regra.largura_acima_mm!=null&&largura_mm>regra.largura_acima_mm);
  const pedida=e.reducao==='pedida'||e.reducao===true;
  if(e.reducao!=null&&e.reducao!==''&&e.reducao!=='nao'&&e.reducao!=='pedida'&&e.reducao!==true&&e.reducao!==false)
    throw new ErroDeRegra('reducao_invalida','A redução de peso só pode ser "nao" ou "pedida".');
  if(pedida&&!automatica&&!degrau.aceita_reducao)
    throw new ErroDeRegra('reducao_indisponivel',
      'O '+degrau.nome+' não tem redução de peso. Ela existe a partir do Tubo 38.');
  const reducao={
    automatica:!!automatica,
    pedida:!!pedida&&!automatica,
    aplicada:!!(automatica||pedida),
    pode_pedir:!!degrau.aceita_reducao
  };

  // ── 7. A ficha vira componentes ─────────────────────────────────────────
  const entra=quando=>
     quando==='sempre'
  || (quando==='bando'&&adicional==='bando')
  || (quando==='barra'&&adicional==='barra')
  || (quando==='sem_adicional'&&adicional==='nenhum')
  || (quando==='reducao'&&reducao.aplicada);

  const calculados={};
  const componentes=[];
  /* ⚠️ O PAR componente -> LINHA DA FICHA e guardado aqui, e nao reencontrado
     depois por `find(chave)`. Um componente pode ter mais de uma linha (dois
     `quando` diferentes), e o `find` devolveria a PRIMEIRA — que pode nao ser
     a que entrou nesta persiana. O preco sairia da linha errada sem nada
     denunciar, porque as duas linhas sao do mesmo componente. */
  const linhaDe=new Map();
  /* ⚠️ A ORDEM E A CONTA. O tubo sai do final, o tecido sai do tubo, a base
     sai do tecido — e por isso a lista e percorrida em `ordem` e cada
     referencia le o que JA foi calculado. O cadastro impede a referencia
     adiantada (catalogo_sm.js); aqui ela ainda e conferida, porque uma ficha
     antiga no banco nunca passou por aquela guarda. */
  for(const linha of modelo.ficha.slice().sort((a,b)=>a.ordem-b.ordem)){
    if(!linha.ativo||!linha.componente_ativo||!entra(linha.quando)) continue;

    const medirLargura=(ref,ajuste)=>{
      if(!ref) return null;
      let base;
      if(ref==='final') base=largura_mm;
      else if(ref==='degrau') base=largura_mm-degrau.desconto_mm;
      else{
        const ja=calculados[ref];
        exigir(ja&&ja.largura_corte_mm!=null,'referencia_adiantada',
          'A ficha manda medir "'+linha.chave+'" por "'+ref+'", que ainda não foi calculado.');
        base=ja.largura_corte_mm;
      }
      return base+(ajuste||0);
    };
    const medirAltura=(ref,ajuste)=>{
      if(!ref) return null;
      let base;
      if(ref==='final') base=altura_mm;
      else if(ref==='degrau') base=altura_mm+degrau.acrescimo_altura_tecido_mm;
      else{
        const ja=calculados[ref];
        exigir(ja&&ja.altura_corte_mm!=null,'referencia_adiantada',
          'A ficha manda medir "'+linha.chave+'" por "'+ref+'", que ainda não foi calculado.');
        base=ja.altura_corte_mm;
      }
      return base+(ajuste||0);
    };

    const c={
      chave:linha.chave, nome:linha.componente_nome, setor:linha.setor,
      quantidade:linha.quantidade, quando:linha.quando,
      gera_etiqueta:!!linha.gera_etiqueta, eh_kit:!!linha.eh_kit,
      codigo_barras:linha.codigo_barras||null,
      // ⚠️ CORTE e CONSUMO, lado a lado e nunca somados — armadilha #18.
      largura_corte_mm: medirLargura(linha.ref_largura,linha.ajuste_largura_mm),
      altura_corte_mm:  medirAltura(linha.ref_altura,linha.ajuste_altura_mm),
      consumo_largura_mm: medirLargura(linha.consumo_ref_largura,linha.consumo_ajuste_largura_mm),
      consumo_altura_mm:  medirAltura(linha.consumo_ref_altura,linha.consumo_ajuste_altura_mm)
    };
    [['largura_corte_mm','a largura'],['altura_corte_mm','a altura']].forEach(([campo,oque])=>{
      if(c[campo]!=null&&c[campo]<=0) throw new ErroDeRegra('medida_de_corte_invalida',
        oque+' de corte de "'+c.nome+'" deu '+c[campo]+' mm. Confira o ajuste na ficha do modelo.');
    });
    c.largura_corte=u.emMetros(c.largura_corte_mm);
    c.altura_corte=u.emMetros(c.altura_corte_mm);
    calculados[linha.chave]=c;
    linhaDe.set(c,linha);
    componentes.push(c);
  }

  // ── 8. O kit ────────────────────────────────────────────────────────────
  const avisos=[];
  const doKit=componentes.find(c=>c.eh_kit);
  let kit=null;
  if(doKit){
    const linha=linhaDe.get(doKit);
    let suportes=null;
    if(linha.usa_faixa_suporte){
      const faixa=modelo.faixas_suporte.find(f=>largura_mm<=f.largura_max_mm);
      if(faixa) suportes=faixa.quantidade;
      else avisos.push('Não há faixa de suporte cadastrada para '+u.emMetros(largura_mm)+
        ' de largura — o kit sai sem a quantidade de suportes.');
    }
    kit={chave:doKit.chave, nome:doKit.nome, codigo_barras:doKit.codigo_barras, suportes};
  } else avisos.push('Este modelo não tem kit de instalação na ficha.');

  // ── 9. O preco ──────────────────────────────────────────────────────────
  const minimo=colecao.m2_min_faturado_mm2!=null
    ? colecao.m2_min_faturado_mm2 : modelo.m2_min_faturado_mm2;
  const m2_cobrado_mm2=Math.max(area_mm2, minimo||0);

  const linhasPreco=[], semPreco=[];
  for(const c of componentes){
    const f=linhaDe.get(c);
    if(!f.unidade_cobranca) continue;
    let unitario=null, base=null, valor=null;
    if(f.unidade_cobranca==='m2_colecao'){
      unitario=colecao.preco_m2_centavos;
      base=u.emM2(m2_cobrado_mm2)+' m² × R$ '+u.emReais(unitario)+'/m²';
      if(unitario!=null) valor=Math.round(m2_cobrado_mm2*unitario/u.M2);
    }else if(f.unidade_cobranca==='metro'){
      /* ⚠️ POR METRO LINEAR **REAL**, nunca pela medida de corte. A barra e
         cortada a 1,991 e o cliente compra 2,000 m de barra — cobrar pelo
         corte faria a fabrica deixar de pagar o que ela corta fora. */
      unitario=f.preco_centavos;
      base=u.emMetros(largura_mm)+' m × R$ '+u.emReais(unitario)+'/m';
      // Arredonda UMA vez, no total da linha (secao 4.1) — e nao por metro e
      // depois vezes a quantidade, que arredondaria duas.
      if(unitario!=null) valor=Math.round(largura_mm*unitario*c.quantidade/1000);
    }else if(f.unidade_cobranca==='peca'){
      unitario=f.preco_centavos;
      base=c.quantidade+' × R$ '+u.emReais(unitario);
      if(unitario!=null) valor=unitario*c.quantidade;
    }
    if(valor==null){ semPreco.push(c.chave); base=null; }
    linhasPreco.push({chave:c.chave, nome:c.nome, unidade:f.unidade_cobranca,
      preco_unitario_centavos:unitario, base, valor_centavos:valor,
      valor:u.emReais(valor)});
  }

  /* ⚠️ CUSTO INDEFINIDO NUNCA VIRA ZERO (regra 4 do COMPRAS.md, e o custo.js
     deste modulo). Falta preco numa linha, o subtotal e `null` — nao a soma
     parcial —, o que se sabe sai como PISO e a linha que falta e NOMEADA.
     Zero e um custo valido e mentiroso. */
  const piso=linhasPreco.reduce((s,l)=>s+(l.valor_centavos||0),0);
  const preco={
    m2_real_mm2:area_mm2, m2_real:u.emM2(area_mm2),
    m2_cobrado_mm2, m2_cobrado:u.emM2(m2_cobrado_mm2),
    m2_min_faturado_mm2:minimo,
    aplicou_minimo:m2_cobrado_mm2>area_mm2,
    linhas:linhasPreco, sem_preco:semPreco,
    valor_subtotal_centavos: semPreco.length?null:piso,
    valor_subtotal: semPreco.length?null:u.emReais(piso),
    valor_piso_centavos:piso, valor_piso:u.emReais(piso)
  };

  /* ── 9-B. O PRECO DA REVENDA ────────────────────────────────────────────
     O bloco acima e o preco DECCORAR, e ele nao se mexe daqui para baixo. O
     que a revenda paga sai dele com a tabela A/B/C e o desconto dela.

     ⚠️ EM CASCATA, NESTA ORDEM — decisao do dono em 22/09/2026. A tabela
     primeiro, o desconto comercial depois, cada um sobre o resultado do
     anterior. Somados, 10% + 5% dariam 15%; em cascata dao 14,5%, e num
     pedido de mil reais a diferenca e de cinco. Somar tambem deixaria dois
     percentuais grandes zerarem a venda sem ninguem notar — 60 + 50 nao e
     desconto, e a tela continuaria mostrando dinheiro.

     ⚠️ ARREDONDA UMA VEZ, no fim (secao 4.1), e nao a cada degrau: dois
     arredondamentos em cadeia erram um centavo para cima ou para baixo sem
     regra nenhuma, e e o tipo de centavo que aparece na conferencia da
     revenda e nao tem como ser explicado. A conta e feita em inteiro
     (subtotal x centesimos x centesimos) e so divide no fim — com preco de
     ate R$ 100 mil o produto cabe folgado no inteiro exato do JavaScript.

     ⚠️ E O SUBTOTAL DECCORAR CONTINUA INTEIRO. "Misturar o preco com markup
     em qualquer numero da Deccorar" e o decimo item da secao 9 da spec, e a
     forma de isso acontecer nunca e alguem decidir: e o desconto entrar no
     subtotal por descuido, e ninguem notar, porque o total continua
     parecendo dinheiro. Faturamento, Compras, credito e relatorio leem o
     subtotal; so a revenda le o final. */
  let precoRevenda=null;
  if(e.revenda_id!==undefined&&e.revenda_id!==null&&e.revenda_id!==''){
    const rev=dRevenda.porId(e.revenda_id);
    exigir(rev,'revenda_inexistente','Esta revenda nao existe no cadastro.');
    exigir(rev.ativo===1,'revenda_inativa',
      'A revenda "'+rev.nome_fantasia+'" esta desativada. Reative em Revendas antes de simular '+
      'para ela — preco de quem nao compra mais e numero que vai parar num orcamento.');

    /* O que impede o numero, tudo numa lista so: as linhas sem preco do lado
       Deccorar e o percentual que falta do lado da revenda. Uma lista
       separada por motivo faria a tela ter que juntar as duas para dizer a
       mesma frase. */
    const falta=semPreco.slice();
    const tabela=rev.tabela_id==null?null:
      {id:rev.tabela_id, nome:rev.tabela_nome,
       desconto_centesimos:rev.tabela_desconto_centesimos,
       desconto:u.emPercentual(rev.tabela_desconto_centesimos)};
    if(!tabela) falta.push('a tabela da revenda (nenhuma apontada no cadastro)');
    else if(tabela.desconto_centesimos==null) falta.push('tabela '+tabela.nome);

    const dRev=rev.desconto_centesimos||0;
    /* ⚠️ SEM O PERCENTUAL NAO HA PISO, e isso nao e um descuido. Piso quer
       dizer "no minimo isto", e desconto so faz o numero DESCER — o subtotal
       Deccorar seria um TETO. Escrever "≥ R$ 209,00" ali diria a coisa
       errada com a palavra certa, e ainda gastaria o sinal que a equipe
       aprendeu a ler como "falta preco em alguma linha". */
    const temPercentual=!!tabela&&tabela.desconto_centesimos!=null;
    const aplicar=v=>v==null?null:
      Math.round(v*(10000-tabela.desconto_centesimos)*(10000-dRev)/100000000);
    const pisoRev=temPercentual?aplicar(piso):null;
    const finalRev=(temPercentual&&!semPreco.length)?pisoRev:null;

    precoRevenda={
      revenda_id:rev.id, nome_fantasia:rev.nome_fantasia,
      tabela,
      desconto_centesimos:dRev, desconto:u.emPercentual(dRev),
      valor_final_centavos:finalRev, valor_final:u.emReais(finalRev),
      valor_piso_centavos:pisoRev, valor_piso:u.emReais(pisoRev),
      sem_preco:falta
    };
  }
  preco.revenda=precoRevenda;

  // ── 10. O que a tela e a bancada leem ───────────────────────────────────
  if(reducao.automatica)
    avisos.push('Redução de peso incluída pela regra de garantia — acima de '+
      u.emM2(regra.m2_acima_mm2)+' m² ou de '+u.emMetros(regra.largura_acima_mm)+' de largura.');
  if(preco.aplicou_minimo)
    avisos.push('Cobrado o mínimo faturado de '+u.emM2(minimo)+' m² — a peça tem '+
      u.emM2(area_mm2)+' m².');
  if(semPreco.length)
    avisos.push('Sem preço lançado para: '+semPreco.join(', ')+'. O total sai como piso (≥).');

  const nomeAdicional={bando:'Bandô',barra:'Barra niveladora'}[adicional];
  const resumo=[
    u.emMetros(largura_mm)+' × '+u.emMetros(altura_mm),
    colecao.colecao_nome+(corTecido?' '+corTecido:''),
    'Acessórios '+cor.cor_nome,
    'Comando '+COMANDOS[e.comando],
    'Rolamento '+ROLAMENTOS[e.rolamento]
  ].concat(nomeAdicional?[nomeAdicional]:[])
   .concat(reducao.aplicada?['Redução de peso']:[]).join(' · ');

  return {
    modelo:{id:modelo.id, nome:modelo.nome},
    colecao:{id:colecao.id, abertura_id:colecao.abertura_id, nome:colecao.colecao_nome,
             linha_nome:colecao.linha_nome},
    cor_acessorio:{id:cor.cor_id, nome:cor.cor_nome},
    cor_tecido:corTecido, tecido_id,
    medida:{largura_mm, altura_mm, area_mm2,
            largura:u.emMetros(largura_mm), altura:u.emMetros(altura_mm), area:u.emM2(area_mm2)},
    comando:e.comando, rolamento:e.rolamento, adicional,
    degrau:{id:degrau.id, nome:degrau.nome, desconto_mm:degrau.desconto_mm,
            acrescimo_altura_tecido_mm:degrau.acrescimo_altura_tecido_mm},
    /* O que esta medida ACEITA, para a tela oferecer so o possivel — e dizer
       POR QUE, em vez de esconder o botao calado (secao 4.6). */
    opcoes:{bando:podeBando, barra:podeBarra,
            reducao:{pode_pedir:reducao.pode_pedir, automatica:reducao.automatica}},
    componentes, kit, reducao, preco, avisos, resumo
  };
}

module.exports={calcular, FRASE_BANDO, ADICIONAIS, COMANDOS, ROLAMENTOS};
