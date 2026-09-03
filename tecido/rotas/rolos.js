// Rolo: entrada, saldo, ajuste e o acerto no fim.
const rolo=require('../dominio/rolo');
const tecido=require('../dominio/tecido');
const pdf=require('../dominio/etiqueta_pdf');
const dia=require('../nucleo/dia');

module.exports={rotas:[
  {metodo:'GET', caminho:'/api/rolos', permissao:'rolo.ler',
   manipulador:({query})=>rolo.listar(query)},

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

  {metodo:'POST', caminho:'/api/rolos/:id/encerrar', permissao:'rolo.encerrar',
   manipulador:({params,usuario})=>rolo.encerrar(params.id,usuario.nome),
   detalhe:(req)=>'rolo acabou: '+req.params.id},

  {metodo:'POST', caminho:'/api/rolos/:id/ajustar', permissao:'rolo.ajustar',
   manipulador:({params,corpo,usuario})=>rolo.ajustar(params.id,corpo.saldo,corpo.observacao,usuario.nome),
   detalhe:(req)=>'ajuste do rolo '+req.params.id+' para '+req.body.saldo+' m: '+(req.body.observacao||'')}
]};
