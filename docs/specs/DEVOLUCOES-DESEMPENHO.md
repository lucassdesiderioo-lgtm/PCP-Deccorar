# Devoluções — os casos de cada responsável e o histórico de desempenho

```
STATUS
Situação: EM CÓDIGO (04/11/2026), num PR só — falta o deploy e a conferência
  do dono na tela
Tipo: AJUSTE (parte A) + NOVIDADE (parte B, relatório) · risco 🟡 · sem
  schema novo, sem regra nova, sem permissão nova
Aprovada pelo dono em 04/11/2026 ("já vamos incluir histórico de desempenho")
Depende de: CLAUDE.md §9-B (o responsável como pessoa, o próximo passo)
Testes: teste_devolucao_casos.js 845 → 870 · teste_devolucao_casos_tela.js 180 → 193
```

## 1. O problema

O dono (04/11/2026): *"eu tendo login de admin poderia ver os casos que estão
disponíveis para o Renato e vendo se ele está fazendo as tarefas dentro do
prazo?"*. A lista mostrava o nome do responsável em cada linha, mas não
filtrava por outra pessoa (o "Meus casos" só olhava quem estava logado) e não
havia resumo nem história por pessoa.

## 2. Decisões do dono (04/11/2026)

- O caso conta para **o responsável** — a pessoa escolhida no sistema
  (`responsavel_id`) — e não para quem clicou cada passo.
- O histórico mostra, por pessoa e mês a mês: **prazos do ML cumpridos**,
  **casos encerrados e como**, **tempo até encerrar** e **vezes parado**.
- Conta **daqui para frente**: o caso sem pessoa escolhida (os antigos, só com
  o nome escrito à mão) fica em **"Sem responsável"**, sem chute.

## 3. Parte A — a lista aberta

- **"Casos de: Todos · Eu · [pessoas] · Sem responsável"** no lugar do botão
  "Meus casos". "Eu" é o "Meus casos" de antes (quem não tem caso vê tudo).
  Lembrado por aparelho.
- **Quadro "Por responsável"**: uma linha por pessoa com caso aberto — casos,
  esperando a gente (`proximo.nossa`), vencidos, vencem hoje/amanhã
  (`cor = vermelho`), parados. Tocar na linha filtra.
- Conta: `devcaso_dominio.resumoPorResponsavel`, sobre as mesmas linhas da
  lista (`listar().por_responsavel`). A tela não conta.

## 4. Parte B — o histórico (aba "Desempenho")

`devcaso_dominio.desempenho(db, mes)`, `GET /api/devolucao-casos/desempenho?mes=AAAA-MM`.

- **Quais casos:** os encerrados no mês (`encerrado_em`), fora os de teste.
- **Quem:** o `responsavel_id` do caso (o retrato `responsavel_nome`).
- **Prazo cumprido:** o caso chegou à etapa que cumpre o prazo (comprovante →
  "Documentos ao ML" ou adiante; coleta → "A caminho" ou adiante; "revisar no
  ML até" → "Já revisei") **até o fim do dia do prazo final**. Chegou depois,
  ou fechou como **perda** sem chegar: vencido. Fechou por outro caminho sem
  chegar: não decide. O prorrogado conta pelo prazo novo e é contado à parte.
- **Encerrados como:** a contagem por saída.
- **Tempo até encerrar:** mediana, em dias corridos, da abertura
  (`aberta_em`, ou `criado_em`) até o encerramento, com o maior ao lado.
- **Vezes parado:** intervalos entre dois "andar" (`ANDAM`) que chegaram ao
  `devol_parado_dias`; mostra quantos e o maior.
- **Sem dado não é zero:** sem prazo decidido mostra "—"; mês sem caso
  encerrado diz isso.
- **Nenhum valor em reais.** Quem vê: quem já abre a tela.

## 5. Fica de fora

Atribuir passo a passo a quem clicou; ligar casos antigos a pessoas pelo nome;
meta ou nota por pessoa; valores em reais por pessoa; aviso por WhatsApp ou
e-mail.
