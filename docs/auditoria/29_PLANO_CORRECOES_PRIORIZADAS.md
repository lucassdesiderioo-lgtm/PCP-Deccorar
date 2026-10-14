# 29 — Próximas verificações e correções priorizadas

> **Nenhuma correção deste documento foi feita.** Esta fase não muda código nem
> produção. Cada item ainda precisa passar pelo protocolo do CLAUDE.md §0:
> plano, "pode seguir", construção, testes e "pode subir". Itens que mudam como
> a fábrica trabalha (D) são `REGRA` e dependem do proprietário.
>
> Base: documento 27 (o que a coleta mostrou) e 28 (como validar os bancos).

## Parte 1 — As verificações que faltam para fechar a auditoria

### A. Só com o código local (podem ser feitas já, sem tocar na VPS)

| # | Verificação | Responde | Estado |
|---|---|---|---|
| A1 | `node -e "require('./parse')"` mostra as duas linhas `Cannot find module 'canvas'` | a origem provável das 28 linhas do log | **feito**: reproduz (doc 27, ponto 6) |
| A2 | `git rev-list --count <c>..origin/main` para cada merge da `main` | qual commit está 9 atrás | **feito**: só o `f793eb7` (#190) |
| A3 | `git diff --stat f793eb7 origin/main` | se os 9 commits mexem em código da aplicação | **feito**: só documentação e ferramenta de auditoria |
| A4 | ler `db.js`, `tecido/nucleo/db.js` e os sinais tratados | como os bancos abrem e se fecham | **feito**: WAL nos dois e nenhum fechamento em SIGINT/SIGTERM |
| A5 | ler `backup.js` | como as cópias nascem e se são conferidas | **feito**: `db.backup()`, 30 por banco, **sem `integrity_check`** |
| A6 | ler `server.js` | quem escuta na 3010 e em qual endereço | **feito**: o PCP, em todas as interfaces |
| A7 | rodar a suíte inteira (`teste_*.js` e `cd tecido && npm test`) no código que a VPS roda | se o código em produção passa nos próprios testes | **feito em 13/10**: toda a raiz e os 742 do `tecido/` passaram no `c623a5a`, que tem o **mesmo código de aplicação** do `f793eb7` (A3). Vale só se B1 confirmar o commit |
| A8 | procurar no código todo `require` de módulo que não está no `package.json` | se algum `Cannot find module` pode ser de verdade | **feito**: nenhum. O único achado (`xlsx`) está num comentário do `planilha.js`, que lê o arquivo com os módulos nativos de propósito. O `canvas` não é chamado pelo PCP: quem tenta carregá-lo é o pdf.js |

### B. Dependem de informação da VPS (só leitura, pelo console)

**Primeiro: a saída completa da coleta de 14/10**, que o proprietário já tem.
Ela responde B1, B2, B4, B5, B6 e B7 **sem rodar nada de novo**. Os comandos
abaixo são para o que ela não traz, e todos só leem.

| # | Pergunta | Fonte | Prioridade |
|---|---|---|---|
| B1 | o commit da VPS é `f793eb7`, com 0 à frente e 0 modificados? | seção 3 da coleta | alta |
| B2 | quais datas faltam no tecido? (esperado: só de 14/09 a 27/09, menos o 22/09) | seção 6 | alta |
| B3 | de qual módulo são as 28 linhas? | `grep -ho "Cannot find module '[^']*'" ~/.pm2/logs/*.log \| sort \| uniq -c` (imprime **só o nome do módulo**) | média |
| B4 | cada porta escuta em `127.0.0.1` ou em todas as interfaces? | seção 10b (a coluna de endereço) | **alta** |
| B5 | há Nginx e certificado? para quais sistemas? | seções 10 e 10c | alta |
| B6 | linha do crontab do backup e da limpeza, e o fuso do servidor | seções 8 e 1 | média |
| B7 | tamanho do `-wal` dos dois bancos | seção 5 | média |
| B8 | o firewall bloqueia o quê? | `ufw status` (só se o console entrar como root) | alta |
| B9 | o que roda no Docker e o que ele publica? | `docker ps --format '{{.Names}}  {{.Ports}}'` (lista nomes e portas, sem dado) | alta |
| B10 | **de fora da VPS**: quais portas respondem pela internet? | de outra rede, `nc -zv 187.77.62.147 3010` (e as outras portas), uma por vez | **alta**: é a única prova de exposição quando há Docker |
| B11 | o painel da Hostinger tem snapshot/backup automático ligado? | olhar o painel | **alta** |
| B12 | `sha256sum` das cópias escolhidas | doc 28, item 3.1 | quando houver o canal (D1) |

> ⚠️ **B10 é um teste de rede contra a produção.** É uma conexão TCP simples
> que não envia dado nenhum, mas vem de fora. **Só com autorização** do
> proprietário, uma porta por vez, e nunca com varredura automática.

### C. Dependem das cópias reais dos bancos (doc 28)

| # | Verificação | Critério |
|---|---|---|
| C1 | `sha256` VPS = Mac | iguais |
| C2 | `integrity_check` dos dois | `ok` |
| C3 | `foreign_key_check` do tecido | 0, ou órfão explicado |
| C4 | migrações do tecido × `schema.js` | última igual |
| C5 | livro × saldo (`SUM(delta) = skus.estoque`) | 0 SKUs divergentes |
| C6 | `lote_item` órfão, volumes por estágio, saldo negativo | contagens conhecidas |
| C7 | **restauração** num clone isolado: sobe, `/login` 200, o teste da §10 passa | sim |
| C8 | RTO medido | anotado |

### D. Decisões que dependem do proprietário

| # | Decisão | Por quê importa |
|---|---|---|
| **D1** | **Como as cópias chegam ao Mac?** SSH com chave (recomendado), ou outra via. O `/baixar-backup` passa em HTTP puro e só tem o `dados` | sem isso a parte C não começa |
| **D2** | **Para onde vai a cópia externa?** (outro provedor, armazenamento de objetos, um computador da fábrica…), com que frequência e por quanto tempo | hoje uma perda da VPS leva os dados **e** os backups |
| **D3** | HTTPS: há domínio? Nginx/Caddy na frente do PCP? Em qual janela? | PIN, sessão e o banco do `/baixar-backup` trafegam abertos |
| **D4** | o Docker Swarm e os serviços nas portas 8080/4000 devem morar na VPS do PCP? Quem cuida deles? | outro sistema na mesma máquina divide disco, memória e superfície de ataque |
| **D5** | autoriza o teste de porta de fora (B10)? | é a prova de exposição |
| **D6** | quem guarda as cópias para a auditoria, onde, e quando são apagadas | dado pessoal fora da produção |

## Parte 2 — Correções priorizadas

**Escala:** impacto e probabilidade de 1 (baixo) a 3 (alto); esforço P/M/G.
A ordem é pelo **risco** (impacto × probabilidade), e o esforço desempata.

| Prio | Risco | Impacto | Prob. | Esforço | Depende de | Correção proposta | Tipo (§0) |
|---|---|---|---|---|---|---|---|
| **1** | **Nenhuma cópia fora da VPS** (doc 27, ponto 3) | 3: perda total dos dois bancos, das fotos de coleta e das cópias | 2: falha de disco, conta ou VPS acontece | M | D2, B11 | Levar `backups/` (e `coletas/`) para fora todos os dias, de preferência sem credencial gravada no servidor; ou ligar o snapshot do painel **e** conferir que ele restaura | `NOVIDADE` (spec curta) |
| **2** | **Backup nunca conferido nem restaurado** (ponto 1) | 3: no dia da perda, a cópia pode não abrir | 2 | P | — | `backup.js` roda `PRAGMA integrity_check` na cópia e sai diferente de zero se não der `ok`; ensaio de restauração mensal pelo doc 28 | `AJUSTE` 🔴 (backup) |
| **3** | **PCP em HTTP puro, aberto pela porta 3010** (pontos 8 e 9; dívida 2) | 3: PIN, cookie de sessão e o banco inteiro do `/baixar-backup` em texto aberto | 2 a confirmar: depende de B4, B8 e B10 | M | D3, B4, B5, B8, B10 | Proxy com TLS na frente; a 3010 passa a escutar só em `127.0.0.1`; o `/baixar-backup` passa a exigir HTTPS, ou sai | `REGRA` (muda como se acessa) |
| **4** | **Docker Swarm e portas desconhecidas na VPS de produção** (ponto 8) | 2–3: o Docker publica por fora do `ufw` | ? | P para levantar, M a G para corrigir | B4, B9, B10, D4 | Inventariar serviço, dono e porta; fechar o que não precisa estar público; avaliar tirar da VPS do PCP | decisão D4 |
| **5** | **A saída do cron do backup não tem log** (ponto 10, a confirmar) | 2: falha calada até alguém procurar | 2 | P | B6 | O cron grava a saída num log com data, e uma tela ou alerta mostra "último backup: dd/mm" | `AJUSTE` |
| **6** | **O `tecido.db` só sai da VPS por SSH** (ponto 3) | 2 | 2 | P | D1 | Resolvido junto do item 1 ou do D1 | — |
| **7** | **Fechamento do banco sem checkpoint** (ponto 4) | 1: não corrompe, deixa o `-wal` no disco | 3: todo deploy | P | B7 | Tratar SIGINT/SIGTERM com `db.close()` nos dois bancos, e `kill_timeout` maior no pm2 | `AJUSTE` 🔴 (banco) |
| **8** | **Ruído `Cannot find module 'canvas'` no log** (ponto 6) | 1: esconde um erro de verdade no meio de 28 falsos | 3 | P | B3 | Silenciar o aviso do pdf.js na subida, ou documentá-lo; antes, confirmar B3 | `AJUSTE` 🟢 |
| **9** | **Nome do arquivo de backup pela data do servidor** (ponto 10) | 1: confusão de um dia se a VPS estiver em UTC | ? | P | B6 | Decidir o fuso (São Paulo) e usá-lo no nome | `AJUSTE` |
| **10** | **Deriva de deploy: 9 commits** (ponto 7) | 1: só documentação, se B1 confirmar | — | P | B1 | Nada a fazer no código; registrar o commit em produção a cada deploy | — |
| — | Lacuna de 13 dias no tecido (ponto 2) | — | — | — | B2 | **Nenhuma ação**, se B2 confirmar: é anterior a 28/09 e some sozinha em 28/10 | — |
| — | Limpeza dos `lotes/` (ponto 5) | — | — | — | B6 | **Nenhuma ação**, se a linha do cron confirmar o `-mtime +7` | — |

## O próximo passo mais seguro

1. **O proprietário cola aqui a saída completa da coleta de 14/10.** Não roda
   nada de novo na VPS, e fecha B1, B2, B4, B5, B6 e B7 de uma vez.
2. **A7 e A8 já foram feitos** e não acharam nada que contradiga o doc 27.
3. **O proprietário decide D1** (o canal para as cópias). Com isso, a parte C
   começa, e é ela que fecha a auditoria.

## O que impede a auditoria de ser declarada concluída

- a integridade dos bancos reais (C1–C6);
- o inventário completo dos backups (B2, B11, D2);
- o teste de restauração de um backup real (C7–C8).
