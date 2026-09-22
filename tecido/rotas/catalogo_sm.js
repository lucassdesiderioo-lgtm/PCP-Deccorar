// Declaracoes das rotas do catalogo do sob medida e do simulador.
// Sem SQL e sem 'if' de negocio: cada manipulador so traduz o pedido HTTP
// numa chamada do dominio.
const catalogo=require('../dominio/catalogo_sm');
const persiana=require('../dominio/persiana');
/* ⚠️ A PODA DE DINHEIRO E A MESMA DO RESTO DO MODULO, e nao uma nova.
   `custo.podar` corta por PADRAO DE NOME (custo.eDinheiro), porque a defesa
   anterior era uma lista literal e ela envelheceu em uma semana — o painel
   gerencial nasceu com `resumo.valor_parado` fora dela e o numero passou a
   viajar pelo fio ate a bancada.
   Por isso todo campo de dinheiro daqui se chama `preco_*` ou `valor_*`: um
   `total_centavos` NAO casaria com o padrao e vazaria em silencio. */
const custo=require('../dominio/custo');

const LER='catalogo.ler', EDITAR='catalogo.editar';

module.exports={rotas:[

  // ── Catalogo ────────────────────────────────────────────────────────────
  {metodo:'GET', caminho:'/api/sm/modelos', permissao:LER,
   manipulador:({usuario})=>custo.podar(usuario,catalogo.listarModelos())},
  {metodo:'GET', caminho:'/api/sm/modelos/:id', permissao:LER,
   manipulador:({params,usuario})=>custo.podar(usuario,catalogo.modelo(params.id))},
  {metodo:'POST', caminho:'/api/sm/modelos', permissao:EDITAR,
   manipulador:({corpo,usuario})=>catalogo.criarModelo(corpo,usuario),
   detalhe:(req)=>'modelo '+req.body.nome},

  // ── Colecoes de venda ───────────────────────────────────────────────────
  {metodo:'POST', caminho:'/api/sm/modelos/:id/colecoes', permissao:EDITAR,
   manipulador:({params,corpo,usuario})=>custo.podar(usuario,
     catalogo.ligarColecao(Object.assign({},corpo,{modelo_id:params.id}),usuario)),
   detalhe:(req,d)=>'ligou a colecao '+(d&&d.colecao_nome)},
  {metodo:'PUT', caminho:'/api/sm/colecoes/:id', permissao:EDITAR,
   manipulador:({params,corpo,usuario})=>custo.podar(usuario,catalogo.editarColecao(params.id,corpo)),
   detalhe:(req,d)=>'colecao '+(d&&d.colecao_nome)},
  /* O PRECO TEM PORTA PROPRIA, com historico de quem mudou e de quanto para
     quanto — o `editarColecao` recusa o campo de proposito. Duas portas de
     escrita no mesmo numero e a armadilha #12. */
  {metodo:'PUT', caminho:'/api/sm/colecoes/:id/preco', permissao:EDITAR,
   manipulador:({params,corpo,usuario})=>custo.podar(usuario,
     catalogo.definirPrecoColecao(params.id,corpo.preco_m2_centavos,usuario)),
   detalhe:(req,d)=>d?('preco do m² de '+d.colecao_nome+': '+
     (d.mudou?((d.preco_anterior==null?'sem preco':d.preco_anterior)+' → '+d.preco_m2_centavos+' centavos')
             :'sem mudanca')):null},
  {metodo:'GET', caminho:'/api/sm/colecoes/:id/preco/historico', permissao:'custo.ver',
   manipulador:({params})=>catalogo.historicoPreco('colecao',params.id)},

  {metodo:'POST', caminho:'/api/sm/modelos/:id/cores', permissao:EDITAR,
   manipulador:({params,corpo})=>catalogo.ligarCorAcessorio(
     Object.assign({},corpo,{modelo_id:params.id})),
   detalhe:(req,d)=>'cor de acessorio '+(d&&d.cor_nome)},

  // ── Componentes ─────────────────────────────────────────────────────────
  {metodo:'GET', caminho:'/api/sm/componentes', permissao:LER,
   manipulador:({usuario})=>custo.podar(usuario,catalogo.listarComponentes())},
  {metodo:'PUT', caminho:'/api/sm/componentes/:id/preco', permissao:EDITAR,
   manipulador:({params,corpo,usuario})=>custo.podar(usuario,
     catalogo.definirPrecoComponente(params.id,corpo.preco_centavos,usuario)),
   detalhe:(req,d)=>d?('preco de '+d.nome+': '+(d.mudou?
     ((d.preco_anterior==null?'sem preco':d.preco_anterior)+' → '+d.preco_centavos+' centavos')
     :'sem mudanca')):null},
  {metodo:'GET', caminho:'/api/sm/componentes/:id/preco/historico', permissao:'custo.ver',
   manipulador:({params})=>catalogo.historicoPreco('componente',params.id)},

  // ── Escada de tubos ─────────────────────────────────────────────────────
  {metodo:'POST', caminho:'/api/sm/modelos/:id/degraus', permissao:EDITAR,
   manipulador:({params,corpo})=>catalogo.criarDegrau(Object.assign({},corpo,{modelo_id:params.id})),
   detalhe:(req)=>'degrau '+req.body.nome},
  {metodo:'PUT', caminho:'/api/sm/degraus/:id', permissao:EDITAR,
   manipulador:({params,corpo})=>catalogo.editarDegrau(params.id,corpo),
   detalhe:(req,d)=>'degrau '+(d&&d.nome)},

  // ── Ficha tecnica ───────────────────────────────────────────────────────
  {metodo:'POST', caminho:'/api/sm/modelos/:id/ficha', permissao:EDITAR,
   manipulador:({params,corpo})=>catalogo.criarFichaLinha(Object.assign({},corpo,{modelo_id:params.id})),
   detalhe:(req)=>'linha de ficha '+(req.body.componente||req.body.componente_id)},
  {metodo:'PUT', caminho:'/api/sm/ficha/:id', permissao:EDITAR,
   manipulador:({params,corpo})=>catalogo.editarFichaLinha(params.id,corpo),
   detalhe:(req,d)=>'linha de ficha '+(d&&d.chave)},

  // ── Faixas de suporte e regra da reducao ────────────────────────────────
  {metodo:'POST', caminho:'/api/sm/modelos/:id/faixas', permissao:EDITAR,
   manipulador:({params,corpo})=>catalogo.criarFaixaSuporte(
     Object.assign({},corpo,{modelo_id:params.id})),
   detalhe:(req)=>'faixa de suporte ate '+req.body.largura_max_mm+' mm'},
  {metodo:'DELETE', caminho:'/api/sm/faixas/:id', permissao:EDITAR,
   manipulador:({params})=>catalogo.apagarFaixaSuporte(params.id),
   detalhe:(req)=>'apagou a faixa '+req.params.id},
  {metodo:'PUT', caminho:'/api/sm/modelos/:id/reducao', permissao:EDITAR,
   manipulador:({params,corpo})=>catalogo.definirReducaoRegra(
     Object.assign({},corpo,{modelo_id:params.id})),
   detalhe:(req)=>'regra da reducao de peso'},

  /* ── O SIMULADOR ────────────────────────────────────────────────────────
     POST, e nao GET, porque a escolha inteira vai no corpo — e porque este e
     o mesmo caminho que a fase 3 vai usar para montar o item do pedido.
     Ele NAO grava nada: simular e perguntar. */
  {metodo:'POST', caminho:'/api/sm/simular', permissao:LER,
   manipulador:({corpo,usuario})=>custo.podar(usuario,persiana.calcular(corpo))},

  /* ⚠️ AS CORES DE UMA COLECAO TEM PORTA PROPRIA, e nao e duplicacao do
     cadastro de tecido. O pedido (fase 3) EXIGE a cor do tecido — e ela que
     diz qual rolo sai da prateleira —, e quem lanca pedido e o vendedor, que
     nao tem `cadastro.ler`. Mandar ele buscar em /api/cadastros daria a ele
     a lista inteira de tecido, endereco e motivo de sobra para responder uma
     pergunta de tres palavras; sem porta nenhuma, a tela abriria o seletor
     vazio com 403 no console, que nao se parece com "falta permissao".

     ⚠️ E SO SAI COR QUE TEM ITEM DE TECIDO CADASTRADO. Cor sem item nao
     aparece em tela nenhuma do modulo e o corte nao a encontra — oferecê-la
     aqui poria no pedido uma escolha que a bancada nao consegue cumprir, e a
     descoberta seria na hora de cortar. */
  {metodo:'GET', caminho:'/api/sm/colecoes/:id/cores', permissao:LER,
   manipulador:({params,usuario})=>custo.podar(usuario,catalogo.coresDaColecao(params.id))}
]};
