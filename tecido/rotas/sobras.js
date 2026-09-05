// Sobras e etiquetas. Repare em quem pede o que:
//   sobra.criar      cortador tem  — e ele que cataloga a prateleira
//   sobra.corrigir   cortador NAO tem — a chefia aceita a correcao, com rastro
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

  /* A CORRECAO. O detalhe da auditoria sai do que o dominio MUDOU, e nao do
     que veio no corpo: o corpo traz a tela inteira, a maioria igual ao que ja
     estava — o que interessa registrar e so a diferenca. */
  {metodo:'PUT', caminho:'/api/sobras/:id', permissao:'sobra.corrigir',
   manipulador:({params,corpo,usuario})=>sobra.corrigir(params.id,corpo,usuario.nome),
   detalhe:(req,d)=>'correcao da sobra '+(d&&d.codigo)+
     (d&&d.mudancas&&d.mudancas.length
       ? ': '+d.mudancas.map(m=>m.campo+' '+m.de+' → '+m.para).join(' · ')
       : ' (nada mudou)')},

  {metodo:'GET', caminho:'/api/sobras/:id/correcoes', permissao:'sobra.ler',
   manipulador:({params})=>sobra.correcoes(params.id)},

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

  /* AS MEDIDAS DA ETIQUETA, como estao cadastradas agora.
     A tela le isto para escrever ao lado do botao o que vai sair, e para
     DESABILITAR o botao quando os numeros nao fecham. Sem isso, o operador
     clicaria em imprimir e abriria uma aba com o JSON do erro na cara —
     tecnicamente correto, e inutil para quem esta na bancada. */
  {metodo:'GET', caminho:'/api/etiquetas/medidas', permissao:'etiqueta.imprimir',
   manipulador:()=>{
     const m=pdf.medidas();
     const v=pdf.conferir(m);
     return {...m, cabe:v.cabe, sobra_mm:Math.round(v.sobra*100)/100,
             recado:v.cabe?null:v.recado};
   }},

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
