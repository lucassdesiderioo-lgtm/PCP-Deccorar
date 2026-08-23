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
  { chave:'necessidade.ver',      grupo:'Visão',      nivel:'supervisor',
    rotulo:'Ver necessidade (ABC)', desc:'Curva ABC e cobertura' },

  // ─── CONFIGURAÇÃO ───────────────────────────────────────────
  { chave:'listas.editar',        grupo:'Configuração', nivel:'admin',
    rotulo:'Editar listas',       desc:'Motivos de rejeição e devolução' },
  { chave:'kit.editar',           grupo:'Configuração', nivel:'admin',
    rotulo:'Definir código do kit', desc:'QR conferido na embalagem' },
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
