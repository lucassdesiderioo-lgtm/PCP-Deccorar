// A BANCADA NAO ESPERA A CHEFIA — E O QUE ELA CRIA NAO SE PERDE.
//
// O que estes casos protegem nao e uma funcionalidade, e uma escolha entre
// dois jeitos de errar:
//
//   TRAVAR   o operador com o rolo na mao toca no botao de 2,00 para o
//            sistema aceitar, e o encaixe passa a cortar por uma largura que
//            aquele tubo nao tem. O erro acontece FORA da vista do sistema.
//   SOLTAR   a largura entra marcada, aparece numa lista, e a chefia arruma.
//            O erro acontece DENTRO, com nome e hora.
//
// A armadilha #6 do CLAUDE.md em uma linha: trava que dispara no caso normal
// vira desvio que a equipe aprende a fazer. O que estes casos NAO permitem e
// a terceira via — soltar e nao marcar, que e como uma decisao vira descuido.
const rolo=require('../dominio/rolo');
const tecido=require('../dominio/tecido');
const endereco=require('../dominio/endereco');
const largura=require('../dominio/largura');
const conferir=require('../dominio/conferir');
const {pode,PAPEIS}=require('../nucleo/permissoes');

const CORTADOR={nome:'Ana da bancada',papel:'cortador'};
const DIRETOR ={nome:'Lucas',papel:'diretor'};

let base=null;
function cena(){
  if(base) return base;
  const l=tecido.criarLinha({nome:'Rolo'});
  const a=tecido.criarAbertura({nome:'3%',linha_id:l.id});
  const c=tecido.criarCor({nome:'Bege'});
  const t=tecido.criarTecido({linha_id:l.id,abertura_id:a.id,cor_id:c.id});
  const h=endereco.criarHaste({nome:'A',armazem_chave:'ROLO'},DIRETOR);
  const an=endereco.criarAndar({nome:'1',haste_id:h.id},DIRETOR);
  base={t,h,an};
  return base;
}

module.exports=[

{nome:'A BOBINA FORA DA LISTA ENTRA COM O ROLO — o campo livre ensina o cadastro', executar({igual}){
  const {t}=cena();
  igual(largura.cadastrada('2,20'),false,'2,20 nao existe antes');

  const r=rolo.entrada({tecido_id:t.id,largura:'2,20',metragem:'50'},CORTADOR.nome);
  igual(r.largura_cadastrada,true,'a entrada avisa que cadastrou');
  igual(largura.cadastrada('2,20'),true,'e agora 2,20 esta na lista');

  /* O CAMPO LIVRE ERA UM BECO: a largura entrava no rolo e nao entrava na
     lista. O proximo tubo da MESMA bobina caia nele de novo, e um '20,0'
     digitado no lugar de '2,00' ficava escondido dentro de um registro —
     lugar onde ninguem procura. Na lista ele aparece e da para apagar. */
}},

{nome:'a segunda entrada da mesma bobina NAO duplica o cadastro', executar({igual}){
  const {t}=cena();
  const antes=largura.listar().length;
  const r=rolo.entrada({tecido_id:t.id,largura:'2,200',metragem:'30'},CORTADOR.nome);
  igual(r.largura_cadastrada,false,'nao cadastrou de novo');
  igual(largura.listar().length,antes,'a lista nao cresceu');
  // '2,5' e '2,50' eram bobinas diferentes na consulta do plano. O
  // arredondamento em milimetro e o que faz as duas cairem na MESMA linha.
}},

{nome:'o que a bancada cria fica MARCADO, com nome e hora', executar({igual}){
  const item=conferir.listar().find(i=>i.tipo==='largura_bobina'&&i.rotulo==='2,20 m');
  igual(!!item,true,'a bobina de 2,20 esta esperando conferencia');
  igual(item.criado_por,CORTADOR.nome,'com o nome de quem lancou');
  igual(item.onde,'Cadastros → Tecido → Larguras de bobina','e o caminho para arrumar');

  /* SOLTAR SEM MARCAR SERIA PIOR QUE TRAVAR. A lista e a outra metade da
     decisao: sem ela o que mudou nao foi "a chefia confere depois" — foi
     "ninguem confere", e o cadastro cresceria sozinho, sem ninguem ver. */
}},

{nome:'a largura que a CHEFIA cadastra nasce conferida', executar({igual}){
  const l=largura.criar('3,00');
  igual(conferir.listar().some(i=>i.tipo==='largura_bobina'&&i.id===l.id),false,
    'nao entra na lista de conferencia');
  // Marcar o que a propria chefia acabou de digitar seria pedir que ela
  // confira a si mesma. Lista com item obvio dentro e lista que ninguem le.
}},

{nome:'ENDERECO: a bancada cria, e a chefia confere depois', executar({igual}){
  const {an}=cena();
  const n=endereco.criarNivel({nome:'7',andar_id:an.id},CORTADOR);
  igual(n.conferir,1,'nasce marcado');
  igual(n.criado_por,CORTADOR.nome,'com quem criou');

  const item=conferir.listar().find(i=>i.tipo==='nivel'&&i.id===n.id);
  igual(item.rotulo,'ROLO · A-1-7','e a lista mostra o endereco por extenso');

  /* Sem isto o operador nao esperava a chefia: ele deixava o rolo SEM
     endereco "para enderecar depois", e o depois nao existe. Tubo na estante
     sem ninguem saber onde e pior que nome de haste digitado torto. */
}},

{nome:'o mesmo endereco criado pela CHEFIA nao entra na lista', executar({igual}){
  const {an}=cena();
  const n=endereco.criarNivel({nome:'8',andar_id:an.id},DIRETOR);
  igual(n.conferir,0,'ja nasce conferido');
  igual(conferir.listar().some(i=>i.tipo==='nivel'&&i.id===n.id),false,'e fora da lista');
}},

{nome:'"Conferi" TIRA DA LISTA e nao arruma nada', executar({igual}){
  const {an}=cena();
  const n=endereco.criarNivel({nome:'9',andar_id:an.id},CORTADOR);
  conferir.marcar('nivel',n.id);
  igual(conferir.listar().some(i=>i.tipo==='nivel'&&i.id===n.id),false,'saiu da lista');

  const dNivel=require('../dados/nivel');
  igual(dNivel.porId(n.id).nome,'9','o cadastro nao mudou');
  /* Corrigir tem botao proprio (Renomear, Apagar). Um "conferir" que tambem
     arrumasse esconderia qual das duas coisas a pessoa fez. */
}},

{nome:'tipo fora do mapa nao vira UPDATE em tabela qualquer', executar({recusa}){
  recusa(()=>conferir.marcar('inventado',1),'tipo_desconhecido');
  recusa(()=>conferir.marcar('nivel',99999),'cadastro_inexistente');
  // O nome do tipo vem da URL. Sem a guarda, um erro de digitacao viraria
  // 'UPDATE <qualquer coisa> SET conferir=0'.
}},

{nome:'CRIAR endereco e da bancada; RENOMEAR e APAGAR continuam da chefia', executar({igual}){
  igual(pode(CORTADOR,'endereco.criar'),true,'o cortador cria');
  igual(pode(CORTADOR,'cadastro.editar'),false,'e nao arruma');
  igual(pode(DIRETOR,'endereco.criar'),true,'a chefia faz as duas');

  igual(PAPEIS.cortador.includes('endereco.criar'),true,
    'a chave esta no papel, e nao num if espalhado');

  /* A ASSIMETRIA E A REGRA, e nao uma meia-permissao por indecisao: o buraco
     novo na prateleira aparece com o tubo ja na mao, e endereco que nao da
     para criar na hora vira rolo sem endereco. Arrumar um nome torto, nao —
     isso espera sem custo nenhum. */
}},

{nome:'largura absurda NAO derruba a entrada do rolo — nem entra na lista', executar({igual,recusa}){
  const {t}=cena();
  // Quem recusa o numero e o rolo.entrada, com o teto dele. O `garantir` nao
  // lanca erro nunca: um erro no cadastro derrubando a entrada seria
  // exatamente o que esta mudanca existe para nao fazer.
  recusa(()=>rolo.entrada({tecido_id:t.id,largura:'250',metragem:'50'},CORTADOR.nome),
    'medida_absurda');
  igual(largura.listar().some(l=>l.valor===250),false,'e 250 nao ficou na lista');
}}

];
