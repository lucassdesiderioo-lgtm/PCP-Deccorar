> **ARQUIVADO · 17/09/2026 — decisão do dono: a fila de prioridade do Projeto, o `CLAUDE.md` §14
> e o `docs/DECISOES.md` já cumprem o papel deste quadro.**
>
> Situação na data do arquivamento:
> O texto abaixo diz "implementado e testado, aguardando instalação" (03/09/2026).
> **O pacote nunca entrou no repositório:** não existe `nucleo/registro.js`,
> `dados/melhoria.js`, `dominio/melhorias.js`, `rotas/melhorias.js` nem
> `public/telas/melhorias.html` na raiz do PCP. O pacote ficou anexado a uma conversa
> no Claude. Para seguir: localizar o pacote e instalar, ou refazer a partir desta spec.
> Movido do Projeto "PCP - Deccorar" para o repositório em 17/09/2026.

---

# Melhorias do Sistema — módulo

> O quadro onde as melhorias do PCP são lançadas, priorizadas e riscadas.
> **Data:** 03/09/2026 · **Status:** **implementado e testado**, aguardando
> instalação no repositório
> **Leia junto com:** `ARQUITETURA-ALVO.md` (a forma em que este módulo nasce) ·
> `CONTROLE-DE-ACESSO.md` (permissões) · `GESTAO-DE-TAREFAS.md` (a fronteira)

---

## 1. O problema

O `REVISAO-COMPLETA.md` produziu uma lista de achados. O `ARQUITETURA-ALVO.md`
produziu oito fases. O `PCP-CONTROLE-E-VISAO.md` produziu dívidas numeradas. O
Edivaldo produz, toda semana, mais três coisas que incomodam na bancada.

Nada disso tem endereço. A melhoria vive num documento que ninguém reabre, numa
conversa de WhatsApp, ou na sua cabeça. **Duas consequências:**

- Você não sabe quantas coisas estão pendentes, nem há quanto tempo.
- Quem pediu nunca fica sabendo o que aconteceu com o pedido — e por isso
  para de pedir.

Este módulo não decide o que é prioridade. Ele responde: **o que foi pedido,
em que pé está, e quando foi ao ar.**

---

## 2. As decisões que este módulo já tomou

| Decisão | Escolha | Consequência |
|---|---|---|
| Onde mora | **Módulo próprio no PCP** | Um login só, a mesma auditoria. Não depende do Gestão de Tarefas, que ainda é desenho |
| Escopo | **Só melhorias do sistema** | Bug, ajuste, função nova e dívida técnica. Melhoria de máquina e de processo não entram |
| Quem lança | **Só o admin** | Uma esteira com um dono. Abrir para supervisor depois é trocar uma palavra |
| Registro de entrega | **Data + commit** | Quando alguém estranhar um comportamento novo na bancada, dá para saber o que mudou e quando |
| Forma | **Nasce na arquitetura nova** | Rota declarada, domínio separado, uma tabela um dono. Sem exceção "só para começar" |

---

## 3. Os estados e o quadro

Quatro colunas. A coluna é derivada do estado — não existe coluna que alguém
arrasta e que significa outra coisa.

```
   IDEIA ──puxar──▶ NA FILA ──começar──▶ FAZENDO ──subir──▶ NO AR
     │                 │                    │                 │
     │                 └────voltar──────────┘                 │
     │                                                        │
     └──────arquivar (com motivo)───────▶ fora do quadro ◀─reabrir
```

| Estado | Coluna | O que significa |
|---|---|---|
| `ideia` | **IDEIA** | Lançou. Ainda não é compromisso |
| `fila` | **NA FILA** | Decidido que vai ser feito |
| `fazendo` | **FAZENDO** | Em desenvolvimento agora |
| `no_ar` | **NO AR** | Subiu para produção. Grava data e commit |
| `arquivada` | fora do quadro | Não vai ser feito. Fica no histórico **com motivo** |

Cinco regras vieram junto, e são elas que separam isto de um bloco de notas:

**1. Não dá para pular etapa.** De IDEIA direto para FAZENDO é recusado no
servidor. A fila existe para a decisão acontecer, e decisão pulada é decisão que
não foi tomada.

**2. No máximo 3 em FAZENDO.** Mesmo mecanismo do limite de 3 urgentes por setor
do `GESTAO-DE-TAREFAS.md` §7. Sem teto, FAZENDO vira uma segunda fila e o quadro
para de dizer qualquer coisa. Se o limite incomodar, ele está funcionando.

**3. Arquivar exige motivo escrito.** Melhoria que some sem explicação volta a
ser pedida daqui a dois meses, e aí ninguém lembra por que foi descartada.

**4. NO AR grava a data sozinho e pede o commit.** O commit é opcional — mas o
cartão fica marcado `sem commit` quando não vem, porque essa é a informação que
liga uma linha do quadro a uma mudança que apareceu na bancada.

**5. Nada é apagado.** Não existe rota que remova uma melhoria. Cancelar é um
estado com motivo e autor; toda passagem — criada, movida, editada, comentada,
arquivada, reaberta — vira uma linha no histórico.

### A ordem

A coluna NA FILA tem um botão **↕ sugerir**, que reordena por impacto contra
esforço (`peso = impacto − esforço`). É um clique explícito, nunca automático:
a ordem continua sendo sua decisão, o sistema só mostra qual seria a dele.

Arrastar existe no computador. Todo movimento também tem botão, porque
arrastar não pode ser o único caminho para nada.

---

## 4. A fronteira com o Gestão de Tarefas

Os dois quadros existem, e não se sobrepõem:

| | Melhorias | Gestão de Tarefas |
|---|---|---|
| O que entra | Mudança no **sistema** | Compromisso de uma **pessoa** |
| Tem dono? | Não — a esteira é uma só | Sim, sempre |
| Tem prazo? | **Não** | **Sim, obrigatório** |
| Quem move | Só você | Quem executa |
| Fecha quando | Subiu para produção | Foi entregue e aprovada |

Melhoria não tem prazo de propósito. Prazo que ninguém cobra é prazo falso, e o
`GESTAO-DE-TAREFAS.md` §7 explica por que uma data mentirosa contamina o
indicador de todo mundo. O que substitui o prazo aqui é o **dias parada**: o
cartão mostra há quanto tempo não se move.

---

## 5. O que foi implementado

Sete arquivos novos. Nenhum arquivo existente é substituído — três edições
pequenas em `permissoes.js` e `server.js`, descritas no `INSTALAR.md` que
acompanha o pacote.

```
nucleo/registro.js          declaração → permissão + auditoria + erro + envelope
nucleo/erros.js             um caminho de erro
nucleo/db.js                a ponte para a conexão que já existe (1 linha)
dados/melhoria.js           o SQL. Única dona de `melhoria` e `melhoria_evento`
dominio/melhorias.js        a regra. Não conhece Express
rotas/melhorias.js          13 declarações. Sem SQL, sem `if` de negócio
public/telas/melhorias.html o quadro
```

### As três permissões

```js
{ chave:'melhorias.ver',    grupo:'Melhorias', nivel:'admin', … }
{ chave:'melhorias.lancar', grupo:'Melhorias', nivel:'admin', … }
{ chave:'melhorias.mover',  grupo:'Melhorias', nivel:'admin', … }
```

Separadas de propósito. No dia em que os supervisores forem lançar ideia, é uma
palavra que muda (`lancar` vira `supervisor`); mover de coluna continua seu, e é
isso que mantém a esteira com um dono só.

---

## 6. Este módulo estreia a fase 1 da arquitetura

O `ARQUITETURA-ALVO.md` §12 diz que o registro de rotas subiu para a fase 1
porque "enquanto a permissão morar numa lista mantida à mão, cada rota nova é
uma chance de repetir o mesmo furo". O `GESTAO-DE-TAREFAS.md` §18 diz que um
módulo novo é a melhor oportunidade de estrear o registro.

**É isso que o `nucleo/registro.js` faz aqui, com 13 rotas em vez de 103.** Ele
não desliga nada: as 103 rotas antigas continuam exatamente como estão. O que
ele prova é que a forma funciona — e as garantias já valem para tudo que passar
por ele:

| Garantia | Como sai da declaração |
|---|---|
| **Fechado por padrão** | Rota sem `permissao` é negada com 500, não liberada com `@logado` |
| **Cobertura derivada** | `registro.semPermissao()` é um filtro da lista, não uma cópia dela |
| **Aviso no boot** | Conta essa mesma lista. Não pode dar vazio por construção |
| **Auditoria** | Um lugar chama `auditar()` |
| **Erro tratado** | Um `try` cobre as 13 rotas. Nenhum stack trace chega na tela |
| **Envelope único** | `{ok:true,dados}` / `{ok:false,motivo,mensagem}` |

---

## 7. O que foi testado

43 casos, rodando contra SQLite de verdade e num Chromium de verdade. Todos
passam.

**Regra (30 casos):** transição inválida recusada · o 4º cartão em FAZENDO
recusado · arquivar sem motivo recusado · commit fora do formato recusado ·
reabrir do NO AR limpa data e commit · editar sem mudar nada não gera evento ·
não existe função de apagar · sugerir ordem põe alto impacto e pequeno esforço
na frente.

**HTTP (13 casos):** rota sem permissão declarada devolve 500 e **não vaza o
dado** · a cobertura enxerga o furo · sem sessão 401 · sem permissão 403 · quem
só pode ver não lança · quem pode lançar não move · o erro nunca vaza caminho de
arquivo · a tela redireciona quem não tem permissão.

**Tela:** o quadro desenha, o cartão abre com histórico, o formulário lança, a
recusa aparece em banner vermelho **e o cartão não se move** — o estado na tela
nunca é afirmado sem o servidor ter confirmado.

---

## 8. O que este módulo não faz

- **Não tem prazo nem cobrança.** Isso é o Gestão de Tarefas (§4).
- **Não recebe sugestão do chão.** Hoje só o admin lança. O botão "sugerir
  melhoria" na estação é uma decisão para depois, e exige uma coluna de triagem
  para a ideia não entrar direto na esteira.
- **Não conta tempo de ciclo.** O cartão mostra `dias parada`; a média de quanto
  uma melhoria leva de IDEIA até NO AR é uma consulta que dá para escrever
  quando houver três meses de dado — antes disso, o número mente.
- **Não integra com o Git.** O commit é digitado. Ler o repositório para
  confirmar que o hash existe é possível, e é trabalho de outro dia.
- **Não conserta a dívida #2.** Continua sem HTTPS, como todo o resto.

---

## 9. O que precisa ser decidido

| # | Pergunta | Minha sugestão |
|---|---|---|
| 1 | O limite de 3 em FAZENDO está certo? | 3. É uma constante em `dominio/melhorias.js` |
| 2 | O quadro entra em qual menu? | ACOMPANHAR, junto do painel e dos relatórios |
| 3 | Semear o quadro com os achados da revisão e as fases da arquitetura? | Sim — nascer vazio é a forma mais rápida de nunca ser usado |
| 4 | Supervisor vai poder lançar ideia? | Depois. Comece com um dono só e veja se a esteira anda |

---

*Implementado em 03/09/2026. O pacote com os sete arquivos, as instruções de
instalação e os três conjuntos de teste está anexado à conversa.*
