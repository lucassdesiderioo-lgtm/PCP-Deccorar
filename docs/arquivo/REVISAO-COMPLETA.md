> **ARQUIVADO · 17/09/2026** — auditoria de 17/08/2026, contra o commit `7b00ecd`.
> Todos os `arquivo:linha` abaixo são daquela data e **não batem mais** com o código.
> Conferência de 17/09/2026: parte foi corrigida (backup exige Admin Geral, tela ABC e
> `POST /api/config/dias` aposentados, alvo com um cálculo só). **Os achados ainda
> abertos foram levados para o `CLAUDE.md` §14, dívidas 13 a 17** — é lá que eles
> vivem agora. Movido do Projeto "PCP - Deccorar".

---

# Revisão Completa — PCP Deccorar

> Auditoria do sistema inteiro: rota por rota, tela por tela.
> **Data:** 17/08/2026 · **Contra o HEAD do GitHub `7b00ecd`** (17/08, 11:39)
> **Método:** leitura integral de 26 arquivos `.js`, 14 telas e 6 documentos.
> Toda afirmação aqui tem `arquivo:linha`. Nenhum achado é suposição.

---

## 0. Antes de tudo: a pasta local estava 39 commits atrás

A auditoria foi feita contra o GitHub, não contra a pasta do Mac. Entre `49a6bdf`
(14/08) e o HEAD entraram **39 commits e 3.057 linhas** em três dias:

| Entregue | Onde |
|---|---|
| **Controle de Acesso**, fases 1 a 6 | `permissoes.js`, `acesso.js` (570 linhas), `views/acessos.html` |
| **Planejamento por estoque alvo**, fases 1 a 3 + parte da 4 | `plan_route.js`, `planilha.js`, `planejamento.html` |
| **DESIGN itens 1 a 6** | fundo claro na operação, A+/A−, medida como âncora, devolução |

É trabalho bom e rápido. **Esta revisão existe porque foi rápido demais para o
formato do sistema aguentar** — e os números provam: em três dias,
`date('now','localtime')` foi de 40 para 48 cópias, as rotas registradas
diretamente de 80 para 103, e as escritas em `skus.estoque` de 7 para 9.

---

## 1. Sumário — o que fazer primeiro

Ordenado por risco real para a fábrica, não por dificuldade.

| # | Achado | Onde | Consequência |
|---|---|---|---|
| **1** | Exceção individual pode virar **Admin Geral** sozinha | `acesso.js:471,167,186` | Escalonamento de privilégio pela UI oficial |
| **2** | `pessoas.gerenciar` e `auditoria.ver` **são delegáveis** | `acesso.js:355-375` | A regra §14.4 do seu doc não existe no código |
| **3** | O **último Admin Geral pode se auto-remover** | `acesso.js:341` | Sistema sem recuperação a não ser por SQL no banco |
| **4** | **"Fechado por padrão" não existe** — o default é `@logado` | `acesso.js:448` | Regressão: telas que o modelo antigo protegia ficaram abertas |
| **5** | `/baixar-backup` alcançável **sem sessão** | `auth.js:97` | O banco inteiro sai com o token |
| **6** | A **tela de cobertura dá falso "OK"** | `acesso.js:529-548` | A garantia contra esquecimento não garante nada |
| **7** | `POST /api/carregar` aceita volume **`pendente`** | `carreg_route.js:18-21` | Peça sai da fábrica **sem o −1** — estoque permanentemente errado |
| **8** | O cruzamento **subtrai a mesma peça duas vezes** | `cruz_route.js:21` × `operador.html:101` | Tela vermelha declara o dia concluído com urgentes faltando |
| **9** | `POST /api/montagem` — **4 escritas sem transação** | `mont_route.js:11-19` | Peça física existe e o sistema não sabe |
| **10** | `POST /api/skus` **zera o estoque** se o corpo omite o campo | `server.js:12,15` | Perda silenciosa de saldo |
| **11** | Planilha errada **apaga a base de planejamento** e reporta verde | `plan_route.js:106-109` | A tela azul do operador esvazia |
| **12** | Enter vazio na Etiqueta de Venda **imprime e baixa estoque** | `embalagem.html:79` | Ação destrutiva por tecla solta, em campo sempre focado |
| **13** | Bipe de SKU diferente **encerra a revisão em curso** | `operador.html:151` | Grava a peça errada com o tempo errado |
| **14** | Devoluções **sem refoco e sem som** | `devolucao.html:199` | Da 2ª peça em diante o bipe cai no vazio, em silêncio |
| **15** | O **alvo travado é placebo** | `plan_route.js:137,166` | Você digita 15, o operador continua vendo o número calculado |

Os quinze são independentes. Nenhum exige refatoração para ser corrigido — mas
**todos os quinze têm a mesma causa**, que está na Parte 6.

---

# PARTE 1 — Segurança e controle de acesso

O `CONTROLE-DE-ACESSO.md` foi implementado com fidelidade alta ao desenho: o
registro declarativo existe (`permissoes.js`), as caixinhas da tela são montadas
a partir dele (`views/acessos.html:255`), a resolução setor+exceção funciona
(`acesso.js:149-159`), a migração roda em transação (`acesso.js:184-192`), a
auditoria é somente leitura (não existe rota de escrita sobre `auditoria`) e a
contagem em dois passos está correta no essencial (`cont_route.js:21-37`).

**O que falhou não foi a implementação da regra — foi o mecanismo que deveria
garanti-la.**

## 1.1 As três portas para Admin Geral

### Porta A — a exceção que promove (a mais grave)

Cenário inteiro dentro da tela oficial, sem nada de anormal:

1. Você abre `/acessos`, seleciona uma pessoa **sem setor** e marca
   *"Editar estoque direto"*.
2. `POST /api/acesso/usuario/:id/excecao` chama `sincronizarAreas`
   (`acesso.js:370`). Como `estoque.editar` é nível `admin`, a linha 471 grava
   **`usuarios.areas='admin'`**.
3. Na próxima vez que `migrarPendentes()` rodar — basta você clicar na aba
   *"Auditoria & cobertura"* (`acesso.js:205`), ou o próximo `pm2 restart`
   (`acesso.js:196`) — ela vê a pessoa sem linha em `usuario_setor`, lê
   `areas='admin'` e aplica `if(set.has('admin')) alvo.push('Admin Geral')`
   (`acesso.js:167`).
4. **A pessoa passa a pertencer ao setor Admin Geral**, com todas as permissões,
   inclusive as duas que você declarou indelegáveis.

A versão branda da mesma raiz: exceção de `revisao.executar` → `areas='operador'`
→ a pessoa ganha o setor "Operador / Revisão" inteiro, que ninguém concedeu.

> A causa é a coluna `areas` continuar viva como sombra bidirecional: ela é
> **escrita** a partir do modelo novo e **lida** como entrada da migração. Um
> valor derivado virou fonte.

### Porta B — `intransferivel` é só um rótulo

Declarado em `permissoes.js:85,88,94`. **Não é gravado na tabela** (`acesso.js:60-63`
não tem a coluna) e **não é consultado em nenhum caminho de escrita**.
`POST /api/acesso/usuario/:id/excecao` (`acesso.js:355-375`) aceita qualquer chave
válida. A tela renderiza a caixinha com a tag "intransferível" — **sem `disabled`**
(`views/acessos.html:267`). Ou seja: a etiqueta está lá, a trava não.

Segunda via: `POST /api/acesso/setores` aceita criar setor **novo** com
`nivel:'admin_geral'` — a trava de `acesso.js:306` só cobre edição de setor
existente.

### Porta C — o Admin Geral pode se trancar fora

`POST /api/acesso/usuario/:id/setores` (`acesso.js:341`) **não tem** a trava do
último Admin Geral que existe em `auth.js:185-191`. O único AG que desmarcar o
próprio setor zera as `areas` e ninguém mais consegue abrir `/acessos`,
`/api/usuarios` ou o kill-switch. Recuperação só por SQL direto no banco.

## 1.2 "Fechado por padrão" não existe — e isso é uma regressão

`permDaRota` (`acesso.js:390-449`) termina em `return '@logado'` (linha 448), e
`decidir` libera `@logado` sem verificar nada (linha 495). O default do sistema é
**aberto para qualquer pessoa logada** — o oposto do §6.1 do seu documento.

Consequência medida executando `permDaRota` contra as rotas reais:

- **33 rotas de API** passam sem verificação de permissão.
- **Todos os `*.html` do `public/`** (menos `index.html`) também: `/painel.html`,
  `/relatorios.html`, `/montagem.html`, `/devolucao.html`, `/necessidade.html`…
  **O modelo antigo protegia essas telas** pela tabela `TELAS` (`auth.js:16-28`);
  o novo, que decide desde a Fase 3, não. Um operador de revisão abre
  `/relatorios.html` digitando o endereço.
- **Uma escrita ficou aberta:** `POST /api/config/dias` (`nec_route.js:11`).
  Qualquer pessoa logada no tablet pode POSTar `{dias:365}` e multiplicar por 36
  o alvo sugerido de todos os SKUs.

## 1.3 A tela de cobertura reporta "OK" com os furos abertos

O §6 do seu documento pedia uma garantia **estrutural**. O que foi implementado é
uma **lista escrita à mão**: `TODAS_ROTAS` (`acesso.js:529-544`). Ela já nasceu
desatualizada — faltam `POST /api/config/dias`, `POST /api/planejamento/config`,
`DELETE /api/listas/:id`, `GET /api/gerencial`, `/status` e todos os `.html`.

Pior: a linha 548 **descarta do contador tudo que começa com `/api/`**. Nenhuma
API sem permissão pode ser reportada, por construção. O aviso do boot
(`acesso.js:558-566`) usa a mesma lista e o mesmo filtro, e hoje imprime
`cobertura de telas OK (0 sem declarar)`.

> Este é o ponto mais importante da Parte 1. A tela de cobertura foi feita para
> ser o mecanismo que impede o esquecimento — e ela mesma depende de alguém não
> esquecer de atualizá-la. A garantia é circular.

## 1.4 Outros achados de segurança

| Achado | Onde | Detalhe |
|---|---|---|
| `/baixar-backup` sem sessão | `auth.js:97` + `backup_route.js:8` | Caminho fora de `TELAS` e fora de `/api/` cai em `next()`. Com o token, o banco inteiro sai. E o token nunca aparece em tela nenhuma — a rota é inútil para você e explorável por quem já leu o banco |
| `/api/gerencial` sob `painel.ver` | `ger_route.js:2` × `acesso.js:443` | É a fonte da tela de relatórios (gateada por `relatorios.ver`), mas a API exige permissão de **operação**. Operador de revisão lê rejeições por SKU, devoluções e tempos |
| Stack trace ao operador | ~45 rotas | `NODE_ENV` não é definido em lugar nenhum. Com Express 5, o handler final devolve o stack completo. `POST /api/skus {"codigo":123}` → `codigo.trim is not a function` + caminhos do servidor, num tablet |
| Anti-força-bruta em memória | `auth.js:74-78` | `pm2 restart` zera; a contagem é por `id` enviado pelo cliente, então IDs em paralelo nunca acumulam 5 falhas |
| Auditoria incompleta | vários | **Não registram:** cadastro de SKU, edição direta de estoque, alteração de alvo, etiqueta emitida, carregamento, baixa de devolução, modo teste ligado/desligado, e a consulta de produtividade nominal (que a §7 marca como "Sensível") |
| Retenção de 12 meses | — | Especificada na §7, não implementada |
| Aviso "N pessoas serão afetadas" | `views/acessos.html:328` | Especificado na §5 com o desenho da caixa. Salva direto, sem confirmação |
| Nível não implica herança | `acesso.js:38,50` | O setor nativo "Admin" recebe só chaves `nivel==='admin'` — sem `painel.ver`, `relatorios.ver`, `necessidade.ver`. O Admin delegado abre `/admin` e leva 403 em três telas |
| Setor nativo inoperante | `acesso.js:46` | "Operador / Controle de Estoque" dá `contagem.contar`, mas a única UI de contagem vive dentro do `index.html`, que exige `@admin`. O setor não serve para nada |
| Buraco no mapa da migração | `acesso.js:164-174` | `areasParaSetores` não trata `painel`, `devolucao` nem `carregamento`/`embalagem` isolados. Quem tinha `areas='painel'` fica sem setor e **perde** o `/painel` |

---

# PARTE 2 — Integridade do estoque e do fluxo

## 2.1 A peça pode sair da fábrica sem baixar o estoque

`POST /api/carregar` (`carreg_route.js:18-21`) verifica `bloqueado` e `carregado`.
**Não verifica `embalado`.** E `carreg_route.js` não escreve em `skus.estoque` em
lugar nenhum.

Cenário: volume `pendente`, etiqueta impressa direto por `GET /api/print/:id`
(que também não exige `embalado` — `exp_route.js:39` só recusa bloqueado), operador
bipa no carregamento. `estagio='carregado'`. O −1 de `etq_route.js:24` **nunca
acontece**.

Resultado: o estoque fica permanentemente 1 acima do físico, e como
`cruz_route.js:14` só conta `estagio='pendente'`, o volume também sai da conta de
urgência. O sistema passa a achar que tem *mais* estoque e *menos* demanda. Nada
registra a divergência.

## 2.2 O cruzamento subtrai a mesma peça duas vezes

**É uma regressão introduzida pela Fase 3 do planejamento.** A `foto_estoque` saiu
corretamente do código, mas o consumidor da tela vermelha não foi ajustado junto.

O modelo antigo congelava o estoque: `qtd` da ordem urgente ficava fixo o dia
inteiro e a tela calculava `falta = qtd − revisadas_hoje`. O modelo novo
(`cruz_route.js:21`) faz `urgente = pendentes_agora − estoque_agora` — **e os dois
lados se movem**.

Cenário com números:

```
07:00  BK160160BEGE: 5 vendas pendentes, estoque 0
       → aplica → producao(qtd=5, urgente=1)

       Operador revisa 3 e embala 3 → estoque 3, produzido 3
       Nenhuma etiqueta impressa: os 5 volumes seguem 'pendente'

10:35  Segundo PDF, aplica de novo:
       calcular(): pendentes=5, estoque=3 → urgente=2
       cruz_route.js:34 apaga a ordem (qtd 5, produzido 3)
       cruz_route.js:36 insere qtd=2, produzido=0

       operador.html:101  falta = max(0, qtd − revisadas_hoje)
                                = max(0,  2  −      3       ) = 0
```

**A tela mostra "3/2 · revisão completa".** Faltam 2 peças para 2 clientes
esperando, e a tela vermelha declara o dia concluído. As 3 peças prontas foram
descontadas duas vezes — uma pelo estoque no `calcular()`, outra pelo
`REVHOJE` na tela.

Era exatamente isso ("contaria peças duas vezes") que a `foto_estoque` protegia,
segundo o seu próprio `CLAUDE.md` §5.

## 2.3 `POST /api/montagem` — a rota mais exposta do sistema

É onde a peça **vira estoque**. Faz quatro escritas em quatro tabelas,
**nenhuma em transação** (`mont_route.js:11,14,15,19`). Com `better-sqlite3`, cada
statement auto-commita sozinho.

| Falha depois de | Estado que fica |
|---|---|
| linha 14 (`fila`) | Peça sai da fila, **não vira estoque**, ordem não abatida. A peça existe na prateleira e não existe em lugar nenhum do sistema |
| linha 15 (`skus`) | Estoque +1 **sem abater a ordem**. A tela vermelha continua pedindo uma peça já feita — e o operador produz de novo |
| linha 11 (`montagem`) | Linha no relatório de produtividade sem consumo de fila nem estoque |

Além disso, na mesma rota:

- **`kit_ok` nunca é validado.** Vem do cliente com default `1` (`mont_route.js:8`);
  `montagem.html:103` manda `1` fixo. O bloqueio "⚠ FALTOU O KIT" existe **só na
  tela** (`montagem.html:92`). A garantia contra a devolução recorrente é de
  interface, não de sistema.
- **SKU não cadastrado é aceito.** É a única rota do fluxo que grava e mexe em
  estoque sem validar o cadastro — `/api/revisao` valida (`server.js:45`),
  `/api/devolucao` valida (`dev_route.js:15`), `/api/embalar` valida
  (`etq_route.js:20`). Aqui o `UPDATE` afeta 0 linhas em silêncio, a resposta é
  `{ok:true, estoque:0}` e a peça some.
- **Embalar sem revisar gera estoque.** Se o SKU não está na fila, `f` é
  `undefined`, `modo` fica `'estoque'` e o +1 acontece assim mesmo.
- **Dívida #1c intacta.** `mont_route.js:12` pega a linha mais antiga
  `aguardando` sem olhar `teste`. Em modo teste consome a peça **real**, que fica
  presa em `embalado` e some da fila quando os testes são apagados.

## 2.4 O bloqueio do kit pode ser desarmado por engano

O `REGRAS-DE-NEGOCIO.md` §4 afirma: *"O campo **recusa** um SKU de persiana"*.
**Essa recusa só existe em `index.html:642`.** O servidor (`mont_route.js:6`) não
checa nada, e a segunda tela que grava o kit — o campo `#kitin` da própria
embalagem (`montagem.html:39`) — também não.

Se alguém apontar o leitor para a etiqueta da persiana e salvar,
`config.kit_codigo` vira `BK160160BEGE`. A partir daí, em `montagem.html:80`,
`if(KIT && code===KIT)` é avaliado **antes** da busca de SKU: **aquele SKU passa a
ser inembalável para sempre**, e todo bipe dele responde "Bipe o SKU primeiro".

## 2.5 As nove escritas em `skus.estoque`

| Onde | Instrução | Clamp |
|---|---|---|
| `server.js:14` | upsert `estoque=excluded.estoque` | **nenhum** — aceita negativo |
| `server.js:25` | `MAX(0,estoque+?)` | SQL |
| `server.js:26` | `estoque=?` | JS |
| `mont_route.js:15` | `estoque+1` | — (sem checar SKU, sem transação) |
| `etq_route.js:24` | `MAX(0,estoque-1)` | SQL |
| `cont_route.js:65,71` | `estoque=?` | JS |
| `cont_route.js:66` | `MAX(0,estoque+?)` | SQL |
| `cont_route.js:124` | `estoque=?` | implícito |
| `cont_route.js:146` | `estoque=estoque+?` | nenhum |
| `teste_route.js:81` | `estoque=?, alvo=?` | nenhum |

**A assimetria que importa:** a porta de **entrada** do estoque
(`mont_route.js:15`) não confere existência de SKU, não está em transação e não
deixa rastro reconciliável. A porta de **saída** (`etq_route.js:24`) confere duas
coisas, está em transação e é clampada. A entrada é a menos protegida do sistema —
e é a que a operação usa dezenas de vezes por dia.

**E `POST /api/skus` zera o estoque:** o corpo tem `estoque=0` como default
(`server.js:12`) e o upsert grava `excluded.estoque` (linha 15). Salvar uma
descrição sem reenviar o estoque **apaga o saldo**. A tela do admin não cai nisso
porque reenvia o valor (`index.html:203`), mas a API aceita — e aceita negativo
também.

## 2.6 Onde falta transação

| Rota | Escritas | O que fica quebrado |
|---|---|---|
| `POST /api/montagem` | 4 | §2.3 |
| `POST /api/skus` | 2 | O destravamento de volumes (`server.js:17`) está fora e dentro de um `catch(e){}` **vazio**. Falhou? A API responde `{ok:true}` e os volumes seguem bloqueados sem nenhum sinal |
| `POST /api/devolucao` | 2 | Devolução gravada como `reembalar` sem entrar na fila: a peça não está na fila, não é estoque, e a tela a mostra como resolvida |
| `POST /api/config/horarios` | até 14 | Parte dos dias com corte novo, parte com o antigo; `salvos:n` mente |
| `POST /api/planejamento/config` | 3 | `dias_cobertura` novo com `janela_media` velha — a tela azul passa a usar uma combinação que ninguém pediu |
| `POST /api/usuarios` | 4 | `auth.js:168-177` |
| seed de `listas` | N (boot) | Falha no meio → `COUNT(*)>0` impede o reseed → lista truncada para sempre |

---

# PARTE 3 — Planejamento: dois modelos vivos ao mesmo tempo

## 3.1 O alvo travado é placebo

O `DESENHO-PLANEJAMENTO.md` §7 item 4 especifica: *"vazio ou zero = calculado
automaticamente; preenchido = usa o seu número"*, com a tela mostrando
`alvo 9 (auto)` ou `alvo 15 (travado)`.

**Não foi implementado.** `calcular()` seleciona `s.alvo` (`plan_route.js:137`) e
**nunca o usa**; o alvo é sempre calculado (linha 166).

Cenário: você trava `BK160160BEGE` em 15 para uma promoção. O painel de parede
passa a mostrar `A repor = 15 − estoque`. **A tela azul do operador não muda em
nada** — continua devolvendo `max(2, ceil(média×10))`. A promoção não é produzida,
e nenhuma tela avisa que o número digitado não tem efeito.

## 3.2 O modelo velho desfaz a trava e polui o novo

`nec_route` (curva ABC, `dias_colchao`, tabela `demanda`) e `alvo_route` continuam
ativos, com aba própria no admin e link no rodapé, ao lado do "Planejamento".

Clicar em **"Aplicar sugestões"** na aba Necessidade (ABC) roda
`nec_route.js:31-35` sobre **toda** a tabela `demanda` — os 22 SKUs congelados no
seed de 14/08/2026 (`nec_route.js:6`, que nunca mais é atualizado por rota
nenhuma) — e:

1. **Sobrescreve `skus.alvo` de todos**, apagando o 15 travado, sem confirmação e
   sem auditoria (`nec_route.js:33` é um `UPDATE` cego).
2. **Cria em `skus`** qualquer código de `demanda` que não exista
   (`nec_route.js:34`), com `estoque=0` — contornando a permissão `sku.cadastrar`
   e a trava de padronização.

O segundo efeito atravessa para o modelo novo: o SKU recém-criado passa a ser
`cadastrado:true` em `calcular()`, com média 0 e comprometido 0 → `alvo =
alvo_minimo = 2` → `precisa = 2` → **aparece na tela azul do operador** mandando
produzir 2 peças de um produto que ninguém vende. Inclusive o `BK110X240BEGE`
fora de padrão, que é a sua dívida #7.

## 3.3 Três números para a mesma pergunta

Para o mesmo SKU, no mesmo instante:

| Tela | Fórmula | Fonte |
|---|---|---|
| Painel de parede | `pedido_do_dia + alvo_manual − estoque` | `painel_route.js:15` |
| Aba ABC | `média30_congelada × dias_colchao` | `nec_route.js:22` |
| Tablet do operador | `comprometido + média_da_planilha × dias_cobertura − estoque` | `plan_route.js:168` |

Nenhuma interface avisa que a aba ABC e a tela de Planejamento são modelos
concorrentes. A `planejamento.html` ainda diz no subtítulo *"Fase 1 · nada do
fluxo é alterado"* (`:3,:44`) — **falso desde a Fase 2**: esses parâmetros já
alimentam a tela azul.

## 3.4 A importação pode apagar a base e reportar sucesso

`plan_route.js:106-109` apaga toda linha de `venda_futura` que não esteja no
arquivo recém-subido. Não há verificação de que é o relatório certo, do período
certo, nem piso mínimo de linhas reconhecidas.

Dois cenários reais:

- Você exporta do ML filtrado por "últimos 7 dias" em vez de 30: as vendas dos
  dias 8 a 30 são **apagadas**, a média despenca, o alvo cai para o piso 2, e a
  tela azul do operador esvazia exibindo *"Estoque coberto — nada a produzir
  agora"*.
- O ML muda a posição das colunas (os índices são fixos, `plan_route.js:63`, e não
  há validação de cabeçalho): **toda** linha falha no teste de `venda_id`
  (linha 91, `continue` sem contador), `vistos` fica vazio, o laço apaga **a
  tabela inteira**, e a tela mostra em **verde**:
  `0 novas · 0 atualizadas · 167 removidas`.

Tudo isso dentro de uma transação — o estrago é aplicado atomicamente e por
completo. Não há backup de `venda_futura` antes da importação.

## 3.5 O leitor da planilha descarta em silêncio

`parseDataEnvio` (`planilha.js:196-211`) casa uma regex única:
`/dia\s+(\d{1,2})\s+de\s+([a-zç]+)/`. Testado em execução:

```
"Para enviar no dia 17 de agosto"  →  2026-08-17   ✅
"Para enviar hoje"                 →  null          ← descartado, em silêncio
"Para enviar amanhã"               →  null          ← descartado, em silêncio
"Pronto para enviar"               →  null          ← descartado, em silêncio
"31 de setembro"                   →  2026-10-01    ← data inventada
```

A API devolve o contador `sem_data_envio` (`plan_route.js:113`), mas
`planejamento.html:166` **não o imprime**. Se o ML passar a escrever "Para enviar
hoje" nos pedidos do dia, **a demanda mais urgente sai da conta sem nenhum sinal
na tela** — você só veria o total "Precisa" cair.

**Virada de ano:** funciona para frente e falha para trás.
Em 02/01/2027, "dia 30 de dezembro" → **2027-12-30**. Como o filtro de
comprometido é só `data_envio >= hoje` (`plan_route.js:132`), sem teto, esse
pedido entra como demanda **o ano inteiro** e a fábrica produz peça sem venda.

**E `parseDataVenda` não valida mês:** `'08/14/2026'` (formato americano) vira a
string `'2026-14-08'` (`planilha.js:184`), que na comparação por texto é sempre
maior que qualquer data — a venda fica **permanentemente** dentro da janela da
média, inflando o alvo daquele SKU para sempre.

## 3.6 Contagem em dois passos — correta, com dois furos

O desenho da §9 está implementado e correto: quem não tem `contagem.ajustar` cai
em `enfileirar()` (`cont_route.js:118`), que grava em `contagem_pendente` e **não
toca no estoque**; o `UPDATE skus` só existe na aprovação (`cont_route.js:65-71`);
a auditoria registra quem contou e quem aprovou (`:73`).

Os furos:

| # | Achado | Cenário |
|---|---|---|
| 1 | **Aprovação não compara `sistema_era`** | O campo é gravado (`:31`) e nunca lido. Operador conta 10 às 9h; ao longo do dia 3 são embaladas e 2 saem por etiqueta (estoque 11); às 17h o admin aprova → `estoque := 10`, apagando a movimentação do dia |
| 2 | **`contagem_pendente` não é coberta pelo modo teste** | Não tem coluna `teste` (`cont_route.js:5`). Contagem de treinamento sobrevive ao "apagar" e substitui o estoque real quando aprovada no dia seguinte |
| 3 | **Rejeitar destrói a contagem física** | `enfileirar()` já apagou as linhas de `contagem` (`:34`); rejeitar apaga o pendente (`:85`). A contagem inteira se perde e precisa ser refeita |
| 4 | **No modo antigo, qualquer logado aprova** | `/api/contagem/**` não está em `API_ADMIN` (`auth.js:30`) e o handler não checa por conta própria. Acionado o kill-switch, a contagem em dois passos vira um passo |

## 3.7 Modo teste: cobre 8 tabelas, e **nenhuma leitura filtra**

Cobertura atual: `revisao`, `producao`, `montagem`, `lote`, `fila`, `devolucao`,
`rejeicao`, `contagem` (`teste_route.js:9-18`). A `foto_estoque` saiu corretamente
com `DROP TRIGGER IF EXISTS` para bancos antigos.

**Fora da cobertura, com risco:** `venda_futura` (tem a coluna `teste`, não tem
trigger — importar em modo teste escreve como real **e apaga vendas reais**),
`contagem_pendente` (§3.6) e `fechamento`.

**O filtro na leitura existe em um único arquivo — o `plan_route`.** Todas as
outras leituras misturam teste com produção:

`/api/gerencial` (7 queries), `/api/rel/sku|dia|resumo`, `/api/painel`,
`/api/revisao/status`, `/api/expedicao/status`, `/api/revisao/hoje`,
`/api/producao`, `/api/fila`, `/api/montagem/hoje`, `/api/lote`,
`/api/carregamento`, `/api/contagem/:sessao`, `/api/cruzamento`.

E o `POST /api/cruzamento/aplicar` age sobre esse número contaminado: o
`DELETE … origem='ml'` (`cruz_route.js:34`) não filtra `teste`, então **apaga
ordens reais do dia** e as reinsere marcadas como teste.

---

# PARTE 4 — Rota por rota

103 rotas registradas. Abaixo, só o veredito; o detalhe de cada uma está nas
partes anteriores.

## 4.1 Rotas com DEFEITO

| Rota | Arquivo:linha | Problema |
|---|---|---|
| `POST /api/acesso/usuario/:id/excecao` | `acesso.js:355` | Delega permissão intransferível; dispara a Porta A |
| `POST /api/acesso/usuario/:id/setores` | `acesso.js:341` | Sem trava do último Admin Geral |
| `POST /api/acesso/setores` | `acesso.js:291` | Aceita criar setor `admin_geral` novo |
| `GET /api/acesso/cobertura` | `acesso.js:545` | Falso "OK" — lista manual + filtro que exclui `/api/` |
| `GET /baixar-backup` | `backup_route.js:8` | Alcançável sem sessão |
| `POST /api/config/dias` | `nec_route.js:11` | Escrita sem permissão declarada |
| `POST /api/necessidade/aplicar` | `nec_route.js:26` | Apaga alvo travado; cria SKU sem `sku.cadastrar` |
| `POST /api/skus` | `server.js:11` | Zera estoque; destravamento em `catch` vazio |
| `POST /api/producao` | `server.js:31` | Reporta `lancados` que não ocorreram |
| `POST /api/montagem` | `mont_route.js:7` | Sem transação · sem validar SKU · `kit_ok` não verificado · fila ignora `teste` |
| `POST /api/config/kit` | `mont_route.js:6` | Aceita um SKU como código do kit |
| `POST /api/carregar` | `carreg_route.js:3` | Aceita volume `pendente` — carrega sem o −1 |
| `POST /api/cruzamento/aplicar` | `cruz_route.js:29` | Dupla subtração (§2.2); `DELETE` sem filtro de teste |
| `POST /api/planejamento/importar` | `plan_route.js:66` | Exclusão em massa comandada pelo arquivo; ignora modo teste |
| `POST /api/contagem/pendentes/rejeitar` | `cont_route.js:79` | Destrói a contagem física |
| `GET /api/gerencial` | `ger_route.js:2` | Permissão de operação para dado de gestão; engole todo erro |
| `GET /api/revisao/status` | `st_route.js:11` | `urgentesFalta` compara agregados de SKUs diferentes |
| `express.static` (todos os `.html`) | `server.js:8` | `@logado` — regressão vs. o modelo antigo |

## 4.2 Padrões que atravessam todas as rotas

| Padrão | Números |
|---|---|
| **Sem tratamento de erro** | Três rotas do sistema inteiro têm `try/catch` em volta do corpo do handler (2 no `exp_route`, 1 no `backup_route`). **Não existe** `app.use((err,req,res,next)=>…)` |
| **Erro de negócio em HTTP 200** | `etq_route.js:17-21` (`{erro}` com 200), `carreg_route.js:17-20` (`{ok:false,motivo}` com 200), `dev_route.js:8` (`{achou:false}`), `cont_route.js:43` (`{cadastrado:false}`). Quatro convenções para "não pode" |
| **Falha silenciosa** | `ger_route.js:7-8` engole toda exceção e devolve zeros — o painel gerencial pode estar quebrado exibindo "dia parado" |
| **Normalização de SKU** | 3 estratégias, 14 pontos: `trim().toUpperCase()` (10×), `replace(/\s+/g,'')` (`plan_route.js:92`, semântica diferente), `UPPER()` em SQL (12×). E 6 lugares sem nenhuma |
| **A data de hoje** | `date('now','localtime')` **48 vezes em 16 arquivos**, mais `new Date()` do Node decidindo regra (`st_route.js:8`), mais data do cliente com e sem validação |
| **"SKU existe?"** | 9 versões, 5 formatos de retorno diferentes |
| **DDL espalhada** | `CREATE TABLE` em 12 arquivos; `config` criada em **5** deles; `contagem_pendente` em 2 |
| **Ordem dos `require`** | Continua sendo carga estrutural: `auth` antes do `static`, `acesso` depois do `auth` **e** dependendo de `config` que outro módulo cria, `teste_route` obrigatoriamente por último |

---

# PARTE 5 — Tela por tela

## 5.1 Os três dialetos de bipe

O gesto que a fábrica repete centenas de vezes por dia tem hoje **cinco
implementações e três dialetos incompatíveis**, com o mesmo leitor.

| | `/operador` | `/montagem` | `/embalagem` | `/carregamento` | `/devolucao` |
|---|---|---|---|---|---|
| Campo | visível | **escondido** | visível | **escondido** | visível |
| Atributos anti-iOS | completos | **só `autocomplete`** | completos | **só `autocomplete`** | **só `autocomplete`** |
| Tamanho mínimo | 8 | **nenhum** | 8 | **nenhum** | **6** |
| Anti-duplicata | **nenhuma** | 700 ms | 700 ms | **600 ms** | **nenhuma** |
| Espera após digitar | 220 ms | **nenhuma** | 220 ms | **nenhuma** | **400 ms** |
| `toUpperCase()` | sim | sim | sim | **não** | **não** |
| Aceita **Tab** | sim | **não** | sim | **não** | **não** |
| Aceita Enter | sim | sim | sim | sim | **não** |
| Buffer global | **sim** | não | não | não | não |
| Refoco (`keep`) | sim | sim (exceto `#kitin`) | sim | sim | **nenhum** |
| **Som** | sim | sim | sim | sim | **NÃO EXISTE** |
| Compara o código no 2º bipe | **não** | sim | sim | n/a | n/a |

**Um leitor configurado com sufixo Tab funciona em duas telas e é inerte nas
outras três.**

E os dois campos escondidos a `-9999px` (`montagem.html:25`, `carregamento.html:21`)
são exatamente a armadilha que o seu `CLAUDE.md` §12 documenta e que o
`DESIGN.md` §6 proíbe por escrito: *"Nunca escondido — a lição do iPad"*.

## 5.2 Os cinco riscos operacionais mais altos

| # | Tela | Problema | O que acontece |
|---|---|---|---|
| 1 | `embalagem.html:79` | Enter com campo vazio **imprime** | O `keep()` mantém o campo sempre focado. Qualquer Enter solto — leitor que manda Enter depois de um Tab, toque acidental — imprime a etiqueta, marca `embalado` e **tira 1 do estoque**. Única ação destrutiva da base disparável por tecla vazia |
| 2 | `operador.html:151` | `toggle()` não compara o código com a revisão em curso | Operador inicia `BK160140CINZA`, é interrompido, volta e bipa `BK140140BEGE`: o sistema **grava a revisão da CINZA** com o tempo da interrupção, e a BEGE nunca é revisada. A `montagem.html:95` faz essa checagem; a revisão não |
| 3 | `devolucao.html:199` | Foco só na abertura; nenhum som | Fluxo real: bipa → toca em "AZUL" → toca na medida → responde 7 grupos → Salvar. **Depois do primeiro toque o foco nunca volta.** A próxima devolução é bipada no vazio: nada aparece, nada apita, e a peça é registrada **sem código do ML** — matando a detecção de DIVERGÊNCIA, que é a razão de ser da tela |
| 4 | `carregamento.html:53` | Não trata `motivo==='bloqueado'` | O servidor recusa corretamente com o motivo certo; a tela cai no `else` e diz *"Etiqueta não reconhecida — bipe a etiqueta de VENDA"*. O operador bipa de novo, culpa o leitor, e nunca descobre que o problema é cadastro de SKU. **A trava do §6 funciona no backend e é invisível na tela** |
| 5 | `montagem.html:103` | `finish()` não lê a resposta do POST | O `await fetch` resolve com 400/500 igual. A tela mostra "Embalada ✓ · foi pro estoque" **mesmo quando o servidor recusou** — na única operação que soma estoque |

## 5.3 Falha de rede: 32 chamadas, 17 sem tratamento

| Categoria | Quantidade |
|---|---|
| Sem nenhum tratamento (rejeição não tratada, zero sinal na tela) | **17** |
| `catch` vazio ou `return` mudo | **9** |
| `catch` que exibe algo | 4 |
| Verificam o corpo da resposta | **2** |

Os que **mentem** para o operador — piores que os silenciosos:

1. `embalagem.html:91` → afirma **"Nada pendente."** quando não sabe. Perto do
   horário de despacho.
2. `devolucao.html:158` → afirma **"Sem registro dessa venda - tudo bem, siga
   normalmente."** quando o servidor está fora do ar. O vínculo vai `null` e a
   divergência nunca é detectada.
3. `operador.html:242` → `.then()` sem `.catch()`: a rejeição se perde **depois**
   de a revisão ter sido cancelada em memória. A peça sai do cronômetro e não fica
   registrada em lugar nenhum.
4. `nav.js:122` → `.catch(function(){})`: **a tarja de modo teste não aparece**. O
   único sinal de "nada aqui conta como produção real" some em silêncio.
5. `montagem.html:103` → o inverso: sucesso declarado sem confirmação do servidor.
6. `operador.html:74` → `/api/skus` falha → `SKUS=[]` → **todo bipe responde "SKU
   não cadastrado — cadastre no Admin"**, com beep de erro. Diagnóstico
   completamente enganoso durante uma queda de rede.

Nenhuma tela tem fila local de reenvio (dívida #3) e **nenhuma tem estado de
"enviando"** — exceto a `planejamento.html:160`, que é a tela de escritório.

## 5.4 `index.html` — 704 linhas, 12 abas

| Achado | Detalhe |
|---|---|
| Troca de abas | **Cadeia manual de `if`**, `:162-187`. Acrescentar uma aba exige tocar em ~4 pontos |
| Ordem | Os botões são `prod, est, cad, nec, …`; os containers no DOM põem `v-cad` em **último**. Marca do "colado por cima" |
| IDs | `#v-cad` (Cadastro de SKU) e `#v-cd` (Cadastros) diferem em uma letra |
| Listeners | **5 `document.addEventListener('click')` globais** (`:254, 362, 385, 580, 622`). Cada clique percorre os cinco |
| Estado | A aba não vai para a URL — qualquer refresh volta para "Lançar produção" |
| Polling | `setInterval(carregar, 4000)` roda **em qualquer aba** |
| Resíduo | Comentário órfão `/* ---- Pessoas & Acessos ---- */` em `:263`, sem código |
| `medidaDe()` | `index.html:315` usa uma regex genérica; `operador.html:85` e `devolucao.html:109` usam `/^BK…/`. **O mesmo SKU renderiza medida na etiqueta e não renderiza no tile do operador** |

## 5.5 `views/acessos.html` — o que ficou de fora

A tela está boa: monta as caixinhas do registro (§4 ✅), mostra a origem de cada
permissão em cinco selos (§11 ✅), respeita o nível do setor (§5.1 ✅), desabilita
as caixinhas do Admin Geral (§14.1 ✅).

Faltou:

| Requisito | Situação |
|---|---|
| §5 — aviso "N pessoas serão afetadas" antes de salvar setor | **Ausente.** `salvarSetor()` (`:328`) salva direto |
| §14.4 — intransferíveis não delegáveis | **A caixinha é renderizada habilitada** (`:267` imprime o selo sem `disabled`) |
| §11 — `exceção · você` (quem criou) | `criado_por` é gravado e a API não devolve |
| §10 — `motivo` da exceção | A coluna existe; a tela nunca coleta |

## 5.6 `nav.js` — o cromo comum

| # | Problema | Consequência |
|---|---|---|
| 1 | Tarja de modo teste é `fixed;top:0;z-index:10000` e **nunca aplica `padding-top`** (`:114` só limpa) | A faixa amarela cobre a `#sessBar`. **A+/A−, o nome e o botão Sair ficam inacessíveis durante todo o modo teste** — exatamente quando se treina gente nova |
| 2 | Menu **não respeita permissão** (`:34-46`) | Mostra os 10 links para todos. O `nav.js` **já busca** `/api/auth/eu` (`:86`), que **devolve as `areas`** — e descarta o dado (`:92` usa só `u.nome`). Um toque errado tira o operador da bancada e o joga num 403, no meio do turno |
| 3 | `/devolucao` fora do menu | Dívida #8 aberta. Só se chega pelo `/operador`; existe volta, não existe ida |
| 4 | A+/A− usa `zoom` no `<html>` (`:27`), não `font-size` + `rem` como o `DESIGN.md` §3 pede | Em A++ o iPad de 768 px vira 590 px lógicos e a grade `minmax(300px,1fr)` do operador **colapsa para 1 coluna**. Os itens 3 e 5 do `DESIGN.md` §10 se cancelam |
| 5 | `fetch('/api/auth/eu')` sem `.catch` | Falha de rede → sem barra de sessão → **sem A+/A− e sem Sair**, com o zoom salvo ainda aplicado e nenhum meio de desfazer |
| 6 | Links do rodapé: `padding:6px 12px`, `font-size:12px` → ~26 px | Metade do alvo mínimo do `DESIGN.md` §9-3, na região que o polegar toca ao segurar o tablet |

## 5.7 DESIGN.md — o que foi implementado e o que ficou pela metade

| Item | Situação |
|---|---|
| §2 fundo claro na operação | ✅ **Feito**, paleta exata, nas 5 telas |
| §3 medida como âncora | ⚠️ **Só no `/operador`.** `montagem`, `embalagem`, `carregamento` e `devolucao` mostram o código puro. E a `devolucao.html:127` grafa `1.60 x 1.40` (ponto e "x") contra `1,60 × 1,40` do operador — mesmo dado, duas grafias, nas duas telas do mesmo operador |
| §3 piso de 15 px | ❌ **Violado em todas as telas.** Só no `/operador` são **seis** classes abaixo (12 px e 13 px). O SKU no tile está em 14 px |
| §4 alvos ≥52 px | ⚠️ Os elementos novos passam (`.dvopt` 56 px ✅, tiles 100 px ✅); os antigos não: "Trocar" 34 px, "Peça com problema" 39 px, "Imprimir etiqueta" **41 px** (ação principal, spec pede 56) |
| §5 devolução | ⚠️ **Metade.** A triagem foi refeita e ficou boa (2/3+ opções, 56 px, três sinais no selecionado, contador "N de 7"). **O seletor de Cor e Medida continua no padrão antigo** — `flex-wrap` com chips de ~50 px colados. São os **dois primeiros toques** de toda devolução: o problema original relatado persiste |
| §6 faixa de 6 px no topo | ⚠️ Entregue como `border-bottom:3px` no cabeçalho — metade da espessura, e embaixo do header em vez de no topo |
| §9-1 contraste 4,5:1 | ❌ `.dvopt.sel` = **4,36:1** (o estado selecionado, o sinal mais importante da tela); item ativo do menu = **4,24:1**; "ADIANTAMENTO" = **3,78:1** |
| §9-5 retorno em dois canais | ❌ **`devolucao.html` não tem som nenhum** |

## 5.8 CSS: 10 paletas para 2 temas

- **Operação (clara), 5 cópias** — `devolucao:5` omite `--blue`; `carregamento:6`
  acrescenta um `--violet` que nunca usa.
- **Admin (escuro), 5 cópias** — `relatorios:5` omite `--red`; `painel` e
  `relatorios` acrescentam `--violet`.
- **`.wrap`: 5 cópias, 4 larguras** — 900 / 820 / 820 / 820 / 760 px.
- **`.banner` + `.bt` + `.timer`: 4 cópias** com padding 26/28, peso 750/780,
  cronômetro 52/56 px.
- **As cores do semáforo são literais repetidos**, sem variável, em 4 arquivos de
  CSS **e em JavaScript inline** (`operador:108,111,220-227,262,271,274`,
  `embalagem:97,117-123`). **Trocar um tom hoje exige editar ~20 pontos em 5
  arquivos.**
- `.card` é usada em `embalagem.html:35` e **declarada só em
  `carregamento.html:22`** — o bloco "Faltam imprimir" fica sem fundo nem borda.

## 5.9 JS: o que está copiado

| Função | Cópias | Divergência |
|---|---|---|
| `$ = s => querySelector(s)` | **10** | Idênticas |
| `beep(ok)` | **4** | Byte a byte iguais. **Ausente na devolução** |
| `banner(...)` | **4** | **4 assinaturas** — o 4º parâmetro significa coisa diferente em cada uma |
| `keep()` | **4** | `montagem` é a única que exclui um segundo campo (`#kitin`) — é justamente a exclusão que falta no `operador` para o campo de observação da rejeição funcionar |
| `fmt(...)` | **4, 2 semânticas** | Três fazem segundos→`"2m30s"`; `planejamento:102` faz `null→'—'`. Mesmo nome, mesma assinatura, resultado incompatível |
| `last={c,t}` | 3 | 700 / 700 / **600** ms |

---

# PARTE 6 — A leitura: por que tudo isso aconteceu junto

Nenhum dos quinze achados do sumário é descuido. Olhados juntos, são **um único
padrão em cinco formas**.

### 1. A permissão é decidida por uma lista de strings, longe da rota

`permDaRota` (`acesso.js:390-449`) é um `switch` gigante mapeando caminhos para
permissões, mantido à mão, longe de onde as rotas nascem. Daí saem, direto:

- o default `@logado` (o `return` final), que anula o "fechado por padrão";
- a `TODAS_ROTAS` desatualizada, que faz a tela de cobertura mentir;
- `POST /api/config/dias` sem permissão, porque ninguém lembrou de acrescentar;
- `/api/gerencial` sob `painel.ver`, porque a lista não sabe quem consome.

**A regra estava certa. O mecanismo de aplicá-la era uma lista que alguém tem que
lembrar de atualizar.** É o mesmo tipo de garantia que o seu documento §6 dizia
querer substituir.

### 2. O estoque não tem dono

Nove comandos SQL em cinco módulos, com quatro políticas de clamp diferentes. Daí
saem: o `POST /api/skus` que zera, o `+1` sem transação e sem validar SKU, o
carregamento que não baixa, e a impossibilidade de responder *"por que o estoque
deste SKU está em 47?"*.

### 3. A regra vive na tela, não no sistema

Três garantias que os seus documentos afirmam como regra do sistema existem **só
em HTML**:

| Regra | Documentada em | Onde está de verdade |
|---|---|---|
| "sem o bipe do kit, o 3º é recusado" | `CLAUDE.md` §4 | `montagem.html:92` — o servidor aceita `kit_ok:1` do cliente |
| "o campo recusa um SKU de persiana" | `REGRAS-DE-NEGOCIO.md` §4 | `index.html:642` — e a outra tela que grava o kit não checa |
| "só após responder os dois campos é possível dar baixa" | `REGRAS-DE-NEGOCIO.md` §8 | a tela — `dev_route.js:37` não exige |

Regra que mora na tela é regra que some quando alguém abre outra tela.

### 4. Cada tela é um sistema próprio

Cinco implementações do bipe, quatro `banner()` com quatro assinaturas, dez
paletas, quatro `beep()` idênticos e um ausente. Os defeitos operacionais mais
graves são todos **assimetrias**: a `montagem` compara o código no 2º bipe e o
`operador` não; a `montagem` protege um segundo campo no `keep()` e o `operador`
não; a `embalagem` lê a resposta do POST e a `montagem` não.

Cada tela acertou uma coisa que as outras erraram — e nenhuma pôde aproveitar o
acerto da outra, porque não existe onde pôr.

### 5. As duas migrações pararam no meio

O acesso: o modelo antigo continua vivo como fallback, e a coluna `areas` virou
uma sombra que é escrita pelo novo **e lida como entrada da migração** — é
literalmente a Porta A.

O planejamento: a Fase 3 removeu a `foto_estoque` do código sem ajustar o
consumidor da tela vermelha (a dupla subtração), e o modelo ABC continua no menu,
capaz de apagar o alvo travado do modelo novo.

**Migração pela metade é a forma mais cara de dívida:** paga-se o custo dos dois
modelos e recebe-se a garantia de nenhum.

---

## 7. Como isso se conecta ao ARQUITETURA-ALVO

Cada uma das cinco formas tem uma contrapartida direta no documento de
arquitetura-alvo, e a auditoria **mudou a ordem de prioridade** dele:

| Forma | O que resolve | Fase |
|---|---|---|
| 1 — permissão por lista de strings | **Registro de rotas** — a permissão nasce na declaração, o default é fechado, a cobertura é a própria lista | Sobe para **primeira** |
| 2 — estoque sem dono | `dominio/estoque.js` + `movimento_estoque` | Segunda |
| 3 — regra na tela | Camada de domínio: o kit, o SKU do kit e a baixa passam a ser verificados no servidor | Junto com a segunda |
| 4 — cada tela um sistema | `bipe.js` + `ui.js` + `base.css` + o contrato de tela | Terceira, uma tela por semana |
| 5 — migrações pela metade | **Fechar as duas antes de abrir qualquer coisa nova** | Imediata |

> A recomendação que mudou: no documento original, o registro de rotas era a fase
> 4. Depois desta auditoria ele passa a ser a **fase 1**, porque as três portas
> para Admin Geral e o falso "OK" da cobertura só fecham de verdade quando a
> permissão deixar de morar numa lista mantida à mão.

---

## 8. O que verificar amanhã de manhã

Sem tocar em código, em ordem:

1. **Quem está como Admin Geral hoje?** A Porta A pode já ter sido acionada.
   ```sql
   SELECT u.nome, s.nome setor FROM usuarios u
     JOIN usuario_setor us ON us.usuario_id=u.id
     JOIN setores s ON s.id=us.setor_id WHERE s.nivel='admin_geral';
   SELECT nome, areas FROM usuarios WHERE areas LIKE '%admin%';
   ```
2. **O estoque bate com o físico?** O §2.1 pode estar rodando há dias sem sinal.
3. **A `venda_futura` tem o volume esperado?** O §3.4 é silencioso e verde.
   ```sql
   SELECT COUNT(*), MAX(importado_em) FROM venda_futura WHERE teste=0;
   ```
4. **Algum alvo foi travado e ignorado?** §3.1.
5. **O `config.kit_codigo` é mesmo o QR do manual?** §2.4.
   ```sql
   SELECT valor FROM config WHERE chave='kit_codigo';
   ```
6. **Existe linha presa em `fila`?** Dívida #1c.
   ```sql
   SELECT * FROM fila WHERE situacao='embalado' AND teste=0
     AND data < date('now','localtime');
   ```

---

*Auditoria contra `7b00ecd`. Reproduzível: todo achado tem `arquivo:linha`.*
