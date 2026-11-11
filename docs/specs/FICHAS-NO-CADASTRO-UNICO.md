# Fichas no cadastro único — as duas fichas técnicas puxando do mesmo material

```
STATUS
Situação: RASCUNHO · aguardando o desenho no Projeto do Claude e a aprovação do dono
Criada em: 11/11/2026
Última atualização: 11/11/2026
Fase atual: nenhuma — nada construído
Fases: 1 ☐  2 ☐  3 ☐  4 ☐  (a 4 pode vir logo depois da 1 na medida padrão — §7)
Risco: 🔴 (schema nos dois bancos, cadastro de material, e a fase 4 mexe em saldo)
Depende de: ORGANIZACAO-DO-SISTEMA (R-ORG-09 a 12), ARRUMAR-O-LUGAR fase 2 (a 1101 Materiais)
             a fase 4 depende também de PRODUCAO-MONTAGEM (a baixa pela ficha, R-CMP-09)
Conferida contra: o `main` de 11/11/2026 (PR #338)
Tipo: NOVIDADE (+ REGRA na fase 4)
```

> É a spec nº 4 da lista do `ORGANIZACAO-DO-SISTEMA.md` §8. O dono pediu para
> trazê-la para a frente (11/11/2026): *"se a gente não unificar esse cadastro de
> materiais já vamos começar bagunçado"*.

## Onde mora

| Tela, aba ou função nova | Nº | Módulo | Bloco | Liga-se a |
|---|---|---|---|---|
| "Código de cadastro" e "Usado em" no material (função na tela que já existe) | 1101 | Cadastros | Comum | 404 e a ficha do sob medida (606/608) apontam o material; 501 e 504 leem |
| A lista de material da ficha do sob medida (função na tela que já existe) | 606 ou 608 (pergunta 1) | Cadastros | Sob medida | 1101 (o material), 501 (a compra), 504 (a contagem) |
| "Consumido por operação" no material (função) | 1101 | Cadastros | Comum | as duas fichas e o que cada operação produziu |

Nenhuma tela nova. Nenhum módulo novo ou inaugurado.

## 1. O problema

| | Medida padrão (Mercado Livre) | Sob medida |
|---|---|---|
| Modelos | ✅ `modelo` | ✅ `sm_modelo` (Rolô, Romana, Painel…) |
| Ficha por modelo | ✅ a 404 (`ficha_formula`) | ✅ a ficha do produto (`sm_ficha_linha`) |
| Cadastro de material | ✅ a 1101 (`componente`) | ❌ não existe |

A ficha do sob medida aponta para `sm_componente`, que **não é cadastro de
material**. É a lista de **peças e etapas de produção**: Tubo, Tecido, Base,
Bandô, Barra, Redução de peso, **Montagem**, **Revisão**, os kits. Cada uma com
o setor que a faz, se gera etiqueta e, algumas, o preço de venda. O único elo com
o material do PCP é o **tubo** (`sm_componente.componente_id` e
`sm_degrau_tubo.componente_id`, fase 4-C), para a lista de compras.

O resto do que vai na persiana sob medida (parafuso, bucha, corrente, ponteira,
o conteúdo dos kits, a embalagem) **não está em lugar nenhum do sistema**: não
entra no custo, não entra na compra e não sai do saldo.

## 2. As respostas do dono (11/11/2026)

1. **Dois nomes de ficha.** *Ficha técnica · Medida padrão* (as do Mercado
   Livre): a lista de material com a fórmula de quanto gasta, para chegar ao
   **custo**. *Ficha técnica · Sob medida*: a lista de material com a fórmula, e
   o **custo e a venda** variam com a largura e a altura.
2. **Um saldo só por material**, e o consumo mostrado **por operação**:
   consumido pela medida padrão × consumido pelo sob medida (R-ORG-10).
3. **Sem campo de "marca da operação"** no material: quem usa sai das fichas
   ("Usado em").
4. **O que o sob medida usa pode ser material NOVO**, e não uma compatibilização
   com o que já existe. Ninguém é obrigado a ligar a um material antigo.
5. **Todo material ganha um código de cadastro** na criação: *"facilita"*.
6. **Logo a saída de material vai ser pelo que foi produzido** — o SKU produzido
   na medida padrão, a persiana pronta no sob medida. **E o dono quer começar já**
   (11/11/2026): *"já podemos fazer essa transformação … o saldo do material ir
   abatendo por persianas produzidas"*.
7. **A baixa pela ficha só vale para o material que foi contado inteiro antes**
   (o dono, 11/11/2026: *"vai funcionar apenas no dia que conseguir parar e fazer
   a contagem de todo o material, como por exemplo dos alumínios"*).
8. **Parafuso e bucha são só do kit da medida padrão** — e lá eles já são linhas
   da própria ficha do modelo (ROLO BK ML). Não existe "receita do kit".
9. **No sob medida, a ficha técnica mora no Catálogo** (a tela do produto, 608),
   junto com o preço e as escolhas. Na medida padrão, a ficha é a 404.
10. **O código de cadastro é `MAT-0001`**, e o "Código (opcional)" de hoje fica
    como código de barras ou do fornecedor.
11. **Catálogo e ficha técnica são a mesma coisa para o dono** (11/11/2026):
    *"ainda achando que os dois é a mesma coisa; porém o catálogo da rolo do
    Mercado Livre chamaria Rolo medida padrão ML"*. Ou seja: um lugar só com os
    produtos das duas operações, cada um com a sua ficha. Ver §3-F.
12. **As duas operações dão saída no fim, quando a peça é EMBALADA** — a medida
    padrão na embalagem (o +1), o sob medida no bipe da embalagem.
13. **A peça refeita não baixa sozinha**: *"às vezes estamos apenas refazendo e
    não teve que trocar material"*.
14. **A peça com problema fica assinalada para o Supervisor**, que no fim do dia
    diz se teve ou não que usar outro material — e só aí baixa. Ver §3-G.

## 3. O que a spec decide

### A. O cadastro de material é um só, e é a 1101

- O material mora no `dados.db` (`componente`), e o sob medida o lê pela porta,
  como já faz com o fornecedor e o almoxarifado (R-ORG-12). Não se funde banco.
- **O `sm_componente` fica**, com o papel que ele tem de verdade: **peça e etapa
  de produção** (setor, etiqueta, preço de venda do adicional). Ele não é
  material e não vira material. Sumir com ele derrubaria a bancada, a etiqueta e
  o preço do bandô.
- A ligação do tubo que já existe (`componente_id`) continua valendo.

### B. O código de cadastro do material

- Todo material nasce com um **código de cadastro automático**, sequencial
  (`MAT-0001`, `MAT-0002`…), que **nunca muda e nunca se reaproveita** — a regra
  do número de tela (R-TEL-02). O material antigo recebe o dele uma vez só, na
  ordem do `id`.
- O campo **"Código (opcional)"** de hoje continua sendo o que é (o código de
  barras ou o do fornecedor), separado. Pergunta 2.
- A busca da 1101, da 404 e da ficha do sob medida acha pelo código de cadastro.

### C. A ficha do sob medida ganha a lista de material

- Cada produto do sob medida passa a ter, além das peças, uma **lista de
  material**: o material da 1101, a fórmula de quanto gasta pela largura e pela
  altura (o mesmo `formula.js` da 404 — uma porta só, sem `eval`), e quando entra
  (sempre, com bandô, com barra… a mesma régua do `quando` de hoje).
- O custo da persiana sob medida passa a somar esse material. **Custo
  indefinido nunca vira zero** (regra 4 do §7-B): material sem preço deixa o
  custo indefinido e diz qual.
- **O preço de venda não muda por esta spec.** Hoje ele sai da tabela do
  catálogo e da revenda; ligar a venda ao custo é outra decisão (fica de fora).
- O material marcado "não vai para a ficha" (`vai_ficha = 0`) é recusado nas
  duas fichas, pelo servidor (R-CMP-02).

### D. "Usado em" e "consumido por operação" na 1101

- Cada material mostra **onde é usado**, lido das duas fichas: *Medida padrão
  (ROLO BK ML · largura / 100) · Sob medida (Romana · …)*. Sem ficha: "não está
  em ficha nenhuma".
- O saldo continua **um só**. Ao lado, **o consumido no período por operação**.
  Até a fase 4, esse número é **calculado pela ficha** (o que cada operação
  deveria ter gasto pelo que produziu), e a tela diz isso. A diferença para o que
  a contagem mostra é a perda.

### E. A saída pelo que foi produzido (fase 4)

- Hoje o material sai do saldo **pela contagem** (`como_sai = contagem`), e a
  saída pela ficha é recusada de propósito até a montagem existir (R-CMP-09).
- Quando o dono ligar: o SKU **embalado** (o +1 da medida padrão) e a persiana
  sob medida **pronta** baixam o material da ficha, pelo `componente_dominio`
  (dono único do saldo de material), com a **operação** gravada em cada linha do
  livro de material. Aí o "consumido por operação" deixa de ser estimativa.
- **Isso muda regra (R-CMP-09) e mexe em saldo**: é fase própria, com linha em
  `DECISOES.md` e teste escrito antes.
- **Liga-se material por material, e só depois de contado** (resposta 7). O
  material já tem o campo "como sai do estoque" (`componente.como_sai`:
  `contagem` · `ficha`); hoje o `ficha` é recusado (R-CMP-09). A proposta é
  aceitar `ficha` só em material com **uma contagem aprovada na 504** — é essa
  contagem que dá o saldo de partida. O alumínio passa para "pela ficha" no dia
  em que todo o alumínio for contado; o que não foi contado continua saindo pela
  contagem, como hoje.
- **A ficha baixa e a contagem continua corrigindo**: a diferença entre as duas
  é a perda (o mesmo que o §7-B já prevê).
- **Medida padrão: o momento é a EMBALAGEM** (o +1 do estoque, §2). ⚠️ **A
  devolução reembalada não baixa material** (`fila.modo='devolucao'`): a peça já
  existia. Embalagem em modo teste também não baixa de verdade.
- **Sob medida: o momento é o bipe da EMBALAGEM** (resposta 12), e só depois da
  fase 2 (sem lista de material não há o que baixar). Uma vez por unidade: a
  persiana embalada de novo depois de uma recusa **não** baixa outra vez.

### F. Um catálogo só, com os produtos das duas operações (fase 5)

- Para o dono, catálogo e ficha técnica são a mesma coisa (resposta 11). Hoje são
  duas telas: a **404 Ficha técnica** (modelo da medida padrão) e o **608
  Catálogo** (produto do sob medida, com preço e escolhas).
- A proposta: **um Catálogo só**, listando os produtos das duas operações, cada
  um marcado (*Medida padrão* · *Sob medida*). O modelo da medida padrão aparece
  com o nome de produto — **"Rolo medida padrão ML"** —, e abrir um produto leva
  à ficha dele.
- **A conta continua diferente em cada operação** (R-ORG-11): fórmula por modelo
  na medida padrão; escada, gomos e folhas no sob medida, com preço de venda. O
  que se junta é **o lugar**, e não a conta.
- É mudança de tela e de lugar (R-ORG), e mexe em duas telas que estão no ar e
  funcionando. **Fica para depois das fases 1 a 4**, que são o que o dono pediu
  primeiro (o material conectado e a baixa).

### G. O material extra fica para o Supervisor decidir (fase 4)

- **Peça com problema na revisão** (medida padrão, `rejeicao`) e **peça recusada
  e refeita** (sob medida, `sm_recusa`) **não baixam material sozinhas**.
- Cada uma vira uma linha **"material extra a decidir"**, com a peça, o SKU ou o
  pedido, quem registrou o problema e quando.
- **O Supervisor, no fim do dia, decide cada linha**: *"não precisou de material"*
  (fecha sem baixar) ou *"usou material"* — escolhe os materiais da ficha daquela
  peça e a quantidade (já vem preenchida com a da ficha, editável), e aí baixa,
  pelo `componente_dominio`, com o motivo `refeito` e quem decidiu.
- Linha não decidida **não some**: aparece na central de Pendências (204) com há
  quantos dias espera, como as outras.
- Material que ainda sai pela contagem não baixa aqui: a linha só fica registrada.

## 4. A passagem

- **Nada é ligado sozinho.** Os materiais do sob medida nascem como materiais
  novos na 1101, pelas mãos de quem cadastra (resposta 4).
- Para o que **já** existe nos dois lados (o tubo), a ligação de hoje fica.
- Se o dono quiser, um script lista os itens do sob medida que **parecem** com
  um material da 1101 (pelo nome), só para conferir — ele não grava nada.

## 5. Fica de fora

- Fundir os dois bancos (R-ORG-12: não está decidido).
- O preço de venda do sob medida calculado pelo custo.
- O tecido do sob medida: continua no `tecido.db` (rolo, sobra, corte), como
  decidido na COMPRAS-E-RECEBIMENTO (R-CMP-49 e 50).
- A ficha da medida padrão: não muda (só ganha o "Usado em" do outro lado).
- O screen na ficha do Rolô (`FICHA-UNICA-ML`, em espera).

## 6. Alçada

- **Telas novas: nenhuma.**
- **Ações novas:** nenhuma prevista. Montar a lista de material da ficha do sob
  medida usa a chave que já edita o produto (`catalogo.editar` do sob medida);
  ver o custo usa a `custo.ver` de lá (a regra do valor, §23). Se o desenho pedir
  uma chave própria, ela nasce só para o Admin Geral (R-ALC-06).
- **Setores novos: nenhum.**

## 7. Fases

### Fase 1 — O código de cadastro e o "Usado em" 🟡
Código automático no material (novo e antigo), busca por ele, e o "Usado em"
lendo a ficha da medida padrão. Sem mexer no sob medida.

### Fase 2 — A lista de material na ficha do sob medida 🔴
Tabela nova no `tecido.db` (a linha de material: produto, material da 1101,
fórmula, quando), a porta de leitura do material do PCP, a tela de montar a
lista e o custo da persiana somando o material. O "Usado em" passa a ler as duas
fichas.

### Fase 3 — O consumido por operação (estimado) 🟡
Na 1101, o consumido no período por operação, calculado pelas duas fichas e pelo
que cada operação produziu, escrito como estimativa.

### Fase 4 — A saída pelo que foi produzido 🔴 (REGRA)
Ver §3-E e §3-G. **Na medida padrão pode vir logo depois da fase 1** (a ficha da 404 já
existe e o ROLO BK ML está lançado); no sob medida, depois da fase 2. Não depende
mais da `PRODUCAO-MONTAGEM`: o evento é a embalagem (proposta, pergunta 6).

### Fase 5 — Um catálogo só 🟡
Ver §3-F. Depois das fases 1 a 4.

## 8. Testes (todos rodados pelo Claude Code)

- O código de cadastro: nasce sozinho, não repete, não muda numa edição, o
  antigo recebe uma vez só (rodar duas vezes não renumera).
- A ficha do sob medida recusa material inexistente, inativo ou com
  `vai_ficha = 0`; a fórmula passa pelo `formula.js`; o custo sem preço fica
  indefinido, dizendo qual material.
- O Rolô do sob medida sem lista de material calcula **exatamente** o que calcula
  hoje (`persiana.test.js`, `pedido.test.js` sem mudar o esperado).
- O "Usado em" conta as duas fichas e não mostra valor sem a chave do valor.
- O saldo do material não se move nas fases 1 a 3 (contagem antes e depois).

## 9. Perguntas ao dono

Respondidas em 11/11/2026: onde se monta a lista do sob medida (no Catálogo, 608),
o formato do código (`MAT-0001`), o kit (não há receita: parafuso e bucha são
linhas da ficha da medida padrão) e a contagem (ficha baixa, contagem corrige).

Respondidas também: o momento da baixa (a embalagem, nas duas), a peça refeita
(não baixa sozinha) e a peça com problema (o Supervisor decide no fim do dia).

Abertas:

8. **Onde o Supervisor decide o material extra?** A 104 Problemas é do mesmo
   assunto (peças com problema), mas é de nível Admin, e o Supervisor não a
   abre. Opções: (a) uma tela nova no módulo Produção, nível Supervisor, bloco
   Comum, ligada à 101 Revisão, à 613 Bancada e à 1101 Materiais (número na
   faixa 100); (b) a 104 passa a ser de nível Supervisor. Recomendação: (a) — a
   104 mostra outras coisas que hoje só o Admin vê.
9. **A ação nova** "Decidir material extra" (`material.extra`, nível Supervisor,
   sensível porque mexe em saldo) nasce só para o Admin Geral, e o dono a dá aos
   Supervisores pela tela de Acessos (R-ALC-06). Confirma?
