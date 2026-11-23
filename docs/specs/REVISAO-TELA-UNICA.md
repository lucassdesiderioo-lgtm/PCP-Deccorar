# REVISAO-TELA-UNICA — a 101 Revisão numa tela só, ligada ao planejamento

> **STATUS — 23/11/2026: COMPLETA, AGUARDANDO O "PODE SEGUIR" DO DONO.** Desenhado na conversa de
> 23/11/2026 (Claude Code, sessão de perguntas e respostas). Nada construído.
> Tipo: `REGRA` + `NOVIDADE` · risco 🟡 (comportamento de tela, conta exibida e
> o modo gravado na revisão, que decide o que abate a ordem do dia). Muda os
> cartões **R-REV-01**, **R-REV-02** e **R-REV-03** de `docs/regras/estoque.md`.
> As decisões do dono estão na §9; o design é a fase 2.

## 1. O pedido

O dono: *"Quero definir toda a regra da tela de revisão … desde a tela de subir
a etiqueta de venda do que precisa entregar hoje. Essa tela é a que manda para a
embalagem, então seria legal ela estar conectada também ao planejamento para o
operador saber sobre o planejamento de vendas já feitas. Quero questionar se
precisamos ter a tela azul e vermelha."*

## 2. Como é hoje (o ponto de partida)

- Ao abrir, a pessoa escolhe 🔴 **Pedidos de hoje** (as ordens do dia, que a
  urgência do PDF lança sozinha, R-PRD-01), 🔵 **Pra estoque** (o `precisa` do
  `demanda_dominio`, nos quatro degraus da R-REV-03, com o bloco "Adiantamento —
  pedidos de amanhã") ou 🟡 **Devoluções** (só leva à 251). O modo fica salvo no
  tablet.
- O modo é gravado na revisão (`revisao.modo`), e só a peça de `hoje` abate a
  ordem do dia na embalagem (R-EMB-03). SKU fora da lista no vermelho: avisa e
  conta como estoque (R-REV-02).
- Valem em qualquer modo: os dois bipes, o mínimo de 15 s (R-REV-07), cancelar
  (R-REV-08), desfazer a última (R-REV-09), peça com problema (R-REV-06), as
  peças que voltaram da embalagem (R-EMB-11) e o tempo da pessoa (R-TEM-01).

## 3. A decisão: uma tela só, sem escolher cor

- **Some a escolha de modo ao abrir**, e a cor do cabeçalho junto. O carrinho da
  fábrica é um só, com prateleiras e um lugar para cada SKU (o dono, 23/11): a
  cor espelhava carrinhos separados que não existem.
- **O operador continua escolhendo a peça**: bipa o que tem na mão. A tela não
  manda a próxima.
- **Quem decide para que a peça serve é o sistema**, no bipe que fecha a
  revisão, pela primeira necessidade aberta do SKU, nesta ordem:
  1. uma venda de **hoje** sem peça → a revisão é gravada como `hoje` (abate a
     ordem do dia, como sempre);
  2. senão, a falta dos **próximos dias** → gravada como `estoque`;
  3. senão, o **alvo** → `estoque`.
  Nenhuma regra de estoque muda: revisar continua sem mexer no saldo (R-EST-01),
  e o +1 continua na embalagem.

## 4. A lista — três partes, com título

```
🔴 HOJE — faltam 6
🔵 PRÓXIMOS DIAS — faltam 14       (até sexta)
⚪ COMPLETAR O ALVO — faltam 40
```

| Parte | O que entra | De onde vem a conta |
|---|---|---|
| **Hoje** | as vendas que estão na Etiqueta de Venda (201) para hoje — o que vence hoje, o que já venceu e o que não tem data (a régua do `fila_dia.js`) — **e não têm peça livre** | a ordem do dia (`ordem_dia.js` / `urgencia.js`), a mesma do aviso de status e da TV |
| **Próximos dias** | a falta do planejamento, dia a dia, de amanhã **até sexta** (a coleta é de segunda a sexta) | a falta por dia do `demanda_dominio` (`porDia`), a mesma da 401 "Vendas por dia" |
| **Completar o alvo** | o que falta para o SKU chegar no alvo, depois de cobertas as vendas | o `precisa` do `demanda_dominio`, a mesma conta da 401 |

- A venda da 201 **com** peça livre não entra em "Hoje" (o dono, 23/11): não
  pede revisão.
- Dentro de cada parte, o SKU que falta primeiro vem em cima (em "Próximos
  dias", pela data da falta).
- **Nenhuma conta mora na tela** (#12): ela só desenha o que os donos devolvem,
  numa rota de leitura que junta os três.
- Sai o bloco "Adiantamento — pedidos de amanhã": amanhã já é a primeira linha
  de "Próximos dias".

## 5. O cartão de cada SKU

Decidido (§9):

```
1,40 × 1,60  CINZA                 faltam 9
hoje 3 · amanhã 2 · até sex 4
```

A medida continua sendo a âncora visual (§4 do `DESIGN.md`), e o SKU fica
embaixo, pequeno. A tela principal não se polui: o resto do planejamento fica
na visão da semana (§6).

## 6. "Ver a semana" — o todo, fora da tela principal

Um botão abre, por cima da 101, a visão da semana: SKU × dia (hoje até sexta)
e o alvo, só leitura, nas mesmas contas da §4. Fecha e volta ao bipe sem perder
nada. **É a mesma tela (o mesmo assunto), não uma tela nova.**

## 7. Avisos

- **SKU que não falta em lugar nenhum** (venda coberta e alvo cheio): **avisa e
  deixa passar** (o dono, 23/11), e a peça conta como estoque acima do alvo.
- **Venda nova de hoje sem peça** (um PDF da tarde): faixa vermelha no topo e um
  som, uma vez, sem travar nada. A lista se reordena sozinha. *(Decidido, §9.)*
- Os avisos de hoje — SKU não cadastrado, bipe rápido, sem conexão — ficam.

## 8. O que fica como está, e o que fica de fora

**Fica:** os dois bipes, o mínimo de 15 s, Cancelar, Desfazer a última, Peça com
problema, "Voltaram da embalagem por defeito", o tempo ao lado da média e a
atualização sozinha da lista (sem redesenhar com a revisão aberta).

**Fica de fora:**
- **Devoluções** — continuam na 251, que está certa.
- **A embalagem** dentro da revisão (o dono: não).
- **O lugar do SKU no carrinho** (o dono: sem necessidade).
- **O botão "Peça com problema" que não está funcionando** (o dono, 23/11) é um
  `CONSERTO` à parte, antes ou junto da fase 1, com o defeito confirmado antes.

**Depois (fase 3):** quando a Montagem (107) da `PRODUCAO-MAPA-E-MOTOR` existir,
a demanda da revisão passa a vir do que a montagem entregou ao revisor. Esta
spec não constrói isso; a fase 3 se escreve junto com aquela spec.

## 9. Decisões do dono (23/11/2026)

1. **O cartão** da §5: sim, como está.
2. **Na sexta**, "Próximos dias" mostra só a **segunda** seguinte.
3. **A ordem pela data da falta** vale na revisão desde a fase 1 (o dono: *"já
   usa"*), sem esperar a chave `ordem_por_falta`. A chave continua valendo só
   para o `/api/revisao/producao` de antes; com a tela azul aposentada, ela fica
   sem uso na revisão — anotar no cartão R-REV-03.
4. **A faixa vermelha e o som** da venda nova de hoje: sim, uma vez, sem travar.
5. **Dois revisores** no mesmo SKU: a lista atualizando em poucos segundos basta.
6. Divergência a anotar: a 206 Horários de coleta trabalha de segunda a sábado;
   a semana desta tela é até sexta (a coleta, o dono, é de segunda a sexta).

### A ideia da peça reservada (o dono, 23/11: *"apenas uma ideia"*) — fica para a fase 3

Reservar a necessidade quando a revisão **abre**, para o outro tablet ver o
número já descontado. **Não entra na fase 1**, por três razões:
- a revisão aberta **não existe no servidor** hoje: o primeiro bipe só liga o
  cronômetro no tablet. Reservar pede gravar a revisão em andamento (schema e
  rota novos) e soltar a reserva do tablet que ficou aberto e foi abandonado;
- **não há conta dobrada sem ela**: a necessidade é escolhida no bipe que
  **fecha**, um de cada vez; a segunda peça do mesmo SKU vai para a necessidade
  seguinte (amanhã, ou o alvo), e nada sobra sem destino;
- com o **código único por peça** da `PRODUCAO-MAPA-E-MOTOR`, a peça já chega
  com nome, e a reserva se decide ali (fase 3).

## 10. Fases

| Fase | O quê | Risco |
|---|---|---|
| **1** | A regra: tela única, a lista em três partes, a decisão do modo no servidor, o cartão, "Ver a semana", os avisos. Visual de hoje | 🟡 |
| **2** | O design novo, tablet deitado, para um ou dois revisores | 🟢/🟡 |
| **3** | A demanda vindo da Montagem (107) | com a `PRODUCAO-MAPA-E-MOTOR` |

## 11. Onde mora

Nenhuma tela nova. Tudo na **101 Revisão** (Produção · Medida padrão), que se
liga à 103 Subir PDF (a urgência), à 201 Etiqueta de Venda (as vendas de hoje),
à 401 Planejamento (a falta por dia e o alvo) e à 102 Embalagem (a fila). "Ver a
semana" é do mesmo assunto da tela, e por isso não é tela.

## 12. Alçada

- Telas novas: nenhuma.
- Ações novas: nenhuma — a leitura nova da lista abre com as chaves da 101
  (`revisao.executar`), com linha própria no `permDaRota`.
- Setores novos: nenhum.

## 13. Como testar (fase 1)

- A peça bipada vai para a primeira necessidade (hoje → próximos dias → alvo), e
  o `revisao.modo` gravado bate; a de `hoje` abate a ordem do dia na embalagem.
- A venda da 201 com peça livre não aparece em "Hoje".
- As três partes batem com a ordem do dia, a 401 "Vendas por dia" e o `precisa`
  da 401, SKU a SKU (nenhuma conta na tela).
- O SKU sem falta nenhuma avisa e deixa passar.
- `teste_revisao.js`, `teste_ordem_dia.js`, `teste_vendas_futuras.js` e
  `teste_estoque.js` passando sem mudar o esperado do que não mudou; e abrir a
  tela (testador-tela) a 1024 e 1366 px deitado.
