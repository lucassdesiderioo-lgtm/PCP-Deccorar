> **ARQUIVADO · 17/09/2026** — prompt executado: o módulo foi construído a partir de
> 28/08/2026 em `tecido/`. A fonte da verdade é o `tecido/README.md`. Várias decisões
> mudaram na construção — em especial, o módulo **não** é mais uma aplicação separada:
> vive dentro do PCP em `/sobmedida`, com o mesmo PIN. Movido do Projeto "PCP - Deccorar".

---

# Prompt para o Claude Code — Módulo Estoque de Tecido, Sobras e Plano de Corte

> Cole este arquivo inteiro como primeira mensagem numa sessão nova do Claude Code,
> dentro da pasta onde o módulo vai morar.

---

## 0. Antes de escrever qualquer linha

Leia esta especificação inteira. Depois **me faça as perguntas da seção 11** e espere
minha resposta. Não comece a codar antes disso.

Quando começar, siga a **ordem de entrega da seção 9**. Uma fase por vez, rodando,
validada comigo antes da próxima.

**O coração deste módulo é a seção 6 — o algoritmo do plano de corte.** Leia-a duas
vezes. Se as seções 6 e 9 forem bem executadas, o resto é CRUD.

---

## 1. Contexto

Fábrica de persianas. Existe um sistema de PCP/Expedição em Node + Express + SQLite
que atende a operação de **medida padrão** (Mercado Livre).

Este módulo é **outra operação: persianas sob medida**. Outros tecidos, outro estoque,
outro galpão. **Nasce como aplicação separada, com banco próprio.** A junção com o
sistema existente é desejada no futuro, e por isso a linguagem (unidade, etiqueta,
endereço, movimento) é mantida compatível — mas hoje **não há integração de nenhum
tipo**.

### O problema

O tecido entra em rolo e sai em retalho. A ponta que sobra do corte é material bom,
comprado, que encalha na prateleira porque não existe registro do que é, quanto mede e
onde está. Como a operação é sob medida, **cada corte gera um retalho de medida
inédita** — o acervo fica grande demais para a memória de alguém, e o retalho deixa de
ser usado não porque não serve, mas porque ninguém sabe que ele existe.

### As três perguntas

```
1.  Quanto eu tenho do tecido X?     →  saldo em metro, por rolo, com endereço
2.  Que sobras eu tenho do tecido X? →  lista com medida, condição e endereço
3.  Estas medidas que vou cortar — COMO CORTAR?
        de qual bobina, com as peças encaixadas lado a lado,
        procurando primeiro nas sobras, e dizendo o que vai sobrar
```

**Tudo que não serve a essas três está fora de escopo.**

---

## 2. Fora de escopo — não construa

- Integração automática com o ERP (banco, API, importação agendada)
- Ordem de produção, pedido, cliente, peça montada, etapa de fabricação
- Reserva de sobra com validade/expiração
- Bloqueio duro que impeça o operador de cortar
- Custo, preço, valorização em reais
- Qualquer ligação com o banco do sistema de Mercado Livre

O **upload manual de um arquivo** com as medidas está no escopo, na última fase. O
operador sobe o arquivo — não é integração.

---

## 3. Pilha e arquitetura — obrigatórias

**Pilha:** Node · Express · SQLite (`better-sqlite3`) · HTML sem framework · **sem
build, sem TypeScript, sem bundler**. Nenhuma dependência de front.

```
/
├── server.js              ~30 linhas: sobe o banco, monta o registro, escuta
│
├── nucleo/                infraestrutura. Não sabe nada de tecido.
│   ├── db.js · schema.js (todo o DDL, numerado) · erros.js · dia.js
│   ├── registro.js        declaração → permissão + auditoria + erro + envelope
│   └── config.js          parâmetros do sistema (seção 6.5)
│
├── dominio/               a regra. NÃO conhece Express, req, res.
│   ├── tecido.js · endereco.js · motivo.js
│   ├── rolo.js            ← único dono de rolo.saldo
│   ├── sobra.js           ← único dono de sobra.status
│   ├── encaixe.js         ← O ALGORITMO. Função pura, sem banco. (seção 6)
│   └── plano.js           orquestra: busca candidatos, chama encaixe, monta o plano
│
├── dados/                 o SQL. Uma tabela, um arquivo. Não decide nada.
├── rotas/                 declarações. Sem SQL, sem `if` de negócio.
└── public/
    ├── base.css           tokens. NENHUM hex dentro de tela.
    ├── ui.js              api() · banner() · beep() · formatarMedida()
    └── telas/  cadastros · entrada-rolo · cadastro-sobra · plano-de-corte · painel
```

### Regras que não podem ser quebradas

1. **A regra de negócio mora em `dominio/`.** `if` de negócio dentro de handler HTTP
   está no lugar errado.
2. **`dominio/encaixe.js` é função pura**: recebe números, devolve números. Sem banco,
   sem HTTP, sem Express. É o único jeito de testá-lo de verdade.
3. **Uma tabela, um dono.** `rolo.saldo` só muda por `dominio/rolo.js`. `sobra.status`
   só por `dominio/sobra.js`.
4. **Todo movimento deixa registro.** Saldo de rolo nunca muda sem linha em
   `movimento_rolo`.
5. **Rota nasce declarada.** `app.get`/`app.post` direto não existe fora de
   `nucleo/registro.js`. Rota sem `permissao` é **negada**.
6. **Um envelope de resposta:** `{ok:true, dados}` /
   `{ok:false, motivo:'chave_tecnica', mensagem:'texto humano'}`. Nenhum stack trace
   chega ao operador.
7. **O DDL mora em `nucleo/schema.js`**, numerado, com tabela de migrações.
8. **Nenhum hex dentro de uma tela.**
9. **Datas pelo SQLite** (`datetime('now','localtime')`), centralizadas em
   `nucleo/dia.js`. Nada de `new Date()` espalhado.
10. **Medidas em metros, `REAL`, sempre.** Exibição `1,80 × 3,00` por função única em
    `ui.js`. Toda comparação com tolerância de 1 mm (`0.001`).

---

## 4. Como o corte funciona — leia antes do schema

Esta é a mecânica física da fábrica. Errar aqui compromete o módulo inteiro.

**A largura da peça é cortada no sentido da largura da bobina. A altura da peça é o
que corre no rolo.** Várias peças são posicionadas lado a lado na largura, e o rolo
baixa apenas os metros lineares puxados.

```
3 peças de 0,90 × 2,50          Σ das larguras = 2,70

  BOBINA 3,00                BOBINA 2,50               BOBINA 2,00
  ┌───┬───┬───┬─┐            ┌───┬───┬────┐            ┌───┬───┬┐
  │0,9│0,9│0,9│▓│ 2,50       │0,9│0,9│▓▓▓▓│ 2,50       │0,9│0,9│▓ 2,50
  └───┴───┴───┴─┘            ├───┼───┴────┤            ├───┼───┴┤
        resto 0,30           │0,9│▓▓▓▓▓▓▓▓│ 2,50       │0,9│▓▓▓▓│ 2,50
                             └───┴────────┘            └───┴────┘

  puxa 2,50 m                puxa 5,00 m               puxa 5,00 m
  = 7,50 m²                  = 12,50 m²                = 10,00 m²
```

A bobina de 3,00 vence — as três peças cabem numa puxada só. **Repare que a de 2,00
bate a de 2,50: bobina mais estreita pode aproveitar melhor.** O sistema simula todas
as larguras que existem em estoque; nunca escolhe a mais larga por padrão. Quando a
bobina ideal não existe, ele readequa nas que existem.

### Vocabulário — use estes nomes no código

| Termo | O que é |
|---|---|
| **faixa** | uma puxada do rolo. Largura = largura da bobina. Altura = a maior altura entre as peças que ela carrega |
| **encaixe** | as peças posicionadas lado a lado dentro da faixa |
| **tira lateral** | o que resta da largura da faixa depois das peças |
| **resto de pé** | o que resta embaixo de uma peça mais baixa que a faixa |
| **consumo** | Σ das alturas das faixas, em metro linear — é o que baixa do rolo |

---

## 5. Modelo de dados

Mantenha a forma: hierarquia de tecido, hierarquia de endereço com dois armazéns,
histórico de movimento, e o plano com seu encaixe gravado.

```sql
-- ─── CADASTRO DE TECIDO ────────────────────────────────────────
CREATE TABLE linha (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,   -- 'Rolô', 'Romana'
  ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
);
CREATE TABLE abertura (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  linha_id INTEGER NOT NULL REFERENCES linha(id),
  nome TEXT NOT NULL,                          -- '1%', '3%', 'Blackout'
  ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1,
  UNIQUE(linha_id, nome)
);
CREATE TABLE cor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,    -- 'Bege', 'Branco'
  ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
);

-- O item de estoque é a combinação que EXISTE comercialmente.
-- ATENÇÃO: a largura da bobina NÃO é do tecido — é do rolo. O mesmo
-- Rolô 3% Bege existe em 2,00, 2,50 e 3,00, e é essa diferença que o
-- plano de corte explora. Aqui fica só uma sugestão para a entrada.
CREATE TABLE tecido (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE COLLATE NOCASE,           -- gerado: 'ROLO-3-BEGE'
  linha_id INTEGER NOT NULL REFERENCES linha(id),
  abertura_id INTEGER NOT NULL REFERENCES abertura(id),
  cor_id INTEGER NOT NULL REFERENCES cor(id),
  largura_sugerida REAL,                       -- só pré-preenche a entrada de rolo
  permite_girar INTEGER DEFAULT 0,             -- 0 = tecido tem sentido
  ativo INTEGER DEFAULT 1,
  UNIQUE(linha_id, abertura_id, cor_id)
);

-- ─── ENDEREÇAMENTO — DOIS ARMAZÉNS, TUDO CADASTRÁVEL ───────────
CREATE TABLE armazem (chave TEXT PRIMARY KEY, nome TEXT NOT NULL);  -- 'ROLO','SOBRA'
CREATE TABLE haste (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  armazem_chave TEXT NOT NULL REFERENCES armazem(chave),
  nome TEXT NOT NULL, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1,
  UNIQUE(armazem_chave, nome)
);
CREATE TABLE andar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  haste_id INTEGER NOT NULL REFERENCES haste(id),
  nome TEXT NOT NULL, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1,
  UNIQUE(haste_id, nome)
);
CREATE TABLE nivel (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  andar_id INTEGER NOT NULL REFERENCES andar(id),
  nome TEXT NOT NULL, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1,
  UNIQUE(andar_id, nome)
);
-- Endereço final = nivel_id. Exibição 'ROLO · A-02-03' por função única
-- em dominio/endereco.js.

-- ─── ROLO ──────────────────────────────────────────────────────
CREATE TABLE rolo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE COLLATE NOCASE,           -- 'R-000087', sequencial
  tecido_id INTEGER NOT NULL REFERENCES tecido(id),
  largura REAL NOT NULL,                       -- largura DESTA bobina
  metragem_inicial REAL NOT NULL,              -- da NF; não conferida hoje
  saldo REAL NOT NULL,                         -- metro linear
  nivel_id INTEGER REFERENCES nivel(id),       -- armazém ROLO
  status TEXT DEFAULT 'fechado',               -- fechado|aberto|encerrado
  nf TEXT, fornecedor TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime')), criado_por TEXT
);
CREATE INDEX idx_rolo_busca ON rolo(tecido_id, status, largura, saldo);

CREATE TABLE movimento_rolo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rolo_id INTEGER NOT NULL REFERENCES rolo(id),
  delta REAL NOT NULL,          -- + entrada, − consumo, ± ajuste
  saldo_apos REAL NOT NULL,
  motivo TEXT NOT NULL,         -- entrada|consumo|ajuste|encerramento
  referencia TEXT,              -- id do plano que gerou o consumo
  observacao TEXT, usuario_nome TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  data TEXT DEFAULT (date('now','localtime'))
);

-- ─── SOBRA ─────────────────────────────────────────────────────
CREATE TABLE sobra (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE COLLATE NOCASE,           -- 'S-000142', etiqueta pré-impressa
  tecido_id INTEGER NOT NULL REFERENCES tecido(id),
  largura REAL NOT NULL, altura REAL NOT NULL,
  area REAL GENERATED ALWAYS AS (largura * altura) STORED,
  condicao TEXT NOT NULL,       -- integra|mancha|furo|tom_fora|borda_desfiada
  nivel_id INTEGER NOT NULL REFERENCES nivel(id),  -- armazém SOBRA
  origem TEXT,                  -- 'rolo' | 'sobra' | 'inventario'
  origem_rolo_id INTEGER REFERENCES rolo(id),
  origem_sobra_id INTEGER REFERENCES sobra(id),
  status TEXT DEFAULT 'disponivel',   -- disponivel|usada|descartada
  criado_em TEXT DEFAULT (datetime('now','localtime')), criado_por TEXT,
  baixado_em TEXT, baixado_por TEXT, baixa_motivo TEXT
);
CREATE INDEX idx_sobra_busca ON sobra(tecido_id, status, largura, altura);

-- ─── REFUGO — a perda fica medida, não some ────────────────────
CREATE TABLE refugo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tecido_id INTEGER REFERENCES tecido(id),
  largura REAL, altura REAL, area REAL,
  motivo TEXT,                  -- 'tira_estreita'|'resto_de_pe'|'descarte'
  plano_id INTEGER, usuario_nome TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  data TEXT DEFAULT (date('now','localtime'))
);

-- ─── MOTIVOS DE RECUSA — CADASTRO, NÃO LISTA FIXA ──────────────
CREATE TABLE motivo_recusa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
  ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
);
-- Seed: 'Tonalidade diferente' · 'Defeito não cadastrado'
--       'Textura / brilho diferente' · 'Peça do mesmo pedido — tom único' · 'Outro'
-- O diretor acrescenta os que aparecerem. NÃO deixe essa lista no código.

-- ─── PLANO DE CORTE — o histórico e o diagnóstico ──────────────
CREATE TABLE plano (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tecido_id INTEGER REFERENCES tecido(id),
  origem TEXT,                  -- 'digitado' | 'arquivo'
  consumo_linear REAL, consumo_m2 REAL,
  area_pecas REAL, area_sobra_gerada REAL, desperdicio REAL,
  usuario_nome TEXT, confirmado INTEGER DEFAULT 0,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  data TEXT DEFAULT (date('now','localtime'))
);

CREATE TABLE plano_peca (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plano_id INTEGER NOT NULL REFERENCES plano(id),
  ordem INTEGER,
  tecido_id INTEGER REFERENCES tecido(id),   -- pode diferir do cabeçalho
  largura REAL NOT NULL, altura REAL NOT NULL,
  faixa_id INTEGER,             -- em qual faixa esta peça ficou
  pos_x REAL,                   -- posição na largura da faixa, para desenhar
  recusa_motivo_id INTEGER REFERENCES motivo_recusa(id),
  recusa_obs TEXT
);

CREATE TABLE plano_faixa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plano_id INTEGER NOT NULL REFERENCES plano(id),
  ordem INTEGER,
  fonte TEXT,                   -- 'rolo' | 'sobra'
  rolo_id INTEGER REFERENCES rolo(id),
  sobra_id INTEGER REFERENCES sobra(id),
  largura_disponivel REAL, altura REAL,
  largura_usada REAL,
  sobra_gerada_codigo TEXT      -- etiqueta que o operador colou ao confirmar
);
```

---

## 6. O ALGORITMO — `dominio/encaixe.js`

**Função pura.** Recebe números, devolve números. Sem banco, sem HTTP.

### 6.1 Assinatura

```js
/**
 * @param {Array<{id, largura, altura}>} pecas
 * @param {Array<{id, fonte:'rolo'|'sobra', largura, alturaMax}>} fontes
 *        rolo  → alturaMax = saldo do rolo
 *        sobra → alturaMax = altura da sobra (retângulo finito)
 * @param {{margem, larguraMinimaSobra, pesoSobra}} params
 * @returns {{ faixas, pecasNaoAlocadas, consumoLinear, consumoM2,
 *             areaPecas, sobrasGeradas, refugos, desperdicio }}
 */
function planejar(pecas, fontes, params)
```

### 6.2 Como montar as faixas (encaixe numa fonte)

```
1. Ordene as peças por ALTURA DECRESCENTE.
   (peça mais alta primeiro — ela define a altura da faixa)

2. Para cada peça, na ordem:
     tente colocá-la numa faixa já aberta desta fonte, onde:
         largura_usada + margem + peca.largura  ≤  largura_disponivel
     se não couber em nenhuma, abra faixa nova com altura = peca.altura
     (só se a soma das alturas das faixas ainda couber em alturaMax)

3. A altura da faixa é a altura da PRIMEIRA peça dela — a mais alta,
   porque a lista está ordenada decrescente.
```

**Alturas diferentes PODEM dividir a mesma faixa.** A faixa puxa a maior altura, e a
peça mais baixa deixa um **resto de pé**:

```
┌──────┬──────┬────┐
│ 0,90 │ 0,90 │▓▓▓▓│  ← faixa de altura 2,50
│ 2,50 │ 1,80 │    │
│      ├──────┤    │
│      │▓▓▓▓▓▓│    │  ← resto de pé: 0,90 × 0,70
└──────┴──────┴────┘
              ▲
        tira lateral: (largura_disponivel − largura_usada) × 2,50
```

### 6.3 Os restos de cada faixa

```
tira lateral  =  (largura_disponivel − largura_usada) × altura_da_faixa
resto de pé   =  peca.largura × (altura_da_faixa − peca.altura)   ← por peça
```

Para cada resto:

```
se resto.largura ≥ larguraMinimaSobra   →  vira SOBRA (etiqueta a colar)
senão                                    →  vira REFUGO (registrado, não some)
```

**A regra vale igual para resto de rolo e resto de sobra.** Não existe mais "sobra não
gera sobra" — existe *"resto com largura ≥ mínimo vira sobra, venha de onde vier"*.
Os 80 cm padrão valem **só para a largura**; altura não tem mínimo.

### 6.4 O critério de escolha

Para **cada largura de bobina distinta** que existe em estoque daquele tecido, rode o
encaixe e calcule:

```
consumo_m2   =  Σ (altura_da_faixa)  ×  largura_da_bobina
area_pecas   =  Σ (peca.largura × peca.altura)
area_sobras  =  Σ (área dos restos que viraram sobra)

desperdicio  =  consumo_m2 − area_pecas − (area_sobras × pesoSobra)
```

**Vence a menor `desperdicio`.** Empate: menor `consumo_linear`.

Conferência obrigatória, com os parâmetros padrão (margem 0, mínimo 0,80,
peso 0,50) e as 3 peças de 0,90 × 2,50:

```
                  consumo   peças   sobra gerada    creditado   DESPERDÍCIO
BOBINA 3,00        7,50     6,75    —                 —           0,75  ← vence
BOBINA 2,50       12,50     6,75    1,60 × 2,50      2,00         3,75
BOBINA 2,00       10,00     6,75    1,10 × 2,50      1,375        1,875
```

**Se o seu código não reproduzir exatamente esta tabela, ele está errado.** Escreva
este caso como o primeiro teste, antes do resto.

### 6.5 Parâmetros — cadastráveis, nunca constantes no código

| Chave | Padrão | O que faz |
|---|---|---|
| `larguraMinimaSobra` | `0.80` | Abaixo desta largura, o resto é refugo em vez de sobra |
| `pesoSobra` | `0.50` | Quanto da sobra gerada conta como material recuperado |
| `margem` | **perguntar** (seção 11) | Folga entre peças e nas bordas da bobina |

> `pesoSobra` é a única variável de julgamento do módulo. Ela responde a uma pergunta
> de fábrica: *o retalho que vai pra prateleira volta a ser usado, ou encalha?* Metade
> é o palpite honesto de quem ainda não tem histórico. Deixe-a numa tela de
> configuração, com um texto curto explicando o efeito.

### 6.6 A ordem geral do plano — `dominio/plano.js`

```
ENTRADA: tecido + lista de peças (largura × altura)

1. SOBRAS PRIMEIRO — política da casa.
   Candidatas: sobras 'disponivel' daquele tecido, com
     largura ≥ maior largura de peça a alocar
     altura  ≥ maior altura de peça a alocar
   SEM ROTAÇÃO quando tecido.permite_girar = 0:
     uma sobra 0,70 × 3,00 NUNCA serve para uma peça 3,00 × 0,70.
   Ordene as sobras por MENOR ÁREA e tente encaixar nelas, uma a uma,
   consumindo cada sobra INTEIRA (ela pode carregar várias peças).

2. O QUE SOBROU VAI PARA O ROLO.
   Para cada largura de bobina distinta com saldo suficiente,
   rode 6.2–6.4 e escolha a vencedora.
   Dentro da largura vencedora, escolha o rolo específico:
     rolo 'aberto' antes de 'fechado';
     entre abertos, o de MENOR SALDO (fecha o rolo velho antes de abrir outro);
     saldo ≥ consumo_linear.

3. PEÇA QUE NÃO CABE EM LUGAR NENHUM volta marcada, com o motivo:
   "nenhuma bobina em estoque tem largura ≥ 1,90" — nunca sumir em silêncio.

4. MONTE O PLANO com faixas, posições (pos_x) e restos, para a tela desenhar.
```

**Sempre informe por que nenhuma sobra serviu**, citando a maior sobra disponível
daquele tecido: *"a maior é 1,05 × 2,30"*. Sem essa frase o operador desconfia do
"não" e vai conferir a prateleira na mão de qualquer jeito.

---

## 7. Regras de negócio — numeradas

### Tecido e endereço

**R1.** Item de tecido = **linha + abertura + cor**. As três hierarquias são cadastros
livres.

**R2.** **A largura da bobina pertence ao ROLO, não ao tecido.** O mesmo tecido existe
em várias larguras e é isso que o plano explora.

**R3.** `permite_girar = 0` por padrão — o tecido tem sentido. Regra viva no filtro
(6.6), não enfeite de cadastro.

**R4.** Dois armazéns: `ROLO` e `SOBRA`, áreas físicas diferentes do mesmo galpão.
Rolo **fechado e aberto ficam no mesmo armazém `ROLO`** — muda o status, não o lugar.

**R5.** **Nenhuma quantidade de haste, andar ou nível é decidida no código.** Tudo
cadastro. Rolo só endereça em nível do armazém `ROLO`; sobra só em `SOBRA` — violação
é `ErroDeRegra`, não aviso de tela.

### Rolo

**R6.** Código único sequencial (`R-000087`). **Não existe saldo genérico por tecido no
banco** — o saldo é sempre a soma dos rolos.

**R7.** Três movimentos, todos gravam em `movimento_rolo`: `entrada` (saldo +, status
`fechado`), `consumo` (saldo −, status `aberto`), `ajuste`.

**R8.** O **primeiro consumo** vira o rolo de `fechado` para `aberto`
automaticamente. Não existe campo que o operador marque.

**R9. Acerto no fim do rolo.** Operador marca "rolo acabou": o sistema encerra, zera o
saldo e grava `delta = −saldo_anterior`, `motivo='encerramento'`. **A metragem vem da
nota e não é conferida na entrada** — sem esse acerto o saldo infla mês a mês com
metros que nunca existiram.

**R10.** m² nunca é digitado: `saldo × largura`. O operador só mexe com metro linear.

### Sobra

**R11.** Etiqueta **sequencial pré-impressa** (`S-000142`) — não há impressora na
bancada. O código é **digitado/bipado pelo operador, não gerado pelo sistema**. Código
repetido é `ErroDeRegra` com mensagem clara. Deve existir uma lista de **etiquetas
coladas e não cadastradas** (lacunas na sequência).

**R12.** Ao ser usada num plano, a sobra sai **inteira** (`status='usada'`), mesmo
carregando várias peças. Seus restos seguem a regra 6.3 como qualquer outro resto.

**R13.** Estados: `disponivel → usada` ou `disponivel → descartada`. Não existe
`reservada`.

**R14.** Obrigatórios: código, tecido, largura, altura, condição, endereço. Origem é
opcional e nunca trava o lançamento.

### O plano

**R15. Sobra primeiro, rolo depois.** Política da casa, sem exceção automática.

**R16. Recusa com motivo.** Toda sobra sugerida tem "não usar" a um clique, com motivo
do **cadastro `motivo_recusa`**. Recusada: a sobra volta a `disponivel` sem baixa, sai
das candidatas, e **o plano é recalculado sem ela**. O motivo fica gravado.

> Cada recusa é diagnóstico. Em três meses o relatório diz onde o reaproveitamento
> trava: se "tonalidade" dominar, a resposta é registrar o tom no cadastro da sobra; se
> for "defeito não cadastrado", o problema está no lançamento na bancada.

**R17. Nada baixa antes do Confirmar.** No `Confirmar`, e só nele, dentro de **uma
transação**:
- sobras usadas → `status='usada'`;
- rolos → consumo em `movimento_rolo`, referência = `plano.id`;
- restos ≥ mínimo → **novas sobras**, com o código de etiqueta que o operador informar;
- restos < mínimo e restos de pé → linhas em `refugo`;
- `plano.confirmado = 1`.

**R18. O sistema anuncia a sobra que vai nascer.** Antes de confirmar, a tela mostra
*"resto 2,10 × 2,50 → nova sobra · cole a etiqueta"* com campo para o código. **O
cadastro da sobra acontece dentro do Confirmar** — não numa tela separada que alguém
esquece de preencher. É isso que faz o módulo se manter em dia sem depender de
disciplina.

**R19.** A tela aceita **duas entradas**: digitação manual e upload de arquivo. O
upload preenche a mesma grade, **editável antes de calcular**. Digitar continua sempre
disponível.

---

## 8. As telas

Alvo: tablet/desktop na fábrica. Dedo grosso, fonte grande, contraste alto. Tudo por
`base.css`.

### 8.1 Cadastros (diretor)

Abas: **Tecido** (linha/abertura/cor + item) · **Endereços** (os dois armazéns) ·
**Motivos de recusa** · **Parâmetros** (6.5, com texto explicando cada um).

### 8.2 Entrada de rolo (recebimento)

Tecido pelos botões, NF, fornecedor, metragem, **largura desta bobina**, endereço. Gera
`R-00000N`. Botão **"Rolo acabou"** na lista de abertos, que dispara R9.

### 8.3 Cadastro de sobra (cortador) — e o **mutirão**

O caso de uso principal **não é o corte do dia — é o inventário inicial**. Existe hoje
um acervo grande de sobras sem catálogo. A tela precisa aguentar dezenas seguidas:

```
[código da etiqueta]  ←  foco automático, sempre volta pra cá
tecido: botões (LEMBRA a última seleção)
largura [ ____ ]  altura [ ____ ]
condição: botões
endereço: haste → andar → nível (LEMBRA o último)
                                          [ Salvar e próxima ]
```

"Lembra o último" é o que faz o mutirão render: catalogando uma prateleira por vez, o
tecido e o endereço quase não mudam entre um retalho e o seguinte.

### 8.4 Plano de corte (cortador) — a tela principal

**Tecido por botão, nunca dropdown de texto.** Os botões saem do cadastro:

```
LINHA      [ Rolô ]  [ Romana ]  [ Painel ]
ABERTURA   [ 1% ]  [ 3% ]  [ 5% ]  [ Blackout ]
COR        [ Bege ]  [ Branco ]  [ Cinza ]  [ Preto ]
           ▸ Rolô · 3% · Bege
```

**Medidas**: grade com N linhas, `[+ linha]`, botão de upload (R19). O tecido do
cabeçalho vale para todas, **mas pode ser trocado numa linha específica**.

**O resultado é um desenho, não uma lista.** Mostre o encaixe:

```
┌──────────────────────────────────────────────────────────────────────┐
│  PLANO DE CORTE — Rolô · 3% · Bege            3 peças · 6,75 m²      │
├──────────────────────────────────────────────────────────────────────┤
│  ▸ SOBRA   S-0142   1,90 × 2,60      SOBRA · C-01-04                 │
│      ┌──────┬──────┬┐                                                │
│      │ 0,90 │ 0,90 ││   peças 1 e 2            [ não usar ▾ ]        │
│      │ 2,50 │ 2,50 ││                                                │
│      └──────┴──────┴┘   resto 0,10 → refugo                          │
│                                                                      │
│  ▸ ROLO    R-000087  bobina 3,00 · aberto 12,4 m   ROLO · A-02-03    │
│      ┌──────┬───────────┐                                            │
│      │ 0,90 │▓▓▓▓▓▓▓▓▓▓▓│   peça 3 · puxar 2,50 m                    │
│      │ 2,50 │           │                                            │
│      └──────┴───────────┘   resto 2,10 × 2,50  →  NOVA SOBRA         │
│                                etiqueta: [ S-______ ]                │
├──────────────────────────────────────────────────────────────────────┤
│  consumo 2,50 m · desperdício 0,00 m²      [ Imprimir ] [ Confirmar ]│
└──────────────────────────────────────────────────────────────────────┘
```

Desenhe as faixas com CSS puro (divs proporcionais). Sem canvas, sem biblioteca.

**Imprimir** gera uma folha limpa com os desenhos, códigos e endereços — o cortador faz
**uma volta só** na prateleira.

### 8.5 Painel (diretor)

```
ESTOQUE — Linha Rolô
3%  Bege     34,0 m · 1 aberto + 2 fechados · 12 sobras · 18,4 m²
3%  Branco   12,5 m · 1 aberto              ·  4 sobras ·  6,1 m²
3%  Cinza     0,0 m                         ·  7 sobras ·  9,2 m²
```

A linha do Cinza — **sem rolo, com 9,2 m² de retalho** — é o cruzamento que evita
comprar tecido que já está na prateleira. É o motivo de o painel existir; não o esconda
atrás de filtro.

Relatórios: saldo por item · **sobras por item em m², por tipo e cor** · encalhe (dias
parada, mais antiga primeiro) · refugo (m²/mês por motivo) · recusas.

---

## 9. Ordem de entrega

| Fase | O quê | Pronto quando |
|---|---|---|
| **1** | Esqueleto (núcleo, registro, schema, `base.css`, `ui.js`) + **Cadastros** + **Parâmetros** | Cadastro Rolô/3%/Bege e a árvore dos dois armazéns |
| **2** | **Cadastro de sobra + mutirão** | Catalogo 30 sobras seguidas sem sair da tela |
| **3** | **`encaixe.js` + testes** (seção 10). Sem tela ainda | A tabela do 6.4 é reproduzida exatamente |
| **4** | **Plano de corte só nas sobras**, digitação manual | Digito 5 medidas e vejo o desenho do encaixe nas sobras |
| **5** | **Rolo**: entrada, saldo, acerto no fim | Entro um rolo, consumo, vira "aberto", encerro, ajuste aparece |
| **6** | **Plano completo**: bobinas + recusa + sobra gerada no Confirmar | Recuso por tonalidade e o plano recalcula sozinho |
| **7** | **Painel e relatórios** | O cruzamento "sem rolo, com sobra" aparece |
| **8** | **Upload do arquivo** | Subo o arquivo e a grade vem preenchida e editável |

**A Fase 2 é o primeiro valor real** e não depende de nada do rolo — catalogar a
prateleira leva tempo de gente, e esse relógio pode correr em paralelo com o resto da
construção.

**A Fase 3 vem antes de qualquer tela de corte, de propósito.** O algoritmo é a única
parte difícil deste módulo. Ele é função pura e testável — prove que está certo antes
de pendurar interface nele.

**O upload fica por último**: ele acelera uma tela que precisa existir e funcionar
primeiro.

---

## 10. Critérios de aceite

Testes de domínio, sem servidor, sem HTTP. No mínimo:

1. **A tabela do 6.4**, exata. As 3 peças de 0,90×2,50 nas bobinas 3,00 / 2,50 / 2,00
   produzem desperdícios 0,75 / 3,75 / 1,875 e a de 3,00 vence.
2. **Bobina estreita pode vencer a larga**: a de 2,00 tem desperdício menor que a de
   2,50.
3. **A armadilha da área**: sobra 0,50 × 4,00 (2,00 m²) **não** serve para peça
   0,90 × 2,00 (1,80 m²), apesar de ter área maior. **Dimensão filtra, área só ordena.**
4. **Sem rotação**: sobra 0,70 × 3,00 não serve para peça 3,00 × 0,70 com
   `permite_girar = 0`.
5. **Alturas misturadas**: peças 0,90×2,50 e 0,90×1,80 na mesma faixa geram faixa de
   altura 2,50 e um resto de pé de 0,90 × 0,70.
6. **Uma sobra, várias peças**: sobra 1,90×2,60 acomoda duas peças de 0,90×2,50 e é
   consumida uma vez só.
7. **Limite dos 80 cm**: resto de 0,79 vira refugo; resto de 0,80 vira sobra. Testar a
   borda exata, com tolerância de 1 mm.
8. **`pesoSobra` muda o vencedor**: com peso 1,0 a bobina de 2,00 vence; com 0,5 vence
   a de 3,00. Prova que o parâmetro está sendo usado de verdade.
9. **Peça que não cabe** em nenhuma bobina volta marcada com motivo, não some.
10. **Confirmar é atômico**: se uma linha falhar, nenhuma baixa acontece.
11. **Recusa devolve**: sobra recusada continua `disponivel` e o plano recalcula.
12. **Primeiro consumo abre o rolo**; encerramento grava `delta = −saldo`.
13. **`SUM(delta)` de `movimento_rolo` = `rolo.saldo`** para todo rolo. Rode no boot e
    reclame no log se divergir.

---

## 11. Perguntas antes de começar

1. **Existe margem entre as peças no corte?** Uma folga de 1–2 cm entre uma peça e a
   seguinte, e nas bordas da bobina? **Esta é a mais importante** — se existir e o
   encaixe ignorar, o plano vai prometer três peças de 0,90 numa bobina de 2,70 que na
   prática não cabem.
2. **Peça mais larga que a bobina mais larga** — só recusar, ou existe emenda?
3. **Quem pode descartar uma sobra** (`sobra.descartar`)? O cortador ou só a chefia?
4. **Sobra com defeito parcial entra no plano?** Mancha num canto de uma peça grande
   serve para um corte menor. Hoje `condicao` é um campo só; se precisar distinguir
   "não usar nunca" de "usar com cuidado", isso muda o filtro do 6.6.
5. **Leitor de código de barras na bancada?** Sem ele o operador digita `S-000142` à
   mão, e a tela do mutirão precisa de teclado numérico grande.
6. **Sequência das etiquetas de sobra**: o bloco pré-impresso começa em qual número e
   tem quantas? Preciso para a lista de "coladas e não cadastradas".
7. **Autenticação**: login próprio, ou por enquanto um seletor de operador sem senha?
   (As rotas nascem com `permissao` declarada de qualquer forma.)

Depois de responder, comece pela **Fase 1**.
