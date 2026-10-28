// ROMANA — GOMOS E VARETAS. Fase 3 da spec SOBMEDIDA-CADASTRO-DE-PRODUTO
// (secao 5).
//
// ⚠️ OS NUMEROS VIERAM DA SECAO 5.3, NAO DO CODIGO. As regras sao do dono, e
// sao regra, nao preferencia: gomos IMPARES, o MENOR que deixa cada gomo ate
// 35 cm, no MINIMO 3, gomo pela divisao EXATA com uma casa, varetas = gomos − 1.
// A medida exata dos 35 cm cabe (fica no degrau de baixo), como na escada.
const tecido=require('../dominio/tecido');
const catalogo=require('../dominio/catalogo_sm');
const persiana=require('../dominio/persiana');
const pedido=require('../dominio/pedido');
const revendas=require('../dominio/revenda');
const config=require('../nucleo/config');
const pessoas=require('../nucleo/pessoas');

const DIRETOR={id:1, nome:'Lucas', papel:'diretor'};
const RENATO={id:7, nome:'Renato', papel:'vendedor'};

/* A Romana DE TESTE: tecido com X = 10 mm a menos de largura e Y = 150 mm a
   mais de altura; vareta com Z = 15 mm a menos. Os numeros nao sao da
   fabrica — a fabrica preenche os dela na tela (secao 10). O que o teste
   prova e a conta, com X, Y e Z escritos aqui do lado. */
let base=null;
function cena(){
  if(base) return base;
  pessoas.ligar(()=>[{id:7,nome:'Renato'}]);
  const l=tecido.criarLinha({nome:'Romana'});
  const linho=tecido.criarAbertura({nome:'Linho',linha_id:l.id});
  const cru=tecido.criarCor({nome:'Cru'});
  tecido.criarTecido({linha_id:l.id,abertura_id:linho.id,cor_id:cru.id});
  const m=catalogo.criarModelo({nome:'Romana'},DIRETOR);
  catalogo.editarModelo(m.id,{calculo:'gomos'},DIRETOR);
  catalogo.ligarColecao({modelo_id:m.id,abertura_id:linho.id,preco_m2_centavos:20000},DIRETOR);
  catalogo.ligarCorAcessorio({modelo_id:m.id,cor_id:cru.id});
  catalogo.ligarEscolha(m.id,'comando',true);
  const tec=catalogo.listarComponentes().find(c=>c.chave==='tecido');
  const vareta=catalogo.criarComponente({chave:'vareta',nome:'Vareta',setor:'serralheria'},DIRETOR);
  catalogo.criarFichaLinha({modelo_id:m.id,componente_id:tec.id,
    ref_largura:'final',ajuste_largura_mm:-10,ref_altura:'final',ajuste_altura_mm:150,
    consumo_ref_largura:'final',consumo_ajuste_largura_mm:-10,consumo_ref_altura:'final',consumo_ajuste_altura_mm:150});
  catalogo.criarFichaLinha({modelo_id:m.id,componente_id:vareta.id,quantidade_ref:'varetas',
    ref_largura:'final',ajuste_largura_mm:-15,consumo_ref_largura:'final',consumo_ajuste_largura_mm:-15});
  base={m,linho,cru,vareta};
  return base;
}

function romana(altura_mm,largura_mm){
  const b=cena();
  return persiana.calcular({modelo_id:b.m.id,abertura_id:b.linho.id,cor_acessorio_id:b.cru.id,
    largura_mm:largura_mm||1000,altura_mm,comando:'direito'},{aceitaInativo:true});
}
const peca=(r,k)=>r.componentes.find(c=>c.chave===k);

/* A tabela da secao 5.3, linha por linha: altura → gomos, gomo, varetas. */
const CASOS=[
  [300,  3, '100,0', 2, 'mínimo de 3 — nunca 1'],
  [1000, 3, '333,3', 2, 'divisão exata, uma casa'],
  [1050, 3, '350,0', 2, '35 cm exatos: cabe'],
  [1051, 5, '210,2', 4, '3 dariam 350,3'],
  [1500, 5, '300,0', 4, ''],
  [1800, 7, '257,1', 6, '5 dariam 360']
];

module.exports=[

...CASOS.map(([alt,gomos,gomo,varetas,porque])=>({
  nome:'§5.3 — altura '+(alt/1000).toFixed(3).replace('.',',')+' → '+gomos+' gomos de '+gomo+
    ' mm → '+varetas+' varetas'+(porque?' ('+porque+')':''),
  executar({igual}){
    const r=romana(alt);
    igual(r.calculo.tipo,'gomos','a peca pronta e a dos gomos');
    igual(r.calculo.gomos,gomos,'gomos');
    igual(r.calculo.gomo,gomo,'o gomo, com uma casa');
    igual(r.calculo.varetas,varetas,'varetas = gomos − 1');
    igual(peca(r,'vareta').quantidade,varetas,'e a QUANTIDADE da linha da vareta e a referencia');
  }})),

{nome:'§5.1 — o tecido: largura final − X, altura final + Y (X = 10, Y = 150 nesta Romana de teste)',
 executar({igual}){
  const r=romana(1500,1200);
  igual(peca(r,'tecido').largura_corte_mm,1190,'1,200 − 0,010 = 1,190');
  igual(peca(r,'tecido').altura_corte_mm,1650,'1,500 + 0,150 = 1,650');
  igual(peca(r,'vareta').largura_corte_mm,1185,'a vareta: 1,200 − 0,015 = 1,185');
}},

{nome:'§5.1 — o gomo NAO e medida de corte de nenhuma peca: sai no calculo, e nao na ficha',
 executar({igual}){
  const r=romana(1000);
  igual(r.calculo.gomo_decimo_mm,3333,'guardado em decimo de milimetro inteiro (333,3)');
  igual(r.componentes.every(c=>c.largura_corte_mm==null||Number.isInteger(c.largura_corte_mm)),true,
    'as medidas de corte continuam em mm inteiro');
}},

{nome:'§5.1 — o limite de 35 cm e NUMERO DO PRODUTO, e nao do codigo',
 executar({igual}){
  const b=cena();
  igual(catalogo.modelo(b.m.id).gomo_max_mm,350,'nasce 350 mm');
  catalogo.editarModelo(b.m.id,{gomo_max_mm:300},DIRETOR);
  try{
    // 1,000 ÷ 3 = 333,3 passa de 300 → 4 seria par → 5.
    igual(romana(1000).calculo.gomos,5,'com 30 cm, 1,000 vira 5 gomos');
    igual(romana(900).calculo.gomos,3,'e 0,900 ÷ 3 = 300 exatos ainda cabe');
  }finally{ catalogo.editarModelo(b.m.id,{gomo_max_mm:350},DIRETOR); }
}},

{nome:'§5 — a Romana nao tem escada: degrau nulo, e a ficha que pede "degrau" e recusada',
 executar({igual,recusa}){
  const r=romana(1000);
  igual(r.degrau,null,'sem tubo');
  const b=cena();
  const base2=catalogo.listarComponentes().find(c=>c.chave==='base');
  catalogo.criarFichaLinha({modelo_id:b.m.id,componente_id:base2.id,ref_largura:'degrau',ajuste_largura_mm:0});
  try{
    recusa(()=>romana(1000),'referencia_sem_escada','"degrau" num produto sem escada de tubos');
  }finally{
    const l=catalogo.fichaDe(b.m.id).find(x=>x.chave==='base');
    catalogo.editarFichaLinha(l.id,{ativo:0});
  }
}},

{nome:'§5.2 — a quantidade por referencia so aceita o que a peca pronta devolve',
 executar({recusa}){
  const b=cena();
  recusa(()=>catalogo.criarFichaLinha({modelo_id:b.m.id,componente:'montagem',quantidade_ref:'parafusos'}),
    'quantidade_ref_invalida');
  /* A referencia existe, mas a peca pronta DESTE produto nao a calcula: o
     calculo recusa dizendo qual — e nao um zero calado, que faria a peca
     sair da ficha sem ninguem ver. */
  const l=catalogo.criarFichaLinha({modelo_id:b.m.id,componente:'montagem',quantidade_ref:'folhas'});
  try{ recusa(()=>romana(1000),'quantidade_sem_calculo'); }
  finally{ catalogo.editarFichaLinha(l.id,{ativo:0}); }
}},

{nome:'§5 — o PEDIDO congela os gomos: a etiqueta e a bancada leem o que foi aprovado',
 executar({igual}){
  const b=cena();
  catalogo.ativarModelo(b.m.id,true,DIRETOR);
  config.gravar('pedidoNumeroInicial','5000','teste');
  const t=revendas.tabelas()[0];
  revendas.definirDescontoTabela(t.id,0,DIRETOR);
  const rev=revendas.criar({razao_social:'Rev R LTDA',nome_fantasia:'REV R',tabela_id:t.id},DIRETOR);
  revendas.definirVendedor(rev.id,7,DIRETOR);
  const p=pedido.criar({revenda_id:rev.id,tipo:'pedido'},DIRETOR);
  pedido.acrescentarItem(p.id,{modelo_id:b.m.id,abertura_id:b.linho.id,cor_tecido_id:b.cru.id,
    cor_acessorio_id:b.cru.id,largura_mm:1200,altura_mm:1500,comando:'esquerdo'},DIRETOR);
  pedido.enviar(p.id,DIRETOR,'2026-10-28 10:00');
  const ap=pedido.aprovar(p.id,RENATO);
  const it=ap.itens[0];
  igual(it.gomos,5,'5 gomos congelados no item');
  igual(it.gomo_decimo_mm,3000,'de 300,0 mm');
  const varetas=it.componentes.filter(c=>c.chave==='vareta');
  igual(varetas.reduce((s,c)=>s+c.quantidade,0),4,'e quatro varetas na ficha congelada');
  igual(it.degrau_nome,null,'sem degrau');
  igual(/5 gomos/.test(it.resumo),true,'a frase diz os gomos: '+it.resumo);
}}

];
