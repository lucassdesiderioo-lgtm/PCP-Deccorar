# Arrumar o lugar: cada tela no módulo do assunto, e todo valor em dinheiro ligado aos Acessos

```
STATUS
Situação: EM CONSTRUÇÃO · aprovada pelo dono em 11/11/2026
Criada em: 11/11/2026
Última atualização: 11/11/2026
Fase atual: 2 em código (11/11/2026), falta subir · a 1 no ar desde 11/11/2026 (PR #334)
Fases: 1 ☑  2 ◐  3 ☐  4 ☐  5 ☐
Risco: 🔴 (cria tela, mexe em permissão e na tela de Acessos; a fase 4 muda regra do sob medida)
Depende de: ORGANIZACAO-DO-SISTEMA (os 18 módulos, o mapa com módulo e bloco, o menu único)
             ACESSO-POR-TELA-E-NIVEL (o mapa de telas, a tela de Acessos pelo mapa)
Conferida contra: o `main` de 11/11/2026 (PR #331), varredura das 45 telas no navegador
Tipo: REGRA + NOVIDADE
Página da varredura: https://claude.ai/artifact/8zuuvTdWuLmSC5rvVmt27t
```

### Fase 2 — a 501 fica só com compra (11/11/2026, em código)

- **Seis telas novas**, o mesmo `index.html` do Admin servido com a aba de
  Compras e o `cmp` dela (o `compras_abas.js` desenha só aquela aba, sem a
  faixa): 1101 Materiais e 1102 Fornecedores (`compras.ver`), 1103 Almoxarifados
  e endereços (`almoxarifado.cadastrar`, `componente.cadastrar`, `compras.ver`),
  1201 Recebimento retido (`recebimento.liberar`, `compras.ver`), 1301 Notas
  fiscais de compra (`nota.lancar`, `custo.ver`, valor `compras.valores`) e 1302
  Certificado digital (Admin Geral). **Cada uma abre com a regra que mostrava a
  aba na 501**, conferido pessoa a pessoa no banco de exemplo.
- **A 501 ficou com quatro abas** (Lista de compras, Pedidos, Compra rápida,
  Compra programada). O link antigo (`/admin/compras#notas`) e a aba lembrada
  neste computador levam à tela nova.
- **O Fiscal foi inaugurado** (a 1301), e a tela de Acessos ganhou as centenas
  1100, 1200 e 1300. A caixinha de cada ação pendura na tela nova
  (`componente.cadastrar` na 1101, `nota.lancar` na 1301…); a chave não mudou.
- **A parte de material da 302 foi para a 504** (decisão do dono "a"): a
  aprovação da contagem de material por almoxarifado (`contagem.aprovar`) e os
  ajustes antigos de material (`contagem.ajustar`), num bloco que só aparece a
  quem tem a chave (`public/aprov_material.js`). A 504 passou a abrir também
  com essas duas chaves; quem não conta não vê o "Começar a contagem". Os
  ajustes antigos de peça ficam na 302.
- **Divergência D9 — o ganho, e nomeado:** a chave que é o trabalho da tela
  nova abre a tela mesmo sem nenhuma chave da 501 — `recebimento.liberar` a
  1201, `nota.lancar` e `custo.ver` ("e as de leitura de hoje", §8) a 1301. A
  rota de cada uma já aceitava a chave: a pessoa passa a ver na tela o que já
  lia e fazia pela rota. No banco de exemplo, um caso (Revisão + custo).
- **③ REVISÃO (11/11/2026), consertado com teste:** a central de Pendências (204)
  levava à 501 (e à 302) as pendências que mudaram de tela — hoje cada linha leva
  à tela nova ou à 504, e os ajustes antigos se dividem em duas linhas (peça, na
  302; material, na 504), cada uma contando o que a tela dela mostra; quem abre a
  501 só pela chave de uma aba que saiu vê para onde ela foi, e não os cards
  velhos; e o teste de segurança do CI tranca as seis telas e a 504.
  O testador de tela achou mais três, também consertados: a 504 pedia os
  almoxarifados e as contagens abertas a quem só aprova (dois 403), não dizia
  "Nada esperando aprovação", e o `#notas` ficava no endereço da 501 para quem
  não abre a 1301. Na rodada 2: o bloco dos ajustes antigos de material diz
  "nenhum" e "não consegui ler", e o aviso da 501 vazia lista só as telas para
  onde foram abas. **Fica para o dono:** o ganho da D9 (a 1201 e a 1301 abrindo
  pela chave do trabalho delas, sem chave da 501).
- **A lista do que está fora do lugar** ficou só com `902/horarios` (fase 3).
- `teste_501_so_compra.js` (93), escrito antes; os inventários do
  `teste_lugar.js`, do `teste_admin_telas.js` e do `teste_valor.js` ganharam as
  telas novas, sem mudar o esperado do que já existia.

### Fase 1 — a regra do valor (11/11/2026, em código)

- **O mapa:** `valor:` em 16 telas (301, 302, 404, 501, 252 e 603, 604, 606–611,
  614–616; a 602 saiu na ③ REVISÃO: não mostra dinheiro). **`valor.js`** (novo) é o dono único de "esta pessoa vê este
  dinheiro?", com a lista de quem lança vê o que lança.
- **As chaves:** `devolucao.valores` e `compras.valores` (Supervisor, sensíveis) e
  a `preco.ver` do sob medida (Operação, sensível); a `custo.ver` do sob medida
  mudou só o rótulo. Backfill de uma vez só (`seed_valor_1`).
- **A tela de Acessos** mostra "R$ Ver valores (R$) desta tela" em cada tela com
  dinheiro, e a mesma chave em duas telas anda junta; a barra das duas operações
  diz uma vez quando os valores não aparecem.
- **A poda:** o `custo_direto` do `/api/skus`; a 252 pela `devolucao.valores`
  (lançar, editar, coleta e valor recusam valor digitado sem ela); a 501 pela
  `compras.valores` (lista, comparar, materiais, fornecedores, ofertas, histórico
  de preço, pedidos); a 404 abre a ficha sem o custo; no sob medida, `podarVenda`
  e `podarCusto`, e os quatro vazamentos de lá.
- **Divergência D6 — a 252 e o R-VAL-04.** O §3 diz "quem lança dinheiro vê o
  que lança", e na 252 o dono respondeu que os valores podem ser tirados de quem
  lança. Vale a resposta do dono: na 252 o dinheiro é parte do caso, e quem lança
  sem a caixinha lança o caso sem valor (e não marca o "Enviado", que pede o
  frete). O R-VAL-04 vale onde o dinheiro é o próprio trabalho (nota, pedido,
  parcela, preço, nota do rolo).
- **Divergência D7 — a fase 1 trocou mais do que o §3 listou:** o histórico de
  preço das coleções, dos componentes e das tabelas do sob medida passou a pedir
  `preco.ver` (era `custo.ver`), e o painel 607 passou a aceitar quem lança nota
  do rolo, como as outras telas de custo.
- **Achado no caminho, consertado junto por ser defeito da fase 3 da
  `ORGANIZACAO-DO-SISTEMA` (também minha):** o `admin_telas.js` lia o nome da
  pessoa direto da sessão, e o `teste_quem.js` reprovava.
- **③ REVISÃO (três revisores, dois verificadores e o testador de tela):** 14
  achados confirmados, consertados com teste antes — o backfill dando a chave
  a quem a tinha revogada (agora pessoa a pessoa); `pedido.pagar` e
  `devolucao.dinheiro` aparecendo como "Ver valores" (a chave de valor é uma
  só por tela); a 602 Corte declarada sem ter dinheiro; o total do pedido no
  marco "enviado", os avisos do comparar e o orçamento e o comprovante do
  pedido levando R$; a resposta da revisão do frete gravando valor sem a
  caixinha; a 404 ainda vazia (a leitura das fórmulas passou às chaves da
  tela); a 611 quebrando sem o preço; a frase falsa da alçada; o botão da
  folha e o do WhatsApp aparecendo sem poder; a chave repetida ao salvar o
  setor; e o "·" da 610. **Divergência D8 — a R-VAL-04 no sob medida:** a §3
  diz "lançar nota, boleto, parcela ou preço já traz ver aquele valor", e por
  ela quem lança preço no Catálogo, boleto ou limite de crédito vê o preço de
  venda; quem só monta pedido não (o preço é calculado). Um verificador leu
  isso como mudança de regra; vale o texto aprovado do §3, e fica no FECHAMENTO.
  **Rodada 2 (só no que foi consertado):** o botão da folha da 611 olhava um
  campo que o detalhe nunca traz e sumia para todo mundo (hoje olha o `preco`,
  que é o que a poda tira); o detalhe do pedido de compra listava o orçamento
  a quem não pode abri-lo (a conta dos anexos mora num lugar só, o
  `anexo_compra.js`); a exceção que o backfill cria ganhou motivo e `criado_por` no
  banco (a tela de Acessos ainda não mostra motivo de exceção) e o boot diz
  quantas; e o botão de WhatsApp deixou de aparecer a quem só lança preço.
  **Fica para o dono (P5):** sem a caixinha, o "Enviado" do item faltante não
  se marca nem para corrigir só o rastreio.
- `teste_valor.js` (108) e `tecido/teste/valor.test.js` (12), escritos antes do
  conserto. Mudaram as pessoas de mentira de cinco testes (as de depois do
  backfill), sem mudar o esperado de nenhum: `teste_devolucao_casos.js` (1104),
  `teste_devolucao_casos_tela.js` (247), `teste_revisao_compras.js` (46), `teste_pedido_compra.js` (64) e
  `teste_acessos_f2.js` (89, com o caso novo da `preco.ver`); dois testes do
  sob medida trocaram a poda única pela de venda.

## Onde mora

| Tela nova | Nº | Módulo | Bloco | Liga-se a |
|---|---|---|---|---|
| Materiais | 1101 | Cadastros | Comum | 501 (lista de compras e pedidos leem o material), 404 (a ficha aponta o material), 502–504 |
| Fornecedores | 1102 | Cadastros | Comum | 501 (pedido), 502 (recebimento), 604 (rolo do sob medida) |
| Transportadoras | 1104 | Cadastros | Comum | 252 (coleta de devolução e envio de item faltante) |
| Almoxarifados e endereços | 1103 | Cadastros | Comum | 503 (guardar e mover), 504 (contar), 603/604 (sobra e rolo do sob medida) |
| Recebimento retido | 1201 | Almoxarifado | Comum | 502 (de onde o retido vem) |
| Notas fiscais de compra | 1301 | Fiscal | Comum | 501 (pedido), 502 (recebido), custo médio do material |
| Certificado digital | 1302 | Fiscal | Comum | 1301 (as notas baixadas da Receita) |
| Parâmetros | 906 | Administração | Comum | 202 (segundo bipe), 201/206 (horário de despacho de reserva), 609/611 (prazo e feriados do sob medida), 602 (parâmetros do corte) |

**Inaugura o módulo Fiscal** (faixa 1300, hoje reservado).

Abas novas: na **904 Relatórios** entram as abas que hoje moram na 252, na 607, na
615, na 104 e na 301 (§5, fase 5). São do mesmo assunto da tela: relatório.

---

## 1. O problema

A varredura de 11/11/2026 abriu as 45 telas das duas operações, aba por aba. **29
estão inteiras no lugar certo; 13 têm pedaço de outro assunto dentro; três coisas
são feitas em dois lugares; uma configuração não tem tela.** A 501 Compras é o caso
mais pesado: das dez abas, seis não são compra (R-ORG-04).

E a varredura achou um segundo problema, que o dono transformou em regra: **o
dinheiro na tela não tem uma regra só.** Cada tela que mostra valor decide sozinha
quem vê:

| Tela | O valor | Quem vê hoje |
|---|---|---|
| 301 Estoque | valor do estoque | `custo.ver` |
| 404 Ficha técnica | custo do SKU | `custo.ver` |
| 501 Compras | preço, desembolso, pedido | quem tem chave de compra; quem só recebe não vê (R-CMP-28) |
| 501 Fornecedores | Pix, banco, conta | `pedido.pagar` (R-CMP-27) |
| 501 Notas | total pago e líquido | `nota.lancar`, `custo.ver` |
| 252 Devoluções | valor do ML, custos, etiqueta, frete | **quem lança ou acompanha** — sem chave de valor (03/11/2026) |
| 252 Relatório do mês | totais em reais | `devolucao.dinheiro` |
| 604, 607 (sob medida) | dinheiro parado em rolo, coluna Valor | `sobmedida.custo.ver` |
| 608, 609, 611 (sob medida) | preço por m², preço da persiana, pedido | `sobmedida.custo.ver` — **a mesma chave do custo** |
| 610, 616 (sob medida) | limite de crédito, boletos | `credito.editar`, `boleto.ler` |
| 614 Quadro (sob medida) | valor do cartão | a conferir na construção |

Duas coisas erradas nesse quadro: a 252 mostra dinheiro a quem abre a tela, sem
caixinha nenhuma; e no sob medida o preço de venda e o custo são a mesma chave — o
vendedor que precisa do preço da persiana vê também o valor do estoque.

## 2. O que esta spec decide

1. **A regra do valor** (R-VAL, §3): toda tela que mostra dinheiro tem, nos Acessos,
   a caixinha "Ver valores" daquela tela. Sem ela, a tela abre sem o dinheiro.
2. **O lugar de cada pedaço** (§4): seis telas novas, uma aba que sai, os relatórios
   na 904.
3. **O fornecedor é cadastrado num lugar só** (D1, §6): a 606 do sob medida deixa
   de cadastrar fornecedor.

## 3. A regra do valor — R-VAL (decisão do dono, 11/11/2026)

> O dono: *"sempre que uma tela tiver valor, ela tem que estar linkada ao acessos.
> Então, a gente assinala ou não assinala essa opção para que a pessoa tem ou não
> tem acesso a ver a tela com dinheiro, com valores."*

| # | Regra |
|---|---|
| R-VAL-01 | **Toda tela que mostra valor em dinheiro declara no mapa** (`telas.js` e `tecido/nucleo/telas.js`) a chave que libera o valor: `valor: 'chave'`. Dinheiro é custo, preço, valor, desembolso, saldo em reais, limite, frete, imposto, dado de pagamento. Quantidade não é dinheiro. |
| R-VAL-02 | **Abrir a tela e ver o valor são duas caixinhas.** Na tela de Acessos, debaixo de cada tela com valor, aparece **"Ver valores (R$) desta tela"**, que se assinala ou não, por setor ou por pessoa. |
| R-VAL-03 | **Sem a caixinha, a tela abre sem o dinheiro, e quem tira é o servidor.** Os campos de dinheiro não viajam (a poda por prefixo que já existe: `valor*`, `preco*`, `custo*`, `desembolso*`…). A tela escreve **"—"**, nunca zero, e uma vez por tela a frase *"os valores não aparecem para o seu acesso"*. |
| R-VAL-04 | **Quem lança dinheiro vê o valor do que lança.** Lançar nota, boleto, parcela ou preço já traz ver aquele valor — lançar às cegas seria a armadilha #6. A exceção é nomeada, ação a ação, e o teste a confere. |
| R-VAL-05 | **Uma chave de valor pode servir a mais de uma tela do mesmo assunto** (`custo.ver` na 301 e na 404), e a tela de Acessos mostra a caixinha em cada tela onde ela vale. O que não pode é tela com dinheiro sem chave nenhuma. |
| R-VAL-06 | **Toda chave de valor é `sensivel`** e nasce **só para o Admin Geral** (R-ALC-06), **com uma exceção**: quem vê o valor hoje continua vendo (backfill de uma vez só, §8). Ninguém perde nada no deploy. |
| R-VAL-07 | **O teste trava:** rota de tela que manda campo de dinheiro sem a chave declarada reprova; tela com `valor:` cuja rota manda o dinheiro a quem não tem a chave reprova. Tela nova com valor nasce já declarando. |

**O que a regra muda no que já existe:**

- **252 Devoluções** — hoje os valores vão a quem lança ou acompanha. Passa a existir
  a chave **`devolucao.valores` ("Ver valores das devoluções")**, e o backfill a dá
  a quem tem `devolucao.lancar` ou `devolucao.acompanhar` hoje. Os totais do
  relatório continuam com `devolucao.dinheiro`. *(Muda a decisão de 03/11/2026: o
  dono passa a poder tirar os valores de quem lança.)*
- **Sob medida** — `sobmedida.custo.ver` se divide em duas: **"Ver preço de venda"**
  (608 preço por m², 609, 611, o valor do cartão da 614) e **"Ver custo e valor do
  estoque"** (604, 607). O backfill dá **as duas** a quem tem a de hoje — o vendedor
  continua vendo tudo, e o dono decide depois se tira dele o custo.
- **904 Relatórios** — *"em quantidade, nunca em valor"* (08/11/2026) passa a ser
  *"o Resumo da semana é só em quantidade; nas abas, o valor aparece só para quem
  tem a chave de valor daquele assunto"* (D5 da varredura).

## 4. O lugar de cada pedaço

A tela por dentro não muda, a rota não muda, a chave que abre não muda: **cada tela
nova abre com as mesmas chaves da aba de onde saiu**, então ninguém ganha nem perde
acesso. O endereço antigo (`/admin/compras#notas`, por exemplo) leva à tela nova.

| Sai de | O pedaço | Vai para |
|---|---|---|
| 501 Compras | aba Materiais (com mínimo e ideal) | **1101 Materiais** |
| 501 Compras · 606 | aba Fornecedores · o fornecedor do sob medida | **1102 Fornecedores** |
| 252 Devoluções | aba Transportadoras | **1104 Transportadoras** |
| 501 Compras · 606 | aba Almoxarifados e a criação de endereços · aba Endereços | **1103 Almoxarifados e endereços** — uma porta só para as duas operações |
| 501 Compras | aba Recebimento retido | **1201 Recebimento retido** |
| 302 Contagem | os ajustes antigos de material esperando aprovação e o cartão "Material" | entram na **504** (sem tela nova) |
| 501 Compras | aba Notas, com "Regime e tabela de crédito" | **1301 Notas fiscais de compra** |
| 501 Compras | aba Certificado | **1302 Certificado digital** |
| 902 · 606 · 610 | Segundo bipe na Conferência · Parâmetros do sob medida · Calendário e feriados | **906 Parâmetros** |
| (nenhuma tela) | os horários de corte e despacho por dia da semana (`/api/config/horarios`, `horarios.editar`) | **906 Parâmetros** — a regra existe e não tinha tela (dívida 18) |
| 252 · 607 · 615 · 104 · 301 | relatório do mês e desempenho · Painel do tecido · Indicadores · peças com problema · gráfico entrou × saiu | abas da **904**; a 607, a 615 e a 104 saem do menu |
| 604 Rolos | aba "Entrada de rolo" (só um aviso mandando à 502) | sai |
| 606 Cadastros | aba "Quem entra" (só leitura) | sai — a grade telas × setores da 901 já mostra |

**Depois:** a 501 fica com Lista de compras, Pedidos (com a Alçada), Compra rápida e
Compra programada; a 902 com as quatro listas e o kit; a 606 com Tecido e Motivos e
condições; a 610 com Carteiras, Revendas e Tabelas A/B/C; a 252 com Em andamento,
Encerrados e Motivos.

**Fica como está, de propósito:** a Alçada de compra na 501 (D3: é regra de compra);
o preço dentro do Catálogo 608 (D2: está na mesma linha da coleção e do componente;
vai ao Comercial com a tabela de preço por canal); a aba Motivos da 252 (edita a
mesma lista da 902, decisão de 03/11); a Mesa desenhada na 204; a configuração da
401 (só faz sentido ao lado da conta que muda); a 601 Início (porta do sob medida);
a 905 e a 105 (não são relatório de reunião).

## 5. Os relatórios na 904 (D4 e D5)

| Aba nova ou que cresce | Vem de | Chave que abre | Chave do valor |
|---|---|---|---|
| Devoluções (cresce) | 252 Relatório do mês e Desempenho | as de hoje da 252 | `devolucao.dinheiro` (totais) |
| Sob medida — tecido (nova) | 607 Painel, as 7 abas | `sobmedida.painel.ler` | "Ver custo e valor do estoque" |
| Sob medida — fábrica (já existe) | 615 Indicadores, inteira | `sobmedida.painel.ler` | — (não tem dinheiro) |
| Produção (cresce) | 104 Problemas | a de hoje da 104 | — |
| Estoque (cresce) | 301 gráfico entrou × saiu | as de hoje da 301 | — |

A 904 **não ganha conta própria** (§21, a central não tem SQL): cada aba chama a rota
de onde veio.

## 6. O fornecedor num lugar só (D1)

A 606 ainda cadastra fornecedor (`POST /api/fornecedores` do sob medida), e a regra de
07/11/2026 (R-CMP-11) diz que o fornecedor é um só, o do PCP. **Decisão do dono
(11/11/2026): só a 1102 cadastra.** A rota de criar do sob medida passa a recusar
(400, apontando a 1102); a lista de lá continua existindo, como espelho, para o rolo
e o custo lerem. Renomear e juntar duplicados continua no PCP.

## 7. Fica de fora

- Juntar fornecedor e transportadora num cadastro só (decisão do dono: duas telas).
- Mudar o preço do Catálogo de lugar (D2) e a Alçada de compra (D3).
- O "quem vende" no material e o tecido completo da medida padrão (`CADASTRO-DE-MATERIAL`).
- As duas fichas técnicas no cadastro único (`FICHAS-NO-CADASTRO-UNICO`).
- Mudar número, endereço ou chave de tela que já existe.
- A tela de Acessos agrupando por módulo do assunto (continua pela centena).

## 8. Alçada

**Telas novas** (abrem com as chaves de hoje da aba de origem — exceção ao R-ALC-06,
para ninguém perder acesso):

| Nº | Tela | Módulo | Nível | Abre com |
|---|---|---|---|---|
| 1101 | Materiais | Cadastros | Admin | as chaves da aba Materiais da 501 |
| 1102 | Fornecedores | Cadastros | Admin | as da aba Fornecedores da 501 |
| 1104 | Transportadoras | Cadastros | Supervisor | as da aba Transportadoras da 252 |
| 1103 | Almoxarifados e endereços | Cadastros | Admin | as da aba Almoxarifados da 501 e as da aba Endereços da 606 |
| 1201 | Recebimento retido | Almoxarifado | Admin | `recebimento.liberar` |
| 1301 | Notas fiscais de compra | Fiscal | Admin | `nota.lancar` (e as de leitura de hoje) |
| 1302 | Certificado digital | Fiscal | Admin Geral | só o Admin Geral, como hoje |
| 906 | Parâmetros | Administração | Admin | cada parte com a chave de hoje (`horarios.editar`, a do segundo bipe, `sobmedida.parametro.editar`, a dos feriados) |

**Ações novas** (todas sensíveis; nascem só para o Admin Geral, com o backfill do §3):

| Chave | Rótulo | Nível | Tela | Backfill de uma vez só |
|---|---|---|---|---|
| `devolucao.valores` | Ver valores das devoluções | Supervisor | 252 | quem tem `devolucao.lancar` ou `devolucao.acompanhar` |
| `sobmedida.preco.ver` | Ver preço de venda | Operação | 608, 609, 611, 614 — **na construção, também 610, 615 e 616** (as três mostram preço de venda) | quem tem `sobmedida.custo.ver` |
| `sobmedida.custo.ver` (rótulo muda) | Ver custo e valor do estoque | Operação (o de hoje) | 604, 607, 904 — **na construção, 603, 604, 606 e 607**; a 904 fica para a fase 5 | nenhum — é a chave de hoje, só o rótulo muda (a chave **não** muda, #13) |
| `compras.valores` (é a "uma por tela com valor sem chave" da linha de baixo, para a 501) | Ver valores das compras | Supervisor | 501 | quem tem `compras.ver` |
| uma por tela com valor sem chave | a definir no inventário da fase 1 | | | quem vê hoje |

**Setores novos:** nenhum.

## 9. Fases

### Fase 1 — A regra do valor 🔴
- O inventário das telas com dinheiro, rota a rota (o §1 é o ponto de partida; a
  614 e as telas novas do §4 entram aqui).
- `valor:` no mapa; a tela de Acessos mostra "Ver valores (R$) desta tela" debaixo
  de cada tela com valor; as chaves novas e o backfill de uma vez só.
- A poda no servidor onde ela ainda não existe (a 252 para quem não tem
  `devolucao.valores`; o preço e o custo separados no sob medida).
- `teste_valor.js` (novo, escrito antes): tela com dinheiro sem `valor:`, rota que
  manda dinheiro sem a chave, a tela escrevendo zero em vez de "—", o backfill
  rodando duas vezes, e alguém que via o valor deixando de ver.

### Fase 2 — A 501 fica só com compra 🔴
1101, 1102, 1103 (só
a parte do PCP), 1201, 1301, 1302; a parte de material da 302 na 504. Inaugura o
Fiscal. A lista `FORA_DO_LUGAR` perde os seis itens da 501 e o da 302.

### Fase 3 — Parâmetros 🟡
906, com o segundo bipe, os horários de corte e despacho (que ganham tela), e os
parâmetros e feriados do sob medida. A lista perde o `902/horarios`.

### Fase 4 — O sob medida e as transportadoras 🔴
O fornecedor da 606 para de ser criado lá (D1, regra); a aba Endereços da 606 vai à
1103; a aba Transportadoras da 252 vai à 1104; saem a aba Entrada de rolo (604) e
"Quem entra" (606).

### Fase 5 — Os relatórios na 904 🟡
As abas do §5, com o valor pela chave do §3. A 607, a 615 e a 104 saem do menu (o
endereço antigo leva à aba da 904).

## 10. Testes

- `teste_valor.js` (novo) — §9, fase 1.
- `teste_lugar.js` — a lista do que está fora do lugar encolhe a cada fase e zera
  na 4; as telas novas entram no inventário com o módulo e o bloco do "Onde mora".
- `teste_mapa.js` — **sem mudar o esperado**: quem abria a aba abre a tela nova,
  pessoa a pessoa (como a 203 → 103).
- `teste_menu_unico.js`, `teste_acesso.js`, `teste_cobertura.js`, `teste_quem.js`.
- Na fase 4: `teste_porta_sobmedida.js` e `cd tecido && npm test`, com o caso do
  fornecedor recusado no sob medida.
- O teste de segurança da §10 do `CLAUDE.md` com as telas novas (302 sem login).
- **Abrir as telas** com quatro perfis: Admin Geral; Admin sem chave de valor;
  quem só recebe material; vendedor do sob medida — em 1440 px.

## 11. Respostas do dono (11/11/2026)

1. **Sim:** a regra permite tirar os valores das devoluções de quem lança ou acompanha (backfill: ninguém perde no deploy).
2. **Sim:** o sob medida separa "ver preço de venda" de "ver custo e valor do estoque" (backfill: quem tem hoje recebe as duas).
3. **Duas telas:** 1102 Fornecedores e 1104 Transportadoras.
4. **Os números estão bons.**

### As perguntas, como foram feitas

1. **A 252:** tudo bem a regra nova permitir tirar os valores de quem lança ou
   acompanha devolução (§3)? No deploy ninguém perde nada.
2. **O sob medida:** dividir "ver preço de venda" de "ver custo e valor do estoque"
   (§3)? No deploy o vendedor continua vendo os dois.
3. **A 1102:** fornecedores e transportadoras numa tela, com uma aba para cada —
   ou duas telas (1102 Fornecedores, 1104 Transportadoras)?
4. **Os números** propostos (1101–1103, 1201, 1301–1302, 906) estão bons?
