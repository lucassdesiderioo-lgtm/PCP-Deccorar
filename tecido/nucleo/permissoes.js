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
  /* ⚠️ A CHAVE DE ENTRAR, e ela nasceu de um defeito evitado na fase 2.
     A tela inicial e o /api/eu pediam `cadastro.ler` "porque e a chave mais
     baixa que todo mundo que entra tem". Isso era verdade enquanto havia dois
     papeis; com o VENDEDOR passou a ser mentira, e o efeito seria o pior
     possivel: ou ele abriria o modulo em branco, com 403 no console, ou
     ganharia `cadastro.ler` de carona — e com ela a lista inteira de tecido,
     endereco e motivo, que nao e o que ele precisa para simular uma persiana.
     E a armadilha #29 do CLAUDE.md pela porta de dentro: tela em branco nao
     se parece nem de longe com "mexeram na permissao". */
  {chave:'modulo.entrar',     nome:'Entrar no sob medida (tela inicial e menu)'},
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
  /* CORRIGIR E DA CHEFIA, por decisao do dono (05/09/2026): e ela que aceita
     a correcao. A sobra lancada com o tecido errado muda de prateleira no
     sistema — o plano de corte passa a oferece-la para OUTRA cor —, e isso e
     o tipo de mexida que se quer com alguem olhando. Cada campo corrigido
     deixa linha de historico com quem e quando. A bancada ve a sobra marcada
     como "corrigida" e o historico, mas nao ve o botao. */
  {chave:'sobra.corrigir',    nome:'Corrigir sobra lancada errada, e aceitar ou recusar o que a bancada apontou'},
  /* APONTAR E DA BANCADA. Quem percebe o erro esta com o retalho na mao; se
     nao tem onde registrar, o erro fica na cabeca dela ate a chefia passar
     por ali — dado na memoria em vez de no sistema, a doenca de sempre. O
     apontamento nao muda a sobra: vira correcao so quando a chefia aceita. */
  {chave:'sobra.propor',      nome:'Apontar erro numa sobra para a chefia corrigir'},
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
  {chave:'painel.ler',        nome:'Painel e relatorios'},

  /* ── O CATALOGO DO SOB MEDIDA (spec SOBMEDIDA-PEDIDO-REVENDA, fase 1) ────
     Duas chaves, e a divisao e a mesma de sempre: ver o catalogo e o que o
     simulador precisa; mexer nele muda o que a fabrica corta e o que o
     cliente paga.

     ⚠️ NENHUMA DAS DUAS ESTA NO CORTADOR, e isso e decisao da fase 1: o
     catalogo e o simulador sao escritorio (tela escura, muitos numeros), e
     na fase 1 quem usa e a equipe interna lancando os pedidos do WhatsApp.
     O papel proprio do VENDEDOR e da fase 2 — ate la ele entra pela area
     "Sob medida - cadastros" do PCP, que e mais larga do que precisa. Isso
     esta escrito aqui para nao se descobrir por acidente. */
  {chave:'catalogo.ler',      nome:'Ver o catalogo de venda e usar o simulador'},
  {chave:'catalogo.editar',   nome:'Editar modelo, colecoes de venda, escada de tubos, ficha e precos'},

  /* ── QUEM COMPRA (spec SOBMEDIDA-PEDIDO-REVENDA, fase 2) ────────────────
     Tres chaves, e a divisao e por quanto custa errar.

     Ler a carteira e o que o vendedor faz o dia inteiro. Editar o cadastro
     decide a TABELA e o DESCONTO — ou seja, quanto aquela revenda paga em
     todo pedido daqui para a frente. E o limite de credito decide quanto ela
     pode dever.

     ⚠️ O VENDEDOR NAO RECEBE `revenda.editar` NEM `credito.editar`, e isso e
     decisao da fase 2, nao esquecimento. A spec diz que "a tabela e decidida
     pela Deccorar" (secao 4.12) e que o limite e revisto de dois em dois
     meses (4.13) — as duas sao decisao de quem responde pelo dinheiro, nao
     de quem vende. Custa isto, e esta escrito para nao se descobrir por
     acidente: revenda nova, troca de tabela, endereco de entrega novo e
     limite passam pela chefia. Alargar e uma linha aqui; o contrario, nao. */
  {chave:'revenda.ler',       nome:'Ver as revendas e a carteira'},
  {chave:'revenda.editar',    nome:'Cadastrar revenda, enderecos, contatos, tabela e desconto'},
  {chave:'credito.editar',    nome:'Definir e revisar o limite de credito da revenda'}
];

const PAPEIS={
  diretor:['*'],
  cortador:[
    'modulo.entrar',
    'cadastro.ler','endereco.criar',
    'parametro.ler','sobra.ler','sobra.criar','sobra.propor','etiqueta.imprimir',
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
  ],

  /* ── O VENDEDOR (fase 2) ────────────────────────────────────────────────
     Ele simula persiana, le o catalogo e cuida da carteira dele. Nao corta,
     nao mexe em rolo, nao descarta sobra, nao abre o cadastro de tecido e
     nao mexe nos parametros do encaixe.

     Ate a fase 2 ele entrava pela area "Sob medida - cadastros", que e a da
     CHEFIA: catalogo, tecido, parametros e descarte de sobra, tudo junto.
     Estava escrito como divida aberta no STATUS da fase 1, e fecha aqui.

     ⚠️ `custo.ver` ESTA NA LISTA, e tem que estar. A poda do custo.js corta
     todo campo de dinheiro de quem nao a tem — e o vendedor sem ela abriria
     o simulador e veria a persiana inteira SEM o preco, que e justamente o
     numero que ele foi buscar. O que ela abre alem disso (o painel, o valor
     do estoque) continua fechado por outra chave: `painel.ler` e
     `cadastro.ler` nao estao aqui. */
  vendedor:[
    'modulo.entrar',
    'catalogo.ler','custo.ver',
    'revenda.ler'
  ]
};

function pode(usuario,chave){
  if(!usuario) return false;
  const lista=PAPEIS[usuario.papel]||[];
  return lista.includes('*')||lista.includes(chave);
}

module.exports={CHAVES,PAPEIS,pode};
