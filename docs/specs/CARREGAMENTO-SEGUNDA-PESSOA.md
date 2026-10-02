> **STATUS · 02/10/2026 — EM CONSTRUÇÃO** · **fase 1 no ar (PR #164):** o bipe da área e do
> canto recusa quem imprimiu, com o nome dele, **sem liberação nenhuma** — o dono mudou a
> P1 em 01/10/2026: *"tem que ter esse cruzamento, não tem que ter liberações"*. A
> liberação por pessoa e dia chegou a ser construída e saiu antes do deploy;
> `teste_segunda_pessoa.js` (24 casos). No ar, confirmado pelo dono em 02/10/2026;
> falta o primeiro dia real de expedição com a regra. P6 respondida: as etiquetas de fora são **as do saco**. Fase 2 planejada. Nasceu da conversa de 01/10/2026 (tipo `REGRA` + `NOVIDADE`).
> **Muda uma decisão de 25/09/2026:** a decisão 2 da `SAIDA-E-DUPLA-CONFERENCIA`
> ("sem segunda pessoa só MARCA, nunca trava"). Quando aprovada, a mudança vai para
> o `CLAUDE.md` §8-B e para uma linha em `docs/DECISOES.md`, no mesmo commit do código.
> Fases: 1 ☑ (no ar) · 2 ☑ (em código em 02/10/2026)
>
> **Fase 2 em código (02/10/2026):** `POST /api/carregar/peca` e `/recomecar`, a tela âmbar
> sem a lista, a divergência com os dois lados e a auditoria, e a frase `fita(n)` com a
> instrução de colar por fora as etiquetas do saco (P6). **Decidido na construção:** a
> contagem é `lote_item.conferidos_carga` (coluna, não tabela); a divergência não zera, quem
> zera é o "Recomeçar"; e há um "deixar esta caixa" que larga sem apagar. O `VARIAS` foi para
> o `carga.js`. `teste_pecas_carga.js` (37). Falta o deploy e a primeira caixa real.

---

# Carregamento por outra pessoa, e a caixa de várias persianas conferida peça a peça

> **Em uma frase:** a caixa só é conferida no Carregamento por um login **diferente**
> de quem imprimiu a etiqueta de venda, e a caixa que leva mais de uma persiana só é
> conferida depois de bipar a etiqueta de SKU de **cada** persiana — sem a tela dizer
> antes quais são.

## 1. O problema, nas palavras do dono

> *"A bancada está bipando para imprimir a etiqueta de venda e não se atenta que
> aquela venda tem mais de uma unidade. Por isso penso que para pegar esse erro
> seria na parte do carregamento — deixar no local antes de colocar no carro e antes
> da coleta coletar."*

O que já existe e **não basta**:

| Onde | O que faz hoje | Por que não pega |
|---|---|---|
| Etiqueta de Venda (§5, #23) | exige um bipe por persiana antes de imprimir | quem bipa é a mesma pessoa que monta a caixa; o erro é de atenção, e a mesma atenção confere |
| Carregamento — "sem segunda pessoa" (§8-B, fase 2) | **marca** quando quem conferiu = quem imprimiu | só marca; ninguém olha a marca depois |
| `config.conf_carregamento` (§5) | segundo bipe cego do SKU, **desligado** | compara com `lote.codigo` — um SKU só; não sabe que existe `lote_item` |

O ponto certo é o **bipe do Carregamento**: é a última vez que alguém está com a
caixa na mão antes de ela sair (na agência, o bipe de conferir na área, antes do
carro; na coleta, o bipe que leva pro canto, antes do caminhão).

## 2. As duas regras (decisões do dono, 01/10/2026)

### Regra 1 — quem confere no Carregamento não pode ser quem imprimiu

- Vale para **toda** caixa, não só a de várias persianas (resposta 1 do dono:
  *"deveria ser login diferente"*).
- Quando o login do bipe é o mesmo do `impresso_por`, o bipe é **recusado** e a tela
  mostra uma tarja: **"Você imprimiu esta etiqueta. O carregamento tem que ser feito
  por outra pessoa, com o login dela."**
- A comparação é a mesma de hoje (`carga.js`, a régua do "sem segunda pessoa"):
  ignora espaço e maiúscula, e **vazio nunca é igual a vazio**.
- Vale nos dois bipes: **conferir na área** (agência) e **levar pro canto** (coleta).
  **Não** vale no bipe da viagem (pôr no carro), nem nas sobras da saída do caminhão:
  ali a caixa já foi conferida por outra pessoa.

### Regra 2 — a caixa de várias persianas é conferida peça a peça, às cegas

Caixa de várias = `SUM(lote_item.qtd) > 1` (a mesma régua `VARIAS()` do `exp_route.js`,
que passa a morar num lugar só).

1. Bipe da etiqueta de venda → a tela fica âmbar: **"📦 Esta caixa leva 3 persianas —
   bipe a etiqueta de SKU de cada uma (coladas por fora da caixa)."** Não mostra **quais** SKUs (resposta 2
   do dono: aprovado). Mostrar a lista faria a pessoa bipar o que estivesse escrito,
   como o segundo bipe cego do carregamento já ensinou (§5).
2. Cada bipe de SKU conta **uma** persiana. A tela mostra só **"2 de 3"**.
3. Bateu tudo (mesmos SKUs, mesmas quantidades) → a caixa é conferida (agência) ou vai
   pro canto (coleta), como hoje.
4. Bipou SKU que não está na caixa, ou um a mais do que a caixa leva → **para tudo** e
   aí sim mostra os dois lados: *"a caixa devia ter 1 × BK120120BEGE + 2 × BK140140BEGE;
   foi bipado 1 × BK120120BEGE + 1 × BK160140BEGE"*, e a caixa não anda. Vai para a
   auditoria.
5. Botão **"Recomeçar esta caixa"** zera a contagem dela (a pessoa errou o bipe).

**O guard de 700 ms vale aqui também** (§5, #23 e §12): o leitor às vezes manda o
mesmo código duas vezes numa leitura, e aqui isso contaria uma persiana a mais.

## 3. O que fica de fora

- A Etiqueta de Venda **não muda** — continua exigindo um bipe por persiana para imprimir.
- A caixa de **uma** persiana não ganha bipe novo (só a Regra 1). O segundo bipe cego
  do `conf_carregamento` continua como está, desligado.
- Estoque não se mexe em nada: a baixa continua na impressão.

## 4. Respostas do dono (01/10/2026)

| # | Pergunta | Resposta |
|---|---|---|
| P1 | Dia de uma pessoa só | ~~Liberar com motivo~~ → **sem liberação** (dono, 01/10/2026, depois de ver a primeira versão): o cruzamento é automático, e a caixa espera outra pessoa |
| P2 | O tablet do Carregamento fica com um login só o dia todo? | **Sim.** A tela ganha **"Trocar de pessoa"** (nome + PIN) sem sair dela |
| P3 | Caixa sem `lote_item` (antes de 15/09) | Segue o fluxo de uma persiana |
| P4 | A mesma etiqueta de SKU bipada duas vezes | **Concordo** — fica escrito como limite: o que protege é ser outra pessoa olhando a caixa |
| P5 | Caixas já impressas antes do deploy | A regra vale para todo bipe depois do deploy |
| P6 | **Novo ponto do dono:** na Etiqueta de Venda, avisar quem imprime para colar **por fora da caixa** as etiquetas de SKU de cada persiana — facilita a conferência no carregamento | **As do saco** de cada persiana (dono, 01/10/2026), e não cópias. Cópia não prova que a persiana entrou — dá para colar três etiquetas numa caixa com uma persiana só, e a conferência do carregamento passa a conferir papel |

> Com as etiquetas por fora, o bipe da Regra 2 é feito **sem abrir a caixa**. A tela
> continua sem listar os SKUs esperados: quem confere bipa o que **está colado**, e o
> sistema compara com o que a caixa **deveria** levar.

## 5. Fases

**Fase 1 — a Regra 1 (outra pessoa).** Recusa no `POST /api/carregar` (área e canto),
a tarja com o nome de quem imprimiu e o "Trocar de pessoa" (P2). Sem liberação (P1).
Teste escrito antes: mesmo login recusado, outro login aceito, vazio ≠ vazio, e a rota de
liberação não existe.

**Fase 2 — a Regra 2 (caixa de várias às cegas) e o aviso na impressão (P6).** Na
Etiqueta de Venda, ao lado da frase `fita(n)`, a instrução de colar por fora as
etiquetas de SKU — nos quatro lugares onde a caixa aparece, igual em todos. Contagem por caixa
(`lote_item.conferidos_carga` ou tabela própria — decidir na construção), a tela âmbar
sem a lista, a divergência com os dois lados, o "Recomeçar", a auditoria. Teste
escrito antes, incluindo varredura de que a resposta do bipe **não traz** os SKUs
esperados antes da divergência (a lição do inventário cego, §18).

Risco das duas: 🔴 (acesso e expedição). Deploy fora do horário de expedição e
**refresh forçado nos tablets** — a página antiga em cache mostraria "conferido ✓"
numa caixa que o servidor recusou.
