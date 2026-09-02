// Permissao por CHAVE, nao por cargo espalhado em if. O papel e so um atalho
// que agrupa chaves — o dia em que "cortador chefe" existir, e uma linha aqui.
//
// A chave que interessa hoje: sobra.descartar NAO esta no cortador. Baixa de
// sobra sem trava e o furo classico de inventario, e a decisao do dono foi
// "so a chefia".
const CHAVES=[
  {chave:'cadastro.ler',      nome:'Ver cadastros'},
  {chave:'cadastro.editar',   nome:'Editar cadastros (tecido, enderecos, motivos)'},
  {chave:'parametro.ler',     nome:'Ver parametros'},
  {chave:'parametro.editar',  nome:'Editar parametros do calculo'},
  {chave:'usuario.editar',    nome:'Gerenciar pessoas e PINs'},
  {chave:'sobra.ler',         nome:'Ver sobras'},
  {chave:'sobra.criar',       nome:'Cadastrar sobra (mutirao e corte)'},
  {chave:'sobra.descartar',   nome:'Descartar sobra'},
  {chave:'etiqueta.imprimir', nome:'Imprimir lote de etiquetas de sobra'},
  {chave:'rolo.ler',          nome:'Ver rolos'},
  {chave:'rolo.entrada',      nome:'Entrada de rolo'},
  {chave:'rolo.encerrar',     nome:'Encerrar rolo (acerto de fim)'},
  {chave:'rolo.ajustar',      nome:'Ajustar saldo de rolo'},
  {chave:'plano.calcular',    nome:'Calcular plano de corte'},
  {chave:'plano.confirmar',   nome:'Confirmar plano (baixa o estoque)'},
  {chave:'painel.ler',        nome:'Painel e relatorios'}
];

const PAPEIS={
  diretor:['*'],
  cortador:[
    'cadastro.ler','parametro.ler','sobra.ler','sobra.criar','etiqueta.imprimir',
    'rolo.ler','rolo.entrada','rolo.encerrar',
    'plano.calcular','plano.confirmar','painel.ler'
  ]
};

function pode(usuario,chave){
  if(!usuario) return false;
  const lista=PAPEIS[usuario.papel]||[];
  return lista.includes('*')||lista.includes(chave);
}

module.exports={CHAVES,PAPEIS,pode};
