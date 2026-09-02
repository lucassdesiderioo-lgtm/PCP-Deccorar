// Fases 5 e 6 — o rolo e o plano de corte inteiro.
const rolo=require('../dominio/rolo');
const plano=require('../dominio/plano');
const sobra=require('../dominio/sobra');
const etiqueta=require('../dominio/etiqueta');
const tecido=require('../dominio/tecido');
const endereco=require('../dominio/endereco');
const motivo=require('../dominio/motivo');
const db=require('../nucleo/db');

// Cenario proprio deste arquivo: um tecido so, com estante de rolo e de sobra.
let c=null;
function cena(){
  if(c) return c;
  const linha=tecido.criarLinha({nome:'Rolo Corte'});
  const abertura=tecido.criarAbertura({nome:'3%',linha_id:linha.id});
  const cor=tecido.criarCor({nome:'Areia'});
  const t=tecido.criarTecido({linha_id:linha.id,abertura_id:abertura.id,cor_id:cor.id});

  const hR=endereco.criarHaste({nome:'RC',armazem_chave:'ROLO'});
  const aR=endereco.criarAndar({nome:'02',haste_id:hR.id});
  const nR=endereco.criarNivel({nome:'03',andar_id:aR.id});

  const hS=endereco.criarHaste({nome:'SC',armazem_chave:'SOBRA'});
  const aS=endereco.criarAndar({nome:'01',haste_id:hS.id});
  const nS=endereco.criarNivel({nome:'04',andar_id:aS.id});

  c={t, nivelRolo:nR.id, nivelSobra:nS.id};
  return c;
}
// Etiquetas livres sob demanda. O 'entregues' existe porque duas sobras
// geradas no MESMO confirmar pediriam a mesma etiqueta pendente — e a segunda
// seria recusada por um motivo que nao tem nada a ver com o que se testa.
const entregues=new Set();
function etiquetaLivre(){
  const livre=etiqueta.pendentes().find(e=>!entregues.has(e.codigo));
  const codigo=livre?livre.codigo:etiqueta.imprimirLote(10,'teste').codigos[0];
  entregues.add(codigo);
  return codigo;
}
const somaMovimentos=id=>db.prepare('SELECT COALESCE(SUM(delta),0) s FROM movimento_rolo WHERE rolo_id=?').get(id).s;

module.exports=[

{nome:'entrada de rolo: nasce fechado, com movimento de entrada', executar({igual,perto}){
  const x=cena();
  const r=rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'50',
    nivel_id:x.nivelRolo,nf:'123',fornecedor:'Tecelagem'},'Diretor');
  igual(r.codigo,'R-000001','codigo sequencial');
  igual(r.status,'fechado','nasce fechado');
  perto(r.saldo,50,'saldo = metragem da nota');
  perto(r.m2,150,'m2 e derivado: saldo x largura');   // R10
  perto(somaMovimentos(r.id),50,'o movimento de entrada existe');
}},

{nome:'rolo nao endereca na estante das sobras', executar({recusa}){
  const x=cena();
  recusa(()=>rolo.entrada({tecido_id:x.t.id,largura:2,metragem:10,nivel_id:x.nivelSobra},'Diretor'),
    'armazem_errado');
}},

{nome:'O PRIMEIRO CONSUMO ABRE O ROLO, sozinho', executar({igual,perto}){
  const r=rolo.listar({status:'fechado'})[0];
  const depois=rolo.consumir(r.id,'2,50',null,'Cortador');
  igual(depois.status,'aberto','fechado virou aberto sem ninguem marcar');
  perto(depois.saldo,47.5,'saldo baixou');
  perto(somaMovimentos(r.id),47.5,'movimentos batem com o saldo');
}},

{nome:'consumo maior que o saldo e recusado com os dois numeros', executar({recusa}){
  const r=rolo.listar({status:'aberto'})[0];
  const e=recusa(()=>rolo.consumir(r.id,999,null,'Cortador'),'saldo_insuficiente');
  if(!/47,50/.test(e.mensagem)) throw new Error('a mensagem tem que dizer o saldo real: '+e.mensagem);
}},

{nome:'ajuste exige motivo e deixa rastro', executar({recusa,perto}){
  const r=rolo.listar({status:'aberto'})[0];
  recusa(()=>rolo.ajustar(r.id,40,'','Diretor'),'motivo_obrigatorio');
  recusa(()=>rolo.ajustar(r.id,r.saldo,'sem mudanca','Diretor'),'sem_diferenca');
  const d=rolo.ajustar(r.id,40,'contagem na prateleira','Diretor');
  perto(d.saldo,40,'saldo corrigido');
  perto(somaMovimentos(r.id),40,'a soma dos movimentos acompanha');
}},

{nome:'O ACERTO NO FIM: encerrar grava delta = menos o saldo', executar({igual,perto}){
  const r=rolo.listar({status:'aberto'})[0];
  const antes=r.saldo;
  const d=rolo.encerrar(r.id,'Cortador');
  igual(d.status,'encerrado','status');
  perto(d.saldo,0,'zerou');
  perto(somaMovimentos(r.id),0,'a soma dos movimentos zerou junto');
  const ultimo=rolo.movimentos(r.id).pop();
  igual(ultimo.motivo,'encerramento','motivo do movimento');
  perto(ultimo.delta,-antes,'delta = menos o saldo que sobrava');
  // Sem este acerto o saldo infla mes a mes com metros que nunca existiram:
  // a metragem vem da nota e nao e conferida na entrada.
}},

{nome:'rolo encerrado nao consome nem ajusta', executar({recusa}){
  const r=rolo.listar({status:'encerrado'})[0];
  recusa(()=>rolo.consumir(r.id,1,null,'Cortador'),'rolo_encerrado');
  recusa(()=>rolo.ajustar(r.id,5,'nada','Diretor'),'rolo_encerrado');
}},

{nome:'SUM(delta) = saldo em TODO rolo (criterio 13)', executar({igual}){
  igual(rolo.conferirSaldos().length,0,'nenhum rolo divergente');
}},

// ── O PLANO ────────────────────────────────────────────────────────────
{nome:'o plano simula todas as larguras e escolhe a de menor desperdicio', executar({igual,perto}){
  const x=cena();
  rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'40',nivel_id:x.nivelRolo},'Diretor');
  rolo.entrada({tecido_id:x.t.id,largura:'2,50',metragem:'40',nivel_id:x.nivelRolo},'Diretor');
  rolo.entrada({tecido_id:x.t.id,largura:'2,00',metragem:'40',nivel_id:x.nivelRolo},'Diretor');

  const p=plano.calcular({tecido_id:x.t.id,pecas:[
    {largura:'0,90',altura:'2,50'},{largura:'0,90',altura:'2,50'},{largura:'0,90',altura:'2,50'}]});
  igual(p.simulacoes.length,3,'simulou as tres larguras');
  perto(p.bobina.largura,3.00,'venceu a de 3,00');
  perto(p.desperdicio,0.75,'o desperdicio da tabela do 6.4');
  perto(p.consumo_linear,2.50,'puxa 2,50 m');
  igual(p.faixas.length,1,'uma faixa so');
  // E a frase que explica por que nenhuma sobra serviu.
  igual(/sobra/i.test(p.sobre_sobras||''),true,'o plano explica a ausencia de sobra: '+p.sobre_sobras);
}},

{nome:'SOBRA ANTES DE ROLO, sempre', executar({igual,perto}){
  const x=cena();
  const cod=etiquetaLivre();
  sobra.criar({codigo:cod,tecido_id:x.t.id,largura:'1,90',altura:'2,60',
    condicao:'integra',nivel_id:x.nivelSobra},'Cortador');

  const p=plano.calcular({tecido_id:x.t.id,pecas:[
    {largura:'0,90',altura:'2,50'},{largura:'0,90',altura:'2,50'}]});
  igual(p.faixas[0].fonte,'sobra','a primeira faixa e da sobra');
  igual(p.sobras_sugeridas.length,1,'uma sobra sugerida');
  perto(p.consumo_linear,0,'nao puxou rolo nenhum');
  // A sobra sai inteira: o consumo e a area toda dela.
  perto(p.consumo_m2,1.90*2.60,'consumo = a sobra inteira');
}},

{nome:'a recusa devolve a sobra e o plano recalcula sem ela', executar({igual,perto}){
  const x=cena();
  const s=sobra.listar({status:'disponivel'}).find(y=>y.tecido_id===x.t.id);
  const mot=motivo.motivosAtivos()[0];

  plano.recusar({sobra_id:s.id,motivo_id:mot.id,observacao:'tom puxado'},'Cortador');
  const p=plano.calcular({tecido_id:x.t.id,recusadas:[s.id],pecas:[
    {largura:'0,90',altura:'2,50'},{largura:'0,90',altura:'2,50'}]});

  igual(p.faixas[0].fonte,'rolo','sem a sobra, o plano vai para o rolo');
  igual(sobra.porId(s.id).status,'disponivel','a sobra recusada NAO baixou');
  const gravada=db.prepare('SELECT * FROM plano_recusa WHERE sobra_id=?').get(s.id);
  igual(!!gravada,true,'a recusa ficou gravada — e diagnostico, nao papelada');
}},

{nome:'CONFIRMAR baixa tudo junto: sobra, rolo, sobra nova e refugo', executar({igual,perto}){
  const x=cena();
  const pecas=[{largura:'0,90',altura:'2,50'},{largura:'0,90',altura:'2,50'},{largura:'0,90',altura:'2,50'}];
  const p=plano.calcular({tecido_id:x.t.id,pecas});
  const saldoAntes=rolo.porId(p.faixas.find(f=>f.fonte==='rolo').fonte_id).saldo;

  const etiquetas={};
  p.sobras_geradas.forEach(s=>{ etiquetas[s.indice]={codigo:etiquetaLivre(),nivel_id:x.nivelSobra}; });

  const r=plano.confirmar({tecido_id:x.t.id,pecas,assinatura:p.assinatura,etiquetas},'Cortador');
  igual(r.plano_id>0,true,'o plano foi gravado');

  const rl=rolo.porId(p.faixas.find(f=>f.fonte==='rolo').fonte_id);
  perto(rl.saldo,saldoAntes-p.consumo_linear,'o rolo baixou o consumo linear');
  perto(somaMovimentos(rl.id),rl.saldo,'movimento bate com o saldo');
  igual(rolo.conferirSaldos().length,0,'nenhum rolo ficou divergente');

  const refugo=db.prepare('SELECT COUNT(*) c FROM refugo WHERE plano_id=?').get(r.plano_id).c;
  igual(refugo,p.refugos.length,'o refugo ficou medido, nao sumiu');
}},

{nome:'confirmar SEM a etiqueta da sobra nova e recusado', executar({recusa}){
  const x=cena();
  // Peca estreita e ALTA numa bobina larga: a tira lateral tem largura e
  // altura de sobra (a altura minima e 1,00 m), entao nasce uma sobra que
  // pede etiqueta. As sobras da prateleira sao recusadas para o corte cair
  // no rolo, onde a tira lateral e larga.
  const pecas=[{largura:'0,90',altura:'2,00'}];
  const recusadas=sobra.candidatas(x.t.id).map(s=>s.id);
  const p=plano.calcular({tecido_id:x.t.id,pecas,recusadas});
  if(!p.sobras_geradas.length) throw new Error('o cenario deveria gerar sobra');
  recusa(()=>plano.confirmar({tecido_id:x.t.id,pecas,recusadas,assinatura:p.assinatura,etiquetas:{}},'Cortador'),
    'etiqueta_faltando');
}},

{nome:'CONFIRMAR E ATOMICO: se uma linha falha, nada baixa', executar({recusa,igual,perto}){
  const x=cena();
  const pecas=[{largura:'0,90',altura:'2,00'}];
  // Recusa as sobras para forcar o caminho do ROLO: o que se quer provar e
  // que a baixa de metro linear tambem volta atras.
  const recusadas=sobra.candidatas(x.t.id).map(s=>s.id);
  const p=plano.calcular({tecido_id:x.t.id,pecas,recusadas});
  const alvo=rolo.porId(p.faixas.find(f=>f.fonte==='rolo').fonte_id);
  const saldoAntes=alvo.saldo;
  const sobrasAntes=db.prepare("SELECT COUNT(*) c FROM sobra").get().c;
  const planosAntes=db.prepare("SELECT COUNT(*) c FROM plano").get().c;

  // Etiqueta que ja tem dona: a ultima linha da transacao falha.
  const usada=db.prepare("SELECT codigo FROM etiqueta WHERE sobra_id IS NOT NULL LIMIT 1").get().codigo;
  const etiquetas={};
  p.sobras_geradas.forEach(s=>{ etiquetas[s.indice]={codigo:usada,nivel_id:x.nivelSobra}; });

  recusa(()=>plano.confirmar({tecido_id:x.t.id,pecas,recusadas,assinatura:p.assinatura,etiquetas},'Cortador'),
    'etiqueta_ja_usada');

  perto(rolo.porId(alvo.id).saldo,saldoAntes,'o rolo NAO baixou');
  igual(db.prepare("SELECT COUNT(*) c FROM sobra").get().c,sobrasAntes,'nenhuma sobra nova');
  igual(db.prepare("SELECT COUNT(*) c FROM plano").get().c,planosAntes,'nenhum plano gravado');
}},

{nome:'plano calculado que o estoque mudou nao confirma as cegas', executar({recusa,igual}){
  const x=cena();
  const pecas=[{largura:'0,90',altura:'2,00'}];
  const p=plano.calcular({tecido_id:x.t.id,pecas});
  // Outra pessoa usa uma sobra / muda o estoque no meio do caminho.
  const cod=etiquetaLivre();
  sobra.criar({codigo:cod,tecido_id:x.t.id,largura:'1,00',altura:'2,50',
    condicao:'integra',nivel_id:x.nivelSobra},'Outro');
  const etiquetas={}; p.sobras_geradas.forEach(s=>{ etiquetas[s.indice]={codigo:etiquetaLivre(),nivel_id:x.nivelSobra}; });
  recusa(()=>plano.confirmar({tecido_id:x.t.id,pecas,assinatura:p.assinatura,etiquetas},'Cortador'),
    'plano_mudou');
}},

{nome:'peca larga demais nao impede o plano das outras', executar({igual}){
  const x=cena();
  const p=plano.calcular({tecido_id:x.t.id,pecas:[
    {largura:'4,50',altura:'2,00'},{largura:'0,90',altura:'2,00'}]});
  igual(p.pecas_nao_alocadas.length,1,'so a larga ficou de fora');
  igual(p.faixas.length>0,true,'o plano saiu assim mesmo');
  igual(/largura/.test(p.pecas_nao_alocadas[0].motivo),true,'com o motivo em metros');
}},

{nome:'tecido sem rolo e sem sobra: o plano diz isso, nao quebra', executar({igual}){
  const linha=tecido.listarLinhas().find(l=>l.nome==='Rolo Corte');
  const ab=tecido.listarAberturas(linha.id)[0];
  const cor=tecido.criarCor({nome:'Terracota'});
  const vazio=tecido.criarTecido({linha_id:linha.id,abertura_id:ab.id,cor_id:cor.id});
  const p=plano.calcular({tecido_id:vazio.id,pecas:[{largura:'1,00',altura:'2,00'}]});
  igual(p.faixas.length,0,'nenhuma faixa');
  igual(p.pecas_nao_alocadas.length,1,'a peca voltou marcada');
  igual(/nenhuma sobra/i.test(p.sobre_sobras),true,'e o plano explica: '+p.sobre_sobras);
}}

];
