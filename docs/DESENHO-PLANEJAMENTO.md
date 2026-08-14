# Desenho — Planejamento de Produção por Estoque Alvo

> Proposta para revisão. Nada implementado.
> **Data:** 14/08/2026

---

## 1. O que muda, em uma frase

Hoje a produção é **lançada** a partir das vendas do dia.
Passa a ser **calculada** a partir do estoque alvo, que por sua vez vem da média
de vendas.

Ninguém lança produção para estoque. O sistema mostra o que falta, sempre.

---

## 2. Os dois arquivos e seus papéis

| Arquivo | Quando | Serve para |
|---|---|---|
| **Planilha** (`Vendas BR.xlsx`) | Diariamente, a qualquer hora | Planejar a produção |
| **PDF** (NF + folha de controle) | **7h** e de novo **após o corte** | Expedir: etiqueta, NF, carregamento |

### A rotina do PDF em dois momentos

O PDF é subido às 7h para a expedição começar a trabalhar imediatamente, sem
esperar o corte das 10:30. Depois do corte, o arquivo novo — que contém as vendas
da manhã **mais** as que entraram até o corte — é subido de novo.

**Isso já funciona hoje.** O `exp_route.js` carrega os Pack IDs e números de venda
já registrados no dia e ignora as repetidas; só as novas são inseridas. O segundo
upload acrescenta a diferença, não duplica.

⚠️ **O PDF precisa ser subido no mesmo dia do envio.** As vendas são carimbadas com
a data do upload, e tanto a etiqueta de venda quanto a deduplicação filtram por
`data = hoje`. Subir no dia anterior faz as vendas não aparecerem no dia certo — e
subir de novo no dia seguinte duplicaria tudo. Enquanto a escolha de data não
existir (dívida técnica #5), essa regra vale.

Sobre o planejamento, o PDF deixa de alimentar a produção — então repetição nele
não tem mais consequência nenhuma para o que a fábrica vai produzir.

### O que a planilha fornece

Colunas usadas (confirmadas no arquivo de 14/08, 167 linhas):

| Coluna | Campo | Uso |
|---|---|---|
| 1 | N.º de venda | Chave única, evita duplicidade |
| 2 | Data da venda | Alimenta a **média diária** |
| 4 | Estado | Contém a **data prometida de envio** |
| 23 | SKU | Identifica o produto |

**Só isso.** Nada de comprador, cidade, CPF, endereço ou valores — a planilha traz
65 colunas e apenas quatro interessam ao planejamento.

As duas datas são indispensáveis: sem a data da venda não há média, e sem a data de
envio não há demanda comprometida. Elas são dados operacionais, não pessoais.

O vínculo com o comprador, quando necessário (devoluções), continua vindo do PDF
pela tabela `lote`, que já guarda NF, SKU e nome.

O campo *Estado* vem como texto — `"Para enviar no dia 17 de agosto"` — e precisa
ser interpretado. Linhas sem data (devoluções, aguardando estoque, mediação)
entram no histórico de vendas mas **não** na demanda comprometida.

---

## 3. As duas contas

### Alvo por SKU

```
média diária = vendas do SKU ÷ dias da janela
alvo         = média diária × DIAS_COBERTURA
```

`DIAS_COBERTURA` é **configurável** (padrão 10). Você aumenta antes de férias,
feriado prolongado ou pico esperado, e o alvo de todos os SKUs sobe junto.

### Necessidade de produção

```
precisa = (demanda comprometida + alvo) − estoque
```

- **demanda comprometida** — vendas com data de envio futura, da planilha
- **alvo** — o colchão para vendas que ainda não aconteceram
- **estoque** — peças prontas e embaladas

Nunca negativo. Zero significa coberto.

### Exemplo com dados reais de 14/08

| SKU | Média/d | Alvo (10d) | Comprometido | Estoque | Precisa |
|---|---|---|---|---|---|
| BK180150BRANCO | 0,89 | 9 | 29 | 9 | **29** |
| BK160160BRANCO | 0,97 | 10 | 37 | 21 | **26** |
| BK160160BEGE | 0,55 | 6 | 19 | 14 | **11** |
| BK160140CINZA | 0,11 | 1 | 4 | 47 | — |

Total: **77 peças**, calculadas sem nenhum lançamento manual.

O contraste importa: `BK160140CINZA` tem 47 unidades para giro de 0,11/dia —
mais de um ano de cobertura — enquanto falta 29 de `BK180150BRANCO`.

---

## 4. As três telas da revisão

### 🔴 PEDIDOS DE HOJE — urgência real

Origem: **PDF**. Uma venda com NF emitida cujo SKU não tem estoque.
É o único caso de urgência: cliente esperando, prazo de despacho correndo.

### 🔵 PRODUÇÃO — o trabalho de base

Origem: **cálculo ao vivo**. Lista ordenada pela maior necessidade.
Não depende de lançamento. Atualiza sozinha conforme estoque e vendas mudam.

Cada linha mostra: SKU, quanto falta, e — ao expandir — a decomposição
(comprometido, alvo, estoque), para o operador entender de onde vem o número.

### 🟡 DEVOLUÇÕES

Sem alteração.

---

## 5. O que sai do sistema

| Sai | Por quê |
|---|---|
| **Foto do estoque** (`foto_estoque`) | Era remendo para o recálculo do PDF. Sem produção vinda do PDF, perde a razão de existir |
| **Lançamento manual para estoque** | O cálculo cobre. Fica só para casos excepcionais |
| **Cruzamento PDF × estoque para produção** | O PDF passa a gerar só urgência |

O modo teste, o bloqueio de SKU e o fluxo de embalagem **não mudam**.

---

## 6. O que entra

### Tabela `venda_futura`

```sql
CREATE TABLE IF NOT EXISTS venda_futura (
  venda_id     TEXT PRIMARY KEY,     -- N.º de venda, evita duplicidade
  codigo       TEXT,                 -- SKU
  data_venda   TEXT,                 -- para a média
  data_envio   TEXT,                 -- prometida; NULL se sem data
  importado_em TEXT DEFAULT (datetime('now','localtime')),
  teste        INTEGER DEFAULT 0
);
```

Quatro campos de dados, nada pessoal.

**Comportamento na importação:** cada linha é gravada por `venda_id`. Venda que já
existe é **atualizada** (o ML remaneja datas). Venda que sumiu da planilha é
**removida** — ela foi cancelada ou já enviada.

### Configuração

| Chave | Padrão | Uso |
|---|---|---|
| `dias_cobertura` | `10` | Multiplicador do alvo. **Editável** — aumente antes de férias ou pico |
| `janela_media` | `30` | Dias considerados no cálculo da média |
| `alvo_minimo` | `2` | Piso por SKU: nunca menos que isso, mesmo com giro baixo |

### Telas

**Admin → Planejamento** (aba nova ou reforma da atual "Estoque & Necessidade"):
sobe a planilha, ajusta os dias de cobertura, vê a tabela completa com a
decomposição de cada número, e a lista de SKUs desconhecidos para cadastrar.

**Alerta de SKU não cadastrado:** visível para o gestor **e** para o operador,
como você pediu. No admin, contador na aba; na revisão, aviso no topo.

---

## 7. Decisões tomadas

**1. Alvo mínimo: 2 unidades.** ✅ Com 10 dias de cobertura, itens de giro baixo
dariam alvo 0 ou 1 — e aí não haveria nenhuma peça pronta se alguém comprasse.
O piso de 2 garante resposta imediata mesmo nos tamanhos de pouca saída.

**2. Janela da média: 30 dias.** ✅ Responde a mudanças de demanda sem oscilar
demais. Configurável.

**3. `SCREEN3-160140BEGE`:** ✅ já cadastrado, no formato como veio.
Consequência: a regex `^BK(\d{3})(\d{3})([A-Z]+)$` usada na etiqueta e no seletor
de devolução **não reconhece** esse formato. Ele funciona no fluxo normal, mas não
gera etiqueta pela tela de cadastro nem aparece no seletor cor+medida da devolução.
Registrado como limitação conhecida.

**4. Alvo manual como trava opcional.** Recomendação: manter o campo `alvo`
existente com novo significado — **vazio ou zero = calculado automaticamente;
preenchido = usa o seu número**. Serve para três casos que o histórico não prevê:

- Produto novo, que vai vender mas ainda não vendeu
- Produto saindo de linha, que você quer zerar apesar do histórico
- Promoção planejada, com pico previsto

A tela mostra qual é qual: `alvo 9 (auto)` ou `alvo 15 (travado)`.

---

## 8. Riscos e como tratá-los

| Risco | Tratamento |
|---|---|
| Média baixa em SKU novo (pouco histórico) | Alvo mínimo, ou marcar como "sem histórico suficiente" |
| Planilha desatualizada | Mostrar na tela a data e hora da última importação |
| Sazonalidade | Janela configurável; ajuste dos dias de cobertura antes do pico |
| Venda cancelada continua na conta | Removida na próxima importação, por ausência |
| Operador não entender o número | Mostrar a decomposição ao expandir |

---

## 9. Plano de implementação

**Fase 1 — Leitura da planilha** (não muda nada em produção)
Rota de importação, tabela `venda_futura`, tela que mostra o resultado do cálculo
**lado a lado** com o modelo atual. Você compara e confere se os números fazem
sentido antes de trocar.

**Fase 2 — A tela azul passa a usar o cálculo**
A revisão deixa de depender de lançamento. A tela vermelha continua igual.

**Fase 3 — Limpeza**
Remove a foto do estoque e o cruzamento de produção do PDF. O PDF fica só na
expedição.

**Fase 4 — Refinamento**
Sugestão automática de dias de cobertura, histórico de acerto do planejamento,
fechamento diário (produzido × vendido).

A Fase 1 é reversível por completo: nada do que existe é tocado.

---

## 10. O fechamento diário

No fim do dia, o sistema responde:

```
Produzi X · Vendi Y · Estoque variou Z
Cobertura média: N dias  (era M ontem)
```

É o número que diz se a fábrica está ganhando ou perdendo terreno — e se os
10 dias de cobertura estão sendo mantidos, encurtando ou esticando.
