# RELATORIOS-UNIFICADOS — todo relatório num lugar só, e o que cada pessoa fez pelo login dela

> **STATUS · 08/11/2026 — AS QUATRO FASES NO AR** (PR #319; o dono: *"deu tudo
> certo no deploy"*). Falta a prova com dado real (CLAUDE.md §21). Aprovada
> pelo dono (*"lista ok, embalagem sim, spec aprovada"*) e construída inteira
> (*"vamos fazer ela inteira"*): a 904 em abas e a 905 Minha produção. R7 pela
> opção (a), o retrato diário (`pendencias_dia`); a 905 nasce para os setores de
> operação. As regras que parecem bug estão no `CLAUDE.md` §21. Pedido do dono em 08/11/2026:
> *"tudo isso que temos de relatório de alguma coisa no sistema devemos deixar
> concentrado em apenas um lugar, que seria a tela de relatórios, e já deixando
> registrado o que cada pessoa executou, pensando em extrair tudo isso pelo
> login da própria pessoa"*. Para a reunião de toda segunda-feira, em
> **quantidade, nunca em valor**. `NOVIDADE` 🟡 (só leitura; nenhuma conta nova
> de estoque, nenhum dado novo gravado).

## 1. O problema

Hoje cada relatório mora na tela onde nasceu, e quem quer ver o mês precisa
saber em qual porta bater:

| Relatório de hoje | Onde mora | Quem vê |
|---|---|---|
| Produtividade da revisão e da embalagem (quantidade, tempo médio, por SKU, por dia) | 904 Relatórios | `relatorios.ver` |
| Painel gerencial (revisadas × embaladas × rejeitadas, motivos, reputação, estoque × alvo) | 904 Relatórios | `relatorios.ver` + `painel.ver` |
| Fechamento do dia e histórico produzi × vendi | 904 Relatórios (desde 08/11/2026) | `@admin` |
| Andamento do dia na TV | 105 Painel da TV | `painel.ver` |
| Relatório do mês das devoluções e o Desempenho por responsável | 252 Devoluções em andamento | `devolucao.*` |
| Relatório de furos da contagem e a acuracidade | 302 / 301 | `contagem.relatorio`, `@admin` |
| Gráfico do estoque (entrou × saiu) | 301 Estoque | `@admin` |
| Indicadores do sob medida (7 indicadores) | sob medida, tela própria | `sobmedida.*` |

**E o "quem fez" já está gravado, mas não aparece em lugar nenhum.** Desde
05/11/2026 (spec `QUEM-FEZ-E-REVISAO`, §10 do `CLAUDE.md`) toda escrita grava o
id de quem a fez, pelo PIN: revisão e embalagem (`usuario_id`), etiqueta
(`impresso_por_id`, `lote_reimpressao`), conferência (`conferido_por_id`),
carro e saída (`no_carro_por_id`, `fechado_por_id`, `quem_levou_id`),
devolução (`revisado_por_id`, `baixado_por_id`, cada evento do caso),
contagem (`contado_por_id`, `aprovado_por_id`), a peça com problema e a
revisão desfeita (`revisao_evento`), e a entrada e saída do login (`sessao`).

**E as três chaves de produtividade existem e estão inertes** (a dívida 18,
§14): `produtividade.propria` (Operação), `produtividade.equipe` (Supervisor,
"sem identificar quem") e `produtividade.nominal` (Admin, sensível) estão no
registro e nos setores nativos, e **nenhuma tela as usa** — a 904 abre com
`relatorios.ver` e mostra tudo sem nome. Esta spec é o lugar de elas pegarem.

## 2. O que se propõe

1. **A 904 vira a central de relatórios, em abas** (o estilo das Devoluções em
   andamento e da 401): *Hoje · Produção · Expedição · Estoque · Devoluções ·
   Por pessoa*. Cada aba carrega quando abre.
2. **A central não tem conta própria** — a mesma regra da central de
   pendências (§5, #12): cada número é o da função da tela dona
   (`fluxo_estoque`, `devcaso_dominio.relatorio`, `inventario_dominio`…). A
   central só desenha. Uma conta copiada diverge no primeiro ajuste.
3. **"Por pessoa"**, com três degraus pelas chaves que já existem:

| Chave | Vê | Onde |
|---|---|---|
| `produtividade.propria` | só o que **ela** fez, pelo login dela | tela nova 905 "Minha produção", nível Operação — a 904 é Supervisor e o operador não a abre |
| `produtividade.equipe` | a equipe somada, **sem nome** (distribuição) | 904, aba Por pessoa |
| `produtividade.nominal` | cada pessoa **com nome** | 904, aba Por pessoa |

4. **O que entra no "o que a pessoa fez"**, por dia e por período, só do que
   está gravado (§1): revisadas (e o tempo), peça com problema, revisão
   cancelada/recusada/desfeita, embaladas (e o tempo), etiquetas impressas e
   reimpressas, caixas conferidas, carros e caminhões fechados, devoluções
   recebidas e baixadas, contagens feitas e quantas bateram, e as horas
   logada (da `sessao`).

## 3. Regras propostas (o que vai parecer bug e não é)

- **Só conta o que tem id.** A linha anterior a 26/10/2026 (revisão e
  embalagem) ou a 05/11/2026 (o resto) não tem id de quem fez, e **não se
  inventa pelo nome** — o período antes disso sai "sem registro", não zero.
- **Quem embalou a caixa de uma venda não existe** (§9-B, "Quem trabalhou nesta
  venda"): a embalagem soma estoque por SKU e não se liga a venda. O relatório
  por pessoa conta embalagens, nunca "vendas embaladas por fulano".
- **Tempo é mediana, com o maior ao lado** (a régua do Desempenho das
  devoluções e dos indicadores do sob medida): uma revisão esquecida aberta não
  esconde as outras.
- **Nenhum valor em reais na aba Por pessoa** — ela vai a quem só tem
  `produtividade.equipe`.
- **O modo teste fica fora** (`teste=1`), como em toda conta do sistema.

## 4. Os relatórios (a lista do dono e a do especialista, 08/11/2026)

Tudo em **quantidade** (peça, caso, caixa) e em **taxa** quando houver um
total para dividir; cada número com **a semana anterior e a média das 4
últimas** ao lado, e a seta de subiu ou desceu. E cada número diz **desde
quando** existe: antes disso é "sem registro", nunca zero (§3).

| # | Relatório | De onde sai | Desde quando |
|---|---|---|---|
| R1 | **Vendas por semana e por mês, em peças**, e o **crescimento** mês a mês e contra o mesmo mês do ano anterior | a planilha do ML (`venda_futura`, pela Data da venda e pelas Unidades, a régua do `planilha_estado.js`: a cancelada e a linha que não é venda ficam fora) | o que estiver importado — o dono vai importar o ano inteiro pela 401 |
| R2 | **Os SKUs que mais vendem** (os 10 primeiros), e as cores e medidas que mais saem | idem | idem |
| R3 | **Coleta × agência** | `lote.modalidade` (`carga.js`) | o PDF |
| R4 | **Devoluções por mês**, a **taxa** (devoluções ÷ vendas), **por motivo**, **por SKU** e **por tipo** (ML devolve · nós coletamos · item faltante) | `devcaso_dominio.relatorio` e a baixa da `devolucao` | casos desde 03/11/2026; a baixa de antes, pelo motivo dela |
| R5 | **Despachado no prazo × atrasado, por dia** | o prazo da etiqueta (`lote`) contra a saída | a saída gravada |
| R6 | **A coleta que não passou** e as caixas que ficaram | `fim_dia` | 04/11/2026 |
| R7 | **Bloqueados e pendências por semana** | `pendencias_dominio` | a central |
| R8 | **Embaladas** por dia e por semana — **o número final da produção** —, com o tempo | `montagem` | sempre |
| R9 | **Produzi × vendi da semana** | `fluxo_estoque` / `fechamento` | o fechamento gravado |
| R10 | **Peça com problema na revisão**, quantas e por quê, em taxa | `rejeicao` | sempre |
| R11 | **Por pessoa**: quantidade e tempo (§2) | as colunas de quem fez | 26/10 (revisão, embalagem) e 05/11/2026 (o resto) |
| R12 | **Falta de estoque**: quantas vendas viraram urgência, e de quais SKUs | a urgência do PDF (R-PRD-01) | o que estiver gravado |
| R13 | **Acerto do inventário** (acuracidade) | `inventario_dominio` | a conferência |

**Fica fora, por decisão do dono:** a venda cancelada (*"são vendas que não
saíram da empresa"*) e qualquer valor em reais.

## 4-B. Fases propostas

| Fase | O quê | Risco |
|---|---|---|
| 1 | **"Resumo da segunda-feira"**: uma tela pronta para passar à equipe — vendas (R1), devoluções (R4), embaladas (R8), despacho no prazo (R5) e produzi × vendi (R9), cada um com a semana anterior | 🟡 |
| 2 | **Crescimento mês a mês** (R1, R2, R3) | 🟡 |
| 3 | **"Minha produção"** (905) e a aba **Por pessoa** na 904 (R11) | 🟡 (permissão sensível) |
| 4 | As **abas de detalhe** na 904 (R4 a R13), juntando o que já existe, **inclusive os indicadores do sob medida** (D6) | 🟡 |

## 5. Alçada (R-ALC-08)

- **Telas novas:** 905 · Minha produção · módulo 9xx (Gestão) · nível Operação ·
  abre com `produtividade.propria`.
- **Ações novas:** nenhuma — as três chaves de produtividade já existem, e
  exportar saiu (D5).
- **Setores novos:** nenhum.
- **Quem recebe:** ~~a 905 nasce só para o Admin Geral~~ — **a 905 nasce para os
  setores de operação**, que já têm `produtividade.propria` (decisão do dono no
  PLANO, 08/11/2026, exceção ao R-ALC-06, linha em `docs/DECISOES.md`). As outras
  duas chaves de produtividade já estão nos setores nativos (Gestão tem a
  `equipe`; a `nominal` é do setor Admin, que não abre a 904 — dúvida para o
  dono no FECHAMENTO).

## 6. As respostas do dono (08/11/2026)

- **D1 — copiar:** o relatório aparece na 904 **e continua** na tela de origem
  (*"não apenas em relatórios"*).
- **D2 — sim:** cada um vê o seu; o Supervisor vê a equipe sem nome; o Admin vê
  com nome.
- **D3 — só quantidade e tempo.** Erro por pessoa não entra.
- **D4 — de onde estiver logado:** a "Minha produção" serve no tablet **e** no
  computador.
- **D5 — sem exportar:** a ideia é uma **tela pronta para passar à equipe** na
  reunião de segunda.
- **D6 — sim, tudo:** *"toda a concentração de relatórios de tudo do PCP deve
  estar num único lugar"* — o sob medida também.
- **D7 — a lista da §4.** O dono pediu vendas, devoluções e o crescimento mês a
  mês, em quantidade; a venda cancelada saiu (*"vendas que não saíram da
  empresa"*). O resto da lista é proposta, para ele aprovar.
- **A produção final é a embalagem** (*"final me refiro a embalagem"*,
  confirmado: *"embalagem sim"*).
