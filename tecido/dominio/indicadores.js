// OS SETE INDICADORES — dono unico (secao 4.17 da spec
// SOBMEDIDA-PEDIDO-REVENDA, fase 6-B).
//
// Nenhum deles precisou de tabela nova: todos somam o que as fases 3, 5-B1 e
// 5-B2 ja gravam. O que este arquivo carrega sao as CINCO DEFINICOES DE
// MEDIDA, e elas moram aqui porque medida escrita em dois lugares vira dois
// numeros com a mesma autoridade — a armadilha #12.
//
//   1. A REGUA DO BIPE SUSPEITO E UMA SO, e vale para os tres indicadores de
//      tempo. "Esqueceu de bipar o fim e foi almocar: a peca levou tres
//      horas" esta escrito na propria §4.17. `suspeito()` e chamado uma vez
//      sobre a lista, e os tres leem a mesma classificacao.
//   2. NUMERO INCOMPLETO NAO VIRA NUMERO CERTO. Peca com bipe descartado tem
//      a soma MENOR do que foi; entrar na media a puxa para baixo em
//      silencio. Ela e contada a parte e DITA — e a regra 4 do custo
//      (CLAUDE.md §7-B) pela porta do tempo.
//   3. O m² E O REAL, NUNCA O COBRADO. O cobrado carrega o minimo faturado
//      de 1,5 m² (§4.8): pelo cobrado, a persiana de 1,000 × 1,000 pareceria
//      mais rapida por m² do que e. A bancada corta o real.
//   4. PRAZO CUMPRIDO SAO DOIS NUMEROS. Prometido e negociado separados
//      (§4.9) — somados, o pedido empurrado pareceria entregue em dia.
//   5. A RECUSA CONTA NO SETOR DO CULPADO. A pergunta e de onde VEM o
//      defeito; contar em quem recusou acusaria a bancada que o ACHOU.
//
// ⚠️ E O VAZIO NAO E ZERO. Em 24/09/2026 a bancada comecou a bipar e nenhum
// destes numeros existe ainda em producao. `0 h` e `0%` se leem como "levou
// zero" e "cumpriu zero por cento", que sao afirmacoes — e falsas. Cada
// bloco devolve `nada`: 'nunca' (ninguem bipou ainda, espere) ou 'periodo'
// (houve, fora da janela, mude o filtro). Sao conselhos opostos, e sem a
// diferenca a tela parece quebrada nos dois casos — a licao da fase 4-C.
const d=require('../dados/indicadores');
const config=require('../nucleo/config');
const dia=require('../nucleo/dia');
const prazoDom=require('./prazo');
const {SETORES}=require('../nucleo/acesso');

const JANELA_PADRAO=90;

const nomeDoSetor=chave=>{
  const s=SETORES.find(x=>x.chave===chave);
  return s?s.nome:chave;
};

const arred=(n,casas)=>{
  if(n===null||n===undefined||!isFinite(n)) return null;
  const f=Math.pow(10,casas===undefined?2:casas);
  return Math.round(n*f)/f;
};

/* MEDIANA, E NAO MEDIA — e a escolha esta no indicador 1 abaixo, nao aqui.
   Esta funcao so a calcula: com numero par de casos ela tira a media das
   duas do meio, que e a definicao. */
function mediana(nums){
  if(!nums.length) return null;
  const v=nums.slice().sort((a,b)=>a-b);
  const m=Math.floor(v.length/2);
  return v.length%2?v[m]:(v[m-1]+v[m])/2;
}

/* A JANELA. Ela vai escrita ao lado dos numeros porque media sem a janela ao
   lado engana (armadilha #16 do CLAUDE.md, §19).
   ⚠️ E ela NAO precisa do corte do `giro.janela()`, que apara a janela no
   primeiro consumo. La o divisor e DIAS, entao uma janela maior que a
   historia divide por dias que nao existiram e o numero sai menor que a
   verdade. Aqui nenhum indicador divide por dia: divide-se por peca, por m²
   e por pessoa. Janela larga demais aqui nao encolhe nada — so inclui
   trabalho velho, e por isso ela e filtro, nao divisor. */
function janelaDe(opcoes){
  const n=Number((opcoes&&opcoes.dias)||JANELA_PADRAO);
  const dias=(isFinite(n)&&n>0)?Math.floor(n):JANELA_PADRAO;
  const desde=require('../nucleo/db')
    .prepare("SELECT datetime('now','localtime','-'||?||' days') v").get(String(dias)).v;
  return {dias, desde};
}

/* ── A REGUA DO BIPE SUSPEITO ─────────────────────────────────────────────
   Uma funcao, um limite, e ela e aplicada UMA VEZ sobre a lista de bipes.
   Os tres indicadores de tempo leem a marca que ela deixou; nenhum deles
   reclassifica nada. */
const limiteHoras=()=>config.ler('bipeAbertoMaxHoras');

function marcarSuspeitos(lista,limite){
  for(const b of lista) b.suspeito=!(b.horas>=0)||b.horas>limite;
  return lista;
}

/* A PENDENCIA: o que foi descartado e o que continua aberto. Os dois entram
   na mesma lista porque a pergunta de quem le e uma so — "que bipe eu preciso
   corrigir?" —, e a coluna `aberto` separa os dois consertos: um se corrige
   olhando o relogio, o outro indo ate a bancada fechar. */
function suspeitos(bipes,limite){
  const lista=[];
  for(const b of bipes) if(b.suspeito) lista.push({
    componente_id:b.id, codigo:b.codigo, peca:b.nome, setor:b.setor,
    setor_nome:nomeDoSetor(b.setor), pedido_numero:b.pedido_numero,
    pessoa:b.terminado_por||b.iniciado_por||null,
    iniciado_em:b.iniciado_em, terminado_em:b.terminado_em,
    horas:arred(b.horas), aberto:false});
  for(const b of d.abertos()) if(b.horas>limite) lista.push({
    componente_id:b.id, codigo:b.codigo, peca:b.nome, setor:b.setor,
    setor_nome:nomeDoSetor(b.setor), pedido_numero:b.pedido_numero,
    pessoa:b.iniciado_por||null,
    iniciado_em:b.iniciado_em, terminado_em:null,
    horas:arred(b.horas), aberto:true});
  lista.sort((a,b)=>b.horas-a.horas);
  return {limite_horas:limite, lista,
    horas_descartadas:arred(lista.filter(x=>!x.aberto).reduce((s,x)=>s+x.horas,0)),
    abertos:lista.filter(x=>x.aberto).length};
}

/* ── 4 e 5. A PECA COMPLETA ───────────────────────────────────────────────
   Ela e o grao dos dois indicadores, e por isso e calculada uma vez.

   COMPLETA e: todas as etiquetas dela terminaram, e NENHUMA foi descartada.
   A segunda metade e a definicao 2: uma persiana com cinco bipes bons e um
   descartado tem a soma de cinco — menor que a verdade. Entrar na media com
   ela a puxa para baixo, e nada na tela diria por que. */
function pecas(bipes){
  const total=new Map();
  for(const e of d.etiquetasPorItem()) total.set(e.item_id,e.etiquetas);
  const por=new Map();
  for(const b of bipes){
    let p=por.get(b.item_id);
    if(!p){
      p={item_id:b.item_id, item_n:b.item_n, pedido_id:b.pedido_id,
         pedido_numero:b.pedido_numero, m2:(b.m2_real_mm2||0)/1e6,
         feitos:0, horas:0, descartados:0, porSetor:{}};
      por.set(b.item_id,p);
    }
    p.feitos++;
    if(b.suspeito){ p.descartados++; continue; }
    p.horas+=b.horas;
    p.porSetor[b.setor]=(p.porSetor[b.setor]||0)+b.horas;
  }
  for(const p of por.values())
    p.completa=p.descartados===0 && p.feitos===(total.get(p.item_id)||0);
  return [...por.values()];
}

// ── 4. HORAS-HOMEM ────────────────────────────────────────────────────────
function esforco(lista,nada){
  const completas=lista.filter(p=>p.completa);
  const porPedido=new Map();
  for(const p of completas){
    let x=porPedido.get(p.pedido_id);
    if(!x){ x={pedido_id:p.pedido_id, numero:p.pedido_numero, pecas:0, horas:0};
            porPedido.set(p.pedido_id,x); }
    x.pecas++; x.horas+=p.horas;
  }
  const horas=completas.reduce((s,p)=>s+p.horas,0);
  return {nada,
    pecas_completas:completas.length,
    pecas_incompletas:lista.length-completas.length,
    horas_total:completas.length?arred(horas):null,
    horas_por_peca:completas.length?arred(horas/completas.length):null,
    por_pedido:[...porPedido.values()]
      .map(x=>({pedido_id:x.pedido_id, numero:x.numero, pecas:x.pecas,
                horas:arred(x.horas), horas_por_peca:arred(x.horas/x.pecas)}))
      .sort((a,b)=>b.horas-a.horas)};
}

/* ── 5. TEMPO POR m² ──────────────────────────────────────────────────────
   ⚠️ `m2_real_mm2`, NUNCA `m2_cobrado_mm2`. O cobrado carrega o minimo
   faturado de 1,5 m² da §4.8: a persiana de 1,000 × 1,000 tem 1 m² de
   trabalho e 1,5 de fatura, e dividir por 1,5 diria que a peca pequena e
   mais rapida por m² do que ela e. A bancada corta o real. */
function porM2(lista,nada){
  const completas=lista.filter(p=>p.completa && p.m2>0);
  const m2=completas.reduce((s,p)=>s+p.m2,0);
  const horas=completas.reduce((s,p)=>s+p.horas,0);
  const setores={};
  for(const p of completas) for(const s in p.porSetor)
    setores[s]=(setores[s]||0)+p.porSetor[s];
  return {nada,
    pecas:completas.length,
    m2:completas.length?arred(m2,3):null,
    horas:completas.length?arred(horas):null,
    total:(completas.length&&m2>0)?arred(horas/m2):null,
    setores:SETORES.filter(s=>setores[s.chave]!==undefined).map(s=>({
      setor:s.chave, setor_nome:s.nome,
      horas:arred(setores[s.chave]),
      horas_por_m2:m2>0?arred(setores[s.chave]/m2):null}))};
}

/* ── 6. PRODUTIVIDADE ─────────────────────────────────────────────────────
   Duas perguntas, e nao uma: "quanto esta pessoa produz" e "quanto esta
   bancada produz". Um serralheiro a mais muda a segunda e nao a primeira.

   ⚠️ O GRAO AQUI E O BIPE, e nao a peca completa. A produtividade de quem
   corta tubo nao depende de a persiana ter chegado a embalagem — cobrar isso
   dela seria medir uma pessoa pelo trabalho das outras quatro. O que sai e
   so o bipe descartado, pela regua unica. */
function produtividade(bipes,nada){
  const pessoas=new Map(), setores=new Map();
  for(const b of bipes){
    if(b.suspeito) continue;
    const quem=b.terminado_por||'(sem nome)';
    let p=pessoas.get(quem);
    if(!p){ p={pessoa:quem, pecas:0, horas:0, setores:new Set()}; pessoas.set(quem,p); }
    p.pecas++; p.horas+=b.horas; p.setores.add(b.setor);
    let s=setores.get(b.setor);
    if(!s){ s={setor:b.setor, setor_nome:nomeDoSetor(b.setor), pecas:0, horas:0, pessoas:new Set()};
            setores.set(b.setor,s); }
    s.pecas++; s.horas+=b.horas; s.pessoas.add(quem);
  }
  const fim=x=>({pecas:x.pecas, horas:arred(x.horas),
                 horas_por_peca:x.pecas?arred(x.horas/x.pecas):null});
  return {nada,
    pessoas:[...pessoas.values()].map(p=>Object.assign(
      {pessoa:p.pessoa, setores:[...p.setores].map(nomeDoSetor)},fim(p)))
      .sort((a,b)=>b.pecas-a.pecas),
    setores:SETORES.filter(s=>setores.has(s.chave)).map(s=>Object.assign(
      {setor:s.chave, setor_nome:s.nome,
       pessoas:[...setores.get(s.chave).pessoas].length},fim(setores.get(s.chave))))};
}

/* ── 1. TEMPO DE APROVACAO ────────────────────────────────────────────────
   ⚠️ MEDIANA, E NAO MEDIA. Um pedido enviado sexta 18h e aprovado segunda 9h
   leva 63 horas de relogio e cerca de uma de expediente. Numa amostra de
   cinco, a media dispara para 13 h — maior que quatro dos cinco casos — e
   nada na tela diria por que. A mediana aguenta, e o MAIOR vai ao lado para
   ninguem confundir mediana com teto.
   ⚠️ E E TEMPO CORRIDO, dito com todas as letras na tela. "Horas uteis"
   exigiria um cadastro de expediente que nao existe, e inventa-lo seria um
   numero com cara de medido. Os dias de fabrica vao junto, porque e assim
   que a pergunta e feita em voz alta: "leva um dia". */
function aprovacao(linhas,nada){
  const por=new Map();
  for(const l of linhas){
    const quem=l.vendedor_nome||'(sem vendedor)';
    let v=por.get(quem);
    if(!v){ v={vendedor:quem, horas:[], dias:[]}; por.set(quem,v); }
    v.horas.push(l.horas);
    const du=prazoDom.diasUteis(l.enviado_em,l.aprovado_em);
    if(du!==null) v.dias.push(du);
  }
  return {nada, corrido:true, pedidos:linhas.length,
    vendedores:[...por.values()].map(v=>({
      vendedor:v.vendedor, pedidos:v.horas.length,
      horas_mediana:arred(mediana(v.horas)),
      horas_maior:arred(Math.max(...v.horas)),
      dias_uteis_mediana:v.dias.length?mediana(v.dias):null}))
      .sort((a,b)=>b.pedidos-a.pedidos)};
}

/* ── 2. PARADOS NA APROVACAO ──────────────────────────────────────────────
   ⚠️ DIAS DE FABRICA, e negativo FICA negativo: prazo vencido e justamente o
   que a lista existe para mostrar, e zerar deixaria o atrasado com a mesma
   cara de quem vence hoje — o MAX(0,…) do saldo do PCP (§2) pela porta do
   prazo. Mesma regra da fila do vendedor da fase 3. */
function parados(){
  const hoje=dia.hoje();
  const lista=d.parados().map(p=>({
    id:p.id, numero:p.numero, revenda_nome:p.revenda_nome, vendedor:p.vendedor_nome,
    enviado_em:p.enviado_em, horas_parado:arred(p.horas_parado),
    prazo_prometido:p.prazo_prometido, prazo_atual:p.prazo_atual,
    dias_uteis_restantes:p.prazo_atual?prazoDom.diasUteis(hoje,p.prazo_atual):null,
    valor_total_centavos:p.valor_total_centavos}));
  return {nada:lista.length?null:'nunca', lista,
    vencidos:lista.filter(x=>x.dias_uteis_restantes!==null&&x.dias_uteis_restantes<0).length};
}

/* ── 3. PRAZO CUMPRIDO ────────────────────────────────────────────────────
   ⚠️ DOIS NUMEROS, NUNCA UM (§4.9). O negociado sozinho esconde o furo — foi
   por isso que o prazo prometido nao e sobrescrito quando alguem renegocia.
   E porcentagem sem pedido pronto e `null`, nunca zero: "cumpriu 0%" e uma
   afirmacao, e ela seria falsa. */
function prazo(linhas,nada){
  const dt=x=>String(x||'').slice(0,10);
  let p1=0, p2=0, semPrazo=0;
  const atrasados=[];
  for(const l of linhas){
    const pronto=dt(l.pronto_em);
    if(!l.prazo_prometido&&!l.prazo_atual){ semPrazo++; continue; }
    if(l.prazo_prometido&&pronto<=l.prazo_prometido) p1++;
    if(l.prazo_atual&&pronto<=l.prazo_atual) p2++;
    else if(l.prazo_atual) atrasados.push({
      numero:l.numero, revenda_nome:l.revenda_nome, vendedor:l.vendedor_nome,
      prazo_prometido:l.prazo_prometido, prazo_atual:l.prazo_atual,
      pronto_em:l.pronto_em,
      dias_uteis:prazoDom.diasUteis(l.prazo_atual,pronto)});
  }
  const n=linhas.length-semPrazo;
  return {nada, prontos:linhas.length, sem_prazo:semPrazo,
    cumpriu_prometido:p1, cumpriu_negociado:p2,
    pct_prometido:n?Math.round(p1*100/n):null,
    pct_negociado:n?Math.round(p2*100/n):null,
    atrasados};
}

/* ── 7. RECUSAS ───────────────────────────────────────────────────────────
   ⚠️ O SETOR E O DO CULPADO. `recusado_de` e a bancada que ACHOU o erro, e
   contar nela seria uma regua que acusa o inocente. A PESSOA e `feito_por`,
   que so sobrevive na `sm_recusa`: a reabertura apaga o bipe do culpado, que
   e justamente o dado de que este indicador precisa (§4.16). */
function recusas(linhas,nada){
  const conta=(chave,rotulo)=>{
    const m=new Map();
    for(const l of linhas){
      const k=l[chave]||'(sem registro)';
      m.set(k,(m.get(k)||0)+1);
    }
    return [...m.entries()].map(([k,v])=>({[rotulo]:k, recusas:v}))
      .sort((a,b)=>b.recusas-a.recusas);
  };
  return {nada, total:linhas.length,
    setores:conta('setor','setor').map(x=>Object.assign(x,{setor_nome:nomeDoSetor(x.setor)})),
    pessoas:conta('feito_por','pessoa'),
    motivos:conta('motivo_nome','motivo'),
    ultimas:linhas.slice(0,20).map(l=>({
      codigo:l.codigo_etiqueta, peca:l.peca_nome,
      setor_nome:nomeDoSetor(l.setor), pedido_numero:l.pedido_numero,
      motivo:l.motivo_nome, feito_por:l.feito_por,
      recusado_por:l.recusado_por,
      recusado_de:l.recusado_de?nomeDoSetor(l.recusado_de):null,
      criado_em:l.criado_em}))};
}

/* ── O PAINEL ─────────────────────────────────────────────────────────────
   Uma porta, porque a tela faz as sete perguntas de uma vez e sete rotas
   seriam sete idas com sete janelas podendo divergir. */
function painel(opcoes){
  const janela=janelaDe(opcoes);
  const limite=limiteHoras();
  const bipes=marcarSuspeitos(d.bipes(janela.desde),limite);
  const houve=d.algumBipe();
  const nadaBipe=bipes.length?null:(houve?'periodo':'nunca');
  const lista=pecas(bipes);

  const linhasAp=d.aprovacoes(janela.desde);
  const nadaAp=linhasAp.length?null:(d.algumaAprovacao()?'periodo':'nunca');
  const linhasPr=d.prontos(janela.desde);
  const nadaPr=linhasPr.length?null:(d.algumPronto()?'periodo':'nunca');
  const linhasRe=d.recusas(janela.desde);
  const nadaRe=linhasRe.length?null:(d.algumaRecusa()?'periodo':'nunca');

  return {
    janela, limite_horas:limite,
    aprovacao:aprovacao(linhasAp,nadaAp),
    parados:parados(),
    prazo:prazo(linhasPr,nadaPr),
    esforco:esforco(lista,nadaBipe),
    porM2:porM2(lista,nadaBipe),
    produtividade:produtividade(bipes,nadaBipe),
    recusas:recusas(linhasRe,nadaRe),
    suspeitos:suspeitos(bipes,limite)
  };
}

module.exports={painel, mediana, limiteHoras, JANELA_PADRAO};
