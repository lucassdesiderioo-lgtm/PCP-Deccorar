# RELATORIOS-UNIFICADOS — todo relatório num lugar só, e o que cada pessoa fez pelo login dela

> **STATUS · 08/11/2026 — RASCUNHO, AGUARDA O DONO.** Nada construído. Pedido do
> dono em 08/11/2026: *"tudo isso que temos de relatório de alguma coisa no
> sistema devemos deixar concentrado em apenas um lugar, que seria a tela de
> relatórios, e já deixando registrado o que cada pessoa executou, pensando em
> extrair tudo isso pelo login da própria pessoa"*. As perguntas da §6 precisam
> de resposta antes do PLANO da fase 1. `NOVIDADE` 🟡 (só leitura; nenhuma conta
> nova de estoque, nenhum dado novo gravado).

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
| `produtividade.propria` | só o que **ela** fez, pelo login dela | tela nova "Minha produção" (proposta 905), nível Operação — a 904 é Supervisor e o operador não a abre |
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

## 4. Fases propostas

| Fase | O quê | Risco |
|---|---|---|
| 1 | 904 em abas e os relatórios que já existem trazidos para ela (o original continua onde está até o dono dizer que pode sair) | 🟡 |
| 2 | "Minha produção" (905): o que a pessoa logada fez, hoje e no período, com `produtividade.propria` | 🟡 |
| 3 | Aba Por pessoa na 904: equipe sem nome (`produtividade.equipe`) e com nome (`produtividade.nominal`) | 🟡 (permissão sensível) |
| 4 | Exportar o período em planilha (CSV), se o dono quiser (§6, D5) | 🟢 |

## 5. Alçada (R-ALC-08)

- **Telas novas:** 905 · Minha produção · módulo 9xx (Gestão) · nível Operação ·
  abre com `produtividade.propria` — *proposta; o número só se firma no PLANO*.
- **Ações novas:** nenhuma — as três chaves de produtividade já existem.
  Exportar (fase 4), se aprovado: `relatorios.exportar` · Supervisor · 904 ·
  sensível (sai dado de pessoa do sistema).
- **Setores novos:** nenhum.
- **Quem recebe:** a 905 e a chave de exportar nascem só para o Admin Geral, até
  o dono marcar na tela de Acessos (R-TEL-03). As três chaves de produtividade
  **já estão** nos setores nativos (Operação tem a `propria`, Gestão tem a
  `equipe`): ligar a tela a elas passa a valer para quem já as tem — o dono
  confere a grade antes do deploy.

## 6. Perguntas ao dono

- **D1 — Concentrar é mover ou copiar?** (a) o relatório sai da tela de origem
  e só existe na 904; (b) fica nos dois lugares, com o mesmo número. *Sugestão:
  (b) na fase 1, e o dono decide depois o que sai — o Desempenho das devoluções,
  por exemplo, é usado por quem acompanha os casos.*
- **D2 — Quem vê o quê no "por pessoa"?** A proposta é a da §2 (cada um vê o
  seu; Supervisor vê a equipe sem nome; Admin vê com nome). Vale, ou o
  Supervisor também vê com nome a equipe dele?
- **D3 — O que medir de cada pessoa?** Quantidade, tempo, ou também os erros
  (peça com problema que voltou, revisão desfeita, bipe rápido recusado,
  contagem que não bateu)? Erro por nome é sensível: quem lê muda o jeito de
  trabalhar.
- **D4 — O operador vê a própria produção no tablet da bancada**, ou só no
  computador? (Tela de tablet é outra largura e outro cuidado.)
- **D5 — Exportar para planilha** (fase 4): precisa?
- **D6 — O sob medida entra?** Ele tem os indicadores dele, noutro banco. A
  proposta é a 904 só **apontar** para lá na fase 1, sem juntar as contas.
- **D7 — Algum relatório que hoje não existe e faz falta** (ex.: prazo de
  despacho cumprido por dia, caixas que a coleta não levou, vendas canceladas
  por mês)?
