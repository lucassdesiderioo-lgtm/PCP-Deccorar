/* Registro declarativo de permissoes (Controle de Acesso, secao 4).
 * Fonte unica de verdade: declarar uma permissao aqui faz a caixinha aparecer
 * na tela de cadastro (Fase 2) e a permissao existir no modelo novo.
 * A tabela `permissoes` e sincronizada deste arquivo a cada boot (acesso.js).
 *
 * niveis: operacao | supervisor | admin | admin_geral
 * sensivel: exige aviso visual e fica registrada na auditoria
 * intransferivel: nunca delegavel (so Admin Geral) — anula o modelo se sair dele
 */
module.exports = [
  // ─── PRODUÇÃO ───────────────────────────────────────────────
  { chave:'revisao.executar',     grupo:'Produção',   nivel:'operacao',
    rotulo:'Revisar peças',       desc:'Bipar início e fim da revisão' },
  { chave:'revisao.rejeitar',     grupo:'Produção',   nivel:'operacao',
    rotulo:'Devolver peça à produção', desc:'Registrar peça com problema' },
  { chave:'embalagem.executar',   grupo:'Produção',   nivel:'operacao',
    rotulo:'Embalar peças',       desc:'Bipar SKU, kit e finalizar' },

  // ─── EXPEDIÇÃO ──────────────────────────────────────────────
  { chave:'pdf.subir',            grupo:'Expedição',  nivel:'operacao',
    rotulo:'Lançar NF de venda',  desc:'Subir o PDF do Mercado Livre' },
  { chave:'etiqueta.emitir',      grupo:'Expedição',  nivel:'operacao',
    rotulo:'Emitir NF de venda',  desc:'Imprimir etiqueta e dar baixa no estoque' },
  { chave:'carregamento.executar',grupo:'Expedição',  nivel:'operacao',
    rotulo:'Carregar veículo',    desc:'Conferir volumes por bipe' },
  /* Pacote (§5, armadilha #23). Quem ASSINA nao esta destravando um volume: esta
     dizendo QUANTAS persianas e QUAIS vao dentro da caixa — e e essa lista que
     a Etiqueta de Venda cobra no bipe e que baixa do estoque, peca por peca.
     Chave propria, nivel admin e `sensivel` pelo mesmo motivo de 'estoque.editar':
     a assinatura mexe no saldo sem venda na frente, e o unico rastro do porque e
     quem assinou. Ver a caixa retida continua sendo '@admin' (a aba Bloqueados). */
  { chave:'pacote.assinar',       grupo:'Expedição',  nivel:'admin',
    rotulo:'Assinar peças de caixa com várias persianas',
    desc:'Confirmar quais SKUs vão dentro do volume retido por pacote',
    sensivel:true },

  // ─── SOB MEDIDA ─────────────────────────────────────────────
  // A segunda operacao da fabrica: corte de tecido contra o pedido do cliente
  // (modulo montado em /sobmedida). Duas chaves, e a divisao entre elas e o
  // que se pode ESTRAGAR — a bancada corta e cadastra sobra; a chefia mexe no
  // cadastro de tecido e nos parametros do calculo, que mudam o encaixe de
  // todo mundo.
  { chave:'sobmedida.cortar',     grupo:'Sob medida', nivel:'operacao',
    rotulo:'Cortar tecido',       desc:'Plano de corte, rolos, sobras e etiquetas de prateleira' },
  /* ⚠️ CADASTRAR E `supervisor`, E NAO `admin` — 24/09/2026, e e o espelho da
     trava da `sobmedida.vender` logo abaixo. Declarada como admin, esta chave
     dizia duas coisas que ninguem pediu: `sincronizarAreas` poe a area 'admin'
     em quem tem QUALQUER chave de nivel admin, e as 24 rotas '@admin' do PCP
     liberam por `temAdmin(perms)`. Entao a chave do CADASTRO DO SOB MEDIDA
     valia como "e admin do PCP" — a fase 2 fechou o vazamento no sentido
     venda→modulo, e este fecha no sentido modulo→PCP.

     ⚠️ DENTRO DO MODULO NAO MUDA NADA: `papelDe` devolve 'diretor' tanto para
     'admin' quanto para AREA_CHEFIA ('sobmedida_adm'), e nunca houve papel
     "chefia" separado. Quem tem esta chave continua entrando como diretor la
     dentro — e o que a area sempre significou. O que sai e o PCP.

     ⚠️ E O SETOR NATIVO `Admin` DEIXOU DE CARREGA-LA, por consequencia: a
     lista dele e calculada ("toda chave de nivel admin", acesso.js). Isso e
     decisao — quem cadastra sob medida e o setor dedicado, nao o Admin do PCP
     por tabela. Ha caso travando em teste_acesso.js (secao 6-D). */
  { chave:'sobmedida.cadastrar',  grupo:'Sob medida', nivel:'supervisor',
    rotulo:'Cadastrar sob medida',desc:'Tecidos, enderecos, motivos e os parametros do encaixe' },
  /* ⚠️ VENDER E `operacao`, E NAO `admin` — e isto nao e classificacao, e
     trava. `sincronizarAreas` poe a area 'admin' em quem tem QUALQUER chave
     de nivel admin, e o portao do sob medida (tecido/nucleo/acesso.js) le
     'admin' como DIRETOR. Declarada como admin, esta chave entregaria ao
     vendedor o modulo inteiro — cadastro de tecido, parametros do encaixe e
     descarte de sobra — sem ninguem ter pedido isso, e sem erro nenhum em
     tela. E a porta A da armadilha #28 por uma porta nova.

     Vender tambem nao e administrar o sistema: e o trabalho da pessoa, como
     cortar e revisar. O nivel diz isso, e a trava vem de graca junto. */
  { chave:'sobmedida.vender',     grupo:'Sob medida', nivel:'operacao',
    rotulo:'Vender sob medida',   desc:'Simulador, catalogo de venda e a carteira de revendas' },

  /* ── OS CINCO SETORES DE PRODUCAO (fase 5-A, 24/09/2026) ────────────────
     Decisao do dono: "tem que ser possivel criar cada setor no controle de
     acesso, e quem tem acesso pega o tablet de manha e ve o que tem para
     fazer". Sao cinco chaves, UMA POR SETOR, e nao uma chave so de
     "producao": o bipe grava QUEM fez a peca, e na fase 5-B e por ele que a
     recusa acha a pessoa certa — uma chave unica deixaria o serralheiro
     bipar a embalagem, e a regua apontaria para quem nao trabalhou ali.

     ⚠️ SETOR E CADASTRO, CHAVE E CODIGO — e essa fronteira precisa estar
     escrita, senao vira "a tela deixa criar e nao funciona". Nome, ordem e
     prefixo da etiqueta se editam no cadastro `sm_setor` do modulo; um SEXTO
     setor de producao exige chave nova aqui. Gerar permissao a partir do
     `tecido.db` acoplaria os dois bancos e furaria a porta unica — e setor
     novo e mudanca de como a fabrica trabalha, que passar por codigo e o
     certo.

     ⚠️ E AS CINCO SAO `operacao`, PELA MESMA RAZAO DA `vender` ACIMA:
     `sincronizarAreas` poe a area 'admin' em quem tem qualquer chave de
     nivel admin, e o portao do modulo le 'admin' como DIRETOR. Um setor
     declarado admin entregaria o modulo inteiro — catalogo, parametros do
     encaixe, descarte de sobra — a quem so embala. */
  { chave:'sobmedida.serralheria', grupo:'Sob medida', nivel:'operacao',
    rotulo:'Sob medida — serralheria', desc:'Bipar tubo, base, bandô e barra na produção sob medida' },
  { chave:'sobmedida.colecao',     grupo:'Sob medida', nivel:'operacao',
    rotulo:'Sob medida — coleção',     desc:'Bipar o corte do tecido na produção sob medida' },
  { chave:'sobmedida.montagem',    grupo:'Sob medida', nivel:'operacao',
    rotulo:'Sob medida — montagem',    desc:'Bipar a montagem da persiana sob medida' },
  { chave:'sobmedida.revisao',     grupo:'Sob medida', nivel:'operacao',
    rotulo:'Sob medida — revisão',     desc:'Bipar a revisão da persiana sob medida' },
  { chave:'sobmedida.embalagem',   grupo:'Sob medida', nivel:'operacao',
    rotulo:'Sob medida — embalagem',   desc:'Bipar a embalagem da persiana sob medida (com o kit)' },

  // ─── DEVOLUÇÕES ─────────────────────────────────────────────
  { chave:'devolucao.registrar',  grupo:'Devoluções', nivel:'operacao',
    rotulo:'Registrar devolução', desc:'Receber e fazer a triagem física' },
  { chave:'devolucao.baixar',     grupo:'Devoluções', nivel:'admin',
    rotulo:'Dar baixa em devolução', desc:'Informar reputação e motivo' },

  // ─── ESTOQUE ────────────────────────────────────────────────
  { chave:'contagem.contar',      grupo:'Estoque',    nivel:'operacao',
    rotulo:'Contar estoque',      desc:'Bipar peças na conferência' },
  { chave:'contagem.ajustar',     grupo:'Estoque',    nivel:'admin',
    rotulo:'Aprovar ajuste de estoque', desc:'Aplicar a contagem ao estoque',
    sensivel:true },
  { chave:'estoque.editar',       grupo:'Estoque',    nivel:'admin',
    rotulo:'Editar estoque direto', desc:'Alterar quantidade manualmente',
    sensivel:true },
  { chave:'alvo.editar',          grupo:'Estoque',    nivel:'admin',
    rotulo:'Definir alvo',        desc:'Travar o alvo de um SKU' },

  // ─── PLANEJAMENTO ───────────────────────────────────────────
  { chave:'producao.lancar',      grupo:'Planejamento', nivel:'admin',
    rotulo:'Lançar produção',     desc:'Criar ordens manualmente' },
  { chave:'planilha.importar',    grupo:'Planejamento', nivel:'admin',
    rotulo:'Importar planilha do ML', desc:'Atualizar a demanda futura' },
  { chave:'sku.cadastrar',        grupo:'Planejamento', nivel:'admin',
    rotulo:'Cadastrar SKU',       desc:'Criar e editar produtos' },
  { chave:'sku.excluir',          grupo:'Planejamento', nivel:'admin',
    rotulo:'Excluir SKU',         desc:'Remover produto do cadastro',
    sensivel:true },
  // O cadastro de COR fica sob sku.cadastrar — e a mesma tela e a mesma pessoa.
  // Modelo e permissao propria: na Fase 2 e ele que carrega as formulas da
  // ficha tecnica, e quem mexe numa formula mexe no consumo de material.
  { chave:'modelo.cadastrar',     grupo:'Planejamento', nivel:'admin',
    rotulo:'Cadastrar modelo de produto', desc:'Linhas de produto e suas fórmulas' },

  // ─── COMPRAS ────────────────────────────────────────────────
  // COMPRAS.md §10. Os tres papeis — Comprador, Recebimento e Financeiro —
  // nascem separados mesmo enquanto forem a mesma pessoa: o dia em que entrar
  // alguem para receber e desmarcar uma caixa, nao redesenhar o modulo.
  //
  // compras.ver e supervisor e pedido.ver e operacao por causa da regra 1 do
  // controle de acesso: setor de nivel operacao nao aceita permissao acima do
  // seu nivel. Quem recebe precisa saber o que esta chegando; nao precisa da
  // lista de compras nem dos precos comparados.
  { chave:'compras.ver',          grupo:'Compras', nivel:'supervisor',
    rotulo:'Ver lista de compras', desc:'O que precisa ser comprado' },
  { chave:'fornecedor.cadastrar', grupo:'Compras', nivel:'admin',
    rotulo:'Cadastrar fornecedor', desc:'Criar e editar fornecedores' },
  { chave:'preco.lancar',         grupo:'Compras', nivel:'admin',
    rotulo:'Lançar preço',        desc:'Cadastrar e atualizar preço de fornecedor' },
  { chave:'pedido.criar',         grupo:'Compras', nivel:'admin',
    rotulo:'Criar e enviar pedido', desc:'Gerar pedido de compra ao fornecedor',
    sensivel:true },
  { chave:'pedido.ver',           grupo:'Compras', nivel:'operacao',
    rotulo:'Ver pedidos em aberto', desc:'O que está a caminho, sem preço' },
  { chave:'pedido.receber',       grupo:'Compras', nivel:'operacao',
    rotulo:'Registrar recebimento', desc:'Conferir a entrega e dar entrada no estoque' },
  { chave:'pedido.devolver',      grupo:'Compras', nivel:'operacao',
    rotulo:'Devolver ao fornecedor', desc:'Recusar item na conferência, com motivo' },
  { chave:'pedido.pagar',         grupo:'Compras', nivel:'admin',
    rotulo:'Marcar pedido como pago', desc:'Fecha o ciclo — não é contas a pagar',
    sensivel:true },
  // Custo do produto e a informacao mais estrategica do sistema — mais que
  // produtividade nominal. Nao vaza por padrao e todo acesso vai para a auditoria.
  { chave:'custo.ver',            grupo:'Compras', nivel:'admin',
    rotulo:'Ver custo do produto', desc:'Custo por SKU e evolução',
    sensivel:true },
  { chave:'componente.cadastrar', grupo:'Compras', nivel:'admin',
    rotulo:'Cadastrar componente', desc:'Insumos e matérias-primas' },
  { chave:'minimo.definir',       grupo:'Estoque', nivel:'admin',
    rotulo:'Definir estoque mínimo', desc:'Ponto de pedido e estoque ideal por componente' },
  { chave:'bloqueio.liberar',     grupo:'Planejamento', nivel:'admin',
    rotulo:'Desbloquear volumes', desc:'Liberar volumes com SKU desconhecido' },

  // ─── VISÃO ──────────────────────────────────────────────────
  { chave:'painel.ver',           grupo:'Visão',      nivel:'operacao',
    rotulo:'Ver painel do dia',   desc:'Andamento geral da operação' },
  { chave:'produtividade.propria',grupo:'Visão',      nivel:'operacao',
    rotulo:'Ver a própria produção', desc:'Quanto a pessoa produziu' },
  { chave:'produtividade.equipe', grupo:'Visão',      nivel:'supervisor',
    rotulo:'Ver produção da equipe', desc:'Distribuição sem identificar quem' },
  { chave:'produtividade.nominal',grupo:'Visão',      nivel:'admin',
    rotulo:'Ver produção com nome', desc:'Identifica cada operador',
    sensivel:true },
  { chave:'relatorios.ver',       grupo:'Visão',      nivel:'supervisor',
    rotulo:'Ver relatórios',      desc:'Relatórios e painel gerencial' },
  /* A chave segue 'necessidade.ver' porque ja esta gravada nos perfis; o que
     ela libera hoje e a tela de Planejamento (a ABC saiu em 01/09/2026). */
  { chave:'necessidade.ver',      grupo:'Visão',      nivel:'supervisor',
    rotulo:'Ver planejamento',    desc:'Estoque alvo, cobertura e necessidade de produção' },

  // ─── CONFIGURAÇÃO ───────────────────────────────────────────
  { chave:'listas.editar',        grupo:'Configuração', nivel:'admin',
    rotulo:'Editar listas',       desc:'Motivos de rejeição e devolução' },
  { chave:'kit.editar',           grupo:'Configuração', nivel:'admin',
    rotulo:'Definir código do kit', desc:'QR conferido na embalagem' },
  /* IMPRIMIR NAO E EDITAR, e por isso sao duas chaves. Editar decide o que a
     etiqueta diz (e o que a Embalagem passa a bipar); imprimir so tira copia
     do que ja foi decidido — e quem tira copia e quem esta na bancada com o
     rolo na impressora, nao quem manda na configuracao.
     ⚠️ ELA NASCE SEM DONO, POR DECISAO DO DONO (17/09/2026): nao ha backfill.
     Admin Geral imprime porque passa em tudo; os outros so quando alguem
     assinalar o nome na tela de Acessos. E o contrario do caso `pacote.assinar`
     (§5, armadilha #23), onde a chave nova tinha que alcancar sozinha quem ja
     fazia aquilo — aqui ninguem fazia, porque a impressao nao existia. */
  { chave:'kit.imprimir',         grupo:'Configuração', nivel:'supervisor',
    rotulo:'Imprimir etiqueta do kit', desc:'Gerar o PDF do rolo de etiquetas' },
  { chave:'horarios.editar',      grupo:'Configuração', nivel:'admin',
    rotulo:'Editar horários',     desc:'Corte e despacho por dia',
    sensivel:true },

  // ─── SISTEMA ────────────────────────────────────────────────
  { chave:'pessoas.gerenciar',    grupo:'Sistema',    nivel:'admin_geral',
    rotulo:'Gerenciar pessoas e acessos', desc:'Cadastrar e definir permissões',
    sensivel:true, intransferivel:true },
  { chave:'setores.gerenciar',    grupo:'Sistema',    nivel:'admin_geral',
    rotulo:'Criar e editar setores', desc:'Estrutura de cargos da empresa',
    sensivel:true, intransferivel:true },
  { chave:'teste.operar',         grupo:'Sistema',    nivel:'admin',
    rotulo:'Operar modo teste',   desc:'Ligar, desligar e apagar testes',
    sensivel:true },
  { chave:'auditoria.ver',        grupo:'Sistema',    nivel:'admin_geral',
    rotulo:'Ver auditoria',       desc:'Histórico de ações e cobertura',
    sensivel:true, intransferivel:true },
];
