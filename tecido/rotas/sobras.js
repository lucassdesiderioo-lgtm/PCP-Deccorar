// Sobras e etiquetas. Repare em quem pede o que:
//   sobra.criar      cortador tem  — e ele que cataloga a prateleira
//   sobra.propor     cortador tem  — aponta o erro; nao muda nada sozinho
//   sobra.corrigir   cortador NAO tem — a chefia corrige, e aceita ou recusa o apontado
//   sobra.descartar  cortador NAO tem — baixa de sobra e da chefia
const sobra=require('../dominio/sobra');
const etiqueta=require('../dominio/etiqueta');
const pdf=require('../dominio/etiqueta_pdf');
const custo=require('../dominio/custo');

/* A PODA DO PRECO ACONTECE NA ROTA, e nao na tela — a mesma dos rolos, pela
   mesma regra (custo.js, regra 4): quem nao tem custo.ver recebe o JSON SEM
   preco_m2 e valor. A bancada precisa saber o que a sobra e e onde esta;
   quanto ela vale e outra conversa. */
const podar=custo.podar;

module.exports={rotas:[
  {metodo:'GET', caminho:'/api/sobras', permissao:'sobra.ler',
   manipulador:({query,usuario})=>podar(usuario,sobra.listar(query))},

  {metodo:'GET', caminho:'/api/sobras/resumo', permissao:'sobra.ler',
   manipulador:({usuario})=>podar(usuario,sobra.resumo())},

  {metodo:'GET', caminho:'/api/sobras/codigo/:codigo', permissao:'sobra.ler',
   manipulador:({params,usuario})=>podar(usuario,sobra.porCodigo(params.codigo)||null)},

  {metodo:'POST', caminho:'/api/sobras', permissao:'sobra.criar',
   manipulador:({corpo,usuario})=>podar(usuario,sobra.criar(corpo,usuario.nome)),
   detalhe:(req,d)=>'sobra '+(d&&d.codigo)+' '+(d&&d.largura)+'x'+(d&&d.altura)},

  /* O PRECO DO M² DE UM TECIDO, nas sobras que ainda nao tem. Chefia
     (sobra.corrigir) — e a tela so mostra o botao a quem tambem ve custo. A
     auditoria registra o preco e QUAIS sobras receberam: e valor de acervo
     mudando de uma vez. */
  {metodo:'POST', caminho:'/api/sobras/precificar', permissao:'sobra.corrigir',
   manipulador:({corpo,usuario})=>sobra.precificar(corpo.tecido_id,corpo.preco_m2,
     {substituir:!!corpo.substituir},usuario.nome),
   detalhe:(req,d)=>d?'preco R$ '+d.preco_m2+'/m² em '+d.sobras+' sobra(s) de '+d.tecido+
     (d.sobras?': '+d.codigos.join(', '):'')+(req.body.substituir?' (substituindo)':''):null},

  /* A CORRECAO. O detalhe da auditoria sai do que o dominio MUDOU, e nao do
     que veio no corpo: o corpo traz a tela inteira, a maioria igual ao que ja
     estava — o que interessa registrar e so a diferenca. */
  {metodo:'PUT', caminho:'/api/sobras/:id', permissao:'sobra.corrigir',
   manipulador:({params,corpo,usuario})=>podar(usuario,sobra.corrigir(params.id,corpo,usuario.nome)),
   detalhe:(req,d)=>'correcao da sobra '+(d&&d.codigo)+
     (d&&d.mudancas&&d.mudancas.length
       ? ': '+d.mudancas.map(m=>m.campo+' '+m.de+' → '+m.para).join(' · ')
       : ' (nada mudou)')},

  /* O historico carrega o preco em `de`/`para` — chaves que a poda por nome
     nao pega. Para quem nao ve custo, a linha de preco sai INTEIRA: uma linha
     "preco: — → —" diria que houve preco, e isso ja e informacao comercial. */
  {metodo:'GET', caminho:'/api/sobras/:id/correcoes', permissao:'sobra.ler',
   manipulador:({params,usuario})=>{
     const h=sobra.correcoes(params.id);
     return custo.veComercial(usuario)?h:h.filter(c=>c.campo!=='preco');
   }},

  // ── A bancada aponta, a chefia decide ──────────────────────────────────
  /* A LISTA DO QUE ESPERA DECISAO e da chefia. Nao ha GET '/api/sobras/:id'
     neste arquivo, entao 'propostas' nao e engolido como id; se um dia
     alguem criar esse GET, ele tem que entrar DEPOIS desta linha — o Express
     casa por ordem. */
  {metodo:'GET', caminho:'/api/sobras/propostas', permissao:'sobra.corrigir',
   manipulador:({query})=>sobra.propostas({status:query.status||'pendente'})},

  // Os apontamentos DE UMA sobra, em qualquer estado: e aqui que a bancada
  // le se o que apontou foi aceito ou recusado, e por que.
  {metodo:'GET', caminho:'/api/sobras/:id/propostas', permissao:'sobra.ler',
   manipulador:({params})=>sobra.propostas({sobra_id:params.id})},

  {metodo:'POST', caminho:'/api/sobras/:id/propostas', permissao:'sobra.propor',
   manipulador:({params,corpo,usuario})=>sobra.propor(params.id,corpo,usuario.nome),
   detalhe:(req,d)=>'apontamento na sobra '+(d&&d.sobra_codigo)+': '+
     (d?d.itens.map(m=>m.campo+' '+m.de+' → '+m.para).join(' · '):'')+
     (d&&d.motivo?' ("'+d.motivo+'")':'')},

  {metodo:'POST', caminho:'/api/sobras/propostas/:id/aceitar', permissao:'sobra.corrigir',
   manipulador:({params,usuario})=>podar(usuario,sobra.aceitar(params.id,usuario.nome)),
   detalhe:(req,d)=>'aceitou apontamento '+req.params.id+' da sobra '+(d&&d.sobra&&d.sobra.codigo)+
     (d&&d.mudancas&&d.mudancas.length
       ? ': '+d.mudancas.map(m=>m.campo+' '+m.de+' → '+m.para).join(' · ')
       : ' (a sobra ja estava assim)')},

  {metodo:'POST', caminho:'/api/sobras/propostas/:id/recusar', permissao:'sobra.corrigir',
   manipulador:({params,corpo,usuario})=>sobra.recusar(params.id,corpo.motivo,usuario.nome),
   detalhe:(req,d)=>'recusou apontamento '+req.params.id+' da sobra '+(d&&d.sobra_codigo)+': '+(req.body.motivo||'')},

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
