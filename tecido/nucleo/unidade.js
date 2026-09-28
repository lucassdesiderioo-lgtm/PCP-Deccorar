// AS DUAS UNIDADES DO SOB MEDIDA — e o unico lugar onde se entra e se sai delas.
//
//   por dentro   milimetro INTEIRO (970)          ·  centavo INTEIRO (16500)
//   por fora     metro com TRES casas (0,970)     ·  reais (165,00)
//
// ⚠️ POR QUE INTEIRO, e nao metro em REAL como o resto do modulo: o plano de
// corte trabalha em metros porque a bobina e medida assim, e la a tolerancia
// de 1 mm do `erros.js` resolve. Aqui a conta EMPILHA — tubo tira do final,
// tecido tira do tubo, base soma no tecido — e ruido de ponto flutuante
// compoe a cada degrau. O PCP ja conheceu isso em outra escala:
// `3,5 + 0,2 = 3,7000000000000006` (CLAUDE.md secao 7-B).
//
// ⚠️ TRES CASAS SEMPRE, INCLUSIVE O ZERO FINAL. `0,97` na etiqueta faz a
// serralheria parar para pensar se o numero esta completo; `0,970` nao.
const {ErroDeRegra}=require('./erros');

/* Medida que a pessoa digitou. Recusa em vez de arredondar: arredondar e
   apagar em silencio, que e o defeito que a armadilha #25 do CLAUDE.md
   fechou no cadastro de SKU. E a frase diz como se escreve certo — recusa
   sem caminho e o que ensina a equipe a contornar (armadilha #6). */
function mm(valor, oque){
  const o=oque||'a medida';
  if(valor===null||valor===undefined||String(valor).trim()==='')
    throw new ErroDeRegra('medida_invalida','Informe '+o+'.');
  const n=Number(String(valor).trim().replace(',','.'));
  if(!isFinite(n))
    throw new ErroDeRegra('medida_invalida',o+': "'+valor+'" nao e um numero.');
  if(!Number.isInteger(n))
    throw new ErroDeRegra('medida_nao_inteira',
      o+' tem que ser milimetro inteiro, e veio '+valor+'. 1,000 m se escreve 1000.');
  if(n<=0)
    throw new ErroDeRegra('medida_invalida',o+' tem que ser maior que zero.');
  return n;
}

/* O ajuste da ficha e outra coisa: ele e NEGATIVO quase sempre ("o tecido e
   5 mm menor que o tubo") e zero e resposta valida. So o inteiro e exigido. */
function ajuste(valor, oque){
  const o=oque||'o ajuste';
  if(valor===null||valor===undefined||String(valor).trim()==='') return null;
  const n=Number(String(valor).trim().replace(',','.'));
  if(!isFinite(n))
    throw new ErroDeRegra('medida_invalida',o+': "'+valor+'" nao e um numero.');
  if(!Number.isInteger(n))
    throw new ErroDeRegra('medida_nao_inteira',o+' tem que ser milimetro inteiro, e veio '+valor+'.');
  return n;
}

/* Dinheiro. Mesma regra, e pelo mesmo motivo: clampar um preco impossivel em
   zero seria apagar saldo em silencio — "zero e um custo valido e mentiroso"
   (regra 4 do COMPRAS.md, e o `custo.js` deste modulo). */
function centavos(valor, oque){
  const o=oque||'o preco';
  if(valor===null||valor===undefined||String(valor).trim()==='')
    throw new ErroDeRegra('preco_invalido','Informe '+o+' em centavos.');
  const n=Number(String(valor).trim().replace(',','.'));
  if(!isFinite(n)||!Number.isInteger(n)||n<0)
    throw new ErroDeRegra('preco_invalido',
      o+' tem que ser centavo inteiro e nao negativo, e veio "'+valor+'". R$ 110,00 se escreve 11000.');
  return n;
}

/* Area em mm². 1 m² = 1.000.000 mm² — inteiro exato, sem fracao nenhuma, que
   e o que permite a divisa "3,0 m² fica no degrau de baixo" existir de
   verdade em vez de depender de tolerancia. */
const areaMm2=(largura_mm,altura_mm)=>largura_mm*altura_mm;
const M2=1000000;

const emMetros=v=>v==null?null:(v/1000).toFixed(3).replace('.',',');
const emM2=v=>v==null?null:(v/M2).toFixed(3).replace('.',',');
/* ⚠️ O PONTO DO MILHAR E ESCRITO A MAO, e nao por `toLocaleString('pt-BR')`.
   Um Node compilado com ICU pequeno nao tem pt-BR: ele nao da erro, ele CAI
   em en-US — e o que sai e `4,785.50` na folha que a revenda confere, sem
   nada em lugar nenhum dizendo que aconteceu. No navegador o `dinheiro` do
   ui.js pode usar o Intl porque pt-BR vem sempre; aqui depende de como o
   servidor foi compilado, e isso e ambiente, nao regra.

   Quem confere os dois lados e o `teste/dinheiro_tela.test.js`, contra
   LITERAIS do portugues do Brasil — e nao um contra o outro, que seria os
   dois errando juntos (a licao do QR, CLAUDE.md §4). */
const milhar=s=>s.replace(/\d+/,d=>d.replace(/\B(?=(\d{3})+(?!\d))/g,'.'));
const emReais=v=>v==null?null:milhar((v/100).toFixed(2).replace('.',','));
/* Percentual guardado em CENTESIMOS de por cento: 500 vira '5,00'. Duas
   casas sempre, pelo mesmo motivo das tres da medida — '5,0' faz quem le
   parar para pensar se o numero esta completo.

   ⚠️ E ele NAO ganha o ponto do milhar do `emReais`: desconto nao passa de
   100%, entao o separador nunca apareceria — e ponto num percentual se le
   como casa decimal. */
const emPercentual=v=>v==null?null:(v/100).toFixed(2).replace('.',',');

module.exports={mm,ajuste,centavos,areaMm2,M2,emMetros,emM2,emReais,emPercentual};
