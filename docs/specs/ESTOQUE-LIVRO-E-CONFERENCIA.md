> **STATUS · 04/11/2026 — EM CÓDIGO (versão 2), falta subir** · `FASE` 🔴
> **Versão 2.** Substitui a versão 1 (21/09/2026), que foi para
> `docs/arquivo/ESTOQUE-LIVRO-E-CONFERENCIA-v1.md` com a história da construção.
>
> ⚠️ **A v2 foi escrita como "nada no código", e não era assim.** Quando ela chegou,
> as fases 0 a 4 da v1 já estavam no ar: as dívidas #13, #14 e #15 fechadas em
> 17/09, o livro (§3) em 21/09, a conferência em três papéis em 26/09, o ajuste em
> duas pessoas (a **fase 5** desta v2) em 28/09, e reservado/disponível e
> acuracidade em 02/10. **Decisão do dono (04/11/2026): a v2 é construída como
> MUDANÇA sobre o que existe**, e não do zero. O que mudou na construção:
>
> - **Fase 0 e fase 1:** nada a fazer — conferido no `main` (#13, #14, #15 riscadas
>   em 17/09; livro, `estoque_dominio`, negativo sem `MAX(0,…)`, extrato e botão no
>   ar). Achado no caminho e **consertado por decisão do dono**: a embalagem
>   (`POST /api/montagem`) somava +1 também para sob medida, contra o R-EST-05.
> - **A comparação é contra o LIVRE, e não o saldo** (já era assim desde
>   22/10/2026, `CONFERENCIA-E-BAIXA`): a etiqueta só **reserva**, o −1 é na
>   Conferência. Os §5.2, §5.5 e §5.5-B escrevem "etiqueta −1"; vale o CLAUDE.md.
> - **§5.5-B: "mexeram durante a contagem" é o LIVRE que mudou** (embalagem,
>   etiqueta impressa, sobra, ajuste), ou linha do livro que não seja a baixa da
>   Conferência — **decisão do dono, 04/11/2026**. A etiqueta não gera linha no
>   livro, e a conferência de caixa já impressa não mexe na prateleira.
> - **Chaves (decisão do dono, 04/11/2026):** `contagem.desempatar`,
>   `contagem.resolver` e `contagem.relatorio` são novas; o backfill leva
>   `contagem.recontar`/`contagem.contar` → desempatar e `contagem.aprovar` →
>   resolver + relatório (a spec dizia "a partir de `contagem.ajustar`", que hoje
>   é só a contagem de **material**). As antigas ficam no registro, sem rota.
> - **Os itens que já esperavam aprovação no deploy continuam na fila**, pela
>   regra velha (decisão do dono, 04/11/2026). Os novos aplicam sozinhos.
> - **Status:** a v1 chama de `recontar` a 2ª contagem e de `aprovar` a fila do
>   admin; os nomes ficaram (a tabela já existe em produção). O aplicado sozinho é
>   `aplicado`; o decidido pelo admin, `aprovado`.
> - **Na diária, "mandar contar de novo" volta amanhã, do zero**; na quinzenal, na
>   geral e na avulsa, um item novo no mesmo ciclo (como na v1).
> - **Fim da quinzenal:** o que ninguém contou vira `nao_conferido`; **a divergência
>   em andamento (2ª ou 3ª) não se perde** — vai para o topo da diária seguinte.
> - **A quinzenal fica aberta até o prazo**, mesmo terminada: é ela que suspende a
>   diária "nesses dias". **A primeira é 15 dias depois do deploy** (`config.quinzenal_base`).
> - **Cobertura = LIVRE ÷ média** (a mesma média da tela azul, `demanda_dominio`).
> - **Admin Geral não entra no rodízio só pelo nível** (ele passa em toda chave):
>   entra quem tem `contagem.contar` pelo setor ou por exceção (§8.1) — ⚠ a
>   confirmar pelo dono.
> - **Sem escala (menos de 2 pessoas no rodízio), a lista nasce aberta para o setor**
>   (senão ninguém contaria), e o aviso vai para quem planeja.
> - **"Fora do rodízio" se marca no card da aba Contagem do admin**, e não em
>   Admin → Acessos (o setor continua sendo dado por lá).
> - **Acuracidade fica a do R-EST-23** (acerto da 1ª contagem); a §7.3 escreve
>   "confirmados sem diferença ÷ conferidos" — vale o CLAUDE.md.
> - **SKU inativo:** o cadastro de SKU de produção não tem coluna `ativo`; o filtro
>   vale se ela existir. Sob medida fica fora sempre.
> - **A conferência avulsa da v1** (quem planeja abre com a sugestão) continua.
> - Testes: `teste_inventario.js` reescrito (98), `teste_regras_estoque.js` novo (97,
>   com o servidor de verdade), casos novos em `teste_acesso.js` e `teste_montagem.js`.
> - Plano e fechamento de cada fase: `docs/specs/ESTOQUE-LIVRO-E-CONFERENCIA-DIARIO.md`.

# Estoque — o livro de movimentos e a conferência em duas pessoas

> **Versão 2 · 04/11/2026** · nasceu da conversa no Projeto "PCP - Deccorar".
> **Leia junto com:** `CLAUDE.md` §2, §4, §5, §7, §11, §18 · `CONTROLE-DE-ACESSO.md`

---

## 1. O problema

A equipe ainda está se adaptando ao sistema, e o saldo da persiana não bate com a
prateleira. O furo só aparece na hora errada: o PDF sobe, a Etiqueta de Venda recusa
"sem estoque", e a expedição para. Hoje **toda correção passa pelo dono**, como admin,
e quando ela é feita não sobra rastro de **para onde a peça foi**.

Duas coisas precisam acontecer juntas:

1. **A equipe resolve lá embaixo** — conta, confere e corrige sem depender do admin.
2. **O dono continua enxergando** — quanto sumiu, de qual SKU, quem contou e por onde
   a conta escapou. *"Não posso deixar eles dizendo que tem furo e eu não saber para
   onde estão indo as persianas."*

Por que hoje não dá, conferido no código em 04/11/2026: o saldo é **um número que sete
lugares sobrescrevem**, sem extrato.

| Quem escreve em `skus.estoque` | Onde |
|---|---|
| embalagem `+1` | `mont_route.js` |
| etiqueta de venda `−1` por peça | `etq_route.js` |
| ajuste manual (substitui) | `server.js` · `POST /api/estoque` |
| contagem (substitui ou soma) | `cont_route.js` |
| cadastro de SKU (pode zerar — dívida #15) | `server.js` · `POST /api/skus` |
| scripts | `zerar_estoque.js`, `backfill_pacote.js --baixar` |
| modo teste (restaura a foto) | `teste_route.js` |

Todos cortam o saldo em `MAX(0, …)`: o negativo, que seria o **sinal** de saída sem
registro, some em silêncio. E a contagem de hoje tem dois buracos próprios:
**"Ajustar" só corrige o que foi bipado** (peça que acabou fica com o saldo velho) e o
ajuste de peça **não deixa rastro** além de uma linha na auditoria.

O material de compras já não tem esse problema (`componente_dominio.movimentar()` +
`movimento_componente`). **Esta spec traz o mesmo desenho para a persiana**, e em cima
dele a conferência em duas pessoas.

---

## 2. O que fica de fora

- **Estoque de tecido do sob medida** (`tecido/`) — tem o dele.
- **Material de compras** — continua na aba Contagem de hoje até ter spec própria.
- **Endereço/prateleira da peça** — pode vir depois.
- **Quarentena** (devolução ou peça com problema esperando decisão) — no radar.
- **Descobrir sozinho a causa do furo.** O sistema mostra o extrato do SKU ao lado do
  furo; quem conclui o motivo é gente.

---

## 3. O livro de movimentos

> Sem mudança em relação à versão 1. É ele que responde *"para onde foi"*: a contagem
> diz **quanto** sumiu; o livro diz **por onde**.

### 3.1 Tabela `movimento_estoque`

| Coluna | O que é |
|---|---|
| `id` | |
| `codigo` | o SKU |
| `delta` | +1, −1, −2… **nunca o saldo** |
| `tipo` | `abertura` · `embalagem` · `etiqueta` · `inventario` · `ajuste` · `correcao` · `cancelamento` |
| `referencia` | o que causou: `lote:123`, `inventario_item:45`, `ajuste:12`, `correcao:7` |
| `motivo` | código da lista `motivo_estoque` quando é decisão humana; nulo quando é operação |
| `usuario_id`, `usuario_nome` | quem fez |
| `aprovado_por` | quando teve aprovação |
| `saldo_depois` | para ler o extrato sem somar tudo |
| `criado_em` | |
| `teste` | modo teste, como toda tabela coberta pelo §11 |

### 3.2 `estoque_dominio.js` — dono único

```
movimentar(db, {codigo, delta, tipo, referencia, motivo, usuario, aprovado_por})
saldo(db, codigo)
extrato(db, codigo, {desde, limite})
```

- **É a única função do sistema que escreve em `skus.estoque`.** `INSERT` no livro e
  `UPDATE` do saldo na mesma transação (a do chamador, quando houver).
- Recusa SKU que não existe, `delta` zero ou não inteiro, e `tipo` fora da lista.
- `skus.estoque` continua existindo como **cache** do saldo — as telas e as contas
  continuam lendo dele. Quem manda é o livro.

### 3.3 Regras

1. **Saldo negativo não é mais cortado.** Fica negativo e acende alerta vermelho na
   aba Estoque ("saiu mais do que entrou — conferir"). A trava da Etiqueta de Venda
   continua igual; se o negativo aparecer, é sinal verdadeiro.
2. **Cadastro de SKU nunca mexe em saldo.** `POST /api/skus` deixa de gravar
   `estoque` (fecha a dívida #15). SKU novo nasce com 0 e sem linha.
3. **Sob medida continua sem movimento** (§7 do CLAUDE.md).
4. **Caixa de pacote baixa por peça** (armadilha #23): uma linha por SKU, com a
   mesma `referencia` do volume.
5. **Reimpressão não gera linha** (armadilha #1-B). **Revisão não gera linha** (#1).
6. **Modo teste:** linhas nascem com `teste=1`; "apagar" remove e restaura a foto,
   "manter" promove.
7. **Teste da soma:** para todo SKU, `SUM(delta) = skus.estoque`. Se alguém escrever
   no saldo por fora, o teste quebra.

### 3.4 A virada

No deploy da fase 1, cada SKU com saldo diferente de zero ganha **uma** linha
`abertura` com o saldo daquele momento. A história começa ali.

---

## 4. Os três estados do saldo (só leitura)

| Estado | Conta |
|---|---|
| **físico** | o livro |
| **reservado** | peças de volumes `pendente` (não impressos) daquele SKU — `lote_item` quando existe, senão 1 por volume |
| **disponível** | físico − reservado (pode ficar negativo: é o que falta produzir) |

Só aparecem na aba Estoque. Não entram em conta nenhuma — `demanda_dominio.js`
continua dono de "quanto produzir" (armadilha #12).

---

## 5. A conferência em duas pessoas

### 5.1 O fluxo de um SKU

```
A conta cego ──▶ B conta cego (outra pessoa)
                   ├─ A e B batem ──────────────▶ APLICA SOZINHO  (furo vai pro relatório)
                   └─ A e B diferem ──▶ C conta cego (terceira pessoa)
                                          ├─ C bate com A ou com B ─▶ APLICA SOZINHO
                                          └─ C não bate com ninguém ─▶ vai para o ADMIN
```

| A | B | C | Sistema | Resultado |
|---|---|---|---|---|
| 3 | 3 | — | 3 | ✅ confirmado, nada muda |
| 3 | 3 | — | 5 | ✅ saldo vira 3 **sozinho**; furo −2 no relatório |
| 3 | 4 | 3 | 5 | ✅ vale 3 (C bateu com A); furo −2 no relatório |
| 3 | 4 | 5 | 5 | ⛔ ninguém bateu → admin decide |

**Não há aprovação quando as contagens batem.** Esta é a mudança da versão 2: duas
pessoas que contaram às cegas e chegaram no mesmo número são a prova. O dono não
aprova — ele **lê** (§7).

### 5.2 O que se conta

**Toda caixa embalada, com etiqueta de SKU e sem etiqueta de venda — esteja onde
estiver** (decisão do dono, 04/11/2026). A janela do estoque é exatamente a do §2 do
CLAUDE.md: **começa no +1 da embalagem e termina no −1 da etiqueta de venda.** Entre
os dois, a caixa é estoque — na prateleira **ou ainda na bancada**.

| Onde a caixa está | Conta? | Por quê |
|---|---|---|
| bancada, embalada, sem etiqueta de venda | ✅ | o +1 já aconteceu |
| prateleira de estoque | ✅ | |
| bancada/esteira com etiqueta de venda colada | ❌ | o −1 já aconteceu |
| área de conferência, carro ou canto da coleta | ❌ | idem — já é do cliente |
| peça revisada e não embalada | ❌ | ainda não é estoque (§2) |

Contar só a prateleira acharia peça a menos em todo SKU com caixa recém-embalada na
bancada; contar a caixa já etiquetada acharia peça a mais em todo SKU com caixa
esperando o carro. A tela de contagem diz em letra grande no topo: **"Conte toda caixa
embalada SEM etiqueta de venda — na prateleira e na bancada."**

### 5.3 Contagem cega

- Quem conta **nunca** recebe o saldo do sistema — **o JSON não traz o campo**, não é
  só a tela que esconde (regra 14 do §13).
- Quem conta em segundo ou terceiro não recebe nem o saldo nem as contagens
  anteriores. A resposta do bipe diz só "você bipou 3".
- **Zero é dito, não presumido.** Na lista diária e na quinzenal, SKU sem peça na
  prateleira se fecha pelo botão **"Não tem nenhuma"**. Na geral, vale o §6.4.

### 5.4 Ninguém conta duas vezes o mesmo SKU

`outraPessoa(usuario, item)`, em `estoque_dominio.js`, impede A de ser B ou C, e B de
ser C — e impede o admin de resolver um SKU que ele mesmo contou. **Vale para o Admin
Geral**: não há permissão que dispense.

### 5.5 O que andou no meio não atrapalha

A fábrica não para para contar. Entre a contagem de A e a de B alguém pode embalar
(+1) ou imprimir etiqueta (−1) daquele SKU.

Por isso **o sistema não compara os números contados — compara as diferenças.** Quando
a pessoa toca "Terminei este SKU", o sistema guarda o saldo daquele instante
(`saldo1`, `saldo2`, `saldo3`) e calcula `dif = contado − saldo`:

```
A contou 3, sistema tinha 5                   → dif A = −2
embalaram 1 no meio
B contou 4, sistema tinha 6                   → dif B = −2   ✅ batem
```

O que se aplica é **a diferença** (`movimento inventario`, `delta = dif`), nunca o
número contado como saldo novo. Assim a embalagem do meio continua valendo.

### 5.5-B Mexeram no SKU DURANTE a contagem — conta de novo

A comparação por diferença cobre o que anda **entre** uma contagem e outra. Não cobre
o que anda **enquanto** a pessoa conta: ela passou pela prateleira, alguém embalou e
pôs uma caixa ali depois (ou imprimiu a etiqueta de uma que ela já tinha contado), e
o saldo do "Terminei" já inclui um movimento que a contagem dela não viu.

- O sistema guarda o **início** (`inicio1/2/3` = primeiro bipe ou abertura do SKU) e
  o **fim** ("Terminei" / "Não tem nenhuma") de cada contagem.
- **Se o livro tem movimento daquele SKU entre o início e o fim, a contagem não
  vale.** Ela não é gravada como contagem, e a tela pede na hora: *"Mexeram no
  BK160140BEGE enquanto você contava — conte de novo."* A pessoa recomeça aquele
  SKU; não é terceira contagem nem divergência.
- A recontagem na hora não conta como "contar duas vezes" (§5.4): é a mesma
  contagem, refeita.
- Isso só fica possível depois do livro (§3) — é ele que diz se houve movimento no
  intervalo. Mais um motivo para a fase 1 vir antes.

### 5.6 O que acontece ao aplicar

- Diferença zero → item `confirmado`, nenhuma linha no livro.
- Diferença ≠ 0 → uma linha `inventario` com `delta = dif`, `referencia =
  inventario_item:id`, `usuario_nome` = quem fechou (B ou C), `motivo` nulo. O item
  fica `aplicado` e aparece no relatório de furos (§7).
- O motivo do furo **não é exigido** de quem contou: quem conta não sabe por que
  sumiu. O extrato ao lado do furo é o que ajuda a descobrir (§7).

### 5.7 Quando nem a terceira bate — o admin

O item fica `admin`. Quem tem `contagem.resolver` vê as três contagens, os três
saldos, e o extrato do SKU desde a última conferência, e escolhe:

- **aplicar um valor** (um dos três ou outro), com **motivo obrigatório** da lista; ou
- **mandar contar de novo** — o item volta para a lista de amanhã, do zero.

A decisão grava `decidido_por`, `decidido_em`, `motivo`, `obs`, e vai para a auditoria.

---

## 6. As três rodadas

Todas usam o mesmo fluxo da §5. O que muda é **qual lista** e **quando**.

### 6.1 A lista diária — 8 SKUs

- **Quando:** todo dia de trabalho, **segunda a sexta** (`config.ciclo_dias`).
  Suspensa durante a conferência quinzenal.
- **Quantos:** `config.ciclo_qtd`, padrão **8**.
- **A lista nasce às 7h** (`config.ciclo_hora`; na prática, na primeira consulta
  depois desse horário) junto com a escala do dia (§6.5), e **não muda durante o
  dia**. SKU que ficou baixo à tarde entra amanhã — senão a pessoa começa contando
  uma lista e termina outra.
- **Ordem:**

| # | Degrau | Critério |
|---|---|---|
| 0 | **Sobrou de ontem** | item da lista anterior que não terminou |
| 1 | **Travou na etiqueta** | a Etiqueta de Venda recusou "sem estoque" desse SKU desde a última lista |
| 2 | **Estoque mais baixo** | menor **cobertura** (`estoque ÷ média diária`, do `demanda_dominio`) |
| 3 | **Nunca conferido** | |
| 4 | **Mais tempo sem conferir** | |

- **Cobertura, não quantidade:** 3 peças de um SKU que vende 6/dia é meio dia de
  folga; 3 peças de um que vende 1/semana são três semanas. Pela quantidade os dois
  empatariam. Sem venda na janela a cobertura é `null` — o SKU cai para os degraus 3 e 4.
- **Folga entre conferências:** SKU **confirmado ou aplicado nos últimos
  `config.ciclo_folga` dias (padrão 7)** não entra pelos degraus 2 a 4. Sem isso, os
  mesmos SKUs de estoque baixo seriam contados todo dia e o resto nunca. O degrau 1
  (travou) **ignora a folga**: o furo apareceu.
- **Fora da lista:** sob medida (saldo sempre zero) e SKU inativo.
- **O que sobrou não some:** item sem as contagens necessárias vai para o topo da
  lista de amanhã. A lista continua com 8 — sobraram 3, entram 5 novos.

> **Para o degrau 1 existir**, a recusa "sem estoque" do `POST /api/embalar`
> (`etq_route.js`) passa a gravar uma linha em `recusa_estoque` (`codigo`, `em`,
> `usuario_nome`, `lote_id`). Hoje ela só responde para a tela e não sobra registro.

### 6.2 A conferência quinzenal — todos os SKUs

- **Quando:** a cada `config.quinzenal_dias` (padrão **15**), abre sozinha. Quem tem
  `contagem.planejar` pode abrir antes.
- **O quê:** todo SKU com saldo ou com movimento nos últimos 30 dias, menos sob medida
  e inativo.
- **Prazo:** `config.quinzenal_prazo` dias úteis, padrão **3**. Não para a expedição.
- **A lista diária fica suspensa** nesses dias — a quinzenal já passa por todos.
- **Ordem:** a mesma da §6.1 (travou → menor cobertura → nunca conferido → mais
  tempo). Se o prazo acabar antes da lista, o que ficou para trás é o menos arriscado.
- **SKU que travar na etiqueta durante a quinzenal** sobe para o topo dela.
- **Fim do prazo:** o que não terminou fecha como `nao_conferido` e aparece no
  relatório (§7). No dia seguinte a lista diária volta.

### 6.3 A contagem geral — quando o dono mandar

- Aberta só por quem tem `contagem.planejar`, **com a expedição parada** (a tela diz
  isso ao abrir e pede confirmação).
- Todos os SKUs com saldo ou com movimento nos últimos 30 dias.
- Mesmas duas pessoas por SKU, mesmas regras da §5.

### 6.4 Na geral, o que não foi bipado é zero

Na geral a pessoa percorre a prateleira inteira. Ao tocar **"Terminei a prateleira"**,
a tela mostra quantos SKUs da lista ela **não** bipou e pergunta: *"Esses não têm
nenhuma peça?"*. Confirmando, todos viram contagem **zero dela**. Um SKU só vira zero
no estoque se **as duas pessoas** confirmaram zero — e aí é o caso comum da §5.

### 6.5 O rodízio — quem conta hoje

Decisão do dono (04/11/2026): **o sistema escala**, ninguém se oferece. Contagem
livre num time pequeno acaba de dois jeitos — sempre a mesma pessoa conta, ou ninguém
conta porque cada um acha que o outro vai.

- **Onde se coloca a pessoa:** Admin → Acessos, no setor **"Operador / Controle de
  Estoque"** (tem `contagem.contar`). Quem está no setor entra no rodízio.
- **Fora do rodízio:** marcação no cadastro da pessoa (`usuarios.fora_rodizio`, por
  `ALTER`), para folga, férias ou afastamento. Quem liga e desliga tem
  `contagem.planejar`. Pessoa bloqueada também fica fora.
- **Às 7h** o sistema escala **duas pessoas** (`config.ciclo_pessoas`, padrão 2):
  as que estão há mais tempo sem ser escaladas; empate, por ordem de nome. Elas são
  o **A** e o **B** de todos os SKUs do dia.
- **A tarja diz o nome:** *"Hoje a contagem é sua e da Fulana — faltam 5 de 8"*. Ela
  aparece **só para as escaladas**.
- **Terceira contagem:** vai para quem tem `contagem.desempatar` e **não** contou
  aquele SKU — de fora da escala do dia. A tarja aparece para essas pessoas.
- **A janela é das 7h às 10h** (decisão do dono). A tarja já mostra o prazo:
  *"… — até 10h"*.
- **Falta ou atraso:** se às **10h** (`config.ciclo_abre_todos`) uma escalada ainda não
  começou, os itens que esperavam por ela **abrem para todo o setor**, e a tarja passa
  a aparecer para todos. O relatório registra *"escalada, não contou"* com o nome.
- **Setor com menos de duas pessoas no rodízio:** não há escala. A tarja avisa quem
  tem `contagem.planejar`: *"Contagem do dia sem gente: só N pessoa(s) no rodízio"*.
- **Quinzenal:** cada um dos três dias tem a sua escala, pela mesma regra.
- **Geral:** sem escala — o dono a abre com a expedição parada e escolhe quem conta.
- **Tabela `inventario_escala`:** `data`, `ciclo_id`, `usuario_id`, `usuario_nome`,
  `papel` (`escalada`), `abriu_para_todos_em`, `teste`.

> **A primeira contagem geral não precisa esperar esta spec.** Ela pode ser feita hoje
> com o que existe: `node zerar_estoque.js --confirmar`, contar, "Lançar no estoque
> (soma)", e `node comparar_inventario.js` para medir o furo. É orientação de
> operação, não fase.

---

## 7. O que cada um vê

### 7.1 A tarja — o aviso que não sai

- Aparece **no topo de todas as telas** (via `nav.js`, como a tarja do modo teste),
  **só para as duas escaladas do dia** (§6.5) — e para todo o setor depois das 10h,
  se uma delas não começou.
- **Não fecha e não bloqueia** o trabalho — decisão do dono: incomoda, não trava.
  (Trava que para a bancada às 14h com despacho às 15h vira desvio — armadilha #6.)
- Texto: *"Hoje a contagem é sua e da Fulana — faltam 5 de 8 SKUs"* · na quinzenal: *"Conferência
  quinzenal: faltam 37 de 90 — prazo sexta"*. Toque abre a tela de contagem.
- **Por pessoa:** a tarja some para ela quando não sobrar item que **ela** possa
  contar (já contou, ou o item já fechou). Some para todos quando a lista fecha.
- **Volta** quando um item pede a terceira contagem — só para quem tem
  `contagem.desempatar` e ainda não contou aquele SKU.

### 7.2 A tela de contagem (tablet)

- Lista dos SKUs que a pessoa pode contar, **sem saldo**, cada um com o que a peça é
  (`pecaTexto`, do `public/sku.js`).
- Escolhe o SKU → bipa as peças (aceita bipe, guard de 700 ms da §12) → **"Terminei
  este SKU"** ou **"Não tem nenhuma"**.
- O topo diz em letra grande o que conta e o que não conta (§5.2).

### 7.3 O relatório de furos (para o dono)

Só leitura, para quem tem `contagem.relatorio`. É o que substitui o "aprovar":

- **Cada furo:** SKU, diferença (+/−), quem contou (A, B, C) e quando, e **o extrato
  do SKU desde a última conferência** — as embalagens, etiquetas, devoluções e ajustes
  que levaram o saldo até ali. É aqui que se vê para onde a peça foi.
- **Soma da semana e do mês**, em peças, e em R$ só para quem tem `custo.ver` (o JSON
  não traz o campo para quem não tem — regra 14 do §13).
- **SKUs que mais furam** no período.
- **Não conferidos:** itens que fecharam sem contagem (quinzenal vencida) e listas
  diárias que ficaram pela metade.
- **Escala:** quem foi escalado em cada dia, e quem **não contou** quando estava
  escalado (a contagem abriu para todos às 10h).
- **Fila do admin:** itens em que nem a terceira bateu (§5.7).
- **Acuracidade:** itens confirmados sem diferença ÷ itens conferidos, no mês.

---

## 8. Permissões — tudo separado

### 8.1 Chaves (`permissoes.js`)

| Chave | Nível | Pode | O sistema impede |
|---|---|---|---|
| `contagem.contar` *(já existe)* | operação | 1ª e 2ª contagem às cegas · recebe a tarja | ver saldo · contar duas vezes o mesmo SKU |
| `contagem.desempatar` | operação | a 3ª contagem | contar SKU que já contou |
| `contagem.planejar` | admin | abrir a geral, antecipar a quinzenal, mudar `ciclo_*` e `quinzenal_*`, marcar "fora do rodízio" | — |
| `contagem.relatorio` | admin | ver o relatório de furos | — |
| `contagem.resolver` | admin · **sensível** | decidir o que nem a 3ª resolveu | resolver SKU que contou |

Quem não tem `contagem.contar` **não vê a tela, não recebe a tarja e não entra no
rodízio**. O setor nativo `Operador / Controle de Estoque` já existe e já traz
`contagem.contar` — é por ele que o dono concede.

> ⚠️ **Quem tem a chave por OUTRO setor ou por exceção também entra no rodízio.** O
> rodízio lê a permissão efetiva (`podePermissao`), não o nome do setor — senão uma
> pessoa com a chave por exceção contaria sem nunca ser escalada.

### 8.2 As três pontas (armadilhas #13 e #23)

Para cada chave nova: a linha em `permissoes.js`, a rota em `permDaRota()` do
`acesso.js`, e o **backfill** de uma vez só (marcado em `config`):

| Quem tinha | Passa a ter |
|---|---|
| `contagem.ajustar` | `contagem.planejar` + `contagem.relatorio` + `contagem.resolver` |
| `contagem.contar` | `contagem.desempatar` (a §5.4 impede a mesma pessoa no mesmo SKU) |

`contagem.ajustar` deixa de ser usada por rota de peça na fase 2; continua só para a
contagem de **material**, que fica na tela antiga.

---

## 9. Tabelas e rotas

### 9.1 Tabelas

**`inventario_ciclo`** — `id`, `tipo` (`diario`|`quinzenal`|`geral`), `aberto_por`,
`aberto_em`, `prazo`, `fechado_em`, `status` (`aberto`|`fechado`), `teste`.

**`inventario_item`** — um SKU por ciclo:

| Coluna | |
|---|---|
| `ciclo_id`, `codigo`, `degrau` | `degrau` = por que entrou (0 a 4, §6.1) |
| `contado1`, `saldo1`, `por1`, `inicio1`, `em1` | 1ª contagem (`inicio` e `em` = início e fim, §5.5-B) |
| `contado2`, `saldo2`, `por2`, `inicio2`, `em2` | 2ª |
| `contado3`, `saldo3`, `por3`, `inicio3`, `em3` | 3ª, quando precisa |
| `status` | `a_contar` · `segunda` · `terceira` · `admin` · `confirmado` · `aplicado` · `nao_conferido` · `recontar` |
| `dif` | a diferença aplicada |
| `motivo`, `obs`, `decidido_por`, `decidido_em` | só quando o admin decide |
| `movimento_id` | a linha do livro que gerou |
| `teste` | |

**`recusa_estoque`** — `id`, `codigo`, `em`, `usuario_nome`, `lote_id`, `teste` (§6.1).

**`inventario_escala`** — §6.5. E `usuarios.fora_rodizio` (`INTEGER DEFAULT 0`, por
`ALTER`, no fim — §17 do CLAUDE.md).

**`motivo_estoque`** (em `listas`): perda/avaria · erro de bipe na embalagem · erro de
bipe na etiqueta · devolução não lançada · cancelamento não lançado · peça sem
registro de entrada · contagem anterior errada · outro (exige observação).

As cinco tabelas novas entram em `TABELAS` do `teste_route.js` (§11 do CLAUDE.md).

### 9.2 Rotas

| Rota | Permissão | Faz · recusa |
|---|---|---|
| `GET /api/inventario/hoje` | `contagem.contar` | a lista que **esta pessoa** pode contar (escalada, desempate, ou aberta a todos depois das 10h) — **sem saldo e sem contagens no JSON**; cria a lista e a escala do dia se ainda não existem e já passou das 7h |
| `POST /api/inventario/rodizio` | `contagem.planejar` | marca/desmarca "fora do rodízio" de uma pessoa |
| `GET /api/inventario/tarja` | `@logado` | o texto da tarja, ou nada (quem não tem a chave recebe nada) |
| `POST /api/inventario/bipe` | `contagem.contar` | soma o bipe; responde só "você bipou N" |
| `POST /api/inventario/terminar` | `contagem.contar` / `contagem.desempatar` | fecha a contagem da pessoa (ou "não tem nenhuma"), guarda o saldo, compara, aplica; recusa quem já contou o SKU |
| `POST /api/inventario/geral/abrir` | `contagem.planejar` | abre a geral |
| `POST /api/inventario/quinzenal/abrir` | `contagem.planejar` | antecipa a quinzenal |
| `POST /api/inventario/geral/terminar-prateleira` | `contagem.contar` | grava zero da pessoa nos SKUs que ela confirmou sem peça |
| `GET /api/inventario/relatorio` | `contagem.relatorio` | §7.3; R$ só com `custo.ver` |
| `POST /api/inventario/resolver` | `contagem.resolver` | §5.7; exige motivo; recusa quem contou |
| `GET /api/estoque/extrato/:codigo` | `@admin` | o livro do SKU (fase 1) |

### 9.3 O que é desligado

- `/api/contagem/*` **de peça** e os botões "Lançar"/"Ajustar" de peça na aba
  Contagem — na fase 2. Se continuassem, alguém corrigiria por ali, por fora da
  contagem dupla. A contagem de **material** continua nessas rotas.
- A "idade do inventário" da aba Estoque passa a ler de `inventario_item` (hoje lê da
  tabela `contagem`, que é apagada a cada lançamento — o número mente).

---

## 10. Fases

> **Fase 0 — CONSERTO, sem spec, antes de tudo** (conferir no `main` quais já foram
> feitos desde setembro): dívidas **#13** (carregamento aceita volume não embalado),
> **#14** (embalagem sem transação) e **#15** (`POST /api/skus` zera o estoque). São
> as portas por onde o furo entra; contar sem fechá-las é enxugar gelo.

### Fase 1 — o livro de movimentos 🔴

- `movimento_estoque`, `estoque_dominio.js`, abertura (§3.4).
- Todos os escritores da §1 passam por `movimentar()`. Scripts inclusive.
- Fim do `MAX(0, …)`; alerta de negativo na aba Estoque.
- `POST /api/skus` deixa de gravar saldo.
- `GET /api/estoque/extrato/:codigo` e botão "extrato" na linha da aba Estoque.
- **Testes:** `teste_livro.js` — a soma bate para todo SKU depois de embalar,
  imprimir, pacote, reimprimir, sob medida, modo teste apagar/manter; recusa SKU
  inexistente; varredura que **recusa `UPDATE skus SET estoque` fora do
  `estoque_dominio.js`**. `teste_estoque.js` e `teste_etiqueta.js` continuam passando.

### Fase 2 — a lista diária e a contagem em duas pessoas 🔴

- `inventario_ciclo`, `inventario_item`, `recusa_estoque`; a gravação da recusa no
  `etq_route.js`.
- Lista do dia (§6.1), fluxo A/B/C (§5), aplicação pelo livro, fila do admin (§5.7).
- Tela de contagem no tablet (§7.2) e a tarja (§7.1).
- O rodízio (§6.5): `inventario_escala`, `usuarios.fora_rodizio`, a marcação em
  Admin → Acessos e a abertura para todos às 10h.
- Chaves, `permDaRota()`, backfill, `outraPessoa()`.
- Uma lista simples de furos para quem tem `contagem.relatorio` (SKU, diferença, quem,
  quando, link do extrato) — o relatório completo é a fase 4.
- Desliga `/api/contagem/*` de peça.
- **Testes:** `teste_inventario.js` — o JSON de quem conta não traz saldo nem
  contagem anterior; A=B aplica sozinho; A≠B pede C; C bate com um e aplica; C não
  bate e vai pro admin; a mesma pessoa é recusada em qualquer posição, **inclusive
  Admin Geral**; uma embalagem e uma etiqueta entre A e B não geram diferença falsa
  (§5.5); embalagem ou etiqueta do SKU **durante** uma contagem invalida só aquela
  contagem e pede recontar na hora, sem gerar divergência (§5.5-B); a lista tem 8, nasce uma vez por dia, respeita a ordem e a folga; sobra de
  ontem vem primeiro; sábado e domingo não geram lista; antes das 7h não há lista; a
  escala pega as duas pessoas há mais tempo sem escala e pula quem está fora do
  rodízio ou bloqueado; a tarja só aparece para as escaladas e abre para o setor às
  10h se uma não começou; quem não tem a chave nunca é escalado; com menos de duas
  pessoas no rodízio não há escala e o aviso vai para quem planeja.
  `teste_acesso.js` cobre as chaves novas.

### Fase 3 — a quinzenal e a geral 🔴

- §6.2, §6.3 e §6.4; a lista diária suspensa durante a quinzenal; `nao_conferido` no
  fim do prazo.
- **Testes:** a quinzenal abre no dia certo, suspende a diária e a devolve depois do
  prazo; o que travou sobe para o topo; na geral, zero só aplica com as duas pessoas
  confirmando.

### Fase 4 — o relatório de furos completo e os estados 🟡

- §7.3 inteiro (soma da semana e do mês, SKUs que mais furam, não conferidos,
  acuracidade, R$ com `custo.ver`) e os três estados da §4 na aba Estoque.
- A idade do inventário passa a ler de `inventario_item`.
- **Testes:** `teste_estoque.js` ganha acuracidade e idade; quem não tem `custo.ver`
  não recebe R$.

### Fase 5 — ajuste manual em duas pessoas 🔴

> Mantida da versão 1, sem mudança de regra.

- `POST /api/estoque/ajuste` pede (SKU, delta, motivo, obs) e não mexe no saldo;
  outra pessoa com `estoque.aprovar_ajuste` aprova e aí grava no livro como `ajuste`.
  Desliga `POST /api/estoque`.
- Chaves `estoque.ajustar` e `estoque.aprovar_ajuste` (backfill: quem tinha
  `estoque.editar`).
- ⚠️ **Decisão em aberto:** dia com uma pessoa só com `estoque.aprovar_ajuste`.
  Padrão até o dono decidir: **espera**.
- **Testes:** pedir não mexe no saldo; quem pediu não aprova; aprovar grava no livro.

---

## 11. Quando terminar

Regras que parecem bug entram no `CLAUDE.md` (§2, §11, §18 e uma seção nova sobre o
livro e a conferência); as linhas de `docs/DECISOES.md` entram no commit de cada fase;
esta spec vai para `docs/arquivo/`.
