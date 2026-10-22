> **STATUS · 22/10/2026 — RASCUNHO, ESPERANDO APROVAÇÃO DO DONO** · `REGRA` · risco 🔴
> (estoque e dados de produção) · nada construído.
> Nasceu da conversa de 22/10/2026 (sessão Claude Code), com as respostas do dono às
> perguntas 1 a 4. Os pontos da §11 ainda esperam resposta.

---

# Conferência e baixa — o estoque sai quando a etiqueta e a conferência batem

> **Leia junto com:** `CLAUDE.md` §2 (onde o estoque entra e sai), §5 (Mesa de
> correções), §8-B (coleta e carregamento) · `docs/regras/estoque.md` (R-EST-03,
> R-EST-15) · `docs/regras/carregamento.md` (R-PIL, R-REC, R-SAI) ·
> `docs/regras/expedicao.md` (R-COR-03, R-COR-06) · spec `RECUSA-DO-MOTORISTA.md`.

## 1. O problema, nas palavras do dono

> *"A gente imprimiu a etiqueta de venda e nesse meio tempo de impressão houve duas
> peças canceladas. [...] Antes de fazer o carregamento das peças a gente faz a
> conferência. [...] E nessa conferência é onde a gente acusa algum erro da emissão de
> etiqueta de venda. E também é nesse local que sobra uma peça, ou duas, igual sobrou
> ontem. Então o estoque poderia de fato sair só depois que é carregado."*

> *"O sistema tem que passar a fazer uma junção entre a etiqueta de venda e a
> conferência. A hora que os dois batem, sai do estoque. E se sobrou persiana, o
> operador bipa a etiqueta e diz que aquela etiqueta sobrou — foi venda cancelada,
> aconteceu algum problema, ele descreve ali. A persiana que sobrou ele faz voltar
> para o estoque, bipando esse SKU. Dessa forma o setor de expedição se organiza por
> si só."*

Hoje a baixa (−1 por peça) acontece **na impressão da etiqueta de venda**
(`etq_route.js`, movimento `etiqueta`). Quando a venda é cancelada entre a impressão
e o caminhão, a peça baixou e continua na fábrica. Para voltar, são dois passos: a
expedição marca e o admin aceita pela Mesa (R-REC-01, R-COR-03). Na prática o saldo
fica errado até alguém lembrar.

E a tela do Carregamento ficou um tempo com problema. Por isso **mais de 500 caixas**
aparecem como impressas e não conferidas, de dias anteriores (a linha âmbar, R-PIL-02).

## 2. As decisões do dono (22/10/2026)

| # | Decisão |
|---|---|
| D1 | **A baixa sai da impressão e vai para a conferência.** A etiqueta impressa só **reserva** a peça; ela sai do estoque quando a conferência bate com a etiqueta |
| D2 | **A sobra é resolvida pelo próprio operador da conferência**: bipa a etiqueta, diz o motivo e bipa o SKU de cada persiana que volta para a prateleira. Não passa pela Mesa nem pelo admin |
| D3 | **Quem pode marcar sobra é quem já tem a etiqueta de venda e a conferência** (a mesma chave do bipe da conferência, `carregamento.executar`). Sem chave nova |
| D4 | **A tela passa a se chamar "Conferência"** |
| D5 | **Foto do celular do motorista e quantidade do caminhão ficam como estão** nesta spec. O dono disse que não tem tido problema ali; tirar é outra decisão, separada |

> ⚠️ **D2 MUDA A D3 DA `RECUSA-DO-MOTORISTA`** ("dois passos: o admin aceita a volta
> ao estoque"). Ali a decisão foi de 02/10/2026; aqui o dono decide que a expedição
> resolve sozinha. Vai uma linha em `docs/DECISOES.md` quando a spec for aprovada.

## 3. A regra nova

| Evento | Hoje | Depois |
|---|---|---|
| Peça embalada | +1 | +1 (não muda) |
| Etiqueta de venda impressa | **−1** por peça | **nenhum** — a peça fica **reservada** |
| Etiqueta reimpressa | nenhum | nenhum (não muda) |
| **Conferência bipou a caixa** (área ou canto) | nenhum | **−1 por peça** (movimento novo `conferencia`) |
| Caixa saiu sem conferência ("foi no caminhão", "Dar saída" da Mesa) | nenhum | **−1 por peça**, se ainda não baixou |
| **Sobra** marcada na conferência, persiana de volta | nenhum (só pela Mesa, +1) | se já baixou: **+1 por peça** (movimento `sobra`); se não: só solta a reserva |
| Sob medida | nenhum | nenhum (não muda — §7) |

**A baixa acontece UMA vez por volume, na primeira porta por onde ele sai.** São três
portas, e as três chamam a mesma função:

1. o bipe da conferência (área da agência ou canto da coleta) — `carreg_route.js → concluir`;
2. o botão **"foi no caminhão"** das sobras da saída (R-SAI-04), que leva caixa `embalado`
   sem conferência;
3. o **"Dar saída"** da Mesa em volume `embalado`.

> ⚠️ **SE UMA DAS TRÊS FICAR DE FORA, A PEÇA SAI SEM BAIXAR, e nada avisa.** É a
> armadilha #27 ao contrário. O teste tem que passar por cada porta e exigir o −1.

**Quem marca que já baixou:** coluna nova `lote.baixado_em` (data e hora da baixa).
A baixa só roda com ela vazia; a sobra só devolve `+1` com ela cheia. Por que uma
coluna, e não procurar no livro: a pergunta "este volume já baixou?" é feita no bipe,
na sobra e na Mesa, e as três precisam da mesma resposta, rápida.

**A caixa de várias persianas** baixa por peça, como hoje (R-VOL-05): a conferência peça
a peça (R-PEC-01) já existe; a baixa acontece quando a caixa fecha.

**A caixa de agência conferida na área e depois posta no carro** baixa na conferência
(o primeiro bipe), não na viagem. A viagem não mexe em saldo.

## 4. A sobra — o operador resolve na própria tela

Botão novo na Conferência: **"Sobrou"**. Substitui o **"🚫 Motorista recusou"**, que
vira um dos motivos.

```
1. bipa a ETIQUETA da caixa que sobrou
   → a tela mostra cliente, NF e as persianas da caixa
2. escolhe o motivo:  [Venda cancelada]  [Motorista recusou]  [Outro: ______]
3. bipa o SKU de CADA persiana que volta para a prateleira
   → cada bipe confere com a caixa; SKU que não é da caixa é recusado
4. confirma
```

O que o sistema faz:
- o volume vira `cancelado`, com `cancelada_origem='sobra'`, o motivo, quem e quando
  (as colunas da VENDAS-E-MEDIA F2 e da RECUSA-DO-MOTORISTA já existem). **Não
  `'conferencia'`**: esse valor já é do `conferir_canceladas.js`, que marca numa
  transação desfeita, e as duas origens se confundiriam;
- se o volume **já tinha baixado**: `+1` por persiana bipada, movimento `sobra`, referência
  `lote:<id>`, com o motivo;
- se **não tinha baixado**: nenhum movimento — a reserva simplesmente some;
- o volume sai do canto, do carro e da saída, como na recusa de hoje.

> ⚠️ **O BIPE DO SKU É O QUE PROVA QUE A PERSIANA ESTÁ NA MÃO.** O dono pediu
> exatamente isso: sem o bipe, "voltou para o estoque" seria uma afirmação, e o saldo
> subiria por uma peça que pode ter ido embora.

> ⚠️ **"O CAMINHÃO NÃO VEIO" NÃO É SOBRA.** Nesta semana o caminhão não passou e veio
> no dia seguinte. A venda continuava valendo: a caixa tinha que **esperar**, não
> voltar para a prateleira. Se ela fosse marcada como sobra, a venda seria cancelada
> aqui dentro e o cliente ficaria sem a persiana. Por isso **não há** motivo "caminhão
> não veio": a caixa conferida continua no canto e entra na conta do próximo caminhão,
> como já acontece hoje (tarja `⏳ bipada dd/mm`). A tela da sobra diz isso em uma linha.
> **A confirmar com o dono (§11, P1).**

**Caixa de várias persianas:** a sobra é da caixa inteira (todas as persianas bipadas
voltam). Se o ML cancelou só um item, a caixa não é sobra: é refeita na Etiqueta de
Venda, como hoje.

**Sob medida:** a sobra é registrada e o volume sai das listas, mas não há SKU a bipar
nem saldo a devolver. A tela não manda pôr na prateleira (R-REC-03).

## 5. O disponível — senão a mesma peça sai duas vezes

Com a impressão sem baixar, o saldo continua contando a peça que já está dentro de uma
caixa etiquetada. Exemplo: 1 persiana na prateleira; imprime a etiqueta da venda A; o
saldo continua 1; a venda B do mesmo SKU também imprime — e não existe a segunda peça.

**Regra:** em todo lugar que pergunta "tem peça para esta venda?", vale o **disponível**:

```
disponível = estoque − peças em volumes impressos e ainda não baixados
```

| Onde | O que muda |
|---|---|
| Trava de estoque da Etiqueta de Venda (`etq_route.js`) | compara com o disponível, não com o estoque |
| `demanda_dominio.js` (`precisa` da tela azul, aba Estoque, TV, Compras) | o estoque que entra na conta é o disponível. Senão a fábrica para de produzir a peça que já tem dono |
| Aba Estoque (R-EST-15) | o "reservado" passa a ter duas partes: **sem etiqueta** (como hoje, só leitura) e **impressas aguardando conferência** (esta conta) |

> ⚠️ **O DONO ÚNICO DESSA CONTA É O `estoque_dominio.js`** (função nova, ex.
> `disponivel(db, codigo)`). Três cópias seriam a armadilha #12: a etiqueta liberando
> uma peça que a tela azul diz que falta.

> ⚠️ **O LIVRO CONTINUA FECHANDO.** `SUM(delta) = skus.estoque` vale como hoje — a
> reserva não é movimento, é conta. `teste_livro.js` passa a cobrir os movimentos
> `conferencia` e `sobra`.

## 6. A virada — o que já foi impresso já baixou

No dia do deploy, todo volume `embalado` ou `carregado` **já teve o −1 na impressão**.
Se a conferência baixasse de novo, a mesma peça sairia duas vezes.

- A migração preenche `baixado_em = embalado_em` em todo volume `embalado`, `carregado`
  ou `cancelado` que tenha `embalado_em` (os sob medida também, para não ficarem
  "pendentes de baixa" para sempre).
- Do deploy em diante, só a impressão nova nasce com `baixado_em` vazio.
- A Mesa ("A persiana voltou", R-COR-03) passa a olhar `baixado_em`: volume cancelado
  que nunca baixou não devolve `+1`.

> ⚠️ **A LIMPEZA DA §7 VEM ANTES DA VIRADA.** As 500 caixas antigas já baixaram; se
> ficassem no meio, a tela da Conferência abriria com 500 caixas que ninguém vai bipar.

## 7. Fase 0 — a limpeza das caixas antigas (mais de 500)

São volumes `embalado` com a conferência vazia, de dias anteriores (a linha âmbar).
**Todos já baixaram** (regra de hoje). Quase todos saíram de verdade enquanto a tela
estava com problema; alguns podem ser venda cancelada ainda na fábrica.

**Ação nova na Mesa: "Fechar conferências antigas"**, em bloco, no molde do
"Fechar vencidos" (R-COR-04):
- **data de corte obrigatória**, escolhida por quem confere — nunca hoje: a caixa de
  hoje continua esperando a conferência;
- a prévia lista as caixas, por dia;
- cada uma vira `carregado` na data de despacho dela às 15:00 (nunca hoje), sem
  conferência (`conferido_em` vazio, `saiu_por='passivo'`);
- **não mexe em estoque** (já baixou);
- grava em `correcao` e pode ser desfeita em bloco (tudo ou nada).

**Antes de fechar, alguém passa na área e no canto.** Toda caixa que ainda está na
fábrica com venda cancelada fica de fora do bloco (data de corte, ou tirando da lista)
e é resolvida pela Mesa ("cancelada depois da etiqueta → voltou"). Depois da fase 2,
pela sobra.

> **Script equivalente** (`fechar_conferencias_antigas.js`, simula sem `--aplicar`),
> chamando a mesma ação — regra R-COR-05: botão e terminal com a mesma régua.

## 8. Fase 1 — o nome "Conferência"

- Rodapé (`nav.js`), título da tela, nome do app no iPad (manifest) e textos que dizem
  "Carregamento" passam a dizer **Conferência**. No título completo: *Conferência da
  etiqueta de venda*.
- **A URL `/carregamento` NÃO muda**, nem a chave `carregamento.executar`. A URL é o que
  os tablets salvaram na Tela de Início (TABLETS-E-KIOSK); a chave é o que as pessoas
  já têm (armadilha #13: trocar a chave tira a permissão de quem tem, em silêncio).
- `teste_tablets.js` e `teste_linguagem.js` acompanham.

## 9. O que muda em regras que já existem

| Regra | Hoje | Depois |
|---|---|---|
| R-EST-03 / §2 do CLAUDE.md | a etiqueta baixa uma por peça | a **conferência** baixa uma por peça; a etiqueta reserva |
| R-EST-15 | reservado = pendentes sem etiqueta, só leitura | + impressas aguardando conferência, que **entram** na conta do disponível |
| R-EST-12 (`demanda_dominio`) | usa `skus.estoque` | usa o disponível |
| R-REC-01 | a expedição marca, o admin devolve pela Mesa | a expedição marca **e** devolve, bipando o SKU (vira a sobra) |
| R-COR-03 | "voltou" devolve +1 por peça | só se `baixado_em` estiver cheio |
| R-COR-06 | a Mesa não mexe em saldo | o "Dar saída" de volume `embalado` não baixado **baixa** (é uma das três portas) |
| R-SAI-04 | "foi no caminhão" não mexe em saldo | baixa, se ainda não baixou |
| R-CAR-02 | só carrega o que passou pela Etiqueta de Venda | não muda |
| R-SEG-01 | quem imprimiu não confere | não muda |

## 10. Fases

| Fase | O quê | Risco | Depende de |
|---|---|---|---|
| **0** | "Fechar conferências antigas" na Mesa + script | 🔴 | — |
| **1** | Nome "Conferência" | 🟢 | — |
| **2** | A regra: `baixado_em`, as três portas, o disponível, a sobra, a virada | 🔴 | fase 0 rodada em produção |

A fase 2 sobe **fora do horário de expedição**, com backup antes, e os testes escritos
**antes** do código (§0 do CLAUDE.md).

### Testes que a fase 2 tem que ter (escritos antes)

- imprimir não mexe no saldo; o disponível desce;
- a segunda venda do mesmo SKU com uma peça só é recusada na impressão;
- conferência na área (agência) e no canto (coleta) baixam por peça, uma vez só;
- bipar a mesma caixa de novo não baixa de novo;
- "foi no caminhão" e "Dar saída" baixam a caixa não conferida, e não baixam a conferida;
- sobra de caixa conferida: +1 por SKU bipado; sobra de caixa não conferida: nenhum
  movimento e a reserva some;
- SKU bipado que não é da caixa é recusado na sobra;
- caixa de várias: baixa por peça e sobra por peça;
- sob medida: nenhum movimento em nenhum caminho;
- a virada: volume impresso antes do deploy não baixa de novo na conferência;
- `SUM(delta) = skus.estoque` depois de cada passo (`teste_livro.js`);
- a tela azul (`precisa`) sobe quando a peça é reservada.

Testes que acompanham: `teste_etiqueta`, `teste_carga`, `teste_area`,
`teste_pecas_carga`, `teste_saida_coleta`, `teste_saida_agencia`,
`teste_recusa_motorista`, `teste_correcao*`, `teste_estoque`, `teste_acuracidade`,
`teste_livro`.

## 11. O que ainda precisa da resposta do dono

| # | Pergunta | Recomendação |
|---|---|---|
| P1 | "Caminhão não veio" fica **fora** da sobra (a caixa espera o próximo caminhão)? | **Sim** — a venda continua valendo (§4) |
| P2 | O "Dar saída" da Mesa num volume **pendente** (etiqueta impressa direto pelo PDF do ML) passa a **baixar** também? Hoje não baixa, e o saldo fica uma peça acima | **Sim**, com a trava de que o SKU tenha saldo; é a mesma lógica: a peça saiu, então baixa |
| P3 | A sobra exige **outra pessoa** (como a conferência exige quem não imprimiu)? | **Não** — o bipe do SKU já prova a peça na mão, e a sobra é rara |
| P4 | Data de corte da limpeza: até **ontem**, ou até um dia que vocês conferiram fisicamente? | Até o dia em que alguém passou na área e no canto |

## 12. Fica de fora

- Tirar a foto do motorista ou a quantidade do caminhão (D5).
- Revisão com clique duplo (trava ou "desfazer a última") — conversa à parte, de 22/10.
- Qualquer mudança na Etiqueta de Venda além da trava pelo disponível.
