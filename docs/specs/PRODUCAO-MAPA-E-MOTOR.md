> **STATUS · 12/11/2026 — RASCUNHO v3, espera a aprovação do dono** · nada construído
> Reescrita sobre o processo que o dono descreveu em 11/11/2026 e as respostas de
> 12/11/2026 (Q1 a Q8, §9). A versão de 17/08/2026 está em
> `docs/arquivo/PRODUCAO-MAPA-E-MOTOR-v1.md` (histórico, não é regra). Absorve a
> `PRODUCAO-MONTAGEM.md` (a montagem é a fase 2 daqui).
>
> ⚠️ **MUDA UMA REGRA DE 11/11/2026**, com o "sim" do dono (12/11/2026, *"alinhado,
> confirmado"*): **na medida padrão, o tecido, o tubo e a base saem do estoque de
> material no CORTE**, e não mais na embalagem. O kit de comando, o kit de
> instalação e o resto da ficha continuam saindo na embalagem. O sob medida não
> muda. Vai como linha em `docs/DECISOES.md` no commit da fase que a constrói.

# Produção da medida padrão — o mapa e o motor de etapas

> O dono, 11/11/2026: *"o medida padrão é uma produção em série, onde deixamos
> muitas coisas já meio que preparadas apenas para a montagem."* E: *"isso está
> totalmente ligado à ficha técnica, onde cada ficha técnica segue um processo
> produtivo."*

---

## 1. O processo

```
  ALMOXARIFADO DE TECIDO / MATERIAL     PRÉ-FABRICAÇÃO                 A PERSIANA
  ───────────────────────────────────   ───────────────────────────    ──────────────────────
  rolo de tecido (M-000123) ──corte──▶  tecido cortado  (etiqueta) ─┐
  barras de tubo e de base  ──corte──▶  tubo+base cortado (etiqueta)┴▶ MONTAGEM (bipa as 2)
                                                                          ▼
  corrente, comando ──────────────────▶ kit de comando (contador) ─┐   REVISÃO   (101, já existe)
  parafuso, bucha  ───────────────────▶ kit de instalação          ├─▶ EMBALAGEM (102, já existe)
                                                                   │      ▼
                                                                       ESTOQUE (+1, já existe)
```

**O que o sistema já mede:** a revisão e a embalagem, com quem fez e o tempo.
**O que ele não mede:** o corte, os kits e a montagem. Ninguém sabe quanto tecido
cortado está esperando, quanto tempo leva montar, nem quem montou a peça que a
revisão rejeitou.

**O que já existe e esta spec aproveita:** o que cortar (a aba Corte e separação da
401, `corte_dominio.js`); o que cada persiana usa e a medida de corte (a ficha da
404); o rolo etiquetado no almoxarifado de tecido (`volume_material`, `M-000001`,
R-CMP-39); a etiqueta Zebra do kit (`kit_pdf.js`, `public/barras.js`).

---

## 2. A ideia: etapas que alimentam a PRÉ-FABRICAÇÃO

O sob medida tem uma bancada que funciona (setores, bipe que inicia e termina,
quem fez, o tempo, a recusa que volta ao culpado). Aqui a diferença é que a fábrica
prepara **em lote, para estoque**, antes da venda. Por isso o motor é **"etapa em
lote que produz peças pré-fabricadas"**:

| Etapa | Consome | Produz | Como se conta |
|---|---|---|---|
| 1 Corte de tecido | **um rolo bipado** do almoxarifado de tecido (os metros cortados) | N tecidos cortados | **uma etiqueta por peça**, número único |
| 2 Corte de tubo e base | **N barras** de tubo e N de base | N conjuntos tubo+base | **uma etiqueta por conjunto**, número único |
| 3 Kit de comando | corrente e comando (saem na embalagem, como hoje) | N kits | contador, pela altura |
| 4 Kit de instalação | (sai na embalagem, como hoje) | N kits | contador, um só |
| 5 Montagem | 1 tecido + 1 tubo+base **pelas etiquetas** | a persiana | a fila da revisão |

**O roteiro é da ficha:** cada linha da 404 diz em que etapa o material é
preparado (uma caixinha a mais, como a "vai para o planejamento" de 10/11).

---

## 3. A pré-fabricação — um estoque de verdade, só da medida padrão

O tecido cortado e o tubo+base cortado viram o **estoque de pré-fabricação** (o
dono, 12/11/2026: *"como se fosse um estoque de pré-fabricação"*).

**Como cada item é agrupado (Q2, Q3):**

| Item | Agrupado por | Por quê |
|---|---|---|
| Tecido cortado | **cor + medida de corte** | a régua da aba Corte e separação (#12) |
| Tubo + base | **medida de corte**, sem cor | *"tubo e base serve para qualquer cor"* |
| Kit de comando | **altura** da persiana (o comprimento da corrente) | *"varia por medida da altura"* |
| Kit de instalação | um só | é o kit que a embalagem já confere |

**A baixa do material, por lote (Q8, o dono):** *"baixou tantas barras de tubo e
base e baixou tal rolo de tecido"*.

- **Corte de tecido:** quem corta **bipa a etiqueta do rolo** (`M-000123`) e,
  no fim, diz quantas peças cortou. O rolo baixa os metros que a ficha diz para
  aquelas peças (pela medida de corte), pelo dono do almoxarifado
  (`almox_dominio.js`) e no livro de material, com quem. Sobra no rolo continua
  no rolo.
- **Corte de tubo e base:** quem corta diz **quantas barras** de tubo e de base
  usou; elas saem do saldo de material, com quem.
- **Na embalagem**, o tecido, o tubo e a base **não baixam de novo** (a linha da
  ficha da etapa 1 ou 2 não entra na baixa da embalagem).

> ⚠️ **SÓ A MEDIDA PADRÃO** (as persianas do Mercado Livre). O sob medida continua
> com o rolo, a sobra e o corte dele (§19).

---

## 4. A etiqueta de cada peça cortada (Q5 e Q7)

O dono: *"deveríamos ter etiquetas com números únicos para cada etiqueta de corte
de tecido e cada etiqueta de corte de tubo. Assim quem montar tem que ler a
etiqueta de tecido e de tubo."*

- No fim do lote de corte, sai **uma etiqueta Zebra por peça** (a mesma porta do
  kit e da etiqueta de SKU), com o número único, o item (cor + medida, ou medida),
  a data e **quem cortou**. A etiqueta cola na peça.
- **A montagem bipa as duas etiquetas** (tecido e tubo+base) de cada persiana. A
  peça bipada sai da pré-fabricação. Assim o sistema sabe **quem cortou o tecido e
  quem cortou o tubo** de cada persiana montada.
- **Etiqueta já usada é recusada**, dizendo quando e por quem foi montada.
  Etiqueta de medida que não serve àquele SKU também (*"este tecido é 157 × 155;
  o BK160140BEGE pede 157 × 145"*).
- **Etiqueta perdida:** reimprime-se pela 108, com o mesmo número (como a do sob
  medida, R-SMT-04). Não há montagem sem as duas etiquetas: com a etiqueta em cada
  peça, ler é o caso normal, não a exceção (a #6 não se aplica).
- **O kit de comando e o de instalação não têm etiqueta**: são contadores, que
  sobem quando o kit é feito e descem na embalagem. Faltou no contador, **avisa e
  passa** (Q5): o contador fica negativo, com aviso.

---

## 5. As telas

**107 Montagem** (tablet), **dos dois jeitos** (Q1): **em lote** — bipa o SKU,
monta N, bipa as etiquetas de cada uma e o fim — ou **uma por vez**. Grava quem,
quando, o tempo, a quantidade e as etiquetas (`quem.js`). Rota
`/montagem-persiana`: a `/montagem` é a Embalagem (102) e não muda.

**108 Preparo** (tablet), com as etapas que a pessoa tem chave: corte de tecido
(bipa o rolo), corte de tubo e base (diz as barras), kit de comando, kit de
instalação. A lista do que fazer é a da aba Corte e separação **menos o que já está
na pré-fabricação** (nada de conta nova, #12). Imprime as etiquetas do lote.

---

## 6. Que a pré-fabricação não fique largada nem bagunçada (Q6)

O dono: *"quero algo que funcione mas que não seja largado e nem bagunçado. E
também não quero nada engessado."* Como cada peça tem etiqueta, a pré-fabricação é
**uma lista de etiquetas**, e não um número solto. Três coisas, sem contagem cega
nem aprovação em duas pessoas:

1. **Conferência pelo bipe, na 108** (Supervisor, quando quiser — sugestão:
   semanal): bipa todas as etiquetas que estão na bancada. O que o sistema tinha e
   **não foi bipado** aparece numa lista; quem confere marca **"perdida / refugo"**
   com motivo, ou acha a peça. O material já saiu no corte: a perdida vira
   **refugo** no relatório, sem mexer em saldo de material.
2. **Idade:** peça cortada esperando há mais de N dias (`config`, sugestão 15)
   aparece na central de Pendências (204). Pré-fabricação parada não some calada.
3. **O kit sem etiqueta** se acerta na mesma tela, digitando o contado, com motivo.

Não entra no Inventário de produto pronto (R-EST-24): lá é estoque que se vende, com
duas contagens; aqui é a bancada, e a etiqueta já é a prova.

---

## 7. Rejeição com dono

O motivo da peça com problema na revisão (101) **aponta a etapa**: tecido → corte
de tecido, tubo → corte de tubo, montagem → montagem. Pelas etiquetas bipadas na
montagem, o sistema sabe **a pessoa** de cada etapa daquela persiana. A 104 mostra
por etapa e por pessoa.

---

## 8. O tempo e o cartão de ponto (Q4)

O tempo de cada lote é do bipe de início ao de fim. A pausa (almoço) sai pelo
**sistema de ponto da empresa** (feito pela Deccorar): ele tem API, roda no mesmo
servidor e as batidas chegam na hora. O PCP lê as batidas de **saída e volta** da
pessoa e desconta do lote aberto.

- **Quem é quem:** o PCP ganha, no cadastro da pessoa (901), o **número do
  colaborador no ponto**; nunca se casa pelo nome (#10).
- **Até o ponto ligar** (e se ele estiver fora do ar): o lote muito acima do normal
  fica marcado como suspeito e sai da média de tempo (a régua do sob medida,
  R-SMI-01). A quantidade conta sempre. Ligado o ponto, o tempo é recalculado.

---

## 9. Respostas do dono (12/11/2026)

| # | Pergunta | Resposta |
|---|---|---|
| Q1 | Montagem em lote ou uma por vez? | **Dos dois jeitos** |
| Q2 | Tecido cortado por SKU ou cor + medida? | **Cor + medida de corte**; tubo e base só pela medida |
| Q3 | Kit de comando é um só? | **Varia pela altura** |
| Q4 | Pausa no lote | **Pelo cartão de ponto**, por API; até lá, o lote suspeito |
| Q5 | Faltou na pré-fabricação | **Etiqueta única** em cada peça cortada, bipada na montagem; nos kits, avisa e passa |
| Q6 | Quem acerta a pré-fabricação | **Conferência pelo bipe** na 108 e a idade em Pendências (§6) — *a confirmar* |
| Q7 | Etiqueta agora ou depois | **Agora**, junto com o corte |
| Q8 | O rolo cortado continua no saldo? | **Não**: a pré-fabricação; tecido, tubo e base baixam **no corte, por lote** (o rolo bipado, as barras), só na medida padrão |

**O que ainda espera o dono:** o desenho do §6 (Q6), a etiqueta **uma por conjunto
tubo+base** (e não uma do tubo e outra da base), e a **montagem sem as duas
etiquetas recusada** (§4).

---

## 10. Fases

| Fase | O quê | Risco |
|---|---|---|
| **1** | **O roteiro na ficha**: a etapa de cada linha da 404 e as etapas de cada modelo | 🟡 |
| **2** | **108 Preparo — corte**: tecido (bipa o rolo, baixa por lote) e tubo+base (as barras); a pré-fabricação; as etiquetas únicas; a embalagem deixa de baixar tecido, tubo e base | 🔴 (estoque, schema, regra) |
| **3** | **107 Montagem**: em lote e uma por vez, bipando as duas etiquetas; a fila da revisão com origem | 🔴 |
| **4** | **108 — kits** de comando e de instalação (contadores) e a **conferência** da pré-fabricação (§6) | 🟡 |
| **5** | **Rejeição com etapa e pessoa** (101, 104) | 🟡 |
| **6** | **O cartão de ponto** (a pausa) e os indicadores: tempo por unidade por etapa na 904 e na 905 | 🟡 |

O roteiro vem primeiro porque é ele que diz à embalagem quais linhas da ficha já
saíram no corte.

---

## 11. Onde mora

| Tela | Nº | Módulo | Bloco | Liga-se a |
|---|---|---|---|---|
| Montagem | 107 | Produção | Medida padrão | 101 Revisão, 108 Preparo, 404 |
| Preparo | 108 | Produção | Medida padrão | 401 (Corte e separação), 404, 1103 (o rolo no almoxarifado), 107, 102 |

Nenhuma aba nova; nenhum módulo novo. A caixinha da etapa (fase 1) é um campo na
linha da 404 (mesmo assunto). O número do ponto é um campo no cadastro da pessoa
(901, mesmo assunto).

## 12. Alçada

| O quê | Chave | Nível | Tela | Sensível |
|---|---|---|---|---|
| Montar persianas | `producao.montar` | Operação | 107 | não |
| Cortar tecido (baixa o rolo) | `producao.cortar_tecido` | Operação | 108 | **sim** (estoque) |
| Cortar tubo e base (baixa as barras) | `producao.cortar_tubo` | Operação | 108 | **sim** (estoque) |
| Montar kit de comando | `producao.kit_comando` | Operação | 108 | não |
| Montar kit de instalação | `producao.kit_instalacao` | Operação | 108 | não |
| Conferir a pré-fabricação, marcar perdida, corrigir sessão | `producao.corrigir` | Supervisor | 107 / 108 | **sim** |

Setores sugeridos (nascem vazios): Operador / Corte, Operador / Montagem. Tudo novo
nasce **só para o Admin Geral** (R-ALC-06), até o dono marcar.
