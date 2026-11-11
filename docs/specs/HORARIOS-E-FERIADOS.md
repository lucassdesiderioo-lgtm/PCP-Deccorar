# HORARIOS-E-FERIADOS — o corte da Revisão pela coleta lançada, e uma lista só de feriados

> **STATUS (11/11/2026): RASCUNHO COM AS DECISÕES DO DONO — falta o "pode seguir".** Nada construído. Nasceu dos dois
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

## 2. O que muda

### Fase 1 — o corte da Revisão vem da 206 (🟡)

`GET /api/revisao/status` pergunta ao `coleta_horario.js` (o dono dos horários),
e não ao `config`.

- **Cada coleta tem o seu corte (D1).** A Revisão mostra as coletas lançadas do
  dia, cada uma com o seu corte. A próxima, que ainda não fechou, aparece em
  destaque. Depois do último corte aparece *"Lista fechada às <último corte>"*.
- **O corte que não foi lançado ou não foi confirmado não vira o padrão (D2).** A
  Revisão diz *"O horário de corte de hoje não foi lançado na 206"*. Isso vale:
  - para o dia sem coleta lançada;
  - para o dia que só tem o rascunho da semana copiada;
  - para a coleta cujo corte está "a conferir". Nesse caso a frase é *"O corte
    da coleta das HH:MM não foi confirmado"*.

  **O padrão da semana deixa de aparecer na Revisão.** Ele continua valendo para
  o despacho da agência sem horário lançado, e para a cópia da semana.
- **Dia "sem coleta" (D3).** A Revisão diz *"Hoje não tem coleta"* e o motivo
  (*"feriado: <nome>"*, ou o motivo escrito). Nesse dia não aparece corte.
- A agência e o despacho não mudam.

### Fase 2 — uma lista de feriados, no PCP (🔴: schema, dois bancos, migração)

- **Um feriado é um dia em que o ML não coleta (D6).** Não há marca por feriado.
- A lista passa para o `dados.db`: tabela `feriado`, com o dono único
  `feriado_dominio.js`. O que é comum mora no PCP (R-ORG-12).
- **O sob medida passa a ler pela porta**, como já faz com os endereços. O prazo
  do pedido dele continua pulando os mesmos dias.
- **A `sm_feriado` é copiada uma vez só**, com uma marca em `config` e com backup
  dos dois bancos antes.
- O cadastro continua na 906, no mesmo lugar.
- **A 206 conhece a lista (D4 (a)).** O feriado cadastrado faz o dia nascer *"sem
  coleta — feriado: <nome>"* **no rascunho da semana**. Quem confirma a semana pode
  tirar a marca, se o ML vier mesmo assim. Enquanto a semana não for confirmada,
  o rascunho não vale (R-HCO-13), como hoje. A Revisão diz então que o horário não
  foi lançado.
- **Feriado cadastrado depois de a semana estar confirmada:** a 206 mostra o aviso
  *"<data> é feriado (<nome>) — marque sem coleta, se o ML não vier"*. O dia
  confirmado não muda sozinho.
- **O item faltante (D5) fica de fora** (o dono: *"não sei"*). O "sair até" continua
  contando o feriado como dia útil, como hoje. Volta numa conversa própria.

## 3. Decisões do dono (11/11/2026)

| # | Pergunta | Resposta do dono |
|---|---|---|
| D1 | Com várias coletas, qual corte a Revisão mostra? | *"toda coleta tem um horário de corte"* — o corte de cada uma |
| D2 | Sem coleta lançada ou sem confirmação? | *"mostrar mensagem dizendo que não foi lançado"* — nunca o padrão |
| D3 | Dia sem coleta? | *"hoje não tem coleta e mostra o motivo; se tiver feriado é por isso"* |
| D4 | O feriado na 206? | (a) — nasce marcado no rascunho, e quem confirma pode tirar |
| D5 | Item faltante pula feriado? | *"não sei"* — fica de fora |
| D6 | Feriado e "o ML não coleta"? | *"ML não coleta"* — feriado é dia sem coleta |

## 4. Fica de fora

- O "sair até" do item faltante (D5).
- O despacho da agência, que já usa o horário lançado.
- O corte da Etiqueta de Venda, que é contagem do despacho.
- Feriado puxado sozinho de calendário da internet.

## Onde mora

| O quê | Módulo · bloco | Liga-se a |
|---|---|---|
| a frase do corte | 101 Revisão · Produção · Medida padrão | 206 (lê o corte lançado) |
| a lista de feriados | 906 Parâmetros · Administração · Comum | 206, 610/611 (prazo do sob medida) |
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
  - `cd tecido && npm test`, com o `prazo.test.js` sem mudar o esperado.
