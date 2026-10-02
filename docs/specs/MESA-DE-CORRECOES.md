> **STATUS · 02/10/2026 — EM CONSTRUÇÃO** · **fase 1 no ar (PR #174)** · **fases 2 e 3 em código
> (02/10/2026)**: as cinco ações da §4 que faltavam, os três contadores que faltavam e os cinco
> scripts chamando o `correcoes.js` e gravando em `correcao`. `teste_correcao2.js` (98) e
> `teste_correcao3.js` (23, o mesmo cenário pelo botão e pelo terminal, os dois iguais linha a
> linha). **Mudanças na construção:** a venda futura reaberta sem etiqueta volta a `pendente`
> (a §4 dizia só "reabrir"); "Fechar vencidos" exige a data de corte e só pega o sem-despacho
> que entrou até ela; a coleta fechada ganha `retirado_em`; a fila velha é a de mais de 30 dias;
> "Dar saída" não apaga as cópias (elas viram fantasmas, e saem pelo contador); "Pedir ajuste"
> abre o pedido pela porta do ajuste (não grava em `correcao`). Quatro delas esperam a
> confirmação do dono em `docs/DECISOES.md`. Falta: deploy, e o dono fechar um passivo de
> verdade pela tela.
>
> **Fase 1** entrou em 02/10/2026: `correcoes.js` (dono único de cada ação),
> `correcao_route.js` (7 rotas), a tabela `correcao`, a aba **Correções** no admin, a
> chave `correcao.executar` e as duas ações que mais pesam — **Descartar fantasma** e
> **Cancelada depois da etiqueta**. `teste_correcao.js`, 115 casos, escrito antes do
> código, doze defeitos reintroduzidos um a um.
>
> As duas dependências estão no ar: o livro (ESTOQUE F1, 21/09) e as canceladas
> (VENDAS F2, 26/09).
>
> **O que mudou na construção:**
> - **a régua do fantasma saiu do script já nesta fase** (a spec punha na 3):
>   `classificarFantasmas` é dela, e o `limpar_fantasmas.js` lê de lá. Duas cópias
>   seriam o botão e o terminal apagando linhas diferentes. **O efeito ainda diverge
>   num ponto** — a Mesa apaga o `lote_item` do volume e o script não —, e isso só se
>   unifica na fase 3;
> - **o "voltou" devolve POR PEÇA, e não `+1`** (§4): a etiqueta de uma caixa de
>   pacote baixou N. **Sob medida fica de fora**, porque nunca baixou;
> - **a caixa de várias persianas não tem o "voltou"**: o ML cancela um item e o
>   sistema não sabe qual peça é. Sobra o "registrar", com a frase que manda separar a
>   caixa e corrigir por Admin → Estoque;
> - **sem backfill da chave** (§5.4): o Admin Geral passa por nível;
> - **os contadores são os DOIS que têm botão** (§5.5); os outros três chegam na fase
>   2, junto com a ação deles;
> - **o `lote` ganhou três colunas** (`cancelada_resolvida_em`,
>   `cancelada_resolvida_por`, `cancelada_voltou`) para o card de Bloqueados **esvaziar**
>   — sem a marca ele nunca zerava;
> - **uma rota a mais que as seis da §5.3**: `GET /api/correcao/passivo`, que serve os
>   contadores do topo.
>
> ✅ **NO AR**, confirmado pelo dono em 02/10/2026.
>
> ⚠️ **AINDA NÃO FOI CONFERIDA NA FÁBRICA.** A rodada foi num navegador, a 1440 px,
> com banco semeado. A prova que fecha a fase é o dono corrigindo um passivo de
> verdade pela tela — e a **primeira cancelada real depois da etiqueta**, que é a prova
> que a VENDAS F2 deixou pendente.

---

# Mesa de correções — o dono corrige sem pedir ao Claude Code

> **Versão 1 · 21/09/2026** · nasceu da conversa no Projeto "PCP - Deccorar".
> **Leia junto com:** `CLAUDE.md` §4 (fila), §5 (#5, os três scripts de passivo, #9),
> §11 (modo teste)

---

## 1. O problema

Todo passivo da operação — volume fantasma, volume vencido, venda futura fechada
antes da hora, fila sem peça atrás — se corrige hoje **pedindo ao Claude Code** para
rodar um script no servidor:

| Script | Fecha |
|---|---|
| `limpar_fantasmas.js` | duplicata `pendente` cujo irmão já andou |
| `regularizar_saida.js` | volume parado que já saiu de fato, um a um |
| `fechar_vencidos.js` | `pendente` vencido, em bloco |
| `reabrir_futuros.js` | volume fechado com data à frente |
| `limpar_fila.js` | linha `aguardando` sem peça atrás |

O dono quer **clicar item por item e ajustar o que está errado** (21/09/2026).

## 2. O que esta tela NÃO é

**Não é um editor de linhas do banco.** Com as regras que parecem bug e não são
(armadilhas #1, #1-B, #5, #8, #9, #23…), apagar ou editar linha à mão quebra saldo e
fila em silêncio. A Mesa mostra, para cada objeto, **só as ações que valem para o
estado dele**, com as mesmas regras que os scripts já seguem.

---

## 3. Como funciona

```
BUSCAR ──▶ VER O OBJETO ──▶ PRÉVIA ──▶ EXECUTAR (motivo) ──▶ DESFAZER (se nada andou)
```

- **Buscar:** nº do volume, venda, pack, NF, cliente ou SKU.
- **Ver o objeto:** estágio, datas, bloqueio, modalidade, peças, e a história
  (auditoria + correções anteriores + extrato do SKU quando for SKU).
- **Prévia:** o que vai mudar, campo a campo, e se mexe em estoque. Nada é gravado.
- **Executar:** motivo obrigatório (texto). Grava o antes e o depois.
- **Desfazer:** volta ao estado anterior **se o objeto não andou depois** — compara o
  estado atual com o `depois` gravado; diferente, recusa dizendo o que mudou.

---

## 4. As ações

| Ação | Vale para | Regra (a mesma de hoje) | Estoque |
|---|---|---|---|
| **Descartar fantasma** | volume `pendente` com irmão mais antigo (mesmo pack/venda) em `embalado`/`carregado` | #5: fica sempre o mais antigo | não |
| **Dar saída** | volume não carregado, que saiu de fato | carimba `COALESCE(despachar_em, data)` às 15:00, **nunca hoje**; recusa venda futura (`despachar_em > hoje`) | não |
| **Fechar vencidos** | `pendente` vencido, em bloco, por período conferido | a do `fechar_vencidos.js` | não |
| **Reabrir venda futura** | volume com `carregado_em > hoje` | a do `reabrir_futuros.js` | não |
| **Tirar da fila** | linha de `fila` `aguardando` | nunca toca `embalado`; mostra a idade da linha | não |
| **Cancelada depois da etiqueta** | volume `embalado` com `cancelada_em` | duas saídas: **"a persiana voltou"** → movimento `cancelamento` ~~+1~~ **por peça** (ver abaixo); **"não voltou"** → só registra | **sim**, no "voltou" |
| **Pedir ajuste de saldo** | SKU | abre um pedido em `estoque.ajustar` — **outra pessoa aprova** | só depois da aprovação |

> **A Mesa não tem ação de estoque direto.** Mexer em saldo sem venda na frente é o
> que as duas pessoas existem para vigiar. A única exceção é a cancelada que voltou:
> ali o movimento desfaz uma baixa conhecida, com volume e cliente na referência.

> ⚠️ **DIVERGÊNCIA RESOLVIDA EM 02/10/2026 (fase 1):** o "voltou" devolve **a soma
> das `qtd` do `lote_item`, SKU por SKU**, e não `+1` — a etiqueta de uma caixa de
> pacote baixou N (`CLAUDE.md` §5, #23). **Sob medida não recebe devolução** (§7). E a
> **caixa de várias persianas** (`cancelada_varias=1`) **não tem a saída "voltou"**: o
> ML cancela um item e o sistema não sabe qual peça da caixa é. Lá só existe o
> "registrar", com a frase que manda separar a caixa.

Ações que ficam **de fora** desta versão: editar SKU de volume (é a tela de
Bloqueados que resolve), apagar volume, mexer em `revisao`/`montagem`.

---

## 5. Arquitetura

### 5.1 `correcoes.js` — dono único de cada ação

Cada ação é um objeto:

```
{ id, rotulo, alvo: 'lote'|'sku'|'fila',
  valePara(db, objeto) → true | 'motivo de não valer',
  previa(db, objeto, params) → {antes, depois, estoque: [{codigo, delta}]},
  executar(db, objeto, params, usuario) → {antes, depois, movimentos},
  desfazer(db, correcao, usuario) }
```

- Toda escrita num `db.transaction`.
- Ação que mexe em saldo chama `estoque_dominio.movimentar()` com `tipo='correcao'`
  (ou `cancelamento`) e `referencia='correcao:<id>'`. **Nunca `UPDATE skus`.**
- **Os scripts de terminal passam a chamar estas mesmas funções** (fase 3): botão e
  terminal com a mesma régua. Script continua útil para operação em massa.

### 5.2 Tabela `correcao`

`id`, `acao`, `alvo_tipo`, `alvo_id`, `motivo`, `antes` (JSON), `depois` (JSON),
`usuario_id`, `usuario_nome`, `criado_em`, `desfeita_em`, `desfeita_por`, `teste`.
Entra em `TABELAS` do `teste_route.js`.

### 5.3 Rotas

| Rota | Permissão | Faz |
|---|---|---|
| `GET /api/correcao/buscar?q=` | `correcao.executar` | volumes, SKUs e linhas de fila |
| `GET /api/correcao/:tipo/:id` | `correcao.executar` | objeto, história e ações que valem (com o motivo das que não valem) |
| `POST /api/correcao/previa` | `correcao.executar` | `{acao, tipo, id, params}` → antes/depois; não grava |
| `POST /api/correcao/executar` | `correcao.executar` | idem + `motivo`; grava `correcao` e auditoria |
| `POST /api/correcao/:id/desfazer` | `correcao.executar` | recusa se o objeto andou |
| `GET /api/correcao/historico` | `correcao.executar` | últimas correções, filtráveis por pessoa e ação |

### 5.4 Permissão

`correcao.executar` — nível admin, **sensível**. ~~Backfill só para o setor Admin
Geral~~ — **não há backfill (02/10/2026)**: o Admin Geral recebe toda chave **por
nível** (`CLAUDE.md` §10), então ela chega ao dono no primeiro boot, e um backfill para
ele seria redundante. É a mesma decisão do `kit.imprimir` (§4). As duas pontas que
sobram são `permissoes.js` e a linha no `permDaRota()`.
"Pedir ajuste de saldo" ainda exige `estoque.ajustar`, e a aprovação continua com
outra pessoa (`ESTOQUE-LIVRO-E-CONFERENCIA.md` §6.2).

### 5.5 A tela

Aba nova **"Correções"** no admin, fundo escuro (DESIGN.md §1):

- campo de busca que aceita bipe (etiqueta de venda ou SKU);
- no topo, os **contadores de passivo**: fantasmas, vencidos, futuras fechadas, fila
  velha, canceladas depois da etiqueta — cada um abre a lista. **Na fase 1 entram só
  os dois que têm botão** (fantasmas e canceladas): os outros três chegam na fase 2
  junto com a ação deles, porque contador que acusa e não sabe liberar é a trava que a
  equipe aprende a contornar;
- o objeto em cartão, com as ações como botões; ação que não vale aparece
  desabilitada com o motivo escrito (em vez de sumir);
- prévia em painel antes de confirmar; motivo obrigatório;
- histórico com botão "desfazer".

---

## 6. Fases

### Fase 1 ☑ — a mesa e as duas ações que mais pesam 🔴 (em código em 02/10/2026)

- `correcoes.js`, tabela, rotas, tela, permissão.
- Ações: **Cancelada depois da etiqueta** e **Descartar fantasma**.
- **Testes:** `teste_correcao.js` — ação que não vale é recusada com motivo; prévia
  não grava; executar grava antes/depois e auditoria; "voltou" gera exatamente um
  movimento +1 e a soma do livro bate; desfazer recusa objeto que andou; fantasma
  mantém o mais antigo.

### Fase 2 ☑ — as outras ações 🔴 (em código em 02/10/2026)

- Dar saída, Fechar vencidos, Reabrir futura, Tirar da fila, Pedir ajuste.
- **Testes:** os casos que travam as regras dos scripts — saída carimbada na data do
  volume, nunca hoje; venda futura recusada; fila `embalado` intocável.

### Fase 3 ☑ — scripts com a mesma régua 🟡 (em código em 02/10/2026)

- `limpar_fantasmas.js`, `regularizar_saida.js`, `fechar_vencidos.js`,
  `reabrir_futuros.js`, `limpar_fila.js` passam a chamar `correcoes.js` e a gravar
  em `correcao`.
- **Testes:** script e botão produzem o mesmo antes/depois para o mesmo caso.

---

## 7. Quando terminar

`CLAUDE.md` §5 ("Os três scripts que fecham passivo") passa a apontar para a Mesa como
caminho normal; esta spec vai para `docs/arquivo/`.
