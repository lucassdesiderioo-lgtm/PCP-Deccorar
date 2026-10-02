# Navegação entre operações e linguagem do sistema

> **STATUS: planejado** · 02/10/2026
> Desenhada no Projeto do Claude com o Lucas, em 02/10/2026.
> Tipo: AJUSTE (telas atuais) + duas REGRAS de desenvolvimento (valem para toda tela nova).
> Risco: 🟢 nos textos e 🟡 no botão, porque ele lê as áreas de acesso para decidir se aparece. Nenhuma fase mexe em estoque, banco ou permissão.

| Fase | O quê | Situação |
|---|---|---|
| 1 | Botão de troca de operação nas duas barras | planejado |
| 2 | Troca dos textos de hierarquia | planejado |
| 3 | Testes de proteção das duas regras | planejado |
| 4 | Regras no papel (`CLAUDE.md`, `DECISOES.md`) | planejado |

---

## 1. O problema

**Navegação.** A fábrica tem duas operações, a **medida padrão** e o **sob medida**. Quem escolhe entre elas é a tela `/setor` ("Onde você vai trabalhar?").
- Na **medida padrão**, nenhuma das 11 telas tem caminho para a `/setor` nem para o sob medida. Quem entra na Embalagem ou na Expedição só sai pelo login.
- No **sob medida**, as 7 telas têm "Trocar setor" na barra de cima e "← Medida padrão" no rodapé. Esse link aponta para `/`, que é o admin. Um operador sem acesso ao admin cai em "sem permissão" (ver §6, "Achado").
- As duas operações não seguem um padrão: lugar, nome e comportamento do botão são diferentes.

**Linguagem.** Textos de tela tratam quem aprova pela hierarquia: "Enviar para a chefia", "aguardando chefia", "A gestão decide". Regra do Lucas: *não é bonito nem profissional, e nenhum termo igual ou parecido deve existir no sistema.*

## 2. Regras decididas (02/10/2026)

### Regra A — toda tela interna tem a troca de operação

1. Toda tela interna das duas operações mostra, **no canto superior direito**, com o **mesmo lugar e o mesmo visual** nas duas:
   - **"Trocar setor"**: leva à `/setor`. Aparece **sempre, para todo mundo**.
   - **Atalho direto para a outra operação** ("Sob medida →" / "Medida padrão →"): leva direto, sem passar pela escolha. Aparece **só para quem tem acesso às duas operações**.
2. Destino do atalho:
   - **Da medida padrão para o sob medida:** a tela inicial do sob medida (`/sobmedida`).
   - **Do sob medida para a medida padrão:** a primeira tela da medida padrão a que a pessoa tem acesso, pela **mesma regra** que a `/setor` já usa (a lista `ORDEM` em `public/setor.html`). Essa regra passa a ter **um dono só**, usado pela `/setor` e pelas duas barras. Duas cópias da lista divergiriam na primeira tela nova.
3. **Esconder o botão não é segurança.** Quem tranca continua sendo o servidor (`auth.js` e o portão do `tecido/montar.js`). O botão só evita mostrar um caminho que vai dar "não".
4. Vale **inclusive para a TV** (`/painel`), porque algumas pessoas podem vir a ter acesso a ela.
5. **Ficam fora:** a `/login`, a própria `/setor` e o **portal da revenda** (o login das lojas, hoje ou quando existir). Revenda nunca vê "Trocar setor" nem o atalho.
6. **Tela nova:** usa a barra (`nav.js`) da sua operação, e com isso já nasce com o botão. Não existe tela interna sem barra.

### Regra B — a linguagem não nomeia hierarquia

1. Nos textos que **quem usa o sistema vê**, não entram **chefia, chefe, patrão, dono, gestão** nem variações. Isso vale para telas, botões, selos, mensagens de erro, textos de ajuda, nomes de permissão (tela Acessos) e o que os scripts mostram no terminal.
2. O texto **nomeia a etapa, não a pessoa**: *Enviar para aprovação · Aguardando aprovação · Pendente de conferência · Aprovado · Recusado.*
   - Motivo: quem aprova é decidido pela **permissão**, não pelo cargo. "Enviar para o admin" passa a mentir no dia em que a permissão for dada a um Supervisor.
3. Quando for preciso nomear alguém, usa os níveis do controle de acesso: **Operação, Supervisor, Admin, Admin Geral**.
4. **Ficam fora:** comentários de código, o `CLAUDE.md`, os documentos em `docs/` e o termo técnico **"dono único"** (o arquivo responsável por uma conta). Nada disso aparece para a fábrica.

## 3. Fase 1 — o botão

**Arquivos:** `public/nav.js`, `tecido/public/nav.js` e o novo dono único do destino (o Claude Code decide onde ele mora, por exemplo `public/destino.js` ou um campo na resposta de `/api/auth/eu`). A `public/setor.html` passa a ler desse dono.

- **Medida padrão** (`public/nav.js`): acrescentar o bloco do canto superior direito. Hoje essa barra só tem o rodapé de atalhos (Alt+1…), que **continua igual**.
- **Sob medida** (`tecido/public/nav.js`): o "Trocar setor" que já existe vai para o mesmo bloco, com o mesmo visual. O link "← Medida padrão" do rodapé **sai** e é substituído pelo atalho direto do bloco, que usa a regra de destino. Assim não ficam dois botões fazendo a mesma coisa, um deles errado.
- **Conferir tela por tela** se o bloco cobre algo: o cabeçalho colorido por modo na Revisão (`/operador`), o relógio de despacho na Etiqueta de Venda e a TV. Se cobrir, o ajuste é de espaçamento da tela, **nunca** mudar o bloco de lugar só naquela tela.
- Visual: cores copiadas das telas do PCP, como manda a §19 do `CLAUDE.md`. Nenhuma cor nova só no sob medida.
- Tamanho de toque adequado para tablet (botões grandes, §1 do `CLAUDE.md`).

**Teste manual:** entrar com três pessoas:
1. Só medida padrão: vê "Trocar setor" e não vê o atalho.
2. Só sob medida: vê "Trocar setor" e não vê o atalho.
3. As duas operações: vê os dois, e o atalho cai na tela certa nos dois sentidos.

Depois, rodar o teste de segurança da §10 e da §19 do `CLAUDE.md`. Ele tem que dar o mesmo resultado de antes.

## 4. Fase 2 — os textos

Trocar pelos textos abaixo. O levantamento é de 02/10/2026. **O Claude Code refaz a busca antes de mexer**, porque pode haver ocorrência nova.

| Onde | Hoje | Passa a ser |
|---|---|---|
| Sobras, botão | Enviar para a chefia | **Enviar para aprovação** |
| Sobras, selo e estado | aguardando chefia | **Aguardando aprovação** |
| Sobras, rótulo do campo | MOTIVO (a chefia lê isto) | **Motivo** · visível para quem aprova |
| Sobras, aviso | …apontada para a chefia: … | **…enviada para aprovação: …** |
| Sobras, texto do formulário | …a chefia recebe o apontamento, confere e aceita ou recusa… | **…a correção vai para aprovação e a resposta aparece nesta sobra.** |
| Sobras, dica (title) | …a chefia ainda não decidiu | **…aguardando aprovação** |
| Sobras e Rolos, aviso de cadastro | …criada. A chefia confere depois. | **…criada. Fica pendente de conferência.** |
| Rolos, bobina nova | …a chefia confere depois. | **…fica pendente de conferência.** |
| Cadastros, texto de ajuda | …a bancada corta e cadastra sobra; a chefia mexe em tecido… | **…a Operação corta e cadastra sobra; o nível administrativo cuida de tecido…** |
| `tecido/dominio/sobra.js`, erro | …um apontamento esperando a chefia… | **…uma correção aguardando aprovação…** |
| `tecido/nucleo/permissoes.js`, nome | Apontar erro numa sobra para a chefia corrigir | **Propor correção de sobra** |
| Expedição e Embalagem, aviso | A gestão decide agência ou coleta em Admin → Bloqueados | **Defina agência ou coleta em Admin → Bloqueados** |
| `rastrear.js`, saída | …a gestão decide | **…definir em Admin → Bloqueados** |
| `conferir_nf.js`, saída | A regra do dono: uma venda = … | **Regra da operação: uma venda = …** |

**Cuidados:**
- **Nome de permissão:** troca só o `nome` (o texto mostrado). A **chave** (`sobra.propor`) não muda, senão quem já tem a permissão a perde em silêncio (armadilha #13).
- **Nomes de migração** em `tecido/nucleo/schema.js` ("a chefia confere depois") **não se alteram**. São história do banco, não aparecem em tela, e mudar o nome de uma migração já aplicada é arriscado.
- **Valor gravado** `origem='gestao'` no banco (`exp_route.js`) **não muda**. É dado, não texto de tela. Se esse valor aparecer em alguma tela, a tela traduz para "aprovação".

## 5. Fase 3 — testes de proteção

As duas regras valem para toda tela nova. Sem teste, elas duram até a próxima tela. O modelo é o `teste_caminhos.js`, que já recusa `/opt/expedicao` escrito no código.

1. **Palavra proibida.** Varre `public/`, `views/`, `tecido/public/`, os nomes em `permissoes.js` e `tecido/nucleo/permissoes.js` e as mensagens que vão para a tela, ignorando comentários. Falha se encontrar *chefia, chefe, patrão/patrao, gestão/gestao* ou *dono* em texto visível. **"dono único" é exceção explícita.** Vale lembrar que o valor gravado `'gestao'` é dado e não texto de tela.
2. **Tela sem barra.** Toda `.html` interna das duas operações carrega o `nav.js` da sua operação. A lista de exceções é **escrita no teste**: `login.html`, `setor.html` e, quando existir, o portal da revenda.

Os dois rodam no CI (`.github/workflows/testes.yml`). A §14 do `CLAUDE.md` (dívida 10) passa a listá-los.

## 6. Fase 4 — papel em dia

- `CLAUDE.md`: Regra A e Regra B, numa seção nova "Navegação e linguagem", e duas linhas na §15 ("O que NÃO fazer"):
  - ❌ Criar tela interna sem o `nav.js` da operação.
  - ❌ Escrever chefia, chefe, patrão, dono ou gestão em texto que aparece para quem usa o sistema.
- `docs/DECISOES.md`: as duas linhas do pacote de entrega.
- Esta spec: STATUS atualizado e, ao terminar, mudança para `docs/arquivo/`.

**Achado (registrado aqui para não se perder):** o "← Medida padrão" do rodapé do sob medida aponta para `/`, que é o admin. Operador com acesso às duas operações e sem admin cai em "sem permissão". A Fase 1 resolve isso ao trocar o link pelo atalho com destino calculado.

## 7. Fica de fora

- Mudar **quem** aprova o quê: as permissões continuam iguais, só o texto muda.
- O portal da revenda e qualquer tela vista por cliente externo.
- Reescrever comentários de código, o `CLAUDE.md` antigo ou os documentos em `docs/`.
- Atalhos de teclado novos para a troca de operação.
- Redesenho das barras além do bloco novo.
