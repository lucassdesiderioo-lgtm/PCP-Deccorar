// A EDICAO DURANTE O CORTE E A CORRECAO DEPOIS (spec CORTE-EM-ETAPAS, fase 3).
//
// Durante o corte o operador muda o plano sozinho, com motivo, e o plano e
// recalculado pela mesma conta. Depois do Corte feito ele PEDE, a chefia
// APROVA, e so entao o estoque anda — pela diferenca.
const plano=require('../dominio/plano');
const corte=require('../dominio/corte');
const historico=require('../dominio/corte_historico');
const sobra=require('../dominio/sobra');
const rolo=require('../dominio/rolo');
const etiqueta=require('../dominio/etiqueta');
const tecido=require('../dominio/tecido');
const endereco=require('../dominio/endereco');
const db=require('../nucleo/db');

let base=null, n=0;
function cena(){
  if(!base){
    const linha=tecido.criarLinha({nome:'Rolo'});
    const abertura=tecido.criarAbertura({nome:'Screen 1%',linha_id:linha.id});
    const hR=endereco.criarHaste({nome:'A',armazem_chave:'ROLO'});
    const aR=endereco.criarAndar({nome:'01',haste_id:hR.id});
    const hS=endereco.criarHaste({nome:'C',armazem_chave:'SOBRA'});
    const aS=endereco.criarAndar({nome:'01',haste_id:hS.id});
    const nS=endereco.criarNivel({nome:'01',andar_id:aS.id});
    const nS2=endereco.criarNivel({nome:'02',andar_id:aS.id});
    etiqueta.imprimirLote(150,'teste');
    let seq=0;
    base={linha,abertura,nivelSobra:nS.id,nivelSobra2:nS2.id,
      buraco:()=>endereco.criarNivel({nome:String(++seq).padStart(3,'0'),andar_id:aR.id}).id};
  }
  const cor=tecido.criarCor({nome:'Cor '+(++n)});
  const t=tecido.criarTecido({linha_id:base.linha.id,abertura_id:base.abertura.id,cor_id:cor.id});
  return {...base,t,pedido:'K'+n,quem:'Op'+n};
}
const motivo=nome=>db.prepare('SELECT id FROM motivo_recusa WHERE nome=?').get(nome).id;
const TOM=()=>motivo('Tonalidade diferente');
const novaSobra=(x,l,a,nivel)=>sobra.criar({codigo:etiqueta.pendentes()[0].codigo,tecido_id:x.t.id,
  largura:l,altura:a,condicao:'integra',nivel_id:nivel||x.nivelSobra},'teste');
const novoRolo=(x,larg,m)=>rolo.entrada({tecido_id:x.t.id,largura:larg||'3,00',metragem:m||'50',nivel_id:x.buraco()},'teste');
function cortando(x,pecas){
  const p=plano.calcular({tecido_id:x.t.id,pecas});
  const r=corte.confirmar({tecido_id:x.t.id,pecas,assinatura:p.assinatura},x.quem);
  corte.cortar(r.plano_id,x.quem);
  return {...r,proposta:p};
}
const status=id=>db.prepare('SELECT status, nivel_id FROM sobra WHERE id=?').get(id);
const fontesDe=a=>a.proposta.faixas.map(f=>f.fonte+':'+f.codigo);

/* O CASO DE 01/10/2026, montado do jeito que ele estava: o pedido dividido
   entre uma sobra e um rolo, o Corte feito ja dado. */
function casoDoDia(x,larguraSobra){
  const r=novoRolo(x);
  const s=novaSobra(x,larguraSobra||1.00,2.60);
  const c=cortando(x,[{pedido:x.pedido,largura:'0,95',altura:'2,50'},{pedido:x.pedido+'b',largura:'1,00',altura:'2,00'}]);
  const naSobra=c.proposta.faixas.find(f=>f.fonte==='sobra');
  if(!naSobra) throw new Error('o cenario deveria usar a sobra');
  corte.feito(c.plano_id,x.quem);
  return {r,s,c,itemNaSobra:naSobra.pecas[0].id};
}

module.exports=[

/* ═══ DURANTE O CORTE ═══════════════════════════════════════════════════ */

{nome:'TROCAR A FONTE RECALCULA OS METROS: "o item saiu do rolo R"', executar({igual,perto}){
  const x=cena(); const r=novoRolo(x); const s=novaSobra(x,1.00,2.60);
  const c=cortando(x,[{pedido:x.pedido,largura:'0,95',altura:'2,50'}]);
  igual(c.proposta.faixas[0].fonte,'sobra','o plano mandou para a sobra');
  const a=corte.editar(c.plano_id,{tipo:'trocar',peca:1,codigo:r.codigo,motivo_id:TOM()},x.quem);
  igual(a.proposta.faixas.length,1,'uma faixa');
  igual(a.proposta.faixas[0].fonte,'rolo','agora o item saiu do rolo');
  perto(a.proposta.consumo_linear,2.50,'e o rolo puxa 2,50 m');
  igual(a.proposta.sobras_sugeridas.length,0,'a sobra saiu do corte');
  igual(a.edicoes.length,1,'a edicao ficou gravada');
  igual(/item 1 saiu do rolo/.test(a.edicoes[0].detalhe),true,'com a frase: '+a.edicoes[0].detalhe);
  igual(a.edicoes[0].usuario_nome,x.quem,'com quem');
  igual(a.edicoes[0].motivo_nome,'Tonalidade diferente','e o motivo');
  // E a sobra fica livre para outro plano.
  const outro=plano.calcular({tecido_id:x.t.id,pecas:[{pedido:'z'+x.pedido,largura:'0,95',altura:'2,50'}]});
  igual(outro.sobras_sugeridas[0]&&outro.sobras_sugeridas[0].id,s.id,'a sobra voltou a ser livre');
}},

{nome:'toda edicao exige motivo, e a recusada nao muda nada', executar({recusa,igual}){
  const x=cena(); const r=novoRolo(x); novaSobra(x,1.00,2.60);
  const c=cortando(x,[{pedido:x.pedido,largura:'0,95',altura:'2,50'}]);
  recusa(()=>corte.editar(c.plano_id,{tipo:'trocar',peca:1,codigo:r.codigo},x.quem),'motivo_obrigatorio');
  igual(corte.edicoes(c.plano_id).length,0,'nada gravado');
}},

{nome:'apontar uma fonte onde o item NAO cabe e recusado dizendo por que', executar({recusa,igual}){
  const x=cena(); novoRolo(x); const pequena=novaSobra(x,0.90,1.00);
  const c=cortando(x,[{pedido:x.pedido,largura:'1,50',altura:'2,00'}]);
  const e=recusa(()=>corte.editar(c.plano_id,{tipo:'trocar',peca:1,codigo:pequena.codigo,motivo_id:TOM()},x.quem),'nao_cabe_na_fonte');
  igual(new RegExp(pequena.codigo).test(e.mensagem),true,'a frase diz a fonte: '+e.mensagem);
  igual(corte.edicoes(c.plano_id).length,0,'e nada muda');
}},

{nome:'NAO USAR a sobra (tom diferente) manda as pecas para outra fonte e vira recusa do painel', executar({igual}){
  const x=cena(); novoRolo(x); const s=novaSobra(x,1.00,2.60);
  const c=cortando(x,[{pedido:x.pedido,largura:'0,95',altura:'2,50'}]);
  const a=corte.editar(c.plano_id,{tipo:'nao_usar',fonte:'sobra',fonte_id:s.id,motivo_id:TOM()},x.quem);
  igual(a.proposta.faixas.every(f=>f.fonte==='rolo'),true,'foi tudo para o rolo');
  igual(db.prepare('SELECT COUNT(*) n FROM plano_recusa WHERE plano_id=? AND sobra_id=?').get(c.plano_id,s.id).n,1,
    'a recusa ficou para o painel de Recusas');
}},

{nome:'MEDIDA ERRADA: o pedaco vira sobra "cortada errada" e o item volta a ser cortado', executar({igual,perto}){
  const x=cena(); const r=novoRolo(x);
  const c=cortando(x,[{pedido:x.pedido,largura:'1,00',altura:'2,00'}]);
  const a=corte.editar(c.plano_id,{tipo:'medida_errada',peca:1,motivo_id:motivo('Medida errada')},x.quem);
  perto(a.proposta.consumo_linear,4.00,'o rolo puxa as duas vezes');
  const errada=a.proposta.sobras_geradas.find(g=>g.cortada_errada);
  igual(!!errada,true,'o pedaco errado vira sobra marcada');
  perto(errada.largura,1.00,'com a medida do pedaco');
  perto(a.proposta.area_pecas,2.00,'a area de pecas conta a peca uma vez so');
  corte.feito(c.plano_id,x.quem);
  const g=corte.doCorte(c.plano_id).find(z=>z.cortada_errada);
  igual(!!g,true,'e nasce a guardar, marcada "cortada errada"');
  perto(rolo.porId(r.id).saldo,46,'o rolo baixou 4 m');
}},

{nome:'medida errada pequena demais para sobra vira REFUGO, medido', executar({igual,perto}){
  const x=cena(); novoRolo(x);
  const c=cortando(x,[{pedido:x.pedido,largura:'0,50',altura:'1,20'}]);
  const a=corte.editar(c.plano_id,{tipo:'medida_errada',peca:1,motivo_id:motivo('Medida errada')},x.quem);
  igual(a.proposta.sobras_geradas.some(g=>g.cortada_errada),false,'nao vira sobra (abaixo da largura minima)');
  const rf=a.proposta.refugos.find(z=>z.motivo==='cortada_errada');
  perto(rf.area,0.6,'vira refugo medido');
  corte.feito(c.plano_id,x.quem);
  igual(db.prepare("SELECT COUNT(*) n FROM refugo WHERE plano_id=? AND motivo='cortada_errada'").get(c.plano_id).n,1,'gravado no refugo');
}},

{nome:'ROLO ACABOU: o que ja saiu fica nele, o resto muda, e no Corte feito ele e encerrado', executar({igual}){
  const x=cena(); const r1=novoRolo(x); const r2=novoRolo(x);
  const c=cortando(x,[{pedido:x.pedido,largura:'1,00',altura:'2,00'},{pedido:x.pedido+'b',largura:'1,00',altura:'2,00'}]);
  const usado=c.proposta.faixas[0].fonte_id, outro=usado===r1.id?r2.id:r1.id;
  const a=corte.editar(c.plano_id,{tipo:'rolo_acabou',fonte_id:usado,itens_saidos:[1],motivo_id:motivo('Rolo acabou')},x.quem);
  const do1=a.proposta.faixas.find(f=>f.pecas.some(p=>p.id===1));
  const do2=a.proposta.faixas.find(f=>f.pecas.some(p=>p.id===2));
  igual(do1.fonte_id,usado,'o item 1 ficou no rolo que acabou');
  igual(do2.fonte_id,outro,'o item 2 foi para o outro rolo');
  corte.feito(c.plano_id,x.quem);
  igual(rolo.porId(usado).status,'encerrado','o rolo que acabou foi encerrado');
  igual(rolo.conferirSaldos().length,0,'e o saldo bate com o movimento');
}},

{nome:'so se edita o corte que esta CORTANDO', executar({recusa}){
  const x=cena(); const r=novoRolo(x);
  const p=plano.calcular({tecido_id:x.t.id,pecas:[{pedido:x.pedido,largura:'1,00',altura:'2,00'}]});
  const c=corte.confirmar({tecido_id:x.t.id,pecas:[{pedido:x.pedido,largura:'1,00',altura:'2,00'}],assinatura:p.assinatura},x.quem);
  recusa(()=>corte.editar(c.plano_id,{tipo:'trocar',peca:1,codigo:r.codigo,motivo_id:TOM()},x.quem),'etapa_errada');
}},

/* ═══ DEPOIS DO CORTE FEITO ═════════════════════════════════════════════ */

{nome:'CORRECAO PENDENTE NAO MEXE NO ESTOQUE', executar({igual,perto}){
  const x=cena(); const {r,s,c,itemNaSobra}=casoDoDia(x);
  const saldo=rolo.porId(r.id).saldo;
  const k=corte.pedirCorrecao(c.plano_id,{edicoes:[{tipo:'trocar',peca:itemNaSobra,codigo:r.codigo}],motivo_id:TOM()},x.quem);
  igual(k.status,'pendente','pendente');
  igual(status(s.id).status,'usada','a sobra continua usada');
  perto(rolo.porId(r.id).saldo,saldo,'o rolo nao andou');
  igual(k.previa.sobras_voltam.map(z=>z.codigo).join(),s.codigo,'a previa ja diz que a sobra volta');
  igual(k.previa.rolos.length,1,'e que o rolo acerta');
  perto(k.previa.rolos[0].delta,2.50,'mais 2,50 m do rolo');
}},

{nome:'CORRECAO APROVADA DEVOLVE A SOBRA AO ENDERECO E ACERTA O ROLO', executar({igual,perto}){
  const x=cena(); const {r,s,c,itemNaSobra}=casoDoDia(x);
  const nivelAntes=status(s.id).nivel_id, saldo=rolo.porId(r.id).saldo;
  const k=corte.pedirCorrecao(c.plano_id,{edicoes:[{tipo:'trocar',peca:itemNaSobra,codigo:r.codigo}],motivo_id:TOM()},x.quem);
  corte.aprovarCorrecao(k.correcao_id,'Chefia');
  igual(status(s.id).status,'disponivel','a sobra voltou a disponivel');
  igual(status(s.id).nivel_id,nivelAntes,'no endereco onde estava');
  perto(rolo.porId(r.id).saldo,saldo-2.50,'o rolo baixou o que de fato saiu');
  igual(rolo.conferirSaldos().length,0,'saldo bate com o movimento');
  const d=historico.detalhe(c.plano_id);
  igual(d.fontes.every(f=>f.fonte==='rolo'),true,'o historico mostra o corte como foi');
  igual(db.prepare("SELECT COUNT(*) n FROM sobra_correcao WHERE sobra_id=? AND campo='status'").get(s.id).n,1,'a sobra tem o rastro');
  // A sobra que voltou entra em plano de novo.
  const p=plano.calcular({tecido_id:x.t.id,pecas:[{pedido:'z'+x.pedido,largura:'0,95',altura:'2,50'}]});
  igual(p.sobras_sugeridas[0]&&p.sobras_sugeridas[0].id,s.id,'e volta a ser oferecida');
}},

{nome:'a sobra que nao nasceu sai, e a que nasceu de verdade fica a guardar', executar({igual}){
  const x=cena(); const {r,c,itemNaSobra}=casoDoDia(x,1.90);
  const antes=corte.doCorte(c.plano_id);
  const daSobra=antes.filter(g=>g.origem_sobra_id);
  igual(daSobra.length>0,true,'o cenario faz nascer sobra da sobra');
  const k=corte.pedirCorrecao(c.plano_id,{edicoes:[{tipo:'trocar',peca:itemNaSobra,codigo:r.codigo}],motivo_id:TOM()},x.quem);
  corte.aprovarCorrecao(k.correcao_id,'Chefia');
  const depois=db.prepare('SELECT * FROM sobra_a_guardar WHERE plano_id=?').all(c.plano_id);
  daSobra.forEach(g=>igual(!!depois.find(z=>z.id===g.id).cancelada_em,true,'a que ia nascer da sobra foi cancelada'));
  igual(corte.aGuardar({plano_id:c.plano_id,todas:true}).every(g=>!g.origem_sobra_id),true,'nada a guardar vem da sobra que nao foi cortada');
}},

{nome:'CORRECAO RECUSADA NAO MUDA NADA, e exige o porque', executar({igual,recusa,perto}){
  const x=cena(); const {r,s,c,itemNaSobra}=casoDoDia(x);
  const saldo=rolo.porId(r.id).saldo;
  const k=corte.pedirCorrecao(c.plano_id,{edicoes:[{tipo:'trocar',peca:itemNaSobra,codigo:r.codigo}],motivo_id:TOM()},x.quem);
  recusa(()=>corte.recusarCorrecao(k.correcao_id,'','Chefia'),'motivo_obrigatorio');
  corte.recusarCorrecao(k.correcao_id,'a sobra foi usada sim, conferi','Chefia');
  igual(status(s.id).status,'usada','a sobra continua usada');
  perto(rolo.porId(r.id).saldo,saldo,'o rolo nao andou');
  const reg=corte.correcoes({plano_id:c.plano_id})[0];
  igual(reg.status,'recusada','fica registrada');
  igual(reg.decisao_motivo,'a sobra foi usada sim, conferi','com o motivo');
  recusa(()=>corte.aprovarCorrecao(k.correcao_id,'Chefia'),'correcao_decidida','e nao se aprova depois');
}},

{nome:'QUEM PEDIU NAO APROVA', executar({recusa}){
  const x=cena(); const {r,c,itemNaSobra}=casoDoDia(x);
  const k=corte.pedirCorrecao(c.plano_id,{edicoes:[{tipo:'trocar',peca:itemNaSobra,codigo:r.codigo}],motivo_id:TOM()},x.quem);
  recusa(()=>corte.aprovarCorrecao(k.correcao_id,x.quem.toLowerCase()+' '),'mesma_pessoa');
}},

{nome:'uma correcao pendente por corte, e so de corte feito', executar({recusa}){
  const x=cena(); const {r,c,itemNaSobra}=casoDoDia(x);
  corte.pedirCorrecao(c.plano_id,{edicoes:[{tipo:'trocar',peca:itemNaSobra,codigo:r.codigo}],motivo_id:TOM()},x.quem);
  recusa(()=>corte.pedirCorrecao(c.plano_id,{edicoes:[{tipo:'trocar',peca:itemNaSobra,codigo:r.codigo}],motivo_id:TOM()},x.quem),'correcao_pendente');
  const y=cena(); novoRolo(y);
  const aberto=cortando(y,[{pedido:y.pedido,largura:'1,00',altura:'2,00'}]);
  recusa(()=>corte.pedirCorrecao(aberto.plano_id,{edicoes:[{tipo:'medida_errada',peca:1}],motivo_id:TOM()},y.quem),'etapa_errada');
}},

{nome:'a correcao e BLOQUEADA quando a sobra que "nao nasceu" ja foi usada noutro corte', executar({igual,recusa}){
  const x=cena(); const {r,c,itemNaSobra}=casoDoDia(x,1.90);
  // A sobra nascida da sobra foi guardada e usada noutro corte antes da correcao.
  const g=corte.doCorte(c.plano_id).find(z=>z.origem_sobra_id);
  if(!g) throw new Error('o cenario deveria fazer nascer sobra da sobra');
  const gs=corte.guardar(g.id,{largura:g.largura,altura:g.altura,codigo:etiqueta.pendentes()[0].codigo,nivel_id:x.nivelSobra},x.quem);
  db.prepare("UPDATE sobra SET status='usada', baixa_motivo='plano 999' WHERE id=?").run(gs.sobra.id);
  const k=corte.pedirCorrecao(c.plano_id,{edicoes:[{tipo:'trocar',peca:itemNaSobra,codigo:r.codigo}],motivo_id:TOM()},x.quem);
  igual(k.previa.bloqueios.length>0,true,'a previa ja mostra o bloqueio');
  recusa(()=>corte.aprovarCorrecao(k.correcao_id,'Chefia'),'correcao_bloqueada');
}},

{nome:'R28 — O CORTE DE ANTES DAS ETAPAS SE CORRIGE (o de 01/10/2026)', executar({igual,perto}){
  /* O corte antigo nao tem proposta nem entrada gravadas: ele baixou no
     Confirmar e cadastrou as sobras na hora. Monta-se aqui um assim, e ele
     tem que se corrigir pela tela como qualquer outro. */
  const x=cena(); const {r,s,c,itemNaSobra}=casoDoDia(x);
  corte.doCorte(c.plano_id).forEach(g=>corte.guardar(g.id,{largura:g.largura,altura:g.altura,
    codigo:etiqueta.pendentes()[0].codigo,nivel_id:x.nivelSobra},x.quem));
  // Vira um corte "de antes": sem proposta, sem entrada, sem a_guardar, sobras sem plano_id.
  const nascidas=db.prepare('SELECT id FROM sobra WHERE plano_id=?').all(c.plano_id).map(z=>z.id);
  db.prepare('UPDATE plano SET proposta=NULL, entrada=NULL, cortar_em=NULL WHERE id=?').run(c.plano_id);
  db.prepare('DELETE FROM sobra_a_guardar WHERE plano_id=?').run(c.plano_id);
  db.prepare('UPDATE sobra SET plano_id=NULL WHERE plano_id=?').run(c.plano_id);
  const saldo=rolo.porId(r.id).saldo;
  const k=corte.pedirCorrecao(c.plano_id,{edicoes:[{tipo:'trocar',peca:itemNaSobra,codigo:r.codigo}],motivo_id:TOM()},x.quem);
  corte.aprovarCorrecao(k.correcao_id,'Chefia');
  igual(status(s.id).status,'disponivel','a sobra voltou');
  perto(rolo.porId(r.id).saldo,saldo-2.50,'o rolo acertou');
  nascidas.forEach(id=>{ const z=db.prepare('SELECT status, origem_sobra_id FROM sobra WHERE id=?').get(id);
    if(z.origem_sobra_id) igual(z.status,'anulada','a sobra que tinha nascido da sobra foi anulada'); });
}},

{nome:'na correcao todo item precisa de fonte: o plano nao inventa corte', executar({igual}){
  const x=cena(); const {r,c,itemNaSobra}=casoDoDia(x);
  const v=corte.previaCorrecao(c.plano_id,[{tipo:'trocar',peca:itemNaSobra,codigo:r.codigo}]);
  igual(v.bloqueios.length,0,'sem bloqueio');
  igual(v.nascidas_novas.every(z=>!z.origem||z.origem.tipo==='rolo'),true,'as novas nascem do rolo onde o item foi cortado');
}}

];
