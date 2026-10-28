// O CATALOGO DE ESCOLHAS DO CLIENTE — dono unico de "o que a revenda pode
// escolher numa persiana" (secao 4 da spec SOBMEDIDA-CADASTRO-DE-PRODUTO).
//
// ⚠️ A LISTA E DO SISTEMA, E O PRODUTO SO LIGA. Cada escolha tem dono no
// codigo: este arquivo diz as opcoes e do que ela depende, e o
// dominio/persiana.js valida e sabe o que ela libera ou esconde. Produto novo
// que e combinacao do que ja existe o dono monta sozinho, ligando; escolha
// que nao existe entra por spec, como peca pronta nova — nunca digitada na
// tela (secao 2).
//
// ⚠️ A CHAVE "sentido" E A ABERTURA DO PAINEL, e o nome e de proposito. Neste
// modulo `abertura` ja e a COLECAO (a tabela `abertura`, o `abertura_id` de
// todo pedido). Duas coisas com o mesmo nome no mesmo item seriam a armadilha
// #12 dentro de uma linha. Na tela ela continua sendo "Abertura".
const ESCOLHAS=[
  {chave:'comando', nome:'Lado do comando', opcoes:[
    {valor:'direito', nome:'Direito', frase:'Comando direito'},
    {valor:'esquerdo', nome:'Esquerdo', frase:'Comando esquerdo'}]},
  {chave:'rolamento', nome:'Rolamento', opcoes:[
    {valor:'frente', nome:'Desce pela frente', frase:'Rolamento pela frente'},
    {valor:'tras', nome:'Desce por trás', frase:'Rolamento por trás'}]},
  /* O adicional e a reducao tem um valor que quer dizer "nada" ('nenhum',
     'nao'), e por isso nunca foram obrigatorios no Rolo: e o caso normal. */
  {chave:'adicional', nome:'Bandô ou barra', vazio:'nenhum', opcoes:[
    {valor:'nenhum', nome:'Nenhum'},
    {valor:'bando', nome:'Bandô'},
    {valor:'barra', nome:'Barra niveladora'}]},
  {chave:'reducao', nome:'Redução de peso', vazio:'nao', opcoes:[
    {valor:'nao', nome:'Não'},
    {valor:'pedida', nome:'Pedida'}]},
  {chave:'acionamento', nome:'Acionamento', opcoes:[
    {valor:'com_comando', nome:'Com comando (corda)', frase:'Com comando'},
    {valor:'sem_comando', nome:'Sem comando (puxa as vias com a mão)', frase:'Sem comando'}]},
  {chave:'sentido', nome:'Abertura', opcoes:[
    {valor:'esquerda', nome:'Tudo para a esquerda', frase:'Abre para a esquerda'},
    {valor:'direita', nome:'Tudo para a direita', frase:'Abre para a direita'},
    {valor:'central', nome:'Central', frase:'Abertura central'}]},
  /* ⚠️ SO EXISTE COM COMANDO. Escolha que depende de outra SOME da tela
     quando nao se aplica, e o servidor RECUSA se vier mesmo assim — a tela
     esconder nao e a regra (armadilha #26 do CLAUDE.md). */
  {chave:'lado_corrente', nome:'Lado da corrente', depende:{acionamento:'com_comando'}, opcoes:[
    {valor:'direito', nome:'Direito', frase:'Corrente à direita'},
    {valor:'esquerdo', nome:'Esquerdo', frase:'Corrente à esquerda'}]},
  /* O numero de folhas: os limites dependem da abertura (secao 6.2), e quem
     os confere e a peca pronta "folhas" do calculo, que sabe a abertura. */
  {chave:'folhas', nome:'Folhas', numero:true}
];

const porChave=chave=>ESCOLHAS.find(x=>x.chave===chave)||null;

/* "Veio" quer dizer: a pessoa escolheu alguma coisa. Vazio, nulo e o valor de
   "nada" da propria escolha nao sao escolha — e e o que o pedido grava num
   produto que nao liga a escolha (o comando vazio da Painel). */
function veio(esc,valor){
  if(valor===undefined||valor===null||valor==='') return false;
  if(valor===false) return false;
  if(esc.vazio&&valor===esc.vazio) return false;
  return true;
}

// A lista do sistema com o que este produto liga, para a tela montar os campos.
function doModelo(ligadas){
  const on=new Set(ligadas||[]);
  return ESCOLHAS.map(x=>Object.assign({},x,{ligada:on.has(x.chave)}));
}

module.exports={ESCOLHAS,porChave,veio,doModelo};
