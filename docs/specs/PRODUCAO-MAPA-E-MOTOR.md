> **STATUS · 12/11/2026 — APROVADA pelo dono (v6)** · nada construído · próxima: fase 1
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

## 11. Fases

| Fase | O quê | Risco |
|---|---|---|
| **1** | **O roteiro na ficha**: a etapa de cada linha da 404 e as etapas de cada modelo | 🟡 |
| **2** | **108 Preparo — corte** de tecido e de tubo e base: o maço de etiquetas, o lote (iniciar, assinalar, terminei), a pré-fabricação e o "já cortado" na 1101 e na 501 | 🔴 (schema, etiqueta) |
| **3** | **107 Montagem**: em lote e uma por vez, bipando as duas etiquetas; a fila da revisão com origem | 🔴 |
| **4** | **108 — kits** de comando e de instalação, com etiqueta; **a embalagem bipa as duas etiquetas de kit** no lugar do código fixo; a conferência da pré-fabricação (§6) | 🔴 (mexe no bipe da embalagem) |
| **5** | **Rejeição com etapa e pessoa** (101, 104) | 🟡 |
| **6** | **O cartão de ponto** (a pausa) e os indicadores: tempo por unidade por etapa na 904 e na 905 | 🟡 |

---

## 12. Onde mora

| Tela | Nº | Módulo | Bloco | Liga-se a |
|---|---|---|---|---|
| Montagem | 107 | Produção | Medida padrão | 101 Revisão, 108 Preparo, 404 |
| Preparo | 108 | Produção | Medida padrão | 401 (Corte e separação), 404, 107, 102, 1101, 501 |

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
| Imprimir maço de etiquetas | `producao.etiqueta` | Operação | 108 | não |
| Conferir a pré-fabricação, marcar perdida, corrigir lote | `producao.corrigir` | Supervisor | 107 / 108 | **sim** |

Nenhuma chave mexe em saldo (o material baixa na embalagem, como hoje). Setores
sugeridos (nascem vazios): Operador / Corte, Operador / Kits, Operador / Montagem.
Tudo novo nasce **só para o Admin Geral** (R-ALC-06), até o dono marcar.
