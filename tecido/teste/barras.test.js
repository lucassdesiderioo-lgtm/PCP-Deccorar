// O gerador de codigo de barras. Uma etiqueta que nao bipa e uma etiqueta que
// nao existe — e o erro so apareceria na bancada, com a folha ja impressa e
// colada. Por isso a tabela e conferida a cada rodada.
//
// public/barras.js e escrito para o navegador (usa window e document). Aqui
// ele e carregado num ambiente de mentira, so com o necessario, para poder
// ser testado sem browser.
const fs=require('fs'), path=require('path'), vm=require('vm');

function carregar(){
  const codigo=fs.readFileSync(path.join(__dirname,'..','public','barras.js'),'utf8');
  const janela={};
  vm.createContext({window:janela, document:{createElementNS:()=>({setAttribute(){},appendChild(){}})}});
  vm.runInContext(codigo,vm.createContext({window:janela,
    document:{createElementNS:()=>({setAttribute(){},appendChild(){}})}}));
  return janela.barras;
}
const barras=carregar();

module.exports=[

{nome:'a tabela CODE128 tem 107 padroes, todos diferentes', executar({igual}){
  igual(barras.LARGURAS.length,107,'quantidade de padroes');
  igual(new Set(barras.LARGURAS).size,107,'nenhum padrao repetido');
}},

{nome:'cada padrao tem 11 modulos e barras somando par', executar({igual}){
  // As duas propriedades estruturais do CODE128. Um digito trocado na tabela
  // quase sempre quebra uma das duas.
  const erros=[];
  barras.LARGURAS.forEach((w,i)=>{
    const n=w.split('').map(Number);
    const soma=n.reduce((a,b)=>a+b,0);
    const somaBarras=n.filter((_,j)=>j%2===0).reduce((a,b)=>a+b,0);
    if(i<106){
      if(soma!==11) erros.push(i+' soma '+soma);
      if(somaBarras%2) erros.push(i+' barras impares');
    } else if(soma!==13) erros.push('stop soma '+soma);
  });
  igual(erros.join(', '),'','padroes fora do padrao');
}},

{nome:'o digito verificador bate com a conta do padrao', executar({igual}){
  // 'S-000142' com inicio B (104): soma = 104 + posicao x valor, modulo 103.
  const texto='S-000142';
  const valores=texto.split('').map(c=>c.charCodeAt(0)-32);
  let soma=104; valores.forEach((v,i)=>{ soma+=v*(i+1); });
  const ind=barras.indices(texto);
  igual(ind[0],104,'comeca com START B');
  igual(ind[ind.length-1],106,'termina com STOP');
  igual(ind[ind.length-2],soma%103,'digito verificador');
  igual(ind.length,texto.length+3,'inicio + dados + verificador + parada');
}},

{nome:'o desenho tem o tamanho previsto e comeca e termina em barra', executar({igual}){
  const bits=barras.modulos('S-000142');
  // 8 caracteres + inicio + verificador = 10 simbolos de 11 modulos, mais os
  // 13 da parada.
  igual(bits.length,10*11+13,'total de modulos');
  igual(bits[0],'1','simbolo comeca com barra');
  igual(bits[bits.length-1],'1','a parada termina com barra');
}},

{nome:'caractere fora do CODE128-B da erro em vez de sair torto', executar({igual}){
  let deu=false;
  try{ barras.modulos('café'); }catch(e){ deu=true; }
  igual(deu,true,'acento tem que ser recusado');
  // O codigo da etiqueta ('S-000142') so tem letra, digito e hifen — todos
  // dentro do conjunto B. O erro existe para o dia em que alguem mudar o
  // formato do codigo sem lembrar disso.
}}

];
