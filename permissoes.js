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
  // apaga dado real em massa e nao tem volta (so o backup) — fica no nivel mais
  // alto e fora de qualquer delegacao, como pessoas/setores/auditoria
  { chave:'sistema.zerar',        grupo:'Sistema',    nivel:'admin_geral',
    rotulo:'Zerar a operação',    desc:'Apagar estoque, lançamentos e histórico para recomeçar',
    sensivel:true, intransferivel:true },
];
