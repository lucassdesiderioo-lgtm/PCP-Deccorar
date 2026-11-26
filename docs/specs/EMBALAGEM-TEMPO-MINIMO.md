# EMBALAGEM-TEMPO-MINIMO — o bipe que fecha a embalagem rápido demais é recusado

> **STATUS — 21/11/2026: NO AR** (PR #359; o dono fez o deploy e disse *"deu
> tudo certo no deploy"*). Ainda não provado com dado real: o primeiro bipe de
> fim recusado na bancada. Spec curta, aprovada pelo
> dono na conversa de 21/11/2026 (*"sim, aprovo, pode seguir"*). Uma fase só.
> Linha em `docs/DECISOES.md`, cartão **R-EMB-09** em `docs/regras/estoque.md`.

## O pedido

O dono: *"Tempo mínimo de embalagem de uma peça é de 45 segundos. Não deixar
terminar com um tempo menor. Igual a tela de revisão, não poder revisar com
tempo mínimo de 15 segundos."* É o espelho da R-REV-07 na tela 102 Embalagem.

## A regra

- O **3º bipe** (o SKU de novo, que fecha a embalagem) com menos de
  `config.emb_minimo_seg` segundos (padrão **45**) desde o **1º bipe** (o SKU)
  é **RECUSADO**. O tempo inclui o bipe do kit no meio.
- **Nada grava:** nem `montagem`, nem o +1 do estoque (livro), nem a fila, nem a
  ordem do dia, nem a baixa de material.
- **A embalagem continua aberta na tela**, com o kit já conferido e o
  cronômetro do mesmo início. A pessoa termina e bipa o SKU de novo.
- **A trava é do servidor** (`POST /api/montagem`, 409, `motivo:'rapido_demais'`,
  com `minimo` e `segundos`). Vale para todo SKU, inclusive kit e acessório.
- **Ordem das recusas:** login (401) → SKU (404) → kit (400) → tempo (409).
- **Cada recusa fica registrada** em `montagem_evento` (`rapido_demais`), com o
  SKU, os segundos e quem bipou.
- O número mora no `config` (anda sem deploy); o boot só semeia.

## Diferença de propósito em relação à Revisão

A tela da Revisão recusa sozinha abaixo do mínimo e manda o bipe mesmo assim,
só para registrar. **A tela da Embalagem não decide sozinha**: quem recusa é só
o servidor. Se a tela recusasse com um número dela, no dia em que o
`config` baixasse o mínimo ela diria "continua" de uma embalagem que o servidor
gravou — e o segundo bipe somaria +2 no estoque.

## O que a ③ REVISÃO mudou (21/11/2026)

- **A frase do 409 vale nas duas páginas**: "a embalagem NÃO foi gravada e o
  tempo recomeça: bipe o SKU agora e espere 45 s antes de bipar o kit e o SKU" (na página antiga o cronômetro recomeça no SKU; refazer os três bipes
  de uma vez levaria outra recusa). O tablet com a página antiga em cache
  descarta a embalagem antes de enviar; a frase "a embalagem continua" fazia
  ensacar a peça sem o +1 (confirmado no navegador). **No deploy, recarregar os
  tablets da Embalagem.**
- **A tela nova não zera a embalagem antes da resposta** (`emb.enviando`), e o
  bipe nesse meio é ignorado: antes ele abria uma embalagem nova escondida, que
  o aviso da recusa apagava da tela. O envio desiste em 20 s ("Falha de conexão"), para a rede pendurada não travar a bancada, e a falha de conexão avisa que a peça pode ter sido gravada e atualiza o contador do dia (rebipar somaria +1 de novo).

## Fica de fora

A bancada do sob medida; "cancelar" e "desfazer" na Embalagem; tela para
editar o mínimo (muda-se o `config`).

## Risco

🔴 — a embalagem é onde a peça vira +1 no estoque. Teste escrito antes do
código (`teste_montagem.js`, seção 9).

## Onde mora

Nenhuma tela, aba ou módulo novo: muda a 102 Embalagem (Produção).

## Alçada

Telas novas: nenhuma · Ações novas: nenhuma · Setores novos: nenhum.
