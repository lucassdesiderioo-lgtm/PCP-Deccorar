# HORÁRIOS DE COLETA — a hora do caminhão do ML dentro do PCP

> **STATUS · 05/11/2026 — EM CÓDIGO (fases 1 e 2), falta subir**
> - **Fases 1 e 2 em código em 05/11/2026**: `coleta_horario.js` (dono único),
>   `coleta_horario_route.js`, a tela 206 `/coleta-horarios`, o quadro do upload
>   (`public/saida_upload.js`) no upload (só na 103 desde o AJUSTE do mesmo dia), `lote.horario_id`, a faixa da
>   próxima coleta no `nav.js` e a agência pelo horário lançado. Cartões R-HCO-01
>   a R-HCO-10; `teste_horario_coleta.js` (89). Falta o deploy e a prova de
>   fábrica: o primeiro PDF subido com a saída e a faixa contando as caixas.
> - **AJUSTE do mesmo dia (decisão do dono, D1 (a) e D2):** subir o PDF passou a
>   ser num lugar só, a **103 Lançar produção** (que abre também com
>   `pdf.subir` e caiu para nível Operação); a **203 Subir PDF saiu** do mapa
>   (`/expedicao` só redireciona) e a caixa de upload da 201 também. O quadro da
>   saída e a faixa ficaram na 103.
> - **AJUSTE do mesmo dia (decisão do dono):** a alçada mudou — `coleta.horario`
>   e a tela 206 passaram a nível **Supervisor**; quem é Operação vê os horários
>   travados e escolhe a saída no upload pela permissão de subir o PDF (R-HCO-11).
> - **O que se decidiu na construção (vale o `CLAUDE.md`):** a venda de outro
>   dia e a de outra modalidade não ganham a marca (a modalidade é a da
>   etiqueta); a coleta corrigida mantém o id e a tirada solta as caixas; o
>   relógio do status é aberto a quem trabalha na Expedição e a todo nível
>   Supervisor ou acima (`@supervisor`, token novo no `permDaRota`); Revisão e TV
>   ficaram de fora (D5).
> - Desenhado na conversa com o Lucas em 05/11/2026, com duas telas do Mercado
>   Livre na mão (Preferências de venda → Horários de envio, e Vendas → Envios
>   de hoje). **Aprovada pelo dono no mesmo dia**, com as respostas da §11 —
>   **onde a §11 e o resto do texto divergirem, vale a §11.**
> - `NOVIDADE` e muda uma regra que está no ar (**R-COL-02**: *"o relógio de
>   despacho é só da agência"*; e o §8-B do `CLAUDE.md`: *"coleta: só o dia — o
>   caminhão não tem hora"*).

---

## 1. O problema

99% das vendas saem pela **coleta** — o caminhão do ML vem buscar na fábrica.
O PCP não sabe a hora em que ele vem: a coleta só tem o dia. Toda a pressa da
bancada (a contagem regressiva da Etiqueta de Venda, o aviso de corte da
Revisão) é a da **agência**, que quase não se usa mais.

O que o dono viu no ML nesta semana:

| Quando ele olhou | Quinta-feira, 05/11 |
|---|---|
| segunda, 02/11 (Preferências de venda) | 3 coletas: 09:00–11:00 (vendido até 07:00) · 12:00–14:00 (até 10:00) · 15:00–17:00 (até 13:00) |
| quinta, 05/11, 06:51 (Preferências de venda) | 2 coletas: 12:00–14:00 (até 10:00) · 15:00–17:00 (até 13:00) |
| quinta, 05/11, 06:53 (Envios de hoje) | 2 coletas: 12:00–14:00 (70 vendas) · 15:00–17:00 (3) — **sem o horário de corte** |

Três coisas saem daí, e elas decidem o desenho:

1. **O horário muda durante a semana.** O que se sabe na segunda não vale até
   sexta. Por isso o horário é **da data**, não do dia da semana (o contrário do
   corte e do despacho da agência, §8 do `CLAUDE.md`).
2. **O número de coletas muda** — 0 a 3 por dia nesta semana.
3. **O corte ("vendido até") só aparece em Preferências de venda.** A tela que
   a pessoa abre todo dia, Envios de hoje, mostra só a janela do caminhão.

## 2. O que existe hoje (e não muda)

- `config.corte_<dia>` e `config.despacho_<dia>` (padrão 10:30 e 15:00), da
  **agência**, por dia da semana. `GET /api/config/horarios` lê, `POST` grava
  (`horarios.editar`, Admin) — sem tela, só pelo banco. **Ficam como estão**: a
  agência continua com o relógio dela (resposta 3 do dono: não há informação, e
  quase não se usa).
- A coleta continua sem hora **na etiqueta** e no `lote`: a etiqueta traz só a
  data (`despachar_em`). Isso não muda.

## 3. A ideia em uma frase

**Quem sobe o PDF de manhã lança junto as coletas de hoje** (a janela que ele vê
em Envios de hoje); **na segunda, alguém lança a semana** com os cortes (de
Preferências de venda), numa tela própria; e **a bancada passa a ver a hora do
caminhão** — quanto falta e quantas caixas ainda faltam.

## 4. Onde o horário entra

### 4.1 No upload do PDF (o caminho principal — resposta 2 e 5 do dono)

Na caixa "Subir PDF" (tela 203 e o bloco de upload da Etiqueta de Venda, 201),
acima do arquivo, um quadro **"Coletas de hoje no Mercado Livre"**:

```
Coletas de hoje · quinta 05/11                       (como está no ML → Envios de hoje)
  Coleta 1   [12:00] às [14:00]      corte 10:00 (lançado na segunda)
  Coleta 2   [15:00] às [17:00]      corte 13:00
  + coleta     ☐ hoje não tem coleta
```

- Vem **preenchido** com o que já está lançado para hoje (da segunda, ou de um
  upload anterior do dia). Se está igual ao ML, a pessoa só sobe o PDF.
- Mudou alguma coisa → ela corrige ali e sobe. O corte não se digita aqui (o
  Envios de hoje não mostra), mas se a **janela** de uma coleta mudou, o corte
  dela vira **"a conferir"** em âmbar: horário que mudou de janela quase sempre
  mudou de corte.
- **Não trava o upload.** Subir o PDF sem horário passa, e a tela diz em âmbar
  *"sem horário de coleta lançado hoje"*. Trava que dispara no dia normal vira
  desvio (armadilha #6).

### 4.2 Na tela nova 206 "Horários de coleta" (a semana)

Igual à tela do ML que o dono mandou: **Semana atual · Próxima semana**, uma
grade com as coletas (1 a 3) por dia (seg a sáb), cada uma com **janela** e
**corte**.

- Na segunda alguém copia de Preferências de venda → Horários de envio.
- Também é onde se corrige um corte "a conferir".
- Embaixo, a **história** do dia escolhido: cada mudança, com quem, quando e
  por onde (upload ou tela). É o que responde *"quando foi que a coleta das 9
  sumiu?"*.
- Dia que já passou é **só registro** (resposta 6 do dono): não se edita, não
  se confere, nada é cobrado.

## 5. O que a bancada passa a ver (resposta 4 — "refinar a ideia")

A pergunta que importa no chão de fábrica é **"dá tempo de pôr no canto antes
de o caminhão chegar?"**. O caminhão pode chegar no **começo** da janela, então
o relógio conta até o **início** dela.

| Tela | O que aparece | Por quê |
|---|---|---|
| **201 Etiqueta de Venda** | *"Próxima coleta 12:00–14:00 — faltam 2h10 · 18 etiquetas de coleta para hoje ainda por imprimir"*, **âmbar** abaixo de 2 h, **vermelho** abaixo de 1 h (a mesma régua da agência, §8) | é onde a fila anda; hoje o relógio que está lá é o da agência, que quase não sai |
| **202 Conferência** | *"Coleta 12:00–14:00 — faltam 2h10 · 12 caixas de coleta ainda não conferidas"* | caixa não conferida não está no canto |
| **105 TV** | quadro **Próxima coleta**: a janela, quanto falta e as caixas que faltam (imprimir e conferir) | todo mundo vê sem abrir tablet |
| **101 Revisão** | no aviso de status, no lugar do corte fixo da agência: *"Corte da coleta das 15:00: 13:00"* — vendas até lá saem hoje | o corte que vale para 99% das vendas é o da coleta |

Regras do relógio:

- Depois do **fim** da janela, aquela coleta sai e o relógio passa para a
  próxima. Depois da última: *"Coletas de hoje encerradas"* — e, se ainda há
  caixa de hoje no canto, o caminho continua sendo o "🚚 A coleta não passou
  hoje" de sempre (R-FIM-01, não muda).
- Sem horário lançado hoje: *"Horário da coleta não lançado"*, cinza, sem
  alarme. **Vazio não é "sem coleta"**: "hoje não tem coleta" é uma marcação
  feita por alguém.
- Dia marcado sem coleta: *"Hoje não tem coleta"*.

> ⚠️ **O PCP NÃO REPARTE AS CAIXAS ENTRE AS COLETAS.** O ML diz no painel
> quantas vendas vão em cada coleta (70 e 3), mas a etiqueta não diz qual é
> qual. O número na bancada é **"as de coleta de hoje que faltam"**, contra a
> **próxima** coleta — a primeira é a que aperta. Adivinhar a coleta de cada
> caixa pela hora da venda seria inventar dado (§9, pergunta D4).

## 6. Regras (cartões novos R-HCO, em `docs/regras/carregamento.md`)

| Cartão | Regra |
|---|---|
| R-HCO-01 | O horário da coleta é da **data**, e não do dia da semana: o ML muda durante a semana |
| R-HCO-02 | De 0 a 3 coletas por dia; cada uma com janela (início < fim) e corte opcional, antes do início |
| R-HCO-03 | Lançar de novo **substitui** o horário do dia, e o anterior fica na história, com quem e por onde |
| R-HCO-04 | Vazio não é "sem coleta": dia sem lançamento diz "não lançado"; "sem coleta" é marcação explícita |
| R-HCO-05 | Nada trava: o upload sem horário passa, com o aviso |
| R-HCO-06 | O relógio conta até o **início** da janela; depois do fim, passa para a próxima |
| R-HCO-07 | Janela mudada no upload deixa o corte dela "a conferir" |
| R-HCO-08 | Dia passado é só registro: não se edita, não cobra |
| R-HCO-09 | O PCP não diz qual caixa vai em qual coleta |
| R-HCO-10 | A agência continua com `corte_<dia>` / `despacho_<dia>`; os dois relógios não se misturam |

**Muda a R-COL-02.** Antes: *"o relógio de despacho é só da agência; a coleta
não tem hora"*. Depois: *"a agência tem o relógio do `config`; a coleta tem o
dela, pelo horário lançado do dia"*. Linha em `docs/DECISOES.md` no commit da
fase 1.

## 7. Dados

Tabela nova `coleta_horario` (dono único: `coleta_horario.js`):

| Coluna | O quê |
|---|---|
| `data` | o dia (`AAAA-MM-DD`) |
| `ordem` | 1, 2 ou 3 |
| `inicio`, `fim` | a janela, `HH:MM` |
| `corte` | `HH:MM` ou vazio |
| `corte_conferir` | 1 quando a janela mudou depois do corte lançado |
| `sem_coleta` | 1 numa linha única do dia, quando alguém marca "hoje não tem coleta" |
| `usuario_id`, `usuario_nome`, `lancado_em`, `origem` | quem, quando, por onde (`upload` · `tela`) — pelo `quem(req)` |

E `coleta_horario_evento` para a história (o dia inteiro antes e depois, a
cada lançamento). O modo teste **não** entra nela: horário não é dado de
operação que o teste suje — fica anotado para a revisão do plano.

## 8. Fases

| Fase | O quê | Risco |
|---|---|---|
| **1** | Tabela, `coleta_horario.js`, as rotas, o quadro no upload (203 e 201) e a tela 206. A bancada ainda não muda | 🔴 schema e acesso |
| **2** | O relógio da coleta na Etiqueta de Venda, na Conferência, na TV e o corte na Revisão | 🟡 |

As duas podem ir numa entrega, com um commit por fase.

## 9. Perguntas ao dono

- **D1.** No upload, o horário é **opcional com aviso** (proposta) ou
  **obrigatório** para subir o PDF?
- **D2.** **Sábado** entra na grade (o ML mostra a coluna)? Proposta: sim, vazio
  quando não houver.
- **D3.** Quem lança: a **mesma pessoa que sobe o PDF** (proposta: ação nova
  `coleta.horario`, nível Operação, que o dono dá ao setor de quem sobe) — e a
  tela 206 abre para ela também?
- **D4.** Na bancada, o número de caixas é **"as de coleta de hoje que faltam"**
  (proposta). Repartir por coleta só seria possível se o ML dissesse qual venda
  vai em qual — e ele não diz na etiqueta.
- **D5.** As quatro telas do §5 — todas, ou alguma fica de fora?

## 10. Alçada (R-ALC-08)

| | Nº · nome | Módulo | Nível | Sugestão |
|---|---|---|---|---|
| **Tela nova** | **206 · Horários de coleta** (`/coleta-horarios`) | 200 Expedição | Operação | abre com `coleta.horario` |
| **Ação nova** | **`coleta.horario`** — *Lançar horários de coleta* | usada na 206 e na 203/201 (quadro do upload) | Operação | não sensível (não mexe em estoque, dinheiro, acesso nem pessoa) · setor sugerido: o de quem sobe o PDF (Expedição) |
| **Setores novos** | nenhum | | | |

**Quem recebe: só o Admin Geral, até o dono marcar na tela de Acessos**
(R-ALC-06). Até lá, quem sobe o PDF **não vê** o quadro de horários — ele
aparece quando a ação for dada.

As leituras do relógio (Etiqueta de Venda, Conferência, TV, Revisão) entram nas
rotas de status que essas telas já leem, com a permissão que elas já têm:
nenhuma chave nova para ver.

`horarios.editar` (agência) **não muda**.

## 11. Decisões do dono (05/11/2026) — valem sobre o texto acima

- **D1 · aviso.** Subir o PDF sem horário passa, com o aviso âmbar.
- **D2 · sábado entra** na grade, vazio quando não houver coleta.
- **D3 · ok.** `coleta.horario`, nível Operação, para quem sobe o PDF; a 206
  abre com ela.
- **D4 · muda o desenho: o PDF diz de qual saída são as vendas.** No upload, a
  pessoa escolhe **para qual saída** são as vendas daquele PDF — *Coleta
  12:00–14:00*, *Coleta 15:00–17:00*… — e cada volume novo do PDF fica ligado
  àquela coleta (`lote.horario_id`). Com isso a bancada conta **por coleta**
  (o §5 deixa de dizer "as de hoje que faltam" e passa a dizer "as desta
  coleta que faltam"), e a R-HCO-09 cai. O que não foi marcado (PDF subido sem
  escolher, venda de antes) aparece à parte, como **"sem coleta marcada"**.
- **D5 · onde aparece:** em **todas as telas de operação do módulo Expedição**
  (201 Etiqueta de Venda, 202 Conferência, 203 Subir PDF) e para **quem tem
  nível Supervisor ou acima**, em qualquer tela.
- **D6 · a agência também.** Quando houver venda para agência, o PDF sobe
  dizendo *"Agência"* e o horário que aparece na tela do ML. O relógio da
  agência passa a usar esse horário; sem ele, continua o `despacho_<dia>` do
  `config`.
