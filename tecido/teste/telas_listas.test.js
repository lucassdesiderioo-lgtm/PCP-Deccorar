// TODA TELA DECLARADA TEM PORTA NA INICIAL E NOME NO RODAPE.
//
// Nasceu em 02/10/2026, de dois defeitos com a mesma causa: tres listas de
// telas (`nucleo/telas.js`, as portas da `inicio.html` e o `NOMES`/`ORDEM` do
// `nav.js`) e tela nova entrando so em parte delas.
//
//   - A tela inicial tinha as SETE portas do estoque de tecido. O vendedor,
//     cujas telas sao Simulador, Pedidos e Revendas, abria o modulo e lia
//     "Seu acesso ainda nao alcanca nenhuma tela" — com as telas dele no
//     rodape da mesma pagina.
//   - `/bancada` estava no ORDEM e nao no NOMES, e o botao do rodape saia
//     escrito "/bancada".
//
// Sem nada acusar, a proxima tela nova repete os dois: ela se escreve
// copiando a de cima, e a de cima nao lembra das outras listas.
const fs=require('fs'), path=require('path'), vm=require('vm');

const PUB=path.join(__dirname,'..','public');
const {TELAS}=require('../nucleo/telas');
const DECLARADAS=Object.keys(TELAS).filter(c=>c!=='/'&&c!=='/inicio');

function portas(){
  const s=fs.readFileSync(path.join(PUB,'telas','inicio.html'),'utf8');
  return [...s.slice(s.indexOf('const PORTAS=['),s.indexOf('];',s.indexOf('const PORTAS=[')))
    .matchAll(/caminho:'([^']+)'/g)].map(m=>m[1]);
}
function nav(){
  const s=fs.readFileSync(path.join(PUB,'nav.js'),'utf8');
  const pega=nome=>vm.runInNewContext('('+s.match(new RegExp('var '+nome+'=([\\s\\S]*?);\\n'))[1]+')');
  return {NOMES:pega('NOMES'), ORDEM:pega('ORDEM')};
}

module.exports=[

{nome:'a lista de telas declaradas e lida (a varredura nao pode ficar vazia)',
 executar(){
  if(DECLARADAS.length<10) throw new Error('so achou '+DECLARADAS.length+' telas em nucleo/telas.js');
}},

{nome:'TODA TELA DECLARADA TEM PORTA na tela inicial — sem isso o vendedor lia "nenhuma tela"',
 executar(){
  const p=portas(), falta=DECLARADAS.filter(c=>!p.includes(c));
  if(falta.length) throw new Error('sem porta na inicio.html: '+falta.join(', '));
}},

{nome:'nenhuma porta aponta para tela que nao existe',
 executar(){
  const sobra=portas().filter(c=>!TELAS[c]);
  if(sobra.length) throw new Error('porta sem tela: '+sobra.join(', '));
}},

{nome:'TODA TELA DECLARADA ESTA NO RODAPE, com nome — o "/bancada" saia escrito como caminho',
 executar(){
  const {NOMES,ORDEM}=nav();
  const foraOrdem=DECLARADAS.filter(c=>!ORDEM.includes(c));
  const semNome=ORDEM.filter(c=>!NOMES[c]);
  if(foraOrdem.length) throw new Error('fora do ORDEM do nav.js: '+foraOrdem.join(', '));
  if(semNome.length) throw new Error('no ORDEM e sem nome no NOMES: '+semNome.join(', '));
}},

];
