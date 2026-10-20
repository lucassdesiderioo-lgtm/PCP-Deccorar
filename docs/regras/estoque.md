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
- **Teste que trava:** `teste_montagem.js` (42) · `teste_livro.js` (60).
- **Status:** no ar desde 17/09/2026.
- **História:** armadilha #26.

### R-EST-03 · A etiqueta de venda baixa uma por PEÇA
- **Regra:** imprimir a etiqueta de venda baixa −1 de cada persiana da caixa. A caixa de várias persianas baixa N, uma linha por SKU. Sem saldo, não imprime.
- **Por quê:** é quando a peça sai da prateleira para o cliente. Baixar uma numa caixa de três deixa duas peças fora do sistema.
- **Exceções:** sob medida (R-EST-05).
- **Teste que trava:** `teste_etiqueta.js` (68) · `teste_livro.js` (60).
- **Status:** no ar.
- **História:** CLAUDE.md §5, armadilha #23.

### R-EST-04 · Reimprimir não baixa
- **Regra:** `POST /api/reimprimir` só grava `lote.reimpressoes` e `lote.reimpresso_em`. O saldo não anda.
- **Por quê:** papel preso, etiqueta borrada e folha perdida são o mesmo volume para o mesmo cliente; a baixa já aconteceu na primeira impressão.
- **Exceções:** nenhuma.
- **Teste que trava:** ⚠ **sem teste** do saldo. `teste_saida.js` trava só que a reimpressão não troca quem imprimiu.
- **Status:** no ar.
- **História:** armadilha #1-B.

### R-EST-05 · Sob medida não soma nem baixa
- **Regra:** SKU de modelo com `sob_medida=1` não ganha +1 na embalagem nem −1 na etiqueta, e não passa pela trava de estoque. O saldo dele é sempre zero.
- **Por quê:** a peça é feita contra o pedido; não existe antes da venda nem sobra depois. Baixar de um lado só abriria um buraco por venda.
- **Exceções:** nenhuma. ⚠ **Não marque `sob_medida` no modelo `ROLO`**: são 29 dos 30 SKUs.
- **Teste que trava:** `teste_livro.js` (fluxo real com sob medida).
- **Status:** no ar · a flag só pega quando o modelo está marcado no banco (armadilha #30, CLAUDE.md §7).
- **História:** CLAUDE.md §7, armadilhas #6 e #30.

### R-EST-06 · O saldo só anda pelo livro
- **Regra:** `estoque_dominio.js` é o único que escreve em `skus.estoque`, sempre junto com uma linha em `movimento_estoque`, na mesma transação. O movimento guarda o **delta**, nunca o saldo. `SUM(delta) = skus.estoque` para todo SKU.
- **Por quê:** o saldo tinha sete donos e, quando errava, não sobrava rastro de quem mexeu. `skus.estoque` continua existindo como cache que as telas leem.
- **Exceções:** a restauração da foto do modo teste, que mora **dentro** do domínio (`restaurarFoto`).
- **Teste que trava:** `teste_livro.js` (60; exige a soma depois de cada passo e varre o código recusando `UPDATE skus SET estoque` fora do domínio).
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
- **Regra:** quatro degraus, nesta ordem: 1) cliente com prazo até amanhã, 2) sem estoque, 3) cobertura abaixo de metade dos dias de cobertura, 4) abaixo do alvo. Cada linha traz o `motivo`. Sem venda na janela a cobertura é vazia, nunca zero.
- **Por quê:** ordenar pelo que falta põe em cima o SKU que mais gira, que quase nunca é o que acaba primeiro.
- **Exceções:** nenhuma.
- **Teste que trava:** ⚠ **sem teste** da ordem. `teste_estoque.js` trava só que a conta é a mesma da aba Estoque.
- **Status:** no ar.

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
- **Regra:** durante a revisão, "Peça com problema" grava em `rejeicao` o motivo, o tempo até a detecção, o modo e quem rejeitou. A peça não vai para a embalagem. Os motivos são cadastro (`listas`, tipo `rejeicao`).
- **Por quê:** a peça com defeito não pode virar estoque.
- **Exceções:** nenhuma.
- **Teste que trava:** ⚠ **sem teste**.
- **Status:** no ar.

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
- **Regra:** a aba Estoque, a tela azul, a TV e o gerencial leem a falta do `demanda_dominio.js` (`comprometido + alvo − estoque`, com o alvo calculado ao vivo). O alvo salvo aparece ao lado, em âmbar, quando diverge.
- **Por quê:** duas telas diziam "a repor" com números diferentes, as duas certas cada uma na sua régua.
- **Exceções:** na TV, "falta hoje" (ordens do dia, R-REV-05) e "precisa" (estoque) são duas colunas e não se somam.
- **Teste que trava:** `teste_estoque.js` (72).
- **Status:** no ar desde 01/09/2026.
- **História:** armadilha #12.

### R-EST-13 · O gráfico conta só produção e venda
- **Regra:** "entrou" é a embalagem e "saiu" é a etiqueta de venda (`fluxo_estoque.js`, dono único). Ajuste e contagem ficam fora do gráfico, com número próprio.
- **Por quê:** o gráfico responde quanto a fábrica fez e quanto saiu, e não quanto a coluna variou.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_estoque.js`.
- **Status:** no ar desde 01/09/2026.

### R-EST-14 · O valor do estoque nunca esconde o que falta
- **Regra:** o custo vem do `ficha_dominio`. SKU sem custo não vira zero: o total sai como **piso** (`≥`). SKU sem peça mostra traço. Quem não tem `custo.ver` não recebe os campos de valor no JSON nem no CSV.
- **Por quê:** zero faria o estoque parecer mais barato do que é; esconder só na tela não esconde nada.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_estoque.js`.
- **Status:** no ar desde 01/09/2026.

### R-EST-15 · O reservado é leitura, não conta
- **Regra:** "reservado" é a soma das peças de volumes pendentes (vendidos, sem etiqueta). Aparece ao lado do saldo como "N sem etiqueta · N livres", e não muda o `precisa`. Sob medida não tem reservado; modo teste, bloqueado e cancelado não reservam.
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
- **Regra:** as rotas de contar e recontar não devolvem saldo, contagem anterior nem "bateu/não bateu" — nem no JSON. Conta-se só a peça embalada, com etiqueta de SKU e sem etiqueta de venda.
- **Por quê:** quem sabe a resposta conta até chegar nela.
- **Exceções:** quem planeja e aprova vê os números.
- **Teste que trava:** `teste_inventario.js` (varre o JSON) · ⚠ **sem teste** da frase "só peça embalada" na tela.
- **Status:** no ar desde 26/09/2026 · conferida na fábrica: **ainda não**.

### R-EST-18 · Ninguém aprova o próprio trabalho
- **Regra:** quem contou não reconta nem aprova aquele item; quem pediu um ajuste não o aprova. Vale para o Admin Geral. Sem uma segunda pessoa, a correção **espera**. A comparação é por pessoa (`outraPessoa`), e vazio nunca é igual a vazio.
- **Por quê:** é a única forma de a correção de saldo ter duas pessoas atrás. Decisão do dono (26/09/2026): o aprovador único espera, sem exceção com motivo.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_inventario.js` · `teste_ajuste.js`.
- **Status:** no ar · conferida na fábrica: **ainda não**.

### R-EST-19 · O caminho da contagem
- **Regra:** bateu na 1ª contagem → confirma sozinho, sem movimento. Diferente → outra pessoa reconta. As duas acharam a mesma diferença → vai para aprovação. Não acharam → uma 3ª pessoa conta e vale o acordo de duas; acordo em zero confirma sem movimento. Rejeitar não apaga: nasce um item novo a contar do zero. Uma pessoa por vez no mesmo SKU. Terminar sem bipe é contagem zero. Aprovar exige motivo.
- **Por quê:** compara-se a diferença, e não o número, porque a bancada continua trabalhando entre uma contagem e outra.
- **Exceções:** SKU fora do plano entra marcado; sob medida é recusado.
- **Teste que trava:** `teste_inventario.js`.
- **Status:** no ar desde 26/09/2026 · conferida na fábrica: **ainda não**.

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
- **Status:** no ar desde 26/09/2026.

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

## O que ainda não tem teste nesta área

R-EST-04 (reimpressão não baixa), R-REV-01 (os três modos), R-REV-02 (SKU fora
da lista), R-REV-03 (ordem da tela azul), R-REV-06 (peça com problema),
R-EMB-05 (conferência no bipe 1) e as partes de tela de R-EST-11 e R-EST-17.
Ficam aqui para virar trabalho, e não esquecimento.
