# Tecido — estoque, sobras e plano de corte

Operação **sob medida** — a fábrica corta tecido contra o pedido do cliente,
enquanto o resto do PCP cuida da operação de **medida padrão**, vendida pelo
Mercado Livre.

Este módulo **não sobe sozinho**. Ele é montado dentro do PCP, em `/sobmedida`,
pelo `server.js` da raiz. Uma porta, um processo, um PIN.

```bash
npm test          # daqui: 405 casos, banco temporário, sem servidor
node server.js    # da RAIZ: sobe o PCP inteiro, com o sob medida junto
```

O que continua separado é o **miolo**: banco próprio (`tecido.db`), domínio
próprio, migrações numeradas, testes próprios. A junção é de porta, não de
dados — misturar os dois esquemas trocaria um problema de acesso por um de
dados, e este é o único schema do projeto que se reconstrói sozinho num banco
novo.

> ⚠️ **Ele já foi um segundo servidor, na porta 3020, com PIN próprio.** Durou
> um dia em produção e custou três defeitos: o botão que não escapava do iframe
> do admin, a porta fechada no firewall e — o pior — um beco sem saída, porque
> liberar alguém exigia uma sessão que só existia depois de liberado. Uma
> tranca sem chave. Se você está pensando em separar de novo, leia a seção
> **Entrada única** antes.

---

## As três perguntas que o módulo responde

| # | Pergunta | Onde | Fase |
|---|---|---|---|
| 1 | Quanto eu tenho do tecido X? | saldo por rolo, com endereço | **pronta** |
| 2 | Que sobras eu tenho do tecido X? | medida, condição, endereço | **pronta** |
| 3 | Estas medidas — **como cortar?** | plano com o encaixe desenhado | **pronta** |

---

## Estado da construção

| Fase | O quê | Estado |
|---|---|---|
| 1 | Esqueleto (núcleo, registro, schema, `base.css`, `ui.js`) + Cadastros + Parâmetros | **pronta** |
| 2 | Cadastro de sobra + mutirão + etiquetas | **pronta** |
| 3 | `encaixe.js` + testes (a tabela do 6.4) | **pronta** |
| 4 | Plano de corte só nas sobras | **pronta** |
| 5 | Rolo: entrada, saldo, acerto no fim | **pronta** |
| 6 | Plano completo: bobinas + recusa + sobra gerada | **pronta** |
| 7 | Painel e relatórios | **pronta** |
| 8 | Upload do arquivo de medidas | **pronta** (leitor genérico — ver abaixo) |

E, da spec `SOBMEDIDA-PEDIDO-REVENDA` (o segundo assunto do módulo — a venda):

| Fase | O quê | Estado |
|---|---|---|
| 1 | Catálogo de venda, ficha técnica e simulador | **pronta e conferida na fábrica** (22/09/2026) |
| 2 | Revendas, carteiras, tabelas A/B/C, feriados e prazo | **em código** (22/09/2026) — falta cadastrar as revendas de hoje |
| 3 | Pedido interno: orçamento, envio que congela, fila do vendedor, aprovação, PDF | **em código e conferida no deploy** (23/09/2026) — falta a semana em paralelo ao Decorsoft |

---

## O CATÁLOGO DE VENDA E O SIMULADOR (fase 1 da spec `SOBMEDIDA-PEDIDO-REVENDA`)

> **22/09/2026.** A partir daqui o módulo tem **dois assuntos**. Até ontem ele
> respondia só sobre *estoque de tecido*; agora responde também sobre *venda
> sob medida* — o que a fábrica vende, com que regra técnica e por quanto.
> As tabelas novas levam prefixo `sm_` por isso: `modelo` e `componente`
> sozinhos obrigariam quem lê a adivinhar de qual dos dois assuntos são.

O pedido sob medida chega por WhatsApp, é digitado no Decorsoft e a regra
técnica — qual tubo vai, se o bandô cabe, a quanto cortar o tecido — mora na
cabeça de quem digita. A fase 1 tira essa regra da cabeça e põe em cadastro.

### ⚠️ `dominio/persiana.js` é o DONO ÚNICO de "o que esta persiana é"

Entra modelo, coleção, cor, medida **acabada** e as escolhas; sai o degrau, os
componentes com medida de corte e de consumo, o kit, o preço, os avisos e as
recusas. Quem faz essa pergunta chama **esta** função: o simulador de hoje, o
pedido da fase 3, a explosão da ficha na aprovação e a etiqueta da fase 4.

Uma segunda conta em qualquer uma delas seria a armadilha #12 do `CLAUDE.md` —
duas telas certas, cada uma na sua régua, e a bancada cortando por uma
enquanto o cliente foi cobrado pela outra.

> **Ele não grava nada.** Na aprovação (fase 3) o pedido **congela** o
> resultado: a persiana aprovada hoje continua sendo cortada com o desconto de
> hoje, mesmo que alguém mude o cadastro amanhã. Ficha relida ao vivo faria a
> etiqueta impressa e a tela discordarem, e na bancada vence a etiqueta.

### ⚠️ MILÍMETRO INTEIRO E CENTAVO INTEIRO, e `nucleo/unidade.js` é a porta

| | Por dentro | Por fora |
|---|---|---|
| Medida | milímetro inteiro (`970`) | metro com **três** casas (`0,970`) |
| Área | mm² inteiro (1 m² = 1.000.000) | m² com três casas |
| Dinheiro | centavo inteiro (`16500`) | `165,00` |

O resto do módulo trabalha em metros `REAL`, e ali está certo: a bobina é
medida assim, e a tolerância de 1 mm do `erros.js` resolve. Aqui a conta
**empilha** — o tubo tira do final, o tecido tira do tubo, a base soma no
tecido — e ruído de ponto flutuante compõe a cada degrau.

> ⚠️ **AS TRÊS CASAS SÃO REGRA, INCLUSIVE O ZERO FINAL.** `0,97` na etiqueta
> faz a serralheria parar para pensar se o número está completo; `0,970` não.

> ⚠️ **E A CONVERSÃO DA TELA NÃO É `Number(x) * 1000`.** `1,007` digitado vira
> `1006.9999999999999`, e o servidor — que exige milímetro inteiro, com razão —
> recusaria uma medida que a pessoa digitou certa. As duas telas leem os dois
> lados do número como **texto** e somam inteiros. Mais de três casas é
> recusado na hora: abaixo do milímetro não há corte.

### A escada de tubos, e por que ela tem que subir

Sobe até o **primeiro degrau onde a persiana cabe nos dois limites**: largura
**e** m². Passou de qualquer um dos dois, sobe. A medida exata fica no degrau
de baixo — 1,700 ainda é Tubo 32.

| Tubo | Largura até | m² até | Desconto | Altura do tecido | Bandô | Redução pedida |
|---|---|---|---|---|---|---|
| 32 | 1,700 | 3,0 | −30 mm | final + 200 | ✅ | ❌ |
| 38 | 2,200 | 3,5 | −30 mm | final + 200 | ✅ | ✅ |
| 41 | 2,700 | 5,0 | −40 mm | final + 250 | ❌ | ✅ |
| 56 | 3,000 | 7,0 | −45 mm | final + 250 | ❌ | ✅ |

> ⚠️ **A ESCADA TEM QUE SUBIR NOS DOIS LIMITES, e o cadastro recusa quem não
> sobe.** Um degrau que aceita menos largura que o de baixo quebra a promessa
> em silêncio: a persiana **pula** aquele tubo e vai para o seguinte, e o único
> jeito de descobrir é comparando a etiqueta com o que a serralheria esperava.

**Vale sempre o mais restritivo entre coleção, modelo e degrau**, e a recusa
**nomeia quem recusou** — `A largura de 2,900 passa dos 2,800 que a coleção
Screen 1% aceita`. "Acima do limite" sem dono não diz onde mexer.

### ⚠️ A COLEÇÃO DE VENDA APONTA PARA O CADASTRO DE TECIDO. NUNCA O DUPLICA

`sm_modelo_colecao` guarda `abertura_id` — a mesma linha que a entrada de rolo,
o corte e as sobras usam. O que a venda acrescenta é o que o estoque não tem:
preço por m², largura máxima, m² máximo e mínimo faturado.

Duas listas de coleções divergiriam no primeiro tecido novo, e o pedido
chegaria ao plano de corte pedindo um tecido que o estoque não reconhece.

> ⚠️ **E O MODELO NÃO GUARDA LINHA** — decisão de 22/09/2026, e ela sai do
> próprio schema: `abertura` já pendura em `linha` com `UNIQUE(linha_id,nome)`,
> e o `criarTecido` recusa `abertura_de_outra_linha`. **A linha já está dentro
> da coleção.** Guardá-la também no modelo seria uma segunda afirmação sobre o
> mesmo fato — é o defeito do `linhaSel`/`linhaForm` de 15/09/2026, em que o
> formulário descrevia `Double Vision` com uma coleção do `Rolô`.
>
> Além disso os dois não são a mesma coisa: `linha` é a família do **tecido**
> (Rolô, Romana, Double Vision) e o modelo é o **mecanismo** (Rolô, Rolô
> Duplex, Rolô Motorizada). Rolô e Motorizada partilham o mesmo tecido.

### ⚠️ A FICHA TEM OS DOIS NÚMEROS POR LINHA — armadilha #18 do `CLAUDE.md`

| Coluna | Responde | Quem lê |
|---|---|---|
| `ref_*` / `ajuste_*` | a quanto a bancada **corta** | a etiqueta de produção |
| `consumo_ref_*` / `consumo_ajuste_*` | quanto a peça **consome** | Compras e o custo |

Os dois nunca fecham, e quem um dia "unificar" está cortando ou a peça ou o
custo. **Na fase 1 o consumo nasce igual ao corte, e a coluna existe desde o
primeiro dia** — quando a fábrica medir a perda de verdade, o consumo anda
sozinho e o corte fica onde está. Há caso travando: dobrar a medida de corte
não pode mexer em um centavo.

Cada linha é **referência + ajuste**, e não linguagem de fórmula:

```
ref_largura   final | degrau (final − desconto) | <chave de um componente>
ref_altura    final | degrau (final + acréscimo)
```

A ficha do Rolô, inteira:

```
tubo     degrau  + 0      → 1,000 vira 0,970
tecido   tubo    − 5      × degrau + 0   → 0,965 × 1,200
base     tecido  + 5      → 0,970 (fica igual ao tubo)
bandô    final   − 5      → 0,995      (só quando há bandô)
barra    final   − 9      → 0,991      (só quando há barra)
```

> ⚠️ **A REFERÊNCIA NÃO PODE OLHAR PARA A FRENTE.** A ficha é calculada em
> ordem; uma linha que se mede por um componente ainda não calculado não tem
> resposta — e **sem a guarda ela não daria erro nenhum**: a medida sairia
> vazia e a etiqueta iria para a bancada assim. O cadastro recusa, e o cálculo
> confere de novo, porque ficha antiga no banco nunca passou por aquela guarda.

### O kit, e por que são três códigos de barras

| Persiana | Kit | Suportes |
|---|---|---|
| Sem bandô e sem barra | Kit tradicional | os padrão do kit |
| Com bandô | Kit bandô | pela largura |
| Com barra | Kit barra | pela largura |

```
até 1,000 → 2 · até 1,900 → 3 · até 2,600 → 4 · até 3,000 → 5
```

Na medida padrão o QR do kit é **fixo** e prova só que *algum* kit entrou
(`CLAUDE.md` §4). Aqui prova que entrou **o certo** — e é por isso que são três
códigos e não um. O bipe que confere isso é da fase 5.

### Preço — e as duas regras que vieram inteiras do PCP

```
m² cobrado  = maior entre o m² real e o mínimo faturado (1,5 m²)
tecido      = m² cobrado × preço do m² da COLEÇÃO
bandô/barra = largura REAL × R$/m linear
redução     = R$ por peça, cobrada inclusive quando entra automática
```

> ⚠️ **O BANDÔ E A BARRA COBRAM PELA LARGURA REAL, NUNCA PELA DE CORTE.** A
> barra é cortada a 1,991 e o cliente compra 2,000 m de barra — cobrar pelo
> corte faria a fábrica deixar de pagar o que ela corta fora.

> ⚠️ **CUSTO INDEFINIDO NUNCA VIRA ZERO** (regra 4 do `COMPRAS.md`, e o
> `custo.js` daqui). Coleção sem preço: o subtotal é `null` — não a soma
> parcial —, o que se sabe sai como **piso** (`≥`) e a linha que falta é
> **nomeada**. Zero é um custo válido e mentiroso.

> ⚠️ **QUEM NÃO TEM `custo.ver` NÃO RECEBE OS CAMPOS.** A poda é a mesma do
> resto do módulo (`custo.podar`), que corta **por padrão de nome**. Por isso
> todo campo de dinheiro daqui se chama `preco_*` ou `valor_*`: um
> `total_centavos` **não casaria** com o padrão e vazaria em silêncio. Há caso
> travando os dois lados.
>
> Hoje isso é um no-op — só a chefia alcança o simulador. Ele está aqui porque
> a **fase 7** põe a revenda na mesma porta, e defesa que se escreve depois que
> o usuário existe é defesa que se escreve tarde.

### ⚠️ A OPÇÃO QUE SOME DA TELA DIZ POR QUE SUMIU

O resultado traz um bloco `opcoes` com o que **aquela medida** aceita, e o
motivo quando não aceita. Ele é calculado sempre, e não só quando alguém pede:
descobrir pela recusa daria a frase certa e **nenhuma persiana calculada
junto**, e a revenda leria "deu erro" em vez de "nesta medida não tem bandô".

> A frase é **parte da regra**: *"O bandô não é possível nesta medida: o tubo
> enrolado não cabe dentro do bandô."* Acessório que some sem explicação vira
> ligação da revenda para o vendedor.

E quem escolhe o indisponível continua sendo **recusado pelo servidor** — a
tela esconder o botão não é a regra; a regra é a que existe fora do navegador
(armadilha #26 do `CLAUDE.md`). Quando a medida muda e o adicional deixa de
caber, a tela **avisa e pede para escolher de novo**, nunca tira em silêncio —
e o recado sobrevive ao redesenho seguinte, porque aviso que pisca por 50 ms é
aviso que ninguém leu.

### Quem vê o quê

| Chave | O quê | Cortador | Vendedor | Chefia |
|---|---|:---:|:---:|:---:|
| `modulo.entrar` | abrir o módulo (tela inicial e menu) | ✅ | ✅ | ✅ |
| `catalogo.ler` | ver o catálogo e usar o simulador | ❌ | ✅ | ✅ |
| `catalogo.editar` | modelo, coleções, escada, ficha, preços | ❌ | ❌ | ✅ |
| `custo.ver` | os campos de dinheiro no JSON | ❌ | ✅ | ✅ |
| `revenda.ler` | as revendas e a carteira | ❌ | ✅ | ✅ |
| `revenda.editar` | cadastro, endereços, contatos, tabela, desconto | ❌ | ❌ | ✅ |
| `credito.editar` | o limite de crédito e a revisão dele | ❌ | ❌ | ✅ |
| `pedido.ler` | ver pedidos, orçamentos e a fila | ❌ | ✅ | ✅ |
| `pedido.lancar` | lançar, editar, enviar e reabrir | ❌ | ✅ | ✅ |
| `pedido.aprovar` | aprovar pedido **da própria carteira** | ❌ | ✅ | ✅ |
| `pedido.aprovar_qualquer` | aprovar pedido de **qualquer** carteira | ❌ | ❌ | ✅ |
| `pedido.prazo` | negociar o prazo, com motivo | ❌ | ✅ | ✅ |
| `pedido.cancelar` | cancelar pedido ou peça de pedido | ❌ | ❌ | ✅ |

As três telas de venda são **escritório** (tema escuro):
`/sobmedida/catalogo`, `/sobmedida/simulador` e `/sobmedida/revendas`.

> ⚠️ **NENHUMA DELAS ESTÁ NO CORTADOR**, e isso é decisão da fase 1: quem usa é
> a equipe de escritório, não quem está em pé na bancada.

> ⚠️ **O VENDEDOR GANHOU ÁREA PRÓPRIA NA FASE 2** — *Sob medida — venda*, no
> PCP —, e com ela o papel `vendedor`. Até a fase 1 ele entrava pela área "Sob
> medida — cadastros", que é a da **chefia**: precisava de cadastro de tecido,
> parâmetros do encaixe e descarte de sobra para simular uma persiana. A
> dívida estava escrita e fechou aqui.
>
> ⚠️ **A CHAVE DELE É `nivel:'operacao'` NO PCP, E ISSO É TRAVA.**
> `sincronizarAreas` põe a área `'admin'` em quem tem **qualquer** chave de
> nível admin, e o portão em `nucleo/acesso.js` lê `'admin'` como **diretor**.
> Declarada como admin, `sobmedida.vender` devolveria ao vendedor exatamente o
> módulo inteiro que ela veio tirar dele — sem ninguém pedir, e sem erro em
> tela nenhuma.
>
> ⚠️ **`custo.ver` ESTÁ NO PAPEL DELE, E TEM QUE ESTAR.** A poda do `custo.js`
> corta todo campo de dinheiro de quem não a tem — sem ela o vendedor abriria
> o simulador e veria a persiana inteira **sem o preço**, que é justamente o
> número que ele foi buscar.
>
> ⚠️ **E `revenda.editar`/`credito.editar` NÃO SÃO DELE**, por decisão da fase
> 2: a tabela, o desconto e o limite são decisão de quem responde pelo
> dinheiro (§4.12 e §4.13 da spec). Revenda nova, troca de tabela, endereço de
> entrega novo e limite passam pela chefia. **Alargar é uma linha; o
> contrário, não.**

> ⚠️ **NASCEU `modulo.entrar`, e ela é conserto de um defeito evitado.** A tela
> inicial e o `/api/eu` pediam `cadastro.ler`, *"a chave mais baixa que todo
> mundo que entra tem"* — com o terceiro papel isso virou mentira. Ou o
> vendedor abriria o módulo em branco com 403 no console, ou ganharia
> `cadastro.ler` de carona, e com ela a lista inteira de tecido, endereço e
> motivo.

> ⚠️ **TELA QUE NÃO ESTÁ NO `public/nav.js` NASCE INVISÍVEL.** O rodapé monta
> `ORDEM.filter(...)`: uma tela declarada em `nucleo/telas.js` e liberada pela
> permissão, mas esquecida lá, simplesmente **não tem botão** — sem erro, sem
> log, e só quem souber o endereço de cor chega nela. É a armadilha #13 do
> `CLAUDE.md` por mais uma porta, e a ponta que some em silêncio é sempre a
> última. **Tela nova pede a linha em `telas.js` E em `nav.js`**, no mesmo
> commit.

### O que a semente traz, e o que ela NÃO traz

A migração 16 cria o modelo **Rolô** inteiro: os quatro degraus, os doze
componentes, as doze linhas de ficha, as quatro faixas de suporte e a regra da
redução — os números das seções 4.4 a 4.8 da spec.

> ⚠️ **AS COLEÇÕES DE VENDA NÃO ENTRAM NA SEMENTE, e isso não é esquecimento.**
> Elas apontam para linhas de `abertura` que só existem no cadastro real da
> fábrica; inventá-las criaria coleção duplicada, que é o primeiro ❌ da seção 9
> da spec. Elas se ligam na tela de Catálogo, uma vez, com o catálogo na
> frente — e é lá que o preço do m² de cada uma é lançado.

### Teste obrigatório

```bash
cd tecido && npm test          # 405 casos
```

**Rode ao mexer em `dominio/persiana.js`, `dominio/catalogo_sm.js`,
`nucleo/unidade.js` ou na migração 16** — os 32 casos de `persiana.test.js`
são os três exemplos do §4.5, o kit do §4.7 e o preço do §4.8 **escritos à
mão, não calculados pelo código**, mais cada divisa com o par que fica e o que
sobe: 1,700 · 3,0 m² · 2,200 · 3,5 m² · 3,000 · 7,0 m² · 1,000/1,001 suportes ·
4,5 m² · 2,200 da redução · 3,000 de altura do bandô · 2,800 do Screen 1%.

> ⚠️ **Os números dos casos vieram da spec, não do código.** Um teste que
> refaz a conta com a mesma convenção do código que testa não testa nada: ele
> pergunta a si mesmo. Foi assim que o QR da etiqueta do kit passou por três
> rodadas verdes (`CLAUDE.md` §4).

### ✅ CONFERIDO NA FÁBRICA EM 22/09/2026 — dez persianas reais, dez bateram

O dono fez o deploy e simulou **dez pedidos reais do WhatsApp**. Nas dez, o
tubo, as medidas de corte e o kit bateram com o que a fábrica cortaria.

> ⚠️ **ISTO VALE MAIS QUE OS 304 CASOS VERDES, e está escrito aqui por isso.**
> Teste diz que o código faz o que eu escrevi; só a fábrica diz que o que eu
> escrevi é o que ela corta. O defeito do QR da etiqueta do kit passou por
> **três rodadas verdes** antes de o dono descobrir com o celular na mão
> (`CLAUDE.md` §4) — a régua final nunca é o teste.

**O que foi cadastrado no deploy**, e é o estado de hoje:

| | |
|---|---|
| Coleções ligadas ao Rolô | **oito** — `1%` · `1% FB` · `3%` · `5%` · `Blackout` · `Napoles BK` · `Pinpoint BK` · `Translucido` |
| Cores de acessório | **quatro** — Branco · Bege · Cinza · Preto |
| R$/m² por coleção | **lançado em 22/09/2026**, e conferido nas dez |
| Largura máxima por coleção | **em branco** — quem limita é a escada |

> **`Double Vision · Classic` não foi ligada**, e não é esquecimento: ela é do
> modelo Duplex, que ainda não existe como modelo de venda. Ligá-la ao Rolô
> faria o simulador oferecer tecido de Duplex numa persiana Rolô.

> ⚠️ **SEM PREÇO, O SIMULADOR MOSTRA `≥` — e isso é a regra funcionando.** Os
> preços de hoje estão lançados, mas a regra continua de pé para a coleção nova
> de amanhã: o subtotal sai nulo, o que se sabe sai como **piso** e a linha do
> tecido é **nomeada** como sem preço. Quem ler o âmbar como tela quebrada vai
> "consertar" somando zero, que é o custo válido e mentiroso da regra 4.

### ✅ E O PREÇO FOI CONFERIDO NA MESMA TARDE — segunda rodada de dez

O R$/m² das coleções foi lançado e as **dez foram refeitas comparando o TOTAL**
com o que foi cobrado de verdade. As dez bateram.

Antes delas, duas contas escolhidas para **não depender de qual preço foi
lançado** — e as duas bateram:

| Medida | m² real | O total tinha que ser | O que prova |
|---|---|---|---|
| `1,000 × 1,000` | 1,000 m² | **1,5 × o preço** | o mínimo faturado está pegando |
| `2,000 × 1,000` | 2,000 m² | **2 × o preço** | acima do mínimo quem manda é o m² real |

> **São DUAS rodadas de dez, e não uma.** O corte foi conferido antes de o preço
> existir; o preço, depois que ele foi lançado. A fase 1 tem duas metades — o
> que a fábrica corta e o que o cliente paga — e cada uma foi conferida com a
> outra já de pé.

> ⚠️ **O TOTAL DE CIMA É O PREÇO DECCORAR, e o da revenda vem EMBAIXO dele**
> (fase 2, abaixo). Os dois aparecem juntos e nunca um no lugar do outro: o de
> cima vai para faturamento, Compras, crédito e relatório; o de baixo é o que
> aquela revenda paga. Trocar um pelo outro na tela é o primeiro passo para
> trocar um pelo outro na conta.

---

## QUEM COMPRA: REVENDA, CARTEIRA, TABELA E PRAZO (fase 2)

A tela é **`/sobmedida/revendas`** (escritório, tema escuro), e ela responde
quatro coisas: quem são as revendas, quem cuida de cada uma, quanto cada uma
paga, e quando o pedido fica pronto.

### O preço da revenda sai do Deccorar em CASCATA

```
subtotal Deccorar          R$ 209,00      ← não se mexe
  × tabela B (−10,00%)
  × desconto da revenda (−5,00%)
a revenda paga             R$ 178,70
```

> ⚠️ **CASCATA, E NÃO SOMA** — decisão do dono em 22/09/2026. Somados, 10% + 5%
> dariam 15%; em cascata dão 14,5%, e num pedido de mil reais a diferença é de
> cinco. Pior: a soma deixaria dois percentuais grandes **zerarem a venda** sem
> ninguém notar, porque a tela continuaria mostrando dinheiro.

> ⚠️ **ARREDONDA UMA VEZ, NO FIM.** A conta é feita em inteiro
> (`subtotal × centésimos × centésimos`) e só divide no fim. Dois
> arredondamentos em cadeia erram um centavo para cima ou para baixo sem regra
> nenhuma — e é o centavo que aparece na conferência da revenda e não tem como
> ser explicado. Há caso travando: reintroduzir o defeito reprova o teste.

> ⚠️ **TABELA SEM PERCENTUAL NÃO TEM PISO.** Piso quer dizer "no mínimo isto",
> e desconto só faz o número **descer** — ali o subtotal Deccorar seria um
> **teto**. A tela escreve *"ainda não dá para dizer o que esta revenda paga —
> falta lançar: tabela B"*, e não um `≥` que diria a coisa errada com a palavra
> certa (e gastaria o sinal que a equipe aprendeu a ler como "falta preço em
> alguma linha").

> ⚠️ **AS TRÊS TABELAS NASCEM SEM PERCENTUAL, E NÃO COM ZERO.** `NULL` é "ainda
> não se sabe"; zero é "sem desconto", que é decisão. Semeadas com zero, o
> sistema cobraria o preço cheio de todo mundo com cara de regra aplicada — e
> ninguém descobriria, porque o número só ficaria maior.

> O desconto **da revenda**, esse sim, nasce **zero**: não ter desconto extra é
> o caso normal de quase todo mundo. `NULL` ali faria o preço de toda revenda
> sair como piso até alguém digitar zero, e aviso que aparece no caso normal é
> aviso que a equipe aprende a ignorar (armadilha #6 do `CLAUDE.md`).

### O prazo — `dominio/prazo.js` é o dono único

```
enviado até quarta 18:00  →  pronto na quinta da SEMANA SEGUINTE
um minuto depois          →  a quinta da outra semana
entrega em dia não útil   →  empurra, e DIZ qual feriado empurrou
```

Os quatro números (dia e hora do corte, dia da entrega, semanas) são
**parâmetros**; os feriados são **cadastro**, com data e nome. Parâmetro fora
da faixa é **recusado** — `prazoCorteHora` por extenso ou dia da semana 7,
aceitos, mudariam a conta em silêncio.

> ⚠️ **CONTA A HORA DO ENVIO, NUNCA A DA APROVAÇÃO.** Aprovar é tarefa da
> Deccorar, e a demora dela não passa para a revenda. Por isso `calcular`
> **recebe** o momento do envio em vez de olhar o relógio: na fase 3 o pedido
> guarda o prazo congelado, e recalculá-lo com o relógio de hoje daria outra
> data para o mesmo pedido.

> ⚠️ **NENHUM `new Date()`.** A data sai do SQLite, como manda o `nucleo/dia.js`
> — e aqui isso importa mais que no resto do módulo, porque um dia de
> diferença muda a semana inteira.

> **A prévia é o que torna o cadastro conferível.** Quatro parâmetros e uma
> lista de feriados não dizem nada sozinhos; a pergunta é *"um pedido enviado
> agora fica pronto quando?"*, e a tela responde por extenso. Sem isso o
> cadastro só seria conferido pelo primeiro cliente que reclamasse.

### O vendedor é gente do PCP — `nucleo/pessoas.js` é a porta única

A revenda guarda o `vendedor_usuario_id` do PCP e o `vendedor_nome` como
**retrato**: a carteira precisa continuar legível daqui a um ano, mesmo que a
pessoa saia. A lista de nomes chega por uma porta ligada no `server.js`.

> ⚠️ **A PORTA ENTREGA `id` E `nome`, E MAIS NADA.** O mapeamento é explícito:
> mesmo que o PCP passe a linha inteira de `usuarios`, PIN, salt e áreas não
> atravessam. O que não atravessa não vaza.

> ⚠️ **SEM A PORTA LIGADA, RECUSA — NUNCA LISTA VAZIA.** Lista vazia em
> silêncio faria a tela afirmar que a fábrica não tem ninguém, e alguém
> passaria a tarde procurando no lugar errado. A recusa **diz onde se liga**.

> ⚠️ **NÃO HÁ CADASTRO DE VENDEDOR AQUI DENTRO.** Dois cadastros de gente são
> dois lugares para lembrar de desligar alguém — foi por isso que este módulo
> deixou de ter o dele em 02/09/2026.

### A carteira é DERIVADA, e quem está sem vendedor aparece

A carteira é "o conjunto de revendas que este vendedor atende" — uma consulta,
não uma tabela. Uma segunda tabela dizendo a mesma coisa divergiria no primeiro
vendedor trocado, e as duas estariam certas, cada uma na sua régua.

> ⚠️ **QUEM ESTÁ SEM VENDEDOR APARECE**, com o nome escrito por extenso
> (*— sem vendedor —*) e em âmbar. Esconder faria a tela dizer que o trabalho
> acabou, e o "pronto quando" desta fase é justamente cada revenda com um
> vendedor.

### O limite de crédito: mostra, não trava

O limite tem **porta própria** (`credito.editar`), grava histórico e carimba a
data da revisão. Quem está com a revisão vencida (o prazo é o parâmetro
`creditoRevisaoMeses`, hoje 2) aparece marcado.

> ⚠️ **O "DISPONÍVEL" NÃO EXISTE AINDA, e está escrito na tela.**
> `disponível = limite − boletos em aberto`, e boleto é a fase 6. Mostrar o
> limite cheio como disponível seria número mentindo.

> ⚠️ **O CAMPO SE CHAMA `valor_limite_credito_centavos` DE PROPÓSITO.** A poda
> do `custo.js` corta por **padrão de nome**: `limite_credito_centavos` não
> casaria com `preco|valor|custo|nf|fornecedor` e viajaria pelo fio em
> silêncio. Há caso travando os dois nomes, o certo e o errado.

> **Revisar sem mudar o número também é revisão** — e é o caso mais comum: o
> vendedor olha, conclui que está bom e carimba. Sem esse botão, a única forma
> de sair da lista de vencidos seria mudar o limite, e aí a equipe mudaria o
> número só para a tela parar de cobrar.

### Regras do cadastro que parecem chatice e não são

- **CNPJ torto é recusado; CNPJ vazio passa.** Revenda sem CNPJ existe — a que
  ainda não mandou o cartão. Travar por isso faria o cadastro esperar papel, e
  a equipe lançaria um número qualquer para a tela aceitar. O dígito
  verificador, por outro lado, **nunca dispara no caso normal**: ele só pega
  dedo trocado, que é o erro que vira nota recusada semanas depois.
- **Campo ausente não é campo vazio.** Editar só mexe no que veio no corpo.
  Vazio **explícito** apaga, e isso é decisão de quem editou.
- **Um endereço padrão só.** Dois marcados fariam a tela do pedido escolher o
  primeiro que a consulta devolvesse — por sorte, e a caixa iria para a loja
  errada sem ninguém ter escolhido nada.
- **Desativar não apaga.** Revenda apagada levaria o pedido dela junto.

---

## O PEDIDO (fase 3 da spec `SOBMEDIDA-PEDIDO-REVENDA`)

A tela é **`/sobmedida/pedidos`** (escritório, tema escuro), e `dominio/pedido.js`
é o **dono único do ciclo**. Ele não calcula persiana (isso é o `persiana.js`)
nem prazo (isso é o `prazo.js`): ele decide o que pode virar o quê, e **congela**.

```
rascunho   se edita à vontade, e o preço lido é o de HOJE
enviado    número, preço, tabela e prazo ficam GRAVADOS
aprovado   a ficha é explodida e gravada — e nada mais muda
```

### CONGELADO É CONGELADO — a frase que governa o arquivo inteiro

Depois do envio, **nenhuma leitura volta ao catálogo** ou ao cadastro da
revenda. Um reajuste de terça não pode mexer no que foi vendido na segunda — é
a armadilha #15 (preço que anda para trás) pela porta da venda. E depois da
aprovação nem a **ficha** se relê: a persiana é cortada como a etiqueta dela já
diz, e **na bancada vence a etiqueta**.

As duas datas são diferentes de propósito, e estão na spec: preço congela no
**envio** (§4.8), ficha congela na **aprovação** (§4.11).

> ⚠️ **E O TUBO QUE MUDA ENTRE AS DUAS DEIXA LINHA.** Há uma janela: alguém
> mexe na escada com o pedido na fila, e a fábrica corta um tubo diferente do
> que foi vendido. É raro e caro — o tipo de coisa que ninguém procura depois se
> não estiver escrito. A aprovação grava em `sm_pedido_alteracao` (`degrau`,
> antes e depois), e a tela mostra no histórico.

### O número, e por que ele recusa antes de existir

O parâmetro **`pedidoNumeroInicial`** nasce **em branco**, e enquanto estiver
assim o envio é **recusado** dizendo onde se lança. Não é falta: é a decisão.

> O plano de corte agrupa o **tom único** pelo TEXTO do pedido e olha para trás
> (`cortesAnteriores`, em `plano.js`). Um `4272` novo colado num `4272` antigo
> do Decorsoft herdaria o histórico de tom de outra casa — a persiana sairia de
> um rolo escolhido para outro cliente.

E ele **nunca desce**: quem manda é o maior entre o parâmetro e o que já foi
usado. Baixar o parâmetro por engano não faz o número voltar por cima de pedido
que existe.

**Orçamento não queima número.** Ele só simula, com o preço de hoje lido ao vivo
a cada leitura — gravar um preço no rascunho faria o orçamento **envelhecer
calado**. Virar pedido é um ato próprio, registrado; o envio recusa quem ainda é
orçamento.

### O que volta, e o que não volta

- **Enviado volta a rascunho**, com motivo, e o reenvio recalcula preço e prazo.
  O **número fica** — ele já foi dito à revenda por escrito, e número que volta
  para o bolo é número que um dia sai duas vezes.
- **Aprovado não volta, nem pelo admin.** Corrige-se **cancelando a peça com
  motivo e lançando outra**. A spec propunha *"até a primeira etiqueta
  impressa"*, e essa marca só existe na fase 4: implementá-la agora criaria uma
  regra que não pega em ninguém (a dívida 18 do `CLAUDE.md`).
- **Apagar peça só no rascunho que nunca foi enviado.** Depois do primeiro
  número, ela sai **cancelada** e continua na lista, com quem e por quê: sumir
  em silêncio de uma lista que alguém imprimiu faz a conferência virar
  discussão.

### A cor do tecido é obrigatória aqui, e opcional no simulador

Lá ela só escreve o nome na frase; aqui ela decide **qual rolo sai da
prateleira**. O `tecido_id` é resolvido pelo `persiana.js` e **gravado no
lançamento** — reencontrá-lo depois pelo nome da cor seria uma segunda régua, e
a que erra é a que manda o rolo errado.

A lista sai de `GET /api/sm/colecoes/:id/cores` (`catalogo.ler`), e só traz cor
que **tem item de tecido cadastrado**: cor sem item não aparece em tela nenhuma
do módulo e o corte não a encontra.

### "Sem tecido" é sinal, nunca trava

O pedido de um tecido que não está na estante **entra normalmente**, marcado, e
o vendedor negocia prazo maior. Travar seria a armadilha #6: a venda existe, e
quem é recusado vende por fora. E o sinal não é a resposta do plano de corte —
a pergunta aqui é grossa (*"há bobina deste tecido, larga o bastante?"*).

### A fila do vendedor, em DIAS DE FÁBRICA

Três dias no papel com um feriado e um fim de semana no meio são **zero** dias
de trabalho. Quem conta é `prazo.diasUteis`, e **negativo fica negativo**: prazo
vencido é justamente o que a lista existe para mostrar.

`pedido.aprovar` é *"aprovo a minha carteira"*; `pedido.aprovar_qualquer` é
*"aprovo a de qualquer um"*, e existe para a fila não parar numa semana de
férias. A **rota de aprovar pede a estreita** — declarar a larga tiraria do
vendedor a própria fila.

### A folha em PDF

`GET /api/pedidos/:id/pdf` monta a folha que a revenda confere, **do pedido
gravado** e nunca do catálogo. Ela traz as linhas de preço **uma a uma**, com a
conta escrita do lado: só o total faria a conferência virar *"confie no
número"* — e é essa conferência que acha o erro de digitação da medida antes de
a peça ser cortada.

> ⚠️ **Rascunho não vira papel**, e o texto passa por um higienizador:
> Helvetica escreve em **WinAnsi**, e a seta ou o emoji colado do WhatsApp na
> observação fazem o `pdf-lib` estourar no meio da geração, com a folha pela
> metade. Vira `?`, e a folha sai.

### ✅ Conferida em produção em 23/09/2026 — o pedido 5001

Ciclo inteiro numa revenda de verdade, e as contas refeitas **por fora**,
contra o PDF: duas persianas e duas coleções de preços diferentes na mesma
folha. `4,620 m² × R$ 110,00 = R$ 508,20` com redução de peso automática
cobrada; `1,000 × 1,000` cobrando o **mínimo faturado de 1,500 m²**; a cascata
da tabela B (−5%) dando `530,29 + 251,75 = R$ 782,04`, que é a soma das peças
fechando com as parcelas impressas; prazo de quarta 13:31 caindo na quinta
01/10; e a peça de tecido fora da estante **entrando marcada**, sem travar.

> ⚠️ **A folha prova o ciclo e a aritmética, não o cadastro.** Que R$ 110,00 e
> R$ 140,00 sejam os preços certos daquelas coleções é decisão de quem lançou.
> A prova que falta é a semana em paralelo ao Decorsoft, pedido a pedido.

### Duas regras de tela que só apareceram renderizando

- **Pedido sem peça não vale `R$ 0,00`** — ele não vale **nada ainda**, que é
  outra afirmação. Zero se lê como "de graça".
- **O `aria-label` e o texto do `<label>` dizem a mesma coisa.** Eram "Bandô ou
  barra" e "Bandô / barra": quem enxerga lia um nome e quem usa leitor de tela
  ouvia outro, conferindo o mesmo campo.

---

## A ETIQUETA DE PRODUÇÃO (fase 4-A da spec `SOBMEDIDA-PEDIDO-REVENDA`)

A tela `/sobmedida/producao` é da **bancada**: ela lista os pedidos aprovados,
diz quantas etiquetas cada setor tem e quantas já saíram, imprime o maço de um
setor e manda o tecido para o plano de corte.

```
SER-000123   serralheria   tubo, base, bandô, barra
COL-000045   coleção       o tecido
MON / REV / EMB            montagem, revisão, embalagem
```

**O que vai escrito, nas cinco linhas de 100 × 35 mm:**

```
5001 · 1 de 2
LAR DO CILAR · quinta 01/10
1,000 × 1,000 · Rolô Screen 1% Branco · COMANDO DIREITO
TUBO 32 · CORTAR 0,970
▐▌▐▌▐▐▌▐▌▐▐▌▐▌▐▐▌▐▌▐▐▌▐▌▐▐▌▐▌▐▐▌▐▌▐   SER-000001
                                      SERRALHERIA
```

### As regras que parecem bug e não são

- **O código nasce na APROVAÇÃO, não na impressão.** Ele é da peça, e sai na
  mesma transação da ficha congelada. Reimprimir sai com o **mesmo** código, e
  conta como reimpressão — no contador da peça e numa linha de
  `sm_etiqueta_impressao`. Código novo a cada papel partiria a história da peça
  em duas; código reaproveitado sairia um dia em duas peças.
- **O número nunca volta ao bolo.** Nem no cancelamento da peça, nem quando o
  backfill reatribui. Mesma regra do número do pedido.
- **Cada setor tem o seu contador.** `SER-000001` e `COL-000001` convivem
  porque são duas filas físicas. Um contador só faria o serralheiro ler saltos
  de dezenas entre uma etiqueta e a seguinte, sem nada explicando.
- **A medida escrita é a de CORTE.** A persiana de `1,000 × 1,000` manda a
  serralheria cortar `0,970` e a coleção cortar `0,965 × 1,200`. São os dois
  números da linha da ficha, e eles nunca fecham.
- **No tubo, o nome da peça é o degrau** — `TUBO 32`, nunca só `TUBO`. Tubo 32
  e Tubo 41 são peças diferentes, compradas separadas e guardadas em lugares
  diferentes.
- **A coluna do setor mostra "falta de total"**, e fica verde quando saiu tudo.
  É o número que impede o maço sair duas vezes.
- **O aviso do já impresso aparece ANTES do botão**, com o número do pedido, e
  manda jogar o rolo anterior fora. Depois do clique ele explicaria um maço que
  já saiu.
- **Só pedido aprovado tem etiqueta.** O enviado ainda espera o vendedor, e a
  recusa diz isso.
- **São 6 etiquetas na persiana simples e 7 com adicional.** A ficha tem oito
  componentes que geram etiqueta, mas bandô e barra nunca convivem e nenhum dos
  dois entra com `adicional='nenhum'`.
- **`etiqueta_producao.imprimir` não é `etiqueta_producao.ler`.** O vendedor lê
  (precisa saber se a peça dele foi para a bancada); quem imprime é quem está
  com o rolo na impressora.

### O corte

`POST /api/producao/para-cortar` devolve as peças de tecido dos pedidos
escolhidos **em medida de corte**, agrupadas **por tecido** — `plano.calcular`
recebe um tecido por plano, porque não há emenda e bobina de cor diferente é
outro estoque. O `pedido` que vai no tom único é o número do pedido, que a
fase 3 já garantiu estar acima do Decorsoft.

Era exatamente isto que o leitor da etiqueta do Decorsoft já fazia
(`etiqueta_corte.js`); a diferença é que agora o dado vem do próprio sistema.

### Os aprovados de antes: `backfill_etiquetas.js`

```bash
node backfill_etiquetas.js              # só mostra
node backfill_etiquetas.js --aplicar    # grava, com backup por db.backup()
```

Ele roda pelo **mesmo** `atribuirCodigos` da aprovação — não é uma segunda
régua — e é idempotente. O pedido 5001, aprovado em produção na manhã de
23/09/2026, é exatamente o caso que ele existe para alcançar.

### O que ainda não foi conferido

**O rolo impresso.** A régua final de código de barras é o leitor bipando, e
enquanto isso não acontecer o que existe é indício: 405 casos verdes e a tela
aberta. O módulo do CODE128 é o `public/barras.js`, o mesmo do PCP e da
etiqueta de sobra, numa faixa de 66 mm no rodapé — a primeira versão punha o
código numa coluna de 38 mm e o módulo caía a 0,23 mm, abaixo do que a ZD220
resolve numa etiqueta amassada.

---

## As respostas que viraram regra (seção 11 da especificação)

Estas decisões são do dono da operação. Mudar qualquer uma **muda o cálculo**,
não só a tela.

| # | Pergunta | Resposta | Onde vive |
|---|---|---|---|
| 1 | Margem entre peças? | **Não — as peças encostam.** `margem = 0` | parâmetro cadastrável; muda todo o encaixe |
| 2 | Peça mais larga que a bobina? | **Sempre entregar o plano de menor desperdício.** A peça que fisicamente não cabe volta *marcada com o motivo* e o resto é planejado — o plano nunca deixa de sair | `dominio/plano.js`, fase 4/6 |
| 3 | Quem descarta ou corrige sobra? | **Só a chefia.** `sobra.descartar` e `sobra.corrigir` não estão no papel `cortador`. A bancada **aponta** (`sobra.propor`) e a chefia aceita | `nucleo/permissoes.js` |
| 4 | Sobra com defeito parcial? | **Entra, mas por último** | `condicao_sobra.prioridade` e `.aproveitavel` |
| 5 | Leitor na bancada? | **Sim.** Campo de bipe visível, aceita Enter e Tab, processa por timeout | telas das fases 2 e 4 |
| 6 | Sequência das etiquetas? | **O sistema imprime.** Escolhe-se a quantidade, ele gera a sequência e registra o lote; a sobra nasce quando o operador bipa a etiqueta colada | tabelas `etiqueta` e `etiqueta_lote` |
| 7 | Autenticação? | **Entrada única.** Um PIN, na tela do PCP; depois se escolhe a operação. A liberação é uma área em Admin → Acessos | `nucleo/acesso.js` + `montar.js` |

> **A resposta 7 mudou em 02/09/2026, depois de um dia em produção.** Ela era
> "login único": dois servidores, dois cadastros de pessoas, e uma ponte HTTP
> perguntando ao PCP quem era o dono do cookie. Funcionava — e mesmo assim
> liberar a primeira pessoa era impossível, porque a tela de liberação exigia
> estar liberado. Hoje não há segundo cadastro nem ponte: um processo só.

> **A resposta 6 revoga a R11 da especificação.** Lá a etiqueta era pré-impressa
> e o código, digitado pelo operador; a lista de pendência seria um palpite
> sobre lacunas na sequência. Com a impressão pelo sistema, "etiqueta colada e
> não cadastrada" passa a ser exata: **impressa e ainda não bipada**.

---

## As regras que não se quebram

1. **A regra de negócio mora em `dominio/`.** `if` de negócio dentro de handler
   HTTP está no lugar errado.
2. **`dominio/encaixe.js` é função pura** — números entram, números saem. Sem
   banco, sem HTTP. É o único jeito de testá-lo de verdade.
3. **Uma tabela, um dono.** `rolo.saldo` só muda por `dominio/rolo.js`;
   `sobra.status` só por `dominio/sobra.js`.
4. **Todo movimento deixa registro.** Saldo de rolo nunca muda sem linha em
   `movimento_rolo`.
5. **Rota nasce declarada.** `app.get`/`app.post` direto não existe fora de
   `nucleo/registro.js`. **Rota sem `permissao` é negada** — e há teste disso.
6. **Um envelope só:** `{ok:true, dados}` / `{ok:false, motivo, mensagem}`.
   Nenhum stack trace chega ao operador.
7. **O DDL mora em `nucleo/schema.js`**, numerado, com tabela de migrações.
   Migração aplicada nunca se edita — corrige-se com outra, no fim.
8. **Nenhum hex dentro de uma tela.** Cor só em `base.css`.
9. **Datas pelo SQLite**, centralizadas em `nucleo/dia.js`.
10. **Medidas em metros, `REAL`.** Exibição por `ui.js`; toda comparação com
    tolerância de 1 mm.

> **A ordem no `server.js` da raiz é arquitetura, não estilo.** `auth` antes de
> `express.static`. Invertendo, o Express entrega os `.html` direto do disco e
> qualquer pessoa abre a tela sem PIN. O portão deste módulo repete a mesma
> guarda por dentro: **nenhum `.html` sai do disco por caminho direto** — as
> telas só abrem pelos caminhos declarados em `nucleo/telas.js`, e é lá que a
> permissão é conferida.

### Teste de segurança obrigatório após mexer em `auth.js`, `server.js` ou `montar.js`

```bash
for r in / /admin /operador /setor /sobmedida /sobmedida/corte \
         /sobmedida/cadastros /sobmedida/telas/corte.html \
         /api/skus /sobmedida/api/eu; do
  printf "%-30s " "$r"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010$r
done
curl -s -o /dev/null -w "/login  %{http_code}\n" http://localhost:3010/login
```

Esperado: telas `302`, API `401`, `/login` `200`. **Qualquer `200` numa tela é
furo de segurança.** E `/sobmedida/telas/corte.html` tem que dar `403` mesmo
para o diretor logado — se der `200`, o static furou o portão.

---

## Estrutura

```
montar.js              o PORTAO: monta tudo no app do PCP, sob /sobmedida
nucleo/                infraestrutura — nao sabe nada de tecido
  db · schema · erros · dia · registro · config · permissoes
  acesso    traduz AREA do PCP em PAPEL daqui
  telas     que telas existem, que permissao pedem, e o TEMA de cada uma
dominio/               a regra — nao conhece Express, req nem res
  tecido · endereco · motivo · sobra · etiqueta
  rolo · encaixe (funcao pura) · plano · painel
  persiana · revenda · prazo · pedido · pedido_pdf     a VENDA sob medida
  etiqueta_producao · etiqueta_producao_pdf            a BANCADA
dados/                 o SQL. Uma tabela, um arquivo. Nao decide nada
rotas/                 declaracoes. Sem SQL, sem `if` de negocio
public/                base.css (tokens) · ui.js · nav.js · telas/
teste/                 rodar.js + *.test.js — banco temporario, do zero
```

---

## Carregar os itens de tecido de uma lista

```bash
node tecido/carga_itens.js lista.txt              # simula, nao grava nada
node tecido/carga_itens.js lista.txt --aplicar    # grava
```

Uma coleção por linha, cores separadas por vírgula:

```
Rolo · 3%: Bege, Branco, Cinza, Preto
Double Vision · Classic: Branco, Creme, Mescla
```

Casa ignorando acento, caixa e espaço duplo — `Rolô` e `Rolo` são a mesma
linha para quem digitou, e recusar por acento seria recusar por motivo nenhum.

**Simula por padrão**, como o `limpar_fila` e o `limpar_fantasmas`. Trinta
itens entrando de uma vez são trinta chances de a lista estar errada, e
desfazer cadastro depois de ter rolo apontando para ele é caro.

**Rodar duas vezes não duplica**: o que já existe é contado à parte e não entra
na conta do que vai cadastrar.

> ⚠️ **ELE NÃO INVENTA CADASTRO.** Cor, linha ou coleção que não existe vira
> **recusa com o nome escrito**, nunca um cadastro novo criado em silêncio —
> e nada é gravado, nem as linhas que estavam certas.
>
> `Mescla` que falta pode ser cor nova de verdade, ou `Mesela` digitado
> errado. O segundo caso só apareceria quando alguém procurasse a cor na tela
> e não achasse, com os itens já criados apontando para ela.
>
> **Carga pela metade é pior que carga nenhuma**: sobra a dúvida de quais
> linhas entraram.

---

## Conferir o cadastro inteiro de uma vez

```bash
node tecido/ver_cadastro.js      # so le, pode rodar em producao
```

Mostra linhas, coleções, cores, larguras e itens de tecido numa tela só, e
termina com **OLHAR COM ATENÇÃO** — três coisas que não aparecem clicando aba
por aba:

| Aviso | Por que importa |
|---|---|
| cor com nome de coleção dentro (`Nápoles Bege`) | o sistema deixa de saber que aquilo **é bege** |
| linha sem coleção ativa | nenhum item de tecido pode nascer nela — ela some do seletor |
| coleção sem nenhum item | ou é cadastro adiantado, ou alguém esqueceu de montar o item |

Não são erros do sistema: são coisas que só quem conhece o catálogo sabe dizer
se estão certas. **O script aponta e cala** — decidir é de quem cadastra.

---

## O rolo na estante: endereço, movimentação e a etiqueta do tubo

### O endereço é um LUGAR, não um tubo

`ROLO · A-1-2` é *aquele buraco na estante*. O tubo que estiver ali é o que o
operador pega. Três níveis: haste → andar → posição dentro do andar.

### ⚠️ CADA NIVEL GUARDA UM ROLO SÓ (regra do dono, 15/09/2026)

`Haste A · Andar 1 · Nível 1` é um buraco, e no buraco cabe **um** tubo. O
andar tem quantos níveis a prateleira física tiver — quem precisa guardar mais
material **cria mais nível**, que é exatamente o que a estante de verdade faz.

| Onde | O que acontece |
|---|---|
| **Entrada de rolo** | nível com tubo vem **travado** na fileira, com o código dele escrito no botão |
| **Mover** | só os buracos vazios entram na lista; os cheios aparecem contados embaixo, com quem está neles |
| **Sobra** | **sem** esta trava — várias cabem no mesmo lugar |

> ⚠️ **O BURACO SE ESVAZIA SOZINHO, e não há botão para isso.** São dois
> caminhos, e só esses dois: o tubo **mudou de lugar** (Mover) ou o material
> **acabou** (Rolo acabou, que encerra). Rolo encerrado não ocupa — tubo vazio
> não guarda lugar. Um terceiro caminho, manual, seria um jeito de o sistema
> achar que o buraco está vazio com o tubo ainda lá dentro.

> **Por que a trava é do rolo e não da sobra.** São duas prateleiras com dois
> usos. O rolo é um tubo que o cortador desce inteiro da estante, e dois tubos
> no mesmo buraco viram *"pegar aquele que parece"* — que é a mesma coisa que
> a etiqueta de 54 pt existe para evitar. A sobra é retalho dobrado: várias
> cabem no mesmo lugar, e quem acha a peça certa lá é a **etiqueta**, não o
> endereço.

> ⚠️ **A RECUSA DIZ QUEM ESTÁ LÁ, e as duas saídas.** *"Endereço ocupado"*
> sozinho manda a bancada procurar — e com o tubo na mão ela não procura: ela
> lança **sem endereço**, que é o dado que não volta depois (armadilha #6).
> Por isso a frase traz o código do rolo, o tecido, o saldo, e as duas coisas
> que resolvem: escolher outro nível (ou criar um) ou marcar "Rolo acabou".

> **E a tela trava o botão ANTES do toque.** `GET /api/rolos/ocupacao` diz quem
> está em cada buraco, e o nível cheio nasce desabilitado com o código do tubo
> ao lado. Recusa que só aparece depois do toque ensina que o sistema erra — é
> a mesma regra do botão de imprimir etiqueta, que nasce desabilitado quando as
> medidas não fecham. O botão fica **visível e apagado**, nunca escondido:
> buraco que some da fileira faz a bancada procurar um endereço que ela sabe
> que existe.

> ⚠️ **O QUE JÁ ESTAVA NA PRATELEIRA ANTES DA REGRA NÃO É RECUSADO.** Trava
> nova não apaga passado, e recusar de uma vez tudo que existe pararia a
> estante inteira por um estado que ninguém criou hoje. O endereço com dois
> rolos vira a **sexta checagem** do painel gerencial (`gerencial.problemas`),
> onde é trabalho de arrumar em vez de recusa na cara de quem tem o tubo na
> mão. Não há índice `UNIQUE` no banco pelo mesmo motivo — e porque um
> `SQLITE_CONSTRAINT` cru não diz **quem** está no buraco.

> **Cheios os dez, o botão já oferece o 11.** A trava empurra para o lado
> certo — criar o buraco novo —, e esse lado tinha um `prompt` vazio no fim.
> `endereco.proximoNome()` calcula o próximo da sequência e a `arvore()` leva
> ele pronto (`proximo_nivel` no andar, `proximo_andar` na haste): o botão
> passa a dizer **"+ nivel 11"** e o campo abre preenchido, nas duas telas que
> criam endereço — a fileira dos rolos e Cadastros. Uma conta só para as duas,
> que é a armadilha #12 em miniatura.
>
> ⚠️ **É SUGESTÃO, NÃO REGRA — R5 continua de pé.** O nome segue livre: apagar
> e escrever "fundo" passa igual, e por isso a conta mora no domínio e **não**
> dentro do `criarNivel`. Ela vai pelo **maior número**, nunca pela quantidade
> (o nível apagado no meio deixaria a sugestão repetir um nome que já existe),
> conta o **desativado** também (o `criarNivel` recusa repetido olhando os
> dois — sugerir o que ele recusa é a tela mandando fazer o que o sistema não
> aceita), copia o **zero à esquerda** de quem já está lá, e devolve `null`
> quando não há sequência numérica para seguir. `null` é "não dá pra dizer",
> nunca 1: num andar de níveis chamados "frente" e "fundo", sugerir 1
> inventaria uma ordem que ninguém usa.

**Teste obrigatório:** `node teste/rodar.js` — os 10 casos de
`teste/endereco_unico.test.js` travam a entrada, o Mover, os dois jeitos de
liberar o buraco, o limite por nível (e não por andar), o rolo sem endereço, a
sobra de fora e o aviso do painel. Os 11 de `teste/proximo_nivel.test.js`
travam a sugestão do próximo número — inclusive que ela não vira regra.

### O que vai escrito onde

| Onde | O quê | Responde |
|---|---|---|
| na prateleira | `A-1-2` | **onde** ir |
| no tubo (etiqueta) | `R-000012` | **qual rolo** é |

> ⚠️ **O ENDEREÇO NÃO ENTRA NA ETIQUETA DO TUBO, e isso é decisão.**
> O que vai colado é o que **não muda de lugar**: código, tecido, largura da
> bobina. O endereço muda toda vez que o tubo volta em outro buraco — uma
> etiqueta dizendo `A-1-1` passaria a mentir no primeiro dia, e o operador
> confia no que está escrito no tubo **antes** de olhar a tela.
>
> Onde o rolo está é pergunta para o sistema, que sabe a resposta de agora.

### Mudou de lugar → botão **Mover**, na lista de rolos

O tubo sai da estante para cortar e volta — quase sempre no mesmo buraco, e aí
não há nada a registrar. Quando volta em **outra** haste ou andar, o endereço
do sistema passa a apontar para um lugar vazio, e o próximo que procurar aquele
rolo não acha. Ele não conclui *"alguém moveu"*: conclui *"o sistema erra"*.

- Fica em `movimento_rolo` com **delta zero**: o saldo não mudou, o lugar mudou
- É a **mesma tabela** do consumo de propósito — o histórico do rolo é um só
- **Quem moveu vem da sessão**, nunca de um campo digitado: campo de nome em
  tela de fábrica é preenchido com o nome de quem está por perto
- Mover para o mesmo lugar é recusado — histórico cheio de linha que não conta
  nada é histórico que ninguém lê, e aí a linha que importa passa batida
- Rolo **encerrado** não volta para a estante: tubo vazio endereçado faria a
  estante do sistema ter um rolo que não existe mais

### A etiqueta do tubo — 100 × 150 mm

Botão **Etiqueta** na lista de rolos. Parâmetros próprios (`etqRolo*`), não os
da sobra:

| | sobra | rolo |
|---|---|---|
| Tamanho | 100 × 35 mm | **100 × 150 mm** |
| Código | 22 pt | **54 pt** |
| Barras | 14 mm | 22 mm |
| Margem | 4 mm | 6 mm |
| Lida | de perto, na mão | **de longe, na estante** |

São usos diferentes, por isso parâmetros separados — um "reaproveita os da
sobra" faria mexer numa estragar a outra. Chegar perto de cada tubo para ler o
número é o que faz o operador desistir e *"pegar aquele que parece"*.

A metragem impressa sai **com a data**: ela envelhece no primeiro corte, e
número sem data é número que alguém vai usar achando que é de hoje.

`desenharBarras` é o dono único do traço do código — as duas etiquetas
desenham por ele. Duas cópias divergiriam no dia em que alguém ajustasse uma, e
a divergência só apareceria no bipe.

---

## De quem o rolo veio, quanto custou, e há quanto tempo está parado

Três perguntas que o módulo não respondia: **quanto R$ está parado de cada
tecido**, **quanto cada fornecedor cobra** e **há quanto tempo aquele material
não sai**.

### ⚠️ O PREÇO MORA NO ROLO, congelado na compra

A forma óbvia — uma coluna `preco_m2` no cadastro do fornecedor, multiplicada
na hora de mostrar — **quebra em silêncio**: no dia em que o fornecedor
reajustar, **todo o estoque comprado antes muda de valor retroativamente.** O
rolo pago a R$ 18 em março passa a valer R$ 22 porque houve reajuste em
setembro, e ninguém percebe — o número só fica maior.

É a regra do `COMPRAS.md`: *o pedido congela embalagem, fator e preço.*

Então `rolo.preco_m2` guarda **o que foi pago naquela compra**, e o R$ parado é
a soma exata rolo a rolo — nunca uma média aplicada por cima. Travado pelo caso
*"REAJUSTE DO FORNECEDOR NAO MEXE NO QUE JA ESTA NA PRATELEIRA"*.

### E por isso NÃO existe tabela de preço por fornecedor

Duas razões, e as duas doem depois:

1. o preço varia **por tecido** — o mesmo fornecedor não cobra igual por
   blackout e por screen;
2. uma tabela mantida à mão **envelhece calada**: o número fica lá parecendo
   atual e ninguém sabe de quando é. É a dívida dos *"mínimos são placeholder"*
   do `COMPRAS.md` e do **alvo velho** da §18 do `CLAUDE.md`.

O que pré-preenche a próxima entrada é o **último preço realmente pago** daquele
fornecedor naquele tecido, tirado das próprias entradas. Nunca fica velho,
porque vem da compra de verdade. Sem histórico do par, cai para o último preço
do tecido com qualquer fornecedor — e a tela **diz de quem era**, em vez de
fingir que é o preço daquele.

O mesmo dado responde *"quanto cada fornecedor cobrou"*: média **ponderada pelo
m² comprado**, não pela quantidade de compras — uma ponta de 5 m e uma bobina
de 200 m não pesam igual.

### ⚠️ CUSTO INDEFINIDO NUNCA VIRA ZERO

Rolo sem nota lançada **não entra na soma como zero**. Ele é contado à parte e
o total sai como **piso**, com `≥` na frente e o número de rolos que faltam.

Zero é um custo válido e mentiroso: faria o estoque parecer mais barato do que
é, e o defeito é invisível — um total menor não tem cara de erro. Na tabela
esse rolo mostra **traço**, nunca `R$ 0,00`, que se lê como "não vale nada".

Regra 4 do `COMPRAS.md`, e a mesma da aba Estoque do PCP (§18).

### ⚠️ QUEM NÃO TEM `custo.ver` NÃO RECEBE OS CAMPOS

O JSON sai **sem** eles — a poda acontece na rota (`rotas/rolos.js`), não na
tela. Esconder no navegador deixaria o número viajando pelo fio, ao alcance de
quem abrisse a aba de rede. Regra 14 do `CLAUDE.md` §13, a mesma do Recebimento.

### A nota chega DEPOIS do rolo — e isso é o caso normal

O tubo desce do caminhão e vai para a estante; a nota entra no financeiro dias
depois. Um sistema que só aceita a nota na entrada obriga a uma de duas coisas,
e as duas são piores: **inventar um número** ou **deixar o rolo fora do
sistema**.

Por isso NF, fornecedor e preço são **opcionais na entrada**, e há o botão
**Nota** em cada linha de rolo (permissão `rolo.nota`) — que abre um formulário,
e não três `prompt` em fila: são campos que se leem juntos do mesmo papel.

> **O total da compra sai calculado embaixo** (`m² comprado × R$/m²`). É ele que
> se confere contra a nota na mão, e é o único jeito de pegar uma vírgula fora
> de lugar **antes** de o número entrar no estoque.

**Mexer no preço muda o valor do estoque, então não passa calado:** fica em
`movimento_rolo` com `delta` zero, dizendo `de → para` e quem fez. Mesma tabela
da mudança de endereço, pelo mesmo motivo — o histórico do rolo é um só. Salvar
sem mudar nada **não** grava linha: histórico que não conta nada ninguém lê.

> ⚠️ **E existe a lista "Sem nota".** Sem ela, *"a nota chega depois"* vira
> *"a nota nunca chega"* — exatamente a armadilha #14: marcar sem listar não é
> adiar a revisão, é cancelar a revisão.

### ⚠️ PARADO É TEMPO SEM SAIR, não idade do rolo

Rolo que entrou há oito meses e é cortado toda semana **não está parado**.
A coluna conta desde o **último consumo**; quem nunca foi cortado conta desde a
entrada, e a tela diz qual dos dois é.

Medir por idade poria quem trabalha no topo da lista de encalhe — e lista que
acusa inocente é lista que ninguém lê (armadilha #10 do `CLAUDE.md`).

### O fornecedor era texto livre, e isso já era dívida

`Ecotex`, `ecotex` e `Ecotex Ltda` somam separado — o mesmo defeito de `2,5` e
`2,50` virarem duas bobinas, com o agravante de só aparecer meses depois, na
hora de comparar fornecedor.

A migração 9 **semeia a lista com o que já foi digitado, marcado para
conferir** — é ali que a chefia acha os duplicados, que é o ponto. Uma lista
semeada limpa esconderia justamente a bagunça que motivou o cadastro. A coluna
**Rolos** diz qual é qual: *Ecotex* com 12 e *ecotex* com 1.

**Criar fornecedor é da bancada** (`endereco.criar` — a mesma chave de "cadastro
que nasce com a mercadoria na mão"): o rolo desce do caminhão de quem ninguém
cadastrou, e a alternativa não é esperar, é o rolo entrar **sem fornecedor** —
e esse dado não volta depois.

**Teste obrigatório:** `node teste/rodar.js` — os 13 casos de
`teste/custo.test.js` travam o preço congelado, o piso, a poda no fio, o rastro
da edição e o "parado ≠ idade".

---

## O PAINEL GERENCIAL (Painel → Gerencial)

A visão de estoque de **bobina nova** para quem decide. Responde, em segundos:
quanto temos, onde está, o que gira, o que está parado, quanto tempo dura, e
quanto deveria ter.

> ⚠️ **Esta aba SUBSTITUIU "O que sai", e não ficou ao lado dela.** Duas abas
> respondendo *"quanto sai e quanto tenho"* com recortes diferentes seriam duas
> réguas para a mesma pergunta — a armadilha #12 do `CLAUDE.md`, que já custou
> a reforma inteira da aba Estoque do PCP. O conteúdo da antiga está todo aqui,
> num grão mais fino.

### ⚠️ O GRÃO É TECIDO × LARGURA DE BOBINA

Somar as bobinas de um mesmo tecido responde bem *"o que mais sai"* e responde
**errado a cobertura**. Aqui **não há emenda**: peça de 2,20 não sai de bobina
2,00, e 2,00 não vira 3,00. São estoques diferentes — é por isso que a fábrica
mantém as duas.

O exemplo que trava isso em teste:

```
Rolo 1% Branco · bobina 2,00   →  20 m² parados,  ~4 dias de cobertura
Rolo 1% Branco · bobina 3,00   → 270 m² parados, ~35 dias de cobertura

somados:  290 m² sobre 13 m²/dia  →  22 dias  ← o gestor leria "tranquilo"
```

**Todo consolidado (coleção, cor, bobina) é SOMA desse grão**, nunca uma
segunda consulta — duas consultas divergiriam no dia em que uma esquecesse de
excluir o ajuste, e as duas pareceriam certas.

### O que este painel olha, e o que ele ignora

| | |
|---|---|
| **Olha** | bobina nova (`rolo`, status aberto/fechado) |
| **Ignora** | sobra, retalho e refugo — outra prateleira, painel próprio (Encalhe) |

> ⚠️ **E é por isso que a fonte de consumo é `movimento_rolo`, e NÃO
> `plano.consumo_m2`.** O plano soma rolo **e** sobra na mesma coluna
> (`encaixe.js:146`) — legítimo para medir desperdício do corte, e errado aqui:
> contaria retalho como tecido novo. **Os dois números existem, os dois estão
> certos, e eles não se reconciliam.** Quem tentar somar um no outro está
> misturando duas perguntas.

### As fórmulas, todas

| Indicador | Conta |
|---|---|
| **Consumo** | `movimento_rolo` com `motivo='consumo'`, gravado só no plano **confirmado** |
| **Média diária** | m² da janela ÷ **dias corridos** da janela |
| **Média mensal** | média diária × 30 |
| **Cobertura** | m² em estoque ÷ média diária — `null` sem consumo |
| **Estoque mínimo** | média diária × `estMinDias` × (1 + `estMinSeguranca`/100) |
| **Dias sem sair** | desde o último corte, **sem janela** |

> ⚠️ **`ajuste` e `encerramento` não são consumo.** O ajuste é correção de
> contagem; o encerramento é o acerto do que sobrou no tubo. Somados, o painel
> deixaria de responder *"quanto a fábrica cortou"* e passaria a responder
> *"quanto a coluna variou"*. Lição do `fluxo_estoque.js` do PCP (§18).

### ⚠️ O estoque mínimo NÃO é um percentual chutado no código

Sem prazo de fornecedor — que este módulo não tem, e não é escopo dele — **não
existe ponto de pedido honesto**. O que existe é uma pergunta que o gestor
responde: *"quantos dias de consumo eu quero ter na prateleira?"*

Os dois números vivem em **Cadastros → Parâmetros**, com rótulo e ajuda ao
lado. Um `× 1,3` escondido numa função seria um número que ninguém sabe de onde
saiu e que ninguém muda sem deploy.

> **`estMinSeguranca` nasce ZERO de propósito.** Um colchão inventado no
> primeiro dia viraria fato: o mínimo sairia inflado e ninguém lembraria que os
> 30% foram palpite meu, não decisão de ninguém.

> **Sem consumo, o mínimo é `null` — não zero.** Zero diria *"não precisa
> manter nada"*, que é uma afirmação que ninguém fez.

### Os quatro status, e a ordem é a regra

| Status | Critério |
|---|---|
| **SEM ESTOQUE** | saldo zerado — o único caso em que cobertura zero é verdade |
| **CRÍTICO** | cobertura abaixo de **metade** de `estMinDias` |
| **PARADO** | tem estoque e **nenhum** corte há `paradoDias`+ dias |
| **ATENÇÃO** | cobertura abaixo do alvo, acima da metade |
| **NORMAL** | o resto |

A **precedência** importa: um material parado com cobertura infinita não é
"normal", e um sem estoque nenhum não é "parado" — ele é a urgência. Uma lista
sem ordem deixaria a linha cair no primeiro `if` que casasse.

### ⚠️ A cobertura do conjunto só olha o que GIRA

Duas armadilhas, e a segunda quase passou:

1. **A média aritmética das coberturas** seria puxada por um material de giro
   minúsculo com 900 dias de folga.
2. **O conjunto inteiro tem o mesmo defeito por outra porta:** o material
   parado põe metros no numerador e zero no denominador. Numa fábrica com
   metade do estoque encalhado a cobertura **dobra** — e o número diz "folgado"
   justamente *porque* há dinheiro dormindo.

Na validação real isso deu **237 dias contra 138**. O parado tem card próprio,
onde ele é problema em vez de virar conforto.

### As faixas de parado

30 / 60 / 90 / 180 / +180 dias, sempre as cinco, mesmo vazias.

> **Material que NUNCA foi cortado cai na última faixa**, e não numa sexta
> chamada "nunca" no fim da lista. Do ponto de vista do dinheiro parado ele é o
> caso mais grave; separá-lo o tiraria de onde o olho procura. A coluna "último
> corte" mostra `nunca`, que é onde a diferença aparece sem custar uma faixa.

### ⚠️ Inconsistência não se corrige em silêncio

O painel roda cinco checagens **read-only** e as mostra **antes dos gráficos** —
se o dado está furado, ler o gráfico é pior que não ler nada, porque ele
confirma com autoridade um número que não descreve a prateleira.

- saldo negativo;
- rolo sem largura de bobina;
- saldo ≠ soma dos movimentos;
- **plano confirmado que usou rolo e não gerou consumo** (o estoque não baixou);
- largura em uso que sumiu do cadastro.

Nenhuma delas escreve nada.

### Gráficos sem biblioteca

SVG inline. O projeto não tem build nem dependência de front; uma lib por CDN
traria uma segunda coisa para atualizar e esquecer, e um estilo que não é o do
sistema. Duas formas cobrem tudo: **barra horizontal** (rótulos são nomes, e em
barra vertical eles saem deitados) e **linha**, sempre com **o eixo ancorado no
zero** — começar no menor valor faz variação de 2% parecer despencar.

**Estoque e consumo aparecem lado a lado no mesmo gráfico**, porque o que
interessa é a proporção: coleção com muito estoque e pouco consumo é dinheiro
dormindo; o contrário é risco de faltar.

### Filtros e performance

Coleção, cor, bobina e janela. **As opções saem do que existe de verdade** no
estoque ou no consumo — cor cadastrada e nunca comprada num seletor faz a
pessoa filtrar, receber tela vazia e concluir que o sistema perdeu dado.

O filtro corta as linhas **e recalcula o topo**: cabeçalho no total com tabela
filtrada faria a tela contar uma coisa em cima e outra embaixo.

Cache de 15 s **local da rota** (mesma razão do `painel_route` do PCP, §18:
cache escondido no domínio entregaria dado velho para quem decide compra). O
índice `idx_movimento_periodo (motivo, data)` foi criado porque o que existia
era por `rolo_id` — ótimo para o histórico de um rolo, inútil para "todo
consumo dos últimos 90 dias".

**Teste obrigatório:** `node teste/rodar.js` — os 14 casos de
`teste/gerencial.test.js`.

---

## O que sai da prateleira (o antigo painel de giro)

Responde **qual tecido tem mais saída**, **qual largura de bobina mais se usa**,
**a média diária por bobina e por cor** e **quantos dias o estoque aguenta**.

### ⚠️ A JANELA NUNCA É MAIOR QUE A HISTÓRIA QUE EXISTE

É o defeito que este painel poderia ter e que **não daria erro nenhum**:

```
média de 12 dias de história ÷ 30 dias de janela
= um número 2,5× MENOR que a verdade, com cara de fato
```

Ninguém descobre olhando a tela. O comprador lê *"gastamos 4 m²/dia"*, compra
para isso, e a fábrica gasta 10.

Por isso `giro.janela()` corta a janela pedida no **primeiro consumo
registrado**, devolve `{pedidos, dias, desde, completa}` e a tela **escreve em
âmbar** quando os dois diferem. Média sem a janela ao lado é um número que
engana.

> **A média divide por dias CORRIDOS**, fim de semana incluído — a pergunta é
> quanto essa fábrica gasta por dia. Dividir só pelos dias com corte responderia
> *"quanto ela gasta num dia de corte"*, que é outro número e sempre maior. A
> coluna **Dias com corte** diz de quantos dias úteis aquela média saiu.

### ⚠️ SAÍDA É `motivo='consumo'`, E SÓ

`ajuste` e `encerramento` também mexem no saldo, e **nenhum dos dois é corte**:
o ajuste é correção de contagem, o encerramento é o acerto do que sobrou no
tubo. Somados, o painel deixaria de responder *"quanto a fábrica cortou"* e
passaria a responder *"quanto a coluna variou"*, que ninguém perguntou.

É a lição do `fluxo_estoque.js` do PCP (§18), aqui de novo.

### O m² manda, e não o metro linear

10 m de bobina 3,00 é **mais tecido** que 10 m de 2,00. Ordenar por metro linear
responderia errado a pergunta *"qual bobina mais uso"* — o que se compra é área.
As duas colunas aparecem; a ordenação é por m².

### Cobertura mede risco; a quantidade não

**Quantos dias o que está na prateleira aguenta neste ritmo.** 200 m² de um
tecido que gira 40/dia é menos folga que 50 m² de um que gira 1 — e era o
segundo que apareceria em cima numa lista ordenada por quantidade.

> **Sem consumo na janela a cobertura é `null`** — "não dá pra dizer", que não é
> zero. Mesma regra da tela azul do operador (`CLAUDE.md` §3).

### ⚠️ "Não saiu nada" é por TECIDO, senão o título mente

A lista de giro parte do consumo, então o que não girou **some da tela** — o
pior lugar onde um tecido parado pode estar. Daí a segunda lista.

Ela conta **por tecido, não por rolo**: por rolo, um tecido com um tubo girando
e outro esquecido apareceria nas **duas** listas, e o título *"não saiu nada"*
estaria mentindo sobre ele. Rolo parado já tem resposta própria e melhor — a
coluna **Parado** da tela de Rolos, que conta desde o último consumo daquele
tubo. Duas telas respondendo a mesma pergunta com granularidades diferentes é o
começo de duas réguas.

### A série mês a mês NÃO é cortada pela janela

A janela é da **média**; a série é a **história**. Cortar as duas pelo mesmo
número tiraria justamente a tendência, que é o que a série existe para mostrar.

> `dominio/giro.js` é o **dono único de "quanto consumiu"**. E a poda do preço
> vale aqui também: a lista "não saiu" carrega o valor parado, e valor é preço —
> quem não tem `custo.ver` recebe o JSON sem ele, podado **na rota**.

**Teste obrigatório:** `node teste/rodar.js` — os 12 casos de
`teste/giro.test.js` travam a janela efetiva, a exclusão do ajuste, o m² acima
do metro linear, a cobertura `null` e o "não saiu nada" por tecido.

---

## O inventário inicial: como lançar o que já está na prateleira

A entrada de rolo (tela **Rolos**) é onde o estoque físico entra — inclusive as
bobinas que já estão abertas e as que chegaram sem nota.

| Situação | O que fazer |
|---|---|
| Rolo novo, fechado | metragem = o que diz a nota |
| **Bobina já aberta** | metragem = **o que sobrou, medido** |
| Sem NF, sem fornecedor | deixe em branco — os dois são opcionais |

> ⚠️ **O CAMPO PERGUNTA O QUE ESTÁ NO ROLO AGORA, não o que a nota dizia.**
> Ele se chamava "Metragem da nota", e para o inventário inicial isso era uma
> armadilha: quem lê "da nota" digita os 50 m que a nota dizia num rolo que tem
> 18 m no tubo.
>
> O número vira o **saldo**. Trinta e dois metros que não existem entrariam no
> estoque, e o plano de corte prometeria uma faixa que o rolo não tem — o erro
> apareceria com o tecido na mesa e a peça já começada.

**Faltar nota não pode impedir a bobina de entrar no sistema.** No inventário
inicial quase nunca existe nota; uma trava ali seria a armadilha #6 do
`CLAUDE.md` — a bancada inventaria um número de NF só para o sistema aceitar.

**Um rolo físico = uma entrada.** Duas bobinas do mesmo tecido e da mesma
largura são dois rolos, com dois códigos e dois endereços: é assim que o
cortador acha qual descer da estante.

---

## O que é um "item de tecido"

É **o que está enrolado no rolo**: a combinação `linha + abertura + cor`.

| Campo | O que é | Exemplo |
|---|---|---|
| **Linha** | o tipo de persiana | Rolô, Romana, Double Vision |
| **Coleção** | qual tecido, dentro daquela linha | Nápoles, Pinpoint, 1%, 3%, Blackout |
| **Cor** | **só** a cor | Bege, Cinza, Creme |

`Double Vision · Nápoles · Bege` é **um** item.

> ⚠️ **O CAMPO SE CHAMA "COLEÇÃO" NA TELA E `abertura` NO BANCO.** Ele nasceu
> como abertura (1%, 3%, 5% — quanto de luz passa) e a fábrica usa o mesmo
> campo para coleções de nome próprio: Nápoles, Pinpoint. Um campo rotulado
> "Abertura" com `Nápoles` dentro é o tipo de quase-mentira que faz a equipe
> parar de confiar na tela, então o **rótulo** mudou em 03/09/2026.
>
> A tabela, a coluna, a rota e as variáveis continuam `abertura`: renomear
> identificador não muda nada para quem usa e quebraria banco, rotas e
> histórico de uma vez. É a mesma decisão que o PCP tomou com a área
> `necessidade` (id preservado, rótulo trocado — ver `auth.js`).

> ⚠️ **A COLEÇÃO NÃO PODE ENTRAR NO NOME DA COR.** `Nápoles Bege` cadastrado
> como cor parece prático e cobra depois:
>
> - o sistema deixa de saber que aquilo **é bege** — `Nápoles Bege` e
>   `Pinpoint Bege` viram cores sem relação nenhuma
> - a lista de cores cresce **multiplicando**: coleção nova traz o mesmo
>   punhado de cores de novo
> - e o filtro por cor, que existe para achar a sobra na prateleira, para de
>   agrupar o que a vista agrupa

> ⚠️ **A LARGURA NÃO FAZ PARTE DO ITEM**, e essa é a decisão que mais confunde
> quem chega. O mesmo `Double Vision 1% Bege` vem em bobina de 2,00, 2,50 e
> 3,00 — é o mesmo tecido, muda o rolo.
>
> Se a largura entrasse aqui, o mesmo tecido viraria **três itens diferentes** —
> e o plano perderia justamente o que faz de mais útil: **comparar**. Uma peça
> de 1,45 desperdiça 40 cm na bobina de 2,00, e duas delas cabem lado a lado na
> de 3,00. Com três itens separados, essa conta não existe.

Os dois campos que não são óbvios:

**Bobina mais comum** — não muda cálculo nenhum. Só deixa o botão já marcado na
entrada de rolo. Pode ficar em branco (vazio grava `null`, nunca zero). Desde o
cadastro de larguras ela é uma **escolha da lista**, não um campo de texto:
digitar aqui deixaria `2,5` e `2,50` entrarem como coisas diferentes, na tela
que existe justamente para padronizar.

**Pode girar a peça?** — este muda. Tecido com sentido (textura, listra, desenho
que corre) não pode ser virado, então a largura da peça tem que sair no sentido
da largura da bobina. `Não` é o padrão e vale para a maioria.

### ⚠️ CADASTRAR A COR NÃO BASTA — e as três telas agora dizem isso

As fileiras LINHA / COLEÇÃO / COR da **entrada de rolo**, do **corte** e das
**sobras** (lançar e corrigir) **não leem a tabela `cor`**: elas saem dos
**itens de tecido ativos**, porque o que se escolhe ali é um item que existe,
e não uma combinação nova.

A consequência é que uma cor recém-cadastrada simplesmente **não aparece**. A
fileira fica mais curta, e mais nada — sem erro, sem aviso, sem lugar nenhum
onde a cor apareça esperando alguma coisa.

Isso é um beco, e do tipo caro: quem está com o rolo na mão procura a cor, não
acha, e não tem como saber que falta o item de tecido. A saída que sobra é
**bipar a cor parecida só para o sistema aceitar** — e a partir dali é o
estoque do tecido errado que anda. É a armadilha #6 do `CLAUDE.md` na letra:
trava que dispara no caso normal vira desvio, e o desvio acontece fora da
vista do sistema.

Por isso a tela escreve, embaixo da fileira COR:

> Procurando uma cor que não está nos botões? `Branco, Cinza` estão
> cadastradas, mas não existem em `Rolô · 3%`. A cor só vira botão aqui depois
> que existe o ITEM DE TECIDO (linha · coleção · cor) — cadastre em
> Cadastros → Tecido → Item de tecido.

Três decisões dentro dessa linha:

- **Não é alarme.** Não é vermelho e não pede providência de quem está ali: a
  pessoa que dá entrada no rolo pode nem ter `cadastro.editar`. A linha
  responde a pergunta que ela acabou de fazer e diz em que tela se resolve.
- **Ela nomeia as cores, e não corta a lista.** Truncar esconderia justamente
  a cor que a pessoa procura, que é o único motivo de a linha existir.
- **A lista de cores não é cacheada** na entrada de rolo, ao contrário das
  larguras e dos fornecedores. O que o aviso manda fazer acontece em *outra*
  tela; quem sai daqui, cadastra o item e volta tem que ver a cor no lugar.
  Com cache veria o mesmo aviso e concluiria que o cadastro não pegou. (No
  corte e nas sobras ela vem junto dos tecidos e envelhece com eles — as duas
  listas têm que andar no mesmo passo, senão o aviso cobraria uma cor que a
  fileira já mostra.)

Ela some sozinha quando toda cor ativa já tem item naquela coleção — contador
que nunca zera é contador que a equipe aprende a pular.

> ⚠️ **`avisoCorSemItem`, no `public/ui.js`, é o DONO ÚNICO deste aviso.** Três
> telas escrevendo a mesma frase cada uma do seu jeito ensinariam a equipe a
> achar que são três situações diferentes — e a que esquecesse de citar a
> coleção mandaria cadastrar o que já existe. Nas sobras ele mora dentro do
> `fileirasTecido`, que já é o ponto comum do lançar e do corrigir.

### ⚠️ O SELETOR DE LINHA DO FORMULÁRIO NÃO É O DO CARTÃO COLEÇÃO

Até 15/09/2026 os dois eram a mesma variável (`estado.linhaSel`), e isso
quebrava duas coisas de uma vez ao trocar a linha no formulário de item de
tecido:

| O que acontecia | Por quê |
|---|---|
| o formulário **saía do lugar** | o cartão Coleção, que fica **acima**, passava a listar as coleções da outra linha, mudava de altura e empurrava tudo embaixo dele — o campo seguinte saía de debaixo do dedo |
| o select **voltava sozinho** para a primeira linha | a aba inteira era redesenhada e o select nascia sem valor, enquanto as coleções ao lado já eram as da linha escolhida |

O segundo é o caro: o formulário passava a descrever `Double Vision` + uma
coleção do `Rolô`, e salvar batia em `abertura_de_outra_linha` — uma recusa
que não tinha como fazer sentido para quem leu a tela.

São perguntas diferentes e agora são variáveis diferentes: `linhaSel` é *"de
qual linha estou editando as coleções"*, `linhaForm` é *"em qual linha entra o
tecido novo"*. Trocar a linha no formulário **não redesenha mais a tela** —
repovoa só o seletor de Coleção ao lado, que é a única coisa que muda.

> **`formulario()` passou a aceitar um valor inicial**, e é isso que mantém a
> linha escolhida no campo. Sem ele o select nasce sempre no primeiro item,
> mesmo quando a tela já sabe qual é a escolha — e o campo mostra uma coisa
> enquanto o resto do formulário descreve outra.

> **Linha sem coleção nenhuma escreve "— esta linha ainda não tem coleção —"**
> no lugar de um select vazio, que não diz nada e em alguns navegadores nem
> abre.

**Os três seletores oferecem as INATIVAS também** — linha, coleção e cor
(15/09/2026). Desativar um cadastro é dizer *"não vendemos mais isto"*, não
*"isto não existe"*: os rolos continuam na estante, as sobras continuam na
prateleira e o histórico continua apontando para ele. Sem as inativas nos
seletores, cadastrar um item que faltou numa combinação dessas exigia
**reativar, cadastrar e desativar de novo** — e no meio desses três passos o
cadastro volta a aparecer na entrada de rolo e no corte para a fábrica
inteira. O servidor nunca exigiu cadastro ativo (`criarTecido` só exige que
linha, coleção e cor existam, e que a coleção seja da linha), então isto é a
tela alcançando o que o domínio já permitia.

> ⚠️ **Elas vão no fim da lista e escritas `(inativa)`, e essa marca não é
> enfeite.** Cadastrar ali cria um tecido que **nasce fora das telas da
> fábrica** (ver abaixo): ele não aparece na entrada de rolo, no corte nem nas
> sobras até a linha, a coleção e a cor estarem ativas. Quem escolhe tem que
> ver que escolheu isso.

> **As três passam pela mesma função** (`comInativasNoFim`). Três cópias
> divergiriam no dia em que uma delas mudasse a marca ou a ordem, e aí a mesma
> tela diria que `(inativa)` quer dizer coisas diferentes em campos vizinhos.

> Cada campo **nasce na primeira opção ativa**, não na primeira da lista: o
> caso normal é cadastrar no que está em uso, e abrir já apontando para um
> cadastro desativado seria oferecer o incomum por acidente.

> **"Esta linha ainda não tem coleção" só aparece quando não há coleção
> nenhuma — nem inativa.** Linha cujas coleções foram todas desativadas lista
> as inativas; a frase ali mandaria cadastrar o que já existe e está logo na
> lista.

### O preço do m² se lança no cadastro do tecido

Até 15/09/2026 a única porta era **Sobras → Catálogo**, e ela lista só tecido
que **já tem sobra** (`resumo.filter(r => r.sobras > 0)`). O tecido
recém-cadastrado, que nunca produziu retalho, **não tinha onde receber preço
nenhum** — e sem preço ele nunca entra na conta do acervo, nem no dia em que a
primeira sobra aparecer. Mesmo beco da cor: a tela sabia mostrar o traço na
coluna `R$/m²` e não sabia deixar ninguém preencher.

Agora cada linha do Item de tecido tem botão **Preço** (`Preço ⚠` quando
falta), com a mesma sugestão de *último preço pago por rolo* e o mesmo
histórico de quem mudou, quando, de → para.

> ⚠️ **As duas portas chamam a MESMA rota** (`PUT /api/tecidos/:id/preco`).
> Não há segundo caminho de escrita no preço — seria a armadilha #12 outra vez,
> duas telas certas cada uma na sua régua.

> Quem não tem `custo.ver` não vê a coluna nem o botão, e **o JSON já vem sem o
> campo** — a poda é do servidor (regra 14 do §13 do `CLAUDE.md`). O botão
> também exige `cadastro.editar`: preço é cadastro.

Embaixo da tabela, quantos tecidos ativos estão sem preço — é a conta que
explica por que o valor do acervo sai como **piso** (`≥`).

### ⚠️ DESATIVAR A LINHA, A COLEÇÃO OU A COR TIRA O TECIDO DA FÁBRICA

Até 15/09/2026 não tirava, e esse era o defeito. As fileiras LINHA / COLEÇÃO /
COR da entrada de rolo, do corte e das sobras olhavam só `tecido.ativo`: você
desativava uma cor e ela **continuava na bancada** como se nada tivesse
acontecido. Desativar um cadastro que não desativa nada é pior que não ter o
botão — ele promete uma coisa e faz outra, em silêncio.

Agora `GET /api/tecidos` devolve **`disponivel`**, e é por ele que as três
telas filtram:

```
disponivel = tecido ativo E linha ativa E coleção ativa E cor ativa
```

> ⚠️ **É DERIVADO, NÃO GRAVADO, e essa é a decisão.** Propagar em cascata na
> escrita — desativar a cor desativa os tecidos dela — perderia a informação
> de quem já estava desativado **antes**, e reativar a cor não teria como
> saber quais tecidos devolver. Derivando, **reativar desfaz exatamente o que
> desativar fez**.

> `CASE` em vez de `AND` puro: `AND` com NULL devolve NULL, e uma coluna
> `ativo` nula deixaria o tecido num terceiro estado que nenhuma tela sabe ler.

**O cálculo é do servidor** (`dados/tecido.js`), e não de cada tela. Três
telas repetindo o `e && e && e` divergiriam na primeira que esquecesse um dos
três, e o cadastro desligado voltaria só nela.

**Nada some de onde é histórico.** O rolo do tecido escondido continua na
lista "Em estoque", a sobra continua no catálogo, os painéis continuam
contando. O que muda são os **seletores de escolha** — o que a bancada pode
começar hoje.

### A tela de cadastro diz POR QUE o tecido sumiu

Sem isso a mudança seria invisível pelo lado errado: quem desativou uma cor
semanas atrás abre a tabela de Item de tecido, vê o tecido com o botão escrito
**Desativar** — ou seja, ativo — e não entende por que a bancada não o
encontra. O botão fala do tecido; a fábrica olha a cadeia inteira.

```
ROLO-BLACKOUT-BEGE   Rolo · Blackout · Bege
                     · fora das telas da fabrica: colecao e cor inativas
                     · ainda ha rolo ou sobra deste tecido na fabrica —
                       a bancada nao consegue cortar nem lancar sobra dele
```

> ⚠️ **A SEGUNDA LINHA É A QUE IMPORTA, e ela é o motivo de `na_fabrica`
> existir.** Esconder um tecido que ainda tem rolo na estante ou sobra na
> prateleira não para só de vender: para de **cortar o que já está comprado**,
> e a sobra que sair desse corte não tem onde ser lançada. A bancada não
> espera — ela lança no tecido parecido, e a partir dali é o estoque errado
> que anda. É a armadilha #6 do `CLAUDE.md`, e ela nasceria calada.
>
> **Não é trava**: quem desativa continua desativando. É o aviso que faz a
> tela dizer o que a decisão custa, como o `exclusao.js` diz *"3 rolos estão
> nesta haste"* em vez de só recusar. O botão que desfaz é **Reativar**, na
> lista de cima.

> `EXISTS` e não `COUNT`: a pergunta é *"tem ou não tem"*, e o `COUNT`
> varreria as linhas para devolver um número que ninguém lê. Conta rolo não
> encerrado com saldo e sobra disponível — encerrado e usada não são material
> na fábrica.

---

## Cadastro se RENOMEIA e se APAGA — com uma regra no meio

Linha, coleção, cor, motivo, haste, andar e nível têm **Renomear**, **Apagar**
e **Desativar**. O item de tecido tem Apagar e Desativar (não Renomear: o nome
dele *é* a combinação linha+coleção+cor, e trocar a combinação é outro tecido).

### Quando apagar apaga

A regra da casa sempre foi *"cadastro não se apaga, desativa"*, e existe por um
motivo real: linha de histórico aponta para o cadastro, e apagar a cor faria o
plano de três meses atrás deixar de saber o que foi cortado.

Só que a regra sozinha produz o problema oposto: o cadastro digitado errado no
primeiro dia fica na lista **para sempre**, riscado, e a tela vira depósito de
coisa morta que ninguém lê mais.

| Situação | O que acontece |
|---|---|
| **ninguém aponta** | apaga de verdade — não há histórico a preservar, o que existe é erro de digitação |
| **alguém aponta** | recusa **dizendo quem**: *"1 rolo está neste endereço"* |

> ⚠️ *"Não dá para apagar"* sozinho vira chamado de suporte. *"1 item de tecido
> usa esta cor"* vira decisão — a pessoa sabe o que desfazer primeiro.
>
> E **todos** os motivos aparecem de uma vez. Dizer só o primeiro faria a
> pessoa resolver um, tentar de novo, bater no segundo, e concluir que o
> sistema inventa impedimento novo a cada tentativa.

**Não desativa como consolo.** Quem clicou pediu para apagar; *"apaguei mas na
verdade só escondi"* é a resposta que faz a pessoa apagar de novo no mês
seguinte procurando o que sumiu. Desativar é ação separada, com nome próprio.

**A árvore do endereço se protege de cima para baixo**: haste com andar não sai,
andar com nível não sai. Quem quer desmontar começa de baixo, e a cada passo o
sistema diz o que ainda está pendurado ali. Apagar de cima arrastaria a árvore
inteira em silêncio.

> ⚠️ **`dominio/exclusao.js` é o DONO ÚNICO de quem aponta para quem.**
> Espalhar a conta pelos domínios faria cada um conhecer meio mapa, e o dia em
> que uma tabela nova apontasse para `cor` ninguém lembraria de atualizar as
> duas pontas — a exclusão passaria a apagar o que tem histórico, em silêncio.
>
> A largura de bobina conta **por valor**, não por id: o rolo guarda o número,
> não uma chave estrangeira. Contar por id daria zero e apagaria uma largura
> com rolo usando ela.

---

## Cadastro se RENOMEIA, além de desativar

Linha, coleção, cor e motivo têm **Renomear** ao lado de Desativar.

> ⚠️ **Até 03/09/2026 a tela só sabia desativar**, e o servidor sempre soube
> renomear — faltava o botão. A única saída para um `Pinpoit` sem o segundo N
> era **desativar e criar de novo**: duas linhas na lista, uma delas morta,
> para corrigir uma letra. Cadastro que só sabe desativar obriga a errar duas
> vezes para consertar uma.
>
> E nome de tecido muda de verdade: o fornecedor renomeia a coleção, a equipe
> passa a chamar pelo nome novo, e a tela continua mostrando o velho.

**O rename passa pelo domínio, não direto ao banco.** O nome é `UNIQUE`:
renomear `Pinpoit Bege` para `Bege` com `Bege` já cadastrado estouraria a
restrição do SQLite e o operador leria *"deu erro aqui dentro, chame o
suporte"* — quando o que ele precisa ler é *"essa cor já existe"*. Mesma lição
da etiqueta de sobra duplicada: conferir **antes** de escrever é o que separa
uma recusa útil de um chamado.

**Renomear para o mesmo nome não é erro** — senão clicar e confirmar sem mudar
nada daria erro, e o operador concluiria que quebrou alguma coisa.

> ⚠️ **O CÓDIGO DO TECIDO NÃO É REFEITO NO RENAME.**
> `DOUBLEVISION-NAPOLES-BEGE` já pode estar escrito em plano confirmado e em
> histórico de rolo; mudar o código apagaria o rastro. O código é etiqueta de
> **leitura** — quem identifica o tecido de verdade é o trio de ids, e a tela
> sempre mostra os nomes atuais.

---

## As larguras de bobina são cadastráveis (Cadastros → Tecido)

A largura da bobina é **do rolo**, não do tecido — o mesmo Rolô 3% Bege existe
em 2,00, 2,50 e 3,00, e é essa diferença que o plano de corte explora. O que
mudou é que ela deixou de ser **digitada** e passou a ser **escolhida**.

Na entrada de rolo as larguras cadastradas viram uma fileira de botões. Digitar
errava de dois jeitos que ninguém percebia, e nenhum deles dava erro na tela:

| O que se digita | O que acontece | Quando aparece |
|---|---|---|
| `2,5` e `2,50` | viram bobinas **diferentes** na consulta do plano | quando o plano não acha rolo que existe |
| `20,0` | entra como bobina de **vinte metros** | quando o encaixe "acha" que cabe qualquer peça |

> ⚠️ **O campo livre continua existindo, e isso é decisão.** Rolo que chega
> fora do padrão existe, e recusar a entrada dele seria a armadilha #6 do
> `CLAUDE.md`: a bancada lançaria a largura errada só para o sistema aceitar,
> e o erro entraria no lugar onde ninguém procura. O campo **avisa** que a
> largura não está na lista; nunca bloqueia.

### ⚠️ E DESDE 03/09 ELE CADASTRA — o campo livre era um beco

A pergunta que abriu isto foi *"por que tem esse campo se as larguras estão
cadastradas acima?"*. A resposta era a de cima — e estava pela metade.

A largura digitada entrava **no rolo** e **não entrava na lista**. Duas
consequências, e as duas silenciosas:

- o próximo tubo da **mesma** bobina caía no campo livre outra vez, para
  sempre — o sistema nunca aprendia;
- um `20,0` digitado no lugar de `2,00` ficava **escondido dentro de um
  registro de rolo**, que é onde ninguém procura.

Hoje `rolo.entrada` chama `largura.garantir()` **dentro da mesma transação**:
bobina fora da lista entra junto com o rolo, marcada com quem lançou. Na
próxima entrada ela já é botão, e o erro de digitação aparece numa lista —
onde dá para apagar.

> **Não lança erro nunca.** Quem valida o número é o `rolo.entrada`, antes,
> com o mesmo teto de 10 m. Um erro no cadastro derrubando a entrada do rolo
> seria exatamente o que essa mudança existe para não fazer.

---

## A BANCADA NÃO ESPERA A CHEFIA — ela cria, e a chefia confere depois

A regra velha era "cadastro é da chefia". Ela não fazia a bancada esperar:
fazia a bancada **mentir**.

| Trava | O que a bancada fazia de verdade | Onde o erro ia parar |
|---|---|---|
| largura não cadastrada | tocava no botão de 2,00 para o sistema aceitar | o encaixe passa a cortar por uma largura que aquele tubo não tem |
| endereço não cadastrado | deixava o rolo **sem endereço**, "para endereçar depois" | o tubo fica na estante sem ninguém saber onde |

Nos dois casos o erro acontece **fora da vista do sistema** — armadilha #6 do
`CLAUDE.md` na letra: a trava que dispara no caso normal vira desvio que a
equipe aprende a fazer.

**A troca é de ORDEM, não de rigor:**

```
ANTES   pedir  →  esperar a chefia  →  lançar
AGORA   lançar →  marcar            →  a chefia confere quando puder
```

Nada deixou de ser revisado. O que a chefia perdeu foi **a vez**, não o
controle: ela renomeia, apaga ou aprova depois — com o rolo já no lugar.

### O que a bancada passou a poder

| Ação | Quem | Chave |
|---|---|---|
| Cadastrar largura de bobina (pelo campo livre da entrada) | bancada e chefia | — (sai junto com o rolo) |
| **Criar** haste, andar e nível | bancada e chefia | `endereco.criar` |
| **Renomear** e **apagar** cadastro | só chefia | `cadastro.editar` |

> ⚠️ **A ASSIMETRIA É A REGRA, e não indecisão.** O buraco novo na prateleira
> aparece com o tubo já na mão: endereço que não dá para criar na hora vira
> rolo sem endereço. Arrumar um nome torto, não — isso espera sem custo nenhum.

Na tela de Rolos → Entrada, cada fileira de endereço ganhou um **`+ haste`**,
**`+ andar`**, **`+ nível`** tracejado no fim. O que nasce ali **já fica
escolhido** — criar e ter de procurar o próprio botão na fileira é o tipo de
passo a mais que faz a bancada parar de usar.

### A lista "Conferir" é a outra metade da decisão

Sem ela o que mudou não seria "a chefia confere depois" e sim **"ninguém
confere"** — e a marcação no banco viraria uma promessa que a tela não cumpre.

`GET /api/cadastro/conferir` devolve tudo que está com `conferir=1`, mais
antigo primeiro (é o que já está valendo há mais tempo, logo o que mais gente
já leu errado na estante). O cartão abre no **topo de todas as abas** de
Cadastros, com o quê, quem, quando e **onde arrumar** — lista que acusa sem
dizer o caminho manda a pessoa procurar, e ela desiste.

> **"Conferi" só tira da lista — não arruma nada.** Corrigir tem botão próprio
> (Renomear, Apagar) na aba certa. Um conferir que também arrumasse esconderia
> qual das duas coisas a pessoa fez.

> O cartão **some inteiro quando está vazio**. Um cartão permanente escrito
> "nada a conferir" é ruído que ensina o olho a pular exatamente a região onde
> o aviso de verdade vai aparecer.

**`dominio/conferir.js` é o dono único de "o que falta conferir".** Cada tela
com a sua consulta significaria o dia em que uma tabela nova nascesse marcável
e não aparecesse em lista nenhuma — e cadastro marcado que ninguém vê é pior
que cadastro não marcado: ele promete uma revisão que não acontece.

**Teste obrigatório depois de mexer nisto:** `node teste/rodar.js` — os 10
casos de `teste/bancada.test.js` travam as duas pontas (a bancada cria e fica
marcada; a chefia cria e nasce conferida) e a assimetria criar × arrumar.

**Largura com rolo em uso não sai da lista.** A lista descreve a prateleira:
tirá-la faria a próxima entrada daquela bobina cair no campo livre com aviso de
"não cadastrada" — para uma bobina que a fábrica tem na mão. O aviso perderia o
sentido na primeira vez, e depois disso ninguém mais o lê. A tela mostra
quantos rolos cada largura tem, que é o número que separa *largura que a
fábrica usa* de *largura que alguém cadastrou e nunca comprou*.

**A lista nasce do que já existe.** A migração 6 semeia com as larguras dos
rolos já cadastrados; num banco novo ela começa vazia — que é honesto: semear
2,00/2,50/3,00 seria um chute sobre a fábrica, e a primeira entrada de rolo
ensina qual cadastrar.

`tecido.largura_sugerida` continua existindo, e agora tem função melhor: ela
**pré-seleciona o botão** em vez de pré-preencher um campo de texto.

---

## Os parâmetros do corte (Cadastros → Parâmetros)

| Chave | Padrão | O que faz |
|---|---|---|
| `larguraMinimaSobra` | 0,80 m | Resto com largura abaixo disso é refugo em vez de sobra. Vale **só para a largura** |
| `pesoSobra` | 0,50 | Quanto da sobra gerada conta como material recuperado. **A única variável de julgamento do módulo** |
| `margem` | 0,00 m | Folga entre peças (aplica entre peças, não nas bordas) — **conferido na bancada**, ver abaixo |
| `alturaMinimaSobra` | **1,00 m** | Resto com altura abaixo disso é refugo mesmo com largura boa — persiana mais baixa que isso praticamente não sai da fábrica |

`pesoSobra` responde a uma pergunta de fábrica: *o retalho que vai pra
prateleira volta a ser usado, ou encalha?* Metade é o palpite honesto de quem
ainda não tem histórico. Depois de alguns meses o relatório de encalhe responde
melhor que qualquer chute — e mudar é um campo, não uma linha de código.

---

## A etiqueta da sobra sai em PDF, 100 x 35 mm

A folha que vai para a Zebra e gerada **no servidor**, uma etiqueta por pagina,
no tamanho exato da bobina (`GET /api/etiquetas/lotes/:id/pdf`).

> ⚠️ **Nao volte a imprimir pelo `window.print()`.** A folha do navegador so
> saia certa quando quem imprime escolhia "margens: Nenhuma" e escala 100% —
> **toda vez**. Errou uma, o Chrome ajusta a pagina, as barras esticam e o
> leitor recusa. E ainda carimbava a URL e o "8/32" que, numa etiqueta de
> 35 mm, caem em cima do codigo.
>
> E a mesma licao da armadilha #6 do CLAUDE.md: o que so funciona quando o
> operador acerta a configuracao e o que vai falhar. A pagina agora ja nasce
> 100 x 35 e nao ha o que ajustar.

A grade que aparece na tela e **conferencia**, nao folha de impressao — e se
alguem der Ctrl+P nela por engano, sai escrito isso na folha.

`../public/barras.js` (na RAIZ do PCP desde 17/09/2026 — o gerador da
etiqueta do kit passou a usar o mesmo, e duas tabelas CODE128 seriam duas
etiquetas diferentes para o mesmo código) serve as duas pontas: a tela desenha
SVG (por `/barras.js`), o servidor desenha
as mesmas barras dentro do PDF. Duas tabelas CODE128 seriam duas etiquetas
diferentes para o mesmo codigo, e a divergencia so apareceria na bancada.

### As medidas sao CADASTRAVEIS (Cadastros -> Parametros)

Nenhuma medida mora no codigo. A etiqueta e um objeto fisico que a equipe
ajusta olhando o resultado na bancada — *"a letra ta pequena"*, *"a barra some
quando a etiqueta amassa"* — e cada um desses ajustes era um deploy.

| Parametro | Padrao | O que e |
|---|---|---|
| `etqFonteCodigo` | **22 pt** | o codigo escrito embaixo das barras |
| `etqBarraAltura` | 14 mm | altura das barras |
| `etqLargura` | 100 mm | largura da bobina |
| `etqAltura` | 35 mm | altura da bobina |
| `etqMargem` | 4 mm | folga em volta |

> ⚠️ **O TEXTO EMBAIXO DA BARRA NAO E LEGENDA.** E onde o operador PROCURA a
> sobra: ele passa o olho na estante lendo numero, e usa o leitor so para
> confirmar. Por isso a fonte nasce em 22 pt — o dobro da primeira versao — e
> por isso ela e o primeiro parametro da lista.

**Altura e largura falham de jeitos diferentes, e nao e inconsistencia:**

| Nao cabe na | O que acontece | Por que |
|---|---|---|
| **altura** | **recusa** gerar o PDF, com a frase dizendo o que reduzir | passar da altura corta o desenho: parte do codigo nao existe no papel |
| **largura** | **encolhe** a letra o suficiente e imprime | e so tamanho de letra, e letra menor o operador ainda le. Recusar pararia a bancada por estetica |

A tela mostra as medidas ao lado do botao e **desabilita** o botao quando os
numeros nao fecham — senao o operador clicaria em imprimir e abriria uma aba
com o JSON do erro na cara.

> ⚠️ **O MODULO DA BARRA NAO E CADASTRAVEL, e isso e decisao.** Ele e
> calculado para o codigo caber na largura, com piso de 0,25 mm: a 203 dpi
> isso e 2 pontos de impressao, e abaixo disso a leitura falha em etiqueta
> amassada — que e o estado normal de uma etiqueta que passou um mes na
> prateleira. Um campo ali deixaria alguem gerar 300 etiquetas tecnicamente
> ilegiveis sem nenhum aviso, e o erro so apareceria no bipe.
>
> A diferenca de tratamento e a regra: **texto pequeno o operador ainda le;
> barra fina demais o leitor recusa, e ninguem descobre por que.**

Codigo comprido demais para caber sai **marcado** na propria etiqueta
(`SOBRA · CONFERIR LEITURA`), nunca impresso pequeno em silencio: o desfecho
ruim nao e o erro, e a etiqueta sair bonita, colada na peca, e nao bipar.

---

## A etiqueta da sobra

O sistema **imprime** o lote (Etiquetas → quantidade → folha em A4 para
recortar), guarda a sequência, e a sobra nasce quando o cortador **bipa** a
etiqueta colada. Três consequências:

- **"Colada e não cadastrada" é exata.** É o que foi impresso menos o que
  voltou da bancada — não um palpite sobre lacunas na numeração.
- **Etiqueta que o sistema não imprimiu é recusada**, com a frase que ensina o
  caminho. Aceitar código desconhecido encheria o acervo de retalho que não
  existe na prateleira.
- **A mesma etiqueta não cola em duas sobras.** A conferência acontece *antes*
  de qualquer gravação: se fosse depois, quem recusaria seria o `UNIQUE` do
  SQLite, e a bancada leria "deu erro aqui dentro" em vez de "cole outra".

O código de barras é **CODE128-B gerado no projeto** (`../public/barras.js`), sem
biblioteca. A tabela de padrões foi conferida contra uma implementação de
referência e o teste repete a conferência estrutural a cada rodada — 106
padrões de 11 módulos, barras somando par, nenhum repetido. **Uma etiqueta que
não bipa é uma etiqueta que não existe**, e o erro só apareceria na bancada,
com a folha já impressa e colada.

> Ao imprimir: margens **"Nenhuma"** e escala **100%**. "Ajustar à página"
> deforma as barras e o leitor recusa — a mesma regra da etiqueta de SKU no PCP.

## ⚠️ A MEDIDA DA SOBRA É LISTA, e não campo digitado

O campo aceitava `1,90`, `1.90` e `190` — e **só o terceiro é visivelmente
errado**. Os dois primeiros entram calados como números *diferentes* conforme o
teclado do tablet, e o defeito só aparece no plano de corte, com o tecido já na
mesa: uma sobra cadastrada como 1,9 cm vira retalho que o encaixe nunca
escolhe; ao contrário, vira faixa prometida que a peça não tem.

A lista mata a classe inteira do problema: **não há o que digitar errado.**

**De centímetro em centímetro** — é a menor unidade que a bancada mede.
Milímetro em retalho de tecido é precisão que a fita não tem, e dobraria a
lista sem dobrar a verdade.

**Nada vem pré-selecionado.** Medida já marcada é medida que alguém salva sem
olhar, e aí o erro volta pela porta que a lista veio fechar.

O `value` vai com **ponto** (o que o servidor lê) e o rótulo com **vírgula** (o
que o operador lê), no mesmo `<option>` — por isso não há conversão no meio do
caminho para dar errado.

### ⚠️ Os limites da lista NÃO são a regra do refugo

Quatro parâmetros em **Cadastros → Parâmetros**: `sobraLarguraMin` (0,50),
`sobraLarguraMax` (3,00), `sobraAlturaMin` (0,50), `sobraAlturaMax` (6,00).

Começar a lista em `larguraMinimaSobra` (0,80) pareceria coerente e seria a
**armadilha #6**: o `sobra.criar` **não exige** o mínimo — hoje uma sobra de
0,60 entra normalmente. O operador com essa peça na mão, sem 0,60 na lista,
escolheria 0,80 e **mentiria a medida**.

> **A lista tem que alcançar o que existe na prateleira, não o que a regra
> prefere.** Quem decide o que vira sobra e o que vira refugo continua sendo
> `larguraMinimaSobra` / `alturaMinimaSobra`, no plano de corte, onde sempre
> esteve.

### O código e a medida sobrevivem ao redesenho

Trocar a condição no meio do lançamento (o operador bipa, mede, e **só então**
vê a mancha) recria o formulário inteiro. O código sumia calado.

O pior não era perder o código: era a tela ficar com **a medida preenchida e o
código vazio** — o operador apertava Salvar confiante e levava *"Bipe a
etiqueta"* sem entender por quê.

### E o endereço de SOBRA ganhou `+ novo`

Mesma lição da tela de rolos (armadilha #14), aqui com um agravante: **endereço
é obrigatório na sobra**. Sem poder criar, o operador do mutirão com o retalho
na mão não consegue salvar — e a alternativa não é ele esperar a chefia, é
empilhar o retalho num canto "para cadastrar depois". O que nasce ali entra
marcado e cai na lista **Conferir**.

---

## QUEM VÊ O QUÊ — a divisão entre bancada e escritório

Revisão de 04/09/2026, tela por tela e rota por rota.

| Tela | Operador | Chefia | Tema |
|---|:---:|:---:|---|
| Início | ✅ | ✅ | claro |
| Plano de corte | ✅ | ✅ | claro |
| Sobras | ✅ | ✅ | claro |
| Rolos | ✅ | ✅ | claro |
| Etiquetas | ✅ | ✅ | claro |
| **Painel** | ❌ | ✅ | escuro |
| **Cadastros** | ❌ | ✅ | escuro |

O operador tem exatamente as cinco telas **claras**, de bancada. As duas
escuras são escritório — e o tema não é decoração: tela escura no tablet sob a
lâmpada de inspeção vira espelho.

### ⚠️ A poda por LISTA envelheceu em uma semana

A defesa era `CAMPOS_PRECO`, uma lista literal de nomes. O painel gerencial
nasceu depois com `resumo.valor_parado`, que não estava nela — e **o número
passou a viajar pelo fio até a bancada**. A tela não mostrava (ela testa
`resumo.valor`), então ninguém veria olhando: só abrindo a aba de rede.

É a mesma doença da tabela de preço por fornecedor e dos mínimos placeholder:
**lista mantida à mão não acompanha o código**, e o defeito é silencioso dos
dois lados.

Hoje a poda é **padrão de nome** (`custo.eDinheiro`), que pega o campo que
ainda não existe. E o `teste/acesso_operador.test.js` **varre o JSON inteiro**
em toda profundidade procurando dinheiro — porque padrão também falha, e a
defesa de verdade é alguém conferindo o resultado, não a intenção.

### O que é "dado comercial", e por que NF e fornecedor entram

Preço, valor, **NF e fornecedor**. De quem a fábrica compra e com que nota não
ajuda o operador a pegar o rolo na estante — e é exatamente o tipo de
informação que sai da fábrica junto com quem sai.

Três consequências na tela de entrada de rolo, para quem não tem `rolo.nota`:

- a fileira **FORNECEDOR** não existe;
- os campos **NF** e **R$/m²** não existem;
- no lugar, uma linha dizendo que isso entra depois, no escritório.

O rolo entra sem os três e cai na lista **"Sem nota"**, que já é o trabalho de
quem fecha compras. **Um campo que o operador preenche e nunca mais vê de volta
é pior que campo nenhum** — o JSON dele já voltava podado.

> ⚠️ **A lista de fornecedores vinha DE CARONA com `cadastro.ler`** — a chave
> que o cortador tem para a tela de corte listar tecido e cor. Uma chave larga
> demais carrega o que ninguém pediu. `GET /api/fornecedores` passou para
> `rolo.nota`.

### As chaves que o operador não tem

`custo.ver` · `rolo.nota` · `cadastro.editar` · `parametro.editar` ·
`sobra.descartar` · `sobra.corrigir` · `rolo.ajustar` · `painel.ler`

> **O que tirar o `painel.ler` custa:** o cortador deixa de ver Encalhe,
> Refugo, Recusas e Cortes. Nenhum é necessário para cortar — o plano já sugere
> o retalho sozinho, que é justamente para o cortador não precisar caçar sobra
> em lista. A volta é uma linha em `PAPEIS.cortador`.

### Dois falso-positivos que a auditoria acusa e estão certos

`largura_bobina.valor` (a largura em metros) e `parametro.valor` (o valor do
parâmetro) casam com o padrão de nome mas **não são dinheiro** — e o operador
precisa dos dois: um monta os botões de BOBINA, o outro os limites da lista de
medida. Nenhuma das duas rotas passa pela poda, e é assim que tem que ser.

---

## O mutirão

A tela lembra **tecido, condição e endereço** entre um retalho e o seguinte
(`localStorage`, por aparelho). Catalogando uma prateleira por vez, só mudam o
código bipado e as duas medidas — é isso que faz o mutirão render. O bipe pula
para a largura, `Enter` na altura salva, e o foco volta sozinho para o código.

**Medido:** 30 sobras seguidas, 0 erros, ~33 ms por lançamento.

Uma trava que parece exagero e não é: **largura de 190 é recusada**. O campo
fala metros, e 190 no lugar de 1,90 entraria calado e viraria um retalho de
190 metros na prateleira.

---

## A sobra lançada errada se CORRIGE — e a correção deixa rastro

A memória do mutirão tem um efeito colateral previsível: o **primeiro retalho
da prateleira nova entra com o tecido do anterior**. Até 05/09/2026 a única
saída era o descarte — da chefia, e medindo como **perda no refugo** uma peça
que está inteira na prateleira. O que a bancada fazia de verdade era deixar
errado, e o plano de corte passava a oferecer um retalho bege para uma peça
cinza.

Hoje o **Catálogo** tem o botão **Corrigir** em cada linha. Ele abre um cartão
com o que a sobra é hoje e os mesmos seletores do lançamento — linha, coleção,
cor, medida, condição, endereço — já marcados no valor atual.

| Regra | Por quê |
|---|---|
| **Só a chefia corrige** (`sobra.corrigir`, fora do cortador) | Decisão do dono: *a chefia aceita a correção*. Trocar o tecido muda de prateleira no sistema — o plano passa a oferecer a sobra para outra cor — e é mexida que se quer com alguém olhando. A bancada vê a marca "corrigida" e o histórico, não o botão |
| **Só a sobra `disponivel`** | A usada já entrou num plano confirmado com aquele tecido; a descartada já virou linha de refugo com aquela área. Mexer nelas reescreveria uma história contada em outra tabela |
| **Cada campo corrigido é uma linha em `sobra_correcao`** | De → para, como se lê na tela (não o id), com quem e quando. É a memória do rolo (`movimento_rolo` com delta zero), para o que a sobra tem de editável |
| **Salvar sem mudar nada não grava linha** | Histórico que não conta nada ninguém lê |
| **O código não se edita** | A etiqueta colada é o que liga o papel à linha. Trocar isso é outra sobra |
| **As mesmas guardas do lançamento** | Tecido inativo, medida em centímetros, condição fora do cadastro e endereço da estante de ROLO são recusados na correção como no `criar` |

A sobra corrigida sai **marcada** na lista, e o cartão mostra as correções
anteriores embaixo. A auditoria da rota registra só o que **mudou**, não o
corpo inteiro — o corpo traz a tela toda, quase tudo igual ao que já estava.

### A bancada APONTA, a chefia ACEITA

Quem corrige é a chefia — mas quem **percebe** o erro é a bancada, com o
retalho na mão. Se ela não tem onde registrar o que viu, o erro fica na cabeça
dela até a chefia passar por ali: dado na memória em vez de no sistema, a
doença de sempre.

```
BANCADA   Catálogo → Apontar erro → marca o certo + motivo → Enviar para a chefia
CHEFIA    Início avisa "N sobra(s) apontada(s)" → Catálogo → Aceitar / Recusar
```

| Regra | Por quê |
|---|---|
| **O apontamento não muda a sobra** (`sobra_proposta`, `sobra.propor` no cortador) | Vira correção **só** quando a chefia aceita — e aceitar passa pelo mesmo `corrigir`: uma porta só para mudar a sobra, venha a mudança de quem vier |
| **Guarda só o que a bancada quer mudar** | Os outros campos ficam `NULL`. O que a chefia lê é `de → para`, campo a campo, contra a sobra **como está agora** |
| **Uma sobra, um apontamento pendente** | Dois apontamentos discordando sobre a mesma sobra não é informação, é ruído para quem decide. A segunda pessoa vê "aguardando chefia" e fala com a primeira |
| **Apontar sem mudar nada é recusado** | Aceitar em silêncio mandaria a bancada embora achando que avisou |
| **Recusar exige motivo** | Quem apontou lê a decisão na própria sobra, e um "não" sem explicação ensina a não apontar mais |
| **O rastro diz quem apontou e quem aceitou** | `sobra_correcao.proposta_id` liga a correção ao apontamento: o histórico escreve *apontado por Ana, aceito por Lucas* |
| **A mesma comparação nos dois lados** (`diferencas`) | A bancada não pode propor o que a chefia não poderia gravar, e a chefia não vê uma diferença diferente da que a bancada viu |

A fila da chefia fica **no topo do Catálogo** e **na tela Início**, e some
quando está vazia. A tela Início existe para isso: se a chefia só descobre o
apontamento quando abre Sobras por outro motivo, *"a chefia decide depois"*
vira *"ninguém decide"* — a meia-decisão da armadilha #14.

O mesmo cartão serve à bancada (modo apontar, com o campo de motivo) e à chefia
(modo corrigir). Dois cartões diferentes ensinariam a equipe a achar que são
duas coisas.

### Quanto vale a prateleira de sobras

A pergunta do dono é uma só: *"quanto temos em reais de sobra, de cada
tecido"*. A resposta soma, sobra a sobra, **área × preço do m²**, e o preço vem
de um de dois lugares:

| De onde | Quando | Muda depois? |
|---|---|---|
| **Do rolo** (`sobra.preco_m2`, herdado) | A sobra nasceu do corte de um rolo **com nota**, ou de outra sobra que herdou. É o que se pagou por aquele tecido, e isso é melhor que estimativa | Não: pago é pago |
| **Do tecido** (`tecido.preco_m2`) | Todas as outras: o mutirão do acervo antigo, o rolo ainda sem nota. É a estimativa da chefia, um número por item de tecido | Sim, e todas as sobras que valem por ele acompanham |

> ⚠️ **A migração 14 pôs o preço só na sobra, congelado, e durou um dia.** O
> estoque antigo, catalogado no mutirão sem nota nenhuma, nunca teria preço
> pago por retalho, e a chefia teria que inventar "o que se pagou" por
> centenas de peças. Por isso a migração 15 pôs o preço **no tecido**: uma
> estimativa de acervo tem que ser um número por tecido, que se revisa. O que
> ficou da 14 é a herança do rolo, que o dono confirmou: onde a nota existe,
> vale o pago.

As quatro regras do `custo.js` continuam valendo:

- **Custo indefinido nunca vira zero.** Sobra sem preço de rolo nem de tecido
  fica fora da soma e é contada em `sem_preco`. O total do tecido e o do acervo
  saem como **piso** (`≥`) enquanto houver alguma.
- **Sem preço, traço.** Nunca `R$ 0,00` na linha.
- **Quem não tem `custo.ver` não recebe os campos.** A poda é na rota, pela
  `custo.podar` (dono único, usada por rolos, sobras e **tecidos**: o preço do
  m² viaja em `/api/tecidos`, a rota que a bancada usa para montar as fileiras
  do lançamento).
- **Mudança de preço deixa rastro.** O do tecido em `tecido_preco` (de → para,
  quem, quando); o do rolo já ficava em `movimento_rolo`, e a linha da nota
  passa a dizer quantas sobras herdaram.

**Onde se lança:** Sobras → Catálogo, botão **Preço** de cada tecido (chefia
com `sobra.corrigir` e `custo.ver`). Quando o tecido ainda não tem preço, o
campo vem com o **último preço pago por rolo desse tecido** como sugestão. O
cartão diz quantas sobras vão valer por ele e quantas continuam pelo preço do
rolo. Cadastros → Tecido mostra a coluna `R$/m²` para quem vê custo.

**A nota que chega depois do corte** (botão Nota, em Rolos) propaga o preço
pago para as sobras daquele rolo que ainda valiam pela estimativa. Um preço
pago não é substituído por outro: reajuste do rolo depois não reescreve o
herdado.

O preço **não se corrige nem se aponta na sobra**: ele não é dela. O
`dinheiro()` do `ui.js` é o formatador único de R$.

**Teste obrigatório:** `node teste/rodar.js` — os 6 casos de preço em
`teste/sobra.test.js` (sem preço é NULL, preço do tecido com histórico, sobra
nova vale pelo tecido, herança do rolo vence o tecido, nota que chega depois,
piso) e o caso de poda em `teste/acesso_operador.test.js`.

O campo **Procurar** no topo do Catálogo aceita o **bipe da etiqueta** e filtra
a tabela sem redesenhar: com centenas de linhas, corrigir a `S-000142` é
primeiro achar a `S-000142`, e o operador está com ela na mão.

**Teste obrigatório:** `node teste/rodar.js` — os 11 casos de correção e
apontamento em `teste/sobra.test.js` travam o rastro, a área refeita, o "nada
mudou", as guardas, o status, o apontamento único, a recusa com motivo e a
aceitação ligada a quem apontou.

---

## A LIMPEZA DE 18/09/2026 — e por que ela não gerou refugo

`node tecido/limpar_sobras.js` (simula) e `--aplicar`. Fase 1 da spec
`docs/specs/SOBRAS-TOM-E-DESPERDICIO.md`; as decisões estão em
`docs/DECISOES.md`.

Na primeira semana de uso, as sobras foram **retiradas dos endereços para
serem medidas** antes do cadastro com etiqueta. As medidas gravadas ficaram
duvidosas e nenhuma sobra tinha etiqueta colada: o cadastro parou de descrever
a prateleira. A equipe recomeçou do `S-000001` em 19/09.

> ⚠️ **ISSO NÃO É PERDA DE TECIDO, e por isso a limpeza não escreve uma linha
> de refugo.** Refugo mede o que o corte desperdiça. Aqui o tecido está inteiro
> na prateleira — o que não valia nada era o cadastro. Contar como refugo faria
> o relatório do mês acusar uma perda que nunca aconteceu, e ela ficaria lá
> para sempre.

**Apaga sete tabelas:** `sobra`, `etiqueta`, `etiqueta_lote`, `sobra_correcao`,
`sobra_proposta`, `plano_recusa` (só as linhas que citam sobra) e `refugo`
**só** com `motivo='descarte'` — que é escrito unicamente pelo
`sobra.descartar`. O refugo **de corte** (`tira_estreita`, `resto_de_pe`, que
vem com `plano_id`) é história de corte que aconteceu e fica.

> ⚠️ **`etiqueta` E `etiqueta_lote` SAEM PORQUE A NUMERAÇÃO É O OBJETIVO.** Quem
> decide o número seguinte é `ultimoSeq()` = `MAX(seq) FROM etiqueta`. Enquanto
> houver uma linha de etiqueta, a próxima impressão **não** volta ao
> `S-000001`. E é por isso que **as etiquetas antigas em papel têm que estar
> recolhidas antes** (R2): com a numeração recomeçando, uma etiqueta velha na
> bancada tem o número de uma nova, e o código é o único fio entre o papel e a
> linha do banco.

**As quatro guardas — ele para e não grava nada:**

| Guarda | O que ela pega |
|---|---|
| sobra `usada` | peça que já saiu num corte |
| `plano_faixa.sobra_id` | sobra **consumida** por corte confirmado |
| `plano_faixa.sobra_gerada_codigo` | sobra que **nasceu** de corte confirmado |
| `criado_em` > 18/09/2026 | o recadastro já começou |

> As três primeiras são a mesma pergunta por três portas, e olhar só a primeira
> deixaria passar **a sobra recém-nascida do corte de ontem** — justamente a que
> tem história atrás. `plano_faixa` só recebe linha dentro do `confirmar()`; o
> `calcular()` não persiste nada, e por isso plano calculado e não confirmado
> (como o teste das 11 sobras que abriu a spec) não prende ninguém aqui.

> ⚠️ **A QUARTA GUARDA É O QUE FAZ O SCRIPT SER INOFENSIVO DEPOIS DE HOJE.**
> Rodado em outubro, ele acha o cadastro novo e **recusa**, em vez de apagar o
> trabalho da equipe. E ele **para** em vez de limpar só os antigos: faltando
> apagar `etiqueta`, a numeração não voltaria ao `S-000001` e a limpeza teria
> feito metade do serviço sem dizer qual metade.

> ⚠️ **ARMADILHA DO SQLITE: `DELETE` em tabela com auto-referência.** A sobra
> que nasceu de outra aponta para a mãe (`origem_sobra_id`). Com
> `foreign_keys = ON`, `DELETE FROM sobra` (todas) **passa** — o FK imediato é
> conferido no **fim da instrução**, e ali não sobrou ninguém apontando —,
> enquanto `DELETE ... WHERE id=1` com a filha de pé é **recusado**. O script
> solta o ponteiro antes, e o `WHERE` dele é estreito: solta só o que aponta
> para sobra **que vai sair**. Limpar a cadeia de uma sobra que fica apagaria a
> **origem de tom** (R5) — o dado que a Fase 3 vai ler — sem nenhum aviso.

**Teste obrigatório:** `node teste/rodar.js` — os 11 casos de
`teste/limpar_sobras.test.js` travam as sete tabelas, as quatro guardas (e que
nas quatro **nada** é gravado), o `S-000001` de volta, o backup por
`db.backup()` com os dados dentro, o que **não** é da sobra ficando de pé, e a
segunda rodada como no-op. O corte de produção tem caso próprio, para ninguém
"atualizar" a data sem ver que isso reabre o script.

---

## O plano de corte

```
ENTRADA: tecido (3 toques) + medidas (grade ou arquivo)
   ↓
1. SOBRA PRIMEIRO, sempre — a política da casa
2. o que sobrou vai para o rolo, simulando TODAS as larguras
3. peça que não cabe volta MARCADA, com o motivo
   ↓
proposta desenhada  →  [não usar] recalcula  →  [Confirmar] baixa tudo
```

**Nada baixa antes do Confirmar**, e o Confirmar é uma transação só: sobra
usada, rolo consumido, sobras novas cadastradas e refugo medido — ou nada.

**A proposta é assinada.** Entre calcular e confirmar, outra pessoa pode ter
usado a mesma sobra; o Confirmar recalcula, compara a assinatura, e recusa se
o estoque mudou. O cliente manda o *pedido*, nunca o plano — ninguém confirma
um plano fabricado.

**A sobra que vai nascer é cadastrada dentro do Confirmar**, com a medida já
calculada e a etiqueta que o operador colou. É isso que fecha o ciclo sem
depender de disciplina: não existe tela separada para alguém esquecer.

**A recusa é gravada na hora**, mesmo que o corte não aconteça — ela é
diagnóstico, não papelada do plano.

### NÃO HÁ EMENDA — e por isso a recusa vira pedido de compra

Decisão do dono, 03/09/2026: **peça mais larga que toda bobina do estoque
simplesmente não sai.** Não há emenda, não há meia solução.

Isso muda o que a recusa significa. Ela deixa de ser um contratempo do encaixe
e passa a ser uma **venda parada esperando material** — e se morre numa linha
de texto no meio da tela do corte, quem compra tecido nunca fica sabendo que se
perdeu a peça por 10 cm de bobina.

Por isso o plano devolve `falta_bobina` separado das outras recusas:

```
NAO TEM BOBINA PARA ESTE CORTE
2 peças precisam de bobina de 2,40 m — a maior em estoque tem 2,00 (faltam 0,40).

  Largura de bobina   Peças   m²
  2,40                    1   3,60
  2,10                    2   6,30
```

Agrupado **por largura**, porque é assim que se compra: não interessa que sejam
quatro peças diferentes, interessa que quatro precisam de bobina de 2,10 m. A
maior primeiro — a bobina que resolve a maior resolve todas as de baixo.

> ⚠️ **O motivo da recusa tem CÓDIGO, não só frase.** A frase é para o operador
> ler; o código é o que a compra soma. Contar frase de texto funciona até o dia
> em que alguém corrige uma vírgula.
>
> | Código | O que é | Vira compra? |
> |---|---|---|
> | `sem_largura` | nenhuma bobina do estoque comporta a peça | **sim** — bobina mais larga |
> | `sem_estoque` | não há bobina nem sobra deste tecido | **sim** — o tecido |
> | `sem_material` | a bobina serve, o metro acabou | não — é reposição |
> | `tom_unico` | o pedido inteiro não coube numa fonte só | não — ver §tom único |

**Faltar altura não é faltar bobina.** A bobina está certa; o que acabou foi o
metro. Somar isso na conta de largura mandaria comprar a bobina errada.

**Sem falta, `falta_bobina` é `null`** — nunca um objeto vazio. Tarja de alarme
que aparece sem alarme é tarja que a equipe aprende a ignorar, e aí a de
verdade passa batida.

**Ourela:** não existe nesta operação (confirmado pelo dono, 03/09/2026). Se um
dia existir, o caminho é cadastrar a largura **útil** do rolo — não há desconto
automático a fazer.

---

### TOM ÚNICO POR PEDIDO — a regra que mais pesa no plano

**Peças com o mesmo número de pedido saem sempre da MESMA fonte.** Três peças
juntas numa sobra: ótimo. Uma na sobra e duas na bobina: **nunca**.

Não é otimização, é defeito de produto — o tom pode não bater entre uma fonte
e outra, e o cliente vê as duas persianas lado a lado na mesma parede. A regra
vale também entre **dois rolos**: rolos diferentes são lotes diferentes.

Na prática, um grupo que entraria pela metade numa fonte é desfeito e tentado
na fonte seguinte. Se o pedido inteiro não couber em lugar nenhum, ele volta
marcado com esse motivo — nunca dividido.

**O que agrupa é o PEDIDO, não o item.** O pedido `4272` do arquivo real tem
onze persianas em quatro itens — e são todas da mesma casa. O item `4272-14`
sozinho tem três peças iguais, cada uma com a sua etiqueta.

**Peça sem pedido informado é livre**, porque não há com quem ela precise
combinar. O campo Pedido fica na grade, e o upload da etiqueta já o preenche.

### E o pedido cortado em dias diferentes

O tom único dentro de um plano não bastava. O pedido `4272` tem **onze**
persianas e o arquivo do dia trouxe **nove** — nada obriga a fábrica a cortar
tudo de uma vez. Duas peças na terça, nove na quinta: cada plano, sozinho,
estava certo, e mesmo assim a casa receberia dois tons.

Então o plano **olha para trás**. Antes de escolher a bobina, pergunta em que
fonte esse pedido já foi cortado:

- **O rolo ainda tem saldo** → continua nele, mesmo que outra bobina rendesse
  mais. Deixou de ser escolha de aproveitamento e virou escolha de tom.
- **A fonte não existe mais** (sobra consumida, rolo encerrado) → o plano sai
  normalmente, com aviso em âmbar: *o tom destas peças pode não bater com o que
  já foi cortado*.

Em qualquer caso a tela mostra, antes do desenho, quantas peças daquele pedido
já saíram, quando, e de onde.

### ⚠️ A NEGATIVA QUE NOMEAVA A PRÓPRIA SOBRA QUE SERVIA

**19/09/2026, Fase 2 da spec `SOBRAS-TOM-E-DESPERDICIO` (R4).** Num corte de
duas peças do mesmo pedido, com uma sobra que comportava **uma** delas, a tela
dizia:

```
Nenhuma das 11 sobras deste tecido comporta estas pecas — a maior e 1,00 × 1,60 (S-000091).
```

E a `S-000091` comportava a peça de 0,92 × 1,50. **A frase negava e nomeava, na
mesma linha, a sobra que servia** — quem leu concluiu que o sistema só aceita
medida exata, e foi isso que abriu a spec.

> ⚠️ **O MOTIVO EXISTIA E ERA JOGADO FORA.** O laço das sobras sabia a
> diferença entre *"não serve"* (o `serve()` recusa) e *"serve, mas o pedido
> inteiro não cabe"* (o `encaixarGruposCompletos` devolve `null`) — e guardava
> só o resultado. O que sobrava para a tela era uma contagem, e contagem não
> tem como explicar nada. Hoje o laço **guarda o porquê**, e a explicação sai
> da mesma régua que decidiu: reconstruí-la depois seria a segunda conta, e as
> duas divergiriam no primeiro ajuste do encaixe.

**Três motivos, e cada um responde uma pergunta diferente da bancada:**

| `motivo_codigo` | O que aconteceu |
|---|---|
| `pedido_nao_separa` | serve a peça, mas o pedido inteiro não cabe — é o tom único (§ acima) |
| `recusada` | o operador recusou esta sobra neste plano |
| `nao_aproveitavel` | a condição está marcada como inaproveitável no cadastro |

> ⚠️ **A INAPROVEITÁVEL ERA INVISÍVEL, e não por descuido:** o `candidatas()`
> filtra `aproveitavel=1` **no SQL**, então ela nunca chegava à tela — retalho
> do tamanho certo, na prateleira, que o plano não oferece e não explica. Agora
> há uma consulta só para a explicação (`naoAproveitaveis`), e ela **não** a
> devolve para o corte: explicar não é liberar.

> ⚠️ **A LISTA SÓ APARECE QUANDO NENHUMA SOBRA FOI USADA, e o teto é cinco.**
> Plano que cortou na sobra não ganha lista nem frase — aviso que aparece no
> caso normal é aviso que a equipe aprende a fechar (armadilha #6), e aí o de
> verdade passa batido. Com a prateleira cheia, "toda sobra que serve" viraria
> parede de texto, que é a armadilha #10: deixa de proteger sem parar de
> existir. As cinco primeiras são as que comportam a **maior** peça, porque é
> isso que responde "até onde essa sobra dá".

> ⚠️ **A "MAIOR" DA FRASE SAI DAS DISPONÍVEIS, nunca de todas.** A antiga
> contava `disponiveis` e media `todasSobras`: apresentava como "a maior"
> justamente a sobra que o operador acabara de recusar.

> **A frase inteira é do domínio, inclusive o "e mais N peças".** A tela
> montava esse rabo e o resultado era uma linha com meia acentuação — o motivo
> vem do domínio, que escreve sem acento como todos os outros, e o pedaço vinha
> da tela, que escreve com. Uma pergunta, um dono.

> **Nada disto entra na `assinar()`.** É explicação, não plano: mudar o texto
> nunca invalida um plano que a tela está mostrando, e o `Confirmar` não sente.

**Teste obrigatório:** `node teste/rodar.js` — os 7 casos de R4 em
`teste/tom.test.js`, ao lado dos do tom único de propósito: são a mesma regra
vista pelo outro lado, e separá-las deixaria alguém afrouxar uma sem ler a
outra. Eles travam o caso do §1, os três motivos, o teto, a "maior" e o
silêncio no caso normal.

> ⚠️ **UM DELES NASCEU CEGO, e foi a conferência por mutação que mostrou.** O
> caso de "cita a maior peça" passava com a regra trocada por *"pega a
> primeira"* — porque na cena a maior **era** a primeira, e o teste acertava
> por acaso. A cena hoje põe a menor na frente. É a lição do QR do PCP (§4 do
> `CLAUDE.md`) por outra porta: **teste verde só vale depois de você ver ele
> ficar vermelho.**

## O upload (fase 8)

**O PDF de etiquetas de produção** (Decorsoft) é lido direto: o sistema pega a
via **COLEÇÃO** de cada item e dela tira **a medida do corte do tecido** —
a que aparece entre parênteses:

```
4292-1  ·  SAULO PAULO DA  ·  COLEÇÃO
1.500 X 1.400              ← a persiana ACABADA (não serve para cortar)
2.417 M2 - (1.465x1.650)   ← O CORTE. É esta que o plano usa.
```

A largura do tecido é **menor** que a da persiana montada (ponteiras e tubo
entram na conta) e a altura é **maior** (sobra para enrolar no tubo e para a
barra). Cortar pela medida acabada erraria as duas dimensões, e para lados
diferentes.

**Uma peça por via COLEÇÃO, nunca uma por item.** Um item pode ter várias
persianas iguais: cada uma imprime o seu jogo de vias, com código próprio no
rodapé (`4547`, `4548`, `4549`). Contar por item cortaria uma só e faltariam
duas na obra.

Vêm juntos o **pedido**, o **item**, a **posição** (`09/11`), o **código da
etiqueta**, o **cliente** e o **tecido** — este último casado com
o cadastro quando dá (`SCREEN 1% BRANCO 3.00M` → `Rolô · Screen 1% · Branco`),
como sugestão: quem confirma continua sendo o botão que o operador aperta.

Também lê CSV/texto com dois números por linha. Em qualquer caso as medidas
caem na **mesma grade**, editáveis antes de calcular — **digitar continua
sempre disponível**, que é o caminho principal, não o de exceção.

> Sem biblioteca de PDF: os fluxos são Flate (zlib, que vem no Node) e o texto
> é UTF-16BE. O teste monta um PDF no formato real, então nenhuma etiqueta com
> nome de cliente precisa ficar versionada no repositório.

---

## A margem zero foi conferida na bancada

Não é palpite nem valor provisório. No pedido 4272 duas peças de `1,495`
saem lado a lado de uma bobina de 3,00 e **sobram 5 mm certinhos** — medido
na bancada, com o tecido na mão.

```
1,495 + 1,495 = 2,990        bobina 3,000        sobra 0,010 (5 mm de cada lado)
```

Isso quer dizer que **as peças encostam mesmo** e que a borda da bobina é
aproveitável até o fim. Enquanto for assim, `margem = 0` está correto e o
plano promete o que o corte entrega.

> ⚠️ **Se um dia parecer que "falta folga", não mexa no `encaixe.js`.** O
> encaixe está certo; o que muda é o dado. Na ordem em que se deve procurar:
>
> | O que aconteceu | Onde se resolve |
> |---|---|
> | A bobina não tem 3,00 de verdade (vem 2,98) | **Largura do rolo**, na entrada. Cada rolo tem a sua |
> | Precisa de folga entre uma peça e a outra | **Parâmetro `margem`** |
> | A borda do tecido é imprestável (ourela) | Cadastrar o rolo pela **largura útil** — o parâmetro de margem desconta entre peças, não nas bordas |
>
> Só o terceiro caso pediria código, e mesmo ele tem saída pelo cadastro.

Um número para dar a dimensão do que está em jogo: com 2 cm de folga, essas
duas peças **deixam de caber** e a faixa passa de 2,73 m para 5,46 m de rolo.
A margem não é um detalhe de acabamento — ela dobra o consumo.

---

## Entrada única

A fábrica tem **duas operações**, e agora um único jeito de entrar nas duas.

```
      tela de PIN do PCP  (uma só, a que a equipe já conhece)
                    │
                    ▼
            /setor  ── aparece SÓ para quem alcança as duas
             │                    │
   MEDIDA PADRÃO            SOB MEDIDA
   (Mercado Livre)          /sobmedida
```

Quem alcança uma operação só **vai direto** para ela: escolha de uma opção só
não é escolha, e cobrar um toque por dia de quem não tem alternativa é o tipo
de atrito que faz a equipe reclamar do sistema inteiro.

### A liberação mora num lugar só: Admin → Acessos

Não há cadastro de pessoas aqui dentro. Quem entra é decidido por **área do
PCP**, na mesma tela em que se libera Revisão ou Carregamento:

| Setor no PCP | Permissão | Vira, aqui | Alcança |
|---|---|---|---|
| **Sob medida / Bancada** | `sobmedida.cortar` | `cortador` | corte, rolos, sobras, etiquetas, painel |
| **Sob medida / Cadastros** | `sobmedida.cadastrar` | `diretor` | tudo, mais cadastros e parâmetros |
| Admin Geral | (todas) | `diretor` | tudo |

Quem traduz é `nucleo/acesso.js`, e é o **único** lugar que sabe dessa
correspondência. Trocar o modelo de acesso do PCP amanhã mexe nesse arquivo, e
em nenhum outro.

> ⚠️ **O CONTRATO COM O PCP É A COLUNA `usuarios.areas`, E ELA É SOMBRA.**
> No modelo novo de acesso do PCP, `areas` não é mais editada à mão: ela é
> **recalculada** a partir das permissões efetivas, pelo mapa `PERM_AREA` em
> `acesso.js`. As duas linhas de sob medida **precisam** estar nesse mapa.
>
> Faltando, o modo de falhar é o pior possível: o admin marca o acesso, a tela
> confirma, e a área é apagada no salvamento seguinte. O acesso sumiria
> sozinho, sem erro, sem log. Foi o que quase aconteceu — hoje há teste
> travando as duas pontas (`teste/acesso.test.js`, caso do contrato).

### Bloquear é uma coisa só

Desligar a pessoa no PCP fecha as duas operações no mesmo gesto — era
exatamente isso que os dois cadastros separados não davam. Tirar só o setor de
sob medida fecha o corte e mantém o resto.

### O que este módulo NÃO faz

Não lê o banco do PCP, não conhece o segredo do cookie dele, não guarda PIN.
Ele recebe `req.usuario` já resolvido e traduz. A autenticação continua tendo
um dono só.

---

## O design: dois contextos, dois temas

Segue o `docs/DESIGN.md` do PCP, e os hex são **copiados das telas que já
rodam** — o claro de `public/operador.html`, o escuro de `public/index.html`.

| Tela | Contexto | Fundo | Por quê |
|---|---|---|---|
| Início, Corte, Rolos, Sobras, Etiquetas | operação | **claro** | iPad no suporte, luz natural forte e lâmpada de inspeção ao lado — tela escura ali vira espelho |
| Cadastros, Painel | admin | **escuro** | escritório, luz controlada, tela de números |

Quem carimba o tema é o **servidor**, a partir de `nucleo/telas.js`, num
atributo `data-contexto` no `<html>`. Deixar cada arquivo declarar o próprio
tema garantiria que, mais cedo ou mais tarde, uma tela nova nascesse errada.

> ⚠️ **A primeira versão usou uma paleta *quase* igual à do PCP** — `#12161c`
> no lugar de `#1a1d23`, `#1f6feb` no lugar de `#1565c0`, e assim nas sete
> cores. Nenhuma batia. Diferente o bastante para o olho perceber, perto o
> bastante para não parecer proposital: o efeito é a equipe sentir que entrou
> em outro sistema. **Cor nova aqui só entra se entrar também lá.**

A moldura (`public/nav.js`) repete o gesto do `nav.js` do PCP de propósito:
barra de sessão em cima, barra de atalhos embaixo, ajuste A+/A− na operação.
O menu se monta com o que a pessoa alcança — botão que leva a porta fechada
ensina o operador a não tentar, e quem bate em "sem permissão" três vezes para
de clicar na quarta, mesmo quando já podia.

---

