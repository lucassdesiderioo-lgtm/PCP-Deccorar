# Corte em etapas — confirmar, cortar, guardar, e o histórico de tudo

```
STATUS
Situação: no ar desde 01/10/2026 (PR #165, o dono: "ficou certo") — faltam as provas na fábrica
Criada em: 01/10/2026
Última atualização: 02/10/2026
Fase atual: nenhuma — as sete no ar; a spec vai para docs/arquivo/ depois das quatro provas na fábrica (corte inteiro pelas etapas, correção do corte de 01/10, foto no iPad, S-000091) — o dono mandou seguir com TODAS as fases e subir no fim (01/10/2026)
Fases: 1 ☑  2 ☑  3 ☑  4 ☑  5 ☑  6 ☑  7 ☑
Risco: 🔴 (muda o momento da baixa de rolo e sobra; correção de estoque depois do corte)
Módulo: sob medida (tecido/) — ler tecido/README.md antes de mexer
Substitui: SOBRAS-TOM-E-DESPERDICIO.md (18/09/2026), que foi para docs/arquivo/
Mudanças no caminho:
  · Fase 1 em código (01/10/2026): `dominio/corte_historico.js`, GET
    /api/planos com filtros e GET /api/planos/:id, botão Histórico na tela de
    corte. O detalhe ficou num cartão FORA da tabela (a 400 px, dentro dela,
    saía cortado). A sobra nascida se reconhece por duas portas: o código na
    faixa e, para o resto de pé de uma sobra (que não tem faixa), a origem +
    quem + o mesmo segundo. Falta o deploy e a prova: o corte de 01/10 no
    histórico, com a sobra que o sistema deu como usada.
  · Fase 2 em código (01/10/2026), com as decisões técnicas que a spec
    deixou para o PLANO dela (§6):
      - a etapa mora em `plano.etapa`; `plano.confirmado` continua dizendo
        "baixou o estoque" e só vira 1 no Corte feito (cinco leitores contam
        com esse sentido). Migração 27: os cortes antigos viram `feito` (R28);
      - a RESERVA não tem tabela: é a faixa de um corte aberto;
      - a sobra nascida mora em `sobra_a_guardar` até ser guardada, e não
        como um status novo de `sobra` (que exige endereço NOT NULL);
      - o Corte feito baixa a proposta GRAVADA no corte (`plano.proposta`),
        nunca um plano recalculado na hora;
      - "Voltar ao plano" no ② APAGA o corte (nada foi cortado); cancelar,
        com motivo, é do ③;
      - quem mexe no corte é quem o abriu ou a chefia (chave nova
        `corte.gerir`, do diretor pelo `*`);
      - guardar mostra a medida calculada como texto e a lista vazia — a regra
        "nada pré-selecionado" das sobras (tecido/README.md);
      - a recusa "não usar" continua no planejar; ela vira edição do ③ na
        fase 3.
    Consertado no caminho, porque era o mesmo filtro do Confirmar novo: a
    linha vazia da grade ia para o servidor (`comoNumero('')` é 0) e quem
    preenchia uma linha só levava "A linha 2 esta sem medida valida".
  · Fase 3 em código (01/10/2026). Decisões da construção:
      - os motivos são a lista que já existia (Cadastros → Motivos, a do
        "não usar"); a migração 28 acrescentou "Rolo acabou" e "Medida
        errada". "Tom diferente" já existia como "Tonalidade diferente";
      - a edição vira restrição da entrada e o plano é recalculado pela mesma
        conta; na correção todo item fica preso à sua fonte, e o que mudou de
        fonte é uma PUXADA à parte (junto, o rolo baixaria a menos);
      - a sobra guardada que não nasceu vira `anulada` (não é descarte nem
        refugo); a devolvida volta ao mesmo nível;
      - quem pediu a correção não a aprova — regra da casa aplicada por
        analogia, registrada em DECISOES.md para o dono confirmar;
      - o "não usar" do planejar (antes de confirmar) continua: a spec o
        move para o ③, e no ③ ele existe agora; no ① ele não faz mal e
        poupa um corte confirmado só para recusar uma sobra.
  · Fase 5 em código (01/10/2026). O cadastro de revendas (§6, "o PLANO da
    fase 5 confirma onde ele mora") é a tabela `sm_revenda` do módulo,
    lida por uma porta própria do corte (só id e nome). O tipo é exigido no
    Confirmar, não no calcular: o plano se simula sem tipo. O m² que divide o
    tempo é o das PEÇAS, não o puxado. O painel ganhou a aba "Tempo de corte"
    com os últimos 30 dias. Migração 30 (tipo na linha, plano_pausa,
    tempo_liquido_s e o parâmetro corteTempoMaxHoras = 3 h).
  · Fase 6 em código (01/10/2026). Sem biblioteca: `public/barras_ler.js`, ao
    lado do `barras.js` e lendo pela mesma tabela, aceita só o que fecha o
    dígito verificador do CODE128. Botão 📷 nos quatro campos de bipe de
    sobra, pelo `ui.comCamera` (o código lido entra no campo e segue o
    caminho do bipe). DIVERGÊNCIA: a fase pede testes com FOTOS REAIS (boa,
    tremida, torta), e elas não existem no repositório — os testes desenham
    a etiqueta e a estragam como a câmera estraga. É indício; a prova é o
    iPad da bancada achando a sobra pela foto.
  · Fase 7 em código (01/10/2026). R24: a cada rodada todas as sobras que
    comportam grupos INTEIROS são medidas, e vence condição → menor refugo →
    menor área (o refugo é o que não vira peça nem sobra nova). R22: a lista
    "serve e não entrou" passou a existir também quando o plano usou outra
    sobra, com o motivo novo `outra_sobra` (nomeia a escolhida e o degrau da
    regra que decidiu; gêmea diz que é gêmea). R23: cada sobra usada traz
    `aproveitamento` (usa · vira sobra · refugo, somando 100 — o refugo é o
    resto) e o plano traz `refugo_pct`. R25: `painel.refugoMedio(30)`, da
    tabela `refugo`, só o refugo de corte sobre o consumo dos cortes feitos;
    sem corte na janela é null.
  · Achado na fase 1 e CONSERTADO na fase 4: o plano que continua o pedido no
    rolo do corte anterior (R12) não conferia o tecido — pedido com persianas
    de duas cores mandava puxar do rolo da outra cor.
  · Fase 4 em código (01/10/2026): `dominio/tom.js` (R9), os três degraus da
    divisão (R10) — o pedido só se divide se couber INTEIRO —, a conferência
    no Cortando gravada em `plano_conferencia` (migração 29) e zerada quando
    a edição muda a fonte (R11), e o corte anterior de outra origem pedindo
    conferência mesmo numa fonte só (R12). A sobra do mutirão é sozinha: duas
    do mutirão não têm a mesma origem.
  · 01/10/2026, ao salvar — DIVERGÊNCIA DE FATO, anotada e não corrigida no
    texto: o §1 diz que a SOBRAS-TOM-E-DESPERDICIO "não foi começada". Ela
    teve DUAS fases feitas: a fase 1 (a limpeza) RODOU em produção em
    19/09/2026, 10:21 — 96 sobras e 150 etiquetas apagadas, numeração
    recomeçando em S-000001, com backup —, e a fase 2 (a mensagem do plano,
    o R4 dela) está no código desde 19–21/09 (tecido/README.md, "A NEGATIVA
    QUE NOMEAVA A PRÓPRIA SOBRA QUE SERVIA"). Consequências:
      - a decisão "a limpeza das sobras prevista em 18/09 é cancelada; nada é
        zerado" vale daqui para a frente: a limpeza de 18/09 já aconteceu, e o
        que esta spec cancela é zerar DE NOVO;
      - o R22 (mensagem certa) já está em parte no código; a fase 7 parte do
        que a fase 2 antiga deixou, e não do zero.
```

---

## 1. Problema

Em 01/10/2026 um corte foi confirmado rápido. O plano mandava parte do pedido
para o rolo e parte para uma sobra. O operador cortou o rolo, foi buscar a
sobra e viu que o **tom não batia**. Então cortou **tudo do rolo** e não usou a sobra.

O sistema já tinha dado a baixa no Confirmar, e por isso:

1. **A sobra ficou como "usada"**, mas está inteira, na mão.
2. **O rolo baixou menos** do que de fato saiu dele.
3. **As sobras que iam nascer** foram cadastradas com etiqueta e endereço antes
   de existir: o Confirmar exige isso *antes* do corte.
4. **Não há onde rever o corte.** Os planos confirmados estão gravados
   (`GET /api/planos`), mas nenhuma tela mostra isso.
5. **Não há como corrigir.** Nenhuma tela desfaz ou ajusta um corte confirmado.

E a confirmação é um clique só, fácil de passar sem olhar.

Junto vieram três pedidos que pertencem ao mesmo fluxo:

- ler a etiqueta da sobra com a **câmera do iPad**, para quem está sem leitor;
- medir o **tempo de corte** e chegar ao **tempo por m²** de cliente final,
  revenda e Mercado Livre sob medida;
- tudo o que a spec `SOBRAS-TOM-E-DESPERDICIO.md` já previa (tom pela origem,
  "Conferi o tecido", mensagem certa, desperdício visível). Ela não foi
  começada e mexe no mesmo Confirmar, então entra aqui.

## 2. Objetivo

- O corte vira **etapas**, e o estoque só baixa quando o corte **foi feito**.
- O operador corrige sozinho **durante** o corte. **Depois** dele, corrige
  com aprovação da gestão.
- Toda sobra que nasce é **guardada depois de cortada**, como pendência de
  quem cortou e visível para a gestão.
- **Histórico** de todo corte, com cada edição: quem, quando e por quê.
- **Tempo por m²** por tipo de pedido.
- **Leitura da etiqueta da sobra por foto** no iPad.

## 3. Como funciona na fábrica

```
① PLANEJAR      o operador lança as linhas. Cada linha: medida, pedido e tipo
                (Cliente final · Revenda, escolhida da carteira · ML sob medida)
                → o sistema monta o plano (sobra primeiro, tom pela origem)

② CONFIRMAR     TELA DE RESUMO, uma linha por fonte:
                  "Sobra S-000014 · Haste B, Andar 1, Nível 2 · Cinza → itens 1 e 3"
                  "Rolo R-000032 · Haste A, Andar 2, Nível 1 · Cinza → itens 2 e 4"
                com a cor em destaque quando o pedido usa origens diferentes
                [ CORTAR ]  [ Voltar ao plano ]

③ CORTANDO      o relógio corre (há Pausar / Retomar)
                cada fonte tem o botão "Conferi o tecido"
                edição livre: trocar a fonte de um item, rolo acabou, medida errada…
                o sistema recalcula a cada edição

④ CORTE FEITO   só libera com todas as fontes conferidas
                AQUI baixa o estoque: rolo, sobra usada e refugo, já corrigidos

⑤ GUARDAR       pendência de quem cortou: para cada sobra nascida,
                medir · colar etiqueta · dar endereço
                o operador pode começar outro corte enquanto isso;
                a gestão vê a lista de pendências abertas
```

**Depois do Corte feito**, se aparecer erro, o operador abre **"Pedir
correção"** no histórico, diz o que mudou e a gestão aprova ou recusa.

## 4. Regras de negócio

### Etapas e estoque

**R1 — O estoque baixa no Corte feito, não no Confirmar.** O Confirmar só
trava o plano e abre o corte. Rolo, sobra usada e refugo são gravados no ④,
já com as edições feitas no ③.

**R2 — Um corte aberto por operador.** Enquanto houver um corte no ② ou no
③ em nome dele, o operador não abre outro. Pendência de guardar sobra (⑤)
não impede.

**R3 — O corte aberto reserva suas fontes.** Sobra de um corte em andamento não
é oferecida a outro plano, e o saldo do rolo que outro plano enxerga desconta os
metros reservados. Sem isso, dois operadores pegariam a mesma sobra.

**R4 — Cancelar corte.** Antes do Corte feito o operador pode cancelar. As
reservas se soltam, nada baixa, e o cancelamento fica no histórico com motivo.

### Edição durante o corte (③)

**R5 — Edição livre, sempre com motivo.** O operador pode trocar a fonte de um
item, apontar que o rolo acabou ou marcar que um item foi cortado errado. Cada
edição recalcula o plano e grava **quem, quando, qual item e o motivo**.

**R6 — Os motivos são uma lista editável** (como os motivos de rejeição do
PCP). Lista inicial: *Tom diferente*, *Rolo acabou*, *Medida errada*, *Outro*.
Caso novo entra na lista, sem mexer no sistema.

**R7 — O operador aponta o item, o sistema recalcula os metros.** Ex.: "item 4
saiu do rolo R-000032". O operador não mede o rolo.

**R8 — Medida errada:** o item volta a ser cortado (o sistema escolhe a fonte de
novo) e o pedaço cortado errado **vira sobra marcada "cortada errada"**, que
entra na pendência de guardar como as outras. Se não tiver o tamanho mínimo de
sobra, vira refugo pela regra de sempre.

### Conferência de tom (③)

**R9 — Origem de tom.** Toda fonte tem uma origem de tom:

| Fonte | Origem de tom |
|---|---|
| Rolo | o próprio rolo |
| Sobra que nasceu de rolo | aquele rolo (`origem_rolo_id`) |
| Sobra que nasceu de sobra | sobe pela `origem_sobra_id` até achar o rolo |
| Sobra sem rolo na cadeia (mutirão) | sem origem: cada uma é sozinha |

Peças do mesmo pedido em fontes da **mesma origem** são tratadas como fonte única.

**R10 — Ordem de preferência para um pedido de várias peças:**
1. o pedido inteiro numa fonte só;
2. dividido entre fontes da mesma origem de tom (R9);
3. dividido entre origens diferentes.

Dentro de cada degrau continua valendo "sobra primeiro".

**R11 — "Conferi o tecido" é no Cortando.** O operador só tem a fonte na mão
depois de começar. Cada fonte de um pedido dividido entre **origens diferentes**
tem o botão. Tom não bateu → é uma edição (R5, motivo *Tom diferente*) ali
mesmo. O Corte feito é recusado enquanto faltar conferência, e a mensagem diz
qual. A conferência grava quem, quando, pedido e fonte. Editar o plano zera as
conferências das fontes que mudaram.

**R12 — Pedido já cortado noutro dia.** Continua a regra de hoje: se o pedido já
saiu de um rolo com saldo, o plano continua nele. A origem daquele corte entra
na conta do R9.

### Guardar a sobra (⑤)

**R13 — Etiqueta e endereço saem do Confirmar.** A sobra nasce no Corte feito
como **"a guardar"**, com a medida calculada e em nome de quem cortou. Guardar
é medir (confirma ou corrige a medida), colar a etiqueta e dar o endereço, como
no recadastro: as três coisas no mesmo momento.

**R14 — Sobra "a guardar" não entra em plano.** Sem etiqueta ninguém a acha na
prateleira.

**R15 — A pendência não trava o operador, mas não some.** A tela de corte mostra
as pendências dele no topo. A gestão tem a lista de todas as abertas, com quem
cortou e há quanto tempo.

### Correção depois do Corte feito

**R16 — O operador pede e a gestão aprova.** O pedido de correção diz o que
mudou (mesmas edições do R5, com motivo). Enquanto pendente, **nada no estoque
muda**. Aprovado, o sistema aplica a diferença: a sobra volta a "disponível" no
endereço em que estava, o rolo acerta o saldo, as sobras que não nasceram saem
e o refugo é refeito. Tudo vai para o histórico com quem pediu e quem aprovou.
Recusado, fica registrado com o motivo.

**R17 — Aprovar correção é chave própria e sensível** (mexe no saldo sem corte
na frente), separada de *pedir* correção, que é da bancada.

### Tipo de pedido e tempo

**R18 — Cada linha tem tipo:** Cliente final, Revenda ou ML sob medida. Revenda
é **escolhida da carteira** do cadastro de revendas que já está em uso. Não se
cria uma segunda lista.

**R19 — O tempo do corte é do Cortar ao Corte feito, menos as pausas.**

**R20 — Corte misturado divide o tempo pela área.** Se a revenda foi 60% dos m²
das peças do corte, leva 60% do tempo.

**R21 — Tempo absurdo não entra na média.** Corte com tempo líquido acima de um
parâmetro (padrão 3 h, editável em Parâmetros, com a explicação do que ele muda)
aparece no histórico, mas fica fora do tempo por m². A tela diz quantos ficaram de fora.

### O plano mostra mais

**R22 — Mensagem certa.** Para toda sobra que comporta ao menos uma peça e não
entrou, a tela mostra a sobra, a peça e o motivo (pedido não se separa, recusada,
condição etc.). "Nenhuma sobra comporta" só aparece quando é verdade.

**R23 — Desperdício por sobra:** em % da área, *usa nas peças · vira sobra nova
· vira refugo*, somando 100%, e o refugo total do corte.

**R24 — Escolher a sobra que gera menos refugo:** condição (íntegra antes de
defeito) → menor área de refugo → menor área de sobra.

**R25 — Sem limite de perda por enquanto.** O plano mostra o refugo médio dos
últimos 30 dias, e o limite é decidido depois, com esse número.

### Histórico e câmera

**R26 — Histórico de cortes** com busca por **pedido, dia, operador e sobra**
(bipar ou fotografar uma sobra mostra em que corte foi usada e de qual nasceu).
Cada corte mostra as linhas, as fontes, as etapas com hora, as edições,
conferências e correções.

**R27 — Leitura da etiqueta por foto.** Em todo campo que aceita bipe de sobra
há um botão de câmera: o iPad tira a foto e o sistema lê o código (CODE128) da
imagem. Não leu → diz isso e deixa tentar de novo ou digitar. A câmera ao vivo
fica para depois do HTTPS.

**R28 — Os cortes antigos.** Planos confirmados antes desta spec entram no
histórico como **Corte feito**, com as sobras já guardadas, e podem receber
pedido de correção (R16). É assim que o corte de 01/10/2026 é corrigido.

## 5. Fica de fora

- **Zerar ou limpar o cadastro de sobras.** A limpeza da spec antiga sai. O dono
  confere as sobras depois desta entrega e abre um ajuste à parte.
- **HTTPS e câmera ao vivo** — tarefa separada.
- **Limite máximo de perda por sobra** (R25).
- Relatórios de produtividade além do tempo por m² (por pessoa, por dia etc.).
- Cadastro de revendas: só é lido, não muda.
- Girar peça em tecido com sentido: continua proibido.
- Painel único de estoque (rolo + sobra, dinheiro, tempo parado).

## 6. Dados técnicos de referência

- Confirmar hoje: `tecido/dominio/plano.js` → `confirmar()`. Faz numa
  transação: `sobra.marcarUsada`, `rolo.consumir`, `sobra.criar` das sobras
  geradas (exigindo etiqueta e endereço) e `refugo`. **Essa transação é a que
  passa para o Corte feito** (R1), sem a exigência de etiqueta e endereço (R13).
- Recusa de sobra antes de confirmar (R16 antigo): `POST /api/planos/recusar` e
  `corte.html` ~linha 360. Ela passa a ser uma das edições do ③.
- Histórico já existente no servidor: `GET /api/planos` → `plano.historico()`.
- Tom único hoje: `plano.js` → `agrupar()` e `encaixarGruposCompletos()`.
- Candidatas: `tecido/dados/sobra.js` → `candidatas()`.
- Algoritmo: `tecido/dominio/encaixe.js`.
- Sobra: `status` = `disponivel | usada | descartada`. Precisa de **a guardar**
  (R13) e de reserva (R3), em coluna própria ou estado. Decisão do PLANO da fase 2.
- Movimento de rolo: `movimento_rolo.referencia` = id do plano.
- Permissões: `tecido/nucleo/permissoes.js` (`plano.calcular`,
  `plano.confirmar`). Chaves novas: pedir correção (bancada) e **aprovar
  correção** (gestão, sensível), lembrando das três pontas da armadilha #13.
- Leitura de CODE128: `tecido/public/barras.js` desenha, mas não lê. Ler de foto
  é código novo. Se exigir biblioteca, o PLANO da fase 6 diz qual e por quê.
- Cadastro de revendas: já em uso. O PLANO da fase 5 confirma onde ele mora.
- Migrações numeradas: `tecido/nucleo/schema.js`.
- Testes a manter verdes: `cd tecido && npm test`.

## 7. Fases

Cada fase é entregue e testada sozinha.

### Fase 1: histórico de cortes 🟢
- Tela "Histórico" no corte, lendo `GET /api/planos` (com filtros novos: pedido,
  dia, operador, sobra).
- Detalhe do corte: linhas, fontes, sobras geradas, refugo, quem e quando.
- **Pronto quando:** o corte de 01/10/2026 aparece e dá para ver qual sobra o
  sistema marcou como usada.

> **PLANO da fase 1 (01/10/2026) — aprovado ("pode seguir") e construído.**
>
> - **Só leitura.** Nenhuma escrita, nenhuma tabela nova, nenhuma migração.
>   Risco 🟢 como a spec diz, mas com teste escrito antes, porque a tela vai
>   mostrar estoque e a §2 do `CLAUDE.md` já ensinou o que é tela que mente.
> - `tecido/dominio/plano.js`: `historico(filtros)` passa a aceitar **pedido**
>   (`plano_peca.pedido`), **dia** (`plano.data`), **operador**
>   (`plano.usuario_nome`) e **sobra** (pelo código: o plano em que ela foi
>   usada, por `plano_faixa.sobra_id`, e o plano de onde ela nasceu, por
>   `plano_faixa.sobra_gerada_codigo`). Sem filtro devolve o que devolve hoje.
>   E `detalhe(id)`: as linhas (medida, pedido, em que fonte caíram, e as que
>   não couberam com o motivo), as fontes (rolo ou sobra, com código e
>   endereço), os metros baixados de cada rolo (`movimento_rolo`, referência =
>   plano), as sobras **marcadas como usadas** com o status de **hoje**, as
>   sobras que nasceram com o status de hoje, o refugo, as recusas e quem e
>   quando.
> - `tecido/rotas/planos.js`: `GET /api/planos` com os filtros e
>   `GET /api/planos/:id`, as duas com `plano.calcular`, a chave que quem abre
>   a tela de corte já tem. Nenhuma chave nova.
> - `tecido/public/telas/corte.html`: botão **Histórico** no topo da tela de
>   corte, com a lista (dia, operador, tecido, pedidos, metros, sobras usadas e
>   geradas) e os quatro filtros; tocar abre o detalhe. Campo de sobra aceita
>   bipe e digitação. Tabelas pelo `window.ui.rolaH`, sem formatador próprio.
> - `tecido/teste/historico_corte.test.js`: cada filtro; plano não confirmado
>   fica fora; a peça que não coube aparece com o motivo; a busca por sobra
>   acha os DOIS planos (o que a usou e o que a gerou); o detalhe diz qual
>   sobra o sistema deu como usada. Defeitos reintroduzidos um a um.
> - **Regra de negócio muda? NÃO.**
> - **Teste:** `cd tecido && npm test`, e abrir a tela com banco semeado a 1440
>   e a 400 px medindo `scrollWidth` contra `clientWidth`.
> - **Fica de fora:** estados do corte, cancelar, guardar sobra (fase 2);
>   qualquer correção ou "Pedir correção" (fase 3); câmera (fase 6); tipo de
>   pedido e tempo (fase 5).
> - **A prova:** depois do deploy, o dono abre o histórico e acha o corte de
>   01/10/2026 com a sobra que o sistema marcou como usada. Sem isso a fase não
>   está pronta, mesmo com o teste verde.

### Fase 2: corte em etapas 🔴
- Estados do plano: confirmado → cortando → corte feito (e cancelado).
- Tela de confirmação (§3, ②). A baixa passa para o Corte feito (R1).
- Um corte aberto por operador (R2), reserva das fontes (R3) e cancelar (R4).
- Sobra nasce "a guardar" (R13, R14). Pendências no topo da tela e lista da
  gestão (R15).
- Cortes antigos viram "corte feito" (R28).
- Testes: nada baixa até o Corte feito; sobra reservada não aparece em outro
  plano; cancelar solta tudo; sobra "a guardar" não entra em plano; guardar
  exige medida, etiqueta e endereço.
- **Pronto quando:** um corte vai do Confirmar ao Guardar, o estoque só anda no
  Corte feito e a pendência some quando a sobra é guardada.

### Fase 3: edição durante o corte e correção depois 🔴
- Edições do ③ com motivo da lista editável (R5–R8).
- "Pedir correção" no histórico e tela de aprovação da gestão (R16, R17).
- Testes: trocar a fonte recalcula os metros; medida errada gera sobra "cortada
  errada"; correção pendente não mexe no estoque; correção aprovada devolve a
  sobra ao endereço e acerta o rolo; recusada não muda nada.
- **Pronto quando:** o corte de 01/10/2026 é corrigido pela tela, com
  aprovação, e a sobra volta para o lugar onde estava.

### Fase 4: tom pela origem e "Conferi o tecido" 🔴
- Função única de origem de tom (R9) e divisão do pedido (R10, R12).
- Botão por fonte no Cortando; Corte feito recusado sem conferência (R11).
- Atualizar `tom.test.js` e o `tecido/README.md` (seção TOM ÚNICO).
- **Pronto quando:** um pedido dividido entre sobras de rolos diferentes pede
  as conferências, e "tom diferente" troca a fonte ali mesmo.

### Fase 5: tipo por linha e tempo por m² 🟡
- Tipo e revenda em cada linha (R18).
- Relógio com pausa (R19), divisão por área (R20) e parâmetro de descarte (R21).
- Tempo por m² por tipo no painel do sob medida.
- Testes: corte 60/40 divide o tempo 60/40; pausa não conta; corte acima do
  limite fica fora da média.
- **Pronto quando:** o painel mostra minutos por m² de cliente, revenda e ML.

### Fase 6: leitura da etiqueta por foto 🟡
- Botão de câmera nos campos de bipe de sobra (R27).
- Testes com fotos reais de etiqueta (boa, tremida, torta).
- **Pronto quando:** no iPad, sem leitor, a foto da etiqueta acha a sobra.

### Fase 7: plano mais claro 🟡
- Mensagem certa (R22), desperdício por sobra (R23), escolha pelo menor refugo
  (R24) e média de 30 dias (R25), lendo a mesma fonte do painel de Refugo.
- **Pronto quando:** o caso da S-000091 (duas peças do mesmo pedido) diz qual
  sobra serve e por que não foi usada, e cada sobra sugerida mostra as três
  porcentagens.

## 8. Decisões (para `docs/DECISOES.md`)

- 01/10/2026: o corte do sob medida passa a ter etapas (confirmar → cortando → corte feito → guardar); o estoque de rolo e sobra baixa no Corte feito, não mais no Confirmar.
- 01/10/2026: durante o corte o operador edita o plano livremente, com motivo de uma lista editável; depois do Corte feito, a correção é pedida pelo operador e aprovada pela gestão.
- 01/10/2026: etiqueta e endereço da sobra deixam de ser exigidos no Confirmar; a sobra nasce "a guardar" em nome de quem cortou, fora do plano até ser guardada, e a gestão vê as pendências.
- 01/10/2026: um corte aberto por operador; o corte aberto reserva suas sobras e metros de rolo.
- 01/10/2026: peça cortada na medida errada vira sobra marcada "cortada errada".
- 01/10/2026: "Conferi o tecido" sai de antes do Confirmar e vai para o Cortando; o Corte feito só libera com todas as fontes conferidas.
- 01/10/2026: cada linha do corte tem tipo (cliente final, revenda da carteira, ML sob medida); o tempo do corte, menos pausas, é dividido entre os tipos pela área, e cortes acima de um limite (padrão 3 h) ficam fora da média.
- 01/10/2026: a limpeza das sobras prevista em 18/09 é cancelada; nada é zerado.
- 01/10/2026: a spec SOBRAS-TOM-E-DESPERDICIO.md é absorvida por esta e vai para docs/arquivo/; continuam valendo dela o tom pela origem, a mensagem certa, o desperdício visível e a escolha pelo menor refugo.
