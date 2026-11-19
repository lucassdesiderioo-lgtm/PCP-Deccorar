# LIMPEZA — CAIXAS QUE SAÍRAM SEM CONFERÊNCIA

> **STATUS · 19/11/2026 — EM CÓDIGO, falta subir e aplicar** · aprovada pelo dono em 19/11/2026
> - Construída em 19/11/2026: `baixa_dominio.baixar` ganhou `opcoes` (`em`, `motivo`), e o
>   `fechar_saida_passivo.js --nao-bipadas` dá a baixa na mesma transação; `teste_saida.js`
>   (87 casos) com os casos novos escritos antes, reprovando no código de antes.
> - ③ REVISÃO (três rodadas): a caixa de várias com item cancelado (`cancelada_varias=1`)
>   entrava e baixava a persiana cancelada — ficou de fora (é a L6); SKU fora do cadastro
>   passou a ser dito na simulação e recusado antes do `--aplicar`; o resultado e a saída
>   contam só o que fechou de fato, e a saída vazia não nasce.
> - Divergência anotada: a caixa de várias **já decidida na Mesa** também fica de fora (a
>   spec não falava dela); fazê-la entrar seria regra nova, para o dono decidir.
> - `REGRA` 🔴: mexe em estoque. Muda a R-PAS-02.
> - Uma fase. Nenhuma tela, ação ou setor novo.
> - Desenhada no Projeto em 19/11/2026, a partir do pedido do dono: *"preciso
>   dar baixa na lista da conferência"*.

---

## 1. O problema

Em 19/11/2026 a tela 204 mostra **187 caixas impressas sem conferência**,
impressas de 10/11 em diante. O dono confirmou que **todas já saíram** da
fábrica. O setor da expedição (Renato, Valdiane e Edivaldo) não bipou na
Conferência nem fechou a saída do caminhão nesses dias.

Desde 22/10/2026 a baixa do estoque acontece na conferência (CLAUDE.md §2),
então essas caixas **nunca baixaram**:

- o saldo de cada SKU está alto no número de peças dessas caixas;
- a tela azul pode estar pedindo menos produção do que devia;
- o **livre** está certo, porque já desconta a caixa impressa: a trava da
  Etiqueta de Venda e o inventário não foram afetados.

Nenhuma ferramenta de hoje resolve:

- "Fechar conferências antigas" (R-COR-07) só pega caixa que já baixou.
  `node fechar_conferencias_antigas.js --ate 2026-11-18` respondeu
  *"Nada a fechar"* em 19/11/2026.
- `fechar_saida_passivo.js --nao-bipadas` (R-PAS-02) fecha a caixa e não mexe
  em estoque: foi escrito quando a baixa era na impressão.

## 2. A regra

**Antes (R-PAS-02):** o passivo das caixas nunca bipadas fecha a caixa e não
mexe em estoque.

**Depois:** o mesmo script dá a **baixa de verdade** na caixa que nunca baixou,
pelo dono único da baixa (`baixa_dominio.baixar`), o mesmo caminho do "foi no
caminhão" da saída. A caixa que já tinha baixado continua só sendo fechada.

| # | Regra |
|---|---|
| L1 | Entra a caixa `embalado`, nunca conferida, fora de saída e do carro, fora do modo teste, **impressa até a data de corte**, com despacho até hoje. É o critério que o `--nao-bipadas` já usa. |
| L2 | A data de corte é obrigatória e **não pode ser hoje**: o máximo é ontem. A caixa impressa hoje é trabalho da conferência. |
| L3 | A baixa é **−1 por persiana**, uma linha no livro por SKU da caixa, uma vez só. Sob medida não baixa. Caixa que já baixou não baixa de novo. |
| L4 | `baixado_em` recebe o **carimbo de saída da caixa** (o dia do despacho, como o script já calcula), nunca a hora da rodada: o gráfico de estoque não pode mostrar um pico falso. A linha do livro fica com a hora real e o motivo. |
| L5 | `conferido_por` e `conferido_em` ficam **vazios**. Ninguém conferiu, e a caixa conta como "saiu sem conferência". |
| L6 | Venda cancelada não entra. |
| L7 | Tudo numa transação, com backup (`await db.backup()`) antes do `--aplicar`. Rodar de novo não acha nada. |
| L8 | O saldo pode ficar negativo e fica negativo (R-EST-08). A simulação avisa quais SKUs. |

## 3. A simulação (sem `--aplicar`)

Lista caixa por caixa e, no fim, um quadro por SKU: peças a baixar, saldo
antes, saldo depois e livre (que **não pode mudar**). Diz quantas caixas já
tinham baixado e quantas recebem a baixa agora. A última linha não é um
comando executável sozinho.

## 4. Fase única

1. Teste escrito **antes**, no `teste_saida.js`:
   - a caixa nunca baixada baixa por peça; a já baixada não baixa de novo;
   - a caixa de várias persianas baixa N; sob medida não baixa;
   - a impressa hoje e a cancelada ficam fora; o corte hoje é recusado;
   - `baixado_em` é o carimbo de saída, e não a hora da rodada;
   - o livro fecha (`SUM(delta) = skus.estoque`);
   - o livre de cada SKU é igual antes e depois;
   - a segunda rodada não acha nada.
2. Mudança no `fechar_saida_passivo.js` (modo `--nao-bipadas`) e nos textos
   dele que dizem "a baixa aconteceu na impressão".
3. Rodar também `teste_livro.js`, `teste_baixa_conferencia.js` e
   `teste_conferencia_antiga.js`.
4. Papel: R-PAS-02 em `docs/regras/carregamento.md`, a linha em
   `docs/DECISOES.md` e o `CLAUDE.md` §8-B.

**No dia de aplicar**, fora do horário de expedição e sem contagem de
inventário em andamento:

1. O dono desfaz a correção #64 (caixa #4581) na tela 205, para ela entrar no
   bloco.
2. `node fechar_saida_passivo.js --nao-bipadas --ate 2026-11-18` (simula). O
   dono confere o quadro.
3. O mesmo comando com `--aplicar`.
4. Conferir que a tela 204 zerou o contador "caixas impressas sem
   conferência" e que a Conferência perdeu a linha âmbar.

## 5. Alçada

Telas novas: nenhuma · Ações novas: nenhuma · Setores novos: nenhum.
É um script de terminal, rodado pelo dono no servidor.

## 6. Onde mora

Nenhuma tela, aba ou função de tela nova. O script é do módulo Expedição
(200), ao lado das outras limpezas de passivo da saída.

## 7. Fica de fora

- A trava do dia seguinte: não conferir hoje sem fechar o dia anterior
  (próxima `REGRA`, decidida pelo dono em 19/11/2026, ainda sem desenho).
- O aviso em Pendências e na TV, e o fechamento atrasado sem foto.
- Os 2 "pendentes vencidos" da tela 204.
- O botão "Fechar conferências antigas em bloco…" da 204, que perde a ação ao
  navegar para a 205 (`CONSERTO` à parte).
- O texto do formulário da Mesa que ainda diz "a baixa já aconteceu na
  impressão".
