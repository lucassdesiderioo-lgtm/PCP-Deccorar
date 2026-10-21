# História — sob medida (`/sobmedida`)

> **Isto é história, não regra.** A regra vigente de cada assunto está em
> [`docs/regras/sobmedida.md`](../regras/sobmedida.md), em cartões curtos com o
> teste que a trava. Aqui está o PORQUÊ: o defeito que provocou cada regra, as
> datas e as conferências na fábrica.
>
> O texto abaixo saiu do `CLAUDE.md` §19 em 21/10/2026 **sem nenhuma
> alteração**. Esta é a parte 1 de 4: o começo da seção (até a armadilha #17),
> a armadilha #34 e as três regras do fim. As referências do tipo "§10" ou
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
