// As rotas da producao bipada (secao 4.15). Sem SQL e sem 'if' de negocio —
// cada manipulador so traduz o pedido HTTP numa chamada do dominio.
//
// ⚠️ TODAS PEDEM `producao.bipar`, MENOS O FECHAMENTO DE PENDENCIA. Bipar e
// dizer "eu fiz"; fechar pendencia e dizer "alguem fez e nao bipou", e quem
// responde por isso e a chefia. Se a bancada pudesse fechar a propria, a
// trava deixaria de existir: bastaria fechar tudo e seguir.
const prod=require('../dominio/producao');

const BIPAR='producao.bipar', PENDENCIA='producao.pendencia';

module.exports={rotas:[

  /* A fila desta bancada. O setor vem no caminho e nao na sessao de
     proposito: quem tem duas areas de setor (§19 — papel e setores sao duas
     contas) troca de bancada sem sair e sem entrar de novo. */
  {metodo:'GET', caminho:'/api/producao/fila/:setor', permissao:BIPAR,
   manipulador:({params,usuario})=>prod.fila(params.setor,usuario)},

  /* O BIPE. Um so, e ele decide: o primeiro inicia, o segundo termina. Dois
     botoes seriam uma escolha a mais para quem esta de luva, e a escolha
     errada e trabalho perdido. */
  {metodo:'POST', caminho:'/api/producao/bipe', permissao:BIPAR,
   manipulador:({corpo,usuario})=>prod.bipar(corpo.codigo,usuario),
   detalhe:(req)=>'bipe '+(req.body&&req.body.codigo)},

  /* O KIT — o terceiro bipe da embalagem. A trava mora AQUI e nao na tela: o
     "⚠ FALTOU O KIT" que so existe no navegador nao protege quem chama a
     rota por fora, e e a licao do `kit_ok` da armadilha #26 do PCP. */
  {metodo:'POST', caminho:'/api/producao/kit', permissao:BIPAR,
   manipulador:({corpo,usuario})=>prod.biparKit(corpo.codigo,corpo.kit,usuario),
   detalhe:(req)=>'kit da peca '+(req.body&&req.body.codigo)},

  /* O que segura uma peca, sem precisar provocar o erro para descobrir. E a
     mesma conta da recusa — uma segunda aqui divergiria no dia em que a
     liberacao mudasse, e a tela passaria a explicar uma regra que nao e a
     que trava. */
  {metodo:'GET', caminho:'/api/producao/segura/:codigo', permissao:BIPAR,
   manipulador:({params})=>prod.oQueSegura(params.codigo)},

  /* ── A RECUSA (fase 5-B2, secao 4.16) ───────────────────────────────────
     ⚠️ OS MOTIVOS SAEM POR AQUI, e nao por /api/cadastros. Mandar quem so
     bipa na tela de cadastros daria a ela a lista inteira de tecido,
     endereco e motivo de sobra para responder uma pergunta de tres palavras
     — e a licao da porta das cores da fase 3. */
  /* ⚠️ A LISTA E SEMPRE DE UMA PECA, e por isso o codigo vem no caminho e
     nao e opcional. Uma rota que devolve ora o cadastro inteiro, ora o
     recorte da peca, e duas respostas na mesma porta — e a tela acabaria
     oferecendo o motivo que a rota vai recusar. */
  {metodo:'GET', caminho:'/api/producao/motivos/:codigo', permissao:BIPAR,
   manipulador:({params})=>prod.motivos(params.codigo)},

  /* ⚠️ RECUSAR E `producao.bipar`, e nao chave da chefia. A spec diz, com
     todas as letras, que QUALQUER setor pode recusar a peca por defeito do
     trabalho anterior — quem esta com a peca na mao e a bancada. O que
     impede o abuso nao e permissao, e o rastro: cada recusa grava quem
     recusou, de que bancada, o motivo e quem tinha feito. */
  {metodo:'POST', caminho:'/api/producao/recusa', permissao:BIPAR,
   manipulador:({corpo,usuario})=>prod.recusar(corpo.codigo,corpo,usuario),
   detalhe:(req,dados)=>'recusou '+(req.body&&req.body.codigo)+
     ' — volta '+((dados&&dados.culpado&&dados.culpado.codigo)||'?')+
     ': '+((dados&&dados.motivo)||'')},

  /* AS PECAS A REFAZER. A chave e a do PAPEL (`etiqueta_producao.ler`) e nao
     a do bipe: este card e da tela de producao, de quem esta na Zebra. */
  {metodo:'GET', caminho:'/api/producao/refazer', permissao:'etiqueta_producao.ler',
   manipulador:()=>prod.aRefazer()},

  {metodo:'POST', caminho:'/api/producao/pendencia', permissao:PENDENCIA,
   manipulador:({corpo,usuario})=>prod.fecharPendencia(corpo.codigo,corpo,usuario),
   detalhe:(req)=>'fechou a pendencia de '+(req.body&&req.body.codigo)+
     ': '+(req.body&&req.body.motivo)}

]};
