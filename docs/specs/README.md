# Especificações — `docs/specs/`

Aqui moram os **planos** do sistema: o que ainda vai ser construído, ou está sendo.
Como o sistema **funciona hoje** está no `CLAUDE.md` e no resto de `docs/`.

## O ciclo de vida de um documento

```
IDEIA            → conversa no Projeto do Claude (fora do repositório)
SPEC APROVADA    → docs/specs/NOME.md            status: planejado
EM CONSTRUÇÃO    → a mesma spec                  status: em construção
IMPLEMENTADO     → as regras vão para o CLAUDE.md / docs/
                   a spec vai para docs/arquivo/  status: arquivado
```

## As três regras

1. **Um documento mora em um lugar só.** Spec aprovada sai do Projeto e vive aqui.
   Nunca uma cópia lá e outra cá.
2. **Toda spec começa com o bloco de status**, com data. Quem constrói atualiza o
   status **no mesmo commit** do código.
3. **Onde a spec e o `CLAUDE.md` divergirem, vale o `CLAUDE.md`** — ele descreve o
   que está em produção. A divergência é anotada no status da spec.

## Índice — situação em 26/09/2026

| Spec | Status |
|---|---|
| `SOBMEDIDA-PEDIDO-REVENDA.md` | **Em construção** · módulo sob medida (`tecido/`) · **fase 1 em produção e conferida (22/09 — dez persianas reais no corte e dez no preço, as vinte bateram)** · **fase 2 em código (22/09 — revenda, carteira, tabelas A/B/C, feriados e prazo; falta cadastrar as revendas de hoje)** · **fase 3 em código e conferida no deploy (23/09 — o pedido 5001 saiu com duas persianas, duas coleções, mínimo faturado, cascata e prazo, tudo refeito por fora contra o PDF; falta a semana em paralelo ao Decorsoft)** · **fase 4-A em código (23/09 — a etiqueta de produção com código por setor que nasce na aprovação, a reimpressão com o mesmo código e as peças indo para o plano de corte em medida de CORTE — **o leitor bipou no papel**; falta a peça real atravessando os cinco setores)** · **fase 4-B em código (24/09 — o comprometido de tecido: o que está vendido e ainda não foi cortado, no painel do sob medida, e o aviso ao vendedor de pedido aprovado esperando tecido; falta o comprador comprar por ele)** · **fase 4-C em produção (24/09 — o tubo do sob medida chegando ao MESMO Compras do PCP, pela porta única; a peça sai da conta quando a etiqueta dela é impressa; deploy limpo, e a primeira leitura deu vazio porque os tubos do 5001 já tinham sido impressos; **os tubos 38, 41 e 56 cadastrados e os quatro degraus apontados em 24/09** — falta o primeiro pedido real aparecer lá e o comprador comprar por ele)** · **fase 5-A em código (24/09 — os cinco setores da produção no controle de acesso do PCP, um por bancada, nascendo vazios; o papel e os setores viraram duas contas, para quem faz duas coisas não perder a bancada; sobe sozinha para o dono marcar as pessoas)** · **fase 5-A EM PRODUÇÃO (24/09 — os cinco setores no ar, com uma pessoa marcada em cada)** · **fase 5-B1 em código (24/09 — o bipe: as filas por setor com as liberações do §4.15, bandô e barra segurando só a embalagem, o kit conferido contra o kit CERTO, a pendência que a chefia fecha com motivo e o Pronto automático — que é `pronto_em` e NÃO o `marco`, para não quebrar a reimpressão da etiqueta nem as contas da compra; falta a bancada de verdade com o leitor na mão)** · **fase 5 INTEIRA EM PRODUÇÃO (24/09 — 5-A, 5-B1 e 5-B2 no ar; falta a conferência de fábrica das três: a peça atravessando os cinco setores com o leitor na mão, e a bancada recusando uma de verdade)** · **fase 5-B2 em código (24/09 — a recusa: qualquer bancada devolve a peça por defeito do trabalho ANTERIOR escolhendo só o motivo; o motivo aponta o COMPONENTE e o setor sai dele, porque a serralheria faz quatro peças; volta o culpado e tudo que depende dele, pela mesma tabela que libera para a frente; a refeita reimprime a MESMA etiqueta, marcada em vermelho; falta a bancada de verdade recusar uma peça)** · **fase 6-A em código (24/09 — o QUADRO: onde está cada pedido, com a barrinha por setor e o selo de retido; a etapa é DERIVADA de marco + pronto_em + bipes e o `marco` não se mexeu, que é a dívida 15 respondida; desativar coluna não some com o pedido, ele vira aviso)** · fases 6-B, 6-C, 7 e 8 planejadas · **a lista única do que está pendente fica no topo da spec** · as duas decisões da §8 anteriores à fase 1 estão respondidas |
| `SAIDA-E-DUPLA-CONFERENCIA.md` | **Em construção** · 4 fases · substitui o Fechar coleta de 10/09 · **fase 1 em código (26/09): quem imprimiu e quem bipou gravados, tabela `saida` e o script do passivo — no ar em 26/09; passivo fechado (399 caixas); falta ver os nomes no dado real** · **fase 2 no ar (26/09, PR #138): a conferência da pilha no Carregamento, bipe único (opção A); falta ver a conta num dia real** · **fase 3 no ar (26/09, PR #140): a saída do caminhão, uma por caminhão, com sobras, foto e `saida.liberar`; falta o primeiro caminhão de verdade** · **fase 4 em código (26/09): a viagem à agência, dois bipes na agência, foto da galeria** |
| `ESTOQUE-LIVRO-E-CONFERENCIA.md` | **Em construção** · fase 0 e fase 1 em código (21/09) · fases 2–4 planejadas · uma decisão em aberto (§6.4) |
| `VENDAS-E-MEDIA.md` | Planejado · nada no código · a troca da fonte da média (fase 3) espera o ok do dono |
| `MESA-DE-CORRECOES.md` | Planejado · nada no código · depende do livro (Estoque F1) e das canceladas (Vendas F2) |
| `SOBRAS-TOM-E-DESPERDICIO.md` | Em construção · Fase 1 em produção (19/09) · **Fase 2 feita** (21/09, a mensagem do plano) · fases 3–4 planejadas |
| `COMPRAS.md` | Implementado (fases 0–6) · fase 7 pendente · com mudanças na construção |
| `ARQUITETURA-ALVO.md` | Parcial — só no módulo sob medida (`tecido/`) |
| `PCP-CONTROLE-E-VISAO.md` | Parcial e divergente · decisão pendente |
| `TABLETS-E-KIOSK.md` | Planejado · nada no código · camada 1 (iPad) pode ir já |
| `PRODUCAO-MAPA-E-MOTOR.md` | Planejado · não iniciado · depois da fila de consertos |
| `PRODUCAO-MONTAGEM.md` | Planejado · não iniciado · depois da fila de consertos |

## O pacote de 21/09/2026 — a ordem é do dono, e está aqui porque ordem combinada em conversa é a primeira coisa que se perde

As três specs novas são **um pacote só**, e uma depende da outra. A ordem de
construção, decidida pelo dono em 21/09/2026:

```
fase 0 (consertos, sem spec)
   └─▶ ESTOQUE F1   o livro de movimentos      ← base de tudo
          └─▶ VENDAS F1   a média do sistema, lado a lado
                 └─▶ VENDAS F2   planilha só de futuras + canceladas
                        └─▶ ESTOQUE F2 e F3   conferência e ajuste em duas pessoas
                               └─▶ MESA F1 a F3   a mesa de correções e os scripts
                                      └─▶ ESTOQUE F4 e VENDAS F3   acuracidade e a troca da média
```

> ⚠️ **A fase 1 do livro não começa antes dos consertos da fase 0.** Um deles é
> justamente a aprovação de contagem que grava o número contado como saldo e apaga
> o que andou entre contar e aprovar — é o defeito que o `saldo_na_contagem` da
> `ESTOQUE-LIVRO-E-CONFERENCIA.md` §5.4 resolve de vez. Consertar depois do livro
> seria consertar duas vezes.

**Implementada e arquivada em 17/09/2026:** `GERADOR-ETIQUETA-KIT.md` — as
quatro fases (conteúdo, prévia, impressão em PDF e a remoção do upload),
conferidas em produção. As regras estão no `CLAUDE.md` §4.

**Implementada e arquivada em 25/09/2026:** `CARREGAMENTO-ADIANTADO.md` — as
peças que saem adiantadas, no quadro do Carregamento. As regras estão no
`CLAUDE.md` §8-B.

**Arquivado sem construir em 26/09/2026:** `COLETA-LEVA-AGENCIA.md` — o
rascunho de 25/09 que trocava a modalidade da caixa da agência levada pelo
caminhão. Substituído pela `SAIDA-E-DUPLA-CONFERENCIA.md`, que resolve pela
troca de porta (`saiu_por`) sem mexer na modalidade.

Em `docs/arquivo/`: `COLETA-LEVA-AGENCIA.md`, `CARREGAMENTO-ADIANTADO.md`, `GERADOR-ETIQUETA-KIT.md`, `REVISAO-COMPLETA.md`,
`ESTOQUE-TECIDO-E-SOBRAS.md`, `PROMPT-ESTOQUE-TECIDO-E-SOBRAS.md`,
`PROMPT-FASE-0.md`, `PERGUNTAS-COMPRAS.md`, `GESTAO-DE-TAREFAS.md` e
`MELHORIAS.md` (os sete últimos arquivados por decisão do dono em 17/09/2026).
