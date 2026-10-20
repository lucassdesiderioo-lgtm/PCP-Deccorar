# História — estoque, revisão e embalagem

> **Isto é história, não regra.** A regra vigente de cada assunto está em
> [`docs/regras/estoque.md`](../regras/estoque.md), em cartões curtos com o teste
> que a trava. Aqui está o PORQUÊ: como cada regra nasceu, o defeito que a
> provocou, as datas e as conferências na fábrica.
>
> O texto abaixo saiu do `CLAUDE.md` em 20/10/2026 **sem nenhuma alteração** —
> as seções §2, §4 e §18 inteiras, e três trechos da §3. As referências do tipo
> "§5" ou "armadilha #23" apontam para o `CLAUDE.md`. Quando um cartão mudar,
> a história nova entra **no fim** desta página, com data; o que está escrito
> não se reescreve.

---

<!-- Do CLAUDE.md §2 — o fluxo e o livro de movimentos -->

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
>
> **Há teste travando desde 20/10/2026:** `node teste_revisao.js` (24 casos). Para
> ele existir, a rota saiu do `server.js` para o `revisao_route.js`, sem mudar uma
> linha e com o `require` no mesmo lugar. Reintroduzir o `+1` reprova 5 casos.

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

<!-- Do CLAUDE.md §3 — os três modos da tela de Revisão (início da seção) -->

## 3. Os três modos da tela de Revisão

A tela `/operador` abre com uma escolha obrigatória entre três frentes de trabalho.
A cor do cabeçalho muda conforme o modo — isso **não é decoração**, é o mecanismo
que impede o operador de revisar meia hora no modo errado.

| Modo | Cor | O que é | Origem dos dados |
|---|---|---|---|
| **PEDIDOS DE HOJE** | 🔴 vermelho | Vendas sem estoque — cliente esperando | `GET /api/revisao/dia` |
| **PRODUÇÃO PRA ESTOQUE** | 🔵 azul | Necessidade calculada ao vivo (`comprometido + alvo − estoque`) — Fase 2 | `GET /api/revisao/producao` (+ `/api/revisao/adiantar`) |
| **DEVOLUÇÕES** | 🟡 âmbar | Peças que voltaram do ML | navega para `/devolucao` |

---

<!-- Do CLAUDE.md §3 — a ordem da tela azul e a regra da exceção -->

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

<!-- Do CLAUDE.md §4 — revisão, embalagem e a etiqueta do kit -->

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

<!-- Do CLAUDE.md §18 — a aba Estoque, a conferência e o ajuste -->

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
> `cont_route.js` ou na idade do inventário do `est_route.js`** — 36 + 72 casos.
> A idade é uma pergunta que atravessa os dois módulos: quem conta é o
> `cont_route`, quem mostra é o `est_route`, e testar cada um com a sua régua foi
> o que deixou o defeito de pé.
>
> ⚠️ **Desde 26/09/2026 a peça não se conta mais pelo `cont_route`** (bloco logo
> abaixo). O que esta armadilha descreve continua valendo para o **material** e
> para a **fila antiga de peça** que já estava pendente no deploy — ela é drenada
> pela tela antiga, pela regra antiga, porque não tem outro caminho para sair.

### ⚠️ A CONFERÊNCIA EM TRÊS PAPÉIS — ninguém aprova o próprio trabalho (26/09/2026)

**Fase 2 da spec `ESTOQUE-LIVRO-E-CONFERENCIA.md`.** A contagem de **peça** saiu da
aba Contagem do admin e virou um fluxo de três papéis:

```
PLANEJAR (abre a conferência do dia) ─▶ CONTAR CEGO (tablet, /inventario)
   bateu ──────────▶ CONFIRMADO, sozinho, sem movimento
   diferente ─▶ RECONTAR CEGO (outra pessoa) ─┬─ achou a MESMA diferença ─▶ APROVAR
                                               └─ outra ─▶ 3ª contagem (3ª pessoa) ─▶ APROVAR
APROVAR (quem não contou) ─▶ movimento `inventario` = a diferença, sobre o saldo de agora
```

`inventario_dominio.js` é o **dono único** do ciclo; `inventario_route.js` é a
porta; `outraPessoa()` mora no `estoque_dominio.js` e responde *"esta pessoa já
mexeu neste item?"* para a recontagem, para a aprovação e, na fase 3, para o
ajuste manual. A contagem de **material** continua na aba Contagem, como era.

> ⚠️ **QUEM CONTA NUNCA RECEBE O SALDO, E NÃO É A TELA QUE ESCONDE.** A lista, o
> bipe e o "terminei" não trazem `estoque`, `saldo` nem a contagem anterior — o
> campo não viaja (regra 14 do §13), e há caso varrendo o JSON inteiro atrás
> deles. Nem o "terminei" diz se bateu: dizer *"não bateu"* a quem conta é
> convidar a recontar de cabeça. Quem sabe a resposta conta até chegar nela, e a
> conferência vira confirmação — era o que a tela antiga fazia.
>
> **E ISSO NÃO É CEGUEIRA CONTRA O ADMIN:** quem tem a aba Estoque vê o saldo lá.
> A regra é das rotas de contar; quem planeja e aprova vê os números.

> ⚠️ **NINGUÉM APROVA O PRÓPRIO TRABALHO, E ISSO VALE PARA O ADMIN GERAL.** A
> pergunta não é *"tem a chave?"* — o Admin Geral tem todas por nível (§10) — e sim
> *"esta pessoa contou ou recontou este item?"*. Compara pelo id, e pelo nome
> normalizado quando falta id; **vazio nunca é igual a vazio** (a guarda do "sem
> segunda pessoa", §8-B), e quem pergunta sem nome e sem id não é ninguém.
>
> **O APROVADOR ÚNICO ESPERA** — decisão do dono, 26/09/2026 (§6.4 da spec). Num
> dia de uma pessoa só, a divergência fica em `aprovar` até outra pessoa chegar. A
> trava segura só a **correção** do saldo, nunca a operação; aprovar sozinho "com
> motivo" seria a mesma regra com uma porta dos fundos, e a porta dos fundos é a
> que se usa no dia corrido. **Não crie a exceção.**

> ⚠️ **O QUE AS CONTAGENS COMPARAM É A DIFERENÇA, NÃO O NÚMERO CONTADO.** Cada
> contagem guarda o saldo do momento em que terminou (`saldo_na_contagem`,
> `saldo2`, `saldo3`). Entre a 1ª e a recontagem a bancada embala e a Etiqueta de
> Venda imprime: a prateleira e o saldo andam juntos. Com 10 no sistema e 8 na
> prateleira, embalar 2 e imprimir 1 leva a 11 e 9 — a recontagem que acha **9**
> concorda com a 1ª, porque as duas acharam **−2**. Comparar o número cru (9 ≠ 8)
> mandaria para a terceira contagem todo SKU com trabalho legítimo no meio. Sem
> nada no meio, é exatamente a regra da spec.
>
> **A 3ª decide pelo acordo:** vale a diferença em que duas das três concordam. Se
> o acordo é **zero**, o sistema estava certo e quem errou foi a 1ª contagem —
> confirma sem movimento. Sem acordo, vai para a aprovação com a da 3ª, e a tela
> diz em âmbar que as três não concordam.

> ⚠️ **APROVAR APLICA A DIFERENÇA SOBRE O SALDO DE AGORA** — a armadilha #32
> outra vez, agora de nascença. A aprovação grava no livro (`inventario`,
> `referencia inventario:<id>`, `usuario_nome` = quem contou, `aprovado_por` =
> quem aprovou) e também em `ajuste_estoque`, que é o que o botão "histórico" da
> aba Estoque lê. Motivo é obrigatório, da lista `motivo_estoque` (Admin →
> Cadastros), e "Outro" exige observação. A fila mostra o que mexeu no saldo desde
> a 1ª contagem — e que **continua valendo**.

> ⚠️ **REJEITAR NÃO APAGA.** O item fica `rejeitado`, com motivo, e nasce um item
> novo **a contar do zero** no mesmo ciclo, apontando para o rejeitado
> (`anterior_id`). A spec dizia "recontar"; quem rejeita está dizendo que não
> confia nas contagens, e uma recontagem compararia de novo com a 1ª.

> **Regras de bancada que parecem detalhe e não são:**
> - **uma pessoa por vez no mesmo SKU.** Duas contando a mesma prateleira
>   somariam num número só, e ninguém saberia. A recusa diz quem está contando;
> - **terminar sem bipe nenhum é contagem ZERO** — é assim que "não tem nenhuma"
>   entra, como no material;
> - **SKU fora do plano entra** na conferência aberta, marcado. A peça está na
>   prateleira; recusar seria mandar a pessoa ignorar o que ela está vendo. **Sob
>   medida é recusado**: não tem estoque para conferir (§7);
> - **o que se conta é só a peça EMBALADA, com etiqueta de SKU e SEM etiqueta de
>   venda** — em letra grande no topo da tela. Sem essa regra a contagem "acha"
>   peça a mais em todo SKU com caixa esperando o carro;
> - **o guard de 700 ms** do bipe está na tela, pelo mesmo motivo do §5: aqui a
>   leitura repetida contaria uma peça a mais;
> - **encerrar** tira como `nao_contado` o que ninguém contou; o que já achou
>   diferença continua até ser decidido — fechar ali seria esquecer uma peça que
>   falta. O ciclo fecha sozinho quando nada mais anda nele;
> - **a sugestão do dia** põe o nunca conferido em cima, depois dias sem
>   conferência × giro, e não repete o que foi conferido hoje nem o que está num
>   item aberto.

> ⚠️ **A IDADE DA CONFERÊNCIA MUDOU DE CASA, E GANHOU UMA TERCEIRA FONTE.**
> `inventario_dominio.conferencias()` é o dono único; a aba Estoque e a sugestão
> do ciclo leem dela. Valem o item `confirmado` ou `aprovado`, datado pela **1ª**
> contagem. `contagem` e `contagem_pendente` continuam como história de antes do
> deploy, **cada fonte no seu try**: tabela que não existe num banco não pode
> apagar a idade que as outras sabem. A spec punha isto na fase 4; sem ele, a
> idade congelaria no dia do deploy.

> ⚠️ **AS TRÊS PONTAS DAS CHAVES NOVAS** (#13): `contagem.recontar` (operação —
> se fosse admin, todo operador do estoque viraria admin do PCP), `contagem.planejar`
> e `contagem.aprovar` (admin, sensível); as linhas no `permDaRota()`; e o
> backfill de uma vez só (`config.seed_inventario`, seção 3-D do `acesso.js`):
> quem tinha `contagem.ajustar` passa a aprovar e planejar, quem tinha
> `contagem.contar` passa a recontar, exceção concedida vai junto. **Terminar**
> aceita as duas chaves na rota e o handler confere a da rodada. A tela
> `/inventario` tem área própria (`inventario`) só para ficar na lista protegida
> do `auth.js` (#3) e no fallback — quem decide é a chave.

> ⚠️ **A CONTAGEM ANTIGA DE PEÇA RECUSA E DIZ PARA ONDE IR.** `/api/contagem/bipe`
> de SKU, e `ajustar`/`lancar` com SKU no corpo, respondem 409 `use_inventario` e
> **não gravam nada** — nem a parte de material do mesmo corpo, senão a pessoa
> acharia que a contagem inteira entrou. O "lançar (soma)" de peça deixou de
> existir: peça entra no estoque pela embalagem, e o que sobra na prateleira sem
> registro é diferença de conferência, com motivo. `contagem.ajustar` continua
> valendo só para material e para drenar a fila antiga; ela sai do cadastro na
> fase 3, com o ajuste manual em duas pessoas.

> ⚠️ **MODO TESTE:** `inventario_ciclo` e `inventario_item` entraram em
> `TABELAS`. Sem elas, "apagar tudo" apagaria o movimento do livro e deixaria o
> item `aprovado` de pé, e a idade contaria um inventário que o saldo já não tem.

**Rode `node teste_inventario.js` (80 casos) ao mexer no `inventario_dominio.js`,
no `inventario_route.js`, no `outraPessoa` ou na tela `/inventario`.** Nove
defeitos foram reintroduzidos um a um: a lista trazendo o saldo (reprova 2), o bipe
devolvendo o saldo (1), bateu sem confirmar sozinho (3), `outraPessoa` frouxa (24),
a aprovação sem perguntar pessoa — o Admin Geral dispensado (14), aprovar gravando
o contado como saldo (3), comparar o número em vez da diferença (13), rejeitar
apagando (4) e aprovar sem motivo (3). Mexeu nas chaves? **`node teste_acesso.js`
(242, a seção 6-F é esta) e `node teste_cobertura.js` (10).**

> ⚠️ **AINDA NÃO FOI CONFERIDA NA FÁBRICA, e deploy não é conferência.** A rodada
> foi num navegador meu, a 1440, 1024 e 400 px, com três logins: a Ana contou e
> terminou pelo leitor, o João recontou, o Lucas aprovou pela tela e o saldo foi a
> 11 + (−2) = 9. A prova que fecha a fase é **a primeira conferência de verdade**:
> o tablet do estoque contando sem ver o saldo, uma divergência recontada por
> outra pessoa e aprovada por uma terceira.

### ⚠️ O AJUSTE MANUAL EM DUAS PESSOAS — pedir não mexe no saldo (28/09/2026)

**Fase 3 da spec `ESTOQUE-LIVRO-E-CONFERENCIA.md`.** Até aqui quem tinha
`estoque.editar` mudava o saldo sozinho, na hora (`POST /api/estoque`). Agora:

```
PEDIR   (estoque.ajustar)          quantas peças a mais ou a menos + motivo  → o saldo NÃO anda
APROVAR (estoque.aprovar_ajuste)   outra pessoa                              → `ajuste` no livro
RECUSAR (quem aprova, com o porquê) · DESISTIR (quem pediu, com o porquê)   → o pedido fica
```

`ajuste_dominio.js` é o **dono único** do pedido; `ajuste_route.js` é a porta; a
pergunta *"é outra pessoa?"* é o **mesmo** `outraPessoa()` da conferência.
Na aba Estoque o botão da linha virou **"pedir ajuste"**, e a fila aparece no card
**"Ajustes esperando aprovação"** — que some quando não há pedido.

> ⚠️ **O PEDIDO É EM DELTA, NUNCA EM "SALDO NOVO"** — decisão do dono, 28/09/2026.
> Um pedido de "o saldo é 8" aprovado dois dias depois apagaria o que a bancada
> embalou no meio: é a armadilha #32 pela porta do ajuste. Quem pede pode digitar o
> saldo novo, e ele vira delta **contra o saldo daquele momento**
> (`saldo_no_pedido`, guardado ao lado). A aprovação aplica o delta sobre o saldo
> de **agora**, e a fila mostra o que mexeu no saldo desde o pedido.

> ⚠️ **OS PEDIDOS MORAM EM `ajuste_pedido`, E NÃO EM `ajuste_estoque`** — decisão
> do dono, divergência da §7 da spec. Cinco lugares leem o `ajuste_estoque` como
> *"o que foi aplicado"* (o histórico da linha, o último ajuste, o card, o número da
> faixa e o `comparar_inventario.js`): um pedido pendente ali apareceria como ajuste
> feito, sem erro nenhum. **A aprovação grava lá como sempre** — quem pediu assina
> a linha, e quem aprovou vai na observação.

> ⚠️ **NINGUÉM APROVA O PRÓPRIO PEDIDO, NEM O ADMIN GERAL, E O APROVADOR ÚNICO
> ESPERA** — a mesma decisão A da conferência (§6.4). A tela mostra ao dono do
> pedido o motivo, em vez de um botão que só daria erro.

> ⚠️ **UM PEDIDO PENDENTE POR SKU.** Dois pedidos abertos do mesmo SKU, aprovados em
> sequência, aplicariam a mesma correção duas vezes — e cada um parece certo
> sozinho. O segundo é recusado dizendo quem fez o primeiro.
>
> **E QUEM PEDIU PODE DESISTIR** (`desistido`, com o porquê). Sem isso, um pedido
> errado travaria o SKU até outra pessoa aparecer — a trava que só sabe acusar
> (§5). Recusar o pedido de **outra** pessoa exige a chave de aprovar.

> ⚠️ **O `POST /api/estoque` ANTIGO SÓ RECUSA** (410, `use_pedido`), dizendo o
> caminho e **sem gravar nada**. Sumir com a rota daria 404 à aba aberta antes do
> deploy, e alguém iria procurar o defeito no lugar errado.

> ⚠️ **AS CHAVES:** `estoque.ajustar` (admin) e `estoque.aprovar_ajuste` (admin,
> sensível). `estoque.editar` **saiu do cadastro**; o backfill de uma vez só
> (`config.seed_ajuste_duas`, seção 3-E do `acesso.js`) dá as duas a quem a tinha,
> inclusive por exceção. As duas juntas **não** devolvem o poder de antes: a regra
> de pessoa é do código, não da chave. As linhas antigas de `estoque.editar` ficam
> em `setor_permissao` (não há chave estrangeira) — é delas que o backfill lê.
> `ajuste_pedido` entrou em `TABELAS` do modo teste (§11).

> **O que NÃO passa por aqui, e é de propósito:** o `backfill_pacote.js --baixar`
> (§5, #23) continua aplicando direto — é script rodado à mão, com backup e decisão
> humana, e o motivo vai na linha. A contagem de **material** continua na aba
> Contagem, como era.

**Rode `node teste_ajuste.js` (53 casos) ao mexer no `ajuste_dominio.js`, no
`ajuste_route.js` ou no card da aba Estoque.** Escrito **antes** do código, e oito
defeitos foram reintroduzidos um a um: pedir já aplicando (reprova 15), quem pediu
aprovando (4), aprovar como saldo absoluto (5), recusar apagando (4), dois pendentes
do mesmo SKU (1), aprovar duas vezes (3), pedido sem motivo (10) e o saldo novo
gravado como delta cru (11). Mexeu nas chaves? **`node teste_acesso.js` (262, a
seção 6-G é esta) e `node teste_cobertura.js` (10).**

> ⚠️ **AINDA NÃO FOI CONFERIDO NA FÁBRICA.** A rodada foi num navegador meu, a 1440
> e a 400 px: o Lucas pediu −2 pela linha da aba Estoque, a fila disse a ele que a
> aprovação é de outra pessoa, o João aprovou e o saldo foi de 9 a 7, com a linha
> no histórico. A prova é o **primeiro ajuste de verdade** pedido por uma pessoa e
> aprovado por outra.

### ⚠️ A ACURACIDADE E O RESERVADO — fase 4 do livro (02/10/2026)

**Fase 4 da spec `ESTOQUE-LIVRO-E-CONFERENCIA.md`.** A aba Estoque ganhou duas
leituras, e **nenhuma entra em conta nenhuma**:

| | O que é | Onde |
|---|---|---|
| **reservado** | peças de volumes `pendente` (vendidos, ainda **sem etiqueta**) do SKU | sob o saldo, na linha: *"2 sem etiqueta · 3 livres"*, e no primeiro quadro |
| **disponível** | físico − reservado; **pode ficar negativo** (é o que falta produzir) | idem |
| **acuracidade do mês** | itens que **bateram na 1ª contagem** ÷ itens contados no mês | quadro próprio |
| **diferença por motivo** | o \|delta\| aprovado no mês, por motivo, em peças — e em R$ só com `custo.ver` | no mesmo quadro |

> ⚠️ **O RESERVADO NÃO MEXE NO `precisa`.** Quem decide quanto produzir continua
> sendo o `demanda_dominio` (armadilha #12); há caso travando que o `precisa` é o
> mesmo com e sem volume pendente. Conta **peça** (a caixa de várias reserva a
> soma das `qtd`), deixa de fora modo teste, bloqueado e cancelado, e **sob
> medida não tem reservado** — o saldo dela é sempre zero (§7).

> ⚠️ **"SEM ETIQUETA", E NÃO "VENDIDA".** A coluna ao lado se chama "Vendido a
> despachar" (o comprometido da planilha) e é outro número. Com a mesma palavra
> nos dois, a tela diria uma coisa duas vezes — só apareceu abrindo a tela.

> ⚠️ **ACERTO É O DA 1ª CONTAGEM.** O item que errou na 1ª e foi confirmado pela
> 3ª não conta como acerto: a pergunta é se o saldo estava certo quando alguém foi
> olhar. Sem contagem no mês a acuracidade é **traço**, nunca "0%". O SKU sem
> custo deixa o valor da diferença como **piso**, e sem nenhum valor a linha fica
> só com as peças — *"≥ R$ 0"* se leria como "não custou nada".

**Rode `node teste_acuracidade.js` (23 casos) ao mexer no reservado, na
acuracidade ou no `est_route.js`.** Sete defeitos reintroduzidos: contar linha
em vez de peça (reprova 3), modo teste reservando (3), sob medida com reservado
(3), o R$ viajando sem `custo.ver` (1), acuracidade 0% sem contagem (1), o
confirmado pela 3ª contando como acerto (3) e a conta sem o corte do mês (4).

> ✅ **NO AR** (PR #183), confirmado pelo dono em 02/10/2026.
>
> ⚠️ **A ACURACIDADE SÓ TEM NÚMERO DEPOIS DA PRIMEIRA CONFERÊNCIA DO MÊS.** Até
> lá o quadro mostra traço, e isso é a verdade, não defeito.

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
`ger_route.js`, no `cont_route.js` ou no `inventario_dominio.js`** — os 72 casos travam a conta única nas
quatro telas, o sob medida, o parado, a série do gráfico, a idade do inventário
(de ponta a ponta, pelo fluxo real — armadilha #32), o gate do custo e o acordo
com o fechamento diário do Planejamento. Mexeu na contagem?
**`node teste_contagem.js` e `node teste_inventario.js` também** (36 + 80 casos).

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
