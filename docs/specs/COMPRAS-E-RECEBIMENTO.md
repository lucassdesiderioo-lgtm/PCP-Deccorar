# Compras e Recebimento: do cadastro de material ao almoxarifado

```
STATUS
Situação: em construção (execução contínua das fases 1 a 11 autorizada pelo dono em 07/11/2026)
Criada em: 06/11/2026
Última atualização: 07/11/2026
Fase atual: ver o diário de construção logo abaixo
Fases: 1 ☑  2 ☑  3 ☑  4 ☐  5 ☐  6 ☐  7 ☐  8 ☐  9 ☐  10 ☐  11 ☐
Decidido em 07/11/2026: fase 10 = o PCP é dono do endereço, o sob medida do rolo e
da sobra (R-CMP-50) · fase 11 construída sem certificado, pronta para recebê-lo
Risco: 🔴 (schema, estoque de material, custo, acesso, dado do sob medida)
Depende de: COMPRAS.md (fases 0–6 no ar) · ACESSO-POR-TELA-E-NIVEL (mapa de telas)
            · QUEM-FEZ-E-REVISAO (quem.js) · SOBMEDIDA-PEDIDO-REVENDA 4-C (a porta)
Substitui: as decisões do COMPRAS.md listadas na §2 (o resto do COMPRAS.md continua valendo)
Tipo: REGRA + NOVIDADE
```

## Diário de construção (STATUS por fase)

> O dono autorizou em 07/11/2026 a construção das onze fases sem parar para
> "pode seguir" entre elas: o PLANO de cada fase fica gravado aqui, no formato
> do `CLAUDE.md` §0, em vez de esperar aprovação. O dono entra no fim, para o
> deploy.

### Fase 0 — o papel (07/11/2026)

- Spec salva aqui; as 15 decisões em `docs/DECISOES.md`; índice em
  `docs/specs/README.md`; nota no STATUS do `COMPRAS.md`.
- **As "15 decisões anexas" não vieram num arquivo à parte**: o anexo foi só
  esta spec. As 15 linhas do `DECISOES.md` saíram dela: as 9 da §2, mais
  R-CMP-11 (um fornecedor só), R-CMP-13 (marketplace é canal), R-CMP-38
  (vários almoxarifados), R-CMP-49 (uma porta de entrada para o tecido) e as
  duas de 07/11/2026 (R-CMP-50 e a fase 11 sem certificado).

**Conferência do `main` (commit `077fa38`) contra a §11 — divergências:**

| §11 diz | O código diz | O que vale |
|---|---|---|
| a spec conferiu o commit `f431fe2` | o `main` está no `077fa38` (06/11: tarja "sem estoque", CONSERTO) — nada de Compras mudou entre os dois | o código |
| `componente` e as tabelas de compra em `compras_schema.js` | sim; e já têm `marca`/`modelo` (cadastro de produto do sob medida) e o id de quem fez (QUEM-FEZ fase 7) | o código |
| o status `enviado` vira `comprado` | o `enviado` é lido em 5 lugares: `pedido_route`, `receb_route`, `compras_route` (a caminho), `index.html` e `recebimento.html` | a migração renomeia o valor gravado e os 5 lugares mudam juntos (fase 2) |
| "contagem de material na tela antiga" | ela mora na **302 Contagem** (`cont_route.js`, `/admin/contagem`), aplicando por `contagem_pendente` | a 504 nova é por almoxarifado; a da 302 continua até a 504 provar (fase 6) |
| COMPRAS.md §11 manda `dominio/ dados/ rotas/` | o projeto segue no padrão de arquivos soltos na raiz | o padrão de hoje (`CLAUDE.md` §7-B, dívida) |
| `sm_boleto` como formato das parcelas | `sm_boleto` guarda o valor em **centavos** (`valor_centavos`), vencimento `AAAA-MM-DD`, `pago_em`/`pago_por` | `pagamento_parcela` usa `valor_centavos` também, para o financeiro juntar sem tradução |
| `armazem → haste → andar → nivel` do sob medida | `armazem` tem chave texto (`ROLO`, `SOBRA`), e `rolo.nivel_id`/`sobra.nivel_id` são chave estrangeira para `nivel` do `tecido.db` | a fase 10 guarda o nível do PCP AO LADO (`nivel_pcp_id`), e não troca a chave estrangeira |

### Fase 1 — o cadastro de material (07/11/2026) ☑

```
📋 PLANO
Tipo: FASE 1 da spec COMPRAS-E-RECEBIMENTO        Risco: 🔴
O que vai ser feito: as colunas novas do material (R-CMP-01 a 10), o almoxarifado
  (só o nome), a categoria, o backfill, a 404 filtrando vai_ficha e Pendências de cadastro.
O que vou mudar: compras_schema.js (colunas, almoxarifado, backfill) · material_dominio.js
  (novo, as regras) · material_route.js (novo) · compras_route.js (POST /api/componentes
  chama o domínio) · ficha_route.js (recusa vai_ficha=0) · cad_route.js (categorias) ·
  pendencias_dominio.js (linha nova) · acesso.js/permissoes.js/telas.js (almoxarifado.cadastrar)
  · public/compras_abas.js (novo) e index.html (abas da 501, 404 filtrando)
Regra de negócio muda? SIM → antes: material nascia só com nome; todo material ia para a
  ficha. Depois: modo de saldo obrigatório; vai_ficha separa (DECISOES.md, 06/11/2026)
Como vou testar: teste_material.js (novo, escrito antes) e teste_acesso_compras.js (novo);
  teste_componentes.js; defeitos reintroduzidos; a tela aberta no navegador
Fica de fora: endereço do almoxarifado (fase 5); o uso do modo de saldo no recebimento (fase 3)

🔐 ALÇADA
Telas novas: nenhuma (a 501 ganha abas: Materiais, Almoxarifados)
Ações novas: almoxarifado.cadastrar · admin · 501 · não sensível
Setores novos: nenhum
Quem recebe: quem tem componente.cadastrar (backfill da spec §7); o resto, só o Admin Geral
```

**Feito.** `teste_material.js` 57 casos; cinco defeitos reintroduzidos um a um (sem o
modo obrigatório reprova 1; desmarcar livre, 4; "ficha" escolhível, 2; ficha aceitando o
café, 1; sem o backfill, 1). `teste_acesso_compras.js` 10. Tela aberta a 1440 px:
abas, lista, formulário de material novo salvando.

### Fase 2 — fornecedor e pedido (07/11/2026) ☑

```
📋 PLANO
Tipo: FASE 2 da spec COMPRAS-E-RECEBIMENTO        Risco: 🔴
O que vai ser feito: fornecedor com tipo e dados de pagamento; canal e loja; status
  comprado (com nº externo e data); alçada; compra por kg com declarado; parcelas;
  anexos; compra rápida.
O que vou mudar: compras_schema.js (colunas, 3 tabelas, migração enviado→comprado) ·
  compra_dominio.js e compra_route.js (novos) · pedido_route.js (kg, poda das parcelas,
  /enviar aposentado, /pagar por parcela) · receb_route.js e compras_route.js (o status
  comprado; fornecedor pela #33 e com poda) · caminhos.js (ANEXOS_COMPRAS) ·
  pendencias_dominio.js · acesso/permissoes · public/compras_abas.js
Regra de negócio muda? SIM → antes: rascunho→enviado, sem aprovação, pago era marca.
  Depois: comprado com canal/nº/data, alçada por pessoa, parcelas (DECISOES.md 06/11)
Como vou testar: teste_pedido_compra.js (novo, antes do código), teste_acesso_compras.js,
  teste_caminhos.js; defeitos reintroduzidos; tela no navegador
Fica de fora: o recebimento novo (fase 3); a nota (fase 4)

🔐 ALÇADA
Telas novas: nenhuma (a 501 ganha Fornecedores, Pedidos, Compra rápida)
Ações novas: pedido.aprovar · admin · 501 · sensível
             nota.lancar · admin · 501 · não sensível (adiantada da fase 4)
             alcada.definir · admin_geral · 501 · sensível, intransferível
Setores novos: nenhum
Quem recebe: pedido.aprovar ← pedido.criar; nota.lancar ← pedido.pagar; alcada.definir só o Admin Geral
```

**Feito.** `teste_pedido_compra.js` 64 casos; dez defeitos reintroduzidos um a um (sem a
alçada reprova 9; qualquer um aprovando, 4; sem motivo, 3; parcelas sem poda, 1; Pix sem
poda, 1; pago sem derivar, 1; compra rápida furando a alçada, 2; sem a migração, 2; sem o
nº externo, 12). `teste_acesso_compras.js` 30. Tela: pedido por kg comprado pela 501.

### Fase 3 — o recebimento (07/11/2026) ☑

```
📋 PLANO
Tipo: FASE 3 da spec COMPRAS-E-RECEBIMENTO        Risco: 🔴
O que vai ser feito: a 502 nova — fila de comprados sem preço e sem o esperado, os três
  modos, contagem cega, pesagem obrigatória por kg, as réguas e as três faixas, retenção e
  liberação (501 e Pendências), custo por unidade recebida, fator real, prazo medido,
  "levar para".
O que vou mudar: compras_schema.js (recebimento_item) · recebimento_dominio.js e
  recebimento_route.js (novos) · receb_route.js (a fila e o receber delegam ao domínio) ·
  public/recebimento.html (o script inteiro) · public/compras_abas.js (aba Recebimento
  retido, prazo na aba Fornecedores) · pendencias_dominio.js · acesso/permissoes
Regra de negócio muda? SIM → antes: a 502 mostrava o pedido e entrava tudo. Depois:
  contagem cega, pesagem por kg, retenção (DECISOES.md 06/11)
Como vou testar: teste_recebimento.js (novo, antes do código); defeitos reintroduzidos;
  a 502 e a aba nova abertas no navegador
Fica de fora: a etiqueta e o endereço do volume (fase 5); o custo pela nota (fase 4)

🔐 ALÇADA
Telas novas: nenhuma (a 502 muda; a 501 ganha a aba Recebimento retido)
Ações novas: recebimento.liberar · admin · 501 · sensível
Setores novos: nenhum
Quem recebe: quem tem pedido.criar (backfill da spec §7)
```

**Feito.** `teste_recebimento.js` 56 casos; nove defeitos reintroduzidos (a fila mostrando
o pedido reprova 1; pesagem opcional, 16; só a régua do cadastro, 3; retido entrando, 8;
custo pelo declarado, 1; contagem ≠ declarado passando, reprova; prazo sempre digitado, 2;
decidir sem motivo, 4; sem a faixa de aviso, reprova). Tela: a 502 a 1024 px, sem
rolagem de lado; a aba Recebimento retido mostrando o retido com as réguas.

### Mudanças no caminho

(decisões de construção que não mudam regra — nome de coluna, layout, ordem de campos)

- Dinheiro das parcelas em centavos inteiros (`valor_centavos`), como o `sm_boleto`.
- **Fase 1:** a regra do material ficou num módulo próprio (`material_dominio.js`), e não
  dentro do `compras_route.js`; a rota chama o domínio.
- **Fase 1:** o teste é `teste_material.js` (novo, com banco e rotas de verdade), e não
  um acréscimo ao `teste_componentes.js`, que usa um schema copiado à mão. O
  `teste_componentes.js` passou a criar material "por quantidade" (o modo virou obrigatório).
- **Fase 1:** o "Adicionar" do card de mínimos saiu (criaria material sem modo de saldo);
  o material novo nasce no formulário "+ Material novo".
- **Fase 1:** nascem os almoxarifados "Comandos e montagem" e "Expedição" (os da §3); os
  dois do tecido vêm na fase 10, pela migração.
- **Fase 1:** "sem dizer, o material nasce NA ficha" (`vai_ficha = 1`): a tela mostra o
  campo, mas a rota precisa de um valor quando ele não vem.
- **Fase 1:** as chaves novas da spec saem da comparação com o retrato do `teste_mapa`
  pelo nome (`perfis_acesso.NASCERAM_DEPOIS`), como a `coleta.horario`: elas chegam a
  quem já tinha a chave de origem, por decisão da spec §7.
- **Fase 2:** os três dados da compra (canal, nº, data) são pedidos já no "Comprado",
  também quando o pedido vai para a aprovação; o aprovador só aprova, com motivo.
- **Fase 2:** `nota.lancar` entrou aqui, e não na fase 4, porque a poda das parcelas
  (R-CMP-27) já a lê. Backfill de quem tem `pedido.pagar`, como a §7 manda.
- **Fase 2:** a alçada não deixa a pessoa ser aprovadora de si mesma.
- **Fase 2:** o "marcar pago" de antes continua: sem parcela, grava uma parcela paga do
  valor do pedido; com parcelas, paga as abertas.
- **Fase 2:** parcelas e "anexos" do pedido aparecem no detalhe do pedido (aba Pedidos);
  as parcelas em N vezes são repartidas na tela, mês a mês a partir do 1º vencimento.
- **Fase 2:** o `teste_quem.js` conferia que o `pedido_compra` terminava em
  `criado_por_id,pago_por_id`; as colunas da fase 2 entram depois, na mesma ordem no
  banco novo e no antigo, e o esperado passou a listá-las.
- **Fase 3:** uma terceira régua do peso, a média dos fatores medidos (R-CMP-35: "lote fora
  da média é divergência"); vale a pior das três.
- **Fase 3:** na entrega parcial por kg, a régua da nota usa o kg do pedido menos o que já
  chegou dele, e o custo da segunda entrega em diante é pelo declarado (a conta exata vem
  com a nota, fase 4).
- **Fase 3:** a contagem "diferente do declarado" é cumulativa (o que já chegou + o desta
  entrega): a entrega parcial de propósito também fica retida, e sai com um toque.
- **Fase 3:** o material "sem saldo" entra e sai no mesmo recebimento (motivo `consumo`), e o
  custo médio dele é a média ponderada de todas as compras.
- **Fase 3:** o item com entrega retida esperando decisão sai da fila do Recebimento até
  alguém decidir (para não ser recebido duas vezes).
- **Fase 3:** a decisão do retido grava `decidido_por_id` além do nome (a spec listava só o nome).
- **Fase 3:** a tela antiga mandava "embalagens recebidas"; a rota ainda aceita (tablet com
  cache), convertendo pelo fator.

### Achei no caminho (não mexi)

- **Fase 2:** `GET /api/pedidos/zumbis` (os parciais esquecidos) nunca responde: o
  `GET /api/pedidos/:id` do `pedido_route.js` é registrado antes e pega "zumbis" como id
  (404 "pedido não encontrado"). Defeito antigo, de antes desta spec.
- **Fase 2:** o cadastro de fornecedor (`POST /api/fornecedores`) apagava campo
  ausente (#33). Consertado aqui porque a fase pedia os campos de pagamento e o teste
  do Pix mostrou o defeito — anotado como conserto dentro do plano.
<!-- fim do diário -->


> Nasceu da conversa no Projeto "PCP - Deccorar" em 06/11/2026.
> Base do código conferida no commit `f431fe2` (06/11/2026).
> **Onde esta spec e o `CLAUDE.md` divergirem, vale o `CLAUDE.md`**, e a divergência
> é anotada aqui no STATUS.

---

## 1. O problema

As telas de Compras (501) e Recebimento (502) existem desde agosto e **ninguém usa**.
Elas foram desenhadas para tubo, base e tecido, e a empresa compra muito mais do que
isso: café, detergente, estilete, grampo, bucha, parafuso, fita. Hoje:

- **Não existe cadastro de tudo que se compra.** O card Materiais (24/09) cadastra
  material, mas tudo o que é cadastrado aparece na ficha técnica. Café apareceria lá.
- **Ninguém sabe o preço médio de nada.** Nem do café, nem do tecido que vem de três
  fornecedores, um longe e barato, outro perto e caro, comprado na urgência.
- **Ninguém sabe quanto se consome**, então não há compra programada.
- **O recebimento não tem dono.** A caixa do Mercado Livre chega, alguém guarda, e
  ninguém confere se veio o que foi pago.
- **As compras grandes são por quilo e chegam em peça.** 400 kg de tubo viram 600
  tubos. Se o tubo vier mais fino, a contagem bate e a fábrica pagou por quilo um
  material pior. Numa compra de R$ 40–50 mil isso não pode passar.
- **Imposto, frete e nota não são registrados.** O custo real não é conhecido, e a
  mudança de regime tributário, que está em curso, vai precisar do crédito de ICMS e IPI.
- **Não se sabe quanto tempo cada fornecedor leva** para entregar.
- **Tecido tem duas portas de entrada.** O sob medida tem a sua (rolo com fornecedor,
  nota e preço por m², em `tecido.db`), com um cadastro de fornecedor separado do PCP.
- **O material fica em vários lugares da fábrica** (mesa de corte, local dos comandos,
  perto da expedição), e o sistema não sabe onde.

## 2. O que muda no `COMPRAS.md` (decisões do dono, 06/11/2026)

| Decisão antiga (`COMPRAS.md`) | Nova |
|---|---|
| Preço sem impostos | Nota com impostos por item; **custo pago** e **custo líquido** (§4.D) |
| Nota fiscal só número e data | Nota e itens da nota completos; sem nota também é registro |
| Pedido sem aprovação por valor | **Alçada por pessoa**: acima do limite, o gestor aprova (§4.C) |
| `pago_em` como uma marca, não contas a pagar | **Parcelas** registradas, no formato do futuro contas a pagar. Ainda não é contas a pagar |
| Prazo de entrega digitado | **Prazo medido** das compras reais; o digitado só vale sem histórico |
| Fator de embalagem fixo na oferta | Continua para o caso fixo; **compra por kg** ganha o **fator real** medido no recebimento |
| Componente é tudo da ficha | Componente é **tudo que a empresa compra**; a marca `vai_ficha` separa |
| `componente` provisória, dona `PRODUCAO-MONTAGEM.md` §6 | **O cadastro de material passa a ser desta spec.** A montagem fica dona só da reserva e da baixa pela ficha |
| Contagem de material "na tela antiga até ter spec própria" (`ESTOQUE-LIVRO-E-CONFERENCIA` v2) | **Esta é a spec própria** (fase 6) |

O resto do `COMPRAS.md` continua: oferta, comparação de preço, histórico de preço, os
dois gatilhos da lista de compras, quem recebe não vê preço, recebimento parcial,
devolução ao fornecedor, custo indefinido nunca vira zero.

## 3. Como funciona na fábrica

```
CADASTRO ─────▶ PEDIDO ────────────────▶ RECEBIMENTO ───────▶ NOTA ─────────▶ ESTOQUE
material        rascunho                  fila "a receber"      digitada         custo médio
fornecedor      (aguardando aprovação)    sem preço             ou XML           consumo
almoxarifado    COMPRADO                  conta / pesa / bipa   impostos         compra programada
                nº do pedido no fornecedor "levar para: X"       custo pago/líq.
                parcelas                  volumes etiquetados
```

**Três tipos de material, três jeitos de receber:**

| Modo de saldo | Exemplo | Recebe como | Sai como |
|---|---|---|---|
| **sem saldo** | café, detergente, estilete | um toque: "chegou tudo" | não sai: o consumo é a média das compras |
| **por quantidade** | tubo, base, comando, emenda, corrente | contagem cega (+ pesagem se comprado por kg) | contagem mensal (hoje) · ficha na embalagem (quando a montagem existir) |
| **por volume** | tecido (rolo), depois caixa de comando, barra | um registro por volume, com etiqueta e endereço | bipe do volume: "abri" (tecido do ML) ou corte (sob medida) |

**Vários almoxarifados.** Hoje a fábrica guarda material em pelo menos três lugares, e
isso não vai mudar:

| Almoxarifado | Onde | O que guarda |
|---|---|---|
| Tecidos sob medida | ao lado da mesa de corte | rolos do sob medida |
| Comandos e montagem | local próprio | comando, emenda, limitador, fita crepe |
| Expedição | perto do despacho | parafuso, bucha, fita durex |

## 4. Regras de negócio

Cada regra é um cartão `R-CMP-nn`. Quando a fase for implementada, os cartões vão para
`docs/regras/compras.md` (área nova) e o porquê vai para `docs/historia/compras.md`.

### A. Cadastro de material

**R-CMP-01 — Tudo que a empresa compra é material.** Café, estilete, tubo e tecido moram
no mesmo cadastro (`componente`). Não há segundo cadastro de "insumo de escritório".

**R-CMP-02 — "Vai para a ficha técnica" é marca explícita.** `componente.vai_ficha`. A
tela 404 (Ficha técnica), ao acrescentar material, **só oferece** material com
`vai_ficha = 1`. Material que já está numa ficha e é desmarcado **não some da ficha**:
a tela recusa a desmarcação dizendo em quais modelos ele está.

**R-CMP-03 — Modo de saldo é escolha obrigatória no cadastro.** `componente.modo_saldo`:
`sem` · `quantidade` · `volume`. Material novo **não nasce com padrão escondido**: a tela
exige a escolha (armadilha #30: regra que nasce com o valor que ninguém escolheu fica
inerte em silêncio). Os materiais que já existem recebem `quantidade` no backfill, que
é o que eles são hoje.

**R-CMP-04 — Categoria.** Lista editável (`listas`, tipo `categoria_material`), semeada
com: Matéria-prima · Tecido · Embalagem · Ferramenta · Limpeza · Copa · Escritório ·
Manutenção. Serve para filtrar e para a compra programada. Não decide regra nenhuma.

**R-CMP-05 — Todo material tem almoxarifado padrão.** `componente.almoxarifado_id`. É
onde ele mora: o recebimento escreve "levar para: Expedição" e a contagem sai por
almoxarifado. Material sem almoxarifado padrão aparece em Pendências de cadastro.

**R-CMP-06 — Volume etiquetado e "um por nível".** Com `modo_saldo = 'volume'`, cada
volume recebido ganha etiqueta e endereço completo (almoxarifado → haste → andar →
nível). `componente.um_por_nivel` (padrão `1` para tecido, `0` para o resto) aplica a
regra do sob medida "cada nível guarda um rolo só". Mudar um material para `volume`
depois é marcar a caixinha, sem obra.

**R-CMP-07 — Conferência por peso no cadastro.** Campos opcionais:
`peso_padrao_kg` (peso de 1 unidade, da ficha do fornecedor ou da primeira compra boa),
`tol_aviso_pct` (padrão 2) e `tol_retem_pct` (padrão 5).

**R-CMP-08 — NCM opcional.** `componente.ncm`. É por ele que o XML (fase 8) casa sozinho
o item da nota com o material.

**R-CMP-09 — "Como sai do estoque" já existe, e diz que está esperando.**
`componente.como_sai`: `contagem` (o único que funciona hoje) · `ficha` (baixa pela
ficha técnica na embalagem). `ficha` **não pode ser escolhida** enquanto a montagem não
existir: a opção aparece desabilitada com o texto "depende da montagem
(`PRODUCAO-MONTAGEM.md`)". Quando a montagem chegar, liga-se a opção e muda-se o campo
por material. É a resposta à dívida 18: a regra inerte que **diz** que está inerte.

**R-CMP-10 — Cadastro rápido.** Nome, categoria, unidade de consumo, modo de saldo e
almoxarifado bastam para nascer. O resto se completa depois. As regras da armadilha #33
continuam: campo ausente preserva, vazio de propósito apaga, número impossível é
recusado dizendo qual campo.

### B. Fornecedor

**R-CMP-11 — Um cadastro de fornecedor só.** O de `dados.db`. O do sob medida
(`tecido.db`, tabela `fornecedor`) migra na fase 9, e o rolo passa a apontar para o
fornecedor do PCP pela porta.

**R-CMP-12 — Tipo do fornecedor.** `fornecedor.tipo`: indústria · distribuidor · loja ·
importador. Campos opcionais de pagamento (chave Pix, banco, agência, conta) prontos
para o financeiro, visíveis só com `pedido.pagar`.

**R-CMP-13 — Marketplace é canal, não fornecedor.** Todo pedido tem
`pedido_compra.canal`: Mercado Livre · Shopee · Amazon · loja física · direto. Na compra
de marketplace a **loja vai como texto** (`pedido_compra.loja`), sem obrigar cadastro.
Fornecedor cadastrado é para quem se compra de novo (indústrias, os três de tecido).

**R-CMP-14 — O preço médio é do material**, venha de onde vier. A bucha tem um preço
médio, comprada em qualquer loja. A comparação entre fornecedores (já existe) continua
por oferta.

### C. Pedido de compra

**R-CMP-15 — Caminho do pedido.**
```
rascunho ─▶ aguardando_aprovacao ─▶ comprado ─▶ parcial ─▶ recebido
              (só acima da alçada)                         cancelado (de qualquer um antes de recebido)
```
O status `enviado` de hoje passa a se chamar **comprado** (migração renomeia; nada real
foi lançado, mas a migração é feita assim mesmo).

**R-CMP-16 — "Comprado" exige canal, nº do pedido no fornecedor e data da compra.**
`numero_externo`, `comprado_em`, `comprado_por` (via `quem.js`). É a data da compra que
mede o prazo do fornecedor. Só pedido **comprado** aparece na fila do Recebimento.

**R-CMP-17 — Alçada por pessoa.** `compra_alcada` (pessoa, limite em R$, aprovador).
Pedido acima do limite de quem o criou vai para `aguardando_aprovacao`, e só o aprovador
(ou o Admin Geral) passa para comprado, com o motivo gravado. Quem não tem alçada
cadastrada **não tem limite** (é o dono hoje). Pronto e sem uso enquanto só o dono
compra.

**R-CMP-18 — Compra por kg com quantidade declarada.** O item do pedido guarda a
**unidade de compra** (`kg`, `un`, `m`, `cx`…), a quantidade e o preço **nessa unidade**,
e, quando o fornecedor informa, a **quantidade declarada na unidade da casa**
("400 kg ≈ 600 tubos", `qtd_declarada`). A conversão do item fixo (barra de 6 m = 6 m)
continua pela oferta.

**R-CMP-19 — Pagamento em parcelas, mesmo quando é uma.** `pagamento_parcela`: forma
(Pix, boleto, cartão, dinheiro, transferência), valor, vencimento, `pago_em`, `pago_por`.
Hoje só se registra e consulta. **Não é contas a pagar**: não há lista do que vence nem
aviso. O formato segue o do `sm_boleto` do sob medida, para o financeiro futuro juntar
a pagar e a receber sem tradução. `pedido_compra.pago_em` vira derivado (todas as
parcelas pagas).

**R-CMP-20 — Anexos.** Orçamento, nota em PDF ou foto, XML, comprovante. Arquivo numa
pasta nova do `caminhos.js` (`ANEXOS_COMPRAS`, fora de `lotes/`, que o cron apaga).
Opcional sempre.

**R-CMP-21 — Compra rápida.** Uma tela curta para o marketplace: material, quantidade,
valor total, canal, loja, nº do pedido. **Nasce comprada** (passa pela alçada igual).
É o caminho da bucha e do café; o pedido completo é o da indústria.

### D. Nota fiscal e impostos

**R-CMP-22 — Nota é registro próprio.** `nota_compra` + `nota_compra_item`. Um pedido
pode ter várias notas (entrega parcial). Compra **sem nota** é permitida e fica marcada
(`sem_nota = 1`), com o valor pago digitado no item.

**R-CMP-23 — Os valores do item são gravados como vieram.** Produto, desconto, frete,
seguro, outras despesas, IPI, ICMS, ICMS-ST, CFOP e NCM. Frete, desconto e despesas
lançados só no total da nota são **rateados pelo valor** entre os itens (a mesma régua
do `COMPRAS.md`).

**R-CMP-24 — Custo pago e custo líquido.**
```
custo pago    = produto − desconto + frete + seguro + outras + IPI + ICMS-ST
custo líquido = custo pago − créditos que o regime permite aproveitar
```
Os dois são gravados por item. No Simples Nacional o crédito é zero e os dois são iguais.

**R-CMP-25 — O crédito vem de uma tabela por regime, não do código.** `regra_credito`
(regime, imposto, aproveita sim/não, vigente desde). A empresa tem um **regime vigente**
em `config`. **Cada nota grava o regime da data dela**: a compra feita no Simples nunca
ganha crédito retroativo quando o regime mudar. É a mesma lição do preço congelado no
pedido.

**R-CMP-26 — O custo médio passa a andar pelo custo líquido**, dividido pela quantidade
**recebida** na unidade de consumo. Continua sendo do `componente_dominio.js` (dono
único) e continua só se movendo na entrada.

**R-CMP-27 — Quem vê.** Nota, impostos e parcelas só com `custo.ver` ou `nota.lancar`.
Pela regra 14 do §13, o JSON sai sem os campos, não é a tela que esconde.

### E. Recebimento

**R-CMP-28 — Quem recebe não vê preço** (mantido). A rota do recebimento monta o JSON
sem preço, impostos e parcelas.

**R-CMP-29 — O rigor depende do modo de saldo.**
| Modo | Na tela 502 |
|---|---|
| `sem` | mostra o que foi pedido e um botão **"chegou tudo"**; se faltou, digita o que veio |
| `quantidade` | **contagem cega**: digita quantas chegaram sem ver o pedido nem o declarado |
| `volume` | um registro por volume, com a metragem da etiqueta do fornecedor; imprime a etiqueta da casa e pede o endereço |

**R-CMP-30 — Compra por kg: pesagem obrigatória e cega.** Todo item comprado em `kg`
exige, além da contagem: **peso de 1 unidade** e **peso de 10 unidades**. A tela não
mostra o peso esperado. Sem os dois pesos, o recebimento do item não fecha.

**R-CMP-31 — As duas réguas do peso.**
```
esperado pela nota     = kg do pedido (ou da nota) ÷ quantidade contada
esperado pelo cadastro = peso_padrao_kg   (se existir)
desvio                 = (peso de 10 ÷ 10) contra cada esperado
```
Vale o **pior** dos desvios. A régua do cadastro pega o fornecedor que **fatura**
errado; a da nota funciona mesmo sem cadastro.

**R-CMP-32 — Tolerância em três faixas**, por material (padrão 2% e 5%):
| Desvio | O que acontece |
|---|---|
| até `tol_aviso_pct` | entra normal |
| até `tol_retem_pct` | entra no saldo, e vai para o admin **dar ciência** (lista em Pendências) |
| acima de `tol_retem_pct` · **ou** contagem diferente da quantidade declarada | **retém**: não entra no saldo |

**R-CMP-33 — O retido sai com um toque, nunca fica preso.** Quem tem
`recebimento.liberar` escolhe **aceitar**, **aceitar e reclamar com o fornecedor** ou
**devolver** (o fluxo de devolução que já existe), com motivo. Fica gravado quem e
quando (`quem.js`). Funciona no celular. É o desenho da aba Pendências: trava que sabe
liberar (armadilha #6).

**R-CMP-34 — O custo real é por unidade recebida.** Pedido de 400 kg com 590 tubos
recebidos: cada tubo custa `valor ÷ 590`, não `÷ 600`. A tela de custo mostra a
diferença contra o declarado.

**R-CMP-35 — O fator real vira histórico.** Cada recebimento por kg grava o fator
medido (`kg por unidade`). A média dos fatores do material sugere quantos kg pedir na
compra programada. Lote fora da média é divergência (R-CMP-32).

**R-CMP-36 — O prazo do fornecedor é medido.** `comprado_em` → data do recebimento,
por fornecedor e por material. A média das últimas compras substitui o
`prazo_entrega` digitado assim que houver **3 recebimentos**; abaixo disso vale o
digitado, e a tela diz qual dos dois está valendo.

**R-CMP-37 — "Levar para".** A fila mostra o almoxarifado padrão de cada item. Não é
trava: quem recebe pode escolher outro, e o volume etiquetado grava o endereço real.

### F. Almoxarifado e volumes

**R-CMP-38 — Um sistema de almoxarifado, quantos almoxarifados a empresa quiser.**
`almoxarifado` (nome, local, finalidade, ativo), com endereço em três níveis
(haste → andar → nível), **no mesmo desenho do sob medida** (`armazem` → `haste` →
`andar` → `nivel`). Criar, renomear e desativar almoxarifado é tela (501, aba
Almoxarifados), sem código: hoje já são pelo menos **Tecidos novos** e **Sobras de
tecido** (os dois que o sob medida tem, `ROLO` e `SOBRA`), **Comandos e montagem** e
**Expedição**, e os próximos nascem quando o dono quiser. Almoxarifado com material
dentro não se apaga: desativa.

**R-CMP-39 — Volume é a peça física etiquetada.** `volume_material`: código da etiqueta
(`M-000001`), material, recebimento de origem, quantidade inicial, saldo, endereço,
situação (`guardado` · `aberto` · `encerrado`). O saldo de um material `volume` é a soma
dos volumes não encerrados.

**R-CMP-40 — Tecido do ML: abrir o rolo é consumir o rolo.** A bobina do ML é aberta e
picotada inteira. Um bipe na etiqueta ("abri") encerra o volume e lança a saída do
saldo inteiro. Como ele é cortado (3,20 ao meio, 1,80 + 1,40) é decisão de produção e
fica fora (armadilha #19).

**R-CMP-41 — Mover é bipe.** Bipe no volume, bipe (ou escolha) do endereço novo. Com
`um_por_nivel`, o nível ocupado recusa dizendo qual volume está lá.

### G. Contagem e consumo

**R-CMP-42 — Contagem de material: uma pessoa, cega, por almoxarifado.** A tela lista os
materiais `quantidade` e `volume` do almoxarifado, sem mostrar o saldo. Diferença dentro
de `tol_aviso_pct` aplica sozinha; acima, vai para o admin (`contagem.aprovar`).
Frequência padrão **mensal** (`componente.contagem_dias = 30`), ajustável por material.

**R-CMP-43 — Tubo cortado ainda é material.** Para material em metro, a contagem aceita
**"barras inteiras"** e **"cortados"**, linha a linha (medida × quantidade), e converte
em metros. Quem conta não faz conta.

**R-CMP-44 — Consumo pela contagem.**
```
consumo do período = saldo da contagem anterior + entradas − saldo desta contagem
```
Precisa de duas contagens. Antes disso o consumo é `null` ("não dá pra dizer"),
**nunca zero**.

**R-CMP-45 — Consumo de quem não tem saldo é a média das compras.** Média mensal das
quantidades recebidas na janela (padrão 6 meses), mostrando **de quantos meses** ela
saiu. Com menos de 3 meses, tarja âmbar "pouco histórico" (a armadilha #16 do sob
medida: média cuja janela é maior que a história).

### H. Compra programada

**R-CMP-46 — Lista do mês para o que não tem saldo.** Num dia fixo (`config`, padrão
dia 1), a tela Compra programada monta a sugestão: média mensal de cada material `sem`
saldo, arredondada para a embalagem da última compra. É sugestão: vira pedido com um
clique, editável.

**R-CMP-47 — Aviso pela data para o que tem saldo.**
```
dias até acabar = saldo ÷ consumo diário
pedir até       = hoje + dias até acabar − prazo medido − margem (componente.margem_dias, padrão 5)
```
O material entra na lista quando "pedir até" chega. Sem consumo medido, não entra pela
data, só pelo mínimo (gatilho 1), e a tela diz isso.

**R-CMP-48 — A data não soma com o mínimo.** O ponto de pedido é o **maior** entre o
`estoque_minimo` digitado e o calculado pela data, nunca a soma (a mesma régua dos dois
gatilhos do `COMPRAS.md`). Sempre desconta o que está a caminho.

### I. Sob medida e almoxarifado único

**R-CMP-49 — Uma porta de entrada.** Compra e recebimento de tecido do sob medida passam
pela 501 e pela 502. O recebimento **cria o rolo no sob medida pela porta**, já com
fornecedor, nota e preço por m² (fase 9).

**R-CMP-50 — Um sistema de almoxarifado: o PCP é dono do ENDEREÇO, o sob medida
continua dono do ROLO e da SOBRA.** Decisão do dono, 07/11/2026.

| | Dono | Por quê |
|---|---|---|
| Almoxarifados e endereços (almoxarifado → haste → andar → nível), de todos os materiais | **PCP** (`dados.db`) | um cadastro só, uma tela só para criar almoxarifado |
| Volume de material do PCP (tecido do ML, caixa de comando, barra) | **PCP** (`volume_material`) | é estoque do PCP |
| Rolo e sobra do sob medida | **sob medida** (`tecido.db`) | o corte grava rolo, sobra e plano **numa transação só** (`tecido/dominio/corte.js`); separar isso em dois bancos faria um corte pela metade virar tecido sumido |

O sob medida passa a **ler os endereços do PCP pela porta**, no mesmo desenho do
`tecido/nucleo/materiais.js`, que já faz isso com a lista de material: o `tecido.db`
continua sem enxergar o `dados.db`, e a regra do `tecido/README.md` fica de pé. O rolo
e a sobra guardam o **id do nível do PCP**. As tabelas `armazem`, `haste`, `andar` e
`nivel` do sob medida são migradas (os endereços viram do PCP, com os mesmos nomes e o
id antigo guardado) e depois ficam só leitura. A regra "cada nível guarda um rolo só"
continua sendo checada **pelo sob medida** no rolo (R-CMP-06 é a mesma regra para os
volumes do PCP).

**O saldo é um só para quem olha:** a aba Estoque de material e o painel do almoxarifado
mostram, por almoxarifado e endereço, os volumes do PCP **e** os rolos e sobras do sob
medida (pela porta), numa lista só. A entrada de rolo do sob medida é aposentada: rolo
novo só nasce pelo recebimento (fase 9).

**Se a porta cair**, o sob medida não perde o endereço (o id e o nome do nível ficam
gravados no rolo) e a tela diz que o endereço está sem atualização, em vez de mostrar
vazio (a regra da porta de hoje: sem a porta, recusa, nunca lista vazia).

### J. Notas baixadas da Receita (fase 11)

**R-CMP-51 — O certificado é recebido pela tela, nunca pelo repositório.** Tela 501,
aba Certificado, só **Admin Geral** (`certificado.gerenciar`, intransferível): enviar o
`.pfx` com a senha, trocar e remover. **Nunca baixar.** O arquivo vai para uma pasta
nova do `caminhos.js` (`CERTIFICADO`, fora do repositório, de `lotes/` e dos backups
comuns), com permissão só do usuário do servidor. A senha é guardada **cifrada** com uma
chave própria do servidor (arquivo à parte, como o `.session_secret`), nunca em texto no
banco, nunca no log, nunca no JSON.

**R-CMP-52 — Validade à vista.** Ao receber, o sistema abre o certificado com a senha
(senha errada é recusada na hora) e grava CNPJ, titular e validade. Vencendo em menos
de 30 dias, tarja âmbar em Compras e em Pendências; vencido, a busca para e diz por quê.
O CNPJ do certificado tem que ser o da Deccorar (`config.cnpj`).

**R-CMP-53 — Busca automática das notas.** Com certificado válido, o servidor consulta a
distribuição de DF-e da Receita (Ambiente Nacional) em intervalos (padrão de hora em
hora, respeitando o limite de consultas da Receita e guardando o último NSU lido). Cada
nota emitida contra o CNPJ entra em **Notas recebidas** (501) com emitente, valor e data,
**antes da mercadoria chegar**.

**R-CMP-54 — Ciência da operação automática, o resto manual.** Para baixar o XML
completo, a Receita exige o evento de ciência da operação, que não confirma nem nega a
compra. O sistema envia a ciência sozinho. As manifestações conclusivas (confirmação,
desconhecimento, operação não realizada) **ficam fora**; o contador deve dizer se alguma
é obrigatória para a Deccorar.

**R-CMP-55 — A nota baixada vira a nota da fase 8.** O XML completo entra pelo mesmo
leitor da fase 8 (origem `dfe`) e se liga ao pedido pelo CNPJ do emitente e pelos itens.
O que não casa fica para escolher na tela, nunca adivinhado. Nota de fornecedor sem
pedido aparece como **"nota sem pedido"**: alguém comprou por fora, e isso é aviso.

**R-CMP-56 — Sem certificado, tudo funciona.** Enquanto o dono não enviar o `.pfx`, a
aba diz "nenhum certificado enviado" e as fases 1 a 10 não dependem disso.

## 5. Fica de fora

- Contas a pagar: vencimentos, lista da semana, aviso (fica o formato pronto, R-CMP-19).
- Importação direta: câmbio, imposto de importação, despachante (o rateio de "outras
  despesas" deixa o caminho aberto).
- **Baixa pela ficha na embalagem**: só o campo e a opção desabilitada (R-CMP-09).
- Controle do tubo pré-cortado por medida (é do `PRODUCAO-MAPA-E-MOTOR.md`).
- Como a bobina do ML é cortada.
- Relatórios gerenciais de compra (a fase 7 do `COMPRAS.md` continua esperando história).
- Ler impostos do texto do DANFE em PDF (frágil, como o PDF do ML; o PDF é só anexo).
- Aprovação por categoria de material (a alçada é por pessoa).
- Manifestações conclusivas da nota (confirmação, desconhecimento, não realizada); só a
  ciência automática entra (R-CMP-54).
- Mudar rolo, sobra e corte do sob medida de banco (R-CMP-50: ficam no `tecido.db`).

## 6. Dados

Toda coluna nova entra no `CREATE` do módulo dono **e** no `ALTER`, no mesmo commit (§17).
Toda escrita grava quem fez pelo `quem.js`. Todas as tabelas novas entram em `TABELAS` do
`teste_route.js` (§11).

**`componente` (ALTER):** `categoria` TEXT · `vai_ficha` INTEGER · `modo_saldo` TEXT ·
`almoxarifado_id` INTEGER · `um_por_nivel` INTEGER DEFAULT 0 · `peso_padrao_kg` REAL ·
`tol_aviso_pct` REAL DEFAULT 2 · `tol_retem_pct` REAL DEFAULT 5 · `ncm` TEXT ·
`como_sai` TEXT DEFAULT 'contagem' · `contagem_dias` INTEGER DEFAULT 30 ·
`margem_dias` INTEGER DEFAULT 5.
Backfill dos existentes: `vai_ficha = 1`, `modo_saldo = 'quantidade'` (tecido com
`familia` → `volume`, `um_por_nivel = 1`).

**`fornecedor` (ALTER):** `tipo` · `pix` · `banco` · `agencia` · `conta`.

**`pedido_compra` (ALTER):** `canal` · `loja` · `numero_externo` · `comprado_em` ·
`comprado_por` · `aprovacao` (`nao_precisa`|`aguardando`|`aprovado`) · `aprovado_por` ·
`aprovado_em` · `motivo_aprovacao` · `rapida` INTEGER DEFAULT 0.

**`pedido_item` (ALTER):** `unidade_compra` · `qtd_compra` · `preco_unid_compra` ·
`qtd_declarada`.

**Novas:**
| Tabela | O quê |
|---|---|
| `compra_alcada` | pessoa, limite_r$, aprovador_id |
| `pagamento_parcela` | pedido_id, nota_id, numero, forma, valor, vencimento, pago_em, pago_por, obs |
| `compra_anexo` | pedido_id, nota_id, recebimento_id, tipo, arquivo, criado_por |
| `nota_compra` | pedido_id, chave, numero, serie, emitente_cnpj, emitente_nome, emissao, totais, sem_nota, regime, origem (`manual`·`xml`·`dfe`) |
| `nota_compra_item` | nota_id, pedido_item_id, componente_id, descricao, ncm, cfop, unidade, quantidade, valores e impostos (R-CMP-23), credito_icms, credito_ipi, custo_pago, custo_liquido |
| `regra_credito` | regime, imposto, aproveita, vigente_desde |
| `almoxarifado` · `alm_haste` · `alm_andar` · `alm_nivel` | o desenho do `armazem` do sob medida |
| `volume_material` | codigo, componente_id, recebimento_item_id, qtd_inicial, saldo, nivel_id, situacao, metragem, criado_por, encerrado_em, encerrado_por |
| `contagem_material_linha` | contagem_id, componente_id, tipo (`inteiro`·`cortado`), medida_m, quantidade |
| `certificado` | cnpj, titular, validade, arquivo (caminho, nunca o conteúdo), senha_cifrada, enviado_por, enviado_em, ativo |
| `dfe_controle` | ultimo_nsu, ultima_consulta, proxima_consulta, ultimo_erro |
| `dfe_documento` | nsu, chave, tipo (resumo·completa·evento), emitente_cnpj, emitente_nome, valor, emissao, ciencia_em, xml (arquivo), nota_compra_id |

**Fase 10 no sob medida (`tecido.db`, migração numerada do módulo):** `rolo.nivel_pcp_id`
e `sobra.nivel_pcp_id` (com o nome do endereço guardado ao lado), e `armazem`/`haste`/
`andar`/`nivel` marcados só leitura. `almoxarifado` do PCP ganha `origem_sm` (a chave
antiga, `ROLO`/`SOBRA`) para a migração ser conferível.

**`recebimento_item` (ALTER):** `qtd_contada` · `peso_1_kg` · `peso_10_kg` ·
`esperado_nota_kg` · `esperado_cadastro_kg` · `desvio_pct` · `faixa`
(`ok`·`aviso`·`retido`) · `decisao` · `decidido_por` · `decidido_em` · `motivo_decisao` ·
`fator_real` · `almoxarifado_id`.

**`movimento_componente`:** continua sendo o livro único do material. Motivos novos:
`abertura` (volume aberto), `contagem` já existe. Nenhuma segunda régua de saldo.

## 7. Acesso

Cada chave nova tem as três pontas: `permissoes.js`, `permDaRota()` e **quem já tem**
(backfill de uma vez, marcado em `config`, armadilha #13). Rota sem permissão nasce
negada (#29).

| Chave nova | Nível | Quem recebe no backfill |
|---|---|---|
| `pedido.aprovar` | admin · **sensível** | quem tem `pedido.criar` hoje |
| `nota.lancar` | admin | quem tem `pedido.pagar` |
| `recebimento.liberar` | admin | quem tem `pedido.criar` |
| `almoxarifado.cadastrar` | admin | quem tem `componente.cadastrar` |
| `volume.movimentar` (guardar, mover, abrir) | operação | quem tem `pedido.receber` |
| `alcada.definir` | admin_geral · **intransferível** | só o Admin Geral |
| `certificado.gerenciar` | admin_geral · **intransferível** | só o Admin Geral |

A contagem de material usa `contagem.contar` e `contagem.aprovar`, que já existem.

## 8. Telas

| Nº | Tela | Onde | O que muda |
|---|---|---|---|
| 501 | Compras | computador | abas: **Materiais** (marcas novas) · **Fornecedores** · **Pedidos** (alçada, parcelas, anexos) · **Compra rápida** · **Notas** (com Notas recebidas da Receita) · **Compra programada** · **Almoxarifados** · **Certificado** (só Admin Geral) |
| 502 | Recebimento | tablet | a fila de comprados, os três modos, a pesagem cega, "levar para", a etiqueta |
| 503 | Almoxarifado | tablet | **nova**: guardar, mover e abrir volume, por bipe |
| 504 | Contagem de material | tablet | **nova**: uma pessoa, por almoxarifado, inteiros e cortados |
| 204 | Pendências | computador | ganha: recebimento retido · ciência de aviso · pedido aguardando aprovação · material sem almoxarifado |
| 404 | Ficha técnica | computador | só oferece `vai_ficha = 1` |

Seguem o `docs/DESIGN.md` (operação clara, escritório escura) e o §20 (navegação e
linguagem).

## 9. Fases

Cada fase passa pelo §0: PLANO ✋ → constrói → FECHAMENTO ✋.

### Fase 1 — O cadastro de material  🔴
Marcas novas (R-CMP-01 a 10), almoxarifado padrão (só o nome do almoxarifado, sem
endereço ainda), categoria, backfill, a 404 filtrando `vai_ficha`, Pendências de
cadastro. **Valor sozinha:** dá para cadastrar café sem ele aparecer na ficha.

### Fase 2 — Fornecedor e pedido  🔴
Fornecedor com tipo e dados de pagamento, canal e loja, status comprado, nº externo,
alçada (R-CMP-17), compra por kg com declarado, parcelas, anexos, compra rápida.
**Valor sozinha:** toda compra fica registrada, com como foi paga.

### Fase 3 — Recebimento  🔴
A 502 nova: fila de comprados, três modos, contagem cega, pesagem obrigatória por kg,
as duas réguas, as três faixas, retenção e liberação em Pendências, custo por unidade
recebida, fator real, prazo medido, "levar para". **Valor sozinha:** ninguém recebe sem
conferir, e a compra por kg é pesada.

### Fase 4 — Nota fiscal e custo  🔴
Nota e itens digitados, impostos, rateio, sem nota, regime e `regra_credito`, custo
pago e líquido, custo médio pelo líquido. **Valor sozinha:** o preço médio real de cada
material, café incluído.

### Fase 5 — Almoxarifados e volumes  🟡
Endereços (haste/andar/nível) por almoxarifado, `volume_material`, etiqueta, a 503,
"um por nível", **abrir o rolo do ML**. **Valor sozinha:** o tecido do ML tem endereço e
sai por bipe.

### Fase 6 — Contagem de material e consumo  🟡
A 504, uma pessoa, cega, por almoxarifado, inteiros e cortados, tolerância para aplicar
sozinha, consumo pela contagem, média de compra de quem não tem saldo.

### Fase 7 — Compra programada  🟡
Lista do mês (R-CMP-46), aviso pela data (R-CMP-47), maior e não soma (R-CMP-48), a aba
na 501.

### Fase 8 — Nota por XML  🟡
Anexar o XML preenche nota e itens; casa material pelo NCM e pelo código do fornecedor
na oferta; o que não casar fica para escolher na tela, nunca adivinhado.

### Fase 9 — Sob medida pela mesma porta  🔴
Fornecedor do sob medida migra para o do PCP (o texto antigo do rolo é preservado). O
recebimento de tecido do sob medida cria o rolo lá pela porta, com fornecedor, nota e
preço por m².

### Fase 10 — Um sistema de almoxarifado  🔴
Os endereços do sob medida (`ROLO` e `SOBRA`) migram para o almoxarifado do PCP; o
sob medida passa a lê-los pela porta; rolo e sobra guardam o nível do PCP; o saldo
aparece numa lista só; a entrada de rolo do sob medida é aposentada (R-CMP-50). Rolo,
sobra e corte continuam no `tecido.db`. Migração com backup dos dois bancos, simulação
antes de aplicar e conferência de que todo rolo e toda sobra continuam com o mesmo
endereço (contagem antes = depois).

### Fase 11 — Notas baixadas da Receita  🔴
Tudo pronto para receber o certificado (R-CMP-51 a 56): a aba Certificado, a guarda
cifrada, a validade, a busca na distribuição de DF-e, a ciência automática e a nota
baixada entrando pelo leitor da fase 8. Construída e testada **sem certificado real**:
os testes usam um certificado de teste gerado na hora e respostas gravadas da Receita.
Liga sozinha quando o dono enviar o `.pfx` pela tela.

### Depois, fora desta spec
Quando a montagem existir: liberar `como_sai = 'ficha'` (R-CMP-09). A baixa é do
`PRODUCAO-MONTAGEM.md`; esta spec só deixa o campo.

## 10. Testes (todos rodados pelo Claude Code)

Risco 🔴: o teste é escrito **antes** do código e conferido reintroduzindo o defeito.

| Fase | Arquivo | O que trava |
|---|---|---|
| 1 | `teste_componentes.js` (+) | as marcas; a 404 sem café; material na ficha não se desmarca; backfill; as regras da #33 nas colunas novas |
| 2 | `teste_pedido_compra.js` | o caminho do status; comprado exige canal, nº e data; alçada (abaixo, acima, sem alçada, aprovador); parcelas; compra rápida passa pela alçada |
| 3 | `teste_recebimento.js` | o JSON sem preço e sem esperado; os três modos; pesagem obrigatória por kg; as duas réguas e o pior desvio; as três faixas; retido fora do saldo; liberar/devolver; custo por recebido; prazo medido com 3 recebimentos |
| 4 | `teste_nota_compra.js` | rateio; custo pago e líquido; Simples = iguais; regime gravado na nota não muda com o config; sem nota; custo médio pelo líquido; poda dos campos sem `custo.ver` |
| 5 | `teste_almoxarifado.js` | um por nível; mover; abrir encerra e lança saída; saldo = soma dos volumes |
| 6 | `teste_contagem_material.js` | cega; cortados em metro; tolerância aplica sozinha; consumo `null` com uma contagem; média com pouco histórico |
| 7 | `teste_compra_programada.js` | lista do mês; pedir até; maior e não soma; desconta a caminho |
| 8 | `teste_nota_xml.js` | XML real (pelo menos 2 fornecedores); o que não casa não é adivinhado |
| 9 | `tecido/teste/*` · `teste_porta_almox.js` | o fornecedor migrado; o recebimento criando o rolo pela porta; a entrada antiga de rolo recusada |
| 10 | `tecido/teste/*` · `teste_porta_almox.js` | todo rolo e sobra com o mesmo endereço antes e depois; "um por nível" no sob medida; o corte intacto (os testes do corte rodando iguais); porta caída não vira lista vazia |
| 11 | `teste_certificado.js` · `teste_dfe.js` | senha errada recusada; senha nunca no JSON nem no log; arquivo nunca baixável; CNPJ diferente recusado; validade; NSU guardado; ciência automática; nota sem pedido vira aviso; sem certificado nada quebra |
| todas | `teste_acesso.js` · `teste_mapa.js` · teste de segurança do §10 | as três pontas de cada chave; as telas novas no mapa |

## 11. O que já existe e esta spec reaproveita

- `componente`, `fornecedor`, `oferta`, `preco_historico`, `pedido_compra`, `pedido_item`,
  `recebimento`, `recebimento_item`, `movimento_componente` (`compras_schema.js`).
- Card Materiais e `POST /api/componentes` com as regras da armadilha #33.
- `componente_dominio.js` (saldo e custo médio, dono único), `compras_calc.js`,
  `necessidade_dominio.js` (os dois gatilhos, e o sob medida entrando pela 4-C).
- A porta `tecido/nucleo/materiais.js` e `sobmedida_material.js`.
- `armazem`/`haste`/`andar`/`nivel`/`etiqueta` do sob medida, como desenho a copiar.
- `sm_boleto` do sob medida, como formato das parcelas.
- `quem.js`, `telas.js` (mapa), Pendências (204).
