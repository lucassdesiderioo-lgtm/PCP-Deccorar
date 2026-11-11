# Arrumar o lugar: cada tela no módulo do assunto, e todo valor em dinheiro ligado aos Acessos

```
STATUS
Situação: RASCUNHO · espera a aprovação do dono
Criada em: 11/11/2026
Última atualização: 11/11/2026
Fase atual: nenhuma construída
Fases: 1 ☐  2 ☐  3 ☐  4 ☐  5 ☐
Risco: 🔴 (cria tela, mexe em permissão e na tela de Acessos; a fase 4 muda regra do sob medida)
Depende de: ORGANIZACAO-DO-SISTEMA (os 18 módulos, o mapa com módulo e bloco, o menu único)
             ACESSO-POR-TELA-E-NIVEL (o mapa de telas, a tela de Acessos pelo mapa)
Conferida contra: o `main` de 11/11/2026 (PR #331), varredura das 45 telas no navegador
Tipo: REGRA + NOVIDADE
Página da varredura: https://claude.ai/artifact/8zuuvTdWuLmSC5rvVmt27t
```

## Onde mora

| Tela nova | Nº | Módulo | Bloco | Liga-se a |
|---|---|---|---|---|
| Materiais | 1101 | Cadastros | Comum | 501 (lista de compras e pedidos leem o material), 404 (a ficha aponta o material), 502–504 |
| Parceiros (fornecedores e transportadoras) | 1102 | Cadastros | Comum | 501 (pedido), 502 (recebimento), 252 (coleta de devolução), 604 (rolo do sob medida) |
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
| 501 Compras · 252 · 606 | aba Fornecedores · aba Transportadoras · o fornecedor do sob medida | **1102 Parceiros**, com as abas Fornecedores e Transportadoras |
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

- Juntar fornecedor e transportadora **numa tabela só**: a 1102 junta as duas telas,
  o banco continua com as duas tabelas.
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
| 1102 | Parceiros | Cadastros | Admin | as da aba Fornecedores da 501 **ou** as da aba Transportadoras da 252 (cada aba de dentro, com a sua) |
| 1103 | Almoxarifados e endereços | Cadastros | Admin | as da aba Almoxarifados da 501 e as da aba Endereços da 606 |
| 1201 | Recebimento retido | Almoxarifado | Admin | `recebimento.liberar` |
| 1301 | Notas fiscais de compra | Fiscal | Admin | `nota.lancar` (e as de leitura de hoje) |
| 1302 | Certificado digital | Fiscal | Admin Geral | só o Admin Geral, como hoje |
| 906 | Parâmetros | Administração | Admin | cada parte com a chave de hoje (`horarios.editar`, a do segundo bipe, `sobmedida.parametro.editar`, a dos feriados) |

**Ações novas** (todas sensíveis; nascem só para o Admin Geral, com o backfill do §3):

| Chave | Rótulo | Nível | Tela | Backfill de uma vez só |
|---|---|---|---|---|
| `devolucao.valores` | Ver valores das devoluções | Supervisor | 252 | quem tem `devolucao.lancar` ou `devolucao.acompanhar` |
| `sobmedida.preco.ver` | Ver preço de venda | Operação | 608, 609, 611, 614 | quem tem `sobmedida.custo.ver` |
| `sobmedida.custo.ver` (rótulo muda) | Ver custo e valor do estoque | Operação (o de hoje) | 604, 607, 904 | nenhum — é a chave de hoje, só o rótulo muda (a chave **não** muda, #13) |
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
1101, 1102 (só a aba Fornecedores; a de Transportadoras entra na fase 4), 1103 (só
a parte do PCP), 1201, 1301, 1302; a parte de material da 302 na 504. Inaugura o
Fiscal. A lista `FORA_DO_LUGAR` perde os seis itens da 501 e o da 302.

### Fase 3 — Parâmetros 🟡
906, com o segundo bipe, os horários de corte e despacho (que ganham tela), e os
parâmetros e feriados do sob medida. A lista perde o `902/horarios`.

### Fase 4 — O sob medida e as transportadoras 🔴
O fornecedor da 606 para de ser criado lá (D1, regra); a aba Endereços da 606 vai à
1103; a aba Transportadoras da 252 vai à 1102; saem a aba Entrada de rolo (604) e
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

## 11. Perguntas ao dono (antes do "pode seguir")

1. **A 252:** tudo bem a regra nova permitir tirar os valores de quem lança ou
   acompanha devolução (§3)? No deploy ninguém perde nada.
2. **O sob medida:** dividir "ver preço de venda" de "ver custo e valor do estoque"
   (§3)? No deploy o vendedor continua vendo os dois.
3. **A 1102:** fornecedores e transportadoras numa tela, com uma aba para cada —
   ou duas telas (1102 Fornecedores, 1104 Transportadoras)?
4. **Os números** propostos (1101–1103, 1201, 1301–1302, 906) estão bons?
