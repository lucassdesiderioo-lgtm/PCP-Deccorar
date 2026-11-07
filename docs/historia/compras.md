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
