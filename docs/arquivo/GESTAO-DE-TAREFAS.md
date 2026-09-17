> **ARQUIVADO · 17/09/2026 — decisão do dono: sai do foco do PCP por enquanto.**
> Nunca foi iniciado. Para retomar, volta para `docs/specs/` e passa pela conversa de REGRA/NOVIDADE.
>
> Situação na data do arquivamento:
> Nenhuma tabela deste desenho existe (`tarefa`, `tarefa_evento`, `tarefa_modelo`).
> Os setores de fora da produção (Compras, Financeiro, Manutenção…) também não foram
> criados. O Compras criou setores próprios de Comprador/Recebimento/Financeiro — conferir
> antes de começar a fase 0 daqui.
> Movido do Projeto "PCP - Deccorar" para o repositório em 17/09/2026.

---

# Gestão de Tarefas — Especificação

> Quadro interno da empresa toda: o gestor delega, o sistema cobra, e a entrega
> deixa registro.
> **Data:** 19/08/2026 · **Status:** desenho para revisão, nada implementado
> **Leia junto com:** `CONTROLE-DE-ACESSO.md` (setores e permissões) ·
> `ARQUITETURA-ALVO.md` (a forma em que este módulo nasce) ·
> `PCP-CONTROLE-E-VISAO.md` §5.6 (por que medir pessoa tem limite)

---

## 1. O problema

Hoje a tarefa que não é bipe **não existe em lugar nenhum**. Ela é dita no
corredor, mandada no WhatsApp, ou escrita num papel na mesa. Três consequências
que você já vive:

**Delegar não é o mesmo que combinar.** Quando a tarefa é falada, o gestor não
sabe se ela foi entendida, começada ou esquecida — e a única forma de descobrir é
perguntar. Perguntar custa a atenção de duas pessoas e só funciona se o gestor
lembrar de perguntar.

**O que não tem prazo não tem cobrança.** "Depois você vê o filtro da máquina"
não vence nunca. E o que não vence não entra em nenhuma conta: você não sabe se a
fábrica está deixando 3 ou 30 coisas para trás por semana.

**Não existe histórico.** Quando algo dá errado, não dá para saber se a tarefa
foi pedida, quando, para quem, e o que a pessoa respondeu. A discussão vira
memória contra memória.

O sistema não resolve o primeiro problema da gestão — decidir o que é
prioridade. Resolve os outros três: **o que foi pedido, para quem, até quando, e
o que aconteceu.**

---

## 2. As quatro decisões que este desenho já tomou

Foram respondidas antes de desenhar, e mudam tudo o que vem depois:

| Decisão | Escolha | Consequência |
|---|---|---|
| Onde mora | **Módulo do PCP atual** | Um login só, os mesmos setores, a mesma auditoria. Ninguém é cadastrado duas vezes |
| Tipos de tarefa | Avulsa · rotina · checklist · **automática** | O sistema também vira cliente do próprio quadro |
| Onde se usa | **Computador/tablet da estação** | Não depende de celular, não exige HTTPS na internet (dívida #2 fica onde está) |
| O que é monitorar | Prazo · prova · aprovação · indicadores | O fluxo tem quatro estados, não dois |

A escolha da estação tem um efeito que precisa estar escrito: **o aparelho é
compartilhado.** É a mesma máquina que já fica logada o dia inteiro com a sessão
de alguém. Isso é tratado na §6, e é o detalhe que decide se o dado vai ser
verdadeiro ou lixo.

---

## 3. O princípio: tarefa é um compromisso, não um recado

Um recado tem texto. Um compromisso tem **dono, prazo e prova**. As três coisas
são obrigatórias, e é a obrigatoriedade que faz o sistema valer alguma coisa:

```
DONO      uma pessoa, ou uma fila de setor que vira uma pessoa quando alguém pega
          "a equipe faz" é o mesmo que ninguém faz

PRAZO     uma data. Sempre. Não existe tarefa sem prazo
          sem data, não existe atraso — e sem atraso, não existe cobrança

PROVA     o que a pessoa deixa quando diz que terminou
          pode ser só o clique, pode ser comentário, pode ser foto — mas é declarado
          antes, na criação, e não negociado depois
```

E uma quarta, que é a que separa este desenho de um quadro de post-it:

```
CAMINHO DE VOLTA   a pessoa tem um botão para dizer "travou, e é por isso"
                   sem ele, a tarefa impossível fica parada até o prazo vencer,
                   e o gestor só descobre no dia em que já era tarde
```

---

## 4. Os estados e o quadro

Cinco estados. Quatro colunas. A coluna é derivada do estado — não existe coluna
que alguém arrasta e que significa outra coisa.

```
   ABERTA  ──assumir──▶  FAZENDO  ──concluir──▶   FEITA   ──aprovar──▶  APROVADA
      │                     │  ▲                     │
      │                     │  └───devolver──────────┘
      │                     │       (retornos + 1)
      └──────cancelar───────┴──────────▶  CANCELADA   (só quem delega, com motivo)
```

| Estado | Coluna | Quem move | O que significa |
|---|---|---|---|
| `aberta` | **A FAZER** | quem assume | Existe, tem dono ou setor, ninguém começou |
| `fazendo` | **FAZENDO** | o dono | Alguém assumiu. O relógio de execução começou |
| `feita` | **CONFERIR** | o dono | A pessoa entregou. **Ainda não está fechada** |
| `aprovada` | **FECHADAS** (24h) | quem aprova | O gestor conferiu. Sai do quadro no dia seguinte |
| `cancelada` | fora do quadro | quem delega | Não é mais para fazer. Fica no histórico com motivo |

Três regras que vêm junto:

**1. Sem aprovação exigida, `feita` já é `aprovada`.** A coluna CONFERIR só recebe
o que foi marcado para conferir. Se toda tarefa exigisse aprovação, em duas
semanas a coluna teria 60 cartões e o gestor pararia de olhar — e uma fila que
ninguém olha é pior que fila nenhuma, porque dá a impressão de controle.

**2. Devolver não é um estado, é uma volta com nome.** A tarefa devolvida volta
para FAZENDO com etiqueta vermelha, o motivo escrito, e `retornos + 1`. O
contador de retornos é indicador dos dois lados (§16).

**3. O operador não arrasta cartão.** No tablet, botão grande e um por vez.
Arrastar com a mão suja, de luva, num tablet de bancada, é como o `DESIGN.md`
trata campo escondido: parece que funciona na mesa e falha no chão. Arrastar
existe só no quadro do gestor, no computador, e faz exatamente o que o botão faz.

### A trava — a informação mais valiosa do sistema

Em qualquer momento de `fazendo`, o dono aperta **TRAVOU** e escolhe/escreve o
motivo. A tarefa não muda de estado: ela ganha uma marca, sobe para o topo do
quadro do gestor e para de contar tempo de execução.

```
🔴 TRAVADA há 2h10   ·   Trocar rolamento da máquina 3
   Edivaldo: "não tem rolamento no almoxarifado"
```

**É isto que transforma o quadro em gestão.** Sem a trava, o gestor descobre o
problema no dia do vencimento; com ela, descobre em duas horas, quando ainda dá
para comprar, remanejar ou aceitar. E o relatório de travas por motivo é, ao fim
do mês, a lista dos gargalos reais da empresa — escrita por quem esbarra neles.

---

## 5. Áreas: delegar para setor e delegar para pessoa

**A área de tarefa é o mesmo setor do controle de acesso.** Não se cria uma
segunda lista de setores.

> Duas listas de setor seriam duas fontes de verdade para a mesma pergunta — a
> doença que o `ARQUITETURA-ALVO.md` §5 mede em nove comandos escrevendo
> `skus.estoque`. Uma pessoa que muda de setor teria que ser movida em dois
> lugares, e um dia alguém esqueceria um deles.

Os setores nativos hoje cobrem só a produção (`CONTROLE-DE-ACESSO.md` §5). Para o
quadro valer para a empresa toda, faltam os que existem na vida real e não no
sistema — **Compras, Financeiro, Manutenção, Administrativo, Comercial**. Eles
nascem como setores de nível `operacao` com uma permissão só (`tarefas.executar`)
e nenhuma permissão de PCP. A pessoa de Compras entra no sistema, recebe tarefa e
não enxerga nada da fábrica.

### As duas formas de delegar

```
PARA UMA PESSOA     nasce com dono. Aparece na tela dela, na hora
                    "Edivaldo, conferir a devolução do lote 4471 até sexta"

PARA UM SETOR       nasce sem dono, na FILA do setor
                    aparece para todos daquele setor, e o primeiro que apertar
                    ASSUMIR vira o dono — sozinho, e some da tela dos outros
                    "Manutenção: revisar o filtro da máquina 3"
```

Regras da fila:

- **Assumir é atômico.** Dois tablets apertando ao mesmo tempo: um leva, o outro
  recebe *"o João acabou de assumir"*. Nunca dois donos.
- **Devolver para a fila** é permitido enquanto ninguém marcou nada — sai o dono,
  volta para `aberta`, com registro de quem largou e por quê.
- **Fila parada é problema do gestor, não do setor.** Tarefa sem dono há mais de
  N horas (sugestão: 4 horas úteis) aparece marcada no quadro. Ninguém é
  responsável, então o sistema devolve a responsabilidade para quem delegou.
- **Fila não substitui decisão.** Se toda tarefa for para a fila, o gestor está
  usando o quadro para não escolher — e o indicador de "tempo até assumir" vai
  mostrar isso em duas semanas.

---

## 6. O PIN na bancada — o problema da estação compartilhada

O tablet fica logado o dia inteiro. Hoje o cookie vale um ano e ninguém desloga
(`PCP-CONTROLE-E-VISAO.md` §5.1). Se a tarefa for atribuída "a quem está logado",
o quadro inteiro vira ficção: metade das tarefas fica com quem abriu o navegador
em maio.

**A regra:** ler a lista é livre para quem está na estação. **Mudar o estado de
uma tarefa exige o PIN.**

```
[ ASSUMIR ]  →  "Quem é você?"  →  PIN  →  assumida por Maria, 09:14
[ CONCLUIR ] →  "Quem é você?"  →  PIN  →  concluída por Maria, 10:02
```

Quatro consequências, e todas são desejadas:

- O nome no registro é o nome de quem apertou, não o da sessão da bancada.
- Custa 4 dígitos e dois segundos — é o mesmo gesto que a pessoa já faz para
  entrar. Não é hardware novo, não é crachá, não é treinamento.
- O PIN vale por uma janela curta na mesma estação (sugestão: 5 minutos), para
  quem conclui três tarefas seguidas não digitar três vezes.
- Quem abre a tela **no próprio usuário** (computador do gestor, login pessoal)
  não digita nada — a exigência é da estação compartilhada, e o sistema sabe a
  diferença porque a estação é declarada no cadastro do aparelho.

> Se um dia a fábrica adotar crachá bipado (`PCP-CONTROLE-E-VISAO.md` §5.1), o
> gesto troca e o desenho não muda: o que a tarefa exige é *identificação no ato*,
> não *PIN*.

---

## 7. Prazo e atraso

**Toda tarefa tem prazo, sempre.** Data obrigatória; hora, opcional. O padrão ao
criar é **hoje**, e o gestor muda se for outro dia.

Não existe "sem prazo". A tarefa sem prazo é a que nunca vence, nunca aparece
vermelha e nunca é cobrada — e a presença dela no quadro contamina o indicador de
todo mundo. Se é para algum dia, é para uma data: escolha uma.

```
atrasada   =  prazo já passou  E  estado ∈ (aberta, fazendo)
no prazo   =  concluida_em ≤ prazo
```

**O prazo é do executor, não do gestor.** Se a pessoa concluiu quinta e o gestor
só aprovou na terça seguinte, a tarefa foi entregue **no prazo**. A demora da
aprovação vira indicador do gestor (§16), nunca atraso do funcionário. Sem essa
regra, a pessoa é penalizada por uma coisa que ela não controla — e em um mês ela
para de confiar no quadro.

### Urgência com trava de inflação

Só dois níveis: **normal** e **urgente**. E um limite:

> **Máximo de 3 tarefas urgentes abertas por setor ao mesmo tempo.** Para criar a
> quarta, o gestor tem que baixar uma das três.

Cinco níveis de prioridade viram, em três meses, cinco níveis de "prioridade 1".
O limite não é burocracia: é o que obriga a escolha a acontecer na hora de
delegar, que é onde ela custa menos.

---

## 8. A prova de conclusão

Declarada na criação, em quatro graus:

| Grau | Quando usar | O que o botão CONCLUIR exige |
|---|---|---|
| `nenhuma` | Rotina simples, resultado visível | Só o clique (com PIN) |
| `comentario` | O gestor precisa saber *o que* foi feito | Texto, mínimo declarado |
| `foto` | O resultado é físico e some depois | Uma foto da câmera do aparelho |
| `ambas` | Conserto, ajuste, algo que gerou custo | Texto + foto |

**O botão fica desabilitado até a prova existir.** Não é aviso, é trava — validada
no servidor, não na tela. Regra do `ARQUITETURA-ALVO.md` §6: garantia que só existe
em HTML não é garantia. Três regras da fábrica hoje moram só em HTML, e é
exatamente esse o defeito que este módulo não vai repetir no primeiro dia de vida.

**Sobre foto:** exige que o aparelho da estação tenha câmera. Se os tablets não
tiverem, `foto` fica desligado no cadastro até existir aparelho que atenda — e a
tela nunca oferece uma opção que o hardware não cumpre. É um item da §21.

---

## 9. Aprovação, devolução e o desentupidor

`exige_aprovacao` é por tarefa. Sugestão de padrão:

- **Tarefa avulsa delegada pelo gestor:** exige aprovação (é o caso que motivou o
  sistema).
- **Rotina de setor:** não exige, salvo marcação explícita. Aprovar 40 limpezas
  por semana no braço faz o gestor parar de olhar a coluna inteira.

Ao conferir, três saídas:

```
[ APROVAR ]           fecha. Fim.
[ DEVOLVER ]          exige motivo escrito. Volta para FAZENDO, retornos + 1
[ APROVAR COM NOTA ]  fecha, mas deixa a observação no histórico
```

**O desentupidor:** tarefa `feita` e não conferida em **7 dias** é aprovada
automaticamente, marcada `aprovada por decurso`. Sem isso, a coluna CONFERIR
acumula para sempre e o quadro morre de entulho.

E o decurso não é varrido para baixo do tapete: **quantas fecharam sem
conferência** é um dos indicadores do gestor. Se o número for alto, ou o gestor
não está conferindo, ou aquelas tarefas nunca precisaram de aprovação. As duas
leituras são úteis; a ausência do número não é.

---

## 10. Rotinas — a tarefa que volta sozinha

A rotina não é uma tarefa que se repete: é um **modelo** que gera uma tarefa nova
a cada ocorrência. Cada instância tem seu prazo, seu dono e sua prova, e o
histórico não se sobrescreve.

```
MODELO  "Limpar filtro da máquina 3"  ·  Manutenção  ·  toda segunda  ·  foto
   │
   ├── 10/08  tarefa #418  concluída no prazo
   ├── 17/08  tarefa #502  concluída com 1 dia de atraso
   └── 24/08  tarefa #577  aberta
```

Regras de geração:

- **Gera às 00:05, para o dia.** Não gera a semana inteira adiantada — o quadro
  mostra o que é para hoje, não o calendário do mês.
- **Regras suportadas:** diária · dias úteis · dias da semana escolhidos · dia do
  mês. Nada além disso na primeira versão.
- **Se o dia cair em domingo/feriado** e a regra for "dias úteis", pula. Se for
  "dia 5 do mês" e o dia 5 for domingo, cai no próximo dia útil.

### O que acontece com a de ontem que ninguém fez

Esta é a pergunta que só aparece depois do sistema em produção, e por isso está
aqui: o modelo declara `ao_vencer`.

| `ao_vencer` | Comportamento | Padrão para |
|---|---|---|
| `vence` | A instância de ontem fecha como **não feita** e conta no indicador | Rotina **diária** |
| `acumula` | Continua aberta e atrasada, junto com a de hoje | Rotina **semanal e mensal** |

O motivo é prático: limpar o filtro de ontem não tem valor hoje — o que vale é
saber que não foi feito. Já a conferência mensal do estoque de ontem continua
valendo, e some do quadro seria pior que atrasada.

**Desativar um modelo não apaga as instâncias abertas.** Elas seguem até serem
concluídas ou canceladas uma a uma. Modelo desativado só para de gerar.

---

## 11. Checklist

Itens ordenados dentro da tarefa. Cada item guarda quem marcou e quando.

```
Preparar o carregamento do caminhão                     3 de 5
  ☑ Conferir a lista de volumes           Maria · 08:12
  ☑ Separar as etiquetas                  Maria · 08:19
  ☑ Checar o lacre                        João  · 08:40
  ☐ Conferir a nota fiscal
  ☐ Fotografar o carregamento fechado
```

- **Concluir exige todos marcados.** Item pendente e botão de conclusão são
  contradição; a saída para "não deu" é a trava (§4), com motivo.
- **Pessoas diferentes podem marcar itens diferentes** — o dono da tarefa
  continua sendo um só, e cada marca leva o nome de quem apertou.
- **Desmarcar é permitido** enquanto a tarefa não foi concluída, e fica no
  histórico.
- Modelo de rotina carrega os itens: a instância nasce com o checklist pronto.

---

## 12. As tarefas que o sistema cria sozinho

O PCP sabe de coisas que precisam de uma pessoa e hoje não têm dono. Elas viram
tarefa automática — com uma disciplina rígida, senão o quadro vira alarme de
carro.

**A regra de fronteira:** o gestor de tarefas **não repete o que já tem tela
própria.** Estoque abaixo do alvo é assunto do Programa do Dia
(`PCP-CONTROLE-E-VISAO.md` §3) e não vira tarefa. Só vira tarefa a **exceção que
não tem tela, precisa de uma pessoa e tem fim**.

| Gatilho | Vira tarefa para | Fecha quando |
|---|---|---|
| Contagem pendente de aprovação há mais de 24h | Setor com `contagem.ajustar` | A contagem é aprovada |
| Volume bloqueado por SKU desconhecido | Planejamento | O SKU é cadastrado ou o volume liberado |
| Devolução recebida sem baixa há mais de 48h | Devoluções | A baixa é registrada |
| Rota sem permissão declarada aparecendo na cobertura | Admin Geral | A cobertura zera |
| Divergência entre `SUM(delta)` e `skus.estoque` no boot | Admin Geral | Os números batem |

Quatro garantias, todas estruturais:

**1. Uma tarefa aberta por (gatilho, alvo).** Garantida por índice único parcial
no banco, não por `if` no código:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_tarefa_gatilho_viva
    ON tarefa(gatilho, gatilho_alvo)
 WHERE gatilho IS NOT NULL AND estado IN ('aberta','fazendo','feita');
```

**2. Se a condição sumir, a tarefa fecha sozinha** como `resolvida na origem`.
Alguém resolveu o problema por outro caminho — o quadro não fica cobrando uma
coisa que já não existe.

**3. Tarefa automática não tem dono, tem setor.** O sistema não sabe quem está
disponível; quem sabe é a pessoa que assume.

**4. Gatilho novo nasce declarado**, num registro único, do mesmo jeito que uma
permissão nasce em `permissoes.js`. Sem lista mantida à mão.

---

## 13. As telas

### 13.1 Na estação — o funcionário não vê kanban

Kanban é ferramenta de quem **distribui**. Quem executa precisa de uma lista curta
e um botão grande. A tela segue os quatro blocos do `ARQUITETURA-ALVO.md` §8, para
que quem sabe usar uma estação saiba usar esta.

```
┌──────────────────────────────────────────────────────────────┐
│ ████████████████████████████████████████████████████████     │
│ 📋 TAREFAS · MONTAGEM · quarta, 19/08          [ Estação ▸ ] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  🔴 ATRASADA · venceu ontem                                  │
│  Conferir a devolução do lote 4471                           │
│  Maria · comentário obrigatório                              │
│                          [ TRAVOU ]      [ CONCLUIR ]        │
│                                                              │
│  ● HOJE até 12:00                                            │
│  Limpar filtro da máquina 3                       3 de 5 ☑   │
│  Maria · foto obrigatória                                    │
│                          [ TRAVOU ]      [ ABRIR ]           │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  FILA DA MANUTENÇÃO · 2 sem dono                             │
│  Revisar mangueira do compressor          [ ASSUMIR ]        │
│  Trocar lâmpada do corredor               [ ASSUMIR ]        │
├──────────────────────────────────────────────────────────────┤
│  Suas hoje: 2 de 5 concluídas  ·  esta semana: 14 · 1 atraso │
└──────────────────────────────────────────────────────────────┘
```

Ordenação: **atrasadas → vencem hoje → urgentes → o resto por prazo.** Uma ordem
só, definida pelo sistema, não reordenável (`PCP-CONTROLE-E-VISAO.md` §2).

### 13.2 O quadro do gestor

```
┌───────────────────────────────────────────────────────────────────────────┐
│  TAREFAS   [ Empresa ▾ ] [ Manutenção ▾ ] [ Semana ▾ ]      [ + NOVA ]    │
├───────────────────────────────────────────────────────────────────────────┤
│  🔴 2 TRAVADAS   ·   3 atrasadas   ·   4 sem dono há +4h   ·   5 a conferir│
├──────────────┬──────────────┬───────────────┬─────────────────────────────┤
│  A FAZER  7  │  FAZENDO  4  │  CONFERIR  5  │  FECHADAS HOJE  6           │
├──────────────┼──────────────┼───────────────┼─────────────────────────────┤
│ ▸ Revisar    │ ▸🔴 Trocar   │ ▸ Conferir    │ ▸ Limpar filtro             │
│   mangueira  │   rolamento  │   devolução   │   Maria · no prazo          │
│   sem dono   │   TRAVADA 2h │   4471        │                             │
│   ⏱ 4h       │   "sem peça" │   Maria       │ ▸ Separar amostras          │
│              │              │   📷 1 foto   │   João · 1 dia de atraso    │
│ ▸ Cotar 3    │ ▸ Organizar  │               │                             │
│   fornec.    │   almoxarif. │ ▸ Cotar frete │ ▸ Conferir NF               │
│   Compras    │   João       │   ↩ 1 retorno │   Ana · no prazo            │
│   vence 21/08│   hoje 17:00 │   Ana         │                             │
└──────────────┴──────────────┴───────────────┴─────────────────────────────┘
```

A faixa vermelha do topo é a tela inteira em uma linha: **o que precisa de você
agora.** Travadas primeiro, porque são as únicas em que a demora do gestor é o
próprio problema.

### 13.3 A linha aberta

Ao tocar num cartão: descrição, checklist, prova enviada, e o **histórico
completo** — criada por quem e quando, assumida, travada e por quê, concluída,
devolvida com motivo, aprovada. Nada é apagado, nada é editado silenciosamente.

---

## 14. Modelo de dados

```sql
-- ─── A TAREFA ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tarefa (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo          TEXT NOT NULL,
  detalhe         TEXT,
  setor_id        INTEGER NOT NULL,          -- a área. Sempre existe
  usuario_id      INTEGER,                   -- dono. NULL = fila do setor
  usuario_nome    TEXT,                      -- sobrevive à desativação
  criado_por_id   INTEGER,
  criado_por_nome TEXT,
  estado          TEXT DEFAULT 'aberta',     -- aberta|fazendo|feita|aprovada|cancelada
  urgente         INTEGER DEFAULT 0,
  prazo           TEXT NOT NULL,             -- data. Obrigatório, sem exceção
  prazo_hora      TEXT,
  exige_prova     TEXT DEFAULT 'nenhuma',    -- nenhuma|comentario|foto|ambas
  exige_aprovacao INTEGER DEFAULT 1,
  travada         INTEGER DEFAULT 0,
  travada_motivo  TEXT,
  travada_em      TEXT,
  retornos        INTEGER DEFAULT 0,
  modelo_id       INTEGER,                   -- de qual rotina nasceu
  gatilho         TEXT,                      -- chave do gatilho automático
  gatilho_alvo    TEXT,
  assumida_em     TEXT,
  concluida_em    TEXT,
  fechada_em      TEXT,
  fechada_por     TEXT,
  fechada_como    TEXT,   -- aprovada|decurso|nao_feita|resolvida_origem|cancelada
  criado_em       TEXT DEFAULT (datetime('now','localtime')),
  data            TEXT DEFAULT (date('now','localtime')),
  teste           INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tarefa_dono   ON tarefa(usuario_id, estado);
CREATE INDEX IF NOT EXISTS idx_tarefa_setor  ON tarefa(setor_id, estado);
CREATE INDEX IF NOT EXISTS idx_tarefa_prazo  ON tarefa(prazo, estado);

-- Um gatilho, um alvo, uma tarefa viva. Garantia no banco, não no código.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tarefa_gatilho_viva
    ON tarefa(gatilho, gatilho_alvo)
 WHERE gatilho IS NOT NULL AND estado IN ('aberta','fazendo','feita');

-- ─── O CHECKLIST ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tarefa_item (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tarefa_id    INTEGER NOT NULL,
  ordem        INTEGER,
  texto        TEXT NOT NULL,
  feito        INTEGER DEFAULT 0,
  feito_por    TEXT,
  feito_em     TEXT
);

-- ─── O HISTÓRICO (somente inserção) ────────────────────────────────
CREATE TABLE IF NOT EXISTS tarefa_evento (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tarefa_id    INTEGER NOT NULL,
  tipo         TEXT,   -- criada|assumida|largada|travada|destravada|concluida
                       -- devolvida|aprovada|cancelada|comentario|prazo|dono
  usuario_id   INTEGER,
  usuario_nome TEXT,
  texto        TEXT,
  foto         TEXT,   -- caminho do arquivo
  criado_em    TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_evento_tarefa ON tarefa_evento(tarefa_id);

-- ─── A ROTINA ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tarefa_modelo (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo          TEXT NOT NULL,
  detalhe         TEXT,
  setor_id        INTEGER NOT NULL,
  usuario_id      INTEGER,                -- NULL = cai na fila do setor
  regra           TEXT,                   -- diaria|uteis|semanal|mensal
  dias_semana     TEXT,                   -- '1,3,5' quando semanal
  dia_mes         INTEGER,
  hora_limite     TEXT,
  exige_prova     TEXT DEFAULT 'nenhuma',
  exige_aprovacao INTEGER DEFAULT 0,
  ao_vencer       TEXT DEFAULT 'vence',   -- vence|acumula
  urgente         INTEGER DEFAULT 0,
  ativo           INTEGER DEFAULT 1,
  criado_por      TEXT,
  criado_em       TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS tarefa_modelo_item (
  modelo_id    INTEGER,
  ordem        INTEGER,
  texto        TEXT
);
```

Duas coisas propositais neste schema:

- **`usuario_nome` gravado junto do id**, como na auditoria e no movimento de
  estoque: o histórico sobrevive à desativação da pessoa.
- **`teste` presente desde o primeiro dia**, para o modo teste não precisar de
  exceção depois (`ARQUITETURA-ALVO.md` §7).

E uma ausência proposital: **não existe rota que apague tarefa.** Cancelar é um
estado com motivo e autor. A regra 7 do controle de acesso vale aqui pelo mesmo
motivo — histórico que se apaga não serve de histórico.

---

## 15. Permissões

Uma linha por permissão em `permissoes.js` — as caixinhas aparecem sozinhas no
cadastro, conforme a regra 5 do `CONTROLE-DE-ACESSO.md`.

```js
// ─── TAREFAS ────────────────────────────────────────────────
{ chave:'tarefas.executar',    grupo:'Tarefas', nivel:'operacao',
  rotulo:'Ver e concluir as próprias tarefas',
  desc:'Assumir da fila, concluir, travar com motivo' },

{ chave:'tarefas.delegar',     grupo:'Tarefas', nivel:'supervisor',
  rotulo:'Delegar tarefas no próprio setor',
  desc:'Criar, atribuir, mudar prazo e cancelar dentro do seu setor' },

{ chave:'tarefas.delegar_geral',grupo:'Tarefas', nivel:'admin',
  rotulo:'Delegar para qualquer setor',
  desc:'Criar tarefa para qualquer área da empresa' },

{ chave:'tarefas.aprovar',     grupo:'Tarefas', nivel:'supervisor',
  rotulo:'Aprovar e devolver tarefas',
  desc:'Conferir a entrega, aprovar ou devolver com motivo' },

{ chave:'tarefas.quadro_setor',grupo:'Tarefas', nivel:'supervisor',
  rotulo:'Ver o quadro do próprio setor',
  desc:'Todas as tarefas da sua área, com nome' },

{ chave:'tarefas.quadro_geral',grupo:'Tarefas', nivel:'admin',
  rotulo:'Ver o quadro da empresa',
  desc:'Todos os setores' },

{ chave:'tarefas.rotinas',     grupo:'Tarefas', nivel:'admin',
  rotulo:'Criar e editar rotinas',
  desc:'Tarefas que se repetem sozinhas' },

{ chave:'tarefas.indicadores', grupo:'Tarefas', nivel:'supervisor',
  rotulo:'Ver indicadores de tarefas',
  desc:'Prazo, retornos, travas e aprovações pendentes' },
```

**Fronteira que precisa estar escrita:** o indicador de tarefa é **nominal por
natureza** — a tarefa nasceu com nome, e cobrar entrega sem saber de quem é
impossível. Isso **não afrouxa** o `produtividade.nominal`
(`PCP-CONTROLE-E-VISAO.md` §5.6): peça bipada por hora continua sensível,
auditada e fora de tela de fábrica. São duas medidas diferentes:

| | Produtividade de bipe | Entrega de tarefa |
|---|---|---|
| O que mede | Ritmo de execução repetitiva | Cumprimento de um combinado |
| Nasce com nome? | Não — nasce como evento | **Sim** — foi delegada a alguém |
| Vai para tela de chão? | **Nunca** | Não. Só para quem delega |
| Serve para | Balancear linha, dimensionar turno | Cobrar o que foi combinado |

`tarefas.quadro_setor` mostra nome **do próprio setor**. O quadro da empresa exige
`tarefas.quadro_geral`.

---

## 16. Indicadores — e o espelho do gestor

**Todo indicador de funcionário tem um indicador espelho de quem delega.** Sem
isso, o sistema vira chicote em duas semanas, e um chicote produz dado falso
(§5.6 do PCP, pelo mesmo mecanismo).

| Do executor | Do gestor |
|---|---|
| **% no prazo** — concluídas até o prazo | **% conferido** — quantas ele aprovou vs. fecharam por decurso |
| **Atraso médio** das que atrasaram | **Tempo até aprovar** — quanto a entrega espera na fila dele |
| **Retornos** — quantas voltaram | **Taxa de retorno por quem delegou** — tarefa que volta muito costuma ser tarefa mal escrita |
| **Travas abertas** | **Tempo até destravar** — a trava é dele para resolver |
| — | **Tempo até assumir** na fila do setor — fila parada é delegação sem escolha |

Ranking de pessoas **não existe em tela.** O número de cada um é comparado com
**ele mesmo no mês passado**. A comparação entre pessoas, quando for necessária, é
uma consulta do Admin Geral — e o padrão do sistema é não oferecê-la pronta.

Relatório de **travas por motivo**, mensal, é o mais valioso do conjunto: é a
lista dos impedimentos reais da empresa, escrita por quem esbarrou neles.

---

## 17. Como a pessoa fica sabendo

Sem push, sem e-mail, sem WhatsApp na primeira versão — a escolha da estação
(§2) traz isso junto:

- **A tela da estação atualiza sozinha** (a cada 30s) e mostra o contador no topo.
- **Tarefa nova urgente** dispara o mesmo som do bipe (`ui.js`, `beep`) e uma
  faixa na tela, uma vez.
- **O quadro do gestor** mostra o que precisa dele na faixa vermelha do topo.

Se um dia entrar celular, entra pela mesma porta e sem mudar o desenho — mas isso
depende de HTTPS, que é a dívida #2 do `REVISAO-COMPLETA.md` e não é assunto deste
documento.

---

## 18. Ambiente

Nada novo: mesmo repositório, mesmo `/opt/expedicao`, mesmo banco SQLite, mesmo
deploy por Git. **Nunca editar direto no servidor.** O backup do `.db` passa a
incluir as quatro tabelas novas, e as fotos de prova vão para
`/opt/expedicao/dados/provas/AAAA/MM/` — **fora do diretório público**, servidas
por rota com permissão, nunca por `express.static`.

**Este módulo nasce na forma do `ARQUITETURA-ALVO.md`**, não na forma atual:

```
dominio/tarefas.js     a regra: quem pode assumir, o que a prova exige, quando trava
dados/tarefa.js        o SQL. Único dono das quatro tabelas
rotas/tarefas.js       declarações. Sem SQL, sem `if` de negócio
public/telas/tarefas/  estacao.html · quadro.html   usando base.css, ui.js
```

> É a melhor oportunidade que vocês vão ter de estrear o registro de rotas: um
> módulo novo, sem legado, sem migração, com 10 rotas em vez de 103. Se o registro
> funcionar aqui, a fase 1 da arquitetura deixa de ser teoria.

---

## 19. Ordem de implementação

| Fase | O quê | Entrega valor sozinha? | Reversível |
|---|---|---|---|
| **0** | Criar os setores que faltam (Compras, Financeiro, Manutenção, Administrativo) e cadastrar as pessoas com PIN | Sim — já organiza o cadastro | Sim |
| **1** | **MVP:** tarefa avulsa com dono, prazo, 4 estados, PIN no ato, lista da estação e quadro do gestor. Sem prova, sem aprovação, sem rotina | **Sim — é o quadro que você pediu** | Sim |
| **2** | Prova de conclusão, aprovação/devolução, e a **trava com motivo** | Sim — é onde vira gestão | Sim |
| **3** | Fila por setor: tarefa sem dono, assumir atômico, alerta de fila parada | Sim | Sim |
| **4** | Rotinas recorrentes + checklist | Sim | Sim |
| **5** | Indicadores dos dois lados | Sim | Sim |
| **6** | Gatilhos automáticos do PCP | Sim | Sim |

**A fase 1 é deliberadamente pobre.** Ela existe para responder, em uma semana, a
única pergunta que ninguém sabe responder hoje: *as pessoas vão abrir a tela?* Se
a resposta for não, prova, aprovação e indicador são enfeite em cima de uma tela
que ninguém abre — e é melhor descobrir isso com uma semana de trabalho do que
com dois meses.

**A fase 2 é a que muda o comportamento** e a única que vale medir de perto na
bancada: exigir foto e comentário é atrito real. Uma estação por vez, como a fase
6 da arquitetura.

**A fase 6 vem por último de propósito.** Enquanto as pessoas não confiarem no
quadro, tarefa criada por robô é ruído — e ruído no começo mata a adoção.

---

## 20. Cenários de teste

Antes de cada fase entrar em produção, estes são os casos que quebram:

| Cenário | Comportamento esperado |
|---|---|
| Dois tablets apertam ASSUMIR ao mesmo tempo | Um leva. O outro vê *"João acabou de assumir"*. Nunca dois donos |
| Pessoa desativada com 6 tarefas abertas | Bloqueia a desativação até as tarefas serem transferidas ou canceladas |
| Rede cai ao concluir com foto | Banner de erro, som, e a tarefa **não** aparece concluída. Nada de estado afirmado sem confirmação |
| Rotina diária não feita por 5 dias | 5 registros `nao_feita` no indicador, **1** tarefa no quadro (hoje) |
| Rotina semanal não feita por 3 semanas | 3 tarefas atrasadas no quadro, todas visíveis |
| Gatilho com a condição verdadeira por 40 dias | **1** tarefa, não 40. Índice único parcial |
| Gestor nunca aprova | 7 dias → `decurso`, e o número aparece no indicador **dele** |
| Prazo hoje 17:00, concluída 17:04 | Atrasada. Se a hora não foi declarada, o prazo é o fim do dia |
| Modelo de rotina desativado com instâncias abertas | As instâncias continuam. Só para de gerar |
| Estação com PIN digitado há 6 minutos | Pede de novo |
| Tarefa criada em modo teste | `teste = 1`, e **não** aparece no quadro de produção |
| Virada de meia-noite com tarefa em `fazendo` | Nada acontece. O prazo é do dia declarado, não do dia da sessão |

---

## 21. Regras que não podem ser quebradas

1. **Toda tarefa tem dono ou fila de setor, e sempre tem prazo.** Não existe
   tarefa sem data.
2. **A área de tarefa é o setor do controle de acesso.** Nunca uma segunda lista.
3. **Mudança de estado exige identificação no ato** na estação compartilhada.
4. **A prova é validada no servidor.** Trava que só existe em HTML não é trava.
5. **Nada é apagado.** Cancelar é estado com motivo e autor; não existe rota que
   remova tarefa ou evento.
6. **O prazo é do executor.** Demora de aprovação nunca vira atraso do
   funcionário.
7. **Todo indicador de funcionário tem espelho no gestor.**
8. **Ranking de pessoas não vai para tela.** Cada um se compara com ele mesmo.
9. **Uma tarefa viva por (gatilho, alvo)**, garantido por índice, não por código.
10. **O quadro não repete o que já tem tela própria.** Estoque, programa e fila de
    produção não viram tarefa.
11. **O operador não arrasta cartão.** Botão grande, um por vez, na bancada.
12. **O módulo nasce na forma nova** — rota declarada, domínio separado, uma
    tabela um dono. Sem exceção "só para começar".

---

## 22. O que precisa ser decidido

| # | Pergunta | Trava | Minha sugestão |
|---|---|---|---|
| 1 | Quais setores da empresa faltam cadastrar? | Fase 0 | Compras, Financeiro, Manutenção, Administrativo, Comercial |
| 2 | Quem é gestor de quê? (quem recebe `tarefas.delegar` e de qual setor) | Fase 1 | Um responsável por setor; você mantém `delegar_geral` |
| 3 | Janela do PIN na estação: 3, 5 ou 10 minutos? | Fase 1 | 5 minutos |
| 4 | Os tablets das estações têm câmera? | Fase 2 | Se não tiverem, `foto` fica desligada e a prova é comentário |
| 5 | Aprovação automática por decurso: 7 dias está bom? | Fase 2 | 7 dias, contados em dias corridos |
| 6 | Limite de urgentes por setor: 3 é o número? | Fase 1 | 3. Se incomodar, é sinal de que está funcionando |
| 7 | Fila parada: alerta com quantas horas? | Fase 3 | 4 horas úteis |
| 8 | Rotina diária: `vence` ou `acumula` por padrão? | Fase 4 | `vence` — e o não feito vira indicador |
| 9 | Calendário de feriados: cadastrado à mão ou ignorado? | Fase 4 | À mão, uma tela simples. Sem ele, "dias úteis" mente |
| 10 | Tarefa pode ter anexo que não seja foto (PDF, planilha)? | Fase 2 | Depois. Comece com foto e texto |
| 11 | O quadro entra no menu de quem? | Fase 1 | ACOMPANHAR para o gestor; a estação abre direto na lista |

---

*Desenho para revisão. Nenhuma linha de código foi escrita. Os nomes, números e
exemplos são ilustrativos — servem para discutir a regra e o layout, não são dados
reais da empresa.*
