> **STATUS · 17/09/2026 — IMPLEMENTADO (fases 0 a 6) · fase 7 pendente**
> Fases 0–5 em 23/08/2026, fase 6 em 24/08. Fase 7 (relatórios) espera haver histórico.
>
> **O que mudou na construção — onde divergir, vale o `CLAUDE.md`:**
> - **O SKU não tem formato obrigatório** (`CLAUDE.md` §7). O código é etiqueta livre;
>   medida, cor, tecido e modelo vivem em colunas (`largura_cm`, `altura_cm`,
>   `cor_codigo`, `tecido_codigo`, `modelo_id`). Os exemplos `BK180150BRANCO` abaixo
>   são só ilustração.
> - **Tecido é separado de modelo.** `BK` é o tecido (blackout); o modelo é o mecanismo
>   (Rolô, Acessório). Onde este doc diz "modelo BK — Persiana Rolô Blackout", leia
>   "modelo Rolô, tecido Blackout".
> - **A fórmula do tecido passou a usar `largura_bobina`** (04/09) e a ficha tem medida
>   de corte (`CLAUDE.md` armadilhas #18 e #19).
> - **Não segue a forma da §11** (`dominio/ dados/ rotas/`) — foi construído no padrão
>   antigo, porque este documento não estava no repositório.
> - A tabela `componente` é provisória (o dono é `PRODUCAO-MONTAGEM.md` §6).
>
> Movido do Projeto "PCP - Deccorar" para o repositório em 17/09/2026.

---

# Compras · Ficha Técnica, Fornecedores e Custo — Especificação

> O módulo que responde três perguntas que hoje não têm resposta:
> **o que comprar**, **de quem comprar** e **quanto o produto está custando**.
> **Data:** 18/08/2026 · **Status:** desenho para revisão, nada implementado
>
> **Leia antes:** `PRODUCAO-MONTAGEM.md` §5 (componentes, ficha técnica e reserva) ·
> `ESTOQUE-TECIDO-E-SOBRAS.md` §3 (o rolo se conta em metro linear) ·
> `ARQUITETURA-ALVO.md` (a forma em que este módulo nasce) · `CONTROLE-DE-ACESSO.md`
>
> **Decisões já tomadas.** Melhor preço pelo custo real da compra fechada ·
> necessidade por estoque mínimo **e** por demanda · preço fixo no cadastro com
> histórico de variação · escopo completo até o recebimento · custo vigente **e**
> custo médio, com a margem usando o vigente · mão de obra fora agora, com o lugar
> guardado · preço sem impostos · frete rateado por valor na comparação ·
> recebimento parcial mantém o pedido aberto · setor próprio de Recebimento ·
> pedido em PDF e em texto de WhatsApp · componentes entram na contagem existente ·
> **a ficha é uma fórmula sobre a medida, cadastrada no modelo de produto** ·
> largura, altura e cor viram campos próprios do SKU em centímetros · folga escrita
> dentro da fórmula · componente variável por cor **e largura de bobina** · cores em
> lista fechada · tecido em metro linear, com o retalho dentro do custo · o retalho
> do ML fica fora do módulo de sobras · um tecido por modelo · componente fixo por
> modelo, sem faixas · pedido sem aprovação por valor · condição de pagamento
> informa mas não ordena · **o ciclo termina no recebimento** · devolução ao
> fornecedor na mesma tela do recebimento · nota fiscal só número e data · **três
> papéis separados desde o primeiro dia** (Comprador, Recebimento, Financeiro) ·
> **perda de corte medida pela diferença, nunca chutada**.

---

## 1. O problema

**Não se sabe o custo do produto.** O sistema mede tempo de montagem e de revisão,
sabe o que saiu e o que entrou no estoque — e não sabe quanto custa uma persiana.
Sem isso, margem no Mercado Livre é chute.

**Não se sabe de quem comprar.** O mesmo tubo é vendido por três fornecedores, um
por barra de 6 m, outro por barra de 3 m, outro cortado no metro. Comparar isso de
cabeça, item a item, é onde o dinheiro vaza sem ninguém perceber.

**Não se sabe o que comprar.** A montagem reserva componentes e a embalagem dá
baixa — o número de *disponível* vai existir. Mas ninguém olha para ele antes de
faltar material na bancada.

**Não se sabe se o custo está subindo.** Cada aumento de fornecedor entra sem
deixar rastro. No fim do ano o produto custa 18% mais caro e não existe a linha do
tempo que mostre onde isso aconteceu.

---

## 2. O SKU tem ficha técnica, ou não tem

Nem todo SKU é fabricado. Alguns são comprados prontos e revendidos. É uma pergunta
de sim ou não, e **é o cadastro que responde** — não a ausência de dados.

| | Como o custo é formado | Quando usar |
|---|---|---|
| **Tem ficha** | Fórmulas do modelo aplicadas às medidas do SKU × preço vigente de cada componente | Persiana montada na fábrica |
| **Não tem ficha** | Um preço de custo digitado, ou o melhor preço entre fornecedores do próprio SKU | Produto comprado pronto e revendido |

```sql
ALTER TABLE skus ADD COLUMN tem_ficha    INTEGER DEFAULT 1;  -- 1 fabricado · 0 comprado pronto
ALTER TABLE skus ADD COLUMN custo_direto REAL;               -- só quando tem_ficha = 0
```

### Por que o campo é explícito, e não deduzido

A tentação é dizer *"tem linhas na ficha ⇒ é fabricado; não tem ⇒ é revenda"*.
Isso silencia o erro mais comum do cadastro: a persiana nova que **ainda não teve
a ficha lançada** apareceria como revenda com custo zero, e ninguém notaria.

Com o campo explícito, os dois erros ficam visíveis e têm nome:

| Situação | O sistema mostra |
|---|---|
| `tem_ficha = 1` sem modelo | **Modelo pendente** — o SKU aparece na lista de pendências, custo indefinido (nunca zero) |
| `tem_ficha = 1` com modelo sem fórmula | **Ficha pendente** — mesma lista |
| `tem_ficha = 1` sem largura ou altura | **Medida pendente** — mesma lista |
| `tem_ficha = 0` e sem preço | **Custo pendente** — mesma lista |
| `tem_ficha = 0` com modelo apontado | Bloqueado no cadastro |

> **Regra:** custo indefinido nunca vira zero. Zero é um custo válido e mentiroso.
> Onde não há custo, o relatório mostra `—` e conta o SKU como pendente.

### O SKU de revenda pode ter fornecedores

O caminho mínimo é o que você pediu: digita o preço de custo e pronto. Mas um SKU
de revenda **é** um item comprado — se você cadastrar fornecedores para ele, ele
usa exatamente a mesma comparação de preço dos componentes, e o `custo_direto`
passa a ser preenchido pelo melhor preço vigente em vez de digitado.

Os dois modos convivem: `custo_direto` digitado tem prioridade enquanto existir;
apagando o valor, o custo passa a vir da cotação. É uma linha a mais no cadastro,
não um módulo a mais.

---

## 3. A ficha por fórmula — a decisão que reduz o projeto

Uma persiana de 1,20 e uma de 3,00 consomem quantidades diferentes do mesmo tubo e
do mesmo tecido. Se a ficha for uma lista digitada por SKU, a ficha técnica da
linha inteira são centenas de cadastros à mão — e cada SKU novo é mais um.

**A ficha é uma fórmula sobre a medida do produto.** São algumas dezenas de
fórmulas para a linha inteira, e o SKU novo de 2,00×1,40 não precisa de cadastro
nenhum: aponta o modelo, informa as medidas, e a ficha existe.

### As três peças

```
MODELO DE PRODUTO    'Persiana Rolô Blackout'  ·  dono das fórmulas
     ↓
SKU                  modelo + largura + altura + cor
     ↓
FICHA CALCULADA      as fórmulas do modelo aplicadas às medidas do SKU
```

### Onde você lança os componentes

A pergunta natural é *"então eu lanço os componentes de cada SKU?"*. **Não.** Você
lança **uma vez, no modelo** — e todo SKU daquele modelo passa a ter ficha, agora e
para sempre.

O que você digita, uma única vez, para o modelo `BK — Persiana Rolô Blackout`:

| Componente | Quanto |
|---|---|
| Tubo 28 mm | largura + 2 cm |
| Tecido blackout *(na cor do SKU)* | altura + 30 cm |
| Cordão | altura + 50 cm |
| Suporte lateral | 2 |
| Kit comando | 1 |
| Parafuso 3,5×25 | 4 |

Seis linhas. Valem para toda persiana rolô blackout, de qualquer medida, de
qualquer cor, inclusive as que ainda não existem.

**E abrindo um SKU você vê a ficha dele, pronta:**

```
BK180150BRANCO · Persiana Rolô Blackout · 180 × 150 · BRANCO

   Tubo 28 mm                 1,82 m
   Tecido blackout BRANCO     1,80 m linear   (bobina 2,00 m)
   Cordão                     2,00 m
   Suporte lateral            2 un
   Kit comando                1 un
   Parafuso 3,5×25            4 un
                                              custo de material  R$ 203,10
```

É exatamente a ficha daquele SKU, com os números daquele SKU. Só que ninguém
digitou: veio da fórmula.

### A conta que justifica isso

| | Ficha por SKU | Fórmula por modelo |
|---|---|---|
| Cadastro inicial | nº de SKUs × 6 linhas | nº de modelos × 6 linhas |
| Com 200 SKUs e 3 modelos | **1.200 linhas digitadas** | **18 linhas** |
| SKU novo amanhã | mais 6 linhas, toda vez | **zero** |
| Trocar de fornecedor de suporte | 200 fichas para corrigir | 1 linha |

A última é a que costuma doer mais tarde: com ficha por SKU, qualquer mudança de
componente vira uma varredura em tudo — e a varredura que fica pela metade é como o
custo passa a mentir sem ninguém notar.

**E se um produto for realmente diferente?** Ele é outro modelo. Criar modelo é
cadastro barato. Se um dia isso virar chato — muitos modelos quase iguais — a saída
é ligar exceção por SKU, que é uma tabela a mais e não um redesenho. Hoje não
precisa.

### O SKU ganha campos próprios de medida

Hoje o sistema lê `BK180150BRANCO` e deduz 180 de largura, 150 de altura e a cor.
Isso passa a ser **um atalho de digitação, não a fonte da verdade**:

```sql
ALTER TABLE skus ADD COLUMN modelo_id  INTEGER REFERENCES modelo(id);
ALTER TABLE skus ADD COLUMN largura_cm INTEGER;   -- 180
ALTER TABLE skus ADD COLUMN altura_cm  INTEGER;   -- 150
ALTER TABLE skus ADD COLUMN cor        TEXT;      -- BRANCO
```

Ao digitar o código, o cadastro preenche os três campos sozinho e **você pode
corrigir**. Daí em diante toda conta usa os campos.

> **Isto conserta um problema que a auditoria já apontou.** O `ARQUITETURA-ALVO.md`
> §5 registra três estratégias de normalização de SKU espalhadas por 14 pontos do
> código. Com os campos gravados, `decompor()` deixa de ser regra de runtime e vira
> conveniência de cadastro — a medida é lida da coluna, não interpretada da string.
> E o produto que não seguir a nomenclatura passa a ser cadastrável sem quebrar
> nada.

**Migração:** um passe único lê os SKUs existentes e preenche os campos. O que não
casar com o padrão entra numa lista de **medida pendente** — visível, não zerado.

### O modelo de produto

```sql
CREATE TABLE IF NOT EXISTS modelo (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo    TEXT UNIQUE,          -- 'BK'
  nome      TEXT,                 -- 'Persiana Rolô Blackout'
  ativo     INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
```

**SKU sem modelo fica pendente**, com custo indefinido — nunca zero. Você preenche
os modelos aos poucos e nada para enquanto isso.

### A fórmula

```sql
CREATE TABLE IF NOT EXISTS ficha_formula (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id     INTEGER REFERENCES modelo(id),
  componente_id INTEGER REFERENCES componente(id),  -- nulo quando varia por cor
  familia       TEXT,        -- 'tecido_blackout' — resolve pela cor do SKU
  expressao     TEXT,        -- 'largura * (altura + 30) / 10000'
  observacao    TEXT,        -- 'a folga de 30 cm é bainha + volta no tubo'
  ordem         INTEGER,
  CHECK ( (componente_id IS NULL) <> (familia IS NULL) )
);
```

Variáveis disponíveis: **`largura`** e **`altura`** em centímetros, inteiros.
Operadores `+ − × ÷ ( )` e as funções `teto()`, `piso()`, `max()`, `min()`.
O resultado sai **na unidade de consumo do componente**.

Ficha do modelo `BK — Persiana Rolô Blackout`:

| Componente | Unid. | Expressão | Lê-se |
|---|---|---|---|
| Tubo 28 mm | m | `(largura + 2) / 100` | a largura mais 2 cm de folga |
| Tecido blackout *(por cor e bobina)* | **m linear** | `(altura + 30) / 100` | 30 cm de bainha e volta no tubo |
| Cordão | m | `(altura + 50) / 100` | |
| Suporte lateral | un | `2` | sempre dois |
| Kit comando | un | `1` | |
| Parafuso 3,5×25 | un | `4` | |

Aplicada ao SKU `BK180150BRANCO` (180 × 150):

```
Tubo 28 mm             (180 + 2) / 100   =  1,82 m
Tecido blackout BRANCO (150 + 30) / 100  =  1,80 m linear   ◀ ver adiante
Cordão                 (150 + 50) / 100  =  2,00 m
Suporte lateral                          =  2 un
Kit comando                              =  1 un
Parafuso 3,5×25                          =  4 un
```

> **O tecido não é medido em m².** O `ESTOQUE-TECIDO-E-SOBRAS.md` §3 já fixou a
> regra: o rolo se conta em **metro linear**, a largura da bobina é fixa, e o m² é
> derivado — nunca digitado. A fórmula do tecido segue isso: puxa `altura + folga`
> de metro linear, e a **largura da persiana é atendida pela largura da bobina**.
> Ela não entra na quantidade; ela entra na escolha da bobina.

### A folga fica escrita, não escondida

A perda técnica mora **dentro da fórmula, explícita**. O `+ 30` do tecido está lá
porque é bainha mais a volta no tubo, e o campo de observação diz isso em
português. Quando alguém perguntar daqui a um ano *"por que 30?"*, a resposta está
no cadastro — não na cabeça de quem cadastrou.

> Um campo de "% de perda" separado seria mais rápido de ajustar, e é por isso que
> é pior: ele esconde de onde vem o número, e erra quando a perda é fixa (uma
> bainha é sempre 30 cm) e não proporcional.

### O componente que varia: cor **e** largura de bobina

O tecido blackout branco e o bege são itens de estoque diferentes — compras precisa
saber que faltou **bege**, não "tecido". E a bobina de 2,50 e a de 1,40 do mesmo
tecido e da mesma cor também são itens diferentes: preço diferente, fornecedor
diferente, saldo diferente. Quarenta metros de bobina 1,40 não atendem uma persiana
de 1,80, e um saldo somado esconderia isso.

```sql
ALTER TABLE componente ADD COLUMN familia          TEXT;      -- 'tecido_blackout'
ALTER TABLE componente ADD COLUMN cor              TEXT;      -- 'BRANCO'
ALTER TABLE componente ADD COLUMN largura_bobina_cm INTEGER;  -- 250
```

A linha da ficha diz apenas `familia = 'tecido_blackout'`. A resolução acontece em
dois passos:

```
1. FILTRA   familia = 'tecido_blackout'
            cor     = cor do SKU
            largura_bobina_cm ≥ largura do SKU

2. ESCOLHE  a de menor preço por metro linear
```

**Repare que não existe uma segunda conta de desperdício** — e é por um motivo que
vale escrever. A bobina mais larga custa mais por metro linear justamente porque
tem mais tecido. Você puxa a mesma metragem linear de qualquer uma delas. Então
**escolher o menor preço por metro linear entre as que servem já é escolher a que
menos desperdiça** — o desperdício de largura já está dentro do preço.

E se um fornecedor vender a bobina de 2,50 mais barata por metro linear que a de
2,00, a de 2,50 é de fato a mais barata, mesmo gerando mais retalho. A regra
continua certa porque o retalho do Mercado Livre não é reaproveitado (ver adiante).

A tela mostra a escolha com o motivo e o retalho ao lado, para você poder discordar:

```
BK180150BRANCO · tecido blackout BRANCO · precisa atender 1,80 m de largura

  ✓ bobina 2,00 m    R$ 14,20 / m linear    retalho lateral 0,20 m
    bobina 2,50 m    R$ 17,50 / m linear    retalho lateral 0,70 m
    bobina 1,40 m    —  não atende 1,80 m de largura
```

Dois erros ficam nomeados em vez de silenciosos:

```
⚠ BK180150VERDE — não existe tecido blackout na cor VERDE.
   Cadastre o componente ou corrija a cor do SKU.

⚠ BK320150BRANCO — nenhuma bobina de blackout BRANCO atende 3,20 m de largura.
   A maior cadastrada tem 2,50 m.
```

Os demais componentes (tubo, comando, ferragem) apontam direto para
`componente_id` e ignoram cor e largura.

### O retalho entra no custo, e fica fora do módulo de sobras

**O custo do tecido é o metro linear puxado**, não o m² que virou persiana. Você
pagou o rolo inteiro; puxar 1,80 m lineares de uma bobina de 2,00 custa 1,80 m
lineares, mesmo com 0,20 m de largura virando retalho. Contar só a área usada
deixaria de fora a maior perda do processo.

**E o retalho do Mercado Livre continua fora do `ESTOQUE-TECIDO-E-SOBRAS.md`.**
Aquele módulo é outra operação e outros tecidos, e a fronteira escrita lá continua
valendo. A consequência precisa estar clara: aqui o retalho é **perda**, não
crédito — não existe busca de sobra antes de abrir o rolo, e nada volta para o
estoque.

> Se um dia essa fronteira cair, a mudança é pequena e conhecida: o retalho ganha
> etiqueta e endereço como já está desenhado lá, e entra como crédito na peça que o
> consumir. O custo por metro linear continua sendo a conta certa nos dois mundos.

### As cores são uma lista fechada

`BEGE`, `Bege` e `BEGE CLARO` como texto livre são três cores diferentes para o
banco, e a resolução por família quebra em silêncio. Então cor é cadastro:

```sql
CREATE TABLE IF NOT EXISTS cor (
  codigo TEXT PRIMARY KEY,     -- 'BEGE'
  nome   TEXT,                 -- 'Bege'
  ativa  INTEGER DEFAULT 1
);
```

O SKU e o componente escolhem da mesma lista. A migração lê as cores que já
aparecem nos SKUs existentes, monta a lista e **você revisa e junta as duplicadas
de uma vez** — que é o único momento em que dá para fazer isso barato.

### A fórmula é testada antes de salvar

Fórmula errada em cadastro vira compra errada em produção. Então a tela não salva
sem mostrar o resultado em três medidas:

```
┌────────────────────────────────────────────────────────────────┐
│  Tecido blackout                        unidade de consumo: m² │
│                                                                │
│  Fórmula   largura * (altura + 30) / 10000                     │
│  Por quê   30 cm = bainha (10) + volta no tubo (20)            │
│                                                                │
│  Teste     100 × 100  →  1,30 m²                               │
│            180 × 150  →  3,24 m²                               │
│            300 × 250  →  8,40 m²                               │
│                                                                │
│            [ Cancelar ]              [ ✓ Salvar ]              │
└────────────────────────────────────────────────────────────────┘
```

Resultado zero, negativo ou fora de faixa razoável **não salva**.

### A expressão não passa por `eval()`

Isto precisa estar escrito porque a tentação é grande e o buraco é real: uma string
vinda do banco executada como JavaScript é execução de código arbitrário com a
permissão do servidor.

O avaliador é próprio e pequeno — tokeniza, aceita apenas números, as duas
variáveis conhecidas, os operadores e as funções da lista, e recusa qualquer outra
coisa **no momento do cadastro**. Erro de fórmula vira erro de tela, nunca erro em
produção.

### O componente é fixo por modelo

Você decidiu que não há troca de componente por faixa de medida — o modelo usa
sempre o mesmo tubo, o mesmo comando, as mesmas peças, e só a quantidade muda.

**Se um dia um modelo precisar de tubo reforçado acima de certa largura, a resposta
é um modelo novo**, não uma regra condicional dentro da fórmula. Modelo novo é
cadastro; condicional dentro de fórmula é uma linguagem de programação crescendo
dentro de um campo de texto.

### A `ficha_tecnica` continua existindo, agora como cache

O `PRODUCAO-MONTAGEM.md` §6 define `ficha_tecnica (sku, componente_id, quantidade)`
e a reserva da montagem já consome essa tabela. Ela **não é descartada** — passa a
ser preenchida pelo cálculo em vez da digitação:

```
fórmula do modelo  +  medidas do SKU   →   ficha_tecnica (materializada)
```

Recalculada quando a fórmula, o modelo ou as medidas do SKU mudam. Tudo que já lê a
ficha continua lendo a ficha, sem saber que existe fórmula por trás. E a regra que
já estava escrita continua valendo inteira: **a reserva congela a quantidade do
momento da montagem**, não a fórmula.

---

## 4. A peça central: unidade de consumo × unidade de compra

Este é o coração do módulo, e é onde quase todo sistema de compras erra.

```
UNIDADE DE CONSUMO     como a ficha técnica gasta          metro · unidade · kg
UNIDADE DE COMPRA      como o fornecedor vende             barra 6 m · pacote 100 un · rolo 50 m
FATOR                  quantas de consumo cabem em uma de compra
```

**A unidade de compra pertence ao fornecedor, não ao componente.** O mesmo tubo:
o fornecedor A vende barra de 6 m, o B vende barra de 3 m, o C corta no metro. Se
a embalagem morasse no componente, não daria para cadastrar os três.

Por isso a linha que liga fornecedor a item — a **oferta** — é quem carrega a
embalagem, o fator, o preço e as regras de venda.

| | Componente | Unid. consumo | Fornecedor | Embalagem | Fator | Preço |
|---|---|---|---|---|---|---|
| | Tubo 28 mm | m | Metalúrgica A | barra 6 m | 6 | R$ 42,00 |
| | Tubo 28 mm | m | Metalúrgica B | barra 3 m | 3 | R$ 24,00 |
| | Tubo 28 mm | m | Distribuidora C | metro | 1 | R$ 9,50 |
| | Parafuso 3,5×25 | un | Ferragens D | pacote 100 un | 100 | R$ 18,00 |
| | Parafuso 3,5×25 | un | Ferragens D | caixa 500 un | 500 | R$ 82,00 |

Repare na última dupla: **o mesmo fornecedor pode ter duas embalagens do mesmo
item**, e a maior nem sempre compensa. São duas ofertas, e as duas entram na
comparação.

### As regras de venda que mudam a conta

| Campo | O que é | Exemplo |
|---|---|---|
| `fator` | unidades de consumo por embalagem | barra 6 m ⇒ 6 |
| `multiplo` | só vende de N em N embalagens | fecha caixa com 10 barras ⇒ 10 |
| `qtd_minima` | mínimo de embalagens no pedido | mínimo 5 barras |
| `frete` | frete fixo do item, quando cobrado à parte | R$ 30,00 |
| `pedido_minimo` (no fornecedor) | valor mínimo do pedido inteiro | R$ 500,00 |

---

## 5. O melhor preço — custo real da compra fechada

A conta, para uma necessidade **N** na unidade de consumo:

```
embalagens      = arredonda_para_cima( N / fator )
embalagens      = ajusta ao múltiplo e ao mínimo do fornecedor
qtd_comprada    = embalagens × fator
desembolso      = embalagens × preço  +  frete
sobra           = qtd_comprada − N
preço_unitário  = preço / fator                    ← R$ por metro / por unidade
custo_efetivo   = desembolso / N                   ← quanto o pedido custou por unidade usada
```

### Exemplo — preciso de 7 m de tubo

| Fornecedor | Embalagem | Preço | R$/m | Compra | Desembolso | Sobra | Efetivo |
|---|---|---|---|---|---|---|---|
| Metalúrgica A | barra 6 m | R$ 42,00 | **7,00** | 2 barras (12 m) | R$ 84,00 | 5 m | R$ 12,00 |
| Metalúrgica B | barra 3 m | R$ 24,00 | 8,00 | 3 barras (9 m) | **R$ 72,00** | 2 m | **R$ 10,29** |
| Distribuidora C | metro (mín. 10 m) | R$ 9,50 | 9,50 | 10 m | R$ 95,00 | 3 m | R$ 13,57 |

**A ordem se inverte.** Pelo preço de tabela, A é o mais barato. Pelo que sai do
caixa e pelo custo por metro efetivamente usado, B ganha — e ainda deixa menos
sobra parada. É exatamente o caso que a comparação de cabeça não pega.

### Exemplo — preciso de 250 parafusos

| Fornecedor | Embalagem | Preço | R$/un | Compra | Desembolso | Sobra | Efetivo |
|---|---|---|---|---|---|---|---|
| Ferragens D | pacote 100 un | R$ 18,00 | 0,180 | 3 pacotes (300) | **R$ 54,00** | 50 un | **R$ 0,216** |
| Ferragens D | caixa 500 un | R$ 82,00 | **0,164** | 1 caixa (500) | R$ 82,00 | 250 un | R$ 0,328 |

Aqui a inversão vai para o outro lado, e mostra o limite honesto do custo efetivo:
**a sobra de 250 parafusos não é prejuízo — é o parafuso da semana que vem.** A
caixa é de fato mais barata; só exige capital hoje.

### A regra que resolve os dois casos

O custo efetivo está certo quando a sobra se perde e errado quando a sobra volta
para o estoque. Então o componente diz qual é o seu caso:

```sql
ALTER TABLE componente ADD COLUMN sobra_aproveitavel INTEGER DEFAULT 1;
```

| `sobra_aproveitavel` | Ranking padrão | Por quê |
|---|---|---|
| **1** (tubo, tecido, parafuso, cordão) | **preço por unidade de consumo** | A sobra vira estoque e serve na próxima peça — pagar por ela não é perda |
| **0** (item sob medida, lote específico, perecível) | **custo efetivo** | O que sobrou virou lixo, e tem que entrar na conta |

**E a tela mostra os três números sempre, lado a lado** — preço unitário,
desembolso do pedido e sobra que entra no estoque. O sistema ordena, marca o
vencedor com o motivo escrito (*"mais barato por metro"* ou *"menor custo efetivo,
a sobra deste item não se aproveita"*), e o comprador decide. Quando ele escolhe
um que não é o primeiro, o sistema pede o motivo em uma linha e guarda.

> **Sugestão.** Nascer com `sobra_aproveitavel = 1` em tudo e marcar as exceções à
> mão. É o caso da grande maioria dos seus insumos, e o erro na direção segura é
> comprar a embalagem maior, não a menor.

### O frete entra na comparação, rateado por valor

O fornecedor mais barato que cobra R$ 180 de frete não é o mais barato. Então o
frete entra no preço comparado, dividido entre os itens **proporcionalmente ao
valor de cada um**:

```
frete_do_item    = frete_do_pedido × ( valor_do_item / valor_total_do_fornecedor )
preço_comparado  = ( embalagens × preço + frete_do_item ) / qtd_comprada
```

Há um problema de ordem aqui, e ele precisa estar escrito: **o rateio depende do
pedido inteiro, e a comparação de um item acontece antes do pedido existir.** A
saída é ratear em dois momentos:

| Momento | Qual frete entra |
|---|---|
| Comparando **um item** isolado | o frete fixo cadastrado na oferta, quando houver |
| Comparando **a lista agrupada por fornecedor** | o frete do pedido inteiro, rateado por valor entre os itens daquele fornecedor |

**A tela mostra sempre as duas colunas — preço sem frete e preço com frete.** E
quando o frete inverte a ordem, o sistema escreve isso em vez de esconder:

```
⚠ Sem frete a Metalúrgica A ganha. Com o frete deste pedido (R$ 180),
  a Metalúrgica B fica R$ 62,00 mais barata no total.
```

Esconder o rateio é como um número vira decisão errada sem ninguém perceber.

### O que o ranking também considera

- **Fornecedor inativo ou item inativo** não entra na comparação.
- **Prazo de entrega** aparece na linha, mas não ordena. Ele vira aviso quando a
  necessidade tem data: *"chega depois da produção — o segundo colocado chega a
  tempo"*.
- **Pedido mínimo do fornecedor** aparece como aviso: *"faltam R$ 180 para atingir
  o mínimo deste fornecedor"*, com a sugestão de que outros itens do mesmo
  fornecedor entrem no mesmo pedido.
- **Condição de pagamento** aparece na linha e **não ordena**. *"Metalúrgica A —
  R$ 2.394,00 · à vista"* ao lado de *"Metalúrgica B — R$ 2.736,00 · 30/60/90"* é o
  suficiente para você decidir. Trazer os preços a valor presente exigiria uma taxa
  de custo do dinheiro que você teria de definir e defender — e o ganho não paga a
  discussão.

---

## 6. Preço e histórico — de onde sai a economia

O preço é **fixo no cadastro**, como você decidiu: um preço vigente por oferta,
editado quando muda. A simplicidade fica no cadastro; a memória o sistema guarda
sozinho.

**Toda alteração de preço grava uma linha de histórico.** O comprador não digita
nada a mais — ele edita o preço e o histórico acontece.

```
fonte = 'cadastro'   o comprador atualizou o preço de tabela
fonte = 'compra'     o preço veio do recebimento — foi o que a nota cobrou
fonte = 'reajuste'   atualização em lote de um fornecedor
```

### O preço pago manda

No recebimento você lança o preço que veio na nota. Se ele for diferente do preço
vigente, o sistema:

1. grava a divergência no item do pedido,
2. escreve o histórico com `fonte='compra'` e a referência do pedido,
3. **atualiza o preço vigente** — porque o preço real é o que foi cobrado, não o
   que estava na tabela,
4. e avisa: *"o tubo 28 mm subiu 6,4% desde o último pedido"*.

### Os dois números que respondem "estamos economizando?"

| Indicador | Como é calculado | O que responde |
|---|---|---|
| **Variação de custo do produto** | Custo do SKU hoje × custo em 30/90/365 dias | *"A persiana 1,60×1,40 custava R$ 187,40 em maio e custa R$ 203,10 hoje: +8,4%, e 6,1 pontos vieram do tubo."* |
| **Ganho da escolha** | Em cada pedido: desembolso do fornecedor mais caro cotado − desembolso pago | *"Nos pedidos de agosto, escolher o melhor preço economizou R$ 2.840."* |

O primeiro é o que importa e o que você pediu. O segundo é bom para justificar o
tempo gasto cotando — mas ele infla se você cadastrar um fornecedor caro só para
ter contra quem comparar. O documento registra isso para que ninguém o leia como
lucro.

Para o primeiro existir, o custo de cada SKU vira uma linha de histórico **sempre
que algo que o compõe muda**: preço de componente, ficha técnica ou custo direto.

```sql
CREATE TABLE IF NOT EXISTS custo_sku_historico (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  sku            TEXT NOT NULL,
  custo_material REAL NOT NULL,
  custo_mo       REAL DEFAULT 0,     -- mão de obra: nasce zerada, ver adiante
  custo_total    REAL NOT NULL,      -- material + mão de obra
  custo_medio    REAL,               -- o custo do material que está em estoque
  origem         TEXT,   -- ficha | direto (do custo, não do SKU)
  motivo         TEXT,   -- 'preço de Tubo 28mm mudou' | 'ficha alterada' | 'custo direto editado'
  referencia     TEXT,   -- pedido, quando veio de uma compra
  usuario_nome   TEXT,
  criado_em      TEXT DEFAULT (datetime('now','localtime')),
  data           TEXT DEFAULT (date('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_custo_sku ON custo_sku_historico(sku, data);
```

> É a mesma ideia do `movimento_estoque` da arquitetura-alvo: o número atual é
> conveniência, a história é a verdade. Sem ela, *"por que o custo subiu?"* não
> tem resposta.

### Preço sem impostos — uma convenção só

O preço cadastrado é sempre o **valor da mercadoria, sem impostos**. Uma convenção
única em todo o cadastro evita o pior erro possível numa tela de melhor preço:
comparar maçã com laranja porque um fornecedor é do Simples e o outro não.

O fornecedor ganha um campo de regime. Quando dois de regimes diferentes disputam
o mesmo item, a comparação **avisa e não bloqueia**:

```
⚠ Metalúrgica A é Simples Nacional e a Distribuidora C não.
   Confira se os dois preços estão na mesma base antes de decidir.
```

```sql
ALTER TABLE fornecedor ADD COLUMN regime TEXT;  -- simples|presumido|real|mei
```

### Os dois custos: vigente e médio

| Custo | Como é formado | Responde | Onde é usado |
|---|---|---|---|
| **Vigente** | soma do melhor preço vigente de cada componente | *quanto custaria produzir hoje* | **margem no ML**, decisão de preço de venda |
| **Médio** | média ponderada do que foi realmente pago pelo material em estoque | *quanto custou o que eu produzi* | resultado do mês, valor do estoque |

O custo médio se move a cada entrada, e só ali:

```
custo_medio_novo = ( estoque × custo_medio  +  qtd_entrada × preço_pago_unitário )
                   ─────────────────────────────────────────────────────────────
                                    estoque + qtd_entrada
```

A conta roda no recebimento, dentro de `dominio/componente.js`, junto com o
movimento de entrada. **Ela não roda em nenhum outro lugar** — é a mesma regra de
dono único que a arquitetura-alvo impõe ao estoque.

**A margem do Mercado Livre usa o vigente**, porque a pergunta que ela responde é
sobre a próxima venda, não sobre a anterior. E o relatório mostra os dois com a
diferença nomeada:

> *Persiana 1,60×1,40 — produzir hoje custa R$ 203,10. O material que está em
> estoque custou R$ 191,80. Você tem componente comprado antes do aumento do tubo.*

### Mão de obra: fora agora, com o lugar guardado

Mão de obra **não entra no custo nesta fase** — o tempo de montagem e de revisão
ainda não está sendo medido, e um custo/hora aplicado sobre tempo estimado produz
um número que parece exato e não é.

Mas o custo já nasce **separado em duas parcelas**, para que ligar mão de obra
depois seja um cadastro e não uma migração:

```
custo_total = custo_material + custo_mo        (hoje custo_mo = 0 em tudo)
```

Quando a montagem e a revisão estiverem medindo tempo de verdade, entra um
custo/hora por etapa na configuração e o `custo_mo` passa a ser preenchido — sem
tocar em nenhuma tela e sem reescrever o histórico, que já tem a coluna desde o
primeiro dia.

> **Regra enquanto `custo_mo` for zero: a tela escreve "custo de material", não
> "custo do produto".** Nomear um número pela metade com o nome inteiro é como uma
> margem errada vira preço de venda errado.

---

## 7. O que comprar — a necessidade

Você escolheu os dois gatilhos. Eles respondem perguntas diferentes e o sistema
usa os dois ao mesmo tempo.

### Gatilho 1 — ponto de pedido

```sql
ALTER TABLE componente ADD COLUMN estoque_minimo REAL DEFAULT 0;
ALTER TABLE componente ADD COLUMN estoque_ideal  REAL DEFAULT 0;
```

```
disponível = estoque físico − reservado          (a conta que a montagem já cria)

se  disponível ≤ estoque_minimo
    necessidade_ponto = estoque_ideal − disponível
```

Simples, funciona sozinho e não depende de nada estar em dia. É o piso do módulo.

### Gatilho 2 — demanda da produção

Explode a ficha técnica contra o que está planejado para produzir. A entrada é o
mesmo número que o planejamento já usa hoje — venda futura do Mercado Livre e
estoque alvo por SKU:

```
a_produzir(sku)   = alvo(sku) − estoque(sku)   [ou a demanda do período escolhido]
necessidade_dem   = Σ ( quantidade_na_ficha(componente, sku) × a_produzir(sku) )
                    − disponível(componente)
```

O comprador escolhe o horizonte — 15, 30, 60 dias — e o sistema mostra a explosão
aberta: *"precisa de 340 m de tubo, sendo 180 m para a 1,60×1,40 e 160 m para a
1,20×1,00"*. Ver de onde veio o número é o que faz o comprador confiar nele.

### Como os dois se combinam

```
necessidade  =  MAIOR( necessidade_ponto , necessidade_demanda )  −  a_caminho
```

**O maior, nunca a soma.** Se o ponto de pedido pede 100 e a demanda pede 60, a
resposta é 100 — os dois estão descrevendo a mesma falta por caminhos diferentes.
Somar compraria 160 e é o erro clássico do módulo de compras.

```
a_caminho = Σ  itens de pedidos enviados e ainda não recebidos
```

**Descontar o que já está a caminho é obrigatório.** Sem isso o comprador compra
duas vezes toda semana em que o fornecedor atrasa.

### A perda do corte — medida, nunca chutada

O corte de alumínio gera sobra. Mesmo encaixando várias medidas na mesma barra de
6 m, sempre fica ponta. **Ninguém sabe quanto é hoje** — e é honesto assumir isso
em vez de inventar um percentual.

A ficha calcula o **consumo teórico**: se a fórmula diz 1,82 m por peça e saíram 33
peças, o teórico é 60,06 m. O que saiu do estoque de verdade é outro número. A
diferença entre os dois **é a perda**, e ela não precisa de balança nem de
cronômetro — precisa de tempo.

```
consumo_real     = saldo_inicial + entradas − saldo_final
consumo_teorico  = Σ ( quantidade da ficha × peças produzidas )

perda_%          = ( consumo_real − consumo_teorico ) ÷ consumo_teorico
```

O `saldo_inicial` e o `saldo_final` vêm da contagem, que já existe. As entradas vêm
do recebimento. As peças produzidas vêm da montagem. **Os três dados já vão estar
no sistema** — a conta é só a subtração.

```
┌──────────────────────────────────────────────────────────────────────┐
│  PERDA MEDIDA · Tubo 28 mm                        jan → mar (3 meses)│
├──────────────────────────────────────────────────────────────────────┤
│  Consumo teórico pela ficha        60,06 m                           │
│  Consumo real pelo estoque         66,40 m                           │
│  Diferença                        + 6,34 m         ▸  perda 10,6 %   │
│                                                                      │
│  Amostra: 33 peças · 2 contagens · confiança: baixa (< 6 meses)      │
│                                                                      │
│              [ Aplicar 10,6 % na necessidade deste componente ]      │
└──────────────────────────────────────────────────────────────────────┘
```

```sql
ALTER TABLE componente ADD COLUMN perda_pct REAL DEFAULT 0;  -- nasce em zero
```

**Nasce em zero e só muda quando você mandar.** O sistema mede, mostra e sugere; a
decisão de embutir a perda na compra é do comprador. Aplicada, ela entra só na
necessidade:

```
necessidade = MAIOR( ponto , demanda ) × ( 1 + perda_pct )  −  a_caminho
```

E entra **na necessidade, não no custo**. O custo já sabe a verdade sozinho: o
custo médio vem do que foi pago pelo que entrou no estoque, e o consumo real é o
que baixou. A perda já está embutida ali sem ninguém somar nada. Somá-la também no
custo do SKU seria contar a mesma perda duas vezes.

> **Três avisos que o relatório tem que dar, porque um percentual errado aqui vira
> compra errada todo mês:**
>
> - **Amostra pequena mente.** Com duas contagens e 33 peças, 10,6 % pode ser uma
>   contagem malfeita. O relatório mostra o tamanho da amostra e chama a confiança
>   de baixa até ter uns seis meses de história.
> - **Perda negativa é erro, não economia.** Se o real for menor que o teórico, ou
>   a fórmula está superestimando ou faltou lançar produção. O sistema aponta como
>   inconsistência em vez de sugerir um número.
> - **A perda pode ser da fórmula, não do corte.** Se a folga cadastrada estiver
>   abaixo da real, aparece como perda. Antes de aplicar 10 %, vale conferir se não
>   são 10 cm faltando na fórmula.

É a mesma técnica do acerto de fim de rolo do `ESTOQUE-TECIDO-E-SOBRAS.md` §3:
**medir sem instrumento, pela diferença acumulada.** Você tinha razão que só saberia
depois de três meses comprando — o que o sistema faz é garantir que, quando esses
três meses passarem, o número esteja lá esperando em vez de ter que ser reconstruído
de memória.

### A lista de compras

Uma linha por componente com necessidade > 0, agrupável por fornecedor vencedor —
porque comprar 6 itens do mesmo fornecedor é um pedido, não seis.

```
┌───────────────────────────────────────────────────────────────────────┐
│  LISTA DE COMPRAS                       horizonte: 30 dias    [ ⚙ ]   │
├───────────────────────────────────────────────────────────────────────┤
│  🔴 Tubo 28 mm             disp.  12 m   ·  precisa 340 m             │
│      ponto de pedido 80 m · demanda 340 m · a caminho 0               │
│      melhor: Metalúrgica A · 57 barras 6 m · R$ 2.394,00  [ Comparar ]│
│                                                                       │
│  🟠 Parafuso 3,5×25        disp. 380 un  ·  precisa 1.200 un          │
│      ponto de pedido 1.200 un · demanda 940 un · a caminho 0          │
│      melhor: Ferragens D · 3 caixas 500 un · R$ 246,00    [ Comparar ]│
│                                                                       │
│  🟡 Cordão poliéster       disp. 210 m   ·  precisa 60 m              │
│      melhor: Têxtil E · 2 rolos 50 m · R$ 174,00          [ Comparar ]│
│      ⏱ prazo 12 dias — pedir até 24/08                                │
├───────────────────────────────────────────────────────────────────────┤
│  3 itens · R$ 2.814,00 previstos      [ Gerar pedidos por fornecedor ]│
└───────────────────────────────────────────────────────────────────────┘
```

| Cor | Significado |
|---|---|
| 🔴 | disponível abaixo do mínimo **e** demanda no horizonte — falta material |
| 🟠 | abaixo do mínimo, sem demanda imediata |
| 🟡 | acima do mínimo, mas o prazo do fornecedor não cobre a demanda do horizonte |

---

## 8. O dia do comprador

Atuando como comprador, é esta a sequência que o sistema precisa servir:

1. **Abre a lista de compras.** Vê o que falta, por que falta e quanto vai custar.
2. **Abre a comparação de um item.** Vê os fornecedores lado a lado com os três
   números, o prazo e a última vez que aquele preço foi confirmado.
3. **Escolhe.** Aceita o vencedor ou escolhe outro dando o motivo em uma linha.
4. **Gera o pedido**, agrupado por fornecedor, e envia — **PDF** para imprimir ou
   anexar, e **texto pronto para colar no WhatsApp**, que é como a maior parte dos
   fornecedores pequenos realmente recebe pedido. Envio por e-mail direto do
   servidor fica para depois; ele exige configuração e não destrava nada hoje.
5. **A mercadoria chega e o Recebimento confere** — só quantidade, sem ver preço.
   O comprador lança o preço da nota depois, e a divergência fica registrada.
6. **No fim do mês**, olha o relatório de custo: quais SKUs subiram, por causa de
   qual componente, e de qual fornecedor.

A tela de comparação:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  TUBO 28 mm                              necessidade 340 m               │
├──────────────────────────────────────────────────────────────────────────┤
│                        R$/m    compra          desembolso  sobra  prazo  │
│  ✓ Metalúrgica A      7,00 ▼   57 × barra 6m   R$ 2.394,00    2m  14 d   │
│      ↳ mais barato por metro · preço de 02/08                            │
│      ↳ ⏱ chega 14/09, depois da produção prevista —                      │
│         Metalúrgica B chega a tempo por R$ 342,00 a mais                 │
│    Metalúrgica B      8,00 ▲   114 × barra 3m  R$ 2.736,00    2m   5 d   │
│    Distribuidora C    9,50 —   340 m           R$ 3.230,00    0m   3 d   │
│      ↳ preço de 11/01 · confirmar antes de pedir                         │
├──────────────────────────────────────────────────────────────────────────┤
│      [ Escolher e adicionar ao pedido ]        [ Lançar novo preço ]     │
└──────────────────────────────────────────────────────────────────────────┘
```

Os três detalhes que fazem essa tela funcionar: **▲▼ é a variação desde o último
preço**, **a data do preço aparece sempre** (preço de janeiro não merece a mesma
confiança que preço de duas semanas atrás), e **o aviso de prazo aparece na linha
do fornecedor**, não em um canto.

### O recebimento, em dois papéis

Quem pede não é quem confere. É o controle mais básico de compras, e sai de graça
porque o controle de acesso já existe:

| Papel | Vê | Faz |
|---|---|---|
| **Recebimento** (operação) | o que está a caminho, item e quantidade — **sem preço** | confere a quantidade que chegou e registra divergência |
| **Comprador** (admin) | tudo | lança o preço da nota, resolve divergência, fecha o pedido |

A tela do recebimento é uma estação de operação e segue o contrato dos quatro
blocos do `ARQUITETURA-ALVO.md` §8 — mesma linguagem da bancada, botão grande,
sem digitação livre onde der para evitar.

```
┌──────────────────────────────────────────────────────────┐
│  RECEBIMENTO — PC-000142 · Metalúrgica A                 │
├──────────────────────────────────────────────────────────┤
│   Tubo 28 mm                                             │
│   Pedido: 57 barras de 6 m                               │
│                                                          │
│   Chegou quantas?      ┌─────────┐                       │
│                   [−]  │   40    │  [+]                  │
│                        └─────────┘                       │
│                                                          │
│   ⚠ 17 barras a menos que o pedido                       │
│                                                          │
│        [ Cancelar ]         [ Confirmar ]                │
└──────────────────────────────────────────────────────────┘
```

### Recebimento parcial: o pedido continua aberto

Chegaram 40 das 57 barras. O que acontece:

```
40 barras (240 m)  →  entram no estoque agora, com movimento registrado
17 barras (102 m)  →  continuam contando como "a caminho"
pedido             →  status 'parcial', continua aberto
```

**A próxima lista de compras não manda comprar de novo o que ainda vem** — é para
isso que o *a caminho* existe. E o saldo em aberto é o que você cobra do
fornecedor: sem ele, a falta some do sistema e vira uma conversa de memória.

O pedido parcial só fecha quando alguém fecha, com um dos dois motivos:
*"o restante chegou"* ou *"o fornecedor não vai entregar"* — e no segundo caso o
saldo volta para a necessidade na mesma hora.

> **Pedido zumbi.** Um pedido parcial esquecido segura quantidade no *a caminho*
> para sempre, e o sistema para de mandar comprar um item que está faltando. Por
> isso a lista de compras mostra, no topo, *"3 pedidos parciais há mais de 30
> dias"* — um lembrete, não um fechamento automático.

### Devolução ao fornecedor, na mesma tela

Chegou material com defeito ou fora da medida. Quem confere marca cada item como
**recebido** ou **devolvido**, com motivo:

```
Tubo 28 mm — chegaram 40 barras

   [ ✓ Recebi 40 ]        [ ↩ Devolvi ___ ]

   Motivo da devolução:
   ( ) fora da medida   ( ) defeito   ( ) veio errado   ( ) quantidade a mais
```

O que volta **não entra no estoque** e continua contando como *a caminho*, porque o
fornecedor ainda deve. É pouca tela a mais e evita o erro que mais estraga estoque
novo: dar entrada em material que foi embora no mesmo caminhão.

E como a devolução fica registrada com motivo e fornecedor, em alguns meses ela
vira um relatório que hoje não existe — **qual fornecedor entrega errado**. É o
mesmo raciocínio do acerto de fim de rolo do `ESTOQUE-TECIDO-E-SOBRAS.md` §3:
medir sem balança, pelo histórico.

### A nota fiscal: número e data

O recebimento pede **número e data da nota**, digitados. É o que amarra o que
chegou ao documento, e o que o contábil precisa para achar depois.

Anexar o PDF ou o XML ficaria melhor e cobra caro: guardar arquivo no servidor puxa
espaço, backup e uma decisão de retenção. A nota continua vivendo onde já vive; o
sistema guarda o ponteiro.

### O ciclo termina aqui

**Compras vai até o recebimento, mais uma marca de pago.**

O sistema sabe o que foi pedido, o que chegou, o que voltou, por quanto, e se já
foi pago. O que ele **não** sabe: vencimento, saldo em aberto por fornecedor, fluxo
de caixa, conciliação bancária. Isso é contas a pagar, é outro módulo com outro
dono, e colocá-lo aqui atrasaria o que você pediu primeiro — comprar melhor, não
pagar melhor.

```sql
ALTER TABLE pedido_compra ADD COLUMN pago_em  TEXT;
ALTER TABLE pedido_compra ADD COLUMN pago_por TEXT;
```

Duas colunas e uma permissão. É o suficiente para o papel Financeiro existir de
verdade desde o primeiro dia — e é onde a fronteira fica. Se alguém pedir uma tela
de "o que vence esta semana", a resposta é que o módulo saiu do escopo.

### A contagem de componente é a mesma dos SKUs

O estoque de componente vai furar — sobra de barra, perda na bancada, contagem que
ninguém fez. A correção usa **o fluxo de contagem que já existe**: o operador
conta, o ajuste fica pendente, o admin aprova.

Uma mecânica só no sistema inteiro. O ajuste já nasce auditado, já respeita o
`contagem.ajustar` de quem aplica direto, e não há uma segunda tela de contagem
para manter em dia. A `contagem_pendente` ganha uma coluna de tipo e passa a
aceitar componente além de SKU — é uma coluna, não um módulo.

---

## 9. Modelo de dados

Continua o schema do `PRODUCAO-MONTAGEM.md` §6. O campo `unidade` do `componente`
passa a ser lido como **unidade de consumo** — nada muda na tabela.

```sql
-- ─── FORNECEDOR ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fornecedor (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nome           TEXT NOT NULL,
  cnpj           TEXT,
  contato        TEXT,
  telefone       TEXT,
  email          TEXT,
  prazo_entrega  INTEGER,             -- dias corridos, padrão do fornecedor
  pedido_minimo  REAL DEFAULT 0,      -- R$ do pedido inteiro
  pagamento      TEXT,                -- 'à vista' | '28 dias' | '30/60/90' — informa, não ordena
  frete_padrao   REAL DEFAULT 0,      -- rateado por valor entre os itens do pedido
  regime         TEXT,                -- simples|presumido|real|mei — só para o aviso
  whatsapp       TEXT,                -- para onde vai o texto do pedido
  observacao     TEXT,
  ativo          INTEGER DEFAULT 1,
  criado_em      TEXT DEFAULT (datetime('now','localtime'))
);

-- ─── OFERTA: fornecedor × item × embalagem ─────────────────────
-- Uma linha por forma de comprar. O mesmo fornecedor pode ter várias.
CREATE TABLE IF NOT EXISTS oferta (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  fornecedor_id  INTEGER NOT NULL REFERENCES fornecedor(id),
  componente_id  INTEGER REFERENCES componente(id),
  sku            TEXT,                -- para SKU de revenda
  codigo_fornec  TEXT,                -- o código dele, vai impresso no pedido
  embalagem      TEXT NOT NULL,       -- 'barra 6 m' · 'pacote 100 un' · 'metro'
  fator          REAL NOT NULL DEFAULT 1,   -- un. de consumo por embalagem
  preco          REAL NOT NULL,       -- R$ por embalagem — o preço vigente
  multiplo       REAL DEFAULT 1,      -- só vende de N em N embalagens
  qtd_minima     REAL DEFAULT 1,      -- mínimo de embalagens por pedido
  frete          REAL DEFAULT 0,      -- frete fixo do item, se cobrado à parte
  prazo_entrega  INTEGER,             -- sobrepõe o do fornecedor
  atualizado_em  TEXT DEFAULT (datetime('now','localtime')),
  atualizado_por TEXT,
  ativo          INTEGER DEFAULT 1,
  CHECK ( (componente_id IS NULL) <> (sku IS NULL) )   -- exatamente um dos dois
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oferta_comp
  ON oferta(fornecedor_id, componente_id, embalagem) WHERE componente_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_oferta_sku
  ON oferta(fornecedor_id, sku, embalagem)           WHERE sku IS NOT NULL;

-- ─── HISTÓRICO DE PREÇO ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS preco_historico (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  oferta_id     INTEGER REFERENCES oferta(id),
  preco_antigo  REAL,
  preco_novo    REAL NOT NULL,
  variacao_pct  REAL,
  fonte         TEXT,          -- cadastro | compra | reajuste
  referencia    TEXT,          -- nº do pedido, quando fonte='compra'
  usuario_nome  TEXT,
  criado_em     TEXT DEFAULT (datetime('now','localtime')),
  data          TEXT DEFAULT (date('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_preco_hist ON preco_historico(oferta_id, data);

-- ─── PEDIDO DE COMPRA ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedido_compra (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  numero         TEXT UNIQUE,          -- PC-000142
  fornecedor_id  INTEGER REFERENCES fornecedor(id),
  status         TEXT DEFAULT 'rascunho', -- rascunho|enviado|parcial|recebido|cancelado
  valor_previsto REAL,
  valor_pago     REAL,
  frete          REAL DEFAULT 0,
  previsao       TEXT,                 -- data prevista de entrega
  observacao     TEXT,
  criado_por     TEXT,
  criado_em      TEXT DEFAULT (datetime('now','localtime')),
  enviado_em     TEXT,
  enviado_por    TEXT,                 -- pdf | whatsapp | outro
  fechado_em     TEXT,
  motivo_fecho   TEXT,                 -- 'restante chegou' | 'fornecedor não entrega'
  data           TEXT DEFAULT (date('now','localtime')),
  teste          INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pedido_item (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id      INTEGER REFERENCES pedido_compra(id),
  oferta_id      INTEGER REFERENCES oferta(id),
  componente_id  INTEGER REFERENCES componente(id),
  sku            TEXT,
  embalagem      TEXT,        -- congelada no momento do pedido
  fator          REAL,        -- congelado
  preco_unit     REAL,        -- R$ por embalagem, congelado
  qtd_embalagem  REAL,        -- quantas barras / pacotes
  qtd_consumo    REAL,        -- qtd_embalagem × fator
  qtd_recebida   REAL DEFAULT 0,   -- em unidades de consumo
  preco_pago     REAL,             -- preenchido no recebimento
  motivo_escolha TEXT,             -- por que não foi o vencedor, quando não foi
  status         TEXT DEFAULT 'aberto'  -- aberto|parcial|recebido|cancelado
);
CREATE INDEX IF NOT EXISTS idx_pedido_item_aberto
  ON pedido_item(componente_id, status);

-- ─── RECEBIMENTO ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recebimento (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id     INTEGER REFERENCES pedido_compra(id),
  nota_fiscal   TEXT,        -- número, digitado
  nota_data     TEXT,        -- data da nota, digitada
  recebido_por  TEXT,
  criado_em     TEXT DEFAULT (datetime('now','localtime')),
  data          TEXT DEFAULT (date('now','localtime'))
);

CREATE TABLE IF NOT EXISTS recebimento_item (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  recebimento_id INTEGER REFERENCES recebimento(id),
  pedido_item_id INTEGER REFERENCES pedido_item(id),
  qtd_embalagem  REAL,
  qtd_consumo    REAL,       -- entra no estoque
  qtd_devolvida  REAL DEFAULT 0,   -- NÃO entra no estoque, segue como 'a caminho'
  motivo_devolucao TEXT,     -- fora_medida|defeito|veio_errado|qtd_a_mais
  preco_pago     REAL,       -- R$ por embalagem, o que veio na nota
  divergencia    TEXT        -- nenhuma|quantidade|preco|ambos
);
CREATE INDEX IF NOT EXISTS idx_receb_devol
  ON recebimento_item(motivo_devolucao) WHERE qtd_devolvida > 0;

-- ─── MOVIMENTO DE COMPONENTE ───────────────────────────────────
-- Mesma regra do movimento_estoque: o número atual é conveniência,
-- a história é a verdade. Único dono: dominio/componente.js
CREATE TABLE IF NOT EXISTS movimento_componente (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  componente_id INTEGER REFERENCES componente(id),
  delta         REAL,
  saldo_apos    REAL,
  motivo        TEXT,   -- recebimento|embalagem|perda|ajuste|contagem|devolucao
  referencia    TEXT,
  custo_unit    REAL,   -- só na entrada — alimenta o custo médio
  usuario_id    INTEGER,
  usuario_nome  TEXT,
  criado_em     TEXT DEFAULT (datetime('now','localtime')),
  data          TEXT DEFAULT (date('now','localtime')),
  teste         INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_mov_comp ON movimento_componente(componente_id, data);

-- ─── COMPONENTE: campos novos ──────────────────────────────────
ALTER TABLE componente ADD COLUMN estoque_minimo     REAL DEFAULT 0;
ALTER TABLE componente ADD COLUMN estoque_ideal      REAL DEFAULT 0;
ALTER TABLE componente ADD COLUMN sobra_aproveitavel INTEGER DEFAULT 1;
ALTER TABLE componente ADD COLUMN custo_medio        REAL DEFAULT 0;

-- ─── SKU: tipo de custo, modelo e medidas ──────────────────────
-- (as três últimas estão detalhadas na §3 — repetidas aqui para o schema
--  ficar completo em um lugar só)
ALTER TABLE skus ADD COLUMN tem_ficha    INTEGER DEFAULT 1;
ALTER TABLE skus ADD COLUMN custo_direto REAL;
ALTER TABLE skus ADD COLUMN modelo_id    INTEGER REFERENCES modelo(id);
ALTER TABLE skus ADD COLUMN largura_cm   INTEGER;
ALTER TABLE skus ADD COLUMN altura_cm    INTEGER;
ALTER TABLE skus ADD COLUMN cor          TEXT;

-- ─── COMPONENTE: família, cor e largura de bobina ──────────────
ALTER TABLE componente ADD COLUMN familia           TEXT;     -- 'tecido_blackout'
ALTER TABLE componente ADD COLUMN cor               TEXT;     -- 'BRANCO'
ALTER TABLE componente ADD COLUMN largura_bobina_cm INTEGER;  -- 250
CREATE UNIQUE INDEX IF NOT EXISTS idx_comp_variante
  ON componente(familia, cor, largura_bobina_cm) WHERE familia IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comp_resolve
  ON componente(familia, cor, largura_bobina_cm, ativo);

-- ─── COR: lista fechada, compartilhada por SKU e componente ────
CREATE TABLE IF NOT EXISTS cor (
  codigo TEXT PRIMARY KEY,     -- 'BEGE'
  nome   TEXT,                 -- 'Bege'
  ativa  INTEGER DEFAULT 1
);

-- ─── CONTAGEM: passa a aceitar componente ──────────────────────
-- Uma coluna, não um módulo. O fluxo (conta → pendente → admin aprova)
-- é exatamente o mesmo do CONTROLE-DE-ACESSO.md §9.
ALTER TABLE contagem_pendente ADD COLUMN tipo TEXT DEFAULT 'sku';  -- sku|componente
```

### Consultas que sustentam o módulo

```sql
-- Disponível de um componente (já definido na montagem, repetido aqui por clareza)
SELECT c.estoque - COALESCE(SUM(r.quantidade),0) AS disponivel
FROM componente c
LEFT JOIN componente_reserva r
  ON r.componente_id = c.id AND r.status = 'reservado'
WHERE c.id = ? GROUP BY c.id;

-- A caminho: pedidos enviados e ainda não recebidos
SELECT componente_id, SUM(qtd_consumo - qtd_recebida) AS a_caminho
FROM pedido_item i
JOIN pedido_compra p ON p.id = i.pedido_id
WHERE p.status IN ('enviado','parcial') AND i.status IN ('aberto','parcial')
GROUP BY componente_id;

-- Custo de um SKU pela ficha
SELECT SUM(f.quantidade * melhor_preco_unitario(f.componente_id)) AS custo
FROM ficha_tecnica f WHERE f.sku = ?;
```

`melhor_preco_unitario` é função do domínio, não SQL — ela aplica múltiplo, mínimo
e a regra de `sobra_aproveitavel`. **Custo de SKU nunca é calculado em duas partes
do sistema.**

---

## 10. Permissões

Uma linha por permissão no registro (`permissoes.js`), conforme a regra 5 do
controle de acesso — a caixinha aparece sozinha na tela de cadastro.

```js
// ─── COMPRAS ────────────────────────────────────────────────
{ chave:'compras.ver',          grupo:'Compras', nivel:'supervisor',
  rotulo:'Ver lista de compras', desc:'O que precisa ser comprado' },
{ chave:'fornecedor.cadastrar', grupo:'Compras', nivel:'admin',
  rotulo:'Cadastrar fornecedor', desc:'Criar e editar fornecedores' },
{ chave:'preco.lancar',         grupo:'Compras', nivel:'admin',
  rotulo:'Lançar preço',        desc:'Cadastrar e atualizar preço de fornecedor' },
{ chave:'pedido.criar',         grupo:'Compras', nivel:'admin',
  rotulo:'Criar e enviar pedido', desc:'Gerar pedido de compra ao fornecedor',
  sensivel:true },
{ chave:'pedido.ver',           grupo:'Compras', nivel:'operacao',
  rotulo:'Ver pedidos em aberto', desc:'O que está a caminho, sem preço' },
{ chave:'pedido.receber',       grupo:'Compras', nivel:'operacao',
  rotulo:'Registrar recebimento', desc:'Conferir a entrega e dar entrada no estoque' },
{ chave:'pedido.devolver',      grupo:'Compras', nivel:'operacao',
  rotulo:'Devolver ao fornecedor', desc:'Recusar item na conferência, com motivo' },
{ chave:'pedido.pagar',         grupo:'Compras', nivel:'admin',
  rotulo:'Marcar pedido como pago', desc:'Fecha o ciclo — não é contas a pagar',
  sensivel:true },
{ chave:'custo.ver',            grupo:'Compras', nivel:'admin',
  rotulo:'Ver custo do produto', desc:'Custo por SKU e evolução',
  sensivel:true },
{ chave:'minimo.definir',       grupo:'Estoque', nivel:'admin',
  rotulo:'Definir estoque mínimo', desc:'Ponto de pedido e estoque ideal por componente' },

// ─── PLANEJAMENTO ───────────────────────────────────────────
{ chave:'modelo.cadastrar',     grupo:'Planejamento', nivel:'admin',
  rotulo:'Cadastrar modelo de produto', desc:'Linhas de produto e suas fórmulas' },
```

O `ficha.editar` já declarado no `PRODUCAO-MONTAGEM.md` §7 continua com o mesmo
nome e ganha um significado maior: ele passa a editar **a fórmula do modelo**, não
uma lista por SKU. Quem tem a permissão hoje continua tendo — mas a tela que ela
abre muda, e é bom saber disso antes de conceder.

### Setores novos

| Setor | Nível | Permissões |
|---|---|---|
| **Comprador** | admin | compras.ver, fornecedor.cadastrar, preco.lancar, pedido.criar, pedido.ver, custo.ver, minimo.definir, componente.cadastrar, ficha.editar, modelo.cadastrar |
| **Recebimento** | operação | pedido.ver, pedido.receber, pedido.devolver |
| **Financeiro** | admin | pedido.ver, pedido.pagar |

### Os três papéis nascem separados, mesmo sendo uma pessoa só

Hoje quem compra, quem confere e quem paga é você. **Os três setores nascem assim
mesmo**, e você fica marcado nos três. O dia em que entrar alguém para receber, é
desmarcar uma caixa — não redesenhar o módulo.

```
COMPRADOR      cota · escolhe · pede           vê preço, vê custo
RECEBIMENTO    confere · devolve · dá entrada  NÃO vê preço
FINANCEIRO     confere a nota · marca pago     vê preço, NÃO cota nem recebe
```

Isso tem nome: **segregação de funções**. A mesma pessoa pedir, conferir e pagar é
o desenho em que um erro nunca encontra quem o pegue — e não é sobre desconfiar de
ninguém, é sobre o erro honesto passar batido. Enquanto for você nos três papéis, a
proteção que sobra é a auditoria, que registra tudo de qualquer jeito.

> **`pedido.pagar` é uma marca, não um módulo financeiro.** Ela grava *pago em* e
> mais nada — sem vencimento, sem fluxo de caixa, sem conciliação. Existe para o
> comprador enxergar que o ciclo fechou e para o papel Financeiro ter o que fazer
> desde o primeiro dia. Contas a pagar de verdade continua fora (§8).

> A separação entre `compras.ver` (supervisor) e `pedido.ver` (operação) existe por
> causa da regra 1 do controle de acesso: **um setor de nível operação não aceita
> permissão declarada acima do seu nível.** Quem recebe precisa saber o que está
> chegando; não precisa ver a lista de compras nem os preços comparados.

**O Recebimento não vê preço em lugar nenhum.** Nem na tela de conferência, nem no
pedido, nem no PDF que ele eventualmente abrir. Quem confere quantidade conferindo
valor tende a confirmar o que está escrito — e a separação entre quem pede e quem
confere perde o sentido.

**A contagem de componente não cria permissão nova.** Ela usa as que já existem
(`contagem.*` do `CONTROLE-DE-ACESSO.md` §9), agora aceitando componente além de
SKU. Quem conta hoje passa a poder contar insumo sem nenhum cadastro adicional.

**`custo.ver` é sensível.** Custo do produto é a informação mais estratégica do
sistema — mais que produtividade nominal. Ela não vaza por padrão: quem opera não
enxerga, e todo acesso passa pela auditoria.

Ambos os setores **nascem vazios**, como o de montagem. Ninguém é migrado.

### Auditoria — categoria nova: **Compras**

| Ação | Registra |
|---|---|
| Fornecedor criado ou desativado | sim |
| Preço alterado | **sim** — antigo, novo, variação, fonte |
| Pedido criado / enviado / cancelado | sim — valor e fornecedor |
| Escolha diferente do melhor preço | **sim** — com o motivo |
| Recebimento com divergência de preço ou quantidade | **sim** |
| Pedido parcial fechado sem o restante | **sim** — com o motivo |
| Estoque mínimo alterado | sim |
| Entrada de componente por recebimento | sim |
| Consulta ao custo do produto | **sim** — sensível, como a produtividade nominal |
| Lista de compras aberta | não — é leitura, geraria volume |

---

## 11. A forma: este módulo nasce na arquitetura-alvo

Compras é a **primeira oportunidade de um módulo nascer certo**. Ele não tem
código legado, então não há nada a migrar — e repetir a forma antiga aqui seria
criar dívida de propósito.

```
dominio/
  compras.js        necessidade, comparação, escolha do melhor preço
  fornecedor.js     cadastro e ofertas
  preco.js          preço vigente + histórico (único dono de oferta.preco)
  pedido.js         pedido e recebimento
  componente.js     ← único dono de componente.estoque e movimento_componente
  custo.js          custo do SKU pela ficha ou direto + histórico
  modelo.js         modelos de produto e suas fórmulas
  formula.js        ← o avaliador. Sem eval(). Única porta de execução
  ficha.js          fórmula + medidas → ficha_tecnica materializada

dados/
  fornecedor.js · oferta.js · preco_historico.js
  pedido.js · recebimento.js · movimento_componente.js
  modelo.js · ficha_formula.js

rotas/
  compras.js        declarações — sem SQL, sem `if` de negócio

public/telas/
  compras/  lista · comparacao · pedidos · recebimento
  admin/    fornecedores · componentes · modelos · formulas
  relatorios/ custo
```

O que isso obriga, e que vale explicitar:

1. **`componente.estoque` só muda por `dominio/componente.js`**, com movimento
   registrado. É a mesma regra que a arquitetura-alvo impõe ao `skus.estoque` — e
   aqui ela nasce cumprida em vez de ser conquistada em uma fase de migração.
2. **Rotas declaradas com `permissao` e `auditoria`.** Nenhum `app.post` direto.
3. **Nenhum hex nas telas.** As de compras usam `tema-admin` do `base.css`.
4. **A tela de recebimento é uma estação de operação** — segue o contrato dos
   quatro blocos e usa `bipe.js` se vier a bipar código de fornecedor.
5. **A fórmula tem um avaliador só.** `dominio/formula.js` é a única porta por onde
   uma expressão é executada, e ela não usa `eval()`. Se aparecer um segundo lugar
   avaliando fórmula, é o defeito — do mesmo tipo que os nove donos do
   `skus.estoque`.

---

## 12. Ordem de implementação

Você pediu o ciclo completo. Ele continua sendo entregue por fases, e **cada fase
tem valor sozinha** — é isso que evita seis semanas sem nada funcionando.

| Fase | O quê | Valor sozinha |
|---|---|---|
| **0** | **Medidas viram campos.** Lista fechada de cores migrada dos SKUs existentes; `largura_cm`, `altura_cm`, `cor` e `modelo_id` no SKU; passe de migração lendo os códigos; lista de *medida pendente* | Não muda nada visível, mas destrava tudo — e já corrige a leitura de SKU espalhada |
| **1** | Cadastro de fornecedor, oferta (embalagem/fator/preço), `tem_ficha` do SKU e custo direto | Responde *"quanto custa o que eu revendo"* |
| **2** | **Modelos + fórmulas** com validação e teste na tela, resolução por cor e largura de bobina, `ficha_tecnica` materializada, e a **comparação de fornecedores** | **O coração.** Responde *"de quem comprar"* e *"quanto custa a persiana"* |
| **3** | Estoque mínimo e ideal + **lista de compras por ponto de pedido** | Responde *"o que comprar"* sem depender do planejamento |
| **4** | **Pedido de compra** por fornecedor, com frete rateado, saída em **PDF e texto de WhatsApp**, status e o desconto do *a caminho* | Fecha o ciclo da decisão; para de comprar duas vezes |
| **5** | **Recebimento** pelo setor próprio: conferência sem preço, parcial, **devolução com motivo**, número e data da nota, entrada no estoque, preço pago vira histórico e move o **custo médio** · componente entra na contagem existente | O estoque de componentes passa a ser real |
| **6** | Necessidade por **demanda** (explosão da ficha contra o planejamento) | Compra deixa de ser reativa |
| **7** | **Relatórios**: evolução de custo por SKU, componente causador, ganho da escolha, e a **perda de corte medida** por componente | Responde *"estamos economizando?"* e *"quanto o corte está perdendo?"* |

**A fase 2 é o MVP.** Ela sozinha entrega o que você descreveu como o objetivo:
ficha técnica, vários fornecedores por item, embalagens diferentes e o melhor
preço calculado. Tudo depois disso é o ciclo em volta dela.

**A fase 0 é curta e vem antes de tudo.** Ela não entrega nada que se veja, e é a
única que não dá para adiar: sem largura e altura como coluna, a fórmula não tem
de onde ler. Como ela também substitui a leitura do código por um campo gravado,
ela paga sozinha uma dívida que a auditoria já tinha registrado.

**Dependência externa:** a fase 5 precisa que a baixa de componente na embalagem
exista (fase 6 do `PRODUCAO-MONTAGEM.md`), senão o estoque de componente só sobe.
A fase 6 precisa do planejamento por estoque alvo, que já existe.

---

## 13. Regras que não podem ser quebradas

1. **A unidade de compra mora na oferta, não no componente.** O mesmo item tem
   embalagens diferentes em fornecedores diferentes.
2. **Nunca se compra fração de embalagem.** A quantidade sempre sobe para o
   múltiplo e respeita o mínimo do fornecedor.
3. **O ranking mostra sempre os três números** — preço por unidade, desembolso e
   sobra. Ordenar por um só, escondendo os outros, é como o comprador é enganado.
4. **Custo indefinido nunca vira zero.** Ficha pendente e custo pendente aparecem
   como pendência, não como R$ 0,00.
5. **Toda mudança de preço deixa histórico.** Sem exceção — nem a atualização em
   lote.
6. **O preço pago no recebimento manda** sobre o preço de tabela, e atualiza a
   oferta.
7. **A necessidade é o maior dos dois gatilhos, não a soma**, e sempre desconta o
   que está a caminho.
8. **A necessidade usa o disponível** (físico − reservado), nunca o físico.
9. **O pedido congela embalagem, fator e preço** no momento em que é criado —
   mesma regra da reserva congelar a ficha técnica.
10. **`componente.estoque` só muda por `dominio/componente.js`**, e todo movimento
    deixa registro.
11. **Escolha diferente do melhor preço exige motivo**, e o motivo vai para a
    auditoria.
12. **Preço cadastrado é sempre sem impostos.** Uma convenção só, no sistema todo.
13. **O frete é rateado por valor e a tela mostra com e sem.** Quando o frete
    inverte a ordem, o sistema escreve isso.
14. **Quem recebe não vê preço.** Em nenhuma tela, em nenhum PDF.
15. **Recebimento parcial mantém o pedido aberto**, e só fecha com motivo escrito.
16. **O custo médio só se move no recebimento**, dentro de
    `dominio/componente.js`. Nenhum outro lugar recalcula.
17. **Enquanto a mão de obra for zero, o número se chama "custo de material"** —
    nunca "custo do produto".
18. **A ficha é a fórmula do modelo.** SKU não tem ficha própria; o que ele tem é
    medida. Componente se lança no modelo, uma vez — nunca SKU a SKU.
19. **Largura, altura e cor são colunas.** O código do SKU é atalho de digitação,
    nunca fonte da verdade em runtime.
20. **A folga técnica mora dentro da fórmula**, com a razão escrita na observação.
21. **Nenhuma expressão passa por `eval()`.** Só `dominio/formula.js` executa
    fórmula, e ele recusa qualquer coisa fora da lista.
22. **Fórmula não salva sem passar no teste de três medidas.**
23. **Componente é fixo por modelo.** Variação de componente vira modelo novo, não
    condicional dentro da fórmula.
24. **Tecido se mede em metro linear.** O m² é derivado, nunca digitado — mesma
    regra do `ESTOQUE-TECIDO-E-SOBRAS.md` §3.
25. **A largura da persiana não entra na quantidade de tecido** — entra na escolha
    da bobina.
26. **Cor é lista fechada**, compartilhada por SKU e componente. Texto livre em cor
    quebra a resolução da fórmula em silêncio.
27. **Enquanto os módulos estiverem separados, o retalho do ML é perda, não
    crédito.** Nada volta ao estoque e não há busca de sobra antes do corte.
28. **Material devolvido não entra no estoque** e continua contando como *a
    caminho* — o fornecedor ainda deve.
29. **O ciclo termina no recebimento, mais a marca de pago.** Vencimento, saldo em
    aberto e fluxo de caixa são de contas a pagar. Se aparecer uma tela de "o que
    vence esta semana", o módulo saiu do escopo.
30. **Os três papéis nascem separados** — quem pede, quem confere e quem paga —
    mesmo enquanto forem a mesma pessoa.
31. **A perda de corte é medida, nunca chutada.** `perda_pct` nasce em zero, o
    sistema mede pela diferença entre consumo teórico e real, e só muda quando o
    comprador mandar.
32. **A perda entra na necessidade, não no custo.** O custo já a contém pelo
    consumo real — somá-la de novo é contar duas vezes.

---

## 14. O que ainda precisa ser decidido

**Nada bloqueia o início.** As quatro perguntas que restavam foram respondidas
nesta rodada:

| Pergunta | Resposta | O que mudou no desenho |
|---|---|---|
| Componentes com sobra inaproveitável? | O alumínio gera sobra e **ninguém sabe quanto** | Em vez de chutar um percentual, o sistema **mede a perda pela diferença** entre consumo teórico e real (§7). `perda_pct` nasce em zero |
| Componente com lote ou validade? | **Não existe** | Controle de lote sai do radar. Uma preocupação a menos |
| Quantos fornecedores e componentes? | **~30 componentes, ~5 fornecedores** | A tela de comparação é uma lista simples, sem busca nem paginação. O cadastro inteiro da fase 1 é trabalho de um dia, não de um mês |
| Quem opera compras? | **Só você hoje**, mas os papéis já separados | Três setores nascem prontos — Comprador, Recebimento e Financeiro — com você marcado nos três (§10) |

### O que a escala muda, concretamente

Trinta componentes e cinco fornecedores é um número pequeno, e isso tem
consequências boas que vale escrever para ninguém superdimensionar depois:

- **A comparação cabe numa tela.** Cinco fornecedores por item, no máximo. Nenhuma
  busca, nenhum filtro, nenhuma paginação.
- **O cadastro da fase 1 é uma tarde.** Cinco fornecedores e talvez sessenta ofertas
  (componente × fornecedor × embalagem). Não é o gargalo do projeto.
- **A lista de compras nunca passa de trinta linhas.** Dá para mostrar tudo de uma
  vez, sem agrupar por urgência.
- **O gargalo real é a fórmula dos modelos**, não o cadastro de compras.

---

### Decisões fechadas até aqui

**Preço e comparação** — melhor preço pelo custo real da compra fechada · a
embalagem mora na oferta do fornecedor, não no componente · os três números sempre
visíveis (preço unitário, desembolso, sobra) · frete rateado por valor, com aviso
quando inverte a ordem · preço sem impostos, com aviso de regime · condição de
pagamento informa e não ordena · escolha fora do melhor preço exige motivo.

**Custo** — preço fixo no cadastro, com histórico gravado sozinho · o preço pago no
recebimento manda e atualiza a oferta · custo vigente **e** custo médio, com a
margem do ML usando o vigente · mão de obra fora agora, com a coluna já criada ·
custo indefinido nunca vira zero.

**Necessidade** — estoque mínimo **e** demanda, sempre o maior dos dois e nunca a
soma · desconta o que está a caminho · usa o disponível (físico − reservado) ·
perda de corte medida pela diferença, aplicada só quando o comprador mandar, e só
na necessidade.

**Papéis** — Comprador, Recebimento e Financeiro nascem separados mesmo com uma
pessoa só · quem recebe não vê preço · `pedido.pagar` é uma marca, não um módulo
financeiro.

**Pedido e recebimento** — pedido congela embalagem, fator e preço · saída em PDF e
texto de WhatsApp · sem aprovação por valor · recebimento por setor próprio, sem
ver preço · parcial mantém o pedido aberto · devolução com motivo, sem entrar no
estoque · nota fiscal em número e data · **o ciclo termina aqui**.

**Ficha e cadastro** — o SKU **tem ficha técnica ou não tem**, e é o cadastro que
responde · componente se lança no modelo, nunca SKU a SKU · a ficha é fórmula do
modelo de produto · largura, altura e
cor viram colunas do SKU em centímetros, com o código virando atalho · folga escrita
dentro da fórmula · componente resolvido por família, cor e largura de bobina ·
cores em lista fechada · tecido em metro linear, com o retalho no custo · um tecido
por modelo · componente fixo por modelo, sem faixas.

---

## 15. O que este módulo destrava

- **Margem real no Mercado Livre.** Preço de venda − custo do SKU − taxa − frete.
- **Decidir fabricar ou comprar pronto**, com número em vez de sensação.
- **Enxergar o aumento no dia em que ele acontece**, e não no fechamento do ano.
- **Parar de faltar material na bancada** — que é o custo invisível mais caro de
  todos, porque ele para a linha inteira.
