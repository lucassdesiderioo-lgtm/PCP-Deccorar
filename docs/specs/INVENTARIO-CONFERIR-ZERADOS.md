# Inventário — conferir também o que o sistema diz que está zerado

> **STATUS — rascunho, 07/11/2026.** Esperando o ok do dono nas decisões D1 a D3.
> Tipo `REGRA` · risco 🔴 (estoque). Nada construído.

## 1. O problema

A contagem geral e a quinzenal só põem na lista o SKU que **tem saldo** ou que
**teve movimento nos últimos 30 dias** (`universoGeral`, `inventario_dominio.js`).
O SKU com saldo **zero** e parado há um mês fica **fora da lista**.

Na contagem geral de 07/11/2026 o dono viu isso na tela: 1×1 Bege e 1×1 Branco
na lista, 1×1 Cinza fora; 1,20×1,20 Branco e Cinza na lista, Bege fora.

O furo: se o sistema diz zero e há 5 peças na prateleira, ninguém é chamado a
conferir. Hoje esse SKU só é pego se alguém lembrar de bipar (entra como "fora
do plano"). **O zero nunca é conferido**, e o SKU continua aparecendo como
"nunca conferido" na aba Estoque.

## 2. A proposta

Na contagem **geral** (e na **quinzenal**, D1), entram **todos os SKUs ativos**,
fora o sob medida — os com saldo e os zerados, **numa lista só**, sem marca de
quais estão zerados.

Para cada SKU da lista, quem conta faz uma de duas coisas:

| Na prateleira | Na tela |
|---|---|
| achou caixas | bipa cada uma e toca **"Terminei este SKU"** |
| **não achou nenhuma** | toca **"Não encontrei — está zerado"** (o botão "Não tem nenhuma" de hoje, com o nome novo, D3) |

O que o sistema faz depois **não muda** (R-EST-19):

- marcou "não encontrei" e o sistema também tinha zero → **confirmado**, sem
  movimento, e o SKU ganha a data de conferência (deixa de ser "nunca conferido");
- marcou "não encontrei" e o sistema tinha peça → diferença, 2ª contagem de outra pessoa;
- bipou 5 e o sistema tinha zero → diferença, 2ª contagem; se a 2ª também achar
  5, o saldo vira +5 sozinho e vai para o relatório de furos.

### Por que uma lista só, e não uma lista separada "zerados"

Uma lista "estes estão zerados" **conta a resposta** para quem conta: diz o que
o sistema acha. A contagem é **cega** de propósito (R-EST-17): quem sabe a
resposta tende a confirmá-la sem olhar a prateleira. Na lista única, o SKU
zerado parece igual a qualquer outro, e quem conta tem que **olhar e assinalar**.

## 3. Decisões do dono

- **D1 — vale para a quinzenal também?** Recomendo **sim**: a quinzenal é a que
  "passa por todos", e é ela que vai conferir o zero todo mês sem ninguém precisar
  abrir uma geral.
- **D2 — o "Terminei a prateleira (contagem geral)" fica?** Hoje ele grava "não
  tem nenhuma" de uma vez em todos os SKUs que a pessoa não bipou, depois de
  mostrar a lista e pedir confirmação. Com os zerados entrando, ele passaria a
  zerar dezenas de SKUs num toque.
  Recomendo **tirar da geral**: cada SKU sem peça é assinalado um a um, como o
  dono pediu — *"assinalar que não encontrou e está zerado"*. É mais toque, e é
  exatamente esse toque que prova que alguém olhou.
- **D3 — o nome do botão.** Recomendo **"Não encontrei — está zerado"** no lugar
  de "Não tem nenhuma", em todas as contagens. A confirmação continua: *"Confirmar
  que NÃO TEM NENHUMA caixa de X (nem na prateleira, nem na bancada)?"*.

## 4. O que muda no código (quando aprovado)

- `inventario_dominio.js`: a geral e a quinzenal (D1) passam a usar
  `skusConferiveis` (todo SKU ativo, sem sob medida) no lugar do `universoGeral`.
  A lista do dia (8 SKUs) **não muda**.
- `public/inventario.html`: o nome do botão (D3) e, pela D2, o "Terminei a
  prateleira" sai da geral (rota `POST /api/inventario/geral/terminar-prateleira`
  removida ou recusando).
- `public/index.html`: a frase da confirmação ao abrir a geral ("entra todo SKU
  com saldo ou com movimento nos últimos 30 dias" vira "entra todo SKU ativo").
  E ela corrige outra frase errada: "cada SKU é contado por duas pessoas" — só é
  contado por duas quando a 1ª deu diferença.
- `CLAUDE.md` §18, `docs/regras/estoque.md` (R-EST-24) e uma linha em
  `docs/DECISOES.md`.

## 5. Como testar

- `teste_inventario.js`: casos novos — SKU zerado e parado entra na geral e na
  quinzenal; "não encontrei" num zerado confirma sem movimento e dá data de
  conferência; "não encontrei" num SKU com saldo vai para a 2ª contagem; bipar 5
  num zerado e a 2ª achar 5 aplica +5; o JSON do `/api/inventario/hoje` continua
  sem saldo (nada diz quais estão zerados); sob medida e inativo continuam fora.
- `teste_regras_estoque.js` (regras 8 a 14) sem mudar o esperado.
- Abrir a tela `/inventario` com uma geral aberta e conferir a lista.

## 6. Fica de fora

- A contagem geral **aberta hoje (07/11/2026)** não ganha os zerados: a mudança
  vale a partir da próxima geral ou quinzenal. Hoje, o roteiro é o filtro
  **Zerado** de Admin → Estoque, bipando na tela Inventário o que for achado.
- A lista do dia (8 SKUs, seg a sex) continua como está.

## 7. Alçada

- Telas novas: nenhuma
- Ações novas: nenhuma
- Setores novos: nenhum
- Quem recebe: nada novo — usa `contagem.contar` e `contagem.planejar`, que já existem.
