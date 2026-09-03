// AS LARGURAS DE BOBINA — o cadastro que tira a largura do teclado.
//
// Digitar largura erra de dois jeitos que ninguem percebe, e nenhum deles da
// erro na tela:
//   '2,5' e '2,50'  viram bobinas diferentes na consulta do plano
//   '20,0'          entra como bobina de vinte metros, e o encaixe passa a
//                   "achar" que cabe qualquer peca
//
// Os dois so aparecem depois, no corte, com o tecido na mesa.
const largura=require('../dominio/largura');
const rolo=require('../dominio/rolo');
const tecido=require('../dominio/tecido');
const endereco=require('../dominio/endereco');

let base=null;
function cena(){
  if(!base){
    const linha=tecido.criarLinha({nome:'Rolo'});
    const abertura=tecido.criarAbertura({nome:'Screen 1%',linha_id:linha.id});
    const h=endereco.criarHaste({nome:'A',armazem_chave:'ROLO'});
    const a=endereco.criarAndar({nome:'01',haste_id:h.id});
    const n=endereco.criarNivel({nome:'01',andar_id:a.id});
    base={linha,abertura,nivel:n.id,n:0};
  }
  const cor=tecido.criarCor({nome:'Cor '+(++base.n)});
  const t=tecido.criarTecido({linha_id:base.linha.id,abertura_id:base.abertura.id,cor_id:cor.id});
  return {t, nivel:base.nivel};
}

module.exports=[

{nome:'a lista comeca vazia num banco novo — e isso e honesto', executar({igual}){
  igual(largura.listar().length,0,'nada semeado');
  // Semear 2,00/2,50/3,00 seria um chute meu sobre a fabrica. Em producao a
  // migracao herda as larguras dos rolos que ja existem; num banco novo a
  // primeira entrada de rolo ensina qual cadastrar.
}},

{nome:'2,5 e 2,50 sao a MESMA bobina', executar({igual,recusa}){
  largura.criar('2,50');
  recusa(()=>largura.criar('2,5'),'largura_repetida');
  igual(largura.listar().length,1,'uma linha so');
  // Este e o defeito que o cadastro veio matar: duas linhas para a mesma
  // bobina fariam o plano procurar rolo numa largura que nao existe.
}},

{nome:'VIRGULA NO LUGAR ERRADO e recusada', executar({recusa}){
  recusa(()=>largura.criar('250'),'largura_absurda');
  recusa(()=>largura.criar('0'),'largura_invalida');
  recusa(()=>largura.criar('abc'),'largura_invalida');
  // Bobina de 250 m nao existe. Aceitar faria o encaixe caber qualquer peca,
  // o plano sair lindo, e o corte descobrir na mesa.
}},

{nome:'cadastrar de novo uma largura DESLIGADA religa, em vez de recusar',
 executar({igual}){
  const l=largura.criar('1,80');
  largura.desativar(l.id);
  igual(largura.listar().find(x=>x.id===l.id).ativo,0,'saiu da lista');
  const de_novo=largura.criar('1,80');
  igual(de_novo.id,l.id,'e a MESMA linha, religada');
  igual(de_novo.ativo,1,'ativa outra vez');
  // Recusar mandaria o diretor procurar numa lista onde ela nao aparece.
}},

{nome:'LARGURA COM ROLO EM USO NAO SAI DA LISTA', executar({igual,recusa}){
  const x=cena();
  const l=largura.criar('2,20');
  rolo.entrada({tecido_id:x.t.id,largura:'2,20',metragem:'50',nivel_id:x.nivel},'teste');

  recusa(()=>largura.desativar(l.id),'largura_em_uso');
  igual(largura.listar().find(y=>y.id===l.id).rolos,1,'a tela mostra por que');

  /* A lista DESCREVE A PRATELEIRA. Tirar uma largura que ainda tem rolo faria
     a proxima entrada daquela bobina cair no campo livre, com aviso de "nao
     cadastrada" — para uma bobina que a fabrica tem na mao. O aviso perderia
     o sentido na primeira vez, e depois disso ninguem mais o le. */
}},

{nome:'a lista diz quantos rolos cada largura tem', executar({igual}){
  const l=largura.listar().find(x=>x.rolos>0);
  igual(!!l,true,'o contador existe');
  // E o numero que separa "largura que a fabrica usa" de "largura que alguem
  // cadastrou e nunca comprou". Sem ele nao ha como limpar a lista.
}},

{nome:'cadastrada() responde para a tela avisar — nunca para bloquear',
 executar({igual}){
  igual(largura.cadastrada('2,50'),true,'esta na lista');
  igual(largura.cadastrada('2,37'),false,'esta nao');
  /* A tela AVISA e deixa entrar. Rolo que chega fora do padrao existe, e
     recusar a entrada dele seria a armadilha #6 do CLAUDE.md: a bancada
     lancaria a largura errada so para o sistema aceitar, e o erro entraria
     no lugar onde ninguem procura. */
}}

];
