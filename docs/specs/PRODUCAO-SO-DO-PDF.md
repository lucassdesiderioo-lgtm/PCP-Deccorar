# PRODUÇÃO SÓ DO PDF — a 103 vira "Subir PDF de vendas"

> **STATUS · 05/11/2026 — APROVADA pelo dono (§9), espera o "pode seguir" do plano**
> - Nasceu da D3 da conversa do upload único (05/11/2026): *"vejo que essa
>   lista já não faz mais sentido também em ter"*. O dono respondeu: a produção
>   nasce **só do PDF e do arquivo que subimos no Planejamento**; a 103 pode se
>   chamar **"Subir PDF de vendas"**; a lista **não é mais usada** (*"lá no
>   começo a gente usava, mas agora não mais"*).
> - `REGRA`: muda como a ordem do dia nasce (§2 e §3 abaixo).

---

## 1. O problema

A 103 tem três coisas, e só uma é usada:

| Na tela | O que faz | Usado? |
|---|---|---|
| **Subir PDFs do Mercado Livre** (com o quadro da saída) | grava as vendas em `lote` | **sim** — é o lugar único desde 05/11/2026 |
| **Selecione os SKUs e as quantidades a produzir** + **Lançamentos de hoje** | `POST /api/producao`: grava ordem manual em `producao` (sem `origem`) | **não**, diz o dono |
| **Lançar N urgentes na produção** (painel embaixo do upload, só `@admin`) | `POST /api/cruzamento/aplicar`: transforma a urgência do PDF em ordem vermelha (`producao`, `origem='ml'`, `urgente=1`) | **sim**, e é aqui que mora o problema da §2 |

## 2. O que o código mostrou (e o dono precisa saber)

> ⚠️ **A URGÊNCIA DO PDF SÓ VIRA ORDEM QUANDO ALGUÉM CLICA.** O upload calcula
> a urgência (venda sem estoque), mas ela só entra na ordem do dia — a tela
> vermelha da Revisão, a TV, o abatimento da embalagem — quando uma pessoa com
> `producao.lancar` aperta **"Lançar N urgentes na produção"**. O painel é
> `@admin`: **quem é Operação e sobe o PDF (desde o upload único) nem vê o
> botão**. Se o Admin não abrir a 103 depois, a urgência do dia não chega à
> Revisão.

A reposição (tela **azul** da Revisão) **não** passa pela `producao`: ela é
calculada ao vivo da planilha do Planejamento (`demanda_dominio`, §3 do
`CLAUDE.md`). Ela não muda aqui.

## 3. O papel do Planejamento (palavras do dono, sem mudança de código)

O arquivo que se sobe no Planejamento tem duas finalidades, e **já as tem**:

1. **As vendas que já temos e vão ser entregues para frente** — as futuras, o
   *comprometido* (coluna "Estado").
2. **Os 30 ou 60 dias passados** — o movimento de vendas, a *média*, que dá o
   alvo de estoque de cada persiana (coluna "Data da venda", `janela_media`).

Esta spec não mexe no Planejamento; ela registra que é dele, e do PDF, que a
produção nasce.

## 4. A proposta

- **A lista sai.** Os cartões "Selecione os SKUs…" e "Lançamentos de hoje"
  deixam a 103, e o `POST /api/producao` deixa de existir (a rota sai: nasce
  negada, #29). O `GET /api/producao` fica enquanto alguém ler.
- **A urgência entra sozinha (D1, proposta).** No fim de cada upload, o
  servidor roda o mesmo `aplicar` de hoje — ele já é **idempotente**: apaga as
  ordens `ml` do dia e refaz só as urgentes (R-URG-02). O botão sai. O painel
  do cruzamento fica como **leitura** ("o PDF gerou N urgentes"), para quem é
  Admin.
- **A 103 passa a se chamar "Subir PDF de vendas"** (número 103 continua,
  R-TEL-02). O endereço `/admin/producao` fica (é o que os favoritos guardam);
  o subtítulo muda.
- **As ordens manuais que já existem** no banco ficam como estão (história);
  nenhuma linha é apagada.

## 5. Regras (cartões novos)

- **R-PRD-01** A ordem do dia nasce de dois lugares: a urgência do PDF (sozinha,
  no upload) e a reposição da planilha (tela azul, ao vivo). Não há lançamento à
  mão.
- **R-PRD-02** Aplicar a urgência no upload é o MESMO recálculo de hoje
  (R-URG-02): apaga as ordens `ml` do dia e refaz as urgentes pela conta de
  agora — que já desconta o que foi produzido e expedido, e por isso não infla.
  As ordens manuais antigas não se tocam.

## 6. Alçada (R-ALC-08)

| | | |
|---|---|---|
| Telas novas | nenhuma | a 103 muda de **nome** ("Subir PDF de vendas"), mesmo número, mesmo nível (Operação) |
| Ações novas | nenhuma | `producao.lancar` **fica no registro** (trocar ou apagar chave tira permissão em silêncio, #13), sem tela que a use; o dono decide depois se sai |
| Setores novos | nenhum | |

## 7. Perguntas ao dono

- **D1.** A urgência do PDF passa a entrar **sozinha** na ordem do dia, a cada
  upload (proposta), ou continua por um botão — e, se botão, de quem (hoje só
  Admin)?
- **D2.** Antes de tirar: rodar no servidor a consulta abaixo, que mostra se
  houve lançamento à mão nos últimos 30 dias. Se aparecer linha, alguém ainda
  usa.

```bash
cd /opt/expedicao && sqlite3 dados.db "SELECT data, COUNT(*) linhas, SUM(qtd) pecas FROM producao WHERE COALESCE(origem,'')<>'ml' AND data >= date('now','-30 days') GROUP BY data ORDER BY data DESC"
```

- **D3.** O subtítulo da 103 hoje diz *"Lance o dia · corrija o estoque ·
  cadastre SKUs"*. Fica só *"Suba o PDF das vendas do Mercado Livre"*?

## 8. Fase

| Fase | O quê | Risco |
|---|---|---|
| **1** | a lista sai, a urgência entra no upload (se D1 = sim), o nome muda, cartões e testes | 🔴 dados de produção (a ordem do dia) |

## 9. Decisões do dono (05/11/2026) — valem sobre o texto acima

- **D1 · sozinha.** A urgência do PDF entra na ordem do dia a cada upload; o
  botão "Lançar N urgentes" sai.
- **D2 · ninguém usa.** O dono conferiu: ninguém lançou nada na lista.
- **D3 · "PDF de vendas".** A 103 se chama **Subir PDF de vendas**, e o
  subtítulo fala do PDF de vendas do Mercado Livre.
