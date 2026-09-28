// COMO O DINHEIRO CHEGA NA TELA.
//
// ⚠️ A TABELA QUE ROLA SOZINHA MUDOU DE CASA em 29/09/2026: os dois casos
// dela viraram varredura no `rola_tela.test.js`, quando a medicao disse que
// eram SETE as telas que rolavam de lado, e nao duas.
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
//
// ⚠️ E ELE COBRE OS DOIS LADOS, desde 28/09/2026. O `pedidos.html` e o
// `simulador.html` quase nao formatam dinheiro: eles recebem a string PRONTA
// do servidor (`nucleo/unidade.js → emReais`), que escreve tambem o PDF que a
// revenda confere. Testar so a tela deixaria o numero certo numa linha e
// errado na de baixo.
const fs=require('fs'), path=require('path'), vm=require('vm');
const u=require('../nucleo/unidade');
const {PDFDocument, StandardFonts}=require('pdf-lib');

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

/* ⚠️ O TEXTO DO PDF NAO ESTA LEGIVEL NO ARQUIVO, e procurar no cru devolve
   "nao achei" com cara de defeito — custou tres rodadas. O `pdf-lib` comprime
   os fluxos E escreve o texto em HEXADECIMAL (`<50656469646F> Tj`), entao sao
   duas camadas: inflar e depois decodificar. */
function textoDoPdf(buf){
  const zlib=require('zlib');
  let bruto='', i=0;
  while((i=buf.indexOf('stream',i))>=0){
    let a=i+6; if(buf[a]===13) a++; if(buf[a]===10) a++;
    const b=buf.indexOf('endstream',a); if(b<0) break;
    try{ bruto+=zlib.inflateSync(buf.slice(a,b)).toString('latin1'); }catch(e){}
    i=b+9;
  }
  return [...bruto.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)]
    .map(m=>Buffer.from(m[1],'hex').toString('latin1')).join('\n');
}

/* ⚠️ A LISTA DE EXCECOES NAO E ABSOLVICAO — e o tamanho do que falta.
   Nasceu com seis telas em 28/09/2026 e ficou com duas no mesmo dia, quando
   as outras quatro foram consertadas. As duas que sobram montam `R$ ` a mao
   num lugar so: o PRECO POR M² do rolo e da sobra, num title e num botao.
   Ali o numero e pequeno (R$ 18,00/m²) e o separador praticamente nunca
   aparece — o defeito existe e nao morde.

   O que a varredura faz e impedir a TERCEIRA: sem ela a arrumacao dura ate a
   proxima tela, porque tela nova se escreve copiando a de cima. */
const AINDA_MONTAM_A_MAO={
  /* ⚠️ O `pedidos.html` NAO FORMATA DINHEIRO, e por isso ele fica na lista
     sem ser defeito: o valor ja chega escrito do servidor (`unidade.js`, que
     e quem congela o preco e escreve a folha da revenda), e a tela so pendura
     o `R$` na frente. Tirar isso dali exigiria o servidor mandar o simbolo
     junto — e ai o PDF, que faz `'R$ '+u.emReais(...)`, escreveria dois.
     O que vale para esta tela e o caso de baixo: ela nao pode ter conta de
     dinheiro PROPRIA. */
  'pedidos.html'  : 'recebe a string ja formatada do servidor e so pendura o `R$` — nao formata nada',
  'rolos.html'    : 'le o `dinheiro` do ui, mas monta `R$ `+num() no PRECO POR M² de um title',
  'sobras.html'   : 'monta `R$ `+num() no PRECO POR M², num title e num botao'
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

{nome:'nenhuma tela NOVA monta "R$ " a mao', executar({igual}){
  const novas=TELAS.filter(f=>MONTA_A_MAO.test(tela(f))&&!(f in AINDA_MONTAM_A_MAO));
  igual(novas.join(', '),'',
    'tela montando dinheiro a mao fora da lista — chame o window.ui.dinheiro');
}},

/* ── O LADO DO SERVIDOR ────────────────────────────────────────────────────
   `nucleo/unidade.js` e o dono unico de centavo→reais do servidor, e o que
   ele escreve chega a tres lugares: a tela, a auditoria e o PDF da revenda.
   Os valores esperados aqui sao LITERAIS do portugues do Brasil, e nao o que
   a outra funcao devolve — a licao do QR (CLAUDE.md §4): teste que rele com a
   mesma convencao com que escreveu nao testa nada, ele pergunta a si mesmo. */

{nome:'o emReais do servidor escreve o ponto do milhar', executar({igual}){
  igual(u.emReais(478550),'4.785,50','milhar');
  igual(u.emReais(123456789),'1.234.567,89','milhao');
  igual(u.emReais(99000),'990,00','tres digitos nao ganham ponto');
  igual(u.emReais(100000),'1.000,00','a virada do milhar');
  igual(u.emReais(990),'9,90','sem milhar continua igual');
  igual(u.emReais(0),'0,00','zero e zero');
  igual(u.emReais(null),null,'nulo continua NULO, e nao traco');
}},

{nome:'o servidor e o navegador escrevem o mesmo dinheiro', executar({igual}){
  /* ⚠️ A MESMA REVENDA NAO PODE LER DOIS NUMEROS. A ficha vem do `dinheiro`
     do navegador e o total do pedido vem do `emReais` do servidor — e os dois
     aparecem na mesma sessao, as vezes na mesma tela. E a armadilha #12 com
     uma regua de cada lado do fio. */
  for(const c of [478550,123456789,99000,100000,990,0])
    igual('R$ '+u.emReais(c), ui.dinheiro(c/100), c+' centavos');
}},

{nome:'o servidor NAO depende do ICU para escrever dinheiro', executar({igual}){
  /* ⚠️ `toLocaleString('pt-BR')` num Node compilado com ICU pequeno nao da
     erro: ele CAI em en-US, e a folha da revenda sai com `R$ 4,785.50`. No
     navegador isso nao existe (pt-BR vem sempre); aqui depende de como o Node
     do servidor foi compilado, e o sintoma so aparece no papel ja impresso.
     Por isso o ponto do milhar e escrito a mao neste lado do fio. */
  /* ⚠️ E A VARREDURA LE O CODIGO, NUNCA O COMENTARIO. A primeira versao
     deste caso reprovou no conserto: o comentario que explica por que o ICU
     nao entra CITA o `toLocaleString`, e a busca por texto achou a propria
     explicacao. Regua que se acusa sozinha e regua que ninguem consegue
     deixar verde sem apagar a explicacao. */
  const semComentario=fs.readFileSync(path.join(__dirname,'..','nucleo','unidade.js'),'utf8')
    .replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
  igual(/toLocaleString|Intl\./.test(semComentario),false,
    'unidade.js voltou a depender do ICU');
}},

{nome:'o numero grande cabe na folha da revenda', executar: async ({igual})=>{
  /* ⚠️ O PONTO DO MILHAR CUSTA UM CARACTERE, e na folha o dinheiro e
     alinhado a DIREITA: ele cresce para a esquerda, na direcao do rotulo que
     esta na mesma linha. Medido com a fonte de verdade, e nao no olho. */
  const doc=await PDFDocument.create();
  const forte=await doc.embedFont(StandardFonts.HelveticaBold);
  const normal=await doc.embedFont(StandardFonts.Helvetica);
  const MM=72/25.4, LARGURA=210*MM, MARGEM=15*MM;
  const cabe=(rotulo,valor,tam,fonte)=>
    MARGEM+fonte.widthOfTextAtSize(rotulo,tam)
      < LARGURA-MARGEM-fonte.widthOfTextAtSize(valor,tam);
  igual(cabe('TOTAL A PAGAR','R$ 1.234.567,89',13,forte),true,'o total a pagar');
  igual(cabe('Total Deccorar','R$ 1.234.567,89',10,normal),true,'o total Deccorar');
  igual(cabe('   Subtotal Deccorar','R$ 1.234.567,89',9,normal),true,'o subtotal da peca');
  igual(cabe('   Tecido Blackout Bege   3,000 m² × R$ 1.234,56/m²',
             'R$ 1.234.567,89',8,normal),true,'a linha de preco com a conta do lado');
}},

{nome:'a folha da revenda sai com o numero grande inteiro',
 executar: async ({igual})=>{
  /* ⚠️ O GERADOR DE VERDADE, e nao so a medida acima. O `emReais` escreve
     tambem o PDF que a revenda confere semanas depois, com o papel na mao —
     e ali nao ha como "atualizar a tela". */
  const pdf=require('../dominio/pedido_pdf');
  const r=await pdf.gerar({congelado:1, tipo:'pedido', numero:5001, id:1,
    marco:'enviado', enviado_em:'2026-09-28', entrega:'entrega', observacao:null,
    revenda:{nome_fantasia:'Revenda Grande', vendedor_nome:'Ana'}, prazo:null,
    itens:[{n:1, degrau_nome:'Tubo 41', resumo:'1,800 x 2,400 m', cancelado_em:null,
      linhas:[{nome:'Tecido', base:'3,000 m² × R$ 1.234,56/m²', valor_centavos:123456789}],
      valor_subtotal:'1.234.567,89', valor_final:'1.111.111,00'}],
    preco:{valor_total:'1.234.567,89', valor_piso:'1.234.567,89',
           valor_revenda:'1.111.111,00', tabela:null, desconto:null,
           mudou_depois_do_envio:false}});
  const t=textoDoPdf(r.arquivo);
  igual(t.indexOf('R$ 1.234.567,89')>=0,true,'o total Deccorar, com os dois pontos');
  igual(t.indexOf('R$ 1.111.111,00')>=0,true,'o total a pagar');
  igual(t.indexOf('× R$ 1.234,56/m²')>=0,true,'e o preco unitario dentro da conta da linha');
  igual(/null|undefined|NaN/.test(t),false,'nenhum buraco escrito por extenso na folha');
}},

/* ── AS TELAS QUE FORMATAVAM SOZINHAS ─────────────────────────────────── */

{nome:'o catalogo separa o que LE do que PRE-PREENCHE', executar({igual}){
  /* ⚠️ E a armadilha da ficha da revenda outra vez, e a unica outra tela que
     a tinha: o `emReais` do catalogo escrevia o preco que se le E o valor que
     entra nos campos `R$ por m²` e `R$ por unidade`, que voltam pelo
     `paraCentavos`. Um `1.234,56` naquele campo vira NaN, e a tela recusa o
     numero que ela mesma acabou de escrever. */
  const t=tela('catalogo.html');
  igual(/const paraCampo=/.test(t),true,'a funcao do campo existe com nome proprio');
  igual(/valor:paraCampo\(col\.preco_m2_centavos\)/.test(t),true,
    'o preco da colecao e pre-preenchido por ela');
  igual(/valor:paraCampo\(comp\.preco_centavos\)/.test(t),true,
    'o preco do componente tambem');
  igual(/valor:reais\(/.test(t),false,'nenhum campo e pre-preenchido pelo formatador de leitura');
  const m=/const paraCampo=(v=>[^;]+);/.exec(t);
  igual(!!m,true,'achei o corpo da funcao');
  igual(eval('('+m[1]+')')(123456),'1234,56','o campo continua sem ponto nenhum');
}},

{nome:'catalogo, simulador e painel leem o dinheiro do ui', executar({igual}){
  /* O `painel.html` tinha uma COPIA literal do `dinheiro` — mesmo valor, e
     mesmo assim segunda regua: no dia em que uma mudasse, a outra ficaria. */
  for(const f of ['catalogo.html','simulador.html','painel.html']){
    igual(MONTA_A_MAO.test(tela(f)),false,f+' monta "R$ " a mao');
    igual(/window\.ui|\bdinheiro\b/.test(tela(f)),true,f+' nao pede o dinheiro do ui');
  }
  igual(/const dinheiro=v=>v==null\?'—':'R\$ '\+Number/.test(tela('painel.html')),false,
    'o painel voltou a ter a copia do dinheiro');
}},

{nome:'o pedidos nao tem conta de dinheiro propria', executar({igual}){
  /* ⚠️ ELE E O CASO EM QUE A VARREDURA ACUSARIA O INOCENTE. A tela recebe o
     valor ja escrito pelo servidor e so pendura o `R$` — o que ela nao pode
     ter e uma conta PROPRIA de centavo→reais, que foi o que a linha do boleto
     tinha (um `toFixed` solto) e escrevia sem o ponto do milhar ao lado de
     totais que ja o traziam. */
  /* ⚠️ E A REGUA NOMEIA O CENTAVO, em vez de procurar `/100).toFixed`: a
     primeira versao deste caso acusou o formatador de AREA
     (`(Math.round(v*100)/100).toFixed(2)`), que nao tem nada com dinheiro.
     Regua larga acusa o inocente hoje e ensina a ignorar a lista amanha.
     Dividir por 100 continua certo — e assim que se entrega reais ao
     `dinheiro`; o que nao pode e o `toFixed` DEPOIS da divisao. */
  const t=tela('pedidos.html');
  igual(/centavos\s*\/\s*100\s*\)\s*\.toFixed/.test(t),false,
    'voltou a converter centavo em reais dentro da tela');
  igual(/dinheiro\(/.test(t),true,'a linha do boleto passou a usar o dinheiro do ui');
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
