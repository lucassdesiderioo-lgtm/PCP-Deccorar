> **STATUS · 26/09/2026 — EM CONSTRUÇÃO** · **fase 1 no ar (PR #144, deploy conferido pelo dono em 26/09)** · fases 2 e 3 planejadas
> A troca da fonte da média (fase 3) só acontece com o ok do dono depois de conferir.
>
> **Fase 1 (26/09/2026):** `media_dominio.js`, `GET /api/planejamento/media/comparar`
> e a tabela "Média: planilha × sistema" em Admin → Planejamento, com
> `teste_media.js` (25 casos). A produção **não** mudou de fonte, e
> `config.media_fonte` **não** foi criada — ela nasce com a fase 3, que é quem a lê.
>
> **Mudou na construção:**
> - **A janela usa a mesma borda da planilha** (`data >= hoje − N`, dividido por N).
>   A spec não dizia; com borda diferente, a diferença da tabela seria só a borda.
> - **"PDF repetido não dobra" ganhou guarda própria na conta**, e não só a dedup
>   do upload: até 25/08/2026 a dedup olhava o dia, e sobraram volumes repetidos.
>   A conta agrupa por pack/venda, fica com o mais antigo e **olha antes da janela**
>   (a cópia de dentro cujo original entrou antes não é venda nova). A tela diz
>   quantos descartou.
> - **O volume sem SKU lido** não vira peça de ninguém: sai contado à parte.
> - **`comparar()` recebe as linhas do `demanda_dominio` por parâmetro**, em vez
>   de chamá-lo: na fase 3 é o `demanda_dominio` que vai ler daqui, e o `require`
>   de volta fecharia um ciclo.
> - A cancelada entra na conta **se a coluna existir**: ela nasce na fase 2, e a
>   fase 1 já a respeita sem esperar.
>
> **Falta:** o dono conferir a tabela com o dado real por alguns dias — é essa
> conferência que libera a fase 3.

---

# Vendas futuras e média de 30 dias — duas fontes, duas regras

> **Versão 1 · 21/09/2026** · nasceu da conversa no Projeto "PCP - Deccorar".
> **Leia junto com:** `CLAUDE.md` §3 (armadilha #11), §5 (#5, #8, #23), §8 (#7), §18
> · `docs/DESENHO-PLANEJAMENTO.md` · `plan_route.js` · `demanda_dominio.js`

---

## 1. O problema

A tela azul e a compra de material saem de **uma** planilha do Mercado Livre, que
alimenta dois números de lugares diferentes (armadilha #11):

| Número | Olha para |
|---|---|
| média diária | as vendas dos últimos 30 dias |
| comprometido | os envios futuros |

E o import é **espelho**: apaga toda venda que não veio no arquivo. Quem sobe um
recorte só com os próximos dias apaga os 30 dias de história, a média cai a zero e
a tela azul para de pedir produção — sem erro e sem aviso. A tarja âmbar de
"recorte" avisa, mas depende de alguém ler.

**Lançar os dois no mesmo lugar não está dando certo** (dono, 21/09/2026).

---

## 2. Fatos da operação que decidem o desenho

Respondidos pelo dono em 21/09/2026:

- **Não vendem pelo Full.** Toda venda do ML passa pelo PDF que a expedição sobe
  todo dia — logo, **a história de vendas já está no sistema**, em `lote`.
- **O relatório do ML é exportado escolhendo o período** e enviado ao sistema.
- **Venda cancelada quase nunca é tratada no sistema.** Ela só chega ao sistema quando
  o cliente cancela entre o PDF subido e o envio — e aí fica parada como `pendente`.

---

## 3. A decisão

| | **Média de 30 dias** | **Vendas futuras** |
|---|---|---|
| Fonte | os PDFs (`lote` + `lote_item`) | a planilha do ML |
| Como age | nada para subir — cresce a cada PDF | **espelho só das vendas com envio futuro** |
| Venda passada no arquivo | — | só lida (para achar cancelada), **nunca apaga nada** |
| Conta | **peças**, não caixas | vendas |
| Dono único | `media_dominio.js` (novo) | `plan_route.js` / `venda_futura` |

---

## 4. A média que vem do sistema

### 4.1 `media_dominio.js` — dono único de "quanto vende por dia"

```
mediaPorSku(db, {janela}) → { codigo: {pecas, dias, media}, ... , _janela: {pedida, usada, desde} }
```

- **Peças por SKU** nos volumes com `lote.data` dentro da janela:
  - volume **com** `lote_item` → soma `lote_item.qtd` de cada SKU (caixa de pacote,
    armadilha #23);
  - volume **sem** `lote_item` → 1 peça do `lote.codigo` (regra *uma venda = uma
    etiqueta = uma persiana*, §5).
- **Ficam de fora:** `teste=1` e volume com `cancelada_em` (§5). Volume `bloqueado`
  **conta** — é uma venda; o bloqueio é dúvida de leitura, não de existência.
- **A data é `lote.data`** (o dia em que o PDF entrou), não a data da venda. Para uma
  média de 30 dias a diferença é de um ou dois dias nas pontas, e a vantagem é não
  depender de nada que alguém precise subir.
- **Janela maior que a história** (armadilha #16 do sob medida, mesma doença): a
  janela é cortada no primeiro volume registrado e a tela escreve em âmbar
  "média de N dias, não 30".
- Esqueceu um dia de PDF: o seguinte traz as etiquetas que faltaram e a dedup (#5)
  ignora as repetidas. A média não perde nada, só desloca a data.

### 4.2 Quem lê

`demanda_dominio.js` escolhe a fonte pela chave `config.media_fonte`:
`planilha` (hoje, padrão) ou `sistema`. **Nenhum outro arquivo calcula média** — a
tela azul, a aba Estoque, a TV e a compra de material continuam lendo do
`demanda_dominio` (armadilha #12).

---

## 5. A planilha passa a ser só de vendas futuras

### 5.1 O import

- Linha com **data de envio futura** (`parseDataEnvio` ≥ hoje) → `venda_futura`, como
  hoje.
- **O espelho vale só entre as futuras:** some da tabela a venda **futura** que não
  veio no arquivo. Venda passada nunca é apagada por ausência.
- Linha de venda passada → não entra em `venda_futura`; serve só para §6.
- As linhas de `venda_futura` com envio já vencido deixam de ser lidas pela média
  quando `media_fonte=sistema` e são limpas na fase 3.

### 5.2 As guardas

| Situação | O que a tela faz |
|---|---|
| arquivo sem nenhuma venda futura | **recusa**: "este arquivo não tem venda com envio futuro — confira o período exportado" |
| o arquivo tiraria mais da metade das futuras de hoje | pede confirmação (`confirmar:true`) dizendo quantas saem |
| venda com SKU fora do cadastro | continua listada, como hoje |

A tarja âmbar de "recorte" (armadilha #11) sai na fase 3: recorte deixa de apagar
história.

### 5.3 A tela

Em Admin → Planejamento, o bloco de import passa a se chamar **"Vendas futuras"** e
diz o que o arquivo precisa ter: *"as vendas ainda não enviadas — qualquer período
que cubra todas elas"*. A média aparece com a fonte escrita ao lado:
"média dos PDFs · 30 dias".

---

## 6. A mesma planilha marca as vendas canceladas

O relatório do ML traz o **Estado** de cada venda, e o sistema já reconhece
cancelada/devolvida/reembolsada (`/cancel|devolu|reembols/i`). O import passa a
cruzar essas linhas com os volumes:

1. Acha o volume pelo **número da venda** (`lote.venda`).
   > ⚠️ **Conferir com o arquivo real na fase 2:** em pacote (armadilha #23) o ML pode
   > listar a venda de cada item ou o número do pack. Se for o pack, o cruzamento usa
   > `lote.packId` também. Não chutar — abrir um relatório com pacote.
2. Grava `lote.cancelada_em` e `lote.cancelada_origem='planilha'`. **Não apaga o
   volume** (é história, como `bloqueio_resolvido`).
3. Conforme o estágio:

| Estágio do volume | O que acontece |
|---|---|
| `pendente` ou `bloqueado` | sai de "Faltam imprimir", da fila do dia, dos Bloqueados, da urgência e da média. **Estoque não mexe** — nada baixou |
| `embalado` (etiqueta impressa) | o estoque já baixou. Vai para **"Canceladas depois da etiqueta"**, na Mesa de correções (`MESA-DE-CORRECOES.md`): alguém confere se a persiana voltou e decide |
| `carregado` | ignora — saiu. Se voltar, é devolução (§9 do CLAUDE.md) |

4. O resumo do import diz quantas canceladas achou, em cada estágio.

> **Os donos únicos continuam donos:** `fila_dia.js` (o que é trabalho de hoje),
> `carga.js` (o que está pra carregar), `urgencia.js` e `ordem_dia.js` passam a
> ignorar `cancelada_em`. **Uma regra num lugar só** — nada de `WHERE cancelada_em IS
> NULL` espalhado por rota.

---

## 7. Rotas

| Rota | Permissão | Faz |
|---|---|---|
| `POST /api/vendas-futuras/importar` | `planilha.importar` | §5 e §6; devolve novas, saíram, canceladas por estágio |
| `GET /api/planejamento/media/comparar` | `@admin` | fase 1: as duas médias por SKU, lado a lado, e a diferença |
| `GET /api/canceladas` | `@admin` | canceladas depois da etiqueta, sem decisão |
| `POST /api/planejamento/config` | já existe | ganha `media_fonte` |

`POST /api/planejamento/importar` continua respondendo até a fase 2 e então passa a
chamar a mesma função do novo import (sem duas réguas).

Colunas novas em `lote` (por `ALTER`, no fim, no `exp_route.js` — §17):
`cancelada_em`, `cancelada_origem`.

---

## 8. Fases

### Fase 1 — a média do sistema, lado a lado 🟡 ☑ no ar (26/09/2026, PR #144)

- `media_dominio.js` e `GET /api/planejamento/media/comparar`.
- Em Admin → Planejamento, uma tabela "Média: planilha × sistema", com a diferença
  por SKU e os maiores desvios em cima.
- **Não muda a produção.** `media_fonte` continua `planilha`.
- **Testes:** `teste_media.js` — caixa de pacote conta peças; volume sem `lote_item`
  conta 1; teste e cancelada ficam fora; bloqueado conta; janela maior que a
  história é cortada e avisada; PDF repetido não dobra.

### Fase 2 — planilha só de futuras, e as canceladas 🟡

- §5 e §6. Colunas em `lote`. `fila_dia`, `carga`, `urgencia`, `ordem_dia` e a média
  ignoram cancelada.
- **Antes de codar o cruzamento:** abrir um relatório real com pacote (§6, ⚠️).
- **Testes:** arquivo só com vendas passadas não apaga nada; arquivo sem futura é
  recusado; tirar mais da metade pede confirmação; cancelada pendente some de
  "Faltam imprimir" e não mexe no estoque; cancelada impressa vai para a lista.
  `teste_carga.js`, `teste_ordem_dia.js` e `teste_estoque.js` continuam passando e
  ganham um caso de cancelada cada.

### Fase 3 — a troca, com o ok do dono 🟡

- Só depois de o dono conferir a tabela da fase 1 por alguns dias.
- `media_fonte=sistema`; tarja de recorte sai; limpeza das linhas vencidas de
  `venda_futura`.
- Dá para voltar para `planilha` pela config, sem deploy.
- **Testes:** `teste_estoque.js` compara a aba Estoque e a tela azul com a fonte nova.

---

## 9. Fica de fora

- Buscar vendas direto da API do Mercado Livre.
- Vendas da Shopee e do balcão (não passam pelo PCP hoje).
- Sazonalidade — a média continua simples.

## 10. Quando terminar

A armadilha #11 do `CLAUDE.md` é reescrita (a planilha deixa de ser a fonte da
média), `docs/DESENHO-PLANEJAMENTO.md` ganha nota apontando para cá, e esta spec vai
para `docs/arquivo/`.
