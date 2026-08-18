# Controle de Acesso — Especificação

> Modelo de permissões do PCP Deccorar.
> **Data:** 14/08/2026 · **Status:** desenho para revisão, nada implementado

---

## 1. O problema que estamos resolvendo

O sistema nasceu com 8 telas e permissão por tela. Hoje tem mais de 20 áreas, e o
modelo não acompanhou. Três consequências concretas:

**Não existe meio-termo no admin.** Marcar `admin` dá acesso a 12 abas de uma vez —
inclusive apagar dados, mudar PINs e alterar as próprias permissões. Se você quiser
que alguém faça só a contagem mensal, hoje precisa dar tudo.

**Produtividade está exposta.** A tela de revisão mostra o total do dia de todos os
operadores. A aba Problemas mostra quem detectou cada rejeição, com nome.

**Nada garante cobertura.** Uma tela nova pode nascer sem permissão e ninguém
perceber — nem aberta demais, nem fechada demais.

---

## 2. O modelo: híbrido setor + exceção

É o padrão da indústria (RBAC com overrides), usado por praticamente todo sistema
corporativo. A escolha é deliberada e resolve o caso real da sua operação: **as
pessoas acumulam funções**.

```
João  →  setor "Operador / Revisão"          herda tudo do setor
      +  setor "Operador / Expedição"        acumula, não substitui
      +  exceção: pode ajustar estoque       particularidade só dele
```

### Por que não RBAC puro

Sem exceções, cada combinação vira um setor novo — "Revisão+Embalagem",
"Embalagem+Expedição", "Revisão+Estoque". Com 6 atividades, são 63 combinações
possíveis. A lista vira inadministrável em poucos meses.

### Por que não permissão só individual

Sem setores, criar uma funcionalidade nova exige marcá-la pessoa por pessoa. Com o
setor, você marca uma vez e todos daquele setor herdam — que era exatamente o que
você pediu.

### A regra de resolução

```
1. Exceção que REVOGA  →  não pode          (revogação sempre vence)
2. Exceção que CONCEDE →  pode
3. Algum setor concede →  pode
4. Nenhum caso acima   →  não pode          (fechado por padrão)
```

Revogação vencendo concessão é decisão de segurança: em caso de conflito, o
resultado mais restritivo prevalece.

---

## 3. Os quatro níveis

| Nível | Quem | Característica |
|---|---|---|
| **Operação** | Revisor, embalador, expedidor | Executa. Vê só os próprios números |
| **Supervisor** | Encarregado | Vê o andamento da equipe, sem nomes. Não configura |
| **Admin** | Delegado por você | Configura o que você marcar |
| **Admin Geral** | Só você | Tudo, inclusive dar acesso |

### O corte entre Admin e Admin Geral

**Quase tudo é delegável.** O Admin Geral marca caixinha por caixinha o que quer
passar adiante, quando sentir segurança na pessoa. Isso inclui coisas que parecem
sensíveis à primeira vista — horários de corte, modo teste, exclusão de SKU — e que
podem ser delegadas com o aviso apropriado.

**As permissões intransferíveis** (`intransferivel: true` no registro):

| Permissão | Por quê |
|---|---|
| `pessoas.gerenciar` | Quem pode dar permissão pode se dar **qualquer** permissão, inclusive as que você não delegou. Delegar isso torna todo o resto decorativo — a pessoa se marca Admin Geral e pronto. |
| `setores.gerenciar` | Editar o setor é editar as permissões de todo mundo que está nele — é `pessoas.gerenciar` por outro caminho. |
| `auditoria.ver` | Se quem é auditado controla a auditoria, ela deixa de servir. E como o log registra tentativas negadas, dar isso é dar visão de tudo que acontece no sistema. |
| `sistema.zerar` | Apaga estoque, ordens e histórico de uma vez, sem desfazer pela tela. Não é uma tarefa de rotina — é a virada de uso do sistema, e quem decide isso é o dono da operação. |

Não é questão de confiança na pessoa — é que essas **anulam o próprio modelo** se
delegadas. Todas as demais são decisão sua.

### Permissões sensíveis

Marcadas com `sensivel: true` no registro. Continuam delegáveis, mas a tela de
cadastro exibe aviso visual e a ação fica registrada na auditoria:

`estoque.editar` · `contagem.ajustar` · `sku.excluir` · `teste.operar` ·
`horarios.editar` · `produtividade.nominal` · `sistema.zerar` · `dados.apagar`

---

## 4. O registro de permissões

Um arquivo único onde cada permissão é declarada. **A tela de cadastro monta as
caixinhas lendo esse registro** — declarar a permissão faz a caixinha aparecer
sozinha, no grupo certo, sem ninguém precisar lembrar.

```js
// permissoes.js
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
  { chave:'sistema.zerar',        grupo:'Sistema',    nivel:'admin_geral',
    rotulo:'Zerar a operação',    desc:'Apagar estoque, lançamentos e histórico para recomeçar',
    sensivel:true, intransferivel:true },
];
```

**Como acrescentar uma permissão nova:** uma linha neste arquivo. A caixinha aparece
sozinha no cadastro, no grupo declarado, e passa a poder ser marcada para setores e
pessoas — inclusive quem já trabalha no sistema.

---

## 5. Os setores nativos

Criados na primeira execução, editáveis depois.

| Setor | Nível | Permissões |
|---|---|---|
| **Operador / Revisão** | operação | revisão, rejeitar, devolução, painel, produção própria |
| **Operador / Embalagem** | operação | embalagem, painel, produção própria |
| **Operador / Expedição** | operação | lançar NF, emitir NF, carregamento, painel, produção própria |
| **Operador / Controle de Estoque** | operação | contar, painel, produção própria |
| **Supervisor** | supervisor | tudo de visão + produção da equipe, relatórios, necessidade |
| **Admin** | admin | planejamento, estoque, devoluções, configuração (marcável) |
| **Admin Geral** | admin_geral | **todas**, sempre |

O Admin Geral tem todas as permissões por definição, e isso não é editável — senão
seria possível se trancar fora do sistema.

### Criar setores novos

Você cria setores conforme a fábrica cresce. Cada um tem nome, nível e o conjunto de
permissões que você marcar.

| | Setores nativos | Setores criados por você |
|---|---|---|
| Excluir | Não, apenas desativar | Sim, se ninguém estiver usando |
| Renomear | Sim | Sim |
| Editar permissões | Sim | Sim |

**Duas regras de integridade:**

**1. O nível limita o que pode ser marcado.** Um setor de nível `operacao` não
aceita permissões declaradas como `admin` ou `admin_geral`. Sem isso, a hierarquia
de níveis deixa de significar qualquer coisa — bastaria criar um setor "operação"
com poder de administrador.

**2. Editar um setor afeta todos que pertencem a ele, na hora.** É o comportamento
que você escolheu — marcar uma permissão nova no setor libera para todos de uma vez.
Por isso a tela avisa antes de salvar:

```
⚠  3 pessoas usam este setor e serão afetadas:
   Edivaldo · Maria · João

   Você está concedendo: "Editar horários"  (sensível)

   [ Cancelar ]   [ Confirmar ]
```

Excluir um setor com pessoas dentro é bloqueado — primeiro você move as pessoas.
A alteração fica registrada na auditoria, com quem alterou e quem foi afetado.

---

## 6. Garantia de cobertura

Sua exigência central: **nunca esquecer de declarar a permissão de algo novo.**

A garantia é estrutural, não disciplinar:

**1. Fechado por padrão.** Rota sem permissão declarada é negada para todos os
níveis abaixo de Admin Geral.

**2. O Admin Geral passa, mas com alerta.** Você não fica travado — a rota funciona
para você — mas ela aparece **em vermelho na auditoria** como *"permissão não
declarada"*. Você tem o acesso e vê a pendência.

> Este é o ponto que resolve a contradição entre "não me travar" e "não esquecer
> silenciosamente". Liberar para o Admin Geral **sem** o alerta faria o esquecimento
> passar despercebido por meses.

**3. Tela de cobertura.** Lista todas as rotas do sistema e marca as que não têm
permissão declarada. Se estiver vazia, está tudo coberto.

**4. Aviso no boot.** Ao iniciar, o servidor imprime no log quantas rotas estão sem
declaração. Zero é o estado saudável.

---

## 7. Auditoria — o que é registrado

Registra **o que muda coisas**, não cada tela aberta. Registrar navegação geraria
milhares de linhas por dia, exigiria limpeza constante e afogaria o que importa.

| Categoria | Exemplos |
|---|---|
| **Acesso** | Login, logout, tentativa com PIN errado, bloqueio por tentativas |
| **Estoque** | Ajuste de contagem, edição direta, alteração de alvo |
| **Cadastro** | SKU criado, editado, excluído |
| **Expedição** | Volume desbloqueado, etiqueta emitida, carregamento |
| **Devoluções** | Baixa com reputação e motivo |
| **Sistema** | Permissão alterada, setor modificado, modo teste ligado/desligado |
| **Sensível** | Consulta a produtividade nominal |
| **Segurança** | Acesso negado, rota sem permissão acessada |

Cada registro guarda: quem, o quê, sobre o quê, quando e de qual IP.

**Retenção:** 12 meses, com limpeza automática. O nome do usuário é gravado junto do
id — assim o histórico sobrevive à desativação da pessoa.

---

## 8. Produtividade — os três graus

| Grau | Quem vê | O que vê |
|---|---|---|
| **Própria** | Operação | *"Você revisou 40 peças hoje · média 6s"* |
| **Equipe** | Supervisor | *"87 peças · Operador A: 40 · B: 32 · C: 15"* |
| **Nominal** | Admin Geral | *"Edivaldo: 40 · Maria: 32 · João: 15"* |

O supervisor enxerga a **distribuição** — se alguém está muito abaixo, isso aparece
— sem identificar quem. Precisando saber, pede ao Admin Geral, e essa consulta fica
registrada na auditoria.

### O que muda no sistema atual

Duas telas expõem dados hoje e precisam de ajuste:

- **Revisão** — o rodapé mostra o total do dia de todos. Passa a mostrar só o
  do operador logado.
- **Problemas (admin)** — a coluna "Quem" só aparece com `produtividade.nominal`.

---

## 9. A contagem em dois passos

Você preferiu segurança, mas exigir duas pessoas no ato travaria a operação quando
faltasse gente. A solução adotada:

```
Operador conta (bipe)  →  ajuste fica PENDENTE  →  Admin aprova quando puder
```

Nada muda no estoque sem aprovação. Não exige duas pessoas simultâneas. E a
aprovação fica registrada na auditoria, com quem contou e quem aprovou.

Quem tem `contagem.ajustar` aplica direto, sem passar pela fila — é o caso do Admin
Geral e de quem você marcar.

---

## 10. Modelo de dados

```sql
-- Registro declarativo, sincronizado do código a cada boot
CREATE TABLE IF NOT EXISTS permissoes (
  chave        TEXT PRIMARY KEY,
  grupo        TEXT,
  rotulo       TEXT,
  descricao    TEXT,
  nivel        TEXT,              -- operacao|supervisor|admin|admin_geral
  sensivel     INTEGER DEFAULT 0,
  ordem        INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS setores (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nome         TEXT UNIQUE,
  nivel        TEXT,
  nativo       INTEGER DEFAULT 0, -- nativos não podem ser excluídos
  ativo        INTEGER DEFAULT 1,
  criado_em    TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS setor_permissao (
  setor_id     INTEGER,
  chave        TEXT,
  PRIMARY KEY (setor_id, chave)
);

CREATE TABLE IF NOT EXISTS usuario_setor (
  usuario_id   INTEGER,
  setor_id     INTEGER,
  PRIMARY KEY (usuario_id, setor_id)
);

CREATE TABLE IF NOT EXISTS usuario_excecao (
  usuario_id   INTEGER,
  chave        TEXT,
  concede      INTEGER,           -- 1 concede, 0 revoga
  motivo       TEXT,
  criado_por   TEXT,
  criado_em    TEXT DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (usuario_id, chave)
);

CREATE TABLE IF NOT EXISTS auditoria (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id   INTEGER,
  usuario_nome TEXT,              -- sobrevive à desativação
  categoria    TEXT,
  acao         TEXT,
  alvo         TEXT,
  detalhe      TEXT,
  ip           TEXT,
  criado_em    TEXT DEFAULT (datetime('now','localtime')),
  data         TEXT DEFAULT (date('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_auditoria_data ON auditoria(data);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id);

CREATE TABLE IF NOT EXISTS contagem_pendente (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao       TEXT,
  codigo       TEXT,
  contado      INTEGER,
  sistema_era  INTEGER,
  operacao     TEXT,              -- 'lancar' | 'ajustar'
  contado_por  TEXT,
  criado_em    TEXT DEFAULT (datetime('now','localtime')),
  aprovado     INTEGER DEFAULT 0,
  aprovado_por TEXT,
  aprovado_em  TEXT
);
```

A coluna `usuarios.areas` (lista por vírgula) é substituída pelas tabelas de
relacionamento. Ela permanece durante a migração e é removida depois.

---

## 11. A tela de cadastro

```
┌──────────────────────────────────────────────────────────┐
│  Edivaldo                                                │
│  PIN ●●●●                                    [ Alterar ] │
├──────────────────────────────────────────────────────────┤
│  SETORES                                                 │
│  ☑ Operador / Revisão                                    │
│  ☐ Operador / Embalagem                                  │
│  ☐ Operador / Expedição                                  │
│  ☐ Operador / Controle de Estoque                        │
│  ☐ Supervisor                                            │
├──────────────────────────────────────────────────────────┤
│  PERMISSÕES                          [ ver exceções ▾ ]  │
│                                                          │
│  Produção                                                │
│    ☑ Revisar peças                          via setor    │
│    ☑ Devolver peça à produção               via setor    │
│    ☐ Embalar peças                                       │
│                                                          │
│  Estoque                                                 │
│    ☑ Contar estoque                    exceção · você    │
│    ☐ Aprovar ajuste de estoque         ⚠ sensível        │
│                                                          │
│  [ ... demais grupos ... ]                               │
└──────────────────────────────────────────────────────────┘
```

**Cada caixinha mostra a origem** — herdada do setor ou exceção individual. Marcar
algo que o setor não dá cria uma exceção; desmarcar algo herdado cria uma revogação.

Permissões marcadas como `sensivel` aparecem com aviso visual.

Os grupos e as caixinhas são **montados a partir do registro** — nada é escrito à
mão nesta tela.

---

## 12. Migração

Os usuários atuais têm permissões em `usuarios.areas`. A conversão:

| Área atual | Vira |
|---|---|
| `operador` | setor Operador / Revisão |
| `montagem` | setor Operador / Embalagem |
| `embalagem` + `expedicao` + `carregamento` | setor Operador / Expedição |
| `admin` | setor Admin Geral |
| `painel`, `relatorios`, `necessidade` | permissões do setor correspondente |

Executada uma vez, no boot, com log do resultado. A coluna antiga é preservada até
a validação.

**Risco a controlar:** se a migração falhar no meio, alguém pode ficar sem acesso.
Por isso ela roda dentro de uma transação e, em caso de erro, mantém o modelo antigo
funcionando.

---

## 13. Ordem de implementação

| Fase | O quê | Reversível |
|---|---|---|
| 1 | Registro de permissões + tabelas + migração, **rodando em paralelo** ao modelo atual | Sim |
| 2 | Tela de cadastro nova, lendo o registro | Sim |
| 3 | Middleware passa a usar o modelo novo | Sim, por configuração |
| 4 | Auditoria e tela de cobertura | Sim |
| 5 | Contagem em dois passos | Sim |
| 6 | Remoção do modelo antigo | Definitiva |

A Fase 1 não altera comportamento: as duas verificações rodam lado a lado e o
sistema registra divergências. Só depois de estarem idênticas por alguns dias é que
a Fase 3 troca a chave.

---

## 14. Regras que não podem ser quebradas

1. **Admin Geral tem todas as permissões**, sempre, sem exceção editável
2. **Fechado por padrão** — o que não é declarado é negado
3. **Revogação vence concessão** em qualquer conflito
4. **As permissões `intransferivel` nunca são delegáveis** — `pessoas.gerenciar`, `setores.gerenciar`, `auditoria.ver` e `sistema.zerar` anulam o modelo (ou o dado) se saírem do Admin Geral. Todas as demais são decisão do Admin Geral
5. **Toda permissão nova nasce no registro** — não há permissão escrita à mão numa tela
6. **Produtividade nominal é sensível** e sua consulta fica registrada
7. **Auditoria é somente leitura** — não existe rota que apague registro
