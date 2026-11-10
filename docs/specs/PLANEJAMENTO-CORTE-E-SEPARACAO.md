# PLANEJAMENTO-CORTE-E-SEPARACAO — a lista do que cortar e separar

> **STATUS · 10/11/2026 — RASCUNHO, as quatro perguntas respondidas pelo dono;
> falta o "pode seguir" do plano.** Nada construído. Nasceu da conversa de 10/11/2026: o dono quer, dentro do
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
| **Tubo** | largura **− 3** | só a medida — **todas as cores juntas** (linha própria) |
| **Base** | largura **− 3** | só a medida — **todas as cores juntas** (linha própria) |
| **Kit de comando** (só a corrente) | altura **− 10** | só a medida — escrito *"Kit de comando com 140 cm de altura"* |
| **Kit de instalação** | um por persiana | o total |

Exemplo do dono: 150×150 branco 30 · cinza 21 · bege 11 →

```
TECIDO          Blackout branco  147 × 165  = 30
                Blackout cinza   147 × 165  = 21
                Blackout bege    147 × 165  = 11
TUBO            147 cm                      = 62   (de todas as alturas de 150 de largura)
BASE            147 cm                      = 62
KIT DE COMANDO  com 140 cm de altura        = 62
KIT INSTALAÇÃO                              = 62
```

> ⚠️ **ONDE A REGRA MORA: NA FICHA TÉCNICA, e não no código** (o dono, 10/11/2026:
> *"sempre é o que está na ficha técnica"*). A aba **lê** a 404; quem lança as
> medidas de corte é uma pessoa, **pela tela 404** (decisão do dono: sem script).
> SKU cuja ficha não tem medida de corte aparece em "ficou fora: sem medida de
> corte na ficha" — nunca some, nunca vira zero.
>
> ⚠️ **O NOME DA LINHA NA LISTA TAMBÉM É DA FICHA**: coluna nova
> `ficha_formula.corte_rotulo` (texto, opcional), editável na 404 ao lado da
> medida de corte. É ela que faz a linha da corrente sair como *"Kit de
> comando"*; vazia, a lista usa o nome do material. Sem ela o sistema teria de
> adivinhar pelo nome do material ("começa com Corrente"), que quebra no dia em
> que alguém renomeia. Entra no `CREATE` e no `ALTER` guardado do
> `compras_schema.js` (§17). Só lida pela aba e pela 404; não entra em custo.
>
> Antes (texto do rascunho): A
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

### Divergência com o `CLAUDE.md` §7-B — RESPONDIDA

O §7-B (armadilha #19) escrevia a folga do tecido como **+20 de pé** e **+10
invertida** (a 1,80). O dono, 10/11/2026: **altura + 15 para todas as
larguras, inclusive a 1,80**. Entra no §7-B e numa linha do `DECISOES.md` no
commit da construção. A **orientação** (de pé ou deitada na bobina) continua
sendo decisão de quem corta; muda só a folga da medida de corte.

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
- Lançar as medidas de corte e o rótulo na ficha usa a 404 e a chave que já
  salva a fórmula da ficha (`modelo.cadastrar`, `POST /api/formulas`).

## 7. Perguntas ao dono — respondidas em 10/11/2026

1. Sim, +15 em todas, inclusive a 1,80. 2. Duas linhas separadas. 3. Só a
corrente, escrita "Kit de comando com N de altura". 4. Pela tela 404; a aba
lê sempre o que está na ficha técnica.

O texto original das perguntas:

1. O **+15** da altura do tecido vale para **todas** as larguras, inclusive a
   1,80 (que o §7-B diz ser cortada invertida, com +10)?
2. Tubo e base: **uma linha só** ("tubo e base 147 = 62") ou **duas**
   ("tubo 147 = 62" e "base 147 = 62")?
3. Kit de comando: a lista mostra só o **tamanho da corrente**, ou o kit
   também leva outras peças que mudam com a altura?
4. Quem lança as medidas na ficha: eu, por script (simula, mostra, grava com
   backup), ou alguém pela tela 404?

## 8. Construção (uma fase só)

1. Coluna `ficha_formula.corte_rotulo` e o campo dela na 404 (a ficha grava e
   mostra; não entra em custo). Sem script: as medidas são lançadas pela 404.
2. `corte_dominio.js` (dono único da lista): lê `aProduzir`, explode a ficha
   pela medida de corte e agrupa. Sem SQL de quantidade próprio.
3. Rota `GET /api/planejamento/corte` e a aba na 401.
4. `teste_corte_separacao.js`, escrito antes: o exemplo do dono (30/21/11 → 62),
   a soma das cores no tubo, o sob medida fora, SKU sem medida listado, o
   custo da ficha sem mexer um centavo (#18).
