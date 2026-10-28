// A ETIQUETA POR UNIDADE, COM OS DADOS DO CADASTRO DE MATERIAL — fase 5 da
// spec SOBMEDIDA-CADASTRO-DE-PRODUTO (secao 8).
//
// ⚠️ ESCRITO ANTES DO CODIGO (risco vermelho). O que este arquivo prova:
//   1. Quatro varetas sao QUATRO etiquetas, 1/4 a 4/4, com quatro codigos — e
//      o consumo de vareta no Compras continua 4, nao 16 (secao 8.3).
//   2. A etiqueta do Rolo so ganha o 1/1 e a base (o persiana.test.js e o
//      etiqueta_producao.test.js passam com o esperado de antes).
//   3. Reimprimir mantem os codigos E a data de fabricacao.
//   4. Pedido sem cliente final imprime so a revenda.
//   5. As DUAS FONTES (dono, 28/10/2026): o cadastro de material da o nome, a
//      marca e o modelo; a ficha da a medida e a quantidade. Falta de
//      material, ou campo vazio nele, NUNCA trava — sai o nome do componente,
//      o campo vazio nao sai, e a ficha avisa em ambar.
const tecido=require('../dominio/tecido');
const catalogo=require('../dominio/catalogo_sm');
const persiana=require('../dominio/persiana');
const pedido=require('../dominio/pedido');
const etq=require('../dominio/etiqueta_producao');
const etqPdf=require('../dominio/etiqueta_producao_pdf');
const consumo=require('../dominio/consumo');
const revendas=require('../dominio/revenda');
const config=require('../nucleo/config');
const pessoas=require('../nucleo/pessoas');
const materiais=require('../nucleo/materiais');

const DIRETOR={id:1, nome:'Lucas', papel:'diretor'};
const RENATO={id:7, nome:'Renato', papel:'vendedor'};

/* O CADASTRO DE MATERIAL DO PCP, como atravessa a porta: id, nome, unidade,
   marca e modelo. O motor tem marca e modelo; a vareta nao tem nenhum dos
   dois — e o cadastro "ainda nao refinado" que o dono descreveu. */
const DO_PCP=[
  {id:1,  nome:'Tubo 32 mm', unidade:'m'},
  {id:50, nome:'Vareta alumínio 8 mm', unidade:'un', marca:'', modelo:''},
  {id:51, nome:'Motor tubular', unidade:'un', marca:'Somfy', modelo:'Sonesse 30'},
  {id:52, nome:'Motor sem cadastro', unidade:'un', marca:'', modelo:null}
];

let base=null;
function cena(){
  if(base) return base;
  pessoas.ligar(()=>[{id:7,nome:'Renato'}]);
  materiais.ligar(()=>DO_PCP);
  const l=tecido.criarLinha({nome:'Romana'});
  const linho=tecido.criarAbertura({nome:'Linho',linha_id:l.id});
  const cru=tecido.criarCor({nome:'Cru'});
  tecido.criarTecido({linha_id:l.id,abertura_id:linho.id,cor_id:cru.id});

  // A Romana: tecido, varetas por referencia, e um motor com marca na etiqueta.
  const m=catalogo.criarModelo({nome:'Romana'},DIRETOR);
  catalogo.editarModelo(m.id,{calculo:'gomos'},DIRETOR);
  catalogo.ligarColecao({modelo_id:m.id,abertura_id:linho.id,preco_m2_centavos:20000},DIRETOR);
  catalogo.ligarCorAcessorio({modelo_id:m.id,cor_id:cru.id});
  const tec=catalogo.listarComponentes().find(c=>c.chave==='tecido');
  const vareta=catalogo.criarComponente({chave:'vareta',nome:'Vareta',setor:'serralheria'},DIRETOR);
  const motor=catalogo.criarComponente({chave:'motor',nome:'Motor',setor:'montagem'},DIRETOR);
  const ponteira=catalogo.criarComponente({chave:'ponteira',nome:'Ponteira',setor:'serralheria'},DIRETOR);
  catalogo.criarFichaLinha({modelo_id:m.id,componente_id:tec.id,ref_largura:'final',ajuste_largura_mm:-10,
    ref_altura:'final',ajuste_altura_mm:150,consumo_ref_largura:'final',consumo_ajuste_largura_mm:-10,
    consumo_ref_altura:'final',consumo_ajuste_altura_mm:150});
  catalogo.criarFichaLinha({modelo_id:m.id,componente_id:vareta.id,quantidade_ref:'varetas',
    ref_largura:'final',ajuste_largura_mm:-15,consumo_ref_largura:'final',consumo_ajuste_largura_mm:-15});
  catalogo.criarFichaLinha({modelo_id:m.id,componente_id:motor.id,etiqueta_extras:'marca,modelo,fabricacao'});
  // A ponteira NAO tem material ligado: tem que imprimir com o nome dela.
  catalogo.criarFichaLinha({modelo_id:m.id,componente_id:ponteira.id,quantidade:2});
  catalogo.ligarMaterialDoComponente(vareta.id,50,DIRETOR);
  catalogo.ligarMaterialDoComponente(motor.id,51,DIRETOR);
  catalogo.ativarModelo(m.id,true,DIRETOR);

  // O Rolo, com o Tubo 32 apontado para o material do PCP (como em producao).
  const rolo=catalogo.modeloPorNome('Rolô');
  const screen=tecido.criarAbertura({nome:'Screen 1%',linha_id:tecido.criarLinha({nome:'Rolô'}).id});
  const branco=tecido.criarCor({nome:'Branco'});
  tecido.criarTecido({linha_id:screen.linha_id,abertura_id:screen.id,cor_id:branco.id});
  catalogo.ligarColecao({modelo_id:rolo.id,abertura_id:screen.id,preco_m2_centavos:11000},DIRETOR);
  catalogo.ligarCorAcessorio({modelo_id:rolo.id,cor_id:branco.id});
  const t32=catalogo.modelo(rolo.id).degraus.find(d=>d.nome==='Tubo 32');
  catalogo.ligarMaterialDoDegrau(t32.id,1,DIRETOR);

  config.gravar('pedidoNumeroInicial','5000','teste');
  const t=revendas.tabelas()[0];
  revendas.definirDescontoTabela(t.id,0,DIRETOR);
  const rev=revendas.criar({razao_social:'Lar do Cilar LTDA',nome_fantasia:'LAR DO CILAR',tabela_id:t.id},DIRETOR);
  revendas.definirVendedor(rev.id,7,DIRETOR);
  base={m,linho,cru,vareta,motor,ponteira,rolo,screen,branco,rev};
  return base;
}

function aprovar(itens,cab){
  const b=cena();
  const p=pedido.criar(Object.assign({revenda_id:b.rev.id,tipo:'pedido'},cab||{}),DIRETOR);
  itens.forEach(i=>pedido.acrescentarItem(p.id,i,DIRETOR));
  pedido.enviar(p.id,DIRETOR,'2026-10-28 10:00');
  return pedido.aprovar(p.id,RENATO);
}
const romana=extra=>{ const b=cena(); return Object.assign({modelo_id:b.m.id,abertura_id:b.linho.id,
  cor_tecido_id:b.cru.id,cor_acessorio_id:b.cru.id,largura_mm:1200,altura_mm:1500},extra||{}); };
const rolo=extra=>{ const b=cena(); return Object.assign({modelo_id:b.rolo.id,abertura_id:b.screen.id,
  cor_tecido_id:b.branco.id,cor_acessorio_id:b.branco.id,largura_mm:1000,altura_mm:1000,
  comando:'direito',rolamento:'frente'},extra||{}); };
const daChave=(p,k)=>p.itens.flatMap(i=>i.componentes).filter(c=>c.chave===k);

module.exports=[

{nome:'§8.1 — Romana com 4 varetas: QUATRO linhas, 1/4 a 4/4, quatro codigos diferentes',
 executar({igual}){
  const p=aprovar([romana()]);                       // 1,500 → 5 gomos → 4 varetas
  const v=daChave(p,'vareta');
  igual(v.length,4,'uma linha por unidade');
  igual(v.map(c=>c.unidade_k+'/'+c.unidade_n).join(' '),'1/4 2/4 3/4 4/4','marcadas k/n');
  igual(v.every(c=>c.quantidade===1),true,'cada uma e UMA vareta');
  igual(new Set(v.map(c=>c.codigo_etiqueta)).size,4,'quatro codigos, quatro bipes');
  igual(v.every(c=>/^SER-\d{6}$/.test(c.codigo_etiqueta)),true,'todos da serralheria');
}},

{nome:'§8.1 — a impressao sai com UMA etiqueta por unidade, marcada 1/4…4/4',
 executar({igual}){
  const p=aprovar([romana()]);
  const lista=etq.paraImprimir({pedidos:[p.id],setor:'serralheria'}).filter(e=>e.chave==='vareta');
  igual(lista.length,4,'quatro etiquetas de vareta');
  igual(lista.map(e=>e.unidade).join(','),'1/4,2/4,3/4,4/4','a unidade em cada uma');
}},

{nome:'§8.3 — PROVA: o consumo de vareta no Compras continua 4, NAO 16',
 executar({igual}){
  const antes=(consumo.materialDeCompra().materiais.find(m=>m.componente_id===50)||{quantidade:0}).quantidade;
  aprovar([romana()]);
  const depois=consumo.materialDeCompra().materiais.find(m=>m.componente_id===50);
  igual(depois.quantidade-antes,4,'quatro varetas a comprar — a etiqueta por unidade nao multiplica o consumo');
}},

{nome:'§8.2 — o nome do insumo e o do CADASTRO DE MATERIAL; a medida e a da FICHA',
 executar({igual}){
  const p=aprovar([romana()]);
  const e=etq.paraImprimir({pedidos:[p.id]}).find(x=>x.chave==='vareta');
  igual(e.tarefa,'VARETA ALUMÍNIO 8 MM · CORTAR 1,185','nome do material, medida de corte da ficha');
}},

{nome:'§8.2 — insumo SEM material ligado imprime com o nome do componente, sem travar',
 executar({igual}){
  const p=aprovar([romana()]);
  const pont=etq.paraImprimir({pedidos:[p.id]}).filter(x=>x.chave==='ponteira');
  igual(pont.length,2,'as duas ponteiras sairam — nada travou');
  igual(pont[0].tarefa,'PONTEIRA','com o nome do componente');
  igual(pont.map(x=>x.unidade).join(','),'1/2,2/2','e a unidade');
}},

{nome:'§8.2 — o MOTOR leva marca, modelo e a data de fabricacao = a PRIMEIRA impressao',
 executar({igual,db}){
  const p=aprovar([romana()]);
  const r1=etq.imprimir({pedidos:[p.id],setor:'montagem'},DIRETOR);
  const motor=r1.etiquetas.find(x=>x.chave==='motor');
  igual(motor.marca,'Somfy','a marca, do cadastro de material');
  igual(motor.modelo_material,'Sonesse 30','o modelo, do cadastro de material');
  const comp=db.prepare('SELECT * FROM sm_pedido_componente WHERE codigo_etiqueta=?').get(motor.codigo);
  igual(!!comp.fabricado_em,true,'a data de fabricacao nasceu na primeira impressao');
  // Reimprimir mais tarde: o codigo e a data sao DA PECA, nao do papel.
  db.prepare("UPDATE sm_pedido_componente SET fabricado_em='2026-10-01 09:00:00' WHERE id=?").run(comp.id);
  const r2=etq.imprimir({pedidos:[p.id],setor:'montagem'},DIRETOR);
  const de2=r2.etiquetas.find(x=>x.chave==='motor');
  igual(r2.reimpressao,true,'e reimpressao');
  igual(de2.codigo,motor.codigo,'o mesmo codigo');
  igual(de2.extras.join(' · '),'SOMFY · SONESSE 30 · FAB. 01/10/2026',
    'a data de fabricacao e a da primeira impressao, e nao a de hoje');
  igual(db.prepare('SELECT fabricado_em FROM sm_pedido_componente WHERE id=?').get(comp.id).fabricado_em,
    '2026-10-01 09:00:00','e ela nao foi regravada');
}},

{nome:'§8.2 — material SEM marca/modelo: o campo vazio nao sai, e nada trava',
 executar({igual}){
  const b=cena();
  catalogo.ligarMaterialDoComponente(b.motor.id,52,DIRETOR);
  try{
    const p=aprovar([romana()]);
    const m=etq.imprimir({pedidos:[p.id],setor:'montagem'},DIRETOR).etiquetas.find(x=>x.chave==='motor');
    igual(m.tarefa,'MOTOR SEM CADASTRO','o nome do material');
    igual(m.extras.length,1,'so a data — marca e modelo vazios nao saem: '+JSON.stringify(m.extras));
    igual(/^FAB\. \d\d\/\d\d\/\d{4}$/.test(m.extras[0]),true,'a data de fabricacao');
  }finally{ catalogo.ligarMaterialDoComponente(b.motor.id,51,DIRETOR); }
}},

{nome:'§8.2 — a FICHA mostra em ambar o que falta: "sem material ligado" e "material sem marca/modelo"',
 executar({igual}){
  const b=cena();
  catalogo.ligarMaterialDoComponente(b.motor.id,52,DIRETOR);
  try{
    const av=catalogo.avisosDeMaterial(b.m.id);
    const de=k=>(av.find(x=>x.chave===k)||{}).aviso||'';
    igual(de('ponteira'),'sem material ligado','a ponteira nao aponta material');
    igual(de('motor'),'material sem marca/modelo','o motor aponta um material incompleto');
    igual(de('vareta'),'','a vareta nao pede marca, entao nao ha o que avisar');
    igual(av.some(x=>x.chave==='tecido'),false,
      'o tecido e do estoque daqui, e nao vai ao Compras do PCP — nao e lista de trabalho');
  }finally{ catalogo.ligarMaterialDoComponente(b.motor.id,51,DIRETOR); }
}},

{nome:'§8.2 — o MOTOR sem marca/modelo AVISA no simulador (o dado da garantia), e nao trava',
 executar({igual}){
  const b=cena();
  catalogo.ligarMaterialDoComponente(b.motor.id,52,DIRETOR);
  try{
    const r=persiana.calcular({modelo_id:b.m.id,abertura_id:b.linho.id,cor_acessorio_id:b.cru.id,
      largura_mm:1200,altura_mm:1500});
    igual(r.avisos.some(a=>/Motor.*sem marca ou modelo/.test(a)),true,'o aviso: '+r.avisos.join(' | '));
    igual(r.componentes.some(c=>c.chave==='motor'),true,'e a persiana calculou');
  }finally{ catalogo.ligarMaterialDoComponente(b.motor.id,51,DIRETOR); }
}},

{nome:'§8.3 — a etiqueta do ROLO so ganha o 1/1 e a base; o tubo continua com o nome do DEGRAU',
 executar({igual}){
  const p=aprovar([rolo()]);
  const lista=etq.paraImprimir({pedidos:[p.id]});
  const tubo=lista.find(e=>e.chave==='tubo');
  igual(tubo.tarefa,'TUBO 32 · CORTAR 0,970','o tubo e o degrau, mesmo com material ligado');
  igual(tubo.unidade,'1/1','ganha o 1/1');
  igual(tubo.peca,'1 de 1','e a peca de sempre');
  igual(tubo.pedido_item,p.numero+'/01','o numero do pedido e do item');
  igual(tubo.produto,'Rolô','o produto');
  igual(tubo.comando,'COMANDO DIREITO','o comando de sempre');
  igual(lista.every(e=>e.unidade==='1/1'),true,'todas 1/1 — o Rolo tem quantidade 1 em tudo');
}},

{nome:'§8.2 — CLIENTE FINAL: preenchido sai ao lado da revenda; vazio sai so a revenda',
 executar({igual}){
  const sem=etq.paraImprimir({pedidos:[aprovar([rolo()]).id]})[0];
  igual(sem.revenda,'LAR DO CILAR','so a revenda');
  igual(sem.cliente_final,null,'sem cliente final');
  const com=etq.paraImprimir({pedidos:[aprovar([rolo()],{cliente_final:'  Maria Souza '}).id]})[0];
  igual(com.cliente_final,'Maria Souza','o cliente final, aparado');
}},

{nome:'§8.1 — "gera etiqueta" e da FICHA de cada produto: desligado na linha, a peca sai sem etiqueta',
 executar({igual}){
  const b=cena();
  const l=catalogo.fichaDe(b.m.id).find(x=>x.chave==='ponteira');
  catalogo.editarFichaLinha(l.id,{gera_etiqueta:0});
  try{
    const p=aprovar([romana()]);
    const pont=daChave(p,'ponteira');
    igual(pont.length,1,'sem etiqueta, uma linha so');
    igual(pont[0].quantidade,2,'com a quantidade 2');
    igual(pont[0].codigo_etiqueta,null,'e sem codigo');
    igual(catalogo.fichaDe(b.rolo.id).find(x=>x.chave==='tubo').gera_etiqueta,1,
      'o Rolo nao mudou: o componente continua gerando');
  }finally{ catalogo.editarFichaLinha(l.id,{gera_etiqueta:null}); }
}},

{nome:'§8.1 — o PDF sai com uma pagina por UNIDADE',
 async executar({igual}){
  const p=aprovar([romana()]);
  const lista=etq.paraImprimir({pedidos:[p.id],setor:'serralheria'});
  const pdf=await etqPdf.gerar(lista);
  const {PDFDocument}=require('pdf-lib');
  igual((await PDFDocument.load(pdf)).getPageCount(),lista.length,'uma pagina por etiqueta');
  igual(lista.filter(e=>e.chave==='vareta').length,4,'quatro delas sao as varetas');
}}

];
