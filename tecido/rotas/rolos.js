// Rolo: entrada, saldo, ajuste e o acerto no fim.
const rolo=require('../dominio/rolo');
const tecido=require('../dominio/tecido');
const custo=require('../dominio/custo');
const pdf=require('../dominio/etiqueta_pdf');
const dia=require('../nucleo/dia');
const {pode}=require('../nucleo/permissoes');

/* A PODA DO PRECO ACONTECE NA ROTA, e nao na tela. Quem nao tem custo.ver
   recebe o JSON SEM os campos de preco — esconder no navegador deixaria o
   numero viajando pelo fio, ao alcance de qualquer um que abrisse a aba de
   rede. Regra 14 do CLAUDE.md §13, e a mesma do Recebimento no PCP. */
/* Ve dado comercial quem TEM CUSTO ou LANCA NOTA — os dois precisam, por
   motivos diferentes: um decide compra, o outro digita o papel. Testar so
   `custo.ver` deixaria quem lanca a nota sem enxergar a nota que acabou de
   lancar. */
const veComercial=u=>pode(u,'custo.ver')||pode(u,'rolo.nota');
const podar=(usuario,dados)=>veComercial(usuario)?dados:custo.semPreco(dados);

module.exports={rotas:[
  {metodo:'GET', caminho:'/api/rolos', permissao:'rolo.ler',
   manipulador:({query,usuario})=>podar(usuario,rolo.listar(query))},

  /* O PAINEL DO DINHEIRO PARADO. Permissao custo.ver na propria rota: aqui
     nao ha o que podar, a rota INTEIRA e sobre preco. */
  {metodo:'GET', caminho:'/api/rolos/valor', permissao:'custo.ver',
   manipulador:()=>custo.painel()},

  /* OS ROLOS SEM NOTA. Sem esta lista, "a nota chega depois" vira "a nota
     nunca chega" — a mesma licao da lista Conferir (armadilha #14). */
  {metodo:'GET', caminho:'/api/rolos/sem-nota', permissao:'rolo.nota',
   manipulador:()=>custo.semNota()},

  /* O PRECO QUE PRE-PREENCHE A ENTRADA: o ULTIMO REALMENTE PAGO daquele
     fornecedor naquele tecido. Nao ha tabela de preco — ela envelheceria
     calada, e o numero ficaria la parecendo atual. */
  {metodo:'GET', caminho:'/api/rolos/ultimo-preco', permissao:'custo.ver',
   manipulador:({query})=>custo.ultimoPreco(query.tecido_id,query.fornecedor_id)},

  {metodo:'GET', caminho:'/api/rolos/saldo', permissao:'rolo.ler',
   manipulador:()=>rolo.saldoPorTecido()},

  {metodo:'GET', caminho:'/api/rolos/:id/movimentos', permissao:'rolo.ler',
   manipulador:({params})=>rolo.movimentos(params.id)},

  {metodo:'POST', caminho:'/api/rolos', permissao:'rolo.entrada',
   manipulador:({corpo,usuario})=>rolo.entrada(corpo,usuario.nome),
   detalhe:(req,d)=>'entrada '+(d&&d.codigo)+' · '+(d&&d.metragem_inicial)+' m · bobina '+(d&&d.largura)},

  /* MUDOU DE LUGAR NA ESTANTE. Permissao 'rolo.entrada' — quem poe rolo na
     prateleira e quem o tira dela; exigir chave de chefia para arrumar a
     estante faria a bancada mover o tubo e nao avisar, que e exatamente o
     que a trava vinha evitar. Quem moveu sai da SESSAO, nunca de um campo. */
  {metodo:'POST', caminho:'/api/rolos/:id/mover', permissao:'rolo.entrada',
   manipulador:({params,corpo,usuario})=>rolo.mover(params.id,corpo.nivel_id,usuario.nome),
   detalhe:(req,d)=>'moveu o rolo '+req.params.id+' de lugar'},

  /* A ETIQUETA DO TUBO. GET porque e leitura — imprimir de novo nao muda
     nada no estoque, e etiqueta que descola precisa sair outra vez sem
     ninguem pedir permissao. */
  {metodo:'GET', caminho:'/api/rolos/:id/etiqueta', permissao:'rolo.ler',
   tipo:'pdf',
   manipulador:async ({params})=>{
     const r=rolo.porId(params.id);
     if(!r) throw new (require('../nucleo/erros').ErroDeRegra)('rolo_inexistente','Rolo nao encontrado.');
     const arquivo=await pdf.gerarRolo([{
       codigo:r.codigo, largura:r.largura, saldo:r.saldo,
       tecido:tecido.descrever(r),
       impresso_em:dia.hoje()
     }]);
     return {arquivo, nome:'rolo-'+r.codigo+'.pdf'};
   },
   detalhe:(req)=>'etiqueta do rolo '+req.params.id},

  /* LANCAR A NOTA DEPOIS — o caso normal. O rolo desce do caminhao e vai para
     a estante; a nota entra dias depois. Permissao propria (`rolo.nota`)
     porque mexer no preco muda o valor do estoque: e trabalho de quem fecha
     compras, nao de quem poe o tubo na prateleira. */
  {metodo:'PUT', caminho:'/api/rolos/:id/dados', permissao:'rolo.nota',
   manipulador:({params,corpo,usuario})=>rolo.editarDados(params.id,corpo,usuario.nome),
   detalhe:(req)=>'nota do rolo '+req.params.id+': NF '+(req.body.nf||'—')+
     ' · R$/m² '+(req.body.preco_m2==null?'—':req.body.preco_m2)},

  {metodo:'POST', caminho:'/api/rolos/:id/encerrar', permissao:'rolo.encerrar',
   manipulador:({params,usuario})=>rolo.encerrar(params.id,usuario.nome),
   detalhe:(req)=>'rolo acabou: '+req.params.id},

  {metodo:'POST', caminho:'/api/rolos/:id/ajustar', permissao:'rolo.ajustar',
   manipulador:({params,corpo,usuario})=>rolo.ajustar(params.id,corpo.saldo,corpo.observacao,usuario.nome),
   detalhe:(req)=>'ajuste do rolo '+req.params.id+' para '+req.body.saldo+' m: '+(req.body.observacao||'')}
]};
