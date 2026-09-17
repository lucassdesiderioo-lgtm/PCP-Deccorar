> **ARQUIVADO · 17/09/2026** — perguntas encerradas em 20/08/2026; as respostas estão
> incorporadas em `docs/specs/COMPRAS.md` (§14). Movido do Projeto "PCP - Deccorar".

---

# Compras — perguntas de qualificação: encerradas

> Espelha a §14 do `claude/COMPRAS.md`.
> **Data:** 20/08/2026 · **Status:** todas respondidas · nada bloqueia o início

---

## O caminho até aqui

| Rodada | Perguntas | O que sobrou |
|---|---|---|
| 1 | Melhor preço, gatilho da necessidade, preço, escopo | 4 decisões |
| 2 | Custo, mão de obra, impostos, recebimento parcial | 4 decisões |
| 3 | Frete, quem recebe, envio do pedido, contagem | 4 decisões |
| 4 | Ficha, medidas do SKU, faixas, cor | 4 decisões |
| 5 | Folga, modelo, código, aprovação | 4 decisões |
| 6 | Tecido em rolo, cores, dois tecidos | 3 decisões |
| 7 | **Corte para só compras** — 20 perguntas viraram 4 | 4 decisões |
| 8 | Sobra do alumínio, validade, escala, papéis | **encerrado** |

Na rodada 7 a lista foi podada: dezesseis perguntas eram de chão de fábrica —
folga do tecido, largura das bobinas, lista de modelos e cores. Isso não é decisão
de projeto, é **campo que o cadastro pede na hora de cadastrar**, com o valor
testado na própria tela antes de salvar.

---

## As quatro últimas, e o que cada resposta mudou

### 1 · A sobra do corte de alumínio

**Você disse:** gera desperdício, mesmo encaixando várias medidas na barra de 6 m.
Não dá para medir hoje — só depois de uns três meses comprando e comparando com o
estoque.

**O que mudou:** em vez de o sistema pedir um percentual que você não tem, ele
**mede a perda pela diferença**. A ficha dá o consumo teórico; o estoque dá o
consumo real; a diferença é a perda.

```
consumo_real     = saldo_inicial + entradas − saldo_final
consumo_teorico  = Σ ( quantidade da ficha × peças produzidas )
perda_%          = ( real − teórico ) ÷ teórico
```

Os três dados já estarão no sistema — contagem, recebimento e montagem. O campo
`perda_pct` nasce em zero e só muda quando você mandar. Aplicada, entra **só na
necessidade de compra**, nunca no custo — o custo já contém a perda pelo consumo
real, e somá-la de novo seria contar duas vezes.

O relatório avisa quando a amostra é pequena demais para confiar, quando a perda dá
negativa (que é erro, não economia) e quando a "perda" pode ser folga faltando na
fórmula em vez de sobra no corte.

---

### 2 · Lote e validade

**Você disse:** não existe nada com validade.

**O que mudou:** controle de lote sai do radar. Uma preocupação a menos e um
projeto inteiro que não precisa acontecer.

---

### 3 · A escala

**Você disse:** ~30 componentes e ~5 fornecedores.

**O que mudou:** é pequeno, e isso simplifica de verdade.

- A comparação cabe numa tela — sem busca, sem filtro, sem paginação
- O cadastro da fase 1 é uma tarde, não um mês
- A lista de compras nunca passa de trinta linhas
- **O gargalo do projeto é a fórmula dos modelos**, não o cadastro de compras

---

### 4 · Os papéis

**Você disse:** hoje é só você, mas quer nascer estruturado — quem compra, quem
confere, quem paga — para ir delegando.

**O que mudou:** os três setores nascem prontos, com você marcado nos três.

```
COMPRADOR      cota · escolhe · pede            vê preço, vê custo
RECEBIMENTO    confere · devolve · dá entrada   NÃO vê preço
FINANCEIRO     confere a nota · marca pago      vê preço, NÃO cota nem recebe
```

O dia em que entrar alguém para receber, é desmarcar uma caixa — não redesenhar o
módulo.

Isso obrigou a mexer numa fronteira: você tinha decidido que o ciclo termina no
recebimento, e "quem paga" precisa ter o que fazer. A solução foram **duas colunas
e uma permissão** — `pago_em`, `pago_por` e `pedido.pagar`. É uma marca de que o
ciclo fechou, não um módulo financeiro: sem vencimento, sem fluxo de caixa, sem
conciliação. Se aparecer uma tela de "o que vence esta semana", o módulo saiu do
escopo.

---

## Próximo passo

A especificação está fechada. O que falta é execução, na ordem da §12 do
`COMPRAS.md` — começando pela **fase 0**, que transforma largura, altura e cor em
campos próprios do SKU.
