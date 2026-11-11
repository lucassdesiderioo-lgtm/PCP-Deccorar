# Regras — O dinheiro nas telas (a regra do valor)

> Cada cartão é **uma regra que vale hoje**, com o motivo, as exceções e o teste
> que impede alguém de desfazê-la. Área nova (11/11/2026), nascida da fase 1 da
> spec [`ARRUMAR-O-LUGAR`](../specs/ARRUMAR-O-LUGAR.md); o resumo está no
> `CLAUDE.md` §23. Formato do cartão: [`README.md`](README.md).
>
> O dono, 11/11/2026: *"sempre que uma tela tiver valor, ela tem que estar
> linkada ao acessos. Então, a gente assinala ou não assinala essa opção para
> que a pessoa tem ou não tem acesso a ver a tela com dinheiro, com valores."*

---

### R-VAL-01 · Toda tela com dinheiro declara a chave do valor
- Regra:            a tela que mostra valor em reais (custo, preço, valor, desembolso, saldo em R$, limite, frete, imposto, dado de pagamento) declara no mapa (`telas.js`, `tecido/nucleo/telas.js`) a chave que libera o valor: `valor:[…]`. A primeira chave é a principal. Quantidade não é dinheiro.
- Por quê:          até 11/11/2026 cada tela decidia sozinha quem via o dinheiro, e em seis lugares ele ia pelo fio para quem não tinha chave nenhuma.
- Exceções:         nenhuma.
- Teste que trava:  `teste_valor.js` §1 (o inventário: 252, 301, 302, 404, 501 e 602–604, 606–611, 614–616 — tela nova com dinheiro entra no mapa E no inventário do teste)
- Status:           em código desde 11/11/2026 (fase 1, falta subir).
- História:         spec `ARRUMAR-O-LUGAR` §1 e §3.

### R-VAL-02 · Abrir a tela e ver o valor são duas caixinhas
- Regra:            na tela de Acessos, debaixo de cada tela com dinheiro, aparece a linha **"R$ Ver valores (R$) desta tela"**, que se marca ou não, por setor ou por pessoa. A mesma chave em duas telas (a `custo.ver` na 301, na 302 e na 404) é uma permissão só, e as caixinhas andam juntas.
- Por quê:          o dono decide quem vê o dinheiro sem mexer em quem abre a tela.
- Exceções:         a chave de valor que também é ação da tela aparece uma vez, na linha de valores.
- Teste que trava:  `teste_valor.js` §4 (o `/api/acesso/registro` traz `valores` em cada tela)
- Status:           em código desde 11/11/2026.
- História:         spec `ARRUMAR-O-LUGAR` §3.

### R-VAL-03 · Sem a caixinha, a tela abre sem o dinheiro, e quem tira é o servidor
- Regra:            os campos de dinheiro não viajam (a chave nem existe no JSON); a tela escreve "—", nunca zero; e a barra diz, uma vez, *"Os valores em R$ desta tela não aparecem para o seu acesso."* (`sem_valor` do `/api/telas/minhas`, desenhado pelo `public/menu_telas.js`).
- Por quê:          esconder na tela e mandar pelo fio não protege nada (regra 14 do §13); e "—" sem explicação parece defeito.
- Exceções:         nenhuma.
- Teste que trava:  `teste_valor.js` §5 (rota a rota) e §4 (`sem_valor`); `tecido/teste/valor.test.js`
- Status:           em código desde 11/11/2026.
- História:         spec `ARRUMAR-O-LUGAR` §3; os seis vazamentos da varredura de 11/11.

### R-VAL-04 · Quem lança dinheiro vê o que lança
- Regra:            a chave de valor tem EQUIVALENTES — as ações que lançam aquele dinheiro. `compras.valores` ← pedido.criar, pedido.aprovar, pedido.pagar, nota.lancar, preco.lancar, custo.ver; `devolucao.valores` ← devolucao.dinheiro; `sobmedida.custo.ver` ← sobmedida.rolo.nota. A lista mora no `valor.js` (dono único), e as rotas e a barra perguntam a ele.
- Por quê:          lançar às cegas seria a armadilha #6.
- Exceções:         **na 252 o dinheiro é parte do caso, não o caso**: quem lança ou acompanha sem a caixinha continua lançando e acompanhando, mas não digita valor (recusa 403 dizendo a chave), e não marca o "Enviado" do item faltante, que pede o frete.
- Teste que trava:  `teste_valor.js` §2b e §5c
- Status:           em código desde 11/11/2026.
- História:         spec `ARRUMAR-O-LUGAR` §3 e §8.

### R-VAL-05 · No sob medida, preço de venda e custo são duas chaves
- Regra:            `preco.ver` libera o PREÇO DE VENDA (catálogo, simulador, pedido e o PDF dele, quadro, indicadores, revendas, financeiro); `custo.ver` (o rótulo virou "Ver custo e valor do estoque") libera o CUSTO (corte, sobras, rolos, cadastros, painel, produção). A poda é do `tecido/dominio/custo.js`: `podarVenda` e `podarCusto`; cada arquivo de rotas chama a do seu lado. A poda de venda também tira o texto com "R$" (o `base` da linha da conta).
- Por quê:          o vendedor precisa do preço da persiana, não do valor do estoque.
- Exceções:         o vendedor nasce com as duas chaves (o pacote e o backfill); o dono tira o custo pela tela de Acessos.
- Teste que trava:  `tecido/teste/valor.test.js` (as duas podas, o lado de cada rota, os quatro vazamentos)
- Status:           em código desde 11/11/2026.
- História:         spec `ARRUMAR-O-LUGAR` §3.

### R-VAL-06 · Toda chave de valor é sensível, e o backfill rodou uma vez só
- Regra:            a chave de valor é `sensivel`. As três novas (`devolucao.valores`, `compras.valores`, `sobmedida.preco.ver`) foram dadas, uma vez só (`config.seed_valor_1`), a quem já via aquele valor: quem lançava ou acompanhava devolução, quem tinha `compras.ver`, quem tinha a `sobmedida.custo.ver`. Daí em diante, quem decide é a tela de Acessos.
- Por quê:          ninguém perde no deploy o dinheiro que via; rodar de novo devolveria a chave a quem o dono tirou.
- Exceções:         é a exceção nomeada à R-ALC-06 ("tudo novo nasce só para o Admin Geral").
- Teste que trava:  `teste_valor.js` §3 (quem ganhou, quem não ganhou, e a chave tirada que não volta)
- Status:           em código desde 11/11/2026.
- História:         spec `ARRUMAR-O-LUGAR` §8.

### R-VAL-07 · Tela nova com dinheiro nasce declarando
- Regra:            tela ou rota nova que mostre dinheiro declara a chave no mapa, passa a leitura pela poda do lado dela e entra no inventário do `teste_valor.js`.
- Por quê:          a regra só vale se a próxima tela não nascer fora dela.
- Exceções:         nenhuma.
- Teste que trava:  `teste_valor.js` §1 (o mapa e o inventário têm que bater)
- Status:           em código desde 11/11/2026.
- História:         spec `ARRUMAR-O-LUGAR` §3.

---

## O que NÃO fazer

- ❌ Mostrar dinheiro numa tela sem a chave `valor` no mapa, ou declarar a chave e mandar o campo pelo fio a quem não a tem.
- ❌ Escrever uma segunda lista de "quem lança vê o que lança": é o `valor.js` (#12).
- ❌ Podar por `subtotal` ou `total` sem olhar o que são: na lista de compras o `subtotal` da origem é QUANTIDADE, e em outras leituras o `total` é contagem.
- ❌ Voltar a usar uma poda só no sob medida, ou trocar o lado de uma rota (venda podando por custo): o vendedor voltaria a ver o valor do estoque, ou deixaria de ver o preço.
- ❌ Rodar de novo o `seed_valor_1`, ou dar uma chave de valor por seed a quem não via o valor antes.
- ❌ Escrever zero onde o valor não veio: é "—".
