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
| 17/09/2026 | A etiqueta do kit passa a ser gerada no sistema (texto, Code 128 e QR em ZPL); o programa da Zebra e o QR do Chrome deixam de ser usados | A etiqueta era montada em três lugares — retrabalho, e risco de o código impresso sair diferente do Código do kit que a Embalagem confere | Lucas | `docs/arquivo/GERADOR-ETIQUETA-KIT.md` §1–§3 |
| 17/09/2026 | O código de barras da etiqueta vem sempre do Código do kit salvo, sem digitação separada | Campo digitado à parte é o que deixa o impresso diferente do que a Embalagem bipa | Lucas | `docs/arquivo/GERADOR-ETIQUETA-KIT.md` §4 R2 |
| 17/09/2026 | O QR aponta direto para a pasta do Google Drive do manual; trocar o manual não exige reimprimir etiqueta | Trocar o arquivo dentro da pasta não muda o link — reimprimir o rolo inteiro seria desperdício | Lucas | `docs/arquivo/GERADOR-ETIQUETA-KIT.md` §4 R5, §5 |
| 17/09/2026 | Trocar o Código do kit exige confirmação, com aviso de que as etiquetas já impressas deixam de funcionar | O rolo impresso com o código antigo para de bater no bipe da Embalagem, e ninguém percebe até a bancada travar | Lucas | `docs/arquivo/GERADOR-ETIQUETA-KIT.md` §4 R8 |
| 17/09/2026 | Admin edita a etiqueta do kit; Supervisor ou nível acima imprime | Quem define o que vai impresso não é quem tira cópia do rolo — e imprimir lote não pode depender do Admin estar na fábrica | Lucas | `docs/arquivo/GERADOR-ETIQUETA-KIT.md` §4 R4 e R7 |
| 17/09/2026 | O upload de etiqueta pronta (PDF/PNG/JPG/SVG) é removido; o gerador passa a ser a única forma de fazer a etiqueta | Dois caminhos para a mesma etiqueta é o que permite imprimir arte com código diferente do Código do kit salvo | Lucas | `CLAUDE.md` §4 · `teste_kit.js` seção 12 (cumprida em 17/09/2026) |
| 17/09/2026 | A etiqueta do kit é impressa por **PDF no tamanho exato**, não por ZPL enviado à impressora | A Zebra ZD220 está ligada por USB no computador, não na rede: o servidor não fala com ela. A página já nasce com 100 × 35 mm, então não há margem nem escala para o operador errar | Lucas | `docs/arquivo/GERADOR-ETIQUETA-KIT.md` STATUS · `kit_pdf.js` |
| 17/09/2026 | A permissão de imprimir a etiqueta do kit (`kit.imprimir`) nasce **sem dono**: o Admin Geral imprime, e os demais só quando o dono assinalar o nome na tela de Acessos | *"Quando assinalar o nome da pessoa ela passa a poder imprimir"* — ninguém fazia isso antes, porque a impressão não existia, então não há a quem estender a chave automaticamente | Lucas | `permissoes.js` · `CLAUDE.md` §4 |
| 18/09/2026 | O QR da etiqueta do kit passa a ocupar quase toda a altura útil (caixa de 26 mm, 25,6 mm impressos), e o texto das linhas 1 e 2 cai de 16 para **15 caracteres** | O QR impresso tinha 15,4 mm e não os 20 da caixa — o módulo arredonda para ponto cheio da ZD220 e o resto era jogado fora, deixando o módulo em 0,375 mm, no limite do que a impressora resolve. O espaço saiu do bloco de texto (58 → 53 mm) e de 5,5 mm de deslocamento da seta; as barras ficaram intocadas. Sem campo de ajuste na tela, por decisão do dono | Lucas | `CLAUDE.md` §4 armadilha #31 · `public/kit_etiqueta.js` · `teste_kit.js` §8-B |
