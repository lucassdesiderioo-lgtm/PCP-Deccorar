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
  /* CORRIGIR E DA BANCADA, como mover rolo: quem percebe que a sobra entrou
     com o tecido errado e quem esta com o retalho na mao. Sem esta chave a
     alternativa nao e esperar a chefia — e deixar errado, e o plano de corte
     passa a oferecer um retalho bege para uma peca cinza. Nao e baixa (a
     peca continua na prateleira), e cada campo corrigido deixa linha de
     historico com quem e quando. Descartar continua so com a chefia. */
  {chave:'sobra.corrigir',    nome:'Corrigir sobra lancada errada (tecido, medida, condicao, endereco)'},
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
    'parametro.ler','sobra.ler','sobra.criar','sobra.corrigir','etiqueta.imprimir',
    'rolo.ler','rolo.entrada','rolo.encerrar',
    'plano.calcular','plano.confirmar'
    /* ⚠️ `painel.ler` SAIU DO CORTADOR em 04/09/2026, por decisao do dono.
       O painel e escritorio: tema escuro, muitos numeros juntos, e responde
       o que a fabrica CONSOME, quanto tem parado e onde esta o dinheiro. Sem
       os campos de preco ele continua sendo a leitura gerencial do estoque —
       e nao e o que ajuda alguem em pe na bancada a cortar uma peca.

       E o mesmo argumento que moveu /cadastros de `ler` para `editar`: uma
       tela escura no tablet, sob a lampada de inspecao, cheia de coisa que o
       operador nao pode usar.

       O QUE ISSO CUSTA, e esta escrito para nao se descobrir por acidente: o
       cortador deixa de ver Encalhe, Refugo, Recusas e Cortes. Nenhum deles
       e necessario para cortar — o plano ja sugere o retalho sozinho, que e
       justamente para o cortador nao precisar caçar sobra em lista. Se um
       dia fizer falta, a volta e devolver 'painel.ler' a esta lista; o
       dinheiro continua podado pelo custo.semPreco de qualquer jeito. */
  ]
};

function pode(usuario,chave){
  if(!usuario) return false;
  const lista=PAPEIS[usuario.papel]||[];
  return lista.includes('*')||lista.includes(chave);
}

module.exports={CHAVES,PAPEIS,pode};
