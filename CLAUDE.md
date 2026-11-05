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

🔐 ALÇADA
Telas novas: nº · nome · módulo · nível        (ou "nenhuma")
Ações novas: chave · nível · tela · sensível?   (ou "nenhuma")
Setores novos: nome · nível                     (ou "nenhum")
Quem recebe: só o Admin Geral, até o dono marcar
```

> ⚠️ **O BLOCO 🔐 ALÇADA NUNCA SOME** (R-ALC-07, spec `ACESSO-POR-TELA-E-NIVEL`,
> decisão do dono em 04/11/2026: *"tudo que for novo no sistema, a partir de
> hoje, tem que ser revisado e entrar no controle de alçadas"*). Tarefa sem nada
> novo escreve "nenhuma / nenhum" — o bloco vazio é a prova de que alguém olhou.

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
Alçada conferida: telas, ações e setores novos com nível e lugar · só o Admin Geral recebe  |  nada novo
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
| Caixa **separada como venda cancelada** na Conferência (etiqueta + SKU de cada persiana) | **NENHUM** desde 03/11/2026 — a caixa só fica separada | nenhuma |
| Venda cancelada **confirmada** por outra pessoa (`cancelamento.confirmar`) | **+1 por peça**, se a caixa já tinha baixado; senão só solta a reserva | `sobra` · `lote:<id>`, **uma por SKU** |
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
teste_baixa_conferencia.js` também. **Na venda cancelada da Conferência ou na
devolução:** `node teste_sobra.js` e `node teste_conferencia_expedicao.js`.

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
>   sobrou na fábrica volta pelo **✕ Venda cancelada** da Conferência (até
>   03/11/2026, "↩ Sobrou"): bipa a etiqueta e o SKU de **cada** persiana,
>   escolhe o motivo, e a caixa fica **separada**. **Desde 03/11/2026 são duas
>   pessoas** (CONFERENCIA-EXPEDICAO fase 4): o saldo só volta +1 por peça
>   **quando outra pessoa, com `cancelamento.confirmar`, confirma no ML** — e só
>   **se já tinha baixado** (`baixa_dominio.devolver`, dono único). Quem conferiu a
>   caixa não a separa (D8); quem separou não confirma nem recusa. Cartões R-REC-01 a R-REC-07 em
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
| `embalado` (etiqueta impressa) | `cancelado` e vai para o card **Canceladas depois da etiqueta** (Admin → Pendências). **O estoque não volta sozinho** |
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
| R-REV-07 | Bipe de fim abaixo de 15 s (`config.rev_minimo_seg`) é recusado, e a revisão continua |
| R-REV-08 | "Cancelar revisão" zera a revisão em andamento — não é "Peça com problema" |
| R-REV-09 | "Desfazer última": só a própria, só do dia, só antes de embalar, uma vez |
| R-EMB-01 | Sem o bipe do kit a embalagem não fecha — a trava é do servidor (#26) |
| R-EMB-02 | Embalar não exige a peça estar na fila (não é defeito) |
| R-EMB-03 | Só a embalagem de fila "hoje" abate a ordem do dia |
| R-EMB-04 | SKU sem cadastro não embala; as quatro escritas são uma transação |
| R-EMB-05 | A conferência da peça é no bipe 1 da embalagem (`pecaTexto`) |
| R-EMB-06 | Em modo teste a embalagem consome fila de teste |
| R-EMB-07 | Limpar a fila apaga só o que espera |
| R-EMB-08 | A revisão e a embalagem gravam quem fez (`usuario_id`, `usuario_nome`) |
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

> ⚠️ **A REVISÃO RECUSA O BIPE RÁPIDO, CANCELA E DESFAZ (04/11/2026)** — fase 1
> da spec `QUEM-FEZ-E-REVISAO`, cartões R-REV-07 a R-REV-09. O bipe duplo
> acidental gravava revisão de 1 s e mandava para a embalagem peça que ninguém
> revisou. Três coisas parecem bug e não são:
>
> - **A revisão desfeita é APAGADA**, junto com a linha da `fila` dela
>   (`fila.revisao_id`). Não há coluna `desfeita`: a revisão é contada em cinco
>   lugares, e o que esquecesse o filtro voltaria a contar. O rastro inteiro está
>   em `revisao_evento` (`rapido_demais`, `cancelada`, `desfeita`), com quem fez.
> - **Depois de desfazer, o botão some** até a próxima revisão fechar. A anterior
>   não se desfaz: uma pilha de desfazer vira jeito de apagar o dia.
> - **Revisão sem login é 401.** Quem fez vem do `quem.js` (`quem(req)`), dono
>   único de "quem está fazendo isto": sempre do servidor, nunca da tela. As
>   outras rotas passam a usá-lo fase a fase (spec, fases 2 a 7).
>
> As três rotas novas (`/api/revisao/cancelar`, `/desfazer`, `/ultima`) têm linha
> própria no `permDaRota()` (`revisao.executar`); sem ela cairiam no
> `pre('/api/revisao')` das leituras, que aceita o admin. O `GET
> /api/revisao/hoje` saiu do `server.js` para o `revisao_route.js`, sem mudar o
> SQL. **A embalagem entrou na mesma regra (fase 2):** `POST /api/montagem` lê
> quem fez pelo `quem.js` e, sem login, é 401 antes de olhar SKU e kit — nada
> grava, nem o +1 do livro (`teste_montagem.js`, 6-C; sem o 401, reprova 7).
> **A Etiqueta de Venda também (fase 3, 05/11/2026):** imprimir, reimprimir e
> bipar a persiana da caixa são 401 sem login; o id entra ao lado do nome, e cada
> reimpressão é uma linha em `lote_reimpressao` (cartão R-QUEM-01).
> **A Conferência, a saída do caminhão e a viagem também (fase 4):** toda
> escrita é 401 sem login, o id entra ao lado de cada nome, e "a mesma pessoa"
> (R-SEG-01, D8, "sem segunda pessoa") é o `quem.js → mesmaPessoa`: pelo id
> quando os dois lados o têm, pelo nome só na caixa de antes (linha em
> `docs/DECISOES.md`). `node teste_quem_carregamento.js` (56).
> **A Devolução, a contagem de material e o Inventário também (fase 5):** toda
> escrita é 401 sem login, e o id entra ao lado do nome — quem recebeu a peça,
> quem lançou e quem encerrou o caso, **todo** evento do caso, a coleta, o
> anexo, quem contou e quem aprovou o material (§9, §9-B, §18). `node
> teste_quem_devolucao_contagem.js` (84).
> **`node teste_revisao.js` (120)**: dez defeitos foram reintroduzidos um a
> um — a barreira desligada (reprova 13), sem "só a própria" (1), a pilha de
> desfazer (4), sem "só do dia" (1), desfazer embalada (2), desfazer em modo
> teste a de verdade (1), `revisao_evento` fora de `TABELAS` (3), sem a linha no
> `permDaRota` (3), sem login gravando (9) e a fila sem `revisao_id` (17).

> ⚠️ **A FILA DA EMBALAGEM FOI ACERTADA PELA MESA DO FIM DO DIA 04/11/2026**
> (linha em `docs/DECISOES.md`). `node ajustar_fila_embalagem.js` simula, e
> `--aplicar` grava com backup: cada SKU da mesa fica com o contado em
> `aguardando` — a sobra sai pela linha **mais antiga** (a recente é a que está
> na mesa), pela ação "Tirar da fila" da Mesa de correções, com desfazer; a
> falta entra como linha nova de modo `estoque` (não abate a ordem do dia,
> R-EMB-03) —, e **todo o resto da fila sai**. A linha `embalado` e a de teste
> não se tocam (R-EMB-07). **Não mexe em saldo.** `node
> teste_ajustar_fila_embalagem.js` (26).

---

## 5. O cruzamento com o PDF do Mercado Livre

> **As regras desta seção estão em [`docs/regras/expedicao.md`](docs/regras/expedicao.md)**
> (cartões R-PDF, R-VOL, R-CONF, R-URG, R-CAR, R-COR e R-INV), cada uma com o teste que
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
| R-PDF-02 | A venda (ou o pack) que subiu de linha só é aproveitada se ninguém mais a pegou — o pack também quando o item já tem a venda (29/10/2026, NF 8827/8828) |
| R-PDF-03 | O título do anúncio sai da estrutura da folha, não de uma palavra (#24) |
| R-PDF-04 | A nota impressa é a PRIMEIRA folha da NF (#22) |
| R-PDF-05 | NF repetida não é duplicidade: a nota é do pedido |
| R-PDF-06 | O upload recusa Pack ID ou Venda que já existe no histórico inteiro (#5) |
| R-PDF-07 | A venda repetida cujo PDF sumiu volta a ter PDF — e só isso (27/10/2026) |
| R-PDF-08 | A busca do "Já impressos" olha o histórico inteiro; a lista não corta calada (27/10/2026) |
| R-PDF-09 | A venda da folha sem etiqueta fica em Admin → Pendências até o PDF dela chegar ou alguém resolver (NF 8301) |
| R-PDF-10 | O PDF cuja conta não fecha sem explicação fica em Admin → Pendências até uma pessoa resolver, com motivo |
| R-VOL-01 | Uma venda = uma etiqueta = uma persiana; o volume nunca se multiplica (#8) |
| R-VOL-02 | O que vai na caixa é `lote_item`, e conta-se PERSIANA — no servidor e na tela (#23) |
| R-VOL-03 | O irmão do pacote se lê por ausência; sem o PDF fechar, ele RETÉM a caixa em vez de sumir (NF 8196) |
| R-VOL-04 | Só o pacote de vários SKUs fica retido; a caixa de N unidades não |
| R-VOL-05 | Sem o bipe de cada persiana, a caixa de várias não imprime; baixa por peça |
| R-VOL-06 | A caixa de várias aparece antes do bipe, e uma vez só |
| R-VOL-07 | A frase da caixa é uma só (`fita(n)`) |
| R-VOL-08 | O backfill do pacote relê o PDF, e só tem 7 dias |
| R-VOL-09 | A quantidade é lida por três caminhos (quatro na etiqueta nova, pelo número do código de barras no MEL da folha) e a conta do PDF é conferida; qualquer leitura dizendo mais retém |
| R-CONF-01 | Cinco conferências; qualquer uma retém — e só com os dois lados lidos |
| R-CONF-02 | A trava não acusa o inocente; nome se compara pelo `nome.js` (#10) |
| R-CONF-03 | Retém o volume com dúvida, nunca o PDF inteiro |
| R-CONF-04 | A ordem das travas: divergência > pacote > folha > modalidade > SKU |
| R-CONF-05 | Quem retém sabe liberar (Admin → Pendências) |
| R-CONF-06 | A cobertura das conferências é medida na auditoria |
| R-URG-01 | O PDF gera só urgência |
| R-URG-02 | O recálculo é idempotente e não apaga o manual |
| R-CAR-01 | O carregamento não filtra por dia (#9) |
| R-CAR-02 | Só carrega o que passou pela Etiqueta de Venda (#27) |
| R-CAR-03 | O segundo bipe do carregamento, quando ligado, é cego |
| R-COR-01 | A Mesa de correções corrige pela ação, nunca pela linha |
| R-COR-02 | Fantasma é o `pendente` cujo irmão MAIS ANTIGO já andou |
| R-COR-03 | A cancelada depois da etiqueta: a Mesa só registra a que não voltou; a volta é o ↩ Sobrou |
| R-COR-04 | Saída de passivo na data do volume; venda futura **e a que vence hoje** não se fecham (corte no máximo ontem, 28/10/2026) |
| R-COR-05 | O terminal e o botão usam a mesma régua (`correcoes.js`) |
| R-COR-06 | A Mesa nunca mexe em saldo |
| R-COR-07 | Conferências antigas fecham em bloco, até uma data que nunca é hoje, sem mexer em saldo, e só a caixa que já baixou |
| R-INV-01 | Problema de expedição chega com três coisas (o que houve, NF ou cliente, o pedaço da folha) e vira caso gravado |

**Ao mexer em** `parse.js`, `folha.js` ou `nome.js`: `node teste_parse.js`. No
upload (`exp_route.js`): `node teste_upload.js`. Na lista "Já impressos"
(`GET /api/impressos`, a busca e a reimpressão): `node teste_impressos.js`. No
`religar_sem_etiqueta.js` (fecha o card de venda sem etiqueta cuja etiqueta
estava no PDF): `node teste_religar_sem_etiqueta.js`. Na
quantidade (`parse.js`, `folha.js`, a retenção do pacote): `node teste_quantidade.js`,
`node teste_etiqueta_envios.js` e `node teste_casos_reais.js` — o caderno de casos reais, que **todo** problema
de expedição alimenta (R-INV-01, `registrar_caso.js`). Na venda da folha sem
etiqueta (`venda_sem_etiqueta`, o card de Bloqueados): `node teste_sem_etiqueta.js`. No PDF cuja conta não fecha (`pdf_conta_aberta`): `node teste_conta_aberta.js`. Nos textos de conflito, no
destravamento ou nas listas da caixa de várias: `node teste_divergencia.js`. Na
Etiqueta de Venda (`etq_route.js`, `embalagem.html`): `node teste_etiqueta.js`.
No cruzamento: `node teste_cruzamento.js`. No `carreg_route.js`: `node
teste_carga.js`. Na Mesa de correções ou nos scripts de passivo: `node
teste_correcao.js`, `teste_correcao2.js`, `teste_correcao3.js` e
`teste_conferencia_antiga.js`. Em permissão:
`node teste_acesso.js` e `node teste_cobertura.js`. E **abra a tela**: a caixa
de várias, o painel "depois" e a Mesa são texto montado.

### ⚠️ O PACK ACIMA DO SKU — a venda com etiqueta que caía em "sem etiqueta" (29/10/2026)

O título longo *"…Tóquio 004 - Cinza **Com Acabamento Branco**"* deixa o
**Pack ID** numa linha acima do `SKU:` e a **Venda** embaixo. A folha lia só
a venda, a etiqueta traz só o pack, e as NF 8827 e 8828 (vendas
2000019201782254 e 2000019201782272) viraram card de "venda na folha sem
etiqueta" com as duas etiquetas dentro do PDF. Regra em R-PDF-02, história em
`docs/historia/expedicao.md`, e o PDF real no caderno
(`casos/2026-10-29-nf-8828.json`), com a conta exigindo **zero** vendas sem
etiqueta — é ele que impede o defeito de voltar.

> ✅ **NO AR EM 29/10/2026** (PR #248). O dono fez o deploy (`/login` 200) e
> rodou `node religar_sem_etiqueta.js`: a simulação e o `--aplicar` acharam os
> **mesmos 2 cards** — #1 → caixa #3815 (NF 8828) e #2 → caixa #3816 (NF 8827)
> —, nenhum ficou aberto, e o backup saiu antes
> (`backups/dados-antes-religar-2026-10-29T11-51-58-639Z.db`).
>
> ⚠️ **ISSO PROVA QUE OS DOIS CARDS ANTIGOS FECHARAM, E NÃO QUE A LEITURA NOVA
> PEGOU COM DADO REAL.** A prova é o **próximo PDF** com um anúncio de título
> longo assim: ele não pode abrir card de venda sem etiqueta. Se abrir, é
> defeito, não silêncio normal — e o PDF vira caso no caderno (R-INV-01).
> Prova que não foi feita se escreve como não feita (§4).

### ⚠️ A ETIQUETA "Etiqueta válida para envíos" — sem "Despachar:", sem rota, sem endereço (04/11/2026)

O ML mandou (NF 9124, venda 2000019290872456) uma etiqueta que traz só o
Pack ID, a frase *"Etiqueta válida para envíos"*, o código de barras, a NF
escrita **"Nota fiscal #9124"** (o pdf.js lê **"fiiscal"**) e o comprador
**debaixo de "Destinatario:"**. A tabela lado a lado está em
`docs/historia/carregamento.md`, e o PDF no caderno
(`casos/2026-11-04-nf-9124.json`).

- **É coleta sozinha** (decisão do dono, R-MOD-01). A marca é a **frase**: sem
  ela, a etiqueta sem "Despachar:" continua retida.
- **A NF e o comprador são lidos do jeito novo** (`nfDaEtiqueta`,
  `nomeDoDestinatario` no `parse.js`). Antes ela entrava sem NF e "(sem
  nome)", e a conferência do comprador parava calada.
- **A forma 6 de ligar etiqueta e folha:** o número do código de barras
  (`484058 80346`) está no MEL da identificação da folha
  (`MEL48405880346FMXDF01`). `folha.js` grava `item.envio`; o `parse.js` usa
  para **achar** o item quando pack e venda não acham, **reter** quando ele
  aponta outro item e **contar as peças** (leitura L5 do R-VOL-09). Nunca solta
  caixa que outra leitura reteve. Na folha antiga ela não vota.

> ✅ **NO AR EM 04/11/2026** (PR #273): o dono fez o deploy e disse *"deu
> tudo certo"*. ⚠️ **AINDA NÃO PROVADO COM DADO REAL:** a próxima etiqueta
> deste formato entrando sozinha como 🟣 Coleta, com NF e comprador, e saindo
> no bipe do SKU. A caixa da NF 9124 subiu antes do conserto e se resolve como
> Coleta em Pendências. Prova que não foi feita se escreve como não feita.
>
> ⚠️ **A FORMA 6 COM DOIS SKUs SÓ FOI PROVADA COM PDF MONTADO À MÃO.** Não
> houve ainda pacote de vários produtos neste formato. A prova é o primeiro:
> ele tem que sair com as N persianas, ou retido dizendo o número. Se sair com
> uma, é defeito — e o PDF vai para o caderno (R-INV-01).

**Rode `node teste_etiqueta_envios.js` (46 casos)** ao mexer na modalidade, na
NF ou no comprador da etiqueta, no MEL da folha ou nas leituras da quantidade.
Sete defeitos foram reintroduzidos um a um: sem a coleta do formato novo
(reprova 5), coleta só pela falta da linha (3), NF só pelo "NF:" (3), sem o
"Destinatario:" (5), o MEL sem achar o item (2), sem reter o conflito (2) e a
L5 sem contar (4).

### ⚠️ A ABA BLOQUEADOS VIROU "PENDÊNCIAS" — a central, fase 1 (27/10/2026)

Spec `docs/arquivo/CENTRAL-DE-PENDENCIAS.md`. O dono: *"essas pendências devemos
concentrar em apenas uma única tela, para não ficar o problema espalhado"*. No
topo da aba (antiga Bloqueados) fica o **número** de cada lugar onde uma pessoa
tem algo a decidir — Bloqueados, Correções, ajuste de saldo, inventário
(aprovar e recontar), contagem de material, SKU incompleto, sobras da
Conferência e devoluções —, há quantos dias espera e quem resolve, com o
caminho para a tela dona. A aba "Pendências de SKU" passou a se chamar **"SKU
incompleto"**, para não haver duas "Pendências".

> ⚠️ **A CENTRAL NÃO TEM CONTA PRÓPRIA.** `pendencias_dominio.js` pergunta à
> função da tela dona (`correcoes.contadores`, `ajuste_dominio.contarPendentes`,
> `inventario_dominio.pendencias`, `cont_route.pendentes`,
> `sku_route.pendencias`, `carreg_route.sobrasEsperando`, `dev_route.pendentes`),
> a mesma que a tela usa. Uma conta copiada diverge no primeiro ajuste (#12), e
> o teste recusa SQL no domínio da central.
>
> ⚠️ **SÓ NÚMERO, PARA TODO MUNDO QUE ABRE A ABA.** Quem não pode resolver uma
> linha vê o número e o nome da permissão de quem pode; nenhum SKU, cliente ou
> saldo viaja (`GET /api/pendencias/resumo`, `@admin`). Linha zerada fica à
> vista, em cinza. Linha que não conseguiu contar diz isso, e não vira zero.
>
> ⚠️ **A CANCELADA NA FÁBRICA ESTÁ EM DUAS LINHAS, e é certo**: volta pelo ↩
> Sobrou da Conferência, ou a Mesa registra a que não voltou. O total a conta
> uma vez, e a tela diz quantas estão nas duas.
>
> ⚠️ **O PRIMEIRO PAINEL NASCEU COM UM ID QUE JÁ ERA DA ABA DE SKU**
> (`pendResumo`): a central escrevia por cima do resumo de lá e ficava em
> "carregando…". Só apareceu abrindo a tela; o teste agora recusa id repetido
> na marcação do admin.

**Rode `node teste_pendencias.js` (65 casos) ao mexer no `pendencias_dominio.js`
ou em qualquer função de tela dona que ele chama.** Cinco defeitos foram
reintroduzidos um a um: a conta copiada (reprova 6), sem descontar a repetida
(1), o ponteiro interno viajando (1), o erro virando zero (3) e a recontagem de
ciclo fechado contando (2).

> ✅ **A FASE 1 ESTÁ NO AR E CONFERIDA COM DADO REAL EM 27/10/2026** (PR #238):
> o dono fez o deploy, abriu a aba e disse que os números batem com os de cada
> tela.

**Fase 2 (27/10/2026) — duas coisas:**

- **O PDF cuja conta não fecha vira pendência gravada** (R-PDF-10,
  `pdf_conta_aberta`). O aviso do upload sumia quando a tela fechava. Agora o
  card fica em Pendências até uma pessoa resolver: *conferi, o sistema está
  certo* ou *corrigi o que faltava*, com motivo. O sistema não julga.
- **O passivo da Mesa de correções é desenhado na aba Pendências** (card
  "Correções da operação"). A **decisão continua na aba Correções** — prévia,
  motivo, desfazer —, e clicar num volume ou num "em bloco" leva até lá
  (`corIrMesa`). A aba Correções ficou com a busca, o painel e o histórico. Uma
  porta só para decidir.

> ⚠️ **AS SOBRAS NÃO VIERAM PARA A CENTRAL, e a spec dizia que viriam.** O ↩
> Sobrou exige bipar a etiqueta e o SKU de cada persiana, com a caixa na mão,
> na Conferência. Decidir pelo Admin quebraria a conferência física; fica a
> linha com o caminho, da fase 1.
>
> ⚠️ **O PDF SE RECONHECE PELAS VENDAS, E NÃO PELOS BYTES.** O mesmo PDF
> montado de novo traz outra data de criação dentro, e a impressão digital do
> arquivo abria uma segunda linha. O teste espera um segundo e sobe de novo.
>
> ⚠️ **O CARD DE CONTA NÃO SE REDESENHA COM MOTIVO DIGITADO.** A aba se
> atualiza a cada 30 s, e o redesenho apagava o campo (§12). **O card da venda
> sem etiqueta tinha esse defeito desde a fase 1-B, e foi consertado em
> 27/10/2026** com a mesma guarda (`teste_sem_etiqueta.js`, caso 33).
>
> ✅ **A FASE 2 ESTÁ NO AR E CONFERIDA EM 27/10/2026** (PR #239): o dono fez o
> deploy e conferiu a Mesa dentro da aba e o clique levando à aba Correções.
> ⚠️ O card do PDF cuja conta não fecha **ainda não apareceu com dado real**:
> a prova é o primeiro PDF assim.

**Fase 3 (27/10/2026) — a bancada e a TV veem o número.** Quem opera a
Etiqueta de Venda e a Conferência não abre o admin. Agora:

- ~~**Uma linha nas duas telas da bancada**~~ — **desde 03/11/2026 só na
  Etiqueta de Venda**: a linha saiu da Conferência (CONFERENCIA-EXPEDICAO fase
  1, decisão do dono — ela é do Admin, não de quem confere). A permissão
  `carregamento.executar` no `GET /api/pendencias/total` ficou, sem uso. Sem botão: quantas pendências
  esperam decisão em Admin → Pendências, há quantos dias a mais antiga, e
  quantas vendas da folha estão sem etiqueta (podem atrasar no ML). A frase é
  uma só, no `public/pendencias_aviso.js`. Na Etiqueta de Venda ela substituiu
  a linha da venda sem etiqueta — uma linha, e não duas.
- **Na TV**, o quadro **Pendências**, vermelho quando alguma espera há mais de
  um dia.
- `GET /api/pendencias/total` devolve **três números** (`total`, `dias`,
  `sem_etiqueta`) a quem tem `etiqueta.emitir`, `carregamento.executar`,
  `painel.ver` ou `@admin`. Nenhum SKU, cliente ou detalhe.

> ⚠️ **A LINHA "BLOQUEADOS" SAIU DA TELA E FOI PARA O SERVIDOR**
> (`exp_route.bloqueados`): os volumes retidos, a venda sem etiqueta e o PDF
> cuja conta não fecha. Até a fase 2 a aba somava os seis cards sozinha; com a
> bancada e a TV lendo o total, uma soma na tela seria a segunda régua (#12). O
> teste confere que o servidor dá o mesmo número que os seis cards.
>
> ⚠️ **A LINHA DA CONFERÊNCIA FICA FORA DO REDESENHO DE 4 s.** Ela se atualiza
> sozinha a cada 60 s; dentro do `carregar()` ela pediria a central inteira 15
> vezes por minuto por tablet, e o redesenho é o que apaga campo digitado (§12).
>
> ✅ **A FASE 3 ESTÁ NO AR E CONFERIDA EM 27/10/2026** (PR #240): o dono
> conferiu a linha nas duas telas da bancada, o quadro da TV com o mesmo número
> da aba, a linha num tablet de quem **não** é admin (a permissão nova pegando)
> e o motivo que não some do card da venda sem etiqueta. A spec foi para
> `docs/arquivo/`; o sob medida e o aviso por WhatsApp ou e-mail ficaram para
> depois, por decisão do dono.

**Rode `node teste_pendencias.js` (65) ao mexer na fase 3.** Quatro defeitos
reintroduzidos: Bloqueados sem a venda sem etiqueta (reprova 2), sem o PDF
aberto (2), a bancada recebendo o resumo inteiro (1) e o total só para o admin
(1).

**Rode `node teste_conta_aberta.js` (42 casos) ao mexer na conta aberta, no card
ou na Mesa dentro da aba.** Cinco defeitos foram reintroduzidos: a impressão
digital pelos bytes (reprova 8), gravar a diferença já explicada (5), resolver
sem motivo (4), o resolvido reabrindo (2) e a tabela fora do modo teste (1).

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

### ⚠️ OS HORÁRIOS DE SAÍDA SÃO DA DATA, E O PDF DIZ A SAÍDA (05/11/2026)

Spec `docs/specs/HORARIOS-DE-COLETA.md` (fases 1 e 2), linha em
`docs/DECISOES.md`, cartões **R-HCO-01 a R-HCO-10** em
[`docs/regras/carregamento.md`](docs/regras/carregamento.md). O ML muda o horário
**durante a semana**, e 99% das vendas são de coleta — que não tinha hora.

- `coleta_horario.js` é o **dono único**: `saida_horario` (até 3 coletas por
  data, com janela e corte, e a agência), `saida_dia` ("hoje não tem coleta") e
  `saida_horario_evento` (o antes, o depois, quem e por onde).
- **Tela 206 Horários de coleta** (`/coleta-horarios`): a semana atual e a
  próxima, de segunda a sábado; o dia passado é só registro.
- **No upload** — que desde 05/11/2026 é **só na 103 Lançar produção** (bloco
  abaixo) —, o quadro *"Para qual saída são estas
  vendas?"* (`public/saida_upload.js`) grava o horário mudado (origem `upload`)
  e manda a saída; a venda nova de **hoje** e da **mesma modalidade** ganha
  `lote.horario_id`. Sem escolha, passa (D1) e fica "sem coleta marcada".
- **A faixa da próxima coleta** (`nav.js`, `GET /api/saidas/status`) conta até o
  **início** da janela e diz as caixas por imprimir e por conferir **daquela**
  coleta: nas telas 201, 202, 103 e 206 para todos, e em qualquer tela para nível
  Supervisor ou acima (`@supervisor` no `permDaRota`, D5).
- **A agência** usa o horário lançado do dia (`despacho_origem:'lancado'`) e,
  sem ele, o `despacho_<dia>` de sempre.

> ⚠️ **A MODALIDADE CONTINUA SENDO A DA ETIQUETA** (R-MOD-01 não mudou). Num PDF
> subido como "Coleta", a caixa com etiqueta de agência **não** ganha a coleta —
> a resposta conta e a tela avisa —, e a de outro dia também não: vai em outro
> caminhão.
>
> ⚠️ **CORTE AUSENTE NÃO É CORTE VAZIO.** O upload não manda o corte (o Envios de
> hoje não o mostra); se a janela mudou, o corte gravado fica **"a conferir"** em
> âmbar, até alguém lançar na 206. Vazio de propósito (na 206) apaga.
>
> ⚠️ **A COLETA CORRIGIDA MANTÉM O ID** — é o que mantém as caixas ligadas a ela.
> A coleta tirada fica com `removido_em`, e as caixas dela passam a "sem coleta
> marcada". Nada trava.
>
> ⚠️ **`coleta.horario` NASCE SÓ PARA O ADMIN GERAL** (R-ALC-06): até o dono a
> dar ao setor de quem sobe o PDF, o quadro não aparece para ninguém mais, e o
> upload segue como antes. Mandar a saída sem a chave é ignorado **dizendo**.

**Rode `node teste_horario_coleta.js` ao mexer no `coleta_horario.js`, na rota,
no upload (a saída), no `st_route.js` ou na faixa.**

### ⚠️ SUBIR O PDF É NUM LUGAR SÓ: A 103 (05/11/2026)

Decisão do dono (D1 (a) e D2, linha em `docs/DECISOES.md`). Até aqui o PDF subia
por três portas — a 201 Etiqueta de Venda, a 203 Subir PDF e a 103 —, e o quadro
da saída teria de ser conferido em três lugares.

- **A 103 Lançar produção é o lugar único.** Ela abre com `producao.lancar`
  **ou** `pdf.subir`, e por isso passou a ser de **nível Operação**; herdou da
  203 a área de chegada `expedicao` e o lugar dela na ordem de chegada. Quem só
  tem `pdf.subir` vê o bloco de upload; a lista "Lançar para produção" continua
  escondida (data-perm `producao.lancar`), e o cruzamento (`@admin`) fica vazio.
- **A 203 SAIU do mapa**, e o número fica vago para sempre (R-TEL-02). O
  endereço `/expedicao` (favorito, ícone de tablet) só **redireciona** para a
  103 (`@logado` no `permDaRota`; quem julga é o portão da 103).
- **A caixa "Subir PDF" da 201 saiu.** A rota e o que o upload faz não mudaram.

> ⚠️ **O NOME "LANÇAR PRODUÇÃO" FICOU**, mesmo para quem só sobe PDF. A lista de
> lançar produção à mão vai sair por decisão do dono, como `REGRA` com spec (a
> produção passaria a nascer só do PDF e da tela azul) — e o nome muda junto.
>
> ⚠️ **O RETRATO DE ANTES NÃO FOI REGRAVADO.** O `perfis_acesso.js` tira o
> `/expedicao` da comparação pelo nome, e o `teste_mapa.js` confere, pessoa a
> pessoa, que **quem abria a 203 abre a 103**.

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
| Prazo | hora de despacho lançada do dia, ou a do `config` | a janela da coleta lançada do dia (desde 05/11/2026, §8) |
| `lote.modalidade` | `'agencia'` (ou `NULL`) | `'coleta'` |

> ⚠️ **A CONFERÊNCIA FICOU ENXUTA, COM UMA LISTA SÓ (03/11/2026)** — fase 1 da
> spec `CONFERENCIA-EXPEDICAO`. Saíram os quadros do topo (No carro, Faltam no
> carro, Coleta esperando, Peças adiantadas), o "Conferir carga do carro", a
> linha da central de pendências e o "Ver as que faltam" da pilha. Agência e
> coleta estão numa **lista única** com a marcação 🟣 Coleta / 🚗 Agência
> (`listaUnica`, R-COL-03). **Nenhuma rota mudou**: a tela só junta o que o
> `GET /api/carregamento` já manda, e a modalidade continua vindo do `carga.js`.
>
> ⚠️ **A AGÊNCIA FECHA COMO A COLETA, E COM QUEM LEVOU (fase 2, 03/11/2026).**
> Abrir a viagem **põe no carro toda caixa de agência conferida e de hoje**; o
> bipe passa a dizer o que **FICOU** (`POST /api/viagem/ficou`), como na saída
> do caminhão. O "Pôr mais uma no carro" (o bipe antigo) fica para a venda
> futura mandada adiantada — **ela não entra sozinha** (#9) — e para a troca de
> porta. Fechar exige foto, número e **quem levou** (pessoa ativa do cadastro,
> `saida.quem_levou_id`/`quem_levou`), além de quem fechou (o login). A conta
> congela ao abrir porque a viagem fecha horas depois, na volta (R-VIA-01/02).
>
> ⚠️ **O FIM DO DIA DÁ NOME À CAIXA QUE FICOU (fase 3).** "🚚 A coleta não
> passou hoje" grava quem, quando e quais caixas (`fim_dia.js`, tabela
> `fim_dia`, uma linha por dia) e **não mexe em nada** — nem estágio, nem
> estoque. No dia seguinte a caixa vem **em cima** da lista, com o selo **de
> ontem**. **Caixa sem marcação nunca é cancelada**: continua na lista, como
> "não saiu" (R-FIM-01).
>
> ⚠️ **A VENDA CANCELADA PASSA POR DUAS PESSOAS (fase 4).** O "✕ Venda
> cancelada" (ex-↩ Sobrou, mesma rota `POST /api/carregamento/sobra`) agora só
> **separa**: a caixa vira `cancelado` e sai das listas, **sem mexer no saldo**.
> Quem tem `cancelamento.confirmar` (nova, sensível, nível `supervisor`,
> backfill de uma vez para Supervisor e Admin) **confirma** — o saldo volta +1
> por peça se já tinha baixado — ou **recusa** com motivo, e a caixa volta para
> onde estava (a de agência que estava no carro volta à área, conferida). A
> cancelada pelo relatório do ML recusada continua cancelada. `cancel_conf.js` é
> o dono do pedido (tabela `cancelamento_caixa`, com quem marcou, quem decidiu e
> o que moveu). O card "Sobras esperando decisão" virou **Canceladas** (a
> separar · aguardando confirmação); a caixa que o caminhão deixou saiu dele —
> é atraso, e o fim do dia lhe dá nome. A faixa "SOBRA DO CAMINHÃO" é da saída
> do caminhão (R-SAI-02) e **ficou**.
>
> ⚠️ **"+1 POR PEÇA" SÓ SE A CAIXA JÁ BAIXOU, e a spec dizia "cada persiana
> volta".** A impressa e não conferida nunca saiu do saldo (§2); devolver a ela
> seria saldo a mais. Vale este arquivo.
>
> ⚠️ **A TELA ACHOU DOIS DEFEITOS QUE OS TESTES DE ROTA NÃO PEGAM**: o texto do
> fim do dia saía grande (a regra `.sub3` valia só dentro da lista), e o
> cabeçalho "Conferidas" nasceu **âmbar** — a classe `conf` já era do botão
> "Conferir carga do carro", que saiu. **`node teste_conferencia_tela.js`** (38,
> num Chromium de verdade; sem navegador diz PULADO e o CI não o roda) trava a
> cor do cabeçalho.
>
> ✅ **AS QUATRO FASES ESTÃO NO AR DESDE 04/11/2026** (PRs #261 e #263): o dono
> fez o deploy e disse *"deu tudo certo"*. ⚠️ **AINDA NÃO PROVADO:** a primeira
> viagem fechada com quem levou, o primeiro "a coleta não passou" com o selo
> no dia seguinte e a primeira venda cancelada separada por um e confirmada
> por outro. Prova que não foi feita se escreve como não feita.

| Cartão | Regra em uma linha |
|---|---|
| R-MOD-01 | A modalidade se lê pela linha "Despachar", contra dois formatos exatos; a etiqueta "Etiqueta válida para envíos" sem a linha é coleta (04/11/2026); o resto retém (#21) |
| R-MOD-02 | Formato desconhecido vai para Bloqueados, e uma pessoa decide |
| R-MOD-03 | `carga.js` é o dono único de "isto é coleta?", e sem dado é agência |
| R-MOD-04 | `saiu_por` não reescreve `modalidade`, nem o contrário |
| R-COL-01 | "Faltam imprimir" são duas listas, e o filtro decide o que o bipe pega |
| R-COL-02 | O relógio de despacho é da agência; a coleta tem o dela, pelo horário lançado (05/11/2026, R-HCO) |
| R-COL-03 | A caixa de coleta não entra na conta do carro; na tela, agência e coleta numa lista única, com a marcação (03/11/2026) |
| R-COL-04 | O caminhão leva antes da data, e o canto cheio de caixa futura é normal |
| R-QUEM-01 | `impresso_por` é a PRIMEIRA impressão, e a reimpressão não o toca; cada reimpressão é uma linha (`lote_reimpressao`), e sem login nada imprime (05/11/2026) |
| R-QUEM-02 | O bipe do Carregamento grava quem conferiu; sem login, toda escrita da Conferência, da saída e da viagem é 401 (05/11/2026) |
| R-PIL-01 | A pilha fecha caixa a caixa: impressas = conferidas + faltam |
| R-PIL-02 | A impressa ontem e não conferida não some, e não entra na conta de hoje |
| R-PIL-03 | A adiantada entra na pilha, marcada; pendente e bloqueado não |
| R-PIL-04 | "Sem registro", "mesma pessoa" e "sem conferência" são três coisas |
| R-PIL-05 | As listas da pilha nascem recolhidas |
| R-SEG-01 | Quem imprimiu não confere (área e canto); pelo id do login quando a caixa o tem (05/11/2026) |
| R-SEG-02 | Não há liberação, nem para o Admin Geral |
| R-SEG-03 | O nome de quem imprimiu aparece, em linha própria |
| R-PEC-01 | A caixa de várias se confere peça a peça, contando persiana |
| R-PEC-02 | A lista do que vai na caixa APARECE (desde 05/10/2026) |
| R-PEC-03 | O bipe de peça tem as mesmas barreiras do bipe da caixa |
| R-PEC-04 | Guard de 700 ms; a divergência não apaga o que foi bipado |
| R-PEC-05 | As etiquetas coladas por fora são as do saco de cada persiana |
| R-REC-01 | A venda cancelada se separa na Conferência: etiqueta + SKU de cada persiana; separar não mexe em saldo (03/11/2026) |
| R-REC-02 | Só a caixa com etiqueta e ainda na fábrica, e uma vez só |
| R-REC-03 | A de várias volta inteira; com um item cancelado não é sobra; sob medida não mexe em saldo |
| R-REC-04 | Quem conferiu a caixa não marca a sobra dela (D8) |
| R-REC-05 | A lista das canceladas (a separar · aguardando confirmação) zera |
| R-REC-06 | Só a confirmação, de outra pessoa com `cancelamento.confirmar`, devolve ao estoque; recusar devolve a caixa à lista |
| R-REC-07 | "+1 por peça" só se a caixa já baixou |
| R-FIM-01 | "A coleta não passou" dá nome à caixa que ficou e não mexe em nada; sem marcação nunca é cancelada |
| R-SAI-01 | Uma saída por caminhão, e ela só olha o que saiu nela |
| R-SAI-02 | As sobras são declaradas, nunca supostas |
| R-SAI-03 | A conta do caminhão só olha o canto da coleta |
| R-SAI-04 | O bipe da saída só diz SOBROU; a troca de porta é por botão |
| R-SAI-05 | Quem fechou a saída não conferiu a caixa |
| R-SAI-06 | Sem a foto não fecha; com divergência, só com `saida.liberar` e motivo |
| R-SAI-07 | A caixa de agência que o caminhão levou não conta no "No carro" |
| R-SAI-08 | O "Fechar coleta" antigo está aposentado |
| R-VIA-01 | A área confere; abrir a viagem põe no carro as conferidas de hoje, e o bipe diz o que ficou (03/11/2026) |
| R-VIA-02 | A viagem fecha com foto, número e quem levou, como o caminhão |
| R-VIA-03 | A caixa de coleta pode ir pelo carro, e sai do canto |
| R-VIA-04 | Tirar do carro desfaz o bipe; cancelar com caixa no carro é recusado |
| R-VIA-05 | A foto da viagem vem da galeria, e fecha de qualquer aparelho |
| R-VIA-06 | O "No carro" do topo e a viagem dizem o mesmo número |
| R-ADI-01 | Adiantado é o que sai antes do despacho, em PEÇAS; na coleta conta o caminhão |
| R-PAS-01 | O passivo da coleta bipada sai na data do bipe de cada caixa |
| R-PAS-02 | O passivo das nunca bipadas exige data de corte de quem viu sair |

**Ao mexer em** `parse.js` (modalidade): `node teste_parse.js` (caso 15) e `node
teste_etiqueta_envios.js` (o formato "Etiqueta válida para envíos"). Na
decisão de Bloqueados: `node teste_divergencia.js`. Na Etiqueta de Venda (as
duas listas, o filtro): `node teste_etiqueta.js`. No `carreg_route.js` ou no
`carga.js`: `node teste_carga.js`, `node teste_area.js`, `node
teste_segunda_pessoa.js` e `node teste_pecas_carga.js`. No `saida_route.js`:
`node teste_saida_coleta.js` e `node teste_saida_agencia.js`. Na recusa do
motorista ou na venda cancelada: `node teste_sobra.js`. Nas fases 2 a 4 da
`CONFERENCIA-EXPEDICAO` (viagem com quem levou, fim do dia, cancelamento em
duas pessoas): `node teste_conferencia_expedicao.js` (92) e, na tela, `node
teste_conferencia_tela.js` (38). No `POST /api/embalar`, no
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

**Rode `node teste_devolucao.js` (48 casos) ao mexer no `dev_route.js`.** Ele trava o
SKU físico cadastrado, o `sku_venda` gravado ao lado (nunca no lugar), a fila só no
`reembalar` e a baixa. Desde 26/10/2026 a baixa de um `id` que não existe é **404**
(antes respondia `ok` sem gravar nada) e a baixa repetida é **409**, sem regravar a
data, a reputação nem o motivo de quem deu antes; a aba Devoluções mostra a recusa.

> ⚠️ **A BAIXA GRAVA QUEM DEU, DESDE 04/11/2026** (fase 1 da spec
> `ACESSO-POR-TELA-E-NIVEL`, linha em `docs/DECISOES.md`): `devolucao.baixado_por_id`
> e `baixado_por` (o nome como retrato, como o `revisao.usuario_nome`), no `CREATE`
> e no `ALTER` guardado do `dev_route.js` (§17), na mesma transação da baixa —
> a da aba e a de dentro do caso, que é a mesma rota. A baixa repetida (409) diz
> quem deu e não regrava; desligar a revisão do caso (§9-B) limpa o nome junto.
> **A baixa anterior fica sem nome** — não se inventa de memória.
>
> ⚠️ **E A ETAPA 1 GRAVA QUEM RECEBEU A PEÇA, DESDE 05/11/2026** (fase 5 da
> `QUEM-FEZ-E-REVISAO`): `devolucao.revisado_por_id` e `revisado_por`, no
> `CREATE` e no `ALTER` guardado do `dev_route.js`. Receber, ligar ao caso e a
> baixa são **401 sem login** — a baixa sem sessão gravava com quem deu vazio.


---

## 9-B. Devoluções em andamento — do aviso do ML até o reembolso (03/11/2026)

Spec `docs/specs/DEVOLUCOES-ACOMPANHAMENTO.md`, as cinco fases numa entrega só.
Tela `/devolucao-casos` (escritório). **O caso nasce quando o ML abre a
reclamação, antes de a peça chegar** — a §9 continua sendo o que acontece
quando ela chega, e não mudou.

| Tipo | Quem busca | O que manda na tela |
|---|---|---|
| **ML devolve** | a logística do ML | há quantos dias espera — sem cor, sem trava (R5) |
| **Nós coletamos** | a Deccorar, com transportadora | o **próximo prazo do ML** (comprovante ou coleta) e o parado |

`devcaso_dominio.js` é o **dono único** do caso: etapas, cor do prazo, parado,
saldo e relatório. A tela só desenha. Chaves: `devolucao.lancar` (admin),
`devolucao.acompanhar` (supervisor) e `devolucao.dinheiro` (admin,
**sensível**; desde 03/11/2026 **não** é mais intransferível — ver "OS VALORES
SÃO DE QUEM LANÇA E ACOMPANHA" abaixo). Backfill de uma vez só
(`seed_devolucao_caso`): quem dá baixa em devolução lança e acompanha; o
dinheiro não vem junto.

> ⚠️ **O VENCIDO NÃO ENCERRA SOZINHO** (R7). Pode ter havido prorrogação não
> lançada. Ele fica vermelho no topo até o admin geral lançar o prazo novo ou
> encerrar como **perda**. Nenhuma leitura encerra caso — há teste chamando a
> lista, o caso e os encerrados várias vezes e exigindo o caso de pé.
>
> ⚠️ **A COR E O PARADO SÃO DO `config`**, e não do código:
> `devol_prazo_ambar=3`, `devol_prazo_vermelho=1`, `devol_parado_dias=2`. Vence
> hoje é **vermelho**, não vencido. A lista do "nós coletamos" vai **pelo
> prazo**, nunca pela data de lançamento. "Valor do ML a pedir" há ≥ 2 dias
> também grita parado (R18), mesmo com a etapa andando.
>
> ⚠️ **O PRAZO ORIGINAL É O PRIMEIRO, SEMPRE** (R6). Pedir prorrogação é
> evento e não muda o prazo; o prazo novo guarda o original, e o segundo
> prazo novo não o sobrescreve.
>
> ⚠️ **UMA LISTA DE MOTIVOS SÓ** (R12): a `motivo_devolucao` da baixa, que
> ganhou *Falta de kit*, *Comando quebrado* e *Chegou amassada*. O `seed()` do
> `cad_route.js` **só grava em lista vazia**, então os três vieram por um
> acréscimo de uma vez só (`config.seed_motivos_devolucao_2`, e
> `seed_doc_devolucao_1` para os documentos): só insere o que não existe, e o
> motivo apagado ou desativado depois **não volta** no boot seguinte. Motivo
> (o que o cliente reclamou) e triagem (o que a peça mostrou) ficam separados.
>
> ⚠️ **O BIPE DO EDVALDO NÃO MUDOU** (R14). Com caso aberto para a etiqueta
> (venda, pack ou NF), aparece a tarja *"Devolução esperada — caso #N ·
> motivo"* e o salvar liga o caso na **mesma transação** da revisão (marca
> revisado, grava a chegada uma vez só). **Sem caso, o `buscar` responde com
> as mesmas duas chaves de sempre**, e o tablet sem o refresh liga o caso pela
> etiqueta bipada. Na baixa ligada, o motivo vem do caso; o "ML devolve"
> encerra ali, o "nós coletamos" espera o reembolso.
>
> ⚠️ **"ML AVISADO" É BOTÃO, NÃO ETAPA À MÃO.** O aviso pode vir depois da
> revisão, e aí é só história: a trilha não volta de "revisado". `chegou` tem
> botão, `revisado` é o bipe, `encerrado` é decisão. **E depois da chegada
> nenhuma etapa à mão se marca** (CONSERTO de 04/11/2026): as `MANUAIS` são
> todas de antes dela, a tela não as oferece e a rota recusa (400) — o
> "→ Aguardando chegar" num caso já revisado deixava a chegada e a revisão
> gravadas num caso que dizia "aguardando". ✅ **No ar e conferido em
> 04/11/2026** (PR #277): o dono fez o deploy e viu o caso revisado sem o
> botão, e o "nós coletamos" chegado só com o "Avisamos o ML". O "A caixa
> chegou" clicado por engano se desfaz pelo "↩ Desfazer" (bloco do desfazer,
> mais abaixo).
>
> ⚠️ **CUSTO VAZIO NÃO É ZERO** (R9). Tentativa de coleta sem custo deixa o
> saldo **nulo e "incompleto"**, e o total do mês sai como **piso** (≥, aviso
> âmbar, dizendo o que falta). "Não achou o cliente" abre a próxima tentativa
> com o custo vazio: ainda não se sabe se a segunda ida cobra.
>
> ⚠️ **A TRANSPORTADORA SE APRENDE PELO CEP** (R10): a sugestão sai das
> tentativas com `coletou` (5 dígitos antes de 3). Não existe tabela de
> cobertura escrita à mão, que envelheceria calada.
>
> ⚠️ ~~**O DINHEIRO NEM VIAJA** para quem não tem `devolucao.dinheiro`~~ —
> **desde 03/11/2026 os valores viajam a quem lança ou acompanha** (bloco
> abaixo). Continuam fora do fio para quem não tem nenhuma das três chaves
> (R15): lista, caso, encerrados e busca saem sem `valor_ml`, `custo`,
> `valor_devolvido`, `valor_perdido`, `limite_frete` e `saldo` (o teste varre
> as chaves do JSON), e os **totais em reais do relatório** só com
> `devolucao.dinheiro`. A **história** diz o que mudou, nunca o número, porque quem acompanha
> lê a história. A **situação** do valor do ML (pedir / pedido / já veio) não é
> dinheiro e é de quem acompanha. Ver valores entra na auditoria amortecida
> (uma linha por pessoa a cada 30 min); cada decisão grava sempre.
>
> ⚠️ **"DOCUMENTOS AO ML" SÓ COM TODOS OS DOCUMENTOS ATIVOS ANEXADOS** (R11),
> e a recusa nomeia o que falta. A lista `doc_devolucao` é editável em Admin →
> Cadastros. **Devolver ao comprador** exige a foto do comprador anexada (R17).
>
> ⚠️ **O ANEXO É PROVA E NÃO EXPIRA** (R21): mora em `caminhos.DEVOLUCOES`
> (`PCP_DEVOLUCOES_DIR`, padrão `/opt/expedicao/devolucoes`), **fora** de
> `lotes/`. O arquivo é gravado dentro da transação: disco recusou, a linha não
> existe. Não há rota de apagar anexo.
>
> ⚠️ **O RELATÓRIO É UMA RÉGUA SÓ** (R22): casos lançados no mês + devoluções
> recebidas no mês **sem** caso (pelo motivo da baixa). A devolução ligada a
> um caso conta uma vez, pelo caso. Perda por prazo e devolvido ao comprador
> ficam separados.

> ⚠️ **AS DEVOLUÇÕES TÊM UMA ENTRADA SÓ, COM ABAS** (AJUSTE de 03/11/2026,
> pedido do dono: *"concentrar em um único lugar"*). ~~O rodapé tem **um**
> "Devoluções"~~ — **desde 04/11/2026 o rodapé saiu e as devoluções são o bloco
> 250 do menu por pessoa (§20)**; a porta `/devolucoes` continua, e abre para quem
> tem alguma chave das devoluções —, que aponta para a porta `/devolucoes`; ela leva cada pessoa à
> primeira aba que alcança (Em andamento → Receber peça → Baixa). No topo das
> duas telas fica a faixa **Receber peça** (`/devolucao`, `devolucao.registrar`)
> · **Em andamento** (`/devolucao-casos`) · **Baixa** (Admin → Devoluções,
> `/admin#dv`, `devolucao.baixar`). Quem vê uma aba só não vê a faixa: a tela do
> Edvaldo continua igual. **Juntar é só na navegação**: cada tela e cada rota
> continuam com a sua chave.
>
> ⚠️ **A FAIXA PERGUNTA A PERMISSÃO (`/api/devolucao/abas`), E NÃO A COLUNA
> `areas`.** O primeiro deploy pôs um link próprio "Devoluções em andamento" que
> lia a `areas`, e ele **não apareceu para ninguém**: o backfill
> `seed_devolucao_caso` gravou as chaves nos setores sem recalcular a coluna,
> que é sombra. No banco de teste o defeito não aparecia, porque o
> Administrador de banco novo nasce com todas as áreas. O boot recalcula a
> sombra de todos uma vez (`config.areas_devolucao_casos`), **depois** do
> `PERM_AREA` — chamado antes, o `sincronizarAreas` estouraria no TDZ dentro
> do `try` e não gravaria nada, calado. **Backfill de chave nova que dá tela
> tem que recalcular a `areas`**, senão o destino depois do PIN fica errado.

> ⚠️ **A BUSCA ACHA O ENCERRADO TAMBÉM** (AJUSTE de 03/11/2026, pedido do
> dono: *"temos que procurar se já foi ou não lançada"*). O campo **Buscar
> devolução** no topo de Em andamento procura pela NF, pela venda ou pelo pack
> — o número inteiro ou um pedaço, a partir de 3 dígitos, sem os espaços do
> leitor — nos casos **abertos e encerrados** (`devcaso_dominio.buscar`), com
> os abertos em cima. O encerrado também responde "já foi lançada": o aviso do
> lançamento, que só olha o caso aberto, não basta para essa pergunta.
>
> ✅ **NO AR E CONFERIDA EM 03/11/2026** (PR #253): o dono fez o deploy (telas
> 302, API 401, `/login` 200, inclusive `/api/devolucao-casos/buscar`) e
> conferiu a busca na tela, pela NF e por pedaço da venda.

> ⚠️ **"VIA PUBLICIDADE?" É OBRIGATÓRIO, E VAZIO NÃO É "NÃO"** (AJUSTE de
> 03/11/2026, decisão do dono, linha em `docs/DECISOES.md`). O lançamento
> recusa (400) sem Sim ou Não: o esquecimento contando como "não" seria o custo
> vazio do R9 por outra porta. A coluna `devolucao_caso.publicidade` é 1, 0 ou
> **vazia** — os seis casos de antes da pergunta ficam "não informado", e o
> `lancar_casos_iniciais.js` é o único que lança sem ela (`semPublicidade`). O
> relatório do mês conta sim · não · não informado **só dos casos**: a
> devolução recebida sem caso não tem a pergunta.
>
> ⚠️ **O LINK DA CONVERSA SÓ ACEITA `http(s)://`**, sem espaço e até 2.000
> letras. Ele vira um botão que abre noutra aba ("Abrir conversa no ML", e um
> chip na lista): um `javascript:` ali rodaria na sessão de quem clica. A
> **mensagem do ML** é colada inteira (até 20.000 letras, com as quebras de
> linha) e aparece no caso; na **história** a mensagem e o link entram só
> como "colada / trocada / apagada" — quem lê a história quer saber que mudou,
> não reler o texto.
>
> ⚠️ **"PASSADO EM" NASCE NO DIA DO LANÇAMENTO** (decisão do dono). No "Nós
> coletamos" o servidor grava hoje quando o campo não vem, e a tela já abre com
> hoje; a data informada vale, e a impossível é **recusada** — virar hoje em
> silêncio esconderia o erro de quem digitou.
>
> ⚠️ **A ABA MOTIVOS NÃO É UMA LISTA NOVA** (R12): ela edita a mesma
> `motivo_devolucao` do Admin → Cadastros, pela mesma rota (`/api/listas`) e
> com a mesma chave (`listas.editar`) — quem não tem a chave não vê a aba nem o
> "+ cadastrar motivo". Remover desativa: o caso que já usa o motivo guarda o
> texto. A tela recusa o repetido (sem diferença de maiúscula); a rota
> `/api/listas` em si **não** recusa, e isso ficou como está.

> ⚠️ **O LANÇAMENTO JÁ ADIANTA A COLETA E O VALOR** (AJUSTE de 03/11/2026,
> dono: *"no lançar devolução é onde devemos já lançar o maior número de
> informações"*). No "Nós coletamos", o lançamento aceita o CEP, a
> transportadora (o caso nasce em "Coleta pedida", com a 1ª tentativa), o
> custo, a situação do valor e o valor do ML — pelas **mesmas** funções da
> tela do caso (`devcaso_dominio.lancarCompleto`), numa transação só: parte
> recusada, caso não nasce pela metade. Valor, custo, etiqueta e limite do
> frete no lançamento são de **quem lança** (desde 03/11/2026). Valor sem
> situação escolhida vira "já veio", a regra que já valia no caso.
>
> ⚠️ **O CEP NÃO VEM DA NF, e não é esquecimento.** O PCP não grava o CEP da
> venda (da etiqueta só lê a cidade), e o PDF é apagado em 7 dias — a
> devolução chega semanas depois. Puxar o CEP pede gravá-lo no upload, o que
> mexe no `parse.js` e só vale para as vendas novas: fica para um plano à parte.
>
> ⚠️ **O DESFAZER DA ETAPA É SÓ DE QUEM CLICOU, E SÓ DO ÚLTIMO CLIQUE**
> (decisão do dono). Um clique errado em "→ Coleta pedida" volta pelo botão
> "↩ Desfazer", e o caso volta **com a data de antes** (`etapa_desde_antes` no
> evento), para o "parado" não zerar. Vale só para etapa marcada à mão
> (`MANUAIS`), e só enquanto o caso não andou por outra porta (coleta, chegada,
> revisão, aviso, encerrar); editar, anexar, prazo e valor não contam. A
> história guarda o clique e o desfeito. Quem clicou é gravado pelo **id**
> (`devolucao_evento.usuario_id`): o evento anterior a isto não tem o id e não
> se desfaz — volta pelos botões de etapa. **Desde 04/11/2026 o "A caixa
> chegou" também se desfaz** (decisão do dono, linha em `docs/DECISOES.md`),
> com as mesmas condições — só quem clicou, só o último passo — **e só sem
> revisão ligada**: a chegada sai (`chegou_em` vazio) e o caso volta à etapa de
> antes, com a data de antes. O "revisar no ML até" que veio com a chegada
> fica. A chegada do bipe do Edvaldo não se desfaz por aqui: ali a peça está
> revisada, e o caminho é o "desligar a peça errada".
>
> ✅ **NO AR E CONFERIDO EM 04/11/2026** (PR #279): o dono fez o deploy e
> conferiu na tela o "A caixa chegou" seguido do "↩ Desfazer" voltando o caso,
> o desfazer escondido para outro login e para o caso com a peça já revisada
> — e disse *"bateu tudo"*.
>
> ⚠️ **O MOTIVO SE ESCOLHE NO ALTO DO CASO** (AJUSTE de 03/11/2026, dono: *"uma
> vez lançado não conseguimos mais colocar o motivo"*). Ele já se editava, mas
> só em "Editar o lançamento", lá embaixo; no alto era texto. Hoje é um campo
> que salva ao escolher (mesma rota e chave do editar, `devolucao.lancar`), em
> âmbar quando vazio. **O motivo que o caso já tem passa mesmo se saiu da
> lista**: sem isso, salvar a NF de um caso cujo motivo foi removido na aba
> Motivos apagava o motivo calado (achado na revisão, travado no teste).
>
> ⚠️ **"MESMO COMPRADOR" SÓ AVISA, NÃO JUNTA OS CASOS.** Cada venda tem o seu
> prazo, o seu valor e o seu reembolso no ML, então os casos continuam
> separados; a lista, o caso e o lançamento dizem quais outros casos **abertos**
> são da mesma pessoa, para quem pede a coleta combinar uma ida só. Quem diz se
> dois nomes são a mesma pessoa é o `nome.js`, e **não** pelo `mesmoCliente`:
> aquele aceita letra contida em letra (feito para o nome abreviado dentro de
> UM pacote), e contra todos os casos abertos juntava "Ana" com "Luciana
> Souza". Aqui é o `mesmaPessoaPorPalavras`: igualdade, a letra dobrada do ML,
> ou as palavras inteiras do nome menor (duas ou mais) dentro do maior, com o
> mesmo primeiro nome e o mesmo último sobrenome. Nome vazio ou de uma palavra
> não junta ninguém.
>
> ⚠️ **O TIPO DO CASO SE TROCA ENQUANTO ELE ESTÁ ABERTO** (decisão do dono,
> 03/11/2026: *"ainda não sei se o ML vai me entregar a persiana ou se eu vou
> ter que coletar"*). Botão "Trocar para …" no caso, de quem lança
> (`devolucao.lancar`, conferida também na rota). A etapa vai para a
> equivalente (Aguardando ↔ Lançado; Chegou e Revisado ficam; Coleta pedida,
> Documentos e A caminho voltam a Aguardando; ML avisado vira Chegou) e a
> **data da etapa não muda** — trocar o tipo não é o caso andar. Para "Nós
> coletamos" o prazo do ML é obrigatório, e o "passado em" vazio ganha o dia
> do lançamento. **Para "ML devolve" é RECUSADO com coleta pedida ou valor do
> ML lançado** (decisão do dono): o relatório só soma o dinheiro da coleta no
> "nós coletamos", e o custo e o valor sairiam da conta calados. A troca
> entra na história e bloqueia o desfazer do clique de antes.
>
> ⚠️ **O "ML DEVOLVE" TAMBÉM TEM CUSTO: A ETIQUETA DE DEVOLUÇÃO** (decisão do
> dono). Quando o ML entende que o problema é nosso, ele cobra a etiqueta
> (R$ 48,70 no caso que originou isto). `devolucao_caso.custo_etiqueta`, nos
> dois tipos, é um **valor do caso**: de quem lança ou acompanha, no lançamento
> ou no "Salvar alterações". O relatório soma as
> etiquetas **à parte** — não entram no saldo da coleta. Vazio não é zero, mas
> também não é "falta": o ML nem sempre cobra.
>
> ⚠️ **A REVISÃO DO FRETE: COM ELA PENDENTE, O "ML DEVOLVE" NÃO ENCERRA NA
> BAIXA** (decisão do dono, 03/11/2026). Quando o ML cobra o frete e a culpa
> não é nossa, **depois de a caixa chegar** pede-se revisão ("Pedi revisão do
> frete ao ML", com o número da solicitação se houver); a resposta é "devolveu"
> ou "negou". Pedir e responder são de `devolucao.acompanhar` (conferida também
> na rota), e o **valor devolvido** (`valor_revisao`) também, como os outros
> valores do caso. Só no "ML devolve" — no "Nós coletamos"
> quem cobra é a transportadora. Pedida e sem resposta, o caso mostra "revisão
> do frete pedida há N dias", âmbar a partir do `devol_parado_dias`. **Antes o
> "ML devolve" encerrava sempre na baixa; agora, com a revisão pendente, a
> baixa só fica na história e o caso espera a resposta** — que o encerra se a
> devolução já teve baixa. O relatório do mês mostra fretes cobrados,
> devolvidos na revisão e o prejuízo.
>
> ⚠️ **NADA DIGITADO SOME CALADO NO CASO** (CONSERTO de 03/11/2026, o dono:
> *"coloco o nome do responsável e não está salvando"*). O servidor gravava;
> era a tela. O caso tinha **dois "Salvar"** (lançamento e valores), cada um
> gravava só o seu bloco, e o caso inteiro era redesenhado por cima do que
> estava digitado no outro bloco. E no "ML devolve" o responsável era gravado
> e **não aparecia** (o quadro só o mostrava no "nós coletamos"). Hoje: os dois
> botões e a barra embaixo são o mesmo **"Salvar alterações"**, que grava todo
> campo mudado; campo não salvo fica marcado e a barra diz quais; uma ação usa
> só os campos da **linha do botão** dela e o resto volta depois do redesenho;
> o recusado fica no campo com o motivo; Fechar ou abrir outro caso pergunta.
> **Campo novo no caso entra no `CAMPOS_EDITAR` ou no `CAMPOS_VALOR`** da tela (o
> responsável entra como `responsavel_id` desde 04/11/2026),
> senão o "Salvar alterações" não o grava.
>
> ⚠️ **A TELA TEM TESTE PRÓPRIO, NUM NAVEGADOR DE VERDADE:
> `node teste_devolucao_casos_tela.js`** (202 casos). Ele **não** sobe o
> `server.js` (a porta 3010 é fixa, e no servidor bateria na produção): monta um
> Express só com as rotas das devoluções, num banco temporário e numa porta
> livre. **Sem Playwright/Chromium ele diz "PULADO" e sai sem falhar — e o CI
> do GitHub não tem navegador**, então lá esta tela não é conferida. Quatro
> defeitos foram reintroduzidos um a um: sem devolver o digitado depois de uma
> ação (reprova 5), o "Salvar" do dinheiro gravando só valores — o defeito
> original (16), o responsável só no "nós coletamos" (1) e o Fechar sem
> perguntar (3).
>
> ⚠️ **A REVISÃO EM DUPLA (03/11/2026) ACHOU, E FICOU TRAVADO NO TESTE:** custo
> digitado sem transportadora sumia calado (hoje 400); pelo lançamento, quem
> só lança pedia coleta e marcava a situação do valor, que nas rotas próprias
> são de `devolucao.acompanhar` (hoje 403); o desfazer podia voltar a
> "Documentos ao ML" sem os documentos (hoje passa pela trava R11); e as
> colunas novas estavam só no `ALTER` — agora estão também no `CREATE` (§17).

> ⚠️ **O "NÓS COLETAMOS" TEM DOIS PRAZOS DO ML** (AJUSTE de 03/11/2026, dono,
> com a conversa do ML na mão). O `prazo` de sempre virou **"Mandar o
> comprovante ao ML até"** (o comprovante do agendamento); e a coleta tem o
> dela, **20 dias corridos da abertura da reclamação**:
> `prazo_coleta = aberta_em + devol_coleta_dias` (`config`, padrão 20). A
> **abertura** nasce hoje no lançamento (editável, nunca no futuro), e corrigi-la
> recalcula o prazo da coleta — **menos** se o ML já deu prazo novo para ela.
> - **A cor, o número e a ordem da lista vêm do PRÓXIMO prazo aberto** (o mais
>   perto dos não cumpridos), e o chip diz qual: *"comprovante: faltam 3 dias"*,
>   *"coleta: falta 1 dia"*. O do comprovante se cumpre quando o caso chega a
>   "Documentos ao ML"; o da coleta, em "A caminho". **Coletado, não há prazo
>   correndo** — o caso vai ao fim da lista, sem cor. Não existe terceiro prazo.
> - **Prorrogação e prazo novo valem para o prazo escolhido** (o próximo, de
>   início); cada prazo guarda o **seu** original (`prazo_original`,
>   `prazo_coleta_original`), e o segundo prazo novo não o sobrescreve (R6).
> - O **caso de antes disto**, sem a abertura, só tem o do comprovante.
> - **Dois avisos que nunca travam:** a tentativa **agendada para** depois do
>   prazo da coleta (`devolucao_coleta.agendada_para`, remarcável pelo "Salvar
>   alterações") e o **custo acima do limite do frete** que o ML paga
>   (`limite_frete`; igual ao limite não avisa). Travar faria a pessoa lançar
>   por fora (#6); o ML às vezes prorroga e às vezes aceita.
> - No "ML devolve" não há abertura, prazo da coleta nem limite de frete — o
>   limite é **recusado** (400).
>
> ⚠️ **OS VALORES SÃO DE QUEM LANÇA E ACOMPANHA; O DINHEIRO FICOU COM AS
> DECISÕES** (decisão do dono, 03/11/2026: *"quem estiver lançando e quem
> estiver à frente do problema"*). Valor do ML, custo das tentativas, etiqueta,
> limite do frete e frete devolvido: **vê e lança** quem tem
> `devolucao.lancar` ou `devolucao.acompanhar`. Com `devolucao.dinheiro` ficam
> só a **baixa do reembolso**, **encerrar como perda**, **devolver ao
> comprador**, o valor perdido e o devolvido, e os **totais em reais do
> relatório**. A chave deixou de ser intransferível e virou nível `admin`, para
> o dono a dar a um setor (o Financeiro) pela tela de Acessos — e quem tem só
> ela também abre a tela e as abas. **Ela NÃO nasce no setor Admin**
> (`SO_PELA_TELA` no `acesso.js`): em produção o setor já existe e não a
> recebe, e o banco novo tem de ser igual (§17).

> ⚠️ **A ETIQUETA DE DEVOLUÇÃO DO ML NÃO ACHA O CASO** (CONSERTO de
> 03/11/2026, NF 8207). O Edvaldo bipou o código da **etiqueta de devolução**
> (`48323653161`): é o número do envio de volta, que o PCP não conhece — não é
> venda, pack nem NF. A revisão ficou solta ("Sem registro da venda original" na
> Baixa) e o caso parou em "Chegou". Três portas ligam agora, todas pelo
> `devcaso_dominio` (`esperadas`, `revisoesSoltas`, `ligarManual`):
> - **na tela do Edvaldo**, sem caso pelo bipe, depois do SKU aparece
>   *"Devolução esperada com este SKU? #N · comprador · NF"* — um toque liga ao
>   salvar; ignorar segue como sempre, e trocar o SKU desmarca;
> - **no caso aberto sem revisão**, o quadro *"A peça já foi revisada?"* lista as
>   revisões sem caso do mesmo SKU (30 dias) com "Ligar" (`devolucao.acompanhar`);
> - **na Baixa**, o card sem caso mostra os casos esperados do SKU com "Ligar ao
>   caso" (`devolucao.baixar`).
> **SKU recebido diferente do vendido pede confirmação** (409 `sku_diferente`), e
> a confirmação fica na história como envio diferente (a DIVERGÊNCIA da §9).
> Ligar não ressuscita revisão já ligada nem liga duas vezes (409). A lista
> `esperadas` não leva valor nenhum em reais.
>
> ⚠️ **O "ML DEVOLVE" SÓ ENCERRA COM A BAIXA, O "JÁ REVISEI" E A RESPOSTA DA
> REVISÃO** (decisão do dono, 03/11/2026). A trilha ganhou `ml_revisei` ("Já
> revisei no ML") depois de "Revisado": o botão aparece com a revisão do Edvaldo
> ligada, e o chip *"falta marcar 'Já revisei' no ML"* fica na lista até alguém
> marcar — sem isso o ML entende que a peça chegou como esperado e o prazo de
> contestar passa. **Antes a baixa encerrava sozinha.** Quem completa a última
> das três (baixa, "Já revisei", resposta da revisão) encerra, pelo
> `talvezEncerrarML`; a baixa que chega antes deixa na história o que falta.
> O **"Revisar no ML até"** (`revisar_ate`, opcional, na chegada ou no editar)
> dá cor e ordem ao ML devolve, com a régua do `config`; sem ele, sem cor, como
> antes, e com o "Já revisei" o prazo está cumprido.
>
> ⚠️ **A REVISÃO NO ML PEDE O VALOR, A REPUTAÇÃO OU OS DOIS** (dono,
> 03/11/2026: *"temos que ir até o final com a solicitação do ML para revisar e
> nos reembolsar … ou tirar a nossa reputação que foi afetada"*).
> `revisao_pede` = `valor` · `reputacao` · `ambos`; ausente é `valor` (o pedido
> de antes), vazio é recusado. A resposta é "atendeu" ou "negou"; pedida só a
> reputação, valor devolvido é recusado. **Pedida e sem resposta, o caso não
> fecha.**

> ⚠️ **O CASO DIZ O QUE FALTA PARA ENCERRAR, E A BAIXA SE DÁ DENTRO DELE**
> (03/11/2026, o caso #20 de novo: parado em "Já revisei no ML" com
> `baixado = 0`, e a tela não dizia que faltava a baixa). Com a revisão ligada,
> a lista e o caso mostram *"para encerrar falta: dar a baixa · marcar 'Já
> revisei' no ML · resposta da revisão no ML"* — o `falta` do `situacao`, com o
> `dev_baixado` lido pelo `comBaixa`. **A baixa se dá no próprio caso**
> (decisão do dono): reputação, motivo do caso já marcado e "Dar baixa", pela
> **mesma** rota e chave da aba Baixa (`POST /api/devolucao/baixa`,
> `devolucao.baixar`); a aba Baixa fica para a revisão sem caso.
>
> ⚠️ **A ETIQUETA DE DEVOLUÇÃO SÓ TRAZ O PACK ID IMPRESSO.** O código de barras
> e o QR são o mesmo número de envio (`48323653161`), que o ML acha na busca e
> o PCP não conhece; a venda aparece só em texto, *"Pack ID 2000015571773263"*.
> Por isso: o Edvaldo pode **digitar os últimos 5 a 10 números** do Pack ID
> (4 é NF; 11 é o próprio código da etiqueta) e o bipe acha o caso — só se UM
> caso aberto bate; com dois, os dois aparecem para ele tocar, sem escolha
> sozinha. A lista de esperadas mostra a venda e o pack com os finais em
> destaque. E ao ligar, o número bipado vai para `etiqueta_devolucao` no caso:
> bipar de novo acha, a busca acha, e o botão **"Abrir esta devolução no ML ↗"**
> leva à busca do ML com ele. Os finais digitados e a venda bipada **não**
> viram etiqueta de devolução.

> ⚠️ **A REVISÃO LIGADA À PEÇA ERRADA SE DESLIGA, E A BAIXA DELA SAI JUNTO**
> (AJUSTE de 03/11/2026, decisão do dono "a": *"temos mais de 3 persianas de
> 150x150 cinza"*). No caso, o bloco **"A peça revisada"** mostra a etiqueta
> bipada, a hora, a triagem e a observação, com o **"Conferir no ML ↗"** — a
> etiqueta digitada na busca do ML diz de qual venda a peça é. **"↩ Esta não é
> a peça certa — desligar"** pede motivo (400 sem ele) e é de
> `devolucao.acompanhar` (`desligarRevisao`): o caso fica sem revisão, volta a
> **"Chegou"** (a chegada continua), **reabre** se tinha encerrado por ela
> (`revisado_ml`) e perde a etiqueta de devolução que veio daquela peça. **A
> baixa dada naquela peça é desfeita** (`baixado=0`, sem reputação nem
> motivo): eles vieram do caso errado; ela volta para a Baixa sem caso e
> recebe a baixa certa quando for ligada ao caso dela. A história guarda o
> que tinha. **O "Já revisei" não se desfaz no ML**: o caso volta a pedi-lo, e
> a história diz para marcar de novo depois de ligar a peça certa. Encerrado
> por decisão de dinheiro (perda, comprador, reembolso) **não** se desliga
> por aqui (409). A lista de revisões soltas mostra cada peça em cartão, com a
> venda do caso em cima para comparar, e a Baixa tem o mesmo "Conferir no ML".
>
> **O bloco "Baixa da devolução" do caso diz quando e por quem** (*"Baixa dada
> em 04/11 às 15:20, por Renato"*, fase 1 da `ACESSO-POR-TELA-E-NIVEL`).
>
> ✅ **NO AR E CONFERIDO EM 03/11/2026** (PRs #259 e #260): o dono fez o
> deploy e percorreu o roteiro na tela — a baixa dentro do caso encerrando o
> "ML devolve", o "falta para encerrar", a peça revisada com o "Conferir no
> ML ↗", o desligar com motivo (a baixa desfeita, o caso reaberto em
> "Chegou"), a peça certa ligada nos cartões, a baixa e o "Já revisei" de novo
> encerrando, e a peça errada de volta na Baixa sem caso — e disse *"bateu
> tudo"*.

> ⚠️ **SEM PACK ID NA ETIQUETA, O EDVALDO ACHA O CASO PELO REMETENTE**
> (AJUSTE de 03/11/2026). Nem toda etiqueta de devolução traz o Pack ID, e o
> ML não mostra antes da chegada o número do código de barras — não há o que
> colar no caso. Mas toda etiqueta traz o **remetente**: o comprador (às vezes
> pelo apelido, *"Conchy Bermudez"*; o nome do ML vem em pé, na lateral) e a
> **cidade**. Por isso a lista "Devolução esperada com este SKU?" mostra em
> letra grande o **nome do comprador e a cidade** (`esperadas` devolve
> `cidade`, da venda ligada ao caso; sem venda no sistema, "cidade não
> registrada"), e com dois casos ou mais aparece **"Filtrar pelo nome ou cidade
> do remetente"** — sem acento e sem maiúscula, palavra a palavra. **Quem
> escolhe continua sendo ele**: o sistema não liga sozinho pelo nome, porque o
> apelido e o nome do ML nem sempre batem.
>
> ✅ **NO AR E CONFERIDO EM 04/11/2026** (PR #265): o dono fez o deploy e
> conferiu na tela do Edvaldo o nome e a cidade do comprador em letra grande e
> o filtro pelo remetente com mais de um caso do mesmo SKU — e disse *"bateu
> tudo"*.

> ⚠️ **TODO CASO ABERTO DIZ O PRÓXIMO PASSO, DE QUEM É A VEZ E ATÉ QUANDO**
> (spec `docs/arquivo/DEVOLUCOES-PROXIMO-PASSO.md`, fases 1 a 3, 04/11/2026, dono: *"quando
> ele abre o caso, não está claro qual é o próximo passo que ele precisa
> dar"*). `devcaso_dominio.proximoPasso` é o **dono único**: o passo é
> **calculado** do que já está gravado (etapa, prazos, última tentativa de
> coleta, documentos, aviso ao ML, revisão, baixa, situação do valor), nunca
> gravado nem digitado. A lista e o caso leem dali; a tela só desenha.
> - **O passo não muda regra nenhuma.** Etapas, prazos, permissões e o que
>   encerra um caso continuam como acima. O sistema não dá o passo sozinho:
>   o cartão aponta o bloco do caso que já tem o botão ("Ir para a ação ↓").
> - **A ordem é o mapa da §3 da spec, a primeira linha que bate.** No "nós
>   coletamos", o prazo **vencido** vem em cima de tudo (vez do dinheiro:
>   prazo novo ou perda); depois pedir a coleta, confirmar a data, remarcar
>   depois do "não achou o cliente", mandar o comprovante (com a lista do que
>   falta anexar), esperar a coleta, ligar quando a data passou, acompanhar a
>   entrega, revisar, avisar o ML, pedir o valor, esperar o ML e a baixa do
>   reembolso. No "ML devolve": o "revisar no ML até" vencido, esperar a peça,
>   revisar, a baixa, o "Já revisei" e a resposta da revisão.
> - **O "parado" (`devol_parado_dias`) devolve a vez para nós**: a caixa a
>   caminho, o valor do ML pedido e a revisão pedida, parados, viram *"Cobrar
>   a transportadora / o ML"*.
> - ⚠️ **NENHUM NÚMERO EM REAIS NO PASSO** — ele vai a quem só acompanha. O
>   teste varre as frases e as chaves do `proximo`.
> - **A lista são dois grupos dentro de cada card**: *esperando a gente*
>   (nós, o dinheiro, quem recebe a peça) em cima, na ordem do prazo, e
>   **"Esperando outros (N)"** (transportadora, ML) embaixo, **recolhido**; o
>   aberto à mão sobrevive ao redesenho de 30 s. Cada linha ganha *"→ passo"*.
>
> ⚠️ **O RESPONSÁVEL É UMA PESSOA DO PCP, COM O "MEUS CASOS"** (fase 3 🔴,
> decisão do dono, linha em `docs/DECISOES.md`). `devolucao_caso.responsavel_id`
> e `responsavel_nome` (retrato, como o `revisao.usuario_nome`), no `CREATE` e
> no `ALTER` (§17). A escolha é entre as pessoas **ativas com
> `devolucao.lancar` ou `devolucao.acompanhar`** (`GET
> /api/devolucao-casos/responsaveis`, só id e nome, e quem está logado); fora
> disso, 400. Vazio de propósito tira a pessoa. **O texto livre de antes
> (`responsavel`) não é apagado nem convertido**: aparece até alguém escolher a
> pessoa, e o caso mostra *"antes, escrito à mão"*. O **"Meus casos"** filtra
> pelo `responsavel_id` da pessoa logada; quem não tem caso vê a lista inteira,
> e a tela diz. **Lançar caso novo continua sendo `devolucao.lancar`**, que já
> é separada e se dá pela tela de Acessos (decisão do dono, 04/11/2026).
>
> ✅ **NO AR E CONFERIDO EM 04/11/2026** (PR #270): o dono fez o backup, o
> deploy e o teste de segurança (telas 302, API 401, `/login` 200, inclusive
> `/api/devolucao-casos/responsaveis`) e percorreu o roteiro na tela — o
> próximo passo de cada etapa e o "Ir para a ação ↓", o "Esperando outros"
> recolhido, a escolha do responsável e o "Meus casos", e o texto escrito à
> mão dos casos antigos aparecendo — e disse *"bateu tudo … ficou muito
> bom"*. A spec foi para `docs/arquivo/`. ⚠️ **AINDA NÃO PROVADO:** o passo
> acompanhando um caso de verdade do lançamento ao reembolso (as linhas do
> mapa que só aparecem com o tempo: o "parado" devolvendo a vez, a coleta de
> data passada, o valor do ML pedido há dias). Prova que não foi feita se
> escreve como não feita.

> ⚠️ **O LANÇAMENTO EXIGE O QUE NÃO PODE FALTAR** (decisão do dono, 04/11/2026,
> linha em `docs/DECISOES.md`: *"o local do cadastro do caso é o lugar
> principal para concentrar todas as informações"*). Nos **dois tipos**, além
> do que já era obrigatório (tipo, venda/pack/NF, prazo do comprovante no "nós
> coletamos" e o "via publicidade?"), o lançamento recusa (400) sem **motivo,
> SKU, comprador, responsável e link da conversa no ML**.
> - **A recusa é UMA e diz TODOS os que faltam** (*"Para lançar, falta: motivo ·
>   link da conversa."*), com a lista em `faltam`; a tela marca cada campo e o
>   digitado fica. Quem recusa é o servidor (`devcaso_dominio.lancar`), não a tela.
> - **O SKU e o comprador que vêm da venda no sistema contam**: a obrigação pesa
>   na devolução antiga, cuja venda não está no PCP.
> - **O responsável conta pela pessoa** (`responsavel_id`): o texto escrito à mão
>   de antes não alimenta o "Meus casos" e não vale.
> - **Os casos que já existem não são cobrados nem mudados**: ganham o chip
>   âmbar **"falta: …"** na lista e no caso (`falta_lancamento`, de
>   `devcaso_dominio.faltaLancamento`, dono único), que some quando o caso é
>   completado pelo "Salvar alterações". O encerrado não cobra nada.
> - **Fica opcional de propósito** o que muitas vezes ainda não se sabe ao lançar
>   — CEP, transportadora, data agendada, custo, valores, mensagem e observação:
>   obrigar faria inventar valor ou deixar de lançar (#6).
> - O `lancar_casos_iniciais.js` é o único que lança sem eles
>   (`semObrigatorios`), como já lançava sem a publicidade.
> - **Editar e apagar um desses campos depois continua permitido**; o chip
>   passa a acusar.

> ⚠️ **"CASOS DE:" E O DESEMPENHO POR RESPONSÁVEL** (spec
> `docs/arquivo/DEVOLUCOES-DESEMPENHO.md`, 04/11/2026, dono: *"ver os casos que estão para o
> Renato e se ele está fazendo as tarefas dentro do prazo"*). Nenhuma regra,
> permissão ou schema novo: só leitura do que está gravado.
> - **"Casos de: Todos · Eu · [pessoas] · Sem responsável"** substituiu o botão
>   "Meus casos" ("Eu" é o de antes). O quadro **"Por responsável"** dos casos
>   abertos (casos, esperando a gente, vencidos, vencem hoje/amanhã, parados)
>   sai do `devcaso_dominio.resumoPorResponsavel`, sobre as **mesmas** linhas da
>   lista (`listar().por_responsavel`). A tela não conta (#12).
> - **A aba "Desempenho"** (`devcaso_dominio.desempenho`, `GET
>   /api/devolucao-casos/desempenho?mes=`) mostra os casos **encerrados** no mês
>   por responsável. **O caso conta para o responsável**, não para quem clicou
>   (decisão do dono, linha em `docs/DECISOES.md`). O prazo cumprido é chegar à
>   etapa que o cumpre até o fim do dia do **prazo final** (o prorrogado conta
>   pelo novo, e à parte); fechar como perda sem chegar é vencido. O tempo é a
>   **mediana**, com o maior ao lado — a média deixaria um caso de 60 dias
>   esconder os outros. "Vezes parado" são os intervalos entre dois "andar"
>   (`ANDAM`) que chegaram ao `devol_parado_dias`. Sem prazo decidido é "—",
>   nunca "0 de 0". **Nenhum valor em reais.**
> - **Conta daqui para frente**: o nome escrito à mão dos casos antigos não é
>   pessoa e vai para **"Sem responsável"**, sem chute.
>
> ✅ **NO AR E CONFERIDO EM 04/11/2026** (PR #275): o dono fez o deploy e o
> teste de segurança (telas 302, API 401, `/login` 200, inclusive
> `/api/devolucao-casos/desempenho`) e conferiu na tela o "Casos de: Renato",
> o clique no quadro "Por responsável" filtrando e a aba Desempenho — e disse
> *"bateu tudo"*. A spec foi para `docs/arquivo/`. ⚠️ **AINDA NÃO PROVADO:**
> o primeiro mês com casos encerrados que tenham responsável escolhido (os
> números do Desempenho com dado real), um prazo prorrogado contando pelo novo
> e um caso parado entrando em "vezes parado". Prova que não foi feita se
> escreve como não feita.

> ⚠️ **TODO EVENTO DO CASO GRAVA QUEM FEZ, PELO ID (05/11/2026)** — fase 5 da
> `QUEM-FEZ-E-REVISAO`. Até aqui o id só entrava no clique de etapa (era o que o
> desfazer precisava); agora o `evento()` do `devcaso_dominio` grava `usuario_id`
> ao lado do nome em toda linha, e o caso ganhou `criado_por_id` e
> `encerrado_por_id` (a reabertura limpa o segundo), a coleta e o anexo o
> `usuario_id`. **Sem login, as 24 escritas são 401** — uma porta só, o `post` do
> `devcaso_route.js`. O caso e o evento de antes ficam sem id: não se inventa.

**Rode `node teste_devolucao_casos.js` (910 casos) — e, na tela, `node teste_devolucao_casos_tela.js` (202) — ao mexer no
`devcaso_dominio.js`, no `devcaso_route.js`, no bipe ou na baixa do
`dev_route.js`, ou nas listas de motivos e documentos do `cad_route.js`** —
e `node teste_devolucao.js` (48), que tem que passar sem mudar o esperado. Os
defeitos reintroduzidos um a um (cada um reprova pelo menos um caso): a lista
pela data de lançamento, o original sobrescrito, o acréscimo sem a marca, o
vencido sem cor, o "nós coletamos" encerrando na baixa, a resposta sem caso
ganhando chave, a sugestão de quem só falhou, a segunda ida com custo zero, a
etapa ③ sem a trava, devolver sem a foto, o valor vazando pelo fio, o
relatório contando duas vezes, a auditoria sem amortecer e o reembolso sem
revisão. Na permissão, `node teste_acesso.js`; na pasta, `node
teste_caminhos.js`.

**Ferramenta:** `node lancar_casos_iniciais.js` (simula) e `--aplicar` lançam
os 6 casos da tabela de 29/10/2026, com backup antes e sem duplicar. O SKU
da tabela não tem o `BK`: o script usa o do `lote` e, sem a venda no sistema,
grava o texto como veio com *"conferir"* na observação.

> ✅ **NO AR E CONFERIDO EM 03/11/2026** (PRs #250 e #251): o dono fez o
> deploy (telas 302, API 401, `/login` 200, inclusive `/devolucoes` e
> `/api/devolucao/abas`) e conferiu na tela:
> - a simulação do `lancar_casos_iniciais.js` achou **as 6 vendas no sistema**,
>   todas com o SKU do cadastro (nenhuma para conferir), e os casos #1 a #6
>   estão gravados; a rodada seguinte do `--aplicar` **pulou os seis** — não
>   duplicar está provado com dado real;
> - as **cores do prazo** bateram nos seis (7336 vence hoje em vermelho, 8040 e
>   7451 com 1 dia em vermelho, 7245 em âmbar, 8271 e 7675 sem cor);
> - o "Devoluções" do rodapé leva a Em andamento com a faixa de abas, e a aba
>   **Baixa** abre o Admin na aba Devoluções.
>
> ✅ **OS AJUSTES DE 03/11/2026 ESTÃO NO AR E CONFERIDOS** (PRs #254, #255 e
> #256, num deploy só): o dono fez o backup, o deploy e o teste de segurança
> (telas 302, API 401, `/login` 200) e percorreu o roteiro na tela — o
> lançamento com "Reclamação aberta em" e "Coletar até", o chip dizendo qual
> prazo corre, a abertura preenchida nos 6 casos antigos, quem só acompanha
> vendo e salvando os valores sem os botões da baixa, e a permissão do
> dinheiro dada pela tela de Acessos — e disse *"bateu tudo"*.
>
> ⚠️ **AINDA NÃO PROVADO:** o Renato acompanhando um caso até o fim (coleta,
> documentos, chegada, reembolso); a primeira caixa bipada pelo Edvaldo
> mostrando a tarja e ligando o caso; o aviso da coleta agendada depois do
> prazo e o do custo acima do limite do frete com um caso de verdade; e a
> revisão do frete do "ML devolve" respondida pelo ML. Prova que não foi feita
> se escreve como não feita.

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

### ⚠️ A ENTRADA E A SAÍDA DO LOGIN FICAM REGISTRADAS (05/11/2026)

Fase 6 da spec `QUEM-FEZ-E-REVISAO` (linha em `docs/DECISOES.md`). O `auth.js`
é o dono das duas tabelas:

| Tabela | Uma linha por | O que guarda |
|---|---|---|
| `sessao` | login | quem, `entrou_em`, `saiu_em`, `como_saiu` (`logout`, `bloqueado`, `expirou`), IP e aparelho |
| `sessao_evento` | coisa que acontece | `login`, `logout`, `troca_setor` (com o destino), `troca_pin`, `bloqueado`, `expirou` |

> ⚠️ **O COOKIE PASSOU A LEVAR O NÚMERO DA SESSÃO (`{id, s}`), E O DE ANTES
> CONTINUA VALENDO.** A sessão dura 1 ano e os tablets quase nunca passam pela
> tela de PIN: rejeitar o cookie só com o id deslogaria a fábrica inteira no
> deploy. O que esse cookie faz vira evento com quem e quando, **sem
> `sessao_id`** — o passado não se reconstrói. O número não vai para a tela (não
> entra no `/api/auth/eu`).
>
> ⚠️ **NINGUÉM AVISA O SERVIDOR QUANDO O COOKIE VENCE.** A sessão aberta há mais
> de 365 dias fecha como `expirou` no boot e a cada login. A de quem foi
> **bloqueado** no cadastro fecha como `bloqueado` no primeiro pedido que chega
> com ela — uma vez só, não a cada pedido.
>
> ⚠️ **A TROCA DE SETOR É UM AVISO DA TELA** (`POST /api/auth/setor`, `para` =
> `padrao` ou `sobmedida`): a `/setor` e os dois atalhos da barra ("Sob medida →",
> "Medida padrão →") avisam ao clicar, com `keepalive`, e seguem o link. Sem
> sessão é 401; destino fora da lista é 400. A rota é do portão (`/api/auth/*`),
> como o logout: não tem chave.
>
> ⚠️ **AS DUAS TABELAS FICAM FORA DO MODO TESTE**, de propósito: o login feito com
> o modo ligado é um login de verdade. Registrar nunca derruba o login — um erro
> ali vai para o log, e a pessoa entra do mesmo jeito.
>
> ⚠️ **SAIR NÃO INVALIDA O COOKIE NO SERVIDOR** (era assim antes, e ficou): o
> logout apaga o cookie no navegador e fecha a linha da sessão. Recusar o cookie
> de sessão fechada seria regra nova de acesso — não estava no plano.

**Rode `node teste_login.js` (115) ao mexer na sessão, no logout ou na `/setor`.**
Doze defeitos foram reintroduzidos um a um, e cada um reprova.

### ⚠️ O HTTPS ENTRA PELO TRAEFIK QUE JÁ EXISTE NO SERVIDOR (26/10/2026)

Fase 5-B da spec `ACESSOS-UNIFICADOS` (dívida 2). Endereço novo:
**`https://pcp.deccorar.com.br`**. Passo a passo em [`docs/HTTPS.md`](docs/HTTPS.md).

> ⚠️ **AS PORTAS 80 E 443 SÃO DO TRAEFIK (Docker), E NÃO DO NGINX.** O Traefik já
> tira certificado do Let's Encrypt para o n8n. Ligar o nginx na 443 brigaria pela
> porta e derrubaria o n8n. E o Traefik **não lê arquivo**, só etiqueta de serviço:
> o PCP entra por um serviço `pcp-https` (socat) que repassa para
> `172.19.0.1:3010` — o servidor visto de dentro do Docker. O PCP continua no pm2,
> sem Docker nenhum.

> ⚠️ **O COOKIE SÓ GANHA `Secure` QUANDO A PESSOA ENTROU POR HTTPS** (o Traefik
> avisa pelo `X-Forwarded-Proto`). Pelo endereço velho (`http://…:3010`) ele sai
> como antes: na transição os dois endereços funcionam, e um `Secure` ali faria
> ninguém conseguir logar até o tablet ser trocado. O cabeçalho pode ser forjado
> por quem chama a 3010 direto, mas o único efeito é o próprio cookie dele ficar
> mais restrito.

> ⚠️ **A PORTA 3010 SÓ FECHA DEPOIS DE TODO TABLET NO ENDEREÇO NOVO** (etapa 2 do
> `docs/HTTPS.md`). O ícone da Tela de Início guarda o endereço velho: cada
> estação é apagada e adicionada de novo. Fechar antes deixa a bancada de fora. E
> o `ufw` precisa liberar `172.19.0.0/16` antes de tirar a porta da internet,
> senão o próprio `pcp-https` deixa de chegar ao PCP. **HSTS fica para depois**:
> uma vez mandado, o navegador guarda.

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

### ⚠️ TODA ESCRITA GRAVA QUEM FEZ — A REGRA-MÃE TRAVADA POR TESTE (05/11/2026)

Spec `QUEM-FEZ-E-REVISAO` (fases 1 a 7), decisão do dono de 04/11/2026: *"tudo
que for feito na fábrica … precisa estar gravado e atrelado ao PIN de quem está
logado"*. Linhas em `docs/DECISOES.md`.

| Regra | Quem garante |
|---|---|
| Quem fez vem do servidor (`req.usuario`), **nunca** da tela | `quem.js` |
| `quem.js` é o dono único: `quem`, `exigir` (401), `nomeDe`, `idDe`, `pessoa`, `mesmaPessoa`, `portao`, `auditar` | `teste_quem.js` (estático) |
| **Sem login, nenhuma escrita grava** (401) — as 143 do PCP, mais as duas do `server.js` | `teste_quem.js` (dinâmico) |
| O id entra **ao lado** do nome que já existia; o nome fica, como retrato | cada teste da tela |
| A linha que **não tem autor** (cadastro, configuração) vira linha na `auditoria`, que já guarda `usuario_id` | `teste_quem.js` (1-B) |

> ⚠️ **TODO MÓDULO DE ROTAS COM ESCRITA COMEÇA COM `app = QUEM.portao(app)`.**
> A porta troca o último handler de cada `post`/`put`/`patch`/`delete` por um que
> chama o `exigir` antes — **a rota que alguém escrever amanhã nesse módulo já
> nasce fechada**, sem lembrar de nada. O `bigJson` do upload continua lendo o
> corpo antes, e os testes que chamam o handler direto encontram a porta. Só o
> `auth.js` (é o login) e o `server.js` (a rota dele chama o `exigir`) ficam de
> fora, nomeados no teste.
>
> ⚠️ **`QUEM.portao(app, { auditar:'categoria' })`** é para o módulo cuja linha
> não tem coluna de autor (`sku_cad_route`, `sku_route`, `cad_route`,
> `compras_route`, `ficha_route`, `alvo_route`, `st_route`, `cruz_route`,
> `teste_route`): a escrita que deu certo grava `METODO /rota` e o alvo na
> `auditoria`. A recusa (resposta com `erro` ou status ≥ 400) não grava. Espalhar
> `atualizado_por_id` por dez tabelas de cadastro seria schema demais para o mesmo
> dado.
>
> ⚠️ **NENHUMA ROTA LÊ O NOME DE QUEM FEZ DIRETO DO `req.usuario`, NEM PASSA O
> `req.usuario` INTEIRO PARA O DOMÍNIO GRAVAR.** É `QUEM.nomeDe(req)`,
> `QUEM.idDe(req)` ou `QUEM.pessoa(req)` (`{id, nome}`). Perguntar permissão com
> o `req.usuario` continua livre: aquilo não é autoria. O `acesso.js` (a porta da
> auditoria) e o `auth.js` (quem põe o `req.usuario`) são as exceções nomeadas.
>
> ⚠️ **O SOB MEDIDA GRAVA O ID NA PORTA ÚNICA DELE** (`tecido/nucleo/registro.js`,
> migração 39 do `tecido.db`: `auditoria.usuario_id`). Toda escrita do módulo já
> passava por ali, e ali já se auditava — só com o nome. As tabelas próprias do
> sob medida não ganharam coluna: o "quem" delas está na auditoria.
>
> **O id que entrou na fase 7, ao lado do nome:** `lote.resolvido_por_id` (as
> decisões de Bloqueados), `venda_sem_etiqueta` e `pdf_conta_aberta.resolvida_por_id`,
> `correcao.desfeita_por_id`, `oferta.atualizado_por_id`, `preco_historico` e
> `custo_sku_historico.usuario_id`, `pedido_compra.criado_por_id` e `pago_por_id`,
> `recebimento.recebido_por_id` — todos no `CREATE` e no `ALTER` guardado (§17).
> O `enviado_por` do pedido **não é pessoa** (pdf, whatsapp, outro), e o
> `cancelada_por`/`cancelada_resolvida_por` do `lote` ficam só com o nome: o id
> está no `cancelamento_caixa` (fase 4) e na `correcao` (a Mesa).

> ✅ **AS SETE FASES ESTÃO NO AR DESDE 05/11/2026** (PRs #284 a #290): o dono
> fez o backup, o deploy e o teste de segurança, e o grep do `portao` deu 4. A
> spec foi para `docs/arquivo/`. ⚠️ **AINDA NÃO PROVADO:** o primeiro bipe duplo
> recusado na bancada, um desfazer de verdade e a primeira sessão nova gravada
> em `sessao`. Prova que não foi feita se escreve como não feita.

**Rode `node teste_quem.js` (244) ao criar QUALQUER rota de escrita, mexer no
`quem.js` ou num `require` de módulo de rotas.** Ele sobe os módulos na ordem do
`server.js` e chama cada escrita sem login; rota nova que não passa pelo `quem.js`
reprova no mesmo minuto em que é escrita.

### A alçada — tudo que é novo entra no controle de acesso (04/11/2026)

Spec `docs/arquivo/ACESSO-POR-TELA-E-NIVEL.md` §3, regra do dono: *"tudo que for
novo no sistema, a partir de hoje, tem que ser revisado e entrar no controle de
alçadas — nível, tela, acesso."* Linha em `docs/DECISOES.md`.

| # | Regra | Quem garante |
|---|---|---|
| R-ALC-01 | Nada nasce fora do controle de acesso: tela, ação (permissão), setor, módulo e rota novos só existem declarados | os testes abaixo |
| R-ALC-02 | Tela nova: linha no mapa (`telas.js`) com número, módulo, nível e permissão | `teste_mapa.js` |
| R-ALC-03 | Ação nova: permissão em `permissoes.js` com nível, rótulo e **a tela onde é usada** (`tela: 301`); `sensivel` quando mexe em estoque, dinheiro, acesso ou dado de pessoa | `teste_mapa.js` |
| R-ALC-04 | Setor novo: nasce com nível e vazio de pessoas; só recebe telas e ações do nível dele ou abaixo | `teste_acesso.js` |
| R-ALC-05 | Rota nova: linha no `permDaRota` (#29, desde 17/09/2026) | `teste_cobertura.js` |
| R-ALC-06 | Tudo novo nasce só para o Admin Geral; quem recebe é decisão do dono, na tela de Acessos, depois da entrega | R-TEL-03 |
| R-ALC-07 | O PLANO de toda tarefa traz o bloco 🔐 ALÇADA, e o FECHAMENTO a linha "Alçada conferida" | §0 |
| R-ALC-08 | Spec nova traz a seção "Alçada": para cada tela e ação nova, o número, o nível e o setor sugerido | `docs/specs/README.md` |
| R-ALC-09 | Rota nova de escrita grava quem fez pelo `quem.js` e é 401 sem login — o módulo de rotas começa com `app = QUEM.portao(app)` (05/11/2026) | `teste_quem.js` |

> Até o mapa e os testes existirem (fases 2 e 7 da spec), a regra vale pelo
> PLANO, e o `teste_cobertura.js` já cobre a rota.

### ⚠️ O MAPA DE TELAS — uma tela, uma linha, um número (fase 2, 04/11/2026)

`telas.js` (raiz) é o **dono único** de "que telas a medida padrão tem": número,
nome, endereço, nível, onde se trabalha, as permissões que a abrem, a área de
chegada e a aba antiga do Admin. O sob medida põe **número 6xx e nível** no
próprio `tecido/nucleo/telas.js` (o `/inicio` é apelido do `/`, uma linha só).
Quem lê o mapa: as linhas de **tela** do `permDaRota` (as de API não mudaram) e
o `destino.js`. Toda permissão de `permissoes.js` tem `tela` (R-ALC-03); as do
sob medida tiram a dela do `TELA_DA_CHAVE` do módulo.

> ⚠️ **O NÚMERO NUNCA MUDA E NUNCA SE REAPROVEITA** (R-TEL-02). A centena é o
> módulo onde a tela nasceu; tela que muda de módulo fica com o número, e tela
> que sai deixa o número vago. É o que permite falar *"libera a 204"*.
>
> ⚠️ **OS NÍVEIS DO MAPA SÃO OS DE HOJE, E NÃO OS DA PROPOSTA DA SPEC** onde os
> dois divergiram: 104 Problemas e 204 Pendências ficaram **Admin** (a proposta
> era Supervisor, que daria a tela a quem hoje não abre o Admin), e o 401
> Planejamento ficou Admin abrindo com `planilha.importar` (decisão D1 (b) do
> dono). Para mudar, é decisão dele, e muda a linha do mapa.
>
> ⚠️ **A ORDEM DE CHEGADA É UMA LISTA PRÓPRIA** (`CHEGADA`), e não a ordem do
> mapa: ela decide para onde cada pessoa vai de manhã, e é a do `PADRAO` antigo.
>
> ⚠️ **A FASE 2 NÃO DEU NEM TIROU NADA DE NINGUÉM, e isso está provado pessoa a
> pessoa.** `perfis_acesso.js` monta um banco de exemplo (uma pessoa por setor
> nativo, exceção que concede e que revoga, dois setores, setor feito à mão com
> chave acima do nível, ninguém em setor nenhum), e o `teste_mapa_antes.json`
> é o retrato de ANTES do mapa: o que cada uma abre, as permissões e o destino.
> O `teste_mapa.js` compara. **Não regrave esse arquivo para o teste passar** —
> ele é a prova; regravar é apagar a prova.

**Rode `node teste_mapa.js` ao criar tela, permissão, mexer no `telas.js`, no
`permDaRota` ou no `destino.js`.** Ele reprova `.html` em `public/` ou `views/`
sem linha no mapa (fora o login, a `/setor` e o Admin), número repetido, tela
sem nível ou sem permissão, permissão sem `tela`, tela do sob medida sem número
e a tela escrita à mão de novo no `acesso.js`. Oito defeitos foram
reintroduzidos um a um, e cada um reprova.

### ⚠️ O NÍVEL É DA PESSOA (fase 3 da `ACESSO-POR-TELA-E-NIVEL`, 04/11/2026)

`usuarios.nivel` — `operacao`, `supervisor`, `admin` ou `admin_geral` —, no
`CREATE` e no `ALTER` guardado do `auth.js` (o dono da tabela) e repetido no
`acesso.js`, que sobe sozinho nos testes. Um nível só por pessoa, e ele é o
**teto** (R-NIV-02; quem o faz valer é a fase 4, abaixo).

> ⚠️ **A MIGRAÇÃO RODOU UMA VEZ SÓ** (`config.nivel_pessoa_1`), e deu a cada
> pessoa o **maior nível que ela já alcançava** (R-NIV-05): o nível da permissão
> mais alta que ela tem de fato, por setor ou exceção — **e não o nível do
> setor**. Quem estava num setor marcado Admin com só chaves de Operação
> ganharia o Admin na trava. Quem está no setor Admin Geral é Admin Geral. Rodar
> de novo apagaria o ajuste que o dono faz pessoa a pessoa depois.
>
> ⚠️ **SÓ O ADMIN GERAL MUDA O NÍVEL** (R-NIV-04), por `POST
> /api/acesso/usuario/:id/nivel`, com o de antes e o de depois na auditoria
> (`usuario_nivel`). Na tela de Acessos é um botão próprio, e não salva junto
> com o nome: subir de nível é promoção, não caixinha. Quem está no setor Admin
> Geral não desce por ali — tira-se do setor antes. **Pessoa nova nasce
> Operação.**

### ⚠️ O NÍVEL É O TETO — a trava (fase 4, 04/11/2026)

**Muda a R-ACE-03** (o nível do setor era só etiqueta; linha em `docs/DECISOES.md`).

| Onde | O que a trava faz |
|---|---|
| `permissoesDe` | a permissão efetiva é só a do nível da pessoa ou abaixo — venha do setor ou da exceção. **O que passa do teto não é apagado**: só não vale, e aparece no `cortadasPeloNivel` (e no `nivel_relatorio.js`) |
| exceção (`.../excecao`) | conceder acima do nível da pessoa: **400**, *"exige nível Admin — a pessoa é nível Operação"*. Revogar e limpar continuam livres |
| setores da pessoa | pôr num setor de nível maior que o dela, ou que **carrega** chave acima do nível dela: **400**, com a frase. O setor que ela **já tinha** não trava a edição |
| salvar um setor | a chave **nova** acima do nível do setor: **400**, *"exige nível X — o setor é nível Y"*, mesmo confirmando. A que **já estava** fica, e entra na lista `setoresAcimaDoNivel` para o dono decidir (R-ALC-04) |
| `@admin` e a área `admin` | é o **nível da pessoa** ≥ Admin (`ehNivelAdmin`), e não mais "tem alguma permissão de nível Admin" |

> ⚠️ **O RELATÓRIO DE QUEM PERDERIA SAIU VAZIO, E TEM QUE SAIR VAZIO EM
> PRODUÇÃO** — por construção: a migração deu a cada pessoa o nível da
> permissão mais alta que ela tinha, e o corte só tira o que passa desse nível.
> A prova com dado real é rodar `node nivel_relatorio.js` no servidor depois do
> deploy: a seção 2 tem que dizer *"ninguém"*. Se não disser, é defeito.
>
> ⚠️ **NÍVEL VAZIO NÃO CORTA NADA.** Ele só existe em linha criada por SQL
> direto (um teste, um script); a pessoa criada pela tela nasce `operacao`, e o
> deploy grava todo mundo. Não é furo: quem escreve SQL no banco já passou por
> qualquer trava.
>
> ⚠️ **O ADMIN GERAL (PELO SETOR) NÃO TEM TETO**, e continua passando antes da
> chave (#29). **Baixar o nível de alguém não apaga nada**: subindo de volta, ele
> tem tudo de novo.

### ⚠️ O ADMIN VIROU TELAS (fase 5, 04/11/2026)

O Admin de 16 abas acabou (R-TEL-05): cada aba é uma tela do mapa com endereço,
número e permissão próprios — `/admin/producao` (103), `/admin/problemas`
(104), `/admin/pendencias` (204), `/admin/correcoes` (205),
`/admin/devolucoes` (253), `/admin/estoque` (301), `/admin/contagem` (302),
`/admin/skus` (402), `/admin/sku-incompleto` (403), `/admin/ficha` (404),
`/admin/compras` (501), `/admin/cadastros` (902) e `/admin/teste` (903). A aba
de Planejamento, Relatórios e Acessos era um iframe: **saiu**, e o caminho leva
à tela deles (401, 904, 901).

> ⚠️ **CADA TELA ABRE COM AS CHAVES DAS AÇÕES DELA** (decisão D2 (A) do dono):
> quem via uma aba sem ter nenhuma chave dela **deixa de ver** — a seção 4 do
> `nivel_relatorio.js` lista, pessoa a pessoa, para o dono marcar o que faltar.
> **Estoque (301), Pendências (204) e Problemas (104)** continuam abrindo para
> todo nível Admin (`@admin` no mapa). E a tela também tem **nível**: o
> Supervisor com `compras.ver` não abre a 501, que é de nível Admin.
>
> ⚠️ **É O MESMO `index.html`, SERVIDO COM `window.TELA_ADMIN`** (`admin_telas.js`):
> a faixa de abas some, só a carga daquela tela roda (`naTela`), e o caminho para
> outra aba — um card da central, o "Cadastrar" de um bloqueado — vira o endereço
> da tela dela, que o portão julga. Não foram escritos 16 arquivos novos.
>
> ⚠️ **A PORTA (`/`, `/admin`, `/index.html`) SÓ REDIRECIONA** (`views/admin_porta.html`):
> à tela do link antigo (`/admin#dv` → `/admin/devolucoes`; a âncora não chega ao
> servidor, quem lê é a página) ou à primeira tela do Admin que a pessoa alcança.
> O `admin_telas.js` fica **entre o `auth` e o `express.static`**, e o static sobe
> com `index:false` — sem isso o `/` entregaria as 16 abas direto do disco
> (armadilha #3). As telas `/admin/...` entram na lista protegida do `auth.js`
> a partir do mapa. `GET /api/telas/minhas` (`@logado`) diz as telas que a
> pessoa abre, pela mesma conta do portão.

**Rode `node teste_admin_telas.js` ao mexer no `admin_telas.js`, na porta, na
ordem do `server.js` ou no modo de tela do `index.html`.** Seis defeitos foram
reintroduzidos um a um, e cada um reprova. E o teste de segurança da §10 com as
telas novas (está no CI).

### ⚠️ A TELA DE ACESSOS PELO MAPA (fase 7, 04/11/2026)

As caixinhas da pessoa e do setor saem do mapa: **módulo → tela (número e
nível) → as ações penduradas nela** (`GET /api/acesso/registro` traz o `mapa`;
o campo `tela` de cada permissão diz onde ela pendura). A caixinha **acima do
nível** da pessoa ou do setor aparece **cinza, com a frase** (*"exige nível
Admin (a pessoa é Operação)"*) — o servidor recusaria, e a frase diz antes do
clique (R-NIV-03). A que o setor **já tem** acima do nível continua marcada e
mexível, com o aviso: sai quando alguém a desmarca. A grade **telas × setores**
(`GET /api/acesso/grade`) mostra o que cada setor recebe.

> ⚠️ **TELA E AÇÃO NOVAS APARECEM SOZINHAS, SEM SETOR NENHUM, E SÓ O ADMIN GERAL
> AS ALCANÇA** (R-TEL-03, R-ALC-06). O seed dos setores nativos só grava quando
> o setor **nasce**; num banco que já existe, a chave nova não entra em setor
> nenhum — o `teste_acesso.js` simula o deploy de uma tela nova e exige isso.
> Quem recebe é decisão do dono, na tela de Acessos, depois da entrega.

**Rode `node teste_acesso.js` ao mexer na tela de Acessos, no mapa ou nas
permissões.** Cinco defeitos foram reintroduzidos (o registro sem o mapa, ação
sumindo da tela, a grade sem o nível, setor sem nível aceito, chave nova
entrando sozinha num setor), e cada um reprova.

> ✅ **AS OITO FASES ESTÃO NO AR E CONFERIDAS EM 04/11/2026** (PR #282): o dono
> fez o backup, o deploy e o teste de segurança (telas 302, inclusive as
> `/admin/...`, API 401, `/login` 200), e o `nivel_relatorio.js` deu **ninguém**
> perdendo permissão e **nenhum** setor acima do nível, com 10 pessoas
> recebendo o nível na migração. Na tela ele conferiu a ficha com as caixinhas
> cinzas, a grade telas × setores, o ☰ Menu sem rodapé, o tablet de operador
> sem o Admin, o `/admin#dv` caindo na 253 e a baixa "por" ele — e disse
> *"bateu tudo"*. A spec foi para `docs/arquivo/`.
>
> ⚠️ **AINDA NÃO PROVADO:** a primeira tela ou ação nova de verdade nascendo só
> para o Admin Geral e sendo dada pela grade, e a primeira recusa "exige nível X"
> numa concessão de verdade. Prova que não foi feita se escreve como não feita.

**`node nivel_relatorio.js` (só lê)** copia o banco com `db.backup()` e sobe o
`acesso.js` em cima da cópia: lista cada pessoa com o nível, quem perderia
alguma permissão com a trava (tem que sair vazio) e os setores com chave acima
do nível deles. **Rode `node teste_nivel.js` ao mexer no nível, na migração ou
na trava.**

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
**Qualquer `200` numa tela é furo de segurança.** Desde a fase 5 da
`ACESSO-POR-TELA-E-NIVEL` a lista inclui as telas do Admin: `/admin/producao`,
`/admin/problemas`, `/admin/pendencias`, `/admin/correcoes`, `/admin/devolucoes`,
`/admin/estoque`, `/admin/contagem`, `/admin/skus`, `/admin/sku-incompleto`,
`/admin/ficha`, `/admin/compras`, `/admin/cadastros` e `/admin/teste` — e, desde
05/11/2026, a tela 206 `/coleta-horarios` (HORARIOS-DE-COLETA).

Proteção contra força bruta: 5 PINs errados bloqueiam a pessoa por 1 minuto —
**inclusive com o PIN certo**, senão a trava só atrasaria quem chuta —, e a trava é
por pessoa. **Rode `node teste_login.js` (115 casos) ao mexer no `auth.js` ou no `login.html`**: ele
trava o PIN guardado como scrypt com salt próprio, o bloqueio e o minuto (o
relógio do teste é trocado), o cookie assinado (trocar o id dentro dele não vira
outra pessoa), a sessão que cai quando a pessoa é bloqueada no cadastro e a
troca do PIN de 4 (sessão aberta barrada, inclusive no sob medida; PIN de hoje
exigido e contado na trava; cadastro só com 6; banco antigo ganhando a coluna) e o
`Secure` só por https. Se o
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
28/09/2026), `correcao` (Mesa de correções fase 1, 02/10/2026),
`venda_sem_etiqueta` e `pdf_conta_aberta` (27/10/2026), `fim_dia` e
`cancelamento_caixa` (03/11/2026), `recusa_estoque` e `inventario_escala`
(04/11/2026, conferência v2), `revisao_evento` (04/11/2026, a revisão
cancelada, recusada e desfeita — QUEM-FEZ-E-REVISAO), `lote_reimpressao`
(05/11/2026, cada reimpressão da etiqueta de venda, com quem).
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
| **Leitor no modo "Alt + teclado numérico" troca de tela** (o Alt+1..8 saiu com o rodapé em 04/11/2026; a regra vale para o Alt+0) | Em PC com teclado ABNT2 o leitor costuma mandar cada caractere pelo código do Windows: Alt segurado + dígitos do teclado **numérico** (o "5" chega como Alt+5-3). O `nav.js` aceitava qualquer dígito com Alt, e o primeiro dígito do código virava atalho: bipar jogava a pessoa na Etiqueta de Venda, no Carregamento, no Admin ou no "Sair do sistema?" (20/10/2026) | Atalho só pelo número da **fileira de cima** (`code` = `Digit1`…); teclado numérico com Alt nunca é atalho — `digitoDoAtalho()` no `nav.js`, travado pelo `teste_atalho.js`. ⚠️ O Playwright aperta o teclado numérico com NumLock **desligado** (`key` = "Clear"), e por isso não reproduz o defeito: para ver no navegador de verdade, mande a tecla pelo CDP com `key` = "5" e `code` = "Numpad5" |
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
| 2 | **Sem HTTPS.** PINs trafegam em texto aberto. O PIN passou a ter 6 dígitos em 21/10/2026 (fase 5-A da `ACESSOS-UNIFICADOS`). **Em código desde 26/10/2026 (fase 5-B):** `https://pcp.deccorar.com.br` pelo Traefik que já existe, cookie `Secure` por https (§10, `docs/HTTPS.md`). **Só se risca quando a porta 3010 fechar** (etapa 2): enquanto ela estiver aberta, o PIN ainda pode viajar aberto por quem usa o endereço velho | Alto se exposto à internet |
| 3 | **Revisão perdida em falha de conexão** — sem fila local de reenvio | Médio — buraco silencioso no relatório |
| 4 | `POST /api/producao` (manual) não aceita `data`, `origem` nem `urgente` | Médio — impede lançar adiantado pela tela |
| 5 | Upload não permite escolher a data das vendas | Médio — vendas de amanhã entram como hoje |
| 6 | `POST /api/revisao` retorna campos obsoletos (`estoque`, `pedido`, `feito`) | Baixo — confunde quem lê a API |
| 7 | ~~SKU `BK110X240BEGE` fora do padrão~~ **RESOLVIDO em 23/08/2026** — não há mais padrão de SKU; etiqueta e seletor leem as colunas (§7) | — |
| 8 | ~~`/devolucao` não está no menu do rodapé (`nav.js`)~~ **RESOLVIDO em 02/10/2026** — botão "Devoluções" no rodapé, ao lado de Inventário | — |
| 9 | ~~Revisão e embalagem não gravam **quem** fez (só `rejeicao` grava)~~ **RESOLVIDO em 26/10/2026** (fase 4 da `ACESSOS-UNIFICADOS`, R-ACE-06) — `revisao` e `montagem` ganharam `usuario_id` e `usuario_nome` (o nome como retrato), gravados pelo bipe; o ALTER guardado está na rota que grava (`revisao_route.js`) e no dono da tabela (`mont_route.js`). **Fica aberto:** nenhuma tela ainda mostra produtividade por pessoa — o dado começa a se acumular agora · `teste_revisao.js` e `teste_montagem.js` | — |
| 10 | Sem testes automatizados na maior parte — hoje há `teste_parse.js` (25 casos), `teste_carga.js` (67), `teste_divergencia.js` (62) `teste_estoque.js` (86), `teste_contagem.js` (36), `teste_inventario.js` (98), `teste_regras_estoque.js` (97, com o servidor de verdade), `teste_ajuste.js` (53), `teste_backup.js` (10), `teste_livro.js` (60), `teste_cruzamento.js` (14), `teste_etiqueta.js` (84), `teste_ficha.js` (40), `teste_ordem_dia.js` (17), `teste_acesso.js` (371), `teste_acessos_f2.js` (76), `teste_setor_salvar.js` (26), `teste_cobertura.js` (10), `teste_kit.js` (133), `teste_qr.js` (45), `teste_skus.js` (63), `teste_montagem.js` (64), `teste_carregados.js` (28), `teste_arrumar_sobmedida.js` (63), `teste_compras_sobmedida.js` (29), `teste_componentes.js` (43), `teste_saida.js` (62), `teste_area.js` (30), `teste_segunda_pessoa.js` (26), `teste_quem_carregamento.js` (56), `teste_quem_devolucao_contagem.js` (84), `teste_quem.js` (244), `teste_saida_coleta.js` (57), `teste_saida_agencia.js` (45), `teste_media.js` (25), `teste_cancelada.js` (38), `teste_caminhos.js` (7), `teste_destino.js` (15), `teste_linguagem.js` (13) `teste_correcao.js` (112), `teste_correcao2.js` (98), `teste_correcao3.js` (23), `teste_acuracidade.js` (23), `teste_pecas_carga.js` (37), `teste_tablets.js` (83), `teste_sobra.js` (102), `teste_modo_teste_caixa.js` (18), `teste_coleta_vps.js` (76), `teste_atalho.js` (10), `teste_carregamento_tela.js` (10), `teste_etiqueta_sku.js` (54), `teste_revisao.js` (120), `teste_upload.js` (73), `teste_impressos.js` (33), `teste_quantidade.js` (42), `teste_casos_reais.js` (46), `teste_sem_etiqueta.js` (36), `teste_devolucao.js` (48), `teste_login.js` (115), `teste_conferencia_antiga.js` (64), `teste_baixa_conferencia.js` (69), `teste_pendencias.js` (65), `teste_conta_aberta.js` (42) e `teste_religar_sem_etiqueta.js` (9) e `teste_devolucao_casos.js` (910) e `teste_devolucao_casos_tela.js` (202, precisa de navegador), `teste_conferencia_expedicao.js` (92) e `teste_conferencia_tela.js` (38, precisa de navegador), `teste_conferir_contagem_persianas.js` (22), `teste_aplicar_contagem_persianas.js` (41), `teste_ajustar_fila_embalagem.js` (26), `teste_etiqueta_envios.js` (46), `teste_mapa.js` (45), `teste_nivel.js` (98), `teste_admin_telas.js` (54), `teste_menu.js` (42), `teste_horario_coleta.js` (79); o resto não tem | Médio a longo prazo |
| 11 | ~~**A investigar: o que é o `Quantidade` da folha**~~ **RESPONDIDA em 15/09/2026** — é o pacote de vários produtos do ML: uma etiqueta com mais de uma persiana. Ver §5, armadilha #23 | — |
| 12 | **NO RADAR: trazer para o PCP o que o sob medida já tem** — decisão de 03/09/2026, sem prazo. Quatro coisas, em ordem de valor: (a) tabela `parametro` com rótulo, unidade e a explicação do que o número muda, no lugar do `config` chave/valor cru; (b) migrações numeradas com tabela `migracao`, que mata a dívida do §17 de vez; ~~(c) registro de rotas em que rota sem permissão declarada nasce negada~~ **FEITO em 17/09/2026** com a dívida 16 (§10, armadilha #29): o padrão é negar e a cobertura varre o Express; (d) envelope único `{ok,dados}` / `{ok,motivo,mensagem}`, hoje cada rota responde de um jeito | Nenhum enquanto não for feito — é melhoria, não correção. Mas cada mês que passa é mais rota nova no padrão antigo |
| 13 | ~~**Carregamento aceita volume que não foi embalado**~~ **RESOLVIDO em 17/09/2026** — o bipe exige `estagio='embalado'` (a régua do `carga.js`), recusa dizendo por onde imprimir e registra na auditoria; o `GET /api/print/:id` deixou de imprimir volume `pendente`, que era a boca do buraco. Ver §5, armadilha #27. **Fica aberto**: os volumes que já saíram assim continuam com o saldo alto. `node conferir_carregados.js` conta esse passivo (só lê); a correção é contagem + Admin → Estoque, nunca os scripts do §5 | — |
| 14 | ~~**`POST /api/montagem` (a embalagem) sem proteção**~~ **RESOLVIDO em 17/09/2026** — transação nas quatro escritas, SKU conferido (404), kit conferido no servidor e recusa aparecendo na tela; `teste_montagem.js` (42 casos). Ver §4, armadilha #26. **Fica aberto**: o código do kit é conferido quando vem, não exigido — exigir espera o refresh nos tablets. "Embalar sem revisar gera estoque" **não** entrou: é regra do §4, não defeito | — |
| 15 | ~~**`POST /api/skus` zera o estoque** quando o corpo não traz `estoque`~~ **RESOLVIDO em 17/09/2026** — campo ausente preserva os quatro campos soltos, número impossível é recusado (400) em vez de clampado, e as duas escritas viraram uma transação com o `catch` vazio fora. A rota saiu para `sku_cad_route.js` e tem `teste_skus.js` (60 casos) atrás — ver §6, armadilha #25. ~~**Fica aberto**: a rota ainda muda saldo com `sku.cadastrar`~~ **FECHADO em 21/09/2026** na fase 1 do livro: o cadastro não mexe em saldo, nem com o campo presente, nem no SKU novo — e a rota diz que ignorou (§2, o livro) | — |
| 16 | ~~**Acesso: default `@logado` e cobertura mantida à mão**~~ **RESOLVIDO em 17/09/2026** — o padrão passou a ser **negar**, a cobertura varre o Express (a lista `TODAS_ROTAS` saiu) e o boot grita o nome da rota não declarada; as 28 leituras sem dono foram declaradas e as telas `.html` gêmeas herdaram a permissão da tela. Ver §10, armadilha #29 · `teste_cobertura.js` | — |
| 17 | ~~**Acesso: duas travas faltando**~~ **RESOLVIDO em 17/09/2026** — a exceção recusa conceder chave `intransferivel`, a troca de setores tem a trava do último Admin Geral (mesma conta do `auth.js`, agora no `acesso.js`), setor novo não nasce `admin_geral` e a migração de `areas` virou evento de uma vez só (a porta A, que promovia a Admin Geral em silêncio). Ver §10, armadilha #28 | — |
| 19 | ~~**`minimo.definir` é uma chave que nenhuma rota lê.**~~ **RESOLVIDO em 26/10/2026** (fase 3 da `ACESSOS-UNIFICADOS`) — a chave saiu do registro, do setor Comprador e das exceções (uma vez só, `config.acesso_minimo_definir`). Quem manda no card Materiais continua sendo `componente.cadastrar` e `compras.ver`; ninguém perdeu nada · `teste_setor_salvar.js` | — |
| 20 | ~~**Editar um setor APAGA, sem avisar, as permissões que ele tem acima do próprio nível.**~~ **RESOLVIDO em 26/10/2026** (fase 3 da `ACESSOS-UNIFICADOS`, R-ACE-03) — o nível do setor virou **etiqueta**: a tela mostra a caixinha acima do nível como ela está (marcada, com o aviso "acima do nível do setor") e manda a lista inteira (`todas`); a tela antiga, sem a marca, não apaga nada. A permissão **sensível nova** pede confirmação (409 `sensiveis`) antes de entrar. As três **intransferíveis** continuam fora de qualquer setor que não seja o Admin Geral, agora por trava própria, e não mais pelo nível · `teste_setor_salvar.js` (26). **Desde 04/11/2026 o nível volta a travar** (fase 4 da `ACESSO-POR-TELA-E-NIVEL`), mas recusando a chave **nova** na hora, dizendo por quê — a que já estava fica, nunca se apaga (§10) | — |
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
- ❌ Devolver ao estoque a venda cancelada no passo de SEPARAR, deixar quem
  separou confirmar, ou tratar caixa sem marcação do fim do dia como cancelada:
  só a confirmação de outra pessoa devolve, e "não saiu" não é "cancelada" (§8-B)
- ❌ Voltar a exigir o bipe "no carro" de cada caixa de agência, ou deixar a
  venda futura entrar sozinha no carro ao abrir a viagem (§8-B, #9)
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
- ❌ Criar módulo de rotas com escrita sem `app = QUEM.portao(app)`, gravar quem
  fez lendo o `req.usuario` direto, ou deixar uma escrita gravar sem login: o
  `quem.js` é o dono, e o `teste_quem.js` reprova (§10)
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
- ❌ Criar tela sem linha no mapa (`telas.js`), reaproveitar um número de tela,
  ou criar permissão sem nível ou sem `tela` (§10, O MAPA DE TELAS)
- ❌ Fazer a trava do nível APAGAR permissão (de setor ou de exceção), ou
  aceitar em silêncio uma chave acima do nível — ela recusa na hora, dizendo
  "exige nível X" (§10, R-NIV-03)
- ❌ Dar a pessoa de Operação permissão de escritório por exceção (§10)
- ❌ Voltar a abrir a porta `@admin` por "ter alguma permissão de nível Admin":
  é o NÍVEL da pessoa (§10, fase 4)
- ❌ Rodar de novo a migração do nível (`config.nivel_pessoa_1`), dar o nível
  pelo nível do SETOR, ou deixar alguém que não é Admin Geral mudar nível (§10)
- ❌ Regravar o `teste_mapa_antes.json` para um teste passar: ele é a prova de
  que ninguém ganhou nem perdeu acesso (§10)
- ❌ Criar tela, ação (permissão), setor ou rota sem a declaração de alçada —
  nível e lugar —, ou entregar o PLANO sem o bloco 🔐 ALÇADA (§0, §10, R-ALC)
- ❌ Mover `express.static` para antes do `auth`, tirar o `index:false` dele, ou
  registrar o `admin_telas.js` depois do static: o `/` voltaria a entregar as 16
  abas direto do disco (§10, fase 5)
- ❌ Voltar a pôr tela do Admin em iframe, ou a mostrar as 16 abas a quem
  entra: cada aba é uma tela, com a permissão dela (§10, R-TEL-05)
- ❌ Rejeitar o cookie antigo (só com o id) ou pôr `sessao`/`sessao_evento` no
  modo teste: o deploy deslogaria os tablets, e o login em teste é de verdade (§10)
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
- ❌ Dar uma tela ou ação nova a um setor por seed ou backfill sem o dono pedir:
  nasce só para o Admin Geral (§10, R-TEL-03)
- ❌ Pôr de volta o rodapé de atalhos ou o Alt+número de troca de tela, ou
  escrever uma lista de telas no `nav.js`: o menu sai do mapa, por pessoa (§20)
- ❌ Criar botão de ação sem `data-perm`, ou achar que esconder o botão protege
  a ação: quem tranca é a rota (§20, R-TEL-04)
- ❌ Criar tela interna sem o `nav.js` da operação: ela nasce sem "Trocar
  setor" e sem o atalho, e a pessoa só sai pelo login (§20, Regra A)
- ❌ Escrever chefia, chefe, patrão, dono ou gestão em texto que aparece para
  quem usa o sistema — nomeie a etapa, ou o nível de acesso (§20, Regra B)
- ❌ Declarar tela no `tecido/nucleo/telas.js` sem a porta na `inicio.html` e
  o nome no `NOMES` do `nav.js` — o vendedor lia "nenhuma tela" com as telas
  dele no rodapé (§20)
- ❌ Escrever uma segunda lista de "para onde a pessoa vai": é o `destino.js`,
  e foi a cópia do login que mandava o vendedor de volta ao PIN (§20)
- ❌ Deixar o "Fechar vencidos" aceitar HOJE como corte, ou o "Dar saída" valer para a venda que vence hoje: em 28/10/2026 isso fechou como "saiu" as 50 vendas da fila do dia, e a lista da Etiqueta de Venda sumiu sem erro (§5, R-COR-04)
- ❌ Encerrar caso de devolução vencido sozinho, numa leitura ou num script:
  pode ter havido prorrogação não lançada, e quem decide é o admin geral (§9-B, R7)
- ❌ Gravar custo, valor do ML ou valor perdido vazio como zero: o saldo e o
  total do mês ficam incompletos e saem como piso (§9-B, R9)
- ❌ Mandar `valor_ml`, `custo`, `saldo` ou os valores pelo fio a quem não lança
  nem acompanha, mandar os totais do relatório sem `devolucao.dinheiro`, ou
  escrever o número na história do caso (§9-B, R15)
- ❌ Fazer a baixa encerrar sozinha o "ML devolve", ou fechar com a revisão no
  ML pedida e sem resposta: sem o "Já revisei" o prazo de contestar passa, e a
  cobrança ou a reputação somem da lista (§9-B)
- ❌ Deixar caso parado sem dizer o que falta para encerrar, ou escolher sozinho
  o caso quando os finais do Pack ID batem em mais de um (§9-B)
- ❌ Desligar a revisão do caso e deixar a baixa dela de pé, ou desligar sem
  motivo: a reputação e o motivo daquela baixa vieram do caso errado (§9-B)
- ❌ Procurar o caso só pela venda, pack ou NF e deixar a revisão solta calada:
  a etiqueta de devolução do ML é outro número, e o caso se acha pelo SKU (§9-B)
- ❌ Pôr a cor ou a ordem do "nós coletamos" num prazo só, ou travar a coleta
  agendada depois do prazo ou o custo acima do limite: são dois prazos e dois
  avisos, e quem decide é quem acompanha (§9-B)
- ❌ Dar `devolucao.dinheiro` ao setor Admin pelo seed: ela vai pela tela de
  Acessos, e o banco novo tem de ser igual à produção (§9-B, §17)
- ❌ Criar uma segunda lista de motivos para os casos em andamento, ou pôr motivo
  novo no `seed()` do `cad_route.js` — ele só grava em lista vazia; motivo novo
  entra por acréscimo de uma vez só (§9-B, R12)
- ❌ Pôr de novo um segundo "Devoluções" no rodapé, ou mostrar a faixa de abas
  pela coluna `areas`: ela é sombra, e o link do primeiro deploy não apareceu
  para ninguém por isso (§9-B)
- ❌ Gravar anexo de devolução em `lotes/` (o cron apaga em 7 dias) ou fora da
  transação da linha (§9-B, R21)
- ❌ Voltar a ter mais de um "Salvar" no caso gravando só o próprio bloco, ou
  redesenhar o caso sem devolver o que estava digitado: o dono digitou o
  responsável e o valor, salvou um, e o outro sumiu calado (§9-B)
- ❌ Encerrar o "ML devolve" na baixa com a revisão do frete pedida e sem
  resposta: a cobrança some da lista de abertos (§9-B)
- ❌ Deixar trocar um caso para "ML devolve" com coleta pedida ou valor do ML
  lançado: o dinheiro da coleta sai do relatório calado (§9-B)
- ❌ Contar a publicidade vazia como "não", ou deixar o link da conversa aceitar
  algo que não comece com `http(s)://` — ele vira botão que abre na sessão de
  quem clica (§9-B, AJUSTE de 03/11/2026)
- ❌ Gravar o próximo passo da devolução, ou montá-lo na tela: ele é conta do
  `devcaso_dominio.proximoPasso`, e uma segunda régua diverge no primeiro
  ajuste (§9-B, #12). E nenhum valor em reais na frase dele
- ❌ Apagar ou converter sozinho o texto livre do responsável dos casos de
  antes, ou deixar escolher como responsável quem não lança nem acompanha
  (§9-B, fase 3 do próximo passo)
- ❌ Lançar caso de devolução sem motivo, SKU, comprador, responsável ou link
  fora do script dos casos iniciais, recusar um campo de cada vez, ou contar o
  texto livre como responsável (§9-B, 04/11/2026)
- ❌ Oferecer ou aceitar etapa à mão num caso de devolução que já chegou: as
  etapas à mão são de antes da chegada, e a trilha mentiria (§9-B)
- ❌ Desfazer a chegada de um caso com a peça já revisada, ou desfazê-la sem
  limpar o `chegou_em`: o caminho da peça errada é o "desligar" (§9-B)
- ❌ Contar o quadro "Por responsável" ou o desempenho na tela, usar a média
  no lugar da mediana, contar o prazo pelo original, ou dar a um caso antigo
  um responsável pelo nome escrito à mão (§9-B, 04/11/2026)
- ❌ Voltar a pedir aprovação quando duas contagens cegas batem, ou olhar só o
  livro para saber se mexeram no SKU durante a contagem: a etiqueta só reserva
  (§18, conferência v2)
- ❌ Pôr o Admin Geral no rodízio pelo nível, ou rodar o `teste_regras_estoque.js`
  na porta 3010 — no servidor ele conversaria com a produção (§18)
- ❌ Somar +1 na embalagem de SKU sob medida: a Conferência não o baixa, e o
  saldo sobe para sempre (R-EST-05, CONSERTO de 04/11/2026)
- ❌ Pôr de volta uma segunda porta de upload do PDF, ou reaproveitar o número
  203: o upload é só na 103 (§8, 05/11/2026)
- ❌ Guardar o horário da coleta por dia da semana, reescrever a modalidade da
  etiqueta pela saída escolhida no upload, marcar com a coleta de hoje a venda
  de outro dia, ou travar o upload sem saída (§8, R-HCO)
- ❌ Contar uma pendência dentro do `pendencias_dominio.js`: a central pergunta
  à função da tela dona, senão diz 3 onde a aba diz 5 (§5, a central, #12)
- ❌ Esconder da central a linha que a pessoa não pode resolver, ou mandar nela
  SKU, cliente ou saldo: o número aparece para todos, o detalhe fica na tela
  dona (§5, a central)

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
| R-EST-17 | Quem conta não vê o saldo, nem no JSON; conta-se toda caixa embalada SEM etiqueta de venda, contra o LIVRE |
| R-EST-18 | Ninguém conta duas vezes o mesmo SKU nem resolve o que contou, nem o Admin Geral; o aprovador único do ajuste espera |
| R-EST-19 | O caminho da contagem (v2): duas que batem APLICAM SOZINHAS; a 3ª desempata; o admin só recebe o que nem a 3ª resolveu; mexeram durante a contagem → reconta na hora |
| R-EST-24 | A lista do dia (8, às 7h, seg a sex), o rodízio de duas pessoas, as 10h, a tarja que não bloqueia, a quinzenal e a geral |
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

### ⚠️ A CONFERÊNCIA EM DUAS PESSOAS — versão 2 (04/11/2026)

Spec `docs/specs/ESTOQUE-LIVRO-E-CONFERENCIA.md` v2, construída **como mudança
sobre o que já estava no ar** (decisão do dono): a v1 (livro, três papéis, ajuste
em duas pessoas, reservado e acuracidade) não foi refeita. Cartões R-EST-17 a
R-EST-19 e **R-EST-24**. O que parece bug e não é:

> ⚠️ **DUAS CONTAGENS QUE BATEM MUDAM O SALDO SEM NINGUÉM APROVAR.** Não é a fila
> de aprovação quebrada: é a regra (`DECISOES.md`). O furo vai para o **relatório
> de furos** (aba Contagem do admin, `contagem.relatorio`), com quem contou e o
> extrato do SKU desde a conferência anterior. O admin (`contagem.resolver`) só
> recebe o que nem a 3ª contagem resolveu — e os itens que já esperavam aprovação
> no dia do deploy, pela regra velha.
>
> ⚠️ **A ETIQUETA IMPRESSA NO MEIO DA CONTAGEM INVALIDA A CONTAGEM, E A CONFERÊNCIA
> NÃO.** "Mexeram no SKU" é o **livre** (saldo − caixa impressa) que mudou entre o
> primeiro bipe (ou o toque no SKU) e o "terminei", ou linha do livro que não seja
> a baixa da Conferência (`inventario_dominio.mexeram`). A etiqueta não gera linha
> no livro desde 22/10/2026 — olhar só o livro, como a spec escrevia, deixaria a
> etiqueta passar. A baixa da Conferência é de caixa que já estava fora da
> prateleira. Decisão do dono, 04/11/2026.
>
> ⚠️ **A LISTA NASCE NO PRIMEIRO PEDIDO DEPOIS DAS 7h, e não por cron.** Quem
> pergunta (a lista, a tarja, o andamento) chama `garantirDia`. O relógio é o
> `relogio.js`: em produção é só o relógio do servidor; `relogio.fixar` e
> `PCP_RELOGIO_ARQUIVO` existem para os testes simularem dias, e ninguém os
> configura no servidor.
>
> ⚠️ **O ADMIN GERAL NÃO ENTRA NO RODÍZIO SÓ PELO NÍVEL.** Ele passa em toda chave
> por nível (§10); o rodízio lê `contagem.contar` **pelo setor ou pela exceção**
> (`inventario_route.temChaveRodizio`). Quem tem a chave por outro setor ou por
> exceção entra. Para pôr o dono no rodízio, ponha-o no setor de contagem.
>
> ⚠️ **SEM ESCALA, A LISTA NASCE ABERTA.** Com menos de duas pessoas no rodízio
> não há escala, o aviso vai para quem planeja, e qualquer um com
> `contagem.contar` conta — senão ninguém contaria.
>
> ⚠️ **AS CHAVES ANTIGAS FICARAM.** `contagem.recontar` e `contagem.aprovar` estão no
> registro, sem rota de peça: trocar nome de chave tira a permissão em silêncio
> (#13). O backfill (`config.seed_inventario_v2`, uma vez só) levou quem as tinha
> para `contagem.desempatar`, `contagem.resolver` e `contagem.relatorio`. As rotas
> antigas (`minha-lista`, `contar`, `recontagem`, `recontar`, `terminar-sku`)
> saíram e nascem negadas.
>
> ⚠️ **A QUINZENAL FICA ABERTA ATÉ O PRAZO, MESMO TERMINADA**, porque é ela que
> suspende a diária "nesses dias". A primeira é **15 dias depois do deploy**
> (`config.quinzenal_base`). No fim do prazo, o não contado vira `nao_conferido` e
> a divergência em andamento vai para o topo da diária seguinte.
>
> ⚠️ **A TARJA É UM GET QUE PODE CRIAR A LISTA DO DIA.** Toda tela do PCP pergunta
> `/api/inventario/tarja` a cada minuto (`nav.js`); quem não tem chave de contagem
> volta antes de qualquer conta.

**Rode `node teste_inventario.js` (98) e `node teste_regras_estoque.js` (97, sobe
o servidor de verdade numa porta livre — `PCP_PORTA` —, NUNCA na 3010) ao mexer
no `inventario_*.js`, no `relogio.js`, na tarja do `nav.js`, na gravação da
recusa do `etq_route.js` ou nas chaves de contagem.**

> ⚠️ **A CONTAGEM DE MATERIAL E O INVENTÁRIO GRAVAM QUEM, PELO ID (05/11/2026)**
> — fase 5 da `QUEM-FEZ-E-REVISAO`. `contagem.usuario_id`/`usuario_nome` em cada
> lançamento, `contagem_pendente.contado_por_id`/`aprovado_por_id` ao lado dos
> nomes (pela mesma `colunas()` do `cont_route.js`, para o banco novo e o antigo
> terminarem na mesma ordem, §17). Sem login, as 7 escritas da contagem e as 11 do
> Inventário são 401; as leituras (a lista do dia, a tarja) continuam aceitando
> ninguém. As tabelas do Inventário já guardavam o id: ali só a porta mudou.

**Ferramenta (só lê): `node conferir_contagem_persianas.js`** — a folha de
contagem de 04/11/2026 contra o sistema, SKU a SKU: saldo, em caixa, livre,
contado, diferença e o **saldo novo** (contado + em caixa) a digitar no pedido
de ajuste. Persiana ativa fora da folha conta **zero** (o dono: *"o que não está
na lista está com estoque zerado"*); kit, acessório, sob medida e inativo ficam
fora, e a linha que casa com mais de um SKU não é repartida nem zerada. Não
grava nada: a correção é pelo Inventário ou pelo ajuste com outra pessoa
aprovando. `node teste_conferir_contagem_persianas.js` (22).

> ⚠️ **A FOLHA DE 04/11/2026 FOI APLICADA SEM A SEGUNDA PESSOA, POR DECISÃO DO
> DONO** (linha em `docs/DECISOES.md`). `node aplicar_contagem_persianas.js
> --contado-em "AAAA-MM-DD HH:MM"` simula, e `--aplicar` grava com backup:
> saldo de cada persiana ativa = contado (fora da folha, 0) **mais o que andou
> no livro depois da hora da contagem** (R-EST-16), pelo `estoque_dominio`
> (tipo `ajuste`, com linha em `ajuste_estoque`). E **toda caixa impressa e
> não conferida deixa de reservar**: a impressa até a hora da contagem ganha
> só a marca `baixado_em = embalado_em` (a peça não estava na prateleira, e o
> saldo novo já não a conta); a impressa depois ganha a baixa de verdade (−1
> por peça), porque a peça dela entrou no contado. As caixas continuam
> `embalado` — conferir depois não baixa de novo; fechá-las é a Mesa
> ("Fechar conferências antigas"). **Roda uma vez** (`config.contagem_persianas:<dia>`);
> contagem nova vai pelo Inventário. Acessório, sob medida e inativo não se
> mexem. `node teste_aplicar_contagem_persianas.js` (41).

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
| R-SMA-01 | Uma lista só: as permissões do sob medida estão na tela de Acessos, e o portão pergunta ao PCP (#13) |
| R-SMA-02 | Nenhuma chave do sob medida é `admin`; a chefia é `supervisor` (#34) |
| R-SMA-03 | A área `admin` do PCP não abre o sob medida |
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
| R-SMR-04 | O vendedor tem setor próprio, de chaves `operacao` |
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
| R-SMS-03 | A bancada vem do setor, e não das outras permissões |
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
| R-SMF-12 | Baixa de boleto e descarte de sobra: uma pessoa pede, outra aprova, e nada muda enquanto espera |
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
| R-SMN-01 | O produto novo nasce INATIVO, e só o simulador interno o calcula, com a tarja |
| R-SMN-02 | Duplicar copia tudo numa transação, e as colunas saem do banco (pragma) |
| R-SMN-03 | "Cópia de…" não ativa, e ativar tem porta própria |
| R-SMN-04 | As escolhas são lista do SISTEMA; ligada é obrigatória, desligada é recusada pela rota |
| R-SMN-05 | O cálculo é peça pronta (escada, gomos, folhas); conta nova entra por spec |
| R-SMN-06 | Romana: gomos ímpares, mínimo 3, o menor que cabe no limite; varetas = gomos − 1 |
| R-SMN-07 | Painel: transpasse por encontro, central sem transpasse no meio, trilho uma peça só |
| R-SMN-08 | A etiqueta é por UNIDADE (uma linha por unidade), e o consumo não multiplica |
| R-SMN-09 | O nome vem do material, a medida da ficha; falta de cadastro nunca trava |
| R-SMN-10 | A data de fabricação é a da PRIMEIRA impressão |
| R-SMN-11 | A liberação é regra por setor mais `libera` (montagem ou só a embalagem) |
| R-SMN-12 | Com várias unidades, a recusa volta SÓ a unidade escolhida |
| R-SMN-13 | O kit só é cobrado na embalagem de quem leva kit — e de cada kit (aceita com a R-SMN-16) |
| R-SMN-14 | O preço por cor existe sem tela; com linha vence a coleção, vazio não muda nada |
| R-SMN-15 | O cliente final é opcional, e sai ao lado da revenda |
| R-SMN-16 | Todo produto tem kit de instalação na ficha; sem kit, não ativa |
| R-SMN-17 | A faixa de suporte serve a cada kit da ficha (o trilho e o bandô, cada um pela sua) |
| R-SMN-18 | Nada na etiqueta de produção termina em "…": encolhe ou quebra; abreviações num lugar só |

### ⚠️ O CADASTRO DE PRODUTO — o que parece bug e não é (28/10/2026)

Spec `docs/specs/SOBMEDIDA-CADASTRO-DE-PRODUTO.md`, as seis fases numa entrega
só (§14 dela), cartões R-SMN-01 a R-SMN-18.

> ⚠️ **O PRODUTO NOVO NÃO APARECE NO PEDIDO, E É ASSIM.** Ele nasce inativo, e
> só o simulador o calcula — para quem tem `catalogo.editar`, com a tarja
> âmbar. "Cópia de…" não ativa: dê o nome que a revenda vai ler.
>
> ⚠️ **O `comando` VAZIO NO PEDIDO DA PAINEL NÃO É DADO FALTANDO.** A coluna é
> `NOT NULL`, e `''` quer dizer "este produto não tem lado do comando". O lado
> da corrente é outra escolha, e só existe com comando.
>
> ⚠️ **QUATRO LINHAS DE VARETA NO PEDIDO APROVADO NÃO SÃO DUPLICAÇÃO.** É uma
> linha por unidade (1/4 a 4/4), cada uma com o seu código; o Compras soma
> linha × quantidade e dá 4, não 16.
>
> ⚠️ **O PREÇO POR COR NÃO TEM TELA NEM ROTA, DE PROPÓSITO.** A tabela e a conta
> estão prontas (decisão do dono), e vazia ela não muda preço nenhum.
>
> ⚠️ **TODO PRODUTO LEVA KIT, E SEM KIT NA FICHA ELE NÃO ATIVA** (R-SMN-16,
> dono, 28/10/2026). Não existe "não leva kit". É essa trava que deixa a
> embalagem cobrar o kit só de quem tem kit na ficha (R-SMN-13) sem abrir
> buraco: a ficha que esqueceu o kit não chega à venda.
>
> ⚠️ **A FAIXA DE SUPORTE É DE CADA KIT** (R-SMN-17, migração 38). O Painel com
> bandô leva os suportes do trilho e os do bandô, cada um pela sua faixa, e a
> embalagem cobra os dois. A faixa sem kit apontado é a "de todos os kits" —
> a do Rolô, que por isso não mudou.
>
> ⚠️ **NADA NA ETIQUETA DE PRODUÇÃO TERMINA EM "…"** (R-SMN-18). A linha que
> não cabe encolhe e, se preciso, quebra em duas; a que cabe sai onde sempre
> saiu. As abreviações das escolhas moram só no `ABREV` do
> `etiqueta_producao.js`.
>
> ⚠️ **A CONFERÊNCIA ACHOU DOIS DEFEITOS DE TELA QUE JÁ ESTAVAM NO AR**, e os
> dois só apareciam abrindo a tela: o Catálogo e o simulador liam a recusa em
> `e.mensagem` (o `ui.js` a põe em `e.message`), e toda recusa virava "Não deu
> para salvar."; e o simulador perdia o foco no primeiro número digitado.
> Consertados e travados no `telas_produto.test.js`.

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
No boleto e no crédito: `boleto.test.js`. Na baixa pedida e no descarte pedido: `aprovacao.test.js`. No dinheiro de tela: `dinheiro_tela.test.js`.
Em tabela de tela: `rola_tela.test.js`. No corte: `corte_etapas.test.js`,
`corte_correcao.test.js`, `historico_corte.test.js`, `tom.test.js`,
`tempo_corte.test.js`, `plano_claro.test.js` e `barras_ler.test.js`. No cadastro
de produto (criar, duplicar, escolhas, Romana, Painel, etiqueta por unidade,
liberação por produto, preço por cor): `produto.test.js`, `escolhas.test.js`,
`romana.test.js`, `painel.test.js`, `etiqueta_unidade.test.js`,
`produto_producao.test.js`, `telas_produto.test.js`, `kit_produto.test.js` e
`etiqueta_sem_corte.test.js` — e o `persiana.test.js`,
o `etiqueta_producao.test.js`, o `producao.test.js` e o `recusa.test.js` têm que
passar **sem mudar o esperado**: é a prova de que o Rolô não mudou. No cadastro
de material do PCP (marca e modelo): `node teste_componentes.js`. Todos os
`*.test.js` rodam pelo `cd tecido && npm test`.

### Teste obrigatório

```bash
cd tecido && npm test          # 856 casos
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

### O MENU POR PESSOA NO LUGAR DO RODAPÉ (fase 6 da `ACESSO-POR-TELA-E-NIVEL`, 04/11/2026)

**O rodapé de atalhos saiu** (R-TEL-06), e o **Alt+1..8** de troca de tela
junto: ele mostrava os mesmos atalhos a todo mundo, ninguém usava, e aparecia
duplicado no Admin. No lugar dele, o botão **☰ Menu** da barra de sessão abre
as telas que **a pessoa** alcança, por módulo, com o número ao lado do nome
(*"253 Devoluções — baixa"*). Módulo sem tela dela não aparece; a tela aberta
vem marcada. Ficam **"Trocar setor"**, o atalho para a outra operação (Regra A
abaixo) e o **Alt+0** do "Sair".

> ⚠️ **O MENU SAI DO MAPA, PELA CONTA DO PORTÃO** (`GET /api/telas/minhas`,
> `admin_telas.js`): as telas do `telas.js` que o `decidir` deixa abrir, mais as
> do sob medida pela chave `sobmedida.<permissão>` delas. Não há lista de telas
> no `nav.js`. As devoluções são o **bloco 250** (251, 252, 253), e a porta
> `/devolucoes` deixou de ser `@logado`: abre para quem tem alguma chave delas.
>
> ⚠️ **O BOTÃO DE AÇÃO QUE A PESSOA NÃO TEM SOME** (R-TEL-04): `data-perm="chave
> outra.chave"` no botão, e o `nav.js` o esconde de quem não tem nenhuma delas
> (o `/api/telas/minhas` manda as permissões **da própria pessoa**). Ele nasce
> escondido, para não piscar. **Esconder é conforto, não segurança**: a rota
> continua recusando. Na fase 6 foram marcados 21 botões das telas do Admin;
> **o AJUSTE de 04/11/2026 marcou mais 23** — "Peça com problema" (101,
> `revisao.rejeitar`), ~~a caixa "Subir PDF" da Etiqueta de Venda (201,
> `pdf.subir`), o "imprimir" da 203 (`etiqueta.emitir`)~~ (as duas saíram com o
> upload único na 103, 05/11/2026), os dois "Liberar com
> divergência" da Conferência (202, `saida.liberar`), a decisão da divergência
> de leitura (204, `sku.cadastrar`), o "pedir" do ajuste (301), o aprovar e
> rejeitar da contagem de material (302), o cadastro de modelo, cor e tecido
> (402), o salvar e excluir da ficha (404) e as listas e o código do kit (902).
> A regra é: **marca quem tem a ação numa chave diferente da que abre a tela**
> — quem abriu a tela já tem a chave dela. **Botão novo de ação nasce com
> `data-perm`**, e o `teste_menu.js` tem a lista, botão a botão, com a chave.
>
> ⚠️ **A REGRA SÓ ESCONDE, NUNCA FORÇA A APARECER** (desde o AJUSTE de
> 04/11/2026). Ela pega o botão cuja marca não tem **nenhuma** chave da pessoa
> (`[data-perm]:not([data-perm~="a"]):not(...)`); o que ela tem segue a tela.
> Até ali o permitido levava `display:revert !important`, que passaria por cima
> de um botão que a **própria tela** esconde (`display:none`, como a caixa
> "Subir PDF" antes de saber quem é a pessoa). Nenhum dos 21 da fase 6 era
> escondido assim, então nada errado chegou ao ar. O Admin Geral não recebe
> regra nenhuma.
>
> ⚠️ **AS TELAS QUE JÁ ESCONDEM PELO SERVIDOR NÃO LEVAM `data-perm`**:
> Devoluções em andamento (os botões vêm de `lancar`, `acompanhar`, `dinheiro`
> e `baixar` da resposta), a confirmação da venda cancelada na Conferência
> (`pode_confirmar`), a aprovação do ajuste de estoque (`pode_aprovar`) e a
> decisão da contagem de peça (`pode_aprovar`). Ali quem decide é a rota, que
> também diz por que não.
>
> ✅ **NO AR E CONFERIDO EM 04/11/2026** (PR #285): o dono fez o backup, o
> deploy e o teste de segurança (telas 302, API 401, `/login` 200) e conferiu
> na tela o "Liberar com divergência" escondido do operador e visível para ele,
> o "Adicionar" de modelo escondido de quem não cadastra modelo e o "Peça com
> problema" escondido de quem não registra peça com problema — e disse *"bateu
> tudo"*.
>
> ⚠️ **A APARÊNCIA DO MENU NÃO É DESTA SPEC** — é da conversa de design. Aqui
> ele é funcional, no visual da barra de sessão.

**Rode `node teste_menu.js` e `node teste_atalho.js` ao mexer no `nav.js`, no
`/api/telas/minhas` ou num `data-perm`.** Cinco defeitos foram reintroduzidos um
a um, e cada um reprova; no AJUSTE dos botões, mais quatro (o "Liberar" sem
marca, a marca com a chave errada, o botão criado por JS sem marca e o
`display:revert` de volta).

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
> produção** voltava ao login depois de digitar o PIN. ~~Tela nova da medida
> padrão entra na lista `PADRAO` de lá.~~ **Desde 04/11/2026 o `PADRAO` sai do
> mapa de telas** (`telas.js`, a `area` e a `CHEGADA` de lá): tela nova entra
> no mapa (§10, "O MAPA DE TELAS").

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

