> **STATUS · 02/10/2026 — EM CÓDIGO** · tipo `REGRA` · risco 🔴 (estoque) · fase única.
> Decidida pelo Lucas em 02/10/2026 (opção **B**, código novo). Em código no mesmo dia:
> `POST /api/carregamento/recusa`, o botão **🚫 Motorista recusou** no Carregamento,
> `cancelada_dominio.recusar`, a coluna `lote.cancelada_por` e a nota na Mesa.
> `teste_recusa_motorista.js` (59 casos, escrito antes do código, 7 defeitos reintroduzidos).
> Falta: subir, e **a primeira caixa recusada de verdade** marcada pela expedição e aceita
> pelo admin na Mesa.

# A caixa que o motorista recusou volta ao estoque

## 1. O problema, nas palavras do dono

> *"Temos uma venda que foi cancelada e foi impressa a etiqueta de venda. Isso acontece
> quando o cara do mercado livre vem carregar, ele tenta bipar e dá como recusada. [...] Se
> foi impressa a etiqueta de venda precisamos fazer ela voltar ao estoque. Não precisa
> revisar mais e nem passar na embalagem. Apenas voltar ela para o estoque."*

Até aqui, só o **relatório do Mercado Livre** dizia ao sistema que a venda foi cancelada
(VENDAS-E-MEDIA, fase 2). Quando o motorista recusa no bipe dele, a caixa continuava
`embalado` ou `carregado` aqui dentro, e a Mesa de correções recusava a volta ao estoque
com *"este volume não está cancelado"*. Não havia caminho.

## 2. As decisões do dono (02/10/2026)

| # | Decisão |
|---|---|
| D1 | **Código novo (opção B)**: a expedição marca na tela do Carregamento — é ali que a caixa está, na conferência antes de o motorista bipar |
| D2 | **A expedição só diz "o motorista recusou"**, não "foi cancelada" |
| D3 | **Dois passos**: o admin aceita a edição e a volta ao estoque |
| D4 | **Ao marcar, a tela avisa** quem marcou para voltar a peça à prateleira |

## 3. Como funciona

```
Carregamento → 🚫 Motorista recusou → bipe da etiqueta de venda
            → a tela mostra cliente, NF e as peças → "Sim, o motorista recusou"
            → o volume vira `cancelado` (origem `motorista`, com quem marcou)
            → sai do canto, do carro e da conta da saída · o SALDO NÃO ANDA
            → aviso: "Volte a peça ao estoque: tire a etiqueta de venda e ponha a persiana na prateleira"
Admin → Correções (ou o card de Bloqueados) → "A persiana voltou"
            → movimento `cancelamento` POR PEÇA no livro
```

## 4. Regras

1. **A marcação não mexe no saldo.** Quem diz que a persiana está na prateleira é uma pessoa,
   pela Mesa, com motivo — a regra D3 da VENDAS-E-MEDIA.
2. **Vale só para a caixa com etiqueta e ainda na fábrica**: na área (`embalado`), no canto da
   coleta ou dentro do carro de uma viagem aberta. Cada recusa diz o porquê:
   sem etiqueta (nada baixou), já saiu (é devolução), já cancelada (está no card).
3. **A caixa de várias persianas é cancelada inteira**, com `cancelada_varias=0`, e a Mesa
   oferece o "voltou" por peça. Diverge da regra do relatório de propósito: lá o ML cancela
   um item e não diz qual peça é; aqui o motorista recusou a caixa toda.
4. **Sob medida** é marcada, mas o aviso não manda pôr na prateleira (não há estoque, §7), e a
   Mesa não gera movimento.
5. **A chave é `carregamento.executar`**, a mesma de quem confere. Não nasce chave nova.
6. **O relatório do ML que chegar depois** acha a venda já marcada (`ja_marcada`) e não
   mexe na origem.
7. **O bipe normal do Carregamento** continua recusando a caixa, agora dizendo que foi o
   motorista e o que fazer.

## 5. Fica de fora

- **A etiqueta impressa e não colada** (o outro problema do mesmo dia): espera a escolha do
  dono entre as opções a, b e c.
- Desfazer a marcação pela expedição: um engano se resolve pela Mesa.
