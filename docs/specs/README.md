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

## Índice — situação em 17/09/2026

| Spec | Status |
|---|---|
| `COMPRAS.md` | Implementado (fases 0–6) · fase 7 pendente · com mudanças na construção |
| `ARQUITETURA-ALVO.md` | Parcial — só no módulo sob medida (`tecido/`) |
| `PCP-CONTROLE-E-VISAO.md` | Parcial e divergente · decisão pendente |
| `GERADOR-ETIQUETA-KIT.md` | Em construção · fases 1 e 2 entregues (conteúdo + prévia) · falta impressão (3) e tirar o upload (4) |
| `TABLETS-E-KIOSK.md` | Planejado · nada no código · camada 1 (iPad) pode ir já |
| `PRODUCAO-MAPA-E-MOTOR.md` | Planejado · não iniciado · depois da fila de consertos |
| `PRODUCAO-MONTAGEM.md` | Planejado · não iniciado · depois da fila de consertos |

Em `docs/arquivo/`: `REVISAO-COMPLETA.md`, `ESTOQUE-TECIDO-E-SOBRAS.md`,
`PROMPT-ESTOQUE-TECIDO-E-SOBRAS.md`, `PROMPT-FASE-0.md`, `PERGUNTAS-COMPRAS.md`,
`GESTAO-DE-TAREFAS.md` e `MELHORIAS.md` (arquivados por decisão do dono em 17/09/2026).
