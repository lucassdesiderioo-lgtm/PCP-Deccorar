# CLAUDE.md — Contexto do Projeto PCP Deccorar

> Leia este arquivo **inteiro** antes de qualquer alteração no código.
> Ele contém regras de negócio que **parecem bugs mas são intencionais**.
> Alterar código sem ler esta seção já causou perda de dados de estoque em produção.

> 🗣️ **Idioma:** responda ao usuário **sempre em português** — todas as
> mensagens de chat, resumos e explicações. Vale para todo o projeto.

---

## 0. PROTOCOLO — toda tarefa tem começo, meio e fim

> Vale para **toda** sessão (Mac ou nuvem), de qualquer tamanho. O dono decide as
> regras e acompanha pelo relatório — e se perde quando regra e código mudam sem
> ele ver. **Este protocolo não é opcional, nem "só dessa vez".**

### O dono fala em dois momentos, e só neles

```
  ① COMEÇO ─────────▶ ✋ "pode seguir" ─────────▶ ② MEIO ─────────▶ ③ FIM ─────────▶ ✋ "pode subir"
  entender e planejar   (aprova o plano)          construir         deixar em ordem    (aprova merge/deploy)
```

Entre um ✋ e outro, trabalhe sozinho. **Fora deles, só interrompa por um motivo:
apareceu uma regra de negócio que precisa mudar.**

### Como o dono abre uma tarefa

Ele pode começar a mensagem com uma palavra. Se não começar, **você classifica e diz qual é**.

| Palavra | Significa | Precisa de spec? |
|---|---|---|
| `CONSERTO:` | o sistema deveria fazer e não faz | não |
| `AJUSTE:` | mudar algo pequeno sem mudar regra | não |
| `REGRA:` | mudar como a fábrica trabalha | **sim** |
| `NOVIDADE:` | algo que não existe | **sim** |
| `FASE:` | construir a próxima fase de uma spec de `docs/specs/` | já tem |

**`REGRA` ou `NOVIDADE` sem spec aprovada: não construa.** Explique que precisa ser
desenhado no Projeto do Claude primeiro e ofereça um rascunho de spec.

**Um `CONSERTO` que exige mudar regra vira `REGRA`.** Pare e avise — é exatamente
assim que a bagunça começa.

### O semáforo de risco — define o cuidado

| | Mexe em | Cuidado exigido |
|---|---|---|
| 🟢 | texto, cor, posição, tamanho, tela de escritório | plano curto (3 linhas) |
| 🟡 | comportamento de tela, bipe, cálculo exibido, relatório | plano completo + teste |
| 🔴 | **estoque, acesso/permissão, etiqueta/NF, dados de produção, schema** | plano completo + **teste escrito antes do conserto** + backup + deploy fora do horário de expedição |

Na dúvida entre duas cores, use a mais alta.

---

### ① COMEÇO — entender antes de mexer

1. Leia a seção deste arquivo sobre o assunto e, se houver, a spec em `docs/specs/`.
2. Investigue no código real (nunca de memória).
3. Apresente o **PLANO**, neste formato, em português de fábrica:

```
📋 PLANO
Tipo: CONSERTO | AJUSTE | FASE N da spec X        Risco: 🟢 | 🟡 | 🔴
O que está acontecendo: (a causa, ou o que vai ser feito)
O que vou mudar: (arquivos, em 1 linha cada)
Regra de negócio muda? NÃO  |  SIM → antes: … / depois: …
Como vou testar: …
Fica de fora: …
```

4. **✋ Espere o "pode seguir".**

### ② MEIO — construir só o combinado

5. Faça **só** o que está no plano. Siga a §13 (backup, `node --check`, teste de segurança).
6. **Achou outro problema?** Anote para o relatório. Não conserte junto.
7. **Precisa mudar uma regra que não estava no plano?** Pare e pergunte. Nunca decida sozinho,
   mesmo que pareça bug óbvio — metade das regras deste arquivo *parecem* bug.

### ③ FIM — só termina com tudo em ordem

8. Testes rodando e passando.
9. Papel em dia, **no mesmo commit do código**:

| Se… | Então atualize |
|---|---|
| mudou regra | este `CLAUDE.md` **e** uma linha em `docs/DECISOES.md` |
| descobriu armadilha | este `CLAUDE.md` |
| resolveu dívida | risque na §14, com data |
| trabalhou numa spec | STATUS da spec + índice em `docs/specs/README.md` |
| terminou a spec inteira | spec vai para `docs/arquivo/` |

10. Commit com mensagem clara. Em branch: **abra o PR**.
11. Entregue o **FECHAMENTO** e **✋ espere o "pode subir"** antes de merge ou deploy:

```
✅ FECHAMENTO
Tipo e risco: …
O que mudou: (2-3 linhas, sem jargão)
Regra de negócio mudou? NÃO  |  SIM → antes / depois (registrado em DECISOES.md)
Testes: quais rodaram · resultado
Papel em dia: CLAUDE.md §… · DECISOES.md · spec … · README das specs
Commit/PR: …   Falta mesclar? …
Deploy: não precisa  |  precisa → comandos · melhor horário
Achei no caminho (não mexi): …
```

Item do FIM que não foi possível cumprir: **diga qual e por quê.** Nunca declare pronto com item faltando.

---

## 1. O que é este sistema

PCP (Planejamento e Controle da Produção) de uma fábrica de persianas que vende
pelo Mercado Livre. Controla o caminho completo de uma peça: da ordem de produção
até o carregamento no veículo, passando por revisão, embalagem e emissão da
etiqueta de venda.

**Não é um e-commerce.** As vendas vêm prontas do Mercado Livre em PDF. O sistema
cuida do que acontece *depois* da venda, dentro da fábrica.

**Usuários reais:** operadores de chão de fábrica usando tablets e leitores de
código de barras. Isso condiciona todas as decisões de interface: botões grandes,
campos que aceitam bipe, mínimo de digitação, feedback sonoro.

---

## 2. O FLUXO — a regra mais importante

```
Ordem de produção → REVISÃO → FILA → EMBALAGEM → ESTOQUE → ETIQUETA DE VENDA → CONFERÊNCIA → CARREGAMENTO
```

### Onde o estoque entra e sai (LEIA COM ATENÇÃO)

| Evento | Efeito no estoque | Linha no livro (desde 21/09/2026) |
|---|---|---|
| Peça **revisada** | **NENHUM.** Entra na tabela `fila` com `situacao='aguardando'` | nenhuma |
| Peça **embalada** (com kit conferido) | **+1** — é aqui que vira estoque | `embalagem` · `montagem:<id>` |
| **Etiqueta de venda** impressa | **NENHUM** desde 22/10/2026 — a peça fica **reservada** (até ali era o −1) | nenhuma |
| Caixa **conferida** (bipe da área ou do canto), ou que saiu sem conferência no "foi no caminhão" | **−1 por peça** — é aqui que sai, uma vez só | `conferencia` · `lote:<id>`, **uma por SKU** da caixa |
| Caixa que **sobrou** (↩ Sobrou da Conferência, SKU de cada persiana bipado) | **+1 por peça**, se a caixa já tinha baixado; senão só solta a reserva | `sobra` · `lote:<id>`, **uma por SKU** |
| Etiqueta de venda **reimpressa** | **NENHUM** — mesmo volume, mesmo cliente | nenhuma |
| Peça **sob medida** | **NENHUM** nos dois lados (§7) | nenhuma |

> **As regras do saldo estão em [`docs/regras/estoque.md`](docs/regras/estoque.md)**
> (cartões R-EST-01 a R-EST-11), cada uma com o teste que a trava. O porquê
> longo — armadilhas **#1**, **#1-B** e **#2**, o livro de movimentos, a fase 1
> que subiu sem tela — está em [`docs/historia/estoque.md`](docs/historia/estoque.md).

| Cartão | Regra em uma linha |
|---|---|
| R-EST-01 | Revisar não mexe no estoque — **está correto, não "conserte"** (#1) |
| R-EST-02 | A embalagem é onde a peça vira estoque (+1) |
| R-EST-03 | A etiqueta RESERVA; a conferência baixa uma por PEÇA, uma vez só (`baixa_dominio.js`) |
| R-EST-04 | Reimprimir não baixa (#1-B) |
| R-EST-05 | Sob medida não soma nem baixa |
| R-EST-06 | O saldo só anda pelo livro: `estoque_dominio.js` é o dono único, e `SUM(delta) = skus.estoque` |
| R-EST-07 | O domínio não abre transação; quem chama abre |
| R-EST-08 | Saldo negativo fica negativo (sem `MAX(0, …)`) e tem chip próprio |
| R-EST-09 | O cadastro de SKU não mexe em saldo, e diz que ignorou |
| R-EST-10 | A abertura do livro aconteceu uma vez só (`config.livro_abertura`) |
| R-EST-11 | O extrato mostra tudo que moveu o saldo e diz se o livro bate |

> ⚠️ **Regra nova que depende de tela não está pronta quando a rota existe e o
> teste passa** — está pronta quando alguém clica e vê. A fase 1 do livro subiu
> com a rota do extrato e sem botão nenhum que chegasse nela.

**Ao mexer no `estoque_dominio.js` ou em qualquer coisa que mova saldo:**
`node teste_livro.js` — ele exige `SUM(delta) = skus.estoque` depois de cada
passo e recusa `UPDATE skus SET estoque` fora do domínio. **No `baixa_dominio.js`,
na impressão, no bipe da conferência ou no fechamento da saída:** `node
teste_baixa_conferencia.js` também. **No ↩ Sobrou ou na devolução:** `node
teste_sobra.js`.

> ⚠️ **A BAIXA É NA CONFERÊNCIA DESDE 22/10/2026** (fase 2-A da spec
> `CONFERENCIA-E-BAIXA`, decisão do dono). A etiqueta só **reserva**; o −1 sai
> quando a conferência bate com a etiqueta. `baixa_dominio.js` é o **dono único**
> da baixa, da reserva e do **livre** (saldo − peça em caixa impressa).
>
> - **O livre manda onde a pergunta é "tem peça livre?"**: a trava da impressão,
>   a urgência, o inventário (compara a contagem com o que deve estar na
>   **prateleira**), o número que a Etiqueta de Venda mostra e a coluna **Livre**
>   da TV (`/painel`, desde 22/10/2026, com "+N em caixa" embaixo).
> - ⚠️ **O `precisa` da tela azul NÃO usa o livre**, e não é esquecimento: o
>   comprometido da planilha já conta a venda impressa até ela sair, e descontar
>   a reserva de novo contaria a mesma peça duas vezes.
> - ⚠️ **A VIRADA RODOU UMA VEZ SÓ** (`config.virada_baixa_conferencia`): toda
>   caixa com etiqueta no dia do deploy ganhou `baixado_em = embalado_em`, porque
>   já tinha baixado na impressão. Rodá-la de novo marcaria como baixada uma caixa
>   que nunca baixou.
> - ⚠️ **A MESA NUNCA DÁ A BAIXA** (D7). "Dar saída" e "fechar conferências
>   antigas" não movem saldo; a caixa que nunca baixou fica de fora do bloco, e a
>   prévia avisa que o saldo fica alto.
> - ⚠️ **E A MESA TAMBÉM NUNCA DEVOLVE** (fase 2-B, 22/10/2026). A caixa que
>   sobrou na fábrica volta pelo **↩ Sobrou** da Conferência: bipa a etiqueta e o
>   SKU de **cada** persiana, escolhe o motivo, e o saldo volta +1 por peça **se
>   já tinha baixado** (`baixa_dominio.devolver`, dono único). Quem conferiu a
>   caixa não marca a sobra dela (D8). Cartões R-REC-01 a R-REC-05 em
>   [`docs/regras/carregamento.md`](docs/regras/carregamento.md); `node
>   teste_sobra.js` ao mexer nisso.

> ⚠️ **ARMADILHA #2:** `POST /api/revisao` ainda **retorna** os campos `estoque`,
> `pedido` e `feito`. São resquício da versão antiga; não use como fonte de verdade.

---

## 3. Os três modos da tela de Revisão

> **Os três modos** (🔴 pedidos de hoje · 🔵 produção pra estoque · 🟡
> devoluções) e por que a cor é a trava: cartão R-REV-01 em
> [`docs/regras/estoque.md`](docs/regras/estoque.md). O resto desta seção é a
> planilha do ML, a média e a venda cancelada, que ainda moram aqui.

### ⚠️ ARMADILHA #11 — a planilha do ML é ESPELHO, e um recorte apaga a média

A tela azul não sai de lançamento nenhum: ela é calculada ao vivo a partir da
planilha do Mercado Livre, importada em **Admin → Planejamento**. Dessa planilha
saem **dois** números, de lugares diferentes:

| Coluna | Alimenta | Olha para |
|---|---|---|
| **Data da venda** | a média diária | os últimos 30 dias (`janela_media`) |
| **Estado** (`"Para enviar no dia 17 de agosto"`) | o comprometido | os envios futuros |

```
alvo    = max(alvo_minimo, média_na_janela × dias_cobertura)
precisa = comprometido + alvo − estoque
```

> ⚠️ **ATÉ 26/09/2026 O IMPORT APAGAVA o que não veio no arquivo**, e um
> recorte só com os próximos dias apagava os 30 dias de histórico: a média de
> todo SKU caía a zero, o alvo despencava para o `alvo_minimo`, e a tela azul
> parava de pedir produção. Sem erro e sem aviso — o número só encolhia.
>
> **Desde a fase 2 de VENDAS-E-MEDIA o espelho vale só entre as FUTURAS**
> (bloco "A PLANILHA SÓ ESPELHA AS FUTURAS", logo abaixo): a venda passada
> nunca é apagada por ausência, e o recorte deixou de estragar a média. A tarja
> âmbar do recorte saiu junto. O que continua valendo: **a venda passada ainda
> é gravada**, porque até a fase 3 é dela que sai a média da planilha.

A janela não é fixa em 30 dias — é o campo "Janela da média" na própria tela. Se
ela virar 60, a planilha precisa cobrir 60.

### ⚠️ A SEGUNDA MÉDIA, CONTADA PELO SISTEMA — só ao lado, por enquanto (26/09/2026)

**Fase 1 da spec `VENDAS-E-MEDIA.md`.** Toda venda do ML passa pelo PDF que a
expedição sobe todo dia, então **a história de vendas já está em `lote`**, e ela
não depende de ninguém subir planilha inteira. `media_dominio.js` é o **dono
único** dessa conta, e Admin → Planejamento mostra embaixo da tabela a
**"Média: planilha × sistema"**, SKU a SKU, com os maiores desvios em cima
(`GET /api/planejamento/media/comparar`, `@admin`).

> ⚠️ **NÃO MUDOU A PRODUÇÃO.** A tabela de cima, a tela azul, a aba Estoque, a
> TV e a compra continuam lendo a **planilha**, pelo `demanda_dominio`. Não
> existe ainda `config.media_fonte`: a troca é a fase 3, e espera o ok do dono
> depois de conferir esta tabela por alguns dias. Há caso travando.

| Regra da conta | Por quê |
|---|---|
| conta **peça**: `lote_item` soma o `qtd` de cada SKU; sem `lote_item`, 1 do `lote.codigo` | a caixa de várias persianas (#23) e *uma venda = uma etiqueta = uma persiana* (§5) |
| **bloqueado conta** | é venda; o bloqueio é dúvida de leitura, não de existência |
| teste e cancelada ficam fora | a cancelada só nasce na fase 2 — até lá a conta roda sem a coluna |
| a data é `lote.data`, o dia em que o PDF entrou | não depende de nada que alguém precise subir |
| a janela é a **mesma** da planilha (`data >= hoje − N`, ÷ N) | com borda diferente, a diferença da tabela seria só a borda |
| janela maior que a história é **cortada** no primeiro volume, e a tela diz em âmbar | 12 dias de venda ÷ 30 dá um número 2,5× menor com cara de fato (a #16 do sob medida) |

> ⚠️ **A COLUNA "PLANILHA" É O NÚMERO DO `demanda_dominio`, e não uma consulta
> da comparação.** O `comparar()` recebe as linhas do domínio por parâmetro:
> conferir contra um número que a produção não lê confirmaria com autoridade o
> que ninguém usa (#12). E é por parâmetro, e não por `require`, porque na fase
> 3 é o `demanda_dominio` que vai ler do `media_dominio` — a volta fecharia um
> ciclo.

> ⚠️ **PDF REPETIDO NÃO DOBRA, e a conta tem a sua própria guarda.** Na entrada
> quem garante é a dedup do upload (#5), mas até 25/08/2026 ela olhava só o dia,
> e sobraram volumes repetidos no banco. A conta agrupa pela identidade do volume
> (pack, ou venda, ou o próprio id) e fica com o **mais antigo**, a regra do
> `limpar_fantasmas.js` — **olhando antes da janela também**: a cópia de dentro
> cujo original entrou no dia 31 não é venda nova. A tela diz quantos descartou.

> ⚠️ **AS DUAS COLUNAS NÃO MEDEM A MESMA COISA, e a diferença não é defeito por
> si.** A planilha conta **venda** (linha do arquivo) pela data da venda; o
> sistema conta **peça** pela data do PDF. A caixa de 2 persianas é 1 na
> planilha e 2 aqui. É exatamente isso que o dono vai conferir antes da troca.

> **O render achou duas coisas:** o resumo escrevia "últimos 18 dias" na frente
> dos dois números com a janela do sistema cortada — a planilha parecia contada
> em 18 —, e a 400 px o código do SKU quebrava no meio (`CINZ` / `A`). Hoje cada
> número diz a sua janela, e no celular a letra do código diminui.

**Rode `node teste_media.js` (25 casos) ao mexer no `media_dominio.js` ou na
rota.** Sete defeitos foram reintroduzidos um a um: a caixa contando 1 (reprova
9), sem a dedup (6), a dedup só dentro da janela (4), a janela sem corte (2), a
cancelada contando (1), o teste contando (2) e o bloqueado ficando fora (4).

> ✅ **NO AR EM 26/09/2026** (PR #144): o dono fez o deploy e disse *"ficou
> certo"*.
>
> ⚠️ **ISSO PROVA QUE A TABELA APARECE, E NÃO QUE A MÉDIA DO SISTEMA ESTÁ
> CERTA.** A prova que libera a fase 3 é o dono conferir a tabela com o dado
> real por alguns dias — e dizer se os desvios têm explicação (caixa de várias,
> borda da data, venda cancelada). Prova que não foi feita se escreve como não
> feita (§4).

### ⚠️ A PLANILHA SÓ ESPELHA AS FUTURAS, E A VENDA CANCELADA SAI DAS LISTAS (26/09/2026)

**Fase 2 da spec `VENDAS-E-MEDIA.md`.** O import de Admin → Planejamento
(`POST /api/planejamento/importar`) mudou em duas coisas:

| | Antes | Depois |
|---|---|---|
| venda que não veio no arquivo | apagada, passada ou futura | só a **futura** sai; a passada fica |
| arquivo sem nenhuma venda futura | aceito — apagava o comprometido | **recusado** (400, `sem_futura`) |
| arquivo que tira mais da metade das futuras | aceito | pede `confirmar` (409), **nada gravado** antes |
| venda cancelada no ML | ficava `pendente` para sempre | o volume sai das listas |

> ⚠️ **A VENDA PASSADA CONTINUA SENDO GRAVADA, e isso diverge da spec (§5.1).**
> Até a fase 3 a produção lê a média da **planilha**, e ela sai dessas linhas.
> Tirá-las agora faria a tela azul perder média antes da troca — a armadilha
> #11 por outra porta. "Não entra" e a limpeza das vencidas são da fase 3.

**`cancelada_dominio.js` é o dono único do cancelamento.** Ele lê as linhas do
relatório (`daPlanilha`) e marca os volumes (`marcar`); o import e o
`conferir_canceladas.js` usam os dois.

**O relatório real (4.867 linhas, 26/09/2026) respondeu como achar o volume:**

- a coluna "N.º de venda" traz a **venda** (`2000018…`) na venda comum e o
  **pack** (`2000015…`) na venda em pacote — o cruzamento olha `lote.venda`
  **e** `lote.packId`;
- o pacote de vários produtos vem com uma **linha de cabeçalho** (*"Pacote de
  2 produtos"*, o pack, sem SKU) e um item por linha embaixo, cada um com a
  venda e o **Estado** dele. O item herda o pack do cabeçalho.

| Onde o volume estava | O que acontece |
|---|---|
| `pendente`, `bloqueado` | `estagio='cancelado'` — sai de "Faltam imprimir", da fila, da urgência, dos Bloqueados e da média. **Estoque não mexe** |
| `embalado` (etiqueta impressa) | `cancelado` e vai para o card **Canceladas depois da etiqueta** (Admin → Bloqueados). **O estoque não volta sozinho** |
| no canto da coleta (`carregado`, sem caminhão) | idem — a caixa ainda está na fábrica |
| no carro de uma viagem aberta | idem, e sai da viagem (`saida_id` limpo) |
| `carregado` que já saiu | ignorado — se voltar, é devolução (§9) |
| **caixa de várias persianas** | **nunca é cancelada sozinha**: `cancelada_varias=1`, e vai para o card |

> ⚠️ **ESTÁGIO PRÓPRIO, E NÃO `cancelada_em IS NULL` ESPALHADO** — decisão D1 A
> do dono. Doze arquivos perguntam `estagio='pendente'`; um estágio novo sai de
> todos de uma vez. O estágio de antes fica em `cancelada_estagio` (história,
> como `bloqueio_resolvido`), e `cancelada_em` é a régua da média do sistema.
>
> ⚠️ **SÓ "CANCEL" CANCELA VOLUME.** As três frases do relatório (*"Cancelada
> pelo comprador"*, *"Venda cancelada. Não envie."*, *"Pacote cancelado pelo
> Mercado Livre"*) dizem "cancel". Devolução e reembolso (~260 linhas) são
> **depois de entregue**: continuam só fora da média da planilha, como sempre.
>
> ⚠️ **A CAIXA DE VÁRIAS NUNCA É CANCELADA SOZINHA**, porque cada item do
> pacote tem o seu Estado: cancelar a caixa inteira tiraria da fila as
> persianas que o cliente ainda quer. O item que veio debaixo de um cabeçalho
> de pacote conta como caixa de várias **mesmo sem `lote_item`** — o volume
> anterior a 15/09/2026 só conhece uma peça, e o arquivo diz que são várias.
>
> ⚠️ ~~**O CARD SÓ MOSTRA** (D3)~~ — **ELE DECIDE DESDE 02/10/2026**, pela
> **Mesa de correções** (§5), e o volume decidido **sai do card**. ~~*"a
> persiana voltou"* gera movimento `cancelamento` **por peça**~~ — **desde
> 22/10/2026 a volta é o ↩ Sobrou da Conferência**, com o bipe do SKU (§2), e a
> Mesa só registra a que *não voltou*. Ele continua fora do número da aba Bloqueados — nada
> ali está retido —, e agora ele **zera**, que é o que faz alguém voltar a ler.
> A caixa de várias persianas é a exceção: lá o sistema não sabe qual peça o ML
> cancelou, então só o "registrar" existe.
>
> ⚠️ **O BIPE RECUSA A CAIXA CANCELADA** (D2) — no Carregamento
> (`motivo:'cancelada'`, com auditoria), na viagem à agência e nas sobras do
> caminhão, e a reimpressão e o `GET /api/print/:id` também recusam — e diz o que fazer: *"Não carregar: separe a caixa e avise o
> admin"*. A venda cancelada **continua** sendo saída no gráfico de estoque
> (§18) **se já tinha baixado** — até 22/10/2026 o −1 era na impressão; desde
> então é na conferência (§2), e a cancelada antes de conferir nunca saiu.
>
> ⚠️ **E A VENDA TAMBÉM SE CANCELA PELA RECUSA DO MOTORISTA, desde 02/10/2026**
> (bloco "O MOTORISTA RECUSOU" no §8-B). Só o relatório não bastava: quando o
> motorista recusa no bipe dele, o relatório ainda não chegou. ~~Esse volume
> chega ao card e à Mesa com `cancelada_origem='motorista'`~~ — **desde
> 22/10/2026 o motorista é um dos motivos do ↩ Sobrou** (origem `sobra`), e a
> caixa já volta resolvida, sem passar pelo card.

**Antes do primeiro import depois do deploy, rode
`node conferir_canceladas.js <relatório.xlsx>`** — ele roda a mesma conta numa
transação desfeita e lista volume a volume o que o import faria. O relatório
de 26/09 cobre 14 meses, e o primeiro import acha todos os cancelamentos
antigos de uma vez.

**Rode `node teste_cancelada.js` (38 casos) ao mexer no `cancelada_dominio.js`,
no import do `plan_route.js` ou nas recusas do bipe.** Onze defeitos foram
reintroduzidos um a um: devolução cancelando volume (reprova 3), sem olhar o
pack (3), caixa de várias cancelada (5), sem o cabeçalho do pacote (4),
cancelar o que já saiu (2), o espelho apagando a passada (4), sem pedir
confirmação (3), aceitar arquivo sem futura (2), o bipe aceitando a cancelada
(2), a cancelada ficando na viagem (1) e a reimpressão aceitando a cancelada (1). `teste_carga`, `teste_ordem_dia` e
`teste_estoque` ganharam um caso de cancelada cada.

> ✅ **NO AR EM 26/09/2026** (PR #148). O dono fez o deploy e importou o
> relatório das 09:18 pela tela: *84 futuras · 0 novas · 131 atualizadas · 0
> futuras saíram*, e a base **continuou com 4.777 vendas**.
>
> ✅ **A METADE DO RECORTE ESTÁ PROVADA COM DADO REAL.** Aquele arquivo tinha
> ~130 vendas, e não os 14 meses do relatório de antes. Pela regra antiga ele
> teria apagado ~4.650 vendas passadas e zerado a média da tela azul — a
> armadilha #11 acontecendo no primeiro dia. Pela nova, a história ficou, e a
> comparação planilha × sistema continuou cheia (1.312 vendas × 1.422 peças).
>
> ⚠️ **A METADE DA CANCELADA NÃO ESTÁ PROVADA, e prova que não foi feita se
> escreve como não feita (§4).** O primeiro import não cancelou volume nenhum:
> sem tarja, sem card. As 12 linhas canceladas ou devolvidas daquele arquivo
> ou nunca viraram volume (canceladas antes do PDF), ou já tinham saído, ou
> eram devolução — a spec já dizia que o cancelamento entre o PDF e o envio é
> raro. A prova é o **primeiro cliente que cancelar depois de o PDF subir**:
> a venda tem que sair de "Faltam imprimir", ou aparecer no card se a
> etiqueta já saiu. Se nesse dia ela continuar pendente, é defeito, não
> silêncio normal.
>
> O `conferir_canceladas.js` **não rodou** antes do import (o relatório não
> chegou ao servidor), e o primeiro import foi um arquivo curto. Nenhum dos
> 14 meses de cancelamentos antigos foi varrido ainda: isso acontece no dia em
> que alguém importar um relatório de período longo, e aí o resumo diz quantos.

> **A ordem da tela azul e a regra da exceção** (SKU fora da lista no vermelho:
> avisa e deixa passar) estão em [`docs/regras/estoque.md`](docs/regras/estoque.md),
> cartões R-REV-02 a R-REV-04, e a história em
> [`docs/historia/estoque.md`](docs/historia/estoque.md).

---

## 4. Como uma peça é revisada e embalada

> **As regras desta seção estão em [`docs/regras/estoque.md`](docs/regras/estoque.md)**
> (cartões R-REV, R-EMB e R-KIT). O porquê longo — armadilhas **#20**, **#26** e
> **#31**, a etiqueta do kit, o QR que não lia — está em
> [`docs/historia/estoque.md`](docs/historia/estoque.md).

**Revisão — dois bipes:** SKU inicia o cronômetro; SKU de novo encerra, grava
`segundos` em `revisao` e põe a peça na `fila`.
**Embalagem — três bipes:** SKU inicia; o **kit** confirma que ele entrou; SKU
encerra, consome a `fila`, soma **+1** e abate a ordem do dia.

| Cartão | Regra em uma linha |
|---|---|
| R-REV-05 | A ordem urgente atendida pelo estoque não cobra produção (`ordem_dia.js`, #20) |
| R-REV-06 | Peça com problema volta para a produção e não entra na fila |
| R-EMB-01 | Sem o bipe do kit a embalagem não fecha — a trava é do servidor (#26) |
| R-EMB-02 | Embalar não exige a peça estar na fila (não é defeito) |
| R-EMB-03 | Só a embalagem de fila "hoje" abate a ordem do dia |
| R-EMB-04 | SKU sem cadastro não embala; as quatro escritas são uma transação |
| R-EMB-05 | A conferência da peça é no bipe 1 da embalagem (`pecaTexto`) |
| R-EMB-06 | Em modo teste a embalagem consome fila de teste |
| R-EMB-07 | Limpar a fila apaga só o que espera |
| R-KIT-01 | Trocar o código do kit exige `confirmar` (servidor) |
| R-KIT-02 | O código do kit não pode ser SKU de persiana |
| R-KIT-03 | O código do kit é conferido quando vem, e não exigido |
| R-KIT-04 | O que vai escrito na etiqueta do kit: campo ausente não apaga; texto encolhe, nunca vaza |
| R-KIT-05 | A etiqueta do kit tem uma porta de impressão só (o upload não volta) |
| R-KIT-06 | `kit.imprimir` é separada de `kit.editar` |
| R-KIT-07 | O QR do kit: caixa de 26 mm, módulo em ponto cheio, silêncio de 4 módulos (#31) |

**Ao mexer em** `mont_route.js` ou `montagem.html`: `node teste_montagem.js`. Em
`ordem_dia.js`, `modo_route.js` ou `st_route.js`: `node teste_ordem_dia.js`. No
`kit_pdf.js`, no card do kit, no `kit_etiqueta.js`, no `qr.js` ou no
`barras.js`: `node teste_kit.js` e `node teste_qr.js` (e, no `barras.js`, também
`cd tecido && npm test`). Na revisão: `node teste_revisao.js`.

---

## 5. O cruzamento com o PDF do Mercado Livre

> **As regras desta seção estão em [`docs/regras/expedicao.md`](docs/regras/expedicao.md)**
> (cartões R-PDF, R-VOL, R-CONF, R-URG, R-CAR e R-COR), cada uma com o teste que
> a trava. O porquê longo — armadilhas **#4, #5, #8, #9, #10, #22, #23, #24 e
> #27**, a caixa de várias persianas, as conferências e a Mesa de correções —
> está em [`docs/historia/expedicao.md`](docs/historia/expedicao.md).

```
PDF do ML → parse (folha + etiqueta + nota) → um volume por ETIQUETA em `lote`
   → conferências (pode reter em Bloqueados) → cruzamento (urgência)
   → Etiqueta de Venda (reserva) → Conferência (−1 por peça) → Carregamento
```

| Cartão | Regra em uma linha |
|---|---|
| R-PDF-01 | A folha é lida por bloco e não olha para trás (`folha.js`, o caso Abraão, #4) |
| R-PDF-02 | A venda que subiu de linha só é aproveitada se ninguém mais a pegou |
| R-PDF-03 | O título do anúncio sai da estrutura da folha, não de uma palavra (#24) |
| R-PDF-04 | A nota impressa é a PRIMEIRA folha da NF (#22) |
| R-PDF-05 | NF repetida não é duplicidade: a nota é do pedido |
| R-PDF-06 | O upload recusa Pack ID ou Venda que já existe no histórico inteiro (#5) |
| R-VOL-01 | Uma venda = uma etiqueta = uma persiana; o volume nunca se multiplica (#8) |
| R-VOL-02 | O que vai na caixa é `lote_item`, e conta-se PERSIANA — no servidor e na tela (#23) |
| R-VOL-03 | O irmão do pacote se lê por ausência, e só quando o PDF fecha |
| R-VOL-04 | Só o pacote de vários SKUs fica retido; a caixa de N unidades não |
| R-VOL-05 | Sem o bipe de cada persiana, a caixa de várias não imprime; baixa por peça |
| R-VOL-06 | A caixa de várias aparece antes do bipe, e uma vez só |
| R-VOL-07 | A frase da caixa é uma só (`fita(n)`) |
| R-VOL-08 | O backfill do pacote relê o PDF, e só tem 7 dias |
| R-CONF-01 | Cinco conferências; qualquer uma retém — e só com os dois lados lidos |
| R-CONF-02 | A trava não acusa o inocente; nome se compara pelo `nome.js` (#10) |
| R-CONF-03 | Retém o volume com dúvida, nunca o PDF inteiro |
| R-CONF-04 | A ordem das travas: divergência > pacote > folha > modalidade > SKU |
| R-CONF-05 | Quem retém sabe liberar (Admin → Bloqueados) |
| R-CONF-06 | A cobertura das conferências é medida na auditoria |
| R-URG-01 | O PDF gera só urgência |
| R-URG-02 | O recálculo é idempotente e não apaga o manual |
| R-CAR-01 | O carregamento não filtra por dia (#9) |
| R-CAR-02 | Só carrega o que passou pela Etiqueta de Venda (#27) |
| R-CAR-03 | O segundo bipe do carregamento, quando ligado, é cego |
| R-COR-01 | A Mesa de correções corrige pela ação, nunca pela linha |
| R-COR-02 | Fantasma é o `pendente` cujo irmão MAIS ANTIGO já andou |
| R-COR-03 | A cancelada depois da etiqueta: a Mesa só registra a que não voltou; a volta é o ↩ Sobrou |
| R-COR-04 | Saída de passivo na data do volume; venda futura não se fecha |
| R-COR-05 | O terminal e o botão usam a mesma régua (`correcoes.js`) |
| R-COR-06 | A Mesa nunca mexe em saldo |
| R-COR-07 | Conferências antigas fecham em bloco, até uma data que nunca é hoje, sem mexer em saldo, e só a caixa que já baixou |

**Ao mexer em** `parse.js`, `folha.js` ou `nome.js`: `node teste_parse.js`. No
upload (`exp_route.js`): `node teste_upload.js`. Nos textos de conflito, no
destravamento ou nas listas da caixa de várias: `node teste_divergencia.js`. Na
Etiqueta de Venda (`etq_route.js`, `embalagem.html`): `node teste_etiqueta.js`.
No cruzamento: `node teste_cruzamento.js`. No `carreg_route.js`: `node
teste_carga.js`. Na Mesa de correções ou nos scripts de passivo: `node
teste_correcao.js`, `teste_correcao2.js`, `teste_correcao3.js` e
`teste_conferencia_antiga.js`. Em permissão:
`node teste_acesso.js` e `node teste_cobertura.js`. E **abra a tela**: a caixa
de várias, o painel "depois" e a Mesa são texto montado.

Ferramentas que só leem: `node rastrear.js --lote` (os sete degraus do PDF até a
tela), `node rastrear.js --auditar [dias]`, `node conferir_nf.js --pdf` e `node
conferir_carregados.js`.

---

## 6. A trava de SKU não cadastrado

**Regra inegociável, definida pelo dono:**
> *"Tudo que estiver na folha de controle e não tiver no cadastro de SKU deve ser
> bloqueado. Não posso ter erros daqui para frente."*

Volume cujo SKU não existe em `skus` entra com `estagio='bloqueado'` e:

- `GET /api/print/:id` recusa (HTTP 409)
- `POST /api/carregar` recusa com motivo `bloqueado`
- `POST /api/embalar` recusa

**A trava é por volume, não por lote.** 40 vendas com 3 SKUs desconhecidos → 37
seguem normalmente, 3 ficam retidas.

**Destravamento:** cadastrar o SKU em `POST /api/skus` libera automaticamente
todos os volumes bloqueados daquele código (`sku_cad_route.js`), e a resposta
diz **quantos** soltou (`destravados`).

> ⚠️ **ARMADILHA #25 — O CADASTRO DE SKU APAGAVA O SALDO, E A TELA ESCONDIA
> ISSO.** Corrigido em 17/09/2026 (era a dívida 15 do §14). O `POST /api/skus`
> tinha `estoque=0` e `alvo=0` como **padrão do corpo**, e o upsert gravava
> `excluded.estoque`: uma chamada só com código e descrição **zerava o estoque
> do SKU**. Sem erro, sem log, sem motivo e sem linha em `ajuste_estoque` — que
> é o único lugar onde saldo mexido à mão deixa rastro (§18). A tela do admin
> reenvia os valores e por isso nunca caiu nisso; qualquer outro chamador caía.
> São três regras, e cada uma fecha uma porta diferente:
>
> - **Campo ausente não é campo vazio**, e vale para os **quatro** campos soltos
>   (`descricao`, `cor`, `estoque`, `alvo`) — a mesma regra que já valia para as
>   medidas na mesma rota. Ausente preserva o que está gravado; SKU novo nasce
>   com texto vazio e zero.
> - **Número impossível é recusado, nunca clampado.** Negativo, fração, texto e
>   campo vazio levam **400** com o nome do campo, e o saldo gravado não se
>   mexe. Clampar em zero seria a primeira regra outra vez por outra porta: o
>   saldo sumiria em silêncio, que é o defeito que se está consertando. Para
>   **manter** o saldo, o jeito é não mandar o campo.
> - **As duas escritas são uma transação só.** O destravamento ficava fora de
>   transação e dentro de um `catch(e){}` **vazio**: falhou, a API respondia
>   `{ok:true}` e os volumes seguiam bloqueados sem nenhum sinal — o volume some
>   da lista de quem cadastrou e ninguém vai procurá-lo. Hoje falha é **500**
>   com nada gravado, e o erro vai para o log.
>
> **A rota saiu do `server.js` para o `sku_cad_route.js` por isso**: o
> `server.js` abre porta e banco real, e nenhum teste do projeto consegue
> carregá-lo. Rota que mexe em estoque e não dá para testar é dívida que só
> fecha no susto. O `require` ficou exatamente onde as rotas estavam — mudar o
> lugar mudaria a ordem de registro no Express.
>
> **Rode `node teste_skus.js` ao mexer no `sku_cad_route.js`** — os 60 casos
> travam os quatro campos, a recusa do número impossível, o rollback e as três
> guardas do destravamento (divergência, modalidade e pacote continuam presas).
> Mexeu na ordem do `server.js`? O teste de segurança da §10 também.
>
> **O que NÃO entrou, e continua aberto:** a rota muda saldo com
> `sku.cadastrar`, sem motivo e sem auditoria, enquanto o `POST /api/estoque`
> exige motivo, é `sensivel` e grava em `ajuste_estoque` (§18). Fechar essa
> porta muda como a fábrica trabalha — é `REGRA`, não conserto.

**Sem tabela de equivalências, por decisão explícita.** Se o anúncio do ML manda
`BK140140BEGEML` e o cadastro tem `BK140140BEGE`, o volume fica bloqueado até o
anúncio ser corrigido na origem. Isso força a padronização em vez de mascará-la.

---

## 7. O SKU — **não há formato obrigatório**

> ⚠️ Isto mudou em 23/08/2026 (Compras, Fase 0). Se você lembra da regra
> `BK + largura(3) + altura(3) + COR`, ela **não existe mais**.

**O código do SKU é uma etiqueta livre.** Pode ter espaços, hífens, números no
meio — `ROLO SOB MEDIDA 137x212` é um SKU válido. O sistema não interpreta o
código para descobrir nada.

O que a peça É vive em **colunas** de `skus`:

| Coluna | O que é | Exemplo |
|---|---|---|
| `largura_cm`, `altura_cm` | Medida, centímetros inteiros | 160, 140 |
| `cor_codigo` | Cor, da lista fechada `cor` | `BEGE` |
| `tecido_codigo` | **Material**, da lista `tecido` | `BLACKOUT` |
| `modelo_id` | **Mecanismo**, da tabela `modelo` | Rolô, Acessório |

> ⚠️ **Tecido não é modelo.** O `BK` dos códigos antigos é *blackout* — o
> tecido. O modelo é o mecanismo: Rolô, Romana. A primeira migração da Fase 0
> confundiu os dois e gravou modelo `BK` em 24 SKUs; foi corrigido. Nunca deduza
> modelo do prefixo do código.

**Produto sem medida existe.** `KIT32` e `ACESSORIOSPERSIANAS` não são persianas.
O modelo deles tem `exige_medida = 0`, e por isso não são cobrados por largura e
altura na tela de pendências. Sem essa flag, o contador nunca zeraria — e um
contador que nunca zera é um contador que a equipe aprende a ignorar.

> A **etiqueta impressa** segue a mesma flag. Ela cobrava medida de todo mundo, e
> o acessório caía num beco sem saída: não havia o que preencher em Pendências de
> SKU e a etiqueta nunca saía. Hoje, sem medida, o lugar de destaque vira a
> **descrição** (`Kit 32 mm completo`) e o M² não é impresso — área de acessório
> não existe, e `M² 0.00` seria um número falso colado no produto. Persiana sem
> medida cadastrada continua recusada: ali a medida falta mesmo.

**Produto sem estoque existe, e não é falta.** `modelo.sob_medida = 1` marca a
peça feita contra o pedido do cliente: ela não existe antes da venda e não sobra
depois, então o saldo dela é sempre zero. Esses SKUs não passam pela trava de
estoque da Etiqueta de Venda **nem pela baixa** — sem `+1` na embalagem não pode
haver `−1` na conferência (até 22/10/2026, na impressão), senão cada venda sob
medida abriria um buraco de uma peça no SKU.

> ⚠️ **ARMADILHA #6 — a trava que a operação contorna não protege, só cega.**
> Até 25/08/2026 o `POST /api/embalar` recusava todo SKU com estoque zero. Como
> sob medida **nunca** tem estoque, isso recusava 100% dessas vendas. O que
> acontecia então não era a peça ficar retida: a bancada imprimia a etiqueta
> direto do PDF do Mercado Livre e despachava por fora — sem registro, sem a
> conferência do carregamento, e com o volume preso em `pendente` para sempre,
> reimportado a cada PDF novo. Foi assim que 1 SCREEN3 e 2 SOBMEDIDA de 24/08
> viraram fantasmas depois de terem sido entregues.
>
> Quando uma trava dispara todo dia no caso normal, ela para de ser proteção e
> vira um desvio que a equipe aprende a fazer — e o desvio acontece fora da
> vista do sistema, que é o pior lugar possível.

> ⚠️ **ARMADILHA #30 — E ESSE CONSERTO FICOU TRÊS SEMANAS SEM FUNCIONAR, PORQUE
> NINGUÉM MARCOU A CAIXINHA.** Descoberto em 17/09/2026, por acaso, enquanto se
> levantava outro passivo. O conserto da #6 lê `modelo.sob_medida`. Em produção
> **nenhum modelo tinha a flag**: havia dois, `ROLO` e `ACESSORIO`, os dois com
> `sob_medida = 0` — e o SKU `SOBMEDIDA` estava cadastrado como **Rolô**. A
> regra estava escrita aqui, codificada em quatro arquivos, e **inerte**.
>
> **É a armadilha #13 (§19) pela terceira ponta.** Lá são chave, rota e alguém
> que a tenha; aqui são a coluna, o código que a lê e **o dado preenchido**. A
> que some em silêncio é sempre a última: nada no boot, no log ou em tela
> nenhuma diz *"esta regra não está pegando em ninguém"*.
>
> E o modo de falhar é o da própria #6, o que torna a coisa circular: com a flag
> em zero a trava de estoque voltava a disparar em **100%** das vendas sob
> medida, a bancada despachava por fora, e o sistema não registrava nada. Os
> volumes 484 e 485 (Geison Sobrinho, 25/08) saíram assim — foram lidos como
> passivo da dívida 13 e eram, na verdade, o sintoma desta.
>
> **Os dois sinais que denunciaram, e servem para a próxima vez:**
> - `SOBMEDIDA` aparecendo na conta de saldo do `conferir_carregados.js`. Aquele
>   script só põe na tabela quem tem a flag **falsa** — foi ele que gritou, sem
>   ter sido escrito para isso.
> - `14 × 4 cm` no cadastro. O bipe 1 da embalagem mostra a medida em letra
>   grande para o operador comparar com a peça na bancada (§4); número absurdo
>   ali é conferência que ensina a equipe a ignorar a linha.
>
> **O reparo foi cadastro, não código** (17/09/2026): modelo `SOBMEDIDA` / *Sob
> medida* com `sob_medida = 1` e `exige_medida = 0`, e o SKU apontado para ele,
> com largura e altura **vazias** — vazio ali é resposta, não pendência. Custo
> do `SOBMEDIDA` passou a sair como **pendência** na lista de compras, e isso
> está certo: antes era um número tirado da ficha do Rolô aplicada a `14 × 4`
> (§7-B, regra 4 — custo indefinido nunca vira zero).
>
> ⚠️ **NÃO MARQUE `sob_medida` NO MODELO `ROLO` "para resolver".** São 29 dos 30
> SKUs: a fábrica inteira sairia da trava de estoque e da baixa de uma vez, e o
> saldo pararia de andar sem um único aviso.
>
> ⚠️ **E O REPARO A CLIQUE FALHOU NO MEIO — por isso ele virou script
> (18/09/2026).** São quatro passos em duas telas, com caixinhas que salvam
> sozinhas e um campo de código que é chave de upsert. O que sobrou da primeira
> tentativa: o modelo **não criado**, o texto `"Sob medida "` parado no campo
> livre `cor` (que é o que a embalagem mostra em letra grande, §4), um SKU vazio
> `BKSOBMEDIDA` nascido de uma edição no campo do código, e **quatro cadastros
> desativados por engano** (`SCREEN3`, `BEGE`, `BRANCO`, `CINZA`).
>
> `node arrumar_sobmedida.js` (simula) e `--aplicar` fazem as cinco coisas numa
> transação, com backup por `db.backup()` antes. `teste_arrumar_sobmedida.js`
> (63 casos) trava as duas guardas que importam: **o ROLO nunca recebe a flag**
> (são 29 dos 30 SKUs — a fábrica inteira sairia da trava de uma vez) e o SKU
> vazio **só é apagado** se não houver saldo nem referência em nenhuma das dez
> tabelas que citam um código. Apagar cadastro com volume atrás devolve o volume
> para `bloqueado` (§6): SKU a mais é ruído, SKU a menos é caixa parada.
>
> ⚠️ **E HÁ MAIS DE UM SKU SOB MEDIDA — `--sku CODIGO` aponta os outros**
> (18/09/2026). O `BKSOBMEDIDA` **não** nasceu de deslize: é um SKU real da
> folha do ML, cadastrado em 16/09 para destravar a venda do Anderson (volume
> 1628). Sem modelo, a Etiqueta de Venda lia `sob_medida = 0`, via saldo zero e
> recusava — a #30 com um cliente esperando. Ele mexe **só no modelo**: cor,
> medida e saldo ficam como estão, porque limpar campo de um SKU qualquer seria
> o script inventando estrago onde não há.
>
> ⚠️ **SKU COM SALDO É RECUSADO, e essa é a #30 ao contrário.** Sob medida não
> baixa estoque (§7): apontar para lá um SKU que tem peça na prateleira
> **congela aquele saldo para sempre** — ele nunca mais desce e nada avisa. O
> script recusa dizendo o número, e manda zerar por Admin → Estoque (com
> motivo) antes. E **nomear um SKU no `--sku` é dizer que ele é legítimo**:
> ele nunca é apagado na mesma rodada, senão o script o apontaria para o modelo
> e o apagaria na mesma transação.
>
> ⚠️ **AVISO NÃO É AÇÃO.** O "NÃO apaguei o BKSOBMEDIDA" descreve o que o
> script **deixou** de fazer, e entrava na lista de ações: toda rodada
> anunciava "O QUE VOU FAZER" com uma linha que não faz nada. Lista que repete
> o mesmo texto toda vez ensina a ignorá-la, e aí a rodada com algo de verdade
> passa batida. Hoje os avisos saem num bloco **ATENÇÃO** próprio, antes.
>
> ⚠️ **DUAS ARMADILHAS DE TELA APARECERAM AÍ, e as duas continuam de pé:**
> - **O campo do código no Cadastro de SKU é chave de upsert.** Editá-lo **cria
>   um SKU novo** em silêncio, em vez de renomear o antigo — e na tela ele
>   parece um campo editável como os outros.
> - **"Desativar" não tem botão de voltar.** A linha inativa mostra só o texto
>   "inativo". O caminho de volta existe e não é óbvio: **Adicionar** com o
>   mesmo código reativa (a rota grava `ativo=1` no conflito). Desativar não
>   apaga nada, e SKU que já aponta continua apontando — o único efeito é sumir
>   da lista de opções de cadastro novo.
>
> **Regra que fica:** regra nova que dependa de flag de cadastro não está pronta
> quando o código a lê — está pronta quando **existe linha marcada no banco**.
> Enquanto não houver, ela é texto. Ainda **não há nada que acuse isso sozinho**
> (a cobertura do §18 faz exatamente esse trabalho para as conferências do
> parse; aqui não existe equivalente) — é dívida aberta.

> ⚠️ **`SOBMEDIDA` é um balde, e isso ainda é dívida aberta.** Um código só para
> peças que são todas diferentes: a folha de controle traz apenas `SOBMEDIDA`,
> enquanto na bancada as peças vêm etiquetadas por pedido (`1027/01`, `1027/02`)
> e com **medidas quase sempre diferentes**. Nada liga o volume do ML à peça
> física — a fila pega "a mais antiga de `SOBMEDIDA`", que não diz *qual peça*.
> Hoje quem resolve é a memória de quem embala, e nenhuma das cinco conferências
> do §5 pega uma troca, porque as duas peças têm o mesmo código. Falta o cadastro
> do item sob medida (pedido, item, medida, cor, cliente) e o bipe que fecha esse
> vínculo contra **o cliente** — que é onde o erro caro mora: item trocado dentro
> do mesmo pedido chega no mesmo endereço; peça trocada entre clientes é
> reclamação.

### Quem lê o quê

- Etiqueta, revisão (`/operador`) e devolução leem **as colunas**. Um SKU sem
  medida cadastrada não imprime etiqueta e aparece só pelo código na revisão.
- `public/sku.js` (`medidaDe`) é o **único** lugar que ainda olha o texto do
  código, e serve a **um** propósito: no cadastro, quando alguém digita um
  código no formato antigo, adiantar largura, altura e cor. Os campos seguem
  editáveis e vale o que está no campo. Ela **nunca** devolve modelo.
- O que falta preencher aparece em **Admin → Pendências de SKU**.

**A trava do §6 continua valendo.** "Sem formato" não é "sem cadastro": o SKU
tem que existir em `skus`, senão o volume fica bloqueado. São coisas diferentes.

**A etiqueta impressa (Zebra ZD220, 100×35 mm, 203 dpi)** sai em **PDF do
servidor** desde 20/10/2026 (`sku_etq_pdf.js`, `POST /api/skus/etiqueta`, botão
"etiqueta" da aba Cadastro de SKU), com a página **já** no tamanho do rolo — uma
página por etiqueta. Até ali era uma página HTML impressa pelo navegador, com
JsBarcode baixado da internet: só encaixava com margens "Nenhuma" e escala 100%
acertadas a cada vez, saía sem barras sem internet e podia soltar uma em branco
no fim. É a mesma porta do kit (`kit_pdf.js`) e do sob medida.
- **O que vai escrito não mudou:** título, medida em metros, M², cor, barras
  CODE128-B (do `public/barras.js`, o mesmo do kit e do sob medida) e o código.
  Persiana sem medida é recusada (409, mandando à Pendências de SKU); acessório
  sai com a descrição em destaque e sem M². A regra mora **só no servidor**.
- O módulo da barra cai em **ponto inteiro** da ZD220 (múltiplo de 0,125 mm), de
  0,25 a 0,5 mm, com 10 módulos de silêncio; código que só caberia abaixo de
  0,25 mm é **recusado**, não impresso ilegível. Texto que não cabe encolhe e,
  no limite, termina em "…"; caractere que a fonte não tem (seta, emoji) sai.
- A rota é `@logado`: é leitura, a mesma do `GET /api/skus` de onde a página
  antiga tirava tudo. Não mexe em saldo.
- `teste_etiqueta_sku.js` (54) trava o tamanho da página, o conteúdo, as bordas e
  **lê as barras de volta do PDF**. Conferido também com um leitor de código
  independente (zxing) na imagem renderizada a 203 dpi.

> ✅ **NO AR E CONFERIDA NA FÁBRICA EM 20/10/2026** (PR #198): o dono fez o
> deploy, imprimiu na ZD220 e conferiu que a etiqueta encaixa no rolo de 100 × 35
> e bipa.

---

## 7-B. Compras — o módulo novo

> Especificação completa: `docs/specs/COMPRAS.md` — o topo dela lista o que mudou na construção.
> Fases 1 a 6 implementadas (1–5 em 23/08/2026, 6 em 24/08). Fase 7 (relatórios)
> pendente — espera haver história para mostrar.
> Histórico de custo (`custo_dominio.js`) e contagem de material entraram
> **antes** da Fase 6, e de propósito: os dois são relógios de história. Enquanto
> não existem, o período não fica atrasado — fica perdido, porque história não se
> reconstrói depois. A perda de corte só aparece comparando o que a ficha diz que
> foi consumido com o que sobrou na prateleira, e isso precisa de meses.

Responde três perguntas que o sistema não respondia: **o que comprar**,
**de quem comprar** e **quanto o produto custa**.

### A peça que quase todo sistema de compras erra

```
UNIDADE DE CONSUMO   como a ficha gasta        metro · unidade
UNIDADE DE COMPRA    como o fornecedor vende   barra 6 m · caixa 500 un
FATOR                quantas de consumo cabem numa de compra
```

**A embalagem mora na OFERTA, não no componente.** O mesmo tubo é barra de 6 m
num fornecedor e de 3 m no outro — se morasse no item, os dois não caberiam no
cadastro. E ninguém compra fração de embalagem: precisa de 7 m, leva 12.

Por isso a comparação mostra **sempre três números** — preço por unidade,
desembolso e sobra. Ordenar por um só, escondendo os outros, é como o comprador
é enganado.

### A ficha é fórmula, não lista

Componentes se lançam **uma vez, no modelo** — nunca SKU a SKU. Com 200 SKUs e 3
modelos são 18 linhas em vez de 1.200, e o SKU novo de amanhã custa zero.

`formula.js` é a **única porta** por onde uma expressão do banco é executada, e
**não usa `eval()`**. Uma string do banco rodando como JavaScript daria a quem
edita fórmula acesso ao `.session_secret` e aos PINs. Fórmula não salva sem
passar no teste de três medidas.

> ⚠️ **Tecido resolve por família + cor + largura de bobina**, e a quantidade
> pode depender da bobina (corte invertido). A escolha é por **custo total da
> peça**, não por menor preço por metro linear — com corte invertido a bobina
> mais cara por metro sai mais barata por peça.

### Donos únicos — não replicar

| O quê | Dono | Por quê |
|---|---|---|
| `componente.estoque` e `movimento_componente` | `componente_dominio.js` | `skus.estoque` tem nove donos e por isso não se reconstrói história |
| Custo médio | `componente_dominio.js` | Só se move no recebimento |
| Ficha e custo de um SKU | `ficha_dominio.js` | O histórico de custo precisa da MESMA conta da tela |
| Demanda por SKU (`precisa`) | `demanda_dominio.js` | O número que a fábrica produz é o que manda na compra |
| Explosão da ficha → material | `necessidade_dominio.js` | Gatilho 2 da lista de compras |
| Necessidade → desembolso | `compras_calc.js` | Custo nunca se calcula em dois lugares |
| Avaliação de fórmula | `formula.js` | Segunda porta = buraco de segurança |

> **Por que a demanda saiu do `plan_route.js`:** o `precisa` de cada SKU já
> decidia o que a fábrica produz (tela AZUL do operador). Quando ele passou a
> decidir também **o que comprar**, uma segunda cópia significaria comprar
> material para uma fábrica diferente da que existe.

### ⚠️ ARMADILHA #18 — a ficha tem DOIS números por linha, e eles nunca fecham

Desde 04/09/2026 a linha da ficha responde duas perguntas diferentes, em
colunas diferentes de `ficha_formula`:

| Coluna | Responde | Quem lê |
|---|---|---|
| `expressao` | quanto a peça **consome** | custo, compra, necessidade de material |
| `corte_largura` / `corte_altura` | a quanto a bancada **corta** | a ficha de produção |

```
tubo de uma persiana de 1,60   CONSOME 1,60 m da barra de 6 m
                               é CORTADO a 1,57 (o resto entra nas ponteiras)
```

Os 3 cm vão pro lixo. **Precificar pela medida de corte faz a fábrica parar de
pagar por eles; cortar pela medida de consumo faz a peça não entrar.** São duas
verdades, e quem um dia "unificar" está cortando ou o custo ou a peça. No
tecido a medida de corte é um **retângulo** (largura × altura + folga), no tubo
é um número só; onde não há o que cortar as duas ficam vazias, e isso é
resposta, não pendência.

O `ficha_dominio.js` soma **só** a `expressao`. Há caso travando isso: dobrar a
medida de corte não pode mexer em um centavo (`teste_ficha.js`). E falta de
preço **não apaga** a medida de corte — a bancada corta o tubo do mesmo jeito
sem fornecedor cadastrado, e ficha que some manda cortar de memória.

> Até aqui esse segundo número morava na cabeça de quem corta, que é a mesma
> doença do `SOBMEDIDA` (§7): o vínculo existe na memória e não no sistema.

### ⚠️ ARMADILHA #19 — o `/200` do tecido é um DOIS escrito dentro da fórmula

A linha de tecido do modelo Rolô é `(altura + 20) / 200`. O `/200` afirma que
cabem **duas peças por faixa** em qualquer bobina, de qualquer largura.

> ⚠️ **A CONTA SÓ FECHA COM A MEDIDA DE CORTE E A ORIENTAÇÃO NA MÃO, e nenhuma
> das duas estava no sistema.** A primeira versão desta seção acusou a peça de
> 1,80 de custar **metade** do que a ficha dizia. Estava errado: aquela conta
> supunha a peça **de pé**, e a fábrica corta essa — e só essa — **invertida**.
> O corte real dela é `1,77 × 1,60` (largura − 3, altura + **10**), e invertida
> cabem **duas por faixa** na bobina de 3,20, porque `1,60 + 1,60 = 3,20`
> exato. O consumo verdadeiro é **0,885 m**, contra os 0,850 que o `/200` cobra
> — 4% a menos, não metade.
>
> A lição não é sobre o número: é que **medida de corte e orientação são dados
> de produção, e enquanto moram na cabeça de quem corta qualquer conta feita
> por fora inventa uma fábrica que não existe** — inclusive a minha.

O corte real é `largura − 3` de largura por `altura + folga` de altura, e a
folga muda com a orientação: **+20 de pé, +10 invertida**. Os 10 cm não são
economia de tecido — são o que faz `1,60 + 1,60` fechar em 3,20.

Contra o corte de pé, que é o que a fábrica faz em seis das sete larguras:

| Largura | SKUs | melhor de pé | o `/200` cobra |
|---|---|---|---|
| 1,00 | 3 | 3 por faixa na 3,20 → 0,567 m | 0,850 → **50% a mais** |
| 1,20 a 1,60 | 16 | 2 por faixa → 0,850 m | 0,850 ✔ |
| 1,80 | 3 | **invertida**, 2 por faixa na 3,20 → 0,885 m | 0,850 → 4% a menos |

**Pior que o número: ele curto-circuita a máquina que já existe.** O
`ficha_dominio.js` avalia a fórmula **uma vez por bobina candidata** e fica com
a de menor custo por peça — desenhado exatamente para o corte invertido. Com um
`2` fixo as duas bobinas dão o mesmo consumo, e a escolha desempata por **preço
por metro linear**, que é o critério errado quando as bobinas têm larguras
diferentes: o que se compra é m², e um metro de 3,20 traz 14% mais tecido que
um metro de 2,80.

> ⚠️ **E A FÓRMULA POR ÁREA NÃO É O CONSERTO.** `(altura+20) * largura /
> largura_bobina / 100` parece honesta e reparte a faixa proporcionalmente, mas
> abrindo a conta do custo o que sobra variando entre as bobinas é só o **preço
> por m²** — então ela escolhe sempre a mesma bobina, para todo SKU, e a
> comparação lado a lado vira enfeite. Pior: ela supõe que o resto da largura
> **sempre** é aproveitado por alguém, o que só vale onde o par fecha exato.

A fórmula que descreve as duas orientações, e deixa a bobina decidir de verdade:

```
min( (altura + 20) / piso(largura_bobina / (largura - 3)),     ← de pé
     (largura - 3) / piso(largura_bobina / (altura + 10)) )    ← invertida
   / 100
```

> ⚠️ **Ela diz o que É POSSÍVEL, não o que a fábrica FAZ** — e por isso ainda
> não está no sistema. Pelo `min`, a 1,20 sairia invertida a 0,585 m; a fábrica
> corta de pé a 0,850. A ficha subfaturaria 31%. **Orientação é decisão de quem
> produz, não resultado de fórmula**, e o mesmo vale para a folga. Enquanto a
> decisão não for um dado lançado, a fórmula honesta é a de pé.

**Pareamento: as sete larguras fecham exato na 2,80; na 3,20, cinco das sete.**
`1,80+1,00`, `1,60+1,20`, `1,50+1,30` e `1,40+1,40` fecham na 2,80;
`1,80+1,40`, `1,60+1,60` e `1,20+1,00+1,00` fecham na 3,20. A 1,30 e a 1,50
**nunca** fecham na 3,20 — o lugar delas é a 2,80, uma com a outra. Por isso as
duas bobinas são necessárias **pelo par, não pelo preço**.

> **Sinal na tela:** linha de tecido cuja fórmula não menciona
> `largura_bobina` aparece com tarja âmbar "não olha a bobina", e o teste ao
> vivo mostra o resultado em **cada** bobina lado a lado. Duas colunas com o
> mesmo número são a assinatura do problema.

> ⚠️ **As medidas de teste vêm do CATÁLOGO, não de uma lista fixa.** O
> `formula.js` trazia 1,00×1,00 / 1,80×1,50 / **3,00×2,50** escritas no código,
> e a última não existe: a persiana mais larga tem 1,80 e a bobina mais estreita
> tem 2,80 — 3,00 não cabe em bobina nenhuma, e não há emenda. A fórmula honesta
> do `piso` dava **divisão por zero** ali e era recusada na tela; para conseguir
> salvar, alguém escrevia o `2` fixo. É a armadilha #6 outra vez — trava que
> dispara no caso normal vira desvio. Hoje `ficha_route.js` monta as medidas a
> partir dos SKUs do modelo (a mais estreita, a mais comum, a mais larga) e o
> `formula.js` **ignora** a medida que não cabe na bobina, dizendo qual e por quê.
> Ignorar todas não aprova: um ok sem evidência mente pior que a recusa.

**Rode `node teste_ficha.js` após qualquer mudança no `formula.js`, no
`ficha_dominio.js` ou no `ficha_route.js`** — os 40 casos travam a separação
entre consumo e corte, a conta das duas bobinas SKU a SKU, as medidas de teste
e a porta única do avaliador.

### ⚠️ ARMADILHA #33 — NÃO HAVIA ONDE CADASTRAR MATERIAL, e a rota que existia apagava o tecido

**24/09/2026.** A fase 4-C (§19) mandou o tubo do sob medida para a lista de
compras, e o passo seguinte era óbvio: cadastrar `Tubo 38`, `Tubo 41` e
`Tubo 56`, que a escada usa e o PCP não tinha. **Eu mandei o dono a uma tela
que não existe** — "Admin → Compras → Ponto de pedido". Aquele card só editava
mínimo e ideal de componente **já cadastrado**; em oito meses de Compras
**nunca houve, em tela nenhuma, um lugar de criar material**. Os que existem
nasceram por `INSERT` à mão.

> ⚠️ **É A DÍVIDA 18 (§14) COM A CARA MAIS CARA: a rota estava lá, e a porta
> não.** `POST /api/componentes` cria desde a fase 0 — responde 200 no `curl`,
> tem permissão declarada, entra na cobertura do §10. O que faltava era alguém
> conseguir chegar nela, que é o mesmo buraco do extrato do livro (§2) e do
> chip "Negativo". A diferença é que aqui **ninguém foi procurar por um ano**:
> não dá erro, não some da tela, simplesmente não existe — e o que se faz no
> lugar é `INSERT` no banco, que é o desvio da armadilha #6 pela porta do
> cadastro.

**E abrir a tela em cima da rota teria estragado o tecido.** O `POST` lia
`estoque=0`, `alvo`, `familia`, `cor` e `largura_bobina_cm` **do corpo, sempre**
— campo ausente valia como vazio, que é a dívida 15 (§6, armadilha #25) viva
numa segunda rota:

```
POST /api/componentes {id:3, estoque_minimo:45}     ← editar o mínimo do tecido
                       familia, cor e largura_bobina_cm NÃO vieram
ANTES:  familia := NULL, cor := NULL, largura_bobina_cm := NULL
        o componente de tecido deixa de ser tecido, e a ficha para de resolver
        por família + cor + largura de bobina (§7-B) — sem erro e sem aviso
```

O card antigo **reenviava os nove campos a cada tecla**, e era só isso que
segurava o estrago — por acaso, como a tela do admin segurava o `POST /api/skus`
da #25. A tela nova manda **só o campo editado**, que é o certo, e teria sido a
primeira a cair nele. **O conserto foi achado escrevendo o teste antes do
código**, que é o que a §0 pede no risco 🔴, e é a única razão de isto estar
escrito como armadilha e não como incidente.

As três regras da #25 valem aqui inteiras, e agora com teste:

- **Campo ausente não é campo vazio** — preserva. **Vazio de propósito apaga**,
  que é decisão de quem editou. São coisas diferentes e a rota separa as duas.
- **Número impossível é recusado (400) dizendo QUAL campo, nunca clampado.**
  `Math.max(0, parseFloat(x)||0)` transformava `"abc"` e `-5` em zero em
  silêncio — o clamp que a #25 proíbe, porque apagar saldo caladinho é o mesmo
  defeito por outra porta. O rótulo da recusa é o da **tela** ("o estoque
  mínimo"), não o da coluna: `estoque_minimo` não diz nada a quem cadastra.
- **`nome` é obrigatório só para NASCER.** Exigi-lo na edição era a confusão
  entre ausente e vazio pela outra ponta: um POST parcial morria com "nome
  obrigatório" em vez de gravar o campo citado.

> ⚠️ **A RECUSA APARECE NA PRÓPRIA LINHA, E O DIGITADO FICA.** A primeira
> versão da tela escrevia o motivo no rodapé do card, ao lado do botão
> Adicionar, e repintava o valor velho por cima. Com quinze materiais na lista,
> quem edita a primeira linha vê o número **voltar sozinho** e a explicação
> fora da tela — ou colada num formulário de criar que ele nem abriu. É a regra
> da ficha (*"recusar uma fórmula não pode repintar a antiga"*, logo abaixo)
> pela porta do cadastro: o campo fica vermelho, com o motivo embaixo dele e o
> que a pessoa digitou ainda lá, visivelmente **não salvo** e corrigível.
> **Só apareceu abrindo a tela.**

> ⚠️ **"DESATIVAR" GANHOU O CAMINHO DE VOLTA, e é o contrário do cadastro de
> SKU.** Lá a linha inativa mostra só a palavra "inativo" e o caminho de volta
> é **Adicionar com o mesmo código** — que ninguém adivinha (§7). Aqui o mesmo
> botão troca de nome para **Reativar**, e a lista devolve os inativos
> justamente para ele existir. Desativar não apaga: há oferta, ficha e pedido
> apontando para a linha.

> ⚠️ **O ESTOQUE NÃO SE EDITA AQUI, e está escrito na tela.** Ele entra pelo
> Recebimento e se corrige pela Contagem, que grava em `movimento_componente`
> com quem e por quê (§7-B, donos únicos). Um campo de saldo neste card seria
> o oitavo dono da coluna que o §2 passou uma fase inteira reduzindo a um.

> ⚠️ **A LINHA DE CRIAR FICA EMBAIXO DA LISTA.** Quem chega aqui quase sempre
> vem ajustar mínimo; um formulário em cima empurraria a lista para fora da
> tela todo dia por causa do uso raro.

> **Rode `node teste_componentes.js` ao mexer no `POST /api/componentes` ou no
> card Materiais** — os 38 casos travam os três pontos acima, e o que importa
> mais é este: editar o mínimo de um componente de **tecido** e exigir que
> família, cor e largura de bobina continuem lá. Foi conferido reintroduzindo
> cada defeito, um a um — o wipe reprova 4 casos, o clamp reprova 9, ignorar o
> `ativo` reprova 1.
>
> ⚠️ E o Express de mentira do teste **transforma rota que estoura em 500** em
> vez de deixar a rodada morrer: com o wipe reintroduzido, um POST parcial bate
> no `NOT NULL` do `nome` e a suíte inteira parava no caso 9 — o defeito
> aparecia como *"travou"*, não como vermelho, e os 29 casos de baixo nunca
> rodavam.

### Regras que parecem bug e não são

- **Custo indefinido nunca vira zero.** Falta preço numa linha → o total é
  `null`, não a soma parcial. Zero é um custo válido e mentiroso.
- **Não há coluna `tipo` na `ficha_formula`, e é de propósito.** A tela oferece
  tipos de linha (quantidade fixa, pela largura, pela altura, pelo tecido) que
  **geram** a expressão; o que se grava continua sendo a expressão, e a tela
  reconhece a forma de volta lendo o texto. Uma coluna `tipo` seria uma segunda
  fonte de verdade sobre a mesma linha, e as duas divergiriam no dia em que
  alguém editasse a expressão à mão — que é justamente o que a tela permite.
- **Recusar uma fórmula não pode repintar a antiga.** A tela fazia
  `alert(...)` seguido de redesenho: o texto digitado sumia e voltava a fórmula
  velha, e quem editava via a recusa e uma fórmula que não era a sua. Hoje o
  erro fica na própria linha, com o que foi digitado ainda no campo.
- **A tabela da ficha é só leitura, e editar abre UM material de cada vez.**
  A primeira versão punha dez campos em duas linhas de tabela por material:
  dava para editar e não dava para ler — não se enxergava onde um material
  acabava e o outro começava. Não é preferência estética: quem não consegue
  ler a ficha não confere a ficha, e ficha que ninguém confere é a armadilha
  #6 de novo, a régua que a equipe contorna. Cada coluna carrega só o que
  explica ela — a bobina escolhida fica sob a **quantidade**, que é o que ela
  explica, e não empilhada sob o nome do material.
- **Componente de família não entra na lista de "acrescentar material".**
  Apontar `Blackout bege 3,20` direto **congela a bobina na ficha**: o
  `ficha_dominio` deixa de avaliar as candidatas e a escolha por menor custo
  por peça — a máquina inteira do corte invertido — não roda. Tecido se aponta
  pela **família**, sempre.
- **Quem recebe não vê preço.** A rota do Recebimento monta o JSON **sem** os
  campos de preço — não adianta esconder na tela e mandar pelo fio.
- **Recebimento parcial mantém o pedido aberto**, e o saldo continua contando
  como *a caminho*. Só fecha com um dos dois motivos.
- **Material devolvido não entra no estoque** e segue como *a caminho* — o
  fornecedor ainda deve.
- **Bipar código de material não conta 1.** A unidade de consumo do tubo é o
  metro; `+1` ali seria 1 metro, não 1 barra. A tela avisa e manda para o campo
  de material, onde a quantidade é digitada.
- **Zero é lançamento válido na contagem de material.** É a única forma de um
  material que acabou entrar na contagem em vez de ficar de fora dela — e ficar
  de fora é o que mantém o saldo errado no sistema.
- **Saldo de material é arredondado em 3 casas** dentro do
  `componente_dominio.js`. `3,5 + 0,2 = 3,7000000000000006` não é precisão, é
  ruído, e ele compõe: cada contagem grava o lixo da anterior. Custo médio é
  outra escala (R$ 0,0825 por parafuso é preço de verdade) e corta em 6 casas.
- **O pedido congela embalagem, fator e preço.** Mudar o preço do cadastro não
  mexe em pedido já feito.
- **Escolher fora do melhor preço exige motivo**, e vai para a auditoria.
- **A necessidade é o MAIOR dos dois gatilhos, nunca a soma**, e sempre desconta
  o que está a caminho. O mínimo existe para cobrir a venda que ainda não
  apareceu; quando ela aparece, **substitui** o mínimo em vez de somar a ele.
- **A perda de corte pertence ao gatilho 2, não ao 1.** Perda é fenômeno de
  consumo. Aplicá-la ao ponto de pedido compra *acima* do ideal — contradiz o
  nome do campo. (Estava errado até a fase 6; como `perda_pct` nasce zero em
  todos, a correção não mudou nenhum número.)
- **Venda sem ficha calculável é um buraco na lista de compras, não um zero.**
  Ela sai em `pendencias`, com o motivo, porque o total sem ela está incompleto
  e o comprador precisa saber disso. Mesma regra 4 do custo.
- **Acessório não tem medida e isso não é pendência.** `modelo.exige_medida = 0`
  dispensa largura/altura; a fórmula que precisar delas reclama sozinha, uma
  linha por vez. Antes da fase 6 o bloqueio era do SKU inteiro, e por isso todo
  acessório ficava sem ficha e sem custo para sempre.
- **Enquanto a mão de obra for zero, o número se chama "custo de material"** —
  nunca "custo do produto".

### Dívidas abertas nesta entrega

| Dívida | Detalhe |
|---|---|
| `componente` é **provisória** | O dono é `PRODUCAO-MONTAGEM.md` §6, não implementado. O que faltar entra por `ALTER`, nunca recriando |
| Não segue a forma do `ARQUITETURA-ALVO.md` | O `COMPRAS.md` §11 manda `dominio/ dados/ rotas/`. Foi construído no padrão atual do projeto — o documento não estava no repositório (hoje está em `docs/specs/ARQUITETURA-ALVO.md`) |
| Fórmula do tecido | ~~As oito medidas da planilha fecham em 6 de 8~~ — a fórmula passou a usar `largura_bobina` em 04/09/2026 (armadilha #19). O que sobra: **quando** o corte é encaixado e quando é sozinho ainda é decisão de quem produz, e a ficha guarda uma das duas |
| Medida de corte sem valor lançado | A `ficha_formula` já tem `corte_largura`/`corte_altura` (armadilha #18), mas as folgas reais — tubo, base redonda, tecido — ainda não foram preenchidas. Enquanto forem vazias a coluna "corta a" mostra traço, que é resposta e não erro |
| Mínimos são placeholder | Foram semeados com um valor padrão ("depois eu edito"). Enquanto forem, o gatilho 1 vence quase sempre e a demanda quase não aparece na lista — não é bug da fase 6, é dado a revisar |
| Modelo ACESSORIO sem ficha | Os dois kits têm venda e nenhuma linha de ficha. Ou lançam ficha, ou viram `tem_ficha=0` (revenda) com custo direto |

---

## 8. Horário de corte e despacho

Configuráveis **por dia da semana** (`config`, chaves `corte_seg`, `despacho_seg`, etc.),
porque o Mercado Livre altera o corte sem aviso — já houve quarta-feira com corte
ao meio-dia em vez de 10:30.

| Padrão | Significado |
|---|---|
| Corte 10:30 | Vendas até esse horário são entregues no mesmo dia |
| Despacho 15:00 | Limite para levar os volumes à agência |

> ⚠️ **ARMADILHA #7 — nem todo volume de um lote sai no mesmo dia, e a etiqueta
> diz qual é qual.** Cada etiqueta traz `Despachar: qua 26/ago, antes das 15:00 h`.
> No PDF de 25/08 as **14 etiquetas tinham cinco datas diferentes** — só 6 para
> o dia seguinte, as outras 8 espalhadas por três semanas.
>
> Enquanto o `parse.js` ignorava essa linha, todo volume entrava como se fosse
> de hoje e a fila "Faltam imprimir" cobrava etiqueta de venda que só vencia
> semanas depois. Mesma doença dos volumes fantasmas por outra porta: fila que
> mostra o que não é pra agora é fila que a equipe aprende a ignorar.
>
> `fila_dia.js` é o **dono único** da pergunta "isto é trabalho de hoje?", e por
> um motivo prático: a tela faz essa pergunta duas vezes por caminhos
> diferentes — a lista de pendentes e o bipe do SKU (`/api/proximo/:sku`). Com
> réguas diferentes, a lista cobraria um volume que o leitor não acha.
>
> Entram na fila: o que vence hoje, **o que já venceu** (atraso tem que gritar,
> não sumir) e **o que não tem data lida** (volume invisível é pior que volume
> cedo demais). O que vence depois aparece no painel "Pra despachar depois", que
> existe para o planejamento enxergar sem poluir o dia. O filtro por `data` (dia
> da importação) saiu: volume que entrou ontem e vence hoje é trabalho de hoje.

> **Venda futura é trabalho adiantável, não arquivo morto.** O bipe do SKU
> (`/api/proximo/:sku`) **não** filtra por prazo — quem decide é a ordem
> (`ORDEM_URGENCIA`): sem data e vencido primeiro, depois hoje, e só então o
> futuro. Assim o operador nunca adianta uma venda de setembro enquanto existe
> uma atrasada do mesmo SKU esperando, e, esgotadas as do dia, o bipe segue
> trabalhando em vez de dizer que não há nada.
>
> O que impede adiantar o que não pode é a **trava de estoque que já existia**:
> sem peça na prateleira, nada é impresso. É exatamente a regra do dono — *"só
> se tiver estoque disponível"* — sem precisar de trava nova.
>
> Quando o volume escolhido é futuro, a resposta traz `adiantado:true` e a tela
> abre um aviso azul com a data por extenso. Ele é obrigatório: uma venda de
> setembro que passe por urgente faz o operador gastar peça que amanhã pode
> faltar para quem tem prazo curto.
>
> **O ano não vem na linha** e é inferido dos dois lados da virada: `05/jan`
> lido em dezembro é do ano seguinte, `20/dez` lido em janeiro é do ano anterior.
> A janela é assimétrica (−60 / +180 dias) porque atraso de despacho é curto e
> envio programado legítimo chega a semanas.

A tela de revisão mostra o corte no aviso de status. A tela de Etiqueta de Venda
mostra contagem regressiva para o despacho, ficando **amarela** abaixo de 2 h e
**vermelha** abaixo de 1 h quando ainda há volumes pendentes.

---

## 8-B. Coleta — o caminhão do Mercado Livre vem buscar (desde 10/09/2026)

> **As regras desta seção estão em [`docs/regras/carregamento.md`](docs/regras/carregamento.md)**
> (cartões R-MOD, R-COL, R-QUEM, R-PIL, R-SEG, R-PEC, R-REC, R-SAI, R-VIA,
> R-ADI e R-PAS), cada uma com o teste que a trava. O porquê longo — a
> armadilha **#21**, as quatro fases da spec `SAIDA-E-DUPLA-CONFERENCIA`, as
> duas da `CARREGAMENTO-SEGUNDA-PESSOA`, a recusa do motorista, o adiantado e os
> dois passivos — está em [`docs/historia/carregamento.md`](docs/historia/carregamento.md).

> ⚠️ **A TELA SE CHAMA "CONFERÊNCIA" DESDE 22/10/2026** (fase 1 da spec
> `CONFERENCIA-E-BAIXA`): rodapé, título (*Conferência da etiqueta de venda*),
> app do iPad, rótulo da área e da permissão, e os textos que nomeiam a tela.
> **A URL `/carregamento`, o arquivo `carregamento.html`, o `carreg_route.js` e a
> chave `carregamento.executar` NÃO mudaram**: a URL é o que os tablets salvaram
> na Tela de Início, e trocar a chave tiraria a permissão de quem a tem, em
> silêncio (#13). Também ficam o verbo da ação física (*"não carregar"*,
> *"faltam carregar no carro"*, o estágio `carregado`) e a frase da auditoria
> (*"bipado no carregamento"*): as linhas antigas já estão gravadas com ela, e
> mudar só as novas partiria o histórico em dois. Nesta seção e nos cartões,
> "Carregamento" ainda é a mesma tela.

| | **Agência** | **Coleta** |
|---|---|---|
| Quem leva | a gente, no carro, até a agência | o caminhão do ML, na fábrica |
| Onde a caixa espera | na área, e depois no carro | no **canto** reservado |
| Prazo | hora de despacho do `config` | só o dia — o caminhão não tem hora |
| `lote.modalidade` | `'agencia'` (ou `NULL`) | `'coleta'` |

| Cartão | Regra em uma linha |
|---|---|
| R-MOD-01 | A modalidade se lê pela linha "Despachar", contra dois formatos exatos; o resto retém (#21) |
| R-MOD-02 | Formato desconhecido vai para Bloqueados, e uma pessoa decide |
| R-MOD-03 | `carga.js` é o dono único de "isto é coleta?", e sem dado é agência |
| R-MOD-04 | `saiu_por` não reescreve `modalidade`, nem o contrário |
| R-COL-01 | "Faltam imprimir" são duas listas, e o filtro decide o que o bipe pega |
| R-COL-02 | O relógio de despacho é só da agência |
| R-COL-03 | A caixa de coleta não entra no carro, nem na lista nem no contador |
| R-COL-04 | O caminhão leva antes da data, e o canto cheio de caixa futura é normal |
| R-QUEM-01 | `impresso_por` é a PRIMEIRA impressão, e a reimpressão não o toca |
| R-QUEM-02 | O bipe do Carregamento grava quem conferiu |
| R-PIL-01 | A pilha fecha caixa a caixa: impressas = conferidas + faltam |
| R-PIL-02 | A impressa ontem e não conferida não some, e não entra na conta de hoje |
| R-PIL-03 | A adiantada entra na pilha, marcada; pendente e bloqueado não |
| R-PIL-04 | "Sem registro", "mesma pessoa" e "sem conferência" são três coisas |
| R-PIL-05 | As listas da pilha nascem recolhidas |
| R-SEG-01 | Quem imprimiu não confere (área e canto) |
| R-SEG-02 | Não há liberação, nem para o Admin Geral |
| R-SEG-03 | O nome de quem imprimiu aparece, em linha própria |
| R-PEC-01 | A caixa de várias se confere peça a peça, contando persiana |
| R-PEC-02 | A lista do que vai na caixa APARECE (desde 05/10/2026) |
| R-PEC-03 | O bipe de peça tem as mesmas barreiras do bipe da caixa |
| R-PEC-04 | Guard de 700 ms; a divergência não apaga o que foi bipado |
| R-PEC-05 | As etiquetas coladas por fora são as do saco de cada persiana |
| R-REC-01 | A caixa que sobrou volta pelo ↩ Sobrou: etiqueta + SKU de cada persiana; +1 por peça se já baixou |
| R-REC-02 | Só a caixa com etiqueta e ainda na fábrica, e uma vez só |
| R-REC-03 | A de várias volta inteira; com um item cancelado não é sobra; sob medida não mexe em saldo |
| R-REC-04 | Quem conferiu a caixa não marca a sobra dela (D8) |
| R-REC-05 | A lista "Sobras esperando decisão" zera |
| R-SAI-01 | Uma saída por caminhão, e ela só olha o que saiu nela |
| R-SAI-02 | As sobras são declaradas, nunca supostas |
| R-SAI-03 | A conta do caminhão só olha o canto da coleta |
| R-SAI-04 | O bipe da saída só diz SOBROU; a troca de porta é por botão |
| R-SAI-05 | Quem fechou a saída não conferiu a caixa |
| R-SAI-06 | Sem a foto não fecha; com divergência, só com `saida.liberar` e motivo |
| R-SAI-07 | A caixa de agência que o caminhão levou não conta no "No carro" |
| R-SAI-08 | O "Fechar coleta" antigo está aposentado |
| R-VIA-01 | A agência tem dois bipes: a área confere, a viagem põe no carro |
| R-VIA-02 | A viagem fecha com foto e número, como o caminhão |
| R-VIA-03 | A caixa de coleta pode ir pelo carro, e sai do canto |
| R-VIA-04 | Tirar do carro desfaz o bipe; cancelar com caixa no carro é recusado |
| R-VIA-05 | A foto da viagem vem da galeria, e fecha de qualquer aparelho |
| R-VIA-06 | O "No carro" do topo e a viagem dizem o mesmo número |
| R-ADI-01 | Adiantado é o que sai antes do despacho, em PEÇAS; na coleta conta o caminhão |
| R-PAS-01 | O passivo da coleta bipada sai na data do bipe de cada caixa |
| R-PAS-02 | O passivo das nunca bipadas exige data de corte de quem viu sair |

**Ao mexer em** `parse.js` (modalidade): `node teste_parse.js` (caso 15). Na
decisão de Bloqueados: `node teste_divergencia.js`. Na Etiqueta de Venda (as
duas listas, o filtro): `node teste_etiqueta.js`. No `carreg_route.js` ou no
`carga.js`: `node teste_carga.js`, `node teste_area.js`, `node
teste_segunda_pessoa.js` e `node teste_pecas_carga.js`. No `saida_route.js`:
`node teste_saida_coleta.js` e `node teste_saida_agencia.js`. Na recusa do
motorista ou no ↩ Sobrou: `node teste_sobra.js`. No `POST /api/embalar`, no
`POST /api/reimprimir` ou no `fechar_saida_passivo.js`: `node teste_saida.js`.
Em `saida.liberar` ou outra chave: `node teste_acesso.js` e `node
teste_cobertura.js`. E **abra a tela**, a 1440 e a 400 px: a pilha, a tela
âmbar da caixa de várias e as duas saídas são texto montado.

Ferramentas: `node backfill_modalidade.js` (volume antigo sem modalidade) e
`node fechar_saida_passivo.js [--nao-bipadas] --ate AAAA-MM-DD` — a data de corte é
obrigatória nos dois modos desde 22/10/2026 (R-PAS-01), e os dois
simulam sem `--aplicar`.

---

## 9. Devoluções

Fluxo em duas etapas, com responsabilidades separadas:

**Etapa 1 — Revisão (`/devolucao`):** quem recebe a peça bipa o código da etiqueta
do ML, escolhe cor + medida (dois toques, montando o SKU), e preenche a triagem
física: embalagem, tecido, tubo, base, comando, kit, destinação.

**Etapa 2 — Admin (aba Devoluções):** quem olha o Mercado Livre responde se
afetou a reputação e qual o motivo comercial. Só então dá baixa.

**O operador informa o SKU que está vendo fisicamente.** O sistema busca a venda
original pelo código e mostra o SKU enviado — mas **não preenche** o campo. Se os
dois divergirem, o admin recebe alerta de **DIVERGÊNCIA**, que é a evidência de
envio errado.

Se a venda original não existir no sistema (devoluções antigas), tudo funciona
normalmente — o vínculo é bônus, não requisito.

**Destinação `reembalar`** insere na `fila` com `modo='devolucao'`: a peça segue o
fluxo normal de embalagem, com kit e cronômetro, e vira estoque como qualquer outra.
Registrar a devolução **não** mexe no saldo: o `+1` é da embalagem.

**Rode `node teste_devolucao.js` (33 casos) ao mexer no `dev_route.js`.** Ele trava o
SKU físico cadastrado, o `sku_venda` gravado ao lado (nunca no lugar), a fila só no
`reembalar` e a baixa. ⚠️ **Anotado, não consertado:** a baixa com um `id` que não
existe responde `ok` sem gravar nada.

---

## 10. Autenticação e permissões

`auth.js` implementa: PIN de **6 dígitos** (desde 21/10/2026) com hash `scrypt` + salt individual, cookie
de sessão assinado com HMAC-SHA256, permissões por **área** (não por cargo fixo).

Fluxo de login desenhado para tablet: grade de nomes → teclado numérico → entra.

### ⚠️ O PIN TEM 6 DÍGITOS, E QUEM TEM 4 TROCA NO PRÓXIMO USO (21/10/2026)

Fase 5-A da spec `ACESSOS-UNIFICADOS`, antes de o time inteiro (~20 logins) ser
cadastrado. Pessoa nova e PIN trocado no `/acessos` só com **6 números**
(`POST /api/usuarios` recusa com 400 dizendo isso); quem ainda entra com 4 cria o
de 6 pela própria tela de login (`POST /api/auth/trocar-pin`).

> ⚠️ **A TROCA É COBRADA NO USO, E NÃO SÓ NO LOGIN.** A sessão dura **1 ano**, e
> os tablets da bancada quase nunca passam pela tela de PIN: "troca no próximo
> login" deixaria a bancada um ano com o PIN curto. Enquanto `usuarios.pin_curto`
> for 1, a sessão — **inclusive a que já estava aberta** — só alcança o login e a
> troca: tela vai para `/login?trocar=1&r=<a tela>`, API responde 403
> `trocar_pin`, e isso vale no `/sobmedida` também (a checagem fica **antes** do
> desvio do sob medida no `auth.js`). Depois da troca a pessoa volta à tela onde
> estava, e a mesma sessão segue valendo.

> ⚠️ **`pin_curto` É COLUNA PORQUE O HASH NÃO DIZ O TAMANHO DO PIN.** Quem já
> estava no banco nasce com 1, porque até 21/10/2026 todo PIN era de 4. Ela só
> vira 0 quando um PIN de 6 é gravado — pela troca ou pelo `/acessos`. O
> Administrador / 1234 de instalação nova nasce com 1 e cai na troca.

> ⚠️ **A TROCA PEDE O PIN DE HOJE**, e o PIN de hoje errado conta na **mesma
> trava** do login (5 erros, 1 minuto). Sem isso, qualquer pessoa que passasse
> por um tablet logado trocaria o PIN de quem está na sessão, e a rota viraria a
> porta para chutar PIN.

> ⚠️ **A TELA DE LOGIN NÃO SABE O TAMANHO DO PIN DE CADA PESSOA.** Quem tem 6
> entra sozinho no sexto dígito; quem ainda tem 4 toca **OK**. Contar à tela o
> tamanho do PIN de cada nome seria dizer a quem chuta quem ainda tem 4.

> ⚠️ **PIN fora do formato no `/acessos` é RECUSADO, e não ignorado.** Até aqui
> um PIN de 3 dígitos na edição de uma pessoa era descartado em silêncio e a tela
> dizia "salvo" — a pessoa saía achando que o PIN tinha mudado.

### ⚠️ ARMADILHA #28 — a tela de Acessos era o caminho mais curto para o acesso total

Fechado em 17/09/2026 (era a dívida 17 do §14). Quatro portas, todas na tela
oficial, todas deixando **rastro de ação legítima** na auditoria — porque elas
*eram* legítimas. Quem auditasse depois veria um Admin fazendo o trabalho dele.

| Porta | O que era | O que é |
|---|---|---|
| **A exceção do indelegável** | `permissoes.js` marca três chaves como `intransferivel` — `pessoas.gerenciar`, `setores.gerenciar`, `auditoria.ver`. O rótulo **nunca foi consultado em nenhum caminho de escrita**, e a tela desenhava a caixinha sem `disabled`: um Admin concedia a si mesmo o poder de mandar nos acessos | `POST .../excecao` recusa **conceder** uma intransferível. **Revogar continua livre** — tirar não escala ninguém, e recusar o caso seguro é a armadilha #6 |
| **O setor novo de nível máximo** | A guarda do `acesso.js` cobria só o setor que **já existe**. Criar um setor **novo** com nível `admin_geral` passava — e esse nível significa TODAS as permissões. Criava "Coordenação", punha-se dentro, saía com tudo | Criar setor de nível `admin_geral` é recusado; para dar acesso total, põe-se a pessoa no setor Admin Geral que já existe |
| **Trancar-se do lado de fora** | O `auth.js` não deixa bloquear nem excluir o último Admin Geral, mas a tela de Acessos tirava dele o **setor** — mesmo resultado, e a recuperação é SQL direto no banco | A trava passou a valer nos dois lugares, e a conta **é a mesma**: `ehUltimoAdminGeral` mora no `acesso.js`, ao lado de "quem é Admin Geral", e o `auth.js` chama ela |
| **A porta A: a sombra promovendo** | Ver abaixo — é a mais difícil de enxergar das quatro | A migração de `areas` virou evento de uma vez só |

> ⚠️ **A PORTA A É A ARMADILHA #13 (§19) COBRANDO O JURO.** `usuarios.areas`
> deixou de ser **entrada** e virou **sombra**: quem escreve nela é o
> `sincronizarAreas`, a partir das permissões efetivas. Só que o
> `migrarPendentes` continuou lendo `areas` como se fosse entrada — e o
> `areasParaSetores` traduz `'admin'` para o setor **Admin Geral**.
>
> A cadeia inteira, sem ninguém pedir nada: um Admin concede a alguém **sem
> setor** uma exceção qualquer de nível admin (*ver custo*, por exemplo) → o
> `sincronizarAreas` grava `areas='admin'` → na próxima vez que a ficha da
> pessoa é aberta, o `migrarPendentes` roda, vê a sombra e a põe no **Admin
> Geral**. Quem só devia ver custo sai podendo gerenciar acessos. Foi conferido
> desligando a guarda: a pessoa termina com `pessoas.gerenciar`.
>
> **A migração é um evento da Fase 1, não uma rotina.** Ela agora roda enquanto
> `config.migracao_areas_fase1` não existe e se marca depois — o primeiro boot
> com este código ainda migra quem estava pendente, e do segundo em diante
> `areas` não decide setor nenhum. Pessoa nova não depende disso: a tela de
> Acessos cria com `{nome, pin}`, sem `areas`, e quem dá os setores é o Admin.
>
> **O `acesso.js` passou a criar o `config` também**, e não é redundância: ele
> *grava* ali (o seed do `pacote.assinar`, o modo de acesso e essa marca), mas
> quem cria a tabela é o `mont_route`, que no `server.js` roda antes. Carregado
> sozinho — um script, um teste, uma ordem de `require` diferente amanhã — o
> `CREATE` não aconteceu e os `try/catch` engolem tudo em silêncio: o seed
> "roda", não grava nada, e ninguém fica sabendo. É a mesma família do §17.

### ⚠️ ARMADILHA #29 — ROTA SEM PERMISSÃO NASCE NEGADA (e o que quase veio junto)

Fechado em 17/09/2026 (era a dívida 16, e fecha a **12(c)** do §14 junto). O
`permDaRota()` terminava em `return '@logado'`: **rota nova nascia aberta** a
qualquer pessoa logada, sem erro, sem log e sem aparecer em lugar nenhum.

E a cobertura não acusava, porque era uma **lista escrita à mão**
(`TODAS_ROTAS`) com 49 linhas para **151 rotas reais** — e o contador ainda
descartava tudo que começasse com `/api/`. O boot imprimia *"cobertura de telas
OK (0 sem declarar)"*. **Verde que ninguém conferiu é pior que vermelho:** ele
afirma com autoridade uma coisa que não foi olhada. Hoje a varredura sai do
próprio Express (`coberturaDeRotas()`), então rota nova entra na conta no mesmo
minuto em que é escrita, e o boot **grita o nome dela**.

> ⚠️ **O QUE QUASE DERRUBOU A FÁBRICA INTEIRA: o arquivo da tela também passa
> pelo `decidir`.** Com sessão aberta, `/sku.js`, `/base.css` e as imagens são
> julgados como qualquer caminho — a lista `LIVRE` do `auth.js` tem só
> `/login`, `/login.html`, `/nav.js` e `/favicon.ico`. Negar por padrão sem uma
> regra para eles tiraria o **JavaScript de todas as telas**: elas abririam em
> branco, com 403 no console, para todo mundo menos o Admin Geral — e "tela em
> branco" não se parece nem de longe com "mexeram na permissão". Por isso
> existe a linha das extensões (`.js`, `.css`, imagens, fontes → `@logado`), e
> por isso **`.html` fica de fora dela**: `.html` é tela.

> ⚠️ **O DONO DE UMA LEITURA É UMA LISTA, e isso não é frouxidão.** Uma chave só
> não descreve quem lê: `/api/lote` é lido pela Etiqueta de Venda, pela tela de
> Lançar produção **e** pelo admin. Pior: as chaves de operação são de nível
> `operacao` e o setor **Admin** só recebe as de nível `admin` — declarar a
> leitura pela chave da tela **tiraria do próprio Admin** a leitura da tela
> dele. Passa quem tem **qualquer uma** das chaves da lista.

> ⚠️ **A GÊMEA `.html` HERDA A TELA, em vez de ser listada.** `/operador` exigia
> `revisao.executar` e `/operador.html` — o mesmo arquivo, servido pelo
> `express.static` — exigia só estar logado. Ninguém navega por ela (o rodapé
> usa a rota sem extensão), então fechar não tira nada de ninguém; e herdar faz
> a tela nova de amanhã já nascer com a gêmea coberta.

> ⚠️ **O ADMIN GERAL PASSA ANTES DA CHAVE, e isso ficou mais importante.** Uma
> declaração esquecida agora **nega**; se ela negasse o dono também, uma linha
> faltando trancaria quem tem que consertar. Ele passa por nível e é quem lê o
> aviso do boot.

> ⚠️ **`/sobmedida` FICA FORA DA VARREDURA, por desenho.** Aquele módulo tem
> portão próprio (`tecido/montar.js`) e o `auth.js` passa por ele **antes** do
> `decidir` — um dono só por caminho (§19). Acusá-lo aqui seria ruído
> permanente, e ruído permanente é o que faz a lista deixar de ser lida.

> ⚠️ **O `setImmediate` DO AVISO NÃO É ENFEITE.** O `acesso.js` é carregado no
> meio do `server.js`: na hora em que ele roda, o `teste_route` e o
> `/sobmedida` ainda não registraram nada. Varrer ali contaria meio sistema e
> diria "tudo declarado" sobre o que ainda não existe — o mesmo verde sem
> conferência da lista manual.

**O que mudou para quem usa:** nada para quem já tinha a permissão da tela. As
28 leituras que eram abertas a qualquer pessoa logada ganharam dono — quem
opera a tela **ou** o admin. A mais sensível delas era a **foto da coleta**
(§8-B), que é prova e estava legível por qualquer sessão.

**Rode `node teste_acesso.js` e `node teste_cobertura.js` ao mexer em
`acesso.js`, `permissoes.js`, `auth.js` ou ao criar QUALQUER rota nova** — os
104 + 10 casos cobrem as três pontas de uma permissão nova (§19, armadilha
#13), as quatro portas da #28, e travam que **nenhuma das 170 rotas registradas
hoje nasce negada**. O `teste_cobertura.js` sobe os módulos de verdade e varre
o `server.js` por texto, porque as rotas dele não são carregáveis — foi assim
que `GET /api/producao` apareceu, no boot, depois de o outro teste dizer zero.

### ⚠️ ARMADILHA #3 — a ordem no `server.js` é arquitetura, não estilo

```js
app.use(express.json({limit:'25mb'}));
require('./auth')(app, db);                              // ← ANTES
app.use(express.static(path.join(__dirname, 'public'))); // ← DEPOIS
```

Invertendo essa ordem, o Express entrega os arquivos direto do disco e **qualquer
pessoa acessa `/index.html` sem senha**. As rotas `.html` estão explicitamente na
lista protegida em `auth.js` justamente por isso.

**Teste obrigatório após qualquer mudança em `auth.js` ou `server.js`:**

```bash
for r in / /admin /index.html /painel /operador /api/skus; do
  printf "%-14s " "$r"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010$r
done
curl -s -o /dev/null -w "/login  %{http_code}\n" http://localhost:3010/login
```

Esperado: telas `302`, API `401`, `/login` `200`.
**Qualquer `200` numa tela é furo de segurança.**

Proteção contra força bruta: 5 PINs errados bloqueiam a pessoa por 1 minuto —
**inclusive com o PIN certo**, senão a trava só atrasaria quem chuta —, e a trava é
por pessoa. **Rode `node teste_login.js` (74 casos) ao mexer no `auth.js` ou no `login.html`**: ele
trava o PIN guardado como scrypt com salt próprio, o bloqueio e o minuto (o
relógio do teste é trocado), o cookie assinado (trocar o id dentro dele não vira
outra pessoa), a sessão que cai quando a pessoa é bloqueada no cadastro e a
troca do PIN de 4 (sessão aberta barrada, inclusive no sob medida; PIN de hoje
exigido e contado na trava; cadastro só com 6; banco antigo ganhando a coluna). Se o
`.session_secret` não existia, o teste o apaga no fim.

---

## 11. Modo teste

Marca tudo que acontece enquanto ligado, fotografa o estoque na ativação, e ao
encerrar permite **apagar** (restaurando o estoque à foto) ou **manter** (promovendo
a produção real). Tarja amarela aparece em todas as telas via `nav.js`.

> **Por que a foto do estoque:** estoque é número corrido, não lista de linhas.
> Apagar as revisões de teste não desfaria o `+1` que cada uma somou.

**São duas fotos, não uma.** `skus.estoque`/`alvo` e, desde a contagem de
material, `componente.estoque`/`custo_medio`. Apagar as linhas de
`movimento_componente` não desfaz o saldo pela mesma razão de sempre — quem
guarda o saldo é a coluna, o movimento é só a história dela.

**Cobertura atual:** `revisao`, `producao`, `montagem`, `lote`,
`lote_item`, `fila`, `devolucao`, `rejeicao`, `contagem`, `contagem_pendente` e
`movimento_componente` — e depois `movimento_estoque` (fase 1 do livro) e
`inventario_ciclo`/`inventario_item` (fase 2, 26/09/2026), `ajuste_pedido` (fase 3,
28/09/2026) e `correcao` (Mesa de correções fase 1, 02/10/2026).
(`foto_estoque` saiu na Fase 3.)

A lista fica em `TABELAS`, no topo do `teste_route.js`. Cada entrada traz a coluna
de chave primária — hoje todas usam `id`. O campo ficou genérico por causa da
`foto_estoque` (PK = `data`), removida na Fase 3. Ao acrescentar uma tabela, basta
incluí-la nessa lista: trigger, contagem, limpeza e "manter" saem dali.

> ⚠️ **`teste_route` tem que ser o ÚLTIMO `require` do `server.js`.** Ele cria
> triggers em cima de tabelas de outros módulos (`fila`, `devolucao`, `rejeicao`
> e `contagem`). Subindo antes, num banco novo essas tabelas ainda
> não existem, o `try/catch` engole o erro e o modo teste volta a sujar dado real
> **sem avisar**.

**Se um trigger falhar**, a tabela entra em `naoCobertas` no `GET /api/teste` e a
aba Modo teste mostra um alerta âmbar. Falha de cobertura é visível, não silenciosa.

> ⚠️ **O MODO TESTE SÓ MARCA O QUE NASCE, E POR ISSO NÃO MEXE EM CAIXA DE
> VERDADE (22/10/2026).** O trigger é de `INSERT`: o que se **faz** numa caixa
> que já existia não ganha `teste=1`. Conferir em modo teste uma caixa de
> verdade a deixava baixada, e o "apagar tudo" devolvia o saldo pela foto — a
> caixa ficava marcada como baixada e nunca mais baixava: **estoque 1 acima,
> para sempre**. Com o modo ligado, as quatro portas que mexem em estoque —
> imprimir (`/api/embalar`, e o bipe do SKU só acha venda de teste), conferir
> (área, canto, peça a peça), o ↩ Sobrou e o "foi no caminhão" — só aceitam
> caixa de teste (`baixa_dominio.travaTeste`), e a tela diz *"Modo teste
> ligado: esta caixa é de verdade"*. É a regra da embalagem, que em modo teste
> só consome fila de teste (R-EMB-06). `node teste_modo_teste_caixa.js` (18).

---

## 12. Armadilhas técnicas do ambiente

| Armadilha | O que acontece | Como evitar |
|---|---|---|
| **`node --check` obrigatório** | Um `}` sobrando derruba o `<script>` inteiro; a tela abre e nada funciona, sem erro visível | Rodar após toda edição de `.js` e do bloco `<script>` de `.html` |
| **Código colado por cima do velho** | Linhas duplicadas sobram embaixo e quebram a sintaxe | Conferir o entorno do trecho editado |
| **`var` lido antes de ser atribuído** | `node --check` passa (é sintaxe válida); no navegador o `.filter` de um `undefined` estoura **no meio** da execução do `<script>` e **tudo abaixo dele deixa de existir** — a tela abre sem as listas, sem bipe e sem erro visível. Aconteceu em 23/09/2026: o `setModo` roda no carregamento e chamava um desenhista cujo cache só é atribuído 150 linhas abaixo | Função chamada no carregamento não pode supor que o cache já existe: `(cache\|\|[])`. E **abrir a tela** — nenhum teste do projeto pega isto |
| **Coluna `fr` não desce abaixo do conteúdo** | `grid-template-columns:1.1fr 1.6fr` é uma proporção que o navegador **ignora** quando uma coluna tem conteúdo largo: `fr` tem mínimo automático de `min-content`. Uma única linha `white-space:nowrap` lá dentro vira o piso da coluna inteira, e a proporção escrita no CSS nunca chega a valer — sem erro, sem aviso, e ninguém lê CSS procurando isso. Em 23/09/2026 a Etiqueta de Venda estava com 972 px de um lado e 362 do outro, com `1.1fr 1.6fr` no arquivo | `minmax(0,1fr)` quando a proporção **tem** que valer. E **medir a tela** (`getBoundingClientRect`), não ler o CSS: o número medido é o único que diz se a regra pegou |
| **Tabela mais larga que a janela rola a PÁGINA** | `table{width:100%}` não impede nada: mais largo que o corpo, ele empurra a página inteira, e num celular a tela anda de lado com o topo do card saindo de vista. É a coluna `fr` acima por outra porta — a proporção escrita no CSS não vale quando o conteúdo é maior. Medidas a 400 px: boletos 684, catálogo 810, painel 1050, produção 820, corte 660. Das dezesseis telas do sob medida, **sete** rolavam (§19) | Embrulhar com o `window.ui.rolaH(tabela)`, que devolve o recipiente (`.rolaH` do `base.css`, nunca classe da própria tela) **com a tabela já dentro** — o padrão de dois passos nasceu oco uma vez e passou verde. E **medir** `scrollWidth` contra `clientWidth`, não ler o CSS. ⚠️ Nem toda página que rola tem tabela: um `inline-flex` sem `wrap` faz igual (§19) |
| **`text-overflow:ellipsis` corta a tarja, não só o texto** | Ele apara o **fim da linha**, e o fim da linha é onde ficam as tarjas. Um nome de cliente comprido apagava da tela o `📦 N persianas` — o último lugar em que a caixa de várias aparece (§5). A tela fica bonita e a informação some | Onde a linha tem tarja, o texto **quebra** em vez de aparar; nowrap fica só dentro de cada tarja |
| **Cookie httpOnly no jar do `curl`** | Abrir a tela com Playwright usando `-c jar.txt` do `curl`: o jar marca o cookie de sessão com `#HttpOnly_` no início da linha, e um filtro de comentário ingênuo (`l.startsWith('#')`) o joga fora. A tela abre no **login** — e "abriu no login" não se parece nem de longe com "o cookie não foi lido": parece permissão trocada | Tirar o prefixo antes de filtrar (`l.replace(/^#HttpOnly_/,'')`) |
| **A tela servida é a lida no BOOT** | Editar o `.html` de uma tela do `/sobmedida` e recarregar o navegador não mostra nada: o módulo lê o arquivo quando sobe e o guarda. O sintoma engana — o CSS novo está no arquivo, o `grep` confirma, e a tela continua com o antigo, então a suspeita cai na especificidade ou no cache do navegador. Custou três rodadas em 26/09/2026 | Reiniciar o servidor. E conferir pelo fio, não pelo disco: `curl … \| grep a-regra-nova` diz o que a tela está mesmo recebendo |
| **WAL do SQLite** | `dados.db` tem ~4 KB; os dados estão em `dados.db-wal`. `cp dados.db` produz backup **vazio** — e vale igual para o `tecido.db` | Usar `node backup.js`, que chama `db.backup()` **nos dois bancos** (§13) |
| **`pm2 restart` cacheia** | A alteração não aparece | `pm2 delete expedicao && pm2 start server.js --name expedicao` |
| **`!` no bash** | Expansão de histórico quebra heredocs e `sed` | `set +H` antes de blocos com `!` |
| **`express.json()` 100 kb** | Bloqueia upload de PDF | Já elevado para 25 mb — não reduzir |
| **pdf.js quebra números** | Pack IDs vêm com espaços no meio | Regex que rejunta dígitos (já em `parse.js`) |
| **Campo invisível no iPad** | Leitor bipa e nada acontece — iOS tira o foco de campos fora da tela | Campos de bipe devem ser **visíveis**, com `autocorrect="off"` |
| **Leitor no modo "Alt + teclado numérico" troca de tela** | Em PC com teclado ABNT2 o leitor costuma mandar cada caractere pelo código do Windows: Alt segurado + dígitos do teclado **numérico** (o "5" chega como Alt+5-3). O `nav.js` aceitava qualquer dígito com Alt, e o primeiro dígito do código virava atalho: bipar jogava a pessoa na Etiqueta de Venda, no Carregamento, no Admin ou no "Sair do sistema?" (20/10/2026) | Atalho só pelo número da **fileira de cima** (`code` = `Digit1`…); teclado numérico com Alt nunca é atalho — `digitoDoAtalho()` no `nav.js`, travado pelo `teste_atalho.js`. ⚠️ O Playwright aperta o teclado numérico com NumLock **desligado** (`key` = "Clear"), e por isso não reproduz o defeito: para ver no navegador de verdade, mande a tecla pelo CDP com `key` = "5" e `code` = "Numpad5" |
| **Redesenho periódico apaga o campo que mora dentro do card** | A tela que se atualiza sozinha (o Carregamento, a cada 4 s) troca o `innerHTML` do card, e o campo de dentro nasce de novo, **vazio**. O motivo do "Liberar com divergência" sumia no meio da frase e, no iPad, o teclado fechava. Corrigido em 20/10/2026 | Quem redesenha guarda o digitado e devolve com o foco (`digitado`/`devolverDigitado` no `carregamento.html`), e a atualização **espera** enquanto a pessoa digita (`digitando()`) — o campo do bipe não conta, ele tem o foco o tempo todo. Campo novo dentro de card redesenhado entra nas duas listas. Travado pelo `teste_carregamento_tela.js` |
| **`fetch` que falha some calado** | Sem rede, ou com o servidor devolvendo página de erro, o `await fetch(...).json()` lança e a promessa morre sem ninguém ver: nada na tela, nenhum som. No Carregamento a pessoa concluía que o leitor tinha falhado (20/10/2026) | O bipe passa por um `.catch` que **avisa** (`semConexao()`). A frase não promete que nada foi gravado — a resposta pode se perder depois da gravação —: manda bipar de novo, e na caixa de várias recomeçar a caixa |
| **Leitor manda Tab ou espaço** | Código chega picado ou o Enter cai no vazio | Aceitar Enter **e** Tab; limpar com `replace(/[^A-Za-z0-9]/g,'')`; processar por timeout após a última tecla |
| **`DELETE` em tabela que se auto-referencia** | Com `foreign_keys = ON`, `DELETE FROM t` (todas) **passa** — o FK imediato é conferido no **fim da instrução** —, mas `DELETE ... WHERE id=1` com a filha de pé é **recusado**. Um `DELETE` filtrado que hoje casa com tudo passa por sorte, e quebra no dia em que o filtro deixar alguém | Soltar o ponteiro antes, e **só de quem aponta para linha que vai sair** — limpar o ponteiro de quem fica apaga o vínculo em silêncio (`tecido/limpar_sobras.js`, §19) |

> ✅ **AS LINHAS DO LEITOR NO MODO ALT, DO REDESENHO E DO `fetch` CALADO ESTÃO
> NO AR E CONFERIDAS NA FÁBRICA EM 20/10/2026**
> (PRs #196 e #197): o dono fez o deploy e conferiu que o bipe no computador
> não muda mais de tela, que o motivo do "Liberar com divergência" fica no
> campo e que o "SEM CONEXÃO" aparece quando o bipe não chega.

### ⚠️ A ESTAÇÃO VIRA APP NO iPad — camada 2 da spec `TABLETS-E-KIOSK` (02/10/2026)

As seis estações de tablet (`/operador`, `/montagem`, `/embalagem`,
`/carregamento`, `/inventario`, `/devolucao`) têm as meta tags de app, o nome da
estação, **o ícone dela** (`public/icones/<estação>-180|192|512.png`), **o
manifest dela** (`public/app/<estação>.webmanifest`) e o `public/ipad.css`.
Adicionada à Tela de Início, cada uma abre em tela cheia, direto na estação.

> ⚠️ **UM MANIFEST POR ESTAÇÃO, E NÃO UM SÓ.** A spec escrevia um
> `/app.webmanifest` único com `start_url` fixo **e** pedia um ícone por estação
> — as duas coisas não cabem juntas: com um manifest só, todo tablet abriria na
> mesma tela.

> ⚠️ **`.webmanifest` ENTROU NA REGRA DAS EXTENSÕES DE APOIO** do `acesso.js`
> (`@logado`). Com sessão aberta todo arquivo passa pelo `decidir` (§10, #29), e
> sem a extensão o manifest levaria 403 — e o iPad o ignoraria **em silêncio**.

> ⚠️ **O `ipad.css` TIRA A SELEÇÃO DO CORPO E DEVOLVE AOS CAMPOS.** Sem a segunda
> regra o campo de bipe e o de digitar ficariam presos. É só das estações: as
> telas de escritório (admin, relatórios) continuam selecionáveis.

> ⚠️ **A CAMADA 1 É CONFIGURAÇÃO DO iPad, E NÃO TEM CÓDIGO** — bloqueio
> automático em Nunca, notificações desligadas, Adicionar à Tela de Início,
> Acesso Guiado com código. Está na §4 da spec, e é feita no tablet. **E o
> `target="_blank"` das fotos no Carregamento ficou como está**: em tela cheia ele
> abre o Safari, mas trocar por um link na mesma janela deixaria o operador sem
> botão de voltar — é decisão de tela, anotada na spec.

**Rode `node teste_tablets.js` (83 casos) ao mexer no cabeçalho de uma estação,
no `ipad.css` ou nos manifests**, e `node teste_acesso.js` se mexer na regra das
extensões.

> ✅ **NO AR** (PR #183), confirmado pelo dono em 02/10/2026.
>
> ⚠️ **AINDA NÃO FOI CONFERIDA NOS TABLETS.** A prova é cada estação adicionada à
> Tela de Início abrindo em tela cheia, com o ícone dela, direto na estação.

### ⚠️ AS TELAS DO PCP FORAM MEDIDAS, E ELAS NÃO TÊM O DEFEITO (29/09/2026)

Depois de consertar as sete do sob medida (§19), a pergunta óbvia era se o
PCP tinha o mesmo. **Tem, e não importa** — e o "não importa" é decisão do
dono, não conclusão minha.

As **13 telas** de `public/` foram abertas com o banco semeado (SKU de código
comprido, cliente de nome comprido, 24 volumes nos seis estágios, caixa de
várias persianas, componentes) e medidas por `scrollWidth` contra
`clientWidth`:

| Largura | O que é | Rola de lado |
|---|---|---|
| **1440** · 1366 · 1280 px | notebook — o alvo do `DESIGN.md` §7 para admin | **nada** |
| **1024 px** (iPad deitado) | a bancada do `DESIGN.md` | só o admin: Estoque e Compras |
| **768 px** (iPad em pé) | a bancada | só o admin: + Cadastro de SKU e Cadastros |
| **400 px** (celular) | ninguém abre o PCP assim hoje | 18 tela/aba |

> ⚠️ **NENHUMA TELA DE OPERAÇÃO ROLA EM TABLET.** `/operador`, `/montagem`,
> `/carregamento`, `/inventario`, `/painel` (a TV), `/embalagem`, `/devolucao`,
> `/setor`, `/planejamento`, `/recebimento`: limpas a 768 **e** a 1024. Elas
> foram desenhadas para o iPad da bancada, e a medição confirma. É o contrário
> do sob medida, onde `/corte` e `/producao` — as duas de bancada — rolavam.

> ✅ **E O ADMIN SE ABRE SÓ NO COMPUTADOR — decisão do dono, 29/09/2026.** Com
> isso as abas **Estoque** (tabela de 9 colunas, 1115 px, a página precisa de
> 1156) e **Compras** (994 px, precisa de 1035) **deixam de ser defeito**: o
> alvo delas é 1440 px, onde estão certas, e o próprio `index.html` já dizia
> isso no comentário da linha 11. Ficam **medidas e dispensadas**, e não como
> dívida — dívida que ninguém vai pagar é a lista que a equipe aprende a não
> ler (§5, #10).

**O que continua rolando a 400 px, anotado e NÃO consertado** (não estava em
plano nenhum, e o §0 manda anotar em vez de consertar junto):

| Onde | px | Quem empurra |
|---|---|---|
| o admin, **nas 15 abas** | 413 | o card `#mlTask` "Abrir Planejamento" — **13 px, sempre os mesmos**. É UM defeito, não quinze |
| `/relatorios` | 526 | duas tabelas (432 e 489) |
| `/expedicao` | 524 | a tabela do lote (502) |
| `/embalagem` | 485 | as duas colunas (Agência · Coleta) não quebram |
| admin → Cadastros | 859 | a **prévia da etiqueta do kit** — o SVG de 100 × 35 mm (§4) |

> ⚠️ **O `.rolaH` NÃO EXISTE NO `public/` DA RAIZ.** O recipiente que conserta
> isso no sob medida mora no `tecido/public/base.css`; são duas folhas de
> estilo diferentes. Levá-lo para cá é trabalho de verdade — 4 abas do admin,
> 3 telas e o `#mlTask` —, e não uma linha.

> ⚠️ **E A MEDIÇÃO É DE UM BANCO SEMEADO, NÃO DA PRODUÇÃO.** O número de
> coluna não muda, mas o conteúdo empurra: um cliente de nome mais comprido ou
> um SKU novo pode passar dos 1156 px da aba Estoque. O que está medido é
> **esta** amostra — e dizer isso é a diferença entre um número e um fato
> (§19, "o número errado não veio de uma conta errada: veio de não ter medido").

### Como verificar a sintaxe do `<script>` de um HTML

```bash
python3 -c "
s=open('public/ARQUIVO.html',encoding='utf-8').read()
a=s.index('<script>')+8; b=s.index('</script>',a)
open('/tmp/chk.js','w',encoding='utf-8').write(s[a:b])
" && node --check /tmp/chk.js
```

> Atenção: use `.index` (primeiro `</script>`), **não** `.rindex` — o último
> fecha o bloco do `nav.js` e o código acabaria inserido no lugar errado.
> Isso já aconteceu duas vezes.

---

## 13. Protocolo de trabalho

**Antes de editar:**
1. Ler a seção relevante deste arquivo
2. Ver o trecho real (`grep -n`), nunca editar de memória
3. Backup: `cp arquivo.js arquivo.js.bak-$(date +%H%M)`

**Depois de editar:**
1. `node --check` no arquivo
2. Se mexeu em auth/server: rodar o teste de segurança da seção 10
3. Testar no navegador com refresh forçado (Ctrl+Shift+R / Cmd+Shift+R)

**Deploy:**
```bash
# no Mac
git add -A && git commit -m "..." && git push

# no servidor
cd /opt/expedicao && git pull && node --check server.js \
  && pm2 delete expedicao && pm2 start server.js --name expedicao
sleep 5   # o curl logo depois do start chega antes de a porta abrir
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010/login   # tem que dar 200
```

**Regra de ouro:** o servidor **só recebe** (`git pull`). Nunca editar direto lá.

### Onde moram os planos — `docs/specs/`

Desde 17/09/2026, **toda especificação aprovada mora em `docs/specs/`**, com um
bloco de STATUS datado no topo. Antes disso elas ficavam num Projeto do Claude,
fora do repositório — e por isso Compras foi construído sem a spec de arquitetura,
e as specs ficaram um mês dizendo "nada implementado" sobre coisa em produção.

1. **Antes de construir algo que tem spec, leia a spec** (`docs/specs/README.md` tem o índice).
2. **No mesmo commit do código, atualize o STATUS da spec** — e o índice do README.
   Decisão que mudou na construção vai escrita no STATUS.
3. **Onde a spec e este arquivo divergirem, vale este arquivo.** Anote a divergência na spec.
4. **Spec implementada:** as regras que parecem bug entram aqui; a spec vai para
   `docs/arquivo/`. `docs/arquivo/` é histórico — **não use como fonte de regra**.

### Onde os dados moram — `caminhos.js` é o dono único

`caminhos.js` responde **onde ficam banco, PDFs, fotos e backups**. O padrão é
`/opt/expedicao`, e **continua sendo** — o deploy acima é `git pull && pm2
restart`, ninguém edita variável de ambiente no servidor.

| Chave | O quê | Variável |
|---|---|---|
| `BANCO` | `dados.db` | `PCP_DB` |
| `LOTES` | os PDFs do ML (o cron apaga em 7 dias) | `PCP_LOTES` |
| `COLETAS` | as fotos da conferência com o motorista (§8-B) | `PCP_COLETAS_DIR` |
| `BACKUPS` | as cópias do `backup.js` — dos **dois** bancos | `PCP_BACKUPS` |

`PCP_DIR` move as quatro de uma vez; a variável específica ganha da geral.

> O **`tecido.db` não está nesta tabela**, e não é esquecimento: ele mora ao
> lado do módulo e quem responde por ele é `tecido/nucleo/caminho.js`
> (`BANCO_TECIDO`). O bloco *"O backup diário cobre os DOIS bancos"*, logo
> abaixo, explica por que os dois caminhos continuam separados.

> ⚠️ **O CAMINHO ESTAVA COLADO EM 29 LUGARES, e o efeito não era feiura: o PCP
> só subia naquela pasta.** `db.js` abria `/opt/expedicao/dados.db` sem escape,
> então um clone limpo — máquina de quem desenvolve, runner de CI, segundo
> servidor, backup restaurado noutro lugar — morria no `require` com
> *"Cannot open database because the directory does not exist"*, antes de
> existir rota. Em produção nunca aparecia, porque lá a pasta existe; quem
> descobriu foi um runner de CI limpo, em 15/09/2026.

> ⚠️ **MUDAR O PADRÃO SERIA O PIOR DEFEITO POSSÍVEL.** O próximo `git pull`
> apontaria a produção para um banco **vazio**, e o sintoma não parece erro: o
> sistema sobe, as telas abrem, e o estoque inteiro "sumiu". Por isso o primeiro
> caso do `teste_caminhos.js` é justamente *"sem variável nenhuma, o caminho é o
> de sempre"*.

> **O nome das variáveis não é novo.** `PCP_DB`, `PCP_LOTES` e
> `PCP_COLETAS_DIR` já eram lidos por treze scripts e pelo `carreg_route.js` —
> o que faltava era um lugar que soubesse de todos. Inventar nome novo criaria
> duas réguas para a mesma pergunta (armadilha #12).

**Rode `node teste_caminhos.js` ao mexer no `caminhos.js`** — o último caso
varre os `.js` do projeto e **recusa `/opt/expedicao` escrito em código** fora
do `caminhos.js` e do próprio teste. Sem ele a arrumação dura até o próximo
script, porque script novo se escreve copiando o de cima.

> **O CI roda FORA de `/opt/expedicao`, e isso é a prova viva.** O job de
> segurança do `.github/workflows/testes.yml` sobe o servidor com `PCP_DIR`
> apontado para a área de trabalho do runner, então toda rodada confirma que o
> sistema abre em qualquer pasta. Antes ele fazia `sudo mkdir -p
> /opt/expedicao` — o runner fingindo ser o servidor de produção para o
> `db.js` conseguir abrir o banco. Quem continua conferindo o **padrão** é o
> primeiro caso do `teste_caminhos.js`, não o CI.

### O backup diário cobre os DOIS bancos (28/09/2026)

`node backup.js` copia o `dados.db` **e** o `tecido.db`, os dois pela mesma
pasta `BACKUPS`, com nomes próprios e **uma rotação de 30 para cada**:

```
backup ok -> /opt/expedicao/backups/dados-2026-09-28.db  | copias: 30
backup ok -> /opt/expedicao/backups/tecido-2026-09-28.db | copias: 30
```

> ⚠️ **ATÉ AQUI ELE COPIAVA SÓ METADE DO SISTEMA, E NADA DAVA ERRO.** A fábrica
> tem duas operações (§19) e dois bancos; o cron das 23:30 levava um. Pedidos da
> revenda, boletos, etiquetas de produção e os bipes da bancada nunca entraram
> numa cópia diária — as únicas do `tecido.db` eram as de *"antes de"* que o
> `limpar_sobras.js` e o `backfill_etiquetas.js` gravam à mão, quando alguém
> lembra de rodar um deles.
>
> O modo de falhar é o pior que existe: o cron roda, a saída diz **"backup ok"**,
> trinta cópias se empilham na pasta. Só se descobre no dia em que o banco se
> perde, que é o único dia em que não há o que fazer.

> ⚠️ **`tecido/nucleo/caminho.js` É O DONO ÚNICO DE "ONDE O `tecido.db` FICA",
> e ele nasceu por causa disto.** Até aqui só o `nucleo/db.js` sabia responder —
> e ele só responde **abrindo** o banco. O `backup.js` precisa do caminho sem
> abrir nada (ele copia em readonly), e repetir a conta seriam duas réguas para
> a mesma pergunta: no dia em que uma mudasse, o backup ficaria **verde copiando
> um arquivo que o servidor não usa**. Backup que copia o banco errado é pior
> que nenhum, porque ninguém vai procurar. Há varredura recusando o literal
> `'tecido.db'` em código fora dele.

> ⚠️ **O PADRÃO DO TECIDO NÃO SEGUE O `PCP_DIR`, e isso é de propósito.** Ele
> continua em `<o módulo>/tecido.db` (ou `BANCO_TECIDO`), exatamente como
> estava. No servidor os dois coincidem por acaso — o repo **é** a pasta de
> produção —, e juntá-los agora seria mover o arquivo de lugar, que é o defeito
> que o bloco acima descreve em maiúsculas.

> ⚠️ **AUSÊNCIA NÃO É FALHA, MAS TAMBÉM NÃO É SILÊNCIO.** Clone limpo, runner de
> CI e um PCP sem sob medida não têm `tecido.db`; derrubar o backup por isso
> seria trava disparando no caso normal (#6). Pular **calado** seria a dívida 18
> em pessoa — foi assim que este banco ficou um ano de fora. O script diz que
> pulou **e onde procurou**: "pulei o tecido" sem o caminho manda conferir o
> lugar errado. Banco que **existe** e não copia é erro de verdade, sai
> diferente de zero — e sai **depois** de o backup do PCP já estar no disco,
> porque é ele que despacha o dia.

> ⚠️ **A ROTAÇÃO É UMA POR BANCO.** Uma só, olhando `*.db`, deixaria 30 arquivos
> no **total** — quinze dias de história de cada um no lugar de trinta, com o
> corte caindo no banco que por acaso ordenasse depois. Pela mesma razão a saída
> tem **uma linha por banco**: somar as contagens faria o número dobrar no dia
> do deploy, e quem lê "copias: 60" com o teto de 30 na cabeça conclui que a
> rotação parou de funcionar.

> ⚠️ **O `/baixar-backup` CONTINUA SERVINDO SÓ O `dados-*.db`** — ponta que
> ficou aberta de propósito em 28/09/2026. O backup do tecido existe no
> servidor e se copia por `scp`; mudar o que aquela URL entrega é outra
> decisão, e não estava no plano.

**Rode `node teste_backup.js` (10 casos) ao mexer no `backup.js`, no
`caminhos.js` ou no `tecido/nucleo/caminho.js`** — ele monta bancos de verdade
em pasta temporária, com WAL e **sem checkpoint**, e exige que os dados cheguem
na cópia (é o caso que separa `db.backup()` de `cp`). Oito defeitos foram
reintroduzidos um a um: não copiar o tecido (reprova 6), rotação única (2),
pular calado (1), ausência virando erro (1), `catch` vazio no tecido quebrado
(1), o tecido copiado antes do `dados` (2), a contagem somada (1) e o `db.js`
resolvendo o caminho sozinho (2).

> ✅ **NO AR E CONFERIDO COM DADO REAL EM 28/09/2026** (PR #155). O dono fez o
> deploy e rodou `node backup.js` à mão, sem esperar o cron: saíram as **duas**
> linhas, e o `tecido-2026-09-28.db` nasceu com **668 KB** — o banco do sob
> medida inteiro, que nunca tinha entrado numa cópia diária. O teste da §10
> passou depois do restart (telas 302, API 401, `/login` 200).
>
> ⚠️ **O PRIMEIRO `ls` DA CONFERÊNCIA OLHAVA PARA O LUGAR ERRADO, e quase
> passou por prova.** Pedi `ls backups/ | tail -4`, que ordena por nome:
> `tecido-antes-…` vem **depois** de `tecido-2026-…`, então a cópia nova ficou
> fora do recorte e a tela mostrou só arquivo velho. Comando de conferência que
> não olha para o que se quer provar é o verde sem conferência do §10 por uma
> porta nova — quem confere é `ls backups/tecido-????-??-??.db`.
>
> ⚠️ **E O `copias: 3` DA PRIMEIRA RODADA ESTÁ CERTO.** Na primeira cópia o
> número devia ser **1**, e não foi. A causa: já existiam
> `tecido-2026-09-03.db` e `tecido-2026-09-22.db`, duas cópias manuais antigas
> que por acaso usam o **mesmo formato de nome** que a rotação conta. Elas
> entram no teto de 30 e um dia sairão por ele — o que está certo, são cópias
> do mesmo banco. **O número foi investigado antes de a fase ser dada por
> fechada:** número de diagnóstico que ninguém sabe explicar não vira "deu
> certo" (§5, #27).

### A coleta de auditoria da VPS — só leitura, rodada do Mac (13/10/2026)

`./scripts/auditoria/coletar_vps_deccorar.sh <alias-ssh> <caminho>` lê o
estado da produção e grava um relatório saneado em `auditoria_coletas/` (fora
do Git). Passo a passo e procedimento das cópias dos bancos em
`docs/auditoria/COLETA_VPS.md`. São quatro armadilhas de "só ler", e o teste
trava as quatro:

> ⚠️ **`git status` ESCREVE.** Ele regrava o `.git/index` para guardar o
> cache de stat. Na produção ele roda com `GIT_OPTIONAL_LOCKS=0`. Tirar essa
> linha reprova o teste, que confere o índice byte a byte antes e depois.
>
> ⚠️ **`pm2 ping`, `pm2 ls` e `pm2 jlist` INICIAM o daemon** quando ele não
> existe. A coleta só chama o pm2 se já houver um God Daemon do mesmo
> usuário. E o `jlist` traz o **ambiente inteiro** do processo, com os
> segredos; a saída passa por um filtro antes de ser impressa.
>
> ⚠️ **Abrir um banco em WAL pode criar o `-shm`.** Na coleta operacional os
> `.db` não são abertos: só nome, tamanho e data.
>
> ⚠️ **O crontab pode carregar o token do `/baixar-backup` na URL.** Dele só
> sai o horário e o nome dos comandos.

> ⚠️ **A CÓPIA DOS BANCOS PARA AUDITORIA É A DE `backups/`**, que o
> `backup.js` já faz pela API de backup do SQLite. Ela não grava nada na VPS
> e não toca o banco em uso. A coleta nunca transfere banco: isso é um passo
> à parte, com autorização explícita.

**Rode `node teste_coleta_vps.js` (76 casos) ao mexer em
`scripts/auditoria/`.** Sete defeitos foram reintroduzidos um a um: sem
`GIT_OPTIONAL_LOCKS` (reprova 3), sem a guarda do daemon (1), crontab cru (4),
`jlist` cru (1), sudo (2), texto de log (2) e janela diferente nos dois
scripts (1).

---

## 14. Dívidas técnicas conhecidas

Ordenadas por risco. Não são bugs desconhecidos — são decisões adiadas.

| # | Dívida | Risco |
|---|---|---|
| 1 | ~~Modo teste não cobre `fila`, `devolucao`, `rejeicao`, `contagem`, `foto_estoque`~~ **RESOLVIDO em 14/08/2026** — ver §11 | — |
| 1b | ~~`fila` não tem `CREATE TABLE` em lugar nenhum~~ **RESOLVIDO em 14/08/2026** — criada em `db.js` | — |
| 1d | ~~`revisao.modo` e `producao.origem`/`urgente` sem migração~~ **RESOLVIDO em 14/08/2026** — auditoria completa, ver §17 | — |
| 1c | ~~**Embalagem em teste consome linha real da `fila`**~~ **RESOLVIDO em 17/09/2026** — a fila é filtrada pelo mesmo `teste` do momento: em modo teste consome linha de teste, fora dele consome linha real (§4, armadilha #26) | — |
| 2 | **Sem HTTPS.** PINs trafegam em texto aberto. O PIN passou a ter 6 dígitos em 21/10/2026 (fase 5-A da `ACESSOS-UNIFICADOS`); o HTTPS é a fase 5-B | Alto se exposto à internet |
| 3 | **Revisão perdida em falha de conexão** — sem fila local de reenvio | Médio — buraco silencioso no relatório |
| 4 | `POST /api/producao` (manual) não aceita `data`, `origem` nem `urgente` | Médio — impede lançar adiantado pela tela |
| 5 | Upload não permite escolher a data das vendas | Médio — vendas de amanhã entram como hoje |
| 6 | `POST /api/revisao` retorna campos obsoletos (`estoque`, `pedido`, `feito`) | Baixo — confunde quem lê a API |
| 7 | ~~SKU `BK110X240BEGE` fora do padrão~~ **RESOLVIDO em 23/08/2026** — não há mais padrão de SKU; etiqueta e seletor leem as colunas (§7) | — |
| 8 | ~~`/devolucao` não está no menu do rodapé (`nav.js`)~~ **RESOLVIDO em 02/10/2026** — botão "Devoluções" no rodapé, ao lado de Inventário | — |
| 9 | Revisão e embalagem não gravam **quem** fez (só `rejeicao` grava) | Baixo — impede produtividade por pessoa |
| 10 | Sem testes automatizados na maior parte — hoje há `teste_parse.js` (24 casos), `teste_carga.js` (60), `teste_divergencia.js` (62) `teste_estoque.js` (86), `teste_contagem.js` (36), `teste_inventario.js` (80), `teste_ajuste.js` (53), `teste_backup.js` (10), `teste_livro.js` (60), `teste_cruzamento.js` (14), `teste_etiqueta.js` (68), `teste_ficha.js` (40), `teste_ordem_dia.js` (17), `teste_acesso.js` (265), `teste_cobertura.js` (10), `teste_kit.js` (133), `teste_qr.js` (45), `teste_skus.js` (63), `teste_montagem.js` (42), `teste_carregados.js` (28), `teste_arrumar_sobmedida.js` (63), `teste_compras_sobmedida.js` (29), `teste_componentes.js` (38), `teste_saida.js` (53), `teste_area.js` (29), `teste_segunda_pessoa.js` (25), `teste_saida_coleta.js` (57), `teste_saida_agencia.js` (43), `teste_media.js` (25), `teste_cancelada.js` (38), `teste_caminhos.js` (6), `teste_destino.js` (15), `teste_linguagem.js` (13) `teste_correcao.js` (112), `teste_correcao2.js` (98), `teste_correcao3.js` (23), `teste_acuracidade.js` (23), `teste_pecas_carga.js` (37), `teste_tablets.js` (83), `teste_sobra.js` (103), `teste_modo_teste_caixa.js` (18), `teste_coleta_vps.js` (76), `teste_atalho.js` (10), `teste_carregamento_tela.js` (10), `teste_etiqueta_sku.js` (54), `teste_revisao.js` (24), `teste_upload.js` (46), `teste_devolucao.js` (33), `teste_login.js` (74), `teste_conferencia_antiga.js` (64) e `teste_baixa_conferencia.js` (69); o resto não tem | Médio a longo prazo |
| 11 | ~~**A investigar: o que é o `Quantidade` da folha**~~ **RESPONDIDA em 15/09/2026** — é o pacote de vários produtos do ML: uma etiqueta com mais de uma persiana. Ver §5, armadilha #23 | — |
| 12 | **NO RADAR: trazer para o PCP o que o sob medida já tem** — decisão de 03/09/2026, sem prazo. Quatro coisas, em ordem de valor: (a) tabela `parametro` com rótulo, unidade e a explicação do que o número muda, no lugar do `config` chave/valor cru; (b) migrações numeradas com tabela `migracao`, que mata a dívida do §17 de vez; ~~(c) registro de rotas em que rota sem permissão declarada nasce negada~~ **FEITO em 17/09/2026** com a dívida 16 (§10, armadilha #29): o padrão é negar e a cobertura varre o Express; (d) envelope único `{ok,dados}` / `{ok,motivo,mensagem}`, hoje cada rota responde de um jeito | Nenhum enquanto não for feito — é melhoria, não correção. Mas cada mês que passa é mais rota nova no padrão antigo |
| 13 | ~~**Carregamento aceita volume que não foi embalado**~~ **RESOLVIDO em 17/09/2026** — o bipe exige `estagio='embalado'` (a régua do `carga.js`), recusa dizendo por onde imprimir e registra na auditoria; o `GET /api/print/:id` deixou de imprimir volume `pendente`, que era a boca do buraco. Ver §5, armadilha #27. **Fica aberto**: os volumes que já saíram assim continuam com o saldo alto. `node conferir_carregados.js` conta esse passivo (só lê); a correção é contagem + Admin → Estoque, nunca os scripts do §5 | — |
| 14 | ~~**`POST /api/montagem` (a embalagem) sem proteção**~~ **RESOLVIDO em 17/09/2026** — transação nas quatro escritas, SKU conferido (404), kit conferido no servidor e recusa aparecendo na tela; `teste_montagem.js` (42 casos). Ver §4, armadilha #26. **Fica aberto**: o código do kit é conferido quando vem, não exigido — exigir espera o refresh nos tablets. "Embalar sem revisar gera estoque" **não** entrou: é regra do §4, não defeito | — |
| 15 | ~~**`POST /api/skus` zera o estoque** quando o corpo não traz `estoque`~~ **RESOLVIDO em 17/09/2026** — campo ausente preserva os quatro campos soltos, número impossível é recusado (400) em vez de clampado, e as duas escritas viraram uma transação com o `catch` vazio fora. A rota saiu para `sku_cad_route.js` e tem `teste_skus.js` (60 casos) atrás — ver §6, armadilha #25. ~~**Fica aberto**: a rota ainda muda saldo com `sku.cadastrar`~~ **FECHADO em 21/09/2026** na fase 1 do livro: o cadastro não mexe em saldo, nem com o campo presente, nem no SKU novo — e a rota diz que ignorou (§2, o livro) | — |
| 16 | ~~**Acesso: default `@logado` e cobertura mantida à mão**~~ **RESOLVIDO em 17/09/2026** — o padrão passou a ser **negar**, a cobertura varre o Express (a lista `TODAS_ROTAS` saiu) e o boot grita o nome da rota não declarada; as 28 leituras sem dono foram declaradas e as telas `.html` gêmeas herdaram a permissão da tela. Ver §10, armadilha #29 · `teste_cobertura.js` | — |
| 17 | ~~**Acesso: duas travas faltando**~~ **RESOLVIDO em 17/09/2026** — a exceção recusa conceder chave `intransferivel`, a troca de setores tem a trava do último Admin Geral (mesma conta do `auth.js`, agora no `acesso.js`), setor novo não nasce `admin_geral` e a migração de `areas` virou evento de uma vez só (a porta A, que promovia a Admin Geral em silêncio). Ver §10, armadilha #28 | — |
| 19 | **`minimo.definir` é uma chave que nenhuma rota lê.** Ela está em `permissoes.js` e no setor de Compras do `acesso.js` desde a fase 0, dizendo *"Definir estoque mínimo — ponto de pedido e estoque ideal por componente"*. Quem manda de verdade no card Materiais é `componente.cadastrar` (escrita) e `compras.ver` (leitura). Então marcar a caixinha certa na tela de Acessos **não libera nada**, e a pessoa leva 403 numa tela que a permissão dela diz que ela pode — sem erro e sem log, que é a terceira ponta da armadilha #13 (§19). Juntar as duas ou apagar a chave muda **quem pode o quê**: é `REGRA`, não conserto | Baixo — hoje quem tem uma tem a outra, porque o seed de Compras dá as duas juntas |
| 20 | **Editar um setor APAGA, sem avisar, as permissões que ele tem acima do próprio nível.** O `POST /api/acesso/setores` faz `DELETE` + `INSERT` da lista inteira, e a tela só manda as caixinhas **marcadas** — as que estão acima do nível do setor ela desenha `disabled`, então nunca são mandadas. Não há recusa: a chave simplesmente não volta. Foi assim que `sobmedida.cadastrar` saiu do `Sob medida / Cadastros` em 19/09/2026, num salvamento que era sobre outra coisa (§19, armadilha #34). O conserto de 24/09 igualou aquele par, mas o mecanismo continua valendo para qualquer setor. Consertar é decidir o que a tela faz com a chave que ela não pode mostrar — avisar, preservar ou recusar o salvamento —, e as três mudam quem pode o quê: é `REGRA` | Médio — o modo de falhar é silencioso, e quem salva não fez nada de errado |
| 18 | **Nada acusa uma regra INERTE** — e ela tem pelo menos **três formas**: dado que ninguém preencheu, **rota que nenhuma tela chama** (o extrato do livro ficou um dia no ar sem botão, §2; o `POST /api/componentes` ficou **oito meses**, e no lugar dele se fazia `INSERT` à mão — §7-B, armadilha #33) e **chave de permissão que nenhuma rota lê** (a `minimo.definir` da linha abaixo). `modelo.sob_medida` ficou três semanas sem nenhuma linha marcada: a regra do §7 estava escrita e codificada, e não pegava em ninguém — sem erro, sem log, sem sinal em tela nenhuma (§7, armadilha #30). O §18 já tem o desenho que falta aqui: a auditoria do parse reporta a **cobertura** de cada trava e fica âmbar abaixo de 100%. O equivalente para flags de cadastro não existe. Descoberto por acaso, por um script escrito para outra coisa | Médio — o modo de falhar é silencioso, e o desvio acontece fora da vista do sistema |

---

## 15. O que NÃO fazer

> **Os itens de cada área estão no fim do arquivo de regras dela**, na seção
> "O que NÃO fazer": [`estoque.md`](docs/regras/estoque.md),
> [`expedicao.md`](docs/regras/expedicao.md),
> [`carregamento.md`](docs/regras/carregamento.md) e
> [`sobmedida.md`](docs/regras/sobmedida.md). Aqui ficam os que citam mais de
> uma área, os que não citam nenhuma e os de seções que ainda não viraram
> cartões.

- ❌ Somar a medida de **corte** em custo nenhum — ela é o outro número da linha,
  e os dois nunca fecham (§7-B, armadilha #18)
- ❌ Escrever um número fixo de peças por bobina dentro da fórmula do tecido
  (`/200`) — quem decide quantas cabem é a `largura_bobina` (§7-B, armadilha #19)
- ❌ Voltar a testar fórmula contra uma lista fixa de medidas: a de 3,00 m não
  cabe em bobina nenhuma e reprovava a fórmula certa (§7-B, armadilha #19)
- ❌ Contar venda por dia a partir de `lote` fora do `media_dominio.js`, ou fazer
  a comparação ler a planilha por consulta própria — a coluna planilha é a do
  `demanda_dominio`, a mesma da tela azul (§3, VENDAS F1)
- ❌ Trocar a produção para a média do sistema sem o ok do dono: a fase 1 é só
  conferência, e a troca é a fase 3 (§3)
- ❌ Voltar a apagar a venda PASSADA por ausência no import da planilha: o
  recorte volta a zerar a média — e até a fase 3 ela ainda é gravada (§3, VENDAS F2)
- ❌ Deixar `devolu|reembols` cancelar volume: é depois de entregue, e o card
  encheria de caixa que o cliente recebeu (§3, VENDAS F2)
- ❌ Cancelar sozinha a caixa de várias persianas, ou procurar o volume só por
  `lote.venda`: no pacote o relatório traz o PACK, e cada item tem o seu Estado (§3)
- ❌ Escrever `cancelada_em IS NULL` pelas rotas em vez de usar o estágio
  `cancelado` (D1 A), ou uma segunda leitura das linhas canceladas fora do
  `cancelada_dominio.js` (§3, VENDAS F2)
- ❌ Devolver ao estoque **sozinho** a venda cancelada depois da etiqueta: quem
  devolve é uma pessoa, pelo ↩ Sobrou, bipando o SKU de cada persiana (§2, 2-B)
- ❌ Fazer a sobra devolver `+1` em vez de POR PEÇA, devolver saldo de sob
  medida, ou devolver a caixa que nunca baixou: a caixa de pacote baixou N, o
  sob medida nunca baixou, e a não conferida nunca saiu do saldo (§2, §7)
- ❌ Devolver a sobra fora do `baixa_dominio.devolver`, ou voltar a pôr o
  "a persiana voltou" na Mesa: a Mesa nunca mexe em saldo (D7), e há varredura
  no `teste_sobra.js` recusando movimento `sobra` em outro arquivo (§2)
- ❌ Deixar quem conferiu a caixa marcar a sobra dela, ou confirmar a sobra sem
  TODAS as persianas bipadas (§2, 2-B, D8)
- ❌ Deixar o card de canceladas sem a marca de decidido: ele nunca zera, e
  número que não zera vira paisagem (§3 D3 · §5, a Mesa)
- ❌ Dar backfill a `correcao.executar`: o Admin Geral passa por nível, e a chave
  chega ao dono no primeiro boot (§5, a Mesa · §4, o `kit.imprimir`)
- ❌ Fazer a Mesa aplicar ajuste de saldo: ela abre o pedido, e outra pessoa
  aprova (§5, a Mesa F2 · §18)
- ❌ Ignorar em silêncio um campo que o chamador mandou: a rota DIZ que ignorou
  o `estoque`, senão ele acredita que gravou e descobre no inventário (§2, §6)
- ❌ Mover a restauração da foto do modo teste para fora do domínio — exceção
  numa regra de dono único é o começo do terceiro dono (§2, §11)
- ❌ Tirar `movimento_estoque` de `TABELAS`: "apagar tudo" devolveria o saldo
  pela foto e deixaria as linhas de teste descrevendo o que não existe (§11)
- ❌ Deixar o aprovador único aprovar sozinho "com motivo": a decisão do dono é
  ESPERAR (§6.4 da spec, 26/09/2026)
- ❌ Afrouxar o guard de 700 ms do bipe na Etiqueta de Venda: com o bipe por
  unidade, a repetição do leitor vira persiana a mais (§5, #23 e §12)
- ❌ Pôr a tarja numa linha com `white-space:nowrap` e `text-overflow:ellipsis`:
  o nome comprido do cliente apaga a tarja do fim da linha — e ainda vira o
  piso da coluna inteira, porque `fr` não desce abaixo do min-content (§12)
- ❌ Dar por pronta uma regra que depende de flag de cadastro só porque o código
  a lê: sem linha marcada no banco ela é texto, e nada acusa isso (§7, #30)
- ❌ Marcar `sob_medida` no modelo `ROLO` para "resolver o sob medida" — são 29
  dos 30 SKUs, e a fábrica inteira sai da trava e da baixa (§7, armadilha #30)
- ❌ Apagar cadastro de SKU sem conferir as dez tabelas que citam um código: o
  volume atrás dele volta para `bloqueado` e a caixa para na expedição, dias
  depois do script (§7, armadilha #30)
- ❌ Chamar `db.backup()` sem `await`: ele é assíncrono, estoura **depois** do
  `db.close()` com o relatório de sucesso já impresso, e o backup não existe
  (§12, e o `limpar_fantasmas.js` é o modelo)
- ❌ Carimbar em `now` a saída do passivo da coleta: cada caixa sai na data do
  bipe dela, como todo script de passivo (§5, §8-B)
- ❌ Dar `saida.liberar` a todo setor de nível alto, ou declará-la `admin`: é
  Supervisor e Admin, e nível admin vira admin do PCP (§8-B, §19 #34)
- ❌ Escrever `/opt/expedicao` em código fora do `caminhos.js` — o caminho
  colado é o que fazia o PCP só subir naquela pasta, e há teste varrendo (§13)
- ❌ Mudar o PADRÃO do `caminhos.js`: o próximo `git pull` apontaria a produção
  para um banco vazio, e o sistema subiria com o estoque "sumido" (§13)
- ❌ Fazer o `POST /api/config/kit/etiqueta` apagar campo que não veio no corpo
  — era a dívida 15 do §14 repetida em outra rota (§4, §6 #25)
- ❌ Fazer o `POST /api/componentes` sobrescrever campo que não veio no corpo:
  editar o mínimo de um material de tecido apagava família, cor e largura de
  bobina, e a ficha parava de resolver a bobina (§7-B, armadilha #33)
- ❌ Clampar mínimo, ideal, bobina ou perda em zero naquela rota: `parseFloat`
  com `||0` faz de `"abc"` e de `-5` um zero em silêncio — é a #25 outra vez,
  e quem decide se o número é possível é o servidor, dizendo qual campo (§7-B)
- ❌ Exigir `nome` na EDIÇÃO de um componente: um POST parcial morria com "nome
  obrigatório" em vez de gravar o campo citado — obrigatório é para nascer
- ❌ Mandar os nove campos a cada tecla "porque sempre foi assim": era só isso
  que segurava o wipe, por acaso, como a tela do admin segurava o §6 (#33)
- ❌ Escrever a recusa de uma linha no rodapé do card, ou repintar o valor velho
  por cima do digitado — o motivo fica na linha, e o que a pessoa digitou fica
  no campo, em vermelho (§7-B, armadilha #33, e a regra da ficha)
- ❌ Pôr campo de estoque no card Materiais: o saldo entra pelo Recebimento e se
  corrige pela Contagem, que gravam movimento — seria mais um dono (§7-B)
- ❌ Deixar "Desativar" sem o caminho de volta: é a linha inativa do cadastro de
  SKU, onde reativar é um Adicionar que ninguém adivinha (§7, §7-B #33)
- ❌ Deixar um Express de mentira propagar o estouro da rota num teste: a suíte
  morre no meio e o defeito aparece como "travou", não como vermelho (#33)
- ❌ Deixar campo ausente valer como zero no `POST /api/skus`: um POST só com
  código e descrição apagava o saldo, sem erro e sem rastro (§6, armadilha #25)
- ❌ Clampar estoque ou alvo impossível em zero "para não recusar": clampar é
  apagar saldo em silêncio, que é o mesmo defeito por outra porta (§6, #25)
- ❌ Devolver a escrita do SKU e o destravamento dos volumes para fora de uma
  transação, ou pôr o destravamento de volta num `catch` vazio — o `ok:true`
  mentindo deixa o volume bloqueado e ninguém vai procurá-lo (§6, #25)
- ❌ Copiar a tabela CODE128 para um segundo arquivo: `public/barras.js` serve o
  sob medida e a etiqueta do kit, e duas tabelas são duas etiquetas (§4, §19)
- ❌ Pôr `kit.imprimir` depois do `pre('/api/kit')` no `permDaRota()` — a chave
  vira enfeite e a impressão volta a pedir `kit.editar` (§4, §5 #23)
- ❌ Deixar conceder por exceção uma permissão marcada `intransferivel`: as três
  decidem quem tem acesso a quê, e delegar uma delas é dar o sistema inteiro
  (§10, armadilha #28). Revogar continua livre
- ❌ Permitir criar setor NOVO de nível `admin_geral` — esse nível é "todas as
  permissões", e a guarda antiga só cobria o setor que já existia (§10, #28)
- ❌ Deixar a tela de Acessos tirar o setor Admin Geral do último Admin Geral, ou
  escrever uma segunda conta de "ele é o último?" — ela mora no `acesso.js` e o
  `auth.js` chama ela (§10, armadilha #28)
- ❌ Fazer o `migrarPendentes` voltar a ler `usuarios.areas` como entrada: ela é
  SOMBRA (§19, #13), e lê-la promove a Admin Geral quem recebeu uma exceção
  qualquer de nível admin — sem ninguém pedir (§10, armadilha #28, porta A)
- ❌ Gravar em `config` a partir de um módulo sem garantir que a tabela existe: o
  `try/catch` engole, o seed "roda" e não grava nada (§10, §17)
- ❌ Fazer o `permDaRota()` voltar a terminar em `@logado`: rota nova nasceria
  aberta a qualquer pessoa logada, sem erro e sem log (§10, armadilha #29)
- ❌ Criar rota sem a linha no `permDaRota()` — ela **nasce negada**, e o
  `teste_cobertura.js` reprova. Isso é o aviso funcionando, não um estorvo (§10)
- ❌ Pôr `.html` na regra de extensões dos arquivos de apoio: `.html` é TELA, e
  a gêmea tem que herdar a permissão da rota sem extensão (§10, #29)
- ❌ Tirar a regra das extensões (`.js`, `.css`, imagens): com sessão aberta o
  arquivo da tela passa pelo `decidir`, e sem ela toda tela abre em branco com
  403 no console (§10, armadilha #29)
- ❌ Voltar a medir cobertura por lista escrita à mão, ou descartar `/api/` do
  contador — era isso que imprimia "cobertura OK" sobre 151 rotas olhando 49
  (§10, armadilha #29)
- ❌ Varrer as rotas sem `setImmediate` no boot: o `teste_route` e o
  `/sobmedida` ainda não subiram, e a conta sairia sobre meio sistema (§10)
- ❌ Declarar leitura de tela por uma chave só quando ela tem mais de um público:
  o setor Admin não tem chave de operação, e a leitura da própria tela dele
  sumiria — a declaração aceita uma LISTA (§10, armadilha #29)
- ❌ Mover `express.static` para antes do `auth`
- ❌ Usar `cp dados.db` como backup
- ❌ Editar arquivos direto no servidor
- ❌ Criar tabela de equivalências de SKU (decisão explícita do dono)
- ❌ Remover a trava de SKU não cadastrado
- ❌ Usar `.rindex('</script>')` ao inserir JS em HTML
- ❌ Commitar `.session_secret`, `dados.db`, `tecido.db`, `backups/` ou `lotes/`
- ❌ Nomear o limite de crédito sem o prefixo do padrão de poda: um
  `limite_credito_centavos` viaja pelo fio em silêncio (§19, e §15 acima)
- ❌ Dar código novo na reimpressão, ou pôr o aviso do já impresso DEPOIS do
  botão: ali ele explica um maço que já saiu (§19, e a armadilha #1-B do §2)
- ❌ Escrever uma segunda cópia da tabela CODE128 no PDF da etiqueta de
  produção: o `public/barras.js` serve os três (§19, §4)
- ❌ Pôr numa tabela um `<td>` que só existe em algumas linhas: a tabela sai
  torta e a tarja aparece debaixo do cabeçalho de outra coluna (§19, §12)
- ❌ Escrever a chave do setor na tela da bancada em vez do nome — chave de
  banco em tela é o "— Correcao de contagem" do §2 outra vez (§19)
- ❌ Escrever a chave do setor na recusa em vez do nome: `colecao` numa tela
  de bancada é chave de banco em tela (§19, 5-B1, e o §2)
- ❌ Dizer "sem quantidade de suportes cadastrada" no kit tradicional: ele
  não usa faixa de suporte por regra (§4.7), e aviso que dispara no caso
  normal é a armadilha #6 (§19, 5-B1)
- ❌ Fazer o limite olhar só o bipe ABERTO: o exemplo da §4.17 é de um que
  FECHOU — voltou do almoço e bipou o fim (§19, 6-B)
- ❌ Escrever data no formato do banco (`2026-09-20`) em tela de fábrica, ou
  deixar a frase concordar só no começo (§19, 6-B, e o §2)
- ❌ Cortar o disponível negativo em zero: dois mil estourados e um real
  estourado ficariam iguais na tela (§19, 6-C1, e o §2)
- ❌ Ordenar a tarefa semanal por nome: quem estourou tem que estar em cima
  (§19, 6-C1, e a §3)
- ❌ Pedir dinheiro em centavos numa tela e em reais na outra (§19, 6-C1, §4)
- ❌ Ler o CSS para saber se a regra pegou: `.form label` tem especificidade
  maior que `.marca`, e a regra escrita não valia — quem diz é a tela MEDIDA
  (§19, 6-C1b, e a coluna `fr` do §12)
- ❌ Escrever um número e a palavra que o qualifica em linhas diferentes:
  "#5001 · R$ 115,50" se lê como o valor do pedido (§19, 6-C1c, e o §4)
- ❌ Deixar uma tabela larga empurrar a PÁGINA de lado: ela rola dentro do
  `.rolaH` do `base.css` — e quem diz se pegou é a tela MEDIDA (§19, §12)
- ❌ Contar telas com defeito pelas que estavam abertas em vez das medidas: foi
  assim que "sete" virou "três" num relatório meu (§19, §12)
- ❌ Reabrir como dívida as abas Estoque e Compras do admin: elas foram MEDIDAS
  e dispensadas — o admin só se abre no computador (§12, decisão de 29/09/2026)
- ❌ Dizer que levar o `.rolaH` ao `public/` da raiz é "uma linha": são duas
  base.css diferentes, 4 abas do admin e 3 telas (§12)
- ❌ Criar tela interna sem o `nav.js` da operação: ela nasce sem "Trocar
  setor" e sem o atalho, e a pessoa só sai pelo login (§20, Regra A)
- ❌ Escrever chefia, chefe, patrão, dono ou gestão em texto que aparece para
  quem usa o sistema — nomeie a etapa, ou o nível de acesso (§20, Regra B)
- ❌ Declarar tela no `tecido/nucleo/telas.js` sem a porta na `inicio.html` e
  o nome no `NOMES` do `nav.js` — o vendedor lia "nenhuma tela" com as telas
  dele no rodapé (§20)
- ❌ Escrever uma segunda lista de "para onde a pessoa vai": é o `destino.js`,
  e foi a cópia do login que mandava o vendedor de volta ao PIN (§20)

---

## 16. Glossário do negócio

| Termo | Significado |
|---|---|
| **Corte** | Horário limite para uma venda ser entregue no mesmo dia |
| **Despacho** | Horário limite para levar os volumes à agência do ML |
| **Kit** | Kit de instalação que vai dentro da caixa, com QR do manual |
| **Folha de controle** | Página do PDF do ML que traz o SKU de cada venda |
| **Pack ID** | Identificador do volume no Mercado Livre |
| **Alvo** | Quantidade que o estoque de um SKU deveria ter |
| **Reposição** | Produção para refazer o estoque consumido por uma venda |
| **Urgente** | Venda sem estoque — cliente esperando, sai no mesmo dia |
| **Adiantamento** | Ordem de amanhã produzida hoje, se sobrar tempo |
| **Saiu adiantado** | Volume que saiu da fábrica antes da data de despacho da etiqueta — carro pelo bipe, coleta quando o caminhão leva (§8-B). Não é o mesmo que "adiantamento" |

---

## 17. Schema: instalação limpa tem que bater com produção

Não há migrations. Cada tabela nasce de um `CREATE TABLE IF NOT EXISTS` inline.
O banco de produção foi ganhando colunas **à mão** ao longo do tempo, e esses
`ALTER TABLE` nunca voltaram para o código — o resultado era um `CREATE` que não
descrevia mais o banco real. Auditoria de 14/08/2026 fechou o buraco:

| Tabela | Estava faltando no `CREATE` | Onde é usada |
|---|---|---|
| `fila` | a tabela **inteira** | `server.js`, `dev_route`, `mont_route`, `ger_route` |
| `producao` | `origem`, `urgente`, `teste` | `cruz_route.js:35-36`, `st_route.js:14` |
| `revisao` | `modo`, `teste` | `server.js:49`, `st_route.js:15`, `ger_route.js:37` |
| `montagem` | `teste` | `teste_route` |
| `lote` | `teste` | `teste_route` |
| `foto_estoque` | `teste` | `teste_route` |

**Regra daqui pra frente:** coluna nova entra no `CREATE TABLE` do módulo **no
mesmo commit** em que o código passa a usá-la. Se precisar existir também no
banco de produção, o `ALTER` correspondente vai junto, com a coluna acrescentada
**no fim** — é onde o SQLite a coloca, e é o que mantém a ordem igual à de lá.

> ⚠️ **O `ALTER` guardado mora no módulo dono da tabela.** Um `ALTER` de
> `contagem_pendente` ficou no `compras_schema.js`, que roda no boot do `db.js`
> — antes de `cont_route.js` criar a tabela. Num banco **novo** a guarda não
> achava a tabela e pulava; a coluna só nascia no segundo boot. Em produção nada
> aparecia, porque lá a tabela já existia. Instalação limpa é justamente o caso
> que essa seção existe para proteger.

> ⚠️ `ALTER TABLE ADD COLUMN` **não aceita default dinâmico** no SQLite
> (`(datetime('now','localtime'))` é recusado). Colunas de data adicionadas por
> `ALTER` ficam sem default e entram `NULL` — foi o risco que quase pegou
> `fila.revisado_em`, que ordena a tela de embalagem.

**Como conferir** que o código bate com o banco (roda no servidor):

```bash
cd /opt/expedicao
for t in skus producao revisao fila montagem lote devolucao rejeicao contagem foto_estoque; do
  printf "%-13s " "$t"; sqlite3 dados.db "SELECT GROUP_CONCAT(name,', ') FROM pragma_table_info('$t');"
done
```

Compare com a §3 do `docs/ARQUITETURA.md`. Diferença ali é dívida nova.

---

## 18. A aba Estoque do admin

> **As regras desta seção estão em [`docs/regras/estoque.md`](docs/regras/estoque.md)**
> (cartões R-EST-12 a R-EST-23), cada uma com o teste que a trava. O porquê
> longo — armadilhas **#12** e **#32**, a conferência em três papéis, o ajuste em
> duas pessoas, a acuracidade — está em
> [`docs/historia/estoque.md`](docs/historia/estoque.md).

| Cartão | Regra em uma linha |
|---|---|
| R-EST-12 | A falta de estoque tem uma conta só (`demanda_dominio`): aba, tela azul, TV e gerencial (#12) |
| R-EST-13 | O gráfico conta em PEÇA a embalagem, a baixa (`baixado_em`) e, à parte, a sobra ("voltou"); ajuste e contagem ficam fora (`fluxo_estoque`) |
| R-EST-14 | Custo sem preço é piso, nunca zero; sem `custo.ver` o valor não viaja |
| R-EST-15 | O reservado (sem etiqueta + em caixa) é leitura e não muda o `precisa` |
| R-EST-16 | Toda correção aplica a DIFERENÇA sobre o saldo de agora (#32) |
| R-EST-17 | Quem conta não vê o saldo, nem no JSON |
| R-EST-18 | Ninguém aprova o próprio trabalho, nem o Admin Geral; o aprovador único espera |
| R-EST-19 | O caminho da contagem: bateu confirma; diferente reconta; a 3ª decide pelo acordo |
| R-EST-20 | Ajuste manual: pedir não mexe no saldo; outra pessoa aprova |
| R-EST-21 | Peça se conta só pelo Inventário; a aba Contagem é de material |
| R-EST-22 | A idade da conferência sai do `inventario_dominio.conferencias()` |
| R-EST-23 | A acuracidade conta o acerto da 1ª contagem; sem contagem é traço |

**Ao mexer em** `est_route.js`, `fluxo_estoque.js`, `demanda_dominio.js`,
`painel_route.js` ou `ger_route.js`: `node teste_estoque.js`. No
`inventario_*.js` ou na tela `/inventario`: `node teste_inventario.js`. No
`cont_route.js`: `node teste_contagem.js`. No `ajuste_*.js`: `node
teste_ajuste.js`. No reservado ou na acuracidade: `node teste_acuracidade.js`.
Nas chaves: `node teste_acesso.js` e `node teste_cobertura.js`.

---

## 19. A SEGUNDA OPERAÇÃO — sob medida (`/sobmedida`)

A fábrica tem **duas operações**: a medida padrão (tudo até a §18, banco
`dados.db`) e o sob medida (`tecido/`, montado em `/sobmedida`, banco
`tecido.db`), com o mesmo PIN. O módulo tem `README.md` próprio em `tecido/`.
**Leia-o antes de mexer lá** — ele tem regras que parecem bug e não são.

> **As regras gerais do módulo estão em [`docs/regras/sobmedida.md`](docs/regras/sobmedida.md)**
> (cartões R-SMM, R-SMA, R-SMD, R-SME, R-SMC, R-SMV, R-SMR, R-SMP, R-SMT, R-SMU,
> R-SMS, R-SMB, R-SMX, R-SMQ, R-SMI, R-SMF, R-SML e R-SMK), cada uma com o teste
> que a trava. O porquê longo — as armadilhas **#13, #14, #15, #16, #17 e #34**,
> as fases 1 a 6-C1c, as telas e o corte em etapas — está em
> [`docs/historia/sobmedida.md`](docs/historia/sobmedida.md).

| Cartão | Regra em uma linha |
|---|---|
| R-SMM-01 | Módulo montado no mesmo servidor, dentro de um try/catch — sem segundo servidor |
| R-SMM-02 | Sem cadastro de gente próprio: a liberação é uma área do PCP |
| R-SMM-03 | O backup diário cobre o `tecido.db` |
| R-SMA-01 | A área é SOMBRA: chave, setor e linha no `PERM_AREA` andam juntos (#13) |
| R-SMA-02 | `sobmedida.cadastrar` é `supervisor`, nunca `admin` (#34) |
| R-SMA-03 | A área `admin` do PCP não abre o sob medida; diretor é só o Admin Geral e o setor de cadastros |
| R-SMD-01 | O contexto é por tela, e a paleta é a mesma do PCP |
| R-SME-01 | A bancada cria largura e endereço, e o cadastro nasce marcado para conferir (#14) |
| R-SME-02 | Cada nível guarda um rolo só |
| R-SME-03 | Não há emenda; a peça larga demais vira `falta_bobina` |
| R-SME-04 | Não há ourela |
| R-SMC-01 | O preço do rolo é congelado na compra; não há tabela de preço (#15) |
| R-SMC-02 | Custo sem preço é piso; sem `custo.ver` o valor não viaja |
| R-SMC-03 | A média não divide por janela maior que a história (#16) |
| R-SMC-04 | O gerencial é tecido × bobina, e a cobertura só olha o que gira (#17) |
| R-SMV-01 | `persiana.js` é o dono único de "o que esta persiana é" |
| R-SMV-02 | Milímetro e centavo inteiros por dentro; a porta é o `unidade.js` |
| R-SMV-03 | Consumo e corte nunca se misturam (a #18 no sob medida) |
| R-SMV-04 | A coleção aponta para o cadastro de tecido; o modelo não guarda linha |
| R-SMV-05 | O tubo sai da escada; aviso e recusa dizem por quê |
| R-SMR-01 | Preço da revenda em cascata, arredondado uma vez; o subtotal Deccorar não se mexe |
| R-SMR-02 | Tabela sem percentual é recusa nomeada, e nasce vazia, não zero |
| R-SMR-03 | O prazo é conta do `prazo.js`, pela hora do ENVIO |
| R-SMR-04 | O vendedor tem área própria; `sobmedida.vender` é `operacao` |
| R-SMR-05 | O vendedor é gente do PCP; a porta de pessoas só passa id e nome |
| R-SMR-06 | Dinheiro se chama `preco_*` ou `valor_*` (a poda é por nome) |
| R-SMP-01 | Congelado é congelado: preço no envio, ficha na aprovação |
| R-SMP-02 | Aprovado não se altera; corrige-se cancelando a peça |
| R-SMP-03 | O número nasce no envio, nunca volta ao bolo e nunca desce |
| R-SMP-04 | A cor é obrigatória no pedido; o `tecido_id` é gravado |
| R-SMP-05 | "Sem tecido" é sinal, nunca trava |
| R-SMP-06 | O total é a soma das peças de pé, arredondadas na peça |
| R-SMP-07 | Rascunho não vira papel; o PDF higieniza o texto |
| R-SMP-08 | Aprovar é duas chaves; a fila conta dias de fábrica |
| R-SMT-01 | O código da etiqueta é da peça e nasce na aprovação |
| R-SMT-02 | Um contador por setor, num `UPDATE … RETURNING`; número não volta |
| R-SMT-03 | A etiqueta escreve a medida de CORTE; no tubo, o nome é o degrau |
| R-SMT-04 | Reimprimir sai com o mesmo código; o aviso vem antes do botão |
| R-SMT-05 | `etiqueta_producao.imprimir` não é `etiqueta_producao.ler` |
| R-SMT-06 | Um desenho de papel só; o CODE128 é o `public/barras.js` |
| R-SMU-01 | O comprometido de tecido é conta do `consumo.js`, e lê o CONSUMO |
| R-SMU-02 | O comprometido baixa no corte confirmado, peça a peça |
| R-SMU-03 | Não se reparte entre bobinas; tecido sem rolo aparece com traço |
| R-SMU-04 | O "sem tecido" do envio é foto; o aviso ao vendedor é de hoje |
| R-SMU-05 | O tecido fica no sob medida; o tubo vai ao Compras do PCP, e é um só |
| R-SMU-06 | A peça sai da conta de compra quando a etiqueta do tubo é impressa |
| R-SMU-07 | O tubo se aponta no degrau; quem converte é a unidade do PCP |
| R-SMU-08 | O que falta vira pendência, nunca zero, e a lista não cala |
| R-SMS-01 | Cinco chaves de setor, `operacao`, e os setores nascem vazios |
| R-SMS-02 | Setor é cadastro, chave é código |
| R-SMS-03 | Papel e setores são duas contas; a bancada vem do setor |
| R-SMB-01 | As liberações são dado; só segura quem existe e gera etiqueta |
| R-SMB-02 | O pronto é `pronto_em`, e o `marco` não muda |
| R-SMB-03 | Um bipe inicia, o outro termina; o kit é o do tipo certo |
| R-SMB-04 | O bipe não liberado responde o que segura, com o nome do setor |
| R-SMB-05 | A pendência se fecha com `producao.pendencia` e com motivo |
| R-SMX-01 | O motivo aponta o componente; volta o culpado e o que depende dele |
| R-SMX-02 | Só se recusa trabalho anterior que existe e já terminou |
| R-SMX-03 | `refeitas` conta a peça física; a `sm_recusa` guarda o retrato |
| R-SMX-04 | A refeita reimprime por código, com a marca vermelha |
| R-SMX-05 | O cadastro de motivos nasce cheio, e não se mistura com o do corte |
| R-SMQ-01 | A etapa é derivada, nunca gravada, e o quadro só lê |
| R-SMQ-02 | As colunas são livres, as etapas não |
| R-SMQ-03 | Pedido não some do quadro; etapa sem pedido não vira aviso |
| R-SMQ-04 | A barrinha não conta kit nem cancelada, e não existe antes da aprovação |
| R-SMQ-05 | O quadro é `painel.ler`; cartão sem valor não vale `R$ 0,00` |
| R-SMI-01 | A régua do bipe suspeito é uma só, e o limite é cadastro |
| R-SMI-02 | Número incompleto não vira número certo |
| R-SMI-03 | O tempo por m² usa o m² real, nunca o cobrado |
| R-SMI-04 | Prazo cumprido são dois números; sem pedido pronto, sem porcentagem |
| R-SMI-05 | A recusa conta no setor do culpado |
| R-SMI-06 | A aprovação é mediana, em tempo corrido, com o maior ao lado |
| R-SMI-07 | O vazio diz qual é, e a janela vai escrita |
| R-SMF-01 | O disponível é limite menos boletos em aberto, e mostra sem travar |
| R-SMF-02 | Negativo fica negativo; sem limite o disponível é `null` |
| R-SMF-03 | O título é lançado à mão; vencido fica na conta, pago e cancelado saem |
| R-SMF-04 | A baixa e o cancelamento têm rastro e caminho de volta |
| R-SMF-05 | "Aprovado sem boleto" é só de quem paga em boleto, e fica fora do disponível |
| R-SMF-06 | O boleto aponta os pedidos numa tabela de vínculo; sem pedido é avulso |
| R-SMF-07 | O título maior que os pedidos avisa quanto, e nunca trava |
| R-SMF-08 | Titulado é quando os títulos alcançam o valor; rateio proporcional |
| R-SMF-09 | O que falta titular aparece ao lado do em aberto, nunca dentro |
| R-SMF-10 | A tela lista o que marcar pelo mesmo critério; quem lê é `boleto.ler` |
| R-SMF-11 | NF e entrega não existem, por decisão |
| R-SML-01 | Dinheiro com ponto do milhar, pelo dono único de cada lado do fio |
| R-SML-02 | O que se lê e o que pré-preenche campo são duas funções |
| R-SML-03 | Toda tabela rola dentro do `rolaH`; a página nunca rola de lado |
| R-SMK-01 | O estoque só anda no Corte feito, e baixa o que está gravado |
| R-SMK-02 | A reserva é a faixa de um corte aberto, sem tabela própria |
| R-SMK-03 | Um corte aberto por operador; mexe quem o abriu |
| R-SMK-04 | A sobra nascida mora em `sobra_a_guardar` até ser guardada |
| R-SMK-05 | Durante o corte o operador muda o plano sozinho, com motivo |
| R-SMK-06 | Depois do Corte feito corrige-se pedindo; quem pediu não aprova |
| R-SMK-07 | O tom é pela origem; o pedido dividido entre origens se confere |
| R-SMK-08 | Toda linha diz para quem é; o tempo por m² é das peças |
| R-SMK-09 | A etiqueta da sobra se lê pela foto; só vale o que fecha o dígito |
| R-SMK-10 | Vence a sobra de menos refugo, e a que não entrou diz por quê |
| R-SMK-11 | O histórico do corte acha pela sobra e diz o que foi baixado |

**Ao mexer em** acesso, área ou nível de chave: `node teste_acesso.js`, `node
teste_cobertura.js` e `cd tecido && npm test` (`acesso.test.js`). Em endereço,
largura ou na lista Conferir: `bancada.test.js` e `endereco_unico.test.js`. Em
custo, giro ou gerencial: `custo.test.js`, `giro.test.js` e `gerencial.test.js`.
No plano: `falta_bobina.test.js`. No `persiana.js` ou no catálogo:
`persiana.test.js` e `catalogo_sm.test.js`. Em revenda, preço ou prazo:
`revenda.test.js` e `prazo.test.js`. No pedido: `pedido.test.js`. Na etiqueta de
produção: `etiqueta_producao.test.js`. Em papel e chave do módulo:
`acesso_operador.test.js`. No comprometido: `consumo.test.js`. No material de
compra: `material_compra.test.js` e `node teste_compras_sobmedida.js`. Na bancada:
`producao.test.js`. Na recusa: `recusa.test.js`. No quadro: `kanban.test.js`. Nos
indicadores: `indicadores.test.js`. Nos setores: também `node teste_acesso.js`.
No boleto e no crédito: `boleto.test.js`. No dinheiro de tela: `dinheiro_tela.test.js`.
Em tabela de tela: `rola_tela.test.js`. No corte: `corte_etapas.test.js`,
`corte_correcao.test.js`, `historico_corte.test.js`, `tom.test.js`,
`tempo_corte.test.js`, `plano_claro.test.js` e `barras_ler.test.js`. Todos os
`*.test.js` rodam pelo `cd tecido && npm test`.

### Teste obrigatório

```bash
cd tecido && npm test          # 742 casos
```

E o teste de segurança da §10, agora incluindo os caminhos novos:

```bash
for r in / /admin /operador /setor /sobmedida /sobmedida/corte \
         /sobmedida/cadastros /sobmedida/telas/corte.html /api/skus /sobmedida/api/eu; do
  printf "%-30s " "$r"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010$r
done
```

Telas `302`, API `401`, `/login` `200`. E `/sobmedida/telas/corte.html` tem que
dar **403 mesmo para o diretor logado** — se der `200`, o `express.static` do
módulo furou o portão, que é a armadilha #3 por outra porta.

---

## 20. Navegação e linguagem — as duas regras de toda tela (02/10/2026)

Spec `docs/arquivo/NAVEGACAO-E-LINGUAGEM.md` (arquivada), decidida pelo Lucas em 02/10/2026,
com as duas linhas em `docs/DECISOES.md`.

### Regra A — toda tela interna tem a troca de operação

No **canto superior direito** de toda tela interna das duas operações, com o
mesmo lugar e o mesmo visual:

| Botão | Aparece para | Leva a |
|---|---|---|
| **Trocar setor** | todo mundo | `/setor` |
| **Sob medida →** (na medida padrão) | só quem alcança as duas operações | `/sobmedida` |
| **Medida padrão →** (no sob medida) | idem | a **primeira tela da medida padrão que a pessoa alcança** |

Ficam fora: o `/login`, a própria `/setor` e o portal da revenda (quando
existir). **Tela nova usa o `nav.js` da sua operação** (`/nav.js` no PCP,
`/sobmedida/nav.js` no módulo) e com isso já nasce com o botão.

> ⚠️ **ESCONDER O BOTÃO NÃO É SEGURANÇA.** Quem tranca continua sendo o
> `auth.js` e o portão do `tecido/montar.js`. O botão só evita mostrar um
> caminho que dá "sem permissão".

> ⚠️ **`destino.js` É O DONO ÚNICO DE "PARA ONDE A PESSOA VAI"**, e o
> `/api/auth/eu` e a resposta do login o devolvem em `destino` (`padrao`,
> `sobmedida`, `duas`, `inicial`). O login, a `/setor` e as duas barras leem
> dali. **A lista existia em duas cópias e elas já tinham divergido**: a do
> `login.html` só reconhecia `sobmedida` e `sobmedida_adm` como sob medida, e
> quem tinha só a área de **vendedor** ou de um dos **cinco setores da
> produção** voltava ao login depois de digitar o PIN. Tela nova da medida
> padrão entra na lista `PADRAO` de lá.

> ⚠️ **O "← Medida padrão" DO RODAPÉ DO SOB MEDIDA SAIU.** Ele apontava para
> `/`, que é o admin, e quem não tinha admin caía em "sem permissão".

### Regra B — o texto não nomeia hierarquia

Em texto que **quem usa o sistema vê** — tela, botão, selo, erro, ajuda, nome
de permissão e o que os scripts escrevem no terminal — não entram **chefia,
chefe, patrão, dono, gestão**. O texto **nomeia a etapa** (*Enviar para
aprovação · Aguardando aprovação · Pendente de conferência*); quando precisa
nomear alguém, usa o **nível de acesso** (Operação, Supervisor, Admin, Admin
Geral) ou a **permissão** (*quem tem permissão para gerir cortes*).

> **Por quê:** quem aprova é decidido pela permissão, não pelo cargo. "Enviar
> para o admin" passa a mentir no dia em que a permissão vai para um
> Supervisor.

Ficam fora: comentário de código, este arquivo, `docs/` e o termo técnico
**"dono único"**.

> ⚠️ **TROCAR O TEXTO DE UMA PERMISSÃO É SÓ O `nome`, NUNCA A CHAVE.** A chave
> `sobra.propor` continua igual e o rótulo virou *"Propor correção de sobra"*:
> mudar a chave tiraria a permissão de quem já a tem, em silêncio (armadilha
> #13, §19).

> ⚠️ **TRÊS COISAS COM A PALAVRA FICAM, E O TESTE AS NOMEIA:** o valor gravado
> `origem='gestao'` em `lote_item` (é dado, não aparece em tela nenhuma) e os
> nomes das migrações 8, 13 e 21 do `tecido.db` (história do banco, já
> aplicada). As duas saídas de passivo já gravadas (#1 e #3) também ficam como
> estão; o que mudou foi o texto de uma rodada futura do script.

### O teste que segura as duas — `teste_linguagem.js` (13 casos)

Ele lê **o texto que pode chegar à tela** pelo `texto_visivel.js`: literais de
texto dos `.js`, texto e `<script>` dos `.html`, e deixa de fora comentário,
`<style>`, expressão regular e o comentário `/* */` do SQL dentro de template.
E confere que toda tela interna carrega o `nav.js` **da sua operação**.

> ⚠️ **O LEITOR TEM QUE SABER O QUE É REGEX, E O PRIMEIRO NÃO SABIA.** A
> varredura improvisada da fase 2 tratava a aspa de `/'/g` como começo de
> string e passava a ler comentário como texto — acusou dez comentários. Os
> seis primeiros casos travam o leitor (comentário, regex, divisão, HTML, SQL
> e "dono único") antes de confiar no que ele acha.

> ⚠️ **AS EXCEÇÕES SÃO NOMEADAS, E A ZUMBI REPROVA.** Cada uma tem arquivo,
> trecho e motivo; exceção que deixou de existir no código reprova o caso.
> Lista de exceção que só cresce é onde o texto proibido entra sem ninguém ver.

**Rode `node teste_linguagem.js` e `node teste_destino.js` ao criar tela, mexer
em texto de tela, mensagem de erro, nome de permissão, nas barras ou no
login.** Cinco defeitos foram reintroduzidos um a um e cada um reprova o seu
caso: texto de tela de volta, mensagem de domínio, nome de permissão, tela sem
barra e tela com a barra da outra operação. Um comentário com a palavra
**passa**, como deve.

> ✅ **AS QUATRO FASES ESTÃO NO AR DESDE 02/10/2026** — o botão pelo PR #169,
> os textos, o teste e este papel pelo #173 —, e o dono disse *"deu bom"* nas
> duas vezes. A spec foi para `docs/arquivo/`.
>
> ⚠️ **O QUE NÃO FOI RELATADO UM A UM:** os três perfis da barra (só medida
> padrão, só sob medida, as duas) e as frases novas dos fluxos de Sobras
> (propor correção) e Corte (pedir correção), que pedem uma sobra e um corte
> feito de verdade para aparecer. Prova que não foi feita se escreve como não
> feita (§4).

### ⚠️ TRÊS LISTAS DE TELAS NO SOB MEDIDA, e a tela nova entra nas três (02/10/2026)

O módulo diz que telas existem em **três** lugares: `tecido/nucleo/telas.js`
(a declaração, com a permissão), as **portas** da tela inicial
(`telas/inicio.html`) e o `NOMES`/`ORDEM` do `tecido/public/nav.js` (o
rodapé). Tela nova que entra só na primeira nasce com dois defeitos, e os dois
estiveram no ar até 02/10/2026:

- **O vendedor abria o sob medida e lia "Seu acesso ainda não alcança nenhuma
  tela"**, com Simulador, Pedidos e Revendas no rodapé da mesma página. A
  inicial tinha só as sete portas do estoque de tecido; as nove telas que
  vieram depois nunca ganharam porta, e quem não tem tela de estoque via a
  tela inicial dizendo que ele não tem acesso a nada.
- **O botão da bancada saía no rodapé escrito `/bancada`**: estava no `ORDEM`
  e não no `NOMES`.

**Rode `cd tecido && npm test` ao criar tela** — o `telas_listas.test.js`
(4 casos) recusa tela declarada sem porta na inicial ou sem nome no rodapé, e
porta que aponta para tela que não existe. Os dois defeitos foram
reintroduzidos, e cada um reprova o seu caso.

> ✅ **NO AR E CONFERIDO EM 02/10/2026** (PR #176). O dono fez o deploy e
> conferiu as duas telas: o vendedor passou a ver as portas dele na tela
> inicial do sob medida, e o rodapé mostra **Bancada**. O teste da §10 passou
> depois do deploy (telas 302, API 401, `/login` 200).
>
> ⚠️ **O `pm2 restart` NÃO PEGOU NESTE DEPLOY**: o `curl` do `/login` deu
> `000`, e o servidor só voltou com `pm2 delete expedicao && pm2 start
> server.js --name expedicao`. É a armadilha do §12 acontecendo de verdade —
> por isso o deploy do §13 passa a usar o par.

> ⚠️ **O CARTÃO "O CAMINHO DE UMA PEÇA" SÓ APARECE A QUEM CORTA TECIDO**
> (02/10/2026, PR #178). Ele descreve rolo → plano de corte → sobra →
> etiqueta, e aparecia também para o vendedor, que não faz esse trabalho.
> Hoje ele aparece só para quem alcança `/corte`, `/rolos`, `/sobras` ou
> `/etiquetas` (`ESTOQUE_TECIDO`, na `inicio.html`), e nasce escondido para não
> piscar antes do `/api/eu`. Ajuda que fala do trabalho de outra pessoa é
> texto que se aprende a não ler. ✅ No ar e conferido pelo dono no mesmo dia.

