# Regras — estoque, revisão e embalagem

> Cada cartão é **uma regra que vale hoje**, com o motivo, as exceções e o teste
> que impede alguém de desfazê-la. O porquê longo — o defeito que a provocou, as
> datas, as conferências — está em
> [`docs/historia/estoque.md`](../historia/estoque.md), procurando pelo número da
> armadilha.
>
> **⚠ sem teste** quer dizer que nada no código impede alguém de desfazer a
> regra sem perceber: hoje ela é protegida só por este papel.
>
> Formato e regras do formato: [`README.md`](README.md).

---

## Onde o estoque entra e sai

| Evento | Saldo | Linha no livro |
|---|---|---|
| Peça **revisada** | nenhum | nenhuma |
| Peça **embalada** (kit conferido) | **+1** | `embalagem` · `montagem:<id>` |
| **Etiqueta de venda** impressa | **−1 por peça** | `etiqueta` · `lote:<id>`, uma por SKU da caixa |
| Etiqueta de venda **reimpressa** | nenhum | nenhuma |
| Peça **sob medida** | nenhum, nos dois lados | nenhuma |

---

## O saldo e o livro

### R-EST-01 · Revisar não mexe no estoque
- **Regra:** `POST /api/revisao` grava o tempo e põe a peça na `fila` como `aguardando`. O saldo e o livro não andam.
- **Por quê:** a peça revisada ainda não está pronta — falta embalar e conferir o kit. Decisão do dono: *"ela só pode passar a ser estoque depois da montagem/embalagem"*.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_revisao.js` (24 casos; reintroduzir o +1 reprova 5).
- **Status:** no ar · teste desde 20/10/2026.
- **História:** armadilha #1 e #2.

### R-EST-02 · A embalagem é onde a peça vira estoque (+1)
- **Regra:** o fim da embalagem soma +1 por um movimento `embalagem` no livro. As quatro escritas (`montagem`, `fila`, `skus`, `producao`) entram juntas ou nenhuma entra.
- **Por quê:** é o primeiro momento em que a persiana está pronta e ensacada. Escrita pela metade deixava a peça na prateleira e em lugar nenhum do sistema.
- **Exceções:** sob medida (R-EST-05).
- **Teste que trava:** `teste_montagem.js` (64) · `teste_livro.js` (65).
- **Status:** no ar desde 17/09/2026.
- **História:** armadilha #26.

### R-EST-03 · A etiqueta de venda RESERVA; a conferência baixa uma por PEÇA
- **Regra:** imprimir a etiqueta de venda **não mexe no saldo**: a caixa fica `embalado` sem `baixado_em` e **reserva** as persianas dela. A baixa (−1 de cada persiana, uma linha `conferencia` por SKU, referência `lote:<id>`) acontece **uma vez só**, quando a caixa é conferida — no bipe da área ou do canto (`carreg_route.js`), ou, se ela saiu sem ninguém conferir, no "foi no caminhão" do fechamento da saída (`saida_route.js`). `baixa_dominio.js` é o dono único da baixa, da reserva e do **livre** (saldo − reservado). Sem peça **livre**, não imprime.
- **Por quê:** decisão do dono (22/10/2026, spec `CONFERENCIA-E-BAIXA`, D1): a venda cancelada entre a impressão e o caminhão deixava o saldo baixo até alguém lembrar de devolver. Baixar uma numa caixa de três continua deixando duas peças fora do sistema — a conta segue por PEÇA (#23).
- **Exceções:** sob medida (R-EST-05): não reserva e não baixa, mas a caixa fica marcada como baixada. As caixas impressas **antes** de 22/10/2026 baixaram na impressão: a **virada** (`config.virada_baixa_conferencia`, uma vez só) deu a elas `baixado_em = embalado_em`, e a conferência não baixa de novo. A caixa que **sobrou** (R-REC-01) volta +1 por peça pelo mesmo dono (`baixa_dominio.devolver`, movimento `sobra`), e só se já tinha baixado.
- **Teste que trava:** `teste_baixa_conferencia.js` (69) · `teste_etiqueta.js` (84) · `teste_livro.js` (65).
- **Status:** no ar desde 22/10/2026 (fase 2-A, PR #218) · ✅ a primeira caixa conferida baixou o estoque no mesmo dia (relato do dono) · antes disso a etiqueta baixava.
- **História:** CLAUDE.md §2 e §5, armadilha #23 · spec `CONFERENCIA-E-BAIXA`.

### R-EST-04 · Reimprimir não baixa
- **Regra:** `POST /api/reimprimir` só grava `lote.reimpressoes` e `lote.reimpresso_em`. O saldo não anda.
- **Por quê:** papel preso, etiqueta borrada e folha perdida são o mesmo volume para o mesmo cliente; a reserva (e, depois da conferência, a baixa) já é do volume.
- **Exceções:** nenhuma.
- **Teste que trava:** ⚠ **sem teste** do saldo. `teste_saida.js` trava só que a reimpressão não troca quem imprimiu.
- **Status:** no ar.
- **História:** armadilha #1-B.

### R-EST-05 · Sob medida não soma nem baixa
- **Regra:** SKU de modelo com `sob_medida=1` não ganha +1 na embalagem nem −1 na etiqueta, e não passa pela trava de estoque. O saldo dele é sempre zero.
- **Por quê:** a peça é feita contra o pedido; não existe antes da venda nem sobra depois. Baixar de um lado só abriria um buraco por venda.
- **Exceções:** nenhuma. ⚠ **Não marque `sob_medida` no modelo `ROLO`**: são 29 dos 30 SKUs.
- **Teste que trava:** `teste_livro.js` (impressão e conferência) · `teste_montagem.js` §8 (a embalagem) · `teste_regras_estoque.js` (regra 16, com o servidor de verdade).
- **Status:** no ar · a flag só pega quando o modelo está marcado no banco (armadilha #30, CLAUDE.md §7) · ⚠️ **até 04/11/2026 a EMBALAGEM somava +1 para sob medida** — o teste do livro não chamava a embalagem; achado pelo `teste_regras_estoque.js` e consertado (CONSERTO, decisão do dono). O saldo que o SOBMEDIDA já acumulou em produção **não foi mexido**: confira em Admin → Estoque e zere por ajuste, com motivo.
- **História:** CLAUDE.md §7, armadilhas #6 e #30.

### R-EST-06 · O saldo só anda pelo livro
- **Regra:** `estoque_dominio.js` é o único que escreve em `skus.estoque`, sempre junto com uma linha em `movimento_estoque`, na mesma transação. O movimento guarda o **delta**, nunca o saldo. `SUM(delta) = skus.estoque` para todo SKU.
- **Por quê:** o saldo tinha sete donos e, quando errava, não sobrava rastro de quem mexeu. `skus.estoque` continua existindo como cache que as telas leem.
- **Exceções:** a restauração da foto do modo teste, que mora **dentro** do domínio (`restaurarFoto`).
- **Teste que trava:** `teste_livro.js` (65; exige a soma depois de cada passo e varre o código recusando `UPDATE skus SET estoque` fora do domínio).
- **Status:** no ar desde 21/09/2026.
- **História:** "O LIVRO DE MOVIMENTOS".

### R-EST-07 · O domínio não abre transação
- **Regra:** nenhuma função do `estoque_dominio.js` abre transação; quem chama abre.
- **Por quê:** a embalagem são quatro escritas e a caixa de pacote são N baixas que valem como uma. Transação dentro do domínio tiraria de quem chama a chance de desfazer tudo.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_livro.js`.
- **Status:** no ar desde 21/09/2026.

### R-EST-08 · Saldo negativo fica negativo
- **Regra:** nenhuma escrita de saldo corta em zero. Negativo aparece com chip próprio na aba Estoque, separado de "zerado".
- **Por quê:** o corte em zero apagava o único sinal de peça que saiu sem registro. Zerado é SKU que acabou; negativo é para investigar.
- **Exceções:** nenhuma. Na operação normal quem impede o negativo é a trava da Etiqueta de Venda.
- **Teste que trava:** `teste_livro.js` · `teste_estoque.js`.
- **Status:** no ar desde 21/09/2026 · o chip entrou em 22/09/2026.

### R-EST-09 · O cadastro de SKU não mexe em saldo
- **Regra:** `POST /api/skus` ignora o campo `estoque`, mesmo presente e mesmo no SKU novo, e **diz** que ignorou (`estoque_ignorado`). Número impossível nos outros campos é recusado, nunca cortado.
- **Por quê:** mudar saldo pelo cadastro não deixava motivo nem rastro. SKU novo nascendo com 5 e livro vazio quebraria a soma.
- **Exceções:** nenhuma. Saldo se corrige por ajuste (R-EST-20) ou conferência (R-EST-16).
- **Teste que trava:** `teste_skus.js` (63).
- **Status:** no ar desde 21/09/2026.
- **História:** CLAUDE.md §6, armadilha #25.

### R-EST-10 · A abertura do livro aconteceu uma vez só
- **Regra:** cada SKU com saldo ganhou uma linha `abertura` no deploy do livro, marcada em `config.livro_abertura`. Com a marca, ela nunca roda de novo.
- **Por quê:** rodando a cada boot, o livro passaria a dizer o dobro do saldo.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_livro.js`.
- **Status:** aplicada em produção em 21/09/2026.

### R-EST-11 · O extrato mostra tudo que moveu o saldo, e diz se o livro bate
- **Regra:** o botão **extrato** da aba Estoque (`GET /api/estoque/extrato/:codigo`) lista todo movimento e escreve se a soma do livro bate com o saldo. O botão **histórico** mostra só o ajuste feito à mão.
- **Por quê:** é onde aparece primeiro, com dado real, quem voltar a escrever na coluna por fora.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_livro.js` (a rota) · ⚠ **sem teste** de que o botão existe na tela.
- **Status:** no ar desde 22/09/2026.

---

## A revisão

### R-REV-01 · A tela de revisão tem três modos, e a cor é a trava
- **Regra:** `/operador` abre exigindo a escolha: **vermelho** (pedidos de hoje), **azul** (produção pra estoque), **âmbar** (devoluções). O modo fica salvo por aparelho (`rev_modo`) e o botão "Trocar" força escolher de novo.
- **Por quê:** a cor impede revisar meia hora no modo errado. Ela espelha os carrinhos físicos separados na produção.
- **Exceções:** nenhuma.
- **Teste que trava:** ⚠ **sem teste**.
- **Status:** no ar.

### R-REV-02 · SKU fora da lista no modo vermelho: avisa e deixa passar
- **Regra:** bipar no vermelho um SKU que não está nos pedidos do dia mostra aviso **no início** da revisão, deixa revisar, e a peça conta como estoque. Nunca bloqueia.
- **Por quê:** operador parado esperando alguém resolver custa mais que um número classificado de outro jeito.
- **Exceções:** nenhuma.
- **Teste que trava:** ⚠ **sem teste**.
- **Status:** no ar.

### R-REV-03 · A tela azul é ordenada por prioridade, e cada linha diz por quê
- **Regra:** com `config.ordem_por_falta = 0` (o padrão), quatro degraus, nesta ordem: 1) cliente com prazo até amanhã (a venda **atrasada** conta aqui), 2) sem estoque, 3) cobertura abaixo de metade dos dias de cobertura, 4) abaixo do alvo. **Com a chave ligada (fase 4 da `PLANEJAMENTO-VENDAS-FUTURAS`, 07/11/2026), a ordem é pela data em que a peça vai faltar**: a data mais cedo primeiro; no mesmo dia, venda feita antes de reposição; no mesmo dia e tipo, mais peças faltando primeiro. Venda feita: o primeiro dia de envio que o livre não cobre (a conta da aba por dia). Reposição: `hoje + (livre − comprometido) ÷ ritmo` (pelo livre desde 09/11/2026, R-PLN-06). O degrau 2 "sem estoque" e a cobertura também contam pelo livre. Cada linha traz o `motivo` — *"faltam 3 para ter 10/11 (vendidas)"* ou *"acaba qua 12/11 pelo ritmo (3,5/dia)"*. Sem venda na janela, a cobertura e a data são vazias, nunca zero.
- **Por quê:** ordenar pelo que falta põe em cima o SKU que mais gira, que quase nunca é o que acaba primeiro. E a fábrica precisa andar 1, 2 ou 3 dias à frente das vendas: terminado o de hoje, a primeira linha é a falta de amanhã.
- **Exceções:** a chave nasce **desligada** e só o **Admin Geral** (o setor, pelo `ehAdminGeral`) liga ou desliga (403 para os outros, antes de gravar qualquer campo do mesmo pedido). O modo vermelho e o âmbar não mudam.
- **Teste que trava:** `teste_vendas_futuras.js` (a ordem, os três desempates, o motivo, o caso do meio-dia, a chave desligada por padrão e o 403).
- **Status:** os degraus no ar · a ordem pela falta no ar desde 07/11/2026 (PR #313), **desligada** até o dono ligar.

### R-REV-04 · Sob medida não tem alvo
- **Regra:** o alvo calculado de SKU sob medida é zero; ele só pede produção quando há venda comprometida.
- **Por quê:** com alvo, o SKU ficaria para sempre na tela azul pedindo peça que ninguém encomendou.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_estoque.js`.
- **Status:** no ar.

### R-REV-05 · A ordem urgente atendida pelo estoque não cobra produção
- **Regra:** `ordem_dia.js` é o único que responde o que falta das ordens de hoje. A parte urgente cuja venda já saiu, ou que o estoque cobre, aparece em âmbar como "saiu do estoque — nada a produzir". Só `a_produzir` fica vermelho e toca o alarme. O tile, o aviso e a TV leem a mesma conta.
- **Por quê:** em 08/09/2026 a tela cobrava 4 peças urgentes com todas as vendas já despachadas.
- **Exceções:** ordem **manual** nunca é "atendida", porque não tem venda atrás. ⚠ Não mande a embalagem azul abater a ordem.
- **Teste que trava:** `teste_ordem_dia.js` (17) · `teste_estoque.js` (caso da TV).
- **Status:** no ar desde 08/09/2026.
- **História:** armadilha #20.

### R-REV-06 · Peça com problema volta para a produção e não entra na fila
- **Regra:** durante a revisão, "Peça com problema" grava em `rejeicao` o motivo, o tempo até a detecção, o modo e quem rejeitou — o nome em `usuario` e, desde 04/11/2026, o `usuario_id` ao lado, pelo `quem.js`; sem login, 401. A peça não vai para a embalagem. Os motivos são cadastro (`listas`, tipo `rejeicao`). **É só para defeito de verdade**: o bipe errado se resolve no "Cancelar revisão" (R-REV-08).
- **Por quê:** a peça com defeito não pode virar estoque.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_revisao.js` (seção 15: quem rejeitou e o 401) · ⚠ que a peça rejeitada não entra na fila continua **sem teste**.
- **Status:** no ar; o `usuario_id` em código em 04/11/2026.

### R-REV-07 · Bipe de fim abaixo de 15 s é recusado, e a revisão continua
- **Regra:** o bipe que fecharia uma revisão com menos de `config.rev_minimo_seg` segundos (padrão **15**, editável sem deploy) é **recusado, não perguntado**. A tela apita, diz "rápido demais — a revisão continua" e o cronômetro segue; o operador termina e bipa de novo. O `POST /api/revisao` recusa também (409, `motivo:'rapido_demais'`), sem `revisao` e sem `fila`, e grava o evento `rapido_demais` em `revisao_evento`, com quem bipou.
- **Por quê:** o bipe duplo acidental gravava uma revisão de 1 s e mandava para a embalagem uma peça que ninguém revisou. Nos 30 dias até 04/11/2026 a revisão de verdade começa por volta de 20 s; abaixo de 15 s eram 23 revisões, quase só bipe acidental.
- **Exceções:** ⚠ **o limite NÃO é 1 minuto**: quase metade das revisões reais fica abaixo de 60 s, e trava que dispara no caso normal vira desvio (#6).
- **Teste que trava:** `teste_revisao.js` (seção 7).
- **Status:** em código em 04/11/2026 (spec `QUEM-FEZ-E-REVISAO`, fase 1).

### R-REV-08 · "Cancelar revisão" zera a revisão em andamento
- **Regra:** com revisão em andamento, o botão "Cancelar revisão" (ao lado de "Peça com problema") zera tudo num toque, sem motivo e sem confirmação. Nada vai para a fila, nada é contado; fica o evento `cancelada` em `revisao_evento`, com quem cancelou.
- **Por quê:** o erro que ele resolve é de um segundo atrás.
- **Exceções:** ⚠ **não é a "Peça com problema"**: aquela grava defeito em `rejeicao`, e cada bipe errado faria o número de qualidade da fábrica mentir.
- **Teste que trava:** `teste_revisao.js` (seção 9).
- **Status:** em código em 04/11/2026.

### R-REV-09 · "Desfazer última": só a própria, só do dia, só antes de embalar, uma vez
- **Regra:** depois que uma revisão fecha, o botão "Desfazer última revisão" mostra o que vai desfazer (`Desfazer BK150150BEGE · 1,50 × 1,50 BEGE · revisada há 40s?`) e pede um toque de confirmação. A "última" é a revisão mais recente **com o `usuario_id` de quem está logado**, de hoje — não a do tablet. Numa transação só: copia a revisão inteira para `revisao_evento` (`desfeita`, com quem), **apaga** a linha de `revisao` e a linha de `fila` ligada a ela (`fila.revisao_id`), **só se** ela estiver `aguardando`. Recusa (409, nada muda): embalada ou fora da fila, de outra pessoa, de outro dia, que não é a última, ou — em modo teste — revisão de verdade.
- **Por quê:** não havia como voltar um bipe errado. **Apagar, e não marcar `desfeita=1`**: a revisão é contada em cinco lugares (`/api/revisao/hoje`, `ordem_dia.js`, `st_route.js`, `ger_route.js`, painel), e uma coluna nova obrigaria cada um a lembrar de filtrar. O rastro inteiro fica no evento. A falta da ordem do dia (#20) volta ao número certo sozinha.
- **Exceções:** ⚠ **uma vez só**: depois de desfazer, o botão some até a próxima revisão fechar — uma pilha de desfazer vira jeito de apagar o dia (a conta: evento `desfeita` da pessoa com `revisao_id` maior bloqueia). ⚠ Embalada, a peça já é estoque (+1), e desfazer seria mexer em saldo: não é desta regra. As linhas de fila anteriores a 04/11/2026 não têm `revisao_id` e não se desfazem.
- **Teste que trava:** `teste_revisao.js` (seções 10 a 14 e 17).
- **Status:** em código em 04/11/2026.

---

## A embalagem

### R-EMB-01 · Sem o bipe do kit, a embalagem não fecha
- **Regra:** são três bipes: SKU, kit, SKU. Sem o kit, o terceiro é recusado com "⚠ FALTOU O KIT" — e a recusa é do **servidor**, não só da tela.
- **Por quê:** esquecer o kit era motivo recorrente de devolução. Aviso só na tela não protege quem chama a rota por fora.
- **Exceções:** o código do kit é conferido **quando vem**, e não exigido (R-KIT-03).
- **Teste que trava:** `teste_montagem.js`.
- **Status:** no ar desde 17/09/2026.
- **História:** armadilha #26.

### R-EMB-02 · Embalar não exige a peça estar na fila
- **Regra:** sem linha na `fila`, a embalagem grava e soma +1 do mesmo jeito, com `modo='estoque'`.
- **Por quê:** é o que torna seguro limpar a fila velha sem travar a bancada.
- **Exceções:** nenhuma. Isso **não** é defeito, embora pareça.
- **Teste que trava:** `teste_montagem.js`.
- **Status:** no ar.

### R-EMB-03 · Só a embalagem de fila "hoje" abate a ordem do dia
- **Regra:** a embalagem abate `producao` só quando consome fila de `modo='hoje'` (revisada na tela vermelha).
- **Por quê:** a tela azul é produção para estoque; abater ali faria o estoque parecer reposto com a peça indo para o cliente.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_montagem.js` · `teste_ordem_dia.js`.
- **Status:** no ar.

### R-EMB-04 · SKU sem cadastro não embala
- **Regra:** `POST /api/montagem` recusa SKU que não existe em `skus` (404) e a tela mostra a recusa.
- **Por quê:** era a única rota do fluxo sem essa conferência; a resposta dizia "Embalada ✓" e a peça sumia.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_montagem.js`.
- **Status:** no ar desde 17/09/2026.

### R-EMB-05 · A conferência da peça é no primeiro bipe da embalagem
- **Regra:** no bipe 1 a tela mostra em letra grande o que a peça é (`140 × 140 cm · Bege · Blackout · Rolô`), pelo formatador único `pecaTexto` de `public/sku.js`.
- **Por quê:** depois que o saco preto fecha, ninguém mais vê a persiana; é a única defesa contra a peça errada na caixa certa.
- **Exceções:** nenhuma.
- **Teste que trava:** ⚠ **sem teste** na tela de embalagem. `teste_estoque.js` e `teste_carga.js` travam os campos do `pecaTexto` em outras telas.
- **Status:** no ar.

### R-EMB-06 · Em modo teste, a embalagem consome fila de teste
- **Regra:** a fila consumida é filtrada pelo mesmo `teste` do momento.
- **Por quê:** a embalagem de teste consumia a linha real, e a peça verdadeira sumia quando os testes eram apagados.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_montagem.js`.
- **Status:** no ar desde 17/09/2026.

### R-EMB-07 · Limpar a fila apaga só o que espera
- **Regra:** tirar da fila (Mesa de correções ou `limpar_fila.js`) apaga só `situacao='aguardando'`. A linha `embalado` nunca é tocada.
- **Por quê:** a linha embalada é história de peça que virou estoque.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_correcao2.js` · `teste_correcao3.js`.
- **Status:** no ar.

### R-EMB-08 · A revisão e a embalagem gravam quem fez
- **Regra:** cada linha de `revisao` e de `montagem` grava `usuario_id` e `usuario_nome` de quem bipou. O nome vai como retrato: a revisão de ontem continua sendo de quem era, mesmo que a pessoa mude de nome no cadastro. O ALTER guardado está na rota que grava (`revisao_route.js`) e no dono da tabela (`mont_route.js`).
- **Por quê:** sem isso não há como medir a produtividade nem a autonomia de ninguém (dívida 9; R-ACE-06 da `ACESSOS-UNIFICADOS`).
- **Exceções:** as linhas de antes de 26/10/2026 ficam com a pessoa vazia — não há de onde tirar.
- **Teste que trava:** `teste_revisao.js` (seção 6, com a tabela de antes, sem a coluna; seção 8, sem login é 401) · `teste_montagem.js` (6-B; 6-C, sem login é 401 e nada muda — nem o saldo, nem o livro, nem a ordem do dia).
- **Status:** em código em 26/10/2026. Desde 04/11/2026 a revisão (fase 1) e a embalagem (fase 2) leem quem fez pelo `quem.js` (dono único, spec `QUEM-FEZ-E-REVISAO`) e recusam sem login (401), antes de olhar SKU e kit; a linha do livro do +1 (`movimento_estoque`) grava o mesmo quem. A Etiqueta de Venda entrou na fase 3 (05/11/2026, cartão R-QUEM-01). ~~Nenhuma tela mostra ainda~~ — desde 08/11/2026 a 905 Minha produção e a aba Por pessoa da 904 mostram (`produtividade_dominio.js`, CLAUDE.md §21).

---

## O kit e a etiqueta dele

### R-KIT-01 · Trocar o código do kit exige confirmar
- **Regra:** `POST /api/config/kit` recusa (409) a troca de um código já salvo sem `confirmar:true`, e nada é gravado. A troca vai para a auditoria com o código anterior.
- **Por quê:** o rolo já impresso para de bater na Embalagem, e quem descobre é a bancada com a peça na mão.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_kit.js` (133).
- **Status:** no ar desde 17/09/2026.

### R-KIT-02 · O código do kit não pode ser SKU de persiana
- **Regra:** o código do kit é recusado se for o código de um SKU de persiana.
- **Por quê:** a persiana ficaria impossível de embalar para sempre, porque o bipe dela seria lido como o kit.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_montagem.js` (seção 6).
- **Status:** no ar.

### R-KIT-03 · O código do kit é conferido quando vem, e não exigido
- **Regra:** a tela manda o código bipado e o servidor confere; chamada sem o campo passa. `public/kit_bipe.js` é o único que responde "isto é o kit?".
- **Por quê:** decisão do dono (17/09/2026): exigir travaria o tablet com a página antiga em cache. Exigir é o passo seguinte, depois de um refresh forçado nos tablets.
- **Exceções:** —
- **Teste que trava:** `teste_montagem.js`.
- **Status:** no ar desde 17/09/2026.

### R-KIT-04 · O que vai escrito na etiqueta do kit
- **Regra:** quatro textos em `config` (duas linhas, a legenda do QR e o link). Campo ausente não apaga o salvo. Link sem `https://` é recusado; fora do Drive, avisa e deixa salvar. O código de barras é sempre o `kit_codigo` — não há campo para ele. O texto encolhe até 3,6 mm e, se ainda não couber, é recusado: nunca sai cortado. Quem decide se cabe é a medida, e não a contagem de letras (a cerca é 15).
- **Por quê:** o impresso tem que sair igual ao que a Embalagem bipa, e texto cortado no papel ninguém na fábrica vê acontecer.
- **Exceções:** gravar vazio é permitido — é decisão de quem editou.
- **Teste que trava:** `teste_kit.js`.
- **Status:** no ar desde 17/09/2026.

### R-KIT-05 · A etiqueta do kit tem uma porta de impressão só
- **Regra:** imprime-se só por `POST /api/kit/etiqueta/imprimir`, que gera PDF de 100 × 35 mm, uma página por etiqueta, com o texto **salvo no banco**. Até 500 por lote. O upload de arte pronta saiu e não volta.
- **Por quê:** arquivo enviado é imagem morta: não acompanha a troca do código, e o rolo impresso por ele para de bipar sem ninguém saber que existia um segundo caminho.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_kit.js` (seção 12 trava que as rotas do upload não existem).
- **Status:** no ar desde 17/09/2026.

### R-KIT-06 · Imprimir o kit é permissão própria
- **Regra:** `kit.imprimir` é separada de `kit.editar` e não teve backfill: o dono marca quem pode.
- **Por quê:** editar decide o que a Embalagem bipa; imprimir só tira cópia.
- **Exceções:** o Admin Geral imprime por nível.
- **Teste que trava:** `teste_acesso.js`.
- **Status:** no ar desde 17/09/2026.

### R-KIT-07 · O QR do kit: tamanho fixo, módulo em ponto cheio, silêncio de 4 módulos
- **Regra:** a caixa do QR é 26 mm e não tem campo na tela. O módulo é arredondado para baixo, em ponto inteiro da ZD220 (e em pixel inteiro na prévia), limitado pelo envelope de 31 mm com o silêncio. O silêncio é 4 × o módulo, nunca um número fixo. As barras ficam com 58 mm. A prévia escreve o tamanho que sai **no papel**.
- **Por quê:** módulo em ponto quebrado e silêncio curto fazem o celular não ler, sem nada aparecer de errado na tela.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_kit.js` (varre as versões 1 a 10 do QR e remonta o QR a partir do PDF) · `teste_qr.js` (45, contra os valores publicados do padrão).
- **Status:** no ar · **conferida no papel em 22/09/2026**: o celular leu o QR e o leitor bipou.
- **História:** armadilha #31.

---

## A aba Estoque

### R-EST-12 · A falta de estoque tem uma conta só
- **Regra:** a aba Estoque, a tela azul, a TV e o gerencial leem a falta do `demanda_dominio.js` (`comprometido + alvo − livre`, com o alvo calculado ao vivo; até 09/11/2026 era `− estoque`, R-PLN-06). O alvo salvo aparece ao lado, em âmbar, quando diverge.
- **Por quê:** duas telas diziam "a repor" com números diferentes, as duas certas cada uma na sua régua.
- **Exceções:** na TV, "falta hoje" (ordens do dia, R-REV-05) e "precisa" (estoque) são duas colunas e não se somam.
- **Teste que trava:** `teste_estoque.js` (90).
- **Status:** no ar desde 01/09/2026.
- **História:** armadilha #12.

### R-EST-13 · O gráfico conta produção, venda e o que voltou
- **Regra:** "entrou" é a embalagem e "saiu" é a **baixa** (`lote.baixado_em`, desde 22/10/2026; antes era a impressão) (`fluxo_estoque.js`, dono único). As três barras contam **peça**: o "saiu" soma o `qtd` do `lote_item` de cada caixa baixada (sem `lote_item`, 1), a mesma régua do `media_dominio` — até 22/10/2026 ele contava caixa, e a de 2 persianas saía como 1. O "Vendi" do fechamento diário segue a mesma conta desde então; os dias já gravados na tabela `fechamento` ficaram como foram contados. A virada deu `baixado_em = embalado_em` às caixas de antes, então os dias passados não mudam. Ajuste e contagem ficam fora do gráfico, com número próprio. A sobra (R-REC-01) aparece desde 22/10/2026 como uma terceira barra, **"voltou"** (azul, empilhada sobre o "entrou"), contando **peça** (`SUM(delta)` das linhas `sobra` do livro, sem as de teste) no dia da sobra. Ela não entra no "entrou" (não é produção) e **não reescreve o "saiu"**: a caixa que baixou na terça e sobrou na quarta é saída na terça e "voltou" na quarta. O quadro "Hoje" diz quantas voltaram. O fechamento diário do Planejamento continua gravando `variou = entrou − saiu`.
- **Por quê:** o gráfico responde quanto a fábrica fez e quanto saiu, e não quanto a coluna variou.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_estoque.js`.
- **Status:** no ar desde 01/09/2026; a barra "voltou" e o "saiu" em peça desde 22/10/2026.

### R-EST-14 · O valor do estoque nunca esconde o que falta
- **Regra:** o custo vem do `ficha_dominio`. SKU sem custo não vira zero: o total sai como **piso** (`≥`). SKU sem peça mostra traço. Quem não tem `custo.ver` não recebe os campos de valor no JSON nem no CSV.
- **Por quê:** zero faria o estoque parecer mais barato do que é; esconder só na tela não esconde nada.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_estoque.js`.
- **Status:** no ar desde 01/09/2026.

### R-EST-15 · O reservado é leitura, não conta
- **Regra:** "reservado" é a soma das peças de volumes pendentes (vendidos, sem etiqueta) **e**, desde 22/10/2026, das caixas impressas que esperam a conferência (`baixa_dominio.reservados`). Aparece ao lado do saldo como "N sem etiqueta · N em caixa · N livres". ~~Não muda o `precisa`~~ — **desde 09/11/2026 o `precisa` conta pelo livre, e a venda com etiqueta sai do comprometido** (R-PLN-06): as duas coisas juntas, senão a mesma peça contaria duas vezes. Quem usa o livre (saldo − caixa impressa) é a trava da impressão, a urgência, o inventário, o número da Etiqueta de Venda e a coluna **Livre** da TV (`/painel`, com "+N em caixa" embaixo, desde 22/10/2026), e desde 09/11/2026 o `precisa`, a cobertura e o degrau "sem estoque" do `demanda_dominio` (R-PLN-06). Sob medida não tem reservado; bloqueado e cancelado não reservam; modo teste não reserva na coluna "sem etiqueta".
- **Por quê:** informa o que já está prometido sem criar uma segunda conta de produção.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_acuracidade.js` (23).
- **Status:** no ar desde 02/10/2026.

---

## A conferência (inventário) e o ajuste

### R-EST-16 · Toda correção aplica a DIFERENÇA sobre o saldo de agora
- **Regra:** a conferência e o ajuste aprovados aplicam `contado − saldo da contagem` (ou o delta pedido) sobre o saldo do momento da aprovação. Nunca gravam um número como saldo.
- **Por quê:** entre contar e aprovar a fábrica embala e imprime; gravar o contado apagaria em silêncio o que andou no meio.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_inventario.js` (80) · `teste_ajuste.js` (53) · `teste_contagem.js` (36).
- **Status:** no ar.
- **História:** armadilha #32.

### R-EST-17 · Quem conta não vê o saldo
- **Regra:** as rotas de quem conta (`/api/inventario/hoje`, `bipe`, `terminar`) não devolvem saldo, contagem anterior nem "bateu/não bateu" — nem no JSON. Conta-se **toda caixa embalada SEM etiqueta de venda, na prateleira e na bancada** (v2, 04/11/2026); a comparação é contra o **livre** (saldo − peça em caixa impressa e não conferida).
- **Por quê:** quem sabe a resposta conta até chegar nela.
- **Exceções:** quem resolve e quem lê o relatório veem os números.
- **Teste que trava:** `teste_inventario.js` (varre o JSON) · `teste_regras_estoque.js` (regra 7, com o servidor de verdade).
- **Status:** no ar desde 26/09/2026; rotas da v2 em código (04/11/2026) · conferida na fábrica: **ainda não**.

### R-EST-18 · Ninguém conta duas vezes o mesmo SKU, e ninguém resolve o que contou
- **Regra:** quem contou A não conta B nem C do mesmo SKU; quem contou não resolve o item na fila do admin; quem pediu um ajuste não o aprova. Vale para o Admin Geral. A comparação é por pessoa (`outraPessoa`), e vazio nunca é igual a vazio. A recontagem **na hora** por "mexeram durante a contagem" não é outra contagem (é a mesma, refeita).
- **Por quê:** duas pessoas às cegas que acham a mesma diferença são a prova. Decisão do dono (26/09/2026, mantida na v2): o aprovador único do **ajuste** espera.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_inventario.js` · `teste_ajuste.js` · `teste_regras_estoque.js` (regra 4).
- **Status:** no ar · v2 em código (04/11/2026) · conferida na fábrica: **ainda não**.

### R-EST-19 · O caminho da contagem (v2, 04/11/2026)
- **Regra:** bateu na 1ª → confirma, sem movimento. Diferente → a 2ª é de **outra pessoa que conta** (as duas escaladas do dia são o A e o B). As duas acharam a **mesma diferença** → **aplica sozinho**, sem aprovação: uma linha `inventario` com a diferença, em nome de quem fechou, sem motivo, e o furo vai para o relatório. Não acharam → a **3ª**, de quem tem `contagem.desempatar` e não contou; C bate com A ou com B → aplica sozinho; acordo em zero → confirma; ninguém bate → **fila do admin** (`contagem.resolver`): aplicar uma diferença com motivo, ou mandar contar de novo (na diária, volta **amanhã**, do zero). **Mexeram no SKU durante a contagem** (o livre mudou, ou linha no livro que não seja a baixa da Conferência, entre o primeiro bipe e o "terminei") → a contagem não vale e a tela pede recontar na hora. Uma pessoa por vez no mesmo SKU. "Não tem nenhuma" é contagem zero.
- **Por quê:** compara-se a diferença, e não o número, porque a bancada continua trabalhando entre uma contagem e outra; e o que anda durante a contagem não aparece na diferença. Decisão do dono (04/11/2026): o admin só recebe o que nem a 3ª resolveu.
- **Exceções:** os itens que já esperavam aprovação no dia do deploy da v2 continuam na fila, pela regra velha. SKU fora da lista do dia é recusado; na quinzenal, na geral e na avulsa entra marcado. Sob medida é recusado.
- **Teste que trava:** `teste_inventario.js` (98) · `teste_regras_estoque.js` (97).
- **Status:** v1 no ar desde 26/09/2026; v2 em código (04/11/2026) · conferida na fábrica: **ainda não**.

### R-EST-24 · A lista do dia, o rodízio e a tarja (v2, 04/11/2026)
- **Regra:** de segunda a sexta (`config.ciclo_dias`), no primeiro pedido depois das 7h (`ciclo_hora`), nasce a lista do dia de 8 SKUs (`ciclo_qtd`) e **não muda no dia**: sobrou de ontem → travou na etiqueta (`recusa_estoque`, ignora a folga) → menor cobertura (livre ÷ média do `demanda_dominio`) → nunca conferido → mais tempo sem conferir; folga de 7 dias (`ciclo_folga`); sob medida fora. Na mesma hora o sistema escala **duas pessoas** (`ciclo_pessoas`): quem tem `contagem.contar` **pelo setor ou por exceção** (o Admin Geral não entra só pelo nível), ativa e fora do "fora do rodízio", há mais tempo sem escala (empate: nome). Até as 10h (`ciclo_abre_todos`) a 1ª e a 2ª contagem são delas; às 10h, se uma não começou, abre para todo o setor e o relatório diz "escalada, não contou". Menos de duas pessoas: não há escala, a lista nasce aberta e o aviso vai para quem planeja. A **tarja** (`nav.js`) aparece para as escaladas (e para o setor depois das 10h, e para quem desempata quando há 3ª), **não fecha e não bloqueia**. A quinzenal (`quinzenal_dias`=15, prazo `quinzenal_prazo`=3 dias úteis) suspende a diária; no fim do prazo o não contado vira `nao_conferido` e a divergência vai para a diária seguinte. A geral abre só com a expedição parada confirmada, e o "terminei a prateleira" grava zero da pessoa nos SKUs que ela não bipou.
- **Por quê:** decisões do dono (04/11/2026, `docs/DECISOES.md`): fechar o furo aos poucos sem parar a expedição, e contagem livre num time pequeno acaba em sempre a mesma pessoa, ou ninguém.
- **Exceções:** a primeira quinzenal é 15 dias depois do deploy. A conferência avulsa da v1 continua.
- **Teste que trava:** `teste_inventario.js` · `teste_regras_estoque.js` (regras 8 a 14).
- **Status:** em código (04/11/2026) · conferida na fábrica: **ainda não**.

### R-EST-20 · O ajuste manual é pedido por uma pessoa e aprovado por outra
- **Regra:** pedir (`estoque.ajustar`) não mexe no saldo; o pedido é em delta e guarda o saldo da hora. Outra pessoa aprova (`estoque.aprovar_ajuste`) ou recusa com motivo; quem pediu pode desistir. Um pedido pendente por SKU. O `POST /api/estoque` antigo só recusa (410). Pedidos moram em `ajuste_pedido`; o aplicado vai para `ajuste_estoque`.
- **Por quê:** antes uma pessoa mudava o saldo sozinha, na hora.
- **Exceções:** o `backfill_pacote.js --baixar` aplica direto (script com backup e decisão humana).
- **Teste que trava:** `teste_ajuste.js` (53) · `teste_acesso.js` (seção 6-G).
- **Status:** no ar desde 28/09/2026 · conferida na fábrica: **ainda não**.

### R-EST-21 · Peça se conta só pelo Inventário
- **Regra:** a aba Contagem recusa SKU (409 `use_inventario`) e não grava nada do corpo — nem a parte de material. Material continua na aba Contagem.
- **Por quê:** a contagem antiga de peça não tinha conferência cega nem segunda pessoa.
- **Exceções:** a fila antiga de peça pendente no deploy sai pela tela antiga.
- **Teste que trava:** `teste_contagem.js`.
- **Status:** no ar desde 26/09/2026. Desde 05/11/2026 (fase 5 da `QUEM-FEZ-E-REVISAO`) a contagem de material grava quem contou e quem aprovou pelo id (`contagem.usuario_id`, `contagem_pendente.contado_por_id` e `aprovado_por_id`, ao lado dos nomes), e toda escrita da aba Contagem e do Inventário é 401 sem login (`teste_quem_devolucao_contagem.js`).

### R-EST-22 · A idade da conferência
- **Regra:** `inventario_dominio.conferencias()` é o único que responde. Vale a data da **1ª contagem** de item confirmado ou aprovado, junto com a história anterior (`contagem` e `contagem_pendente` aprovada), cada fonte por si. Contagem de material e de modo teste não contam. Acima de 30 dias fica âmbar; nunca conferido tem chip.
- **Por quê:** a tabela antiga era rascunho e era apagada, e o SKU contado voltava a aparecer como nunca conferido.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_estoque.js` · `teste_inventario.js`.
- **Status:** no ar.

### R-EST-23 · A acuracidade conta o acerto da 1ª contagem
- **Regra:** acuracidade do mês = itens que bateram na 1ª contagem ÷ itens contados no mês. Sem contagem no mês é traço, nunca "0%". A diferença por motivo sai em peças, e em R$ só com `custo.ver`.
- **Por quê:** a pergunta é se o saldo estava certo quando alguém foi olhar.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_acuracidade.js` (23).
- **Status:** no ar desde 02/10/2026 · só terá número depois da primeira conferência do mês.

---

## O planejamento — vendas futuras por dia (07/11/2026)

### R-PLN-01 · Que linha da planilha é o quê: a tabela do dono
- **Regra:** cada linha do relatório do ML cai num grupo da tabela §3-B da spec `PLANEJAMENTO-VENDAS-FUTURAS` (`planilha_estado.js`, dono único): **ainda na fábrica** (coleta do dia N, pronto para coleta, NF a emitir e, desde 08/11/2026, **coleta de amanhã** e **etiqueta pronta para impressão**) é venda futura e média; **já saiu**, **entregue** e **pós-venda** (os 26 estados de devolução, reclamação, mediação e reembolso, e desde 08/11/2026 *"Seu pacote foi devolvido em…"* e *"Venda não entregue"*) só média; **cancelada** (e *"Cancelada"* sozinha, desde 08/11/2026) e **não é venda** (cabeçalho de pacote, Estado vazio) ficam fora. A data de envio: no Estado; no "Pronto para coleta", o dia da semana da Descrição a partir da data do relatório (segunda de uma segunda é o mesmo dia); na "NF a emitir", o dia seguinte, marcado **"data a confirmar"**; na "coleta de amanhã", o dia seguinte ao do relatório; na "etiqueta pronta para impressão", o dia da Descrição (sem dia, o seguinte, a confirmar); e, desde 09/11/2026, no "Pronto para coleta" cuja Descrição diz **"entregue o pacote na próxima coleta"**, a próxima coleta **lançada** na 206 depois da hora do relatório (`coleta_horario.proximaColeta`; sem nada lançado no dia, o dia do relatório, a confirmar).
- **Por quê:** o comprometido deixava ~49 peças de hoje fora da tela azul, e o pós-venda saía da média sendo venda.
- **Exceções:** **estado novo não trava** — conta como venda, como futura se trouxer "dia N de mês", e o import avisa o texto. Um estado novo com "cancel" é novo (conta), e não cancelada.
- **Teste que trava:** `teste_vendas_futuras.js` (os 40 estados do relatório real de 07/11 nos grupos; 228 linhas · 239 peças futuras; e, à parte, os cinco estados acrescentados em 08/11/2026 — coleta de amanhã, etiqueta pronta, devolvido em N, venda não entregue e cancelada; e a seção 8, a "próxima coleta" de 09/11/2026).
- **Status:** no ar desde 07/11/2026 (PR #313).

### R-PLN-02 · Conta-se peça, pela coluna Unidades
- **Regra:** o comprometido, a média e a falta por dia somam `venda_futura.unidades`. A linha de antes desta fase vale 1.
- **Por quê:** a venda de 2 unidades valia 1.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_vendas_futuras.js`.
- **Status:** no ar desde 07/11/2026 (PR #313).

### R-PLN-03 · A falta acumulada por dia, e a Atrasada primeiro
- **Regra:** `demanda_dominio.porDia` é a única conta: `falta até o dia D = max(0, vendas de hoje até D − livre)`, com o **livre** = saldo − peça em caixa com etiqueta (desde 09/11/2026, R-PLN-06; até ali era o saldo). A primeira coluna é **Atrasada** (data já passada, ainda na fábrica pela planilha) e ela conta no comprometido. O horizonte é todo dia com venda futura. Sob medida fica fora da falta, contado à parte; SKU sem cadastro em linha própria. A aba e a tela azul dão o **mesmo** comprometido.
- **Por quê:** a venda futura era um número só, e ninguém sabia o que era para segunda, terça, quarta.
- **Exceções:** a linha de antes desta fase (sem `grupo`) só conta de hoje em diante, como sempre.
- **Teste que trava:** `teste_vendas_futuras.js`.
- **Status:** no ar desde 07/11/2026 (PR #313).

### R-PLN-04 · As janelas 7 · 14 · 30 · 45 são só para olhar
- **Regra:** os botões da 401 trocam a janela **da tela** e mostram a média de cada SKU e a seta 14 contra 30. Não gravam na `config`. Janela maior que a história da planilha é cortada e dita em âmbar.
- **Por quê:** decisão do dono — a produção não muda por um clique de análise.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_vendas_futuras.js`.
- **Status:** no ar desde 07/11/2026 (PR #313).

### R-PLN-05 · O ritmo é o maior entre a média da janela e a de 14 dias
- **Regra:** `ritmo = max(média de config.janela_media, média de config.janela_curta = 14)`; o alvo e a cobertura usam o ritmo. Quando a curta vence, a tela diz *"subindo: 6,3 → 8,9/dia"*.
- **Por quê:** a média de 30 atrasava o SKU que acelera. A simulação nos 60 dias do relatório de 07/11 (`simular_ritmo.js`, 21 dias avaliados) deu, com a régua da produção, 2.005 → 1.386 peças faltando, com a sobra subindo de 2.091 para 3.232 — o preço decidido; com N dias cheios, 2.130 → 1.584.
- **Exceções:** a queda **não** derruba o alvo antes dos 30 dias. Sob medida continua sem alvo (R-REV-04).
- **Teste que trava:** `teste_vendas_futuras.js`.
- **Status:** no ar desde 07/11/2026 (PR #313).

### R-PLN-06 · A venda com etiqueta impressa sai do planejamento, e a conta usa o livre
- **Regra:** o comprometido (a 401, a tela azul, a TV e a compra — o `demanda_dominio`) não conta a venda da planilha que já tem caixa com etiqueta de venda no PCP (`lote.embalado_em`, achada pela venda ou pelo pack; o modo teste fica fora), e a conta usa o **livre**: `precisa = comprometido + alvo − livre`. A falta só se mexe quando a venda chega e quando a peça é embalada. A 401 mostra "Livre" com "+N em caixa", diz quantas vendas saíram da lista e se atualiza a cada minuto.
- **Por quê:** a planilha só muda o Estado quando o caminhão bipa; a peça conferida saía do saldo e a venda ficava no comprometido. Em 09/11/2026: 84 peças assim, falta 269 na tela contra 199 de verdade. O dono: *"assim que der saída com a embalagem feita já deve sair do planejamento da produção"*.
- **Exceções:** a venda que o PCP não acha continua contando (na dúvida, produz-se) — inclusive o item de pacote cuja venda não é a da caixa, que fica com a falta a mais (a `venda_futura` não guarda o pack do item). O `estoque` devolvido continua sendo o saldo (o que a aba Estoque mostra e soma, e o custo); a cobertura, o degrau "sem estoque", a sobra e o "zerado" contam pelo livre.
- **Teste que trava:** `teste_vendas_futuras.js` (seção 7: a venda chega, a peça é embalada, a etiqueta, a Conferência, o modo teste, o pack, a venda não achada, a caixa de venda fora da planilha, o banco sem `lote`) e `teste_estoque.js` (o `precisa` pelo livre).
- **Status:** no ar desde 09/11/2026 (PR #323); falta a prova SKU a SKU com dado real.

## O que ainda não tem teste nesta área

R-EST-04 (reimpressão não baixa), R-REV-01 (os três modos), R-REV-02 (SKU fora
da lista), R-REV-06 (peça com problema),
R-EMB-05 (conferência no bipe 1) e as partes de tela de R-EST-11 e R-EST-17.
Ficam aqui para virar trabalho, e não esquecimento.

## O que NÃO fazer

> Vieram do CLAUDE.md §15 sem alteração, na ordem em que estavam. As
> referências entre parênteses (§N) apontam para a seção do CLAUDE.md onde
> a regra morava, hoje em cartão neste arquivo ou na história da área.
> Os dois últimos vieram depois, e ganharam a referência (§2) que não
> traziam.

- ❌ Calcular a falta de estoque fora do `demanda_dominio.js` — a aba Estoque e a
  tela azul do operador têm que dizer o mesmo número (§18)
- ❌ Fazer a aprovação da contagem gravar o **número contado** como saldo: entre
  contar e aprovar a fábrica embala e imprime, e o que andou no meio some sem
  erro e sem aviso. A conta é a DIFERENÇA contra o `sistema_era` (§18, #32)
- ❌ Deixar a contagem de **peça** mexer no saldo sem gravar em `ajuste_estoque`:
  a de material sempre gravou, e a peça era a metade sem auditoria (§18, #32)
- ❌ Ler a idade da conferência da tabela `contagem`: ela é RASCUNHO, e o
  `enfileirar` a apaga — o SKU contado ontem volta a aparecer como nunca
  conferido (§18, armadilha #32)
- ❌ Trocar as duas fontes da idade por uma só, ou datá-la pela **aprovação**: a
  troca apaga a história anterior ao registro do caminho direto, e a data da
  aprovação rejuvenesce uma conferência que foi feita semanas antes (§18, #32)
- ❌ Amarrar a conferência ao rastro do ajuste: a contagem que **bateu** não gera
  linha nenhuma, e é justamente o SKU cujo saldo estava certo que apareceria
  como nunca conferido (§18, armadilha #32)
- ❌ Dar por pronta uma fase que tem tela sem ABRIR a tela: a rota do extrato
  ficou um dia no ar, testada e documentada como pronta, sem botão nenhum que
  chegasse nela (§2, e é a #30 por outra ponta)
- ❌ Escrever em `skus.estoque` fora do `estoque_dominio.js` — o saldo tinha
  SETE donos e por isso não se reconstruía; há varredura recusando (§2, o livro)
- ❌ Devolver o `MAX(0, …)` a qualquer escrita de saldo: ele apaga justamente o
  sinal de peça que saiu sem registro, que é o passivo da dívida 13 (§2)
- ❌ Misturar saldo negativo com "zerado" na aba Estoque: zerado é SKU que
  acabou, e ninguém investiga o normal (§2, o livro)
- ❌ Abrir transação dentro do `estoque_dominio`: a embalagem são quatro
  escritas e a caixa de pacote são N baixas que valem como uma (§2)
- ❌ Fazer o cadastro de SKU gravar saldo de novo — nem com o campo presente,
  nem no SKU novo: livro vazio com coluna em 5 quebra a soma na 1ª linha (§2)
- ❌ Deixar a abertura do livro virar rotina: sem a marca em `config` ela roda a
  cada boot e o livro passa a dizer o dobro do saldo (§2)
- ❌ Isentar o `teste_route.js` de uma varredura por causa do prefixo: ele NÃO é
  teste, é o módulo do modo teste, e é dono de verdade da coluna (§2)
- ❌ Devolver o saldo, a contagem anterior ou o "bateu/não bateu" a quem conta ou
  reconta — nem no JSON: quem sabe a resposta conta até chegar nela (§18, fase 2)
- ❌ Deixar a mesma pessoa recontar ou aprovar o que contou, ou abrir exceção para o
  Admin Geral: a pergunta é de PESSOA, não de chave (`outraPessoa`, §18)
- ❌ Comparar a recontagem pelo número contado em vez da diferença contra o saldo
  do momento: a embalagem no meio mandaria todo SKU para a 3ª contagem (§18)
- ❌ Voltar a contar peça pela aba Contagem (`/api/contagem`), ou gravar a parte de
  material de um corpo que trouxe SKU — recusa inteira, e manda ao Inventário (§18)
- ❌ Ler a idade da conferência de uma fonte só, ou fora do
  `inventario_dominio.conferencias()` (§18, #32)
- ❌ Voltar a aplicar ajuste de saldo na hora, pela mão de uma pessoa só: pedir não
  mexe no saldo, e quem pediu não aprova — nem o Admin Geral (§18, fase 3)
- ❌ Pedir ajuste em "saldo novo" e aprová-lo como saldo: a aprovação aplica o
  DELTA sobre o saldo de agora, senão apaga o que andou no meio (§18, #32)
- ❌ Guardar o pedido pendente em `ajuste_estoque`: cinco lugares o leem como
  ajuste JÁ aplicado (§18, fase 3)
- ❌ Aceitar dois pedidos pendentes do mesmo SKU: aprovados em sequência, aplicam
  a mesma correção duas vezes (§18, fase 3)
- ❌ Deixar a troca do `kit_codigo` salvar sem `confirmar`, ou mover essa guarda
  para o `confirm()` da tela — o rolo já impresso para de bipar e ninguém sabe
  por quê (§4)
- ❌ Aceitar um SKU de persiana como `kit_codigo`: a partir dali aquela persiana
  fica **inembalável para sempre**, porque o bipe dela passa a ser lido como o
  kit — e ninguém liga isso a uma edição feita no Admin (§4, armadilha #26)
- ❌ Devolver as quatro escritas da embalagem para fora de uma transação, ou
  voltar a aceitar SKU sem cadastro ali: é a porta de ENTRADA do estoque, e o
  estado quebrado dela é peça na prateleira que não existe no sistema (§4, #26)
- ❌ Confiar no `kit_ok` que a tela manda sem conferir nada — o "⚠ FALTOU O KIT"
  precisa existir no servidor, senão é um `if` de navegador (§4, armadilha #26)
- ❌ Escrever uma segunda cópia do `kitBate`/`kitNorm`: a tela e o servidor leem
  o `public/kit_bipe.js`, e duas réguas divergem no dia da troca (§4, #26)
- ❌ Fazer a embalagem em modo teste consumir a fila REAL — era a dívida 1c, e a
  peça de verdade sumia quando os testes eram apagados (§4, armadilha #26)
- ❌ "Consertar" a embalagem para exigir que a peça esteja na fila: a fila não é
  obrigatória, é regra do §4, e é o que torna o `limpar_fila.js` seguro
- ❌ Criar um campo separado para o código de barras da etiqueta do kit: ele é
  sempre o **Código do kit** salvo, senão o impresso e o bipe divergem (§4)
- ❌ Decidir "cabe na etiqueta?" contando caracteres: 16 letras estreitas cabem
  e 16 `M` não — quem responde é a medida do `kit_etiqueta.js` (§4)
- ❌ Escrever as medidas da etiqueta do kit na tela ou no ZPL: elas moram no
  `public/kit_etiqueta.js`, em milímetros, e a fase 3 sai de lá (§4)
- ❌ Dizer que a prévia prova a etiqueta impressa: ela prova o CONTEÚDO e o
  LUGAR — quem desenha o QR e as barras no papel é a impressora (§4)
- ❌ Desenhar o QR da tela com módulo em pixel quebrado: a grade sai com 2 e 3
  px alternando e o celular não lê — e o desenho continua com cara de QR (§4)
- ❌ Arredondar o módulo do QR para CIMA: ele passa do espaço reservado e come a
  folga do silêncio, que é o que o leitor precisa para achar o código (§4)
- ❌ Pedir para conferir o QR com o celular só no QR pequeno da prévia: nesse
  tamanho a câmera não fecha a leitura — é para isso que existe o ampliado (§4)
- ❌ Ler o tamanho da CAIXA do QR como o tamanho que sai da impressora: o módulo
  arredonda para ponto cheio e o resto é jogado fora — a caixa dizia 20 mm e a
  ZD220 imprimia 15,4 (§4, armadilha #31)
- ❌ Limitar o módulo do QR só pela caixa, sem o `envelope`: link curto tem
  módulo maior, e o QR cresceria empurrando o próprio silêncio para fora da
  etiqueta — QR sem silêncio não é lido (§4, armadilha #31)
- ❌ Fazer a folga da legenda voltar a ser um número fixo: ela é **4 × o
  módulo**, e o módulo muda com o comprimento do link (§4, armadilha #31)
- ❌ Estreitar o bloco das barras para dar espaço ao QR: o QR cresce por cima,
  onde não há barra — afinar a barra é mexer no que a Embalagem bipa (§4, #31)
- ❌ Montar a zona de silêncio de um caso de teste com um número de módulos
  escrito ao lado em vez do link do próprio caso — régua própria acusa o
  inocente hoje e deixa passar o culpado amanhã (§4, armadilha #31)
- ❌ Mandar tirar o `?usp=drive_link` do link "para o QR ficar melhor": com a
  caixa de 26 mm o módulo é o mesmo e o QR sai 2,5 mm MENOR. Quem responde é a
  medida, não a versão — e conselho que sobrevive à trava que o justificava
  vira conselho errado (§4)
- ❌ Aprovar texto de tela sem renderizar os casos: a frase que dizia "sai
  menor — 23,1 mm em vez de 23,1 mm" está sintaticamente perfeita, e nenhum
  teste de unidade a pega (§4)
- ❌ Conferir o QR relendo com a mesma convenção com que ele foi escrito: o
  formato invertido passou por três rodadas verdes assim (§4)
- ❌ Escrever a área de formato do QR fora da ordem do padrão — o leitor acha o
  código, não fecha o BCH e desiste sem dizer nada (§4)
- ❌ Escrever medida dentro do `kit_pdf.js` ou do desenhista de SVG: os dois
  consomem a lista do `elementos()`, e a segunda régua só aparece no rolo
  impresso (§4)
- ❌ Desenhar o QR do PDF fora da grade de 8 pontos/mm: agora quem desenha o QR
  no papel somos nós, e módulo em ponto quebrado a Zebra rasteriza alternando
  4 e 5 pontos — o defeito da fase 2, no rolo (§4)
- ❌ Fazer a impressão do kit usar o texto que veio da tela em vez do salvo no
  banco: o rolo sairia diferente do que a Embalagem bipa (§4)
- ❌ Dar `kit.imprimir` a quem já tem `kit.editar` "para facilitar": o dono
  assinala nome por nome, e isso foi decidido em 17/09/2026 (§4)
- ❌ Recriar o upload de etiqueta do kit (`/api/kit/label`) ou qualquer segundo
  caminho de impressão: o arquivo enviado não acompanha o Código do kit, e o
  rolo impresso por ele para de bipar sem ninguém saber por quê (§4)
- ❌ Fazer a revisão somar estoque "porque parece que falta"
  (§2, armadilha #1)
- ❌ Fazer a reimpressão baixar estoque "porque imprimiu de novo"
  (§2, armadilha #1-B)
- ❌ Trocar a recusa dos 15 s por um "confirma?", ou subir o limite para 1 minuto
  "porque a média é 1 min": metade das revisões reais fica abaixo (R-REV-07)
- ❌ Usar a "Peça com problema" para bipe errado, ou marcar a revisão desfeita
  com uma coluna em vez de apagá-la: são cinco contas que teriam de filtrar (R-REV-08, R-REV-09)
- ❌ Deixar desfazer revisão de outra pessoa, de outro dia, já embalada, ou duas
  seguidas (R-REV-09)
