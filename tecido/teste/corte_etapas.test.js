// O CORTE EM ETAPAS (spec CORTE-EM-ETAPAS, fase 2).
//
// A regra que manda: o estoque so anda no CORTE FEITO. O Confirmar grava e
// reserva; o Cortar liga o relogio; o Corte feito baixa; o Guardar poe a
// sobra nascida na prateleira.
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
    etiqueta.imprimirLote(120,'teste');
    let seq=0;
    base={linha,abertura,nivelSobra:nS.id,
      buraco:()=>endereco.criarNivel({nome:String(++seq).padStart(3,'0'),andar_id:aR.id}).id};
  }
  const cor=tecido.criarCor({nome:'Cor '+(++n)});
  const t=tecido.criarTecido({linha_id:base.linha.id,abertura_id:base.abertura.id,cor_id:cor.id});
  return {...base,t,pedido:'E'+n,quem:'Op'+n};
}
const novaSobra=(x,l,a)=>sobra.criar({codigo:etiqueta.pendentes()[0].codigo,tecido_id:x.t.id,
  largura:l,altura:a,condicao:'integra',nivel_id:x.nivelSobra},'teste');
const novoRolo=(x,larg)=>rolo.entrada({tecido_id:x.t.id,largura:larg||'3,00',metragem:'50',nivel_id:x.buraco()},'teste');
function abrir(x,pecas,quem,extra){
  const p=plano.calcular({tecido_id:x.t.id,pecas,...(extra||{})});
  const r=corte.confirmar({tecido_id:x.t.id,pecas,assinatura:p.assinatura,...(extra||{})},quem||x.quem);
  return {...r,proposta:p};
}
const movRolo=id=>db.prepare('SELECT COUNT(*) n FROM movimento_rolo WHERE rolo_id=? AND motivo=\'consumo\'').get(id).n;

module.exports=[

{nome:'CONFIRMAR NAO BAIXA NADA: rolo, sobra, refugo e sobra nova ficam como estavam', executar({igual,perto}){
  const x=cena(); const r=novoRolo(x); const s=novaSobra(x,2.00,2.60);
  const sobrasAntes=db.prepare('SELECT COUNT(*) n FROM sobra').get().n;
  const c=abrir(x,[{pedido:x.pedido,tipo:'cliente_final',largura:'0,90',altura:'2,50'},{pedido:x.pedido+'b',tipo:'cliente_final',largura:'1,00',altura:'1,20'}]);
  igual(c.etapa,'confirmado','o corte esta confirmado');
  perto(rolo.porId(r.id).saldo,50,'o rolo nao baixou');
  igual(movRolo(r.id),0,'nenhum movimento de consumo');
  igual(sobra.porId?db.prepare('SELECT status FROM sobra WHERE id=?').get(s.id).status:null,'disponivel','a sobra continua disponivel');
  igual(db.prepare('SELECT COUNT(*) n FROM refugo WHERE plano_id=?').get(c.plano_id).n,0,'nenhum refugo gravado');
  igual(db.prepare('SELECT COUNT(*) n FROM sobra').get().n,sobrasAntes,'nenhuma sobra nova');
  igual(db.prepare('SELECT confirmado FROM plano WHERE id=?').get(c.plano_id).confirmado,0,'confirmado=0 — nao baixou');
}},

{nome:'cortar tambem nao baixa — so liga o relogio', executar({igual,perto}){
  const x=cena(); const r=novoRolo(x);
  const c=abrir(x,[{pedido:x.pedido,tipo:'cliente_final',largura:'1,00',altura:'2,00'}]);
  const a=corte.cortar(c.plano_id,x.quem);
  igual(a.etapa,'cortando','cortando');
  igual(!!a.cortar_em,true,'a hora do Cortar');
  perto(rolo.porId(r.id).saldo,50,'o rolo nao baixou');
}},

{nome:'O CORTE FEITO BAIXA TUDO JUNTO: sobra usada, rolo, refugo e sobra a guardar', executar({igual,perto}){
  const x=cena(); const r=novoRolo(x); const s=novaSobra(x,1.00,2.60);
  const c=abrir(x,[{pedido:x.pedido,tipo:'cliente_final',largura:'0,95',altura:'2,50'},{pedido:x.pedido+'b',tipo:'cliente_final',largura:'1,00',altura:'2,00'}]);
  corte.cortar(c.plano_id,x.quem);
  const f=corte.feito(c.plano_id,x.quem);
  igual(f.etapa,'feito','feito');
  igual(db.prepare('SELECT status FROM sobra WHERE id=?').get(s.id).status,'usada','a sobra foi usada');
  perto(rolo.porId(r.id).saldo,50-c.proposta.consumo_linear,'o rolo baixou o consumo');
  igual(rolo.conferirSaldos().length,0,'saldo bate com o movimento');
  igual(db.prepare('SELECT COUNT(*) n FROM refugo WHERE plano_id=?').get(c.plano_id).n,c.proposta.refugos.length,'refugo medido');
  igual(corte.doCorte(c.plano_id).length,c.proposta.sobras_geradas.length,'cada sobra nascida virou "a guardar"');
  igual(db.prepare('SELECT confirmado FROM plano WHERE id=?').get(c.plano_id).confirmado,1,'confirmado=1 — baixou');
}},

{nome:'o Corte feito baixa o que esta GRAVADO, e nao um plano recalculado', executar({igual}){
  // Entre confirmar e terminar entra uma sobra nova que serviria melhor.
  // Recalcular escolheria essa sobra — que ninguem cortou.
  const x=cena(); novoRolo(x);
  const c=abrir(x,[{pedido:x.pedido,tipo:'cliente_final',largura:'1,00',altura:'2,00'}]);
  corte.cortar(c.plano_id,x.quem);
  const nova=novaSobra(x,1.10,2.10);
  corte.feito(c.plano_id,x.quem);
  igual(db.prepare('SELECT status FROM sobra WHERE id=?').get(nova.id).status,'disponivel','a sobra nova continua disponivel');
}},

{nome:'Corte feito so sai do CORTANDO', executar({recusa}){
  const x=cena(); novoRolo(x);
  const c=abrir(x,[{pedido:x.pedido,tipo:'cliente_final',largura:'1,00',altura:'2,00'}]);
  recusa(()=>corte.feito(c.plano_id,x.quem),'etapa_errada');
  corte.cortar(c.plano_id,x.quem); corte.feito(c.plano_id,x.quem);
  recusa(()=>corte.feito(c.plano_id,x.quem),'etapa_errada','nem duas vezes');
}},

{nome:'O CORTE FEITO E ATOMICO: se uma linha falha, nada baixa e o corte continua aberto', executar({recusa,igual,perto}){
  const x=cena(); const r=novoRolo(x); const s=novaSobra(x,1.00,2.60);
  const c=abrir(x,[{pedido:x.pedido,tipo:'cliente_final',largura:'0,95',altura:'2,50'},{pedido:x.pedido+'b',tipo:'cliente_final',largura:'1,00',altura:'2,00'}]);
  corte.cortar(c.plano_id,x.quem);
  // O rolo foi encerrado por fora no meio do corte: a baixa dele falha.
  rolo.encerrar(r.id,'Outro');
  recusa(()=>corte.feito(c.plano_id,x.quem),'rolo_encerrado');
  igual(db.prepare('SELECT status FROM sobra WHERE id=?').get(s.id).status,'disponivel','a sobra NAO foi usada');
  igual(corte.doCorte(c.plano_id).length,0,'nenhuma sobra a guardar');
  igual(db.prepare('SELECT COUNT(*) n FROM refugo WHERE plano_id=?').get(c.plano_id).n,0,'nenhum refugo');
  igual(corte.porId(c.plano_id).etapa,'cortando','o corte continua aberto');
}},

{nome:'A SOBRA RESERVADA NAO APARECE EM OUTRO PLANO, e o plano diz por que', executar({igual}){
  const x=cena(); const s=novaSobra(x,1.00,2.60);
  const c=abrir(x,[{pedido:x.pedido,tipo:'cliente_final',largura:'0,95',altura:'2,50'}],x.quem);
  igual(c.proposta.sobras_sugeridas[0].id,s.id,'o corte da Ana pegou a sobra');
  const outro=plano.calcular({tecido_id:x.t.id,pecas:[{pedido:x.pedido+'z',tipo:'cliente_final',largura:'0,95',altura:'2,50'}]});
  igual(outro.sobras_sugeridas.length,0,'o plano do outro nao a oferece');
  const e=outro.sobras_que_servem.find(z=>z.id===s.id);
  igual(!!e&&e.motivo_codigo,'reservada','e explica que esta reservada');
  igual(new RegExp(x.quem).test(e.motivo)&&new RegExp('corte '+c.plano_id).test(e.motivo),true,'dizendo de quem e qual corte: '+e.motivo);
}},

{nome:'O ROLO RESERVADO aparece para os outros com o saldo menos os metros reservados', executar({igual,perto}){
  const x=cena(); const r=novoRolo(x);
  const c=abrir(x,[{pedido:x.pedido,tipo:'cliente_final',largura:'1,00',altura:'20,00'}],x.quem);
  perto(c.proposta.consumo_linear,20,'a Ana reservou 20 m');
  const outro=plano.calcular({tecido_id:x.t.id,pecas:[{pedido:x.pedido+'z',tipo:'cliente_final',largura:'1,00',altura:'35,00'}]});
  igual(outro.faixas.length,0,'35 m nao cabem nos 30 que sobram livres');
  igual(outro.pecas_nao_alocadas.length,1,'a peca volta marcada');
  const cabe=plano.calcular({tecido_id:x.t.id,pecas:[{pedido:x.pedido+'y',tipo:'cliente_final',largura:'1,00',altura:'29,00'}]});
  igual(cabe.faixas.length,1,'29 m cabem');
  perto(rolo.porId(r.id).saldo,50,'e o saldo de verdade nao andou');
}},

{nome:'CANCELAR SOLTA TUDO: a reserva sai, nada baixa, e o motivo fica', executar({igual,recusa,perto}){
  const x=cena(); const r=novoRolo(x); const s=novaSobra(x,1.00,2.60);
  const c=abrir(x,[{pedido:x.pedido,tipo:'cliente_final',largura:'0,95',altura:'2,50'},{pedido:x.pedido+'b',tipo:'cliente_final',largura:'1,00',altura:'2,00'}],x.quem);
  corte.cortar(c.plano_id,x.quem);
  recusa(()=>corte.cancelar(c.plano_id,'  ',x.quem),'motivo_obrigatorio');
  corte.cancelar(c.plano_id,'tom nao bateu e o pedido foi adiado',x.quem);
  const outro=plano.calcular({tecido_id:x.t.id,pecas:[{pedido:x.pedido+'z',tipo:'cliente_final',largura:'0,95',altura:'2,50'}]});
  igual(outro.sobras_sugeridas[0]&&outro.sobras_sugeridas[0].id,s.id,'a sobra voltou a ser oferecida');
  perto(rolo.porId(r.id).saldo,50,'o rolo nao baixou');
  const h=historico.detalhe(c.plano_id);
  igual(h.etapa,'cancelado','no historico como cancelado');
  igual(h.cancelado_motivo,'tom nao bateu e o pedido foi adiado','com o motivo');
  recusa(()=>corte.feito(c.plano_id,x.quem),'etapa_errada','cancelado nao vira feito');
}},

{nome:'R2 — UM CORTE ABERTO POR OPERADOR; a pendencia de guardar nao conta', executar({recusa,igual}){
  const x=cena(); novoRolo(x);
  const c=abrir(x,[{pedido:x.pedido,tipo:'cliente_final',largura:'1,00',altura:'2,00'}],'Bia');
  const e=recusa(()=>abrir(x,[{pedido:x.pedido+'b',tipo:'cliente_final',largura:'1,00',altura:'1,00'}],'Bia'),'corte_aberto');
  igual(new RegExp(String(c.plano_id)).test(e.mensagem),true,'a recusa diz qual corte esta aberto');
  abrir(x,[{pedido:x.pedido+'c',tipo:'cliente_final',largura:'0,50',altura:'1,00'}],'Caio');   // outra pessoa abre o dela
  corte.cortar(c.plano_id,'Bia'); corte.feito(c.plano_id,'Bia');
  igual(corte.aGuardar({usuarioNome:'Bia'}).length>0,true,'a Bia tem sobra a guardar');
  const d=abrir(x,[{pedido:x.pedido+'d',tipo:'cliente_final',largura:'1,00',altura:'1,00'}],'Bia');
  igual(d.etapa,'confirmado','e mesmo assim abre outro corte');
}},

{nome:'VOLTAR AO PLANO apaga o corte do ② e solta a reserva; do ③ so cancelando', executar({recusa,igual}){
  const x=cena(); const s=novaSobra(x,1.00,2.60);
  const c=abrir(x,[{pedido:x.pedido,tipo:'cliente_final',largura:'0,95',altura:'2,50'}],'Duda');
  const v=corte.voltar(c.plano_id,'Duda');
  igual(v.apagado,true,'apagado');
  igual(corte.porId(c.plano_id),undefined,'o corte nao existe mais');
  igual(v.entrada.pecas.length,1,'e devolve o que foi lancado, para a tela voltar com a grade');
  const outro=plano.calcular({tecido_id:x.t.id,pecas:[{pedido:x.pedido+'z',tipo:'cliente_final',largura:'0,95',altura:'2,50'}]});
  igual(outro.sobras_sugeridas[0].id,s.id,'a sobra voltou a ser livre');
  const c2=abrir(x,[{pedido:x.pedido,tipo:'cliente_final',largura:'0,95',altura:'2,50'}],'Duda');
  corte.cortar(c2.plano_id,'Duda');
  recusa(()=>corte.voltar(c2.plano_id,'Duda'),'etapa_errada');
}},

{nome:'quem mexe no corte e quem o abriu, ou a chefia', executar({recusa,igual}){
  const x=cena(); novoRolo(x);
  const c=abrir(x,[{pedido:x.pedido,tipo:'cliente_final',largura:'1,00',altura:'2,00'}],'Eva');
  recusa(()=>corte.cortar(c.plano_id,'Fabio'),'corte_de_outro');
  igual(corte.cortar(c.plano_id,'Fabio',{gerir:true}).etapa,'cortando','a chefia pode');
}},

{nome:'A SOBRA "A GUARDAR" NAO ENTRA EM PLANO', executar({igual}){
  const x=cena(); novoRolo(x);
  // Peca estreita e alta numa bobina de 3,00: nasce uma tira lateral larga.
  const c=abrir(x,[{pedido:x.pedido,tipo:'cliente_final',largura:'0,90',altura:'2,00'}],'Gil');
  corte.cortar(c.plano_id,'Gil'); corte.feito(c.plano_id,'Gil');
  const pend=corte.aGuardar({usuarioNome:'Gil'});
  igual(pend.length>=1,true,'nasceu sobra a guardar');
  const g=pend.find(z=>z.largura>=2);
  const p=plano.calcular({tecido_id:x.t.id,pecas:[{pedido:x.pedido+'z',tipo:'cliente_final',largura:'1,00',altura:'1,50'}]});
  igual(p.faixas.every(f=>f.fonte!=='sobra'),true,'nenhuma sobra no plano: a nascida ainda nao foi guardada');
  igual(!!g,true,'a tira de 2,10 esta na pendencia');
}},

{nome:'GUARDAR EXIGE MEDIDA, ETIQUETA E ENDERECO — e so entao a sobra entra em plano', executar({recusa,igual,perto}){
  const x=cena(); novoRolo(x);
  const c=abrir(x,[{pedido:x.pedido,tipo:'cliente_final',largura:'0,90',altura:'2,00'}],'Hugo');
  corte.cortar(c.plano_id,'Hugo'); corte.feito(c.plano_id,'Hugo');
  const g=corte.aGuardar({usuarioNome:'Hugo'}).find(z=>z.largura>=2);
  const cod=etiqueta.pendentes()[0].codigo;
  recusa(()=>corte.guardar(g.id,{codigo:cod,nivel_id:x.nivelSobra},'Hugo'),'medida_faltando');
  recusa(()=>corte.guardar(g.id,{tipo:'cliente_final',largura:'2,10',altura:'2,00',nivel_id:x.nivelSobra},'Hugo'),'etiqueta_faltando');
  recusa(()=>corte.guardar(g.id,{tipo:'cliente_final',largura:'2,10',altura:'2,00',codigo:cod},'Hugo'),'endereco_faltando');
  recusa(()=>corte.guardar(g.id,{tipo:'cliente_final',largura:'2,10',altura:'2,00',codigo:cod,nivel_id:x.nivelSobra},'Iris'),'a_guardar_de_outro');
  // A fita disse 2,08 e nao 2,10: vale a da fita.
  const r=corte.guardar(g.id,{tipo:'cliente_final',largura:'2,08',altura:'2,00',codigo:cod,nivel_id:x.nivelSobra},'Hugo');
  perto(r.sobra.largura,2.08,'a medida que vale e a medida da fita');
  igual(r.medida_mudou,true,'e a resposta diz que mudou');
  igual(r.sobra.plano_id,c.plano_id,'a sobra sabe de que corte nasceu');
  igual(corte.aGuardar({usuarioNome:'Hugo'}).some(z=>z.id===g.id),false,'a pendencia some');
  recusa(()=>corte.guardar(g.id,{tipo:'cliente_final',largura:'2,08',altura:'2,00',codigo:etiqueta.pendentes()[0].codigo,nivel_id:x.nivelSobra},'Hugo'),'ja_guardada');
  const p=plano.calcular({tecido_id:x.t.id,pecas:[{pedido:x.pedido+'z',tipo:'cliente_final',largura:'1,00',altura:'1,50'}]});
  igual(p.faixas[0].fonte,'sobra','agora sim a sobra entra em plano');
  igual(historico.listar({sobra:cod}).sobra.nasceu_em,c.plano_id,'e o historico acha de onde ela nasceu');
}},

{nome:'a chefia ve TODAS as pendencias, com quem cortou', executar({igual}){
  const x=cena(); novoRolo(x);
  const c=abrir(x,[{pedido:x.pedido,tipo:'cliente_final',largura:'0,90',altura:'2,00'}],'Joao');
  corte.cortar(c.plano_id,'Joao'); corte.feito(c.plano_id,'Joao');
  const todas=corte.aGuardar({todas:true});
  igual(todas.some(z=>z.cortado_por==='Joao'),true,'a do Joao aparece para a chefia');
  igual(corte.aGuardar({usuarioNome:'Outra'}).some(z=>z.cortado_por==='Joao'),false,'e nao aparece para outra pessoa');
}},

{nome:'o corte aberto se reencontra depois de recarregar a tela', executar({igual}){
  const x=cena(); novoRolo(x);
  const c=abrir(x,[{pedido:x.pedido,tipo:'cliente_final',largura:'1,00',altura:'2,00'}],'Kai');
  const a=corte.aberto('Kai');
  igual(a.plano_id,c.plano_id,'o corte do Kai');
  igual(a.fontes.length,1,'com o resumo por fonte');
  igual(a.fontes[0].itens.join(','),'1','e os itens de cada fonte');
  igual(!!a.fontes[0].endereco,true,'e o endereco');
  igual(corte.aberto('Ninguem'),null,'quem nao tem corte aberto recebe null');
}},

{nome:'O PEDIDO NUM CORTE ABERTO conta como ja cortado para o proximo plano', executar({igual}){
  // O rolo reservado pelo corte aberto do pedido e onde o resto do pedido
  // tem que sair — o tom e o do rolo, nao o do Corte feito.
  const x=cena(); const bom=novoRolo(x,'3,00'); novoRolo(x,'2,00');
  abrir(x,[{pedido:x.pedido,tipo:'cliente_final',largura:'1,495',altura:'2,730'},{pedido:x.pedido,tipo:'cliente_final',largura:'1,495',altura:'2,730'}],'Lia');
  const p2=plano.calcular({tecido_id:x.t.id,pecas:[{pedido:x.pedido,tipo:'cliente_final',largura:'1,495',altura:'2,730'}]});
  igual(p2.continuando_em&&p2.continuando_em.codigo,bom.codigo,'continua no rolo do corte aberto');
}},

{nome:'o corte cancelado NAO conta como ja cortado', executar({igual}){
  const x=cena(); novoRolo(x,'3,00'); novoRolo(x,'2,00');
  const c=abrir(x,[{pedido:x.pedido,tipo:'cliente_final',largura:'1,495',altura:'2,730'},{pedido:x.pedido,tipo:'cliente_final',largura:'1,495',altura:'2,730'}],'Mel');
  corte.cancelar(c.plano_id,'desisti','Mel');
  const p2=plano.calcular({tecido_id:x.t.id,pecas:[{pedido:x.pedido,tipo:'cliente_final',largura:'1,495',altura:'2,730'}]});
  igual(p2.cortes_anteriores.length,0,'nada saiu do cancelado');
}}

];
