# Regras de negócio — por área

Aqui fica **o que vale hoje**, uma regra por cartão. O porquê longo — o defeito
que provocou a regra, as datas, as conferências na fábrica — fica em
[`docs/historia/`](../historia/), um arquivo por área com o mesmo nome.

| Área | Regras | História |
|---|---|---|
| Estoque, revisão e embalagem | [`estoque.md`](estoque.md) | [`historia/estoque.md`](../historia/estoque.md) |

As outras áreas continuam no `CLAUDE.md` até serem passadas para cá, uma por vez.

## O cartão

```
### R-EST-01 · Revisar não mexe no estoque
- Regra:            o que vale, em uma ou duas frases
- Por quê:          o motivo de negócio
- Exceções:         quando não vale (ou "nenhuma")
- Teste que trava:  o teste que reprova se alguém desfizer a regra
- Status:           desde quando está no ar · se foi conferida na fábrica
- História:         onde procurar o porquê longo (número da armadilha)
```

**Código do cartão:** área (`EST`, `REV`, `EMB`, `KIT`…) e número. O número não
muda e não é reaproveitado: regra que deixa de valer sai do arquivo e vai para a
história com a data.

## Três regras do formato

1. **Regra sem teste aparece como "⚠ sem teste"**, e entra na lista do fim do
   arquivo da área. Sem teste, só este papel impede alguém de desfazê-la.
2. **"Conferida na fábrica" só se escreve quando foi conferida**, com a data. O
   que não foi conferido se escreve "ainda não".
3. **Mudou a regra, muda o cartão no mesmo commit do código**, e a história nova
   vai para o fim do arquivo de história, com data. O que já está na história
   não se reescreve.
