// A REGRA DO TOM UNICO — pecas do mesmo pedido saem do mesmo lugar.
//
// Nao e otimizacao, e defeito de produto: duas persianas da mesma casa
// cortadas em fontes diferentes chegam com tom diferente, e o cliente ve as
// duas lado a lado na mesma parede.
const plano=require('../dominio/plano');
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

module.exports=[

{nome:'as tres pecas do pedido cabem na sobra: usa a sobra', executar({igual}){
  const x=cena();
  rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'50',nivel_id:x.buraco()},'teste');
  novaSobra(x,2.90,2.60);      // comporta as tres lado a lado

  const p=plano.calcular({tecido_id:x.t.id,pecas:[
    {pedido:'4292',largura:'0,90',altura:'2,50'},
    {pedido:'4292',largura:'0,90',altura:'2,50'},
    {pedido:'4292',largura:'0,90',altura:'2,50'}]});

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
    {pedido:'5000',largura:'0,90',altura:'2,50'},
    {pedido:'5000',largura:'0,90',altura:'2,50'},
    {pedido:'5000',largura:'0,90',altura:'2,50'}]});

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
    {pedido:'6001',largura:'0,90',altura:'2,50'},
    {pedido:'6002',largura:'0,90',altura:'2,50'},
    {pedido:'6002',largura:'0,90',altura:'2,50'}]});

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
    {largura:'0,90',altura:'2,50'},
    {largura:'0,90',altura:'2,50'},
    {largura:'0,90',altura:'2,50'}]});
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
    {pedido:'7777',largura:'2,90',altura:'2,40'},
    {pedido:'7777',largura:'2,90',altura:'2,40'}]});

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
  const dia1=[{pedido:'4272',largura:'1,495',altura:'2,730'},
              {pedido:'4272',largura:'1,495',altura:'2,730'}];
  const p1=plano.calcular({tecido_id:x.t.id,pecas:dia1});
  igual(p1.faixas[0].codigo,bom.codigo,'o dia 1 escolheu a bobina de 3,00 (duas por faixa)');
  const etiquetas={};
  p1.sobras_geradas.forEach(sg=>{ etiquetas[sg.indice]={codigo:etiquetaLivre(),nivel_id:x.nivelSobra}; });
  plano.confirmar({tecido_id:x.t.id,pecas:dia1,assinatura:p1.assinatura,etiquetas},'teste');

  // DIA 2: o resto do pedido. Sem olhar para tras, o plano poderia mudar de
  // rolo — e o cliente veria a diferenca na parede.
  const p2=plano.calcular({tecido_id:x.t.id,pecas:[
    {pedido:'4272',largura:'1,495',altura:'2,730'},
    {pedido:'4272',largura:'1,615',altura:'2,540'}]});

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
    {pedido:'9999',largura:'1,00',altura:'2,00'}]});
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
    {pedido:'8001',largura:'0,90',altura:'2,50'},
    {pedido:'8001',largura:'0,90',altura:'2,50'}]});
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
    {largura:'1,20',altura:'2,00'},     // esta sai
    {largura:'2,40',altura:'1,50'},     // esta nao tem bobina
    {largura:'2,40',altura:'1,00'}]});  // nem esta

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
  const p=plano.calcular({tecido_id:x.t.id,pecas:[{largura:'2,40',altura:'1,50'}]});
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
    {largura:'0,90',altura:'1,60',pedido:'1'},
    {largura:'0,92',altura:'1,50',pedido:'1'}]});

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
    {largura:'0,92',altura:'1,50',pedido:'7'},
    {largura:'0,90',altura:'1,60',pedido:'7'}]});
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
  const p=plano.calcular({tecido_id:x.t.id,pecas:[{largura:'1,00',altura:'2,00',pedido:'9'}]});
  igual(p.sobras_que_servem.length,0,'nenhuma serve, nada a listar');
  igual(/Nenhuma das 1 sobras/.test(p.sobre_sobras),true,'a negativa volta: '+p.sobre_sobras);
  igual(/comporta/.test(p.sobre_sobras),true,'com a palavra de sempre');
}},

{nome:'R4 — a sobra RECUSADA no plano aparece como recusada, nao como "nao comporta"',
 executar({igual}){
  const x=cena();
  const s=novaSobra(x,'1,20','2,20');           // comporta a peca com folga
  const p=plano.calcular({tecido_id:x.t.id,
    pecas:[{largura:'1,00',altura:'2,00',pedido:'11'}], recusadas:[s.id]});
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

  const p=plano.calcular({tecido_id:x.t.id,pecas:[{largura:'1,00',altura:'2,00',pedido:'13'}]});
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
    pecas:[{largura:'0,90',altura:'2,00',pedido:'15'}], recusadas:[grande.id]});
  igual(p.sobras_que_servem.length,0,'nenhuma serve esta peca');
  igual(p.sobre_sobras.includes(pequena.codigo),true,
    'a maior citada e a disponivel: '+p.sobre_sobras);
  igual(p.sobre_sobras.includes(grande.codigo),false,
    'e nunca a recusada: '+p.sobre_sobras);
}},

{nome:'R4 — plano que USOU sobra nao ganha lista nem frase', executar({igual}){
  const x=cena();
  novaSobra(x,'1,20','2,20');
  const p=plano.calcular({tecido_id:x.t.id,pecas:[{largura:'1,00',altura:'2,00',pedido:'17'}]});
  igual(p.faixas.length,1,'cortou na sobra');
  igual(p.sobras_que_servem.length,0,'nada a explicar');
  igual(p.sobre_sobras,null,'e nenhuma frase');
  // Aviso que aparece no caso normal e aviso que a equipe aprende a fechar
  // (armadilha #6) — e ai o da lista de verdade passa batido.
}}

];
