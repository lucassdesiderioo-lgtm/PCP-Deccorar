// O KIT DE INSTALACAO EM TODO PRODUTO — secao 8.5 da spec
// SOBMEDIDA-CADASTRO-DE-PRODUTO (dono, 28/10/2026).
//
// ⚠️ ESCRITO ANTES DO CODIGO (risco vermelho). O que este arquivo prova:
//   1. PRODUTO SEM KIT NA FICHA NAO ATIVA. Nao existe "nao leva kit": todo
//      produto leva. E e essa trava que fecha o buraco da R-SMN-13 — sem ela,
//      a ficha que esqueceu o kit passaria pela embalagem sem cobrar nada.
//   2. A FAIXA DE SUPORTE SERVE A CADA KIT. Um Painel com bandô leva os
//      suportes do TRILHO e os do BANDÔ, cada um pela sua faixa, e em duas
//      larguras de faixas diferentes os dois numeros andam separados.
//   3. A EMBALAGEM COBRA CADA KIT, com a quantidade de suportes que a faixa
//      deu: com dois kits, um so nao fecha a caixa.
//   4. O ROLO NAO MUDA: as faixas dele sao "do produto" (sem kit apontado), e
//      o kit bandô e o kit barra continuam contando por elas.
const tecido=require('../dominio/tecido');
const catalogo=require('../dominio/catalogo_sm');
const persiana=require('../dominio/persiana');
const pedido=require('../dominio/pedido');
const etq=require('../dominio/etiqueta_producao');
const prod=require('../dominio/producao');
const revendas=require('../dominio/revenda');
const motivos=require('../dominio/motivo_producao');
const config=require('../nucleo/config');
const pessoas=require('../nucleo/pessoas');

const DIRETOR={id:1, nome:'Lucas', papel:'diretor',
  setores:['serralheria','colecao','montagem','revisao','embalagem']};
const RENATO={id:7, nome:'Renato', papel:'vendedor'};
const EMBAL={id:300, nome:'Bia', papel:'producao', setores:['embalagem']};
const REVIS={id:301, nome:'Ana', papel:'producao', setores:['revisao']};

let base=null;
function cena(){
  if(base) return base;
  pessoas.ligar(()=>[{id:7,nome:'Renato'}]);
  const l=tecido.criarLinha({nome:'Painel'});
  const tela=tecido.criarAbertura({nome:'Tela',linha_id:l.id});
  const cru=tecido.criarCor({nome:'Cru'});
  tecido.criarTecido({linha_id:l.id,abertura_id:tela.id,cor_id:cru.id});
  const C=k=>catalogo.listarComponentes().find(c=>c.chave===k);

  const pai=catalogo.criarModelo({nome:'Painel'},DIRETOR);
  catalogo.editarModelo(pai.id,{calculo:'folhas'},DIRETOR);
  catalogo.ligarColecao({modelo_id:pai.id,abertura_id:tela.id,preco_m2_centavos:18000},DIRETOR);
  catalogo.ligarCorAcessorio({modelo_id:pai.id,cor_id:cru.id});
  ['sentido','folhas','acionamento','lado_corrente','adicional'].forEach(x=>catalogo.ligarEscolha(pai.id,x,true));
  const trilho=catalogo.criarComponente({chave:'trilho',nome:'Trilho',setor:'serralheria'},DIRETOR);
  const kitT=catalogo.criarComponente({chave:'kit_trilho',nome:'Kit trilho',setor:'embalagem',
    gera_etiqueta:0,eh_kit:1,usa_faixa_suporte:1,codigo_barras:'KIT-TRILHO'},DIRETOR);
  const kitB=catalogo.criarComponente({chave:'kit_bando_concavo',nome:'Kit bandô côncavo',setor:'embalagem',
    gera_etiqueta:0,eh_kit:1,usa_faixa_suporte:1,codigo_barras:'KIT-BANDO-CONCAVO'},DIRETOR);
  catalogo.criarFichaLinha({modelo_id:pai.id,componente_id:C('tecido').id,quantidade_ref:'folhas',
    ref_largura:'folha',ajuste_largura_mm:0,ref_altura:'final',ajuste_altura_mm:50,
    consumo_ref_largura:'folha',consumo_ajuste_largura_mm:0,consumo_ref_altura:'final',consumo_ajuste_altura_mm:50});
  catalogo.criarFichaLinha({modelo_id:pai.id,componente_id:trilho.id,ref_largura:'final',ajuste_largura_mm:-20,
    consumo_ref_largura:'final',consumo_ajuste_largura_mm:-20});
  catalogo.criarFichaLinha({modelo_id:pai.id,componente_id:C('bando').id,quando:'bando',libera:'embalagem',
    ref_largura:'final',ajuste_largura_mm:-5,consumo_ref_largura:'final',consumo_ajuste_largura_mm:-5});
  ['montagem','revisao','embalagem'].forEach(k=>catalogo.criarFichaLinha({modelo_id:pai.id,componente_id:C(k).id}));

  config.gravar('pedidoNumeroInicial','7000','teste');
  const t=revendas.tabelas()[0];
  revendas.definirDescontoTabela(t.id,0,DIRETOR);
  const rev=revendas.criar({razao_social:'Lar do Cilar LTDA',nome_fantasia:'LAR DO CILAR',tabela_id:t.id},DIRETOR);
  revendas.definirVendedor(rev.id,7,DIRETOR);
  base={pai,tela,cru,rev,kitT,kitB};
  return base;
}

/* O Painel com os dois kits na ficha e as duas faixas — montado so pelo caso
   que precisa, porque o caso 1 confere justamente o Painel SEM kit. */
let montado=false;
function comKits(){
  const b=cena();
  if(montado) return b;
  catalogo.criarFichaLinha({modelo_id:b.pai.id,componente_id:b.kitT.id});
  catalogo.criarFichaLinha({modelo_id:b.pai.id,componente_id:b.kitB.id,quando:'bando'});
  // Trilho: ate 1,500 → 2; ate 3,000 → 3. Bandô: ate 1,000 → 2; ate 2,000 → 3; ate 3,000 → 4.
  [[1500,2],[3000,3]].forEach(([l,q])=>catalogo.criarFaixaSuporte(
    {modelo_id:b.pai.id,componente_id:b.kitT.id,largura_max_mm:l,quantidade:q}));
  [[1000,2],[2000,3],[3000,4]].forEach(([l,q])=>catalogo.criarFaixaSuporte(
    {modelo_id:b.pai.id,componente_id:b.kitB.id,largura_max_mm:l,quantidade:q}));
  catalogo.ativarModelo(b.pai.id,true,DIRETOR);
  montado=true;
  return b;
}

const escolha=(b,largura,adicional)=>({modelo_id:b.pai.id,abertura_id:b.tela.id,cor_tecido_id:b.cru.id,
  cor_acessorio_id:b.cru.id,largura_mm:largura,altura_mm:2000,sentido:'central',folhas:2,
  acionamento:'sem_comando',adicional:adicional||'nenhum'});
const kitsDe=r=>(r.kits||[]).map(k=>k.chave+':'+k.suportes).join(',');

function aprovar(item){
  const b=comKits();
  const p=pedido.criar({revenda_id:b.rev.id,tipo:'pedido'},DIRETOR);
  pedido.acrescentarItem(p.id,item,DIRETOR);
  pedido.enviar(p.id,DIRETOR,'2026-10-28 10:00');
  return pedido.aprovar(p.id,RENATO);
}
/* Tudo feito ate a embalagem, que fica INICIADA — so falta o kit e o fim. */
function ateAEmbalagem(p){
  const c=p.itens[0].componentes;
  c.filter(x=>x.gera_etiqueta&&x.setor!=='embalagem').forEach(x=>{
    prod.bipar(x.codigo_etiqueta,DIRETOR); prod.bipar(x.codigo_etiqueta,DIRETOR); });
  const emb=c.find(x=>x.chave==='embalagem').codigo_etiqueta;
  prod.bipar(emb,EMBAL);
  return emb;
}

module.exports=[

{nome:'§8.5 — produto SEM KIT na ficha nao ativa, e a recusa diz o porque',
 executar({igual,recusa}){
  const b=cena();
  const e=recusa(()=>catalogo.ativarModelo(b.pai.id,true,DIRETOR),'sem_kit');
  igual(/kit de instala/i.test(e.message),true,'a frase fala do kit de instalação');
  igual(catalogo.modelo(b.pai.id).ativo,0,'e o produto continua inativo');
}},

{nome:'§8.5 — a ficha mostra em ambar "sem kit" enquanto ele faltar',
 executar({igual}){
  const b=cena();
  if(!montado) igual(catalogo.modeloParaVer(b.pai.id,true).sem_kit,true,'sem kit na ficha: a marca vai para a tela');
  comKits();
  igual(catalogo.modeloParaVer(b.pai.id,true).sem_kit,false,'com kit, a marca some');
}},

{nome:'§8.5 — com o kit na ficha, ativa',
 executar({igual}){
  const b=comKits();
  igual(catalogo.modelo(b.pai.id).ativo,1,'ativo');
}},

{nome:'§8.5 — o kit desativado (componente inativo) nao conta como kit: ativar recusa',
 executar({recusa,db}){
  const k=catalogo.criarComponente({chave:'kit_teste_inativo',nome:'Kit velho',setor:'embalagem',
    gera_etiqueta:0,eh_kit:1,codigo_barras:'KIT-VELHO'},DIRETOR);
  const m=catalogo.criarModelo({nome:'Produto do kit velho'},DIRETOR);
  catalogo.criarFichaLinha({modelo_id:m.id,componente_id:k.id});
  db.prepare('UPDATE sm_componente SET ativo=0 WHERE id=?').run(k.id);
  recusa(()=>catalogo.ativarModelo(m.id,true,DIRETOR),'sem_kit');
}},

{nome:'§8.5 — DESATIVAR nao pede kit (tirar de venda nunca e travado)',
 executar({igual}){
  const m=catalogo.criarModelo({nome:'Produto sem kit para desativar'},DIRETOR);
  igual(catalogo.ativarModelo(m.id,false,DIRETOR).ativo,0,'desativar passa');
}},

{nome:'§8.5 — PROVA: a faixa serve a CADA kit — 1,400 com bandô: trilho 2, bandô 3',
 executar({igual}){
  const b=comKits();
  const r=persiana.calcular(escolha(b,1400,'bando'));
  igual(kitsDe(r),'kit_trilho:2,kit_bando_concavo:3','cada kit pela sua faixa');
}},

{nome:'§8.5 — PROVA: em outra largura os dois andam separados — 2,500 com bandô: trilho 3, bandô 4',
 executar({igual}){
  const b=comKits();
  const r=persiana.calcular(escolha(b,2500,'bando'));
  igual(kitsDe(r),'kit_trilho:3,kit_bando_concavo:4','trilho na faixa de 3,000; bandô na de 3,000');
}},

{nome:'§8.5 — na divisa a medida exata fica no degrau de baixo: 1,500 → trilho 2; 1,501 → 3',
 executar({igual}){
  const b=comKits();
  igual(kitsDe(persiana.calcular(escolha(b,1500))),'kit_trilho:2','1,500 cabe na faixa de 1,500');
  igual(kitsDe(persiana.calcular(escolha(b,1501))),'kit_trilho:3','1,501 sobe');
}},

{nome:'§8.5 — sem bandô, o kit do bandô nao entra',
 executar({igual}){
  const b=comKits();
  igual(kitsDe(persiana.calcular(escolha(b,1400))),'kit_trilho:2','so o do trilho');
}},

{nome:'§8.5 — a faixa repetida e recusada NO MESMO KIT; a mesma divisa em outro kit passa',
 executar({igual,recusa}){
  const b=comKits();
  recusa(()=>catalogo.criarFaixaSuporte({modelo_id:b.pai.id,componente_id:b.kitT.id,
    largura_max_mm:1500,quantidade:9}),'faixa_repetida');
  // 3,000 ja existe nos dois kits — e e isso que a migracao 38 permite.
  const doBando=catalogo.modelo(b.pai.id).faixas_suporte.filter(f=>f.componente_id===b.kitB.id);
  igual(doBando.map(f=>f.largura_max_mm).join(','),'1000,2000,3000','as tres do bandô');
}},

{nome:'§8.5 — a faixa so pode apontar para um KIT que conta suporte e esta na ficha',
 executar({recusa}){
  const b=comKits();
  const trilho=catalogo.listarComponentes().find(c=>c.chave==='trilho');
  recusa(()=>catalogo.criarFaixaSuporte({modelo_id:b.pai.id,componente_id:trilho.id,
    largura_max_mm:1200,quantidade:2}),'faixa_sem_kit');
}},

{nome:'§8.5 — o pedido aprovado grava os suportes de CADA kit, e a etiqueta da embalagem diz os dois',
 executar({igual}){
  const b=comKits();
  const p=aprovar(escolha(b,1400,'bando'));
  const c=p.itens[0].componentes;
  igual(c.filter(x=>x.eh_kit).map(x=>x.chave+':'+x.suportes).join(','),
    'kit_trilho:2,kit_bando_concavo:3','os dois kits, cada um com a sua quantidade');
  const emb=c.find(x=>x.chave==='embalagem');
  const e=etq.paraImprimir({codigos:[emb.codigo_etiqueta]})[0];
  igual(e.extra,'KIT TRILHO · 2 suportes · KIT BANDÔ CÔNCAVO · 3 suportes','a etiqueta da embalagem lista os dois');
}},

{nome:'§8.5 — PROVA: a embalagem cobra CADA kit — com um so, o fim e recusado dizendo qual falta',
 executar({igual,recusa}){
  const b=comKits();
  const p=aprovar(escolha(b,2500,'bando'));
  const emb=ateAEmbalagem(p);
  recusa(()=>prod.bipar(emb,EMBAL),'faltou_kit','sem kit nenhum');
  const r=prod.biparKit(emb,'KIT-TRILHO',EMBAL);
  igual(r.kit,'KIT TRILHO · 3 suportes','o do trilho conferido, com os 3 suportes');
  igual(r.faltam.join(','),'KIT BANDÔ CÔNCAVO · 4 suportes','e a bancada fica sabendo que falta o do bandô');
  const e=recusa(()=>prod.bipar(emb,EMBAL),'faltou_kit','com um so dos dois');
  igual(/BANDÔ CÔNCAVO · 4 suportes/.test(e.message),true,'e a frase diz o que falta: o do bandô, 4 suportes');
  igual(/KIT TRILHO/.test(e.message),false,'e nao repete o que ja entrou');
  prod.biparKit(emb,'KIT-BANDO-CONCAVO',EMBAL);
  igual(prod.bipar(emb,EMBAL).acao,'terminado','com os dois, fecha');
}},

{nome:'§8.5 — o kit de OUTRO produto e recusado, e a frase lista os kits desta persiana',
 executar({igual,recusa}){
  const b=comKits();
  const p=aprovar(escolha(b,1400,'bando'));
  const emb=ateAEmbalagem(p);
  const e=recusa(()=>prod.biparKit(emb,'KIT-TRADICIONAL',EMBAL),'kit_errado');
  igual(/KIT TRILHO · 2 suportes/.test(e.message)&&/KIT BANDÔ CÔNCAVO · 3 suportes/.test(e.message),true,
    'a recusa diz os dois kits certos');
}},

{nome:'§8.5 — bipar o mesmo kit duas vezes nao conta como os dois',
 executar({recusa}){
  const b=comKits();
  const p=aprovar(escolha(b,1400,'bando'));
  const emb=ateAEmbalagem(p);
  prod.biparKit(emb,'KIT-TRILHO',EMBAL);
  prod.biparKit(emb,'KIT-TRILHO',EMBAL);
  recusa(()=>prod.bipar(emb,EMBAL),'faltou_kit');
}},

{nome:'§8.5 — a embalagem RECUSADA volta sem os kits conferidos: na volta, bipa-se de novo',
 executar({igual,recusa}){
  const b=comKits();
  const p=aprovar(escolha(b,1400,'nenhum'));
  const c=p.itens[0].componentes;
  const emb=ateAEmbalagem(p);
  prod.biparKit(emb,'KIT-TRILHO',EMBAL);
  igual(prod.bipar(emb,EMBAL).acao,'terminado','fechou com o kit');
  const kit=pedido.porId(p.id).itens[0].componentes.find(x=>x.chave==='kit_trilho');
  igual(!!kit.kit_conferido_em,true,'o kit ficou conferido');
  const d=require('../dados/producao');
  d.reabrir([c.find(x=>x.chave==='embalagem').id]);
  const kit2=pedido.porId(p.id).itens[0].componentes.find(x=>x.chave==='kit_trilho');
  igual(kit2.kit_conferido_em,null,'reaberta a embalagem, o kit volta a ser cobrado');
  prod.bipar(emb,EMBAL);
  recusa(()=>prod.bipar(emb,EMBAL),'faltou_kit','e o fim pede o kit de novo');
}},

{nome:'§8.5 — DUPLICAR leva as faixas de cada kit',
 executar({igual}){
  const b=comKits();
  const copia=catalogo.duplicarModelo(b.pai.id,DIRETOR);
  const fx=catalogo.modelo(copia.id).faixas_suporte;
  igual(fx.filter(f=>f.componente_id===b.kitT.id).length+':'+fx.filter(f=>f.componente_id===b.kitB.id).length,
    '2:3','duas do trilho e tres do bandô');
}},

{nome:'§8.5 — O ROLO NAO MUDA: as faixas dele sao do produto (nenhuma aponta kit)',
 executar({igual}){
  const rolo=catalogo.modelo(catalogo.modeloPorNome('Rolô').id);
  igual(rolo.faixas_suporte.length,4,'as quatro faixas de sempre');
  igual(rolo.faixas_suporte.every(f=>f.componente_id==null),true,'nenhuma aponta kit');
  /* O numero dos suportes do Rolo (1,000 → 2; 1,001 → 3) e conferido no
     persiana.test.js, que passa sem mudar o esperado. */
}}

];
