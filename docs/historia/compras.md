# História — Compras e Recebimento

> O porquê longo das regras de [`regras/compras.md`](../regras/compras.md).
> Spec: [`COMPRAS-E-RECEBIMENTO`](../specs/COMPRAS-E-RECEBIMENTO.md).

## Por que a spec nasceu (06/11/2026)

As telas de Compras (501) e Recebimento (502) existiam desde agosto e ninguém
usava: tinham sido desenhadas para tubo, base e tecido, e a empresa compra muito
mais que isso. Não havia preço médio de nada, consumo medido, recebimento com
dono, nem conferência da compra por quilo — e 400 kg de tubo que chegam como 600
tubos podem bater na contagem com material mais fino.

## Fase 1 — o cadastro de material (07/11/2026)

- **Tudo que se compra é material**, e o que separa é a marca `vai_ficha`. A ficha
  recusa no servidor, e não só na lista da tela: a tela esconder não basta.
- **O modo de saldo não tem padrão escondido.** É a armadilha #30 (o conserto do
  sob medida que ficou três semanas inerte porque ninguém marcou a caixinha) pela
  porta do cadastro: material novo nasce recusado sem a escolha. Os de antes
  receberam o que eles são hoje num backfill de uma vez só.
- **`como_sai = 'ficha'` existe e diz que está esperando.** A dívida 18 é a regra
  inerte que ninguém vê; aqui ela é visível na tela, desabilitada, com o motivo.
- **O "Adicionar" do card de mínimos saiu.** Ele criava material só com nome e
  unidade, e passaria a nascer recusado. O material novo nasce no formulário de
  cima, que pede o modo de saldo e o almoxarifado.
- O `teste_componentes.js` (a #33) passou a criar material "por quantidade": o
  modo de saldo virou obrigatório, e a recusa dessa falta é travada no
  `teste_material.js`.

## Fase 2 — fornecedor e pedido (07/11/2026)

- **`enviado` virou `comprado`**, e "comprado" exige canal, número do pedido no
  fornecedor e a data da compra. Nenhum pedido real tinha sido lançado, mas a
  migração foi feita mesmo assim, uma vez só.
- **A alçada é de quem criou o pedido.** O pedido já guardava `criado_por_id`
  (QUEM-FEZ fase 7), e é por ele que se acha o limite e o aprovador. Os três dados
  da compra são pedidos já no "Comprado": quem passa o pedido adiante sabe o
  número; o aprovador só diz sim, com motivo.
- **O cadastro de fornecedor apagava campo ausente** — o mesmo defeito da #33.
  Apareceu escrevendo o teste do Pix: editar o telefone apagaria a chave Pix.
  Hoje ausente preserva.
- **`nota.lancar` entrou na fase 2**, e não na 4: a poda das parcelas
  (R-CMP-27) já a pergunta.

## Fase 3 — o recebimento (07/11/2026)

- **A 502 virou contagem cega.** A tela antiga mostrava "Pedido: N" e já vinha
  com o número preenchido — quem conferia só confirmava. Hoje quem conta digita.
- **A régua do histórico entrou ao lado das duas da spec.** A R-CMP-35 diz que o
  lote fora da média é divergência; a média dos fatores medidos virou a terceira
  régua, e vale a pior das três. O teste da régua da nota sozinha teve de usar um
  material sem histórico: com histórico, a terceira régua cobria a falta da
  segunda, e o defeito reintroduzido passava verde.
- **"Sem saldo" não guarda estoque.** O café entra e sai na mesma hora, e o
  custo médio dele é a média de todas as compras — senão seria o preço da última.
- **O redesenho da 502 guarda o digitado** (a lição do §12): os campos são lidos
  na hora de confirmar, e um toque que redesenha devolve o que estava escrito.

## Fase 4 — nota fiscal e custo (07/11/2026)

- **O ICMS próprio não entra no custo pago**: ele está dentro do preço do produto.
  O que se soma é o IPI e o ICMS-ST, que vêm por fora.
- **O crédito é tabela, e a nota guarda o regime dela.** Quando a empresa mudar de
  regime, a compra feita no Simples não ganha crédito para trás.
- **A nota pode chegar antes ou depois da mercadoria.** Antes: o recebimento já
  entra pelo líquido. Depois: o custo médio é corrigido pelo mesmo
  `corrigirCustoPago` que o "preço da nota" de antes usava — o dono único do custo
  médio continua um só.
