# Regras — Como o sistema se organiza

> Cada cartão é **uma regra que vale hoje**, com o motivo, as exceções e o teste
> que impede alguém de desfazê-la. Área nova (10/11/2026), nascida da spec
> [`ORGANIZACAO-DO-SISTEMA`](../specs/ORGANIZACAO-DO-SISTEMA.md); o resumo está no
> `CLAUDE.md` §22. Formato do cartão: [`README.md`](README.md).
>
> ⚠️ **Até a fase 2 da spec, estas regras valem pelo papel**: o PLANO (📍 LUGAR),
> o FECHAMENTO ("Lugar conferido") e a seção "Onde mora" das specs. O
> `teste_lugar.js` que vai travá-las é escrito na fase 2, antes do código; até lá
> os cartões dizem "⚠ sem teste (a escrever na fase 2)".

---

## A. Os módulos

### R-ORG-01 · A lista de módulos é fechada
- Regra:            são dezoito: Comercial · Portal da revenda · Planejamento · Produção · Expedição · Instalação e entrega · Pós-venda · Estoque de produto pronto · Almoxarifado · Compras · Cadastros · Fiscal · Financeiro · Relatórios e indicadores · Administração · Frota · Mercado Livre (integração) · Pessoas. Módulo novo só entra com aprovação do dono e linha em `docs/DECISOES.md`. Módulo **reservado** está no mapa e só aparece no menu quando tiver a primeira tela; a spec que cria essa tela diz que está inaugurando.
- Por quê:          com a lista aberta, cada spec inventa o lugar onde nasceu (a causa da 501 com dez abas).
- Exceções:         nenhuma.
- Teste que trava:  ⚠ sem teste (a escrever na fase 2: `teste_lugar.js` — módulo fora da lista reprova).
- Status:           decidida em 10/11/2026; no papel.
- História:         spec `ORGANIZACAO-DO-SISTEMA` §1 e §4-A.

## B. A regra do lugar

### R-ORG-02 · A tela mora no módulo do assunto dela
- Regra:            nunca no módulo da spec que a criou.
- Por quê:          "conforme a gente vai criando as coisas, a gente não está organizando no local correto de cada coisa" (o dono, 10/11/2026).
- Exceções:         o que já está fora do lugar fica na lista nomeada (R-ORG-14) até a spec que o arruma.
- Teste que trava:  ⚠ sem teste (a escrever na fase 2: tela sem módulo reprova).
- Status:           decidida em 10/11/2026; no papel.
- História:         spec §1.

### R-ORG-03 · Nenhuma tela nasce solta
- Regra:            toda spec que cria tela, aba ou função diz, antes de qualquer outra coisa, onde ela mora. Três respostas só: (1) num módulo que existe, com o bloco e a que se liga; (2) num reservado, avisando que inaugura; (3) em nenhum — a spec **propõe o módulo novo e para ali**, até o dono aprovar. Spec sem a resposta não é aprovada, e o Claude Code não constrói.
- Por quê:          "a spec não pode criar uma tela nova do nada" (o dono).
- Exceções:         nenhuma.
- Teste que trava:  a seção "Onde mora" (`docs/specs/README.md`, regra 5) e o bloco 📍 LUGAR (`CLAUDE.md` §0). ⚠ sem teste automático.
- Status:           vale desde 10/11/2026, pelo papel.
- História:         spec §4-B.

### R-ORG-04 · Aba só para o mesmo assunto da tela
- Regra:            aba de assunto diferente é tela, no módulo dela. "Não criar tela nova" deixa de ser motivo para pendurar aba.
- Por quê:          a `COMPRAS-E-RECEBIMENTO` pôs material, fornecedor, almoxarifado, retido, nota e certificado como abas da 501.
- Exceções:         as abas da 501 de hoje, na lista nomeada (R-ORG-14).
- Teste que trava:  ⚠ sem teste (a escrever na fase 2: aba de outro assunto fora da lista reprova).
- Status:           decidida em 10/11/2026; no papel.
- História:         spec §1 e §5.

### R-ORG-05 · Dentro do módulo, o segundo nível é o bloco
- Regra:            módulo de produção (Produção, Planejamento, Almoxarifado, Estoque de produto pronto, Cadastros): Medida padrão · Sob medida · Comum. Módulo de venda (Comercial, Financeiro, Pós-venda, Relatórios e indicadores): Mercado Livre · Revenda · Consumidor final · Comum. Os demais: Comum.
- Por quê:          é assim que o sistema fica um só e as operações continuam separadas.
- Exceções:         nenhuma.
- Teste que trava:  ⚠ sem teste (a escrever na fase 2: bloco "Revenda" numa tela de Produção reprova).
- Status:           decidida em 10/11/2026; no papel.
- História:         spec §3 e §4-B.

### R-ORG-06 · O número não muda; tela nova na faixa do módulo
- Regra:            o número da tela continua não mudando nem se reaproveitando (R-TEL-02). O bloco do menu deixa de sair da centena e passa a sair do módulo declarado. Faixas: 100 Produção · 200 Expedição · 250 Pós-venda · 300 Estoque de produto pronto · 400 Planejamento · 500 Compras · 600 **fechada** · 700 Frota · 800 Mercado Livre · 900 Administração · 1000 Comercial · 1100 Cadastros · 1200 Almoxarifado · 1300 Fiscal · 1400 Financeiro · 1500 Instalação e entrega · 1600 Relatórios e indicadores · 1700 Pessoas · 1800 Portal da revenda.
- Por quê:          "libera a 204" continua sem ambiguidade, e o número passa a dizer o módulo da tela nova.
- Exceções:         as faixas de 1000 em diante são proposta da spec, **a confirmar pelo dono** antes da fase 2.
- Teste que trava:  ⚠ sem teste (a escrever na fase 2: tela nova na faixa 600 reprova). O número que não muda já é do `teste_mapa.js`.
- Status:           decidida em 10/11/2026 (faixas ≥ 1000 a confirmar); no papel.
- História:         spec §4-B.

### R-ORG-07 · Toda tela declara a que se liga
- Regra:            no mapa, cada tela lista as telas ou os cadastros de que depende e os que ela alimenta (`liga`).
- Por quê:          mostra, antes de construir, o que quebra se mexer.
- Exceções:         nenhuma.
- Teste que trava:  ⚠ sem teste (a escrever na fase 2).
- Status:           decidida em 10/11/2026; no papel.
- História:         spec §4-B.

## C. Um sistema só

### R-ORG-08 · Um menu só
- Regra:            as duas operações usam o mesmo ☰ Menu: módulo → bloco → tela com o número. O rodapé do sob medida sai. Cada pessoa continua vendo só o que alcança.
- Por quê:          hoje parecem dois sistemas.
- Exceções:         até a fase 3 da spec, o sob medida continua com o rodapé.
- Teste que trava:  ⚠ sem teste (fase 3); `teste_mapa.js` e `teste_menu.js` provam que ninguém ganha nem perde tela.
- Status:           decidida em 10/11/2026; não construída.
- História:         spec §4-C e STATUS (divergência D1).

### R-ORG-09 · Um cadastro só por coisa
- Regra:            material, parceiro (fornecedor, revenda, transportadora, cliente) e almoxarifado têm um cadastro, no módulo Cadastros. As duas operações leem dele. Cada material leva a marca de onde é usado: Medida padrão, Sob medida ou os dois.
- Por quê:          cadastro em quatro lugares (402/403/404, 902, 606/608 e duas abas da 501).
- Exceções:         até a spec `CADASTRO-DE-MATERIAL`, os cadastros ficam onde estão.
- Teste que trava:  ⚠ sem teste (das specs seguintes).
- Status:           decidida em 10/11/2026; não construída.
- História:         spec §4-C.

### R-ORG-10 · Um saldo só por material
- Regra:            o material que serve às duas operações tem um saldo. A separação aparece na ficha, no relatório e no custo de cada operação, e não em dois estoques com transferência.
- Por quê:          opção (a) do dono, 10/11/2026.
- Exceções:         o tecido do sob medida continua no `tecido.db` (rolo, sobra e corte, R-CMP-49/50).
- Teste que trava:  ⚠ sem teste (spec `FICHAS-NO-CADASTRO-UNICO`).
- Status:           decidida em 10/11/2026; não construída.
- História:         spec §4-C.

### R-ORG-11 · Duas fichas técnicas, um cadastro de material
- Regra:            a conta é diferente em cada operação (fórmula por modelo na medida padrão; escada, gomos e folhas no sob medida), e as duas apontam para o mesmo material.
- Por quê:          a conta é outra, o material é o mesmo.
- Exceções:         nenhuma.
- Teste que trava:  ⚠ sem teste (spec `FICHAS-NO-CADASTRO-UNICO`).
- Status:           decidida em 10/11/2026; não construída.
- História:         spec §4-C.

### R-ORG-12 · Dois bancos; o PCP é dono do que é comum
- Regra:            `dados.db` guarda material, parceiro, compra, almoxarifado e o que mais for comum; o sob medida lê pela porta (como a fase 10 da `COMPRAS-E-RECEBIMENTO` fez com o endereço). Fundir os dois arquivos **não** está decidido.
- Por quê:          fundir é obra 🔴 que não muda nada na tela; só se abre por spec própria se fizer falta.
- Exceções:         nenhuma.
- Teste que trava:  as portas já existentes (`teste_porta_almox.js`, `teste_porta_sobmedida.js`).
- Status:           vale desde 10/11/2026 (é como já funciona).
- História:         spec §4-C.

## D. Como a regra se faz valer

### R-ORG-13 · Quatro travas, uma em cada etapa
- Regra:            (1) conversa no Projeto: toda `REGRA` ou `NOVIDADE` abre com a classificação **e o módulo**; (2) spec: seção obrigatória "Onde mora" — módulo, bloco, número, a que se liga; sem nada novo, "nenhuma tela", e a seção nunca some; (3) Claude Code: bloco 📍 LUGAR no PLANO e linha "Lugar conferido" no FECHAMENTO (`CLAUDE.md` §0); (4) código: `teste_lugar.js`.
- Por quê:          uma trava só é contornada; quatro, uma por etapa, pegam o que a anterior deixou passar.
- Exceções:         nenhuma.
- Teste que trava:  as três primeiras pelo papel (§0 e `docs/specs/README.md`); a quarta é da fase 2.
- Status:           (2) e (3) valem desde 10/11/2026.
- História:         spec §4-D.

### R-ORG-14 · O que está fora do lugar é uma lista nomeada que só encolhe
- Regra:            o teste conhece, uma a uma, as telas e abas que hoje moram no módulo errado (§5 da spec): elas passam; qualquer outra reprova. Item arrumado que continua na lista **também reprova**.
- Por quê:          lista de exceção que só cresce é onde a bagunça volta a entrar.
- Exceções:         nenhuma.
- Teste que trava:  ⚠ sem teste (a escrever na fase 2: item arrumado esquecido na lista reprova).
- Status:           decidida em 10/11/2026; a lista está no §5 da spec e no `CLAUDE.md` §22.
- História:         spec §5.

### R-ORG-15 · O Decorsoft é referência de organização, não de regra
- Regra:            vale copiar: cadastro como módulo-base, material com a lista de quem vende, parceiro num cadastro só, depósitos numerados, Fiscal e Financeiro próprios, parâmetros num lugar. Não vale copiar: Estoque, Compras e Logística no mesmo módulo; tela de 300 campos; comportamento escondido em configuração; uma pessoa fazendo e aprovando.
- Por quê:          o PCP vai ocupar o lugar do Decorsoft para consumidor final e revenda (o dono, 10/11/2026), sem deixar de controlar a produção do Mercado Livre.
- Exceções:         nenhuma.
- Teste que trava:  ⚠ sem teste — é critério de desenho de spec.
- Status:           vale desde 10/11/2026.
- História:         spec §3 e §4-D.

---

## Regras sem teste

Todas, menos a R-ORG-12, até a fase 2 da spec (`teste_lugar.js`). A R-ORG-13
vale pelo papel; a R-ORG-15 é critério de desenho e não terá teste.

## O que NÃO fazer

- ❌ Pôr tela nova no módulo da spec que a criou, ou na faixa 600 (R-ORG-02, 06)
- ❌ Pendurar aba de outro assunto "para não criar tela nova" (R-ORG-04)
- ❌ Inventar módulo fora dos 18 sem o dono aprovar antes (R-ORG-01, 03)
- ❌ Aumentar a lista nomeada do que está fora do lugar para um teste passar (R-ORG-14)
- ❌ Mover tela ou aba de lugar dentro desta spec: mover é das specs seguintes (§8 da spec)
