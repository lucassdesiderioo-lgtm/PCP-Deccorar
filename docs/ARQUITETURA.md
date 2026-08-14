# Arquitetura — PCP Deccorar

> Referência técnica: estrutura de arquivos, banco de dados, rotas e dependências.
> **Última revisão:** 13/08/2026

---

## 1. Estrutura de arquivos

```
/opt/expedicao/
│
├── server.js              Ponto de entrada. Rotas de SKU, estoque, produção, revisão
├── db.js                  Conexão SQLite (better-sqlite3, modo WAL)
├── auth.js                Login, sessão, permissões  ⚠️ CRÍTICO — ver ordem
├── parse.js               Extração dos PDFs do Mercado Livre (pdfjs-dist)
├── backup.js              Backup do banco via db.backup()
│
├── Rotas (cada uma exporta function(app, db))
│   ├── painel_route.js    Painel do dia
│   ├── exp_route.js       Upload de PDF, listagem de lote, impressão, bloqueados
│   ├── etq_route.js       Etiqueta de venda: próxima venda por SKU, embalar
│   ├── mont_route.js      Embalagem: config do kit, registro, fila
│   ├── carreg_route.js    Carregamento por bipe
│   ├── modo_route.js      Metas, ordens do dia, adiantamento
│   ├── cruz_route.js      Cruzamento vendas × estoque, foto do estoque
│   ├── cont_route.js      Contagem de estoque (lançar e ajustar)
│   ├── dev_route.js       Devoluções: busca, registro, baixa
│   ├── cad_route.js       Listas configuráveis, rejeições
│   ├── ger_route.js       Dados do painel gerencial
│   ├── st_route.js        Status de revisão/expedição, horários por dia
│   ├── rel_route.js       Relatórios por período
│   ├── nec_route.js       Necessidade / curva ABC
│   ├── alvo_route.js      Definição de alvo por SKU
│   ├── teste_route.js     Modo teste (triggers e snapshot)
│   └── backup_route.js    Download do backup por token
│
├── public/
│   ├── index.html         Admin (12 abas)
│   ├── operador.html      Revisão
│   ├── devolucao.html     Recebimento de devoluções
│   ├── montagem.html      Embalagem
│   ├── embalagem.html     Etiqueta de Venda
│   ├── expedicao.html     Upload de PDFs
│   ├── carregamento.html  Carregamento
│   ├── painel.html        Painel do dia
│   ├── relatorios.html    Relatórios + painel gerencial
│   ├── necessidade.html   Curva ABC
│   ├── login.html         Login por PIN
│   └── nav.js             Menu, atalhos, barra de sessão, tarja de teste
│
├── .session_secret        Chave HMAC (gerada na 1ª execução) — FORA DO GIT
├── dados.db               Banco — FORA DO GIT
├── backups/               Backups diários — FORA DO GIT
└── lotes/                 PDFs recebidos — FORA DO GIT
```

### Padrão dos módulos de rota

```js
module.exports = function(app, db){
  // db.exec("CREATE TABLE IF NOT EXISTS ...")   // migração inline
  app.get('/api/...', (req,res)=>{ ... });
};
```

Não há sistema de migrations. Cada módulo cria e altera suas próprias tabelas com
`CREATE TABLE IF NOT EXISTS` e `ALTER TABLE` condicionais na inicialização.

---

## 2. Ordem de carga no `server.js`

```js
express.json({limit:'25mb'})     // 1. Body parser (25 mb para os PDFs)
require('./auth')(app, db)       // 2. ⚠️ AUTENTICAÇÃO — TEM QUE VIR AQUI
express.static('public')         // 3. Arquivos estáticos
// 4. Rotas de API e de tela
app.listen(3010)
```

> ⚠️ **Inverter 2 e 3 elimina toda a proteção.** O `express.static` entregaria
> `/index.html` direto do disco, sem passar pelo middleware de auth. As rotas
> `.html` estão explicitamente na lista protegida de `auth.js` por causa disso.

---

## 3. Banco de dados

### Diagrama de relações

```
skus ──┬── producao      (codigo)
       ├── revisao       (codigo)
       ├── fila          (codigo)
       ├── montagem      (codigo)
       ├── lote          (codigo)
       ├── rejeicao      (codigo)
       ├── contagem      (codigo)
       ├── devolucao     (sku_fisico, sku_venda)
       └── demanda       (codigo)

lote ───── devolucao     (venda_id → lote.id)
```

Não há foreign keys declaradas. As ligações são por convenção de código.

### Tabelas

#### `skus` — cadastro de produtos
```sql
codigo     TEXT PRIMARY KEY
descricao  TEXT DEFAULT ''
cor        TEXT DEFAULT ''
estoque    INTEGER DEFAULT 0     -- peças prontas e embaladas
alvo       INTEGER DEFAULT 0     -- meta de estoque
criado_em  TEXT
```

#### `producao` — ordens de produção
```sql
id         INTEGER PK
codigo     TEXT
qtd        INTEGER
produzido  INTEGER DEFAULT 0     -- incrementado pela EMBALAGEM, não pela revisão
data       TEXT DEFAULT (date('now','localtime'))
origem     TEXT DEFAULT 'manual' -- 'manual' | 'ml'
urgente    INTEGER DEFAULT 0     -- 1 = vermelho, 0 = azul
teste      INTEGER DEFAULT 0
```

#### `revisao` — cada peça revisada
```sql
id         INTEGER PK
codigo     TEXT
inicio     TEXT      -- ISO
fim        TEXT      -- ISO
segundos   INTEGER
modo       TEXT DEFAULT 'hoje'   -- 'hoje' | 'estoque'
data       TEXT
teste      INTEGER DEFAULT 0
```
> Não grava usuário — ver dívida técnica #9 no CLAUDE.md.

#### `fila` — entre revisão e embalagem
```sql
id           INTEGER PK
codigo       TEXT
modo         TEXT DEFAULT 'hoje'    -- 'hoje' | 'estoque' | 'devolucao'
situacao     TEXT DEFAULT 'aguardando'  -- 'aguardando' | 'embalado'
revisado_em  TEXT
embalado_em  TEXT
data         TEXT
teste        INTEGER DEFAULT 0
```

#### `montagem` — embalagem concluída
```sql
id        INTEGER PK
codigo    TEXT
inicio    TEXT
fim       TEXT
segundos  INTEGER
kit_ok    INTEGER DEFAULT 1
data      TEXT
teste     INTEGER DEFAULT 0
```
> O nome da tabela é `montagem` por herança; a tela chama-se **Embalagem**.

#### `lote` — volumes vindos do PDF
```sql
id           INTEGER PK
codigo       TEXT         -- SKU extraído da folha de controle
cor, buyer, city, nf      -- dados do comprador
packId, venda             -- identificadores do ML
codes        TEXT         -- JSON com todos os códigos lidos
srcfile      TEXT         -- caminho do PDF em lotes/
labelPage    INTEGER      -- índice 0-based da etiqueta
danfePage    INTEGER      -- índice 0-based da DANFE
estagio      TEXT DEFAULT 'pendente'
             -- 'pendente' | 'embalado' | 'carregado' | 'bloqueado'
embalado_em, carregado_em, data, criado_em
teste        INTEGER DEFAULT 0
```

#### `devolucao`
```sql
id           INTEGER PK
codigo_ml    TEXT       -- código bipado da etiqueta
sku_fisico   TEXT       -- o que o operador viu (obrigatório, validado)
sku_venda    TEXT       -- o que consta na venda original (pode ser NULL)
venda_id     INTEGER    -- lote.id, quando encontrado
buyer        TEXT
embalagem, tecido, tubo, base, comando, kit, destinacao, obs   -- triagem
reputacao    TEXT       -- 'sim' | 'nao'  (preenchido pelo admin)
motivo       TEXT       -- preenchido pelo admin
baixado      INTEGER DEFAULT 0
baixado_em, recebido_em, data
teste        INTEGER DEFAULT 0
```

#### `rejeicao` — peça devolvida à produção
```sql
id        INTEGER PK
codigo    TEXT
motivo    TEXT
obs       TEXT
segundos  INTEGER    -- tempo até a detecção
modo      TEXT
usuario   TEXT       -- única tabela que grava quem fez
data      TEXT
teste     INTEGER DEFAULT 0
```

#### `contagem` — sessões de contagem
```sql
id          INTEGER PK
codigo      TEXT
sessao      TEXT      -- gerada no cliente, guardada em localStorage
contado_em  TEXT
teste       INTEGER DEFAULT 0
```

#### `listas` — valores configuráveis
```sql
id     INTEGER PK
tipo   TEXT     -- 'rejeicao' | 'motivo_devolucao'
valor  TEXT
ordem  INTEGER
ativo  INTEGER DEFAULT 1   -- remoção é lógica
```

#### `usuarios`
```sql
id         INTEGER PK
nome       TEXT NOT NULL
salt       TEXT NOT NULL
pin_hash   TEXT NOT NULL   -- scrypt(pin, salt)
areas      TEXT            -- lista separada por vírgula
ativo      INTEGER DEFAULT 1
criado_em  TEXT
```

#### `config` — chave/valor
| Chave | Conteúdo |
|---|---|
| `backup_token` | Token do endpoint de download |
| `kit_codigo` | QR do kit de instalação |
| `modo_teste` | `'1'` quando ativo |
| `teste_snapshot` | JSON do estoque na ativação |
| `teste_desde` | Timestamp da ativação |
| `dias_colchao` | Parâmetro da curva ABC |
| `corte_dom`…`corte_sab` | Horário de corte por dia |
| `despacho_dom`…`despacho_sab` | Horário de despacho por dia |

#### `foto_estoque` — base do cruzamento
```sql
data       TEXT PRIMARY KEY   -- uma foto por dia
dados      TEXT               -- JSON {codigo: estoque}
criado_em  TEXT
```

#### `demanda` — consumo para a curva ABC
```sql
codigo      TEXT PRIMARY KEY
qtd30       INTEGER
media_dia   REAL
atualizado  TEXT
```

---

## 4. Rotas da API

### Cadastro e estoque (`server.js`)
| Método | Rota | Efeito |
|---|---|---|
| GET | `/api/skus` | Lista todos |
| POST | `/api/skus` | Cria/atualiza · **destrava volumes bloqueados** |
| DELETE | `/api/skus/:codigo` | Remove o cadastro |
| POST | `/api/estoque` | Define (`estoque`) ou soma (`delta`) — **admin** |

### Produção
| Método | Rota | Efeito |
|---|---|---|
| POST | `/api/producao` | Lançamento manual (array `itens`) |
| GET | `/api/producao` | Ordens de hoje com estoque e alvo |
| GET | `/api/revisao/dia` | Ordens de hoje agrupadas |
| GET | `/api/revisao/adiantar` | Ordens de **amanhã** ainda não cumpridas |
| GET | `/api/revisao/metas` | SKUs com alvo, ordenados pelo mais furado |

### Revisão
| Método | Rota | Efeito |
|---|---|---|
| POST | `/api/revisao` | Grava tempo + **insere na fila**. Não mexe no estoque |
| GET | `/api/revisao/hoje` | Contagem e tempo médio por SKU |
| GET | `/api/revisao/status` | Corte, urgentes pendentes, se foi lançado |
| POST | `/api/rejeicao` | Peça devolvida à produção |
| GET | `/api/rejeicao/resumo` | Agrupado por motivo e SKU |

### Embalagem
| Método | Rota | Efeito |
|---|---|---|
| POST | `/api/montagem` | Consome da fila · **+1 estoque** · abate ordem |
| GET | `/api/montagem/hoje` | Contagem do dia |
| GET | `/api/fila` | Aguardando embalagem, por SKU |
| GET/POST | `/api/config/kit` | Código do QR do kit |

### Expedição
| Método | Rota | Efeito |
|---|---|---|
| POST | `/api/lote/upload` | Lê o PDF, grava volumes, **bloqueia SKU desconhecido** |
| GET | `/api/lote` | Volumes de hoje |
| GET | `/api/pendentes` | Faltam imprimir, por SKU |
| GET | `/api/bloqueados` | SKUs desconhecidos agrupados |
| GET | `/api/proximo/:sku` | Próxima venda pendente do SKU |
| POST | `/api/embalar` | Marca embalado · **−1 estoque** |
| GET | `/api/print/:id` | PDF com etiqueta + DANFE · **recusa bloqueado** |
| GET | `/api/expedicao/status` | Relógio de despacho e pendências |

### Carregamento
| Método | Rota | Efeito |
|---|---|---|
| POST | `/api/carregar` | Confere por código · recusa duplicado e bloqueado |
| GET | `/api/carregamento` | Total, carregados, faltantes |

### Cruzamento
| Método | Rota | Efeito |
|---|---|---|
| GET | `/api/cruzamento` | Calcula urgente × reposição (não grava) |
| POST | `/api/cruzamento/aplicar` | Apaga ordens `ml` do dia e recria |

### Devoluções
| Método | Rota | Efeito |
|---|---|---|
| GET | `/api/devolucao/buscar/:cod` | Busca a venda original |
| POST | `/api/devolucao` | Registra triagem · `reembalar` entra na fila |
| GET | `/api/devolucao/pendentes` | Aguardando baixa |
| GET | `/api/devolucao/hoje` | Contagem do dia |
| POST | `/api/devolucao/baixa` | Reputação e motivo |

### Contagem
| Método | Rota | Efeito |
|---|---|---|
| POST | `/api/contagem/bipe` | Registra e informa se o SKU existe |
| GET | `/api/contagem/:sessao` | Comparativo sistema × contado |
| POST | `/api/contagem/lancar` | **Soma** ao estoque e limpa a sessão |
| POST | `/api/contagem/ajustar` | **Substitui** o estoque |
| DELETE | `/api/contagem/:sessao` | Descarta |

### Configuração e listas
| Método | Rota | Efeito |
|---|---|---|
| GET | `/api/listas/:tipo` | Valores ativos |
| POST | `/api/listas` | Adiciona |
| DELETE | `/api/listas/:id` | Desativa |
| GET/POST | `/api/config/horarios` | Corte e despacho por dia |
| GET/POST | `/api/config/dias` | Dias de colchão (ABC) |
| POST | `/api/alvo` | Alvo por SKU — **admin** |

### Autenticação
| Método | Rota | Efeito |
|---|---|---|
| GET | `/api/auth/pessoas` | Nomes para a grade de login |
| POST | `/api/auth/login` | Valida PIN, emite cookie |
| POST | `/api/auth/logout` | Encerra |
| GET | `/api/auth/eu` | Quem está logado e suas áreas |
| GET | `/api/auth/areas` | Áreas disponíveis |
| GET/POST | `/api/usuarios` | CRUD de pessoas — **admin** |
| DELETE | `/api/usuarios/:id` | Desativa — **admin** |

### Modo teste — **admin**
`GET /api/teste` · `POST /api/teste/ligar` · `POST /api/teste/limpar` ·
`POST /api/teste/manter`

### Relatórios
`GET /api/rel/resumo` · `/api/rel/sku` · `/api/rel/dia` · `/api/painel` ·
`/api/necessidade` · `POST /api/necessidade/aplicar` · `GET /api/gerencial`

### APIs restritas ao admin
Definidas em `auth.js`:
`/api/teste` · `/api/usuarios` · `/api/estoque` · `/api/alvo` · `/api/backup`

---

## 5. Autenticação — como funciona

1. Middleware registrado **antes** do `express.static`
2. Toda requisição tem o cookie `sess` verificado (HMAC-SHA256)
3. Sem sessão: tela → `302` para `/login`; API → `401`
4. Com sessão mas sem a área: `403`
5. A área `admin` satisfaz qualquer verificação

**Rotas livres:** `/login`, `/login.html`, `/nav.js`, `/favicon.ico`, `/api/auth/*`

**Cookie:** `sess=<base64(json)>.<hmac>` · `HttpOnly` · `SameSite=Lax` ·
`Max-Age=31536000`

**Segredo:** `.session_secret`, gerado na primeira execução com permissão `600`.
Apagá-lo invalida todas as sessões (todos precisam logar de novo).

---

## 6. Leitura do PDF (`parse.js`)

1. Extrai o texto de cada página agrupando por coordenada Y (reconstrói linhas)
2. Classifica cada página: `control` (tem `SKU:`), `danfe`, `label` (tem `Pack ID:`)
3. Da folha de controle, monta o mapa Pack ID → SKU (duas estratégias, uma de reserva)
4. De cada etiqueta, extrai comprador, cidade, NF, Pack ID, venda e todos os códigos
5. Associa a DANFE pelo número da NF, com fallback para a página seguinte
6. Devolve a lista de volumes com os índices de página para reimpressão

**Particularidades tratadas:**
- pdf.js quebra números longos com espaços → regex rejunta os dígitos
- O SKU aparece no meio da linha (tabela de duas colunas) → não ancorar no início
- Deduplicação por Pack ID e por número da venda

---

## 7. Frontend

Sem framework, sem build. Padrões usados em todas as telas:

**Campo de bipe** — precisa ser **visível** (iOS tira o foco de campos fora da
tela), com `autocorrect="off"` e `autocapitalize="characters"`. Processa por
timeout (~220 ms) após a última tecla, aceitando Enter **ou** Tab, e limpa o texto
com `replace(/[^A-Za-z0-9]/g,'').toUpperCase()`.

**`nav.js`** — carregado por todas as telas. Fornece: barra de atalhos no rodapé,
`Alt+1..9` e `Alt+0`, barra de sessão com nome e botão Sair, e a tarja amarela do
modo teste (consulta `/api/teste` a cada 10 s).

**Atualização automática** — as telas de fila e status recarregam sozinhas
(4 s na fila, 5 s nos pendentes, 20 s no status, 30 s no relógio de despacho),
e todas pausam enquanto há operação em andamento.

**Feedback sonoro** — `AudioContext` com 820 Hz para sucesso e 240 Hz para erro.

---

## 8. Backup

- `backup.js` usa `db.backup()` do better-sqlite3 — **consolida o WAL**
- Executado diariamente às 23:30 (cron)
- Destino: `/opt/expedicao/backups/dados-AAAA-MM-DD.db`
- Download em `/baixar-backup`, protegido por token em `config.backup_token`
- PDFs em `lotes/` são removidos após 7 dias

> ⚠️ `cp dados.db` produz um arquivo de ~4 KB, praticamente vazio. No modo WAL os
> dados vivem em `dados.db-wal` (que chega a vários MB). Use sempre `node backup.js`.

---

## 9. Modo teste — implementação

**Triggers:** `AFTER INSERT` em `revisao`, `producao`, `montagem` e `lote`, que
marcam `teste=1` quando `config.modo_teste = '1'`.

**Snapshot:** ao ligar, grava `config.teste_snapshot` com o estoque e o alvo de
todos os SKUs.

**Ao limpar:** apaga as linhas com `teste=1` das quatro tabelas e restaura o
estoque pelo snapshot.

> ⚠️ **Não cobre** `fila`, `devolucao`, `rejeicao`, `contagem` nem `foto_estoque`,
> apesar de todas terem a coluna `teste`. Corrigir é a dívida técnica #1.

---

## 10. Convenções

- **Datas:** sempre `date('now','localtime')` — o servidor está em UTC, o negócio não
- **SKU:** sempre `.trim().toUpperCase()` antes de gravar ou comparar
- **Transações:** `db.transaction(fn)()` para qualquer operação com mais de uma escrita
- **Remoção:** lógica (`ativo=0`) para usuários e listas; física para SKU e produção
- **Respostas de erro:** `{erro: 'mensagem'}` com status apropriado
- **Migrações:** inline no início de cada módulo de rota
