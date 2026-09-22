> **STATUS · 21/09/2026 — EM CONSTRUÇÃO** · fase 0 e **fase 1 feitas**; fases 2 a 4 planejadas
> **Fase 0 (consertos)** entrou em 21/09/2026: a aprovação da contagem passou a
> aplicar a diferença contra o `sistema_era` em vez do número contado, a contagem
> de peça passou a gravar em `ajuste_estoque`, e a idade da conferência deixou de
> ler a tabela `contagem`, que é apagada (`CLAUDE.md` §18, armadilha #32 ·
> `teste_contagem.js`). **Não entrou** o item (d): as dívidas #13, #14 e #15 já
> estavam marcadas RESOLVIDO no §14 e o que sobrava de cada uma não era conserto —
> a #15 era `REGRA` e fechou aqui, na fase 1.
>
> **Fase 1 (o livro)** entrou em 21/09/2026: `movimento_estoque`,
> `estoque_dominio.js` como dono único, a virada de abertura, o fim do
> `MAX(0, …)` nos sete escritores, o alerta de saldo negativo, o extrato
> (`GET /api/estoque/extrato/:codigo`) e a varredura que recusa
> `UPDATE skus SET estoque` fora do domínio (`teste_livro.js`, 60 casos).
>
> **O que mudou na construção, e vale mais que a spec:**
> - a tabela do §1 estava velha em dois pontos (ver a nota de divergência abaixo);
> - a §3.3.2 dizia só *"`POST /api/skus` deixa de gravar `estoque`"*. Na
>   construção ficou claro que **o SKU novo também tem que nascer com zero**:
>   nascer com 5 e livro vazio quebraria `SUM(delta) = skus.estoque` na primeira
>   linha — que é justamente a regra 8 da própria spec. E a rota passou a
>   **dizer** que ignorou o campo (`estoque_ignorado`), porque ignorar em
>   silêncio é a armadilha #25 por outra porta;
> - a **restauração da foto do modo teste** mudou de casa: ela escreve na coluna
>   sem ser movimento, então mora dentro do domínio (`restaurarFoto`). Deixá-la
>   no `teste_route.js` obrigaria a varredura a abrir uma exceção, e exceção numa
>   regra de dono único é o começo do terceiro dono;
> - eram **oito** escritores, não sete: a varredura achou o `teste_route.js`, que
>   a primeira versão dela isentava por causa do prefixo `teste_`.
>
> ⚠️ **A FASE 1 FOI ENTREGUE PELA METADE EM 21/09, e o fechamento disse que
> estava inteira.** O extrato e o saldo negativo subiram só no servidor: não
> havia botão de extrato nem chip "Negativo" na aba Estoque, e o dono foi abrir
> e não achou. **Fechado em 22/09/2026**, com o chip, o botão, o painel do
> extrato (com o `bate` escrito na tela) e 10 casos novos no `teste_estoque.js`
> — a rota tinha subido **sem teste nenhum**, e agora a tela depende do formato
> dela. A lição está no `CLAUDE.md` §2: regra que depende de tela não está
> pronta quando a rota existe e o teste passa, e sim quando alguém clica e vê.
>
> Fase 1 é a base das outras duas specs deste pacote
> (`VENDAS-E-MEDIA.md` e `MESA-DE-CORRECOES.md`), e as duas estão liberadas.
> **Uma decisão em aberto, agora da fase 2:** o que fazer quando só há uma pessoa
> com `contagem.aprovar` no dia (§6.4). Padrão proposto até o dono decidir:
> **espera**.
>
> ⚠️ **Divergência com o código, anotada em 21/09/2026** (regra 3 da §13 do
> `CLAUDE.md`: onde a spec e ele divergirem, vale ele). A linha *"cadastro de SKU
> (pode zerar — dívida #15) · `server.js` · `POST /api/skus`"* da tabela do §1 está
> velha em dois pontos: a rota saiu para **`sku_cad_route.js`** em 17/09/2026, e a
> **dívida #15 foi fechada** — campo ausente passou a preservar o saldo, e número
> impossível é recusado em vez de clampado (`CLAUDE.md` §6, armadilha #25). O que
> continua verdadeiro, e é o que a fase 1 fecha, é que **o upsert ainda grava
> `estoque`** (`sku_cad_route.js:146`), com `sku.cadastrar`, sem motivo e sem linha
> em `ajuste_estoque` — **e foi isso que a fase 1 fechou em 21/09/2026**, junto
> com o SKU novo, que passou a nascer sempre com zero. Pelo mesmo motivo, o item
> (d) do §9 ("dívidas #13, #14 e #15") se referia à parte **"Fica aberto"** de
> cada uma delas no §14; as três já estavam marcadas RESOLVIDO desde 17/09/2026,
> e o que sobrava das outras duas não é conserto (a #13 é contagem de
> prateleira, a #14 espera o refresh nos tablets).

---

# Estoque — o livro de movimentos e a conferência

> **Versão 1 · 21/09/2026** · nasceu da conversa no Projeto "PCP - Deccorar".
> Arquitetura visual aprovada pelo dono antes desta spec.
> **Leia junto com:** `CLAUDE.md` §2, §4, §5, §7, §11, §18 · `CONTROLE-DE-ACESSO.md`

---

## 1. O problema, em uma frase

O saldo da persiana é **um número que sete lugares sobrescrevem**. Quando ele erra,
não sobra rastro de quem mexeu, quando, nem por quê — e a contagem, que devia
consertar, também sobrescreve.

Conferido no código em 21/09/2026:

| Quem escreve em `skus.estoque` | Onde |
|---|---|
| embalagem `+1` | `mont_route.js` |
| etiqueta de venda `−1` por peça | `etq_route.js` |
| ajuste manual (substitui) | `server.js` · `POST /api/estoque` |
| contagem (substitui ou soma) | `cont_route.js` |
| cadastro de SKU (pode zerar — dívida #15) | `server.js` · `POST /api/skus` |
| scripts | `zerar_estoque.js`, `backfill_pacote.js --baixar` |
| modo teste (restaura a foto) | `teste_route.js` |

E todos cortam o saldo em `MAX(0, …)`: o negativo, que seria o **sinal** de que algo
saiu sem registro, some em silêncio.

O material de compras já não tem esse problema: `componente_dominio.movimentar()`
+ `movimento_componente`. **Esta spec traz o mesmo desenho para a persiana.**

---

## 2. O que fica de fora

- **Estoque de tecido do sob medida** (`tecido/`) — tem o dele.
- **Material de compras** — já tem livro; a contagem de material continua pela tela
  atual até uma fase futura migrá-la para o fluxo novo.
- **Endereço/prateleira da peça** — pode vir depois; não é pré-requisito.
- **Quarentena** (devolução ou peça com problema esperando decisão) como saldo
  separado — fica no radar.

---

## 3. O livro de movimentos

### 3.1 Tabela `movimento_estoque`

| Coluna | O que é |
|---|---|
| `id` | |
| `codigo` | o SKU |
| `delta` | +1, −1, −2… **nunca o saldo** |
| `tipo` | `abertura` · `embalagem` · `etiqueta` · `inventario` · `ajuste` · `correcao` · `cancelamento` |
| `referencia` | o que causou: `lote:123`, `inventario_item:45`, `ajuste:12`, `correcao:7` |
| `motivo` | código da lista `motivo_estoque` quando é manual; nulo quando é operação |
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

- **É a única função do sistema que escreve em `skus.estoque`.** Faz o `INSERT` no
  livro e o `UPDATE` do saldo na mesma transação (a do chamador, quando houver).
- Recusa SKU que não existe, `delta` zero ou não inteiro, e `tipo` fora da lista.
- `skus.estoque` continua existindo como **cache** do saldo — as telas e as contas
  continuam lendo dele. Quem manda é o livro.

### 3.3 Regras

1. **Saldo negativo não é mais cortado.** Ele fica negativo e acende alerta
   vermelho na aba Estoque ("saiu mais do que entrou — conferir"). A trava da
   Etiqueta de Venda (não imprime sem estoque) continua igual: é ela que impede o
   negativo na operação normal; se aparecer, é sinal verdadeiro.
2. **Cadastro de SKU nunca mexe em saldo.** `POST /api/skus` deixa de gravar
   `estoque` (fecha a dívida #15 de vez). SKU novo nasce com 0 e sem linha.
3. **Sob medida continua sem movimento** (§7 do CLAUDE.md): sem `+1` na embalagem,
   sem `−1` na etiqueta.
4. **Caixa de pacote baixa por peça** (armadilha #23): uma linha por SKU, com a
   mesma `referencia` do volume.
5. **Reimpressão não gera linha** (armadilha #1-B).
6. **Revisão não gera linha** (armadilha #1).
7. **Modo teste:** as linhas nascem com `teste=1`. "Apagar" remove as linhas de
   teste e restaura a foto, como hoje; "manter" promove as linhas. A soma continua
   batendo porque, com o modo ligado, **todo** movimento é de teste.
8. **Teste da soma:** para todo SKU, `SUM(delta) = skus.estoque`. Se alguém escrever
   no saldo por fora, o teste quebra — é essa a guarda contra a volta dos sete donos.

### 3.4 A virada

No deploy da fase 1, cada SKU com saldo diferente de zero ganha **uma** linha
`abertura` com o saldo daquele momento. A história começa ali; o que veio antes não
se reconstrói (e é por isso que esta spec existe).

---

## 4. Os três estados do saldo (só leitura)

| Estado | Conta |
|---|---|
| **físico** | o livro |
| **reservado** | peças de volumes `pendente` (não impressos) daquele SKU — `lote_item` quando existe, senão 1 por volume |
| **disponível** | físico − reservado (pode ficar negativo: é o que falta produzir) |

Só aparecem na aba Estoque. **Não entram em conta nenhuma** — `demanda_dominio.js`
continua dono de "quanto produzir" (armadilha #12).

---

## 5. A conferência — três papéis, nenhum acumulado

### 5.1 O fluxo

```
PLANEJAR ──▶ CONTAR CEGO ──▶ COMPARAR ──┬─ bateu ─────────▶ CONFIRMADO (sozinho)
                                         └─ diferente ─▶ RECONTAR CEGO (outra pessoa)
                                                           ├─ = 1ª contagem ─▶ APROVAR
                                                           └─ ≠ ─▶ 3ª contagem (3ª pessoa) ─▶ APROVAR
APROVAR (outra pessoa) ──▶ movimento `inventario` = contado − saldo guardado
```

### 5.2 O que se conta

**Só a prateleira de estoque:** peça **embalada**, com etiqueta de SKU e **sem**
etiqueta de venda. Não contam:

- peça revisada e não embalada — ainda não é estoque (§2 do CLAUDE.md);
- caixa com etiqueta de venda colada — já baixou do estoque na impressão.

A tela de contagem diz isso em letra grande no topo. Sem essa regra, a contagem
"acha" peça a mais em todo SKU que tem caixa esperando o carro.

### 5.3 Contagem cega

- Quem conta **nunca** recebe o saldo do sistema — **o JSON não traz o campo**, não é
  só a tela que esconde (regra 14 do §13).
- Quem reconta não recebe nem o saldo nem a contagem anterior.
- A resposta do bipe diz só "contado: 3".

### 5.4 O saldo guardado

Quando a pessoa **termina o SKU**, o sistema guarda o saldo daquele momento
(`saldo_na_contagem`). A aprovação aplica **a diferença** contra esse número, nunca
o número contado como saldo novo. Assim, o que foi embalado ou impresso entre contar
e aprovar continua valendo — é o defeito de hoje (a aprovação apaga o que andou no
meio).

### 5.5 Ciclo diário

- O sistema sugere **N SKUs por dia** (`config.ciclo_qtd`, padrão 8).
- Ordem: nunca conferidos primeiro; depois mais dias sem conferência × mais giro
  (média do `demanda_dominio`).
- Fora do ciclo: sob medida (saldo sempre zero) e SKU inativo.
- Inventário **geral** continua possível (`tipo='geral'`, todos os SKUs com saldo ou
  com movimento nos últimos 30 dias).

### 5.6 Tabelas

**`inventario_ciclo`** — `id`, `tipo` (`ciclico`|`geral`), `aberto_por`, `aberto_em`,
`fechado_em`, `status` (`aberto`|`fechado`), `teste`.

**`inventario_item`** — um SKU por ciclo:

| Coluna | |
|---|---|
| `ciclo_id`, `codigo` | |
| `saldo_na_contagem` | guardado ao terminar a 1ª contagem |
| `contado1`, `por1`, `em1` | |
| `contado2`, `por2`, `em2` | recontagem |
| `contado3`, `por3`, `em3` | terceira, quando precisa |
| `status` | `a_contar` · `confirmado` · `recontar` · `terceira` · `aprovar` · `aprovado` · `rejeitado` |
| `motivo` | código da lista `motivo_estoque` |
| `decidido_por`, `decidido_em`, `obs` | |
| `movimento_id` | a linha do livro que a aprovação gerou |
| `teste` | |

Rejeitar **não apaga**: grava `rejeitado` com motivo e cria um item novo `recontar`
no mesmo ciclo.

### 5.7 Lista de motivos (`listas`, tipo `motivo_estoque`)

Nasce com: perda/avaria · erro de bipe na embalagem · erro de bipe na etiqueta ·
devolução não lançada · cancelamento não lançado · peça sem registro de entrada ·
contagem anterior errada · outro (exige observação). Editável na tela de listas,
como os motivos de rejeição.

---

## 6. Permissões

### 6.1 Chaves novas (`permissoes.js`)

| Chave | Nível | Pode | O sistema impede |
|---|---|---|---|
| `contagem.planejar` | admin | abrir ciclo e inventário geral | — |
| `contagem.contar` | operação | contar às cegas | ver o saldo |
| `contagem.recontar` | operação | recontar divergências | recontar o que ela contou |
| `contagem.aprovar` | admin · **sensível** | aprovar e rejeitar | aprovar o que contou ou recontou |
| `estoque.ajustar` | admin | **pedir** ajuste manual | aplicar sozinho |
| `estoque.aprovar_ajuste` | admin · **sensível** | aprovar ajuste de outro | aprovar o próprio pedido |

`contagem.contar` já existe e continua.

### 6.2 "Ninguém aprova o próprio trabalho" — no código

Uma função só, `outraPessoa(usuario, item)`, em `estoque_dominio.js`, usada pela
recontagem, pela aprovação de inventário e pela aprovação de ajuste. **Vale para o
Admin Geral** — não há permissão que dispense.

### 6.3 As três pontas (armadilhas #13 e #23)

Para cada chave: a linha em `permissoes.js`, a rota em `permDaRota()` do
`acesso.js`, e o **backfill** de uma vez só (marcado em `config`):

| Quem tinha | Passa a ter |
|---|---|
| `contagem.ajustar` | `contagem.aprovar` + `contagem.planejar` |
| `contagem.contar` | `contagem.recontar` (a regra 6.2 impede a mesma pessoa no mesmo item) |
| `estoque.editar` | `estoque.ajustar` + `estoque.aprovar_ajuste` |

`contagem.ajustar` e `estoque.editar` deixam de ser usadas por rota nenhuma; saem
do cadastro na fase em que suas rotas são desligadas.

### 6.4 ⚠️ Decisão em aberto — o aprovador único

Num time de oito, pode haver um dia com uma pessoa só com `contagem.aprovar`.

- **Padrão proposto (vale até o dono decidir): espera.** A divergência fica em
  `aprovar` até outra pessoa aprovar.
- Alternativa: permitir aprovar sozinho com motivo obrigatório, marcado em vermelho
  no relatório de acuracidade.

---

## 7. Rotas

### Inventário

| Rota | Permissão | Faz · recusa |
|---|---|---|
| `GET /api/inventario/sugestao` | `contagem.planejar` | os SKUs do ciclo de hoje |
| `POST /api/inventario/abrir` | `contagem.planejar` | abre ciclo (`ciclico`\|`geral`) |
| `GET /api/inventario/minha-lista` | `contagem.contar` | o que contar — **sem saldo no JSON** |
| `POST /api/inventario/contar` | `contagem.contar` | soma bipe ou quantidade; responde só "contado" |
| `POST /api/inventario/terminar-sku` | `contagem.contar` | fecha o SKU, guarda `saldo_na_contagem`, compara |
| `GET /api/inventario/recontagem` | `contagem.recontar` | divergências — sem saldo e sem contagem anterior; **some o que a pessoa contou** |
| `POST /api/inventario/recontar` | `contagem.recontar` | recusa a mesma pessoa de contagem anterior do item |
| `GET /api/inventario/aprovacao` | `contagem.aprovar` | diferença, R$ (só com `custo.ver`), extrato do SKU desde a contagem; marca "não pode aprovar" |
| `POST /api/inventario/aprovar` | `contagem.aprovar` | exige motivo; recusa quem contou ou recontou; grava o movimento |
| `POST /api/inventario/rejeitar` | `contagem.aprovar` | guarda com motivo e manda recontar |
| `GET /api/estoque/acuracidade` | `@admin` | indicador do mês e série semanal |
| `GET /api/estoque/extrato/:codigo` | `@admin` | o livro do SKU |

### Ajuste manual

| Rota | Permissão | Faz |
|---|---|---|
| `POST /api/estoque/ajuste` | `estoque.ajustar` | pede: SKU, delta, motivo da lista, obs. Não mexe no saldo |
| `GET /api/estoque/ajuste/pendentes` | `estoque.aprovar_ajuste` | pedidos abertos, com extrato |
| `POST /api/estoque/ajuste/:id/aprovar` | `estoque.aprovar_ajuste` | aplica como `ajuste`; recusa quem pediu |
| `POST /api/estoque/ajuste/:id/recusar` | `estoque.aprovar_ajuste` | guarda com resposta |

`ajuste_estoque` vira a tabela dos **pedidos** (colunas novas por `ALTER`, no fim:
`status`, `aprovado_por`, `aprovado_em`, `resposta`, `movimento_id`). O
`POST /api/estoque` de hoje é desligado na fase 3. O card "Últimos ajustes" passa a
ler do livro (inventário + ajuste + correção).

### O que é desligado

- `/api/contagem/*` de peça — na fase 2, quando a tela nova entrar. A contagem de
  **material** continua nessas rotas até ter spec própria.
- `POST /api/estoque` — na fase 3.

---

## 8. Acuracidade

- **Acuracidade do mês** = itens `confirmado` na 1ª contagem ÷ itens contados.
- **Diferença em R$** (só com `custo.ver`): soma de |delta| × custo de material, por
  motivo.
- **Idade da conferência** na tabela da aba Estoque passa a ler de
  `inventario_item` (hoje lê de `contagem`, que é apagada — o número mente).
- Alerta vermelho para saldo negativo (§3.3).

---

## 9. Fases

> **Fase 0 — CONSERTO, sem spec, antes de tudo:** (a) a aprovação de contagem aplica
> o número absoluto e apaga o que andou no meio; (b) a idade do inventário lê a
> tabela `contagem`, que é apagada; (c) o ajuste por contagem não grava em
> `ajuste_estoque`; (d) dívidas #13, #14 e #15 — as portas por onde o erro entra.
> A foto da coleta também vai como CONSERTO.

### Fase 1 — o livro de movimentos 🔴

- `movimento_estoque`, `estoque_dominio.js`, abertura.
- Todos os escritores da §1 passam por `movimentar()`. Scripts inclusive.
- Fim do `MAX(0, …)`; alerta de negativo na aba Estoque.
- `POST /api/skus` deixa de gravar saldo.
- `GET /api/estoque/extrato/:codigo` e botão "extrato" na linha da aba Estoque.
- `movimento_estoque` entra em `TABELAS` do `teste_route.js`.
- **Testes:** `teste_livro.js` novo — a soma bate para todo SKU depois de embalar,
  imprimir, pacote, reimprimir, sob medida, modo teste apagar/manter; recusa SKU
  inexistente; varredura que **recusa `UPDATE skus SET estoque` fora do
  `estoque_dominio.js`** (como o `teste_caminhos.js` faz com `/opt/expedicao`).
  `teste_estoque.js` e `teste_etiqueta.js` continuam passando.

### Fase 2 — a conferência nova 🔴

- Tabelas, motivos, rotas de inventário, tela de contagem cega (tablet) e tela de
  recontagem e aprovação (admin).
- Chaves novas, `permDaRota()`, backfill, `outraPessoa()`.
- Desliga `/api/contagem/*` de peça.
- **Testes:** `teste_inventario.js` — o JSON do contador não traz saldo; bateu
  confirma sozinho; diferente vai para recontagem; recontagem pela mesma pessoa é
  recusada; aprovação por quem contou é recusada, **inclusive Admin Geral**; aprovar
  aplica a diferença contra o saldo guardado, com uma embalagem e uma etiqueta no
  meio; rejeitar não apaga. `teste_acesso.js` cobre as chaves novas.

### Fase 3 — ajuste em duas pessoas 🔴

- Rotas de pedido e aprovação; desliga `POST /api/estoque`; tela na aba Estoque.
- **Testes:** pedir não mexe no saldo; quem pediu não aprova; aprovar grava no livro.

### Fase 4 — acuracidade e estados 🟡

- §4 e §8 na aba Estoque.
- **Testes:** `teste_estoque.js` ganha os casos de acuracidade e idade da conferência.

---

## 10. Quando terminar

Regras que parecem bug entram no `CLAUDE.md` (§2, §11, §18 e uma seção nova sobre o
livro); as linhas de `docs/DECISOES.md` entram no commit de cada fase; esta spec vai
para `docs/arquivo/`.
