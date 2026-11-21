# EMBALAGEM-DEFEITO-VOLTA — a peça com defeito volta da embalagem para a revisão

> **STATUS — 21/11/2026: APROVADA E CONSTRUÍDA, falta subir.** O dono respondeu as
> três perguntas do pedido (conta na 104 como "achado na embalagem"; só persiana;
> motivo obrigatório) e aprovou as seis sugestões da §7 (*"pode seguir"*). Uma fase.
> `REGRA` 🔴. Cartão **R-EMB-11** em `docs/regras/estoque.md`; linha em
> `docs/DECISOES.md`. A conta da peça com problema passou a ter dono único
> (`rejeicao_dominio.js`), usado pela Revisão e pela volta.

## 1. O pedido

O dono, 21/11/2026: *"A pessoa pode assinalar que está com defeito e devolver para
a revisão. E essa peça que voltar aparecer na tela da revisão que está voltando por
defeito (verificar qual problema e enviar ao setor responsável). Quem pode dizer
que está ou não com problema é quem está fazendo o serviço. Essa pessoa tem
autonomia de assinalar o problema de uma peça."*

Hoje quem embala e acha defeito não tem o que fazer no sistema: ou embala assim
mesmo (e a peça com defeito vira estoque, +1), ou leva a peça de volta na mão e a
fila continua dizendo que ela está esperando embalagem.

## 2. O caminho

```
EMBALAGEM (102)                 REVISÃO (101)                       PRODUÇÃO
bipa o SKU → "Peça com defeito"  "Voltaram da embalagem"
  escolhe o motivo        ──▶    a peça aparece em cima, com     ──▶  defeito confirmado:
  nada embala, nada soma         o motivo, quem achou e quando        vai ao setor responsável
  a linha da fila sai                                                 (vira peça com problema)
                                 o revisor confere a peça
                                                                 ──▶  sem defeito:
                                                                      revisa de novo (2 bipes)
                                                                      e volta à fila da embalagem
```

## 3. A regra

**Na Embalagem (102):**

- Com a embalagem aberta (depois do 1º bipe, o do SKU), aparece o botão **"Peça com
  defeito"**, ao lado do "Cancelar embalagem". **Só para persiana** (modelo com
  medida, a mesma régua da R-EMB-02); kit, acessório e sob medida não têm o botão.
- Tocar abre a escolha do **motivo, obrigatório** (sem motivo não grava) e um campo
  de observação opcional.
- **Quem embala decide sozinho** (decisão do dono: autonomia de quem faz o serviço).
  Não há aprovação nem segunda pessoa.
- Gravado: **nada embala e nada soma** (sem +1, sem baixa de material). A embalagem
  aberta é zerada, e a tela diz *"Peça devolvida à Revisão por defeito"* até o
  próximo bipe.
- **A linha da fila daquela peça sai de "aguardando"** e passa a `defeito` (situação
  nova). Assim a persiana não pode ser embalada de novo sem passar outra vez pela
  Revisão (R-EMB-02). A linha não é apagada: é o rastro de onde a peça estava.
  Qual linha sai: a mais antiga daquele SKU, a mesma que a embalagem consumiria.
- O registro grava quem achou (id e nome do login, `quem.js`), quando, o SKU, o
  motivo, a observação e os segundos desde o 1º bipe.

**Na Revisão (101):**

- No alto da tela, um bloco **"Voltaram da embalagem por defeito (N)"**: SKU,
  medida e cor, o motivo, quem achou e há quanto tempo. Ele some quando zera.
- O revisor confere a peça e escolhe um de dois caminhos:
  1. **"Tem defeito — enviar ao setor"**: escolhe o **setor responsável** (§7, Q3).
     Isso grava a **peça com problema** de sempre (a tabela `rejeicao`, a mesma da
     R-REV-06) marcada como **achada na embalagem**, com o setor. Ela vira "material
     extra a decidir" na 106, como a peça com problema da Revisão já vira (§24).
  2. **"Não tem defeito"**: a volta é fechada com quem decidiu, e a peça **é revisada
     de novo pelos dois bipes**, como qualquer outra. É a revisão nova que a põe de
     volta na fila da embalagem — uma porta só para a fila (§7, Q2).
- Quem achou o defeito na embalagem **pode** ser o mesmo que confere na revisão? Ver
  §7, Q4.

**Na 104 Problemas:**

- A peça com problema achada na embalagem conta junto com as outras, e aparece
  separada: **"achado na revisão"** e **"achado na embalagem"** (resposta do dono,
  21/11/2026), com o setor responsável quando houver.

## 4. O que não muda

- **Estoque:** nada. A peça com defeito nunca chegou a somar; quem soma é só a
  embalagem que fecha (R-EST-02).
- **R-EMB-02:** continua valendo. A peça devolvida não tem linha `aguardando`, então
  a embalagem a recusa até ela ser revisada de novo.
- **A "Peça com problema" da Revisão** continua como é: a revisão acha o defeito e a
  peça volta à produção sem entrar na fila.
- **O tempo na bancada (R-TEM-01):** a embalagem devolvida não grava `montagem`, e
  por isso não entra na mediana de ninguém.

## 5. Onde mora

| Função | Tela | Módulo · bloco | Liga-se a |
|---|---|---|---|
| Botão "Peça com defeito" | 102 Embalagem (já existe) | Produção · Medida padrão | grava a volta; tira a peça da fila |
| Bloco "Voltaram da embalagem por defeito" | 101 Revisão (já existe) | Produção · Medida padrão | lê as voltas abertas; grava a peça com problema ou fecha a volta |
| "Achado na embalagem" e setor | 104 Problemas (já existe) | Produção · Comum | lê a tabela `rejeicao` |

Nenhuma tela, aba ou módulo novo.

## 6. Alçada

- **Telas novas:** nenhuma.
- **Ações novas:** nenhuma, pela proposta. Marcar o defeito usa
  `embalagem.executar` (quem embala); conferir na revisão usa `revisao.rejeitar`
  (a mesma chave da "Peça com problema"). Se o dono quiser que só alguns
  embaladores possam marcar, entra uma chave nova, `embalagem.defeito` (nível
  Operação, tela 102, não sensível), que nasce só para o Admin Geral (R-ALC-06).
  Ver §7, Q5.
- **Setores novos:** nenhum.

## 7. Perguntas ao dono

| # | Pergunta | Minha sugestão |
|---|---|---|
| Q1 | A lista de motivos é a mesma da Revisão (Corte de tecido errado, Medida errada, Etiqueta errada, Defeito no tecido, Lado do comando trocado, Outro), ou uma própria da Embalagem? | **A mesma**: o motivo diz o setor, e a 104 compara as duas origens |
| Q2 | Quando o revisor diz "não tem defeito", a peça é **revisada de novo** pelos dois bipes ou volta **direto** para a fila da embalagem? | **Revisada de novo**: uma porta só para a fila, e o cronômetro registra a conferência |
| Q3 | O "setor responsável" sai de uma lista fixa (Corte de tecido · Corte de tubo e base · Kit de comando · Montagem · Outro) ou de um cadastro? Até a spec `PRODUCAO-MAPA-E-MOTOR` (fase 5) existir, o sistema não sabe **quem** cortou nem montou a peça; ele registra só o setor | **Lista fixa**, vinda das etapas da ficha (`etapas.js`) mais Montagem. A pessoa entra quando a fase 5 daquela spec existir |
| Q4 | Quem achou o defeito na embalagem pode também conferir a volta na revisão? | **Pode**: o pedido dá a autonomia a quem faz o serviço, e a conferência é sobre a peça, não sobre a pessoa |
| Q5 | Todo embalador pode marcar defeito, ou só quem você escolher? | **Todo embalador** (sem chave nova), como você disse: autonomia de quem faz o serviço |
| Q6 | A peça devolvida que ninguém conferiu fica esperando para sempre no bloco da Revisão? Ou entra também na central de Pendências (204) depois de um tempo? | **Só no bloco da Revisão**, que fica em cima e não some; a 204 é para decisão do escritório |

## 8. Testes

- Teste novo: a embalagem marca defeito → nada em `montagem`, nenhum +1 no livro,
  a linha da fila vira `defeito`, o registro tem quem achou; motivo vazio é 400;
  sem login é 401; kit e acessório recusam; o bipe final dessa peça depois é
  `sem_revisao`.
- Na Revisão: a volta aparece no bloco; "tem defeito" grava a `rejeicao` com a origem
  e o setor (e o material extra); "não tem defeito" fecha a volta, e só a revisão nova
  põe a peça na fila.
- Na 104: as duas origens contadas separadas.
- `teste_montagem.js`, `teste_revisao.js`, `teste_livro.js`, `teste_quem.js` e
  `teste_fichas_material.js` passando sem mudar o esperado.
- `testador-tela` na 101 e na 102, a 1024 e a 768 px.
