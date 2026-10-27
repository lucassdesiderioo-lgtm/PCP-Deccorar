> **STATUS · 27/10/2026 — RASCUNHO, AGUARDANDO O DONO** · `NOVIDADE` + `REGRA`
> · risco 🔴 (etiqueta, estoque). Nasceu da NF 8196 (Roberto, 19/10/2026): o ML
> vendeu **2** persianas numa etiqueta, o sistema gravou **1**, e o cliente
> recebeu uma. Outros clientes relataram o mesmo. **Nada construído** (§0:
> `REGRA`/`NOVIDADE` sem spec aprovada não se constrói). As perguntas do §7 são
> do dono.

# A conferência da quantidade — o sistema confere o próprio trabalho

## 1. O pedido do dono, nas palavras dele

> *"O sistema faz uma leitura e pronto, acabou. Ele não checa o próprio
> trabalho. Esse é um trabalho que deveria ter dupla, tripla, quádrupla
> checagem da própria etiqueta."*
>
> *"Toda hora que eu trouxer esse tipo de problema, o sistema passa a gravar o
> problema, para esse problema não se repetir."*

São duas coisas, e esta spec trata as duas:

| | O quê | Seção |
|---|---|---|
| **A** | Ler a **quantidade** de cada etiqueta por vários caminhos independentes e só deixar passar quando todos concordam | §3 |
| **B** | Todo problema trazido vira um **caso gravado** que o sistema confere a cada mudança, para sempre | §4 |

## 2. O que existe hoje, e o buraco

**O SKU já é conferido.** O `parse.js` lê a folha de controle de dois jeitos
(por bloco, e item a item) e retém o volume quando os dois discordam. Há cinco
conferências no upload (R-CONF-01): leituras, comprador, medida, cor e família.

**A quantidade não é conferida.** Ela é lida **uma vez só**, por um caminho só:

| Onde | O que faz com a quantidade |
|---|---|
| leitura por bloco (`folha.js`, `itensDaFolha`) | lê o `Quantidade: N` — mas só nas **4 linhas** abaixo do `SKU:` |
| leitura item a item (`parse.js`, a "testemunha") | **não lê** a quantidade |
| a nota fiscal (DANFE), que está no mesmo PDF | **não é usada** para isso |
| a conta do PDF inteiro (peças da folha × peças gravadas) | existe só no `rastrear.js --lote`, como relatório; **o upload não faz** |
| o relatório do ML (coluna **Unidades**) | **não é importado** |

E há um caminho em que a quantidade some **calada**, confirmado no código:
quando a leitura por bloco não casa a etiqueta com o item, e a testemunha casa,
o volume entra com o SKU da testemunha — e a quantidade vai embora, porque a
testemunha não a leu. Nada retém, nada avisa. A NF 8196 tinha só o Pack ID na
etiqueta (sem número de venda), que é o tipo de etiqueta em que esse casamento
é mais frágil.

> ⚠️ **A causa exata da NF 8196 ainda não está provada.** Ela pode ter sido o
> caminho acima, o `Quantidade:` caído fora das 4 linhas (título comprido, como
> nos Tóquio), ou o ML ter mudado o jeito de escrever. Só o PDF de 19/10 diz —
> e ele é o **primeiro caso** do caderno (§4).

## 3. Parte A — as leituras da quantidade

### 3.1 As leituras

Cada uma olha um pedaço **diferente** do PDF, ou o mesmo pedaço com outra
régua. Uma leitura que falha não arrasta as outras.

| # | Leitura | Olha | Quando |
|---|---|---|---|
| L1 | folha por bloco | o `Quantidade:` do bloco do item (o que existe hoje) | no upload |
| L2 | folha item a item | a testemunha passa a ler o `Quantidade:` também | no upload |
| L3 | folha crua, sem janela | todo número de quantidade escrito entre o item e o próximo (`Quantidade: N`, `N unidades`), sem o limite de 4 linhas | no upload |
| L4 | a nota fiscal | soma das quantidades dos produtos da NF **contra** a soma das peças de todos os volumes daquela NF (a nota é do pedido, R-PDF-05) | no upload |
| L5 | a conta do PDF | soma de todas as quantidades da folha **contra** a soma das peças gravadas no upload inteiro | no fim do upload |
| L6 | o relatório do ML | coluna **Unidades** de cada venda **contra** as peças do volume | no import de Admin → Planejamento |

> **A etiqueta de envio também pode dizer a quantidade**, mas isso não está
> confirmado. Se o PDF real de 19/10 mostrar, ela entra como mais uma leitura.

### 3.2 A regra de decisão

1. **A peça só passa quando todas as leituras que conseguiram ler concordam.**
2. **Leitura que não conseguiu ler não vota.** Sem nota legível, a L4 fica de
   fora daquele volume — nunca vira acusação. É a regra dos dois lados
   (armadilha #10): trava que acusa o inocente para de proteger.
3. **Qualquer leitura dizendo MAIS do que foi gravado retém o volume.** O
   sistema nunca escolhe o número menor para "deixar passar".
4. **Retém o volume, nunca o PDF inteiro** (R-CONF-03). As outras etiquetas
   seguem.
5. **O motivo diz cada leitura**, para quem libera conferir em segundos:
   *"quantidade: folha diz 2, nota diz 2, gravado 1"*.
6. **Quem libera** é uma pessoa em Admin → Bloqueados, com o pedido do ML
   aberto: confirma quantas persianas e de quais SKUs. É o card que já existe
   para o pacote de vários SKUs (§5-B, `pacote.assinar`).
7. **Na L6** (o relatório chega depois, às vezes depois de a caixa sair), a
   divergência não tem como reter a caixa que já foi. Ela vai para uma lista
   **"o ML diz N, o sistema gravou M"**, com cliente, NF e estágio: é a lista
   de quem pode ter recebido menos.

### 3.3 Medir para a trava não virar paisagem

- A auditoria (`rastrear.js --auditar`) passa a contar, por leitura, **em
  quantos volumes ela conseguiu ler**. Leitura que deixa de ler — porque o ML
  mudou o layout — fica âmbar, e alguém pergunta por quê antes da reclamação
  (o mesmo desenho do R-CONF-06).
- Antes de a trava reter de verdade, ela roda sobre os PDFs disponíveis para
  medir o **falso alarme**. Trava que dispara no caso normal ensina a equipe a
  contorná-la (armadilha #6). Ver a pergunta P1.

## 4. Parte B — o caderno de casos reais

**Todo problema de leitura que o dono trouxer vira um caso gravado, e o sistema
confere todos a cada mudança de código, para sempre.**

- **Uma pasta, `casos/`**, com um arquivo por problema: o texto do PDF daquele
  volume (folha, etiqueta e nota), com **nomes e endereços trocados**, e o que
  devia ter saído (SKU de cada peça, quantas peças, quantos volumes), mais uma
  linha dizendo o que aconteceu e em que data.
- **Um comando grava o caso:**
  `node registrar_caso.js <pdf> <venda-ou-pack> --pecas 2 --nota "Roberto recebeu 1 de 2"`.
  Ele relê o PDF, recorta só aquele volume, troca os nomes e grava o arquivo.
- **Um teste roda todos:** `teste_casos_reais.js` passa cada caso pelo upload de
  verdade e exige o resultado certo. Ele entra no CI como os outros, então
  nenhuma mudança futura sobe se desfizer um caso.
- **O caso entra ANTES do conserto, reprovando.** O conserto é o que o faz
  passar. É assim que se prova que o conserto pegou o problema de verdade, e
  não um parecido.
- **Caso nunca se apaga.** Se um dia o ML mudar o formato e um caso velho
  deixar de fazer sentido, ele ganha uma nota, não some.

> Hoje os testes do parse montam a folha **à mão**, no formato que alguém achou
> que o ML usa. O caderno usa **o texto que o ML mandou de verdade**, que é
> onde os problemas aparecem.

## 5. Fases

| Fase | O quê | Precisa de |
|---|---|---|
| **1** | O caderno (§4) e o primeiro caso, a NF 8196 · L2 e L3 · a trava (§3.2) com as três leituras da folha · a cobertura na auditoria | o PDF de 19/10 |
| **2** | L4 (a nota) e L5 (a conta do PDF) | — |
| **3** | L6 (o relatório) e a lista "o ML diz N, o sistema gravou M" | um relatório com a coluna Unidades |

Cada fase com teste escrito antes, backup e deploy fora do horário de
expedição (🔴).

## 6. Fica de fora

- Mandar a peça que faltou ao cliente — o dono já está fazendo.
- O saldo das caixas que saíram com menos: nelas o sistema baixou o que saiu,
  então o saldo está coerente. Só muda se a lista da fase 3 achar caixa que
  saiu com **mais** do que o sistema sabe.
- A conferência do SKU, que já tem as suas cinco travas.

## 7. Perguntas ao dono

| # | Pergunta | Proposta |
|---|---|---|
| P1 | A trava retém já na fase 1, ou passa uma semana só **avisando** (tarja na tela, sem reter) para medir o falso alarme? | Avisar por uma semana, depois reter |
| P2 | Quem libera a quantidade retida? | Quem já assina o pacote (`pacote.assinar`) |
| P3 | O caderno guarda o texto do PDF no repositório, com **nomes e endereços trocados**. Está bem assim? | Sim, trocados |
| P4 | Você tem o PDF de 19/10 com a NF 8196? | É o primeiro caso, e diz a causa |
| P5 | Você consegue o relatório de vendas do ML com a coluna **Unidades**, cobrindo o período das reclamações? | Para a fase 3 |
