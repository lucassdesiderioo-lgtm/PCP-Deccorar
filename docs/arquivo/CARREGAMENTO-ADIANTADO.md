# Peças adiantadas no Carregamento

```
STATUS
Situação: ARQUIVADA — implementada e conferida pelo dono em 25/09/2026
Criada em: 25/09/2026 (o plano aprovado com "pode seguir" é esta spec)
Fases: 1 ☑ (fase única)
Risco: 🟡 (cálculo exibido e bipe — não mexe em estoque nem em schema)
⚠️ ESTE DOCUMENTO É HISTÓRICO. As regras que valem estão no CLAUDE.md §8-B —
não use daqui como fonte de regra (CLAUDE.md §13, regra 4).
```

## O pedido

> *"Quero que passe a mensurar e também mostrar na tela de carregamento a
> quantidade de peças que estamos enviando como adiantado."* — o dono, 25/09/2026

## As definições (aprovadas no plano)

1. **Adiantado** = o volume saiu da fábrica antes da data de despacho da
   etiqueta (`lote.despachar_em`).
2. **Saída**: no carro (agência) é o bipe do carregamento (`carregado_em`); na
   coleta é o caminhão levando (`retirado_em`), não a ida pro canto.
3. **Conta peças**, não caixas: a caixa de várias persianas conta a soma do
   `lote_item.qtd` (piso 1). As caixas aparecem ao lado quando não batem.
4. **Carro e coleta somados** no número grande, com a divisão embaixo.
5. **Mensurar = hoje + últimos 30 dias, na própria tela.** Sem gráfico nem
   relatório nesta fase.
6. **O bipe não trava.** A caixa futura continua carregando; o banner passa a
   dizer `⏩ ADIANTADO — despacha <dia>`.

## O que foi feito

| Arquivo | O quê |
|---|---|
| `carga.js` | `SAIDA()` e `saidasAdiantadas(db, dias)` — dono único da conta |
| `carreg_route.js` | `saiu_adiantado` no `GET /api/carregamento`; `adiantado` no `POST /api/carregar` |
| `public/carregamento.html` | 4º quadro azul e a linha no banner do bipe |
| `teste_carga.js` | 11 casos (60 no total), três defeitos reintroduzidos um a um |

## Fica de fora

- Travar o adiantamento — continua permitido (CLAUDE.md §8).
- Mudar o "No carro X de Y": a caixa adiantada continua entrando nele.
- Série por dia, gráfico ou relatório — se for pedido, sai do mesmo
  `saidasAdiantadas`.

## Conferência

- 25/09/2026: deploy feito pelo dono, que conferiu na tela e disse "ficou
  certo" (PR #132).
- A contagem da coleta só anda no fechamento com o motorista; esse caso só se
  prova no dia em que uma caixa futura for no caminhão.
