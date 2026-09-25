# O caminhão da coleta levando caixa da agência

```
STATUS
Situação: RASCUNHO — aguarda as decisões do dono (§5) e a aprovação
Criada em: 25/09/2026
Fases: 1 ☐ (fase única)
Risco: 🔴 (dado de produção e schema: muda a modalidade de um volume e a conta
        do fechamento com o motorista)
Nada no código.
```

## 1. O que acontece hoje na fábrica

> *"O caminhão coleta persianas antes da data, e às vezes ele coleta até as
> peças que a gente deveria levar na agência."* — o dono, 25/09/2026

A primeira metade já está certa no sistema (CLAUDE.md §8-B): a caixa de coleta
futura vai pro canto e sai no fechamento, junto com as do dia.

**A segunda metade não tem caminho.** Uma caixa de agência:

1. é bipada **no carro** (`estagio='carregado'`, `modalidade` agência). Ela não
   entra no canto da coleta nem na conta do fechamento;
2. o motorista do ML bipa a caixa no celular dele, porque a etiqueta é do ML e
   vale para qualquer porta;
3. no fechamento o celular diz, por exemplo, **30** e o sistema tem **28** no
   canto. O fechamento acusa **divergência** e mostra a lista do canto, onde
   aquelas 2 caixas não estão.
4. A única saída é o **"liberar assim mesmo"**: o fechamento fica gravado como
   divergente e vai para a auditoria, sem dizer que as 2 eram da agência.

## 2. Por que isso é problema, e não detalhe

- **Divergência que se repete vira paisagem** (armadilha #6). O fechamento
  existe para achar a caixa **sumida**. Se toda semana ele diverge por um motivo
  conhecido e inofensivo, a equipe aprende a liberar sem conferir, e a caixa
  sumida de verdade passa junto.
- **O carro mente.** A caixa que o caminhão levou continua contada no "No carro
  X de Y" e sai como se tivesse ido no carro. Quem leva o carro pra agência
  procura uma caixa que não está lá.
- **O adiantado conta pela porta errada.** Na agência a saída é o bipe no carro
  (`carregado_em`). Se a caixa foi no caminhão dias depois, a data de saída
  registrada fica errada.

## 3. A proposta: **"vai no caminhão"**, bipado no card da coleta

A caixa da agência que o caminhão vai levar é **bipada no card violeta da
coleta**, e não no do carro. O sistema:

1. pergunta, em tela âmbar: *"Esta caixa é da AGÊNCIA. Vai no caminhão da
   coleta?"* — **Sim / Não**. A decisão é de quem está com a caixa na mão;
2. no **Sim**:
   - troca `lote.modalidade` para `'coleta'`;
   - grava `modalidade_era='agencia'`, `trocada_por` e `trocada_em`
     (colunas novas);
   - registra na auditoria (`coleta_leva_agencia`);
   - a caixa vai pro canto (`carregado`, `retirado_em` vazio). Se ela já estava
     no carro, sai do carro e vai pro canto;
3. no fechamento, ela conta como qualquer caixa do canto, e o número bate com o
   celular do motorista;
4. a tela do fechamento e o histórico mostram *"2 eram da agência"*, para a
   troca não ficar invisível.

**Por que trocar a modalidade, e não criar uma exceção no fechamento:**
`carga.js` é o dono único de "isto é coleta?" (§8-B). Com a modalidade trocada,
o que depende dela passa a se comportar certo sozinho:

| Onde | Depois da troca |
|---|---|
| "No carro X de Y" e a lista do carro | a caixa sai, e o carro deixa de procurar por ela |
| relógio de despacho da agência | deixa de cobrar essa caixa |
| canto e fechamento (`AGUARDA_CAMINHAO`) | a caixa entra na conta que o motorista bate |
| "Peças adiantadas" (`SAIDA()`) | a saída passa a ser o caminhão levando (`retirado_em`) |

Uma exceção dentro do fechamento seria uma segunda régua de "isto é coleta?".
A caixa ficaria no carro numa tela e no caminhão na outra.

**E a origem não se perde:** `modalidade_era` guarda que ela nasceu agência.
Relatório que um dia quiser saber quantas vezes o caminhão levou caixa da
agência lê daí.

## 4. O que fica de fora

- **Coleta → agência** (o caminhão não veio e a caixa vai no carro). Não foi
  pedido. Se acontecer, é outra spec.
- **Adivinhar pela divergência.** O fechamento não vai concluir sozinho que "as
  2 a mais devem ser da agência". Ele só conhece as caixas bipadas; supor seria
  a trava que acusa o inocente (armadilha #10) ao contrário.
- **Travar.** Nenhuma caixa da agência fica impedida de ir no carro.

## 5. Decisões do dono (em aberto)

1. **Em que momento o caminhão pega a caixa da agência?**
   (a) Da prateleira, antes de ir pro carro;
   (b) do carro, já bipada;
   (c) as duas coisas acontecem.
   A proposta cobre as três, mas o texto da tela muda.
2. **Quem pode confirmar "vai no caminhão"?** Proposta: quem já opera o
   Carregamento, sem chave nova e com auditoria. Exigir admin travaria o caso
   normal com o motorista esperando (armadilha #6).
3. **O "liberar assim mesmo" continua existindo?** Proposta: sim, porque o
   caminhão não pode ficar preso. Com este caminho ele volta a ser raro, e raro
   é o que faz alguém olhar.
4. **Caixa de agência com despacho hoje e hora marcada:** se o caminhão leva,
   ela sai do relógio da agência. Confirmar que é isso mesmo que a fábrica
   quer.

## 6. Como vai ser testado (quando aprovada)

Teste escrito **antes** do conserto (risco 🔴), em `teste_carga.js`:

- caixa da agência bipada no card da coleta **sem** confirmar não muda nada;
- com confirmação: a modalidade vira coleta, `modalidade_era` é gravado, sai do
  "No carro X de Y" e entra no canto;
- caixa já bipada no carro também pode ir pro canto;
- fechamento com 28 de coleta + 2 trocadas contra 30 do motorista **não**
  diverge, e mostra que 2 eram da agência;
- a saída adiantada da caixa trocada conta pelo `retirado_em`, não pelo bipe do
  carro;
- a auditoria registra a troca com quem fez;
- caixa de coleta bipada no card da coleta continua como sempre (não pergunta
  nada).

E **abrir a tela**, no tablet: a pergunta âmbar e o histórico do fechamento são
texto montado, e nenhum teste de rota os enxerga (§2).
