// O QUE SO APARECEU ABRINDO A TELA na conferencia da spec
// SOBMEDIDA-CADASTRO-DE-PRODUTO (28/10/2026) — e fica travado aqui, porque
// nenhum caso de dominio pega defeito de tela.
//
//   1. A frase da recusa estava em `e.message` e o Catalogo e o simulador liam
//      `e.mensagem`: "ainda é o nome da cópia" e "a central pede número par"
//      chegavam como "Não deu para salvar." / "Não foi possível calcular.".
//   2. O simulador redesenha os campos a cada tecla, e o foco caia no PRIMEIRO
//      numero: "1,051" virava "1". A Romana aparecia com 3 gomos na tela e 5
//      no servidor.
//   3. O editor da ficha tinha dois campos com o MESMO rotulo ("Corte: ajuste
//      (mm)" para largura e altura): quem le e o leitor de tela nao sabiam
//      qual era qual.
//   4. O simulador nao mostrava a QUANTIDADE: "Vareta 1,185" em vez de
//      "4 × Vareta 1,185".
const fs=require('fs'), path=require('path');
const tela=n=>fs.readFileSync(path.join(__dirname,'..','public','telas',n+'.html'),'utf8');

module.exports=[

{nome:'1 — o Catalogo e o simulador mostram a FRASE do servidor (e.message), e nao o texto generico',
 executar({igual}){
  const cat=tela('catalogo'), sim=tela('simulador');
  igual(/erro=e\.message\|\|/.test(cat),true,'o tentar() do Catalogo le e.message');
  igual(/erroNovo=e\.message\|\|/.test(cat),true,'e o + Novo produto tambem');
  igual(/\[e\.message\|\|e\.mensagem\|\|'Não foi possível calcular\.'\]/.test(sim),true,
    'a recusa do simulador le e.message');
}},

{nome:'2 — o redesenho do simulador devolve o FOCO e o cursor a quem esta digitando',
 executar({igual}){
  const sim=tela('simulador');
  igual(/const ativo=document\.activeElement;/.test(sim),true,'guarda quem tinha o foco');
  igual(/novo\.focus\(\)/.test(sim),true,'devolve o foco ao campo novo');
  igual(/setSelectionRange/.test(sim),true,'e o cursor');
}},

{nome:'3 — nenhum editor da ficha repete o mesmo rotulo em dois campos',
 executar({igual}){
  const cat=tela('catalogo');
  /* Cada editor e uma chamada editor([...]); dentro dela, rotulo repetido e
     defeito. Conta por bloco de campos, separado por `editor([`. */
  const blocos=cat.split('editor([').slice(1).map(b=>b.slice(0,b.indexOf('],')));
  for(const b of blocos){
    // So os CAMPOS ({chave:…,rotulo:…}); o rotulo das opcoes ("sim", "não") se repete por desenho.
    const rot=[...b.matchAll(/\{chave:'[^']+',rotulo:'([^']+)'/g)].map(x=>x[1]);
    const rep=rot.filter((r,i)=>rot.indexOf(r)!==i);
    igual(rep.join(','),'','rotulo repetido no mesmo editor');
  }
}},

{nome:'4 — o simulador escreve a quantidade quando passa de uma (4 × Vareta)',
 executar({igual}){
  igual(/\(c\.quantidade>1\?c\.quantidade\+' × ':''\)\+c\.nome/.test(tela('simulador')),true,'a quantidade antes do nome');
}}

];
