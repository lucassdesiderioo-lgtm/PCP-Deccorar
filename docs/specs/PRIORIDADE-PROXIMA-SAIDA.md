# PRIORIDADE-PROXIMA-SAIDA — a venda da próxima saída vira prioridade assim que o PDF sobe

> **STATUS — 26/11/2026: APROVADA PELO DONO** (*"a, sem coleta no sábado, pode
> seguir"*) · **as duas fases construídas juntas em 26/11/2026, falta subir** ·
> `teste_prioridade_dia.js` (39) · cartões R-PRI-01 a 03 em
> `docs/regras/expedicao.md`; linha em `docs/DECISOES.md`.
>
> **O que mudou na construção** (vale o que está aqui):
> - **sem coleta no sábado** (o dono): a próxima saída é de segunda a sexta;
> - **relatórios: opção (a)** — a falta de estoque da 904 não muda de conta, e a
>   tela diz que a venda de amanhã subida hoje pode contar nos dois dias;
> - o dono único se chama `prioridade_dia.js`, e a urgência com a data explícita
>   (o `rastrear.js`) fica pela régua antiga, porque pergunta o que UM PDF gerou;
> - a virada (R-PRI-06 aqui, **R-PRI-03** no cartão) só aplica quando ninguém
>   aplicou hoje e não há ordem do PDF de hoje gravada;
> - os cartões ficaram três (R-PRI-01 a 03): a ordem, o dono e o que não muda
>   estão dentro do R-PRI-02.
>
> ~~RASCUNHO, esperando a aprovação do dono. Nada construído.~~
> Tipo: `REGRA` · risco 🟡 (muda prioridade e número mostrado em tela; **não mexe
> em saldo, na baixa nem na trava da impressão**). Nasceu da revisão da 102
> Embalagem pedida pelo dono em 25/11/2026, às 18h, com as etiquetas do dia
> seguinte já lançadas e várias sem estoque.
>
> Respostas do dono (26/11/2026) às perguntas do diagnóstico:
> 1. a venda do dia seguinte vira prioridade **assim que o PDF dela sobe** — e na
>    sexta, depois do primeiro PDF do dia, o PDF que sobe é o da segunda ("sempre
>    que conseguimos subimos os PDFs do dia seguinte no fim do dia anterior, ou
>    assim que acabaram as vendas entregues do dia");
> 2. a atrasada e a de hoje ficam **acima** da do dia seguinte;
> 3. a tarja "sem estoque" da 201 conta a venda do dia seguinte junto; o "Faltam
>    imprimir" continua só com a de hoje;
> 4. a urgência da 101 usa a mesma régua, **sem depender do dia em que o PDF
>    subiu**;
> 5. relatórios — opção (a) (§6); e não há coleta no sábado.

---

## 1. O problema

O sistema tem **duas réguas** para "venda de hoje", e elas discordam justamente
no horário em que a fábrica sobe o PDF do dia seguinte:

| Quem | Régua | PDF de amanhã subido hoje às 18h | Amanhã cedo, sem PDF novo |
|---|---|---|---|
| 101 Revisão (Hoje), TV, aviso de status — `urgencia.js` → `ordem_dia.js` | o **dia do upload** (`lote.data`) | entra em Hoje, urgente | **some** (o PDF é "de ontem") |
| 102 Embalagem (vermelho), tarja da 201 — `tarja_estoque.js` → `fila_dia.js` | a **data de despacho** (`despachar_em ≤ hoje`) | **não** é vermelho (vai ao âmbar) | vira vermelho |

Resultado: às 18h a 101 manda revisar a peça, a 102 a põe atrás do vermelho, e a
201 só acusa a falta pela regra antiga do painel "Pra despachar depois". E na
manhã seguinte o furo é o contrário: a urgência deixa de ver as vendas que
subiram na véspera (e com PDF novo, só as do PDF novo contam).

## 2. A regra nova

**R-PRI-01 — A próxima saída.** É o **próximo dia de coleta depois de hoje**: o
próximo dia de segunda a sexta, pulando o dia que a 206 marca "sem coleta"
(feriado ou outro motivo). Na sexta e no sábado é a segunda. *(Confirmar: há
coleta no sábado? Hoje a 206 lança de segunda a sábado e a 101 olha de segunda a
sexta.)*

**R-PRI-02 — O que é prioridade.** Toda venda **já no sistema** (o PDF subiu),
**sem etiqueta impressa**, que vence **até a próxima saída** — e a atrasada e a
sem data lida, como sempre. Não importa o dia em que o PDF subiu. A venda que só
vence depois da próxima saída **não** entra (o PDF traz vendas de semanas à frente,
§8 armadilha #7).

**R-PRI-03 — A ordem.** Dentro da prioridade: **atrasada e hoje em cima**, depois
a da próxima saída, com a data escrita no cartão ("para seg 30/11"). O livre é
usado primeiro por hoje: a falta da próxima saída é o que sobra depois de hoje.

**R-PRI-04 — Um dono só.** `prioridade_dia.js` (novo) responde as duas perguntas:
"qual é a próxima saída?" e "quanto cada SKU pede até ela, separado em hoje e
próxima saída?". Todo mundo abaixo lê dele (#12).

**R-PRI-05 — O que NÃO muda.** O `fila_dia.js` (`VENCE_HOJE`) continua sendo
"trabalho de impressão de hoje": a lista "Faltam imprimir" da 201, a trava da 201
(caixa de dia anterior), o `fechar_vencidos.js` e as barras da 202 não mudam. A
trava da impressão (`/api/embalar`), a baixa, o livre e a planilha também não.

## 3. O que cada tela passa a fazer

| Tela | Hoje | Depois |
|---|---|---|
| **102 Embalagem** | vermelho = falta de hoje | vermelho = falta de hoje **e** da próxima saída; a de hoje em cima; o cartão diz "para seg 30/11"; o topo diz "faltam embalar N do dia (K para amanhã)" |
| **201 Etiqueta de Venda** | tarja conta só a fila de hoje | tarja conta hoje + próxima saída: *"só 2 livres para 3 de hoje e 4 de amanhã — faltam 5"*; o "Faltam imprimir" **não** muda; no painel "Pra despachar depois" a venda da próxima saída ganha a mesma tarja |
| **101 Revisão (Hoje)** | a urgência do PDF subido hoje | a urgência de toda venda até a próxima saída, qualquer que seja o dia do upload; a peça revisada para ela vai como pedido de hoje (abate a ordem do dia na embalagem, R-EMB-03 sem mudança) |
| **TV** (`/painel`) e aviso de status | leem o `ordem_dia` | seguem sozinhos (a falta passa a ser "até a próxima saída"; o rótulo da TV muda para dizer isso) |

**R-PRI-06 — A urgência se refaz sozinha na virada do dia.** Hoje ela só se
refaz no upload. Passa a se refazer também na **primeira leitura do dia** (101,
102, TV), sem cron, como a lista do Inventário (R-EST-24). É idempotente
(R-URG-02): apaga as ordens `ml` do dia e refaz. Sem isso, a manhã seguinte
continua com o Hoje vazio até alguém subir PDF.

⚠️ **A 101 não pode contar a mesma venda em Hoje e nos Próximos dias.** Hoje ela
liga "o PDF de hoje" à planilha pela venda ou pelo pack; passa a ligar **o
conjunto da prioridade** (R-PRI-02). É o ponto mais delicado da construção e tem
caso de teste próprio.

## 4. Fases

1. **O dono e a urgência** — `prioridade_dia.js`; `urgencia.calcular` pela régua
   nova; o refazer na virada; a 101 ligando o conjunto certo à planilha.
2. **As telas** — o vermelho da 102 com as duas partes; a tarja da 201; o rótulo
   da TV.

As duas podem entrar juntas (a 102 sem a urgência certa mostraria vermelho que a
101 não manda revisar).

## 5. Como testar

- `teste_prioridade_dia.js` (novo): sexta com PDF de segunda; quarta com quinta
  "sem coleta" na 206; venda de 3 semanas à frente fora; a manhã seguinte sem PDF
  novo mantendo a urgência; dois PDFs no mesmo dia; o livre usado primeiro por
  hoje; a mesma venda nunca em Hoje e nos Próximos dias.
- Sem mudar o esperado: `teste_tarja_estoque.js`, `teste_ordem_dia.js`,
  `teste_cruzamento.js`, `teste_trava_dia.js`, `teste_etiqueta.js`, `teste_carga.js`.
  Com o esperado novo (dito caso a caso): `teste_embalagem_prioridade.js`,
  `teste_revisao_tela_unica.js`, `teste_diagnosticar_tarja_estoque.js`.
- Abrir a 102, a 201 e a 101 com um banco às 18h de uma sexta.

## 6. Em aberto — os relatórios

A 904 tem a linha **"falta de estoque"**, que é o retrato da urgência de cada dia
(o último PDF do dia, `urgencia.porDia`). Com a régua nova:

- a venda de segunda subida na sexta às 18h entra na falta **de sexta**;
- se na segunda ela ainda estiver sem peça, entra **de novo** na de segunda.

Ou seja, a mesma venda pode contar em dois dias na semana. Três caminhos:

- **(a) recomendado: o relatório não muda**, e a tela escreve "falta de estoque =
  peças que a urgência pedia no fim de cada dia, até a próxima saída". É o que a
  fábrica de fato teve que correr para produzir naquele dia;
- (b) contar cada venda uma vez só, no dia em que entrou na urgência (precisa
  guardar o vínculo venda → ordem, que hoje não existe);
- (c) contar pela data de despacho da venda (muda a série que já existe).

Nenhum outro relatório usa estas réguas (vendas, embaladas, despacho no prazo e
devoluções não mudam).

## Alçada

Nenhuma tela, ação ou setor novo.

## Onde mora

Nenhuma tela, aba ou função nova. `prioridade_dia.js` é domínio, sem tela.
