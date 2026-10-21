# História — sob medida (`/sobmedida`)

> **Isto é história, não regra.** A regra vigente de cada assunto está em
> [`docs/regras/sobmedida.md`](../regras/sobmedida.md), em cartões curtos com o
> teste que a trava. Aqui está o PORQUÊ: o defeito que provocou cada regra, as
> datas e as conferências na fábrica.
>
> O texto abaixo saiu do `CLAUDE.md` §19 em 21/10/2026 **sem nenhuma
> alteração**, em partes. Parte 1: o começo da seção (até a armadilha #17), a
> armadilha #34 e as três regras do fim. Parte 2 (21/10/2026): o catálogo, a
> revenda, o pedido e a etiqueta de produção (fases 1 a 4-A). Parte 3 (21/10/2026):
o consumo, a compra, os setores, o bipe, a recusa, o quadro e os indicadores
(fases 4-B a 6-B). Parte 4 (21/10/2026): o financeiro, as telas e o corte em
etapas. As referências do tipo "§10" ou
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

---

<!-- Do CLAUDE.md §19 — parte 3: fases 4-B a 6-B (consumo, compra, setores, bipe, recusa, quadro, indicadores) -->

### ⚠️ A FASE 4-B (24/09/2026) — O QUE JÁ ESTÁ VENDIDO E AINDA NÃO FOI CORTADO

O painel de tecido sabia quanto tem na estante e quanto **girou** (`giro.js`), e
dizia, com todas as letras, que não faz ponto de pedido. Faltava ali o outro
lado da mesma pergunta: **quanto já está vendido e ainda não foi cortado.**
`dominio/consumo.js` é o dono único disso.

```
giro.js       o que SAIU       (olha para trás)
consumo.js    o que VAI SAIR   (olha para a frente)
gerencial.js  compõe os dois — e não calcula nenhum
```

> ⚠️ **O TECIDO DO SOB MEDIDA NÃO VAI PARA A LISTA DE COMPRAS DO PCP, e isso é
> decisão, não esquecimento.** O estoque dele mora no `tecido.db` e já tem
> painel, mínimo e status. Mandá-lo também para o Compras seria a segunda régua
> da armadilha #12 — duas telas dizendo quanto tecido falta, cada uma certa na
> sua conta, e a divergência aparecendo só no dia da compra. O tubo é outra
> história: **ele é o mesmo material da medida padrão, e Compras é um só**
> (decisão do dono, 24/09/2026) — é a fase 4-C, e depende do vínculo
> `sm_componente` → `componente` do PCP, que hoje não existe.

> ⚠️ **É CONSUMO, NUNCA CORTE.** São os dois números da linha da ficha
> (armadilha #18), e eles nunca fecham. O corte é sempre o mais apertado —
> comprar por ele compra **a menos**, e a bobina acaba no meio de um pedido.
> Caso travando: dobrar a medida de corte não pode mexer num metro do
> comprometido, e foi conferido reintroduzindo o defeito.

> ⚠️ **ELE BAIXA QUANDO A PEÇA É CORTADA.** Número que só sobe vira número que
> a equipe aprende a ignorar, e aí não compra nada. Quem baixa é o plano
> **confirmado** — plano só calculado não consumiu rolo nenhum. O casamento é
> por `(pedido, tecido, medida de corte)`, e é **exato**: a 4-A manda a peça ao
> plano com `largura_corte_mm/1000`, então a medida que chega em `plano_peca` é
> a mesma da ficha congelada. Duas persianas idênticas do mesmo pedido têm a
> mesma chave, e aí tanto faz qual das duas foi cortada.

> ⚠️ **O COMPROMETIDO NÃO É REPARTIDO ENTRE AS BOBINAS.** O pedido escolhe a
> **cor**; quem escolhe a **largura** é o plano de corte, e só na hora de
> cortar. Por isso ele tem lista própria (`por_tecido`) em vez de uma coluna na
> tabela `tecido × largura` — repartir seria inventar a escolha do plano, e é a
> armadilha #17 por dentro. **Na conta de COMPRA somar as bobinas é legítimo**
> (a pergunta é quanto comprar); na de **cobertura**, não (a pergunta é se
> aquela bobina aguenta). São duas perguntas, e o painel responde as duas em
> lugares diferentes.

> ⚠️ **TECIDO COMPROMETIDO E SEM ROLO NENHUM APARECE, em vez de sumir.** O
> filtro da tabela de estoque tira quem não tem saldo nem consumo, e está certo
> para gestão de estoque — mas aqui há venda aprovada esperando por ele, e
> sumir é o silêncio que a §4.10 da spec manda evitar. Na coluna "na estante"
> ele mostra **traço**, nunca `0 m²`: zero se lê como "tinha e acabou", e a
> verdade é "nunca teve" (regra 4 do custo).

> ⚠️ **O "SEM TECIDO" DO PEDIDO É UMA FOTO; O AVISO AO VENDEDOR É DE HOJE — e
> as duas coisas ficam.** A marca gravada no envio explica o prazo que a
> revenda já ouviu. O card **Aprovados esperando tecido** olha a estante
> agora: o rolo pode ter chegado depois, ou — pior — o pedido de ontem pode ter
> comido a bobina que este esperava, e aí o pedido nasceu com tecido e está
> sem. Trocar uma pela outra apagaria a conversa que o vendedor já teve. Era a
> promessa da §4.10 que ficava sem cumprir desde a fase 3: regra escrita,
> codificada, e que não pegava em ninguém — a dívida 18.

> ⚠️ **O PEDIDO INTEIRO ENTRA NO AVISO, e não só a parte que não cabe.** Quando
> dois pedidos disputam a mesma bobina, não dá para dizer qual fica sem: quem
> decide é quem corta, na ordem em que cortar. Escolher no código seria
> inventar uma fila que não existe.

> ⚠️ **E FORAM TRÊS DEFEITOS SÓ NO PRIMEIRO RENDER — de novo, e nenhum tem
> teste de unidade que o pegue:**
> - o aviso dizia *"Pedido 5001 precisa de 7,56 m²"* **e** *"Pedido 5002
>   precisa de 7,56 m²"* — o mesmo número em dois pedidos de tamanhos
>   diferentes, porque era o total do **tecido**. Quem somasse compraria o
>   dobro. Hoje a linha diz o que **este** pedido usa, e o total do tecido vai
>   nomeado embaixo;
> - o **filtro da tela cortava a tabela e não o cartão**: em "Cor: Branco" o
>   cartão somava os 9,54 m² de tudo e a falta só do Branco — dois recortes
>   lado a lado. É o que o comentário do próprio `painel()` já mandava não
>   fazer;
> - a tabela nasceu com `class:'lista'` e `class:'n'`, que são CSS da tela de
>   **produção** e não existem aqui. É a fileira de escolha da 4-A outra vez:
>   classe própria em vez da do `base.css`.

> **Não há chave de permissão nova, e isso é de propósito.** O comprometido
> viaja no `GET /api/painel/gerencial` (`painel.ler`) e o aviso em
> `/api/pedidos/risco/tecido` (`pedido.ler`) — as duas chaves que quem abre
> aquelas telas já tem. Chave nova aqui seria a terceira ponta da armadilha #13
> sem precisar: mais uma coisa para marcar, que ninguém marcaria.

> **A porta para o Compras do PCP ficou de fora, e não é falta.** Sem o vínculo
> do `sm_componente`, ela devolveria uma lista vazia — regra escrita que não
> pega em ninguém, que é a dívida 18 outra vez. Ela nasce na 4-C, junto com o
> cadastro que a torna verdadeira.

**Rode `cd tecido && npm test` (449 casos) ao mexer em `consumo.js`, no
`gerencial.js` ou no que move pedido e plano** — 14 casos são da 4-B, e os dois
que mais importam foram conferidos **reintroduzindo o defeito**: ler corte em
vez de consumo, e não descontar o que já foi cortado. Cada um reprova o caso
que existe para pegá-lo, e só ele. E **abra as duas telas**: três dos defeitos
desta fase só apareceram no primeiro render.

### ⚠️ A FASE 4-C (24/09/2026) — O TUBO CHEGANDO AO COMPRAS, E ELE É UM SÓ

A 4-B mandou o **tecido** para o painel do próprio sob medida. O **tubo** é o
contrário, e a diferença é de dono: ele é o **mesmo material** da medida
padrão, comprado do mesmo fornecedor — decisão do dono em 24/09/2026, *"é o
mesmo tubo, e o compras deveria ser o mesmo"*, mesmo com a produção sendo duas
linhas de trabalho separadas. Separar as compras compraria o mesmo tubo duas
vezes, perdendo escala.

```
tecido/nucleo/materiais.js       IDA:    a lista de material do PCP entra aqui
tecido/dominio/consumo.js        a conta: materialDeCompra()
sobmedida_material.js            VOLTA:  o consumo entra no Compras do PCP
necessidade_dominio.js           soma no mesmo gatilho 2 da medida padrão
```

> ⚠️ **A PEÇA SAI DA CONTA QUANDO A ETIQUETA DELA É IMPRESSA — decisão do dono,
> 24/09/2026, e é a regra desta fase.** Na medida padrão isso se resolve
> sozinho: a peça é embalada, vira estoque, e o `precisa` cai. Aqui o pedido
> **para em `aprovado`**, porque o marco seguinte é o bipe da bancada, que é a
> fase 5. Sem sinal de saída o número **só subiria** — e número que só sobe é
> número que a equipe aprende a ignorar, que é a regra 2 do `consumo.js` pela
> porta do material.
>
> A impressão é o evento mais próximo do tubo que existe hoje: a linha do
> **próprio tubo** carimba `impresso_em` desde a 4-A, então imprimir o maço da
> Coleção não baixa o tubo, e a irmã não impressa do mesmo pedido continua na
> conta. **Custo assumido, escrito aqui para não se descobrir depois:** o maço
> impresso e ainda não cortado conta como produzido. São horas, não dias.
>
> Reimprimir não muda nada — é a armadilha #1-B do §2 pela porta da compra,
> como já era pela porta da produção.

> ⚠️ **O TUBO SE APONTA NO DEGRAU, E O RESTO NO COMPONENTE.** Tubo 32 e Tubo 41
> são itens de estoque diferentes: o material **muda com o degrau**, e o
> `sm_componente` tem uma linha só, chamada "Tubo". Por isso a coluna
> `componente_id` existe nas duas tabelas e a do componente **recusa justamente
> a chave `tubo`**, dizendo para ir à escada — duas afirmações sobre o mesmo
> fato divergem no primeiro dia em que alguém editar só uma. A recusa diz para
> onde ir: trava que só nega é trava que a equipe aprende a contornar (§5).

> ⚠️ **NÃO HÁ FATOR DIGITADO, e isso mudou no caminho.** O plano previa um
> `fator_para_compra` ao lado do vínculo. Quem responde como a peça vira
> quantidade é a **unidade do item do PCP**, lida ao vivo: `m` lê a medida de
> **consumo** da ficha (nunca a de corte — armadilha #18), `un` conta peças. Um
> multiplicador digitado uma vez seria a segunda régua da mesma conta, e a que
> erra em silêncio, porque ninguém o confere depois. Unidade que a peça não
> sabe dizer (kg) é **recusada** no cadastro em vez de convertida por chute.

> ⚠️ **TRÊS COISAS SÃO RECUSADAS NO CADASTRO, E AS TRÊS EVITAM UM NÚMERO QUE
> MENTE.** Material em metro num componente **sem medida de consumo** (somaria
> zero para sempre — a dívida 18 barrada onde alguém está olhando); material em
> metro numa peça que se mede por **largura E altura** (é um retângulo, e metro
> linear não descreve área — é o caso do tecido, que nem vai ao Compras do PCP);
> e componente que **não gera etiqueta**, que nunca sairia da conta.

> ⚠️ **DEGRAU SEM MATERIAL APONTADO VIRA PENDÊNCIA, NUNCA ZERO.** Uma persiana
> sempre tem tubo, então o tubo sempre é esperado: ele não aparecer é um buraco
> na lista de compras, e o comprador precisa saber que o total está incompleto
> (regra 4 do custo). Os outros componentes são o contrário — a maioria é mão de
> obra (montagem, revisão, embalagem) e nunca vira compra: cobrar vínculo para
> todos poria seis pendências por peça na tela, todo dia, e ruído permanente é a
> armadilha #6. Quem os mostra é a **tela de cadastro**, onde alguém está
> olhando para eles.
>
> O mesmo vale para o degrau **renomeado** depois do pedido: o nome que o pedido
> congelou não é achado na escada, e a peça vira pendência com esse nome — em vez
> de sumir da conta em silêncio.

> ⚠️ **SEM A PORTA, A LISTA DE COMPRAS NÃO CALA — MAS TAMBÉM NÃO RECUSA.** Aqui
> a regra do `pessoas.js` ("sem a porta, recusa") **não cabe**: recusar deixaria
> o comprador sem lista nenhuma por causa do sob medida, e o módulo sobe dentro
> de um try/catch justamente para não derrubar a expedição. O que a porta faz é
> **dizer** que o sob medida ficou de fora, com o motivo real — "falhou" sem
> dizer o quê faz alguém procurar no lugar errado a tarde inteira. Caso travando:
> tirar o try/catch reprova três casos.

> ⚠️ **SOMA NO MESMO COMPONENTE, E A ORIGEM VAI EM CAMPO PRÓPRIO.** Os dois lados
> pedem o mesmo tubo, e quem chegasse depois **apagaria** o outro — a fábrica
> compraria metade, e o lado que some é sempre o que chega por último. Já a
> origem é separada: `origem` é por **SKU** e `origem_sobmedida` é por **PEDIDO**.
> Enfiar "pedido 5001" num campo chamado `sku` é mentira de campo, e a tela
> escreveria uma frase que não se confere em lugar nenhum.

> ⚠️ **UNIDADE DIVERGENTE VIRA PENDÊNCIA, NUNCA NÚMERO.** O PCP relê a unidade
> do próprio cadastro e compara com a que o sob medida calculou. Divergiu, não
> soma e diz as duas — somar seria inventar uma conversão que ninguém decidiu.
> O mesmo para material **desativado** em Compras: a pendência diz "desativado",
> senão o comprador vai procurar o erro no sob medida, onde ele não está.

> ⚠️ **E TRÊS COISAS SÓ APARECERAM COM A TELA ABERTA — de novo, e é sempre o
> mesmo tipo:**
> - a pendência é por **peça** no domínio (e tem que ser, porque é a peça que sai
>   da conta), e a tela escrevia a **mesma frase uma vez por peça**: um pedido de
>   quatro persianas do mesmo degrau saía com quatro linhas idênticas. Hoje ela
>   agrupa pelo motivo — *"2 peça(s) · pedido 5002: …"*. Lista que repete o mesmo
>   texto ensina a não lê-la, e aí o motivo diferente passa batido (§7);
> - as frases do domínio do sob medida saíam **sem acento** numa tela do PCP que
>   é toda acentuada. Texto que chega à tela vai acentuado, como o `persiana.js`
>   já fazia;
> - o jar de cookie do `curl` marca o cookie de sessão com `#HttpOnly_`, e o
>   filtro de comentário do script de tela o jogava fora: a tela abria no
>   **login** e parecia que a permissão tinha mudado. Ficou na §12, porque é
>   armadilha de ambiente e custa meia hora toda vez.

> **Não há chave de permissão nova**, e é de propósito: `GET /api/sm/materiais`
> é leitura do catálogo (`catalogo.ler`) e ligar é `catalogo.editar` — as duas
> que quem abre aquela tela já tem. Chave nova aqui seria a terceira ponta da
> armadilha #13 sem precisar.

> ✅ **O CADASTRO ESTAVA FALTANDO, E FOI FEITO EM 24/09/2026.** A escada usa
> 32, 38, 41 e 56, e o PCP tinha **um** tubo cadastrado. O dono criou os três
> em **metro** pelo card Materiais e apontou os quatro degraus:
>
> ```
> Tubo 32 → componente 1 (Tubo 32 mm)     Tubo 41 → componente 28
> Tubo 38 → componente 27                 Tubo 56 → componente 29
> ```
>
> **Quem provou o cadastro foi a pendência sumir**, e não a lista encher:
> antes disso o tubo do 5001 sairia como *"degrau sem material apontado"*.
> Depois, a porta responde `fora:false` com `materiais: []` e
> `pendencias: []` — o vazio do bloco abaixo, agora sem buraco atrás.
>
> ⚠️ **Os três nasceram com mínimo e ideal em ZERO**, e o `Tubo 32 mm` tem 75.
> É intencional enquanto ninguém revisar: zero quer dizer que o gatilho 1 não
> dispara sozinho e a necessidade vem só do que está vendido. São os mínimos
> placeholder das dívidas do §7-B pela porta nova — o dia em que alguém
> preencher os três é uma decisão, não um conserto.
>
> ⚠️ **E NÃO HAVIA ONDE FAZER ESSE CADASTRO — eu mandei o dono a uma tela que
> não existe.** "Admin → Compras → Ponto de pedido" só editava mínimo e ideal
> de material já cadastrado; criar material nunca teve tela em lugar nenhum, e
> os que existem nasceram por `INSERT` à mão. O card **Materiais**
> (Admin → Compras) é de 24/09/2026 e é a armadilha **#33** do §7-B — junto
> com o defeito que abrir a tela teria destapado: a rota apagava família, cor e
> bobina do material de tecido a cada edição de mínimo.
>
> **O caminho, quando entrar um tubo novo na escada:** Admin → Compras →
> **Materiais**, criar em **metro**; depois Sob medida → Catálogo → **Escada de
> tubos**, apontar o material do degrau. A unidade decide a conta — em `un` o
> Compras contaria peças em vez de ler a medida de consumo da ficha.

> **EM PRODUÇÃO DESDE 24/09/2026, E A PRIMEIRA LEITURA DEU VAZIO — o que está
> certo, e por isso ficou escrito.** `materiais: []` e `pendencias: []`: o 5001
> é o único pedido aprovado, e os dois tubos dele (um Tubo 41, um Tubo 32)
> foram impressos em 23/09 às 14:49:33 — pela regra desta fase já saíram da
> conta. Tela vazia se parece com tela quebrada, e quem abrisse sem saber disso
> concluiria que a fase não pegou.
>
> ⚠️ **AINDA NÃO FOI CONFERIDA NA FÁBRICA, e deploy não é conferência.** A
> prova é o próximo pedido aprovado somando na linha certa do Compras, com o
> comprador comprando por ela.
>
> **A LÂMPADA ESTÁ ARMADA desde 24/09/2026, e é o que quase nenhuma regra nova
> tem.** Com os quatro degraus apontados, pedido aprovado que ainda tenha peça
> **não impressa** *tem* que aparecer na lista de compras, somando no tubo do
> degrau dele. Não aparecer é **defeito**, não é silêncio normal — e essa é a
> diferença entre esta fase e as três semanas em que `modelo.sob_medida` ficou
> inerte sem nada acusar (§7, armadilha #30 · dívida 18 do §14).

**Rode `cd tecido && npm test` (449 casos) e `node teste_compras_sobmedida.js`
(29) ao mexer no vínculo, no `consumo.js`, no `necessidade_dominio.js` ou na
lista de compras** — 30 casos são da 4-C, e seis defeitos foram reintroduzidos
um a um para provar que cada caso pega o seu: ler corte em vez de consumo, não
baixar na impressão, engolir o degrau sem material, sobrescrever em vez de
somar, somar com unidade divergente e tirar o try/catch da porta. E **abra as
duas telas**: três dos defeitos desta fase não têm teste que os pegue.

### ⚠️ A FASE 5-A (24/09/2026) — OS CINCO SETORES NO CONTROLE DE ACESSO

A 4-C fechou a compra. A 5 é o que faz o pedido **andar**: hoje ele para em
`aprovado`, e a fábrica não tem como dizer que trabalhou. Esta é a primeira
metade — **o acesso** —, e ela sobe sozinha de propósito: a regra só pega
quando alguém estiver marcado, e regra que depende de caixinha marcada é a
armadilha #30, que ficou três semanas inerte.

**Decisão do dono, 24/09/2026:** *"tem que ser possível a gente criar cada
setor no controle de acesso, e quem tem acesso dentro da empresa por login já
pega seu tablet de manhã e vê o que tem para fazer"*.

```
Admin → Acessos → Setores        Sob medida / Serralheria    0 pessoa(s) · 1 perm.
                                 Sob medida / Coleção        0 pessoa(s) · 1 perm.
                                 Sob medida / Montagem       0 pessoa(s) · 1 perm.
                                 Sob medida / Revisão        0 pessoa(s) · 1 perm.
                                 Sob medida / Embalagem      0 pessoa(s) · 1 perm.
```

> ⚠️ **SÃO CINCO CHAVES, UMA POR SETOR — e não uma chave só de "produção".**
> O bipe grava **quem fez** a peça, e é por ele que a recusa da 5-B vai achar
> a pessoa certa. Uma chave única deixaria o serralheiro bipar a embalagem, e
> a régua apontaria para quem não trabalhou ali. **Régua que aponta a pessoa
> errada é pior que régua nenhuma** — ela acusa com autoridade.

> ⚠️ **AS CINCO SÃO `operacao`, NUNCA `admin`, E ISSO É TRAVA.** É a mesma
> razão da `sobmedida.vender` da fase 2: `sincronizarAreas` põe a área
> `'admin'` em quem tem **qualquer** chave de nível admin, e o portão do
> módulo lê `'admin'` como **diretor**. Um setor declarado admin entregaria
> catálogo, parâmetros do encaixe e descarte de sobra a quem só embala — sem
> ninguém pedir, e sem erro em tela nenhuma. É a porta A da armadilha #28 por
> mais uma porta, e agora por cinco de uma vez.

> ⚠️ **OS CINCO NASCEM VAZIOS, e cada um só com a chave do próprio setor.**
> Ninguém é migrado: herdar gente por engano daria bipe de serralheria a quem
> só revisa. É a mesma regra dos três setores de sob medida que já existiam, e
> dos de Compras.

> ⚠️ **"REVISÃO" E "EMBALAGEM" EXISTEM NOS DOIS MUNDOS, e são trabalhos
> diferentes.** O `Operador / Revisão` revisa a persiana pronta do Mercado
> Livre; o `Sob medida / Revisão` revisa a persiana sob medida antes de
> embalar. O prefixo é o que separa os dois na tela de Acessos — tirá-lo faria
> alguém marcar a caixinha errada e descobrir com o tablet na mão.
>
> Na tela de Acessos os cinco saem em **ordem alfabética** (Coleção,
> Embalagem, Montagem, Revisão, Serralheria), como o resto da lista. Ali é
> cadastro e está certo; **a ordem da fábrica só vale na fila da bancada**, e
> é o `SETORES` do `tecido/nucleo/acesso.js` que a guarda.

### ⚠️ SETOR É CADASTRO, CHAVE É CÓDIGO — e essa fronteira precisa estar escrita

Nome, ordem e prefixo da etiqueta se editam no cadastro `sm_setor` do módulo
(ele existe desde a fase 4-A). **Um sexto setor de produção exige chave nova**
no `permissoes.js` do PCP.

> Gerar a permissão a partir dos setores do `tecido.db` acoplaria os dois
> bancos e furaria a porta única: o PCP passaria a depender do banco do sob
> medida para saber quem pode o quê. E setor de produção novo é mudança de
> **como a fábrica trabalha**, não configuração — passar por código é o certo.
>
> **Isto está escrito porque é exatamente onde alguém tenta "consertar"
> depois**, e o resultado seria a tela deixar criar um setor que não libera
> ninguém: nem erro, nem log, e a pessoa marcada sem conseguir bipar.

### ⚠️ O PAPEL E OS SETORES SÃO DUAS CONTAS, e juntá-las tira a bancada de quem faz duas coisas

| Pergunta | Quem responde | Quantas |
|---|---|---|
| que papel esta pessoa tem no módulo? | `papelDe()` — a área **mais larga** | uma só, sem soma |
| que bancadas ela bipa? | `setoresDe()` — **todas** as áreas de setor | zero ou mais |

```
vende E embala   →  papel VENDEDOR   ·  setores [embalagem]   ·  bipa ✔
corta E embala   →  papel CORTADOR   ·  setores [embalagem]   ·  bipa ✔
só embala        →  papel PRODUCAO   ·  setores [embalagem]   ·  bipa ✔
vendedor puro    →  papel VENDEDOR   ·  setores []            ·  bipa ✘
```

> ⚠️ **DERIVAR UM DO OUTRO É O DEFEITO, e ele só apareceria numa
> segunda-feira.** O papel é sempre a área mais larga; o vendedor que também
> embala sairia como `vendedor` e levaria **403 na bancada** — com o setor
> marcado na tela de Acessos, e sem ninguém entender por quê. Por isso a chave
> `producao.bipar` vem do **setor**, e não do papel.
>
> Isso não é exceção na regra de papel (que seria o começo do terceiro dono,
> §2): é a **definição da chave**, que pergunta *"esta pessoa está em alguma
> bancada?"*. Quem não tem setor nenhum continua sem ela, então a tela não
> aparece no menu de quem não bipa — **menu com tela inútil é o que ensina a
> não clicar**.

> ⚠️ **O DIRETOR BIPA OS CINCO**, por coerência com o `*` das chaves dele:
> recusar o dono numa bancada seria trava disparando no caso normal
> (armadilha #6). O bipe grava o nome de quem fez de qualquer jeito.

> **Rode `node teste_acesso.js` (154 casos, a seção 6-C é esta) e
> `cd tecido && npm test` (450) ao mexer em setor, papel ou permissão.** Os
> quatro defeitos que importam foram reintroduzidos um a um: tirar a linha do
> `PERM_AREA` (a área some sozinha no salvamento), tirar `producao.bipar` do
> `POR_SETOR` (quem vende e embala perde a bancada), o papel `producao` sem
> `modulo.entrar` (o módulo abre em branco com 403 no console) e ordenar os
> setores por nome (a fila leria a ordem do trabalho errada). Cada um reprova
> o caso que existe para pegá-lo.

> ⚠️ **E ELA NÃO PEGA EM NINGUÉM ATÉ ALGUÉM SER MARCADO.** É a armadilha #30
> escrita antes de acontecer: os cinco setores estão na tela com `0 pessoa(s)`
> — enquanto ficarem assim, a fase 5 inteira é texto. **O sinal de inerte é
> este:** marcada a primeira pessoa, ela tem que ver a bancada dela no menu do
> `/sobmedida`. Não ver é defeito, não é silêncio normal.


### ⚠️ A FASE 5-B1 (24/09/2026) — O BIPE, E A FILA QUE SÓ MOSTRA O QUE PODE SER FEITO

A 5-A pôs os cinco setores no controle de acesso; aqui eles ganham o que
bipar. Migração 21 (estado do bipe em `sm_pedido_componente`, `pronto_em` e
`sm_pendencia`), `dominio/producao.js`, `dados/producao.js`,
`rotas/producao.js` e a tela `/sobmedida/bancada`.

```
SERRALHERIA: tubo · base ─┐
COLEÇÃO: tecido ──────────┴─▶ MONTAGEM ─▶ REVISÃO ─▶ EMBALAGEM ─▶ PRONTO
SERRALHERIA: bandô · barra ──────────────────────────────▲
```

> ⚠️ **A 5-B COMO ESTAVA ESCRITA NÃO PODIA VIR PRIMEIRO, e a lista de
> pendências não dizia isso.** A linha dela prometia *"a recusa com motivo →
> setor → pessoa"*, e a §4.16 diz, com todas as letras, que **o sistema sabe
> pelos bipes quem fez aquele componente**. Sem bipe não há quem fez, não há o
> que reabrir e não há de onde recusar. A lista que existe para ser o lugar
> único estava **sem o pedaço maior do que falta** — e a `producao.bipar`
> criada na 5-A era, até aqui, uma chave que nenhuma rota lia (dívida 18).

> ⚠️ **AS LIBERAÇÕES SÃO DADO, NÃO CADEIA DE `if`** — `ANTES`, uma linha por
> setor. A cadeia esconde a regra dentro do código, e a próxima mudança de
> fluxo vira remendo no meio dela.

> ⚠️ **BANDÔ E BARRA NÃO SEGURAM A MONTAGEM, SÓ A EMBALAGEM.** Eles são da
> serralheria, como o tubo — mas entram na hora de fechar a caixa. Pô-los
> também na montagem pararia a linha inteira por uma peça que só é necessária
> no fim. Dois casos travam isso, e reintroduzir o defeito reprova os dois.

> ⚠️ **SÓ SEGURA QUEM EXISTE NAQUELA PERSIANA, E SÓ QUEM GERA ETIQUETA.** A
> peça sem adicional não tem bandô, e exigi-lo a deixaria esperando para
> sempre. A **redução de peso** é componente da montagem e **não tem código**
> (fase 4-A): sem bipe ela nunca termina, e se pudesse segurar alguém a
> montagem esperaria a vida toda.

> ⚠️ **O PRONTO É `pronto_em`, E NÃO UM VALOR NOVO EM `marco` — esta é a
> decisão de risco da fase.** Três lugares filtram por `marco='aprovado'`: a
> reimpressão da etiqueta (`dados/etiqueta_producao.js`) e as **duas** contas
> do comprometido e do material de compra (`dominio/consumo.js`, fases 4-B e
> 4-C). Trocar o marco faria a etiqueta parar de reimprimir e mudaria **em
> silêncio** os números que o comprador usa — um pedido pronto sumiria da
> conta por uma porta que ninguém abriu de propósito. O histórico registra o
> pronto em `sm_pedido_marco`, então o kanban da fase 6 tem de onde ler sem
> que nada mude hoje. **Há caso travando o `marco`.**

> ⚠️ **UM CAMPO SÓ E UM BIPE SÓ: o primeiro inicia, o segundo termina.** Dois
> botões seriam uma escolha a mais para quem está de luva, e a escolha errada
> é trabalho perdido. Na embalagem são **três** (início · kit · fim), pelo
> mesmo campo — o desenho da Embalagem do PCP (§4).

> ⚠️ **O KIT PROVA QUE ENTROU O CERTO, e não que entrou ALGUM.** Na medida
> padrão o QR é fixo e só garante que alguém bipou um kit (§4); aqui cada tipo
> tem código próprio (§4.7), então o kit bandô numa peça lisa é recusado
> dizendo qual é o certo. **Kit sem código cadastrado é recusa, nunca
> "passou"** — deixar passar faria a conferência existir no papel e não pegar
> em ninguém, na peça que já está dentro do plástico.
>
> A comparação **não** é o `public/kit_bipe.js` do PCP, de propósito: lá a
> pergunta é *"isto é o kit?"* contra um link do Drive, aqui é *"é o kit DESTA
> peça?"* contra um CODE128. Duas perguntas diferentes — juntá-las faria a
> regra de uma valer para a outra no dia em que uma mudasse.

> ⚠️ **"NÃO APARECE" NUNCA VIRA "NINGUÉM SABE POR QUÊ".** Bipar um código não
> liberado **responde o que o segura**, com a peça, o setor, quem está com ela
> e desde quando. A frase é parte da regra, não texto de erro — sem ela a
> montagem fica esperando um tubo que já está na bancada.

> ⚠️ **A PENDÊNCIA É DA CHEFIA (`producao.pendencia`), E NÃO FECHA SEM
> MOTIVO.** Se quem bipa pudesse fechar a própria, a trava deixaria de existir:
> bastaria fechar tudo e seguir. E fechamento sem porquê não é rastro — é só
> destravar, e daqui a um mês ninguém sabe o que aconteceu com a peça.
>
> A chave é do **módulo**, não do PCP, e o diretor a recebe pelo `*`: ela não
> tem a terceira ponta da armadilha #13, porque não há caixinha para ninguém
> marcar. Ela não nasce inerte.

> ⚠️ **TRÊS DEFEITOS SÓ APARECERAM ABRINDO A TELA — de novo, e dois deles
> tinham teste VERDE por cima:**
> - a frase escrevia **`colecao`**, a chave do banco, em vez de "Coleção". É o
>   *"— Correcao de contagem"* do §2 outra vez — e o caso que existia passava
>   com o defeito de pé, porque o regex `/colecao/i` casa com os dois. O caso
>   que o pega foi escrito **depois**, e conferido reintroduzindo;
> - a recusa do kit dizia *"sem quantidade de suportes cadastrada"* no **kit
>   tradicional**, que por regra não usa faixa de suporte (§4.7). Aviso que
>   dispara no caso normal é a armadilha #6. Pior: **o caso de teste estava
>   travando o defeito** — ele conferia a palavra "suporte", que só aparecia
>   por causa da frase errada, e reprovou no dia em que ela foi consertada;
> - a ordem dos `DELETE` da limpeza do teste ignorava que `sm_pendencia`
>   aponta para o **componente**: 12 casos reprovaram com `FOREIGN KEY
>   constraint failed` em lugares que não tinham nada a ver com pendência
>   (§12, e é a pegadinha que o `sm_pedido_alteracao` pregou na fase 3).

> ⚠️ **E UM DEFEITO DE VERDADE O TESTE PEGOU SOZINHO: o kit contava no
> PRONTO.** Cada persiana tem **duas** linhas de setor `embalagem` — o
> trabalho de embalar e o **kit** que vai dentro. O kit não tem código, não é
> bipado e nunca termina, então contá-lo deixava o pedido eternamente a uma
> peça do pronto. Os três casos do pronto reprovaram na primeira rodada.

> ✅ **RODADA COMPLETA NA TELA, DAS DUAS FORMAS.** Uma persiana lisa
> atravessou os cinco setores só com bipe (kit errado recusado, kit certo
> aceito), e a do **bandô** provou as duas metades da regra: a montagem andou
> sem ele e a embalagem foi segurada por ele (*"aguardando: Bandô ·
> Serralheria · nem começou"*). Na última persiana saiu **PEDIDO PRONTO**, com
> `pronto_em` gravado e `marco` intacto em `aprovado`. Zero erro de página.
>
> ⚠️ **E ISSO NÃO É A CONFERÊNCIA DA FÁBRICA.** Provou o fluxo e as frases,
> num navegador meu. A prova que fecha a fase é a bancada de verdade, com o
> leitor na mão e a peça na bancada — é a lição do §4, onde o QR passou por
> três rodadas verdes sem ler em celular nenhum.

> **Rode `cd tecido && npm test` (482 casos) ao mexer em `producao.js`, nas
> liberações ou no que move pedido e componente** — 32 são da 5-B1, e cinco
> defeitos foram reintroduzidos um a um para provar que cada caso pega o seu:
> a montagem sem esperar o tecido (reprova 2), o bandô segurando a montagem
> (2), a embalagem aceitando qualquer kit (1), o "o que segura" respondendo
> vazio (6) e o kit contando no pronto (3). Mexeu em permissão?
> **`node teste_acesso.js` (168) e `node teste_cobertura.js` (10) também.**
> E **abra a tela**: três dos defeitos desta fase não têm teste que os pegue.

### ⚠️ A FASE 5-B2 (24/09/2026) — A RECUSA, E ELA ANDA PARA TRÁS PELA MESMA TABELA

A 5-B1 fez a peça andar para a frente; aqui ela sabe voltar. Migração 22
(`sm_motivo_producao`, `sm_recusa` e a coluna `refeitas`),
`dominio/motivo_producao.js`, a recusa no `dominio/producao.js`, o botão na
bancada, o card em Cadastros e o card **Refazer** na Produção.

```
a montagem acha o tubo maior  →  escolhe o MOTIVO, e só ele
                              →  o tubo volta para a Serralheria, marcado REFAZER
                              →  o que foi feito EM CIMA dele volta para "aguardando"
                              →  a etiqueta sai com o MESMO código, em vermelho
```

> ⚠️ **O `ANTES` LIDO NOS DOIS SENTIDOS, e é isso que impede a segunda régua.**
> A mesma tabela que diz *o que libera o quê* (5-B1) diz, lida de trás para a
> frente, **o que é trabalho anterior** — e no sentido normal, **o que tem que
> voltar para "aguardando"**. Uma segunda tabela para a recusa divergiria no
> dia em que o fluxo mudasse, e as duas estariam "certas", cada uma na sua
> régua: é a armadilha #12 dentro da produção.

> ⚠️ **O MOTIVO APONTA O COMPONENTE, E NÃO O SETOR — e isso é divergência da
> letra da spec, anotada lá.** A §4.16 escreve *"Tubo maior → Serralheria"*,
> mas a serralheria faz **quatro** peças (tubo, base, bandô, barra): mandar de
> volta "para a serralheria" ou é ambíguo, ou refaz as quatro — e refazer a
> base porque o tubo veio errado é trabalho jogado fora todo dia, que é a
> armadilha #6. O setor é **consequência** do componente, então não é um
> segundo campo: duas afirmações sobre o mesmo fato divergem no dia em que
> alguém editar só uma.

> ⚠️ **VOLTA O CULPADO E TUDO QUE DEPENDE DELE — NEM MAIS, NEM MENOS.** A mais,
> a serralheria refaz a base por causa do tubo. A menos, a persiana continua
> montada em cima de um tubo que já foi para o lixo. **O bandô recusado não
> derruba a montagem**, pelo mesmo motivo de ele não a segurar na 5-B1: ele
> entra na hora de fechar a caixa, e derrubar ali desmontaria uma persiana
> inteira por uma peça que só é necessária no fim.

> ⚠️ **`refeitas` RESPONDE UMA COISA SÓ: quantas vezes ESTA peça física foi
> feita.** Ela sobe no culpado e em mais ninguém — o que volta atrás dele é
> trabalho refeito, não peça refeita. Quem conta recusa **por setor, por pessoa
> e por motivo** (o indicador da §4.17) é a `sm_recusa`. Duas contas na mesma
> coluna é a armadilha #12 dentro de um número só.

> ⚠️ **QUEM FEZ É RETRATO NA `sm_recusa`, e é o único lugar onde ele sobra.** A
> reabertura acaba de apagar o bipe do culpado — que é justamente o dado de que
> o indicador precisa. O nome do motivo também é retrato: renomear o cadastro
> amanhã não pode reescrever o que aconteceu hoje, que é a mesma regra do
> `vendedor_nome` da revenda (fase 2).

> ⚠️ **O `kit_conferido_em` É LIMPO JUNTO.** Sem isso a persiana refeita
> fecharia a caixa sem o terceiro bipe, e a trava do kit deixaria de existir
> justamente na peça que já deu problema uma vez. Há caso travando que, refeita
> a peça, o kit é cobrado outra vez.

> ⚠️ **O PEDIDO PRONTO DEIXA DE ESTAR PRONTO, E O `marco` NÃO SE MEXE.** Há peça
> voltando para a bancada, então `pronto_em` volta a ser nulo. O `marco`
> continua `aprovado` pela mesma razão da 5-B1: três lugares filtram por ele — a
> reimpressão da etiqueta e as **duas** contas do comprometido e do material de
> compra (fases 4-B e 4-C). A linha `pronto` do histórico **fica**: ela diz que
> o pedido esteve pronto, o que é verdade.

> ⚠️ **A REIMPRESSÃO DA REFEITA É POR CÓDIGO, e não pelo maço do pedido.**
> Reimprimir o maço inteiro para refazer uma peça põe etiquetas repetidas na
> bancada — e duas etiquetas iguais em duas peças é exatamente o que a fase 4-A
> existe para impedir. O **código é o mesmo de sempre** (ele é da peça, não do
> papel), e é justamente por isso que o papel sai **marcado em vermelho**:
> `REFAZER 2ª VEZ`, no canto de cima. Sem a marca ficam duas etiquetas iguais na
> bancada e nada dizendo qual é a da peça boa.

> ⚠️ **RECUSAR É `producao.bipar`, E NÃO CHAVE DA CHEFIA.** A §4.16 diz, com
> todas as letras, que **qualquer** setor recusa por defeito do trabalho
> anterior — quem está com a peça na mão é a bancada. O que impede o abuso não é
> permissão, é o rastro. (Fechar **pendência** continua sendo da chefia, que é
> outra coisa: ali a peça é dada como feita **sem** o bipe de quem fez.)

> ⚠️ **A LISTA DE MOTIVOS DA BANCADA É DESTA PEÇA, E ISSO SÓ APARECEU ABRINDO A
> TELA.** A primeira versão oferecia os oito motivos cadastrados na bancada da
> Montagem, dois deles impossíveis dali: *"Montagem torta"* é o **próprio**
> trabalho e *"Revisão deixou passar"* vem **depois**. Quem está de luva toca
> "Montagem torta" achando que é *"a montagem está torta, refaz"* — e leva
> recusa. **Escolha que só serve para dar erro é a armadilha #6 dentro de uma
> lista**, e nenhum caso de unidade a pega: as guardas do servidor estavam
> certas e verdes.
>
> As guardas **ficam** (a rota é chamável por fora — é a lição do `kit_ok` da
> armadilha #26). O que mudou é a tela parar de oferecer o que ela já sabe que
> não passa: três filtros, os mesmos três que o `recusar` confere — vir
> **antes**, **existir** nesta persiana e estar **pronto**.
>
> ⚠️ **E LISTA VAZIA DIZ POR QUÊ.** São três razões diferentes e cada uma manda
> para um lugar diferente: *esta é a primeira bancada desta persiana* · *não há
> motivo cadastrado, quem cadastra é a chefia* · *nada do que vem antes está
> pronto, a chefia resolve pela pendência*. "Nada aqui" se parece com tela
> quebrada, e quem está com a peça na mão não tem como saber a diferença.

> ⚠️ **O CADASTRO NASCE COM OS OITO MOTIVOS DA PRÓPRIA SPEC.** Tabela vazia
> faria o botão "Recusar" abrir uma lista sem nada — regra escrita, codificada,
> e que não pega em ninguém: a dívida 18 (§14) pela porta do cadastro. A chefia
> edita, acrescenta e desativa; o que ela apagar fica apagado. **Motivo com
> recusa atrás não se apaga** — a exclusão recusa dizendo quantas, como todo
> cadastro do módulo.

> ⚠️ **E SÃO DOIS CADASTROS DE MOTIVO QUE NÃO SE MISTURAM.** A `motivo_recusa`
> que já existia é do **plano de corte** (por que o cortador não usou a sobra
> sugerida); a `sm_motivo_producao` é da **bancada**. Juntar as duas misturaria
> *"o plano não conseguiu cortar"* com *"a montagem achou o tubo maior"*, e os
> relatórios das duas ficariam errados. Está escrito assim na §4.16 da spec, e
> os dois cards ficam na mesma tela com o subtítulo dizendo de qual mundo cada
> um é.

> ⚠️ **AS FRASES DO DOMÍNIO SAEM ACENTUADAS.** Elas aparecem numa tela do PCP e
> do módulo que são todas acentuadas, e a primeira versão saiu em ASCII —
> *"A peca nao tem etiqueta"* ao lado de *"Redução de peso"* na mesma frase. É a
> armadilha da fase 4-C outra vez, e ela só aparece com a tela aberta.

> ✅ **O CICLO INTEIRO RODOU NA TELA EM 24/09/2026** — bipe na Montagem →
> Recusar → os **quatro** motivos possíveis (dos oito cadastrados) → confirmar →
> o tubo de volta na fila da Serralheria com a tarja vermelha **REFAZER**, e as
> outras três peças sem marca → o card **Refazer** na Produção com o motivo e
> quem recusou → o PDF com **REFAZER 2ª VEZ** em vermelho e o mesmo
> `SER-000001`.
>
> ⚠️ **E ISSO NÃO É A CONFERÊNCIA DA FÁBRICA.** Provou o fluxo e as frases, num
> navegador meu. A prova que fecha a fase é a bancada de verdade recusando uma
> peça, com o maço de refazer saindo da Zebra — é a lição do §4, onde o QR
> passou por três rodadas verdes sem ler em celular nenhum.

> **Rode `cd tecido && npm test` (511 casos) ao mexer em `producao.js`, no
> `motivo_producao.js`, nas liberações ou na etiqueta de produção** — 29 são da
> 5-B2, e **nove defeitos foram reintroduzidos um a um** para provar que cada
> caso pega o seu: recusar o próprio trabalho (reprova 1), recusar o que não é
> anterior (2), reabrir só o culpado (4), reabrir demais (4), não desfazer o
> `pronto_em` (1), não limpar o kit (1), motivo de peça sem etiqueta (1),
> `refeitas` em todos os reabertos (2) e não gravar quem tinha feito (1).
> Mexeu em permissão? **`node teste_acesso.js` (168) e `node teste_cobertura.js`
> (10) também.** E **abra as três telas**: a mudança da lista de motivos não tem
> teste que a pegue.

### ⚠️ A FASE 6-A (24/09/2026) — O QUADRO, E A ETAPA QUE NÃO SE GRAVA

A fase 5 fez a peça andar; aqui o **pedido** aparece. Migração 23
(`sm_kanban_coluna`), `dominio/kanban.js`, `dados/kanban.js`,
`rotas/kanban.js` e a tela `/sobmedida/kanban`. É o *"onde está o pedido X"*
do pronto-quando da fase 6 — e é o que torna visível o que a 5-B1 passou a
gravar: até aqui o andamento de um pedido só se via abrindo a bancada de cada
setor, um por um.

```
Em edição │ Enviado │ Aprovado │ Em produção │ Pronto │ Cancelado
          │         │          │  Ser 2/2 Col 1/1     │
          │         │          │  Mon 0/1 Rev 0/1 Emb 0/1
```

> ⚠️ **A ETAPA É DERIVADA, NUNCA GRAVADA — e isso é a dívida 15 da spec
> vencendo.** Ela sai de `marco` + `pronto_em` + os bipes, e **não há coluna
> `etapa` no `sm_pedido`**. Uma coluna gravada seria a segunda afirmação sobre
> o mesmo fato, e divergiria do `pronto_em` no primeiro bipe que ninguém
> replicasse: é a armadilha #12 dentro do quadro. Há caso travando que a
> tabela não ganhou a coluna.
>
> **E o `marco` NÃO virou `pronto`.** A dívida 15 dizia *"o kanban da fase 6
> lê o histórico; se um dia o marco precisar do valor, é decisão de lá, com as
> três leituras na mesa"*. A decisão é **não**: três lugares filtram por
> `marco='aprovado'` — a reimpressão da etiqueta e as **duas** contas do
> comprometido e do material de compra (4-B e 4-C) —, e trocar mudaria em
> silêncio os números que o comprador usa. O quadro **só lê**.

> ⚠️ **AS COLUNAS SÃO LIVRES, AS ETAPAS NÃO.** É a frase da própria spec, e o
> motivo está escrito lá: *"renomear 'Em produção' desligaria a trava em
> silêncio"*. O **nome** é cadastro (`sm_kanban_coluna`); o que a coluna
> **aponta** é a lista fechada do `dominio/kanban.js`, que é código. Renomear
> não mexe na etapa, e há caso travando.
>
> **Etapa que não existe é recusada dizendo quais existem** — sem isso quem
> cadastra tenta de novo com outro palpite, e a trava vira adivinhação. E
> **duas colunas na mesma etapa** são recusadas: mostrariam o mesmo cartão
> duas vezes, e quem vê o pedido em dois lugares para de confiar na tela
> inteira.

> ⚠️ **A LISTA DE ETAPAS NÃO É A LISTA DE MARCOS DA SPEC, e são três
> diferenças, as três decisão:**
>
> | | |
> |---|---|
> | `edicao` no lugar de `orcamento` | o pedido **reaberto** (fase 3) volta a `marco='rascunho'` e **continua com o número dele**: chamar aquilo de "orçamento" seria mentira na tela. Os dois estão sendo editados e nada foi prometido — é a mesma etapa, e o número no cartão separa um do outro |
> | `cancelado` **entrou** | não está na lista da spec, e é resposta legítima para "onde está o pedido X" — é o único estado em que um pedido some sem ter ido a lugar nenhum |
> | `entregue` **não entrou** | nada no sob medida marca entrega hoje, e coluna que nunca recebe cartão é paisagem — a dívida 18. Ela nasce na 6-C, junto com o boleto e a NF, que são o que a torna verdadeira |

> ⚠️ **PEDIDO NÃO SOME DO QUADRO EM SILÊNCIO.** Desativar uma coluna não pode
> fazer trabalho desaparecer de uma tela que responde *"onde está o pedido
> X"*: o pedido vira **aviso no topo**, com a etapa nomeada e a contagem, e o
> total do título continua contando ele. **Etapa sem pedido nenhum não vira
> aviso** — aviso que aparece todo dia sem nada atrás é paisagem, e aí ninguém
> o lê no dia em que ele significa alguma coisa (a regra do card de caixa de
> várias peças do §5).

> ⚠️ **A BARRINHA NÃO CONTA O KIT NEM A PEÇA CANCELADA.** Cada persiana tem
> **duas** linhas de setor `embalagem` — o trabalho e o kit que vai dentro —, e
> o kit não tem código, não é bipado e nunca termina: contá-lo deixaria a
> barrinha eternamente a uma peça do fim. Foi exatamente o defeito que o teste
> da 5-B1 pegou no Pronto. A peça cancelada sai pela mesma razão: ela fica na
> lista do pedido (§4.10) e não é trabalho.
>
> **E quem ainda não tem ficha não tem barrinha.** A ficha só é explodida na
> **aprovação** (fase 3): antes disso não há componente nenhum, e uma barrinha
> zerada diria *"nada foi feito"* quando a verdade é *"ainda não há o que
> fazer"*.

> ⚠️ **`pronto_em` NASCEU NA 5-B1 E NENHUMA TELA O LIA.** A coluna existia, o
> bipe a gravava, e o `pedido.porId` não a devolvia — quem abrisse o pedido não
> tinha como saber que ele estava pronto. É a dívida 18 pela porta do **leitor
> que faltava**, e o quadro foi o primeiro a precisar dele: sem isso a etapa
> `pronto` nunca aparecia. Achado com o teste vermelho na mão.

> ⚠️ **O QUADRO É `painel.ler`, E NÃO `pedido.ler`.** Ele responde a pergunta
> inteira — a fábrica toda, com o valor de cada carteira. `pedido.ler` está no
> **vendedor**, e daria a ele o quadro das revendas dos colegas; a fila dele
> continua em `/pedidos`, que é a lista de trabalho dele. O pronto-quando da
> fase 6 é *"o DONO responde pela tela"*. **E não nasce chave nova**: o
> cadastro das colunas é `cadastro.ler`/`cadastro.editar`, as mesmas de quem já
> abre a tela de Cadastros, onde o card mora.

> ⚠️ **CINCO COISAS SÓ APARECERAM ABRINDO A TELA — e nenhuma tem teste de
> unidade que a pegue sem o render:**
> - **`R$ 0,00` no orçamento.** O valor do cartão é o que o **envio** congelou
>   (fase 3): o orçamento não tem nenhum e o reaberto perdeu o dele. Zero se lê
>   como *"de graça"*, e a verdade é *"não vale nada AINDA"* — é a regra 4 do
>   custo, e foi o mesmo defeito que só apareceu renderizando a tela na fase 3.
>   Hoje a linha não existe, e o total da coluna é **piso** (`≥`) quando parte
>   dos cartões não tem valor;
> - **a barrinha cortada.** Cinco setores numa coluna de cartão não cabem numa
>   linha só, e o último chip era empurrado para fora da borda — o número sumia
>   e o cartão ficava com cara de certo. É o `ellipsis` que come a tarja (§12)
>   por outra porta. Hoje ela **quebra**;
> - **a largura de leitura.** O `.corpo` do `base.css` tem 1100 px porque é
>   largura de **texto**; um quadro não é texto, e com ela o dono via quatro das
>   seis colunas e tinha que rolar para achar "Pronto" e "Cancelado", que são as
>   duas pontas da história. Esta é a única tela do módulo que sai dessa
>   largura, e o porquê está escrito nela;
> - **o selo de retido no cartão CANCELADO.** "Retido" quer dizer parado
>   esperando alguma coisa, e o cancelado não espera nada;
> - **"1 pedido(s) em Em produção"** no aviso — a concordância e a preposição
>   colada no nome da etapa. É o *"1 destes pedidos já tiveram"* da 4-A outra
>   vez.

> **Rode `cd tecido && npm test` (536 casos) ao mexer no `kanban.js`, no que
> move pedido, bipe ou coluna** — 25 são da 6-A, e **sete defeitos foram
> reintroduzidos um a um** para provar que cada caso pega o seu: o cancelado
> deixando de vencer o pronto, a barrinha contando o kit, a barrinha contando a
> peça cancelada, o pedido sumindo em silêncio, duas colunas na mesma etapa,
> etapa inexistente aceita e a barrinha aparecendo antes da aprovação. Mexeu em
> permissão? **`node teste_acesso.js` (168) e `node teste_cobertura.js` (10)
> também.** E **abra a tela**: cinco dos defeitos desta fase não têm teste que
> os pegue.

### ⚠️ A FASE 6-B (26/09/2026) — OS SETE INDICADORES, E A RÉGUA DO BIPE QUE NÃO PRESTA

A 6-A respondeu *onde está o pedido*; aqui vêm os números. **Nenhuma tabela
nova**: os sete somam o que as fases 3, 5-B1 e 5-B2 já gravam. Migração 24
(só o parâmetro `bipeAbertoMaxHoras`), `dominio/indicadores.js`,
`dados/indicadores.js`, `rotas/indicadores.js` e a tela
`/sobmedida/indicadores`.

```
aprovação · parados · prazo cumprido · horas-homem · tempo por m²
produtividade · recusas          (o crédito é boleto, e boleto é a 6-C)
```

> ⚠️ **A RÉGUA DO BIPE SUSPEITO É UMA SÓ, e é por isso que ela é aplicada uma
> vez sobre a lista.** *"Esqueceu de bipar o fim e foi almoçar: a peça levou
> três horas"* está escrito na própria §4.17 da spec. Horas-homem, tempo por
> m² e produtividade são **três perguntas sobre a mesma lista de bipes**; três
> filtros separados seriam três réguas para *"este tempo presta?"*, e elas
> divergiriam no dia em que alguém mexesse numa só — a armadilha #12 dentro de
> um número. `marcarSuspeitos` roda uma vez, e os três leem a marca.
>
> E ela pega **também o bipe que FECHOU demorando demais**, não só o que ficou
> aberto — divergência anotada na spec. O exemplo da §4.17 é de um bipe que
> fechou: a pessoa voltou do almoço e bipou o fim. Um limite que só olhasse o
> aberto não pegaria o caso que a regra existe para pegar.

> ⚠️ **O LIMITE É CADASTRO, E NASCE CHUTADO — está escrito assim de propósito.**
> `bipeAbertoMaxHoras` nasce em **2 h**, e esse número não mede nada: é um teto
> para o ruído, abaixo do exemplo de três horas da spec. **Ninguém sabe ainda
> quanto leva cada bancada**, porque ela começou a bipar em 24/09/2026.
> Escrevê-lo no código faria o chute parecer decidido, que é a doença dos
> *"mínimos são placeholder"* do `COMPRAS.md`. A faixa recusa **zero** (com ele
> TODO bipe vira suspeito, os três indicadores nascem vazios e a tela diz
> "ninguém bipou ainda" com a fábrica trabalhando) e recusa acima de **24 h**
> (aí ele deixa de pegar o esquecimento).

> ⚠️ **NÚMERO INCOMPLETO NÃO VIRA NÚMERO CERTO.** Persiana com bipe descartado
> tem a soma **menor** do que foi; entrar na média a puxa para baixo em
> silêncio. Ela é contada à parte e **dita** na tela — é a regra 4 do custo
> (§7-B) pela porta do tempo. A produtividade é a exceção, e é definição: o
> grão dela é o **bipe**, não a peça completa. Cobrar de quem corta tubo que a
> persiana tenha chegado à embalagem seria medir uma pessoa pelo trabalho das
> outras quatro.

> ⚠️ **O m² É O REAL, NUNCA O COBRADO.** `m2_cobrado_mm2` carrega o mínimo
> faturado de 1,5 m² (§4.8 da spec): pelo cobrado, a persiana de 1,000 × 1,000
> — 1 m² de trabalho e 1,5 de fatura — pareceria mais rápida por m² do que é.
> A bancada corta o real. É a armadilha #18 (corte × consumo) numa terceira
> porta: dois números na mesma linha, e usar um no lugar do outro.

> ⚠️ **PRAZO CUMPRIDO SÃO DOIS NÚMEROS, NUNCA UM.** Prometido e negociado
> separados — somados, o pedido empurrado pareceria entregue em dia. É a mesma
> razão de o prometido não ser sobrescrito quando alguém renegocia (§4.9). E
> porcentagem sem pedido pronto é **`null`**, nunca zero: *"cumpriu 0%"* é uma
> afirmação, e ela seria falsa.

> ⚠️ **A RECUSA CONTA NO SETOR DO CULPADO.** A `sm_recusa` guarda `recusado_de`
> (a bancada que **achou** o erro) e o `componente_id` (o culpado); o setor sai
> do JOIN. A pergunta é *de onde vem o defeito* — contar em quem recusou seria
> uma régua que acusa justamente quem fez o trabalho de pegar o erro. A
> **pessoa** é `feito_por`, que só sobrevive ali: a reabertura apaga o bipe do
> culpado, que é o dado de que o indicador precisa (§19, 5-B2).

> ⚠️ **A JANELA NÃO PRECISA DO CORTE DO `giro.janela()`, e saber por quê é o
> ponto.** Lá a janela apara no primeiro consumo porque o divisor é **dias**:
> janela maior que a história divide por dias que não existiram e o número sai
> menor que a verdade (armadilha #16). Aqui nenhum indicador divide por dia —
> divide-se por peça, por m² e por pessoa. Janela larga só inclui trabalho
> velho. Mas ela **vai escrita ao lado dos números** do mesmo jeito.
>
> Os **parados na aprovação** ficam de fora do filtro, de propósito: pedido
> parado há dois meses é justamente o que não pode sumir por causa de um
> recorte. O mesmo vale para o bipe esquecido em aberto — ele é pendência
> hoje.

> ⚠️ **TEMPO DE APROVAÇÃO É MEDIANA, E É TEMPO CORRIDO.** Um pedido enviado
> sexta 18h e aprovado segunda 9h leva 63 h de relógio e cerca de uma de
> expediente. Numa amostra de cinco, a **média** dispara para 13 h — maior que
> quatro dos cinco casos — e nada na tela diria por quê. O **maior** vai ao
> lado, para ninguém confundir mediana com teto. *"Horas úteis"* exigiria um
> cadastro de expediente que não existe, e inventá-lo seria um número com cara
> de medido; os **dias de fábrica** vão junto, porque é assim que a pergunta é
> feita em voz alta: *"leva um dia"*.

> ⚠️ **EM PRODUÇÃO A TELA NASCE VAZIA, E ISSO É A VERDADE.** A bancada começou
> a bipar em 24/09/2026 e ninguém bipou uma peça real ainda. Os sete blocos
> saem sem número — e vazio se parece com tela quebrada, que é a lição da 4-C.
> A tela separa **duas causas com conselhos opostos**: *"ainda não há pedido
> aprovado"* manda esperar; *"houve, mas nenhum nos últimos 90 dias"* manda
> mudar o filtro. E a explicação longa aparece **uma vez**, num cartão no topo,
> só quando a tela inteira está vazia: repetida nos sete blocos virava um muro
> do mesmo parágrafo, e texto que se repete ensina a não lê-lo. Ela também diz
> **quando o vazio é defeito** — se a bancada já trabalha e nada aparece, o
> lugar de olhar é Admin → Acessos.

> ⚠️ **E SETE COISAS SÓ APARECERAM ABRINDO A TELA** — nenhuma tem teste de
> unidade que a pegue, e é sempre o mesmo tipo:
> - datas em `2026-09-20` numa tela brasileira — o formato do banco vazando
>   para quem lê, que é o *"— Correcao de contagem"* do §2;
> - *"1 bipe(s) continuam abertos"* e *"2 persianas ficaram de fora: ou ainda
>   não **passou**"* — concordância, e **meia** concordância lê-se pior que
>   nenhuma. É o *"1 destes pedidos já tiveram"* da 4-A;
> - *"parado há **266,87 h**"* — número que ninguém segura na cabeça;
> - os **dois percentuais do prazo**, que existem para serem lidos juntos,
>   esticados para as pontas opostas de 1100 px por um `flex:1`;
> - **"Serralheria" com dois totais de horas na mesma tela** — 2,17 h no bloco
>   de m² e 3,25 h na Produtividade. As duas estão certas (lá é todo bipe
>   válido, aqui só o de persiana inteira), e sem a frase que diz isso é a
>   mesma tela dizendo duas coisas — o `faltaHoje` × `precisa` do §18;
> - o muro do parágrafo repetido no estado vazio, acima.

> **Não há chave de permissão nova**, e é de propósito: a tela é `painel.ler`,
> a mesma do Quadro. Chave nova seria a terceira ponta da armadilha #13 sem
> precisar. E é **uma rota só** para as sete perguntas: sete rotas seriam sete
> idas com sete janelas podendo divergir.

> ⚠️ **AINDA NÃO FOI CONFERIDA PELO DONO, e deploy não é conferência.** O
> pronto-quando da fase 6 é ele respondendo *pela tela* *"quanto o Renato leva
> para aprovar"* e *"quanto tempo leva uma persiana por m²"*. O que rodei foi
> num navegador meu, com pedido semeado — e a prova **depende da bancada bipar
> de verdade**: enquanto isso não acontecer, os três indicadores de tempo saem
> vazios, e ali o vazio é a verdade, não defeito.

> **Rode `cd tecido && npm test` (567 casos) ao mexer em `indicadores.js`, no
> `config.js` ou no que grava bipe, prazo e recusa** — 31 são da 6-B, e **oito
> defeitos foram reintroduzidos um a um** para provar que cada caso pega o seu:
> contar o bipe suspeito (reprova 4), usar o m² cobrado (2), juntar prometido e
> negociado (1), contar a recusa em quem recusou (1), média no lugar da mediana
> (1), contar o kit como peça da persiana (8), apagar a diferença entre "nunca"
> e "no período" (1) e deixar a peça com bipe descartado entrar na média (2).
> Mexeu em permissão? **`node teste_acesso.js` (204) e `node teste_cobertura.js`
> (10) também.** E **abra a tela, cheia E vazia**: sete dos defeitos desta fase
> não têm teste que os pegue.

---

<!-- Do CLAUDE.md §19 — parte 4: o financeiro (6-C1, 6-C1b, 6-C1c), as telas e o corte em etapas -->

### ⚠️ A FASE 6-C1 (26/09/2026) — O BOLETO, E O NÚMERO QUE MENTE PARA CIMA

```
limite disponível = limite − boletos em aberto      ← MOSTRA, NÃO TRAVA
```

Migração 25 (`sm_boleto`), `dominio/boleto.js`, `dados/boleto.js`,
`rotas/boleto.js`, a tela `/sobmedida/financeiro`, o crédito na ficha da
revenda e o **selo de crédito estourado** no Quadro — o gancho que a 6-A
deixou escrito.

> **A revisão bimestral do limite JÁ EXISTIA desde a fase 2** e não foi
> refeita: `limite_revisado_em`, o parâmetro `creditoRevisaoMeses`, o cálculo
> de `limite_vencido` e o botão *"Revisei — está bom assim"*. Está escrito
> porque a linha da fase prometia as três coisas, e quem lesse o plano
> esperaria trabalho onde não havia.

> ⚠️ **O TÍTULO É LANÇADO À MÃO, NUNCA GERADO AQUI.** O boleto de verdade
> nasce no banco, com número e código de barras próprios; um número inventado
> nesta casa seria a **segunda régua contra o extrato** (armadilha #12), e a
> que erra se descobre na cobrança de um cliente.
>
> O caminho do **espelho** — o outro sistema exporta os títulos em aberto e
> este lê, como a planilha do ML no Planejamento (#11) e o PDF do ML na
> expedição — foi posto na mesa em 26/09/2026 e **o dono decidiu lançar aqui**.
> Se um dia ele voltar, o importador se escreve **contra um arquivo real**: o
> `parse.js` nasceu do PDF de verdade, e leitor feito contra formato imaginado
> é régua própria, que funciona no teste e quebra no arquivo.

> ⚠️ **O MODO DE FALHAR DESTE DESENHO É O OTIMISTA, E ESTÁ ESCRITO ANTES DE
> ACONTECER.** A §4.13 da spec avisa que *"sem baixa, o limite de todo mundo
> zera"*. Com lançamento à mão o risco é o **contrário e pior**: ninguém
> lança, o "em aberto" fica zero e o disponível fica **igual ao limite** — uma
> mentira que **não parece erro**, porque o número só fica maior. Por isso o
> crédito devolve `ultimo_movimento`, e as duas telas escrevem, **só quando o
> dado é velho**, há quantos dias ninguém mexe naquela revenda: número sem a
> janela ao lado engana (armadilha #16).

> ⚠️ **MOSTRA, NÃO TRAVA — decisão do dono de 22/09/2026.** Não há uma linha
> no domínio do pedido que leia crédito, e isso não é esquecimento: não se
> perde venda. Pedido de revenda estourada entra e é aprovado do mesmo jeito;
> o que muda é a **cor**. Há caso travando, para ninguém acrescentar a trava
> depois sem decidir — e a §4.13 explica por que ela não entra antes de a
> baixa estar sendo feita de verdade (é a armadilha #6).

> ⚠️ **NEGATIVO FICA NEGATIVO.** Zerar apagaria o **tamanho** do buraco: dois
> mil estourados e um real estourado ficariam iguais na tela. É o `MAX(0, …)`
> do saldo do PCP (§2) pela porta do crédito, e a mesma regra do prazo vencido
> da fase 3.

> ⚠️ **SEM LIMITE LANÇADO, O DISPONÍVEL É `null`** — nunca zero e nunca "o que
> ela deve". É a regra 4 do custo (§7-B): número indefinido não vira número
> certo. E **não se estoura um limite que não existe**: a revenda sem limite
> não ganha selo no Quadro.

> ⚠️ **PAGO E CANCELADO SAEM DA CONTA; VENCIDO FICA.** Tirar o vencido faria o
> limite de quem **não** paga parecer mais folgado que o de quem paga em dia —
> exatamente ao contrário. O vencimento é **marca**, não segunda conta, e o
> valor vencido sai à parte. E a `situacao` é **derivada** de `cancelado_em` e
> `pago_em`, nunca uma coluna: duas afirmações sobre o mesmo fato divergem no
> dia em que alguém escrever numa só.

> ⚠️ **NÚMERO REPETIDO NA MESMA REVENDA É O MESMO TÍTULO LANÇADO DUAS VEZES**,
> e ele come o limite dela em dobro. O modo de falhar é **pessimista**: o
> vendedor para de vender achando que a revenda estourou, e ninguém procura o
> motivo num boleto a mais. Em **outra** revenda o mesmo número passa — o
> número é do banco dela, e dois bancos repetem número sem erro nenhum.

> ⚠️ **"APROVADO SEM BOLETO" SÓ VALE PARA QUEM PAGA EM BOLETO.** *"Nem todo
> pedido fazemos boleto — às vezes o cliente paga por PIX, às vezes por
> cartão"* (dono, 26/09/2026). Cobrar título de quem paga no cartão é aviso
> disparando no caso normal, e aviso assim some junto com a lista inteira
> (armadilha #6). É a segunda metade da pergunta 6 da §8 da spec — *"os dois,
> mostrados separados"* —, e ele **não entra no disponível**: não é dívida, é
> compromisso que ainda não virou título.

> ⚠️ **A BAIXA SE DESFAZ, E COM MOTIVO.** Baixa dada na linha errada acontece,
> e sem caminho de volta o jeito vira lançar o título de novo — que é número
> repetido, e aí a conta dobra. Trava que sabe acusar e não sabe liberar é
> trava que a equipe contorna (§5). Baixar **duas vezes** é recusado: a
> segunda sobrescreveria quem deu a primeira, e o rastro viraria dois.

> ⚠️ **TODO CAMPO DE DINHEIRO COMEÇA COM `valor_`, e `estourado` NÃO.** A poda
> do `custo.js` corta por **padrão de nome** (§19): um `em_aberto_centavos`
> não casaria com `preco|valor|custo|nf|fornecedor` e viajaria pelo fio para
> quem não tem `custo.ver`. E a **marca** não é dinheiro de propósito: ela
> sobrevive à poda e acende o selo para quem só vê a cor.

> **Duas chaves: `boleto.ler` (o vendedor, pela tarefa semanal da §4.13) e
> `boleto.editar`.** A segunda **não está em papel nenhum** — hoje quem lança
> e baixa é o diretor, pelo `*`. Inventar um papel "financeiro" exigiria área
> no PCP, linha no `PERM_AREA` e alguém marcado (as três pontas da armadilha
> #13) para uma caixinha que ninguém marcaria. O dia em que houver financeiro
> com login próprio, a área nasce lá.

> ⚠️ **E QUATRO COISAS SÓ APARECERAM ABRINDO A TELA:**
> - **a tarefa semanal saía em ordem ALFABÉTICA**, com quem está em dia acima
>   de quem estourou. Lista de trabalho se lê de cima para baixo — é a regra
>   da tela azul do operador (§3) e do atrasado do Carregamento (#9);
> - **a janela escrita em toda revenda virava paisagem**: quatro linhas
>   idênticas de *"último lançamento em 26/09"*. O sinal é o dado **velho**,
>   não o fresco;
> - **o formulário pedia o valor em CENTAVOS**, enquanto o catálogo, o
>   simulador e as revendas pedem em reais e convertem por soma — duas telas
>   pedindo o mesmo dinheiro de jeitos diferentes ensinam a equipe a achar que
>   são coisas diferentes (§4);
> - **os dois selos do Quadro saíam GRUDADOS**
>   (`RETIDO · SEM TECIDORETIDO · CRÉDITO ESTOURADO`). Enquanto havia um selo
>   só, o espaçamento nunca tinha sido exercitado: é o `📦2 peças` grudado do
>   §5, e nenhum teste de unidade o pega — o texto está perfeito, quem está
>   errado é a distância.

> ⚠️ **A 6-C2 (NF E ENTREGA) NÃO FOI CONSTRUÍDA, e isso é decisão.** Não há
> faturamento no sob medida, a §5 da spec diz que o ERP é outro projeto, e
> **ninguém marca entrega**. Construir a coluna `entregue` sem quem a marque é
> exatamente a coluna-paisagem que a 6-A recusou, e a NF digitada sem
> responsável por digitá-la é a dívida 18. Ela nasce quando o dono disser
> quem faz as duas coisas.

> **Rode `cd tecido && npm test` (602 casos) ao mexer em `boleto.js`, no
> crédito da revenda ou no selo do Quadro** — 35 são da 6-C1, e **oito
> defeitos foram reintroduzidos um a um** para provar que cada caso pega o
> seu: disponível zero sem limite (reprova 1), cortar o estourado em zero (3),
> contar o boleto pago (1), contar o cancelado (1), aceitar número repetido
> (1), cobrar "sem boleto" de quem paga em PIX (1), ordenar a carteira por
> nome (1) e pôr o selo no cartão cancelado (1). Mexeu em permissão?
> **`node teste_acesso.js` (204) e `node teste_cobertura.js` (10) também.**
> E **abra as três telas**: quatro dos defeitos desta fase não têm teste que
> os pegue.

### ⚠️ A FASE 6-C1b (26/09/2026) — O BOLETO APONTA OS PEDIDOS QUE COBRE

No mesmo dia do deploy da 6-C1, o dono leu a tela e disse o que faltava:
*"um recebimento tem que ser sempre atrelado a um pedido — dessa forma ele
conversa com o contas a receber e também com o que já foi acordado ao
pedido"*. Migração 26 (`sm_boleto_pedido`), e a coluna `pedido_id` **saiu**.

```
um boleto → N pedidos      o financeiro junta os pedidos da semana num título
um pedido → N boletos      o parcelamento, que já cabia
nenhum pedido              existe, e passa — mas nasce AVULSO, visível
```

**Duas respostas do dono mudaram o FORMATO, e não o texto.** Perguntei antes de
construir justamente porque a diferença entre elas é schema:

| Pergunta | Resposta | O que ela decidiu |
|---|---|---|
| um boleto pode cobrir vários pedidos? | **sim**, o financeiro junta | a coluna não serve; nasce a tabela de vínculo |
| existe boleto sem pedido (acerto, frete)? | **às vezes** | não dá para exigir sempre; ele vira `avulso` |

> ⚠️ **A COLUNA `pedido_id` SAIU, E NÃO FICOU "POR VIA DAS DÚVIDAS".** Com a
> tabela de vínculo de pé, ela passaria a ser a segunda afirmação sobre o
> mesmo fato (armadilha #12) e divergiria no primeiro título de dois pedidos.
> O `INSERT … SELECT` que copia o que havia nela **não é enfeite**: em 26/09
> não havia boleto lançado, mas migração que confia nisso quebra no dia em que
> alguém lançar um antes do deploy.

> ⚠️ **O QUE A COLUNA ÚNICA FAZIA DE ERRADO, e é o caso que trava a fase:** um
> título cobrindo três pedidos gravava **um**, e os outros dois continuavam
> para sempre em *"aprovado sem boleto"*. A lista cobraria um título que já
> existe, e ninguém procura o motivo numa lista que só cresce.

> ⚠️ **ID E NÚMERO SÃO CAMPOS SEPARADOS, E NÃO SE ADIVINHA QUAL É QUAL.** Os
> números de pedido começam em 5001 (§4.18 da spec) e os ids em 1: um dia os
> dois intervalos se cruzam, e aí um `5001` é os dois ao mesmo tempo.
> Heurística ali seria régua que erra **em silêncio**, mandando o título para
> a venda de outra pessoa — e o erro só apareceria na conferência da revenda.
> A tela manda `pedido_ids` (ela marca o que o servidor mandou);
> `pedido_numeros` existe para quem digita.

> ⚠️ **UM PEDIDO ERRADO DERRUBA A LISTA INTEIRA, e nada é gravado.** Aceitar os
> certos e descartar o errado deixaria o título cobrindo menos do que quem
> lançou acha que cobriu — e ninguém confere um boleto que "deu certo". O
> pedido **cancelado** também é recusado: ele não é compromisso (a mesma régua
> do "aprovado sem boleto"), e título apontando pedido morto é conta que
> ninguém explica depois.

> ⚠️ **O AVULSO NÃO GANHA COLUNA, E A CONFERÊNCIA DE VALOR TAMBÉM NÃO.** Os
> dois são derivados — "avulso" é não ter linha de vínculo nenhuma, e
> `excede_pedidos` é uma comparação entre dois números já gravados. É a mesma
> razão de a `situacao` do boleto já sair de `pago_em` e `cancelado_em`.

> ⚠️ **O VALOR AVISA, NUNCA TRAVA — e o aviso diz QUANTO.** Recusar o título
> que não bate com a soma quebraria o parcelamento: 3× de um pedido de
> R$ 3.000 são três títulos de R$ 1.000, e nenhum "bate". O sistema acusa só o
> lado impossível, o título somar **mais** que os pedidos que cita.
>
> E aí veio o que **só apareceu abrindo a tela**: um título de R$ 493,00 para
> R$ 492,80 de pedidos acendia o aviso por **vinte centavos**. O financeiro
> arredonda, e marca que aparece no caso normal vira paisagem — a mesma razão
> de a modalidade só ser escrita quando separa alguma coisa (§5). Um limiar em
> centavos seria chute escondido no código, que é o que a 6-B recusa; hoje a
> tarja escreve **"⚠ R$ 0,20 acima dos pedidos"** e quem lê julga sozinho:
> R$ 0,20 se ignora, R$ 7.217,96 se investiga. Marca que deixa de ser binária
> se explica.

> ⚠️ **A TELA NÃO PEDE PARA DIGITAR NÚMERO DE PEDIDO.** Escolhida a revenda,
> ela **lista os pedidos aprovados sem título**, com número e valor, e o
> financeiro marca os que aquele boleto cobre. Digitar é onde nasce o vínculo
> errado, e a lista já é exatamente o que o sistema sabe — a lição do card de
> pacote do §5, que nasce preenchido.
>
> E ela sai do **mesmo critério** do `aprovados_sem_boleto` do crédito. Com
> critérios diferentes a tela ofereceria para marcar um pedido que a conta não
> considera coberto, e as duas estariam certas, cada uma na sua régua (#12).
> **Esse caso nasceu de um defeito que passou:** ao reintroduzir os defeitos um
> a um, a lista com `marco IN ('aprovado','enviado')` não reprovou nada — o
> teste que faltava foi escrito ali, e só então o defeito reprovou.

> ⚠️ **A ROTA DA LISTA É `boleto.ler`, E NÃO `pedido.ler`.** Mandar a tela a
> `/api/pedidos` exigiria dela uma chave que quem lança boleto pode não ter, e
> o efeito seria um seletor vazio com 403 no console — que não se parece com
> "falta permissão" (§10, armadilha #29). **Não nasce chave nova:** ler a
> lista é a mesma pergunta de ler o crédito.

> ⚠️ **TRÊS COISAS SÓ APARECERAM COM A TELA ABERTA, e a terceira é de CSS:**
> - **lançar perdia a revenda escolhida.** O formulário era redesenhado do zero
>   e o select voltava para a primeira da lista. O financeiro lança cinco
>   títulos da mesma revenda em seguida, e o quinto sairia na revenda errada —
>   o erro mais caro que esta tela permite, e ele acontece na pressa;
> - **os vinte centavos** do aviso, acima;
> - **a caixinha saía em cima e o texto embaixo.** Duas causas empilhadas: o
>   `input` do `base.css` tem `min-height` de alvo de toque (e `min-height`
>   vence `height`), e `.form label` tem especificidade **maior** que `.marca`
>   (0,1,1 contra 0,1,0), então o `display:flex` escrito no arquivo nunca
>   chegou a valer. É a armadilha da coluna `fr` do §12 por outra porta: **o
>   CSS lido não diz se a regra pegou — quem diz é a tela medida**
>   (`getComputedStyle` + `getBoundingClientRect`).

> **Rode `cd tecido && npm test` (617 casos) ao mexer no vínculo, no
> `dominio/boleto.js` ou no card do Financeiro** — 15 são da 6-C1b, e **nove
> defeitos foram reintroduzidos um a um**: aceitar os certos e descartar o
> errado (reprova 2), não deduplicar (15), deixar passar pedido cancelado (1),
> o avulso sempre falso (1), travar em vez de avisar (11), `COALESCE 0` na soma
> — que faria o avulso "exceder" (1), a lista da tela com critério próprio (1),
> a marca com nome de dinheiro, que a poda come (4), e o boleto cancelado
> continuar cobrindo o pedido (1). Mexeu em permissão? **`node
> teste_acesso.js` (204) e `node teste_cobertura.js` (10) também.**

### ⚠️ A FASE 6-C1c (26/09/2026) — O QUE FALTA TITULAR, E O PARCELAMENTO QUE NÃO ERA LANÇÁVEL

Horas depois do deploy da 6-C1b, o dono lançou um boleto **menor** que o
pedido e perguntou: *"onde que ficou o saldo devedor?"*. Em lugar nenhum — e
havia um segundo defeito colado, pior que o primeiro:

```
pedido aprovado   R$ 165,00
boleto lançado    R$  49,50   ← aponta o pedido
                  R$ 115,50   ← não existia em tela nenhuma
```

| Onde | O que dizia | Por quê |
|---|---|---|
| **em aberto** | R$ 49,50 | soma o valor dos **títulos**, nunca o do pedido |
| **aprovado sem boleto** | o pedido **sumiu** | a consulta era `NOT EXISTS (vínculo)`: **um** título de qualquer valor bastava |
| a tarja de valor | nada | ela só acende no lado de cima, título **maior** que os pedidos |

> ⚠️ **E O PARCELAMENTO NÃO ERA LANÇÁVEL PELA TELA — este é o defeito maior,
> e ninguém tinha esbarrado nele.** A lista que a tela oferece para marcar é
> a mesma consulta. Lançada a parcela 1 de 3, o pedido saía dela e **não
> havia como apontá-lo na parcela 2**. A regra que o "avisa, nunca trava" da
> 6-C1b existe para proteger (3× de R$ 3.000, e nenhum título "bate") era
> justamente a que a tela impedia de registrar.

**A régua passou a ser o dinheiro, e não a existência do vínculo:** um pedido
está titulado quando a **soma dos títulos ativos alcança o valor dele**.
Abaixo disso ele continua na cobrança e na lista de marcar, com o que falta.

> ⚠️ **COM RATEIO PROPORCIONAL, e a razão é o título que cobre VÁRIOS
> pedidos** (decisão do dono, 26/09/2026). Ali o título não diz de qual
> pedido é o buraco, e repartir proporcionalmente ao valor de cada um é a
> única repartição que não privilegia ninguém. Quando o título **fecha** com
> a soma, a quota de cada pedido dá exatamente o valor dele, sem fração:
> fração só aparece quando falta dinheiro, que é o caso em que um centavo a
> mais ou a menos na falta não decide nada. `TITULADO`, no `dados/boleto.js`,
> é o dono único dessa conta — a lista, a contagem e o dinheiro saem dela.

> ⚠️ **O CRÉDITO NÃO MUDOU, e isso é decisão do dono.** `em aberto` continua
> sendo só **título lançado**, e o que falta titular aparece **ao lado**, em
> linha própria — a regra *"os dois, mostrados separados"* da §8 da spec, que
> já valia para o "aprovado sem boleto". Somá-lo faria o disponível mudar de
> valor sem ninguém ter lançado nada, e quem já lê a tela veria o número
> andar sozinho.

> ⚠️ **"SEM BOLETO" E "PARCIALMENTE TITULADO" SÃO DUAS LINHAS, NUNCA UMA
> SOMA.** São fatos diferentes, e juntá-los apagaria justamente o caso que o
> dono perguntou. O valor do parcial é a **falta**, nunca o valor cheio do
> pedido: o pedaço que já virou título já está no `em aberto`, e somar o
> cheio o contaria duas vezes.

> ⚠️ **TÍTULO CANCELADO NÃO TITULA** (o pedido volta inteiro à cobrança), e
> **título PAGO continua titulando** — a pergunta aqui é *"já virou título?"*,
> não *"já foi pago?"*. Tirar o pago faria o pedido reaparecer na cobrança no
> dia em que a revenda pagasse.

> ⚠️ **A FALTA É CORTADA EM ZERO, e isso NÃO é o `MAX(0, …)` proibido do §2.**
> Lá o negativo é o sinal de peça que saiu sem registro; aqui "título maior
> que os pedidos" já tem aviso próprio — a tarja `excede_pedidos` da 6-C1b,
> que continua de pé e é o lado de cima da mesma linha.

> ⚠️ **O LADO DE BAIXO NA LINHA DO TÍTULO NÃO SE CHAMA "FALTA".** Ele escreve
> *"cobre R$ 49,50 de R$ 165,00 em pedidos"* e descreve, em vez de acusar:
> título menor é o **parcelamento**, o caso legítimo, e as outras parcelas
> ainda vão ser lançadas. Quem responde quanto falta de verdade é a lista de
> cobrança, que olha **todos** os títulos do pedido; aquela linha fala de um
> título só.

> ⚠️ **E DUAS COISAS SÓ APARECERAM NO RENDER, de novo:**
> - a lista de marcar escrevia `#5001 · R$ 115,50` com a palavra **"faltam"**
>   na linha de baixo (a tarja é um bloco). Lido de relance, aquele número
>   parece o **valor do pedido** — que é R$ 165,00. Hoje sai `#5001 · faltam
>   R$ 115,50 de R$ 165,00`, com a palavra colada no número que ela qualifica;
> - a linha do crédito dizia *"fora do disponível"* no "sem boleto" e **não**
>   dizia no parcial, sendo que os dois ficam fora. As duas telas (Financeiro
>   e a ficha da revenda) escrevem a frase **igual** — diferente, ensinariam a
>   equipe a achar que são coisas diferentes (§4).
>
> E a primeira correção disso saiu *"faltam R$ 115,50 em título (R$ 115,50
> fora do disponível)"* — o **"23,1 mm em vez de 23,1 mm"** do §4 escrito por
> mim no mesmo dia em que citei a lição. Pegou antes de renderizar, relendo a
> própria frase.

> **Rode `cd tecido && npm test` (627 casos) ao mexer no `TITULADO`, no
> `credito` ou na lista de marcar** — 10 são da 6-C1c, e **seis defeitos foram
> reintroduzidos um a um** para provar que cada caso pega o seu: voltar o
> `NOT EXISTS` (reprova 4), tirar o rateio (1), deixar o cancelado titular
> (1), não cortar a falta em zero (3), somar o valor cheio do parcial (2) e
> nomear o campo sem o prefixo `valor_`, que a poda deixa passar (6).
> E **abra as duas telas**: as duas coisas acima não têm teste que as pegue.

> ✅ **NO AR E CONFERIDA COM DADO REAL EM 26/09/2026, PELO CAMINHO QUE A TELA
> NÃO DEIXAVA PERCORRER.** O dono fez o deploy e **lançou a 2ª parcela
> apontando o mesmo pedido**: *"entrou, e a falta caiu"*. São as duas metades
> provadas por um gesto só — para marcar o pedido na 2ª parcela ele **tinha**
> que continuar na lista depois do primeiro título (a régua do dinheiro), e a
> falta tinha que andar com o segundo.
>
> ⚠️ **E É JUSTAMENTE O CASO QUE ERA IMPOSSÍVEL ATÉ O DEPLOY DESTA FASE.** Com
> o `NOT EXISTS (vínculo)`, a parcela 1 tirava o pedido da lista e a parcela 2
> não tinha onde ser apontada — o parcelamento, que o "avisa, nunca trava" da
> 6-C1b existe para proteger, era o que a tela impedia de registrar. Um
> parcelamento de verdade, lançado pela tela, prova isso de um jeito que
> nenhum caso semeado provaria.
>
> ⚠️ **O QUE ELE NÃO DISSE, E POR ISSO NÃO ESTÁ ESCRITO COMO DITO:** dos
> quatro pontos que pedi para conferir na tela, ele relatou este. Os outros
> três (a tarja `já titulado`, a linha do crédito e o *"cobre R$ X de R$ Y"*
> na linha do título) não foram confirmados um a um — e o lançamento da
> parcela não passa por todos eles.
>
> **O que continua pendente é da 6-C1, e não desta:** o financeiro dando uma
> **baixa** de verdade, e o vendedor usando a carteira na conversa semanal.
> Prova que não foi feita se escreve como não feita (§4).

### ⚠️ OS DOIS DEFEITOS DE TELA DO FINANCEIRO (28/09/2026)

Dois consertos de tela, achados **abrindo as telas** da fase 6-C1 — nenhum
deles tem teste de unidade que o pegue sozinho, e é sempre o mesmo tipo:
o código está sintaticamente perfeito e a tela é que está errada.

| Onde | O que era |
|---|---|
| **Financeiro, a 400 px** | a tabela de boletos tem cinco colunas e não cabe: a **página inteira** andava de lado (`scrollWidth` 684 contra 400) e o topo do card saía de vista |
| **Ficha da revenda** | escrevia `R$ 4785,50`, **sem o ponto do milhar**, enquanto o Financeiro, com o mesmo dinheiro da mesma revenda, escreve `R$ 4.785,50` |

> ⚠️ **A TABELA QUE NÃO CABE ROLA SOZINHA — A PÁGINA NUNCA ROLA DE LADO.** É a
> coluna `fr` do §12 pela porta da tabela: `table{width:100%}` é uma proporção
> que o navegador **ignora** quando o conteúdo é mais largo, e aí a tabela
> empurra o corpo. Quem passa a rolar é um recipiente (`.rolaH`), e o resto da
> página fica parado. Medido, não lido: a 400 px a página saiu de 684 px para
> **400**, e o `.rolaH` ficou com `scroll 634 × cliente 300` — que é o certo.
>
> **Ela mora no `base.css`, e não na tela**, pela lição da fileira de escolha
> da fase 4-A (§19): classe própria de tela é a segunda régua do CSS.

> ⚠️ **ERAM DOIS PAPÉIS NA MESMA FUNÇÃO, E POR ISSO A TROCA INGÊNUA QUEBRARIA O
> CRÉDITO.** O `emReais` da ficha fazia duas coisas: escrevia o dinheiro que se
> **lê** e pré-preenchia o campo **Limite (R$)**, que volta pelo `paraCentavos`.
> Trocar os dois pelo `dinheiro` do `ui.js` (o dono único do módulo) faria o
> campo nascer com `4.785,50` — e `paraInteiro` devolve **NaN** para isso, com
> a tela recusando, com a frase *"o limite se escreve como 5000,00"*, um valor
> que ela mesma acabara de escrever. Seria trocar um defeito de **leitura** por
> um de **escrita**, no crédito.
>
> Hoje são **duas funções com nome que diz qual é qual**: `reais` (lê, pelo
> `dinheiro`) e `paraCampo` (pré-preenche, sem separador). Conferido gravando
> o campo de verdade: abriu com `4785,50`, salvou `5000,00`, recarregou com
> `5000,00` e o banco ficou com `500000` centavos.

> ⚠️ **UM FORMATADOR LOCAL PARA LER É A ARMADILHA #12 EM MINIATURA** — a mesma
> revenda mostrando o mesmo dinheiro de dois jeitos em duas telas, e as duas
> "certas", cada uma na sua régua. A varredura do `dinheiro_tela.test.js` recusa
> `R$ ` montado à mão numa tela nova, com **lista de isentos nomeados** (a forma
> do `teste_*.js` na varredura do estoque, §2): seis telas ainda montam, e três
> delas — `catalogo.html`, `pedidos.html` e `simulador.html` — escrevem dinheiro
> **sem o separador de milhar**. Está escrito porque é o mesmo defeito, e não
> foi consertado aqui.
>
> A lista tem guarda contra **isento zumbi**: tela que sai da lista sem sair do
> defeito, ou que é consertada e fica isenta, reprova.

> ⚠️ **E A LISTA DE REVENDAS TAMBÉM ROLA A PÁGINA DE LADO a 400 px**
> (`table.lista`, 660 px) — mesmo defeito, terceira tela, **não consertado
> aqui**: não estava no plano, e §0 manda anotar em vez de consertar junto. O
> reparo é o mesmo `.rolaH`, que já existe.

> **Rode `cd tecido && npm test` ao mexer no dinheiro de qualquer tela do
> módulo, no `.rolaH` ou na tabela do Financeiro.** E **abra as telas, e
> MEÇA**: a 400 px quem diz se a regra pegou é `scrollWidth` contra
> `clientWidth`, nunca o CSS lido (§12).

### ⚠️ E O SEPARADOR DE MILHAR NÃO ERA DE TRÊS TELAS: ERA DO SERVIDOR (28/09/2026)

O bloco acima deixou escrito que `catalogo.html`, `pedidos.html` e
`simulador.html` escreviam dinheiro sem o ponto do milhar. Ao consertar,
**duas das três não formatavam nada**:

| Onde | O que era |
|---|---|
| **`nucleo/unidade.js → emReais`** | o **dono único** de centavo→reais do servidor. Escreve o total congelado do pedido, o `base` do simulador (*"4,320 m² × R$ 2.000,50/m²"*), o texto da auditoria e **o PDF que a revenda confere** |
| **`catalogo.html`** | `emReais` local com **os dois papéis** — lê o preço **e** pré-preenche os campos `R$ por m²` e `R$ por unidade` |
| `simulador.html` | `reais` local, só leitura |
| `pedidos.html` | **não formata**: recebe a string pronta e só pendura o `R$` |

> ⚠️ **CONSERTAR SÓ A TELA DEIXARIA O NÚMERO CERTO NUMA LINHA E ERRADO NA DE
> BAIXO.** O simulador mostra as duas coisas juntas: o `R$ 8.642,16` que o
> navegador escreve e o `× R$ 2.000,50/m²` que veio do servidor dentro da
> frase. Com o conserto só de um lado, a mesma tela diria o mesmo dinheiro de
> dois jeitos — a armadilha #12 com uma régua de cada lado do fio.

> ⚠️ **O SERVIDOR NÃO USA `toLocaleString`, E ISSO É TRAVA DE AMBIENTE.** Um
> Node compilado com **ICU pequeno** não tem `pt-BR`: ele não dá erro, ele
> **cai em en-US**, e a folha da revenda sai com `R$ 4,785.50`. No navegador
> isso não existe (pt-BR vem sempre); aqui depende de como o servidor foi
> compilado, e o sintoma aparece no papel já impresso. O ponto do milhar é
> escrito à mão deste lado do fio, e **há varredura recusando o `Intl` no
> `unidade.js`**.
>
> Os dois lados são conferidos contra **literais do português do Brasil**, e
> não um contra o outro — a lição do QR (§4): teste que relê com a mesma
> convenção com que escreveu pergunta a si mesmo.

> ⚠️ **O `emPercentual` FICA COMO ESTÁ.** Desconto não passa de 100%, então o
> separador nunca apareceria — e ponto num percentual se lê como casa decimal.

> ⚠️ **O CATÁLOGO ERA A OUTRA TELA COM OS DOIS PAPÉIS**, e a troca ingênua
> quebraria o preço como quebraria o crédito: `1.234,56` no campo vira **NaN**
> no `paraCentavos`, e a tela recusa o número que ela mesma escreveu. Hoje são
> `reais` (lê) e `paraCampo` (pré-preenche). Conferido gravando de verdade:
> abriu `1234,56`, salvou `2000,50`, a célula virou `R$ 2.000,50` e o banco
> ficou com `200050`.
>
> **O cabeçalho da coluna mudou junto:** dizia `R$/m²` porque a célula vinha
> sem o `R$`. Com a célula escrevendo `R$ 2.000,50`, o rótulo repetia a moeda
> — hoje é **`Preço por m²`**, como o `Preço` da tabela de componentes ao lado.

> ⚠️ **DUAS RÉGUAS ACUSARAM O INOCENTE NA MESMA RODADA, e as duas só
> apareceram porque o teste rodou:**
> - a varredura que proíbe o `Intl` no servidor **achou o próprio comentário**
>   que explica por que ele não entra. Régua que se acusa sozinha só fica
>   verde se alguém apagar a explicação — hoje ela lê o código sem comentário;
> - o guard que proíbe conta de dinheiro no `pedidos.html` procurava
>   `/100).toFixed` e pegou o formatador de **área**
>   (`(Math.round(v*100)/100).toFixed(2)`). Hoje ele **nomeia o centavo**:
>   dividir por 100 continua certo (é assim que se entrega reais ao
>   `dinheiro`); o que não pode é o `toFixed` depois da divisão.

> ⚠️ **E O CASO DO RECIPIENTE ESTAVA OCO — inclusive o que já existia.** Ele
> conferia que `class:'rolaH'` aparecia no arquivo, e passava verde com o
> recipiente criado e **vazio**, a tabela pendurada no card como antes. Quem
> achou foi a rodada de reintroduzir os defeitos: tirar a tabela de dentro não
> reprovou nada. Hoje os dois casos exigem o `rola.appendChild(`. **Classe
> declarada que não embrulha ninguém é a terceira ponta da mesma armadilha.**

> **Rode `cd tecido && npm test` (647 casos) ao mexer no `emReais` ou no
> dinheiro de qualquer tela** — 14 são do `dinheiro_tela.test.js`, e sete
> defeitos foram reintroduzidos um a um: o servidor sem o milhar (reprova 2),
> o `Intl` de volta (1), o catálogo com um papel só (1), a cópia do `dinheiro`
> no painel (2), a lista de revendas fora do recipiente (1), a conta própria no
> `pedidos` (1) e a tabela de boletos fora do recipiente (1).
>
> ⚠️ **Os dois últimos mudaram de casa em 29/09/2026** — os casos do `.rolaH`
> viraram varredura no `rola_tela.test.js`, no bloco abaixo.

> ⚠️ ~~**QUATRO TELAS AINDA ROLAM A PÁGINA DE LADO**~~ — **eram SETE, e a
> conta estava errada porque eu contei as telas que tinha aberto, e não as que
> medi.** Ver o bloco logo abaixo; consertadas em 29/09/2026.

### ⚠️ AS SETE TELAS QUE ROLAVAM DE LADO — e o número que eu tinha dado era três (29/09/2026)

O bloco acima prometia três reparos de uma linha. Ao medir as **dezesseis**
telas do módulo a 400 px, antes de encostar no código, eram **sete**:

```
/corte        660 px   ← bancada do corte, o operador digitando medida
/cadastros    766 (aba Tecido) · 692 (Motivos) · 416 (Endereços)
/painel      1050 (Gerencial)
/catalogo     618 · 810 · 582 · 767   (quatro das cinco abas)
/pedidos      485
/producao     820   ← quem imprime o maço
/indicadores  479
```

> ⚠️ **O NÚMERO ERRADO NÃO VEIO DE UMA CONTA ERRADA: VEIO DE NÃO TER MEDIDO.**
> As três que eu nomeei foram as que abri durante a entrega anterior, e as
> outras quatro nunca tinham sido abertas num celular. É o §12 dizendo, pela
> enésima vez, que **quem responde é a tela medida** — e desta vez o que ele
> pegou não foi o CSS, foi o meu relatório. Número de diagnóstico que saiu do
> que estava à mão vira fato na linha seguinte, e o dono planeja em cima dele.

**`window.ui.rolaH(tabela)` passou a ser o dono único do embrulho**, e as
**47 tabelas** das treze telas com tabela passam por ele:

```js
const rolaH=t=>el('div',{class:'rolaH'},[t]);   // devolve o recipiente COM a tabela dentro
```

> ⚠️ **ELE RECEBE A TABELA, e isso é o conserto de um defeito que esteve no
> ar.** O padrão anterior era de dois passos — criar o recipiente, e depois
> lembrar de pendurar a tabela nele —, e foi assim que o recipiente do
> Financeiro nasceu **oco** e passou verde num caso que conferia só a classe
> (bloco acima). Uma função que recebe a tabela não tem segundo passo para
> esquecer. Copiar o padrão de dois passos numa tela nova é recusado por
> varredura.

> ⚠️ **TABELA QUE HOJE CABE ENTRA JUNTO, de propósito.** O recipiente é inerte
> quando o conteúdo cabe — `overflow-x:auto` não desenha barra sem transbordo.
> Deixar de fora as que cabem faz a próxima pessoa perguntar quais têm e quais
> não têm, e a que crescer amanhã volta a empurrar a página. É por isso que a
> varredura é uma regra de contagem (`N tabelas → N embrulhos`) e **não tem
> lista de isentos**: lista de isentos envelhece, e a do dinheiro já provou.

> ⚠️ **E UMA DAS SETE NÃO ERA TABELA.** A aba **Endereços** do `/cadastros`
> punha a página em 416 px por um `display:inline-flex` **sem `wrap`**: a tarja
> do endereço mais os três botões (`ROLO · A-1-1 · Renomear · Apagar ·
> Desativar`) numa linha de 379 px que não quebra. O `rolaH` não alcança isso —
> **o sintoma é o mesmo e a causa é outra**, e procurar só tabela teria deixado
> a aba rolando depois de a tela ser dada por consertada.
>
> Ela **só apareceu com endereço cadastrado**: em banco vazio a aba não desenha
> nível nenhum, e a medição passava limpa. Foi semear um rolo e uma sobra no
> banco de teste — para exercitar `/rolos` e `/sobras`, que também não
> desenhavam tabela nenhuma — que a destapou. **Tela medida com banco vazio
> mede o vazio**, e isso vale para toda medição de tela daqui para a frente.

> ⚠️ **O RISCO DO CONSERTO É VERTICAL, E FOI MEDIDO.** `overflow-x:auto` faz o
> `overflow-y` virar `auto` — e o editor do catálogo mora **dentro** da tabela,
> num `<td colspan>`. Um recipiente que cortasse no eixo Y esconderia o botão
> de salvar. A medição confere os quatro, tela a tela e aba a aba: a página não
> rola, nenhuma tabela ficou fora do recipiente, nenhum recipiente nasceu oco e
> **nenhum ganhou barra vertical**.

**Rode `node teste/rola_tela.test.js` pelo `npm test` ao criar tabela em
qualquer tela do módulo, ao mexer no `rolaH` ou no `.rolaH` do `base.css`** —
os 6 casos travam as cinco pontas, e o primeiro **roda a função de verdade**
num DOM de mentira que guarda os filhos: conferir por texto é o que deixou o
recipiente oco passar. Seis defeitos foram reintroduzidos um a um, e cada um
reprova só o caso que existe para pegá-lo (o do recipiente à mão reprova dois,
porque perde a contagem **e** cai na varredura do padrão de dois passos).

> ⚠️ **E ISSO NÃO É A CONFERÊNCIA NA FÁBRICA.** A medição foi num navegador
> meu, a 400 e a 1440 px, com as dezesseis telas e todas as abas. A prova que
> fecha é **alguém abrindo o `/corte` no celular da bancada** e a página não
> andando de lado com a medida sendo digitada.

### ⚠️ O CORTE EM ETAPAS — o estoque só anda no CORTE FEITO (01/10/2026, spec `CORTE-EM-ETAPAS`)

Em 01/10/2026 um corte foi confirmado rápido: o plano mandava parte do pedido
para uma sobra, o tom não bateu e o operador cortou tudo do rolo. O Confirmar
**já tinha baixado** — a sobra ficou "usada" inteira na mão de alguém e o rolo
baixou a menos. Desde a fase 2 da spec:

```
① planejar   ② confirmar      ③ cortando      ④ corte feito     ⑤ guardar
  (calcula)    grava e RESERVA   relógio corre   AQUI BAIXA tudo   medida+etiqueta+endereço
```

`tecido/dominio/corte.js` é o **dono único** das etapas e da baixa de rolo e
sobra; `plano.js` ficou só com a conta. O histórico de cada corte está no botão
**Histórico** da tela de corte (fase 1, `dominio/corte_historico.js`).

> ⚠️ **`plano.confirmado` CONTINUA DIZENDO "BAIXOU O ESTOQUE"**, e por isso só
> vira 1 no Corte feito. O painel de Cortes, o comprometido de tecido (4-B) e a
> checagem do gerencial leem `confirmado=1` com esse sentido; a etapa mora em
> coluna nova (`etapa`). Os cortes de antes viraram `feito` na migração 27 (R28).

> ⚠️ **O CORTE FEITO BAIXA O QUE ESTÁ GRAVADO (`plano.proposta`), nunca um plano
> recalculado na hora** — entre confirmar e terminar pode ter entrado sobra nova,
> e recalcular escolheria uma fonte que ninguém cortou.

> ⚠️ **A RESERVA NÃO TEM TABELA: ela é a faixa de um corte aberto.** Sobra de
> corte aberto (confirmado ou cortando) não é oferecida a outro plano — e o
> plano diz por quê (`reservada`, com o corte e a pessoa) —, e o rolo aparece
> para os outros com o saldo menos os metros reservados. Uma tabela de reserva
> ao lado seria a segunda afirmação sobre o mesmo fato, e a que fica para trás
> é a que prende a sobra para sempre.

> ⚠️ **A SOBRA NASCIDA NÃO É LINHA DE `sobra` ATÉ SER GUARDADA**, e mora em
> `sobra_a_guardar`, em nome de quem cortou (R13). Sem etiqueta ninguém a acha
> na prateleira, e por isso ela não entra em plano (R14) — morando à parte,
> nenhuma consulta de candidatas precisa lembrar de filtrá-la. Guardar exige
> medida, etiqueta e endereço juntos. **A medida calculada vem escrita e a
> lista vem vazia**: medida pré-marcada é medida que se salva sem olhar (a regra
> das sobras do `tecido/README.md`), e quem vale é a fita.

> ⚠️ **UM CORTE ABERTO POR OPERADOR (R2)**, e a pendência de guardar não conta.
> Quem mexe no corte aberto é quem o abriu, ou a chefia (`corte.gerir`, que só o
> diretor tem pelo `*`); a chefia vê as sobras a guardar de todos (R15).

> ⚠️ **"VOLTAR AO PLANO" APAGA O CORTE DO ②, e CANCELAR fica no histórico.**
> No ② nada foi cortado; um "cancelado" por cada vez que alguém conferiu o
> resumo e voltou encheria o histórico de cortes que nunca existiram. Do ③ em
> diante só se cancela, com motivo.

> ⚠️ **A LINHA VAZIA DA GRADE NÃO É MEDIDA.** `comoNumero('')` devolve **0**, e
> não `null`: o filtro antigo da tela deixava as linhas em branco irem para o
> servidor, e quem preenchia uma só das três linhas da grade levava *"A linha 2
> esta sem medida valida"*. Achado abrindo a tela, consertado no `temMedida`.

### ⚠️ MUDAR O CORTE: livre durante, aprovado depois (fase 3, R5–R8, R16–R17)

**Durante o corte (③)** o operador muda o plano sozinho, sempre com motivo da
lista de **Cadastros → Motivos** (a mesma do "não usar"; a migração 28 só
acrescentou *Rolo acabou* e *Medida errada*): **não usar** a fonte, **o item
saiu de outra fonte** (bipa o código; o sistema conta os metros), **rolo
acabou** (o que já saiu fica nele, o resto muda, e no Corte feito ele é
encerrado) e **cortado errado** (o pedaço vira sobra marcada "cortada errada",
ou refugo, e o item volta a ser cortado). Cada mudança vira linha em
`plano_edicao`.

> ⚠️ **A EDIÇÃO NÃO TEM CONTA PRÓPRIA.** Ela vira restrição da entrada
> (`fixadas`, `erradas`, `excluir_rolos`, `recusadas`) e o plano é recalculado
> pelo mesmo `plano.calcular`. Fonte onde o item não cabe é recusada dizendo
> qual, e nada muda.

**Depois do Corte feito** o operador **pede** correção pelo histórico
(`corte.pedir_correcao`), dizendo de onde cada item saiu de verdade; a tela
mostra antes o que a aprovação faria. **Pendente, nada no estoque muda.** A
chefia (`corte.aprovar_correcao`) aprova e o sistema aplica a **diferença**: a
sobra que não foi usada volta a disponível **no endereço onde estava**, o rolo
acerta o saldo como consumo (o giro soma certo), as sobras que não nasceram
saem (a guardar é cancelada; a já guardada vira `anulada`, que não é descarte
nem refugo), as que nasceram de verdade ficam a guardar, e o refugo é refeito.

> ⚠️ **NA CORREÇÃO TODO ITEM TEM FONTE FIXA**, a do corte menos o que a pessoa
> disse que mudou. Deixar o plano escolher ali inventaria um corte que ninguém
> fez. E o item que mudou de fonte é **outra puxada**: encaixá-lo junto com o
> que já tinha saído do rolo o poria na mesma faixa, e o rolo baixaria 0,50 m
> em vez dos 2,50 que saíram. Achado pelo teste, antes da tela.

> ⚠️ **A VERDADE DO QUE O CORTE BAIXOU É O MOVIMENTO, não a proposta.** Os cortes
> de antes das etapas (R28) nem têm proposta; o metro de cada rolo está no
> `movimento_rolo` com a referência do corte. É assim que o corte de 01/10/2026
> se corrige.

> ⚠️ **QUEM PEDIU NÃO APROVA, nem o diretor** — a regra da casa para mexer em
> saldo (§18, ajuste em duas pessoas), aplicada aqui por analogia: a spec diz
> só "a gestão aprova". **Confirmada pelo dono em 02/10/2026** (*"concordo, quem
> pediu não aprova"*), e registrada em `DECISOES.md`.

> ⚠️ **A CORREÇÃO É BLOQUEADA** quando uma sobra "que não nasceu" já foi usada
> noutro corte, ou quando o rolo está encerrado e não tem onde pôr ou tirar
> metro. A frase diz o que fazer.

### ⚠️ O TOM É PELA ORIGEM, e o pedido dividido entre origens se confere no corte (fase 4, R9–R12)

`tecido/dominio/tom.js` é o dono único da **origem de tom**: o rolo; a sobra
que nasceu dele; a de sobra sobe até o rolo; e a do mutirão é **sozinha**. O
pedido que não cabe inteiro numa fonte se divide — primeiro entre fontes da
**mesma origem** (sem nada a conferir), depois entre **origens diferentes** —
e só se couber inteiro na divisão. Dividido entre origens, cada fonte pede
**"Conferi o tecido"** no Cortando, gravado com quem, quando, pedido e fonte; o
Corte feito é recusado sem elas, dizendo quais; e mudar a fonte numa edição
zera a conferência dela.

> ⚠️ **O "PEDIDO JÁ CORTADO" SÓ CONTA NO MESMO TECIDO.** Até 01/10/2026 a
> consulta olhava só o número do pedido, e o pedido de duas cores mandava a
> segunda cor continuar no rolo da primeira. Consertado no `cortesAnteriores`
> do `plano.js`, com caso travando.

### O TIPO DE CADA LINHA E O TEMPO POR m² (fase 5, R18–R21)

Cada linha do corte diz para quem é — **cliente final, revenda ou ML sob
medida** —, e o Confirmar recusa linha sem tipo. A revenda é escolhida da
**carteira que já existe** (`sm_revenda`), por uma porta própria do corte
(`GET /api/planos/revendas`, só id e nome, com a chave de quem corta: o
cortador não tem `revenda.ler`). O nome dela fica como retrato na linha.

O relógio corre do **CORTAR ao Corte feito, menos as pausas** (Pausar/Retomar
no ③; pausa esquecida aberta fecha no Corte feito), e o tempo líquido fica no
corte. `dominio/tempo_corte.js` é o dono do **minuto por m² por tipo** (Painel →
Tempo de corte): corte misturado divide o tempo **pela área das peças**, e corte
acima de `corteTempoMaxHoras` (parâmetro, nasce em 3 h, zero é recusado) fica
fora da média — e a tela diz quantos e quais.

> ⚠️ **O m² É O DAS PEÇAS, não o puxado do rolo**: o tecido que virou sobra ou
> refugo não é trabalho de cortar peça, e somado faria o corte com muito
> desperdício parecer mais rápido.

> ⚠️ **CORTE SEM RELÓGIO NÃO É CORTE RÁPIDO.** Os cortes feitos antes deste
> deploy não têm tempo medido: ficam fora, contados à parte, nunca como zero.

**Rode `cd tecido && npm test` ao mexer em `corte.js`, no `plano.js`, no
`tom.js`, no `tempo_corte.js` ou na tela de corte** — `tempo_corte.test.js` (8), `corte_etapas.test.js` (18),
`corte_correcao.test.js` (17), `historico_corte.test.js` (15) e
`tom.test.js` (27).

### A ETIQUETA DA SOBRA LIDA PELA FOTO (fase 6, R27)

Todo campo de bipe de sobra (lançar e procurar em Sobras; guardar e o filtro do
histórico no Corte) ganhou o botão **📷**: o iPad tira a foto e
`public/barras_ler.js` — na raiz, ao lado do `barras.js`, lendo pela **mesma
tabela** — acha o código. O código lido entra **no campo** (`ui.comCamera`) e
segue pelo caminho do bipe; não há segundo caminho.

> ⚠️ **SÓ VALE O QUE FECHA O DÍGITO VERIFICADOR, e não há "melhor palpite".**
> Não leu, a tela diz e deixa tentar de novo ou digitar. Código errado lido com
> confiança é sobra trocada na prateleira.

> ⚠️ **FOTO, NÃO CÂMERA AO VIVO** — a ao vivo pede HTTPS (dívida 2 do §14).

> ⚠️ **OS TESTES SÃO COM IMAGENS SINTÉTICAS**, desenhadas pelo `barras.js` e
> estragadas como a câmera estraga (borrada, torta, invertida, sombra,
> perspectiva, pequena). A spec pedia fotos reais, que não existem no
> repositório. **A prova é o iPad da bancada achando a sobra pela foto** — é a
> lição do QR do §4.

**Rode `cd tecido && npm test` ao mexer no `barras_ler.js`, no `barras.js` ou no
`comCamera`** — `barras_ler.test.js` (11). Três defeitos foram reintroduzidos:
o limiar fixo (a sombra reprova), a parada lida sem o silêncio depois e tirar o
script da tela.

### O PLANO MAIS CLARO (fase 7, R22–R25)

> ⚠️ **ENTRE AS SOBRAS QUE SERVEM, VENCE A DE MENOS REFUGO, e não a menor.**
> A ordem é condição (íntegra antes de defeito) → menor refugo → menor área. A
> de 1,05 × 1,05 para uma peça de 1,00 × 1,00 vira tira de refugo; a de
> 1,00 × 2,10 devolve um pé de 1,10 que é sobra nova — e ganha.

> ⚠️ **A SOBRA QUE SERVE E NÃO ENTROU DIZ POR QUÊ TAMBÉM QUANDO O PLANO USOU
> OUTRA.** Até aqui a lista só existia sem sobra nenhuma no plano — e o caso de
> 01/10/2026 era o outro. O motivo `outra_sobra` nomeia a escolhida e o degrau
> que decidiu; a gêmea (mesma medida, mesmo refugo) diz que é gêmea, e não que
> a outra "é menor".

**Cada sobra usada mostra `usa N% · N% vira sobra · N% refugo`, somando 100**
(o refugo é o resto, e não uma terceira soma), e o resumo mostra o refugo do
corte ao lado da **média dos cortes dos últimos 30 dias** —
`painel.refugoMedio`, da mesma tabela `refugo` do painel, só o refugo de corte.
Sem corte na janela a média é `null`, nunca zero. **Não há limite de perda:** o
número existe para o dono decidir um.

**Rode `cd tecido && npm test`** — `plano_claro.test.js` (12). Seis defeitos
foram reintroduzidos um a um: sem o critério do refugo, sem a condição, a lista
sumindo com sobra usada, o descarte entrando na média, a média zero e a
porcentagem errada.

> ✅ **NO AR EM 01/10/2026** (PR #165): o dono fez o deploy e disse *"ficou
> certo"*.
>
> ⚠️ **ISSO PROVA QUE O SISTEMA SUBIU, E NÃO QUE O CORTE EM ETAPAS FUNCIONA NA
> BANCADA.** Faltam quatro provas, e a spec só vai para `docs/arquivo/` depois
> delas: um corte inteiro pelas etapas, com rolo e sobra baixando **só no Corte
> feito**; a correção do corte de 01/10 pedida pelo Histórico e aprovada por
> outra pessoa; o iPad achando a sobra pela foto; e o caso da S-000091 no plano.
> Prova que não foi feita se escreve como não feita (§4).
>
> ✅ **PROVA 1 DE 4, EM 02/10/2026: UM CORTE INTEIRO PELAS ETAPAS, NA BANCADA.**
> O dono fez o corte do começo ao fim e disse *"baixou certo"*. Faltam as outras
> três: a correção do corte de 01/10, a foto no iPad e o caso da S-000091.
>
> ✅ **PROVA 2 DE 4, EM 02/10/2026: A CORREÇÃO DO CORTE DE 01/10.** O dono fez a
> correção pelo Histórico e disse *"deu certo"*. Faltam a foto no iPad e o caso
> da S-000091.
>
> ✅ **PROVA 3 DE 4, EM 02/10/2026: A SOBRA LIDA PELA FOTO NO iPad.** O dono leu
> a etiqueta de uma sobra pelo 📷 e disse *"deu certo"*. É a prova que os
> testes com imagens sintéticas não davam (fase 6). Falta o caso da S-000091.
>
> ✅ **PROVA 4 DE 4, EM 02/10/2026: O CASO DA S-000091 NO PLANO.** O dono
> testou e disse *"deu certo"*. Com as quatro provas feitas, a spec foi para
> `docs/arquivo/CORTE-EM-ETAPAS.md`; as regras que valem são as desta seção e
> as do `tecido/README.md`. E o dono confirmou no mesmo dia que quem pede a
> correção não a aprova (`docs/DECISOES.md`): nada ficou aberto.

---

## 21/10/2026 — a área `admin` deixa de abrir o sob medida (fase 1 da `ACESSOS-UNIFICADOS`)

Achado na entrevista do guardião, ao avaliar o controle de acesso para cerca de
20 logins: o `sincronizarAreas` (`acesso.js`) grava a área `admin` em quem tem
**qualquer** chave de nível admin, e o `papelDe` (`tecido/nucleo/acesso.js`) lia
essa área como **diretor**. Comprador e Financeiro são setores de nível admin;
uma exceção de "Ver custo" também dá a área. Quem fosse posto lá para comprar
material entrava no sob medida podendo tudo — boleto, preço, parâmetro,
descarte e aprovação de correção de corte — e a tela de Acessos mostrava só
"Comprador". Era a armadilha #34 por outra porta, e não aparecia porque quase
ninguém estava nesses setores.

O dono decidiu (P1) que diretor é só o Admin Geral e o setor "Sob medida /
Cadastros". O `papelDe` e o `setoresDe` deixaram de ler `admin`, e o
`destino.js` deixou de oferecer o botão "Sob medida →" a quem só tem `admin`,
porque ele levaria a "sem acesso". O Admin Geral não perde nada: ele recebe
`sobmedida_adm` pelo mesmo `sincronizarAreas`.

Os testes foram escritos antes do conserto e reprovaram com o código de então
(12 casos no `teste_acesso.js`, 2 no `tecido/teste/acesso.test.js` e 1 no
`teste_destino.js`). Antes do deploy, a lista de quem deixa de ser diretor sai
de um `SELECT` só de leitura, para o dono decidir quem precisa do setor de
cadastros.

