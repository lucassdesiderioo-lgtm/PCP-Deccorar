// Sobras e etiquetas. Repare em quem pede o que:
//   sobra.criar      cortador tem  — e ele que cataloga a prateleira
//   sobra.descartar  cortador NAO tem — baixa de sobra e da chefia
const sobra=require('../dominio/sobra');
const etiqueta=require('../dominio/etiqueta');
const pdf=require('../dominio/etiqueta_pdf');

module.exports={rotas:[
  {metodo:'GET', caminho:'/api/sobras', permissao:'sobra.ler',
   manipulador:({query})=>sobra.listar(query)},

  {metodo:'GET', caminho:'/api/sobras/resumo', permissao:'sobra.ler',
   manipulador:()=>sobra.resumo()},

  {metodo:'GET', caminho:'/api/sobras/codigo/:codigo', permissao:'sobra.ler',
   manipulador:({params})=>sobra.porCodigo(params.codigo)||null},

  {metodo:'POST', caminho:'/api/sobras', permissao:'sobra.criar',
   manipulador:({corpo,usuario})=>sobra.criar(corpo,usuario.nome),
   detalhe:(req,d)=>'sobra '+(d&&d.codigo)+' '+(d&&d.largura)+'x'+(d&&d.altura)},

  {metodo:'POST', caminho:'/api/sobras/:id/descartar', permissao:'sobra.descartar',
   manipulador:({params,corpo,usuario})=>sobra.descartar(params.id,corpo.motivo,usuario.nome),
   detalhe:(req)=>'descarte da sobra '+req.params.id+': '+(req.body.motivo||'')},

  // ── Etiquetas ──────────────────────────────────────────────────────────
  {metodo:'GET', caminho:'/api/etiquetas/pendentes', permissao:'sobra.ler',
   manipulador:()=>etiqueta.pendentes()},

  {metodo:'GET', caminho:'/api/etiquetas/lotes', permissao:'etiqueta.imprimir',
   manipulador:()=>etiqueta.lotes()},

  {metodo:'GET', caminho:'/api/etiquetas/lotes/:id', permissao:'etiqueta.imprimir',
   manipulador:({params})=>etiqueta.doLote(params.id)},

  /* A FOLHA PARA A IMPRESSORA: uma etiqueta por pagina, 100 x 35 mm.
     Separada do GET acima (que devolve a lista para a tela conferir) porque
     sao duas perguntas diferentes: "o que tem neste lote" e "me da o arquivo
     pronto para a Zebra". */
  {metodo:'GET', caminho:'/api/etiquetas/lotes/:id/pdf', permissao:'etiqueta.imprimir',
   tipo:'pdf',
   manipulador:async ({params})=>{
     const etqs=etiqueta.doLote(params.id);
     const arquivo=await pdf.gerar(etqs.map(e=>e.codigo));
     const de=etqs[0]&&etqs[0].codigo, ate=etqs[etqs.length-1]&&etqs[etqs.length-1].codigo;
     return {arquivo, nome:'etiquetas-'+de+'-'+ate+'.pdf'};
   },
   detalhe:(req)=>'PDF do lote '+req.params.id},

  {metodo:'POST', caminho:'/api/etiquetas/lotes', permissao:'etiqueta.imprimir',
   manipulador:({corpo,usuario})=>etiqueta.imprimirLote(corpo.quantidade,usuario.nome),
   detalhe:(req,d)=>'lote de '+(d&&d.quantidade)+' etiquetas ('+(d&&d.codigos[0])+' a '+(d&&d.codigos[d.codigos.length-1])+')'}
]};
