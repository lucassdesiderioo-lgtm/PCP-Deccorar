# TEMPO-NA-BANCADA — a pessoa vê o tempo da peça ao lado da própria mediana

> **STATUS — 21/11/2026: RASCUNHO, esperando o "pode seguir" do dono.** As
> escolhas foram feitas na conversa de 21/11/2026 sobre os três exemplos de tela
> (artifact "Tempo na bancada"): **opção B** (duas barras), **a mediana da própria
> pessoa naquele SKU nos últimos 30 dias**, e **só a própria pessoa vê**. Uma fase.
> `REGRA` 🟡 (cálculo exibido; não mexe em estoque, permissão nem schema).

## O pedido

O dono: *"Em todas as telas onde tiver o cadastro de SKU e tempo que o operador
faz o trabalho, quero que apareça: esse SKU fez em tanto tempo e a média do tempo
que você tem é de tanto tempo. Isso para Revisão e Embalagem que temos hoje.
Deixe como regra para aparecer para as próximas telas de controle de tempo de
atividade do operador."*

## A regra (R-TEM-01)

Toda tela que mede o tempo de uma atividade do operador mostra, **ao terminar a
peça**, duas barras no aviso verde:

```
Revisada ✓ · 38 s
BK140140BEGE · liberada para a EMBALAGEM
Agora       ███████████████░░░░   38 s     ← âmbar se passou da mediana, verde se não
Sua média   ████████████░░░░░░░   31 s     ← cinza
```

- **"Sua média" é a MEDIANA** (o tempo do meio) da própria pessoa **naquele SKU**,
  nos **últimos 30 dias**, sem contar a peça que acabou de terminar. Na tela
  continua escrito "Sua média" (decisão do dono): a palavra é a da fábrica, a
  conta é a que não deixa uma peça parada 20 minutos puxar o número.
- **Sem peça daquele SKU no período**, a barra usa a mediana da pessoa em **todos
  os SKUs** e diz isso: *"Sua média (todos os SKUs)"*. **Sem nenhuma peça no
  período**, só a barra de agora aparece, com *"primeira peça — ainda sem média"*.
  Nunca um zero inventado.
- **Só a própria pessoa vê, e só o dela** (decisão do dono). Quem é vem do login
  (`quem.js`), nunca da tela; nenhum nome, id ou tempo de colega viaja.
- **Quem calcula é o servidor**, na resposta do bipe que fecha a peça (o `POST`
  que grava), num campo `tempo: {segundos, mediana, base:'sku'|'geral'|null, n}`.
  A tela só desenha. Nenhuma rota nova, nenhuma permissão nova.
- **Conta-se a linha gravada com o id do login** (`usuario_id`); a linha antiga sem
  id não é de ninguém (a régua da §21). Tempo zero ou vazio fica de fora.
- **O número não trava nada**: o mínimo de 15 s (R-REV-07) e de 45 s (R-EMB-09)
  continuam sendo as únicas recusas por tempo.

## Dono único

`tempo_operador.js` — "qual é a mediana desta pessoa nesta atividade?". Ele usa a
`mediana` do `produtividade_dominio.js` (não escreve uma segunda) e conhece, por
atividade, a tabela e a coluna de tempo: `revisao.segundos` e `montagem.segundos`.
**Tela nova que mede tempo registra a atividade dela ali** e devolve o campo
`tempo` no bipe que fecha — é isso que a regra exige das próximas telas.

## Onde mora

📍 LUGAR: nenhuma tela nova; muda o aviso final da **101 Revisão** e da **102
Embalagem** (Produção · Medida padrão). Nenhuma aba, nenhum módulo.

🔐 ALÇADA: nenhuma tela, ação ou setor novo. O dado vai só a quem fez a peça, na
resposta do próprio bipe (já protegido por `revisao.executar` /
`embalagem.executar` e 401 sem login).

## Fica de fora

- O sob medida (bancada 6xx): tem os bipes dele e outra régua de tempo (R-SMI);
  entra numa spec própria se o dono quiser.
- Mostrar a mediana **durante** o trabalho (era a opção C, não escolhida).
- A tablet com a página antiga em cache: ignora o campo novo e mostra o aviso de
  antes até ser recarregada.

## Como testar

`teste_tempo_operador.js`: a mediana pelo SKU, o recuo para todos os SKUs, a
primeira peça sem média, a peça atual fora da conta, a janela de 30 dias, a
linha de outra pessoa e a sem id fora, o tempo zero fora, e o campo `tempo` na
resposta dos dois `POST`. E abrir as duas telas (testador-tela) a 1024 e 768 px.
