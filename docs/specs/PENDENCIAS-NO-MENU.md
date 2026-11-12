# Pendências à vista: a etiqueta vermelha no ☰ Menu e o caminho direto de cada tela

```
STATUS
Situação: EM CONSTRUÇÃO · aprovada pelo dono em 12/11/2026 · fase 1 no ar desde 12/11/2026 (PR #346; o dono fez o deploy e disse "deu tudo certo no deploy") · ⚠️ ainda não provado com dado real: o primeiro PDF que retém uma caixa mostrando a caixinha na 103 · fase 2 construída e revisada, falta subir · próxima: fase 3
Criada em: 12/11/2026
Última atualização: 12/11/2026
Fases: 1 ☑  2 ☑  3 ☐
Risco: 🟡 (comportamento de tela e uma rota de leitura nova; não mexe em estoque, permissão, schema do PCP)
Depende de: a central de Pendências (docs/arquivo/CENTRAL-DE-PENDENCIAS.md, a 204)
            o menu único (ORGANIZACAO-DO-SISTEMA, public/menu_telas.js)
Tipo: NOVIDADE
```

### Fase 2 — a etiqueta vermelha no ☰ Menu (12/11/2026, construída, falta subir)

- `pendencias_dominio.minhas` + `GET /api/pendencias/minhas` (`@logado`, quem é
  vem do login): por tela e o total, só números. O desenho é o
  `public/menu_telas.js`, chamado pelos dois `nav.js`; pergunta a cada 60 s, ao
  tocar no ☰ Menu e ao voltar para a aba.
- **Divergência D12 — "pode resolver" é a régua de cada DONO, pessoa a pessoa**,
  e não só a lista `perm` como a §3.1 escrevia (③ REVISÃO): quem pediu o ajuste
  não o aprova, quem contou o SKU não o decide nem faz a 2ª contagem, quem
  marcou a venda cancelada não a confirma, e quem só confere não vê a que espera
  confirmação. A linha da central ganhou `minha(db, pessoa)`, que pergunta ao
  dono (`ajuste_dominio.pendentes`, `inventario_dominio.aprovacao` e `hoje`,
  `cancel_conf.podeDecidir`). Sem isso, a etiqueta nunca zeraria para essa
  pessoa — o motivo do D1.
- **"Inventário — sem acordo" aponta a 302**, onde a decisão mora (a 303 só abre
  com contar/desempatar, e quem tem `contagem.resolver` não via). Vale também
  para a caixinha da fase 1 e para o caminho da central.
- **O portão vem antes da conta**: a linha que a pessoa não resolve nem é contada.
- ⚠️ **Em dúvida, para o dono:** Bloqueados (perm vazia) dá bolinha a todo nível
  Admin que abre a 204, inclusive quem não tem a chave de resolver o card (por
  exemplo `sku.cadastrar`). Restringir é decidir quem resolve cada card.
- `teste_pendencias_menu.js` (43).

### Fase 1 — a caixinha "Abrir em Pendências" (12/11/2026, no ar, PR #346)

- **Quem sabe é o servidor** (`pendencias_vigia.js`, registrado no `server.js`
  antes de qualquer rota): para cada ação da lista `VIGIA` ele conta as linhas
  da central antes e depois, e a resposta de sucesso ganha `pendencias`.
  Nenhuma conta nova (#12). As 12 ações vigiadas são as da tabela §3.2, mais a
  compra rápida e o "fechar pedido com falta" (que também geram as mesmas
  pendências).
- **Quem desenha é o `public/pendencias_aviso.js`**, que o `nav.js` carrega em
  toda tela: embrulha o `fetch`, e o POST com `pendencias` abre a caixa
  vermelha no canto de baixo, que só fecha no ✕ e soma os avisos seguintes.
- **Divergência D9 — a frase mora ao lado da linha da central**
  (`pendencias_dominio.js`, campo `frase`), e não no `pendencias_aviso.js` como
  a §3.2 escrevia: é o servidor que sabe o número, e assim continua um lugar só.
- **Divergência D10 — o botão leva à TELA dona, e não ao card**: as listas das
  telas donas desenham depois de carregar, e a âncora no endereço não acha o
  card. Fica para a fase 2.
- **③ REVISÃO** (`revisor-fabrica` e `testador-tela`), consertado com o teste
  antes: o upload lê o PDF por segundos, e a conta de "antes" somava o que outra
  pessoa fez nesse meio — hoje ele recomeça a conta depois da leitura
  (`req.recontarPendencias`); e a caixinha nova apagava a anterior (a 103 sobe
  vários PDFs seguidos).
- **Divergência D11 — a 251 saiu da caixinha** (decisão do dono, 12/11/2026,
  linha em `docs/DECISOES.md`): a §3.2 a listava, mas toda peça recebida nasce
  esperando a baixa, e a caixa apareceria em toda devolução bipada, sem botão.
  Quem dá a baixa a vê pela 253 e, na fase 2, pela etiqueta do ☰ Menu.
- `teste_pendencias_caminho.js` (65).

## 1. O problema, nas palavras do dono (12/11/2026)

> *"A tela que a gente sobe o PDF, muitas vezes aparece algum errinho … e nesta
> tela não tem nenhum campo que eu clico já para ir em pendências. … Seria
> interessante, toda a tela que tem alguma pendência, na tela de menu, aparecer
> a pendência que está naquela tela. Como se fosse uma etiquetinha vermelha do
> lado."*
>
> *"Coloque algo para quando fizer alguma coisa em uma tela e gerar pendências
> colocar uma caixinha para clicar e ir para a tela de pendência. Isso em todas
> as telas que gerar pendência."*
>
> *"Estou tratando o sistema como um todo e não dividindo mais nada"* — o sob
> medida entra junto.

Hoje a pendência só se acha indo procurar: a central (204) tem o número de cada
lugar, mas ninguém abre a 204 sem motivo. E a tela que **cria** a pendência (a
103 retendo uma caixa, por exemplo) escreve *"libere em Admin → Pendências"* em
texto, sem link.

## 2. As decisões do dono (12/11/2026)

| # | Pergunta | Decisão |
|---|---|---|
| D1 | Que número cada pessoa vê na etiqueta? | **Só o que ela pode resolver**; a 204 continua mostrando tudo |
| D2 | Onde fica a etiqueta? | **Na tela dona da pendência, dentro do ☰ Menu, e no próprio botão ☰ Menu com o total** |
| D3 | Cor | **Sempre vermelho** (aparece só quando o número é maior que zero) |
| D4 | O sob medida | **Entra junto** — o sistema é um só |
| D5 | O caminho direto | **Toda tela que gera pendência mostra, na hora, uma caixinha para clicar e ir à pendência** |
| D6 | A TV e a linha da bancada | **Ficam como estão** |
| D7 | O sob medida, além de boleto, descarte e correção de corte | **Entram também** o pedido de revenda esperando aprovação, o cadastro a conferir e a pendência de produção |
| D8 | Quem vê a etiqueta | **Todo mundo, desde o deploy** — é o que a pessoa já pode resolver, não acesso novo |

**Por que D1 (a recomendação):** uma etiqueta vermelha que a pessoa não pode
resolver nunca zera para ela, e número que não zera vira paisagem — a equipe
aprende a não olhar, e aí a etiqueta de quem PODE resolver também perde o efeito
(CLAUDE.md §5, a central; a armadilha #6). A central (204) continua mostrando o
número de todos os lugares para quem a abre, como hoje: lá é o quadro geral; no
menu é "o que é trabalho seu".

**Por que D3 vermelho sempre:** concordo. A etiqueta só existe quando há o que
fazer; uma segunda cor (âmbar = de hoje) é um detalhe que no menu ninguém lê. Os
dias de espera ficam no texto ao passar o dedo / no título da etiqueta
(*"3 esperando, a mais antiga há 2 dias"*).

## 3. O que se constrói

### 3.1 A etiqueta no ☰ Menu (D1, D2, D3)

- Ao lado do nome de cada tela no menu: **bolinha vermelha com o número** das
  pendências daquela tela que a pessoa pode resolver.
- No botão **☰ Menu** da barra: a bolinha com o **total**, para aparecer sem
  abrir o menu.
- Zero: nada aparece (nem bolinha cinza).
- **Uma conta só (#12):** o número de cada tela sai da **mesma** linha da
  central (`pendencias_dominio.js`), que já pergunta à função da tela dona. A
  linha ganha a **tela dona pelo número do mapa** (hoje ela tem `onde`, com aba
  ou endereço; passa a ter `tela: 204`, `tela: 302`…), e o menu só pendura.
  O teste recusa linha sem tela no mapa.
- **"Pode resolver"** é a lista `perm` da linha, que já existe (é a mesma que a
  central usa para dizer "quem resolve"), mais o portão da tela dona: quem não
  abre a tela não recebe a etiqueta dela.
- **Rota nova de leitura:** `GET /api/pendencias/minhas` → `{ total, por_tela:
  {204: 3, 1201: 1, …} }`. Só números: nenhum SKU, cliente, saldo ou valor
  (a regra da central). `@logado`, e quem resolve é a conta acima.
- **Atualiza a cada 60 s**, fora de qualquer redesenho de tela (§12: o redesenho
  é o que apaga campo digitado), e quando a pessoa abre o menu. Linha que falhou
  ao contar não vira zero: a bolinha mostra "?" e o título diz que não deu para
  contar.

### 3.2 A caixinha "ir para a pendência" (D5)

- Toda ação que **cria** uma pendência responde dizendo quantas criou e qual
  linha da central (`pendencias: [{chave, n}]`), e a tela mostra, logo abaixo da
  resposta, um botão vermelho:

  > ⚠ **2 caixas ficaram retidas** — [ Abrir em Pendências → ]

- O botão leva **direto ao card daquela pendência** (a 204 com a âncora do card,
  ou a tela dona quando a decisão mora nela — o Inventário, a 1201, a 504…).
  Quem não alcança a tela dona vê a frase **sem o botão** e o nome de quem
  resolve (*"quem tem: Liberar recebimento retido"*), como a central já diz.
- Uma frase por tipo, num lugar só (`public/pendencias_aviso.js`, que já existe
  para a bancada), para a 103 não escrever de um jeito e a 502 de outro.

**As telas que geram pendência hoje** (a conferir uma a uma na construção):

| Tela | Ação | Pendência que nasce | Onde se resolve |
|---|---|---|---|
| 103 Subir PDF | upload | volume bloqueado (SKU, divergência, pacote, modalidade), venda sem etiqueta, PDF cuja conta não fecha | 204 |
| 202 Conferência | ✕ Venda cancelada | caixa aguardando confirmação | 202 (card Canceladas) |
| 301 Estoque | pedir ajuste | ajuste esperando outra pessoa | 301 |
| Inventário | terminar SKU | contagem sem acordo | Inventário |
| 402 Cadastro de SKU | salvar sem medida | SKU incompleto | 403 |
| 501 Compras | pedido acima da alçada | pedido aguardando aprovação | 501 |
| 502 Recebimento | contagem ≠ declarado / peso fora | recebimento retido / aviso de peso | 1201 |
| 504 Contagem de material | terminar | contagem esperando aprovação | 504 |
| 1101 Materiais | salvar sem almoxarifado | material sem almoxarifado | 1101 |
| 251 Receber peça | salvar | devolução esperando baixa | 253 |
| 602 Corte (sob medida) | pedir correção | correção esperando outra pessoa | (ver §3.3) |
| 603 Sobras (sob medida) | propor descarte | descarte esperando aprovação | 603 |
| 616 Financeiro (sob medida) | pedir baixa de boleto | baixa esperando aprovação | 616 |

### 3.3 O sob medida entra na central (D4)

O sob medida não tem linha na central hoje. Entram, cada uma pela função do
domínio dele que a tela já usa (sem conta copiada, #12), pela porta entre os dois
bancos (a central lê, não escreve no `tecido.db`):

- baixa de boleto esperando aprovação (`aprovacao.pendentes('baixa_boleto')`) → 616;
- descarte de sobra esperando aprovação (`aprovacao.pendentes('descarte_sobra')`) → 603;
- correção de corte esperando aprovação → a tela onde se aprova;
- **e também (D7):** pedido de revenda esperando aprovação
  (611), cadastro de largura e endereço marcado para conferir (606), pendência
  de produção aberta (612/613).

## 4. Fases

1. **A caixinha nas telas do PCP** — a central ganha `tela` em cada linha; a
   ação que gera pendência devolve `pendencias`; a frase única no
   `pendencias_aviso.js`; começa pela 103 (o caso do dono). 🟡
2. **A etiqueta no menu** — `GET /api/pendencias/minhas`, a bolinha no
   `menu_telas.js` e no botão ☰ Menu, nas duas operações. 🟡
3. **O sob medida na central** — as linhas da §3.3, a etiqueta e a caixinha das
   telas 602, 603, 616 (e as que o dono confirmar). 🟡

## 5. Alçada

- **Telas novas:** nenhuma.
- **Ações (permissões) novas:** nenhuma. O "pode resolver" usa as chaves que cada
  linha da central já declara.
- **Rota nova:** `GET /api/pendencias/minhas` — leitura, `@logado` no
  `permDaRota`, devolve só o que a pessoa resolve, só números.
- **Setores novos:** nenhum.
- Quem recebe: **todo mundo**, desde o deploy (D8), vê a etiqueta **do que já
  pode resolver hoje** — não é acesso novo, é o mesmo acesso mostrado. Exceção ao
  R-ALC-06 decidida pelo dono (linha em `docs/DECISOES.md`).

## 6. Onde mora

- **Telas novas:** nenhuma. **Abas novas:** nenhuma. **Módulo novo:** nenhum.
- A etiqueta é uma função do **menu único** (`public/menu_telas.js`, comum às
  duas operações); a contagem continua na central de Pendências (204, Expedição ·
  Comum), que passa a cobrir o sob medida.
- Liga-se a: 204 (de onde sai o número) e a cada tela dona da tabela da §3.2.

## 7. Perguntas ao dono

Respondidas em 12/11/2026 — viraram D1, D6, D7 e D8 (§2).

## 8. Fica de fora

- Aviso por WhatsApp ou e-mail (já ficou para depois na central).
- Som ou alerta que pisca.
- Mudar qualquer regra de quem resolve o quê.
