// As rotas do kanban (secao 4.17, fase 6-A). Sem SQL e sem 'if' de negocio.
//
// ⚠️ O QUADRO E `painel.ler`, E NAO `pedido.ler`. A pergunta que ele responde
// e "onde esta o pedido X" — e a resposta inteira, a fabrica toda, com o
// valor de cada carteira. `pedido.ler` esta no VENDEDOR, e daria a ele o
// quadro das revendas dos colegas; a fila dele continua em /pedidos, que e a
// lista de trabalho dele. O pronto-quando da fase 6 e "o DONO responde pela
// tela", e `painel.ler` e a chave do escritorio.
//
// ⚠️ E NAO NASCE CHAVE NOVA. O quadro e `painel.ler` e o cadastro das colunas
// e `cadastro.ler`/`cadastro.editar` — as mesmas de quem ja abre a tela de
// Cadastros, onde o card mora. Chave nova aqui seria a terceira ponta da
// armadilha #13 sem precisar: mais uma caixinha para alguem marcar.
const kanban=require('../dominio/kanban');
const custo=require('../dominio/custo');

/* O cartao carrega `valor_total_centavos`, entao a resposta passa pela poda
   do custo.js — ela corta por PADRAO DE NOME, e nao por lista escrita a mao
   (CLAUDE.md §19). Sem isto o valor de cada pedido viajaria pelo fio para
   quem nao tem `custo.ver`. */
const podar=(usuario,dados)=>custo.podar(usuario,dados);

module.exports={rotas:[

  {metodo:'GET', caminho:'/api/kanban', permissao:'painel.ler',
   manipulador:({usuario})=>podar(usuario,kanban.quadro())},

  /* As etapas saem junto com as colunas: a tela de cadastro precisa das duas
     para montar o seletor, e uma segunda rota so para a lista fechada seria
     mais uma porta para a mesma pergunta. */
  {metodo:'GET', caminho:'/api/kanban/colunas', permissao:'cadastro.ler',
   manipulador:()=>({colunas:kanban.colunas(), etapas:kanban.etapas()})},

  {metodo:'POST', caminho:'/api/kanban/colunas', permissao:'cadastro.editar',
   manipulador:({corpo})=>kanban.criarColuna(corpo),
   detalhe:(req)=>'coluna '+(req.body&&req.body.nome)+' -> '+(req.body&&req.body.etapa)},

  {metodo:'PUT', caminho:'/api/kanban/colunas/:id', permissao:'cadastro.editar',
   manipulador:({params,corpo})=>kanban.atualizarColuna(Number(params.id),corpo),
   detalhe:(req)=>req.body&&req.body.ativo!==undefined
     ? (req.body.ativo?'reativou a coluna':'desativou a coluna') : null}

]};
