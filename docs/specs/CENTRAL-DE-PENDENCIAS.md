> **STATUS · 27/10/2026 — APROVADA, FASES 1 E 2 NO AR E CONFERIDAS** ·
> `NOVIDADE` · a fase 1 é risco 🟡 (só lê; não muda quem decide); a fase 2 é 🔴
> (tabela nova, mexe no upload).
>
> **Fase 1 no ar e conferida (27/10/2026, PR #238):** o dono fez o deploy e disse
> que os números batem com os de cada tela.
>
> **Fase 2 em código (27/10/2026, plano aprovado pelo dono):** (A) o PDF cuja
> conta não fecha sem explicação fica gravado em `pdf_conta_aberta` e num card
> da aba, até uma pessoa resolver com *conferi, o sistema está certo* ou
> *corrigi o que faltava* e o motivo (R-PDF-10); (B) o passivo da Mesa de
> correções é desenhado na aba Pendências, e a decisão continua na aba
> Correções. `teste_conta_aberta.js` (42). ✅ **No ar e conferida em
> 27/10/2026** (PR #239): o dono conferiu a Mesa na aba e o clique. O card do
> PDF cuja conta não fecha ainda não apareceu com dado real.
>
> **Mudou na construção da fase 2:** as **sobras não vieram** — o ↩ Sobrou se
> decide com a caixa na mão, bipando a etiqueta e cada SKU, e não pelo Admin.
> Devoluções, ajuste e contagem continuam com o link da fase 1. O PDF se
> reconhece pelas vendas, não pelos bytes (o mesmo PDF baixado de novo muda de
> bytes). Nasceu de uma frase do dono ao
> decidir onde fica a venda da folha sem etiqueta: *"Essas pendências e esses
> tipos de problemas devemos concentrar em apenas uma única tela, para não
> ficar o problema espalhado."* O dono mandou seguir com as propostas do §6 e
> aprovou o plano da fase 1 no mesmo dia.
>
> **Fase 1 em código (27/10/2026):** a aba Bloqueados virou **"Pendências"**, com
> um painel no topo que dá o número de cada um dos lugares do §1 — oito linhas
> mais a de Bloqueados —, há quantos dias espera a mais antiga, quem resolve
> (pelo nome da permissão) e o caminho para a tela dona. `pendencias_dominio.js`
> não conta nada: pergunta à função da tela dona. A aba "Pendências de SKU"
> virou **"SKU incompleto"**. `teste_pendencias.js` (46). Aguarda deploy.
>
> **Mudou na construção:** o levantamento achou um **sétimo** lugar — as
> **devoluções** esperando a baixa do admin — e o inventário são **duas**
> linhas (aprovar e recontar), porque são permissões diferentes. A cancelada
> na fábrica aparece em Correções **e** em Sobras (as duas portas a resolvem);
> o total a conta uma vez. O aviso do upload (`resto`) virar linha gravada
> ficou para a fase 2: precisa de tabela.

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
| **2** | ✅ em código (27/10): o PDF cuja conta não fecha vira pendência gravada; o passivo da Mesa é desenhado na central, com a decisão na aba Correções. ~~Sobras da Conferência~~ ficam na Conferência (decisão física) |
| **3** | As telas de bancada ganham a linha de aviso; o sob medida entra, se o dono quiser |

## 5. Fica de fora

- Mudar quem pode decidir o quê.
- Mudar as regras de cada pendência (o que retém, o que libera).

## 6. Perguntas ao dono

| # | Pergunta | Proposta |
|---|---|---|
| C1 | A central é a aba **Bloqueados renomeada** ("Pendências"), ou uma tela nova fora do Admin? | ✅ **Bloqueados renomeada** (dono, 27/10/2026) |
| C2 | Quem vê a central? Ela fica dentro do Admin, e quem opera a bancada pode não ter Admin | ✅ Na fase 1, **quem abre o Admin**, vendo todas as linhas; quem não tem Admin, na fase 3 (dono, 27/10/2026) |
| C3 | O sob medida entra na mesma central? | ✅ **Depois** (dono, 27/10/2026) |
| C4 | Quer uma linha no **Painel da TV** com o número de pendências? | ✅ **Sim, na fase 3**, junto com a linha da bancada (dono, 27/10/2026) |
| C5 | Alguma pendência deve **avisar fora do sistema** (WhatsApp, e-mail) quando passar de N dias? | ✅ **Depois**, quando o volume real for conhecido (dono, 27/10/2026) |
