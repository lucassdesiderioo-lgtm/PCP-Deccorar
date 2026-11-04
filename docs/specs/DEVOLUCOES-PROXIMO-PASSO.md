# Devoluções — o próximo passo de cada caso

```
STATUS
Situação: FASES 1, 2 e 3 EM CÓDIGO (04/11/2026), num PR só — falta o deploy
  e a conferência do dono na tela
Tipo: NOVIDADE · risco 🟡 nas fases 1 e 2, 🔴 na fase 3 (schema)
Aprovada pelo dono em 04/11/2026 ("pode mesclar e seguir com a fase 1, 2, 3")
O que mudou na construção (vale o CLAUDE.md §9-B):
  - "quem pode lançar caso novo" ficou como estava: `devolucao.lancar`, que já
    é separada e se dá pela tela de Acessos (decisão do dono, 04/11/2026);
  - a lista de responsável mostra só pessoa ativa com `devolucao.lancar` ou
    `devolucao.acompanhar` (decisão do dono, 04/11/2026);
  - os dois tipos continuam em dois cards; os grupos ficam dentro de cada um
    (§4, fase 2: "a decidir com a tela aberta");
  - C8 (a caminho) também devolve a vez para nós quando parado, como C12 e M5;
  - M1 sem a peça revisada pede a revisão hoje (vez de quem recebe a peça);
  - o "Meus casos" lembra a escolha por aparelho (localStorage).
Testes: teste_devolucao_casos.js 732 → 820 · teste_devolucao_casos_tela.js 141 → 170
Depende de: DEVOLUCOES-ACOMPANHAMENTO.md (no ar) e CLAUDE.md §9-B
Decisões do dono já tomadas (04/11/2026):
  - o responsável vira pessoa do sistema, com o filtro "Meus casos";
  - a lista vira dois grupos: "Esperando a gente" e "Esperando outros";
  - o mapa dos passos da §3 é a base.
Criada em: 04/11/2026
```

## 1. O problema

A tela `/devolucao-casos` mostra o **estado** do caso — a etapa ("Coleta
pedida"), o prazo ("comprovante: faltam 2 dias"), a cor, o "parado". Ela não diz
a **ação**. Quem abre o caso, inclusive o responsável, tem de deduzir sozinho
se precisa ligar para a transportadora, mandar o comprovante ao ML, acompanhar a
entrega, esperar a peça ou cobrar o reembolso.

O dono (04/11/2026): *"quando ele abre o caso, não está claro qual é o próximo
passo que ele precisa dar … se ele precisa contactar a transportadora … se ele
precisa acompanhar o recebimento da mercadoria."*

## 2. A regra central

> **Todo caso aberto diz, numa frase, o próximo passo, de quem é a vez e até
> quando.** O passo é **calculado** a partir do que já está gravado — nunca
> gravado, nunca digitado. Se o passo não dá para calcular, a tela diz o dado
> que falta lançar.

- **Dono único:** `devcaso_dominio.proximoPasso(caso, …)`. A lista, o caso e
  (se o dono quiser) a central de Pendências leem dali. Nenhuma tela monta o
  passo sozinha — duas réguas divergem no primeiro ajuste (armadilha #12).
- **O passo não muda regra nenhuma:** etapas, prazos, permissões e o que
  encerra um caso continuam exatamente como no CLAUDE.md §9-B. O passo só lê.
- **O sistema não dá o passo sozinho.** Ele aponta o botão que já existe.

Cada passo traz cinco coisas:

| Campo | Exemplo |
|---|---|
| o que fazer | "Mandar o comprovante do agendamento ao ML" |
| de quem é a vez | `nos` · `transportadora` · `ml` · `comprador` · `receber_peca` · `dinheiro` |
| até quando | o prazo que corre, quando há ("até 06/11") |
| quem pode | o nome da permissão ou da tela ("quem acompanha", "Receber peça") |
| o botão | a ação do caso que resolve o passo, quando existe |

## 3. O mapa dos passos

A primeira linha que bate, de cima para baixo, é o passo. Os dados citados já
existem no banco (§9-B).

### Nós coletamos

| # | Quando | Próximo passo | Vez de |
|---|---|---|---|
| C1 | algum prazo **vencido** | Lançar o prazo novo do ML ou encerrar como perda | dinheiro |
| C2 | lançado, sem transportadora | Pedir a coleta à transportadora (sugestão pelo CEP) | nós |
| C3 | coleta pedida, tentativa sem `agendada_para` | Confirmar com a transportadora a data da coleta e lançar | nós |
| C4 | última tentativa "não achou o cliente" | Remarcar a coleta antes de DD/MM (prazo da coleta) | nós |
| C5 | coleta agendada, documentos faltando | Mandar o comprovante do agendamento ao ML — anexar: *lista do que falta* | nós |
| C6 | documentos ao ML, `agendada_para` ainda não chegou | Aguardar a coleta de DD/MM | transportadora |
| C7 | `agendada_para` passou e não está "a caminho" | Ligar para a transportadora: a coleta de DD/MM não foi confirmada | nós |
| C8 | a caminho | Acompanhar a entrega; quando chegar, marcar "A caixa chegou" | transportadora |
| C9 | chegou, sem revisão | Revisar a peça na tela Receber peça | receber_peca |
| C10 | revisado, ML não avisado | Avisar o ML que recebemos | nós |
| C11 | valor do ML "a pedir" | Pedir o valor ao ML | nós |
| C12 | valor do ML "pedido" | Aguardar o ML pagar (pedido há N dias); parado ≥ `devol_parado_dias` volta a ser **nós**: cobrar o ML | ml |
| C13 | valor "já veio", reembolso não baixado | Conferir no Mercado Pago e dar a baixa do reembolso | dinheiro |

### ML devolve

| # | Quando | Próximo passo | Vez de |
|---|---|---|---|
| M1 | "revisar no ML até" vencido | Marcar "Já revisei" no ML hoje — o prazo de contestar passou/está passando | nós |
| M2 | aguardando chegar | Nada a fazer: o ML traz a peça (há N dias) | ml |
| M3 | chegou, sem revisão | Revisar a peça na tela Receber peça | receber_peca |
| M4 | revisado | O `falta` que já existe, em ordem: dar a baixa · marcar "Já revisei" no ML · decidir se pede revisão do frete/reputação | nós |
| M5 | revisão pedida, sem resposta | Aguardar a resposta do ML (pedida há N dias); parado ≥ `devol_parado_dias` volta a ser **nós**: cobrar o ML | ml |

> A ordem das linhas é decisão de produto e vai ser revista com o dono antes da
> fase 1 — em especial C1 (vencido em cima de tudo) e o "parado" que devolve a
> vez para nós em C12 e M5.

## 4. As telas

### Fase 1 — o cartão no alto do caso

Antes de qualquer outro bloco do caso: **"Próximo passo"**, com a frase em letra
grande, o "até quando", de quem é a vez e o botão. Quando a vez é de fora
(transportadora, ML), o cartão diz isso em cinza — *"esperando a transportadora:
coleta marcada para 06/11"* — e não pede ação.

### Fase 2 — a lista em dois grupos

- **"Esperando a gente"** em cima, pela ordem do prazo (o mais perto primeiro),
  cada caso com a linha *"→ próximo passo"*.
- **"Esperando outros"** embaixo, recolhido por padrão, com o número no título.
- Os dois tipos (ML devolve · Nós coletamos) continuam como hoje dentro de cada
  grupo, ou viram uma lista só — a decidir com a tela aberta.

### Fase 3 — o responsável como pessoa e "Meus casos"  🔴

- Coluna nova `devolucao_caso.responsavel_id` (+ `responsavel_nome` como
  retrato, como `revisao.usuario_nome`), no `CREATE` e no `ALTER` (§17).
- O campo "Responsável" vira escolha entre as pessoas ativas do PCP. O texto
  livre antigo (`responsavel`) **continua aparecendo** até alguém escolher a
  pessoa; não é apagado nem convertido sozinho.
- Filtro **"Meus casos"** no topo: os casos em que a pessoa logada é a
  responsável. A pessoa sem nenhum caso vê a lista inteira.
- A porta de pessoas passa só id e nome (a regra do R-SMR-05).

## 5. Fica de fora

- Mudar etapas, prazos, permissões ou o que encerra um caso.
- Aviso por WhatsApp ou e-mail.
- Qualquer automação que dê o passo sozinha.
- O passo na central de Pendências (pode virar uma fase 4, se o dono quiser).

## 6. Testes que cada fase exige

- **Fase 1:** um caso de teste por linha do mapa (C1–C13, M1–M5): monta o
  estado, confere a frase, a vez, o prazo e o botão; nenhum valor em reais no
  `proximo` para quem não lança nem acompanha (varredura das chaves).
- **Fase 2:** teste de tela com casos nos dois grupos, a ordem pelo prazo, o
  grupo de fora recolhido, e 400 px / 768 px sem rolar de lado.
- **Fase 3:** teste antes do código (🔴): coluna nova num banco novo e num
  banco antigo, o texto livre preservado, "Meus casos" filtrando pelo login.
- Sempre: `teste_devolucao_casos.js`, `teste_devolucao_casos_tela.js`,
  `teste_devolucao.js` sem mudar o esperado, a suíte inteira e o teste de
  segurança.
