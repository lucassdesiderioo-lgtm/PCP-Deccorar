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
- Regra:            `componente.modo_saldo` = `sem` · `quantidade` · `volume`. Sem a escolha, o cadastro recusa (400). Na edição ele não se apaga. Os materiais de antes receberam `quantidade` (tecido com família: `volume`, um por nível) num backfill de uma vez só (`config.cmp_material_backfill_1`).
- Por quê:          regra que nasce com o valor que ninguém escolheu fica inerte em silêncio (armadilha #30).
- Exceções:         nenhuma.
- Teste que trava:  `teste_material.js` (sem o "obrigatório", reprova 1; sem o backfill, 1)
- Status:           em código desde 07/11/2026.
- História:         fase 1.

### R-CMP-04 · Categoria é lista editável, e não decide regra
- Regra:            `listas` tipo `categoria_material`, semeada uma vez com Matéria-prima · Tecido · Embalagem · Ferramenta · Limpeza · Copa · Escritório · Manutenção.
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
- Regra:            `almoxarifado` (nome único sem diferença de maiúscula, local, finalidade, ativo), criado, renomeado e desativado pela 501 (aba Almoxarifados), com `almoxarifado.cadastrar`. Com material dentro não se apaga: desativa, e volta pelo "Reativar". Nascem "Comandos e montagem" e "Expedição"; os do tecido vêm na fase 10.
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

---

## O que NÃO fazer

- ❌ Dar padrão escondido ao `modo_saldo` de material novo (armadilha #30)
- ❌ Ligar `como_sai = 'ficha'` antes de a montagem existir
- ❌ Deixar a ficha aceitar material com `vai_ficha = 0`, ou desmarcar `vai_ficha` com o material numa ficha
- ❌ Apagar almoxarifado: desativa
- ❌ Voltar a gravar `enviado` como status de pedido, ou pôr na fila do Recebimento pedido que não está comprado
- ❌ Mandar Pix, banco ou conta do fornecedor, ou as parcelas, a quem não pode ver (a poda é no JSON)
- ❌ Deixar a compra rápida passar por fora da alçada
