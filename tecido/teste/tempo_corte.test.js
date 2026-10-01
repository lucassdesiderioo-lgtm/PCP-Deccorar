// O TIPO DE CADA LINHA E O TEMPO POR m² (spec CORTE-EM-ETAPAS, fase 5).
const plano=require('../dominio/plano');
const corte=require('../dominio/corte');
const tempo=require('../dominio/tempo_corte');
const rolo=require('../dominio/rolo');
const tecido=require('../dominio/tecido');
const endereco=require('../dominio/endereco');
const config=require('../nucleo/config');
const db=require('../nucleo/db');

let base=null, n=0;
function cena(){
  if(!base){
    const linha=tecido.criarLinha({nome:'Rolo'});
    const abertura=tecido.criarAbertura({nome:'Screen 1%',linha_id:linha.id});
    const hR=endereco.criarHaste({nome:'A',armazem_chave:'ROLO'});
    const aR=endereco.criarAndar({nome:'01',haste_id:hR.id});
    let seq=0;
    const rev=db.prepare("INSERT INTO sm_revenda(razao_social,nome_fantasia) VALUES('Lar Ltda','LAR')").run().lastInsertRowid;
    base={linha,abertura,rev,buraco:()=>endereco.criarNivel({nome:String(++seq).padStart(3,'0'),andar_id:aR.id}).id};
  }
  const cor=tecido.criarCor({nome:'Cor '+(++n)});
  const t=tecido.criarTecido({linha_id:base.linha.id,abertura_id:base.abertura.id,cor_id:cor.id});
  rolo.entrada({tecido_id:t.id,largura:'3,00',metragem:'50',nivel_id:base.buraco()},'teste');
  return {...base,t,quem:'Op'+n};
}
function cortar(x,pecas){
  const p=plano.calcular({tecido_id:x.t.id,pecas});
  const r=corte.confirmar({tecido_id:x.t.id,pecas,assinatura:p.assinatura},x.quem);
  corte.cortar(r.plano_id,x.quem);
  return r.plano_id;
}
// O relogio do teste: o Cortar foi "ha N segundos".
const comecouHa=(id,s)=>db.prepare("UPDATE plano SET cortar_em=datetime('now','localtime',?) WHERE id=?").run('-'+s+' seconds',id);
const linha=(r,tipo)=>r.linhas.find(l=>l.tipo===tipo);

module.exports=[

{nome:'R18 — sem o tipo da linha o Confirmar e recusado, e a revenda pede qual', executar({recusa}){
  const x=cena();
  const sem=[{pedido:'T1',largura:'1,00',altura:'1,00'}];
  const p=plano.calcular({tecido_id:x.t.id,pecas:sem});
  recusa(()=>corte.confirmar({tecido_id:x.t.id,pecas:sem,assinatura:p.assinatura},x.quem),'tipo_faltando');
  const rev=[{pedido:'T1',tipo:'revenda',largura:'1,00',altura:'1,00'}];
  recusa(()=>corte.confirmar({tecido_id:x.t.id,pecas:rev,assinatura:p.assinatura},x.quem),'revenda_faltando');
}},

{nome:'R18 — a revenda vem da carteira, e o nome fica como retrato na linha do corte', executar({igual}){
  const x=cena();
  const id=cortar(x,[{pedido:'T2',tipo:'revenda',revenda_id:x.rev,largura:'1,00',altura:'1,00'}]);
  const l=db.prepare('SELECT tipo, revenda_id, revenda_nome FROM plano_peca WHERE plano_id=?').get(id);
  igual(l.tipo,'revenda','o tipo');
  igual(l.revenda_id,x.rev,'a revenda');
  igual(l.revenda_nome,'LAR','e o nome dela, como retrato');
  igual(corte.revendas().some(r=>r.id===x.rev&&r.nome==='LAR'),true,'a lista da grade e a carteira');
}},

{nome:'R20 — CORTE 60/40 DIVIDE O TEMPO 60/40, pela area das pecas', executar({igual,perto}){
  const x=cena();
  const id=cortar(x,[{pedido:'A',tipo:'revenda',revenda_id:x.rev,largura:'1,00',altura:'1,20'},
                     {pedido:'B',tipo:'cliente_final',largura:'1,00',altura:'0,80'}]);
  comecouHa(id,1000);
  corte.feito(id,x.quem);
  const s=db.prepare('SELECT tempo_liquido_s s FROM plano WHERE id=?').get(id).s;
  perto(s,1000,'o tempo liquido do corte',3);
  const r=tempo.porTipo(30);
  perto(linha(r,'revenda').minutos,s*0.6/60,'a revenda leva 60% do tempo',0.2);
  perto(linha(r,'cliente_final').minutos,s*0.4/60,'o cliente final 40%',0.2);
  perto(linha(r,'revenda').min_por_m2,linha(r,'cliente_final').min_por_m2,'e o minuto por m² dos dois e o mesmo',0.05);
}},

{nome:'R19 — A PAUSA NAO CONTA', executar({perto,igual}){
  const x=cena();
  const id=cortar(x,[{pedido:'P',tipo:'ml',largura:'1,00',altura:'1,00'}]);
  comecouHa(id,1000);
  db.prepare("INSERT INTO plano_pausa(plano_id,inicio,fim) VALUES(?,datetime('now','localtime','-900 seconds'),datetime('now','localtime','-500 seconds'))").run(id);
  corte.feito(id,x.quem);
  perto(db.prepare('SELECT tempo_liquido_s s FROM plano WHERE id=?').get(id).s,600,'1000 s menos 400 de pausa',3);
}},

{nome:'R19 — pausar e retomar pelo corte; a pausa esquecida aberta fecha no Corte feito', executar({igual,recusa}){
  const x=cena();
  const id=cortar(x,[{pedido:'P2',tipo:'ml',largura:'1,00',altura:'1,00'}]);
  igual(corte.pausar(id,x.quem).pausado,true,'pausado');
  recusa(()=>corte.pausar(id,x.quem),'ja_pausado');
  igual(corte.retomar(id,x.quem).pausado,false,'retomado');
  recusa(()=>corte.retomar(id,x.quem),'nao_pausado');
  corte.pausar(id,x.quem);
  corte.feito(id,x.quem);
  igual(db.prepare('SELECT COUNT(*) n FROM plano_pausa WHERE plano_id=? AND fim IS NULL').get(id).n,0,'nenhuma pausa ficou aberta');
}},

{nome:'R21 — CORTE ACIMA DO LIMITE FICA FORA DA MEDIA, e a tela diz quantos', executar({igual}){
  const x=cena();
  const id=cortar(x,[{pedido:'L',tipo:'cliente_final',largura:'1,00',altura:'1,00'}]);
  comecouHa(id,5*3600);
  corte.feito(id,x.quem);
  const r=tempo.porTipo(30);
  igual(r.fora_da_media.some(f=>f.id===id),true,'o corte de 5 h esta fora');
  igual(r.limite_horas,3,'com o limite de 3 h que a spec deu');
}},

{nome:'R21 — o limite e parametro, e zero e recusado', executar({recusa,igual}){
  recusa(()=>config.gravar('corteTempoMaxHoras','0','teste'),'valor_invalido');
  config.gravar('corteTempoMaxHoras','6','teste');
  igual(config.ler('corteTempoMaxHoras'),6,'gravado');
  config.gravar('corteTempoMaxHoras','3','teste');
}},

{nome:'o corte sem relogio (de antes das etapas) fica fora, contado a parte — nunca como zero', executar({igual}){
  const x=cena();
  const id=cortar(x,[{pedido:'V',tipo:'cliente_final',largura:'1,00',altura:'1,00'}]);
  corte.feito(id,x.quem);
  db.prepare('UPDATE plano SET tempo_liquido_s=NULL, cortar_em=NULL WHERE id=?').run(id);
  const r=tempo.porTipo(30);
  igual(r.sem_relogio>=1,true,'contado como sem relogio');
}}

];
