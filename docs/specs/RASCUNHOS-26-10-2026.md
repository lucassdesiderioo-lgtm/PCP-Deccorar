> **STATUS · 26/10/2026 — RASCUNHO, AGUARDANDO O DONO** · cinco propostas que
> nasceram da lista de pendências de 26/10/2026. **Nenhuma está aprovada e
> nenhuma foi construída** (§0: `REGRA` ou `NOVIDADE` sem spec aprovada não se
> constrói). Cada uma termina com as perguntas que só o dono responde. Aprovada,
> vira spec própria em `docs/specs/` e entra na fila.

# Rascunhos de 26/10/2026

| # | Assunto | Tipo | Risco | O que destrava |
|---|---|---|---|---|
| R1 | SKU recém-cadastrado nasce com saldo zero e a Etiqueta de Venda recusa | `REGRA` | 🔴 estoque | a venda que hoje sai por fora, pelo PDF do ML |
| R2 | Clique duplo na revisão | `REGRA` | 🟡 bipe | a peça "revisada em 0 s" que vai para a fila |
| R3 | Revisão perdida quando cai a conexão (dívida 3) | `NOVIDADE` | 🟡 bipe | o buraco no relatório de revisão |
| R4 | Nada acusa uma regra inerte (dívida 18) | `NOVIDADE` | 🟢 leitura | a regra escrita que não pega em ninguém |
| R5 | O balde `SOBMEDIDA` | `REGRA` | 🔴 etiqueta | a peça sob medida trocada entre clientes |

E duas dívidas antigas, classificadas no fim (D4 e D5).

---

## R1 · O SKU novo nasce com saldo zero, e a Etiqueta de Venda recusa a venda

**O que acontece hoje.** O caso do Screen 1,20 × 1,20 bege (22/10/2026): o SKU
estava bloqueado, foi cadastrado, e a impressão recusou "sem estoque livre",
porque a peça estava na prateleira e **nunca tinha sido embalada no sistema**.
A etiqueta saiu pelo PDF do ML, por fora — e desde a baixa na conferência
(22/10) a etiqueta por fora não baixa nada, então o saldo só fica certo se a
peça também nunca tiver somado. É a armadilha #6 pela porta do cadastro: a trava
dispara no caso normal de SKU novo, e o desvio acontece fora da vista do sistema.

**Proposta.** Não afrouxar a trava — ela é o que impede imprimir peça que não
existe. Dar a ela **o caminho**:

1. **A recusa diz o que fazer.** Quando o SKU nunca teve movimento no livro
   (nenhuma linha em `movimento_estoque`), a Etiqueta de Venda troca "sem estoque
   livre" por *"Este SKU nunca entrou no estoque. Se a peça está na prateleira,
   embale-a na Embalagem (3 bipes) — ela vira estoque e a etiqueta sai."*
2. **Ou um pedido de entrada, na própria recusa.** Botão "A peça está aqui" que
   abre um **pedido de ajuste** (+N, motivo "peça existente sem embalagem"),
   aprovado por outra pessoa — a mesma porta do ajuste em duas pessoas (§18,
   R-EST-20). Nada entra sem a segunda pessoa.

**Perguntas ao dono.**
- P1. O caminho certo é embalar (1) ou o pedido de ajuste (2)? Ou os dois, com o
  ajuste só para quem tem `estoque.ajustar`?
- P2. Vale só para SKU **sem nenhum movimento**, ou também para o SKU antigo com
  saldo zero (onde "a peça está aqui" quase sempre é contagem errada, que é do
  Inventário)?

**Fases.** F1: a frase da recusa (sem mexer em saldo). F2: o botão de pedido de
ajuste, se P1 disser que sim.

---

## R2 · O clique duplo na revisão

**O que acontece hoje.** Na tela `/operador` o primeiro bipe (ou toque no
quadrado) **inicia** e o segundo **encerra** (`toggle`, `operador.html`). Um
toque duplo, ou o leitor repetindo a leitura, encerra a revisão no mesmo
segundo: grava uma revisão de 0–1 s e põe a peça na fila da embalagem sem
ninguém ter revisado. Não há trava nem "desfazer".

**Proposta.** As duas, porque fecham coisas diferentes:

1. **Guarda de tempo mínimo**, como os 700 ms da Etiqueta de Venda (§5, #23): o
   segundo bipe do **mesmo SKU** antes de *N* segundos é ignorado com aviso
   ("bipe repetido — ainda revisando"). *N* é cadastro (`config`), e nasce em 3 s.
2. **"Desfazer a última"** por 60 s depois de encerrar: apaga a linha de
   `revisao` e a linha da `fila` que ela criou, se a fila ainda estiver
   `aguardando` (a mesma régua do R-EMB-07). Grava na auditoria.

**Perguntas ao dono.**
- P3. Quanto é o tempo mínimo de uma revisão de verdade? (3 s é chute.)
- P4. O "desfazer" fica só com quem revisou, ou qualquer um da revisão?

**Fases.** F1: a guarda. F2: o desfazer.

---

## R3 · A revisão perdida quando cai a conexão (dívida 3)

**O que acontece hoje.** O `finish()` do `/operador` zera o cronômetro **antes**
de mandar a revisão. Se o `fetch` falha, a tela diz "Falha de conexão" e a
revisão some: a peça foi revisada, não entrou na fila, e o relatório tem um
buraco que ninguém vê.

**Proposta.** Uma **fila local de reenvio** no tablet, com chave única por bipe:

1. cada revisão ganha uma **chave** gerada no tablet (`id_bipe`), e o servidor
   grava a chave com `UNIQUE` — reenviar a mesma revisão duas vezes **não**
   cria duas (é o que torna o reenvio seguro: a resposta pode se perder depois
   da gravação, §12);
2. falhou, a revisão vai para o `localStorage` e a tela mostra **"1 revisão
   esperando conexão"** em âmbar — nunca some calada;
3. a fila é reenviada a cada 15 s e no próximo bipe, na ordem.

É a camada 3 da spec `TABLETS-E-KIOSK` ("fila offline") para **uma** estação.
Fazer na revisão primeiro mede se o desenho serve antes de levar às outras.

**Perguntas ao dono.**
- P5. Vale começar pela revisão, ou a embalagem (que soma estoque) é mais urgente?
  Na embalagem o risco é maior (§2: é onde a peça vira estoque) e o desenho tem
  que ser 🔴.

**Fases.** F1: a chave única no servidor. F2: a fila local na revisão.

---

## R4 · Nada acusa uma regra inerte (dívida 18)

**O que acontece hoje.** Três formas já apareceram, e todas foram achadas por
acaso: a **flag** que ninguém marcou (`modelo.sob_medida`, armadilha #30), a
**rota** que nenhuma tela chama (o extrato do livro; o `POST /api/componentes`
por oito meses, #33) e a **chave** que nenhuma rota lê (`minimo.definir`, que
saiu em 26/10/2026).

**Proposta.** Uma seção **"Regras sem efeito"** na aba *Auditoria & cobertura* de
`/acessos`, só leitura, ao lado da cobertura de rotas que já existe (§10, #29):

| Sinal | Como se mede | Exemplo que teria pego |
|---|---|---|
| chave que nenhuma rota lê | chave de `permissoes.js` que não aparece no `permDaRota`, nas rotas do sob medida nem em `podePermissao(…)` | `minimo.definir` |
| chave que ninguém tem | chave sem setor ativo nem exceção (fora o Admin Geral) | as cinco bancadas antes da 1ª marcação |
| flag de cadastro sem nenhuma linha marcada | lista declarada das flags que uma regra lê (`modelo.sob_medida`, `modelo.exige_medida`…) com contagem | a #30 |

Cada linha diz **o que fazer** (marcar, apagar ou ignorar com motivo), e a
seção fica âmbar enquanto houver linha — a mesma régua da cobertura do parse
(§18). "Rota que nenhuma tela chama" fica de fora da F1: medir exige varrer o
HTML das telas, e um falso positivo ali ensina a ignorar a seção inteira.

**Perguntas ao dono.**
- P6. A seção mora na Auditoria (só Admin Geral) ou no admin, onde mais gente vê?

**Fases.** F1: chaves e flags. F2: rotas sem tela, se a F1 provar que vale.

---

## R5 · O balde `SOBMEDIDA`

**O que acontece hoje.** A venda sob medida do Mercado Livre chega com o SKU
`SOBMEDIDA` (ou `BKSOBMEDIDA`), um código para peças que são todas diferentes.
A fila da embalagem pega "a mais antiga de `SOBMEDIDA`", e nada liga o volume do
ML à peça física: quem resolve é a memória de quem embala, e nenhuma das cinco
conferências do §5 pega uma troca, porque as duas peças têm o mesmo código. O
erro caro é a **troca entre clientes**.

**O que mudou desde que isso foi escrito.** O módulo sob medida (§19) já dá a
cada peça um **código de etiqueta de produção** que nasce na aprovação do pedido
(R-SMT-01) e é bipado nas cinco bancadas. A peça física já tem identidade; o que
falta é **ligar o volume do ML a ela**.

**Proposta.**
1. A venda sob medida do ML vira **pedido no módulo** (revenda "Mercado Livre"),
   com a medida e a cor que o cliente pediu — lançado por quem lê a venda.
2. Na Etiqueta de Venda, o volume `SOBMEDIDA` só imprime depois do bipe da
   **etiqueta de produção** da peça, que tem que ser **daquele pedido**.
3. A conferência compara o volume com a peça pelo código, e não pelo SKU.

**Perguntas ao dono.**
- P7. Quem lança a venda sob medida do ML como pedido no módulo, e quando (antes
  de cortar, que é o certo, ou depois)?
- P8. Quantas vendas `SOBMEDIDA` por semana? Se forem poucas, a F1 pode ser só
  "digitar o número do pedido do módulo" na Etiqueta de Venda, sem bipe.

**Fases.** F1: o vínculo volume ↔ pedido do módulo, digitado. F2: o bipe da
etiqueta de produção na Etiqueta de Venda.

---

## As duas dívidas antigas, classificadas

**D4 · `POST /api/producao` (lançar produção à mão) não aceita `data`, `origem` nem
`urgente`** — é `NOVIDADE`: a data decide em que dia a ordem cobra a revisão
(`ordem_dia.js`, R-REV-05), e "urgente" muda a tela vermelha. Antes de construir é
preciso responder: **P9.** lançar para amanhã deve aparecer hoje como
"adiantamento" (§16) ou só amanhã?

**D5 · O upload do PDF não deixa escolher a data das vendas** — **provavelmente
resolvida pela armadilha #7** (§8): desde 25/08/2026 a fila não usa mais a data
do upload, e sim a linha "Despachar" de cada etiqueta (`despachar_em`, dono
`fila_dia.js`). O que ainda lê a data do upload é a **média do sistema**
(`media_dominio`, §3), que conta a venda pelo dia em que o PDF entrou — e lá a
diferença é de horas. **P10.** Pode riscar a dívida 5? Se sim, ela sai da §14 com
essa explicação.
