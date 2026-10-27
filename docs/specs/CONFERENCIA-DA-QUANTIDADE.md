> **STATUS · 27/10/2026 — APROVADA, FASE 1 NO AR** (PR #235, deploy do dono no
> mesmo dia: `/login` 200, telas 302, API 401) · ✅ **a causa da NF 8196 confirmada
> no banco**: o PDF do Roberto tinha 1 etiqueta sem item na folha · ✅ a primeira
> auditoria em produção (414 caixas, 17 PDFs): cobertura de 99–100% nas três
> leituras e **zero** caixa gravada com menos peças · ✅ **o primeiro aviso real**
> da conta do PDF (folha 50, sistema 49) era uma venda da folha **sem etiqueta**
> (2000018960012186, BK180150BEGE) que nunca entrou no sistema e **não estava
> cancelada** — o aviso genérico mandava procurar uma caixa errada; no mesmo dia
> ele passou a dizer a venda pelo número (`semEtiqueta`, `resto`) e virou o 4º
> caso do caderno ·
> `NOVIDADE` + `REGRA` · risco 🔴. Nasceu da NF 8196 (Roberto, 19/10/2026): um
> pacote de **dois SKUs** numa etiqueta, o sistema gravou **1** e o cliente
> recebeu uma. Respostas do dono no §7: reter já, quem assina o pacote libera,
> nomes trocados no caderno.
>
> **Fase 1 em código (27/10/2026):** o irmão do pacote com o PDF sem fechar
> **retém** a caixa em vez de sumir (R-VOL-03); a testemunha lê a quantidade
> (L2); a folha inteira (L3) conta toda persiana entre uma venda e a próxima,
> abrindo venda **só por pack ou venda**; a conta do PDF (L4) vai na resposta do
> upload e em vermelho nas três telas; a caixa em dúvida vai ao card do pacote
> com o maior número já escrito (R-VOL-09). O caderno de casos (`casos/`,
> `registrar_caso.js`, `teste_casos_reais.js`) nasceu com três casos: NF 8196
> com o PDF sem fechar e fechando, e NF 8152. `rastrear.js --auditar` mede a
> cobertura de cada leitura e lista caixa gravada com menos peças do que a
> folha diz. **Testes:** `teste_quantidade.js` 35 (escrito antes; cada leitura
> desligada reprova o caso dela) · `teste_casos_reais.js` 27 · o PDF real de
> 16–19/10 sem nenhuma caixa retida à toa.
>
> **Divergências da construção:** (1) a nota saiu das leituras — o DANFE
> simplificado não traz produto (§3.1); (2) a folha crua não reconhece venda
> pelo nome do comprador, para não errar junto com a leitura por bloco; (3) a
> etiqueta e a nota dos casos do Roberto são reconstruídas, porque o PDF não
> chegou inteiro — a folha é a do print.
>
> ⚠️ **A venda 2000018960012186 é a NF 8301, e FOI ENVIADA por fora do sistema**
> (dono, 27/10/2026): não está no banco nem em PDF subido, e falta também no PDF
> de 16–19/10 (NFs 8268 a 8303, sem a 8301). A caixa nunca foi conferida e o
> saldo de BK180150BEGE ficou 1 acima — a correção é Admin → Estoque, com
> motivo, ou a próxima contagem. **Etiqueta impressa por fora é a armadilha #6**
> (§7 do CLAUDE.md): vale descobrir qual trava empurrou a impressão para fora.
>
> **Fase 1-B em código (27/10/2026, aprovada pelo dono no mesmo dia):** a venda
> da folha sem etiqueta é gravada e fica em **Admin → Bloqueados** até o PDF
> dela chegar ou alguém resolver com motivo; a Etiqueta de Venda mostra só uma
> linha (§5-B, R-PDF-09). ✅ **No ar em 27/10/2026** (PR #237, deploy do dono:
> `/login` 200).
>
> ⚠️ **NO AR NÃO É CONFERIDA.** A prova é o primeiro PDF cuja folha traga uma
> venda sem etiqueta: ela tem que aparecer no card de Admin → Bloqueados e na
> linha da Etiqueta de Venda, e sair sozinha quando o PDF dela subir. Se nesse
> dia o aviso do upload aparecer e o card ficar vazio, é defeito. A NF 8301 não
> serve de prova: saiu antes da regra existir.
>
> **Falta:** a conferência da fase 1-B com dado real · a fase 2 (o relatório do
> ML com a coluna Unidades) · o motivo de a NF 8301 ter saído por fora · corrigir
> o saldo do BK180150BEGE (1 acima), que o dono fará depois da correção de
> estoque.

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
| a nota fiscal (DANFE) e a etiqueta | não trazem a quantidade (ver o aviso no §3.1) |
| a conta do PDF inteiro (peças da folha × peças gravadas) | existe só no `rastrear.js --lote`, como relatório; **o upload não faz** |
| o relatório do ML (coluna **Unidades**) | **não é importado** |

E há um caminho em que a quantidade some **calada**, confirmado no código:
quando a leitura por bloco não casa a etiqueta com o item, e a testemunha casa,
o volume entra com o SKU da testemunha — e a quantidade vai embora, porque a
testemunha não a leu. Nada retém, nada avisa. A NF 8196 tinha só o Pack ID na
etiqueta (sem número de venda), que é o tipo de etiqueta em que esse casamento
é mais frágil.

> ⚠️ **A NF 8196 NÃO ERA "QUANTIDADE: 2" — ERA UM PACOTE DE DOIS SKUs**
> (27/10/2026, folha enviada pelo dono). Na folha: `BK120120BEGE` (Quantidade 1)
> com pack, venda e o nome do Roberto, e logo abaixo `BK140140BEGE` (Quantidade
> 1) sem pack, sem venda e sem nome — o **irmão** do pacote (§5-B).
>
> **O caminho, reproduzido com a folha dele no leitor do sistema:** a folha
> sozinha dá as duas peças. Mas o irmão só é aceito quando **todas as etiquetas
> do PDF** acham item na folha (`pdfFecha`). Basta UMA etiqueta de outro
> cliente ficar sem item para o irmão ser descartado em **todos** os volumes do
> PDF — e o volume que casou certinho, como o do Roberto, **passa com 1 peça,
> sem reter e sem aviso**, porque a retenção do "PDF não fecha" só pega a
> etiqueta que não achou item (`!r1`, R-CONF-03). É a licença do R-VOL-03
> ("o irmão se lê por ausência, e só quando o PDF fecha") virando silêncio do
> lado do volume que tem o irmão.
>
> Falta só a confirmação do banco: se outro volume do mesmo PDF ficou retido
> por "não achou item na folha", é este caminho.
>
> **Há um segundo furo no mesmo lugar, achado no código:** quando a leitura
> por bloco não acha o item e a testemunha acha, a quantidade é jogada fora —
> a testemunha não a lê.

## 3. Parte A — as leituras da quantidade

### 3.1 As leituras

Cada uma olha um pedaço **diferente** do PDF, ou o mesmo pedaço com outra
régua. Uma leitura que falha não arrasta as outras.

| # | Leitura | Olha | Quando |
|---|---|---|---|
| L1 | folha por bloco | o `Quantidade:` do bloco do item (o que existe hoje) | no upload |
| L2 | folha item a item | a testemunha passa a ler o `Quantidade:` também | no upload |
| L3 | folha crua, sem janela | todo número de quantidade escrito entre o item e o próximo (`Quantidade: N`, `N unidades`), sem o limite de 4 linhas | no upload |
| L4 | a conta do PDF | soma de todas as quantidades da folha **contra** a soma das peças gravadas no upload inteiro | no fim do upload |
| L5 | o relatório do ML | coluna **Unidades** de cada venda **contra** as peças do volume | no import de Admin → Planejamento |

> ⚠️ **A ETIQUETA E A NOTA NÃO DIZEM A QUANTIDADE — conferido no PDF real de
> 16 e 19/10/2026 (33 etiquetas, NF 8152 a 8303).** A etiqueta de envio traz
> pack, despacho, rota e destinatário, sem produto. A nota que vem no PDF é o
> **DANFE simplificado**: remetente, destinatário e chave, com o quadro de
> produtos **em branco**. O caso conferido foi o José Maria Martins (NF 8152,
> `SCREEN1-120120BEGE`, *Quantidade: 2* na folha): etiqueta e nota sem número
> nenhum. A primeira versão deste rascunho tinha a nota como leitura; ela saiu.
>
> **Consequência: dentro do PDF, a quantidade só existe na folha de controle.**
> L1, L2 e L3 são três réguas sobre o MESMO texto: pegam erro de LEITURA (janela
> curta, casamento errado, layout quebrado), mas não pegam o ML omitindo o
> número. A L4 confere a conta inteira. A **única fonte de fora do PDF é a L5**,
> o relatório do ML — e por isso ela não é opcional.
>
> **O mesmo PDF mostrou que a leitura funciona no caso simples:** o José entrou
> com as duas peças gravadas. O defeito da NF 8196 está em um caminho que esse
> PDF não exercita, e só o PDF dela diz qual.

### 3.2 A regra de decisão

1. **A peça só passa quando todas as leituras que conseguiram ler concordam.**
2. **Leitura que não conseguiu ler não vota.** Sem relatório importado, a L5 fica de
   fora daquele volume — nunca vira acusação. É a regra dos dois lados
   (armadilha #10): trava que acusa o inocente para de proteger.
3. **Qualquer leitura dizendo MAIS do que foi gravado retém o volume.** O
   sistema nunca escolhe o número menor para "deixar passar".
4. **Retém o volume, nunca o PDF inteiro** (R-CONF-03). As outras etiquetas
   seguem.
5. **O motivo diz cada leitura**, para quem libera conferir em segundos:
   *"quantidade: bloco diz 2, folha crua diz 2, gravado 1"*.
6. **Quem libera** é uma pessoa em Admin → Bloqueados, com o pedido do ML
   aberto: confirma quantas persianas e de quais SKUs. É o card que já existe
   para o pacote de vários SKUs (§5-B, `pacote.assinar`).
7. **Na L5** (o relatório chega depois, às vezes depois de a caixa sair), a
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
| **1** | O caderno (§4) e o primeiro caso, a NF 8196 (a folha que o dono mandou) · **o irmão que o PDF sem fechar descartava passa a RETER o volume, com as peças pré-preenchidas** · L2, L3 (contando também os SKUs irmãos) e L4 · a trava (§3.2) · a cobertura na auditoria | — |
| **1-B** | **A venda da folha sem etiqueta fica na tela até alguém resolver** (§5-B) — **no ar desde 27/10/2026** (PR #237), falta conferir com dado real | — |
| **2** | L5 (o relatório) e a lista "o ML diz N, o sistema gravou M" | um relatório com a coluna Unidades |

Cada fase com teste escrito antes, backup e deploy fora do horário de
expedição (🔴).

## 5-B. Fase 1-B — a venda da folha sem etiqueta não pode sumir (APROVADA e em código, 27/10/2026)

> **Como foi construída:** tabela `venda_sem_etiqueta` (dona: `exp_route.js`),
> gravada pelo upload a partir da `conta_pdf.semEtiqueta`; a venda cuja caixa
> já existe em `lote` não entra; a etiqueta chegando resolve sozinha
> (`resolucao='etiqueta'`); uma pessoa resolve com motivo obrigatório
> (`cancelada` ou `por_fora`, 400 sem motivo, 409 se já resolvida, auditoria).
> **Mudou na construção, por decisão do dono:** a lista fica em **Admin →
> Bloqueados** (o lugar único das pendências), e não na Etiqueta de Venda —
> lá aparece só **uma linha de aviso, sem botão**. Por isso **resolver é
> `@admin`**, como as outras decisões da aba (P8); ler é também de quem tem
> `etiqueta.emitir`, para a linha aparecer na bancada. Entra no número da aba
> e na cobertura do modo teste. `teste_sem_etiqueta.js` (35, escrito antes).


**O problema, nas palavras do dono:** *"Pelo fato de ficar pendente e não estar
no primeiro PDF, a venda ficou como atrasada. É um erro que vem acontecendo, e
por esse motivo não vemos a venda, e daí ela fica atrasada no Mercado Livre."*

O caminho, com o caso real (NF 8301, venda 2000018960012186, BK180150BEGE):

```
o ML põe a venda na FOLHA, mas a ETIQUETA dela não vem no PDF
   → o sistema nunca cria a caixa (sem etiqueta não há o que ler)
   → ela não aparece em "Faltam imprimir" nem em tela nenhuma
   → no ML ela fica pendente até ATRASAR
   → alguém vê pelo ML e imprime a etiqueta POR FORA
   → a caixa sai sem conferência, e o saldo fica 1 acima
```

É a armadilha #6 (§7 do CLAUDE.md) por outra porta: o desvio acontece fora da
vista do sistema. Desde o PR #236 o upload mostra a venda em vermelho pelo
número — mas **uma vez só**, para quem subiu o PDF. Ninguém leu, a venda volta
a sumir.

**O que esta fase faria:**

1. **O upload GRAVA a venda sem etiqueta** numa lista própria (venda, pack, SKU,
   quantidade, o PDF e quando foi vista pela primeira vez). Venda repetida em
   outro PDF não duplica.
2. **A lista aparece na Etiqueta de Venda, em cima, em vermelho**, com quantos
   dias ela tem: *"Venda 2000018960012186 · BK180150BEGE · está na folha do ML
   desde 21/10 e ainda não tem etiqueta no sistema — baixe a etiqueta no ML e
   suba o PDF"*. Ela não some sozinha por tempo.
3. **Ela sai da lista sozinha** quando um PDF trouxer a etiqueta (o volume
   entra em `lote` com aquela venda ou aquele pack) — o caminho normal.
4. **Ou uma pessoa resolve, com motivo**: *cancelada no ML* ou *saiu por fora
   do sistema*. No segundo caso a tela lembra que o saldo ficou 1 acima e manda
   para Admin → Estoque (o ajuste continua sendo de duas pessoas, R-EST-20).
5. **Nada é retido nem impresso** por esta lista: ela só não deixa a venda
   ficar invisível.

**Risco 🔴** (tabela nova no banco). Teste escrito antes; o caso da NF 8301 vira
o caso do caderno que trava a regra.

**Perguntas ao dono (P6 a P9 no §7).**

## 6. Fica de fora

- Mandar a peça que faltou ao cliente — o dono já está fazendo.
- O saldo das caixas que saíram com menos: nelas o sistema baixou o que saiu,
  então o saldo está coerente. Só muda se a lista da fase 3 achar caixa que
  saiu com **mais** do que o sistema sabe.
- A conferência do SKU, que já tem as suas cinco travas.

## 7. Perguntas ao dono

| # | Pergunta | Proposta |
|---|---|---|
| P1 | A trava retém já na fase 1, ou passa uma semana só **avisando**? | ✅ **Reter já** (dono, 27/10/2026) |
| P2 | Quem libera a quantidade retida? | ✅ **Quem assina o pacote** (`pacote.assinar`) (dono, 27/10/2026) |
| P3 | O caderno guarda o texto do PDF no repositório, com **nomes e endereços trocados**. Está bem assim? | ✅ **Sim, trocados** (dono, 27/10/2026) |
| P4 | Você tem o PDF com a NF 8196? | O dono vai mandar. O primeiro enviado (NF 8152 e 8268 a 8303) não a tem |
| P5 | Você consegue o relatório de vendas do ML com a coluna **Unidades**, cobrindo o período das reclamações? | Para a fase 2 |
| P6 | A fase 1-B pode ser construída? | ✅ **Sim, antes da fase 2** (dono, 27/10/2026) |
| P7 | Onde a lista aparece? | ✅ **Em Admin → Bloqueados**, junto com o que espera decisão; na Etiqueta de Venda **só uma linha** apontando para lá (dono, 27/10/2026: *"essas pendências devemos concentrar em uma única tela"*) |
| P8 | Quem pode marcar "cancelada no ML" ou "saiu por fora"? | Quem decide na aba Bloqueados (`@admin`), com motivo e registro — consequência da P7 |
| P9 | A venda vista há mais de 1 dia muda de cor? | Âmbar no dia em que aparece, vermelho a partir do dia seguinte (como proposto) |
