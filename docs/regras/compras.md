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

---

## O que NÃO fazer

- ❌ Dar padrão escondido ao `modo_saldo` de material novo (armadilha #30)
- ❌ Ligar `como_sai = 'ficha'` antes de a montagem existir
- ❌ Deixar a ficha aceitar material com `vai_ficha = 0`, ou desmarcar `vai_ficha` com o material numa ficha
- ❌ Apagar almoxarifado: desativa
