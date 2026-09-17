> **ARQUIVADO · 17/09/2026** — implementado a partir de 28/08/2026 e substituído por
> `tecido/README.md`, que é a fonte da verdade do módulo sob medida. Várias regras
> abaixo mudaram na construção: o módulo vive **dentro do PCP** (`/sobmedida`, mesmo
> PIN), tem custo e valor em R$, etiqueta impressa pelo sistema, sem emenda, tom único
> por pedido e um rolo por nível. Movido do Projeto "PCP - Deccorar".

---

# Estoque de Tecido e Sobras

> Módulo **independente** do Mercado Livre. Controla o tecido em rolo da operação
> **sob medida**, cataloga as sobras, e **calcula o plano de corte de melhor
> aproveitamento**.
> **Data:** 19/08/2026 · **Status:** regras fechadas · nada implementado

---

## 1. O que este módulo é

```
1.  Quanto eu tenho do tecido X?     →  saldo em metro, por rolo, com endereço
2.  Que sobras eu tenho do tecido X? →  lista com medida, condição e endereço
3.  Estas medidas que vou cortar — COMO CORTAR?
        de qual bobina, com as peças encaixadas lado a lado,
        procurando primeiro nas sobras, e dizendo o que vai sobrar
```

A pergunta 3 deixou de ser consulta e virou **plano de corte**. É ela que define o
módulo.

### Dois estoques, dois endereçamentos

Mesmo galpão, lugares físicos diferentes. Rolo **fechado** e **aberto** dividem o
armazém `ROLO`; a sobra tem o armazém `SOBRA`. Cada um com sua árvore
haste → andar → nível, tudo cadastro livre, **nenhuma quantidade decidida no código**.

---

## 2. Como o corte funciona de verdade

Esta é a mecânica que muda tudo. **A largura da peça é cortada no sentido da largura
da bobina; a altura da peça é o que corre no rolo.**

```
3 peças de 0,90 × 2,50          Σ das larguras = 2,70

  BOBINA 3,00                BOBINA 2,50               BOBINA 2,00
  ┌───┬───┬───┬─┐            ┌───┬───┬────┐            ┌───┬───┬┐
  │0,9│0,9│0,9│▓│ 2,50       │0,9│0,9│▓▓▓▓│ 2,50       │0,9│0,9│▓ 2,50
  └───┴───┴───┴─┘            ├───┼───┴────┤            ├───┼───┴┤
        resto 0,30           │0,9│▓▓▓▓▓▓▓▓│ 2,50       │0,9│▓▓▓▓│ 2,50
                             └───┴────────┘            └───┴────┘

  puxa 2,50 m                puxa 5,00 m               puxa 5,00 m
  = 7,50 m²                  = 12,50 m²                = 10,00 m²
```

**A bobina de 3,00 vence** — as três peças cabem lado a lado numa puxada só. E repare
que a de 2,00 bate a de 2,50: **bobina mais estreita pode aproveitar melhor**, então o
sistema simula todas as larguras disponíveis, nunca escolhe a mais larga por padrão.

Quando a bobina ideal não existe no estoque, o sistema **readequa nas larguras que
existem** e mostra o melhor plano possível.

### O vocabulário

| Termo | O que é |
|---|---|
| **Faixa** | uma puxada do rolo. Largura = largura da bobina. Altura = a maior altura das peças que ela carrega |
| **Encaixe** | as peças posicionadas lado a lado dentro da faixa |
| **Tira lateral** | o que resta da largura da faixa depois das peças |
| **Resto de pé** | o que resta embaixo de uma peça mais baixa que a faixa |
| **Consumo** | Σ das alturas das faixas, em metro linear — é o que baixa do rolo |

---

## 3. As regras do plano de corte

**Alturas diferentes podem dividir a mesma faixa.** A faixa puxa a **maior altura** do
grupo, e a peça mais baixa deixa um resto de pé.

```
┌──────┬──────┬────┐
│ 0,90 │ 0,90 │▓▓▓▓│   ← faixa de altura 2,50
│ 2,50 │ 1,80 │    │
│      ├──────┤    │
│      │▓▓▓▓▓▓│    │   ← resto de pé: 0,90 × 0,70
└──────┴──────┴────┘
                ▲
          tira lateral
```

**A mesma sobra atende várias peças.** Uma sobra de 1,90 × 2,60 acomoda duas peças de
0,90 × 2,50 lado a lado — mesmo encaixe do rolo, dentro do retângulo do retalho.

**Todo resto com largura ≥ 80 cm vira sobra com etiqueta.** Abaixo disso é refugo
registrado. Os 80 cm valem **só para a largura** — altura não tem mínimo. O valor é
parâmetro cadastrável.

> **Isto revoga a regra antiga "sobra não gera sobra".** A regra passa a ser uma só,
> válida para as duas origens: *resto com largura ≥ mínimo vira sobra, venha do rolo ou
> de outra sobra.* Era inconsistente manter o resto do rolo virando sobra e o resto de
> uma sobra indo pro lixo — e a sua regra dos 80 cm resolve os dois casos com o mesmo
> número.

### O critério — menor desperdício real

```
desperdício  =  m² consumidos
              − m² das peças
              − ( m² das sobras geradas  ×  PESO_SOBRA )
```

`PESO_SOBRA = 50%`, **cadastrável**. É a única variável de julgamento do módulo, e ela
responde a uma pergunta de fábrica: *o retalho que vai pra prateleira volta a ser
usado, ou encalha?* Metade é o palpite honesto de quem ainda não tem histórico. Depois
de alguns meses o relatório de encalhe responde melhor que qualquer chute — e mudar é
um campo, não uma linha de código.

Aplicado ao exemplo, com 80 cm de largura mínima:

```
                  consumo    peças   resto ≥80cm   creditado 50%   DESPERDÍCIO
BOBINA 3,00        7,50      6,75    —                 —             0,75  ← vence
BOBINA 2,50       12,50      6,75    1,60×2,50       2,00            3,75
BOBINA 2,00       10,00      6,75    1,10×2,50       1,375           1,875
```

---

## 4. O que o sistema entrega ao operador

Não é uma lista de "tem/não tem". É o **plano**:

```
┌──────────────────────────────────────────────────────────────────────┐
│  PLANO DE CORTE — Rolô · 3% · Bege            3 peças · 6,75 m²      │
├──────────────────────────────────────────────────────────────────────┤
│  ▸ SOBRA   S-0142   1,90 × 2,60      SOBRA · C-01-04                 │
│      ┌──────┬──────┬┐                                                │
│      │ 0,90 │ 0,90 ││   peças 1 e 2                                  │
│      │ 2,50 │ 2,50 ││                                                │
│      └──────┴──────┴┘   resto 0,10 → refugo                          │
│                                                                      │
│  ▸ ROLO    R-000087  bobina 3,00 · aberto 12,4 m   ROLO · A-02-03    │
│      ┌──────┬───────────┐                                            │
│      │ 0,90 │▓▓▓▓▓▓▓▓▓▓▓│   peça 3 · puxar 2,50 m                    │
│      │ 2,50 │           │                                            │
│      └──────┴───────────┘   resto 2,10 × 2,50  →  NOVA SOBRA         │
│                                cole a etiqueta e confirme            │
├──────────────────────────────────────────────────────────────────────┤
│  consumo 2,50 m · desperdício 0,00 m²      [ Imprimir ] [ Confirmar ]│
└──────────────────────────────────────────────────────────────────────┘
```

Quatro coisas que essa tela faz de propósito:

**Desenha o encaixe.** O operador vê onde cada peça vai na bobina, não só de onde tirar.

**Anuncia a sobra que vai nascer.** *"resto 2,10 × 2,50 → nova sobra, cole a
etiqueta"*. O cadastro da sobra deixa de ser uma tela separada que alguém esquece de
preencher — ele acontece dentro do Confirmar, com a medida já calculada. **Isso fecha o
ciclo sozinho** e é o ponto onde o módulo passa a se manter em dia sem disciplina.

**Sobra antes de rolo, sempre.** É a política da casa, e a única razão de o operador
descer à outra prateleira.

**Só baixa no Confirmar.** O plano é proposta. O operador pode recusar uma sobra
sugerida com um motivo (§5) e o sistema recalcula.

---

## 5. A recusa com motivo

O operador vê o que o cadastro não vê: tom, brilho, textura. Cada sobra sugerida tem
"não usar" a um clique, com motivo escolhido de um **cadastro** — não de uma lista fixa
no código:

```
Tonalidade diferente · Defeito não cadastrado · Textura / brilho diferente
Peça do mesmo pedido — tom único · Outro
```

Recusada, a sobra volta ao estoque sem baixa e o **plano é recalculado sem ela**.

> Cada recusa fica gravada. Em três meses o relatório diz onde o reaproveitamento
> trava: se "tonalidade" dominar, a resposta é registrar o tom no cadastro da sobra; se
> for "defeito não cadastrado", o problema está no lançamento na bancada. **O motivo
> não é burocracia — é o diagnóstico.**

---

## 6. Cadastro de tecido — linha, abertura, cor

```
LINHA           ABERTURA        COR
Rolô            1%              Bege · Branco · Cinza · Preto
                3%              Bege · Branco · Cinza · Preto
                5%              …
```

Os três níveis são cadastros livres. Na tela de corte isso vira **três fileiras de
botões** — três toques e o tecido está escolhido. Abertura nova cadastrada vira botão
novo, sem programador.

**A largura da bobina não é do tecido — é do rolo.** O mesmo Rolô 3% Bege existe em
2,00, 2,50 e 3,00 de largura, e é justamente essa diferença que o plano de corte
explora. O tecido guarda uma largura padrão só como sugestão na entrada.

---

## 7. O rolo

| Regra | Definição |
|---|---|
| Identidade | Código único (`R-000087`) dado na entrada |
| Unidade | **Metro linear.** A largura da bobina fica no rolo |
| Consumo | **A altura da faixa**, não a área |
| Status | `fechado` → `aberto` no primeiro consumo → `encerrado` |
| Saldo inicial | Da nota fiscal — hoje não há como conferir |
| m² | Derivado: `saldo × largura` |

### O acerto no fim do rolo

O operador marca "rolo acabou"; o sistema encerra e grava a diferença como ajuste. Sem
isso o saldo infla mês a mês com metros que nunca existiram.

---

## 8. A sobra

Etiqueta **sequencial pré-impressa** (`S-000142`) — não há impressora na bancada. O
cortador cola, bipa e declara o que aquele código passa a ser. Código colado e não
cadastrado aparece numa lista de pendência.

| Campo | Obrigatório |
|---|---|
| Código da etiqueta · tecido · largura × altura | sim |
| Condição — íntegra · mancha · furo · tom fora · borda | sim |
| Endereço no armazém SOBRA | sim |
| Data, quem cadastrou, área, dias parada | automático |
| Rolo de origem | opcional |

Estados: `disponivel → usada` ou `disponivel → descartada`. Não existe reserva.

---

## 9. Os números que o módulo entrega

```
┌──────────────────────────────────────────────────────────────────────┐
│  ESTOQUE — Linha Rolô                                                │
├──────────────────────────────────────────────────────────────────────┤
│  3%  Bege     34,0 m · 1 aberto + 2 fechados · 12 sobras · 18,4 m²   │
│  3%  Branco   12,5 m · 1 aberto              ·  4 sobras ·  6,1 m²   │
│  3%  Cinza     0,0 m                         ·  7 sobras ·  9,2 m²   │
│  1%  Bege     48,0 m · 3 fechados            ·  2 sobras ·  3,0 m²   │
│                  ▲                                                   │
│      Cinza sem rolo, com 9,2 m² de retalho — é este cruzamento       │
│      que evita comprar tecido que já está na prateleira              │
└──────────────────────────────────────────────────────────────────────┘
```

**Sobras totalizadas em m² por tipo e cor** é o número que você pediu, e ele é a
coluna da direita. Cinco relatórios: saldo por item · **sobras por item em m²** ·
encalhe (dias parada) · refugo (m² por mês e motivo) · recusas.

---

## 10. Ordem de construção

```
1.  Cadastros — linha/abertura/cor · armazéns e endereços · motivos · parâmetros
2.  Cadastro de sobra + MUTIRÃO do acervo parado        ◀── começa aqui
3.  Plano de corte, só nas sobras, digitação manual
4.  Rolo: entrada, saldo, acerto no fim
5.  Plano de corte completo: encaixe nas bobinas + recusa + sobra gerada
6.  Painel e relatórios
7.  Upload do arquivo da etiqueta de corte
```

A Fase 2 é o primeiro valor real e não depende do rolo. O upload fica por último de
propósito: ele acelera uma tela que precisa existir e funcionar primeiro.

---

## 11. Pendências

| # | Pergunta | Impacto |
|---|---|---|
| 1 | **Existe margem entre peças no corte?** (2 cm de folga entre uma peça e outra, borda da bobina) | Muda todo o encaixe. Se existir e for ignorada, o plano promete o que não cabe |
| 2 | Um exemplar do arquivo da etiqueta de corte | Necessário para a Fase 7 |
| 3 | Quem pode descartar uma sobra? | Baixa sem trava é o furo clássico de inventário |
| 4 | Sobra com defeito parcial entra no plano? | Mancha num canto — serve para corte menor |
| 5 | Leitor de código de barras na bancada? | Sem ele o operador digita o código |

**Decidido pelo desenho, revisável a qualquer momento:** `PESO_SOBRA = 50%` e
`LARGURA_MINIMA_SOBRA = 80 cm`, ambos cadastráveis.

**Fase 2, fora deste escopo:** integração automática com o ERP, bloqueio duro no corte,
e junção com o estoque do Mercado Livre.
