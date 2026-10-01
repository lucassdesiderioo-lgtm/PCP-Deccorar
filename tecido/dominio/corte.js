// O CORTE EM ETAPAS — dono unico das etapas do corte e da BAIXA de rolo e
// sobra (spec CORTE-EM-ETAPAS, fase 2, 01/10/2026).
//
//   ① planejar    plano.calcular — nada grava
//   ② confirmar   grava o corte e RESERVA as fontes — nada baixa
//   ③ cortando    o relogio corre; o operador tem a fonte na mao
//   ④ corte feito AQUI baixa: sobra usada, rolo, refugo, e a sobra que nasce
//   ⑤ guardar     a sobra nascida ganha medida, etiqueta e endereco
//
// ⚠️ A BAIXA SAIU DO CONFIRMAR, e e essa a mudanca de regra da fase (R1).
// Em 01/10/2026 um corte foi confirmado rapido, a sobra do plano nao tinha o
// tom do pedido, o operador cortou tudo do rolo — e o sistema ja tinha dado a
// sobra como usada e o rolo como baixado a menos. O Confirmar dizia o que IA
// acontecer; o estoque precisa do que ACONTECEU.
//
// ⚠️ O CORTE FEITO BAIXA O QUE ESTA GRAVADO NO CORTE, e nunca um plano
// recalculado na hora. Entre confirmar e terminar pode ter entrado sobra nova
// na prateleira; recalcular escolheria outra fonte que ninguem cortou. Quem
// muda o plano gravado sao as edicoes do corte aberto (fase 3), pela mesma
// conta do plano.
//
// ⚠️ NENHUMA SOBRA NASCE COM ETIQUETA AQUI (R13). Ela vira "a guardar" em
// nome de quem cortou, e so entra na prateleira — e em plano — quando alguem
// a mede, cola a etiqueta e da o endereco, as tres coisas juntas.
const db=require('../nucleo/db');
const dia=require('../nucleo/dia');
const {ErroDeRegra,exigir}=require('../nucleo/erros');
const plano=require('./plano');
const sobra=require('./sobra');
const rolo=require('./rolo');
const etiqueta=require('./etiqueta');
const historico=require('./corte_historico');

const ABERTAS=['confirmado','cortando'];
const NOME_ETAPA={confirmado:'confirmado — esperando o Cortar',cortando:'cortando',
  feito:'corte feito',cancelado:'cancelado'};
const arred=v=>Math.round(v*1e6)/1e6;
const nomeTecido=t=>t?[t.linha_nome,t.abertura_nome,t.cor_nome].filter(Boolean).join(' · '):'';

const porId=id=>db.prepare('SELECT * FROM plano WHERE id=?').get(Number(id));
const abertoDe=nome=>db.prepare(`SELECT * FROM plano WHERE etapa IN ('confirmado','cortando')
  AND usuario_nome IS ? ORDER BY id DESC LIMIT 1`).get(nome==null?null:String(nome));

function exigirCorte(id){
  const p=porId(id);
  exigir(p&&p.etapa,'corte_inexistente','Corte '+id+' nao encontrado.');
  return p;
}
/* QUEM MEXE NO CORTE ABERTO E QUEM O ABRIU — ou a chefia (`corte.gerir`).
   Sem a guarda, o corte de um operador poderia ser terminado por outro no
   tablet ao lado, e a sobra nascida iria parar na pendencia da pessoa errada. */
function exigirDono(p,usuarioNome,op){
  if((op&&op.gerir)||p.usuario_nome===usuarioNome) return;
  throw new ErroDeRegra('corte_de_outro',
    'O corte '+p.id+' e de '+(p.usuario_nome||'outra pessoa')+'. So quem abriu o corte, ou a chefia, mexe nele.');
}
function exigirEtapa(p,etapas,oque){
  exigir(etapas.includes(p.etapa),'etapa_errada',
    'O corte '+p.id+' esta '+(NOME_ETAPA[p.etapa]||p.etapa)+' — nao da para '+oque+'.');
}

/* ── O RESUMO DO ② ─────────────────────────────────────────────────────────
   Uma linha por fonte, com o endereco e os itens que saem dela: "Sobra
   S-000014 · Haste B, Andar 1, Nivel 2 · Cinza → itens 1 e 3". E a ultima
   olhada antes de ir buscar o tecido, e por isso ela diz ONDE ele esta. */
function resumo(prop){
  const fontes=[];
  for(const f of prop.faixas||[]){
    const chave=f.fonte+':'+f.fonte_id;
    let g=fontes.find(x=>x.chave===chave);
    if(!g){ g={chave, fonte:f.fonte, fonte_id:f.fonte_id, codigo:f.codigo, endereco:f.endereco,
      itens:[], pedidos:[], puxar:0}; fontes.push(g); }
    for(const pc of f.pecas){
      g.itens.push(pc.id);
      const peca=(prop.pecas||[]).find(x=>x.id===pc.id);
      if(peca&&peca.pedido&&!g.pedidos.includes(peca.pedido)) g.pedidos.push(peca.pedido);
    }
    if(f.fonte==='rolo') g.puxar=arred(g.puxar+f.altura);
  }
  fontes.forEach(g=>{ g.itens.sort((a,b)=>a-b); delete g.chave; });
  return fontes;
}

/* ── ② CONFIRMAR ──────────────────────────────────────────────────────────
   Grava o corte, trava o plano e reserva as fontes. NADA BAIXA.
   Recalcula do zero e compara a assinatura com o que a tela mostrou: o
   cliente manda o PEDIDO, nunca o plano — ninguem confirma plano fabricado. */
function confirmar(pedido,usuarioNome){
  // R2 — um corte aberto por operador. A pendencia de guardar sobra nao conta.
  const aberto=abertoDe(usuarioNome);
  exigir(!aberto,'corte_aberto',
    'Voce ja tem o corte '+(aberto&&aberto.id)+' aberto ('+(aberto&&NOME_ETAPA[aberto.etapa])+
    '). Termine ou cancele esse antes de abrir outro.');

  const p=plano.calcular(pedido);
  exigir(p.assinatura===pedido.assinatura,'plano_mudou',
    'O estoque mudou desde que este plano foi calculado (outra pessoa pode ter usado ou reservado uma destas sobras). Confira o plano de novo antes de confirmar.');
  exigir(p.faixas.length,'plano_vazio','Este plano nao encaixa nenhuma peca — nao ha o que confirmar.');

  const entrada={tecido_id:p.tecido.id, pecas:(pedido.pecas||[]).map(x=>({...x})),
    recusadas:p.recusadas, origem:pedido.origem||'digitado'};

  return db.transaction(()=>{
    const info=db.prepare(`INSERT INTO plano
      (tecido_id,origem,consumo_linear,consumo_m2,area_pecas,area_sobra_gerada,desperdicio,
       usuario_nome,confirmado,etapa,entrada,proposta)
      VALUES(?,?,?,?,?,?,?,?,0,'confirmado',?,?)`).run(
        p.tecido.id, entrada.origem, p.consumo_linear, p.consumo_m2,
        p.area_pecas, p.area_sobras, p.desperdicio, usuarioNome||null,
        JSON.stringify(entrada), JSON.stringify(p));
    const plano_id=Number(info.lastInsertRowid);
    gravarPlano(plano_id,p);
    // As recusas feitas no planejamento ganham o vinculo, agora que o corte existe.
    if(p.recusadas.length)
      db.prepare('UPDATE plano_recusa SET plano_id=? WHERE plano_id IS NULL AND sobra_id IN ('+
        p.recusadas.map(()=>'?').join(',')+')').run(plano_id,...p.recusadas);
    return {plano_id, etapa:'confirmado', fontes:resumo(p),
      consumo_linear:p.consumo_linear, sobras_a_nascer:p.sobras_geradas.length};
  })();
}

/* As faixas e as pecas do plano, em linhas. Sao elas que a reserva le, o
   historico mostra e o "pedido ja cortado" consulta. Reescritas inteiras a
   cada edicao do corte aberto (fase 3): o plano gravado e um so. */
function gravarPlano(plano_id,p){
  db.prepare('DELETE FROM plano_peca WHERE plano_id=?').run(plano_id);
  db.prepare('DELETE FROM plano_faixa WHERE plano_id=?').run(plano_id);
  const gravaFaixa=db.prepare(`INSERT INTO plano_faixa
    (plano_id,ordem,fonte,rolo_id,sobra_id,largura_disponivel,altura,largura_usada,sobra_gerada_codigo)
    VALUES(?,?,?,?,?,?,?,?,NULL)`);
  const gravaPeca=db.prepare(`INSERT INTO plano_peca
    (plano_id,ordem,tecido_id,largura,altura,faixa_id,pos_x,nao_alocada_motivo,pedido)
    VALUES(?,?,?,?,?,?,?,?,?)`);
  const pedidoDe=id=>{ const x=p.pecas.find(y=>y.id===id); return x&&x.pedido?x.pedido:null; };
  p.faixas.forEach(f=>{
    const r=gravaFaixa.run(plano_id,f.ordem,f.fonte,
      f.fonte==='rolo'?f.fonte_id:null, f.fonte==='sobra'?f.fonte_id:null,
      f.largura_disponivel,f.altura,f.largura_usada);
    f.pecas.forEach(pc=>gravaPeca.run(plano_id,pc.id,p.tecido.id,pc.largura,pc.altura,
      r.lastInsertRowid,pc.x,null,pedidoDe(pc.id)));
  });
  // A peca que nao coube fica gravada com o motivo — o corte guarda o que NAO
  // deu certo tambem, senao o historico so conta a metade boa.
  p.pecas_nao_alocadas.forEach(pc=>
    gravaPeca.run(plano_id,pc.id,p.tecido.id,pc.largura,pc.altura,null,null,pc.motivo,pedidoDe(pc.id)));
}

/* VOLTAR AO PLANO — so do ②, antes de cortar. Apaga o corte em vez de
   cancela-lo: nada foi cortado, nada saiu da prateleira, e um "cancelado"
   por cada vez que alguem conferiu o resumo e voltou encheria o historico de
   cortes que nunca existiram. Cancelar, com motivo, e do ③. */
function voltar(id,usuarioNome,op){
  const p=exigirCorte(id); exigirDono(p,usuarioNome,op);
  exigirEtapa(p,['confirmado'],'voltar ao plano (ele ja comecou a ser cortado — cancele com motivo)');
  db.transaction(()=>{
    db.prepare('UPDATE plano_recusa SET plano_id=NULL WHERE plano_id=?').run(p.id);
    db.prepare('DELETE FROM plano_peca WHERE plano_id=?').run(p.id);
    db.prepare('DELETE FROM plano_faixa WHERE plano_id=?').run(p.id);
    db.prepare('DELETE FROM plano WHERE id=?').run(p.id);
  })();
  return {plano_id:p.id, apagado:true, entrada:JSON.parse(p.entrada||'{}')};
}

// ③ CORTAR — o operador vai buscar o tecido. O relogio comeca aqui (R19).
function cortar(id,usuarioNome,op){
  const p=exigirCorte(id); exigirDono(p,usuarioNome,op);
  exigirEtapa(p,['confirmado'],'comecar a cortar');
  db.prepare("UPDATE plano SET etapa='cortando', cortar_em=?, cortar_por=? WHERE id=?")
    .run(dia.agora(),usuarioNome||null,p.id);
  return aberto(usuarioNome,p.id);
}

// R4 — cancelar antes do Corte feito. As reservas se soltam sozinhas (elas sao
// a faixa de um corte aberto), nada baixa, e o motivo fica no historico.
function cancelar(id,motivo,usuarioNome,op){
  const p=exigirCorte(id); exigirDono(p,usuarioNome,op);
  exigirEtapa(p,ABERTAS,'cancelar');
  const texto=String(motivo||'').trim();
  exigir(texto,'motivo_obrigatorio','Diga por que o corte esta sendo cancelado — fica no historico.');
  db.prepare("UPDATE plano SET etapa='cancelado', cancelado_em=?, cancelado_por=?, cancelado_motivo=? WHERE id=?")
    .run(dia.agora(),usuarioNome||null,texto,p.id);
  return {plano_id:p.id, etapa:'cancelado'};
}

/* ── ④ CORTE FEITO — a unica baixa de rolo e sobra do modulo ──────────────
   Tudo numa transacao. Se uma linha falhar, NENHUMA baixa acontece e o corte
   continua aberto, com a mensagem dizendo o que. */
function feito(id,usuarioNome,op){
  const c=exigirCorte(id); exigirDono(c,usuarioNome,op);
  exigirEtapa(c,['cortando'],'dar o Corte feito'+(c.etapa==='confirmado'?' (toque em CORTAR antes)':''));
  if(op&&op.antesDaBaixa) op.antesDaBaixa(c);   // as travas das fases seguintes (conferencia de tom)
  const p=JSON.parse(c.proposta);
  const quem=usuarioNome||null;

  return db.transaction(()=>{
    // As sobras usadas saem INTEIRAS (R12), mesmo carregando varias pecas.
    (p.sobras_sugeridas||[]).forEach(s=>sobra.marcarUsada(s.id,c.id,quem));

    // O rolo baixa metro linear, com referencia ao corte.
    const porRolo=new Map();
    p.faixas.filter(f=>f.fonte==='rolo').forEach(f=>
      porRolo.set(f.fonte_id,arred((porRolo.get(f.fonte_id)||0)+f.altura)));
    for(const [rolo_id,metros] of porRolo) rolo.consumir(rolo_id,metros,c.id,quem);

    // A sobra que nasce vira "a guardar", em nome de quem cortou (R13).
    const aGuardar=db.prepare(`INSERT INTO sobra_a_guardar
      (plano_id,tecido_id,largura,altura,de,cortada_errada,origem,origem_rolo_id,origem_sobra_id,cortado_por)
      VALUES(?,?,?,?,?,?,?,?,?,?)`);
    (p.sobras_geradas||[]).forEach(s=>{
      const o=s.origem||{};
      aGuardar.run(c.id,p.tecido.id,s.largura,s.altura,s.de||null,s.cortada_errada?1:0,
        o.tipo||'rolo', o.tipo==='rolo'?o.id:null, o.tipo==='sobra'?o.id:null, quem);
    });

    // O refugo fica MEDIDO. Perda que some do sistema some tambem do
    // relatorio que explicaria o desperdicio do mes.
    const gravaRefugo=db.prepare(`INSERT INTO refugo
      (tecido_id,largura,altura,area,motivo,plano_id,usuario_nome) VALUES(?,?,?,?,?,?,?)`);
    const minLarg=(p.parametros||{}).larguraMinimaSobra||0;
    (p.refugos||[]).forEach(x=>gravaRefugo.run(p.tecido.id,x.largura,x.altura,x.area,
      x.motivo||(x.largura<minLarg?'tira_estreita':x.de),c.id,quem));

    // `confirmado=1` continua dizendo "baixou o estoque", e so agora e verdade.
    // A data do corte passa a ser o dia em que ele foi FEITO.
    // O rolo que ACABOU no meio do corte (edicao da fase 3) e encerrado depois
    // de baixar o que saiu dele: e o acerto de fim (R9 do rolo), na hora certa.
    const entrada=JSON.parse(c.entrada||'{}');
    (entrada.rolos_acabados||[]).forEach(rid=>{
      const r=rolo.porId(rid);
      if(r&&r.status!=='encerrado') rolo.encerrar(rid,quem);
    });

    db.prepare(`UPDATE plano SET etapa='feito', confirmado=1, feito_em=?, feito_por=?,
       data=date('now','localtime') WHERE id=?`).run(dia.agora(),quem,c.id);

    return {plano_id:c.id, etapa:'feito', consumo_linear:p.consumo_linear,
      sobras_a_guardar:(p.sobras_geradas||[]).length};
  })();
}

/* ── O CORTE ABERTO DE ALGUEM, E AS PENDENCIAS ────────────────────────────
   A tela de corte abre DIRETO no corte aberto: o tablet que recarregou no
   meio do corte nao pode cair na tela de planejar, com o operador achando
   que perdeu tudo. */
function aberto(usuarioNome,id){
  const c=id?porId(id):abertoDe(usuarioNome);
  if(!c||!ABERTAS.includes(c.etapa)) return null;
  const p=JSON.parse(c.proposta);
  return {plano_id:c.id, etapa:c.etapa, usuario_nome:c.usuario_nome,
    criado_em:c.criado_em, cortar_em:c.cortar_em,
    entrada:JSON.parse(c.entrada||'{}'), proposta:p, fontes:resumo(p), edicoes:edicoes(c.id)};
}

const CAMPOS_GUARDAR=`g.*, p.criado_em AS corte_em, t.id AS t_id,
  l.nome AS linha_nome, a.nome AS abertura_nome, c.nome AS cor_nome,
  r.codigo AS origem_rolo_codigo, s.codigo AS origem_sobra_codigo,
  CAST(julianday('now','localtime')-julianday(g.criado_em) AS INTEGER) AS dias`;
const DE_GUARDAR=`FROM sobra_a_guardar g
  JOIN plano p ON p.id=g.plano_id
  JOIN tecido t ON t.id=g.tecido_id
  LEFT JOIN linha l ON l.id=t.linha_id
  LEFT JOIN abertura a ON a.id=t.abertura_id
  LEFT JOIN cor c ON c.id=t.cor_id
  LEFT JOIN rolo r ON r.id=g.origem_rolo_id
  LEFT JOIN sobra s ON s.id=g.origem_sobra_id`;
const vestir=g=>({id:g.id, plano_id:g.plano_id, tecido_id:g.tecido_id,
  tecido_nome:nomeTecido(g), largura:g.largura, altura:g.altura, area:g.area,
  de:g.de, cortada_errada:!!g.cortada_errada,
  origem_codigo:g.origem_rolo_codigo||g.origem_sobra_codigo||null,
  origem_rolo_id:g.origem_rolo_id, origem_sobra_id:g.origem_sobra_id,
  cortado_por:g.cortado_por, criado_em:g.criado_em, dias:g.dias,
  guardada_em:g.guardada_em, sobra_id:g.sobra_id});

// R15 — a pendencia nao trava o operador, mas nao some: a tela dele mostra as
// dele no topo, e a chefia ve todas, com quem cortou e ha quanto tempo.
function aGuardar(filtro){
  const f=filtro||{};
  const onde=['g.guardada_em IS NULL','g.cancelada_em IS NULL'], vals=[];
  if(!f.todas){ onde.push('g.cortado_por IS ?'); vals.push(f.usuarioNome==null?null:String(f.usuarioNome)); }
  if(f.plano_id){ onde.push('g.plano_id=?'); vals.push(Number(f.plano_id)); }
  return db.prepare('SELECT '+CAMPOS_GUARDAR+' '+DE_GUARDAR+' WHERE '+onde.join(' AND ')+
    ' ORDER BY g.criado_em, g.id').all(...vals).map(vestir);
}
const doCorte=plano_id=>db.prepare('SELECT '+CAMPOS_GUARDAR+' '+DE_GUARDAR+
  ' WHERE g.plano_id=? ORDER BY g.id').all(plano_id).map(vestir);

/* ── ⑤ GUARDAR ────────────────────────────────────────────────────────────
   Medir, colar a etiqueta e dar o endereco, as tres no mesmo momento (R13).
   A medida VEM — e a pessoa confirma ou corrige medindo a peca. A calculada
   e conta; a que vale e a da fita. */
function guardar(id,dados,usuarioNome,op){
  const d=dados||{};
  const g=db.prepare('SELECT * FROM sobra_a_guardar WHERE id=?').get(Number(id));
  exigir(g,'a_guardar_inexistente','Sobra a guardar nao encontrada.');
  exigir(!g.guardada_em,'ja_guardada','Esta sobra ja foi guardada.');
  exigir(!g.cancelada_em,'a_guardar_cancelada','Esta sobra saiu numa correcao do corte e nao existe mais.');
  if(!((op&&op.gerir)||g.cortado_por===usuarioNome))
    throw new ErroDeRegra('a_guardar_de_outro',
      'Esta sobra e de '+(g.cortado_por||'outra pessoa')+'. Quem guarda e quem cortou, ou a chefia.');
  const veio=k=>d[k]!==undefined&&d[k]!==null&&String(d[k]).trim()!=='';
  exigir(veio('largura')&&veio('altura'),'medida_faltando',
    'Meca a sobra e escolha a largura e a altura — a do sistema e calculada, a que vale e a da fita.');
  exigir(veio('codigo'),'etiqueta_faltando','Cole a etiqueta na sobra e bipe o codigo.');
  exigir(veio('nivel_id'),'endereco_faltando','Diga onde a sobra vai ser guardada.');

  return db.transaction(()=>{
    const s=sobra.criar({codigo:d.codigo, tecido_id:g.tecido_id, largura:d.largura, altura:d.altura,
      condicao:d.condicao||'integra', nivel_id:d.nivel_id,
      origem:g.origem||'rolo', origem_rolo_id:g.origem_rolo_id, origem_sobra_id:g.origem_sobra_id,
      plano_id:g.plano_id},usuarioNome);
    db.prepare('UPDATE sobra_a_guardar SET guardada_em=?, guardada_por=?, sobra_id=? WHERE id=?')
      .run(dia.agora(),usuarioNome||null,s.id,g.id);
    return {a_guardar_id:g.id, sobra:s,
      medida_mudou:Math.abs(s.largura-g.largura)>0.005||Math.abs(s.altura-g.altura)>0.005};
  })();
}

/* ── ③ AS EDICOES DO CORTE ABERTO (fase 3, R5–R8) ─────────────────────────
   Edicao livre, sempre com motivo. Cada uma muda a ENTRADA do corte (o que o
   operador lancou mais o que ele ja disse) e o plano e recalculado pela MESMA
   conta do plano novo — nenhuma edicao tem conta propria. A tela recebe o
   corte aberto de volta, ja recalculado.

     nao_usar      a fonte nao serve (tom diferente, defeito…): sai do plano e
                   as pecas dela vao para onde o plano escolher
     trocar        o item saiu de OUTRA fonte (R7): o operador aponta o codigo,
                   o sistema recalcula os metros
     rolo_acabou   o rolo acabou: o que ja saiu dele fica nele, o resto muda de
                   fonte, e no Corte feito o rolo e encerrado
     medida_errada o item foi cortado errado (R8): o pedaco gastou tecido e vira
                   sobra "cortada errada" (ou refugo); o item volta a ser cortado */
const TIPOS=['nao_usar','trocar','rolo_acabou','medida_errada'];

function motivoDe(motivo_id){
  const m=db.prepare('SELECT * FROM motivo_recusa WHERE id=?').get(Number(motivo_id));
  exigir(m,'motivo_obrigatorio','Escolha o motivo da mudanca — fica no historico do corte.');
  return m;
}
// O codigo bipado diz a fonte: R-000032 e rolo, S-000014 e sobra.
function fontePorCodigo(codigo,tecido_id){
  const c=etiqueta.limpar(codigo);
  exigir(c,'codigo_vazio','Bipe ou digite o codigo do rolo ou da sobra de onde o item saiu.');
  const r=rolo.porCodigo(c);
  if(r){ exigir(r.tecido_id===tecido_id,'fonte_outro_tecido','O rolo '+r.codigo+' e de outro tecido.');
    return {fonte:'rolo', fonte_id:r.id, codigo:r.codigo}; }
  const sb=sobra.porCodigo(c);
  if(sb&&sb.id){ exigir(sb.tecido_id===tecido_id,'fonte_outro_tecido','A sobra '+sb.codigo+' e de outro tecido.');
    return {fonte:'sobra', fonte_id:sb.id, codigo:sb.codigo}; }
  throw new ErroDeRegra('fonte_inexistente','Nao ha rolo nem sobra com o codigo '+c+'.');
}
// Onde o item esta HOJE no plano gravado.
function fonteDoItem(prop,peca){
  for(const f of prop.faixas||[]) if(f.pecas.some(pc=>pc.id===Number(peca)&&!pc.errada))
    return {fonte:f.fonte, fonte_id:f.fonte_id, codigo:f.codigo};
  return null;
}
const semDup=a=>[...new Set(a.map(Number))];

/* Aplica UMA edicao sobre uma entrada e devolve a entrada nova e a frase.
   E a mesma funcao para o corte aberto e para a correcao depois — a correcao
   so difere em quem confere e quando o estoque anda. */
function aplicarEdicao(entrada,prop,ed,tecido_id){
  const e=JSON.parse(JSON.stringify(entrada));
  e.recusadas=e.recusadas||[]; e.excluir_rolos=e.excluir_rolos||[];
  e.fixadas=e.fixadas||{}; e.erradas=e.erradas||[]; e.rolos_acabados=e.rolos_acabados||[];
  const tipo=ed.tipo;
  exigir(TIPOS.includes(tipo),'edicao_invalida','Tipo de mudanca desconhecido.');
  const presoEm=(fonte,fonte_id)=>Object.entries(e.fixadas)
    .filter(([,f])=>f.fonte===fonte&&Number(f.fonte_id)===Number(fonte_id)).map(([k])=>Number(k));
  let frase, alvo={};

  if(tipo==='nao_usar'){
    const f={fonte:ed.fonte, fonte_id:Number(ed.fonte_id)};
    exigir(f.fonte==='rolo'||f.fonte==='sobra','fonte_invalida','Diga qual fonte nao serve.');
    const presos=presoEm(f.fonte,f.fonte_id);
    exigir(!presos.length,'fonte_com_item_preso',
      'O '+(presos.length===1?'item '+presos[0]+' esta marcado':'itens '+presos.join(', ')+' estao marcados')+
      ' como saido desta fonte. Mude a fonte '+(presos.length===1?'dele':'deles')+' antes.');
    if(f.fonte==='sobra') e.recusadas=semDup([...e.recusadas,f.fonte_id]);
    else e.excluir_rolos=semDup([...e.excluir_rolos,f.fonte_id]);
    const cod=f.fonte==='rolo'?(rolo.porId(f.fonte_id)||{}).codigo:(sobra.porId(f.fonte_id)||{}).codigo;
    alvo={fonte:f.fonte, fonte_id:f.fonte_id, codigo:cod};
    frase=(f.fonte==='rolo'?'rolo ':'sobra ')+cod+' saiu do corte';
  }
  else if(tipo==='trocar'){
    const peca=Number(ed.peca);
    exigir((e.pecas||[]).length>=1,'item_inexistente','Corte sem itens.');
    const f=ed.fonte_id?{fonte:ed.fonte, fonte_id:Number(ed.fonte_id)}:fontePorCodigo(ed.codigo,tecido_id);
    e.fixadas[peca]={fonte:f.fonte, fonte_id:f.fonte_id, puxada:ed.puxada||undefined};
    // Se a pessoa diz que o item saiu dali, aquela fonte deixa de estar fora.
    if(f.fonte==='sobra') e.recusadas=e.recusadas.filter(x=>Number(x)!==f.fonte_id);
    else e.excluir_rolos=e.excluir_rolos.filter(x=>Number(x)!==f.fonte_id);
    const cod=f.codigo||(f.fonte==='rolo'?(rolo.porId(f.fonte_id)||{}).codigo:(sobra.porId(f.fonte_id)||{}).codigo);
    alvo={peca, fonte:f.fonte, fonte_id:f.fonte_id, codigo:cod};
    frase='item '+peca+' saiu '+(f.fonte==='rolo'?'do rolo ':'da sobra ')+cod;
  }
  else if(tipo==='rolo_acabou'){
    const rid=Number(ed.fonte_id);
    const r=rolo.porId(rid);
    exigir(r,'rolo_inexistente','Rolo nao encontrado.');
    // O que JA saiu deste rolo fica nele; o resto vai para onde o plano escolher.
    (ed.itens_saidos||[]).map(Number).forEach(i=>{ e.fixadas[i]={fonte:'rolo', fonte_id:rid}; });
    e.excluir_rolos=semDup([...e.excluir_rolos,rid]);
    e.rolos_acabados=semDup([...e.rolos_acabados,rid]);
    alvo={fonte:'rolo', fonte_id:rid, codigo:r.codigo};
    const ja=(ed.itens_saidos||[]);
    frase='rolo '+r.codigo+' acabou'+(ja.length?' — '+(ja.length===1?'o item '+ja[0]+' ja tinha saido dele':'os itens '+ja.join(', ')+' ja tinham saido dele'):'');
  }
  else if(tipo==='medida_errada'){
    const peca=Number(ed.peca);
    const onde=ed.fonte_id?{fonte:ed.fonte, fonte_id:Number(ed.fonte_id)}:fonteDoItem(prop,peca);
    exigir(onde,'item_sem_fonte','O item '+peca+' nao foi cortado de fonte nenhuma neste plano.');
    e.erradas.push({peca, fonte:onde.fonte, fonte_id:onde.fonte_id,
      largura:ed.largura||undefined, altura:ed.altura||undefined});
    delete e.fixadas[peca];
    // Na correcao o item ja foi refeito em algum lugar, e a pessoa diz onde.
    if(ed.refeito_em) e.fixadas[peca]={fonte:ed.refeito_em.fonte, fonte_id:Number(ed.refeito_em.fonte_id), puxada:'refeito'};
    const cod=onde.codigo||(onde.fonte==='rolo'?(rolo.porId(onde.fonte_id)||{}).codigo:(sobra.porId(onde.fonte_id)||{}).codigo);
    alvo={peca, fonte:onde.fonte, fonte_id:onde.fonte_id, codigo:cod};
    frase='item '+peca+' cortado errado '+(onde.fonte==='rolo'?'no rolo ':'na sobra ')+cod+' — volta a ser cortado';
  }
  return {entrada:e, frase, alvo};
}

function editar(id,ed,usuarioNome,op){
  const c=exigirCorte(id); exigirDono(c,usuarioNome,op);
  exigirEtapa(c,['cortando'],'mudar o plano'+(c.etapa==='confirmado'?' (toque em CORTAR, ou volte ao plano)':''));
  const m=motivoDe(ed&&ed.motivo_id);
  const prop=JSON.parse(c.proposta);
  const {entrada,frase,alvo}=aplicarEdicao(JSON.parse(c.entrada||'{}'),prop,ed||{},c.tecido_id);
  // A MESMA conta do plano novo. Se ela recusa (a peca nao cabe na fonte
  // apontada), nada muda e a frase dela chega na bancada.
  const p=plano.calcular(entrada,{plano_id:c.id});
  return db.transaction(()=>{
    db.prepare(`UPDATE plano SET entrada=?, proposta=?, consumo_linear=?, consumo_m2=?, area_pecas=?,
      area_sobra_gerada=?, desperdicio=? WHERE id=?`).run(JSON.stringify(entrada),JSON.stringify(p),
      p.consumo_linear,p.consumo_m2,p.area_pecas,p.area_sobras,p.desperdicio,c.id);
    gravarPlano(c.id,p);
    db.prepare(`INSERT INTO plano_edicao(plano_id,tipo,peca,fonte,fonte_id,fonte_codigo,detalhe,
      motivo_id,motivo_nome,observacao,usuario_nome) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
      c.id,ed.tipo,alvo.peca||null,alvo.fonte||null,alvo.fonte_id||null,alvo.codigo||null,frase,
      m.id,m.nome,String(ed.observacao||'').trim()||null,usuarioNome||null);
    // A sobra que nao serviu continua sendo diagnostico do painel de Recusas.
    if(ed.tipo==='nao_usar'&&alvo.fonte==='sobra')
      db.prepare(`INSERT INTO plano_recusa(plano_id,sobra_id,motivo_id,observacao,usuario_nome)
        VALUES(?,?,?,?,?)`).run(c.id,alvo.fonte_id,m.id,String(ed.observacao||'').trim()||null,usuarioNome||null);
    return {...aberto(usuarioNome,c.id), mudou:frase};
  })();
}

const edicoes=plano_id=>db.prepare('SELECT * FROM plano_edicao WHERE plano_id=? ORDER BY id').all(plano_id);

/* ── A CORRECAO DEPOIS DO CORTE FEITO (fase 3, R16–R17) ────────────────────
   O operador PEDE dizendo o que mudou (as mesmas edicoes); enquanto pendente
   NADA no estoque muda. A chefia aprova e o sistema aplica a DIFERENCA:
   a sobra que nao foi usada volta a disponivel no endereco onde estava, o
   rolo acerta o saldo, as sobras que nao nasceram saem, as que nasceram de
   verdade ficam a guardar, e o refugo e refeito.

   ⚠️ NA CORRECAO TUDO JA FOI CORTADO, e por isso todo item tem fonte fixa:
   a do plano gravado, menos o que a pessoa disse que mudou. Deixar o plano
   escolher fonte aqui inventaria um corte que ninguem fez.

   ⚠️ A VERDADE DO QUE O CORTE BAIXOU E O MOVIMENTO, nao a proposta. Os cortes
   de antes das etapas (R28) nem tem proposta gravada; e para todos, o metro
   que saiu de cada rolo esta no movimento_rolo com a referencia do corte. */
function baseDaCorrecao(c){
  const linhas=db.prepare(`SELECT pp.ordem, pp.largura, pp.altura, pp.pedido, pf.fonte, pf.rolo_id, pf.sobra_id
      FROM plano_peca pp LEFT JOIN plano_faixa pf ON pf.id=pp.faixa_id
     WHERE pp.plano_id=? ORDER BY pp.ordem`).all(c.id);
  const ent=JSON.parse(c.entrada||'{}');
  const fixadas={};
  linhas.filter(l=>l.fonte).forEach(l=>{ fixadas[l.ordem]={fonte:l.fonte,
    fonte_id:l.fonte==='rolo'?l.rolo_id:l.sobra_id, puxada:'corte'}; });
  return {tecido_id:c.tecido_id,
    // So o que saiu de alguma fonte foi cortado; o item sem lugar naquele corte
    // nao entra — a nao ser que a correcao diga de onde ele saiu.
    pecas:linhas.map(l=>({item:l.ordem, largura:l.largura, altura:l.altura, pedido:l.pedido||''})),
    semFonte:linhas.filter(l=>!l.fonte).map(l=>l.ordem),
    recusadas:[], excluir_rolos:[], fixadas, erradas:ent.erradas||[], rolos_acabados:[],
    origem:c.origem};
}

function oQueEsteCorteBaixou(c){
  const sobras=new Set(db.prepare(`SELECT id FROM sobra WHERE status='usada' AND baixa_motivo=?`)
    .all('plano '+c.id).map(r=>r.id));
  const rolos=new Map(db.prepare(`SELECT rolo_id, ROUND(SUM(-delta),6) m FROM movimento_rolo
     WHERE motivo='consumo' AND referencia=? GROUP BY rolo_id`).all(String(c.id))
    .filter(r=>r.m>0.0005).map(r=>[r.rolo_id,r.m]));
  return {sobras,rolos};
}

/* As sobras que nasceram deste corte, do jeito que estao hoje: as a guardar
   (fase 2) e as cadastradas pelo Confirmar antigo (a regua do historico). */
function nascidasDeHoje(c){
  const lista=[];
  db.prepare(`SELECT g.*, s.status AS s_status, s.codigo AS s_codigo FROM sobra_a_guardar g
      LEFT JOIN sobra s ON s.id=g.sobra_id WHERE g.plano_id=? AND g.cancelada_em IS NULL`).all(c.id)
    .forEach(g=>lista.push({tipo:'a_guardar', id:g.id, sobra_id:g.sobra_id, codigo:g.s_codigo,
      largura:g.largura, altura:g.altura, cortada_errada:!!g.cortada_errada,
      origem_rolo_id:g.origem_rolo_id, origem_sobra_id:g.origem_sobra_id,
      status:g.sobra_id?g.s_status:'a guardar'}));
  const jaContadas=new Set(lista.map(x=>x.sobra_id).filter(Boolean));
  historico.nascidas(c.id).filter(s=>!jaContadas.has(s.id)).forEach(s=>{
    const full=db.prepare('SELECT * FROM sobra WHERE id=?').get(s.id);
    if(full.status==='anulada') return;
    lista.push({tipo:'sobra', sobra_id:s.id, codigo:s.codigo, largura:s.largura, altura:s.altura,
      cortada_errada:false, origem_rolo_id:full.origem_rolo_id, origem_sobra_id:full.origem_sobra_id,
      status:s.status});
  });
  return lista;
}

function previa(c,eds){
  exigir(Array.isArray(eds)&&eds.length,'correcao_vazia','Diga o que mudou no corte.');
  let ent=baseDaCorrecao(c);
  const prop=c.proposta?JSON.parse(c.proposta):{faixas:[]};
  for(const ed0 of eds){
    // O que a correcao move foi cortado DEPOIS do plano: e uma puxada propria.
    const ed={...ed0, puxada:'correcao'};
    // O item sem lugar naquele corte so entra se a correcao disser de onde saiu.
    if(ed.tipo==='trocar'&&ent.semFonte.includes(Number(ed.peca)))
      ent.semFonte=ent.semFonte.filter(x=>x!==Number(ed.peca));
    ent=Object.assign(aplicarEdicao(ent,prop,ed,c.tecido_id).entrada,{semFonte:ent.semFonte});
  }
  const fora=new Set(ent.semFonte);
  const entrada={...ent, pecas:ent.pecas.filter(p=>!fora.has(p.item))};
  delete entrada.semFonte;
  // Uma sobra que nao serviu so sai do corte se os itens dela forem para outra
  // fonte: aqui tudo ja foi cortado, e "nao usei" sem "usei esta" nao fecha.
  const baixou=oQueEsteCorteBaixou(c);
  const p=plano.calcular(entrada,{plano_id:c.id, correcao:true, devolvido:baixou});

  // ── a diferenca, item por item ────────────────────────────────────────
  const usadasNovas=new Set((p.sobras_sugeridas||[]).map(x=>x.id));
  const devolver=[...baixou.sobras].filter(id=>!usadasNovas.has(id));
  const usar=[...usadasNovas].filter(id=>!baixou.sobras.has(id));
  const metrosNovos=new Map();
  p.faixas.filter(f=>f.fonte==='rolo').forEach(f=>metrosNovos.set(f.fonte_id,
    Math.round(((metrosNovos.get(f.fonte_id)||0)+f.altura)*1e6)/1e6));
  const rolosIds=new Set([...baixou.rolos.keys(),...metrosNovos.keys()]);
  const rolos=[...rolosIds].map(id=>{
    const r=rolo.porId(id), antes=baixou.rolos.get(id)||0, depois=metrosNovos.get(id)||0;
    return {id, codigo:r&&r.codigo, antes, depois, delta:Math.round((depois-antes)*1e6)/1e6,
      saldo_hoje:r&&r.saldo, status:r&&r.status};
  }).filter(x=>Math.abs(x.delta)>0.0005);

  // As nascidas: casa a de hoje com a nova pela origem e pela medida (1 mm).
  const hoje=nascidasDeHoje(c);
  const novas=(p.sobras_geradas||[]).map(g=>({...g,
    origem_rolo_id:g.origem&&g.origem.tipo==='rolo'?g.origem.id:null,
    origem_sobra_id:g.origem&&g.origem.tipo==='sobra'?g.origem.id:null}));
  const fica=[], nasce=[];
  const livres=hoje.slice();
  for(const n of novas){
    const i=livres.findIndex(h=>(h.origem_rolo_id||null)===(n.origem_rolo_id||null)&&
      (h.origem_sobra_id||null)===(n.origem_sobra_id||null)&&
      Math.abs(h.largura-n.largura)<0.0015&&Math.abs(h.altura-n.altura)<0.0015&&
      !!h.cortada_errada===!!n.cortada_errada);
    if(i>=0) fica.push(livres.splice(i,1)[0]); else nasce.push(n);
  }
  const saem=livres;
  const bloqueios=[];
  saem.filter(h=>h.sobra_id&&h.status!=='disponivel').forEach(h=>bloqueios.push(
    'A sobra '+h.codigo+' nao nasceu deste corte pela correcao, mas ja esta "'+h.status+
    '". Corrija primeiro o corte que a usou.'));
  rolos.filter(x=>x.status==='encerrado').forEach(x=>bloqueios.push(
    'O rolo '+x.codigo+' esta encerrado: a correcao nao tem onde por ou tirar '+Math.abs(x.delta).toFixed(2).replace('.',',')+' m. Acerte o saldo dele a mao, com motivo.'));
  rolos.filter(x=>x.delta>0&&x.status!=='encerrado'&&x.delta>x.saldo_hoje+0.001).forEach(x=>bloqueios.push(
    'O rolo '+x.codigo+' tem '+Number(x.saldo_hoje).toFixed(2).replace('.',',')+' m e a correcao pede mais '+x.delta.toFixed(2).replace('.',',')+' m.'));
  const refugoAntes=db.prepare('SELECT COALESCE(SUM(area),0) a FROM refugo WHERE plano_id=?').get(c.id).a;
  const desc=id=>{ const x=sobra.porId(id)||{}; return {id, codigo:x.codigo, endereco:x.endereco,
    largura:x.largura, altura:x.altura}; };
  return {entrada, proposta:p,
    sobras_voltam:devolver.map(desc), sobras_usadas:usar.map(desc), rolos,
    nascidas_ficam:fica, nascidas_saem:saem, nascidas_novas:nasce.map(n=>({largura:n.largura, altura:n.altura,
      cortada_errada:!!n.cortada_errada, origem:n.origem})),
    refugo:{antes:Math.round(refugoAntes*1e4)/1e4, depois:Math.round((p.refugos||[]).reduce((t,x)=>t+x.area,0)*1e4)/1e4},
    rolos_acabados:entrada.rolos_acabados||[],
    bloqueios};
}
// O que viaja para a tela: a previa sem a proposta inteira.
const previaParaTela=v=>{ const {entrada,proposta,...resto}=v; return resto; };

function pedirCorrecao(id,dados,usuarioNome){
  const c=exigirCorte(id);
  exigirEtapa(c,['feito'],'pedir correcao'+(ABERTAS.includes(c.etapa)?' (o corte ainda esta aberto: mude o plano direto nele)':''));
  const pend=db.prepare("SELECT * FROM plano_correcao WHERE plano_id=? AND status='pendente'").get(c.id);
  exigir(!pend,'correcao_pendente','O corte '+c.id+' ja tem uma correcao esperando a chefia, pedida por '+
    ((pend&&pend.pedida_por)||'alguem')+'. Espere a decisao, ou fale com quem pediu.');
  const m=motivoDe(dados&&dados.motivo_id);
  const v=previa(c,(dados||{}).edicoes);
  const info=db.prepare(`INSERT INTO plano_correcao(plano_id,edicoes,previa,motivo_id,motivo_nome,observacao,pedida_por)
    VALUES(?,?,?,?,?,?,?)`).run(c.id,JSON.stringify(dados.edicoes),JSON.stringify(previaParaTela(v)),
    m.id,m.nome,String(dados.observacao||'').trim()||null,usuarioNome||null);
  return {correcao_id:Number(info.lastInsertRowid), status:'pendente', previa:previaParaTela(v)};
}

function correcaoPendente(cid){
  const k=db.prepare('SELECT * FROM plano_correcao WHERE id=?').get(Number(cid));
  exigir(k,'correcao_inexistente','Correcao nao encontrada.');
  exigir(k.status==='pendente','correcao_decidida','Esta correcao ja foi '+(k.status==='aprovada'?'aprovada':'recusada')+
    ' por '+(k.decidida_por||'alguem')+'.');
  return k;
}

function aprovarCorrecao(cid,usuarioNome){
  const k=correcaoPendente(cid);
  // Quem pediu nao aprova, nem o diretor: a regra da casa para mexer em saldo.
  exigir(!(k.pedida_por&&usuarioNome&&k.pedida_por.trim().toUpperCase()===String(usuarioNome).trim().toUpperCase()),
    'mesma_pessoa','Voce pediu esta correcao — quem aprova e outra pessoa.');
  const c=exigirCorte(k.plano_id);
  // A previa e refeita AGORA: entre pedir e aprovar o estoque andou.
  const v=previa(c,JSON.parse(k.edicoes));
  exigir(!v.bloqueios.length,'correcao_bloqueada',v.bloqueios.join(' '));
  const p=v.proposta, quem=usuarioNome||null, ref='correcao '+k.id+' do corte '+c.id;

  return db.transaction(()=>{
    // 1. as sobras: a que nao foi usada volta para o endereco onde estava
    v.sobras_voltam.forEach(s=>sobra.devolver(s.id,c.id,ref,quem));
    v.sobras_usadas.forEach(s=>sobra.marcarUsada(s.id,c.id,quem));
    // 2. o rolo acerta o saldo pela diferenca
    v.rolos.forEach(r=>rolo.corrigirConsumo(r.id,-r.delta,c.id,ref,quem));
    // 3. as sobras que nao nasceram saem; as que nasceram de verdade ficam a guardar
    v.nascidas_saem.forEach(h=>{
      if(h.tipo==='a_guardar'&&!h.sobra_id)
        db.prepare('UPDATE sobra_a_guardar SET cancelada_em=?, cancelada_por=?, cancelada_motivo=? WHERE id=?')
          .run(dia.agora(),quem,ref,h.id);
      else sobra.anular(h.sobra_id,ref,quem);
    });
    // A sobra antiga que FICA ganha o vinculo direto com o corte: a regua de
    // antes (codigo na faixa) nao sobrevive a reescrita das faixas.
    v.nascidas_ficam.concat(v.nascidas_saem).filter(h=>h.sobra_id)
      .forEach(h=>db.prepare('UPDATE sobra SET plano_id=? WHERE id=? AND plano_id IS NULL').run(c.id,h.sobra_id));
    const ag=db.prepare(`INSERT INTO sobra_a_guardar
      (plano_id,tecido_id,largura,altura,de,cortada_errada,origem,origem_rolo_id,origem_sobra_id,cortado_por)
      VALUES(?,?,?,?,?,?,?,?,?,?)`);
    v.nascidas_novas.forEach(n=>{ const o=n.origem||{};
      ag.run(c.id,c.tecido_id,n.largura,n.altura,n.cortada_errada?'cortada_errada':null,n.cortada_errada?1:0,
        o.tipo||'rolo',o.tipo==='rolo'?o.id:null,o.tipo==='sobra'?o.id:null,c.usuario_nome||null); });
    // 4. o refugo e refeito
    db.prepare('DELETE FROM refugo WHERE plano_id=?').run(c.id);
    const gr=db.prepare(`INSERT INTO refugo(tecido_id,largura,altura,area,motivo,plano_id,usuario_nome) VALUES(?,?,?,?,?,?,?)`);
    const minLarg=(p.parametros||{}).larguraMinimaSobra||0;
    (p.refugos||[]).forEach(x=>gr.run(c.tecido_id,x.largura,x.altura,x.area,
      x.motivo||(x.largura<minLarg?'tira_estreita':x.de),c.id,quem));
    // 5. o rolo que acabou e encerrado, depois de baixar o que saiu dele
    (v.rolos_acabados||[]).forEach(rid=>{ const r=rolo.porId(rid); if(r&&r.status!=='encerrado') rolo.encerrar(rid,quem); });
    // 6. o corte passa a dizer o que aconteceu
    db.prepare(`UPDATE plano SET entrada=?, proposta=?, consumo_linear=?, consumo_m2=?, area_pecas=?,
      area_sobra_gerada=?, desperdicio=? WHERE id=?`).run(JSON.stringify(v.entrada),JSON.stringify(p),
      p.consumo_linear,p.consumo_m2,p.area_pecas,p.area_sobras,p.desperdicio,c.id);
    gravarPlano(c.id,p);
    const ins=db.prepare(`INSERT INTO plano_edicao(plano_id,tipo,peca,fonte,fonte_id,detalhe,motivo_id,motivo_nome,
      observacao,usuario_nome,correcao_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
    JSON.parse(k.edicoes).forEach(ed=>ins.run(c.id,ed.tipo,ed.peca||null,ed.fonte||null,ed.fonte_id||null,
      'correcao '+k.id,k.motivo_id,k.motivo_nome,k.observacao,k.pedida_por,k.id));
    db.prepare("UPDATE plano_correcao SET status='aprovada', decidida_por=?, decidida_em=?, previa=? WHERE id=?")
      .run(quem,dia.agora(),JSON.stringify(previaParaTela(v)),k.id);
    return {correcao_id:k.id, status:'aprovada', previa:previaParaTela(v)};
  })();
}

function recusarCorrecao(cid,motivo,usuarioNome){
  const k=correcaoPendente(cid);
  const t=String(motivo||'').trim();
  exigir(t,'motivo_obrigatorio','Diga por que a correcao foi recusada — quem pediu vai ler.');
  db.prepare("UPDATE plano_correcao SET status='recusada', decidida_por=?, decidida_em=?, decisao_motivo=? WHERE id=?")
    .run(usuarioNome||null,dia.agora(),t,k.id);
  return {correcao_id:k.id, status:'recusada'};
}

const correcoes=filtro=>{
  const f=filtro||{}; const onde=[], vals=[];
  if(f.plano_id){ onde.push('k.plano_id=?'); vals.push(Number(f.plano_id)); }
  if(f.status){ onde.push('k.status=?'); vals.push(f.status); }
  return db.prepare(`SELECT k.*, p.usuario_nome AS cortado_por, p.tecido_id FROM plano_correcao k
     JOIN plano p ON p.id=k.plano_id ${onde.length?'WHERE '+onde.join(' AND '):''} ORDER BY k.id DESC`)
    .all(...vals).map(k=>({...k, edicoes:JSON.parse(k.edicoes), previa:k.previa?JSON.parse(k.previa):null}));
};

module.exports={confirmar, voltar, cortar, cancelar, feito, aberto, aGuardar, doCorte, guardar,
  editar, edicoes, previaCorrecao:(id,eds)=>previaParaTela(previa(exigirCorte(id),eds)),
  pedirCorrecao, aprovarCorrecao, recusarCorrecao, correcoes,
  resumo, gravarPlano, porId, abertoDe, ABERTAS, NOME_ETAPA, exigirCorte, exigirDono, exigirEtapa};
