# Devoluções em andamento — do aviso do ML até o reembolso

```
STATUS
Situação: no ar e conferida na tela em 03/11/2026 (PRs #250 e #251) — falta a prova de uso
Conferido: os 6 casos iniciais gravados (#1 a #6, a 2ª rodada não duplicou), as cores do
  prazo, a porta "Devoluções" com as abas e a aba Baixa levando ao Admin.
Falta: um caso "nós coletamos" levado até o fim pelo Renato, e a tarja no primeiro bipe do
  Edvaldo. Com os dois, a spec vai para docs/arquivo/.
Criada em: 03/11/2026
Última atualização: 03/11/2026
Fase atual: todas em código; falta o deploy e a prova de fábrica
Fases: 1 ✅  2 ✅  3 ✅  4 ✅  5 ✅  (em código, não no ar)
Testes: teste_devolucao_casos.js (307 casos, os 52 da §10 e mais), teste_acesso.js (+40),
        teste_caminhos.js (+1); os 62 arquivos da raiz e os 856 do sob medida passando
Regras que parecem bug: CLAUDE.md §9-B
Risco: 🔴 (acesso/permissão, dinheiro, schema, toca na devolução que já existe)
Mudanças no caminho:
  · Fase 1 (03/11): `devcaso_dominio.js` é o dono único do caso, do prazo e do parado;
    `devcaso_route.js` traduz HTTP. As colunas de dinheiro já nascem na tabela (o script
    dos 6 casos grava o valor do ML), mas nenhuma rota as manda até a fase 5.
  · Área nova `devolucao_casos` no auth.js (a tela entra na lista protegida, armadilha #3)
    e no destino.js; o link do rodapé só aparece para quem tem a área.
  · O backfill (`seed_devolucao_caso`) roda depois dos setores: o setor Admin nativo
    (que tem `devolucao.baixar`) ganha lançar e acompanhar já no primeiro boot.
  · Etapas à mão: só as do acompanhamento. `chegou` tem botão próprio (fase 2), `ML avisado`
    só depois de chegar, `revisado` é o bipe do Edvaldo e `encerrado` é decisão.
  · Perda por prazo não exige o caso vencido: travar no "ainda não venceu" seria trava
    disparando no caso normal (armadilha #6); quem decide é o admin geral.
  · Fase 2 (03/11): o bipe acha o caso pela venda, pelo pack ou pela NF; sem caso, a resposta
    é a de sempre (as mesmas duas chaves). O salvar liga pelo `caso_id` da tarja OU, no
    tablet sem o refresh, pela etiqueta bipada — na mesma transação da revisão.
  · "ML avisado" virou botão ("Avisamos o ML que recebemos"), e não etapa à mão: o aviso
    pode vir depois da revisão, e aí é só história — a trilha não volta de "revisado".
  · Na baixa ligada a um caso sem motivo, o motivo escolhido na baixa vira o do caso
    (um motivo por caso); o caso que já tem motivo não muda.
  · Fase 3 (03/11): uma tentativa aguardando por vez (duas seriam dois caminhões para a mesma
    caixa). "Não achou o cliente" abre a próxima com a mesma transportadora e o mesmo CEP, custo
    vazio; "coletou" leva o caso a caminho. O custo pode ser escrito por quem acompanha, mas só
    volta pelo fio para quem tem `devolucao.dinheiro` (R15) — a poda já nasce nesta fase.
  · A transportadora é cadastro (fora do modo teste); a tentativa é movimento (dentro).
  · Fase 4 (03/11): a foto passa pela régua única do `foto.js`; o documento pode ser foto ou PDF
    (que tem que começar com %PDF); a foto do comprador só imagem. O arquivo é gravado DENTRO da
    transação: disco recusou, a linha não existe (e o arquivo meio escrito é apagado).
  · Anexo não se apaga por rota (é prova). No modo teste, "apagar tudo" apaga a linha e o arquivo
    fica na pasta, sem nada apontando para ele.
  · A lista `doc_devolucao` é editável em Admin → Cadastros, ao lado dos motivos.
  · Fase 5 (03/11): a situação do valor do ML (pedir / pedido / já veio) é de quem acompanha; o
    NÚMERO é do admin geral. Lançar o valor marca "já veio". `valor_ml_desde` (coluna nova,
    com ALTER guardado) mede o "pedir há N dias". O valor pode ser lançado no caso encerrado
    (o perdido costuma chegar depois).
  · O saldo é do "nós coletamos": valor do ML − custos; sem tentativa, os custos são zero (não há
    custo faltando) e o saldo é o próprio valor. O relatório conta os casos pelo mês de
    LANÇAMENTO e as devoluções sem caso pelo mês de RECEBIMENTO, sem as de modo teste.
  · A baixa do reembolso só encerra o caso já revisado (a peça voltou e foi vista).
  · Fica de fora: a linha das devoluções em andamento na central de Pendências (a spec não pede).
  · Depois do deploy (03/11, AJUSTE pedido pelo dono): a tela de casos deixou de ter link próprio
    no rodapé. As devoluções têm UMA entrada ("Devoluções" → /devolucoes) e abas no topo
    (Receber peça · Em andamento · Baixa), cada uma pela permissão. A §8 da spec dizia "entra
    no menu do nav.js para quem tem devolucao.acompanhar"; o link próprio não apareceu para
    ninguém (ele lia a coluna `areas`, que o backfill não recalculou), e o dono preferiu juntar.
  · AJUSTE de 03/11 (pedido do dono): campo "Buscar devolução" em Em andamento, pela NF, venda
    ou pack (inteiro ou pedaço, a partir de 3 dígitos), nos casos abertos e encerrados.
    No ar e conferida pelo dono em 03/11/2026 (PR #253).
  · AJUSTE de 03/11 (pedido do dono), no lançamento: "Venda via publicidade?" (Sim ou Não,
    obrigatório; os casos de antes ficam "não informado") e a contagem no relatório do mês;
    a mensagem do ML colada inteira; o link da conversa da reclamação (botão "Abrir conversa
    no ML"); "Passado em" nasce com o dia do lançamento; e a aba Motivos, que edita a mesma
    lista da baixa para quem tem listas.editar.
  · AJUSTE de 03/11 (2): o lançamento do "Nós coletamos" já adianta CEP, transportadora (nasce
    em Coleta pedida), custo, situação e valor do ML (valor e custo só com devolucao.dinheiro);
    "↩ Desfazer" a última mudança de etapa, só por quem a fez, voltando com a data de antes;
    e o aviso "mesmo comprador" (só avisa, os casos continuam separados). O CEP pela NF não
    entrou: o PCP não grava o CEP da venda (fica para plano à parte, no parse).
  · AJUSTE de 03/11 (3): o motivo se escolhe no alto do caso, e o motivo removido da lista
    continua no caso que já o usa.
```

> Desenhada no Projeto do Claude entre 29/10 e 03/11/2026, com o Lucas.
> Onde esta spec e o `CLAUDE.md` divergirem, vale o `CLAUDE.md` (§13).

---

## 1. O problema

Quando o comprador devolve uma persiana pelo Mercado Livre, há dois caminhos:

| | **ML devolve** | **Nós coletamos** |
|---|---|---|
| Quem busca a peça | a logística do Mercado Livre | **a Deccorar**, com transportadora contratada caso a caso |
| Por quê | é o normal | o ML diz que não consegue coletar e a responsabilidade passa pra nós |
| Prazo | — | o ML dá um **"resolver até"** (7 a 10 dias). Passou: **perdemos o valor da venda E a peça fica com o cliente** |
| Dinheiro | — | o ML paga um valor pela coleta, diferente a cada caso |

Hoje o "nós coletamos" é controlado numa tabela de texto (data em que foi passado
ao Renato, resolver até, NF, venda, SKU, valor do ML, status). Em outubro o caso
foi passado e ficou parado sem ninguém ver — **e a fábrica perdeu peças por
prazo vencido.** Ninguém sabe também se o valor do ML cobre o frete da
transportadora.

O "ML devolve" não tem controle nenhum antes da peça chegar: a devolução que
**nunca chega** não aparece em lugar nenhum.

## 2. O objetivo

1. **Toda devolução do ML nasce no sistema ANTES de a peça chegar**, com venda, NF e motivo.
2. **Nenhum prazo vence calado:** o caso diz quantos dias faltam e há quantos dias está parado.
3. **A chegada se liga sozinha:** o Edvaldo bipa a etiqueta como hoje e o sistema acha o caso.
4. **Saber se compensa:** o valor do ML ao lado do custo do frete, caso a caso e no mês.
5. **Saber o que mais dá problema:** contagem por motivo, todo mês, numa régua só.

## 3. Como funciona na fábrica

```
LANÇAR A DEVOLUÇÃO  (venda + NF + SKU + motivo + tipo)
   │
   ├─ ML DEVOLVE ────── AGUARDANDO CHEGAR (mostra há quantos dias)
   │                       → Edvaldo bipa a etiqueta → acha o caso → REVISADO → baixa → ENCERRADO
   │
   └─ NÓS COLETAMOS ─── ① LANÇADO        resolver até + responsável + data em que foi passado
                        ② COLETA PEDIDA   transportadora, CEP, custo (cada tentativa)
                        ③ DOCS AO ML      anexos da lista cadastrável
                        ④ A CAMINHO       não achou o cliente → nova tentativa (volta ao ②)
                        ⑤ CHEGOU          bipe do Edvaldo, ou botão "chegou"
                        ⑥ ML AVISADO      avisamos o ML que recebemos
                        ⑦ REVISADO        Edvaldo, na tela de sempre
                        ⑧ ENCERRADO       admin geral confere no Mercado Pago: recebeu / não recebeu

   Saídas antes do fim (só admin geral):
     • DEVOLVIDO AO COMPRADOR — chegou amassada, olhamos a foto do comprador no ML
       e devolvemos o dinheiro em vez de coletar (foto anexada, valor devolvido)
     • PRAZO VENCIDO → PERDA — o valor perdido fica registrado, o caso não some
```

**Quem faz o quê**

| Pessoa | Faz |
|---|---|
| Quem lança (administrativo/marketplace) | lança o caso assim que o ML abre a reclamação no pós-venda |
| Quem acompanha (hoje, o Renato) | transportadora, coleta, documentos, avisos ao ML, prorrogação |
| Porta da expedição / Edvaldo | recebe a caixa; o Edvaldo bipa e revisa **como já faz hoje** |
| Admin geral (Lucas) | vê o dinheiro, decide "devolver ao comprador", encerra por perda, dá baixa no reembolso |

## 4. Regras de negócio

**R1 — O caso nasce antes da peça.** Toda devolução do ML é lançada quando a
reclamação aparece no pós-venda, não quando a caixa chega.

**R2 — O caso é achado pela venda E pela NF.** A etiqueta do ML que vem colada
traz o número da venda (é o que o Edvaldo bipa hoje). Quando vem por
transportadora pode chegar só com a NF — a busca aceita os dois, e também o
Pack ID. Nunca pode haver dois casos **abertos** com a mesma venda.

**R3 — O prazo manda (só "nós coletamos").** Cada caso mostra os dias corridos
até o "resolver até":
`≤ 3 dias` âmbar · `≤ 1 dia` vermelho · passou = **VENCIDO**, vermelho, no topo.
A lista é ordenada pelo prazo, nunca pela data de lançamento. Os limites ficam no
`config` (`devol_prazo_ambar=3`, `devol_prazo_vermelho=1`), não no código.

**R4 — Caso parado grita.** Mostra há quantos dias está na mesma etapa. Com
`≥ 2 dias` (`devol_parado_dias=2`) fica âmbar mesmo com prazo longe. Foi
exatamente o que faltou em outubro.

**R5 — "ML devolve" só mostra a espera.** Há quantos dias está aguardando, sem
cor e sem trava. A regra de quando cobrar o ML vem depois, com os números na mão.

**R6 — Prorrogar é pedido, não automático.** Botão "pedi prorrogação ao ML"
(vira evento). Quando o ML aceita, lança-se o prazo novo; **o prazo original
fica guardado** e a tela mostra os dois.

**R7 — Prazo vencido não encerra sozinho.** Pode ter havido prorrogação não
lançada. O caso fica VENCIDO no topo até o admin geral escolher: lançar o prazo
novo, ou **encerrar como perda**, com o valor perdido.

**R8 — Cada tentativa de coleta é uma linha.** Transportadora, CEP da coleta,
data, custo e resultado (`aguardando` · `coletou` · `nao_encontrou`). "Não achou
o cliente" abre a próxima tentativa. O custo pode ficar **vazio** (ainda não se
sabe se a segunda ida cobra).

**R9 — Custo indefinido nunca vira zero** (a regra 4 do §7-B e do §18).
Tentativa sem custo → o saldo do caso sai **"incompleto"**, e o total do mês sai
como piso, com `≥` e aviso âmbar. Valor perdido não lançado idem.

**R10 — A transportadora aprende pelo CEP.** Ao pedir coleta, o sistema mostra
quem **já coletou** naquela região (mesmos 5 primeiros dígitos do CEP, depois os
3 primeiros), com quantas vezes e quando foi a última. Sai das tentativas com
resultado `coletou` — **não existe tabela de cobertura escrita à mão**, que
envelheceria calada.

**R11 — Documentos são uma lista cadastrável.** Tabela `listas`, tipo
`doc_devolucao`, nasce com **Etiqueta de coleta** e **Comprovante de pagamento
da transportadora**. A etapa ③ só avança com **todos os documentos ativos da
lista anexados** — o bipe que falta recusa o passo, como o kit na embalagem.

**R12 — Uma lista de motivos, para todas as devoluções.** É a **mesma**
`listas` tipo `motivo_devolucao` que o admin já usa na baixa, acrescida de
**Falta de kit**, **Comando quebrado** e **Chegou amassada**. Duas listas
partiriam o relatório em dois e o número nunca fecharia. Cada caso tem **um**
motivo. Na baixa de uma devolução ligada a um caso, o motivo vem preenchido
do caso.

**R13 — Motivo ≠ triagem.** O motivo é **o que o cliente reclamou**. A triagem
do Edvaldo (embalagem, tecido, tubo, base, comando, kit) é **o que a peça
mostrou**. Os dois ficam guardados; quando não batem, isso também é informação.
Nada na triagem muda.

**R14 — O trabalho do Edvaldo não muda.** Mesma tela `/devolucao`, mesmo bipe,
mesma triagem, mesma destinação (`reembalar` continua indo para a `fila`). Muda
só: ao bipar, se existe caso aberto, aparece uma tarja **"devolução esperada —
caso #N · motivo"**, e ao salvar o caso é ligado e marcado REVISADO. **Sem caso,
tudo funciona como hoje** — o vínculo é bônus, não requisito (§9 do `CLAUDE.md`).

**R15 — Dinheiro é só do admin geral.** Valor que o ML paga, custo das
tentativas, valor devolvido ao comprador, valor perdido, saldo e totais em
reais: **o JSON nem leva esses campos** para quem não tem `devolucao.dinheiro`
(regra 14 do §13: não adianta esconder na tela e mandar pelo fio).

**R16 — Três decisões são do admin geral, e ficam com nome e hora:**
devolver ao comprador sem coletar, encerrar como perda, e dar baixa no
reembolso (`recebido` / `nao_recebido`, conferido no Mercado Pago).

**R17 — Devolver ao comprador exige a foto.** A foto que o comprador mandou ao
ML é anexada ao caso (tipo `foto_comprador`). Sem foto, não encerra por esse
caminho. Foto vazia não é prova (mesma regra da coleta, §8-B).

**R18 — O valor do ML tem situação própria**, em paralelo às etapas:
`ja_veio` · `pedir` (precisamos pedir ao ML) · `pedido` (pedimos, esperando).
O caso com `pedir` há ≥ 2 dias entra no aviso de parado.

**R19 — Encerramento:**

| Tipo | Encerra quando |
|---|---|
| ML devolve | revisado **e** baixa do admin (a baixa que já existe) |
| Nós coletamos | revisado **e** baixa do reembolso pelo admin geral |
| Qualquer um | devolvido ao comprador, ou perda por prazo (admin geral) |

**R20 — Todo passo vira história.** Cada mudança de etapa, prazo, valor,
anexo e decisão grava uma linha em `devolucao_evento` (quem, quando, de → para).
Sem isso o caso encerrado não conta por que demorou nem quem destravou.

**R21 — Os arquivos são prova e não expiram.** Anexos vão para uma pasta própria
(`caminhos.js` → `DEVOLUCOES`, variável `PCP_DEVOLUCOES_DIR`), **fora** de
`lotes/`, que o cron apaga em 7 dias. Gravados dentro da transação: disco
recusou, o anexo não existe.

**R22 — Relatório do mês por motivo, numa régua só.** Conta os casos **e** as
devoluções antigas sem caso (pelo `devolucao.motivo` da baixa), **sem contar
duas vezes** a devolução ligada a um caso. Mostra quantidade por motivo para
quem tem acesso à tela, e o dinheiro por motivo (perdas por prazo separadas das
perdas por amassado) só para o admin geral.

## 5. Fica de fora

- Puxar as reclamações direto do ML (é assunto da integração com a API do ML, projeto à parte).
- Mudar a revisão/triagem do Edvaldo.
- Prazo ou alarme para cobrar o ML no tipo "ML devolve" (R5).
- Mandar mensagem ao ML, à transportadora ou ao comprador pelo sistema — os avisos são marcados à mão.
- Devoluções da Shopee e do sob medida.

## 6. Dados

> Coluna nova entra no `CREATE TABLE` do módulo dono, no mesmo commit (§17).
> Tabelas novas com movimento entram em `TABELAS` do `teste_route.js` (§11).

```sql
devolucao_caso (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,              -- 'ml' | 'coleta'
  venda TEXT, pack_id TEXT, nf TEXT,
  sku TEXT, comprador TEXT, lote_id INTEGER,   -- preenchidos do lote quando a venda é achada
  motivo TEXT,                     -- valor da listas 'motivo_devolucao'
  etapa TEXT NOT NULL,             -- ver §3
  etapa_desde TEXT,                -- para o "parado há N dias"
  prazo TEXT, prazo_original TEXT, -- só coleta (YYYY-MM-DD)
  responsavel TEXT, passado_em TEXT,
  cep TEXT,
  valor_ml REAL, valor_ml_situacao TEXT,    -- 'ja_veio'|'pedir'|'pedido'   (dinheiro)
  valor_devolvido REAL, valor_perdido REAL, -- (dinheiro)
  saida TEXT,                      -- 'reembolso_recebido'|'reembolso_nao_recebido'|'revisado_ml'
                                   -- |'devolvido_comprador'|'perda_prazo'
  devolucao_id INTEGER,            -- a revisão do Edvaldo
  chegou_em TEXT, encerrado_em TEXT, encerrado_por TEXT,
  obs TEXT, criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  teste INTEGER DEFAULT 0
)
devolucao_evento   (id, caso_id, tipo, de, para, texto, usuario, criado_em, teste)
devolucao_coleta   (id, caso_id, transportadora_id, cep, pedida_em, custo REAL,
                    resultado, obs, usuario, criado_em, teste)
devolucao_anexo    (id, caso_id, tipo,      -- 'doc' | 'foto_comprador'
                    doc_tipo, arquivo, usuario, criado_em, teste)
transportadora     (id, nome, contato, canal, obs, ativo INTEGER DEFAULT 1, criado_em)
```

`listas`: tipo `doc_devolucao` (novo) e 3 valores novos em `motivo_devolucao`.

> ⚠️ **O `seed()` do `cad_route.js` só grava quando a lista está VAZIA.** Num
> banco que já existe, os três motivos novos nunca chegariam. Precisa de um
> acréscimo de uma vez só, marcado em `config` (`seed_motivos_devolucao_2`), que
> **só insere o valor que não existe** — e quem apagar um motivo depois não o vê
> voltar no próximo boot. Mesma lição da armadilha #23 (§5, backfill de chave).

## 7. Acesso

| Chave | Nível | Faz |
|---|---|---|
| `devolucao.lancar` | admin | lançar e editar o caso (venda, NF, motivo, prazo) |
| `devolucao.acompanhar` | supervisor | ver a lista, mover etapas, tentativas, transportadoras, anexos, prorrogação |
| `devolucao.dinheiro` | admin_geral · `sensivel` · `intransferivel` | ver valores, devolver ao comprador, encerrar como perda, baixa do reembolso |
| `devolucao.registrar` | (já existe) | a tela do Edvaldo — **sem mudança** |
| `listas.editar` | (já existe) | editar motivos e documentos |

> ⚠️ **As três pontas** (armadilha #23 e #13): chave em `permissoes.js`, rota em
> `permDaRota()` do `acesso.js`, e **alguém que tenha a chave**. Backfill de uma
> vez só (`config.seed_devolucao_caso`): quem já tem `devolucao.baixar` ganha
> `lancar` e `acompanhar`. O Renato recebe `acompanhar` pela tela de Acessos,
> depois do deploy. `/api/devolucao-casos` **não** pode cair no padrão `@logado`.
> Todas as rotas novas entram na lista de cobertura.

## 8. Telas

**Nova: `/devolucao-casos` — "Devoluções em andamento"** (escritório → contexto
escuro do `docs/DESIGN.md`; linguagem do `NAVEGACAO-E-LINGUAGEM.md`). Entra no
menu do `nav.js` para quem tem `devolucao.acompanhar`.

- Duas listas lado a lado: **Nós coletamos** (por prazo) e **ML devolve** (por dias esperando).
  Abaixo de 900 px empilha, coleta primeiro.
- Cada linha: venda · NF · SKU com o `pecaTexto` · motivo · etapa · **dias até o prazo** ·
  **parado há N dias** · responsável. Vencidos no topo, em vermelho.
- Abrir um caso: as etapas como trilha, os botões da próxima etapa, tentativas,
  anexos, histórico (`devolucao_evento`), e — só para o admin geral — o bloco do dinheiro.
- **Lançar** aceita bipe ou digitação da venda/NF; achando o `lote`, preenche SKU,
  comprador e NF sozinho. Não achando, deixa digitar (devolução antiga).
- Aba **Encerrados** e aba **Relatório do mês**.
- Cadastro de **Transportadoras** dentro da própria tela.

**Alterada, só no mínimo: `/devolucao` (Edvaldo)** — a tarja da R14 e o vínculo
ao salvar. Nada mais.

**Alterada: Admin → Devoluções (baixa)** — motivo vem preenchido do caso (R12).

## 9. Fases

Cada fase serve sozinha. Todas: backup antes, `node --check` em todo `.js` e no
`<script>` de todo `.html` mexido, teste de segurança da §10/§19 do `CLAUDE.md`.

### Fase 1 — O caso e o prazo  🔴
**Entrega:** tabelas `devolucao_caso` e `devolucao_evento`; as três chaves com o
backfill; tela `/devolucao-casos` com lançar, as duas listas, prazo (R3), parado
(R4), espera do ML (R5), etapas manuais com evento (R20), prorrogação (R6),
vencido (R7); motivos novos (R12 + o acréscimo do §6); modo teste cobrindo as
tabelas novas. Script `lancar_casos_iniciais.js` (simula por padrão,
`--aplicar` grava, backup antes) com os 6 casos da tabela de 29/10 (§11).
**Já resolve:** a perda por prazo.

### Fase 2 — A chegada pelo bipe do Edvaldo  🔴
**Entrega:** `/api/devolucao/buscar` passa a achar também o caso aberto (venda,
Pack ID, NF); tarja na `/devolucao`; `POST /api/devolucao` com caso liga
`devolucao_id`, grava `chegou_em` e marca REVISADO; botão "chegou" na tela de
casos para a caixa que chegou e ainda não foi revisada; motivo preenchido na
baixa; encerramento do tipo "ML devolve" (R19).
**Já resolve:** a passagem Renato ↔ Edvaldo e a devolução que nunca chega.

### Fase 3 — Transportadora e tentativas  🟡
**Entrega:** tabela `transportadora` e `devolucao_coleta`; cadastro; tentativas
(R8) com custo opcional; "não achou o cliente" abre nova tentativa; sugestão por
CEP (R10).

### Fase 4 — Documentos e a foto do comprador  🔴
**Entrega:** `devolucao_anexo`; lista `doc_devolucao` (R11) editável; anexar no
tablet/computador (foto reduzida a 1600 px em JPEG, como a coleta); trava da
etapa ③; pasta `DEVOLUCOES` no `caminhos.js` (R21); saída **devolvido ao
comprador** com foto obrigatória (R17), só admin geral.

### Fase 5 — O dinheiro e o relatório  🔴
**Entrega:** valor do ML com situação (R18); saldo do caso (valor ML − custos,
"incompleto" se faltar dado, R9); valor devolvido e valor perdido; baixa do
reembolso (R16, R19); poda dos campos para quem não tem a chave (R15);
relatório do mês por motivo (R22). Auditoria amortecida como a do §18 (uma
linha por pessoa a cada 30 min ao **ver** valores; toda **decisão** registra).

## 10. Testes — todos rodados pelo Claude Code

Arquivo novo **`teste_devolucao_casos.js`**, no padrão do `teste_carga.js`:
banco temporário, handlers chamados direto com `app` de mentira, nunca toca em
`/opt/expedicao`. Os casos abaixo são o mínimo; cada fase acrescenta os seus no
mesmo commit.

**Fase 1 — caso e prazo**
1. Lançar caso `coleta` com venda, NF, SKU, motivo, prazo → etapa `lancado`, evento gravado.
2. Lançar com venda que existe no `lote` → SKU, comprador e NF preenchidos do lote.
3. Lançar com venda que **não** existe no `lote` → aceita (devolução antiga).
4. Segundo caso aberto com a mesma venda → recusado, dizendo qual caso já existe.
5. Mesma venda com o caso anterior **encerrado** → aceita.
6. Caso `coleta` sem prazo → recusado. Caso `ml` sem prazo → aceito.
7. Motivo fora da lista `motivo_devolucao` → recusado.
8. Prazo a 5 dias → sem cor; a 3 → âmbar; a 1 → vermelho; ontem → `vencido`.
9. Limites lidos do `config`: trocar `devol_prazo_ambar` para 4 muda o caso 8.
10. Ordem da lista coleta: vencido, depois prazo mais curto — nunca pela data de lançamento.
11. Etapa sem mudar há 2 dias → `parado: true`; há 1 → `false`.
12. Tipo `ml`: devolve `dias_esperando`, sem cor de prazo.
13. Pedir prorrogação → evento, prazo não muda.
14. Lançar prazo novo → `prazo` muda, `prazo_original` guarda o primeiro, segundo prazo novo **não** sobrescreve o original.
15. Caso vencido **não** encerra sozinho em nenhuma leitura.
16. Encerrar como perda sem `devolucao.dinheiro` → 403. Com a chave → `saida='perda_prazo'`, quem e quando.
17. Toda mudança de etapa grava `devolucao_evento` com de → para e usuário.
18. Motivos novos: banco **vazio** recebe os 7; banco que já tinha os 4 recebe só os 3 novos; motivo apagado depois **não volta** no boot seguinte.
19. Modo teste: caso lançado em teste é apagado no "apagar" e as tabelas novas aparecem cobertas (não entram em `naoCobertas`).
20. `lancar_casos_iniciais.js` sem `--aplicar` não grava nada; com `--aplicar` grava 6; rodar de novo não duplica.

**Fase 2 — chegada**
21. `buscar` com a venda de um caso aberto → devolve o caso.
22. `buscar` com o Pack ID → acha. Com a NF → acha.
23. `buscar` sem caso → responde **igual a hoje** (venda do `lote` ou `achou:false`).
24. `POST /api/devolucao` com caso → `devolucao_id` ligado, `chegou_em` gravado, etapa `revisado`.
25. `POST /api/devolucao` **sem** caso → grava igual a hoje, nenhum caso tocado.
26. `reembalar` com caso → continua inserindo na `fila` com `modo='devolucao'`.
27. Botão "chegou" → `chegou_em` e etapa `chegou`; revisar depois não regrava `chegou_em`.
28. Baixa da devolução ligada → motivo vem do caso; caso `ml` encerra com `saida='revisado_ml'`.
29. Caso `coleta` revisado **não** encerra sem a baixa do reembolso.
30. SKU não cadastrado na `/devolucao` continua recusado (regra atual intacta).

**Fase 3 — transportadora**
31. Cadastrar, editar, desativar transportadora; desativada não aparece para escolher.
32. Tentativa com custo vazio → aceita, `custo` fica `NULL` (nunca 0).
33. `nao_encontrou` → abre a próxima tentativa e volta a etapa para `coleta_pedida`.
34. Tentativas numeradas por caso (1ª, 2ª…).
35. Sugestão por CEP: só transportadoras com tentativa `coletou`, ordenadas por vezes; casa por 5 dígitos antes de 3.
36. Transportadora que só teve `nao_encontrou` naquele CEP **não** é sugerida.

**Fase 4 — documentos**
37. Lista `doc_devolucao` nasce com os 2 documentos; acréscimo de uma vez só como no caso 18.
38. Avançar para `docs_enviados` faltando um documento ativo → recusado, **nomeando** o que falta.
39. Com todos anexados → avança.
40. Documento desativado na lista deixa de ser exigido.
41. Anexo vazio ou que não é `data:image/*` / PDF → recusado.
42. Arquivo gravado em `PCP_DEVOLUCOES_DIR` (pasta temporária no teste), nunca em `lotes/`.
43. Disco recusa a gravação → o anexo não existe no banco (transação).
44. Devolver ao comprador sem foto → recusado; sem `devolucao.dinheiro` → 403; com os dois → `saida='devolvido_comprador'`, quem e quando.

**Fase 5 — dinheiro**
45. Quem **não** tem `devolucao.dinheiro`: a resposta da lista, do caso e do relatório **não contém** `valor_ml`, `custo`, `valor_devolvido`, `valor_perdido`, `saldo` (confere as chaves do JSON, não a tela).
46. Saldo = `valor_ml − soma(custos)`; com um custo `NULL` → `saldo: null, incompleto: true`.
47. Total do mês com algum valor faltando → `piso: true`.
48. Baixa do reembolso `recebido` / `nao_recebido` → só admin geral; encerra o caso `coleta` já revisado.
49. `valor_ml_situacao='pedir'` há 2 dias → entra no parado.
50. Relatório por motivo: caso ligado a uma devolução conta **uma** vez; devolução antiga sem caso conta pelo motivo da baixa.
51. Relatório separa perda por prazo de devolvido ao comprador.
52. Ver valores grava auditoria no máximo 1 vez por pessoa a cada 30 min; cada decisão grava sempre.

**Testes que já existem e têm que continuar passando**
- `node teste_acesso.js` — com casos novos: as 3 chaves nas três pontas, o backfill, `devolucao.dinheiro` intransferível, rotas novas na cobertura e **nenhuma** em `@logado`.
- `node teste_caminhos.js` — com a chave `DEVOLUCOES` (padrão = `/opt/expedicao/devolucoes`, nada colado fora do `caminhos.js`).
- Todos os outros `teste_*.js` da raiz e `cd tecido && npm test`.
- Teste de segurança da §10/§19 com as rotas novas: `/devolucao-casos` → `302`, `/api/devolucao-casos` → `401`, `/login` → `200`.

## 11. Os 6 casos que já existem (tabela de 29/10/2026)

Entram pelo `lancar_casos_iniciais.js` na Fase 1. Tipo `coleta`, responsável
Renato, passado em 29/10/2026, motivo em branco (o Lucas escolhe na tela),
etapa `lancado` com o status atual em `obs`.

| NF | Venda | SKU (como escrito) | Resolver até | Valor ML | Status |
|---|---|---|---|---|---|
| 7336 | 2000018711038526 | 160160branco | 03/11/2026 | 132,72 | — |
| 8040 | 2000015512825367 | 140140bege | 04/11/2026 | — (`pedido`) | Aguardando ML passar valor da coleta |
| 7451 | 2000018750385396 | 160140bege | 04/11/2026 | — | Aguardando ML dar resposta |
| 7245 | 2000015170807257 | 160140bege | 05/11/2026 | 174,87 | — |
| 8271 | 2000018959493934 | 150150bege | 09/11/2026 | 163,74 | — |
| 7675 | 2000015374485377 | 150150branco | 09/11/2026 | 164,04 | — |

> O SKU da tabela não é o código do cadastro (falta o `BK`). O script **não
> adivinha**: busca a venda no `lote` e usa o SKU de lá; não achando, grava o
> texto como veio e marca em `obs` para conferir.

## 12. O que vai para o `CLAUDE.md` quando terminar

Uma seção nova (§9-B), com: R2, R3/R4, R7, R9, R12 + a armadilha do `seed()`,
R14, R15 e R21 — as que **parecem bug e não são** ("o vencido não encerra
sozinho", "custo vazio não é zero", "a lista de motivos é a mesma da baixa").
E as linhas novas no §15 (o que NÃO fazer).
