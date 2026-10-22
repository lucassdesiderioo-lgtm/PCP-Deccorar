# História — coleta, carregamento e saída da fábrica

> **Isto é história, não regra.** A regra vigente de cada assunto está em
> [`docs/regras/carregamento.md`](../regras/carregamento.md), em cartões curtos
> com o teste que a trava. Aqui está o PORQUÊ: o defeito que provocou cada
> regra, as datas e as conferências na fábrica.
>
> O texto abaixo saiu do `CLAUDE.md` em 20/10/2026 **sem nenhuma alteração** —
> a seção §8-B inteira. As referências do tipo "§5" ou "armadilha #27" apontam
> para o `CLAUDE.md`, para [`historia/expedicao.md`](expedicao.md) (§5) ou para
> [`historia/estoque.md`](estoque.md) (§2, §4 e §18). Quando um cartão mudar, a
> história nova entra **no fim** desta página, com data; o que está escrito não
> se reescreve.

---

<!-- Do CLAUDE.md §8-B — Coleta: o caminhão do Mercado Livre vem buscar (desde 10/09/2026) -->


A fábrica passou a ter **duas portas de saída** para o volume do ML:

| | **Agência** | **Coleta** |
|---|---|---|
| Quem leva | a gente, no carro, até a agência | o caminhão do ML, na fábrica |
| Onde a caixa espera | no carro | no **lugar reservado** da coleta |
| Prazo | hora de despacho do `config` | só o dia — o caminhão não tem hora |
| `lote.modalidade` | `'agencia'` (ou `NULL`) | `'coleta'` |

O lançamento **não mudou**: sobe-se o PDF igual, e o sistema descobre sozinho.

### ⚠️ ARMADILHA #21 — a etiqueta diz que é coleta por AUSÊNCIA

Os dois PDFs de 09/09/2026 (47 de agência, 8 de coleta) são idênticos em
tudo: layout, rota (`XSP1 > SMG6 > EGO18`), letra do rodapé, folha de
controle, DANFE. Não há ícone nem marca gráfica. A **única** diferença é a
caixa "Despachar":

```
agência   Despachar: qua 9/set, antes das 15:45 h
coleta    Despachar: quinta 10/set
```

`parse.js` → `modalidadeDespacho()` lê isso contra os **dois formatos exatos**:
casou com o da agência é `'agencia'`, casou com o da coleta é `'coleta'`.
**Qualquer outra coisa é `'desconhecida'`, e etiqueta sem a linha é `null`** —
e os dois **retêm o volume no upload**, com `bloqueio = 'modalidade: ...'`
(o texto cru da linha vai no motivo). Se a hora quebrou para a linha de baixo
(o pdf.js faz isso), a linha seguinte é emendada antes de conferir.

> **Regra do dono (09/09/2026): qualquer modificação na etiqueta vai para
> Bloqueados, e a gestão decide.** A marca é fraca (uma hora que falta), e um
> "quase igual" que passasse como coleta mandaria pro canto do caminhão uma
> caixa que era do carro, em silêncio. Por isso o sistema **não adivinha**:
> formato que ele não conhece para em **Admin → Bloqueados**, num card
> violeta próprio, e alguém com acesso de admin escolhe **Agência** ou
> **Coleta** (`POST /api/modalidade/resolver`), por volume ou o lote inteiro.
> A decisão grava `modalidade`, guarda o motivo em `bloqueio_resolvido` com
> quem e quando, e vai para a auditoria.
>
> A decisão **não passa por cima do §6**: SKU fora do cadastro continua
> bloqueado, agora por `sku_nao_cadastrado`. E cadastrar SKU **não solta**
> volume retido por modalidade (guarda no `server.js`, como a da divergência):
> cadastro não responde por onde a caixa sai.
>
> `modalidade = NULL` só existe hoje em volume **anterior à coluna** (e no
> retido, até a decisão). Nas contas, `NULL` é agência — o que sempre existiu.
> Volumes antigos: `node backfill_modalidade.js`.
>
> Se o ML mudar a etiqueta de vez, o conserto é no `modalidadeDespacho()`,
> com o PDF novo na mão, e o caso 15 do `teste_parse.js` (que trava os
> formatos exatos e quatro variações que têm que cair em `desconhecida`) é
> atualizado junto. Até lá a operação não para: a gestão decide na tela.

**`carga.js` é o dono único de "isto é coleta?"** (`COLETA`, `AGENCIA`,
`ehColeta`, `AGUARDA_CAMINHAO`). O upload, a lista "Faltam imprimir", o bipe
do SKU, os impressos, o relógio de despacho e as duas listas do carregamento
leem dali. Duas réguas mandariam a mesma caixa pro carro numa tela e pro
canto na outra.

### O fluxo da coleta

1. **Etiqueta de Venda**: o bipe do SKU mostra a tarja violeta **"COLETA — o
   caminhão do Mercado Livre vem buscar"** *antes* de imprimir, e repete no
   "Impresso ✓". É quem cola a etiqueta que decide onde a caixa para. A
   etiqueta sai igual e o estoque baixa igual (`−1`).
   **"Faltam imprimir" são duas listas lado a lado** — Agência e Coleta —
   e `GET /api/pendentes` devolve **uma linha por SKU e por modalidade** (o
   mesmo SKU pode estar nas duas). Em cima há o filtro **Todas / Agência /
   Coleta**, salvo por aparelho (`localStorage.etq_modo`): em "Todas" o bipe
   pega a venda mais urgente do SKU como sempre; em "Coleta" ou "Agência"
   ele **só pega vendas daquela lista** (`/api/proximo/:sku?modo=`). Quando
   o SKU só tem venda na outra lista, a resposta traz `na_outra_lista` e a
   tela diz isso — "SKU não está no lote" ali seria mentira.
2. **Carregamento**: a caixa de coleta **não aparece em "Faltam carregar no
   carro"** e não conta no "No carro X de Y". Ela tem card próprio (violeta),
   **ao lado** do carro — dois lugares físicos, duas colunas; abaixo de
   900 px empilha, carro primeiro. O card da coleta fica sempre visível para
   a coluna do carro não mudar de lugar.
   O operador bipa ao levar pro lugar reservado — o mesmo `POST /api/carregar`,
   que marca `carregado` e responde `coleta:true` com **"Está indo N peças"**.
3. ~~**Fechar coleta com o motorista**~~ — **aposentado em 26/09/2026**, virou a
   **Saída do caminhão** (bloco "A SAÍDA DO CAMINHÃO" logo abaixo). A rota
   `POST /api/coleta/fechar` só recusa, dizendo onde é agora; o que segue é a
   história de como ele funcionava. O caminhão
   do ML bipa cada caixa que leva. O operador **fotografa a tela do celular
   do motorista** com a contagem do sistema dele (o tablet abre a câmera
   direto), digita o número e fecha. **Bateu** → todas ganham `retirado_em` e
   saem do canto. **Não bateu** → nada anda: a tela lista as caixas para
   conferir uma a uma, com o motorista ali na frente. Liberar assim mesmo
   existe (o caminhão não pode ficar preso), mas grava `divergente=1` em
   `coleta_fechamento`, com quem fechou, e vai para a auditoria.

> ⚠️ **SEM A FOTO NÃO FECHA, nem com o número batendo.** Regra do dono
> (09/09/2026): *"não adianta apenas o motorista falar a quantidade — temos
> que ter prova da quantidade que ele bipou no sistema dele"*. A foto vai em
> `coleta_fechamento.foto` (arquivo em `/opt/expedicao/coletas/`, nome
> `coleta-<id>.jpeg`, gravado **dentro** da transação: disco recusou, o
> fechamento não existe). Fica **fora** de `lotes/`, que o cron apaga em 7
> dias — prova não expira junto com o PDF. Volta por
> `GET /api/coleta/foto/:id`, e a tela mostra "📷 ver a foto" em cada
> fechamento do dia. A tela reduz a foto a 1600 px em JPEG antes de mandar;
> o servidor só aceita `data:image/*` com conteúdo (foto vazia não é prova).

> **Por que a conferência é um número, e não bipe a bipe:** 50 caixas
> separadas e o motorista bipou 49 — a que faltou está no canto, no caminhão
> sem bipe, ou em lugar nenhum. Depois que o caminhão sai, ela vira
> reclamação do cliente semanas depois, sem ninguém saber por onde sumiu. O
> número na frente do motorista, **com a foto**, é a única hora em que isso
> ainda se resolve — e a única prova que sobra se não se resolver.

> **O relógio de despacho é da agência.** `/api/expedicao/status` conta em
> `pendentes` só a agência e devolve a coleta em `pendentes_coleta`. Contar a
> coleta no relógio deixaria a tela vermelha por caixa que não vai no carro.

> **`carregado_em` na coleta é a hora em que a caixa foi pro canto**, não a
> hora em que o caminhão levou — essa é `retirado_em`. Relatório que conta
> saída por `carregado_em` continua certo (é o mesmo dia); quem precisar da
> hora real da retirada lê `retirado_em`.

> ⚠️ **O CAMINHÃO LEVA ANTES DA DATA, E O CANTO CHEIO DE CAIXA FUTURA É NORMAL**
> (dono, 25/09/2026). A equipe imprime a etiqueta da coleta e já bipa a caixa
> pro canto, mesmo com despacho semanas à frente. Em 25/09 eram **28 caixas** no
> canto, com despacho de 28/09 a 08/10, e o motorista leva todas. Por isso:
>
> - **O fechamento não olha a data de despacho** (`AGUARDA_CAMINHAO` não filtra
>   dia), e nisso está certo: filtrar por vencimento faria o fechamento divergir
>   toda vez que o motorista levasse as futuras. **O defeito é outro, e é o que a
>   spec `SAIDA-E-DUPLA-CONFERENCIA` veio corrigir:** ele compara o canto
>   **inteiro** com o motorista, então um dia sem fechar contamina todos os
>   seguintes. Foi o que aconteceu — o "Fechar coleta" de 10/09 não foi adotado,
>   o canto acumulou, e o número nunca mais bateu. A fase 3 troca isso por uma
>   saída por caminhão, que só olha o que saiu nela.
> - Essas caixas **somem da faixa azul** do Carregamento (ela só conta o
>   `embalado` futuro ainda na prateleira) e **só entram em "Peças adiantadas"
>   no dia do fechamento**, todas de uma vez. Faixa azul pequena com canto cheio
>   não é número errado.
> - O painel "Pra despachar depois" da Etiqueta de Venda só lista o `pendente`:
>   com as etiquetas futuras já impressas, ele **some**, e também não é defeito.
>
> ⚠️ **E ÀS VEZES O CAMINHÃO LEVA TAMBÉM CAIXA DA AGÊNCIA, e isso o sistema
> ainda não sabe registrar.** A caixa da agência é bipada no carro e nunca entra
> no canto. O motorista mostra mais caixas do que o sistema tem, e o fechamento
> acusa divergência sem ter o que explicar. Para fechar, alguém usa o "liberar
> assim mesmo", e a divergência de verdade (caixa sumida) passa a se misturar com
> essa. A resposta aprovada é a **troca de porta** da spec
> `docs/specs/SAIDA-E-DUPLA-CONFERENCIA.md` (fases 3 e 4): a caixa sai por onde
> saiu de verdade (`saiu_por`), e `lote.modalidade` **não muda**. O rascunho
> `COLETA-LEVA-AGENCIA.md`, que propunha trocar a modalidade, foi substituído e
> está em `docs/arquivo/`. **Existe pelas duas portas desde 26/09/2026:** pelo
> caminhão, o botão "foi no caminhão" (fase 3); pelo carro, a caixa de coleta
> bipada na viagem à agência (fase 4). Os dois blocos estão logo abaixo.

### ⚠️ QUEM FEZ, E A LIMPEZA DO PASSIVO (26/09/2026, fase 1 da spec `SAIDA-E-DUPLA-CONFERENCIA`)

A spec troca o "Fechar coleta" por uma **dupla conferência** (duas contagens,
por logins que podem ser diferentes) e uma **saída com foto por caminhão e por
viagem à agência**. A fase 1 é o chão disso, e **não muda nada na tela**:

| Onde | O quê |
|---|---|
| `lote.impresso_por` | quem imprimiu — o **bipe 1**. Gravado no `POST /api/embalar` |
| `lote.conferido_por`, `conferido_em` | quem bipou a caixa no Carregamento de hoje — vira o **bipe 2** na fase 2 |
| `lote.no_carro_*`, `saida_id`, `saiu_em`, `saiu_por` | nascem vazias; são das fases 2 a 4 |
| tabela `saida` (`saida_schema.js`, dono único do CREATE) | uma linha por caminhão ou viagem. O `coleta_fechamento` fica como história |

> ⚠️ **`impresso_por` É A PRIMEIRA IMPRESSÃO, E A REIMPRESSÃO NÃO O TOCA.** É a
> armadilha #1-B pela porta do nome: papel repetido não é outra contagem. Se a
> reimpressão sobrescrevesse, a caixa passaria a dizer que foi impressa por quem
> só destravou a impressora — e a "segunda pessoa" da fase 2 apareceria onde não
> houve. Sem ninguém logado o campo fica **vazio**, nunca um nome inventado.

> ⚠️ **`saiu_por` NÃO É `modalidade`, E UMA NÃO ESCREVE NA OUTRA.** A modalidade
> é o que a etiqueta disse (armadilha #21) e continua decidida pela etiqueta ou
> pela gestão; `saiu_por` é por onde a caixa saiu de verdade. O motorista levar
> caixa da agência é **bom** (decisão 6 da spec), e não reescreve a etiqueta.

**O passivo:** `node fechar_saida_passivo.js` (simula) e `--aplicar` (faz
`await db.backup()` antes). Fecha numa única saída `tipo='passivo'` as caixas de
coleta paradas em "esperando o caminhão" — o dono confirmou em 25/09/2026 que
todas já saíram. A régua é o `AGUARDA_CAMINHAO` do `carga.js`, a mesma do card da
tela, e fica de fora o volume do modo teste.

> ⚠️ **CADA CAIXA SAI NA DATA DO BIPE DELA (`carregado_em`), NUNCA HOJE** — a
> regra dos scripts de passivo do §5. É o limite de baixo honesto: a caixa não
> saiu antes de ir pro canto, e a hora real da retirada não existe em lugar
> nenhum. `retirado_em` recebe o mesmo carimbo, e por isso **essas caixas entram
> em "Peças adiantadas" nas datas do bipe** (as de 25/09 tinham despacho de
> 28/09 a 08/10: adiantadas de verdade). Um pico nos "últimos 30 dias" logo
> depois do `--aplicar` é isto, não defeito.

> O script **recusa** banco sem as colunas novas, dizendo para subir o servidor
> antes: rodá-lo antes do deploy fecharia caixa sem ter onde gravar a saída. E é
> idempotente — depois de aplicado as caixas ganham `retirado_em` e saem do
> critério.

**Rode `node teste_saida.js` (47 casos) ao mexer no `POST /api/embalar`, no
`POST /api/reimprimir`, no bipe do `carreg_route.js`, no `saida_schema.js` ou no
script.** Quatro defeitos foram reintroduzidos um a um para provar que o teste
pega cada um: a reimpressão sobrescrevendo o nome (3 casos), a saída carimbada
em `now` (2), o critério largo pegando o `embalado` (4) e o bipe sem gravar quem
(2).

> ✅ **NO AR EM 26/09/2026** (PR #135): o dono fez o deploy e disse *"ficou
> certo"*.
>
> ✅ **O PASSIVO FOI FECHADO EM 26/09/2026: 399 CAIXAS, e não 28.** Saída #1
> (`tipo='passivo'`), com backup em
> `backups/antes-saida-passivo-2026-09-26T10-36-34-486Z.db`. As caixas iam de
> 10/09 a 25/09, de 14 a 46 por dia: **o "Fechar coleta" não foi usado nem uma
> vez desde que nasceu**, e o canto nunca esvaziou no sistema. As 28 de 25/09
> eram só as de despacho futuro; o resto já tinha vencido e não aparecia na
> faixa azul, que só olha o futuro.
>
> ⚠️ **A simulação e o `--aplicar` rodaram colados** (os dois comandos foram
> colados juntos no terminal), então a lista não foi conferida antes de
> gravar. A decisão 8 da spec cobre o que estava no canto em 25/09; se alguma
> caixa bipada no fim do dia 25 ainda estiver fisicamente lá, o caminho de
> volta é pelo backup acima ou reabrindo só aquele id.
>
> ✅ **O dono conferiu o canto depois: está vazio** (26/09/2026). As 399 saíram
> de verdade, e nada precisou ser reaberto.
>
> ⚠️ **Os nomes (`impresso_por`, `conferido_por`) ainda não foram vistos no
> dado real:** até a conferência não houve caixa impressa nem bipada depois do
> deploy. As colunas e a tabela `saida` existem no banco de produção. Prova que
> não foi feita se escreve como não feita (§4).

### ⚠️ O SEGUNDO PASSIVO: CAIXAS QUE NUNCA FORAM BIPADAS (01/10/2026)

A contagem por fila no servidor, em 01/10/2026, mostrou o canto **vazio** (a
limpeza de 26/09 segurou) e duas outras filas cheias:

| Fila | Caixas | Período |
|---|---|---|
| coleta com etiqueta impressa e **nunca bipada pro canto** | **460** | 10/09 → 30/09 |
| agência com etiqueta impressa e **nunca bipada** (nem área, nem carro) | 26 | 04/09 → 30/09 |

> ⚠️ **460 CAIXAS EM TRÊS SEMANAS É PRATICAMENTE TODA A COLETA: A EQUIPE
> IMPRIMIA E O CAMINHÃO LEVAVA SEM NINGUÉM BIPAR PRO CANTO.** Esse é o sinal
> que importa mais que o passivo. Sem o bipe pro canto a Saída do caminhão
> (fase 3) não tem o que contar, e esta lista volta a crescer no dia seguinte
> à limpeza. **Limpar só vale junto com o bipe acontecendo.**

**A limpeza de 26/09 não as acha, e é por desenho:** ela fecha o
`AGUARDA_CAMINHAO`, que é caixa **bipada** pro canto (`carregado`). Estas
pararam um passo antes (`embalado`). E o `regularizar_saida.js` também não
serve: ele marca `carregado` sem gravar saída, e as 460 iriam todas parar no
card "esperando o caminhão". A tela trocaria uma lista imensa por outra.

`node fechar_saida_passivo.js --nao-bipadas --ate AAAA-MM-DD` (simula) e
`--aplicar` (com `await db.backup()` antes). Grava **uma** saída
`tipo='passivo'` e, em cada caixa, `carregado`, `saida_id` e `saiu_por` (coleta
ou agência, pela modalidade).

> ⚠️ **A DATA DE CORTE É OBRIGATÓRIA, E É DE QUEM VIU AS CAIXAS SAÍREM.**
> "Etiqueta impressa e sem bipe" também descreve a caixa impressa hoje cedo,
> que está na pilha esperando o caminhão de hoje. O dono deu **30/09/2026**. O
> script recusa sem a data, com data fora do formato e com data no futuro.

> ⚠️ **O CARIMBO É O DIA DO DESPACHO ÀS 15:00 (§5), COM DUAS GUARDAS.**
> Despacho **anterior** à impressão vale o dia da impressão: a caixa não saiu
> antes de ter etiqueta. E o carimbo nunca fica antes do próprio `embalado_em`
> (a impressa às 17:20 sai às 17:20). Sem despacho lido, vale o dia da
> impressão. Com isso nenhuma conta como "saiu adiantado": saiu no dia dela, que
> é o que se sabe. Não há hora real da retirada em lugar nenhum.

> ⚠️ **FICAM DE FORA:** despacho depois de hoje (venda futura não foi
> despachada, §5; em 01/10 era **1** caixa), a agência já **conferida** na área
> ou no carro (essa tem bipe, e o lugar dela é a viagem), caixa já ligada a uma
> saída e o modo teste. `retirado_em` só na coleta, como a viagem e o caminhão
> fazem. `conferido_em` **fica vazio**: ninguém conferiu, e o campo diz isso.
> Estoque e modalidade não se mexem, porque a baixa aconteceu na impressão.

**Rode `node teste_saida.js` (47 casos; os 21 últimos são este grupo)** ao
mexer no script. Oito defeitos foram reintroduzidos um a um: carimbo em `now`
(reprova 4), corte ignorado (3), despacho futuro fechado (3), conferida e no
carro fechadas (3), `retirado_em` na agência (1), a coleta sem `retirado_em`
(1) e o carimbo antes da impressão (1). Tirar a exigência da data só reprova
quando a recusa do formato sai junto, porque são duas camadas.

> ✅ **APLICADO EM PRODUÇÃO EM 01/10/2026 (PR #162): 485 CAIXAS, saída #3.**
> Desta vez a simulação e o `--aplicar` rodaram **separados**, com a lista
> conferida no meio: `485 (coleta 459 · agência 26)`, e a diferença para os
> 460 da contagem era exatamente a **1 caixa de despacho futuro**, que ficou de
> fora. Backup em `backups/antes-nao-bipadas-2026-10-01T10-34-17-249Z.db`.
> A segunda rodada respondeu *"Nada a fechar"* (idempotente), e a contagem por
> fila depois do `--aplicar` ficou só com aquela caixa (coleta impressa em
> 29/09, despacho futuro): agência e canto zerados.
>
> ⚠️ **COLAR A SAÍDA DO SCRIPT DE VOLTA NO TERMINAL EXECUTA AS LINHAS.** Na
> conferência, o texto da simulação foi colado no shell, e o bash tentou rodar
> cada linha. A linha *"Para gravar: node … --aplicar"* só não gravou porque
> começa com `Para`, que não é comando. Por isso a última linha da simulação
> **não** deve ser um comando executável sozinho, e a conferência de que nada
> foi gravado foi a simulação seguinte ainda dizer 485.
>
> ⚠️ **ISSO LIMPA O PASSADO, E NÃO O HÁBITO.** A prova que importa é a fila 3
> (*coleta impressa e não bipada pro canto*) **não voltar a crescer** nos
> próximos dias. Se crescer, a equipe continua imprimindo sem bipar, e a Saída
> do caminhão segue sem o que contar.

### ⚠️ A CONFERÊNCIA DA PILHA (26/09/2026, fase 2 da spec `SAIDA-E-DUPLA-CONFERENCIA`)

O Carregamento ganhou, acima das duas portas, o card **"Conferência da pilha —
etiquetas impressas hoje"**: `impressas 70 · conferidas 68 · faltam 2`. É a
segunda contagem da dupla conferência: o bipe 1 é a impressão (`impresso_por`),
o bipe 2 é o bipe **desta tela** (`conferido_por`). A conta fecha caixa a caixa
— `impressas = conferidas + faltam` —, e o que falta tem nome.

`carga.js → pilhaDaArea(db)` é o dono único; o `GET /api/carregamento` a devolve
em `pilha`. Tablet com a página antiga ignora o campo; servidor antigo não o
manda, e o card some.

> ⚠️ **OPÇÃO A, DECIDIDA PELO DONO EM 26/09/2026: O BIPE CONTINUA UM SÓ.** Na
> coleta, conferir é levar pro canto, como sempre foi. **Na agência, conferir e
> pôr no carro continuam sendo o mesmo bipe** até a fase 4 separar os dois (a
> viagem à agência com foto). Nada mudou para quem bipa: o que nasceu foi a
> conta. **Separados na fase 4 (26/09/2026, D1): na agência este bipe hoje só
> confere, e o carro é o bipe da viagem** (bloco "A VIAGEM À AGÊNCIA", abaixo). Caixa conferida é a que tem `conferido_em` **ou** está `carregado` —
> a segunda metade cobre o que foi bipado antes da fase 1 gravar o nome.

> ⚠️ **A PILHA É O DIA DA IMPRESSÃO (`embalado_em`), e a de ontem não some.**
> Caixa impressa num dia anterior e ainda não conferida sai numa linha âmbar
> própria, em cima — é a armadilha #9 pela porta da conferência: volume com
> etiqueta está fisicamente na fábrica, e não existe hora em que ele deixe de
> estar. Ela **não** entra na conta de hoje: a conta de hoje fala das
> etiquetas de hoje, e misturar faria o número nunca fechar.

> ⚠️ **A ADIANTADA ENTRA NA PILHA, MARCADA** (decisão 4 da spec). Ela foi
> impressa e tem que ser contada; a tarja `adiantada · despacha 02/10` diz que
> ela não é carga de hoje. `pendente` e `bloqueado` não entram — não têm
> etiqueta —, e o bipe continua recusando o `pendente` (§5, #27).

> ⚠️ ~~**"SEM SEGUNDA PESSOA" SÓ MARCA, NUNCA TRAVA** (decisão 2)~~ — **MUDOU
> EM 01/10/2026: hoje o bipe RECUSA, sem liberação**, e a marca ficou só como
> história da caixa conferida antes disso (bloco "QUEM IMPRIMIU NÃO CONFERE",
> logo abaixo). A comparação ignora espaço e maiúscula (`" ana "` é
> `"Ana"`). **Faltando qualquer um dos dois nomes a caixa é "sem registro",
> nunca "mesma pessoa"**: vazio igual a vazio não é a mesma pessoa, é não
> saber quem fez — e sem essa guarda dois bipes sem login batiam.

> ⚠️ **AS LISTAS DA PILHA NASCEM RECOLHIDAS, e isso só apareceu abrindo a
> tela.** Com o bipe único, as caixas que faltam conferir são **as mesmas** das
> listas do carro e da coleta logo abaixo: aberta, a tela dizia a mesma coisa
> duas vezes — o que o dono leu como "duas vendas" na caixa de várias (opção B,
> §5, 25/09/2026). O número fica sempre à vista; a lista abre com um toque e
> continua aberta nos refreshes de 4 s (o `<details>` não é redesenhado). Na
> fase 4, quando conferir e pôr no carro se separarem, as listas deixam de
> coincidir e isso pode ser revisto. **Separaram-se em 26/09/2026 e ficaram
> recolhidas mesmo assim**: a lista do carro passou a marcar cada caixa como
> `✓ na área` ou `falta conferir`, e é ela que a bancada lê.

**Rode `node teste_area.js` (29 casos) ao mexer no `pilhaDaArea`, no bipe do
`carreg_route.js` ou no `GET /api/carregamento`.** Cinco defeitos foram
reintroduzidos um a um: a adiantada fora da pilha (6 casos), a de ontem sumindo
(1), o nome sem normalizar (1), a conta sem andar no bipe (7) e vazio igual a
vazio virando "mesma pessoa" (1).

> ✅ **NO AR EM 26/09/2026** (PR #138): o dono fez o deploy e disse *"ficou
> certo"*.
>
> ⚠️ **Isso prova que a tela abre e o card aparece; ainda não prova a conta
> com o dia real.** O teste é que as `impressas` de um dia de expedição
> fechem com `conferidas + faltam`, e que os nomes de quem imprimiu e de quem
> conferiu apareçam no "sem segunda pessoa" quando for o caso — é a mesma
> prova pendente da fase 1. Prova que não foi feita se escreve como não feita
> (§4).

### ⚠️ QUEM IMPRIMIU NÃO CONFERE (01/10/2026, fase 1 da spec `CARREGAMENTO-SEGUNDA-PESSOA`)

**Decisão do dono, e é a decisão 2 de 25/09 mudando.** O bipe do Carregamento —
o da **área** (agência) e o do **canto** (coleta) — recusa quando o login é o
mesmo de quem imprimiu a etiqueta de venda (`impresso_por`):

```
✋ OUTRA PESSOA TEM QUE CONFERIR
Maria Souza · NF 7011 · BK140140BEGE
Etiqueta feita por Ana Paula — o mesmo login que está nesta tela.
[👤 Trocar de pessoa]
```

> **Por que mudou:** a bancada imprime e não repara que a venda leva mais de uma
> persiana. Só marcar deixava a **mesma atenção** conferir no Carregamento, e
> ninguém olhava a marca depois. O Carregamento é a última vez que alguém está
> com a caixa na mão antes do carro ou do caminhão.

> ⚠️ **O NOME DE QUEM IMPRIMIU APARECE** (pedido do dono): na recusa, no bipe
> aceito (*"Etiqueta feita por Ana Paula"*) e em cada linha da pilha. É o nome do
> login. A régua é `carga.js → mesmaPessoa`: ignora espaço e maiúscula, e **vazio
> nunca é igual a vazio** — caixa sem `impresso_por` (ou bipe sem login) passa.

> ⚠️ **SÓ A ÁREA E O CANTO.** O bipe da viagem (pôr no carro) e as sobras do
> caminhão **não** travam: ali a caixa já foi conferida por outra pessoa.

> ⚠️ **NÃO HÁ LIBERAÇÃO, E ISSO É DECISÃO DO DONO (01/10/2026).** O cruzamento
> é automático e vale para todo login, inclusive o de acesso total: *"vão ter
> pessoas que podem imprimir etiqueta de venda e pessoas que podem fazer
> conferência — a única coisa é esse cruzamento"*. A primeira versão tinha uma
> liberação por pessoa e por dia, com motivo, e saiu antes do deploy: porta de
> liberar é o caminho que vira rotina, e aí a regra deixa de existir.
>
> **O custo, escrito para não se descobrir na expedição:** num dia em que só
> uma pessoa trabalha na expedição, as caixas que ela imprimiu esperam outra
> pessoa para serem conferidas. Não existe botão para isso, de propósito.
>
> A marca *"sem segunda pessoa"* da pilha continua existindo, mas só como
> **história**: caixa conferida pelo mesmo login antes de 01/10/2026.

> **"Trocar de pessoa" sai e volta pela MESMA tela de login** (`/login?r=/carregamento`):
> uma segunda grade de nomes e PIN aqui dentro seria uma segunda porta de entrada.

> ⚠️ **TABLET COM A PÁGINA ANTIGA EM CACHE** mostraria a recusa como "Etiqueta não
> reconhecida". O refresh forçado no deploy é obrigatório.

> ⚠️ **O "ETIQUETA FEITA POR" TEM LINHA PRÓPRIA (05/10/2026).** Ele saía em
> `inline-block`, grudado no número de antes: *"prontas pro carro 1Etiqueta
> feita por Ana Paula"* — o "1" se lia junto com o nome. Achado abrindo a tela;
> o último caso do teste lê o CSS da `.quem`. ✅ **No ar e conferido pelo dono
> em 05/10/2026** (PR #190): *"ficou certo"*.

**Rode `node teste_segunda_pessoa.js` (25 casos) ao mexer no bipe do
`carreg_route.js` ou no `mesmaPessoa`.** Três defeitos foram reintroduzidos um a
um: sem a trava (reprova 13), vazio igual a vazio (1) e o bipe aceito sem o nome
de quem imprimiu (3). E há caso travando que a rota de liberação **não existe**.

> ✅ **NO AR** (PR #164), confirmado pelo dono em 02/10/2026.
>
> ✅ **METADE CONFERIDA NA FÁBRICA EM 05/10/2026:** a primeira caixa de várias
> foi conferida no Carregamento por **outra pessoa**, que não imprimiu a
> etiqueta, e passou (bloco abaixo).
>
> ⚠️ **A OUTRA METADE AINDA NÃO:** ninguém relatou o bipe **recusado** para quem
> imprimiu (*"OUTRA PESSOA TEM QUE CONFERIR"*). A prova é essa recusa
> aparecendo de verdade num dia de expedição. Prova que não foi feita se
> escreve como não feita (§4).

### ⚠️ A CAIXA DE VÁRIAS, PEÇA A PEÇA (02/10/2026, fase 2 da spec `CARREGAMENTO-SEGUNDA-PESSOA`; a lista aparece desde 05/10/2026)

```
bipe da etiqueta de venda  →  📦 ESTA CAIXA LEVA 3 PERSIANAS · 0 de 3   (âmbar, COM a lista)
bipe de cada etiqueta de SKU, colada por fora  →  1 de 3 · 2 de 3 · 3 de 3
bateu tudo  →  conferida (agência, fica na área) ou vai pro canto (coleta), como sempre
SKU que não está na caixa, ou um a mais  →  PARA, e só agora mostra os dois lados
```

`POST /api/carregar/peca` (`{lote_id, sku}`) e `POST /api/carregar/recomecar`,
com a chave do bipe (`carregamento.executar`). O contador é
`lote_item.conferidos_carga`, coluna própria (o `conferidos` é o bipe da
Etiqueta de Venda, de outra pessoa e outro momento). A régua de "caixa de
várias" é o `VARIAS()`, que **saiu do `exp_route.js` e mora no `carga.js`**.

> ⚠️ ~~**A RESPOSTA NÃO TRAZ OS SKUs**~~ — **MUDOU EM 05/10/2026, decisão do
> dono: a lista APARECE.** De 02 a 05/10 a conferência foi cega (a lição do
> inventário, §18). O dono decidiu o contrário depois de ver a lista na Etiqueta
> de Venda (NF 7446): *"no carregamento tem que bipar os SKUs das embalagens com
> mais de um — então o certo seria aparecer a lista"*. Quem confere tem a caixa
> na mão e precisa saber o que procurar nas etiquetas coladas por fora.
>
> - A resposta do bipe (`conferir_pecas`, o bipe de peça, o "Recomeçar" e a
>   divergência) traz `pecas`: cada SKU com o que ele é, a quantidade e quantas
>   já foram bipadas; a tela âmbar marca ✓ linha a linha.
> - As listas do Carregamento (faltam no carro, coleta, canto, pilha, saída do
>   caminhão e viagem) trazem `itens`, e a linha da caixa de várias mostra os
>   SKUs no lugar do `lote.codigo` solto — sozinho, ele é o PRIMEIRO item e fazia
>   dois SKUs diferentes parecerem um. A régua é a mesma da Etiqueta de Venda
>   (`pecas_caixa.js`, §5) e, na tela, `skuDaLinha` / `pecasLinhas`.
> - **O que a conferência prova mudou:** antes, que a pessoa achou as peças sem
>   saber quais eram; agora, que **cada peça foi bipada**. A trava continua
>   inteira: SKU fora da caixa ou um a mais PARA e vai para a auditoria, a caixa
>   não anda sem todas, e quem imprimiu continua sem conferir.
>
> ✅ **NO AR EM 05/10/2026** (PR #189): o dono fez o deploy e disse *"apareceu a
> lista no carregamento"*.
>
> ✅ **E A CAIXA DE VÁRIAS FOI CONFERIDA DE VERDADE EM 05/10/2026:** o dono
> conferiu uma no Carregamento e disse *"ficou certo"* — a tela âmbar marcando
> os SKUs bipados e a lista no "Conferida ✓", que eram os dois lugares que
> faltavam.

> ⚠️ **AS BARREIRAS SÃO AS MESMAS NO BIPE DE PEÇA** (`barrar()` no
> `carreg_route.js`): cancelada, retida, já saída, sem etiqueta, já conferida e
> **quem imprimiu** não andam nem peça a peça. E a caixa de várias **substitui**
> o segundo bipe cego do `conf_carregamento` — aquele compara com um SKU só.

> ⚠️ **O GUARD DE 700 ms ESTÁ NA TELA**, pela mesma razão da Etiqueta de Venda
> (§5, #23): o leitor repete o código numa leitura só, e aqui isso contaria uma
> persiana a mais. **A divergência não zera a contagem**; quem zera é o
> "Recomeçar esta caixa". **"Deixar esta caixa"** larga a caixa sem apagar o que
> foi bipado: voltar a ela continua de onde parou.

> ⚠️ **NA IMPRESSÃO, A FRASE DA CAIXA (`fita(n)`) GANHOU A SEGUNDA PARTE** (P6):
> *"Tire a etiqueta de SKU do saco de cada persiana e cole por fora da caixa."*
> São as **do saco**, e não cópias — cópia não prova que a persiana entrou. Na
> mesma função, para sair igual nos quatro lugares.

> ⚠️ **A CAIXA DE UMA PERSIANA NÃO MUDOU**, e a de **1 SKU × 2** é caixa de
> várias (conta persiana, nunca linha). Tablet com a página antiga em cache
> mostraria "Etiqueta não reconhecida" no lugar da tela âmbar: **refresh forçado
> no deploy**.

**Rode `node teste_pecas_carga.js` (37 casos) e `node teste_carga.js` (60) ao
mexer no bipe do `carreg_route.js`, no `VARIAS` ou na tela do Carregamento.**
Desde 05/10/2026 os casos exigem a lista (a resposta sem `pecas` reprova 2; as
listas sem `itens`, a pilha sem `itens` e a tela com o código solto reprovam 1
cada, nos 9 últimos do `teste_carga.js`). Os seis defeitos da fase 2: a
resposta entregando o SKU (hoje é o contrário), o bipe de peça sem as
barreiras (2), contar linha em vez de persiana (4), o "um a mais" passando (2),
a caixa de várias andando direto (19) e a tela sem o guard de 700 ms (1 — o
caso olhava só o número "700", que também está no comentário, e foi apertado
nessa rodada). O `teste_carga.js` passou a conferir a caixa de várias peça a
peça no cenário do adiantado.

> ✅ **NO AR** (PR #183), confirmado pelo dono em 02/10/2026.
>
> ✅ **CONFERIDO NA FÁBRICA EM 05/10/2026:** a primeira caixa de várias passou
> peça a peça pelo Carregamento, **conferida por outra pessoa** (não a que
> imprimiu), e o dono disse *"ficou certo"*.
>
> ⚠️ **O QUE ELE NÃO DISSE, E POR ISSO NÃO ESTÁ ESCRITO COMO DITO:** se as
> etiquetas coladas por fora eram as do saco (P6), e a divergência (SKU fora da
> caixa ou um a mais) ainda não apareceu num caso real. Prova que não foi feita
> se escreve como não feita (§4).

### ⚠️ O MOTORISTA RECUSOU — a caixa volta ao estoque em dois passos (02/10/2026, spec `RECUSA-DO-MOTORISTA`)

> ⚠️ **SUBSTITUÍDO EM 22/10/2026** pela fase 2-B da `CONFERENCIA-E-BAIXA`: o motorista
> virou um dos motivos do **↩ Sobrou**, que marca e devolve o saldo na própria
> Conferência, bipando o SKU (R-REC-01). O texto abaixo é a história dos dois passos.

O motorista do ML bipa a caixa e o sistema dele diz **recusada**: a venda foi
cancelada depois da etiqueta sair, e o relatório ainda não chegou. Até aqui a
caixa ficava `embalado`/`carregado` e a Mesa recusava a volta ao estoque com
*"este volume não está cancelado"*. Decisão do dono, dois passos:

```
1. EXPEDIÇÃO  Carregamento → 🚫 Motorista recusou → bipe → confere cliente/NF/peças → confirma
              → `cancelado`, origem `motorista`, `cancelada_por` · sai do canto, do carro e da saída
              → aviso: "Volte a peça ao estoque: tire a etiqueta de venda e ponha a persiana na prateleira"
2. ADMIN      Correções (Mesa) → "A persiana voltou" → `cancelamento` POR PEÇA no livro
```

`cancelada_dominio.recusar` é a régua (a mesma do cancelamento do relatório:
`cancelada_estagio`, o carro limpo); `POST /api/carregamento/recusa` é a porta,
com `carregamento.executar` — **não nasceu chave nova**. Sem `confirmar` ela só
mostra a caixa; com `{id, confirmar:true}` ela marca.

> ⚠️ **A MARCAÇÃO NÃO MEXE NO SALDO.** Quem diz que a persiana está na
> prateleira é uma pessoa, pela Mesa, com motivo — é a D3 da VENDAS F2 (§3). A
> Mesa mostra a nota *"o motorista recusou… confira antes de dizer que voltou"*.

> ⚠️ **SÓ A CAIXA COM ETIQUETA E AINDA NA FÁBRICA** (área, canto ou carro de
> viagem aberta), e cada recusa diz o porquê: sem etiqueta (nada baixou), já
> saiu (é devolução, §9), já cancelada (está no card).

> ⚠️ **A CAIXA DE VÁRIAS É CANCELADA INTEIRA, com `cancelada_varias=0`**, e a
> Mesa oferece o "voltou" por peça. Não contradiz a regra do relatório: lá o ML
> cancela UM item e não diz qual peça é; aqui o motorista recusou a caixa toda.

> ⚠️ **SOB MEDIDA É MARCADA, MAS O AVISO NÃO MANDA PÔR NA PRATELEIRA** — ela
> não tem estoque (§7), e a Mesa não gera movimento.

> O bipe normal do Carregamento continua recusando a caixa, com o título
> **RECUSADA PELO MOTORISTA** e quem marcou. O relatório que chegar depois acha
> a venda já marcada (`ja_marcada`) e não mexe na origem.

**Rode `node teste_recusa_motorista.js` (59 casos) ao mexer no `recusar`, na
rota ou no botão.** Escrito antes do código; sete defeitos reintroduzidos um a
um: não tirar do carro (reprova 1), aceitar pendente (2), aceitar a que já saiu
(1), mexer no saldo ao marcar (8), mandar o sob medida para a prateleira (1),
não gravar quem marcou (2) e não auditar (1).

> ⚠️ **AINDA NÃO FOI CONFERIDO NA FÁBRICA.** A rodada foi num navegador meu, a
> 1440 e a 400 px. A prova é a **primeira caixa recusada de verdade**, marcada
> pela expedição e aceita pelo admin na Mesa.

### ⚠️ A SAÍDA DO CAMINHÃO (26/09/2026, fase 3 da spec `SAIDA-E-DUPLA-CONFERENCIA`)

O "Fechar coleta" de 10/09 comparava o **canto inteiro** com o motorista: um dia
sem fechar estragava todos os seguintes, a equipe não aderiu, e 399 caixas
acumularam. No lugar dele, **uma saída por caminhão**, no card da coleta do
Carregamento (`saida_route.js`):

```
🚚 Saída do caminhão  →  a tela fica violeta e o bipe passa a querer dizer SOBROU
bipe o que ficou       →  ou "Não ficou nada" — um dos dois é obrigatório
foto + número          →  da tela do celular do motorista
fechar                 →  saíram = no canto sem saída − sobras + "foi no caminhão"
```

**Bateu:** cada caixa grava `saida_id`, `saiu_em`, `saiu_por='coleta'` e
`retirado_em`, que continua alimentando "Peças adiantadas". **Não bateu:** nada
anda, e a tela mostra as caixas da saída, com nome e NF, e as impressas fora da
conta. **Liberar com divergência** é outra rota, com a chave `saida.liberar` e
motivo obrigatório; grava quem liberou e vai para a auditoria (decisão 7).

A régua do universo é do `carga.js` (`NA_SAIDA`, `PODE_TER_IDO`), e a busca
pelo código bipado virou `acharVolumes`, a mesma do bipe do carro. A foto é do
`foto.js`, a mesma régua do fechamento antigo.

> ⚠️ **O PASSO DAS SOBRAS É DECLARADO, NUNCA SUPOSTO.** Fechar sem bipar sobra
> nem tocar "não ficou nada" é recusado. Se valesse, quem pula o passo diria
> "saiu tudo" sem saber, e a divergência de verdade viraria ruído.

> ⚠️ **A CONTA DO CAMINHÃO SÓ OLHA O CANTO DA COLETA** (decisão A da fase 3, e
> D2 da fase 4, 26/09/2026). Na fase 3 a razão era o bipe único: a agência
> conferida estava no carro. Na fase 4 ela passou a ficar **no chão da área** —
> e continua fora da conta, por decisão do dono: somada, obrigaria a bipar como
> "sobra" cada caixa de agência parada ali, às vezes 40, a cada caminhão. A de
> agência que o motorista levou entra pelo botão abaixo.

> ⚠️ **O BIPE SÓ QUER DIZER "SOBROU". A TROCA DE PORTA É POR BOTÃO** (decisão B,
> 26/09/2026). A caixa impressa fora da conta que o motorista levou (de agência
> na área, conferida ou não, e de coleta que foi direto da impressora — toda
> `embalado`) entra pelo botão **"foi no caminhão"** da lista de divergência.
> A que já está **no carro** não entra desde a fase 4: o caminhão não leva o que
> está dentro do carro. O
> mesmo bipe querendo dizer duas coisas conforme o estado da caixa é como se erra
> de luva na mão. Ela sai com `saiu_por='coleta'`, vira `carregado`, e **a
> `modalidade` não muda** (decisão 6). `pendente` nunca entra: sem etiqueta, não
> baixou do estoque (§5, #27).

> ⚠️ **QUEM FECHOU A SAÍDA NÃO CONFERIU A CAIXA (02/10/2026).** Até aqui a caixa
> que ninguém tinha conferido saía com `conferido_por` = **quem fechou a saída** —
> uma pessoa que nunca a bipou. E se fosse quem imprimiu, a pilha ainda a chamava
> de *"conferida por quem imprimiu, antes da trava de 01/10"*, falso duas vezes.
> Hoje ela sai **sem conferência**: `conferido_por` e `conferido_em` ficam
> vazios, como no passivo das não bipadas. A agência **já conferida** na área
> mantém quem a conferiu.
>
> A pilha a mostra numa **linha própria** da nota — *"N foram no caminhão sem
> conferência: cliente (NF)"* —, separada de "sem registro": lá é não saber quem
> fez; aqui se sabe que **ninguém** conferiu, e é a única das duas que interessa
> olhar. A régua é `carregado`, **numa saída**, sem `conferido_em`; a caixa
> carregada **sem** saída e sem conferência (anterior aos nomes) continua "sem
> registro". As que já saíram antes de 02/10 ficam como estão — com o nome de
> quem fechou; o histórico não foi reescrito.
>
> ⚠️ **E ELA AINDA CONTA EM "CONFERIDAS"** — anotado, não consertado: a pilha
> conta `carregado` como conferida (fase 2), então a tela pode dizer *"Todas as
> impressas hoje foram conferidas"* logo acima da linha que diz que ninguém
> conferiu. Mudar a conta da pilha é outra decisão.

> ⚠️ **E A CAIXA DE AGÊNCIA QUE O CAMINHÃO LEVOU NÃO CONTA NO "NO CARRO".** Achado
> abrindo a tela: o contador do carro contava `carregado_em` de hoje da agência,
> e a troca de porta o inflava. Com isso o carro fecharia com uma caixa a menos
> dentro. Hoje ele ignora quem saiu com `saiu_por='coleta'`, e há caso travando.

> ⚠️ **COM A SAÍDA ABERTA, AS LISTAS DO CANTO SOMEM DA TELA.** Elas repetiam as
> mesmas caixas da conta e empurravam o painel da saída para fora da tela num
> notebook de 15". A conta e as sobras são o que importa naquela hora, e a lista
> volta quando a saída fecha ou é cancelada.

> ⚠️ **A CAIXA ESQUECIDA NO CANTO AINDA ENTRA NA CONTA SEGUINTE, MARCADA.** Caixa
> bipada pro canto num dia anterior e sem saída (um caminhão que ninguém
> registrou) aparece com a tarja `⏳ bipada dd/mm`. A saída não sabe se ela foi
> num caminhão não registrado ou se ainda está lá; quem sabe é quem olha o
> canto. Se foi, a conta não bate, e o caminho é **liberar com motivo**.

> **`saida.liberar` é nível `supervisor`, sensível, e nasceu nos setores
> `Supervisor` e `Admin`** (backfill de uma vez só, marcado em
> `config.seed_saida_liberar`, seção 3-C do `acesso.js`). Não vai para "todo
> setor de nível alto": a chefia do sob medida e o Comprador não têm nada a ver
> com o caminhão. Supervisor, e não admin, pela lição da #34 (§19). O Admin
> Geral passa por nível.

> Uma saída aberta por vez, guardada no banco: o tablet que recarrega a
> reencontra com as sobras já bipadas. **Cancelar** apaga a saída aberta e não
> mexe em caixa nenhuma. Os fechamentos antigos (`coleta_fechamento`) continuam
> na tela como história, com a foto.

**Rode `node teste_saida_coleta.js` (57 casos) ao mexer no `saida_route.js`, no
`NA_SAIDA`/`PODE_TER_IDO` do `carga.js` ou no card da coleta.** Seis defeitos
foram reintroduzidos, um de cada vez, para provar que o teste pega cada um:
fechar sem o passo das sobras (29 casos), agência no carro na conta (6),
divergência andando (17), liberar sem motivo (5), troca de porta reescrevendo a
modalidade (1) e fechar sem foto (15). Em 02/10/2026, mais quatro: gravar quem
fechou como conferente (4), apagar o conferente da agência já conferida (3),
misturar a caixa sem conferência com "sem registro" (1) e ela deixar de virar
carregada (5); no `teste_area`, exigir a saída na régua (2). Mexeu na chave? **`node teste_acesso.js`
(194, a seção 6-E é esta) e `node teste_cobertura.js` (10).**

> ✅ **NO AR EM 26/09/2026** (PR #140): o dono fez o deploy e disse *"ficou
> certo"*.
>
> ⚠️ **ISSO NÃO É A CONFERÊNCIA NO CAMINHÃO.** A rodada foi na minha tela: abrir,
> bipar uma sobra, fechar divergente, "foi no caminhão", fechar batendo. A prova
> que fecha a fase é **o primeiro caminhão de verdade** saindo por ela, com a
> foto do motorista e o número batendo.

### ⚠️ A VIAGEM À AGÊNCIA (26/09/2026, fase 4 da spec `SAIDA-E-DUPLA-CONFERENCIA`)

A caixa de **agência** passou a ter **dois bipes** (decisão D1 do dono), e a
viagem ganhou fechamento com foto, como o caminhão:

```
bipe normal do Carregamento  →  CONFERE: a caixa fica na área ("✓ na área")
🚗 Viagem à agência          →  a tela fica azul e o bipe põe NO CARRO
                                (só aceita caixa conferida)
foto + número do atendente   →  fechar: saíram = bipadas no carro NESTA viagem
```

Com a viagem aberta há um botão **Conferir na área**, que devolve o bipe à área
sem fechar a viagem. A faixa **"O bipe agora: …"**, logo abaixo do banner, diz
para onde vai cada bipe, na cor dele: área (cinza), carro (azul) ou sobra do
caminhão (violeta). Quando as duas saídas estão abertas, vale a última
escolhida.

**Bateu:** cada caixa grava `saiu_em` e `saiu_por='agencia'`, numa saída
`tipo='agencia'`. A caixa já está ligada à viagem pelo `saida_id` desde o bipe
no carro. **Não bateu:** nada anda, e liberar exige `saida.liberar` e motivo,
como o caminhão.

> ⚠️ **O CARRO SÓ ACEITA CAIXA CONFERIDA, E A RECUSA DIZ O QUE FAZER.** "Esta
> caixa não foi conferida na área. Toque em 'Conferir na área', bipe ela, e
> depois ponha no carro." Recusar sem caminho, com a caixa na mão, é o que
> ensina a empurrar do jeito que der (§5, #27).

> ⚠️ **A CAIXA DE COLETA PODE IR PELA AGÊNCIA (troca de porta).** Do canto, ela
> entra no carro marcada, sai do card "esperando o caminhão" e da conta do
> caminhão (`AGUARDA_CAMINHAO` passou a exigir `saida_id IS NULL`), e fecha com
> `saiu_por='agencia'`, `retirado_em` preenchido e a **`modalidade` intacta**.

> ⚠️ **TIRAR DO CARRO DESFAZ O BIPE**, e cada tipo volta ao seu lugar: a de
> agência volta à área, conferida (`embalado`); a de coleta volta ao canto.
> **Cancelar a viagem com caixa no carro é recusado**: primeiro se tira do
> carro, senão a caixa ficaria no carro sem viagem nenhuma.

> ⚠️ **A FOTO VEM DA GALERIA, E A VIAGEM FECHA DE QUALQUER APARELHO** (decisão D3).
> O servidor está na rede da fábrica e a agência não o alcança. O normal é o
> motorista, de volta, abrir o Carregamento **no celular dele** (Wi-Fi da
> fábrica, PIN dele) e fechar com a foto que tirou no balcão. Por isso o campo
> da foto da viagem **não tem `capture`**: com ele o celular só abriria a
> câmera. Viagem aberta de um dia para o outro sai marcada em vermelho.

> ⚠️ **A 400 PX A PÁGINA ROLAVA DE LADO (481 px), e só apareceu abrindo no
> tamanho de celular.** Os quatro quadros do topo não quebravam de linha, e o
> Carregamento nunca tinha sido aberto num celular. Com a D3 passou a ser, e
> abaixo de 600 px os quadros ficam dois por linha.

> ⚠️ **O "NO CARRO" DO TOPO CONTA TAMBÉM A DE COLETA QUE ENTROU NO CARRO.**
> Também achado abrindo a tela: o topo dizia 2 e a viagem dizia 3. É a mesma
> tela com duas réguas. A de coleta conta pela hora em que entrou no carro
> (`no_carro_em`), e a de agência que o caminhão levou continua fora (fase 3).

> ⚠️ **AS CAIXAS DE AGÊNCIA CARREGADAS ANTES DO DEPLOY NÃO TÊM VIAGEM**, e ficam
> como estão: saíram antes dessa regra existir. Bipadas de novo, respondem
> "essa caixa já saiu".

> ⚠️ **TABLET COM A PÁGINA ANTIGA EM CACHE:** o bipe da área, na agência, só
> confere, mas a página velha escreveria "Carregado ✓". O refresh forçado do
> deploy é obrigatório.

**Rode `node teste_saida_agencia.js` (43 casos) ao mexer na viagem do
`saida_route.js`, no bipe da área do `carreg_route.js` ou no `PRONTA_PRO_CARRO`
do `carga.js`.** Sete defeitos foram reintroduzidos, um de cada vez: o carro
aceitando caixa não conferida (10 casos), o bipe da área voltando a pôr no carro
(21), a troca de porta reescrevendo a modalidade (2), a coleta no carro
continuando no canto (1, e esse caso só existe porque a primeira rodada deixou
passar), "tirar do carro" sem devolver à área (4), a divergência andando (5) e o
contador do carro com régua própria (1).

> ✅ **NO AR EM 26/09/2026** (PR #142): o dono fez o deploy e disse *"ficou
> certo"*.
>
> ⚠️ **ISSO NÃO É A CONFERÊNCIA NA AGÊNCIA.** A rodada foi na minha tela, a 1440
> e a 400 px. A prova que fecha a fase é **a primeira viagem de verdade**,
> fechada pelo celular do motorista com a foto do balcão.

### ⚠️ O QUE SAI ADIANTADO — contado em peças, na tela do Carregamento (25/09/2026)

Pedido do dono: *"mensurar e mostrar na tela de carregamento a quantidade de
peças que estamos enviando como adiantado"*. **Adiantado é o volume que sai da
fábrica ANTES da data de despacho que a etiqueta traz** (`despachar_em`). O bipe
continua aceitando — adiantar é permitido (§8, *venda futura é trabalho
adiantável*) — e passou a **dizer** e a **contar**.

| Onde | O quê |
|---|---|
| 4º quadro do topo, azul | **Peças adiantadas hoje**, com carro × coleta, as caixas quando não batem com as peças, e os **últimos 30 dias** |
| Banner do bipe | `⏩ ADIANTADO — despacha sex 02/10` na caixa futura, no carro **e** na coleta |
| `GET /api/carregamento` | `saiu_adiantado: {hoje:{pecas,caixas,agencia,coleta}, periodo:{dias,pecas,caixas}}` |
| `POST /api/carregar` | `adiantado: true/false` |

**`carga.js` → `saidasAdiantadas(db, dias)` e `SAIDA()` são o dono único.**
Relatório que um dia quiser esse número lê de lá.

> ⚠️ **NA COLETA A SAÍDA É O CAMINHÃO LEVANDO (`retirado_em`), NÃO O BIPE.** O
> bloco logo acima diz que contar saída por `carregado_em` "é o mesmo dia" — e
> para o adiantado **não é**: a caixa de despacho sexta vai pro canto na
> terça e fica lá. Contada pelo bipe, ela seria "adiantada" sem ter saído da
> fábrica. O banner avisa no bipe; a conta só anda quando o caminhão leva.
> Caso travando.

> ⚠️ **NÃO CONFUNDIR `adiantadas` COM `saiu_adiantado`.** O primeiro já existia
> e é o que **pode** sair adiantado (etiqueta impressa, despacho pra frente,
> ainda na fábrica — o quadro azul *"só despacham depois"*). O segundo é o que
> **já saiu**. Os dois ficam na mesma cor de propósito: falam da mesma venda de
> prazo futuro, antes e depois.

> **Conta PEÇA, com a caixa ao lado** — a caixa de várias persianas (§5, #23)
> conta N. **O fechamento à mão dos scripts do §5 nunca entra**: eles carimbam
> a saída NA data do despacho, às 15:00, e `despachar_em > dia da saída` não
> fecha para eles. Volume sem `despachar_em` lido também fica fora — não há
> prazo contra o qual medir. E a caixa adiantada **continua** entrando no
> "No carro X de Y", como sempre entrou.

> **Só a tela: não há relatório nem gráfico.** São hoje e 30 dias, no próprio
> quadro. Se precisar de série por dia, ela sai do mesmo `saidasAdiantadas`.

> ✅ **NO AR E CONFERIDO PELO DONO EM 25/09/2026** (PR #132): fez o deploy e
> disse *"ficou certo"*. A spec curta foi para `docs/arquivo/`.
>
> ⚠️ **A METADE DA COLETA SÓ SE PROVA NO DIA EM QUE UMA CAIXA FUTURA FOR NO
> CAMINHÃO.** O quadro só conta a coleta depois do fechamento com o motorista,
> e isso depende de haver caixa adiantada no canto na hora em que ele chega. A
> conferência de hoje não disse se esse caso passou pela tela; se o número não
> andar nesse dia, é defeito, não silêncio normal.

**Rode `node teste_carga.js` (60 casos — os 9 últimos são a lista da caixa de várias, 05/10/2026; os de coleta, 5 são a
trava do volume não embalado, §5 #27, e 11 são o adiantado — um no começo e os 10 antes dos 2 últimos, que são a venda cancelada (VENDAS F2);
os do fechamento com o motorista foram para o `teste_saida_coleta.js` em 26/09/2026),
`node teste_parse.js` (caso 15), `node teste_divergencia.js` (os dois últimos
casos são a decisão da gestão) e `node teste_etiqueta.js` após mexer nisso.**
Volumes anteriores à coluna: `node backfill_modalidade.js` (simula) e
`--aplicar` — só mexe em quem está `NULL` e ainda na fábrica.
