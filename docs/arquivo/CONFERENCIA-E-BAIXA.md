> **ARQUIVADA EM 22/10/2026 — CONCLUÍDA.** As quatro entregas (fases 0, 1, 2-A e 2-B)
> estão no ar, e as três provas com dado real foram relatadas pelo dono no mesmo dia:
> a primeira sobra voltou à prateleira com o saldo subindo, a primeira caixa conferida
> baixou o estoque, e as caixas antigas foram fechadas pela tela (Admin → Correções).
> As regras moram no `CLAUDE.md` §2 e nos cartões R-EST-03, R-REC-01 a R-REC-05,
> R-COR-03, R-COR-06 e R-COR-07. Histórico — não use como fonte de regra.

> **STATUS · 22/10/2026 — EM CONSTRUÇÃO** · `REGRA` · risco 🔴 (estoque e dados de
> produção) · aprovada pelo dono em 22/10/2026 ("pode seguir"), com a D8 confirmada
> (§11).
>
> **Fase 0 em código (22/10/2026):** "Fechar conferências antigas" na Mesa de
> correções (`correcoes.js`, ação `conferencias`), o contador com o botão, o card na
> aba Correções e o `fechar_conferencias_antigas.js`. `teste_conferencia_antiga.js`
> (64 casos, escrito antes do código; quatro defeitos reintroduzidos um a um — data
> de hoje aceita reprova 2, a futura entrando 3, o carimbo só pelo despacho 1, a
> coleta sem `retirado_em` 1). Rodada na tela a 1440 e 400 px com banco semeado.
> **Mudanças na construção:**
> - **`saiu_por` NÃO é gravado** (a §7 dizia `'passivo'`): "Dar saída" e "Fechar
>   vencidos" também não gravam, e um valor novo nessa coluna seria lido por quem
>   hoje só conhece `coleta` e `agencia`. Quem fechou fica na `correcao`;
> - **a caixa impressa DEPOIS do despacho sai no dia da impressão**, e não no
>   despacho: a saída não pode vir antes de a caixa ter etiqueta;
> - **ficam de fora também a caixa no carro e a que está numa saída** — elas já têm
>   dono.
>
> **Fase 0 no ar (PR #216, 22/10/2026)**: o dono fez o deploy. **Ainda não foi
> relatado o fechamento do passivo real** (as mais de 500 caixas) pela tela — prova
> que não foi feita se escreve como não feita.
>
> **Fase 1 em código (22/10/2026):** a tela passou a se chamar **Conferência** — título
> *Conferência da etiqueta de venda*, rodapé (`nav.js`), app do iPad (manifest e
> `apple-mobile-web-app-title`), rótulo da área (`auth.js`) e da permissão
> (`permissoes.js`), o painel, a `/setor`, a Etiqueta de Venda, o admin e as
> mensagens do servidor que nomeiam a tela. **Mudanças na construção:**
> - **o verbo da ação física fica** — *"não carregar"*, *"faltam carregar no carro"*,
>   o estágio `carregado`: a caixa continua sendo carregada no carro;
> - **a frase da auditoria fica** (*"bipado no carregamento"*): as linhas antigas
>   estão gravadas com ela, e trocar só as novas partiria o histórico;
> - **a recusa do motorista "no carregamento" fica**: é o momento físico em que ela
>   acontece;
> - **o tablet que já tem o app na Tela de Início continua mostrando o nome antigo**
>   embaixo do ícone: o iPad guarda o nome na hora de adicionar. O app abre e
>   funciona igual; para o nome novo, apagar o ícone e adicionar de novo.
>
> Testes: a suíte inteira (`teste_*.js`, como no CI) e o teste da §10. Tela aberta a
> 1440, 1024, 768 e 400 px — o título cabe numa linha e nada rola de lado.
> **Fase 1 no ar (PR #217, 22/10/2026).**
>
> **A fase 2 foi dividida em duas entregas** (aprovado pelo dono em 22/10/2026, com
> os oito pontos do plano): **2-A** a baixa vai para a conferência; **2-B** o botão
> "Sobrou" na tela da Conferência.
>
> **Fase 2-A em código (22/10/2026):** `baixa_dominio.js` (dono único da baixa, da
> reserva e do livre), a coluna `lote.baixado_em` com a **virada** de uma vez só
> (`config.virada_baixa_conferencia`), a impressão sem baixa e com a trava no livre,
> a baixa no bipe da conferência (área, canto, peça a peça) e no "foi no caminhão",
> o tipo `conferencia` no livro, e o livre na urgência, no inventário, no número da
> Etiqueta de Venda e na aba Estoque ("N em caixa"). `teste_baixa_conferencia.js`
> (69 casos, escrito antes do código; dez defeitos reintroduzidos um a um: a
> impressão voltando a baixar reprova 22, a trava pelo saldo 8, a conferência sem
> baixa 13, o "foi no caminhão" sem baixa 2, baixar duas vezes 7, a virada sem guarda
> 1, a urgência pelo saldo 1, o inventário pelo saldo 2, o gráfico pela impressão 1 e
> a Mesa devolvendo o que não baixou 1). Seis testes (`area`, `carga`, `pecas_carga`,
> `saida_agencia`, `saida_coleta`, `segunda_pessoa`) ganharam SKU e livro no banco de
> mentira; `etiqueta`, `livro`, `estoque` e `recusa_motorista` passaram a travar a
> regra nova. Telas abertas com banco semeado.
> **Mudanças na construção:**
> - **o `precisa` da tela azul NÃO usa o livre** (a §5 dizia que usaria): o
>   comprometido da planilha já conta a venda impressa até ela sair, e descontar a
>   reserva contaria a peça duas vezes;
> - **o "foi no caminhão" baixa, mas não grava quem conferiu** (a §3 dizia que
>   gravaria): a pilha continua mostrando a caixa como "sem conferência";
> - **"Fechar conferências antigas" só pega caixa que já baixou**, e a prévia diz
>   quantas ficaram de fora;
> - **o "voltou" da Mesa só devolve o que baixou** — a 2-A não tira o "voltou" (isso é
>   da 2-B, junto com a Sobra);
> - **banco sem a coluna `baixado_em` segue a regra antiga** (a caixa com etiqueta
>   baixou): é o banco de antes da virada, e é o que mantém os testes antigos da Mesa
>   descrevendo o que eles descreviam;
> - **`carreg_route`, `saida_route` e `etq_route` garantem a coluna sozinhos**, além
>   do `exp_route`: módulo carregado fora da ordem do `server.js` não pode bater numa
>   coluna que não existe;
> - **o `backfill_pacote.js` só acerta saldo de caixa que já baixou**: a impressa e
>   não conferida baixa todas as peças na conferência.
>
> **Fase 2-A mesclada (PR #218, 22/10/2026).** Falta a primeira caixa real conferida
> baixando, relatada.
>
> **Fase 2-B em código (22/10/2026):** o **↩ Sobrou** na Conferência
> (`POST /api/carregamento/sobra`: prévia → SKU a SKU → motivo → confirma), a
> devolução no `baixa_dominio.devolver` (movimento `sobra`, +1 por peça, uma vez só,
> só se a caixa já tinha baixado), `cancelada_dominio.marcarSobra`, a lista **"Sobras
> esperando decisão"** (`GET /api/carregamento/sobras`), a Mesa sem o "voltou" (R-COR-03
> e R-COR-06), e o bipe da caixa cancelada mandando para o "Sobrou". O "🚫 Motorista
> recusou" saiu: virou um dos motivos, e a `RECUSA-DO-MOTORISTA` foi para
> `docs/arquivo/`. `teste_sobra.js` (103 casos, escrito antes do código; seis defeitos
> reintroduzidos um a um: devolver sem ter baixado reprova 3, quem conferiu marcando
> 18, a sobra não ficando decidida 6, aceitar peça faltando 4, aceitar SKU de outra
> caixa 4, a Mesa aceitando o "voltou" 2). `teste_correcao` e `teste_baixa_conferencia`
> passaram a travar a Mesa sem saldo; o `teste_recusa_motorista.js` saiu (os casos que
> valem moram no `teste_sobra.js`). Tela aberta a 1440 e 400 px com banco semeado: o
> fluxo inteiro, o texto do "Outro" sobrevivendo ao refresh de 4 s, sem rolagem lateral.
> **Os três pontos que a spec não dizia, decididos no plano (22/10/2026):**
> - **a sobra só confirma com TODAS as persianas bipadas** — é da caixa inteira (§4);
> - **o saldo volta se a caixa já tinha BAIXADO, e não "se foi conferida"** (a §3 dizia
>   "conferida"): a caixa impressa antes da virada baixou na impressão;
> - **quem conferiu a caixa não marca a sobra** (D8), sem liberação.
> **Mudanças na construção:**
> - **a venda que já estava cancelada mantém a origem** (planilha, motorista) e só ganha
>   a decisão; a origem `sobra` é da caixa que vira cancelada pelo "Sobrou";
> - **a sobra já nasce decidida** (`cancelada_resolvida_em`), senão iria parar no card
>   da Mesa pedindo uma segunda decisão sobre a mesma caixa;
> - **a lista olha as saídas de coleta fechadas** (as 60 mais recentes) e só mostra a
>   caixa que continua no canto: levada pelo caminhão seguinte, ela some sozinha;
> - **o gráfico de estoque não mostra a sobra**: a caixa que baixou e voltou continua
>   contando como saída no dia da baixa; o +1 está no livro (R-EST-13).
>
> ✅ **Fase 2-B no ar (PR #222, 22/10/2026)**: o dono fez o deploy e disse *"deu
> certo"*.
>
> ✅ **A PRIMEIRA SOBRA REAL FUNCIONOU (22/10/2026)**: o dono relatou *"a primeira
> sobra funcionou, saldo subiu"*.
>
> ✅ **A PRIMEIRA CAIXA CONFERIDA BAIXOU O ESTOQUE (22/10/2026)**: relato do dono.
>
> ✅ **AS CAIXAS ANTIGAS FORAM FECHADAS PELA TELA** (Admin → Correções → "Fechar
> conferências antigas em bloco"), relato do dono em 22/10/2026. A consulta só de
> leitura do mesmo dia confirmava: nenhuma caixa impressa esperando conferência. Prova que não foi feita se escreve
> como não feita — e a spec só vai para `docs/arquivo/` depois delas.

---

# Conferência e baixa — o estoque sai num lugar só: a conferência

> **Leia junto com:** `CLAUDE.md` §2 (onde o estoque entra e sai), §5 (Mesa de
> correções), §8-B (coleta e carregamento) · `docs/regras/estoque.md` (R-EST-03,
> R-EST-15) · `docs/regras/carregamento.md` (R-PIL, R-REC, R-SAI) ·
> `docs/regras/expedicao.md` (R-COR-03, R-COR-06) · spec `RECUSA-DO-MOTORISTA.md`.

## 1. O problema, nas palavras do dono

> *"A gente imprimiu a etiqueta de venda e nesse meio tempo de impressão houve duas
> peças canceladas. [...] Antes de fazer o carregamento das peças a gente faz a
> conferência. [...] E também é nesse local que sobra uma peça, ou duas, igual sobrou
> ontem. Então o estoque poderia de fato sair só depois que é carregado."*

> *"O operador conta a quantidade antes, que no caso é a conferência. Ele conferiu 50
> peças: vai ter 50 peças disponíveis pro caminhão do Mercado Livre retirar. Aí ele
> escaneia o QR Code no celular do motorista e vê a quantidade que o motorista
> escaneou. Se o motorista escaneou 48, ele leva 48 e sobram duas. E as duas que
> sobram a gente devolveria para o nosso estoque — são peças canceladas, na maioria
> das vezes."*

> *"A gente deveria concentrar a saída do estoque em um único lugar, de uma única
> forma, para não ter bagunça. A parte de correção é mais para o sistema ficar limpo
> e certo."*

Hoje a baixa (−1 por peça) acontece **na impressão da etiqueta de venda**
(`etq_route.js`, movimento `etiqueta`). Quando a venda é cancelada entre a impressão e
o caminhão, a peça baixou e continua na fábrica; para voltar são dois passos (a
expedição marca, o admin aceita pela Mesa — R-REC-01, R-COR-03), e na prática o saldo
fica errado até alguém lembrar.

E a tela do Carregamento ficou um tempo com problema: **mais de 500 caixas** aparecem
como impressas e não conferidas, de dias anteriores (a linha âmbar, R-PIL-02).

## 2. As decisões do dono (22/10/2026)

| # | Decisão |
|---|---|
| D1 | **A baixa sai da impressão e vai para a conferência.** A etiqueta impressa só **reserva** a peça |
| D2 | **A sobra é resolvida na expedição**: bipa a etiqueta, diz o motivo e bipa o SKU de cada persiana que volta para a prateleira. Não passa pela Mesa nem pelo admin |
| D3 | **Pode marcar sobra quem tem a etiqueta de venda e a conferência** (`carregamento.executar`). Sem chave nova |
| D4 | **A tela passa a se chamar "Conferência"** |
| D5 | **A saída do caminhão (QR do motorista, número, foto, sobras) continua como está.** É ela que acha as sobras: conferidas 50, o motorista escaneou 48, sobram 2 |
| D6 | **Não existe "caminhão não veio".** A expedição só precisa da conferência e das sobras |
| D7 | **O estoque sai num lugar só, de um jeito só: a conferência.** Nenhuma outra tela baixa saldo. A Mesa de correções serve para deixar o sistema limpo, não para mexer em estoque |
| D8 | **A sobra é marcada por outra pessoa**, como a conferência (leitura na §11) |
| D9 | **A limpeza tem data de corte escolhida pelo dono**: ele põe a data e o sistema puxa tudo o que está esperando conferência até ela |

> ⚠️ **D2 MUDA A D3 DA `RECUSA-DO-MOTORISTA`** ("dois passos: o admin aceita a volta
> ao estoque", 02/10/2026). **D7 muda a R-COR-03**: a Mesa deixa de devolver saldo.
> As duas vão para `docs/DECISOES.md` quando a spec for aprovada.

## 3. A regra nova

| Evento | Hoje | Depois |
|---|---|---|
| Peça embalada | +1 | +1 (não muda) |
| Etiqueta de venda impressa | **−1** por peça | **nenhum** — a peça fica **reservada** |
| Etiqueta reimpressa | nenhum | nenhum (não muda) |
| **Conferência bipou a caixa** (área ou canto) | nenhum | **−1 por peça** (movimento novo `conferencia`) |
| **Sobra** — persiana de volta, bipada | só pela Mesa, +1 | **+1 por peça** (movimento `sobra`) se a caixa foi conferida; se não foi, só solta a reserva |
| Mesa de correções (qualquer ação) | a "cancelada voltou" dá +1 | **nenhum** — saldo errado se corrige pelo **pedido de ajuste** (duas pessoas, §18) |
| Sob medida | nenhum | nenhum (não muda — §7) |

**UM LUGAR, UMA FUNÇÃO.** A baixa é uma função só do `estoque_dominio.js` (ex.
`baixarVolume`) e quem a chama é **só o bipe da conferência** (`carreg_route.js →
concluir`). Ela roda uma vez por volume: coluna nova `lote.baixado_em`, preenchida na
baixa; com ela cheia, conferir de novo não baixa de novo.

**As duas portas que hoje tiram a caixa sem conferência deixam de existir como saída
de estoque:**

| Porta | Hoje | Depois |
|---|---|---|
| **"Foi no caminhão"** (sobras da saída, R-SAI-04): caixa `embalado` que o motorista levou sem ninguém conferir | vira `carregado`, sem saldo | **é uma conferência por botão**: grava quem apertou em `conferido_por` e chama a mesma baixa. Não é outra porta — é a conferência feita depois |
| **"Dar saída"** da Mesa em caixa `embalado` não conferida | vira `carregado`, sem saldo | continua sem mexer em saldo (D7). A prévia **avisa**: *"esta caixa nunca foi conferida — o estoque está N peça(s) acima; peça um ajuste"*, com o botão que já existe ("Pedir ajuste de saldo") |

> ⚠️ **O TESTE TEM QUE VARRER O CÓDIGO** procurando qualquer chamada de baixa fora do
> bipe da conferência e do "foi no caminhão" — como o `teste_livro.js` já recusa
> `UPDATE skus SET estoque` fora do domínio. Sem isso o "lugar só" dura até a próxima
> rota escrita copiando a de cima.

**A caixa de várias persianas** baixa por peça, como hoje (R-VOL-05): a conferência
peça a peça (R-PEC-01) já existe; a baixa acontece quando a caixa fecha.

**A caixa de agência** baixa na conferência da área (o primeiro bipe), não na viagem. A
viagem não mexe em saldo.

## 4. A sobra

O caminho de todo dia, na coleta:

```
conferência        → o operador bipa 50 caixas para o canto       (−50 no estoque)
saída do caminhão  → QR do motorista: ele escaneou 48             (já existe, D5)
                   → bipa as 2 que ficaram no canto (sobras)      (já existe, R-SAI-02)
SOBRA              → para cada uma: motivo + bipe do SKU de cada persiana
                   → a persiana volta para a prateleira           (+1 por peça)
```

Botão **"Sobrou"** na Conferência (substitui o "🚫 Motorista recusou", que vira um dos
motivos). Funciona para a caixa de coleta e para a de agência:

1. bipa a **etiqueta** da caixa que sobrou → a tela mostra cliente, NF e persianas;
2. motivo: **[Venda cancelada] [Motorista recusou] [Outro: ______]**;
3. bipa o **SKU de cada persiana** → cada bipe confere com a caixa; SKU que não é dela é
   recusado;
4. confirma.

O que o sistema faz:
- o volume vira `cancelado`, com `cancelada_origem='sobra'`, o motivo, quem e quando
  (colunas que já existem). **Não `'conferencia'`**: esse valor já é do
  `conferir_canceladas.js`, e as duas origens se confundiriam;
- caixa conferida: **+1 por persiana bipada**, movimento `sobra`, referência `lote:<id>`;
- caixa não conferida: nenhum movimento — a reserva some;
- o volume sai do canto, do carro e da saída, como na recusa de hoje;
- a caixa listada como sobra na saída do caminhão aparece na tela da Sobra como
  **"esperando decisão"** até alguém resolver. Lista que zera, para ser lida.

> ⚠️ **O BIPE DO SKU É O QUE PROVA QUE A PERSIANA ESTÁ NA MÃO.** Sem ele, "voltou para
> o estoque" seria uma afirmação, e o saldo subiria por uma peça que pode ter ido
> embora.

> ⚠️ **OUTRA PESSOA (D8).** Quem marca a sobra não pode ser quem **conferiu** aquela
> caixa: a sobra contradiz a contagem dele, e a mesma atenção conferiria a própria
> conta. A recusa diz o nome de quem conferiu e oferece **Trocar de pessoa**, como a
> R-SEG-01. Sem liberação, nem para o Admin Geral. Caixa sem `conferido_por` passa
> (vazio nunca é igual a vazio, a régua do `carga.js → mesmaPessoa`).

**Caixa de várias persianas:** a sobra é da caixa inteira. Se o ML cancelou só um item, a
caixa não é sobra: é refeita na Etiqueta de Venda, como hoje.

**Sob medida:** a sobra é registrada e o volume sai das listas, mas não há SKU a bipar
nem saldo a devolver (R-REC-03).

## 5. O disponível — senão a mesma peça sai duas vezes

Com a impressão sem baixar, o saldo continua contando a peça que já está numa caixa
etiquetada. Exemplo: 1 persiana na prateleira; imprime a etiqueta da venda A; o saldo
continua 1; a venda B do mesmo SKU também imprime — e não existe a segunda peça.

```
disponível = estoque − peças em volumes impressos e ainda não baixados
```

| Onde | O que muda |
|---|---|
| Trava de estoque da Etiqueta de Venda (`etq_route.js`) | compara com o disponível |
| `demanda_dominio.js` (`precisa` da tela azul, aba Estoque, TV, Compras) | usa o disponível — senão a fábrica para de produzir a peça que já tem dono |
| Aba Estoque (R-EST-15) | o reservado ganha a parte **impressas aguardando conferência** |

> ⚠️ **O DONO ÚNICO DESSA CONTA É O `estoque_dominio.js`** (ex. `disponivel(db,
> codigo)`). Três cópias seriam a armadilha #12.

> ⚠️ **O LIVRO CONTINUA FECHANDO.** `SUM(delta) = skus.estoque` vale como hoje — a
> reserva é conta, não movimento.

## 6. A virada — o que já foi impresso já baixou

No dia do deploy, todo volume `embalado`, `carregado` ou `cancelado` com `embalado_em`
**já teve o −1 na impressão**. A migração preenche `baixado_em = embalado_em` neles; do
deploy em diante só a impressão nova nasce com `baixado_em` vazio. Assim a conferência
não baixa duas vezes, e a sobra de uma caixa antiga devolve o +1 certo.

> ⚠️ **A LIMPEZA DA §7 VEM ANTES DA VIRADA.** Senão a Conferência abre com 500 caixas
> que ninguém vai bipar, e o disponível fica certo só no papel.

## 7. Fase 0 — a limpeza (mais de 500 caixas)

São volumes `embalado` com a conferência vazia, de dias anteriores. **Todos já
baixaram** (regra de hoje). Quase todos saíram enquanto a tela estava com problema.

**Ação nova na Mesa: "Fechar conferências antigas"**, em bloco, no molde do "Fechar
vencidos" (R-COR-04):
- **o dono escolhe a data de corte** (D9); o campo nasce vazio e não aceita hoje — a
  caixa de hoje continua esperando a conferência;
- a prévia lista as caixas por dia, e quantas de coleta e de agência;
- cada uma vira `carregado` na data de despacho dela às 15:00 (nunca hoje), sem
  conferência (`conferido_em` vazio; `saiu_por` não é gravado — ver o STATUS);
- **não mexe em estoque** (já baixou na impressão, e D7);
- grava em `correcao` e pode ser desfeita em bloco (tudo ou nada).

> O volume **sem etiqueta** (`pendente`, vencido) já tem a ação dele: **"Fechar
> vencidos"**, na mesma aba, também com data de corte. As duas juntas limpam as duas
> listas.

**Antes de fechar, alguém passa na área e no canto.** A caixa que ainda está na fábrica
com venda cancelada fica fora do bloco (data de corte antes dela) e espera a fase 2,
pela Sobra.

Script equivalente: `fechar_conferencias_antigas.js` (simula sem `--aplicar`), chamando
a mesma ação (R-COR-05).

## 8. Fase 1 — o nome "Conferência"

- Rodapé (`nav.js`), título da tela, nome do app no iPad (manifest) e textos passam a
  dizer **Conferência**; o título completo é *Conferência da etiqueta de venda*.
- **A URL `/carregamento` NÃO muda**, nem a chave `carregamento.executar`: a URL é o que
  os tablets salvaram na Tela de Início; a chave é o que as pessoas já têm (armadilha
  #13).
- `teste_tablets.js` e `teste_linguagem.js` acompanham.

## 9. O que muda em regras que já existem

| Regra | Hoje | Depois |
|---|---|---|
| R-EST-03 / §2 do CLAUDE.md | a etiqueta baixa uma por peça | a **conferência** baixa uma por peça; a etiqueta reserva |
| R-EST-15 | reservado = pendentes sem etiqueta, só leitura | + impressas aguardando conferência, que **entram** no disponível |
| R-EST-12 (`demanda_dominio`) | usa `skus.estoque` | usa o disponível |
| R-REC-01 / R-REC-03 | a expedição marca, o admin devolve pela Mesa | vira a Sobra: a expedição marca e devolve, bipando o SKU |
| R-COR-03 | "voltou" devolve +1 por peça | **sai**: a Mesa não devolve saldo (D7); a cancelada que ainda está na fábrica vai pela Sobra |
| R-COR-06 | a Mesa não mexe em saldo, exceto a cancelada que voltou | a Mesa **nunca** mexe em saldo |
| R-SAI-04 | "foi no caminhão" não mexe em saldo | é uma conferência por botão: grava quem e baixa |
| R-SEG-01 | quem imprimiu não confere | não muda; e quem conferiu não marca a sobra |
| R-CAR-02 | só carrega o que passou pela Etiqueta de Venda | não muda |

## 10. Fases

| Fase | O quê | Risco | Depende de |
|---|---|---|---|
| **0** | "Fechar conferências antigas" na Mesa + script | 🔴 | — |
| **1** | Nome "Conferência" | 🟢 | — |
| **2** | A regra: `baixado_em`, a baixa só na conferência, o disponível, a Sobra, a virada | 🔴 | fase 0 rodada em produção |

A fase 2 sobe **fora do horário de expedição**, com backup antes, e com os testes
escritos **antes** do código (§0 do CLAUDE.md).

### Testes que a fase 2 tem que ter (escritos antes)

- imprimir não mexe no saldo; o disponível desce;
- a segunda venda do mesmo SKU com uma peça só é recusada na impressão;
- conferência na área e no canto baixam por peça, uma vez só; bipar de novo não baixa;
- "foi no caminhão" grava quem apertou e baixa a caixa não conferida; a conferida não
  baixa de novo;
- nenhuma ação da Mesa mexe em saldo; o "Dar saída" da caixa não conferida avisa;
- varredura: a baixa só é chamada pelo bipe da conferência e pelo "foi no caminhão";
- sobra de caixa conferida: +1 por SKU bipado; não conferida: nenhum movimento;
- SKU que não é da caixa é recusado na sobra; quem conferiu não marca a sobra;
- caixa de várias: baixa por peça, sobra por peça; sob medida: nada em nenhum caminho;
- a virada: volume impresso antes do deploy não baixa de novo;
- `SUM(delta) = skus.estoque` depois de cada passo (`teste_livro.js`);
- a tela azul (`precisa`) sobe quando a peça é reservada.

Acompanham: `teste_etiqueta`, `teste_carga`, `teste_area`, `teste_pecas_carga`,
`teste_saida_coleta`, `teste_saida_agencia`, `teste_recusa_motorista`,
`teste_correcao*`, `teste_estoque`, `teste_acuracidade`, `teste_livro`,
`teste_segunda_pessoa`.

## 11. Confirmado com o dono

| # | Ponto | Resposta |
|---|---|---|
| C1 | "A sobra deveria ser por outra pessoa" (D8): outra pessoa **de quem conferiu** a caixa? | **Sim** (22/10/2026): quem conferiu não marca a sobra |

## 12. Achado no caminho (não entra nesta spec)

- **SKU recém-cadastrado nasce com saldo zero, e a Etiqueta de Venda recusa "sem
  estoque"** — foi o caso do Screen 1,20 × 1,20 bege: o SKU estava bloqueado, foi
  cadastrado, e a impressão então recusou por estoque, porque a peça nunca tinha sido
  embalada no sistema. A saída foi imprimir pelo PDF do ML, por fora. É a armadilha #6
  pela porta do cadastro: a peça existe na prateleira e não existe no saldo. Com a
  regra nova, a etiqueta impressa por fora **não baixa nada** (D7), e o saldo fica
  certo só se a peça também nunca tiver somado. Merece uma conversa à parte (o
  caminho é embalar a peça no sistema antes de imprimir, ou um ajuste de saldo).
- Revisão com clique duplo (trava ou "desfazer a última") — conversa à parte, de 22/10.
- Tirar a foto do motorista ou a quantidade do caminhão — **não**: D5.
