// COMO O DINHEIRO CHEGA NA TELA — e a tabela que rola sozinha.
//
// Nasceu em 28/09/2026, de dois defeitos achados ABRINDO a tela do Financeiro:
// a ficha da revenda escrevia `R$ 4785,50` enquanto o Financeiro, na mesma
// revenda e no mesmo dinheiro, escrevia `R$ 4.785,50`; e a tabela de boletos
// nao cabia em 400 px, entao quem rolava de lado era a PAGINA inteira.
//
// Os dois sao de tela, e nenhum teste de unidade os pegava: o texto estava
// sintaticamente perfeito nos dois lados. O que da para travar por aqui e o
// que sobra depois de consertados — o dono unico do dinheiro, e as duas
// pontas da classe que faz a tabela rolar.
const fs=require('fs'), path=require('path'), vm=require('vm');

const PUB=path.join(__dirname,'..','public');
const ler=(...p)=>fs.readFileSync(path.join(PUB,...p),'utf8');
const tela=n=>ler('telas',n);

// O `ui.js` e escrito para o navegador. Carrego num ambiente de mentira, so
// com o necessario, como o `barras.test.js` ja faz.
function carregarUi(){
  const janela={};
  vm.runInContext(ler('ui.js'), vm.createContext({window:janela, document:{
    createElement:()=>({style:{},appendChild(){},setAttribute(){},classList:{add(){}}}),
    querySelector:()=>null, querySelectorAll:()=>[], addEventListener(){}
  }}));
  return janela.ui;
}
const ui=carregarUi();

/* ⚠️ A LISTA DE EXCECOES NAO E ABSOLVICAO — e o tamanho do que falta.
   Estas telas ainda montam `R$ ` a mao, e tres delas escrevem dinheiro SEM o
   ponto do milhar. Nenhuma foi tocada em 28/09/2026: o pedido era o
   Financeiro, e arrumar tela que ninguem pediu e alargar o trabalho por conta
   propria (§0). O que a varredura faz e impedir a NONA — sem ela a arrumacao
   dura ate a proxima tela, porque tela nova se escreve copiando a de cima. */
const AINDA_MONTAM_A_MAO={
  'catalogo.html' : 'emReais proprio, com toFixed — SEM separador de milhar',
  'pedidos.html'  : 'reais proprio e um toFixed na linha do boleto — SEM separador',
  'simulador.html': 'reais proprio, com toFixed — SEM separador de milhar',
  'painel.html'   : 'copia do `dinheiro` do ui.js (toLocaleString) — valor certo, codigo repetido',
  'rolos.html'    : 'le o `dinheiro` do ui, mas monta `R$ `+num() no preco por m²',
  'sobras.html'   : 'monta `R$ `+num() no preco por m²'
};
// `'R$ '+` — o prefixo montado a mao, que e por onde o formatador proprio
// entra. Quem chama o `dinheiro` do ui.js nao escreve o `R$` em lugar nenhum.
const MONTA_A_MAO=/R\$ ?['"]\s*\+/;
const TELAS=fs.readdirSync(path.join(PUB,'telas')).filter(f=>f.endsWith('.html')).sort();

module.exports=[

{nome:'o dinheiro do ui.js escreve o ponto do milhar', executar({igual}){
  // O defeito de 28/09 em uma linha: `toFixed(2)` da `4785,50`, e a revenda
  // le um numero que nao se parece com o da outra tela.
  igual(ui.dinheiro(4785.5),'R$ 4.785,50','milhar');
  igual(ui.dinheiro(1234567.89),'R$ 1.234.567,89','milhao');
  igual(ui.dinheiro(9.9),'R$ 9,90','sem milhar continua igual');
}},

{nome:'dinheiro sem valor e TRACO, nunca R$ 0,00', executar({igual}){
  // Regra 4 do custo: `R$ 0,00` se le como "nao vale nada", que e outra
  // afirmacao. E zero de verdade continua sendo zero.
  igual(ui.dinheiro(null),'—','nulo');
  igual(ui.dinheiro(undefined),'—','indefinido');
  igual(ui.dinheiro(0),'R$ 0,00','zero e zero');
}},

{nome:'a ficha da revenda le o dinheiro do ui, e nao um formatador proprio',
 executar({igual}){
  const t=tela('revendas.html');
  igual(MONTA_A_MAO.test(t),false,'revendas.html monta "R$ " a mao');
  igual(/window\.ui[\s\S]{0,80}dinheiro/.test(t),true,'pede o dinheiro do ui');
}},

{nome:'o campo do limite continua SEM separador de milhar', executar({igual,recusa}){
  /* ⚠️ E a metade que o conserto podia quebrar. O valor que pre-preenche o
     campo volta pelo `paraCentavos`, que so aceita `5000,00` — um `5.000,00`
     ali gravaria outro numero, no CREDITO. Por isso a tela tem duas funcoes
     com nome que diz qual e qual, e esta e a que nao pode mudar. */
  const t=tela('revendas.html');
  igual(/const paraCampo=/.test(t),true,'a funcao do campo existe com nome proprio');
  igual(/valor:paraCampo\(r\.valor_limite_credito_centavos\)/.test(t),true,
    'o campo do limite e pre-preenchido por ela');
  igual(/valor:reais\(/.test(t),false,'nenhum campo e pre-preenchido pelo formatador de leitura');
  // E a conta dela, rodada de verdade: 500000 centavos viram "5000,00".
  const m=/const paraCampo=(v=>[^;]+);/.exec(t);
  igual(!!m,true,'achei o corpo da funcao');
  igual(eval('('+m[1]+')')(500000),'5000,00','cinco mil sem ponto nenhum');
}},

{nome:'a tabela de boletos rola sozinha, e a classe existe no base.css',
 executar({igual}){
  /* ⚠️ SAO DUAS PONTAS, e a que some em silencio e a segunda: classe usada e
     nao declarada nao pinta nada, e a tela continua rolando de lado sem erro
     nenhum. E a licao da fileira de escolha da fase 4-A, onde o `aria-pressed`
     estava certo e sem CSS por tras. */
  igual(/class:'rolaH'/.test(tela('financeiro.html')),true,
    'a tabela de boletos vai dentro do recipiente');
  igual(/\.rolaH\s*\{[^}]*overflow-x:\s*auto/.test(ler('base.css')),true,
    'o base.css declara a classe, e ela rola no eixo x');
}},

{nome:'nenhuma tela NOVA monta "R$ " a mao', executar({igual}){
  const novas=TELAS.filter(f=>MONTA_A_MAO.test(tela(f))&&!(f in AINDA_MONTAM_A_MAO));
  igual(novas.join(', '),'',
    'tela montando dinheiro a mao fora da lista — chame o window.ui.dinheiro');
}},

{nome:'a lista de excecoes nao envelhece calada', executar({igual}){
  /* Excecao que sobrevive a razao que a criou vira mentira: a tela arrumada
     continuaria "dispensada", e a proxima copia dela passaria limpa. */
  const zumbis=Object.keys(AINDA_MONTAM_A_MAO)
    .filter(f=>TELAS.indexOf(f)<0||!MONTA_A_MAO.test(tela(f)));
  igual(zumbis.join(', '),'',
    'excecao que nao descreve mais a tela — tire o nome da lista');
}}

];
