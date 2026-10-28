// AS ESCOLHAS DO CLIENTE VIRAM PECA PRONTA — fase 2 da spec
// SOBMEDIDA-CADASTRO-DE-PRODUTO (secao 4).
//
// ⚠️ ESCRITO ANTES DO CODIGO (risco vermelho). Tres coisas para provar:
//   1. O ROLO NAO MUDA: a migracao liga nele exatamente as quatro escolhas
//      que o codigo dele ja exigia, e a persiana dele sai igual (os casos do
//      persiana.test.js continuam com o esperado de antes).
//   2. ESCOLHA DESLIGADA NAO APARECE E E RECUSADA PELA ROTA — a tela esconder
//      nao e a regra (armadilha #26 do CLAUDE.md).
//   3. O LADO DA CORRENTE SOME COM "SEM COMANDO", e a corda nao entra na ficha.
const tecido=require('../dominio/tecido');
const catalogo=require('../dominio/catalogo_sm');
const persiana=require('../dominio/persiana');
const pedido=require('../dominio/pedido');
const revendas=require('../dominio/revenda');
const config=require('../nucleo/config');
const pessoas=require('../nucleo/pessoas');

const DIRETOR={id:1, nome:'Lucas', papel:'diretor'};
const RENATO={id:7, nome:'Renato', papel:'vendedor'};

let base=null;
function cena(){
  if(base) return base;
  pessoas.ligar(()=>[{id:7,nome:'Renato'}]);
  const l=tecido.criarLinha({nome:'Rolô'});
  const screen=tecido.criarAbertura({nome:'Screen 1%',linha_id:l.id});
  const branco=tecido.criarCor({nome:'Branco'});
  tecido.criarTecido({linha_id:l.id,abertura_id:screen.id,cor_id:branco.id});
  const rolo=catalogo.modeloPorNome('Rolô');
  catalogo.ligarColecao({modelo_id:rolo.id,abertura_id:screen.id,preco_m2_centavos:11000},DIRETOR);
  catalogo.ligarCorAcessorio({modelo_id:rolo.id,cor_id:branco.id});
  const corda=catalogo.criarComponente({chave:'corda',nome:'Corda',setor:'montagem',gera_etiqueta:0},DIRETOR);
  base={rolo,screen,branco,corda};
  return base;
}

/* Um produto de teste que nasce do Rolo — a escada e a ficha dele continuam
   la, e e so nas escolhas que se mexe. */
function copia(nome){
  const b=cena();
  return catalogo.duplicarModelo(b.rolo.id,{nome},DIRETOR);
}

function calc(modelo_id,extra){
  const b=cena();
  return persiana.calcular(Object.assign({modelo_id,abertura_id:b.screen.id,
    cor_acessorio_id:b.branco.id,largura_mm:1000,altura_mm:1000},extra||{}),{aceitaInativo:true});
}

const ligadas=m=>catalogo.modelo(m).escolhas.filter(x=>x.ligada).map(x=>x.chave).sort().join(',');

module.exports=[

{nome:'§4.1 — a migracao liga no Rolo EXATAMENTE as quatro escolhas que o codigo dele ja exigia',
 executar({igual}){
  const b=cena();
  igual(ligadas(b.rolo.id),'adicional,comando,reducao,rolamento','as quatro, e nenhuma a mais');
}},

{nome:'§4.1 — o catalogo de escolhas e do SISTEMA: o modelo traz a lista inteira, com o que esta ligado',
 executar({igual}){
  const b=cena();
  const lista=catalogo.modelo(b.rolo.id).escolhas;
  igual(lista.map(x=>x.chave).join(','),
    'comando,rolamento,adicional,reducao,acionamento,sentido,lado_corrente,folhas','as oito, na ordem da spec');
  const ld=lista.find(x=>x.chave==='lado_corrente');
  igual(ld.depende.acionamento,'com_comando','o lado da corrente depende do "com comando"');
  igual(lista.find(x=>x.chave==='sentido').nome,'Abertura','na tela ela se chama Abertura');
}},

{nome:'§11 fase 2 — o Rolo da o mesmo resultado de sempre (resumo, comando, rolamento, adicional)',
 executar({igual}){
  const b=cena();
  const r=calc(b.rolo.id,{comando:'direito',rolamento:'frente',adicional:'bando'});
  igual(r.resumo,'1,000 × 1,000 · Screen 1% · Acessórios Branco · Comando direito · Rolamento pela frente · Bandô',
    'a frase de conferencia do Rolo, letra por letra');
  igual(r.comando,'direito','o comando');
  igual(r.adicional,'bando','o adicional');
}},

{nome:'§4.1 — escolha LIGADA e obrigatoria; escolha DESLIGADA e recusada se vier mesmo assim',
 executar({igual,recusa}){
  const m=copia('Sem rolamento');
  catalogo.ligarEscolha(m.id,'rolamento',false);
  recusa(()=>calc(m.id,{comando:'direito',rolamento:'frente'}),'escolha_desligada',
    'rolamento mandado num produto que nao o liga');
  const r=calc(m.id,{comando:'direito'});
  igual(/Rolamento/.test(r.resumo),false,'e ele some da frase');
  recusa(()=>calc(m.id,{}),'comando_obrigatorio','o comando continua ligado, entao continua obrigatorio');
}},

{nome:'§4.1 — o adicional e a reducao desligados: "nenhum" e "nao" passam, o resto recusa',
 executar({igual,recusa}){
  const m=copia('Sem adicional');
  catalogo.ligarEscolha(m.id,'adicional',false);
  catalogo.ligarEscolha(m.id,'reducao',false);
  const r=calc(m.id,{comando:'direito',rolamento:'frente',adicional:'nenhum',reducao:'nao'});
  igual(r.adicional,'nenhum','nenhum passa — e o que o pedido grava por padrao');
  igual(r.reducao.aplicada,false,'e nao ha reducao');
  recusa(()=>calc(m.id,{comando:'direito',rolamento:'frente',adicional:'bando'}),'escolha_desligada');
  recusa(()=>calc(m.id,{comando:'direito',rolamento:'frente',reducao:'pedida'}),'escolha_desligada');
  /* A reducao AUTOMATICA e parte da escolha: desligada, ela nao entra nem na
     medida em que a regra de garantia a poria. */
  const grande=calc(m.id,{comando:'direito',rolamento:'frente',largura_mm:2400,altura_mm:2000});
  igual(grande.reducao.automatica,false,'sem a escolha, a regra de garantia nao entra');
}},

{nome:'§4.1 — LADO DA CORRENTE so liga com o acionamento ligado, e so existe COM COMANDO',
 executar({igual,recusa}){
  const m=copia('Painel de escolhas');
  ['comando','rolamento','adicional','reducao'].forEach(x=>catalogo.ligarEscolha(m.id,x,false));
  recusa(()=>catalogo.ligarEscolha(m.id,'lado_corrente',true),'depende_de',
    'sem o acionamento, o lado da corrente nao tem quando aparecer');
  catalogo.ligarEscolha(m.id,'acionamento',true);
  catalogo.ligarEscolha(m.id,'lado_corrente',true);
  recusa(()=>catalogo.ligarEscolha(m.id,'acionamento',false),'tem_dependente',
    'desligar o acionamento com o lado da corrente ligado deixaria a escolha orfa');

  recusa(()=>calc(m.id,{}),'acionamento_obrigatorio','escolha ligada e obrigatoria');
  recusa(()=>calc(m.id,{acionamento:'com_comando'}),'lado_corrente_obrigatorio',
    'com comando, o lado da corrente e pedido');
  const com=calc(m.id,{acionamento:'com_comando',lado_corrente:'esquerdo'});
  igual(com.lado_corrente,'esquerdo','gravado');
  igual(/Com comando · Corrente à esquerda/.test(com.resumo),true,'e na frase: '+com.resumo);

  recusa(()=>calc(m.id,{acionamento:'sem_comando',lado_corrente:'esquerdo'}),'escolha_nao_se_aplica',
    'sem comando nao ha corrente — e o servidor recusa mesmo que a tela mande');
  const sem=calc(m.id,{acionamento:'sem_comando'});
  igual(sem.lado_corrente,null,'sem comando, sem lado');
  recusa(()=>calc(m.id,{acionamento:'pela janela'}),'acionamento_invalido');
}},

{nome:'§4.2 — os QUANDO novos: a corda (com_comando) entra com comando e NAO entra sem comando',
 executar({igual}){
  const b=cena();
  const m=copia('Painel da corda');
  ['comando','rolamento','adicional','reducao'].forEach(x=>catalogo.ligarEscolha(m.id,x,false));
  catalogo.ligarEscolha(m.id,'acionamento',true);
  catalogo.criarFichaLinha({modelo_id:m.id,componente_id:b.corda.id,quando:'com_comando'});
  const com=calc(m.id,{acionamento:'com_comando'});
  const sem=calc(m.id,{acionamento:'sem_comando'});
  igual(com.componentes.some(c=>c.chave==='corda'),true,'com comando, a corda entra');
  igual(sem.componentes.some(c=>c.chave==='corda'),false,
    'sem comando, a corda NAO entra — nao baixa estoque nem custa (secao 4.2)');
}},

{nome:'§4.2 — abertura_lateral e abertura_central seguem a abertura escolhida',
 executar({igual}){
  const b=cena();
  const m=copia('Painel da abertura');
  ['comando','rolamento','adicional','reducao'].forEach(x=>catalogo.ligarEscolha(m.id,x,false));
  catalogo.ligarEscolha(m.id,'sentido',true);
  const lat=catalogo.criarComponente({chave:'ponteira_lat',nome:'Ponteira lateral',setor:'serralheria'},DIRETOR);
  const cen=catalogo.criarComponente({chave:'ponteira_cen',nome:'Ponteira central',setor:'serralheria'},DIRETOR);
  catalogo.criarFichaLinha({modelo_id:m.id,componente_id:lat.id,quando:'abertura_lateral'});
  catalogo.criarFichaLinha({modelo_id:m.id,componente_id:cen.id,quando:'abertura_central'});
  const chaves=s=>calc(m.id,{sentido:s}).componentes.map(c=>c.chave);
  igual(chaves('esquerda').includes('ponteira_lat'),true,'esquerda e lateral');
  igual(chaves('direita').includes('ponteira_cen'),false,'direita nao e central');
  igual(chaves('central').includes('ponteira_cen'),true,'central e central');
  igual(chaves('central').includes('ponteira_lat'),false,'e nao e lateral');
  void b;
}},

{nome:'§4.2 — o cadastro da ficha aceita os quando novos e recusa o que nao existe',
 executar({igual,recusa}){
  igual(catalogo.QUANDOS.join(','),
    'sempre,bando,barra,sem_adicional,reducao,com_comando,sem_comando,abertura_lateral,abertura_central','a lista');
  const b=cena();
  const m=copia('Ficha dos quando');
  recusa(()=>catalogo.criarFichaLinha({modelo_id:m.id,componente_id:b.corda.id,quando:'chovendo'}),
    'quando_invalido');
}},

{nome:'§3.1 — duplicar copia as escolhas LIGADAS do produto de origem',
 executar({igual}){
  const m=copia('Origem das escolhas');
  catalogo.ligarEscolha(m.id,'rolamento',false);
  catalogo.ligarEscolha(m.id,'acionamento',true);
  const c=catalogo.duplicarModelo(m.id,{nome:'Copia das escolhas'},DIRETOR);
  igual(ligadas(c.id),ligadas(m.id),'as mesmas ligadas');
}},

{nome:'§4.1 — o PEDIDO grava as escolhas novas, e o produto sem comando grava comando vazio',
 executar({igual}){
  const b=cena();
  const m=copia('Painel do pedido');
  ['comando','rolamento','adicional','reducao'].forEach(x=>catalogo.ligarEscolha(m.id,x,false));
  catalogo.ligarEscolha(m.id,'acionamento',true);
  catalogo.ligarEscolha(m.id,'lado_corrente',true);
  catalogo.editarModelo(m.id,{nome:'Painel pedido'},DIRETOR);
  catalogo.ativarModelo(m.id,true,DIRETOR);
  config.gravar('pedidoNumeroInicial','5000','teste');
  const t=revendas.tabelas()[0];
  revendas.definirDescontoTabela(t.id,0,DIRETOR);
  const rev=revendas.criar({razao_social:'Rev E LTDA',nome_fantasia:'REV E',tabela_id:t.id},DIRETOR);
  revendas.definirVendedor(rev.id,7,DIRETOR);
  const p=pedido.criar({revenda_id:rev.id,tipo:'pedido'},DIRETOR);
  pedido.acrescentarItem(p.id,{modelo_id:m.id,abertura_id:b.screen.id,cor_tecido_id:b.branco.id,
    cor_acessorio_id:b.branco.id,largura_mm:1000,altura_mm:1000,
    acionamento:'com_comando',lado_corrente:'direito'},DIRETOR);
  pedido.enviar(p.id,DIRETOR,'2026-10-28 10:00');
  const ap=pedido.aprovar(p.id,RENATO);
  const it=ap.itens[0];
  igual(it.acionamento,'com_comando','o acionamento ficou no pedido');
  igual(it.lado_corrente,'direito','e o lado da corrente');
  igual(it.comando,'','o comando do Rolo nao se aplica, e fica vazio');
  igual(ap.marco,'aprovado','o ciclo inteiro passou');
}}

];
