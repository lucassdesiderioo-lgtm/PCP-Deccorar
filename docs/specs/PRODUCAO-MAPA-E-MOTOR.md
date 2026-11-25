> **STATUS · 12/11/2026 — APROVADA pelo dono (v6)** · **fase 1 construída, falta subir** (o roteiro na ficha: `etapas.js`, `ficha_formula.etapa`, a 404; `teste_roteiro.js`, 25; ③ REVISÃO: modelo sem ficha e sob medida ficam sem roteiro, decisão de construção; **REGRA do dono em 12/11/2026: toda linha da ficha tem etapa de preparo — sem "sai direto na embalagem" —, e o kit passa só por montagem e embalagem**, linha em `docs/DECISOES.md`) · próxima: fase 2
> **v7 · 25/11/2026 — decisões do dono no protótipo, escritas no §14** (as três etiquetas, a aba "Etiquetas da produção" da 401, a 108 Corte de tecido, a 110 Serralheria e a 107 Montagem no formato da 101, a revisão e a embalagem pelo SKU em série, o rastreio na 904). **Falta o dono responder a H (§14.9)** e aprovar o texto. **Onde o §14 e o resto desta spec divergirem, vale o §14.**
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

## 14. v7 — as telas da bancada, as etiquetas e o rastreio (25/11/2026)

> Decisões do dono na conversa de 25/11/2026, desenhadas no protótipo clicável
> (artifact "Motor da Produção", privado do dono). **Substitui** o §2 (o lote de
> peças iguais e o bipe da etiqueta de cima do maço, §9-A), o §5 (a 108 Preparo com
> as quatro etapas e a impressão do maço na bancada) e o bipe do SKU na revisão e na
> embalagem para a peça que vem da montagem nova. Continuam: a baixa na embalagem,
> a pré-fabricação (§3), a conferência (§6), a rejeição com dono (§7), o ponto (§8).

### 14.1 Por que a persiana precisa de etiqueta por fora

O dono: *"essas etiquetas com código de barra para tecido e para o tubo ficam
enroladas dentro da persiana … depois que a pessoa termina a revisão ela não tem
mais acesso, e nem a embalagem."* Hoje, depois da embalagem, todo saco do mesmo SKU
tem a mesma etiqueta: o sistema sabe quem embalou **o SKU** naquela hora, não
**aquela peça**. A etiqueta da persiana em série vai **por fora**, e é por ela que a
história escondida dentro da persiana (o tecido, o tubo, quem cortou, quem montou)
chega à revisão, à embalagem e à prateleira.

### 14.2 As três etiquetas

| | Tecido (TC) · Tubo (TB) | Persiana — o SKU em série |
|---|---|---|
| Onde fica | **dentro** da persiana, enrolada | **por fora** do saco |
| O que traz | só o número (`TC 000123`) — **sem medida** | o formato da etiqueta de SKU de hoje (`sku_etq_pdf.js`): medida, cor, M², SKU **e o "Nº 45" em destaque** |
| Como se imprime | **maço em branco, sequencial, em bloco** | **por SKU**, em bloco, pelo planejamento |
| Ganha o item | no bipe do corte (108) ou da serralheria (110) | nasce com o SKU; a montagem a liga ao tecido e ao tubo |

- **A sequência da persiana é POR SKU** (o dono: *"vai ser mais intuitivo"*): o
  BK160140BEGE tem os seus nº 1, 2, 3…; o BK140140CINZA tem os dele. O número nunca
  volta e nunca se reaproveita, nem o da etiqueta cancelada.
- **O código de barras da persiana é o número da etiqueta na fábrica** (a ordem em
  que saiu da Zebra, de qualquer SKU) e **não é escrito** nela: o código do SKU é
  livre (§7 do CLAUDE.md) e o leitor tira espaço e hífen — `SKU-41` chegaria como
  outro SKU. **Um tradutor só** (dono único) converte o código em SKU + número.
- **A etiqueta de tecido não precisa de medida** porque a peça cortada vai para a
  **prateleira da sua cor e medida** (o tubo, da sua medida, sem cor), e a montagem
  pega dali. Ainda assim o sistema sabe o que cada TC é, e recusa o tecido errado.
- **A 402 Cadastro de SKU fica com a etiqueta comum** (sem número) durante a
  transição; a etiqueta em série não se imprime ali.

### 14.3 A impressão — aba "Etiquetas da produção" da 401 Planejamento

**A 109 não existe** (o dono: *"onde o planejador da produção tem todas as
informações do que fazer e já imprimir as etiquetas"*). Uma aba nova na 401, do
mesmo assunto que a Corte e separação. **A 401 passa a abrir também para o
Supervisor, que vê só esta aba**; as outras continuam de nível Admin. Quem imprime:
**Supervisor ou acima**, e mais ninguém (as telas de bancada não imprimem).

Só a **impressão em bloco**:

1. **Etiquetas de SKU em série**, em três linhas — **Necessidade do dia** ·
   **Próximos dias** · **Completar o alvo** —, cada uma com o total e um botão. A
   conta SKU a SKU (falta − na mesa da embalagem − no carrinho da revisão − já
   impressas e não usadas) fica **recolhida**, para conferir. **A conta não é nova
   (#12):** parte da lista da 101 (`revisao_lista.js`).
2. **Maço de tecido (TC)** e **maço de tubo (TB)**, lado a lado: a próxima
   disponível, quantas sobram impressas e a quantidade a imprimir.
3. **Fora do planejamento**: a etiqueta de SKU de um SKU e quantidade, com **motivo
   de uma lista curta** — peça com defeito para refazer, reposição de perda, teste,
   outro (com texto). Fica marcada "fora do planejamento" nos relatórios.
4. **Impressas e ainda não usadas** (os três tipos): quem imprimiu e há quantos
   dias. A parada há mais de N dias fica em âmbar e em cima; o N (15) se muda na 906
   Parâmetros. **Não vai para a 204.** Ali o Supervisor **cancela** uma ou várias,
   com motivo; o número não volta.
5. **O histórico de impressão do dia** (hora, quem, o quê, os números, a
   quantidade), de onde se **reimprime** uma etiqueta perdida **com o mesmo número**.

**A dinâmica ao longo do dia** (o dono, 25/11/2026):

- **A tela sempre mostra o que falta imprimir**: a necessidade menos o já impresso e
  não usado. Nunca imprime duas vezes a mesma peça.
- **Venda nova depois da impressão** (o PDF das 10:15): a linha do dia volta a
  pedir **só a diferença**, com a faixa *"N etiquetas novas para hoje desde a última
  impressão"*, e a numeração continua de onde parou. **Nada trava**; nas telas da
  bancada aparece *"tem peça na frente com prioridade"*.
- **Bolinha vermelha no ☰ Menu**, ao lado da 401, com o número de etiquetas de hoje
  a imprimir, para quem pode imprimir; some quando zera (como a das pendências,
  `menu_telas.js`).
- **Necessidade que caiu** (venda cancelada): a etiqueta a mais **serve à próxima
  necessidade daquele SKU** (a conta dos próximos dias e do alvo também desconta o
  impresso); se não servir, o Supervisor a cancela.

**Quando abre cada parte** (✅ o dono, 25/11/2026):

| Parte | Abre quando | Quanto se pode imprimir |
|---|---|---|
| Necessidade do dia | sempre | tudo o que falta (a venda está esperando; sem tecido ou tubo cortado, a linha avisa em âmbar e o corte já tem o item no vermelho) |
| Próximos dias | toda a necessidade do dia já tem etiqueta | tudo o que falta, **até o que há de tecido e tubo cortados livres** para cada SKU |
| Completar o alvo | o **dia seguinte** já tem toda a etiqueta | o Supervisor digita quantas (ex.: 20); o sistema reparte **na ordem do alvo**, SKU a SKU, **até o que há de tecido e tubo cortados livres** |

*Livre* = o cortado na prateleira menos o que as etiquetas de persiana já impressas
e não montadas vão usar. A tela diz por SKU *"há tecido e tubo para X"*; o que passa
disso não sai (o dono: *"não adianta imprimir um monte de etiqueta, sendo que não
tem tecido e nem tubo disponível"*).

### 14.4 As telas da bancada — no formato da 101 Revisão

**108 Corte de tecido**, **110 Serralheria** e **107 Montagem** são **telas
separadas, com a mesma dinâmica da 101** (o dono: *"formato da tela, visão e
sequência do que se deve fazer e qual prioridade de trabalho"*):

- **No alto:** as peças de hoje, a sua média de hoje e **Ver a semana**.
- **À direita, a lista do que fazer**, não uma sugestão: **HOJE** em vermelho e em
  destaque, com cartões grandes; embaixo **Depois de hoje** e **Completar o alvo**.
  Terminado o dia, *"✓ Hoje está terminado"* e os próximos dias sobem. O número de
  cada cartão **já desconta o que está pronto à frente** (no corte, o cortado na
  prateleira; na montagem, o montado no carrinho da revisão), com a barra do
  andamento. A ordem e a conta são as do planejamento (a fábrica *"em uma única
  sintonia"*).
- **À esquerda, a peça na mão:** o campo do bipe e o quadro do que fazer agora.
- **Toca no cartão → só o teclado numérico grande** (1, 10, 27…) → OK. Sem botões de
  1 a 10.
- **No fim:** as barras "Agora" e "Sua média" (R-TEM-01, `tempo_operador.js`) e as
  peças do dia.

**108 Corte de tecido.** Cada cartão: **a medida do SKU final grande** (*1,50 × 1,50
BEGE*, como a fábrica fala — o dono: *"se a gente mudar as medidas, vai virar uma
confusão"*), **a medida de corte menor embaixo** com o SKU (*corte 147 × 165 ·
BK150150BEGE*), para a pessoa aprender que uma liga à outra. A tela diz como cortar
(*"Puxe 165 e corte, 27 vezes. Depois o corte de 147 em todas"* — é como a mesa
corta em série). Não se escolhe bobina.

**110 Serralheria.** O cartão é a **medida da persiana** (*Tubo 1,50*), com a medida
de corte e os SKUs que o tubo serve. **O tubo e a medida de corte saem da ficha
técnica** (404) de cada SKU — na medida padrão do ML, tubo de 32 —; nada fica
escrito na tela. Corta tubo e base juntos; **só o tubo leva etiqueta**.

**Os bipes do corte e da serralheria:**

| | Início | Fim |
|---|---|---|
| **1 peça** | bipa a etiqueta | bipa **a mesma** de novo |
| **Lote** | bipa a **primeira** etiqueta | cola e **bipa cada uma**; a última fecha |

O dono quer todas bipadas: *"para não correr o risco de nenhuma ser extraviada"*.
Etiqueta já usada é recusada dizendo quando, por quem e como. Etiqueta do maço que
estragou: a pessoa bipa a seguinte; a que sobrou fica na lista das não usadas.
**Peça perdida no corte**, com motivo: a peça volta para a lista. O tempo por peça é
do primeiro ao último bipe ÷ as peças.

**107 Montagem.** O cartão é a **persiana** (medida, cor, SKU) e diz **o que há
cortado na prateleira** (*"27 tecidos · 6 tubos"*); sem tecido ou sem tubo, em âmbar,
e o cartão **não deixa começar** (*"precisa passar pelo corte de tecido (108)
antes"*). O teclado não deixa passar do que há cortado. **Quatro bipes por peça**:

```
 ① SKU em série  →  ② tecido  →  ③ tubo   … monta …   ④ SKU em série de novo = FIM
```

- ② e ③ **conferidos na hora contra a ficha**: *"o tecido TC 000090 foi cortado como
  1,40 × 1,40 CINZA. O BK150150BEGE pede 1,50 × 1,50 BEGE"* → recusa. Fora de ordem,
  a tela diz qual bipe é agora.
- **Com mais de uma:** ①②③ de cada peça no início; **cada peça fecha com o seu ④**;
  o lote termina quando todas fecharam.
- **O tempo:** uma por vez, do ① ao ④; em lote, do primeiro ① ao último ④ ÷ as
  peças. "Uma por vez" e "em lote" aparecem **separados** nos relatórios.
- **É a montagem que liga** a persiana ao tecido, ao tubo, a quem cortou cada um e a
  quem montou, e a peça vai **sozinha** para o carrinho da revisão.
- **Voltou para você:** no topo, a peça que a revisão devolveu a esta pessoa. Ela
  conserta e **bipa a etiqueta de SKU da peça**: a peça volta ao carrinho da revisão.
- ⚠️ **A troca de etiqueta de SKU entre duas persianas montadas é possível, e nada a
  pega** (o dono aceita: *"não vejo outro jeito"*).

**111 Kits** (o dono, 25/11/2026: *"essas duas coisas poderiam ser na mesma tela"*).
No mesmo formato, com **dois botões grandes no topo: KIT DE INSTALAÇÃO · COMANDO /
CORRENTE**. A lista de cada um: Hoje · Depois de hoje · Alvo, já sem o que está
pronto na prateleira.

- **Kit de instalação:** um só, um por persiana.
- **Comando / corrente:** um cartão **por medida da corrente**, a mesma da aba Corte
  e separação da 401 (a linha da ficha, hoje `2 × altura − 20`), com a altura e os
  SKUs que ela serve.
- **Sem bipe:** toca no cartão → teclado (ex.: 20) → **▶ INICIAR** → **■ TERMINEI** →
  a tela pergunta **quantos ficaram prontos** (já vem com o número do início; se
  algum se perdeu, corrige, e o que falta volta para a lista). O tempo por kit é o
  do lote ÷ os prontos.
- ⚠️ **Isto muda o que a spec dizia dos kits** (a etiqueta sequencial KC e KI e a
  embalagem bipando os dois, §4 e fase 4): pergunta H.

### 14.5 A revisão (101) e a embalagem (102)

- **Revisão:** início e fim pelo **SKU em série** (os dois bipes de sempre; o tempo
  mínimo, R-REV-07, continua). **No primeiro bipe a tela mostra os nomes** de quem
  cortou o tecido, quem cortou o tubo e quem montou. A **Peça com problema** escolhe
  a etapa culpada e a peça volta para aquela pessoa, no "Voltou para você" da tela
  dela (§7, fase 5).
- **Embalagem:** bipa a etiqueta de SKU **como já faz, agora em série** (o 1º e o 3º
  bipe; o kit continua como está). Ela sabe **qual peça** embala: consome a linha da
  fila daquela peça (acaba o "pega a mais antiga" da R-EMB-11 e R-EMB-13).

### 14.6 O rastreio — aba "Rastreio da produção" da 904 Relatórios

- **Consultar uma persiana:** bipa o saco (ou digita o Nº) e aparece a história
  inteira — impressa, tecido cortado, tubo cortado, montada, revisada, embalada —,
  com quem e a hora, e **quanto tempo ficou parada** entre cada etapa.
- **O tempo parado somado**, por SKU e por semana: a média e o pior caso de cada
  trecho (espera o corte · cortada esperando montar · no carrinho da revisão · na
  mesa da embalagem).
- ⚠️ **"Parada no estoque" só existe quando a Etiqueta de Venda bipar a etiqueta da
  persiana** (fase 7). Até lá esse trecho fica sem número, e a tela diz. Peça antiga,
  sem série, não entra.

### 14.7 A transição — a peça de antes

A peça sem etiqueta em série (o estoque de hoje, a devolução, o saco com a etiqueta
comum) **continua revisada e embalada pelo SKU, como hoje**, até acabar. **A peça
devolvida que volta à embalagem segue como peça antiga** até a fase 7.

### 14.8 Para depois — fase 7 (o dono: "essa é a ideia")

A **Etiqueta de Venda bipa a etiqueta da persiana**: o sistema liga a peça ao
cliente. Numa devolução, bipa-se o saco e vê-se a história inteira daquela persiana.

### 14.9 O que ainda espera o dono

| # | Pergunta |
|---|---|
| B | ✅ 15 dias, mudável na 906 Parâmetros; não vai para a 204 |
| C | ✅ A peça devolvida segue como antiga até a fase 7 |
| D | ✅ Cada peça da montagem fecha com o próprio ④ |
| E | ✅ "Voltou para você" na tela de quem fez; conserta e bipa o SKU |
| F | ✅ A regra do §14.3 "Quando abre cada parte" (o dono, 25/11/2026) |
| G | ✅ A **111 Kits**, as duas coisas na mesma tela (§14.4) |
| H | Os kits **ainda levam etiqueta sequencial** (KC/KI) e a embalagem os bipa (a fase 4, desligada), ou ficam **sem etiqueta**, e a embalagem continua bipando o código fixo do kit como hoje? |

---

## 11. Fases

| Fase | O quê | Risco |
|---|---|---|
| **1** | **O roteiro na ficha**: a etapa de cada linha da 404 e as etapas de cada modelo | 🟡 |
| **2** | **A aba "Etiquetas da produção" da 401** (os maços TC e TB, as não usadas, o histórico) + **108 Corte de tecido** e **110 Serralheria** no formato da 101 (§14.4) + a pré-fabricação e o "já cortado" na 1101 e na 501 | 🔴 (schema, etiqueta) |
| **3** | **A etiqueta da persiana em série** na aba da 401, com a dinâmica do dia e a bolinha do ☰ Menu (§14.2, §14.3) + **107 Montagem** (§14.4) + **a revisão pela etiqueta da persiana** (§14.5) | 🔴 |
| **4** | **A embalagem bipa a etiqueta da persiana** (§14.5) + a **111 Kits** (§14.4; a etiqueta dos kits é a pergunta H) + a conferência da pré-fabricação (§6) | 🔴 (mexe no bipe da embalagem) |
| **5** | **Rejeição com etapa e pessoa** (101, 104) | 🟡 |
| **6** | **O cartão de ponto** (a pausa), os indicadores (tempo por unidade por etapa na 904 e na 905) e a **aba "Rastreio da produção" da 904** (§14.6) | 🟡 |
| **7** | **A Etiqueta de Venda bipa a etiqueta da persiana** (§14.8): a peça ligada ao cliente, e a "parada no estoque" | 🔴 |

---

## 12. Onde mora

| Tela | Nº | Módulo | Bloco | Liga-se a |
|---|---|---|---|---|
| Montagem | 107 | Produção | Medida padrão | 108, 110 (a prateleira), 101 Revisão, 404, 401 |
| Corte de tecido | 108 | Produção | Medida padrão | 401 (a lista e as etiquetas TC), 404 (a medida de corte), 107 |
| Serralheria | 110 | Produção | Medida padrão | 401 (a lista e as etiquetas TB), 404 (o tubo e a medida de corte), 107 |
| Kits | 111 | Produção | Medida padrão | 401 (Corte e separação: a medida da corrente), 404, 102 |
| — aba "Etiquetas da produção" | 401 | Planejamento | Medida padrão | 101 (a conta), 107, 108, 110, 402 (o motor da etiqueta). A 401 passa a abrir para o Supervisor, só nesta aba |
| — aba "Rastreio da produção" | 904 | Relatórios | Medida padrão | 107, 108, 110, 101, 102 |

**A 109 não existe** (a v7 de 25/11/2026 a tirou antes de nascer); o número fica livre.

Nenhuma aba nova; nenhum módulo novo. A caixinha da etapa (fase 1) é um campo na
linha da 404; o "já cortado" é uma coluna na 1101 e uma linha na lista de compras
da 501 (mesmo assunto: o saldo do material); o número do ponto é um campo no
cadastro da pessoa (901).

## 13. Alçada

| O quê | Chave | Nível | Tela | Sensível |
|---|---|---|---|---|
| Montar persianas | `producao.montar` | Operação | 107 | não |
| Cortar tecido | `producao.cortar_tecido` | Operação | 108 | não |
| Cortar tubo e base | `producao.cortar_tubo` | Operação | 110 | não |
| Montar kit de comando | `producao.kit_comando` | Operação | 111 | não |
| Montar kit de instalação | `producao.kit_instalacao` | Operação | 111 | não |
| Imprimir as etiquetas da produção (persiana, tecido, tubo), pelo planejamento e fora dele com motivo; reimprimir | `producao.etiqueta` | **Supervisor** | 401 (aba; abre a 401 só nela) | não |
| Conferir a pré-fabricação, marcar perdida, corrigir lote, **cancelar etiqueta** | `producao.corrigir` | Supervisor | 107 / 108 / 110 / 401 | **sim** |
| Consultar o rastreio da produção | `producao.rastrear` | Supervisor | 904 (aba) | não |

Nenhuma chave mexe em saldo (o material baixa na embalagem, como hoje). Setores
sugeridos (nascem vazios): Operador / Corte, Operador / Kits, Operador / Montagem.
Tudo novo nasce **só para o Admin Geral** (R-ALC-06), até o dono marcar.
