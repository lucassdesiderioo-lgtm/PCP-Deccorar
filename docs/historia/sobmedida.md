# História — sob medida (`/sobmedida`)

> **Isto é história, não regra.** A regra vigente de cada assunto está em
> [`docs/regras/sobmedida.md`](../regras/sobmedida.md), em cartões curtos com o
> teste que a trava. Aqui está o PORQUÊ: o defeito que provocou cada regra, as
> datas e as conferências na fábrica.
>
> O texto abaixo saiu do `CLAUDE.md` §19 em 21/10/2026 **sem nenhuma
> alteração**, em partes. Parte 1: o começo da seção (até a armadilha #17), a
> armadilha #34 e as três regras do fim. Parte 2 (21/10/2026): o catálogo, a
> revenda, o pedido e a etiqueta de produção (fases 1 a 4-A). As referências do tipo "§10" ou
> "armadilha #6" apontam para o `CLAUDE.md` ou para os outros arquivos de
> [`docs/historia/`](.). Quando um cartão mudar, a história nova entra **no
> fim** desta página, com data; o que está escrito não se reescreve.

---

<!-- Do CLAUDE.md §19 — o começo da seção, até a armadilha #17 -->

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

> ⚠️ **O BACKUP DIÁRIO COBRE ESTE BANCO DESDE 28/09/2026 — e antes disso não
> cobria.** Banco próprio é a decisão certa, e ela tem um custo que ficou um ano
> sem ser pago: tudo que é feito para o `dados.db` **não** acontece aqui de
> graça. O `backup.js` das 23:30 copiava só o do PCP, sem erro nenhum. Detalhe e
> regras em §13, *"O backup diário cobre os DOIS bancos"*.
>
> **A pergunta que fica para a próxima coisa que nascer aqui:** o que mais o PCP
> tem e este módulo não? O caminho dos dados é o `caminho.js`; o backup, o
> `backup.js`. O download por token (`/baixar-backup`) ainda é só do PCP.

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

> ⚠️ **E A SOMBRA TEM O DEFEITO SIMÉTRICO, que custou uma escalada de acesso:
> além de sumir sozinha, ela também PROMOVIA sozinha.** O `migrarPendentes`
> continuava lendo `usuarios.areas` como se fosse entrada, e `'admin'` ali vira
> o setor **Admin Geral** — então uma exceção pequena de nível admin acabava
> dando o sistema inteiro para a pessoa. Fechado em 17/09/2026; a história está
> na §10, armadilha #28. **A regra que fica: `areas` é saída. Quem a lê para
> decidir alguma coisa está lendo o eco da própria decisão.**

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

---

<!-- Do CLAUDE.md §19 — a armadilha #34, que ficava no meio da fase 2 -->

### ⚠️ ARMADILHA #34 — a chave do CADASTRO deste módulo valia como admin do PCP

**24/09/2026.** A fase 2 travou o vazamento no sentido **venda → módulo** (logo
acima). Faltava o de volta, e ele estava aberto desde sempre:
`sobmedida.cadastrar` era `nivel:'admin'`, e nível admin no PCP não é rótulo —
é duas afirmações:

```
sincronizarAreas   → área 'admin' em quem tem QUALQUER chave de nível admin
temAdmin(perms)    → as 24 rotas '@admin' do PCP liberam pela MESMA régua
```

Então a chave que diz *"mexe no cadastro de tecido e nos parâmetros do
encaixe"* dizia, de fato, **"é admin do PCP"**. Hoje ela é `supervisor`.

> ⚠️ **DENTRO DO MÓDULO NÃO MUDOU NADA, e escrever isso importa mais que o
> conserto.** O `papelDe` devolve `'diretor'` tanto para `'admin'` quanto para
> `AREA_CHEFIA` — **nunca houve papel "chefia" separado**. Quem tem a chave
> continua entrando como diretor lá dentro; é o que a área sempre significou.
> O que saiu foi o PCP. Eu mesmo descrevi isto errado ao dono antes de ler o
> `papelDe`, e a decisão foi tomada com a descrição corrigida na mesa.

> ⚠️ **O SETOR NATIVO `Admin` DEIXOU DE CARREGAR A CHAVE, e isso é decisão.**
> A lista de permissões dele é **calculada** — *"toda chave de nível admin"*
> (`acesso.js`, linha 38) —, então baixar o nível a tira de lá na instalação
> limpa. Em produção nada muda, porque **ninguém a tinha**. O lugar dela passa
> a ser o setor dedicado. Há caso afirmando isso, para não voltar por acidente
> no dia em que alguém reler a lista calculada.

> ⚠️ **E O SETOR PRECISA TER NÍVEL QUE CAIBA A CHAVE — o par declarado errado
> não dá erro: ele APAGA a chave em silêncio.** O `Sob medida / Cadastros`
> estava declarado `admin` e a produção tinha `supervisor`; a chave era
> `admin`. A rota de salvar recusa permissão acima do nível do setor, **e a
> tela nem desenha a caixinha** — então ela não é recusada, ela simplesmente
> nunca é mandada. E como o salvar **apaga e regrava a lista inteira**,
> editar o setor por qualquer outro motivo a remove.
>
> Foi o que aconteceu: a auditoria traz `2026-09-19 07:29 · Lucas ·
> setor_editado · Sob medida / Cadastros · sobmedida.cortar`. Ninguém
> desmarcou nada. Hoje os dois são `supervisor`, e o caso confere o **par**,
> não cada um por si.
>
> **O defeito de tela continua de pé e é dívida** (linha 20 do §14): editar
> qualquer setor remove, sem avisar, as permissões que ele tenha acima do
> próprio nível.

> **O que isso NÃO conserta:** as outras 23 chaves de nível admin do PCP
> continuam entrando no sob medida como diretor (o bloco acima). Estreitar
> aquela leitura é `REGRA`, uma chave por vez.

> **Rode `node teste_acesso.js` (168 casos, a seção 6-D é esta) e
> `cd tecido && npm test` (450) ao mexer no nível de qualquer chave.**
> Conferido reintroduzindo o `nivel:'admin'`: reprova **6 casos** no primeiro
> e **1** no segundo. E **abrindo a tela** — com o defeito de volta a caixinha
> aparece `[BLOQUEADA] · acima do nível do setor`, que é o que o dono viu; com
> o conserto ela é marcável, e salvar o setor mantém as duas chaves.

> ✅ **NO AR E CONFERIDA EM PRODUÇÃO EM 24/09/2026, E A PROVA É UMA PESSOA.**
> Depois do deploy o dono marcou a chave no setor: ele ficou `supervisor` com
> as duas chaves, e os três membros ganharam `sobmedida_adm`. **Dois deles
> também têm `admin`** — mas por outras chaves de nível admin que já tinham.
> **O terceiro, não:** ele saiu com `sobmedida_adm` e **sem** `admin`, que era
> impossível até hoje de manhã. É o vazamento fechado aparecendo em dado real,
> e não em caso de teste. O `sobmedida.cortar` continuou marcado no mesmo
> salvamento, que é a outra metade do que podia dar errado.

---

<!-- Do CLAUDE.md §19 — as três regras do fim da seção -->

### Três regras do sob medida que valem citar aqui

**Cada nível guarda um rolo só.** Regra do dono, 15/09/2026: `Haste A · Andar 1
· Nível 1` é um buraco, e no buraco cabe **um** tubo de tecido novo. O andar
tem quantos níveis a prateleira tiver — guardar mais material é criar mais
nível. O buraco se esvazia **sozinho**, por dois caminhos e só esses dois: o
tubo mudou de lugar (Mover) ou o material acabou (Rolo acabou, que encerra) —
rolo encerrado não ocupa. **A sobra não tem essa trava**: retalho dobrado é
achado pela etiqueta, não pelo endereço. O que já estava duplicado antes da
regra não é recusado; vira checagem no painel gerencial, pelo mesmo motivo de
sempre — trava que dispara no caso normal vira desvio (armadilha #6). Detalhe
no `tecido/README.md`.

**Não há emenda.** Peça mais larga que toda bobina do estoque não sai — e por
isso a recusa vira número de compra, não recado: o plano devolve `falta_bobina`
com quantas peças, de que largura, e qual a maior que existe hoje. Sem isso a
venda parada morre numa linha de texto e quem compra tecido nunca fica sabendo.

**Não há ourela.** Confirmado em 03/09/2026. Se um dia existir, o caminho é
cadastrar a largura *útil* do rolo — não há desconto automático a fazer.

---

<!-- Do CLAUDE.md §19 — parte 2: fases 1 a 4-A (catálogo, revenda, pedido, etiqueta de produção) -->

### ⚠️ O MÓDULO PASSOU A TER DOIS ASSUNTOS (22/09/2026)

Até 21/09 o `tecido/` respondia só sobre **estoque de tecido**: quanto tem,
que sobras existem, como cortar. A fase 1 da spec `SOBMEDIDA-PEDIDO-REVENDA`
acrescentou o segundo: **a venda sob medida** — o que a fábrica vende, com que
regra técnica e por quanto.

| Assunto | Tabelas | Dono único |
|---|---|---|
| estoque de tecido | `rolo`, `sobra`, `plano`, `tecido`… | `dominio/rolo.js`, `dominio/plano.js`… |
| **venda sob medida** | as `sm_*` (migração 16) | **`dominio/persiana.js`** |

`persiana.js` responde *"dada esta persiana, o que ela é"*: o degrau da escada
de tubos, os componentes com medida de corte **e** de consumo, o kit, o preço,
os avisos e as recusas. O simulador de hoje, o pedido da fase 3, a explosão da
ficha na aprovação e a etiqueta da fase 4 chamam **essa** função — uma segunda
conta em qualquer uma seria a armadilha #12 com a bancada cortando por uma
régua e o cliente cobrado pela outra.

> ⚠️ **Milímetro inteiro e centavo inteiro por dentro**, metro com três casas e
> reais por fora, e `tecido/nucleo/unidade.js` é a porta única. O resto do
> módulo trabalha em metros `REAL` e ali está certo — a bobina é medida assim.
> Aqui a conta **empilha** (o tubo tira do final, o tecido tira do tubo, a base
> soma no tecido) e o ruído de ponto flutuante compõe a cada degrau. É o
> `3,5 + 0,2 = 3,7000000000000006` do §7-B, numa escala em que ele decide corte.

> ⚠️ **A ficha tem os DOIS números por linha desde o primeiro dia** (armadilha
> #18): corte vai para a etiqueta, consumo vai para Compras e para o custo. Na
> fase 1 o consumo nasce igual ao corte e a coluna já existe — há caso travando
> que dobrar a medida de corte não muda um centavo.

> ⚠️ **A coleção de venda APONTA para o cadastro de tecido, e o modelo NÃO
> guarda linha.** A `abertura` já pendura em `linha`, então a linha já está
> dentro da coleção; guardá-la também no modelo seria a segunda afirmação sobre
> o mesmo fato, que é o defeito do `linhaSel`/`linhaForm` de 15/09/2026.

> ⚠️ **Tela nova pede a linha em `nucleo/telas.js` E em `public/nav.js`.** O
> rodapé monta `ORDEM.filter(...)`: tela declarada e liberada mas fora daquele
> mapa **não tem botão**, sem erro e sem log. É a armadilha #13 por mais uma
> porta, e a ponta que some em silêncio é sempre a última. **E na porta da
> `inicio.html` também** — são três listas, e desde 02/10/2026 há teste (§20).

> ✅ **EM PRODUÇÃO E CONFERIDA NA FÁBRICA EM 22/09/2026, NAS DUAS METADES.** O
> dono fez o deploy e simulou **dez persianas reais do WhatsApp: as dez
> bateram** (tubo, cortes e kit). Lançados os preços, refez as **dez
> comparando o TOTAL** com o que foi cobrado — as dez bateram de novo, mais as
> duas contas do mínimo faturado (`1,000 × 1,000` cobra 1,5 × o preço;
> `2,000 × 1,000` cobra 2 ×).
>
> São **duas rodadas de dez, e não uma**: o corte foi conferido antes de o preço
> existir. E vale mais que os 304 casos verdes de então — teste diz que o código faz o
> que eu escrevi; só a fábrica diz que o que eu escrevi é o que ela corta e o
> que ela cobra.
>
> ⚠️ **O total do simulador continua sendo o preço DECCORAR** — e agora há um
> segundo número embaixo dele, o que a revenda paga (fase 2, abaixo). Os dois
> aparecem juntos e nunca um no lugar do outro: o de cima vai para
> faturamento, Compras, crédito e relatório; o de baixo é da revenda. Coleção
> **sem** preço continua saindo como piso (`≥`), que é a regra 4 funcionando,
> não tela quebrada.

**Detalhe inteiro no `tecido/README.md`**, seção "O catálogo de venda e o
simulador".

### ⚠️ A FASE 2 (22/09/2026) — QUEM COMPRA, E A ÁREA QUE ELE USA

A fase 1 respondeu o que a persiana **é** e quanto ela custa **na Deccorar**. A
fase 2 traz quem compra: a **revenda**, o **vendedor** que cuida dela, a
**tabela** que decide o preço dela e o **prazo**. Migração 17, mais
`dominio/revenda.js`, `dominio/prazo.js`, `nucleo/pessoas.js` e a tela
`/sobmedida/revendas`.

#### O preço da revenda sai do Deccorar em CASCATA, e nunca por cima dele

```
subtotal Deccorar          R$ 209,00       ← não se mexe
  × tabela B (−10,00%)
  × desconto da revenda (−5,00%)
a revenda paga             R$ 178,70
```

> ⚠️ **CASCATA, E NÃO SOMA** — decisão do dono em 22/09/2026. Somados, 10% + 5%
> dariam 15%; em cascata dão 14,5%, e num pedido de mil reais a diferença é de
> cinco. A soma tem um defeito pior: dois percentuais grandes zerariam a venda
> sem ninguém notar, porque a tela continuaria mostrando dinheiro.

> ⚠️ **ARREDONDA UMA VEZ, NO FIM.** Dois arredondamentos em cadeia erram um
> centavo para cima ou para baixo sem regra nenhuma — e é o tipo de centavo que
> aparece na conferência da revenda e não tem como ser explicado. A conta é
> feita em inteiro (`subtotal × centésimos × centésimos`) e só divide no fim.
> Há caso travando: reintroduzir o arredondamento por degrau reprova o
> `persiana.test.js`, e foi conferido assim.

> ⚠️ **O SUBTOTAL DECCORAR NÃO SE MEXE, e é esse o caso de teste que importa
> mais.** "Misturar o preço com markup em qualquer número da Deccorar" é o
> décimo item da §9 da spec, e a forma de isso acontecer nunca é alguém
> decidir: é o desconto entrar no subtotal por descuido e ninguém notar,
> porque o total continua parecendo dinheiro.

> ⚠️ **TABELA SEM PERCENTUAL NÃO TEM PISO — tem recusa com o nome do que
> falta.** Piso quer dizer "no mínimo isto", e desconto só faz o número
> **descer**: o subtotal Deccorar seria um **teto**. Escrever `≥ R$ 209,00` ali
> diria a coisa errada com a palavra certa, e ainda gastaria o sinal que a
> equipe aprendeu a ler como "falta preço em alguma linha". A tela escreve
> *"ainda não dá para dizer o que esta revenda paga — falta lançar: tabela B"*.

> ⚠️ **AS TRÊS TABELAS NASCEM SEM PERCENTUAL, E NÃO COM ZERO.** `NULL` é "ainda
> não se sabe"; zero é "sem desconto", que é decisão. Semeadas com zero, o
> sistema cobraria o preço cheio de todo mundo com cara de regra aplicada — e
> ninguém descobriria, porque o número só ficaria maior.

#### O prazo é conta, não promessa de memória — `dominio/prazo.js` é o dono único

```
enviado até quarta 18:00  →  pronto na quinta da SEMANA SEGUINTE
um minuto depois          →  a quinta da outra semana
entrega em dia não útil   →  empurra, e DIZ qual feriado empurrou
```

Os quatro números (dia e hora do corte, dia da entrega, semanas) são
**parâmetros**, e os feriados são **cadastro** — o corte do Mercado Livre já
mudou sem aviso no PCP (§8), e não há razão para o da revenda ser diferente.
Parâmetro fora da faixa é **recusado** (`prazoCorteHora` por extenso,
`prazoCorteDiaSemana = 7`): aceito, ele mudaria a conta em silêncio.

> ⚠️ **CONTA A HORA DO ENVIO, NUNCA A DA APROVAÇÃO.** Aprovar é tarefa da
> Deccorar, e a demora dela não pode passar para a revenda. Por isso `calcular`
> **recebe** o momento do envio em vez de olhar o relógio sozinho: na fase 3 o
> pedido guarda o prazo congelado, e recalculá-lo depois com o relógio de hoje
> daria outra data para o mesmo pedido.

> **A prévia na tela é o que torna o cadastro conferível.** Quatro parâmetros e
> uma lista de feriados não dizem nada sozinhos; a pergunta que se faz é *"um
> pedido enviado agora fica pronto quando?"*. Sem a resposta escrita ali, o
> cadastro só seria conferido pelo primeiro cliente que reclamasse.

#### O vendedor ganhou área própria, e isso fecha a dívida da fase 1

| | até a fase 1 | agora |
|---|---|---|
| área do PCP | **Sob medida — cadastros** (a da chefia) | **Sob medida — venda** |
| papel no módulo | `diretor` | `vendedor` |
| alcança | tudo: tecido, parâmetros do encaixe, descarte de sobra | simulador, catálogo de leitura, a carteira dele |
| **não** alcança | — | cadastro de tecido, parâmetros, descarte, plano, painel, editar catálogo |

> ⚠️ **A CHAVE `sobmedida.vender` É `nivel:'operacao'` NO PCP, E ISSO É TRAVA,
> NÃO CLASSIFICAÇÃO.** `sincronizarAreas` põe a área `'admin'` em quem tem
> **qualquer** chave de nível admin, e o portão do sob medida
> (`tecido/nucleo/acesso.js`) lê `'admin'` como **diretor**. Declarada como
> admin, a chave devolveria ao vendedor exatamente o módulo inteiro que ela
> veio tirar dele — sem ninguém pedir, e sem erro em tela nenhuma. É a porta A
> da armadilha #28 (§10) por uma porta nova. Caso travando no `teste_acesso.js`
> (seção 6-B), e ele confere o **nível declarado**, não só a existência da chave.
>
> ⚠️ **E A MESMA LEITURA DE `'admin'` CONTINUA VALENDO PARA AS OUTRAS 23
> CHAVES DE NÍVEL ADMIN DO PCP** — `sku.cadastrar`, `custo.ver`,
> `devolucao.baixar` e as demais. Quem tem qualquer uma delas entra no sob
> medida como **diretor**. Isso é anterior a esta fase e **não foi mexido
> aqui**: estreitar aquela leitura muda quem pode o quê e é `REGRA`, não
> conserto. Está escrito para não se descobrir por acidente.

> ⚠️ **`revenda.editar` E `credito.editar` NÃO SÃO DO VENDEDOR**, e isso é
> decisão, não esquecimento. A spec diz que a tabela é decidida pela Deccorar
> (§4.12) e que o limite é revisto de dois em dois meses (§4.13) — as duas são
> decisão de quem responde pelo dinheiro, não de quem vende. Custa isto:
> revenda nova, troca de tabela, endereço de entrega novo e limite passam pela
> chefia. **Alargar é uma linha; o contrário, não.**

> ⚠️ **`custo.ver` ESTÁ NO PAPEL DO VENDEDOR, E TEM QUE ESTAR.** A poda do
> `custo.js` corta todo campo de dinheiro de quem não a tem — e o vendedor sem
> ela abriria o simulador e veria a persiana inteira **sem o preço**, que é
> justamente o número que ele foi buscar.

> ⚠️ **NASCEU A CHAVE `modulo.entrar`, e ela é conserto de um defeito
> evitado.** A tela inicial e o `/api/eu` pediam `cadastro.ler`, *"a chave mais
> baixa que todo mundo que entra tem"*. Com o terceiro papel isso virou
> mentira: ou o vendedor abriria o módulo em branco com 403 no console, ou
> ganharia `cadastro.ler` de carona — e com ela a lista inteira de tecido,
> endereço e motivo. Tela em branco não se parece nem de longe com "mexeram na
> permissão" (§10, armadilha #29).

#### O vendedor é gente do PCP — `nucleo/pessoas.js` é a porta única

O sob medida **continua sem cadastro de gente próprio**. A revenda guarda o
`vendedor_usuario_id` do PCP e o `vendedor_nome` como **retrato** (a carteira
precisa continuar legível daqui a um ano, mesmo que a pessoa saia). A lista de
nomes chega por uma porta ligada no `server.js`, e ela **remapeia**: o que
atravessa é `id` e `nome`, e mais nada — PIN, salt e áreas não passam nem por
engano. Há caso travando.

> ⚠️ **SEM A PORTA LIGADA, RECUSA — NUNCA LISTA VAZIA.** Lista vazia em
> silêncio faria a tela afirmar que a fábrica não tem ninguém, e alguém
> passaria a tarde procurando no lugar errado. A recusa **diz onde se liga**
> (`server.js`, na chamada de `montar()`).

> ⚠️ **DOIS CADASTROS DE GENTE SÃO DOIS LUGARES PARA LEMBRAR DE DESLIGAR
> ALGUÉM.** Foi por isso que este módulo deixou de ter o dele em 02/09/2026, e
> é por isso que a fase 2 não criou um de vendedores.

#### O que a fase 2 deixou explicitamente de fora, e por quê

| Fica de fora | Por quê |
|---|---|
| **Logo da revenda** | só é usado no orçamento ao cliente final (fase 7), e guardar arquivo é outro assunto: onde mora, backup, o cron que limpa |
| **Markup** | é da revenda, para o cliente dela — fase 7, e nunca entra em número da Deccorar |
| **Crédito disponível** | `limite − boletos em aberto`, e boleto é fase 6. Mostrar "disponível = limite" seria número mentindo |
| **Pedido, aprovação, prazo negociado** | fase 3 |

> **`valor_limite_credito_centavos` começa com `valor_` de propósito.** A poda
> do `custo.js` corta por **padrão de nome**: `limite_credito_centavos` não
> casaria com `preco|valor|custo|nf|fornecedor` e viajaria pelo fio em
> silêncio — foi assim que o `resumo.valor_parado` do painel gerencial chegou à
> bancada (§15). Há caso travando os dois nomes, o certo e o errado.

**Rode `cd tecido && npm test` (449 casos) e `node teste_acesso.js` (114) ao
mexer em revenda, prazo, preço, permissão ou no `server.js`.** Os casos do
prazo saem das datas escritas na §4.9 da spec, e não da resposta que a função
deu.

### ⚠️ A FASE 3 (22/09/2026) — O PEDIDO, E A FRASE QUE GOVERNA TUDO: **CONGELADO É CONGELADO**

A fase 1 respondeu o que a persiana **é**; a 2, **quem compra**. A 3 é o que
liga os dois: o pedido. Migração 18 (sete tabelas `sm_pedido*` e o parâmetro
`pedidoNumeroInicial`), `dominio/pedido.js` (dono único do ciclo),
`dominio/pedido_pdf.js` e a tela `/sobmedida/pedidos`.

```
rascunho   se edita à vontade, e o preço lido é o de HOJE
enviado    número, preço, tabela e prazo ficam GRAVADOS
aprovado   a ficha é explodida e gravada — e nada mais muda
```

> ⚠️ **DEPOIS DO ENVIO NENHUMA LEITURA VOLTA AO CATÁLOGO**, nem ao cadastro da
> revenda. Um reajuste de terça não pode mexer no que foi vendido na segunda —
> é a armadilha #15 (preço no cadastro anda para trás) pela porta da venda. E
> depois da aprovação nem a **ficha** se relê: a persiana é cortada como a
> etiqueta dela já diz, e **na bancada vence a etiqueta**. As duas datas são
> diferentes de propósito, e estão na spec: preço congela no **envio** (§4.8),
> ficha congela na **aprovação** (§4.11).
>
> O caso que trava isso é o segundo do `pedido.test.js`: ele reajusta a coleção
> **depois** do envio e exige que o pedido continue em R$ 209,00. Fazer a
> leitura voltar a calcular ao vivo reprova três casos — foi conferido assim.

> ⚠️ **E O TUBO QUE MUDA ENTRE O ENVIO E A APROVAÇÃO DEIXA LINHA, em vez de
> silêncio.** São duas datas, então há uma janela: alguém mexe na escada com o
> pedido na fila, e a fábrica corta um tubo diferente do que foi vendido. É
> evento raro e caro — o tipo de coisa que ninguém procura depois se não
> estiver escrito. A aprovação grava em `sm_pedido_alteracao` (`degrau`, antes
> e depois), e a tela mostra no histórico.

> ⚠️ **APROVADO NÃO SE ALTERA, NEM PELO ADMIN** — decisão minha, 22/09/2026,
> registrada em `DECISOES.md`. A spec propunha *"até a primeira etiqueta
> impressa"*, e essa marca só existe na fase 4: implementá-la agora criaria uma
> regra escrita, codificada e que **não pega em ninguém** — é a dívida 18 (§14),
> a que deixou `modelo.sob_medida` três semanas inerte. O caminho é **cancelar
> a peça com motivo e lançar outra**: a peça cancelada **fica na lista**, sai da
> conta e guarda quem cancelou e por quê. Sumir em silêncio de uma lista que
> alguém imprimiu é o que faz a conferência virar discussão.

> ⚠️ **O ENVIADO VOLTA A RASCUNHO, E O NÚMERO FICA.** Reabrir apaga o bloco
> congelado (preço, tabela, prazo) e devolve o pedido à edição — mas não o
> número, que já foi dito à revenda por escrito. **Número que volta para o bolo
> é número que um dia sai duas vezes.** Pela mesma razão, `removerItem` só
> existe no rascunho que **nunca** foi enviado: depois do primeiro número, a
> peça sai cancelada, nunca apagada.

> ⚠️ **ORÇAMENTO NÃO QUEIMA NÚMERO, e "virar pedido" é um ato próprio.**
> Orçamento só simula (§4.10) — o preço dele é o de hoje, lido ao vivo a cada
> leitura. Gravar um preço no rascunho faria o orçamento **envelhecer calado**:
> a pessoa abriria amanhã e leria o número de ontem com cara de atual. O número
> nasce no envio, e o envio **recusa** quem ainda é orçamento.

> ⚠️ **SEM `pedidoNumeroInicial` LANÇADO, O ENVIO É RECUSADO — e isso é a
> decisão, não uma falta.** O parâmetro nasce **em branco** (tipo texto: `''` é
> "ainda não se sabe", e zero seria um número válido e mentiroso). O plano de
> corte agrupa o **tom único** pelo TEXTO do pedido e olha para trás
> (`cortesAnteriores`, em `plano.js`): um 4272 novo colado num 4272 antigo do
> Decorsoft herdaria o histórico de tom de outra casa, e a persiana sairia de um
> rolo escolhido para outro cliente (§4.18). A recusa **diz onde se lança**.
>
> E a numeração **nunca desce**: quem manda é o maior entre o parâmetro e o que
> já foi usado. Baixar o parâmetro por engano não pode fazer o número voltar por
> cima de pedido que existe. Há caso travando.

> ⚠️ **A COR DO TECIDO É OBRIGATÓRIA NO PEDIDO, e opcional no simulador.** Lá
> ela só escreve o nome na frase; aqui ela decide **qual rolo sai da
> prateleira**, e não se corta sem saber a cor. O `tecido_id` é resolvido pelo
> `persiana.js` — que passou a devolvê-lo — e **gravado no lançamento**:
> reencontrá-lo depois pelo nome da cor seria a segunda régua da armadilha #12,
> e a que erra é a que manda o rolo errado.
>
> A lista de cores tem porta própria (`GET /api/sm/colecoes/:id/cores`,
> `catalogo.ler`), e só sai cor que **tem item de tecido cadastrado**. Mandar o
> vendedor a `/api/cadastros` daria a ele a lista inteira de tecido, endereço e
> motivo para responder uma pergunta de três palavras — ele não tem
> `cadastro.ler`, e a tela abriria o seletor vazio com 403 no console, que não
> se parece com "falta permissão" (§10, armadilha #29).

> ⚠️ **"SEM TECIDO" É SINAL, NUNCA TRAVA** (§4.10). O pedido de um tecido que
> não está na estante entra normalmente, marcado, e o vendedor negocia prazo
> maior. Travar aqui seria a armadilha #6: a venda existe, e quem é recusado
> vende por fora. E o sinal **não é a resposta do plano de corte** — a pergunta
> aqui é grossa ("há bobina deste tecido, larga o bastante?"); quem decide entre
> rolo e sobra é o plano.

> ⚠️ **O TOTAL É A SOMA DAS PEÇAS QUE CONTINUAM DE PÉ; a coluna guarda o que o
> ENVIO prometeu.** Os dois aparecem lado a lado quando divergem — a mesma forma
> do prazo prometido × atual. Um número só faria a peça cancelada sumir da lista
> e continuar no total, ou o contrário: o total baixar sem nada dizer que a
> revenda recebeu outro por escrito.
>
> E o arredondamento mora na **peça**: cada persiana já sai arredondada uma vez
> (§4.1), e é o valor dela que a revenda vê linha a linha no PDF. Somar os
> arredondados é o único jeito de o total da folha fechar com as parcelas
> impressas nela.

> ⚠️ **O SUBTOTAL DECCORAR CONTINUA INTOCADO**, no pedido como no simulador: o
> de cima vai para faturamento, Compras, crédito e relatório; o de baixo é o que
> a revenda paga. Os dois juntos, nunca um no lugar do outro.

> ⚠️ **AS LINHAS DE PREÇO TÊM TABELA PRÓPRIA (`sm_pedido_item_preco`), e essa
> foi a mudança no caminho.** O plano dizia seis tabelas; são sete. Guardar só o
> total faria a conferência da revenda virar *"confie no número"* — e é
> justamente essa conferência que acha o erro de digitação da medida **antes**
> de a peça ser cortada.

> ⚠️ **RASCUNHO NÃO VIRA PAPEL.** `GET /api/pedidos/:id/pdf` recusa o que não
> foi enviado: no rascunho o preço ainda é o de hoje, e impresso ele vira um
> compromisso que o sistema não assumiu. E o texto do PDF passa por um
> higienizador: Helvetica escreve em **WinAnsi**, e a seta ou o emoji que alguém
> colou do WhatsApp na observação fazem o `pdf-lib` estourar **no meio da
> geração**, com a folha pela metade e sem dizer por quê. Vira `?`, e a folha
> sai. Há caso travando — tirar o higienizador reprova.

> ⚠️ **`pedido.aprovar` E `pedido.aprovar_qualquer` SÃO DUAS CHAVES.** A
> primeira é *"aprovo o que é da minha carteira"* (§4.12); a segunda é *"aprovo
> a de qualquer um"*, e existe para a fila não parar numa semana de férias. Uma
> chave só significaria escolher entre travar a fábrica e deixar qualquer
> vendedor aprovar a revenda do colega. **A rota de aprovar pede a chave
> estreita** — declarar a larga nela tiraria do vendedor exatamente a fila que
> ele existe para trabalhar, e o efeito seria 403 numa tela que abre.
>
> `pedido.cancelar` **não está no vendedor**: cancelar desfaz o que a fábrica já
> viu. Ele lança, envia, aprova a carteira dele e negocia prazo.

> **A fila mostra DIAS DE FÁBRICA, não dias de calendário.** Três dias no papel
> com um feriado e um fim de semana no meio são **zero** dias de trabalho, e é
> essa a diferença entre cobrar a produção hoje ou na semana que vem. Quem conta
> é o `prazo.diasUteis` — e **negativo fica negativo**: prazo vencido é
> justamente o que a lista existe para mostrar, e zerar seria o `MAX(0, …)` do
> saldo (§2) pela porta do prazo.

> ⚠️ **PEDIDO SEM PEÇA NÃO VALE R$ 0,00 — ele não vale NADA AINDA.** Zero se lê
> como "de graça". É a regra 4 na tela, e só apareceu **renderizando a tela**:
> nenhum teste de unidade pega um total que está sintaticamente perfeito.

> ✅ **CONFERIDA EM PRODUÇÃO EM 23/09/2026, COM A FOLHA NA MÃO.** O dono
> lançou o número do Decorsoft e rodou o ciclo inteiro numa revenda de verdade
> — orçamento, envio, aprovação e PDF. Saiu o **pedido 5001**, com duas
> persianas e duas coleções de preços diferentes na mesma folha, e as contas
> foram refeitas **por fora do sistema**, contra o papel: `4,620 m²` subindo
> para o Tubo 41 com redução de peso automática cobrada, `1,000 × 1,000`
> cobrando o mínimo faturado de `1,500 m²`, a cascata da tabela B dando
> `530,29 + 251,75 = 782,04` — a soma das peças fechando com as parcelas
> impressas —, o prazo de quarta 13:31 caindo na quinta 01/10 e a peça de
> tecido fora da estante **entrando marcada**, sem travar.
>
> ⚠️ **E ELA NÃO PROVA O CADASTRO.** Que R$ 110,00 e R$ 140,00 sejam os preços
> certos daquelas coleções é decisão de quem lançou; a folha prova o ciclo e a
> aritmética. A prova que falta — e que fecha a fase — é a **semana em paralelo
> ao Decorsoft**, pedido a pedido. Está escrito assim de propósito: o §10 chama
> verde sem conferência de pior que vermelho, e meia prova escrita como prova
> inteira fecha a pergunta para sempre.

> ⚠️ **A ORDEM DOS `DELETE` DO PEDIDO É A DOS PONTEIROS**, e `sm_pedido_alteracao`
> aponta para o **item** (a troca de degrau e a peça cancelada guardam qual peça
> era). Ele sai antes dele, e não junto dos outros registros, que só apontam para
> o pedido. Com `foreign_keys = ON` o `DELETE` sem filtro só passa quando ninguém
> mais aponta (§12) — foi assim que a limpeza do teste reprovou na primeira
> rodada.

**Rode `cd tecido && npm test` (449 casos) ao mexer em pedido, preço, prazo ou
no catálogo** — 29 casos são do pedido e saem das seções 4.8 a 4.18 da spec, e
3 do acesso (`acesso_operador.test.js`). Mexeu em permissão? **`node
teste_acesso.js` (114) e `node teste_cobertura.js` (10) também.**

### ⚠️ A FASE 4-A (23/09/2026) — A ETIQUETA DE PRODUÇÃO, E O CÓDIGO QUE NASCE COM A PEÇA

A fase 3 congela o pedido; a 4-A o entrega à fábrica. Migração 19 (`sm_setor`,
quatro colunas em `sm_pedido_componente` e `sm_etiqueta_impressao`),
`dominio/etiqueta_producao.js`, `dominio/etiqueta_producao_pdf.js`, a tela
`/sobmedida/producao` e o `backfill_etiquetas.js`.

```
aprovar  →  cada componente que gera etiqueta ganha SER-000123 / COL-000045 / MON / REV / EMB
            (na MESMA transação da ficha congelada)
imprimir →  marca, registra quem imprimiu, e a segunda vez sai com o MESMO código
```

> ⚠️ **O CÓDIGO É DA PEÇA, NÃO DO PAPEL — e essa é a frase inteira da fase.**
> Ele nasce na **aprovação**, junto com a ficha, e não na impressão. Código
> novo a cada papel partiria a história da peça em duas e o tempo do setor
> nunca fecharia; código reaproveitado sairia um dia em duas peças, e aí a
> bancada bipa a peça errada com a etiqueta certa. `atribuirCodigos` é
> **idempotente** (só olha quem tem etiqueta e não tem código), e é por isso
> que o backfill pode ser o **mesmo caminho** da aprovação em vez de uma
> segunda régua.

> ⚠️ **O CONTADOR SOBE NUM `UPDATE ... RETURNING`, e não num `SELECT` seguido
> de `UPDATE`.** Ler e escrever em dois passos abre uma janela entre eles, e
> duas aprovações na mesma janela levam o mesmo número. Duas etiquetas iguais
> em duas peças é exatamente o que a fase 5 (o bipe) não tem como desfazer. O
> índice `UNIQUE` sobre `codigo_etiqueta` é a segunda tranca, não a primeira.

> ⚠️ **O NÚMERO NUNCA VOLTA AO BOLO**, nem quando a peça é cancelada, nem
> quando o código é reatribuído pelo backfill. É a mesma regra do número do
> pedido (fase 3): número que volta é número que um dia sai duas vezes.

> ⚠️ **CADA SETOR TEM O SEU CONTADOR, E ISSO É O DESENHO.** `SER-000001` e
> `COL-000001` convivem, porque a serralheria e a coleção são duas filas
> físicas diferentes e cada uma conta a sua. Um contador só faria o
> serralheiro ler saltos de dezenas entre uma etiqueta e a seguinte, sem nada
> explicando — e número com buraco é o que faz alguém achar que perdeu papel.

> ⚠️ **O QUE VAI ESCRITO É A MEDIDA DE CORTE, NUNCA A ACABADA.** A persiana de
> `1,000 × 1,000` manda a serralheria cortar `0,970` e a coleção cortar
> `0,965 × 1,200`. É a armadilha #18 (§7-B) na bancada: cortar pela medida de
> consumo faz a peça não entrar. A tela do corte escreve isso com todas as
> letras — *"estas são as medidas de CORTE do tecido, não as acabadas"* —,
> porque a lista sozinha tem cara de lista de pedidos.

> ⚠️ **NO TUBO, O NOME DA PEÇA É O DEGRAU.** Sai `TUBO 32 · CORTAR 0,970`, não
> `TUBO`. Tubo 32 e Tubo 41 são peças diferentes na serralheria — diâmetro
> diferente, comprados separados, guardados em lugares diferentes. Escrever só
> "TUBO" mandaria o serralheiro conferir na tela qual é, e a etiqueta existe
> justamente para ele não precisar.

> ⚠️ **REIMPRIMIR SAI COM O MESMO CÓDIGO, e a tela avisa ANTES do clique.** É a
> armadilha #1-B do §2 pela porta da produção: o papel repetido não cria peça
> nova, como a etiqueta de venda reimpressa não baixa estoque de novo. O que a
> reimpressão grava é `reimpressoes` e uma linha em `sm_etiqueta_impressao` —
> história, não peça. **O aviso vem antes do botão**: depois do clique ele
> viraria explicação de um maço que já saiu, e o risco real é o rolo antigo
> continuar na bancada com etiquetas iguais às do novo. Por isso a frase manda
> jogar o anterior fora.

> ⚠️ **A COLUNA DE CADA SETOR MOSTRA "FALTA DE TOTAL", não só o total.** Verde
> quer dizer que já saiu tudo daquele setor; azul, que falta. É o número que
> impede o maço sair duas vezes, e é a mesma ideia do `faltaHoje` do §18: quem
> lê a tela de longe precisa ver o que falta, não o que existe.

> ⚠️ **SÓ SAI ETIQUETA DE PEDIDO APROVADO, E SÓ COM CÓDIGO.** O enviado ainda
> espera o vendedor, e a recusa diz isso. Componente sem código é ou peça que
> não gera etiqueta (os kits), ou pedido aprovado **antes** desta fase — e esse
> é o `backfill_etiquetas.js`, que roda pelo mesmo `atribuirCodigos`, faz
> backup por `await db.backup()` e é idempotente. O pedido 5001, aprovado em
> produção na manhã do dia 23, é exatamente esse caso: sem o backfill ele
> ficaria para sempre sem etiqueta, invisível para a fábrica.

> ⚠️ **SÃO 6 ETIQUETAS NA PERSIANA SIMPLES E 7 COM ADICIONAL — não 8.** A ficha
> tem oito componentes com `gera_etiqueta=1`, e eu contei os oito no plano
> desta fase. Estava errado: **bandô e barra nunca convivem**, e nenhum dos
> dois entra quando `adicional='nenhum'`. O pedido 5001 conferiu o número
> sozinho — 13 etiquetas para duas peças, 6 na lisa e 7 na de bandô. A regra
> aprovada (uma etiqueta por componente que gera etiqueta) não mudou; o que
> estava errado era a minha conta, e ela ficou escrita aqui porque número de
> plano vira expectativa de quem confere o maço.

> ⚠️ **A FILEIRA DE ESCOLHA DO SETOR É A DO `base.css`, E A PRIMEIRA VERSÃO
> TINHA A DELA.** Os cinco botões saíam **idênticos**, sem o azul do escolhido
> e sem o alvo de toque de tablet — só uma linha de texto ao lado dizia qual
> era o setor. É o mecanismo da cor dos três modos da Revisão (§3): ela não é
> decoração, é o que impede imprimir meia hora de maço no setor errado. **Só
> apareceu abrindo a tela**, e nenhum teste do projeto pegaria: o `aria-pressed`
> estava lá, certinho, e sem regra de CSS por trás não pintava nada.

> ⚠️ **E MAIS TRÊS COISAS SÓ APARECERAM NO PRIMEIRO RENDER** — a mesma lição do
> *"23,1 mm em vez de 23,1 mm"* do §4, três vezes no mesmo dia:
> - a tarja **"sem tecido"** era uma coluna **sem cabeçalho**, e só existia na
>   linha que a tinha: as outras ficavam com uma célula a menos e a tabela saía
>   torta, com a tarja pendurada debaixo do cabeçalho de outro setor. Hoje ela
>   mora na célula do pedido, que é de quem ela fala;
> - *"**1 destes pedidos já tiveram** etiquetas"* — o aviso não concordava com o
>   caso de um pedido, que é o normal;
> - o histórico escrevia a **chave** do setor (`5 etiqueta(s) de serralheria`)
>   em vez do nome. Chave de banco na tela da bancada é o *"— Correcao de
>   contagem"* do §2 outra vez.

> **O corte veio junto, e é o que fecha a metade do tecido.** `POST
> /api/producao/para-cortar` devolve as peças dos pedidos escolhidos já em
> **medida de corte**, agrupadas **por tecido** — `plano.calcular` recebe um
> tecido por plano, porque não há emenda e bobina de cor diferente é outro
> estoque. Era exatamente isto que o leitor da etiqueta do Decorsoft já fazia
> (`etiqueta_corte.js`); agora o dado vem do próprio sistema, e o `pedido` que
> vai para o tom único é o número do pedido — que a fase 3 já garantiu estar
> acima do Decorsoft (§4.18).

> ⚠️ **`etiqueta_producao.imprimir` NÃO É `etiqueta_producao.ler`.** Ler é a
> lista, e o vendedor tem: ele precisa saber se a peça dele já foi para a
> bancada. Imprimir é a chave do cortador — quem está com o rolo na
> impressora. É o mesmo arranjo do `kit.imprimir` × `kit.editar` do §4.

> ⚠️ **O DESENHO DO PAPEL MORA NUM ARQUIVO SÓ**, e o CODE128 é o **mesmo**
> `public/barras.js` do PCP e do sob medida — `etiqueta_pdf.js` passou a
> exportar o `desenharBarras` para o novo consumir. A primeira versão tinha uma
> "cópia de emergência" da tabela lá dentro: é a segunda régua do §15 escrita à
> mão, e duas tabelas CODE128 são duas etiquetas no dia em que uma mudar.

> ⚠️ **O CÓDIGO DE BARRAS OCUPA A LARGURA INTEIRA DA ETIQUETA, e isso custou um
> redesenho.** A primeira versão punha o código numa coluna de 38 mm ao lado do
> texto, e o módulo saía em **0,23 mm** — abaixo do que a ZD220 resolve numa
> etiqueta amassada. Hoje ele é uma faixa de 66 mm no rodapé, com o código e o
> setor escritos à direita.

> ✅ **CONFERIDO NO PAPEL EM 23/09/2026 — O LEITOR BIPOU.** O dono fez o deploy,
> rodou o backfill (13 etiquetas do pedido 5001), imprimiu o maço da
> Serralheria e passou o leitor da bancada: **bipou**. É a régua final de
> código de barras, e ela vale mais que os 405 casos verdes — o QR do kit
> passou por três rodadas verdes sem ler em celular nenhum (§4), e foi
> justamente por isso que o "ainda não conferido" ficou escrito aqui até o
> bipe existir.
>
> ⚠️ **E O BIPE PROVA UMA COISA SÓ: que a ZD220 imprime este CODE128 num módulo
> que o leitor resolve.** Ele não prova que a medida escrita é a que a
> serralheria corta — isso é a bancada, com o tubo na mão, e não aconteceu
> ainda. Prova que não foi feita se escreve como não feita: é a lição do §4,
> onde o bipe da etiqueta do kit quase foi dado por certo porque "não havia
> motivo esperado para falhar".

**Rode `cd tecido && npm test` (449 casos) ao mexer em etiqueta de produção,
aprovação ou no plano vindo do pedido** — 16 casos são da etiqueta e travam o
código na aprovação, a idempotência, a reimpressão com o mesmo código, a medida
de corte no papel e a página de 100 × 35 mm (lida pelo `PDFDocument`, não por
regex — pdf-lib comprime os objetos e a contagem por `/Contents` dava zero com
o teste dizendo "passou"). Mexeu em permissão? **`node teste_acesso.js` (114) e
`node teste_cobertura.js` (10) também.** E **abra a tela**: quatro dos defeitos
desta fase não têm teste que os pegue.
