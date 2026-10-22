> **STATUS · 22/10/2026 — RASCUNHO, ESPERANDO O "PODE SEGUIR" DO DONO** · `REGRA` ·
> risco 🔴 (estoque e dados de produção) · nada construído.
> Nasceu da conversa de 22/10/2026 (sessão Claude Code). As perguntas da primeira
> versão foram respondidas no mesmo dia (§2, D6 a D9). Resta confirmar a leitura da
> D8 (§11).

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
  conferência (`conferido_em` vazio, `saiu_por='passivo'`);
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

## 11. A confirmar com o dono

| # | Ponto | Leitura desta spec |
|---|---|---|
| C1 | "A sobra deveria ser por outra pessoa" (D8): outra pessoa **de quem conferiu** a caixa? | Sim — quem conferiu 50 não confirma que sobraram 2 |

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
