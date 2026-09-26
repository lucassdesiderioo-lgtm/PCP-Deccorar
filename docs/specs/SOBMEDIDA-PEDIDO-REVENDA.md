# Sob medida — pedido da revenda, ficha técnica e produção bipada

```
STATUS
Situação: em construção
Criada em: 22/09/2026
Última atualização: 26/09/2026
Fase atual: 6-C1b EM CÓDIGO (26/09/2026) — o boleto aponta os PEDIDOS que
cobre. Migração 26. Antes dela, a 6-C1 (o boleto e o crédito), migração 25,
            `sm_boleto`, a tarefa semanal da carteira e o selo de crédito
            estourado no Quadro. Mostra, não trava
            6-B EM CÓDIGO (26/09/2026) — os SETE INDICADORES. Nenhuma tabela
            nova: eles somam o que a 5-B1 e a 5-B2 gravam. A migração 24 traz
            UM número, e ele é cadastro — o limite do bipe aberto
            6-A EM PRODUÇÃO (26/09/2026) — o QUADRO: onde está cada pedido,
            com a barrinha por setor. A etapa é derivada, nunca gravada, e o
            `marco` continua sendo a trava (a dívida 15 decidida)
            5 INTEIRA EM PRODUÇÃO (24/09/2026) — 5-A, 5-B1 e 5-B2.
            **Falta a conferência de fábrica das três** — provas 8 e 8-b
            4-C EM PRODUÇÃO (24/09/2026) — o tubo chegando ao Compras do PCP;
            os quatro degraus JÁ apontados (24/09) — falta o primeiro pedido
            real aparecer lá, e o comprador comprar por ele
            4-B EM CÓDIGO (24/09/2026) — o tecido, no painel do sob medida
            4-A EM PRODUÇÃO, o leitor bipou no papel (23/09/2026) — falta a
            peça real atravessando os cinco setores
            3 EM CÓDIGO e CONFERIDA no deploy (23/09/2026) — falta a semana
            em paralelo ao Decorsoft
            2 EM CÓDIGO (22/09/2026) — falta cadastrar as revendas de hoje
            1 PRONTA e CONFERIDA em produção, corte e preço (22/09/2026)
Fases: 1 ☑  2 ☑(código)  3 ☑(código)  4 ☑(código — 4-A em produção · 4-B e 4-C em código)  5 ☑ **em produção**, falta a prova de fábrica  6 ◐(6-A em produção · 6-B em código · 6-C1 em produção · 6-C1b em código · 6-C2 não começou)  7 ☐  8 ☐
Risco: 🔴 (schema novo, preço, etiqueta de produção, acesso de gente de fora)
Módulo: sob medida (tecido/) — ler tecido/README.md antes de mexer
Mudanças no caminho: 5 (fase 1) + 4 (fase 2) + 3 (fase 3) + 2 (fase 4-A) + 2 (fase 4-B) + 2 (fase 4-C) + 2 (fase 5-A) + 1 (5-B1) + 2 (5-B2) + 3 (6-A) + 2 (6-B) + 2 (6-C1) + 2 (6-C1b) — ver abaixo
```

## 📌 O QUE ESTÁ PENDENTE — a lista única

> Pedido do dono em 24/09/2026: *"vai deixando escrito e anotado tudo que está
> pendente"*. **Este bloco é o lugar único.** Cada linha diz o que falta, de
> quem é e o que acontece se ficar parada — e o resto do arquivo detalha.
>
> ⚠️ **Pendência escrita em quatro lugares é pendência que ninguém lê inteira.**
> Quem fechar uma delas risca **aqui**, no mesmo commit — e é daqui que sai a
> resposta de "o que falta para a spec fechar".

### Cadastro e conferência — é do dono, e sem isso a regra fica INERTE

| # | O que falta | Sem isso | Fase |
|---|---|---|---|
| ~~1~~ | ~~Marcar as pessoas nos cinco setores de produção~~ **FEITO em 24/09/2026** — uma pessoa marcada em cada. A lâmpada da armadilha #30 apagou: elas veem a bancada no menu do `/sobmedida` | — | — |
| 1-b | **Revisar os oito motivos de recusa** que a migração 22 semeou (Sob medida → Cadastros → Motivos da recusa da produção) | eles vieram dos exemplos da spec, não da fábrica. Motivo que ninguém usa vira lista que a bancada rola sem ler; motivo que falta vira recusa que não acontece | 5-B2 |
| 2 | **Lançar o percentual das tabelas A e C** | o simulador recusa dizer o preço das revendas dessas tabelas — e **está certo** recusando (regra 4) | 2 |
| 3 | **Cadastrar as revendas de hoje**, com vendedor, tabela, desconto e limite | a carteira nasce vazia e o pedido não tem para quem ir | 2 |
| 4 | **Cadastrar os feriados** do calendário | o prazo conta como se todo dia fosse útil, e a revenda ouve uma data que a fábrica não cumpre | 2 |
| 5-c | **Medir e lançar o limite do bipe** (Sob medida → Cadastros → Parâmetros, *Tempo máximo de um bipe*). Nasceu em **2 h**, que é um teto chutado para o ruído — ninguém sabe ainda quanto leva cada bancada | baixo demais, trabalho de verdade some das médias como se fosse esquecimento; alto demais, o bipe esquecido entra e envenena a média. Os dois erram calados | 6-B |
| 5 | **Preencher mínimo e ideal** dos `Tubo 38/41/56` (nasceram em zero, de propósito) | o gatilho 1 não dispara para eles: a compra vem só do que está vendido | 4-C |
| ~~5-b~~ | ~~Marcar `sobmedida.cadastrar` no setor `Sob medida / Cadastros`~~ **FEITO em 24/09/2026** — o setor ficou `supervisor` com as duas chaves, e as 3 pessoas ganharam a área `sobmedida_adm`. **A prova de que o conserto pegou é o Fernando:** ele tem `sobmedida_adm` e **não** tem `admin` — antes da armadilha #34 a chave o teria promovido junto, e ele passaria nas 24 rotas `@admin` do PCP | — | — |

### Provas de fábrica — deploy não é conferência

| # | A prova que falta | O que ela fecha |
|---|---|---|
| 6 | O **próximo pedido aprovado** somando na linha certa do Compras, e o comprador comprando por ela | a 4-C |
| 7 | A **semana em paralelo ao Decorsoft**, pedido a pedido | a 3 — a folha do 5001 provou o ciclo e a aritmética, não o cadastro |
| 8 | A **peça real atravessando os cinco setores**, com o leitor na mão | a 4-A e a 5-B1 — o código está no ar desde 24/09, e ninguém bipou uma peça de verdade ainda |
| 8-b | A **bancada de verdade recusando uma peça**, com o maço de refazer saindo da Zebra | a 5-B2 — a rodada de 24/09 foi num navegador meu |
| 9 | O **serralheiro cortando pela medida da etiqueta** | a 4-A — o bipe provou o código de barras, não a medida |
| 10 | O **comprador comprando pelo painel de tecido** (o comprometido da 4-B) | a 4-B |
| 10-b | O dono abrindo o **Quadro** e respondendo *"onde está o pedido X"* | a 6-A — o que rodou em 24/09 foi num navegador meu, com pedido semeado em cada etapa |
| 10-d | O **financeiro lançando um boleto de verdade** e dando a baixa dele, e o vendedor usando a lista da carteira na conversa semanal | a 6-C1. **O modo de falhar dela é o otimista**: se ninguém lançar, o "em aberto" fica zero e o disponível fica igual ao limite — uma mentira que não parece erro, porque o número só fica maior |
| 10-c | O dono respondendo, **pela tela de Indicadores**, *"quanto o Renato leva para aprovar"* e *"quanto tempo leva uma persiana por m²"* — as duas frases do pronto-quando da §7 | a 6-B. **Ela depende da prova 8**: enquanto a bancada não bipar de verdade, os três indicadores de tempo saem vazios, e vazio ali é a verdade, não defeito |

### Dívida técnica que esta spec deixou aberta

| # | O que é | Por que ficou |
|---|---|---|
| 11 | As **chaves de nível admin do PCP** continuam fazendo quem as tem entrar no sob medida como **diretor** — uma a menos desde 24/09, quando `sobmedida.cadastrar` baixou para `supervisor` (armadilha #34) | é anterior à fase 2 e estreitar aquela leitura muda quem pode o quê: é `REGRA`, uma chave por vez |
| 12 | A `familia_sku` velha não é reescrita | é história do que o sistema viu; o aprendizado recomeça sozinho |
| 13 | **Sexto setor de produção exige código** (a chave), e a tela deixa criar o setor | decisão de 24/09: setor é cadastro, chave é código — ver a 5-A |
| ~~15~~ | ~~O "Pronto" não aparece no `marco`~~ **DECIDIDA em 24/09/2026, na 6-A: fica como está.** O quadro deriva a etapa de `marco` + `pronto_em` + os bipes e **só lê** — trocar o marco mudaria em silêncio os números que o comprador usa. A pergunta que esta dívida guardava para a fase 6 está respondida, e a resposta é NÃO |
| 14 | **Editar um setor apaga, sem avisar, as permissões acima do nível dele.** A tela desenha `disabled` a caixinha acima do nível e o salvar regrava a lista inteira, então ela nunca é mandada e nunca volta | consertar é decidir o que a tela faz com a chave que não pode mostrar — avisar, preservar ou recusar o salvamento —, e as três mudam quem pode o quê: é `REGRA`. É a dívida 20 do `CLAUDE.md` §14 |

### O que ainda não foi construído

| Fase | O que é |
|---|---|
| ~~5-B2~~ | ~~a recusa com motivo → setor → pessoa~~ **EM PRODUÇÃO em 24/09/2026** — migração 22, `sm_motivo_producao`, `sm_recusa` e `refeitas`. Falta a prova 8-b |
| ~~5-B1~~ | ~~o bipe, as filas por setor, o kit e o Pronto automático~~ **EM PRODUÇÃO em 24/09/2026** — era o pedaço que esta lista **não citava**, e sem ele a 5-B2 não tem de onde recusar. Falta a prova 8 |
| ~~6-B~~ | ~~os sete indicadores~~ **EM CÓDIGO em 26/09/2026** — migração 24 (só o parâmetro do limite), `dominio/indicadores.js`, `dados/indicadores.js`, `rotas/indicadores.js` e a tela `/sobmedida/indicadores` (no menu: **Indicadores**). Nenhuma tabela nova. Falta a prova 10-c — e ela depende da 8 |
| ~~6-A~~ | ~~o kanban~~ **EM CÓDIGO em 24/09/2026** — migração 23, `sm_kanban_coluna`, `dominio/kanban.js` e a tela `/sobmedida/kanban` (no menu: **Quadro**). A etapa é derivada; o `marco` não se mexeu. Falta o dono abrir e dizer se responde "onde está o pedido X" |
| ~~6-C1b~~ | ~~o vínculo boleto ↔ pedidos~~ **EM CÓDIGO em 26/09/2026** — migração 26 (`sm_boleto_pedido`), a coluna `pedido_id` saiu, a tela lista os pedidos para marcar. Decisão do dono no mesmo dia do deploy da 6-C1: *"um recebimento tem que ser sempre atrelado a um pedido"*. Um título cobre **vários** pedidos; sem nenhum ele nasce **avulso** |
| ~~6-C1~~ | ~~o boleto e o crédito~~ **EM PRODUÇÃO em 26/09/2026** — migração 25 (`sm_boleto`), `dominio/boleto.js`, a tela `/sobmedida/financeiro` (no menu: **Financeiro**), o disponível na ficha da revenda e o selo de crédito estourado no Quadro. A **revisão bimestral do limite já existia desde a fase 2** e não foi refeita. Falta a prova 10-d |
| **6-C2** | **NF e entrega** — selo de NF, marco `entregue`, os filtros *"entregue sem NF"* / *"NF sem entrega"* e a coluna `entregue` do Quadro. **Não tem quem marque**: não há faturamento no sob medida e a §5 diz que o ERP é outro projeto. Construir `entregue` sem quem o marque é a coluna-paisagem que a 6-A recusou — é decisão do dono, não trabalho parado |
| 7 | o portal da revenda |
| 8 | segurança e abertura |

> ⚠️ **A FASE 6 FOI ABERTA EM TRÊS EM 24/09/2026, e o motivo é o mesmo da
> fase 5.** A entrega escrita na §7 junta quatro coisas que não dependem umas
> das outras — kanban, indicadores, boleto e crédito — e a 5 já mostrou o
> custo de uma fase grande: a linha da 5-B **omitia o bipe**, que era o pedaço
> maior, e a lista que existe para ser o lugar único ficou sem ele. Aberta em
> três, cada parte sobe sozinha e o que falta fica escrito aqui.

## STATUS DA FASE 6-C1 — em código em 26/09/2026

**O boleto e o crédito (§4.13).** Migração 25 (`sm_boleto`),
`dominio/boleto.js`, `dados/boleto.js`, `rotas/boleto.js`, a tela
`/sobmedida/financeiro`, o crédito na ficha da revenda e o **selo de crédito
estourado** no Quadro — o gancho que a 6-A deixou escrito.

```
limite disponível = limite − boletos em aberto        ← MOSTRA, NÃO TRAVA
```

> ⚠️ **UM TERÇO DA LINHA DA 6-C JÁ ESTAVA NO AR.** A **revisão bimestral do
> limite** existe desde a fase 2: `limite_revisado_em`, o parâmetro
> `creditoRevisaoMeses`, o cálculo de `limite_vencido`, a rota
> `/api/revendas/limites-vencidos` e o botão *"Revisei — está bom assim"*.
> Nada disso foi refeito, e está escrito aqui porque a linha da fase prometia
> as três coisas e quem lesse o plano esperaria trabalho onde não havia.

### A decisão que a spec não tomava: **de onde nasce o boleto**

A §4.13 diz `disponível = limite − boletos em aberto` e diz que *"o financeiro
dá baixa"*. **Ela não diz como o título entra**, e a §5 fecha a porta óbvia:
*"o ERP é outro projeto"*.

**Decisão do dono, 26/09/2026: lançado à mão, aqui.** O caminho do espelho (o
outro sistema exporta, este lê) foi posto na mesa com a recomendação de
esperar um arquivo real, e o dono decidiu seguir o plano original.

> ⚠️ **O TÍTULO É LANÇADO, NUNCA GERADO.** O boleto de verdade nasce no banco,
> com número e código de barras próprios. Um número inventado nesta casa seria
> a segunda régua contra o extrato (armadilha #12), e a que erra se descobre
> na cobrança de um cliente.

> ⚠️ **E O MODO DE FALHAR DESTE DESENHO É O OTIMISTA — escrito antes, não
> depois.** A §4.13 avisa que *"sem baixa, o limite de todo mundo zera"*. Com
> lançamento à mão o risco é o **contrário e pior**: ninguém lança, o "em
> aberto" fica zero e o disponível fica **igual ao limite** — uma mentira que
> não parece erro, porque o número só fica maior. Por isso o crédito devolve
> `ultimo_movimento`, e as duas telas escrevem, **só quando o dado é velho**,
> há quantos dias ninguém mexe naquela revenda.

### As seis regras que ficam

| # | A regra | O que ela evita |
|---|---|---|
| 1 | **Mostra, não trava** | decisão do dono de 22/09. Não há uma linha que recuse pedido por crédito; o que muda é a cor. A §4.13 explica por que a trava não entra antes de a baixa estar sendo feita de verdade — é a armadilha #6 |
| 2 | **Negativo fica negativo** | zerar apagaria o **tamanho** do buraco: R$ 2.000 estourados e R$ 1 estourado ficariam iguais na tela. É o `MAX(0, …)` do saldo do PCP (§2) pela porta do crédito |
| 3 | **Sem limite lançado, o disponível é `null`** | não é zero nem "o que ela deve". Regra 4 do custo: número indefinido não vira número certo — e não se estoura um limite que não existe |
| 4 | **Pago e cancelado saem da conta; vencido FICA** | tirar o vencido faria o limite de quem **não** paga parecer mais folgado que o de quem paga em dia. O vencimento é **marca**, não segunda conta |
| 5 | **Número repetido na mesma revenda é recusado** | é o mesmo título lançado duas vezes, e ele come o limite em dobro. O modo de falhar é pessimista: o vendedor para de vender achando que a revenda estourou. Em **outra** revenda o mesmo número passa — o número é do banco dela |
| 6 | **"Aprovado sem boleto" só vale para quem paga em boleto** | *"nem todo pedido fazemos boleto — às vezes o cliente paga por PIX, às vezes por cartão"* (dono, 26/09/2026). Cobrar título de quem paga no cartão é aviso disparando no caso normal, e aviso assim some junto com a lista (armadilha #6). É a segunda metade da pergunta 6 da §8, *"os dois, mostrados separados"* — e ele **não entra no disponível** |

### As duas mudanças no caminho

| # | O que o plano dizia | O que ficou | Por quê |
|---|---|---|---|
| 1 | a fase 6-C inteira | **6-C1** (boleto e crédito) sobe; **6-C2** (NF e entrega) espera | NF e entrega **não têm quem as marque**: não há faturamento no sob medida. Construir `entregue` sem quem o marque é a coluna-paisagem que a 6-A recusou, e a NF digitada sem responsável é a dívida 18. É decisão do dono, não trabalho parado |
| 2 | o pedido se aponta pelo `id` | também pelo **número** | o id é de banco, e ninguém o lê no papel do boleto. Resolver o número na tela exigiria dela varrer `/api/pedidos` — uma chave que quem lança boleto pode não ter, e 403 numa tela que abre (§10, #29) |

### Quem vê o quê

`boleto.ler` (o **vendedor**, pela tarefa semanal da §4.13) e `boleto.editar`
(lançar, baixar, cancelar). **`boleto.editar` não está em papel nenhum**: hoje
quem lança é o diretor, que a recebe pelo `*`. Inventar um papel "financeiro"
exigiria área no PCP, linha no `PERM_AREA` e alguém marcado — as três pontas
da armadilha #13 — para uma caixinha que ninguém marcaria. O dia em que houver
financeiro com login próprio, a área nasce ali.

E a resposta inteira passa pela **poda do `custo.js`**: quem não tem
`custo.ver` recebe o JSON sem os campos de dinheiro. Por isso todo campo
começa com `valor_` — a poda corta por padrão de nome, e um
`em_aberto_centavos` viajaria pelo fio em silêncio. **`estourado` não é
dinheiro**, e é de propósito: a marca sobrevive à poda e acende o selo para
quem só vê a cor.

### O que só apareceu abrindo a tela

- **a lista da tarefa semanal saía em ordem ALFABÉTICA**, com quem está em dia
  em cima de quem estourou o limite. Lista de trabalho se lê de cima para
  baixo — é a regra da tela azul do operador (§3) e do atrasado do
  Carregamento (#9). Hoje: estourado · mais vencido · mais em aberto · nome;
- **a janela escrita em toda revenda virava paisagem** — quatro linhas
  idênticas de *"último lançamento em 26/09"*. O sinal é o dado **velho**, não
  o fresco: hoje ela só aparece acima de 30 dias, ou quando nunca se lançou
  nada, e com a **mesma regra nas duas telas**;
- **o formulário pedia o valor em centavos.** O resto do módulo (catálogo,
  simulador, revendas) pede em reais e converte por soma — duas telas pedindo
  o mesmo dinheiro de jeitos diferentes ensinam a equipe a achar que são
  coisas diferentes (§4);
- **os dois selos do Quadro saíam GRUDADOS** —
  `RETIDO · SEM TECIDORETIDO · CRÉDITO ESTOURADO`. Enquanto havia um selo só,
  o espaçamento nunca tinha sido exercitado: é o `📦2 peças` grudado do §5, e
  nenhum teste de unidade o pega, porque o texto está perfeito e quem está
  errado é a distância.

### Os oito defeitos reintroduzidos

Cada um reprova o caso que existe para pegá-lo, e só ele: disponível zero sem
limite (1), cortar o estourado em zero (3), contar o boleto pago (1), contar o
cancelado (1), aceitar número repetido (1), cobrar "sem boleto" de quem paga
em PIX (1), ordenar a carteira por nome (1) e pôr o selo no cartão cancelado
(1).

**Testes:** `cd tecido && npm test` — **617 casos**, 35 da 6-C1 e 15 da 6-C1b.

## STATUS DA FASE 6-C1b — em código em 26/09/2026

**O boleto aponta os pedidos que cobre.** Migração 26 (`sm_boleto_pedido`), e
a coluna `sm_boleto.pedido_id` **saiu** — com a tabela de vínculo de pé ela
seria a segunda afirmação sobre o mesmo fato.

```
um boleto → N pedidos      o financeiro junta os pedidos da semana
um pedido → N boletos      o parcelamento, que já cabia
nenhum pedido              existe, passa, e nasce AVULSO — visível
```

**Duas perguntas ao dono decidiram o formato**, e por isso elas foram feitas
antes de construir: um boleto pode cobrir vários (**sim**), e existe boleto
sem pedido (**às vezes**). A primeira tirou a coluna; a segunda impediu a
trava.

**O que a coluna única fazia de errado:** um título cobrindo três pedidos
gravava **um**, e os outros dois continuavam para sempre em *"aprovado sem
boleto"* — a lista cobrando um título que já existe.

**Divergências da letra da spec, anotadas aqui:**

| # | A spec diz | O que foi feito | Por quê |
|---|---|---|---|
| 1 | a §4.13 não fala de vínculo boleto ↔ pedido | ele nasceu, e como N:N | pedido do dono em 26/09/2026, depois de ler a tela da 6-C1 |
| 2 | — | o valor do título **avisa** quando passa dos pedidos, e diz quanto | é o que o vínculo torna possível: o zero a mais (R$ 8.000 num pedido de R$ 782,04). Travar quebraria o parcelamento, e o aviso binário acendia por R$ 0,20 de arredondamento |

**Três defeitos só apareceram com a tela aberta:** lançar perdia a revenda
escolhida (o quinto título sairia na revenda errada), o aviso de vinte
centavos, e a caixinha renderizada em cima do texto — esta por duas causas
empilhadas, o `min-height` de alvo de toque do `input` global e a
especificidade de `.form label` (0,1,1) vencendo `.marca` (0,1,0).

**Nove defeitos foram reintroduzidos um a um**, e um deles **não foi pego**: a
lista da tela com critério próprio passava limpa. O caso que faltava foi
escrito ali, e só então o defeito reprovou.
`node teste_acesso.js` (204) e `node teste_cobertura.js` (10). §10 verde, com
`/sobmedida/telas/financeiro.html` em **403 mesmo para o diretor logado**.

---

## STATUS DA FASE 6-B — em código em 26/09/2026

**Os sete indicadores (§4.17).** Nenhuma tabela nova: todos somam o que as
fases 3, 5-B1 e 5-B2 já gravam. A migração 24 traz **um** número, e ele é
cadastro. `dominio/indicadores.js`, `dados/indicadores.js`,
`rotas/indicadores.js` e a tela `/sobmedida/indicadores`.

| Indicador | De onde sai |
|---|---|
| Tempo de aprovação por vendedor | `enviado_em` → `aprovado_em`, por `vendedor_nome` |
| Pedidos parados na aprovação | `marco='enviado'` + dias de fábrica restantes |
| Prazo cumprido | `pronto_em` contra `prazo_prometido` **e** `prazo_atual` |
| Horas-homem por peça e por pedido | soma de `terminado_em − iniciado_em` |
| Tempo médio por m² | por setor e no total |
| Produtividade por pessoa e por setor | pelos bipes (`terminado_por`) |
| Recusas | `sm_recusa`, por setor · por pessoa · por motivo |

O **crédito** — a oitava linha da tabela da §4.17 — fica de fora: é boleto, e
boleto é a 6-C.

### As cinco definições de medida, e por que elas moram num lugar só

Nenhuma delas muda como a fábrica trabalha; todas mudam **o que o número
diz**. Medida escrita em dois lugares vira dois números com a mesma
autoridade, que é a armadilha #12 — por isso as cinco estão no
`dominio/indicadores.js` e em mais lugar nenhum.

| # | A definição | O que ela evita |
|---|---|---|
| 1 | **A régua do bipe suspeito é UMA SÓ**, e vale para os três indicadores de tempo | a nota da própria §4.17: esqueceu de bipar o fim e foi almoçar, a peça "levou" três horas. Duas réguas para *"este tempo presta?"* divergiriam no dia em que alguém mexesse numa |
| 2 | **Peça com bipe descartado é INCOMPLETA**, e sai da média em vez de entrar com a soma menor | ela puxaria a média para baixo sem nada dizer por quê. É a regra 4 do custo pela porta do tempo, e o número de incompletas é **dito**, não escondido |
| 3 | **O m² é o REAL, nunca o cobrado** | o cobrado carrega o mínimo faturado de 1,5 m² (§4.8): a persiana de 1,000 × 1,000 pareceria mais rápida por m² do que é. A bancada corta o real |
| 4 | **Prazo cumprido são DOIS números** | somados, o pedido empurrado pareceria entregue em dia. É a mesma razão de o prometido não ser sobrescrito na renegociação (§4.9) |
| 5 | **A recusa conta no setor do CULPADO**, não no de quem recusou | a pergunta é de onde **vem** o defeito; `recusado_de` é a bancada que o **achou**, e contar nela seria uma régua que acusa o inocente |

### As duas mudanças no caminho

| # | O que a spec dizia | O que ficou | Por quê |
|---|---|---|---|
| 1 | *"tempo de aprovação por vendedor"*, sem dizer qual estatística | **mediana**, com o pior caso ao lado, em **tempo corrido** | um pedido enviado sexta 18h e aprovado segunda 9h leva 63 h de relógio e cerca de uma de expediente. Numa amostra de cinco a **média** dispara para 13 h — maior que quatro dos cinco casos — e nada na tela diria por quê. "Horas úteis" exigiria um cadastro de expediente que não existe, e inventá-lo seria um número com cara de medido; os **dias de fábrica** vão ao lado, porque é assim que a pergunta é feita em voz alta |
| 2 | *"tempo aberto acima de um limite cadastrável"* | o limite pega **também o bipe que FECHOU demorando demais**, e não só o que ficou aberto | o exemplo da própria §4.17 é de um bipe que **fechou**: a pessoa voltou do almoço e bipou o fim. Um limite que só olhasse o aberto não pegaria o caso que a regra existe para pegar |

### O que a tela faz e nenhum teste pega

⚠️ **EM PRODUÇÃO ELA NASCE VAZIA, E ISSO É A VERDADE.** A bancada começou a
bipar em 24/09/2026 e ninguém bipou uma peça real ainda (prova 8). Os sete
blocos saem sem número — e vazio se parece com tela quebrada, que é a lição
da 4-C. A tela separa **duas causas** com conselhos opostos: *"ainda não há
pedido aprovado"* manda esperar; *"houve, mas nenhum nos últimos 90 dias"*
manda mudar o filtro.

A explicação longa aparece **uma vez**, num cartão no topo, e só quando a
tela inteira está vazia — repetida nos sete blocos virava um muro do mesmo
parágrafo, e texto que se repete ensina a não lê-lo. Ela também diz **quando
o vazio é defeito**: se a bancada já está trabalhando e nada aparece, o lugar
de olhar é Admin → Acessos.

⚠️ **E SETE COISAS SÓ APARECERAM ABRINDO A TELA** — nenhuma tem teste de
unidade que a pegue, e a lista é sempre do mesmo tipo:
- datas em `2026-09-20` numa tela de fábrica brasileira (o formato do banco
  vazando para quem lê — o *"— Correcao de contagem"* do `CLAUDE.md` §2);
- *"1 bipe(s) continuam abertos"* e *"2 persianas ficaram de fora: ou ainda
  não **passou**"* — concordância, e meia concordância lê-se pior que
  nenhuma. É o *"1 destes pedidos já tiveram"* da 4-A;
- *"parado há **266,87 h**"* — número que ninguém segura na cabeça;
- os **dois percentuais do prazo**, que existem para serem lidos juntos,
  esticados para as pontas opostas de 1100 px por um `flex:1`;
- **"Serralheria" com dois totais de horas na mesma tela** — 2,17 h no bloco
  de m² e 3,25 h na Produtividade. As duas estão certas (lá é todo bipe
  válido, aqui só o de persiana inteira), e sem a frase que diz isso é a
  mesma tela dizendo duas coisas — o `faltaHoje` × `precisa` do §18;
- o muro do parágrafo repetido no estado vazio, acima.

### Os oito defeitos reintroduzidos

Cada um reprova o caso que existe para pegá-lo, e só ele — conferido um a um:
contar o bipe suspeito (4), usar o m² cobrado (2), juntar prometido e
negociado (1), contar a recusa em quem recusou (1), média no lugar da
mediana (1), contar o kit como peça da persiana (8), apagar a diferença
entre *"nunca"* e *"no período"* (1) e deixar a peça com bipe descartado
entrar na média (2).

**Testes:** `cd tecido && npm test` — **567 casos**, 31 da 6-B.
`node teste_acesso.js` (204) e `node teste_cobertura.js` (10).

---

## STATUS DA FASE 6-A — em produção em 26/09/2026

**O quadro (§4.17).** Onde está cada pedido, numa tela só — o *"onde está o
pedido X"* do pronto-quando da fase 6. Migração 23 (`sm_kanban_coluna`),
`dominio/kanban.js`, `dados/kanban.js`, `rotas/kanban.js` e a tela
`/sobmedida/kanban`.

### As três mudanças no caminho

| # | O que a spec dizia | O que ficou | Por quê |
|---|---|---|---|
| 1 | *"cada coluna aponta para um **marco**"* | a coluna aponta para uma **etapa** — lista fechada em código, derivada de `marco` + `pronto_em` + os bipes | três dos seis marcos da spec não são marcos: `em produção` é derivado do bipe, `pronto` é a coluna `pronto_em` (e **não pode** virar marco — dívida 15) e `entregue` não existe. O `marco` continua sendo a trava que os três leitores usam |
| 2 | os marcos são `orçamento, enviado, aprovado, em produção, pronto, entregue` | `edicao, enviado, aprovado, producao, pronto, cancelado` | `edicao` porque o pedido **reaberto** volta a `marco='rascunho'` **com o número dele** — chamar aquilo de "orçamento" seria mentira na tela. `cancelado` entrou porque é resposta legítima para "onde está o pedido X". `entregue` saiu porque nada o marca hoje, e coluna que nunca recebe cartão é paisagem (dívida 18) |
| 3 | — | `pedido.porId` passou a devolver **`pronto_em`** | a coluna nasceu na 5-B1 e **nenhuma tela a lia**: quem abrisse o pedido não tinha como saber que ele estava pronto. É a dívida 18 pela porta do leitor que faltava, e o quadro foi o primeiro a precisar dele |

### As decisões desta fase

| # | Decisão | Por quê |
|---|---|---|
| 1 | **A etapa é derivada, nunca gravada** | uma coluna `etapa` no `sm_pedido` seria a segunda afirmação sobre o mesmo fato, e divergiria do `pronto_em` no primeiro bipe que ninguém replicasse — a armadilha #12 dentro do quadro. Há caso travando que a tabela não ganhou a coluna |
| 2 | **O `marco` não se mexe, e o quadro só lê** | é a dívida 15 respondida: três lugares filtram por `marco='aprovado'` — a reimpressão da etiqueta e as duas contas da compra |
| 3 | **Uma coluna por etapa** | duas mostrariam o mesmo cartão em dois lugares, e quem vê isso para de confiar na tela inteira |
| 4 | **Pedido não some do quadro em silêncio** | desativar uma coluna vira **aviso** com a etapa nomeada e a contagem, e o total do título continua contando ele. Etapa vazia não vira aviso: aviso permanente é paisagem |
| 5 | **A barrinha não conta o kit nem a peça cancelada**, e não existe antes da aprovação | o kit nunca é bipado (o defeito que a 5-B1 pegou no Pronto); a peça cancelada não é trabalho; e a ficha só é explodida na aprovação — barrinha zerada antes diria "nada foi feito" no lugar de "ainda não há o que fazer" |
| 6 | **`painel.ler`, e nenhuma chave nova** | o quadro é a fábrica toda com o valor de cada carteira, e `pedido.ler` está no vendedor. O cadastro das colunas usa as chaves de quem já abre Cadastros |

### O que foi conferido, e como

- **25 casos novos** (`tecido/teste/kanban.test.js`), escritos **antes** do
  código, e **sete defeitos reintroduzidos um a um**: o cancelado deixando de
  vencer o pronto (reprova 1), a barrinha contando o kit (1), contando a peça
  cancelada (1), o pedido sumindo em silêncio (1), duas colunas na mesma etapa
  (1), etapa inexistente aceita (1) e a barrinha antes da aprovação (1).
- **536** (tecido) + **168** (acesso) + **10** (cobertura) verdes, §10 verde.
- **As duas telas abertas**, com pedido semeado em cada uma das seis etapas —
  e foi assim que apareceram **cinco** defeitos que nenhum teste pega: o
  `R$ 0,00` no orçamento, a barrinha cortada na borda, a largura de leitura
  escondendo duas colunas, o selo de retido no cartão cancelado e o
  *"1 pedido(s) em Em produção"*.
- **Falta o dono abrir.** O pronto-quando da fase 6 é ele respondendo pela
  tela; o que rodou foi num navegador meu, com dado semeado.

## STATUS DA FASE 5-B2 — em código em 24/09/2026

**A recusa (§4.16).** A 5-B1 fez a peça andar para a frente; aqui ela sabe
voltar. Migração 22 (`sm_motivo_producao`, `sm_recusa` e a coluna `refeitas`),
`dominio/motivo_producao.js`, a recusa no `dominio/producao.js`, o botão na
bancada, o card de cadastro em Cadastros e o card **Refazer** na Produção.

```
a montagem acha o tubo maior  →  escolhe o MOTIVO (e só ele)
                              →  o tubo volta para a Serralheria, marcado REFAZER
                              →  o que foi feito EM CIMA dele volta para "aguardando"
                              →  a etiqueta sai com o MESMO código, em vermelho
```

### As duas mudanças no caminho

| # | O que a spec dizia | O que ficou | Por quê |
|---|---|---|---|
| 1 | o motivo aponta o **setor** (*"Tubo maior → Serralheria"*) | o motivo aponta o **componente**, e o setor sai dele | a serralheria faz **quatro** peças. Apontar o setor ou é ambíguo, ou refaz as quatro — refazer a base porque o tubo veio errado é trabalho jogado fora todo dia (armadilha #6). E dois campos dizendo o mesmo fato divergem no dia em que alguém editar só um (armadilha #12) |
| 2 | — | a lista de motivos da bancada é **desta peça**, não o cadastro inteiro | **só apareceu abrindo a tela**: a Montagem via os oito cadastrados, dois deles impossíveis dali (o próprio trabalho e o que vem depois). Quem está de luva toca "Montagem torta" achando que é *"a montagem está torta, refaz"* — e leva recusa. As guardas do servidor ficam; a tela parou de oferecer o que já sabe que não passa |

### As decisões desta fase

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Volta o culpado e tudo que depende dele — nem mais, nem menos** | a mais, a serralheria refaz a base por causa do tubo (armadilha #6); a menos, a persiana continua montada em cima de um tubo que foi para o lixo. A conta sai do **mesmo `ANTES`** que libera para a frente — uma segunda tabela divergiria no dia em que o fluxo mudasse |
| 2 | **O bandô recusado não derruba a montagem** | ele não a segura (5-B1), então também não a derruba: ele entra na hora de fechar a caixa |
| 3 | **`refeitas` sobe só no CULPADO** | ela responde *quantas vezes esta peça física foi feita*. O que volta atrás dele é trabalho refeito, não peça refeita. Quem conta recusa por setor, por pessoa e por motivo é a `sm_recusa` (o indicador da §4.17) |
| 4 | **Quem recusa é `producao.bipar`, não a chefia** | a §4.16 diz que *qualquer* setor recusa. O que impede o abuso não é permissão, é o rastro: cada recusa grava quem recusou, de que bancada, o motivo e **quem tinha feito** |
| 5 | **O `kit_conferido_em` é limpo junto** | senão a persiana refeita fecharia a caixa sem o terceiro bipe — a trava do kit deixando de existir justamente na peça que já deu problema uma vez |
| 6 | **O pedido pronto deixa de estar pronto**, e o `marco` não se mexe | há peça voltando para a bancada. Trocar o `marco` quebraria a reimpressão da etiqueta e as duas contas da compra (4-B e 4-C) — é a dívida 15 desta spec |
| 7 | **A reimpressão é por CÓDIGO**, e não pelo maço do pedido | reimprimir o maço inteiro para refazer uma peça põe etiquetas repetidas na bancada, que é o que a 4-A existe para impedir |
| 8 | **O motivo e quem fez são RETRATO** na `sm_recusa` | a reabertura acaba de apagar o bipe do culpado: sem o retrato, *"recusas por pessoa"* não tem de onde sair. E renomear o cadastro amanhã não reescreve o que aconteceu hoje |
| 9 | **O cadastro nasce com os oito motivos da própria spec** | tabela vazia faria o botão "Recusar" abrir uma lista sem nada — regra escrita que não pega em ninguém, a dívida 18 pela porta do cadastro |

### O que foi conferido, e como

- **29 casos novos** (`tecido/teste/recusa.test.js`), escritos **antes** do
  código, e **nove defeitos reintroduzidos um a um** para provar que cada caso
  pega o seu: recusar o próprio trabalho (reprova 1), recusar o que não é
  anterior (2), reabrir só o culpado (4), reabrir demais (4), não desfazer o
  `pronto_em` (1), não limpar o kit (1), motivo de peça sem etiqueta (1),
  `refeitas` em todos os reabertos (2) e não gravar quem tinha feito (1).
- **As três telas abertas**, e foi assim que a mudança nº 2 apareceu. O ciclo
  inteiro rodou: bipe na Montagem → Recusar → os quatro motivos possíveis →
  confirmar → o tubo de volta na fila da Serralheria com a tarja vermelha
  **REFAZER** → o card Refazer na Produção → o PDF com **REFAZER 2ª VEZ** em
  vermelho e o mesmo `SER-000001`.
- **Não é a conferência da fábrica.** Provou o fluxo e as frases num navegador
  meu. A prova que fecha a fase é a bancada de verdade — é a lição do §4 do
  `CLAUDE.md`, onde o QR passou por três rodadas verdes sem ler em celular
  nenhum.

## STATUS DA FASE 5-B1 — em código em 24/09/2026

**O bipe e as filas (§4.15).** A 5-A pôs os cinco setores no controle de
acesso; aqui eles ganham o que bipar. Migração 21, `dominio/producao.js`,
`dados/producao.js`, `rotas/producao.js` e a tela `/sobmedida/bancada`.

```
SERRALHERIA: tubo · base ─┐
COLEÇÃO: tecido ──────────┴─▶ MONTAGEM ─▶ REVISÃO ─▶ EMBALAGEM ─▶ PRONTO
SERRALHERIA: bandô · barra ──────────────────────────────▲
```

### A mudança de ordem, e por que ela foi necessária

A lista de pendências prometia a 5-B como *"a recusa com motivo → setor →
pessoa"*. Ela **não podia vir primeiro**: a §4.16 diz que o sistema acha
**pelos bipes** quem fez o componente, e o bipe não existia. A linha da lista
omitia o pedaço maior, e a `producao.bipar` criada na 5-A era uma chave que
nenhuma rota lia — a dívida 18 pela porta da fase nova.

### As decisões desta fase

| # | Decisão | Por quê |
|---|---|---|
| 1 | **O "Pronto" é `pronto_em`, não um valor novo em `marco`** | três lugares filtram por `marco='aprovado'` — a reimpressão da etiqueta e as duas contas do comprometido e do material (4-B e 4-C). Trocar faria a etiqueta parar de reimprimir e mudaria em silêncio os números da compra |
| 2 | **Bandô e barra não seguram a montagem, só a embalagem** | são da caixa, não do conjunto; pô-los na montagem pararia a linha por uma peça necessária só no fim (§4.15) |
| 3 | **Um campo, um bipe: o primeiro inicia, o segundo termina** | dois botões são uma escolha a mais para quem está de luva, e a errada é trabalho perdido. Na embalagem são três pelo mesmo campo, como no PCP |
| 4 | **`producao.pendencia` é chave do MÓDULO, e da chefia** | se a bancada fechasse a própria pendência a trava deixaria de existir. Sendo do módulo, o diretor a recebe pelo `*` — ela não nasce inerte |
| 5 | **Kit sem código cadastrado é recusa, nunca "passou"** | deixar passar faria a conferência existir no papel e não pegar em ninguém, na peça que já está dentro do plástico |

### O que só apareceu abrindo a tela — três coisas, duas com teste verde por cima

- a frase escrevia **`colecao`**, a chave do banco, em vez de "Coleção"; o caso
  que existia **passava com o defeito** (o regex casava com os dois);
- a recusa do kit dizia *"sem quantidade de suportes cadastrada"* no kit
  tradicional, que por regra não usa faixa (§4.7) — e o caso de teste estava
  **travando o defeito**, conferindo a palavra "suporte";
- a ordem dos `DELETE` da limpeza do teste ignorava que `sm_pendencia` aponta
  para o componente: 12 casos reprovaram com erro de chave estrangeira.

E um defeito de verdade o teste pegou sozinho: **o kit contava na conta do
Pronto** (cada persiana tem duas linhas de setor `embalagem`), e o pedido
ficava eternamente a uma peça de fechar.

### ✅ Rodada completa na tela — e o que ela NÃO prova

Uma persiana lisa atravessou os cinco setores só com bipe, com o kit errado
recusado e o certo aceito; a do bandô provou as duas metades da regra (a
montagem andou sem ele, a embalagem foi segurada por ele); na última persiana
saiu **PEDIDO PRONTO**, com `pronto_em` gravado e `marco` intacto.

**Isso não é a conferência da fábrica.** Provou o fluxo e as frases num
navegador. A prova que fecha a fase é a bancada de verdade, com o leitor na
mão — é a lição do §4 do `CLAUDE.md`, onde o QR passou por três rodadas verdes
sem ler em celular nenhum.

**Testes:** `cd tecido && npm test` — 482 casos, 32 desta fase. Cinco defeitos
foram reintroduzidos um a um para provar que cada caso pega o seu.

---

## STATUS DA FASE 5-A — em código em 24/09/2026

**Os cinco setores da produção no controle de acesso do PCP.** O pedido parava
em `aprovado` e a fábrica não tinha como dizer que trabalhou. Esta é a primeira
metade da fase 5 — **o acesso** —, e ela sobe sozinha por uma razão: a regra só
pega quando alguém estiver marcado, e o dono marca enquanto o bipe é
construído. Regra que depende de caixinha marcada é a armadilha #30, que
deixou `modelo.sob_medida` três semanas inerte.

**Decisão do dono:** *"tem que ser possível a gente criar cada setor no
controle de acesso, e quem tem acesso dentro da empresa por login já pega seu
tablet de manhã e vê o que tem para fazer"*.

```
permissoes.js (PCP)      sobmedida.serralheria · .colecao · .montagem
                         .revisao · .embalagem        — cinco, nivel operacao
acesso.js (PCP)          cinco setores nativos, VAZIOS + cinco linhas no PERM_AREA
tecido/nucleo/acesso.js  setoresDe() — quais bancadas esta pessoa bipa
tecido/nucleo/permissoes.js  o papel `producao` e a chave `producao.bipar`
```

### As duas mudanças no caminho (fase 5-A)

| # | Mudou | Por quê |
|---|---|---|
| 1 | **Cinco chaves, e não uma de "produção"** | o bipe grava **quem fez**, e é por ele que a recusa da 5-B acha a pessoa certa. Uma chave só deixaria o serralheiro bipar a embalagem, e a régua apontaria para quem não trabalhou ali — régua que acusa o inocente é pior que régua nenhuma |
| 2 | **`producao.bipar` vem do SETOR, não do papel** | o papel é sempre a área mais larga (uma só, sem soma). Sem isso, o vendedor que também embala sairia como `vendedor` e levaria 403 na bancada, com o setor marcado na tela e sem ninguém entender por quê |

> ⚠️ **SETOR É CADASTRO, CHAVE É CÓDIGO.** Nome, ordem e prefixo da etiqueta se
> editam em `sm_setor`; um **sexto** setor exige chave nova no PCP. Gerar a
> permissão a partir do `tecido.db` acoplaria os dois bancos e furaria a porta
> única. Está escrito porque é onde alguém tenta "consertar" depois — e o
> resultado seria a tela deixar criar um setor que não libera ninguém.

> ⚠️ **AS CINCO SÃO `operacao`, NUNCA `admin`.** `sincronizarAreas` põe a área
> `admin` em quem tem qualquer chave de nível admin, e o portão do módulo lê
> `admin` como **diretor**: um setor declarado admin entregaria catálogo,
> parâmetros do encaixe e descarte de sobra a quem só embala. É a porta A da
> armadilha #28 por cinco portas de uma vez.

> **Conferido reintroduzindo cada defeito:** tirar a linha do `PERM_AREA` (a
> área some sozinha no salvamento seguinte), tirar `producao.bipar` do
> `POR_SETOR` (quem vende e embala perde a bancada), o papel `producao` sem
> `modulo.entrar` (o módulo abre em branco com 403 no console) e ordenar os
> setores por nome (a fila leria a ordem do trabalho errada). Cada um reprova o
> caso que existe para pegá-lo. `teste_acesso.js` 154 · `npm test` 450.

> **E a tela foi aberta:** os cinco aparecem em Admin → Acessos → Setores, cada
> um com `0 pessoa(s) · 1 perm.`, e as cinco caixinhas na ficha da pessoa.

> ⚠️ **AINDA NÃO PEGA EM NINGUÉM, e isso é a pendência 1 da lista do topo.**
> Enquanto os cinco ficarem com `0 pessoa(s)`, a fase 5 inteira é texto. **O
> sinal de inerte:** marcada a primeira pessoa, ela tem que ver a bancada dela
> no menu do `/sobmedida`. Não ver é defeito.

## STATUS DA FASE 4-C — em produção em 24/09/2026

**O tubo da persiana sob medida chegou ao Compras do PCP.** É o outro lado da
divisão que a 4-B fez: o tecido fica no painel do próprio módulo (estoque
próprio, painel próprio), e o tubo vai para o Compras do PCP porque é o
**mesmo material** da medida padrão, comprado do mesmo fornecedor — decisão do
dono em 24/09/2026, *"é o mesmo tubo, e o compras deveria ser o mesmo"*, mesmo
com a produção sendo duas linhas de trabalho separadas.

**A regra nova, e ela é do dono:** a peça **sai da conta de compra quando a
etiqueta dela é impressa**. Na medida padrão isso se resolve sozinho (a peça é
embalada, vira estoque, e o `precisa` cai); aqui o pedido para em `aprovado`,
porque o marco seguinte é o bipe da bancada, que é a fase 5. Sem sinal de saída
o número só subiria, e número que só sobe é número que a equipe aprende a
ignorar. **Custo assumido:** o maço impresso e ainda não cortado conta como
produzido — são horas, não dias. As alternativas na mesa eram o corte do tecido
(outra bancada, régua emprestada) e "nada até a fase 5" (honesta e inútil).

**Entregue:** migração 20 (`componente_id` em `sm_degrau_tubo` e em
`sm_componente`, por `ALTER`, como a fase 1 já prometia), `tecido/nucleo/
materiais.js` (a porta de ida), `consumo.materialDeCompra()`,
`catalogo.ligarMaterialDoDegrau` / `ligarMaterialDoComponente`, três rotas
novas, a coluna **Material de compra** na escada e nos componentes,
`sobmedida_material.js` (a porta de volta, no PCP), o
`necessidade_dominio.somarSobMedida()` e os dois blocos novos na tela de
Compras. **Sem chave de permissão nova** — `catalogo.ler` e `catalogo.editar`
já cobrem. 30 + 29 casos novos: `npm test` do módulo vai a **449** e nasce o
`teste_compras_sobmedida.js`.

**O cadastro que faltava foi feito em 24/09/2026.** O PCP tinha **um** tubo
(`Tubo 32 mm`) e a escada usa 32, 38, 41 e 56; os três novos foram criados em
**metro** pelo card Materiais — que nasceu no mesmo dia, porque **não havia
tela para criar material em lugar nenhum** (`CLAUDE.md` §7-B, armadilha #33) —
e os quatro degraus foram apontados:

```
Tubo 32 → componente 1     Tubo 38 → 27     Tubo 41 → 28     Tubo 56 → 29
```

**Quem provou o cadastro foi a pendência SUMIR**, e não a lista encher: sem o
vínculo, o tubo do 5001 sairia como *"degrau sem material apontado"*. Os três
nasceram com mínimo e ideal em **zero** (o `Tubo 32 mm` tem 75), de propósito:
o gatilho 1 não dispara sozinho e a necessidade vem só do que está vendido —
preencher é decisão, não conserto.

**As duas mudanças no caminho:**

| # | Mudou | Por quê |
|---|---|---|
| 1 | **Não há `fator_para_compra` digitado** | Quem responde como a peça vira quantidade é a **unidade** do item do PCP, lida ao vivo (`m` lê a medida de consumo, `un` conta peças). Um multiplicador digitado uma vez seria a segunda régua da mesma conta, e a que erra em silêncio. Unidade que a peça não sabe dizer é recusada no cadastro |
| 2 | **O vínculo do tubo mora no DEGRAU**, e não no componente | Tubo 32 e Tubo 41 são itens de estoque diferentes: o material muda com o degrau, e o `sm_componente` tem uma linha só. O componente de chave `tubo` recusa o vínculo, dizendo para ir à escada |

> **DEPLOY EM 24/09/2026, e ele foi limpo:** migração 20 aplicada, sob medida
> montado, 172 rotas com permissão declarada, `/login` 200. Backup por
> `db.backup()` antes (`backups/tecido-antes-4c.db`, com o pedido 5001 dentro).
>
> **A primeira leitura em produção deu `materiais: []` e `pendencias: []`, e é
> o resultado certo** — vale escrito porque tela vazia se parece com tela
> quebrada. O 5001 é o único pedido aprovado, e os dois tubos dele (um Tubo 41,
> um Tubo 32) foram impressos em 23/09 às 14:49:33: pela regra desta fase, peça
> com etiqueta impressa já saiu da conta. Quem vai aparecer é o **próximo**
> pedido aprovado.

> ⚠️ **AINDA NÃO FOI CONFERIDA NA FÁBRICA.** Deploy não é conferência, e
> cadastro também não. Metade da prova foi feita em 24/09 — os tubos estão em
> Compras e os quatro degraus apontados. **O que falta é o próximo pedido
> aprovado somar na linha certa, e o comprador comprar por ela.** Enquanto isso
> não acontecer, está escrito aqui como não conferido.
>
> **E o sinal de inerte está ARMADO desde 24/09** — é o que falta em quase
> todas as regras novas (dívida 18). Com os degraus apontados, pedido aprovado
> que ainda tenha peça **não impressa** que **não** apareça no Compras é
> **defeito**, não silêncio normal. É a diferença entre esta fase e as três
> semanas em que `modelo.sob_medida` ficou inerte sem nada acusar.

> **O que a tela mostrou, e nenhum teste de unidade pegaria** (três defeitos, os
> três no primeiro render): a pendência é por **peça** no domínio — e tem que
> ser —, e a tela escrevia a mesma frase uma vez por peça, quatro linhas
> idênticas num pedido de quatro persianas do mesmo degrau; as frases do domínio
> do sob medida saíam **sem acento** numa tela do PCP que é toda acentuada; e o
> jar de cookie do `curl` marca o cookie de sessão com `#HttpOnly_`, que o
> filtro de comentário do script de tela jogava fora — a tela abria no login e
> parecia permissão trocada. Os três estão consertados.

## STATUS DA FASE 4-B — em código em 24/09/2026

**A fase 4 virou três, e a divisão saiu de uma pergunta que esta spec não
respondia.** A 4-B pedia "consumo de material para Compras por porta única".
Investigando o código: o `sm_componente` do sob medida (a peça que vira
etiqueta) e o `componente` do PCP (o que se compra do fornecedor) são **dois
cadastros que não se conhecem** — não há vínculo, e o próprio schema do sob
medida já dizia, em comentário, que aquilo "não é o material de compra". Criar
o vínculo é cadastro e decisão de negócio, não código.

**As duas decisões do dono em 24/09/2026 (em `DECISOES.md`):**

| | |
|---|---|
| **o tubo é o mesmo material** da medida padrão, e **Compras é um só** | mesmo com a produção sendo duas linhas de trabalho separadas. Separar as compras compraria o mesmo tubo duas vezes, perdendo escala |
| **o tecido não vai para o Compras do PCP** | o estoque dele mora no `tecido.db` e já tem painel próprio. Mandá-lo também seria a segunda régua da armadilha #12 |

Então: a **4-B é o tecido** (esta), e a **4-C é o tubo** — o vínculo
`sm_componente` → `componente` do PCP, com fator de unidade, e a lista de
compras somando as duas operações.

**Entregue:** `tecido/dominio/consumo.js` (dono único do comprometido e dos
pedidos em risco), o `gerencial.js` compondo o comprometido no resumo e numa
lista `por_tecido`, `GET /api/pedidos/risco/tecido`, o card **Vendido e ainda
não cortado** no painel e o card **Aprovados esperando tecido** na tela de
pedidos. Sem migração e **sem chave de permissão nova** — `painel.ler` e
`pedido.ler` já cobrem, e chave nova aqui seria a terceira ponta da armadilha
#13 sem precisar. 14 casos novos: `npm test` do módulo vai a **419**.

**As duas mudanças no caminho:**

| # | Mudou | Por quê |
|---|---|---|
| 1 | **A fase virou 4-B (tecido) + 4-C (tubo)** | o vínculo com o Compras do PCP não existe e é decisão de cadastro. Entregar o tecido agora não depende dele, e o painel do sob medida era onde o número fazia falta |
| 2 | **A porta para o Compras ficou de fora** | o plano previa uma porta que devolveria lista vazia até o vínculo existir. Regra escrita que não pega em ninguém é a dívida 18 — ela nasce na 4-C, junto com o cadastro que a torna verdadeira |

> ⚠️ **AINDA NÃO FOI CONFERIDA NA FÁBRICA.** Os 419 casos e as duas telas
> abertas são indício. A prova é o comprador olhando o painel e **comprando por
> ele** — e, do outro lado, o vendedor ligando para a revenda por causa do card.
> Enquanto isso não acontecer, está escrito aqui como não conferido.

> **O que a tela mostrou, e nenhum teste de unidade pegaria** (três defeitos, os
> três no primeiro render): o aviso dizia *"Pedido 5001 precisa de 7,56 m²"* e
> *"Pedido 5002 precisa de 7,56 m²"* — o total do **tecido** repetido em dois
> pedidos de tamanhos diferentes, e quem somasse compraria o dobro; o filtro da
> tela cortava a tabela e **não** o cartão do resumo, pondo dois recortes lado a
> lado; e a tabela nasceu com classes de CSS da tela de produção, que não
> existem no `base.css`. Os três estão consertados, com caso travando os dois
> primeiros.

## STATUS DA FASE 4-A — em código em 23/09/2026

**A fase 4 foi partida em duas**, e a divisão é do assunto, não do tamanho: a
**4-A** é a etiqueta de produção e o corte (o que a fábrica faz com o pedido
aprovado); a **4-B** é o consumo de material para Compras por porta única e o
item sem tecido aparecendo lá. A 4-A não depende da 4-B e entrega a bancada
inteira; a 4-B encosta no `COMPRAS.md`, que tem dono próprio.

**Entregue:** migração 19 (`sm_setor` com os cinco setores semeados e o
contador de cada um, quatro colunas em `sm_pedido_componente` —
`codigo_etiqueta`, `impresso_em`, `impresso_por`, `reimpressoes` — e
`sm_etiqueta_impressao`), `tecido/dominio/etiqueta_producao.js` (dono único do
código e do que vai escrito), `tecido/dominio/etiqueta_producao_pdf.js`,
`tecido/dados/etiqueta_producao.js`, `tecido/rotas/etiqueta_producao.js`, a
tela `/sobmedida/producao`, `tecido/backfill_etiquetas.js` e duas chaves novas
(`etiqueta_producao.ler`, `etiqueta_producao.imprimir`). O `etiqueta_pdf.js`
passou a exportar `desenharBarras`, e o `pedido.js` chama `atribuirCodigos`
dentro da transação da aprovação. 16 casos novos: `npm test` do módulo vai a
**405**; `teste_acesso.js` do PCP vai a **114**.

**As duas mudanças no caminho:**

| # | Mudou | Por quê |
|---|---|---|
| 1 | **São 6 etiquetas na persiana simples e 7 com adicional — não 8** | O plano desta fase dizia oito, e o dono aprovou com esse número. Estava errado: a ficha tem oito componentes com `gera_etiqueta=1`, mas **bandô e barra nunca convivem** e nenhum dos dois entra quando `adicional='nenhum'`. A regra aprovada (uma etiqueta por componente que gera etiqueta) não mudou — o que estava errado era a conta. O pedido 5001 conferiu sozinho: 13 etiquetas para duas peças |
| 2 | **O código de barras ocupa a largura inteira, numa faixa no rodapé** | O desenho de duas colunas (texto à esquerda, código nos 38 mm da direita) dava módulo de **0,23 mm** — abaixo do que a ZD220 resolve numa etiqueta amassada. A faixa de 66 mm no rodapé sobe o módulo e não tira nada do texto, que ganhou as linhas de cima |

> ✅ **EM PRODUÇÃO E CONFERIDA NO PAPEL EM 23/09/2026 — O LEITOR BIPOU.** Deploy,
> backfill (13 etiquetas do pedido 5001 — 6 na persiana lisa e 7 na de bandô),
> maço da Serralheria impresso na ZD220, e o leitor da bancada **bipou**. É a
> régua final de código de barras, a mesma que a §4 do `CLAUDE.md` ensina com o
> QR do kit — que passou por três rodadas verdes sem ler em celular nenhum. Os
> 405 casos e a tela aberta eram indício; o bipe é a prova.

> ⚠️ **E O QUE O BIPE NÃO PROVA, escrito aqui porque meia prova dada como prova
> inteira fecha a pergunta para sempre.** Ele diz que a ZD220 imprime este
> CODE128 num módulo que o leitor resolve — e mais nada. **Continua por
> conferir:** que a medida escrita é a que a serralheria corta de verdade (isso
> é a bancada, com o tubo na mão) e que o maço inteiro atravessa os cinco
> setores. Essas só a primeira peça real responde.

> **O que a tela mostrou, e nenhum teste pegaria** (quatro defeitos, todos no
> primeiro render): a fileira de escolha do setor saía com os cinco botões
> idênticos, sem o azul do escolhido — o `aria-pressed` estava certo e a regra
> de CSS não existia, porque a tela tinha fileira própria em vez da do
> `base.css`; a tarja "sem tecido" era uma coluna **sem cabeçalho** que só
> existia na linha que a tinha, e a tabela saía torta; o aviso do já impresso
> dizia *"1 destes pedidos já tiveram"*; e o histórico escrevia a **chave** do
> setor (`serralheria`) em vez do nome. Os quatro estão consertados e a
> história ficou no `CLAUDE.md` §19.

**O que fica para a 4-B:** o consumo de material dos pedidos aprovados
disponível para Compras por **porta única**, e o item sem tecido aparecendo na
lista de compras e avisando o vendedor. O sinal de "sem tecido" já existe e
já aparece na tela da produção (fase 3 o gravou no envio); o que falta é ele
chegar a quem compra.

## STATUS DA FASE 3 — em código em 22/09/2026

**Entregue:** migração 18 do `tecido/nucleo/schema.js` (sete tabelas —
`sm_pedido`, `sm_pedido_item`, `sm_pedido_item_preco`, `sm_pedido_componente`,
`sm_pedido_marco`, `sm_pedido_prazo`, `sm_pedido_alteracao` — mais o parâmetro
`pedidoNumeroInicial`), `tecido/dominio/pedido.js` (dono único do ciclo),
`tecido/dominio/pedido_pdf.js`, `tecido/dados/pedido.js`, `tecido/rotas/pedido.js`,
a tela `/sobmedida/pedidos`, seis chaves de permissão novas e
`GET /api/sm/colecoes/:id/cores`. O `persiana.js` passou a devolver o
`tecido_id` que já resolvia, e o `prazo.js` ganhou `diasUteis`. 32 casos de
teste novos: `npm test` do módulo vai a **387**.

> ⚠️ **AINDA NÃO ESTÁ PRONTA.** O "pronto quando" da seção 7 é *uma semana de
> pedidos do WhatsApp lançada aqui, em paralelo ao Decorsoft, sem diferença de
> preço nem de corte* — e isso é trabalho de tela, com os pedidos na frente.
> Enquanto não estiver feito, a fase é **código entregue**.

### ✅ CONFERIDA EM PRODUÇÃO EM 23/09/2026, COM A FOLHA NA MÃO

O dono fez o deploy, lançou o número do Decorsoft (5000) e rodou o ciclo
inteiro numa revenda de verdade: orçamento → transformar em pedido → enviar →
aprovar → PDF. Saiu o **pedido 5001**, com duas persianas e duas coleções de
preços diferentes na mesma folha. As contas foram refeitas **por fora do
sistema**, contra o PDF gerado:

| | |
|---|---|
| numeração | 5001 — o seguinte ao 5000 lançado (§4.18) |
| peça 1 | 2,100 × 2,200 = **4,620 m²** → passou dos 3,5 m² do Tubo 38 e subiu para o **41** · 4,620 × R$ 110,00 = **R$ 508,20** · redução de peso **automática e cobrada** (+R$ 50,00) |
| peça 2 | 1,000 × 1,000 = 1,000 m² real, e a folha cobra **1,500** — o mínimo faturado · 1,5 × R$ 140,00 = **R$ 210,00** · bandô 1,000 m × R$ 55,00 = **R$ 55,00** |
| cascata (tabela B, −5,00%) | 558,20 × 0,95 = **530,29** · 265,00 × 0,95 = **251,75** |
| totais | Deccorar **R$ 823,20** · a pagar **R$ 782,04** — a soma das peças, fechando com as parcelas impressas na folha |
| prazo | enviado quarta 13:31, antes do corte das 18h → **quinta 01/10** (§4.9) |
| sem tecido | a peça 2 é de tecido que não está na estante: **entrou marcada**, não travou (§4.10) |

> ⚠️ **O QUE ESTA FOLHA PROVA, E O QUE ELA NÃO PROVA.** Ela prova o ciclo, a
> aritmética, o mínimo faturado, a escada, a cascata, o prazo e o sinal de
> tecido — tudo contra o papel, não contra o que o código disse de si mesmo.
> Ela **não** prova que R$ 110,00 e R$ 140,00 são os preços certos daquelas
> coleções: isso é cadastro, e quem lançou foi o dono. A prova que falta é a
> **semana em paralelo ao Decorsoft**, comparando pedido a pedido — e é ela, e
> só ela, que fecha a fase.

**Conferido pelo fio, na tela de verdade** (navegador dirigido contra o
servidor local, do orçamento até a aprovação):

| | |
|---|---|
| orçamento com a persiana da §4.8 | **R$ 209,00** Deccorar · **R$ 178,70** revenda |
| envio | número **4273** (o seguinte ao 4272 do Decorsoft), preço e prazo gravados |
| prazo, enviado numa terça | *"Pronto em quinta 01/10 · 7 dias de fábrica"* |
| aprovação | a ficha explodiu: tubo 0,770 · tecido 0,765 × 1,400 · base 0,770 · bandô 0,795 |
| a folha em PDF | sai com as linhas de preço uma a uma e o **TOTAL A PAGAR** |

### As três decisões da fase 3

**1. Pedido APROVADO não se altera, nem pelo admin.** A §4.10 dizia *"depois de
aprovado, só o admin mexe"*, e a fase 4 traria *"até a primeira etiqueta
impressa"*. Essa marca **não existe ainda** — implementá-la agora criaria uma
regra escrita, codificada e que não pega em ninguém, que é a dívida 18 do
`CLAUDE.md` (a flag `sob_medida` ficou três semanas inerte). O caminho é
**cancelar a peça com motivo e lançar outra**: funciona hoje, não perde história
nenhuma, e é a regra mais fácil de afrouxar depois.

**2. O pedido ENVIADO volta a rascunho, e o reenvio recalcula.** A porta fecha
na aprovação do vendedor, não no envio. O **número fica** — ele já foi dito à
revenda por escrito, e número que volta para o bolo é número que um dia sai
duas vezes.

**3. Orçamento não queima número, e virar pedido é um ato próprio.** O número
nasce no envio, e o envio recusa quem ainda é orçamento. Sem `pedidoNumeroInicial`
lançado, o envio é **recusado** dizendo onde se lança: numerar por cima do
Decorsoft faria o plano de corte herdar o tom de outra casa (§4.18).

### Mudanças no caminho (fase 3)

1. **Sete tabelas, e não seis.** As linhas de preço congeladas ganharam tabela
   própria (`sm_pedido_item_preco`) em vez de caberem dentro do item: o PDF e o
   faturamento leem linha a linha, e só o total faria a conferência da revenda
   virar *"confie no número"*.
2. **`GET /api/sm/colecoes/:id/cores` nasceu junto.** O pedido exige a cor do
   tecido e quem lança é o vendedor, que **não tem `cadastro.ler`** — mandá-lo
   a `/api/cadastros` daria a ele a lista inteira de tecido, endereço e motivo
   para responder uma pergunta de três palavras.
3. **`pedido.aprovar` e `pedido.aprovar_qualquer` são duas chaves.** Uma só
   significaria escolher entre travar a fila numa semana de férias e deixar
   qualquer vendedor aprovar a revenda do colega.

### O que esta fase deixou explicitamente aberto

| Fica de fora | Por quê |
|---|---|
| **Alteração de pedido aprovado** | decisão 1 acima — espera a marca da primeira etiqueta (fase 4) |
| **O pedido ir para a fábrica** | fase 4: etiquetas, código sequencial por setor, plano de corte |
| **Crédito descontando o pedido** | boleto é fase 6; hoje o limite é só cadastro |
| **Portal da revenda** | fase 7 — e ali o preço Deccorar **não pode** viajar pelo fio |

---

## STATUS DA FASE 2 — em código em 22/09/2026

**Entregue:** migração 17 do `tecido/nucleo/schema.js` (`sm_revenda`,
`sm_revenda_endereco`, `sm_revenda_contato`, `sm_tabela_preco`,
`sm_forma_pagamento`, `sm_feriado` e os cinco parâmetros novos),
`tecido/dominio/revenda.js`, `tecido/dominio/prazo.js`,
`tecido/nucleo/pessoas.js`, as rotas, a tela `/sobmedida/revendas`, o preço da
revenda dentro do `persiana.js` e a área **Sob medida — venda** no PCP.
51 casos de teste novos: `npm test` do módulo vai a **355**, `teste_acesso.js`
a **113**.

> ⚠️ **AINDA NÃO ESTÁ PRONTA.** O "pronto quando" da seção 7 é *as revendas
> ativas de hoje estão cadastradas, cada uma com vendedor* — e isso é trabalho
> de tela, com a lista de clientes na frente. Enquanto não estiver feito, a
> fase é **código entregue**, não fase concluída. Escrever "pronta" aqui
> fecharia a pergunta para sempre, e é o mesmo verde sem conferência que o §10
> do `CLAUDE.md` chama de pior que vermelho.

**Conferido pelo fio, no servidor local**, com o exemplo da §4.8 e a cascata da
decisão abaixo:

| | |
|---|---|
| preço Deccorar, sem revenda | **R$ 209,00** — o mesmo da fase 1, intocado |
| com tabela B (−10,00%) e desconto de 5,00% | **R$ 178,70** (cascata; somados dariam 177,65) |
| prazo, enviado numa terça | *"corte quarta 23/09 às 18:00 · pronto quinta 01/10"* — o exemplo da §4.9 |

### As quatro decisões da fase 2

**1. A tabela e o desconto entram EM CASCATA**, nessa ordem, com **um único
arredondamento no fim**. Somados, 10% + 5% dariam 15% e em cascata dão 14,5%;
num pedido de mil reais são cinco reais. E a soma deixaria dois percentuais
grandes zerarem a venda sem ninguém notar. Há caso travando o arredondamento:
reintroduzir o defeito reprova o `persiana.test.js`, e foi conferido assim.

**2. As três tabelas nascem SEM percentual**, e não com zero. `NULL` é "ainda
não se sabe"; zero é "sem desconto", que é decisão. Sem percentual o simulador
**não mostra** o preço daquela revenda e **nomeia** a tabela que falta — e não
mostra piso, porque desconto só faz o número descer: ali o subtotal Deccorar
seria um teto, e `≥` diria a coisa errada com a palavra certa.

**3. O vendedor ganhou área própria no PCP** — *Sob medida — venda* —, e com
ela o papel `vendedor` no módulo: simulador, catálogo de leitura e a carteira
dele. Fecha a dívida que a fase 1 deixou escrita ("o vendedor entra por uma
área larga demais"). `revenda.editar` e `credito.editar` **não** são dele: a
tabela, o desconto e o limite são decisão de quem responde pelo dinheiro
(§4.12 e §4.13). Alargar depois é uma linha; o contrário, não.

**4. O vendedor é gente do PCP, por uma porta única.** Nenhum cadastro de
pessoas nasceu aqui — a lista chega pelo `nucleo/pessoas.js`, ligado no
`server.js`, e o que atravessa é `id` e `nome`, e mais nada. Sem a porta
ligada, a escolha do vendedor **recusa dizendo onde se liga**; lista vazia em
silêncio faria a tela afirmar que a fábrica não tem ninguém.

### Mudanças no caminho (fase 2)

1. **Nasceu a chave `modulo.entrar`.** A tela inicial e o `/api/eu` pediam
   `cadastro.ler`, *"a chave mais baixa que todo mundo que entra tem"* — com o
   terceiro papel isso virou mentira. Sem ela, ou o vendedor abriria o módulo
   em branco com 403 no console, ou ganharia `cadastro.ler` de carona (e com
   ela a lista de tecido, endereço e motivo).
2. **`sobmedida.vender` é `nivel:'operacao'` no PCP, e isso é trava.**
   `sincronizarAreas` põe a área `'admin'` em quem tem qualquer chave de nível
   admin, e o portão do sob medida lê `'admin'` como **diretor** — declarada
   como admin, a chave devolveria ao vendedor o módulo inteiro que ela veio
   tirar dele. O `teste_acesso.js` confere o **nível declarado**.
3. **O calendário e o prazo ficaram na tela de Revendas**, e não numa tela
   própria: são quatro parâmetros e uma lista de feriados, e o que torna o
   cadastro conferível é a prévia — *"enviando agora, fica pronto em ..."*.
4. **O limite de crédito se chama `valor_limite_credito_centavos`.** A poda do
   `custo.js` corta por padrão de nome; `limite_credito_centavos` não casaria
   e viajaria pelo fio em silêncio.

### O que esta fase deixou explicitamente aberto

- **Logo da revenda** — só é usado no orçamento ao cliente final (fase 7), e
  guardar arquivo é outro assunto (onde mora, backup, o cron que limpa).
- **Markup** — é da revenda, fase 7.
- **Crédito disponível** — `limite − boletos em aberto`, e boleto é fase 6.
  A tela mostra o limite e quem está com a revisão vencida; mostrar
  "disponível = limite" seria número mentindo, e está escrito na tela.
- **Achado no caminho, e NÃO mexido:** as outras 23 chaves de nível `admin` do
  PCP (`sku.cadastrar`, `custo.ver`, `devolucao.baixar`…) também põem a área
  `'admin'` em quem as tem — e o portão do sob medida lê `'admin'` como
  **diretor**. Ou seja: quem tem qualquer uma delas entra no sob medida com
  tudo. É anterior a esta fase, estreitar muda quem pode o quê (é `REGRA`, não
  conserto) e está registrado no `CLAUDE.md` §19.

---

## STATUS DA FASE 1 — implementada em 22/09/2026

**Entregue:** migração 16 do `tecido/nucleo/schema.js` (oito tabelas `sm_*` e o
cadastro inicial do Rolô), `tecido/dominio/persiana.js` (o dono único),
`tecido/dominio/catalogo_sm.js`, `tecido/nucleo/unidade.js`, as rotas, as telas
`/sobmedida/catalogo` e `/sobmedida/simulador`, e 52 casos de teste novos
(`npm test` do módulo: **304 casos**).

> ✅ **CONFERIDA EM PRODUÇÃO EM 22/09/2026.** O dono fez o deploy e simulou
> **dez persianas reais do WhatsApp: as dez bateram** — tubo, medidas de corte e
> kit, contra o que a fábrica cortaria. É o "pronto quando" da seção 7, e é a
> régua que vale.
>
> ⚠️ **E ESTÁ ESCRITO ASSIM DE PROPÓSITO.** Os 304 casos verdes, os 133+45 do
> kit e o R$ 209,00 conferido pelo fio eram **indício**, não prova: o defeito do
> QR da etiqueta do kit passou por três rodadas verdes antes de o dono descobrir
> com o celular na mão (`CLAUDE.md` §4). Teste diz que o código faz o que eu
> escrevi; só a fábrica diz que o que eu escrevi é o que ela corta.

**Pronto quando** (seção 7): *o dono simula dez persianas reais do WhatsApp e o
simulador bate com o que a fábrica cortaria.* — **cumprido em 22/09/2026, dez
de dez**, na primeira rodada (tubo, cortes e kit).

### ✅ E O PREÇO FOI CONFERIDO NA MESMA TARDE, numa segunda rodada

O R$/m² das coleções foi lançado e as **dez foram refeitas comparando o
TOTAL** com o que foi cobrado de verdade. As dez bateram.

Antes delas, duas contas de aritmética, escolhidas para não depender de qual
preço foi lançado — e as duas bateram:

| Medida | m² real | O total tinha que ser | O que prova |
|---|---|---|---|
| `1,000 × 1,000` | 1,000 m² | **1,5 × o preço** | o mínimo faturado está pegando |
| `2,000 × 1,000` | 2,000 m² | **2 × o preço** | acima do mínimo quem manda é o m² real |

> **A fase 1 fechou nas duas metades**: o que a fábrica corta e o que o cliente
> paga. O corte foi conferido antes do preço existir; o preço, depois — e é por
> isso que são duas rodadas de dez, e não uma.

### O que foi cadastrado no deploy de 22/09/2026

| | |
|---|---|
| Coleções de venda ligadas ao Rolô | **oito**, todas as do `Rolo`: `1%` · `1% FB` · `3%` · `5%` · `Blackout` · `Napoles BK` · `Pinpoint BK` · `Translucido` |
| Cores de acessório | **quatro**: Branco · Bege · Cinza · Preto |
| Preço do m² por coleção | **lançado em 22/09/2026**, e conferido nas dez |
| Largura máxima por coleção | **em branco** — quem limita é a escada de tubos |

> **`Double Vision · Classic` ficou de fora, e não é esquecimento:** ela é do
> modelo Duplex, que ainda não existe como modelo de venda. Ligá-la ao Rolô
> faria o simulador oferecer tecido de Duplex numa persiana Rolô.

> ⚠️ **COLEÇÃO SEM PREÇO MOSTRA `≥`, E ISSO NÃO É DEFEITO.** Os preços de hoje
> estão lançados, mas a regra continua de pé para a coleção nova de amanhã: sem
> R$/m², o simulador devolve `valor_subtotal` nulo, soma o que sabe como
> **piso** e **nomeia** a linha que falta. É a regra 4 do custo — zero é um
> custo válido e mentiroso. Quem vir o `≥` em âmbar está vendo a regra
> funcionando, não a tela quebrada.

> ⚠️ **O TOTAL DO SIMULADOR É O PREÇO DECCORAR, e não o que a revenda paga.** A
> tabela A/B/C e o desconto dela entram na **fase 2** — e o card escreve isso
> embaixo, para ninguém mandar esse número para a revenda achando que é o dela.

### As duas decisões que a seção 8 marcava "antes da fase 1" — respondidas

**1. A tabela A/B/C é um PERCENTUAL por tabela**, guardado em inteiro, mais o
desconto da revenda — e não um preço por coleção em cada tabela.

O preço do m² já tem dono único por item no módulo (`tecido.preco_m2`, com
histórico, e as duas telas que o editam chamam a mesma rota). Uma matriz
3 × N coleções faria cada coleção nova **nascer sem preço em duas das três
tabelas, em silêncio** — a doença dos "mínimos são placeholder" e do alvo velho
do `CLAUDE.md` §18 —, e faria a fórmula da §4.8 ter três respostas para a mesma
pergunta. O risco que a matriz pareceria resolver (preço andando para trás,
armadilha #15) **já está resolvido pelo congelamento no envio**.

> O cadastro da tabela é da **fase 2**. A fase 1 entrega o **subtotal
> Deccorar**, que é exatamente o que o exemplo da §4.8 chama de "tabela sem
> desconto". Se um dia uma coleção precisar de preço próprio numa tabela, isso
> entra como **linha de exceção** — visível, uma —, nunca como matriz inteira.

**2. O modelo NÃO aponta para uma linha: ele aponta para uma LISTA de
coleções**, e cada coleção já carrega a linha dela.

Sai do schema, não de palpite: `abertura` pendura em `linha` com
`UNIQUE(linha_id,nome)` e o `criarTecido` recusa `abertura_de_outra_linha` — a
linha **já está dentro** da coleção. Guardá-la também no modelo seria uma
segunda afirmação sobre o mesmo fato, e é o defeito do `linhaSel`/`linhaForm`
de 15/09/2026 (o formulário descrevia `Double Vision` com uma coleção do
`Rolô`). Além disso não são a mesma coisa: `linha` é a família do **tecido**
(Rolô, Romana, Double Vision), o modelo é o **mecanismo** (Rolô, Duplex,
Motorizada) — Rolô e Motorizada partilham o tecido.

> ⚠️ **Confirmar no cadastro real.** O `tecido.db` não está no repositório, e a
> resposta acima é estrutural — vale de qualquer jeito. O que depende do dado é
> **quais** coleções ligar a cada modelo: `node tecido/ver_cadastro.js` no
> servidor responde em um comando, e só lê.

### Mudanças no caminho (fase 1)

1. **As tabelas levam prefixo `sm_`.** O esboço da §6 propunha `modelo`,
   `componente_sm`, `ficha_linha`. O módulo já tinha 27 tabelas sobre estoque
   de tecido: `modelo` e `componente` sozinhos obrigariam quem lê a adivinhar
   de qual dos dois assuntos são — e as duas palavras já querem dizer outra
   coisa no PCP.
2. **O dono único chama-se `persiana.js`, não `ficha_sm.js`.** Ele não devolve
   uma ficha: devolve degrau, cortes, consumo, kit, preço, avisos e recusas —
   "o que esta persiana é", que é o nome da pergunta.
3. **`sm_degrau_tubo` nasce SEM `componente_id`.** Ligar o degrau ao tubo
   comprado é pergunta de Compras (fase 4), e coluna que não faz nada é mentira
   na tela de cadastro. Ela entra por `ALTER` quando houver o que ligar.
4. **Área em mm² inteiro** (1 m² = 1.000.000), e não `REAL`. É o que faz a
   divisa "3,0 m² fica no degrau de baixo" existir de verdade, sem depender de
   tolerância de ponto flutuante.
5. **O resultado traz um bloco `opcoes`**, calculado sempre. A §4.6 manda a
   opção de bandô sumir da tela *na hora, com a frase* — e uma tela só faz isso
   se souber antes de tentar. Descobrir pela recusa daria a frase certa e
   nenhuma persiana calculada junto.

### O que a fase 1 deixou explicitamente aberto

- **O vendedor entra por uma área larga demais.** Não foi criada área nova no
  PCP: até a fase 2, quem usa o catálogo e o simulador precisa de "Sob medida —
  cadastros", que também dá cadastro de tecido, parâmetros e descarte de sobra.
- **As coleções de venda não são semeadas** — elas apontam para linhas de
  `abertura` que só existem no cadastro real. Ligar cada uma e lançar o preço
  do m² é o primeiro trabalho na tela de Catálogo.
- **O consumo nasce igual ao corte.** A coluna existe desde o primeiro dia
  (armadilha #18); as folgas reais ainda não foram medidas.

> **Onde mora:** tudo dentro do `/sobmedida`, no banco `tecido.db`, com as
> migrações numeradas de `tecido/nucleo/schema.js`. Nada nasce fora do PCP:
> mesmo processo, mesma porta, mesmo PIN para quem é da fábrica.
>
> **Leia junto:** `tecido/README.md` (o plano de corte que vai receber os
> pedidos), `PRODUCAO-MAPA-E-MOTOR.md` (o vocabulário de etapa, sessão e
> unidade, que esta spec usa) e o §7-B do `CLAUDE.md` (a ficha tem dois
> números por linha — armadilha #18).

---

## 1. Problema

O pedido sob medida chega por **WhatsApp**. A revenda manda largura e altura, e
a Deccorar pergunta o resto, uma coisa de cada vez: rolamento invertido ou
normal, comando direito ou esquerdo, bandô ou barra, cor da base. Cada pergunta
trava o pedido. Depois alguém digita tudo no **Decorsoft**, manda um PDF para a
revenda aprovar e só então o corte começa.

Quatro coisas ruins vêm disso:

1. **O pedido anda na velocidade da conversa**, não da fábrica.
2. **A regra técnica mora na cabeça de quem digita.** Qual tubo vai (32, 38, 41
   ou 56), se leva redução de peso, se o bandô cabe. Quem esquece, erra.
3. **A medida de corte é calculada à mão.** A serralheria recebe a etiqueta do
   Decorsoft; o módulo de tecido **lê o PDF** do Decorsoft para achar o corte
   do tecido (`tecido/dominio/etiqueta_corte.js`). O sistema da fábrica depende
   de um papel gerado por outro sistema.
4. **Ninguém sabe onde o pedido está, nem quanto tempo cada peça levou.** Não há
   prazo prometido gravado, não há fila de aprovação, não há tempo por setor,
   não há registro de quem errou quando a peça volta.

## 2. Objetivo

- A **revenda lança o próprio pedido** (ou orçamento), escolhendo modelo,
  coleção, cor e opções, com a medida acabada. O sistema aplica as regras do
  modelo, calcula o preço e o prazo, e grava tudo.
- O **vendedor da carteira aprova** e o pedido vai para a fábrica.
- A **ficha técnica** transforma a medida acabada em medida de corte de cada
  componente, escolhendo o tubo pela escada de tubos. Mudar uma regra (1,70 para
  1,80) é trocar um número na tela.
- Cada componente sai com **etiqueta 100×35 e código de barras único**. Cada
  setor bipa início e fim, e pode recusar a peça por defeito do setor anterior.
- A gestão enxerga **tudo num kanban**, com produtividade, tempo de aprovação,
  prazo cumprido, recusas, nota fiscal e crédito.
- Tudo é construído e testado **por dentro** (a equipe lança os pedidos do
  WhatsApp) antes de qualquer revenda ganhar login.

## 3. Como funciona na fábrica

```
REVENDA                     DECCORAR                         FÁBRICA
────────                    ────────                         ───────
Orçamento  (só simula)
    │
Pedido  ── envio ──▶  congela preço e prazo
                      ◀── tecido sem estoque? avisa o vendedor,
                          vai para Compras, negocia prazo
                      Vendedor da carteira APROVA
                              │
                              ▼
                      explode a ficha → componentes, cortes,
                      códigos de barras, peças no plano de corte
                                                    │
               SERRALHERIA (tubo · base) ──┐        │
               COLEÇÃO (tecido) ───────────┴─▶ MONTAGEM ─▶ REVISÃO ─▶ EMBALAGEM ─▶ PRONTO
               SERRALHERIA (bandô · barra) ──────────────────────────────▲
                                                    │
                      Financeiro: NF (antes ou depois da entrega), baixa dos boletos
                      Retirado / Entregue
```

**O que a fábrica passa a receber:** em vez do PDF do Decorsoft, uma tela de
impressão por setor. Seleciona os pedidos, escolhe o setor e imprime todas as
etiquetas daquele setor em série. Cada pessoa fica com as suas etiquetas.

**O que a serralheria vê:** `TUBO 0,970`. Nunca a medida acabada para ela
fazer conta.

---

## 4. Regras de negócio

### 4.1 Unidades — milímetro por dentro, metro com três casas por fora

| Onde | Como |
|---|---|
| Banco e contas | **milímetro inteiro** (`970`) |
| Tela e etiqueta | **metro com três casas** (`0,970` · `1,200`) — sempre as três, inclusive o zero final |
| Área | m² calculado a partir dos milímetros; exibido com três casas |
| Dinheiro | **centavos inteiros** no banco; arredonda uma vez, no total da linha |

> Guardar em milímetro inteiro evita o ruído de ponto flutuante que o PCP já
> conheceu (`3,5 + 0,2 = 3,7000000000000006`, §7-B). Etiqueta sempre com três
> casas para a serralheria nunca duvidar se o número está completo.

> ⚠️ **O plano de corte do tecido trabalha em metros (`REAL`).** A conversão
> acontece **numa porta só**, na entrega das peças ao plano (fase 4), e o que
> vai é a medida de **corte**, nunca a acabada — o mesmo aviso do
> `etiqueta_corte.js`: cortar pela acabada erra as duas dimensões, para lados
> diferentes.

### 4.2 O que se escolhe

| Escolha | Regra |
|---|---|
| Modelo | Rolô, Rolô Duplex, Rolô Motorizada… cadastrável |
| Coleção | Só as que o modelo aceita |
| Cor do tecido | Só as que existem para aquela coleção |
| Cor dos acessórios (base etc.) | Obrigatória; lista por modelo |
| Largura e altura **acabadas** | Obrigatórias, em metros com três casas |
| Lado do comando | **Obrigatório** — direito ou esquerdo |
| Rolamento | **Obrigatório** — desce pela frente ou por trás |
| Bandô **ou** barra niveladora **ou** nenhum | Opcional, e **nunca os dois juntos** |
| Redução de peso | Automática pela regra; opcional quando o tubo permite (§4.5) |

**Não existe "combinação proibida" de cor.** A revenda escolhe o que quiser. As
regras são do **modelo** (quais coleções, qual base, o que é obrigatório) e da
**medida** (qual tubo, se o bandô cabe).

### 4.3 A coleção de venda é o tecido que o módulo já conhece

O módulo de tecido já cadastra `linha` (Rolô, Romana, Double Vision),
`abertura` (mostrada na tela como **Coleção**: 1%, 3%, Nápoles) e `cor`. O item
de estoque é `tecido` = linha + coleção + cor.

> **A coleção de venda aponta para esse cadastro. Nunca o duplica.** Duas listas
> de coleções — uma de venda, outra de estoque — divergiriam no primeiro tecido
> novo, e o pedido chegaria ao plano de corte pedindo um tecido que o estoque
> não reconhece. O que a venda acrescenta é o que o estoque não tem: **preço por
> m², largura máxima, m² máximo e mínimo faturado**.

### 4.4 A escada de tubos

O tubo é escolhido pela medida. O sistema sobe até o **primeiro degrau onde a
persiana cabe nos dois limites**: largura **e** m². Passou de qualquer um dos
dois, sobe.

Valores iniciais do modelo Rolô (todos editáveis na tela):

| Tubo | Largura até | m² até | Desconto do tubo | Altura do tecido | Bandô |
|---|---|---|---|---|---|
| 32 | 1,700 | 3,0 | −30 mm | final + 200 mm | ✅ |
| 38 | 2,200 | 3,5 | −30 mm | final + 200 mm | ✅ |
| 41 | 2,700 | 5,0 | −40 mm | final + 250 mm | ❌ |
| 56 | 3,000 | 7,0 | −45 mm | final + 250 mm | ❌ |
| acima | — | — | **pedido recusado, com o motivo** | — | — |

A medida exata do limite fica no degrau de baixo: 1,700 × qualquer altura até
3,0 m² é tubo 32.

Vale **sempre o mais restritivo** entre degrau, modelo e coleção. O Screen 1%
vai até 2,800 de largura: uma persiana de 2,900 é recusada pela coleção, mesmo
cabendo no tubo 56.

### 4.5 A ficha do Rolô — tudo parte do tubo

| Componente | Setor | Largura de corte | Altura de corte | Etiqueta |
|---|---|---|---|---|
| Tubo | Serralheria | final − desconto do degrau | — | `SER-` |
| Base inferior | Serralheria | tecido + 5 mm (fica igual ao tubo) | — | `SER-` |
| Tecido | Coleção | tubo − 5 mm | final + 200 ou + 250 mm (pelo degrau) | `COL-` |
| Bandô | Serralheria | final − 5 mm | — | `SER-` |
| Barra niveladora | Serralheria | final − 9 mm | — | `SER-` |
| Montagem | Montagem | — | — | `MON-` (no tubo) |
| Revisão | Revisão | — | — | `REV-` (entre tubo e base) |
| Embalagem | Embalagem | — | — | `EMB-` (no plástico, por fora) |
| Kit de instalação | Embalagem | — | — | código **do kit** (§4.7) |
| Redução de peso | Montagem | — | — | — (vai na etiqueta da montagem) |

**Conferências obrigatórias (casos de teste):**

```
1,000 × 1,000  →  1,000 m²  →  TUBO 32
  tubo 0,970 · tecido 0,965 × 1,200 · base 0,970 · bandô 0,995 · barra 0,991
  redução de peso: não automática (pode pedir? não — tubo 32 não tem)

2,000 × 2,000  →  4,000 m²  →  TUBO 41   (passou dos 3,5 m² do 38)
  tubo 1,960 · tecido 1,955 × 2,250 · base 1,960
  bandô: indisponível · redução de peso: NÃO automática (≤ 2,200 e ≤ 4,5 m²)

2,400 × 2,000  →  4,800 m²  →  TUBO 41   (passou de 2,200 de largura)
  tubo 2,360 · tecido 2,355 × 2,250 · base 2,360 · barra 2,391
  bandô: indisponível · redução de peso: automática
```

**Cada linha da ficha é "referência + ajuste".** A referência é a largura final,
o tubo ou o tecido; o ajuste é em milímetros. É o que o dono descreveu
("o tecido é sempre 5 mm menor que o tubo") e é o bastante para o Rolô. Não
precisa de linguagem de fórmula na fase 1. Se um modelo futuro precisar de
multiplicador ou expressão, ela passa pelo avaliador seguro do PCP
(`formula.js`, sem `eval()`, §7-B) — nunca por uma segunda porta.

> ⚠️ **A ficha tem os DOIS números por linha, como no PCP (armadilha #18).**
> O de **corte** vai para a etiqueta. O de **consumo** (quanto a peça gasta de
> tubo, de base, de tecido) vai para Compras e para o custo. Os dois nunca
> fecham, e quem um dia "unificar" está cortando ou a peça ou o custo. Na fase
> 1 o consumo pode nascer igual ao corte; a coluna existe desde o primeiro dia.

### 4.6 Regras que mudam o que a revenda vê

| Regra | O que a tela faz |
|---|---|
| Bandô só nos tubos 32 e 38, e altura até 3,000 | Passou de 2,200 / 3,5 m² ou de 3,000 de altura → a opção de bandô **some na hora**, com a frase: *"O bandô não é possível nesta medida: o tubo enrolado não cabe dentro do bandô."* |
| Bandô já marcado e a medida mudou | **Avisa** e pede para escolher de novo. Nunca tira em silêncio |
| Bandô **e** barra | Não existe. Escolher um desmarca o outro, com aviso |
| Redução de peso automática | Acima de **4,5 m²** ou acima de **2,200** de largura. A tela diz *"incluída pela regra de garantia"* |
| Redução de peso pedida | Só em tubo 38, 41 e 56. Tubo 32 não oferece |
| Medida acima de tudo | Recusa **dizendo qual limite** estourou (coleção, modelo ou tubo 56) |

> **A frase é parte da regra.** Acessório cobrado sem explicação vira ligação da
> revenda para o vendedor. Opção que some sem motivo vira desconfiança da tela.

### 4.7 O kit de instalação

| Persiana | Kit | Suportes |
|---|---|---|
| Sem bandô e sem barra | **Kit tradicional** (o de hoje) | padrão do kit |
| Com bandô | **Kit bandô** | pela largura (abaixo) |
| Com barra niveladora | **Kit barra** | pela largura (abaixo) |

```
largura até 1,000 → 2 suportes
largura até 1,900 → 3 suportes
largura até 2,600 → 4 suportes
largura até 3,000 → 5 suportes
```

Na divisa, a medida exata fica no degrau de baixo: 1,000 → 2; 1,001 → 3.

**Cada tipo de kit tem código de barras próprio.** A embalagem bipa o kit e o
sistema **recusa o kit errado** (*"esta persiana leva KIT BANDÔ · 4 suportes"*).
Na medida padrão o QR do kit é fixo e prova só que *algum* kit entrou (§4 do
`CLAUDE.md`); aqui prova que entrou **o certo**.

### 4.8 Preço

```
m² real     = largura × altura
m² cobrado  = maior entre m² real e o mínimo faturado (1,5 m²)
tecido      = m² cobrado × preço do m² da coleção
bandô       = largura REAL × R$/m linear    (55,00)
barra       = largura REAL × R$/m linear    (17,00)
redução     = R$ 50,00 por peça (automática ou pedida — cobra nas duas)
subtotal    = soma das linhas
preço final = subtotal com a tabela da revenda (A/B/C) e o desconto dela
```

**Única regra de mínimo: 1,5 m² por persiana.** Não há largura mínima nem
arredondamento de medida. O mínimo é cadastrado por coleção/modelo.

Exemplo de teste: Screen 1% (R$ 110/m²), 0,800 × 1,200, com bandô, tabela sem
desconto:

```
0,800 × 1,200 = 0,960 m²  → cobra 1,500 m² × 110 = R$ 165,00
bandô 0,800 m × 55                              = R$  44,00
                                          total = R$ 209,00
```

> ⚠️ **O PREÇO CONGELA NO ENVIO**, linha por linha, com a tabela e o desconto
> daquele momento. Reajuste de coleção na quinta não mexe no pedido enviado na
> quarta. É a armadilha #15 (preço no cadastro anda para trás) pela porta da
> venda.

> ⚠️ **O PREÇO DA DECCORAR E O PREÇO COM MARKUP NUNCA SE MISTURAM.** O preço
> Deccorar mora no cadastro da coleção/modelo e é o único que entra em
> faturamento, Compras, crédito e relatório. O markup é da revenda, para o
> cliente dela, e não é gravado em nenhuma conta da Deccorar.

### 4.9 Prazo

```
pedido ENVIADO até quarta-feira 18:00  → pronto na quinta-feira da semana seguinte
pedido enviado depois disso            → pronto na quinta-feira da outra semana
dia da entrega cai em feriado          → próximo dia útil
```

Exemplo: hoje, terça 22/09/2026. Enviado até quarta 23/09 às 18:00 → quinta
01/10. Enviado na quarta às 18:01 → quinta 08/10.

- **Conta a hora do ENVIO pela revenda**, não a da aprovação. Aprovar é tarefa
  da Deccorar; a demora dela não passa para a revenda.
- **O prazo congela no envio**, como o preço.
- O corte (quarta, 18:00) e o dia da entrega (quinta) são **parâmetros**.
- Feriados são um **cadastro** (data e nome).

> ⚠️ **A FILA DE APROVAÇÃO TEM QUE GRITAR.** Como o prazo corre desde o envio,
> cada dia parado esperando o vendedor é um dia a menos para a fábrica. A tela
> do vendedor mostra há quanto tempo cada pedido espera e **quantos dias de
> fábrica sobraram**.

**Prazo negociado.** Só o vendedor da carteira (ou o admin) altera o prazo, e a
alteração grava: prazo antigo, prazo novo, motivo, quem e quando. A revenda vê o
prazo novo e o motivo. O gerencial mostra as duas coisas separadas — **no prazo
prometido** e **no prazo negociado** — porque somá-las faria o pedido empurrado
parecer entregue em dia.

### 4.10 Orçamento, pedido e aprovação

| Etapa | Quem | O que acontece |
|---|---|---|
| **Orçamento** | Revenda (ou a equipe, nas fases internas) | Só simula. Preço atual, sem congelar, sem prazo. Pode virar pedido depois — aí congela naquele momento |
| **Pedido enviado** | Revenda | Congela preço e prazo. Vai para a fila do vendedor da carteira |
| **Aprovado** | Vendedor da carteira (ou admin) | A ficha é explodida e congelada (§4.11), e o pedido aparece para a fábrica |
| **Depois de aprovado** | Só o admin mexe | Alteração grava antes/depois, quem e por quê |
| **Em produção** | — | **Não cancela e não altera** |

**Tecido sem estoque:** o pedido é **aceito normalmente**. O item sai marcado
"sem tecido", entra na necessidade de compra e o vendedor recebe o aviso para
negociar prazo maior com a revenda.

### 4.11 A ficha é congelada na aprovação

Na aprovação, o sistema calcula e **grava** cada componente de cada persiana:
qual tubo, qual kit, as medidas de corte, o consumo e o código de barras.

> ⚠️ **O PEDIDO NÃO RELÊ A FICHA DEPOIS.** Se alguém mudar o desconto do tubo 41
> amanhã, a persiana aprovada hoje continua sendo cortada com o desconto de
> hoje — que é o que a etiqueta dela já diz. Ficha relida ao vivo faria a
> etiqueta impressa e a tela discordarem, e na bancada vence a etiqueta.

### 4.12 Pessoas e carteiras

| Quem | O que é | Login |
|---|---|---|
| **Vendedor** | Gente da Deccorar (Renato e os próximos). Cuida de uma **carteira**: o conjunto de revendas que atende | O mesmo PIN do PCP; permissão de aprovar |
| **Revenda** | O cliente. Tem vendedor responsável, tabela, crédito, endereços | Fase 7 |
| **Dono da revenda** | Cria os usuários da loja e **decide o que cada um vê e faz**, dentro do que a Deccorar liberou para aquela revenda | Fase 7 |
| **Vendedora da loja**, **instalador** | Usuários criados pelo dono | Fase 7 |

**Cadastro da revenda:** razão social, nome fantasia, CNPJ, endereço fiscal,
**vários endereços de entrega**, contatos, vendedor responsável, tabela (A/B/C),
desconto, forma de pagamento padrão (cartão, boleto…), retira ou entrega,
limite de crédito, data da última revisão do limite, logo (para o orçamento ao
cliente final) e ativo/inativo.

**A tabela é decidida pela Deccorar.** O **markup é da revenda**: ela põe o dela
e gera, pelo sistema, o orçamento para o cliente final, **com o logo e a marca
dela, sem o nome Deccorar**.

> ⚠️ **QUEM NÃO PODE VER O PREÇO DECCORAR NÃO RECEBE O CAMPO.** O JSON sai sem
> ele — não é a tela que esconde (regra 14 do §13 do `CLAUDE.md`). Vendedora da
> loja sem essa permissão que abre o "inspecionar" do navegador não pode
> descobrir a margem da loja.

### 4.13 Crédito — mostra, não trava

```
limite disponível = limite − boletos em aberto
```

Exemplo: limite R$ 5.000 com dois boletos de R$ 2.500 em aberto → R$ 0. Com dois
de R$ 1.000 → R$ 3.000.

- **Não trava o pedido.** Estourado, o pedido entra e é aprovado normalmente; a
  tela do vendedor e o kanban mostram o limite em vermelho. Não se perde venda.
- **O financeiro dá baixa** no boleto pago.
- **Tarefa semanal** do vendedor com o financeiro: revisar os boletos em aberto
  da carteira. O sistema lista.
- **Revisão do limite a cada 2 meses** por revenda. O sistema mostra quem está
  vencido.

> ⚠️ **SEM BAIXA, O LIMITE DE TODO MUNDO ZERA.** Boleto que ninguém baixa fica
> "em aberto" para sempre. Por isso a baixa tem tela própria e a tarefa semanal
> existe — e por isso a trava de crédito **não** entra antes de a baixa estar
> sendo feita de verdade. Trava ligada sobre dado velho é a armadilha #6.

### 4.14 Etiquetas de produção

**Formato:** 100 × 35 mm, Zebra ZD220, 203 dpi, CODE128 — o mesmo do PCP. O
módulo já gera PDF nesse tamanho para as sobras (`etiqueta_pdf.js`).

**Uma etiqueta por componente**, com código **sequencial por setor**:
`SER-000001`, `COL-000001`, `MON-000001`, `REV-000001`, `EMB-000001`.

**O que toda etiqueta traz:**

| Campo | Exemplo |
|---|---|
| Pedido e peça | `5012 · 3 de 10` |
| Revenda | `LAR DO CILAR` |
| Prazo | `qui 01/10` |
| Medida acabada | `1,000 × 1,000` |
| Coleção e cor | `SCREEN 1% BRANCO` |
| Lado do comando | `COMANDO DIREITO` |
| **O que este setor faz** | `TUBO 32 · CORTAR 0,970` |
| Código de barras | `SER-000123` |

A de embalagem traz também o kit (`KIT BANDÔ · 4 suportes`). A de montagem traz
a redução de peso quando houver.

**Impressão por setor e em série.** A tela lista os pedidos aprovados; seleciono
os que quero, escolho o setor e imprimo **todas** as etiquetas daquele setor, de
todos os pedidos selecionados. Grava **quem imprimiu, quando e o quê**.

> ⚠️ **O CÓDIGO NASCE NA APROVAÇÃO, NÃO NA IMPRESSÃO.** Imprimir só marca a
> etiqueta como impressa. **Reimprimir sai com o MESMO código** e fica
> registrado como reimpressão. Código novo para a mesma peça partiria a
> história dela em duas, e o tempo do setor nunca fecharia. É a armadilha #1-B
> do PCP por outra porta.

> **A tela avisa o que já foi impresso.** Na seleção, pedido que já tem as
> etiquetas daquele setor aparece marcado. Imprimir o lote duas vezes seria o
> jeito mais fácil de ter duas etiquetas iguais em duas peças diferentes.

### 4.15 Produção bipada — a fila só mostra o que já pode ser feito

```
SERRALHERIA: tubo · base ─┐
COLEÇÃO: tecido ──────────┴─▶ MONTAGEM ─▶ REVISÃO ─▶ EMBALAGEM ─▶ PRONTO
SERRALHERIA: bandô · barra ──────────────────────────────▲
```

| Setor | Aparece na fila quando | Bipes |
|---|---|---|
| Serralheria | Pedido aprovado | início e fim, **um componente por vez** |
| Coleção | Pedido aprovado | início e fim |
| Montagem | **Tubo, base e tecido** terminados | início e fim (etiqueta no tubo) |
| Revisão | Montagem terminada | início e fim (etiqueta entre tubo e base) |
| Embalagem | Revisão terminada **e** bandô/barra terminados, se houver | início · **kit** · fim |
| Pronto | Todas as persianas do pedido embaladas | automático |

Serralheria e coleção trabalham **em paralelo**. Bandô e barra **não seguram a
montagem** — só a embalagem, porque vão juntos na caixa.

**Na embalagem**, o primeiro bipe mostra em letra grande o que a peça é
(`1,000 × 1,000 · Screen 1% Branco · Comando direito · Bandô`) para conferir
antes de fechar o plástico. Sem o bipe do kit certo, o bipe de fim é recusado
(*"⚠ FALTOU O KIT"*), como na medida padrão.

> ⚠️ **"NÃO APARECE" NÃO PODE VIRAR "NINGUÉM SABE POR QUÊ".** Se a serralheria
> esquecer de bipar o fim do tubo, a montagem fica esperando uma peça que já
> está na bancada. Bipar um código que ainda não foi liberado **responde o que
> o segura** (*"aguardando: tubo · serralheria · iniciado às 10:32 por João"*),
> e a chefia pode **fechar a pendência** com registro de quem e por quê. Uma
> trava que prende sem explicar é a que a equipe aprende a contornar (#6).

### 4.16 Recusa — o problema aponta o setor

Qualquer setor pode recusar a peça por defeito do trabalho **anterior**. Quem
recusa escolhe **só o motivo**. Cada motivo é cadastrado já dizendo para onde a
peça volta:

| Motivo (exemplo) | Volta para |
|---|---|
| Tubo maior / menor | Serralheria |
| Tecido com defeito / corte torto | Coleção |

O sistema sabe pelos bipes **quem fez** aquele componente e reabre o trabalho
dele. Os setores depois dele voltam para "aguardando" naquela persiana. A peça
refeita reimprime a **mesma** etiqueta, marcada como refeita.

> ⚠️ **Já existe `motivo_recusa` no `tecido.db`** — é o motivo de o plano de
> corte recusar uma peça. O motivo de recusa da produção é **outra tabela**,
> com outro nome. Reaproveitar a mesma misturaria "o plano não conseguiu
> cortar" com "a montagem achou o tubo maior", e os relatórios das duas
> ficariam errados.

### 4.17 Gerencial

**Kanban com colunas cadastráveis.** Dá para acrescentar e tirar colunas. Produção
é **uma coluna só** por enquanto; o cartão mostra uma barrinha por setor
(serralheria ✔ · coleção ✔ · montagem ⏳…).

> ⚠️ **AS COLUNAS SÃO LIVRES, OS MARCOS NÃO.** Por baixo das colunas existem
> marcos fixos do sistema: `orçamento`, `enviado`, `aprovado`, `em produção`,
> `pronto`, `entregue`. Cada coluna aponta para um marco. As regras
> ("começou a produzir, não cancela", "o prazo corre desde o envio") leem o
> **marco**, nunca o nome da coluna — senão renomear "Em produção" desligaria a
> trava em silêncio.

**Nota fiscal é marca à parte**, não coluna: sai às vezes antes, às vezes depois
da entrega. O kanban tem os filtros *"entregue sem NF"* e *"NF sem entrega"*.

**Retido** (tecido sem estoque, crédito estourado) é selo no cartão, não coluna.

**Indicadores:**

| Indicador | De onde vem |
|---|---|
| Tempo de aprovação por vendedor | envio → aprovação |
| Pedidos parados na aprovação | com dias de fábrica restantes |
| Prazo cumprido | prometido e negociado, separados |
| Horas-homem por peça e por pedido | soma dos tempos de todos os setores |
| Tempo médio por m² | por setor e no total |
| Produtividade por pessoa e por setor | pelos bipes |
| Recusas | por setor, por pessoa, por motivo |
| Crédito | disponível por revenda; revisões vencidas; boletos em aberto por carteira |

> ⚠️ **BIPE QUE ABRE E NÃO FECHA SAI DA MÉDIA.** Esqueceu de bipar o fim e foi
> almoçar: a peça "levou" três horas. Tempo aberto acima de um limite
> cadastrável **não entra** na produtividade e aparece como pendência para
> alguém corrigir. Média com esse ruído dentro é pior que nenhuma: confirma com
> autoridade um número falso.

### 4.18 Números de pedido não podem colidir com o Decorsoft

O plano de corte agrupa o **tom único** pelo texto do pedido e olha para trás
(`cortesAnteriores` em `plano.js`). Um pedido novo `4272` colado num `4272`
antigo do Decorsoft herdaria o histórico de tom de outra casa.

> **A numeração nova começa num número configurável acima do último pedido do
> Decorsoft.** Nunca reinicia do 1.

---

## 5. Fica de fora

- **Segurança para abrir à internet** (domínio, HTTPS, login forte para gente de
  fora) — é a **fase 8**, a última, e nenhuma revenda entra antes dela. Hoje o PCP
  roda sem HTTPS e com PIN de 4 dígitos (dívida #2); isso serve dentro da
  fábrica, não fora.
- **ERP financeiro.** O pedido fica pronto para ele (valor, revenda, forma de
  pagamento, NF, boletos), mas o ERP é outro projeto.
- **Trava de crédito.** Só mostra, por decisão do dono.
- **Produção em várias colunas** no kanban.
- **Fichas de Duplex e Motorizada.** A estrutura aceita qualquer modelo; a fase 1
  valida com o **Rolô**. Os outros são cadastro depois.
- **Migrar o histórico do Decorsoft.** Ele é substituído quando a fase 4 estiver
  de pé; o leitor do PDF (`etiqueta_corte.js`) continua funcionando até lá.
- **Medida padrão (Mercado Livre).** Nada desta spec mexe em `dados.db` além da
  leitura que Compras fizer (§6).

## 6. Dados técnicos de referência

### Relação com o que já existe

| O quê | Como esta spec usa |
|---|---|
| `linha`, `abertura` (Coleção), `cor`, `tecido` | A coleção de venda aponta para elas (§4.3) |
| `plano`, `plano_peca` | O pedido aprovado vira peças do plano, com o **número do pedido** (tom único) e a medida de **corte** em metros |
| `etiqueta_corte.js` | Continua lendo o PDF do Decorsoft até a fase 4 provar o caminho novo |
| `etiqueta_pdf.js` | Base para as etiquetas 100×35 |
| `parametro` | Corte da quarta, dia da entrega, limite de bipe aberto, número inicial dos pedidos |
| `formula.js` (PCP) | Só se um modelo futuro precisar de expressão (§4.5) |
| `PRODUCAO-MAPA-E-MOTOR.md` | Esta spec usa o mesmo vocabulário (etapa, sessão, unidade = etiqueta) para que o motor da medida padrão e o do sob medida possam virar um só depois |
| `GERADOR-ETIQUETA-KIT.md` | Os três kits do sob medida têm código próprio; o gerador de etiqueta do kit pode imprimi-los |
| Compras (`dados.db`) | Lê o **consumo** do sob medida por uma porta única (fase 4) — ver decisão pendente |

### Tabelas novas (esboço — o nome final sai na fase 1, depois de ler o código)

```
-- catálogo e ficha
modelo                (nome, ativo, largura_max_mm, m2_max_mm2, m2_min_faturado)
modelo_colecao        (modelo_id, abertura_id, preco_m2_centavos, largura_max_mm, m2_max)
modelo_cor_acessorio  (modelo_id, cor)
componente_sm         (nome, setor, gera_etiqueta, codigo_barras, preco_centavos, unidade_cobranca)
degrau_tubo           (modelo_id, ordem, componente_id, largura_max_mm, m2_max,
                       desconto_mm, acrescimo_altura_tecido_mm, aceita_bando)
ficha_linha           (modelo_id, componente_id, quando, ref_largura, ajuste_largura_mm,
                       ref_altura, ajuste_altura_mm, consumo_*, setor)
faixa_suporte         (modelo_id, kit_componente_id, largura_max_mm, quantidade)
regra_reducao_peso    (modelo_id, m2_acima, largura_acima_mm)
feriado               (data, nome)

-- clientes
revenda, revenda_endereco, revenda_contato, tabela_preco, (vendedor = usuário do PCP)

-- pedido
pedido                (numero, revenda_id, tipo, marco, enviado_em, prazo_prometido,
                       prazo_atual, aprovado_em, aprovado_por, tabela e desconto congelados,
                       total_centavos, endereco_entrega_id, retira_ou_entrega,
                       nf_emitida, nf_numero, nf_em, sem_tecido, ...)
pedido_item           (pedido_id, n, de_n, modelo, colecao, cor, tecido_id, cor_acessorio,
                       largura_mm, altura_mm, comando, rolamento, adicional,
                       reducao (auto|pedida|nao), degrau, m2_real, m2_cobrado, linhas de preço)
pedido_componente     (item_id, componente, setor, largura_corte_mm, altura_corte_mm,
                       quantidade, consumo, codigo_barras UNIQUE)   ← congelado na aprovação
pedido_prazo_alteracao(pedido_id, de, para, motivo, por, em)
pedido_marco          (pedido_id, marco, em, por)
kanban_coluna         (nome, ordem, marco)

-- produção
impressao_etiqueta    (quem, quando, setor, lista de códigos, reimpressao)
sessao_producao       (codigo_barras, setor, usuario, inicio, fim, segundos, status)
motivo_recusa_producao(nome, setor_destino, ativo)
recusa_producao       (codigo_que_recusou, motivo_id, codigo_culpado, usuario_culpado, por, em)

-- financeiro (mínimo)
titulo                (pedido_id, revenda_id, valor_centavos, vencimento, pago_em, baixa_por)
```

### Permissões novas (em `tecido/nucleo/permissoes.js`)

`catalogo.editar` · `revenda.editar` · `pedido.lancar` · `pedido.aprovar` ·
`pedido.alterar_aprovado` · `prazo.alterar` · `etiqueta_producao.imprimir` ·
`producao.serralheria` · `producao.colecao` · `producao.montagem` ·
`producao.revisao` · `producao.embalagem` · `producao.corrigir` ·
`gerencial.ver` · `financeiro.baixa` · `credito.editar`

> ⚠️ **ARMADILHA #13 — as três pontas andam juntas.** Chave em `permissoes.js`,
> setor em `acesso.js` (`setoresNativos`) e linha em `PERM_AREA`. Faltando
> qualquer uma, o acesso some em silêncio no primeiro salvamento. E chave nova
> num banco que já existe não chega a ninguém sem backfill (§5, armadilha #23).

---

## 7. Fases

Da fase 1 à 6, **tudo roda por dentro**: a equipe lança os pedidos que hoje
chegam por WhatsApp. A revenda só ganha login na fase 7, e só usa de verdade
depois da 8.

### Fase 1 — Catálogo, ficha técnica e simulador

**Entrega:**
- Cadastros: modelo, coleções de venda (apontando para o tecido), cores de
  acessório, componentes, preços (m², metro linear, peça), escada de tubos,
  linhas da ficha, faixas de suporte, regra da redução de peso, mínimo faturado.
- `tecido/dominio/ficha_sm.js` (nome a confirmar): **dono único** de "dada esta
  persiana, o que ela é". Recebe modelo, escolhas e medida; devolve degrau,
  componentes, medidas de corte, consumo, kit, preço, avisos e recusas.
- **Simulador**: tela onde se digita a persiana e aparecem tubo, cortes, kit e
  preço, com as frases de aviso.
- Cadastro inicial do Rolô com os números do §4.4 a §4.8.

**Teste:** os casos do §4.5, §4.7 e §4.8 viram teste automático, incluindo as
divisas (1,700 · 3,0 m² · 2,200 · 3,5 m² · 1,000/1,001 suportes · 4,5 m² ·
3,000 de altura do bandô · 2,800 do Screen 1%), bandô + barra recusado e
medida acima do tubo 56 recusada.

**Pronto quando:** o dono simula dez persianas reais do WhatsApp e o simulador
bate com o que a fábrica cortaria.

### Fase 2 — Revendas, vendedores e calendário

**Entrega:** cadastro completo da revenda (§4.12), carteira por vendedor,
tabelas A/B/C e desconto, feriados, parâmetros de prazo.

**Pronto quando:** as revendas ativas de hoje estão cadastradas, cada uma com
vendedor.

### Fase 3 — Pedido interno

**Entrega:** a equipe lança orçamento e pedido em nome da revenda. Preço e prazo
congelam no envio. Fila de aprovação do vendedor (com dias de fábrica restantes).
Aprovação explode e congela a ficha (§4.11). PDF do pedido para a revenda
conferir. Alteração pelo admin com registro. Prazo negociado com registro.
Numeração acima do Decorsoft.

**Pronto quando:** uma semana de pedidos do WhatsApp foi lançada aqui, em
paralelo ao Decorsoft, sem diferença de preço nem de corte.

### Fase 4 — Pedido vai para a fábrica

**Entrega:** tela de impressão por setor em série, com registro de quem imprimiu
e marca de já impresso; reimpressão com o mesmo código. Peças do pedido entram no
plano de corte do tecido (medida de corte, número do pedido). Consumo de
material disponível para Compras por porta única. Item sem tecido aparece em
Compras e avisa o vendedor.

**Pronto quando:** a serralheria e a coleção trabalham uma semana só com as
etiquetas novas, e o Decorsoft deixa de ser usado.

### Fase 5 — Produção bipada

**Entrega:** filas por setor com as liberações do §4.15, bipe de início e fim,
bipe do kit certo na embalagem, recusa com motivo → setor → pessoa (§4.16),
"o que está segurando", fechamento de pendência pela chefia, Pronto automático.

**Pronto quando:** um pedido inteiro passa pelos cinco setores só com bipe, e uma
recusa de teste volta para a pessoa certa.

### Fase 6 — Gerencial

**Entrega:** kanban com colunas cadastráveis sobre marcos, selo de NF e de retido,
todos os indicadores do §4.17, baixa de boletos pelo financeiro, crédito
disponível, tarefa semanal e revisão bimestral do limite.

**Pronto quando:** o dono responde, pela tela, "onde está o pedido X",
"quanto o Renato leva para aprovar" e "quanto tempo leva uma persiana por m²".

### Fase 7 — Portal da revenda (ainda por dentro)

**Entrega:** login da revenda, dono cria usuários e marca permissões, markup,
orçamento ao cliente final com o logo da revenda, acompanhamento de status.
Testado com uma revenda de confiança **dentro da rede da fábrica**.

### Fase 8 — Segurança e abertura

**Entrega:** domínio, HTTPS e o login de gente de fora resolvido (§8). Só então
as revendas recebem acesso.

---

## 8. O que ainda precisa ser decidido

| Antes da fase | Pergunta | Proposta desta spec |
|---|---|---|
| ~~1~~ | ~~Tabela A/B/C é um **percentual** sobre o preço da coleção, ou um **preço por coleção** em cada tabela?~~ | **RESPONDIDA em 22/09/2026: percentual por tabela**, em inteiro, mais o desconto da revenda. Ver o STATUS da fase 1 |
| ~~1~~ | ~~O modelo aponta para a `linha` do tecido, ou aceita coleções de mais de uma linha?~~ | **RESPONDIDA em 22/09/2026: o modelo NÃO guarda linha** — aponta para uma lista de coleções, e cada uma já carrega a sua. Ver o STATUS da fase 1 |
| 3 | A revenda pode editar ou cancelar um pedido **enviado e ainda não aprovado**? Editar recalcula o prazo? | Pode; editar devolve para rascunho e o reenvio recalcula prazo e preço |
| 3 | O admin altera um pedido aprovado até quando? | Até a primeira etiqueta impressa; depois, só cancelando o item com registro e lançando outro |
| 3 | Feriado **no meio** da semana de produção também empurra o prazo, ou só o feriado no dia da entrega? | Só o dia da entrega (foi o exemplo do dono) |
| ~~4~~ | ~~Como Compras (`dados.db`) lê o consumo do sob medida (`tecido.db`)?~~ | **RESPONDIDA em 24/09/2026, e em duas metades.** O **tecido** não vai para o Compras do PCP: o estoque dele mora no `tecido.db` e já tem painel — `dominio/consumo.js` é o dono único do comprometido, e ele aparece no painel do próprio sob medida (fase 4-B). O **tubo é o mesmo material** da medida padrão e **Compras é um só** (decisão do dono): ele entra por uma função única do sob medida, depois do vínculo `sm_componente` → `componente` do PCP — que não existe e é a fase 4-C |
| 4 | As etiquetas de coleção saem na ordem do **pedido** ou na ordem do **plano de corte** (por bobina)? | Na ordem do plano, quando existir um plano confirmado |
| 5 | Uma pessoa pode ter **mais de um bipe aberto** ao mesmo tempo (a serralheria corta em lote)? | Uma sessão por pessoa, como no motor; se a serralheria precisar de lote, o tempo do lote é repartido entre as peças — nunca somado em dobro |
| 6 | O crédito disponível desconta só os boletos em aberto, ou também os pedidos aprovados ainda não faturados? | Os dois, mostrados separados |
| 8 | Como é o login de quem é de fora (senha, e-mail, recuperação)? | PIN de 4 dígitos não serve para a internet; desenhar na fase 8 |

## 9. Regras que não podem ser quebradas

- ❌ Guardar medida em metro `REAL` ou dinheiro em reais `REAL` — é milímetro e centavo inteiros
- ❌ Mostrar medida com menos de três casas na etiqueta
- ❌ Mandar a medida **acabada** ao plano de corte, ou para a serralheria
- ❌ Duplicar o cadastro de coleção/cor/tecido para a venda (§4.3)
- ❌ Escolher o tubo por outro caminho que não a escada (§4.4)
- ❌ Somar o consumo com o corte, ou usar um no lugar do outro (armadilha #18)
- ❌ Reler a ficha num pedido já aprovado (§4.11)
- ❌ Recalcular preço ou prazo de pedido enviado porque o cadastro mudou
- ❌ Contar o prazo pela aprovação em vez do envio
- ❌ Misturar o preço com markup em qualquer número da Deccorar
- ❌ Mandar pelo JSON um preço que o usuário não pode ver
- ❌ Tirar o bandô, pôr a redução de peso ou recusar a medida **sem dizer por quê**
- ❌ Permitir bandô e barra na mesma persiana
- ❌ Gerar código novo numa reimpressão
- ❌ Ler o nome da coluna do kanban para decidir regra — é o marco
- ❌ Reaproveitar `motivo_recusa` do plano de corte para a recusa da produção
- ❌ Contar bipe aberto além do limite na produtividade
- ❌ Reiniciar a numeração de pedidos abaixo do último Decorsoft
- ❌ Ligar trava de crédito sem a baixa de boletos acontecendo de verdade
- ❌ Dar login a revenda antes da fase 8

## 10. Decisões (para `docs/DECISOES.md`)

| Data | O que mudou | Por quê | Decidido por | Onde está |
|---|---|---|---|---|
| 22/09/2026 | Pedido sob medida passa a ser lançado no sistema (primeiro pela equipe, depois pela revenda), com aprovação do vendedor da carteira | O pedido por WhatsApp trava em perguntas e depende de quem digita | Lucas | esta spec §4.10 |
| 22/09/2026 | Tubo escolhido por escada (32/38/41/56) por largura **e** m², com desconto de corte por degrau | Regra técnica sai da cabeça de quem digita e fica editável | Lucas | §4.4 |
| 22/09/2026 | Preço = m² × coleção, mínimo faturado de 1,5 m², bandô/barra por metro linear real, redução de peso cobrada inclusive quando automática; congela no envio | Regra comercial única, e preço que não anda para trás | Lucas | §4.8 |
| 22/09/2026 | Prazo: envio até quarta 18h → quinta da semana seguinte; conta o envio, não a aprovação; feriado empurra | Prazo previsível para a revenda | Lucas | §4.9 |
| 22/09/2026 | Crédito só é mostrado, não trava; baixa pelo financeiro; revisão do limite a cada 2 meses | Não perder venda | Lucas | §4.13 |
| 22/09/2026 | Uma etiqueta por componente, código sequencial por setor, bipe de início e fim, recusa aponta o setor culpado | Rastreabilidade e produtividade por peça | Lucas | §4.14 a §4.16 |
| 22/09/2026 | Medidas em milímetro por dentro, metro com três casas na tela e na etiqueta | A serralheria corta em milímetro; número sem ambiguidade | Lucas | §4.1 |
