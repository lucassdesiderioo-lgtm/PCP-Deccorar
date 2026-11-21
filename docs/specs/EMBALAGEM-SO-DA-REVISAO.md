# EMBALAGEM-SO-DA-REVISAO — a persiana só embala se veio da Revisão

> **STATUS — 21/11/2026: construída, falta subir.** Spec curta, aprovada pelo
> dono na conversa de 21/11/2026 (*"1- só persiana 2- sem exceção"*, *"pode
> seguir"*). Uma fase só. Linha em `docs/DECISOES.md`; muda o cartão
> **R-EMB-02** em `docs/regras/estoque.md`.

## O pedido

O dono: *"Hoje conseguimos [embalar] uma persiana que não veio da fila da
revisão. A tela de embalagem só pode seguir com alguma embalagem vindo da
revisão."*

## A regra

- A **persiana** — SKU de modelo com medida (`COALESCE(modelo.exige_medida,1)`;
  o SKU sem modelo conta como persiana) — só embala se houver uma linha dela na
  `fila` com `situacao='aguardando'` (a do momento: modo teste só a de teste).
- Sem ela, `POST /api/montagem` responde **409** (`motivo:'sem_revisao'`) e
  **nada grava**: nem `montagem`, nem o +1 do livro, nem a ordem do dia, nem a
  baixa de material. A recusa vira uma linha `sem_revisao` em
  `montagem_evento`, com quem bipou.
- A ordem das recusas: login → SKU → **revisão** → kit → tempo (sem revisão não
  adianta conferir kit nem esperar os 45 s).
- **A tela avisa no 1º bipe**: se a persiana não está em "Aguardando
  embalagem", ela pergunta a fila de novo ao servidor (a peça pode ter saído da
  Revisão nos últimos 4 s) e, sem ela, mostra *"Não passou pela Revisão — leve
  a persiana para a Revisão e embale depois"*. Quem decide é o servidor; a
  recusa do bipe final aparece igual.

## O que fica de fora, de propósito

- **Kit, acessório e sob medida** (modelo sem medida): não passam pela Revisão
  e embalam sem fila, como antes (decisão do dono, "só persiana").
- **Não há liberação** (decisão do dono, "sem exceção"): a peça que sumiu da
  fila — revisão perdida por falha de conexão, tirada por engano — é revisada
  de novo. Nenhuma chave nova.
- A devolução reembalada entra pela fila (`modo='devolucao'`) e passa.
- A bancada do sob medida não entra.

## A consequência que o dono aceitou

Tirar da fila uma peça que **existe** passa a ter efeito: ela deixa de poder
ser embalada até ser revisada de novo (ou até desfazer o "Tirar da fila" na
Mesa de correções, que devolve a linha). O "Tirar da fila", o `limpar_fila.js`
e o `ajustar_fila_embalagem.js` ficam para a peça que não existe; a prévia da
Mesa diz isso.

## Alçada e lugar

Nenhuma tela, aba, ação, setor ou módulo novo. Tela 102 Embalagem (Produção).

## Testes

`teste_montagem.js` seção 10 (persiana sem fila 409 e nada grava; linha já
embalada não conta; a ordem das recusas; com fila 200 e consome; devolução
passa; SKU sem modelo é persiana; kit e sob medida passam; a tela confere no 1º
bipe). `teste_livro`, `teste_fichas_material` e `teste_regras_estoque` passaram
a pôr a peça na fila antes de embalar.
