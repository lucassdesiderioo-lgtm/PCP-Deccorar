# Organização do sistema: módulos, lugar de cada tela e as duas operações num sistema só

```
STATUS
Situação: APROVADA pelo dono em 10/11/2026 · nada construído ainda
Criada em: 10/11/2026
Última atualização: 10/11/2026
Fase atual: PLANO da fase 1 entregue, esperando o "pode seguir"
Fases: 1 ☐  2 ☐  (3 ☐ menu único — ver a divergência D1 abaixo)
Risco: 🟡 (não mexe em estoque, banco, permissão nem em tela; cria regra, mapa e teste)
Depende de: ACESSO-POR-TELA-E-NIVEL (o mapa de telas, `telas.js`) · NAVEGACAO-E-LINGUAGEM (§20)
Conferida contra: o `main` de 09/11/2026 (PR #325)
Tipo: REGRA
```

### Conferência do §5 contra o código (10/11/2026, `main` depois do PR #326)

Conferido contra `telas.js`, `tecido/nucleo/telas.js` e `public/compras_abas.js`.
**Bate:** as 29 telas da medida padrão (número, nome e bloco de hoje — o bloco sai
de `MODULOS`/`moduloDe` pela centena, com o 250 à parte), as 16 do sob medida (601
a 616, todas no bloco 600; `/inicio` é apelido da 601, uma linha só) e as dez abas
da 501 (`lista`, `materiais`, `almox`, `fornecedores`, `pedidos`, `retidos`,
`notas`, `programada`, `certificado`, `rapida`). A 203 está vaga (R-TEL-02) e não
entra na conta. O PR #326 (Corte e separação) só pôs uma aba na 401 e uma caixinha
na 404: nenhuma tela nova. O sob medida ainda usa o rodapé (`tecido/public/nav.js`,
`rodape()` e `ORDEM`). Divergências, e o que vale:

- **D1 — a fase do menu único.** O prompt de construção (10/11/2026) traz **três
  fases**, a 3ª sendo o menu único (o sob medida perde o rodapé e o ☰ Menu agrupa
  por módulo → bloco). Esta spec diz no §6 que o menu **não** muda e no §8 põe o
  menu na spec própria `MENU-UNICO`. **Vale o prompt do dono, que é posterior:** a
  fase 3 é desta spec, com as regras do prompt (ninguém ganha nem perde tela,
  `teste_mapa.js` sem mudar o esperado, conferida com três perfis em 1440 px e em
  tablet). O §6 "Mudar o menu que as pessoas veem hoje" vale para as fases 1 e 2;
  a `MENU-UNICO` do §8 deixa de ser spec separada. A confirmar no PLANO da fase 3.
- **D2 — a 302 Contagem, "a parte de material".** Desde 07/11/2026 (R-CMP-42) a
  contagem de material **não se faz mais** na 302: as rotas antigas respondem 410 e
  material se conta só na 504. O que sobrou de material na 302 é um cartão que
  aponta para a 504 e a lista "Ajustes aguardando aprovação" das contagens antigas
  (`/api/contagem/pendentes`). O ↗ continua valendo, mas é **isso** que está fora
  do lugar, e não uma contagem.
- **D3 — "Conferida contra o main de 09/11 (PR #325)"**: o `main` andou até o PR
  #326 sem tela nova. Vale a conferência acima.

## Onde mora

Esta spec não cria tela. Ela mora em **Administração** (regras do próprio sistema) e
cria a seção "Onde mora", que toda spec passa a ter (R-ORG-13).

---

## 1. O problema

O sistema cresceu por spec, e cada spec pôs as suas telas onde ela mesma nasceu:

- A `COMPRAS-E-RECEBIMENTO` dizia "telas novas: nenhuma, a 501 ganha abas". Resultado:
  a 501 Compras tem hoje **dez abas**, e seis não são compra (materiais, fornecedores,
  almoxarifados, recebimento retido, notas fiscais, certificado).
- O bloco do menu é decidido pela **centena do número** da tela. O sob medida inteiro
  é um bloco só (600), com cadastro, financeiro, produção e comercial misturados.
- Cadastro está em quatro lugares: 402/403/404, 902, 606/608 e duas abas da 501.
- Fiscal e Financeiro não existem como módulo; Almoxarifado está repartido entre
  Compras, Estoque e Sob medida.
- O sob medida ainda usa o rodapé antigo, com lista de telas própria; a medida padrão
  usa o ☰ Menu por número. Parecem dois sistemas.

O dono, em 10/11/2026: *"conforme a gente vai criando as coisas, a gente não está
organizando no local correto de cada coisa"* e *"a spec não pode criar uma tela nova
do nada"*.

**A causa é uma só: a tela nascia onde a spec nasceu, e não onde o assunto mora.**

## 2. O que esta spec decide

1. A lista fechada de **módulos** da empresa.
2. A **regra do lugar**: toda tela mora no módulo do assunto dela.
3. O **segundo nível** dentro do módulo: operação de produção ou canal de venda.
4. O **inventário** das telas de hoje: onde estão e onde deveriam estar.
5. Os princípios de **um sistema só**: um menu, um cadastro, um saldo.
6. Como a regra **se faz valer** (Projeto, spec, plano e teste).
7. A **ordem das specs seguintes**, que arrumam o que está fora do lugar.

## 3. Como a empresa se divide

**A fábrica tem duas operações de produção. A venda tem três canais.** São coisas
diferentes, e o sistema usa as duas.

| | Quais são | Onde aparece |
|---|---|---|
| **Operação** | Medida padrão · Sob medida | Produção, Planejamento, Almoxarifado, Cadastros de produto e ficha |
| **Canal** | Mercado Livre · Revenda · Consumidor final | Comercial, Financeiro, Pós-venda, Relatórios |

O Mercado Livre vende medida padrão. Revenda e consumidor final vendem sob medida,
e os dois caem na mesma produção.

**Dois documentos centrais** puxam a cadeia: a **venda do Mercado Livre** (chega no
PDF) e o **pedido do sob medida** (lançado pelo vendedor e, depois, pelo portal).

**O PCP vai ocupar o lugar do Decorsoft** para consumidor final e revenda (decisão do
dono, 10/11/2026), sem deixar de controlar a produção do Mercado Livre. Por isso o
mapa já nasce com os módulos que o PCP ainda não tem.

## 4. Regras

### A. Os módulos

**R-ORG-01 — A lista de módulos é fechada.** São os dezoito da tabela abaixo. Módulo
novo só entra com aprovação do dono e linha em `docs/DECISOES.md`.

| Módulo | Assunto | Situação em 10/11/2026 |
|---|---|---|
| **Comercial** | a venda nascendo e sendo acompanhada: venda do ML, simulador, pedido, carteira de revendas, visita e orçamento | existe em parte · consumidor final reservado |
| **Portal da revenda** | a porta de fora: a revenda lança o próprio pedido | reservado |
| **Planejamento** | o que produzir e quando | existe |
| **Produção** | o trabalho da bancada, das duas operações | existe |
| **Expedição** | da etiqueta de venda à saída da fábrica | existe |
| **Instalação e entrega** | agenda de instalação, roteiro, entrega própria | reservado |
| **Pós-venda** | devolução, item faltante, reclamação e qualidade | existe (hoje "Devoluções") |
| **Estoque de produto pronto** | saldo, livro e inventário de peça | existe (hoje "Estoque") |
| **Almoxarifado** | material: receber, guardar, mover, contar; rolos e sobras | existe espalhado |
| **Compras** | o que comprar, de quem, pedidos e compra programada | existe, carregando o que não é dela |
| **Cadastros** | tudo que se cadastra uma vez e os outros módulos usam | existe espalhado |
| **Fiscal** | nota de entrada, notas da Receita, certificado; depois, nota de saída | reservado · hoje só abas da 501 |
| **Financeiro** | a pagar, a receber, boletos, custos | reservado · hoje só o do sob medida |
| **Relatórios e indicadores** | o que se lê para decidir | existe (hoje dentro de "Sistema") |
| **Administração** | acessos, parâmetros, modo teste | existe (hoje "Sistema") |
| **Frota** | carros, multas, manutenção | reservado |
| **Mercado Livre (integração)** | a API oficial, métricas e análise da conta | reservado |
| **Pessoas** | ponto, escala, produtividade | reservado |

**Reservado** quer dizer: o módulo existe no mapa e aparece no menu só quando tiver a
primeira tela. A spec que criar a primeira tela dele avisa que está inaugurando.

**Grupos dentro de Cadastros** (referência: o módulo Cadastro do Decorsoft):
Parceiros (fornecedor, revenda, transportadora, cliente) · Materiais · Produtos e
fichas técnicas · Almoxarifados e endereços · Listas.

**Grupo dentro de Administração:** Parâmetros (os ajustes que hoje estão espalhados).

### B. A regra do lugar

**R-ORG-02 — A tela mora no módulo do assunto dela, nunca no módulo da spec que a
criou.**

**R-ORG-03 — Nenhuma tela nasce solta.** Toda spec que cria tela, aba ou função diz,
antes de qualquer outra coisa, onde ela mora. Só existem três respostas:

1. **Num módulo que já existe**: a spec diz qual, em qual bloco (R-ORG-05) e a que
   outras telas se liga.
2. **Num módulo reservado**: a spec avisa que está inaugurando o módulo.
3. **Em nenhum**: a spec **propõe o módulo novo e para ali**. O módulo só entra no
   mapa com a aprovação do dono, antes de qualquer tela ser desenhada.

Spec sem essa resposta não é aprovada, e o Claude Code não constrói.

**R-ORG-04 — Aba só para o mesmo assunto da tela.** Aba de assunto diferente é tela,
no módulo dela. "Não criar tela nova" deixa de ser motivo para pendurar aba.

**R-ORG-05 — Dentro do módulo, o segundo nível é o bloco.** Cada tela declara um:

| Tipo de módulo | Blocos possíveis |
|---|---|
| de produção (Produção, Planejamento, Almoxarifado, Estoque de produto pronto, Cadastros) | Medida padrão · Sob medida · Comum |
| de venda (Comercial, Financeiro, Pós-venda, Relatórios) | Mercado Livre · Revenda · Consumidor final · Comum |
| os demais | Comum |

É assim que o sistema fica um só **e** as operações continuam sempre separadas.

**R-ORG-06 — O número da tela continua não mudando (R-TEL-02).** O que muda é que o
bloco do menu deixa de sair da centena e passa a sair do **módulo declarado**. Tela
nova recebe número na faixa do módulo dela:

| Faixa | Módulo |
|---|---|
| 100 | Produção |
| 200 | Expedição |
| 250 | Pós-venda |
| 300 | Estoque de produto pronto |
| 400 | Planejamento |
| 500 | Compras |
| 600 | **fechada**: as 16 telas do sob medida ficam com o número; nenhuma tela nova nasce aqui |
| 700 | Frota |
| 800 | Mercado Livre (integração) |
| 900 | Administração |
| 1000 | Comercial |
| 1100 | Cadastros |
| 1200 | Almoxarifado |
| 1300 | Fiscal |
| 1400 | Financeiro |
| 1500 | Instalação e entrega |
| 1600 | Relatórios e indicadores |
| 1700 | Pessoas |
| 1800 | Portal da revenda |

> As faixas de 1000 em diante são **proposta desta spec, a confirmar na aprovação**:
> as nove centenas de três dígitos já estão ocupadas.

**R-ORG-07 — Toda tela declara a que se liga.** No mapa, cada tela lista as telas ou
os cadastros de que depende e os que ela alimenta (referência: a coluna "Liga-se a"
do mapa do Decorsoft). É o que mostra, antes de construir, o que quebra se mexer.

### C. Um sistema só

**R-ORG-08 — Um menu só.** As duas operações usam o mesmo ☰ Menu, no mesmo formato:
módulo → bloco → tela com o número. O rodapé do sob medida sai. Cada pessoa continua
vendo só o que alcança. (Construção: spec `MENU-UNICO`, §8.)

**R-ORG-09 — Um cadastro só por coisa.** Material, parceiro (fornecedor, revenda,
transportadora, cliente) e almoxarifado têm **um** cadastro, no módulo Cadastros. As
duas operações leem dele. Cada material leva a marca de onde é usado: Medida padrão,
Sob medida ou os dois.

**R-ORG-10 — Um saldo só por material.** Tubo, comando ou tecido que serve às duas
operações tem um saldo. A separação aparece na ficha, no relatório e no custo de cada
operação, e não em dois estoques com transferência (opção (a) do dono, 10/11/2026).

**R-ORG-11 — As fichas técnicas são duas, o cadastro de material é um.** A conta é
diferente em cada operação (fórmula por modelo na medida padrão; escada, gomos e
folhas no sob medida). As duas apontam para o mesmo material.

**R-ORG-12 — Os bancos continuam dois arquivos; o PCP é dono do que é comum.**
`dados.db` guarda material, parceiro, compra, almoxarifado e o que mais for comum; o
sob medida lê pela porta, como a fase 10 da `COMPRAS-E-RECEBIMENTO` já fez com o
endereço. Fundir os dois arquivos **não** está decidido aqui: é obra de risco 🔴 que
não muda nada na tela, e só se abre por spec própria se um dia fizer falta.

### D. Como a regra se faz valer

**R-ORG-13 — Quatro travas, uma em cada etapa.**

| Etapa | Trava |
|---|---|
| Conversa no Projeto | toda `REGRA` ou `NOVIDADE` é aberta dizendo a classificação **e o módulo** |
| Spec | seção obrigatória **"Onde mora"**, ao lado da "Alçada": módulo, bloco, número, a que se liga. Sem nada novo, escreve "nenhuma tela"; a seção nunca some |
| Plano no Claude Code | bloco **📍 LUGAR** no PLANO e linha "Lugar conferido" no FECHAMENTO (`CLAUDE.md` §0) |
| Código | `teste_lugar.js` reprova tela sem módulo, módulo fora da lista e aba de outro assunto |

```
📍 LUGAR
Telas novas: nº · nome · módulo · bloco · liga-se a      (ou "nenhuma")
Abas novas: tela · aba · mesmo assunto da tela? sim      (ou "nenhuma")
Módulo novo ou inaugurado: nome                          (ou "nenhum")
```

**R-ORG-14 — O que já está fora do lugar fica numa lista nomeada, e a lista só
encolhe.** O teste conhece, uma a uma, as telas e abas que hoje moram no módulo
errado (§5). Elas passam; qualquer outra reprova. Item da lista que já foi arrumado e
continua nela **também reprova**: lista de exceção que só cresce é onde a bagunça
volta a entrar.

**R-ORG-15 — O Decorsoft é referência de organização, não de regra.** Vale copiar:
cadastro como módulo-base, material com a lista de quem vende, parceiro num cadastro
só, depósitos numerados, Fiscal e Financeiro próprios, parâmetros num lugar. Não vale
copiar: Estoque, Compras e Logística no mesmo módulo; tela de 300 campos;
comportamento escondido em configuração; uma pessoa fazendo e aprovando.

## 5. O inventário: onde cada tela está e onde deveria estar

São **45 telas** (29 da medida padrão e 16 do sob medida) e as dez abas da 501.
**✓** = já está no lugar. **↗** = fora do lugar (entra na lista do R-ORG-14).

### Medida padrão

| Nº | Tela | Bloco de hoje | Módulo certo | Bloco | |
|---|---|---|---|---|---|
| 101 | Revisão | Produção | Produção | Medida padrão | ✓ |
| 102 | Embalagem | Produção | Produção | Medida padrão | ✓ |
| 103 | Subir PDF de vendas | Produção | Comercial | Mercado Livre | ↗ |
| 104 | Problemas | Produção | Produção | Medida padrão | ✓ |
| 105 | Painel da TV | Produção | Produção | Medida padrão | ✓ |
| 201 | Etiqueta de Venda | Expedição | Expedição | Comum | ✓ |
| 202 | Conferência | Expedição | Expedição | Comum | ✓ |
| 204 | Pendências | Expedição | Expedição | Comum | ✓ (ver nota) |
| 205 | Correções | Expedição | Expedição | Comum | ✓ |
| 206 | Horários de coleta | Expedição | Expedição | Comum | ✓ |
| 251 | Devoluções: receber | Devoluções | Pós-venda | Mercado Livre | ✓ |
| 252 | Devoluções: em andamento | Devoluções | Pós-venda | Mercado Livre | ✓ |
| 253 | Devoluções: baixa | Devoluções | Pós-venda | Mercado Livre | ✓ |
| 301 | Estoque | Estoque | Estoque de produto pronto | Medida padrão | ✓ |
| 302 | Contagem | Estoque | Estoque de produto pronto (peça) + Almoxarifado (material) | Medida padrão / Comum | ↗ a parte de material |
| 303 | Inventário | Estoque | Estoque de produto pronto | Medida padrão | ✓ |
| 401 | Planejamento | Planejamento | Planejamento | Medida padrão | ✓ |
| 402 | Cadastro de SKU | Planejamento | Cadastros | Medida padrão | ↗ |
| 403 | SKU incompleto | Planejamento | Cadastros | Medida padrão | ↗ |
| 404 | Ficha técnica | Planejamento | Cadastros | Medida padrão | ↗ |
| 501 | Compras | Compras | Compras | Comum | ✓ (abas abaixo) |
| 502 | Recebimento | Compras | Almoxarifado | Comum | ↗ |
| 503 | Almoxarifado | Compras | Almoxarifado | Comum | ↗ |
| 504 | Contagem de material | Compras | Almoxarifado | Comum | ↗ |
| 901 | Acessos | Sistema | Administração | Comum | ✓ |
| 902 | Cadastros (listas, kit, horários) | Sistema | Cadastros (listas e kit) + Administração (horários = parâmetro) | Comum | ↗ |
| 903 | Modo teste | Sistema | Administração | Comum | ✓ |
| 904 | Relatórios | Sistema | Relatórios e indicadores | Comum | ↗ |
| 905 | Minha produção | Sistema | Relatórios e indicadores | Medida padrão | ↗ |

> **Nota da 204 Pendências:** ela é a central que junta pendência de vários módulos.
> Fica em Expedição, onde está a maior parte das linhas, até uma spec decidir se vira
> tela de Administração.

### As abas da 501 Compras

| Aba | Módulo certo | |
|---|---|---|
| Lista de compras | Compras | ✓ |
| Pedidos | Compras | ✓ |
| Compra rápida | Compras | ✓ |
| Compra programada | Compras | ✓ |
| Materiais | Cadastros · Comum | ↗ |
| Fornecedores | Cadastros · Comum (Parceiros) | ↗ |
| Almoxarifados | Cadastros · Comum | ↗ |
| Recebimento retido | Almoxarifado | ↗ |
| Notas | Fiscal | ↗ |
| Certificado | Fiscal | ↗ |

### Sob medida (hoje, tudo no bloco "Sob medida")

| Nº | Tela | Módulo certo | Bloco |
|---|---|---|---|
| 601 | Início | Administração | Comum |
| 602 | Corte | Produção | Sob medida |
| 603 | Sobras | Almoxarifado | Sob medida |
| 604 | Rolos | Almoxarifado | Sob medida |
| 605 | Etiquetas | Almoxarifado | Sob medida |
| 606 | Cadastros | Cadastros | Sob medida |
| 607 | Painel | Relatórios e indicadores | Sob medida |
| 608 | Catálogo | Cadastros | Sob medida |
| 609 | Simulador | Comercial | Revenda |
| 610 | Revendas | Comercial | Revenda |
| 611 | Pedidos | Comercial | Revenda |
| 612 | Produção | Produção | Sob medida |
| 613 | Bancada | Produção | Sob medida |
| 614 | Quadro | Planejamento | Sob medida |
| 615 | Indicadores | Relatórios e indicadores | Sob medida |
| 616 | Financeiro | Financeiro | Revenda |

As 16 entram na lista do R-ORG-14 até o menu único existir: hoje nenhuma aparece no
módulo do assunto.

### O que falta e ninguém acha (achado da varredura, não é desta spec)

- **Material ↔ fornecedor**: a rota de "quem vende, em que embalagem, a que preço"
  existe no servidor e nenhuma tela chama.
- **Tecido da medida padrão**: o material novo não tem família, cor e largura de
  bobina, que é como a ficha acha o tecido.

Os dois são da spec `CADASTRO-DE-MATERIAL` (§8). O caso de teste dela é o tecido bege
de 3,20 do fornecedor CKS.

## 6. Fica de fora

- **Mover qualquer tela ou aba de lugar.** Esta spec decide e trava; mover é das
  specs do §8.
- Mudar o número, o endereço ou a permissão de qualquer tela. Ninguém ganha nem perde
  acesso.
- Mudar o menu que as pessoas veem hoje.
- Banco de dados: nenhuma coluna, nenhuma tabela, nenhuma fusão de arquivo.
- Construir qualquer módulo reservado.
- Regra de negócio da fábrica: nenhuma muda.

## 7. Alçada

Telas novas: nenhuma · Ações novas: nenhuma · Setores novos: nenhum.

## 8. As specs seguintes, na ordem recomendada

Cada uma é conversa própria no Projeto e já nasce com a seção "Onde mora".

| # | Spec | O que faz | Por que nesta ordem |
|---|---|---|---|
| 1 | `MENU-UNICO` | o ☰ Menu agrupa por módulo → bloco, nas duas operações; o rodapé do sob medida sai | é o que faz o mapa aparecer; sem ele mover tela não muda o que a pessoa vê |
| 2 | `CADASTRO-DE-MATERIAL` | tela própria em Cadastros: material com "quem vende", tecido completo, marca da operação, parceiros num cadastro só; tira Materiais, Fornecedores e Almoxarifados da 501 | é o que destrava o Compras |
| 3 | `ALMOXARIFADO-E-FISCAL` | Recebimento retido vai para Almoxarifado; Notas e Certificado inauguram o Fiscal; a 501 fica só com compra | termina de limpar a 501 |
| 4 | `FICHAS-NO-CADASTRO-UNICO` | as duas fichas técnicas passam a apontar para o mesmo material, com um saldo só | precisa da 2 pronta |
| 5 | `FINANCEIRO` | a pagar das compras e a receber do sob medida no mesmo módulo | o pagamento das compras já nasceu pronto para isso |
| 6 | depois | Comercial do consumidor final · Instalação e entrega · cortinas · Portal da revenda | é a troca do Decorsoft, canal por canal |

## 9. Fases

### Fase 1 — O papel  🟢

- `CLAUDE.md`: seção nova "Como o sistema se organiza" (os módulos, R-ORG-01 a 15 em
  uma linha cada) e, no §0, o bloco 📍 LUGAR no PLANO e a linha "Lugar conferido" no
  FECHAMENTO.
- `docs/specs/README.md`: a regra da seção "Onde mora" em toda spec nova.
- `docs/DECISOES.md`: as linhas desta spec.
- `docs/regras/organizacao.md` (novo): os cartões R-ORG, cada um com o teste que o trava.
- Nenhum código.

### Fase 2 — O mapa no código e o teste  🟡

- `telas.js` e `tecido/nucleo/telas.js`: cada tela ganha `modulo`, `bloco` e
  `liga` (R-ORG-05 e 07). A lista de módulos e de faixas (R-ORG-01 e 06) mora num
  lugar só, lido pelas duas operações.
- As abas da 501 passam a ser declaradas no mapa, cada uma com o módulo do assunto.
- `teste_lugar.js` (novo, escrito antes): reprova tela sem módulo, módulo fora da
  lista, bloco que não é do tipo do módulo, aba de outro assunto fora da lista
  nomeada, e item da lista que já foi arrumado.
- **O menu, as telas e as permissões não mudam**: o `teste_mapa.js` e o
  `teste_menu.js` têm que passar sem mudar o esperado. É a prova de que ninguém viu
  diferença.

## 10. Testes (todos rodados pelo Claude Code)

| Teste | O que trava |
|---|---|
| `teste_lugar.js` (novo) | R-ORG-01, 02, 04, 05, 06, 07 e 14 |
| `teste_mapa.js`, `teste_menu.js`, `teste_acesso.js` | nada mudou para ninguém (sem mudar o esperado) |
| `cd tecido && npm test` | o sob medida continua igual |

Defeitos a reintroduzir um a um, cada um reprovando: tela sem módulo · módulo
inventado · aba de outro assunto fora da lista · tela nova na faixa 600 · item
arrumado esquecido na lista · bloco "Revenda" numa tela de Produção.
