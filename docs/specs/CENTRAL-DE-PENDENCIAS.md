> **STATUS · 27/10/2026 — RASCUNHO, AGUARDANDO O DONO** · `NOVIDADE` + `REGRA`
> · risco 🔴 (permissões, telas de decisão). Nasceu de uma frase do dono ao
> decidir onde fica a venda da folha sem etiqueta: *"Essas pendências e esses
> tipos de problemas devemos concentrar em apenas uma única tela, para não
> ficar o problema espalhado."* **Nada construído.** As perguntas do §6 são do
> dono.

# A central de pendências — um lugar só para o que espera uma pessoa

## 1. O problema

Hoje o que espera uma decisão está espalhado em **pelo menos seis lugares**, e
um deles nem fica na tela. Levantamento no código em 27/10/2026:

| Onde mora hoje | O que espera uma pessoa | Quem decide hoje |
|---|---|---|
| **Admin → Bloqueados** | SKU fora do cadastro · divergência de leitura · pacote de vários SKUs e quantidade em dúvida · etiqueta em formato desconhecido (agência ou coleta?) · venda da folha sem etiqueta (R-PDF-09, desde 27/10) · canceladas depois da etiqueta (só leitura) | `sku.cadastrar` · `pacote.assinar` · `@admin` |
| **Admin → Correções** (Mesa) | volumes fantasmas · vendas vencidas · conferências antigas · venda futura para reabrir · tirar da fila | `correcao.executar` |
| **Admin → Estoque** | pedidos de ajuste de saldo esperando a segunda pessoa | `estoque.aprovar_ajuste` |
| **Admin → Contagem / Inventário** | contagens esperando aprovação ou recontagem | `contagem.aprovar` |
| **Admin → Pendências de SKU** | SKU sem medida, cor ou modelo no cadastro | `sku.cadastrar` |
| **Tela de Conferência** | sobras esperando decisão (↩ Sobrou) | `carregamento.executar` |
| **Aviso do upload** (só na hora) | conta do PDF que não fecha (`resto`) | ninguém — some quando a tela fecha |

E o sob medida tem os seus (pedidos de correção do corte, baixa de boleto e
descarte de sobra em duas pessoas, pendência da bancada), em telas próprias.

**O modo de falhar** é o da armadilha #6 (§7 do CLAUDE.md) e o da NF 8301:
pendência que ninguém vê não é pendência, é atraso. Quanto mais lugares, maior
a chance de um ficar sem dono no dia.

## 2. O que a central faria

**Uma tela só — "Pendências"** — com um card por tipo de pendência, cada card:

1. **diz o que está esperando e há quanto tempo**, com a cor pelo tempo;
2. **diz o que fazer**, em uma frase, e **quem pode** fazer;
3. **resolve ali mesmo** quando a decisão é curta (assinar, marcar, escolher),
   ou **leva direto** para a tela onde ela se resolve, quando é longa (uma
   contagem, um ajuste);
4. **zera**: decidido, sai. Número que nunca zera vira paisagem (§5, #10).

No topo, **um número só**: quantas pendências existem, e quantas são de quem
está olhando. As telas de bancada (Etiqueta de Venda, Conferência) mostram só
uma linha apontando para a central, sem botão — o desenho que a fase 1-B da
`CONFERENCIA-DA-QUANTIDADE` já usa.

**O que não muda:** quem pode decidir cada coisa. A central junta onde se vê,
não muda quem decide — cada card continua com a permissão que tem hoje.

## 3. Princípios

- **Um lugar para ver, um lugar para decidir.** A mesma pendência não pode ser
  resolvida em duas telas — duas portas para a mesma decisão é como uma delas
  sai errada sem ninguém saber (a lição do upload da etiqueta do kit, §4).
- **Aviso que só aparece uma vez vira linha na central.** O caso da NF 8301.
- **Cada card mostra só o que a pessoa pode resolver**, e diz quantas outras
  existem para quem pode — esconder sem dizer é a pendência que some.
- **Nada some por tempo.** Só sai quando alguém decide, ou quando o próprio
  sistema vê que resolveu (a etiqueta que chegou).

## 4. Fases propostas

| Fase | O quê |
|---|---|
| **1** | A tela "Pendências" (a aba Bloqueados renomeada e ampliada) com um **painel de contadores** de todos os lugares do §1, cada um com o link para onde se resolve hoje. Nada se move ainda: é ver tudo num lugar só. O aviso do upload (`resto`) vira linha |
| **2** | Os cards de decisão curta passam para dentro da central (Correções, sobras da Conferência); os de decisão longa (contagem, ajuste) ficam com link |
| **3** | As telas de bancada ganham a linha de aviso; o sob medida entra, se o dono quiser |

## 5. Fica de fora

- Mudar quem pode decidir o quê.
- Mudar as regras de cada pendência (o que retém, o que libera).

## 6. Perguntas ao dono

| # | Pergunta | Proposta |
|---|---|---|
| C1 | A central é a aba **Bloqueados renomeada** ("Pendências"), ou uma tela nova fora do Admin? | Bloqueados renomeada: já é onde a fábrica olha |
| C2 | Quem vê a central? Ela fica dentro do Admin, e quem opera a bancada pode não ter Admin | Todo mundo que tem alguma pendência para decidir; cada um vê os cards dele e o total dos outros |
| C3 | O sob medida entra na mesma central? | Numa fase 3, depois de a do PCP estar em uso |
| C4 | Quer uma linha no **Painel da TV** com o número de pendências? | Sim, só o número, para ninguém dizer que não viu |
| C5 | Alguma pendência deve **avisar fora do sistema** (WhatsApp, e-mail) quando passar de N dias? | Fica para depois — primeiro ver o volume real |
