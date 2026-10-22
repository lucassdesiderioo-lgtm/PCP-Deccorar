# Regras — coleta, carregamento e saída da fábrica

> Cada cartão é **uma regra que vale hoje**, com o motivo, as exceções e o teste
> que impede alguém de desfazê-la. O porquê longo está em
> [`docs/historia/carregamento.md`](../historia/carregamento.md), procurando
> pelo número da armadilha ou pelo nome da fase.
>
> **⚠ sem teste** quer dizer que nada no código impede alguém de desfazer a
> regra sem perceber.
>
> Formato: [`README.md`](README.md). O caminho do PDF até a etiqueta de venda:
> [`expedicao.md`](expedicao.md). Estoque: [`estoque.md`](estoque.md).

---

## As duas portas de saída

```
                      ┌─ AGÊNCIA: bipe da ÁREA (confere) → bipe da VIAGEM (carro) → foto do balcão
Etiqueta de Venda ────┤
 (bipe 1: impresso_por)└─ COLETA: bipe do CANTO (confere)  → Saída do caminhão → foto do motorista

        bipe 2 (conferido_por) — e quem imprimiu NÃO confere
```

| | **Agência** | **Coleta** |
|---|---|---|
| Quem leva | a gente, no carro, até a agência | o caminhão do ML, na fábrica |
| Onde a caixa espera | na área, e depois no carro | no **canto** reservado |
| Prazo | hora de despacho do `config` | só o dia — o caminhão não tem hora |
| `lote.modalidade` | `'agencia'` (ou `NULL`) | `'coleta'` |

---

## A modalidade: o que a etiqueta disse

### R-MOD-01 · A modalidade se lê pela linha "Despachar", contra dois formatos exatos
- **Regra:** `parse.js → modalidadeDespacho()` compara a caixa "Despachar" com o formato da agência (`qua 9/set, antes das 15:45 h`) e o da coleta (`quinta 10/set`, sem hora). Qualquer outra coisa é `desconhecida`; etiqueta sem a linha é `null`. Os dois **retêm o volume** no upload, com `bloqueio='modalidade: <texto cru>'`. A hora quebrada para a linha de baixo é emendada antes de conferir.
- **Por quê:** os dois PDFs são idênticos em tudo, e a coleta se reconhece **por ausência** (a hora que falta). Um "quase igual" que passasse como coleta mandaria para o canto, em silêncio, uma caixa que era do carro.
- **Exceções:** se o ML mudar a etiqueta de vez, o conserto é no `modalidadeDespacho()`, com o PDF novo na mão.
- **Teste que trava:** `teste_parse.js` (caso 15: os formatos exatos e quatro variações que caem em `desconhecida`).
- **Status:** no ar desde 10/09/2026.
- **História:** armadilha #21.

### R-MOD-02 · Formato desconhecido vai para Bloqueados, e uma pessoa decide
- **Regra:** o volume retido por modalidade aparece em Admin → Bloqueados, num card violeta, e alguém com acesso de admin escolhe **Agência** ou **Coleta** (`POST /api/modalidade/resolver`), por volume ou pelo lote inteiro. A decisão grava `modalidade`, o motivo em `bloqueio_resolvido` com quem e quando, e vai para a auditoria. Cadastrar SKU **não** solta volume retido por modalidade, e a decisão **não** passa por cima da trava de SKU (§6).
- **Por quê:** regra do dono (09/09/2026): *qualquer modificação na etiqueta vai para Bloqueados*. O sistema não adivinha por onde a caixa sai, e cadastro de SKU não responde isso.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_divergencia.js` (os dois últimos casos).
- **Status:** no ar desde 10/09/2026.
- **História:** armadilha #21.

### R-MOD-03 · `carga.js` é o dono único de "isto é coleta?", e sem dado é agência
- **Regra:** `COLETA`, `AGENCIA`, `ehColeta` e `AGUARDA_CAMINHAO` moram no `carga.js`. O upload, a lista "Faltam imprimir", o bipe do SKU, os impressos, o relógio de despacho e as listas do carregamento leem dali. `modalidade = NULL` é **agência**.
- **Por quê:** duas réguas mandariam a mesma caixa para o carro numa tela e para o canto na outra. `NULL` só existe em volume anterior à coluna, e o que sempre existiu é a agência.
- **Exceções:** volume antigo ainda na fábrica se acerta com `node backfill_modalidade.js` (simula) e `--aplicar`; ele só mexe em quem está `NULL`.
- **Teste que trava:** `teste_carga.js`.
- **Status:** no ar desde 10/09/2026.

### R-MOD-04 · Por onde a caixa SAIU (`saiu_por`) não reescreve o que a etiqueta disse (`modalidade`)
- **Regra:** `lote.modalidade` é da etiqueta (ou da decisão da R-MOD-02); `lote.saiu_por` é a porta pela qual a caixa saiu de verdade. Uma nunca escreve na outra — nem quando o caminhão leva caixa da agência, nem quando a caixa de coleta vai pelo carro.
- **Por quê:** as duas coisas são verdade ao mesmo tempo. O motorista levar caixa da agência é bom (decisão 6 da spec), e não muda o que a etiqueta disse.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_saida_coleta.js` (a troca de porta pelo caminhão) · `teste_saida_agencia.js` (a coleta pelo carro).
- **Status:** no ar desde 26/09/2026.

---

## A coleta na Etiqueta de Venda e no Carregamento

### R-COL-01 · "Faltam imprimir" são duas listas, e o filtro decide o que o bipe pega
- **Regra:** `GET /api/pendentes` devolve **uma linha por SKU e por modalidade**, e a tela mostra Agência e Coleta lado a lado. O filtro **Todas / Agência / Coleta** fica salvo por aparelho (`localStorage.etq_modo`). Em "Todas" o bipe pega a venda mais urgente do SKU; num filtro ele **só** pega vendas daquela lista (`/api/proximo/:sku?modo=`), e quando o SKU só tem venda na outra lista a resposta traz `na_outra_lista` e a tela diz isso. O bipe da coleta mostra a tarja violeta **antes** de imprimir.
- **Por quê:** é quem cola a etiqueta que decide onde a caixa para. "SKU não está no lote" para uma venda que está na outra lista seria mentira.
- **Exceções:** nenhuma. A etiqueta sai igual e o estoque baixa igual (−1).
- **Teste que trava:** `teste_etiqueta.js`.
- **Status:** no ar desde 10/09/2026.

### R-COL-02 · O relógio de despacho é só da agência
- **Regra:** `/api/expedicao/status` conta em `pendentes` só a agência, e devolve a coleta em `pendentes_coleta`.
- **Por quê:** contar a coleta deixaria a tela vermelha por caixa que não vai no carro.
- **Exceções:** nenhuma.
- **Teste que trava:** ⚠ **sem teste**.
- **Status:** no ar desde 10/09/2026.

### R-COL-03 · A caixa de coleta não entra no carro, nem na lista nem no contador
- **Regra:** a coleta não aparece em "Faltam carregar no carro" e não conta no "No carro X de Y". Ela tem card próprio (violeta), ao lado do carro, sempre visível; abaixo de 900 px empilha, carro primeiro. O bipe pro canto é o mesmo `POST /api/carregar`, que responde `coleta:true` e "Está indo N peças".
- **Por quê:** são dois lugares físicos. `carregado_em` na coleta é a hora em que a caixa foi pro canto; a hora em que o caminhão levou é `retirado_em`.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_carga.js`.
- **Status:** no ar desde 10/09/2026.

### R-COL-04 · O caminhão leva antes da data, e o canto cheio de caixa futura é normal
- **Regra:** `AGUARDA_CAMINHAO` **não filtra pela data de despacho**: a caixa de coleta impressa e bipada pro canto vai no próximo caminhão, mesmo com despacho semanas à frente. Por isso ela sai da faixa azul do Carregamento (que só conta o `embalado` futuro na prateleira) e o painel "Pra despachar depois" (que só lista o `pendente`) some quando as etiquetas futuras já foram impressas.
- **Por quê:** dono, 25/09/2026: a equipe imprime e bipa a coleta adiantada, e o motorista leva todas. Filtrar por vencimento faria toda saída divergir.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_saida_coleta.js` (a caixa futura no canto entra na conta do caminhão).
- **Status:** no ar.

---

## Quem fez: a dupla conferência

### R-QUEM-01 · `impresso_por` é a PRIMEIRA impressão, e a reimpressão não o toca
- **Regra:** o `POST /api/embalar` grava quem imprimiu (o bipe 1). O `POST /api/reimprimir` não mexe no campo. Sem ninguém logado, ele fica **vazio**.
- **Por quê:** papel repetido não é outra contagem (armadilha #1-B pela porta do nome). Se a reimpressão sobrescrevesse, a caixa diria que foi impressa por quem só destravou a impressora.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_saida.js`.
- **Status:** no ar desde 26/09/2026.

### R-QUEM-02 · O bipe do Carregamento grava quem conferiu
- **Regra:** o bipe da área (agência) e o do canto (coleta) gravam `conferido_por` e `conferido_em` — o bipe 2.
- **Por quê:** é a segunda contagem da dupla conferência.
- **Exceções:** a caixa que foi no caminhão sem ninguém bipar fica sem conferência (R-SAI-05).
- **Teste que trava:** `teste_saida.js`.
- **Status:** no ar desde 26/09/2026.

### R-PIL-01 · A conferência da pilha fecha caixa a caixa: impressas = conferidas + faltam
- **Regra:** o card "Conferência da pilha" conta as etiquetas **impressas hoje** (`embalado_em`), as conferidas e as que faltam, e o que falta tem nome. Conferida é a que tem `conferido_em` **ou** está `carregado`. `carga.js → pilhaDaArea(db)` é o dono único; o `GET /api/carregamento` a devolve em `pilha`.
- **Por quê:** a conta só serve se fechar; o `carregado` cobre o que foi bipado antes de os nomes existirem.
- **Exceções:** R-PIL-02 e R-PIL-03.
- **Teste que trava:** `teste_area.js`.
- **Status:** no ar desde 26/09/2026.

### R-PIL-02 · A caixa impressa ontem e não conferida não some, e não entra na conta de hoje
- **Regra:** ela sai numa linha âmbar própria, em cima do card.
- **Por quê:** volume com etiqueta está na fábrica, e não existe hora em que ele deixe de estar (armadilha #9 pela porta da conferência). Somado à conta de hoje, o número nunca fecharia.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_area.js`.
- **Status:** no ar desde 26/09/2026.

### R-PIL-03 · A adiantada entra na pilha, marcada; pendente e bloqueado não entram
- **Regra:** a caixa impressa com despacho futuro é contada, com a tarja `adiantada · despacha dd/mm`. `pendente` e `bloqueado` não têm etiqueta, e o bipe continua recusando o `pendente` (R-CAR-02).
- **Por quê:** ela foi impressa e tem que ser contada (decisão 4 da spec); a tarja diz que não é carga de hoje.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_area.js`.
- **Status:** no ar desde 26/09/2026.

### R-PIL-04 · Na pilha, "sem registro", "mesma pessoa" e "sem conferência" são três coisas
- **Regra:** faltando qualquer um dos dois nomes, a caixa é **"sem registro"**, nunca "mesma pessoa" — vazio igual a vazio é não saber quem fez. A caixa `carregado` **numa saída** e sem `conferido_em` foi no caminhão sem ninguém conferir, e sai numa linha própria. "Sem segunda pessoa" ficou só como história da caixa conferida pelo mesmo login antes de 01/10/2026.
- **Por quê:** só a linha "sem conferência" interessa olhar; misturar com "sem registro" a esconderia.
- **Exceções:** a caixa `carregado` **sem** saída e sem conferência (anterior aos nomes) continua "sem registro".
- **Teste que trava:** `teste_area.js` · `teste_saida_coleta.js`.
- **Status:** no ar desde 02/10/2026.

### R-PIL-05 · As listas da pilha nascem recolhidas
- **Regra:** o número fica sempre à vista; a lista abre com um toque e continua aberta nos refreshes de 4 s (o `<details>` não é redesenhado).
- **Por quê:** aberta, a pilha repete as listas do carro e da coleta logo abaixo — o que o dono leu como "duas vendas" na caixa de várias.
- **Exceções:** nenhuma.
- **Teste que trava:** ⚠ **sem teste**.
- **Status:** no ar desde 26/09/2026.

### R-SEG-01 · Quem imprimiu não confere
- **Regra:** o bipe da **área** (agência) e o do **canto** (coleta) recusam quando o login é o mesmo do `impresso_por`: *"OUTRA PESSOA TEM QUE CONFERIR"*, com o nome de quem imprimiu e o botão **Trocar de pessoa** (`/login?r=/carregamento`). A recusa vai para a auditoria. A régua é `carga.js → mesmaPessoa`: ignora espaço e maiúscula, e **vazio nunca é igual a vazio** — caixa sem `impresso_por`, ou bipe sem login, passa.
- **Por quê:** a bancada imprime e não repara que a venda leva mais de uma persiana; com a mesma pessoa conferindo, a mesma atenção conferia. O Carregamento é a última vez que alguém está com a caixa na mão.
- **Exceções:** o bipe da viagem (pôr no carro) e as sobras do caminhão não travam: ali a caixa já foi conferida por outra pessoa.
- **Teste que trava:** `teste_segunda_pessoa.js` (área, canto, nome, auditoria e vazio). ⚠ A exceção da viagem e das sobras **não tem teste**.
- **Status:** no ar desde 01/10/2026 (PR #164) · conferida na fábrica em 05/10/2026 a metade em que outra pessoa confere · a recusa de verdade ainda não foi relatada.
- **História:** fase 1 da spec `CARREGAMENTO-SEGUNDA-PESSOA`.

### R-SEG-02 · Não há liberação para quem imprimiu conferir, nem para o Admin Geral
- **Regra:** não existe rota nem botão que libere. Num dia em que só uma pessoa trabalha na expedição, as caixas que ela imprimiu esperam outra pessoa.
- **Por quê:** decisão do dono (01/10/2026): porta de liberar vira rotina, e aí a regra deixa de existir.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_segunda_pessoa.js` (a rota de liberação não existe).
- **Status:** no ar desde 01/10/2026.

### R-SEG-03 · O nome de quem imprimiu aparece, em linha própria
- **Regra:** o nome do login de quem imprimiu sai na recusa, no bipe aceito (*"Etiqueta feita por Ana Paula"*) e em cada linha da pilha. O "Etiqueta feita por" tem linha própria (não `inline-block`).
- **Por quê:** pedido do dono. Grudado no número de antes, ele se lia *"prontas pro carro 1Etiqueta feita por…"*.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_segunda_pessoa.js` (o último caso lê o CSS da `.quem`).
- **Status:** no ar e conferida pelo dono em 05/10/2026 (PR #190).

---

## A caixa de várias persianas no Carregamento

### R-PEC-01 · A caixa de várias se confere peça a peça
- **Regra:** o bipe da etiqueta de venda abre a tela âmbar *"ESTA CAIXA LEVA N PERSIANAS · 0 de N"*; cada etiqueta de SKU colada por fora é bipada (`POST /api/carregar/peca`, `{lote_id, sku}`) e conta em `lote_item.conferidos_carga`. Bateu tudo, ela é conferida (agência) ou vai pro canto (coleta). SKU que não está na caixa, ou um a mais, **para** e vai para a auditoria. Conta-se **persiana**, nunca linha: a de 1 SKU × 2 é caixa de várias. A régua é o `VARIAS()` do `carga.js`.
- **Por quê:** a bancada imprime sem reparar que a venda leva mais de uma; a última chance de achar a peça que faltou é com a caixa na mão.
- **Exceções:** a caixa de uma persiana não mudou. A caixa de várias **substitui** o segundo bipe cego do `conf_carregamento` (R-CAR-03), que compara com um SKU só.
- **Teste que trava:** `teste_pecas_carga.js` (37) · `teste_carga.js` (o cenário do adiantado confere peça a peça).
- **Status:** no ar desde 02/10/2026 (PR #183) · conferida na fábrica em 05/10/2026 · a divergência ainda não apareceu num caso real.
- **História:** fase 2 da spec `CARREGAMENTO-SEGUNDA-PESSOA`.

### R-PEC-02 · A lista do que vai na caixa APARECE
- **Regra:** a resposta do bipe (`conferir_pecas`, o bipe de peça, o "Recomeçar" e a divergência) traz `pecas`: cada SKU, o que ele é, a quantidade e quantas já foram bipadas, e a tela âmbar marca ✓ linha a linha. As listas do Carregamento (faltam no carro, coleta, canto, pilha, saída do caminhão e viagem) trazem `itens`, e a linha da caixa de várias mostra os SKUs no lugar do `lote.codigo` solto. A régua é a mesma da Etiqueta de Venda (`pecas_caixa.js`; na tela, `skuDaLinha` / `pecasLinhas`).
- **Por quê:** decisão do dono (05/10/2026): quem confere precisa saber o que procurar nas etiquetas coladas por fora. Sozinho, o `lote.codigo` é o PRIMEIRO item e fazia dois SKUs parecerem um. A trava continua no bipe de cada peça.
- **Exceções:** nenhuma. De 02 a 05/10/2026 a conferência foi cega.
- **Teste que trava:** `teste_pecas_carga.js` · `teste_carga.js` (os 9 últimos casos).
- **Status:** no ar desde 05/10/2026 (PR #189) · conferida pelo dono no mesmo dia.

### R-PEC-03 · O bipe de peça tem as mesmas barreiras do bipe da caixa
- **Regra:** cancelada, retida, já saída, sem etiqueta, já conferida e **quem imprimiu** não andam nem peça a peça (`barrar()` no `carreg_route.js`).
- **Por quê:** sem isso o bipe de peça seria a porta dos fundos de todas as outras regras.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_pecas_carga.js`.
- **Status:** no ar desde 02/10/2026.

### R-PEC-04 · O leitor repetido não vira persiana a mais, e a divergência não apaga o que foi bipado
- **Regra:** a tela tem o guard de 700 ms (o leitor repete o código numa leitura só). A divergência **não** zera a contagem; quem zera é **"Recomeçar esta caixa"** (`POST /api/carregar/recomecar`). **"Deixar esta caixa"** larga a caixa sem apagar: voltar a ela continua de onde parou.
- **Por quê:** a mesma razão da Etiqueta de Venda (R-VOL-05): com o bipe por peça, a repetição do leitor conta uma persiana que não existe.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_pecas_carga.js` (inclusive o guard de 700 ms na tela).
- **Status:** no ar desde 02/10/2026.

### R-PEC-05 · As etiquetas coladas por fora são as do saco de cada persiana
- **Regra:** a frase da caixa (`fita(n)`) diz, na impressão: *"Tire a etiqueta de SKU do saco de cada persiana e cole por fora da caixa."* É a mesma função nos quatro lugares.
- **Por quê:** cópia da etiqueta não prova que a persiana entrou na caixa (P6 da spec).
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_pecas_carga.js`.
- **Status:** no ar desde 02/10/2026 · ainda não foi relatado se na fábrica são as do saco.

---

## O motorista recusou

### R-REC-01 · A caixa recusada volta ao estoque em dois passos, e a marcação não mexe no saldo
- **Regra:** a expedição marca pelo Carregamento (**🚫 Motorista recusou** → bipe → confere cliente, NF e peças → confirma; `POST /api/carregamento/recusa`, com `carregamento.executar`). A caixa vira `cancelado`, com `cancelada_origem='motorista'` e `cancelada_por`, e sai do canto, do carro e da saída. O aviso manda tirar a etiqueta e pôr a persiana na prateleira. **O saldo só volta** quando o admin diz "A persiana voltou" na Mesa de correções (R-COR-03). Sem `confirmar`, a rota só mostra a caixa. `cancelada_dominio.recusar` é a régua, a mesma do cancelamento pelo relatório. Desde 22/10/2026 (CONFERENCIA-E-BAIXA, fase 2-A) o "voltou" só devolve saldo se a caixa **já tinha baixado** (conferida); a recusada antes da conferência solta a reserva sozinha.
- **Por quê:** o motorista recusa no bipe dele antes de o relatório do ML chegar. E quem diz que a persiana está na prateleira é uma pessoa, com motivo (D3).
- **Exceções:** o relatório que chegar depois acha a venda já marcada (`ja_marcada`) e não mexe na origem. O bipe normal do Carregamento continua recusando a caixa, com o título **RECUSADA PELO MOTORISTA**.
- **Teste que trava:** `teste_recusa_motorista.js` (59).
- **Status:** no ar desde 02/10/2026 · ainda não conferida na fábrica.
- **História:** spec `RECUSA-DO-MOTORISTA`.

### R-REC-02 · Só se marca a caixa com etiqueta e ainda na fábrica
- **Regra:** área, canto ou carro de viagem aberta. Cada recusa diz o porquê: sem etiqueta (nada baixou), já saiu (é devolução, §9), já cancelada (está no card).
- **Por quê:** fora disso não há o que voltar à prateleira.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_recusa_motorista.js`.
- **Status:** no ar desde 02/10/2026.

### R-REC-03 · A caixa de várias é recusada inteira, e o sob medida não manda pôr na prateleira
- **Regra:** a caixa de várias vira `cancelado` com `cancelada_varias=0`, e a Mesa oferece o "voltou" por peça. A de sob medida é marcada, mas o aviso **não** manda pôr na prateleira.
- **Por quê:** aqui o motorista recusou a caixa toda — diferente do relatório, em que o ML cancela UM item e não diz qual peça é. O sob medida não tem estoque (§7).
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_recusa_motorista.js`.
- **Status:** no ar desde 02/10/2026.

---

## A saída do caminhão (coleta)

### R-SAI-01 · Uma saída por caminhão, e ela só olha o que saiu nela
- **Regra:** no card da coleta, **🚚 Saída do caminhão** abre uma saída (`saida_route.js`), guardada no banco — uma aberta por vez, e o tablet que recarrega a reencontra. A conta é `saíram = no canto sem saída − sobras + "foi no caminhão"`. **Bateu:** cada caixa grava `saida_id`, `saiu_em`, `saiu_por='coleta'` e `retirado_em`. **Não bateu:** nada anda, e a tela mostra as caixas da saída e as impressas fora da conta. **Cancelar** apaga a saída aberta e não mexe em caixa nenhuma. A régua é do `carga.js` (`NA_SAIDA`, `PODE_TER_IDO`, `acharVolumes`).
- **Por quê:** o "Fechar coleta" de 10/09 comparava o canto INTEIRO com o motorista: um dia sem fechar estragava todos os seguintes, a equipe não aderiu e 399 caixas acumularam.
- **Exceções:** a caixa esquecida no canto de um dia anterior entra na conta seguinte, com a tarja `⏳ bipada dd/mm`; se ela foi num caminhão não registrado, a conta não bate e o caminho é liberar com motivo (R-SAI-06).
- **Teste que trava:** `teste_saida_coleta.js` (57).
- **Status:** no ar desde 26/09/2026 (PR #140) · o primeiro caminhão de verdade ainda não saiu por ela.
- **História:** fase 3 da spec `SAIDA-E-DUPLA-CONFERENCIA`.

### R-SAI-02 · As sobras são declaradas, nunca supostas
- **Regra:** fechar exige ou bipar o que ficou no canto, ou tocar **"Não ficou nada"**. O silêncio é recusado.
- **Por quê:** se valesse, quem pula o passo diria "saiu tudo" sem saber, e a divergência de verdade viraria ruído.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_saida_coleta.js`.
- **Status:** no ar desde 26/09/2026.

### R-SAI-03 · A conta do caminhão só olha o canto da coleta
- **Regra:** a agência conferida na área fica **fora** da conta, e a que está no carro também.
- **Por quê:** decisão do dono (D2, 26/09/2026): somada, obrigaria a bipar como "sobra" cada caixa de agência parada na área, às vezes 40, a cada caminhão. E o caminhão não leva o que está dentro do carro.
- **Exceções:** a caixa de agência que o motorista levou entra pelo botão da R-SAI-04.
- **Teste que trava:** `teste_saida_coleta.js`.
- **Status:** no ar desde 26/09/2026.

### R-SAI-04 · O bipe da saída só diz SOBROU; a troca de porta é por botão
- **Regra:** a caixa impressa fora da conta que o motorista levou entra pelo botão **"foi no caminhão"** da lista de divergência: de agência na área (conferida ou não) e de coleta que foi direto da impressora — toda `embalado`. Ela sai com `saiu_por='coleta'` e vira `carregado`, e a `modalidade` não muda (R-MOD-04). Desde 22/10/2026 (CONFERENCIA-E-BAIXA, fase 2-A) a caixa que sai assim **baixa do estoque no fechamento** — a baixa é na conferência, e ninguém a conferiu —, e a conferência dela **continua vazia** (R-PIL-04).
- **Por quê:** o mesmo bipe querendo dizer duas coisas conforme o estado da caixa é como se erra de luva na mão.
- **Exceções:** a caixa que está no carro não entra. `pendente` nunca entra: sem etiqueta, não baixou do estoque (R-CAR-02).
- **Teste que trava:** `teste_saida_coleta.js`.
- **Status:** no ar desde 26/09/2026.

### R-SAI-05 · Quem fechou a saída não conferiu a caixa
- **Regra:** a caixa que ninguém tinha conferido sai com `conferido_por` e `conferido_em` **vazios**. A agência já conferida na área mantém quem a conferiu.
- **Por quê:** até 02/10/2026 ela saía com o nome de quem fechou a saída, uma pessoa que nunca a bipou.
- **Exceções:** as que saíram antes de 02/10/2026 ficam com o nome de quem fechou; o histórico não foi reescrito. Anotado e não consertado: ela ainda conta em "conferidas" na pilha (R-PIL-01 conta `carregado`).
- **Teste que trava:** `teste_saida_coleta.js` · `teste_area.js`.
- **Status:** no ar desde 02/10/2026.

### R-SAI-06 · Sem a foto não fecha; com divergência, só com permissão e motivo
- **Regra:** fechar exige a foto da tela do celular do motorista e o número dele. A foto é do `foto.js`: só `data:image/*` com conteúdo, gravada **dentro** da transação, numa pasta fora de `lotes/` (o cron não a apaga), e volta por `GET /api/coleta/foto/:id`. **Liberar com divergência** é outra rota, com a chave `saida.liberar` e motivo obrigatório; grava quem liberou e vai para a auditoria.
- **Por quê:** regra do dono (09/09/2026): *não adianta o motorista falar a quantidade, tem que ter prova*. O caminhão não pode ficar preso, mas a divergência é a única chance de achar a caixa.
- **Exceções:** `saida.liberar` é nível `supervisor`, sensível, nos setores `Supervisor` e `Admin` (backfill de uma vez, `config.seed_saida_liberar`). O Admin Geral passa por nível.
- **Teste que trava:** `teste_saida_coleta.js` · `teste_acesso.js` (seção 6-E) · `teste_cobertura.js`.
- **Status:** no ar desde 26/09/2026.

### R-SAI-07 · A caixa de agência que o caminhão levou não conta no "No carro"
- **Regra:** o contador do carro ignora quem saiu com `saiu_por='coleta'`.
- **Por quê:** a troca de porta inflava o contador, e o carro fecharia com uma caixa a menos dentro.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_saida_coleta.js`.
- **Status:** no ar desde 26/09/2026.

### R-SAI-08 · O "Fechar coleta" antigo está aposentado
- **Regra:** `POST /api/coleta/fechar` só recusa (`motivo:'aposentado'`), dizendo onde é agora. Os fechamentos antigos (`coleta_fechamento`) continuam na tela como história, com a foto.
- **Por quê:** ver R-SAI-01.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_carga.js`.
- **Status:** aposentado em 26/09/2026.

---

## A viagem à agência

### R-VIA-01 · A caixa de agência tem dois bipes: a área confere, a viagem põe no carro
- **Regra:** o bipe normal do Carregamento **só confere** (a caixa fica na área, "✓ na área"). Com **🚗 Viagem à agência** aberta, o bipe põe **no carro**, e só aceita caixa conferida; a recusa diz o que fazer (*"Toque em 'Conferir na área', bipe ela, e depois ponha no carro"*). O botão **Conferir na área** devolve o bipe à área sem fechar a viagem, e a faixa **"O bipe agora: …"** diz para onde vai cada bipe, na cor dele. Com as duas saídas abertas, vale a última escolhida. O `PRONTA_PRO_CARRO` do `carga.js` é a régua.
- **Por quê:** decisão do dono (D1, 26/09/2026). Recusar sem caminho, com a caixa na mão, ensina a empurrar do jeito que der.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_saida_agencia.js` (43).
- **Status:** no ar desde 26/09/2026 (PR #142) · a primeira viagem de verdade ainda não foi fechada.
- **História:** fase 4 da spec `SAIDA-E-DUPLA-CONFERENCIA`.

### R-VIA-02 · A viagem fecha com foto e número, como o caminhão
- **Regra:** `saíram = bipadas no carro NESTA viagem`. **Bateu:** cada caixa grava `saiu_em` e `saiu_por='agencia'`, numa saída `tipo='agencia'` (o `saida_id` já vem do bipe no carro). **Não bateu:** nada anda, e liberar exige `saida.liberar` e motivo.
- **Por quê:** a mesma razão da R-SAI-06.
- **Exceções:** as caixas de agência carregadas antes do deploy da fase 4 não têm viagem e ficam como estão; bipadas de novo, respondem "essa caixa já saiu".
- **Teste que trava:** `teste_saida_agencia.js`.
- **Status:** no ar desde 26/09/2026.

### R-VIA-03 · A caixa de coleta pode ir pelo carro
- **Regra:** do canto, ela entra no carro marcada, sai do card "esperando o caminhão" e da conta do caminhão (`AGUARDA_CAMINHAO` exige `saida_id IS NULL`), e fecha com `saiu_por='agencia'`, `retirado_em` preenchido e a `modalidade` intacta.
- **Por quê:** a caixa está no carro; deixá-la também no canto a contaria duas vezes.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_saida_agencia.js`.
- **Status:** no ar desde 26/09/2026.

### R-VIA-04 · Tirar do carro desfaz o bipe; cancelar a viagem com caixa no carro é recusado
- **Regra:** a de agência volta à área, conferida (`embalado`); a de coleta volta ao canto. Para cancelar a viagem, primeiro se tira tudo do carro.
- **Por quê:** senão a caixa ficaria no carro sem viagem nenhuma.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_saida_agencia.js`.
- **Status:** no ar desde 26/09/2026.

### R-VIA-05 · A foto da viagem vem da galeria, e a viagem fecha de qualquer aparelho
- **Regra:** o campo da foto da viagem **não tem `capture`**. O normal é o motorista, de volta, abrir o Carregamento no celular dele (Wi-Fi da fábrica, PIN dele) e fechar com a foto que tirou no balcão. Viagem aberta de um dia para o outro sai marcada em vermelho. Abaixo de 600 px os quadros do topo ficam dois por linha.
- **Por quê:** decisão do dono (D3): o servidor está na rede da fábrica e a agência não o alcança. Com `capture`, o celular só abriria a câmera.
- **Exceções:** nenhuma.
- **Teste que trava:** ⚠ **sem teste**.
- **Status:** no ar desde 26/09/2026.

### R-VIA-06 · O "No carro" do topo e a viagem dizem o mesmo número
- **Regra:** o topo conta também a caixa de coleta que entrou no carro, pela hora em que entrou (`no_carro_em`); a de agência que o caminhão levou continua fora (R-SAI-07).
- **Por quê:** o topo dizia 2 e a viagem dizia 3 — a mesma tela com duas réguas.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_saida_agencia.js` (o contador do carro).
- **Status:** no ar desde 26/09/2026.

---

## O que sai adiantado

### R-ADI-01 · Adiantado é o que sai da fábrica antes do despacho da etiqueta, contado em PEÇAS
- **Regra:** o 4º quadro do Carregamento mostra **Peças adiantadas hoje** (carro × coleta, as caixas quando não batem com as peças) e os **últimos 30 dias**; o `GET /api/carregamento` devolve `saiu_adiantado`, e o `POST /api/carregar` devolve `adiantado`. No carro a saída é o bipe; **na coleta é o caminhão levando (`retirado_em`)**, não o bipe pro canto. A caixa de várias conta N. `carga.js → saidasAdiantadas(db, dias)` e `SAIDA()` são o dono único. O banner `⏩ ADIANTADO — despacha dd/mm` aparece no bipe, no carro e na coleta. O bipe continua aceitando.
- **Por quê:** pedido do dono (25/09/2026), para medir quanto se envia adiantado. Contada pelo bipe, a caixa de coleta seria "adiantada" sem ter saído da fábrica.
- **Exceções:** o fechamento à mão dos scripts de passivo nunca entra (eles carimbam a saída na data do despacho); volume sem `despachar_em` lido fica fora. Não confundir com `adiantadas`, que é o que **pode** sair adiantado e ainda está na fábrica.
- **Teste que trava:** `teste_carga.js` (11 casos).
- **Status:** no ar e conferida pelo dono em 25/09/2026 (PR #132) · a metade da coleta só se prova no dia em que uma caixa futura for no caminhão.

---

## O passivo das saídas

### R-PAS-01 · O passivo da coleta bipada sai na data do bipe de cada caixa
- **Regra:** `node fechar_saida_passivo.js` (simula) e `--aplicar` (com `await db.backup()` antes) fecham numa saída `tipo='passivo'` as caixas paradas em "esperando o caminhão" (a régua é o `AGUARDA_CAMINHAO`, sem o modo teste). Cada caixa sai em `carregado_em`, nunca hoje, e `retirado_em` recebe o mesmo carimbo. O script recusa banco sem as colunas novas, e é idempotente.
- **Por quê:** é o limite de baixo honesto — a caixa não saiu antes de ir pro canto, e a hora real da retirada não existe. É a regra de todo script de passivo (R-COR-04).
- **Exceções:** essas caixas entram em "Peças adiantadas" nas datas do bipe.
- **Teste que trava:** `teste_saida.js`.
- **Status:** aplicado em produção em 26/09/2026 (saída #1, 399 caixas) · o canto foi conferido vazio pelo dono.

### R-PAS-02 · O passivo das caixas nunca bipadas exige data de corte de quem viu sair
- **Regra:** `node fechar_saida_passivo.js --nao-bipadas --ate AAAA-MM-DD` (simula) e `--aplicar` gravam uma saída `tipo='passivo'` e, em cada caixa, `carregado`, `saida_id` e `saiu_por` pela modalidade. A data é **obrigatória**, no formato, e não pode ser futura. O carimbo é o dia do despacho às 15:00, nunca antes do dia da impressão nem do próprio `embalado_em`; sem despacho lido, vale o dia da impressão. `retirado_em` só na coleta; `conferido_em` fica vazio. Estoque e modalidade não se mexem.
- **Por quê:** "etiqueta impressa e sem bipe" também descreve a caixa impressa hoje cedo, que ainda está na pilha.
- **Exceções:** ficam de fora o despacho depois de hoje, a agência já conferida na área ou no carro, a caixa já ligada a uma saída e o modo teste. A última linha da simulação não pode ser um comando executável sozinho.
- **Teste que trava:** `teste_saida.js` (os 21 últimos casos).
- **Status:** aplicado em produção em 01/10/2026 (saída #3, 485 caixas). A prova que importa é a fila *coleta impressa e não bipada pro canto* não voltar a crescer.

---

## O que ainda não tem teste nesta área

R-COL-02 (o relógio de despacho é só da agência), R-PIL-05 (as listas da pilha
nascem recolhidas), a exceção da R-SEG-01 (a viagem e as sobras não travam por
"quem imprimiu") e R-VIA-05 (a foto da viagem sem `capture`).

## O que NÃO fazer

> Vieram do CLAUDE.md §15 sem alteração, na ordem em que estavam. As
> referências entre parênteses (§N) apontam para a seção do CLAUDE.md onde
> a regra morava, hoje em cartão neste arquivo ou na história da área.

- ❌ Fazer a marcação "Motorista recusou" mexer no saldo: a expedição só marca,
  e o admin aceita a volta pela Mesa (§8-B, RECUSA-DO-MOTORISTA)
- ❌ Marcar como `cancelada_varias` a caixa de várias que o motorista recusou: ele
  recusou a caixa inteira, e o "voltou" tem que existir por peça (§8-B)
- ❌ Fazer a reimpressão gravar `impresso_por`: o bipe 1 é a PRIMEIRA
  impressão, e papel repetido não é outra contagem (§8-B, fase 1 da saída)
- ❌ Voltar a esconder os SKUs da caixa de várias no Carregamento, ou mostrar só
  o `lote.codigo` na linha dela: a lista aparece desde 05/10/2026, por decisão
  do dono, e a trava é o bipe de cada peça (§8-B)
- ❌ Escrever uma segunda régua de "caixa de várias" no Carregamento: é o
  `VARIAS()` do `carga.js` (§8-B, CARREGAMENTO F2)
- ❌ Colar cópia da etiqueta de SKU por fora da caixa: são as do saco de cada
  persiana, e cópia não prova que a persiana entrou (§8-B, P6)
- ❌ Deixar quem imprimiu conferir no Carregamento — desde 01/10/2026 o bipe da
  área e do canto RECUSA (§8-B, CARREGAMENTO-SEGUNDA-PESSOA)
- ❌ Criar porta de liberação para quem imprimiu conferir, nem para o Admin
  Geral: o cruzamento é automático por decisão do dono, e liberação vira rotina (§8-B)
- ❌ Contar como "mesma pessoa" a caixa sem um dos dois nomes: vazio igual a
  vazio é não saber quem fez, e vai para "sem registro" (§8-B)
- ❌ Deixar a pilha esquecer a caixa impressa ontem e não conferida, ou somá-la
  na conta de hoje — ela vai à parte, em cima (§8-B, armadilha #9)
- ❌ Abrir por padrão a lista da pilha enquanto o bipe for um só: são as mesmas
  caixas das listas do carro e da coleta, e a tela diria tudo duas vezes (§8-B)
- ❌ Fazer `saiu_por` reescrever `lote.modalidade`, ou o contrário: a etiqueta
  diz uma coisa, a saída diz outra, e as duas são verdade (§8-B, #21)
- ❌ Voltar a fechar a coleta comparando o canto INTEIRO com o motorista: um dia
  sem fechar estraga todos os seguintes. É uma saída por caminhão (§8-B, fase 3)
- ❌ Fechar a saída do caminhão sem o passo das sobras: "não ficou nada" é
  resposta, e o silêncio não é (§8-B, fase 3)
- ❌ Fazer o bipe da saída querer dizer "foi no caminhão" para caixa fora da
  conta: o bipe só diz SOBROU, e a troca de porta é por botão (§8-B, fase 3)
- ❌ Gravar quem fechou a saída como conferente da caixa que foi no caminhão sem
  ninguém bipar: ela sai SEM conferência, com linha própria na pilha (§8-B)
- ❌ Misturar a caixa que foi sem conferência com "sem registro" na pilha: lá é
  não saber quem fez, aqui se sabe que ninguém conferiu (§8-B)
- ❌ Pôr a agência conferida na conta do caminhão: ela fica na área, e cada
  caminhão obrigaria a bipar dezenas de "sobras" (§8-B, fases 3 e 4, D2)
- ❌ Deixar o bipe da ÁREA pôr a caixa de agência no carro: desde a fase 4 são
  dois bipes, e o do carro só aceita caixa conferida (§8-B, fase 4, D1)
- ❌ Aceitar no carro caixa não conferida na área, ou recusar sem dizer o que
  fazer — a recusa manda conferir e voltar (§8-B, fase 4)
- ❌ Deixar a caixa de coleta que está no carro aparecer no canto ou na conta do
  caminhão: ela está no carro (`saida_id` da viagem) (§8-B, fase 4)
- ❌ Pôr `capture` no campo da foto da viagem: a foto vem da GALERIA do celular
  do motorista, tirada no balcão (§8-B, fase 4, D3)
- ❌ Deixar o "No carro" do topo e a viagem dizerem números diferentes: a de
  coleta que entrou no carro conta nos dois (§8-B, fase 4)
- ❌ Contar no "No carro" a caixa de agência que saiu pelo caminhão
  (`saiu_por='coleta'`): o carro fecharia com uma a menos (§8-B, fase 3)
- ❌ Contar como adiantada a caixa de coleta que só foi pro canto: a saída da
  coleta é o caminhão levando (`retirado_em`), e o bipe não é saída (§8-B)
- ❌ Escrever uma segunda conta de "saiu adiantado", ou contar caixa em vez de
  peça: é o `saidasAdiantadas` do `carga.js`, e a caixa de várias conta N (§8-B)
- ❌ Pôr a caixa de coleta na lista ou no contador do carro, ou somar a coleta
  no relógio de despacho — são duas portas de saída, e `carga.js` é o dono
  único de "isto é coleta?" (§8-B, armadilha #21)
- ❌ Tratar `modalidade=NULL` como coleta: sem dado é agência, que é o que
  sempre existiu (§8-B)
- ❌ Afrouxar o `modalidadeDespacho()` para "parecido com coleta" passar como
  coleta — formato que o sistema não conhece vai para Bloqueados e a gestão
  decide, por regra do dono (§8-B, armadilha #21)
- ❌ Deixar cadastro de SKU soltar volume retido por `modalidade:` — cadastro
  não responde por onde a caixa sai (§8-B)
- ❌ Fechar a coleta sem a foto da tela do motorista, ou com número diferente
  sem `confirmar` e sem registro — a foto é a prova, e a divergência é a
  única chance de achar a caixa (§8-B)
