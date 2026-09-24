// As rotas da etiqueta de producao e da entrada do pedido no plano de corte.
// Sem SQL e sem 'if' de negocio — cada manipulador so traduz o pedido HTTP
// numa chamada do dominio.
const etq=require('../dominio/etiqueta_producao');
const pdf=require('../dominio/etiqueta_producao_pdf');
const custo=require('../dominio/custo');

const LER='etiqueta_producao.ler', IMPRIMIR='etiqueta_producao.imprimir';

module.exports={rotas:[

  {metodo:'GET', caminho:'/api/producao/setores', permissao:LER,
   manipulador:()=>etq.setores()},

  /* A lista da tela: pedido aprovado, com o que cada setor tem e o que ja
     saiu. Ela nao leva dinheiro nenhum, mas passa pela poda do mesmo jeito —
     campo novo com nome de preco que entrasse aqui amanha viajaria pelo fio
     sem ninguem notar (§19). */
  {metodo:'GET', caminho:'/api/producao/etiquetas', permissao:LER,
   manipulador:({usuario})=>custo.podar(usuario,etq.aImprimir())},

  {metodo:'GET', caminho:'/api/producao/impressoes', permissao:LER,
   manipulador:({query})=>etq.impressoes(Number(query.limite)||30)},

  /* A PREVIA: o que vai sair, sem marcar nada. E o equivalente do "imprimir 1
     de teste" da etiqueta do kit (§4) — com a lista na tela da para ver que a
     tarefa e a medida estao certas antes de gastar rolo. */
  {metodo:'POST', caminho:'/api/producao/etiquetas/previa', permissao:LER,
   manipulador:({corpo})=>etq.paraImprimir(corpo)},

  /* ⚠️ IMPRIMIR E POST, e nao GET, porque ele MARCA. A etiqueta de sobra
     imprime por GET e ali esta certo (ela so tira copia do que ja existe);
     aqui o ato muda o estado da peca e entra no registro de quem imprimiu. */
  {metodo:'POST', caminho:'/api/producao/etiquetas/imprimir', permissao:IMPRIMIR,
   tipo:'pdf',
   manipulador:async({corpo,usuario})=>{
     const r=etq.imprimir(corpo,usuario);
     return {arquivo:await pdf.gerar(r.etiquetas),
             nome:'etiquetas-'+(corpo.setor||'todos')+'.pdf'};
   },
   /* A reimpressao da peca REFEITA vem por `codigos` (fase 5-B2) e nao por
      pedido: reimprimir o maco inteiro para refazer uma peca poe etiquetas
      repetidas na bancada. O detalhe da auditoria diz qual dos dois foi. */
   detalhe:(req)=>{
     const b=req.body||{};
     if((b.codigos||[]).length) return 'reimpressao de refeita: '+b.codigos.join(', ');
     return 'etiquetas de '+b.setor+' dos pedidos '+((b.pedidos)||[]).join(', ');
   }},

  /* ── O PLANO DE CORTE ───────────────────────────────────────────────────
     As pecas de tecido dos aprovados, ja com a medida de CORTE e agrupadas
     por tecido — o formato que o `plano.calcular` recebe. A permissao e a de
     quem calcula plano, nao a de quem le etiqueta: quem abre esta lista esta
     indo cortar. */
  {metodo:'POST', caminho:'/api/producao/para-cortar', permissao:'plano.calcular',
   manipulador:({corpo})=>etq.paraCortar(corpo)}
]};
