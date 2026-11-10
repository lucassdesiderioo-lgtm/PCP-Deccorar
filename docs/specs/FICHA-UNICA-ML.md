# FICHA-UNICA-ML — uma ficha técnica só para as persianas padrão do Mercado Livre

> **STATUS · 10/11/2026 — RASCUNHO, esperando o dono.** Nada construído.
> Nasceu da conversa de 10/11/2026. O dono: *"A ideia é BK ML. Quando for
> mudar é acrescentar o item em todos os SKUs e remover se for necessário"*.
> Blackout e screen usam **o mesmo tubo, base, corrente e kit** (o dono); só o
> tecido muda. `NOVIDADE` · risco 🔴 (custo, compra e uma coluna no cadastro).

---

## 1. O que já existe e o que falta

**Já existe:** a ficha é do **modelo**, e não do SKU (`CLAUDE.md` §7-B, *"a
ficha é fórmula, não lista"*). Uma linha lançada no modelo Rolô vale para
**todos** os SKUs dele, e um SKU novo amanhã nasce com ela. Acrescentar a caixa
de papelão é **uma linha**: material "Caixa de papelão" (o preço por metro na
oferta do fornecedor), fórmula `largura / 100`, e o custo de cada persiana é a
largura × o preço do metro. Remover a linha tira de todos.

**Falta uma coisa só:** a linha do **tecido** aponta uma **família fixa**
(blackout) e escolhe só a **cor** pelo SKU (`ficha_dominio.resolverTecido`). O
**tecido** do SKU (`skus.tecido_codigo`: BLACKOUT, SCREEN) não é lido. Então:

- com o screen no modelo Rolô, a ficha procura **blackout** na cor dele — o
  custo, a compra e a lista de corte saem como se fosse blackout;
- com o screen num modelo separado, tubo, base, corrente e kit têm de ser
  lançados duas vezes, e mudar um material é mudar em dois lugares — o que o
  dono não quer.

## 2. A proposta

1. **A linha do tecido pode apontar "o tecido do SKU"**, em vez de uma família
   fixa. A família de material sai do cadastro do tecido do SKU, e a cor
   continua saindo do SKU, como hoje. A escolha da bobina por custo por peça
   (§7-B) não muda.
2. **O cadastro de tecido (tela 402) ganha "família de material"**: BLACKOUT →
   a família dos componentes de blackout; SCREEN → a família dos componentes de
   screen. Coluna `tecido.familia`, no `CREATE` e no `ALTER` guardado (§17).
3. **Todos os SKUs padrão do ML no mesmo modelo** (o Rolô — modelo é o
   mecanismo, e o screen também é rolô; §7, *"tecido não é modelo"*), cada um
   com o seu tecido. Isso é **cadastro**, não código: pela 402, SKU a SKU, ou por
   um script que simula, mostra e grava com backup (pergunta 3).
4. **Tecido do SKU sem família cadastrada** não vira zero nem blackout: a linha
   sai com erro dizendo o que falta, o custo fica indefinido (regra 4 do §7-B) e
   o SKU vai para pendência na compra e para "ficou fora" no Corte e separação.
5. A linha de família fixa **continua valendo** para quem já a usa: nada muda na
   ficha de hoje até alguém trocar a linha do tecido para "o tecido do SKU".

## 3. O que fica de fora

- Medida de corte diferente por tecido (o screen corta igual ao blackout? —
  pergunta 2). Se for diferente, a fórmula do corte pode usar o tecido, e isso
  vira outra fase.
- Edição em massa do cadastro de SKU (não foi o pedido: o pedido é a ficha).
- O sob medida.

## 4. Alçada

- **Telas novas: nenhuma.** O campo novo fica na 402 (cadastro de tecido, chave
  que já salva: `sku.cadastrar`) e a escolha "o tecido do SKU" na 404
  (`modelo.cadastrar`).
- **Ações novas: nenhuma. Setores novos: nenhum.**

## 5. Perguntas ao dono

1. O nome **"BK ML"** é o nome do modelo na tela? Recomendação: manter o modelo
   **Rolô** (é o mecanismo) e chamar a ficha de "ficha do Rolô — padrão ML" só
   na conversa, porque "BK" é blackout, e o screen não é blackout (§7: nunca
   deduzir nada do prefixo do código).
2. O **screen corta igual** ao blackout (largura − 3 × altura + 15, e +10 na
   1,80)?
3. Os SKUs **SCREEN** de hoje: estão em qual modelo? Movo para o Rolô por script
   (simula, mostra a lista, grava com backup) ou alguém faz pela 402?
4. Existe componente de **screen** cadastrado na 501 (com família e cor)? Sem
   ele, o screen fica como "falta cadastrar o tecido", com a regra 4.
