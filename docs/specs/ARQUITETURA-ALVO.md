> **STATUS · 17/09/2026 — PARCIAL**
> Aplicada no módulo sob medida (`tecido/`: `nucleo/registro.js`, schema numerado,
> `base.css`, envelope único, testes). **No PCP principal não foi aplicada** — o
> Compras foi construído no padrão antigo porque este documento não estava no
> repositório. Trazer para o PCP é a dívida 12 do `CLAUDE.md` §14.
> Os números e `arquivo:linha` abaixo são de 17/08/2026 e não batem mais com o código.
> Movido do Projeto "PCP - Deccorar" para o repositório em 17/09/2026.

---

# Arquitetura-Alvo — PCP Deccorar

> Como o sistema deveria estar montado, e como chegar lá sem parar a fábrica.
> **Versão 2 · 17/08/2026** — refeita contra o HEAD real do GitHub (`7b00ecd`),
> depois da auditoria completa. A v1 foi escrita contra código 39 commits atrás.
> **Leia junto com:** `REVISAO-COMPLETA.md` (os achados) · `CONTROLE-DE-ACESSO.md` ·
> `DESIGN.md` · `CLAUDE.md`
> **Status:** desenho para revisão, nada implementado

---

## 1. O que a auditoria mudou neste documento

A v1 dizia que o sistema tinha crescido por adição e que a regra de negócio não
tinha endereço. Isso continua verdade. O que mudou foi a **prova** e a **ordem**.

**A prova.** Entre 14 e 17 de agosto entraram 39 commits e 3.057 linhas — Controle
de Acesso completo, Planejamento por estoque alvo, seis itens do DESIGN. Trabalho
bom, entregue rápido. E no mesmo intervalo:

| Métrica | 14/08 | 17/08 |
|---|---|---|
| Comandos SQL escrevendo `skus.estoque` | 7 | **9** |
| Cópias de `date('now','localtime')` | 40 | **48** |
| Rotas registradas com `app.get/post` direto | 80 | **103** |
| Arquivos que criam `CREATE TABLE config` | 4 | **5** |
| Implementações do bipe | 6 | 5 (uma tela virou 3 dialetos) |

Três dias de trabalho excelente pioraram todas as métricas. **Não porque o
trabalho foi ruim — porque a forma do sistema cobra por linha adicionada.**

**A ordem.** A v1 punha o registro de rotas na fase 4. A auditoria encontrou
**três caminhos de escalonamento a Admin Geral** e uma tela de cobertura que
reporta "OK" com os furos abertos — todos pela mesma causa: a permissão é decidida
por uma lista de strings mantida à mão (`permDaRota`, `acesso.js:390-449`), longe
de onde as rotas nascem. **O registro sobe para a fase 1.**

---

## 2. O diagnóstico em uma frase

**A regra de negócio mora dentro do handler HTTP, e as garantias moram em listas
que alguém precisa lembrar de atualizar.**

```js
app.post('/api/embalar', (req,res)=>{
  // aqui dentro, ao mesmo tempo: leitura do HTTP, validação, regra do kit,
  // SQL da fila, SQL do estoque, SQL da produção, formato da resposta,
  // e (não) o tratamento de erro
});
// e, num arquivo distante, alguém tem que lembrar de escrever
// que esta rota exige 'embalagem.executar'
```

A auditoria mostrou que isso se manifesta em cinco formas, e que os quinze
achados mais graves saem todos delas:

| Forma | Manifestação medida |
|---|---|
| **1. A permissão mora longe da rota** | Default `@logado` em vez de fechado · 33 APIs e todos os `.html` sem verificação · cobertura com falso "OK" · 3 portas para Admin Geral |
| **2. O estoque não tem dono** | 9 comandos, 5 módulos, 4 políticas de clamp · `POST /api/skus` zera o saldo · o `+1` não valida SKU nem usa transação · o carregamento não baixa |
| **3. A regra vive na tela** | O bloqueio do kit, a recusa de SKU como kit e a exigência de reputação+motivo existem **só em HTML** |
| **4. Cada tela é um sistema próprio** | 5 bipes · 4 `banner()` com 4 assinaturas · 10 paletas · 17 de 32 chamadas de rede sem tratamento |
| **5. Migrações param no meio** | `areas` virou sombra bidirecional (é a Porta A) · o modelo ABC pode apagar o alvo do modelo novo · a `foto_estoque` saiu sem ajustar quem a consumia |

---

## 3. As quatro camadas

```
┌─────────────────────────────────────────────────────────────┐
│  TELA          o que o operador vê e toca                   │
│                não sabe SQL, não sabe regra                 │
├─────────────────────────────────────────────────────────────┤
│  ROTA          declarada, não registrada                    │
│                traduz HTTP ↔ domínio                        │
│                não tem SQL, não tem `if` de negócio         │
├─────────────────────────────────────────────────────────────┤
│  DOMÍNIO       a regra. "embalar exige kit conferido"       │
│                não sabe o que é `req`, `res` ou HTTP        │
│                é o único lugar onde a regra está escrita    │
├─────────────────────────────────────────────────────────────┤
│  DADOS         o SQL. Uma tabela, um arquivo, um dono       │
│                não decide nada — só grava e lê              │
└─────────────────────────────────────────────────────────────┘
```

Dependência de mão única: cada camada só conhece a de baixo. O domínio nunca
importa `express`. A camada de dados nunca decide se pode.

**Por que quatro, e não mais nem menos.** Mais (injeção de dependência,
repositórios com interface, eventos, CQRS) resolveria problemas de um time de 20
pessoas. Menos — só separar rota de serviço — deixaria o SQL espalhado, que é
exatamente como `skus.estoque` ganhou nove donos.

**O que não muda:** Node, Express, SQLite, HTML sem framework, sem build, sem
TypeScript. A sofisticação está na forma, não na pilha. Trocar a pilha seria
trocar um problema que você entende por um que você não entende.

---

## 4. A peça central: rota declarada

Hoje uma rota nasce aberta, sem auditoria, sem tratamento de erro e invisível para
a tela de cobertura:

```js
app.post('/api/embalar', (req,res)=>{ … });
// e a permissão é decidida em acesso.js:390-449, num switch mantido à mão,
// cujo `return` final é '@logado' — aberto para qualquer sessão
```

Passa a nascer declarada:

```js
// rotas/embalagem.js
module.exports = [
  { metodo: 'POST',
    caminho: '/api/embalagem/registrar',
    permissao: 'embalagem.executar',      // do registro de permissoes.js
    auditoria: 'Expedição',
    servico: embalagem.registrar },
];
```

E o núcleo monta o Express a partir da declaração:

```js
// nucleo/registro.js
function montar(app, rotas){
  for(const r of rotas){
    ROTAS.push(r);                                   // a lista existe sozinha
    app[r.metodo.toLowerCase()](r.caminho, (req,res)=>{
      if(!r.permissao) return negarEAlertar(req,res,r);   // fechado por padrão
      if(!pode(req.usuario, r.permissao)) return negar(req,res,r);
      try{
        const saida = r.servico({...req.params, ...req.body}, req.usuario);
        if(r.auditoria) auditar(req.usuario, r.auditoria, r, saida, req.ip);
        res.json({ ok:true, dados:saida });          // um envelope só
      }catch(e){
        responder(res, e);                           // um caminho de erro só
      }
    });
  }
}
```

**Uma declaração, sete garantias:**

| Garantia | Como sai daí | O que corrige hoje |
|---|---|---|
| Fechado por padrão | `permissao` ausente ⇒ negado | O default `@logado` (`acesso.js:448`) |
| Tela de cobertura | É `ROTAS.filter(r => !r.permissao)` | A `TODAS_ROTAS` mantida à mão (`acesso.js:529`) |
| Aviso no boot | Contar essa mesma lista | O aviso vazio por construção (`acesso.js:558`) |
| Intransferíveis travadas | Um `if` no registro, não um rótulo | `intransferivel` que nunca é verificado |
| Auditoria | Um lugar chama `auditar()` | 8 categorias da §7 que não registram nada |
| Erro tratado | Um `try` cobre as 103 rotas | Hoje **três** rotas têm `try/catch` no corpo |
| Documentação da API | Gerada da lista | `ARQUITETURA.md` §4, já desatualizada |

> **A prova de que isso é necessário está no seu próprio código.** O
> `CONTROLE-DE-ACESSO.md` é um documento bom, e foi implementado com fidelidade.
> Mesmo assim produziu três portas para Admin Geral e uma cobertura que mente —
> porque a garantia final dependia de alguém manter uma lista sincronizada com
> 103 rotas espalhadas por 17 arquivos. Nenhuma quantidade de cuidado resolve
> isso. Uma declaração no lugar certo resolve.

### O formato único de resposta

```js
{ ok:true,  dados: … }
{ ok:false, motivo:'kit_nao_conferido',
            mensagem:'Falta bipar o QR do kit antes de encerrar.' }
```

`motivo` é para a tela decidir. `mensagem` é para o humano ler. Hoje esses dois
papéis se misturam no campo `erro`, e existem **quatro convenções** para "não
pode": `404+{erro}`, `400+{erro}`, `200+{erro}` (`etq_route.js:17`),
`200+{ok:false,motivo}` (`carreg_route.js:17`).

---

## 5. Uma tabela, um dono

| Tabela | Dono | Hoje é escrita por |
|---|---|---|
| `skus.estoque` | **`dominio/estoque.js`** | **5 módulos, 9 comandos** |
| `skus` (cadastro) | `dominio/sku.js` | server.js, nec_route, teste_route |
| `fila` | `dominio/fila.js` | server.js, dev_route, mont_route — **nenhum é dono** |
| `producao` | `dominio/planejamento.js` | server.js, cruz_route, mont_route |
| `lote` | `dominio/expedicao.js` | exp_route, etq_route, carreg_route, server.js |
| `config` | `nucleo/config.js` | 6 módulos, **5 deles criam a tabela** |
| `venda_futura` | `dominio/planejamento.js` | plan_route (ok) — mas sem cobertura de teste |

### O estoque ganha história

`dominio/estoque.js` é o único lugar que toca no número, e toda passagem deixa
registro:

```js
estoque.entrada(codigo, 1, {motivo:'embalagem', ref:montagemId, quem});
estoque.saida(codigo, 1,  {motivo:'etiqueta',   ref:loteId,    quem});
estoque.ajustar(codigo, contado, {motivo:'contagem', ref:sessao, quem});
```

```sql
CREATE TABLE IF NOT EXISTS movimento_estoque (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo       TEXT,
  delta        INTEGER,      -- +1 embalagem, -1 etiqueta, ±n contagem
  saldo_apos   INTEGER,
  motivo       TEXT,         -- embalagem|etiqueta|contagem|ajuste|devolucao
  referencia   TEXT,
  usuario_id   INTEGER,
  usuario_nome TEXT,         -- sobrevive à desativação da pessoa
  criado_em    TEXT DEFAULT (datetime('now','localtime')),
  data         TEXT DEFAULT (date('now','localtime')),
  teste        INTEGER DEFAULT 0
);
```

O que isso destrava, ponto a ponto contra a auditoria:

- **`SUM(delta)` tem que ser igual a `skus.estoque`.** Uma conferência que o boot
  roda sozinho. Se o carregamento sem baixa (§2.1 da revisão) estiver acontecendo,
  **você fica sabendo no mesmo dia** em vez de descobrir no inventário do mês.
- *"Por que o estoque do `BK160160BEGE` está em 47?"* passa a ter resposta.
- A **aprovação de contagem** pode comparar o saldo de agora com o `sistema_era` —
  o furo §3.6-1, que hoje apaga a movimentação do dia.
- A **produtividade por pessoa** (`CONTROLE-DE-ACESSO.md` §8, dívida #9) vem de
  graça: `quem` é parâmetro de toda chamada de serviço.
- O **modo teste** deixa de precisar restaurar um snapshot cego: o movimento de
  teste é identificável linha a linha.

### O SKU e o dia, escritos uma vez

```js
// dominio/sku.js
normalizar(bruto)          // uma implementação, não três estratégias em 14 pontos
decompor('BK160140CINZA')  // → {largura:160, altura:140, cor:'CINZA'}
formatarMedida(...)        // → '1,60 × 1,40'  — uma grafia, não duas
existe(codigo)             // uma resposta, não 9 versões com 5 formatos

// dominio/dia.js
hoje() · agora() · corte(dia) · despacho(dia)   // em vez de 48 cópias + new Date()
```

No schema, `codigo TEXT PRIMARY KEY COLLATE NOCASE` — para o banco concordar com o
código em vez de depender de todo mundo lembrar.

---

## 6. A regra sai da tela e entra no servidor

Três garantias que os seus documentos afirmam como regra do sistema hoje existem
**só em HTML**. Com a camada de domínio elas passam a ser verdade:

| Regra | Hoje | Com o domínio |
|---|---|---|
| "sem o bipe do kit, o 3º é recusado" | `montagem.html:92` — o servidor aceita `kit_ok:1` do cliente | `embalagem.registrar()` recusa sem kit conferido |
| "o campo recusa um SKU de persiana" | `index.html:642` — e a outra tela que grava o kit não checa | `config.definirKit()` recusa qualquer coisa que case com a regex de SKU |
| "só após responder os dois campos dá para baixar" | a tela — `dev_route.js:37` não exige | `devolucao.baixar()` exige `reputacao` e `motivo` |

E as validações que faltam ficam onde ninguém pode esquecer: `embalagem.registrar`
valida o SKU (hoje é a única rota do fluxo que não valida),
`expedicao.carregar` exige `estagio='embalado'` (hoje aceita `pendente`, e a peça
sai sem o −1), `sku.salvar` não zera o estoque quando o campo vem ausente.

---

## 7. O schema sai dos módulos

Hoje o DDL está em **12 arquivos**; `config` é criada em 5 deles; a ordem dos
`require` é carga estrutural em três pontos diferentes (`auth` antes do `static`,
`acesso` depois do `auth` **e** dependendo de uma `config` que outro módulo cria,
`teste_route` obrigatoriamente por último).

Passa a ser um arquivo, numerado:

```js
// nucleo/schema.js
module.exports = [
  { n:1, nome:'base',        sql:`CREATE TABLE skus (…); …` },
  { n:2, nome:'expedicao',   sql:`CREATE TABLE lote (…); …` },
  { n:3, nome:'acesso',      sql:`…` },
  { n:4, nome:'planejamento',sql:`…` },
  { n:5, nome:'movimento',   sql:`CREATE TABLE movimento_estoque (…);` },
];
```

O boot roda em ordem, grava o que rodou numa tabela `migracoes` e **para no
primeiro erro em vez de continuar torto**. A ordem dos `require` deixa de
importar, porque o banco já está pronto antes de qualquer módulo carregar.

### O modo teste deixa de depender de memória

Hoje o `teste=1` é posto por trigger na escrita (funciona) e **filtrado na leitura
por um único arquivo** — o `plan_route`. Todas as outras leituras misturam teste
com produção. Com a camada de dados, o filtro passa a ser aplicado onde a consulta
é montada:

```js
// dados/consulta.js — toda leitura passa por aqui
function doDia(tabela, extra){
  return `SELECT … FROM ${tabela} WHERE data = ? AND teste = ? ${extra}`;
}
```

Não é conceito novo — é a mesma ideia do trigger, aplicada no lado que ficou
faltando, e que só é aplicável porque existe um lugar por onde as leituras passam.
Junto vêm as duas tabelas fora da cobertura hoje: `venda_futura` (que em modo
teste **apaga vendas reais**) e `contagem_pendente`.

---

## 8. O contrato de tela do operador

Cinco telas de bipe, **três dialetos incompatíveis** com o mesmo leitor:

| | `/operador` | `/montagem` | `/embalagem` | `/carregamento` | `/devolucao` |
|---|---|---|---|---|---|
| Campo | visível | **escondido** | visível | **escondido** | visível |
| Mínimo | 8 | — | 8 | — | 6 |
| Anti-duplicata | — | 700 ms | 700 ms | 600 ms | — |
| `toUpperCase` | sim | sim | sim | **não** | **não** |
| Aceita **Tab** | sim | **não** | sim | **não** | **não** |
| Som | sim | sim | sim | sim | **não existe** |

Um leitor com sufixo Tab funciona em duas telas e é inerte nas outras três. E os
dois campos escondidos a `-9999px` são a armadilha que o `CLAUDE.md` §12 documenta
e o `DESIGN.md` §6 proíbe por escrito.

### Uma implementação

```js
// public/bipe.js
Bipe.ligar({
  minimo: 8,
  excetoFoco: '#kitin',              // a exclusão que só a montagem tem hoje
  aoLer: codigo => embalagem.registrar(codigo)
});
```

Dentro, uma vez só: campo visível, foco recuperado no `blur` e no clique (com
exceções declaradas), Enter **e** Tab, espera de 220 ms, limpeza, `toUpperCase`,
janela anti-duplicata de 700 ms, som, e a comparação do código no 2º bipe — que
hoje a `montagem` faz e o `operador` não, e é o defeito nº 13 da revisão.

### Os quatro blocos

Toda tela de operação, os mesmos quatro blocos, na mesma ordem, no mesmo lugar.
Só o quarto muda entre estações:

```
┌──────────────────────────────────────────────┐
│ ██████████████████████████████████████████   │ 1 · ONDE ESTOU
│ 🔴 PEDIDOS DE HOJE                [Trocar]   │   faixa de 6px + estação
├──────────────────────────────────────────────┤
│    ┌────────────────────────────────────┐    │ 2 · O QUE FAZER
│    │  bipe aqui                         │    │   sempre visível,
│    └────────────────────────────────────┘    │   sempre no mesmo lugar
├──────────────────────────────────────────────┤
│         1,60 × 1,40   CINZA                  │ 3 · O QUE ACONTECEU
│         BK160140CINZA                        │   medida grande (DESIGN §3)
│         ✓  REVISADA  ·  00:42                │   em TODAS as estações,
│                                              │   não só na revisão
├──────────────────────────────────────────────┤
│  Fila: 12 aguardando   ·   Hoje: 47 peças    │ 4 · CONTEXTO
└──────────────────────────────────────────────┘
```

O ganho é de operação: **quem sabe usar uma estação sabe usar todas.** O olho
aprende onde procurar uma vez.

E é o que faz o `DESIGN.md` finalmente valer inteiro. Hoje a medida como âncora
está só no `/operador`; o piso de 15 px é violado em todas as telas; o contraste
do estado selecionado da devolução é 4,36:1. Com um lugar só, aplicar o documento
é uma edição, não dez.

---

## 9. O núcleo do front — três arquivos

`/public` não tem hoje **nenhum** arquivo compartilhado além do `nav.js`. Passa a
ter três:

```
public/
├── base.css     a paleta, os componentes, os dois temas
├── bipe.js      a leitura do código (§8)
└── ui.js        api, banner, beep, formatação
```

**`base.css`** encerra 10 paletas com divergências e — mais importante — torna o
`DESIGN.md` aplicável:

```css
:root { /* tokens neutros: espaçamento, raio, peso, tamanho */ }
.tema-operacao { --fundo:#FFFFFF; --texto:#1A1D23; --urgente:#C62828; … }
.tema-admin    { --fundo:#0E1217; --texto:#E6EDF3; --acao:#FFB800;    … }
```

> Hoje as cores do semáforo são literais repetidos **em CSS e em JavaScript
> inline**, em ~20 pontos de 5 arquivos. Trocar um tom é uma caçada.

**`ui.js`** dá um caminho só para o que hoje tem quatro:

```js
api.post('/api/embalagem/registrar', {codigo})   // erro, rede e "enviando": um lugar
banner.ok('REVISADA', '00:42')                   // uma assinatura, não quatro
banner.erro('FALTOU O KIT', 'Bipe o QR antes de encerrar')
beep(true)                                       // e a devolução finalmente tem som
```

O `api` resolve de uma vez o achado mais espalhado da auditoria: **17 de 32
chamadas de rede sem nenhum tratamento, 9 com `catch` vazio** — inclusive as que
mentem ("Nada pendente.", "Sem registro dessa venda, siga normalmente"). Com um
wrapper, falha de rede tem um comportamento só: banner de erro, som, e o estado
anterior preservado. É também onde a fila local de reenvio (dívida #3) vai caber,
sem tocar em nenhuma tela.

---

## 10. A navegação — três portas, não vinte

Hoje: 14 telas planas, uma barra no rodapé que mostra **os 10 links para todo
mundo** — e que **já busca `/api/auth/eu`, recebe as `areas` e descarta o dado**
(`nav.js:86,92`). Um toque errado tira o operador da bancada e o joga num 403, no
meio do turno. Mais o `index.html` de 704 linhas com 12 abas trocadas por cadeia
manual de `if`, ordem de containers que não bate com a dos botões, e 5 listeners
de clique globais.

A hierarquia passa a ser por **momento de uso**:

```
OPERAR          uma estação por pessoa. Quem revisa abre e está na revisão.
                O modelo de permissões já sabe quais estações são dela.

ACOMPANHAR      painel do dia · relatórios · planejamento
                leitura, não ação.

CONFIGURAR      cadastro · acessos · listas · horários · contagem · modo teste
                o admin, desmontado do arquivo único em páginas.
```

Três decisões que vêm junto:

1. **O menu reflete a permissão.** O dado já está na mão.
2. **`index.html` se desfaz em páginas.** As 12 abas já são independentes — três
   delas já são `<iframe>` de telas separadas. Separar é recorte, não reescrita.
3. **Os nomes passam a ser os da fábrica.** Hoje `/montagem` serve uma tela
   chamada "Embalagem" e `/embalagem` serve "Etiqueta de Venda". E `/devolucao`
   não está em menu nenhum (dívida #8) — existe o caminho de volta, não o de ida.

---

## 11. Como fica a estrutura

```
/opt/expedicao/
│
├── server.js              ~30 linhas: sobe o banco, monta o registro, escuta
│
├── nucleo/                infraestrutura. Não sabe nada de persiana.
│   ├── db.js · schema.js · config.js · erros.js
│   ├── registro.js        declaração → permissão + auditoria + erro + envelope
│   └── permissoes.js      já existe, fica onde está
│
├── dominio/               a regra. Não conhece Express.
│   ├── sku.js · dia.js
│   ├── estoque.js         ← único dono do número
│   ├── fila.js
│   ├── revisao.js · embalagem.js · expedicao.js
│   ├── devolucao.js · contagem.js · planejamento.js
│   ├── acesso.js          o que hoje está em acesso.js, sem as rotas
│   └── parse.js · planilha.js    já são módulos puros — ficam como estão
│
├── dados/                 o SQL. Uma tabela, um arquivo.
│   ├── consulta.js        montador comum (filtro de dia e de teste)
│   └── skus.js · producao.js · lote.js · fila.js · venda_futura.js · …
│
├── rotas/                 declarações. Sem SQL, sem regra.
│   └── operacao.js · expedicao.js · admin.js · acesso.js · relatorios.js
│
└── public/
    ├── base.css · bipe.js · ui.js · nav.js
    └── telas/  revisao · embalagem · etiqueta · carregamento · devolucao
                painel · relatorios · planejamento
                admin/  cadastro · acessos · listas · contagem · bloqueados · teste
```

---

## 12. Ordem de migração

Cada fase tem valor sozinha e é reversível. **As fases 0 a 3 não mudam nada do que
o operador vê.**

| Fase | O quê | O operador nota? | Reversível |
|---|---|---|---|
| **0** | **Fechar as duas migrações pela metade.** Cortar a leitura de `usuarios.areas` como entrada da migração (fecha a Porta A); tirar a aba ABC do menu ou fazê-la respeitar o alvo travado; ajustar o consumidor da tela vermelha ao novo cruzamento | A tela vermelha volta a somar certo | Sim |
| **1** | **Registro de rotas.** As 103 rotas passam a ser declaradas. Fechado por padrão, cobertura real, auditoria e erro num lugar só | Só o erro fica legível | Sim, por configuração |
| **2** | Núcleo compartilhado criado, **nada usa ainda** — `sku.js`, `dia.js`, `ui.js`, `bipe.js`, `base.css` | Não | Total — é só apagar |
| **3** | Schema num arquivo, numerado. A ordem dos `require` deixa de importar | Não | Sim |
| **4** | **`estoque.js` vira o dono.** As 9 escritas viram chamadas. `movimento_estoque` grava **em paralelo** e o boot compara `SUM(delta)` com `skus.estoque` | Não | Sim, por configuração |
| **5** | As regras saem da tela para o domínio (kit, carregamento, baixa de devolução) | Passa a recusar o que hoje passava | Sim |
| **6** | Uma tela por vez adota `bipe.js` + `base.css` + o contrato. **Devoluções primeiro** | Sim — é o ganho | Sim, tela a tela |
| **7** | `index.html` se desfaz em páginas | Só o admin | Sim |
| **8** | Remoção do código antigo | Não | **Definitiva** |

Detalhes que separam plano de plano executável:

**A fase 0 vem antes de tudo porque é a única que corrige perda ativa.** As três
portas para Admin Geral, a dupla subtração na tela vermelha e o alvo travado que
é placebo estão acontecendo hoje. Nenhum deles espera arquitetura.

**A fase 1 subiu de posição.** Na v1 era a quarta. Depois da auditoria é a
primeira, porque enquanto a permissão morar numa lista mantida à mão, cada rota
nova é uma chance de repetir o mesmo furo — e vocês estão criando rotas rápido.

**A fase 4 escreve duas vezes antes de trocar a chave.** O comando antigo continua
rodando, o movimento é gravado ao lado, o boot compara e reclama se divergir. É a
mesma técnica da fase 1 do `CONTROLE-DE-ACESSO.md`, pelo mesmo motivo: estoque
errado numa fábrica é caro.

**A fase 6 é a única que precisa do Edivaldo.** Uma estação por semana, validada
na bancada e não na mesa. Se uma tela ficar pior, ela volta sozinha.

---

## 13. O que este documento não resolve

- **Não conserta a dívida #2** (sem HTTPS). PINs em texto aberto e cookie sem
  `Secure`, com validade de um ano.
- **Não decide o futuro do modelo ABC.** Ele precisa sair ou ser subordinado ao
  novo — isso é decisão sua, não de arquitetura.
- **Não substitui os testes que não existem** (#10). Mas os torna possíveis pela
  primeira vez: com o domínio separado do HTTP, testar `embalagem.registrar()` não
  exige subir servidor nem banco de verdade.
- **Não é uma reescrita.** Nenhuma regra de negócio muda. Se alguma mudar durante
  a migração, é bug — e o `CLAUDE.md` continua sendo a fonte de verdade.

---

## 14. Regras que não podem ser quebradas

1. **A regra de negócio mora no domínio.** `if` de negócio dentro de handler está
   no lugar errado.
2. **Uma tabela, um dono.** Escrita fora do módulo dono é o defeito, não a exceção.
3. **`skus.estoque` só muda por `dominio/estoque.js`**, e todo movimento deixa
   registro. Sem exceção — nem para o modo teste.
4. **Rota nasce declarada.** `app.get` direto não existe fora do núcleo. Sem
   `permissao`, a rota é **negada** e aparece em vermelho na cobertura.
5. **A cobertura é derivada, nunca mantida à mão.** Se alguém precisa lembrar de
   atualizar uma lista, a garantia não existe.
6. **Um caminho de erro.** Nenhum erro chega ao operador como stack trace, e
   nenhuma tela afirma um estado que não confirmou.
7. **O bipe tem uma implementação.** Toda estação usa `bipe.js`.
8. **Nenhum hex dentro de uma tela.** Cor, espaçamento e tipografia vêm de
   `base.css`.
9. **O DDL mora no schema.** A ordem dos `require` nunca mais é regra de negócio.
10. **Nenhuma migração fica pela metade.** Ou termina, ou volta. Conviver é o
    estado mais caro dos três.

---

## 15. O que não muda

- Todas as regras de negócio do `CLAUDE.md` e do `REGRAS-DE-NEGOCIO.md`
- O fluxo de bipes: dois na revisão, três na embalagem
- Estoque entra na embalagem e sai na etiqueta — nunca na revisão
- A trava de SKU não cadastrado, e a ausência de tabela de equivalências
- As cores dos três modos e seus significados
- Os atalhos `Alt+1..9` e `Alt+0`
- O formato do SKU e a etiqueta Zebra
- O desenho do `CONTROLE-DE-ACESSO.md` — ele está certo; o que muda é o mecanismo
  que o aplica
- Node · Express · SQLite · HTML sem framework · sem build

> A arquitetura muda de forma para que essas coisas fiquem **mais** protegidas do
> que estão hoje. Três delas — o bloqueio do kit, a recusa de SKU como kit e a
> exigência de reputação na baixa — hoje só existem em HTML. É isso que a mudança
> de forma resolve.
