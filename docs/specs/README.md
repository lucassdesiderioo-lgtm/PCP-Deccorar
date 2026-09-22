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

## Índice — situação em 22/09/2026

| Spec | Status |
|---|---|
| `SOBMEDIDA-PEDIDO-REVENDA.md` | **Em construção** · módulo sob medida (`tecido/`) · **fase 1 em código (22/09)** · fases 2–8 planejadas · as duas decisões da §8 anteriores à fase 1 estão respondidas; falta o dono simular dez persianas reais |
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

Em `docs/arquivo/`: `GERADOR-ETIQUETA-KIT.md`, `REVISAO-COMPLETA.md`,
`ESTOQUE-TECIDO-E-SOBRAS.md`, `PROMPT-ESTOQUE-TECIDO-E-SOBRAS.md`,
`PROMPT-FASE-0.md`, `PERGUNTAS-COMPRAS.md`, `GESTAO-DE-TAREFAS.md` e
`MELHORIAS.md` (os sete últimos arquivados por decisão do dono em 17/09/2026).
