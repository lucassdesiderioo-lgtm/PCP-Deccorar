# Manual do sistema: a ficha de cada tela, dentro da tela, para quem a opera

```
STATUS
Situação: PLANEJADO · aguardando a aprovação do dono
Criada em: 21/11/2026
Última atualização: 21/11/2026
Fase atual: nenhuma começou
Fases: 1 ☐  2 ☐  3 ☐  4 ☐  5 ☐
Risco: 🔴 na fase 1 (tela nova, duas permissões novas, botão em toda tela) ·
       🟢 nas fases 2 a 4 (texto) · 🟡 na fase 5 (lista datada em tela)
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
9. **Mudou a ficha, muda `atualizada_em` e entra uma linha em "Mudanças"**, em
   língua de fábrica. É daí que sai o "O que mudou" da 907 (fase 5).
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
| **O que mudou** (fase 5): as linhas de "Mudanças" das fichas da pessoa, dos últimos 30 dias, mais recentes em cima | as fichas | todos |

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
| `GET /api/manual/mapa` | as telas (todas, só nome e módulo) e as ligações; marca quais a pessoa opera | `manual.ler` |
| `GET /api/manual/glossario` | o glossário | `manual.ler` |
| `GET /api/manual/mudancas` (fase 5) | as linhas de "Mudanças" das fichas da pessoa, últimos 30 dias | `manual.ler` |

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

### 8.1 `teste_manual.js` — novo

| Caso | O que trava |
|---|---|
| toda tela do `telas.js` e do `tecido/nucleo/telas.js` (sem os apelidos) tem arquivo em `docs/manual/` | tela nova sem ficha reprova — a régua D6 |
| todo arquivo em `docs/manual/` (fora o glossário) aponta `tela:` que existe no mapa | ficha de tela que saiu fica órfã e reprova — a regra morta por outro lado |
| `situacao: rascunho` só nas telas da lista `RASCUNHOS_INICIAIS` do teste, e a lista só encolhe (compara com a de 21/11/2026) | tela nova nasce `pronta`; rascunho arrumado e ainda na lista reprova |
| ficha `pronta` tem as seções obrigatórias (§3.2), e "Onde entra no fluxo" não é escrita à mão no lugar do gerado | ficha pela metade |
| todo cartão em `cartoes:` existe em `docs/regras/` | regra que deixou de valer quebra a ficha que a citava |
| toda chave em `parametros:` é lida pelo código (varredura dos `.js` por `chave = '…'`) | parâmetro que saiu do sistema |
| toda permissão com `tela: n` tem o `rotulo` dela citado em "Botões e ações" da ficha `n` `pronta` | ação nova sem texto |
| a ficha não contém `R$`, nome de arquivo `.js`/`.html`, `/api/`, nem código de cartão `R-XXX-NN` no corpo | jargão e dinheiro fora |
| o leitor (`manual.js`) é o único que lê `docs/manual/`: nenhuma rota ou tela faz `readFileSync` da pasta | dono único |
| `/api/manual/ficha/:n` de tela que a pessoa não opera volta só nome, módulo e nível — nenhuma seção | D7 |
| `/api/manual/todas` é 403 sem `manual.ver_todas`, mesmo para quem opera todas as telas | D8 |
| o Admin Geral passa (por nível, #29) | — |
| módulo carregado sem escrita: o `teste_quem.js` não ganha rota nova | leitura pura |

Reintroduzir cada defeito, um a um, e anotar quantos casos reprovam (o padrão
dos outros testes).

### 8.2 Os que já existem e passam a cobrir isto

| Teste | O que ganha |
|---|---|
| `teste_mapa.js` | a 907 no mapa, com nível, permissão, módulo e bloco; as duas chaves com `tela: 907` |
| `teste_lugar.js` | a 907 em Administração · Comum, no inventário do teste |
| `teste_cobertura.js` | as seis rotas declaradas no `permDaRota` |
| `teste_acesso.js` | as duas chaves no registro; nasce só para o Admin Geral; `manual.ver_todas` recusada por exceção a quem é Operação |
| `teste_menu.js` | o "?" com `data-perm="manual.ler"` nas duas barras |
| `teste_linguagem.js` | o `texto_visivel.js` passa a varrer **`docs/manual/`** — a ficha é texto que o time lê, e a Regra B vale nela |
| `teste_login.js` / teste de segurança §10 | `/manual` 302 sem login; `/api/manual/*` 401 |
| `teste_quem.js` | continua passando com o módulo novo carregado (zero escritas) |
| `tecido/teste` (`telas_listas.test.js`) | as 17 telas do sob medida com ficha na mesma pasta |
| `testador-tela` (③ REVISÃO) | o "?" num iPad a 768 e 1024: o painel não rola a página de lado, não toma o foco do bipe, fecha e devolve o foco; a 907 a 400 px não rola de lado (`.rolaH` onde houver tabela) |

### 8.3 O papel que o `escrivao-papel` passa a conferir

A tabela do §0 ④ (passo 9) ganha uma linha, **no mesmo commit da fase 1**:

| Se… | Então atualize |
|---|---|
| mexeu em tela, botão, número mostrado ou regra que a tela aplica | a ficha da tela em `docs/manual/`, com `atualizada_em` e uma linha em "Mudanças" |

E o `.claude/agents/escrivao-papel.md` passa a conferir: tela do diff tem ficha
mexida? ação nova tem linha? cartão mudado tem a ficha que o cita mexida?

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
  mostra "O que mudou" (fase 5) para quem abre; empurrar o aviso é outra spec.
- **Mover ou aposentar `docs/ARQUITETURA.md`, `docs/DESIGN.md` e os outros
  documentos antigos.** São de quem edita; fora deste escopo.
- **Tradução** para outro idioma.

---

## 10. Fases

Cada fase fecha inteira, com teste, e pode subir sozinha.

### Fase 1 — a fundação (🔴, pela permissão e pelo botão em toda tela)

- `manual.js` (dono único: ler, validar, montar), `manual_route.js` (as rotas
  da §6, sem escrita), a tela **907 Manual** (`public/manual.html`: busca,
  minhas/todas, mapa, ficha, glossário), o **"?"** nas duas barras
  (`public/nav.js`, `tecido/public/nav.js`), as duas chaves em `permissoes.js`,
  a linha no `telas.js`, `/manual` na lista `TELAS` do `auth.js`, as rotas no
  `permDaRota`.
- **Os 53 arquivos em `docs/manual/` nascem como `rascunho`** (só o cabeçalho
  com `tela`, `titulo`, `cartoes` e `parametros` já preenchidos, porque isso
  se levanta do `CLAUDE.md` e dos cartões), e a lista `RASCUNHOS_INICIAIS` do
  teste nasce com os 53. A 907 e o "?" mostram a tarja *"ficha ainda não
  escrita"* e, mesmo assim, o fluxo gerado e as ações.
- `glossario.md` com os termos do §16 reescritos para o time.
- `teste_manual.js` completo (§8.1) e os acréscimos da §8.2. Teste escrito
  **antes** do código (risco 🔴).
- A linha nova na tabela do §0 ④ e no `escrivao-papel`.
- ⚠️ **Sobe sem ser apresentada ao time.** Até a fase 2 ela existe para o teste
  já cobrar tela nova e para o dono conferir a tela. Manual que abre vazio na
  primeira vez ensina a não abrir de novo.

### Fase 2 — as fichas da bancada (🟢, texto)

Produção e Expedição, onde a bancada vive: **101 Revisão, 102 Embalagem, 103
Subir PDF de vendas, 104 Problemas, 105 Painel da TV, 106 Material extra, 201
Etiqueta de Venda, 202 Conferência, 204 Pendências, 205 Correções, 206 Horários
de coleta, 251 Devoluções — receber, 303 Inventário.** As treze saem da lista de
rascunhos.

- Cada ficha é escrita a partir dos cartões e do `CLAUDE.md` da área, **na
  língua da fábrica**, e lida pelo dono antes de subir — ele é quem sabe como a
  bancada fala.
- **É aqui que o manual é apresentado ao time**, e o dono marca `manual.ler`
  nos setores (§7).
- **Prova com dado real:** um operador abre o "?" na Etiqueta de Venda num
  tablet e lê o que a tarja "sem estoque — precisa produzir" quer dizer; uma
  dúvida de verdade da semana respondida pelo manual em vez de pelo colega.

### Fase 3 — o escritório (🟢, texto)

Planejamento (401), Estoque (301, 302), Pós-venda (252, 253), Cadastros
(402–404, 902, 1101–1103), Almoxarifado (502–504, 1201), Compras (501),
Fiscal (1301, 1302), Relatórios (904, 905), Administração (901, 906, 907 — a
ficha do próprio manual). A lista de rascunhos fica só com o sob medida.

### Fase 4 — o sob medida (🟢, texto)

As 17 telas 6xx, escritas com o `tecido/README.md` e `docs/regras/sobmedida.md`
na mão. A lista `RASCUNHOS_INICIAIS` **zera**, e a partir daí `rascunho` reprova
em qualquer tela.

### Fase 5 — "O que mudou" (🟡)

A seção "Mudanças" das fichas vira a lista **"O que mudou"** da 907 (os
últimos 30 dias, das telas da pessoa) e a rota `GET /api/manual/mudancas`. É a
resposta ao número que *"quebrou de um dia para o outro"* sem ninguém avisar.
Nenhuma chave nova: é parte de `manual.ler`.

---

## 11. O que conta como provado

| Fase | Prova |
|---|---|
| 1 | o `teste_manual.js` reprova uma tela acrescentada ao mapa sem ficha (conferido reintroduzindo); `/manual` dá 302 sem login no servidor; o "?" aparece para o Admin Geral e para ninguém mais antes da marcação |
| 2 | a bancada abre o "?" num tablet da fábrica (não num Chromium) e a ficha aparece sem tomar o foco do bipe; uma dúvida real respondida pelo manual, anotada pelo dono |
| 3 e 4 | zero rascunhos; o dono leu as fichas e disse que é assim que a fábrica fala |
| 5 | uma regra mudada aparece em "O que mudou" no dia do deploy dela |

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
