# PLANEJAMENTO-CORTE-E-SEPARACAO — a lista do que cortar e separar

> **STATUS · 10/11/2026 — EM CÓDIGO, falta subir** (branch
> `claude/peaceful-mendel-r69tw0`). A aba "Corte e separação" na 401, a caixinha
> "vai para o planejamento da produção" na 404 (`ficha_formula.planejamento`), o
> `corte_dominio.js` e o `teste_corte_separacao.js` (32). A ③ REVISÃO achou 5
> defeitos (todos confirmados e consertados, com teste) e o testador de tela 3
> pequenos de tela (consertados). **Mudou na construção, com o dono:** a folga do
> tecido ficou +15 e **+10 na 1,80** (duas de 165 não cabem na 3,20); o nome na
> lista é o do cadastro de material; o bloco agrupa pelo material (dois modelos
> com o mesmo tubo somam). **Falta:** o deploy; lançar na 404 as medidas de
> corte e marcar as linhas; e a prova com dado real — a lista batendo com o que
> a bancada corta. `NOVIDADE` · risco 🔴 (uma coluna nova na ficha).
---

## 1. O problema

A 401 diz **quantas persianas de cada SKU** faltam (aba "O que produzir"). A
bancada não trabalha por SKU: ela corta tecido, corta tubo e base, separa kit de
comando e kit de instalação. Hoje quem planeja faz essa conta de cabeça, e a
medida de corte mora na memória de quem corta (a dívida "Medida de corte sem
valor lançado" do `CLAUDE.md` §7-B, e a doença do §7).

## 2. De onde sai a quantidade de persianas (decisão do dono: "1 a")

Da **falta** que a aba "O que produzir" já mostra: o `precisa` de cada SKU do
`demanda_dominio.aProduzir` — **a mesma conta** da tela azul, da TV e da
compra (#12). A aba nova **não tem conta de quantidade própria**.

- Entram as **persianas do Mercado Livre** (SKU do cadastro com medida,
  `modelo.exige_medida = 1`).
- **Sob medida fica fora** (não tem medida; tem o plano de corte dele).
- Kit, acessório e SKU sem medida ficam fora, e a tela diz quais (nunca some
  calado).

## 3. A ficha técnica decide (o dono, 10/11/2026: *"sempre é o que está na ficha técnica"*)

### 3.1 A caixinha nova na ficha (tela 404)

Cada linha da ficha ganha **"Vai para o planejamento da produção"** (sim/não,
nasce **não**). Só as linhas marcadas aparecem na aba. Quem marca e quem lança a
medida de corte é uma pessoa, **pela 404**, com a chave que já salva a fórmula
da ficha (`modelo.cadastrar`). Nada é lançado por script.

> Coluna `ficha_formula.planejamento INTEGER DEFAULT 0`, no `CREATE` e no
> `ALTER` guardado do `compras_schema.js` (§17). **Não entra em custo nem em
> compra** — só a aba a lê.

### 3.2 Uma regra só de agrupar: o MATERIAL e a MEDIDA DE CORTE

A aba junta as persianas pelo **material da linha** e pela **medida de corte**
(`corte_largura`/`corte_altura`, as colunas que a ficha já tem desde a
armadilha #18). É essa regra única que dá exatamente o que o dono pediu, sem
regra escrita por tipo:

| Linha da ficha | Por que agrupa assim |
|---|---|
| **Tecido** | aponta a **família**; a cor do SKU escolhe o tecido. Branco, cinza e bege são materiais diferentes → **uma linha por cor e medida** |
| **Tubo** | o mesmo material para todas as cores → **todas as cores juntas** por medida |
| **Base** | idem → **todas as cores juntas** por medida, em linha própria |
| **Kit de comando** (a corrente) | o mesmo material → **junta todas com a mesma medida** |
| **Kit de instalação** | sem medida de corte → **soma de todas as persianas do ML** (1 por persiana, pela fórmula da linha) |

A quantidade na lista é em **peças** (uma por persiana); na linha sem medida de
corte, é a fórmula da linha × persianas, na unidade dela (kit `1` → 62 kits).

> ⚠️ **Se o tubo um dia tiver uma cor própria** (um material diferente por cor),
> a aba separa por cor sozinha — porque são materiais diferentes. Isso está
> certo: quem decide é a ficha, não o código.

### 3.3 As medidas de corte que o dono deu (lançadas pela 404)

| Linha | Medida de corte |
|---|---|
| Tecido | largura **− 3** × altura **+ 15**, e **+ 10 na 1,80** — na ficha: `altura + 15 - 5 * piso(largura / 180)` |
| Tubo | largura **− 3** |
| Base | largura **− 3** |
| Kit de comando (corrente) | altura **− 10** |

Exemplo do dono (150×150: branco 30 · cinza 21 · bege 11):

```
TECIDO     Blackout branco               147 × 165 cm   30
           Blackout cinza                147 × 165 cm   21
           Blackout bege                 147 × 165 cm   11
           Tubo 32 mm                    147 cm         62
           Base redonda                  147 cm         62
           Corrente (kit de comando)     140 cm         62
           Kit de instalação                            62
```

> ⚠️ **O NOME QUE APARECE É O DO MATERIAL NO CADASTRO** (decisão do dono). Para
> a lista dizer "Kit de comando", renomeia-se o material na 501.
>
> ⚠️ **A MEDIDA DE CORTE NÃO MEXE EM CUSTO** (#18): o consumo continua sendo a
> `expressao` de cada linha. A corrente bate com a regra do dono: um laço de
> altura − 10 de cada lado consome `(2 × altura − 20)`, que é a fórmula de hoje.
>
> ⚠️ **LINHA MARCADA SEM MEDIDA DE CORTE** que deveria ter (o tecido, o tubo):
> aparece somada sem medida, que é o que a ficha diz. A tela marca em âmbar
> "sem medida de corte" para quem lança ver.

### Muda o `CLAUDE.md` §7-B

O §7-B (armadilha #19) escrevia a folga do tecido como **+20 de pé** e **+10
deitada** (a 1,80). O dono, 10/11/2026: **altura + 15, e + 10 na 1,80** (primeiro
disse "+15 em todas"; avisado de que duas peças de 165 não cabem na bobina de
3,20, manteve o +10 da 1,80). Entra no §7-B e numa linha do `DECISOES.md` no commit da construção. A
**orientação** na bobina continua sendo decisão de quem corta.

## 4. A tela

Aba nova **"Corte e separação"** na 401 (hash `#corte`), no estilo das outras.
Só quantidade (decisão do dono): sem estoque de material, custo ou fornecedor.

- A lista agrupada por material, o tecido por cor, ordenada pela medida.
- Cada linha abre e mostra de **quais SKUs** veio.
- Botão **Imprimir** (a folha para a bancada).
- Embaixo: os SKUs que ficaram fora e por quê (sob medida, sem medida, sem
  ficha, nenhuma linha marcada).

## 5. O que fica de fora

- Estoque de material e compra (continua na 501).
- Encaixe dos cortes na bobina (armadilha #19, decisão de quem corta).
- Baixa de material e etapas de produção (`PRODUCAO-MAPA-E-MOTOR.md`).
- O sob medida.

## 6. Alçada

- **Telas novas: nenhuma** — aba da 401 Planejamento (nível Admin).
- **Ações novas: nenhuma.** `GET /api/planejamento/corte` cai em
  `pre('/api/planejamento')` → `@admin`; a caixinha da ficha grava pela rota que
  já salva a fórmula (`POST /api/formulas`, `modelo.cadastrar`).
- **Setores novos: nenhum.**

## 7. Perguntas ao dono — todas respondidas (10/11/2026)

- O nome na lista é **o nome do material no cadastro** (o dono: *"deve buscar o
  nome do cadastro de material"*). Para sair "Kit de comando", renomeia-se o
  material na 501. Sem campo extra na ficha.
- Antes: a falta da "O que produzir" (1a); medida de corte (2b); tubo e base
  pela largura, em linhas separadas; kit de comando é só a corrente; só
  quantidade; a lista lê sempre a ficha técnica (404), pela caixinha.

## 8. Construção (uma fase só)

1. Coluna `ficha_formula.planejamento` e a caixinha na 404, gravada pela rota
   da fórmula.
2. `corte_dominio.js` (dono único da lista): lê `aProduzir`, explode as linhas
   marcadas pela ficha (`ficha_dominio`, que já resolve o tecido pela cor) e
   agrupa por material + medida de corte. Sem SQL de quantidade próprio.
3. Rota `GET /api/planejamento/corte` e a aba na 401.
4. `teste_corte_separacao.js`, escrito antes: o exemplo do dono (30/21/11 →
   62), as cores juntas no tubo e na base, o tecido separado por cor, o kit de
   instalação somando todas, linha não marcada fora, sob medida fora, e o custo
   da ficha sem mexer um centavo (#18).
