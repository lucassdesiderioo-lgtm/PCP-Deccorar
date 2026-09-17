# Registro de decisões

> Toda **regra de negócio** que muda entra aqui, uma linha, no mesmo commit do código.
> É o lugar para o dono responder, meses depois, *"quando isso mudou e por quê?"*.
> Não é lugar de conserto nem de ajuste visual — só de regra.
> Decisões anteriores a 17/09/2026 estão espalhadas no `CLAUDE.md` (com data) e no
> histórico do git; este registro começa aqui.

| Data | O que mudou | Por quê | Decidido por | Onde está |
|---|---|---|---|---|
| 17/09/2026 | As especificações passam a morar em `docs/specs/`, com STATUS; o Projeto do Claude fica só para conversa | Specs fora do repositório ficaram um mês desatualizadas e o código foi construído sem elas | Lucas | `docs/specs/README.md`, `CLAUDE.md` §13 |
| 17/09/2026 | Toda tarefa segue o protocolo começo-meio-fim, com relatório de fechamento | O dono se perdia quando regra e código mudavam sem ele ver | Lucas | `CLAUDE.md` §0 |
| 17/09/2026 | A etiqueta do kit passa a ser gerada no sistema (texto, Code 128 e QR em ZPL); o programa da Zebra e o QR do Chrome deixam de ser usados | A etiqueta era montada em três lugares — retrabalho, e risco de o código impresso sair diferente do Código do kit que a Embalagem confere | Lucas | `docs/specs/GERADOR-ETIQUETA-KIT.md` §1–§3 |
| 17/09/2026 | O código de barras da etiqueta vem sempre do Código do kit salvo, sem digitação separada | Campo digitado à parte é o que deixa o impresso diferente do que a Embalagem bipa | Lucas | `docs/specs/GERADOR-ETIQUETA-KIT.md` §4 R2 |
| 17/09/2026 | O QR aponta direto para a pasta do Google Drive do manual; trocar o manual não exige reimprimir etiqueta | Trocar o arquivo dentro da pasta não muda o link — reimprimir o rolo inteiro seria desperdício | Lucas | `docs/specs/GERADOR-ETIQUETA-KIT.md` §4 R5, §5 |
| 17/09/2026 | Trocar o Código do kit exige confirmação, com aviso de que as etiquetas já impressas deixam de funcionar | O rolo impresso com o código antigo para de bater no bipe da Embalagem, e ninguém percebe até a bancada travar | Lucas | `docs/specs/GERADOR-ETIQUETA-KIT.md` §4 R8 |
| 17/09/2026 | Admin edita a etiqueta do kit; Supervisor ou nível acima imprime | Quem define o que vai impresso não é quem tira cópia do rolo — e imprimir lote não pode depender do Admin estar na fábrica | Lucas | `docs/specs/GERADOR-ETIQUETA-KIT.md` §4 R4 e R7 |
| 17/09/2026 | O upload de etiqueta pronta (PDF/PNG/JPG/SVG) é removido; o gerador passa a ser a única forma de fazer a etiqueta | Dois caminhos para a mesma etiqueta é o que permite imprimir arte com código diferente do Código do kit salvo | Lucas | `docs/specs/GERADOR-ETIQUETA-KIT.md` §4 R11, fase 4 |
