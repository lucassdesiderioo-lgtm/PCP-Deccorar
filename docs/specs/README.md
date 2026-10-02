# Especificações — `docs/specs/`

Aqui moram os **planos** do sistema: o que ainda vai ser construído, ou está sendo.
Como o sistema **funciona hoje** está no `CLAUDE.md` e no resto de `docs/`.

## O ciclo de vida de um documento

```
IDEIA            → conversa no Projeto do Claude (fora do repositório)
SPEC APROVADA    → docs/specs/NOME.md            status: planejado
EM CONSTRUÇÃO    → a mesma spec                  status: em construção
IMPLEMENTADO     → as regras vão para o CLAUDE.md / docs/
                   a spec vai para docs/arquivo/  status: arquivado
```

## As três regras

1. **Um documento mora em um lugar só.** Spec aprovada sai do Projeto e vive aqui.
   Nunca uma cópia lá e outra cá.
2. **Toda spec começa com o bloco de status**, com data. Quem constrói atualiza o
   status **no mesmo commit** do código.
3. **Onde a spec e o `CLAUDE.md` divergirem, vale o `CLAUDE.md`** — ele descreve o
   que está em produção. A divergência é anotada no status da spec.

## Índice — situação em 02/10/2026

| Spec | Status |
|---|---|
| `SOBMEDIDA-PEDIDO-REVENDA.md` | **Em construção** · módulo sob medida (`tecido/`) · **fase 1 em produção e conferida (22/09 — dez persianas reais no corte e dez no preço, as vinte bateram)** · **fase 2 em código (22/09 — revenda, carteira, tabelas A/B/C, feriados e prazo; falta cadastrar as revendas de hoje)** · **fase 3 em código e conferida no deploy (23/09 — o pedido 5001 saiu com duas persianas, duas coleções, mínimo faturado, cascata e prazo, tudo refeito por fora contra o PDF; falta a semana em paralelo ao Decorsoft)** · **fase 4-A em código (23/09 — a etiqueta de produção com código por setor que nasce na aprovação, a reimpressão com o mesmo código e as peças indo para o plano de corte em medida de CORTE — **o leitor bipou no papel**; falta a peça real atravessando os cinco setores)** · **fase 4-B em código (24/09 — o comprometido de tecido: o que está vendido e ainda não foi cortado, no painel do sob medida, e o aviso ao vendedor de pedido aprovado esperando tecido; falta o comprador comprar por ele)** · **fase 4-C em produção (24/09 — o tubo do sob medida chegando ao MESMO Compras do PCP, pela porta única; a peça sai da conta quando a etiqueta dela é impressa; deploy limpo, e a primeira leitura deu vazio porque os tubos do 5001 já tinham sido impressos; **os tubos 38, 41 e 56 cadastrados e os quatro degraus apontados em 24/09** — falta o primeiro pedido real aparecer lá e o comprador comprar por ele)** · **fase 5-A em código (24/09 — os cinco setores da produção no controle de acesso do PCP, um por bancada, nascendo vazios; o papel e os setores viraram duas contas, para quem faz duas coisas não perder a bancada; sobe sozinha para o dono marcar as pessoas)** · **fase 5-A EM PRODUÇÃO (24/09 — os cinco setores no ar, com uma pessoa marcada em cada)** · **fase 5-B1 em código (24/09 — o bipe: as filas por setor com as liberações do §4.15, bandô e barra segurando só a embalagem, o kit conferido contra o kit CERTO, a pendência que a chefia fecha com motivo e o Pronto automático — que é `pronto_em` e NÃO o `marco`, para não quebrar a reimpressão da etiqueta nem as contas da compra; falta a bancada de verdade com o leitor na mão)** · **fase 5 INTEIRA EM PRODUÇÃO (24/09 — 5-A, 5-B1 e 5-B2 no ar; falta a conferência de fábrica das três: a peça atravessando os cinco setores com o leitor na mão, e a bancada recusando uma de verdade)** · **fase 5-B2 em código (24/09 — a recusa: qualquer bancada devolve a peça por defeito do trabalho ANTERIOR escolhendo só o motivo; o motivo aponta o COMPONENTE e o setor sai dele, porque a serralheria faz quatro peças; volta o culpado e tudo que depende dele, pela mesma tabela que libera para a frente; a refeita reimprime a MESMA etiqueta, marcada em vermelho; falta a bancada de verdade recusar uma peça)** · **fase 6-A em código (24/09 — o QUADRO: onde está cada pedido, com a barrinha por setor e o selo de retido; a etapa é DERIVADA de marco + pronto_em + bipes e o `marco` não se mexeu, que é a dívida 15 respondida; desativar coluna não some com o pedido, ele vira aviso)** · **fase 6-A EM PRODUÇÃO (26/09)** · **fase 6-B em código (26/09 — os SETE INDICADORES: tempo de aprovação por vendedor, pedidos parados, prazo cumprido (prometido e negociado SEPARADOS), horas-homem, tempo por m² (pelo m² REAL, nunca o cobrado), produtividade por pessoa e por setor, e recusas contadas na bancada de ONDE VEIO o defeito. Nenhuma tabela nova — eles somam o que a 5-B1 e a 5-B2 gravam; a migração 24 traz só o limite do bipe aberto, que é cadastro. Bipe acima do limite sai das TRÊS médias pela mesma régua e vira pendência. **Em produção ela nasce vazia e isso é a verdade** — a tela separa "ninguém bipou ainda" de "nada no período", que são conselhos opostos. Falta o dono responder pela tela, e isso depende da bancada bipar de verdade)** · **fase 6-C1 em código (26/09 — o BOLETO e o CRÉDITO: `limite − boletos em aberto`, que MOSTRA e não trava. O título é lançado à mão, nunca gerado — o boleto de verdade nasce no banco. Negativo fica negativo; sem limite lançado o disponível é nulo, não zero; pago e cancelado saem da conta e o vencido FICA; número repetido na mesma revenda é recusado; e "aprovado sem boleto" só vale para quem paga em boleto, porque a fábrica recebe em PIX e cartão também. Tela **Financeiro** com a tarefa semanal da carteira, o crédito na ficha da revenda e o selo de crédito estourado no Quadro. **A revisão bimestral do limite já existia desde a fase 2.** O modo de falhar é o OTIMISTA: sem lançamento o disponível fica igual ao limite, e por isso as telas dizem há quantos dias ninguém mexe)** · **fase 6-C1 EM PRODUÇÃO (26/09 — deploy pelo dono, migração 25 aplicada e a tabela `sm_boleto` conferida no banco)** · **fase 6-C1b em código (26/09 — o boleto aponta os PEDIDOS que cobre: migração 26, a coluna `pedido_id` SAIU e nasceu a tabela de vínculo. Pedido do dono no mesmo dia do deploy da 6-C1 — *"um recebimento tem que ser sempre atrelado a um pedido"*. Um título cobre VÁRIOS pedidos (o financeiro junta a semana), e a coluna gravava um só, deixando os outros para sempre em "aprovado sem boleto". Sem pedido nenhum ele passa, mas nasce AVULSO, visível. A tela LISTA os pedidos para marcar em vez de pedir número digitado. O valor que passa da soma dos pedidos AVISA dizendo quanto, e não trava — o parcelamento nunca bate)** · **fase 6-C1b EM PRODUÇÃO (26/09 — deploy pelo dono, migração 26 aplicada, `sm_boleto_pedido` conferida no banco e a tela rodada nos cinco pontos)** · **fase 6-C1c EM PRODUÇÃO E CONFERIDA (26/09 — o que FALTA titular: o dono lançou um boleto menor que o pedido e o saldo devedor não existia em tela nenhuma; e o pedido saía da lista de marcar no primeiro título, o que tornava o PARCELAMENTO não lançável pela tela. A régua passou a ser o dinheiro, com rateio proporcional quando um título cobre vários pedidos; o crédito NÃO mudou — o que falta titular fica ao lado do em aberto, separado, como o "aprovado sem boleto". **A prova é a do caso impossível:** o dono lançou a 2ª parcela apontando o mesmo pedido, ela entrou e a falta caiu — com a régua velha aquele pedido nem apareceria na lista para ser marcado; dos quatro pontos de tela ele relatou este, e os outros três não foram confirmados um a um)** · **fase 6-C2 (NF e entrega) NÃO COMEÇOU — não há quem marque a entrega nem de onde venha a NF, e construir a coluna `entregue` sem isso é a coluna-paisagem que a 6-A recusou** · fases 7 e 8 planejadas · **a lista única do que está pendente fica no topo da spec** · as duas decisões da §8 anteriores à fase 1 estão respondidas |
| `SAIDA-E-DUPLA-CONFERENCIA.md` | **Em construção** · 4 fases · substitui o Fechar coleta de 10/09 · **fase 1 em código (26/09): quem imprimiu e quem bipou gravados, tabela `saida` e o script do passivo — no ar em 26/09; passivo fechado (399 caixas); falta ver os nomes no dado real** · **fase 2 no ar (26/09, PR #138): a conferência da pilha no Carregamento, bipe único (opção A); falta ver a conta num dia real** · **fase 3 no ar (26/09, PR #140): a saída do caminhão, uma por caminhão, com sobras, foto e `saida.liberar`; falta o primeiro caminhão de verdade** · **fase 4 no ar (26/09, PR #142): a viagem à agência, dois bipes na agência, foto da galeria** · as quatro fases no ar; vai para o arquivo depois da primeira viagem e do primeiro caminhão de verdade |
| `CARREGAMENTO-SEGUNDA-PESSOA.md` | **Em construção** · **fase 1 em código (01/10): quem imprimiu não confere, com o nome dele na tela e a liberação do dia; falta o deploy** · fase 2 (caixa de várias peça a peça, etiquetas do saco por fora) planejada · o Carregamento por outro login e a caixa de várias persianas conferida peça a peça, às cegas · muda a decisão 2 da `SAIDA-E-DUPLA-CONFERENCIA` |
| `ESTOQUE-LIVRO-E-CONFERENCIA.md` | **Em construção** · fases 0 e 1 no ar (21/09) · fase 2 no ar (26/09) — a conferência em três papéis · **fase 3 no ar (28/09)** — o ajuste em duas pessoas; falta o primeiro ajuste real pedido por um e aprovado por outro · fase 4 planejada |
| `VENDAS-E-MEDIA.md` | **Em construção** · **fase 1 no ar (26/09, PR #144): a média contada pelo sistema, ao lado da planilha, em Admin → Planejamento — só conferência, a produção não mudou; falta o dono conferir a tabela com o dado real** · **fase 2 no ar (26/09, PR #148): a planilha só espelha as futuras (o recorte não apagou as 4.777 vendas da base), e a venda cancelada no ML sai das listas — falta o primeiro caso real de cancelada** · a troca da fonte (fase 3) espera o ok do dono depois de conferir a tabela |
| `MESA-DE-CORRECOES.md` | **Em construção** · 3 fases · **fase 1 em código (02/10)**: a mesa, a tabela `correcao`, a aba Correções no admin, a chave `correcao.executar` e as duas ações que mais pesam — **descartar fantasma** e **cancelada depois da etiqueta**, que até aqui não se corrigia de jeito nenhum (o card de Bloqueados só mostrava, e agora ele **esvazia**). Três decisões do dono mudaram o caminho: a **régua do fantasma saiu do script já nesta fase** (duas cópias seriam o botão e o terminal apagando linhas diferentes — o EFEITO só se unifica na fase 3), o **"voltou" devolve POR PEÇA e não `+1`** (a caixa de pacote baixou N; sob medida fica de fora), e a **caixa de várias persianas não tem o "voltou"** (o ML cancela um item e o sistema não sabe qual peça é). Sem backfill da chave — o Admin Geral passa por nível — e **os contadores são os dois que têm botão**, porque contador que acusa e não sabe liberar é trava que se contorna. `teste_correcao.js` (115 casos, escrito antes do código, 12 defeitos reintroduzidos); falta a conferência de fábrica, e a **primeira cancelada real depois da etiqueta** |
| `COMPRAS.md` | Implementado (fases 0–6) · fase 7 pendente · com mudanças na construção |
| `ARQUITETURA-ALVO.md` | Parcial — só no módulo sob medida (`tecido/`) |
| `PCP-CONTROLE-E-VISAO.md` | Parcial e divergente · decisão pendente |
| `TABLETS-E-KIOSK.md` | Planejado · nada no código · camada 1 (iPad) pode ir já |
| `PRODUCAO-MAPA-E-MOTOR.md` | Planejado · não iniciado · depois da fila de consertos |
| `PRODUCAO-MONTAGEM.md` | Planejado · não iniciado · depois da fila de consertos |

## O pacote de 21/09/2026 — a ordem é do dono, e está aqui porque ordem combinada em conversa é a primeira coisa que se perde

As três specs novas são **um pacote só**, e uma depende da outra. A ordem de
construção, decidida pelo dono em 21/09/2026:

```
fase 0 (consertos, sem spec)
   └─▶ ESTOQUE F1   o livro de movimentos      ← base de tudo
          └─▶ VENDAS F1   a média do sistema, lado a lado
                 └─▶ VENDAS F2   planilha só de futuras + canceladas
                        └─▶ ESTOQUE F2 e F3   conferência e ajuste em duas pessoas
                               └─▶ MESA F1 ✅ a F3   a mesa de correções e os scripts
                                      └─▶ ESTOQUE F4 e VENDAS F3   acuracidade e a troca da média
```

> ⚠️ **A fase 1 do livro não começa antes dos consertos da fase 0.** Um deles é
> justamente a aprovação de contagem que grava o número contado como saldo e apaga
> o que andou entre contar e aprovar — é o defeito que o `saldo_na_contagem` da
> `ESTOQUE-LIVRO-E-CONFERENCIA.md` §5.4 resolve de vez. Consertar depois do livro
> seria consertar duas vezes.

**Implementada e arquivada em 17/09/2026:** `GERADOR-ETIQUETA-KIT.md` — as
quatro fases (conteúdo, prévia, impressão em PDF e a remoção do upload),
conferidas em produção. As regras estão no `CLAUDE.md` §4.

**Implementada e arquivada em 25/09/2026:** `CARREGAMENTO-ADIANTADO.md` — as
peças que saem adiantadas, no quadro do Carregamento. As regras estão no
`CLAUDE.md` §8-B.

**Implementada e arquivada em 02/10/2026:** `CORTE-EM-ETAPAS.md` — as sete
fases no ar desde 01/10 (PR #165) e as quatro provas de fábrica feitas em 02/10
(corte inteiro pelas etapas, correção do corte de 01/10, sobra lida pela foto no
iPad e o caso da S-000091 no plano). As regras estão no `CLAUDE.md` §19 e no
`tecido/README.md`. Fica aberta a confirmação do dono de que quem pede a
correção não a aprova (`docs/DECISOES.md`).

**Implementada e arquivada em 02/10/2026:** `NAVEGACAO-E-LINGUAGEM.md` — o
"Trocar setor" e o atalho entre as duas operações nas duas barras, o destino com
dono único (`destino.js`) e os textos sem hierarquia, com o `teste_linguagem.js`
travando as duas regras. Fase 1 no PR #169, fases 2 a 4 no #173. As regras estão
no `CLAUDE.md` §20.

**Substituída e arquivada em 01/10/2026:** `SOBRAS-TOM-E-DESPERDICIO.md` — a
limpeza (fase 1, rodada em produção em 19/09) e a mensagem do plano (fase 2)
foram feitas; o resto (tom pela origem, desperdício por sobra, menor refugo)
entrou na `CORTE-EM-ETAPAS.md` (hoje também arquivada), fases 4 e 7.

**Arquivado sem construir em 26/09/2026:** `COLETA-LEVA-AGENCIA.md` — o
rascunho de 25/09 que trocava a modalidade da caixa da agência levada pelo
caminhão. Substituído pela `SAIDA-E-DUPLA-CONFERENCIA.md`, que resolve pela
troca de porta (`saiu_por`) sem mexer na modalidade.

Em `docs/arquivo/`: `CORTE-EM-ETAPAS.md`, `NAVEGACAO-E-LINGUAGEM.md`, `SOBRAS-TOM-E-DESPERDICIO.md`, `COLETA-LEVA-AGENCIA.md`, `CARREGAMENTO-ADIANTADO.md`, `GERADOR-ETIQUETA-KIT.md`, `REVISAO-COMPLETA.md`,
`ESTOQUE-TECIDO-E-SOBRAS.md`, `PROMPT-ESTOQUE-TECIDO-E-SOBRAS.md`,
`PROMPT-FASE-0.md`, `PERGUNTAS-COMPRAS.md`, `GESTAO-DE-TAREFAS.md` e
`MELHORIAS.md` (os sete últimos arquivados por decisão do dono em 17/09/2026).
