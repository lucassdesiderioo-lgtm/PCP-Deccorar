# Tecido — estoque, sobras e plano de corte

Operação **sob medida** — a fábrica corta tecido contra o pedido do cliente,
enquanto o resto do PCP cuida da operação de **medida padrão**, vendida pelo
Mercado Livre.

Este módulo **não sobe sozinho**. Ele é montado dentro do PCP, em `/sobmedida`,
pelo `server.js` da raiz. Uma porta, um processo, um PIN.

```bash
npm test          # daqui: 87 casos, banco temporário, sem servidor
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
dados/                 o SQL. Uma tabela, um arquivo. Nao decide nada
rotas/                 declaracoes. Sem SQL, sem `if` de negocio
public/                base.css (tokens) · ui.js · nav.js · barras.js · telas/
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

`public/barras.js` serve as duas pontas: a tela desenha SVG, o servidor desenha
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

O código de barras é **CODE128-B gerado aqui** (`public/barras.js`), sem
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

O campo **Procurar** no topo do Catálogo aceita o **bipe da etiqueta** e filtra
a tabela sem redesenhar: com centenas de linhas, corrigir a `S-000142` é
primeiro achar a `S-000142`, e o operador está com ela na mão.

**Teste obrigatório:** `node teste/rodar.js` — os 11 casos de correção e
apontamento em `teste/sobra.test.js` travam o rastro, a área refeita, o "nada
mudou", as guardas, o status, o apontamento único, a recusa com motivo e a
aceitação ligada a quem apontou.

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

