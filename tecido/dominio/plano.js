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
    return {id:i+1, largura:arred(largura), altura:arred(altura)};
  });
}

// Uma peca cabe numa fonte quando as DUAS dimensoes passam. Area nao decide
// nada aqui: uma sobra de 0,50 x 4,00 tem 2,00 m2 e nao serve para uma peca
// de 0,90 x 2,00, que tem 1,80.
const serve=(peca,fonte)=>peca.largura<=fonte.largura+TOL&&peca.altura<=fonte.alturaMax+TOL;

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

  // ── 1. SOBRAS PRIMEIRO ────────────────────────────────────────────────
  const todasSobras=sobra.candidatas(tecido.id);
  const disponiveis=todasSobras.filter(s=>!recusadas.has(s.id));

  let pendentes=pecas.slice();
  const fontes=[];
  const usadas=[];

  for(const s of disponiveis){
    if(!pendentes.length) break;
    const fonte={id:'sobra:'+s.id, fonte:'sobra', largura:s.largura, alturaMax:s.altura};
    // SEM ROTACAO quando o tecido tem sentido: uma sobra 0,70 x 3,00 nunca
    // serve para uma peca 3,00 x 0,70. Girar resolveria no papel; no tecido
    // muda o desenho, o brilho e o caimento.
    if(!pendentes.some(p=>serve(p,fonte))) continue;

    const r=encaixe.planejar(pendentes,[fonte],params);
    if(!r.faixas.length) continue;

    const alocadas=new Set();
    r.faixas.forEach(f=>f.pecas.forEach(p=>alocadas.add(p.id)));
    pendentes=pendentes.filter(p=>!alocadas.has(p.id));
    fontes.push(fonte);
    usadas.push({tipo:'sobra', ref:s, fonteId:fonte.id});
  }

  // ── 2. O QUE SOBROU VAI PARA O ROLO ───────────────────────────────────
  const rolos=rolo.disponiveis(tecido.id);
  let simulacoes=[], bobina=null;

  if(pendentes.length&&rolos.length){
    // Uma simulacao por LARGURA distinta. Dentro de cada largura os rolos
    // entram na ordem da regra: aberto antes de fechado, e entre abertos o
    // de MENOR saldo — fecha o rolo velho antes de abrir outro.
    const porLargura=new Map();
    rolos.forEach(r=>{
      if(!porLargura.has(r.largura)) porLargura.set(r.largura,[]);
      porLargura.get(r.largura).push(r);
    });

    simulacoes=[...porLargura.entries()].map(([largura,lista])=>{
      const fontesRolo=lista.map(r=>({id:'rolo:'+r.id, fonte:'rolo', largura:r.largura, alturaMax:r.saldo}));
      const r=encaixe.planejar(pendentes,fontesRolo,params);
      return {largura, rolos:lista, fontesRolo,
        desperdicio:r.desperdicio, consumoLinear:r.consumoLinear, consumoM2:r.consumoM2,
        naoAlocadas:r.pecasNaoAlocadas.length, areaSobras:r.areaSobras};
    });

    // VENCE A MENOR DESPERDICIO. Empate: menor consumo linear. E nunca a mais
    // larga por padrao — a de 2,00 bate a de 2,50 no exemplo do 6.4.
    simulacoes.sort((a,b)=>
      (a.naoAlocadas-b.naoAlocadas) || (a.desperdicio-b.desperdicio) ||
      (a.consumoLinear-b.consumoLinear) || (a.largura-b.largura));

    bobina=simulacoes[0];
    bobina.fontesRolo.forEach((f,i)=>{
      fontes.push(f);
      usadas.push({tipo:'rolo', ref:bobina.rolos[i], fonteId:f.id});
    });
  }

  // ── 3. O PLANO FINAL, calculado de uma vez com as fontes escolhidas ────
  // Recalcular tudo junto (em vez de somar os pedacos) e o que garante que o
  // desperdicio mostrado e o desperdicio do plano inteiro.
  const r=encaixe.planejar(pecas,fontes,params);

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
    sobras_geradas:sobrasGeradas,
    refugos:r.refugos,
    consumo_linear:r.consumoLinear, consumo_m2:r.consumoM2,
    area_pecas:r.areaPecas, area_sobras:r.areaSobras, desperdicio:r.desperdicio,
    sobre_sobras:sobreSobras,
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

// A assinatura amarra a proposta ao estoque que ela viu. Entre calcular e
// confirmar, outro cortador pode ter usado a mesma sobra — e confirmar as
// cegas baixaria um plano que ja nao existe.
function assinar(p){
  const alma=JSON.stringify({
    t:p.tecido.id,
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
      (plano_id,ordem,tecido_id,largura,altura,faixa_id,pos_x,nao_alocada_motivo)
      VALUES(?,?,?,?,?,?,?,?)`);

    const faixaIds=[];
    p.faixas.forEach(f=>{
      const r=gravaFaixa.run(plano_id,f.ordem,f.fonte,
        f.fonte==='rolo'?f.fonte_id:null, f.fonte==='sobra'?f.fonte_id:null,
        f.largura_disponivel,f.altura,f.largura_usada,null);
      faixaIds[f.ordem]=r.lastInsertRowid;
      f.pecas.forEach(pc=>gravaPeca.run(plano_id,pc.id,p.tecido.id,pc.largura,pc.altura,
        r.lastInsertRowid,pc.x,null));
    });
    // A peca que nao coube fica gravada com o motivo — o plano guarda o que
    // NAO deu certo tambem, senao o historico so conta a metade boa.
    p.pecas_nao_alocadas.forEach(pc=>
      gravaPeca.run(plano_id,pc.id,p.tecido.id,pc.largura,pc.altura,null,null,pc.motivo));

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

module.exports={calcular, confirmar, recusar, historico};
