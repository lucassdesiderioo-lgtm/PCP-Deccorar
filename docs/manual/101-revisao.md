---
tela: 101
titulo: Revisão
situacao: rascunho
atualizada_em: 2026-11-26
cartoes: R-EST-01, R-REV-01, R-REV-02, R-REV-03, R-REV-04, R-REV-05, R-REV-06, R-REV-07, R-REV-08, R-REV-09, R-TEM-01, R-EMB-11
parametros: rev_minimo_seg = Tempo mínimo da revisão (segundos)
---

## Para que serve

## Onde entra no fluxo

## Botões e ações

## O que a tela mostra

## Por que a tela faz isso

## Perguntas frequentes

## Mudanças
- 21/11/2026 — ficha criada em rascunho
- 21/11/2026 — Ao terminar a peça, o aviso mostra o seu tempo ao lado da sua média (a mediana das suas peças recentes daquele SKU), com "Parabéns!" ou "Você pode melhorar". Só você vê o seu.
- 22/11/2026 — O tempo ao lado da sua média está no ar na bancada desde 21/11/2026.
- 22/11/2026 — Entrou o bloco "Voltaram da embalagem por defeito": a persiana que quem embala devolveu aparece aqui com o motivo e quem achou. "Tem defeito" escolhe o setor responsável e a peça vira peça com problema; "Não tem defeito" fecha a volta e a peça é revisada de novo pelos dois bipes (a peça de devolução volta direto à fila da embalagem). A revisão daquela peça deixa de contar.
- 23/11/2026 — Consertado o botão "Peça com problema": a janela do motivo deixou de devolver o foco ao campo do bipe (o campo piscava e o toque não pegava), o bipe não fecha mais a revisão por baixo dela, e a tela só diz "Voltou para a produção" quando o registro foi gravado.
- 23/11/2026 — A Revisão virou uma tela só: não se escolhe mais cor ao abrir. A lista mostra Hoje (as vendas de hoje sem peça), Próximos dias (até sexta) e Completar o alvo. Você bipa a peça que tem na mão, e a tela diz para onde ela vai; quem decide é o sistema. O dia de hoje fica em destaque e, quando termina, os próximos dias sobem. No topo aparecem as suas revisadas de hoje, a sua média, "↩ Devoluções" e "Ver a semana".
- 23/11/2026 — Enquanto a peça com problema está sendo registrada, a revisão fica parada: o bipe e o toque nos cartões esperam. Com a revisão aberta, tocar no cartão de outro SKU não faz nada. Com "Ver a semana" aberta, o bipe fecha a semana para você ver o que fez. O bipe na observação da peça com problema não vira texto. A venda que já foi revisada e voltou por "Desfazer" não aparece como venda nova.
- 23/11/2026 — Se a peça com problema não tiver resposta do servidor em 20 segundos, a tela desiste e avisa: confira em Problemas antes de registrar de novo. Tocar no cartão de outro SKU com a revisão aberta mostra o que fazer.
- 23/11/2026 — A venda que já está em Hoje não conta de novo nos Próximos dias, mesmo quando o Mercado Livre põe outra data para ela; e a peça revisada que ainda espera a embalagem (inclusive a de devolução) já sai do que falta.
- 23/11/2026 — O aviso vermelho de venda nova não aparece quando o estoque livre muda sem venda nova (uma peça embalada para estoque, uma etiqueta impressa).
- 23/11/2026 — A peça que volta da Embalagem por defeito é a que estava reservada para quem embalava; sem reserva, a mais antiga daquele SKU.
- 23/11/2026 — Quando o PDF de hoje chega antes da planilha do Mercado Livre, a lista não pede mais peças a menos: a venda nova conta também em "Completar o alvo". E o código bipado na observação da peça com problema sai do campo mesmo com o leitor mais lento.
- 24/11/2026 — O "Hoje" já desconta as peças revisadas que estão esperando na embalagem: com 29 vendas paradas e 9 peças na embalagem, pede 20. O cartão diz quantas já estão na embalagem.
- 24/11/2026 — O cartão escreve "N de M para hoje já revisadas (K na embalagem)", contando junto o produto do dia que já está todo na embalagem.
- 24/11/2026 — O tempo mínimo da peça passou a se mudar pela tela 906 Parâmetros, por quem é nível Admin. O número de hoje continua o mesmo.
- 25/11/2026 — a persiana que vem da montagem se revisa pela etiqueta de SKU em série, e a tela mostra quem cortou e quem montou
- 26/11/2026 — Hoje passou a ter também as vendas da próxima saída (o próximo dia de coleta) cujo PDF já subiu, mesmo que o PDF tenha subido ontem; e na primeira abertura do dia a lista já vem com elas, sem esperar um PDF novo.
- 26/11/2026 — Correção da linha acima: a primeira abertura só traz as vendas da próxima saída em dia de coleta; no fim de semana e no dia sem coleta, sem PDF novo, elas ficam em Próximos dias.
