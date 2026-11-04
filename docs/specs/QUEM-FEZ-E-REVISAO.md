> **STATUS · 04/11/2026 — PLANEJADO**
> - Desenhado no Projeto do Claude com o Lucas em 04/11/2026. Nada implementado.
> - Fases 1 a 7 abaixo. A fase 1 resolve o problema que originou esta spec (bipe
>   acidental na Revisão); as demais aplicam a regra "quem fez" ao resto do sistema.
> - Os **relatórios** de produtividade NÃO são desta spec: moram em
>   `PCP-CONTROLE-E-VISAO.md` §3, que passa a ter de onde tirar os dados.

---

# Quem fez — a revisão que se desfaz, e o login em tudo

> Duas coisas, nesta ordem:
> 1. A Revisão deixa de mandar para a embalagem a peça que **não foi revisada**.
> 2. Todo o sistema passa a gravar **quem fez** cada ação, pelo login ativo (PIN).

---

## 1. O problema que abriu esta spec

Na tela de Revisão (`/operador`) o operador bipa o SKU para começar e bipa de novo para
terminar. O processo funciona e a equipe faz certo. O problema é o **bipe acidental**:

- o leitor (ou o dedo) manda **dois bipes colados**, um atrás do outro;
- o sistema entende início + fim, grava uma revisão de 1 segundo e **insere a peça na
  `fila` da embalagem** (`server.js`, `POST /api/revisao`);
- **não existe volta.** Não há botão de cancelar a revisão em andamento, nem de desfazer
  a que acabou de fechar.

O efeito: a revisão é contada sem ter acontecido, e a lista da Embalagem enche com peça
que ninguém revisou.

### Os dados (30 dias até 04/11/2026, 1.698 revisões, `teste=0`)

| Tempo da revisão | Revisões |
|---|---|
| 0–4 s | 17 |
| 5–9 s | 4 |
| 10–14 s | 2 |
| 15–19 s | 7 |
| 20–24 s | 20 |
| 25–29 s | 58 |
| 30–39 s | 224 |
| 40–59 s | ~500 |
| 1 a 2 min | 693 |
| mais de 2 min | 171 |

**A revisão de verdade começa por volta de 20 s.** Abaixo de 15 s há 23 revisões em 30
dias — praticamente só bipe acidental.

> ⚠️ **O limite NÃO é 1 minuto**, embora a média percebida pelo dono seja ~1 min por
> peça. 834 revisões reais (quase metade) ficaram abaixo de 60 s — BK160140BEGE tem média
> de 59 s, BK130130BEGE de 57 s. Um limite de 1 min travaria o operador o dia inteiro, e
> trava que dispara no caso normal vira desvio (armadilha #6).

---

## 2. A regra-mãe: tudo que é feito no sistema grava QUEM fez

**Decisão do dono, 04/11/2026:**

> *Tudo que for feito na fábrica — não só no setor de operações, absolutamente tudo que
> der para controlar a produtividade de dentro do sistema — precisa estar gravado e
> atrelado ao PIN de quem está logado. Esses dados têm que estar prontos para a aba de
> Relatórios, que é onde se entende a produtividade de cada login, de cada pessoa. Tudo
> que for criado novo tem que nascer dentro dessa filosofia.*

### O que isso significa no código

1. **Toda ação que grava** (bipe, revisão, embalagem, impressão, carregamento, devolução,
   contagem, recebimento, cadastro, ajuste, decisão em Bloqueados…) grava junto
   **`usuario_id` e `usuario_nome`** do login ativo.
   - `usuario_id` é o que manda: o nome da pessoa pode mudar, o id não.
   - `usuario_nome` é foto do momento, para leitura humana e para o histórico não depender
     de a pessoa ainda existir no cadastro.
2. **A origem é sempre o servidor** (`req.usuario`, da sessão do PIN) — **nunca** um campo
   mandado pela tela. Campo vindo da tela é campo que se falsifica ou se esquece.
3. **Ação de operação sem login não grava.** A rota recusa (401). Hoje o `auth.js` já
   exige login nas rotas; esta regra fecha a outra ponta: **não existe linha de produção
   com `usuario_id` vazio** criada daqui pra frente.
4. **Ação desfeita ou cancelada também é ação**, e grava quem fez (ver fase 1). Um
   relatório que só enxerga o que deu certo mede a fábrica pela metade.
5. **Tempo da tarefa junto, quando existir.** Onde a tela tem cronômetro (revisão,
   embalagem), a linha grava início, fim e segundos — além de quem. É o par
   *quem + quanto tempo* que alimenta o "minuto por peça" do `PCP-CONTROLE-E-VISAO.md` §3.
6. **Tela nova nasce assim.** Rota nova de escrita que não grava `usuario_id` é
   reprovada no teste de cobertura (fase 7).

### Dono único

`quem.js` — **uma** função, `quem(req)`, devolve `{ usuario_id, usuario_nome }` ou
recusa. Toda rota usa ela. Hoje há pelo menos seis jeitos espalhados de ler o usuário
(`req.usuario.nome || ''`, `|| null`, um helper local em `compras_route.js`, outro em
`pedido_route.js`, outro em `receb_route.js`…) — e quase todos gravam **só o nome, como
texto**. Duas réguas para "quem fez" é a armadilha #12 em outra roupa.

### O que esta spec NÃO faz

- **Não desenha relatório.** Ranking, minuto por peça, comparação entre pessoas e quem vê
  o quê já estão decididos em `PCP-CONTROLE-E-VISAO.md` §3 (operador vê só o seu,
  supervisor vê a fábrica sem nome, o dono vê tudo com nome — `produtividade.propria |
  equipe | nominal`). Esta spec entrega **o dado pronto** para aquela.
- **Não mede tempo ocioso nem tempo de aba aberta.** Isso é a fase 2 do
  `PCP-CONTROLE-E-VISAO.md` (relógio de aba + regra dos 15 min). Aqui fica só o registro
  de entrada e saída do login (fase 6), que é a base para aquilo.
- **Não reconstrói o passado.** Revisão, embalagem e as demais ações anteriores ao deploy
  ficam sem `usuario_id`. Histórico não se inventa — o relatório começa a contar do dia em
  que cada fase entrar.
- **Não limpa a fila atual.** As peças que já entraram na fila por bipe acidental ficam
  de fora (decisão do dono, 04/11/2026). O lugar delas é o inventário e o
  `limpar_fila.js`, que já existem (`CLAUDE.md` §4).

---

## 3. A Revisão — as quatro peças

| Peça | O que faz | Grava |
|---|---|---|
| **Barreira de 15 s** | Bipe de fim com menos de 15 s desde o início é **recusado**: apita, mostra "rápido demais — a revisão continua" e o cronômetro segue | evento `rapido_demais`, com quem |
| **Cancelar revisão** | Botão novo, ao lado de "Peça com problema". Zera a revisão **em andamento**. Nada vai para a fila, nada é contado | evento `cancelada`, com quem |
| **Peça com problema** | **Continua como é hoje** — só para defeito de verdade. Já grava `rejeicao.usuario` | passa a gravar `usuario_id` também |
| **Desfazer última revisão** | O próprio operador toca. Apaga a **última** revisão **dele**, e tira a peça da fila | evento `desfeita`, com quem e a cópia da revisão |

### 3.1 Barreira de 15 s

- O limite mora em `config.rev_minimo_seg`, padrão **15**. Editável sem deploy, porque o
  catálogo muda e o número pode precisar andar.
- **Recusar, não perguntar.** Um "confirma?" vira botão que se aperta sem ler na terceira
  vez. Recusar é o mesmo desenho do kit na embalagem (§4 do `CLAUDE.md`): o bipe que não
  pode, não passa.
- A conta vale **na tela e no servidor**. A tela recusa para dar o retorno na hora; o
  `POST /api/revisao` recusa também (`409`, `motivo:'rapido_demais'`), para a regra não
  depender de a tela estar atualizada no tablet.
- O operador não perde nada: a revisão continua aberta, ele termina de revisar e bipa
  de novo.

### 3.2 Cancelar revisão

- Só aparece **com revisão em andamento**, como o "Peça com problema".
- Não pede motivo. Um toque, sem confirmação extra — o erro que ele resolve é de um
  segundo atrás.
- **Não usa o "Peça com problema"**, de propósito: ele obriga motivo de defeito e grava
  em `rejeicao`. Cada bipe errado viraria "peça com defeito" e o número de qualidade da
  fábrica passaria a mentir.

### 3.3 Desfazer última revisão

- Aparece **depois** que uma revisão fecha, enquanto ainda houver o que desfazer.
- **Só a última, e só a da própria pessoa.** "Última" é a revisão mais recente com o
  `usuario_id` de quem está logado — não a do tablet. Dois operadores no mesmo tablet não
  desfazem um a peça do outro.
- A tela mostra o que vai ser desfeito antes do toque final:
  `Desfazer BK150150BEGE · 1,50 × 1,50 Bege · revisada há 40 s?` — um toque para
  confirmar, porque aqui a revisão **já existia**.
- **Só desfaz enquanto a peça não foi embalada.** A linha da `fila` tem que estar
  `aguardando`. Embalada, ela já virou estoque (+1) e desfazer seria mexer em saldo —
  isso não é desta spec. A tela recusa dizendo o porquê: *"essa peça já foi embalada"*.
- **Só do dia.** Revisão de ontem não se desfaz pela bancada.
- Desfazer duas vezes seguidas desfaz a **anterior**? **Não.** Desfaz uma e o botão some
  até a próxima revisão fechar. Uma pilha de desfazer vira jeito de apagar o dia.

**O que o desfazer faz no banco** (numa transação só):

1. Copia a revisão inteira (código, início, fim, segundos, modo) para `revisao_evento`,
   com `tipo='desfeita'`, quem e quando.
2. Apaga a linha de `revisao`.
3. Apaga a linha de `fila` ligada a ela (`fila.revisao_id`, coluna nova), **só se**
   estiver `aguardando`. Se não estiver, a transação inteira volta.

> **Por que apagar, e não marcar `desfeita=1`:** a `revisao` é contada em pelo menos
> cinco lugares (`/api/revisao/hoje`, `ordem_dia.js`, `st_route.js`, `ger_route.js`,
> painel). Uma coluna nova obrigaria cada um a lembrar de filtrar — e o que esquecer
> volta a contar a revisão que não aconteceu. Apagando, todas as contas ficam certas sem
> ninguém mexer nelas. **O rastro não se perde:** está inteiro em `revisao_evento`.

> **Ordem do dia (armadilha #20):** a falta da ordem é medida por revisão `modo='hoje'`.
> Apagar a revisão desfeita devolve a falta ao número certo — que é exatamente o
> objetivo.

### 3.4 Onde mora

| O quê | Onde |
|---|---|
| `revisao.usuario_id`, `revisao.usuario_nome` | `ALTER` guardado + `CREATE` do `db.js` (§17) |
| `fila.revisao_id` | idem |
| `rejeicao.usuario_id` | `ALTER` guardado + `CREATE` do `cad_route.js` |
| Tabela `revisao_evento` (`tipo`, `codigo`, `segundos`, `modo`, `inicio`, `fim`, `usuario_id`, `usuario_nome`, `criado_em`, `teste`) | `db.js` |
| `config.rev_minimo_seg = 15` | seed |
| `POST /api/revisao/cancelar`, `POST /api/revisao/desfazer`, `GET /api/revisao/ultima` | `server.js` (ao lado do `POST /api/revisao`) |

> ⚠️ **AS ROTAS NOVAS PRECISAM DE LINHA NO `permDaRota()`.** Hoje a regra é
> `eq('/api/revisao')` — **igualdade exata**. `/api/revisao/desfazer` não casa com ela e
> cairia no `@logado` do fim da função, sem erro e sem aviso (dívida 16). As três rotas
> novas são `revisao.executar` — é a mesma bancada e a mesma pessoa.

> ⚠️ **MODO TESTE:** `revisao_evento` entra na lista `TABELAS` do `teste_route.js`. Sem
> isso, cancelar e desfazer em modo teste sujam o registro real (§11).

---

## 4. As outras telas — uma fase por tela

Cada tela passa a gravar `usuario_id` + `usuario_nome` em toda escrita, sempre por
`quem(req)`. Onde já grava só o nome em texto, passa a gravar o id também.

| Tela / ação | Tabela | Hoje grava quem? |
|---|---|---|
| Revisão | `revisao` | **não** (dívida 9) |
| Peça com problema | `rejeicao` | só nome |
| Embalagem | `montagem` | **não** (dívida 9) |
| Etiqueta de Venda — impressão e reimpressão | `lote` | só nome, em parte (`etq_route`, `exp_route`) |
| Etiqueta de Venda — bipe das peças do pacote | `lote_item` | a conferir |
| Carregamento e fechamento da coleta | `lote`, `coleta_fechamento` | só nome |
| Devolução — revisão (etapa 1) e baixa no admin (etapa 2) | `devolucao` | **não** |
| Inventário / contagem | `contagem`, `contagem_pendente` | só nome |
| Compras, pedido, recebimento | várias | só nome |
| Bloqueados, cadastros, ajustes, ficha | `lote`, `auditoria`, `ajuste_estoque`… | só nome |
| Sob medida (`tecido/`) | `tecido.db` | a conferir |

> **Não renomear nem apagar as colunas de nome que já existem** (`contado_por`,
> `resolvido_por`, `usuario`…). Elas são história e há tela lendo. A coluna nova
> (`usuario_id`) entra **ao lado**.

---

## 5. Fases

| Fase | O quê | Risco | Entrega |
|---|---|---|---|
| **1** | **Revisão:** `quem.js`; revisão grava quem; barreira de 15 s; Cancelar; Desfazer última; `revisao_evento`; `rejeicao.usuario_id` | 🔴 (fila, dados de produção, schema) | **Acaba o bipe acidental na embalagem.** Revisão por pessoa começa a acumular |
| **2** | **Embalagem** grava quem (`montagem`) | 🔴 (porta do estoque) | Embalagem por pessoa |
| **3** | **Etiqueta de Venda:** impressão, reimpressão e bipe das peças do pacote | 🔴 (etiqueta) | Expedição por pessoa |
| **4** | **Carregamento** e **fechamento da coleta** | 🟡 | Carregamento por pessoa |
| **5** | **Devolução** (as duas etapas) e **Inventário/contagem** | 🔴 (estoque) | Devolução e contagem por pessoa |
| **6** | **Entrada e saída do login:** registra cada login, logout, troca de setor e expiração de sessão, com quem e quando | 🔴 (acesso) | Base para medir se a pessoa logada estava em atividade — usada pelo relógio de aba do `PCP-CONTROLE-E-VISAO.md` fase 2 |
| **7** | **Escritório e cobertura:** compras, recebimento, cadastros, Bloqueados, ajustes, sob medida passam a gravar `usuario_id`; `teste_quem.js` varre as rotas de escrita e **recusa** rota sem `quem(req)`; regra no `CLAUDE.md` | 🟡 | A regra-mãe fica travada por teste — rota nova sem "quem" não passa |

**A fase 1 é a que resolve o problema do chão de fábrica, e vem primeiro.** Cada fase
seguinte é pequena, mexe numa tela só e é testada sozinha.

> **Por que o teste de cobertura fica para a fase 7 e não para a 1:** se ele entrasse
> na fase 1, reprovaria o sistema inteiro no primeiro dia e alguém o desligaria. Ele
> entra quando as fases 2 a 6 já tiverem fechado o que existe — a partir daí, só rota
> **nova** pode quebrá-lo, que é o ponto.

---

## 6. Regras que não podem ser quebradas

1. **Quem fez vem do servidor (`req.usuario`), nunca da tela.**
2. **`quem.js` é o dono único** de "quem está fazendo isto". Nenhuma rota lê
   `req.usuario` direto para gravar autoria.
3. **Ação de operação sem login não grava.**
4. **Cancelar e desfazer também são ações**, e gravam quem.
5. **Desfazer: só a última, só a própria, só do dia, só antes de embalar.**
6. **Barreira de 15 s recusa — não pergunta.** O número mora em `config`.
7. **"Cancelar" não é "Peça com problema".** Bipe errado não é defeito.
8. **Nada desta spec mexe em estoque.** Revisão já não soma estoque (armadilha #1), e o
   desfazer para antes da embalagem.
9. **Relatório não se calcula aqui.** O dado fica pronto; a régua é a do
   `PCP-CONTROLE-E-VISAO.md`.

---

## 7. Testes da fase 1 (escritos antes do código — risco 🔴)

`teste_revisao.js`:

1. Revisão com 14 s é recusada (`rapido_demais`), não cria `revisao` nem `fila`, e grava
   o evento com quem.
2. Revisão com 15 s passa, cria `revisao` com `usuario_id` e `fila` com `revisao_id`.
3. Revisão sem login é recusada.
4. Cancelar grava `revisao_evento` `cancelada` e não cria `revisao` nem `fila`.
5. Desfazer apaga a última revisão **do usuário** e a linha da fila, e grava a cópia.
6. Desfazer com a peça já embalada é recusado e **não apaga nada** (transação volta).
7. Usuário A não desfaz a revisão do usuário B no mesmo tablet.
8. Desfazer não volta duas revisões seguidas.
9. Revisão de ontem não se desfaz.
10. Depois do desfazer, o número de `ordem_dia.js` e de `/api/revisao/hoje` volta ao de
    antes da revisão.
11. Em modo teste, `revisao_evento` é marcado e apagado junto (§11).
12. `permDaRota()` devolve `revisao.executar` para as três rotas novas — nenhuma cai em
    `@logado`.

E os que já existem: `teste_ordem_dia.js`, `teste_acesso.js`, `teste_estoque.js`.
