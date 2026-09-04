# CLAUDE.md — Contexto do Projeto PCP Deccorar

> Leia este arquivo **inteiro** antes de qualquer alteração no código.
> Ele contém regras de negócio que **parecem bugs mas são intencionais**.
> Alterar código sem ler esta seção já causou perda de dados de estoque em produção.

> 🗣️ **Idioma:** responda ao usuário **sempre em português** — todas as
> mensagens de chat, resumos e explicações. Vale para todo o projeto.

---

## 1. O que é este sistema

PCP (Planejamento e Controle da Produção) de uma fábrica de persianas que vende
pelo Mercado Livre. Controla o caminho completo de uma peça: da ordem de produção
até o carregamento no veículo, passando por revisão, embalagem e emissão da
etiqueta de venda.

**Não é um e-commerce.** As vendas vêm prontas do Mercado Livre em PDF. O sistema
cuida do que acontece *depois* da venda, dentro da fábrica.

**Usuários reais:** operadores de chão de fábrica usando tablets e leitores de
código de barras. Isso condiciona todas as decisões de interface: botões grandes,
campos que aceitam bipe, mínimo de digitação, feedback sonoro.

---

## 2. O FLUXO — a regra mais importante

```
Ordem de produção → REVISÃO → FILA → EMBALAGEM → ESTOQUE → ETIQUETA DE VENDA → CARREGAMENTO
```

### Onde o estoque entra e sai (LEIA COM ATENÇÃO)

| Evento | Efeito no estoque |
|---|---|
| Peça **revisada** | **NENHUM.** Entra na tabela `fila` com `situacao='aguardando'` |
| Peça **embalada** (com kit conferido) | **+1** — é aqui que vira estoque |
| **Etiqueta de venda** impressa | **−1** — é aqui que sai |
| Etiqueta de venda **reimpressa** | **NENHUM** — mesmo volume, mesmo cliente |

> ⚠️ **ARMADILHA #1:** Se você ver que `/api/revisao` não mexe no estoque, **está
> correto**. Não "conserte". A peça revisada ainda não está pronta — falta embalar
> e conferir o kit de instalação. Essa regra foi decidida pelo dono da operação:
> *"ela só pode passar a ser estoque depois da montagem/embalagem"*.

> ⚠️ **ARMADILHA #1-B:** a **reimpressão** (`POST /api/reimprimir`, na tela
> Etiqueta de Venda) não baixa estoque, e isso **está correto**. Impressora
> enroscada, etiqueta borrada e folha perdida geram a mesma etiqueta do mesmo
> volume, pro mesmo cliente — a baixa já aconteceu na primeira impressão.
> Se a reimpressão descontasse, cada papel preso furaria o estoque. Ela só grava
> `lote.reimpressoes` e `lote.reimpresso_em`, que são história, não saldo.

> ⚠️ **ARMADILHA #2:** `POST /api/revisao` ainda **retorna** os campos `estoque`,
> `pedido` e `feito` no JSON. Isso é **resquício** da versão antiga (quando a
> revisão somava estoque). Os valores retornados não refletem mais o efeito da
> revisão. A tela do operador já ignora esses campos. Não use como fonte de verdade.

---

## 3. Os três modos da tela de Revisão

A tela `/operador` abre com uma escolha obrigatória entre três frentes de trabalho.
A cor do cabeçalho muda conforme o modo — isso **não é decoração**, é o mecanismo
que impede o operador de revisar meia hora no modo errado.

| Modo | Cor | O que é | Origem dos dados |
|---|---|---|---|
| **PEDIDOS DE HOJE** | 🔴 vermelho | Vendas sem estoque — cliente esperando | `GET /api/revisao/dia` |
| **PRODUÇÃO PRA ESTOQUE** | 🔵 azul | Necessidade calculada ao vivo (`comprometido + alvo − estoque`) — Fase 2 | `GET /api/revisao/producao` (+ `/api/revisao/adiantar`) |
| **DEVOLUÇÕES** | 🟡 âmbar | Peças que voltaram do ML | navega para `/devolucao` |

### ⚠️ ARMADILHA #11 — a planilha do ML é ESPELHO, e um recorte apaga a média

A tela azul não sai de lançamento nenhum: ela é calculada ao vivo a partir da
planilha do Mercado Livre, importada em **Admin → Planejamento**. Dessa planilha
saem **dois** números, de lugares diferentes:

| Coluna | Alimenta | Olha para |
|---|---|---|
| **Data da venda** | a média diária | os últimos 30 dias (`janela_media`) |
| **Estado** (`"Para enviar no dia 17 de agosto"`) | o comprometido | os envios futuros |

```
alvo    = max(alvo_minimo, média_na_janela × dias_cobertura)
precisa = comprometido + alvo − estoque
```

> ⚠️ **O import APAGA o que não veio no arquivo** (`plan_route.js`, ao fim da
> transação): venda cancelada some da planilha e tem que sumir da conta. A
> consequência é que a planilha precisa vir **inteira, sempre** — cobrindo a
> janela toda e incluindo as vendas ainda não despachadas.
>
> Subir um recorte só com os próximos dias **apaga os 30 dias de histórico**. A
> média de todo SKU cai a zero, o alvo despenca para o `alvo_minimo`, e a tela
> azul para de pedir produção. Não dá erro e não dá aviso — o número só encolhe.
>
> Por isso a tela acusa: quando um import remove mais da metade da base, ela
> mostra tarja âmbar dizendo que aquilo tem cara de recorte. **Reparo: subir a
> planilha completa de novo.** Como o import é espelho, ele reconstrói sozinho.

A janela não é fixa em 30 dias — é o campo "Janela da média" na própria tela. Se
ela virar 60, a planilha precisa cobrir 60.

### A ordem é de prioridade, não de quantidade

Ordenar por `precisa` põe em cima o SKU que gira mais — que quase nunca é o que
vai faltar primeiro. A lista desce quatro degraus, e **cada linha diz qual a
colocou ali** (`motivo`): pontuação composta ordena bem e não explica nada, e
quem lê a lista sem entender a ordem volta a produzir pela intuição.

| # | Degrau | Critério |
|---|---|---|
| 1 | Cliente com prazo | tem comprometido que despacha **até amanhã** |
| 2 | Sem estoque | a próxima venda já vira urgência |
| 3 | Cobertura baixa | `estoque ÷ média` abaixo de metade dos dias de cobertura |
| 4 | Abaixo do alvo | o resto do que precisa produzir |

**Cobertura = quantos dias o estoque atual aguenta.** É ela que mede risco: um
SKU que vende 6/dia com 3 em estoque tem meio dia de folga; outro que vende
0,2/dia com 4 em estoque tem 20 dias — e era o segundo que aparecia em cima,
porque a quantidade que falta é maior. Sem venda na janela a cobertura é `null`
("não dá pra dizer"), que não é zero.

> O comprometido é **repartido por prazo** (`comp_ja`, `comp_semana`,
> `comp_depois`), mas o **total não mudou** — o `WHERE` da consulta é o mesmo.
> `precisa` e a compra de material continuam idênticos: o que entrou foi a
> informação de *quando*, que faltava para saber o que empurra a produção hoje.

A mesma ordem vale para a tela AZUL do operador: ela lê as mesmas `linhas`.

> **Peça sob medida não tem alvo, e isso é definição, não exceção.** Ela não
> existe antes da venda e não sobra depois (§7): não soma `+1` na embalagem nem
> baixa na etiqueta, então o estoque dela é sempre zero. Com alvo, o `precisa`
> daria `alvo − 0` todo dia e o SKU ficaria eterno na tela azul pedindo peça que
> ninguém encomendou. O que ela precisa é o **comprometido**, e só ele.

**Ground truth físico:** a produção separa os carrinhos fisicamente. Carrinho de
hoje → tela vermelha. Carrinho de estoque → tela azul. O software espelha a
realidade física; não tenta adivinhá-la.

**Persistência:** o modo fica salvo em `localStorage` (`rev_modo`) por aparelho.
O tablet da bancada reabre no último modo. O botão "Trocar" limpa e força a escolha.

### Regra da exceção (SKU fora da lista)

No modo vermelho, se o operador bipar um SKU que não está nos pedidos do dia:
**avisa mas deixa passar**, e a peça conta como estoque. Nunca bloqueia.

> Motivo: operador parado esperando alguém resolver é pior que um número
> classificado de forma diferente. O aviso aparece **no início** da revisão,
> não no fim — para ele descobrir antes de gastar o tempo de trabalho.

---

## 4. Como uma peça é revisada e embalada

### Revisão — dois bipes
1. Bipe no SKU → inicia o cronômetro
2. Bipe de novo → encerra, grava `segundos` em `revisao`, insere em `fila`

### Embalagem — três bipes
1. Bipe no SKU → inicia
2. Bipe no **QR do kit de instalação** → confirma que o kit entrou na caixa
3. Bipe no SKU → encerra, consome da `fila`, **+1 no estoque**, abate a ordem do dia

> **A fila não é obrigatória para embalar.** `POST /api/montagem` consome a linha
> da `fila` **quando ela existe** e funciona sem ela: grava a embalagem e soma
> `+1` no estoque igual. O que muda é o `modo`, que vira `'estoque'` — e aí a
> embalagem deixa de abater a ordem do dia. Isso é o que torna
> `node limpar_fila.js` seguro: limpar a fila não trava a bancada.
>
> A fila acumula quando a revisão é lançada e a peça nunca é embalada — foi o que
> aconteceu no período de testes, que deixou centenas de linhas sem peça física
> atrás. O lugar de limpar é o **inventário**: zerado o estoque e contada a
> prateleira, a fila velha não descreve mais nada. `limpar_fila.js` simula por
> padrão, mostra a **idade** das linhas (fila de hoje é trabalho, fila de meses é
> passivo), faz backup e apaga **só** `situacao='aguardando'` — a linha
> `embalado` é história de peça que virou estoque e nunca é tocada.

> **Bloqueio do kit:** sem o bipe 2, o bipe 3 é recusado com "⚠ FALTOU O KIT".
> Essa é a garantia contra esquecimento — motivo de devolução recorrente.

> ⚠️ **A CONFERÊNCIA DA PEÇA ACONTECE AQUI, E SÓ AQUI.** No bipe 1 a tela mostra
> em letra grande **o que a peça é** — `140 × 140 cm · Bege · Blackout · Rolô`,
> lido das colunas de `skus` (§7). O operador compara com a persiana na bancada
> antes de ensacar.
>
> Não dá pra mover essa conferência para depois: a embalagem é um **saco preto**,
> e uma vez fechado o único jeito de saber o que tem dentro é a etiqueta de SKU
> colada por fora. Da Etiqueta de Venda em diante ninguém mais vê a peça — lá o
> bipe confere a etiqueta contra a etiqueta, nunca contra o produto.
>
> É também a única defesa contra a peça errada dentro da caixa certa: o leitor lê
> a etiqueta, nunca a persiana. A frase sai do formatador único `pecaTexto` em
> `public/sku.js`, usado pelas duas telas — duas telas escrevendo a medida cada
> uma do seu jeito ensinariam a equipe a achar que são coisas diferentes.

> **Alcance real do kit:** o QR é **fixo** (um link do Google Drive com o manual
> de instalação, que o cliente escaneia em casa). O sistema garante que *alguém
> bipou um kit*, não que *aquele kit específico* entrou naquela caixa. É proteção
> contra esquecimento, não contra fraude. Configurável em `config.kit_codigo`.

### Peça com problema (rejeição)

Durante uma revisão em andamento, o botão "Peça com problema" permite devolver a
peça para a produção. Ela **não entra na fila de embalagem**. Grava em `rejeicao`:
motivo, tempo até a detecção, modo e usuário logado.

Motivos são configuráveis (tabela `listas`, tipo `rejeicao`), não fixos no código.

---

## 5. O cruzamento com o PDF do Mercado Livre

Ao subir o PDF (aba "Lançar produção" do admin), o sistema:

1. `parse.js` extrai SKU, Pack ID, venda, comprador, NF e páginas de etiqueta/DANFE
2. Cada volume vira uma linha em `lote`

> ⚠️ **ARMADILHA #4 — a folha de controle é lida POR BLOCO, e a janela do bloco
> não pode olhar para trás atrás de pack/venda/comprador.** A folha monta cada
> item em cinco linhas, em duas colunas:
>
> ```
> <identificação>            Persiana ... 1,60x1,40 Blecaute Cinza
> Pack ID: 2000014610097547  SKU: BK160140CINZA
> Venda: 2000018016683414    Quantidade: 1
> Tiago Sanches              Cor: Cinza
>                            Desenho do tecido: Blackout
> ```
>
> Pack, venda, comprador e cor vêm **na linha do `SKU:` ou abaixo**; só a
> descrição fica acima. Item que não fecha com "Desenho do tecido" (acessório
> não fecha, e nem todo item traz) faria a janela do item seguinte pegar os
> campos dele — foi assim que a etiqueta da Silvia Carolina quase colou no item
> do Evandro num teste com o PDF real.
>
> **O que havia antes:** a folha era fatiada por `split` em "Desenho do tecido",
> e o `match` casava o **primeiro `SKU:`** do pedaço com o **primeiro `Pack ID:`**
> — de itens diferentes quando o de cima não trazia pack. Em 20/08/2026 foi assim
> que Abraão Amorim, que comprou 3 × `BK140140BEGE`, recebeu uma `BK160140BEGE`.
> Auditoria da semana: 2 volumes errados em 361 (0,6%), sem erro humano no meio —
> a bancada bipou o que o sistema mandou.
>
> `folha.js` → `itensDaFolha()` é o **dono único** dessa leitura: o `parse.js`
> grava por ela e a auditoria relê por ela. Duas cópias significaria conferir com
> uma régua diferente da que gravou.
>
> **Rode `node teste_parse.js` após qualquer mudança no `parse.js`** — os nove
> casos montam a folha no formato REAL do ML, e o caso do Abraão está lá.
>
> Para conferir o que já está gravado: `node rastrear.js --auditar [dias]`.
> `node rastrear.js --folha` mostra o PDF cru quando o layout mudar.

### ⚠️ ARMADILHA #8 — **peça não é volume**, e é daí que sai "subi 41 e aparecem 35"

O sistema grava **uma linha em `lote` por etiqueta**, nunca por peça. O item da
folha que diz `Quantidade: 3` tem **uma** etiqueta do Mercado Livre, logo **um**
volume — e quem contou as persianas na folha achou três. Nada se perdeu: são
duas unidades de medida diferentes para o mesmo papel.

> Não "conserte" isso multiplicando o item pela quantidade no `parse.js`.
> Cada linha de `lote` vira uma **etiqueta de venda impressa**; três linhas para
> um envio que o ML despachou como um só criariam duas etiquetas que não existem,
> e o volume nunca fecharia no carregamento. O caso está travado por teste
> (caso 9 do `teste_parse.js`): a folha tem que **entregar** o 3, e o parse tem
> que continuar gravando **1**.

### ⚠️ A REGRA DA OPERAÇÃO: **uma venda = uma etiqueta = uma persiana**

Regra do dono, reafirmada em 01/09/2026:

> *"Para cada venda é uma etiqueta. Não tem essa de juntar etiqueta, não tem
> essa de juntar pacote, não tem essa de juntar caixa. Não existe isso. Cada
> etiqueta de venda é para um SKU, cada etiqueta de venda é para uma persiana."*

Consequência prática, e é ela que vale no código: **contar linhas de `lote` É
contar peças.** O cliente que comprou três leva três vendas, três etiquetas,
três volumes — cada um com o seu ciclo completo (revisão, embalagem, etiqueta,
carregamento).

> ⚠️ **NÃO MULTIPLIQUE O VOLUME POR NENHUMA "QUANTIDADE".** Isso foi tentado em
> 01/09/2026: o cruzamento passou a somar `pecas` e a etiqueta de venda a baixar
> `pecas` do estoque. Foi revertido no mesmo dia por contrariar a regra acima —
> nenhuma linha disso sobreviveu. Hoje há teste travando os dois lados: caso 1
> do `teste_cruzamento.js` e caso 1 do `teste_etiqueta.js`.
>
> O caminho é sempre o mesmo: **cada peça tem a sua etiqueta.** Se um dia
> aparecer venda de 3 peças com uma etiqueta só, isso é assunto do PDF do
> Mercado Livre — não se resolve multiplicando número dentro do sistema.

**Pergunta em aberto (a investigar, sem código):** a folha de controle traz o
campo `Quantidade`, e ele já apareceu maior que 1. Pela regra acima isso não
deveria acontecer, então falta olhar um PDF real desses e entender o que aquele
número significa. Enquanto não se sabe, **nada no sistema decide por ele** — o
`folha.js` lê o campo e o `rastrear.js --lote` só o exibe, para o dia em que
alguém for investigar.

**Do PDF até o número que o operador vê há SETE degraus**, e em seis deles o
volume sai da conta por regra. Nenhum é bug — mas nenhum é visível, e é por
isso que a pergunta "cadê as 6" vira desconfiança do sistema:

| Degrau | Some quem | Regra |
|---|---|---|
| peças → etiquetas | as peças extras dos itens com `Quantidade > 1` | esta armadilha |
| etiquetas → gravados | pack/venda **que já existe no histórico** | #5 |
| gravados → pendentes | os `bloqueado` (SKU sem cadastro **ou** divergência) | §6 e §5 |
| pendentes → fila de hoje | quem **só despacha depois** — vai pro painel "Pra despachar depois" | #7 |
| fila de hoje → urgentes | **quem já tem estoque** — sai direto pra Etiqueta de Venda, sem ordem | §5 |
| urgentes → tela vermelha | falta clicar em **"Lançar urgentes na produção"** | §5 |

> **Os dois degraus do meio são os que mais comem volume, e os dois são recentes.**
> A dedup passou a olhar o histórico inteiro (#5) e a fila passou a ser por prazo
> de despacho (#7) — as duas em 25/08/2026, as duas corretas, as duas mudando o
> número da tela sem mudar nada no PDF. Quem comparou a folha com a tela antes e
> depois viu a conta "quebrar" de um dia pro outro.

```bash
node rastrear.js --lote            # a escada inteira, do PDF de hoje até a tela
node rastrear.js --lote 2026-08-26 # de outro dia
```

Ele desce os sete degraus em voz alta e mostra em qual deles a conta mudou,
lista os itens com mais de uma peça e as etiquetas recusadas pela dedup com o
volume que já existia. Só lê — pode rodar em produção.

> ⚠️ Ele usa o `fila_dia.js` para contar a fila de hoje, e não uma cópia da
> regra. Uma ferramenta de diagnóstico com régua própria é pior que nenhuma:
> ela confirmaria com autoridade um número que a tela não usa.

### Três conferências, e qualquer uma delas retém o volume

O `parse` devolve `conflito` e o upload grava o volume como `bloqueado` com
`lote.bloqueio = 'divergencia: ...'` quando:

| # | Conferência | O que ela pega |
|---|---|---|
| 1 | **As duas leituras da folha** — o bloco (`leitura1`) × o tokenizer (`leitura2`), em mapas separados | O PDF lido de dois jeitos dando SKUs diferentes |
| 2 | **O comprador** — o nome na etiqueta × o nome no bloco | O volume casado com o item de outra pessoa. É a única que **não depende do Pack ID**, que é justamente o número que desalinha |
| 3 | **A descrição** — `1,60x1,40` escrito no anúncio × a medida dentro do código do SKU | O item corrompido, mesmo que as duas leituras concordem |
| 4 | **A cor** — a cor do anúncio × a cor dentro do código do SKU | O que a medida não separa: duas peças do mesmo cliente, mesma medida, cores diferentes. Ali o nome também não desempata |
| 5 | **A linha do produto** — a família da descrição × o prefixo do SKU, contra o que o sistema já viu | O que nem medida nem cor separam: `BK160140BEGE` ("Cortina Rolo Blackout") e `SCREEN3-160140BEGE` ("Toucher Rolô Evolux") têm a MESMA medida e a MESMA cor |

> **A conferência 5 aprende sozinha, e por isso demora a acusar.** O par
> família → prefixo é acumulado na tabela `familia_sku` a cada upload, e só vira
> regra depois de **5 ocorrências**. Produto novo no catálogo não pode parar a
> expedição enquanto o sistema ainda não sabe nada sobre ele: no PDF de 24/08 o
> `SCREEN3` apareceu **uma vez em 47 volumes** e passou limpo, como tem que ser.
> Uma tabela escrita à mão envelheceria calada; esta se atualiza com o catálogo.

> A lista de cores da conferência 4 sai dos próprios campos `Cor:` da folha,
> nunca de uma lista fixa: cor nova do catálogo entra sozinha, sem ninguém
> lembrar de vir aqui.

### ⚠️ ARMADILHA #10 — a trava que acusa o inocente para de proteger o culpado

Em 31/08/2026 havia **10 volumes retidos, e os 10 estavam corretos.** Nenhuma
peça errada, nenhum cliente trocado — três defeitos diferentes acusando gente
certa. Uma trava com 100% de falso positivo não é uma trava rigorosa: é a
armadilha #6 outra vez, o desvio que a equipe aprende a fazer. Quem destrava
dez inocentes em sequência destrava o décimo primeiro sem olhar, e é esse que
importa.

| Defeito | Vítimas | O que era |
|---|---|---|
| **O nome partido pelo PDF** | 3 (Dona Lizete) | A etiqueta traz `Dona Lizete (CONTADOR)`; o pdf.js quebrou a linha e sobrou `CONTADOR)`. A remontagem só olhava fragmento **começando** com `(` — o que chega com o `)` órfão não era remontado, e a palavra `CONTADOR)` virava o comprador |
| **Cor com nome comercial** | 5 (Tóquio 004 / 002) | `Tóquio 004 - Cinza com acabamento branco` e um SKU `CINZA` dizem a **mesma** coisa. O código não contém a frase inteira, então a conferência procurava outra cor e achava a própria |
| **Letra dobrada no nome** | 1 (Ryta) | `Rufiino` na etiqueta × `Rufino` na folha — digitação do próprio ML, não troca de cliente |

**O reparo de cada um é de precisão, não de afrouxamento** — os três casos reais
continuam retidos, e há teste para isso (casos 12 a 14 do `teste_parse.js`):

- `nomeDaEtiqueta()` vira o dono único da leitura do comprador e remonta o nome
  também quando o fragmento traz `)` sem `(`.
- A conferência 4 só acusa quando a cor do código **não aparece** no texto do
  anúncio. Anúncio `Bege` contra SKU `CINZA` continua retido.
- A conferência 2 tolera **letra repetida**, e só isso.

> ⚠️ **A TOLERAÇÃO DO NOME NÃO PODE SER DISTÂNCIA DE EDIÇÃO.** "Até 2 letras de
> diferença" resolveria o caso da Ryta e abriria um buraco no lugar exato onde
> não pode: **`Marcelo Sousa Silva` e `Marcela Sousa Silvo` também estão a duas
> letras, e são duas pessoas.** A conferência 2 é a única que não depende do
> Pack ID — ela existe justamente para pegar o volume casado com outro
> comprador. Por isso `mesmoNomeComRepeticao()` colapsa letras repetidas dos
> dois lados e exige **igualdade**: passa quem difere só na repetição
> (`rufiino`/`rufino`), nunca quem teve letra **trocada** (`marcelo`/`marcela`).

> **Consertar o comprador aumenta a proteção, não diminui.** Enquanto o nome vinha
> como `CONTADOR)`, aquele volume não estava sendo conferido — estava sendo
> acusado por ruído. Nome ilegível não vira acusação (é a regra dos dois lados),
> então cada nome que volta a ser lido é um volume que **passa a ter** a
> conferência de identidade. Acompanhe `cobertura.comprador` na auditoria: ela
> tem que **subir** depois deste reparo.

> ⚠️ **UMA TRAVA QUE PARA DE ACUSAR FAZ O MESMO SILÊNCIO DE "ESTÁ TUDO CERTO".**
> As conferências 3 e 4 leem a medida e a cor **de dentro do código do SKU**
> (`BK160160`**`CINZA`**). O dia em que os códigos deixarem de carregar esses
> dados — e o §7 permite, SKU é etiqueta livre — as duas param de proteger sem
> emitir um único aviso.
>
> Por isso a auditoria (`/api/auditoria/skus` e o botão em Admin → Bloqueados)
> reporta a **cobertura**: quantos volumes cada trava conseguiu de fato conferir.
> Abaixo de 100% ela aparece em âmbar. **Se esse número cair, a proteção
> encolheu** — e aí ou o código do SKU volta a carregar o dado, ou a conferência
> passa a ler das colunas de `skus` em vez do texto do código.

> As conferências 2 e 3 só acusam quando **os dois lados existem**: nome que não
> deu para ler, ou SKU sem medida no código (§7 — SKU é etiqueta livre), nunca
> viram acusação. Silêncio por falta de dado não pode virar bloqueio, senão a
> operação para por ruído e a equipe aprende a destravar sem olhar.

Validado contra os PDFs reais de 24/08: **47 volumes, zero conflitos**, e todos
os 46 do lote grande conferidos por um caminho independente (o nome do comprador)
sem uma única divergência.

O volume divergente:
- não imprime etiqueta e não carrega (é `bloqueado`);
- **não é solto pelo destravamento automático do §6** — cadastrar SKU não resolve
  uma dúvida sobre *qual peça o cliente comprou* (guarda no `server.js`);
- sai só por `POST /api/divergencias/resolver`, depois de alguém abrir o pedido no
  Mercado Livre e escolher. Aparece na aba **Bloqueados** do admin, em vermelho.

### Como o volume retido volta a andar (Bloqueados → escolher)

> ⚠️ **UMA TRAVA QUE NÃO SABE LIBERAR É UMA TRAVA QUE A EQUIPE APRENDE A
> CONTORNAR.** Até 01/09/2026 a tela montava os botões de escolha dando
> `split("/")` no texto do `bloqueio`. Isso só devolve SKU no motivo 1
> (`leituras divergem: A / B`); nos outros quatro o botão saía com a frase
> inteira dentro — `descricao diz 160x140 e o SKU e BK140140BEGE` — e o resolver
> recusava, porque aquilo não é código nenhum. **Quatro dos cinco motivos
> prendiam o volume para sempre.** O sistema sabia acusar e não sabia liberar.

As opções agora saem do **cadastro de SKU**, não do texto do motivo: a rota varre
`skus` e fica com os códigos que aparecem no bloqueio. Isso acha SKU com espaço
(`ROLO SOB MEDIDA 137x212`, §7), que nenhuma quebra por token acharia, e nunca
oferece um código que o §6 recusaria dois cliques depois.

**O código já gravado é sempre a primeira opção.** Nas conferências 3, 4 e 5 a
dúvida é entre o código e o *anúncio* — e quem abriu o pedido no ML pode muito
bem concluir que o código estava certo e o anúncio é que estava torto.
Concordar com o sistema era, justamente, a única resposta que a tela não aceitava.

A tela mostra, para cada volume retido: **por que parou** (os motivos, um por
linha), **o anúncio como o ML escreveu** — é esse texto que se reconhece na tela
do Mercado Livre, onde SKU não aparece —, as opções com **o que a peça é**
(`160 × 140 cm · Bege · Blackout · Rolô`, do mesmo `pecaTexto` da embalagem) e um
campo livre que **aceita bipe** para o caso em que a peça certa não é nenhuma das
citadas.

**A dúvida vira história.** Resolver apaga o `bloqueio` (é ele que retém), mas
grava `lote.bloqueio_resolvido`, `resolvido_por` e `resolvido_em`, e registra na
auditoria. Sem isso o volume destravado fica idêntico ao que nunca teve problema,
e a trava não deixa rastro de quantas vezes salvou — nem de quem a destravou com
pressa.

> A trava do §6 continua de pé aqui: SKU fora do cadastro **não** solta volume.
> A mensagem manda cadastrar antes, em vez de recusar sem dizer o quê.

**Teste obrigatório após mexer no destravamento ou nos textos de conflito do
`parse.js`:** `node teste_divergencia.js` — os cinco motivos entram com o texto
**exato** que o `parse.js` escreve. Mudou a frase lá, o caso quebra aqui, que é
o ponto: a tela lê esses textos.

### A conferência dupla no carregamento

`config.conf_carregamento = '1'` faz o carregamento pedir **dois bipes**: a
etiqueta de venda e o código do SKU **na mesma caixa** (ele fica visível porque a
etiqueta de venda é colada por baixo). Não bateu, não carrega, e a divergência vai
para a auditoria.

> **O segundo bipe é cego.** O sistema não mostra o SKU esperado antes — quem já
> sabe a resposta bipa o que for para fechar a linha, e a conferência vira
> confirmação. Os dois códigos só aparecem depois de divergirem, como alarme.

Desligável (Admin → Cadastros) porque custa um bipe por volume, todo dia. Nasce
**desligada**: ela cobre o erro de colagem, que ainda não tem evidência nos dados
— o erro que já aconteceu foi o do parse, e esse não passa mais.

> ⚠️ **ARMADILHA #9 — o carregamento NÃO filtra por dia, e não pode voltar a
> filtrar.** `carga.js` é o dono único de "isto está pra carregar?", e a resposta
> é `estagio='embalado'`, sem olhar `data`. Volume com etiqueta impressa e não
> carregado está **fisicamente na fábrica** até alguém pôr no carro; não existe
> hora em que ele deixe de estar.
>
> As três consultas da tela — a lista, o contador e **o bipe** — filtravam por
> `data=date('now','localtime')`, o dia da *importação*. O volume embalado ontem
> e não carregado ontem sumia das três de uma vez, e não havia nenhuma outra tela
> em que reaparecesse. Em 26/08/2026 eram os volumes **#643 a #648**, impressos
> no dia anterior.
>
> O pior dos três é o bipe: ele respondia **`nao_encontrado`** com a caixa na
> mão, na frente do carro. Ali ninguém tem como conferir nada — o que a equipe
> aprende é que o sistema erra, e a próxima caixa sobe no carro sem bipe.
>
> Terceira porta da mesma doença dos fantasmas (#5) e da fila por prazo (#7).
> As duas primeiras eram tela mostrando trabalho que **não existe**; esta era
> tela escondendo trabalho que **existe** — e é pior, porque o ruído a equipe
> aprende a ignorar, mas o volume escondido ninguém procura.
>
> **`carregados` conta por `carregado_em`**, nunca por `data`: senão o operador
> bipa um atrasado, ele sai da lista e o contador não anda — a tela dizendo que
> ele não fez nada. Mesma correção que o "impressas hoje" do `exp_route.js`.
>
> **O atrasado sai marcado e em cima**, nunca diluído no dia. Passivo antigo
> misturado no trabalho de hoje vira uma lista que nunca zera, e lista que nunca
> zera ninguém lê até o fim — que é o mesmo fim de esconder.
>
> **Rode `node teste_carga.js` após qualquer mudança no `carreg_route.js`** —
> os 13 casos incluem o dos seis volumes de 26/08, e cobrem que a busca larga
> não virou "acha qualquer coisa" (código inexistente ainda dá `nao_encontrado`)
> e que `bloqueado` continua recusado.
3. `cruz_route.js` compara os volumes **pendentes** × estoque e gera só urgência:

| Situação | Vira | Cor na revisão |
|---|---|---|
| Vendido, **sem** estoque | Produção **urgente** (`urgente=1`) | 🔴 |
| Vendido, **com** estoque | Sai da etiqueta direto do estoque — **sem** ordem de produção | — |

> **Fase 3 (14/08/2026):** o PDF passa a gerar **só urgência**. A reposição
> (produção para repor o estoque vendido) saiu do cruzamento e agora vem do
> cálculo ao vivo da tela azul (`/api/revisao/producao`). O PDF fica só na expedição.

**Exemplo:** 5 vendas de um SKU com 2 em estoque → 3 urgentes. As 2 com estoque
vão direto para a etiqueta de venda; o buraco no estoque é refeito pelo
planejamento (tela azul), não mais por uma ordem de reposição do PDF.

### ~~A foto do estoque (`foto_estoque`)~~ — removida na Fase 3

A foto era um remendo para o recálculo do PDF: congelava o estoque do dia para o
segundo upload não recontar. Sem produção de reposição vinda do PDF, perdeu a
razão. A urgência agora é **auto-corrigível**: conta os volumes ainda `pendente`
contra o estoque atual, então reaplicar depois de produzir/expedir não infla o
número — o volume processado sai de `pendente` e o estoque baixa junto.

**Recálculo é idempotente:** `POST /api/cruzamento/aplicar` apaga as ordens de
`origem='ml'` do dia e refaz. Subir o mesmo PDF duas vezes não duplica.

> ⚠️ **ARMADILHA #5 — a deduplicação do upload olha o HISTÓRICO INTEIRO, não o
> dia.** Pack ID e Venda são números do Mercado Livre: cada volume tem o seu, e
> ele nunca reaparece em outra venda. Então "já existe" é resposta definitiva —
> nunca "já existe hoje".
>
> Enquanto o `SELECT` da dedup em `exp_route.js` trazia
> `WHERE data=date('now','localtime')`, resubir um PDF de ontem (ou subir um
> lote reemitido, que repete vendas de dias anteriores) reinseria cada volume
> como **`pendente` de hoje** — inclusive volumes já impressos e despachados. Em
> 25/08/2026 foram **94 volumes fantasmas num dia só**, e os montes órfãos de 21,
> 19 e 18/08 mostram que vinha acontecendo havia semanas.
>
> O estrago não é a linha a mais: é a fila "Faltam imprimir" cobrando etiqueta de
> peça que está no caminhão. Fila que mostra o que não existe é fila que a equipe
> aprende a ignorar — e aí o volume que falta de verdade some junto com o ruído.
>
> Passivo antigo se limpa com `node limpar_fantasmas.js` (simula) e
> `--aplicar` (faz backup por `db.backup()` e apaga). Ele só remove o
> **`pendente`** cujo irmão mais antigo já **andou** (`embalado`/`carregado`) —
> duplicata com irmão `pendente` ou `bloqueado` sai numa lista à parte, para
> alguém olhar. O que fica é sempre o mais antigo, que é quem carrega a história.

### Os três scripts que fecham passivo — e as duas regras que valem para todos

| Script | Fecha | Critério |
|---|---|---|
| `limpar_fantasmas.js` | duplicata `pendente` | irmão mais antigo já andou |
| `fechar_vencidos.js` | `pendente` vencido | em bloco, por período conferido |
| `regularizar_saida.js` | qualquer não-carregado | por id, um a um, decisão humana |

> ⚠️ **A saída é carimbada na data DO VOLUME** — `COALESCE(despachar_em, data)`
> às 15:00 (§8) —, nunca em `datetime('now')`. Fechar um passivo antigo com a
> data de hoje cria um pico falso de dezenas de carregamentos num dia em que
> não saiu nada, e deixa vazios os dias em que as peças realmente saíram.
> O `fechar_vencidos.js` já nascia certo; o `regularizar_saida.js` foi
> corrigido em 26/08/2026, quando passou a ser usado com 27 ids de uma vez.

> ⚠️ **VENDA FUTURA NÃO FOI DESPACHADA.** Volume com `despachar_em > hoje` não
> se fecha, mesmo com a etiqueta já impressa: ela foi impressa adiantada e a
> peça está na fábrica esperando o prazo. Fechar carimba uma saída que não
> aconteceu, e — o dano real — o volume **não aparece na tela de carregamento
> no dia em que tiver que sair de verdade**. A peça fica na prateleira e
> ninguém é cobrado.
>
> A guarda existia só no `fechar_vencidos.js`. Ao copiar a fórmula da data para
> o `regularizar_saida.js` ela ficou para trás, e em 26/08/2026 quatro volumes
> foram fechados com data de setembro (o caso da Lucélia, que despacha 17/09).
> Hoje os dois recusam, dizendo em qual data o volume despacha.
>
> Reparo de uma vez só: `node reabrir_futuros.js` (simula) e `--aplicar`. O
> critério é estreito de propósito — só `carregado_em` **maior que hoje**, que
> não tem interpretação alternativa: ninguém saiu amanhã. Se ele voltar a achar
> linha algum dia, alguém furou a guarda.

> ⚠️ **Lançamento manual e PDF não se conversam.** O manual (`origem='manual'`)
> não é apagado pelo recálculo. Usar os dois no mesmo SKU **duplica a ordem**.
> Regra prática: PDF cobre as vendas, manual cobre produção sem venda.

---

## 6. A trava de SKU não cadastrado

**Regra inegociável, definida pelo dono:**
> *"Tudo que estiver na folha de controle e não tiver no cadastro de SKU deve ser
> bloqueado. Não posso ter erros daqui para frente."*

Volume cujo SKU não existe em `skus` entra com `estagio='bloqueado'` e:

- `GET /api/print/:id` recusa (HTTP 409)
- `POST /api/carregar` recusa com motivo `bloqueado`
- `POST /api/embalar` recusa

**A trava é por volume, não por lote.** 40 vendas com 3 SKUs desconhecidos → 37
seguem normalmente, 3 ficam retidas.

**Destravamento:** cadastrar o SKU em `POST /api/skus` libera automaticamente
todos os volumes bloqueados daquele código (linha no `server.js`).

**Sem tabela de equivalências, por decisão explícita.** Se o anúncio do ML manda
`BK140140BEGEML` e o cadastro tem `BK140140BEGE`, o volume fica bloqueado até o
anúncio ser corrigido na origem. Isso força a padronização em vez de mascará-la.

---

## 7. O SKU — **não há formato obrigatório**

> ⚠️ Isto mudou em 23/08/2026 (Compras, Fase 0). Se você lembra da regra
> `BK + largura(3) + altura(3) + COR`, ela **não existe mais**.

**O código do SKU é uma etiqueta livre.** Pode ter espaços, hífens, números no
meio — `ROLO SOB MEDIDA 137x212` é um SKU válido. O sistema não interpreta o
código para descobrir nada.

O que a peça É vive em **colunas** de `skus`:

| Coluna | O que é | Exemplo |
|---|---|---|
| `largura_cm`, `altura_cm` | Medida, centímetros inteiros | 160, 140 |
| `cor_codigo` | Cor, da lista fechada `cor` | `BEGE` |
| `tecido_codigo` | **Material**, da lista `tecido` | `BLACKOUT` |
| `modelo_id` | **Mecanismo**, da tabela `modelo` | Rolô, Acessório |

> ⚠️ **Tecido não é modelo.** O `BK` dos códigos antigos é *blackout* — o
> tecido. O modelo é o mecanismo: Rolô, Romana. A primeira migração da Fase 0
> confundiu os dois e gravou modelo `BK` em 24 SKUs; foi corrigido. Nunca deduza
> modelo do prefixo do código.

**Produto sem medida existe.** `KIT32` e `ACESSORIOSPERSIANAS` não são persianas.
O modelo deles tem `exige_medida = 0`, e por isso não são cobrados por largura e
altura na tela de pendências. Sem essa flag, o contador nunca zeraria — e um
contador que nunca zera é um contador que a equipe aprende a ignorar.

> A **etiqueta impressa** segue a mesma flag. Ela cobrava medida de todo mundo, e
> o acessório caía num beco sem saída: não havia o que preencher em Pendências de
> SKU e a etiqueta nunca saía. Hoje, sem medida, o lugar de destaque vira a
> **descrição** (`Kit 32 mm completo`) e o M² não é impresso — área de acessório
> não existe, e `M² 0.00` seria um número falso colado no produto. Persiana sem
> medida cadastrada continua recusada: ali a medida falta mesmo.

**Produto sem estoque existe, e não é falta.** `modelo.sob_medida = 1` marca a
peça feita contra o pedido do cliente: ela não existe antes da venda e não sobra
depois, então o saldo dela é sempre zero. Esses SKUs não passam pela trava de
estoque da Etiqueta de Venda **nem pela baixa** — sem `+1` na embalagem não pode
haver `−1` na impressão, senão cada venda sob medida abriria um buraco de uma
peça no SKU.

> ⚠️ **ARMADILHA #6 — a trava que a operação contorna não protege, só cega.**
> Até 25/08/2026 o `POST /api/embalar` recusava todo SKU com estoque zero. Como
> sob medida **nunca** tem estoque, isso recusava 100% dessas vendas. O que
> acontecia então não era a peça ficar retida: a bancada imprimia a etiqueta
> direto do PDF do Mercado Livre e despachava por fora — sem registro, sem a
> conferência do carregamento, e com o volume preso em `pendente` para sempre,
> reimportado a cada PDF novo. Foi assim que 1 SCREEN3 e 2 SOBMEDIDA de 24/08
> viraram fantasmas depois de terem sido entregues.
>
> Quando uma trava dispara todo dia no caso normal, ela para de ser proteção e
> vira um desvio que a equipe aprende a fazer — e o desvio acontece fora da
> vista do sistema, que é o pior lugar possível.

> ⚠️ **`SOBMEDIDA` é um balde, e isso ainda é dívida aberta.** Um código só para
> peças que são todas diferentes: a folha de controle traz apenas `SOBMEDIDA`,
> enquanto na bancada as peças vêm etiquetadas por pedido (`1027/01`, `1027/02`)
> e com **medidas quase sempre diferentes**. Nada liga o volume do ML à peça
> física — a fila pega "a mais antiga de `SOBMEDIDA`", que não diz *qual peça*.
> Hoje quem resolve é a memória de quem embala, e nenhuma das cinco conferências
> do §5 pega uma troca, porque as duas peças têm o mesmo código. Falta o cadastro
> do item sob medida (pedido, item, medida, cor, cliente) e o bipe que fecha esse
> vínculo contra **o cliente** — que é onde o erro caro mora: item trocado dentro
> do mesmo pedido chega no mesmo endereço; peça trocada entre clientes é
> reclamação.

### Quem lê o quê

- Etiqueta, revisão (`/operador`) e devolução leem **as colunas**. Um SKU sem
  medida cadastrada não imprime etiqueta e aparece só pelo código na revisão.
- `public/sku.js` (`medidaDe`) é o **único** lugar que ainda olha o texto do
  código, e serve a **um** propósito: no cadastro, quando alguém digita um
  código no formato antigo, adiantar largura, altura e cor. Os campos seguem
  editáveis e vale o que está no campo. Ela **nunca** devolve modelo.
- O que falta preencher aparece em **Admin → Pendências de SKU**.

**A trava do §6 continua valendo.** "Sem formato" não é "sem cadastro": o SKU
tem que existir em `skus`, senão o volume fica bloqueado. São coisas diferentes.

**A etiqueta impressa (Zebra ZD220, 100×35 mm, 203 dpi)** é gerada no navegador
com JsBarcode em CODE128B, a partir da aba Cadastro de SKU. Impressão exige
margens "Nenhuma" e escala 100% — "Ajustar à página" deforma as barras e o leitor
recusa.

**A etiqueta impressa (Zebra ZD220, 100×35 mm, 203 dpi)** é gerada no navegador
com JsBarcode em CODE128B, a partir da aba Cadastro de SKU. Impressão exige
margens "Nenhuma" e escala 100% — "Ajustar à página" deforma as barras e o leitor
recusa.

---

## 7-B. Compras — o módulo novo

> Especificação completa: `COMPRAS.md` (fora do repositório — peça ao dono).
> Fases 1 a 6 implementadas (1–5 em 23/08/2026, 6 em 24/08). Fase 7 (relatórios)
> pendente — espera haver história para mostrar.
> Histórico de custo (`custo_dominio.js`) e contagem de material entraram
> **antes** da Fase 6, e de propósito: os dois são relógios de história. Enquanto
> não existem, o período não fica atrasado — fica perdido, porque história não se
> reconstrói depois. A perda de corte só aparece comparando o que a ficha diz que
> foi consumido com o que sobrou na prateleira, e isso precisa de meses.

Responde três perguntas que o sistema não respondia: **o que comprar**,
**de quem comprar** e **quanto o produto custa**.

### A peça que quase todo sistema de compras erra

```
UNIDADE DE CONSUMO   como a ficha gasta        metro · unidade
UNIDADE DE COMPRA    como o fornecedor vende   barra 6 m · caixa 500 un
FATOR                quantas de consumo cabem numa de compra
```

**A embalagem mora na OFERTA, não no componente.** O mesmo tubo é barra de 6 m
num fornecedor e de 3 m no outro — se morasse no item, os dois não caberiam no
cadastro. E ninguém compra fração de embalagem: precisa de 7 m, leva 12.

Por isso a comparação mostra **sempre três números** — preço por unidade,
desembolso e sobra. Ordenar por um só, escondendo os outros, é como o comprador
é enganado.

### A ficha é fórmula, não lista

Componentes se lançam **uma vez, no modelo** — nunca SKU a SKU. Com 200 SKUs e 3
modelos são 18 linhas em vez de 1.200, e o SKU novo de amanhã custa zero.

`formula.js` é a **única porta** por onde uma expressão do banco é executada, e
**não usa `eval()`**. Uma string do banco rodando como JavaScript daria a quem
edita fórmula acesso ao `.session_secret` e aos PINs. Fórmula não salva sem
passar no teste de três medidas.

> ⚠️ **Tecido resolve por família + cor + largura de bobina**, e a quantidade
> pode depender da bobina (corte invertido). A escolha é por **custo total da
> peça**, não por menor preço por metro linear — com corte invertido a bobina
> mais cara por metro sai mais barata por peça.

### Donos únicos — não replicar

| O quê | Dono | Por quê |
|---|---|---|
| `componente.estoque` e `movimento_componente` | `componente_dominio.js` | `skus.estoque` tem nove donos e por isso não se reconstrói história |
| Custo médio | `componente_dominio.js` | Só se move no recebimento |
| Ficha e custo de um SKU | `ficha_dominio.js` | O histórico de custo precisa da MESMA conta da tela |
| Demanda por SKU (`precisa`) | `demanda_dominio.js` | O número que a fábrica produz é o que manda na compra |
| Explosão da ficha → material | `necessidade_dominio.js` | Gatilho 2 da lista de compras |
| Necessidade → desembolso | `compras_calc.js` | Custo nunca se calcula em dois lugares |
| Avaliação de fórmula | `formula.js` | Segunda porta = buraco de segurança |

> **Por que a demanda saiu do `plan_route.js`:** o `precisa` de cada SKU já
> decidia o que a fábrica produz (tela AZUL do operador). Quando ele passou a
> decidir também **o que comprar**, uma segunda cópia significaria comprar
> material para uma fábrica diferente da que existe.

### ⚠️ ARMADILHA #18 — a ficha tem DOIS números por linha, e eles nunca fecham

Desde 04/09/2026 a linha da ficha responde duas perguntas diferentes, em
colunas diferentes de `ficha_formula`:

| Coluna | Responde | Quem lê |
|---|---|---|
| `expressao` | quanto a peça **consome** | custo, compra, necessidade de material |
| `corte_largura` / `corte_altura` | a quanto a bancada **corta** | a ficha de produção |

```
tubo de uma persiana de 1,60   CONSOME 1,60 m da barra de 6 m
                               é CORTADO a 1,57 (o resto entra nas ponteiras)
```

Os 3 cm vão pro lixo. **Precificar pela medida de corte faz a fábrica parar de
pagar por eles; cortar pela medida de consumo faz a peça não entrar.** São duas
verdades, e quem um dia "unificar" está cortando ou o custo ou a peça. No
tecido a medida de corte é um **retângulo** (largura × altura + folga), no tubo
é um número só; onde não há o que cortar as duas ficam vazias, e isso é
resposta, não pendência.

O `ficha_dominio.js` soma **só** a `expressao`. Há caso travando isso: dobrar a
medida de corte não pode mexer em um centavo (`teste_ficha.js`). E falta de
preço **não apaga** a medida de corte — a bancada corta o tubo do mesmo jeito
sem fornecedor cadastrado, e ficha que some manda cortar de memória.

> Até aqui esse segundo número morava na cabeça de quem corta, que é a mesma
> doença do `SOBMEDIDA` (§7): o vínculo existe na memória e não no sistema.

### ⚠️ ARMADILHA #19 — o `/200` do tecido é um DOIS escrito dentro da fórmula

A linha de tecido do modelo Rolô era `(altura + 20) / 200`. O `/200` afirma que
cabem **duas peças por faixa** em qualquer bobina, de qualquer largura. Com as
bobinas reais (2,80 e 3,20) isso é verdade na 1,40 e na 1,60 — e falso nas duas
pontas: a de 1,00 cabe **três** na 3,20, e a de 1,80 cabe **uma só**.

| Largura | SKUs | cabe na 2,80 | cabe na 3,20 | o `/200` cobrava |
|---|---|---|---|---|
| 1,00 | 3 | 2 | **3** | 2 → 50% a mais |
| 1,20 a 1,60 | 16 | 2 (até 1,40) | 2 | 2 ✔ |
| 1,80 | 3 | **1** | **1** | 2 → **metade** |

**Pior que o número: ele curto-circuita a máquina que já existe.** O
`ficha_dominio.js` avalia a fórmula **uma vez por bobina candidata** e fica com
a de menor custo por peça — desenhado exatamente para o corte invertido. Com um
`2` fixo as duas bobinas dão o mesmo consumo, e a escolha desempata por **preço
por metro linear**, que é o critério errado: na 1,60 a bobina de 3,20 é mais
cara por metro e **mais barata por peça**.

As duas fórmulas honestas, e a distância entre elas é o valor do encaixe:

```
encaixando peças lado a lado:  (altura + 20) * largura / largura_bobina / 100
uma peça por faixa (o teto):   (altura + 20) / 100 / piso(largura_bobina / largura)
```

Na 1,80 com bobina 3,20: **0,956 m** encaixada contra **1,70 m** sozinha — 78%.
Onde a peça divide a bobina exato (1,40 na 2,80, 1,60 na 3,20) as duas
coincidem, porque não há sobra para repartir.

> **Sinal na tela:** linha de tecido cuja fórmula não menciona
> `largura_bobina` aparece com tarja âmbar "não olha a bobina", e o teste ao
> vivo mostra o resultado em **cada** bobina lado a lado. Duas colunas com o
> mesmo número são a assinatura do problema.

> ⚠️ **As medidas de teste vêm do CATÁLOGO, não de uma lista fixa.** O
> `formula.js` trazia 1,00×1,00 / 1,80×1,50 / **3,00×2,50** escritas no código,
> e a última não existe: a persiana mais larga tem 1,80 e a bobina mais estreita
> tem 2,80 — 3,00 não cabe em bobina nenhuma, e não há emenda. A fórmula honesta
> do `piso` dava **divisão por zero** ali e era recusada na tela; para conseguir
> salvar, alguém escrevia o `2` fixo. É a armadilha #6 outra vez — trava que
> dispara no caso normal vira desvio. Hoje `ficha_route.js` monta as medidas a
> partir dos SKUs do modelo (a mais estreita, a mais comum, a mais larga) e o
> `formula.js` **ignora** a medida que não cabe na bobina, dizendo qual e por quê.
> Ignorar todas não aprova: um ok sem evidência mente pior que a recusa.

**Rode `node teste_ficha.js` após qualquer mudança no `formula.js`, no
`ficha_dominio.js` ou no `ficha_route.js`** — os 34 casos travam a separação
entre consumo e corte, a conta das duas bobinas SKU a SKU, as medidas de teste
e a porta única do avaliador.

### Regras que parecem bug e não são

- **Custo indefinido nunca vira zero.** Falta preço numa linha → o total é
  `null`, não a soma parcial. Zero é um custo válido e mentiroso.
- **Não há coluna `tipo` na `ficha_formula`, e é de propósito.** A tela oferece
  tipos de linha (quantidade fixa, pela largura, pela altura, pelo tecido) que
  **geram** a expressão; o que se grava continua sendo a expressão, e a tela
  reconhece a forma de volta lendo o texto. Uma coluna `tipo` seria uma segunda
  fonte de verdade sobre a mesma linha, e as duas divergiriam no dia em que
  alguém editasse a expressão à mão — que é justamente o que a tela permite.
- **Recusar uma fórmula não pode repintar a antiga.** A tela fazia
  `alert(...)` seguido de redesenho: o texto digitado sumia e voltava a fórmula
  velha, e quem editava via a recusa e uma fórmula que não era a sua. Hoje o
  erro fica na própria linha, com o que foi digitado ainda no campo.
- **Quem recebe não vê preço.** A rota do Recebimento monta o JSON **sem** os
  campos de preço — não adianta esconder na tela e mandar pelo fio.
- **Recebimento parcial mantém o pedido aberto**, e o saldo continua contando
  como *a caminho*. Só fecha com um dos dois motivos.
- **Material devolvido não entra no estoque** e segue como *a caminho* — o
  fornecedor ainda deve.
- **Bipar código de material não conta 1.** A unidade de consumo do tubo é o
  metro; `+1` ali seria 1 metro, não 1 barra. A tela avisa e manda para o campo
  de material, onde a quantidade é digitada.
- **Zero é lançamento válido na contagem de material.** É a única forma de um
  material que acabou entrar na contagem em vez de ficar de fora dela — e ficar
  de fora é o que mantém o saldo errado no sistema.
- **Saldo de material é arredondado em 3 casas** dentro do
  `componente_dominio.js`. `3,5 + 0,2 = 3,7000000000000006` não é precisão, é
  ruído, e ele compõe: cada contagem grava o lixo da anterior. Custo médio é
  outra escala (R$ 0,0825 por parafuso é preço de verdade) e corta em 6 casas.
- **O pedido congela embalagem, fator e preço.** Mudar o preço do cadastro não
  mexe em pedido já feito.
- **Escolher fora do melhor preço exige motivo**, e vai para a auditoria.
- **A necessidade é o MAIOR dos dois gatilhos, nunca a soma**, e sempre desconta
  o que está a caminho. O mínimo existe para cobrir a venda que ainda não
  apareceu; quando ela aparece, **substitui** o mínimo em vez de somar a ele.
- **A perda de corte pertence ao gatilho 2, não ao 1.** Perda é fenômeno de
  consumo. Aplicá-la ao ponto de pedido compra *acima* do ideal — contradiz o
  nome do campo. (Estava errado até a fase 6; como `perda_pct` nasce zero em
  todos, a correção não mudou nenhum número.)
- **Venda sem ficha calculável é um buraco na lista de compras, não um zero.**
  Ela sai em `pendencias`, com o motivo, porque o total sem ela está incompleto
  e o comprador precisa saber disso. Mesma regra 4 do custo.
- **Acessório não tem medida e isso não é pendência.** `modelo.exige_medida = 0`
  dispensa largura/altura; a fórmula que precisar delas reclama sozinha, uma
  linha por vez. Antes da fase 6 o bloqueio era do SKU inteiro, e por isso todo
  acessório ficava sem ficha e sem custo para sempre.
- **Enquanto a mão de obra for zero, o número se chama "custo de material"** —
  nunca "custo do produto".

### Dívidas abertas nesta entrega

| Dívida | Detalhe |
|---|---|
| `componente` é **provisória** | O dono é `PRODUCAO-MONTAGEM.md` §6, não implementado. O que faltar entra por `ALTER`, nunca recriando |
| Não segue a forma do `ARQUITETURA-ALVO.md` | O `COMPRAS.md` §11 manda `dominio/ dados/ rotas/`. Foi construído no padrão atual do projeto — o documento não estava disponível |
| Fórmula do tecido | ~~As oito medidas da planilha fecham em 6 de 8~~ — a fórmula passou a usar `largura_bobina` em 04/09/2026 (armadilha #19). O que sobra: **quando** o corte é encaixado e quando é sozinho ainda é decisão de quem produz, e a ficha guarda uma das duas |
| Medida de corte sem valor lançado | A `ficha_formula` já tem `corte_largura`/`corte_altura` (armadilha #18), mas as folgas reais — tubo, base redonda, tecido — ainda não foram preenchidas. Enquanto forem vazias a coluna "corta a" mostra traço, que é resposta e não erro |
| Mínimos são placeholder | Foram semeados com um valor padrão ("depois eu edito"). Enquanto forem, o gatilho 1 vence quase sempre e a demanda quase não aparece na lista — não é bug da fase 6, é dado a revisar |
| Modelo ACESSORIO sem ficha | Os dois kits têm venda e nenhuma linha de ficha. Ou lançam ficha, ou viram `tem_ficha=0` (revenda) com custo direto |

---

## 8. Horário de corte e despacho

Configuráveis **por dia da semana** (`config`, chaves `corte_seg`, `despacho_seg`, etc.),
porque o Mercado Livre altera o corte sem aviso — já houve quarta-feira com corte
ao meio-dia em vez de 10:30.

| Padrão | Significado |
|---|---|
| Corte 10:30 | Vendas até esse horário são entregues no mesmo dia |
| Despacho 15:00 | Limite para levar os volumes à agência |

> ⚠️ **ARMADILHA #7 — nem todo volume de um lote sai no mesmo dia, e a etiqueta
> diz qual é qual.** Cada etiqueta traz `Despachar: qua 26/ago, antes das 15:00 h`.
> No PDF de 25/08 as **14 etiquetas tinham cinco datas diferentes** — só 6 para
> o dia seguinte, as outras 8 espalhadas por três semanas.
>
> Enquanto o `parse.js` ignorava essa linha, todo volume entrava como se fosse
> de hoje e a fila "Faltam imprimir" cobrava etiqueta de venda que só vencia
> semanas depois. Mesma doença dos volumes fantasmas por outra porta: fila que
> mostra o que não é pra agora é fila que a equipe aprende a ignorar.
>
> `fila_dia.js` é o **dono único** da pergunta "isto é trabalho de hoje?", e por
> um motivo prático: a tela faz essa pergunta duas vezes por caminhos
> diferentes — a lista de pendentes e o bipe do SKU (`/api/proximo/:sku`). Com
> réguas diferentes, a lista cobraria um volume que o leitor não acha.
>
> Entram na fila: o que vence hoje, **o que já venceu** (atraso tem que gritar,
> não sumir) e **o que não tem data lida** (volume invisível é pior que volume
> cedo demais). O que vence depois aparece no painel "Pra despachar depois", que
> existe para o planejamento enxergar sem poluir o dia. O filtro por `data` (dia
> da importação) saiu: volume que entrou ontem e vence hoje é trabalho de hoje.

> **Venda futura é trabalho adiantável, não arquivo morto.** O bipe do SKU
> (`/api/proximo/:sku`) **não** filtra por prazo — quem decide é a ordem
> (`ORDEM_URGENCIA`): sem data e vencido primeiro, depois hoje, e só então o
> futuro. Assim o operador nunca adianta uma venda de setembro enquanto existe
> uma atrasada do mesmo SKU esperando, e, esgotadas as do dia, o bipe segue
> trabalhando em vez de dizer que não há nada.
>
> O que impede adiantar o que não pode é a **trava de estoque que já existia**:
> sem peça na prateleira, nada é impresso. É exatamente a regra do dono — *"só
> se tiver estoque disponível"* — sem precisar de trava nova.
>
> Quando o volume escolhido é futuro, a resposta traz `adiantado:true` e a tela
> abre um aviso azul com a data por extenso. Ele é obrigatório: uma venda de
> setembro que passe por urgente faz o operador gastar peça que amanhã pode
> faltar para quem tem prazo curto.
>
> **O ano não vem na linha** e é inferido dos dois lados da virada: `05/jan`
> lido em dezembro é do ano seguinte, `20/dez` lido em janeiro é do ano anterior.
> A janela é assimétrica (−60 / +180 dias) porque atraso de despacho é curto e
> envio programado legítimo chega a semanas.

A tela de revisão mostra o corte no aviso de status. A tela de Etiqueta de Venda
mostra contagem regressiva para o despacho, ficando **amarela** abaixo de 2 h e
**vermelha** abaixo de 1 h quando ainda há volumes pendentes.

---

## 9. Devoluções

Fluxo em duas etapas, com responsabilidades separadas:

**Etapa 1 — Revisão (`/devolucao`):** quem recebe a peça bipa o código da etiqueta
do ML, escolhe cor + medida (dois toques, montando o SKU), e preenche a triagem
física: embalagem, tecido, tubo, base, comando, kit, destinação.

**Etapa 2 — Admin (aba Devoluções):** quem olha o Mercado Livre responde se
afetou a reputação e qual o motivo comercial. Só então dá baixa.

**O operador informa o SKU que está vendo fisicamente.** O sistema busca a venda
original pelo código e mostra o SKU enviado — mas **não preenche** o campo. Se os
dois divergirem, o admin recebe alerta de **DIVERGÊNCIA**, que é a evidência de
envio errado.

Se a venda original não existir no sistema (devoluções antigas), tudo funciona
normalmente — o vínculo é bônus, não requisito.

**Destinação `reembalar`** insere na `fila` com `modo='devolucao'`: a peça segue o
fluxo normal de embalagem, com kit e cronômetro, e vira estoque como qualquer outra.

---

## 10. Autenticação e permissões

`auth.js` implementa: PIN de 4 dígitos com hash `scrypt` + salt individual, cookie
de sessão assinado com HMAC-SHA256, permissões por **área** (não por cargo fixo).

Fluxo de login desenhado para tablet: grade de nomes → teclado numérico → entra.

### ⚠️ ARMADILHA #3 — a ordem no `server.js` é arquitetura, não estilo

```js
app.use(express.json({limit:'25mb'}));
require('./auth')(app, db);                              // ← ANTES
app.use(express.static(path.join(__dirname, 'public'))); // ← DEPOIS
```

Invertendo essa ordem, o Express entrega os arquivos direto do disco e **qualquer
pessoa acessa `/index.html` sem senha**. As rotas `.html` estão explicitamente na
lista protegida em `auth.js` justamente por isso.

**Teste obrigatório após qualquer mudança em `auth.js` ou `server.js`:**

```bash
for r in / /admin /index.html /painel /operador /api/skus; do
  printf "%-14s " "$r"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010$r
done
curl -s -o /dev/null -w "/login  %{http_code}\n" http://localhost:3010/login
```

Esperado: telas `302`, API `401`, `/login` `200`.
**Qualquer `200` numa tela é furo de segurança.**

Proteção contra força bruta: 5 PINs errados bloqueiam a pessoa por 1 minuto.

---

## 11. Modo teste

Marca tudo que acontece enquanto ligado, fotografa o estoque na ativação, e ao
encerrar permite **apagar** (restaurando o estoque à foto) ou **manter** (promovendo
a produção real). Tarja amarela aparece em todas as telas via `nav.js`.

> **Por que a foto do estoque:** estoque é número corrido, não lista de linhas.
> Apagar as revisões de teste não desfaria o `+1` que cada uma somou.

**São duas fotos, não uma.** `skus.estoque`/`alvo` e, desde a contagem de
material, `componente.estoque`/`custo_medio`. Apagar as linhas de
`movimento_componente` não desfaz o saldo pela mesma razão de sempre — quem
guarda o saldo é a coluna, o movimento é só a história dela.

**Cobertura atual (10 tabelas):** `revisao`, `producao`, `montagem`, `lote`,
`fila`, `devolucao`, `rejeicao`, `contagem`, `contagem_pendente` e
`movimento_componente`. (`foto_estoque` saiu na Fase 3.)

A lista fica em `TABELAS`, no topo do `teste_route.js`. Cada entrada traz a coluna
de chave primária — hoje todas usam `id`. O campo ficou genérico por causa da
`foto_estoque` (PK = `data`), removida na Fase 3. Ao acrescentar uma tabela, basta
incluí-la nessa lista: trigger, contagem, limpeza e "manter" saem dali.

> ⚠️ **`teste_route` tem que ser o ÚLTIMO `require` do `server.js`.** Ele cria
> triggers em cima de tabelas de outros módulos (`fila`, `devolucao`, `rejeicao`
> e `contagem`). Subindo antes, num banco novo essas tabelas ainda
> não existem, o `try/catch` engole o erro e o modo teste volta a sujar dado real
> **sem avisar**.

**Se um trigger falhar**, a tabela entra em `naoCobertas` no `GET /api/teste` e a
aba Modo teste mostra um alerta âmbar. Falha de cobertura é visível, não silenciosa.

---

## 12. Armadilhas técnicas do ambiente

| Armadilha | O que acontece | Como evitar |
|---|---|---|
| **`node --check` obrigatório** | Um `}` sobrando derruba o `<script>` inteiro; a tela abre e nada funciona, sem erro visível | Rodar após toda edição de `.js` e do bloco `<script>` de `.html` |
| **Código colado por cima do velho** | Linhas duplicadas sobram embaixo e quebram a sintaxe | Conferir o entorno do trecho editado |
| **WAL do SQLite** | `dados.db` tem ~4 KB; os dados estão em `dados.db-wal`. `cp dados.db` produz backup **vazio** | Usar `node backup.js`, que chama `db.backup()` |
| **`pm2 restart` cacheia** | A alteração não aparece | `pm2 delete expedicao && pm2 start server.js --name expedicao` |
| **`!` no bash** | Expansão de histórico quebra heredocs e `sed` | `set +H` antes de blocos com `!` |
| **`express.json()` 100 kb** | Bloqueia upload de PDF | Já elevado para 25 mb — não reduzir |
| **pdf.js quebra números** | Pack IDs vêm com espaços no meio | Regex que rejunta dígitos (já em `parse.js`) |
| **Campo invisível no iPad** | Leitor bipa e nada acontece — iOS tira o foco de campos fora da tela | Campos de bipe devem ser **visíveis**, com `autocorrect="off"` |
| **Leitor manda Tab ou espaço** | Código chega picado ou o Enter cai no vazio | Aceitar Enter **e** Tab; limpar com `replace(/[^A-Za-z0-9]/g,'')`; processar por timeout após a última tecla |

### Como verificar a sintaxe do `<script>` de um HTML

```bash
python3 -c "
s=open('public/ARQUIVO.html',encoding='utf-8').read()
a=s.index('<script>')+8; b=s.index('</script>',a)
open('/tmp/chk.js','w',encoding='utf-8').write(s[a:b])
" && node --check /tmp/chk.js
```

> Atenção: use `.index` (primeiro `</script>`), **não** `.rindex` — o último
> fecha o bloco do `nav.js` e o código acabaria inserido no lugar errado.
> Isso já aconteceu duas vezes.

---

## 13. Protocolo de trabalho

**Antes de editar:**
1. Ler a seção relevante deste arquivo
2. Ver o trecho real (`grep -n`), nunca editar de memória
3. Backup: `cp arquivo.js arquivo.js.bak-$(date +%H%M)`

**Depois de editar:**
1. `node --check` no arquivo
2. Se mexeu em auth/server: rodar o teste de segurança da seção 10
3. Testar no navegador com refresh forçado (Ctrl+Shift+R / Cmd+Shift+R)

**Deploy:**
```bash
# no Mac
git add -A && git commit -m "..." && git push

# no servidor
cd /opt/expedicao && git pull && node --check server.js && pm2 restart expedicao
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010/login   # tem que dar 200
```

**Regra de ouro:** o servidor **só recebe** (`git pull`). Nunca editar direto lá.

---

## 14. Dívidas técnicas conhecidas

Ordenadas por risco. Não são bugs desconhecidos — são decisões adiadas.

| # | Dívida | Risco |
|---|---|---|
| 1 | ~~Modo teste não cobre `fila`, `devolucao`, `rejeicao`, `contagem`, `foto_estoque`~~ **RESOLVIDO em 14/08/2026** — ver §11 | — |
| 1b | ~~`fila` não tem `CREATE TABLE` em lugar nenhum~~ **RESOLVIDO em 14/08/2026** — criada em `db.js` | — |
| 1d | ~~`revisao.modo` e `producao.origem`/`urgente` sem migração~~ **RESOLVIDO em 14/08/2026** — auditoria completa, ver §17 | — |
| 1c | **Embalagem em teste consome linha real da `fila`** — `mont_route.js:11` pega a mais antiga `aguardando` sem olhar `teste`; ao apagar os testes a linha real fica presa em `embalado` | Médio — peça real some da fila |
| 2 | **Sem HTTPS.** PINs trafegam em texto aberto | Alto se exposto à internet |
| 3 | **Revisão perdida em falha de conexão** — sem fila local de reenvio | Médio — buraco silencioso no relatório |
| 4 | `POST /api/producao` (manual) não aceita `data`, `origem` nem `urgente` | Médio — impede lançar adiantado pela tela |
| 5 | Upload não permite escolher a data das vendas | Médio — vendas de amanhã entram como hoje |
| 6 | `POST /api/revisao` retorna campos obsoletos (`estoque`, `pedido`, `feito`) | Baixo — confunde quem lê a API |
| 7 | ~~SKU `BK110X240BEGE` fora do padrão~~ **RESOLVIDO em 23/08/2026** — não há mais padrão de SKU; etiqueta e seletor leem as colunas (§7) | — |
| 8 | `/devolucao` não está no menu do rodapé (`nav.js`) | Baixo |
| 9 | Revisão e embalagem não gravam **quem** fez (só `rejeicao` grava) | Baixo — impede produtividade por pessoa |
| 10 | Sem testes automatizados na maior parte — hoje há `teste_parse.js` (12 casos), `teste_carga.js` (18), `teste_divergencia.js` (15) `teste_estoque.js` (54), `teste_cruzamento.js` (14), `teste_etiqueta.js` (13) e `teste_ficha.js` (34); o resto não tem | Médio a longo prazo |
| 11 | **A investigar: o que é o `Quantidade` da folha** — a regra é uma venda = uma etiqueta = uma persiana (§5), então esse campo não deveria vir maior que 1. Ninguém decide nada com ele hoje. Falta abrir um PDF real com `Quantidade > 1` e entender o que aquele número diz | Baixo enquanto nada o usar — mas é uma pergunta sem resposta sobre o documento de origem |
| 12 | **NO RADAR: trazer para o PCP o que o sob medida já tem** — decisão de 03/09/2026, sem prazo. Quatro coisas, em ordem de valor: (a) tabela `parametro` com rótulo, unidade e a explicação do que o número muda, no lugar do `config` chave/valor cru; (b) migrações numeradas com tabela `migracao`, que mata a dívida do §17 de vez; (c) registro de rotas em que **rota sem permissão declarada nasce negada**, que fecha o buraco de cobertura do `CONTROLE-DE-ACESSO.md` §1; (d) envelope único `{ok,dados}` / `{ok,motivo,mensagem}`, hoje cada rota responde de um jeito | Nenhum enquanto não for feito — é melhoria, não correção. Mas cada mês que passa é mais rota nova no padrão antigo |

---

## 15. O que NÃO fazer

- ❌ Somar a medida de **corte** em custo nenhum — ela é o outro número da linha,
  e os dois nunca fecham (§7-B, armadilha #18)
- ❌ Escrever um número fixo de peças por bobina dentro da fórmula do tecido
  (`/200`) — quem decide quantas cabem é a `largura_bobina` (§7-B, armadilha #19)
- ❌ Voltar a testar fórmula contra uma lista fixa de medidas: a de 3,00 m não
  cabe em bobina nenhuma e reprovava a fórmula certa (§7-B, armadilha #19)
- ❌ Calcular a falta de estoque fora do `demanda_dominio.js` — a aba Estoque e a
  tela azul do operador têm que dizer o mesmo número (§18)
- ❌ Fazer a revisão somar estoque "porque parece que falta"
- ❌ Fazer a reimpressão baixar estoque "porque imprimiu de novo"
- ❌ Multiplicar volume por "quantidade" em qualquer lugar — uma venda é uma
  etiqueta é uma persiana (§5); já foi tentado e revertido, e há teste travando
- ❌ Fazer a leitura por pedaços (`split` em `Desenho do tecido`) voltar a rodar
  antes do tokenizer no `parse.js` — manda a peça errada pro cliente (§5)
- ❌ Mover `express.static` para antes do `auth`
- ❌ Usar `cp dados.db` como backup
- ❌ Editar arquivos direto no servidor
- ❌ Criar tabela de equivalências de SKU (decisão explícita do dono)
- ❌ Remover a trava de SKU não cadastrado
- ❌ Usar `.rindex('</script>')` ao inserir JS em HTML
- ❌ Commitar `.session_secret`, `dados.db`, `tecido.db`, `backups/` ou `lotes/`
- ❌ Separar o sob medida de novo em outro servidor/porta — já foi, durou um
  dia, e o beco sem saída da liberação está descrito na §19
- ❌ Acrescentar área de sob medida sem pôr a linha correspondente no
  `PERM_AREA` do `acesso.js` — o acesso some sozinho, em silêncio (§19)
- ❌ Escrever cor nova no `tecido/public/base.css` sem que ela exista nas telas
  do PCP — paleta "quase igual" é o que faz parecer outro sistema (§19)
- ❌ Guardar preço no cadastro do fornecedor para multiplicar na hora de mostrar
  — o estoque comprado antes muda de valor no dia do reajuste (§19, armadilha #15)
- ❌ Somar zero pelo rolo sem nota lançada: o total é PISO, com o `≥` na frente
- ❌ Dividir a média diária por uma janela maior que a história registrada — o
  número sai menor que a verdade, sem erro e sem aviso (§19, armadilha #16)
- ❌ Contar `ajuste` ou `encerramento` como saída de tecido: nenhum dos dois é
  corte (§19, armadilha #16)
- ❌ Somar as larguras de bobina do mesmo tecido numa conta de cobertura — não
  há emenda, são estoques diferentes (§19, armadilha #17)
- ❌ Pôr o estoque parado no numerador da cobertura do conjunto: a folga dobra
  justamente porque há dinheiro dormindo (§19, armadilha #17)
- ❌ Podar preço por LISTA de nomes: ela envelhece em uma semana e o campo novo
  viaja pelo fio até a bancada (§19, quem vê o quê)
- ❌ Começar a lista de medida da sobra no mínimo do refugo — o `sobra.criar`
  não exige esse mínimo, e o operador com a peça menor na mão escolheria o
  valor errado de propósito (§19, a medida vira lista)
- ❌ Deixar a bancada criar um cadastro **sem** marcá-lo para conferência, ou
  marcar **sem** ele aparecer na lista de Cadastros — meia decisão é pior que
  a trava que existia antes (§19, armadilha #14)

---

## 16. Glossário do negócio

| Termo | Significado |
|---|---|
| **Corte** | Horário limite para uma venda ser entregue no mesmo dia |
| **Despacho** | Horário limite para levar os volumes à agência do ML |
| **Kit** | Kit de instalação que vai dentro da caixa, com QR do manual |
| **Folha de controle** | Página do PDF do ML que traz o SKU de cada venda |
| **Pack ID** | Identificador do volume no Mercado Livre |
| **Alvo** | Quantidade que o estoque de um SKU deveria ter |
| **Reposição** | Produção para refazer o estoque consumido por uma venda |
| **Urgente** | Venda sem estoque — cliente esperando, sai no mesmo dia |
| **Adiantamento** | Ordem de amanhã produzida hoje, se sobrar tempo |

---

## 17. Schema: instalação limpa tem que bater com produção

Não há migrations. Cada tabela nasce de um `CREATE TABLE IF NOT EXISTS` inline.
O banco de produção foi ganhando colunas **à mão** ao longo do tempo, e esses
`ALTER TABLE` nunca voltaram para o código — o resultado era um `CREATE` que não
descrevia mais o banco real. Auditoria de 14/08/2026 fechou o buraco:

| Tabela | Estava faltando no `CREATE` | Onde é usada |
|---|---|---|
| `fila` | a tabela **inteira** | `server.js`, `dev_route`, `mont_route`, `ger_route` |
| `producao` | `origem`, `urgente`, `teste` | `cruz_route.js:35-36`, `st_route.js:14` |
| `revisao` | `modo`, `teste` | `server.js:49`, `st_route.js:15`, `ger_route.js:37` |
| `montagem` | `teste` | `teste_route` |
| `lote` | `teste` | `teste_route` |
| `foto_estoque` | `teste` | `teste_route` |

**Regra daqui pra frente:** coluna nova entra no `CREATE TABLE` do módulo **no
mesmo commit** em que o código passa a usá-la. Se precisar existir também no
banco de produção, o `ALTER` correspondente vai junto, com a coluna acrescentada
**no fim** — é onde o SQLite a coloca, e é o que mantém a ordem igual à de lá.

> ⚠️ **O `ALTER` guardado mora no módulo dono da tabela.** Um `ALTER` de
> `contagem_pendente` ficou no `compras_schema.js`, que roda no boot do `db.js`
> — antes de `cont_route.js` criar a tabela. Num banco **novo** a guarda não
> achava a tabela e pulava; a coluna só nascia no segundo boot. Em produção nada
> aparecia, porque lá a tabela já existia. Instalação limpa é justamente o caso
> que essa seção existe para proteger.

> ⚠️ `ALTER TABLE ADD COLUMN` **não aceita default dinâmico** no SQLite
> (`(datetime('now','localtime'))` é recusado). Colunas de data adicionadas por
> `ALTER` ficam sem default e entram `NULL` — foi o risco que quase pegou
> `fila.revisado_em`, que ordena a tela de embalagem.

**Como conferir** que o código bate com o banco (roda no servidor):

```bash
cd /opt/expedicao
for t in skus producao revisao fila montagem lote devolucao rejeicao contagem foto_estoque; do
  printf "%-13s " "$t"; sqlite3 dados.db "SELECT GROUP_CONCAT(name,', ') FROM pragma_table_info('$t');"
done
```

Compare com a §3 do `docs/ARQUITETURA.md`. Diferença ali é dívida nova.

---

## 18. A aba Estoque do admin

Reformada em 01/09/2026. Antes dela a aba era três contadores e uma tabela; o
que mudou não foi a aparência, foi **de onde sai o número**.

### ⚠️ ARMADILHA #12 — duas telas diziam "a repor" e não era o mesmo número

A aba calculava `alvo − estoque`, lendo o `skus.alvo` **gravado**. A tela AZUL do
operador calcula `comprometido + alvo − estoque`, ao vivo, no `demanda_dominio`.

Faltava na conta do admin justamente o **comprometido** — a venda já feita, com
envio marcado pra frente. O admin cobrava um número e a fábrica produzia outro,
e ninguém via a diferença: as duas telas estavam certas, cada uma na sua régua.
É a mesma doença que aposentou a tela `/necessidade` no mesmo dia.

Hoje `est_route.js` (`GET /api/estoque/painel`) é a porta única da aba, e ela lê
o **mesmo** `demanda_dominio` da tela azul. O `teste_estoque.js` compara os dois
SKU a SKU — escrever uma segunda conta na tela quebra o caso 1.

**Dois defeitos vinham junto, e sumiram com a correção:**

| O que era | Por que acontecia |
|---|---|
| Alvo velho cobrado como se fosse de hoje | `skus.alvo` só muda quando alguém clica "Aplicar" no Planejamento, e o "aplicar todos" **só mexe em SKU com venda na janela**. SKU que parou de vender guardava o alvo do mês passado para sempre |
| **Sob medida em falta eterna** | A peça feita contra o pedido nunca tem estoque (§7). Com um alvo legado > 0 gravado, `alvo − estoque` dava falta todo dia. O alvo ao vivo de sob medida é **zero**, então a linha só pede produção quando há venda comprometida |

O alvo salvo não sumiu: vai em `alvo_salvo`, e quando discorda do cálculo a
célula mostra "salvo N" em âmbar, com o chip **Alvo velho** para filtrar e a
data do último "Aplicar" no rodapé. Alvo defasado que se parece com alvo de
hoje é o que faz a conta "quebrar" sem ninguém notar.

### O painel

| Bloco | De onde vem |
|---|---|
| Faixa: em estoque · cobertura · SKUs em falta · peças a produzir · entrou/saiu hoje | `demanda_dominio` + `fluxo_estoque` |
| Gráfico **entrou × saiu**, 30 dias, espelhado no eixo | `fluxo_estoque.serie()` |
| Semáforo em chips (zerado · abaixo · ok · excesso · parados · sob medida · alvo velho · nunca conferido) | filtra em memória, sem ida ao servidor |
| Tabela com cobertura em dias, último ajuste e idade do inventário por SKU | idem |
| **Últimos ajustes manuais** | `ajuste_estoque` |
| Exportar CSV (respeita o filtro) e **aplicar alvo** | navegador; `POST /api/planejamento/aplicar` |

> **A idade do inventário fica colada no saldo** porque é sobre ele: `skus.estoque`
> tem vários donos e não se reconstrói (§14), então a contagem é o único momento
> em que a coluna volta a bater com a prateleira. Acima de 30 dias vira âmbar;
> quem nunca foi contado tem chip próprio, que serve de lista de trabalho no dia
> do inventário. Contagem de **material** e contagem em **modo teste** não contam
> como conferência de peça.

> ⚠️ **O botão "aplicar alvo" diz quantos ele NÃO resolve.** O "Aplicar todos" do
> Planejamento só grava em SKU **com venda na janela** — proposital: sem dado de
> venda ele zeraria o alvo de quem tem história e não vendeu no período. Então a
> tela separa `alvo_defasados` de `alvo_aplicaveis` e escreve os dois no rodapé.
> Prometer "aplicar todos" e deixar o aviso de pé depois do clique ensina a
> equipe a desconfiar da tela — que é o mesmo fim da armadilha #10.
>
> O botão existe porque a tela passou a **acusar** o alvo velho: acusar sem
> oferecer o reparo, mandando a pessoa para outra aba, é como uma trava que não
> sabe liberar (§5). Ele chama a MESMA rota do Planejamento; não há segundo
> caminho de escrita no alvo.

> **`fluxo_estoque.js` é o dono único de ENTROU e SAIU** — `montagem` (o +1 da
> embalagem) e `lote.embalado_em` (o −1 da etiqueta). O `/api/fechamento` do
> Planejamento passou a ler dele: o painel mostra o mesmo movimento em série de
> 30 dias, e um gráfico com régua própria é pior que nenhum, porque confirma com
> autoridade um número que a outra tela não usa.
>
> **Ajuste manual e contagem NÃO entram no gráfico**, de propósito: os dois
> mexem no saldo e nenhum é produção nem venda. Somados às barras, o gráfico
> deixaria de responder "quanto a fábrica fez e quanto saiu" e passaria a
> responder "quanto a coluna variou", que ninguém perguntou. O ajuste tem número
> próprio na faixa e card próprio embaixo.

> **O histórico existia e nenhuma tela lia.** `GET /api/estoque/ajustes` está de
> pé desde que o ajuste passou a exigir motivo — gravando quem, quando, de→para
> e por quê — e até 01/09/2026 nada o chamava. Metade do valor do registro
> estava desligada: o dado era gravado e ninguém conseguia ler. Hoje sai no card
> "Últimos ajustes" e no botão **histórico** de cada linha.

> **O painel NÃO entra na cadência de 4 s do admin.** O `AUTO_ADMIN` recarrega a
> tela inteira de 4 em 4 segundos; este painel calcula a demanda do catálogo
> todo. Ele só atualiza com a aba aberta, no máximo a cada 12 s, e nunca por
> cima de um ajuste aberto — a linha sumiria da mão de quem está preenchendo.

**Rode `node teste_estoque.js` após qualquer mudança no `est_route.js`, no
`fluxo_estoque.js`, no `demanda_dominio.js`, no `painel_route.js` ou no
`ger_route.js`** — os 53 casos travam a conta única nas quatro telas, o sob
medida, o parado, a série do gráfico, a idade do inventário, o gate do custo e o
acordo com o fechamento diário do Planejamento.

### A TV e o gerencial entraram na mesma régua (01/09/2026)

Depois da aba, sobravam **duas telas medindo falta contra o `skus.alvo` gravado**
— quarta e quinta réguas da mesma pergunta:

| Onde | O que era | O que é |
|---|---|---|
| `painel_route.js` (a TV do chão de fábrica) | `aProduzir = pedido + alvo − estoque`, misturando as ordens do dia com a reposição, medida contra a foto | **duas** colunas: `faltaHoje` = pedido − produzido, e `precisa` = `demanda_dominio` |
| `ger_route.js` (gerencial) | `falta = alvo − estoque` dos SKUs com `alvo > 0`, sem o comprometido | `DEMANDA.aProduzir()`, os 12 maiores |

> ⚠️ **`faltaHoje` e `precisa` NÃO SE SOMAM, e é por isso que têm nomes
> próprios.** A primeira é o que sobrou das ordens lançadas hoje — o trabalho
> que está na bancada agora. A segunda é o que o estoque pede, a mesma conta da
> tela azul. Somar as duas seria inventar a sexta régua; a tela escreve isso
> embaixo da tabela, porque quem lê uma TV de longe soma o que vê.

> ⚠️ **O cache de 20 s do `painel_route` é obrigatório.** A TV recarrega de 3 em
> 3 segundos e o `calcular` percorre a planilha de vendas e o catálogo inteiro —
> sem cache, são 1.200 varreduras por hora com a TV ligada. Ele é **local da
> rota**, e não dentro do `demanda_dominio`: quem grava alvo ou decide compra
> precisa do número fresco, e um cache escondido no domínio entregaria dado
> velho para eles sem avisar.

O `aProduzir` continua na resposta como apelido de `faltaHoje`, para não quebrar
consumidor antigo da rota. Não use em tela nova.

### O dinheiro parado na prateleira (01/09/2026)

A aba passou a mostrar **quanto vale o estoque** e, no mesmo card, **quanto
disso está parado** — SKU com peça e nenhuma venda na janela. O custo por SKU
sai do `ficha_dominio` (dono único, §7-B): uma segunda soma aqui divergiria da
tela de custo no primeiro preço lançado.

> ⚠️ **REGRA 4 OUTRA VEZ: CUSTO INDEFINIDO NUNCA VIRA ZERO.** SKU sem preço de
> fornecedor não entra na soma como zero — ele é contado à parte (`sem_custo`) e
> o total aparece como **piso**, com o `≥` na frente e o aviso em âmbar. Zero
> faria o estoque parecer mais barato do que é, e ninguém saberia por quê. Na
> tabela, esse SKU mostra traço, nunca `R$ 0,00`.
>
> SKU **sem peça** também mostra traço na coluna de valor: `R$ 0,00` se lê como
> "não vale nada", que é outra afirmação. O custo por peça continua ali, porque
> esse segue verdadeiro.

> ⚠️ **QUEM NÃO TEM `custo.ver` NÃO RECEBE OS CAMPOS** — o JSON sai sem eles,
> não é a tela que esconde (regra 14 do §13: não adianta esconder na tela e
> mandar pelo fio). O CSV segue a mesma regra. O acesso vai para a auditoria,
> mas **amortecido**: no máximo uma linha por pessoa a cada 30 minutos, porque a
> aba se recarrega sozinha a cada 12 s e uma linha por refresh enterraria a
> auditoria de verdade em ruído.

> Cache de 60 s no custo, local da rota: custo só muda quando alguém lança
> preço, recebe material ou mexe na ficha — não a cada refresh.

Enquanto a mão de obra for zero, o número se chama **custo de material**
(regra 17 do §7-B), e é isso que está escrito no card.

---

## 19. A SEGUNDA OPERAÇÃO — sob medida (`/sobmedida`)

A fábrica tem **duas operações**, e até 02/09/2026 o CLAUDE.md só descrevia uma.

| | **Medida padrão** | **Sob medida** |
|---|---|---|
| O que é | Persianas prontas, vendidas pelo Mercado Livre | Corte de tecido contra o pedido do cliente |
| Onde vive | tudo que este arquivo descreve até a §18 | `tecido/`, montado em `/sobmedida` |
| Banco | `dados.db` | `tecido.db` |
| Entra pelo | mesmo PIN | mesmo PIN |

O módulo tem `README.md` próprio em `tecido/`. **Leia-o antes de mexer lá** —
ele tem regras que parecem bug e não são, como este arquivo tem as dele.

### É um módulo montado, não um segundo servidor

```js
// server.js, depois do teste_route
try{ require('./tecido/montar').montar(app); }catch(e){ /* 503 só no /sobmedida */ }
```

> ⚠️ **O TRY/CATCH NÃO É PREGUIÇA.** O módulo roda migrações no boot. Um banco
> de tecido corrompido ou um disco cheio derrubaria, sem ele, a **expedição
> inteira** junto — e a expedição é quem despacha o dia. O sob medida fora do
> ar para três pessoas é um problema; a expedição fora do ar para a fábrica
> toda é outro.

> ⚠️ **Não é preciso `npm install` dentro de `tecido/`.** As dependências
> (`better-sqlite3`, `express`) são as mesmas versões da raiz, e o Node resolve
> subindo. Uma segunda árvore de dependências é uma segunda coisa para
> atualizar e esquecer.

### ⚠️ ARMADILHA #13 — a área de acesso é SOMBRA, e sombra se apaga sozinha

A liberação do sob medida é uma **área do PCP**, marcada em Admin → Acessos.
O portão em `tecido/montar.js` lê `req.usuario.areas`.

Só que, no modelo novo de acesso (`acesso.js`), **`usuarios.areas` não é mais
editada à mão**: ela é recalculada a partir das permissões efetivas, pelo mapa
`PERM_AREA`. Uma área que não está nesse mapa é apagada no primeiro
salvamento de acesso de qualquer pessoa.

```js
// acesso.js — sem estas duas linhas, a integração falha EM SILÊNCIO
['sobmedida.cortar','sobmedida'], ['sobmedida.cadastrar','sobmedida_adm']
```

O modo de falhar é o pior possível: o admin marca o acesso, a tela confirma, e
o acesso some sozinho depois — sem erro, sem log, sem ninguém saber por quê.
Há teste travando as duas pontas (`tecido/teste/acesso.test.js`).

**As três coisas andam juntas.** Chave em `permissoes.js`, setor em
`acesso.js` (`setoresNativos`), linha em `PERM_AREA`. Faltando qualquer uma,
não há como liberar ninguém.

### Por que a liberação não mora mais lá dentro

Na primeira versão o módulo tinha cadastro de pessoas e PIN próprios. Custou,
no primeiro dia de produção:

| Defeito | O que era |
|---|---|
| Botão não fazia nada | O `/admin` monta as telas em iframe; o login do outro sistema abria dentro do quadro |
| `ERR_CONNECTION_TIMED_OUT` | A porta 3020 não estava no `ufw` |
| **Beco sem saída** | Liberar alguém exigia estar liberado. A única conta era a do boot |

O terceiro é o que decidiu a arquitetura. **Uma tranca que não sabe liberar é
uma tranca que a equipe aprende a contornar** — é a mesma lição da §5
(Bloqueados → escolher) e da armadilha #6. E dois cadastros de gente são dois
lugares para lembrar de bloquear alguém: desligar no PCP e esquecer do outro é
o furo que nenhum log acusa.

### Design: dois contextos, e a paleta é a MESMA

O `docs/DESIGN.md` §1 manda operação em fundo **claro** e admin em **escuro**.
No sob medida isso vale por tela, declarado em `tecido/nucleo/telas.js`, e
carimbado pelo servidor num `data-contexto` no `<html>`.

> ⚠️ **A primeira versão usou uma paleta *quase* igual** — `#12161c` no lugar
> de `#1a1d23`, `#1f6feb` no lugar de `#1565c0`, e assim nas sete cores.
> Nenhuma batia. Diferente o bastante para o olho perceber, perto o bastante
> para não parecer proposital, e o efeito é a equipe sentir que entrou em
> outro sistema. Hoje os hex são **copiados** de `public/operador.html` e
> `public/index.html`. Cor nova lá só entra se entrar aqui também.

### ⚠️ ARMADILHA #14 — a bancada não espera a chefia, e a lista é obrigatória

Até 03/09/2026 largura de bobina e endereço eram cadastro de chefia. Isso não
fazia a bancada esperar: fazia a bancada **mentir**. Rolo na mão e largura fora
da lista, o que saía era o toque no botão de 2,00 para o sistema aceitar — e a
partir dali o encaixe corta por uma largura que aquele tubo não tem. Endereço
não cadastrado dava o outro desvio: rolo lançado **sem endereço**, "para
endereçar depois", e o depois não existe.

É a armadilha #6 (§7) outra vez: trava que dispara no caso normal vira desvio
que a equipe aprende a fazer, e o desvio acontece fora da vista do sistema.

A troca foi de **ordem**, não de rigor — `lançar → marcar → a chefia confere`
no lugar de `pedir → esperar → lançar`. Duas peças, e **as duas são
obrigatórias**:

| Peça | Onde | Sem ela |
|---|---|---|
| o cadastro nasce marcado (`conferir=1`, com quem criou) | `endereco.js`, `largura.js` | soltar vira soltar sem rastro |
| a lista "Conferir" no topo de Cadastros | `dominio/conferir.js` | não é "a chefia confere depois", é **ninguém confere** |

> ⚠️ **NUNCA SOLTE UM CADASTRO PARA A BANCADA SEM PÔR ELE NA LISTA.** Meia
> decisão é pior que qualquer uma das duas inteiras: a trava ao menos avisava.

**Criar** é da bancada (`endereco.criar`); **renomear e apagar** continuam da
chefia (`cadastro.editar`). A assimetria é a regra — o buraco novo na
prateleira aparece com o tubo já na mão; arrumar um nome torto espera.

### ⚠️ ARMADILHA #15 — preço no cadastro do fornecedor anda para trás

Desde 03/09/2026 o rolo sabe **de quem veio e quanto custou**. A forma óbvia
seria uma coluna de preço no cadastro do fornecedor, multiplicada na hora de
mostrar. Ela quebra em silêncio: no dia do reajuste, **todo o estoque comprado
antes muda de valor retroativamente** — o rolo pago a R$ 18 em março passa a
valer R$ 22 porque houve reajuste em setembro, e ninguém percebe, porque o
número só fica maior.

O preço mora em `rolo.preco_m2`, **congelado na compra** — a regra do
`COMPRAS.md` (*o pedido congela embalagem, fator e preço*). E **não há tabela
de preço**: o que pré-preenche a próxima entrada é o *último preço realmente
pago*, tirado das próprias entradas. Tabela mantida à mão envelhece calada.

As outras três regras vieram inteiras do PCP, e valem igual aqui:

| Regra | Onde já doeu |
|---|---|
| Custo indefinido nunca vira zero — o total sai como **piso** (`≥`) | §18, regra 4 do §7-B |
| Quem não tem `custo.ver` **não recebe os campos** no JSON | regra 14 do §13 |
| **Parado é tempo sem sair**, não idade — e lista que acusa quem trabalha ninguém lê | armadilha #10 |

`tecido/dominio/custo.js` é o **dono único de "quanto vale"**. Segunda soma em
qualquer tela divergiria no primeiro preço lançado, e as duas estariam "certas"
— cada uma na sua régua. É a armadilha #12 outra vez.

### ⚠️ ARMADILHA #16 — média cuja janela é maior que a história

O painel "O que sai" (Painel → O que sai) responde qual tecido gira mais, qual
bobina se usa mais e a média diária por cor. O defeito que ele poderia ter não
daria erro nenhum:

```
média de 12 dias de história ÷ 30 dias de janela
= um número 2,5× MENOR que a verdade, com cara de fato
```

Ninguém descobre olhando: o comprador lê "gastamos 4 m²/dia", compra para isso,
e a fábrica gasta 10. Por isso `giro.janela()` corta a janela pedida no
**primeiro consumo registrado** e a tela **escreve em âmbar** quando os dois
diferem. Média sem a janela ao lado é número que engana.

As outras três regras já eram do PCP:

| Regra | Onde já doeu |
|---|---|
| Saída é `motivo='consumo'` e só — ajuste e encerramento **não são corte** | `fluxo_estoque.js`, §18 |
| Cobertura sem consumo é `null`, nunca zero | §3 |
| A média divide por dias **corridos**, e a tela diz quantos tiveram corte | — |

`tecido/dominio/giro.js` é o **dono único de "quanto consumiu"**.

### ⚠️ ARMADILHA #17 — somar as bobinas esconde justamente a que vai faltar

O painel gerencial (Painel → Gerencial) responde quanto tem, o que gira, o que
está parado e quanto deveria ter. O grão dele é **tecido × largura de bobina**,
e não o tecido — porque aqui **não há emenda**:

```
Rolo 1% Branco · 2,00 m   →  20 m²,  ~4 dias de cobertura
Rolo 1% Branco · 3,00 m   → 270 m², ~35 dias

somados: 290 m² sobre 13 m²/dia = 22 dias  ← "tranquilo", e a de 2,00 acaba
                                              depois de amanhã
```

Todo consolidado é **soma desse grão**, nunca uma segunda consulta.

> ⚠️ **A fonte de consumo é `movimento_rolo`, e NÃO `plano.consumo_m2`.** O
> plano soma rolo **e sobra** na mesma coluna — certo para medir desperdício
> do corte, errado aqui: contaria retalho como tecido novo. Os dois números
> existem, os dois estão certos, e **eles não se reconciliam.**

Três regras vieram inteiras do PCP, e uma é nova:

| Regra | Onde já doeu |
|---|---|
| `ajuste` e `encerramento` não são consumo | §18, armadilha #16 |
| Sem consumo, cobertura e mínimo são `null` — nunca zero | §3 |
| Quem não tem `custo.ver` não recebe os campos | regra 14 do §13 |
| **A cobertura do conjunto só olha o que GIRA** | nova — ver abaixo |

> ⚠️ **A COBERTURA DO CONJUNTO NÃO PODE INCLUIR O ESTOQUE PARADO.** Ele põe
> metros no numerador e zero no denominador: numa fábrica com metade do
> estoque encalhado a cobertura **dobra**, e o número diz "folgado" justamente
> *porque* há dinheiro dormindo. Na validação real deu **237 dias contra 138**.

**O estoque mínimo não é percentual chutado no código.** Sem prazo de
fornecedor não existe ponto de pedido honesto; o que existe é *"quantos dias
quero ter na prateleira"* — `estMinDias` e `estMinSeguranca`, em `parametro`,
com a margem nascendo **zero** para não virar fato inventado.

`tecido/dominio/gerencial.js` é o dono único de **mínimo, status e faixas**. Ele
não calcula consumo nem valor: compõe o `giro.js` e o `custo.js`.

### Duas regras do sob medida que valem citar aqui

**Não há emenda.** Peça mais larga que toda bobina do estoque não sai — e por
isso a recusa vira número de compra, não recado: o plano devolve `falta_bobina`
com quantas peças, de que largura, e qual a maior que existe hoje. Sem isso a
venda parada morre numa linha de texto e quem compra tecido nunca fica sabendo.

**Não há ourela.** Confirmado em 03/09/2026. Se um dia existir, o caminho é
cadastrar a largura *útil* do rolo — não há desconto automático a fazer.

### Teste obrigatório

```bash
cd tecido && npm test          # 194 casos
```

E o teste de segurança da §10, agora incluindo os caminhos novos:

```bash
for r in / /admin /operador /setor /sobmedida /sobmedida/corte \
         /sobmedida/cadastros /sobmedida/telas/corte.html /api/skus /sobmedida/api/eu; do
  printf "%-30s " "$r"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010$r
done
```

Telas `302`, API `401`, `/login` `200`. E `/sobmedida/telas/corte.html` tem que
dar **403 mesmo para o diretor logado** — se der `200`, o `express.static` do
módulo furou o portão, que é a armadilha #3 por outra porta.

