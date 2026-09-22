# Sob medida — pedido da revenda, ficha técnica e produção bipada

```
STATUS
Situação: em construção
Criada em: 22/09/2026
Última atualização: 22/09/2026
Fase atual: 1 PRONTA e CONFERIDA em produção (22/09/2026)
Fases: 1 ☑  2 ☐  3 ☐  4 ☐  5 ☐  6 ☐  7 ☐  8 ☐
Risco: 🔴 (schema novo, preço, etiqueta de produção, acesso de gente de fora)
Módulo: sob medida (tecido/) — ler tecido/README.md antes de mexer
Mudanças no caminho: 5 (fase 1) — ver abaixo
```

## STATUS DA FASE 1 — implementada em 22/09/2026

**Entregue:** migração 16 do `tecido/nucleo/schema.js` (oito tabelas `sm_*` e o
cadastro inicial do Rolô), `tecido/dominio/persiana.js` (o dono único),
`tecido/dominio/catalogo_sm.js`, `tecido/nucleo/unidade.js`, as rotas, as telas
`/sobmedida/catalogo` e `/sobmedida/simulador`, e 52 casos de teste novos
(`npm test` do módulo: **304 casos**).

> ✅ **CONFERIDA EM PRODUÇÃO EM 22/09/2026.** O dono fez o deploy e simulou
> **dez persianas reais do WhatsApp: as dez bateram** — tubo, medidas de corte e
> kit, contra o que a fábrica cortaria. É o "pronto quando" da seção 7, e é a
> régua que vale.
>
> ⚠️ **E ESTÁ ESCRITO ASSIM DE PROPÓSITO.** Os 304 casos verdes, os 133+45 do
> kit e o R$ 209,00 conferido pelo fio eram **indício**, não prova: o defeito do
> QR da etiqueta do kit passou por três rodadas verdes antes de o dono descobrir
> com o celular na mão (`CLAUDE.md` §4). Teste diz que o código faz o que eu
> escrevi; só a fábrica diz que o que eu escrevi é o que ela corta.

**Pronto quando** (seção 7): *o dono simula dez persianas reais do WhatsApp e o
simulador bate com o que a fábrica cortaria.* — **cumprido em 22/09/2026, dez
de dez.** O preço ficou de fora da conferência de propósito: o R$/m² das
coleções ainda não foi lançado, então o total sai como piso (`≥`).

### O que foi cadastrado no deploy de 22/09/2026

| | |
|---|---|
| Coleções de venda ligadas ao Rolô | **oito**, todas as do `Rolo`: `1%` · `1% FB` · `3%` · `5%` · `Blackout` · `Napoles BK` · `Pinpoint BK` · `Translucido` |
| Cores de acessório | **quatro**: Branco · Bege · Cinza · Preto |
| Preço do m² por coleção | **em branco** — o dono lança depois |
| Largura máxima por coleção | **em branco** — quem limita é a escada de tubos |

> **`Double Vision · Classic` ficou de fora, e não é esquecimento:** ela é do
> modelo Duplex, que ainda não existe como modelo de venda. Ligá-la ao Rolô
> faria o simulador oferecer tecido de Duplex numa persiana Rolô.

> ⚠️ **COLEÇÃO SEM PREÇO MOSTRA `≥` E ISSO NÃO É DEFEITO.** Enquanto o R$/m²
> não for lançado, o simulador devolve `valor_subtotal` nulo, soma o que sabe
> como **piso** e **nomeia** a linha que falta. É a regra 4 do custo — zero é um
> custo válido e mentiroso. Quem vir o `≥` em âmbar está vendo a regra
> funcionando, não a tela quebrada.

### As duas decisões que a seção 8 marcava "antes da fase 1" — respondidas

**1. A tabela A/B/C é um PERCENTUAL por tabela**, guardado em inteiro, mais o
desconto da revenda — e não um preço por coleção em cada tabela.

O preço do m² já tem dono único por item no módulo (`tecido.preco_m2`, com
histórico, e as duas telas que o editam chamam a mesma rota). Uma matriz
3 × N coleções faria cada coleção nova **nascer sem preço em duas das três
tabelas, em silêncio** — a doença dos "mínimos são placeholder" e do alvo velho
do `CLAUDE.md` §18 —, e faria a fórmula da §4.8 ter três respostas para a mesma
pergunta. O risco que a matriz pareceria resolver (preço andando para trás,
armadilha #15) **já está resolvido pelo congelamento no envio**.

> O cadastro da tabela é da **fase 2**. A fase 1 entrega o **subtotal
> Deccorar**, que é exatamente o que o exemplo da §4.8 chama de "tabela sem
> desconto". Se um dia uma coleção precisar de preço próprio numa tabela, isso
> entra como **linha de exceção** — visível, uma —, nunca como matriz inteira.

**2. O modelo NÃO aponta para uma linha: ele aponta para uma LISTA de
coleções**, e cada coleção já carrega a linha dela.

Sai do schema, não de palpite: `abertura` pendura em `linha` com
`UNIQUE(linha_id,nome)` e o `criarTecido` recusa `abertura_de_outra_linha` — a
linha **já está dentro** da coleção. Guardá-la também no modelo seria uma
segunda afirmação sobre o mesmo fato, e é o defeito do `linhaSel`/`linhaForm`
de 15/09/2026 (o formulário descrevia `Double Vision` com uma coleção do
`Rolô`). Além disso não são a mesma coisa: `linha` é a família do **tecido**
(Rolô, Romana, Double Vision), o modelo é o **mecanismo** (Rolô, Duplex,
Motorizada) — Rolô e Motorizada partilham o tecido.

> ⚠️ **Confirmar no cadastro real.** O `tecido.db` não está no repositório, e a
> resposta acima é estrutural — vale de qualquer jeito. O que depende do dado é
> **quais** coleções ligar a cada modelo: `node tecido/ver_cadastro.js` no
> servidor responde em um comando, e só lê.

### Mudanças no caminho (fase 1)

1. **As tabelas levam prefixo `sm_`.** O esboço da §6 propunha `modelo`,
   `componente_sm`, `ficha_linha`. O módulo já tinha 27 tabelas sobre estoque
   de tecido: `modelo` e `componente` sozinhos obrigariam quem lê a adivinhar
   de qual dos dois assuntos são — e as duas palavras já querem dizer outra
   coisa no PCP.
2. **O dono único chama-se `persiana.js`, não `ficha_sm.js`.** Ele não devolve
   uma ficha: devolve degrau, cortes, consumo, kit, preço, avisos e recusas —
   "o que esta persiana é", que é o nome da pergunta.
3. **`sm_degrau_tubo` nasce SEM `componente_id`.** Ligar o degrau ao tubo
   comprado é pergunta de Compras (fase 4), e coluna que não faz nada é mentira
   na tela de cadastro. Ela entra por `ALTER` quando houver o que ligar.
4. **Área em mm² inteiro** (1 m² = 1.000.000), e não `REAL`. É o que faz a
   divisa "3,0 m² fica no degrau de baixo" existir de verdade, sem depender de
   tolerância de ponto flutuante.
5. **O resultado traz um bloco `opcoes`**, calculado sempre. A §4.6 manda a
   opção de bandô sumir da tela *na hora, com a frase* — e uma tela só faz isso
   se souber antes de tentar. Descobrir pela recusa daria a frase certa e
   nenhuma persiana calculada junto.

### O que a fase 1 deixou explicitamente aberto

- **O vendedor entra por uma área larga demais.** Não foi criada área nova no
  PCP: até a fase 2, quem usa o catálogo e o simulador precisa de "Sob medida —
  cadastros", que também dá cadastro de tecido, parâmetros e descarte de sobra.
- **As coleções de venda não são semeadas** — elas apontam para linhas de
  `abertura` que só existem no cadastro real. Ligar cada uma e lançar o preço
  do m² é o primeiro trabalho na tela de Catálogo.
- **O consumo nasce igual ao corte.** A coluna existe desde o primeiro dia
  (armadilha #18); as folgas reais ainda não foram medidas.

> **Onde mora:** tudo dentro do `/sobmedida`, no banco `tecido.db`, com as
> migrações numeradas de `tecido/nucleo/schema.js`. Nada nasce fora do PCP:
> mesmo processo, mesma porta, mesmo PIN para quem é da fábrica.
>
> **Leia junto:** `tecido/README.md` (o plano de corte que vai receber os
> pedidos), `PRODUCAO-MAPA-E-MOTOR.md` (o vocabulário de etapa, sessão e
> unidade, que esta spec usa) e o §7-B do `CLAUDE.md` (a ficha tem dois
> números por linha — armadilha #18).

---

## 1. Problema

O pedido sob medida chega por **WhatsApp**. A revenda manda largura e altura, e
a Deccorar pergunta o resto, uma coisa de cada vez: rolamento invertido ou
normal, comando direito ou esquerdo, bandô ou barra, cor da base. Cada pergunta
trava o pedido. Depois alguém digita tudo no **Decorsoft**, manda um PDF para a
revenda aprovar e só então o corte começa.

Quatro coisas ruins vêm disso:

1. **O pedido anda na velocidade da conversa**, não da fábrica.
2. **A regra técnica mora na cabeça de quem digita.** Qual tubo vai (32, 38, 41
   ou 56), se leva redução de peso, se o bandô cabe. Quem esquece, erra.
3. **A medida de corte é calculada à mão.** A serralheria recebe a etiqueta do
   Decorsoft; o módulo de tecido **lê o PDF** do Decorsoft para achar o corte
   do tecido (`tecido/dominio/etiqueta_corte.js`). O sistema da fábrica depende
   de um papel gerado por outro sistema.
4. **Ninguém sabe onde o pedido está, nem quanto tempo cada peça levou.** Não há
   prazo prometido gravado, não há fila de aprovação, não há tempo por setor,
   não há registro de quem errou quando a peça volta.

## 2. Objetivo

- A **revenda lança o próprio pedido** (ou orçamento), escolhendo modelo,
  coleção, cor e opções, com a medida acabada. O sistema aplica as regras do
  modelo, calcula o preço e o prazo, e grava tudo.
- O **vendedor da carteira aprova** e o pedido vai para a fábrica.
- A **ficha técnica** transforma a medida acabada em medida de corte de cada
  componente, escolhendo o tubo pela escada de tubos. Mudar uma regra (1,70 para
  1,80) é trocar um número na tela.
- Cada componente sai com **etiqueta 100×35 e código de barras único**. Cada
  setor bipa início e fim, e pode recusar a peça por defeito do setor anterior.
- A gestão enxerga **tudo num kanban**, com produtividade, tempo de aprovação,
  prazo cumprido, recusas, nota fiscal e crédito.
- Tudo é construído e testado **por dentro** (a equipe lança os pedidos do
  WhatsApp) antes de qualquer revenda ganhar login.

## 3. Como funciona na fábrica

```
REVENDA                     DECCORAR                         FÁBRICA
────────                    ────────                         ───────
Orçamento  (só simula)
    │
Pedido  ── envio ──▶  congela preço e prazo
                      ◀── tecido sem estoque? avisa o vendedor,
                          vai para Compras, negocia prazo
                      Vendedor da carteira APROVA
                              │
                              ▼
                      explode a ficha → componentes, cortes,
                      códigos de barras, peças no plano de corte
                                                    │
               SERRALHERIA (tubo · base) ──┐        │
               COLEÇÃO (tecido) ───────────┴─▶ MONTAGEM ─▶ REVISÃO ─▶ EMBALAGEM ─▶ PRONTO
               SERRALHERIA (bandô · barra) ──────────────────────────────▲
                                                    │
                      Financeiro: NF (antes ou depois da entrega), baixa dos boletos
                      Retirado / Entregue
```

**O que a fábrica passa a receber:** em vez do PDF do Decorsoft, uma tela de
impressão por setor. Seleciona os pedidos, escolhe o setor e imprime todas as
etiquetas daquele setor em série. Cada pessoa fica com as suas etiquetas.

**O que a serralheria vê:** `TUBO 0,970`. Nunca a medida acabada para ela
fazer conta.

---

## 4. Regras de negócio

### 4.1 Unidades — milímetro por dentro, metro com três casas por fora

| Onde | Como |
|---|---|
| Banco e contas | **milímetro inteiro** (`970`) |
| Tela e etiqueta | **metro com três casas** (`0,970` · `1,200`) — sempre as três, inclusive o zero final |
| Área | m² calculado a partir dos milímetros; exibido com três casas |
| Dinheiro | **centavos inteiros** no banco; arredonda uma vez, no total da linha |

> Guardar em milímetro inteiro evita o ruído de ponto flutuante que o PCP já
> conheceu (`3,5 + 0,2 = 3,7000000000000006`, §7-B). Etiqueta sempre com três
> casas para a serralheria nunca duvidar se o número está completo.

> ⚠️ **O plano de corte do tecido trabalha em metros (`REAL`).** A conversão
> acontece **numa porta só**, na entrega das peças ao plano (fase 4), e o que
> vai é a medida de **corte**, nunca a acabada — o mesmo aviso do
> `etiqueta_corte.js`: cortar pela acabada erra as duas dimensões, para lados
> diferentes.

### 4.2 O que se escolhe

| Escolha | Regra |
|---|---|
| Modelo | Rolô, Rolô Duplex, Rolô Motorizada… cadastrável |
| Coleção | Só as que o modelo aceita |
| Cor do tecido | Só as que existem para aquela coleção |
| Cor dos acessórios (base etc.) | Obrigatória; lista por modelo |
| Largura e altura **acabadas** | Obrigatórias, em metros com três casas |
| Lado do comando | **Obrigatório** — direito ou esquerdo |
| Rolamento | **Obrigatório** — desce pela frente ou por trás |
| Bandô **ou** barra niveladora **ou** nenhum | Opcional, e **nunca os dois juntos** |
| Redução de peso | Automática pela regra; opcional quando o tubo permite (§4.5) |

**Não existe "combinação proibida" de cor.** A revenda escolhe o que quiser. As
regras são do **modelo** (quais coleções, qual base, o que é obrigatório) e da
**medida** (qual tubo, se o bandô cabe).

### 4.3 A coleção de venda é o tecido que o módulo já conhece

O módulo de tecido já cadastra `linha` (Rolô, Romana, Double Vision),
`abertura` (mostrada na tela como **Coleção**: 1%, 3%, Nápoles) e `cor`. O item
de estoque é `tecido` = linha + coleção + cor.

> **A coleção de venda aponta para esse cadastro. Nunca o duplica.** Duas listas
> de coleções — uma de venda, outra de estoque — divergiriam no primeiro tecido
> novo, e o pedido chegaria ao plano de corte pedindo um tecido que o estoque
> não reconhece. O que a venda acrescenta é o que o estoque não tem: **preço por
> m², largura máxima, m² máximo e mínimo faturado**.

### 4.4 A escada de tubos

O tubo é escolhido pela medida. O sistema sobe até o **primeiro degrau onde a
persiana cabe nos dois limites**: largura **e** m². Passou de qualquer um dos
dois, sobe.

Valores iniciais do modelo Rolô (todos editáveis na tela):

| Tubo | Largura até | m² até | Desconto do tubo | Altura do tecido | Bandô |
|---|---|---|---|---|---|
| 32 | 1,700 | 3,0 | −30 mm | final + 200 mm | ✅ |
| 38 | 2,200 | 3,5 | −30 mm | final + 200 mm | ✅ |
| 41 | 2,700 | 5,0 | −40 mm | final + 250 mm | ❌ |
| 56 | 3,000 | 7,0 | −45 mm | final + 250 mm | ❌ |
| acima | — | — | **pedido recusado, com o motivo** | — | — |

A medida exata do limite fica no degrau de baixo: 1,700 × qualquer altura até
3,0 m² é tubo 32.

Vale **sempre o mais restritivo** entre degrau, modelo e coleção. O Screen 1%
vai até 2,800 de largura: uma persiana de 2,900 é recusada pela coleção, mesmo
cabendo no tubo 56.

### 4.5 A ficha do Rolô — tudo parte do tubo

| Componente | Setor | Largura de corte | Altura de corte | Etiqueta |
|---|---|---|---|---|
| Tubo | Serralheria | final − desconto do degrau | — | `SER-` |
| Base inferior | Serralheria | tecido + 5 mm (fica igual ao tubo) | — | `SER-` |
| Tecido | Coleção | tubo − 5 mm | final + 200 ou + 250 mm (pelo degrau) | `COL-` |
| Bandô | Serralheria | final − 5 mm | — | `SER-` |
| Barra niveladora | Serralheria | final − 9 mm | — | `SER-` |
| Montagem | Montagem | — | — | `MON-` (no tubo) |
| Revisão | Revisão | — | — | `REV-` (entre tubo e base) |
| Embalagem | Embalagem | — | — | `EMB-` (no plástico, por fora) |
| Kit de instalação | Embalagem | — | — | código **do kit** (§4.7) |
| Redução de peso | Montagem | — | — | — (vai na etiqueta da montagem) |

**Conferências obrigatórias (casos de teste):**

```
1,000 × 1,000  →  1,000 m²  →  TUBO 32
  tubo 0,970 · tecido 0,965 × 1,200 · base 0,970 · bandô 0,995 · barra 0,991
  redução de peso: não automática (pode pedir? não — tubo 32 não tem)

2,000 × 2,000  →  4,000 m²  →  TUBO 41   (passou dos 3,5 m² do 38)
  tubo 1,960 · tecido 1,955 × 2,250 · base 1,960
  bandô: indisponível · redução de peso: NÃO automática (≤ 2,200 e ≤ 4,5 m²)

2,400 × 2,000  →  4,800 m²  →  TUBO 41   (passou de 2,200 de largura)
  tubo 2,360 · tecido 2,355 × 2,250 · base 2,360 · barra 2,391
  bandô: indisponível · redução de peso: automática
```

**Cada linha da ficha é "referência + ajuste".** A referência é a largura final,
o tubo ou o tecido; o ajuste é em milímetros. É o que o dono descreveu
("o tecido é sempre 5 mm menor que o tubo") e é o bastante para o Rolô. Não
precisa de linguagem de fórmula na fase 1. Se um modelo futuro precisar de
multiplicador ou expressão, ela passa pelo avaliador seguro do PCP
(`formula.js`, sem `eval()`, §7-B) — nunca por uma segunda porta.

> ⚠️ **A ficha tem os DOIS números por linha, como no PCP (armadilha #18).**
> O de **corte** vai para a etiqueta. O de **consumo** (quanto a peça gasta de
> tubo, de base, de tecido) vai para Compras e para o custo. Os dois nunca
> fecham, e quem um dia "unificar" está cortando ou a peça ou o custo. Na fase
> 1 o consumo pode nascer igual ao corte; a coluna existe desde o primeiro dia.

### 4.6 Regras que mudam o que a revenda vê

| Regra | O que a tela faz |
|---|---|
| Bandô só nos tubos 32 e 38, e altura até 3,000 | Passou de 2,200 / 3,5 m² ou de 3,000 de altura → a opção de bandô **some na hora**, com a frase: *"O bandô não é possível nesta medida: o tubo enrolado não cabe dentro do bandô."* |
| Bandô já marcado e a medida mudou | **Avisa** e pede para escolher de novo. Nunca tira em silêncio |
| Bandô **e** barra | Não existe. Escolher um desmarca o outro, com aviso |
| Redução de peso automática | Acima de **4,5 m²** ou acima de **2,200** de largura. A tela diz *"incluída pela regra de garantia"* |
| Redução de peso pedida | Só em tubo 38, 41 e 56. Tubo 32 não oferece |
| Medida acima de tudo | Recusa **dizendo qual limite** estourou (coleção, modelo ou tubo 56) |

> **A frase é parte da regra.** Acessório cobrado sem explicação vira ligação da
> revenda para o vendedor. Opção que some sem motivo vira desconfiança da tela.

### 4.7 O kit de instalação

| Persiana | Kit | Suportes |
|---|---|---|
| Sem bandô e sem barra | **Kit tradicional** (o de hoje) | padrão do kit |
| Com bandô | **Kit bandô** | pela largura (abaixo) |
| Com barra niveladora | **Kit barra** | pela largura (abaixo) |

```
largura até 1,000 → 2 suportes
largura até 1,900 → 3 suportes
largura até 2,600 → 4 suportes
largura até 3,000 → 5 suportes
```

Na divisa, a medida exata fica no degrau de baixo: 1,000 → 2; 1,001 → 3.

**Cada tipo de kit tem código de barras próprio.** A embalagem bipa o kit e o
sistema **recusa o kit errado** (*"esta persiana leva KIT BANDÔ · 4 suportes"*).
Na medida padrão o QR do kit é fixo e prova só que *algum* kit entrou (§4 do
`CLAUDE.md`); aqui prova que entrou **o certo**.

### 4.8 Preço

```
m² real     = largura × altura
m² cobrado  = maior entre m² real e o mínimo faturado (1,5 m²)
tecido      = m² cobrado × preço do m² da coleção
bandô       = largura REAL × R$/m linear    (55,00)
barra       = largura REAL × R$/m linear    (17,00)
redução     = R$ 50,00 por peça (automática ou pedida — cobra nas duas)
subtotal    = soma das linhas
preço final = subtotal com a tabela da revenda (A/B/C) e o desconto dela
```

**Única regra de mínimo: 1,5 m² por persiana.** Não há largura mínima nem
arredondamento de medida. O mínimo é cadastrado por coleção/modelo.

Exemplo de teste: Screen 1% (R$ 110/m²), 0,800 × 1,200, com bandô, tabela sem
desconto:

```
0,800 × 1,200 = 0,960 m²  → cobra 1,500 m² × 110 = R$ 165,00
bandô 0,800 m × 55                              = R$  44,00
                                          total = R$ 209,00
```

> ⚠️ **O PREÇO CONGELA NO ENVIO**, linha por linha, com a tabela e o desconto
> daquele momento. Reajuste de coleção na quinta não mexe no pedido enviado na
> quarta. É a armadilha #15 (preço no cadastro anda para trás) pela porta da
> venda.

> ⚠️ **O PREÇO DA DECCORAR E O PREÇO COM MARKUP NUNCA SE MISTURAM.** O preço
> Deccorar mora no cadastro da coleção/modelo e é o único que entra em
> faturamento, Compras, crédito e relatório. O markup é da revenda, para o
> cliente dela, e não é gravado em nenhuma conta da Deccorar.

### 4.9 Prazo

```
pedido ENVIADO até quarta-feira 18:00  → pronto na quinta-feira da semana seguinte
pedido enviado depois disso            → pronto na quinta-feira da outra semana
dia da entrega cai em feriado          → próximo dia útil
```

Exemplo: hoje, terça 22/09/2026. Enviado até quarta 23/09 às 18:00 → quinta
01/10. Enviado na quarta às 18:01 → quinta 08/10.

- **Conta a hora do ENVIO pela revenda**, não a da aprovação. Aprovar é tarefa
  da Deccorar; a demora dela não passa para a revenda.
- **O prazo congela no envio**, como o preço.
- O corte (quarta, 18:00) e o dia da entrega (quinta) são **parâmetros**.
- Feriados são um **cadastro** (data e nome).

> ⚠️ **A FILA DE APROVAÇÃO TEM QUE GRITAR.** Como o prazo corre desde o envio,
> cada dia parado esperando o vendedor é um dia a menos para a fábrica. A tela
> do vendedor mostra há quanto tempo cada pedido espera e **quantos dias de
> fábrica sobraram**.

**Prazo negociado.** Só o vendedor da carteira (ou o admin) altera o prazo, e a
alteração grava: prazo antigo, prazo novo, motivo, quem e quando. A revenda vê o
prazo novo e o motivo. O gerencial mostra as duas coisas separadas — **no prazo
prometido** e **no prazo negociado** — porque somá-las faria o pedido empurrado
parecer entregue em dia.

### 4.10 Orçamento, pedido e aprovação

| Etapa | Quem | O que acontece |
|---|---|---|
| **Orçamento** | Revenda (ou a equipe, nas fases internas) | Só simula. Preço atual, sem congelar, sem prazo. Pode virar pedido depois — aí congela naquele momento |
| **Pedido enviado** | Revenda | Congela preço e prazo. Vai para a fila do vendedor da carteira |
| **Aprovado** | Vendedor da carteira (ou admin) | A ficha é explodida e congelada (§4.11), e o pedido aparece para a fábrica |
| **Depois de aprovado** | Só o admin mexe | Alteração grava antes/depois, quem e por quê |
| **Em produção** | — | **Não cancela e não altera** |

**Tecido sem estoque:** o pedido é **aceito normalmente**. O item sai marcado
"sem tecido", entra na necessidade de compra e o vendedor recebe o aviso para
negociar prazo maior com a revenda.

### 4.11 A ficha é congelada na aprovação

Na aprovação, o sistema calcula e **grava** cada componente de cada persiana:
qual tubo, qual kit, as medidas de corte, o consumo e o código de barras.

> ⚠️ **O PEDIDO NÃO RELÊ A FICHA DEPOIS.** Se alguém mudar o desconto do tubo 41
> amanhã, a persiana aprovada hoje continua sendo cortada com o desconto de
> hoje — que é o que a etiqueta dela já diz. Ficha relida ao vivo faria a
> etiqueta impressa e a tela discordarem, e na bancada vence a etiqueta.

### 4.12 Pessoas e carteiras

| Quem | O que é | Login |
|---|---|---|
| **Vendedor** | Gente da Deccorar (Renato e os próximos). Cuida de uma **carteira**: o conjunto de revendas que atende | O mesmo PIN do PCP; permissão de aprovar |
| **Revenda** | O cliente. Tem vendedor responsável, tabela, crédito, endereços | Fase 7 |
| **Dono da revenda** | Cria os usuários da loja e **decide o que cada um vê e faz**, dentro do que a Deccorar liberou para aquela revenda | Fase 7 |
| **Vendedora da loja**, **instalador** | Usuários criados pelo dono | Fase 7 |

**Cadastro da revenda:** razão social, nome fantasia, CNPJ, endereço fiscal,
**vários endereços de entrega**, contatos, vendedor responsável, tabela (A/B/C),
desconto, forma de pagamento padrão (cartão, boleto…), retira ou entrega,
limite de crédito, data da última revisão do limite, logo (para o orçamento ao
cliente final) e ativo/inativo.

**A tabela é decidida pela Deccorar.** O **markup é da revenda**: ela põe o dela
e gera, pelo sistema, o orçamento para o cliente final, **com o logo e a marca
dela, sem o nome Deccorar**.

> ⚠️ **QUEM NÃO PODE VER O PREÇO DECCORAR NÃO RECEBE O CAMPO.** O JSON sai sem
> ele — não é a tela que esconde (regra 14 do §13 do `CLAUDE.md`). Vendedora da
> loja sem essa permissão que abre o "inspecionar" do navegador não pode
> descobrir a margem da loja.

### 4.13 Crédito — mostra, não trava

```
limite disponível = limite − boletos em aberto
```

Exemplo: limite R$ 5.000 com dois boletos de R$ 2.500 em aberto → R$ 0. Com dois
de R$ 1.000 → R$ 3.000.

- **Não trava o pedido.** Estourado, o pedido entra e é aprovado normalmente; a
  tela do vendedor e o kanban mostram o limite em vermelho. Não se perde venda.
- **O financeiro dá baixa** no boleto pago.
- **Tarefa semanal** do vendedor com o financeiro: revisar os boletos em aberto
  da carteira. O sistema lista.
- **Revisão do limite a cada 2 meses** por revenda. O sistema mostra quem está
  vencido.

> ⚠️ **SEM BAIXA, O LIMITE DE TODO MUNDO ZERA.** Boleto que ninguém baixa fica
> "em aberto" para sempre. Por isso a baixa tem tela própria e a tarefa semanal
> existe — e por isso a trava de crédito **não** entra antes de a baixa estar
> sendo feita de verdade. Trava ligada sobre dado velho é a armadilha #6.

### 4.14 Etiquetas de produção

**Formato:** 100 × 35 mm, Zebra ZD220, 203 dpi, CODE128 — o mesmo do PCP. O
módulo já gera PDF nesse tamanho para as sobras (`etiqueta_pdf.js`).

**Uma etiqueta por componente**, com código **sequencial por setor**:
`SER-000001`, `COL-000001`, `MON-000001`, `REV-000001`, `EMB-000001`.

**O que toda etiqueta traz:**

| Campo | Exemplo |
|---|---|
| Pedido e peça | `5012 · 3 de 10` |
| Revenda | `LAR DO CILAR` |
| Prazo | `qui 01/10` |
| Medida acabada | `1,000 × 1,000` |
| Coleção e cor | `SCREEN 1% BRANCO` |
| Lado do comando | `COMANDO DIREITO` |
| **O que este setor faz** | `TUBO 32 · CORTAR 0,970` |
| Código de barras | `SER-000123` |

A de embalagem traz também o kit (`KIT BANDÔ · 4 suportes`). A de montagem traz
a redução de peso quando houver.

**Impressão por setor e em série.** A tela lista os pedidos aprovados; seleciono
os que quero, escolho o setor e imprimo **todas** as etiquetas daquele setor, de
todos os pedidos selecionados. Grava **quem imprimiu, quando e o quê**.

> ⚠️ **O CÓDIGO NASCE NA APROVAÇÃO, NÃO NA IMPRESSÃO.** Imprimir só marca a
> etiqueta como impressa. **Reimprimir sai com o MESMO código** e fica
> registrado como reimpressão. Código novo para a mesma peça partiria a
> história dela em duas, e o tempo do setor nunca fecharia. É a armadilha #1-B
> do PCP por outra porta.

> **A tela avisa o que já foi impresso.** Na seleção, pedido que já tem as
> etiquetas daquele setor aparece marcado. Imprimir o lote duas vezes seria o
> jeito mais fácil de ter duas etiquetas iguais em duas peças diferentes.

### 4.15 Produção bipada — a fila só mostra o que já pode ser feito

```
SERRALHERIA: tubo · base ─┐
COLEÇÃO: tecido ──────────┴─▶ MONTAGEM ─▶ REVISÃO ─▶ EMBALAGEM ─▶ PRONTO
SERRALHERIA: bandô · barra ──────────────────────────────▲
```

| Setor | Aparece na fila quando | Bipes |
|---|---|---|
| Serralheria | Pedido aprovado | início e fim, **um componente por vez** |
| Coleção | Pedido aprovado | início e fim |
| Montagem | **Tubo, base e tecido** terminados | início e fim (etiqueta no tubo) |
| Revisão | Montagem terminada | início e fim (etiqueta entre tubo e base) |
| Embalagem | Revisão terminada **e** bandô/barra terminados, se houver | início · **kit** · fim |
| Pronto | Todas as persianas do pedido embaladas | automático |

Serralheria e coleção trabalham **em paralelo**. Bandô e barra **não seguram a
montagem** — só a embalagem, porque vão juntos na caixa.

**Na embalagem**, o primeiro bipe mostra em letra grande o que a peça é
(`1,000 × 1,000 · Screen 1% Branco · Comando direito · Bandô`) para conferir
antes de fechar o plástico. Sem o bipe do kit certo, o bipe de fim é recusado
(*"⚠ FALTOU O KIT"*), como na medida padrão.

> ⚠️ **"NÃO APARECE" NÃO PODE VIRAR "NINGUÉM SABE POR QUÊ".** Se a serralheria
> esquecer de bipar o fim do tubo, a montagem fica esperando uma peça que já
> está na bancada. Bipar um código que ainda não foi liberado **responde o que
> o segura** (*"aguardando: tubo · serralheria · iniciado às 10:32 por João"*),
> e a chefia pode **fechar a pendência** com registro de quem e por quê. Uma
> trava que prende sem explicar é a que a equipe aprende a contornar (#6).

### 4.16 Recusa — o problema aponta o setor

Qualquer setor pode recusar a peça por defeito do trabalho **anterior**. Quem
recusa escolhe **só o motivo**. Cada motivo é cadastrado já dizendo para onde a
peça volta:

| Motivo (exemplo) | Volta para |
|---|---|
| Tubo maior / menor | Serralheria |
| Tecido com defeito / corte torto | Coleção |

O sistema sabe pelos bipes **quem fez** aquele componente e reabre o trabalho
dele. Os setores depois dele voltam para "aguardando" naquela persiana. A peça
refeita reimprime a **mesma** etiqueta, marcada como refeita.

> ⚠️ **Já existe `motivo_recusa` no `tecido.db`** — é o motivo de o plano de
> corte recusar uma peça. O motivo de recusa da produção é **outra tabela**,
> com outro nome. Reaproveitar a mesma misturaria "o plano não conseguiu
> cortar" com "a montagem achou o tubo maior", e os relatórios das duas
> ficariam errados.

### 4.17 Gerencial

**Kanban com colunas cadastráveis.** Dá para acrescentar e tirar colunas. Produção
é **uma coluna só** por enquanto; o cartão mostra uma barrinha por setor
(serralheria ✔ · coleção ✔ · montagem ⏳…).

> ⚠️ **AS COLUNAS SÃO LIVRES, OS MARCOS NÃO.** Por baixo das colunas existem
> marcos fixos do sistema: `orçamento`, `enviado`, `aprovado`, `em produção`,
> `pronto`, `entregue`. Cada coluna aponta para um marco. As regras
> ("começou a produzir, não cancela", "o prazo corre desde o envio") leem o
> **marco**, nunca o nome da coluna — senão renomear "Em produção" desligaria a
> trava em silêncio.

**Nota fiscal é marca à parte**, não coluna: sai às vezes antes, às vezes depois
da entrega. O kanban tem os filtros *"entregue sem NF"* e *"NF sem entrega"*.

**Retido** (tecido sem estoque, crédito estourado) é selo no cartão, não coluna.

**Indicadores:**

| Indicador | De onde vem |
|---|---|
| Tempo de aprovação por vendedor | envio → aprovação |
| Pedidos parados na aprovação | com dias de fábrica restantes |
| Prazo cumprido | prometido e negociado, separados |
| Horas-homem por peça e por pedido | soma dos tempos de todos os setores |
| Tempo médio por m² | por setor e no total |
| Produtividade por pessoa e por setor | pelos bipes |
| Recusas | por setor, por pessoa, por motivo |
| Crédito | disponível por revenda; revisões vencidas; boletos em aberto por carteira |

> ⚠️ **BIPE QUE ABRE E NÃO FECHA SAI DA MÉDIA.** Esqueceu de bipar o fim e foi
> almoçar: a peça "levou" três horas. Tempo aberto acima de um limite
> cadastrável **não entra** na produtividade e aparece como pendência para
> alguém corrigir. Média com esse ruído dentro é pior que nenhuma: confirma com
> autoridade um número falso.

### 4.18 Números de pedido não podem colidir com o Decorsoft

O plano de corte agrupa o **tom único** pelo texto do pedido e olha para trás
(`cortesAnteriores` em `plano.js`). Um pedido novo `4272` colado num `4272`
antigo do Decorsoft herdaria o histórico de tom de outra casa.

> **A numeração nova começa num número configurável acima do último pedido do
> Decorsoft.** Nunca reinicia do 1.

---

## 5. Fica de fora

- **Segurança para abrir à internet** (domínio, HTTPS, login forte para gente de
  fora) — é a **fase 8**, a última, e nenhuma revenda entra antes dela. Hoje o PCP
  roda sem HTTPS e com PIN de 4 dígitos (dívida #2); isso serve dentro da
  fábrica, não fora.
- **ERP financeiro.** O pedido fica pronto para ele (valor, revenda, forma de
  pagamento, NF, boletos), mas o ERP é outro projeto.
- **Trava de crédito.** Só mostra, por decisão do dono.
- **Produção em várias colunas** no kanban.
- **Fichas de Duplex e Motorizada.** A estrutura aceita qualquer modelo; a fase 1
  valida com o **Rolô**. Os outros são cadastro depois.
- **Migrar o histórico do Decorsoft.** Ele é substituído quando a fase 4 estiver
  de pé; o leitor do PDF (`etiqueta_corte.js`) continua funcionando até lá.
- **Medida padrão (Mercado Livre).** Nada desta spec mexe em `dados.db` além da
  leitura que Compras fizer (§6).

## 6. Dados técnicos de referência

### Relação com o que já existe

| O quê | Como esta spec usa |
|---|---|
| `linha`, `abertura` (Coleção), `cor`, `tecido` | A coleção de venda aponta para elas (§4.3) |
| `plano`, `plano_peca` | O pedido aprovado vira peças do plano, com o **número do pedido** (tom único) e a medida de **corte** em metros |
| `etiqueta_corte.js` | Continua lendo o PDF do Decorsoft até a fase 4 provar o caminho novo |
| `etiqueta_pdf.js` | Base para as etiquetas 100×35 |
| `parametro` | Corte da quarta, dia da entrega, limite de bipe aberto, número inicial dos pedidos |
| `formula.js` (PCP) | Só se um modelo futuro precisar de expressão (§4.5) |
| `PRODUCAO-MAPA-E-MOTOR.md` | Esta spec usa o mesmo vocabulário (etapa, sessão, unidade = etiqueta) para que o motor da medida padrão e o do sob medida possam virar um só depois |
| `GERADOR-ETIQUETA-KIT.md` | Os três kits do sob medida têm código próprio; o gerador de etiqueta do kit pode imprimi-los |
| Compras (`dados.db`) | Lê o **consumo** do sob medida por uma porta única (fase 4) — ver decisão pendente |

### Tabelas novas (esboço — o nome final sai na fase 1, depois de ler o código)

```
-- catálogo e ficha
modelo                (nome, ativo, largura_max_mm, m2_max_mm2, m2_min_faturado)
modelo_colecao        (modelo_id, abertura_id, preco_m2_centavos, largura_max_mm, m2_max)
modelo_cor_acessorio  (modelo_id, cor)
componente_sm         (nome, setor, gera_etiqueta, codigo_barras, preco_centavos, unidade_cobranca)
degrau_tubo           (modelo_id, ordem, componente_id, largura_max_mm, m2_max,
                       desconto_mm, acrescimo_altura_tecido_mm, aceita_bando)
ficha_linha           (modelo_id, componente_id, quando, ref_largura, ajuste_largura_mm,
                       ref_altura, ajuste_altura_mm, consumo_*, setor)
faixa_suporte         (modelo_id, kit_componente_id, largura_max_mm, quantidade)
regra_reducao_peso    (modelo_id, m2_acima, largura_acima_mm)
feriado               (data, nome)

-- clientes
revenda, revenda_endereco, revenda_contato, tabela_preco, (vendedor = usuário do PCP)

-- pedido
pedido                (numero, revenda_id, tipo, marco, enviado_em, prazo_prometido,
                       prazo_atual, aprovado_em, aprovado_por, tabela e desconto congelados,
                       total_centavos, endereco_entrega_id, retira_ou_entrega,
                       nf_emitida, nf_numero, nf_em, sem_tecido, ...)
pedido_item           (pedido_id, n, de_n, modelo, colecao, cor, tecido_id, cor_acessorio,
                       largura_mm, altura_mm, comando, rolamento, adicional,
                       reducao (auto|pedida|nao), degrau, m2_real, m2_cobrado, linhas de preço)
pedido_componente     (item_id, componente, setor, largura_corte_mm, altura_corte_mm,
                       quantidade, consumo, codigo_barras UNIQUE)   ← congelado na aprovação
pedido_prazo_alteracao(pedido_id, de, para, motivo, por, em)
pedido_marco          (pedido_id, marco, em, por)
kanban_coluna         (nome, ordem, marco)

-- produção
impressao_etiqueta    (quem, quando, setor, lista de códigos, reimpressao)
sessao_producao       (codigo_barras, setor, usuario, inicio, fim, segundos, status)
motivo_recusa_producao(nome, setor_destino, ativo)
recusa_producao       (codigo_que_recusou, motivo_id, codigo_culpado, usuario_culpado, por, em)

-- financeiro (mínimo)
titulo                (pedido_id, revenda_id, valor_centavos, vencimento, pago_em, baixa_por)
```

### Permissões novas (em `tecido/nucleo/permissoes.js`)

`catalogo.editar` · `revenda.editar` · `pedido.lancar` · `pedido.aprovar` ·
`pedido.alterar_aprovado` · `prazo.alterar` · `etiqueta_producao.imprimir` ·
`producao.serralheria` · `producao.colecao` · `producao.montagem` ·
`producao.revisao` · `producao.embalagem` · `producao.corrigir` ·
`gerencial.ver` · `financeiro.baixa` · `credito.editar`

> ⚠️ **ARMADILHA #13 — as três pontas andam juntas.** Chave em `permissoes.js`,
> setor em `acesso.js` (`setoresNativos`) e linha em `PERM_AREA`. Faltando
> qualquer uma, o acesso some em silêncio no primeiro salvamento. E chave nova
> num banco que já existe não chega a ninguém sem backfill (§5, armadilha #23).

---

## 7. Fases

Da fase 1 à 6, **tudo roda por dentro**: a equipe lança os pedidos que hoje
chegam por WhatsApp. A revenda só ganha login na fase 7, e só usa de verdade
depois da 8.

### Fase 1 — Catálogo, ficha técnica e simulador

**Entrega:**
- Cadastros: modelo, coleções de venda (apontando para o tecido), cores de
  acessório, componentes, preços (m², metro linear, peça), escada de tubos,
  linhas da ficha, faixas de suporte, regra da redução de peso, mínimo faturado.
- `tecido/dominio/ficha_sm.js` (nome a confirmar): **dono único** de "dada esta
  persiana, o que ela é". Recebe modelo, escolhas e medida; devolve degrau,
  componentes, medidas de corte, consumo, kit, preço, avisos e recusas.
- **Simulador**: tela onde se digita a persiana e aparecem tubo, cortes, kit e
  preço, com as frases de aviso.
- Cadastro inicial do Rolô com os números do §4.4 a §4.8.

**Teste:** os casos do §4.5, §4.7 e §4.8 viram teste automático, incluindo as
divisas (1,700 · 3,0 m² · 2,200 · 3,5 m² · 1,000/1,001 suportes · 4,5 m² ·
3,000 de altura do bandô · 2,800 do Screen 1%), bandô + barra recusado e
medida acima do tubo 56 recusada.

**Pronto quando:** o dono simula dez persianas reais do WhatsApp e o simulador
bate com o que a fábrica cortaria.

### Fase 2 — Revendas, vendedores e calendário

**Entrega:** cadastro completo da revenda (§4.12), carteira por vendedor,
tabelas A/B/C e desconto, feriados, parâmetros de prazo.

**Pronto quando:** as revendas ativas de hoje estão cadastradas, cada uma com
vendedor.

### Fase 3 — Pedido interno

**Entrega:** a equipe lança orçamento e pedido em nome da revenda. Preço e prazo
congelam no envio. Fila de aprovação do vendedor (com dias de fábrica restantes).
Aprovação explode e congela a ficha (§4.11). PDF do pedido para a revenda
conferir. Alteração pelo admin com registro. Prazo negociado com registro.
Numeração acima do Decorsoft.

**Pronto quando:** uma semana de pedidos do WhatsApp foi lançada aqui, em
paralelo ao Decorsoft, sem diferença de preço nem de corte.

### Fase 4 — Pedido vai para a fábrica

**Entrega:** tela de impressão por setor em série, com registro de quem imprimiu
e marca de já impresso; reimpressão com o mesmo código. Peças do pedido entram no
plano de corte do tecido (medida de corte, número do pedido). Consumo de
material disponível para Compras por porta única. Item sem tecido aparece em
Compras e avisa o vendedor.

**Pronto quando:** a serralheria e a coleção trabalham uma semana só com as
etiquetas novas, e o Decorsoft deixa de ser usado.

### Fase 5 — Produção bipada

**Entrega:** filas por setor com as liberações do §4.15, bipe de início e fim,
bipe do kit certo na embalagem, recusa com motivo → setor → pessoa (§4.16),
"o que está segurando", fechamento de pendência pela chefia, Pronto automático.

**Pronto quando:** um pedido inteiro passa pelos cinco setores só com bipe, e uma
recusa de teste volta para a pessoa certa.

### Fase 6 — Gerencial

**Entrega:** kanban com colunas cadastráveis sobre marcos, selo de NF e de retido,
todos os indicadores do §4.17, baixa de boletos pelo financeiro, crédito
disponível, tarefa semanal e revisão bimestral do limite.

**Pronto quando:** o dono responde, pela tela, "onde está o pedido X",
"quanto o Renato leva para aprovar" e "quanto tempo leva uma persiana por m²".

### Fase 7 — Portal da revenda (ainda por dentro)

**Entrega:** login da revenda, dono cria usuários e marca permissões, markup,
orçamento ao cliente final com o logo da revenda, acompanhamento de status.
Testado com uma revenda de confiança **dentro da rede da fábrica**.

### Fase 8 — Segurança e abertura

**Entrega:** domínio, HTTPS e o login de gente de fora resolvido (§8). Só então
as revendas recebem acesso.

---

## 8. O que ainda precisa ser decidido

| Antes da fase | Pergunta | Proposta desta spec |
|---|---|---|
| ~~1~~ | ~~Tabela A/B/C é um **percentual** sobre o preço da coleção, ou um **preço por coleção** em cada tabela?~~ | **RESPONDIDA em 22/09/2026: percentual por tabela**, em inteiro, mais o desconto da revenda. Ver o STATUS da fase 1 |
| ~~1~~ | ~~O modelo aponta para a `linha` do tecido, ou aceita coleções de mais de uma linha?~~ | **RESPONDIDA em 22/09/2026: o modelo NÃO guarda linha** — aponta para uma lista de coleções, e cada uma já carrega a sua. Ver o STATUS da fase 1 |
| 3 | A revenda pode editar ou cancelar um pedido **enviado e ainda não aprovado**? Editar recalcula o prazo? | Pode; editar devolve para rascunho e o reenvio recalcula prazo e preço |
| 3 | O admin altera um pedido aprovado até quando? | Até a primeira etiqueta impressa; depois, só cancelando o item com registro e lançando outro |
| 3 | Feriado **no meio** da semana de produção também empurra o prazo, ou só o feriado no dia da entrega? | Só o dia da entrega (foi o exemplo do dono) |
| 4 | Como Compras (`dados.db`) lê o consumo do sob medida (`tecido.db`)? | Uma função única no sob medida, chamada por Compras; nenhuma consulta cruzada espalhada |
| 4 | As etiquetas de coleção saem na ordem do **pedido** ou na ordem do **plano de corte** (por bobina)? | Na ordem do plano, quando existir um plano confirmado |
| 5 | Uma pessoa pode ter **mais de um bipe aberto** ao mesmo tempo (a serralheria corta em lote)? | Uma sessão por pessoa, como no motor; se a serralheria precisar de lote, o tempo do lote é repartido entre as peças — nunca somado em dobro |
| 6 | O crédito disponível desconta só os boletos em aberto, ou também os pedidos aprovados ainda não faturados? | Os dois, mostrados separados |
| 8 | Como é o login de quem é de fora (senha, e-mail, recuperação)? | PIN de 4 dígitos não serve para a internet; desenhar na fase 8 |

## 9. Regras que não podem ser quebradas

- ❌ Guardar medida em metro `REAL` ou dinheiro em reais `REAL` — é milímetro e centavo inteiros
- ❌ Mostrar medida com menos de três casas na etiqueta
- ❌ Mandar a medida **acabada** ao plano de corte, ou para a serralheria
- ❌ Duplicar o cadastro de coleção/cor/tecido para a venda (§4.3)
- ❌ Escolher o tubo por outro caminho que não a escada (§4.4)
- ❌ Somar o consumo com o corte, ou usar um no lugar do outro (armadilha #18)
- ❌ Reler a ficha num pedido já aprovado (§4.11)
- ❌ Recalcular preço ou prazo de pedido enviado porque o cadastro mudou
- ❌ Contar o prazo pela aprovação em vez do envio
- ❌ Misturar o preço com markup em qualquer número da Deccorar
- ❌ Mandar pelo JSON um preço que o usuário não pode ver
- ❌ Tirar o bandô, pôr a redução de peso ou recusar a medida **sem dizer por quê**
- ❌ Permitir bandô e barra na mesma persiana
- ❌ Gerar código novo numa reimpressão
- ❌ Ler o nome da coluna do kanban para decidir regra — é o marco
- ❌ Reaproveitar `motivo_recusa` do plano de corte para a recusa da produção
- ❌ Contar bipe aberto além do limite na produtividade
- ❌ Reiniciar a numeração de pedidos abaixo do último Decorsoft
- ❌ Ligar trava de crédito sem a baixa de boletos acontecendo de verdade
- ❌ Dar login a revenda antes da fase 8

## 10. Decisões (para `docs/DECISOES.md`)

| Data | O que mudou | Por quê | Decidido por | Onde está |
|---|---|---|---|---|
| 22/09/2026 | Pedido sob medida passa a ser lançado no sistema (primeiro pela equipe, depois pela revenda), com aprovação do vendedor da carteira | O pedido por WhatsApp trava em perguntas e depende de quem digita | Lucas | esta spec §4.10 |
| 22/09/2026 | Tubo escolhido por escada (32/38/41/56) por largura **e** m², com desconto de corte por degrau | Regra técnica sai da cabeça de quem digita e fica editável | Lucas | §4.4 |
| 22/09/2026 | Preço = m² × coleção, mínimo faturado de 1,5 m², bandô/barra por metro linear real, redução de peso cobrada inclusive quando automática; congela no envio | Regra comercial única, e preço que não anda para trás | Lucas | §4.8 |
| 22/09/2026 | Prazo: envio até quarta 18h → quinta da semana seguinte; conta o envio, não a aprovação; feriado empurra | Prazo previsível para a revenda | Lucas | §4.9 |
| 22/09/2026 | Crédito só é mostrado, não trava; baixa pelo financeiro; revisão do limite a cada 2 meses | Não perder venda | Lucas | §4.13 |
| 22/09/2026 | Uma etiqueta por componente, código sequencial por setor, bipe de início e fim, recusa aponta o setor culpado | Rastreabilidade e produtividade por peça | Lucas | §4.14 a §4.16 |
| 22/09/2026 | Medidas em milímetro por dentro, metro com três casas na tela e na etiqueta | A serralheria corta em milímetro; número sem ambiguidade | Lucas | §4.1 |
