# PLANEJAMENTO-CORTE-E-SEPARACAO — a lista do que cortar e separar

> **STATUS · 10/11/2026 — RASCUNHO, esperando a aprovação do dono.** Nada
> construído. Nasceu da conversa de 10/11/2026: o dono quer, dentro do
> Planejamento (401), uma aba que transforme "quantas persianas fazer" em
> "quanto tecido cortar, quantos tubos e bases, quantos kits e correntes".
> `NOVIDADE` · risco 🟡 (cálculo exibido; não mexe em estoque, saldo, etiqueta
> nem permissão).

---

## 1. O problema

A 401 diz **quantas persianas de cada SKU** faltam (aba "O que produzir"). A
bancada não trabalha por SKU: ela corta tecido, corta tubo e base, separa kit
e corrente. Hoje quem planeja faz essa conta de cabeça, e a medida de corte
mora na memória de quem corta (é a dívida "Medida de corte sem valor lançado"
do `CLAUDE.md` §7-B, e a doença do §7).

## 2. De onde sai a quantidade (decisão do dono, 10/11/2026: "1 a")

Da **falta** que a aba "O que produzir" já mostra: o `precisa` de cada SKU do
`demanda_dominio.aProduzir` — **a mesma conta** da tela azul, da TV e da
compra (#12). A aba nova **não tem conta de quantidade própria**.

- Entram só as **persianas com medida** (`modelo.exige_medida = 1`).
- **Sob medida fica fora** (o balde `SOBMEDIDA` não tem medida; §7).
- Kit, acessório e SKU sem largura ou altura ficam fora, e a tela diz quantos
  e quais ficaram fora (nunca some calado).

## 3. As regras de corte (decisão do dono, 10/11/2026)

| Material | Medida de corte | Agrupa por |
|---|---|---|
| **Tecido** | largura **− 3** × altura **+ 15** (cm) | tecido + **cor** + medida de corte |
| **Tubo** | largura **− 3** | só a medida — **todas as cores juntas** |
| **Base** | largura **− 3** | só a medida — **todas as cores juntas** |
| **Kit de comando (corrente)** | altura **− 10** | só a medida |
| **Kit de instalação** | um por persiana | o total |

Exemplo do dono: 150×150 branco 30 · cinza 21 · bege 11 →

```
TECIDO          Blackout branco  147 × 165  = 30
                Blackout cinza   147 × 165  = 21
                Blackout bege    147 × 165  = 11
TUBO E BASE     147 cm                      = 62   (de todas as alturas de 150 de largura)
CORRENTE        140 cm                      = 62
KIT INSTALAÇÃO                              = 62
```

> ⚠️ **ONDE A REGRA MORA: NA FICHA DO MODELO ROLÔ, e não no código.** A
> `ficha_formula` já tem `corte_largura` e `corte_altura` desde 04/09/2026
> (armadilha #18), vazias até hoje. A construção lança nelas as expressões
> acima (`largura - 3`, `altura + 15`, `altura - 10`) nas linhas do tecido, do
> tubo, da base e da corrente, e a aba lê a medida pelo
> `ficha_dominio.medidaDeCorte` — a mesma que a ficha mostra na 404. Mudar uma
> folga depois é editar a ficha na 404, sem código.
>
> ⚠️ **A MEDIDA DE CORTE NÃO MEXE EM CUSTO** (#18): o consumo continua sendo a
> `expressao` de cada linha (o tubo consome a largura inteira, o tecido
> `(altura+20)/200`, a corrente `(2×altura−20)/100`). A corrente bate com a
> regra do dono: um laço de **altura − 10** de cada lado consome
> 2 × (altura − 10).

### Divergência com o `CLAUDE.md` §7-B — a confirmar com o dono

O §7-B (armadilha #19) escreve a folga do tecido como **+20 de pé** e **+10
invertida** (a 1,80, cortada deitada). O dono disse em 10/11/2026: **altura +
15, sempre**. Pergunta da §7: o +15 vale para todas as larguras, inclusive a
1,80? Aprovada a resposta, ela entra no §7-B e numa linha do `DECISOES.md`, no
mesmo commit da construção.

## 4. A tela

Aba nova **"Corte e separação"** na 401, ao lado de "O que produzir", no
estilo das outras (hash `#corte`). Só quantidade (decisão do dono: "5 só a
quantidade") — sem estoque de material, sem custo, sem fornecedor.

- Quatro blocos, cada um uma lista: Tecido · Tubo e base · Kit de comando
  (corrente) · Kit de instalação. Ordenados pela medida, e o tecido pela cor.
- Cada linha diz de **quais SKUs** veio (aberto num toque), para quem
  confere.
- Um botão **Imprimir** (a folha para a bancada).
- Embaixo, os SKUs que ficaram fora e por quê (sem medida, sem ficha de
  corte, sob medida).
- A aba se atualiza junto com "O que produzir" (os dois leem a mesma falta).

## 5. O que fica de fora

- Estoque de tubo, base, kit e corrente (decisão "5"); a compra continua na 501.
- Encaixe dos cortes na bobina (quantas peças por faixa, de pé ou invertida):
  é a armadilha #19, decisão de quem corta.
- Baixa de material, etapas de produção e o kit de comando como estoque: é a
  `PRODUCAO-MAPA-E-MOTOR.md`, que continua planejada.
- O sob medida (tem o plano de corte dele, `/sobmedida/corte`).

## 6. Alçada

- **Telas novas: nenhuma** — é uma aba da 401 Planejamento (nível Admin), que
  já existe.
- **Ações novas: nenhuma.** A rota nova de leitura
  (`GET /api/planejamento/corte`) cai na linha `pre('/api/planejamento')` →
  `@admin`, a mesma da 401.
- **Setores novos: nenhum.**
- Lançar as medidas de corte na ficha usa a 404 (`ficha.editar`), que já
  existe, ou um script com simulação e backup.

## 7. Perguntas ao dono

1. O **+15** da altura do tecido vale para **todas** as larguras, inclusive a
   1,80 (que o §7-B diz ser cortada invertida, com +10)?
2. Tubo e base: **uma linha só** ("tubo e base 147 = 62") ou **duas**
   ("tubo 147 = 62" e "base 147 = 62")?
3. Kit de comando: a lista mostra só o **tamanho da corrente**, ou o kit
   também leva outras peças que mudam com a altura?
4. Quem lança as medidas na ficha: eu, por script (simula, mostra, grava com
   backup), ou alguém pela tela 404?

## 8. Construção (uma fase só)

1. Script `lancar_corte_ficha.js`: simula e `--aplicar` lança as quatro
   medidas de corte na ficha do Rolô, com backup; não toca na `expressao`.
2. `corte_dominio.js` (dono único da lista): lê `aProduzir`, explode a ficha
   pela medida de corte e agrupa. Sem SQL de quantidade próprio.
3. Rota `GET /api/planejamento/corte` e a aba na 401.
4. `teste_corte_separacao.js`, escrito antes: o exemplo do dono (30/21/11 → 62),
   a soma das cores no tubo, o sob medida fora, SKU sem medida listado, o
   custo da ficha sem mexer um centavo (#18).
