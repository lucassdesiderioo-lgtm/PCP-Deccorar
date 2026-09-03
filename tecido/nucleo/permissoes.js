// Permissao por CHAVE, nao por cargo espalhado em if. O papel e so um atalho
// que agrupa chaves — o dia em que "cortador chefe" existir, e uma linha aqui.
//
// A chave que interessa hoje: sobra.descartar NAO esta no cortador. Baixa de
// sobra sem trava e o furo classico de inventario, e a decisao do dono foi
// "so a chefia".
//
// NAO HA CHAVE DE "gerenciar pessoas" aqui, e e de proposito: quem entra e
// decidido por area no PCP (Admin -> Acessos). Uma chave sem tela por tras
// mente para quem le a lista de permissoes do papel.
const CHAVES=[
  {chave:'cadastro.ler',      nome:'Ver cadastros'},
  {chave:'cadastro.editar',   nome:'Editar cadastros (tecido, enderecos, motivos)'},
  /* CRIAR ENDERECO E DA BANCADA TAMBEM, e nao e afrouxamento do cadastro.
     A prateleira ganha buraco novo no meio do dia, e quem esta com o tubo na
     mao e o operador. Sem esta chave ele nao espera a chefia — ele deixa o
     rolo sem endereco "para enderecar depois", e o depois nao existe: o tubo
     fica na estante sem ninguem saber onde.
     Renomear e apagar continuam com a chefia (cadastro.editar): criar e
     necessidade fisica com pressa, arrumar nao e. */
  {chave:'endereco.criar',    nome:'Criar haste, andar e nivel na estante'},
  {chave:'parametro.ler',     nome:'Ver parametros'},
  {chave:'parametro.editar',  nome:'Editar parametros do calculo'},
  {chave:'sobra.ler',         nome:'Ver sobras'},
  {chave:'sobra.criar',       nome:'Cadastrar sobra (mutirao e corte)'},
  {chave:'sobra.descartar',   nome:'Descartar sobra'},
  {chave:'etiqueta.imprimir', nome:'Imprimir lote de etiquetas de sobra'},
  /* VER PRECO E CHAVE SEPARADA, e quem nao tem NAO RECEBE OS CAMPOS — o JSON
     sai sem eles. Nao adianta esconder na tela e mandar pelo fio (regra 14 do
     CLAUDE.md §13). A bancada precisa saber onde o rolo esta e quanto ele
     tem; quanto ele custou e outra conversa. */
  {chave:'custo.ver',         nome:'Ver preco e valor do estoque'},
  {chave:'rolo.nota',         nome:'Lancar NF, fornecedor e preco do rolo'},
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
    'cadastro.ler','endereco.criar',
    'parametro.ler','sobra.ler','sobra.criar','etiqueta.imprimir',
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
