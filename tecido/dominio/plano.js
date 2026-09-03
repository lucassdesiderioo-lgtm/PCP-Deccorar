// Orquestra o plano de corte: busca candidatos, chama o encaixe, monta a
// proposta — e, so no Confirmar, baixa o estoque.
//
// A ORDEM E A POLITICA DA CASA (6.6):
//   1. SOBRA PRIMEIRO, sempre. E a unica razao de o cortador descer ate a
//      outra prateleira, e sem essa regra o retalho nunca sai de la.
//   2. O que sobrou vai para o rolo, simulando TODAS as larguras que existem.
//   3. Peca que nao cabe volta MARCADA, com o motivo. Nunca some em silencio.
//
// R17: NADA BAIXA ANTES DO CONFIRMAR. O plano e proposta.
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
   WHERE p.confirmado=1 AND pp.pedido IS NOT NULL AND pp.pedido<>''
   GROUP BY pp.pedido, pf.fonte, pf.rolo_id, pf.sobra_id
   ORDER BY p.id DESC`);

function cortesAnteriores(pedidos){
  if(!pedidos.length) return [];
  const alvo=new Set(pedidos.map(x=>String(x).toUpperCase()));
  return pHistorico.all().filter(h=>alvo.has(String(h.pedido).toUpperCase()));
}

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
function calcular(pedido){
  const tecido=dTecido.porId(pedido.tecido_id);
  exigir(tecido,'tecido_inexistente','Escolha o tecido.');
  const pecas=lerPecas(pedido.pecas);
  const params=config.paramsDeCorte();
  const recusadas=new Set((pedido.recusadas||[]).map(Number));

  // ── 1. SOBRAS PRIMEIRO, e por GRUPO INTEIRO ───────────────────────────
  const todasSobras=sobra.candidatas(tecido.id);
  const disponiveis=todasSobras.filter(s=>!recusadas.has(s.id));

  let grupos=agrupar(pecas);
  const fontes=[];
  const usadas=[];

  // O que ja foi cortado deste(s) pedido(s), em outro dia.
  const anteriores=cortesAnteriores([...new Set(pecas.map(p=>p.pedido).filter(Boolean))]);
  const roloAnterior=(()=>{
    for(const h of anteriores){
      if(h.fonte!=='rolo'||!h.rolo_id) continue;
      const r=rolo.porId(h.rolo_id);
      if(r&&r.status!=='encerrado'&&r.saldo>TOL) return {ref:r, historico:h};
    }
    return null;
  })();

  for(const s of disponiveis){
    if(!grupos.length) break;
    const fonte={id:'sobra:'+s.id, fonte:'sobra', largura:s.largura, alturaMax:s.altura};
    // SEM ROTACAO quando o tecido tem sentido: uma sobra 0,70 x 3,00 nunca
    // serve para uma peca 3,00 x 0,70. Girar resolveria no papel; no tecido
    // muda o desenho, o brilho e o caimento.
    if(!grupos.some(g=>g.pecas.some(p=>serve(p,fonte)))) continue;

    const tentativa=encaixarGruposCompletos(grupos,fonte,params);
    if(!tentativa) continue;

    grupos=grupos.filter(g=>!tentativa.grupos.includes(g));
    fontes.push(fonte);
    usadas.push({tipo:'sobra', ref:s, fonteId:fonte.id, fonte, grupos:tentativa.grupos});
  }

  // ── 2. O QUE SOBROU VAI PARA O ROLO ───────────────────────────────────
  const rolos=rolo.disponiveis(tecido.id);
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

  // Por que nenhuma sobra serviu. Sem esta frase o operador desconfia do
  // "nao" e vai conferir a prateleira na mao de qualquer jeito.
  let sobreSobras;
  if(usadas.some(u=>u.tipo==='sobra')) sobreSobras=null;
  else if(!todasSobras.length) sobreSobras='Nao ha nenhuma sobra deste tecido catalogada.';
  else {
    const maior=todasSobras.reduce((m,s)=>(s.largura*s.altura>m.largura*m.altura?s:m),todasSobras[0]);
    const quantas=disponiveis.length;
    sobreSobras=quantas
      ? 'Nenhuma das '+quantas+' sobras deste tecido comporta estas pecas — a maior e '+
        medida(maior.largura,maior.altura)+' ('+maior.codigo+').'
      : 'Todas as sobras deste tecido foram recusadas neste plano.';
  }

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

// ── O CONFIRMAR (R17) ────────────────────────────────────────────────────
// Tudo numa transacao. Se uma linha falhar, NENHUMA baixa acontece.
function confirmar(pedido,usuarioNome){
  // Recalcula do zero e compara com o que a tela mostrou. O cliente nao
  // manda o plano: manda o pedido. Assim ninguem confirma um plano fabricado.
  const p=calcular(pedido);
  exigir(p.assinatura===pedido.assinatura,'plano_mudou',
    'O estoque mudou desde que este plano foi calculado (outra pessoa pode ter usado uma destas sobras). Confira o plano de novo antes de confirmar.');
  exigir(p.faixas.length,'plano_vazio','Este plano nao encaixa nenhuma peca — nao ha o que confirmar.');

  const etiquetas=pedido.etiquetas||{};
  // Toda sobra que vai nascer precisa de etiqueta E endereco ANTES de comecar
  // a baixar. Conferir aqui evita descobrir no meio da transacao.
  p.sobras_geradas.forEach(s=>{
    const e=etiquetas[s.indice];
    exigir(e&&e.codigo,'etiqueta_faltando',
      'Falta a etiqueta da sobra de '+medida(s.largura,s.altura)+'. Cole uma e bipe o codigo.');
    exigir(e.nivel_id,'endereco_faltando',
      'Diga onde a sobra de '+medida(s.largura,s.altura)+' vai ser guardada.');
    etiqueta.conferir(e.codigo);
    endereco.exigirArmazem(e.nivel_id,'SOBRA');
  });

  return db.transaction(()=>{
    const info=db.prepare(`INSERT INTO plano
      (tecido_id,origem,consumo_linear,consumo_m2,area_pecas,area_sobra_gerada,desperdicio,
       usuario_nome,confirmado)
      VALUES(?,?,?,?,?,?,?,?,1)`).run(
        p.tecido.id, pedido.origem||'digitado', p.consumo_linear, p.consumo_m2,
        p.area_pecas, p.area_sobras, p.desperdicio, usuarioNome||null);
    const plano_id=info.lastInsertRowid;

    const gravaFaixa=db.prepare(`INSERT INTO plano_faixa
      (plano_id,ordem,fonte,rolo_id,sobra_id,largura_disponivel,altura,largura_usada,sobra_gerada_codigo)
      VALUES(?,?,?,?,?,?,?,?,?)`);
    const gravaPeca=db.prepare(`INSERT INTO plano_peca
      (plano_id,ordem,tecido_id,largura,altura,faixa_id,pos_x,nao_alocada_motivo,pedido)
      VALUES(?,?,?,?,?,?,?,?,?)`);
    const pedidoDe=id=>{ const x=p.pecas.find(y=>y.id===id); return x&&x.pedido?x.pedido:null; };

    const faixaIds=[];
    p.faixas.forEach(f=>{
      const r=gravaFaixa.run(plano_id,f.ordem,f.fonte,
        f.fonte==='rolo'?f.fonte_id:null, f.fonte==='sobra'?f.fonte_id:null,
        f.largura_disponivel,f.altura,f.largura_usada,null);
      faixaIds[f.ordem]=r.lastInsertRowid;
      f.pecas.forEach(pc=>gravaPeca.run(plano_id,pc.id,p.tecido.id,pc.largura,pc.altura,
        r.lastInsertRowid,pc.x,null,pedidoDe(pc.id)));
    });
    // A peca que nao coube fica gravada com o motivo — o plano guarda o que
    // NAO deu certo tambem, senao o historico so conta a metade boa.
    p.pecas_nao_alocadas.forEach(pc=>
      gravaPeca.run(plano_id,pc.id,p.tecido.id,pc.largura,pc.altura,null,null,pc.motivo,pedidoDe(pc.id)));

    // As sobras usadas saem INTEIRAS (R12), mesmo carregando varias pecas.
    p.sobras_sugeridas.forEach(s=>sobra.marcarUsada(s.id,plano_id,usuarioNome));

    // O rolo baixa metro linear, com referencia ao plano.
    const porRolo=new Map();
    p.faixas.filter(f=>f.fonte==='rolo').forEach(f=>
      porRolo.set(f.fonte_id,arred((porRolo.get(f.fonte_id)||0)+f.altura)));
    for(const [rolo_id,metros] of porRolo) rolo.consumir(rolo_id,metros,plano_id,usuarioNome);

    // As sobras que nascem: cadastradas AQUI DENTRO, com a medida ja
    // calculada e a etiqueta que o operador colou. E isto que faz o modulo
    // se manter em dia sem depender de disciplina.
    p.sobras_geradas.forEach(s=>{
      const e=etiquetas[s.indice];
      const nova=sobra.criar({
        codigo:e.codigo, tecido_id:p.tecido.id, largura:s.largura, altura:s.altura,
        condicao:e.condicao||'integra', nivel_id:e.nivel_id,
        origem:s.origem?s.origem.tipo:'rolo',
        origem_rolo_id:s.origem&&s.origem.tipo==='rolo'?s.origem.id:null,
        origem_sobra_id:s.origem&&s.origem.tipo==='sobra'?s.origem.id:null
      },usuarioNome);
      if(s.faixa!=null&&faixaIds[s.faixa])
        db.prepare('UPDATE plano_faixa SET sobra_gerada_codigo=? WHERE id=?')
          .run(nova.codigo,faixaIds[s.faixa]);
    });

    // O refugo fica MEDIDO. Perda que some do sistema some tambem do
    // relatorio que explicaria o desperdicio do mes.
    const gravaRefugo=db.prepare(`INSERT INTO refugo
      (tecido_id,largura,altura,area,motivo,plano_id,usuario_nome) VALUES(?,?,?,?,?,?,?)`);
    p.refugos.forEach(x=>gravaRefugo.run(p.tecido.id,x.largura,x.altura,x.area,
      x.largura<p.parametros.larguraMinimaSobra?'tira_estreita':x.de,plano_id,usuarioNome||null));

    // As recusas deste plano ganham o vinculo, agora que ele existe.
    if(p.recusadas.length)
      db.prepare('UPDATE plano_recusa SET plano_id=? WHERE plano_id IS NULL AND sobra_id IN ('+
        p.recusadas.map(()=>'?').join(',')+')').run(plano_id,...p.recusadas);

    return {plano_id, consumo_linear:p.consumo_linear, desperdicio:p.desperdicio,
      sobras_criadas:p.sobras_geradas.length, faixas:p.faixas.length};
  })();
}

const historico=limite=>db.prepare(`
  SELECT p.*, t.codigo AS tecido_codigo, l.nome AS linha_nome, a.nome AS abertura_nome, c.nome AS cor_nome
    FROM plano p
    LEFT JOIN tecido t ON t.id=p.tecido_id
    LEFT JOIN linha l ON l.id=t.linha_id
    LEFT JOIN abertura a ON a.id=t.abertura_id
    LEFT JOIN cor c ON c.id=t.cor_id
   WHERE p.confirmado=1 ORDER BY p.id DESC LIMIT ?`).all(limite||30);

// faltaBobina sai exportada para o teste alcancar a REGRA DE AGRUPAMENTO sem
// montar um pedido inteiro. Ela e o que vira decisao de compra, e a conta de
// "quantas pecas por largura" e o tipo de coisa que se quebra numa refatoracao
// sem ninguem notar — a tela continuaria mostrando um numero, so que errado.
module.exports={calcular, confirmar, recusar, historico, faltaBobina};
