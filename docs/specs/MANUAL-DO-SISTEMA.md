# Manual do sistema: a ficha de cada tela, dentro da tela, para quem a opera

```
STATUS
Situação: EM CONSTRUÇÃO · aprovada pelo dono em 21/11/2026 ("pode seguir, monte o PLANO da fase 1")
Criada em: 21/11/2026
Última atualização: 26/11/2026 (fase 1 no ar)
Fase atual: 1 NO AR desde 22/11/2026 (PR #362) — a fundação: 907, "?", seis rotas, 53 fichas
            em rascunho, glossário, retrato, teste_manual.js (115) e teste_manual_tela.js (55).
            Ainda não provado com dado real: a 907 aberta pelo dono no servidor, /manual 302
            sem login, o "?" só para o Admin Geral.
            ⚠️ NÃO é apresentada ao time antes da fase 2 (§10). Próxima: fase 2.
Fases: 1 ☑  2 ☐  3 ☐  4 ☐  5 ☐
Divergências na construção (valem sobre o texto da spec):
  D-C1 o retrato fotografa o CARTÃO INTEIRO (título, regra, exceções, teste, status),
       e não só a linha "Regra:" — mudar a exceção de um cartão também cobra a linha
       na ficha. É mais estrito que a §3.3 regra 9 escrevia, e no mesmo sentido.
  D-C2 o retrato guarda a LISTA inteira das linhas de "Mudanças", e "linha nova" é a
       lista de antes continuar inteira com pelo menos uma a mais (③ REVISÃO de
       22/11/2026; a primeira versão comparava data e texto da linha mais recente, e
       editar o texto dela passava por linha nova, e a linha datada pelo dia da regra
       numa ficha mais nova era recusada). Duas linhas no mesmo dia contam. Sem
       retrato.json é recusa (--primeiro-retrato grava um do zero de propósito), e a
       ficha com mais de uma linha que não está no retrato também (entrada apagada).
  D-C6 a ficha de tela que a pessoa não opera volta {n, nome, modulo, bloco, nivel,
       opera:false}, e o mapa traz bloco, nivel, situacao e sobmedida de toda tela: são
       os rótulos públicos do mapa de telas, os mesmos do ☰ Menu — nenhuma seção,
       ação, SKU, cliente ou valor. A §6 e os casos C2/C5 leem-se assim.
  D-C7 o parâmetro tem NOME na ficha: `parametros: chave = Nome para quem lê`; a chave
       sozinha reprova (chave de banco em tela). O segredo da config (backup_token,
       senha, chave cifrada) nunca é parâmetro: reprova e não viaja. (§3.3 regra 7)
  D-C8 o "Onde entra no fluxo" leva só as telas numeradas do `liga`: as strings do
       mapa ('skus', 'lote') são nome de tabela e não chegam à ficha. Não há "Também usa".
  D-C9 o "?" só pergunta a ficha a quem tem manual.ler (pelo /api/telas/minhas que o
       nav.js guarda); o ✕ do painel não recebe o foco (na 251 e na 303 a tela não puxa
       o bipe de volta); [[Termo]] abre o glossário no termo (#termo=); a busca em
       "Todas as telas" alcança o que a chave dá; o mapa mede o nome contra a caixa e
       escreve a tela não operada em #5a6472.
  D-C10 (2ª rodada e testador de tela) a linha de "Mudanças" que estava no retrato e
       sumiu ou mudou é recusa mesmo com o corpo igual (a linha é registro); o apelido do
       termo é uma régua só (MANUAL_FICHA.apelidoTermo, sobre o texto cru); o "?" lê o
       global window.TELAS_MINHAS que os dois nav.js gravam (o MENU do sob medida vive num
       IIFE, e o "?" não nascia lá); as ações do sob medida entram uma vez (o permissoes.js
       já as traz com a tela); chips e link do painel com 44 px (DESIGN.md §4).
  D-C3 o "?" não toma o foco: na bancada a tela puxa o bipe de volta ("o bipe não
       pode ficar sem dono", Etiqueta de Venda), e o painel é leitura — o leitor
       continua funcionando com ele aberto; fechar devolve o foco a quem o tinha.
  D-C4 a rota da ficha aceita `aqui?rota=/operador` (é o que o "?" pergunta); são as
       mesmas seis rotas da §6.
  D-C5 a prova D7 ("não cancela a revisão") foi feita como "não apaga o digitado nem
       rouba o foco de um campo comum": o campo de bipe processa o que entra como um
       bipe, e a revisão de verdade pede o servidor inteiro. A prova na bancada é da
       fase 2.
Risco: 🔴 na fase 1 (tela nova, duas permissões novas, botão em toda tela, o retrato) ·
       🟢 nas fases 2 a 4 (texto) · 🟡 na fase 5 (o ponto no "?")
Depende de: ACESSO-POR-TELA-E-NIVEL (o mapa de telas, o nível, a tela de Acessos pelo mapa)
             ORGANIZACAO-DO-SISTEMA (módulo, bloco e `liga` em toda tela; o menu único)
             ARRUMAR-O-LUGAR fase 1 (o padrão da caixinha por tela na tela de Acessos)
Conferida contra: o `main` de 19/11/2026 (PR #356) — 36 telas no `telas.js`, 17 no
                  `tecido/nucleo/telas.js`, 72 permissões, 358 cartões em `docs/regras/`
Tipo: NOVIDADE
Conversa de desenho: 10/09/2026 (dez perguntas respondidas) · 19 a 21/11/2026 (o intuito,
                     a revisão do que estava escrito e a decisão do acesso)
```

---

## Em uma frase

Toda tela do sistema ganha uma **ficha em língua de fábrica** — para que serve,
onde entra no fluxo, o que cada botão faz, o que cada número quer dizer —, que a
pessoa lê **de dentro da própria tela** pelo botão **"?"** ou na tela **907
Manual**, vendo só o que ela opera; e **nenhuma tela, botão ou regra nova sobe
sem a ficha**, porque o teste recusa, do mesmo jeito que hoje recusa tela sem
linha no mapa.

---

## Onde mora

| O quê | Módulo | Bloco | Número | Liga-se a |
|---|---|---|---|---|
| Tela **Manual** | Administração (900) | Comum | **907** | todas as telas das duas operações, pelo botão "?" de cada uma; lê o `telas.js`, o `tecido/nucleo/telas.js`, o `modulos.js`, o `permissoes.js` e o `config` |
| O botão **"?"** na barra de sessão | não é tela: é um botão do `nav.js` das duas operações, como o ☰ Menu | — | — | abre a ficha da tela em que a pessoa está |
| As **fichas** | não são tela: são arquivos em `docs/manual/`, um por tela, lidos pelo servidor | — | — | — |

Nenhuma aba nova. Nenhum módulo novo nem inaugurado: a 907 entra em
Administração, que existe, ao lado da 906 Parâmetros. O 903 continua vago
(R-TEL-02); a 907 é o próximo número livre da faixa.

---

## 1. O problema

O sistema tem **três lugares** que descrevem como ele funciona, e **nenhum deles
chega ao time**:

| Lugar | Para quem foi escrito | O time lê? |
|---|---|---|
| `CLAUDE.md` (4.600 linhas) | quem edita código, antes de editar | não |
| `docs/regras/` (358 cartões) + `docs/historia/` | quem edita código: o cartão cita rota, tabela e teste | não |
| `docs/DECISOES.md` | o dono, meses depois | não |

Quem opera a bancada aprende a tela com o colega, e o colega aprendeu com
outro. A dúvida "por que a tela diz isso" não tem onde ser respondida — e o
que o §5 e o §7 do `CLAUDE.md` já registraram várias vezes é o que acontece
depois: **quem não entende a tela acha que ela está errada, e quem acha que ela
está errada contorna** (armadilha #6, #10, #20). O manual existe para fechar
essa porta antes de ela abrir.

O segundo problema é o da **regra morta**: até setembro havia um
`docs/REGRAS-DE-NEGOCIO.md` escrito para pessoas que ensinava o formato
`BK + largura + altura + COR`, extinto em 23/08, e a "foto do estoque",
removida na Fase 3. Documento que pretende ser atual e não está ligado ao código
envelhece calado, e quem lê confia. Ele foi aposentado (`docs/arquivo/`), mas o
que o substituiu (`docs/regras/`) é para quem edita. **Um manual novo para o time
só pode nascer se tiver o mesmo gancho que os cartões têm: um teste que reprova
quando o texto e o sistema deixam de bater.**

O que já existe e o manual **reaproveita, sem copiar**:

| Pergunta | Quem já responde hoje |
|---|---|
| Que telas existem, com número, nome, módulo, bloco e nível | `telas.js` e `tecido/nucleo/telas.js` |
| A que cada tela se liga | o campo `liga` de cada tela (R-ORG-07) |
| Que telas **esta pessoa** abre | `GET /api/telas/minhas` — a conta do portão, a mesma do ☰ Menu |
| Que ações (botões com permissão própria) cada tela tem | `permissoes.js`: cada chave diz a `tela` em que pendura, com `rotulo` e `desc` |
| O valor de hoje de cada parâmetro | a tabela `config` (a 906 já os mostra) |
| A regra que vale, com o teste que a trava | os cartões `R-XXX-NN` de `docs/regras/` |
| O que mudou e quando | `docs/DECISOES.md` |

O que **não existe** é o texto em língua de fábrica, a tela que o mostra, o
botão que leva até ele e o teste que o mantém vivo. É só isso que esta spec
constrói.

---

## 2. O que esta spec decide (decisões do dono)

| # | Decisão | Quando |
|---|---|---|
| D1 | **Quem lê o manual é todo mundo que usa o sistema**: operador, supervisor, admin. A ficha é escrita para o operador | 10/09/2026 |
| D2 | **A dúvida é "como funciona, para que serve esta tela e cada botão dela"**, não "qual arquivo é dono" — isso continua no `CLAUDE.md` | 10/09 e 20/11/2026 |
| D3 | **Mapa e ficha, os dois**: o caminho da peça com cada tela pendurada, e a ficha de cada tela | 10/09/2026 |
| D4 | **Sem história.** O "por quê" longo (o Abraão, os 94 fantasmas) fica em `docs/historia/` para quem edita. Na ficha vai a regra e, só onde a regra parece bug para quem opera, **uma frase** de porquê | 10/09/2026 |
| D5 | **O sob medida entra no mesmo manual**, uma pasta e uma tela: *"no final vai ser uma coisa só, então já vamos crescer organizado"* | 10/09/2026 |
| D6 | **Mudou a tela, muda a ficha, no mesmo commit** — a régua de manutenção, aceita pelo dono: *"sim sim, faz total sentido"* | 10/09/2026 |
| D7 | **Cada pessoa vê só as fichas das telas que ela opera**: *"não faz sentido a bancada ter acesso a tudo, para ela também não se perder"* | 21/11/2026 |
| D8 | **"Ver todas as telas" é uma permissão**, marcada na tela de Acessos como as outras — *"a opção de ver todas, ou assinalar igual no controle de acesso"* | 21/11/2026 |
| D9 | **O manual tem busca, a ficha começa pelo objetivo da tela, lista os botões e há um glossário** — acrescentados na revisão de 20/11, porque o desenho anterior não os tinha | 20/11/2026 |

> ⚠️ **O que "se atualiza sozinho" e o que "não sobe sem" — dito ao dono em
> 20/11/2026, e vale aqui.** Duas partes do manual se atualizam de jeitos
> diferentes. **Sozinho, lido do código na hora:** a lista de telas, número,
> módulo, quem abre, a que se liga, a lista de ações que existem na tela, o
> valor de hoje de cada parâmetro. **Escrito por uma pessoa e travado pelo
> teste:** o texto do objetivo, o que cada botão faz, o que cada número quer
> dizer. Ninguém gera essas frases a partir do código; o que o sistema faz é
> **recusar subir** tela nova sem ficha, ação nova sem texto e regra mudada sem
> a ficha mexida. Na prática dá o mesmo resultado, mas o mecanismo é esse.
>
> **Quem recusa é o retrato** (§3.3 regra 9 e §8.1 B): um arquivo gravado com a
> impressão digital de cada ficha e de cada cartão que ela cita, que o script
> só regrava quando a mudança veio com a linha datada de "Mudanças" — e é
> dessas linhas que a 907 monta o "O que mudou". Sem o retrato, a régua D6
> seria só papel, conferida por um agente de revisão; com ele, é teste.

---

## 3. A ficha

### 3.1 Onde mora e como se chama

Um arquivo por tela, em **`docs/manual/`**, nomeado pelo número e pelo nome da
tela: `101-revisao.md`, `202-conferencia.md`, `602-corte.md`. As telas do sob
medida ficam **na mesma pasta** (D5), pelo número 6xx delas. O glossário é
`docs/manual/glossario.md`.

A pasta fica ao lado de `regras/` e `historia/`, que é a família dela:
`regras/` é o que vale para quem edita, `historia/` é por que passou a valer,
`manual/` é como se usa, para quem opera. Um documento mora em um lugar só: a
ficha **não** repete o cartão, ela **aponta** para ele no cabeçalho.

### 3.2 O formato

```
---
tela: 202
titulo: Conferência
situacao: pronta            # pronta | rascunho
atualizada_em: 2026-11-21
cartoes: R-SEG-01, R-PEC-01, R-REC-01, R-FIM-01
parametros: conf_carregamento
---

## Para que serve
(uma a três frases: o lugar desta tela no caminho da peça, e o que sai dela)

## Onde entra no fluxo
(GERADO pelo manual a partir do `liga` da tela: "recebe de … · manda para …".
 Esta seção não se escreve à mão; o arquivo pode trazer uma frase a mais abaixo
 do gerado, nunca no lugar dele)

## Botões e ações
- **Nome do botão como está na tela** — o que ele faz, em uma ou duas frases.
  Quando o botão só aparece para quem tem uma permissão, dizer qual, pelo
  rótulo da tela de Acessos (nunca pela chave).

## O que a tela mostra
- **Nome do número, da cor ou da tarja como está na tela** — o que quer dizer,
  e o que fazer quando parece errado.

## Por que a tela faz isso
(só o que parece bug para quem opera, uma frase por item: "reimprimir não baixa
 o estoque, porque a baixa já aconteceu na primeira impressão". Sem história.)

## Perguntas frequentes
- **A pergunta como a bancada faz** — a resposta.

## Mudanças
- 21/11/2026 — o que mudou, em uma linha, para quem usa a tela.
```

### 3.3 As regras do formato

1. **Língua de fábrica.** Nenhum nome de arquivo, rota, tabela ou coluna no
   texto. Nenhum código de cartão no corpo (eles ficam no cabeçalho). Botão,
   número e tarja são citados **com o nome que aparece na tela**, porque é por
   ele que a pessoa procura.
2. **Nenhum número em reais** na ficha, e nenhum nome de pessoa. A ficha
   explica o processo, nunca o dado — é isso que permite que ela seja lida sem
   vazar nada.
3. **Vale a Regra B do §20**: a ficha é texto que o time lê. Chefia, chefe,
   patrão, dono e gestão não entram; nomeia-se a etapa ou o nível de acesso.
   O `teste_linguagem.js` passa a varrer `docs/manual/` (seção 8).
4. **A frase de porquê é uma, e só onde a regra parece bug.** O lugar da
   história é `docs/historia/`. Ficha que conta história deixa de ser lida.
5. **`situacao: rascunho` é permitido só para as telas que já existiam em
   21/11/2026**, e a lista delas no teste **só encolhe** (a regra da
   `FORA_DO_LUGAR`, R-ORG-14). Tela nova nasce `pronta` ou não sobe. A ficha
   em rascunho aparece na 907 e no "?" com tarja âmbar *"ficha ainda não
   escrita"* — o vazio se vê, não se esconde.
6. **Toda ação (permissão) que pendura na tela tem uma linha em "Botões e
   ações"**, procurada pelo `rotulo` da permissão. É a cobertura mínima que o
   teste consegue conferir: o botão que não tem permissão própria (o
   "Imprimir" da 201 usa a chave da própria tela) é escrito à mão e o teste não
   o enxerga — vale pela régua D6.
7. **Toda chave de `config` citada em `parametros:` existe no código**, e o
   manual mostra o **valor de hoje** ao lado do nome: a ficha nunca escreve
   "15 segundos", escreve "o tempo mínimo da revisão" e o manual completa com o
   número que vale agora.
8. **Todo cartão citado em `cartoes:` existe em `docs/regras/`.** Cartão que sai
   do arquivo de regras (regra que deixou de valer) quebra a ficha que o
   citava — é o gancho contra a regra morta.
9. **Mudou a ficha, entra uma linha datada em "Mudanças", e o teste cobra.**
   `docs/manual/retrato.json` guarda, por ficha, a impressão digital do corpo
   (tudo menos a seção "Mudanças") e a data da última linha de "Mudanças"; e,
   por cartão citado em alguma ficha, a impressão digital da linha "Regra:"
   dele. `node manual_retrato.js` regrava o retrato e **recusa** quando um
   corpo mudou sem linha nova, quando um cartão mudou e a ficha que o cita
   ficou quieta, ou quando uma ação nova pendurou na tela sem linha. O
   `teste_manual.js` exige que o retrato bata com os arquivos. É daí que sai o
   "O que mudou" da 907, desde a fase 1 — e é isto que faz a régua D6 ser
   teste, e não só papel.
10. **A ficha é lida no boot**, como o `tecido/montar.js` lê as telas (§12,
    "a tela servida é a lida no boot"): editou a ficha, reinicia o servidor. O
    deploy já faz isso.

---

## 4. A tela 907 Manual

Tela de leitura, declarada `onde:'computador'` no mapa (é onde se lê o manual
inteiro); na bancada o caminho é o "?" (§5), que funciona no tablet. Fundo
claro (é operação, `DESIGN.md` §1). Página própria, como a 206 e a 906, com o
`nav.js` da medida padrão.

### 4.1 O que ela mostra

| Parte | De onde vem | Para quem |
|---|---|---|
| **Busca** no topo: por nome de tela, por botão, por palavra do texto, por termo do glossário | as fichas e o glossário lidos no boot, filtrados pelo acesso | todos |
| **Minhas telas**: as fichas das telas que a pessoa opera, agrupadas por módulo → bloco, na ordem do ☰ Menu | `GET /api/telas/minhas` (a conta do portão, #12) e o `modulos.js` | todos — é como a tela abre |
| **Todas as telas**: o manual inteiro, na mesma ordem | idem, sem o filtro | só quem tem `manual.ver_todas` (D8) |
| **O mapa**: o desenho das telas e das ligações, por módulo, com as telas da pessoa em cor e as outras em cinza com só o nome | o `liga` de cada tela, desenhado em SVG pelo navegador — **desenho gerado, não arte** | todos |
| **A ficha** de uma tela: as seções da §3.2, com "Onde entra no fluxo" gerado e os parâmetros com o valor de hoje | o arquivo, o `liga`, o `permissoes.js`, o `config` | quem opera a tela, ou quem tem `manual.ver_todas` |
| **Glossário**: corte, despacho, Pack ID, comprometido, livre, reservado, urgente, adiantado, coleta, agência… | `docs/manual/glossario.md` (o §16 do `CLAUDE.md` é o ponto de partida, reescrito para o time) | todos |
| **O que mudou**: as linhas de "Mudanças" das fichas da pessoa, dos últimos 30 dias, mais recentes em cima, cada uma dizendo a tela | as fichas, pelo retrato (§3.3 regra 9) | todos — desde a fase 1 |

### 4.2 A ligação para uma tela que a pessoa não opera

A ficha da Embalagem diz "recebe da Revisão". Se quem lê não opera a Revisão,
o manual mostra **só o nome da tela, o módulo e o nível de acesso** (*"101
Revisão · Produção · nível Operação — você não opera esta tela"*), e **não** o
conteúdo da ficha. A frase continua legível e o fluxo não quebra na leitura; o
texto fica fechado, como o dono decidiu (D7). Quem tem `manual.ver_todas` abre
a ficha inteira pelo mesmo clique.

> Decidido assim em 21/11/2026, como consequência de D7, e dito ao dono:
> *"quando a ficha aponta para outra tela que a pessoa não opera, o manual
> mostra só o nome da tela e quem a opera, sem o texto"*. Sem isso o "onde
> liga" viraria link morto, que é o que a bancada aprende a não clicar.

### 4.3 O que a tela NÃO faz

- **Não edita ficha.** A ficha mora no repositório e muda por commit, com o
  teste conferindo. Uma tela de edição seria uma segunda fonte de verdade que
  diverge do código no primeiro deploy — a doença que esta spec existe para
  curar. Se um dia a edição pela tela fizer falta, é spec própria.
- **Não mostra valor em reais, saldo, venda nem nome de pessoa.** Ela só lê
  arquivos de texto, o mapa e o `config`.
- **Não grava nada**, e por isso o módulo de rotas dela **não tem escrita**: não
  precisa do `QUEM.portao` (R-ALC-09 vale para escrita), e o `teste_quem.js`
  tem de continuar passando com o módulo novo carregado.

---

## 5. O botão "?" em toda tela

Na **barra de sessão** das duas operações (`public/nav.js` e
`tecido/public/nav.js`), ao lado do ☰ Menu: o botão **"?"**. Ele descobre a tela
em que a pessoa está pela rota (`porRota` do mapa; no sob medida, pela
declaração de lá) e abre a ficha dela **num painel deslizante dentro da própria
página**, nunca em aba nova: as estações do iPad abrem em tela cheia e um
`target="_blank"` cai no Safari sem botão de voltar (§12, TABLETS-E-KIOSK).

- O painel mostra a ficha inteira (as seções da §3.2) e um botão **"Abrir o
  manual"** que leva à 907 na mesma tela.
- Tela sem ficha `pronta` mostra a tarja âmbar *"ficha ainda não escrita"* e,
  mesmo assim, o "Onde entra no fluxo" gerado e a lista das ações — o que o
  sistema sabe sozinho ele mostra sempre.
- O "?" leva `data-perm="manual.ler"`: quem não tem a chave não o vê
  (R-TEL-04; esconder é conforto, quem tranca é a rota).
- O painel **não redesenha a tela** nem toma o foco do campo de bipe ao
  fechar: ele é um elemento à parte, e ao fechar devolve o foco ao campo que o
  tinha (§12, "redesenho periódico apaga o campo"). Abrir o "?" no meio de uma
  revisão em andamento **não** cancela a revisão.
- A tela que ainda não carrega o `nav.js` não ganha o "?": o `teste_linguagem.js`
  já exige o `nav.js` em toda tela interna, então hoje não há nenhuma.

---

## 6. As rotas

Todas de **leitura**, sem escrita, sem corpo. Entram no `permDaRota` (R-ALC-05)
e na varredura do `teste_cobertura.js`.

| Rota | Devolve | Quem |
|---|---|---|
| `GET /api/manual/minhas` | as fichas das telas da pessoa (cabeçalho, seções, ações com rótulo, parâmetros com o valor de hoje, ligações), na ordem do menu | `manual.ler` |
| `GET /api/manual/todas` | o manual inteiro | `manual.ver_todas` |
| `GET /api/manual/ficha/:n` | a ficha da tela `n` se a pessoa a opera ou tem `manual.ver_todas`; senão **só** `{n, nome, modulo, nivel, opera:false}` | `manual.ler` |
| `GET /api/manual/mapa` | as telas (todas, só os rótulos do mapa: nome, módulo, bloco, nível, situação da ficha) e as ligações; marca quais a pessoa opera | `manual.ler` |
| `GET /api/manual/glossario` | o glossário | `manual.ler` |
| `GET /api/manual/mudancas` | as linhas de "Mudanças" das fichas da pessoa, últimos 30 dias, cada uma com a tela | `manual.ler` |

A pergunta "esta pessoa opera a tela `n`?" é **a mesma conta do portão**
(`decidir`, como o `telasDe` do `admin_telas.js`), e no sob medida a do portão
de lá (`abre_tela.js`). Uma segunda régua diria "você opera" numa tela que o
menu não mostra (#12).

**`manual.js` é o dono único** de ler, validar e montar a ficha (cabeçalho,
seções, "Onde entra no fluxo", ações com rótulo, parâmetros com valor). A rota
e o teste usam a mesma leitura: um leitor no teste e outro na rota é a
conferência com régua diferente da que grava (§5, `folha.js`).

---

## 7. Alçada

| O quê | Número · nome | Módulo | Nível | Permissão | Sensível? |
|---|---|---|---|---|---|
| **Tela nova** | 907 Manual (`/manual`) | Administração · Comum | **Operação** | `manual.ler` | não |
| **Ação nova** | Ler o manual | — | Operação | `manual.ler` · pendura na 907 · rótulo *"Ler o manual"* · desc *"Abrir a ficha das telas que a pessoa opera, pelo ? e pela 907"* | não |
| **Ação nova** | Ver todas as telas do manual | — | **Supervisor** | `manual.ver_todas` · pendura na 907 · rótulo *"Ver o manual de todas as telas"* · desc *"Ler a ficha das telas que a pessoa não opera"* | não |
| **Setores novos** | nenhum | | | | |

- **Quem recebe: só o Admin Geral, até o dono marcar** (R-ALC-06). ⚠️ A
  consequência prática: **no dia do deploy ninguém da bancada vê o "?" nem a
  907** até o dono marcar `manual.ler` nos setores. A recomendação é marcá-la
  em **todos** os setores das duas operações na mesma hora do deploy da fase 2
  (quando as fichas da bancada existem), e `manual.ver_todas` nos setores de
  Supervisor e Admin que ele escolher. A spec **não** faz backfill (R-ALC-06,
  a revisão do PR #305).
- **O nível da `manual.ver_todas` é Supervisor** porque o dono disse que a
  bancada não deve ver tudo *"para não se perder"*; o teto do nível (R-NIV)
  impede dá-la por exceção a quem é Operação. Se o dono quiser dá-la a alguém
  de Operação, é decisão dele e muda o nível no registro (uma linha).
- `/manual` entra na lista `TELAS` do `auth.js` (tela fora do `/admin/`,
  armadilha #3 por outra porta, §7-C) e no teste de segurança da §10:
  `/manual` tem que dar **302** sem login, e `/api/manual/minhas` **401**.

---

## 8. Os testes

Todo teste abaixo é escrito **antes** do código da fase que ele trava (risco 🔴
na fase 1), e cada defeito listado é reintroduzido um a um depois de o teste
passar, anotando quantos casos reprovam — o padrão dos outros testes do
projeto.

### 8.1 `teste_manual.js` — novo, o dono do manual

**A. O leitor e o formato** (fase 1)

| # | Caso | O que trava |
|---|---|---|
| A1 | `manual.js` lê os 53 arquivos de `docs/manual/` e o glossário sem erro, e cada um tem `tela`, `titulo`, `situacao`, `atualizada_em`, `cartoes`, `parametros` | cabeçalho pela metade |
| A2 | toda tela do `telas.js` e do `tecido/nucleo/telas.js` (sem apelidos como `/inicio`) tem **um** arquivo, e nenhum número tem dois | tela nova sem ficha; ficha duplicada |
| A3 | todo arquivo (fora o glossário e o retrato) aponta `tela:` que existe num dos dois mapas | ficha órfã de tela que saiu — a regra morta |
| A4 | `situacao: rascunho` só nas telas da lista `RASCUNHOS_INICIAIS` do teste; a lista é comparada com a de 21/11/2026 e **só encolhe** | tela nova nasce `pronta`; rascunho arrumado e ainda na lista reprova (R-ORG-14) |
| A5 | ficha `pronta` tem as seis seções obrigatórias, na ordem, e "Onde entra no fluxo" traz no máximo uma frase além do gerado | ficha pela metade; o gerado substituído à mão |
| A6 | ficha `pronta` tem pelo menos uma linha em "Mudanças", com data `dd/mm/aaaa` | a tela nova chega ao "O que mudou" |
| A7 | todo cartão em `cartoes:` existe em `docs/regras/` (`### R-XXX-NN`) | regra que deixou de valer quebra a ficha que a citava |
| A8 | toda chave em `parametros:` é lida pelo código (varredura dos `.js` por `chave = '…'`) | parâmetro que saiu do sistema |
| A9 | toda permissão com `tela: n` em `permissoes.js` (e o `TELA_DA_CHAVE` do sob medida) tem o `rotulo` citado em "Botões e ações" da ficha `n` `pronta` | ação nova sem texto |
| A10 | o corpo da ficha não contém `R$`, nome de arquivo `.js`/`.html`, `/api/`, `SELECT`, nem código `R-XXX-NN` | jargão e dinheiro fora |
| A11 | o `manual.js` é o único que lê `docs/manual/` (varredura: nenhum outro `.js` faz `readFileSync`/`readdirSync` da pasta) | dono único |
| A12 | o glossário tem um `### Termo` por entrada, sem termo repetido, e todo termo citado em `[[Termo]]` numa ficha existe nele | termo citado e não explicado |

**B. O retrato — é isto que faz o manual não ficar para trás** (fase 1)

`docs/manual/retrato.json` guarda, por ficha, a **impressão digital do corpo**
(tudo menos a seção "Mudanças") e a **data da última linha** de "Mudanças"; e,
por cartão citado em alguma ficha, a impressão digital da linha **"Regra:"**
dele. `node manual_retrato.js` regrava o retrato, e **recusa** quando o que mudou
não veio com a linha que o explica.

| # | Caso | O que trava |
|---|---|---|
| B1 | o retrato bate com os arquivos: toda ficha e todo cartão citado têm a impressão digital gravada igual à de agora | mudou e não regravou o retrato — ou regravou e não subiu |
| B2 | `manual_retrato.js` **recusa** regravar quando o corpo de uma ficha mudou e a data da última linha de "Mudanças" é a mesma do retrato | texto mudado sem a linha de mudança |
| B3 | `manual_retrato.js` **recusa** quando a linha "Regra:" de um cartão mudou e **alguma** ficha que o cita não ganhou linha nova em "Mudanças" | regra mudada e a ficha quieta — a pergunta do dono |
| B4 | `manual_retrato.js` **recusa** quando uma permissão com `tela: n` é nova (não está no retrato) e a ficha `n` não ganhou linha nova | botão novo sem avisar |
| B5 | mudar só a seção "Mudanças" (acrescentar uma linha) **não** pede linha de novo | a linha não exige outra linha |
| B6 | mudar só o cabeçalho (`atualizada_em`, `cartoes`) sem mudar o corpo não pede linha | arrumação não é mudança para quem usa |
| B7 | ficha `rascunho` que vira `pronta` conta como mudança e precisa da linha ("ficha escrita") | a ficha nova chega ao "O que mudou" |
| B8 | `atualizada_em` é maior ou igual à data da última linha de "Mudanças" | data para trás |
| B9 | a data de uma linha de "Mudanças" nunca é maior que hoje | data no futuro |

> ⚠️ **Por que um retrato gravado, e não o `git diff`:** o teste roda no CI e
> no servidor, e nenhum dos dois pode depender da história do git para dizer se
> o papel está em dia — o `teste_mapa.js` já faz assim com o
> `teste_mapa_antes.json`. E **o retrato não se regrava para o teste passar**:
> ele é regravado pelo script, que recusa quando falta a linha; é o mesmo aviso
> do `teste_mapa_antes.json` (*"regravar é apagar a prova"*).

**C. As rotas e o acesso** (fase 1; sobe o módulo de rotas num Express de
mentira, como o `teste_skus.js`)

| # | Caso | O que trava |
|---|---|---|
| C1 | `/api/manual/minhas` devolve exatamente as fichas das telas que `telasDe` devolve para a pessoa — a conta do portão, pessoa a pessoa com o banco de exemplo do `perfis_acesso.js` | uma segunda régua (#12) |
| C2 | `/api/manual/ficha/:n` de tela que a pessoa não opera volta **só** `{n, nome, modulo, bloco, nivel, opera:false}` — nenhuma seção, nenhuma ação (D-C6) | D7 |
| C3 | `/api/manual/ficha/:n` de tela que opera volta a ficha com as ações (rótulo e desc da permissão) e os parâmetros com o **valor de hoje** do `config` | o número vivo |
| C4 | `/api/manual/todas` é 403 sem `manual.ver_todas`, mesmo para quem opera todas as telas; com a chave, volta as 53 | D8 |
| C5 | `/api/manual/mapa` volta todas as telas só com os rótulos do mapa (nome, módulo, bloco, nível, situação), as ligações do `liga`, e `opera:true` só nas da pessoa (D-C6) | o mapa não vaza texto |
| C6 | `/api/manual/mudancas` volta as linhas de "Mudanças" dos últimos 30 dias **só das telas da pessoa**, mais recentes em cima, e cada linha diz a tela | o "O que mudou" segue D7 |
| C7 | sem login, as seis rotas são 401; o Admin Geral passa por nível (#29) | a porta |
| C8 | quem é Operação com `manual.ler` não vê o sob medida que não opera, e quem está só num setor de bancada do sob medida vê as fichas 6xx que o portão de lá deixa | a conta de lá, não a chave escrita (§22) |
| C9 | o módulo carregado não registra nenhuma rota de escrita, e o `teste_quem.js` passa sem ganhar caso | leitura pura |
| C10 | a resposta de nenhuma rota contém `R$`, nome de pessoa do banco de exemplo, saldo ou venda | o manual não carrega dado |

**D. A tela e o "?"** (fase 1, num Chromium de verdade como o
`teste_conferencia_tela.js`; sem navegador diz PULADO)

| # | Caso | O que trava |
|---|---|---|
| D1 | a 907 abre em "Minhas telas" com as telas da pessoa agrupadas módulo → bloco na ordem do `modulos.js`; o botão "Todas as telas" só aparece com `manual.ver_todas` | a abertura e D8 |
| D2 | a busca acha por nome de tela, por nome de botão, por palavra do texto e por termo do glossário, e não acha texto de tela que a pessoa não opera | busca dentro do acesso |
| D3 | clicar numa tela não operada no mapa ou numa ligação mostra o nome, o módulo e o nível e a frase "você não opera esta tela", e nada mais | D7 na tela |
| D4 | a ficha em rascunho mostra a tarja âmbar "ficha ainda não escrita" **e** o fluxo gerado e a lista de ações | o vazio se vê |
| D5 | o "?" aparece nas duas barras para quem tem `manual.ler` e some para quem não tem (`data-perm`) | R-TEL-04 |
| D6 | o "?" na 201 abre a ficha da 201 num painel na mesma página; nenhuma janela nova; fechar devolve o foco ao campo de bipe | o iPad em tela cheia |
| D7 | abrir e fechar o "?" no meio de uma revisão em andamento na 101 não cancela nem reinicia a revisão | não mexe no trabalho |
| D8 | a 907 a 400, 768, 1024 e 1440 px não rola de lado (`scrollWidth ≤ clientWidth`); o painel do "?" a 768 px também não | §12, a coluna `fr` |
| D9 | o painel do "?" não é redesenhado pela atualização periódica da tela (4 s no Carregamento) e não apaga campo digitado atrás dele | §12, o redesenho |
| D10 | o "O que mudou" mostra a linha da ficha mexida no banco de exemplo, com a data e o nome da tela | fase 1 |
| D11 | o console não tem erro ao abrir a 907 nem ao abrir o "?" em cada uma das 36 telas do PCP | a tela em branco |

### 8.2 Os testes que já existem e passam a cobrir isto

| Teste | O que ganha | Fase |
|---|---|---|
| `teste_mapa.js` | a 907 no mapa com nível, permissão, módulo e bloco; `manual.ler` e `manual.ver_todas` com `tela: 907`; o retrato de antes **não** muda (ninguém ganha nem perde tela) | 1 |
| `teste_lugar.js` | a 907 em Administração · Comum, no inventário `INV` do teste | 1 |
| `teste_cobertura.js` | as seis rotas declaradas no `permDaRota`; o boot não acusa rota sem dono | 1 |
| `teste_acesso.js` | as duas chaves no registro; nascem só para o Admin Geral (simulação do deploy); `manual.ver_todas` recusada por exceção a quem é Operação (teto do nível) | 1 |
| `teste_menu.js` | o "?" com `data-perm="manual.ler"` nas duas barras, na lista botão a botão | 1 |
| `teste_linguagem.js` | o `texto_visivel.js` passa a varrer **`docs/manual/`**: a Regra B vale na ficha | 1 |
| `teste_login.js` e o teste de segurança da §10 | `/manual` 302 sem login; `/api/manual/*` 401; `/login` 200 | 1 |
| `teste_quem.js` | continua passando com o módulo novo carregado, zero escritas | 1 |
| `teste_admin_telas.js` | `/api/telas/minhas` continua igual (o manual lê dele, não o muda) | 1 |
| `tecido/teste/telas_listas.test.js` | as 17 telas do sob medida com ficha na mesma pasta; a barra de lá com o "?" | 1 e 4 |
| `teste_atalho.js` | o "?" não é atalho de teclado, e o leitor de código não o dispara | 1 |

### 8.3 O que o `escrivao-papel` e o `revisor-fabrica` passam a conferir

A tabela do §0 ④ (passo 9) ganha uma linha, **no mesmo commit da fase 1**:

| Se… | Então atualize |
|---|---|
| mexeu em tela, botão, número mostrado ou regra que a tela aplica | a ficha da tela em `docs/manual/`, com a linha em "Mudanças", e `node manual_retrato.js` |

O `.claude/agents/escrivao-papel.md` confere: tela do diff tem ficha mexida?
cartão mudado tem a ficha que o cita mexida? o retrato foi regravado? O
`revisor-fabrica` lê a ficha mexida como texto que o time vai ler — e procura o
porquê que virou história e o jargão que escapou do A10.

### 8.4 A ③ REVISÃO de cada fase

| Fase | Revisão |
|---|---|
| 1 (🔴) | `revisor-fabrica` dividido em acesso (as rotas, D7, D8, a conta do portão) e tela (o "?" e a 907); `verificador` em cada achado; `testador-tela` com os três perfis (só medida padrão, só sob medida, as duas) a 768, 1024 e 1440 px |
| 2, 3, 4 (🟢) | não há revisão de código. A revisão é **de leitura**: o dono lê cada ficha antes de subir, e o `revisor-fabrica` procura jargão, história e regra escrita diferente do cartão que a ficha cita |
| 5 (🟡) | `revisor-fabrica` + `verificador`; `testador-tela` no ponto do "?" |

---

## 9. Fica de fora

- **Editar a ficha pela tela.** Spec própria, se um dia fizer falta (§4.3).
- **Foto, vídeo e desenho feito à mão.** O mapa é gerado do `liga`; ilustração
  é outra conversa.
- **O manual de quem edita código.** O `CLAUDE.md`, `docs/regras/` e
  `docs/historia/` continuam como estão. A ficha aponta para o cartão, não o
  substitui.
- **A história e as armadilhas** (D4).
- **Tabela `parametro` com rótulo e explicação** no lugar do `config`
  chave/valor (dívida 12(a) do §14). O manual mostra o valor de hoje ao lado
  do nome que a ficha dá; o registro de parâmetros com rótulo próprio é outra
  spec. Quando ela existir, a 906 e o manual leem do mesmo lugar.
- **Versão impressa ou PDF** do manual. Pode nascer das mesmas fichas depois;
  não está no plano.
- **Avisar o time de uma mudança** (WhatsApp, e-mail, bolinha no menu). A 907
  mostra "O que mudou" para quem abre, e a fase 5 põe o ponto no "?" da tela;
  empurrar o aviso para fora do sistema é outra spec.
- **Mover ou aposentar `docs/ARQUITETURA.md`, `docs/DESIGN.md` e os outros
  documentos antigos.** São de quem edita; fora deste escopo.
- **Tradução** para outro idioma.

---

## 10. Fases — o passo a passo

Cada fase fecha inteira, com teste, e pode subir sozinha. Cada uma começa com
o 📋 PLANO do §0 e termina com o ✅ FECHAMENTO; o que está aqui é o conteúdo
que esses dois blocos vão carregar.

### Fase 1 — a fundação (🔴, pela permissão e pelo botão em toda tela)

**Objetivo:** o manual existe, vazio e travado. A partir deste deploy nenhuma
tela, ação ou regra sobe sem a linha dela no manual.

| Passo | O quê | Arquivo | Teste que trava |
|---|---|---|---|
| 1.1 | Escrever o `teste_manual.js` inteiro (§8.1 A, B, C) **antes do código** — ele nasce vermelho | `teste_manual.js` | — |
| 1.2 | O formato da ficha (§3.2) e o leitor: ler `docs/manual/`, validar o cabeçalho, separar as seções, montar "Onde entra no fluxo" a partir do `liga`, pendurar as ações pelo `permissoes.js` e o `TELA_DA_CHAVE`, preencher o valor de hoje dos parâmetros | `manual.js` (dono único) | A1–A12 |
| 1.3 | Os 53 arquivos em `docs/manual/` como `rascunho`: cabeçalho com `tela`, `titulo`, `cartoes` e `parametros` levantados do `CLAUDE.md` e dos cartões; corpo vazio; "Mudanças" com a linha *"dd/mm/aaaa — ficha criada em rascunho"* | `docs/manual/*.md` | A2, A3, A4 |
| 1.4 | O glossário, com os termos do §16 do `CLAUDE.md` reescritos para o time, e os que a bancada lê na tela e o §16 não tem: comprometido, livre, reservado, em caixa, coleta, agência, caixa de várias, retido, modalidade | `docs/manual/glossario.md` | A12 |
| 1.5 | O retrato e o script que o regrava e recusa | `docs/manual/retrato.json`, `manual_retrato.js` | B1–B9 |
| 1.6 | As rotas de leitura (§6), com a pergunta "opera?" pela conta do portão e, no sob medida, pela de lá | `manual_route.js` | C1–C10 |
| 1.7 | As duas chaves no registro, a 907 no mapa, `/manual` na lista `TELAS` do `auth.js`, as seis rotas no `permDaRota` | `permissoes.js`, `telas.js`, `auth.js`, `acesso.js` | `teste_mapa`, `teste_acesso`, `teste_cobertura`, segurança §10 |
| 1.8 | A tela 907: busca, Minhas/Todas, o mapa em SVG gerado do `liga`, a ficha, o glossário, o "O que mudou" | `public/manual.html` | D1–D4, D8, D10, D11 |
| 1.9 | O "?" nas duas barras com `data-perm="manual.ler"`, abrindo o painel na mesma página e devolvendo o foco | `public/nav.js`, `tecido/public/nav.js` | D5–D7, D9, `teste_menu`, `teste_atalho` |
| 1.10 | O `texto_visivel.js` passa a varrer `docs/manual/` | `texto_visivel.js` | `teste_linguagem` |
| 1.11 | A linha nova na tabela do §0 ④ e no `escrivao-papel`; o §22 ganha a 907; a dívida 18 do §14 anota que o manual é a cobertura das regras para quem opera | `CLAUDE.md`, `.claude/agents/escrivao-papel.md` | `escrivao-papel` |
| 1.12 | Reintroduzir cada defeito um a um e anotar quantos casos reprovam | — | — |
| 1.13 | ③ REVISÃO: `revisor-fabrica` (acesso e tela), `verificador`, `testador-tela` nos três perfis | — | — |
| 1.14 | Deploy fora do horário de expedição, com backup antes; teste de segurança da §10 com `/manual`; `node --check` nos arquivos novos | — | — |

**Fica de fora da fase 1:** texto de ficha nenhuma. **Sobe sem ser apresentada
ao time**: até a fase 2 ela existe para o teste cobrar tela nova e para o dono
conferir a tela. Manual que abre vazio na primeira vez ensina a não abrir de
novo.

**Prova com dado real:** no servidor, o `teste_manual.js` passa; `/manual` dá
302 sem login; o "?" aparece para o Admin Geral e para ninguém mais; o dono
abre a 907, vê as 53 em rascunho e o mapa com as ligações de hoje.

### Fase 2 — as fichas da bancada (🟢, texto)

**Objetivo:** quem está na bancada abre o "?" e lê a tela em que está.

| Passo | O quê |
|---|---|
| 2.1 | Escrever as treze fichas, uma por vez, a partir dos cartões e do `CLAUDE.md` da área: **101 Revisão, 102 Embalagem, 103 Subir PDF de vendas, 104 Problemas, 105 Painel da TV, 106 Material extra, 201 Etiqueta de Venda, 202 Conferência, 204 Pendências, 205 Correções, 206 Horários de coleta, 251 Devoluções — receber, 303 Inventário** |
| 2.2 | Em cada uma: `situacao: pronta`, as seis seções, toda ação da tela em "Botões e ações" (A9), os termos do glossário em `[[…]]`, a linha *"dd/mm/aaaa — ficha escrita"* em "Mudanças" |
| 2.3 | O dono lê cada ficha antes de ela subir — é ele quem sabe como a bancada fala. O que ele mandar mudar, muda |
| 2.4 | `node manual_retrato.js` regrava o retrato (B7); as treze saem da `RASCUNHOS_INICIAIS` (A4) |
| 2.5 | `teste_linguagem.js` limpo nas treze (Regra B); A10 limpo (sem jargão) |
| 2.6 | **A apresentação ao time**, e o dono marca `manual.ler` nos setores das duas operações e `manual.ver_todas` onde quiser (§7) |

**Prova com dado real:** um operador abre o "?" na 201 num tablet da fábrica
(não num Chromium) e lê o que a tarja "sem estoque — precisa produzir" quer
dizer, sem o painel tomar o foco do bipe; uma dúvida de verdade da semana
respondida pelo manual em vez de pelo colega, anotada pelo dono.

### Fase 3 — o escritório (🟢, texto)

**Objetivo:** quem decide na 401, na 301 ou na 204 lê o que cada número diz.

| Passo | O quê |
|---|---|
| 3.1 | Planejamento: **401** (as quatro abas, uma seção "O que a tela mostra" por aba: Vendas por dia, O que produzir, Médias por janela, Planilha × sistema, Corte e separação) |
| 3.2 | Estoque: **301, 302** |
| 3.3 | Pós-venda: **252** (os três tipos de caso e o próximo passo), **253** |
| 3.4 | Cadastros: **402, 403, 404, 902, 1101, 1102, 1103** |
| 3.5 | Almoxarifado: **502, 503, 504, 1201** |
| 3.6 | Compras e Fiscal: **501, 1301, 1302** |
| 3.7 | Relatórios: **904** (uma seção por aba), **905** |
| 3.8 | Administração: **901** (a tela de Acessos explicada para quem a usa: nível, setor, exceção, a caixinha de valores), **906**, e a **907**, a ficha do próprio manual |
| 3.9 | O dono lê; retrato regravado; a lista de rascunhos fica só com as 6xx |

**Prova com dado real:** zero rascunhos fora do sob medida; o dono leu as
fichas e disse que é assim que a fábrica fala; a busca por "comprometido" acha
a 401 e o glossário.

### Fase 4 — o sob medida (🟢, texto)

**Objetivo:** uma coisa só (D5).

| Passo | O quê |
|---|---|
| 4.1 | As 17 fichas 6xx, escritas com o `tecido/README.md` e `docs/regras/sobmedida.md` na mão, na mesma pasta e no mesmo formato |
| 4.2 | As ações do sob medida pelo `TELA_DA_CHAVE` de lá (A9); o fluxo gerado pelo `liga` de lá |
| 4.3 | O dono lê; retrato regravado; **a `RASCUNHOS_INICIAIS` zera** e o A4 passa a reprovar `rascunho` em qualquer tela |
| 4.4 | A ficha da 601 Início e o cartão "O caminho de uma peça" da `inicio.html` dizem a mesma coisa — o cartão aponta para a ficha em vez de repetir |

**Prova com dado real:** o cortador abre o "?" na 602 Corte num tablet e lê o
que "falta bobina" quer dizer; zero rascunhos.

### Fase 5 — a novidade chega a quem opera (🟡)

**Objetivo:** a pessoa descobre que a ficha da tela dela mudou **sem abrir o
manual**.

| Passo | O quê | Teste |
|---|---|---|
| 5.1 | O "?" ganha um ponto quando a ficha da tela atual tem linha em "Mudanças" mais nova que a última leitura **neste aparelho** (`localStorage`, só conveniência, como o `rev_modo`) | o ponto aparece depois de uma linha nova e some ao abrir |
| 5.2 | O ☰ Menu mostra, ao lado da 907, quantas fichas das telas da pessoa mudaram nos últimos 7 dias | a conta é a do `/api/manual/mudancas` (#12) |
| 5.3 | Nenhuma chave nova; nenhuma tela nova; o ponto é só conforto | `teste_menu`, `testador-tela` |

**Prova com dado real:** uma regra muda de verdade, a ficha ganha a linha no
mesmo PR, e no dia do deploy o ponto aparece no "?" da tela na bancada.

### O que acontece, fase a fase, quando algo muda no sistema

| O que mudou | O que o manual exige | Quem cobra |
|---|---|---|
| **Tela nova** no mapa | ficha `pronta` com as seis seções e a primeira linha de "Mudanças" | A2, A5, A6; o retrato (B1) |
| **Ação (permissão) nova** numa tela | linha em "Botões e ações" e linha nova em "Mudanças" da ficha | A9, B4 |
| **Cartão de regra mudou** (a linha "Regra:") | toda ficha que o cita ganha linha em "Mudanças" | B3 |
| **Texto da ficha mudou** | linha em "Mudanças" | B2 |
| **Parâmetro mudou de valor** | nada — o manual mostra o valor de hoje | C3 |
| **Tela saiu do mapa** | a ficha sai (vai para `docs/arquivo/manual/`) | A3 |
| **Parâmetro saiu do código** | sai do cabeçalho | A8 |
| **Cartão saiu de `docs/regras/`** | sai do cabeçalho, e a ficha diz em "Mudanças" o que deixou de valer | A7, B2 |

É esta tabela que responde *"o manual vai se atualizando?"*: **sim para tudo
o que é estrutura** (lido do código, na hora) **e "não sobe sem" para tudo o
que é texto** — a frase da linha de "Mudanças" é a única coisa que uma pessoa
escreve, e o retrato recusa o commit sem ela.

---

## 11. O que conta como provado

| Fase | Prova |
|---|---|
| 1 | o `teste_manual.js` reprova uma tela acrescentada ao mapa sem ficha e um cartão mudado sem a ficha mexida (conferido reintroduzindo); `/manual` dá 302 sem login no servidor; o "?" aparece para o Admin Geral e para ninguém mais antes da marcação; o "O que mudou" mostra as 53 linhas de "ficha criada em rascunho" |
| 2 | a bancada abre o "?" num tablet da fábrica (não num Chromium) e a ficha aparece sem tomar o foco do bipe; uma dúvida real respondida pelo manual, anotada pelo dono |
| 3 e 4 | zero rascunhos; o dono leu as fichas e disse que é assim que a fábrica fala |
| 5 | uma regra muda de verdade, a ficha ganha a linha no mesmo PR, e no dia do deploy o ponto aparece no "?" da tela, na bancada |

Prova que não foi feita se escreve como não feita.

---

## 12. Respostas do dono

**10/09/2026** (dez perguntas): quem lê é todo mundo; a dúvida é "como
funciona cada tela e cada configuração"; mapa técnico e de fluxo, os dois;
"ver o que tem que ser editado" é isso mesmo; acesso para todos, ou melhor,
cada um vendo o manual do que tem acesso; diagramas, boa ideia; a régua
"mudou a tela, mudou a ficha" faz total sentido; sobre os documentos velhos,
*"quero a sua visão mais profissional possível"*; o sob medida entra; história,
*"não vejo sentido ter isso"*.

**19/11/2026:** *"Quero que volte a escrever sobre o manual"* — a retomada,
com o levantamento do que o projeto construiu entre setembro e novembro.

**20/11/2026:** o intuito, nas palavras dele: *"estar a regra de cada tela …
dentro de cada tela eu também consigo ler como funciona … qual é o objetivo da
tela de carregamento, da tela de revisão, da tela de planejamento e os seus
botões … tudo que for novo, esse manual vai se atualizando"*. Da revisão
saíram a busca, o objetivo como primeira seção, os botões e o glossário (D9).

**21/11/2026:** *"não faz sentido a bancada ter acesso a tudo, para ela também
não se perder. Vamos deixar para ela ver só o que ela tem acesso. E a opção de
ver todas, ou assinalar igual no controle de acesso"* (D7 e D8). *"Pode
escrever a spec."*

**21/11/2026, depois da primeira versão:** *"monte a spec completa com todas as
fases … desenhe o passo a passo e todos os testes … me diga se está configurado
para toda atualização de regra e tela nova criar mais uma etapa no 'o que está
de novo' no manual, para o próprio manual ir se atualizando"*. A resposta
honesta foi **não, como estava**: a linha de "Mudanças" era à mão e só um
agente conferia. Daí nasceram o retrato (§3.3 regra 9, §8.1 B), o "O que
mudou" na fase 1 e a tabela "o que acontece quando algo muda" no fim do §10.
