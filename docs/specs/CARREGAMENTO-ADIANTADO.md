# Peças adiantadas no Carregamento

```
STATUS
Situação: IMPLEMENTADA em 25/09/2026 — falta conferir em produção
Criada em: 25/09/2026 (o plano aprovado com "pode seguir" é esta spec)
Fases: 1 ☑ (fase única)
Risco: 🟡 (cálculo exibido e bipe — não mexe em estoque nem em schema)
Quando conferida: vai para docs/arquivo/. As regras que valem estão no
CLAUDE.md §8-B.
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

## Falta

- **Conferir em produção:** bipar uma caixa de despacho futuro e ver o aviso e
  o quadro andar; fechar uma coleta com caixa futura e ver a coleta contar só
  depois do fechamento.
