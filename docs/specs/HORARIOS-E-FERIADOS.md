# HORARIOS-E-FERIADOS — o corte da Revisão pela coleta lançada, e uma lista só de feriados

> **STATUS (11/11/2026): RASCUNHO — NÃO APROVADO.** Nada construído. Nasceu dos dois
> "achei no caminho" do AJUSTE D12 da `ARRUMAR-O-LUGAR` (o horário padrão foi para a
> 206). O dono disse *"devemos arrumar isso"*. As decisões marcadas **D** são dele.

## 1. O problema

**A. O corte da Revisão é o do padrão, e não o da coleta.** A tela da Revisão (101)
diz *"Corte às 10:30 — ainda pode entrar venda"*. Esse número vem de
`config.corte_<dia>` (`st_route.js`, `GET /api/revisao/status`), o horário padrão
da semana. Desde 05/11/2026 o corte de verdade de cada coleta é lançado na 206
(`saida_horario.corte`), porque o ML muda o horário durante a semana. Quando o ML
muda, a Revisão continua dizendo o corte velho. A agência já usa o horário lançado
(`despacho_origem:'lancado'`). Quem ficou para trás foi só o corte da coleta.

**B. Há duas listas de feriado, e uma não sabe da outra.**

| Onde | O que é | Quem usa |
|---|---|---|
| `sm_feriado` (no `tecido.db`) | data e nome, na 906 | prazo do pedido do sob medida (dia útil) |
| "sem coleta — feriado" na 206 (`saida_dia`) | por data, digitado à mão, com o nome | a faixa da coleta, a saída do upload |
| o "sair até" do item faltante (§9-B) | dia útil seg–sex, **feriado conta como dia útil** | Devoluções em andamento |

Um feriado cadastrado na 906 não aparece na 206. Para que apareça, alguém tem que
lembrar de marcar o dia também lá.

## 2. O que muda (proposta)

### Fase 1 — o corte da Revisão vem da 206 (🟡)

- `GET /api/revisao/status` pergunta ao `coleta_horario.js` (o dono dos horários),
  e não ao `config`.
- **Qual corte vale (D1):** o da próxima coleta do dia que ainda tem corte pela
  frente. Depois do último corte, a tela diz *"Lista fechada às <último corte>"*.
- **Quando não há coleta lançada, ou ela está em rascunho (D2):** vale o padrão da
  semana, e a tela diz *"horário padrão — a coleta de hoje não foi lançada"*.
- **O corte "a conferir" (D2):** aparece em âmbar, com *"a conferir"*.
- **Dia "sem coleta" (D3):** a tela diz *"Hoje não tem coleta (feriado X)"* e não
  mostra corte.
- A agência e o despacho não mudam.

### Fase 2 — uma lista de feriados, no PCP (🔴: schema, dois bancos, migração)

- A lista passa para o `dados.db`: tabela `feriado`, com o dono único
  `feriado_dominio.js`. O que é comum mora no PCP (R-ORG-12).
- O sob medida passa a ler pela porta, como já faz com os endereços. O prazo do
  pedido continua dando o mesmo resultado.
- A `sm_feriado` é copiada **uma vez só**, com uma marca em `config`, e com backup
  dos dois bancos antes.
- O cadastro continua na 906, no mesmo lugar e com a mesma cara.
- **A 206 conhece a lista (D4):** ver as opções na seção 3.
- **O item faltante (D5):** se o feriado passa a contar ou não no "sair até".
- **Tipo de feriado (D6):** se a lista tem uma marca por feriado. Ver na seção 3.

## 3. Decisões do dono

| # | Pergunta | Recomendação |
|---|---|---|
| D1 | Com 2 ou 3 coletas no dia, qual corte a Revisão mostra? | o da **próxima** coleta ainda pela frente |
| D2 | Sem coleta lançada, em rascunho ou com o corte "a conferir": o que a Revisão mostra? | o **padrão**, dizendo que é o padrão; o "a conferir" aparece em âmbar |
| D3 | Dia marcado "sem coleta": o que a Revisão diz? | *"Hoje não tem coleta"*, com o motivo |
| D4 | Feriado cadastrado na 906: o que acontece na 206? | **(a)** o dia já nasce "sem coleta — feriado X" no rascunho da semana, e quem confirma a semana pode tirar se o ML vier — **recomendado**; **(b)** só um aviso na 206, e a pessoa marca; **(c)** marca sozinho e vale sem confirmar |
| D5 | O "sair até" do item faltante passa a pular feriado? | **sim**, o feriado deixa de contar como dia útil |
| D6 | Feriado da fábrica e "o ML não coleta" são a mesma coisa? | uma lista só, com a marca **"o ML não coleta"** (nasce marcada); a fábrica fechada vale para o prazo |

## 4. Fica de fora

- O despacho da agência, que já usa o horário lançado.
- O corte da Etiqueta de Venda, que é contagem do despacho.
- Feriado puxado sozinho de calendário da internet.

## Onde mora

| O quê | Módulo · bloco | Liga-se a |
|---|---|---|
| a frase do corte | 101 Revisão · Produção · Medida padrão | 206 (lê o corte lançado) |
| a lista de feriados | 906 Parâmetros · Administração · Comum | 206, 611/610 (prazo do sob medida), 252 (item faltante) |
| o dia de feriado na 206 | 206 Horários de coleta · Expedição | 906 |

Nenhuma tela nova, nenhuma aba nova, nenhum módulo novo.

## Alçada

**Telas novas:** nenhuma.

**Ações novas:** `feriado.editar`.
- Nível Supervisor, pendurada na 906, sensível: não.
- Backfill de uma vez só para quem já tem `sobmedida.parametro.editar`, para ninguém
  perder o cadastro de feriado.
- Fora isso, só o Admin Geral recebe.

**Setores novos:** nenhum.

## Como testar

- **Fase 1:** `teste_horario_coleta.js` ganha casos para a Revisão com 0, 1 e 3
  coletas, rascunho, "a conferir" e "sem coleta". A tela 101 é aberta no navegador.
- **Fase 2:**
  - teste novo `teste_feriado.js`: a migração uma vez só, a porta, e a 206 recebendo
    o feriado;
  - `cd tecido && npm test`, com o `prazo.test.js` sem mudar o esperado;
  - `teste_devolucao_casos.js`, por causa do item faltante.
