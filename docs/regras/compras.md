# Regras — Compras e Recebimento

> Cada cartão é **uma regra que vale hoje**, com o motivo, as exceções e o teste
> que impede alguém de desfazê-la. O porquê longo está em
> [`docs/historia/compras.md`](../historia/compras.md).
>
> Área nova (07/11/2026), nascida da spec
> [`COMPRAS-E-RECEBIMENTO`](../specs/COMPRAS-E-RECEBIMENTO.md). As regras do
> Compras de antes (oferta, comparação de preço, os dois gatilhos da lista,
> quem recebe não vê preço) continuam no `CLAUDE.md` §7-B até serem passadas
> para cá. Formato do cartão: [`README.md`](README.md).

---

## A. Cadastro de material (fase 1)

### R-CMP-01 · Tudo que a empresa compra é material
- Regra:            café, estilete, tubo e tecido moram no mesmo cadastro (`componente`). Não há segundo cadastro de insumo.
- Por quê:          um cadastro só para comprar, receber, contar e saber o preço médio de tudo.
- Exceções:         nenhuma.
- Teste que trava:  `teste_material.js`
- Status:           em código desde 07/11/2026, falta subir.
- História:         `historia/compras.md`, fase 1.

### R-CMP-02 · "Vai para a ficha técnica" é marca explícita
- Regra:            `componente.vai_ficha`. A ficha (404) só oferece — e o servidor só aceita (`POST /api/formulas`) — material com `vai_ficha = 1`. Material que está numa ficha não se desmarca: a recusa (409) diz em quais modelos ele está.
- Por quê:          o café cadastrado apareceria na ficha.
- Exceções:         sem dizer, o material nasce na ficha (o caso da matéria-prima).
- Teste que trava:  `teste_material.js`
- Status:           em código desde 07/11/2026.
- História:         fase 1.

### R-CMP-03 · O modo de saldo é escolha obrigatória para nascer
- Regra:            `componente.modo_saldo` = `sem` · `quantidade` · `volume`. Sem a escolha, o cadastro recusa (400). Na edição ele não se apaga, e **com saldo ele não muda** (400, dizendo o caminho). Os materiais de antes receberam `quantidade` num backfill de uma vez só (`config.cmp_material_backfill_1`); o tecido com família **e sem saldo** recebeu `volume`, um por nível. **O tecido com saldo de antes fica `quantidade`** até alguém com `contagem.aprovar` etiquetar os rolos na 504 (só tecido com família, nunca o do sob medida) (aba "Tecido de antes: etiquetar os rolos"): cada rolo vira volume com a metragem medida, o material passa a `volume` e o saldo vira a soma deles — a diferença entra no livro como `contagem`, com quem (decisão do dono, 07/11/2026).
- Por quê:          regra que nasce com o valor que ninguém escolheu fica inerte em silêncio (armadilha #30); e um material "por volume" sem volume nenhum teria o saldo sem os rolos que o compõem (R-CMP-39).
- Exceções:         nenhuma.
- Teste que trava:  `teste_material.js` (sem o "obrigatório", reprova 1; sem o backfill, 1; o tecido com saldo virando volume, 1); `teste_revisao_compras.js` (a troca com saldo e o etiquetar na 504)
- Status:           em código desde 07/11/2026.
- História:         fase 1.

### R-CMP-04 · Categoria é lista editável, e não decide regra
- Regra:            `listas` tipo `categoria_material`, semeada uma vez com Matéria-prima · Tecido · Embalagem · Ferramenta · Limpeza · Copa · Escritório · Manutenção. **Desde 11/11/2026 (AJUSTE) se edita na 902 Cadastros**, no quadro "Categorias de material", com `listas.editar` — a mesma rota e chave dos motivos. Remover desativa: o material que já a usa guarda o texto.
- Por quê:          filtrar e montar a compra programada.
- Exceções:         nenhuma.
- Teste que trava:  `teste_material.js`
- Status:           em código desde 07/11/2026.
- História:         fase 1.

### R-CMP-05 · Todo material tem almoxarifado padrão
- Regra:            `componente.almoxarifado_id`; o material sem ele aparece na central de Pendências ("Material sem almoxarifado", pela mesma conta da tela, `material_dominio.pendencias`). Almoxarifado desativado não recebe material novo.
- Por quê:          é o "levar para" do Recebimento e o filtro da Contagem.
- Exceções:         o material nasce sem ele (não trava); fica em Pendências.
- Teste que trava:  `teste_material.js`
- Status:           em código desde 07/11/2026.
- História:         fase 1.

### R-CMP-06 · Volume e "um por nível"
- Regra:            `componente.um_por_nivel` nasce 1 para o tecido em volume (com família) e 0 para o resto. Mudar um material para `volume` depois é só marcar.
- Por quê:          a regra do sob medida "cada nível guarda um rolo só".
- Exceções:         nenhuma.
- Teste que trava:  `teste_material.js` (o uso, na fase 5)
- Status:           em código desde 07/11/2026.
- História:         fase 1.

### R-CMP-07 · Conferência por peso no cadastro
- Regra:            `peso_padrao_kg` (opcional), `tol_aviso_pct` (2) e `tol_retem_pct` (5). O aviso não passa do reter; vazio volta ao padrão, nunca a NULL.
- Por quê:          a régua do cadastro pega o fornecedor que fatura errado (R-CMP-31).
- Exceções:         nenhuma.
- Teste que trava:  `teste_material.js`
- Status:           em código desde 07/11/2026.
- História:         fase 1.

### R-CMP-08 · NCM opcional, oito dígitos
- Regra:            `componente.ncm`, gravado só com os 8 dígitos (aceita os pontos). Fora disso, 400.
- Por quê:          é por ele que o XML casa o item da nota com o material (fase 8).
- Exceções:         nenhuma.
- Teste que trava:  `teste_material.js`
- Status:           em código desde 07/11/2026.
- História:         fase 1.

### R-CMP-09 · "Como sai do estoque" diz que está esperando
- Regra:            `componente.como_sai` = `contagem` (o único que funciona hoje) · `ficha`. `ficha` é recusada dizendo "depende da montagem (PRODUCAO-MONTAGEM.md)", e a tela a mostra desabilitada com o mesmo texto (`material_dominio.COMO_SAI_FICHA_LIGADA`).
- Por quê:          a regra inerte que diz que está inerte (dívida 18).
- Exceções:         quando a montagem existir, liga-se a constante; a baixa é de lá.
- Teste que trava:  `teste_material.js` (escolhível, reprova 2)
- Status:           em código desde 07/11/2026.
- História:         fase 1.

### R-CMP-10 · Cadastro rápido, e a #33 inteira nas colunas novas
- Regra:            nome e modo de saldo bastam para nascer (categoria, unidade e almoxarifado são o resto do formulário curto). Campo ausente preserva, vazio de propósito apaga, número impossível é recusado (400) dizendo qual campo — nunca clampado.
- Por quê:          a armadilha #33 (o POST que apagava a família do tecido).
- Exceções:         nenhuma.
- Teste que trava:  `teste_material.js`, `teste_componentes.js`
- Status:           em código desde 07/11/2026.
- História:         fase 1.

### R-CMP-38 · Um sistema de almoxarifado, quantos a empresa quiser
- Regra:            `almoxarifado` (nome único sem diferença de maiúscula, local, finalidade, ativo), criado, renomeado e desativado pela 1103 Almoxarifados e endereços (até 11/11/2026, aba da 501) (aba Almoxarifados), com `almoxarifado.cadastrar`. Com material dentro não se apaga: desativa, e volta pelo "Reativar". Nascem "Comandos e montagem" e "Expedição"; os do tecido vêm na fase 10.
- Por quê:          o material fica em vários lugares da fábrica.
- Exceções:         nenhuma.
- Teste que trava:  `teste_material.js`, `teste_acesso_compras.js`
- Status:           em código desde 07/11/2026 (o endereço haste → andar → nível é da fase 5).
- História:         fase 1.

## B e C. Fornecedor e pedido (fase 2)

### R-CMP-11 · Um cadastro de fornecedor só
- Regra:            o de `dados.db`. O do sob medida migra na fase 9.
- Por quê:          dois cadastros do mesmo fornecedor divergem.
- Exceções:         até a fase 9, o rolo do sob medida guarda o fornecedor em texto.
- Teste que trava:  (fase 9)
- Status:           fase 9.
- História:         fase 9.

### R-CMP-12 · Tipo do fornecedor e dados de pagamento
- Regra:            `fornecedor.tipo` = indústria · distribuidor · loja · importador. Pix, banco, agência e conta só viajam no JSON a quem tem `pedido.pagar`, e só ele grava. O cadastro do fornecedor passou a seguir a #33: campo ausente preserva.
- Por quê:          pronto para o financeiro, sem mostrar conta bancária a quem só compra.
- Exceções:         nenhuma.
- Teste que trava:  `teste_pedido_compra.js`
- Status:           em código desde 07/11/2026.
- História:         fase 2.

### R-CMP-13 · Marketplace é canal, não fornecedor
- Regra:            todo pedido comprado tem `canal` (Mercado Livre, Shopee, Amazon, loja física, direto). Na compra de marketplace a loja vai em texto (`pedido_compra.loja`) e o fornecedor pode ficar vazio.
- Por quê:          a bucha e o café não justificam cadastro.
- Exceções:         nenhuma.
- Teste que trava:  `teste_pedido_compra.js`
- Status:           em código desde 07/11/2026.
- História:         fase 2.

### R-CMP-14 · O preço médio é do material
- Regra:            o custo médio é do `componente`, venha de onde vier; a comparação entre fornecedores continua por oferta.
- Por quê:          a bucha tem um preço médio, comprada em qualquer loja.
- Exceções:         nenhuma.
- Teste que trava:  `teste_nota_compra.js` (fase 4)
- Status:           fase 4.
- História:         fase 4.

### R-CMP-15 · O caminho do pedido
- Regra:            rascunho → aguardando_aprovacao (só acima da alçada) → comprado → parcial → recebido; cancelado de qualquer um antes de recebido. O `enviado` de antes foi renomeado para `comprado` uma vez só (`config.cmp_status_comprado_1`), com a data da compra = `enviado_em`. O `POST /api/pedidos/:id/enviar` responde 400 dizendo o caminho novo.
- Por quê:          o pedido "enviado" não dizia se foi comprado.
- Exceções:         nenhuma.
- Teste que trava:  `teste_pedido_compra.js` (sem a migração, reprova 2)
- Status:           em código desde 07/11/2026.
- História:         fase 2.

### R-CMP-16 · "Comprado" exige canal, número do pedido no fornecedor e data
- Regra:            `POST /api/pedidos/:id/comprar` recusa sem os três (data em AAAA-MM-DD, nunca no futuro) e grava `comprado_por`/`comprado_por_id`. Só pedido comprado (ou parcial) aparece na fila do Recebimento e conta como a caminho.
- Por quê:          a data da compra mede o prazo do fornecedor.
- Exceções:         a compra rápida, sem data, usa hoje.
- Teste que trava:  `teste_pedido_compra.js` (sem o número, reprova 12)
- Status:           em código desde 07/11/2026.
- História:         fase 2.

### R-CMP-17 · Alçada por pessoa
- Regra:            `compra_alcada` (pessoa, limite em R$, aprovador). Pedido acima do limite de quem o CRIOU vai para `aguardando_aprovacao`; só o aprovador dessa pessoa ou o Admin Geral (`pedido.aprovar` na rota) passa para comprado, com motivo, e fica gravado quem, quando e por quê. Quem não tem alçada não tem limite. Só o Admin Geral define (`alcada.definir`, intransferível); a pessoa não aprova as próprias compras.
- Por quê:          a compra grande precisa de segundo olho; pronta e sem uso enquanto só o dono compra.
- Exceções:         nenhuma.
- Teste que trava:  `teste_pedido_compra.js` (sem a alçada, reprova 9; qualquer um aprovando, 4; sem motivo, 3); `teste_acesso_compras.js`
- Status:           em código desde 07/11/2026.
- História:         fase 2.

### R-CMP-18 · Compra por kg com quantidade declarada
- Regra:            o item guarda `unidade_compra`, `qtd_compra`, `preco_unid_compra` e `qtd_declarada` (na unidade da casa). O pedido vale qtd_compra × preço; o "a caminho" é o declarado; o fator = declarado ÷ comprado.
- Por quê:          400 kg ≈ 600 tubos.
- Exceções:         a conversão fixa (barra de 6 m) continua pela oferta.
- Teste que trava:  `teste_pedido_compra.js`
- Status:           em código desde 07/11/2026.
- História:         fase 2.

### R-CMP-19 · Pagamento em parcelas, mesmo quando é uma
- Regra:            `pagamento_parcela` no formato do `sm_boleto` (valor em centavos, vencimento AAAA-MM-DD, `pago_em`, `pago_por`). `pedido_compra.pago_em` é derivado: todas pagas. Parcela paga não se apaga nem se paga de novo (409). O "marcar pago" de antes grava uma parcela paga do valor do pedido. Não é contas a pagar.
- Por quê:          saber como cada compra foi paga, pronto para o financeiro.
- Exceções:         nenhuma.
- Teste que trava:  `teste_pedido_compra.js` (sem derivar o pago, reprova 1)
- Status:           em código desde 07/11/2026.
- História:         fase 2.

### R-CMP-20 · Anexos fora de `lotes/`
- Regra:            orçamento, nota em PDF/foto, XML, comprovante em `caminhos.ANEXOS_COMPRAS` (`PCP_ANEXOS_COMPRAS_DIR`), gravado na transação da linha; o nome no disco é gerado pelo servidor, o nome mandado só é mostrado. Opcional sempre.
- Por quê:          o cron apaga `lotes/` em 7 dias; anexo é prova.
- Exceções:         nenhuma.
- Teste que trava:  `teste_pedido_compra.js`, `teste_caminhos.js`
- Status:           em código desde 07/11/2026.
- História:         fase 2.

### R-CMP-21 · Compra rápida
- Regra:            material, quantidade, valor total, canal, loja e número: nasce comprada (`rapida = 1`) e passa pela alçada igual.
- Por quê:          o caminho da bucha e do café.
- Exceções:         nenhuma.
- Teste que trava:  `teste_pedido_compra.js` (furando a alçada, reprova 2)
- Status:           em código desde 07/11/2026.
- História:         fase 2.

## E. Recebimento (fase 3)

### R-CMP-28 · Quem recebe não vê preço
- Regra:            a fila (`GET /api/recebimento/aguardando`) e a resposta do receber montam o JSON sem nenhum campo de preço, valor ou custo — escolhidos campo a campo no `recebimento_dominio.fila`. **O pedido também**: `GET /api/pedidos` e `/api/pedidos/:id` a quem não tem `compras.ver`, `pedido.criar`, `pedido.aprovar`, `pedido.pagar`, `nota.lancar` nem `custo.ver` saem sem dinheiro, sem o declarado e sem a alçada (a poda é pelo nome: `valor*`, `preco*`, `desembolso*`, `frete*`, `desconto*`, `custo*`, `qtd_*`, `alcada*`), e o texto de WhatsApp (que tem preço) é 403 (revisão do PR #305). **Desde 11/11/2026 (R-VAL)** quem tem `compras.ver` sem `compras.valores` (nem uma ação que lança aquele dinheiro, o `valor.js`) também recebe o pedido sem o dinheiro — as quantidades ficam —, e o WhatsApp é 403 para ele.
- Por quê:          quem confere vendo valor confirma o que está escrito.
- Exceções:         nenhuma.
- Teste que trava:  `teste_recebimento.js`; `teste_revisao_compras.js` (o pedido pelo fio a quem só recebe)
- Status:           em código desde 07/11/2026 (mantida do COMPRAS.md).
- História:         fase 3.

### R-CMP-29 · O rigor depende do modo de saldo
- Regra:            `sem`: mostra o pedido e o botão "chegou tudo" (ou digita o que veio). `quantidade`: contagem CEGA — a fila não traz o pedido nem o declarado. `volume`: um registro por volume, com a metragem da etiqueta do fornecedor (a etiqueta da casa e o endereço são da fase 5). O material "sem saldo" entra e sai na mesma hora (não guarda estoque), e o custo médio dele é a média ponderada de todas as compras.
- Por quê:          café não se conta como tubo.
- Exceções:         nenhuma.
- Teste que trava:  `teste_recebimento.js` (a fila mostrando o pedido, reprova 1)
- Status:           em código desde 07/11/2026.
- História:         fase 3.

### R-CMP-30 · Compra por kg: pesagem obrigatória e cega
- Regra:            item comprado em `kg` exige o peso de 1 unidade e o peso de 10; sem os dois, o recebimento não fecha (400). A tela não mostra o peso esperado.
- Por quê:          a contagem bate e o material é pior.
- Exceções:         nenhuma.
- Teste que trava:  `teste_recebimento.js` (pesagem opcional, reprova 16)
- Status:           em código desde 07/11/2026.
- História:         fase 3.

### R-CMP-31 · As réguas do peso, e vale a pior
- Regra:            medido = peso de 10 ÷ 10. Nota = kg do pedido (menos o que já chegou dele) ÷ contados. Cadastro = `peso_padrao_kg`. Histórico = a média dos fatores medidos antes (R-CMP-35). Vale o PIOR desvio.
- Por quê:          a do cadastro pega quem fatura errado; a da nota funciona sem cadastro.
- Exceções:         sem cadastro nem histórico, só a da nota.
- Teste que trava:  `teste_recebimento.js` (só a régua do cadastro, reprova 3)
- Status:           em código desde 07/11/2026.
- História:         fase 3.

### R-CMP-32 · Tolerância em três faixas
- Regra:            até `tol_aviso_pct` entra normal; até `tol_retem_pct` entra no saldo e vai para ciência; acima — ou contagem **acima** da quantidade declarada — RETÉM: não entra no saldo. **A entrega abaixo do declarado entra** (o pedido fica parcial, o resto a caminho), e a diferença só é cobrada **no fechamento**: o "fechar pedido parcial" põe na 1201 Recebimento retido (até 11/11/2026, aba da 501) uma linha "fechamento" (o que chegou × o declarado), que se decide com aceitar ou aceitar e reclamar e **não mexe no saldo** (decisão do dono, 07/11/2026). Pedido com entrega retida esperando decisão **não fecha** (409): o retido ainda pode entrar. O peso é conferido a cada entrega, e a régua da nota é proporcional: o kg que falta ÷ as unidades declaradas que faltam.
- Por quê:          numa compra de R$ 40–50 mil o material pior não pode passar; e a compra por kg chega em partes no caso normal — reter toda parcial era a trava que dispara no caso normal (armadilha #6).
- Exceções:         nenhuma.
- Teste que trava:  `teste_recebimento.js` (sem a faixa de aviso, reprova; contagem acima do declarado passando, reprova); `teste_revisao_compras.js` (a parcial retida, a régua dobrada e a diferença sem ir para quem libera, reprovam)
- Status:           em código desde 07/11/2026.
- História:         fase 3.

### R-CMP-33 · O retido sai com um toque, nunca fica preso
- Regra:            quem tem `recebimento.liberar` (1201 Recebimento retido; até 11/11/2026, aba da 501) escolhe aceitar, aceitar e reclamar, ou devolver, com motivo; grava quem e quando. Devolver não entra e continua a caminho. O aviso recebe "dar ciência". Retidos e avisos têm linha na central de Pendências.
- Por quê:          trava que sabe liberar (armadilha #6).
- Exceções:         nenhuma.
- Teste que trava:  `teste_recebimento.js` (retido entrando, reprova 8; sem motivo, 4); `teste_acesso_compras.js`
- Status:           em código desde 07/11/2026.
- História:         fase 3.

### R-CMP-34 · O custo é por unidade recebida
- Regra:            na compra por kg, o valor do item ÷ o que chegou contado (400 kg, 590 tubos: ÷ 590). A entrega parcial (abaixo do declarado) custa pelo declarado; quando o pedido fecha com falta e o kg inteiro chegou, o custo vira o valor ÷ o contado (`fecharComFalta`). A nota lançada depois corrige pelo líquido ÷ as unidades da casa que ela cobra, ou ÷ o recebido quando o item já fechou (recebido, ou o resto cancelado). Quem diz em que unidade a nota cobra é a **unidade escrita nela** (o `uCom` do XML, ou a digitada): igual à unidade do material ("UN" de um comando em un) já é unidade da casa; outra ("CX", "KG") é a unidade de compra, e o fator converte. Sem unidade escrita, vale a unidade de compra. Fora do kg, o preço da embalagem ÷ o fator.
- Por quê:          o tubo que faltou encarece os que vieram.
- Exceções:         ver acima.
- Teste que trava:  `teste_recebimento.js` (pelo declarado, reprova 1)
- Status:           em código desde 07/11/2026.
- História:         fase 3.

### R-CMP-35 · O fator real vira histórico
- Regra:            todo recebimento por kg grava `fator_real` (kg por unidade). A média dos últimos 10 é a terceira régua do peso e a sugestão de quantos kg pedir (fase 7).
- Por quê:          lote fora da média é divergência.
- Exceções:         nenhuma.
- Teste que trava:  `teste_recebimento.js`
- Status:           em código desde 07/11/2026.
- História:         fase 3.

### R-CMP-36 · O prazo do fornecedor é medido
- Regra:            dias entre `comprado_em` e o primeiro recebimento de cada pedido, por fornecedor e por material, média das últimas 5. Com 3 recebimentos ou mais vale o medido; abaixo, o digitado (oferta ou fornecedor) — e a resposta diz qual (`fonte`).
- Por quê:          o prazo digitado não era de ninguém medir.
- Exceções:         nenhuma.
- Teste que trava:  `teste_recebimento.js` (sempre o digitado, reprova 2)
- Status:           em código desde 07/11/2026.
- História:         fase 3.

### R-CMP-37 · "Levar para"
- Regra:            a fila mostra o almoxarifado padrão de cada item; quem recebe pode escolher outro, e o lugar real fica gravado (`recebimento_item.almoxarifado_id`). Não é trava.
- Por quê:          o material mora em vários lugares.
- Exceções:         nenhuma.
- Teste que trava:  `teste_recebimento.js`
- Status:           em código desde 07/11/2026.
- História:         fase 3.

## D. Nota fiscal e custo (fase 4)

### R-CMP-22 · Nota é registro próprio, e sem nota também é registro
- Regra:            `nota_compra` + `nota_compra_item`; um pedido pode ter várias notas. Compra sem nota é permitida e marcada (`sem_nota = 1`), com o valor pago digitado no item. Nota (com nota) sem número é recusada.
- Por quê:          sem os itens da nota não há custo real nem crédito.
- Exceções:         nenhuma.
- Teste que trava:  `teste_nota_compra.js`
- Status:           em código desde 07/11/2026.
- História:         fase 4.

### R-CMP-23 · Os valores do item são gravados como vieram, e o total é rateado pelo valor
- Regra:            produto, desconto, frete, seguro, outras, IPI, ICMS, ICMS-ST, CFOP e NCM por item. Frete, desconto, seguro e outras lançados só no total da nota são repartidos pelo valor do produto (o centavo do arredondamento vai para o último).
- Por quê:          a mesma régua do `COMPRAS.md`.
- Exceções:         nenhuma.
- Teste que trava:  `teste_nota_compra.js` (sem rateio, reprova 7)
- Status:           em código desde 07/11/2026.
- História:         fase 4.

### R-CMP-24 · Custo pago e custo líquido
- Regra:            pago = produto − desconto + frete + seguro + outras + IPI + ICMS-ST (o ICMS próprio não entra); líquido = pago − os créditos que o regime aproveita. Os dois gravados por item. No Simples, iguais.
- Por quê:          o custo real, e o crédito que a mudança de regime vai pedir.
- Exceções:         sem nota: pago = líquido = o valor pago.
- Teste que trava:  `teste_nota_compra.js` (ICMS no pago, reprova 7)
- Status:           em código desde 07/11/2026.
- História:         fase 4.

### R-CMP-25 · O crédito vem de uma tabela por regime, e a nota grava o regime da data dela
- Regra:            `regra_credito` (regime, imposto, aproveita, vigente desde), semeada com o Simples sem crédito; regime vigente em `config.regime_vigente`. Mudar o regime ou a tabela é do Admin Geral. A nota guarda o regime: a compra do Simples nunca ganha crédito retroativo.
- Por quê:          a lição do preço congelado no pedido.
- Exceções:         nenhuma.
- Teste que trava:  `teste_nota_compra.js` (crédito sem a tabela, reprova 3; regime não vigente, 2)
- Status:           em código desde 07/11/2026.
- História:         fase 4.

### R-CMP-26 · O custo médio anda pelo líquido ÷ o recebido
- Regra:            nota lançada depois do recebimento corrige o custo médio pelo `componente_dominio.corrigirCustoPago` (dono único); nota lançada antes faz o recebimento entrar pelo líquido. O custo médio continua só se movendo na entrada.
- Por quê:          o preço médio real de cada material, café incluído.
- Exceções:         nenhuma.
- Teste que trava:  `teste_nota_compra.js` (custo médio parado, reprova 2; recebimento ignorando a nota, 1)
- Status:           em código desde 07/11/2026.
- História:         fase 4.

### R-CMP-27 · Quem vê nota, impostos e parcelas
- Regra:            só `custo.ver` ou `nota.lancar` (as parcelas, também `pedido.pagar`). As rotas `/api/notas` pedem essas chaves, e o pedido completo poda as notas no JSON. **Os anexos da nota** (XML, PDF e foto da nota, ou anexo ligado a uma nota) também: a lista não os mostra e o download é 403 a quem não tem uma das duas — e desde 11/11/2026 o orçamento e o comprovante do pedido são de quem vê os valores das compras (`compras.valores`, R-VAL-03): a lista e o detalhe do pedido não os mostram, e o download é 403. A conta mora no `anexo_compra.js`.
- Por quê:          regra 14 do §13: não é a tela que esconde.
- Exceções:         nenhuma.
- Teste que trava:  `teste_nota_compra.js` (notas sem poda, reprova 1); `teste_acesso_compras.js`; `teste_revisao_compras.js` (o XML baixado por quem só vê compras, 2)
- Status:           em código desde 07/11/2026.
- História:         fase 4.

## F. Almoxarifado e volumes (fase 5)

### R-CMP-39 · Volume é a peça física etiquetada
- Regra:            `volume_material` (código `M-000001`, material, recebimento de origem, quantidade inicial, saldo, nível, situação `guardado` · `aberto` · `encerrado`). Nasce no recebimento do material por volume, na mesma transação da entrada, um por volume. O saldo de um material por volume é a soma dos volumes não encerrados. Cada movimento fica em `volume_evento`, com quem. O item **retido** guarda os volumes (`recebimento_item.volumes_json`) e eles nascem quando quem libera aceita; o tecido do sob medida retido e aceito vira rolo lá (R-CMP-49), nunca estoque no PCP.
- Por quê:          o rolo e a caixa têm endereço e etiqueta.
- Exceções:         nenhuma.
- Teste que trava:  `teste_almoxarifado.js` (sem o volume no recebimento, reprova); `teste_porta_sobmedida.js` (o retido aceito sem volume, 1; o tecido retido virando estoque no PCP, 2)
- Status:           em código desde 07/11/2026.
- História:         fase 5.

### R-CMP-40 · Abrir o rolo do ML é consumir o rolo
- Regra:            o bipe "Abri" (503) encerra o volume e lança a saída do saldo inteiro pelo livro do material (motivo `abertura`), com quem. Abrir de novo é recusado.
- Por quê:          a bobina do ML é aberta e picotada inteira.
- Exceções:         como ela é cortada fica fora (decisão de produção).
- Teste que trava:  `teste_almoxarifado.js` (abrir sem saída, reprova 3; abrir duas vezes, 1)
- Status:           em código desde 07/11/2026.
- História:         fase 5.

### R-CMP-41 · Mover é bipe; um por nível recusa o nível ocupado
- Regra:            bipe no volume, bipe (`E-000000`) ou escolha do endereço novo. Com `um_por_nivel` no material, o nível ocupado por outro volume recusa (409) dizendo qual está lá. Mover não mexe em saldo; volume encerrado não se move.
- Por quê:          a regra do sob medida, um rolo por nível.
- Exceções:         material sem "um por nível" divide o nível.
- Teste que trava:  `teste_almoxarifado.js` (sem um por nível, reprova 2)
- Status:           em código desde 07/11/2026.
- História:         fase 5.

### R-CMP-38 (fase 5) · O endereço do almoxarifado
- Regra:            haste → andar → nível por almoxarifado (`alm_haste`, `alm_andar`, `alm_nivel`), criado pela 1103 Almoxarifados e endereços (até 11/11/2026, aba Almoxarifados da 501) com `almoxarifado.cadastrar`, no desenho do armazém do sob medida. Criar o mesmo endereço de novo não duplica.
- Por quê:          o mesmo desenho que o sob medida já usa, e para onde os endereços dele migram na fase 10.
- Exceções:         nenhuma.
- Teste que trava:  `teste_almoxarifado.js`
- Status:           em código desde 07/11/2026.
- História:         fase 5.

## G. Contagem e consumo (fase 6)

### R-CMP-42 · Contagem de material: uma pessoa, cega, por almoxarifado
- Regra:            a 504 (`/contagem-material`) abre a contagem de UM almoxarifado (um por vez) e lista os materiais por quantidade e por volume dele, sem o saldo (nem pelo JSON). Só quem abriu lança e termina. Ao terminar, por material contado: diferença até `tol_aviso_pct` aplica sozinha (motivo `contagem`, com quem contou); acima, vai para quem tem `contagem.aprovar` (a 504, num bloco só para quem tem a chave — até 11/11/2026, na aba Contagem da 302 — e central de Pendências, que leva à 504), que aplica a DIFERENÇA sobre o saldo de agora, com motivo. Quem contou não aprova. O saldo comparado é o da hora em que o material começou a ser contado. `contagem_dias` (30) diz quem está "a contar".
- Por quê:          a contagem de material ganhou spec própria.
- Exceções:         material por volume nunca é ajustado aqui: o saldo dele é a soma dos volumes; a diferença vai para ciência, e corrige-se na 503.
- Teste que trava:  `teste_contagem_material.js` (saldo vazando, reprova 1; aplicando tudo sozinho, reprova; quem contou aprovando, 1; o saldo do "terminei", 2)
- Status:           em código desde 07/11/2026. **A contagem de material antiga da 302 foi aposentada** (decisão do dono, 07/11/2026): o card saiu, e lançar, ajustar, somar e aprovar o pendente antigo de material pela porta antiga respondem 410 apontando a 504 (o pendente antigo se rejeita). Material se conta só aqui.
- História:         fase 6.

### R-CMP-43 · Tubo cortado ainda é material
- Regra:            no material em metro, a linha é "barras inteiras" ou "cortados", medida × quantidade, e a tela soma em metros. Fora do metro, não há cortado.
- Por quê:          quem conta não faz conta.
- Exceções:         nenhuma.
- Teste que trava:  `teste_contagem_material.js` (sem converter em metro, reprova)
- Status:           em código desde 07/11/2026.
- História:         fase 6.

### R-CMP-44 · Consumo pela contagem, e com uma contagem só é `null`
- Regra:            consumo = contado na anterior + entradas (recebimento) − contado nesta, por dia sobre os dias entre as duas. Com menos de duas contagens: `null`, dizendo por quê — nunca zero. Zero contado é lançamento válido; material não contado na rodada fica "não contado", e não vira zero.
- Por quê:          zero é um número válido e mentiroso.
- Exceções:         nenhuma.
- Teste que trava:  `teste_contagem_material.js` (consumo zero, reprova 1; não contado virando zero, 2)
- Status:           em código desde 07/11/2026.
- História:         fase 6.

### R-CMP-45 · O consumo de quem não tem saldo é a média das compras
- Regra:            média mensal das quantidades recebidas na janela (6 meses), cortada no primeiro recebimento, dizendo de quantos meses saiu; abaixo de 3 meses, "pouco histórico".
- Por quê:          a armadilha #16 (média cuja janela é maior que a história).
- Exceções:         nenhuma.
- Teste que trava:  `teste_contagem_material.js` (sem a tarja, reprova 1)
- Status:           em código desde 07/11/2026.
- História:         fase 6.

## H. Compra programada (fase 7)

### R-CMP-46 · Lista do mês para o que não tem saldo
- Regra:            a aba Compra programada (501) monta, para cada material sem saldo, a média mensal das compras (R-CMP-45) menos o que está a caminho, arredondada para cima na embalagem da última compra (sem compra, a da oferta mais barata). O dia da lista é `config.compra_programada_dia` (padrão 1), e a tela diz se é hoje. É sugestão: a quantidade se edita, e "Gerar pedido(s)" cria rascunhos — agrupados pelo fornecedor da oferta da última compra; quem não tem oferta vai num rascunho sem fornecedor.
- Por quê:          compra que não depende de lembrar.
- Exceções:         nenhuma.
- Teste que trava:  `teste_compra_programada.js` (sem arredondar à embalagem, reprova 1)
- Status:           em código desde 07/11/2026.
- História:         fase 7.

### R-CMP-47 · Aviso pela data para o que tem saldo
- Regra:            dias até acabar = (saldo + a caminho) ÷ consumo diário (R-CMP-44); pedir até = hoje + dias até acabar − prazo (R-CMP-36) − `margem_dias`. O material entra quando o "pedir até" chega. Sem consumo medido, não entra pela data — só pelo mínimo — e a tela diz "sem consumo medido".
- Por quê:          o prazo do fornecedor e o consumo decidem quando pedir, não o susto.
- Exceções:         nenhuma.
- Teste que trava:  `teste_compra_programada.js` (pedir até sem o prazo, reprova 5; a lista com tudo, 2)
- Status:           em código desde 07/11/2026.
- História:         fase 7.

### R-CMP-48 · A data não soma com o mínimo
- Regra:            o ponto de pedido é o MAIOR entre o `estoque_minimo` e o calculado pela data (consumo × (prazo + margem)), nunca a soma, e sempre desconta o que está a caminho. A sugestão enche até o maior entre o ideal e o ponto.
- Por quê:          a mesma régua dos dois gatilhos do `COMPRAS.md`.
- Exceções:         nenhuma.
- Teste que trava:  `teste_compra_programada.js` (a soma, reprova 3; sem descontar a caminho, 1)
- Status:           em código desde 07/11/2026.
- História:         fase 7.

## Nota por XML (fase 8)

### R-CMP-08 (fase 8) · O XML casa sem adivinhar
- Regra:            anexar o XML da NF-e (layout 4.00, com ou sem `nfeProc` e namespace) preenche nota e itens com os valores e impostos como vieram. O item casa com o do pedido pelo código do fornecedor da oferta (`codigo_fornec` = `cProd`) ou, se um só item do pedido tem aquele NCM **e um só item da nota casaria por ele**, pelo NCM — dois itens da nota disputando o mesmo NCM ficam para escolher. Dois candidatos, ou nenhum, ficam para escolher na tela; a nota só se lança com todo item decidido ("não é deste pedido" é uma escolha). A mesma chave não entra duas vezes (409). Origem `xml`.
- Por quê:          digitar nota é onde o erro entra; adivinhar é onde ele se esconde.
- Exceções:         nenhuma.
- Teste que trava:  `teste_nota_xml.js` (NCM ambíguo adivinhado, reprova 1; lançar sem decidir, reprova; a chave duas vezes, 1; sem tirar o namespace, reprova); `teste_dfe.js` (o NCM disputado por dois itens da nota, 1)
- Status:           em código desde 07/11/2026. ⚠️ Os XML do teste foram montados no layout da Receita, não vieram de fornecedor: a prova com XML real é o primeiro que o dono anexar.
- História:         fase 8.

## I. Sob medida e almoxarifado único (fases 9 e 10)

### R-CMP-11 (fase 9) · Um cadastro de fornecedor só
- Regra:            o fornecedor é o do PCP. `node migrar_fornecedor_sobmedida.js` (simula; `--aplicar` com backup dos dois bancos) liga cada fornecedor do sob medida ao do PCP de mesmo nome (sem diferença de maiúscula e espaço) ou o cria lá; duplicatas de nome viram um só. O cadastro do sob medida vira espelho (`fornecedor.fornecedor_pcp_id`); o texto antigo do rolo fica; o rolo ganha `fornecedor_pcp_id` ao lado.
- Por quê:          dois cadastros do mesmo fornecedor divergem.
- Exceções:         nenhuma.
- Teste que trava:  `teste_porta_sobmedida.js` (nome sem normalizar, reprova 1)
- Status:           em código desde 07/11/2026; a migração roda no deploy.
- História:         fase 9.

### R-CMP-49 · Uma porta de entrada para o tecido do sob medida
- Regra:            o material do PCP que é tecido do sob medida aponta o tecido de lá (`componente.sm_tecido_id`, conferido pela porta). Comprado pela 501 e recebido pela 502 por volume, o rolo NASCE no sob medida pela porta (`sobmedida_rolo.js` → `montar().criarRolosDoRecebimento`), um por volume, pelo `rolo.entrada` de sempre, com o tecido, a largura da bobina do cadastro, a nota, o fornecedor do PCP (pelo espelho) e o preço por m² (custo da unidade ÷ largura). Nada entra no estoque do PCP. Sem a porta, o recebimento desse tecido recusa (503) e nada é gravado. **Os rolos de todos os tecidos de um recebimento nascem numa chamada só, no fim da transação do PCP**, e numa transação só do lado de lá: a recusa de qualquer um desfaz os dois lados — não sobra rolo órfão (revisão do PR #305). A entrada de rolo do sob medida (aba "Entrada de rolo", `POST /api/rolos`) está aposentada e recusa dizendo o caminho.
- Por quê:          tecido tinha duas portas de entrada e dois cadastros de fornecedor.
- Exceções:         o tecido do sob medida não fica retido pela contagem ≠ declarado: o rolo nasce lá, e lá se acerta (R9).
- Teste que trava:  `teste_porta_sobmedida.js` (o tecido entrando no PCP, reprova; sem o espelho do fornecedor, 1; a entrada antiga aberta, 1; sem o preço, 1; o rolo órfão, 1)
- Status:           em código desde 07/11/2026.
- História:         fase 9.

### R-CMP-50 · Um sistema de almoxarifado: o PCP é dono do endereço; o sob medida, do rolo e da sobra
- Regra:            `node migrar_enderecos_sobmedida.js` (simula nas cópias dos dois bancos; `--aplicar` faz backup dos dois, aplica e confere) leva os armazéns ROLO e SOBRA do sob medida para o PCP como "Tecidos novos" e "Sobras de tecido", com os mesmos nomes de haste, andar e nível e o id antigo guardado (`origem_sm`, `origem_sm_id`). No sob medida, armazem/haste/andar/nivel viram o ESPELHO do PCP (`pcp_almox_id`, `pcp_id`, migração 41): a porta (`tecido/nucleo/enderecos_pcp.js`) copia nome e ativo do PCP a cada leitura da árvore; a bancada que cria o buraco novo o cria NO PCP (R-SME-01 continua, pelo dono); renomear e desativar lá é recusado (é no PCP, 1103 Almoxarifados e endereços). O rolo e a sobra guardam o nível do PCP e o nome dele (`nivel_pcp_id`, `nivel_pcp_nome`), mantidos por gatilho quando o `nivel_id` muda — o `nivel_id` de sempre e o corte não mudaram. "Um só por nível" vale entre os dois lados (o volume do PCP não entra onde há rolo, e o rolo não entra onde há volume). O painel do almoxarifado (1103; até 11/11/2026, aba da 501) mostra os volumes do PCP e os rolos e sobras do sob medida, por endereço, numa lista só.
- Por quê:          o corte grava rolo, sobra e plano numa transação só; separar isso em dois bancos faria um corte pela metade virar tecido sumido.
- Exceções:         porta caída: o endereço não some (o nome fica gravado no rolo e na sobra), a tela diz "sem atualização", e criar endereço no sob medida recusa (não nasce de um lado só). O PCP lista o que é dele e diz que o sob medida ficou de fora.
- Teste que trava:  `teste_porta_almox.js` (sem o gatilho do mover, reprova 2; a conferência cega, 1; o rolo sem o nível do PCP, 6; sem ler o PCP, 4; a bancada criando só lá, reprova; o rolo ignorando o volume do PCP, 2; o volume ignorando o rolo, 1; a porta caída calada, 1; renomear lá, 1); `cd tecido && npm test` (o corte igual)
- Status:           em código desde 07/11/2026; a migração roda no deploy, depois da fase 9.
- História:         fase 10.

## J. Notas baixadas da Receita (fase 11)

### R-CMP-51 · O certificado entra pela tela, nunca pelo repositório
- Regra:            **1302 Certificado digital** (até 11/11/2026, aba da 501), só o Admin Geral (`certificado.gerenciar`, intransferível e sensível): cadastrar o CNPJ e o código da UF da Deccorar, enviar o `.pfx` com a senha, trocar e remover. O Node abre o `.pfx` com a senha (senha errada é recusada na hora) e lê titular, CNPJ e validade; o CNPJ tem que ser o da Deccorar (`config.cnpj`), e sem ele cadastrado o envio é recusado dizendo isso. O arquivo vai para `caminhos.CERTIFICADO` (`PCP_CERTIFICADO_DIR`, padrão `<pasta do PCP>/certificado`, fora de `lotes/` e de `backups/`), com permissão 0600. A senha é cifrada (AES-256-GCM, `v1:`) com uma chave própria do servidor, no arquivo `.chave` da mesma pasta (0600, criado na primeira vez). Trocar apaga o arquivo do anterior. **Não há rota que entregue o arquivo**, e a pasta, `*.pfx` e `*.p12` estão no `.gitignore`.
- Por quê:          o certificado A1 assina pela empresa; vazado, alguém emite e manifesta nota em nome da Deccorar.
- Exceções:         nenhuma. A senha nunca vai ao JSON, ao log ou ao banco em texto; a decifra só acontece dentro do servidor, na hora da busca.
- Teste que trava:  `teste_certificado.js` (senha em texto no banco, reprova 1; sem conferir o CNPJ, 1; sem exigir o CNPJ da empresa, 1; o arquivo sem 0600, 1; trocar sem apagar o anterior, 2)
- Status:           em código desde 07/11/2026. ⚠️ Testado com certificado gerado na hora pelo `openssl`: a prova com o e-CNPJ real é o dono enviá-lo pela tela.
- História:         fase 11.

### R-CMP-52 · A validade à vista
- Regra:            vencendo em menos de 30 dias: tarja âmbar na 1302 Certificado digital e nas **Notas recebidas** (1301), e a linha "Certificado digital vencendo ou vencido" na central de Pendências (quem tem `certificado.gerenciar`). Vencido: a busca para e diz por quê. Certificado já vencido não entra.
- Por quê:          certificado que vence calado faz a busca parar sem ninguém ver.
- Exceções:         nenhuma.
- Teste que trava:  `teste_certificado.js` (a régua dos 30 dias trocada, reprova 2)
- Status:           em código desde 07/11/2026.
- História:         fase 11.

### R-CMP-53 · A busca das notas na Receita
- Regra:            com certificado válido, o servidor consulta a distribuição de DF-e do Ambiente Nacional (`NFeDistribuicaoDFe`, `distNSU`) pelo próprio relógio (`dfe_route.js`, olha a cada 5 min se já passou a `proxima_consulta`; sem cron), guardando o último NSU lido. `cStat 138` com mais a ler (`ultNSU < maxNSU`) volta em 2 min; `138` com tudo lido, `137` (nada novo) e `656` (consumo indevido) esperam **pelo menos uma hora**, seja qual for o `config.dfe_intervalo_min` (padrão 60; valor que não é número vira 60) — e depois de 137/656 o "consultar agora" também espera. Cada documento do lote entra sozinho: o que não abre vira linha "não entrou", com o motivo **e o conteúdo**, e o NSU só anda depois do lote; a linha é tentada de novo nas consultas seguintes (até 10 vezes), conta na central de Pendências e sai com "ciente" e motivo. Cada nota emitida contra o CNPJ aparece em 1301 Notas fiscais de compra → **Notas recebidas da Receita** (até 11/11/2026, aba Notas da 501), com emitente, valor e data. O Admin Geral pode "Consultar a Receita agora".
- Por quê:          a nota chega antes da mercadoria, e a Receita bloqueia quem consulta demais.
- Exceções:         `PCP_DFE_AUTOMATICO=0` desliga o relógio (é o que os testes usam).
- Teste que trava:  `teste_dfe.js` (o 137 sem esperar a hora, reprova 1; o "consultar agora" depois do 137, 1; o 138 sem mais nada, 1; o documento estragado derrubando o lote, 4)
- Status:           em código desde 07/11/2026. ⚠️ As respostas da Receita do teste foram gravadas no layout dela, não vieram dela: a prova é a primeira consulta de verdade.
- História:         fase 11.

### R-CMP-54 · Só a ciência da operação é automática
- Regra:            para cada resumo (`resNFe`) o sistema envia o evento 210210 (ciência da operação), assinado (XMLDSig, C14N, RSA-SHA1) com a chave do certificado, que sai do `.pfx` só em memória, pelo `openssl` do servidor. 135, 136 e 573 contam como feita. Confirmação, desconhecimento e operação não realizada **não existem** no sistema.
- Por quê:          a Receita só entrega o XML completo depois da ciência, e a ciência não confirma nem nega a compra.
- Exceções:         sem `openssl` no servidor, ou a Receita recusando, a ciência fica pendente e a nota diz por quê (não trava nada); a que falhou por falta de resposta ou de assinatura é tentada de novo a cada consulta seguinte — a que a Receita recusou (nota cancelada) não é reenviada.
- Teste que trava:  `teste_dfe.js` (sem a ciência, reprova 1; o evento conferido contra a chave pública do certificado; a ciência que falhou sem nova tentativa, 1)
- Status:           em código desde 07/11/2026. ⚠️ A assinatura foi conferida pela chave pública, não pela Receita.
- História:         fase 11.

### R-CMP-55 · A nota baixada vira a nota da fase 8, sem adivinhar
- Regra:            o XML completo (`procNFe`) fica guardado em `ANEXOS_COMPRAS/dfe/` e entra pelo leitor da fase 8 (`nota_xml.js`, origem `dfe`). Lança sozinho **só** quando o emitente tem UM pedido, ele está **a caminho** (comprado ou parcial — o já recebido não recebe nota sozinho) e todo item casa; com dois pedidos, pedido já recebido, ou item que não casa, fica "escolha o pedido e os itens" na tela (e o motivo do lançamento que não deu fica escrito); sem pedido do emitente, **"nota sem pedido"** — e isso é linha na central de Pendências (`nota.lancar`). A nota sem pedido é olhada de novo a cada consulta (o pedido pode aparecer), e quem tem `nota.lancar` pode marcá-la **"ciente, sem pedido"**, com motivo, quem e quando — aí ela sai das Pendências. A mesma nota já digitada à mão (mesmo número, sem os zeros à esquerda, e o CNPJ da nota ou do fornecedor do pedido dela) não é lançada de novo: fica para escolher, dizendo qual.
- Por quê:          a regra da fase 8 (R-CMP-08): o que se adivinha é onde o erro se esconde.
- Exceções:         nenhuma.
- Teste que trava:  `teste_dfe.js` (dois pedidos adivinhados, reprova 2; o pedido já recebido, 1; o "ciente" sem motivo, 1; a reavaliação, 1)
- Status:           em código desde 07/11/2026.
- História:         fase 11.

### R-CMP-56 · Sem certificado, tudo funciona
- Regra:            sem certificado a aba diz "nenhum certificado enviado", as Notas recebidas dizem que a busca liga quando ele chegar, a busca não roda e diz por quê, e as fases 1 a 10 não dependem dele.
- Por quê:          o certificado é do dono, e a fábrica não pode parar esperando.
- Exceções:         nenhuma.
- Teste que trava:  `teste_certificado.js` (a busca sem certificado não chama a Receita)
- Status:           em código desde 07/11/2026.
- História:         fase 11.

---

## O que NÃO fazer

- ❌ Dar padrão escondido ao `modo_saldo` de material novo (armadilha #30)
- ❌ Ligar `como_sai = 'ficha'` antes de a montagem existir
- ❌ Deixar a ficha aceitar material com `vai_ficha = 0`, ou desmarcar `vai_ficha` com o material numa ficha
- ❌ Apagar almoxarifado: desativa
- ❌ Voltar a gravar `enviado` como status de pedido, ou pôr na fila do Recebimento pedido que não está comprado
- ❌ Mandar Pix, banco ou conta do fornecedor, ou as parcelas, a quem não pode ver (a poda é no JSON)
- ❌ Deixar a compra rápida passar por fora da alçada
- ❌ Mandar à fila do Recebimento o pedido, o declarado ou o peso esperado do item por quantidade: a contagem é cega
- ❌ Dar entrada no saldo do retido antes de alguém decidir
- ❌ Calcular crédito de imposto no código, ou recalcular o líquido de uma nota antiga quando o regime muda
- ❌ Pôr o ICMS próprio no custo pago
- ❌ Mandar o saldo a quem conta material, ou tratar material não contado como zero
- ❌ Dar consumo zero com uma contagem só (é `null`)
- ❌ Somar o mínimo com o ponto pela data, ou esquecer o que está a caminho
- ❌ Casar item da nota por nome parecido ou por valor: só código do fornecedor ou NCM único
- ❌ Mudar rolo, sobra ou corte de banco, ou trocar o `nivel_id` do rolo pelo id do PCP: o PCP guarda o endereço, o sob medida aponta pelo espelho (R-CMP-50)
- ❌ Criar ou renomear endereço só no sob medida depois da migração
- ❌ Dar entrada de tecido do sob medida no estoque do PCP, ou reabrir a entrada de rolo do sob medida: o rolo nasce lá pelo Recebimento
- ❌ Mexer no saldo de material por volume fora do volume (ele é a soma dos volumes não encerrados), ou encerrar volume sem a saída pelo livro
- ❌ Gravar certificado, senha ou chave de cifra no repositório, criar rota que entregue o `.pfx`, ou mandar a senha (mesmo cifrada) pelo JSON (R-CMP-51)
- ❌ Ligar confirmação, desconhecimento ou operação não realizada sozinho: só a ciência é automática (R-CMP-54)
- ❌ Consultar a Receita de novo antes da hora depois de um 137 ou 656 (R-CMP-53)
- ❌ Lançar sozinha a nota baixada com mais de um pedido do emitente (R-CMP-55)
