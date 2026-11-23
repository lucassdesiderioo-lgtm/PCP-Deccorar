# EMBALAGEM-PRIORIDADE — o que a 102 embala primeiro, e como a tela se comporta

> **STATUS — 23/11/2026: APROVADA E CONSTRUÍDA (as duas fases), falta subir.** O
> dono deu o "pode seguir" e disse sim aos três pontos (o consumo `hoje` primeiro,
> o defeito na reservada, a reposição e a devolução de SKU vermelho no vermelho).
> Cartões **R-EMB-12** e **R-EMB-13** em `docs/regras/estoque.md`; cinco linhas em
> `docs/DECISOES.md`. Na construção, a rota da prioridade ficou
> `GET /api/montagem/prioridade` (e não `/api/embalagem/...`: o `/embalagem` é a
> Etiqueta de Venda).
>
> Rascunho de 23/11/2026: `REGRA` +
> `NOVIDADE` 🔴 (muda qual linha da fila a embalagem consome, cria a reserva da
> peça e uma tabela nova). Desenho aprovado pelo dono em 22–23/11/2026: a opção A
> com as linhas e as barras da C, e o passo a passo F1–F8 (*"ficou perfeito"*),
> no canvas da conversa. Respostas do dono às perguntas: 7 → (a) o próximo bipe
> decide; 8a → a reserva solta em **5 minutos** sem bipe; 8b → a reserva é da
> **pessoa** (login), não do tablet. Duas fases, uma entrega.
>
> Fora desta spec, por decisão do dono: a tela de Revisão (fica para depois); kit,
> acessório e sob medida (continuam como hoje, fora dos blocos de prioridade).

## 1. O pedido

O dono, 22/11/2026: *"se a gente revisou a persiana e eu tenho persianas na tela
etiqueta de venda que precisa ser embalada para eu poder entregar, significa que
eu preciso colocar essa como prioridade. Essa é a prioridade do dia."* E: *"para
essa pessoa não ficar parada no setor dela, ela pode pegar alguma peça que já foi
revisada e que não é do dia. Só que a partir do momento que uma peça é revisada e
precisa ser entregue no dia, ela tem que entrar como prioridade número 1."*

Hoje a 102 lista a fila por SKU, pela peça revisada há mais tempo
(`GET /api/fila`, `ORDER BY MIN(revisado_em)`), e o bipe final consome a linha
mais antiga do SKU, de qualquer modo. Nada diz à bancada qual peça destrava uma
venda que está parada na Etiqueta de Venda.

## 2. Os quatro blocos

| # | Cor | Bloco | Entra |
|---|---|---|---|
| 1 | vermelho | **Do dia — embalar primeiro** | SKU com **venda de hoje sem peça livre** na Etiqueta de Venda (a `falta` do `tarja_estoque.js`, a mesma conta da tarja "sem estoque") |
| 2 | âmbar | **Pedido de hoje** | peça na fila de modo `hoje` (revisada na tela vermelha) cujo SKU não está no bloco 1 |
| 3 | azul | **Reposição** | peça de modo `estoque`, pela falta do estoque (o abaixo do alvo do `demanda_dominio`) |
| 4 | roxo | **Devolução** | peça de modo `devolucao` (reembalar) |

- **"Do dia" é a régua da Etiqueta de Venda** (`fila_dia.filaDoDia`): vence hoje,
  já venceu ou sem data lida. **Venda futura nunca é vermelha.** Venda cancelada e
  caixa já impressa não contam (o livre já desconta a caixa impressa).
- **Venda parada** = a `falta` do SKU: peças que a fila de hoje pede e o livre não
  cobre (a caixa de várias conta peça a peça, como na tarja). É o número grande da
  linha vermelha.
- **Uma linha do bloco 1 é um SKU**, com a medida e a cor, as vendas paradas e os
  **quadradinhos**, um por peça que a fila de hoje pede daquele SKU:
  verde = coberta pelo livre (já embalada), amarelo = **aqui** para embalar,
  cinza = **na produção** (ainda não revisada), listrado = **sendo embalada** por
  outra pessoa (§5). Embaixo, em texto: *"1 embalada · 2 aqui para embalar · 2 na
  produção"*.
- **O SKU vermelho sem peça aqui continua no bloco**, apagado, dizendo *"na
  produção"*: a bancada vê o que vem, e o vermelho não some só porque a Revisão
  ainda não liberou.
- **No topo do bloco 1, a barra** *"N de M vendas de hoje com peça"*: M = peças
  que a fila de hoje pede (fora o sob medida), N = M − soma das faltas.
- **Toda peça aguardando de um SKU vermelho conta no vermelho**, qualquer que seja
  o modo dela (hoje, estoque ou devolução): embalada, ela vira estoque e destrava
  a venda do mesmo jeito.
- **As linhas dos blocos 2, 3 e 4** mostram SKU, medida, cor, quantas aqui e o
  motivo (*"ordem pede 2 · falta 1"*, *"abaixo do alvo em 6"*, *"reembalar"*), e
  o selo de devolução no 4.

## 3. A ordem

- **Bloco 1:** mais vendas paradas primeiro. **Empate:** o SKU com peça aqui vem
  antes do que só tem peça na produção; persistindo, a peça revisada há mais tempo.
- **Blocos 2, 3, 4:** a falta (o que a ordem do dia ainda pede; o abaixo do alvo),
  maior primeiro; empate, a revisada há mais tempo.
- **A lista não se reordena com uma embalagem aberta** (o redesenho de 4 s já
  espera a embalagem fechar): ela é recalculada no próximo "Pronto".
- **Peça do dia que sai da Revisão entra no bloco 1 na hora** (no próximo
  redesenho), com o selo **NOVA** e a faixa *"Chegou da Revisão uma peça do dia"*
  até o próximo bipe (F6).
- **Sem nenhuma peça do dia aqui** (as do dia estão na produção): a faixa âmbar
  *"Nenhuma peça do dia esperando aqui — embale o bloco 2"* (F7).
- **Todas as vendas de hoje com peça**: a faixa verde *"Todas as M vendas de hoje
  têm peça ✓"*, e o bloco 2 passa a ser a prioridade; se um PDF novo trouxer venda
  de hoje sem peça, o vermelho volta (F8).

## 4. O bipe fora da prioridade — o próximo bipe decide (2-B, pergunta 7a)

Quando a pessoa bipa um SKU que **não é do bloco 1** e há peça do bloco 1 **aqui e
livre** (não reservada por outra pessoa):

- Abre a faixa vermelha, com o som de aviso: *"Tem peça do dia esperando:
  BK140140BEGE (4 vendas paradas). Para trocar, bipe a BK140140BEGE. Para seguir
  com esta, bipe o kit."*
- **Bipou o kit:** segue a embalagem de antes, normalmente. Fica registrado em
  `montagem_evento` (`fora_prioridade`, com o SKU bipado, o SKU do dia que estava
  esperando, quem e quando).
- **Bipou um SKU do bloco 1:** a embalagem de antes é cancelada (a reserva solta,
  §5) e começa a do SKU do dia, com o cronômetro do zero.
- **Os dois botões continuam na faixa** (*"Vou embalar a do dia"*, *"Embalar esta
  mesmo assim"*), para quem preferir tocar — o toque vale o mesmo que o bipe.
- **Nunca trava**: o aviso só pergunta uma vez por embalagem. Embalar fora da
  prioridade é permitido (para a pessoa não ficar parada), só fica registrado.
- O aviso é **só do bloco 1**. Entre os blocos 2, 3 e 4 manda a ordem da lista,
  sem aviso.

## 5. A peça reservada para quem está embalando (perguntas 8, 8a, 8b)

- **A reserva nasce no 1º bipe do SKU**: uma linha `aguardando` daquele SKU fica
  presa no nome da pessoa (id do login, `quem.js`). É **a linha que o bipe final
  vai consumir**, nesta ordem: modo `hoje`, depois `estoque`, depois `devolucao`;
  no mesmo modo, a mais antiga. ⚠️ **Hoje o bipe final pega a mais antiga de
  qualquer modo** — passar a pegar a `hoje` primeiro faz a ordem do dia ser abatida
  mais vezes (R-EMB-03 não muda: só a fila `hoje` abate; muda qual linha sai).
- **Os outros veem** *"2 aqui · 1 sendo embalada pela Ana"*, com o quadradinho
  listrado, e a peça reservada **não conta como aqui** para eles nem para o aviso
  da §4.
- **Sem peça livre do SKU** (todas reservadas por outros): recusa **no 1º bipe**,
  *"A BK140140BEGE que estava esperando já está sendo embalada pela Ana"*, e nada
  abre. Ninguém descobre só no fim.
- **A reserva solta quando:** a embalagem fecha (a linha vira `embalado`); a pessoa
  toca "Cancelar embalagem"; marca "Peça com defeito"; ou passam **5 minutos sem
  nenhum bipe dela** naquela embalagem (o bipe do kit renova). A reserva vencida
  some sozinha — sem cron: quem pergunta a fila descarta as vencidas.
- **A reserva é da pessoa, não do tablet** (8b): se ela abrir a embalagem do mesmo
  SKU em outro tablet, a reserva dela continua (não reserva uma segunda peça). Uma
  pessoa tem **uma** reserva por vez: bipar outro SKU troca a reserva.
- **O bipe final consome a linha reservada**, e não "a mais antiga": a peça que
  sai é a que foi presa no 1º bipe. Se a reserva venceu e outra pessoa pegou a
  peça, o bipe final cai na regra de sempre (outra linha `aguardando` **livre** do
  SKU, ou 409). Na construção (③ REVISÃO): **nunca a reservada por outra pessoa**
  — sem livre, 409 `reservada` para quem não reservou.
- **"Peça com defeito" passa a marcar a linha reservada** (hoje marca a mais antiga
  do SKU, decisão de 22/11/2026). É a mesma ideia — a peça que está na mão —, só
  mais precisa. ⚠️ Confirmar no "pode seguir".
- **A tabela é `embalagem_reserva`** (fila_id único, usuario_id, usuario_nome,
  codigo, desde, ultimo_bipe), no modo teste. Não mexe em saldo.

## 6. O passo a passo da tela (F1–F8, aprovado)

| | Momento | O que a tela mostra |
|---|---|---|
| F1 | Começo | "Pronto — bipe o SKU"; os quatro blocos; a barra do dia |
| F2 | Bipou o SKU | a peça grande para conferir, *"DO DIA · destrava 1 das 5 vendas"*, o cronômetro; a lista compacta, *"embalando agora"*, sem reordenar |
| F3 | Bipou o kit | *"Kit conferido — bipe o SKU para fechar"*, mínimo 0:45 (R-EMB-09) |
| F4 | Embalada | *"Embalada ✓"*, as barras do tempo (R-TEM-01), *"1 venda de hoje destravada — a Etiqueta de Venda já pode imprimir"*, a barra do dia andando; fica até o próximo bipe |
| F5 | Fora da prioridade | a faixa da §4 |
| F6 | Chegou peça do dia | faixa *"Chegou da Revisão uma peça do dia"*, selo NOVA |
| F7 | Do dia só na produção | faixa âmbar *"Nenhuma peça do dia esperando aqui — embale o bloco 2"* |
| F8 | Dia feito | faixa verde *"Todas as M vendas de hoje têm peça ✓"* |

O que **não muda**: os três bipes, o kit obrigatório (R-EMB-01), só persiana da
Revisão (R-EMB-02), os 45 s (R-EMB-09), cancelar (R-EMB-10), peça com defeito
(R-EMB-11), o tempo na bancada (R-TEM-01), o +1 e a baixa de material (§24).
Kit, acessório e sob medida aparecem como hoje, fora dos blocos.

## 7. Quem é o dono de quê

| O quê | Dono |
|---|---|
| "a fila de hoje tem peça livre?" (a falta) | `tarja_estoque.js` (já é) |
| "isto é trabalho de hoje?" | `fila_dia.js` (já é) |
| o livre | `baixa_dominio.reservados` (já é) |
| os blocos, a ordem, a barra, os quadradinhos | **`embalagem_prioridade.js`** (novo; sem conta própria de falta nem de livre — pergunta aos donos acima, #12) |
| a reserva | **`embalagem_reserva.js`** (novo) |

A tela só desenha.

## 8. As fases

1. **Servidor:** `embalagem_prioridade.js` e `GET /api/montagem/prioridade` (os
   blocos prontos); a reserva (`POST /api/montagem/reservar` no 1º bipe,
   `/renovar` no kit; o cancelar e o defeito soltam); o bipe final consome a linha
   reservada; o evento `fora_prioridade`. O `GET /api/fila` de hoje continua
   respondendo igual (a página antiga em cache no tablet não quebra).
2. **Tela 102:** os quatro blocos, as faixas F2–F8, o aviso da §4 com o bipe que
   decide, a recusa da reserva no 1º bipe.

Testes: `teste_embalagem_prioridade.js` (novo — blocos, ordem, empate, venda
futura nunca vermelha, reserva e vencimento, a pessoa em dois tablets, o consumo
`hoje` primeiro, o aviso registrado) e, sem mudar o esperado, `teste_montagem.js`,
`teste_tarja_estoque.js`, `teste_defeito_volta.js`, `teste_tempo_operador.js`,
`teste_ordem_dia.js`, `teste_quem.js`, `teste_cobertura.js`. E o `testador-tela`
na 102 a 1024 e 768 px.

## 9. Onde mora

- **Telas novas:** nenhuma. Tudo na **102 Embalagem** · Produção · Medida padrão,
  que já existe.
- **Abas novas:** nenhuma.
- **Módulo novo ou inaugurado:** nenhum.
- **Liga-se a:** depende da 101 Revisão (a fila) e da 201 Etiqueta de Venda (a
  falta do dia); alimenta a 201 (a peça embalada vira livre).

## 10. Alçada

- **Telas novas:** nenhuma.
- **Ações novas:** nenhuma chave. As rotas novas (`GET /api/montagem/prioridade`,
  `POST /api/montagem/reservar`, `/renovar`) usam `embalagem.executar`, com linha
  própria no `permDaRota`; a leitura também `@admin`, como o `GET /api/fila`.
  As escritas gravam quem pelo `quem.js` (401 sem login).
- **Setores novos:** nenhum.
- Quem recebe: nada novo a dar.
