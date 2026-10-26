// Permissao por CHAVE, nao por cargo espalhado em if. O papel e so um atalho
// que agrupa chaves — o dia em que "cortador chefe" existir, e uma linha aqui.
//
// A chave que interessa hoje: sobra.descartar NAO esta no cortador. Baixa de
// sobra sem trava e o furo classico de inventario, e a decisao do dono foi
// "so a chefia".
//
// NAO HA CHAVE DE "gerenciar pessoas" aqui, e e de proposito: quem entra e
// decidido por area no PCP (Admin -> Acessos). Uma chave sem tela por tras
// mente para quem le a lista de permissoes do papel.
const CHAVES=[
  /* ⚠️ A CHAVE DE ENTRAR, e ela nasceu de um defeito evitado na fase 2.
     A tela inicial e o /api/eu pediam `cadastro.ler` "porque e a chave mais
     baixa que todo mundo que entra tem". Isso era verdade enquanto havia dois
     papeis; com o VENDEDOR passou a ser mentira, e o efeito seria o pior
     possivel: ou ele abriria o modulo em branco, com 403 no console, ou
     ganharia `cadastro.ler` de carona — e com ela a lista inteira de tecido,
     endereco e motivo, que nao e o que ele precisa para simular uma persiana.
     E a armadilha #29 do CLAUDE.md pela porta de dentro: tela em branco nao
     se parece nem de longe com "mexeram na permissao". */
  {chave:'modulo.entrar',     nome:'Entrar no sob medida (tela inicial e menu)'},
  {chave:'cadastro.ler',      nome:'Ver cadastros'},
  {chave:'cadastro.editar',   nome:'Editar cadastros (tecido, endereços, motivos)'},
  /* CRIAR ENDERECO E DA BANCADA TAMBEM, e nao e afrouxamento do cadastro.
     A prateleira ganha buraco novo no meio do dia, e quem esta com o tubo na
     mao e o operador. Sem esta chave ele nao espera a chefia — ele deixa o
     rolo sem endereco "para enderecar depois", e o depois nao existe: o tubo
     fica na estante sem ninguem saber onde.
     Renomear e apagar continuam com a chefia (cadastro.editar): criar e
     necessidade fisica com pressa, arrumar nao e. */
  {chave:'endereco.criar',    nome:'Criar haste, andar e nível na estante'},
  {chave:'parametro.ler',     nome:'Ver parâmetros'},
  {chave:'parametro.editar',  nome:'Editar parâmetros do cálculo'},
  {chave:'sobra.ler',         nome:'Ver sobras'},
  {chave:'sobra.criar',       nome:'Cadastrar sobra (mutirão e corte)'},
  /* CORRIGIR E DA CHEFIA, por decisao do dono (05/09/2026): e ela que aceita
     a correcao. A sobra lancada com o tecido errado muda de prateleira no
     sistema — o plano de corte passa a oferece-la para OUTRA cor —, e isso e
     o tipo de mexida que se quer com alguem olhando. Cada campo corrigido
     deixa linha de historico com quem e quando. A bancada ve a sobra marcada
     como "corrigida" e o historico, mas nao ve o botao. */
  {chave:'sobra.corrigir',    nome:'Corrigir sobra lançada errada, e aceitar ou recusar o que a bancada apontou'},
  /* APONTAR E DA BANCADA. Quem percebe o erro esta com o retalho na mao; se
     nao tem onde registrar, o erro fica na cabeca dela ate a chefia passar
     por ali — dado na memoria em vez de no sistema, a doenca de sempre. O
     apontamento nao muda a sobra: vira correcao so quando a chefia aceita. */
  {chave:'sobra.propor',      nome:'Propor correção de sobra'},
  {chave:'sobra.descartar',   nome:'Pedir o descarte de sobra'},
  // E aprovar o descarte e de outra pessoa (fase 6, mesma razao da baixa).
  {chave:'sobra.aprovar_descarte', nome:'Aprovar o descarte de sobra pedido por outra pessoa'},
  {chave:'etiqueta.imprimir', nome:'Imprimir lote de etiquetas de sobra'},
  /* VER PRECO E CHAVE SEPARADA, e quem nao tem NAO RECEBE OS CAMPOS — o JSON
     sai sem eles. Nao adianta esconder na tela e mandar pelo fio (regra 14 do
     CLAUDE.md §13). A bancada precisa saber onde o rolo esta e quanto ele
     tem; quanto ele custou e outra conversa. */
  {chave:'custo.ver',         nome:'Ver preço e valor do estoque'},
  {chave:'rolo.nota',         nome:'Lançar NF, fornecedor e preço do rolo'},
  {chave:'rolo.ler',          nome:'Ver rolos'},
  {chave:'rolo.entrada',      nome:'Entrada de rolo'},
  {chave:'rolo.encerrar',     nome:'Encerrar rolo (acerto de fim)'},
  {chave:'rolo.ajustar',      nome:'Ajustar saldo de rolo'},
  {chave:'plano.calcular',    nome:'Calcular plano de corte'},
  {chave:'plano.confirmar',   nome:'Confirmar, cortar e dar o Corte feito (o Corte feito baixa o estoque)'},
  /* ⚠️ A CHEFIA DO CORTE (spec CORTE-EM-ETAPAS, fase 2). O corte aberto e de
     quem o abriu: so ele corta, termina, cancela e guarda as sobras que
     nasceram. Esta chave e a de mexer no corte de OUTRA pessoa — o turno que
     acabou, o tablet que ficou com o corte aberto — e a de ver as pendencias
     de guardar sobra de TODO MUNDO (R15). Nao esta no cortador: e da chefia,
     que a recebe pelo `*` do diretor, entao ela nao nasce inerte. */
  {chave:'corte.gerir',       nome:'Mexer no corte aberto de outra pessoa e ver as sobras a guardar de todos'},
  /* ⚠️ PEDIR E APROVAR CORRECAO SAO DUAS CHAVES (R17). Depois do Corte feito
     o estoque ja andou, e corrigir mexe no saldo SEM corte na frente — o tipo
     de mexida que se quer com alguem olhando. Quem pede e a bancada, que viu
     o erro com a peca na mao; quem aprova e a chefia. E quem pediu nao aprova
     o proprio pedido, nem o diretor: e a regra da casa para ajuste de saldo
     (CLAUDE.md §18, ajuste em duas pessoas). */
  {chave:'corte.pedir_correcao',   nome:'Pedir correção de um corte já feito'},
  {chave:'corte.aprovar_correcao', nome:'Aprovar ou recusar correção de corte (mexe no saldo de rolo e sobra)'},
  {chave:'painel.ler',        nome:'Painel e relatórios'},

  /* ── O CATALOGO DO SOB MEDIDA (spec SOBMEDIDA-PEDIDO-REVENDA, fase 1) ────
     Duas chaves, e a divisao e a mesma de sempre: ver o catalogo e o que o
     simulador precisa; mexer nele muda o que a fabrica corta e o que o
     cliente paga.

     ⚠️ NENHUMA DAS DUAS ESTA NO CORTADOR, e isso e decisao da fase 1: o
     catalogo e o simulador sao escritorio (tela escura, muitos numeros), e
     na fase 1 quem usa e a equipe interna lancando os pedidos do WhatsApp.
     O papel proprio do VENDEDOR e da fase 2 — ate la ele entra pela area
     "Sob medida - cadastros" do PCP, que e mais larga do que precisa. Isso
     esta escrito aqui para nao se descobrir por acidente. */
  {chave:'catalogo.ler',      nome:'Ver o catálogo de venda e usar o simulador'},
  {chave:'catalogo.editar',   nome:'Editar modelo, coleções de venda, escada de tubos, ficha e preços'},

  /* ── QUEM COMPRA (spec SOBMEDIDA-PEDIDO-REVENDA, fase 2) ────────────────
     Tres chaves, e a divisao e por quanto custa errar.

     Ler a carteira e o que o vendedor faz o dia inteiro. Editar o cadastro
     decide a TABELA e o DESCONTO — ou seja, quanto aquela revenda paga em
     todo pedido daqui para a frente. E o limite de credito decide quanto ela
     pode dever.

     ⚠️ O VENDEDOR NAO RECEBE `revenda.editar` NEM `credito.editar`, e isso e
     decisao da fase 2, nao esquecimento. A spec diz que "a tabela e decidida
     pela Deccorar" (secao 4.12) e que o limite e revisto de dois em dois
     meses (4.13) — as duas sao decisao de quem responde pelo dinheiro, nao
     de quem vende. Custa isto, e esta escrito para nao se descobrir por
     acidente: revenda nova, troca de tabela, endereco de entrega novo e
     limite passam pela chefia. Alargar e uma linha aqui; o contrario, nao. */
  {chave:'revenda.ler',       nome:'Ver as revendas e a carteira'},
  {chave:'revenda.editar',    nome:'Cadastrar revenda, endereços, contatos, tabela e desconto'},
  {chave:'credito.editar',    nome:'Definir e revisar o limite de crédito da revenda'},

  /* ── O BOLETO (fase 6-C1, 26/09/2026) ──────────────────────────────────
     ⚠️ LER E EDITAR SAO DUAS CHAVES, e os publicos sao diferentes de
     verdade. A §4.13 da spec manda uma "tarefa semanal do vendedor com o
     financeiro: revisar os boletos em aberto da carteira" — entao o VENDEDOR
     le. Lancar o titulo e dar baixa e de quem responde pelo dinheiro, e e
     isso que decide o limite de todo mundo. E o mesmo arranjo do
     `kit.imprimir` x `kit.editar` do §4 do CLAUDE.md.

     ⚠️ E `boleto.editar` NAO ESTA EM PAPEL NENHUM: hoje quem lanca e baixa e
     o diretor, que a recebe pelo `*`. Nao ha papel "financeiro" no modulo, e
     inventar um exigiria area no PCP, linha no PERM_AREA e alguem marcado —
     as tres pontas da armadilha #13 — para uma caixinha que hoje ninguem
     marcaria. O dia em que houver financeiro com login proprio, a area nasce
     ali; ate la a chave tem dono, e nao nasce inerte. */
  {chave:'boleto.ler',        nome:'Ver os boletos em aberto e o crédito da revenda'},
  {chave:'boleto.editar',     nome:'Lançar boleto, pedir a baixa e cancelar título'},
  /* ⚠️ APROVAR A BAIXA E OUTRA CHAVE, e outra PESSOA (fase 6 da
     ACESSOS-UNIFICADOS, P2 do dono). Quem tem `boleto.editar` pede; quem
     tem esta aprova — e quem pediu nao aprova o proprio pedido, nem o Admin
     Geral (dominio/aprovacao.js). */
  {chave:'boleto.aprovar_baixa', nome:'Aprovar a baixa de boleto pedida por outra pessoa'},

  /* ── O PEDIDO (fase 3) ──────────────────────────────────────────────────
     Seis chaves, e a divisao e a de sempre: quanto custa errar.

     ⚠️ `pedido.aprovar` E `pedido.aprovar_qualquer` SAO DUAS COISAS, e essa e
     a linha que importa aqui. A primeira e "aprovo o que e da minha
     carteira"; a segunda e "aprovo a de qualquer um", e existe para a fila
     nao parar quando o vendedor esta de ferias. Uma chave so significaria
     escolher entre travar a fabrica numa semana de folga e deixar qualquer
     vendedor aprovar a revenda do colega — e a regra da secao 4.12 e que a
     carteira tem dono.

     ⚠️ `pedido.cancelar` NAO ESTA NO VENDEDOR, e nao e esquecimento. Cancelar
     um pedido aprovado e desfazer o que a fabrica ja viu; o vendedor negocia
     prazo (`pedido.prazo`) e lanca, mas desfazer e de quem responde pela
     casa. Alargar e uma linha aqui; o contrario, nao. */
  {chave:'pedido.ler',            nome:'Ver pedidos e orçamentos'},
  {chave:'pedido.lancar',         nome:'Lançar orçamento e pedido, editar e enviar'},
  {chave:'pedido.aprovar',        nome:'Aprovar pedido da propria carteira'},
  {chave:'pedido.aprovar_qualquer', nome:'Aprovar pedido de qualquer carteira'},
  {chave:'pedido.prazo',          nome:'Negociar o prazo de um pedido (com motivo)'},
  {chave:'pedido.cancelar',       nome:'Cancelar pedido ou peça de pedido'},

  /* ── A ETIQUETA DE PRODUCAO (fase 4-A) ──────────────────────────────────
     ⚠️ LER E IMPRIMIR SAO DUAS CHAVES, e a divisao e a do kit do PCP (§4):
     ver o que falta imprimir e leitura de trabalho; imprimir GASTA ROLO,
     marca a peca e — na reimpressao — cria a chance de duas etiquetas iguais
     em duas pecas. Quem imprime e quem esta com a Zebra na frente.

     ⚠️ E ELAS SAO DA BANCADA, nao do escritorio: o CORTADOR recebe as duas.
     Foi o contrario do pedido, que e escritorio inteiro — aqui quem precisa
     do papel e quem vai cortar, e mandar ele chamar alguem para imprimir e
     a trava que dispara no caso normal (armadilha #6). */
  {chave:'etiqueta_producao.ler',      nome:'Ver as etiquetas de produção a imprimir'},
  {chave:'etiqueta_producao.imprimir', nome:'Imprimir etiquetas de produção (gasta rolo e marca a peça)'},

  /* ── A BANCADA (fase 5-A, 24/09/2026) ─────────────────────────────────
     UMA chave, e nao cinco. A rota tem uma permissao declarada e o setor vem
     no corpo do bipe — conferir cinco chaves na rota seria conferir a
     pergunta errada. Esta chave diz "esta tela e sua"; QUAL bancada a pessoa
     bipa e outra pergunta, e quem responde e a lista de setores dela
     (nucleo/acesso.js → daSessaoDoPcp), conferida no dominio. */
  {chave:'producao.bipar',    nome:'Bipar início e fim na bancada da produção sob medida'},
  /* ⚠️ FECHAR PENDENCIA NAO E BIPAR, e por isso e chave separada (fase 5-B1).
     Bipar e dizer "eu fiz"; fechar pendencia e dizer "alguem fez e nao bipou"
     — e quem responde por uma peca dada como feita sem o bipe de quem fez e a
     chefia. Se a bancada pudesse fechar a propria, a trava deixaria de
     existir: bastaria fechar tudo e seguir.

     ⚠️ E ELA NAO TEM O PROBLEMA DA TERCEIRA PONTA (armadilha #13): esta lista
     e do MODULO, nao do PCP, e o diretor recebe qualquer chave nova pelo `*`.
     Nao ha caixinha para alguem marcar, entao ela nao nasce inerte. */
  {chave:'producao.pendencia',nome:'Fechar pendência de produção sob medida — a peça feita sem bipe'}
];

/* ── O NIVEL E A MARCA DE SENSIVEL (fase 2 da ACESSOS-UNIFICADOS, 26/10/2026) ──
   Desde a fase 2 estas chaves aparecem na tela de Acessos do PCP, no grupo
   "Sob medida", como `sobmedida.<chave>` — e la toda chave tem nivel. A
   lista continua morando AQUI, porque e este modulo que sabe o que cada uma
   faz; o `permissoes.js` do PCP le esta e nao tem copia.

   ⚠️ NENHUMA E `admin`, E ISSO E TRAVA. O PCP poe a area 'admin' em quem tem
   qualquer chave de nivel admin, e as rotas '@admin' de la liberam por isso:
   uma chave deste modulo declarada admin daria um pedaco do admin do PCP a
   quem so cuida do sob medida (armadilha #34). O que e da bancada e da venda
   e `operacao`; o resto — o que so a chefia fazia — e `supervisor`, que e o
   nivel do setor "Sob medida / Cadastros" e cabe nele. */
const SUPERVISOR=new Set([
  'cadastro.editar','parametro.editar','sobra.corrigir','sobra.descartar',
  'rolo.nota','rolo.ajustar','corte.gerir','corte.aprovar_correcao','painel.ler',
  'catalogo.editar','revenda.editar','credito.editar','boleto.editar',
  'pedido.aprovar_qualquer','pedido.cancelar','producao.pendencia',
  'boleto.aprovar_baixa','sobra.aprovar_descarte'
]);
const SENSIVEL=new Set([
  'sobra.descartar','sobra.corrigir','rolo.ajustar','rolo.encerrar','rolo.nota','custo.ver',
  'parametro.editar','catalogo.editar','revenda.editar','credito.editar','boleto.editar',
  'pedido.aprovar_qualquer','pedido.cancelar','corte.aprovar_correcao','producao.pendencia',
  'boleto.aprovar_baixa','sobra.aprovar_descarte'
]);
CHAVES.forEach(c=>{ c.nivel=SUPERVISOR.has(c.chave)?'supervisor':'operacao'; c.sensivel=SENSIVEL.has(c.chave); });

// O prefixo das chaves deste modulo na lista do PCP.
const PREFIXO='sobmedida.';

/* ⚠️ ISTO DEIXOU DE SER PAPEL e virou PACOTE (fase 2, 26/10/2026). Ate ali o
   portao traduzia a AREA da pessoa num papel, e o papel decidia as chaves.
   Agora quem decide e a lista de permissoes do PCP; estes pacotes sao so o
   conteudo com que os setores "Sob medida / Bancada", "/ Venda" e os cinco da
   producao NASCEM (o seed do acesso.js le daqui), e a regua com que a
   migracao confere que ninguem ganhou nem perdeu nada. O nome `papel` ficou
   nos testes do modulo como atalho para "uma pessoa com o pacote X". */
const PAPEIS={
  diretor:['*'],
  cortador:[
    'modulo.entrar',
    'cadastro.ler','endereco.criar',
    'parametro.ler','sobra.ler','sobra.criar','sobra.propor','etiqueta.imprimir',
    'rolo.ler','rolo.entrada','rolo.encerrar',
    'plano.calcular','plano.confirmar','corte.pedir_correcao',
    // A etiqueta de producao e da bancada: quem corta e quem precisa do papel.
    'etiqueta_producao.ler','etiqueta_producao.imprimir'
    /* ⚠️ `painel.ler` SAIU DO CORTADOR em 04/09/2026, por decisao do dono.
       O painel e escritorio: tema escuro, muitos numeros juntos, e responde
       o que a fabrica CONSOME, quanto tem parado e onde esta o dinheiro. Sem
       os campos de preco ele continua sendo a leitura gerencial do estoque —
       e nao e o que ajuda alguem em pe na bancada a cortar uma peca.

       E o mesmo argumento que moveu /cadastros de `ler` para `editar`: uma
       tela escura no tablet, sob a lampada de inspecao, cheia de coisa que o
       operador nao pode usar.

       O QUE ISSO CUSTA, e esta escrito para nao se descobrir por acidente: o
       cortador deixa de ver Encalhe, Refugo, Recusas e Cortes. Nenhum deles
       e necessario para cortar — o plano ja sugere o retalho sozinho, que e
       justamente para o cortador nao precisar caçar sobra em lista. Se um
       dia fizer falta, a volta e devolver 'painel.ler' a esta lista; o
       dinheiro continua podado pelo custo.semPreco de qualquer jeito. */
  ],

  /* ── O VENDEDOR (fase 2) ────────────────────────────────────────────────
     Ele simula persiana, le o catalogo e cuida da carteira dele. Nao corta,
     nao mexe em rolo, nao descarta sobra, nao abre o cadastro de tecido e
     nao mexe nos parametros do encaixe.

     Ate a fase 2 ele entrava pela area "Sob medida - cadastros", que e a da
     CHEFIA: catalogo, tecido, parametros e descarte de sobra, tudo junto.
     Estava escrito como divida aberta no STATUS da fase 1, e fecha aqui.

     ⚠️ `custo.ver` ESTA NA LISTA, e tem que estar. A poda do custo.js corta
     todo campo de dinheiro de quem nao a tem — e o vendedor sem ela abriria
     o simulador e veria a persiana inteira SEM o preco, que e justamente o
     numero que ele foi buscar. O que ela abre alem disso (o painel, o valor
     do estoque) continua fechado por outra chave: `painel.ler` e
     `cadastro.ler` nao estao aqui. */
  /* ── A BANCADA DA PRODUCAO (fase 5-A) ──────────────────────────────────
     Quem so tem area de setor. Ele entra, ve a fila dele e bipa. Nao corta
     tecido, nao mexe em rolo, nao abre catalogo, nao ve preco e nao imprime
     etiqueta — quem imprime esta com a Zebra na frente, e e o cortador.

     ⚠️ `modulo.entrar` ESTA AQUI, e sem ela o embalador abriria o modulo em
     BRANCO, com 403 no console. Tela em branco nao se parece nem de longe
     com "falta permissao" — e a licao que fez a chave nascer na fase 2. */
  producao:[
    'modulo.entrar',
    'producao.bipar'
  ],

  vendedor:[
    'modulo.entrar',
    'catalogo.ler','custo.ver',
    'revenda.ler',
    /* O pedido e o trabalho dele: lanca, envia, aprova a propria carteira e
       negocia prazo. Nao aprova a carteira do colega e nao cancela. */
    'pedido.ler','pedido.lancar','pedido.aprovar','pedido.prazo',
    /* A tarefa semanal da §4.13 e dele: rever os boletos em aberto da
       carteira, com o financeiro. Ele LE — lancar e baixar nao sao dele,
       pela mesma razao que `revenda.editar` e `credito.editar` nao sao. */
    'boleto.ler',
    /* Ele VE o que a fabrica tem a imprimir — e a resposta de "o meu pedido
       entrou?" —, mas nao imprime: quem imprime esta com a Zebra na frente. */
    'etiqueta_producao.ler'
  ]
};

/* ⚠️ HA DUAS FONTES DE PERMISSAO DESDE A FASE 5-A, E A SEGUNDA E O SETOR.
   Nao e excecao no papel: e a definicao da chave. `producao.bipar` pergunta
   "esta pessoa esta em alguma bancada?", e isso nao sai do papel — sai das
   chaves de setor dela (nucleo/acesso.js → daSessaoDoPcp).

   Sem esta linha, quem tem DUAS areas perderia a bancada: o papel e sempre a
   area mais larga (uma so, sem soma), entao o vendedor que tambem embala
   sairia como `vendedor` e a tela da bancada daria 403 para ele — com o
   setor marcado na tela de Acessos, e sem ninguem entender por que. A
   fabrica descobriria isso com o tablet na mao numa segunda-feira.

   Quem NAO tem setor nenhum continua sem a chave, entao a tela nao aparece
   no menu de quem nao bipa: a lista vazia nao vira tela inutil. */
/* E ENTRAR TAMBEM VEM DO SETOR: quem esta numa bancada da producao entra no
   modulo, como o papel `producao` sempre entrou. Sem isto, o setor marcado
   sozinho (ou por excecao) daria uma bancada que a pessoa nao alcanca. */
const POR_SETOR=['producao.bipar','modulo.entrar'];

/* A PERGUNTA E UMA SO: "esta pessoa tem esta chave?". Quem responde e a lista
   que o portao montou a partir das permissoes do PCP (`usuario.permissoes`).
   O `papel` so existe nos testes, como atalho para um pacote — o portao nunca
   o grava. */
function pode(usuario,chave){
  if(!usuario) return false;
  const lista=Array.isArray(usuario.permissoes) ? usuario.permissoes : (PAPEIS[usuario.papel]||[]);
  if(lista.includes('*')) return true;
  if(lista.includes(chave)) return true;
  if(POR_SETOR.includes(chave)) return ((usuario.setores||[]).length>0);
  return false;
}

module.exports={CHAVES,PAPEIS,POR_SETOR,PREFIXO,pode};
