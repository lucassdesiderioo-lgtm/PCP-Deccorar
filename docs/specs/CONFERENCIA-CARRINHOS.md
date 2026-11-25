# CONFERENCIA-CARRINHOS — a 202 Conferência com carrinhos, as barras do dia e a trava do dia seguinte

> **STATUS — 25/11/2026: APROVADA PELO DONO** (*"p1 sim, p2 sim, p3 sim,
> aprovado"*) · **fases 1 e 2 construídas juntas (decisão do dono), falta
> subir** · fase 3 (a trava da 201) não começou. Testes: `teste_carrinhos.js`
> (37), `teste_entrega.js` (28), `teste_conferencia_tela.js` (38, num
> Chromium), `teste_carregamento_tela.js` (10).
>
> **O que mudou na construção** (vale o que está aqui):
> - **"Não achei" na recontagem NÃO volta a caixa para "faltam bipar"** (decisão
>   do dono, 25/11/2026): ela já baixou quando foi conferida. Sai do carrinho,
>   continua conferida, o estoque não mexe, e vira pendência na 204; achada,
>   entra num carrinho pelo bipe sem baixar de novo (R-CRR-04 e 05);
> - a caixa **conferida sem carrinho** (a de antes do deploy, a da página antiga
>   em cache) aparece no filtro "Conferidas sem carrinho" e entra num carrinho
>   pelo bipe, sem baixar de novo;
> - a página antiga em cache (sem a chave `carrinho`) continua conferindo; as
>   rotas da saída do caminhão e da viagem ficam no ar para ela;
> - os cartões novos são **R-CRR-01 a 05** e **R-ENT-01 a 05** (a spec listava
>   R-ENT-01 a 07; a numeração juntou o que era uma regra só). Tipo: `REGRA` + `NOVIDADE` · risco 🔴 (estoque, etiqueta,
> permissão). Desenhada em conversa com o dono em 24/11/2026, com o protótipo
> clicável aprovado (*"ficou bom"*):
> https://claude.ai/artifact/47UkW1LpH96RSss5JQj6AQ
>
> Muda os cartões **R-PIL-01 a R-PIL-05**, **R-SAI-01 a R-SAI-04**, **R-VIA-01**
> e **R-VIA-04** de `docs/regras/carregamento.md`; cria os cartões **R-CRR**
> (carrinho), **R-ENT** (entrega) e **R-TRV** (trava). Quando aprovada, cada
> decisão da §9 vira uma linha em `docs/DECISOES.md`.

---

## 1. O pedido

O dono, 24/11/2026: *"às vezes o pessoal bipa e não termina o processo porque
não está intuitivo"*. A 202 tinha cinco processos abertos ao mesmo tempo
(conferir na área, saída do caminhão, viagem à agência, venda cancelada, fim do
dia), cada um com um modo de bipe próprio. Em 19/11/2026 a limpeza fechou **188
caixas que saíram sem ninguém conferir** — a etapa estava sendo pulada.

Como a fábrica trabalha (dito pelo dono):

- a conferência acontece **quando o processo termina ou quando o caminhão da
  coleta chega**, de uma vez, no lugar dos carrinhos, com notebook ou tablet;
- quem confere e quem entrega ao motorista são, em geral, **pessoas diferentes**,
  cada uma com o seu login (o aparelho é compartilhado, e quem chega troca o
  login — não há PIN no meio do processo);
- existem **dois carrinhos** (A e B; um C pode vir). As caixas bipadas vão para
  eles, e o motorista do ML leva **o carrinho inteiro**, um ou os dois, conforme
  o volume do dia;
- a entrega fecha com a foto da tela do motorista e a quantidade que ele bipou,
  por carrinho ou com os carrinhos juntos;
- a agência sai, em geral, uma vez por dia.

## 2. O que NÃO muda

| Regra | Cartão |
|---|---|
| Só se confere caixa com etiqueta de venda impressa | R-CAR-02 |
| **O estoque baixa no bipe da conferência**, −1 por persiana, uma vez só (`baixa_dominio.js`) | R-EST-03 |
| Quem imprimiu não confere, sem liberação nem para o Admin Geral | R-SEG-01, R-SEG-02 |
| Caixa de várias persianas: bipe de cada peça, com a lista à vista | R-PEC-01 a 05 |
| Cada um com o seu login; toda escrita grava quem fez, e é 401 sem login | R-QUEM-02, `quem.js` |
| Foto + número para fechar; divergência só com `saida.liberar` e motivo | R-SAI-06 |
| Venda cancelada em duas pessoas (separa; outra confirma no ML) | R-REC-01 a 07 |
| "A coleta não passou" registra e não mexe em nada | R-FIM-01 |
| Na agência, fechar exige **quem levou** (pessoa do cadastro) | R-VIA-02 |
| A caixa de agência pode ir no caminhão (agora: entregar o Carro da agência ao motorista) | R-SAI-04 (adaptado) |
| A modalidade é a da etiqueta, e `saiu_por` não a reescreve | R-MOD-01, R-MOD-04 |
| O segundo bipe (SKU) é cego e liga na **906 Parâmetros** (`config.conf_carregamento`) | R-CAR-03 |

> **O segundo bipe passa a ficar LIGADO** (decisão do dono, 24/11/2026). Nenhum
> código muda: o dono liga na 906, como já é possível desde 11/11/2026.

## 3. A tela (o protótipo aprovado)

De cima para baixo, seguindo o caminho da caixa:

1. **As duas barras do dia**
   - **Entrega do dia** — quantas faltam entregar, de todas as caixas do dia,
     com a barra em cores: entregues · nos carrinhos · impressas sem bipe ·
     sem etiqueta ainda. "Do dia" é a **mesma régua da 201** (`fila_dia.js`:
     vence hoje, já venceu, sem data); a venda futura entra quando é bipada.
   - **Bipar o que foi impresso hoje** — etiquetas impressas hoje × bipadas
     (`embalado_em` de hoje). É a conta da pilha (R-PIL-01), em barra.
   - Nenhuma conta nova: os números saem de `fila_dia.js`, `carga.js` e
     `baixa_dominio.js` (#12).
2. **À esquerda, bipar** — o campo de bipe com a mensagem grande e os
   **destinos** (Carrinho A, Carrinho B e **Carro da agência**), cada um com o
   número de caixas e os botões **Recontar** e **Entregar →**.
3. **À direita, a lista das caixas de hoje**, com os filtros Faltam bipar · Nos
   carrinhos · Entregues · Sem etiqueta ainda. Os campos de cada caixa não
   mudam (decisão do dono).
4. **Embaixo, "Outras ações"**: venda cancelada, a coleta não passou e o
   histórico do dia.
5. A faixa **"Carrinho B com 6 — falta entregar"** aparece **só na 202**
   (decisão do dono).
6. O topo mostra *"Segundo bipe (SKU): ligado · muda na 906 Parâmetros"*, só
   leitura.

## 4. As regras novas — o carrinho (R-CRR)

**R-CRR-01 · O destino da caixa conferida é um carrinho, ou o Carro da agência.**
Some "na área" e "no canto". A caixa conferida grava em que destino está
(`lote.carrinho`), além de `conferido_por`/`conferido_em`, como hoje.

**R-CRR-02 · O bipe não tem modo.** A caixa de **coleta** vai para o
**carrinho ativo**; a de **agência** vai sozinha para o **Carro da agência** (o
sistema sabe a modalidade pela etiqueta, `carga.js`). Bipar a **etiqueta do
carrinho** troca o ativo; tocar no carrinho também. Sem carrinho ativo, o bipe
de coleta é recusado dizendo para escolher.

**R-CRR-03 · Os carrinhos são cadastro.** Lista **"Carrinhos da expedição"** na
902 Cadastros (hoje A e B), cada um com a etiqueta de código de barras impressa
de lá. Carrinho novo (o C) aparece na 202 sem mexer em tela. Desativar não
apaga; carrinho com caixa dentro não se desativa.

**R-CRR-04 · Recontagem cega do carrinho.** Botão **Recontar** em cada destino
com caixa. A tela não mostra quantas o carrinho deveria ter. No fim, compara com
a conferência: **bateu** · **faltou** (lista; *achei* → bipa; *não achei* → a
caixa sai do carrinho e volta para "faltam bipar") · **sobrou de outro
carrinho** (*passar para este*). Grava quem recontou, quando e o resultado.
Recontar **não mexe em estoque** (a caixa continua conferida).

**R-CRR-05 · A caixa que ficou no carrinho para o dia seguinte não trava
nada.** Ela continua conferida, no carrinho, e conta como bipada no dia
seguinte (decisão do dono).

## 5. As regras novas — a entrega (R-ENT)

Substitui a **saída do caminhão** (R-SAI-01 a 03) e a **viagem à agência**
(R-VIA-01, R-VIA-04). Uma entrega = uma `saida` (a tabela de hoje), com os
destinos entregues nela.

**R-ENT-01 · Entregar → no próprio destino.** Quem entrega é **quem está
logado** (sem PIN no meio; trocar de pessoa é o login de sempre).

**R-ENT-02 · Antes de entregar, a tela cobra o que falta.** Se há caixa
impressa e não bipada da mesma modalidade, a tela lista: *bipar agora* ou
*seguir assim mesmo*. Nada é marcado como perdido aqui — a caixa continua em
"faltam bipar" (o "Não achei" solto saiu, decisão do dono).

**R-ENT-03 · Escolher os destinos.** Um, ou vários juntos com uma foto só. O
que não foi escolhido continua na fábrica. **Não se bipam sobras**: o carrinho
é a unidade (o motorista leva o carrinho inteiro, decisão do dono).

**R-ENT-04 · Foto e número.** Sem a foto não fecha (`foto.js`, R-SAI-06). A
conta é: *sistema = caixas dos destinos escolhidos*. Na agência, também **quem
levou** (R-VIA-02).

**R-ENT-05 · Não existe "foi sem conferir"** (decisão do dono: *"nessa etapa não
deve ter erro"*). Se o motorista bipou **a mais**, alguma caixa foi sem bipe: a
pessoa **acha a caixa no caminhão e bipa** ali mesmo, com o segundo bipe — ela
é conferida (e baixa) e entra na entrega aberta. Se faltou, **recontar** o
carrinho. Se não fechar de jeito nenhum, só **Liberar com divergência**
(`saida.liberar`, motivo).

**R-ENT-06 · O Carro da agência pode ir ao motorista.** Ele aparece na escolha
dos destinos da entrega de coleta; as caixas saem com `saiu_por='coleta'` e a
`modalidade` não muda (R-MOD-04). A caixa de agência **sem** bipe não vai —
tem que ser bipada antes (R-ENT-05).

**R-ENT-07 · Fechar a entrega** grava, por caixa, `saida_id`, `saiu_em`,
`saiu_por` e `retirado_em`, como a saída de hoje. Não mexe em estoque (a
baixa já aconteceu no bipe).

## 6. As regras novas — a trava do dia seguinte (R-TRV)

**R-TRV-01 · A 201 não imprime etiqueta NOVA enquanto houver caixa impressa em
dia anterior e ainda sem conferência** (fora de qualquer carrinho). Vale **para
todo mundo** (decisão do dono). A tela lista as caixas: cliente, NF e quem
imprimiu, com *"Bipe essas caixas na Conferência para liberar"*.

**R-TRV-02 · A reimpressão nunca trava.** Sem isso a fábrica ficaria presa: a
saída prática de uma caixa que sumiu é pegar outra persiana, **reimprimir** e
bipar. A reimpressão continua **sem motivo** (decisão do dono) e não baixa
(R-EST-04).

**R-TRV-03 · As saídas da trava:**
- a caixa é **bipada na Conferência** (achada, ou refeita com outra persiana e
  a etiqueta reimpressa);
- a caixa é **separada como venda cancelada**;
- **sem persiana para repor**: um Supervisor marca **"caixa não encontrada"**,
  com motivo — a trava solta e a caixa vira **pendência na 204** (a venda está
  parada; decidir com o ML).

**R-TRV-04 · Fica fora da trava:** a caixa conferida no carrinho (R-CRR-05), a
venda cancelada e a separada, a caixa já entregue.

## 7. A persiana que sumiu e foi reposta — o saldo

O que acontece na prática (o dono): a caixa some → pega-se **outra persiana do
estoque** → **reimprime** a etiqueta → bipa na conferência. Resultado: saíram
**duas** persianas da prateleira e o sistema baixou **uma** — o saldo fica **1
acima** do real. Se a caixa perdida **aparecer**, a persiana volta à prateleira
e o saldo volta a bater sozinho; por isso a perda não se lança na hora.

**Decidido (D6, 25/11/2026):** como a reimpressão não pede motivo, **o sistema
reconhece o caso sozinho**: reimprimir uma caixa que está travando a 201
(R-TRV-01) abre uma pendência na 204 — *"Caixa da NF 9901 reimpressa no dia
seguinte: pode haver uma persiana BK160140BEGE perdida"*. Quem resolve é
**Supervisor** (decisão do dono):
- **achei a caixa velha** → a etiqueta velha vai para o lixo, a persiana volta à
  prateleira; o saldo **não mexe** (já está certo);
- **perdida** → abre um **pedido de ajuste −1** no SKU, e **outra pessoa
  aprova** (R-EST-20, que já existe);
- **foi só a etiqueta** (a caixa estava lá, a etiqueta é que estragou) → nada.

## 8. Fases

| Fase | O quê | Risco |
|---|---|---|
| **1** | Cadastro "Carrinhos da expedição" (902) com a etiqueta; os destinos e o bipe sem modo (R-CRR-01, 02, 03); a tela nova com as duas barras e a lista (§3); a recontagem (R-CRR-04) | 🔴 (o bipe baixa estoque) |
| **2** | A entrega por destino (R-ENT-01 a 07), substituindo a saída do caminhão e a viagem; as rotas antigas ficam no ar até os aparelhos recarregarem | 🔴 |
| **3** | A trava da 201 (R-TRV), a saída do Supervisor e a pendência da caixa reimpressa (§7) | 🔴 |

O dono liga o segundo bipe na 906 quando quiser (não depende de fase).

## 9. Decisões do dono (24/11/2026)

| # | Decisão |
|---|---|
| D1 | A conferência é feita de uma vez, ao terminar ou quando o caminhão chega, nos carrinhos |
| D2 | O segundo bipe (SKU) fica **ligado**, e liga/desliga na **906 Parâmetros**, não na 202 |
| D3 | Cada pessoa com o seu login; o aparelho é compartilhado; **sem PIN no meio do processo** |
| D4 | O sistema **só registra** quem conferiu e quem entregou; não impede que seja a mesma pessoa |
| D5 | O motorista leva **o carrinho inteiro** |
| D6 | A reimpressão de caixa que trava a 201 abre a pendência da §7 (confirmado em 25/11/2026) |
| D7 | A agência pode usar carrinho ou não; na tela ela é o "Carro da agência" |
| D8 | Na agência continua escolhendo **quem levou** |
| D9 | **Não existe "foi sem conferir"**: a caixa a mais é bipada no caminhão |
| D10 | "Entrega do dia" usa a régua da 201 |
| D11 | **Trava**: a 201 não imprime etiqueta nova com caixa de dia anterior sem conferência, **para todo mundo**; saída do Supervisor com pendência |
| D12 | A caixa conferida que ficou no carrinho não trava |
| D13 | A faixa "falta entregar" só na 202 |
| D14 | Cadastro **"Carrinhos da expedição"** na 902 |
| D15 | A caixa de agência continua podendo ir no caminhão |
| D16 | A reimpressão continua **sem motivo** |
| D17 | A pendência da caixa perdida é resolvida por **Supervisor** |

| D18 | A **venda futura adiantada** impressa em dia anterior e não bipada também trava a 201 (25/11/2026) |
| D19 | O **sob medida** entra na trava igual às outras caixas (25/11/2026) |

## 10. Onde mora (R-ORG-13)

- **Telas novas:** nenhuma. A **202 Conferência** continua em **Expedição ·
  Comum**, e a **201 Etiqueta de Venda** recebe a trava (Expedição · Comum).
- **Abas novas:** nenhuma.
- **Função nova:** a lista "Carrinhos da expedição" dentro da **902 Cadastros**
  (Cadastros · Comum — o mesmo assunto das outras listas de lá).
- **Liga-se a:** 201 (o que foi impresso), 204 (as pendências novas), 302/301
  (o pedido de ajuste −1), 906 (o segundo bipe).
- **Módulo novo ou inaugurado:** nenhum.

## 11. Alçada (R-ALC-08)

- **Telas novas:** nenhuma.
- **Ações novas:**
  - `expedicao.caixa_nao_encontrada` — nível **Supervisor**, **sensível**, tela
    201 — marcar a caixa que trava a 201 como não encontrada (R-TRV-03) e
    resolver a pendência da caixa reimpressa (§7).
  - Conferir, recontar e entregar continuam em `carregamento.executar`; a
    divergência em `saida.liberar`; o cadastro dos carrinhos em `listas.editar`.
- **Setores novos:** nenhum.
- **Quem recebe:** só o Admin Geral, até o dono marcar na tela de Acessos.

## 12. Testes (a escrever antes do código)

- `teste_carrinhos.js` — o destino pela modalidade, a etiqueta do carrinho
  trocando o ativo, o bipe sem carrinho recusado, a baixa uma vez só por peça,
  a recontagem cega (o número esperado não viaja), o carrinho com caixa que não
  se desativa.
- `teste_entrega.js` — entregar um destino e deixar o outro, a foto obrigatória,
  a caixa a mais bipada durante a entrega, a divergência só com `saida.liberar`,
  quem levou na agência, o Carro da agência indo ao motorista sem mudar a
  modalidade.
- `teste_trava_201.js` — a trava para todo mundo, a reimpressão liberada, as
  três saídas, a caixa no carrinho fora da trava, a pendência na 204.
- E os que já existem: `teste_baixa_conferencia.js`, `teste_carga.js`,
  `teste_saida_coleta.js`, `teste_saida_agencia.js`, `teste_conferencia_expedicao.js`,
  `teste_etiqueta.js`, `teste_livro.js`, `teste_pendencias.js`, `teste_acesso.js`,
  `teste_cobertura.js`, `teste_quem.js`, e o `teste_conferencia_tela.js` (num
  Chromium).
