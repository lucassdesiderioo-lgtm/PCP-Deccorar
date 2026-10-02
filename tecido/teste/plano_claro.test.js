// O PLANO MAIS CLARO (spec CORTE-EM-ETAPAS, fase 7, R22–R25).
//
//   R22  toda sobra que serve uma peca e nao entrou diz POR QUE — tambem
//        quando o plano usou OUTRA sobra (antes a lista so existia sem sobra)
//   R23  cada sobra usada diz quanto vira peca, sobra nova e refugo: somam 100
//   R24  entre as que servem: condicao → menor refugo → menor area
//   R25  o refugo medio dos cortes dos ultimos 30 dias, da tabela do painel
//
// Escrito ANTES do codigo. Os parametros sao os do schema: largura minima de
// sobra 0,80 e altura minima 1,00 — o resto de pe 1,00 x 1,10 vira sobra
// nova, o de 1,00 x 0,30 vira refugo.
const plano=require('../dominio/plano');
const corte=require('../dominio/corte');
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
    etiqueta.imprimirLote(80,'teste');
    let seq=0;
    base={linha,abertura,nivelSobra:nS.id,
      buraco:()=>endereco.criarNivel({nome:String(++seq).padStart(3,'0'),andar_id:aR.id}).id};
  }
  const cor=tecido.criarCor({nome:'Cor '+(++n)});
  const t=tecido.criarTecido({linha_id:base.linha.id,abertura_id:base.abertura.id,cor_id:cor.id});
  return {...base,t,quem:'Op'+n};
}
const novaSobra=(x,largura,altura,condicao)=>sobra.criar({codigo:etiqueta.pendentes()[0].codigo,
  tecido_id:x.t.id,largura,altura,condicao:condicao||'integra',nivel_id:x.nivelSobra},'teste');
const novoRolo=(x,metragem)=>rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:metragem||'30',nivel_id:x.buraco()},'teste');
const peca=(l,a,pedido)=>({tipo:'cliente_final',largura:l,altura:a,pedido:pedido||null});
const usou=p=>p.sobras_sugeridas.map(s=>s.codigo);

module.exports=[

/* ── R24 ────────────────────────────────────────────────────────────────── */
{nome:'R24 — ENTRE DUAS QUE SERVEM, VENCE A DE MENOS REFUGO, mesmo sendo maior', executar({igual}){
  const x=cena();
  // 1,05 x 1,05: sobram tiras de 5 cm — tudo refugo (~0,10 m²).
  const a=novaSobra(x,'1,05','1,05');
  // 1,00 x 2,10: sobra um pe de 1,00 x 1,10 — vira sobra nova, refugo zero.
  const b=novaSobra(x,'1,00','2,10');
  const p=plano.calcular({tecido_id:x.t.id,pecas:[peca('1,00','1,00','P1')]});
  igual(usou(p).join(),b.codigo,'a de refugo zero, e nao a menor ('+a.codigo+')');
}},

{nome:'R24 — A CONDICAO VEM ANTES DO REFUGO: integra antes de defeito', executar({igual}){
  const x=cena();
  const integra=novaSobra(x,'1,05','1,05');                  // gera refugo
  novaSobra(x,'1,00','2,10','mancha');                       // refugo zero, com mancha
  const p=plano.calcular({tecido_id:x.t.id,pecas:[peca('1,00','1,00','P2')]});
  igual(usou(p).join(),integra.codigo,'a integra, mesmo gerando refugo');
}},

{nome:'R24 — EMPATE NO REFUGO: a de menor area', executar({igual}){
  const x=cena();
  novaSobra(x,'1,00','2,50');
  const menor=novaSobra(x,'1,00','2,10');
  const p=plano.calcular({tecido_id:x.t.id,pecas:[peca('1,00','1,00','P3')]});
  igual(usou(p).join(),menor.codigo,'as duas tem refugo zero; fica a menor');
}},

/* ── R23 ────────────────────────────────────────────────────────────────── */
{nome:'R23 — CADA SOBRA USADA DIZ usa · vira sobra · vira refugo, e soma 100', executar({igual,perto}){
  const x=cena();
  novaSobra(x,'1,00','2,10');
  const p=plano.calcular({tecido_id:x.t.id,pecas:[peca('1,00','1,00','P4')]});
  const d=p.sobras_sugeridas[0].aproveitamento;
  igual(d.usa+d.sobra+d.refugo,100,'as tres somam 100');
  igual(d.usa,48,'1,00 m² de 2,10');
  igual(d.sobra,52,'o pe de 1,10 m² vira sobra nova');
  igual(d.refugo,0,'nada de refugo');
  perto(d.area,2.1,'a area da sobra');
}},

{nome:'R23 — com refugo, e o refugo total do corte em %', executar({igual}){
  const x=cena();
  novaSobra(x,'1,05','1,05');
  const p=plano.calcular({tecido_id:x.t.id,pecas:[peca('1,00','1,00','P5')]});
  const d=p.sobras_sugeridas[0].aproveitamento;
  igual(d.usa+d.sobra+d.refugo,100,'somam 100');
  igual(d.usa,91,'1,00 de 1,1025');
  igual(d.sobra,0,'as tiras sao estreitas demais para sobra');
  igual(d.refugo,9,'o resto e refugo');
  igual(p.refugo_pct,9,'o refugo do corte inteiro');
}},

/* ── R22 ────────────────────────────────────────────────────────────────── */
{nome:'R22 — USOU UMA SOBRA, e a outra que servia o pedido B diz por que nao entrou', executar({igual}){
  const x=cena();
  novoRolo(x);
  const usada=novaSobra(x,'1,00','2,10');          // pega o pedido A inteiro
  // Serve UMA das duas pecas do pedido B, mas nao as duas: pedido nao se separa.
  const s91=novaSobra(x,'0,95','1,55');
  const p=plano.calcular({tecido_id:x.t.id,pecas:[peca('1,00','1,00','A'),
    peca('0,90','1,60','B'),peca('0,92','1,50','B')]});
  igual(usou(p).includes(usada.codigo),true,'o plano usou uma sobra');
  const e=p.sobras_que_servem.find(z=>z.codigo===s91.codigo);
  igual(!!e,true,'e a S que servia aparece mesmo assim — antes a lista sumia');
  igual(e&&e.motivo_codigo,'pedido_nao_separa','pelo motivo certo');
  igual(e&&/pedido B/.test(e.motivo),true,'nomeando o pedido: '+(e&&e.motivo));
}},

{nome:'R22 — a RESERVADA noutro corte aparece mesmo com outra sobra usada', executar({igual}){
  const x=cena();
  const res=novaSobra(x,'1,00','2,10');
  const outra=novaSobra(x,'1,00','2,50');
  // Um corte aberto de outro operador segura a primeira.
  const pc=[peca('1,00','1,00','R1')];
  const p1=plano.calcular({tecido_id:x.t.id,pecas:pc});
  corte.confirmar({tecido_id:x.t.id,pecas:pc,assinatura:p1.assinatura},'Outro'+n);
  igual(usou(p1).join(),res.codigo,'o primeiro corte segurou a menor');
  const p=plano.calcular({tecido_id:x.t.id,pecas:[peca('1,00','1,00','R2')]});
  igual(usou(p).join(),outra.codigo,'este usou a outra');
  const e=p.sobras_que_servem.find(z=>z.codigo===res.codigo);
  igual(e&&e.motivo_codigo,'reservada','e a reservada diz que esta reservada');
}},

{nome:'R22 — a que servia mas a peca foi para OUTRA SOBRA diz qual, e por que', executar({igual}){
  const x=cena();
  const perde=novaSobra(x,'1,05','1,05');
  const ganha=novaSobra(x,'1,00','2,10');
  const p=plano.calcular({tecido_id:x.t.id,pecas:[peca('1,00','1,00','O1')]});
  const e=p.sobras_que_servem.find(z=>z.codigo===perde.codigo);
  igual(e&&e.motivo_codigo,'outra_sobra','o motivo');
  igual(e&&e.motivo.includes(ganha.codigo),true,'nomeia a sobra escolhida: '+(e&&e.motivo));
  igual(e&&/menos refugo/.test(e.motivo),true,'e diz o criterio: '+(e&&e.motivo));
}},

{nome:'R22 — "nenhuma comporta" so quando e verdade, e a escolhida nao se explica', executar({igual}){
  const x=cena();
  const s=novaSobra(x,'1,00','2,10');
  const p=plano.calcular({tecido_id:x.t.id,pecas:[peca('1,00','1,00','V1')]});
  igual(p.sobre_sobras,null,'usou sobra: nao ha negativa');
  igual(p.sobras_que_servem.some(z=>z.codigo===s.codigo),false,'a usada nao vira explicacao');
}},

{nome:'R22 — duas sobras GEMEAS: a frase nao inventa que a escolhida e menor', executar({igual}){
  const x=cena();
  novaSobra(x,'1,00','2,10'); novaSobra(x,'1,00','2,10');
  const p=plano.calcular({tecido_id:x.t.id,pecas:[peca('1,00','1,00','G1')]});
  const e=p.sobras_que_servem.find(z=>z.motivo_codigo==='outra_sobra');
  igual(e&&/menor/.test(e.motivo),false,'sem "menor": '+(e&&e.motivo));
  igual(e&&/mesma medida/.test(e.motivo),true,'diz que sao iguais: '+(e&&e.motivo));
}},

/* ── R25 ────────────────────────────────────────────────────────────────── */
{nome:'R25 — SEM CORTE NOS 30 DIAS, a media e null, nunca zero', executar({igual}){
  db.prepare("UPDATE plano SET feito_em=datetime('now','localtime','-90 days') WHERE etapa='feito'").run();
  const x=cena(); novaSobra(x,'1,00','2,10');
  const p=plano.calcular({tecido_id:x.t.id,pecas:[peca('1,00','1,00','M0')]});
  igual(p.refugo_medio.pct,null,'nao ha o que medir');
  igual(p.refugo_medio.cortes,0,'zero cortes');
  igual(p.refugo_medio.dias,30,'a janela');
}},

{nome:'R25 — A MEDIA E refugo ÷ consumo dos cortes feitos, da tabela do painel de Refugo', executar({igual,perto}){
  const x=cena();
  novaSobra(x,'1,05','1,05');
  const pc=[peca('1,00','1,00','M1')];
  const p=plano.calcular({tecido_id:x.t.id,pecas:pc});
  const r=corte.confirmar({tecido_id:x.t.id,pecas:pc,assinatura:p.assinatura},x.quem);
  corte.cortar(r.plano_id,x.quem); corte.feito(r.plano_id,x.quem);
  // O refugo de DESCARTE de sobra nao e de corte: nao entra.
  db.prepare("INSERT INTO refugo(tecido_id,largura,altura,area,motivo) VALUES(?,1,1,1,'descarte')").run(x.t.id);
  const q=plano.calcular({tecido_id:x.t.id,pecas:[peca('0,50','0,50','M2')]});
  igual(q.refugo_medio.cortes,1,'um corte na janela');
  const soma=db.prepare("SELECT SUM(area) a FROM refugo WHERE plano_id=?").get(r.plano_id).a;
  const cons=db.prepare("SELECT consumo_m2 c FROM plano WHERE id=?").get(r.plano_id).c;
  perto(q.refugo_medio.pct,Math.round(soma/cons*1000)/10,'refugo ÷ consumo, em %',0.05);
  // Corte de 31 dias atras sai da janela.
  db.prepare("UPDATE plano SET feito_em=datetime('now','localtime','-31 days') WHERE id=?").run(r.plano_id);
  igual(plano.calcular({tecido_id:x.t.id,pecas:[peca('0,50','0,50','M3')]}).refugo_medio.cortes,0,'fora da janela');
}}

];
