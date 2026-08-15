# Design do Sistema — PCP Deccorar

> Especificação visual e de interação.
> **Data:** 14/08/2026

---

## 1. Dois contextos, dois sistemas visuais

O mesmo produto atende situações opostas. Tratá-las igual é o erro que estamos
corrigindo.

| | **Operação** | **Admin** |
|---|---|---|
| Onde | Chão de fábrica | Escritório |
| Aparelho | iPad 8" na bancada | MacBook / desktop |
| Luz | Natural forte + lâmpada branca de inspeção | Controlada |
| Postura | Em pé, peça na mão | Sentado |
| Entrada | Leitor de código de barras | Teclado e mouse |
| Atenção | Dividida com o trabalho físico | Concentrada |
| Fundo | **Claro** | **Escuro** |
| Densidade | Uma coisa por vez | Muitos números juntos |

### Por que o fundo muda

As telas de operação são usadas sob luz natural forte, com uma lâmpada branca ao
lado para inspecionar o tecido da persiana. **Tela escura nesse ambiente vira
espelho** — o operador enxerga o próprio reflexo em vez da informação. E o iPad
fica num suporte, em ângulo variável, o que piora o reflexo.

Fundo claro com texto escuro é o padrão de sinalização industrial pelo mesmo
motivo. O admin mantém o escuro: ambiente controlado, e é a estética certa para
dashboard com gráficos.

---

## 2. Cores

### Semáforo de estado (os dois contextos)

As três cores dos modos de revisão são mantidas — elas já carregam significado e a
equipe as reconhece.

| Cor | Significado | Onde aparece |
|---|---|---|
| 🔴 Vermelho | Urgente · cliente esperando · erro | Modo hoje, falhas, bloqueios |
| 🔵 Azul | Trabalho de base · reposição | Modo estoque |
| 🟡 Âmbar | Atenção · devolução · adiantamento | Devoluções, avisos |
| 🟢 Verde | Concluído · confirmado | Sucesso de bipe |

### A regra que não pode ser quebrada

**Cor nunca é o único sinal.** Sempre acompanhada de texto e, quando possível,
ícone ou posição.

Cerca de 8% dos homens têm alguma forma de daltonismo, e vermelho/verde é
justamente o par mais afetado. Numa equipe de 30 a 50 anos é provável que alguém
tenha, mesmo sem saber. Uma tela onde "verde significa ok e vermelho significa
erro" é uma tela que essa pessoa não consegue usar.

### Paleta — Operação (fundo claro)

```
Fundo               #FFFFFF
Fundo secundário    #F4F6F8    cartões, áreas de agrupamento
Borda               #D8DEE6
Texto principal     #1A1D23
Texto secundário    #5A6472

Vermelho            #C62828    faixa e estado urgente
Azul                #1565C0    faixa e estado reposição
Âmbar               #B26A00    atenção (escurecido para contraste em fundo claro)
Verde               #2E7D32    confirmação
```

> O âmbar do tema escuro (`#FFB800`) **não funciona** sobre fundo branco — o
> contraste fica em 1.8:1, muito abaixo do mínimo legível de 4.5:1. Por isso a
> versão escurecida na operação.

### Paleta — Admin (fundo escuro)

Mantida como está hoje: `#0E1217` de fundo, `#161B22` nos cartões, `#FFB800` como
cor de ação. Já funciona e a estética combina com dashboard.

---

## 3. Tipografia

### Operação

| Elemento | Tamanho | Peso |
|---|---|---|
| Estado principal (Revisando / Pronto / Erro) | 30px | 800 |
| Medida da peça (`1,60 × 1,40 CINZA`) | 26px | 700 |
| Código SKU (`BK160140CINZA`) | 15px | 600, monoespaçada |
| Cronômetro | 48px | 800, tabular |
| Rótulos e apoio | 15px | 500 |
| Detalhe secundário | 13px | 400 |

**Mínimo absoluto: 15px.** Nada abaixo disso na operação.

### O ajuste A+ / A−

Botão no topo de cada tela de operação, com três níveis: normal, grande (+15%),
muito grande (+30%). A escolha fica salva **por aparelho** — o tablet da bancada do
Edivaldo pode ficar grande sem afetar os outros.

Implementado com `font-size` na raiz e todas as medidas em `rem`, para que o layout
inteiro escale junto em vez de quebrar.

### A âncora visual

O SKU **permanece exatamente como está** — a equipe já o reconhece e mudá-lo criaria
confusão. Mas ele ganha uma linha acima, maior e mais legível:

```
1,60 × 1,40   CINZA          ← 26px, identificação rápida
BK160140CINZA                ← 15px, o código que eles conhecem
```

Derivada do próprio SKU pela regex já existente. Para códigos fora do padrão
(`SCREEN3-160140BEGE`), exibe só o código.

---

## 4. Alvos de toque

| Contexto | Mínimo | Espaço entre |
|---|---|---|
| Botão de ação principal | 56px de altura | 12px |
| Opção de formulário (devolução) | 52px de altura | 10px |
| Item de lista / tile | 64px de altura | 8px |

O mínimo recomendado pela Apple é 44px. Adotamos mais porque o uso é em pé, com
atenção dividida, e por vezes com a peça na mão.

---

## 5. Tela de Devoluções — a correção prioritária

**Este é o problema concreto identificado.** O Edivaldo precisa se aproximar da tela
para acertar os botões da triagem.

### O que está errado hoje

Sete grupos de perguntas com botões lado a lado (`display:flex; flex-wrap`), numa
tela de 8 polegadas. Cada botão fica com cerca de 90×40px, colados uns aos outros.
Alvo pequeno, sem margem de erro, repetido sete vezes seguidas.

### Como fica

**Grupos com 2 opções** (Tubo, Base, Kit, Destinação) — dois botões grandes lado a
lado, cada um ocupando metade da largura, 56px de altura:

```
Tubo do rolo
┌────────────────────┐  ┌────────────────────┐
│        OK          │  │     AMASSADO       │
└────────────────────┘  └────────────────────┘
```

**Grupos com 3+ opções** (Embalagem, Tecido, Comando) — botões empilhados, um por
linha, largura total:

```
Tecido
┌──────────────────────────────────────────┐
│  Intacto                                 │
├──────────────────────────────────────────┤
│  Sujo                                    │
├──────────────────────────────────────────┤
│  Rasgado                                 │
├──────────────────────────────────────────┤
│  Amassado                                │
└──────────────────────────────────────────┘
```

**Selecionado** ganha três sinais simultâneos: fundo colorido, borda espessa e um
✓ à esquerda. Nunca só a cor.

**Progresso visível:** um contador no topo — `3 de 7 respondidas` — para ele saber
quanto falta sem precisar rolar.

**Um grupo por vez, opcional:** com sete grupos numa tela de 8", vale avaliar
mostrar um de cada vez, avançando automaticamente após a escolha. Reduz rolagem e
elimina o risco de tocar no grupo errado. A decidir com o Edivaldo depois de testar
a versão empilhada.

---

## 6. Tela de Revisão

O operador **quase sempre bipa** — os tiles são painel de consulta, não alvo de
toque. Isso libera o layout para priorizar leitura à distância.

### Hierarquia

O que ele precisa ver de relance, em ordem:

1. **Estado** — está revisando? terminou? deu erro?
2. **Qual peça** — medida grande, SKU abaixo
3. **Cronômetro** — tempo corrente
4. **Progresso do dia** — secundário

### Modo visível o tempo todo

Faixa de 6px no topo da tela, na cor do modo, mais o nome escrito. Não é
decoração: é o que impede meia hora de trabalho no modo errado.

```
████████████████████████████████████  ← faixa vermelha
🔴 PEDIDOS DE HOJE          [Trocar]
```

### Campo de bipe

Visível, centralizado, alto (60px), com borda que muda de cor ao receber foco.
Nunca escondido — a lição do iPad, que retira o foco de campos fora da tela.

### Tiles

Grade de 2 colunas na tela de 8" (hoje são 4-5, o que espreme tudo). Cada tile com
64px de altura mínima, medida grande, SKU abaixo, progresso à direita.

---

## 7. Admin — o dashboard

Aqui a lógica se inverte: densidade é qualidade. Você quer ver muitos números de
uma vez, comparar e decidir.

### Estrutura

**Linha de indicadores** — 4 a 6 cartões numéricos grandes no topo. O número domina,
o rótulo é pequeno, e a variação aparece ao lado (`▲ 12%` em verde, `▼ 5%` em
vermelho).

**Gráficos em grade de 2 colunas** no MacBook (1440px), 3 colunas em monitor
externo maior, 1 coluna abaixo de 900px.

**Tabelas densas** — linhas de 36px, fonte 13px, números alinhados à direita em
fonte tabular.

### Estética

Fundo escuro, cartões levemente mais claros, sem sombras pesadas. **A cor aparece
apenas nos dados** — o resto é neutro. É o que faz um dashboard parecer sóbrio em
vez de carnavalesco.

Um único acento (`#FFB800`) para ação primária. Os gráficos usam uma paleta
sequencial, não uma cor por categoria escolhida ao acaso.

### Largura de referência

MacBook Air 13" é o alvo principal (1440px lógicos). Deve funcionar bem em
1920px sem esticar demais — largura máxima de conteúdo em 1600px, centralizada.

---

## 8. Celular

Uso definido: **consulta rápida e bipe de carregamento**. Não é replicar o sistema
inteiro no bolso.

| Tela | No celular |
|---|---|
| Painel do dia | ✅ Prioridade |
| Carregamento | ✅ Precisa funcionar bem |
| Revisão / Embalagem | ⚠️ Funciona, mas não é o alvo |
| Admin | ❌ Não vale o esforço |

Regra: abaixo de 600px, tudo vira uma coluna, cartões empilham, tabelas viram
listas. O admin simplesmente avisa que é melhor no computador.

---

## 9. Acessibilidade — o mínimo inegociável

1. **Contraste 4.5:1** em qualquer texto. Verificável, não opinável.
2. **Cor nunca sozinha** — sempre texto e/ou ícone junto.
3. **Alvo mínimo 52px** nas telas de operação.
4. **Ajuste de fonte** por aparelho, sem depender do sistema operacional.
5. **Retorno em dois canais** — som e visual. A fábrica tem barulho parte do tempo;
   um bipe confirmado só por som se perde.
6. **Estados de erro explicados** — nunca só "erro", sempre o que fazer.

---

## 10. Ordem de implementação

Por impacto real, não por facilidade.

| # | O quê | Por quê |
|---|---|---|
| 1 | **Devoluções: botões grandes** | Problema concreto e identificado |
| 2 | **Operação em fundo claro** | Reflexo sob luz natural afeta todos |
| 3 | **Ajuste A+/A−** | Autonomia para quem precisa |
| 4 | **Medida como âncora visual** | Legibilidade sem mudar o SKU |
| 5 | **Revisão: 2 colunas na 8"** | Tiles apertados na tela pequena |
| 6 | **Admin: refino do dashboard** | Melhoria, não correção |

Os itens 1 a 5 são de operação e devem ser validados **com o Edivaldo na bancada**,
não na mesa do escritório. O 6 é o único que se avalia no Mac.

---

## 11. O que não muda

- O SKU e seu formato
- As cores dos três modos e seus significados
- O fluxo de bipes (dois na revisão, três na embalagem)
- Os atalhos `Alt+1..9` e `Alt+0`
- A estrutura de navegação

Design que muda o que já funciona custa mais em confusão do que ganha em estética.
