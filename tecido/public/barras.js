// CODE128-B em SVG, escrito aqui em vez de trazer biblioteca — a arquitetura
// do modulo nao admite dependencia de front, e um gerador de barras cabe em
// 60 linhas.
//
// A tabela foi conferida padrao a padrao contra uma implementacao de
// referencia, e o teste teste/barras.test.js repete a conferencia estrutural
// a cada rodada: 106 padroes de 11 modulos, barras somando par, stop de 13,
// nenhum repetido. Uma etiqueta que nao bipa e uma etiqueta que nao existe.
(function(){

const LARGURAS=("212222,222122,222221,121223,121322,131222,122213,122312,132212,221213,"+
"221312,231212,112232,122132,122231,113222,123122,123221,223211,221132,"+
"221231,213212,223112,312131,311222,321122,321221,312212,322112,322211,"+
"212123,212321,232121,111323,131123,131321,112313,132113,132311,211313,"+
"231113,231311,112133,112331,132131,113123,113321,133121,313121,211331,"+
"231131,213113,213311,213131,311123,311321,331121,312113,312311,332111,"+
"314111,221411,431111,111224,111422,121124,121421,141122,141221,112214,"+
"112412,122114,122411,142112,142211,241211,221114,413111,241112,134111,"+
"111242,121142,121241,114212,124112,124211,411212,421112,421211,212141,"+
"214121,412121,111143,111341,131141,114113,114311,411113,411311,113141,"+
"114131,311141,411131,211412,211214,211232,2331112").split(',');

const INICIO_B=104, PARADA=106;

// Texto -> lista de indices da tabela, ja com o digito verificador.
// Checksum do CODE128: (inicio + soma de posicao x valor) modulo 103.
function indices(texto){
  const valores=[];
  for(const ch of String(texto)){
    const c=ch.charCodeAt(0);
    if(c<32||c>126) throw new Error('CODE128-B nao codifica "'+ch+'"');
    valores.push(c-32);
  }
  let soma=INICIO_B;
  valores.forEach((v,i)=>{ soma+=v*(i+1); });
  return [INICIO_B].concat(valores,[soma%103],[PARADA]);
}

// Indices -> string de modulos: '1' barra, '0' espaco.
function modulos(texto){
  return indices(texto).map(i=>{
    const w=LARGURAS[i];
    let bits='';
    for(let k=0;k<w.length;k++) bits+=(k%2?'0':'1').repeat(+w[k]);
    return bits;
  }).join('');
}

// Desenha em SVG. 'modulo' e a largura de uma barra fina, em px.
function svg(texto,opcoes){
  const o=opcoes||{};
  const modulo=o.modulo||2, altura=o.altura||60;
  const bits=modulos(texto);
  // Silencio obrigatorio dos dois lados: sem ele o leitor nao acha o comeco.
  const silencio=10*modulo;
  const largura=bits.length*modulo+silencio*2;

  const ns='http://www.w3.org/2000/svg';
  const el=document.createElementNS(ns,'svg');
  el.setAttribute('viewBox','0 0 '+largura+' '+altura);
  el.setAttribute('width',largura);
  el.setAttribute('height',altura);
  el.setAttribute('shape-rendering','crispEdges');   // barra borrada nao bipa

  const fundo=document.createElementNS(ns,'rect');
  fundo.setAttribute('width',largura); fundo.setAttribute('height',altura);
  fundo.setAttribute('fill','#fff');
  el.appendChild(fundo);

  // Barras vizinhas viram um retangulo so — menos nos para a impressora.
  let i=0;
  while(i<bits.length){
    if(bits[i]==='1'){
      let j=i; while(j<bits.length&&bits[j]==='1') j++;
      const r=document.createElementNS(ns,'rect');
      r.setAttribute('x',silencio+i*modulo);
      r.setAttribute('y',0);
      r.setAttribute('width',(j-i)*modulo);
      r.setAttribute('height',altura);
      r.setAttribute('fill','#000');
      el.appendChild(r);
      i=j;
    } else i++;
  }
  return el;
}

window.barras={svg,modulos,indices,LARGURAS};
})();
