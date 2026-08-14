# Regras de Negócio — PCP Deccorar

> Documento de referência do funcionamento do sistema, escrito para leitura humana.
> Substitui a documentação anterior, que descrevia o fluxo antigo (quando a revisão
> somava estoque).
>
> **Última revisão:** 13/08/2026

---

## 1. Cadastro de SKU

### Formato

```
BK + largura(3 dígitos) + altura(3 dígitos) + COR
```

`BK160140BRANCO` → Blackout · 1,60 m largura · 1,40 m altura · Branco

- Sempre MAIÚSCULAS, sem espaços nem separadores
- Medidas em centímetros, com zero à esquerda quando necessário
- Gravado com `TRIM()` e `UPPER()` automaticamente

### Campos

| Campo | Uso |
|---|---|
| `codigo` | Chave única. Deve ser idêntico ao da folha de controle do ML |
| `descricao` | Texto livre, aparece na etiqueta impressa |
| `cor` | Usada no seletor de devolução e nas telas |
| `estoque` | Peças prontas e embaladas, fisicamente na prateleira |
| `alvo` | Quanto deveria haver. Alimenta a tela azul da revisão |

### Regras

- **A repor** = `alvo − estoque`, nunca negativo
- Estoque nunca fica negativo — baixa maior que o saldo trava em zero
- Excluir um SKU apaga o cadastro, **não** apaga o histórico de revisões
- Cadastrar um SKU **destrava automaticamente** os volumes bloqueados daquele código

### Etiqueta impressa

Gerada na aba Cadastro de SKU, botão "etiqueta". Impressora Zebra ZD220,
100 × 35 mm, 203 dpi, código CODE128B.

Configuração obrigatória no Chrome: **Margens: Nenhuma** e **Escala: 100%**.
"Ajustar à página" deforma as barras e o leitor recusa a leitura.

---

## 2. Ordem de produção

### Origem `ml` (cruzamento do PDF)

Ao subir o PDF do Mercado Livre, o sistema compara as vendas com o estoque e gera
duas classes de ordem:

| Situação | Classificação | Aparece em |
|---|---|---|
| Vendido, **sem** estoque | Urgente (`urgente=1`) | Revisão 🔴 |
| Vendido, **com** estoque | Reposição (`urgente=0`) | Revisão 🔵 |

**Exemplo:** 5 vendas de um SKU com 2 em estoque
→ 3 urgentes (cliente esperando) + 2 de reposição (refazer o estoque consumido).

As 2 peças que já estavam em estoque **não passam pela produção** — vão direto
para a Etiqueta de Venda.

### Origem `manual`

Lançamento direto por SKU e quantidade. Serve para produzir sem venda associada
(repor além do alvo, adiantar, produção especial).

> ⚠️ **PDF e manual não se conversam.** O recálculo do PDF apaga e refaz apenas as
> ordens de `origem='ml'`. Lançar os dois para o mesmo SKU **duplica a ordem**.
> Foi o que causou duplicidade em 12/08.

### Recálculo

`POST /api/cruzamento/aplicar` é idempotente para a origem `ml`: apaga as ordens
do dia e refaz com o total atualizado. Subir o mesmo PDF duas vezes não duplica;
subir um PDF maior mais tarde acrescenta apenas a diferença.

### A foto do estoque

No primeiro cruzamento do dia, o estoque de todos os SKUs é fotografado
(`foto_estoque`) e todos os cruzamentos seguintes daquele dia usam essa foto.

**Motivo:** durante o dia o estoque muda (embalagem soma, etiqueta subtrai). Sem a
foto, o segundo upload contaria peças duas vezes ou apagaria urgentes já em
produção.

### Adiantamento

Ordens com data do **dia seguinte** aparecem na tela azul da revisão, sob a tarja
"ADIANTAMENTO — pedidos de amanhã". O operador pode produzi-las se sobrar tempo.

A revisão conta no **dia em que foi feita** — isso mede a capacidade produtiva
real, que pode ser maior que a demanda do dia.

---

## 3. Revisão

### Os três modos

A tela abre com escolha obrigatória. A cor do cabeçalho muda conforme o modo.

**🔴 PEDIDOS DE HOJE** — peças com venda feita, entrega no mesmo dia.
Mostra os SKUs lançados para hoje com progresso `revisadas/meta` e quanto falta.

**🔵 PRODUÇÃO PRA ESTOQUE** — sem venda ainda. Mostra `estoque/alvo` por SKU,
ordenado do mais furado, com borda vermelha em quem está abaixo do alvo. Inclui as
ordens de reposição e o bloco de adiantamento.

**🟡 DEVOLUÇÕES** — leva para a tela de recebimento de devoluções.

> A produção separa os carrinhos **fisicamente**. A tela apenas espelha essa
> separação. Se o físico não estiver separado, a escolha vira chute.

O modo fica salvo por aparelho (`localStorage`). O botão "Trocar" força a escolha
de novo e é recusado se houver revisão em andamento.

### Como revisar

1. **Bipe no SKU** → inicia, cronômetro começa
2. **Bipe de novo** → encerra

Ao concluir: grava tempo em `revisao` e **insere na `fila`** com
`situacao='aguardando'`. **Não mexe no estoque.**

### Exceções

| Situação | Comportamento |
|---|---|
| SKU não cadastrado | Bloqueia, som de erro, nada é gravado |
| SKU fora dos pedidos do dia (modo 🔴) | **Avisa no início** e deixa passar, contando como estoque |
| Falha de conexão ao concluir | Mostra erro. ⚠️ **A revisão é perdida** — não há fila local de reenvio |
| Trocar de modo com revisão aberta | Bloqueado |

### Peça com problema

Durante uma revisão em andamento, o botão "Peça com problema" devolve a peça para
a produção. Ela **não entra na fila de embalagem**.

Grava em `rejeicao`: motivo, tempo até a detecção, modo e usuário logado.

Motivos padrão (editáveis em Cadastros): corte de tecido errado · medida errada ·
etiqueta errada · defeito no tecido · lado do comando trocado · outro.

### Aviso de status

No topo da tela, uma faixa explica a situação do dia:

| Situação | Mensagem |
|---|---|
| Nada lançado | "Nenhuma venda lançada ainda hoje. O corte de hoje é às HH:MM." |
| Tudo coberto por estoque | "Todas as vendas de hoje já estão em estoque. Trabalhe na reposição." |
| Há urgente pendente | "N peça(s) URGENTE(S) para hoje. Priorize a tela vermelha." |
| Urgentes concluídos | "Urgentes do dia concluídos." |

**Alerta de urgente:** se entrar pedido urgente enquanto o operador está no modo
azul, dispara som duplo e uma faixa vermelha fixa no topo, que precisa ser tocada
para fechar. O sistema **não troca de modo sozinho** — apenas avisa.

---

## 4. Embalagem

### Como embalar

1. **Bipe no SKU** → inicia
2. **Bipe no QR do kit** → confirma que o kit entrou na caixa
3. **Bipe no SKU** → encerra

Ao concluir:
- Consome uma peça da `fila` daquele SKU
- **+1 no estoque**
- Abate a ordem do dia, se a peça veio do modo 🔴
- Grava o tempo em `montagem`

### Bloqueio do kit

Sem o bipe 2, o bipe 3 é recusado com **"⚠ FALTOU O KIT"**.

**Alcance real:** o QR é fixo — um link do Google Drive com o manual de instalação,
que o cliente escaneia em casa. O sistema garante que *alguém bipou um kit*, não que
*aquele kit específico* entrou naquela caixa. É proteção contra esquecimento, não
contra fraude.

O código é configurável na aba Cadastros. O campo **recusa** um SKU de persiana —
proteção contra o engano de bipar a etiqueta da peça em vez do QR do kit.

### Fila

A tela mostra "Aguardando embalagem" com a contagem por SKU, atualizando sozinha a
cada 4 segundos conforme a revisão libera peças.

Peças de devolução marcadas como `reembalar` entram na mesma fila, com
`modo='devolucao'` — seguem o fluxo normal e viram estoque como qualquer outra.

---

## 5. Etiqueta de Venda

### Como funciona

1. **Bipe no SKU** → o sistema puxa a próxima venda pendente daquele código
2. Confere na tela: comprador, NF, cidade
3. **Bipe de novo** (ou clique) → imprime etiqueta + DANFE

Ao imprimir: `estagio` vira `embalado`, **−1 no estoque**.

### Bloqueios

| Situação | Mensagem |
|---|---|
| SKU não cadastrado | "cadastre no Admin" |
| Estoque zero | "SEM ESTOQUE — bloqueado. Não passou pela produção." |
| Todas as vendas já embaladas | "Todas embaladas" |
| Nenhuma venda daquele SKU hoje | "SKU não está no lote. Já subiu o PDF?" |
| Volume bloqueado | "Volume bloqueado: SKU fora do cadastro." |

### Lista de pendentes

A tela mostra "Faltam imprimir" com a contagem por SKU, atualizando a cada 5 s.

### Relógio de despacho

Contagem regressiva até o horário de despacho do dia:

- **Neutro** — tempo confortável
- **Amarelo** — menos de 2 h com volumes pendentes
- **Vermelho** — menos de 1 h com volumes pendentes, ou horário já passado

---

## 6. Carregamento

Bipe da etiqueta do ML confere o volume contra a lista do dia.

- Volume não encontrado → `nao_encontrado`
- Volume já carregado → `duplicado`
- Volume bloqueado → recusado com o motivo

O QR da etiqueta do ML contém JSON no formato `{"id":"...","t":"lm"}`, e o `id`
corresponde ao número do código de barras.

---

## 7. Trava de SKU não cadastrado

**Regra inegociável.** Volume cujo SKU não existe no cadastro entra com
`estagio='bloqueado'` e **não imprime nem carrega**.

- **Por volume, não por lote:** 40 vendas com 3 SKUs desconhecidos → 37 seguem
- **Destravamento automático** ao cadastrar o SKU
- **Sem tabela de equivalências**, por decisão explícita: se o anúncio manda
  `BK140140BEGEML` e o cadastro tem `BK140140BEGE`, o volume fica retido até o
  anúncio ser corrigido no Mercado Livre

A aba **Bloqueados** no admin lista os SKUs desconhecidos com contador vermelho e
botão que leva ao cadastro com o código já preenchido.

---

## 8. Devoluções

### Etapa 1 — Revisão (`/devolucao`)

Quem recebe a peça registra:

1. **Bipe** no código da etiqueta do ML — o sistema busca a venda original
2. **Cor** e **medida** (dois toques, montando o SKU)
3. **Triagem física:**

| Campo | Opções |
|---|---|
| Embalagem | intacta · amassada · violada |
| Tecido | intacto · sujo · rasgado · amassado |
| Tubo do rolo | ok · amassado |
| Base | ok · amassada |
| Comando | perfeito · quebrado · sem comando |
| Kit de instalação | com kit · sem kit |
| **Destinação** | reembalar · assistência |

**O operador informa o SKU que está vendo fisicamente.** O sistema mostra o SKU
que foi enviado, mas não preenche o campo — a divergência entre os dois é
justamente a evidência de envio errado.

Se a venda original não existir (devoluções anteriores ao sistema), tudo funciona
normalmente.

**Destinação `reembalar`** insere na fila de embalagem.

### Etapa 2 — Admin (aba Devoluções)

Quem olha o Mercado Livre responde:

- **Afetou a reputação?** sim · não
- **Motivo:** comprador se arrependeu · enviado medida ou cor errada ·
  avaria no transporte · defeito de fabricação *(editável em Cadastros)*

Divergência entre SKU enviado e devolvido aparece destacada em vermelho:
**"DIVERGÊNCIA: enviado X, voltou Y"**.

Só após responder os dois campos é possível dar baixa.

---

## 9. Contagem de estoque

Duas operações distintas — confundi-las já causou erro em produção:

| Operação | Efeito | Quando usar |
|---|---|---|
| **Lançar (soma)** | Acrescenta ao estoque e limpa a contagem | Contagem em partes, de 10 em 10 |
| **Ajustar (substitui)** | Estoque passa a ser exatamente o contado | Conferência mensal, contando tudo |

- A contagem fica salva por aparelho — pode parar e continuar
- **SKU não bipado nunca vira zero.** Aparece como "ainda não contado"
- Código fora do cadastro aparece em vermelho — é a etiqueta impressa errada
- Nada muda no estoque sem confirmação, com a lista de mudanças exibida antes

> **Limite conhecido:** o sistema detecta código **inexistente**. Se a etiqueta
> tiver o código de outro SKU válido (imprimiu BEGE, colou em peça CINZA), ele
> conta como BEGE. A divergência só apareceria como sobra de um e falta de outro.

---

## 10. Acessos

- **PIN de 4 dígitos** por pessoa, escolhendo o nome na grade
- Permissões por **área marcável**, não por cargo fixo — uma pessoa pode acumular
- A área `admin` dá acesso a tudo, inclusive ao cadastro de pessoas
- Sessão dura 1 ano ou até sair
- **Sair:** botão no topo de toda tela, ou `Alt+0`. Ambos pedem confirmação
- Excluir uma pessoa **desativa**, não apaga — o histórico permanece
- 5 PINs errados bloqueiam por 1 minuto
- O PIN **não é recuperável** — o admin define um novo

### Áreas

`admin` · `painel` · `relatorios` · `necessidade` · `operador` · `devolucao` ·
`montagem` · `embalagem` · `expedicao` · `carregamento`

---

## 11. Horários

Configuráveis **por dia da semana**, porque o Mercado Livre altera sem aviso —
já houve quarta com corte ao meio-dia.

| Horário | Padrão | Significado |
|---|---|---|
| **Corte** | 10:30 | Vendas até aqui são entregues no mesmo dia |
| **Despacho** | 15:00 | Limite para levar os volumes à agência |

---

## 12. Modo teste

- Marca tudo que acontece enquanto ligado
- Fotografa estoque e alvos na ativação
- Tarja amarela em todas as telas
- Ao encerrar: **apagar** (restaura o estoque) ou **manter** (vira produção real)

> ⚠️ **Limitação atual:** cobre apenas `revisao`, `producao`, `montagem` e `lote`.
> Não cobre `fila`, `devolucao`, `rejeicao`, `contagem` nem `foto_estoque`.
> Testes envolvendo essas tabelas sujam dados reais.

---

## 13. Painel gerencial

Na tela de Relatórios, com filtro de período:

**Cartões:** revisadas · embaladas · na fila · rejeitadas · devoluções · vendas

**Indicadores:** taxa de retrabalho (vermelha acima de 10 %) · taxa de devolução
(vermelha acima de 5 %) · tempo médio de revisão e embalagem · divergências de SKU

**Gráficos:** evolução diária (revisadas, embaladas, rejeitadas) · motivos de
retrabalho · SKUs que mais voltam · motivos de devolução · SKUs mais devolvidos ·
tempo médio por SKU · quanto falta para o alvo

---

## 14. Decisões de projeto e seus motivos

| Decisão | Por quê |
|---|---|
| Estoque só depois da embalagem | Peça revisada não está pronta — falta o kit |
| Estoque sai só na etiqueta de venda | A peça existe fisicamente até ser despachada |
| Avisar em vez de bloquear (SKU fora da lista) | Operador parado é pior que número reclassificado |
| Bloquear SKU não cadastrado | Envio errado vira devolução e reclamação — pior que a trava |
| Sem equivalência de SKU | Força a padronização na origem em vez de mascarar |
| Cor por modo de revisão | Impede revisar meia hora no modo errado |
| Foto do estoque no cruzamento | Evita contagem dupla nos uploads do dia |
| Motivos configuráveis | O dono altera sem depender de desenvolvedor |
| Confirmação ao sair | Toque acidental desconectaria no meio da revisão |
| Alt obrigatório nos atalhos | Leitor digita números soltos e dispararia sem querer |

---

## 15. Lições aprendidas

Registradas para não se repetirem.

| Lição | Contexto |
|---|---|
| **`node --check` antes de testar** | Um `}` sobrando na linha 181 derrubou o `<script>` inteiro do admin: todas as abas mortas, sem erro visível |
| **Código novo colado por cima do velho** | Causa do problema acima — linhas duplicadas sobraram embaixo |
| **`cp dados.db` não faz backup** | No modo WAL, os dados estão em `dados.db-wal`. Use `node backup.js` |
| **Ordem do `express.static`** | Antes do auth, qualquer um acessa `/index.html` sem senha |
| **`pm2 restart` cacheia** | Quando a alteração não aparece: `pm2 delete` + `pm2 start` |
| **Campo invisível não funciona no iPad** | iOS tira o foco — o campo de bipe precisa ser visível |
| **Leitor manda Tab ou espaço** | Aceitar ambos e limpar o texto antes de processar |
| **`!` no bash quebra heredoc** | `set +H` antes |
| **PDF e manual duplicam ordem** | Usar um caminho por SKU |
| **Lançar ≠ ajustar** | Contagem em partes exige soma, não substituição |
