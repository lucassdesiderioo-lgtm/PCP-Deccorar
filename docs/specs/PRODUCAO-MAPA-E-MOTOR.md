> **STATUS · 12/11/2026 — APROVADA pelo dono (v6)** · **fase 1 construída, falta subir** (o roteiro na ficha: `etapas.js`, `ficha_formula.etapa`, a 404; `teste_roteiro.js`, 25; ③ REVISÃO: modelo sem ficha e sob medida ficam sem roteiro, decisão de construção; **REGRA do dono em 12/11/2026: toda linha da ficha tem etapa de preparo — sem "sai direto na embalagem" —, e o kit passa só por montagem e embalagem**, linha em `docs/DECISOES.md`) · próxima: fase 2
> **RASCUNHO v7 · 25/11/2026 — espera o dono aprovar o texto** (§14): a etiqueta da persiana em série por SKU, as etiquetas de tecido e de tubo impressas pelo planejamento (no lugar do maço em branco), a tela 109 Etiquetas da produção, a montagem e o corte com 1 ou N peças, a revisão e a embalagem pela etiqueta da persiana, e os tempos parados de cada persiana. **Onde o §14 e o resto desta spec divergirem, vale o §14.**
> Reescrita sobre o processo que o dono descreveu em 11/11/2026 e as respostas de
> 12/11/2026 (§10). A versão de 17/08/2026 está em
> `docs/arquivo/PRODUCAO-MAPA-E-MOTOR-v1.md` (histórico, não é regra). Absorve a
> `PRODUCAO-MONTAGEM.md` (a montagem é a fase 3 daqui).
>
> ⚠️ **A BAIXA DO MATERIAL CONTINUA NA EMBALAGEM** (a regra de 11/11/2026, §24 do
> CLAUDE.md, não muda). A v3 propunha baixar tecido, tubo e base no corte; o dono
> voltou atrás no mesmo dia: *"a regra deveria continuar em dar baixa final no
> estoque quando de fato for embalado"*. O que esta spec acrescenta é **ver** o que
> está cortado: a pré-fabricação.

# Produção da medida padrão — o mapa e o motor de etapas

> O dono, 11/11/2026: *"o medida padrão é uma produção em série, onde deixamos
> muitas coisas já meio que preparadas apenas para a montagem."* E: *"isso está
> totalmente ligado à ficha técnica, onde cada ficha técnica segue um processo
> produtivo."*

---

## 1. O processo

```
  MATERIAL (saldo de sempre)          PRÉ-FABRICAÇÃO (etiqueta sequencial)     A PERSIANA
  ─────────────────────────────────   ─────────────────────────────────────    ─────────────────────
  rolo de tecido ──corte de tecido──▶ tecido cortado   (TC-000001…)  ─┐
  barras de tubo e base ──corte─────▶ tubo cortado     (TB-000001…)  ─┴──▶ MONTAGEM (bipa as 2)
                                      (a base vai junto, sem etiqueta)         ▼
                                                                          REVISÃO   (101)
  corrente, comando ──kit de comando▶ kit de comando   (KC-000001…)  ─┐       ▼
  parafuso, bucha ──kit de instalação▶ kit de instalação (KI-000001…) ─┴──▶ EMBALAGEM (102)
                                                                              ▼
                                                     o material todo baixa AQUI, como hoje
                                                                          ESTOQUE (+1)
```

**O que o sistema já mede:** a revisão e a embalagem, com quem fez e o tempo.
**O que ele não mede:** o corte, os kits e a montagem — nem o que está cortado
esperando, nem quem montou a peça que a revisão rejeitou.

**O que já existe e esta spec aproveita:** o que cortar (a aba Corte e separação da
401, `corte_dominio.js`); o que cada persiana usa e a medida de corte (a ficha da
404); a etiqueta Zebra (`kit_pdf.js`, `public/barras.js`); a baixa pela ficha na
embalagem (`baixa_material_dominio.js`).

---

## 2. A ideia: etapas em lote, cada peça com a sua etiqueta sequencial

O dono: *"uma etiqueta sequencial de corte de tecido. Quem estiver cortando tecido
vai selecionar o SKU com a cor que ele está cortando e vai colocar etiqueta número 1
até a número 10."* E para o tubo: *"ele assinala no sistema dizendo que cortou 10
tubos de 177, 5 tubos de 157. E base é a mesma coisa. Só que para a base não precisa
da etiqueta, porque quem corta tubo tem que cortar base também."*

| Etapa | Quem faz diz | Sai | Etiqueta |
|---|---|---|---|
| 1 Corte de tecido | o SKU (a cor e a medida saem dele) e quantas cortou | N tecidos cortados | **uma por peça**, sequencial (TC) |
| 2 Corte de tubo e base | a medida e quantas: *"10 de 177, 5 de 157"* | N tubos + N bases | **uma por tubo**, sequencial (TB); a base vai junto, sem etiqueta |
| 3 Kit de comando (o comando com a corrente montada) | a medida da corrente e quantos: *"100 kits de 1,60"* | N kits | **uma por kit**, sequencial (KC) |
| 4 Kit de instalação (único, um por persiana) | quantos | N kits | **uma por kit**, sequencial (KI) |
| 5 Montagem | bipa o tecido e o tubo de cada persiana | a persiana | — (vai para a revisão) |

**As etiquetas são impressas ANTES, em maço** (o dono: *"deixar uma pancada de
etiqueta impressa na mesa do tecido, na bancada da serralheria, e quando tiver
acabando a gente vai imprimindo mais"*). Cada maço é uma faixa sequencial de um
tipo (TC 000001 a 000500, por exemplo), com o número e o código de barras, **sem o
item**: o item se liga à etiqueta quando ela é usada. Etiqueta impressa e não usada
**não é** pré-fabricação.

**Cada pessoa abre e fecha o lote** (o dono: *"ela coloca que iniciou e assinala as
quantidades e os SKUs que ela está cortando, e quando terminar diz que terminou —
assim fecha"*). **Um lote é de peças iguais** (o dono: *"só pode cortar em lote se
as peças forem iguais"*): um SKU de tecido, ou uma medida de tubo.

```
 A TELA DIZ:  "Próxima etiqueta disponível: TC 000041"   ← a pessoa confere com o maço
 INICIAR ─▶ escolhe o item e a quantidade ─▶ cola as etiquetas ─▶ TERMINEI
            "BK160140BEGE · 10"               TC 000041 … 000050 (o sistema liga sozinho)
```

- **A tela mostra a próxima etiqueta disponível** de cada tipo, e o lote fica com as
  N etiquetas a partir dela (o dono, 12/11/2026: *"na tela do PCP já vai ter ali
  falando que a etiqueta próxima disponível é a 10 e ele confere"*). Ninguém digita
  número.
- ⚠️ **No Iniciar, a pessoa bipa a etiqueta de cima do maço** (um bipe só, a
  proposta): bateu com a da tela, segue; não bateu (o maço de outra bancada, uma
  etiqueta estragada e jogada fora, duas pessoas no mesmo tipo), o sistema usa **a
  bipada**, se não estiver usada, e diz quantas ficaram para trás. Sem esse bipe, um
  maço fora de ordem ligaria as etiquetas aos itens errados, e a montagem recusaria a
  peça certa.
- **O tempo** é do início ao fim do lote, e por unidade é o tempo ÷ a quantidade —
  é daí que sai *"o que cada pessoa está fazendo na fábrica"* e quantas peças faz no
  dia.
- **O tempo** é do início ao fim do lote, e por unidade é o tempo ÷ a quantidade —
  é daí que sai *"o que cada pessoa está fazendo na fábrica"* e quantas peças faz no
  dia.

**O roteiro é da ficha:** cada linha da 404 diz em que etapa o material é preparado
(uma caixinha a mais, como a "vai para o planejamento" de 10/11).

---

## 3. A pré-fabricação — o que está cortado, à vista

As etiquetas que ainda não foram usadas **são** a pré-fabricação: uma lista de
peças, e não um número solto.

| Item | Agrupado por |
|---|---|
| Tecido cortado | **cor + medida de corte** (a régua da aba Corte e separação, #12) |
| Tubo cortado (+ base) | **medida de corte**, sem cor (*"serve para qualquer cor"*) |
| Kit de comando | **altura** da persiana (o comprimento da corrente) |
| Kit de instalação | um só |

**O material continua no saldo até a embalagem.** O que muda é que ele aparece
dividido (o dono: *"tantos rolos de tecido fechado e tantos cortados de cada SKU,
tantos tubos cortados e tantos não cortados"*):

```
Blackout bege 3,20 ........ saldo 120 m  =  92 m em rolo  +  28 m já cortados (40 peças)
Tubo 38 (barra 6 m) ....... saldo  60 m  =  45 m em barra +  15 m já cortados (10 tubos)
```

- **Quanto está cortado** sai da ficha: as peças cortadas × o consumo da linha
  (`expressao`, R-CMP / #18 — o consumo, nunca a medida de corte). Nenhuma conta nova
  de material.
- **Isto aparece onde a compra olha:** na 1101 Materiais (ao lado do saldo, com
  "usado em") e na lista de compras da 501 (*"28 m deste saldo já estão cortados"*).
  A conta da necessidade não muda: o cortado ainda é saldo, e a persiana que ele vai
  virar já está na demanda. É só para quem compra **saber**.
- **Para os kits**, a pré-fabricação mostra quantos estão prontos contra o que o
  planejamento pede (a falta da aba Corte e separação), para *"montar antes de
  acabar"*.

---

## 4. A montagem e as etiquetas

- **A montagem bipa as duas etiquetas** (tecido e tubo) de cada persiana. **Sem as
  duas, não monta** (o dono, 12/11/2026). A etiqueta bipada sai da pré-fabricação, e
  o sistema sabe **quem cortou o tecido e quem cortou o tubo** de cada persiana.
- **Etiqueta já usada é recusada**, dizendo quando e por quem foi montada. A que não
  serve àquele SKU também (*"este tecido é 157 × 155; o BK160140BEGE pede 157 ×
  145"*; *"este tubo é 177; o SKU pede 157"*).
- **Etiqueta perdida ou estragada depois de colada:** reimprime-se pela 108, com o
  mesmo número (como a do sob medida, R-SMT-04).
- **A embalagem bipa a etiqueta do kit de comando e a do kit de instalação** para
  fechar a persiana (o dono, 12/11/2026), no lugar do código fixo do kit que se bipa
  hoje (R-EMB-01). Entra na fase 4, e **nasce DESLIGADA** (`config.embalagem_bipa_kits
  = 0`): até ligar, a embalagem fica exatamente como está. **Quem liga é o Admin
  Geral**, por um botão na 108 (o dono: *"coloque algo para ativar quando for
  funcionar dessa forma"*), como a ordem pela falta da 401 (§3 do CLAUDE.md).
  Ligada, sem as duas etiquetas de kit a embalagem não fecha.

---

## 5. As telas

**107 Montagem** (tablet), **dos dois jeitos** (Q1): **em lote** — bipa o SKU,
monta N, bipa as duas etiquetas de cada uma e o fim — ou **uma por vez**. Grava
quem, quando, o tempo e as etiquetas (`quem.js`). Rota `/montagem-persiana`: a
`/montagem` é a Embalagem (102) e não muda.

**108 Preparo** (tablet), com as etapas que a pessoa tem chave: corte de tecido,
corte de tubo e base, kit de comando, kit de instalação. **Iniciar**, assinalar os
itens e as quantidades, **Terminei** (com a faixa de etiquetas). E **imprimir um maço
de etiquetas** de cada tipo, quando estiver acabando.

**A 108 trabalha pelo planejamento** (o dono: *"é por lá que vemos o que temos que
fazer, por lá nos baseamos as nossas prioridades"*). A lista do que cortar e montar
é a da aba **Corte e separação da 401**, **na mesma ordem e com a mesma data da
falta** (a falta por dia do `demanda_dominio`), **menos o que já está na
pré-fabricação**. Nada de conta nova nem prioridade própria (#12): mudou o
planejamento, mudou a lista da bancada. A 401 mostra, ao lado de cada item, quanto
já está cortado.

---

## 6. Que a pré-fabricação não fique largada nem bagunçada (Q6 — ok do dono)

O dono: *"quero algo que funcione mas que não seja largado e nem bagunçado. E também
não quero nada engessado."* Como cada peça tem etiqueta:

1. **Conferência pelo bipe, na 108** (Supervisor, quando quiser; sugestão: semanal):
   bipa as etiquetas que estão na bancada. A que o sistema tinha e **não foi bipada**
   aparece numa lista; quem confere marca **"perdida / refugo"** com motivo, ou acha
   a peça. Sem contagem cega nem aprovação em duas pessoas.
2. **Idade:** peça esperando há mais de N dias (`config`, sugestão 15) aparece na
   central de Pendências (204).
3. ⚠️ **A peça perdida ou refugada não mexe em saldo** (o material só baixa na
   embalagem): o material dela continua no saldo, e quem confere é avisado de que o
   material daquela peça **está no saldo sem existir** — o caminho é a contagem do
   material na 504, como para qualquer perda de corte.

---

## 7. Rejeição com dono

O motivo da peça com problema na revisão (101) **aponta a etapa**: tecido → corte de
tecido, tubo → corte de tubo, montagem → montagem. Pelas etiquetas bipadas na
montagem, o sistema sabe **a pessoa** de cada etapa daquela persiana. A 104 mostra
por etapa e por pessoa.

---

## 8. O tempo e o cartão de ponto (Q4)

O tempo de cada lote é do bipe de início ao de fim. A pausa (almoço) sai pelo
**sistema de ponto da empresa** (feito pela Deccorar): ele tem API, roda no mesmo
servidor e as batidas chegam na hora. O PCP lê as batidas de saída e volta da pessoa
e desconta do lote aberto.

- **Quem é quem:** o cadastro da pessoa no PCP (901) ganha o **número do colaborador
  no ponto**; nunca se casa pelo nome (#10).
- **Até o ponto ligar** (e se ele estiver fora do ar): o lote muito acima do normal
  fica marcado como suspeito e sai da média de tempo (a régua do sob medida,
  R-SMI-01). A quantidade conta sempre. Ligado o ponto, o tempo é recalculado.

---

## 9. O que ainda espera o dono

| # | Pergunta |
|---|---|
| A | ✅ **O bipe da etiqueta de cima do maço no Iniciar** (§2): aprovado com a spec (12/11/2026) |

---

## 10. Respostas do dono (12/11/2026)

| # | Pergunta | Resposta |
|---|---|---|
| Q1 | Montagem em lote ou uma por vez? | **Dos dois jeitos** |
| Q2 | Tecido cortado por SKU ou cor + medida? | Quem corta **escolhe o SKU com a cor**; agrupa por **cor + medida**; tubo e base só pela medida |
| Q3 | Kit de comando é um só? | **Varia pela altura** |
| Q4 | Pausa no lote | **Pelo cartão de ponto**, por API; até lá, o lote suspeito |
| Q5 | Faltou na pré-fabricação | **Etiqueta sequencial** em cada peça; a montagem **recusa** sem as duas etiquetas |
| Q7 | Etiqueta agora ou depois | **Agora**, junto com o corte |
| Q8 | O rolo cortado continua no saldo? | **Sim, a baixa continua na embalagem**; a compra vê o cortado separado do fechado (§3) |
| — | Kits | **Etiqueta sequencial também**, com início e fim do lote, para a produtividade e para montar antes de acabar |
| — | O que é cada kit | **Kit de comando** = o comando com a corrente montada, varia pela medida da corrente; **kit de instalação** = único, um por persiana |
| — | A saída do kit | **A embalagem bipa as etiquetas** do kit de comando e do de instalação para fechar a persiana (fase 4) |
| — | As etiquetas | **Impressas antes, em maço**, na mesa do tecido e na bancada da serralheria; imprime-se mais quando acabar |
| Q6 | A pré-fabricação largada | **Ok** ao desenho do §6 |
| — | Como a etiqueta se liga | **A tela mostra a próxima etiqueta disponível**, e o lote fica com as N a partir dela; **lote só de peças iguais** |
| — | O bipe dos kits na embalagem | **Com chave para ligar** quando a fábrica estiver pronta |
| — | A prioridade da bancada | **É a do planejamento** (a 401) |

---

## 14. v7 — a etiqueta da persiana e as etiquetas pelo planejamento (25/11/2026, RASCUNHO)

> Decisões do dono na conversa de 25/11/2026. **Substitui** o maço em branco do §2
> (e o bipe da etiqueta de cima do maço, §9-A), a "imprimir maço" da 108 (§5) e o
> bipe do SKU na revisão e na embalagem para a peça que vem da montagem nova.
> O resto da spec continua: a baixa na embalagem, a pré-fabricação (§3), a
> conferência (§6), a rejeição com dono (§7), o ponto (§8).

### 14.1 Por que a persiana precisa de etiqueta por fora

O dono: *"essas etiquetas com código de barra para tecido e para o tubo ficam
enroladas dentro da persiana … depois que a pessoa termina a revisão ela não tem
mais acesso, e nem a embalagem."* Hoje, depois da embalagem, todo saco do mesmo SKU
tem a mesma etiqueta: o sistema sabe quem embalou **o SKU** naquela hora, não
**aquela peça**. A etiqueta da persiana em série vai **por fora**, e é por ela que a
história escondida dentro da persiana (o tecido, o tubo, quem cortou, quem montou)
chega à revisão, à embalagem e à prateleira.

### 14.2 A etiqueta da persiana — o SKU em série

- **O mesmo motor e o mesmo formato da etiqueta do cadastro de SKU**
  (`sku_etq_pdf.js`, 100 × 35, Zebra ZD220), com o **"Nº 41" em destaque**.
- **A sequência é POR SKU** (decisão do dono: *"vai ser mais intuitivo"*): o
  BK160140BEGE tem os seus nº 1, 2, 3…; o BK140140CINZA tem os dele. O número
  nunca volta e nunca se reaproveita, nem o da etiqueta cancelada.
- **O código de barras é o número da etiqueta na fábrica** (a ordem em que saiu da
  Zebra, de qualquer SKU), e **não é escrito** na etiqueta: ninguém o lê. Ele existe
  porque o código do SKU é livre (§7 do CLAUDE.md) e o leitor tira espaço e hífen —
  `SKU-41` chegaria como outro SKU. O sistema guarda que aquele código é o
  "BK160140BEGE nº 41".
- **Um tradutor só** (dono único) converte o código da etiqueta em SKU + número; as
  telas que hoje leem o SKU passam por ele quando forem ligadas, e o saco antigo,
  com a etiqueta comum, continua aceito.
- **A 402 Cadastro de SKU fica com a etiqueta comum** (sem número) durante a
  transição; a etiqueta em série não se imprime ali.

### 14.3 As etiquetas de tecido e de tubo saem pelo planejamento

No lugar do maço em branco (§2), elas são **impressas já com o item**: a etiqueta é a
própria ordem de corte.

```
TC 000041 · BLACKOUT BEGE · corte 157 × 145 · para BK160140BEGE
TB 000017 · TUBO 38 · corte 157 · (a base vai junto, sem etiqueta)
```

A medida de corte é a da ficha (`corte_largura`/`corte_altura`, a régua da aba Corte
e separação, #18 e #12). O tecido agrupa por cor + medida, o tubo só pela medida
(§3, sem mudança).

### 14.4 A 109 Etiquetas da produção — onde tudo se imprime

Tela nova, do **Supervisor**, no computador da Zebra. Três blocos — **Persiana (SKU
em série) · Tecido · Tubo e base** —, cada um com a lista do planejamento:

1. **A necessidade do DIA** (a parte Hoje da 101).
2. **Os próximos dias** (de amanhã até sexta, a parte Próximos dias da 101).
3. **O alvo** (Completar o alvo).

- **Os próximos dias e o alvo só abrem quando toda a necessidade do dia já tem
  etiqueta impressa** (o dono: *"a montagem já pode seguir com o próximo passo, que
  é as de amanhã"*). O Supervisor imprime o dia e os próximos de uma vez, para a
  bancada não ficar pedindo serviço.
- **Venda nova de hoje no meio não trava nada**: a tela do operador (107, 108) diz
  *"tem peça na frente com prioridade"*.
- **A conta não é nova (#12):** parte da lista da 101 (`revisao_lista.js`, que já
  desconta a mesa da embalagem) e desconta o que já está a caminho, sem contar duas
  vezes:

  | BK160140BEGE, hoje | Peças |
  |---|---|
  | Falta para as vendas de hoje | 12 |
  | − na mesa da embalagem (revisadas, esperando embalar) | 3 |
  | − no carrinho da revisão (montadas, esperando revisar) | 2 |
  | − etiquetas de persiana impressas e ainda não montadas | 4 |
  | **= pode imprimir para hoje** | **3** → nº 45, 46 e 47 |

  O tecido e o tubo descontam, além disso, o que já está cortado e o que já tem
  etiqueta e ainda não foi cortado. Até a 107 existir, o carrinho da revisão conta
  zero, e a tela diz.
- **Imprimir fora do planejamento**, nos três blocos: o SKU (ou a medida do tubo) e a
  quantidade, com **motivo de uma lista curta** — peça com defeito para refazer,
  reposição de perda, teste, outro (com texto). A peça fica marcada "fora do
  planejamento" nos relatórios e na pré-fabricação.
- **Cancelar etiqueta**: Supervisor, com motivo; ela deixa de descontar. A etiqueta
  impressa e parada há mais de N dias aparece na 204; o N (15) se muda na 906
  Parâmetros.

### 14.5 O corte (108) e a montagem (107) — 1 peça ou mais

O mesmo jeito nas duas, no tablet:

```
 ① QUANTAS?   [ 1 PEÇA ]   [ MAIS DE UMA ] → [2] [3] … [10]  (botões grandes)
 CORTE:     bipa a etiqueta de cada peça que vai cortar (TC ou TB, do mesmo item)
            → corta → FIM: bipa de novo a etiqueta de cada peça
 MONTAGEM:  QUATRO bipes por peça (o dono, 25/11/2026):
            ① SKU em série  ② tecido  ③ tubo   → monta →   ④ SKU em série de novo = FIM
            os bipes ② e ③ são conferidos na hora contra a ficha: "este tecido é
            117 × 125; o BK140140BEGE pede 137 × 145" → recusa
            COM MAIS DE UMA: a mesma lógica — ①②③ de cada peça no início, e cada
            peça fecha com o ④ dela; o lote termina quando todas fecharam
 [ Cancelar ] antes do fim: nada grava, as etiquetas ficam livres
```

- **Lote só de peças iguais** (um item de tecido, uma medida de tubo, um SKU na
  montagem). Etiqueta já usada é recusada dizendo quando e por quem.
- Grava quem (o login, `quem.js`), início, fim e o tempo de cada peça (do ① ao ④
  dela); no corte, o do lote ÷ as peças.
- **É a montagem que liga** a persiana em série ao tecido, ao tubo, a quem cortou cada
  um e a quem montou, e passa a peça à frente.
- A persiana montada vai **sozinha** para a fila da revisão (o carrinho).
- ⚠️ **A troca de etiqueta entre duas persianas montadas é possível, e nada a pega**
  (o dono aceita: *"não vejo outro jeito"*; e a revisão não bipa o tecido, 14.6).

### 14.6 A revisão (101)

- **Início e fim pelo SKU em série** (o dono, 25/11/2026): os dois bipes de sempre,
  agora com a etiqueta da persiana. O tempo mínimo (R-REV-07) continua. Pelo número,
  a revisão sabe o tecido, o tubo, quem cortou e quem montou.
- ⚠️ A revisão **não** bipa a etiqueta do tecido (era a proposta do rascunho): a
  troca de etiqueta entre duas persianas montadas não é pega.
- A peça enrolada segue com a etiqueta da persiana por fora.

### 14.7 A embalagem (102)

- **Bipa a etiqueta de SKU como já faz, agora com o código em série**: o 1º e o 3º
  bipe são a etiqueta da persiana (o kit continua como está,
  e os kits com etiqueta seguem a fase 4, desligada). A embalagem sabe **qual peça**
  é: consome a linha da fila dela (acaba o "pega a mais antiga" da peça com defeito,
  R-EMB-11 e R-EMB-13).

### 14.8 Os tempos parados de cada persiana

```
 impressa ─▶ cortada ─▶ montada ─▶ revisada ─▶ embalada ─▶ saiu do estoque
       espera    parada     parada no    parada na     parada no
       o corte   cortada    carrinho     mesa da       estoque
                            da revisão   embalagem
```

- Cada trecho é um número por persiana; a média e o pior caso por SKU e por semana
  vão para a 904. Peça antiga, sem série, não entra.
- ⚠️ **"Parada no estoque" só existe quando a Etiqueta de Venda bipar a etiqueta da
  persiana** (14.10). Até lá esse trecho fica sem número, e a tela diz.

### 14.9 A transição — a peça de antes

A peça sem etiqueta em série (o estoque de hoje, a devolução, o saco com a etiqueta
comum) **continua revisada e embalada pelo SKU, como hoje**, até acabar. Nada da
bancada para no primeiro dia.

### 14.10 Para depois (o dono: "essa é a ideia")

A **Etiqueta de Venda bipa a etiqueta da persiana**: o sistema liga a peça ao
cliente. Numa devolução, bipa-se o saco e vê-se a história inteira daquela persiana.
Fase própria, depois da 4.

### 14.11 O que ainda espera o dono

| # | Pergunta |
|---|---|
| B | ✅ **15 dias, mudável na 906 Parâmetros** (o dono, 25/11/2026), com o "vale na 109" (`parametros_onde.js`) |
| C | ✅ **A peça devolvida que volta à embalagem segue como peça antiga** até a fase 7 (14.10) |
| D | Montagem com mais de uma: cada peça fecha com o próprio ④ (o tempo é por peça) — confirmar |

---

## 11. Fases

| Fase | O quê | Risco |
|---|---|---|
| **1** | **O roteiro na ficha**: a etapa de cada linha da 404 e as etapas de cada modelo | 🟡 |
| **2** | **109 Etiquetas da produção** (tecido e tubo, pelo planejamento e fora dele, cancelar) + **108 Preparo — corte** de tecido e de tubo e base (1 ou N peças, início e fim pelo bipe, §14.5) + a pré-fabricação e o "já cortado" na 1101 e na 501 | 🔴 (schema, etiqueta) |
| **3** | **A etiqueta da persiana em série** na 109 (§14.2) + **107 Montagem** (1 ou N, três bipes por peça, conferidos contra a ficha) + **a revisão pela etiqueta da persiana** (§14.6) | 🔴 |
| **4** | **A embalagem bipa a etiqueta da persiana** (§14.7) + os **kits** com etiqueta (a embalagem bipa as duas, nasce desligado) + a conferência da pré-fabricação (§6) | 🔴 (mexe no bipe da embalagem) |
| **5** | **Rejeição com etapa e pessoa** (101, 104) | 🟡 |
| **6** | **O cartão de ponto** (a pausa) e os indicadores: tempo por unidade por etapa e **os tempos parados de cada persiana** (§14.8) na 904 e na 905 | 🟡 |
| **7** | **A Etiqueta de Venda bipa a etiqueta da persiana** (§14.10): a peça ligada ao cliente | 🔴 |

---

## 12. Onde mora

| Tela | Nº | Módulo | Bloco | Liga-se a |
|---|---|---|---|---|
| Montagem | 107 | Produção | Medida padrão | 101 Revisão, 108 Preparo, 404 |
| Preparo | 108 | Produção | Medida padrão | 401 (Corte e separação), 404, 107, 102, 1101, 501, 109 |
| Etiquetas da produção | 109 | Produção | Medida padrão | 401 e 101 (a lista do planejamento), 404 (a medida de corte), 107, 108, 101, 102, 402 (o motor da etiqueta) |

Nenhuma aba nova; nenhum módulo novo. A caixinha da etapa (fase 1) é um campo na
linha da 404; o "já cortado" é uma coluna na 1101 e uma linha na lista de compras
da 501 (mesmo assunto: o saldo do material); o número do ponto é um campo no
cadastro da pessoa (901).

## 13. Alçada

| O quê | Chave | Nível | Tela | Sensível |
|---|---|---|---|---|
| Montar persianas | `producao.montar` | Operação | 107 | não |
| Cortar tecido | `producao.cortar_tecido` | Operação | 108 | não |
| Cortar tubo e base | `producao.cortar_tubo` | Operação | 108 | não |
| Montar kit de comando | `producao.kit_comando` | Operação | 108 | não |
| Montar kit de instalação | `producao.kit_instalacao` | Operação | 108 | não |
| Imprimir as etiquetas da produção (persiana, tecido, tubo), pelo planejamento e fora dele com motivo | `producao.etiqueta` | **Supervisor** (v7; era Operação na 108) | 109 | não |
| Conferir a pré-fabricação, marcar perdida, corrigir lote, **cancelar etiqueta** | `producao.corrigir` | Supervisor | 107 / 108 / 109 | **sim** |

Nenhuma chave mexe em saldo (o material baixa na embalagem, como hoje). Setores
sugeridos (nascem vazios): Operador / Corte, Operador / Kits, Operador / Montagem.
Tudo novo nasce **só para o Admin Geral** (R-ALC-06), até o dono marcar.
