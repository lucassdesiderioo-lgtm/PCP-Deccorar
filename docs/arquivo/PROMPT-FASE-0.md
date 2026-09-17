> **ARQUIVADO · 17/09/2026** — prompt executado: a Fase 0 de Compras foi feita em
> 23/08/2026. Atenção: a construção decidiu diferente em dois pontos — **o SKU não tem
> mais formato** e **tecido é separado de modelo** (`CLAUDE.md` §7). Movido do Projeto
> "PCP - Deccorar".

---

# Prompt para o Claude Code — Compras · Fase 0

---

## Contexto

Você vai trabalhar no sistema de PCP/Expedição da Deccorar (Node + Express + SQLite,
HTML sem framework, sem build, sem TypeScript). Leia o `CLAUDE.md` e o `DESIGN.md`
do repositório antes de escrever qualquer coisa — eles são a fonte de verdade das
regras de negócio e da linguagem visual, e nada nesta tarefa os contradiz.

Leia também o **`COMPRAS.md`**, que está na raiz do repositório. É a especificação
completa do módulo de Compras, decidida ponto a ponto. Esta tarefa implementa
apenas a **Fase 0** dela (§12 do documento), mas ler o §3 inteiro é importante para
você entender **para que** as colunas desta fase existem — elas são a base sobre a
qual a ficha técnica por fórmula vai ser calculada mais adiante.

A Fase 0 **não entrega nenhuma tela de compras**. Ela prepara o terreno:
transforma medida e cor do produto em colunas de banco, em vez de informação
interpretada do código do SKU a cada uso.

### Por que esta fase existe

Hoje o sistema lê `BK180150BRANCO` e deduz, em tempo de execução, que a largura é
180, a altura é 150 e a cor é BRANCO. Isso acontece em vários pontos do código, com
mais de uma estratégia de normalização — é uma dívida já mapeada na auditoria.

O módulo de Compras vai calcular a ficha técnica por **fórmula sobre a medida**
(`tubo = (largura + 2) / 100`). Uma fórmula não pode depender de uma string ser
interpretada corretamente em todo lugar. Ela precisa ler uma coluna.

Então a Fase 0 faz o código do SKU virar **atalho de digitação, não fonte da
verdade**.

---

## O que implementar

### 1. Tabela de cores — lista fechada

```sql
CREATE TABLE IF NOT EXISTS cor (
  codigo TEXT PRIMARY KEY,     -- 'BEGE'
  nome   TEXT,                 -- 'Bege'
  ativa  INTEGER DEFAULT 1
);
```

Cor deixa de ser texto livre. SKU e (mais adiante) componente vão escolher da mesma
lista.

### 2. Tabela de modelo de produto

```sql
CREATE TABLE IF NOT EXISTS modelo (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo    TEXT UNIQUE,          -- 'BK'
  nome      TEXT,                 -- 'Persiana Rolô Blackout'
  ativo     INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
```

Nesta fase o modelo é só cadastro. As fórmulas vêm na Fase 2.

### 3. Colunas novas no SKU

```sql
ALTER TABLE skus ADD COLUMN modelo_id  INTEGER REFERENCES modelo(id);
ALTER TABLE skus ADD COLUMN largura_cm INTEGER;   -- 180
ALTER TABLE skus ADD COLUMN altura_cm  INTEGER;   -- 150
ALTER TABLE skus ADD COLUMN cor        TEXT REFERENCES cor(codigo);
```

Medidas em **centímetros inteiros**. Nada de decimal — arredondamento em banco é
onde divergência de estoque nasce.

### 4. Migração em um passe

Um script de migração, rodado uma vez, que:

1. Lê todos os SKUs existentes.
2. **Usa a função de decomposição que já existe no código** para extrair largura,
   altura e cor. Não escreva um parser novo — já existem estratégias demais no
   repositório e o objetivo desta fase é reduzir isso, não aumentar.
3. Monta a lista de cores distintas encontradas e popula a tabela `cor`.
4. Monta a lista de prefixos distintos encontrados e popula a tabela `modelo` com o
   código, deixando o nome em branco para preenchimento manual.
5. Preenche `largura_cm`, `altura_cm`, `cor` e `modelo_id` de cada SKU.
6. **O que não casar com o padrão fica com os campos nulos** e aparece na lista de
   pendências. Nunca zero, nunca chute.

A migração **não apaga nem altera nada** que já existe. Só preenche colunas novas.
Ela precisa ser idempotente: rodar duas vezes não pode duplicar cor nem modelo.

### 5. Tela de cadastro de SKU

Acrescentar os quatro campos ao cadastro que já existe:

- Ao digitar o código, o formulário **preenche largura, altura e cor sozinho** e
  deixa os campos editáveis. Quem cadastra pode corrigir.
- Modelo é um `select` da tabela `modelo`.
- Cor é um `select` da tabela `cor`.
- Salvar grava o que está nos campos — **não o que o código diz**.
- Um SKU que não siga a nomenclatura pode ser salvo normalmente, com as medidas
  digitadas à mão. Isso é um ganho, não uma exceção.

### 6. Tela de pendências

Uma tela simples listando os SKUs incompletos, em três grupos:

| Grupo | Critério |
|---|---|
| **Medida pendente** | `largura_cm` ou `altura_cm` nulo |
| **Modelo pendente** | `modelo_id` nulo |
| **Cor pendente** | `cor` nula ou fora da tabela `cor` |

Cada linha leva ao cadastro do SKU. O contador dessas pendências é o que vai dizer
quando a Fase 2 pode começar.

### 7. Permissões

Uma linha nova no registro de permissões (`permissoes.js`), seguindo o padrão do
`CONTROLE-DE-ACESSO.md`:

```js
{ chave:'modelo.cadastrar', grupo:'Planejamento', nivel:'admin',
  rotulo:'Cadastrar modelo de produto', desc:'Linhas de produto e suas fórmulas' },
```

O cadastro de cor fica sob o `sku.cadastrar` que já existe. Rotas novas **declaram
permissão explicitamente** — nenhuma rota nasce aberta.

---

## O que NÃO fazer nesta fase

- **Não implementar nada de compras.** Sem fornecedor, sem oferta, sem preço, sem
  pedido, sem comparação. Isso é da Fase 1 em diante.
- **Não implementar fórmula nem ficha técnica.** É a Fase 2.
- **Não tocar em estoque**, em nenhuma tabela, por nenhum motivo.
- **Não remover** a função de decomposição existente nem os pontos que a usam. Ela
  passa a ser conveniência de cadastro; a limpeza dos usos vem depois, com teste.
- **Não refatorar** o que não faz parte desta lista, por mais tentador que esteja.

---

## Regras que não podem ser quebradas

1. **Depois desta fase, medida e cor se leem da coluna** — nunca se interpretam da
   string em tempo de execução.
2. **Campo vazio nunca vira zero.** Zero é um valor válido e mentiroso. Onde não há
   dado, é nulo, e o SKU aparece em pendências.
3. **Medidas em centímetros inteiros.**
4. **A migração só preenche.** Não apaga, não sobrescreve, não normaliza dado
   existente fora das colunas novas.
5. **A migração é idempotente.**
6. **Um parser só.** Se você precisar interpretar o código do SKU, use o que já
   existe.
7. **Rota nova nasce com permissão declarada.**

---

## Como quero receber

1. **Primeiro leia o código e me apresente um plano** — quais arquivos você vai
   tocar, onde vai colocar o script de migração, e qual função de decomposição
   encontrou para reutilizar. Não escreva código antes de eu aprovar o plano.
2. Depois implemente em **commits pequenos e reversíveis**, nesta ordem:
   schema → migração → cadastro → pendências.
3. Ao final, rode a migração num banco de cópia e me diga:
   - quantos SKUs foram preenchidos com sucesso
   - quantos ficaram pendentes, e por qual motivo
   - quantas cores distintas e quantos modelos distintos apareceram
   - a lista das cores encontradas, para eu revisar duplicatas de grafia antes de
     considerar a fase concluída

Esse último item importa: é o único momento barato para descobrir que `BEGE`,
`Bege` e `BEGE CLARO` eram a mesma cor escrita de três jeitos.

---

## Se algo no `COMPRAS.md` parecer contradizer este prompt

Me pergunte antes de decidir. O documento foi escrito em oito rodadas de decisão e
tem detalhe que este prompt resume — mas o escopo desta tarefa é o que está aqui, e
o `COMPRAS.md` inteiro não é para ser implementado agora.

---

## Critério de conclusão

A fase está pronta quando:

- todo SKU tem largura, altura, cor e modelo preenchidos **ou** aparece na tela de
  pendências com o motivo;
- é possível cadastrar um SKU fora da nomenclatura, digitando as medidas;
- a lista de cores foi revisada e as duplicatas de grafia, unificadas;
- nada que o operador vê mudou de comportamento.
