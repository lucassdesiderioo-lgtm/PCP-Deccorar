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
const fs=require('fs'), path=require('path');

const PUB=path.join(__dirname,'..','public');
const {TELAS}=require('../nucleo/telas');
const DECLARADAS=Object.keys(TELAS).filter(c=>c!=='/'&&c!=='/inicio');

function portas(){
  const s=fs.readFileSync(path.join(PUB,'telas','inicio.html'),'utf8');
  return [...s.slice(s.indexOf('const PORTAS=['),s.indexOf('];',s.indexOf('const PORTAS=[')))
    .matchAll(/caminho:'([^']+)'/g)].map(m=>m[1]);
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

// ⚠️ O RODAPE SAIU (spec ORGANIZACAO-DO-SISTEMA, fase 3, menu unico,
// 10/11/2026), e com ele as listas NOMES e ORDEM do nav.js — a terceira lista
// deixou de existir. A tela entra no ☰ Menu pelo MAPA: `nucleo/telas.js` com
// modulo e bloco (o `teste_lugar.js` e o `teste_menu_unico.js` da raiz
// conferem o resto).
{nome:'TODA TELA DECLARADA TEM MODULO E BLOCO — e assim que ela entra no ☰ Menu',
 executar(){
  const falta=Object.entries(TELAS).filter(([,t])=>!t.modulo||!t.bloco).map(([c])=>c);
  if(falta.length) throw new Error('sem modulo ou bloco: '+falta.join(', '));
}},

{nome:'o rodape nao volta: o nav.js nao tem mais NOMES, ORDEM nem rodape()',
 executar(){
  const s=fs.readFileSync(path.join(PUB,'nav.js'),'utf8');
  if(/var NOMES=|var ORDEM=|function rodape\(/.test(s)) throw new Error('o rodape voltou ao nav.js');
}},

];
