// O plano de corte. Repare que CALCULAR e CONFIRMAR sao permissoes
// diferentes: propor um corte e barato, baixar o estoque nao e.
const plano=require('../dominio/plano');
const etiquetaCorte=require('../dominio/etiqueta_corte');
const dTecido=require('../dados/tecido');

module.exports={rotas:[
  {metodo:'POST', caminho:'/api/planos/calcular', permissao:'plano.calcular',
   manipulador:({corpo})=>plano.calcular(corpo)},

  {metodo:'POST', caminho:'/api/planos/recusar', permissao:'plano.calcular',
   manipulador:({corpo,usuario})=>plano.recusar(corpo,usuario.nome),
   detalhe:(req)=>'recusou a sobra '+req.body.sobra_id+' (motivo '+req.body.motivo_id+')'},

  {metodo:'POST', caminho:'/api/planos/confirmar', permissao:'plano.confirmar',
   manipulador:({corpo,usuario})=>plano.confirmar(corpo,usuario.nome),
   detalhe:(req,d)=>'plano '+(d&&d.plano_id)+' confirmado · '+(d&&d.consumo_linear)+' m · '+
     (d&&d.sobras_criadas)+' sobra(s) nova(s)'},

  {metodo:'GET', caminho:'/api/planos', permissao:'plano.calcular',
   manipulador:({query})=>plano.historico(query.limite)},

  // Le o PDF de etiquetas de producao e devolve as pecas para a MESMA grade
  // da digitacao — editaveis antes de calcular. O arquivo acelera a tela;
  // nao substitui o lancamento manual, que continua sempre disponivel.
  {metodo:'POST', caminho:'/api/planos/ler-arquivo', permissao:'plano.calcular',
   manipulador:({corpo})=>{
     const dados=String(corpo.arquivo||'').replace(/^data:[^,]*,/,'');
     const pecas=etiquetaCorte.lerPecas(Buffer.from(dados,'base64'));
     const tecidos=dTecido.listar();
     return pecas.map(p=>{
       const t=etiquetaCorte.casarTecido(p.tecido_texto||p.produto,tecidos);
       return {...p, tecido_id:t?t.id:null,
         tecido_sugerido:t?[t.linha_nome,t.abertura_nome,t.cor_nome].join(' · '):null};
     });
   },
   detalhe:(req,d)=>'leu '+(d?d.length:0)+' peca(s) do arquivo'}
]};
