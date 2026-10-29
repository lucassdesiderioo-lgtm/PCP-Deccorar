# História — expedição: do PDF do Mercado Livre até a etiqueta de venda

> **Isto é história, não regra.** A regra vigente de cada assunto está em
> [`docs/regras/expedicao.md`](../regras/expedicao.md), em cartões curtos com o
> teste que a trava. Aqui está o PORQUÊ: o defeito que provocou cada regra, as
> datas e as conferências na fábrica.
>
> O texto abaixo saiu do `CLAUDE.md` em 20/10/2026 **sem nenhuma alteração** —
> a seção §5 inteira. As referências do tipo "§8-B" ou "armadilha #23" apontam
> para o `CLAUDE.md`, ou para [`historia/estoque.md`](estoque.md) quando são da
> §2, §4 ou §18. Quando um cartão mudar, a história nova entra **no fim** desta
> página, com data; o que está escrito não se reescreve.

---

<!-- Do CLAUDE.md §5 — o cruzamento com o PDF do Mercado Livre -->


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

> ⚠️ **O ANÚNCIO DE CATÁLOGO ESCREVE A MEDIDA COM RÓTULO, E O TÍTULO EM TRÊS
> LINHAS (23/09/2026).** O ML tem um layout que o normal não tem:
>
> ```
> Cortina Rolo Blackout Medida L 1,80 X A 1,50 ... Cor Bege Claro -
> E4M2YZZCLZMRDKXC6QUEAE7FSI          ← identificador em linha própria
> Tóquio 002                          ← a continuação do título
> Venda: 2000018578029006
> SKU: BK180150BEGE
> ```
>
> Duas coisas quebravam juntas: a medida vem como `L 1,80 X A 1,50` (o regex
> parava no espaço antes do `A`), e o título fica **três** linhas acima do
> `SKU:`, fora da janela de duas. Sem medida e sem a palavra "Persiana", a linha
> nem era reconhecida como título — o anúncio saía vazio e a **conferência 3
> parava de acusar sem avisar**, que é o silêncio da armadilha #10. Eram 5 em 28.
>
> **`MEDIDA_TITULO` / `medidaDoTitulo()` são o dono único da medida do anúncio**
> — ela era o mesmo regex escrito em dois lugares, e a próxima variação de
> formato seria consertada num e esquecida no outro.
>
> A janela foi até `antes` (a linha logo depois do `SKU:` anterior), que já era
> a guarda contra pegar o título do vizinho, e a varredura passou a ser **de
> baixo para cima**: o título de um item é o mais **próximo** dele, e com janela
> larga procurar de cima acharia primeiro o que está mais longe. A continuação
> é emendada até a primeira linha de campo, pulando o identificador do envio —
> ele não é anúncio e ninguém o reconhece na tela do ML.
>
> Resultado no PDF real: título lido e conferência 3 ativa em **28/28**, contra
> 2/28 antes de tudo isso. Caso 24 do `teste_parse.js`, e o **caso 2 (Abraão)
> passa junto** — a janela larga não pode roubar o título do vizinho.

> ⚠️ **A ÚNICA EXCEÇÃO AO "NÃO OLHAR PARA TRÁS", E O QUE A TORNA SEGURA
> (23/09/2026).** Quando a descrição do anúncio é longa, ela quebra em duas
> linhas e **desfaz o pareamento das colunas** — a venda sobe para a linha
> *acima* do `SKU:` e o comprador cai sozinho na de baixo:
>
> ```
> ...Blecaute Roller Cor Bege Claro -
> Venda: 2000018596292056 Tóquio 002     ← a venda sobe
> SKU: BK180150BEGE
> Paula Cristine Lupepso                 ← o comprador fica sozinho
> ```
>
> São os produtos **Tóquio** — o mesmo nome comercial da armadilha #10, pela
> terceira vez. No PDF de 23/09 eram **5 em 28**. A folha não está sem o dado e
> a etiqueta também não: é a leitura que não pareia. Tratá-los como leitura
> quebrada retinha cinco volumes sem dúvida nenhuma, e mandava alguém reabrir
> cinco pedidos no ML para reler um número que o documento já traz — a armadilha
> #10 outra vez, a trava que acusa o inocente.
>
> `reivindicarAcima()` é a segunda passada, e **a palavra que a torna segura é
> REIVINDICADO**: só entra quem ficou sem pack **e** sem venda, e só se a janela
> acima tiver **exatamente uma** linha cujo número **nenhum outro item pegou**.
> No caso Abraão o pack de cima pertence ao vizinho — está reivindicado, e por
> isso não é oferecido. Duas livres também não resolvem: ambiguidade não se
> desempata por chute.
>
> E não afrouxa o pacote (#23): o irmão de verdade não tem venda em lugar
> nenhum, então não há o que reivindicar. Casos 22 e 23 do `teste_parse.js`
> travam a recuperação e as três guardas — **o caso 2 (Abraão) tem que passar
> junto**, que é exatamente o ponto.
>
> ⚠️ **E O PACK TAMBÉM SOBE, COM A VENDA EMBAIXO (29/10/2026).** Outro título
> longo — *"Tóquio 004 - Cinza **Com Acabamento Branco**"* — desfez o pareamento
> do outro jeito:
>
> ```
> ...Blecaute Roller Cor Tóquio 004 - Cinza
> Com Acabamento Branco
> Pack ID: 2000015735133241               ← o pack sobe, sozinho
> SKU: BK180150CINZA
> Venda: 2000019201782254                 ← a venda fica embaixo
> ```
>
> O item tinha a **venda**, então a segunda passada o dava por identificado e
> nem olhava. Só que a etiqueta de venda com pack traz **só o pack**: folha e
> etiqueta ficaram sem número em comum. As caixas entraram pelo pack, mas a
> folha concluiu que as vendas 2000019201782254 e 2000019201782272 (NF 8828 e
> 8827, a mesma cliente) estavam **sem etiqueta** — com as duas etiquetas dentro
> do PDF de 78 páginas. O card vermelho mandava baixar no ML uma etiqueta que já
> tinha subido.
>
> Hoje o item que tem a venda e não tem o pack também passa pela segunda
> passada, mas **só para o pack**, com a mesma palavra REIVINDICADO. O pack do
> vizinho está na linha do SKU dele, fora desta janela e já pego — o caso Abraão
> continua fechado. O PDF real foi para o caderno (R-INV-01), com a conta
> exigindo **zero** vendas sem etiqueta: é ele que impede este defeito de voltar.
>
> O `registrar_caso.js` tropeçou no mesmo defeito: ele liga etiqueta e folha
> pelo mesmo leitor, e deu à cliente um apelido na etiqueta e outro na folha.
> O caso foi corrigido à mão, e o campo `origem` dele diz isso.
>
> Os dois cards já gravados não fecham sozinhos (o card guardou a venda, a caixa
> guardou o pack, e o upload recusa o PDF repetido), e nenhum botão da tela
> serve. `node religar_sem_etiqueta.js` relê o PDF do card com o leitor de hoje
> e só fecha quando a caixa do pack está no sistema com o mesmo SKU.
>
> **O ganho não é só destravar:** com o comprador lido, a conferência 2 do §5 —
> a única que não depende do Pack ID — **volta a proteger** esses volumes, que
> até aqui passavam sem ela por falta de dado dos dois lados.
>
> **Rode `node teste_parse.js` após qualquer mudança no `parse.js`, no `folha.js`
> ou no `nome.js`** — os 18 casos montam a folha no formato REAL do ML, e o caso
> do Abraão está lá.
>
> Para conferir o que já está gravado: `node rastrear.js --auditar [dias]`.
> `node rastrear.js --folha` mostra o PDF cru quando o layout mudar.
> `node conferir_nf.js --pdf` confere a nota fiscal de cada volume (#22).

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

**~~Pergunta em aberto~~ — RESPONDIDA em 15/09/2026, ver armadilha #23.** A folha
traz o campo `Quantidade`, e ele aparecia maior que 1 sem ninguém saber o que
significava. O PDF da NF 6585 mostrou: é o **pacote de vários produtos** do
Mercado Livre — uma etiqueta com mais de uma persiana. Hoje o volume é retido e
a gestão assina as peças; `lote_item` guarda o que vai dentro da caixa.

> O campo `Quantidade` do item **principal** continua sem mandar em nada: o
> volume é um só, e é o `lote_item` que conta as peças. O que mudou é que agora
> existe onde contá-las.

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

### ⚠️ ARMADILHA #23 — UMA ETIQUETA COM MAIS DE UM PRODUTO, e as peças a mais sumiam

**15/09/2026, e é o dia em que a pergunta em aberto do §5 recebeu resposta.**
Aquele parágrafo dizia: *"Se um dia aparecer venda de 3 peças com uma etiqueta
só, isso é assunto do PDF do Mercado Livre."* Apareceu.

O painel do ML mostrou **"Pacote de 2 produtos · 3 unidades"**. O PDF (NF 6585,
Fabiano Pereira, pack `2000015040457349`) traz **uma** etiqueta, **uma** nota e,
na folha de controle, **dois** itens:

```
RZ3OQY... Cortina Rolo Blackout 1,20x1,20 Blecaute Persiana Bege
Pack ID: 2000015040457349   SKU: BK120120BEGE
Venda: 2000018468081338     Quantidade: 1
Fabiano Pereira             Cor: Bege
                            Desenho do tecido: Liso
Cortina Rolo Blackout 1,40x1,40 Persiana Blecaute Bege     ← o IRMÃO
SKU: BK140140BEGE
Quantidade: 2
Cor: Bege
Desenho do tecido: Liso
```

> **O que acontecia:** o parse casava a etiqueta com o item de cima, gravava
> `BK120120BEGE` e devolvia `conflito: null`. **As duas persianas do irmão
> sumiam por completo** — não viravam volume, não baixavam estoque, não
> apareciam em tela nenhuma. A caixa levava 3 e o sistema conhecia 1. Na
> bancada: bipa uma, imprime, baixa uma, e as outras duas dependem de alguém
> lembrar de olhar o painel do ML. No estoque: duas peças saem da prateleira e
> o saldo não anda. Nenhum aviso, em lugar nenhum.

### ⚠️ A CAIXA DE VÁRIAS PERSIANAS TEM DUAS FORMAS, E A SEGUNDA É A COMUM

**16/09/2026, NF 6490: o cliente comprou 2 e recebeu 1.** O conserto de 15/09
cobria só metade do problema, porque nasceu de um caso só.

| Forma | Como vem na folha | Etiquetas |
|---|---|---|
| **2 SKUs** | dois itens, o de baixo órfão (sem pack/venda/comprador) | 1 |
| **1 SKU, N unidades** | **UM** item, com `Quantidade: 2` escrito nele | 1 |

A segunda passava limpo. O dado sempre esteve lá — o `folha.js` lê `Quantidade:`
e grava em `qtd` desde sempre —, mas **quatro portões decidiam "isto é caixa de
várias?" contando LINHA em vez de PERSIANA**:

| Onde | Era | O efeito |
|---|---|---|
| `parse.js` | a lista de peças só existia `if(irmaos.length)` | o item de 2 unidades não virava `lote_item` |
| `etq_route.js` `/api/proximo` | `itens.length>1` | o bipe devolvia `[]` e a tela seguia normal |
| `etq_route.js` `/api/lote/conferir` | `itens.length<2` recusa | não dava nem para conferir |
| `etq_route.js` `/api/embalar` | `pacote = itens.length>1` | imprimia e baixava **uma** de duas |

Uma linha com `qtd:2` é **uma linha e duas persianas**. Todo portão conta a
soma das `qtd`, nunca `length` — é a mesma lição do bipe por unidade, uma
camada abaixo.

> ⚠️ **ERAM SEIS PORTÕES, NÃO QUATRO — os dois da TELA ficaram para trás, e
> custaram a NF 7031 (25/09/2026).** O conserto de 16/09 ensinou o servidor a
> contar persiana; o `embalagem.html` continuou com `itens.length>1` em dois
> lugares: o que abre a tela âmbar e o que decide se o bipe **confere** ou
> **imprime**. Na caixa de 1 SKU × 2 a tela seguia o fluxo normal, o 2º bipe
> mandava imprimir, o servidor recusava (*"falta conferir 2 de 2"*) e a tela
> esquecia a venda — um **laço sem saída** na bancada, sem nenhum jeito de
> destravar pela tela. O estoque ficou certo (a trava do servidor segurou); a
> venda é que não saía.
>
> Hoje a tela decide por `pecasDe()` — a mesma conta do `etq_route.js` — e o
> `teste_etiqueta.js` (os 6 últimos casos) **varre o `<script>` da tela**
> recusando `itens.length>1` e executa a `pecasDe` de verdade. Os casos do
> servidor provavam que ele entregava as peças; nenhum provava que a tela as
> usava — é a §2 outra vez: rota verde sem tela aberta não é regra pronta.
>
> ⚠️ **O `exp_route.js` (upload) conta LINHA de propósito**, e não é este
> defeito: ali a pergunta é *"são vários SKUs?"*, porque só o pacote de
> vários SKUs fica retido (logo abaixo).

> ⚠️ **NÃO CONFUNDIR COM A ARMADILHA #8.** A quantidade **não** multiplica o
> VOLUME: uma etiqueta continua sendo uma linha em `lote`. Ela conta a **PEÇA**,
> que é o grão do `lote_item` — e essa separação é exatamente o que a tabela
> existe para carregar. Caso 9 do `teste_parse.js` trava as duas metades juntas:
> o volume continua **um**, e as três persianas têm que **chegar** em `itens`.

> **O `pdfFecha` não entra no caso de 1 SKU, e é de propósito.** Ele é a licença
> para ler **ausência** como peça a mais, e o irmão depende dele. A quantidade
> do próprio item não é lida por ausência: está escrita, com todas as letras, no
> bloco daquele item. Exigir o documento fechar para acreditar num número que o
> documento afirma seria recusar a evidência mais forte que existe.

### ⚠️ SÓ O PACOTE DE VÁRIOS SKUs RETÉM — a caixa de N unidades não

As duas levam mais de uma persiana, mas a pergunta é outra:

| | O que o sistema sabe | Decisão |
|---|---|---|
| 2 SKUs | leu a peça a mais por **ausência** — sinal fraco, pode estar errado | retém, a gestão assina |
| 1 SKU | a folha **escreveu** `Quantidade: 2` | não retém |

Reter o caso de 1 SKU seria parar a venda para alguém clicar "confirmo o que o
documento já diz" — e venda de 2 unidades é rotina, não exceção. Trava que
dispara no caso normal vira desvio que a equipe aprende a fazer (#6), e aí o
pacote de verdade passa junto, no meio do que se destrava sem olhar.

A proteção dele mora onde morde: as peças vão pro `lote_item`, a Etiqueta de
Venda não imprime sem o bipe de **todas**, e o estoque baixa por peça.

### ⚠️ A DESCOBERTA NÃO PODE SER NO BIPE — ali a caixa já está montada

A lista "Faltam imprimir" conta **volume**. Uma caixa de três persianas aparecia
como `1`, igual a qualquer venda: a pessoa ia à prateleira, trazia **uma**, e só
no bipe a tela âmbar dizia que eram três. A trava segurava o erro — com o
trabalho já feito. Retrabalho que se repete todo dia é como a equipe aprende a
contornar a tela.

A tela de quem imprime mostra isso em **quatro** momentos, do mais cedo ao mais
tarde — e em cada um a caixa aparece **uma vez só** (opção B, 25/09/2026):

| Onde | O quê |
|---|---|
| **Bloco dentro da coluna** Agência ou Coleta (`GET /api/pendentes/varias`) | a caixa inteira: cliente, NF, as peças com o que cada uma é, o "sem estoque" **por peça** e a frase da fita |
| **Painel "Pra despachar depois"** (`?quando=depois`) | a mesma caixa, só no bloco da data em que ela vence — **não** nas linhas da data |
| Bipe e pós-impressão | a tela âmbar que já existia |
| **"Já impressos"** (`GET /api/impressos`) | tarja `📦 N persianas` na linha — o **último** lugar |

> ⚠️ **O "JÁ IMPRESSOS" É O ÚLTIMO LUGAR, E ERA O ÚNICO SEM NADA (23/09/2026).**
> Depois de impressa, a caixa sai do bloco da coluna (até 25/09, do card e da
> lista por SKU) — ali só aparece o que **falta** — e o banner *"FECHE A CAIXA COM N PERSIANAS"* some no bipe
> seguinte. Dali em diante o volume ficava idêntico a qualquer venda. E esta
> lista tem dois usos em que isso pesa: é onde alguém **volta para conferir**, e
> é de onde se **reimprime** — tirar de novo a etiqueta de uma caixa de duas sem
> saber que são duas é a descoberta tardia um passo adiante.

> ⚠️ **O PAINEL DO "DEPOIS" REABRIA O BURACO INTEIRO, e ficou uma semana assim
> (23/09/2026).** O card cobre a fila de **hoje**; o `GET
> /api/pendentes/futuros` contava `COUNT(*)` e só olhava `lote.codigo`. A NF
> 6959 (Silmara, 2 persianas de 2 SKUs, despacho 01/10) saía ali como
> `BK130130BEGE ×1`: o número mentia **e o segundo SKU não existia em tela
> nenhuma** — ele mora em `lote_item`, e aquela consulta nunca olhou para lá.
>
> E não é painel de leitura passiva: ele diz, com todas as letras, *"dá pra
> adiantar: bipe o SKU e a etiqueta sai"* — e o `/api/proximo/:sku` **não filtra
> por prazo** (§8), então o convite é real. A pessoa bipava, ia buscar **uma**
> peça na prateleira e só na volta a tela âmbar dizia que eram duas. É
> literalmente a descoberta-no-bipe que este bloco existe para impedir,
> acontecendo pela porta do "depois".
>
> **A pergunta ficou num lugar só:** `caixasDeVarias(filtro)` no
> `exp_route.js`, e `/api/pendentes/varias` aceita `?quando=depois` em vez de
> ganhar rota nova. Parâmetro **ausente** devolve o de hoje, igual a sempre —
> tablet com a página em cache continua chamando sem ele e recebe o que recebia.
> Caso travando no `teste_divergencia.js` (os 5 últimos), conferido
> reintroduzindo o `COUNT(*)`: reprova.
>
> ⚠️ **E O PAINEL INTEIRO ERA UM RESUMO CRU, NÃO UMA LISTA DE TRABALHO**
> (23/09/2026, no mesmo dia). Consertado o `COUNT(*)`, sobrava o resto: três
> colunas (data, código, contagem), sem medida, sem cor, sem modelo — *"só o
> código serve a quem decorou o catálogo"*, que é o que o comentário da lista
> do dia diz que não se faz — e **sem estoque**, enquanto a linha logo abaixo
> do título promete *"bipe o SKU e a etiqueta sai, **se tiver peça na
> prateleira**"*. Convite feito, resposta adiada para o bipe: a pessoa ia à
> prateleira descobrir.
>
> Hoje a linha do painel e a da lista "Faltam imprimir" saem do **mesmo
> `SELECT`** (`linhasDeSku(filtro, porData)`) e do **mesmo desenhista**
> (`linhasPend`) — o painel só quebra por data. Ganhou também o resumo do topo
> (*"22 caixas · 23 peças em 7 datas · a próxima é amanhã (24/09, 4 caixas)"*),
> que é a pergunta "o que tem pra despachar" respondida de uma olhada, e passou
> a respeitar o filtro **Todas / Agência / Coleta** do topo — antes ele o
> ignorava, e quem filtrava a tela para Coleta continuava vendo agência ali
> embaixo: a mesma tela dizendo duas coisas.
>
> ⚠️ **NÃO ESCREVA "✓ DÁ PRA ADIANTAR" NO SKU QUE TEM SALDO.** Parece o
> complemento óbvio do vermelho e mente: o saldo é o **mesmo** da fila de hoje,
> e prometer adiantamento de uma peça que a venda de hoje vai consumir manda a
> bancada gastar peça de quem tem prazo curto. Quem impede isso é a trava de
> estoque na hora de imprimir (§8) — não uma promessa na tela. Fica só o
> vermelho de quem não tem, que é a mesma régua da lista do dia.
>
> ⚠️ **A MARCA DE MODALIDADE SÓ APARECE QUANDO ELA SEPARA ALGUMA COISA.** O
> `linhasPend` recebe `marcar`, e só o painel do "depois" passa `true`, e só
> quando o que está à vista tem agência **e** coleta. As duas listas do dia
> nunca passam: elas já estão separadas por porta de saída, e repetir "coleta"
> em toda linha de uma lista chamada Coleta é a marca que deixa de marcar. Onde
> ela serve é óbvio no dia em que aparece — em 24/09 o mesmo `BK140140BEGE` sai
> em **duas** linhas (2 de coleta, 1 de agência), e sem a marca as duas se leem
> como um defeito de tela.
>
> ⚠️ **E EM 23/09/2026 O FUTURO INTEIRO ERA COLETA — 22 de 22.** Faz sentido:
> agência despacha hoje, com hora; coleta é o caminhão marcado para um dia. Por
> isso o painel **não** foi dividido em duas colunas como as listas de cima — a
> coluna "Agência" nasceria vazia, e coluna vazia todo dia vira paisagem.

> ⚠️ **E FOI RENDERIZANDO QUE APARECERAM AS DUAS ÚLTIMAS COISAS** — `📦2 peças`
> grudado e um `2 · 3 peças` que se lê como *"2 peças e 3 peças"*. As duas
> estavam sintaticamente perfeitas e nenhum teste de unidade as pegaria; é a
> mesma lição do *"23,1 mm em vez de 23,1 mm"* do §4. Hoje sai `2 caixas · 3
> peças`, e só quando os dois números divergem.

> ⚠️ **A CAIXA DE VÁRIAS APARECE UMA VEZ SÓ, DENTRO DA COLUNA DA PORTA DE
> SAÍDA DELA — decisão do dono, 25/09/2026 (opção B).** Até aqui ela saía em
> **dois** lugares: num quadro largo acima das duas listas (por cliente) e na
> linha do SKU (por persiana). O dono viu a Joverlandia no quadro e o mesmo
> `SCREEN1-120120CINZA` na lista da Coleta, e leu *"duas coisas iguais"* — é
> assim que se lê de relance, e foi assim que foi lido. Nomear o cliente na
> linha (a opção A, do mesmo dia de manhã) não bastou: a tela continuava
> dizendo a mesma coisa duas vezes.
>
> Hoje o `linhasDeSku` **tira a caixa de várias das linhas** (`VARIAS()` no
> `exp_route.js`, a MESMA régua `SUM(qtd) > 1` do `caixasDeVarias` — com duas
> réguas a caixa sumiria das duas listas ou apareceria nas duas), e a tela a
> desenha como bloco âmbar **dentro** da coluna Agência ou Coleta
> (`caixaNaColuna`), com o número **1** à direita como qualquer linha.
>
> - **A conta fecha:** o número da coluna é linhas comuns + caixas de várias,
>   e bate com o *"pra imprimir agora"*. Há caso travando que linhas + caixas =
>   volumes pendentes, sem sobra nem falta.
> - **O "sem estoque" foi junto, por peça e contra a quantidade dela** — a
>   mesma conta da trava do `/api/embalar`: com 1 na prateleira, a linha de 2
>   unidades não imprime, e dizer "tem estoque" ali seria mentira. Sem isso a
>   caixa perderia o aviso ao sair da linha, e a pessoa iria à prateleira
>   descobrir.
> - **O quadro do topo saiu.** Num notebook de 15" (1440 × 900) ele ocupava
>   218 px e empurrava as listas para 462 px de 760 visíveis; hoje elas começam
>   em 251. A coluna tem ~270 px de largura, e por isso o título da caixa é só
>   *"📦 N PERSIANAS"* — os mais longos quebravam em duas linhas.
> - **Dentro da coluna a caixa não repete "coleta"/"agência"** (a coluna já é
>   isso); no painel do "depois", que mistura as duas, a marca continua.
> - **Data que só tem caixa de várias ganha bloco no "depois"**: como ela saiu
>   das linhas, sem isso a data sumiria do painel.
> - **Tablet com a página antiga em cache** passa a ver a caixa só no quadro
>   velho do topo (a linha já não vem do servidor) — nada some, e o refresh
>   forçado do deploy acerta o resto.

> ⚠️ **A INSTRUÇÃO DE EMBALAGEM É CONTEÚDO, NÃO ENFEITE.** Texto do dono
> (25/09/2026): **"⚠ Atenção: vão N persianas no mesmo pacote — embalar
> junto."**, com o número da caixa (2, 3, 4…). A cor diz "isto é diferente"; só
> a frase diz o que fazer, e é ela que vale para quem nunca montou uma destas.
> Ela sai da função `fita(n)` do `embalagem.html` — quatro cópias literais são
> quatro coisas para divergir — e aparece **igual** nos quatro lugares (o bloco
> da coluna, o painel do "depois", a tela do bipe e o "Impresso ✓"): escrevê-la
> diferente ensinaria a equipe a achar que são duas coisas.
>
> - **No painel do "depois" ela vai POR CAIXA**, no lugar do antigo *"→ N
>   persianas numa caixa"*: numa data com uma caixa de 2 e outra de 3, uma
>   frase só no topo mentiria para uma delas.
> - **O "saco maior" saiu, por decisão do dono.** De 16 a 25/09/2026 a frase
>   era *"saco maior, as peças juntas com fita — não é o saco de uma peça só"*.
>   O `teste_etiqueta.js` recusa a frase antiga em qualquer ponto da tela e
>   confere o número da nova com 2 e com 3.

> ✅ **AS DUAS NO AR E CONFERIDAS PELO DONO EM 25/09/2026** — a caixa uma vez
> só, dentro da coluna (opção B, PR #129), e a frase `fita(n)` nos quatro
> lugares (PR #130). Ele fez os dois deploys e disse, nas duas vezes, *"ficou
> certo"*.
>
> ⚠️ **ISSO PROVA A TELA, E NÃO O ESTOQUE DA NF 7031.** Se aquela caixa de 2
> baixou 2 do saldo continua sem conferência no dado real: é a consulta ao
> `movimento_estoque` do lote dela, que o dono ainda não rodou. A trava do
> servidor segura o caso daqui para a frente, com caso travando; o volume de
> antes do conserto é outra pergunta, e prova que não foi feita se escreve
> como não feita (§4).

> ⚠️ **DEPOIS DE IMPRESSA, A CAIXA DIZ QUAIS PERSIANAS, E NÃO SÓ QUANTAS
> (05/10/2026, NF 7449).** O `lote.codigo` é o **primeiro** item da folha. O
> "Impresso ✓", o "Reimpresso ✓" e a lista "Já impressos" escreviam só ele, ao
> lado de "2 persianas" — e na caixa de dois SKUs **diferentes** quem voltou
> para conferir leu uma persiana repetida. É o tipo de leitura que põe a peça
> errada no saco.
>
> Hoje `pecas_caixa.js` é o dono único de *"que peças vão nesta caixa, depois
> de impressa"* (soma das `qtd`, nunca `length`; venda comum devolve `[]`), e
> `/api/embalar`, `/api/reimprimir` e `/api/impressos` devolvem `itens`. A
> tela escreve a lista pela função `pecasCaixa` do `embalagem.html` — uma
> linha por SKU, com a medida e a cor — e, na caixa de várias, **tira** o
> código do volume da linha: sozinho, ele é o que fazia dois SKUs parecerem um.
> A busca do "Já impressos" acha a venda pelo segundo SKU também. **Nada mudou
> no estoque, na impressão nem no bipe.** (O Carregamento passou a mostrar a
> mesma lista no mesmo dia — §8-B.)
>
> ✅ **NO AR E CONFERIDO COM DADO REAL EM 05/10/2026** (PR #188): o dono fez o
> deploy e mostrou a NF 7446 no "Já impressos" com `BK140140BEGE` e
> `BK140140CINZA`, cada um com a medida e a cor.


**Rode `node teste_etiqueta.js` (12 casos são a NF 6490; depois vêm 6 da NF 7031 — a tela —, os 4 da frase da caixa e os 6 últimos, a NF 7449),
`node teste_divergencia.js` (25 casos: a caixa uma vez só, a conta que fecha, o estoque por peça, o painel do
"depois" e, nos 5 últimos, as peças da caixa já impressa) e `node teste_parse.js` (caso 9) após mexer nisso.** E **abra a
tela**: o card, o painel e a linha por SKU são texto montado, e a §2 já ensinou
que rota verde sem tela aberta não é regra pronta.

---

**O irmão se reconhece por AUSÊNCIA**, e é a mesma família de sinal fraco da
#21: ele não traz `Pack ID:`, nem `Venda:`, nem comprador — só descrição, SKU,
quantidade, cor e tecido.

> ⚠️ **NÃO CONFUNDIR COM O CASO ABRAÃO (#4), QUE É O CONTRÁRIO DISTO.** Lá o
> item também vinha sem Pack ID, mas trazia **`Venda:` e o comprador**: era um
> item inteiro cuja etiqueta veio pela venda em vez do pack, e herdar o pack do
> vizinho mandou a peça errada pro cliente. Aqui os **três** campos faltam de
> uma vez. É só isso que separa "item irmão" de "item que o PDF desalinhou" — e
> está no documento, não num palpite: **o irmão é o único item que não tem como
> ser identificado sozinho.** Item com venda ou comprador NUNCA é irmão.
>
> `folha.js` → `irmaosDoPacote()` é o dono único dessa leitura. Os dois casos
> têm teste lado a lado (casos 2 e 17 do `teste_parse.js`) e **têm que passar
> juntos**: quem afrouxar um quebra o outro, que é exatamente o ponto.

### ⚠️ AUSÊNCIA SÓ VALE COMO PACOTE QUANDO O PDF FECHA

Ler ausência como "peça a mais" tem um buraco, e ele é a armadilha #10 por
outra porta: **o pdf.js come campo**. Um item legítimo cujos três
identificadores ficaram ilegíveis tem *exatamente* a mesma cara do irmão — e
tratá-lo como peça a mais juntaria duas vendas separadas numa caixa que não
existe, que é o erro contrário ao que o pacote veio consertar.

A evidência que separa os dois não está no item: está na **conta do documento**.

| | etiquetas | itens | etiqueta sem item | leitura |
|---|---|---|---|---|
| **pacote de verdade** | 1 | 2 | nenhuma | o órfão é peça a mais |
| **leitura quebrada** | 2 | 2 | **uma** | o órfão é item que perdeu os campos |

Por isso `pdfFecha` (no `folha.js`) é a **licença** para ler ausência como
pacote: o órfão só vira irmão quando **nenhuma etiqueta do PDF ficou sem item**.

> ⚠️ **A LICENÇA É DO `folha.js`, E O BACKFILL LÊ POR ELA.** Ela nasceu dentro
> do `parse.js`, e o `backfill_pacote.js` chamava o `irmaosDoPacote` **direto,
> sem a licença** — gravava como peça a mais o órfão que o upload teria retido.
> Ali o erro é mais caro que na tela: com `--baixar` ele tira do estoque uma
> persiana que nunca saiu da prateleira. Foi achado em 15/09/2026, rodando o
> backfill contra os PDFs reais, e o caso 20 do `teste_parse.js` trava as duas
> pontas — a conta e a ausência de segunda cópia.
>
> O script **diz o que recusou**, num bloco próprio com a conta de cada PDF:
> recusa calada faz o mesmo silêncio de "não achei nada", e o que ele recusa é
> justamente o que mais parece pacote.
Sobrou etiqueta órfã, o sistema **não inventa pacote** — retém dizendo a conta
que não bateu (`2 etiqueta(s), 2 item(ns), e 1 etiqueta(s) sem item na folha`),
e manda conferir o pedido no ML ou subir o PDF de novo.

> **Esse volume vai como `divergencia:`, não com prefixo próprio.** É
> literalmente uma dúvida de **leitura** da folha — a mesma família da
> conferência 1 —, e o card vermelho que já existe sabe resolvê-la. Prefixo novo
> custaria mais uma tela, mais um resolvedor e mais uma guarda no `server.js`
> para responder a pergunta que o de sempre já responde.

> ⚠️ **A RETENÇÃO É DO VOLUME COM DÚVIDA, NUNCA DO PDF INTEIRO.** A primeira
> versão (15/09/2026) olhava só `!pdfFecha`, que é condição **global ao
> arquivo**. No PDF real de 23/09 — 28 etiquetas, 5 itens que perderam
> pack/venda/comprador — ela retinha **os 28**, sendo que 23 tinham os três
> campos lidos e não tinham dúvida nenhuma.
>
> Retenção em massa é a armadilha #6 na escala em que ela mais machuca: 23
> destravamentos cegos por dia ensinam a equipe a destravar o 24º sem olhar, e
> o 24º é o que importa. E havia um dano a mais, silencioso: **volume retido
> não aparece na Etiqueta de Venda**, então a caixa de 2 persianas do Silvio
> (`2× BK100100CINZA`, no mesmo lote) sumia da tela junto — a trava escondendo
> justamente o que ela existe para proteger.
>
> Quem tem dúvida é a etiqueta que **não achou item** na folha (`!r1`): essa não
> sabe que peça leva, e um dos órfãos provavelmente é ela. As outras casaram
> por pack ou por venda e seguem o caminho normal. Caso 21 do `teste_parse.js`
> trava isso com o lote de 23/09 em escala menor — 4 etiquetas, 1 leitura
> quebrada, e a caixa de 2 unidades tem que **atravessar** o lote inteira.
>
> Os dois números do motivo contam a mesma história — `N etiqueta(s) sem item`
> e `N item(ns) sem identificacao` —, e é a igualdade entre eles que diz que
> são os mesmos volumes vistos dos dois lados. `irmaosDoPacote` devolve
> **grupos**, não itens: somar `.irmaos.length` é o que faz os dois baterem.

> ⚠️ **A BASE DESTE PADRÃO É UM PDF.** O `irmaosDoPacote` nasceu de **um** caso
> (NF 6585). Compare com a conferência 5, que só vira regra depois de **5**
> ocorrências justamente porque *"uma folha sozinha não prova nada"*. Aqui o erro
> é para o lado seguro — retém, nunca libera —, mas retenção falsa em série é a
> armadilha #6: a equipe aprende a assinar sem olhar. **Acompanhe `pacotes` e
> `folha_nao_fecha` na resposta do upload**: se os dois começarem a aparecer em
> lote normal, o padrão está largo demais e o conserto é aqui, com o PDF na mão.
> Caso 19 do `teste_parse.js` trava a guarda.

### A regra do dono continua inteira — o que faltava era o CONTEÚDO da caixa

> *"Não tem essa de juntar etiqueta, não tem essa de juntar pacote, não tem essa
> de juntar caixa."*

Continua valendo, e o código a respeita: **um volume, uma linha em `lote`, uma
etiqueta de venda, um bipe no carregamento.** O ML juntou as peças; o sistema
não junta nada. O que passou a existir é a tabela **`lote_item`** — o que vai
*dentro* daquela caixa.

| | Grão | Tabela |
|---|---|---|
| a etiqueta / o volume | uma caixa, um ciclo | `lote` |
| **a peça** | **uma persiana** | **`lote_item`** |

> ⚠️ **NÃO "CONSERTE" ISSO CRIANDO N LINHAS EM `lote`.** Três linhas para um
> envio que o ML despachou como um só criariam duas etiquetas de venda que não
> existem, e o volume nunca fecharia no carregamento (#8). O grão de `lote` é a
> **etiqueta**; o grão de `lote_item` é a **peça**. E a dedup (#5) recusaria o
> segundo de qualquer jeito: o Pack ID é o mesmo.

### O caminho do volume, decidido pelo dono em 15/09/2026

**1. O upload RETÉM** (`bloqueio = 'pacote: esta etiqueta leva N pecas de M
SKUs — ...'`), e grava os itens que a folha leu em `lote_item` com
`origem='folha'`. Vem logo **depois da divergência** (peça errada é mais grave)
e **antes de tudo o mais**: nenhuma trava seguinte responde por conteúdo de
caixa — cadastrar SKU não diz quantas persianas vão dentro, e escolher agência
ou coleta muito menos.

**2. Admin → Bloqueados, card âmbar próprio: a gestão ASSINA as peças.** A lista
nasce preenchida com o que a folha disse — **concordar é um clique** — e cada
linha aceita **bipe**, troca de SKU, troca de quantidade, remoção e acréscimo.
É a lição da §5 (Bloqueados → escolher): trava que sabe acusar e não sabe
liberar é trava que a equipe aprende a contornar. A trava do §6 vale **para cada
peça**, não só para o `lote.codigo`. A decisão vira história
(`bloqueio_resolvido`, `resolvido_por`, `resolvido_em`) e vai para a auditoria.

> ⚠️ **ASSINAR TEM CHAVE PRÓPRIA (`pacote.assinar`), E É A ÚNICA DAS TRÊS
> TRAVAS DA ABA QUE TEM.** As outras duas respondem perguntas menores:
> divergência é *qual peça é essa* (`sku.cadastrar`) e modalidade é *por onde a
> caixa sai* (`@admin`). Assinar responde **quantas persianas vão dentro** — e é
> essa lista que a Etiqueta de Venda cobra no bipe e que baixa do estoque, peça
> por peça. É `sensivel`, como `estoque.editar`, pelo mesmo motivo: mexe no
> saldo sem venda na frente, e a assinatura é o único rastro de por quê.
> **Ver** a caixa retida continua `@admin`, como o resto da aba: esconder a
> lista de quem abre Bloqueados não protegeria nada e deixaria a caixa parada
> sem ninguém saber que ela existe.
>
> **São três pontas, e a que some em silêncio é a terceira** (é a armadilha #13
> do §19 por outra porta): a chave em `permissoes.js`, a rota em `permDaRota()`
> do `acesso.js`, e **alguém que tenha a chave**. O seed de setores só grava
> quando o setor **nasce** — num banco que já existe, chave nova não chega a
> ninguém, e a tela dá 403 para todo mundo sem erro e sem log. Por isso há o
> backfill de uma vez só (seção 3-B do `acesso.js`, marcado em
> `config.seed_pacote_assinar`): quem já resolve divergência passa a assinar,
> ninguém ganha o que não tinha, e quem desmarcar a caixinha depois não a vê
> voltar no próximo boot.
>
> O bipe das peças (`POST /api/lote/conferir`) é da **bancada**, não do upload:
> `etiqueta.emitir`. Deixá-lo cair no `pre('/api/lote')` → `pdf.subir` trancaria
> a própria bancada que a trava existe para proteger — quem só tem
> `etiqueta.emitir` não conferiria nem imprimiria.
>
> **Rode `node teste_acesso.js` ao mexer em `permissoes.js` ou no `permDaRota()`**
> — os 114 casos travam as três pontas, o backfill, a cobertura e as quatro
> portas de escalonamento da §10 (#28). **Rota nova pede uma linha no
> `permDaRota()`**: sem ela a rota nasce NEGADA e o `teste_cobertura.js`
> reprova (§10, armadilha #29).

**3. Etiqueta de Venda: sem o bipe de TODAS as peças, não imprime.** Tela âmbar
própria (`📦 ESTA CAIXA LEVA 3 PERSIANAS`), uma linha por peça com o que ela é
(`120 × 120 cm · Bege · Blackout · Rolô`, do mesmo `pecaTexto`), e o bipe marca
cada uma. É o mesmo desenho do kit na embalagem (§4): **o bipe que falta recusa
o passo seguinte**, em vez de avisar e deixar passar — aviso numa caixa de três
persianas é aviso que se aprende a fechar. Depois de imprimir, a tela repete:
`FECHE A CAIXA COM 3 PERSIANAS`, que é a última vez que alguém olha antes do
saco preto.

> **A LISTA APARECE — decidido pelo dono em 15/09/2026**, depois de posta em
> dúvida justamente por contrariar a conferência cega do carregamento (§5).
> Não contraria: **lá a caixa já está fechada** e o bipe confere o que entrou —
> mostrar o SKU esperado faria a pessoa bipar o que fosse para fechar a linha.
> **Aqui a caixa está sendo MONTADA**, e sem a lista a bancada não sabe o que
> buscar na prateleira; esconder viraria adivinhação, não rigor. É roteiro de
> separação, como a "Faltam imprimir".
>
> O que o sistema **não** faz, e é onde o rigor mora, é dar a peça por conferida
> sem o bipe: a lista diz o que procurar, o bipe prova o que entrou.

**4. O estoque baixa POR PEÇA.** `1 × BK120120BEGE + 2 × BK140140BEGE` = três
baixas. A trava de estoque também passou a ser por peça, e a recusa **nomeia o
SKU que faltou** — numa caixa de três, "sem estoque" sem dizer de qual manda a
bancada procurar no escuro.

> ⚠️ **UM BIPE POR PERSIANA, NÃO POR SKU.** Regra do dono (15/09/2026). A caixa
> do Fabiano tem 3 persianas em 2 linhas, e são **três** bipes:
> `BK120120BEGE` uma vez, `BK140140BEGE` duas. `lote_item.conferidos` é um
> **contador**, não um sim/não, e a tela escreve "1 de 2".
>
> A primeira versão fechava a linha inteira no primeiro bipe, com o argumento de
> que duas persianas iguais têm a mesma etiqueta de SKU e bipar duas vezes não
> provaria nada. **Está errado, e o erro é o caro:** não é o código que se
> confere, é a *peça na mão*. Um bipe por linha deixa a persiana irmã na
> prateleira com a caixa marcada como conferida — exatamente o que a caixa de
> várias peças traz de volta.
>
> ⚠️ **O GUARD DE 700 ms DA TELA FICOU MAIS IMPORTANTE, NÃO MENOS.** Ele existe
> porque o leitor às vezes manda o mesmo código duas vezes numa leitura só
> (§12). Antes isso era inofensivo — o servidor respondia "já conferido". Agora
> uma repetição acidental **conta uma persiana a mais**, e a caixa sai com uma
> peça faltando porque o operador acha que conferiu duas. Duas persianas de
> verdade exigem largar uma e pegar a outra, o que nunca leva menos de 0,7 s.
> Não afrouxe esse número para "facilitar" o bipe repetido: é justamente o que
> ele protege.

> **Cadastrar SKU não solta volume retido por `pacote:`** (guarda no
> `server.js`, como a da divergência e a da modalidade): cadastro não responde
> quantas persianas vão na caixa. Soltar ali mandaria a caixa embora com a peça
> a mais não conferida — o buraco que a trava existe para fechar.

### Os volumes que entraram ANTES disto: `backfill_pacote.js`

Volume gravado até 15/09/2026 conhece só o item de cima — as peças do irmão não
existem em lugar nenhum do sistema. `node backfill_pacote.js` relê os PDFs ainda
no servidor pela mesma régua, e **separa os dois casos, que não são o mesmo**:

| Estágio | O que o saldo diz | O que fazer |
|---|---|---|
| **pendente** | a etiqueta não saiu, **nada baixou** | só gravar as peças — o fluxo novo faz o resto |
| **embalado** | a etiqueta saiu e baixou **uma** peça | falta baixar o resto, **se elas foram na caixa** |

> ⚠️ **ELE SÓ ENXERGAVA METADE DO PASSIVO, E ISSO CUSTOU A NF 6986
> (23/09/2026).** O script varria só `irmaosDoPacote` — a forma de **2 SKUs**.
> A forma de **1 SKU com `Quantidade: N`**, que a §5 chama de "a segunda, e é a
> comum", passava batida. O conserto de 16/09 ensinou os **quatro portões do
> fluxo ao vivo** a contarem persiana em vez de linha, e o backfill ficou para
> trás: o único script que existe para consertar o passivo não via metade dele.
>
> O caso real: o volume do Silvio entrou às **06:40**, o deploy foi às
> **08:32**, e ele ficou com zero peça gravada — a etiqueta cobrou uma, o
> estoque baixou uma, e o script não o achava.
>
> **A pergunta ganhou dono único:** `folha.js → pecasDaCaixa(pai, irmaos)`, e o
> `parse.js` e o backfill leem por ela. Duas cópias divergem no dia em que uma
> das formas mudar, e a que fica para trás é sempre a do script — que ninguém
> roda todo dia.
>
> ⚠️ **A LICENÇA DO `pdfFecha` GATEIA OS IRMÃOS, NÃO A QUANTIDADE ESCRITA.**
> Sobrou etiqueta sem item, os **órfãos** daquele PDF não são lidos — e só
> eles. A `Quantidade: N` do próprio item continua valendo: ela não depende de
> ausência nenhuma. Antes o script descartava o **arquivo inteiro**, o que é a
> retenção em massa do §5 por outra porta — uma dúvida que é de *outro* volume
> apagando o que está escrito neste. O relatório diz as duas coisas.

> ⚠️ **O AJUSTE DE SALDO FICA ATRÁS DE `--baixar`, E É DE PROPÓSITO.** No volume
> já impresso o script não tem como saber se a peça a mais entrou na caixa ou
> continua na prateleira — e os dois mundos pedem coisas opostas. Se ela nunca
> saiu, **o saldo está certo** e baixar abre um buraco em vez de fechar. Confira
> a caixa antes. O ajuste vai para `ajuste_estoque` com motivo, quem e quando,
> como todo ajuste manual (§18), e a observação diz de qual volume e de qual
> cliente — daqui a um mês ninguém lembra por que o saldo andou sem venda.

```bash
node backfill_pacote.js                     # só mostra — as DUAS formas
node backfill_pacote.js --aplicar           # grava as peças
node backfill_pacote.js --aplicar --baixar  # e acerta o saldo dos já impressos
```

Faz backup por `db.backup()` antes de gravar, e é idempotente: só olha volume
que ainda está na fábrica e que **não tem** peças gravadas. Volume já carregado
fica de fora — saiu por onde saiu, e mexer no saldo por causa dele hoje
carimbaria uma saída que aconteceu noutro dia (a regra dos três scripts de
passivo, §5).

> ⚠️ **O REPARO TEM PRAZO DE VALIDADE: 7 DIAS.** O script **relê o PDF** — ele
> não adivinha nada, e é isso que o torna confiável. Mas o cron apaga os PDFs de
> `lotes/` em 7 dias, e a partir daí **as peças daquele volume não voltam por
> script nenhum**: o documento que as afirmava não existe mais. Na rodada de
> 23/09/2026 eram **82 volumes** nessa situação, contra 19 PDFs ainda no disco.
>
> A saída **diz o número** (`volumes cujo PDF ja saiu do disco`), e ele não é
> decoração: é o tamanho do que já não dá para consertar assim. Volume fora da
> janela só se acerta com o painel do ML na mão, por **Admin → Estoque**, com
> motivo — o mesmo caminho do `--baixar`, e pela mesma razão (§18).
>
> **Consequência prática:** regra nova que dependa deste backfill tem uma semana
> para ser rodada. Depois disso o passivo que ela pegaria vira permanente, e
> nada em tela nenhuma diz que ele existiu — é a dívida 18 (§14) pela porta do
> arquivo que expirou.

**Rode `node teste_parse.js` (casos 17, 18 e 19), `node teste_divergencia.js` (os
últimos 10 casos são o pacote) e `node teste_etiqueta.js` (os últimos 16) após
mexer nisso.** Para achar os casos nos PDFs do servidor:
`node conferir_nf.js --pdf` — a pergunta 0 do relatório é esta.

### ⚠️ ARMADILHA #22 — a NF é do PEDIDO, e a impressão leva a PRIMEIRA folha dela

Revisado em 15/09/2026. A escada da armadilha #8 tem um degrau irmão que ninguém
tinha olhado: **peça não é volume, e volume não é nota.**

| Unidade | Grão | Onde vive |
|---|---|---|
| peça | o que o cliente comprou | `Quantidade:` da folha (dívida #11) |
| volume | uma etiqueta, uma caixa, um ciclo | uma linha em `lote` |
| **nota** | **o pedido** | `lote.nf`, e ela **pode se repetir** |

**Venda repetida seria contradição; NF repetida não é.** A regra do dono
(*uma venda = uma etiqueta = uma persiana*) fala de venda, e a dedup do upload
(#5) já recusa Pack ID ou Venda que exista no histórico — então venda com dois
SKUs no banco é ou volume anterior a 25/08/2026 ou o ML repetindo um número que
promete não repetir. **A NF é outra coisa:** o cliente que leva três persianas
num pedido só tem três vendas, três etiquetas, três caixas — e **uma nota**,
impressa três vezes, uma por caixa. Isso está certo e não é duplicidade.

O `GET /api/print/:id` monta duas páginas: a etiqueta (`labelPage`) e a nota
(`danfePage`). É aqui que a NF repetida encosta no código:

> ⚠️ **A NOTA DE DUAS FOLHAS IMPRIMIA A FOLHA 2.** Nota com muitos itens estoura
> para uma página de continuação, e as duas trazem o mesmo `Número`. O mapa
> `danfeByNf` do `parse.js` era `[nf]=p` sem guarda, e a **última vencia**: o
> volume apontava para a continuação, e saía da impressora a folha 2 — sem
> cabeçalho, sem chave de acesso, sem canhoto. Quem cola a etiqueta não tem como
> perceber, porque a nota certa nunca aparece do lado para comparar. Hoje a
> primeira folha vence, e há caso travando (caso 16 do `teste_parse.js`).
>
> **O que ainda não está resolvido:** a impressão leva **uma** página. Se a nota
> tiver duas folhas, a segunda continua ficando para trás — agora com a folha 1
> saindo, que é o documento. O `conferir_nf.js` diz se isso existe nos PDFs do
> servidor; enquanto não existir, `lote.danfePage` continua sendo uma coluna só.

**A leitura crua do PDF tem dono único, e passou a ter de verdade.** `tipoDaPagina`
("o que é esta página") e `nfDaNota` ("qual o número desta nota") moram no
`folha.js`: o `parse.js` grava por elas, o `rastrear.js` e o `conferir_nf.js`
conferem pelas mesmas. Antes cada um tinha a sua cópia — e conferir a impressão
com outra régua é conferir olhando um papel diferente do que a impressão usa.

**`nome.js` é o dono único de "estes dois nomes são a mesma pessoa?"** — a régua
da conferência 2 (#10: repetição sim, letra trocada nunca, e falta de dado devolve
`null`, nunca acusação). A conferência de NF faz a **mesma** pergunta sobre os
volumes de uma nota; com duas réguas ela chamaria de gente diferente quem o upload
já aceitou como a mesma pessoa, e a lista de alarme nasceria cheia de falso
positivo — armadilha #10 de novo.

```bash
node conferir_nf.js              # todo o histórico
node conferir_nf.js 30           # só os últimos 30 dias
node conferir_nf.js --pdf [30]   # relê também a folha dos PDFs ainda no servidor
```

Ele responde quatro coisas e **só lê**: venda com mais de um SKU, cliente com mais
de uma persiana na mesma NF, **NF com clientes diferentes** (esta é para olhar no
dia — ou a nota de um está na caixa de outro, ou o `NF:` foi lido errado) e o que
a impressão faz com cada caso.

> **O `--pdf` não é luxo: sem ele a pergunta 1 não tem resposta.** O banco só
> guarda o que passou pela dedup — se o PDF trouxesse a mesma venda com dois
> SKUs, o segundo teria sido **recusado antes de virar linha**. Só relendo a
> folha dá para perguntar ao documento em vez de perguntar ao que sobrou dele.
> Os PDFs somem em 7 dias (cron), então essa janela é a que existe.

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

### ⚠️ ARMADILHA #24 — o anúncio chegava DECAPITADO, e com ele iam três coisas

Corrigido em 17/09/2026. A descrição do anúncio saía de um recorte a partir da
palavra "Persiana" (`folha.js`, `/(Persiana[^|]*)$/`). O ML escreve a palavra
**no fim** do título:

```
RZ3OQY...  Cortina Rolo Blackout 1,50x1,50 Blecaute Persiana Cinza
o que era gravado:                                  Persiana Cinza
```

Nos testes isso nunca apareceu porque o helper do `teste_parse.js` montava
"Persiana" logo depois do identificador — e aí o recorte pegava a linha toda
**por acaso**. No PDF real, sobrava o rabo do título.

**O estrago era em três lugares de uma vez, e só o primeiro era visível:**

| Onde | O que acontecia |
|---|---|
| **Admin → Bloqueados** | `anúncio: Persiana Cinza` não identifica anúncio nenhum. Quem ia resolver o volume tinha que abrir a venda no ML só para descobrir de que anúncio se tratava — exatamente o trabalho que o campo existe para poupar |
| **Conferência 3** (medida) | ela lê `1,50x1,50` do **texto do anúncio**; sem a medida, parava de acusar em silêncio, que é a armadilha #10 inteira |
| **Conferência 5** (família) | aprendia `PERSIANA CINZA` como família — e família que **muda com a cor** não é a linha do produto. A `familia_sku` vinha acumulando isso |

**Quem manda agora é a estrutura da folha, não a palavra:** a descrição é a
linha acima do `SKU:` que não é linha de campo (`Pack ID:`, `Venda:`, `SKU:`,
`Quantidade:`, `Cor:`, `Desenho do tecido:`). A âncora continua de pé só como
guarda contra o **cabeçalho da página** ("Identifiicação Produtos"), e aceita
também a **medida por extenso** — o mesmo dado que a conferência 3 já lê, e que
não envelhece como lista de palavras. O identificador da coluna da esquerda sai
(`tituloDoAnuncio`): ele não é o anúncio.

> **A trava passa a acusar mais, e isso é o ponto.** Nos títulos com "Persiana"
> no fim a conferência 3 estava desligada sem ninguém saber. Acompanhe
> `cobertura.medida` na auditoria: ela tem que **subir**. A `familia_sku` velha
> não é reescrita — é história do que o sistema viu, e o aprendizado recomeça
> sozinho (≥5 ocorrências), então nada passa a acusar de repente.

> **Os volumes já gravados:** `node backfill_descricao.js` (simula) e
> `--aplicar`. Ele relê os PDFs ainda no disco pela mesma régua e regrava só
> `lote.descricao` e `lote_item.descricao` — não toca em saldo, estágio nem
> bloqueio. **Alcança só os últimos 7 dias**, que é o que o cron deixa: título
> não se inventa de memória. Caso 20 do `teste_parse.js` trava o formato real.

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
> os 51 casos incluem o dos seis volumes de 26/08, e cobrem que a busca larga
> não virou "acha qualquer coisa" (código inexistente ainda dá `nao_encontrado`)
> e que `bloqueado` continua recusado.

> ⚠️ **ARMADILHA #27 — A CAIXA SUBIA NO CARRO SEM NUNCA TER PASSADO PELA
> ETIQUETA DE VENDA.** Corrigido em 17/09/2026 (era a dívida 13 do §14). O bipe
> do carregamento recusava só `bloqueado` e `carregado`: volume **`pendente`**
> virava `carregado` e a peça saía da fábrica **sem o −1** que só a Etiqueta de
> Venda dá. Três estragos de uma vez, e nenhum com sinal em tela nenhuma:
>
> 1. o estoque fica **permanentemente acima do físico** — a peça saiu e o saldo
>    não andou, e `skus.estoque` não se reconstrói (§14);
> 2. o volume some da conta de urgência, porque `cruz_route.js` só olha
>    `pendente` — a venda nunca vira ordem;
> 3. **nada registrava.** Não havia como saber, depois, que aquilo aconteceu.
>
> `carga.js` sempre respondeu `estagio='embalado'` para *"isto está pra
> carregar?"* — a lista e o contador liam de lá, e **só o bipe tinha régua
> própria**, que é exatamente o que aquele arquivo existe para impedir. Hoje o
> bipe recusa com `nao_embalado`, **diz por onde imprimir** (a caixa está na mão
> da pessoa, na frente do carro: recusa sem caminho é o que ensina a empurrar do
> jeito que der) e a recusa vai para a **auditoria**.
>
> ⚠️ **E A BOCA DO BURACO ERA O `GET /api/print/:id`**, que imprimia a etiqueta
> de qualquer volume — inclusive o `pendente`. Era ele que punha etiqueta na mão
> do operador sem baixa. A tela da Etiqueta de Venda chama essa rota **depois**
> do `POST /api/embalar`, então o fluxo da bancada não mudou; o que saiu foi o
> **segundo caminho**: o botão "imprimir" da lista de lote, em
> `expedicao.html`, que pulava a bancada. É a lição do upload da etiqueta do kit
> (§4): dois caminhos para o mesmo papel é o que faz um deles sair errado sem
> ninguém saber que ele existia. Reimpressão de volume já `embalado` ou
> `carregado` continua igual (armadilha #1-B).
>
> **Os volumes que já saíram assim não são desfeitos por este conserto** — o
> saldo deles continua alto, e `skus.estoque` não se reconstrói (§14).
>
> **Quem conta esse passivo é o `node conferir_carregados.js`** (só lê; aceita
> `N` dias e `--scripts`). Ele separa duas coisas que o banco não separa: o
> volume que **pulou a etiqueta** e o que foi **fechado à mão** pelos scripts do
> §5 — os dois deixam `embalado_em` vazio, e a única marca entre eles é a hora
> `15:00:00` que aqueles scripts carimbam por **convenção** (§8), não por
> relógio. Um bipe feito exatamente às 15:00:00 seria lido como fechamento de
> script: é o falso negativo, e está escrito no cabeçalho do arquivo porque
> número de diagnóstico sem a margem ao lado vira fato.
>
> ⚠️ **E A MARCA TEM O FALSO POSITIVO SIMÉTRICO, QUE EU NÃO PREVI E A PRODUÇÃO
> MOSTROU (17/09/2026).** As 15:00 só existem desde **26/08/2026** — até a
> véspera o `regularizar_saida.js` carimbava `datetime('now')`, o relógio de
> verdade (o `fechar_vencidos.js` já nascia certo). Fechamento à mão feito antes
> disso sai com hora de gente, e a primeira versão do script o acusava como furo
> da dívida 13. Na primeira rodada em produção foram **3 dos 11**.
>
> ⚠️ **E A RÉGUA FOI CONFERIDA CONTRA UMA FONTE QUE NÃO VEIO DO MESMO
> RACIOCÍNIO** — é a lição do QR (§4) aplicada aqui: um teste que relê pela
> convenção com que escreveu não testa nada, ele pergunta a si mesmo. O
> agrupamento apontou os volumes **440, 484 e 485**; o histórico do shell do
> servidor trazia, de 25/08, exatamente `node regularizar_saida.js 440 484 485
> --aplicar`. Os três ids, na mesma ordem. Deixou de ser inferência.
>
> **Quando a dúvida voltar, o caminho é esse, e é barato:**
> `grep -n "regularizar_saida\|fechar_vencidos" ~/.bash_history` no servidor. Os
> scripts do §5 não gravam em auditoria — o histórico do shell é o único lugar
> onde essa decisão humana deixou rastro, e ele não é eterno.
>
> O que denuncia esses é o **segundo repetido**: um `UPDATE` em transação grava
> o mesmo instante em todas as linhas de uma vez, e ninguém larga uma caixa,
> pega outra e bipa **três** vezes dentro de um segundo. **Três, e não dois:**
> `datetime('now')` corta no segundo, então um bipe em x,1 s e outro em x,9 s
> caem na mesma string sem nada de errado ter acontecido. Dois é ambíguo; três
> não é — e na ambiguidade a resposta é **acusar**, porque esconder um furo
> deixa o saldo alto para sempre e ninguém vai procurá-lo, enquanto acusar um
> fechamento à mão custa uma conferência.
>
> O corte por data é obrigatório nos dois sentidos: depois de 26/08 os dois
> scripts carimbam 15:00, então agrupamento em outra hora não tem script que o
> explique e **volta a ser furo** — sem isso, um `UPDATE` em bloco feito amanhã
> apagaria furos sozinho. E a contagem do bloco olha **todo o histórico, nunca a
> janela**: ser parte de um fechamento em bloco é fato do volume, não do recorte
> por onde se olha, e contar dentro da janela faria o mesmo volume mudar de
> classificação conforme o argumento da linha de comando.
>
> A conta é **por peça** (a caixa de pacote devia ter baixado N, §5 #23) e
> **sob medida fica de fora** — ela nunca somou `+1` (§7), então cobrar a baixa
> dela abriria um buraco em vez de fechar. `teste_carregados.js` (28 casos)
> trava as três regras e as duas margens da marca.
>
> ⚠️ **NÃO HÁ `--aplicar`, E ISSO É A DECISÃO, NÃO UMA FALTA.** O script diz o
> que o sistema tem **a mais**; ele não sabe o que aconteceu **depois** — pode
> ter havido contagem, ajuste ou devolução no meio do caminho, e descontar por
> cima disso erra duas vezes. O caminho é: conferir a prateleira, e só então
> corrigir por **Admin → Estoque**, que exige motivo e grava em
> `ajuste_estoque` com quem e por quê (§18). Os scripts do §5 **não** servem
> aqui: eles carimbam saída, e a saída desses volumes já aconteceu — o que
> falta é o saldo, não o estágio.
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
>
> **`node teste_upload.js` (46 casos, desde 20/10/2026)** trava a dedup pelo
> histórico, a trava por volume do §6, a ordem das travas (divergência > pacote >
> folha que não fecha > modalidade > SKU sem cadastro), a caixa de N unidades que
> **não** retém e a conferência 5, que só acusa depois de 5 ocorrências. Ele troca
> o `parsePdf` por um que devolve os volumes já lidos: a leitura do PDF é do
> `teste_parse.js`, e aqui se testa o que a **rota** faz com eles.

### Os três scripts que fecham passivo — e as duas regras que valem para todos

> ⚠️ **DESDE 02/10/2026 O CAMINHO NORMAL É A MESA DE CORREÇÕES** (fases 2 e 3,
> logo abaixo): Admin → Correções tem "Dar saída", "Fechar vencidos", "Reabrir
> venda futura" e "Tirar da fila", com prévia, motivo e desfazer. **Os scripts
> continuam existindo para a operação em massa, e chamam as MESMAS ações** —
> cada volume que o terminal corrige grava a sua linha em `correcao` e aparece
> no histórico da Mesa, com desfazer. As regras abaixo continuam valendo; quem
> as aplica é o `correcoes.js`.

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

### ⚠️ A MESA DE CORREÇÕES — o dono corrige sem pedir ao Claude Code (02/10/2026)

**Fase 1 da spec `MESA-DE-CORRECOES.md`.** Até aqui todo passivo da operação se
corrigia **me pedindo para rodar um script no servidor** (os três acima, mais o
`reabrir_futuros.js` e o `limpar_fila.js`), e a **cancelada depois da etiqueta**
não se corrigia de jeito nenhum: o card em Admin → Bloqueados **só mostrava**
(decisão D3 da VENDAS F2, §3), e o `cancelada_dominio.js` dizia isso com todas as
letras — *"decidir é da Mesa de correções, que ainda não existe"*.

```
BUSCAR ──▶ VER O OBJETO ──▶ PRÉVIA ──▶ EXECUTAR (motivo) ──▶ DESFAZER
```

Aba **Correções** no admin, ao lado de Bloqueados — ela acusa, a Mesa corrige.
`correcoes.js` é o **dono único de cada ação**; `correcao_route.js` é a porta.

| Ação da fase 1 | Vale para | Estoque |
|---|---|---|
| **Descartar fantasma** | `pendente` cujo **irmão mais antigo** já andou (#5) | não |
| **Cancelada depois da etiqueta** | volume `cancelado` com `cancelada_estagio` `embalado`/`carregado` | **sim**, no "voltou" |

> ⚠️ **A MESA NÃO É UM EDITOR DE LINHAS DO BANCO.** Com as regras que parecem
> bug e não são (#1, #1-B, #5, #8, #9, #23…), apagar ou editar linha à mão
> quebra saldo e fila em silêncio. Cada objeto mostra **só as ações que valem
> para o estado dele**, e a que não vale aparece **desabilitada com o motivo
> escrito** — sumir com o botão não responde nada a quem foi procurar por ele.
> A prévia **não grava**: ela é o que separa a Mesa de um `UPDATE` na mão.

> ⚠️ **A RÉGUA DO FANTASMA SAIU DO SCRIPT E VIROU `classificarFantasmas`** — e o
> `limpar_fantasmas.js` passou a **ler dela** já nesta fase (a spec punha os
> scripts na fase 3). O laço estava escrito nos dois lugares, e o botão e o
> terminal discordariam sobre qual volume é fantasma no dia em que um deles
> mudasse: é a armadilha #12 na porta mais cara que existe, que é a que **apaga
> linha**. O script continua útil para a operação em massa; o que ele perdeu foi
> a opinião própria.
>
> ⚠️ **E A RÉGUA É "O IRMÃO MAIS ANTIGO", NÃO "ALGUM IRMÃO MAIS ANTIGO".** Ela
> varre o `lote` inteiro por id e guarda o **primeiro** volume de cada chave; um
> `SELECT` por volume (o `MIN(id)` de quem compartilha pack ou venda) parece
> igual e **não é**: com #1 só-venda, #2 venda+pack e #3 só-pack, o laço faz do
> #3 um primeiro e a consulta o casaria com o #2. Varrer custa uma passada por
> tela de admin, e a resposta é a mesma do script.

> ⚠️ **O "VOLTOU" DEVOLVE POR PEÇA, E NÃO `+1`** — decisão do dono em
> 02/10/2026, divergência da §4 da spec. A etiqueta de uma caixa de pacote
> baixou **N** (§5, #23): devolver 1 de 2 deixaria o buraco pela metade, e
> ninguém procuraria. É a mesma conta do `/api/embalar`, pelo mesmo
> `pecasDoVolume` — soma das `qtd`, nunca `length`. **Sob medida fica de fora**:
> ela nunca somou `+1` na embalagem e não baixou na etiqueta (§7), então
> devolver abriria um buraco em vez de fechar.

> ⚠️ **A CAIXA DE VÁRIAS PERSIANAS NÃO TEM O "VOLTOU"** (a mesma decisão). Ali o
> volume **nem é cancelado** — o cliente ainda quer as outras persianas —, e o
> relatório do ML cancela **um item** sem dizer qual peça da caixa é. O botão
> aparece só como *"Não voltou — só registrar"*, com a frase escrita: *"o
> sistema não sabe qual peça é. Separe a caixa, confira na mão, e o saldo se
> corrige por Admin → Estoque, com motivo."* Inventar qual voltou somaria saldo
> de uma persiana que está dentro de uma caixa a caminho do cliente.

> ⚠️ **O CARD DE BLOQUEADOS PASSOU A ESVAZIAR, e para isso o `lote` ganhou três
> colunas** (`cancelada_resolvida_em`, `cancelada_resolvida_por`,
> `cancelada_voltou`, por `ALTER` no `exp_route.js`, que é o dono da tabela —
> §17). Sem a marca o card nunca zerava, e **número que não zera vira
> paisagem** — aí ninguém o lê no dia em que ele significa alguma coisa. Quem
> escreve a marca é o `correcoes.js`; o `cancelada_dominio.listar` tira da lista
> quem a tem, e a cláusula só entra **quando a coluna existe**: um banco que não
> passou pelo boot do `exp_route` não pode perder a lista inteira por causa
> disso.

> ⚠️ **O DESFAZER COMPARA O ESTADO, E RECUSA O QUE ANDOU.** Sete campos dizem
> "o objeto andou" (`estagio`, `embalado_em`, `carregado_em`, `retirado_em`,
> `saida_id`, `saiu_em`, `no_carro_em`); diferente, a recusa **nomeia o campo**
> e nada é desfeito — desfazer por cima de trabalho novo é a armadilha #32 pela
> porta da Mesa. No fantasma a guarda é outra: o volume volta **com o mesmo
> id**, e se o número já estiver ocupado por outro volume a recusa diz isso em
> vez de sobrescrever. O `antes` carrega o `lote` **e as peças**, porque é delas
> que o desfazer precisa.

> ⚠️ **O FANTASMA APAGA AS PEÇAS JUNTO, E O SCRIPT AINDA NÃO.** O
> `limpar_fantasmas.js` faz `DELETE FROM lote` e deixa o `lote_item` órfão — o
> próprio comentário do `TABELAS` do modo teste avisa que *"o próximo volume com
> o mesmo id herdaria peças que nunca foram dele"*. A Mesa apaga os dois. **Os
> dois caminhos divergem no EFEITO até a fase 3**, que é quando o script passa a
> chamar o `correcoes.js` inteiro, e não só a régua. As órfãs que já existem no
> banco são passivo anterior a isto.

> ⚠️ **OS CONTADORES SÃO OS DOIS QUE TÊM BOTÃO** (decisão do dono). Vencidos,
> futuras fechadas e fila velha chegam na **fase 2**, junto com a ação deles:
> contador que acusa e não sabe liberar é a trava que a equipe aprende a
> contornar (§5, Bloqueados → escolher).

> ⚠️ **`correcao.executar` NÃO TEM BACKFILL, e isso é decisão.** O Admin Geral
> recebe toda chave **por nível** (§10), então ela chega ao dono no primeiro
> boot — a mesma razão do `kit.imprimir` (§4). É `admin` e **`sensivel`**,
> porque a cancelada que voltou mexe em saldo sem venda na frente, e o motivo é
> o único rastro de por quê. **As leituras também pedem a chave:** o `passivo` é
> a lista de tudo que está errado na operação.

> ⚠️ **A TELA FICA FORA DO AUTO_ADMIN DE 4 s**, como o painel de Estoque: a
> prévia e o motivo são campos abertos, e redesenhar tiraria da mão de quem está
> preenchendo. Ela se atualiza no clique da aba, depois de executar e depois de
> desfazer.

> **O render achou quatro coisas, e nenhuma tem teste de unidade que a pegue:**
> *"1 volumes fantasmas"* e *"Devolve 1 peça(s)"* (meia concordância se lê pior
> que nenhuma — é o *"1 destes pedidos já tiveram"* do §19 por duas portas), o
> `<summary>` repetindo o texto do contador logo acima (a tela dizendo a mesma
> coisa duas vezes, que é como o dono leu "duas vendas" na caixa de várias — §5,
> opção B) e o *"Corrigido ✓ — **Apaga** o volume #26"*, que reusava o resumo da
> prévia **no presente** depois de o efeito já ter acontecido.

**Rode `node teste_correcao.js` (115 casos) ao mexer no `correcoes.js`, no
`correcao_route.js`, na aba Correções ou no `limpar_fantasmas.js`** — ele foi
escrito **antes do código** (§0, risco 🔴) e **doze defeitos foram reintroduzidos
um a um** para provar que cada caso pega o seu: a devolução contando linha em vez
de peça (reprova 1), a caixa de várias aceitando o "voltou" (4), o fantasma
deixando as peças órfãs (4), o desfazer sem a guarda do "andou" (3), o desfazer
sobrescrevendo id ocupado (2), o sob medida recebendo a devolução (3), o irmão
pendente contando como fantasma (7), executar sem motivo (3), o card não
esvaziando (3), a régua copiada de volta no script (1), a prévia **gravando**
(5) e as leituras sem pedir a chave (7). Mexeu na chave ou na rota?
**`node teste_acesso.js` (262) e `node teste_cobertura.js` (10)** — o segundo
exige o módulo novo na varredura dele, e foi ele que cobrou. E mexeu no saldo?
**`node teste_livro.js` (60)**, que é quem trava `SUM(delta) = skus.estoque`.

> ✅ **NO AR** (PR #174), confirmado pelo dono em 02/10/2026.
>
> ⚠️ **AINDA NÃO FOI CONFERIDA NA FÁBRICA, e deploy não é conferência.** A
> rodada foi num navegador meu, a 1440 px (o admin se abre só no computador —
> §12, 29/09/2026), com banco semeado: o fantasma descartado e desfeito, a
> cancelada de uma peça devolvendo `+1`, a caixa de pacote devolvendo `+1` e
> `+2`, a caixa de várias sem o "voltou", o motivo cobrado, o card esvaziando e
> o histórico com o desfazer. **A prova que fecha a fase é o dono corrigindo um
> passivo de verdade pela tela** — e, principalmente, a **primeira cancelada
> real depois da etiqueta**, que é a prova que a VENDAS F2 deixou pendente (§3).
> Prova que não foi feita se escreve como não feita (§4).

### ⚠️ A MESA, FASES 2 E 3 — as outras ações, e o terminal com a mesma régua (02/10/2026)

| Ação | Vale para | O que faz | Era o script |
|---|---|---|---|
| **Dar saída** | volume não carregado que saiu de fato | `carregado` na data de despacho dele, às 15:00; coleta ganha `retirado_em` | `regularizar_saida.js` |
| **Fechar vencidos** | `pendente` com despacho até a data de corte | o mesmo, **em bloco**: uma correção só, que desfaz inteira ou não desfaz | `fechar_vencidos.js` |
| **Reabrir venda futura** | `carregado_em` com data que não chegou | volta a `embalado` — ou a `pendente`, se a etiqueta nunca saiu | `reabrir_futuros.js` |
| **Tirar da fila** | linha `aguardando` da fila | apaga a linha; a `embalado` é recusada | `limpar_fila.js` |
| **Pedir ajuste de saldo** | SKU | abre o pedido pela porta do ajuste em duas pessoas | — |

> ⚠️ **NENHUMA DELAS MEXE EM ESTOQUE.** A peça que saiu sem etiqueta nunca somou
> +1, e a fila nunca somou. O "Pedir ajuste" **não é exceção**: a Mesa não aplica
> nada, ela abre o pedido (`POST /api/estoque/ajuste`) e outra pessoa aprova na
> aba Estoque (§18, fase 3). A ação tem `porta` e não tem `executar`, e a prévia e
> a execução pela Mesa recusam dizendo a porta.

> ⚠️ **A DATA DE CORTE DE "FECHAR VENCIDOS" É OBRIGATÓRIA E NASCE VAZIA.**
> Fechar o que venceu só vale depois de alguém conferir no Mercado Livre que não
> há venda pendente no período — a venda atrasada de verdade some da fila junto
> com o ruído. Pré-preenchida, a data seria clicada sem conferir. O volume sem
> despacho lido só entra se **entrou** até o corte, e o modo teste fica fora.

> ⚠️ **"DAR SAÍDA" NÃO APAGA AS CÓPIAS do volume**, ao contrário do script
> antigo: depois da saída elas viram fantasmas, a prévia diz quantas, e saem
> pelo contador de fantasmas. O script `regularizar_saida.js` faz os dois passos
> (saída e fantasma) pela Mesa, e lista a cópia que **não** é fantasma — a mais
> antiga do par, que é a original e não se apaga.

> ⚠️ **O DESFAZER COMPARA COM O DEPOIS GRAVADO.** Nas ações que mudam o próprio
> estágio, o `depois` é relido do banco depois do efeito, e desfazer recusa se
> algum dos sete campos de "andou" mudou desde então. O bloco é **tudo ou
> nada**: um volume que andou trava o bloco inteiro, e a recusa diz qual.

> ⚠️ **OS CINCO CONTADORES TÊM BOTÃO.** Vencidos (despacho antes de hoje), futuras
> fechadas e **fila velha (mais de 30 dias)** se juntaram aos dois da fase 1. O
> de vencidos não conta o que vence hoje: é trabalho do dia.

> ⚠️ **NO TERMINAL, QUEM FEZ É O SCRIPT** (`terminal: limpar_fila.js`), e não um
> nome inventado; o motivo é `--motivo "texto"`, ou *"rodado pelo terminal:
> <script>"* sem ele. **O `limpar_fantasmas.js` agora apaga as peças junto**, que
> era a divergência de efeito da fase 1. As quatro escolhas da construção foram
> confirmadas pelo dono em 02/10/2026 (`docs/DECISOES.md`).

**Rode `node teste_correcao2.js` (98 casos) ao mexer nas ações da fase 2 e
`node teste_correcao3.js` (23) ao mexer nos scripts** — o segundo monta o mesmo
cenário em dois bancos, corrige um pelo botão e o outro **rodando os scripts de
verdade**, e exige os dois iguais linha a linha, com o mesmo antes e depois em
cada correção. Defeitos reintroduzidos: na fase 2, carimbo em hoje (reprova 7),
sem a guarda da futura (5), fila embalada tirável (4), o sem-data sem corte
(15), desfazer sem o "andou" (3), reabrir sempre embalado (1), coleta sem
`retirado_em` (2), o bloco desfazendo metade (5) e a prévia do ajuste pela Mesa
(1 — o caso nasceu dessa rodada); na fase 3, cada um dos cinco scripts na versão
antiga reprova de 2 a 4 casos.

> ✅ **NO AR** (PR #183), confirmado pelo dono em 02/10/2026.
>
> ⚠️ **AINDA NÃO FOI CONFERIDA NA FÁBRICA.** A rodada foi num navegador meu, a
> 1440 px, com banco semeado: os cinco contadores, o bloco de vencidos com a
> prévia, a busca por SKU, o pedido de ajuste, a saída executada e o histórico.
> A prova é o dono fechar um passivo de verdade pela tela, sem pedir script.

> ⚠️ **Lançamento manual e PDF não se conversam.** O manual (`origem='manual'`)
> não é apagado pelo recálculo. Usar os dois no mesmo SKU **duplica a ordem**.
> Regra prática: PDF cobre as vendas, manual cobre produção sem venda.
