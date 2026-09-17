> **STATUS · 17/09/2026 — PARCIAL E DIVERGENTE · decisão pendente do dono**
> - **Lista do dia:** o Planejamento virou lista de prioridade por prazo, cobertura e
>   ruptura (01/09/2026), mas com outra conta. Este doc pede alvo de **7 dias** com
>   média de **60 dias**; o sistema usa `dias_cobertura = 10` e `janela_media = 30`
>   (`plan_route.js`). **Falta decidir qual vale.** Linha de corte "cabe até aqui": não existe.
> - **Pessoas (relógio de aba, ocioso, importação do ponto):** não iniciado.
> - Os dois furos de estoque citados na §4 foram resolvidos só em parte — ver
>   `CLAUDE.md` §14.
> Movido do Projeto "PCP - Deccorar" para o repositório em 17/09/2026.

---

# PCP — A lista do dia e a produtividade

> Duas telas. O que produzir hoje para chegar no estoque alvo, e quanto cada pessoa rendeu.
> **Versão 3 · 19/08/2026** — simplificada. As v1 e v2 tinham desenhado o sistema inteiro;
> esta desenha só as duas coisas que o Lucas pediu.
> **Status:** desenho para revisão, nada implementado

---

## 1. As duas perguntas

**1. Hoje, quais SKUs eu ataco para chegar no estoque de 7 dias?**
**2. Quanto cada pessoa produziu, e quanto tempo ficou parada?**

O resto do que existe hoje na tela — curva ABC, cobertura, média móvel, comprometido,
painel de parede — não é apagado, mas sai da frente. **Quem responde as duas perguntas
acima são duas telas, e nada mais entra nelas.**

---

## 2. A lista do dia

### 2.1 A conta, inteira

```
alvo(sku)      = vende_por_dia × 7                    ← os 7 dias que você definiu
produzir(sku)  = max(0, alvo − o_que_tem)
dias_de_estoque(sku) = o_que_tem ÷ vende_por_dia      ← o número que ordena a lista
```

Três linhas. Não tem mais nada.

- `vende_por_dia` = média das vendas do SKU nos últimos **60 dias**, do histórico do ML que
  o sistema já importa. Você não digita.
- `o_que_tem` = estoque disponível, descontando o que já foi vendido e ainda não despachou.
- **A ordem da lista é `dias_de_estoque`, do menor para o maior.** Quem acaba antes, ataca
  primeiro. Uma coluna, uma ordem, sem faixa e sem coluna clicável.
- **SKU com `produzir = 0` não aparece.** A lista mostra o que fazer, não o catálogo.

### 2.2 A tela

```
BOM DIA, LUCAS
Hoje ataca BK160160BEGE, BK160140CINZA e começa a BK140140BEGE —
dá 45 peças, que é o que cabe com 5 pessoas.
Faltam 94 peças para o estoque chegar nos 7 dias. Nesse ritmo, sexta você está no alvo.

┌─────────────┬─────────────┬─────────────┬─────────────┐
│ PRODUZIR HOJE│ FALTA P/ ALVO│ CHEGA NO ALVO│ VENDE POR DIA│
│      45      │      94      │     sex      │      22      │
└─────────────┴─────────────┴─────────────┴─────────────┘

 #  SKU              dura     tem  vende  alvo   PRODUZIR   tempo
 1  BK160160BEGE     0,6 d      2    3,2    23      21      21h42
 2  BK160140CINZA    1,2 d      3    2,6    19      16      15h28
 3  BK140140BEGE     2,2 d      9    4,1    29    8 de 20    7h12
 ══════ CABE ATÉ AQUI · 5 pessoas × 9h = 45h · 44h22 · sobra 0h38 ══════
 4  BK120140BEGE     2,6 d      5    1,9    14       9       7h21
 5  BK160140BEGE     3,2 d     12    3,8    27      15      14h30
 6  BK180160CINZA    4,2 d      5    1,2     9       4       4h32
 7  BK140160CINZA    4,5 d     10    2,2    16       6       6h00
 8  BK110240BEGE     5,0 d      2    0,4     3       1       1h22
 9  BK200160BEGE     5,6 d      5    0,9     7       2       2h32
```

**A linha de corte** compara o tempo total do programa com as horas de gente que existem
hoje. Ela não muda a ordem — só diz onde o dia acaba. *"Faça as duas primeiras inteiras e 8
da terceira"* é uma instrução, não um relatório.

O tempo de cada linha é o **tempo de rota completa** — corte de tecido + corte de tubo +
corte de alumínio + montagem + revisão + embalagem — porque a peça só está pronta quando
passou por tudo, e as mesmas pessoas fazem etapas diferentes ao longo do dia.

**Enquanto não houver tempo medido de todas as etapas**, o tempo de rota vem de um número
declarado por família de SKU, e a tela marca como estimativa. Some sozinho quando a medição
chegar.

### 2.3 A frase de cima

É o resumo em linguagem de gente, e ele muda todo dia. É o que responde *"Lucas, hoje
precisa fazer tal coisa"* sem exigir que você leia a tabela.

Ela sempre diz três coisas: **o que atacar, quanto cabe, e quando o estoque chega no alvo.**

### 2.4 Uma coisa que a tela precisa avisar

Quando o estoque está longe do alvo, o primeiro número é grande — 94 peças, no exemplo.
Isso não é um problema, é **enchimento de pulmão**: a fábrica produz 45/dia e vende 22/dia,
então sobra 23/dia e em 4 dias chega. Depois disso a lista encolhe sozinha para o ritmo de
venda.

A tela diz isso (**"chega no alvo: sexta"**) justamente para o número grande não assustar.

---

## 3. Pessoas — o tempo vem da aba

### 3.1 Como funciona

A pessoa entra na aba da atividade que vai fazer. Se está revisando, está na aba Revisão. Se
vai cortar alumínio, entra na aba Corte de alumínio. **O tempo com a aba aberta é o tempo
naquela atividade.** Não precisa de bipe de início e fim, nem de apontamento extra.

```
Disponível  = do ponto: (saída − entrada) − almoço
Aba X       = tempo com a aba X aberta e ativa
Ocioso      = Disponível − soma de todas as abas
```

Duas regras para o número não mentir, e só duas:

1. **Aba aberta sem nenhum bipe por mais de 15 minutos vira ocioso.** Sem isso, quem
   esquece a aba aberta no almoço aparece como se estivesse produzindo.
2. **Duas abas abertas, só a que está na frente conta.** Nunca duas ao mesmo tempo.

### 3.2 A tela

```
ONTEM · SEGUNDA, 17/08
A fábrica teve 45h11 de gente na bancada e 5h21 de tempo ocioso — 12%.
O maior pedaço é do Edivaldo: 1h36, quase toda entre 09:20 e 10:10.

Pessoa     como o dia se dividiu               disp.   ocioso        produziu
Ana        ████████████ revisão ██ emb ▏oc     9h03    8%  0h46      96 rev · 18 emb
Carlos     ███████ montagem ███ tubo ▏oc       9h10    9%  0h52      41 mont · 55 tubos
Maria      ███████ embalagem ██ alum ▏oc       9h00   10%  0h55     118 emb · 40 alum
José       █████ expedição ███ emb ██ oc       8h47   14%  1h12      64 exp · 37 emb
Edivaldo   ███ mont ██ rev ███ tecido ███ oc   9h11   17%  1h36      19 mont · 32 rev · 24 tec
```

A barra colorida é a leitura de 3 segundos: **onde o dia foi parar, e quanto de cinza tem
no fim.**

### 3.3 A comparação justa

Peças por hora entre pessoas não compara — quem montou blackout de 2,00 × 1,60 não é mais
lento que quem montou rolô pequeno.

**A comparação é minuto por peça, dentro do mesmo SKU e da mesma etapa**, contra a média da
fábrica naquele SKU, que se atualiza sozinha.

```
Revisão · BK160140BEGE   Ana      38 peças   4,2 min/peça   (média 4,5)
Revisão · BK160140BEGE   Edivaldo 14 peças   5,1 min/peça   (média 4,5)
```

Isso é comparável. "Ana fez 96 e Edivaldo fez 19" não é.

### 3.4 Quem vê o quê

| Quem | Vê |
|---|---|
| Operador | só o que ele mesmo produziu e o tempo médio dele |
| Supervisor | a fábrica inteira, **sem nome** |
| Você | tudo, com nome |

**A tela do operador nunca mostra tempo ocioso.** Ocioso é informação de gestão. Já está
coberto pelo `CONTROLE-DE-ACESSO.md` §8 — `produtividade.propria | equipe | nominal` — e
este documento não afrouxa nada disso.

E um alerta que vale dizer: **tempo ocioso usado para cobrar indivíduo destrói o dado.** A
pessoa aprende a deixar a aba aberta e o número vira ficção em duas semanas. Ele serve para
achar onde a fábrica para — falta de material, espera, troca de atividade —, não para
cobrar quem estava lá.

---

## 4. O que precisa existir para isso funcionar

| # | O quê | Já existe? |
|---|---|---|
| 1 | Média de venda por dia por SKU, dos últimos 60 dias | Dado sim (`venda_futura`), cálculo não |
| 2 | Estoque disponível confiável | Sim, **mas com dois furos abertos** — ver abaixo |
| 3 | Aba com relógio: início, fim, e a regra dos 15 min | Não |
| 4 | Importação do ponto (só leitura, mão única) | Não |
| 5 | Tempo de rota por família de SKU, declarado | Não |
| 6 | Abas de corte de tecido, tubo, alumínio e montagem | Não — hoje só revisão e embalagem |

**Os dois furos do item 2, que a auditoria já mediu e que corrompem a lista antes de ela
chegar na tela:**

- `POST /api/carregar` aceita volume `pendente` — a peça sai da fábrica **sem baixar o
  estoque** (`REVISAO-COMPLETA.md` §2.1). O disponível fica permanentemente alto e a lista
  manda produzir de menos.
- O cruzamento **desconta a mesma peça duas vezes** (§2.2), e a tela declara o dia concluído
  com peça faltando.

**Consertar esses dois vem antes de tudo.** Lista boa em cima de estoque errado é lista
errada com cara de certa.

---

## 5. Ordem de implementação

| Fase | O quê | Quanto entrega |
|---|---|---|
| **0** | Corrigir os dois furos do estoque (§2.1 e §2.2 da auditoria) | O disponível passa a estar certo |
| **1** | **A lista do dia** — média 60 dias, alvo 7 dias, ordem por dias de estoque | **É a tela que você pediu** |
| **2** | Relógio de aba + regra dos 15 min, nas duas abas que já existem | Ocioso e tempo por atividade começam a acumular |
| **3** | Importação do ponto | O "disponível" passa a ser real |
| **4** | Abas de corte de tecido, tubo, alumínio e montagem | Fecha o retrato da fábrica inteira |
| **5** | Tempo de rota por família → **linha de corte** na lista | A lista passa a dizer o que cabe |
| **6** | Minuto por peça por SKU e etapa | Comparação justa entre pessoas |

**A fase 1 é pequena e não toca no fluxo** — é um cálculo e uma tela de leitura. A fase 2
também é pequena, e é a que começa a acumular histórico. **Histórico só se acumula a partir
do dia em que se liga.**

---

## 6. Regras que não podem ser quebradas

1. **Uma conta só:** `produzir = (vende_por_dia × 7) − o_que_tem`. Em um lugar só do código.
2. **Uma ordem só:** dias de estoque, crescente. Não reordenável.
3. **SKU no alvo não aparece na lista.**
4. **Nenhum número sem denominador.** "45 peças" não; "45 de 94, o que cabe em 5 pessoas" sim.
5. **A tela do operador não mostra tempo ocioso.**
6. **Aba aberta sem bipe por 15 min é ocioso**, não produção.
7. **Uma aba por vez.** Duas abertas, conta a da frente.
8. **Comparação de tempo só dentro do mesmo SKU e da mesma etapa.**
9. **Estimativa é declarada** — tempo de rota declarado e média com poucas vendas aparecem
   marcados, nunca com a tipografia de um número medido.

---

## 7. O que ficou de fora de propósito

Estas coisas foram desenhadas nas versões anteriores e **não entram agora**. Ficam
registradas caso um dia façam falta:

- **Estoque de segurança estatístico** (alvo calculado por desvio e nível de serviço, em vez
  de 7 dias para todos). Faz o SKU rápido precisar de menos e o lento de mais. Vale revisitar
  depois de alguns meses com a lista rodando — não antes.
- **Congelamento do programa às 7h e medição de aderência.** Útil quando você quiser saber
  *por que* a fábrica não fecha a lista.
- **Fila por etapa e cálculo de gargalo.**
- **Rejeição em três campos** (defeito · origem · destino) e o gatilho da etiqueta.

Nenhuma delas é pré-requisito da lista do dia. Todas cabem em cima dela depois, sem refazer
nada — e é por isso que a lista vem primeiro.

---

*Desenho para revisão. Números dos exemplos são ilustrativos e consistentes entre si:
94 peças para o alvo, 45 cabem hoje, 22 de venda por dia, alvo alcançado em 4 dias.*
