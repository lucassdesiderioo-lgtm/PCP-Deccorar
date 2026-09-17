> **STATUS · 17/09/2026 — PLANEJADO · não iniciado** · mantido pelo dono em 17/09/2026, começa depois da fila de consertos
> Nenhuma tabela deste desenho existe (`montagem_sessao`, `peca`, `componente_reserva`).
> A tabela `componente` e a `ficha_tecnica` **existem**, criadas pelo módulo de Compras
> de forma provisória — o que faltar entra por `ALTER`, nunca recriando
> (`CLAUDE.md` §7-B). A rota `/montagem` hoje serve a tela de **Embalagem**.
> Movido do Projeto "PCP - Deccorar" para o repositório em 17/09/2026.

---

# Produção · Montagem da Persiana — Especificação

> Controle de tempo do montador. A etapa que vem **antes** da revisão.
> **Data:** 17/08/2026 · **Status:** desenho para revisão, nada implementado
>
> **Leia antes:** `PRODUCAO-MAPA-E-MOTOR.md` — a montagem é a **primeira instância**
> do motor de etapas, não um módulo isolado. Este documento detalha o comportamento
> específico dela; o motor, a cadeia produtiva e as etiquetas estão lá.

---

## 1. O problema que estamos resolvendo

Hoje o sistema mede o tempo da **revisão**. A etapa anterior — a pessoa que pega os
componentes e monta a persiana — não é medida por ninguém.

Três consequências:

**Não se sabe o custo de tempo da peça.** O tempo de revisão é conhecido, o de
montagem não. Sem os dois, não existe tempo real de produção por SKU.

**Não se sabe quem montou a peça rejeitada.** A revisão registra o problema, mas a
cadeia para ali. Não há como fechar o ciclo com quem montou.

**A fila da revisão não tem origem.** O revisor descobre o que tem para revisar
olhando a bancada, não o sistema.

---

## 2. O fluxo

Igual à revisão em estrutura — bipa para iniciar, bipa para terminar. **A única
diferença é a quantidade:** o montador pode fazer várias peças do mesmo SKU numa
mesma sessão.

```
1. Bipa o SKU              →  sistema mostra o produto
2. Digita a quantidade     →  quantas vai montar nesta sessão
3. Confirma                →  cronômetro começa
   ─────────  monta as peças  ─────────
4. Bipa o fim              →  confirma a quantidade real
5. Sessão fechada          →  tempo total + média por peça
                           →  N peças entram na fila de revisão
```

### Comparação com a revisão

| | Revisão | Montagem |
|---|---|---|
| Unidade da sessão | 1 peça | **N peças do mesmo SKU** |
| Início | bipe do SKU | bipe do SKU **+ quantidade** |
| Fim | bipe | bipe |
| Tempo registrado | tempo da peça | tempo total **e** média por peça |
| Sessão aberta | fica aberta até a pessoa dar baixa | **idêntico** |

Tudo o mais é igual. Se a regra existe na revisão, ela vale aqui.

---

## 3. Regras de negócio

### A quantidade

| Regra | Comportamento |
|---|---|
| Mínimo | 1 |
| Máximo por sessão | configurável (sugestão: 50) — trava erro de digitação |
| Quantidade real diferente da prevista | permitida, para mais ou para menos, com registro |
| Quantidade real = 0 | sessão anulada, não conta produção nem tempo |

O montador pode dizer que vai montar 10 e sair 8. O que vale para produção e para a
fila de revisão é sempre a **quantidade real**, informada no fim.

### A sessão aberta

**Mesma regra da revisão: a sessão fica aberta até a pessoa dar baixa.** Nada fecha
sozinho, nem no fim do expediente, nem na virada do dia. Se ficou aberta, ela aparece
aberta — e é a própria pessoa que encerra.

Consequências que precisam estar claras:

- Uma sessão que atravessa a noite fica com tempo distorcido. Ela é encerrada com o
  bipe real e o tempo é o tempo real.
- O tempo distorcido **entra** na média, porque é o que a operação registrou. Se
  isso incomodar depois, a correção é do admin (`montagem.corrigir`), não automática.
- O painel mostra as sessões abertas com o tempo correndo, para ninguém esquecer.

### Uma sessão por pessoa

Um montador tem **uma sessão aberta por vez**. Se bipar um SKU novo com sessão
aberta, o sistema pergunta:

```
Você tem uma montagem em andamento:
  Persiana Rolô Blackout 1,20m  ·  qtd 6  ·  há 22 min

  [ Voltar para ela ]     [ Encerrar e iniciar a nova ]
```

Duas pessoas **podem** montar o mesmo SKU ao mesmo tempo — são sessões independentes.

---

## 4. A fila de revisão

Terminada a montagem, as N peças entram como pendência de revisão.

### Como o revisor consome a fila

O revisor bipa o SKU, como já faz. O sistema **casa o bipe com a peça pendente mais
antiga daquele SKU** (FIFO) e fecha o vínculo montador → revisor.

> **O FIFO é uma ponte, não a solução.** Ele funciona sem etiqueta e sem mudar a
> rotina do revisor, mas a rastreabilidade é *estatística*: se duas pessoas montaram
> o mesmo SKU no dia, a rejeição pode cair na pessoa errada.
>
> A solução definitiva já está anunciada: **a etiqueta do tecido**. Quando o corte
> de tecido passar a imprimir um código único, ele acompanha a peça pela linha
> inteira, e o revisor bipa essa etiqueta em vez do SKU. O vínculo vira exato — e
> aponta também para quem cortou o tecido e quem cortou o tubo, não só o montador.
>
> Por isso a tabela nasce com o campo `etiqueta` vazio desde a Fase 1: o dia da
> impressora é um cadastro, não uma migração.

### Estados da peça

```
montada  →  aguardando revisão  →  em revisão  →  revisada  →  embalada
                                              ↘  rejeitada  →  retrabalho
```

O revisor não fica travado: se bipar um SKU sem peça na fila, ele revisa mesmo assim
e a peça entra sem montador vinculado. **A fila orienta, não bloqueia.**

---

## 5. Componentes e ficha técnica

Cada SKU tem uma **ficha técnica** — a lista de componentes que ele consome.

### Onde acontece a baixa

Esta foi a decisão central: **a baixa no estoque de componentes acontece na
embalagem, não na montagem.**

```
MONTAGEM         →  reserva os componentes    (empenho)
REVISÃO          →  não mexe no estoque
EMBALAGEM        →  dá baixa de verdade       (consumo)
```

O motivo é que a peça montada ainda pode ser rejeitada e voltar. Baixar na montagem
faria o estoque mentir para cima e para baixo a cada retrabalho.

### O que a reserva significa

```
disponível  =  estoque físico  −  reservado
```

O componente reservado ainda está fisicamente lá, mas já tem dono. É esse número que
o módulo de **compras** vai consumir mais adiante — comprar contra o estoque físico,
ignorando o que já está empenhado, é como o furo aparece.

### Casos de borda a decidir

| Situação | Proposta |
|---|---|
| Peça rejeitada e retrabalhada | reserva mantida — a peça continua existindo |
| Peça rejeitada e descartada | baixa por perda, com motivo, e libera a reserva |
| Peça montada sem ficha técnica cadastrada | monta normalmente, e o SKU aparece na tela de "fichas pendentes" |
| Ficha técnica alterada depois da montagem | a reserva congela a ficha vigente na hora da montagem |

O último ponto importa: se a ficha mudar entre montar e embalar, a baixa tem que usar
a ficha **do momento da montagem**, não a atual. Por isso a reserva grava a
quantidade, não só uma referência.

---

## 6. Modelo de dados

```sql
-- ─── SESSÃO DE MONTAGEM ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS montagem_sessao (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  sku                TEXT NOT NULL,
  qtd_prevista       INTEGER NOT NULL,
  qtd_real           INTEGER,             -- preenchida no fim
  usuario_id         INTEGER,
  usuario_nome       TEXT,                -- sobrevive à desativação
  inicio             TEXT DEFAULT (datetime('now','localtime')),
  fim                TEXT,
  segundos_total     INTEGER,
  segundos_por_peca  REAL,                -- total / qtd_real
  status             TEXT DEFAULT 'aberta',  -- aberta|concluida|anulada
  corrigida_por      TEXT,
  corrigida_em       TEXT,
  data               TEXT DEFAULT (date('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_mont_data    ON montagem_sessao(data);
CREATE INDEX IF NOT EXISTS idx_mont_usuario ON montagem_sessao(usuario_id);
CREATE INDEX IF NOT EXISTS idx_mont_aberta  ON montagem_sessao(status, usuario_id);

-- ─── PEÇA MONTADA (uma linha por peça, gerada no fim da sessão) ─
CREATE TABLE IF NOT EXISTS peca (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sku           TEXT NOT NULL,
  sessao_id     INTEGER REFERENCES montagem_sessao(id),
  montador_id   INTEGER,
  montador_nome TEXT,
  status        TEXT DEFAULT 'aguardando_revisao',
                -- aguardando_revisao|em_revisao|revisada|rejeitada|descartada|embalada
  revisor_id    INTEGER,
  revisor_nome  TEXT,
  revisada_em   TEXT,
  embalada_em   TEXT,
  criado_em     TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_peca_fila ON peca(sku, status, criado_em);

-- ─── COMPONENTES E FICHA TÉCNICA ───────────────────────────────
CREATE TABLE IF NOT EXISTS componente (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo        TEXT UNIQUE,
  nome          TEXT,
  unidade       TEXT,               -- un|m|kg
  estoque       REAL DEFAULT 0,
  ativo         INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ficha_tecnica (
  sku           TEXT,
  componente_id INTEGER REFERENCES componente(id),
  quantidade    REAL,
  PRIMARY KEY (sku, componente_id)
);

-- Reserva: criada no fim da montagem, consumida na embalagem.
-- Grava a quantidade congelada, não uma referência à ficha atual.
CREATE TABLE IF NOT EXISTS componente_reserva (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  peca_id       INTEGER REFERENCES peca(id),
  componente_id INTEGER REFERENCES componente(id),
  quantidade    REAL,
  status        TEXT DEFAULT 'reservado',  -- reservado|consumido|liberado|perda
  criado_em     TEXT DEFAULT (datetime('now','localtime')),
  baixado_em    TEXT
);
CREATE INDEX IF NOT EXISTS idx_reserva_peca ON componente_reserva(peca_id, status);
```

**Disponível de um componente:**

```sql
SELECT c.estoque - COALESCE(SUM(r.quantidade), 0) AS disponivel
FROM componente c
LEFT JOIN componente_reserva r
  ON r.componente_id = c.id AND r.status = 'reservado'
WHERE c.id = ?
GROUP BY c.id;
```

---

## 7. Permissões novas

Uma linha por permissão no registro (`permissoes.js`) — a caixinha aparece sozinha na
tela de cadastro, conforme a regra 5 do controle de acesso.

```js
// ─── PRODUÇÃO ───────────────────────────────────────────────
{ chave:'montagem.executar',   grupo:'Produção',   nivel:'operacao',
  rotulo:'Montar peças',       desc:'Bipar início e fim da montagem' },
{ chave:'montagem.corrigir',   grupo:'Produção',   nivel:'admin',
  rotulo:'Corrigir montagem',  desc:'Ajustar sessão ou quantidade de outro operador',
  sensivel:true },

// ─── ESTOQUE ────────────────────────────────────────────────
{ chave:'componente.cadastrar', grupo:'Estoque',   nivel:'admin',
  rotulo:'Cadastrar componente', desc:'Criar e editar insumos' },

// ─── PLANEJAMENTO ───────────────────────────────────────────
{ chave:'ficha.editar',        grupo:'Planejamento', nivel:'admin',
  rotulo:'Editar ficha técnica', desc:'Definir os componentes de cada SKU' },
```

### Setor novo

| Setor | Nível | Permissões |
|---|---|---|
| **Operador / Montagem** | operação | montagem.executar, painel.ver, produtividade.propria |

> **Migração — resolvido.** A área antiga chamada `montagem` na verdade é a
> **embalagem/expedição** de hoje, e continua migrando para *Operador / Embalagem*
> exatamente como está na tabela do controle de acesso. Nada muda ali.
>
> O setor *Operador / Montagem* é **novo e nasce vazio**. Ninguém é migrado para ele
> automaticamente — você atribui à mão quem realmente monta persiana. É o
> comportamento seguro: na dúvida, ninguém ganha acesso sem alguém decidir.

---

## 8. Produtividade do montador

Segue os três graus já definidos no controle de acesso.

| Grau | O que vê |
|---|---|
| **Própria** | *"Você montou 34 peças hoje · média 4min12s por peça"* |
| **Equipe** | *"87 peças montadas · Operador A: 40 · B: 32 · C: 15"* |
| **Nominal** | *"Edivaldo: 40 · Maria: 32 · João: 15"* — sensível, fica na auditoria |

A média por peça é `segundos_total / qtd_real` da sessão. O total do dia é a soma das
peças; o tempo médio do dia é a soma dos segundos dividida pela soma das peças — não
a média das médias, que distorceria a favor das sessões pequenas.

**Comparação entre SKUs** só faz sentido dentro do mesmo SKU. Uma persiana de 3m leva
mais tempo que uma de 1m e isso não é produtividade, é produto. O relatório agrupa
por SKU antes de comparar pessoas.

---

## 9. A tela

```
┌──────────────────────────────────────────────────────────┐
│  MONTAGEM                                    Edivaldo    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   ▸ EM ANDAMENTO                                         │
│                                                          │
│     Persiana Rolô Blackout 1,20m × 1,60m                 │
│     SKU 4471                                             │
│                                                          │
│     Quantidade  6                        ⏱  22:14        │
│                                                          │
│              [  FINALIZAR MONTAGEM  ]                    │
│                                                          │
├──────────────────────────────────────────────────────────┤
│   Hoje: 34 peças · média 4min12s                         │
└──────────────────────────────────────────────────────────┘
```

Tela de finalização:

```
┌──────────────────────────────────────────────────────────┐
│  Finalizar — SKU 4471                                    │
│                                                          │
│  Quantas peças saíram?                                   │
│                                                          │
│              ┌─────────┐                                 │
│         [−]  │    6    │  [+]                            │
│              └─────────┘                                 │
│                                                          │
│  Tempo: 22min14s  ·  média 3min42s por peça              │
│                                                          │
│         [ Cancelar ]      [ Confirmar ]                  │
└──────────────────────────────────────────────────────────┘
```

Mesma linguagem visual da revisão. Botão grande, teclado numérico, nada de digitação
livre — a bancada é rápida e a pessoa está de luva.

---

## 10. Auditoria

Acrescenta à categoria **Produção**:

| Ação | Quando |
|---|---|
| Montagem iniciada | não registra (é operação normal, geraria volume) |
| Montagem finalizada | **registra** — SKU, quantidade, tempo |
| Quantidade real ≠ prevista | **registra** com a diferença |
| Sessão corrigida por admin | **registra** — quem corrigiu, o que mudou |
| Sessão anulada | **registra** com motivo |
| Baixa de componente por perda | **registra** — peça, componentes, motivo |

Segue a regra do controle de acesso: registra o que muda coisas, não cada tela aberta.

---

## 11. Ordem de implementação

| Fase | O quê | Já tem valor sozinha? |
|---|---|---|
| **1** | Motor de etapas + montagem como primeira etapa: bipe, quantidade, tempo | **Sim** — já mede o montador |
| **2** | Produtividade do montador (própria, equipe, nominal) | Sim |
| **3** | Fila de revisão: peça montada vira pendência, FIFO no bipe do revisor | Sim — fecha montador → revisor |
| **4** | Etiqueta de tecido e tubo: o FIFO é substituído pelo vínculo exato | Sim — a rejeição ganha dono |
| **5** | Cadastro de componentes + ficha técnica por SKU | Não, é base para a 6 |
| **6** | Reserva na montagem, baixa na embalagem, tela de disponível | Sim |
| **7** | Integração com compras | Depende do módulo de compras |

**O MVP é a Fase 1.** Ela sozinha responde a pergunta que não tem resposta hoje:
quanto tempo leva para montar cada SKU. E como ela entrega o motor junto, as etapas
de corte e de kits viram quase só cadastro depois.

As fases 5 e 6 são um projeto próprio — a ficha técnica de toda a linha é trabalho
de cadastro, não de código.

---

## 12. Regras que não podem ser quebradas

1. **Sessão fica aberta até a pessoa dar baixa** — nada fecha sozinho, igual à revisão
2. **Uma sessão aberta por pessoa** — bipar outro SKU exige decidir sobre a anterior
3. **A quantidade que vale é a real**, informada no fim, nunca a prevista
4. **Baixa de componente só na embalagem** — a montagem apenas reserva
5. **A reserva congela a ficha técnica** do momento da montagem
6. **A fila de revisão orienta, não bloqueia** — o revisor nunca fica travado
7. **Comparação de tempo só dentro do mesmo SKU**

---

## 13. O que ainda precisa ser decidido

| # | Pergunta | Impacto |
|---|---|---|
| 1 | Existe pausa (almoço, banheiro) dentro da sessão? | Sem ela, o tempo médio de quem para no meio fica alto |
| 2 | Peça rejeitada volta para o montador original ou para quem estiver livre? | Fila de retrabalho |
| 3 | Qual o limite máximo de quantidade por sessão? | Trava de erro de digitação |
| 4 | O montador escolhe o que montar ou o sistema indica pela necessidade (ABC)? | Ligação com o planejamento |
| 5 | Modelo A ou B para a baixa de estoque? | Ver `PRODUCAO-MAPA-E-MOTOR.md`, seção 5 |

**Resolvidas nesta rodada:** FIFO é ponte até a etiqueta do tecido · a área antiga
`montagem` é a embalagem de hoje e continua migrando como está.
