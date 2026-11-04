# Diário — ESTOQUE-LIVRO-E-CONFERENCIA, versão 2 (04/11/2026)

> Plano e fechamento de cada fase, para o dono ler no fim (ele deu o "pode seguir"
> antecipado para as fases 0 a 5). Onde este diário e a spec divergem, vale o
> STATUS da spec; onde a spec e o `CLAUDE.md` divergem, vale o `CLAUDE.md`.

## Antes de começar — o que o código real dizia

A v2 chegou dizendo "nada no código". Conferido no `main` (ab25ece): as fases 0 a 4
da v1 estavam **no ar**, e a fase 5 da v2 (ajuste em duas pessoas) é a fase 3 da v1,
no ar desde 28/09. E a spec escrevia "etiqueta −1", quando desde 22/10/2026 a
etiqueta só **reserva** e o −1 é na Conferência.

Parei e perguntei. O dono respondeu (04/11/2026), as quatro na opção recomendada:

1. a v2 se constrói **como mudança sobre o que existe**;
2. "mexeram durante a contagem" é o **livre** que mudou (embalagem, etiqueta,
   sobra, ajuste), e a baixa da Conferência não invalida;
3. **chaves novas** com backfill das atuais (desempatar ← recontar/contar;
   resolver e relatório ← aprovar), e as antigas ficam;
4. os itens que já esperavam aprovação **ficam na fila** pela regra velha.

E uma quinta, no meio da construção: a embalagem somava +1 para sob medida, contra o
R-EST-05 — **consertar junto** (decisão do dono).

---

## FASE 0 — CONSERTO das dívidas #13, #14 e #15

```
📋 PLANO
Tipo: FASE 0 da spec ESTOQUE-LIVRO-E-CONFERENCIA (CONSERTO)      Risco: 🔴
O que está acontecendo: conferir no main se #13, #14 e #15 ainda estão abertas.
O que vou mudar: nada, se estiverem fechadas.
Regra de negócio muda? NÃO
Como vou testar: teste_carga.js (#13), teste_montagem.js (#14), teste_skus.js (#15).
Fica de fora: —
```

```
✅ FECHAMENTO
Tipo e risco: FASE 0 · 🔴
O que mudou: nada. As três dívidas estão riscadas na §14 do CLAUDE.md desde
  17/09/2026, com teste atrás.
Regra de negócio mudou? NÃO
Testes: teste_carga (67) · teste_montagem (45 antes, 51 depois do conserto abaixo) · teste_skus (63) — passaram
Papel em dia: STATUS da spec
Achei no caminho: a embalagem soma +1 para sob medida (ver CONSERTO abaixo).
```

## FASE 1 — o livro de movimentos

```
📋 PLANO
Tipo: FASE 1                                                     Risco: 🔴
O que está acontecendo: conferir o livro no ar contra a §3 da v2 (sem mudança da v1).
O que vou mudar: nada, se bater.
Regra de negócio muda? NÃO
Como vou testar: teste_livro.js, teste_estoque.js, teste_etiqueta.js.
Fica de fora: —
```

```
✅ FECHAMENTO
Tipo e risco: FASE 1 · 🔴
O que mudou: nada. movimento_estoque, estoque_dominio (dono único), abertura, fim
  do MAX(0,…), POST /api/skus sem saldo, extrato com botão — tudo no ar.
  Divergência: a v2 lista o tipo `etiqueta`; desde 22/10 o −1 é `conferencia`, e a
  volta é `sobra`. Vale o CLAUDE.md.
Regra de negócio mudou? NÃO
Testes: teste_livro (65) · teste_estoque (86) · teste_etiqueta (68) — passaram
```

## CONSERTO — a embalagem não soma sob medida (decisão do dono no meio da fase 2)

```
📋 PLANO
Tipo: CONSERTO                                                   Risco: 🔴
O que está acontecendo: POST /api/montagem soma +1 para qualquer SKU; a
  Conferência não baixa sob medida; o saldo do SOBMEDIDA sobe 1 por embalagem.
O que vou mudar: mont_route.js (não chama movimentar para modelo sob_medida).
Regra de negócio muda? NÃO — o R-EST-05 já diz isso; o código não fazia.
Como vou testar: caso novo no teste_montagem.js, escrito antes (reprovou 2),
  e a regra 16 do teste_regras_estoque.js.
Fica de fora: o saldo que o SOBMEDIDA já acumulou em produção (só aponto).
```

```
✅ FECHAMENTO
O que mudou: embalar um SKU sob medida registra a embalagem (montagem, fila,
  ordem do dia) e não mexe no saldo.
Testes: teste_montagem (51) · teste_livro (65) · teste_regras_estoque (regra 16) — passaram
Deploy: depois de subir, confira o saldo do SOBMEDIDA (e do BKSOBMEDIDA) em
  Admin → Estoque; se não for zero, peça ajuste com motivo.
```

## FASE 2 — a lista diária e a contagem em duas pessoas

```
📋 PLANO
Tipo: FASE 2                                                     Risco: 🔴
O que está acontecendo: a conferência de três papéis da v1 manda para aprovação
  quando A e B batem; a v2 aplica sozinho, cria a lista diária, o rodízio, a tarja.
O que vou mudar:
  relogio.js (novo) — a hora da lista, trocável só em teste
  inventario_dominio.js — aplicar sozinho, 3ª por desempatar, fila do admin,
    §5.5-B pelo livre, lista do dia, ordem e folga, sobras, escala, 10h, tarja,
    relatório de furos
  inventario_route.js — /hoje, /bipe, /terminar, /tarja, /rodizio, /resolver,
    /relatorio; as rotas antigas saem
  permissoes.js, acesso.js — desempatar, resolver, relatorio; permDaRota; backfill
    3-D2 (config.seed_inventario_v2); setor nativo
  auth.js — usuarios.fora_rodizio (CREATE e ALTER)
  etq_route.js — grava recusa_estoque na recusa "sem estoque"
  teste_route.js — recusa_estoque e inventario_escala no modo teste
  pendencias_dominio.js — as duas linhas do inventário com as chaves novas
  public/inventario.html, public/nav.js (tarja), public/index.html (aba Contagem)
Regra de negócio muda? SIM → antes: duas contagens que batem esperam aprovação /
  depois: aplicam sozinhas; e a lista do dia, o rodízio e a tarja (DECISOES.md)
Como vou testar: teste_inventario.js reescrito; teste_regras_estoque.js novo, com
  o servidor de verdade; teste_acesso.js; todos os teste_*.js; npm test do tecido;
  banco novo numa pasta temporária; teste de segurança §10/§19; abrir as telas.
Fica de fora: a marcação "fora do rodízio" em Admin → Acessos (ficou no card da
  aba Contagem).
```

```
✅ FECHAMENTO
Tipo e risco: FASE 2 · 🔴
O que mudou: a contagem do dia é das duas pessoas escaladas às 7h; quando as duas
  acham a mesma diferença, o saldo muda sozinho e o dono lê o furo no relatório.
  Se não batem, uma terceira desempata; se nem ela, vai para quem resolve.
  Mexeram no SKU durante a contagem, a tela pede para contar de novo.
Regra de negócio mudou? SIM (5 linhas em DECISOES.md, mais as 2 decisões de hoje)
Testes: teste_inventario (98) · teste_regras_estoque (97) · teste_acesso (360) ·
  teste_pendencias (64) · teste_estoque (86) — passaram
Papel em dia: CLAUDE.md §11, §14, §15, §18 · docs/regras/estoque.md R-EST-05,
  17, 18, 19 e 24 · DECISOES.md · STATUS da spec · README das specs
Achei no caminho: ver o fim deste diário.
```

## FASE 3 — a quinzenal e a geral

```
📋 PLANO
Tipo: FASE 3                                                     Risco: 🔴
O que vou mudar: inventario_dominio.js (abrirQuinzenal, prazo em dias úteis,
  suspender a diária, fecharQuinzenal, terminarPrateleira), as rotas
  /quinzenal/abrir, /geral/abrir (com confirmar) e /geral/terminar-prateleira, e
  os botões na aba Contagem.
Regra de negócio muda? SIM (linha da quinzenal em DECISOES.md)
Como vou testar: teste_inventario (quinzenal e geral), teste_regras_estoque (12 e 13).
Fica de fora: escolher quem conta a geral (ela fica aberta a quem tem contar).
```

```
✅ FECHAMENTO
O que mudou: a cada 15 dias abre sozinha a quinzenal (todos os SKUs com saldo ou
  movimento em 30 dias), com prazo de 3 dias úteis, suspendendo a diária; no fim, o
  que ninguém contou vira "não conferido". A geral só abre confirmando a expedição
  parada, e o "terminei a prateleira" grava zero da pessoa no que ela não bipou —
  o SKU só vira zero quando duas confirmam.
Construção diferente da spec: a quinzenal fica aberta até o prazo mesmo terminada;
  a divergência em andamento vai para a diária seguinte (não vira "não conferido");
  a primeira quinzenal é 15 dias depois do deploy.
Testes: os acima — passaram
```

## FASE 4 — o relatório de furos completo e os três estados

```
📋 PLANO
Tipo: FASE 4                                                     Risco: 🟡
O que vou mudar: inventario_dominio.relatorio (furos com contagens e extrato,
  semana e mês, mais furam, não conferidos, listas pela metade, escala e quem não
  contou, fila do admin, acuracidade) e o card na aba Contagem; R$ só com custo.ver.
  Os três estados e a idade do inventário já estão no ar (v1, fase 4).
Regra de negócio muda? NÃO
Como vou testar: teste_inventario e teste_regras_estoque (o R$ some sem custo.ver);
  teste_acuracidade e teste_estoque continuam passando.
```

```
✅ FECHAMENTO
O que mudou: o dono lê, na aba Contagem, cada furo com quem contou e o extrato do
  SKU desde a conferência anterior, a soma da semana e do mês, os SKUs que mais
  furam, o que não foi conferido e quem foi escalado e não contou.
Divergência: a acuracidade ficou a do R-EST-23 (acerto da 1ª contagem); a §7.3
  escreve outra conta. Vale o CLAUDE.md.
Achado na tela (consertado): o valor do período escrevia R$ 0,00 quando nenhum furo
  tinha custo — custo indefinido não vira zero; e os nomes do rodízio saíam em
  caixa alta, embaralhados (a regra de `label` do admin).
Testes: teste_acuracidade (23) · teste_estoque (86) — passaram
```

## FASE 5 — ajuste manual em duas pessoas

```
📋 PLANO
Tipo: FASE 5                                                     Risco: 🔴
O que está acontecendo: é a fase 3 da v1, no ar desde 28/09/2026.
O que vou mudar: nada. A decisão do aprovador único continua: ESPERA.
Como vou testar: teste_ajuste.js.
```

```
✅ FECHAMENTO
O que mudou: nada.
Testes: teste_ajuste (53) — passou
```

---

## Achei no caminho (não mexi)

- **O saldo que o SOBMEDIDA/BKSOBMEDIDA já acumulou** pela embalagem antes do conserto
  continua lá: conferir em Admin → Estoque e zerar por ajuste, com motivo.
- **O cadastro de SKU de produção não tem coluna `ativo`** — "SKU inativo" da spec não
  existe hoje; o filtro vale se a coluna existir.
- **Toda tela de quem não tem `teste.operar` dá um 403 no console**: é a tarja do modo
  teste do `nav.js` perguntando `/api/teste`. Não quebra nada; já era assim.
- **O `teste_pendencias.js` tem 64 casos, e o CLAUDE.md diz 65** — no `main` também
  são 64.
- **O `teste_livro.js` não chama a embalagem com sob medida** (o caso 8 só olha que o
  saldo nasce zero) — foi assim que o defeito acima ficou de fora.
