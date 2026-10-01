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
    entrada:JSON.parse(c.entrada||'{}'), proposta:p, fontes:resumo(p)};
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

module.exports={confirmar, voltar, cortar, cancelar, feito, aberto, aGuardar, doCorte, guardar,
  resumo, gravarPlano, porId, abertoDe, ABERTAS, NOME_ETAPA, exigirCorte, exigirDono, exigirEtapa};
