# Enviar item faltante — o kit que faltou na caixa do cliente

```
STATUS
Situação: em construção
Criada em: 06/11/2026
Última atualização: 06/11/2026
Fase atual: as 3 em código (06/11/2026) — falta o deploy e a prova na tela
Fases: 1 ☑  2 ☑  3 ☑ (em código, não no ar)
Risco: 🔴 (schema, dinheiro, toca no caso de devolução que está no ar)
Depende de: DEVOLUCOES-ACOMPANHAMENTO (no ar) · QUEM-FEZ-E-REVISAO (no ar, arquivada)
Mudanças no caminho (decisões do dono no plano, 06/11/2026, e o que diverge do texto):
  · Obrigatórios do envio: motivo, item, SKU, comprador, responsável e "via
    publicidade?" nas duas origens; o link da conversa no ML só na origem ML.
  · O prazo do ML do envio pinta o caso até ENCERRAR (o "sair até" do
    WhatsApp, só até ENVIADO).
  · O rastro da saída (R-ENV-17): `lote.saiu_por` é a PORTA (coleta/agência),
    não pessoa — a linha mostra a porta, a data e quem fechou a saída
    (`saida.fechado_por`; na agência, também quem levou).
  · Segundo envio aberto na mesma venda: 409 (a recusa de duplicado que já
    existe), e não 400 como o §10 escreve (caso 11).
  · Feriado: a única régua de dia útil com feriado é a do sob medida (outro
    banco, `sm_feriado`); não foi usada. Feriado conta como dia útil.
  · A devolução (coleta/ml) lançada com um envio aberto na mesma venda também
    é aceita, com aviso (o simétrico do R-ENV-16).
  · O envio não troca de tipo, não aparece nas portas do Edvaldo, e recusa
    perda, devolver ao comprador, reembolso e "a caixa chegou".
  · A origem se troca só antes de ENVIADO; ENVIADO sai de Lançado ou Embalado.
  · Fase 2: ENVIADO é `POST …/enviar` (a mesma porta corrige depois, "frete
    trocado" sem o número); o frete é de quem lança ou acompanha; ML AVISADO
    é o `aviso-ml` de sempre, com o anexo `print_ml`; os prints são só do
    envio, e o envio não aceita documento da coleta nem foto do comprador.
  · Fase 3: o rastro vai no `GET` do caso (`rastro`, só no envio), sem rota
    nova; o relatório ganha `envio` (casos, reputação sim/não/sem resposta,
    confirmados, sem confirmação, abertos), a coluna `envio` por motivo e,
    só com `devolucao.dinheiro`, `dinheiro.frete_envio`. O Desempenho conta o
    envio: prazo do ML cumprido encerrando, "sair até" cumprido enviando.
  · Regras que parecem bug: `CLAUDE.md` §9-B, bloco "O TERCEIRO TIPO".
  · No WhatsApp, "Comprador avisado" leva sozinho a "Aguardando confirmação"
    (evento `auto`), e o desfazer desse clique volta as duas.
```

> Desenhada no Projeto do Claude em 06/11/2026, com o Lucas.
> Onde esta spec e o `CLAUDE.md` divergirem, vale o `CLAUDE.md` (§13).
> É uma **extensão** da tela 252 (`/devolucao-casos`, §9-B do `CLAUDE.md`):
> tudo o que não está escrito aqui segue as regras de lá.

---

## 1. O problema

A persiana sai e, às vezes, **sem o kit de instalação**. Hoje há uns 3 casos
abertos. O comprador avisa de dois jeitos:

| Origem | Prazo | Risco |
|---|---|---|
| **Reclamação no ML** | o ML dá um prazo para resolver | perder o prazo prejudica a reputação |
| **WhatsApp ou outro canal** | nenhum | se demorar, o comprador **abre reclamação no ML** |

O caminho de hoje é feito de memória: o Lucas vê o problema pelo e-mail → o kit
é embalado → o Renato despacha pela transportadora (Log) → o link de rastreio
vai para o comprador → um print vai para o ML dizendo que foi enviado → espera
o comprador confirmar que recebeu, que é o que o ML pede para fechar.

Não existe lugar que diga **quais casos estão abertos, em que passo, e há
quanto tempo** — e é preciso conferir todo dia, de cabeça, se o kit saiu.

## 2. O objetivo

1. **Todo envio de item faltante nasce no sistema**, do ML ou do WhatsApp, no dia em que o problema chega.
2. **Nenhum caso fica parado calado:** prazo do ML com cor; no WhatsApp, prazo interno de **1 dia útil** para sair.
3. **O caso só fecha com o comprador confirmando** — ou por decisão do dono, com prova.
4. **Saber quanto custa:** o frete de cada envio é obrigatório, e a reputação afetada (sim/não) também.
5. **Saber quem trabalhou naquela venda**, pela venda ou pela NF.

## 3. Como funciona na fábrica

```
LANÇAR  (venda ou NF · origem: ML ou WhatsApp · item · motivo · prazo do ML se for ML)
  ① LANÇADO              prazo: ML → o do ML · WhatsApp → sair até o fim do próximo dia útil
  ② EMBALADO             o item foi separado e embalado
  ③ ENVIADO              transportadora + código de rastreio + FRETE (obrigatórios)
  ④ COMPRADOR AVISADO    o link de rastreio foi mandado ao comprador
  ⑤ ML AVISADO           print anexado (só origem ML; no WhatsApp a etapa não existe)
  ⑥ AGUARDANDO CONFIRMAÇÃO   cada cobrança ao comprador vira linha na história
  ⑦ ENCERRADO            comprador confirmou + reputação respondida

  Saída de exceção (só devolucao.dinheiro):
     • ENTREGUE SEM CONFIRMAÇÃO — rastreio diz entregue, o comprador não confirma;
       print do rastreio anexado + reputação respondida
```

**Quem faz o quê**

| Pessoa | Faz |
|---|---|
| Quem lança (hoje, o Lucas — pós-venda) | lança o caso quando o problema chega |
| Quem acompanha (hoje, o Renato) | embala, despacha, lança frete e rastreio, avisa comprador e ML, cobra a confirmação |
| Admin geral (Lucas) | encerra como "entregue sem confirmação" |

## 4. Regras de negócio

**R-ENV-01 — Terceiro tipo de caso, mesma tela.** `devolucao_caso.tipo` ganha
`'envio'` ("Enviar item faltante"), ao lado de `'coleta'` e `'ml'`. É o único em
que a peça **sai** da fábrica. Busca, história (`devolucao_evento`), anexos,
parado, próximo passo, responsável, "Meus casos", desfazer do último clique e o
"mesmo comprador" valem como nos outros tipos. `devcaso_dominio.js` continua o
**dono único** do caso — o tipo novo entra lá, não numa rota paralela.

**R-ENV-02 — Origem obrigatória.** `origem` = `ml` · `fora_ml` (tela: "Mercado
Livre" / "WhatsApp ou outro canal"). Vazio é recusado (400): esquecer não pode
contar como uma das duas.

**R-ENV-03 — O prazo depende da origem.**
- `ml`: o prazo do ML é **obrigatório** no lançamento e se comporta como o da
  coleta — cores do `config` (`devol_prazo_ambar`, `devol_prazo_vermelho`),
  prorrogação pedida vira evento, prazo novo guarda o original.
- `fora_ml`: o sistema calcula **"sair até"** = fim do **próximo dia útil**
  depois do lançamento (seg–sex; dia útil a partir do `config`
  `envio_fora_ml_dias_uteis=1`). Vale **até a etapa ③ ENVIADO**. Depois de
  enviado, não há prazo — vale o parado.
- Feriado conta como dia útil nesta versão (fica de fora, §5). Se o projeto já
  tiver uma régua de dia útil com feriado, o Claude Code usa ela e anota no STATUS.

**R-ENV-04 — Vencido não encerra sozinho** (R7 da tela 252). O caso vencido
fica vermelho no topo da lista do tipo até alguém agir. Nenhuma leitura encerra.

**R-ENV-05 — Parado grita.** `devol_parado_dias` (2) vale para todo o tipo
`envio`, inclusive "aguardando confirmação" — é ele que cobra o caso do
WhatsApp depois de enviado.

**R-ENV-06 — O item enviado é escrito no caso.** Campo `item_enviado`, nasce
**"Kit de instalação"** e é editável — hoje é sempre o kit, mas qualquer coisa
que a fábrica precise mandar ao comprador entra pelo mesmo tipo.

**R-ENV-07 — O motivo é da lista de sempre.** `motivo_devolucao`, a mesma da
tela 252 (R12). No tipo `envio` nasce em **"Falta de kit"**, editável. Uma
lista só, senão o relatório por motivo parte em dois.

**R-ENV-08 — O envio NÃO mexe no estoque.** Decisão do dono (06/11/2026): kit
avulso não entra na conta. Nenhuma etapa do tipo `envio` escreve em `skus`,
`componente`, `fila` ou `montagem` — há teste travando.

**R-ENV-09 — ENVIADO exige transportadora, rastreio e frete.** A etapa ③ só
avança com:
- transportadora da tabela `transportadora` (a mesma da coleta, R8/R10);
- código de rastreio (texto, sem espaço nas pontas, não vazio);
- **frete > 0** em `custo_envio`.

O frete se sabe na hora de gerar a etiqueta da transportadora (dono,
06/11/2026), então ninguém fica sem o número. Frete zero ou vazio é recusado:
**custo vazio nunca vira zero** (R9). Se um dia o envio for de graça, isso é
uma `REGRA` nova, não um zero digitado.

**R-ENV-10 — Quem vê o frete segue a regra de 03/11/2026** (§9-B, "os valores
são de quem lança e acompanha"): **vê e lança** quem tem `devolucao.lancar` ou
`devolucao.acompanhar`. O `custo_envio` entra na lista `DINHEIRO` do
`devcaso_dominio.js`, então **não viaja** para quem não tem nenhuma das três
chaves. Os **totais em reais** do relatório só com `devolucao.dinheiro`. A
história diz "frete lançado / trocado", **nunca o número**.

**R-ENV-11 — ML AVISADO pede o print.** Só na origem `ml`. A etapa ⑤ exige um
anexo tipo `print_ml` (o print mandado ao ML). Na origem `fora_ml` a etapa
**não existe** — não aparece na trilha e a rota recusa marcá-la.

**R-ENV-12 — Cada cobrança ao comprador é história.** Botão "Cobrei a
confirmação" em ⑥ grava evento (`cobranca`, com texto opcional). Não muda a
etapa e **não zera o parado** — o parado mede a etapa, não o esforço.

**R-ENV-13 — Fim normal: o comprador confirmou.** Botão "Comprador confirmou"
encerra (`saida='confirmado'`), e **exige a reputação respondida** (R-ENV-15).

**R-ENV-14 — Fim de exceção: entregue sem confirmação.** Só com
`devolucao.dinheiro` (a chave das decisões do caso), e só a partir de ⑥.
Exige anexo tipo `print_rastreio` (o rastreio dizendo entregue) e a reputação
respondida. `saida='entregue_sem_confirmacao'`, com quem e quando. É exceção
que o dono vê, não costume: o relatório conta separado.

**R-ENV-15 — "Afetou a reputação?" é obrigatório para encerrar.** Coluna
`reputacao` = `sim` · `nao`. Vazia **não é "não"**: sem resposta, os dois
fins recusam (400), e a recusa diz o que falta. Pode ser respondida antes do
fim (o campo fica no alto do caso). Não é dinheiro: todo mundo que abre o caso vê.

**R-ENV-16 — Um caso de envio aberto por venda.** Dois casos `envio` abertos
com a mesma venda são recusados, dizendo qual existe. Caso de **outro tipo**
aberto para a mesma venda (uma devolução) **não recusa — avisa**, com o número
do caso, como o "mesmo comprador": são problemas diferentes da mesma venda.

**R-ENV-17 — O rastro da venda mostra só o que o sistema PROVA.** No caso,
puxado pelo `lote` da venda (ou da NF), o bloco **"Quem trabalhou nesta
venda"** mostra, com nome e data: quem **imprimiu** a etiqueta de venda
(`impresso_por`), quem **conferiu** (`conferido_por`), quem pôs **no carro**
(`no_carro_por`) e a **saída** (`saiu_por`), quando existirem.

> ⚠️ **QUEM EMBALOU NÃO APARECE, e não é esquecimento.** A embalagem grava quem
> fez (`montagem.usuario_id`), mas ela soma **estoque por SKU** — não se liga a
> nenhuma venda (§4 do `CLAUDE.md`). A etiqueta de venda pega depois uma peça
> qualquer daquele SKU da prateleira. Mostrar "quem embalou" seria **adivinhar**
> entre todos que embalaram aquele SKU nos dias antes — e uma lista que acusa
> inocente é a armadilha #10. O vínculo saco → venda é assunto para uma `REGRA`
> própria (§5).

**R-ENV-18 — Volume sem `lote` também lança.** Venda antiga ou sem registro:
o caso nasce com o que foi digitado, e o bloco do rastro diz "venda não está
no sistema". O vínculo é bônus, não requisito (§9).

**R-ENV-19 — Relatório do mês, na régua de sempre** (R22). O tipo `envio` conta
nos casos do mês por motivo, e o relatório ganha, para ele:
quantos casos · quantos **afetaram a reputação** · quantos encerrados **sem
confirmação** · e — só com `devolucao.dinheiro` — o **frete total**.

## 5. Fica de fora

- Mandar mensagem ao comprador ou ao ML pelo sistema — os avisos são marcados à mão.
- Puxar a reclamação direto do ML (projeto da API do ML).
- Baixar o kit do estoque (R-ENV-08).
- Feriados no "1 dia útil" (R-ENV-03).
- Ligar o saco embalado à venda para saber quem embalou (R-ENV-17) — `REGRA` própria se o dono quiser.
- Shopee e sob medida.

## 6. Dados

> Coluna nova entra no `CREATE TABLE` do `devcaso_dominio.js` **e** no `ALTER`
> guardado, no fim, no mesmo commit (§17). `devolucao_caso` já está coberta
> pelo modo teste — confirmar que continua fora de `naoCobertas`.

```sql
-- devolucao_caso: colunas novas (no fim)
origem        TEXT,   -- 'ml' | 'fora_ml'   (só tipo 'envio')
item_enviado  TEXT,   -- nasce 'Kit de instalação'
sair_ate      TEXT,   -- YYYY-MM-DD, calculado (fora_ml)
rastreio      TEXT,
transportadora_id INTEGER,
custo_envio   REAL,   -- DINHEIRO (R-ENV-10)
enviado_em    TEXT,
reputacao     TEXT    -- 'sim' | 'nao' | NULL
```

- `ETAPAS.envio = ['lancado','embalado','enviado','comprador_avisado','ml_avisado','aguardando_confirmacao','encerrado']`
  (`ml_avisado` só existe com `origem='ml'`).
- `MANUAIS.envio = ['lancado','embalado','comprador_avisado']` — `enviado` e
  `ml_avisado` têm porta própria por exigirem dado/anexo; `aguardando_confirmacao`
  vem sozinha depois do último aviso; `encerrado` é decisão.
- `NOME_SAIDA` ganha `confirmado` e `entregue_sem_confirmacao`.
- `devolucao_anexo.tipo` aceita também `print_ml` e `print_rastreio`, na mesma
  pasta `caminhos.DEVOLUCOES` (R21 — prova não expira).
- `config`: `envio_fora_ml_dias_uteis = 1`.

## 7. Acesso

**Nenhuma chave nova.** O tipo `envio` usa as três que já existem:

| Chave | No tipo `envio` |
|---|---|
| `devolucao.lancar` | lançar e editar o caso; vê e lança o frete |
| `devolucao.acompanhar` | mover etapas, enviar, avisos, cobrança, anexos, reputação; vê e lança o frete |
| `devolucao.dinheiro` | encerrar como "entregue sem confirmação"; totais em reais do relatório |

Rotas novas, se houver, entram em `permDaRota()` e na lista de cobertura —
**nenhuma** em `@logado`. Toda escrita grava quem fez pelo `quem.js`.

## 8. Tela

`/devolucao-casos` (252) — **contexto escuro**, linguagem de sempre.

- **Terceira lista: "Enviar item faltante"**, ao lado de "Nós coletamos" e "ML
  devolve" (abaixo de 900 px empilha: coleta, envio, ML). Ordem: vencido → prazo
  mais curto (ML e "sair até" na mesma régua de data) → sem prazo, mais parado primeiro.
- Linha: venda · NF · comprador · item · origem (chip "ML" / "WhatsApp") · etapa ·
  prazo com cor · parado há N dias · responsável.
- **Lançar** ganha o tipo "Enviar item faltante": venda ou NF (bipe ou
  digitação, preenche do `lote`), origem, item (já com "Kit de instalação"),
  motivo (já com "Falta de kit"), prazo do ML quando a origem é ML.
- **Caso aberto:** trilha das etapas (sem "ML avisado" no WhatsApp); bloco
  **Envio** (transportadora, rastreio, frete); "Afetou a reputação?" no alto;
  botões "Cobrei a confirmação", "Comprador confirmou" e — só com
  `devolucao.dinheiro` — "Entregue sem confirmação"; bloco **"Quem trabalhou
  nesta venda"** (R-ENV-17); história e anexos como nos outros tipos.
- **Próximo passo** (como em `DEVOLUCOES-PROXIMO-PASSO`): uma frase por etapa —
  "Embalar o kit", "Despachar até DD/MM", "Mandar o rastreio ao comprador",
  "Avisar o ML com o print", "Cobrar a confirmação do comprador (há N dias)",
  "Responder se afetou a reputação".

## 9. Fases

Todas: backup antes, `node --check` em todo `.js` e no `<script>` de todo
`.html` mexido, teste de segurança da §10/§19 do `CLAUDE.md`.

### Fase 1 — O caso e o prazo  🔴
**Entrega:** tipo `envio` no `devcaso_dominio.js` (colunas da §6, etapas,
manuais, nomes); lançar com origem, item, motivo e prazo (R-ENV-02, 03, 06, 07,
16, 18); "sair até" de 1 dia útil; cores, vencido, parado (R-ENV-04, 05);
terceira lista na tela; próximo passo; etapas manuais com evento e desfazer.
**Já resolve:** nenhum caso esquecido e o kit do WhatsApp saindo em 1 dia útil.

### Fase 2 — Enviar, avisar e encerrar  🔴
**Entrega:** etapa ENVIADO com transportadora, rastreio e frete (R-ENV-09) e a
poda do frete (R-ENV-10); anexos `print_ml` e `print_rastreio`; ML AVISADO com
print (R-ENV-11); aguardando confirmação, cobrança (R-ENV-12); reputação
(R-ENV-15); os dois fins (R-ENV-13, 14).
**Já resolve:** o caso inteiro dentro do sistema, com o custo de cada envio.

### Fase 3 — Rastro e relatório  🟡
**Entrega:** bloco "Quem trabalhou nesta venda" (R-ENV-17, 18); relatório do
mês com o tipo `envio` (R-ENV-19).
**Já resolve:** saber o quanto a falta de kit custa e quem tocou na venda.

## 10. Testes — todos rodados pelo Claude Code

No **`teste_devolucao_casos.js`** (e no `_tela.js` para o que é da tela),
banco temporário, nunca em `/opt/expedicao`. Os casos são o mínimo; cada fase
entra no mesmo commit.

**Fase 1 — caso e prazo**
1. Lançar `envio` origem `ml` com venda, motivo e prazo → etapa `lancado`, evento gravado, `item_enviado='Kit de instalação'`, motivo "Falta de kit".
2. Lançar `envio` sem origem → 400. Origem fora de `ml`/`fora_ml` → 400.
3. Origem `ml` sem prazo → 400. Origem `fora_ml` sem prazo → aceita e grava `sair_ate`.
4. `sair_ate`: lançado na segunda → terça; na sexta → segunda; no sábado e no domingo → segunda (fim do próximo dia útil).
5. Trocar `envio_fora_ml_dias_uteis` para 2 muda o caso 4.
6. `sair_ate` amanhã → vermelho conforme o `config`; ontem e ainda não enviado → `vencido`; depois de ENVIADO, `sair_ate` não pinta mais o caso.
7. Prazo do ML no `envio`: cores, prorrogação pedida (evento, prazo igual), prazo novo guardando o original — mesmos casos da coleta.
8. Vencido não encerra em nenhuma leitura (lista, caso, encerrados, busca chamados várias vezes).
9. Etapa parada há 2 dias → `parado: true`; inclusive em `aguardando_confirmacao`.
10. Venda que existe no `lote` → comprador, SKU e NF preenchidos; venda que não existe → aceita.
11. Segundo `envio` aberto para a mesma venda → 400 dizendo qual caso existe; com o anterior encerrado → aceita.
12. `envio` com uma devolução (`coleta`/`ml`) aberta na mesma venda → aceita e devolve o aviso com o número do caso.
13. Motivo fora da lista → 400. Item vazio → 400.
14. Marcar `enviado` ou `ml_avisado` pela rota de etapa manual → 400 (têm porta própria).
15. Ordem da lista: vencido, depois a data mais próxima entre prazo do ML e `sair_ate`, depois sem prazo pelo mais parado.
16. Nenhuma escrita do tipo `envio` mexe em `skus.estoque`, `componente.estoque`, `fila` ou `montagem` (contagem antes = depois, em todas as rotas do tipo).
17. Modo teste: caso `envio` lançado em teste é apagado no "apagar"; `devolucao_caso` fora de `naoCobertas`.
18. Banco novo e banco com a tabela antiga terminam com as mesmas colunas, na mesma ordem (§17).

**Fase 2 — enviar e encerrar**
19. ENVIADO sem transportadora, sem rastreio, com frete vazio, com frete 0 ou negativo → 400, a recusa nomeando o que falta.
20. ENVIADO completo → `enviado_em`, `custo_envio`, evento "frete lançado" **sem o valor** no texto.
21. Transportadora desativada não é aceita.
22. Quem não tem `lancar`, `acompanhar` nem `dinheiro`: lista, caso, encerrados e busca **sem** `custo_envio` (varre as chaves do JSON).
23. Quem tem só `acompanhar` vê e lança o frete.
24. ML AVISADO na origem `ml` sem anexo `print_ml` → 400; com → avança.
25. ML AVISADO na origem `fora_ml` → 400; a trilha da origem `fora_ml` não contém `ml_avisado`.
26. Depois do último aviso (comprador na `fora_ml`, ML na `ml`) a etapa vai para `aguardando_confirmacao` sozinha.
27. "Cobrei a confirmação" → evento `cobranca`; etapa igual; `etapa_desde` igual (o parado não zera).
28. "Comprador confirmou" sem reputação → 400 dizendo que falta; com `sim` ou `nao` → `saida='confirmado'`, encerrado, quem e quando.
29. Reputação fora de `sim`/`nao` → 400; reputação vazia nunca conta como `nao`.
30. "Entregue sem confirmação" sem `devolucao.dinheiro` → 403; com a chave e sem `print_rastreio` → 400; sem reputação → 400; com tudo → `saida='entregue_sem_confirmacao'`.
31. "Entregue sem confirmação" antes de `aguardando_confirmacao` → 400.
32. Anexos `print_ml` e `print_rastreio` gravados em `PCP_DEVOLUCOES_DIR`, nunca em `lotes/`; disco recusou → anexo não existe.
33. Desfazer do último clique funciona nas etapas manuais do `envio` e não desfaz ENVIADO nem encerramento.

**Fase 3 — rastro e relatório**
34. Caso com venda no `lote` impressa, conferida e carregada → o bloco traz os quatro nomes com data, saídos das colunas `*_por`/`*_por_id`.
35. Venda ainda não impressa → o bloco mostra só o que existe, sem nome inventado.
36. Venda fora do `lote` → "venda não está no sistema".
37. O bloco **nunca** traz nome tirado de `montagem` (R-ENV-17).
38. Relatório do mês: casos `envio` por motivo, `reputacao='sim'` contados, `entregue_sem_confirmacao` separado; caso `envio` conta uma vez.
39. Frete total do mês só com `devolucao.dinheiro`; sem a chave a resposta não tem a chave do total.

**Testes que já existem e têm que continuar passando**
- `teste_devolucao_casos.js` e `teste_devolucao_casos_tela.js` inteiros — `coleta` e `ml` sem mudança nenhuma.
- `teste_acesso.js` (rotas novas na cobertura, nenhuma em `@logado`), `teste_quem.js` (toda escrita nova grava quem fez), `teste_caminhos.js`.
- Todos os `teste_*.js` da raiz e `cd tecido && npm test`.
- Teste de segurança: `/devolucao-casos` → `302`, `/api/devolucao-casos` → `401`, `/login` → `200`.

## 11. Os casos que já existem

Os ~3 casos de kit faltante abertos hoje são lançados **pela própria tela**
depois da Fase 1 (são poucos; não precisa de script). Na Fase 2, os que já
saíram recebem frete e rastreio pela tela também.
