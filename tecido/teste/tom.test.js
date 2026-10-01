// A REGRA DO TOM UNICO — pecas do mesmo pedido saem do mesmo lugar.
//
// Nao e otimizacao, e defeito de produto: duas persianas da mesma casa
// cortadas em fontes diferentes chegam com tom diferente, e o cliente ve as
// duas lado a lado na mesma parede.
const plano=require('../dominio/plano');
const corte=require('../dominio/corte');
const tom=require('../dominio/tom');
const db=require('../nucleo/db');
const sobra=require('../dominio/sobra');
const rolo=require('../dominio/rolo');
const etiqueta=require('../dominio/etiqueta');
const tecido=require('../dominio/tecido');
const endereco=require('../dominio/endereco');

// Cada teste ganha o SEU tecido. Sem isso a sobra que um teste deixou na
// prateleira decide o resultado do seguinte — e a falha aparece no teste
// errado.
let base=null, n=0;
function cena(){
  const x=montarBase();
  const cor=tecido.criarCor({nome:'Cor '+(++n)});
  const t=tecido.criarTecido({linha_id:x.linha.id,abertura_id:x.abertura.id,cor_id:cor.id});
  return {...x, t};
}
function montarBase(){
  if(base) return base;
  const linha=tecido.criarLinha({nome:'Rolo'});
  const abertura=tecido.criarAbertura({nome:'Screen 1%',linha_id:linha.id});
  const hR=endereco.criarHaste({nome:'A',armazem_chave:'ROLO'});
  const aR=endereco.criarAndar({nome:'01',haste_id:hR.id});
  const nR=endereco.criarNivel({nome:'01',andar_id:aR.id});
  const hS=endereco.criarHaste({nome:'C',armazem_chave:'SOBRA'});
  const aS=endereco.criarAndar({nome:'01',haste_id:hS.id});
  const nS=endereco.criarNivel({nome:'01',andar_id:aS.id});
  etiqueta.imprimirLote(60,'teste');
  /* UM BURACO NOVO A CADA TUBO. Cada nivel guarda um rolo so — uma cena com
     varios rolos precisa de varios niveis, como a prateleira de verdade. */
  let seq=1;
  base={linha, abertura, nivelRolo:nR.id, nivelSobra:nS.id,
        buraco:()=>endereco.criarNivel({nome:String(++seq).padStart(2,'0'),andar_id:aR.id}).id};
  return base;
}
function novaSobra(x,largura,altura){
  const cod=etiqueta.pendentes()[0].codigo;
  return sobra.criar({codigo:cod,tecido_id:x.t.id,largura,altura,
    condicao:'integra',nivel_id:x.nivelSobra},'teste');
}
const fontesDe=p=>p.faixas.map(f=>f.fonte+':'+f.fonte_id);

/* O cenario dos degraus: tres pecas do mesmo pedido que nao cabem inteiras em
   fonte nenhuma. O rolo tem uma puxada so (2,60 m) — cabem duas lado a lado.
   A terceira so sai numa sobra. */
function degraus(x,origemDaSobra){
  const r=rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'2,60',nivel_id:x.buraco()},'teste');
  const dados={codigo:etiqueta.pendentes()[0].codigo,tecido_id:x.t.id,largura:1.50,altura:2.60,
    condicao:'integra',nivel_id:x.nivelSobra};
  if(origemDaSobra==='mesmo') Object.assign(dados,{origem:'rolo',origem_rolo_id:r.id});
  let r2=null;
  if(origemDaSobra==='outro'){
    r2=rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'1,00',nivel_id:x.buraco()},'teste');
    Object.assign(dados,{origem:'rolo',origem_rolo_id:r2.id});
  }
  const s=sobra.criar(dados,'teste');
  const pecas=[1,2,3].map(()=>({pedido:'TOM'+x.t.id,tipo:'cliente_final',largura:'1,40',altura:'2,50'}));
  return {r,r2,s,pecas};
}


module.exports=[

{nome:'as tres pecas do pedido cabem na sobra: usa a sobra', executar({igual}){
  const x=cena();
  rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'50',nivel_id:x.buraco()},'teste');
  novaSobra(x,2.90,2.60);      // comporta as tres lado a lado

  const p=plano.calcular({tecido_id:x.t.id,pecas:[
    {pedido:'4292',tipo:'cliente_final',largura:'0,90',altura:'2,50'},
    {pedido:'4292',tipo:'cliente_final',largura:'0,90',altura:'2,50'},
    {pedido:'4292',tipo:'cliente_final',largura:'0,90',altura:'2,50'}]});

  igual(new Set(fontesDe(p)).size,1,'uma fonte so');
  igual(p.faixas[0].fonte,'sobra','e a sobra');
  igual(p.faixas[0].pecas.length,3,'as tres juntas');
}},

{nome:'A REGRA: uma na sobra e duas na bobina NAO acontece', executar({igual}){
  const x=cena();
  rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'50',nivel_id:x.buraco()},'teste');
  // Sobra que comporta UMA peca so. Sem a regra do tom, o plano poria uma
  // aqui e as outras duas no rolo — tres persianas da mesma casa, dois tons.
  novaSobra(x,1.00,2.60);

  const p=plano.calcular({tecido_id:x.t.id,pecas:[
    {pedido:'5000',tipo:'cliente_final',largura:'0,90',altura:'2,50'},
    {pedido:'5000',tipo:'cliente_final',largura:'0,90',altura:'2,50'},
    {pedido:'5000',tipo:'cliente_final',largura:'0,90',altura:'2,50'}]});

  const fontes=new Set(fontesDe(p));
  igual(fontes.size,1,'o pedido inteiro saiu de uma fonte so');
  igual(p.faixas[0].fonte,'rolo','e foi para o rolo, porque a sobra nao comportava as tres');
  igual(p.pecas_nao_alocadas.length,0,'nenhuma peca ficou de fora');
}},

{nome:'pedidos diferentes podem usar fontes diferentes', executar({igual}){
  const x=cena();
  rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'50',nivel_id:x.buraco()},'teste');
  // A sobra de 1,00 x 2,60 serve para o pedido de UMA peca: ali nao ha com
  // quem combinar tom.
  novaSobra(x,1.00,2.60);
  const p=plano.calcular({tecido_id:x.t.id,pecas:[
    {pedido:'6001',tipo:'cliente_final',largura:'0,90',altura:'2,50'},
    {pedido:'6002',tipo:'cliente_final',largura:'0,90',altura:'2,50'},
    {pedido:'6002',tipo:'cliente_final',largura:'0,90',altura:'2,50'}]});

  const porPedido={};
  p.faixas.forEach(f=>f.pecas.forEach(pc=>{
    const orig=p.pecas.find(y=>y.id===pc.id);
    (porPedido[orig.pedido]=porPedido[orig.pedido]||new Set()).add(f.fonte+':'+f.fonte_id);
  }));
  igual(porPedido['6001'].size,1,'o pedido 6001 numa fonte so');
  igual(porPedido['6002'].size,1,'o pedido 6002 numa fonte so');
}},

{nome:'peca SEM pedido e livre — nao precisa combinar com ninguem', executar({igual}){
  const x=cena();
  rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'50',nivel_id:x.buraco()},'teste');
  novaSobra(x,1.00,2.60);
  const p=plano.calcular({tecido_id:x.t.id,pecas:[
    {tipo:'cliente_final',largura:'0,90',altura:'2,50'},
    {tipo:'cliente_final',largura:'0,90',altura:'2,50'},
    {tipo:'cliente_final',largura:'0,90',altura:'2,50'}]});
  igual(p.pecas_nao_alocadas.length,0,'todas alocadas');
  // Sem pedido informado, cada peca e um grupo de uma so: o plano pode
  // espalhar como for melhor.
  igual(p.faixas.length>=1,true,'o plano saiu');
}},

{nome:'pedido que nao cabe em lugar nenhum volta com o motivo certo', executar({igual}){
  const x=cena();
  // Rolo de 3,00 com saldo curto: 4 pecas de 2,40 de altura pediriam 9,60 m
  // e o saldo nao cobre. O pedido inteiro volta, e o motivo explica que
  // pecas do mesmo pedido nao se separam.
  const r=rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'3',nivel_id:x.buraco()},'teste');

  const p=plano.calcular({tecido_id:x.t.id,pecas:[
    {pedido:'7777',tipo:'cliente_final',largura:'2,90',altura:'2,40'},
    {pedido:'7777',tipo:'cliente_final',largura:'2,90',altura:'2,40'}]});

  igual(p.pecas_nao_alocadas.length,2,'o pedido inteiro voltou');
  igual(/mesmo pedido/.test(p.pecas_nao_alocadas[0].motivo)||
        /nao sobrou material/.test(p.pecas_nao_alocadas[0].motivo),true,
    'com motivo legivel: '+p.pecas_nao_alocadas[0].motivo);
}},

{nome:'O PEDIDO CORTADO EM DOIS DIAS CONTINUA NO MESMO ROLO', executar({igual,perto}){
  const x=cena();
  // O caso real: o pedido 4272 tem 11 persianas e o arquivo do dia trouxe
  // so 9. As outras duas foram cortadas antes. Cada plano, sozinho, estava
  // certo — e mesmo assim a casa receberia dois tons.
  const bom=rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'50',nivel_id:x.buraco()},'teste');
  // Um rolo mais economico para estas medidas, que venceria a simulacao.
  rolo.entrada({tecido_id:x.t.id,largura:'2,00',metragem:'50',nivel_id:x.buraco()},'teste');

  // DIA 1: as duas primeiras pecas do pedido.
  const dia1=[{pedido:'4272',tipo:'cliente_final',largura:'1,495',altura:'2,730'},
              {pedido:'4272',tipo:'cliente_final',largura:'1,495',altura:'2,730'}];
  const p1=plano.calcular({tecido_id:x.t.id,pecas:dia1});
  igual(p1.faixas[0].codigo,bom.codigo,'o dia 1 escolheu a bobina de 3,00 (duas por faixa)');
  const c1=corte.confirmar({tecido_id:x.t.id,pecas:dia1,assinatura:p1.assinatura},'teste');
  corte.cortar(c1.plano_id,'teste'); corte.feito(c1.plano_id,'teste');

  // DIA 2: o resto do pedido. Sem olhar para tras, o plano poderia mudar de
  // rolo — e o cliente veria a diferenca na parede.
  const p2=plano.calcular({tecido_id:x.t.id,pecas:[
    {pedido:'4272',tipo:'cliente_final',largura:'1,495',altura:'2,730'},
    {pedido:'4272',tipo:'cliente_final',largura:'1,615',altura:'2,540'}]});

  igual(p2.continuando_em!==null,true,'o plano reconheceu o corte anterior');
  igual(p2.continuando_em.codigo,bom.codigo,'e continua no MESMO rolo');
  igual(new Set(p2.faixas.map(f=>f.codigo)).size,1,'uma fonte so');
  igual(p2.faixas[0].codigo,bom.codigo,'o rolo do dia 1');
  igual(p2.cortes_anteriores.length>0,true,'e avisa quantas pecas ja sairam: '+
    p2.cortes_anteriores.map(h=>h.pecas+' em '+h.codigo).join(', '));
}},

{nome:'pedido novo nao herda rolo de outro pedido', executar({igual}){
  const x=cena();
  rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'50',nivel_id:x.buraco()},'teste');
  const p=plano.calcular({tecido_id:x.t.id,pecas:[
    {pedido:'9999',tipo:'cliente_final',largura:'1,00',altura:'2,00'}]});
  igual(p.continuando_em,null,'sem historico, escolhe livremente');
  igual(p.cortes_anteriores.length,0,'e nao inventa aviso');
}},

{nome:'a altura minima de 1 m manda a tira baixa para o refugo', executar({igual,perto}){
  const x=cena();
  const config=require('../nucleo/config');
  perto(config.ler('alturaMinimaSobra'),1.00,'o parametro nasce em 1,00');

  // Sobra 1,90 x 2,60 levando duas pecas de 2,50: sobra um pe de 1,90 x 0,10.
  // A largura passa folgado; a altura, nao.
  novaSobra(x,1.90,2.60);
  const p=plano.calcular({tecido_id:x.t.id,pecas:[
    {pedido:'8001',tipo:'cliente_final',largura:'0,90',altura:'2,50'},
    {pedido:'8001',tipo:'cliente_final',largura:'0,90',altura:'2,50'}]});
  const pe=p.sobras_geradas.concat(p.refugos).find(s=>Math.abs(s.altura-0.10)<0.001);
  igual(!!pe,true,'o pe de 0,10 existe');
  igual(p.sobras_geradas.some(s=>Math.abs(s.altura-0.10)<0.001),false,
    'e NAO virou sobra com etiqueta');
  igual(p.refugos.some(s=>Math.abs(s.altura-0.10)<0.001),true,'foi para o refugo, medido');
}}
,

// ── NAO HA EMENDA ────────────────────────────────────────────────────────

{nome:'PECA MAIS LARGA QUE A BOBINA: o plano grita, e vira pedido de compra',
 executar({igual,perto}){
  const x=cena();
  rolo.entrada({tecido_id:x.t.id,largura:'2,00',metragem:'50',nivel_id:x.buraco()},'teste');

  const p=plano.calcular({tecido_id:x.t.id,pecas:[
    {tipo:'cliente_final',largura:'1,20',altura:'2,00'},     // esta sai
    {tipo:'cliente_final',largura:'2,40',altura:'1,50'},     // esta nao tem bobina
    {tipo:'cliente_final',largura:'2,40',altura:'1,00'}]});  // nem esta

  igual(p.faixas.length>0,true,'o resto do plano continua saindo');
  igual(!!p.falta_bobina,true,'e a falta vem separada, nao so numa linha de texto');
  igual(p.falta_bobina.pecas,2,'duas pecas sem bobina');
  igual(p.falta_bobina.largura_necessaria,2.40,'precisa de bobina de 2,40');
  igual(p.falta_bobina.largura_maxima_estoque,2.00,'a maior que existe tem 2,00');
  perto(p.falta_bobina.faltam_m,0.40,'faltam 40 cm de largura');

  /* Decisao do dono, 03/09/2026: EMENDA NAO EXISTE. Peca mais larga que toda
     bobina do estoque simplesmente nao sai. Por isso a recusa nao pode morrer
     numa linha de texto no meio da tela — ela e uma venda parada esperando
     material, e o numero tem que chegar em quem compra tecido. */
}},

{nome:'com bobina larga o bastante, nao ha falta nenhuma', executar({igual}){
  const x=cena();
  rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'50',nivel_id:x.buraco()},'teste');
  const p=plano.calcular({tecido_id:x.t.id,pecas:[{tipo:'cliente_final',largura:'2,40',altura:'1,50'}]});
  igual(p.falta_bobina,null,'null, e nao um objeto vazio');
  // Tarja de alarme que aparece sem alarme e tarja que a equipe aprende a
  // ignorar — e ai a de verdade passa batida.
}},

/* ── R4: A MENSAGEM DIZ QUAL SOBRA SERVE, E POR QUE NAO ENTROU ────────────
   Fase 2 da spec SOBRAS-TOM-E-DESPERDICIO. Estes casos moram AQUI, ao lado
   dos do tom unico, porque sao a mesma regra vista pelo outro lado: o tom
   unico e o que recusa a sobra, e a explicacao e o que a tela devia dizer.
   Separar os dois arquivos deixaria alguem afrouxar um sem ler o outro. */

{nome:'R4 — O CASO DO §1: a tela diz que a sobra serve, e por que nao entrou',
 executar({igual,perto}){
  const x=cena();
  /* A MEDIDA E ESCOLHIDA PARA COMPORTAR SO UMA DAS DUAS PECAS, que e o caso
     do §1: 0,95 × 1,55 aceita a de 0,92 × 1,50 e recusa a de 0,90 × 1,60
     (altura). Uma sobra que comportasse as duas citaria a maior e o caso
     deixaria de reproduzir o "pronto quando" da spec. */
  const s=novaSobra(x,'0,95','1,55');
  // Duas que nao servem para nada: a lista nao pode cita-las.
  novaSobra(x,'0,40','0,40'); novaSobra(x,'0,50','0,60');

  const p=plano.calcular({tecido_id:x.t.id,pecas:[
    {tipo:'cliente_final',largura:'0,90',altura:'1,60',pedido:'1'},
    {tipo:'cliente_final',largura:'0,92',altura:'1,50',pedido:'1'}]});

  igual(p.faixas.length,0,'nada foi cortado — o pedido nao cabe inteiro');
  // ISTO E O DEFEITO QUE A FASE 2 CONSERTA: a frase negava e nomeava a
  // propria sobra que servia.
  igual(p.sobre_sobras,null,'a negativa categorica saiu');

  igual(p.sobras_que_servem.length,1,'so a que serve entra na lista');
  const e=p.sobras_que_servem[0];
  igual(e.codigo,s.codigo,'a sobra certa');
  perto(e.peca.largura,0.92,'a peca que ela comporta');
  perto(e.peca.altura,1.50,'a peca que ela comporta');
  igual(e.outras_pecas,0,'ela comporta so essa');
  igual(e.motivo_codigo,'pedido_nao_separa','o motivo tecnico');
  igual(/pedido 1/.test(e.motivo),true,'a frase nomeia o pedido: '+e.motivo);
  igual(/nao se separam/.test(e.motivo),true,'e diz a regra: '+e.motivo);
  igual(e.endereco.length>0,true,'com o endereco, para achar na prateleira');

  // O card vermelho continua igual: a Fase 2 nao mexeu nele.
  igual(p.pecas_nao_alocadas.length,2,'as duas pecas seguem marcadas');
  igual(p.pecas_nao_alocadas[0].codigo,'tom_unico','com o codigo de sempre');
}},

{nome:'R4 — a sobra que comporta VARIAS cita a maior, e conta as outras',
 executar({igual,perto}){
  const x=cena();
  novaSobra(x,'1,00','1,60');   // comporta as duas
  /* A MENOR VEM PRIMEIRO, DE PROPOSITO. Com a maior na frente, "pegar a
     primeira" acertaria por acaso e o caso ficaria cego — foi o que a
     conferencia por mutacao mostrou: trocar a regra por `lista[0]` passava
     com 17 verdes. A ordem da cena e o que da sentido a asserção. */
  const p=plano.calcular({tecido_id:x.t.id,pecas:[
    {tipo:'cliente_final',largura:'0,92',altura:'1,50',pedido:'7'},
    {tipo:'cliente_final',largura:'0,90',altura:'1,60',pedido:'7'}]});
  igual(p.sobras_que_servem.length,1,'uma linha');
  const e=p.sobras_que_servem[0];
  // A MAIOR EM AREA: 0,90 × 1,60 = 1,44 m² contra 1,38 m². E ela que responde
  // "ate onde essa sobra da".
  perto(e.peca.largura,0.90,'citou a maior em area');
  perto(e.peca.altura,1.60,'citou a maior em area');
  igual(e.outras_pecas,1,'e disse que ha outra que tambem cabe');
}},

{nome:'R4 — quando nenhuma comporta DE VERDADE, a frase antiga continua',
 executar({igual}){
  const x=cena();
  novaSobra(x,'0,40','0,40');
  const p=plano.calcular({tecido_id:x.t.id,pecas:[{tipo:'cliente_final',largura:'1,00',altura:'2,00',pedido:'9'}]});
  igual(p.sobras_que_servem.length,0,'nenhuma serve, nada a listar');
  igual(/Nenhuma das 1 sobras/.test(p.sobre_sobras),true,'a negativa volta: '+p.sobre_sobras);
  igual(/comporta/.test(p.sobre_sobras),true,'com a palavra de sempre');
}},

{nome:'R4 — a sobra RECUSADA no plano aparece como recusada, nao como "nao comporta"',
 executar({igual}){
  const x=cena();
  const s=novaSobra(x,'1,20','2,20');           // comporta a peca com folga
  const p=plano.calcular({tecido_id:x.t.id,
    pecas:[{tipo:'cliente_final',largura:'1,00',altura:'2,00',pedido:'11'}], recusadas:[s.id]});
  igual(p.faixas.length,0,'sem fonte, porque a unica foi recusada');
  igual(p.sobras_que_servem.length,1,'ela aparece');
  igual(p.sobras_que_servem[0].motivo_codigo,'recusada','com o motivo certo');
  igual(/recusada neste plano/.test(p.sobras_que_servem[0].motivo),true,
    'e a frase diz isso: '+p.sobras_que_servem[0].motivo);
  igual(p.sobre_sobras,null,'sem negativa por cima');
}},

{nome:'R4 — a sobra de condicao NAO APROVEITAVEL deixa de ser invisivel',
 executar({igual,db}){
  const x=cena();
  /* O `candidatas()` filtra `aproveitavel=1` no SQL, entao esta sobra nunca
     chegava a tela: retalho do tamanho certo, na prateleira, que o plano nao
     oferece e nao explica. */
  db.prepare(`INSERT OR IGNORE INTO condicao_sobra(chave,nome,aproveitavel,prioridade,ordem)
    VALUES('inservivel','Inservivel',0,9,9)`).run();
  const cod=etiqueta.pendentes()[0].codigo;
  sobra.criar({codigo:cod,tecido_id:x.t.id,largura:'1,20',altura:'2,20',
    condicao:'inservivel',nivel_id:x.nivelSobra},'teste');

  const p=plano.calcular({tecido_id:x.t.id,pecas:[{tipo:'cliente_final',largura:'1,00',altura:'2,00',pedido:'13'}]});
  igual(p.sobras_que_servem.length,1,'ela aparece na explicacao');
  igual(p.sobras_que_servem[0].motivo_codigo,'nao_aproveitavel','com o motivo certo');
  igual(/nao aproveitavel/.test(p.sobras_que_servem[0].motivo),true,
    'e a frase manda para o cadastro: '+p.sobras_que_servem[0].motivo);
  // E ela NAO voltou a ser candidata: explicar nao e liberar.
  igual(p.faixas.length,0,'o plano continua sem cortar nela');
}},

{nome:'R4 — a "maior" da frase nunca e uma sobra RECUSADA', executar({igual}){
  const x=cena();
  // A recusada e a MAIOR em area (2,50 m²) e nao serve a peca: altura de 1,00
  // contra 2,00. A antiga tirava a "maior" de todas as sobras e apresentava
  // justamente esta — a que o operador acabara de recusar.
  const grande=novaSobra(x,'2,50','1,00');
  const pequena=novaSobra(x,'0,50','2,00');     // tambem nao serve (largura)
  const p=plano.calcular({tecido_id:x.t.id,
    pecas:[{tipo:'cliente_final',largura:'0,90',altura:'2,00',pedido:'15'}], recusadas:[grande.id]});
  igual(p.sobras_que_servem.length,0,'nenhuma serve esta peca');
  igual(p.sobre_sobras.includes(pequena.codigo),true,
    'a maior citada e a disponivel: '+p.sobre_sobras);
  igual(p.sobre_sobras.includes(grande.codigo),false,
    'e nunca a recusada: '+p.sobre_sobras);
}},

{nome:'R4 — plano que USOU sobra nao ganha lista nem frase', executar({igual}){
  const x=cena();
  novaSobra(x,'1,20','2,20');
  const p=plano.calcular({tecido_id:x.t.id,pecas:[{tipo:'cliente_final',largura:'1,00',altura:'2,00',pedido:'17'}]});
  igual(p.faixas.length,1,'cortou na sobra');
  igual(p.sobras_que_servem.length,0,'nada a explicar');
  igual(p.sobre_sobras,null,'e nenhuma frase');
  // Aviso que aparece no caso normal e aviso que a equipe aprende a fechar
  // (armadilha #6) — e ai o da lista de verdade passa batido.
}}
,

/* ═══ FASE 4 DA CORTE-EM-ETAPAS — o tom pela ORIGEM (R9–R12) ══════════════ */

{nome:'R9 — a sobra que nasceu do rolo tem a origem dele; a de sobra sobe ate o rolo; a do mutirao e sozinha', executar({igual}){
  const x=cena();
  const r=rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'50',nivel_id:x.buraco()},'teste');
  const filha=sobra.criar({codigo:etiqueta.pendentes()[0].codigo,tecido_id:x.t.id,largura:1,altura:2,
    condicao:'integra',nivel_id:x.nivelSobra,origem:'rolo',origem_rolo_id:r.id},'teste');
  const neta=sobra.criar({codigo:etiqueta.pendentes()[0].codigo,tecido_id:x.t.id,largura:1,altura:1,
    condicao:'integra',nivel_id:x.nivelSobra,origem:'sobra',origem_sobra_id:filha.id},'teste');
  const m1=novaSobra(x,1,1), m2=novaSobra(x,1,1);
  igual(tom.origem('rolo',r.id).chave,'rolo:'+r.id,'o rolo e a propria origem');
  igual(tom.origem('sobra',filha.id).chave,'rolo:'+r.id,'a sobra que nasceu do rolo');
  igual(tom.origem('sobra',neta.id).chave,'rolo:'+r.id,'a sobra de sobra sobe ate o rolo');
  igual(tom.origem('sobra',m1.id).chave==='sobra:'+m1.id,true,'a do mutirao e sozinha');
  igual(tom.origem('sobra',m1.id).chave!==tom.origem('sobra',m2.id).chave,true,'e duas do mutirao NAO tem a mesma origem');
}},

{nome:'R10 — degrau 2: dividido entre a sobra que nasceu do rolo e o proprio rolo, SEM conferencia', executar({igual}){
  const x=cena(); const {r,s,pecas}=degraus(x,'mesmo');
  const p=plano.calcular({tecido_id:x.t.id,pecas});
  igual(p.pecas_nao_alocadas.length,0,'as tres pecas tem lugar');
  igual(p.divididos.length,1,'o pedido foi dividido');
  igual(p.divididos[0].grau,2,'no degrau 2 — mesma origem');
  igual(new Set(p.faixas.map(f=>f.fonte+':'+f.fonte_id)).size,2,'duas fontes');
  igual(p.faixas.some(f=>f.fonte==='sobra'&&f.fonte_id===s.id)&&p.faixas.some(f=>f.fonte==='rolo'&&f.fonte_id===r.id),true,'a sobra e o rolo dela');
  igual(p.conferencias.length,0,'e nao pede conferencia: o tom e o do rolo');
}},

{nome:'R10 — degrau 3: dividido entre origens diferentes, e cada fonte pede conferencia', executar({igual}){
  const x=cena(); const {r,s,pecas}=degraus(x,'outro');
  const p=plano.calcular({tecido_id:x.t.id,pecas});
  igual(p.pecas_nao_alocadas.length,0,'as tres tem lugar');
  igual(p.divididos[0].grau,3,'no degrau 3 — origens diferentes');
  igual(p.conferencias.length,2,'as duas fontes pedem conferencia');
  igual(p.conferencias.some(c=>c.fonte==='sobra'&&c.fonte_id===s.id),true,'a sobra');
  igual(p.conferencias.some(c=>c.fonte==='rolo'&&c.fonte_id===r.id),true,'e o rolo');
}},

{nome:'R10 — o degrau 1 continua vencendo: o pedido que cabe inteiro nao se divide', executar({igual}){
  const x=cena();
  rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'50',nivel_id:x.buraco()},'teste');
  novaSobra(x,1.50,2.60);
  const p=plano.calcular({tecido_id:x.t.id,pecas:[1,2,3].map(()=>({pedido:'UM'+x.t.id,tipo:'cliente_final',largura:'1,40',altura:'2,50'}))});
  igual(p.divididos.length,0,'nao dividiu');
  igual(new Set(p.faixas.map(f=>f.fonte+':'+f.fonte_id)).size,1,'uma fonte so');
}},

{nome:'R10 — o pedido so se divide se couber INTEIRO na divisao', executar({igual}){
  const x=cena();
  rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'2,60',nivel_id:x.buraco()},'teste');
  // Quatro pecas: o rolo leva duas, a sobra uma, e a quarta nao tem lugar.
  novaSobra(x,1.50,2.60);
  const p=plano.calcular({tecido_id:x.t.id,pecas:[1,2,3,4].map(()=>({pedido:'Q'+x.t.id,tipo:'cliente_final',largura:'1,40',altura:'2,50'}))});
  igual(p.divididos.length,0,'nao divide pela metade');
  igual(p.pecas_nao_alocadas.length,4,'o pedido inteiro volta marcado');
}},

{nome:'R11 — O CORTE FEITO E RECUSADO SEM A CONFERENCIA, e a frase diz qual', executar({igual,recusa}){
  const x=cena(); const {s,pecas}=degraus(x,'outro');
  const p=plano.calcular({tecido_id:x.t.id,pecas});
  const c=corte.confirmar({tecido_id:x.t.id,pecas,assinatura:p.assinatura},'Tom'+x.t.id);
  corte.cortar(c.plano_id,'Tom'+x.t.id);
  const e=recusa(()=>corte.feito(c.plano_id,'Tom'+x.t.id),'falta_conferir');
  igual(new RegExp(s.codigo).test(e.mensagem),true,'a frase nomeia a fonte: '+e.mensagem);
  const a=corte.aberto('Tom'+x.t.id);
  a.conferencias.forEach(k=>corte.conferir(c.plano_id,{pedido:k.pedido,fonte:k.fonte,fonte_id:k.fonte_id},'Tom'+x.t.id));
  igual(corte.aberto('Tom'+x.t.id).conferencias.every(k=>k.conferida),true,'todas conferidas');
  igual(corte.feito(c.plano_id,'Tom'+x.t.id).etapa,'feito','e agora sai');
  const grav=db.prepare('SELECT * FROM plano_conferencia WHERE plano_id=? AND invalidada_em IS NULL').all(c.plano_id);
  igual(grav.length,2,'as duas conferencias ficaram gravadas');
  igual(grav.every(g=>g.usuario_nome==='Tom'+x.t.id&&g.pedido===pecas[0].pedido),true,'com quem e o pedido');
}},

{nome:'R11 — conferir so no Cortando', executar({recusa}){
  const x=cena(); const {pecas}=degraus(x,'outro');
  const p=plano.calcular({tecido_id:x.t.id,pecas});
  const c=corte.confirmar({tecido_id:x.t.id,pecas,assinatura:p.assinatura},'Tc'+x.t.id);
  const k=p.conferencias[0];
  recusa(()=>corte.conferir(c.plano_id,{pedido:k.pedido,fonte:k.fonte,fonte_id:k.fonte_id},'Tc'+x.t.id),'etapa_errada');
}},

{nome:'R11 — "tom diferente" troca a fonte ali mesmo, e a conferencia da fonte que mudou zera', executar({igual}){
  const x=cena(); const {r,r2,s,pecas}=degraus(x,'outro');
  // Uma segunda sobra, do mutirao (sem origem), para onde a peca pode ir.
  novaSobra(x,1.50,2.60);
  const quem='Tz'+x.t.id;
  const p=plano.calcular({tecido_id:x.t.id,pecas});
  const c=corte.confirmar({tecido_id:x.t.id,pecas,assinatura:p.assinatura},quem);
  corte.cortar(c.plano_id,quem);
  let a=corte.aberto(quem);
  a.conferencias.forEach(k=>corte.conferir(c.plano_id,{pedido:k.pedido,fonte:k.fonte,fonte_id:k.fonte_id},quem));
  igual(a.conferencias.length>=2,true,'o pedido dividido entre origens pede conferencias');
  const sobraNoPlano=s.id;
  const tom_=db.prepare("SELECT id FROM motivo_recusa WHERE nome='Tonalidade diferente'").get().id;
  a=corte.editar(c.plano_id,{tipo:'nao_usar',fonte:'sobra',fonte_id:sobraNoPlano,motivo_id:tom_},quem);
  igual(a.proposta.faixas.some(f=>f.fonte==='sobra'&&f.fonte_id===sobraNoPlano),false,'a sobra saiu do corte');
  igual(a.conferencias.filter(k=>k.conferida).every(k=>!(k.fonte==='sobra'&&k.fonte_id===sobraNoPlano)),true,
    'a conferencia da sobra que saiu nao vale mais');
  igual(db.prepare("SELECT COUNT(*) n FROM plano_conferencia WHERE plano_id=? AND invalidada_em IS NOT NULL").get(c.plano_id).n>=1,true,
    'ela ficou registrada como invalidada');
}},

{nome:'R12 — O PEDIDO CORTADO ANTES SO CONTINUA NO MESMO TECIDO (o rolo de outra cor nao serve)', executar({igual}){
  /* O defeito achado na fase 1: o pedido de persianas de duas cores, cortada
     a primeira, mandava a segunda continuar no rolo da PRIMEIRA cor. */
  const x=cena(); const y=cena();
  const rx=rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'50',nivel_id:x.buraco()},'teste');
  const ry=rolo.entrada({tecido_id:y.t.id,largura:'3,00',metragem:'50',nivel_id:y.buraco()},'teste');
  const pedido='DUASCORES'+x.t.id;
  const p1=plano.calcular({tecido_id:x.t.id,pecas:[{pedido,tipo:'ml',largura:'1,00',altura:'2,00'}]});
  const c1=corte.confirmar({tecido_id:x.t.id,pecas:[{pedido,tipo:'ml',largura:'1,00',altura:'2,00'}],assinatura:p1.assinatura},'D'+x.t.id);
  corte.cortar(c1.plano_id,'D'+x.t.id); corte.feito(c1.plano_id,'D'+x.t.id);
  const p2=plano.calcular({tecido_id:y.t.id,pecas:[{pedido,tipo:'ml',largura:'1,00',altura:'2,00'}]});
  igual(p2.continuando_em,null,'nao "continua" no rolo da outra cor');
  igual(p2.faixas.every(f=>f.fonte_id===ry.id),true,'e corta no rolo deste tecido');
  igual(p2.cortes_anteriores.length,0,'o corte da outra cor nao e corte anterior deste tecido');
}},

{nome:'R12 — o pedido ja cortado de OUTRA origem pede conferencia mesmo numa fonte so', executar({igual}){
  const x=cena();
  const r1=rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'2,10',nivel_id:x.buraco()},'teste');
  const pedido='ANTES'+x.t.id;
  const p1=plano.calcular({tecido_id:x.t.id,pecas:[{pedido,tipo:'ml',largura:'1,00',altura:'2,00'}]});
  const c1=corte.confirmar({tecido_id:x.t.id,pecas:[{pedido,tipo:'ml',largura:'1,00',altura:'2,00'}],assinatura:p1.assinatura},'A'+x.t.id);
  corte.cortar(c1.plano_id,'A'+x.t.id); corte.feito(c1.plano_id,'A'+x.t.id);
  // O rolo do dia 1 nao tem mais como dar a peca; entra outro rolo.
  rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'50',nivel_id:x.buraco()},'teste');
  const p2=plano.calcular({tecido_id:x.t.id,pecas:[{pedido,tipo:'ml',largura:'1,00',altura:'2,00'}]});
  igual(p2.faixas.length>=1&&p2.faixas[0].fonte_id!==r1.id,true,'o corte de hoje sai de outro rolo');
  igual(p2.conferencias.length,1,'e pede conferencia: o tom tem que bater com o do dia 1');
  igual(p2.conferencias[0].com_corte_anterior,true,'dizendo que e por causa do corte anterior');
}}

];
