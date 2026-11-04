# Acesso por tela e por nível — quem não pode, não vê

> **STATUS: em código · 04/11/2026 — as oito fases construídas; falta o deploy e a conferência na fábrica.**
> **Antes:** em construção · — decisões do dono no "pode seguir":
> **D1 (b)** — o Planejamento (401) continua abrindo com `planilha.importar`;
> **D2 (A)** — cada tela do Admin abre com as chaves das ações dela; Estoque
> (301), Pendências (204) e Problemas (104) continuam abrindo para todo nível Admin.
>
> **Divergências do mapa (fase 2):** 104 e 204 ficaram Admin (a proposta era
> Supervisor); 401 ficou Admin com `planilha.importar` (D1 b). Telas do sob
> medida: 601 a 616, na ordem de `tecido/nucleo/telas.js`. **O rodapé foi para
> a fase 6:** ele morre lá, e reescrevê-lo duas vezes não muda nada para ninguém.
> Tipo: `REGRA` + `NOVIDADE` · Risco 🔴 (acesso/permissão e schema).
> Desenhada no Projeto do Claude com o Lucas, de 28/10 a 04/11/2026. Referência: o
> Decorsoft (o ERP da empresa), onde o que a pessoa não pode usar não aparece.
> Conferida contra o código do GitHub em 04/11/2026 (`29b44fa`).
>
> | Fase | O quê | Risco | Situação |
> |---|---|---|---|
> | 0 | A regra das alçadas no papel (`CLAUDE.md`, `DECISOES.md`) | 🟢 | feito (04/11) |
> | 1 | A baixa de devolução grava quem deu | 🔴 | feito (04/11) — 6 defeitos reintroduzidos, todos reprovam |
> | 2 | O mapa de telas: uma linha por tela, um dono só | 🔴 | feito (04/11) — `telas.js`, 8 defeitos reintroduzidos; o rodapé (`nav.js`) passa a ler do mapa na fase 6, quando vira o menu |
> | 3 | O nível na pessoa (sem trava ainda) | 🔴 | feito (04/11) — `usuarios.nivel`, migração uma vez só, botão do Admin Geral, `nivel_relatorio.js`; 5 defeitos reintroduzidos |
> | 4 | A trava do nível | 🔴 | feito (04/11) — relatório de quem perderia: **vazio** no banco de exemplo; 7 defeitos reintroduzidos; em produção, conferir com `node nivel_relatorio.js` depois do deploy |
> | 5 | O Admin de 16 abas vira telas | 🔴 | feito (04/11) — 13 telas `/admin/...` + 401/904/901; o mesmo `index.html` servido com `TELA_ADMIN`; 6 defeitos reintroduzidos |
> | 6 | O menu por pessoa, e o rodapé sai | 🟡 | feito (04/11) — ☰ Menu da barra de sessão, do `/api/telas/minhas`; `data-perm` em 21 botões do Admin; 5 defeitos reintroduzidos |
> | 7 | A tela de Acessos organizada pelo mapa | 🔴 | feito (04/11) — caixinhas por tela, cinza acima do nível, grade telas × setores; 5 defeitos reintroduzidos |
>
> **Leia junto com:** `ACESSOS-UNIFICADOS.md` (a lista única de permissões, de onde
> esta parte), `DEVOLUCOES-ACOMPANHAMENTO.md`, `CLAUDE.md` §9-B, §10 (armadilhas #28 e
> #29), §19 (#13) e §20 (navegação).

---

## 1. O problema

1. **A pessoa vê o que não pode usar.** O rodapé (`nav.js`) mostra os mesmos atalhos
   para todo mundo; o embalador clica em "Admin" e cai na página "Sem permissão".
   No Admin, as 16 abas aparecem para qualquer um que entra, e a recusa só vem no
   clique, como erro 403.
2. **O Admin é uma porta só.** `/` abre para quem tem **qualquer** permissão de nível
   Admin (`@admin`): quem só define alvo vê Acessos, Modo teste, Compras e Correções.
3. **O nível não trava nada.** Desde 26/10/2026 (R-ACE-03) o nível do setor é só
   etiqueta de cuidado. Nada impede um operador de receber, por exceção, uma
   permissão de escritório.
4. **"Que telas existem" está escrito em quatro lugares** na medida padrão: o rodapé
   (`public/nav.js`), "para onde a pessoa vai" (`destino.js`), a trava do servidor
   (`permDaRota` no `acesso.js`) e a `/setor`. Tela nova exige lembrar de todos.
5. **O rodapé não é usado** pela equipe, e aparece duplicado: o Admin abre
   Planejamento, Relatórios e Acessos em iframe, e cada um carrega o próprio `nav.js`.
6. **Nada obriga o que é novo a entrar no controle de acesso.** A rota nova nasce
   negada (#29), mas a tela nova, a permissão nova e o setor novo dependem de alguém
   lembrar de pôr nível, lugar e dono.
7. **A baixa de devolução não grava quem deu.** `devolucao` guarda `baixado_em` e
   não a pessoa; só a devolução ligada a um caso ganha um evento com o nome.

O sob medida já resolveu o item 4 do jeito certo: `tecido/nucleo/telas.js` declara
cada tela com a sua permissão, e tela fora da lista não abre. Esta spec leva o mesmo
desenho para a medida padrão e acrescenta o nível como trava.

---

## 2. Os dois eixos: nível e setor

| Eixo | Responde | Exemplo |
|---|---|---|
| **Setor** | *o que* a pessoa faz (uma função, não uma pessoa) | Revisão, Embalagem, Emissão de nota, Conferência, Devoluções / Baixa, Comprador |
| **Nível** | *até onde* ela pode mexer | Operação, Supervisor, Admin, Admin Geral |

A pessoa acumula setores (uma ou duas funções). O nível é **um só**, e é o teto.

| Nível | Quem é | Alcança | Onde trabalha |
|---|---|---|---|
| **1 · Operação** | executa com o leitor na mão: revisão, embalagem, etiqueta de venda, conferência, corte, bancadas do sob medida, receber devolução, receber material, contar estoque | só as telas de execução da sua área; vê só os próprios números | tablet |
| **2 · Supervisor** | acompanha uma área | o da operação + painéis, relatórios, Pendências; aprova o que a operação pede | tablet ou computador |
| **3 · Admin** | escritório | cadastros, compras, estoque, custo, configurações | computador |
| **4 · Admin Geral** | o Lucas e a Isabela | tudo; só eles dão acesso, criam setor e veem auditoria | computador |

---

## 3. Regras de negócio (decididas pelo Lucas)

### O nível

| # | Regra | Por quê |
|---|---|---|
| R-NIV-01 | Toda tela e toda ação (permissão) tem um nível: Operação, Supervisor, Admin ou Admin Geral | É o que torna a trava possível |
| R-NIV-02 | **A pessoa tem um nível, e ele é o teto.** Ela só alcança tela e ação do nível dela ou abaixo — venha do setor ou de exceção. Operação nunca alcança o Admin | Pedido do dono: *"pessoas com nível operacional não podem ter acesso ao admin"* |
| R-NIV-03 | **A trava recusa na hora, dizendo por quê, e nunca apaga nada sozinha.** Na tela de Acessos a caixinha acima do nível aparece cinza: *"exige nível Admin"* | A trava antiga apagava permissão em silêncio ao salvar setor (dívida 20, fechada em 26/10/2026) |
| R-NIV-04 | Mudar o nível de uma pessoa é ato separado, **só do Admin Geral**, e vai para a auditoria | Subir de nível é promoção, não caixinha |
| R-NIV-05 | **Na passagem ninguém perde nada:** o nível inicial de cada pessoa é o maior nível que ela já alcança hoje. O Lucas ajusta pessoa a pessoa depois, pela tela | Decisão do dono (04/11/2026): *"depois que estiver pronto vou editar o nível de cada um"* |

### A tela

| # | Regra | Por quê |
|---|---|---|
| R-TEL-01 | **Uma tela = uma linha no mapa** (número, nome, módulo, endereço, nível, onde trabalha, permissões que a abrem). O menu, a `/setor`, "para onde a pessoa vai", a trava do servidor e a tela de Acessos leem do mapa. Tela fora do mapa não abre, e um teste reprova | Hoje são quatro listas |
| R-TEL-02 | **O número:** a centena é o módulo onde a tela nasceu; o número nunca muda e nunca é reaproveitado. Se a tela mudar de módulo, mantém o número | Dá para falar "libera a 204 para o Renato" sem ambiguidade |
| R-TEL-03 | **Tela nova nasce liberada só para o Admin Geral**, e aparece sozinha na tela de Acessos, até alguém marcar um setor | Decisão do dono (28/10/2026): ele não quer decidir isso a cada construção |
| R-TEL-04 | **Quem não alcança, não vê:** a tela some do menu e o botão da ação some da tela. O servidor continua travando por baixo | Esconder é conforto, não segurança (§20, Regra A) |
| R-TEL-05 | **O Admin de 16 abas acaba.** Cada aba vira uma tela com endereço, número e permissão próprios | Aba não é unidade de acesso |
| R-TEL-06 | **O rodapé de atalhos sai**, substituído pelo menu por pessoa | Ninguém usa, e aparece duplicado |

### A alçada — tudo que é novo entra no controle de acesso

Regra do dono (04/11/2026): *"tudo que for novo no sistema, a partir de hoje, tem que
ser revisado e entrar no controle de alçadas — nível, tela, acesso."*

| # | Regra | Como é garantida |
|---|---|---|
| R-ALC-01 | **Nada nasce fora do controle de acesso.** Tela, ação (permissão), setor, módulo e rota novos só existem declarados | teste reprova (tabela abaixo) |
| R-ALC-02 | **Tela nova:** linha no mapa com número, módulo, nível e permissão | `teste_mapa.js` |
| R-ALC-03 | **Ação nova:** permissão em `permissoes.js` com nível, rótulo e **a tela onde é usada** (`tela: 301`); sensível marcada quando mexe em estoque, dinheiro, acesso ou dado de pessoa | `teste_mapa.js` |
| R-ALC-04 | **Setor novo:** nasce com nível e vazio de pessoas; só recebe telas e ações do nível dele ou abaixo | `teste_acesso.js` |
| R-ALC-05 | **Rota nova:** linha no `permDaRota` (já é assim desde 17/09/2026, #29) | `teste_cobertura.js` |
| R-ALC-06 | **Tudo novo nasce só para o Admin Geral.** Quem recebe é decisão do Lucas, na tela de Acessos, depois da entrega | R-TEL-03 |
| R-ALC-07 | **O PLANO de toda tarefa traz o bloco 🔐 ALÇADA**, e o FECHAMENTO a linha "Alçada conferida". Tarefa sem nada novo escreve "nada novo" — o bloco nunca some | `CLAUDE.md` §0 |
| R-ALC-08 | **Spec nova traz a seção "Alçada"**: para cada tela e ação nova, o número, o nível e o setor sugerido | `docs/specs/README.md` |

O bloco que entra no PLANO do `CLAUDE.md` §0:

```
🔐 ALÇADA
Telas novas: nº · nome · módulo · nível        (ou "nenhuma")
Ações novas: chave · nível · tela · sensível?   (ou "nenhuma")
Setores novos: nome · nível                     (ou "nenhum")
Quem recebe: só o Admin Geral, até o dono marcar
```

### Ficam como estão (não são desta spec)

- "Quem imprimiu não confere a caixa" **sem liberação nenhuma**, nem para o Admin
  Geral (R-SEG-02, 01/10/2026) — reconfirmado pelo dono em 04/11/2026.
- As três intransferíveis (`pessoas.gerenciar`, `setores.gerenciar`, `auditoria.ver`),
  a marca de sensível com confirmação, "quem pede não aprova".
- Quem fez cada ação já é gravado (revisão, embalagem, impressão, conferência). A
  fase 1 completa o que falta: a baixa de devolução.

---

## 4. O mapa — proposta inicial

Os níveis abaixo são **proposta**. A fase 2 confere cada um contra o nível das
permissões que abrem a tela hoje e anota no STATUS o que divergir; onde divergir,
vale o nível de hoje (ninguém perde nada) e o Lucas decide depois.

| Nº | Tela | Hoje | Nível | Onde |
|---|---|---|---|---|
| **100** | **Produção** | | | |
| 101 | Revisão | `/operador` | Operação | tablet |
| 102 | Embalagem | `/montagem` | Operação | tablet |
| 103 | Lançar produção | aba `prod` | Admin | computador |
| 104 | Problemas (peças rejeitadas) | aba `pb` | Supervisor | computador |
| 105 | Painel da TV | `/painel` | Operação | TV |
| **200** | **Expedição** | | | |
| 201 | Etiqueta de Venda | `/embalagem` | Operação | tablet |
| 202 | Conferência | `/carregamento` | Operação | tablet |
| 203 | Subir PDF | `/expedicao` | Operação | tablet |
| 204 | Pendências | aba `blq` | Supervisor | computador |
| 205 | Correções | aba `cor` | Admin | computador |
| **250** | **Devoluções** (bloco dentro da Expedição) | porta `/devolucoes` | | |
| 251 | Devoluções — receber (bipe do Edvaldo) | `/devolucao` · `devolucao.registrar` | Operação | tablet |
| 252 | Devoluções — em andamento (casos) | `/devolucao-casos` · `devolucao.acompanhar` | Supervisor | computador |
| 253 | Devoluções — baixa | aba `dv` · `devolucao.baixar` | Admin | computador |
| **300** | **Estoque** | | | |
| 301 | Estoque | aba `est` | Admin | computador |
| 302 | Contagem (aprovar) | aba `ct` | Admin | computador |
| 303 | Inventário | `/inventario` | Operação | tablet |
| **400** | **Planejamento** | | | |
| 401 | Planejamento | `/planejamento`, aba `plan` | Supervisor | computador |
| 402 | Cadastro de SKU | aba `cad` | Admin | computador |
| 403 | SKU incompleto | aba `pend` | Admin | computador |
| 404 | Ficha técnica | aba `ficha` | Admin | computador |
| **500** | **Compras** | | | |
| 501 | Compras | aba `compras` | Admin | computador |
| 502 | Recebimento | `/recebimento` | Operação | tablet |
| **600** | **Sob medida** | as telas de `tecido/nucleo/telas.js` | cada uma | — |
| **700** | **Frota** | reservado para a spec da Frota | — | — |
| **800** | **Mercado Livre** | reservado para a aba de análise do ML | — | — |
| **900** | **Sistema** | | | |
| 901 | Acessos | `/acessos`, aba `acs` | Admin Geral | computador |
| 902 | Cadastros (listas, kit, horários) | aba `cd` | Admin | computador |
| 903 | Modo teste | aba `tst` | Admin | computador |
| 904 | Relatórios | `/relatorios`, aba `rel` | Supervisor | computador |

**As devoluções** (reformadas em 03/11/2026, `DEVOLUCOES-ACOMPANHAMENTO.md`): a porta
`/devolucoes` deixa de ser rota `@logado` que redireciona e vira a **entrada do bloco
250 no menu**; as três abas são as telas 251, 252 e 253, com as permissões e os níveis
de hoje. As ações de dentro do caso ficam penduradas na 252: `devolucao.lancar` e
`devolucao.dinheiro` (as duas Admin).

**Divergência já conhecida:** a tela `/planejamento` exige hoje `planilha.importar`
(Admin), e a chave de ver o planejamento é `necessidade.ver` (Supervisor). Na fase 2
a tela 401 abre com `necessidade.ver` e o import fica como ação Admin pendurada nela
— só se o Lucas confirmar no PLANO; senão fica como está.

Ficam fora do mapa, por desenho: `/login`, `/setor` (escolha de operação) e o portal
da revenda quando existir.

**As ações dentro da tela** são as permissões que já existem (`permissoes.js`),
penduradas na tela onde são usadas, cada uma com o nível que já tem. Exemplo:

```
301 Estoque                      Admin
     ⚠ Editar estoque direto     Admin
       Definir alvo              Admin
```

---

## 5. Fases

### Fase 0 — a regra das alçadas no papel 🟢

- `CLAUDE.md` §0: o bloco **🔐 ALÇADA** entra no PLANO e a linha "Alçada conferida"
  entra no FECHAMENTO (R-ALC-07).
- `CLAUDE.md` §10: subseção "A alçada — tudo que é novo entra no controle de acesso",
  com as regras R-ALC-01 a R-ALC-08.
- `CLAUDE.md` §15: ❌ criar tela, ação, setor ou rota sem a declaração de alçada.
- `docs/specs/README.md`: spec nova traz a seção "Alçada" (R-ALC-08).
- `docs/DECISOES.md`: as linhas desta spec.
- Os testes que garantem a regra entram nas fases 2 e 7 — até lá a regra vale pelo
  PLANO, e o `teste_cobertura.js` já cobre a rota.

### Fase 1 — a baixa de devolução grava quem deu 🔴 (schema)

- `devolucao` ganha `baixado_por_id` e `baixado_por` (o nome como retrato), no
  `CREATE` e por `ALTER` guardado no `dev_route.js` (§17).
- `POST /api/devolucao/baixa` grava a pessoa da sessão, na mesma transação.
- A aba Baixa e o caso mostram *"baixa em 04/11 às 15:20, por Renato"*.
- Baixa anterior fica sem nome — não se inventa de memória.
- Teste: `teste_devolucao.js` ganha os casos (grava quem, a 409 não regrava quem).

### Fase 2 — o mapa de telas 🔴 (acesso)

- Nasce `telas.js` na raiz: uma linha por tela da medida padrão (número, nome, módulo,
  endereço, nível, onde, permissões). Formato irmão do `tecido/nucleo/telas.js`.
- `permDaRota` (as linhas de **tela**), `destino.js` (`PADRAO`), `public/nav.js` e a
  `/setor` passam a ler do mapa. As linhas de **API** do `permDaRota` não mudam.
- Cada permissão de `permissoes.js` ganha o campo `tela` (R-ALC-03).
- As telas do sob medida ganham número 6xx e nível no próprio `tecido/nucleo/telas.js`.
- **Nenhuma pessoa ganha nem perde nada.** O teste é escrito antes: para cada pessoa
  de um banco de exemplo, a lista de telas que ela abre é idêntica antes e depois.
- `teste_mapa.js` (novo): `.html` em `public/` sem linha no mapa reprova; linha sem
  permissão ou sem nível reprova; número repetido reprova; permissão sem `tela` ou sem
  nível reprova; tela do sob medida sem número reprova.

### Fase 3 — o nível na pessoa 🔴 (schema)

- `usuarios.nivel` (`operacao`, `supervisor`, `admin`, `admin_geral`).
- Migração de uma vez só (`config`): o nível de cada pessoa é o **maior** nível que
  ela alcança hoje, por setor ou exceção; quem está no setor Admin Geral é Admin Geral.
- Tela de Acessos mostra o nível de cada pessoa e deixa o **Admin Geral** mudá-lo,
  com registro na auditoria (R-NIV-04).
- Ainda não trava nada.

### Fase 4 — a trava do nível 🔴 (acesso)

- **No servidor:** a permissão efetiva da pessoa é só a do nível dela ou abaixo
  (`permissoesDe` corta o que passa do teto). Vale para setor e exceção.
- **Ao conceder:** dar exceção, ou pôr num setor, algo acima do nível da pessoa é
  recusado com a frase *"exige nível X — a pessoa é nível Y"*. Nada é apagado.
- **Setor:** só aceita telas e ações do nível dele ou abaixo (R-ALC-04), com recusa
  na hora. O que um setor de hoje já tem acima do nível dele **não é apagado**: entra
  numa lista para o Lucas decidir.
- A porta `@admin` passa a exigir **pessoa de nível Admin ou acima**, e não "ter
  alguma permissão de nível Admin".
- Antes de ligar: relatório de quem perderia alguma coisa. Pela migração da fase 3 a
  lista tem que sair **vazia**; se não sair, **para e pergunta ao dono**.
- Teste: operador com exceção de nível Admin não abre `/`; Supervisor não abre
  Acessos; Admin Geral continua passando por nível.

### Fase 5 — o Admin vira telas 🔴 (acesso)

- Cada aba do `index.html` ganha endereço próprio (ex.: `/admin/estoque`) e a
  permissão da linha dela no mapa. Sai o iframe (e com ele o rodapé duplicado).
- Abrir uma tela do Admin não carrega as outras 15. Link antigo `/admin#dv` leva à
  tela nova.

### Fase 6 — o menu por pessoa 🟡

- O menu é montado do mapa: só os módulos e as telas que a pessoa alcança, com o
  número ao lado do nome. Quem não alcança nenhuma tela de um módulo não vê o módulo.
- Pessoa de nível Operação entra direto na tela dela; se tiver duas, troca entre elas.
- **O rodapé de atalhos sai** (R-TEL-06), e o atalho Alt+número junto. "Trocar setor"
  e o atalho para a outra operação (§20, Regra A) continuam.
- Botões de ação que a pessoa não tem somem (R-TEL-04).
- **A aparência do menu não é desta spec** — é da conversa de design. Aqui ele é
  funcional, no visual atual.

### Fase 7 — a tela de Acessos organizada pelo mapa 🔴 (acesso)

- A tela mostra as telas por módulo, com número, nível e as ações penduradas.
- Grade **telas × setores**: bate o olho e vê o que cada setor recebe.
- Caixinha acima do nível da pessoa ou do setor aparece cinza, com a frase (R-NIV-03).
- Tela e ação novas aparecem sozinhas, sem nenhum setor marcado (R-TEL-03, R-ALC-06).
- `teste_acesso.js`: setor novo sem nível reprova; tela nova não chega a ninguém além
  do Admin Geral.

---

## 6. Alçada desta spec (R-ALC-08)

| Nova | Nível | Setor sugerido |
|---|---|---|
| Telas 101 a 904 | as da §4 | as de hoje (ninguém ganha nem perde) |

Nenhuma ação nova: mudar o nível de uma pessoa usa `pessoas.gerenciar`, que já é
Admin Geral e intransferível. Nenhum setor novo.

## 7. Fica de fora

- A aparência do menu e das telas (conversa de design).
- Produtividade por pessoa — o dado já é gravado; a tela vem depois.
- Horário de acesso (a aba "Horários" do Decorsoft).
- As telas da Frota e da análise do ML: nascem nas specs delas, já nos números 7xx e 8xx.
- A baixa de devolução anterior a esta spec continua sem nome.

## 8. O que entra no `CLAUDE.md` quando terminar

- §0: o bloco 🔐 ALÇADA (já na fase 0).
- §9-B: a baixa grava quem deu.
- §10: os dois eixos, o nível como teto, as regras R-NIV, R-TEL e R-ALC, e o
  `teste_mapa.js`.
- §15: ❌ criar tela sem linha no mapa · ❌ reaproveitar número · ❌ permissão sem
  nível ou sem tela · ❌ dar a pessoa de Operação permissão de escritório por exceção ·
  ❌ trava de nível que apaga em silêncio.
- §20: o menu por pessoa no lugar do rodapé.
