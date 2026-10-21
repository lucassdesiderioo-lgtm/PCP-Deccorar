> **STATUS · 21/10/2026 — RASCUNHO PARA APROVAÇÃO** · tipo `REGRA` · nada construído.
> Nasceu da entrevista do guardião de 21/10/2026. O dono pediu: *"avalie se o
> nosso controle de acesso é condizente com o que estamos criando … daqui a
> alguns dias vamos estar com todo o time cadastrado, mais ou menos 20 logins"*.
> Ele aprovou a direção (os sete princípios da §3) no mesmo dia. As perguntas
> da §6 ainda esperam resposta.

---

# Acessos unificados — uma lista só de permissões para as duas operações

## 1. Por que mexer agora

Hoje entram poucas pessoas no sistema. Em alguns dias serão cerca de 20, e a
ideia é **controlar a autonomia de cada uma**: cada pessoa faz o que é dela,
sem depender do dono para tudo e sem poder mais do que precisa.

A medida padrão já funciona assim. O sob medida não funciona.

## 2. Como está hoje

### Medida padrão (`acesso.js`, `permissoes.js`)

- **58 permissões**, cada uma com um nível (21 de Operação, 7 de Supervisor,
  27 de Admin e 3 de Admin Geral). 16 delas estão marcadas como **sensíveis**.
- **18 setores**, como Operador / Revisão, Comprador, Financeiro, Admin e
  Admin Geral. A pessoa recebe um ou mais setores e, se precisar,
  **exceções** individuais (dar ou tirar uma permissão só dela).
- O que já funciona como num sistema maduro:
  - ninguém aprova o próprio trabalho em estoque, nem o Admin Geral;
  - três permissões só o Admin Geral tem e nunca saem dele: gerenciar
    pessoas, gerenciar setores e ver auditoria;
  - rota nova nasce trancada;
  - mudança de acesso fica gravada na auditoria.

### Sob medida (`tecido/nucleo/acesso.js`, `tecido/nucleo/permissoes.js`)

- **41 permissões** próprias, que **não aparecem** na tela de Acessos.
- **4 papéis fixos**, e a pessoa cai em um só:

| Papel | Permissões | Como a pessoa cai nele hoje |
|---|---|---|
| diretor | todas | tem a área `admin` **ou** a área `sobmedida_adm` |
| cortador | 16 | tem a área `sobmedida` |
| vendedor | 10 | tem a área `sobmedida_venda` |
| produção | bipar | tem a área de um dos cinco setores |

- A tela de Acessos marca uma **área**, e o módulo traduz a área em papel
  (`PERM_AREA` no `acesso.js` e `papelDe` no `tecido/nucleo/acesso.js`). Essa
  tradução já falhou em silêncio três vezes: armadilhas #13, #28 e #34.

## 3. O que deve valer (aprovado pelo dono em 21/10/2026)

| # | Regra | Por quê |
|---|---|---|
| R-ACE-01 | **Uma lista só de permissões** para as duas operações. As 41 do sob medida aparecem na tela de Acessos, no grupo "Sob medida" | Hoje no sob medida é tudo ou um pacote fixo; para lançar boleto a pessoa precisa ser diretor |
| R-ACE-02 | **Pessoa = setores + exceções**, nas duas operações. Os papéis do sob medida viram setores comuns | É o modelo que já funciona na medida padrão |
| R-ACE-03 | **O nível é etiqueta de cuidado, não trava escondida.** Ao salvar um setor a tela mostra as permissões sensíveis que ele carrega, e **salvar nunca apaga** uma permissão que a pessoa não desmarcou | Fecha a dívida 20: hoje a permissão acima do nível some no salvamento |
| R-ACE-04 | **Quem pede não aprova**, nos atos que mexem em estoque ou dinheiro | Já vale para contagem, ajuste e correção de corte; a §6 pergunta se estende |
| R-ACE-05 | **Dois Admin Geral**: o dono e uma segunda pessoa de confiança, só para emergência | Com uma pessoa só, se ela ficar fora ninguém destrava a fábrica |
| R-ACE-06 | **Toda ação grava quem fez**, inclusive revisão e embalagem | Fecha a dívida 9; sem isso não dá para medir a autonomia de ninguém |
| R-ACE-07 | **Entrada mais forte antes do time inteiro**: PIN de 6 dígitos e HTTPS | Dívida 2: com 20 logins em tablet dividido, o PIN de 4 dígitos viaja aberto na rede |

## 4. ⚠️ O que a análise achou e precisa ser resolvido primeiro

**Quem tem QUALQUER permissão de nível Admin vira DIRETOR no sob medida.**

A conta é esta:
1. o `sincronizarAreas` (`acesso.js`) grava a área `admin` para quem tem
   qualquer permissão de nível Admin;
2. o `papelDe` (`tecido/nucleo/acesso.js`) lê a área `admin` como **diretor**.

Os setores **Comprador** e **Financeiro** são de nível Admin. Então quem for
posto num deles para comprar material ou pagar fornecedor entra no sob medida
podendo tudo: lançar e baixar boleto, mexer em preço e parâmetros, descartar
sobra e aprovar correção de corte. Uma exceção solta, como "Ver custo", faz o
mesmo.

Hoje não aparece porque quase ninguém está nesses setores. **Com 20 logins vai
aparecer**, e sem aviso nenhum: a tela de Acessos mostra "Comprador", e o
sob medida trata a pessoa como dono.

É a armadilha #34 por outra porta, e por isso é a **fase 1**.

## 5. Fases

**Fase 1 — fechar a porta do diretor** (🔴 acesso)
- No sob medida, diretor passa a ser só quem é **Admin Geral** ou está no
  setor **Sob medida / Cadastros**. A área `admin` deixa de bastar.
- Teste escrito antes do conserto: uma pessoa só no setor Comprador
  **não** entra no sob medida como diretor.
- Antes do deploy: listar quem hoje é diretor no sob medida e quem deixaria de
  ser (pergunta P1).

**Fase 2 — uma lista só** (🔴 acesso)
- As 41 permissões do sob medida entram em `permissoes.js`, no grupo
  "Sob medida", com nível e marca de sensível.
- Os quatro papéis viram setores, com as mesmas permissões de hoje:
  "Sob medida / Direção", "Sob medida / Corte", "Sob medida / Venda" e a
  produção que já existe.
- O módulo pergunta ao PCP "esta pessoa tem esta permissão?" e deixa de
  traduzir área em papel. Saem o `PERM_AREA` do sob medida e o `papelDe`.
- **Ninguém ganha nem perde nada na passagem.** O teste compara, pessoa a
  pessoa, o que ela podia antes e o que pode depois.

**Fase 3 — a tela de setor não apaga nada** (🔴 acesso)
- Salvar um setor preserva o que não foi desmarcado, e mostra as sensíveis
  antes de confirmar (R-ACE-03, dívida 20).
- Sai a permissão "Definir estoque mínimo", que nenhuma tela usa (dívida 19).

**Fase 4 — quem fez** (🟡)
- Revisão e embalagem gravam a pessoa (R-ACE-06, dívida 9).

**Fase 5 — a entrada** (🔴 acesso)
- PIN de 6 dígitos obrigatório para pessoa nova, e troca pedida no próximo
  login de quem tem 4. O campo da tela já aceita até 6; o que muda é deixar de
  aceitar 4. HTTPS no servidor (R-ACE-07, dívida 2). Precisa de configuração
  no servidor, além do código.

## 6. Perguntas ao dono

- **P1.** Na fase 1, quem hoje está no setor **Admin** (não Admin Geral)
  continua diretor no sob medida, ou passa a precisar do setor
  "Sob medida / Cadastros"? Recomendação: passa a precisar, porque é o
  único jeito de o setor dizer a verdade.
- **P2.** "Quem pede não aprova" deve valer também para **baixa de boleto** e
  **descarte de sobra**? Hoje esses dois são feitos por uma pessoa só.
- **P3.** Na fase 2, o vendedor continua **aprovando o pedido da própria
  carteira**, como hoje?
- **P4.** A fase 5 entra antes do time inteiro, ou depois?

## 7. Fica de fora (ideias anotadas, não são desta spec)

- **Estoque de insumos no Planejamento.** Hoje o mínimo e o ideal dos
  **insumos** (tubo, tecido, parafuso) moram em Compras → Materiais, e o
  Planejamento cuida das **persianas prontas**. A ideia do dono é juntar o
  controle de estoque num lugar só. Precisa de spec própria.
- **Produção em lote na medida padrão.** Lá também existem serralheria, corte,
  montagem, revisão e embalagem, mas o corte de tecido e alumínio é feito em
  grande quantidade de uma vez. Hoje o PCP só registra revisão e embalagem da
  medida padrão. Precisa de spec própria.

## 8. Fora do código

- **Segunda Admin Geral: Isabela** (decisão do dono, 21/10/2026). O cadastro é
  feito pelo dono na tela `/acessos` (Pessoas & Acessos): nome e PIN no
  campo "Nova pessoa", depois a pessoa na lista, o setor Admin Geral marcado e
  "Salvar setores". O PIN não é escrito em documento nenhum.
