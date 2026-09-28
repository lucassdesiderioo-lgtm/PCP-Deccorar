// A TABELA ROLA SOZINHA, E A PAGINA NAO.
//
// Nasceu em 28/09/2026 dentro do `dinheiro_tela.test.js`, com dois casos: a
// tabela de boletos do Financeiro e a lista de revendas. No dia seguinte a
// MEDICAO das dezesseis telas do modulo, a 400 px, disse que eram SETE as que
// rolavam de lado — e nao tres, como eu tinha relatado depois de abrir so as
// que estavam na frente. Os dois casos mudaram de casa e viraram varredura.
//
// ⚠️ O QUE ESTE ARQUIVO PODE E O QUE NAO PODE. Ele nao abre navegador: quem
// diz se a regra pegou e a tela MEDIDA (`scrollWidth` contra `clientWidth`,
// CLAUDE.md §12), e isso se faz na entrega, na mao. O que fica travado aqui e
// o que sobra depois de consertado: que TODA tabela passe pelo recipiente,
// que o recipiente nao nasca oco, e que a classe exista no base.css. Tela nova
// se escreve copiando a de cima, e sem a varredura a arrumacao dura ate ela.
const fs=require('fs'), path=require('path'), vm=require('vm');

const PUB=path.join(__dirname,'..','public');
const ler=(...p)=>fs.readFileSync(path.join(PUB,...p),'utf8');
const tela=n=>ler('telas',n);
const TELAS=fs.readdirSync(path.join(PUB,'telas')).filter(f=>f.endsWith('.html')).sort();

/* ⚠️ CONTA O CODIGO, NUNCA O COMENTARIO. A varredura irma do `unidade.js`
   chegou a acusar o proprio comentario que a explicava — regua que se acusa
   sozinha so fica verde se alguem apagar a explicacao. */
const semComentario=s=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/.*$/gm,'$1');
const quantos=(s,re)=>(s.match(re)||[]).length;

/* O `ui.js` e escrito para o navegador. Carrego num ambiente de mentira que
   GUARDA os filhos — sem isso o `appendChild` seria um no-op e o caso do
   recipiente oco passaria verde com o recipiente vazio, que e exatamente o
   defeito que esteve em producao (o `rola.appendChild` esquecido). */
function carregarUi(){
  const janela={};
  const criar=tag=>({tag, filhos:[], atributos:{}, style:{},
    appendChild(f){ this.filhos.push(f); return f; },
    setAttribute(k,v){ this.atributos[k]=v; },
    addEventListener(){}, classList:{add(){}}});
  vm.runInContext(ler('ui.js'), vm.createContext({window:janela, document:{
    createElement:criar, createTextNode:t=>({tag:'#texto',texto:t,filhos:[]}),
    querySelector:()=>null, querySelectorAll:()=>[], addEventListener(){}
  }}));
  return janela.ui;
}
const ui=carregarUi();

module.exports=[

{nome:'o rolaH devolve o recipiente COM a tabela dentro', executar({igual}){
  /* ⚠️ ESTE E O CASO QUE VALE MAIS, e ele existe por causa de um defeito que
     ESTEVE NO AR. O padrao anterior era de dois passos — criar o recipiente,
     e depois lembrar de pendurar a tabela nele —, e o caso que o cobria
     conferia so que a classe aparecia no arquivo. Passou verde com o
     recipiente criado e VAZIO. Quem achou foi a rodada de reintroduzir os
     defeitos: tirar a tabela de dentro nao reprovava nada.
     Uma funcao que recebe a tabela nao tem segundo passo para esquecer. */
  const t=ui.el('table',{},[]);
  const r=ui.rolaH(t);
  igual(r.tag,'div','embrulha num div');
  igual(r.atributos.class,'rolaH','com a classe do base.css');
  igual(r.filhos.length,1,'um filho, e nao nenhum');
  igual(r.filhos[0]===t,true,'e o filho e a TABELA que entrou');
}},

{nome:'a classe existe no base.css, e rola no eixo x', executar({igual}){
  /* ⚠️ SAO DUAS PONTAS, e a que some em silencio e a segunda: classe usada e
     nao declarada nao pinta nada, e a tela continua rolando de lado sem erro
     nenhum. E a licao da fileira de escolha da fase 4-A, onde o `aria-pressed`
     estava certo e sem CSS por tras. */
  igual(/\.rolaH\s*\{[^}]*overflow-x:\s*auto/.test(ler('base.css')),true,
    'o base.css declara a classe, e ela rola no eixo x');
}},

{nome:'toda tabela do modulo passa pelo recipiente', executar({igual}){
  /* A regra que nao envelhece: tela que cria N tabelas embrulha N vezes.
     Nao ha lista de isentos, de proposito — embrulhar tabela que HOJE cabe
     nao custa nada (sem transbordo o `auto` nao desenha barra), e deixar de
     fora as que cabem faz a proxima pessoa perguntar quais tem e quais nao
     tem. A que crescer amanha volta a empurrar a pagina. */
  const falhas=[];
  TELAS.forEach(f=>{
    const s=semComentario(tela(f));
    const tabelas=quantos(s,/el\('table'/g), embrulhos=quantos(s,/rolaH\(/g);
    if(tabelas!==embrulhos) falhas.push(`${f}: ${tabelas} tabela(s) e ${embrulhos} rolaH(`);
  });
  igual(falhas.join(' · '),'',
    'tabela sem recipiente — embrulhe com o rolaH do window.ui');
}},

{nome:'quem embrulha importa o rolaH do ui.js', executar({igual}){
  // Sem a linha do import a tela estoura no primeiro desenho com
  // "rolaH is not defined", e a tela abre em BRANCO — que nao se parece nem
  // de longe com "falta uma funcao" (a licao da §10, armadilha #29).
  const falhas=TELAS.filter(f=>{
    const s=semComentario(tela(f));
    return /rolaH\(/.test(s) && !/[{,]\s*rolaH\s*[},]/.test(s);
  });
  igual(falhas.join(', '),'','tela usa o rolaH e nao o pegou do window.ui');
}},

{nome:'nenhuma tela monta o recipiente a mao', executar({igual}){
  /* O padrao de dois passos volta por aqui: `el('div',{class:'rolaH'})` numa
     tela e alguem recriando, sem querer, o recipiente que pode nascer oco.
     Quem embrulha e o `ui.js`, e la ha um caso rodando a funcao de verdade. */
  const falhas=TELAS.filter(f=>/class:'rolaH'/.test(semComentario(tela(f))));
  igual(falhas.join(', '),'','recipiente montado na tela — chame o rolaH');
}},

{nome:'nenhuma tela declara a propria .rolaH', executar({igual}){
  /* Classe propria de tela e a segunda regua do CSS — a licao da fileira de
     escolha da fase 4-A, onde os cinco botoes saiam identicos porque a tela
     tinha a dela. O `.rolaH` mora no base.css, e num lugar so. */
  const falhas=TELAS.filter(f=>/\.rolaH\s*\{/.test(tela(f)));
  igual(falhas.join(', '),'','a classe e do base.css, nao da tela');
}}

];
