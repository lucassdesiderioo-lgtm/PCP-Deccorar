> **STATUS · 26/09/2026 — EM CONSTRUÇÃO** · fase 1 em código (26/09): `impresso_por` na
> impressão (a reimpressão não mexe), `conferido_por`/`conferido_em` no bipe atual do
> carregamento, colunas e tabela `saida` criadas (`saida_schema.js`), e o
> `fechar_saida_passivo.js` com `teste_saida.js` (26 casos). Falta: deploy e rodar o script
> em produção; fases 2 a 4.
> Criada em 25/09/2026 · PLANEJADO até a fase 1
> Nasceu da conversa no Projeto "PCP - Deccorar" em 25/09/2026 (NOVIDADE).
> Substitui o "Fechar coleta" de 10/09/2026 (`CLAUDE.md` §8-B), que não foi adotado pela equipe.
> Fases: 1 ☑ (em código, falta produção) · 2 ☐ · 3 ☐ · 4 ☐

---

# Saída com dupla conferência — carro e caminhão no mesmo fechamento

> **Em uma frase:** toda caixa etiquetada é contada duas vezes, por logins que podem
> ser diferentes, e toda saída da fábrica (caminhão da coleta ou viagem à agência)
> fecha com **foto + número de quem recebeu**, comparado com o que o sistema sabe
> que saiu.
>
> **Leia junto com:** `CLAUDE.md` §5 (conferência dupla do carregamento), §8-B (coleta),
> armadilhas #6, #9 e #21 · dívida #13 do §14

---

## 1. O problema

**Antes da coleta**, a conferência era um número na cabeça: *"a agência bipou 90, levamos
90"*. Quando não batia, quem estava lá fazia o atendente revisar na hora, e isso **fez o
erro da agência parar de acontecer**. Só que o número nunca entrou no sistema, e nada
provava o que tinha sido entregue.

**Com a coleta (10/09/2026)**, o sistema ganhou o "Fechar coleta" com foto. **A equipe
não aderiu.** Deixaram de fechar um dia, as caixas acumularam como "esperando o
caminhão", e desde então o número do sistema nunca mais bate com o do motorista.

O que a conversa mostrou:

| Fato | Consequência no desenho |
|---|---|
| O erro acontece **dos dois lados**: da agência ou do motorista (deixou passar) e nosso (ficou aqui, foi sem bipar) | Precisa de uma contagem nossa confiável **e** da contagem de quem recebe |
| O fechamento atual compara **tudo que está no canto** com o motorista | Pular um dia estraga todos os dias seguintes. **Cada saída só pode olhar o que saiu nela** |
| Pode vir **mais de um caminhão** no dia (ex.: 60 e depois 20) | Um fechamento por caminhão, não por dia |
| O motorista bipa **aqui dentro** e leva **o que está pronto**, inclusive adiantadas e, às vezes, **caixas da agência**. Cada motorista faz de um jeito | O sistema **não pode supor** o que ele leva: precisa saber o que **ficou** |
| Às vezes se vai à agência **antes** da coleta (horário) ou **depois** (o que o caminhão não levou) | A porta de saída é **por onde a caixa saiu de verdade**, não a da etiqueta |
| A agência não dá comprovante, mas **dá para fotografar a tela do atendente** | A agência passa a ter foto, igual à coleta |
| Hoje o sistema **não grava quem** imprimiu nem quem bipou no carregamento | Sem isso não há dupla conferência por login |

---

## 2. O fluxo novo

```
① ETIQUETA IMPRESSA ────▶ ② CONFERÊNCIA DA PILHA ────▶ ③ SAÍDA
   bipe 1 (automático)       bipe 2                       ├─ Caminhão da coleta
   grava QUEM imprimiu       grava QUEM conferiu          │    foto + número do motorista
                             "a caixa está na área"       │    + bipe das SOBRAS
                                                          └─ Viagem à agência
                                                               bipe ao entrar no carro
                                                               + foto + número do atendente
```

### ① Bipe 1 — a impressão da etiqueta de venda

Não é um bipe novo: a impressão **já é** um evento por caixa. Passa a gravar **quem**
imprimiu (`lote.impresso_por`).

### ② Bipe 2 — a conferência da pilha

Depois de etiquetar, a mesma pessoa ou outra bipa as caixas que estão na **área de
expedição** (o lugar onde o motorista chega e bipa). Pode ser caixa por caixa, à medida
que chegam, ou a pilha inteira de uma vez. Grava `conferido_por` e `conferido_em`.

- **Toda** etiqueta impressa vai para a área: coleta, agência, do dia ou **adiantada**.
  Regra do dono (25/09/2026).
- A tela mostra ao vivo: **`impressas 70 · conferidas 68 · faltam 2`**, com cliente e NF
  de cada uma que falta. Caixa que chega depois da conferência aparece sozinha em
  "faltam conferir". Ninguém precisa refazer a pilha.
- O bipe 2 **só aceita volume `embalado`**, ou seja, com a etiqueta impressa. Isso fecha
  a dívida #13 (carregamento aceitando `pendente`).
- `bloqueado` continua recusado (§6). A conferência cega do SKU (`conf_carregamento`),
  quando ligada, vale neste bipe como vale hoje.
- A adiantada aparece marcada **"adiantada · despacha dd/mm"**, mas **conta** na pilha:
  está fisicamente lá, e o motorista pode levar.

**Mesmo login nos dois bipes não é proibido.** Fica marcado como **"sem segunda
pessoa"** no fechamento e no painel. Motivo: com pouca gente, uma pessoa imprime e
confere; travar ensinaria a equipe a entrar com o login do colega, e aí o registro
mentiria (armadilha #6).

### ③ A saída

Uma tabela só (`saida`) para as duas portas. Cada linha é **um caminhão ou uma viagem**.

**Caminhão da coleta:**

1. O motorista bipa e carrega. O operador abre **"Saída — caminhão da coleta"**.
2. Fotografa a tela do celular do motorista e digita o número. **Sem foto não fecha** (§8-B).
3. **Bipa as sobras**: o que ficou na área. Botão **"não ficou nada"** para o caso vazio.
4. O sistema calcula: **saíram = conferidas na área, sem saída − sobras**, e compara com o
   número do motorista.

Se o operador pular o passo 3, o sistema acha que tudo saiu, o número não bate e a tela
pede as sobras. O erro se corrige sozinho, em vez de passar calado.

**Viagem à agência:**

1. Cada caixa é bipada **ao entrar no carro**, como hoje. Só aceita caixa **conferida na
   área** (bipe 2 feito).
2. No balcão, depois que o atendente bipa: foto da tela dele e o número.
3. O sistema compara: **saíram = bipadas no carro nesta viagem**.

**Nas duas portas:**

- **Bateu:** fecha. As caixas ganham `saida_id` e `saiu_em` e saem da área.
- **Não bateu:** nada anda. A tela lista as caixas desta saída (e, se for o caso, as
  impressas e não conferidas) para conferir ali mesmo, com o motorista ou o atendente na
  frente.
- **Liberar com divergência: só supervisor ou admin**, com motivo. Fica gravado quem
  liberou e vai para a auditoria. Regra do dono (25/09/2026).
- A caixa pode sair pela porta que não era a da etiqueta: coleta levando caixa de
  agência, ou agência levando caixa de coleta. Isso **não é erro**. Grava-se
  `saiu_por` e a tela mostra "troca de porta". **`lote.modalidade` não muda**: ela é o que
  a etiqueta disse (§8-B, armadilha #21), e `saiu_por` é o que aconteceu.

---

## 3. As contas que a tela mostra

| Número | Conta | Quando diverge, significa |
|---|---|---|
| **Impressas × conferidas** | bipe 1 × bipe 2, caixa a caixa | a caixa **ficou para trás**: etiquetada e não chegou na área |
| **Saíram × número externo** | (área − sobras) ou (bipadas no carro) × foto | o motorista ou o atendente **deixou passar**, ou a caixa **foi sem bipe** |
| **Sem segunda pessoa** | caixas com `impresso_por = conferido_por` | não é erro. É para o dono ver com que frequência acontece |

Como cada bipe é de **uma caixa específica**, a diferença sai com nome, cliente e NF.
Não é preciso uma terceira contagem.

---

## 4. Dados

| Onde | O quê |
|---|---|
| `lote.impresso_por` | login de quem imprimiu a etiqueta (bipe 1). A **reimpressão não muda** esse campo |
| `lote.conferido_por`, `conferido_em` | bipe 2 |
| `lote.no_carro_em`, `no_carro_por` | bipe ao entrar no carro (agência) |
| `lote.saida_id`, `saiu_em`, `saiu_por` | a saída em que a caixa foi embora e por qual porta (`coleta` / `agencia`) |
| **`saida`** (tabela nova) | `id, tipo, aberta_em, fechada_em, fechado_por, qtd_sistema, qtd_externa, divergente, liberado_por, motivo, foto, sobras (json), ids (json), sem_segunda_pessoa` |

- A foto segue a regra do §8-B: arquivo em `caminhos.COLETAS` (nome `saida-<id>`), gravado
  **dentro** da transação, fora de `lotes/`.
- `coleta_fechamento` fica como **história**, só leitura. Fechamento novo vai para `saida`.
- `retirado_em` continua sendo preenchido junto com `saiu_em` nas saídas de coleta, para
  não quebrar relatório antigo. Tela nova lê `saiu_em`.
- Colunas novas entram no `CREATE` **e** no `ALTER`, no fim (§17).

**Permissões** (as três pontas do §5, armadilha #23):

| Ação | Chave |
|---|---|
| Bipe 2, bipe no carro, abrir e fechar saída que bateu | `carregamento.executar` (já existe) |
| **Liberar saída com divergência** | **`saida.liberar`** (nova, `sensivel`), supervisor e admin, com backfill para quem hoje tem nível supervisor ou admin |

---

## 5. Fases

### Fase 1 — Quem fez, e a limpeza · 🔴 (etiqueta e dados)

- Gravar `impresso_por` na impressão (não na reimpressão) e `conferido_por` no bipe atual
  do carregamento.
- Script `fechar_saida_passivo.js` (simula por padrão, `--aplicar` com backup): fecha
  como saída `tipo='passivo'` **todas** as caixas de coleta paradas em "esperando o
  caminhão". O dono confirmou que já saíram todas (25/09/2026). A saída é carimbada na
  data de `carregado_em` de cada caixa, nunca em `now` (regra dos scripts de passivo, §5).
- Teste: impressão grava quem, reimpressão não sobrescreve, script é idempotente e não
  toca em volume `embalado`.

### Fase 2 — A área de expedição (bipe 2) · 🟡

- O bipe do carregamento vira **"conferir na área"**, igual para as duas portas. Toda
  caixa impressa entra na lista, **inclusive adiantada**.
- Só aceita `embalado` (fecha a dívida #13).
- Tela: `impressas · conferidas · faltam`, com a lista das que faltam, e as adiantadas
  marcadas.
- Marca "sem segunda pessoa" por caixa.
- Teste: pendente recusado, adiantada entra na pilha, mesmo login é aceito e marcado,
  a conta impressas × conferidas bate caixa a caixa.

### Fase 3 — Saída do caminhão da coleta · 🟡

- Tabela `saida`; tela "Saída — caminhão da coleta": foto, número, bipe das sobras e
  "não ficou nada".
- Vários caminhões no mesmo dia. Cada saída só olha o que estava na área e não tinha saída.
- Liberar com divergência só com `saida.liberar`.
- Aposenta o botão "Fechar coleta" (a rota antiga passa a recusar, dizendo onde é agora).
- Teste: dois caminhões no dia (60 + 20), sobras, motorista levando caixa de agência
  (troca de porta), divergência sem permissão recusada, dia pulado não contamina o seguinte.

### Fase 4 — Saída da agência · 🟡

- Bipe no carro só aceita caixa conferida na área. Ida à agência antes ou depois da
  coleta, em qualquer ordem.
- Foto + número do atendente, o mesmo fechamento da Fase 3.
- Caixa de coleta indo para a agência: aceita e marcada como troca de porta.
- O relógio de despacho (§8) não muda.
- Teste: agência antes da coleta, agência depois com o que o caminhão deixou, caixa
  não conferida recusada no carro.

---

## 6. Fica de fora

- Duas pessoas bipando **a mesma caixa no mesmo momento**.
- **Bloquear** o mesmo login nos dois bipes (é só marcado).
- Ler o número **da foto** automaticamente. A foto é prova; o número é digitado.
- Integração com o sistema do Mercado Livre para puxar a contagem do motorista.
- Mudar `lote.modalidade` pela porta de saída. Quem decide a modalidade continua sendo a
  etiqueta ou a gestão (§8-B).
- Conferir o **conteúdo** da caixa na saída. Isso é da embalagem e da Etiqueta de Venda
  (§4, armadilha #23).

---

## 7. Decisões do dono (25/09/2026)

1. Dupla conferência = **duas contagens por logins possivelmente diferentes**: a impressão
   é o bipe 1 e a conferência da pilha é o bipe 2.
2. Mesmo login nos dois bipes é **permitido e marcado**, nunca bloqueado.
3. Divergência mostra **as caixas**, não pede nova contagem.
4. Toda etiqueta impressa vai para a área de expedição, **mesmo adiantada**.
5. Cada caminhão e cada viagem à agência tem **fechamento próprio, com foto**.
6. A porta é **por onde a caixa saiu de verdade**. O motorista levar caixa de agência é bom.
7. Liberar saída divergente: **só supervisor e admin**.
8. As caixas acumuladas em "esperando o caminhão" **já saíram**: limpeza feita uma única vez.
