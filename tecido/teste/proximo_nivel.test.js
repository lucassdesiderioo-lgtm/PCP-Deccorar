// O PROXIMO NUMERO DA ESTANTE — a sugestao que poupa a digitacao.
//
// Cheios os dez niveis do andar, o buraco novo e o 11, e quem esta com o tubo
// na mao nao deveria ter de digitar isso. O erro que a conta evita nao da erro
// nenhum: digita-se "12", o 11 nunca existe, e a estante do sistema passa a
// ter um buraco que a prateleira nao tem.
//
// ⚠️ E SUGESTAO, NAO REGRA. O nome do endereco segue livre (R5), e todo caso
// aqui embaixo existe para travar essa fronteira: o dominio propoe, a tela
// mostra, e quem grava e a pessoa.
const endereco=require('../dominio/endereco');

let cena=null;
function montar(){
  if(cena) return cena;
  const h=endereco.criarHaste({nome:'A',armazem_chave:'ROLO'});
  cena={haste:h.id};
  return cena;
}
// Cada caso monta o SEU andar: a cena e compartilhada dentro do arquivo, e
// niveis de um caso vazariam na conta do outro.
const andarCom=(nome,niveis)=>{
  const a=endereco.criarAndar({nome,haste_id:montar().haste});
  niveis.forEach(n=>endereco.criarNivel({nome:n,andar_id:a.id}));
  return a.id;
};
const sugestaoDo=andar_id=>endereco.arvore('ROLO')
  .flatMap(h=>h.andares).find(a=>a.id===andar_id).proximo_nivel;

module.exports=[

{nome:'dez niveis cheios, o proximo e o 11', executar({igual}){
  const a=andarCom('1',['1','2','3','4','5','6','7','8','9','10']);
  igual(sugestaoDo(a),'11','a sugestao sai pronta na arvore');
  /* Pelo MAIOR NUMERO, nao pela quantidade nem pela ordem alfabetica: num
     andar onde o nivel 3 foi apagado, contar linhas sugeriria "10" — que ja
     existe, e a criacao seria recusada por nivel_repetido com o operador
     sem entender o que fez de errado. */
}},

{nome:'o maior vence a ordem alfabetica: 9 e 10 dao 11', executar({igual}){
  igual(endereco.proximoNome(['10','9']),'11','"9" nao e maior que "10"');
  // Comparar como texto poria "9" na frente e sugeriria "10", que ja esta la.
}},

{nome:'o buraco no meio NAO e oferecido', executar({igual}){
  const a=andarCom('2',['1','2','4']);
  igual(sugestaoDo(a),'5','segue do maior, e nao tapa o 3');
  /* O 3 pode ter sido apagado porque a prateleira mudou. Oferecer o buraco
     do meio faria o sistema empurrar a bancada para um lugar que ninguem
     disse que voltou a existir — e quem quiser o 3 de volta digita 3. */
}},

{nome:'o ZERO A ESQUERDA e copiado de quem ja esta la', executar({igual}){
  const a=andarCom('3',['01','02','03']);
  igual(sugestaoDo(a),'04','04, e nao 4');
  igual(endereco.proximoNome(['08','09']),'10','a largura se mantem na virada');
  igual(endereco.proximoNome(['1','2']),'3','sem zero na estante, sem zero na sugestao');
  /* Largura misturada ("9" ao lado de "10", "04" ao lado de "5") faz a lista
     ordenar torto na tela e o olho procurar duas vezes na prateleira. */
}},

{nome:'andar SEM nivel nenhum nao inventa o 1', executar({igual}){
  const a=andarCom('4',[]);
  igual(sugestaoDo(a),null,'null e "nao da pra dizer"');
  /* Nunca 1: o primeiro nivel de uma estante nova pode muito bem se chamar
     "01" ou "fundo", e a tela que sugere errado ensina a corrigir o campo
     toda vez — ate a pessoa parar de ler o que esta escrito nele. Mesma
     regra da cobertura sem venda (CLAUDE.md §3): falta de dado e null. */
}},

{nome:'nome que nao e numero fica FORA da conta', executar({igual}){
  const a=andarCom('5',['frente','fundo']);
  igual(sugestaoDo(a),null,'andar sem sequencia numerica nao sugere nada');
  igual(endereco.proximoNome(['1','fundo','2']),'3','misturado, conta so os numeros');
  igual(endereco.proximoNome(['A-1','2x']),null,'"2x" nao e numero');
}},

{nome:'a sugestao ANDA: criado o 11, o proximo vira 12', executar({igual}){
  const a=andarCom('6',['10']);
  igual(sugestaoDo(a),'11','primeiro o 11');
  endereco.criarNivel({nome:'11',andar_id:a});
  igual(sugestaoDo(a),'12','e depois o 12, sem ninguem recarregar nada');
}},

{nome:'nivel DESATIVADO continua contando', executar({igual}){
  const a=andarCom('7',['1','2']);
  const n=endereco.criarNivel({nome:'3',andar_id:a});
  require('../dados/nivel').desativar(n.id);
  igual(sugestaoDo(a),'4','o 3 desativado nao volta a ser oferecido');
  /* Cadastro nao se apaga, se desativa (dados/_lista.js) — e o `criarNivel`
     recusa nome repetido olhando ATIVO E INATIVO. Se a sugestao contasse so
     os ativos, ela ofereceria o 3 e a propria criacao recusaria em seguida:
     a tela mandando a pessoa fazer o que o sistema nao aceita. */
}},

{nome:'e SUGESTAO: outro nome passa igual', executar({igual}){
  const a=andarCom('8',['1','2']);
  igual(sugestaoDo(a),'3','o sistema propoe o 3');
  const n=endereco.criarNivel({nome:'fundo',andar_id:a});
  igual(n.nome,'fundo','e "fundo" entra do mesmo jeito');
  igual(sugestaoDo(a),'3','a sugestao segue o 3 — "fundo" nao mexe na sequencia');
  // R5 continua de pe: nenhuma quantidade de haste, andar ou nivel e decidida
  // no codigo. A conta propoe; ela nao tranca.
}},

{nome:'o ANDAR tem a mesma sugestao, na mesma arvore', executar({igual}){
  const h=endereco.criarHaste({nome:'B',armazem_chave:'ROLO'});
  endereco.criarAndar({nome:'1',haste_id:h.id});
  endereco.criarAndar({nome:'2',haste_id:h.id});
  const haste=endereco.arvore('ROLO').find(x=>x.id===h.id);
  igual(haste.proximo_andar,'3','a haste diz qual o proximo andar');
  /* Uma conta so para as duas perguntas. Duas seriam a armadilha #12 em
     miniatura: divergiriam no primeiro andar de nome torto, e as duas
     estariam "certas" — cada uma na sua regua. */
}},

{nome:'a estante das SOBRAS tem a sugestao tambem', executar({igual}){
  const h=endereco.criarHaste({nome:'C',armazem_chave:'SOBRA'});
  const a=endereco.criarAndar({nome:'1',haste_id:h.id});
  endereco.criarNivel({nome:'01',andar_id:a.id});
  const andar=endereco.arvore('SOBRA').flatMap(x=>x.andares).find(x=>x.id===a.id);
  igual(andar.proximo_nivel,'02','a conta e do endereco, nao do que ele guarda');
  /* A trava de um rolo por nivel e so do ROLO (retalho dobrado se acha pela
     etiqueta, nao pelo endereco), mas digitar numero em sequencia e o mesmo
     trabalho nas duas estantes. */
}}

];
