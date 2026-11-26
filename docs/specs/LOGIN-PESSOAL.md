# Login pessoal: o PIN é de quem usa, e a sessão não fica aberta no nome do outro

```
STATUS
Situação: APROVADA pelo dono em 26/11/2026 ("pode ser o painel, eu caio às 5h, pode seguir")
Criada em: 26/11/2026
Última atualização: 26/11/2026
Fase atual: 1 construída, falta subir · próxima: fase 2
Fases: 1 ☑  2 ☐  3 ☐  4 ☐
Respostas do dono (26/11/2026): P1 sim, o login "Painel da fábrica" isento do corte e da
  inatividade · P2 o Lucas cai às 5h (a inatividade dele fica para a fase 2) · P3 15 minutos
  em todas as telas · P4 em aberto
Divergências na construção (valem sobre o texto da spec):
  D-C1 o administrador que ZERA o PIN de alguém na 901 também derruba todas as sessões dessa
       pessoa (a spec dizia "como hoje"; confirmado pelo dono em 26/11/2026). E o PRÓPRIO PIN
       não se troca na 901: é recusado, mandando ao "Trocar meu PIN", que pede o PIN de hoje
       (decisão do dono, 26/11/2026).
  D-C2 a marca é por sessão (sessao.derrubada), em toda linha da pessoa, aberta ou fechada
       (③ REVISÃO: a fechada pelo bloqueio ou pelo "Sair" voltava a valer depois da troca); o
       cookie de antes, sem número de sessão, cai por usuarios.pin_trocado_em.
  D-C3 a troca e a derrubada são uma transação: falhou, o PIN não muda (500).
  D-C4 o `r` da tela de PIN só vale como caminho deste sistema (começa com uma barra só).
Risco: 🔴 (acesso e login da fábrica inteira)
Tipo: REGRA (muda como o login funciona) + NOVIDADE (o botão de trocar o PIN, o aviso)
Depende de: QUEM-FEZ-E-REVISAO fase 6 (as tabelas `sessao` e `sessao_evento`, o número
            da sessão no cookie) · ACESSOS-UNIFICADOS 5-A (o PIN de 6 e a rota de troca)
Conversa de desenho: 26/11/2026, nesta sessão
```

## 1. O problema

Uma pessoa imprime as etiquetas de venda (201) com o próprio login e **confere as
caixas na 202 com o login de outra pessoa**. Para o sistema foram duas pessoas; na
fábrica, uma só. A trava "quem imprimiu não confere" (R-SEG-01) é contornada, e com
ela todas as regras de duas pessoas (contagem, ajuste, venda cancelada) e a
produtividade da 905, que atribui o trabalho a quem não fez.

O que deixa isso fácil hoje:

- **a sessão dura 1 ano**, e os tablets quase nunca voltam à tela de PIN: o tablet
  fica aberto no nome de alguém e qualquer um usa;
- **a mesma pessoa pode estar logada em quantos aparelhos quiser**, e ninguém fica
  sabendo que o login dela foi aberto em outro lugar;
- **a pessoa não tem como trocar o próprio PIN** quando desconfia que alguém o sabe
  (a rota existe, mas a tela só aparece para quem ainda tinha PIN de 4).

⚠️ **O sistema não resolve sozinho o empréstimo combinado.** Se B passa o PIN a A e
não está trabalhando, nada aqui pega. O que esta spec faz é tirar o caminho fácil,
avisar o dono do login e deixar rastro. Se A empresta porque não há ninguém para
conferir na hora, a solução é de escala de pessoas, e a trava que a operação
contorna só cega (armadilha #6).

## 2. Decisões do dono (26/11/2026)

| # | Decisão |
|---|---|
| D1 | A sessão de todo mundo **encerra todo dia às 5h**, e a pessoa entra de novo |
| D2 | A sessão **encerra depois de 15 minutos sem uso**, e a pessoa entra de novo |
| D3 | **Uma sessão por pessoa**: entrar em outro aparelho derruba o anterior, e o aparelho derrubado mostra que o login foi conectado a outro terminal |
| D4 | **Só o login do Lucas** pode ficar aberto em dois aparelhos ao mesmo tempo |
| D5 | Cada pessoa **troca o próprio PIN** sem pedir ao administrador |
| D6 | A figura diária depois do PIN (animal ou número entre 5) **não entra**: não segura o empréstimo (quem passa o PIN passa a figura), soma pouco aos 6 dígitos e custa todo dia |

## 3. As regras

### R-LOG-01 — Trocar o próprio PIN (fase 1)
- **"Trocar meu PIN"** na barra de sessão de toda tela, nas duas operações (ao lado de
  "Trocar setor" e "Sair"). Abre a tela de PIN pedindo o PIN de hoje e o novo, duas vezes.
- Usa a rota que já existe (`POST /api/auth/trocar-pin`): o PIN de hoje errado conta
  na mesma trava do login (5 erros, 1 minuto).
- **O PIN novo não pode ser igual ao de hoje** (400).
- **Trocar o PIN encerra todas as outras sessões da pessoa** (`como_saiu='troca_pin'`):
  quem desconfia troca, e quem estava usando o login dela em outro tablet cai na hora.
- O administrador continua zerando o PIN de quem esqueceu, pela 901, como hoje.

### R-LOG-02 — A sessão encerra às 5h (fase 2)
- A sessão aberta **antes das 5h de hoje** (ou antes das 5h de ontem, se agora for
  antes das 5h) não vale mais: o próximo pedido fecha a linha como `corte_diario` e
  manda ao login, que volta à tela onde a pessoa estava.
- A hora do corte é um parâmetro (`sessao_corte_hora`, `05:00`) na 906 Parâmetros.
- **O cookie antigo, sem número de sessão, vale até o primeiro corte das 5h depois do
  deploy** e depois não vale mais. É assim que os tablets abertos há meses saem.

### R-LOG-03 — 15 minutos sem uso (fase 2)
- A sessão sem **ação da pessoa** há mais de `sessao_inatividade_min` (15, na 906)
  minutos fecha como `inativo`.
- ⚠️ **Ação é o que a pessoa faz, e não o que a tela faz sozinha.** As telas se
  atualizam a cada poucos segundos (a 202 a cada 4 s); contar esses pedidos manteria
  vivo o tablet esquecido. Contam: toda escrita (POST, PUT, DELETE) e o aviso de
  atividade que o `nav.js` manda quando há toque, tecla ou bipe (no máximo um por
  minuto, `POST /api/auth/ativo`).
- Faltando 1 minuto, a tela mostra *"Sua sessão vai encerrar em 1 minuto sem uso"*;
  qualquer toque renova.
- ⚠️ **O bipe que chega depois de a sessão cair não grava**: é 401, como hoje sem
  login, e a tela manda ao PIN dizendo para bipar de novo depois de entrar. A revisão
  ou a embalagem em andamento recomeça (o cronômetro é da tela).

### R-LOG-04 — Uma sessão por pessoa (fase 3)
- Ao entrar, as outras sessões abertas da pessoa fecham como `outro_aparelho`.
- **O aparelho derrubado**, no próximo pedido, vai ao login com a mensagem:
  > *"Seu login foi conectado a outro terminal da empresa às 09:12. Se não foi você,
  > avise o supervisor e troque seu PIN."*
- **O aparelho novo** também avisa uma vez: *"Seu login estava aberto em outro
  aparelho, que foi desconectado."*
- ⚠️ **Isto muda uma regra de hoje**: sair não invalidava o cookie no servidor. Daqui
  em diante, o cookie só vale com a sessão dele aberta em `sessao`.
- **A exceção é por pessoa**: `usuarios.varios_aparelhos = 1`, que só o Admin Geral
  marca, na ficha da pessoa na 901, com a auditoria. **Nasce marcada só para o Lucas**
  (D4), marcada por ele mesmo depois do deploy: o sistema não acha a pessoa pelo nome.

### R-LOG-05 — O rastro (fase 4)
- Na 904 Relatórios, aba Por pessoa (só `produtividade.nominal`): as sessões
  derrubadas por outro aparelho e as **conferências suspeitas** — caixa conferida por
  B poucos minutos depois de impressa por A, com A e B trabalhando nos mesmos minutos
  em estações diferentes, ou com o login de B aberto no aparelho onde A trabalhava.
- Só mostra. Não trava nada e não decide quem fez.

### O que fica de fora
- **A TV do painel** (`/painel`): ver a pergunta P1.
- Crachá com código de barras (ideia da conversa anterior): pode vir depois, com spec própria.
- A figura diária (D6).

## 4. Onde mora

📍 LUGAR
- Telas novas: nenhuma.
- Abas novas: nenhuma. A fase 4 é uma parte da aba Por pessoa da 904 (o mesmo assunto: quem fez o quê).
- Módulo novo ou inaugurado: nenhum. Os parâmetros ficam na 906 Parâmetros (Administração · Comum).

## 5. Alçada

🔐 ALÇADA
- Telas novas: nenhuma.
- Ações novas: nenhuma chave nova. "Trocar meu PIN" é do próprio login (rota do portão,
  como o logout). Marcar `varios_aparelhos` é só do Admin Geral, como o nível da pessoa.
  Os dois parâmetros da 906: só o Admin Geral muda (são de segurança).
- Setores novos: nenhum.
- Quem recebe: só o Admin Geral, até o dono marcar.

## 6. Fases

| Fase | O quê | Risco |
|---|---|---|
| 1 | "Trocar meu PIN" (R-LOG-01) | 🔴 |
| 2 | O corte das 5h e os 15 minutos sem uso (R-LOG-02 e 03) | 🔴 |
| 3 | Uma sessão por pessoa, com o aviso e a exceção do Lucas (R-LOG-04) | 🔴 |
| 4 | O rastro na 904 (R-LOG-05) | 🟡 |

Testes: `teste_login.js` ganha os casos de cada fase; o `teste_quem.js` e o teste de
segurança da §10 continuam passando. Depois do deploy de cada fase, recarregar os tablets.

## 7. Perguntas ao dono

- **P1 — A TV do painel.** Ela não pode cair às 5h nem por falta de uso. Sugestão: uma
  pessoa "Painel da fábrica", só com a permissão de ver o painel, marcada pelo Admin
  Geral como isenta do corte e da inatividade. Pode ser?
- **P2 — O Lucas também cai às 5h e com 15 minutos sem uso?** Sugestão: sim às 5h, e
  sem uso só no tablet (no computador do escritório, 15 minutos derruba durante uma
  leitura longa).
- ~~**P3 — 15 minutos vale para todas as telas, ou mais curto na 202 Conferência?**~~ Todas (dono, 26/11/2026).
- **P4 — A fase 4 entra agora, ou depois de as fases 1 a 3 rodarem algumas semanas?**
