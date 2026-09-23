# CLAUDE.md — Contexto do Projeto PCP Deccorar

> Leia este arquivo **inteiro** antes de qualquer alteração no código.
> Ele contém regras de negócio que **parecem bugs mas são intencionais**.
> Alterar código sem ler esta seção já causou perda de dados de estoque em produção.

> 🗣️ **Idioma:** responda ao usuário **sempre em português** — todas as
> mensagens de chat, resumos e explicações. Vale para todo o projeto.

---

## 0. PROTOCOLO — toda tarefa tem começo, meio e fim

> Vale para **toda** sessão (Mac ou nuvem), de qualquer tamanho. O dono decide as
> regras e acompanha pelo relatório — e se perde quando regra e código mudam sem
> ele ver. **Este protocolo não é opcional, nem "só dessa vez".**

### O dono fala em dois momentos, e só neles

```
  ① COMEÇO ─────────▶ ✋ "pode seguir" ─────────▶ ② MEIO ─────────▶ ③ FIM ─────────▶ ✋ "pode subir"
  entender e planejar   (aprova o plano)          construir         deixar em ordem    (aprova merge/deploy)
```

Entre um ✋ e outro, trabalhe sozinho. **Fora deles, só interrompa por um motivo:
apareceu uma regra de negócio que precisa mudar.**

### Como o dono abre uma tarefa

Ele pode começar a mensagem com uma palavra. Se não começar, **você classifica e diz qual é**.

| Palavra | Significa | Precisa de spec? |
|---|---|---|
| `CONSERTO:` | o sistema deveria fazer e não faz | não |
| `AJUSTE:` | mudar algo pequeno sem mudar regra | não |
| `REGRA:` | mudar como a fábrica trabalha | **sim** |
| `NOVIDADE:` | algo que não existe | **sim** |
| `FASE:` | construir a próxima fase de uma spec de `docs/specs/` | já tem |

**`REGRA` ou `NOVIDADE` sem spec aprovada: não construa.** Explique que precisa ser
desenhado no Projeto do Claude primeiro e ofereça um rascunho de spec.

**Um `CONSERTO` que exige mudar regra vira `REGRA`.** Pare e avise — é exatamente
assim que a bagunça começa.

### O semáforo de risco — define o cuidado

| | Mexe em | Cuidado exigido |
|---|---|---|
| 🟢 | texto, cor, posição, tamanho, tela de escritório | plano curto (3 linhas) |
| 🟡 | comportamento de tela, bipe, cálculo exibido, relatório | plano completo + teste |
| 🔴 | **estoque, acesso/permissão, etiqueta/NF, dados de produção, schema** | plano completo + **teste escrito antes do conserto** + backup + deploy fora do horário de expedição |

Na dúvida entre duas cores, use a mais alta.

---

### ① COMEÇO — entender antes de mexer

1. Leia a seção deste arquivo sobre o assunto e, se houver, a spec em `docs/specs/`.
2. Investigue no código real (nunca de memória).
3. Apresente o **PLANO**, neste formato, em português de fábrica:

```
📋 PLANO
Tipo: CONSERTO | AJUSTE | FASE N da spec X        Risco: 🟢 | 🟡 | 🔴
O que está acontecendo: (a causa, ou o que vai ser feito)
O que vou mudar: (arquivos, em 1 linha cada)
Regra de negócio muda? NÃO  |  SIM → antes: … / depois: …
Como vou testar: …
Fica de fora: …
```

4. **✋ Espere o "pode seguir".**

### ② MEIO — construir só o combinado

5. Faça **só** o que está no plano. Siga a §13 (backup, `node --check`, teste de segurança).
6. **Achou outro problema?** Anote para o relatório. Não conserte junto.
7. **Precisa mudar uma regra que não estava no plano?** Pare e pergunte. Nunca decida sozinho,
   mesmo que pareça bug óbvio — metade das regras deste arquivo *parecem* bug.

### ③ FIM — só termina com tudo em ordem

8. Testes rodando e passando.
9. Papel em dia, **no mesmo commit do código**:

| Se… | Então atualize |
|---|---|
| mudou regra | este `CLAUDE.md` **e** uma linha em `docs/DECISOES.md` |
| descobriu armadilha | este `CLAUDE.md` |
| resolveu dívida | risque na §14, com data |
| trabalhou numa spec | STATUS da spec + índice em `docs/specs/README.md` |
| terminou a spec inteira | spec vai para `docs/arquivo/` |

10. Commit com mensagem clara. Em branch: **abra o PR**.
11. Entregue o **FECHAMENTO** e **✋ espere o "pode subir"** antes de merge ou deploy:

```
✅ FECHAMENTO
Tipo e risco: …
O que mudou: (2-3 linhas, sem jargão)
Regra de negócio mudou? NÃO  |  SIM → antes / depois (registrado em DECISOES.md)
Testes: quais rodaram · resultado
Papel em dia: CLAUDE.md §… · DECISOES.md · spec … · README das specs
Commit/PR: …   Falta mesclar? …
Deploy: não precisa  |  precisa → comandos · melhor horário
Achei no caminho (não mexi): …
```

Item do FIM que não foi possível cumprir: **diga qual e por quê.** Nunca declare pronto com item faltando.

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

| Evento | Efeito no estoque | Linha no livro (desde 21/09/2026) |
|---|---|---|
| Peça **revisada** | **NENHUM.** Entra na tabela `fila` com `situacao='aguardando'` | nenhuma |
| Peça **embalada** (com kit conferido) | **+1** — é aqui que vira estoque | `embalagem` · `montagem:<id>` |
| **Etiqueta de venda** impressa | **−1** — é aqui que sai | `etiqueta` · `lote:<id>`, **uma por SKU** da caixa |
| Etiqueta de venda **reimpressa** | **NENHUM** — mesmo volume, mesmo cliente | nenhuma |
| Peça **sob medida** | **NENHUM** nos dois lados (§7) | nenhuma |

> ⚠️ **ARMADILHA #1:** Se você ver que `/api/revisao` não mexe no estoque, **está
> correto**. Não "conserte". A peça revisada ainda não está pronta — falta embalar
> e conferir o kit de instalação. Essa regra foi decidida pelo dono da operação:
> *"ela só pode passar a ser estoque depois da montagem/embalagem"*.

> ⚠️ **ARMADILHA #1-B:** a **reimpressão** (`POST /api/reimprimir`, na tela
> Etiqueta de Venda) não baixa estoque, e isso **está correto**. Impressora
> enroscada, etiqueta borrada e folha perdida geram a mesma etiqueta do mesmo
> volume, pro mesmo cliente — a baixa já aconteceu na primeira impressão.
> Se a reimpressão descontasse, cada papel preso furaria o estoque. Ela só grava
> `lote.reimpressoes` e `lote.reimpresso_em`, que são história, não saldo.

### O LIVRO DE MOVIMENTOS — `estoque_dominio.js` é o dono único do saldo

**21/09/2026, fase 1 da spec `ESTOQUE-LIVRO-E-CONFERENCIA.md`.** Até aqui o saldo
da persiana era **um número que sete lugares sobrescreviam**: a embalagem, a
etiqueta, o ajuste manual, a contagem, o cadastro de SKU, dois scripts e o modo
teste. Quando ele errava não sobrava rastro de quem mexeu, quando, nem por quê.

```
movimentar(db, {codigo, delta, tipo, referencia, motivo, usuario, aprovado_por})
   INSERT em movimento_estoque   +   UPDATE em skus.estoque      ← na MESMA transação
```

| | |
|---|---|
| `delta` | **+1, −1, −2… nunca o saldo.** O saldo é consequência |
| `tipo` | lista fechada: `abertura` · `embalagem` · `etiqueta` · `inventario` · `ajuste` · `correcao` · `cancelamento` |
| `referencia` | o que causou: `montagem:12`, `lote:451`, `ajuste manual` |
| `saldo_depois` | para ler o extrato sem somar tudo |

> **`skus.estoque` continua existindo, como CACHE.** As telas e as contas
> continuam lendo dele — são dezenas de consultas que somam, filtram e ordenam
> por saldo. Quem **manda** é o livro, e a régua é `SUM(delta) = skus.estoque`
> para todo SKU.

> ⚠️ **NENHUMA FUNÇÃO DO DOMÍNIO ABRE TRANSAÇÃO**, e isso é desenho: a embalagem
> são quatro escritas que entram ou não entram juntas (§4, #26) e a etiqueta de
> uma caixa de pacote são N baixas que valem como uma (§5, #23). Domínio que
> abrisse a própria transação tiraria de quem chama a chance de desfazer.

> ⚠️ **O `MAX(0, …)` SAIU DE TODOS OS SETE, E É A MUDANÇA DE REGRA DESTA FASE.**
> Os sete cortavam o saldo em zero, e com isso apagavam justamente o **sinal** de
> que alguma peça saiu sem registro — é o passivo da dívida 13 (§5, #27) que
> ficou invisível por semanas. Hoje o saldo negativo **fica** negativo e vira
> chip vermelho próprio na aba Estoque, separado do "zerado": misturados, o
> negativo seria lido como SKU que acabou, que é situação normal e ninguém
> investiga. Quem impede o negativo na operação normal é a trava da Etiqueta de
> Venda, que não imprime sem estoque — então negativo que aparecer é verdadeiro.

> ⚠️ **O CADASTRO DE SKU NÃO MEXE MAIS EM SALDO, nem quando o campo vem.** A
> armadilha #25 fechou a porta do campo **ausente** apagar o saldo; esta fecha a
> do campo **presente** mexer nele sem motivo e sem auditoria — era o que ficava
> aberto na dívida 15, e era `REGRA`, não conserto. **Nem o SKU novo**: nascer
> com 5 e livro vazio quebraria a soma na primeira linha. A rota **diz** que
> ignorou (`estoque_ignorado`) em vez de calar, e a tela do admin parou de mandar
> o campo — mandar um campo que a rota ignora é o que faz alguém acreditar que
> ele funciona.

> ⚠️ **A VIRADA É EVENTO, NÃO ROTINA.** No deploy, cada SKU com saldo diferente
> de zero ganha **uma** linha `abertura`, marcada em `config.livro_abertura`. Sem
> a marca ela rodaria a cada boot e o livro passaria a dizer o dobro, o triplo, o
> quádruplo do saldo — e a soma nunca mais bateria. É a lição da migração de
> `areas` (§10, #28) por outra porta. `skus.estoque` **NULL** é normalizado para
> zero na mesma passagem: NULL não é saldo, é o buraco por onde a coluna parava
> de andar (`estoque+1` vira NULL, e o SKU nunca sobe nem desce).

> ⚠️ **A RESTAURAÇÃO DA FOTO DO MODO TESTE MORA DENTRO DO DOMÍNIO**
> (`restaurarFoto`), e não no `teste_route.js`. Ela escreve na coluna sem ser um
> movimento — é o contrário: desfaz movimentos que acabaram de ser apagados. Se
> ficasse lá fora, o `teste_route` seria o segundo dono, e a varredura precisaria
> de uma exceção. **Exceção numa regra de dono único é o começo do terceiro
> dono.** `movimento_estoque` entrou em `TABELAS` (§11) pelo mesmo motivo do
> `movimento_componente`: sem cobertura, "apagar tudo" devolveria o saldo pela
> foto e deixaria as linhas de teste de pé descrevendo o que já não existe.

> **O extrato:** `GET /api/estoque/extrato/:codigo` (`@admin`), e o botão
> **extrato** na linha da aba Estoque, ao lado do "histórico". Os dois não são a
> mesma coisa: o *histórico* mostra só o ajuste feito à mão (`ajuste_estoque`),
> e o *extrato* mostra **tudo que moveu o saldo** — embalagem, etiqueta,
> inventário, ajuste e a abertura.
>
> Ele devolve `soma_livro` e `bate` ao lado do saldo, e a tela escreve os dois:
> *"o livro fecha com o saldo (5)"* em verde, ou **"⚠ a coluna diz 42 e o livro
> diz 5 — conferir"** em vermelho. É a mesma conferência que o `teste_livro.js`
> faz em banco de teste, feita aqui com o dado real — se um dia alguém voltar a
> escrever na coluna por fora, é nesta linha que aparece primeiro, sem ninguém
> ir procurar.

> ⚠️ **A FASE 1 SUBIU SÓ COM A METADE DE SERVIDOR, E A DOCUMENTAÇÃO DISSE QUE
> ESTAVA PRONTA (21→22/09/2026).** A rota do extrato e a classificação de saldo
> negativo entraram, passaram nos testes e foram para produção; **nenhuma das
> duas tinha tela**. O chip "Negativo" não existia no `ESTCHIPS` e não havia
> botão nenhum que chamasse o extrato — a rota ficou um dia inteiro no ar,
> declarada pronta, **sem nenhum caminho até ela**. Quem foi abrir não achou.
>
> **É a armadilha #30 (§7) por uma quarta ponta, e a dívida 18 do §14 de novo.**
> Lá são a coluna, o código que a lê e o dado preenchido; aqui são a rota, o
> teste que a cobre e **alguém que consiga chegar nela**. A que some em silêncio
> é sempre a última: a rota responde 200 no `curl`, o teste fica verde, o boot
> não reclama, e nada em lugar nenhum diz *"isto não tem porta"*.
>
> **Regra que fica:** regra nova que depende de tela não está pronta quando a
> rota existe e o teste passa — está pronta quando **alguém clica e vê**. E a
> conferência disso não é ler o próprio diff: é abrir a tela. Foi assim que
> apareceu, no primeiro render, o *"— Correcao de contagem"* com o travessão
> pendurado no vazio (movimento de contagem não tem referência) — o mesmo tipo
> de coisa que a nota do link do QR ensinou em 18/09 (§4), e que nenhum teste de
> unidade pega porque o texto está sintaticamente perfeito.

> **Rode `node teste_livro.js` ao mexer no `estoque_dominio.js` ou em qualquer
> coisa que mova saldo** — os 60 casos vão do domínio isolado até o **fluxo
> real** (embalar, imprimir, caixa de pacote, segunda impressão, sob medida,
> modo teste apagar e manter), exigindo `SUM(delta) = skus.estoque` depois de
> cada passo. E a **varredura** recusa `UPDATE skus SET estoque` — e o upsert
> `estoque=excluded.estoque` — fora do `estoque_dominio.js`. Sem ela a arrumação
> dura até o próximo módulo, porque módulo novo se escreve copiando o de cima.
>
> ⚠️ Ela **isenta os `teste_*.js`** (ali o `UPDATE` é montagem de cenário, não
> escrita de produção) — **menos o `teste_route.js`, que não é teste**: é o
> módulo do modo teste, que só tem o nome parecido, e é um dono de verdade da
> coluna. Foi a própria varredura que achou essa isenção errada no dia em que
> foi escrita.

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
| **PRODUÇÃO PRA ESTOQUE** | 🔵 azul | Necessidade calculada ao vivo (`comprometido + alvo − estoque`) — Fase 2 | `GET /api/revisao/producao` (+ `/api/revisao/adiantar`) |
| **DEVOLUÇÕES** | 🟡 âmbar | Peças que voltaram do ML | navega para `/devolucao` |

### ⚠️ ARMADILHA #11 — a planilha do ML é ESPELHO, e um recorte apaga a média

A tela azul não sai de lançamento nenhum: ela é calculada ao vivo a partir da
planilha do Mercado Livre, importada em **Admin → Planejamento**. Dessa planilha
saem **dois** números, de lugares diferentes:

| Coluna | Alimenta | Olha para |
|---|---|---|
| **Data da venda** | a média diária | os últimos 30 dias (`janela_media`) |
| **Estado** (`"Para enviar no dia 17 de agosto"`) | o comprometido | os envios futuros |

```
alvo    = max(alvo_minimo, média_na_janela × dias_cobertura)
precisa = comprometido + alvo − estoque
```

> ⚠️ **O import APAGA o que não veio no arquivo** (`plan_route.js`, ao fim da
> transação): venda cancelada some da planilha e tem que sumir da conta. A
> consequência é que a planilha precisa vir **inteira, sempre** — cobrindo a
> janela toda e incluindo as vendas ainda não despachadas.
>
> Subir um recorte só com os próximos dias **apaga os 30 dias de histórico**. A
> média de todo SKU cai a zero, o alvo despenca para o `alvo_minimo`, e a tela
> azul para de pedir produção. Não dá erro e não dá aviso — o número só encolhe.
>
> Por isso a tela acusa: quando um import remove mais da metade da base, ela
> mostra tarja âmbar dizendo que aquilo tem cara de recorte. **Reparo: subir a
> planilha completa de novo.** Como o import é espelho, ele reconstrói sozinho.

A janela não é fixa em 30 dias — é o campo "Janela da média" na própria tela. Se
ela virar 60, a planilha precisa cobrir 60.

### A ordem é de prioridade, não de quantidade

Ordenar por `precisa` põe em cima o SKU que gira mais — que quase nunca é o que
vai faltar primeiro. A lista desce quatro degraus, e **cada linha diz qual a
colocou ali** (`motivo`): pontuação composta ordena bem e não explica nada, e
quem lê a lista sem entender a ordem volta a produzir pela intuição.

| # | Degrau | Critério |
|---|---|---|
| 1 | Cliente com prazo | tem comprometido que despacha **até amanhã** |
| 2 | Sem estoque | a próxima venda já vira urgência |
| 3 | Cobertura baixa | `estoque ÷ média` abaixo de metade dos dias de cobertura |
| 4 | Abaixo do alvo | o resto do que precisa produzir |

**Cobertura = quantos dias o estoque atual aguenta.** É ela que mede risco: um
SKU que vende 6/dia com 3 em estoque tem meio dia de folga; outro que vende
0,2/dia com 4 em estoque tem 20 dias — e era o segundo que aparecia em cima,
porque a quantidade que falta é maior. Sem venda na janela a cobertura é `null`
("não dá pra dizer"), que não é zero.

> O comprometido é **repartido por prazo** (`comp_ja`, `comp_semana`,
> `comp_depois`), mas o **total não mudou** — o `WHERE` da consulta é o mesmo.
> `precisa` e a compra de material continuam idênticos: o que entrou foi a
> informação de *quando*, que faltava para saber o que empurra a produção hoje.

A mesma ordem vale para a tela AZUL do operador: ela lê as mesmas `linhas`.

> **Peça sob medida não tem alvo, e isso é definição, não exceção.** Ela não
> existe antes da venda e não sobra depois (§7): não soma `+1` na embalagem nem
> baixa na etiqueta, então o estoque dela é sempre zero. Com alvo, o `precisa`
> daria `alvo − 0` todo dia e o SKU ficaria eterno na tela azul pedindo peça que
> ninguém encomendou. O que ela precisa é o **comprometido**, e só ele.

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

> **A fila não é obrigatória para embalar.** `POST /api/montagem` consome a linha
> da `fila` **quando ela existe** e funciona sem ela: grava a embalagem e soma
> `+1` no estoque igual. O que muda é o `modo`, que vira `'estoque'` — e aí a
> embalagem deixa de abater a ordem do dia. Isso é o que torna
> `node limpar_fila.js` seguro: limpar a fila não trava a bancada.
>
> A fila acumula quando a revisão é lançada e a peça nunca é embalada — foi o que
> aconteceu no período de testes, que deixou centenas de linhas sem peça física
> atrás. O lugar de limpar é o **inventário**: zerado o estoque e contada a
> prateleira, a fila velha não descreve mais nada. `limpar_fila.js` simula por
> padrão, mostra a **idade** das linhas (fila de hoje é trabalho, fila de meses é
> passivo), faz backup e apaga **só** `situacao='aguardando'` — a linha
> `embalado` é história de peça que virou estoque e nunca é tocada.

> ⚠️ **ARMADILHA #20 — a ordem urgente fica ABERTA quando a venda sai do
> estoque, e isso não é peça perdida.** Só a embalagem de fila `modo='hoje'`
> abate a ordem (`mont_route.js`). Peça revisada na tela **azul** e embalada
> como estoque atende a venda do mesmo jeito — a etiqueta sai da prateleira —
> mas a ordem não anda. Em 08/09/2026 as 140 etiquetas do dia estavam
> despachadas, zero volume pendente, e a tela vermelha dizia "4 peça(s)
> URGENTE(S) para hoje": eram 4 ordens assim. O tile, por sua vez, dizia
> "revisão completa", porque contava revisão de **qualquer** modo — duas réguas
> na mesma tela, e o número foi lido como persiana faltando.
>
> `ordem_dia.js` é o **dono único** de "o que ainda falta das ordens de hoje";
> `/api/revisao/dia` (tile) e `/api/revisao/status` (aviso) leem dele. A régua:
> `falta` é por revisão modo `hoje`; a parte urgente da falta que a conta ao
> vivo do `urgencia.js` — a mesma do botão "Lançar urgentes" — não pede mais é
> `atendidas` (o volume já saiu, ou o estoque cobre), e a tela escreve
> **"saiu do estoque — nada a produzir"** em âmbar, em vez de cobrar. O que
> sobra é `a_produzir`, e é só ele que fica vermelho e dispara o alarme.
>
> **Não "conserte" mandando a embalagem azul abater a ordem**: a tela azul é
> produção pra estoque por definição (§3), e abater ali faria o estoque parecer
> reposto quando a peça foi pro cliente. `producao.produzido` segue como
> história do que passou pela bancada vermelha; a tela deixou de usá-lo como
> régua. Ordem **manual** não tem venda atrás e nunca é "atendida".
>
> A TV do chão de fábrica (`painel_route.js`, coluna "Falta hoje") lê a mesma
> conta desde o mesmo dia — ela era a terceira régua, por `producao.produzido`.
> O gerencial (`ger_route.js`) **não** mede ordem do dia: ele lista a fila e a
> falta de estoque do `demanda_dominio`, então não tinha o que alinhar.
>
> **Rode `node teste_ordem_dia.js` após mexer em `ordem_dia.js`, `modo_route.js`
> ou `st_route.js`** — o caso de 08/09 está lá, e o último caso trava que a
> soma dos tiles é igual ao número do aviso. A TV é coberta pelo
> `teste_estoque.js` (caso 12), que compara `faltaHoje` com o `ordem_dia`.

> **Bloqueio do kit:** sem o bipe 2, o bipe 3 é recusado com "⚠ FALTOU O KIT".
> Essa é a garantia contra esquecimento — motivo de devolução recorrente.

> ⚠️ **ARMADILHA #26 — A PORTA DE ENTRADA DO ESTOQUE ERA A MENOS PROTEGIDA DO
> SISTEMA.** Corrigido em 17/09/2026 (era a dívida 14 do §14). `POST
> /api/montagem` é onde a peça vira `+1`, e a operação usa essa rota dezenas de
> vezes por dia. Quatro coisas, e **nenhuma regra nova** — as regras já estavam
> escritas nesta seção; o que faltava era existirem fora do navegador:
>
> - **As quatro escritas viraram uma transação** (`montagem`, `fila`, `skus`,
>   `producao`). Com `better-sqlite3` cada statement auto-commita sozinho, então
>   falha no meio deixava estado impossível: peça fora da fila e fora do estoque
>   — a persiana na prateleira e em lugar nenhum do sistema —, ou `+1` com a
>   ordem do dia ainda pedindo a peça, e aí **o operador produz de novo**.
>   Falha agora é 500 dizendo o quê, com nada gravado e a peça ainda na fila.
> - **SKU não cadastrado é recusado (404).** Era a única rota do fluxo que
>   gravava sem conferir o cadastro (`/api/revisao`, `/api/devolucao` e
>   `/api/embalar` sempre conferiram): o `UPDATE` pegava 0 linhas em silêncio e
>   a resposta era `{ok:true, estoque:0}`. A peça sumia.
> - **O bloqueio do kit virou trava de servidor.** `kit_ok` vinha do corpo com
>   default `1` e ninguém conferia — o "⚠ FALTOU O KIT" era um `if` do
>   navegador. É a mesma lição do `confirmar` do `kit_codigo`: aviso que só
>   existe na tela não protege quem chama a rota por fora.
> - **A tela passou a mostrar a recusa.** Ela ignorava a resposta: um 404 de SKU
>   saía como "Embalada ✓", e a peça ia pra caixa sem existir no sistema.
>
> ⚠️ **O CÓDIGO DO KIT É CONFERIDO QUANDO VEM, E NÃO EXIGIDO** — decisão do dono
> em 17/09/2026. A tela manda o código que foi bipado e o servidor confere;
> chamada sem o campo passa. Exigir travaria o tablet que estivesse com a página
> em cache, e trava que dispara no caso normal vira desvio (armadilha #6).
> **Exigir é o passo seguinte, e depende de um refresh forçado nos tablets.**
>
> ⚠️ **`public/kit_bipe.js` é o dono único de "isto é o kit?"** (`kitNorm`,
> `kitTok`, `kitBate`). A régua saiu de dentro do `montagem.html` porque o
> servidor passou a fazer a mesma pergunta: duas cópias seriam a tela aceitando
> um bipe que o servidor recusa no dia em que uma das duas mudasse. Mesmo
> arranjo do `public/barras.js` e do `public/kit_etiqueta.js`.
>
> ⚠️ **E O QUE NÃO MUDOU: embalar SEM a peça estar na fila continua somando
> `+1`.** A fila não é obrigatória para embalar — é regra, está logo acima, e é
> o que torna o `limpar_fila.js` seguro. A auditoria de 17/08 listava isso como
> defeito porque é anterior a essa decisão. Há caso travando.
>
> **Rode `node teste_montagem.js` ao mexer no `mont_route.js` ou no
> `montagem.html`** — os 42 casos travam a transação, o SKU, o kit, o modo teste
> e a regra da fila que **não** é bug.

> ⚠️ **A CONFERÊNCIA DA PEÇA ACONTECE AQUI, E SÓ AQUI.** No bipe 1 a tela mostra
> em letra grande **o que a peça é** — `140 × 140 cm · Bege · Blackout · Rolô`,
> lido das colunas de `skus` (§7). O operador compara com a persiana na bancada
> antes de ensacar.
>
> Não dá pra mover essa conferência para depois: a embalagem é um **saco preto**,
> e uma vez fechado o único jeito de saber o que tem dentro é a etiqueta de SKU
> colada por fora. Da Etiqueta de Venda em diante ninguém mais vê a peça — lá o
> bipe confere a etiqueta contra a etiqueta, nunca contra o produto.
>
> É também a única defesa contra a peça errada dentro da caixa certa: o leitor lê
> a etiqueta, nunca a persiana. A frase sai do formatador único `pecaTexto` em
> `public/sku.js`, usado pelas duas telas — duas telas escrevendo a medida cada
> uma do seu jeito ensinariam a equipe a achar que são coisas diferentes.

> **Alcance real do kit:** o QR é **fixo** (um link do Google Drive com o manual
> de instalação, que o cliente escaneia em casa). O sistema garante que *alguém
> bipou um kit*, não que *aquele kit específico* entrou naquela caixa. É proteção
> contra esquecimento, não contra fraude. Configurável em `config.kit_codigo`.

> ⚠️ **TROCAR O `kit_codigo` EXIGE `confirmar`, E A GUARDA É DO SERVIDOR.**
> Desde 17/09/2026 (spec `GERADOR-ETIQUETA-KIT`, fase 1) o `POST /api/config/kit`
> recusa com **409** quando já existe um código diferente salvo e o corpo não
> traz `confirmar:true` — e aí **nada** é gravado. Motivo: o rolo de etiquetas
> já impresso com o código antigo para de bater no bipe da Embalagem, e quem
> descobre isso é a bancada, com a peça na mão, sem ninguém saber que houve
> troca. Um `confirm()` só na tela não protegeria quem chama a rota por fora.
> A troca vai para a auditoria, com o código anterior no detalhe.
>
> **O que vai impresso na etiqueta mora ao lado**, quatro linhas em `config`:
> `kit_etq_linha1`, `kit_etq_linha2`, `kit_etq_qr_legenda` e `kit_etq_link`
> (o link do Drive que vira o QR). Editáveis em Admin → Cadastros, no mesmo
> card, com `kit.editar`. Regras que parecem bug e não são:
> - **Campo ausente não é campo vazio.** O `POST /api/config/kit/etiqueta` só
>   mexe no que veio no corpo — é a dívida 15 do §14 (o `POST /api/skus` que
>   zerava o estoque quando o corpo não trazia `estoque`, corrigido em
>   17/09/2026 — §6, armadilha #25) evitada de propósito.
>   Gravar vazio continua possível, e é decisão de quem editou: etiqueta de uma
>   linha só existe.
> - **Link fora do `drive.google.com` avisa e deixa salvar.** Recusar seria
>   trava disparando no caso legítimo (armadilha #6) — o manual pode estar
>   noutro lugar. Sem `https://`, aí sim recusa: é o que vira QR pro cliente.
> - **Não há campo para o código de barras.** Ele é sempre o `kit_codigo` —
>   um segundo campo é exatamente o que faz o impresso sair diferente do que a
>   Embalagem bipa.
> - O limite das linhas 1 e 2 era 20 por chute na fase 1; hoje é **medido** pelo
>   desenho e vale **15** (era 16 até o bloco de texto estreitar em 18/09/2026 —
>   armadilha #31). A legenda do QR são 10, por regra.
>
> **A Embalagem não mudou:** ela continua lendo só `GET /api/config/kit` e
> conferindo o bipe contra o `kit_codigo`.
>
> **A PRÉVIA (fase 2, 17/09/2026) e os DOIS DESENHISTAS.** O card mostra a
> etiqueta desenhada, atualizando a cada tecla, e é nela que o Admin aponta o
> celular para conferir o QR **antes** de sair rolo impresso. Três arquivos,
> todos locais (sem CDN):
>
> | Arquivo | Responde |
> |---|---|
> | `public/kit_etiqueta.js` | **onde cada coisa fica**, em milímetros — dono único do desenho (`elementos()`) |
> | `public/qr.js` | o QR (modo byte, correção M), escrito no projeto |
> | `public/barras.js` | o CODE128-B — **veio do `tecido/`** e agora serve os dois |
> | `kit_pdf.js` | o mesmo desenho no **papel** (fase 3) — nenhuma medida mora aqui |
>
> ⚠️ **UM DESENHO, DOIS DESENHISTAS — e é `elementos()` que garante isso**
> (fase 3, 17/09/2026). O `kit_etiqueta.js` devolve a etiqueta como **lista de
> retângulos e textos em milímetros**, com a origem no canto superior esquerdo;
> a prévia traduz essa lista para SVG e o `kit_pdf.js` traduz para PDF. Nenhum
> dos dois tem medida própria. Antes da fase 3 o desenho morava dentro da
> função que fazia SVG, e isso bastava porque só a tela desenhava — o PDF
> repetindo as posições seria a segunda régua, e a divergência só apareceria
> com o rolo impresso.
>
> ⚠️ **O TEXTO ENCOLHE, NUNCA VAZA.** A letra cai de 6 mm até 3,6 mm de altura
> de maiúscula para caber; abaixo disso a resposta é "não cabe" e o servidor
> **recusa**. Texto cortado no papel é etiqueta que o cliente lê pela metade, e
> ninguém na fábrica vê acontecer — a etiqueta já sai errada da impressora.
>
> ⚠️ **O LIMITE DE CARACTERES NÃO É A REGRA DE "CABE".** São **15** (medidos,
> não chutados — eram 16 até o bloco de texto estreitar para 53 mm em
> 18/09/2026, ver #31), e servem de cerca grossa no campo. Quem decide é a
> **medida**: 15 letras estreitas cabem com folga e 15 `M` não cabem. E a
> medida olha as **duas linhas juntas**, porque elas dividem o mesmo tamanho de
> letra — a linha 1 pode deixar de caber por causa de uma linha 2 que o POST
> nem tocou.
>
> ⚠️ **A FOLGA EM VOLTA DO QR É FUNCIONAL, E É UM MÍNIMO — NÃO O VALOR.** O
> padrão pede 4 módulos livres, então o silêncio é **4 × o módulo**, e o
> módulo muda com o comprimento do link (de 0,375 a 1 mm). Os 2,4 mm do
> `DESENHO.qr.folga` são só o piso. Até 18/09/2026 o número fixo dava os 4
> módulos **por acaso**, porque o módulo tinha meio milímetro; com o QR grande
> (#31) ele passou a ser silêncio de sobra num link e silêncio de **menos** no
> outro — sem mudar nada em tela, porque a legenda fica no mesmo lugar de
> sempre. Encostar a legenda faz o celular demorar ou desistir, e ninguém
> associa isso à distância do texto.
>
> ⚠️ **O QR DA TELA CAI NA GRADE DE PIXELS — e foi isto que impediu o celular
> de ler a primeira prévia (consertado em 17/09/2026).** O QR de 20 mm a
> 4,6 px/mm pedia **2,49 px por módulo**. O navegador arredonda cada borda para
> o pixel mais próximo, e a grade saía com módulos de **2 e de 3 px
> alternando** — inclusive na **linha de timing**, que é justamente a régua que
> o leitor usa para medir o módulo e montar a grade. Ele procura passo
> constante e achava passo que respira. Nada na tela denunciava: o desenho
> continuava com cara de QR, e a matriz estava certa (o mesmo QR grande lia).
>
> `gradeDoQr()` arredonda o módulo para o pixel cheio e reposiciona o QR em
> pixel inteiro, **sempre para baixo**: arredondar para cima deixa o QR maior
> que o espaço reservado e come a folga do silêncio, trocando um problema de
> leitura por outro.
>
> ⚠️ **E O QR PEQUENO NUMA TELA NÃO É PARA SER LIDO PELO CELULAR.** Por isso
> existe, ao lado da prévia, o **QR de conferência** — o mesmo conteúdo com
> módulo de 6 px, rotulado. A etiqueta mostra como vai ficar; o QR grande é o
> que se aponta a câmera. Sem ele, a fase 2 pede uma conferência que a própria
> tela torna difícil.
>
> **Isto era defeito de TELA — até a fase 3 encostar no papel.** Enquanto o
> plano era ZPL, quem desenhava o QR na ZD220 era a impressora (`^BQ`), com
> módulo inteiro em pontos. Com PDF **quem desenha somos nós**, e o mesmo
> defeito passou a ser possível no rolo: a 203 dpi cada milímetro tem 8 pontos,
> e módulo em ponto quebrado faz o rasterizador da Zebra alternar 4 e 5 pontos.
> Por isso o `kit_pdf.js` chama a mesma `gradeDoQr` com **escala 8**. A prévia
> continua a 8 px/mm — o mesmo número, por acaso, e por isso está escrito nos
> dois lugares o que ele significa em cada um.

### ⚠️ ARMADILHA #31 — o QR IMPRESSO não é o tamanho da caixa, e a diferença era de 23%

**18/09/2026.** O dono comparou com a etiqueta antiga (feita no Chrome) e disse
que o QR tinha ficado com cerca de metade do tamanho. Estava certo, e a causa
não era a caixa reservada: era o **arredondamento**.

```
caixa reservada          20 mm          ← o que o DESENHO dizia
link do Drive            41 módulos (v6)
20 mm × 8 pontos ÷ 41  = 4,88 pontos   → arredonda para 3 (sempre para baixo)
QR que saía da ZD220     41 × 3 ÷ 8   = 15,375 mm   ← 23% jogados fora
módulo                   0,375 mm      ← o limite do que a ZD220 resolve
```

> ⚠️ **A CAIXA E O IMPRESSO ERAM DOIS NÚMEROS, E SÓ UM APARECIA.** A prévia
> mostrava "QR versão 6 · letra de 4,3 mm" e nada dizia que o QR do papel tinha
> 15,4 e não 20. O arredondamento para baixo está **certo** (módulo em ponto
> quebrado é a armadilha da fase 2), mas quem escolheu os 20 mm não estava
> escolhendo 20 mm — estava escolhendo um teto do qual a impressora usaria o
> que sobrasse. Hoje o `medir()` devolve `qrPapel` e a tela escreve **"no papel
> o QR sai com 25,6 mm (módulo de 5 pontos da ZD220)"**. O número que interessa
> a quem confere a etiqueta é o do papel.

**O conserto foi dar espaço, e ele custou duas medidas** — decisão do dono em
18/09/2026, com as duas alternativas na mesa:

| | antes | depois |
|---|---|---|
| caixa do QR | 20 mm | **26 mm** (`x` 76 → 70,5) |
| **QR impresso** (link de hoje) | **15,4 mm** | **25,6 mm** — +67% linear, +178% de área |
| módulo na ZD220 | 3 pontos | **5 pontos** |
| bloco de texto | 58 mm | 53 mm |
| letra das linhas 1 e 2 | 4,3 mm | 3,9 mm |
| limite de caracteres | 16 | **15** |
| seta | `cx` 67,5 | `cx` 62 (andou 5,5 mm; desenho e raio iguais) |
| **código de barras** | 58 mm | **58 mm — intocado** |

> ⚠️ **AS BARRAS NÃO ENCOLHERAM, E NÃO PODEM.** Elas ficam em `y` 20..28,5 e o
> QR começa em `x` 70,5 — não se encostam, então o QR cresceu **por cima**, onde
> não havia barra nenhuma. Estreitar aquele bloco afinaria a barra, e é esse
> código que a Embalagem bipa dezenas de vezes por dia. Caso travando.

> ⚠️ **O TETO DO MÓDULO NÃO É A CAIXA: É O ENVELOPE.** O QR mais os 4 módulos
> de silêncio de cada lado são **(módulos + 8) módulos** de ponta a ponta, e é
> esse total que tem que caber — `DESENHO.qr.envelope`, 31 mm, o menor dos dois
> espaços livres (na horizontal, da borda da seta à borda da etiqueta; na
> vertical, do topo à linha de base da legenda).
>
> Sem esse segundo teto o defeito é **invertido e pior**: link **curto** tem
> menos módulos, logo módulo maior, logo silêncio maior em milímetros — o QR
> cresceria empurrando o próprio silêncio para fora da etiqueta. E um QR sem
> silêncio não é lido, com a cara de sempre: o desenho continua com cara de QR.
> Um link do Drive é v5–v7, mas nada impede alguém colar um encurtador.
>
> **Conferido nas dez versões, não só na de hoje:** `teste_kit.js` §8-B varre
> v1 a v10 e exige os 4 módulos livres nos quatro lados. E o caso que vale mais
> que todos eles **não presume qual elemento está perto**: varre a etiqueta
> inteira e exige que nenhuma tinta preta caia na zona de silêncio. Conferir só
> a seta continuaria verde no dia em que alguém acrescentasse algo à direita.

> ⚠️ **E A PRIMEIRA VERSÃO DESSE CASO TINHA RÉGUA PRÓPRIA.** Montei a zona de
> silêncio com os 41 módulos do exemplo escrito acima, enquanto a etiqueta do
> caso usa um link de 37 — comparou o desenho com o silêncio de **outro link** e
> acusou a legenda de invasora sem nada estar errado. É a lição do QR da fase 2
> por outra porta: a grade sai do próprio conteúdo do caso, nunca de um número
> repetido ao lado. Régua própria mente nos dois sentidos — ali acusou o
> inocente, e amanhã deixaria passar o culpado.

**O tamanho é fixo e não tem campo na tela**, por decisão do dono. Ele sai do
`DESENHO`, como todas as outras medidas.

> ✅ **CONFERIDA NO PAPEL EM 22/09/2026, COM AS DUAS PROVAS.** O dono fez o
> deploy, imprimiu 1 de teste e, na etiqueta colada no kit: **o celular leu o
> QR e o leitor bipou** ("leu os dois"). É a régua final de QR — antes disso os
> 133 + 45 casos verdes eram indício, e está escrito assim nesta seção de
> propósito: o defeito da fase 2 passou por três rodadas verdes.
>
> ⚠️ **SÃO DUAS PROVAS DE PAPEL, E A SEGUNDA QUASE FICOU DE FORA.** A fase 3 foi
> registrada com as duas ("o QR abriu **e** o leitor bipou"), e aqui a primeira
> versão deste bloco saiu com o bipe **pendente**: o dono confirmou o celular e
> não falou do leitor. O bloco das barras não tinha sido tocado — mesmos 58 mm,
> mesma posição, mesma altura, e há caso travando —, então não havia motivo
> esperado para falhar. **Mesmo assim ficou escrito como pendente**, porque
> "não tenho motivo para esperar falha" não é a mesma coisa que "bipou", e um
> `CLAUDE.md` que diz *conferido* fecha a pergunta para sempre. Custou um bipe
> e uma pergunta. **Prova que não foi feita se escreve como não feita** — é o
> verde sem conferência que o §10 chama de pior que vermelho.

### ⚠️ A IMPRESSÃO (fase 3, 17/09/2026) — **PDF, e não ZPL**

A §6 da spec mandava enviar ZPL para a impressora. **Não dá**: a ZD220 está
ligada por **USB no computador**, não na rede — o servidor não tem como falar
com ela. O caminho é o mesmo do sob medida (`tecido/dominio/etiqueta_pdf.js`):
`POST /api/kit/etiqueta/imprimir {quantidade}` devolve um PDF com **uma página
por etiqueta, já com 100 × 35 mm**. Não há margem nem escala para o operador
errar — é a armadilha #6 outra vez: o que só funciona quando alguém acerta a
configuração é o que vai falhar.

> **O conteúdo vem do BANCO, nunca do corpo do POST.** Aceitar o texto da tela
> deixaria sair um rolo diferente do que o card mostra e do que a Embalagem
> bipa. Como o servidor lê o salvo, a tela **recusa imprimir com texto não
> salvo** e manda salvar antes: 200 etiquetas com o texto velho é erro que só
> aparece no papel. O teto do lote é 500, e a tela oferece **"Imprimir 1 de
> teste"** primeiro — é com a etiqueta na mão que se vê se o QR abre e se o
> leitor bipa.

> ⚠️ **`kit.imprimir` NÃO É `kit.editar`, E NASCE SEM DONO.** Editar decide o
> que a Embalagem passa a bipar; imprimir só tira cópia do que já foi decidido,
> e quem tira cópia é quem está com o rolo na impressora. A linha em
> `permDaRota()` vem **antes** do `pre('/api/kit')` — atrás dele a chave nova
> seria engolida e não mandaria em nada (§5, armadilha #23).
>
> **Não há backfill, por decisão do dono (17/09/2026):** *"quando assinalar o
> nome da pessoa ela passa a poder imprimir"*. É o contrário do caso
> `pacote.assinar`, onde a chave nova tinha que alcançar sozinha quem **já**
> fazia aquilo — aqui ninguém fazia, porque a impressão não existia. A terceira
> ponta não fica vazia mesmo assim: Admin Geral passa por nível, então o dono
> imprime desde o primeiro boot.

> ⚠️ **O TESTE ABRE O PDF E REMONTA O QR MÓDULO A MÓDULO.** É a lição da fase 2
> aplicada ao papel: um QR **espelhado** continua com cara de QR e não lê em
> celular nenhum, e a inversão de eixo (a lista mede de cima para baixo, o PDF
> de baixo para cima) é erro de um caractere. O caso descomprime o fluxo do PDF
> gerado, remonta a matriz pelos retângulos e compara com o que o `qr.js`
> produziu — reintroduzir a inversão reprova o caso.

> ⚠️ **O UPLOAD DE ARQUIVO PRONTO SAIU (fase 4, 17/09/2026), E NÃO PODE
> VOLTAR.** Até aqui dava para subir a arte da etiqueta (PDF, PNG, JPG ou SVG)
> em `/api/kit/label` e imprimir por ela. O problema nunca foi o upload: era
> serem **dois**. O arquivo enviado é uma **imagem morta** — o gerador
> acompanha o `kit_codigo`, o arquivo não. No dia de uma troca de código, quem
> imprimisse pelo upload tirava um rolo que **não bipa na Embalagem**, e
> descobria com a peça na mão, sem ninguém saber que havia um segundo caminho.
>
> Hoje a impressão da etiqueta do kit tem **uma porta**:
> `POST /api/kit/etiqueta/imprimir`. A seção 12 do `teste_kit.js` trava que as
> quatro rotas do upload não existem — é o que impede alguém recriar o segundo
> caminho sem perceber.
>
> **Nada foi apagado no deploy:** o último arquivo enviado continua em
> `kit/label.<ext>` e a linha `config.kit_label` continua no banco. O código
> parou de lê-los. Limpar é um `rm` na pasta, quando quiser.
>
> ⚠️ **O DEFEITO MAIS CARO DESTA SPEC, E ELE PASSOU POR TRÊS RODADAS DE TESTE
> VERDE (17/09/2026).** Nenhum celular lia o QR da prévia — nem grande, nem
> pequeno, nem com link curto. A causa: o `qr.js` gravava os **15 bits da área
> de formato na ordem invertida**. Essa área diz ao leitor qual máscara foi
> usada; ele acha o código (os cantos da câmera piscam), vem ler o formato, a
> verificação BCH não fecha e ele **desiste em silêncio**. O conteúdo estava
> certo o tempo todo — o que estava errado era o bilhete que explica como ler.
>
> **Por que os testes não pegaram, e esta é a lição que vale mais que o
> conserto:** o teste relia o formato **com a mesma convenção com que o gerador
> o escrevia**. Os dois erravam juntos e concordavam. Pior: quando um
> decodificador "independente" foi escrito justamente para caçar esse tipo de
> erro, ele reaproveitou a leitura torta sem querer — **o ponto cego sobreviveu
> à ferramenta criada para achá-lo**. Um teste que reusa a convenção do código
> que testa não testa nada: ele pergunta a si mesmo.
>
> Hoje o `teste_qr.js` lê o formato **pela regra do padrão** e compara com os
> **oito valores publicados** do nível M (`0x5412`, `0x5125`, `0x5E7C`,
> `0x5B4B`, `0x45F9`, `0x40CE`, `0x4F97`, `0x4AA0`) — números que não saem
> deste projeto e não mudam quando o gerador muda de ideia. Reintroduzir o
> defeito reprova 17 casos; foi conferido assim, e é o único jeito de saber que
> um teste serve.
>
> **Quem descobriu foi o dono, com o celular na mão**, depois de três "está
> consertado" meus. A régua final de QR é câmera de verdade lendo — o resto é
> indício.
>
> ⚠️ **A SETA TEM HASTE.** A primeira versão era um triângulo dentro do
> círculo — e aquilo não se lê como seta, se lê como **botão de play**. Numa
> etiqueta que manda apontar a câmera para um QR, símbolo de vídeo é a pior
> confusão possível.
>
> ⚠️ **ENCURTAR O LINK SÓ AJUDA QUANDO AUMENTA O MÓDULO — e com a caixa de
> 26 mm quase nunca aumenta.** Esta linha dizia, até 18/09/2026, que tirar o
> `?usp=drive_link` "baixa a versão (módulo maior, leitura mais fácil)". Era
> verdade com a caixa de 20 mm: ali o link de produção caía em **3 pontos** de
> módulo e o curto fechava em 4, então tirar salvava a leitura. Depois da #31 os
> dois fecham em **5 pontos**, e tirar só reduz a contagem de módulos — o QR
> impresso sai **menor** (23,1 em vez de 25,6 mm) sem ganhar nada.
>
> **Conselho que sobrevive à trava que o justificava vira conselho errado**, e
> este ficou um dia inteiro mandando encolher o QR que o conserto acabara de
> aumentar. Quem pediu para tirar o parâmetro foi o dono, seguindo o que eu
> mesmo tinha escrito aqui.
>
> Hoje a tela **mede** em vez de supor pela versão: ela chama o `medir` com o
> link sem o sufixo e compara. São **três** desfechos, e cada um tem a sua
> frase — tirar sobe o módulo (âmbar, "vale tirar"), tirar não muda nada
> (etiqueta idêntica), ou tirar só encolhe (com os dois números lado a lado e
> "deixe como está"). O aviso de **módulo abaixo de 4 pontos** continua de pé e
> é independente: ele fala do que a ZD220 resolve, não do link.
>
> ⚠️ **E O TERCEIRO DESFECHO SÓ APARECEU QUANDO A NOTA FOI DESENHADA.** Com o
> módulo igual **e** a mesma versão, a frase de "sai menor" imprimia *"23,1 mm
> em vez de 23,1 mm"*. Absurdo numa frase é o que faz a equipe parar de ler a
> linha inteira — e nenhum teste de unidade pegaria, porque o texto estava
> sintaticamente perfeito. Renderizar os casos é o que pegou.
>
> **Rode `node teste_kit.js` e `node teste_qr.js` ao mexer no `mont_route.js`,
> no `kit_pdf.js`, no card do kit ou nos arquivos acima** — os 133 + 45 casos
> travam a confirmação da troca, o campo ausente, o link, a medida do texto, a
> lista única do desenho, o PDF (tamanho da página, lote, recusa e auditoria),
> **o tamanho impresso do QR e o silêncio em volta dele nas dez versões**
> (§8-B, armadilha #31) e o QR em si — que o teste não "olha": ele decodifica
> de volta, confere a paridade Reed-Solomon e **remonta o QR a partir do PDF
> gerado**. Mexeu na permissão?
> **`node teste_acesso.js`** (114 casos). Mexeu no `barras.js`?
> **`cd tecido && npm test` também** — a etiqueta de prateleira do sob medida
> lê o mesmo arquivo.

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

> ⚠️ **ARMADILHA #4 — a folha de controle é lida POR BLOCO, e a janela do bloco
> não pode olhar para trás atrás de pack/venda/comprador.** A folha monta cada
> item em cinco linhas, em duas colunas:
>
> ```
> <identificação>            Persiana ... 1,60x1,40 Blecaute Cinza
> Pack ID: 2000014610097547  SKU: BK160140CINZA
> Venda: 2000018016683414    Quantidade: 1
> Tiago Sanches              Cor: Cinza
>                            Desenho do tecido: Blackout
> ```
>
> Pack, venda, comprador e cor vêm **na linha do `SKU:` ou abaixo**; só a
> descrição fica acima. Item que não fecha com "Desenho do tecido" (acessório
> não fecha, e nem todo item traz) faria a janela do item seguinte pegar os
> campos dele — foi assim que a etiqueta da Silvia Carolina quase colou no item
> do Evandro num teste com o PDF real.
>
> **O que havia antes:** a folha era fatiada por `split` em "Desenho do tecido",
> e o `match` casava o **primeiro `SKU:`** do pedaço com o **primeiro `Pack ID:`**
> — de itens diferentes quando o de cima não trazia pack. Em 20/08/2026 foi assim
> que Abraão Amorim, que comprou 3 × `BK140140BEGE`, recebeu uma `BK160140BEGE`.
> Auditoria da semana: 2 volumes errados em 361 (0,6%), sem erro humano no meio —
> a bancada bipou o que o sistema mandou.
>
> `folha.js` → `itensDaFolha()` é o **dono único** dessa leitura: o `parse.js`
> grava por ela e a auditoria relê por ela. Duas cópias significaria conferir com
> uma régua diferente da que gravou.

> ⚠️ **O ANÚNCIO DE CATÁLOGO ESCREVE A MEDIDA COM RÓTULO, E O TÍTULO EM TRÊS
> LINHAS (23/09/2026).** O ML tem um layout que o normal não tem:
>
> ```
> Cortina Rolo Blackout Medida L 1,80 X A 1,50 ... Cor Bege Claro -
> E4M2YZZCLZMRDKXC6QUEAE7FSI          ← identificador em linha própria
> Tóquio 002                          ← a continuação do título
> Venda: 2000018578029006
> SKU: BK180150BEGE
> ```
>
> Duas coisas quebravam juntas: a medida vem como `L 1,80 X A 1,50` (o regex
> parava no espaço antes do `A`), e o título fica **três** linhas acima do
> `SKU:`, fora da janela de duas. Sem medida e sem a palavra "Persiana", a linha
> nem era reconhecida como título — o anúncio saía vazio e a **conferência 3
> parava de acusar sem avisar**, que é o silêncio da armadilha #10. Eram 5 em 28.
>
> **`MEDIDA_TITULO` / `medidaDoTitulo()` são o dono único da medida do anúncio**
> — ela era o mesmo regex escrito em dois lugares, e a próxima variação de
> formato seria consertada num e esquecida no outro.
>
> A janela foi até `antes` (a linha logo depois do `SKU:` anterior), que já era
> a guarda contra pegar o título do vizinho, e a varredura passou a ser **de
> baixo para cima**: o título de um item é o mais **próximo** dele, e com janela
> larga procurar de cima acharia primeiro o que está mais longe. A continuação
> é emendada até a primeira linha de campo, pulando o identificador do envio —
> ele não é anúncio e ninguém o reconhece na tela do ML.
>
> Resultado no PDF real: título lido e conferência 3 ativa em **28/28**, contra
> 2/28 antes de tudo isso. Caso 24 do `teste_parse.js`, e o **caso 2 (Abraão)
> passa junto** — a janela larga não pode roubar o título do vizinho.

> ⚠️ **A ÚNICA EXCEÇÃO AO "NÃO OLHAR PARA TRÁS", E O QUE A TORNA SEGURA
> (23/09/2026).** Quando a descrição do anúncio é longa, ela quebra em duas
> linhas e **desfaz o pareamento das colunas** — a venda sobe para a linha
> *acima* do `SKU:` e o comprador cai sozinho na de baixo:
>
> ```
> ...Blecaute Roller Cor Bege Claro -
> Venda: 2000018596292056 Tóquio 002     ← a venda sobe
> SKU: BK180150BEGE
> Paula Cristine Lupepso                 ← o comprador fica sozinho
> ```
>
> São os produtos **Tóquio** — o mesmo nome comercial da armadilha #10, pela
> terceira vez. No PDF de 23/09 eram **5 em 28**. A folha não está sem o dado e
> a etiqueta também não: é a leitura que não pareia. Tratá-los como leitura
> quebrada retinha cinco volumes sem dúvida nenhuma, e mandava alguém reabrir
> cinco pedidos no ML para reler um número que o documento já traz — a armadilha
> #10 outra vez, a trava que acusa o inocente.
>
> `reivindicarAcima()` é a segunda passada, e **a palavra que a torna segura é
> REIVINDICADO**: só entra quem ficou sem pack **e** sem venda, e só se a janela
> acima tiver **exatamente uma** linha cujo número **nenhum outro item pegou**.
> No caso Abraão o pack de cima pertence ao vizinho — está reivindicado, e por
> isso não é oferecido. Duas livres também não resolvem: ambiguidade não se
> desempata por chute.
>
> E não afrouxa o pacote (#23): o irmão de verdade não tem venda em lugar
> nenhum, então não há o que reivindicar. Casos 22 e 23 do `teste_parse.js`
> travam a recuperação e as três guardas — **o caso 2 (Abraão) tem que passar
> junto**, que é exatamente o ponto.
>
> **O ganho não é só destravar:** com o comprador lido, a conferência 2 do §5 —
> a única que não depende do Pack ID — **volta a proteger** esses volumes, que
> até aqui passavam sem ela por falta de dado dos dois lados.
>
> **Rode `node teste_parse.js` após qualquer mudança no `parse.js`, no `folha.js`
> ou no `nome.js`** — os 18 casos montam a folha no formato REAL do ML, e o caso
> do Abraão está lá.
>
> Para conferir o que já está gravado: `node rastrear.js --auditar [dias]`.
> `node rastrear.js --folha` mostra o PDF cru quando o layout mudar.
> `node conferir_nf.js --pdf` confere a nota fiscal de cada volume (#22).

### ⚠️ ARMADILHA #8 — **peça não é volume**, e é daí que sai "subi 41 e aparecem 35"

O sistema grava **uma linha em `lote` por etiqueta**, nunca por peça. O item da
folha que diz `Quantidade: 3` tem **uma** etiqueta do Mercado Livre, logo **um**
volume — e quem contou as persianas na folha achou três. Nada se perdeu: são
duas unidades de medida diferentes para o mesmo papel.

> Não "conserte" isso multiplicando o item pela quantidade no `parse.js`.
> Cada linha de `lote` vira uma **etiqueta de venda impressa**; três linhas para
> um envio que o ML despachou como um só criariam duas etiquetas que não existem,
> e o volume nunca fecharia no carregamento. O caso está travado por teste
> (caso 9 do `teste_parse.js`): a folha tem que **entregar** o 3, e o parse tem
> que continuar gravando **1**.

### ⚠️ A REGRA DA OPERAÇÃO: **uma venda = uma etiqueta = uma persiana**

Regra do dono, reafirmada em 01/09/2026:

> *"Para cada venda é uma etiqueta. Não tem essa de juntar etiqueta, não tem
> essa de juntar pacote, não tem essa de juntar caixa. Não existe isso. Cada
> etiqueta de venda é para um SKU, cada etiqueta de venda é para uma persiana."*

Consequência prática, e é ela que vale no código: **contar linhas de `lote` É
contar peças.** O cliente que comprou três leva três vendas, três etiquetas,
três volumes — cada um com o seu ciclo completo (revisão, embalagem, etiqueta,
carregamento).

> ⚠️ **NÃO MULTIPLIQUE O VOLUME POR NENHUMA "QUANTIDADE".** Isso foi tentado em
> 01/09/2026: o cruzamento passou a somar `pecas` e a etiqueta de venda a baixar
> `pecas` do estoque. Foi revertido no mesmo dia por contrariar a regra acima —
> nenhuma linha disso sobreviveu. Hoje há teste travando os dois lados: caso 1
> do `teste_cruzamento.js` e caso 1 do `teste_etiqueta.js`.
>
> O caminho é sempre o mesmo: **cada peça tem a sua etiqueta.** Se um dia
> aparecer venda de 3 peças com uma etiqueta só, isso é assunto do PDF do
> Mercado Livre — não se resolve multiplicando número dentro do sistema.

**~~Pergunta em aberto~~ — RESPONDIDA em 15/09/2026, ver armadilha #23.** A folha
traz o campo `Quantidade`, e ele aparecia maior que 1 sem ninguém saber o que
significava. O PDF da NF 6585 mostrou: é o **pacote de vários produtos** do
Mercado Livre — uma etiqueta com mais de uma persiana. Hoje o volume é retido e
a gestão assina as peças; `lote_item` guarda o que vai dentro da caixa.

> O campo `Quantidade` do item **principal** continua sem mandar em nada: o
> volume é um só, e é o `lote_item` que conta as peças. O que mudou é que agora
> existe onde contá-las.

**Do PDF até o número que o operador vê há SETE degraus**, e em seis deles o
volume sai da conta por regra. Nenhum é bug — mas nenhum é visível, e é por
isso que a pergunta "cadê as 6" vira desconfiança do sistema:

| Degrau | Some quem | Regra |
|---|---|---|
| peças → etiquetas | as peças extras dos itens com `Quantidade > 1` | esta armadilha |
| etiquetas → gravados | pack/venda **que já existe no histórico** | #5 |
| gravados → pendentes | os `bloqueado` (SKU sem cadastro **ou** divergência) | §6 e §5 |
| pendentes → fila de hoje | quem **só despacha depois** — vai pro painel "Pra despachar depois" | #7 |
| fila de hoje → urgentes | **quem já tem estoque** — sai direto pra Etiqueta de Venda, sem ordem | §5 |
| urgentes → tela vermelha | falta clicar em **"Lançar urgentes na produção"** | §5 |

> **Os dois degraus do meio são os que mais comem volume, e os dois são recentes.**
> A dedup passou a olhar o histórico inteiro (#5) e a fila passou a ser por prazo
> de despacho (#7) — as duas em 25/08/2026, as duas corretas, as duas mudando o
> número da tela sem mudar nada no PDF. Quem comparou a folha com a tela antes e
> depois viu a conta "quebrar" de um dia pro outro.

```bash
node rastrear.js --lote            # a escada inteira, do PDF de hoje até a tela
node rastrear.js --lote 2026-08-26 # de outro dia
```

Ele desce os sete degraus em voz alta e mostra em qual deles a conta mudou,
lista os itens com mais de uma peça e as etiquetas recusadas pela dedup com o
volume que já existia. Só lê — pode rodar em produção.

> ⚠️ Ele usa o `fila_dia.js` para contar a fila de hoje, e não uma cópia da
> regra. Uma ferramenta de diagnóstico com régua própria é pior que nenhuma:
> ela confirmaria com autoridade um número que a tela não usa.

### ⚠️ ARMADILHA #23 — UMA ETIQUETA COM MAIS DE UM PRODUTO, e as peças a mais sumiam

**15/09/2026, e é o dia em que a pergunta em aberto do §5 recebeu resposta.**
Aquele parágrafo dizia: *"Se um dia aparecer venda de 3 peças com uma etiqueta
só, isso é assunto do PDF do Mercado Livre."* Apareceu.

O painel do ML mostrou **"Pacote de 2 produtos · 3 unidades"**. O PDF (NF 6585,
Fabiano Pereira, pack `2000015040457349`) traz **uma** etiqueta, **uma** nota e,
na folha de controle, **dois** itens:

```
RZ3OQY... Cortina Rolo Blackout 1,20x1,20 Blecaute Persiana Bege
Pack ID: 2000015040457349   SKU: BK120120BEGE
Venda: 2000018468081338     Quantidade: 1
Fabiano Pereira             Cor: Bege
                            Desenho do tecido: Liso
Cortina Rolo Blackout 1,40x1,40 Persiana Blecaute Bege     ← o IRMÃO
SKU: BK140140BEGE
Quantidade: 2
Cor: Bege
Desenho do tecido: Liso
```

> **O que acontecia:** o parse casava a etiqueta com o item de cima, gravava
> `BK120120BEGE` e devolvia `conflito: null`. **As duas persianas do irmão
> sumiam por completo** — não viravam volume, não baixavam estoque, não
> apareciam em tela nenhuma. A caixa levava 3 e o sistema conhecia 1. Na
> bancada: bipa uma, imprime, baixa uma, e as outras duas dependem de alguém
> lembrar de olhar o painel do ML. No estoque: duas peças saem da prateleira e
> o saldo não anda. Nenhum aviso, em lugar nenhum.

### ⚠️ A CAIXA DE VÁRIAS PERSIANAS TEM DUAS FORMAS, E A SEGUNDA É A COMUM

**16/09/2026, NF 6490: o cliente comprou 2 e recebeu 1.** O conserto de 15/09
cobria só metade do problema, porque nasceu de um caso só.

| Forma | Como vem na folha | Etiquetas |
|---|---|---|
| **2 SKUs** | dois itens, o de baixo órfão (sem pack/venda/comprador) | 1 |
| **1 SKU, N unidades** | **UM** item, com `Quantidade: 2` escrito nele | 1 |

A segunda passava limpo. O dado sempre esteve lá — o `folha.js` lê `Quantidade:`
e grava em `qtd` desde sempre —, mas **quatro portões decidiam "isto é caixa de
várias?" contando LINHA em vez de PERSIANA**:

| Onde | Era | O efeito |
|---|---|---|
| `parse.js` | a lista de peças só existia `if(irmaos.length)` | o item de 2 unidades não virava `lote_item` |
| `etq_route.js` `/api/proximo` | `itens.length>1` | o bipe devolvia `[]` e a tela seguia normal |
| `etq_route.js` `/api/lote/conferir` | `itens.length<2` recusa | não dava nem para conferir |
| `etq_route.js` `/api/embalar` | `pacote = itens.length>1` | imprimia e baixava **uma** de duas |

Uma linha com `qtd:2` é **uma linha e duas persianas**. Todo portão conta a
soma das `qtd`, nunca `length` — é a mesma lição do bipe por unidade, uma
camada abaixo.

> ⚠️ **NÃO CONFUNDIR COM A ARMADILHA #8.** A quantidade **não** multiplica o
> VOLUME: uma etiqueta continua sendo uma linha em `lote`. Ela conta a **PEÇA**,
> que é o grão do `lote_item` — e essa separação é exatamente o que a tabela
> existe para carregar. Caso 9 do `teste_parse.js` trava as duas metades juntas:
> o volume continua **um**, e as três persianas têm que **chegar** em `itens`.

> **O `pdfFecha` não entra no caso de 1 SKU, e é de propósito.** Ele é a licença
> para ler **ausência** como peça a mais, e o irmão depende dele. A quantidade
> do próprio item não é lida por ausência: está escrita, com todas as letras, no
> bloco daquele item. Exigir o documento fechar para acreditar num número que o
> documento afirma seria recusar a evidência mais forte que existe.

### ⚠️ SÓ O PACOTE DE VÁRIOS SKUs RETÉM — a caixa de N unidades não

As duas levam mais de uma persiana, mas a pergunta é outra:

| | O que o sistema sabe | Decisão |
|---|---|---|
| 2 SKUs | leu a peça a mais por **ausência** — sinal fraco, pode estar errado | retém, a gestão assina |
| 1 SKU | a folha **escreveu** `Quantidade: 2` | não retém |

Reter o caso de 1 SKU seria parar a venda para alguém clicar "confirmo o que o
documento já diz" — e venda de 2 unidades é rotina, não exceção. Trava que
dispara no caso normal vira desvio que a equipe aprende a fazer (#6), e aí o
pacote de verdade passa junto, no meio do que se destrava sem olhar.

A proteção dele mora onde morde: as peças vão pro `lote_item`, a Etiqueta de
Venda não imprime sem o bipe de **todas**, e o estoque baixa por peça.

### ⚠️ A DESCOBERTA NÃO PODE SER NO BIPE — ali a caixa já está montada

A lista "Faltam imprimir" conta **volume**. Uma caixa de três persianas aparecia
como `1`, igual a qualquer venda: a pessoa ia à prateleira, trazia **uma**, e só
no bipe a tela âmbar dizia que eram três. A trava segurava o erro — com o
trabalho já feito. Retrabalho que se repete todo dia é como a equipe aprende a
contornar a tela.

A tela de quem imprime mostra isso em **cinco** momentos, do mais cedo ao mais
tarde:

| Onde | O quê |
|---|---|
| **Card próprio**, acima das duas listas (`GET /api/pendentes/varias`) | uma caixa por **cliente**, com as peças que vão dentro |
| **Painel "Pra despachar depois"** (`?quando=depois`) | a mesma caixa, dentro da data em que ela vence |
| Linha da lista por SKU | `📦 4 persianas em 3 caixas — leve 4`, quando `pecas ≠ qtd` |
| Bipe e pós-impressão | a tela âmbar que já existia |
| **"Já impressos"** (`GET /api/impressos`) | tarja `📦 N persianas` na linha — o **último** lugar |

> ⚠️ **O "JÁ IMPRESSOS" É O ÚLTIMO LUGAR, E ERA O ÚNICO SEM NADA (23/09/2026).**
> Depois de impressa, a caixa sai do card e da lista por SKU — as duas mostram o
> que **falta** — e o banner *"FECHE A CAIXA COM N PERSIANAS"* some no bipe
> seguinte. Dali em diante o volume ficava idêntico a qualquer venda. E esta
> lista tem dois usos em que isso pesa: é onde alguém **volta para conferir**, e
> é de onde se **reimprime** — tirar de novo a etiqueta de uma caixa de duas sem
> saber que são duas é a descoberta tardia um passo adiante.

> ⚠️ **O PAINEL DO "DEPOIS" REABRIA O BURACO INTEIRO, e ficou uma semana assim
> (23/09/2026).** O card cobre a fila de **hoje**; o `GET
> /api/pendentes/futuros` contava `COUNT(*)` e só olhava `lote.codigo`. A NF
> 6959 (Silmara, 2 persianas de 2 SKUs, despacho 01/10) saía ali como
> `BK130130BEGE ×1`: o número mentia **e o segundo SKU não existia em tela
> nenhuma** — ele mora em `lote_item`, e aquela consulta nunca olhou para lá.
>
> E não é painel de leitura passiva: ele diz, com todas as letras, *"dá pra
> adiantar: bipe o SKU e a etiqueta sai"* — e o `/api/proximo/:sku` **não filtra
> por prazo** (§8), então o convite é real. A pessoa bipava, ia buscar **uma**
> peça na prateleira e só na volta a tela âmbar dizia que eram duas. É
> literalmente a descoberta-no-bipe que este bloco existe para impedir,
> acontecendo pela porta do "depois".
>
> **A pergunta ficou num lugar só:** `caixasDeVarias(filtro)` no
> `exp_route.js`, e `/api/pendentes/varias` aceita `?quando=depois` em vez de
> ganhar rota nova. Parâmetro **ausente** devolve o de hoje, igual a sempre —
> tablet com a página em cache continua chamando sem ele e recebe o que recebia.
> Caso travando no `teste_divergencia.js` (os 5 últimos), conferido
> reintroduzindo o `COUNT(*)`: reprova.
>
> ⚠️ **E O PAINEL INTEIRO ERA UM RESUMO CRU, NÃO UMA LISTA DE TRABALHO**
> (23/09/2026, no mesmo dia). Consertado o `COUNT(*)`, sobrava o resto: três
> colunas (data, código, contagem), sem medida, sem cor, sem modelo — *"só o
> código serve a quem decorou o catálogo"*, que é o que o comentário da lista
> do dia diz que não se faz — e **sem estoque**, enquanto a linha logo abaixo
> do título promete *"bipe o SKU e a etiqueta sai, **se tiver peça na
> prateleira**"*. Convite feito, resposta adiada para o bipe: a pessoa ia à
> prateleira descobrir.
>
> Hoje a linha do painel e a da lista "Faltam imprimir" saem do **mesmo
> `SELECT`** (`linhasDeSku(filtro, porData)`) e do **mesmo desenhista**
> (`linhasPend`) — o painel só quebra por data. Ganhou também o resumo do topo
> (*"22 caixas · 23 peças em 7 datas · a próxima é amanhã (24/09, 4 caixas)"*),
> que é a pergunta "o que tem pra despachar" respondida de uma olhada, e passou
> a respeitar o filtro **Todas / Agência / Coleta** do topo — antes ele o
> ignorava, e quem filtrava a tela para Coleta continuava vendo agência ali
> embaixo: a mesma tela dizendo duas coisas.
>
> ⚠️ **NÃO ESCREVA "✓ DÁ PRA ADIANTAR" NO SKU QUE TEM SALDO.** Parece o
> complemento óbvio do vermelho e mente: o saldo é o **mesmo** da fila de hoje,
> e prometer adiantamento de uma peça que a venda de hoje vai consumir manda a
> bancada gastar peça de quem tem prazo curto. Quem impede isso é a trava de
> estoque na hora de imprimir (§8) — não uma promessa na tela. Fica só o
> vermelho de quem não tem, que é a mesma régua da lista do dia.
>
> ⚠️ **A MARCA DE MODALIDADE SÓ APARECE QUANDO ELA SEPARA ALGUMA COISA.** O
> `linhasPend` recebe `marcar`, e só o painel do "depois" passa `true`, e só
> quando o que está à vista tem agência **e** coleta. As duas listas do dia
> nunca passam: elas já estão separadas por porta de saída, e repetir "coleta"
> em toda linha de uma lista chamada Coleta é a marca que deixa de marcar. Onde
> ela serve é óbvio no dia em que aparece — em 24/09 o mesmo `BK140140BEGE` sai
> em **duas** linhas (2 de coleta, 1 de agência), e sem a marca as duas se leem
> como um defeito de tela.
>
> ⚠️ **E EM 23/09/2026 O FUTURO INTEIRO ERA COLETA — 22 de 22.** Faz sentido:
> agência despacha hoje, com hora; coleta é o caminhão marcado para um dia. Por
> isso o painel **não** foi dividido em duas colunas como as listas de cima — a
> coluna "Agência" nasceria vazia, e coluna vazia todo dia vira paisagem.

> ⚠️ **E FOI RENDERIZANDO QUE APARECERAM AS DUAS ÚLTIMAS COISAS** — `📦2 peças`
> grudado e um `2 · 3 peças` que se lê como *"2 peças e 3 peças"*. As duas
> estavam sintaticamente perfeitas e nenhum teste de unidade as pegaria; é a
> mesma lição do *"23,1 mm em vez de 23,1 mm"* do §4. Hoje sai `2 caixas · 3
> peças`, e só quando os dois números divergem.

> **O card agrupa por VOLUME; a lista de baixo, por SKU.** São duas perguntas
> diferentes — "o que vai junto nesta caixa" e "o que buscar na prateleira" — e
> nenhum recorte serve para as duas. Agrupar o card por SKU desmontaria
> justamente a informação que ele existe para dar.

> **`qtd` é CAIXA, `pecas` é PERSIANA, e eles não se somam.** São iguais no dia
> normal e divergem só aqui. O número grande da linha continua sendo caixa
> (é o que ela fecha e o que zera a lista); a linha âmbar diz quantas peças
> tirar da prateleira. Mesma regra do `faltaHoje` × `precisa` do §18.

> ⚠️ **A INSTRUÇÃO DE EMBALAGEM É CONTEÚDO, NÃO ENFEITE.** Regra do dono
> (16/09/2026): **saco maior, as peças juntas com fita** — não é o saco de uma
> peça só. A cor diz "isto é diferente"; só a frase diz o que fazer, e é ela que
> vale para quem nunca montou uma destas. Desde 23/09/2026 ela sai da constante
> `FITA` do `embalagem.html` — quatro cópias literais são quatro coisas para
> divergir. Ela aparece **igual** nos quatro
> lugares: escrevê-la diferente ensinaria a equipe a achar que são duas coisas.

> **O card some quando não há nenhuma.** Card vazio todo dia vira paisagem, e aí
> ninguém lê no dia em que ele aparece cheio. Ele é largo e fica em cima, então
> surgir empurra as listas para baixo sem trocá-las de coluna — diferente da
> coleta no carregamento (§8-B), que fica fixa justamente para a coluna do carro
> não pular de lugar.

**Rode `node teste_etiqueta.js` (os 12 últimos casos são a NF 6490),
`node teste_divergencia.js` (16 últimos: as duas contas, o card e o painel do
"depois") e `node teste_parse.js` (caso 9) após mexer nisso.** E **abra a
tela**: o card, o painel e a linha por SKU são texto montado, e a §2 já ensinou
que rota verde sem tela aberta não é regra pronta.

---

**O irmão se reconhece por AUSÊNCIA**, e é a mesma família de sinal fraco da
#21: ele não traz `Pack ID:`, nem `Venda:`, nem comprador — só descrição, SKU,
quantidade, cor e tecido.

> ⚠️ **NÃO CONFUNDIR COM O CASO ABRAÃO (#4), QUE É O CONTRÁRIO DISTO.** Lá o
> item também vinha sem Pack ID, mas trazia **`Venda:` e o comprador**: era um
> item inteiro cuja etiqueta veio pela venda em vez do pack, e herdar o pack do
> vizinho mandou a peça errada pro cliente. Aqui os **três** campos faltam de
> uma vez. É só isso que separa "item irmão" de "item que o PDF desalinhou" — e
> está no documento, não num palpite: **o irmão é o único item que não tem como
> ser identificado sozinho.** Item com venda ou comprador NUNCA é irmão.
>
> `folha.js` → `irmaosDoPacote()` é o dono único dessa leitura. Os dois casos
> têm teste lado a lado (casos 2 e 17 do `teste_parse.js`) e **têm que passar
> juntos**: quem afrouxar um quebra o outro, que é exatamente o ponto.

### ⚠️ AUSÊNCIA SÓ VALE COMO PACOTE QUANDO O PDF FECHA

Ler ausência como "peça a mais" tem um buraco, e ele é a armadilha #10 por
outra porta: **o pdf.js come campo**. Um item legítimo cujos três
identificadores ficaram ilegíveis tem *exatamente* a mesma cara do irmão — e
tratá-lo como peça a mais juntaria duas vendas separadas numa caixa que não
existe, que é o erro contrário ao que o pacote veio consertar.

A evidência que separa os dois não está no item: está na **conta do documento**.

| | etiquetas | itens | etiqueta sem item | leitura |
|---|---|---|---|---|
| **pacote de verdade** | 1 | 2 | nenhuma | o órfão é peça a mais |
| **leitura quebrada** | 2 | 2 | **uma** | o órfão é item que perdeu os campos |

Por isso `pdfFecha` (no `folha.js`) é a **licença** para ler ausência como
pacote: o órfão só vira irmão quando **nenhuma etiqueta do PDF ficou sem item**.

> ⚠️ **A LICENÇA É DO `folha.js`, E O BACKFILL LÊ POR ELA.** Ela nasceu dentro
> do `parse.js`, e o `backfill_pacote.js` chamava o `irmaosDoPacote` **direto,
> sem a licença** — gravava como peça a mais o órfão que o upload teria retido.
> Ali o erro é mais caro que na tela: com `--baixar` ele tira do estoque uma
> persiana que nunca saiu da prateleira. Foi achado em 15/09/2026, rodando o
> backfill contra os PDFs reais, e o caso 20 do `teste_parse.js` trava as duas
> pontas — a conta e a ausência de segunda cópia.
>
> O script **diz o que recusou**, num bloco próprio com a conta de cada PDF:
> recusa calada faz o mesmo silêncio de "não achei nada", e o que ele recusa é
> justamente o que mais parece pacote.
Sobrou etiqueta órfã, o sistema **não inventa pacote** — retém dizendo a conta
que não bateu (`2 etiqueta(s), 2 item(ns), e 1 etiqueta(s) sem item na folha`),
e manda conferir o pedido no ML ou subir o PDF de novo.

> **Esse volume vai como `divergencia:`, não com prefixo próprio.** É
> literalmente uma dúvida de **leitura** da folha — a mesma família da
> conferência 1 —, e o card vermelho que já existe sabe resolvê-la. Prefixo novo
> custaria mais uma tela, mais um resolvedor e mais uma guarda no `server.js`
> para responder a pergunta que o de sempre já responde.

> ⚠️ **A RETENÇÃO É DO VOLUME COM DÚVIDA, NUNCA DO PDF INTEIRO.** A primeira
> versão (15/09/2026) olhava só `!pdfFecha`, que é condição **global ao
> arquivo**. No PDF real de 23/09 — 28 etiquetas, 5 itens que perderam
> pack/venda/comprador — ela retinha **os 28**, sendo que 23 tinham os três
> campos lidos e não tinham dúvida nenhuma.
>
> Retenção em massa é a armadilha #6 na escala em que ela mais machuca: 23
> destravamentos cegos por dia ensinam a equipe a destravar o 24º sem olhar, e
> o 24º é o que importa. E havia um dano a mais, silencioso: **volume retido
> não aparece na Etiqueta de Venda**, então a caixa de 2 persianas do Silvio
> (`2× BK100100CINZA`, no mesmo lote) sumia da tela junto — a trava escondendo
> justamente o que ela existe para proteger.
>
> Quem tem dúvida é a etiqueta que **não achou item** na folha (`!r1`): essa não
> sabe que peça leva, e um dos órfãos provavelmente é ela. As outras casaram
> por pack ou por venda e seguem o caminho normal. Caso 21 do `teste_parse.js`
> trava isso com o lote de 23/09 em escala menor — 4 etiquetas, 1 leitura
> quebrada, e a caixa de 2 unidades tem que **atravessar** o lote inteira.
>
> Os dois números do motivo contam a mesma história — `N etiqueta(s) sem item`
> e `N item(ns) sem identificacao` —, e é a igualdade entre eles que diz que
> são os mesmos volumes vistos dos dois lados. `irmaosDoPacote` devolve
> **grupos**, não itens: somar `.irmaos.length` é o que faz os dois baterem.

> ⚠️ **A BASE DESTE PADRÃO É UM PDF.** O `irmaosDoPacote` nasceu de **um** caso
> (NF 6585). Compare com a conferência 5, que só vira regra depois de **5**
> ocorrências justamente porque *"uma folha sozinha não prova nada"*. Aqui o erro
> é para o lado seguro — retém, nunca libera —, mas retenção falsa em série é a
> armadilha #6: a equipe aprende a assinar sem olhar. **Acompanhe `pacotes` e
> `folha_nao_fecha` na resposta do upload**: se os dois começarem a aparecer em
> lote normal, o padrão está largo demais e o conserto é aqui, com o PDF na mão.
> Caso 19 do `teste_parse.js` trava a guarda.

### A regra do dono continua inteira — o que faltava era o CONTEÚDO da caixa

> *"Não tem essa de juntar etiqueta, não tem essa de juntar pacote, não tem essa
> de juntar caixa."*

Continua valendo, e o código a respeita: **um volume, uma linha em `lote`, uma
etiqueta de venda, um bipe no carregamento.** O ML juntou as peças; o sistema
não junta nada. O que passou a existir é a tabela **`lote_item`** — o que vai
*dentro* daquela caixa.

| | Grão | Tabela |
|---|---|---|
| a etiqueta / o volume | uma caixa, um ciclo | `lote` |
| **a peça** | **uma persiana** | **`lote_item`** |

> ⚠️ **NÃO "CONSERTE" ISSO CRIANDO N LINHAS EM `lote`.** Três linhas para um
> envio que o ML despachou como um só criariam duas etiquetas de venda que não
> existem, e o volume nunca fecharia no carregamento (#8). O grão de `lote` é a
> **etiqueta**; o grão de `lote_item` é a **peça**. E a dedup (#5) recusaria o
> segundo de qualquer jeito: o Pack ID é o mesmo.

### O caminho do volume, decidido pelo dono em 15/09/2026

**1. O upload RETÉM** (`bloqueio = 'pacote: esta etiqueta leva N pecas de M
SKUs — ...'`), e grava os itens que a folha leu em `lote_item` com
`origem='folha'`. Vem logo **depois da divergência** (peça errada é mais grave)
e **antes de tudo o mais**: nenhuma trava seguinte responde por conteúdo de
caixa — cadastrar SKU não diz quantas persianas vão dentro, e escolher agência
ou coleta muito menos.

**2. Admin → Bloqueados, card âmbar próprio: a gestão ASSINA as peças.** A lista
nasce preenchida com o que a folha disse — **concordar é um clique** — e cada
linha aceita **bipe**, troca de SKU, troca de quantidade, remoção e acréscimo.
É a lição da §5 (Bloqueados → escolher): trava que sabe acusar e não sabe
liberar é trava que a equipe aprende a contornar. A trava do §6 vale **para cada
peça**, não só para o `lote.codigo`. A decisão vira história
(`bloqueio_resolvido`, `resolvido_por`, `resolvido_em`) e vai para a auditoria.

> ⚠️ **ASSINAR TEM CHAVE PRÓPRIA (`pacote.assinar`), E É A ÚNICA DAS TRÊS
> TRAVAS DA ABA QUE TEM.** As outras duas respondem perguntas menores:
> divergência é *qual peça é essa* (`sku.cadastrar`) e modalidade é *por onde a
> caixa sai* (`@admin`). Assinar responde **quantas persianas vão dentro** — e é
> essa lista que a Etiqueta de Venda cobra no bipe e que baixa do estoque, peça
> por peça. É `sensivel`, como `estoque.editar`, pelo mesmo motivo: mexe no
> saldo sem venda na frente, e a assinatura é o único rastro de por quê.
> **Ver** a caixa retida continua `@admin`, como o resto da aba: esconder a
> lista de quem abre Bloqueados não protegeria nada e deixaria a caixa parada
> sem ninguém saber que ela existe.
>
> **São três pontas, e a que some em silêncio é a terceira** (é a armadilha #13
> do §19 por outra porta): a chave em `permissoes.js`, a rota em `permDaRota()`
> do `acesso.js`, e **alguém que tenha a chave**. O seed de setores só grava
> quando o setor **nasce** — num banco que já existe, chave nova não chega a
> ninguém, e a tela dá 403 para todo mundo sem erro e sem log. Por isso há o
> backfill de uma vez só (seção 3-B do `acesso.js`, marcado em
> `config.seed_pacote_assinar`): quem já resolve divergência passa a assinar,
> ninguém ganha o que não tinha, e quem desmarcar a caixinha depois não a vê
> voltar no próximo boot.
>
> O bipe das peças (`POST /api/lote/conferir`) é da **bancada**, não do upload:
> `etiqueta.emitir`. Deixá-lo cair no `pre('/api/lote')` → `pdf.subir` trancaria
> a própria bancada que a trava existe para proteger — quem só tem
> `etiqueta.emitir` não conferiria nem imprimiria.
>
> **Rode `node teste_acesso.js` ao mexer em `permissoes.js` ou no `permDaRota()`**
> — os 114 casos travam as três pontas, o backfill, a cobertura e as quatro
> portas de escalonamento da §10 (#28). **Rota nova pede uma linha no
> `permDaRota()`**: sem ela a rota nasce NEGADA e o `teste_cobertura.js`
> reprova (§10, armadilha #29).

**3. Etiqueta de Venda: sem o bipe de TODAS as peças, não imprime.** Tela âmbar
própria (`📦 ESTA CAIXA LEVA 3 PERSIANAS`), uma linha por peça com o que ela é
(`120 × 120 cm · Bege · Blackout · Rolô`, do mesmo `pecaTexto`), e o bipe marca
cada uma. É o mesmo desenho do kit na embalagem (§4): **o bipe que falta recusa
o passo seguinte**, em vez de avisar e deixar passar — aviso numa caixa de três
persianas é aviso que se aprende a fechar. Depois de imprimir, a tela repete:
`FECHE A CAIXA COM 3 PERSIANAS`, que é a última vez que alguém olha antes do
saco preto.

> **A LISTA APARECE — decidido pelo dono em 15/09/2026**, depois de posta em
> dúvida justamente por contrariar a conferência cega do carregamento (§5).
> Não contraria: **lá a caixa já está fechada** e o bipe confere o que entrou —
> mostrar o SKU esperado faria a pessoa bipar o que fosse para fechar a linha.
> **Aqui a caixa está sendo MONTADA**, e sem a lista a bancada não sabe o que
> buscar na prateleira; esconder viraria adivinhação, não rigor. É roteiro de
> separação, como a "Faltam imprimir".
>
> O que o sistema **não** faz, e é onde o rigor mora, é dar a peça por conferida
> sem o bipe: a lista diz o que procurar, o bipe prova o que entrou.

**4. O estoque baixa POR PEÇA.** `1 × BK120120BEGE + 2 × BK140140BEGE` = três
baixas. A trava de estoque também passou a ser por peça, e a recusa **nomeia o
SKU que faltou** — numa caixa de três, "sem estoque" sem dizer de qual manda a
bancada procurar no escuro.

> ⚠️ **UM BIPE POR PERSIANA, NÃO POR SKU.** Regra do dono (15/09/2026). A caixa
> do Fabiano tem 3 persianas em 2 linhas, e são **três** bipes:
> `BK120120BEGE` uma vez, `BK140140BEGE` duas. `lote_item.conferidos` é um
> **contador**, não um sim/não, e a tela escreve "1 de 2".
>
> A primeira versão fechava a linha inteira no primeiro bipe, com o argumento de
> que duas persianas iguais têm a mesma etiqueta de SKU e bipar duas vezes não
> provaria nada. **Está errado, e o erro é o caro:** não é o código que se
> confere, é a *peça na mão*. Um bipe por linha deixa a persiana irmã na
> prateleira com a caixa marcada como conferida — exatamente o que a caixa de
> várias peças traz de volta.
>
> ⚠️ **O GUARD DE 700 ms DA TELA FICOU MAIS IMPORTANTE, NÃO MENOS.** Ele existe
> porque o leitor às vezes manda o mesmo código duas vezes numa leitura só
> (§12). Antes isso era inofensivo — o servidor respondia "já conferido". Agora
> uma repetição acidental **conta uma persiana a mais**, e a caixa sai com uma
> peça faltando porque o operador acha que conferiu duas. Duas persianas de
> verdade exigem largar uma e pegar a outra, o que nunca leva menos de 0,7 s.
> Não afrouxe esse número para "facilitar" o bipe repetido: é justamente o que
> ele protege.

> **Cadastrar SKU não solta volume retido por `pacote:`** (guarda no
> `server.js`, como a da divergência e a da modalidade): cadastro não responde
> quantas persianas vão na caixa. Soltar ali mandaria a caixa embora com a peça
> a mais não conferida — o buraco que a trava existe para fechar.

### Os volumes que entraram ANTES disto: `backfill_pacote.js`

Volume gravado até 15/09/2026 conhece só o item de cima — as peças do irmão não
existem em lugar nenhum do sistema. `node backfill_pacote.js` relê os PDFs ainda
no servidor pela mesma régua, e **separa os dois casos, que não são o mesmo**:

| Estágio | O que o saldo diz | O que fazer |
|---|---|---|
| **pendente** | a etiqueta não saiu, **nada baixou** | só gravar as peças — o fluxo novo faz o resto |
| **embalado** | a etiqueta saiu e baixou **uma** peça | falta baixar o resto, **se elas foram na caixa** |

> ⚠️ **ELE SÓ ENXERGAVA METADE DO PASSIVO, E ISSO CUSTOU A NF 6986
> (23/09/2026).** O script varria só `irmaosDoPacote` — a forma de **2 SKUs**.
> A forma de **1 SKU com `Quantidade: N`**, que a §5 chama de "a segunda, e é a
> comum", passava batida. O conserto de 16/09 ensinou os **quatro portões do
> fluxo ao vivo** a contarem persiana em vez de linha, e o backfill ficou para
> trás: o único script que existe para consertar o passivo não via metade dele.
>
> O caso real: o volume do Silvio entrou às **06:40**, o deploy foi às
> **08:32**, e ele ficou com zero peça gravada — a etiqueta cobrou uma, o
> estoque baixou uma, e o script não o achava.
>
> **A pergunta ganhou dono único:** `folha.js → pecasDaCaixa(pai, irmaos)`, e o
> `parse.js` e o backfill leem por ela. Duas cópias divergem no dia em que uma
> das formas mudar, e a que fica para trás é sempre a do script — que ninguém
> roda todo dia.
>
> ⚠️ **A LICENÇA DO `pdfFecha` GATEIA OS IRMÃOS, NÃO A QUANTIDADE ESCRITA.**
> Sobrou etiqueta sem item, os **órfãos** daquele PDF não são lidos — e só
> eles. A `Quantidade: N` do próprio item continua valendo: ela não depende de
> ausência nenhuma. Antes o script descartava o **arquivo inteiro**, o que é a
> retenção em massa do §5 por outra porta — uma dúvida que é de *outro* volume
> apagando o que está escrito neste. O relatório diz as duas coisas.

> ⚠️ **O AJUSTE DE SALDO FICA ATRÁS DE `--baixar`, E É DE PROPÓSITO.** No volume
> já impresso o script não tem como saber se a peça a mais entrou na caixa ou
> continua na prateleira — e os dois mundos pedem coisas opostas. Se ela nunca
> saiu, **o saldo está certo** e baixar abre um buraco em vez de fechar. Confira
> a caixa antes. O ajuste vai para `ajuste_estoque` com motivo, quem e quando,
> como todo ajuste manual (§18), e a observação diz de qual volume e de qual
> cliente — daqui a um mês ninguém lembra por que o saldo andou sem venda.

```bash
node backfill_pacote.js                     # só mostra — as DUAS formas
node backfill_pacote.js --aplicar           # grava as peças
node backfill_pacote.js --aplicar --baixar  # e acerta o saldo dos já impressos
```

Faz backup por `db.backup()` antes de gravar, e é idempotente: só olha volume
que ainda está na fábrica e que **não tem** peças gravadas. Volume já carregado
fica de fora — saiu por onde saiu, e mexer no saldo por causa dele hoje
carimbaria uma saída que aconteceu noutro dia (a regra dos três scripts de
passivo, §5).

> ⚠️ **O REPARO TEM PRAZO DE VALIDADE: 7 DIAS.** O script **relê o PDF** — ele
> não adivinha nada, e é isso que o torna confiável. Mas o cron apaga os PDFs de
> `lotes/` em 7 dias, e a partir daí **as peças daquele volume não voltam por
> script nenhum**: o documento que as afirmava não existe mais. Na rodada de
> 23/09/2026 eram **82 volumes** nessa situação, contra 19 PDFs ainda no disco.
>
> A saída **diz o número** (`volumes cujo PDF ja saiu do disco`), e ele não é
> decoração: é o tamanho do que já não dá para consertar assim. Volume fora da
> janela só se acerta com o painel do ML na mão, por **Admin → Estoque**, com
> motivo — o mesmo caminho do `--baixar`, e pela mesma razão (§18).
>
> **Consequência prática:** regra nova que dependa deste backfill tem uma semana
> para ser rodada. Depois disso o passivo que ela pegaria vira permanente, e
> nada em tela nenhuma diz que ele existiu — é a dívida 18 (§14) pela porta do
> arquivo que expirou.

**Rode `node teste_parse.js` (casos 17, 18 e 19), `node teste_divergencia.js` (os
últimos 10 casos são o pacote) e `node teste_etiqueta.js` (os últimos 16) após
mexer nisso.** Para achar os casos nos PDFs do servidor:
`node conferir_nf.js --pdf` — a pergunta 0 do relatório é esta.

### ⚠️ ARMADILHA #22 — a NF é do PEDIDO, e a impressão leva a PRIMEIRA folha dela

Revisado em 15/09/2026. A escada da armadilha #8 tem um degrau irmão que ninguém
tinha olhado: **peça não é volume, e volume não é nota.**

| Unidade | Grão | Onde vive |
|---|---|---|
| peça | o que o cliente comprou | `Quantidade:` da folha (dívida #11) |
| volume | uma etiqueta, uma caixa, um ciclo | uma linha em `lote` |
| **nota** | **o pedido** | `lote.nf`, e ela **pode se repetir** |

**Venda repetida seria contradição; NF repetida não é.** A regra do dono
(*uma venda = uma etiqueta = uma persiana*) fala de venda, e a dedup do upload
(#5) já recusa Pack ID ou Venda que exista no histórico — então venda com dois
SKUs no banco é ou volume anterior a 25/08/2026 ou o ML repetindo um número que
promete não repetir. **A NF é outra coisa:** o cliente que leva três persianas
num pedido só tem três vendas, três etiquetas, três caixas — e **uma nota**,
impressa três vezes, uma por caixa. Isso está certo e não é duplicidade.

O `GET /api/print/:id` monta duas páginas: a etiqueta (`labelPage`) e a nota
(`danfePage`). É aqui que a NF repetida encosta no código:

> ⚠️ **A NOTA DE DUAS FOLHAS IMPRIMIA A FOLHA 2.** Nota com muitos itens estoura
> para uma página de continuação, e as duas trazem o mesmo `Número`. O mapa
> `danfeByNf` do `parse.js` era `[nf]=p` sem guarda, e a **última vencia**: o
> volume apontava para a continuação, e saía da impressora a folha 2 — sem
> cabeçalho, sem chave de acesso, sem canhoto. Quem cola a etiqueta não tem como
> perceber, porque a nota certa nunca aparece do lado para comparar. Hoje a
> primeira folha vence, e há caso travando (caso 16 do `teste_parse.js`).
>
> **O que ainda não está resolvido:** a impressão leva **uma** página. Se a nota
> tiver duas folhas, a segunda continua ficando para trás — agora com a folha 1
> saindo, que é o documento. O `conferir_nf.js` diz se isso existe nos PDFs do
> servidor; enquanto não existir, `lote.danfePage` continua sendo uma coluna só.

**A leitura crua do PDF tem dono único, e passou a ter de verdade.** `tipoDaPagina`
("o que é esta página") e `nfDaNota` ("qual o número desta nota") moram no
`folha.js`: o `parse.js` grava por elas, o `rastrear.js` e o `conferir_nf.js`
conferem pelas mesmas. Antes cada um tinha a sua cópia — e conferir a impressão
com outra régua é conferir olhando um papel diferente do que a impressão usa.

**`nome.js` é o dono único de "estes dois nomes são a mesma pessoa?"** — a régua
da conferência 2 (#10: repetição sim, letra trocada nunca, e falta de dado devolve
`null`, nunca acusação). A conferência de NF faz a **mesma** pergunta sobre os
volumes de uma nota; com duas réguas ela chamaria de gente diferente quem o upload
já aceitou como a mesma pessoa, e a lista de alarme nasceria cheia de falso
positivo — armadilha #10 de novo.

```bash
node conferir_nf.js              # todo o histórico
node conferir_nf.js 30           # só os últimos 30 dias
node conferir_nf.js --pdf [30]   # relê também a folha dos PDFs ainda no servidor
```

Ele responde quatro coisas e **só lê**: venda com mais de um SKU, cliente com mais
de uma persiana na mesma NF, **NF com clientes diferentes** (esta é para olhar no
dia — ou a nota de um está na caixa de outro, ou o `NF:` foi lido errado) e o que
a impressão faz com cada caso.

> **O `--pdf` não é luxo: sem ele a pergunta 1 não tem resposta.** O banco só
> guarda o que passou pela dedup — se o PDF trouxesse a mesma venda com dois
> SKUs, o segundo teria sido **recusado antes de virar linha**. Só relendo a
> folha dá para perguntar ao documento em vez de perguntar ao que sobrou dele.
> Os PDFs somem em 7 dias (cron), então essa janela é a que existe.

### Três conferências, e qualquer uma delas retém o volume

O `parse` devolve `conflito` e o upload grava o volume como `bloqueado` com
`lote.bloqueio = 'divergencia: ...'` quando:

| # | Conferência | O que ela pega |
|---|---|---|
| 1 | **As duas leituras da folha** — o bloco (`leitura1`) × o tokenizer (`leitura2`), em mapas separados | O PDF lido de dois jeitos dando SKUs diferentes |
| 2 | **O comprador** — o nome na etiqueta × o nome no bloco | O volume casado com o item de outra pessoa. É a única que **não depende do Pack ID**, que é justamente o número que desalinha |
| 3 | **A descrição** — `1,60x1,40` escrito no anúncio × a medida dentro do código do SKU | O item corrompido, mesmo que as duas leituras concordem |
| 4 | **A cor** — a cor do anúncio × a cor dentro do código do SKU | O que a medida não separa: duas peças do mesmo cliente, mesma medida, cores diferentes. Ali o nome também não desempata |
| 5 | **A linha do produto** — a família da descrição × o prefixo do SKU, contra o que o sistema já viu | O que nem medida nem cor separam: `BK160140BEGE` ("Cortina Rolo Blackout") e `SCREEN3-160140BEGE` ("Toucher Rolô Evolux") têm a MESMA medida e a MESMA cor |

> **A conferência 5 aprende sozinha, e por isso demora a acusar.** O par
> família → prefixo é acumulado na tabela `familia_sku` a cada upload, e só vira
> regra depois de **5 ocorrências**. Produto novo no catálogo não pode parar a
> expedição enquanto o sistema ainda não sabe nada sobre ele: no PDF de 24/08 o
> `SCREEN3` apareceu **uma vez em 47 volumes** e passou limpo, como tem que ser.
> Uma tabela escrita à mão envelheceria calada; esta se atualiza com o catálogo.

> A lista de cores da conferência 4 sai dos próprios campos `Cor:` da folha,
> nunca de uma lista fixa: cor nova do catálogo entra sozinha, sem ninguém
> lembrar de vir aqui.

### ⚠️ ARMADILHA #10 — a trava que acusa o inocente para de proteger o culpado

Em 31/08/2026 havia **10 volumes retidos, e os 10 estavam corretos.** Nenhuma
peça errada, nenhum cliente trocado — três defeitos diferentes acusando gente
certa. Uma trava com 100% de falso positivo não é uma trava rigorosa: é a
armadilha #6 outra vez, o desvio que a equipe aprende a fazer. Quem destrava
dez inocentes em sequência destrava o décimo primeiro sem olhar, e é esse que
importa.

| Defeito | Vítimas | O que era |
|---|---|---|
| **O nome partido pelo PDF** | 3 (Dona Lizete) | A etiqueta traz `Dona Lizete (CONTADOR)`; o pdf.js quebrou a linha e sobrou `CONTADOR)`. A remontagem só olhava fragmento **começando** com `(` — o que chega com o `)` órfão não era remontado, e a palavra `CONTADOR)` virava o comprador |
| **Cor com nome comercial** | 5 (Tóquio 004 / 002) | `Tóquio 004 - Cinza com acabamento branco` e um SKU `CINZA` dizem a **mesma** coisa. O código não contém a frase inteira, então a conferência procurava outra cor e achava a própria |
| **Letra dobrada no nome** | 1 (Ryta) | `Rufiino` na etiqueta × `Rufino` na folha — digitação do próprio ML, não troca de cliente |

**O reparo de cada um é de precisão, não de afrouxamento** — os três casos reais
continuam retidos, e há teste para isso (casos 12 a 14 do `teste_parse.js`):

- `nomeDaEtiqueta()` vira o dono único da leitura do comprador e remonta o nome
  também quando o fragmento traz `)` sem `(`.
- A conferência 4 só acusa quando a cor do código **não aparece** no texto do
  anúncio. Anúncio `Bege` contra SKU `CINZA` continua retido.
- A conferência 2 tolera **letra repetida**, e só isso.

> ⚠️ **A TOLERAÇÃO DO NOME NÃO PODE SER DISTÂNCIA DE EDIÇÃO.** "Até 2 letras de
> diferença" resolveria o caso da Ryta e abriria um buraco no lugar exato onde
> não pode: **`Marcelo Sousa Silva` e `Marcela Sousa Silvo` também estão a duas
> letras, e são duas pessoas.** A conferência 2 é a única que não depende do
> Pack ID — ela existe justamente para pegar o volume casado com outro
> comprador. Por isso `mesmoNomeComRepeticao()` colapsa letras repetidas dos
> dois lados e exige **igualdade**: passa quem difere só na repetição
> (`rufiino`/`rufino`), nunca quem teve letra **trocada** (`marcelo`/`marcela`).

> **Consertar o comprador aumenta a proteção, não diminui.** Enquanto o nome vinha
> como `CONTADOR)`, aquele volume não estava sendo conferido — estava sendo
> acusado por ruído. Nome ilegível não vira acusação (é a regra dos dois lados),
> então cada nome que volta a ser lido é um volume que **passa a ter** a
> conferência de identidade. Acompanhe `cobertura.comprador` na auditoria: ela
> tem que **subir** depois deste reparo.

> ⚠️ **UMA TRAVA QUE PARA DE ACUSAR FAZ O MESMO SILÊNCIO DE "ESTÁ TUDO CERTO".**
> As conferências 3 e 4 leem a medida e a cor **de dentro do código do SKU**
> (`BK160160`**`CINZA`**). O dia em que os códigos deixarem de carregar esses
> dados — e o §7 permite, SKU é etiqueta livre — as duas param de proteger sem
> emitir um único aviso.
>
> Por isso a auditoria (`/api/auditoria/skus` e o botão em Admin → Bloqueados)
> reporta a **cobertura**: quantos volumes cada trava conseguiu de fato conferir.
> Abaixo de 100% ela aparece em âmbar. **Se esse número cair, a proteção
> encolheu** — e aí ou o código do SKU volta a carregar o dado, ou a conferência
> passa a ler das colunas de `skus` em vez do texto do código.

> As conferências 2 e 3 só acusam quando **os dois lados existem**: nome que não
> deu para ler, ou SKU sem medida no código (§7 — SKU é etiqueta livre), nunca
> viram acusação. Silêncio por falta de dado não pode virar bloqueio, senão a
> operação para por ruído e a equipe aprende a destravar sem olhar.

Validado contra os PDFs reais de 24/08: **47 volumes, zero conflitos**, e todos
os 46 do lote grande conferidos por um caminho independente (o nome do comprador)
sem uma única divergência.

O volume divergente:
- não imprime etiqueta e não carrega (é `bloqueado`);
- **não é solto pelo destravamento automático do §6** — cadastrar SKU não resolve
  uma dúvida sobre *qual peça o cliente comprou* (guarda no `server.js`);
- sai só por `POST /api/divergencias/resolver`, depois de alguém abrir o pedido no
  Mercado Livre e escolher. Aparece na aba **Bloqueados** do admin, em vermelho.

### ⚠️ ARMADILHA #24 — o anúncio chegava DECAPITADO, e com ele iam três coisas

Corrigido em 17/09/2026. A descrição do anúncio saía de um recorte a partir da
palavra "Persiana" (`folha.js`, `/(Persiana[^|]*)$/`). O ML escreve a palavra
**no fim** do título:

```
RZ3OQY...  Cortina Rolo Blackout 1,50x1,50 Blecaute Persiana Cinza
o que era gravado:                                  Persiana Cinza
```

Nos testes isso nunca apareceu porque o helper do `teste_parse.js` montava
"Persiana" logo depois do identificador — e aí o recorte pegava a linha toda
**por acaso**. No PDF real, sobrava o rabo do título.

**O estrago era em três lugares de uma vez, e só o primeiro era visível:**

| Onde | O que acontecia |
|---|---|
| **Admin → Bloqueados** | `anúncio: Persiana Cinza` não identifica anúncio nenhum. Quem ia resolver o volume tinha que abrir a venda no ML só para descobrir de que anúncio se tratava — exatamente o trabalho que o campo existe para poupar |
| **Conferência 3** (medida) | ela lê `1,50x1,50` do **texto do anúncio**; sem a medida, parava de acusar em silêncio, que é a armadilha #10 inteira |
| **Conferência 5** (família) | aprendia `PERSIANA CINZA` como família — e família que **muda com a cor** não é a linha do produto. A `familia_sku` vinha acumulando isso |

**Quem manda agora é a estrutura da folha, não a palavra:** a descrição é a
linha acima do `SKU:` que não é linha de campo (`Pack ID:`, `Venda:`, `SKU:`,
`Quantidade:`, `Cor:`, `Desenho do tecido:`). A âncora continua de pé só como
guarda contra o **cabeçalho da página** ("Identifiicação Produtos"), e aceita
também a **medida por extenso** — o mesmo dado que a conferência 3 já lê, e que
não envelhece como lista de palavras. O identificador da coluna da esquerda sai
(`tituloDoAnuncio`): ele não é o anúncio.

> **A trava passa a acusar mais, e isso é o ponto.** Nos títulos com "Persiana"
> no fim a conferência 3 estava desligada sem ninguém saber. Acompanhe
> `cobertura.medida` na auditoria: ela tem que **subir**. A `familia_sku` velha
> não é reescrita — é história do que o sistema viu, e o aprendizado recomeça
> sozinho (≥5 ocorrências), então nada passa a acusar de repente.

> **Os volumes já gravados:** `node backfill_descricao.js` (simula) e
> `--aplicar`. Ele relê os PDFs ainda no disco pela mesma régua e regrava só
> `lote.descricao` e `lote_item.descricao` — não toca em saldo, estágio nem
> bloqueio. **Alcança só os últimos 7 dias**, que é o que o cron deixa: título
> não se inventa de memória. Caso 20 do `teste_parse.js` trava o formato real.

### Como o volume retido volta a andar (Bloqueados → escolher)

> ⚠️ **UMA TRAVA QUE NÃO SABE LIBERAR É UMA TRAVA QUE A EQUIPE APRENDE A
> CONTORNAR.** Até 01/09/2026 a tela montava os botões de escolha dando
> `split("/")` no texto do `bloqueio`. Isso só devolve SKU no motivo 1
> (`leituras divergem: A / B`); nos outros quatro o botão saía com a frase
> inteira dentro — `descricao diz 160x140 e o SKU e BK140140BEGE` — e o resolver
> recusava, porque aquilo não é código nenhum. **Quatro dos cinco motivos
> prendiam o volume para sempre.** O sistema sabia acusar e não sabia liberar.

As opções agora saem do **cadastro de SKU**, não do texto do motivo: a rota varre
`skus` e fica com os códigos que aparecem no bloqueio. Isso acha SKU com espaço
(`ROLO SOB MEDIDA 137x212`, §7), que nenhuma quebra por token acharia, e nunca
oferece um código que o §6 recusaria dois cliques depois.

**O código já gravado é sempre a primeira opção.** Nas conferências 3, 4 e 5 a
dúvida é entre o código e o *anúncio* — e quem abriu o pedido no ML pode muito
bem concluir que o código estava certo e o anúncio é que estava torto.
Concordar com o sistema era, justamente, a única resposta que a tela não aceitava.

A tela mostra, para cada volume retido: **por que parou** (os motivos, um por
linha), **o anúncio como o ML escreveu** — é esse texto que se reconhece na tela
do Mercado Livre, onde SKU não aparece —, as opções com **o que a peça é**
(`160 × 140 cm · Bege · Blackout · Rolô`, do mesmo `pecaTexto` da embalagem) e um
campo livre que **aceita bipe** para o caso em que a peça certa não é nenhuma das
citadas.

**A dúvida vira história.** Resolver apaga o `bloqueio` (é ele que retém), mas
grava `lote.bloqueio_resolvido`, `resolvido_por` e `resolvido_em`, e registra na
auditoria. Sem isso o volume destravado fica idêntico ao que nunca teve problema,
e a trava não deixa rastro de quantas vezes salvou — nem de quem a destravou com
pressa.

> A trava do §6 continua de pé aqui: SKU fora do cadastro **não** solta volume.
> A mensagem manda cadastrar antes, em vez de recusar sem dizer o quê.

**Teste obrigatório após mexer no destravamento ou nos textos de conflito do
`parse.js`:** `node teste_divergencia.js` — os cinco motivos entram com o texto
**exato** que o `parse.js` escreve. Mudou a frase lá, o caso quebra aqui, que é
o ponto: a tela lê esses textos.

### A conferência dupla no carregamento

`config.conf_carregamento = '1'` faz o carregamento pedir **dois bipes**: a
etiqueta de venda e o código do SKU **na mesma caixa** (ele fica visível porque a
etiqueta de venda é colada por baixo). Não bateu, não carrega, e a divergência vai
para a auditoria.

> **O segundo bipe é cego.** O sistema não mostra o SKU esperado antes — quem já
> sabe a resposta bipa o que for para fechar a linha, e a conferência vira
> confirmação. Os dois códigos só aparecem depois de divergirem, como alarme.

Desligável (Admin → Cadastros) porque custa um bipe por volume, todo dia. Nasce
**desligada**: ela cobre o erro de colagem, que ainda não tem evidência nos dados
— o erro que já aconteceu foi o do parse, e esse não passa mais.

> ⚠️ **ARMADILHA #9 — o carregamento NÃO filtra por dia, e não pode voltar a
> filtrar.** `carga.js` é o dono único de "isto está pra carregar?", e a resposta
> é `estagio='embalado'`, sem olhar `data`. Volume com etiqueta impressa e não
> carregado está **fisicamente na fábrica** até alguém pôr no carro; não existe
> hora em que ele deixe de estar.
>
> As três consultas da tela — a lista, o contador e **o bipe** — filtravam por
> `data=date('now','localtime')`, o dia da *importação*. O volume embalado ontem
> e não carregado ontem sumia das três de uma vez, e não havia nenhuma outra tela
> em que reaparecesse. Em 26/08/2026 eram os volumes **#643 a #648**, impressos
> no dia anterior.
>
> O pior dos três é o bipe: ele respondia **`nao_encontrado`** com a caixa na
> mão, na frente do carro. Ali ninguém tem como conferir nada — o que a equipe
> aprende é que o sistema erra, e a próxima caixa sobe no carro sem bipe.
>
> Terceira porta da mesma doença dos fantasmas (#5) e da fila por prazo (#7).
> As duas primeiras eram tela mostrando trabalho que **não existe**; esta era
> tela escondendo trabalho que **existe** — e é pior, porque o ruído a equipe
> aprende a ignorar, mas o volume escondido ninguém procura.
>
> **`carregados` conta por `carregado_em`**, nunca por `data`: senão o operador
> bipa um atrasado, ele sai da lista e o contador não anda — a tela dizendo que
> ele não fez nada. Mesma correção que o "impressas hoje" do `exp_route.js`.
>
> **O atrasado sai marcado e em cima**, nunca diluído no dia. Passivo antigo
> misturado no trabalho de hoje vira uma lista que nunca zera, e lista que nunca
> zera ninguém lê até o fim — que é o mesmo fim de esconder.
>
> **Rode `node teste_carga.js` após qualquer mudança no `carreg_route.js`** —
> os 49 casos incluem o dos seis volumes de 26/08, e cobrem que a busca larga
> não virou "acha qualquer coisa" (código inexistente ainda dá `nao_encontrado`)
> e que `bloqueado` continua recusado.

> ⚠️ **ARMADILHA #27 — A CAIXA SUBIA NO CARRO SEM NUNCA TER PASSADO PELA
> ETIQUETA DE VENDA.** Corrigido em 17/09/2026 (era a dívida 13 do §14). O bipe
> do carregamento recusava só `bloqueado` e `carregado`: volume **`pendente`**
> virava `carregado` e a peça saía da fábrica **sem o −1** que só a Etiqueta de
> Venda dá. Três estragos de uma vez, e nenhum com sinal em tela nenhuma:
>
> 1. o estoque fica **permanentemente acima do físico** — a peça saiu e o saldo
>    não andou, e `skus.estoque` não se reconstrói (§14);
> 2. o volume some da conta de urgência, porque `cruz_route.js` só olha
>    `pendente` — a venda nunca vira ordem;
> 3. **nada registrava.** Não havia como saber, depois, que aquilo aconteceu.
>
> `carga.js` sempre respondeu `estagio='embalado'` para *"isto está pra
> carregar?"* — a lista e o contador liam de lá, e **só o bipe tinha régua
> própria**, que é exatamente o que aquele arquivo existe para impedir. Hoje o
> bipe recusa com `nao_embalado`, **diz por onde imprimir** (a caixa está na mão
> da pessoa, na frente do carro: recusa sem caminho é o que ensina a empurrar do
> jeito que der) e a recusa vai para a **auditoria**.
>
> ⚠️ **E A BOCA DO BURACO ERA O `GET /api/print/:id`**, que imprimia a etiqueta
> de qualquer volume — inclusive o `pendente`. Era ele que punha etiqueta na mão
> do operador sem baixa. A tela da Etiqueta de Venda chama essa rota **depois**
> do `POST /api/embalar`, então o fluxo da bancada não mudou; o que saiu foi o
> **segundo caminho**: o botão "imprimir" da lista de lote, em
> `expedicao.html`, que pulava a bancada. É a lição do upload da etiqueta do kit
> (§4): dois caminhos para o mesmo papel é o que faz um deles sair errado sem
> ninguém saber que ele existia. Reimpressão de volume já `embalado` ou
> `carregado` continua igual (armadilha #1-B).
>
> **Os volumes que já saíram assim não são desfeitos por este conserto** — o
> saldo deles continua alto, e `skus.estoque` não se reconstrói (§14).
>
> **Quem conta esse passivo é o `node conferir_carregados.js`** (só lê; aceita
> `N` dias e `--scripts`). Ele separa duas coisas que o banco não separa: o
> volume que **pulou a etiqueta** e o que foi **fechado à mão** pelos scripts do
> §5 — os dois deixam `embalado_em` vazio, e a única marca entre eles é a hora
> `15:00:00` que aqueles scripts carimbam por **convenção** (§8), não por
> relógio. Um bipe feito exatamente às 15:00:00 seria lido como fechamento de
> script: é o falso negativo, e está escrito no cabeçalho do arquivo porque
> número de diagnóstico sem a margem ao lado vira fato.
>
> ⚠️ **E A MARCA TEM O FALSO POSITIVO SIMÉTRICO, QUE EU NÃO PREVI E A PRODUÇÃO
> MOSTROU (17/09/2026).** As 15:00 só existem desde **26/08/2026** — até a
> véspera o `regularizar_saida.js` carimbava `datetime('now')`, o relógio de
> verdade (o `fechar_vencidos.js` já nascia certo). Fechamento à mão feito antes
> disso sai com hora de gente, e a primeira versão do script o acusava como furo
> da dívida 13. Na primeira rodada em produção foram **3 dos 11**.
>
> ⚠️ **E A RÉGUA FOI CONFERIDA CONTRA UMA FONTE QUE NÃO VEIO DO MESMO
> RACIOCÍNIO** — é a lição do QR (§4) aplicada aqui: um teste que relê pela
> convenção com que escreveu não testa nada, ele pergunta a si mesmo. O
> agrupamento apontou os volumes **440, 484 e 485**; o histórico do shell do
> servidor trazia, de 25/08, exatamente `node regularizar_saida.js 440 484 485
> --aplicar`. Os três ids, na mesma ordem. Deixou de ser inferência.
>
> **Quando a dúvida voltar, o caminho é esse, e é barato:**
> `grep -n "regularizar_saida\|fechar_vencidos" ~/.bash_history` no servidor. Os
> scripts do §5 não gravam em auditoria — o histórico do shell é o único lugar
> onde essa decisão humana deixou rastro, e ele não é eterno.
>
> O que denuncia esses é o **segundo repetido**: um `UPDATE` em transação grava
> o mesmo instante em todas as linhas de uma vez, e ninguém larga uma caixa,
> pega outra e bipa **três** vezes dentro de um segundo. **Três, e não dois:**
> `datetime('now')` corta no segundo, então um bipe em x,1 s e outro em x,9 s
> caem na mesma string sem nada de errado ter acontecido. Dois é ambíguo; três
> não é — e na ambiguidade a resposta é **acusar**, porque esconder um furo
> deixa o saldo alto para sempre e ninguém vai procurá-lo, enquanto acusar um
> fechamento à mão custa uma conferência.
>
> O corte por data é obrigatório nos dois sentidos: depois de 26/08 os dois
> scripts carimbam 15:00, então agrupamento em outra hora não tem script que o
> explique e **volta a ser furo** — sem isso, um `UPDATE` em bloco feito amanhã
> apagaria furos sozinho. E a contagem do bloco olha **todo o histórico, nunca a
> janela**: ser parte de um fechamento em bloco é fato do volume, não do recorte
> por onde se olha, e contar dentro da janela faria o mesmo volume mudar de
> classificação conforme o argumento da linha de comando.
>
> A conta é **por peça** (a caixa de pacote devia ter baixado N, §5 #23) e
> **sob medida fica de fora** — ela nunca somou `+1` (§7), então cobrar a baixa
> dela abriria um buraco em vez de fechar. `teste_carregados.js` (28 casos)
> trava as três regras e as duas margens da marca.
>
> ⚠️ **NÃO HÁ `--aplicar`, E ISSO É A DECISÃO, NÃO UMA FALTA.** O script diz o
> que o sistema tem **a mais**; ele não sabe o que aconteceu **depois** — pode
> ter havido contagem, ajuste ou devolução no meio do caminho, e descontar por
> cima disso erra duas vezes. O caminho é: conferir a prateleira, e só então
> corrigir por **Admin → Estoque**, que exige motivo e grava em
> `ajuste_estoque` com quem e por quê (§18). Os scripts do §5 **não** servem
> aqui: eles carimbam saída, e a saída desses volumes já aconteceu — o que
> falta é o saldo, não o estágio.
3. `cruz_route.js` compara os volumes **pendentes** × estoque e gera só urgência:

| Situação | Vira | Cor na revisão |
|---|---|---|
| Vendido, **sem** estoque | Produção **urgente** (`urgente=1`) | 🔴 |
| Vendido, **com** estoque | Sai da etiqueta direto do estoque — **sem** ordem de produção | — |

> **Fase 3 (14/08/2026):** o PDF passa a gerar **só urgência**. A reposição
> (produção para repor o estoque vendido) saiu do cruzamento e agora vem do
> cálculo ao vivo da tela azul (`/api/revisao/producao`). O PDF fica só na expedição.

**Exemplo:** 5 vendas de um SKU com 2 em estoque → 3 urgentes. As 2 com estoque
vão direto para a etiqueta de venda; o buraco no estoque é refeito pelo
planejamento (tela azul), não mais por uma ordem de reposição do PDF.

### ~~A foto do estoque (`foto_estoque`)~~ — removida na Fase 3

A foto era um remendo para o recálculo do PDF: congelava o estoque do dia para o
segundo upload não recontar. Sem produção de reposição vinda do PDF, perdeu a
razão. A urgência agora é **auto-corrigível**: conta os volumes ainda `pendente`
contra o estoque atual, então reaplicar depois de produzir/expedir não infla o
número — o volume processado sai de `pendente` e o estoque baixa junto.

**Recálculo é idempotente:** `POST /api/cruzamento/aplicar` apaga as ordens de
`origem='ml'` do dia e refaz. Subir o mesmo PDF duas vezes não duplica.

> ⚠️ **ARMADILHA #5 — a deduplicação do upload olha o HISTÓRICO INTEIRO, não o
> dia.** Pack ID e Venda são números do Mercado Livre: cada volume tem o seu, e
> ele nunca reaparece em outra venda. Então "já existe" é resposta definitiva —
> nunca "já existe hoje".
>
> Enquanto o `SELECT` da dedup em `exp_route.js` trazia
> `WHERE data=date('now','localtime')`, resubir um PDF de ontem (ou subir um
> lote reemitido, que repete vendas de dias anteriores) reinseria cada volume
> como **`pendente` de hoje** — inclusive volumes já impressos e despachados. Em
> 25/08/2026 foram **94 volumes fantasmas num dia só**, e os montes órfãos de 21,
> 19 e 18/08 mostram que vinha acontecendo havia semanas.
>
> O estrago não é a linha a mais: é a fila "Faltam imprimir" cobrando etiqueta de
> peça que está no caminhão. Fila que mostra o que não existe é fila que a equipe
> aprende a ignorar — e aí o volume que falta de verdade some junto com o ruído.
>
> Passivo antigo se limpa com `node limpar_fantasmas.js` (simula) e
> `--aplicar` (faz backup por `db.backup()` e apaga). Ele só remove o
> **`pendente`** cujo irmão mais antigo já **andou** (`embalado`/`carregado`) —
> duplicata com irmão `pendente` ou `bloqueado` sai numa lista à parte, para
> alguém olhar. O que fica é sempre o mais antigo, que é quem carrega a história.

### Os três scripts que fecham passivo — e as duas regras que valem para todos

| Script | Fecha | Critério |
|---|---|---|
| `limpar_fantasmas.js` | duplicata `pendente` | irmão mais antigo já andou |
| `fechar_vencidos.js` | `pendente` vencido | em bloco, por período conferido |
| `regularizar_saida.js` | qualquer não-carregado | por id, um a um, decisão humana |

> ⚠️ **A saída é carimbada na data DO VOLUME** — `COALESCE(despachar_em, data)`
> às 15:00 (§8) —, nunca em `datetime('now')`. Fechar um passivo antigo com a
> data de hoje cria um pico falso de dezenas de carregamentos num dia em que
> não saiu nada, e deixa vazios os dias em que as peças realmente saíram.
> O `fechar_vencidos.js` já nascia certo; o `regularizar_saida.js` foi
> corrigido em 26/08/2026, quando passou a ser usado com 27 ids de uma vez.

> ⚠️ **VENDA FUTURA NÃO FOI DESPACHADA.** Volume com `despachar_em > hoje` não
> se fecha, mesmo com a etiqueta já impressa: ela foi impressa adiantada e a
> peça está na fábrica esperando o prazo. Fechar carimba uma saída que não
> aconteceu, e — o dano real — o volume **não aparece na tela de carregamento
> no dia em que tiver que sair de verdade**. A peça fica na prateleira e
> ninguém é cobrado.
>
> A guarda existia só no `fechar_vencidos.js`. Ao copiar a fórmula da data para
> o `regularizar_saida.js` ela ficou para trás, e em 26/08/2026 quatro volumes
> foram fechados com data de setembro (o caso da Lucélia, que despacha 17/09).
> Hoje os dois recusam, dizendo em qual data o volume despacha.
>
> Reparo de uma vez só: `node reabrir_futuros.js` (simula) e `--aplicar`. O
> critério é estreito de propósito — só `carregado_em` **maior que hoje**, que
> não tem interpretação alternativa: ninguém saiu amanhã. Se ele voltar a achar
> linha algum dia, alguém furou a guarda.

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
todos os volumes bloqueados daquele código (`sku_cad_route.js`), e a resposta
diz **quantos** soltou (`destravados`).

> ⚠️ **ARMADILHA #25 — O CADASTRO DE SKU APAGAVA O SALDO, E A TELA ESCONDIA
> ISSO.** Corrigido em 17/09/2026 (era a dívida 15 do §14). O `POST /api/skus`
> tinha `estoque=0` e `alvo=0` como **padrão do corpo**, e o upsert gravava
> `excluded.estoque`: uma chamada só com código e descrição **zerava o estoque
> do SKU**. Sem erro, sem log, sem motivo e sem linha em `ajuste_estoque` — que
> é o único lugar onde saldo mexido à mão deixa rastro (§18). A tela do admin
> reenvia os valores e por isso nunca caiu nisso; qualquer outro chamador caía.
> São três regras, e cada uma fecha uma porta diferente:
>
> - **Campo ausente não é campo vazio**, e vale para os **quatro** campos soltos
>   (`descricao`, `cor`, `estoque`, `alvo`) — a mesma regra que já valia para as
>   medidas na mesma rota. Ausente preserva o que está gravado; SKU novo nasce
>   com texto vazio e zero.
> - **Número impossível é recusado, nunca clampado.** Negativo, fração, texto e
>   campo vazio levam **400** com o nome do campo, e o saldo gravado não se
>   mexe. Clampar em zero seria a primeira regra outra vez por outra porta: o
>   saldo sumiria em silêncio, que é o defeito que se está consertando. Para
>   **manter** o saldo, o jeito é não mandar o campo.
> - **As duas escritas são uma transação só.** O destravamento ficava fora de
>   transação e dentro de um `catch(e){}` **vazio**: falhou, a API respondia
>   `{ok:true}` e os volumes seguiam bloqueados sem nenhum sinal — o volume some
>   da lista de quem cadastrou e ninguém vai procurá-lo. Hoje falha é **500**
>   com nada gravado, e o erro vai para o log.
>
> **A rota saiu do `server.js` para o `sku_cad_route.js` por isso**: o
> `server.js` abre porta e banco real, e nenhum teste do projeto consegue
> carregá-lo. Rota que mexe em estoque e não dá para testar é dívida que só
> fecha no susto. O `require` ficou exatamente onde as rotas estavam — mudar o
> lugar mudaria a ordem de registro no Express.
>
> **Rode `node teste_skus.js` ao mexer no `sku_cad_route.js`** — os 60 casos
> travam os quatro campos, a recusa do número impossível, o rollback e as três
> guardas do destravamento (divergência, modalidade e pacote continuam presas).
> Mexeu na ordem do `server.js`? O teste de segurança da §10 também.
>
> **O que NÃO entrou, e continua aberto:** a rota muda saldo com
> `sku.cadastrar`, sem motivo e sem auditoria, enquanto o `POST /api/estoque`
> exige motivo, é `sensivel` e grava em `ajuste_estoque` (§18). Fechar essa
> porta muda como a fábrica trabalha — é `REGRA`, não conserto.

**Sem tabela de equivalências, por decisão explícita.** Se o anúncio do ML manda
`BK140140BEGEML` e o cadastro tem `BK140140BEGE`, o volume fica bloqueado até o
anúncio ser corrigido na origem. Isso força a padronização em vez de mascará-la.

---

## 7. O SKU — **não há formato obrigatório**

> ⚠️ Isto mudou em 23/08/2026 (Compras, Fase 0). Se você lembra da regra
> `BK + largura(3) + altura(3) + COR`, ela **não existe mais**.

**O código do SKU é uma etiqueta livre.** Pode ter espaços, hífens, números no
meio — `ROLO SOB MEDIDA 137x212` é um SKU válido. O sistema não interpreta o
código para descobrir nada.

O que a peça É vive em **colunas** de `skus`:

| Coluna | O que é | Exemplo |
|---|---|---|
| `largura_cm`, `altura_cm` | Medida, centímetros inteiros | 160, 140 |
| `cor_codigo` | Cor, da lista fechada `cor` | `BEGE` |
| `tecido_codigo` | **Material**, da lista `tecido` | `BLACKOUT` |
| `modelo_id` | **Mecanismo**, da tabela `modelo` | Rolô, Acessório |

> ⚠️ **Tecido não é modelo.** O `BK` dos códigos antigos é *blackout* — o
> tecido. O modelo é o mecanismo: Rolô, Romana. A primeira migração da Fase 0
> confundiu os dois e gravou modelo `BK` em 24 SKUs; foi corrigido. Nunca deduza
> modelo do prefixo do código.

**Produto sem medida existe.** `KIT32` e `ACESSORIOSPERSIANAS` não são persianas.
O modelo deles tem `exige_medida = 0`, e por isso não são cobrados por largura e
altura na tela de pendências. Sem essa flag, o contador nunca zeraria — e um
contador que nunca zera é um contador que a equipe aprende a ignorar.

> A **etiqueta impressa** segue a mesma flag. Ela cobrava medida de todo mundo, e
> o acessório caía num beco sem saída: não havia o que preencher em Pendências de
> SKU e a etiqueta nunca saía. Hoje, sem medida, o lugar de destaque vira a
> **descrição** (`Kit 32 mm completo`) e o M² não é impresso — área de acessório
> não existe, e `M² 0.00` seria um número falso colado no produto. Persiana sem
> medida cadastrada continua recusada: ali a medida falta mesmo.

**Produto sem estoque existe, e não é falta.** `modelo.sob_medida = 1` marca a
peça feita contra o pedido do cliente: ela não existe antes da venda e não sobra
depois, então o saldo dela é sempre zero. Esses SKUs não passam pela trava de
estoque da Etiqueta de Venda **nem pela baixa** — sem `+1` na embalagem não pode
haver `−1` na impressão, senão cada venda sob medida abriria um buraco de uma
peça no SKU.

> ⚠️ **ARMADILHA #6 — a trava que a operação contorna não protege, só cega.**
> Até 25/08/2026 o `POST /api/embalar` recusava todo SKU com estoque zero. Como
> sob medida **nunca** tem estoque, isso recusava 100% dessas vendas. O que
> acontecia então não era a peça ficar retida: a bancada imprimia a etiqueta
> direto do PDF do Mercado Livre e despachava por fora — sem registro, sem a
> conferência do carregamento, e com o volume preso em `pendente` para sempre,
> reimportado a cada PDF novo. Foi assim que 1 SCREEN3 e 2 SOBMEDIDA de 24/08
> viraram fantasmas depois de terem sido entregues.
>
> Quando uma trava dispara todo dia no caso normal, ela para de ser proteção e
> vira um desvio que a equipe aprende a fazer — e o desvio acontece fora da
> vista do sistema, que é o pior lugar possível.

> ⚠️ **ARMADILHA #30 — E ESSE CONSERTO FICOU TRÊS SEMANAS SEM FUNCIONAR, PORQUE
> NINGUÉM MARCOU A CAIXINHA.** Descoberto em 17/09/2026, por acaso, enquanto se
> levantava outro passivo. O conserto da #6 lê `modelo.sob_medida`. Em produção
> **nenhum modelo tinha a flag**: havia dois, `ROLO` e `ACESSORIO`, os dois com
> `sob_medida = 0` — e o SKU `SOBMEDIDA` estava cadastrado como **Rolô**. A
> regra estava escrita aqui, codificada em quatro arquivos, e **inerte**.
>
> **É a armadilha #13 (§19) pela terceira ponta.** Lá são chave, rota e alguém
> que a tenha; aqui são a coluna, o código que a lê e **o dado preenchido**. A
> que some em silêncio é sempre a última: nada no boot, no log ou em tela
> nenhuma diz *"esta regra não está pegando em ninguém"*.
>
> E o modo de falhar é o da própria #6, o que torna a coisa circular: com a flag
> em zero a trava de estoque voltava a disparar em **100%** das vendas sob
> medida, a bancada despachava por fora, e o sistema não registrava nada. Os
> volumes 484 e 485 (Geison Sobrinho, 25/08) saíram assim — foram lidos como
> passivo da dívida 13 e eram, na verdade, o sintoma desta.
>
> **Os dois sinais que denunciaram, e servem para a próxima vez:**
> - `SOBMEDIDA` aparecendo na conta de saldo do `conferir_carregados.js`. Aquele
>   script só põe na tabela quem tem a flag **falsa** — foi ele que gritou, sem
>   ter sido escrito para isso.
> - `14 × 4 cm` no cadastro. O bipe 1 da embalagem mostra a medida em letra
>   grande para o operador comparar com a peça na bancada (§4); número absurdo
>   ali é conferência que ensina a equipe a ignorar a linha.
>
> **O reparo foi cadastro, não código** (17/09/2026): modelo `SOBMEDIDA` / *Sob
> medida* com `sob_medida = 1` e `exige_medida = 0`, e o SKU apontado para ele,
> com largura e altura **vazias** — vazio ali é resposta, não pendência. Custo
> do `SOBMEDIDA` passou a sair como **pendência** na lista de compras, e isso
> está certo: antes era um número tirado da ficha do Rolô aplicada a `14 × 4`
> (§7-B, regra 4 — custo indefinido nunca vira zero).
>
> ⚠️ **NÃO MARQUE `sob_medida` NO MODELO `ROLO` "para resolver".** São 29 dos 30
> SKUs: a fábrica inteira sairia da trava de estoque e da baixa de uma vez, e o
> saldo pararia de andar sem um único aviso.
>
> ⚠️ **E O REPARO A CLIQUE FALHOU NO MEIO — por isso ele virou script
> (18/09/2026).** São quatro passos em duas telas, com caixinhas que salvam
> sozinhas e um campo de código que é chave de upsert. O que sobrou da primeira
> tentativa: o modelo **não criado**, o texto `"Sob medida "` parado no campo
> livre `cor` (que é o que a embalagem mostra em letra grande, §4), um SKU vazio
> `BKSOBMEDIDA` nascido de uma edição no campo do código, e **quatro cadastros
> desativados por engano** (`SCREEN3`, `BEGE`, `BRANCO`, `CINZA`).
>
> `node arrumar_sobmedida.js` (simula) e `--aplicar` fazem as cinco coisas numa
> transação, com backup por `db.backup()` antes. `teste_arrumar_sobmedida.js`
> (63 casos) trava as duas guardas que importam: **o ROLO nunca recebe a flag**
> (são 29 dos 30 SKUs — a fábrica inteira sairia da trava de uma vez) e o SKU
> vazio **só é apagado** se não houver saldo nem referência em nenhuma das dez
> tabelas que citam um código. Apagar cadastro com volume atrás devolve o volume
> para `bloqueado` (§6): SKU a mais é ruído, SKU a menos é caixa parada.
>
> ⚠️ **E HÁ MAIS DE UM SKU SOB MEDIDA — `--sku CODIGO` aponta os outros**
> (18/09/2026). O `BKSOBMEDIDA` **não** nasceu de deslize: é um SKU real da
> folha do ML, cadastrado em 16/09 para destravar a venda do Anderson (volume
> 1628). Sem modelo, a Etiqueta de Venda lia `sob_medida = 0`, via saldo zero e
> recusava — a #30 com um cliente esperando. Ele mexe **só no modelo**: cor,
> medida e saldo ficam como estão, porque limpar campo de um SKU qualquer seria
> o script inventando estrago onde não há.
>
> ⚠️ **SKU COM SALDO É RECUSADO, e essa é a #30 ao contrário.** Sob medida não
> baixa estoque (§7): apontar para lá um SKU que tem peça na prateleira
> **congela aquele saldo para sempre** — ele nunca mais desce e nada avisa. O
> script recusa dizendo o número, e manda zerar por Admin → Estoque (com
> motivo) antes. E **nomear um SKU no `--sku` é dizer que ele é legítimo**:
> ele nunca é apagado na mesma rodada, senão o script o apontaria para o modelo
> e o apagaria na mesma transação.
>
> ⚠️ **AVISO NÃO É AÇÃO.** O "NÃO apaguei o BKSOBMEDIDA" descreve o que o
> script **deixou** de fazer, e entrava na lista de ações: toda rodada
> anunciava "O QUE VOU FAZER" com uma linha que não faz nada. Lista que repete
> o mesmo texto toda vez ensina a ignorá-la, e aí a rodada com algo de verdade
> passa batida. Hoje os avisos saem num bloco **ATENÇÃO** próprio, antes.
>
> ⚠️ **DUAS ARMADILHAS DE TELA APARECERAM AÍ, e as duas continuam de pé:**
> - **O campo do código no Cadastro de SKU é chave de upsert.** Editá-lo **cria
>   um SKU novo** em silêncio, em vez de renomear o antigo — e na tela ele
>   parece um campo editável como os outros.
> - **"Desativar" não tem botão de voltar.** A linha inativa mostra só o texto
>   "inativo". O caminho de volta existe e não é óbvio: **Adicionar** com o
>   mesmo código reativa (a rota grava `ativo=1` no conflito). Desativar não
>   apaga nada, e SKU que já aponta continua apontando — o único efeito é sumir
>   da lista de opções de cadastro novo.
>
> **Regra que fica:** regra nova que dependa de flag de cadastro não está pronta
> quando o código a lê — está pronta quando **existe linha marcada no banco**.
> Enquanto não houver, ela é texto. Ainda **não há nada que acuse isso sozinho**
> (a cobertura do §18 faz exatamente esse trabalho para as conferências do
> parse; aqui não existe equivalente) — é dívida aberta.

> ⚠️ **`SOBMEDIDA` é um balde, e isso ainda é dívida aberta.** Um código só para
> peças que são todas diferentes: a folha de controle traz apenas `SOBMEDIDA`,
> enquanto na bancada as peças vêm etiquetadas por pedido (`1027/01`, `1027/02`)
> e com **medidas quase sempre diferentes**. Nada liga o volume do ML à peça
> física — a fila pega "a mais antiga de `SOBMEDIDA`", que não diz *qual peça*.
> Hoje quem resolve é a memória de quem embala, e nenhuma das cinco conferências
> do §5 pega uma troca, porque as duas peças têm o mesmo código. Falta o cadastro
> do item sob medida (pedido, item, medida, cor, cliente) e o bipe que fecha esse
> vínculo contra **o cliente** — que é onde o erro caro mora: item trocado dentro
> do mesmo pedido chega no mesmo endereço; peça trocada entre clientes é
> reclamação.

### Quem lê o quê

- Etiqueta, revisão (`/operador`) e devolução leem **as colunas**. Um SKU sem
  medida cadastrada não imprime etiqueta e aparece só pelo código na revisão.
- `public/sku.js` (`medidaDe`) é o **único** lugar que ainda olha o texto do
  código, e serve a **um** propósito: no cadastro, quando alguém digita um
  código no formato antigo, adiantar largura, altura e cor. Os campos seguem
  editáveis e vale o que está no campo. Ela **nunca** devolve modelo.
- O que falta preencher aparece em **Admin → Pendências de SKU**.

**A trava do §6 continua valendo.** "Sem formato" não é "sem cadastro": o SKU
tem que existir em `skus`, senão o volume fica bloqueado. São coisas diferentes.

**A etiqueta impressa (Zebra ZD220, 100×35 mm, 203 dpi)** é gerada no navegador
com JsBarcode em CODE128B, a partir da aba Cadastro de SKU. Impressão exige
margens "Nenhuma" e escala 100% — "Ajustar à página" deforma as barras e o leitor
recusa.

**A etiqueta impressa (Zebra ZD220, 100×35 mm, 203 dpi)** é gerada no navegador
com JsBarcode em CODE128B, a partir da aba Cadastro de SKU. Impressão exige
margens "Nenhuma" e escala 100% — "Ajustar à página" deforma as barras e o leitor
recusa.

---

## 7-B. Compras — o módulo novo

> Especificação completa: `docs/specs/COMPRAS.md` — o topo dela lista o que mudou na construção.
> Fases 1 a 6 implementadas (1–5 em 23/08/2026, 6 em 24/08). Fase 7 (relatórios)
> pendente — espera haver história para mostrar.
> Histórico de custo (`custo_dominio.js`) e contagem de material entraram
> **antes** da Fase 6, e de propósito: os dois são relógios de história. Enquanto
> não existem, o período não fica atrasado — fica perdido, porque história não se
> reconstrói depois. A perda de corte só aparece comparando o que a ficha diz que
> foi consumido com o que sobrou na prateleira, e isso precisa de meses.

Responde três perguntas que o sistema não respondia: **o que comprar**,
**de quem comprar** e **quanto o produto custa**.

### A peça que quase todo sistema de compras erra

```
UNIDADE DE CONSUMO   como a ficha gasta        metro · unidade
UNIDADE DE COMPRA    como o fornecedor vende   barra 6 m · caixa 500 un
FATOR                quantas de consumo cabem numa de compra
```

**A embalagem mora na OFERTA, não no componente.** O mesmo tubo é barra de 6 m
num fornecedor e de 3 m no outro — se morasse no item, os dois não caberiam no
cadastro. E ninguém compra fração de embalagem: precisa de 7 m, leva 12.

Por isso a comparação mostra **sempre três números** — preço por unidade,
desembolso e sobra. Ordenar por um só, escondendo os outros, é como o comprador
é enganado.

### A ficha é fórmula, não lista

Componentes se lançam **uma vez, no modelo** — nunca SKU a SKU. Com 200 SKUs e 3
modelos são 18 linhas em vez de 1.200, e o SKU novo de amanhã custa zero.

`formula.js` é a **única porta** por onde uma expressão do banco é executada, e
**não usa `eval()`**. Uma string do banco rodando como JavaScript daria a quem
edita fórmula acesso ao `.session_secret` e aos PINs. Fórmula não salva sem
passar no teste de três medidas.

> ⚠️ **Tecido resolve por família + cor + largura de bobina**, e a quantidade
> pode depender da bobina (corte invertido). A escolha é por **custo total da
> peça**, não por menor preço por metro linear — com corte invertido a bobina
> mais cara por metro sai mais barata por peça.

### Donos únicos — não replicar

| O quê | Dono | Por quê |
|---|---|---|
| `componente.estoque` e `movimento_componente` | `componente_dominio.js` | `skus.estoque` tem nove donos e por isso não se reconstrói história |
| Custo médio | `componente_dominio.js` | Só se move no recebimento |
| Ficha e custo de um SKU | `ficha_dominio.js` | O histórico de custo precisa da MESMA conta da tela |
| Demanda por SKU (`precisa`) | `demanda_dominio.js` | O número que a fábrica produz é o que manda na compra |
| Explosão da ficha → material | `necessidade_dominio.js` | Gatilho 2 da lista de compras |
| Necessidade → desembolso | `compras_calc.js` | Custo nunca se calcula em dois lugares |
| Avaliação de fórmula | `formula.js` | Segunda porta = buraco de segurança |

> **Por que a demanda saiu do `plan_route.js`:** o `precisa` de cada SKU já
> decidia o que a fábrica produz (tela AZUL do operador). Quando ele passou a
> decidir também **o que comprar**, uma segunda cópia significaria comprar
> material para uma fábrica diferente da que existe.

### ⚠️ ARMADILHA #18 — a ficha tem DOIS números por linha, e eles nunca fecham

Desde 04/09/2026 a linha da ficha responde duas perguntas diferentes, em
colunas diferentes de `ficha_formula`:

| Coluna | Responde | Quem lê |
|---|---|---|
| `expressao` | quanto a peça **consome** | custo, compra, necessidade de material |
| `corte_largura` / `corte_altura` | a quanto a bancada **corta** | a ficha de produção |

```
tubo de uma persiana de 1,60   CONSOME 1,60 m da barra de 6 m
                               é CORTADO a 1,57 (o resto entra nas ponteiras)
```

Os 3 cm vão pro lixo. **Precificar pela medida de corte faz a fábrica parar de
pagar por eles; cortar pela medida de consumo faz a peça não entrar.** São duas
verdades, e quem um dia "unificar" está cortando ou o custo ou a peça. No
tecido a medida de corte é um **retângulo** (largura × altura + folga), no tubo
é um número só; onde não há o que cortar as duas ficam vazias, e isso é
resposta, não pendência.

O `ficha_dominio.js` soma **só** a `expressao`. Há caso travando isso: dobrar a
medida de corte não pode mexer em um centavo (`teste_ficha.js`). E falta de
preço **não apaga** a medida de corte — a bancada corta o tubo do mesmo jeito
sem fornecedor cadastrado, e ficha que some manda cortar de memória.

> Até aqui esse segundo número morava na cabeça de quem corta, que é a mesma
> doença do `SOBMEDIDA` (§7): o vínculo existe na memória e não no sistema.

### ⚠️ ARMADILHA #19 — o `/200` do tecido é um DOIS escrito dentro da fórmula

A linha de tecido do modelo Rolô é `(altura + 20) / 200`. O `/200` afirma que
cabem **duas peças por faixa** em qualquer bobina, de qualquer largura.

> ⚠️ **A CONTA SÓ FECHA COM A MEDIDA DE CORTE E A ORIENTAÇÃO NA MÃO, e nenhuma
> das duas estava no sistema.** A primeira versão desta seção acusou a peça de
> 1,80 de custar **metade** do que a ficha dizia. Estava errado: aquela conta
> supunha a peça **de pé**, e a fábrica corta essa — e só essa — **invertida**.
> O corte real dela é `1,77 × 1,60` (largura − 3, altura + **10**), e invertida
> cabem **duas por faixa** na bobina de 3,20, porque `1,60 + 1,60 = 3,20`
> exato. O consumo verdadeiro é **0,885 m**, contra os 0,850 que o `/200` cobra
> — 4% a menos, não metade.
>
> A lição não é sobre o número: é que **medida de corte e orientação são dados
> de produção, e enquanto moram na cabeça de quem corta qualquer conta feita
> por fora inventa uma fábrica que não existe** — inclusive a minha.

O corte real é `largura − 3` de largura por `altura + folga` de altura, e a
folga muda com a orientação: **+20 de pé, +10 invertida**. Os 10 cm não são
economia de tecido — são o que faz `1,60 + 1,60` fechar em 3,20.

Contra o corte de pé, que é o que a fábrica faz em seis das sete larguras:

| Largura | SKUs | melhor de pé | o `/200` cobra |
|---|---|---|---|
| 1,00 | 3 | 3 por faixa na 3,20 → 0,567 m | 0,850 → **50% a mais** |
| 1,20 a 1,60 | 16 | 2 por faixa → 0,850 m | 0,850 ✔ |
| 1,80 | 3 | **invertida**, 2 por faixa na 3,20 → 0,885 m | 0,850 → 4% a menos |

**Pior que o número: ele curto-circuita a máquina que já existe.** O
`ficha_dominio.js` avalia a fórmula **uma vez por bobina candidata** e fica com
a de menor custo por peça — desenhado exatamente para o corte invertido. Com um
`2` fixo as duas bobinas dão o mesmo consumo, e a escolha desempata por **preço
por metro linear**, que é o critério errado quando as bobinas têm larguras
diferentes: o que se compra é m², e um metro de 3,20 traz 14% mais tecido que
um metro de 2,80.

> ⚠️ **E A FÓRMULA POR ÁREA NÃO É O CONSERTO.** `(altura+20) * largura /
> largura_bobina / 100` parece honesta e reparte a faixa proporcionalmente, mas
> abrindo a conta do custo o que sobra variando entre as bobinas é só o **preço
> por m²** — então ela escolhe sempre a mesma bobina, para todo SKU, e a
> comparação lado a lado vira enfeite. Pior: ela supõe que o resto da largura
> **sempre** é aproveitado por alguém, o que só vale onde o par fecha exato.

A fórmula que descreve as duas orientações, e deixa a bobina decidir de verdade:

```
min( (altura + 20) / piso(largura_bobina / (largura - 3)),     ← de pé
     (largura - 3) / piso(largura_bobina / (altura + 10)) )    ← invertida
   / 100
```

> ⚠️ **Ela diz o que É POSSÍVEL, não o que a fábrica FAZ** — e por isso ainda
> não está no sistema. Pelo `min`, a 1,20 sairia invertida a 0,585 m; a fábrica
> corta de pé a 0,850. A ficha subfaturaria 31%. **Orientação é decisão de quem
> produz, não resultado de fórmula**, e o mesmo vale para a folga. Enquanto a
> decisão não for um dado lançado, a fórmula honesta é a de pé.

**Pareamento: as sete larguras fecham exato na 2,80; na 3,20, cinco das sete.**
`1,80+1,00`, `1,60+1,20`, `1,50+1,30` e `1,40+1,40` fecham na 2,80;
`1,80+1,40`, `1,60+1,60` e `1,20+1,00+1,00` fecham na 3,20. A 1,30 e a 1,50
**nunca** fecham na 3,20 — o lugar delas é a 2,80, uma com a outra. Por isso as
duas bobinas são necessárias **pelo par, não pelo preço**.

> **Sinal na tela:** linha de tecido cuja fórmula não menciona
> `largura_bobina` aparece com tarja âmbar "não olha a bobina", e o teste ao
> vivo mostra o resultado em **cada** bobina lado a lado. Duas colunas com o
> mesmo número são a assinatura do problema.

> ⚠️ **As medidas de teste vêm do CATÁLOGO, não de uma lista fixa.** O
> `formula.js` trazia 1,00×1,00 / 1,80×1,50 / **3,00×2,50** escritas no código,
> e a última não existe: a persiana mais larga tem 1,80 e a bobina mais estreita
> tem 2,80 — 3,00 não cabe em bobina nenhuma, e não há emenda. A fórmula honesta
> do `piso` dava **divisão por zero** ali e era recusada na tela; para conseguir
> salvar, alguém escrevia o `2` fixo. É a armadilha #6 outra vez — trava que
> dispara no caso normal vira desvio. Hoje `ficha_route.js` monta as medidas a
> partir dos SKUs do modelo (a mais estreita, a mais comum, a mais larga) e o
> `formula.js` **ignora** a medida que não cabe na bobina, dizendo qual e por quê.
> Ignorar todas não aprova: um ok sem evidência mente pior que a recusa.

**Rode `node teste_ficha.js` após qualquer mudança no `formula.js`, no
`ficha_dominio.js` ou no `ficha_route.js`** — os 40 casos travam a separação
entre consumo e corte, a conta das duas bobinas SKU a SKU, as medidas de teste
e a porta única do avaliador.

### Regras que parecem bug e não são

- **Custo indefinido nunca vira zero.** Falta preço numa linha → o total é
  `null`, não a soma parcial. Zero é um custo válido e mentiroso.
- **Não há coluna `tipo` na `ficha_formula`, e é de propósito.** A tela oferece
  tipos de linha (quantidade fixa, pela largura, pela altura, pelo tecido) que
  **geram** a expressão; o que se grava continua sendo a expressão, e a tela
  reconhece a forma de volta lendo o texto. Uma coluna `tipo` seria uma segunda
  fonte de verdade sobre a mesma linha, e as duas divergiriam no dia em que
  alguém editasse a expressão à mão — que é justamente o que a tela permite.
- **Recusar uma fórmula não pode repintar a antiga.** A tela fazia
  `alert(...)` seguido de redesenho: o texto digitado sumia e voltava a fórmula
  velha, e quem editava via a recusa e uma fórmula que não era a sua. Hoje o
  erro fica na própria linha, com o que foi digitado ainda no campo.
- **A tabela da ficha é só leitura, e editar abre UM material de cada vez.**
  A primeira versão punha dez campos em duas linhas de tabela por material:
  dava para editar e não dava para ler — não se enxergava onde um material
  acabava e o outro começava. Não é preferência estética: quem não consegue
  ler a ficha não confere a ficha, e ficha que ninguém confere é a armadilha
  #6 de novo, a régua que a equipe contorna. Cada coluna carrega só o que
  explica ela — a bobina escolhida fica sob a **quantidade**, que é o que ela
  explica, e não empilhada sob o nome do material.
- **Componente de família não entra na lista de "acrescentar material".**
  Apontar `Blackout bege 3,20` direto **congela a bobina na ficha**: o
  `ficha_dominio` deixa de avaliar as candidatas e a escolha por menor custo
  por peça — a máquina inteira do corte invertido — não roda. Tecido se aponta
  pela **família**, sempre.
- **Quem recebe não vê preço.** A rota do Recebimento monta o JSON **sem** os
  campos de preço — não adianta esconder na tela e mandar pelo fio.
- **Recebimento parcial mantém o pedido aberto**, e o saldo continua contando
  como *a caminho*. Só fecha com um dos dois motivos.
- **Material devolvido não entra no estoque** e segue como *a caminho* — o
  fornecedor ainda deve.
- **Bipar código de material não conta 1.** A unidade de consumo do tubo é o
  metro; `+1` ali seria 1 metro, não 1 barra. A tela avisa e manda para o campo
  de material, onde a quantidade é digitada.
- **Zero é lançamento válido na contagem de material.** É a única forma de um
  material que acabou entrar na contagem em vez de ficar de fora dela — e ficar
  de fora é o que mantém o saldo errado no sistema.
- **Saldo de material é arredondado em 3 casas** dentro do
  `componente_dominio.js`. `3,5 + 0,2 = 3,7000000000000006` não é precisão, é
  ruído, e ele compõe: cada contagem grava o lixo da anterior. Custo médio é
  outra escala (R$ 0,0825 por parafuso é preço de verdade) e corta em 6 casas.
- **O pedido congela embalagem, fator e preço.** Mudar o preço do cadastro não
  mexe em pedido já feito.
- **Escolher fora do melhor preço exige motivo**, e vai para a auditoria.
- **A necessidade é o MAIOR dos dois gatilhos, nunca a soma**, e sempre desconta
  o que está a caminho. O mínimo existe para cobrir a venda que ainda não
  apareceu; quando ela aparece, **substitui** o mínimo em vez de somar a ele.
- **A perda de corte pertence ao gatilho 2, não ao 1.** Perda é fenômeno de
  consumo. Aplicá-la ao ponto de pedido compra *acima* do ideal — contradiz o
  nome do campo. (Estava errado até a fase 6; como `perda_pct` nasce zero em
  todos, a correção não mudou nenhum número.)
- **Venda sem ficha calculável é um buraco na lista de compras, não um zero.**
  Ela sai em `pendencias`, com o motivo, porque o total sem ela está incompleto
  e o comprador precisa saber disso. Mesma regra 4 do custo.
- **Acessório não tem medida e isso não é pendência.** `modelo.exige_medida = 0`
  dispensa largura/altura; a fórmula que precisar delas reclama sozinha, uma
  linha por vez. Antes da fase 6 o bloqueio era do SKU inteiro, e por isso todo
  acessório ficava sem ficha e sem custo para sempre.
- **Enquanto a mão de obra for zero, o número se chama "custo de material"** —
  nunca "custo do produto".

### Dívidas abertas nesta entrega

| Dívida | Detalhe |
|---|---|
| `componente` é **provisória** | O dono é `PRODUCAO-MONTAGEM.md` §6, não implementado. O que faltar entra por `ALTER`, nunca recriando |
| Não segue a forma do `ARQUITETURA-ALVO.md` | O `COMPRAS.md` §11 manda `dominio/ dados/ rotas/`. Foi construído no padrão atual do projeto — o documento não estava no repositório (hoje está em `docs/specs/ARQUITETURA-ALVO.md`) |
| Fórmula do tecido | ~~As oito medidas da planilha fecham em 6 de 8~~ — a fórmula passou a usar `largura_bobina` em 04/09/2026 (armadilha #19). O que sobra: **quando** o corte é encaixado e quando é sozinho ainda é decisão de quem produz, e a ficha guarda uma das duas |
| Medida de corte sem valor lançado | A `ficha_formula` já tem `corte_largura`/`corte_altura` (armadilha #18), mas as folgas reais — tubo, base redonda, tecido — ainda não foram preenchidas. Enquanto forem vazias a coluna "corta a" mostra traço, que é resposta e não erro |
| Mínimos são placeholder | Foram semeados com um valor padrão ("depois eu edito"). Enquanto forem, o gatilho 1 vence quase sempre e a demanda quase não aparece na lista — não é bug da fase 6, é dado a revisar |
| Modelo ACESSORIO sem ficha | Os dois kits têm venda e nenhuma linha de ficha. Ou lançam ficha, ou viram `tem_ficha=0` (revenda) com custo direto |

---

## 8. Horário de corte e despacho

Configuráveis **por dia da semana** (`config`, chaves `corte_seg`, `despacho_seg`, etc.),
porque o Mercado Livre altera o corte sem aviso — já houve quarta-feira com corte
ao meio-dia em vez de 10:30.

| Padrão | Significado |
|---|---|
| Corte 10:30 | Vendas até esse horário são entregues no mesmo dia |
| Despacho 15:00 | Limite para levar os volumes à agência |

> ⚠️ **ARMADILHA #7 — nem todo volume de um lote sai no mesmo dia, e a etiqueta
> diz qual é qual.** Cada etiqueta traz `Despachar: qua 26/ago, antes das 15:00 h`.
> No PDF de 25/08 as **14 etiquetas tinham cinco datas diferentes** — só 6 para
> o dia seguinte, as outras 8 espalhadas por três semanas.
>
> Enquanto o `parse.js` ignorava essa linha, todo volume entrava como se fosse
> de hoje e a fila "Faltam imprimir" cobrava etiqueta de venda que só vencia
> semanas depois. Mesma doença dos volumes fantasmas por outra porta: fila que
> mostra o que não é pra agora é fila que a equipe aprende a ignorar.
>
> `fila_dia.js` é o **dono único** da pergunta "isto é trabalho de hoje?", e por
> um motivo prático: a tela faz essa pergunta duas vezes por caminhos
> diferentes — a lista de pendentes e o bipe do SKU (`/api/proximo/:sku`). Com
> réguas diferentes, a lista cobraria um volume que o leitor não acha.
>
> Entram na fila: o que vence hoje, **o que já venceu** (atraso tem que gritar,
> não sumir) e **o que não tem data lida** (volume invisível é pior que volume
> cedo demais). O que vence depois aparece no painel "Pra despachar depois", que
> existe para o planejamento enxergar sem poluir o dia. O filtro por `data` (dia
> da importação) saiu: volume que entrou ontem e vence hoje é trabalho de hoje.

> **Venda futura é trabalho adiantável, não arquivo morto.** O bipe do SKU
> (`/api/proximo/:sku`) **não** filtra por prazo — quem decide é a ordem
> (`ORDEM_URGENCIA`): sem data e vencido primeiro, depois hoje, e só então o
> futuro. Assim o operador nunca adianta uma venda de setembro enquanto existe
> uma atrasada do mesmo SKU esperando, e, esgotadas as do dia, o bipe segue
> trabalhando em vez de dizer que não há nada.
>
> O que impede adiantar o que não pode é a **trava de estoque que já existia**:
> sem peça na prateleira, nada é impresso. É exatamente a regra do dono — *"só
> se tiver estoque disponível"* — sem precisar de trava nova.
>
> Quando o volume escolhido é futuro, a resposta traz `adiantado:true` e a tela
> abre um aviso azul com a data por extenso. Ele é obrigatório: uma venda de
> setembro que passe por urgente faz o operador gastar peça que amanhã pode
> faltar para quem tem prazo curto.
>
> **O ano não vem na linha** e é inferido dos dois lados da virada: `05/jan`
> lido em dezembro é do ano seguinte, `20/dez` lido em janeiro é do ano anterior.
> A janela é assimétrica (−60 / +180 dias) porque atraso de despacho é curto e
> envio programado legítimo chega a semanas.

A tela de revisão mostra o corte no aviso de status. A tela de Etiqueta de Venda
mostra contagem regressiva para o despacho, ficando **amarela** abaixo de 2 h e
**vermelha** abaixo de 1 h quando ainda há volumes pendentes.

---

## 8-B. Coleta — o caminhão do Mercado Livre vem buscar (desde 10/09/2026)

A fábrica passou a ter **duas portas de saída** para o volume do ML:

| | **Agência** | **Coleta** |
|---|---|---|
| Quem leva | a gente, no carro, até a agência | o caminhão do ML, na fábrica |
| Onde a caixa espera | no carro | no **lugar reservado** da coleta |
| Prazo | hora de despacho do `config` | só o dia — o caminhão não tem hora |
| `lote.modalidade` | `'agencia'` (ou `NULL`) | `'coleta'` |

O lançamento **não mudou**: sobe-se o PDF igual, e o sistema descobre sozinho.

### ⚠️ ARMADILHA #21 — a etiqueta diz que é coleta por AUSÊNCIA

Os dois PDFs de 09/09/2026 (47 de agência, 8 de coleta) são idênticos em
tudo: layout, rota (`XSP1 > SMG6 > EGO18`), letra do rodapé, folha de
controle, DANFE. Não há ícone nem marca gráfica. A **única** diferença é a
caixa "Despachar":

```
agência   Despachar: qua 9/set, antes das 15:45 h
coleta    Despachar: quinta 10/set
```

`parse.js` → `modalidadeDespacho()` lê isso contra os **dois formatos exatos**:
casou com o da agência é `'agencia'`, casou com o da coleta é `'coleta'`.
**Qualquer outra coisa é `'desconhecida'`, e etiqueta sem a linha é `null`** —
e os dois **retêm o volume no upload**, com `bloqueio = 'modalidade: ...'`
(o texto cru da linha vai no motivo). Se a hora quebrou para a linha de baixo
(o pdf.js faz isso), a linha seguinte é emendada antes de conferir.

> **Regra do dono (09/09/2026): qualquer modificação na etiqueta vai para
> Bloqueados, e a gestão decide.** A marca é fraca (uma hora que falta), e um
> "quase igual" que passasse como coleta mandaria pro canto do caminhão uma
> caixa que era do carro, em silêncio. Por isso o sistema **não adivinha**:
> formato que ele não conhece para em **Admin → Bloqueados**, num card
> violeta próprio, e alguém com acesso de admin escolhe **Agência** ou
> **Coleta** (`POST /api/modalidade/resolver`), por volume ou o lote inteiro.
> A decisão grava `modalidade`, guarda o motivo em `bloqueio_resolvido` com
> quem e quando, e vai para a auditoria.
>
> A decisão **não passa por cima do §6**: SKU fora do cadastro continua
> bloqueado, agora por `sku_nao_cadastrado`. E cadastrar SKU **não solta**
> volume retido por modalidade (guarda no `server.js`, como a da divergência):
> cadastro não responde por onde a caixa sai.
>
> `modalidade = NULL` só existe hoje em volume **anterior à coluna** (e no
> retido, até a decisão). Nas contas, `NULL` é agência — o que sempre existiu.
> Volumes antigos: `node backfill_modalidade.js`.
>
> Se o ML mudar a etiqueta de vez, o conserto é no `modalidadeDespacho()`,
> com o PDF novo na mão, e o caso 15 do `teste_parse.js` (que trava os
> formatos exatos e quatro variações que têm que cair em `desconhecida`) é
> atualizado junto. Até lá a operação não para: a gestão decide na tela.

**`carga.js` é o dono único de "isto é coleta?"** (`COLETA`, `AGENCIA`,
`ehColeta`, `AGUARDA_CAMINHAO`). O upload, a lista "Faltam imprimir", o bipe
do SKU, os impressos, o relógio de despacho e as duas listas do carregamento
leem dali. Duas réguas mandariam a mesma caixa pro carro numa tela e pro
canto na outra.

### O fluxo da coleta

1. **Etiqueta de Venda**: o bipe do SKU mostra a tarja violeta **"COLETA — o
   caminhão do Mercado Livre vem buscar"** *antes* de imprimir, e repete no
   "Impresso ✓". É quem cola a etiqueta que decide onde a caixa para. A
   etiqueta sai igual e o estoque baixa igual (`−1`).
   **"Faltam imprimir" são duas listas lado a lado** — Agência e Coleta —
   e `GET /api/pendentes` devolve **uma linha por SKU e por modalidade** (o
   mesmo SKU pode estar nas duas). Em cima há o filtro **Todas / Agência /
   Coleta**, salvo por aparelho (`localStorage.etq_modo`): em "Todas" o bipe
   pega a venda mais urgente do SKU como sempre; em "Coleta" ou "Agência"
   ele **só pega vendas daquela lista** (`/api/proximo/:sku?modo=`). Quando
   o SKU só tem venda na outra lista, a resposta traz `na_outra_lista` e a
   tela diz isso — "SKU não está no lote" ali seria mentira.
2. **Carregamento**: a caixa de coleta **não aparece em "Faltam carregar no
   carro"** e não conta no "No carro X de Y". Ela tem card próprio (violeta),
   **ao lado** do carro — dois lugares físicos, duas colunas; abaixo de
   900 px empilha, carro primeiro. O card da coleta fica sempre visível para
   a coluna do carro não mudar de lugar.
   O operador bipa ao levar pro lugar reservado — o mesmo `POST /api/carregar`,
   que marca `carregado` e responde `coleta:true` com **"Está indo N peças"**.
3. **Fechar coleta com o motorista** (`POST /api/coleta/fechar`): o caminhão
   do ML bipa cada caixa que leva. O operador **fotografa a tela do celular
   do motorista** com a contagem do sistema dele (o tablet abre a câmera
   direto), digita o número e fecha. **Bateu** → todas ganham `retirado_em` e
   saem do canto. **Não bateu** → nada anda: a tela lista as caixas para
   conferir uma a uma, com o motorista ali na frente. Liberar assim mesmo
   existe (o caminhão não pode ficar preso), mas grava `divergente=1` em
   `coleta_fechamento`, com quem fechou, e vai para a auditoria.

> ⚠️ **SEM A FOTO NÃO FECHA, nem com o número batendo.** Regra do dono
> (09/09/2026): *"não adianta apenas o motorista falar a quantidade — temos
> que ter prova da quantidade que ele bipou no sistema dele"*. A foto vai em
> `coleta_fechamento.foto` (arquivo em `/opt/expedicao/coletas/`, nome
> `coleta-<id>.jpeg`, gravado **dentro** da transação: disco recusou, o
> fechamento não existe). Fica **fora** de `lotes/`, que o cron apaga em 7
> dias — prova não expira junto com o PDF. Volta por
> `GET /api/coleta/foto/:id`, e a tela mostra "📷 ver a foto" em cada
> fechamento do dia. A tela reduz a foto a 1600 px em JPEG antes de mandar;
> o servidor só aceita `data:image/*` com conteúdo (foto vazia não é prova).

> **Por que a conferência é um número, e não bipe a bipe:** 50 caixas
> separadas e o motorista bipou 49 — a que faltou está no canto, no caminhão
> sem bipe, ou em lugar nenhum. Depois que o caminhão sai, ela vira
> reclamação do cliente semanas depois, sem ninguém saber por onde sumiu. O
> número na frente do motorista, **com a foto**, é a única hora em que isso
> ainda se resolve — e a única prova que sobra se não se resolver.

> **O relógio de despacho é da agência.** `/api/expedicao/status` conta em
> `pendentes` só a agência e devolve a coleta em `pendentes_coleta`. Contar a
> coleta no relógio deixaria a tela vermelha por caixa que não vai no carro.

> **`carregado_em` na coleta é a hora em que a caixa foi pro canto**, não a
> hora em que o caminhão levou — essa é `retirado_em`. Relatório que conta
> saída por `carregado_em` continua certo (é o mesmo dia); quem precisar da
> hora real da retirada lê `retirado_em`.

**Rode `node teste_carga.js` (49 casos; 24 são de coleta e os 5 últimos são a
trava do volume não embalado, §5 #27),
`node teste_parse.js` (caso 15), `node teste_divergencia.js` (os dois últimos
casos são a decisão da gestão) e `node teste_etiqueta.js` após mexer nisso.**
Volumes anteriores à coluna: `node backfill_modalidade.js` (simula) e
`--aplicar` — só mexe em quem está `NULL` e ainda na fábrica.

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

### ⚠️ ARMADILHA #28 — a tela de Acessos era o caminho mais curto para o acesso total

Fechado em 17/09/2026 (era a dívida 17 do §14). Quatro portas, todas na tela
oficial, todas deixando **rastro de ação legítima** na auditoria — porque elas
*eram* legítimas. Quem auditasse depois veria um Admin fazendo o trabalho dele.

| Porta | O que era | O que é |
|---|---|---|
| **A exceção do indelegável** | `permissoes.js` marca três chaves como `intransferivel` — `pessoas.gerenciar`, `setores.gerenciar`, `auditoria.ver`. O rótulo **nunca foi consultado em nenhum caminho de escrita**, e a tela desenhava a caixinha sem `disabled`: um Admin concedia a si mesmo o poder de mandar nos acessos | `POST .../excecao` recusa **conceder** uma intransferível. **Revogar continua livre** — tirar não escala ninguém, e recusar o caso seguro é a armadilha #6 |
| **O setor novo de nível máximo** | A guarda do `acesso.js` cobria só o setor que **já existe**. Criar um setor **novo** com nível `admin_geral` passava — e esse nível significa TODAS as permissões. Criava "Coordenação", punha-se dentro, saía com tudo | Criar setor de nível `admin_geral` é recusado; para dar acesso total, põe-se a pessoa no setor Admin Geral que já existe |
| **Trancar-se do lado de fora** | O `auth.js` não deixa bloquear nem excluir o último Admin Geral, mas a tela de Acessos tirava dele o **setor** — mesmo resultado, e a recuperação é SQL direto no banco | A trava passou a valer nos dois lugares, e a conta **é a mesma**: `ehUltimoAdminGeral` mora no `acesso.js`, ao lado de "quem é Admin Geral", e o `auth.js` chama ela |
| **A porta A: a sombra promovendo** | Ver abaixo — é a mais difícil de enxergar das quatro | A migração de `areas` virou evento de uma vez só |

> ⚠️ **A PORTA A É A ARMADILHA #13 (§19) COBRANDO O JURO.** `usuarios.areas`
> deixou de ser **entrada** e virou **sombra**: quem escreve nela é o
> `sincronizarAreas`, a partir das permissões efetivas. Só que o
> `migrarPendentes` continuou lendo `areas` como se fosse entrada — e o
> `areasParaSetores` traduz `'admin'` para o setor **Admin Geral**.
>
> A cadeia inteira, sem ninguém pedir nada: um Admin concede a alguém **sem
> setor** uma exceção qualquer de nível admin (*ver custo*, por exemplo) → o
> `sincronizarAreas` grava `areas='admin'` → na próxima vez que a ficha da
> pessoa é aberta, o `migrarPendentes` roda, vê a sombra e a põe no **Admin
> Geral**. Quem só devia ver custo sai podendo gerenciar acessos. Foi conferido
> desligando a guarda: a pessoa termina com `pessoas.gerenciar`.
>
> **A migração é um evento da Fase 1, não uma rotina.** Ela agora roda enquanto
> `config.migracao_areas_fase1` não existe e se marca depois — o primeiro boot
> com este código ainda migra quem estava pendente, e do segundo em diante
> `areas` não decide setor nenhum. Pessoa nova não depende disso: a tela de
> Acessos cria com `{nome, pin}`, sem `areas`, e quem dá os setores é o Admin.
>
> **O `acesso.js` passou a criar o `config` também**, e não é redundância: ele
> *grava* ali (o seed do `pacote.assinar`, o modo de acesso e essa marca), mas
> quem cria a tabela é o `mont_route`, que no `server.js` roda antes. Carregado
> sozinho — um script, um teste, uma ordem de `require` diferente amanhã — o
> `CREATE` não aconteceu e os `try/catch` engolem tudo em silêncio: o seed
> "roda", não grava nada, e ninguém fica sabendo. É a mesma família do §17.

### ⚠️ ARMADILHA #29 — ROTA SEM PERMISSÃO NASCE NEGADA (e o que quase veio junto)

Fechado em 17/09/2026 (era a dívida 16, e fecha a **12(c)** do §14 junto). O
`permDaRota()` terminava em `return '@logado'`: **rota nova nascia aberta** a
qualquer pessoa logada, sem erro, sem log e sem aparecer em lugar nenhum.

E a cobertura não acusava, porque era uma **lista escrita à mão**
(`TODAS_ROTAS`) com 49 linhas para **151 rotas reais** — e o contador ainda
descartava tudo que começasse com `/api/`. O boot imprimia *"cobertura de telas
OK (0 sem declarar)"*. **Verde que ninguém conferiu é pior que vermelho:** ele
afirma com autoridade uma coisa que não foi olhada. Hoje a varredura sai do
próprio Express (`coberturaDeRotas()`), então rota nova entra na conta no mesmo
minuto em que é escrita, e o boot **grita o nome dela**.

> ⚠️ **O QUE QUASE DERRUBOU A FÁBRICA INTEIRA: o arquivo da tela também passa
> pelo `decidir`.** Com sessão aberta, `/sku.js`, `/base.css` e as imagens são
> julgados como qualquer caminho — a lista `LIVRE` do `auth.js` tem só
> `/login`, `/login.html`, `/nav.js` e `/favicon.ico`. Negar por padrão sem uma
> regra para eles tiraria o **JavaScript de todas as telas**: elas abririam em
> branco, com 403 no console, para todo mundo menos o Admin Geral — e "tela em
> branco" não se parece nem de longe com "mexeram na permissão". Por isso
> existe a linha das extensões (`.js`, `.css`, imagens, fontes → `@logado`), e
> por isso **`.html` fica de fora dela**: `.html` é tela.

> ⚠️ **O DONO DE UMA LEITURA É UMA LISTA, e isso não é frouxidão.** Uma chave só
> não descreve quem lê: `/api/lote` é lido pela Etiqueta de Venda, pela tela de
> Lançar produção **e** pelo admin. Pior: as chaves de operação são de nível
> `operacao` e o setor **Admin** só recebe as de nível `admin` — declarar a
> leitura pela chave da tela **tiraria do próprio Admin** a leitura da tela
> dele. Passa quem tem **qualquer uma** das chaves da lista.

> ⚠️ **A GÊMEA `.html` HERDA A TELA, em vez de ser listada.** `/operador` exigia
> `revisao.executar` e `/operador.html` — o mesmo arquivo, servido pelo
> `express.static` — exigia só estar logado. Ninguém navega por ela (o rodapé
> usa a rota sem extensão), então fechar não tira nada de ninguém; e herdar faz
> a tela nova de amanhã já nascer com a gêmea coberta.

> ⚠️ **O ADMIN GERAL PASSA ANTES DA CHAVE, e isso ficou mais importante.** Uma
> declaração esquecida agora **nega**; se ela negasse o dono também, uma linha
> faltando trancaria quem tem que consertar. Ele passa por nível e é quem lê o
> aviso do boot.

> ⚠️ **`/sobmedida` FICA FORA DA VARREDURA, por desenho.** Aquele módulo tem
> portão próprio (`tecido/montar.js`) e o `auth.js` passa por ele **antes** do
> `decidir` — um dono só por caminho (§19). Acusá-lo aqui seria ruído
> permanente, e ruído permanente é o que faz a lista deixar de ser lida.

> ⚠️ **O `setImmediate` DO AVISO NÃO É ENFEITE.** O `acesso.js` é carregado no
> meio do `server.js`: na hora em que ele roda, o `teste_route` e o
> `/sobmedida` ainda não registraram nada. Varrer ali contaria meio sistema e
> diria "tudo declarado" sobre o que ainda não existe — o mesmo verde sem
> conferência da lista manual.

**O que mudou para quem usa:** nada para quem já tinha a permissão da tela. As
28 leituras que eram abertas a qualquer pessoa logada ganharam dono — quem
opera a tela **ou** o admin. A mais sensível delas era a **foto da coleta**
(§8-B), que é prova e estava legível por qualquer sessão.

**Rode `node teste_acesso.js` e `node teste_cobertura.js` ao mexer em
`acesso.js`, `permissoes.js`, `auth.js` ou ao criar QUALQUER rota nova** — os
104 + 10 casos cobrem as três pontas de uma permissão nova (§19, armadilha
#13), as quatro portas da #28, e travam que **nenhuma das 170 rotas registradas
hoje nasce negada**. O `teste_cobertura.js` sobe os módulos de verdade e varre
o `server.js` por texto, porque as rotas dele não são carregáveis — foi assim
que `GET /api/producao` apareceu, no boot, depois de o outro teste dizer zero.

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

**São duas fotos, não uma.** `skus.estoque`/`alvo` e, desde a contagem de
material, `componente.estoque`/`custo_medio`. Apagar as linhas de
`movimento_componente` não desfaz o saldo pela mesma razão de sempre — quem
guarda o saldo é a coluna, o movimento é só a história dela.

**Cobertura atual (11 tabelas):** `revisao`, `producao`, `montagem`, `lote`,
`lote_item`, `fila`, `devolucao`, `rejeicao`, `contagem`, `contagem_pendente` e
`movimento_componente`. (`foto_estoque` saiu na Fase 3.)

A lista fica em `TABELAS`, no topo do `teste_route.js`. Cada entrada traz a coluna
de chave primária — hoje todas usam `id`. O campo ficou genérico por causa da
`foto_estoque` (PK = `data`), removida na Fase 3. Ao acrescentar uma tabela, basta
incluí-la nessa lista: trigger, contagem, limpeza e "manter" saem dali.

> ⚠️ **`teste_route` tem que ser o ÚLTIMO `require` do `server.js`.** Ele cria
> triggers em cima de tabelas de outros módulos (`fila`, `devolucao`, `rejeicao`
> e `contagem`). Subindo antes, num banco novo essas tabelas ainda
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
| **`var` lido antes de ser atribuído** | `node --check` passa (é sintaxe válida); no navegador o `.filter` de um `undefined` estoura **no meio** da execução do `<script>` e **tudo abaixo dele deixa de existir** — a tela abre sem as listas, sem bipe e sem erro visível. Aconteceu em 23/09/2026: o `setModo` roda no carregamento e chamava um desenhista cujo cache só é atribuído 150 linhas abaixo | Função chamada no carregamento não pode supor que o cache já existe: `(cache\|\|[])`. E **abrir a tela** — nenhum teste do projeto pega isto |
| **Coluna `fr` não desce abaixo do conteúdo** | `grid-template-columns:1.1fr 1.6fr` é uma proporção que o navegador **ignora** quando uma coluna tem conteúdo largo: `fr` tem mínimo automático de `min-content`. Uma única linha `white-space:nowrap` lá dentro vira o piso da coluna inteira, e a proporção escrita no CSS nunca chega a valer — sem erro, sem aviso, e ninguém lê CSS procurando isso. Em 23/09/2026 a Etiqueta de Venda estava com 972 px de um lado e 362 do outro, com `1.1fr 1.6fr` no arquivo | `minmax(0,1fr)` quando a proporção **tem** que valer. E **medir a tela** (`getBoundingClientRect`), não ler o CSS: o número medido é o único que diz se a regra pegou |
| **`text-overflow:ellipsis` corta a tarja, não só o texto** | Ele apara o **fim da linha**, e o fim da linha é onde ficam as tarjas. Um nome de cliente comprido apagava da tela o `📦 N persianas` — o último lugar em que a caixa de várias aparece (§5). A tela fica bonita e a informação some | Onde a linha tem tarja, o texto **quebra** em vez de aparar; nowrap fica só dentro de cada tarja |
| **WAL do SQLite** | `dados.db` tem ~4 KB; os dados estão em `dados.db-wal`. `cp dados.db` produz backup **vazio** | Usar `node backup.js`, que chama `db.backup()` |
| **`pm2 restart` cacheia** | A alteração não aparece | `pm2 delete expedicao && pm2 start server.js --name expedicao` |
| **`!` no bash** | Expansão de histórico quebra heredocs e `sed` | `set +H` antes de blocos com `!` |
| **`express.json()` 100 kb** | Bloqueia upload de PDF | Já elevado para 25 mb — não reduzir |
| **pdf.js quebra números** | Pack IDs vêm com espaços no meio | Regex que rejunta dígitos (já em `parse.js`) |
| **Campo invisível no iPad** | Leitor bipa e nada acontece — iOS tira o foco de campos fora da tela | Campos de bipe devem ser **visíveis**, com `autocorrect="off"` |
| **Leitor manda Tab ou espaço** | Código chega picado ou o Enter cai no vazio | Aceitar Enter **e** Tab; limpar com `replace(/[^A-Za-z0-9]/g,'')`; processar por timeout após a última tecla |
| **`DELETE` em tabela que se auto-referencia** | Com `foreign_keys = ON`, `DELETE FROM t` (todas) **passa** — o FK imediato é conferido no **fim da instrução** —, mas `DELETE ... WHERE id=1` com a filha de pé é **recusado**. Um `DELETE` filtrado que hoje casa com tudo passa por sorte, e quebra no dia em que o filtro deixar alguém | Soltar o ponteiro antes, e **só de quem aponta para linha que vai sair** — limpar o ponteiro de quem fica apaga o vínculo em silêncio (`tecido/limpar_sobras.js`, §19) |

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

### Onde moram os planos — `docs/specs/`

Desde 17/09/2026, **toda especificação aprovada mora em `docs/specs/`**, com um
bloco de STATUS datado no topo. Antes disso elas ficavam num Projeto do Claude,
fora do repositório — e por isso Compras foi construído sem a spec de arquitetura,
e as specs ficaram um mês dizendo "nada implementado" sobre coisa em produção.

1. **Antes de construir algo que tem spec, leia a spec** (`docs/specs/README.md` tem o índice).
2. **No mesmo commit do código, atualize o STATUS da spec** — e o índice do README.
   Decisão que mudou na construção vai escrita no STATUS.
3. **Onde a spec e este arquivo divergirem, vale este arquivo.** Anote a divergência na spec.
4. **Spec implementada:** as regras que parecem bug entram aqui; a spec vai para
   `docs/arquivo/`. `docs/arquivo/` é histórico — **não use como fonte de regra**.

### Onde os dados moram — `caminhos.js` é o dono único

`caminhos.js` responde **onde ficam banco, PDFs, fotos e backups**. O padrão é
`/opt/expedicao`, e **continua sendo** — o deploy acima é `git pull && pm2
restart`, ninguém edita variável de ambiente no servidor.

| Chave | O quê | Variável |
|---|---|---|
| `BANCO` | `dados.db` | `PCP_DB` |
| `LOTES` | os PDFs do ML (o cron apaga em 7 dias) | `PCP_LOTES` |
| `COLETAS` | as fotos da conferência com o motorista (§8-B) | `PCP_COLETAS_DIR` |
| `BACKUPS` | as cópias do `backup.js` | `PCP_BACKUPS` |

`PCP_DIR` move as quatro de uma vez; a variável específica ganha da geral.

> ⚠️ **O CAMINHO ESTAVA COLADO EM 29 LUGARES, e o efeito não era feiura: o PCP
> só subia naquela pasta.** `db.js` abria `/opt/expedicao/dados.db` sem escape,
> então um clone limpo — máquina de quem desenvolve, runner de CI, segundo
> servidor, backup restaurado noutro lugar — morria no `require` com
> *"Cannot open database because the directory does not exist"*, antes de
> existir rota. Em produção nunca aparecia, porque lá a pasta existe; quem
> descobriu foi um runner de CI limpo, em 15/09/2026.

> ⚠️ **MUDAR O PADRÃO SERIA O PIOR DEFEITO POSSÍVEL.** O próximo `git pull`
> apontaria a produção para um banco **vazio**, e o sintoma não parece erro: o
> sistema sobe, as telas abrem, e o estoque inteiro "sumiu". Por isso o primeiro
> caso do `teste_caminhos.js` é justamente *"sem variável nenhuma, o caminho é o
> de sempre"*.

> **O nome das variáveis não é novo.** `PCP_DB`, `PCP_LOTES` e
> `PCP_COLETAS_DIR` já eram lidos por treze scripts e pelo `carreg_route.js` —
> o que faltava era um lugar que soubesse de todos. Inventar nome novo criaria
> duas réguas para a mesma pergunta (armadilha #12).

**Rode `node teste_caminhos.js` ao mexer no `caminhos.js`** — o último caso
varre os `.js` do projeto e **recusa `/opt/expedicao` escrito em código** fora
do `caminhos.js` e do próprio teste. Sem ele a arrumação dura até o próximo
script, porque script novo se escreve copiando o de cima.

> **O CI roda FORA de `/opt/expedicao`, e isso é a prova viva.** O job de
> segurança do `.github/workflows/testes.yml` sobe o servidor com `PCP_DIR`
> apontado para a área de trabalho do runner, então toda rodada confirma que o
> sistema abre em qualquer pasta. Antes ele fazia `sudo mkdir -p
> /opt/expedicao` — o runner fingindo ser o servidor de produção para o
> `db.js` conseguir abrir o banco. Quem continua conferindo o **padrão** é o
> primeiro caso do `teste_caminhos.js`, não o CI.

---

## 14. Dívidas técnicas conhecidas

Ordenadas por risco. Não são bugs desconhecidos — são decisões adiadas.

| # | Dívida | Risco |
|---|---|---|
| 1 | ~~Modo teste não cobre `fila`, `devolucao`, `rejeicao`, `contagem`, `foto_estoque`~~ **RESOLVIDO em 14/08/2026** — ver §11 | — |
| 1b | ~~`fila` não tem `CREATE TABLE` em lugar nenhum~~ **RESOLVIDO em 14/08/2026** — criada em `db.js` | — |
| 1d | ~~`revisao.modo` e `producao.origem`/`urgente` sem migração~~ **RESOLVIDO em 14/08/2026** — auditoria completa, ver §17 | — |
| 1c | ~~**Embalagem em teste consome linha real da `fila`**~~ **RESOLVIDO em 17/09/2026** — a fila é filtrada pelo mesmo `teste` do momento: em modo teste consome linha de teste, fora dele consome linha real (§4, armadilha #26) | — |
| 2 | **Sem HTTPS.** PINs trafegam em texto aberto | Alto se exposto à internet |
| 3 | **Revisão perdida em falha de conexão** — sem fila local de reenvio | Médio — buraco silencioso no relatório |
| 4 | `POST /api/producao` (manual) não aceita `data`, `origem` nem `urgente` | Médio — impede lançar adiantado pela tela |
| 5 | Upload não permite escolher a data das vendas | Médio — vendas de amanhã entram como hoje |
| 6 | `POST /api/revisao` retorna campos obsoletos (`estoque`, `pedido`, `feito`) | Baixo — confunde quem lê a API |
| 7 | ~~SKU `BK110X240BEGE` fora do padrão~~ **RESOLVIDO em 23/08/2026** — não há mais padrão de SKU; etiqueta e seletor leem as colunas (§7) | — |
| 8 | `/devolucao` não está no menu do rodapé (`nav.js`) | Baixo |
| 9 | Revisão e embalagem não gravam **quem** fez (só `rejeicao` grava) | Baixo — impede produtividade por pessoa |
| 10 | Sem testes automatizados na maior parte — hoje há `teste_parse.js` (24 casos), `teste_carga.js` (49), `teste_divergencia.js` (53) `teste_estoque.js` (72), `teste_contagem.js` (32), `teste_livro.js` (60), `teste_cruzamento.js` (14), `teste_etiqueta.js` (50), `teste_ficha.js` (40), `teste_ordem_dia.js` (16), `teste_acesso.js` (114), `teste_cobertura.js` (10), `teste_kit.js` (133), `teste_qr.js` (45), `teste_skus.js` (63), `teste_montagem.js` (42), `teste_carregados.js` (28), `teste_arrumar_sobmedida.js` (63) e `teste_caminhos.js` (6); o resto não tem | Médio a longo prazo |
| 11 | ~~**A investigar: o que é o `Quantidade` da folha**~~ **RESPONDIDA em 15/09/2026** — é o pacote de vários produtos do ML: uma etiqueta com mais de uma persiana. Ver §5, armadilha #23 | — |
| 12 | **NO RADAR: trazer para o PCP o que o sob medida já tem** — decisão de 03/09/2026, sem prazo. Quatro coisas, em ordem de valor: (a) tabela `parametro` com rótulo, unidade e a explicação do que o número muda, no lugar do `config` chave/valor cru; (b) migrações numeradas com tabela `migracao`, que mata a dívida do §17 de vez; ~~(c) registro de rotas em que rota sem permissão declarada nasce negada~~ **FEITO em 17/09/2026** com a dívida 16 (§10, armadilha #29): o padrão é negar e a cobertura varre o Express; (d) envelope único `{ok,dados}` / `{ok,motivo,mensagem}`, hoje cada rota responde de um jeito | Nenhum enquanto não for feito — é melhoria, não correção. Mas cada mês que passa é mais rota nova no padrão antigo |
| 13 | ~~**Carregamento aceita volume que não foi embalado**~~ **RESOLVIDO em 17/09/2026** — o bipe exige `estagio='embalado'` (a régua do `carga.js`), recusa dizendo por onde imprimir e registra na auditoria; o `GET /api/print/:id` deixou de imprimir volume `pendente`, que era a boca do buraco. Ver §5, armadilha #27. **Fica aberto**: os volumes que já saíram assim continuam com o saldo alto. `node conferir_carregados.js` conta esse passivo (só lê); a correção é contagem + Admin → Estoque, nunca os scripts do §5 | — |
| 14 | ~~**`POST /api/montagem` (a embalagem) sem proteção**~~ **RESOLVIDO em 17/09/2026** — transação nas quatro escritas, SKU conferido (404), kit conferido no servidor e recusa aparecendo na tela; `teste_montagem.js` (42 casos). Ver §4, armadilha #26. **Fica aberto**: o código do kit é conferido quando vem, não exigido — exigir espera o refresh nos tablets. "Embalar sem revisar gera estoque" **não** entrou: é regra do §4, não defeito | — |
| 15 | ~~**`POST /api/skus` zera o estoque** quando o corpo não traz `estoque`~~ **RESOLVIDO em 17/09/2026** — campo ausente preserva os quatro campos soltos, número impossível é recusado (400) em vez de clampado, e as duas escritas viraram uma transação com o `catch` vazio fora. A rota saiu para `sku_cad_route.js` e tem `teste_skus.js` (60 casos) atrás — ver §6, armadilha #25. ~~**Fica aberto**: a rota ainda muda saldo com `sku.cadastrar`~~ **FECHADO em 21/09/2026** na fase 1 do livro: o cadastro não mexe em saldo, nem com o campo presente, nem no SKU novo — e a rota diz que ignorou (§2, o livro) | — |
| 16 | ~~**Acesso: default `@logado` e cobertura mantida à mão**~~ **RESOLVIDO em 17/09/2026** — o padrão passou a ser **negar**, a cobertura varre o Express (a lista `TODAS_ROTAS` saiu) e o boot grita o nome da rota não declarada; as 28 leituras sem dono foram declaradas e as telas `.html` gêmeas herdaram a permissão da tela. Ver §10, armadilha #29 · `teste_cobertura.js` | — |
| 17 | ~~**Acesso: duas travas faltando**~~ **RESOLVIDO em 17/09/2026** — a exceção recusa conceder chave `intransferivel`, a troca de setores tem a trava do último Admin Geral (mesma conta do `auth.js`, agora no `acesso.js`), setor novo não nasce `admin_geral` e a migração de `areas` virou evento de uma vez só (a porta A, que promovia a Admin Geral em silêncio). Ver §10, armadilha #28 | — |
| 18 | **Nada acusa uma regra INERTE** — e ela tem pelo menos **duas formas**: dado que ninguém preencheu, e **rota que nenhuma tela chama** (o extrato do livro ficou um dia no ar sem botão, §2). `modelo.sob_medida` ficou três semanas sem nenhuma linha marcada: a regra do §7 estava escrita e codificada, e não pegava em ninguém — sem erro, sem log, sem sinal em tela nenhuma (§7, armadilha #30). O §18 já tem o desenho que falta aqui: a auditoria do parse reporta a **cobertura** de cada trava e fica âmbar abaixo de 100%. O equivalente para flags de cadastro não existe. Descoberto por acaso, por um script escrito para outra coisa | Médio — o modo de falhar é silencioso, e o desvio acontece fora da vista do sistema |

---

## 15. O que NÃO fazer

- ❌ Somar a medida de **corte** em custo nenhum — ela é o outro número da linha,
  e os dois nunca fecham (§7-B, armadilha #18)
- ❌ Escrever um número fixo de peças por bobina dentro da fórmula do tecido
  (`/200`) — quem decide quantas cabem é a `largura_bobina` (§7-B, armadilha #19)
- ❌ Voltar a testar fórmula contra uma lista fixa de medidas: a de 3,00 m não
  cabe em bobina nenhuma e reprovava a fórmula certa (§7-B, armadilha #19)
- ❌ Calcular a falta de estoque fora do `demanda_dominio.js` — a aba Estoque e a
  tela azul do operador têm que dizer o mesmo número (§18)
- ❌ Fazer a aprovação da contagem gravar o **número contado** como saldo: entre
  contar e aprovar a fábrica embala e imprime, e o que andou no meio some sem
  erro e sem aviso. A conta é a DIFERENÇA contra o `sistema_era` (§18, #32)
- ❌ Deixar a contagem de **peça** mexer no saldo sem gravar em `ajuste_estoque`:
  a de material sempre gravou, e a peça era a metade sem auditoria (§18, #32)
- ❌ Ler a idade da conferência da tabela `contagem`: ela é RASCUNHO, e o
  `enfileirar` a apaga — o SKU contado ontem volta a aparecer como nunca
  conferido (§18, armadilha #32)
- ❌ Trocar as duas fontes da idade por uma só, ou datá-la pela **aprovação**: a
  troca apaga a história anterior ao registro do caminho direto, e a data da
  aprovação rejuvenesce uma conferência que foi feita semanas antes (§18, #32)
- ❌ Amarrar a conferência ao rastro do ajuste: a contagem que **bateu** não gera
  linha nenhuma, e é justamente o SKU cujo saldo estava certo que apareceria
  como nunca conferido (§18, armadilha #32)
- ❌ Dar por pronta uma fase que tem tela sem ABRIR a tela: a rota do extrato
  ficou um dia no ar, testada e documentada como pronta, sem botão nenhum que
  chegasse nela (§2, e é a #30 por outra ponta)
- ❌ Escrever em `skus.estoque` fora do `estoque_dominio.js` — o saldo tinha
  SETE donos e por isso não se reconstruía; há varredura recusando (§2, o livro)
- ❌ Devolver o `MAX(0, …)` a qualquer escrita de saldo: ele apaga justamente o
  sinal de peça que saiu sem registro, que é o passivo da dívida 13 (§2)
- ❌ Misturar saldo negativo com "zerado" na aba Estoque: zerado é SKU que
  acabou, e ninguém investiga o normal (§2, o livro)
- ❌ Abrir transação dentro do `estoque_dominio`: a embalagem são quatro
  escritas e a caixa de pacote são N baixas que valem como uma (§2)
- ❌ Fazer o cadastro de SKU gravar saldo de novo — nem com o campo presente,
  nem no SKU novo: livro vazio com coluna em 5 quebra a soma na 1ª linha (§2)
- ❌ Ignorar em silêncio um campo que o chamador mandou: a rota DIZ que ignorou
  o `estoque`, senão ele acredita que gravou e descobre no inventário (§2, §6)
- ❌ Deixar a abertura do livro virar rotina: sem a marca em `config` ela roda a
  cada boot e o livro passa a dizer o dobro do saldo (§2)
- ❌ Mover a restauração da foto do modo teste para fora do domínio — exceção
  numa regra de dono único é o começo do terceiro dono (§2, §11)
- ❌ Tirar `movimento_estoque` de `TABELAS`: "apagar tudo" devolveria o saldo
  pela foto e deixaria as linhas de teste descrevendo o que não existe (§11)
- ❌ Isentar o `teste_route.js` de uma varredura por causa do prefixo: ele NÃO é
  teste, é o módulo do modo teste, e é dono de verdade da coluna (§2)
- ❌ Fazer a revisão somar estoque "porque parece que falta"
- ❌ Fazer a reimpressão baixar estoque "porque imprimiu de novo"
- ❌ Multiplicar volume por "quantidade" em qualquer lugar — uma venda é uma
  etiqueta é uma persiana (§5); já foi tentado e revertido, e há teste travando
- ❌ Fazer a leitura por pedaços (`split` em `Desenho do tecido`) voltar a rodar
  antes do tokenizer no `parse.js` — manda a peça errada pro cliente (§5)
- ❌ Criar N linhas em `lote` para uma etiqueta que leva N persianas — o grão de
  `lote` é a ETIQUETA, o de `lote_item` é a PEÇA (§5, armadilha #23)
- ❌ Deixar a caixa de pacote imprimir sem o bipe de todas as peças, ou baixar
  só uma do estoque: saíram N da prateleira (§5, armadilha #23)
- ❌ Fechar a linha do `lote_item` num bipe só quando ela tem 2 unidades — é um
  bipe por PERSIANA, e a irmã fica na prateleira (§5, armadilha #23)
- ❌ Afrouxar o guard de 700 ms do bipe na Etiqueta de Venda: com o bipe por
  unidade, a repetição do leitor vira persiana a mais (§5, #23 e §12)
- ❌ Tratar como irmão de pacote um item que traz `Venda:` ou comprador — esse é
  o caso Abraão, e herdar ali manda a peça errada pro cliente (§5, #4 e #23)
- ❌ Ler ausência como pacote quando o PDF **não fecha** (sobrou etiqueta sem
  item na folha): ali é leitura quebrada, não peça a mais (§5, armadilha #23)
- ❌ Chamar `irmaosDoPacote` sem a licença do `pdfFecha` — foi assim que o
  `backfill_pacote.js` nasceu, e lá o erro **baixa estoque** (§5, #23)
- ❌ Decidir "isto é caixa de várias persianas?" contando `itens.length` — uma
  linha com `qtd:2` é UMA linha e DUAS persianas, e foi assim que a NF 6490 saiu
  com uma de duas. Todo portão conta a soma das `qtd` (§5, #23)
- ❌ Reter o PDF inteiro porque ele não fecha: a dúvida é do volume que **não
  achou item** na folha. Um lote de 28 com 5 leituras quebradas retinha os 28,
  e escondia da Etiqueta de Venda as caixas de várias peças (§5, #23)
- ❌ Fazer o `reivindicarAcima` pegar identificador que **outro item já usou**:
  é exatamente o caso Abraão, e ali o pack de cima é do vizinho (§5, #4)
- ❌ Desempatar duas linhas livres acima do `SKU:` por proximidade ou por ordem
  — ambiguidade sem resposta não vira palpite, fica como está (§5, #4)
- ❌ Reter em Bloqueados a venda de N unidades do MESMO SKU: a folha escreveu a
  quantidade, não há o que assinar, e travar o caso normal é a #6 (§5, #23)
- ❌ Deixar a pessoa descobrir no BIPE que a caixa leva três — ali ela já montou;
  o card e a linha âmbar existem para ela saber antes da prateleira (§5, #23)
- ❌ Deixar o painel "Pra despachar depois" contar `COUNT(*)` e ler só o
  `lote.codigo`: o número mente e o segundo SKU não aparece em tela nenhuma —
  e aquele painel CONVIDA a adiantar, com o bipe que não filtra por prazo
  (§5, #23)
- ❌ Escrever uma segunda consulta de "quais caixas levam mais de uma persiana":
  ela é do `caixasDeVarias`, e a cópia que fica para trás é sempre a do
  "depois", que ninguém olha todo dia (§5, #23)
- ❌ Trocar o `?quando=` por uma rota nova, ou fazer o parâmetro ausente
  significar outra coisa: o tablet com a página em cache chama sem ele (§5, #23)
- ❌ Escrever uma segunda consulta para a linha da lista de SKU: a do dia e a do
  painel "depois" saem do mesmo `linhasDeSku`, e foi a cópia que ficou para trás
  que deixou o painel sem medida, sem cor e **sem estoque** (§5, #23)
- ❌ Escrever "✓ dá pra adiantar" no SKU com saldo: o saldo é o MESMO da fila de
  hoje, e a promessa manda gastar peça de quem tem prazo curto (§5, #23)
- ❌ Repetir a marca de modalidade numa lista que já é de uma modalidade só — a
  marca só aparece quando ela separa alguma coisa (§5, #23)
- ❌ Dividir o painel "depois" em colunas Agência e Coleta: em 23/09/2026 o
  futuro era 22 de 22 coleta, e coluna vazia todo dia vira paisagem (§5, #23)
- ❌ Perguntar "quais peças vão nesta caixa?" fora do `folha.js → pecasDaCaixa`:
  são DUAS formas (2 SKUs órfão, e 1 SKU com `Quantidade: N`), e a cópia que
  fica para trás é a do script que ninguém roda todo dia (§5, #23)
- ❌ Fazer o `backfill_pacote.js` voltar a varrer só `irmaosDoPacote`: ele
  deixava de fora a forma COMUM, e foi assim que a NF 6986 ficou invisível para
  o único reparo que existe (§5, #23)
- ❌ Descartar o PDF inteiro porque ele não fecha: a licença gateia os ÓRFÃOS,
  não a `Quantidade: N` escrita no próprio item — é a retenção em massa por
  outra porta (§5, #23)
- ❌ Escrever "gravado" numa linha de `qtd 2` no relatório do backfill: o
  sistema conhece UMA, e é por isso que o script existe (§5, #23)
- ❌ Deixar o "Já impressos" sem a tarja `📦 N persianas`: é o ÚLTIMO lugar em
  que a caixa aparece, e é dali que se reimprime (§5, #23)
- ❌ Pôr a tarja numa linha com `white-space:nowrap` e `text-overflow:ellipsis`:
  o nome comprido do cliente apaga a tarja do fim da linha — e ainda vira o
  piso da coluna inteira, porque `fr` não desce abaixo do min-content (§12)
- ❌ Escrever a instrução de embalagem diferente em cada tela: é uma frase só —
  *saco maior, as peças juntas com fita* (§5, #23)
- ❌ Deixar cadastro de SKU soltar volume retido por `pacote:` — cadastro não
  responde quantas persianas vão na caixa (§5, armadilha #23)
- ❌ Declarar chave nova em `permissoes.js` sem a linha no `permDaRota()` **e**
  sem o backfill de quem já devia tê-la: a rota fica em `@logado` ou a tela dá
  403 para todo mundo, nos dois casos sem erro e sem log (§5, armadilha #23)
- ❌ Deixar `POST /api/lote/conferir` cair no `pre('/api/lote')` → `pdf.subir`:
  o bipe das peças é da bancada da etiqueta, e sem ele ela não imprime (§5, #23)
- ❌ Tratar NF repetida como duplicidade: a nota é do **pedido**, e o cliente com
  três persianas tem três vendas e uma nota só (§5, armadilha #22)
- ❌ Deixar o mapa `danfeByNf` sem guarda: a última folha da nota vence e a
  impressão sai com a continuação no lugar do documento (§5, armadilha #22)
- ❌ Escrever uma segunda régua de "que página é esta" / "qual o número desta
  nota" — as duas são do `folha.js`, e é por elas que a impressão gravou (§5)
- ❌ Recortar a descrição do anúncio a partir de uma palavra ("Persiana"): o ML
  escreve o título com ela no fim, e o recorte leva junto a medida que a
  conferência 3 lê e a família que a 5 aprende (§5, armadilha #24)
- ❌ Comparar nome de cliente fora do `nome.js`, ou com distância de edição:
  `Marcelo`/`Marcela` estão a duas letras e são duas pessoas (§5, #10 e #22)
- ❌ Deixar o carregamento aceitar volume que não está `embalado`: a peça sai da
  fábrica sem o −1, o saldo fica alto para sempre e a venda some da conta de
  urgência — sem sinal em tela nenhuma (§5, armadilha #27)
- ❌ Voltar a imprimir a etiqueta de venda de um volume `pendente` pelo
  `GET /api/print/:id`: é o segundo caminho que punha etiqueta na mão sem baixa,
  e quem baixa a peça é o `POST /api/embalar` da bancada (§5, armadilha #27)
- ❌ Recusar uma caixa no carregamento sem dizer por onde ela tem que passar — a
  pessoa está na frente do carro com a caixa na mão (§5, armadilha #27)
- ❌ Dar por pronta uma regra que depende de flag de cadastro só porque o código
  a lê: sem linha marcada no banco ela é texto, e nada acusa isso (§7, #30)
- ❌ Marcar `sob_medida` no modelo `ROLO` para "resolver o sob medida" — são 29
  dos 30 SKUs, e a fábrica inteira sai da trava e da baixa (§7, armadilha #30)
- ❌ Apagar cadastro de SKU sem conferir as dez tabelas que citam um código: o
  volume atrás dele volta para `bloqueado` e a caixa para na expedição, dias
  depois do script (§7, armadilha #30)
- ❌ Chamar `db.backup()` sem `await`: ele é assíncrono, estoura **depois** do
  `db.close()` com o relatório de sucesso já impresso, e o backup não existe
  (§12, e o `limpar_fantasmas.js` é o modelo)
- ❌ Ler a marca das 15:00 do `conferir_carregados.js` como se valesse desde
  sempre: ela só existe a partir de 26/08/2026, e antes disso o fechamento à
  mão sai com hora de gente (§5, armadilha #27)
- ❌ Baixar para **dois** o mínimo do bloco no mesmo segundo, ou contá-lo dentro
  da janela: o primeiro esconde furo que ninguém vai procurar, o segundo faz o
  volume mudar de classificação conforme o argumento da linha de comando
  (§5, armadilha #27)
- ❌ Pôr a caixa de coleta na lista ou no contador do carro, ou somar a coleta
  no relógio de despacho — são duas portas de saída, e `carga.js` é o dono
  único de "isto é coleta?" (§8-B, armadilha #21)
- ❌ Tratar `modalidade=NULL` como coleta: sem dado é agência, que é o que
  sempre existiu (§8-B)
- ❌ Afrouxar o `modalidadeDespacho()` para "parecido com coleta" passar como
  coleta — formato que o sistema não conhece vai para Bloqueados e a gestão
  decide, por regra do dono (§8-B, armadilha #21)
- ❌ Deixar cadastro de SKU soltar volume retido por `modalidade:` — cadastro
  não responde por onde a caixa sai (§8-B)
- ❌ Fechar a coleta sem a foto da tela do motorista, ou com número diferente
  sem `confirmar` e sem registro — a foto é a prova, e a divergência é a
  única chance de achar a caixa (§8-B)
- ❌ Escrever `/opt/expedicao` em código fora do `caminhos.js` — o caminho
  colado é o que fazia o PCP só subir naquela pasta, e há teste varrendo (§13)
- ❌ Mudar o PADRÃO do `caminhos.js`: o próximo `git pull` apontaria a produção
  para um banco vazio, e o sistema subiria com o estoque "sumido" (§13)
- ❌ Deixar a troca do `kit_codigo` salvar sem `confirmar`, ou mover essa guarda
  para o `confirm()` da tela — o rolo já impresso para de bipar e ninguém sabe
  por quê (§4)
- ❌ Aceitar um SKU de persiana como `kit_codigo`: a partir dali aquela persiana
  fica **inembalável para sempre**, porque o bipe dela passa a ser lido como o
  kit — e ninguém liga isso a uma edição feita no Admin (§4, armadilha #26)
- ❌ Devolver as quatro escritas da embalagem para fora de uma transação, ou
  voltar a aceitar SKU sem cadastro ali: é a porta de ENTRADA do estoque, e o
  estado quebrado dela é peça na prateleira que não existe no sistema (§4, #26)
- ❌ Confiar no `kit_ok` que a tela manda sem conferir nada — o "⚠ FALTOU O KIT"
  precisa existir no servidor, senão é um `if` de navegador (§4, armadilha #26)
- ❌ Escrever uma segunda cópia do `kitBate`/`kitNorm`: a tela e o servidor leem
  o `public/kit_bipe.js`, e duas réguas divergem no dia da troca (§4, #26)
- ❌ Fazer a embalagem em modo teste consumir a fila REAL — era a dívida 1c, e a
  peça de verdade sumia quando os testes eram apagados (§4, armadilha #26)
- ❌ "Consertar" a embalagem para exigir que a peça esteja na fila: a fila não é
  obrigatória, é regra do §4, e é o que torna o `limpar_fila.js` seguro
- ❌ Criar um campo separado para o código de barras da etiqueta do kit: ele é
  sempre o **Código do kit** salvo, senão o impresso e o bipe divergem (§4)
- ❌ Fazer o `POST /api/config/kit/etiqueta` apagar campo que não veio no corpo
  — era a dívida 15 do §14 repetida em outra rota (§4, §6 #25)
- ❌ Deixar campo ausente valer como zero no `POST /api/skus`: um POST só com
  código e descrição apagava o saldo, sem erro e sem rastro (§6, armadilha #25)
- ❌ Clampar estoque ou alvo impossível em zero "para não recusar": clampar é
  apagar saldo em silêncio, que é o mesmo defeito por outra porta (§6, #25)
- ❌ Devolver a escrita do SKU e o destravamento dos volumes para fora de uma
  transação, ou pôr o destravamento de volta num `catch` vazio — o `ok:true`
  mentindo deixa o volume bloqueado e ninguém vai procurá-lo (§6, #25)
- ❌ Decidir "cabe na etiqueta?" contando caracteres: 16 letras estreitas cabem
  e 16 `M` não — quem responde é a medida do `kit_etiqueta.js` (§4)
- ❌ Escrever as medidas da etiqueta do kit na tela ou no ZPL: elas moram no
  `public/kit_etiqueta.js`, em milímetros, e a fase 3 sai de lá (§4)
- ❌ Dizer que a prévia prova a etiqueta impressa: ela prova o CONTEÚDO e o
  LUGAR — quem desenha o QR e as barras no papel é a impressora (§4)
- ❌ Desenhar o QR da tela com módulo em pixel quebrado: a grade sai com 2 e 3
  px alternando e o celular não lê — e o desenho continua com cara de QR (§4)
- ❌ Arredondar o módulo do QR para CIMA: ele passa do espaço reservado e come a
  folga do silêncio, que é o que o leitor precisa para achar o código (§4)
- ❌ Pedir para conferir o QR com o celular só no QR pequeno da prévia: nesse
  tamanho a câmera não fecha a leitura — é para isso que existe o ampliado (§4)
- ❌ Ler o tamanho da CAIXA do QR como o tamanho que sai da impressora: o módulo
  arredonda para ponto cheio e o resto é jogado fora — a caixa dizia 20 mm e a
  ZD220 imprimia 15,4 (§4, armadilha #31)
- ❌ Limitar o módulo do QR só pela caixa, sem o `envelope`: link curto tem
  módulo maior, e o QR cresceria empurrando o próprio silêncio para fora da
  etiqueta — QR sem silêncio não é lido (§4, armadilha #31)
- ❌ Fazer a folga da legenda voltar a ser um número fixo: ela é **4 × o
  módulo**, e o módulo muda com o comprimento do link (§4, armadilha #31)
- ❌ Estreitar o bloco das barras para dar espaço ao QR: o QR cresce por cima,
  onde não há barra — afinar a barra é mexer no que a Embalagem bipa (§4, #31)
- ❌ Montar a zona de silêncio de um caso de teste com um número de módulos
  escrito ao lado em vez do link do próprio caso — régua própria acusa o
  inocente hoje e deixa passar o culpado amanhã (§4, armadilha #31)
- ❌ Mandar tirar o `?usp=drive_link` do link "para o QR ficar melhor": com a
  caixa de 26 mm o módulo é o mesmo e o QR sai 2,5 mm MENOR. Quem responde é a
  medida, não a versão — e conselho que sobrevive à trava que o justificava
  vira conselho errado (§4)
- ❌ Aprovar texto de tela sem renderizar os casos: a frase que dizia "sai
  menor — 23,1 mm em vez de 23,1 mm" está sintaticamente perfeita, e nenhum
  teste de unidade a pega (§4)
- ❌ Conferir o QR relendo com a mesma convenção com que ele foi escrito: o
  formato invertido passou por três rodadas verdes assim (§4)
- ❌ Escrever a área de formato do QR fora da ordem do padrão — o leitor acha o
  código, não fecha o BCH e desiste sem dizer nada (§4)
- ❌ Copiar a tabela CODE128 para um segundo arquivo: `public/barras.js` serve o
  sob medida e a etiqueta do kit, e duas tabelas são duas etiquetas (§4, §19)
- ❌ Escrever medida dentro do `kit_pdf.js` ou do desenhista de SVG: os dois
  consomem a lista do `elementos()`, e a segunda régua só aparece no rolo
  impresso (§4)
- ❌ Desenhar o QR do PDF fora da grade de 8 pontos/mm: agora quem desenha o QR
  no papel somos nós, e módulo em ponto quebrado a Zebra rasteriza alternando
  4 e 5 pontos — o defeito da fase 2, no rolo (§4)
- ❌ Fazer a impressão do kit usar o texto que veio da tela em vez do salvo no
  banco: o rolo sairia diferente do que a Embalagem bipa (§4)
- ❌ Pôr `kit.imprimir` depois do `pre('/api/kit')` no `permDaRota()` — a chave
  vira enfeite e a impressão volta a pedir `kit.editar` (§4, §5 #23)
- ❌ Dar `kit.imprimir` a quem já tem `kit.editar` "para facilitar": o dono
  assinala nome por nome, e isso foi decidido em 17/09/2026 (§4)
- ❌ Recriar o upload de etiqueta do kit (`/api/kit/label`) ou qualquer segundo
  caminho de impressão: o arquivo enviado não acompanha o Código do kit, e o
  rolo impresso por ele para de bipar sem ninguém saber por quê (§4)
- ❌ Deixar conceder por exceção uma permissão marcada `intransferivel`: as três
  decidem quem tem acesso a quê, e delegar uma delas é dar o sistema inteiro
  (§10, armadilha #28). Revogar continua livre
- ❌ Permitir criar setor NOVO de nível `admin_geral` — esse nível é "todas as
  permissões", e a guarda antiga só cobria o setor que já existia (§10, #28)
- ❌ Deixar a tela de Acessos tirar o setor Admin Geral do último Admin Geral, ou
  escrever uma segunda conta de "ele é o último?" — ela mora no `acesso.js` e o
  `auth.js` chama ela (§10, armadilha #28)
- ❌ Fazer o `migrarPendentes` voltar a ler `usuarios.areas` como entrada: ela é
  SOMBRA (§19, #13), e lê-la promove a Admin Geral quem recebeu uma exceção
  qualquer de nível admin — sem ninguém pedir (§10, armadilha #28, porta A)
- ❌ Gravar em `config` a partir de um módulo sem garantir que a tabela existe: o
  `try/catch` engole, o seed "roda" e não grava nada (§10, §17)
- ❌ Fazer o `permDaRota()` voltar a terminar em `@logado`: rota nova nasceria
  aberta a qualquer pessoa logada, sem erro e sem log (§10, armadilha #29)
- ❌ Criar rota sem a linha no `permDaRota()` — ela **nasce negada**, e o
  `teste_cobertura.js` reprova. Isso é o aviso funcionando, não um estorvo (§10)
- ❌ Pôr `.html` na regra de extensões dos arquivos de apoio: `.html` é TELA, e
  a gêmea tem que herdar a permissão da rota sem extensão (§10, #29)
- ❌ Tirar a regra das extensões (`.js`, `.css`, imagens): com sessão aberta o
  arquivo da tela passa pelo `decidir`, e sem ela toda tela abre em branco com
  403 no console (§10, armadilha #29)
- ❌ Voltar a medir cobertura por lista escrita à mão, ou descartar `/api/` do
  contador — era isso que imprimia "cobertura OK" sobre 151 rotas olhando 49
  (§10, armadilha #29)
- ❌ Varrer as rotas sem `setImmediate` no boot: o `teste_route` e o
  `/sobmedida` ainda não subiram, e a conta sairia sobre meio sistema (§10)
- ❌ Declarar leitura de tela por uma chave só quando ela tem mais de um público:
  o setor Admin não tem chave de operação, e a leitura da própria tela dele
  sumiria — a declaração aceita uma LISTA (§10, armadilha #29)
- ❌ Mover `express.static` para antes do `auth`
- ❌ Usar `cp dados.db` como backup
- ❌ Editar arquivos direto no servidor
- ❌ Criar tabela de equivalências de SKU (decisão explícita do dono)
- ❌ Remover a trava de SKU não cadastrado
- ❌ Usar `.rindex('</script>')` ao inserir JS em HTML
- ❌ Commitar `.session_secret`, `dados.db`, `tecido.db`, `backups/` ou `lotes/`
- ❌ Separar o sob medida de novo em outro servidor/porta — já foi, durou um
  dia, e o beco sem saída da liberação está descrito na §19
- ❌ Acrescentar área de sob medida sem pôr a linha correspondente no
  `PERM_AREA` do `acesso.js` — o acesso some sozinho, em silêncio (§19)
- ❌ Escrever cor nova no `tecido/public/base.css` sem que ela exista nas telas
  do PCP — paleta "quase igual" é o que faz parecer outro sistema (§19)
- ❌ Guardar preço no cadastro do fornecedor para multiplicar na hora de mostrar
  — o estoque comprado antes muda de valor no dia do reajuste (§19, armadilha #15)
- ❌ Somar zero pelo rolo sem nota lançada: o total é PISO, com o `≥` na frente
- ❌ Dividir a média diária por uma janela maior que a história registrada — o
  número sai menor que a verdade, sem erro e sem aviso (§19, armadilha #16)
- ❌ Contar `ajuste` ou `encerramento` como saída de tecido: nenhum dos dois é
  corte (§19, armadilha #16)
- ❌ Somar as larguras de bobina do mesmo tecido numa conta de cobertura — não
  há emenda, são estoques diferentes (§19, armadilha #17)
- ❌ Pôr o estoque parado no numerador da cobertura do conjunto: a folga dobra
  justamente porque há dinheiro dormindo (§19, armadilha #17)
- ❌ Podar preço por LISTA de nomes: ela envelhece em uma semana e o campo novo
  viaja pelo fio até a bancada (§19, quem vê o quê)
- ❌ Começar a lista de medida da sobra no mínimo do refugo — o `sobra.criar`
  não exige esse mínimo, e o operador com a peça menor na mão escolheria o
  valor errado de propósito (§19, a medida vira lista)
- ❌ Deixar a bancada criar um cadastro **sem** marcá-lo para conferência, ou
  marcar **sem** ele aparecer na lista de Cadastros — meia decisão é pior que
  a trava que existia antes (§19, armadilha #14)
- ❌ Calcular "o que esta persiana é" fora do `tecido/dominio/persiana.js` — o
  simulador, o pedido, a ficha congelada e a etiqueta leem a MESMA conta (§19)
- ❌ Guardar medida do sob medida em metro `REAL` ou dinheiro em reais: é
  milímetro e centavo inteiros, e a conta da ficha EMPILHA (§19)
- ❌ Converter metro em milímetro por `Number(x)*1000` na tela: `1,007` vira
  1006,9999… e o servidor recusa, com razão, a medida que a pessoa acertou (§19)
- ❌ Somar consumo com corte no sob medida, ou usar um no lugar do outro — são
  os dois números da linha, e nunca fecham (§19, e a armadilha #18)
- ❌ Guardar `linha` no modelo de venda: ela já está dentro da coleção, e a
  segunda afirmação sobre o mesmo fato diverge (§19)
- ❌ Duplicar o cadastro de coleção, cor ou tecido para a venda — a coleção de
  venda APONTA para o cadastro de tecido (§19)
- ❌ Escolher o tubo por outro caminho que não a escada, ou cadastrar degrau que
  não sobe nos dois limites: a persiana pula o tubo em silêncio (§19)
- ❌ Tirar o bandô, pôr a redução de peso ou recusar a medida **sem dizer por
  quê** — a frase é parte da regra, não texto de erro (§19)
- ❌ Nomear campo de dinheiro fora do padrão `preco_*`/`valor_*` no sob medida:
  a poda corta por NOME, e um `total_centavos` vaza em silêncio (§19)
- ❌ Declarar tela em `tecido/nucleo/telas.js` sem a linha no `public/nav.js` —
  ela nasce sem botão, sem erro e sem log (§19)
- ❌ Somar a tabela A/B/C com o desconto da revenda em vez de aplicar em
  cascata: 10% + 5% não é 15%, e somados dois percentuais grandes zeram a
  venda sem ninguém notar (§19)
- ❌ Arredondar o preço da revenda em cada degrau: dois arredondamentos em
  cadeia erram um centavo sem regra, e é o centavo que a revenda confere (§19)
- ❌ Deixar a tabela ou o desconto da revenda encostarem no **subtotal
  Deccorar** — ele vai para faturamento, Compras, crédito e relatório (§19)
- ❌ Mostrar o subtotal Deccorar como **piso** quando falta o percentual da
  tabela: desconto só faz o número descer, então ali ele é um TETO (§19)
- ❌ Semear as tabelas A/B/C com zero por cento: zero é "sem desconto", que é
  decisão; em branco é "ainda não se sabe", e só ele cala a tela (§19)
- ❌ Declarar `sobmedida.vender` (ou qualquer chave de venda) como `nivel:
  'admin'` no PCP — a área `'admin'` é lida como **diretor** pelo portão do
  sob medida, e o vendedor sairia com o módulo inteiro (§19)
- ❌ Dar `revenda.editar` ou `credito.editar` ao vendedor "para facilitar": a
  tabela, o desconto e o limite são decisão de quem responde pelo dinheiro (§19)
- ❌ Tirar `custo.ver` do papel do vendedor — o simulador chegaria nele sem o
  preço, que é justamente o número que ele foi buscar (§19)
- ❌ Voltar a pedir `cadastro.ler` na tela inicial ou no `/api/eu` do sob
  medida: com três papéis ela deixou de ser a chave que todos têm, e o efeito
  é tela em branco com 403 no console (§19)
- ❌ Criar um cadastro de vendedor dentro do sob medida — são dois lugares para
  lembrar de desligar alguém, e foi por isso que o módulo perdeu o dele (§19)
- ❌ Fazer a porta de pessoas devolver lista vazia quando não estiver ligada, ou
  deixar passar mais que `id` e `nome` (§19)
- ❌ Nomear o limite de crédito sem o prefixo do padrão de poda: um
  `limite_credito_centavos` viaja pelo fio em silêncio (§19, e §15 acima)
- ❌ Contar o prazo pela APROVAÇÃO em vez do envio, ou recalcular um prazo já
  congelado com o relógio de hoje (§19)
- ❌ Fazer o pedido ENVIADO reler o catálogo ou o cadastro da revenda: o
  reajuste de terça mudaria o que foi vendido na segunda (§19, fase 3)
- ❌ Reler a ficha de um pedido APROVADO: a persiana é cortada como a etiqueta
  dela já diz, e na bancada vence a etiqueta (§19, e a §4.11 da spec)
- ❌ Deixar o tubo mudar entre o envio e a aprovação sem gravar linha: a fábrica
  corta um tubo diferente do que foi vendido, e ninguém procura depois (§19)
- ❌ Gravar preço no rascunho do orçamento: ele envelhece calado, e quem abrir
  amanhã lê o número de ontem com cara de atual (§19, fase 3)
- ❌ Numerar o rascunho, ou deixar o envio passar com `pedidoNumeroInicial` em
  branco — o plano de corte herdaria o tom de um pedido do Decorsoft (§19)
- ❌ Fazer a numeração do pedido descer quando alguém baixar o parâmetro: quem
  manda é o MAIOR entre ele e o que já foi usado (§19, e a §4.18 da spec)
- ❌ Devolver o número ao bolo quando o pedido volta a rascunho, ou apagar peça
  de pedido que já teve número — ela sai CANCELADA, com motivo (§19)
- ❌ Alterar pedido aprovado, nem pelo admin: corrige-se cancelando a peça com
  motivo e lançando outra (§19, decisão de 22/09/2026)
- ❌ Aceitar item de pedido sem a cor do tecido, ou reencontrar o `tecido_id`
  pelo nome da cor depois — a segunda régua é a que manda o rolo errado (§19)
- ❌ Travar o pedido de tecido que não está na estante: ele entra MARCADO, e o
  vendedor negocia prazo — travar é a armadilha #6 (§19, e a §4.10 da spec)
- ❌ Somar as peças de um pedido sem arredondar na peça, ou guardar um total só:
  a folha impressa deixaria de fechar com as parcelas dela (§19)
- ❌ Declarar `pedido.aprovar_qualquer` na rota de aprovar: o vendedor perderia
  a própria fila, com 403 numa tela que abre (§19, fase 3)
- ❌ Medir a fila do vendedor em dias de calendário, ou cortar o vencido em
  zero: prazo vencido é o que a lista existe para mostrar (§19)
- ❌ Imprimir a folha de um pedido em rascunho, ou tirar o higienizador de texto
  do PDF — Helvetica é WinAnsi, e o emoji derruba a geração no meio (§19)
- ❌ Mostrar `R$ 0,00` num pedido sem peça: ele não vale nada AINDA, que é outra
  afirmação — e só a tela renderizada pega isso (§19)
- ❌ Aceitar parâmetro de prazo fora da faixa (`prazoCorteHora` por extenso, dia
  da semana 7): aceito, ele muda a conta em silêncio (§19)
- ❌ Dar o código da etiqueta de produção na IMPRESSÃO em vez da aprovação: ele
  é da peça, e código novo a cada papel parte a história dela em duas (§19)
- ❌ Tirar o número de uma etiqueta e devolvê-lo ao bolo — nem no cancelamento,
  nem no backfill: número que volta é número que sai duas vezes (§19)
- ❌ Ler o contador do setor num `SELECT` e gravar num `UPDATE` separado: a
  janela entre os dois dá o mesmo código a duas aprovações (§19)
- ❌ Usar um contador só para os cinco setores: o serralheiro leria saltos de
  dezenas entre uma etiqueta e a seguinte, sem nada explicando (§19)
- ❌ Escrever a medida ACABADA na etiqueta de produção ou na lista do corte: a
  persiana de 1,000 manda cortar 0,970, e é a armadilha #18 na bancada (§19)
- ❌ Escrever só "TUBO" na etiqueta da serralheria — o nome da peça é o degrau,
  e Tubo 32 e Tubo 41 são peças diferentes, compradas e guardadas à parte (§19)
- ❌ Dar código novo na reimpressão, ou pôr o aviso do já impresso DEPOIS do
  botão: ali ele explica um maço que já saiu (§19, e a armadilha #1-B do §2)
- ❌ Escrever uma segunda cópia da tabela CODE128 no PDF da etiqueta de
  produção: o `public/barras.js` serve os três (§19, §4)
- ❌ Estreitar o código de barras para caber texto ao lado: a 38 mm o módulo
  cai a 0,23 mm e a ZD220 não resolve na etiqueta amassada (§19)
- ❌ Escrever uma fileira de escolha própria em vez da do `base.css`: os botões
  saem idênticos, sem o azul do escolhido, e o maço sai do setor errado (§19)
- ❌ Pôr numa tabela um `<td>` que só existe em algumas linhas: a tabela sai
  torta e a tarja aparece debaixo do cabeçalho de outra coluna (§19, §12)
- ❌ Escrever a chave do setor na tela da bancada em vez do nome — chave de
  banco em tela é o "— Correcao de contagem" do §2 outra vez (§19)

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

> ⚠️ **O `ALTER` guardado mora no módulo dono da tabela.** Um `ALTER` de
> `contagem_pendente` ficou no `compras_schema.js`, que roda no boot do `db.js`
> — antes de `cont_route.js` criar a tabela. Num banco **novo** a guarda não
> achava a tabela e pulava; a coluna só nascia no segundo boot. Em produção nada
> aparecia, porque lá a tabela já existia. Instalação limpa é justamente o caso
> que essa seção existe para proteger.

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

---

## 18. A aba Estoque do admin

Reformada em 01/09/2026. Antes dela a aba era três contadores e uma tabela; o
que mudou não foi a aparência, foi **de onde sai o número**.

### ⚠️ ARMADILHA #12 — duas telas diziam "a repor" e não era o mesmo número

A aba calculava `alvo − estoque`, lendo o `skus.alvo` **gravado**. A tela AZUL do
operador calcula `comprometido + alvo − estoque`, ao vivo, no `demanda_dominio`.

Faltava na conta do admin justamente o **comprometido** — a venda já feita, com
envio marcado pra frente. O admin cobrava um número e a fábrica produzia outro,
e ninguém via a diferença: as duas telas estavam certas, cada uma na sua régua.
É a mesma doença que aposentou a tela `/necessidade` no mesmo dia.

Hoje `est_route.js` (`GET /api/estoque/painel`) é a porta única da aba, e ela lê
o **mesmo** `demanda_dominio` da tela azul. O `teste_estoque.js` compara os dois
SKU a SKU — escrever uma segunda conta na tela quebra o caso 1.

**Dois defeitos vinham junto, e sumiram com a correção:**

| O que era | Por que acontecia |
|---|---|
| Alvo velho cobrado como se fosse de hoje | `skus.alvo` só muda quando alguém clica "Aplicar" no Planejamento, e o "aplicar todos" **só mexe em SKU com venda na janela**. SKU que parou de vender guardava o alvo do mês passado para sempre |
| **Sob medida em falta eterna** | A peça feita contra o pedido nunca tem estoque (§7). Com um alvo legado > 0 gravado, `alvo − estoque` dava falta todo dia. O alvo ao vivo de sob medida é **zero**, então a linha só pede produção quando há venda comprometida |

O alvo salvo não sumiu: vai em `alvo_salvo`, e quando discorda do cálculo a
célula mostra "salvo N" em âmbar, com o chip **Alvo velho** para filtrar e a
data do último "Aplicar" no rodapé. Alvo defasado que se parece com alvo de
hoje é o que faz a conta "quebrar" sem ninguém notar.

### O painel

| Bloco | De onde vem |
|---|---|
| Faixa: em estoque · cobertura · SKUs em falta · peças a produzir · entrou/saiu hoje | `demanda_dominio` + `fluxo_estoque` |
| Gráfico **entrou × saiu**, 30 dias, espelhado no eixo | `fluxo_estoque.serie()` |
| Semáforo em chips (zerado · abaixo · ok · excesso · parados · sob medida · alvo velho · nunca conferido) | filtra em memória, sem ida ao servidor |
| Tabela com cobertura em dias, último ajuste e idade do inventário por SKU | idem |
| **Últimos ajustes manuais** | `ajuste_estoque` |
| Exportar CSV (respeita o filtro) e **aplicar alvo** | navegador; `POST /api/planejamento/aplicar` |

> **A idade do inventário fica colada no saldo** porque é sobre ele: `skus.estoque`
> tem vários donos e não se reconstrói (§14), então a contagem é o único momento
> em que a coluna volta a bater com a prateleira. Acima de 30 dias vira âmbar;
> quem nunca foi contado tem chip próprio, que serve de lista de trabalho no dia
> do inventário. Contagem de **material** e contagem em **modo teste** não contam
> como conferência de peça.

### ⚠️ ARMADILHA #32 — a contagem consertava o saldo apagando o que andou no meio, e sem deixar rastro

**21/09/2026, fase 0 do pacote `ESTOQUE-LIVRO-E-CONFERENCIA.md`.** Três defeitos
na mesma rota, e os três com o mesmo modo de falhar: a contagem é o único momento
em que o saldo volta a bater com a prateleira, e ela fazia isso **escrevendo por
cima** — sem dizer quando, sem dizer quem, e por cima de trabalho que aconteceu
depois dela.

**1. A aprovação aplicava o número contado, e não a diferença.** Contar e aprovar
são dois momentos — quem conta não aprova (§18) — e entre eles a fábrica não
para: embala e imprime etiqueta.

```
saldo 10   ·   a prateleira tem 8   ·   a contagem vai pra aprovação
             ↓  (o admin demora; a bancada embala 2)
saldo 12
             ↓  aprovar
ANTES:  estoque := 8      ← as 2 embaladas somem do saldo, sem erro e sem aviso
HOJE:   estoque := 12 + (8 − 10) = 10
```

O `enfileirar` **já gravava** `contagem_pendente.sistema_era` — o saldo do momento
da contagem —, e a aprovação simplesmente não olhava para ele. A conta certa é a
**diferença que a contagem achou** (`contado − sistema_era`) aplicada sobre o
saldo de agora. É o `saldo_na_contagem` da spec, §5.4.

> **O caminho direto (`contagem.ajustar`) não mudou, e é ele que prova que isto é
> conserto e não conta nova:** ali contar e aplicar são o mesmo instante, não há
> saldo guardado, a base é o saldo de agora — e o resultado **é** o número
> contado, como sempre foi. Há caso travando os dois lados.

**2. Não sobrava rastro.** O caminho da **peça** mexia em `skus.estoque` por
`UPDATE` e não gravava linha nenhuma em `ajuste_estoque`, que é o único lugar
onde saldo mexido fora da operação deixa marca (§18). O de **material** sempre
gravou, porque passa pelo `componente_dominio` (regra 10 do §13). A contagem era
a metade sem auditoria — e é justamente ela que existe para consertar o número.
Hoje toda contagem de peça que muda o saldo grava antes, depois, delta, motivo
(`Correcao de contagem`), **quem aprovou** e, na observação, **quem contou** e o
que foi contado.

> **Contagem que bateu não inventa linha.** Delta zero não é movimento: gravar
> ali sujaria o histórico com o que não mudou. Mas ela **conta como
> conferência** — ver abaixo.

> **E material continua fora do `ajuste_estoque`.** Ele tem o livro dele. Gravar
> nos dois lugares seria a mesma história contada duas vezes, e a aba Estoque,
> que lê `ajuste_estoque` por SKU, passaria a mostrar tubo.

**3. A idade da conferência lia uma tabela que é apagada.** A coluna saía de
`contagem` — que é **rascunho**: o `enfileirar` e o `lancar` apagam a sessão
assim que a contagem fecha, e o dado passa a viver em `contagem_pendente`.
Contou, mandou pra aprovação, e o SKU voltava a aparecer como *"nunca
conferido"*. A idade é exatamente o número que diz se dá para confiar no saldo;
ela mentia **para baixo**, que é o lado seguro de cobrar conferência a mais — e
também o lado que faz a equipe parar de ler a coluna.

> ⚠️ **SÃO DUAS FONTES, E NÃO UMA TROCA.** `est_route.js` lê `contagem` **e**
> `contagem_pendente` aprovada, e fica com a mais recente. `contagem_pendente` só
> existe desde a aprovação em duas pessoas, e o **caminho direto** só passou a
> gravar lá em 21/09/2026 — trocar apagaria a história de quem foi contado antes
> disso. A idade só pode ficar mais completa, nunca menos.
>
> `aprovado=1` é a régua: contagem esperando aprovação ainda **não** acertou o
> saldo, então ela não conferiu nada. E a data é a de quando se **contou**
> (`criado_em`), nunca a da aprovação — quem olhou a prateleira olhou naquele
> dia, e uma aprovação que demora duas semanas não rejuvenesce a conferência.

> ⚠️ **O CAMINHO DIRETO PASSOU A DEIXAR REGISTRO, e essa é a metade que faltava.**
> Quem tem `contagem.ajustar` aplicava sem passar por `contagem_pendente`, então
> **metade das contagens não deixava data nenhuma**. Hoje a linha nasce lá já
> aprovada: não há segunda pessoa a esperar.

> ⚠️ **E A CONTAGEM QUE BATEU É A QUE MAIS SOME.** Ela não mexe no saldo e não
> gera linha em `ajuste_estoque` — se a idade dependesse do ajuste, o SKU cujo
> saldo estava **certo** apareceria como nunca conferido, que é exatamente o
> contrário da verdade. Por isso o registro da conferência é a linha de
> `contagem_pendente`, e não o rastro do ajuste. Há caso travando.

> ⚠️ **O TESTE ANTIGO CONCORDAVA COM O DEFEITO.** A seção 10 do
> `teste_estoque.js` semeava `contagem` na mão e lia a idade — nunca passava pelo
> fluxo que apaga essa tabela. É a lição do QR (§4) por outra porta: teste que
> monta o dado pela mesma convenção com que a tela o lê não testa nada. O caso
> novo (seção 10-B) conta pelo bipe de verdade, fecha a contagem pela rota de
> verdade e só então pergunta a idade ao painel.

> **Rode `node teste_contagem.js` e `node teste_estoque.js` ao mexer no
> `cont_route.js` ou na idade do inventário do `est_route.js`** — 32 + 62 casos.
> A idade é uma pergunta que atravessa os dois módulos: quem conta é o
> `cont_route`, quem mostra é o `est_route`, e testar cada um com a sua régua foi
> o que deixou o defeito de pé.

> ⚠️ **O botão "aplicar alvo" diz quantos ele NÃO resolve.** O "Aplicar todos" do
> Planejamento só grava em SKU **com venda na janela** — proposital: sem dado de
> venda ele zeraria o alvo de quem tem história e não vendeu no período. Então a
> tela separa `alvo_defasados` de `alvo_aplicaveis` e escreve os dois no rodapé.
> Prometer "aplicar todos" e deixar o aviso de pé depois do clique ensina a
> equipe a desconfiar da tela — que é o mesmo fim da armadilha #10.
>
> O botão existe porque a tela passou a **acusar** o alvo velho: acusar sem
> oferecer o reparo, mandando a pessoa para outra aba, é como uma trava que não
> sabe liberar (§5). Ele chama a MESMA rota do Planejamento; não há segundo
> caminho de escrita no alvo.

> **`fluxo_estoque.js` é o dono único de ENTROU e SAIU** — `montagem` (o +1 da
> embalagem) e `lote.embalado_em` (o −1 da etiqueta). O `/api/fechamento` do
> Planejamento passou a ler dele: o painel mostra o mesmo movimento em série de
> 30 dias, e um gráfico com régua própria é pior que nenhum, porque confirma com
> autoridade um número que a outra tela não usa.
>
> **Ajuste manual e contagem NÃO entram no gráfico**, de propósito: os dois
> mexem no saldo e nenhum é produção nem venda. Somados às barras, o gráfico
> deixaria de responder "quanto a fábrica fez e quanto saiu" e passaria a
> responder "quanto a coluna variou", que ninguém perguntou. O ajuste tem número
> próprio na faixa e card próprio embaixo.

> **O histórico existia e nenhuma tela lia.** `GET /api/estoque/ajustes` está de
> pé desde que o ajuste passou a exigir motivo — gravando quem, quando, de→para
> e por quê — e até 01/09/2026 nada o chamava. Metade do valor do registro
> estava desligada: o dado era gravado e ninguém conseguia ler. Hoje sai no card
> "Últimos ajustes" e no botão **histórico** de cada linha.

> **O painel NÃO entra na cadência de 4 s do admin.** O `AUTO_ADMIN` recarrega a
> tela inteira de 4 em 4 segundos; este painel calcula a demanda do catálogo
> todo. Ele só atualiza com a aba aberta, no máximo a cada 12 s, e nunca por
> cima de um ajuste aberto — a linha sumiria da mão de quem está preenchendo.

**Rode `node teste_estoque.js` após qualquer mudança no `est_route.js`, no
`fluxo_estoque.js`, no `demanda_dominio.js`, no `painel_route.js`, no
`ger_route.js` ou no `cont_route.js`** — os 72 casos travam a conta única nas
quatro telas, o sob medida, o parado, a série do gráfico, a idade do inventário
(de ponta a ponta, pelo fluxo real — armadilha #32), o gate do custo e o acordo
com o fechamento diário do Planejamento. Mexeu na contagem?
**`node teste_contagem.js` também** (32 casos).

### A TV e o gerencial entraram na mesma régua (01/09/2026)

Depois da aba, sobravam **duas telas medindo falta contra o `skus.alvo` gravado**
— quarta e quinta réguas da mesma pergunta:

| Onde | O que era | O que é |
|---|---|---|
| `painel_route.js` (a TV do chão de fábrica) | `aProduzir = pedido + alvo − estoque`, misturando as ordens do dia com a reposição, medida contra a foto | **duas** colunas: `faltaHoje` = `ordem_dia.a_produzir` (a mesma régua da tela vermelha — armadilha #20; até 08/09/2026 era `pedido − produzido`, uma terceira régua), com `atendidas` ao lado, e `precisa` = `demanda_dominio` |
| `ger_route.js` (gerencial) | `falta = alvo − estoque` dos SKUs com `alvo > 0`, sem o comprometido | `DEMANDA.aProduzir()`, os 12 maiores |

> ⚠️ **`faltaHoje` e `precisa` NÃO SE SOMAM, e é por isso que têm nomes
> próprios.** A primeira é o que sobrou das ordens lançadas hoje — o trabalho
> que está na bancada agora. A segunda é o que o estoque pede, a mesma conta da
> tela azul. Somar as duas seria inventar a sexta régua; a tela escreve isso
> embaixo da tabela, porque quem lê uma TV de longe soma o que vê.

> ⚠️ **O cache de 20 s do `painel_route` é obrigatório.** A TV recarrega de 3 em
> 3 segundos e o `calcular` percorre a planilha de vendas e o catálogo inteiro —
> sem cache, são 1.200 varreduras por hora com a TV ligada. Ele é **local da
> rota**, e não dentro do `demanda_dominio`: quem grava alvo ou decide compra
> precisa do número fresco, e um cache escondido no domínio entregaria dado
> velho para eles sem avisar.

O `aProduzir` continua na resposta como apelido de `faltaHoje`, para não quebrar
consumidor antigo da rota. Não use em tela nova.

### O dinheiro parado na prateleira (01/09/2026)

A aba passou a mostrar **quanto vale o estoque** e, no mesmo card, **quanto
disso está parado** — SKU com peça e nenhuma venda na janela. O custo por SKU
sai do `ficha_dominio` (dono único, §7-B): uma segunda soma aqui divergiria da
tela de custo no primeiro preço lançado.

> ⚠️ **REGRA 4 OUTRA VEZ: CUSTO INDEFINIDO NUNCA VIRA ZERO.** SKU sem preço de
> fornecedor não entra na soma como zero — ele é contado à parte (`sem_custo`) e
> o total aparece como **piso**, com o `≥` na frente e o aviso em âmbar. Zero
> faria o estoque parecer mais barato do que é, e ninguém saberia por quê. Na
> tabela, esse SKU mostra traço, nunca `R$ 0,00`.
>
> SKU **sem peça** também mostra traço na coluna de valor: `R$ 0,00` se lê como
> "não vale nada", que é outra afirmação. O custo por peça continua ali, porque
> esse segue verdadeiro.

> ⚠️ **QUEM NÃO TEM `custo.ver` NÃO RECEBE OS CAMPOS** — o JSON sai sem eles,
> não é a tela que esconde (regra 14 do §13: não adianta esconder na tela e
> mandar pelo fio). O CSV segue a mesma regra. O acesso vai para a auditoria,
> mas **amortecido**: no máximo uma linha por pessoa a cada 30 minutos, porque a
> aba se recarrega sozinha a cada 12 s e uma linha por refresh enterraria a
> auditoria de verdade em ruído.

> Cache de 60 s no custo, local da rota: custo só muda quando alguém lança
> preço, recebe material ou mexe na ficha — não a cada refresh.

Enquanto a mão de obra for zero, o número se chama **custo de material**
(regra 17 do §7-B), e é isso que está escrito no card.

---

## 19. A SEGUNDA OPERAÇÃO — sob medida (`/sobmedida`)

A fábrica tem **duas operações**, e até 02/09/2026 o CLAUDE.md só descrevia uma.

| | **Medida padrão** | **Sob medida** |
|---|---|---|
| O que é | Persianas prontas, vendidas pelo Mercado Livre | Corte de tecido contra o pedido do cliente |
| Onde vive | tudo que este arquivo descreve até a §18 | `tecido/`, montado em `/sobmedida` |
| Banco | `dados.db` | `tecido.db` |
| Entra pelo | mesmo PIN | mesmo PIN |

O módulo tem `README.md` próprio em `tecido/`. **Leia-o antes de mexer lá** —
ele tem regras que parecem bug e não são, como este arquivo tem as dele.

### É um módulo montado, não um segundo servidor

```js
// server.js, depois do teste_route
try{ require('./tecido/montar').montar(app); }catch(e){ /* 503 só no /sobmedida */ }
```

> ⚠️ **O TRY/CATCH NÃO É PREGUIÇA.** O módulo roda migrações no boot. Um banco
> de tecido corrompido ou um disco cheio derrubaria, sem ele, a **expedição
> inteira** junto — e a expedição é quem despacha o dia. O sob medida fora do
> ar para três pessoas é um problema; a expedição fora do ar para a fábrica
> toda é outro.

> ⚠️ **Não é preciso `npm install` dentro de `tecido/`.** As dependências
> (`better-sqlite3`, `express`) são as mesmas versões da raiz, e o Node resolve
> subindo. Uma segunda árvore de dependências é uma segunda coisa para
> atualizar e esquecer.

### ⚠️ ARMADILHA #13 — a área de acesso é SOMBRA, e sombra se apaga sozinha

A liberação do sob medida é uma **área do PCP**, marcada em Admin → Acessos.
O portão em `tecido/montar.js` lê `req.usuario.areas`.

Só que, no modelo novo de acesso (`acesso.js`), **`usuarios.areas` não é mais
editada à mão**: ela é recalculada a partir das permissões efetivas, pelo mapa
`PERM_AREA`. Uma área que não está nesse mapa é apagada no primeiro
salvamento de acesso de qualquer pessoa.

```js
// acesso.js — sem estas duas linhas, a integração falha EM SILÊNCIO
['sobmedida.cortar','sobmedida'], ['sobmedida.cadastrar','sobmedida_adm']
```

O modo de falhar é o pior possível: o admin marca o acesso, a tela confirma, e
o acesso some sozinho depois — sem erro, sem log, sem ninguém saber por quê.
Há teste travando as duas pontas (`tecido/teste/acesso.test.js`).

> ⚠️ **E A SOMBRA TEM O DEFEITO SIMÉTRICO, que custou uma escalada de acesso:
> além de sumir sozinha, ela também PROMOVIA sozinha.** O `migrarPendentes`
> continuava lendo `usuarios.areas` como se fosse entrada, e `'admin'` ali vira
> o setor **Admin Geral** — então uma exceção pequena de nível admin acabava
> dando o sistema inteiro para a pessoa. Fechado em 17/09/2026; a história está
> na §10, armadilha #28. **A regra que fica: `areas` é saída. Quem a lê para
> decidir alguma coisa está lendo o eco da própria decisão.**

**As três coisas andam juntas.** Chave em `permissoes.js`, setor em
`acesso.js` (`setoresNativos`), linha em `PERM_AREA`. Faltando qualquer uma,
não há como liberar ninguém.

### Por que a liberação não mora mais lá dentro

Na primeira versão o módulo tinha cadastro de pessoas e PIN próprios. Custou,
no primeiro dia de produção:

| Defeito | O que era |
|---|---|
| Botão não fazia nada | O `/admin` monta as telas em iframe; o login do outro sistema abria dentro do quadro |
| `ERR_CONNECTION_TIMED_OUT` | A porta 3020 não estava no `ufw` |
| **Beco sem saída** | Liberar alguém exigia estar liberado. A única conta era a do boot |

O terceiro é o que decidiu a arquitetura. **Uma tranca que não sabe liberar é
uma tranca que a equipe aprende a contornar** — é a mesma lição da §5
(Bloqueados → escolher) e da armadilha #6. E dois cadastros de gente são dois
lugares para lembrar de bloquear alguém: desligar no PCP e esquecer do outro é
o furo que nenhum log acusa.

### Design: dois contextos, e a paleta é a MESMA

O `docs/DESIGN.md` §1 manda operação em fundo **claro** e admin em **escuro**.
No sob medida isso vale por tela, declarado em `tecido/nucleo/telas.js`, e
carimbado pelo servidor num `data-contexto` no `<html>`.

> ⚠️ **A primeira versão usou uma paleta *quase* igual** — `#12161c` no lugar
> de `#1a1d23`, `#1f6feb` no lugar de `#1565c0`, e assim nas sete cores.
> Nenhuma batia. Diferente o bastante para o olho perceber, perto o bastante
> para não parecer proposital, e o efeito é a equipe sentir que entrou em
> outro sistema. Hoje os hex são **copiados** de `public/operador.html` e
> `public/index.html`. Cor nova lá só entra se entrar aqui também.

### ⚠️ ARMADILHA #14 — a bancada não espera a chefia, e a lista é obrigatória

Até 03/09/2026 largura de bobina e endereço eram cadastro de chefia. Isso não
fazia a bancada esperar: fazia a bancada **mentir**. Rolo na mão e largura fora
da lista, o que saía era o toque no botão de 2,00 para o sistema aceitar — e a
partir dali o encaixe corta por uma largura que aquele tubo não tem. Endereço
não cadastrado dava o outro desvio: rolo lançado **sem endereço**, "para
endereçar depois", e o depois não existe.

É a armadilha #6 (§7) outra vez: trava que dispara no caso normal vira desvio
que a equipe aprende a fazer, e o desvio acontece fora da vista do sistema.

A troca foi de **ordem**, não de rigor — `lançar → marcar → a chefia confere`
no lugar de `pedir → esperar → lançar`. Duas peças, e **as duas são
obrigatórias**:

| Peça | Onde | Sem ela |
|---|---|---|
| o cadastro nasce marcado (`conferir=1`, com quem criou) | `endereco.js`, `largura.js` | soltar vira soltar sem rastro |
| a lista "Conferir" no topo de Cadastros | `dominio/conferir.js` | não é "a chefia confere depois", é **ninguém confere** |

> ⚠️ **NUNCA SOLTE UM CADASTRO PARA A BANCADA SEM PÔR ELE NA LISTA.** Meia
> decisão é pior que qualquer uma das duas inteiras: a trava ao menos avisava.

**Criar** é da bancada (`endereco.criar`); **renomear e apagar** continuam da
chefia (`cadastro.editar`). A assimetria é a regra — o buraco novo na
prateleira aparece com o tubo já na mão; arrumar um nome torto espera.

### ⚠️ ARMADILHA #15 — preço no cadastro do fornecedor anda para trás

Desde 03/09/2026 o rolo sabe **de quem veio e quanto custou**. A forma óbvia
seria uma coluna de preço no cadastro do fornecedor, multiplicada na hora de
mostrar. Ela quebra em silêncio: no dia do reajuste, **todo o estoque comprado
antes muda de valor retroativamente** — o rolo pago a R$ 18 em março passa a
valer R$ 22 porque houve reajuste em setembro, e ninguém percebe, porque o
número só fica maior.

O preço mora em `rolo.preco_m2`, **congelado na compra** — a regra do
`COMPRAS.md` (*o pedido congela embalagem, fator e preço*). E **não há tabela
de preço**: o que pré-preenche a próxima entrada é o *último preço realmente
pago*, tirado das próprias entradas. Tabela mantida à mão envelhece calada.

As outras três regras vieram inteiras do PCP, e valem igual aqui:

| Regra | Onde já doeu |
|---|---|
| Custo indefinido nunca vira zero — o total sai como **piso** (`≥`) | §18, regra 4 do §7-B |
| Quem não tem `custo.ver` **não recebe os campos** no JSON | regra 14 do §13 |
| **Parado é tempo sem sair**, não idade — e lista que acusa quem trabalha ninguém lê | armadilha #10 |

`tecido/dominio/custo.js` é o **dono único de "quanto vale"**. Segunda soma em
qualquer tela divergiria no primeiro preço lançado, e as duas estariam "certas"
— cada uma na sua régua. É a armadilha #12 outra vez.

### ⚠️ ARMADILHA #16 — média cuja janela é maior que a história

O painel "O que sai" (Painel → O que sai) responde qual tecido gira mais, qual
bobina se usa mais e a média diária por cor. O defeito que ele poderia ter não
daria erro nenhum:

```
média de 12 dias de história ÷ 30 dias de janela
= um número 2,5× MENOR que a verdade, com cara de fato
```

Ninguém descobre olhando: o comprador lê "gastamos 4 m²/dia", compra para isso,
e a fábrica gasta 10. Por isso `giro.janela()` corta a janela pedida no
**primeiro consumo registrado** e a tela **escreve em âmbar** quando os dois
diferem. Média sem a janela ao lado é número que engana.

As outras três regras já eram do PCP:

| Regra | Onde já doeu |
|---|---|
| Saída é `motivo='consumo'` e só — ajuste e encerramento **não são corte** | `fluxo_estoque.js`, §18 |
| Cobertura sem consumo é `null`, nunca zero | §3 |
| A média divide por dias **corridos**, e a tela diz quantos tiveram corte | — |

`tecido/dominio/giro.js` é o **dono único de "quanto consumiu"**.

### ⚠️ ARMADILHA #17 — somar as bobinas esconde justamente a que vai faltar

O painel gerencial (Painel → Gerencial) responde quanto tem, o que gira, o que
está parado e quanto deveria ter. O grão dele é **tecido × largura de bobina**,
e não o tecido — porque aqui **não há emenda**:

```
Rolo 1% Branco · 2,00 m   →  20 m²,  ~4 dias de cobertura
Rolo 1% Branco · 3,00 m   → 270 m², ~35 dias

somados: 290 m² sobre 13 m²/dia = 22 dias  ← "tranquilo", e a de 2,00 acaba
                                              depois de amanhã
```

Todo consolidado é **soma desse grão**, nunca uma segunda consulta.

> ⚠️ **A fonte de consumo é `movimento_rolo`, e NÃO `plano.consumo_m2`.** O
> plano soma rolo **e sobra** na mesma coluna — certo para medir desperdício
> do corte, errado aqui: contaria retalho como tecido novo. Os dois números
> existem, os dois estão certos, e **eles não se reconciliam.**

Três regras vieram inteiras do PCP, e uma é nova:

| Regra | Onde já doeu |
|---|---|
| `ajuste` e `encerramento` não são consumo | §18, armadilha #16 |
| Sem consumo, cobertura e mínimo são `null` — nunca zero | §3 |
| Quem não tem `custo.ver` não recebe os campos | regra 14 do §13 |
| **A cobertura do conjunto só olha o que GIRA** | nova — ver abaixo |

> ⚠️ **A COBERTURA DO CONJUNTO NÃO PODE INCLUIR O ESTOQUE PARADO.** Ele põe
> metros no numerador e zero no denominador: numa fábrica com metade do
> estoque encalhado a cobertura **dobra**, e o número diz "folgado" justamente
> *porque* há dinheiro dormindo. Na validação real deu **237 dias contra 138**.

**O estoque mínimo não é percentual chutado no código.** Sem prazo de
fornecedor não existe ponto de pedido honesto; o que existe é *"quantos dias
quero ter na prateleira"* — `estMinDias` e `estMinSeguranca`, em `parametro`,
com a margem nascendo **zero** para não virar fato inventado.

`tecido/dominio/gerencial.js` é o dono único de **mínimo, status e faixas**. Ele
não calcula consumo nem valor: compõe o `giro.js` e o `custo.js`.

### ⚠️ O MÓDULO PASSOU A TER DOIS ASSUNTOS (22/09/2026)

Até 21/09 o `tecido/` respondia só sobre **estoque de tecido**: quanto tem,
que sobras existem, como cortar. A fase 1 da spec `SOBMEDIDA-PEDIDO-REVENDA`
acrescentou o segundo: **a venda sob medida** — o que a fábrica vende, com que
regra técnica e por quanto.

| Assunto | Tabelas | Dono único |
|---|---|---|
| estoque de tecido | `rolo`, `sobra`, `plano`, `tecido`… | `dominio/rolo.js`, `dominio/plano.js`… |
| **venda sob medida** | as `sm_*` (migração 16) | **`dominio/persiana.js`** |

`persiana.js` responde *"dada esta persiana, o que ela é"*: o degrau da escada
de tubos, os componentes com medida de corte **e** de consumo, o kit, o preço,
os avisos e as recusas. O simulador de hoje, o pedido da fase 3, a explosão da
ficha na aprovação e a etiqueta da fase 4 chamam **essa** função — uma segunda
conta em qualquer uma seria a armadilha #12 com a bancada cortando por uma
régua e o cliente cobrado pela outra.

> ⚠️ **Milímetro inteiro e centavo inteiro por dentro**, metro com três casas e
> reais por fora, e `tecido/nucleo/unidade.js` é a porta única. O resto do
> módulo trabalha em metros `REAL` e ali está certo — a bobina é medida assim.
> Aqui a conta **empilha** (o tubo tira do final, o tecido tira do tubo, a base
> soma no tecido) e o ruído de ponto flutuante compõe a cada degrau. É o
> `3,5 + 0,2 = 3,7000000000000006` do §7-B, numa escala em que ele decide corte.

> ⚠️ **A ficha tem os DOIS números por linha desde o primeiro dia** (armadilha
> #18): corte vai para a etiqueta, consumo vai para Compras e para o custo. Na
> fase 1 o consumo nasce igual ao corte e a coluna já existe — há caso travando
> que dobrar a medida de corte não muda um centavo.

> ⚠️ **A coleção de venda APONTA para o cadastro de tecido, e o modelo NÃO
> guarda linha.** A `abertura` já pendura em `linha`, então a linha já está
> dentro da coleção; guardá-la também no modelo seria a segunda afirmação sobre
> o mesmo fato, que é o defeito do `linhaSel`/`linhaForm` de 15/09/2026.

> ⚠️ **Tela nova pede a linha em `nucleo/telas.js` E em `public/nav.js`.** O
> rodapé monta `ORDEM.filter(...)`: tela declarada e liberada mas fora daquele
> mapa **não tem botão**, sem erro e sem log. É a armadilha #13 por mais uma
> porta, e a ponta que some em silêncio é sempre a última.

> ✅ **EM PRODUÇÃO E CONFERIDA NA FÁBRICA EM 22/09/2026, NAS DUAS METADES.** O
> dono fez o deploy e simulou **dez persianas reais do WhatsApp: as dez
> bateram** (tubo, cortes e kit). Lançados os preços, refez as **dez
> comparando o TOTAL** com o que foi cobrado — as dez bateram de novo, mais as
> duas contas do mínimo faturado (`1,000 × 1,000` cobra 1,5 × o preço;
> `2,000 × 1,000` cobra 2 ×).
>
> São **duas rodadas de dez, e não uma**: o corte foi conferido antes de o preço
> existir. E vale mais que os 304 casos verdes de então — teste diz que o código faz o
> que eu escrevi; só a fábrica diz que o que eu escrevi é o que ela corta e o
> que ela cobra.
>
> ⚠️ **O total do simulador continua sendo o preço DECCORAR** — e agora há um
> segundo número embaixo dele, o que a revenda paga (fase 2, abaixo). Os dois
> aparecem juntos e nunca um no lugar do outro: o de cima vai para
> faturamento, Compras, crédito e relatório; o de baixo é da revenda. Coleção
> **sem** preço continua saindo como piso (`≥`), que é a regra 4 funcionando,
> não tela quebrada.

**Detalhe inteiro no `tecido/README.md`**, seção "O catálogo de venda e o
simulador".

### ⚠️ A FASE 2 (22/09/2026) — QUEM COMPRA, E A ÁREA QUE ELE USA

A fase 1 respondeu o que a persiana **é** e quanto ela custa **na Deccorar**. A
fase 2 traz quem compra: a **revenda**, o **vendedor** que cuida dela, a
**tabela** que decide o preço dela e o **prazo**. Migração 17, mais
`dominio/revenda.js`, `dominio/prazo.js`, `nucleo/pessoas.js` e a tela
`/sobmedida/revendas`.

#### O preço da revenda sai do Deccorar em CASCATA, e nunca por cima dele

```
subtotal Deccorar          R$ 209,00       ← não se mexe
  × tabela B (−10,00%)
  × desconto da revenda (−5,00%)
a revenda paga             R$ 178,70
```

> ⚠️ **CASCATA, E NÃO SOMA** — decisão do dono em 22/09/2026. Somados, 10% + 5%
> dariam 15%; em cascata dão 14,5%, e num pedido de mil reais a diferença é de
> cinco. A soma tem um defeito pior: dois percentuais grandes zerariam a venda
> sem ninguém notar, porque a tela continuaria mostrando dinheiro.

> ⚠️ **ARREDONDA UMA VEZ, NO FIM.** Dois arredondamentos em cadeia erram um
> centavo para cima ou para baixo sem regra nenhuma — e é o tipo de centavo que
> aparece na conferência da revenda e não tem como ser explicado. A conta é
> feita em inteiro (`subtotal × centésimos × centésimos`) e só divide no fim.
> Há caso travando: reintroduzir o arredondamento por degrau reprova o
> `persiana.test.js`, e foi conferido assim.

> ⚠️ **O SUBTOTAL DECCORAR NÃO SE MEXE, e é esse o caso de teste que importa
> mais.** "Misturar o preço com markup em qualquer número da Deccorar" é o
> décimo item da §9 da spec, e a forma de isso acontecer nunca é alguém
> decidir: é o desconto entrar no subtotal por descuido e ninguém notar,
> porque o total continua parecendo dinheiro.

> ⚠️ **TABELA SEM PERCENTUAL NÃO TEM PISO — tem recusa com o nome do que
> falta.** Piso quer dizer "no mínimo isto", e desconto só faz o número
> **descer**: o subtotal Deccorar seria um **teto**. Escrever `≥ R$ 209,00` ali
> diria a coisa errada com a palavra certa, e ainda gastaria o sinal que a
> equipe aprendeu a ler como "falta preço em alguma linha". A tela escreve
> *"ainda não dá para dizer o que esta revenda paga — falta lançar: tabela B"*.

> ⚠️ **AS TRÊS TABELAS NASCEM SEM PERCENTUAL, E NÃO COM ZERO.** `NULL` é "ainda
> não se sabe"; zero é "sem desconto", que é decisão. Semeadas com zero, o
> sistema cobraria o preço cheio de todo mundo com cara de regra aplicada — e
> ninguém descobriria, porque o número só ficaria maior.

#### O prazo é conta, não promessa de memória — `dominio/prazo.js` é o dono único

```
enviado até quarta 18:00  →  pronto na quinta da SEMANA SEGUINTE
um minuto depois          →  a quinta da outra semana
entrega em dia não útil   →  empurra, e DIZ qual feriado empurrou
```

Os quatro números (dia e hora do corte, dia da entrega, semanas) são
**parâmetros**, e os feriados são **cadastro** — o corte do Mercado Livre já
mudou sem aviso no PCP (§8), e não há razão para o da revenda ser diferente.
Parâmetro fora da faixa é **recusado** (`prazoCorteHora` por extenso,
`prazoCorteDiaSemana = 7`): aceito, ele mudaria a conta em silêncio.

> ⚠️ **CONTA A HORA DO ENVIO, NUNCA A DA APROVAÇÃO.** Aprovar é tarefa da
> Deccorar, e a demora dela não pode passar para a revenda. Por isso `calcular`
> **recebe** o momento do envio em vez de olhar o relógio sozinho: na fase 3 o
> pedido guarda o prazo congelado, e recalculá-lo depois com o relógio de hoje
> daria outra data para o mesmo pedido.

> **A prévia na tela é o que torna o cadastro conferível.** Quatro parâmetros e
> uma lista de feriados não dizem nada sozinhos; a pergunta que se faz é *"um
> pedido enviado agora fica pronto quando?"*. Sem a resposta escrita ali, o
> cadastro só seria conferido pelo primeiro cliente que reclamasse.

#### O vendedor ganhou área própria, e isso fecha a dívida da fase 1

| | até a fase 1 | agora |
|---|---|---|
| área do PCP | **Sob medida — cadastros** (a da chefia) | **Sob medida — venda** |
| papel no módulo | `diretor` | `vendedor` |
| alcança | tudo: tecido, parâmetros do encaixe, descarte de sobra | simulador, catálogo de leitura, a carteira dele |
| **não** alcança | — | cadastro de tecido, parâmetros, descarte, plano, painel, editar catálogo |

> ⚠️ **A CHAVE `sobmedida.vender` É `nivel:'operacao'` NO PCP, E ISSO É TRAVA,
> NÃO CLASSIFICAÇÃO.** `sincronizarAreas` põe a área `'admin'` em quem tem
> **qualquer** chave de nível admin, e o portão do sob medida
> (`tecido/nucleo/acesso.js`) lê `'admin'` como **diretor**. Declarada como
> admin, a chave devolveria ao vendedor exatamente o módulo inteiro que ela
> veio tirar dele — sem ninguém pedir, e sem erro em tela nenhuma. É a porta A
> da armadilha #28 (§10) por uma porta nova. Caso travando no `teste_acesso.js`
> (seção 6-B), e ele confere o **nível declarado**, não só a existência da chave.
>
> ⚠️ **E A MESMA LEITURA DE `'admin'` CONTINUA VALENDO PARA AS OUTRAS 23
> CHAVES DE NÍVEL ADMIN DO PCP** — `sku.cadastrar`, `custo.ver`,
> `devolucao.baixar` e as demais. Quem tem qualquer uma delas entra no sob
> medida como **diretor**. Isso é anterior a esta fase e **não foi mexido
> aqui**: estreitar aquela leitura muda quem pode o quê e é `REGRA`, não
> conserto. Está escrito para não se descobrir por acidente.

> ⚠️ **`revenda.editar` E `credito.editar` NÃO SÃO DO VENDEDOR**, e isso é
> decisão, não esquecimento. A spec diz que a tabela é decidida pela Deccorar
> (§4.12) e que o limite é revisto de dois em dois meses (§4.13) — as duas são
> decisão de quem responde pelo dinheiro, não de quem vende. Custa isto:
> revenda nova, troca de tabela, endereço de entrega novo e limite passam pela
> chefia. **Alargar é uma linha; o contrário, não.**

> ⚠️ **`custo.ver` ESTÁ NO PAPEL DO VENDEDOR, E TEM QUE ESTAR.** A poda do
> `custo.js` corta todo campo de dinheiro de quem não a tem — e o vendedor sem
> ela abriria o simulador e veria a persiana inteira **sem o preço**, que é
> justamente o número que ele foi buscar.

> ⚠️ **NASCEU A CHAVE `modulo.entrar`, e ela é conserto de um defeito
> evitado.** A tela inicial e o `/api/eu` pediam `cadastro.ler`, *"a chave mais
> baixa que todo mundo que entra tem"*. Com o terceiro papel isso virou
> mentira: ou o vendedor abriria o módulo em branco com 403 no console, ou
> ganharia `cadastro.ler` de carona — e com ela a lista inteira de tecido,
> endereço e motivo. Tela em branco não se parece nem de longe com "mexeram na
> permissão" (§10, armadilha #29).

#### O vendedor é gente do PCP — `nucleo/pessoas.js` é a porta única

O sob medida **continua sem cadastro de gente próprio**. A revenda guarda o
`vendedor_usuario_id` do PCP e o `vendedor_nome` como **retrato** (a carteira
precisa continuar legível daqui a um ano, mesmo que a pessoa saia). A lista de
nomes chega por uma porta ligada no `server.js`, e ela **remapeia**: o que
atravessa é `id` e `nome`, e mais nada — PIN, salt e áreas não passam nem por
engano. Há caso travando.

> ⚠️ **SEM A PORTA LIGADA, RECUSA — NUNCA LISTA VAZIA.** Lista vazia em
> silêncio faria a tela afirmar que a fábrica não tem ninguém, e alguém
> passaria a tarde procurando no lugar errado. A recusa **diz onde se liga**
> (`server.js`, na chamada de `montar()`).

> ⚠️ **DOIS CADASTROS DE GENTE SÃO DOIS LUGARES PARA LEMBRAR DE DESLIGAR
> ALGUÉM.** Foi por isso que este módulo deixou de ter o dele em 02/09/2026, e
> é por isso que a fase 2 não criou um de vendedores.

#### O que a fase 2 deixou explicitamente de fora, e por quê

| Fica de fora | Por quê |
|---|---|
| **Logo da revenda** | só é usado no orçamento ao cliente final (fase 7), e guardar arquivo é outro assunto: onde mora, backup, o cron que limpa |
| **Markup** | é da revenda, para o cliente dela — fase 7, e nunca entra em número da Deccorar |
| **Crédito disponível** | `limite − boletos em aberto`, e boleto é fase 6. Mostrar "disponível = limite" seria número mentindo |
| **Pedido, aprovação, prazo negociado** | fase 3 |

> **`valor_limite_credito_centavos` começa com `valor_` de propósito.** A poda
> do `custo.js` corta por **padrão de nome**: `limite_credito_centavos` não
> casaria com `preco|valor|custo|nf|fornecedor` e viajaria pelo fio em
> silêncio — foi assim que o `resumo.valor_parado` do painel gerencial chegou à
> bancada (§15). Há caso travando os dois nomes, o certo e o errado.

**Rode `cd tecido && npm test` (405 casos) e `node teste_acesso.js` (114) ao
mexer em revenda, prazo, preço, permissão ou no `server.js`.** Os casos do
prazo saem das datas escritas na §4.9 da spec, e não da resposta que a função
deu.

### ⚠️ A FASE 3 (22/09/2026) — O PEDIDO, E A FRASE QUE GOVERNA TUDO: **CONGELADO É CONGELADO**

A fase 1 respondeu o que a persiana **é**; a 2, **quem compra**. A 3 é o que
liga os dois: o pedido. Migração 18 (sete tabelas `sm_pedido*` e o parâmetro
`pedidoNumeroInicial`), `dominio/pedido.js` (dono único do ciclo),
`dominio/pedido_pdf.js` e a tela `/sobmedida/pedidos`.

```
rascunho   se edita à vontade, e o preço lido é o de HOJE
enviado    número, preço, tabela e prazo ficam GRAVADOS
aprovado   a ficha é explodida e gravada — e nada mais muda
```

> ⚠️ **DEPOIS DO ENVIO NENHUMA LEITURA VOLTA AO CATÁLOGO**, nem ao cadastro da
> revenda. Um reajuste de terça não pode mexer no que foi vendido na segunda —
> é a armadilha #15 (preço no cadastro anda para trás) pela porta da venda. E
> depois da aprovação nem a **ficha** se relê: a persiana é cortada como a
> etiqueta dela já diz, e **na bancada vence a etiqueta**. As duas datas são
> diferentes de propósito, e estão na spec: preço congela no **envio** (§4.8),
> ficha congela na **aprovação** (§4.11).
>
> O caso que trava isso é o segundo do `pedido.test.js`: ele reajusta a coleção
> **depois** do envio e exige que o pedido continue em R$ 209,00. Fazer a
> leitura voltar a calcular ao vivo reprova três casos — foi conferido assim.

> ⚠️ **E O TUBO QUE MUDA ENTRE O ENVIO E A APROVAÇÃO DEIXA LINHA, em vez de
> silêncio.** São duas datas, então há uma janela: alguém mexe na escada com o
> pedido na fila, e a fábrica corta um tubo diferente do que foi vendido. É
> evento raro e caro — o tipo de coisa que ninguém procura depois se não
> estiver escrito. A aprovação grava em `sm_pedido_alteracao` (`degrau`, antes
> e depois), e a tela mostra no histórico.

> ⚠️ **APROVADO NÃO SE ALTERA, NEM PELO ADMIN** — decisão minha, 22/09/2026,
> registrada em `DECISOES.md`. A spec propunha *"até a primeira etiqueta
> impressa"*, e essa marca só existe na fase 4: implementá-la agora criaria uma
> regra escrita, codificada e que **não pega em ninguém** — é a dívida 18 (§14),
> a que deixou `modelo.sob_medida` três semanas inerte. O caminho é **cancelar
> a peça com motivo e lançar outra**: a peça cancelada **fica na lista**, sai da
> conta e guarda quem cancelou e por quê. Sumir em silêncio de uma lista que
> alguém imprimiu é o que faz a conferência virar discussão.

> ⚠️ **O ENVIADO VOLTA A RASCUNHO, E O NÚMERO FICA.** Reabrir apaga o bloco
> congelado (preço, tabela, prazo) e devolve o pedido à edição — mas não o
> número, que já foi dito à revenda por escrito. **Número que volta para o bolo
> é número que um dia sai duas vezes.** Pela mesma razão, `removerItem` só
> existe no rascunho que **nunca** foi enviado: depois do primeiro número, a
> peça sai cancelada, nunca apagada.

> ⚠️ **ORÇAMENTO NÃO QUEIMA NÚMERO, e "virar pedido" é um ato próprio.**
> Orçamento só simula (§4.10) — o preço dele é o de hoje, lido ao vivo a cada
> leitura. Gravar um preço no rascunho faria o orçamento **envelhecer calado**:
> a pessoa abriria amanhã e leria o número de ontem com cara de atual. O número
> nasce no envio, e o envio **recusa** quem ainda é orçamento.

> ⚠️ **SEM `pedidoNumeroInicial` LANÇADO, O ENVIO É RECUSADO — e isso é a
> decisão, não uma falta.** O parâmetro nasce **em branco** (tipo texto: `''` é
> "ainda não se sabe", e zero seria um número válido e mentiroso). O plano de
> corte agrupa o **tom único** pelo TEXTO do pedido e olha para trás
> (`cortesAnteriores`, em `plano.js`): um 4272 novo colado num 4272 antigo do
> Decorsoft herdaria o histórico de tom de outra casa, e a persiana sairia de um
> rolo escolhido para outro cliente (§4.18). A recusa **diz onde se lança**.
>
> E a numeração **nunca desce**: quem manda é o maior entre o parâmetro e o que
> já foi usado. Baixar o parâmetro por engano não pode fazer o número voltar por
> cima de pedido que existe. Há caso travando.

> ⚠️ **A COR DO TECIDO É OBRIGATÓRIA NO PEDIDO, e opcional no simulador.** Lá
> ela só escreve o nome na frase; aqui ela decide **qual rolo sai da
> prateleira**, e não se corta sem saber a cor. O `tecido_id` é resolvido pelo
> `persiana.js` — que passou a devolvê-lo — e **gravado no lançamento**:
> reencontrá-lo depois pelo nome da cor seria a segunda régua da armadilha #12,
> e a que erra é a que manda o rolo errado.
>
> A lista de cores tem porta própria (`GET /api/sm/colecoes/:id/cores`,
> `catalogo.ler`), e só sai cor que **tem item de tecido cadastrado**. Mandar o
> vendedor a `/api/cadastros` daria a ele a lista inteira de tecido, endereço e
> motivo para responder uma pergunta de três palavras — ele não tem
> `cadastro.ler`, e a tela abriria o seletor vazio com 403 no console, que não
> se parece com "falta permissão" (§10, armadilha #29).

> ⚠️ **"SEM TECIDO" É SINAL, NUNCA TRAVA** (§4.10). O pedido de um tecido que
> não está na estante entra normalmente, marcado, e o vendedor negocia prazo
> maior. Travar aqui seria a armadilha #6: a venda existe, e quem é recusado
> vende por fora. E o sinal **não é a resposta do plano de corte** — a pergunta
> aqui é grossa ("há bobina deste tecido, larga o bastante?"); quem decide entre
> rolo e sobra é o plano.

> ⚠️ **O TOTAL É A SOMA DAS PEÇAS QUE CONTINUAM DE PÉ; a coluna guarda o que o
> ENVIO prometeu.** Os dois aparecem lado a lado quando divergem — a mesma forma
> do prazo prometido × atual. Um número só faria a peça cancelada sumir da lista
> e continuar no total, ou o contrário: o total baixar sem nada dizer que a
> revenda recebeu outro por escrito.
>
> E o arredondamento mora na **peça**: cada persiana já sai arredondada uma vez
> (§4.1), e é o valor dela que a revenda vê linha a linha no PDF. Somar os
> arredondados é o único jeito de o total da folha fechar com as parcelas
> impressas nela.

> ⚠️ **O SUBTOTAL DECCORAR CONTINUA INTOCADO**, no pedido como no simulador: o
> de cima vai para faturamento, Compras, crédito e relatório; o de baixo é o que
> a revenda paga. Os dois juntos, nunca um no lugar do outro.

> ⚠️ **AS LINHAS DE PREÇO TÊM TABELA PRÓPRIA (`sm_pedido_item_preco`), e essa
> foi a mudança no caminho.** O plano dizia seis tabelas; são sete. Guardar só o
> total faria a conferência da revenda virar *"confie no número"* — e é
> justamente essa conferência que acha o erro de digitação da medida **antes**
> de a peça ser cortada.

> ⚠️ **RASCUNHO NÃO VIRA PAPEL.** `GET /api/pedidos/:id/pdf` recusa o que não
> foi enviado: no rascunho o preço ainda é o de hoje, e impresso ele vira um
> compromisso que o sistema não assumiu. E o texto do PDF passa por um
> higienizador: Helvetica escreve em **WinAnsi**, e a seta ou o emoji que alguém
> colou do WhatsApp na observação fazem o `pdf-lib` estourar **no meio da
> geração**, com a folha pela metade e sem dizer por quê. Vira `?`, e a folha
> sai. Há caso travando — tirar o higienizador reprova.

> ⚠️ **`pedido.aprovar` E `pedido.aprovar_qualquer` SÃO DUAS CHAVES.** A
> primeira é *"aprovo o que é da minha carteira"* (§4.12); a segunda é *"aprovo
> a de qualquer um"*, e existe para a fila não parar numa semana de férias. Uma
> chave só significaria escolher entre travar a fábrica e deixar qualquer
> vendedor aprovar a revenda do colega. **A rota de aprovar pede a chave
> estreita** — declarar a larga nela tiraria do vendedor exatamente a fila que
> ele existe para trabalhar, e o efeito seria 403 numa tela que abre.
>
> `pedido.cancelar` **não está no vendedor**: cancelar desfaz o que a fábrica já
> viu. Ele lança, envia, aprova a carteira dele e negocia prazo.

> **A fila mostra DIAS DE FÁBRICA, não dias de calendário.** Três dias no papel
> com um feriado e um fim de semana no meio são **zero** dias de trabalho, e é
> essa a diferença entre cobrar a produção hoje ou na semana que vem. Quem conta
> é o `prazo.diasUteis` — e **negativo fica negativo**: prazo vencido é
> justamente o que a lista existe para mostrar, e zerar seria o `MAX(0, …)` do
> saldo (§2) pela porta do prazo.

> ⚠️ **PEDIDO SEM PEÇA NÃO VALE R$ 0,00 — ele não vale NADA AINDA.** Zero se lê
> como "de graça". É a regra 4 na tela, e só apareceu **renderizando a tela**:
> nenhum teste de unidade pega um total que está sintaticamente perfeito.

> ✅ **CONFERIDA EM PRODUÇÃO EM 23/09/2026, COM A FOLHA NA MÃO.** O dono
> lançou o número do Decorsoft e rodou o ciclo inteiro numa revenda de verdade
> — orçamento, envio, aprovação e PDF. Saiu o **pedido 5001**, com duas
> persianas e duas coleções de preços diferentes na mesma folha, e as contas
> foram refeitas **por fora do sistema**, contra o papel: `4,620 m²` subindo
> para o Tubo 41 com redução de peso automática cobrada, `1,000 × 1,000`
> cobrando o mínimo faturado de `1,500 m²`, a cascata da tabela B dando
> `530,29 + 251,75 = 782,04` — a soma das peças fechando com as parcelas
> impressas —, o prazo de quarta 13:31 caindo na quinta 01/10 e a peça de
> tecido fora da estante **entrando marcada**, sem travar.
>
> ⚠️ **E ELA NÃO PROVA O CADASTRO.** Que R$ 110,00 e R$ 140,00 sejam os preços
> certos daquelas coleções é decisão de quem lançou; a folha prova o ciclo e a
> aritmética. A prova que falta — e que fecha a fase — é a **semana em paralelo
> ao Decorsoft**, pedido a pedido. Está escrito assim de propósito: o §10 chama
> verde sem conferência de pior que vermelho, e meia prova escrita como prova
> inteira fecha a pergunta para sempre.

> ⚠️ **A ORDEM DOS `DELETE` DO PEDIDO É A DOS PONTEIROS**, e `sm_pedido_alteracao`
> aponta para o **item** (a troca de degrau e a peça cancelada guardam qual peça
> era). Ele sai antes dele, e não junto dos outros registros, que só apontam para
> o pedido. Com `foreign_keys = ON` o `DELETE` sem filtro só passa quando ninguém
> mais aponta (§12) — foi assim que a limpeza do teste reprovou na primeira
> rodada.

**Rode `cd tecido && npm test` (405 casos) ao mexer em pedido, preço, prazo ou
no catálogo** — 29 casos são do pedido e saem das seções 4.8 a 4.18 da spec, e
3 do acesso (`acesso_operador.test.js`). Mexeu em permissão? **`node
teste_acesso.js` (114) e `node teste_cobertura.js` (10) também.**

### ⚠️ A FASE 4-A (23/09/2026) — A ETIQUETA DE PRODUÇÃO, E O CÓDIGO QUE NASCE COM A PEÇA

A fase 3 congela o pedido; a 4-A o entrega à fábrica. Migração 19 (`sm_setor`,
quatro colunas em `sm_pedido_componente` e `sm_etiqueta_impressao`),
`dominio/etiqueta_producao.js`, `dominio/etiqueta_producao_pdf.js`, a tela
`/sobmedida/producao` e o `backfill_etiquetas.js`.

```
aprovar  →  cada componente que gera etiqueta ganha SER-000123 / COL-000045 / MON / REV / EMB
            (na MESMA transação da ficha congelada)
imprimir →  marca, registra quem imprimiu, e a segunda vez sai com o MESMO código
```

> ⚠️ **O CÓDIGO É DA PEÇA, NÃO DO PAPEL — e essa é a frase inteira da fase.**
> Ele nasce na **aprovação**, junto com a ficha, e não na impressão. Código
> novo a cada papel partiria a história da peça em duas e o tempo do setor
> nunca fecharia; código reaproveitado sairia um dia em duas peças, e aí a
> bancada bipa a peça errada com a etiqueta certa. `atribuirCodigos` é
> **idempotente** (só olha quem tem etiqueta e não tem código), e é por isso
> que o backfill pode ser o **mesmo caminho** da aprovação em vez de uma
> segunda régua.

> ⚠️ **O CONTADOR SOBE NUM `UPDATE ... RETURNING`, e não num `SELECT` seguido
> de `UPDATE`.** Ler e escrever em dois passos abre uma janela entre eles, e
> duas aprovações na mesma janela levam o mesmo número. Duas etiquetas iguais
> em duas peças é exatamente o que a fase 5 (o bipe) não tem como desfazer. O
> índice `UNIQUE` sobre `codigo_etiqueta` é a segunda tranca, não a primeira.

> ⚠️ **O NÚMERO NUNCA VOLTA AO BOLO**, nem quando a peça é cancelada, nem
> quando o código é reatribuído pelo backfill. É a mesma regra do número do
> pedido (fase 3): número que volta é número que um dia sai duas vezes.

> ⚠️ **CADA SETOR TEM O SEU CONTADOR, E ISSO É O DESENHO.** `SER-000001` e
> `COL-000001` convivem, porque a serralheria e a coleção são duas filas
> físicas diferentes e cada uma conta a sua. Um contador só faria o
> serralheiro ler saltos de dezenas entre uma etiqueta e a seguinte, sem nada
> explicando — e número com buraco é o que faz alguém achar que perdeu papel.

> ⚠️ **O QUE VAI ESCRITO É A MEDIDA DE CORTE, NUNCA A ACABADA.** A persiana de
> `1,000 × 1,000` manda a serralheria cortar `0,970` e a coleção cortar
> `0,965 × 1,200`. É a armadilha #18 (§7-B) na bancada: cortar pela medida de
> consumo faz a peça não entrar. A tela do corte escreve isso com todas as
> letras — *"estas são as medidas de CORTE do tecido, não as acabadas"* —,
> porque a lista sozinha tem cara de lista de pedidos.

> ⚠️ **NO TUBO, O NOME DA PEÇA É O DEGRAU.** Sai `TUBO 32 · CORTAR 0,970`, não
> `TUBO`. Tubo 32 e Tubo 41 são peças diferentes na serralheria — diâmetro
> diferente, comprados separados, guardados em lugares diferentes. Escrever só
> "TUBO" mandaria o serralheiro conferir na tela qual é, e a etiqueta existe
> justamente para ele não precisar.

> ⚠️ **REIMPRIMIR SAI COM O MESMO CÓDIGO, e a tela avisa ANTES do clique.** É a
> armadilha #1-B do §2 pela porta da produção: o papel repetido não cria peça
> nova, como a etiqueta de venda reimpressa não baixa estoque de novo. O que a
> reimpressão grava é `reimpressoes` e uma linha em `sm_etiqueta_impressao` —
> história, não peça. **O aviso vem antes do botão**: depois do clique ele
> viraria explicação de um maço que já saiu, e o risco real é o rolo antigo
> continuar na bancada com etiquetas iguais às do novo. Por isso a frase manda
> jogar o anterior fora.

> ⚠️ **A COLUNA DE CADA SETOR MOSTRA "FALTA DE TOTAL", não só o total.** Verde
> quer dizer que já saiu tudo daquele setor; azul, que falta. É o número que
> impede o maço sair duas vezes, e é a mesma ideia do `faltaHoje` do §18: quem
> lê a tela de longe precisa ver o que falta, não o que existe.

> ⚠️ **SÓ SAI ETIQUETA DE PEDIDO APROVADO, E SÓ COM CÓDIGO.** O enviado ainda
> espera o vendedor, e a recusa diz isso. Componente sem código é ou peça que
> não gera etiqueta (os kits), ou pedido aprovado **antes** desta fase — e esse
> é o `backfill_etiquetas.js`, que roda pelo mesmo `atribuirCodigos`, faz
> backup por `await db.backup()` e é idempotente. O pedido 5001, aprovado em
> produção na manhã do dia 23, é exatamente esse caso: sem o backfill ele
> ficaria para sempre sem etiqueta, invisível para a fábrica.

> ⚠️ **SÃO 6 ETIQUETAS NA PERSIANA SIMPLES E 7 COM ADICIONAL — não 8.** A ficha
> tem oito componentes com `gera_etiqueta=1`, e eu contei os oito no plano
> desta fase. Estava errado: **bandô e barra nunca convivem**, e nenhum dos
> dois entra quando `adicional='nenhum'`. O pedido 5001 conferiu o número
> sozinho — 13 etiquetas para duas peças, 6 na lisa e 7 na de bandô. A regra
> aprovada (uma etiqueta por componente que gera etiqueta) não mudou; o que
> estava errado era a minha conta, e ela ficou escrita aqui porque número de
> plano vira expectativa de quem confere o maço.

> ⚠️ **A FILEIRA DE ESCOLHA DO SETOR É A DO `base.css`, E A PRIMEIRA VERSÃO
> TINHA A DELA.** Os cinco botões saíam **idênticos**, sem o azul do escolhido
> e sem o alvo de toque de tablet — só uma linha de texto ao lado dizia qual
> era o setor. É o mecanismo da cor dos três modos da Revisão (§3): ela não é
> decoração, é o que impede imprimir meia hora de maço no setor errado. **Só
> apareceu abrindo a tela**, e nenhum teste do projeto pegaria: o `aria-pressed`
> estava lá, certinho, e sem regra de CSS por trás não pintava nada.

> ⚠️ **E MAIS TRÊS COISAS SÓ APARECERAM NO PRIMEIRO RENDER** — a mesma lição do
> *"23,1 mm em vez de 23,1 mm"* do §4, três vezes no mesmo dia:
> - a tarja **"sem tecido"** era uma coluna **sem cabeçalho**, e só existia na
>   linha que a tinha: as outras ficavam com uma célula a menos e a tabela saía
>   torta, com a tarja pendurada debaixo do cabeçalho de outro setor. Hoje ela
>   mora na célula do pedido, que é de quem ela fala;
> - *"**1 destes pedidos já tiveram** etiquetas"* — o aviso não concordava com o
>   caso de um pedido, que é o normal;
> - o histórico escrevia a **chave** do setor (`5 etiqueta(s) de serralheria`)
>   em vez do nome. Chave de banco na tela da bancada é o *"— Correcao de
>   contagem"* do §2 outra vez.

> **O corte veio junto, e é o que fecha a metade do tecido.** `POST
> /api/producao/para-cortar` devolve as peças dos pedidos escolhidos já em
> **medida de corte**, agrupadas **por tecido** — `plano.calcular` recebe um
> tecido por plano, porque não há emenda e bobina de cor diferente é outro
> estoque. Era exatamente isto que o leitor da etiqueta do Decorsoft já fazia
> (`etiqueta_corte.js`); agora o dado vem do próprio sistema, e o `pedido` que
> vai para o tom único é o número do pedido — que a fase 3 já garantiu estar
> acima do Decorsoft (§4.18).

> ⚠️ **`etiqueta_producao.imprimir` NÃO É `etiqueta_producao.ler`.** Ler é a
> lista, e o vendedor tem: ele precisa saber se a peça dele já foi para a
> bancada. Imprimir é a chave do cortador — quem está com o rolo na
> impressora. É o mesmo arranjo do `kit.imprimir` × `kit.editar` do §4.

> ⚠️ **O DESENHO DO PAPEL MORA NUM ARQUIVO SÓ**, e o CODE128 é o **mesmo**
> `public/barras.js` do PCP e do sob medida — `etiqueta_pdf.js` passou a
> exportar o `desenharBarras` para o novo consumir. A primeira versão tinha uma
> "cópia de emergência" da tabela lá dentro: é a segunda régua do §15 escrita à
> mão, e duas tabelas CODE128 são duas etiquetas no dia em que uma mudar.

> ⚠️ **O CÓDIGO DE BARRAS OCUPA A LARGURA INTEIRA DA ETIQUETA, e isso custou um
> redesenho.** A primeira versão punha o código numa coluna de 38 mm ao lado do
> texto, e o módulo saía em **0,23 mm** — abaixo do que a ZD220 resolve numa
> etiqueta amassada. Hoje ele é uma faixa de 66 mm no rodapé, com o código e o
> setor escritos à direita. **Ainda não foi conferido no papel:** a régua final
> de código de barras é o leitor bipando (§4), e isso depende do rolo impresso.

**Rode `cd tecido && npm test` (405 casos) ao mexer em etiqueta de produção,
aprovação ou no plano vindo do pedido** — 16 casos são da etiqueta e travam o
código na aprovação, a idempotência, a reimpressão com o mesmo código, a medida
de corte no papel e a página de 100 × 35 mm (lida pelo `PDFDocument`, não por
regex — pdf-lib comprime os objetos e a contagem por `/Contents` dava zero com
o teste dizendo "passou"). Mexeu em permissão? **`node teste_acesso.js` (114) e
`node teste_cobertura.js` (10) também.** E **abra a tela**: quatro dos defeitos
desta fase não têm teste que os pegue.

### Três regras do sob medida que valem citar aqui

**Cada nível guarda um rolo só.** Regra do dono, 15/09/2026: `Haste A · Andar 1
· Nível 1` é um buraco, e no buraco cabe **um** tubo de tecido novo. O andar
tem quantos níveis a prateleira tiver — guardar mais material é criar mais
nível. O buraco se esvazia **sozinho**, por dois caminhos e só esses dois: o
tubo mudou de lugar (Mover) ou o material acabou (Rolo acabou, que encerra) —
rolo encerrado não ocupa. **A sobra não tem essa trava**: retalho dobrado é
achado pela etiqueta, não pelo endereço. O que já estava duplicado antes da
regra não é recusado; vira checagem no painel gerencial, pelo mesmo motivo de
sempre — trava que dispara no caso normal vira desvio (armadilha #6). Detalhe
no `tecido/README.md`.

**Não há emenda.** Peça mais larga que toda bobina do estoque não sai — e por
isso a recusa vira número de compra, não recado: o plano devolve `falta_bobina`
com quantas peças, de que largura, e qual a maior que existe hoje. Sem isso a
venda parada morre numa linha de texto e quem compra tecido nunca fica sabendo.

**Não há ourela.** Confirmado em 03/09/2026. Se um dia existir, o caminho é
cadastrar a largura *útil* do rolo — não há desconto automático a fazer.

### Teste obrigatório

```bash
cd tecido && npm test          # 405 casos
```

E o teste de segurança da §10, agora incluindo os caminhos novos:

```bash
for r in / /admin /operador /setor /sobmedida /sobmedida/corte \
         /sobmedida/cadastros /sobmedida/telas/corte.html /api/skus /sobmedida/api/eu; do
  printf "%-30s " "$r"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010$r
done
```

Telas `302`, API `401`, `/login` `200`. E `/sobmedida/telas/corte.html` tem que
dar **403 mesmo para o diretor logado** — se der `200`, o `express.static` do
módulo furou o portão, que é a armadilha #3 por outra porta.

