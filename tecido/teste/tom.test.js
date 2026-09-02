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
  base={linha, abertura, nivelRolo:nR.id, nivelSobra:nS.id};
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
  rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'50',nivel_id:x.nivelRolo},'teste');
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
  rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'50',nivel_id:x.nivelRolo},'teste');
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
  rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'50',nivel_id:x.nivelRolo},'teste');
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
  rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'50',nivel_id:x.nivelRolo},'teste');
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
  const r=rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'3',nivel_id:x.nivelRolo},'teste');

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
  const bom=rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'50',nivel_id:x.nivelRolo},'teste');
  // Um rolo mais economico para estas medidas, que venceria a simulacao.
  rolo.entrada({tecido_id:x.t.id,largura:'2,00',metragem:'50',nivel_id:x.nivelRolo},'teste');

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
  rolo.entrada({tecido_id:x.t.id,largura:'3,00',metragem:'50',nivel_id:x.nivelRolo},'teste');
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

];
