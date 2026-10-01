// O plano de corte. Repare que CALCULAR e CONFIRMAR sao permissoes
// diferentes: propor um corte e barato, baixar o estoque nao e.
const plano=require('../dominio/plano');
const historico=require('../dominio/corte_historico');
const corte=require('../dominio/corte');
const {pode}=require('../nucleo/permissoes');
// O corte aberto e de quem o abriu; a chefia mexe em qualquer um.
const op=u=>({gerir:pode(u,'corte.gerir')});
const etiquetaCorte=require('../dominio/etiqueta_corte');
const dTecido=require('../dados/tecido');

module.exports={rotas:[
  {metodo:'POST', caminho:'/api/planos/calcular', permissao:'plano.calcular',
   manipulador:({corpo})=>plano.calcular(corpo)},

  {metodo:'POST', caminho:'/api/planos/recusar', permissao:'plano.calcular',
   manipulador:({corpo,usuario})=>plano.recusar(corpo,usuario.nome),
   detalhe:(req)=>'recusou a sobra '+req.body.sobra_id+' (motivo '+req.body.motivo_id+')'},

  /* ── O CORTE EM ETAPAS (spec CORTE-EM-ETAPAS, fase 2) ───────────────────
     O Confirmar grava e reserva; quem baixa e o Corte feito. As cinco portas
     tem a MESMA chave de antes (`plano.confirmar`), e o dono de cada corte e
     conferido no dominio — quem nao e o dono precisa de `corte.gerir`. */
  {metodo:'POST', caminho:'/api/planos/confirmar', permissao:'plano.confirmar',
   manipulador:({corpo,usuario})=>corte.confirmar(corpo,usuario.nome),
   detalhe:(req,d)=>'corte '+(d&&d.plano_id)+' confirmado (nada baixou) · '+(d&&d.consumo_linear)+' m reservados'},
  {metodo:'POST', caminho:'/api/planos/:id/voltar', permissao:'plano.confirmar',
   manipulador:({params,usuario})=>corte.voltar(params.id,usuario.nome,op(usuario)),
   detalhe:req=>'corte '+req.params.id+' apagado antes de cortar (voltou ao plano)'},
  {metodo:'POST', caminho:'/api/planos/:id/cortar', permissao:'plano.confirmar',
   manipulador:({params,usuario})=>corte.cortar(params.id,usuario.nome,op(usuario)),
   detalhe:req=>'corte '+req.params.id+' comecou a ser cortado'},
  {metodo:'POST', caminho:'/api/planos/:id/cancelar', permissao:'plano.confirmar',
   manipulador:({params,corpo,usuario})=>corte.cancelar(params.id,corpo.motivo,usuario.nome,op(usuario)),
   detalhe:req=>'corte '+req.params.id+' cancelado: '+String(req.body.motivo||'').slice(0,120)},
  {metodo:'POST', caminho:'/api/planos/:id/feito', permissao:'plano.confirmar',
   manipulador:({params,usuario})=>corte.feito(params.id,usuario.nome,op(usuario)),
   detalhe:(req,d)=>'corte '+req.params.id+' feito · '+(d&&d.consumo_linear)+' m do rolo · '+
     (d&&d.sobras_a_guardar)+' sobra(s) a guardar'},

  /* O corte aberto de quem pergunta, e as sobras a guardar dele. A tela de
     corte abre DIRETO nele: o tablet que recarregou no meio do corte nao pode
     cair na tela de planejar. Vem ANTES de /api/planos/:id — senao "aberto"
     seria lido como numero de corte. */
  {metodo:'GET', caminho:'/api/planos/aberto', permissao:'plano.calcular',
   manipulador:({usuario})=>{
     const gerir=pode(usuario,'corte.gerir');
     return {corte:corte.aberto(usuario.nome), a_guardar:corte.aGuardar({usuarioNome:usuario.nome}),
       todas:gerir?corte.aGuardar({todas:true}):null, gerir};
   }},
  {metodo:'POST', caminho:'/api/sobras-a-guardar/:id/guardar', permissao:'sobra.criar',
   manipulador:({params,corpo,usuario})=>corte.guardar(params.id,corpo,usuario.nome,op(usuario)),
   detalhe:(req,d)=>'guardou a sobra '+(d&&d.sobra&&d.sobra.codigo)+' (a guardar '+req.params.id+')'+
     (d&&d.medida_mudou?' — a medida da fita diferiu da calculada':'')},



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
   detalhe:(req,d)=>'leu '+(d?d.length:0)+' peca(s) do arquivo'},

  /* O HISTORICO DE CORTES (spec CORTE-EM-ETAPAS, fase 1). A mesma chave de
     quem abre a tela de corte: e la que o historico mora, e quem cortou e
     quem precisa rever o proprio corte. Chave nova seria a terceira ponta da
     armadilha #13 sem precisar. */
  {metodo:'GET', caminho:'/api/planos', permissao:'plano.calcular',
   manipulador:({query})=>historico.listar(query)},
  {metodo:'GET', caminho:'/api/planos/:id', permissao:'plano.calcular',
   manipulador:({params})=>historico.detalhe(params.id)}
]};
