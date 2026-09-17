> **STATUS · 17/09/2026 — PLANEJADO · não iniciado** · mantido pelo dono em 17/09/2026, começa depois da fila de consertos
> Nenhuma tabela deste desenho existe (`etapa`, `sessao_producao`, `unidade`,
> `unidade_consumo`). Atenção a dois pontos que mudaram desde a escrita:
> a rota `/montagem` hoje serve a tela de **Embalagem**; e o **SKU não tem mais formato**
> (`CLAUDE.md` §7) — os exemplos com `BK…` são só ilustração.
> Movido do Projeto "PCP - Deccorar" para o repositório em 17/09/2026.

---

# Produção — Mapa do Processo e Motor de Etapas

> A cadeia produtiva inteira, do corte do tecido ao carregamento, e a engrenagem
> única que vai rodar todas as etapas.
> **Data:** 17/08/2026 · **Status:** desenho para revisão, nada implementado

---

## 1. A cadeia

```
  ┌─ 1. CORTE DE TECIDO ──────────┐   produz tecido cortado  ▸ etiqueta
  │                                │
  ├─ 2. CORTE DE TUBO E BASE ─────┤   produz tubo + base     ▸ etiqueta
  │                                │
  ├─ 3. KIT DE COMANDO ───────────┤   produz kit             ▸ estoque
  │                                │
  └────────────┬───────────────────┘
               ▼
      5. MONTAGEM DA PERSIANA          consome 1+2+3
               ▼
      6. REVISÃO
               ▼
      7. EMBALAGEM                     consome 4 (kit de envio) ▸ estoque
               ▼
      8. ESTOQUE

  ─────────── VENDEU ───────────
      Bipa SKU  →  entrega a NF  →  imprime a NF  →  carrega
```

O **kit de envio (4)** não entra na linha da persiana — ele é montado em lote,
vira estoque, e é consumido lá na embalagem.

### As oito etapas, lado a lado

| # | Etapa | Consome | Produz | Etiqueta | Lote |
|---|---|---|---|---|---|
| 1 | Corte de tecido | rolo de tecido | tecido cortado | **sim** | sim |
| 2 | Corte de tubo e base | barra de tubo, barra de base | tubo + base | **sim** | sim |
| 3 | Kit de comando | insumos | kit pronto | não | sim |
| 4 | Kit de envio | insumos | kit pronto | não | sim |
| 5 | Montagem da persiana | tecido + tubo + kit comando | peça | herda a do tecido | sim, mesmo SKU |
| 6 | Revisão | peça | peça aprovada | — | **não**, 1 por vez |
| 7 | Embalagem | peça + kit de envio | volume | — | a definir |
| 8 | Estoque | volume | — | — | — |

Sete das oito são a mesma coisa: **alguém bipa, faz N unidades, bipa de novo.**
A revisão é a exceção — sempre uma peça por vez. Por isso não faz sentido escrever
sete telas.

---

## 2. O motor de etapas

Uma única engrenagem: sessão, cronômetro, quantidade, produtividade, auditoria.
Cada etapa é um **cadastro** que descreve como ela se comporta.

```js
{
  chave:            'corte_tecido',
  nome:             'Corte de tecido',
  ordem:            1,
  permite_lote:     true,      // N unidades numa sessão
  gera_etiqueta:    true,      // imprime código único por unidade
  prefixo_etiqueta: 'T',       // T-000184
  consome:          ['insumo'],          // via ficha técnica
  produz:           'tecido_cortado',
  entrada_bipada:   [],                  // nada a bipar na entrada
  permissao:        'corte_tecido.executar'
}
```

A montagem da persiana é o caso mais completo:

```js
{
  chave:          'montagem_persiana',
  nome:           'Montagem da persiana',
  ordem:          5,
  permite_lote:   true,
  gera_etiqueta:  false,       // herda a etiqueta do tecido
  consome:        ['tecido_cortado','tubo_base','kit_comando'],
  entrada_bipada: ['tecido_cortado','tubo_base'],   // bipa as duas etiquetas
  produz:         'peca',
  permissao:      'montagem.executar'
}
```

**Criar a 9ª etapa vira cadastro, não código.** É o mesmo princípio do registro de
permissões: declarar faz a coisa existir.

### O que o motor entrega de graça para toda etapa

- Sessão com início, fim e tempo total
- Quantidade, com quantidade real diferente da prevista
- Uma sessão aberta por pessoa, fica aberta até a pessoa dar baixa
- Tempo médio por unidade
- Produtividade própria / equipe / nominal
- Registro em auditoria
- Permissão própria, declarada no registro

### O que é específico de cada etapa

Só três coisas: **o que consome, o que produz, e se gera etiqueta.**

---

## 3. Rastreabilidade — a etiqueta é a identidade

Este é o ponto que muda tudo.

```
  T-000184   tecido    ← cortado por Maria,  14:22, rolo #77
  U-000921   tubo      ← cortado por José,   09:10, barra #12
       │
       └──▶  bipados na montagem por Edivaldo, 16:04
             ▼
           PEÇA
             ▼
           revisada por Ana, 16:41  →  REJEITADA: "tecido com defeito"
```

Quando a Ana rejeita e escolhe o motivo, o sistema já sabe **de quem é o problema**:
tecido aponta para a Maria, tubo para o José, montagem para o Edivaldo. Sem a
etiqueta, tudo cai no montador.

### Duas consequências práticas

**1. A quantidade deixa de ser digitada.** Hoje o montador digita "6". Com etiqueta,
ele bipa 6 tecidos e a quantidade se conta sozinha. O campo continua existindo, só
para de ser preenchido à mão.

```
HOJE      bipa SKU  →  digita 6   →  monta  →  bipa fim
DEPOIS    bipa T-184, T-185, T-186...  →  monta  →  bipa fim
```

**2. O FIFO da fila de revisão vira desnecessário.** A peça carrega a etiqueta do
tecido. O revisor bipa essa etiqueta e o vínculo é exato, não estatístico.

> **Por isso o FIFO é uma ponte, não uma solução.** Vale enquanto a etiqueta não
> existe. Vale construir a peça já com o campo da etiqueta vazio, para que o dia em
> que a impressora chegar seja um cadastro e não uma migração.

### O que precisa estar decidido antes de imprimir a primeira etiqueta

| Pergunta | Por quê |
|---|---|
| Que impressora? Térmica de bancada? | Muda o formato do código |
| A etiqueta fica na peça até quando? | Se sair na embalagem, o vínculo com a venda se perde |
| Código sequencial ou com significado (SKU + data)? | Sequencial é mais robusto; legível ajuda no chão de fábrica |
| Tubo e base saem juntos numa etiqueta ou separados? | Você falou "corte de tubo e base" como uma etapa só |

---

## 4. Os kits como estoque

Kit de comando e kit de envio são montados em lote e **viram componentes com estoque
próprio**. A ficha técnica da persiana referencia o kit, não os parafusos dentro dele.

```
ficha técnica da persiana 4471
  ├─ tecido cortado      1
  ├─ tubo + base         1
  └─ kit de comando      1   ◀── que por sua vez tem ficha própria
                                   ├─ acionamento   1
                                   ├─ suporte       2
                                   └─ corrente      1
```

Um nível de aninhamento resolve o caso real. Não vale construir BOM recursiva
infinita para uma fábrica de persianas.

---

## 5. Onde o estoque baixa — decisão pendente

Você definiu: *"só dar baixa em tudo quando a persiana for embalada, não só
montada."* Isso funciona, mas tem uma nuance que precisa de decisão explícita.

### O que acontece fisicamente em cada etapa

| Etapa | O insumo... | É reversível? |
|---|---|---|
| Corte de tecido | o rolo vira retalho cortado | **não** — tecido cortado não volta a ser rolo |
| Corte de tubo | a barra vira peça no tamanho | **não** |
| Kit de comando | os parafusos viram kit | sim, dá para desmontar |
| Montagem | tecido + tubo + kit viram persiana | sim, dá para desmontar |
| Embalagem | a persiana vira volume | sim |

### Os dois modelos

**Modelo A — baixa só na embalagem** *(o que você descreveu)*
Todo o resto é reserva. Simples de explicar: nada sai do estoque até a peça estar
pronta para vender. O risco é que o rolo de tecido continue aparecendo como estoque
depois de já ter sido cortado — e compras pode achar que tem material que não tem.

**Modelo B — baixa na transformação irreversível, custo fechado na embalagem**
O rolo baixa no corte, porque o rolo deixou de existir. O tecido cortado passa a ser
estoque próprio. A embalagem fecha o custo da peça. Mais fiel ao chão de fábrica,
exige um cadastro de estoque a mais por etapa.

> **Sugestão: Modelo B**, porque a razão de existir do módulo de compras é saber o
> que comprar. Se o rolo cortado ainda conta como rolo, compras vai errar para menos
> exatamente no insumo que mais gira. Mas é a sua decisão — o Modelo A é mais simples
> e você conhece o giro da sua operação melhor que o desenho.

---

## 6. Modelo de dados do motor

```sql
-- ─── CADASTRO DE ETAPAS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS etapa (
  chave            TEXT PRIMARY KEY,
  nome             TEXT,
  ordem            INTEGER,
  permite_lote     INTEGER DEFAULT 1,
  gera_etiqueta    INTEGER DEFAULT 0,
  prefixo_etiqueta TEXT,
  produz           TEXT,             -- tipo de unidade produzida
  permissao        TEXT,
  ativa            INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS etapa_entrada (
  etapa_chave  TEXT REFERENCES etapa(chave),
  tipo         TEXT,                 -- tecido_cortado | tubo_base | kit_comando | insumo
  bipada       INTEGER DEFAULT 0,    -- 1 = o operador bipa a etiqueta
  PRIMARY KEY (etapa_chave, tipo)
);

-- ─── SESSÃO (serve para TODAS as etapas) ───────────────────────
CREATE TABLE IF NOT EXISTS sessao_producao (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  etapa_chave       TEXT REFERENCES etapa(chave),
  sku               TEXT,            -- nulo quando a etapa não é por SKU
  qtd_prevista      INTEGER,
  qtd_real          INTEGER,
  usuario_id        INTEGER,
  usuario_nome      TEXT,
  inicio            TEXT DEFAULT (datetime('now','localtime')),
  fim               TEXT,
  segundos_total    INTEGER,
  segundos_por_unid REAL,
  status            TEXT DEFAULT 'aberta',   -- aberta|concluida|anulada
  corrigida_por     TEXT,
  corrigida_em      TEXT,
  data              TEXT DEFAULT (date('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_sessao_etapa  ON sessao_producao(etapa_chave, data);
CREATE INDEX IF NOT EXISTS idx_sessao_aberta ON sessao_producao(status, usuario_id);

-- ─── UNIDADE PRODUZIDA (tecido, tubo, kit, peça — tudo aqui) ───
CREATE TABLE IF NOT EXISTS unidade (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo          TEXT,              -- tecido_cortado|tubo_base|kit_comando|kit_envio|peca
  etiqueta      TEXT UNIQUE,       -- T-000184 · nulo enquanto não houver impressora
  sku           TEXT,
  sessao_id     INTEGER REFERENCES sessao_producao(id),
  operador_id   INTEGER,
  operador_nome TEXT,
  status        TEXT,              -- disponivel|consumida|aguardando_revisao|...
  criado_em     TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_unidade_fila ON unidade(tipo, sku, status, criado_em);
CREATE INDEX IF NOT EXISTS idx_unidade_etiq ON unidade(etiqueta);

-- ─── CONSUMO: quem entrou em quem (a árvore de rastreabilidade) ─
CREATE TABLE IF NOT EXISTS unidade_consumo (
  unidade_pai    INTEGER REFERENCES unidade(id),   -- a peça
  unidade_filha  INTEGER REFERENCES unidade(id),   -- o tecido que entrou nela
  PRIMARY KEY (unidade_pai, unidade_filha)
);
```

**A tabela `unidade` é o coração.** Tecido, tubo, kit e persiana são todos unidades —
mudam de tipo, não de estrutura. `unidade_consumo` é a árvore: dado uma peça
rejeitada, uma consulta devolve quem cortou o tecido, quem cortou o tubo e quem
montou.

```sql
-- Quem participou desta peça?
SELECT f.tipo, f.etiqueta, f.operador_nome
FROM unidade_consumo c
JOIN unidade f ON f.id = c.unidade_filha
WHERE c.unidade_pai = ?;
```

---

## 7. Permissões novas

```js
// ─── PRODUÇÃO ───────────────────────────────────────────────
{ chave:'corte_tecido.executar',  grupo:'Produção', nivel:'operacao',
  rotulo:'Cortar tecido',         desc:'Bipar início e fim do corte de tecido' },
{ chave:'corte_tubo.executar',    grupo:'Produção', nivel:'operacao',
  rotulo:'Cortar tubo e base',    desc:'Bipar início e fim do corte de tubo' },
{ chave:'kit_comando.executar',   grupo:'Produção', nivel:'operacao',
  rotulo:'Montar kit de comando', desc:'Bipar início e fim da montagem do kit' },
{ chave:'kit_envio.executar',     grupo:'Produção', nivel:'operacao',
  rotulo:'Montar kit de envio',   desc:'Bipar início e fim da montagem do kit' },
{ chave:'montagem.executar',      grupo:'Produção', nivel:'operacao',
  rotulo:'Montar persianas',      desc:'Bipar início e fim da montagem' },
{ chave:'producao.corrigir',      grupo:'Produção', nivel:'admin',
  rotulo:'Corrigir sessão de produção',
  desc:'Ajustar sessão ou quantidade de qualquer etapa', sensivel:true },

// ─── CONFIGURAÇÃO ───────────────────────────────────────────
{ chave:'etapa.gerenciar',        grupo:'Configuração', nivel:'admin',
  rotulo:'Configurar etapas de produção',
  desc:'Criar e editar as etapas do processo', sensivel:true },
```

### Setores novos

| Setor | Nível | Permissões |
|---|---|---|
| **Operador / Corte** | operação | corte_tecido, corte_tubo, painel, produção própria |
| **Operador / Kits** | operação | kit_comando, kit_envio, painel, produção própria |
| **Operador / Montagem** | operação | montagem.executar, painel, produção própria |

> **Migração resolvida.** A área antiga `montagem` **é** a atual embalagem/expedição
> e continua migrando para *Operador / Embalagem*, como está na tabela do controle de
> acesso. O setor *Operador / Montagem* é novo e nasce vazio — ninguém migra para
> ele automaticamente. Você atribui à mão as pessoas que hoje montam persiana.

---

## 8. Ordem de implementação

| Fase | O quê | Entrega valor sozinha? |
|---|---|---|
| **1** | Motor de etapas + cadastro + a montagem da persiana como primeira etapa | **Sim** — mede o montador, que é o buraco de hoje |
| **2** | Produtividade por etapa (própria, equipe, nominal) | Sim |
| **3** | Corte de tecido e corte de tubo como etapas (sem etiqueta ainda) | Sim — mede o corte |
| **4** | Kit de comando e kit de envio, com estoque de kit pronto | Sim |
| **5** | Etiquetas de tecido e tubo: impressão, bipe na montagem, árvore de consumo | **Sim** — é aqui que a rejeição ganha dono |
| **6** | Ficha técnica e baixa de estoque (Modelo A ou B) | Sim |
| **7** | Integração com compras | Depende do módulo de compras |

**A Fase 1 é o MVP.** Ela custa um pouco mais que fazer a montagem sozinha, e as
fases 3 e 4 passam a ser quase só cadastro.

**A Fase 5 é a que você já anunciou.** Construir as fases 1 a 4 sabendo que ela vem
significa deixar os campos `etiqueta` e `unidade_consumo` prontos e vazios desde
o começo — o dia da impressora não vira migração.

---

## 9. Regras que não podem ser quebradas

1. **Toda etapa nasce no cadastro de etapas** — não existe etapa escrita à mão numa tela
2. **Sessão fica aberta até a pessoa dar baixa** — em qualquer etapa, igual à revisão
3. **Uma sessão aberta por pessoa** — em qualquer etapa
4. **A quantidade que vale é a real**, informada no fim
5. **A etiqueta é a identidade da unidade** — quando existir, ela substitui o FIFO
6. **A árvore de consumo nunca é apagada** — é ela que responde de quem foi o erro
7. **Revisão é sempre uma peça por vez** — é a única etapa sem lote
8. **Comparação de tempo só dentro do mesmo SKU e da mesma etapa**

---

## 10. O que ainda precisa ser decidido

| # | Pergunta | Trava qual fase |
|---|---|---|
| 1 | Modelo A ou B para a baixa de estoque? | 6 |
| 2 | Existe pausa dentro da sessão (almoço, banheiro)? | 1 |
| 3 | Peça rejeitada volta para o montador original ou para quem estiver livre? | 1 |
| 4 | Limite máximo de quantidade por sessão? | 1 |
| 5 | O operador escolhe o que fazer, ou o sistema indica pela necessidade (ABC)? | 3 |
| 6 | Embalagem trabalha em lote ou uma peça por vez? | 4 |
| 7 | Tubo e base saem numa etiqueta só ou em duas? | 5 |
| 8 | Que impressora de etiqueta, e a etiqueta sai da peça na embalagem? | 5 |
