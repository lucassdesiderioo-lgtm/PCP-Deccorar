// APAGAR CADASTRO — e a conta que decide se pode.
//
// A regra da casa sempre foi "cadastro nao se apaga, desativa", e ela existe
// por um motivo real: linha de historico aponta para o cadastro, e apagar a
// cor faria o plano de tres meses atras deixar de saber o que foi cortado.
//
// So que a regra, sozinha, produz o problema oposto: o cadastro digitado
// errado no primeiro dia fica na lista para sempre, riscado, e a tela vira um
// depositio de coisa morta que ninguem le mais. Foi o que aconteceu com as
// nove cores que carregavam o nome da colecao.
//
// A distincao que resolve os dois:
//
//   NINGUEM APONTA  ->  apaga de verdade. Nao ha historico para preservar;
//                       o que existe e um erro de digitacao.
//   ALGUEM APONTA   ->  recusa, DIZENDO QUEM. "Nao da para apagar" sozinho
//                       vira suporte; "3 rolos usam este endereco" vira
//                       decisao.
//
// ⚠️ ESTE ARQUIVO E O DONO UNICO DE QUEM APONTA PARA QUEM. Espalhar a conta
// pelos dominios faria cada um conhecer meio mapa, e o dia em que uma tabela
// nova apontasse para `cor` ninguem lembraria de atualizar as duas pontas —
// e a exclusao passaria a apagar o que tem historico, em silencio.
const db=require('../nucleo/db');
const {ErroDeRegra,exigir}=require('../nucleo/erros');

/* O mapa. Para cada cadastro, quem pode estar apontando para ele — e como se
   diz isso em portugues para quem esta na tela.

   `conta` devolve quantas linhas apontam; `frase` transforma o numero em
   recado. Os dois juntos, e nao um `SELECT COUNT` generico, porque "2" nao
   diz nada e "2 rolos estao nesta haste" diz tudo. */
const MAPA={
  cor:{
    tabela:'cor', oque:'a cor',
    dependentes:[
      {sql:'SELECT COUNT(*) c FROM tecido WHERE cor_id=?',
       frase:n=>n+' item(ns) de tecido usam esta cor'}
    ]
  },
  abertura:{
    tabela:'abertura', oque:'a colecao',
    dependentes:[
      {sql:'SELECT COUNT(*) c FROM tecido WHERE abertura_id=?',
       frase:n=>n+' item(ns) de tecido usam esta colecao'}
    ]
  },
  linha:{
    tabela:'linha', oque:'a linha',
    dependentes:[
      {sql:'SELECT COUNT(*) c FROM abertura WHERE linha_id=?',
       frase:n=>n+' colecao(oes) pertencem a esta linha'},
      {sql:'SELECT COUNT(*) c FROM tecido WHERE linha_id=?',
       frase:n=>n+' item(ns) de tecido usam esta linha'}
    ]
  },
  tecido:{
    tabela:'tecido', oque:'o item de tecido',
    dependentes:[
      {sql:'SELECT COUNT(*) c FROM rolo WHERE tecido_id=?',   frase:n=>n+' rolo(s) sao deste tecido'},
      {sql:'SELECT COUNT(*) c FROM sobra WHERE tecido_id=?',  frase:n=>n+' sobra(s) sao deste tecido'},
      {sql:'SELECT COUNT(*) c FROM plano WHERE tecido_id=?',  frase:n=>n+' plano(s) de corte usaram este tecido'},
      {sql:'SELECT COUNT(*) c FROM refugo WHERE tecido_id=?', frase:n=>n+' refugo(s) sao deste tecido'}
    ]
  },
  nivel:{
    tabela:'nivel', oque:'o nivel',
    dependentes:[
      {sql:'SELECT COUNT(*) c FROM rolo WHERE nivel_id=?',  frase:n=>n+' rolo(s) estao neste endereco'},
      {sql:'SELECT COUNT(*) c FROM sobra WHERE nivel_id=?', frase:n=>n+' sobra(s) estao neste endereco'}
    ]
  },
  andar:{
    tabela:'andar', oque:'o andar',
    dependentes:[
      {sql:'SELECT COUNT(*) c FROM nivel WHERE andar_id=?',
       frase:n=>n+' nivel(is) neste andar'}
    ]
  },
  haste:{
    tabela:'haste', oque:'a haste',
    dependentes:[
      {sql:'SELECT COUNT(*) c FROM andar WHERE haste_id=?',
       frase:n=>n+' andar(es) nesta haste'}
    ]
  },
  motivo_recusa:{
    tabela:'motivo_recusa', oque:'o motivo',
    dependentes:[
      {sql:'SELECT COUNT(*) c FROM plano_recusa WHERE motivo_id=?',
       frase:n=>n+' recusa(s) de sobra foram registradas com este motivo'},
      {sql:'SELECT COUNT(*) c FROM plano_peca WHERE recusa_motivo_id=?',
       frase:n=>n+' peca(s) de plano apontam para este motivo'}
    ]
  },
  largura_bobina:{
    tabela:'largura_bobina', oque:'a largura',
    // A largura nao e apontada por id: o rolo guarda o NUMERO. Por isso a
    // conta e por valor, e nao por chave estrangeira.
    porValor:true,
    dependentes:[
      {sql:'SELECT COUNT(*) c FROM rolo WHERE ROUND(largura,3)=ROUND(?,3)',
       frase:n=>n+' rolo(s) tem bobina desta largura'}
    ]
  }
};

/* Quem esta segurando este cadastro. Lista vazia = da para apagar. */
function quemUsa(tipo,id){
  const m=MAPA[tipo];
  exigir(m,'tipo_desconhecido','Cadastro "'+tipo+'" nao sabe se apagar.');
  const linha=db.prepare('SELECT * FROM '+m.tabela+' WHERE id=?').get(id);
  exigir(linha,'cadastro_inexistente','Cadastro nao encontrado.');
  const alvo=m.porValor?linha.valor:id;

  return m.dependentes
    .map(d=>({n:db.prepare(d.sql).get(alvo).c, frase:d.frase}))
    .filter(x=>x.n>0)
    .map(x=>x.frase(x.n));
}

/* Apaga — ou recusa dizendo QUEM segura.
   Nao desativa como consolo: quem chamou pediu para apagar, e "apaguei mas
   na verdade so escondi" e a resposta que faz a pessoa apagar de novo no mes
   seguinte procurando o que sumiu. A tela oferece desativar como acao
   separada, com nome proprio. */
function excluir(tipo,id){
  const m=MAPA[tipo];
  exigir(m,'tipo_desconhecido','Cadastro "'+tipo+'" nao sabe se apagar.');
  const usos=quemUsa(tipo,id);
  if(usos.length)
    throw new ErroDeRegra('cadastro_em_uso',
      'Nao da para apagar '+m.oque+': '+usos.join(' e ')+
      '. Apagar quebraria esse historico — desative em vez de apagar.');

  db.prepare('DELETE FROM '+m.tabela+' WHERE id=?').run(id);
  return {apagado:true, tipo, id};
}

// A tela pergunta ANTES de mostrar o botao: da para apagar este aqui?
const podeApagar=(tipo,id)=>quemUsa(tipo,id).length===0;

module.exports={excluir,quemUsa,podeApagar,MAPA};
