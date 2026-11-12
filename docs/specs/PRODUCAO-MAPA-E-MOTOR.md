> **STATUS · 12/11/2026 — RASCUNHO v2, espera a aprovação do dono** · nada construído
> Reescrita sobre o processo que o dono descreveu em 11/11/2026. A versão de
> 17/08/2026 está em `docs/arquivo/PRODUCAO-MAPA-E-MOTOR-v1.md` (histórico, não é
> regra). Absorve a `PRODUCAO-MONTAGEM.md` (a montagem é a fase 1 daqui).

# Produção da medida padrão — o mapa e o motor de etapas

> O dono, 11/11/2026: *"o medida padrão é uma produção em série, onde deixamos
> muitas coisas já meio que preparadas apenas para a montagem. Se for usar seria o
> mapa motor no medida padrão, é disso que precisamos."* E: *"isso está totalmente
> ligado à ficha técnica, onde cada ficha técnica segue um processo produtivo."*

---

## 1. O processo como funciona hoje

```
  PREPARO EM LOTE (para estoque intermediário)        A PERSIANA
  ─────────────────────────────────────────────       ───────────────────────────
  1. Corte de tecido ───────┐
  2. Corte de tubo e base ──┴──────────────────▶  5. MONTAGEM  (consome 1 + 2)
  3. Kit de comando  ─────────┐                          ▼
  4. Kit de instalação ───────┤                    6. REVISÃO      ← já existe (101)
                              └──────────────────▶ 7. EMBALAGEM    ← já existe (102)
                                                     (consome 3 + 4)
                                                          ▼
                                                    8. ESTOQUE (+1) ← já existe
```

**O que o sistema já mede:** a revisão (6) e a embalagem (7), com quem fez e o
tempo. **O que ele não mede:** nada das etapas 1 a 5. Ninguém sabe quanto tecido
cortado está esperando a montagem, quanto tempo leva montar, nem quem montou a peça
que a revisão rejeitou.

**O que o sistema já sabe e esta spec aproveita:**
- **o que cortar** — a aba Corte e separação da 401 (`corte_dominio.js`), pela ficha
  e pela falta do planejamento;
- **o que cada persiana usa** — a ficha da 404, com a medida de corte;
- **o material sai do saldo na embalagem** (decidido em 11/11/2026, §24 do CLAUDE.md).
  Esta spec **não muda isso**: o preparo e a montagem não baixam material.

---

## 2. A ideia: o mesmo motor para todas as etapas, como no sob medida

O sob medida já tem uma bancada que funciona: setores, um bipe que inicia e outro
que termina, a fila de cada setor, quem fez, o tempo, e a recusa que volta para o
culpado (§19, R-SMB e R-SMX). **A diferença é de natureza**: lá cada peça é de um
pedido e tem a sua etiqueta; aqui a fábrica prepara **em lote, para estoque**,
antes de existir a venda.

Por isso o motor da medida padrão é **"etapa em lote que alimenta um estoque
intermediário"**:

| Cada etapa diz | Exemplo — corte de tubo e base |
|---|---|
| o que **produz** | tubo + base na medida de corte (ex.: 157 cm) |
| em que **estoque intermediário** isso fica | "Tubo e base cortados", por medida |
| o que **consome** do intermediário de antes | nada (é a primeira) |
| se trabalha **em lote** | sim: bipa início, faz N, bipa fim com a quantidade |
| a **chave** de quem faz | `producao.cortar_tubo` |

E **o roteiro é da ficha** (a frase do dono): cada modelo diz por quais etapas a
persiana passa, e **cada linha da ficha diz em que etapa o material é preparado** —
o tecido no corte de tecido, o tubo e a base no corte de tubo, a corrente e o
comando no kit de comando, parafuso e bucha no kit de instalação. É uma caixinha a
mais na linha da 404, como a "vai para o planejamento" de 10/11.

---

## 3. O estoque intermediário (o "pronto para montar")

Hoje ele mora na bancada e na cabeça de quem corta. A spec o põe no sistema como
**um contador por item preparado**, que:

- **sobe** quando a etapa de preparo fecha a sessão (o "fiz 12");
- **desce** quando a etapa seguinte consome (a montagem fecha 6 persianas → 6
  tecidos e 6 tubos+bases saem; a embalagem fecha → 1 kit de comando e 1 de
  instalação saem);
- **nunca trava** a etapa seguinte: faltou no contador, a montagem passa e o
  contador fica **negativo, com aviso** (a #6: trava que dispara no caso normal vira
  desvio). Negativo é sinal de que alguém preparou sem bipar;
- **não é saldo de material** (o material continua saindo na embalagem, pela ficha):
  é só "quantas peças preparadas estão esperando".

> **A pergunta que decide o desenho (Q2):** o tecido cortado conta por **SKU**
> (tecido do BK160140BEGE) ou pela **cor e medida de corte**? O tubo e a base
> servem a qualquer cor da mesma largura. A sugestão é a régua que a aba Corte e
> separação já usa — **material + medida de corte** —, uma régua só.

---

## 4. A montagem (etapa 5) — a primeira, e a que mais falta

Tela nova **107 Montagem** (tablet), no jeito da revisão: bipa o SKU, monta N
peças, bipa o fim com a quantidade. Grava quem, quando, o tempo e a quantidade
(`quem.js`). Fecha consumindo o tecido cortado e o tubo+base do contador.

**O que ela entrega sozinha:** o tempo de montagem por SKU e por pessoa (hoje
desconhecido) e a origem da fila da revisão.

> ⚠️ **A rota `/montagem` já é a Embalagem (102)** e não muda (é o que os tablets
> guardaram). A tela nova tem endereço próprio (`/montagem-persiana`).

---

## 5. O preparo em lote (etapas 1 a 4) — uma tela só

Tela nova **108 Preparo** (tablet), com as etapas que a pessoa tem chave: corte de
tecido, corte de tubo e base, kit de comando, kit de instalação. Bipa início
(escolhendo o item, da lista do que falta), faz N, bipa fim com a quantidade.

- **A lista do que fazer é a da aba Corte e separação** (a 401 já calcula), menos o
  que já está no contador. Nada de conta nova (#12).
- **A embalagem já confere o kit de instalação** (o bipe do kit, R-EMB-01): fechar a
  embalagem passa a descer o contador do kit também.

---

## 6. Rejeição com dono (a recusa do sob medida)

A revisão (101) já registra a peça com problema. Com o motor, o motivo **aponta a
etapa**: tecido → corte de tecido, tubo → corte de tubo, montagem → montagem. Sem
etiqueta por peça, o sistema sabe **a etapa e o lote mais provável** (a última
sessão daquele SKU), **não a pessoa certa** — e diz isso. Com etiqueta de lote
(fase 5), ele sabe a pessoa.

---

## 7. Fases

| Fase | O quê | Risco |
|---|---|---|
| **1** | Motor + **107 Montagem**: sessão, quantidade, tempo, quem; a fila da revisão passa a ter origem | 🟡 |
| **2** | **108 Preparo** (etapas 1 a 4) e o **contador do intermediário**, ligado à aba Corte e separação; a montagem e a embalagem descem o contador | 🔴 (schema) |
| **3** | **O roteiro na ficha**: a etapa de cada linha da 404 e as etapas de cada modelo | 🟡 |
| **4** | **Rejeição com etapa**: o motivo da revisão aponta a etapa; a 104 mostra por etapa | 🟡 |
| **5** | **Etiqueta de lote** (Zebra, como a do kit) no tecido cortado e no tubo+base: a montagem bipa, e a rejeição ganha a pessoa | 🔴 |
| **6** | Indicadores: tempo por unidade por etapa na 904 (Por pessoa) e na 905 | 🟡 |

Cada fase entrega valor sozinha. A fase 1 mede o buraco de hoje (a montagem).

---

## 8. Perguntas para o dono

| # | Pergunta | Trava |
|---|---|---|
| Q1 | A montagem é **em lote do mesmo SKU** (bipa o SKU, monta 6, bipa o fim) ou uma peça por vez? | 1 |
| Q2 | O tecido cortado conta por **SKU** ou por **cor + medida de corte**? (sugestão: a régua da aba Corte e separação) | 2 |
| Q3 | Kit de comando: é **um só** ou varia (corrente pela altura, lado)? E o kit de instalação é sempre o mesmo? | 2 |
| Q4 | Pausa dentro da sessão (almoço)? Ou vale o limite de bipe suspeito do sob medida (R-SMI-01)? | 1 |
| Q5 | Faltou no contador: **avisa e passa** (sugestão, #6) ou trava? | 2 |
| Q6 | Quem conta o estoque intermediário quando ele não bater? Entra no Inventário, ou basta corrigir na tela com motivo? | 2 |
| Q7 | Etiqueta de lote: agora (fase 5) ou só depois de as fases 1 a 4 rodarem um tempo? | 5 |
| Q8 | O material continua saindo **só na embalagem** (decidido em 11/11). Consequência: o rolo cortado e ainda não montado continua contando no saldo de tecido. Fica assim? | — |

---

## 9. Onde mora

| Tela | Nº | Módulo | Bloco | Liga-se a |
|---|---|---|---|---|
| Montagem | 107 | Produção | Medida padrão | 101 Revisão, 108 Preparo, 404, 401 |
| Preparo | 108 | Produção | Medida padrão | 401 (Corte e separação), 404, 107, 102 |

Nenhuma aba nova; nenhum módulo novo. A caixinha da etapa (fase 3) é um campo na
linha da 404 (mesmo assunto da tela).

## 10. Alçada

| O quê | Chave | Nível | Tela | Sensível |
|---|---|---|---|---|
| Montar persianas | `producao.montar` | Operação | 107 | não |
| Cortar tecido | `producao.cortar_tecido` | Operação | 108 | não |
| Cortar tubo e base | `producao.cortar_tubo` | Operação | 108 | não |
| Montar kit de comando | `producao.kit_comando` | Operação | 108 | não |
| Montar kit de instalação | `producao.kit_instalacao` | Operação | 108 | não |
| Corrigir sessão ou contador | `producao.corrigir` | Supervisor | 107 / 108 | **sim** |

Setores sugeridos (nascem vazios): Operador / Montagem, Operador / Preparo. Tudo
novo nasce **só para o Admin Geral** (R-ALC-06), até o dono marcar.
