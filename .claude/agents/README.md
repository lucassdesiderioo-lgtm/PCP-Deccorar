# Os agentes do PCP Deccorar

Agentes do Claude Code que moram no repositório. Eles valem em toda sessão,
no Mac ou na nuvem, porque o Claude Code lê esta pasta (`.claude/agents/`)
quando a sessão começa. Uma sessão já aberta não os vê: abra outra depois do
`git pull`.

**Nenhum deles sabe as regras da fábrica de cor.** Todos leem o `CLAUDE.md`,
os cartões em `docs/regras/`, a história em `docs/historia/` e as specs na hora
em que trabalham. Mudou a regra no papel, mudou o agente junto, sem editar
nada aqui. Copiar regra para dentro de um agente seria a armadilha #12 (duas
réguas para a mesma pergunta).

**Nenhum deles edita o repositório, faz commit ou faz deploy.** Eles leem,
rodam testes em pasta temporária e devolvem um relatório. Quem conserta é quem
está fazendo o trabalho; quem sobe para o servidor é o dono (§13).

| Agente | Quando | O que devolve |
|---|---|---|
| `revisor-fabrica` | depois de construir e testar, antes do FECHAMENTO | os furos que os testes não pegaram: regra, armadilha, acesso, schema, dado |
| `verificador` | para cada achado de revisão, antes de consertar ou levar ao dono | CONFIRMADO · NÃO CONFIRMADO · PLAUSÍVEL, com a prova |
| `testador-tela` | depois de mexer em tela, rota de tela, `nav.js`, `auth.js` ou permissão | tela a tela: sem login, com e sem permissão, rolagem, console, `data-perm`, texto |
| `escrivao-papel` | antes do commit final | o que falta ou diverge no CLAUDE.md, DECISOES, spec, índice, cartões e número de casos dos testes |
| `guardiao-provas` | quando o dono quiser saber o que falta provar com dado real | a lista de provas pendentes, por área, com o que observar na fábrica |

## Como chamar

Na conversa com o Claude Code, peça pelo nome:

- *"use o revisor-fabrica no que mudou desde o main"*
- *"passe cada achado pelo verificador"*
- *"use o testador-tela nas telas 501 e 503"*
- *"use o escrivao-papel antes do commit"*
- *"use o guardiao-provas e me mostre o que falta provar"*

## A ordem numa tarefa

É a etapa **③ REVISÃO** do protocolo (`CLAUDE.md` §0, desde 07/11/2026): o
tamanho segue o risco, o achado confirmado se conserta sem pedir aprovação, e
o ciclo tem no máximo 3 rodadas. Lá está a regra; aqui, só o resumo.

```
construir → testes passando → revisor-fabrica (+ testador-tela, se mexeu em tela)
          → verificador em cada achado → consertar o confirmado, com teste
          → escrivao-papel → commit → FECHAMENTO
```

**O revisor não recebe a explicação de quem construiu**, só o que mudou. Quem
lê a explicação tende a concordar com ela.
