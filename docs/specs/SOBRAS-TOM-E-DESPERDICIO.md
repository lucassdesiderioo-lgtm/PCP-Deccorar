# Sobras — limpeza, tom pela origem e desperdício visível

```
STATUS
Situação: em construção
Criada em: 18/09/2026
Última atualização: 18/09/2026
Fase atual: 1 (limpeza) — implementada e testada; falta rodar no servidor
Fases: 1 ☑  2 ☐  3 ☐  4 ☐
Risco: 🔴 (dados de sobra e baixa no Confirmar do plano)
Módulo: sob medida (tecido/) — ler tecido/README.md antes de mexer
Mudanças no caminho:
  · Fase 1 — o corte por data virou a QUARTA GUARDA, e não um filtro. Achando
    sobra cadastrada depois de 18/09/2026, o script PARA em vez de apagar só
    as antigas: sem apagar `etiqueta` a numeração não voltaria ao S-000001, e
    a limpeza teria feito metade do serviço sem dizer qual metade. O efeito
    pretendido é o mesmo — rodado depois de hoje, ele não toca no cadastro
    novo. Decidido pelo dono ao aprovar o plano ("pode seguir, com o corte
    por data"); a forma de guarda saiu da construção.
```

---

## 1. Problema

Três coisas apareceram juntas na primeira semana de uso das sobras:

1. **O cadastro de sobras ficou sem valor.** As sobras foram retiradas dos
   endereços para serem medidas antes do cadastro com a etiqueta. As medidas no
   sistema são duvidosas e nenhuma sobra tem etiqueta colada. O sistema e a
   prateleira não concordam mais. Nenhuma sobra foi usada em corte.
2. **O plano recusa sobra que serve, e a mensagem engana.** Num teste com duas
   peças do mesmo pedido (0,90 × 1,60 e 0,92 × 1,50, tecido Rolo 1% Cinza), a
   sobra S-000091 comportava uma das peças. O tom único exige o pedido inteiro
   numa fonte só, nenhuma sobra comportava as duas e não havia rolo. O plano
   disse *"Nenhuma das 11 sobras deste tecido comporta estas peças"* — o que é
   falso, e fez o dono achar que o sistema só aceita medida exata.
3. **O tom único trata toda fonte como diferente.** Sobra que nasceu de um rolo
   tem o tom daquele rolo, e o sistema já guarda essa origem
   (`sobra.origem_rolo_id`, `origem_sobra_id`), mas não usa. E mesmo entre
   origens diferentes, o operador consegue conferir o tom a olho.

Além disso, o dono quer saber **quanto de cada sobra vira refugo** quando ela é
usada, sem jogar sobra boa no lixo e sem deixar sobra encalhada.

## 2. Objetivo

- Zerar o cadastro de sobras e das etiquetas para a equipe recadastrar do
  S-000001, com medida, etiqueta e endereço no mesmo momento.
- O plano de corte usar mais sobra: dividir um pedido entre fontes do mesmo tom
  sem pedir nada, e entre origens diferentes com a conferência do operador.
- Mostrar o desperdício de cada sobra sugerida e escolher a que gera menos
  refugo, **medindo** antes de decidir qualquer limite.

## 3. Como funciona na fábrica

**Recadastro (a partir de 19/09/2026):** medir a sobra → colar a etiqueta nova
(S-000001 em diante) → cadastrar já no endereço. As três coisas no mesmo
momento. Sobra fora da prateleira sem cadastro é o que gerou a bagunça.

**Corte com pedido de várias peças:**

1. O operador lança as medidas com o número do pedido, como hoje.
2. O sistema põe as peças nas sobras primeiro (política da casa), e o que não
   couber vai para o rolo — agora podendo dividir o pedido entre fontes.
3. Se o pedido ficou em fontes de **origens diferentes**, cada fonte aparece com
   o botão **"Conferi o tecido"**. O operador pega as sobras, compara a cor e
   clica em cada uma.
4. Tom não bateu → **recusa** a sobra com motivo ("Tom fora"), como já existe.
   O plano recalcula.
5. Só com todas as conferências feitas o **Confirmar** libera.

## 4. Regras de negócio

**R1 — Limpeza total, sem refugo.** Todas as sobras cadastradas até 18/09/2026
são apagadas, junto com as etiquetas impressas, os lotes de impressão, as
correções, os apontamentos, as recusas de sobra e as linhas de refugo de
descarte de sobra. Nada disso conta como perda: essas sobras nunca existiram
como cadastro confiável. A numeração recomeça em **S-000001**.

**R2 — As etiquetas antigas em papel são destruídas antes da limpeza.** Com a
numeração recomeçando, uma etiqueta antiga teria o mesmo número de uma nova.
Duas sobras com o mesmo código é o pior erro possível nesse controle.

**R3 — A limpeza não passa por cima de corte confirmado.** Se alguma sobra
estiver `usada`, tiver nascido de um plano confirmado ou for citada por
`plano_faixa`, o script **para** e lista essas sobras. O dono decide caso a caso.
(Declarado pelo dono: nenhuma foi usada. O script confere em vez de confiar.)

**R4 — A mensagem do plano diz qual sobra serve e por que não foi usada.** Para
toda sobra que comporta ao menos uma peça e não entrou no plano, a tela mostra
a sobra, a peça que ela comporta e o motivo: pedido não se separa, recusada
neste plano, condição não aproveitável etc. A frase "nenhuma sobra comporta" só
aparece quando é verdade.

**R5 — Mesmo tom pela origem.** Toda fonte tem uma **origem de tom**:

| Fonte | Origem de tom |
|---|---|
| Rolo | o próprio rolo |
| Sobra que nasceu de rolo | aquele rolo (`origem_rolo_id`) |
| Sobra que nasceu de sobra | sobe pela `origem_sobra_id` até achar o rolo |
| Sobra do mutirão / sem rolo na cadeia | **sem origem** — cada uma é sozinha |

Peças do mesmo pedido em fontes da **mesma origem de tom** são tratadas como
fonte única: não pedem conferência.

**R6 — Origens diferentes podem se misturar, com conferência obrigatória.** Um
pedido pode ser dividido entre fontes de origens diferentes (sobras do mutirão
entre si, sobra + rolo novo, sobras de rolos diferentes). Nesse caso **cada
fonte do pedido** exige o clique **"Conferi o tecido"** antes do Confirmar.

- A conferência grava **quem, quando, qual pedido e qual fonte**. É a prova se
  o cliente reclamar do tom.
- Sem todas as conferências, o Confirmar é recusado com mensagem dizendo quais
  fontes faltam.
- Recalcular o plano (por recusa ou mudança) zera as conferências daquele plano.

**R7 — Ordem de preferência para um pedido de várias peças:**
1. o pedido inteiro numa fonte só (como hoje);
2. dividido entre fontes da mesma origem de tom (R5);
3. dividido entre origens diferentes, com conferência (R6).

A política "sobra primeiro, sempre" continua valendo dentro de cada degrau.

**R8 — Pedido já cortado noutro dia.** A regra de hoje continua: se o pedido já
saiu de um rolo com saldo, o plano continua nele. Se agora precisar de outra
fonte, a origem de tom daquele corte anterior entra na conta de R5/R6.

**R9 — Desperdício visível por sobra.** Cada sobra sugerida mostra, em % da área
dela:

```
S-000091 · 1,20 × 1,80 (2,16 m²)
usa 43% nas peças · 38% vira sobra nova · 19% vira refugo
```

As três partes somam 100%. O plano também mostra o refugo total do corte em %.

**R10 — Escolher a sobra que gera menos refugo.** Entre as sobras que comportam
as peças, a escolha passa a ser: prioridade da condição (íntegra antes de
defeito, como hoje) → **menor área de refugo** → menor área de sobra.

**R11 — Sem limite máximo de perda, por enquanto.** O sistema **não** recusa
sobra por desperdício alto. Durante 30 a 60 dias ele mede, e a tela do plano
mostra o **refugo médio dos cortes dos últimos 30 dias**. O limite é decidido
depois, com esse número (ver §5).

## 5. Fica de fora

- **Limite máximo de perda por sobra** — decidir após 30–60 dias de medição (R11).
- **Painel único de estoque** (rolo + sobra, dinheiro, tempo parado, tipo de
  material) — próxima conversa no Projeto, antes de virar spec.
- **Botão de apagar/anular sobra no dia a dia** — pedido pelo dono, mas as
  regras (quem pode, até quando, diferença para "descartar") não foram
  conversadas. A limpeza de agora é por script (Fase 1). **Editar** já existe
  ("Corrigir", só chefia, só sobra disponível) e não muda aqui.
- Girar peça em tecido com sentido — continua proibido.
- Mudanças em rolo, entrada de rolo e endereços de rolo.

## 6. Dados técnicos de referência

- Tom único hoje: `tecido/dominio/plano.js` → `agrupar()` e
  `encaixarGruposCompletos()`; recusa `tom_unico` na linha ~292.
- Candidatas: `tecido/dados/sobra.js` → `candidatas()` (ordem: prioridade da
  condição, depois menor área).
- Algoritmo puro: `tecido/dominio/encaixe.js` (`planejar`, restos, refugo).
- Numeração da etiqueta: `tecido/dados/etiqueta.js` → `ultimoSeq()` =
  `MAX(seq)`. Por isso a limpeza precisa apagar `etiqueta` e `etiqueta_lote`.
- Tabelas que citam sobra: `etiqueta`, `sobra_correcao`, `sobra_proposta`,
  `plano_faixa`, `plano_recusa`, `sobra.origem_sobra_id`; refugo de descarte em
  `refugo` com `motivo='descarte'`.
- Testes existentes a manter verdes: `cd tecido && npm test` (incluindo
  `tom.test.js`, `sobra.test.js`, `encaixe.test.js`).

## 7. Fases

Cada fase é entregue e testada sozinha.

### Fase 1: limpeza das sobras 🔴 — FEITA em 18/09/2026 (falta rodar no servidor)

> **Como ficou:** `tecido/limpar_sobras.js` + `tecido/teste/limpar_sobras.test.js`
> (11 casos). As regras que parecem bug e não são foram para o
> `tecido/README.md`, seção "A LIMPEZA DE 18/09/2026". Duas coisas que a spec
> não previa e a construção achou:
> - **o corte por data é guarda, não filtro** (ver STATUS);
> - **`DELETE` em tabela com auto-referência**: com `foreign_keys = ON`, apagar
>   *todas* as sobras passa (o FK é conferido no fim da instrução) e apagar
>   *algumas* é recusado. O script solta o `origem_sobra_id` antes, e só o que
>   aponta para sobra que vai sair — limpar a cadeia de uma sobra que fica
>   apagaria a origem de tom que a Fase 3 (R5) vai ler.
- Script `tecido/limpar_sobras.js`: **simula por padrão**, `--aplicar` grava.
- Mostra quantas linhas sai de cada tabela (R1) e qual será a próxima etiqueta.
- Para e lista se achar sobra em corte confirmado (R3).
- `db.backup()` antes de gravar; tudo numa transação só.
- Caminho do banco pelo mesmo mecanismo que o módulo já usa (nada de
  `/opt/expedicao` escrito no código — `teste_caminhos.js`).
- Teste com banco em memória: apaga tudo, recusa quando há sobra usada, e a
  próxima etiqueta impressa sai **S-000001**.
- **Rodar no servidor hoje à noite, depois das etiquetas antigas recolhidas (R2).**
- **Pronto quando:** Sobras vazia, Etiquetas imprime S-000001, refugo sem linha
  de descarte de sobra, rolos intactos.

### Fase 2: mensagem certa no plano 🟡
- R4: lista de sobras que comportam alguma peça e o motivo de não terem entrado.
- **Pronto quando:** o caso do §1 (duas peças do pedido 1, sobra S-000091) diz
  que a S-000091 serve para a peça 0,92 × 1,50 e por que não foi usada.

### Fase 3: tom pela origem + conferência 🔴
- R5: função única "origem de tom" de uma fonte (sobe a cadeia de sobras).
- R6/R7/R8: o plano passa a dividir o pedido entre fontes.
- Tabela nova de conferência (plano, pedido, fonte, usuário, quando), no
  `CREATE` do schema, com migração.
- Botão "Conferi o tecido" por fonte; Confirmar recusa sem todas; recalcular zera.
- Atualizar `tom.test.js` com: mesma origem sem conferência; mutirão + mutirão
  com conferência; sobra + rolo-mãe sem conferência; Confirmar recusado sem
  conferência; recusa "Tom fora" recalcula.
- Atualizar `tecido/README.md` (seção TOM ÚNICO).
- **Pronto quando:** o caso do §1 com sobras do mutirão sai dividido, pede as
  duas conferências e só confirma depois delas.

### Fase 4: desperdício visível e escolha pelo menor refugo 🟡
- R9: porcentagens por sobra e refugo total do plano.
- R10: nova ordem de escolha das candidatas.
- R11: refugo médio dos últimos 30 dias na tela do plano (lê a mesma fonte do
  painel de Refugo; nada de segunda conta).
- Testes: duas sobras que comportam a peça → escolhe a de menor refugo; as três
  porcentagens somam 100%.
- **Pronto quando:** o plano mostra as porcentagens em cada sobra sugerida e a
  média de 30 dias.

## 8. Decisões (para `docs/DECISOES.md`)

- 18/09/2026: sobras cadastradas até esta data são apagadas sem contar como refugo, e a etiqueta de sobra recomeça em S-000001; etiquetas antigas em papel são destruídas antes.
- 18/09/2026: sobras que nasceram do mesmo rolo têm o mesmo tom desse rolo; o pedido pode se dividir entre elas sem conferência.
- 18/09/2026: pedido pode se dividir entre origens de tom diferentes (inclusive sobras do mutirão), com "Conferi o tecido" obrigatório por fonte, gravando quem e quando.
- 18/09/2026: o plano escolhe, entre as sobras que servem, a que gera menos refugo e mostra o desperdício de cada uma; não há limite máximo de perda até haver 30–60 dias de medição.
