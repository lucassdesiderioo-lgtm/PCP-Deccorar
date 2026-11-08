# PLANEJAMENTO-VENDAS-FUTURAS — o Planejamento diz o que produzir primeiro

> **STATUS · 07/11/2026 — AS QUATRO FASES NO AR** (PR #313; o dono fez o
> backup, o deploy e o teste de segurança: *"deu tudo certo no deploy"*). A
> fase 4 está desligada. **Desde 08/11/2026 a 401 é em abas** (AJUSTE: Vendas por
> dia · O que produzir · Médias por janela · Planilha × sistema), e no mesmo dia
> o fechamento do dia foi para a 904 Relatórios e a tarja dos SKUs fora do
> cadastro saiu (AJUSTE). **E a tabela §3-B ganhou dois estados** (CONSERTO de
> 08/11/2026, o dono): "Para entregar na coleta de amanhã" e "Etiqueta pronta para
> impressão" são ainda na fábrica, para o dia seguinte. **Falta a prova com dado real:** o primeiro import
> classificando pela §3-B, a aba conferida com a bancada por alguns dias e, só
> depois, o dono ligar a fase 4. O que mudou na construção, com o dono:
> - **O relatório real dá 228 linhas · 239 peças ainda na fábrica, e não
>   235 · 246** como o §3 escrevia; e **40 estados** (26 no pós-venda), não 38.
>   O dono, 07/11/2026: *"vale 239, os 26 no grupo 4"*.
> - **A3 confirmado por construção** (a peça conferida sai do saldo e fica no
>   comprometido até a próxima planilha; a coluna Atrasada estica isso). O dono
>   escolheu **(a)**: construir assim, e a correção vira plano à parte.
> - A chave da fase 4 só é ligada pelo **Admin Geral** (o setor; o §7 não cria
>   ação nova, a rota confere). As rotas novas de leitura (`/futuras`, `/janelas`)
>   caem em `@admin`, como a 401. A fase 3 vale a partir do deploy.
> - "Pronto para coleta… segunda-feira" num relatório de segunda é o mesmo dia;
>   sem dia na Descrição, dia seguinte "a confirmar".
> - A simulação (`simular_ritmo.js`, 21 dias avaliados), com a régua que a
>   produção usa: falta **2.005 → 1.386** peças, sobra **2.091 → 3.232**; com N
>   dias cheios, falta 2.130 → 1.584.
> - A ③ REVISÃO achou e consertou: a atrasada ausente do arquivo era APAGADA
>   (e saía da média, #11) — agora perde a data e passa a "já saiu"; o saldo
>   negativo virava "faltam N atrasadas" — agora a falta começa na venda do SKU.
> - Regras que parecem bug no `CLAUDE.md` §3; cartões R-PLN-01 a 05 e R-REV-03.
> - Falta: a prova da fase 1 com dado real (a aba batendo com a bancada por
>   alguns dias) e o dono ligar a fase 4.
> Desenhado no Projeto com o dono em 07/11/2026, a partir do relatório real do
> ML de 07/11/2026 09:59 (3.326 linhas, 07/09 a 07/11, 246 peças com envio futuro).
> Onde esta spec e o `CLAUDE.md` divergirem, vale o `CLAUDE.md` (§13).

---

## 1. O princípio

O Planejamento é o lugar onde se decide, todo dia, **o que a fábrica produz
primeiro para entregar o que já foi vendido — e o que vem depois.**

O dono, em 07/11/2026:

> *"Embora a gente já vendeu, eu preciso entregar o que já está vendido. Todo dia
> é uma decisão. […] Muitas vezes a gente chega meio-dia e já concluiu tudo o que
> precisa entregar. O interessante é trabalhar com o que já tem para o dia
> seguinte, para que a gente sempre esteja 1, 2 ou 3 passos na frente das vendas."*

A tela tem que ser **simples de ler e levar a uma decisão**: "vamos fazer isso,
depois isso, depois aquilo".

## 2. O problema de hoje

1. **A venda futura é um número só.** A planilha do ML traz o dia de envio de cada
   venda (`venda_futura.data_envio`), mas o PCP só usa a soma (o *comprometido*).
   Ninguém sabe o que é para segunda, terça, quarta. A expedição só enxerga o que
   já tem PDF (no dia 07/11: ~40 etiquetas de ~140 peças para segunda).
2. **A média de 30 dias anda atrasada.** No relatório de 07/11, o BK150150BRANCO
   vendia 6,3/dia na média de 30 dias, 8,9 na de 14 e 11,0 na de 7. O alvo saía em
   63 peças quando o ritmo pedia 89. O BK160160BRANCO fazia o contrário (3,5 → 2,5)
   e prendia produção. A fábrica inteira subiu de ~350 para 488 peças/semana.
3. **A tela azul não sabe a data.** Ela ordena por *prazo até amanhã → sem estoque →
   cobertura < metade → abaixo do alvo* (R-REV-03). A venda de terça e a reposição
   de um SKU que acaba em três semanas caem no mesmo "abaixo do alvo".
4. **A capacidade oscila** (entra e sai gente). O estoque nunca fica no alvo — e
   isso é normal. O que importa é **produzir primeiro o que falta mais cedo**.

## 3. Achados no código que a fase 1 resolve

> Achados lendo `plan_route.js`, `planilha.js` e `demanda_dominio.js` em
> 07/11/2026. **O Claude Code confere no código antes do PLANO** (§0, passo 2).

| # | O que acontece | Efeito |
|---|---|---|
| A1 | `parseDataEnvio` só lê *"dia N de mês"* no Estado. **"Pronto para coleta"** (a data está na Descrição, pelo dia da semana) e **"Pronta para emitir NF-e"** (ainda sem data) ficam **sem `data_envio`**, e por isso **fora do comprometido** | No arquivo de 07/11: 46 linhas · 49 peças que ainda vão sair da fábrica, invisíveis à tela azul |
| A2 | O comprometido conta **1 por linha** (`THEN 1`), e não a coluna **Unidades** | No arquivo de 07/11: 235 linhas = 246 peças; em 60 dias, 88 linhas com mais de 1 unidade |
| A3 | O `precisa` usa o **saldo**, e não o livre, porque o comprometido já inclui a venda impressa até ela sair (§2) | Entre a Conferência baixar a caixa e a planilha seguinte mostrar a venda como saída, a mesma peça pode ser descontada duas vezes. **A investigar** na fase 1, com dado real; a correção, se houver, é decisão do dono |
| A4 | A média **tira** toda linha com "devolu" ou "reembols" no Estado | O dono decidiu o contrário (§3-B): o cliente comprou e a peça saiu — é venda |

## 3-B. Que linha da planilha é o quê — decisão do dono (07/11/2026)

> Tirada do relatório real de 07/11/2026 (38 estados diferentes). **Estado novo
> que não estiver nesta tabela não trava nada** (decisão do dono): ele **conta
> como venda** na média e, se trouxer data de envio (*"dia N de mês"*), entra
> também como venda futura. O resumo do import só **avisa** o texto do estado
> novo, para o dono saber que ele apareceu.

| Grupo | Estados (exemplo do arquivo de 07/11) | Venda futura (a sair) | Média de vendas | Data de envio |
|---|---|---|---|---|
| **1. Ainda na fábrica** | *Para entregar na coleta do dia N* (182) | ✅ | ✅ | no Estado |
| | *Pronto para coleta* (42) | ✅ | ✅ | na Descrição: *"coleta que passará na segunda-feira"* → a próxima segunda a partir da data do relatório |
| | *Pronta para emitir NF-e da venda* (4) | ✅ | ✅ | ainda não existe; **fica no dia seguinte**, marcada *"data a confirmar"*. Depois da NF o ML mostra a data, e a próxima planilha corrige |
| | *Para entregar na coleta de amanhã* (81, relatório das 17:34 de 08/11) — **acréscimo do dono, 08/11/2026** | ✅ | ✅ | o dia seguinte ao do relatório |
| | *Etiqueta pronta para impressão* (21, idem) — **acréscimo do dono, 08/11/2026** | ✅ | ✅ | na Descrição: *"coleta que passará amanhã"*; sem dia, o seguinte, *"data a confirmar"* |
| **2. Já saiu, não chegou** | *A caminho* (159), *Envio reagendado* (4), *Envio atrasado* (1) | ❌ já saiu da fábrica | ✅ | — |
| **3. Entregue** | *Entregue* (2.628), *Venda entregue* (8) | ❌ | ✅ | — |
| **4. Pós-venda** | devolução, reclamação, mediação, reembolso, *Devolvido no dia N*, *Pacote não entregue* (~140, 20 estados); *Seu pacote foi devolvido em N*, *Venda não entregue* (acréscimo do dono, 08/11/2026) | ❌ | ✅ **muda a regra de hoje** (A4) | — |
| **5. Cancelada** | *Cancelada pelo comprador* (113), *Venda cancelada. Não envie.* (6), *Cancelada pelo Mercado Livre* (2), *Pacote cancelado pelo Mercado Livre* (1); *Cancelada* (acréscimo do dono, 08/11/2026) | ❌ | ❌ | — |
| **6. Não é venda** | *Pacote de 2 produtos* (16 — cabeçalho, os itens vêm embaixo), Estado **vazio** (2) | ❌ | ❌ | — |

A data da **média** é sempre a **Data de venda**.

## 4. As regras

| # | Regra |
|---|---|
| R1 | **Uma conta só.** A falta por dia, o comprometido da tela azul e a ordem da fase 4 saem do `demanda_dominio.js` (#12). A aba não conta nada sozinha |
| R2 | **Conta-se peça**, pela coluna Unidades da planilha, e não linha |
| R3 | **Cada linha da planilha segue a tabela do §3-B**, e a data de envio sai de onde ela diz. Venda futura cuja data já passou vai na coluna **"Atrasada"**, que é a primeira: atraso tem que aparecer, não sumir (§8). Estado novo não trava: conta como venda (e como futura se tiver data), e o import avisa |
| R4 | **Falta acumulada:** o estoque cobre primeiro o dia mais cedo; `falta até o dia D = max(0, vendas de hoje até D − estoque)`. O estoque é o mesmo da tela azul (ver A3) |
| R5 | **O horizonte é todo dia que tem venda futura** na planilha, e não só a semana |
| R6 | **Sob medida fica fora da falta** (R-REV-04, R-EST-05): ele não tem estoque. Aparece contado à parte |
| R7 | **SKU da planilha sem cadastro** aparece em linha própria, "sem cadastro", e não some |
| R8 | **A aba diz quando foi a última planilha**, em âmbar se não foi enviada hoje. Ninguém decide em cima de dado velho sem saber |
| R9 | **Os botões de janela (7, 14, 30, 45 dias) são só para olhar.** Não mudam a produção nem a `config` |
| R10 | **O ritmo da produção é o maior entre a média de 30 e a de 14 dias** (fase 3). Quando a de 14 vence, a tela diz "subindo" |
| R11 | **A tela azul ordena pela data da falta** (fase 4): a data mais cedo primeiro; no mesmo dia, venda feita antes de reposição; no mesmo dia e tipo, mais peças faltando primeiro. Cada linha diz o porquê |
| R12 | **A rotina:** a planilha do ML (últimos 30 dias, que traz as futuras) sobe de manhã e no fim do dia. O import já não duplica nem apaga o passado (§3) |

## 5. As fases

### Fase 1 — a aba "Vendas futuras por dia" (só para ver)

**O que entra**
- Uma seção nova dentro da tela **401 Planejamento**: uma linha por SKU, uma coluna
  por dia de envio (a primeira é "Atrasada"), e embaixo de cada célula a
  **falta acumulada**. A venda de NF a emitir aparece com a marca *"data a confirmar"*.
- Em cada linha: estoque, vendas por dia, **"falta a partir de: ter 10/11"** e o
  total. As linhas vêm **pela data da primeira falta**; quem não falta vai embaixo.
- Linha de total da fábrica por dia. Topo: *"Planilha enviada hoje às 09:59"*.
- O import passa a gravar **Unidades** (`venda_futura.unidades`, `CREATE` + `ALTER`
  guardado, §17) e a classificar cada linha pela tabela do §3-B: a data do
  *Pronto para coleta* pela Descrição, a do *NF a emitir* no dia seguinte, o
  pós-venda **dentro** da média. O resumo do import diz quantas linhas caíram em
  cada grupo e **avisa** os estados novos, sem travar.
- O comprometido e a média da tela azul passam a seguir a mesma tabela e a contar
  peça, **pela mesma conta** (R1). Isso muda os números da tela azul para cima —
  é regra e vai em `docs/DECISOES.md`.
- Teste com o **relatório real de 07/11/2026** no caderno: os 38 estados caem nos
  grupos do §3-B, e 246 peças futuras · 49 delas que hoje ficam fora.
- A3 é investigado com dado real e o resultado vai no FECHAMENTO. Se houver dupla
  contagem, a correção é **plano à parte**, com o dono.

**Risco:** 🔴 (schema e o número da produção). **Teste:** `teste_vendas_futuras.js` —
a falta acumulada, a pendente sem data, as unidades, o sob medida fora, o SKU sem
cadastro, e que a aba e a tela azul dão o **mesmo** comprometido.
**Prova com dado real:** o dono confere por alguns dias se a falta da aba bate com
o que a bancada vê. **Libera a fase 4.**

### Fase 2 — os botões 7 · 14 · 30 · 45 dias (só análise)

- Na tabela do Planejamento, botões que trocam a janela **da tela** (não da `config`)
  e mostram, por SKU, a média de cada janela e a seta de tendência (14 contra 30).
- A média é a mesma fonte que a produção lê hoje (a planilha), dita na tela. Janela
  maior que a história é cortada e dita em âmbar, como no `media_dominio` (#16).

**Risco:** 🟡. **Teste:** as quatro janelas, o corte e que a `config` não mudou.

### Fase 3 — o ritmo olha o recente

- `demanda_dominio`: `ritmo = max(média da janela, média de 14 dias)`; o alvo usa
  o ritmo. A janela curta é `config.janela_curta = 14`.
- A tela azul e o Planejamento dizem "subindo: 6,3 → 8,9/dia" quando a de 14 vence.
- **Pré-requisito:** a planilha cobrir os 30 dias (R12) e o dono ter olhado a fase 2.
- Funciona com qualquer fonte da média: se a fase 3 da `VENDAS-E-MEDIA` trocar a
  fonte, a regra vale sobre a nova.

**Risco:** 🔴 (muda o que a fábrica produz). Vai em `docs/DECISOES.md`.
**Teste:** subida pega em dias; queda **não** derruba o alvo antes dos 30 (é o
preço de proteger contra a falta, decidido); sob medida sem alvo.

### Fase 4 — a tela azul ordena pela data da falta

- **Venda feita:** a data é exata — o primeiro dia de envio que o estoque não cobre
  (a conta da fase 1).
- **Reposição:** a data é estimada — `hoje + (estoque − comprometido) ÷ ritmo`
  dias. Sem venda na janela, sem data (vazia, nunca zero — R-REV-03).
- Ordem pela R11. Cada linha: *"faltam 3 para terça (vendidas)"* ou *"acaba quarta
  pelo ritmo (3,5/dia)"*.
- **O modo vermelho (pedidos de hoje) e o amarelo (devoluções) não mudam.**
- O cartão R-REV-03 é reescrito.

**Risco:** 🔴. **Pré-requisito:** a prova da fase 1. **Teste:** a ordem, os três
desempates, o motivo de cada linha, e o caso do meio-dia — terminado o de hoje, a
primeira linha é a falta de amanhã.

## 6. O que fica de fora

- Visão por tecido e cor para o corte — **decisão do dono:** o corte olha por SKU.
- Capacidade da fábrica na conta (quantas peças cabem por dia). A ordem já faz a
  fábrica menor perder o mínimo; medir capacidade é outra spec.
- Cobertura diferente por SKU ("10 dias" para todos continua). O ritmo da fase 3
  já dá mais peça a quem acelera.
- Puxar a planilha sozinha do ML — é da integração com a API do ML.
- Mudar a fonte da média para a do sistema — é a fase 3 da `VENDAS-E-MEDIA`.

## 7. Alçada (R-ALC-08)

| Fase | Telas novas | Ações novas | Setores novos |
|---|---|---|---|
| 1 | nenhuma — seção dentro da **401 Planejamento** (Admin), aberta a quem abre a 401 | nenhuma (só leitura). Rota `GET` nova com linha no `permDaRota` igual à da 401 | nenhum |
| 2 | nenhuma (401) | nenhuma | nenhum |
| 3 | nenhuma | nenhuma (`config.janela_curta` se edita onde se edita a janela de hoje) | nenhum |
| 4 | nenhuma — muda a ordem da **101 Revisão** | nenhuma | nenhum |

Nada novo nasce para ninguém além de quem já tem.

## 8. Decisões do dono (07/11/2026)

1. O Planejamento é o lugar da decisão diária: o que produzir primeiro para entregar o que já foi vendido.
2. A aba mostra as vendas futuras **por dia de envio**, todos os dias que houver, com a falta acumulada contra o estoque.
3. Os botões de janela (7/14/30/45) são **só para análise**.
4. O ritmo da produção passa a ser **o maior entre a média de 30 e a de 14 dias** (protege contra a falta; demora mais a baixar).
5. A tela azul passa a ordenar **pela data em que a peça vai faltar** — venda feita antes de reposição no mesmo dia —, depois de a aba ser conferida com dado real.
6. A planilha do ML sobe **de manhã e no fim do dia**.
7. Sem visão por tecido; o corte olha por SKU.
8. **Tudo é venda**, menos a cancelada e a linha que não é venda (cabeçalho de pacote, Estado vazio). A tabela do §3-B é do dono. Estado novo não trava: conta como venda (futura, se trouxer data) e o import só avisa.
9. **Venda futura é só o que ainda não saiu da fábrica.** "A caminho", "reagendado" e "atrasado" já saíram e ficam fora; entregue também.
10. **Pós-venda (devolução, reclamação, mediação, reembolso) entra na média**: o cliente comprou e a peça saiu. Muda a regra de hoje.
11. **"Pronta para emitir NF-e" fica no dia seguinte**, marcada "data a confirmar", até a planilha trazer a data.
