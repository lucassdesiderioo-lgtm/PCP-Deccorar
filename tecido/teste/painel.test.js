// PAINEL — FOLHAS, TRANSPASSE E TRILHO. Fase 4 da spec
// SOBMEDIDA-CADASTRO-DE-PRODUTO (secao 6).
//
// ⚠️ OS NUMEROS VIERAM DA SECAO 6.4, NAO DO CODIGO. As folhas sao sempre
// transpassadas, 10 cm por encontro (numero do produto, nasce 100 mm):
//   lateral   folha = (largura + (folhas − 1) × 10 cm) ÷ folhas
//   central   cada lado = largura ÷ 2, e a mesma conta com as folhas do lado;
//             no meio as metades so se encostam — nao ha transpasse no meio
// Lateral de 2 a 5 folhas; central sempre par, 2, 4 ou 6. Uma via por folha
// (na central, por folha de cada lado). O trilho e UMA PECA SO, tambem na
// central. Tudo em mm inteiro: 566,67 vira 567.
const tecido=require('../dominio/tecido');
const catalogo=require('../dominio/catalogo_sm');
const persiana=require('../dominio/persiana');

const DIRETOR={id:1, nome:'Lucas', papel:'diretor'};

/* O Painel DE TESTE. Ajustes que nao sao da fabrica (secao 10 — o dono
   preenche os dele): tecido com 50 mm a mais de altura, trilho com 20 mm a
   menos. A base conica e a da spec: largura da folha de tecido + 5 mm. */
let base=null;
function cena(){
  if(base) return base;
  const l=tecido.criarLinha({nome:'Painel'});
  const tela=tecido.criarAbertura({nome:'Tela solar',linha_id:l.id});
  const grafite=tecido.criarCor({nome:'Grafite'});
  tecido.criarTecido({linha_id:l.id,abertura_id:tela.id,cor_id:grafite.id});
  const m=catalogo.criarModelo({nome:'Painel'},DIRETOR);
  catalogo.editarModelo(m.id,{calculo:'folhas'},DIRETOR);
  catalogo.ligarColecao({modelo_id:m.id,abertura_id:tela.id,preco_m2_centavos:18000},DIRETOR);
  catalogo.ligarCorAcessorio({modelo_id:m.id,cor_id:grafite.id});
  ['sentido','folhas','acionamento','lado_corrente'].forEach(x=>catalogo.ligarEscolha(m.id,x,true));
  const tec=catalogo.listarComponentes().find(c=>c.chave==='tecido');
  const conica=catalogo.criarComponente({chave:'base_conica',nome:'Base cônica',setor:'serralheria'},DIRETOR);
  const trilho=catalogo.criarComponente({chave:'trilho',nome:'Trilho',setor:'serralheria'},DIRETOR);
  const corda=catalogo.criarComponente({chave:'corda_painel',nome:'Corda',setor:'montagem',gera_etiqueta:0},DIRETOR);
  catalogo.criarFichaLinha({modelo_id:m.id,componente_id:tec.id,quantidade_ref:'folhas',
    ref_largura:'folha',ajuste_largura_mm:0,ref_altura:'final',ajuste_altura_mm:50,
    consumo_ref_largura:'folha',consumo_ajuste_largura_mm:0,consumo_ref_altura:'final',consumo_ajuste_altura_mm:50});
  catalogo.criarFichaLinha({modelo_id:m.id,componente_id:conica.id,quantidade_ref:'folhas',
    ref_largura:'tecido',ajuste_largura_mm:5,consumo_ref_largura:'tecido',consumo_ajuste_largura_mm:5});
  catalogo.criarFichaLinha({modelo_id:m.id,componente_id:trilho.id,
    ref_largura:'final',ajuste_largura_mm:-20,consumo_ref_largura:'final',consumo_ajuste_largura_mm:-20});
  catalogo.criarFichaLinha({modelo_id:m.id,componente_id:corda.id,quando:'com_comando'});
  base={m,tela,grafite};
  return base;
}

function painel(largura_mm,folhas,sentido,extra){
  const b=cena();
  return persiana.calcular(Object.assign({modelo_id:b.m.id,abertura_id:b.tela.id,
    cor_acessorio_id:b.grafite.id,largura_mm,altura_mm:2000,folhas,sentido,
    acionamento:'com_comando',lado_corrente:'direito'},extra||{}),{aceitaInativo:true});
}
const peca=(r,k)=>r.componentes.find(c=>c.chave===k);

module.exports=[

{nome:'§6.4 — 1,500 · 2 folhas · lateral → 1 transpasse → folha 0,800 (dono, 27/10)',
 executar({igual}){
  const r=painel(1500,2,'esquerda');
  // (1500 + 1 × 100) ÷ 2 = 800
  igual(r.calculo.transpasses,1,'um encontro de folhas');
  igual(r.calculo.folha_mm,800,'folha 0,800');
  igual(r.calculo.folha,'0,800','escrita com tres casas');
  igual(r.calculo.vias,2,'uma via por folha');
  igual(r.calculo.lados,1,'lateral: um lado');
}},

{nome:'§6.4 — 2,400 · 4 folhas · lateral → 3 transpasses → folha 0,675',
 executar({igual}){
  const r=painel(2400,4,'direita');
  // (2400 + 3 × 100) ÷ 4 = 2700 ÷ 4 = 675
  igual(r.calculo.transpasses,3,'tres encontros');
  igual(r.calculo.folha_mm,675,'folha 0,675');
  igual(r.calculo.vias,4,'quatro vias');
}},

{nome:'§6.4 — 3,000 · 5 folhas · lateral → 4 transpasses → folha 0,680',
 executar({igual}){
  const r=painel(3000,5,'esquerda');
  // (3000 + 4 × 100) ÷ 5 = 3400 ÷ 5 = 680
  igual(r.calculo.transpasses,4,'quatro encontros');
  igual(r.calculo.folha_mm,680,'folha 0,680');
}},

{nome:'§6.4 — 3,000 · 6 folhas · central → lado 1,500 · 3 folhas · 2 transpasses → folha 0,567 · 3 vias de cada lado',
 executar({igual}){
  const r=painel(3000,6,'central');
  // lado = 3000 ÷ 2 = 1500; (1500 + 2 × 100) ÷ 3 = 1700 ÷ 3 = 566,67 → 567
  igual(r.calculo.lado_mm,1500,'cada lado 1,500');
  igual(r.calculo.folhas_por_lado,3,'tres folhas de cada lado');
  igual(r.calculo.transpasses,2,'dois encontros DE CADA LADO — no meio nao ha transpasse');
  igual(r.calculo.folha_mm,567,'566,67 arredondado ao milimetro');
  igual(r.calculo.vias,3,'tres vias de cada lado');
  igual(r.calculo.lados,2,'dois lados');
}},

{nome:'§6.4 — 2,000 · 4 folhas · central → lado 1,000 · 2 folhas → folha 0,550',
 executar({igual}){
  const r=painel(2000,4,'central');
  // lado 1000; (1000 + 1 × 100) ÷ 2 = 550
  igual(r.calculo.folha_mm,550,'folha 0,550');
  igual(r.calculo.vias,2,'duas vias de cada lado (4 folhas = 2 de cada lado)');
}},

{nome:'§6.4 — 1,500 · 2 folhas · central → lado 0,750 · 1 folha → folha 0,750 (sem transpasse)',
 executar({igual}){
  const r=painel(1500,2,'central');
  igual(r.calculo.lado_mm,750,'cada lado 0,750');
  igual(r.calculo.transpasses,0,'uma folha de cada lado: nao ha encontro');
  igual(r.calculo.folha_mm,750,'folha 0,750');
}},

{nome:'§6.4 — 2,000 · 3 folhas · central → RECUSADO: central pede numero par',
 executar({igual,recusa}){
  const e=recusa(()=>painel(2000,3,'central'),'folhas_central_par');
  igual(/abertura central pede número par de folhas/i.test(e.mensagem),true,'diz o porque: '+e.mensagem);
}},

{nome:'§6.4 — 3,000 · 6 folhas · lateral → RECUSADO: no maximo 5 para um lado',
 executar({igual,recusa}){
  const e=recusa(()=>painel(3000,6,'esquerda'),'folhas_acima_lateral');
  igual(/no máximo 5 folhas correndo para um lado/i.test(e.mensagem),true,'diz o porque: '+e.mensagem);
}},

{nome:'§6.4 — sem comando → a corda NAO entra na ficha · o lado da corrente nao e pedido',
 executar({igual,recusa}){
  const r=painel(1500,2,'esquerda',{acionamento:'sem_comando',lado_corrente:undefined});
  igual(r.componentes.some(c=>c.chave==='corda_painel'),false,'sem corda');
  igual(r.lado_corrente,null,'sem lado da corrente');
  const com=painel(1500,2,'esquerda');
  igual(com.componentes.some(c=>c.chave==='corda_painel'),true,'com comando a corda entra');
  recusa(()=>painel(1500,2,'esquerda',{acionamento:'sem_comando',lado_corrente:'direito'}),
    'escolha_nao_se_aplica','e o servidor recusa o lado mandado sem comando');
}},

{nome:'§6.2 — os limites que a spec nao escreveu como caso: 1 folha lateral e 8 central recusam',
 executar({recusa}){
  recusa(()=>painel(1500,1,'esquerda'),'folhas_abaixo');
  recusa(()=>painel(3000,8,'central'),'folhas_acima_central');
}},

{nome:'§6.3 — a ficha do Painel: tecido = folha × folhas, base conica = folha + 5, TRILHO UMA PECA SO na central',
 executar({igual}){
  const r=painel(3000,6,'central');
  const t=peca(r,'tecido');
  igual(t.largura_corte_mm,567,'o tecido de cada folha tem a largura da folha');
  igual(t.altura_corte_mm,2050,'altura final + 50 (o ajuste desta ficha de teste)');
  igual(t.quantidade,6,'seis folhas de tecido');
  igual(peca(r,'base_conica').largura_corte_mm,572,'base conica = 567 + 5');
  igual(peca(r,'base_conica').quantidade,6,'uma por folha');
  igual(peca(r,'trilho').quantidade,1,'o trilho e UMA peca, tambem na central');
  igual(peca(r,'trilho').largura_corte_mm,2980,'largura final − 20 (o ajuste desta ficha)');
}},

{nome:'§6.1 — o transpasse e NUMERO DO PRODUTO, e nao do codigo',
 executar({igual}){
  const b=cena();
  igual(catalogo.modelo(b.m.id).transpasse_mm,100,'nasce 100 mm');
  catalogo.editarModelo(b.m.id,{transpasse_mm:50},DIRETOR);
  try{
    // (1500 + 1 × 50) ÷ 2 = 775
    igual(painel(1500,2,'esquerda').calculo.folha_mm,775,'com 5 cm de transpasse');
  }finally{ catalogo.editarModelo(b.m.id,{transpasse_mm:100},DIRETOR); }
}},

{nome:'§6 — o calculo das folhas exige a abertura e as folhas LIGADAS no produto',
 executar({recusa}){
  const b=cena();
  catalogo.ligarEscolha(b.m.id,'folhas',false);
  try{ recusa(()=>painel(1500,undefined,'esquerda'),'escolha_necessaria'); }
  finally{ catalogo.ligarEscolha(b.m.id,'folhas',true); }
}}
,

{nome:'§6.3 — o BANDÔ CÔNCAVO do Painel e o adicional dele, pela linha quando=bando: opcional e por metro',
 executar({igual,recusa}){
  /* §4.1: o Adicional serve ao Rolo E ao Painel (bandô côncavo); §6.3: o
     bandô côncavo e opcional, vendido por metro linear, `quando = bando`. Ate
     aqui o calculo so reconhecia o componente `bando` do Rolo, e o Painel que
     pedia bandô era recusado com "este modelo nao tem bandô na ficha". */
  const b=cena();
  const concavo=catalogo.criarComponente({chave:'bando_concavo_t',nome:'Bandô côncavo',setor:'serralheria',
    unidade_cobranca:'metro',preco_centavos:6000},DIRETOR);
  const l=catalogo.criarFichaLinha({modelo_id:b.m.id,componente_id:concavo.id,quando:'bando',libera:'embalagem',
    ref_largura:'final',ajuste_largura_mm:-5,consumo_ref_largura:'final',consumo_ajuste_largura_mm:-5});
  catalogo.ligarEscolha(b.m.id,'adicional',true);
  try{
    const sem=painel(2000,4,'central');
    igual(!!peca(sem,'bando_concavo_t'),false,'sem pedir, o bandô não entra');
    igual(sem.opcoes.bando.disponivel,true,'e a opção está disponível');
    const com=painel(2000,4,'central',{adicional:'bando'});
    igual(peca(com,'bando_concavo_t').largura_corte_mm,1995,'pedindo, entra: 2000 − 5');
    // 2,000 m × R$ 60,00 = R$ 120,00
    igual(com.preco.linhas.find(x=>x.chave==='bando_concavo_t').valor_centavos,12000,'e cobra por metro linear');
    recusa(()=>painel(2000,4,'central',{adicional:'barra'}),'barra_indisponivel','barra o Painel não tem');
  }finally{
    catalogo.editarFichaLinha(l.id,{ativo:0});
    catalogo.ligarEscolha(b.m.id,'adicional',false);
  }
}}

];
