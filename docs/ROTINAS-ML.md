# Rotinas do Mercado Livre — backlog do "gestor de tarefas"

> Anotado em **14/08/2026** para conversarmos na **semana seguinte**.
> Não é para implementar já: é a lista de rotinas de ML que hoje vivem na
> cabeça das pessoas e que talvez virem lembretes no sistema.

---

## Princípio (decidido com o dono)

Nem tudo vira "gestor de tarefas". A regra é:

- **Tarefa ligada a um dado real → vira tarja automática** (se resolve sozinha,
  ninguém marca "feito"). Ex.: subir a planilha de vendas — o sistema sabe pela
  data da última importação. **Já feito.**
- **Tarefa que depende de julgamento humano → vira item de checklist** (marcar
  feito), porque não há dado no sistema que prove que foi feita.

A meta é ter **poucos lembretes**, metade deles automáticos — não uma lista
gigante que ninguém mantém.

---

## Rotinas mapeadas até agora

| # | Rotina | Tipo provável | Cadência | Gatilho / fonte de dado | Status |
|---|---|---|---|---|---|
| 1 | Subir planilha de vendas (ledger ~30d) no Planejamento | **Auto (tarja)** | Semanal | `venda_futura.importado_em` | ✅ **Feito** |
| 2 | Subir PDF do ML às 7h | Auto? | Diária | houve upload em `lote` hoje antes de X? | A definir |
| 3 | Subir PDF depois do corte | Auto? | Diária | 2º upload do dia em `lote`? | A definir |
| 4 | Contar estoque | Checklist | A definir (mensal?) | `contagem`? | A definir |
| 5 | **Atender reclamação** | Checklist / registro | Sob demanda / diária | hoje é fora do sistema (no ML) | A definir |
| 6 | **Controlar status de reclamação** | Registro no sistema? | Diária | precisaria de um mini-cadastro | A definir |
| 6a | → de **devolução** | idem | | vínculo com `devolucao`? | A definir |
| 6b | → de **baixa de revisão com o próprio ML** | idem | | — | A definir |
| 7 | **Pesquisa de preço de concorrentes** (subiu/desceu) | Checklist | Semanal? | manual | A definir |

> O dono reforçou: **"temos muitas tarefas de ML"** — a lista acima é um começo,
> não o total. Levantar o resto na reunião.

---

## Perguntas para a reunião (semana que vem)

1. **Quais têm cadência fixa** (diária/semanal/mensal) **vs. sob demanda**
   (nascem de um evento, como uma reclamação que entrou)?
2. **Quem é o responsável** por cada uma (área/pessoa)? — o auth já é por área.
3. **Reclamações (itens 5 e 6):** vale um **registro leve no sistema**
   (status: aberta → em andamento → resolvida, com prazo do ML), ou basta um
   lembrete? Um registro permitiria virar tarja automática ("há reclamação
   aberta sem resposta há N dias").
4. **Quais já têm um dado no sistema** que prova se foram feitas? Essas viram
   tarja automática (como a planilha). O resto vira checklist.
5. **Baixa de revisão com o ML (6b):** entender o fluxo — é a solicitação para o
   ML reavaliar/retirar uma revisão negativa? Como acompanhar o status?

---

## Ideia de forma (a decidir na reunião)

- **Tarjas automáticas** reaproveitando o padrão da planilha (`/api/.../status`
  + faixa colorida no topo da tela).
- **Checklist semanal** simples para as manuais — uma aba no admin, itens com
  "feito por / quando", zera na virada da semana.
- **Registro de reclamações** (se fizer sentido): tabela `reclamacao` com
  status + prazo, alimentando uma tarja de "pendências".

_Nada acima está implementado além do item 1. Rever e priorizar juntos._
