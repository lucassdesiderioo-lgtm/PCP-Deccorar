# CLAUDE.md — Contexto do Projeto PCP Deccorar

> Leia este arquivo **inteiro** antes de qualquer alteração no código.
> Ele contém regras de negócio que **parecem bugs mas são intencionais**.
> Alterar código sem ler esta seção já causou perda de dados de estoque em produção.

> 🗣️ **Idioma:** responda ao usuário **sempre em português** — todas as
> mensagens de chat, resumos e explicações. Vale para todo o projeto.

---

## 1. O que é este sistema

PCP (Planejamento e Controle da Produção) de uma fábrica de persianas que vende
pelo Mercado Livre. Controla o caminho completo de uma peça: da ordem de produção
até o carregamento no veículo, passando por revisão, embalagem e emissão da
etiqueta de venda.

**Não é um e-commerce.** As vendas vêm prontas do Mercado Livre em PDF. O sistema
cuida do que acontece *depois* da venda, dentro da fábrica.

**Usuários reais:** operadores de chão de fábrica usando tablets e leitores de
código de barras. Isso condiciona todas as decisões de interface: botões grandes,
campos que aceitam bipe, mínimo de digitação, feedback sonoro.

---

## 2. O FLUXO — a regra mais importante

```
Ordem de produção → REVISÃO → FILA → EMBALAGEM → ESTOQUE → ETIQUETA DE VENDA → CARREGAMENTO
```

### Onde o estoque entra e sai (LEIA COM ATENÇÃO)

| Evento | Efeito no estoque |
|---|---|
| Peça **revisada** | **NENHUM.** Entra na tabela `fila` com `situacao='aguardando'` |
| Peça **embalada** (com kit conferido) | **+1** — é aqui que vira estoque |
| **Etiqueta de venda** impressa | **−1** — é aqui que sai |

> ⚠️ **ARMADILHA #1:** Se você ver que `/api/revisao` não mexe no estoque, **está
> correto**. Não "conserte". A peça revisada ainda não está pronta — falta embalar
> e conferir o kit de instalação. Essa regra foi decidida pelo dono da operação:
> *"ela só pode passar a ser estoque depois da montagem/embalagem"*.

> ⚠️ **ARMADILHA #2:** `POST /api/revisao` ainda **retorna** os campos `estoque`,
> `pedido` e `feito` no JSON. Isso é **resquício** da versão antiga (quando a
> revisão somava estoque). Os valores retornados não refletem mais o efeito da
> revisão. A tela do operador já ignora esses campos. Não use como fonte de verdade.

---

## 3. Os três modos da tela de Revisão

A tela `/operador` abre com uma escolha obrigatória entre três frentes de trabalho.
A cor do cabeçalho muda conforme o modo — isso **não é decoração**, é o mecanismo
que impede o operador de revisar meia hora no modo errado.

| Modo | Cor | O que é | Origem dos dados |
|---|---|---|---|
| **PEDIDOS DE HOJE** | 🔴 vermelho | Vendas sem estoque — cliente esperando | `GET /api/revisao/dia` |
| **PRODUÇÃO PRA ESTOQUE** | 🔵 azul | Reposição + metas de alvo + adiantamento | `GET /api/revisao/metas` + `/api/revisao/adiantar` |
| **DEVOLUÇÕES** | 🟡 âmbar | Peças que voltaram do ML | navega para `/devolucao` |

**Ground truth físico:** a produção separa os carrinhos fisicamente. Carrinho de
hoje → tela vermelha. Carrinho de estoque → tela azul. O software espelha a
realidade física; não tenta adivinhá-la.

**Persistência:** o modo fica salvo em `localStorage` (`rev_modo`) por aparelho.
O tablet da bancada reabre no último modo. O botão "Trocar" limpa e força a escolha.

### Regra da exceção (SKU fora da lista)

No modo vermelho, se o operador bipar um SKU que não está nos pedidos do dia:
**avisa mas deixa passar**, e a peça conta como estoque. Nunca bloqueia.

> Motivo: operador parado esperando alguém resolver é pior que um número
> classificado de forma diferente. O aviso aparece **no início** da revisão,
> não no fim — para ele descobrir antes de gastar o tempo de trabalho.

---

## 4. Como uma peça é revisada e embalada

### Revisão — dois bipes
1. Bipe no SKU → inicia o cronômetro
2. Bipe de novo → encerra, grava `segundos` em `revisao`, insere em `fila`

### Embalagem — três bipes
1. Bipe no SKU → inicia
2. Bipe no **QR do kit de instalação** → confirma que o kit entrou na caixa
3. Bipe no SKU → encerra, consome da `fila`, **+1 no estoque**, abate a ordem do dia

> **Bloqueio do kit:** sem o bipe 2, o bipe 3 é recusado com "⚠ FALTOU O KIT".
> Essa é a garantia contra esquecimento — motivo de devolução recorrente.

> **Alcance real do kit:** o QR é **fixo** (um link do Google Drive com o manual
> de instalação, que o cliente escaneia em casa). O sistema garante que *alguém
> bipou um kit*, não que *aquele kit específico* entrou naquela caixa. É proteção
> contra esquecimento, não contra fraude. Configurável em `config.kit_codigo`.

### Peça com problema (rejeição)

Durante uma revisão em andamento, o botão "Peça com problema" permite devolver a
peça para a produção. Ela **não entra na fila de embalagem**. Grava em `rejeicao`:
motivo, tempo até a detecção, modo e usuário logado.

Motivos são configuráveis (tabela `listas`, tipo `rejeicao`), não fixos no código.

---

## 5. O cruzamento com o PDF do Mercado Livre

Ao subir o PDF (aba "Lançar produção" do admin), o sistema:

1. `parse.js` extrai SKU, Pack ID, venda, comprador, NF e páginas de etiqueta/DANFE
2. Cada volume vira uma linha em `lote`
3. `cruz_route.js` compara vendas × estoque e divide em duas ordens:

| Situação | Vira | Cor na revisão |
|---|---|---|
| Vendido, **sem** estoque | Produção **urgente** (`urgente=1`) | 🔴 |
| Vendido, **com** estoque | **Reposição** (`urgente=0`) | 🔵 |

**Exemplo:** 5 vendas de um SKU com 2 em estoque → 3 urgentes + 2 de reposição.
As 2 com estoque vão direto para a etiqueta de venda; a reposição refaz o buraco.

### A foto do estoque (`foto_estoque`)

No primeiro cruzamento do dia, o sistema fotografa o estoque de todos os SKUs e
usa **essa foto** como base em todos os cruzamentos seguintes daquele dia.

> **Por quê:** durante o dia o estoque muda (embalagem soma, etiqueta subtrai).
> Se o segundo upload recalculasse contra o estoque do momento, contaria peças
> duas vezes ou apagaria urgentes já em produção.

**Recálculo é idempotente:** `POST /api/cruzamento/aplicar` apaga as ordens de
`origem='ml'` do dia e refaz. Subir o mesmo PDF duas vezes não duplica.

> ⚠️ **Lançamento manual e PDF não se conversam.** O manual (`origem='manual'`)
> não é apagado pelo recálculo. Usar os dois no mesmo SKU **duplica a ordem**.
> Regra prática: PDF cobre as vendas, manual cobre produção sem venda.

---

## 6. A trava de SKU não cadastrado

**Regra inegociável, definida pelo dono:**
> *"Tudo que estiver na folha de controle e não tiver no cadastro de SKU deve ser
> bloqueado. Não posso ter erros daqui para frente."*

Volume cujo SKU não existe em `skus` entra com `estagio='bloqueado'` e:

- `GET /api/print/:id` recusa (HTTP 409)
- `POST /api/carregar` recusa com motivo `bloqueado`
- `POST /api/embalar` recusa

**A trava é por volume, não por lote.** 40 vendas com 3 SKUs desconhecidos → 37
seguem normalmente, 3 ficam retidas.

**Destravamento:** cadastrar o SKU em `POST /api/skus` libera automaticamente
todos os volumes bloqueados daquele código (linha no `server.js`).

**Sem tabela de equivalências, por decisão explícita.** Se o anúncio do ML manda
`BK140140BEGEML` e o cadastro tem `BK140140BEGE`, o volume fica bloqueado até o
anúncio ser corrigido na origem. Isso força a padronização em vez de mascará-la.

---

## 7. Formato do SKU

```
BK + largura(3) + altura(3) + COR
```

Exemplo: `BK160140BRANCO` = Blackout, 1,60 m de largura × 1,40 m de altura, branco.

- Sempre MAIÚSCULAS, sem espaços, sem separadores
- Medidas em centímetros, 3 dígitos com zero à esquerda
- A regex usada em várias telas: `/^BK(\d{3})(\d{3})([A-Z]+)$/`

> ⚠️ Existe pelo menos um SKU legado fora do padrão (`BK110X240BEGE`, com "X").
> Ele quebra a geração de etiqueta e a seleção por cor+medida. Renomear para
> `BK110240BEGE` é dívida técnica pendente.

**A etiqueta impressa (Zebra ZD220, 100×35 mm, 203 dpi)** é gerada no navegador
com JsBarcode em CODE128B, a partir da aba Cadastro de SKU. Impressão exige
margens "Nenhuma" e escala 100% — "Ajustar à página" deforma as barras e o leitor
recusa.

---

## 8. Horário de corte e despacho

Configuráveis **por dia da semana** (`config`, chaves `corte_seg`, `despacho_seg`, etc.),
porque o Mercado Livre altera o corte sem aviso — já houve quarta-feira com corte
ao meio-dia em vez de 10:30.

| Padrão | Significado |
|---|---|
| Corte 10:30 | Vendas até esse horário são entregues no mesmo dia |
| Despacho 15:00 | Limite para levar os volumes à agência |

A tela de revisão mostra o corte no aviso de status. A tela de Etiqueta de Venda
mostra contagem regressiva para o despacho, ficando **amarela** abaixo de 2 h e
**vermelha** abaixo de 1 h quando ainda há volumes pendentes.

---

## 9. Devoluções

Fluxo em duas etapas, com responsabilidades separadas:

**Etapa 1 — Revisão (`/devolucao`):** quem recebe a peça bipa o código da etiqueta
do ML, escolhe cor + medida (dois toques, montando o SKU), e preenche a triagem
física: embalagem, tecido, tubo, base, comando, kit, destinação.

**Etapa 2 — Admin (aba Devoluções):** quem olha o Mercado Livre responde se
afetou a reputação e qual o motivo comercial. Só então dá baixa.

**O operador informa o SKU que está vendo fisicamente.** O sistema busca a venda
original pelo código e mostra o SKU enviado — mas **não preenche** o campo. Se os
dois divergirem, o admin recebe alerta de **DIVERGÊNCIA**, que é a evidência de
envio errado.

Se a venda original não existir no sistema (devoluções antigas), tudo funciona
normalmente — o vínculo é bônus, não requisito.

**Destinação `reembalar`** insere na `fila` com `modo='devolucao'`: a peça segue o
fluxo normal de embalagem, com kit e cronômetro, e vira estoque como qualquer outra.

---

## 10. Autenticação e permissões

`auth.js` implementa: PIN de 4 dígitos com hash `scrypt` + salt individual, cookie
de sessão assinado com HMAC-SHA256, permissões por **área** (não por cargo fixo).

Fluxo de login desenhado para tablet: grade de nomes → teclado numérico → entra.

### ⚠️ ARMADILHA #3 — a ordem no `server.js` é arquitetura, não estilo

```js
app.use(express.json({limit:'25mb'}));
require('./auth')(app, db);                              // ← ANTES
app.use(express.static(path.join(__dirname, 'public'))); // ← DEPOIS
```

Invertendo essa ordem, o Express entrega os arquivos direto do disco e **qualquer
pessoa acessa `/index.html` sem senha**. As rotas `.html` estão explicitamente na
lista protegida em `auth.js` justamente por isso.

**Teste obrigatório após qualquer mudança em `auth.js` ou `server.js`:**

```bash
for r in / /admin /index.html /painel /operador /api/skus; do
  printf "%-14s " "$r"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010$r
done
curl -s -o /dev/null -w "/login  %{http_code}\n" http://localhost:3010/login
```

Esperado: telas `302`, API `401`, `/login` `200`.
**Qualquer `200` numa tela é furo de segurança.**

Proteção contra força bruta: 5 PINs errados bloqueiam a pessoa por 1 minuto.

---

## 11. Modo teste

Marca tudo que acontece enquanto ligado, fotografa o estoque na ativação, e ao
encerrar permite **apagar** (restaurando o estoque à foto) ou **manter** (promovendo
a produção real). Tarja amarela aparece em todas as telas via `nav.js`.

> **Por que a foto do estoque:** estoque é número corrido, não lista de linhas.
> Apagar as revisões de teste não desfaria o `+1` que cada uma somou.

**Cobertura atual (9 tabelas):** `revisao`, `producao`, `montagem`, `lote`,
`fila`, `devolucao`, `rejeicao`, `contagem` e `foto_estoque`.

A lista fica em `TABELAS`, no topo do `teste_route.js`. Cada entrada traz a coluna
de chave primária, porque **`foto_estoque` não tem `id`** — a PK é `data` (uma foto
por dia) e o trigger casa por `WHERE data=NEW.data`. Ao acrescentar uma tabela,
basta incluí-la nessa lista: trigger, contagem, limpeza e "manter" saem dali.

> ⚠️ **`teste_route` tem que ser o ÚLTIMO `require` do `server.js`.** Ele cria
> triggers em cima de tabelas de outros módulos (`fila`, `devolucao`, `rejeicao`,
> `contagem`, `foto_estoque`). Subindo antes, num banco novo essas tabelas ainda
> não existem, o `try/catch` engole o erro e o modo teste volta a sujar dado real
> **sem avisar**.

**Se um trigger falhar**, a tabela entra em `naoCobertas` no `GET /api/teste` e a
aba Modo teste mostra um alerta âmbar. Falha de cobertura é visível, não silenciosa.

---

## 12. Armadilhas técnicas do ambiente

| Armadilha | O que acontece | Como evitar |
|---|---|---|
| **`node --check` obrigatório** | Um `}` sobrando derruba o `<script>` inteiro; a tela abre e nada funciona, sem erro visível | Rodar após toda edição de `.js` e do bloco `<script>` de `.html` |
| **Código colado por cima do velho** | Linhas duplicadas sobram embaixo e quebram a sintaxe | Conferir o entorno do trecho editado |
| **WAL do SQLite** | `dados.db` tem ~4 KB; os dados estão em `dados.db-wal`. `cp dados.db` produz backup **vazio** | Usar `node backup.js`, que chama `db.backup()` |
| **`pm2 restart` cacheia** | A alteração não aparece | `pm2 delete expedicao && pm2 start server.js --name expedicao` |
| **`!` no bash** | Expansão de histórico quebra heredocs e `sed` | `set +H` antes de blocos com `!` |
| **`express.json()` 100 kb** | Bloqueia upload de PDF | Já elevado para 25 mb — não reduzir |
| **pdf.js quebra números** | Pack IDs vêm com espaços no meio | Regex que rejunta dígitos (já em `parse.js`) |
| **Campo invisível no iPad** | Leitor bipa e nada acontece — iOS tira o foco de campos fora da tela | Campos de bipe devem ser **visíveis**, com `autocorrect="off"` |
| **Leitor manda Tab ou espaço** | Código chega picado ou o Enter cai no vazio | Aceitar Enter **e** Tab; limpar com `replace(/[^A-Za-z0-9]/g,'')`; processar por timeout após a última tecla |

### Como verificar a sintaxe do `<script>` de um HTML

```bash
python3 -c "
s=open('public/ARQUIVO.html',encoding='utf-8').read()
a=s.index('<script>')+8; b=s.index('</script>',a)
open('/tmp/chk.js','w',encoding='utf-8').write(s[a:b])
" && node --check /tmp/chk.js
```

> Atenção: use `.index` (primeiro `</script>`), **não** `.rindex` — o último
> fecha o bloco do `nav.js` e o código acabaria inserido no lugar errado.
> Isso já aconteceu duas vezes.

---

## 13. Protocolo de trabalho

**Antes de editar:**
1. Ler a seção relevante deste arquivo
2. Ver o trecho real (`grep -n`), nunca editar de memória
3. Backup: `cp arquivo.js arquivo.js.bak-$(date +%H%M)`

**Depois de editar:**
1. `node --check` no arquivo
2. Se mexeu em auth/server: rodar o teste de segurança da seção 10
3. Testar no navegador com refresh forçado (Ctrl+Shift+R / Cmd+Shift+R)

**Deploy:**
```bash
# no Mac
git add -A && git commit -m "..." && git push

# no servidor
cd /opt/expedicao && git pull && node --check server.js && pm2 restart expedicao
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010/login   # tem que dar 200
```

**Regra de ouro:** o servidor **só recebe** (`git pull`). Nunca editar direto lá.

---

## 14. Dívidas técnicas conhecidas

Ordenadas por risco. Não são bugs desconhecidos — são decisões adiadas.

| # | Dívida | Risco |
|---|---|---|
| 1 | ~~Modo teste não cobre `fila`, `devolucao`, `rejeicao`, `contagem`, `foto_estoque`~~ **RESOLVIDO em 14/08/2026** — ver §11 | — |
| 1b | ~~`fila` não tem `CREATE TABLE` em lugar nenhum~~ **RESOLVIDO em 14/08/2026** — criada em `db.js` | — |
| 1d | ~~`revisao.modo` e `producao.origem`/`urgente` sem migração~~ **RESOLVIDO em 14/08/2026** — auditoria completa, ver §17 | — |
| 1c | **Embalagem em teste consome linha real da `fila`** — `mont_route.js:11` pega a mais antiga `aguardando` sem olhar `teste`; ao apagar os testes a linha real fica presa em `embalado` | Médio — peça real some da fila |
| 2 | **Sem HTTPS.** PINs trafegam em texto aberto | Alto se exposto à internet |
| 3 | **Revisão perdida em falha de conexão** — sem fila local de reenvio | Médio — buraco silencioso no relatório |
| 4 | `POST /api/producao` (manual) não aceita `data`, `origem` nem `urgente` | Médio — impede lançar adiantado pela tela |
| 5 | Upload não permite escolher a data das vendas | Médio — vendas de amanhã entram como hoje |
| 6 | `POST /api/revisao` retorna campos obsoletos (`estoque`, `pedido`, `feito`) | Baixo — confunde quem lê a API |
| 7 | SKU `BK110X240BEGE` fora do padrão | Baixo — quebra etiqueta e seletor |
| 8 | `/devolucao` não está no menu do rodapé (`nav.js`) | Baixo |
| 9 | Revisão e embalagem não gravam **quem** fez (só `rejeicao` grava) | Baixo — impede produtividade por pessoa |
| 10 | Sem testes automatizados | Médio a longo prazo |

---

## 15. O que NÃO fazer

- ❌ Fazer a revisão somar estoque "porque parece que falta"
- ❌ Mover `express.static` para antes do `auth`
- ❌ Usar `cp dados.db` como backup
- ❌ Editar arquivos direto no servidor
- ❌ Criar tabela de equivalências de SKU (decisão explícita do dono)
- ❌ Remover a trava de SKU não cadastrado
- ❌ Usar `.rindex('</script>')` ao inserir JS em HTML
- ❌ Commitar `.session_secret`, `dados.db`, `backups/` ou `lotes/`

---

## 16. Glossário do negócio

| Termo | Significado |
|---|---|
| **Corte** | Horário limite para uma venda ser entregue no mesmo dia |
| **Despacho** | Horário limite para levar os volumes à agência do ML |
| **Kit** | Kit de instalação que vai dentro da caixa, com QR do manual |
| **Folha de controle** | Página do PDF do ML que traz o SKU de cada venda |
| **Pack ID** | Identificador do volume no Mercado Livre |
| **Alvo** | Quantidade que o estoque de um SKU deveria ter |
| **Reposição** | Produção para refazer o estoque consumido por uma venda |
| **Urgente** | Venda sem estoque — cliente esperando, sai no mesmo dia |
| **Adiantamento** | Ordem de amanhã produzida hoje, se sobrar tempo |

---

## 17. Schema: instalação limpa tem que bater com produção

Não há migrations. Cada tabela nasce de um `CREATE TABLE IF NOT EXISTS` inline.
O banco de produção foi ganhando colunas **à mão** ao longo do tempo, e esses
`ALTER TABLE` nunca voltaram para o código — o resultado era um `CREATE` que não
descrevia mais o banco real. Auditoria de 14/08/2026 fechou o buraco:

| Tabela | Estava faltando no `CREATE` | Onde é usada |
|---|---|---|
| `fila` | a tabela **inteira** | `server.js`, `dev_route`, `mont_route`, `ger_route` |
| `producao` | `origem`, `urgente`, `teste` | `cruz_route.js:35-36`, `st_route.js:14` |
| `revisao` | `modo`, `teste` | `server.js:49`, `st_route.js:15`, `ger_route.js:37` |
| `montagem` | `teste` | `teste_route` |
| `lote` | `teste` | `teste_route` |
| `foto_estoque` | `teste` | `teste_route` |

**Regra daqui pra frente:** coluna nova entra no `CREATE TABLE` do módulo **no
mesmo commit** em que o código passa a usá-la. Se precisar existir também no
banco de produção, o `ALTER` correspondente vai junto, com a coluna acrescentada
**no fim** — é onde o SQLite a coloca, e é o que mantém a ordem igual à de lá.

> ⚠️ `ALTER TABLE ADD COLUMN` **não aceita default dinâmico** no SQLite
> (`(datetime('now','localtime'))` é recusado). Colunas de data adicionadas por
> `ALTER` ficam sem default e entram `NULL` — foi o risco que quase pegou
> `fila.revisado_em`, que ordena a tela de embalagem.

**Como conferir** que o código bate com o banco (roda no servidor):

```bash
cd /opt/expedicao
for t in skus producao revisao fila montagem lote devolucao rejeicao contagem foto_estoque; do
  printf "%-13s " "$t"; sqlite3 dados.db "SELECT GROUP_CONCAT(name,', ') FROM pragma_table_info('$t');"
done
```

Compare com a §3 do `docs/ARQUITETURA.md`. Diferença ali é dívida nova.
