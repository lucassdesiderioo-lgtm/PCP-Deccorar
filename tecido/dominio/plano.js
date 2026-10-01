// Orquestra o plano de corte: busca candidatos, chama o encaixe, monta a
// proposta. Desde a fase 2 da spec CORTE-EM-ETAPAS (01/10/2026) o Confirmar
// NAO baixa mais nada: ele grava o corte e reserva as fontes. Quem baixa e o
// Corte feito, em dominio/corte.js.
//
// A ORDEM E A POLITICA DA CASA (6.6):
//   1. SOBRA PRIMEIRO, sempre. E a unica razao de o cortador descer ate a
//      outra prateleira, e sem essa regra o retalho nunca sai de la.
//   2. O que sobrou vai para o rolo, simulando TODAS as larguras que existem.
//   3. Peca que nao cabe volta MARCADA, com o motivo. Nunca some em silencio.
//
// R17: NADA BAIXA ANTES DO CORTE FEITO. O plano e proposta.
const crypto=require('crypto');
const db=require('../nucleo/db');
const dia=require('../nucleo/dia');
const {ErroDeRegra,exigir}=require('../nucleo/erros');
const encaixe=require('./encaixe');
const sobra=require('./sobra');
const rolo=require('./rolo');
const etiqueta=require('./etiqueta');
const endereco=require('./endereco');
const config=require('../nucleo/config');
const dTecido=require('../dados/tecido');

const TOL=0.001;
const arred=v=>Math.round(v*1e6)/1e6;
const fmt=v=>(Math.round(v*100)/100).toFixed(2).replace('.',',');
const medida=(l,a)=>fmt(l)+' × '+fmt(a);

// ── as pecas que o operador digitou ──────────────────────────────────────
function lerPecas(lista){
  exigir(Array.isArray(lista)&&lista.length,'sem_pecas','Digite pelo menos uma medida.');
  return lista.map((p,i)=>{
    const largura=Number(String(p.largura==null?'':p.largura).replace(',','.'));
    const altura=Number(String(p.altura==null?'':p.altura).replace(',','.'));
    exigir(isFinite(largura)&&largura>0&&isFinite(altura)&&altura>0,'medida_invalida',
      'A linha '+(i+1)+' esta sem medida valida.');
    exigir(largura<=10&&altura<=60,'medida_absurda',
      'A linha '+(i+1)+' tem medida fora do razoavel — o campo e em METROS.');
    const pedido=String(p.pedido||'').trim();
    return {id:i+1, largura:arred(largura), altura:arred(altura), pedido,
      cliente:String(p.cliente||'').trim()||null};
  });
}

// ── TOM UNICO POR PEDIDO ─────────────────────────────────────────────────
// As pecas do MESMO pedido tem que sair do MESMO lugar.
//
// Nao e otimizacao — e defeito de produto. Duas persianas da mesma casa
// cortadas em fontes diferentes podem chegar com tonalidade diferente, e o
// cliente ve as duas lado a lado na mesma parede. Tres pecas juntas numa
// sobra: otimo. Uma na sobra e duas na bobina: devolucao.
//
// Peca SEM pedido informado e um grupo de uma peca so — livre, porque nao ha
// com quem ela precise combinar.
function agrupar(pecas){
  const grupos=new Map();
  pecas.forEach(p=>{
    const chave=p.pedido?('pedido:'+p.pedido.toUpperCase()):('avulsa:'+p.id);
    if(!grupos.has(chave)) grupos.set(chave,{chave, pedido:p.pedido||null, pecas:[]});
    grupos.get(chave).pecas.push(p);
  });
  // Grupo maior primeiro: o dificil de acomodar tenta as sobras enquanto
  // ainda ha sobra disponivel.
  return [...grupos.values()].sort((a,b)=>
    b.pecas.reduce((s,p)=>s+p.largura*p.altura,0)-a.pecas.reduce((s,p)=>s+p.largura*p.altura,0));
}

// Encaixa numa fonte aceitando SO grupos completos. Um grupo que entrou pela
// metade e desfeito e tentado na fonte seguinte.
function encaixarGruposCompletos(grupos,fonte,params){
  let tentativa=grupos.slice();
  while(tentativa.length){
    const pecas=tentativa.flatMap(g=>g.pecas);
    const r=encaixe.planejar(pecas,[fonte],params);
    const alocadas=new Set();
    r.faixas.forEach(f=>f.pecas.forEach(p=>alocadas.add(p.id)));
    const completos=tentativa.filter(g=>g.pecas.every(p=>alocadas.has(p.id)));
    const parciais=tentativa.filter(g=>g.pecas.some(p=>alocadas.has(p.id))&&
      !g.pecas.every(p=>alocadas.has(p.id)));
    if(!parciais.length) return completos.length?{resultado:r, grupos:completos}:null;
    // Tira os grupos que ficariam divididos e tenta de novo sem eles.
    tentativa=tentativa.filter(g=>!parciais.includes(g));
  }
  return null;
}

// ── O PEDIDO QUE JA FOI CORTADO ANTES ────────────────────────────────────
// O tom unico dentro de um plano nao basta: o pedido 4272 tem onze persianas
// e nada obriga a fabrica a cortar as onze no mesmo dia. Se as duas primeiras
// sairam do rolo R-000005 na terca e as outras nove sairem de outro rolo na
// quinta, o cliente recebe a mesma casa em dois tons — e o sistema teria
// ajudado a errar, porque cada plano, sozinho, estava certo.
//
// Por isso o plano olha para tras: pergunta em que fonte este pedido ja foi
// cortado e, se aquele rolo ainda tem saldo, CONTINUA NELE.
const pHistorico=db.prepare(`
  SELECT pp.pedido, p.id AS plano_id, p.data,
         pf.fonte, pf.rolo_id, pf.sobra_id,
         COUNT(*) AS pecas
    FROM plano_peca pp
    JOIN plano p ON p.id=pp.plano_id
    JOIN plano_faixa pf ON pf.id=pp.faixa_id
   WHERE p.etapa IN ('confirmado','cortando','feito') AND p.id<>?
     AND pp.pedido IS NOT NULL AND pp.pedido<>''
   GROUP BY pp.pedido, pf.fonte, pf.rolo_id, pf.sobra_id
   ORDER BY p.id DESC`);

/* Conta o corte AINDA ABERTO de outra pessoa como corte anterior: o rolo que
   ele reservou e onde o pedido vai sair, mesmo antes do Corte feito. O
   cancelado nao conta — nada saiu dele. E o proprio corte nunca e "anterior"
   de si mesmo: as edicoes da fase 3 recalculam o plano gravado. */
function cortesAnteriores(pedidos,exceto){
  if(!pedidos.length) return [];
  const alvo=new Set(pedidos.map(x=>String(x).toUpperCase()));
  return pHistorico.all(exceto||-1).filter(h=>alvo.has(String(h.pedido).toUpperCase()));
}

/* ── A RESERVA (R3) ───────────────────────────────────────────────────────
   O corte aberto (confirmado ou cortando) segura as fontes dele: a sobra nao
   e oferecida a outro plano, e o rolo aparece para os outros com o saldo
   menos os metros reservados. Sem isso dois operadores pegariam a mesma
   sobra — e agora que a baixa so acontece no Corte feito, o intervalo entre
   confirmar e baixar e de horas, e nao de um clique.

   A reserva NAO tem tabela: ela e a faixa gravada de um corte aberto. Uma
   tabela de reserva ao lado seria a segunda afirmacao sobre o mesmo fato, e
   a que fica para tras e a que deixa a sobra presa para sempre. */
const pReservas=db.prepare(`
  SELECT pf.sobra_id, pf.rolo_id, pf.altura, p.id AS plano_id, p.usuario_nome
    FROM plano_faixa pf JOIN plano p ON p.id=pf.plano_id
   WHERE p.etapa IN ('confirmado','cortando') AND p.id<>?`);
function reservas(exceto){
  const sobras=new Map(), rolos=new Map();
  for(const r of pReservas.all(exceto||-1)){
    if(r.sobra_id) sobras.set(r.sobra_id,{plano_id:r.plano_id, usuario_nome:r.usuario_nome});
    if(r.rolo_id) rolos.set(r.rolo_id,arred((rolos.get(r.rolo_id)||0)+r.altura));
  }
  return {sobras,rolos};
}
// O rolo como os OUTROS cortes o enxergam: saldo menos o reservado.
const livreDe=(r,res)=>r?{...r, saldo:arred(r.saldo-(res.rolos.get(r.id)||0))}:r;

// Uma peca cabe numa fonte quando as DUAS dimensoes passam. Area nao decide
// nada aqui: uma sobra de 0,50 x 4,00 tem 2,00 m2 e nao serve para uma peca
// de 0,90 x 2,00, que tem 1,80.
const serve=(peca,fonte)=>peca.largura<=fonte.largura+TOL&&peca.altura<=fonte.alturaMax+TOL;

/* A maior largura que existe HOJE no estoque deste tecido — bobina ou sobra.
   E o numero contra o qual a peca e medida, e o que a tela mostra ao lado do
   que falta: "precisa de 2,10 e a maior que temos e 2,00" diz na hora se o
   problema e comprar bobina ou so achar a peca certa. */
const larguraDoEstoque=(sobras,rolos)=>
  [...(sobras||[]).map(s=>s.largura), ...(rolos||[]).map(r=>r.largura)]
    .reduce((m,v)=>Math.max(m,v),0);

/* AS PECAS QUE NAO TEM BOBINA, viradas em pedido de compra.

   NAO HA EMENDA nesta fabrica (decisao do dono, 03/09/2026): peca mais larga
   que toda bobina do estoque simplesmente NAO SAI. Isso muda o que a recusa
   significa — nao e um contratempo do encaixe, e uma venda parada esperando
   material. Se ela morre numa linha de texto na tela do corte, quem compra
   tecido nunca fica sabendo que se perdeu a peca por 10 cm de bobina.

   Agrupa por largura necessaria porque e assim que se compra: nao interessa
   que sejam quatro pecas diferentes, interessa que quatro pecas precisam de
   bobina de 2,10 m. Ordenado da maior para a menor — a bobina que resolve a
   maior resolve todas as de baixo. */
function faltaBobina(naoAlocadas, tecido, larguraMaxima){
  const sem=(naoAlocadas||[]).filter(p=>p.largura_necessaria);
  if(!sem.length) return null;

  const porLargura=new Map();
  for(const p of sem){
    const k=Math.round(p.largura_necessaria*1000)/1000;
    const g=porLargura.get(k)||{largura:k, pecas:0, area_m2:0};
    g.pecas++; g.area_m2+=p.largura*p.altura;
    porLargura.set(k,g);
  }
  const larguras=[...porLargura.values()]
    .map(g=>({...g, area_m2:Math.round(g.area_m2*1000)/1000}))
    .sort((a,b)=>b.largura-a.largura);

  return {
    tecido: tecido?(tecido.nome||tecido.codigo||null):null,
    pecas: sem.length,
    larguras,
    largura_necessaria: larguras[0].largura,   // a bobina que resolve TUDO
    largura_maxima_estoque: larguraMaxima||0,
    // Quanto falta de largura. E este numero que doi: perder a venda por 8 cm
    // de bobina e uma conversa; por 60 cm e outra.
    faltam_m: Math.round((larguras[0].largura-(larguraMaxima||0))*1000)/1000
  };
}

/**
 * Monta a proposta. NAO grava nada.
 * @param {{tecido_id, pecas:[{largura,altura}], recusadas:[sobra_id]}} pedido
 */
function calcular(pedido,opcoes){
  const op=opcoes||{};
  const tecido=dTecido.porId(pedido.tecido_id);
  exigir(tecido,'tecido_inexistente','Escolha o tecido.');
  const pecas=lerPecas(pedido.pecas);
  const params=config.paramsDeCorte();
  const recusadas=new Set((pedido.recusadas||[]).map(Number));
  // O que os OUTROS cortes abertos seguram. O proprio corte (op.plano_id)
  // nao se reserva de si mesmo.
  const res=reservas(op.plano_id);

  // ── 1. SOBRAS PRIMEIRO, e por GRUPO INTEIRO ───────────────────────────
  const candidatasTodas=sobra.candidatas(tecido.id);
  const reservadas=candidatasTodas.filter(s=>res.sobras.has(s.id));
  const todasSobras=candidatasTodas.filter(s=>!res.sobras.has(s.id));
  const disponiveis=todasSobras.filter(s=>!recusadas.has(s.id));

  let grupos=agrupar(pecas);
  const fontes=[];
  const usadas=[];

  // O que ja foi cortado deste(s) pedido(s), em outro dia.
  const anteriores=cortesAnteriores([...new Set(pecas.map(p=>p.pedido).filter(Boolean))],op.plano_id);
  const roloAnterior=(()=>{
    for(const h of anteriores){
      if(h.fonte!=='rolo'||!h.rolo_id) continue;
      const r=livreDe(rolo.porId(h.rolo_id),res);
      if(r&&r.status!=='encerrado'&&r.saldo>TOL) return {ref:r, historico:h};
    }
    return null;
  })();

  /* AS QUE SERVIRAM UMA PECA E NAO ENTRARAM (R4). O laco abaixo sabe o motivo
     e antes o jogava fora: sobrava para a tela uma negativa categorica sobre
     sobras que, na prateleira, servem. Guardar aqui e a unica forma de a
     explicacao sair da MESMA regua que decidiu — reconstruir o "por que" depois
     seria uma segunda conta, e as duas divergiriam no primeiro ajuste. */
  const naoEntraram=[];

  for(const s of disponiveis){
    if(!grupos.length) break;
    const fonte={id:'sobra:'+s.id, fonte:'sobra', largura:s.largura, alturaMax:s.altura};
    // SEM ROTACAO quando o tecido tem sentido: uma sobra 0,70 x 3,00 nunca
    // serve para uma peca 3,00 x 0,70. Girar resolveria no papel; no tecido
    // muda o desenho, o brilho e o caimento.
    const cabem=grupos.flatMap(g=>g.pecas).filter(p=>serve(p,fonte));
    if(!cabem.length) continue;

    const tentativa=encaixarGruposCompletos(grupos,fonte,params);
    // Nao entrou, mas serve alguma peca: o `null` aqui quer dizer que todo
    // grupo ou nao cabe, ou ficaria DIVIDIDO — e dividir pedido e o que o tom
    // unico proibe. E isso que a tela passa a dizer.
    if(!tentativa){ naoEntraram.push({sobra:s, pecas:cabem}); continue; }

    grupos=grupos.filter(g=>!tentativa.grupos.includes(g));
    fontes.push(fonte);
    usadas.push({tipo:'sobra', ref:s, fonteId:fonte.id, fonte, grupos:tentativa.grupos});
  }

  // ── 2. O QUE SOBROU VAI PARA O ROLO ───────────────────────────────────
  const rolos=rolo.disponiveis(tecido.id).map(r=>livreDe(r,res)).filter(r=>r.saldo>TOL);
  let simulacoes=[], bobina=null;

  if(grupos.length&&rolos.length){
    const pendentes=grupos.flatMap(g=>g.pecas);
    // Uma simulacao por LARGURA distinta. Dentro de cada largura os rolos
    // entram na ordem da regra: aberto antes de fechado, e entre abertos o
    // de MENOR saldo — fecha o rolo velho antes de abrir outro.
    const porLargura=new Map();
    rolos.forEach(r=>{
      if(!porLargura.has(r.largura)) porLargura.set(r.largura,[]);
      porLargura.get(r.largura).push(r);
    });

    // CONTINUAR NO ROLO DO CORTE ANTERIOR. Deixa de ser uma escolha de
    // aproveitamento e passa a ser de tom: a bobina mais economica nao serve
    // se o resto da casa saiu de outra. Simula so a largura dele, com ele na
    // frente.
    if(roloAnterior){
      const mesmaLargura=(porLargura.get(roloAnterior.ref.largura)||[])
        .filter(r=>r.id!==roloAnterior.ref.id);
      porLargura.clear();
      porLargura.set(roloAnterior.ref.largura,[roloAnterior.ref,...mesmaLargura]);
    }

    simulacoes=[...porLargura.entries()].map(([largura,lista])=>{
      // Um grupo tambem nao se divide entre DOIS ROLOS: rolos diferentes sao
      // lotes diferentes, e lote diferente e tom diferente. Por isso cada
      // rolo recebe so grupos completos.
      let restam=grupos.slice();
      const fontesRolo=[], usadosAqui=[], gruposPorFonte=[];
      for(const r of lista){
        if(!restam.length) break;
        const f={id:'rolo:'+r.id, fonte:'rolo', largura:r.largura, alturaMax:r.saldo};
        const t=encaixarGruposCompletos(restam,f,params);
        if(!t) continue;
        restam=restam.filter(g=>!t.grupos.includes(g));
        fontesRolo.push(f); usadosAqui.push(r); gruposPorFonte.push(t.grupos);
      }
      // A conta da simulacao soma os pedacos, cada um calculado na SUA fonte
      // e so com os grupos que couberam la. Calcular tudo junto de novo
      // deixaria o encaixe livre para dividir um pedido entre dois rolos —
      // exatamente o que a regra do tom unico existe para impedir.
      const soma=combinar(fontesRolo.map((f,i)=>
        encaixe.planejar(gruposPorFonte[i].flatMap(g=>g.pecas),[f],params)));
      return {largura, rolos:usadosAqui, fontesRolo, gruposPorFonte,
        desperdicio:soma.desperdicio, consumoLinear:soma.consumoLinear, consumoM2:soma.consumoM2,
        naoAlocadas:restam.flatMap(g=>g.pecas).length, areaSobras:soma.areaSobras};
    }).filter(s=>s.fontesRolo.length);

    // VENCE A MENOR DESPERDICIO. Empate: menor consumo linear. E nunca a mais
    // larga por padrao — a de 2,00 bate a de 2,50 no exemplo do 6.4.
    simulacoes.sort((a,b)=>
      (a.naoAlocadas-b.naoAlocadas) || (a.desperdicio-b.desperdicio) ||
      (a.consumoLinear-b.consumoLinear) || (a.largura-b.largura));

    bobina=simulacoes[0];
    if(bobina) bobina.fontesRolo.forEach((f,i)=>{
      fontes.push(f);
      usadas.push({tipo:'rolo', ref:bobina.rolos[i], fonteId:f.id, fonte:f,
        grupos:bobina.gruposPorFonte[i]});
      grupos=grupos.filter(g=>!bobina.gruposPorFonte[i].includes(g));
    });
  }

  // ── 3. O PLANO FINAL, fonte por fonte ─────────────────────────────────
  // Cada fonte e calculada SO com os grupos que foram atribuidos a ela, e os
  // pedacos sao somados. Nao da para recalcular tudo junto: o encaixe nao
  // conhece pedido nenhum e dividiria um cliente entre duas fontes.
  const r=combinar(usadas.map(u=>encaixe.planejar(u.grupos.flatMap(g=>g.pecas),[u.fonte],params)));
  // O que sobrou sem fonte volta marcado, com o motivo.
  const semLugar=grupos.flatMap(g=>g.pecas);
  if(semLugar.length){
    const larguraMaxima=[...disponiveis.map(s=>s.largura),...rolos.map(x=>x.largura)]
      .reduce((m,v)=>Math.max(m,v),0);
    semLugar.forEach(p=>{
      const semLargura=p.largura>larguraMaxima+TOL;
      r.pecasNaoAlocadas.push({
        id:p.id, largura:p.largura, altura:p.altura,
        // O CODIGO e o que a compra soma; a frase e o que o operador le.
        codigo: semLargura ? (larguraMaxima?'sem_largura':'sem_estoque')
                           : (p.pedido?'tom_unico':'sem_material'),
        largura_necessaria: semLargura ? p.largura : null,
        motivo: semLargura
          ? (larguraMaxima?'nenhuma bobina em estoque tem largura ≥ '+fmt(p.largura)
                          :'nao ha bobina nem sobra deste tecido em estoque')
          : (p.pedido
              ? 'o pedido '+p.pedido+' inteiro nao coube em nenhuma fonte, e pecas do mesmo pedido nao se separam'
              : 'nao sobrou material para esta peca')});
    });
  }

  // ── 4. VESTE O RESULTADO PARA A TELA ──────────────────────────────────
  const porFonte=new Map(usadas.map(u=>[u.fonteId,u]));
  const faixas=r.faixas.map((f,i)=>{
    const u=porFonte.get(f.fonteId);
    const ref=u&&u.ref;
    return {
      ordem:i, fonte:f.fonte,
      fonte_id:ref?ref.id:null,
      codigo:ref?ref.codigo:'',
      rotulo:f.fonte==='sobra'
        ? 'SOBRA '+(ref?ref.codigo:'')+'   '+(ref?medida(ref.largura,ref.altura):'')
        : 'ROLO '+(ref?ref.codigo:'')+'   bobina '+fmt(f.larguraDisponivel)+
          (ref?' · '+ref.status+' '+fmt(ref.saldo)+' m':''),
      endereco:ref&&ref.nivel_id?endereco.descrever(ref.nivel_id):'',
      largura_disponivel:f.larguraDisponivel, altura:f.altura, largura_usada:f.larguraUsada,
      pecas:f.pecas,
      puxar:f.fonte==='rolo'?f.altura:0
    };
  });

  // As sobras que vao NASCER deste corte. A tela anuncia cada uma com campo
  // para a etiqueta — e o cadastro acontece dentro do Confirmar, nunca numa
  // tela separada que alguem esquece de preencher.
  const sobrasGeradas=r.sobrasGeradas.map((s,i)=>({
    indice:i, largura:s.largura, altura:s.altura, area:s.area,
    de:s.de, faixa:s.faixa===undefined?null:s.faixa,
    origem:(()=>{ const f=s.faixa!==undefined?r.faixas[s.faixa]:null;
      const u=f?porFonte.get(f.fonteId):porFonte.get(s.fonteId);
      return u?{tipo:u.tipo, id:u.ref.id, codigo:u.ref.codigo}:null; })(),
    texto:'resto '+medida(s.largura,s.altura)+' → NOVA SOBRA'
  }));

  /* ── POR QUE A SOBRA QUE SERVE NAO ENTROU (R4) ───────────────────────────
     A frase daqui dizia "nenhuma das 11 sobras deste tecido comporta estas
     pecas — a maior e 1,00 × 1,60 (S-000091)", e a S-000091 comportava a peca
     de 0,92 × 1,50. A tela negava e NOMEAVA a sobra que servia, na mesma
     linha: quem leu concluiu que o sistema so aceita medida exata.

     O motivo real existia duas linhas acima e era descartado. Agora a tela
     recebe a sobra, A PECA que ela comporta e o porque — e a negativa
     categorica so sai quando e verdade. */
  const usouSobra=usadas.some(u=>u.tipo==='sobra');
  // Usou sobra? Nao ha o que explicar, e nao se gasta consulta para isso.
  const naoAprov=usouSobra?[]:sobra.naoAproveitaveis(tecido.id);

  // A MAIOR peca que a sobra comporta: e ela que responde "ate onde essa
  // sobra da". Citar a primeira responderia outra pergunta, menor.
  const pecaMaior=lista=>lista.reduce((m,p)=>(p.largura*p.altura>m.largura*m.altura?p:m),lista[0]);
  // A mesma regua do laco (`serve`), nunca uma segunda: a recusada e a
  // inaproveitavel nunca passaram por ele, e precisam ser medidas igual.
  const pecasQueCabem=s=>pecas.filter(p=>serve(p,{largura:s.largura, alturaMax:s.altura}));

  /* A FRASE INTEIRA SAI DAQUI, inclusive o "e mais N". A tela montava esse
     pedaco e o resultado era uma linha com meia acentuacao — o motivo vem do
     dominio, que escreve sem acento como todos os outros, e o rabo vinha da
     tela, que escreve com. Frase de uma pergunta, um dono. */
  const explicar=(s,quais,codigo,frase)=>{
    const maior=pecaMaior(quais);
    const outras=quais.length-1;
    return {
      id:s.id, codigo:s.codigo, largura:s.largura, altura:s.altura, area:s.area,
      condicao:s.condicao_nome||s.condicao,
      endereco:s.nivel_id?endereco.descrever(s.nivel_id):'',
      peca:{id:maior.id, largura:maior.largura, altura:maior.altura, pedido:maior.pedido||null},
      outras_pecas:outras,
      motivo_codigo:codigo,
      motivo:frase(maior)+(outras
        ? (outras===1 ? ' (e mais 1 peca desta lista tambem cabe nela)'
                      : ' (e mais '+outras+' pecas desta lista tambem cabem nela)')
        : '')
    };
  };

  const sobrasQueServem=usouSobra?[]:[
    ...naoEntraram.map(x=>explicar(x.sobra,x.pecas,'pedido_nao_separa',m=>
      m.pedido
        ? 'serve a peca '+medida(m.largura,m.altura)+', mas o pedido '+m.pedido+
          ' inteiro nao cabe nela — pecas do mesmo pedido nao se separam'
        // Peca avulsa que serve entra sozinha, entao este caso quase nao
        // existe. "Quase" e onde mora defeito: a frase nao inventa pedido.
        : 'serve a peca '+medida(m.largura,m.altura)+', mas o encaixe nao fechou nesta sobra')),

    ...todasSobras.filter(s=>recusadas.has(s.id)).map(s=>[s,pecasQueCabem(s)])
      .filter(([,quais])=>quais.length)
      .map(([s,quais])=>explicar(s,quais,'recusada',m=>
        'serve a peca '+medida(m.largura,m.altura)+' — recusada neste plano')),

    /* RESERVADA NOUTRO CORTE ABERTO (R3). Sem esta linha a sobra do tamanho
       certo sumia do plano sem explicacao — e quem esta com o retalho na mao
       conclui que o sistema errou. */
    ...reservadas.map(s=>[s,pecasQueCabem(s)]).filter(([,quais])=>quais.length)
      .map(([s,quais])=>{ const r=res.sobras.get(s.id);
        return explicar(s,quais,'reservada',m=>
          'serve a peca '+medida(m.largura,m.altura)+', mas esta reservada no corte '+r.plano_id+
          (r.usuario_nome?' de '+r.usuario_nome:'')+', que ainda nao terminou'); }),

    ...naoAprov.map(s=>[s,pecasQueCabem(s)]).filter(([,quais])=>quais.length)
      .map(([s,quais])=>explicar(s,quais,'nao_aproveitavel',m=>
        'serve a peca '+medida(m.largura,m.altura)+', mas a condicao "'+
        (s.condicao_nome||s.condicao)+'" esta marcada como nao aproveitavel no cadastro'))
  ].sort((a,b)=>(b.peca.largura*b.peca.altura)-(a.peca.largura*a.peca.altura)
                || a.codigo.localeCompare(b.codigo));

  // Por que nenhuma sobra serviu. Sem esta frase o operador desconfia do
  // "nao" e vai conferir a prateleira na mao de qualquer jeito.
  let sobreSobras;
  if(usouSobra) sobreSobras=null;
  // A LISTA explica melhor, e com nome e medida. Frase ao lado dela seria a
  // segunda regua da mesma pergunta, dizendo menos.
  else if(sobrasQueServem.length) sobreSobras=null;
  else if(!todasSobras.length&&!naoAprov.length&&reservadas.length)
    sobreSobras=(reservadas.length===1?'A unica sobra deste tecido esta reservada':
      'As '+reservadas.length+' sobras deste tecido estao reservadas')+' em cortes que ainda nao terminaram.';
  else if(!todasSobras.length&&!naoAprov.length)
    sobreSobras='Nao ha nenhuma sobra deste tecido catalogada.';
  else if(disponiveis.length){
    // A MAIOR sai das DISPONIVEIS, nunca de `todasSobras`: com a antiga, a
    // frase apresentava como "a maior" justamente a sobra que o operador
    // acabara de recusar.
    const maior=disponiveis.reduce((m,s)=>(s.largura*s.altura>m.largura*m.altura?s:m),disponiveis[0]);
    sobreSobras='Nenhuma das '+disponiveis.length+' sobras deste tecido comporta estas pecas — a maior e '+
      medida(maior.largura,maior.altura)+' ('+maior.codigo+').';
  }
  else if(recusadas.size) sobreSobras='Todas as sobras deste tecido foram recusadas neste plano.';
  else sobreSobras='As sobras deste tecido estao com a condicao marcada como nao aproveitavel.';

  const proposta={
    tecido:{id:tecido.id, codigo:tecido.codigo,
      nome:[tecido.linha_nome,tecido.abertura_nome,tecido.cor_nome].join(' · ')},
    pecas, faixas,
    pecas_nao_alocadas:r.pecasNaoAlocadas,
    /* O QUE FALTA COMPRAR. Sem emenda, peca larga demais nao tem conserto
       dentro do plano: ou existe bobina que a comporte, ou a peca nao sai.
       Por isso a recusa vira NUMERO — quantas pecas, de que largura, e qual
       a maior que existe hoje. `null` quando nao falta bobina nenhuma. */
    falta_bobina:faltaBobina(r.pecasNaoAlocadas, tecido, larguraDoEstoque(disponiveis,rolos)),
    sobras_geradas:sobrasGeradas,
    refugos:r.refugos,
    consumo_linear:r.consumoLinear, consumo_m2:r.consumoM2,
    area_pecas:r.areaPecas, area_sobras:r.areaSobras, desperdicio:r.desperdicio,
    sobre_sobras:sobreSobras,
    /* A sobra que SERVE uma peca e nao entrou, com o porque (R4). Vazia no
       caso normal — plano que usou sobra nao ganha lista nenhuma, porque
       aviso que aparece sempre e aviso que se aprende a fechar.
       Ela NAO entra na `assinar()`: e explicacao, nao plano. Mudar o texto
       nunca invalida um plano que a tela esta mostrando. */
    sobras_que_servem:sobrasQueServem,
    // Quantas pecas vieram SEM pedido. Nao trava — peca avulsa (amostra,
    // reposicao) e caso legitimo. Mas peca sem pedido nao tem como ser
    // reconhecida como continuacao no dia seguinte, e e melhor a tela dizer
    // isso agora do que a casa descobrir na parede.
    sem_pedido:pecas.filter(x=>!x.pedido).length,
    // O aviso do corte anterior. A tela mostra em destaque: e a diferenca
    // entre continuar o pedido e recomecar de outro tom.
    cortes_anteriores:anteriores.map(h=>({
      pedido:h.pedido, plano_id:h.plano_id, data:h.data, pecas:h.pecas,
      fonte:h.fonte,
      codigo:h.fonte==='rolo'
        ?((rolo.porId(h.rolo_id)||{}).codigo||null)
        :((sobra.porId(h.sobra_id)||{}).codigo||null)
    })),
    continuando_em:roloAnterior?{
      codigo:roloAnterior.ref.codigo, saldo:roloAnterior.ref.saldo,
      pedido:roloAnterior.historico.pedido
    }:null,
    bobina:bobina?{largura:bobina.largura, desperdicio:bobina.desperdicio}:null,
    simulacoes:simulacoes.map(s=>({largura:s.largura, desperdicio:s.desperdicio,
      consumo_linear:s.consumoLinear, consumo_m2:s.consumoM2, nao_alocadas:s.naoAlocadas})),
    sobras_sugeridas:usadas.filter(u=>u.tipo==='sobra').map(u=>({
      id:u.ref.id, codigo:u.ref.codigo, largura:u.ref.largura, altura:u.ref.altura,
      condicao:u.ref.condicao_nome||u.ref.condicao,
      endereco:endereco.descrever(u.ref.nivel_id)})),
    recusadas:[...recusadas],
    parametros:params
  };
  proposta.assinatura=assinar(proposta);
  return proposta;
}

// Soma os resultados de cada fonte num resultado so. O desperdicio e
// aditivo: consumo, area de peca e area de sobra somam, e a formula do 6.4
// aplicada a soma da o mesmo que a soma das formulas.
function combinar(partes){
  const r={faixas:[], pecasNaoAlocadas:[], sobrasGeradas:[], refugos:[],
    consumoLinear:0, consumoM2:0, areaPecas:0, areaSobras:0, areaRefugo:0, desperdicio:0};
  partes.forEach(p=>{
    p.faixas.forEach(f=>r.faixas.push(f));
    p.pecasNaoAlocadas.forEach(x=>r.pecasNaoAlocadas.push(x));
    p.sobrasGeradas.forEach(x=>r.sobrasGeradas.push(x));
    p.refugos.forEach(x=>r.refugos.push(x));
    ['consumoLinear','consumoM2','areaPecas','areaSobras','areaRefugo','desperdicio']
      .forEach(k=>{ r[k]=arred(r[k]+p[k]); });
  });
  // O indice da faixa muda ao juntar as partes; os restos apontam para ela.
  let deslocamento=0;
  partes.forEach(p=>{
    p.sobrasGeradas.concat(p.refugos).forEach(x=>{
      if(x.faixa!==undefined&&x.faixa!==null&&x._ajustado!==true){
        x.faixa+=deslocamento; x._ajustado=true;
      }
    });
    deslocamento+=p.faixas.length;
  });
  r.faixas.forEach((f,i)=>{ f.ordem=i; });
  return r;
}

// A assinatura amarra a proposta ao estoque que ela viu. Entre calcular e
// confirmar, outro cortador pode ter usado a mesma sobra — e confirmar as
// cegas baixaria um plano que ja nao existe.
function assinar(p){
  const alma=JSON.stringify({
    t:p.tecido.id,
    g:p.pecas.map(x=>[x.id,x.pedido||'']),
    f:p.faixas.map(f=>[f.fonte,f.fonte_id,f.altura,f.largura_usada,f.pecas.map(x=>x.id)]),
    s:p.sobras_geradas.map(s=>[s.largura,s.altura]),
    c:p.consumo_linear
  });
  return crypto.createHash('sha256').update(alma).digest('hex').slice(0,16);
}

// ── A RECUSA (R16) ───────────────────────────────────────────────────────
// A sobra recusada volta ao estoque SEM BAIXA, sai das candidatas e o plano e
// recalculado sem ela. O motivo fica gravado na hora — mesmo que o operador
// desista do corte, porque a recusa e diagnostico, nao papelada do plano.
function recusar(dados,usuarioNome){
  const s=sobra.porId(dados.sobra_id);
  exigir(s,'sobra_inexistente','Sobra nao encontrada.');
  exigir(dados.motivo_id,'motivo_obrigatorio','Diga por que esta sobra nao serve.');
  db.prepare(`INSERT INTO plano_recusa(plano_id,sobra_id,motivo_id,observacao,usuario_nome)
    VALUES(?,?,?,?,?)`).run(dados.plano_id||null,s.id,dados.motivo_id,
      dados.observacao||null,usuarioNome||null);
  return {sobra_id:s.id, codigo:s.codigo};
}

// O Confirmar, o Cortar, o Corte feito e o Guardar moram em dominio/corte.js
// (spec CORTE-EM-ETAPAS, fase 2). Aqui fica a CONTA — e ela e uma so para o
// plano novo e para as edicoes do corte aberto.

// A LEITURA do que foi cortado mora em dominio/corte_historico.js (fase 1 da
// spec CORTE-EM-ETAPAS). Ela saiu daqui para nao haver duas listas de cortes.

// faltaBobina sai exportada para o teste alcancar a REGRA DE AGRUPAMENTO sem
// montar um pedido inteiro. Ela e o que vira decisao de compra, e a conta de
// "quantas pecas por largura" e o tipo de coisa que se quebra numa refatoracao
// sem ninguem notar — a tela continuaria mostrando um numero, so que errado.
module.exports={calcular, recusar, faltaBobina, reservas};
