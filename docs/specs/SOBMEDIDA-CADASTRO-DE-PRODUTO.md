# Sob medida — cadastro de produto (Romana, Painel e o que vier)

```
STATUS
Situação: em construção
Criada em: 27/10/2026
Última atualização: 28/10/2026 (documento único: decisões e modo de construção nas §13 e §14)
Fase atual: construindo as seis em sequência (§14)
Fases: 1 ☑ em código  2 ☑ em código  3 ☑ em código  4 ☑ em código  5 ☑ em código  6 ☐
Risco: 🔴 (schema do catálogo, preço, etiqueta de produção, ficha congelada)
Módulo: sob medida (tecido/) — ler tecido/README.md e a spec
        SOBMEDIDA-PEDIDO-REVENDA.md (§4.2 a §4.14) antes de mexer
Mudanças no caminho:
  F1 — o pedido e o simulador ganharam o SELETOR de produto (abriam sempre o
       primeiro modelo); criar componente e acrescentar linha de ficha pela
       tela entraram aqui, porque sem eles o dono não monta a Romana sozinho.
       O simulador aceita o inativo só para quem tem catalogo.editar.
  F2 — a escolha "Abertura" do Painel se chama `sentido` por dentro: neste
       módulo `abertura` já é a coleção. comando e rolamento continuam NOT
       NULL e o produto que não os liga grava '' (recriar sm_pedido_item com
       foreign_keys ligado arriscaria pedido aprovado). A migração liga as
       quatro do Rolô em TODO modelo existente, e não pelo nome.
  F3 — o cálculo virou coluna do produto (escada | gomos | folhas | nenhum);
       todo modelo com escada virou 'escada' na migração 34. O gomo mora em
       DÉCIMO de mm inteiro (333,3 → 3333). Quantidade por referência que o
       cálculo do produto não devolve é RECUSADA, nunca zero.
  F4 — a folha sai de UM numerador inteiro, (largura + 2·(k−1)·T) ÷ 2k na
       central, para o arredondamento ao mm ser um só. A referência de
       medida `folha` virou palavra reservada da ficha, como final e degrau.
  F5 — a unidade é uma LINHA por unidade em sm_pedido_componente (quantidade
       1 cada), e não uma tabela nova: o bipe, a recusa e o consumo já
       trabalhavam por linha. A data de fabricação é coluna própria
       (fabricado_em) porque o impresso_em é regravado na reimpressão. O nome,
       a marca e o modelo do material são CONGELADOS na aprovação, como a
       ficha. A lista de trabalho do material (âmbar) deixa de fora o tecido,
       os kits e o trabalho de setor (montagem, revisão, embalagem). O teste
       material_compra.test.js teve o esperado da porta ampliado para
       marca e modelo, que a §8.2 manda atravessar.
```

> **Onde mora:** dentro do `/sobmedida`, no `tecido.db`, com migrações
> numeradas de `tecido/nucleo/schema.js`. A tela é a **Catálogo de venda que
> já existe** (`tecido/public/telas/catalogo.html`) — nenhuma tela nova de
> cadastro.
>
> **Leia junto:** `SOBMEDIDA-PEDIDO-REVENDA.md`. Esta spec **generaliza** o que
> aquela fez só para o Rolô: o modelo, a ficha "referência + ajuste", a
> etiqueta por setor e o congelamento na aprovação continuam valendo, e passam
> a valer para qualquer produto.

---

## 1. O problema

A tela **Catálogo de venda** edita um produto que já existe (o Rolô), mas não
tem onde **criar** um produto. A rota `POST /api/sm/modelos` existe desde a
fase 1 da spec do sob medida; a tela nunca ganhou o botão.

E mesmo com o botão, só o Rolô caberia: o cálculo (`tecido/dominio/persiana.js`)
conhece uma regra só, a **escada de tubos**, e as escolhas do cliente estão
fixas no código — lado do comando, rolamento, bandô/barra, redução de peso.

A fábrica faz mais que isso:

| Produto | O que tem de diferente |
|---|---|
| Rolô | escada de tubos (já existe) |
| Double Vision, Rolô Motorizada | variações do Rolô — mesma conta, outra ficha (a Motorizada leva motor) |
| **Romana** | o sistema calcula **gomos** e **varetas** |
| **Painel** | o cliente escolhe **folhas**, **abertura**, **com ou sem comando**; o sistema calcula a **largura de cada folha** com transpasse e as **vias do trilho** |

Todos usam perfis de alumínio, tecido e componentes, cada um com o seu
desconto (ou acréscimo) na largura e na altura.

---

## 2. A ideia — o produto é montado com peças prontas

> *"Isso que estamos fazendo é algo para facilitar na criação de um produto
> novo."* — dono, 27/10/2026

Todo produto é feito das mesmas **quatro peças**:

| Peça | O que é | Exemplos |
|---|---|---|
| **Escolhas do cliente** | o que a revenda escolhe no pedido | folhas, abertura, com/sem comando, lado da corrente, bandô |
| **Cálculo** | o que o sistema decide sozinho | degrau do tubo, gomos e varetas, largura da folha, vias |
| **Ficha** | os insumos, com desconto/acréscimo cadastrável — serve para **custo e estoque** | perfil, tecido, vareta, trilho, motor |
| **Preço** | o que o cliente paga — **não sai da ficha** | m² por produto e coleção · acessório por metro linear |

> ⚠️ **AS ESCOLHAS E OS CÁLCULOS SÃO DO SISTEMA; OS NÚMEROS SÃO DO DONO.**
> As peças prontas são código testado: a regra dos gomos ímpares, a conta do
> transpasse, a escada de tubos. O produto **liga** as que usa e **preenche os
> números** dela (os mm de cada desconto, os preços, os limites). Produto novo
> que é combinação do que já existe, o dono monta sozinho na tela. Produto que
> precisa de uma **conta que não existe** entra por spec, como peça pronta
> nova — nunca como fórmula digitada na tela.
>
> Por que não deixar digitar fórmula: a regra dos gomos ("o menor **ímpar** que
> deixa cada gomo até 35 cm") não é uma fórmula, é uma busca com condição; e a
> do painel muda de forma com a abertura. Fórmula livre que tentasse cobrir
> isso seria uma linguagem de programação na tela de cadastro — e erro de
> fórmula vira persiana cortada errado, sem ninguém ver. O avaliador seguro do
> PCP (`formula.js`) continua sendo a única porta se um dia for preciso.

---

## 3. Criar e duplicar produto

### 3.1 Os dois caminhos

Botão **"+ Novo produto"** no topo da tela Catálogo, ao lado do seletor de
modelo, com duas opções:

| Caminho | O que nasce |
|---|---|
| **Do zero** | só o nome e os limites; as abas vazias |
| **Duplicar** um produto existente | **cópia de tudo**: coleções com preços, cores de acessório, escada de tubos, ficha, faixas de suporte, regra de redução, escolhas ligadas e cálculo |

### 3.2 Regras

- **O produto novo nasce INATIVO.** A revenda não vê, o pedido não aceita. O
  dono confere no simulador e ativa. Decidido pelo dono em 27/10/2026.
- **O simulador interno aceita produto inativo**, com uma tarja âmbar
  "INATIVO — a revenda não vê". Sem isso não há como conferir antes de ativar
  — e conferir depois de ativar é conferir com a revenda já vendendo.
- **O nome é obrigatório e único.** Duplicar propõe "Cópia de Rolô", e não
  deixa ativar enquanto o nome começar com "Cópia de".
- **Os preços copiados vão para o histórico de preço** (`sm_preco_historico`)
  com a marca "copiado de Rolô". Preço que aparece sem rastro é a metade do
  registro que falta quando alguém pergunta "de onde veio esse número?".
- **Tudo continua editável depois**: nome, limites, escolhas, ficha, preço.
  Desativar continua existindo, e é como se tira um produto de venda — nunca
  apagando (há pedidos apontando para ele).

---

## 4. As escolhas do cliente

### 4.1 O catálogo de escolhas

As escolhas são uma **lista do sistema**. O produto liga as que usa. Cada uma
tem um dono no código, que sabe validar e sabe o que ela libera ou esconde.

| Escolha | Opções | Quem usa hoje |
|---|---|---|
| Lado do comando | direito · esquerdo | Rolô |
| Rolamento | pela frente · por trás | Rolô |
| Adicional | nenhum · bandô · barra (nunca os dois) | Rolô, Painel (bandô côncavo) |
| Redução de peso | automática / pedida | Rolô |
| **Acionamento** | **com comando** (corda) · **sem comando** (puxa as vias com a mão) | Painel |
| **Abertura** | **tudo para a esquerda** · **tudo para a direita** · **central** | Painel |
| **Lado da corrente** | direito · esquerdo — só existe **com comando** | Painel |
| **Folhas** | número — os limites dependem da abertura (§6.2) | Painel |

- Escolha ligada é **obrigatória** no pedido, como já é no Rolô. Escolha que
  depende de outra (lado da corrente depende de "com comando") **some da tela**
  quando não se aplica, e o servidor **recusa** se vier mesmo assim — a tela
  esconder não é a regra (armadilha #26 do CLAUDE.md).
- **O Rolô não muda.** A migração liga no Rolô exatamente as quatro escolhas
  que o código dele já exige. Prova: as conferências da §4.5 da spec do sob
  medida dão o mesmo resultado antes e depois (fase 2).

### 4.2 A ficha passa a entender as escolhas

Hoje a linha da ficha tem `quando` (sempre · bandô · barra · sem adicional ·
redução). Passa a aceitar também:

| `quando` | A linha entra se… |
|---|---|
| `com_comando` / `sem_comando` | o acionamento escolhido |
| `abertura_lateral` / `abertura_central` | a abertura escolhida |

Exemplo: a corda do Painel é uma linha `quando = com_comando`; no painel sem
comando ela não entra, e por isso não baixa estoque nem custa.

---

## 5. Romana — gomos e varetas

### 5.1 As regras (do dono, 27/10/2026 — são regra, não preferência)

- O **número de gomos** é sempre **ímpar**.
- **Altura ÷ gomos nunca passa de 35 cm.**
- Quem decide os gomos é **o sistema**: o **menor ímpar** que respeita os
  35 cm. Ninguém escolhe.
- **O mínimo é 3 gomos.** Não existe Romana de um gomo só: mesmo baixa, ela
  sai com 3 gomos e 2 varetas.
- **O gomo é a divisão exata** (altura ÷ gomos), mostrada com uma casa
  decimal em mm — `333,3 mm`. Nenhum gomo absorve diferença. O gomo não é
  medida de corte de nenhuma peça: é a marcação que a montagem segue, e por
  isso pode ter a casa decimal sem ferir a regra do mm inteiro.
- **Varetas = gomos − 1.**
- **Tecido:** largura = **largura final − X**; altura = **altura final + Y**.
  X e Y são cadastrados na ficha do produto (é o "referência + ajuste" que já
  existe).

O limite de 35 cm é **número cadastrado no produto** (nasce 350 mm), e não
escrito no código: é o mesmo tipo de número que a escada de tubos guarda.

### 5.2 O que o cálculo devolve para a ficha

| Referência nova | O que é | Usada para |
|---|---|---|
| `gomos` | o número de gomos | conferência, etiqueta |
| `gomo` | a altura de cada gomo (altura ÷ gomos, exata, uma casa) | etiqueta da montagem |
| `varetas` | gomos − 1 | **quantidade** da linha da vareta |

A linha da ficha passa a aceitar **quantidade por referência**
(`quantidade_ref = varetas`), além do número fixo. A medida de corte da vareta
continua sendo "referência + ajuste" (ex.: largura final − Z mm).

### 5.3 Conferências obrigatórias (casos de teste)

```
altura 0,300  →  3 gomos de 100,0 mm  →  2 varetas   (mínimo de 3 — nunca 1)
altura 1,000  →  3 gomos de 333,3 mm  →  2 varetas
altura 1,050  →  3 gomos de 350,0 mm  →  2 varetas   (35 cm exatos: cabe)
altura 1,051  →  5 gomos de 210,2 mm  →  4 varetas   (3 dariam 350,3)
altura 1,500  →  5 gomos de 300,0 mm  →  4 varetas
altura 1,800  →  7 gomos de 257,1 mm  →  6 varetas   (5 dariam 360)
```

A medida exata dos 35 cm **cabe** (fica no degrau de baixo), como na escada de
tubos.

---

## 6. Painel — folhas, transpasse e trilho

### 6.1 A conta da folha (do dono, 27/10/2026)

As folhas são **sempre transpassadas**, e o transpasse é de **10 cm por
encontro de folhas** (número cadastrado no produto, nasce 100 mm).

```
transpasses = folhas − 1
folha       = (largura + transpasses × 10 cm) ÷ folhas
```

**Abertura central:** cada lado recebe **metade da largura** e faz a mesma
conta com as suas folhas. **No meio as duas metades só se encostam — não há
transpasse no meio.**

```
lado        = largura ÷ 2
folha       = (lado + (folhas_do_lado − 1) × 10 cm) ÷ folhas_do_lado
```

### 6.2 Os limites das folhas

| Abertura | Folhas | Vias do trilho |
|---|---|---|
| para a esquerda ou para a direita | **2 a 5** — o cliente escolhe | **uma via por folha** |
| central | **sempre par: 2, 4 ou 6** — metade para cada lado | **uma via por folha de cada lado** (4 folhas = 2 vias de cada lado) |

Fora disso o pedido é **recusado dizendo o porquê** ("abertura central pede
número par de folhas", "no máximo 5 folhas correndo para um lado").

### 6.3 O que o cálculo devolve para a ficha

| Referência nova | O que é |
|---|---|
| `folha` | a largura de cada folha (largura da folha de tecido) |
| `folhas` | quantas folhas — **quantidade** das linhas por folha |
| `vias` | vias do trilho: as folhas, na lateral; as folhas de **um** lado, na central |
| `lados` | 1 na lateral, 2 na central |

Peças da ficha do Painel, como o dono descreveu:

| Peça | Medida | Quantidade |
|---|---|---|
| Tecido de cada folha | largura = `folha`; altura = final + ajuste | `folhas` |
| **Base cônica** | **largura da folha de tecido + 5 mm** | `folhas` |
| Trilho | **largura final + ajuste cadastrável** — **uma peça só**, também na central | 1 (a etiqueta diz quantas vias) |
| Corda | — | só `quando = com_comando` |
| Bandô côncavo | opcional, vendido por metro linear | `quando = bando` |

### 6.4 Conferências obrigatórias (casos de teste)

```
1,500 · 2 folhas · lateral  →  1 transpasse   →  folha 0,800   (dono, 27/10)
2,400 · 4 folhas · lateral  →  3 transpasses  →  folha 0,675
3,000 · 5 folhas · lateral  →  4 transpasses  →  folha 0,680
3,000 · 6 folhas · central  →  lado 1,500 · 3 folhas · 2 transpasses
                               →  folha 0,567  ·  3 vias de cada lado
2,000 · 4 folhas · central  →  lado 1,000 · 2 folhas  →  folha 0,550
1,500 · 2 folhas · central  →  lado 0,750 · 1 folha   →  folha 0,750 (sem transpasse)
2,000 · 3 folhas · central  →  RECUSADO: central pede número par
3,000 · 6 folhas · lateral  →  RECUSADO: no máximo 5 para um lado
sem comando                 →  corda NÃO entra na ficha · lado da corrente não é pedido
```

`0,567` é 566,67 mm arredondado ao milímetro — tudo no sob medida é mm inteiro
(`nucleo/unidade.js`).

---

## 7. Preço

**Nada muda na forma de cobrar** — o preço é fixo, e **não sai da ficha**:

```
preço = m² cobrado × preço do m² (do produto + coleção escolhida)
      + acessórios opcionais × metro linear (bandô, barra…)
```

- O preço do m² é **por produto e coleção**: o 1% do Rolô tem um preço, o 1%
  da Romana tem outro. Já é assim hoje (`sm_modelo_colecao`), e com a Romana
  cadastrada o dono liga o 1% nela com o preço dela.
- **Preparado para preço por cor**, sem tela por enquanto: uma tabela de preço
  por **coleção + cor**, que quando tiver linha **vence** o preço da coleção, e
  quando não tiver, vale o da coleção. Vazia, nada muda. Decidido pelo dono em
  27/10/2026: *"ainda não muda por cor, mas podemos já deixar certo."*
- O mínimo faturado continua por produto/coleção, como hoje.

A **ficha** (com os descontos) responde outra pergunta: **quanto custa** e
**quanto baixa do estoque**. Os dois números nunca se confundem.

---

## 8. Etiqueta de produção — para todo insumo, de todo produto

### 8.1 As regras (do dono, 27/10/2026)

- **Todo insumo da ficha tem a marcação "gera etiqueta: sim/não".** Ela já
  existe no componente (`sm_componente.gera_etiqueta`); passa a aparecer e ser
  editável **na ficha de cada produto**.
- **Uma etiqueta por insumo**, nunca uma por setor: a serralheria faz mais de
  uma peça, e cada peça precisa da sua.
- **Uma etiqueta por UNIDADE.** Quatro varetas = **quatro etiquetas**, uma
  colada em cada vareta, marcadas **1/4, 2/4, 3/4, 4/4** — para a bancada ver
  se alguma ficou para trás.

### 8.2 O que vai escrito

| Bloco | Campos | De onde sai |
|---|---|---|
| **Base** — igual em todas | revenda · **cliente final**, quando houver · nº do pedido e do item (`1027/02`) · produto · medida final · cor · data de entrega | o pedido |
| **Do insumo** | nome · medida de **corte** · unidade (`2/4`) | **o cadastro de matéria-prima** (o material do Compras do PCP ligado ao componente) e a ficha congelada |
| **Extras** — marcados por insumo | ex.: no **motor**, marca + modelo + **data de fabricação** | o cadastro de matéria-prima |

- **Os dados do insumo nunca são digitados de novo** — vêm do cadastro de
  matéria-prima. Componente sem material ligado sai com o nome do componente,
  e a ficha mostra um aviso âmbar "sem matéria-prima ligada".
- **O motor e a garantia** (decidido pelo dono, 27/10/2026): fica gravado
  **qual motor** (marca e modelo, do cadastro) e a **data de fabricação**. Não
  há número de série. Marca e modelo passam a existir como campos opcionais do
  cadastro de matéria-prima.
- **A data de fabricação é o dia em que a etiqueta foi impressa pela
  primeira vez.** A reimpressão não muda a data — ela é da peça, como o
  código.
- **O cliente final** passa a existir no pedido da revenda como campo
  **opcional**. Preenchido, sai na etiqueta ao lado da revenda; vazio, a
  etiqueta sai só com a revenda. Hoje o pedido não guarda cliente final.
- A medida da etiqueta é a de **corte**, nunca a de consumo (armadilha #18).

> **As duas fontes, sem misturar** (dono, 28/10/2026):
>
> | Fonte | Dá | Nunca dá |
> |---|---|---|
> | **Cadastro de material** (Compras do PCP) | o que o componente **É**: nome, marca, modelo | medida |
> | **Ficha técnica** do produto | **quanto** e **a quanto cortar**: medida de corte, medida de produção, quantidade de unidades | o nome, quando há material ligado |
>
> O tubo continua com o nome do **degrau** (`TUBO 32`).
>
> ⚠️ **O CADASTRO DE MATERIAL AINDA NÃO ESTÁ REFINADO, E POR ISSO NADA TRAVA**
> (dono, 28/10/2026). Falta de material ligado, ou campo vazio nele (marca,
> modelo), **nunca** trava etiqueta, pedido nem aprovação. Sem material ligado
> sai o nome do componente; campo vazio simplesmente não sai no papel. A ficha
> de cada produto mostra em âmbar o que falta — *"sem material ligado"* ou
> *"material sem marca/modelo"* —, e essa é a lista de trabalho para arrumar o
> cadastro. **O motor é a exceção que avisa mais alto:** motor sem marca ou
> modelo aparece em âmbar também no simulador, porque é o dado da garantia.
> Avisa, não trava.

### 8.3 O que já existe e não muda

- O **código da etiqueta é da peça**, nasce na aprovação e sobrevive à
  reimpressão (`etiqueta_producao.js`). Com a etiqueta por unidade, **cada
  unidade tem o seu código** — quatro varetas, quatro códigos, quatro bipes.
- O consumo e a baixa de material **continuam pela quantidade da linha**: as
  quatro etiquetas das varetas são as mesmas 4 unidades que o Compras já
  conta. Explodir em etiquetas **não pode multiplicar o consumo** — há caso de
  teste travando isso (fase 5).
- O Rolô de hoje tem quantidade 1 em todas as linhas com etiqueta, então a
  etiqueta dele **não muda** — só ganha o "1/1" e os campos da base.

- **A recusa de um insumo com várias unidades volta SÓ A UNIDADE** (dono,
  28/10/2026). Quando o insumo tem mais de uma unidade, quem recusa escolhe o
  motivo **e a unidade** (ex.: `2/4`), e só ela volta — junto com o que
  depende dela, pela mesma regra de liberação da 5-B2. As outras (`1/4`,
  `3/4`, `4/4`) seguem. A unidade refeita reimprime a **mesma** etiqueta:
  mesmo código, mesmo `k/n`, mesma data de fabricação, marcada como refeita.
  Insumo de unidade única (todo o Rolô) continua com uma escolha só, o motivo.

---

## 9. Perguntas respondidas (27/10/2026)

| # | Pergunta | Resposta do dono |
|---|---|---|
| 1 | Romana pode ter 1 gomo só? | **Não. O mínimo é 3 gomos.** |
| 2 | Como fica o gomo quando a divisão não fecha? | **Divisão exata** — `333,3 mm`, nenhum gomo leva diferença |
| 3 | Trilho do Painel com abertura central | **Uma peça só** |
| 4 | Precisa de setor de costura? | **Não** — os cinco setores de hoje |
| 5 | "Cliente" na etiqueta | **Existe cliente final** — campo opcional no pedido, sai ao lado da revenda |
| 6 | Data de fabricação do motor | **A data em que a etiqueta foi impressa** |

---

## 10. O que fica de fora

- **A tela de preço por cor.** A estrutura fica pronta (§7); a tela, depois.
- **Fórmula livre na tela** (§2). Conta nova é peça pronta nova, por spec.
- **Número de série de motor** (§8.2). Decidido: marca, modelo e data bastam.
- **O preenchimento dos dados** de cada produto — descontos, preços, limites,
  matéria-prima ligada. Fica com o dono, na tela, à medida que cria os
  produtos.

---

## 11. Fases

Cada fase é pequena, tem prova e não começa sem a anterior em produção.

### Fase 1 — Criar, duplicar e ativar (🔴)

- Botão **+ Novo produto** (do zero / duplicar) na tela Catálogo.
- Duplicar copia tudo da §3.1 numa **transação só**; o novo nasce inativo.
- Ativar/desativar na tela; nome "Cópia de…" não ativa.
- Simulador interno aceita inativo, com tarja.
- Preços copiados entram no histórico com "copiado de".

**Prova:** duplicar o Rolô, simular as três conferências da §4.5 da spec do
sob medida no produto copiado e dar **o mesmo resultado** do Rolô; a revenda
não vê a cópia; ativar com nome "Cópia de" é recusado.

### Fase 2 — Escolhas ligáveis (🔴)

- Catálogo de escolhas da §4.1; aba **"Escolhas do cliente"** no Catálogo.
- `quando` novos na ficha (§4.2).
- Simulador e formulário do pedido montam os campos pelas escolhas ligadas.
- Migração liga no Rolô as quatro escolhas que ele já exige.

**Prova:** o Rolô dá **exatamente** o mesmo resultado em todos os testes de
`persiana.js` antes e depois; escolha desligada não aparece e é recusada pela
rota; lado da corrente some com "sem comando".

### Fase 3 — Romana (🟡)

- Peça pronta "gomos": limite cadastrável, referências `gomos`, `gomo`,
  `varetas`; quantidade por referência na ficha.
- Simulador mostra gomos e varetas.

**Prova:** as conferências da §5.3.

### Fase 4 — Painel (🟡)

- Peça pronta "folhas": transpasse cadastrável, lateral/central, limites da
  §6.2, referências `folha`, `folhas`, `vias`, `lados`.
- Simulador mostra a folha, as vias e o porquê das recusas.

**Prova:** as conferências da §6.4, com o trilho saindo em uma peça só na
abertura central.

### Fase 5 — Etiqueta por unidade, com os dados do cadastro (🔴)

- "Gera etiqueta" editável na ficha de cada produto.
- Uma etiqueta e um código **por unidade**, marcada `k/n`.
- Campos da base, do insumo (do cadastro de matéria-prima) e extras
  marcáveis; marca e modelo no cadastro de matéria-prima.
- Campo **cliente final** (opcional) no pedido da revenda, saindo na
  etiqueta; data de fabricação = primeira impressão.

**Prova:** Romana com 4 varetas imprime 4 etiquetas `1/4…4/4` com 4 códigos
diferentes, e o consumo de vareta no Compras **continua 4** (não 16); a
etiqueta do Rolô só ganha `1/1` e a base; reimpressão mantém os códigos **e a
data de fabricação**; pedido sem cliente final imprime só a revenda.

### Fase 6 — Romana e Painel na produção (🔴)

- Romana e Painel nos **cinco setores de hoje** — não há setor de costura
  (pergunta 4) —, com as liberações de cada produto.
- O pedido da revenda e o PDF do pedido mostram as escolhas novas.
- Preço por cor: a tabela e o cálculo (sem tela).

**Prova:** um pedido real de Romana e um de Painel atravessando os setores
com o leitor na mão.

---

## 12. Decisões desta spec (para `docs/DECISOES.md`)

- 27/10/2026 · Produto do sob medida se cria do zero **ou duplicando**; o novo
  nasce **inativo** até o dono conferir e ativar.
- 27/10/2026 · Escolhas e cálculos são **peças prontas do sistema**; o produto
  liga as que usa e o dono preenche os números. Conta nova entra por spec.
- 27/10/2026 · Romana: gomos **ímpares**, o **menor** que deixa cada gomo até
  **35 cm**, decidido pelo sistema; varetas = gomos − 1.
- 27/10/2026 · Painel: transpasse de **10 cm por encontro**; central divide a
  largura ao meio, sem transpasse no meio; lateral 2–5 folhas, central par até
  6; uma via por folha; com ou sem comando.
- 27/10/2026 · Preço continua **m² por produto e coleção** + acessório por
  metro linear; a estrutura nasce pronta para preço por cor.
- 27/10/2026 · Etiqueta de produção **por unidade de insumo**, marcada `k/n`,
  com dados do cadastro de matéria-prima; motor leva marca, modelo e data de
  fabricação, que é a data da **primeira impressão** da etiqueta.
- 27/10/2026 · Romana tem **no mínimo 3 gomos**; o gomo é a divisão exata.
- 27/10/2026 · Trilho do Painel é **uma peça só**, também na abertura central.
- 27/10/2026 · Romana e Painel usam os **cinco setores de hoje**, sem costura.
- 27/10/2026 · O pedido da revenda ganha **cliente final opcional**, que sai
  na etiqueta.

---

## 13. O bloco para `docs/DECISOES.md`

Copiar como está, no fim do arquivo, no mesmo commit que salva esta spec:

```
## 27/10/2026 — o sob medida ganha cadastro de produto: criar, duplicar, Romana e Painel

Spec `SOBMEDIDA-CADASTRO-DE-PRODUTO`. **Antes:** a tela Catálogo só editava o
Rolô; não havia onde criar produto, e o cálculo conhecia uma regra só, a escada
de tubos. **Depois:** produto se cria do zero ou duplicando, e nasce inativo até
o dono conferir no simulador e ativar. Escolhas do cliente e cálculos são peças
prontas do sistema; o produto liga as que usa e o dono preenche os números —
conta nova entra por spec, nunca como fórmula digitada na tela. Romana: gomos
ímpares, o menor número que deixa cada gomo até 35 cm, mínimo de 3, gomo pela
divisão exata, varetas = gomos − 1. Painel: 10 cm de transpasse por encontro de
folhas; abertura lateral de 2 a 5 folhas, central par até 6, dividindo a largura
ao meio sem transpasse no meio; uma via por folha; trilho de uma peça só; com ou
sem comando. O preço continua m² por produto e coleção, mais acessório por metro
linear, com a estrutura pronta para preço por cor. Etiqueta de produção por
UNIDADE de insumo, marcada k/n, com dados do cadastro de matéria-prima; o motor
leva marca, modelo e a data da primeira impressão da etiqueta. O pedido da
revenda ganha cliente final opcional. Romana e Painel usam os cinco setores de
hoje. O dono: *"isso que estamos fazendo é algo para facilitar na criação de um
produto novo"*.
```

---

## 14. Como construir — do início ao fim, numa entrega só

Decisão do dono, 28/10/2026: esta spec é construída **inteira, da fase 1 à 6,
em sequência**, e sobe para o servidor **uma vez, no fim**. O protocolo do
`CLAUDE.md` §0 continua valendo, ajustado a isso:

| Momento | O que acontece |
|---|---|
| **✋ 1 — PLANO único** | um PLANO cobrindo as seis fases, com o que muda em cada uma, as migrações, os testes e o que fica de fora. O dono responde **"pode seguir"** |
| **Construção** | as fases **em ordem**, sem parar entre elas. Ao fim de cada fase: testes da fase passando + `cd tecido && npm test` + os testes do PCP que a fase tocar, **commit próprio** e STATUS da spec atualizado (fase ☑ em código) |
| **Única interrupção permitida** | aparecer uma regra de negócio que esta spec não decide. Para, pergunta, e só segue com a resposta escrita na spec |
| **✋ 2 — FECHAMENTO único** | o FECHAMENTO do §0 cobrindo as seis fases, com as provas da §11 uma a uma, o PR aberto e os comandos de deploy |
| **Deploy** | só depois do **"pode subir"**: backup do `tecido.db` e do `dados.db` (`node backup.js`, nunca `cp`), fora do horário de expedição, migrações conferidas no banco depois do `pm2` |

**Foco.** Esta entrega mexe **só** no que esta spec descreve. Outras specs
abertas, rascunhos (`RASCUNHOS-26-10-2026.md`), dívidas e branches não entram —
nem "aproveitando que está aqui". Problema achado no caminho vai para o "Achei
no caminho" do FECHAMENTO, sem conserto junto.

**O Rolô não pode mudar.** Toda fase termina com os testes atuais do
`persiana.js` e da etiqueta de produção passando **sem alteração no esperado**.
Teste antigo que precisar mudar de resultado é regra mudando — para e pergunta.

**Ordem dentro das fases de risco 🔴 (1, 2, 5 e 6):** teste escrito **antes**
do código, como manda o semáforo do §0.

