# Conferência da expedição — tela enxuta, fechamento com prova e o que sobrou no fim do dia

> **STATUS: em construção · 03/11/2026 — fase 1 no ar (PR #261); fases 2, 3 e 4 em código, falta subir**
> Desenhada no Projeto do Claude com o Lucas em 03/11/2026. Nada construído.
> Spec aprovada e salva no repositório em 03/11/2026; decisões em `docs/DECISOES.md`.
>
> ⚠️ **O que o código já tem e a spec não diz (achado ao montar o PLANO da fase 1,
> 03/11/2026)** — onde divergir, vale o `CLAUDE.md` (§8-B, cartões R-VIA):
>
> - **A agência já fecha com foto e número** desde 26/09/2026 (fase 4 da
>   `SAIDA-E-DUPLA-CONFERENCIA`, cartões R-VIA-02 e R-VIA-05): a viagem à agência
>   tem foto da tela do atendente **da galeria** (sem `capture`), o número que
>   tem que bater e `saida.liberar` com motivo na divergência. A R2 ("fechava sem
>   prova") não descreve o que está no ar. O que a fase 2 ainda acrescenta: o
>   **"quem levou"** e o fim do segundo bipe "no carro" (R-VIA-01). Por isso a
>   viagem **fica na tela na fase 1** — tirá-la deixaria a agência sem caminho de
>   fechar até a fase 2, o mesmo motivo de as sobras ficarem até a fase 4.
> - **A faixa "SOBRA DO CAMINHÃO" é da saída do caminhão** (R-SAI-02, as sobras
>   declaradas), e não do ↩ Sobrou. Ela faz parte do **Fechar coleta**, que fica.
>   O que sai na fase 4 é a faixa do ↩ Sobrou ("SOBROU — BIPE A ETIQUETA…").
>
> | Fase | O quê | Risco | Situação |
> |---|---|---|---|
> | 1 | Enxugar a tela: lista única com marcação Coleta / Agência | 🟡 | **no ar (03/11/2026, PR #261)**; falta a conferência num dia real |
> | 2 | Fechamento da agência com foto e "quem levou" | 🔴 | **em código (03/11/2026), falta subir** |
> | 3 | Fim do dia: "a coleta não passou" e o selo "de ontem" | 🟡 | **em código (03/11/2026), falta subir** |
> | 4 | Venda cancelada: operador marca, gestão confirma, peça volta ao estoque | 🔴 | **em código (03/11/2026), falta subir** |
>
> **Fase 1 em código (03/11/2026):** saíram da tela os quadros do topo (No
> carro, Faltam no carro, Coleta esperando, Peças adiantadas), o "Conferir carga
> do carro", a linha da central de pendências e — decisão do dono no "pode
> seguir" — o "Ver as que faltam" da pilha, cujas caixas já estão na lista
> única. A lista única (`listaUnica` no `carregamento.html`) junta as listas que
> a rota já manda; **nenhuma rota mudou** (o `saiu_adiantado` e o `carregados`
> ficam na rota, sem tela). Ficaram a viagem à agência e o ↩ Sobrou (ver
> acima). O "Coleta esperando" também saiu: a conta está no cabeçalho de cada
> parte da lista. `teste_carga.js` (67) ganhou a lista única executada.
> Conferida no navegador a 1440 e a 400 px com dado semeado, sem rolar de lado.
> Falta: subir e o dono conferir num dia real.
>
> **Fases 2, 3 e 4 em código (03/11/2026)**, com o "pode seguir com todas as
> fases" do dono. As escolhas que a spec deixava para o PLANO, e como ficaram:
>
> - **Fase 2 — sem tabela nova:** a `saida` ganhou `quem_levou_id` e
>   `quem_levou` (CREATE e ALTER, §17). **Abrir a viagem põe no carro as
>   conferidas de agência de hoje**; o bipe passa a dizer o que **ficou**
>   (`POST /api/viagem/ficou`); o bipe "no carro" virou o botão "Pôr mais uma no
>   carro" (a venda futura mandada adiantada não entra sozinha, #9). A conta
>   congela ao abrir porque a viagem fecha na volta. Quem levou é pessoa
>   **ativa** do cadastro, obrigatória. O fechamento grava `saiu_em`/`saiu_por`
>   como antes — **não** `retirado_em`, que pelo `CLAUDE.md` é só da coleta.
> - **Fase 3 — tabela `fim_dia`** (`fim_dia.js`), uma linha por dia com as
>   caixas da lista; registrar de novo junta. O selo vale do dia seguinte até
>   30 dias. O botão marca **todas** as caixas da lista de agora (agência e
>   coleta), e não uma a uma.
> - **Fase 4 — tabela `cancelamento_caixa`** (`cancel_conf.js`) e a rota do
>   ↩ Sobrou reaproveitada (`POST /api/carregamento/sobra`, agora só separa,
>   com o bipe do SKU de cada persiana mantido). A caixa separada vira o estágio
>   `cancelado` já existente (D1 A da VENDAS-E-MEDIA) e sai das listas; a
>   recusa a devolve. **Chave `cancelamento.confirmar`** (e não
>   `expedicao.cancelamento.confirmar`: as chaves do PCP têm duas partes),
>   sensível, nível `supervisor`, **backfill para os setores Supervisor e Admin**
>   — os mesmos do `saida.liberar`. Quem separou não confirma nem recusa. A
>   confirmação e a recusa aparecem **na própria Conferência** (para quem tem a
>   chave) e são contadas na central de Pendências ("Canceladas da
>   Conferência"). Os motivos (venda cancelada · motorista recusou · outro)
>   continuam, como subtipo da venda cancelada.
> - ⚠️ **"+1 por peça" só se a caixa já baixou** — a R6 diz "cada persiana
>   volta"; vale o `CLAUDE.md` §2 (a caixa não conferida nunca saiu do saldo).
> - A caixa que o caminhão deixou saiu da lista de sobras: é atraso, e a fase 3
>   lhe dá nome.
>
> Testes: `teste_conferencia_expedicao.js` (92, escrito antes das rotas; cinco
> defeitos reintroduzidos, cada um reprovando) e `teste_conferencia_tela.js`
> (38, num Chromium de verdade, o fluxo inteiro de clique). `teste_sobra.js`,
> `teste_saida_agencia.js`, `teste_cancelada.js`, `teste_pendencias.js` e
> `teste_correcao.js` foram ajustados ao comportamento novo. Falta: subir, e a
> prova de fábrica — a primeira viagem fechada com quem levou, o primeiro "a
> coleta não passou" com o selo no dia seguinte, e a primeira venda cancelada
> confirmada por outra pessoa.

---

## 1. O problema

A tela `/carregamento` (Alt+6, "Conferência da etiqueta de venda") acumulou blocos
de fluxos que a operação não usa mais, como o carro, as sobras e as peças adiantadas.
Hoje ela tem **dez blocos**, e a equipe precisa saber quais ignorar. Tela em que
metade se ignora acaba sendo lida pela metade (armadilha #6 do `CLAUDE.md`).

A tela tem **uma função só**, nas palavras do dono:

1. **Conferir** as caixas que já tiveram a etiqueta de venda impressa.
2. **Fechar a saída**: quando o caminhão passa, lançar quantas persianas ele levou.
   Esse número tem que bater com a **foto da tela do celular do motorista**.

E um terceiro momento, que hoje não tem lugar certo:

3. **No fim do dia**, dizer por que cada caixa que sobrou ficou para trás: **a venda
   foi cancelada** ou **a coleta não passou**.

## 2. Como a fábrica trabalha (o que não muda)

- O bipe de conferência é feito **um pouco antes da coleta** ou **quando acaba a
  colagem de etiquetas**.
- **Quem confere é outra pessoa**, não quem colou a etiqueta. Regra atual, e
  está correta.
- **A caixa com mais de um SKU** (pacote, armadilha #23) é conferida do jeito que
  já funciona.
- **A agência é rara.** Lá não há QR do motorista nem código. O atendente bipa as
  caixas no sistema do ML, e o celular dele mostra a quantidade.

## 3. Regras de negócio

| # | Regra | Antes | Depois |
|---|---|---|---|
| R1 | Agência e coleta numa **lista única**, cada caixa com a marcação 🟣 Coleta ou 🚗 Agência | carro e coleta em duas colunas, com contadores próprios | uma lista, uma marcação; a modalidade continua vindo do `carga.js` |
| R2 | **A agência fecha igual à coleta**: foto do celular do atendente, e o número tem que bater | agência fechava pelo bipe "no carro", sem prova | fechamento com foto e número; divergência só passa com confirmação e registro |
| R3 | A foto da agência **vem da galeria** e o fechamento é feito **na fábrica**, por quem levou (na volta) ou por quem recebeu a foto pelo WhatsApp | — | grava **quem fechou** e **quem levou**, que podem ser pessoas diferentes |
| R4 | Caixa que sobrou porque **a coleta não passou** continua esperando e aparece **no topo, com o selo "de ontem"** | sem marcação; ninguém sabia se era cancelamento ou atraso | o operador marca "a coleta não passou hoje", com quem e quando |
| R5 | **Venda cancelada** passa por **duas pessoas**: o operador marca, a **gestão confirma** no ML | "Sobrou — volta para a prateleira" + "Sobras esperando decisão" | marcar não devolve ao estoque; só a confirmação devolve |
| R6 | Na confirmação do cancelamento, **cada persiana da caixa volta ao estoque (+1 por peça)** | — | pacote de 3 peças volta 3, conforme o `lote_item` |
| R7 | A gestão pode **recusar** o cancelamento: a caixa volta para a lista de saída | — | a recusa também fica registrada |

### Por que o cancelamento passa por duas pessoas (R5)

Confirmar devolve peça ao estoque **sem venda na frente**. É a mesma natureza do
`estoque.editar` e do `pacote.assinar`, que já são permissões `sensivel`. Se um único
clique bastasse, um engano do operador, ou uma venda que só *parecia* cancelada,
ficaria invisível no saldo. Enquanto a gestão não confirma, a caixa fica
**separada fisicamente** e fora do estoque.

### Peça sob medida cancelada

Ela **não volta ao estoque**, porque sob medida não tem estoque (§7 e §3 do
`CLAUDE.md`): sem `+1` na embalagem, não pode haver `+1` no cancelamento. A
confirmação registra o cancelamento e a caixa sai da lista; o que fazer com a peça
física fica fora desta spec.

## 4. A tela depois da mudança

**Fica:**

- **Esperando conferência** e **Conferidas**, numa lista única, com a marcação
  🟣 Coleta / 🚗 Agência em cada caixa.
- **Pacotes com mais de um SKU**, como hoje.
- O campo de bipe, como hoje (incluindo a conferência dupla, se estiver ligada).
- **Fechar coleta** (já existe) e **Fechar agência** (novo, fase 2).
- **Fim do dia**: as caixas que sobraram, com os dois destinos (fases 3 e 4).

**Sai:**

| Bloco | Por quê |
|---|---|
| Cards "No carro" e "Faltam no carro" | o carro deixou de ser uma etapa; a agência entrou na lista única |
| Botão "Conferir carga do carro" | idem |
| Card "Peças adiantadas hoje" | não serve à conferência |
| Tarja "N pendências esperando decisão em Admin → Pendências" | pertence ao Admin, não à bancada |
| "Sobrou — a caixa volta para a prateleira" e "Sobras esperando decisão" | substituídos pelo fluxo de cancelamento (fase 4); saem **só** na fase 4, para não ficar um período sem caminho |
| Faixa "O bipe agora: SOBRA DO CAMINHÃO" | idem |

> **Tirar da tela não é apagar a rota.** Na fase 1, as rotas que alimentavam esses
> blocos ficam onde estão, desde que outra tela ainda as use (relógio de despacho,
> TV, relatórios). Quem montar o PLANO confere isso com `grep` antes de remover
> qualquer coisa.

## 5. Fases

### Fase 1: enxugar a tela 🟡

- Remover os blocos da §4, **exceto** o fluxo de sobras (fica até a fase 4).
- Juntar a coluna do carro e a da coleta numa lista única com a marcação, que vem
  do `carga.js` (dono único de "isto é coleta?").
- O bipe continua o mesmo (`POST /api/carregar`) para as duas modalidades.
- **Sem mudança de schema, estoque ou permissão.**
- Teste: `node teste_carga.js` continua passando; caso novo para a lista única
  com as duas modalidades misturadas.

### Fase 2: fechamento da agência 🔴 (schema)

- "Fechar agência" com o **mesmo desenho** do fechamento de coleta (§8-B): número
  informado, foto obrigatória, divergência só com confirmação e registro.
- A foto aceita **câmera ou galeria**. A da coleta continua como está.
- Campo **"quem levou"** (pessoa do cadastro), além de quem fechou (usuário logado).
- O fechamento grava `retirado_em` nas caixas de agência conferidas.
- Schema: `coleta_fechamento` ganha a modalidade e quem levou (`ALTER` no fim,
  junto com o `CREATE`, §17), ou outra tabela, a decidir no PLANO.
- A foto mora em `caminhos.COLETAS`, fora de `lotes/` (prova não expira com o PDF).
- Teste: casos novos no `teste_carga.js` (bateu, não bateu, sem foto recusa,
  "quem levou" obrigatório).

### Fase 3: "a coleta não passou" 🟡

- Bloco **Fim do dia** com as caixas conferidas sem `retirado_em` e as impressas
  sem conferência.
- Botão **"A coleta não passou hoje"**: registra quem, quando e quais caixas.
- No dia seguinte, essas caixas aparecem **no topo com o selo "de ontem"**. Pela
  armadilha #9 elas já não somem; esta fase só dá nome e lugar a elas.
- Caixa sem marcação também continua na lista: sem marcação, o sistema entende
  "não saiu", nunca "cancelada".
- Teste: caixa de ontem aparece em cima e com selo; marcar não muda estágio nem
  estoque.

### Fase 4: venda cancelada 🔴 (estoque e permissão)

- No bloco Fim do dia, cada caixa ganha a opção **"Venda cancelada"**. O operador
  marca, e a caixa vai para **"Canceladas, aguardando confirmação"**. **Não mexe
  no estoque.**
- A gestão confirma (ou recusa) depois de ver o cancelamento no ML. A confirmação:
  - devolve **+1 por peça** (`lote_item`, quando houver) ao estoque, numa transação;
  - grava o motivo, o volume, o cliente, quem marcou e quem confirmou, no mesmo
    padrão do `ajuste_estoque` (§18);
  - tira a caixa da lista de saída, com um estágio ou marca de cancelado a definir
    no PLANO.
- **Sob medida** não soma estoque (§3 desta spec).
- **Permissão nova e sensível**, por exemplo `expedicao.cancelamento.confirmar`.
  São três pontas (armadilhas #13 e #23): chave em `permissoes.js`, linha no
  `permDaRota()` e backfill de quem deve tê-la.
- Remove o fluxo antigo "Sobrou / Sobras esperando decisão", depois de conferir que
  nada mais depende dele.
- Teste **escrito antes**: marcar não mexe no saldo; confirmar soma uma vez só
  (confirmar duas vezes não soma duas); pacote soma por peça; sob medida não soma;
  recusar devolve a caixa à lista; quem não tem a permissão recebe 403.
- Deploy fora do horário de expedição.

## 6. Fica de fora

- Conferir o status da venda **automaticamente pela API do ML**, tanto para o
  cancelamento quanto para a entrega na agência. Pode vir com a integração da API.
- O destino físico da peça **sob medida** cancelada.
- Abrir o PCP no celular fora da fábrica. A agência fecha na fábrica, com a foto da
  galeria.
- Qualquer mudança na conferência de pacote ou na regra de "outra pessoa confere".

## 7. O que entra no `CLAUDE.md` quando terminar

- §8-B: a agência fecha com prova igual à coleta, e a tela tem lista única.
- Nova armadilha: **"cancelada" e "a coleta não passou" são coisas diferentes**, e
  só a primeira mexe no estoque, e só depois da confirmação.
- §15: não deixar o operador devolver ao estoque sem confirmação; não tratar caixa
  sem marcação como cancelada.
