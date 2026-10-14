# 27 — Análise da coleta real da VPS (14/10/2026, 08:32)

> **Fase 4 da auditoria.** O documento separa três coisas que não podem se
> misturar: **o que a coleta mostrou** (evidência), **o que isso quer dizer**
> (interpretação) e **o que continua sem resposta** (dúvida).
>
> **De onde vêm as evidências.** Este documento se apoia no **resumo** que o
> proprietário fez da coleta, em dez pontos. A saída completa não chegou à
> análise. Por isso, tudo o que depende de linhas que não vieram está marcado
> como **sem evidência suficiente**: o endereço de cada porta, o conteúdo do
> crontab, o Nginx, o certificado, as datas exatas das cópias e o commit da VPS.
> Nada foi inventado para preencher o que falta.
>
> **A numeração 27–29** segue a série da auditoria. Os documentos 01–26 não
> estão neste repositório (ficaram fora do Git), então as referências a eles
> não puderam ser conferidas aqui.

## Como a coleta foi feita, e o que ela escreveu na produção

O caminho que funcionou foi o console do painel da Hostinger, com uma linha:

```
cd /opt/expedicao && git fetch origin main && git show origin/main:scripts/auditoria/remoto_leitura.sh | bash -s -- $PWD
```

- O `remoto_leitura.sh` **só lê**. O `teste_coleta_vps.js` (76 casos) prova
  isso contra um servidor de mentira, conferindo arquivo por arquivo, inclusive
  o `.git/index`.
- **O `git fetch` escreveu na VPS**, e isto fica registrado: ele gravou
  objetos e referências dentro de `/opt/expedicao/.git`. Não alterou os
  arquivos do sistema, não reiniciou nada e não mudou o código que está
  rodando. Ele foi autorizado pelo proprietário naquele momento. As regras
  desta fase 4 proíbem `git fetch` daqui em diante, e nenhum passo abaixo o
  usa.
- Como o `fetch` rodou **antes** da coleta, o `origin/main` da VPS estava
  atualizado, e a contagem "9 commits atrás" é real (ver o ponto 7).
- Na forma de uma linha, o filtro de saneamento (`sanear.sh`) **não** rodou. A
  saída dependeu só do que o próprio script se recusa a imprimir.

## Classificação

| Rótulo | Quer dizer |
|---|---|
| **confirmado** | a coleta mostrou e o código explica |
| **indício** | a coleta mostrou algo com uma explicação provável, que ainda precisa de uma checagem |
| **não comprovado** | a coleta não mostrou o que seria preciso para afirmar |
| **sem evidência suficiente** | o dado não veio na parte da coleta recebida |

---

## 1. Backups do `dados.db`: 30 cópias diárias, sem lacuna

| | |
|---|---|
| **Evidência** | 30 arquivos `dados-AAAA-MM-DD.db` e nenhum dia faltando nos últimos 30 |
| **Interpretação** | é exatamente o teto da rotação (`MANTER=30` no `backup.js`, uma rotação por banco). O cron diário das 23:30 rodou todos os dias do período |
| **Classificação** | **confirmado** que as cópias **existem**. **Não comprovado** que elas **abrem**, que estão **íntegras** ou que **restauram** |
| **Dúvida** | o `backup.js` não confere a cópia depois de gravar (não há `PRAGMA integrity_check`). Nenhuma restauração foi testada. O tamanho das cópias não veio no resumo |

> Backup que existe não é backup que restaura. Esse é o item que mais pesa no
> plano 28.

## 2. Backups do `tecido.db`: 18 cópias e 13 dias sem cópia nos últimos 30

| | |
|---|---|
| **Evidência** | 18 arquivos `tecido-AAAA-MM-DD.db` e 13 dias sem cópia na janela de 30 |
| **Interpretação** | **a conta fecha exatamente com a história do código.** O `tecido.db` só passou a ter backup diário em **28/09/2026** (PR #155). Antes disso existiam só duas cópias manuais com o mesmo formato de nome, `tecido-2026-09-03.db` e `tecido-2026-09-22.db` (CLAUDE.md §13). A janela da coleta vai de 13/10 até 14/09. Dentro dela estão a de 22/09 e as 16 diárias de 28/09 a 13/10, total 17; fora dela fica a de 03/09; 17 + 1 = **18**. Os dias que faltam são 14/09–21/09 (8) e 23/09–27/09 (5): **13** |
| **Classificação** | **indício forte**, com explicação: a falta está toda **antes** do backup do tecido existir, e não depois |
| **Dúvida** | confirmar pela lista de datas da seção 6 da saída. Ela tem que mostrar como faltantes só datas entre 14/09 e 27/09, menos o 22/09. **Qualquer data de 28/09 em diante na lista é falha de verdade** do cron das 23:30 |

> A lacuna se apaga sozinha: a partir de 28/10/2026 a janela de 30 dias fica
> toda dentro do período com backup.

## 3. Nenhuma evidência de cópia externa

| | |
|---|---|
| **Evidência** | a seção 12 não mostrou programa de cópia no crontab (`rclone`, `restic`, `rsync`, `aws`…), nem programa instalado, nem arquivo de configuração desses programas |
| **Interpretação** | as 48 cópias moram **no mesmo disco** da produção (`/opt/expedicao/backups/`). Se a VPS, o disco ou a conta se perderem, as cópias vão junto. O mesmo vale para as fotos da coleta (`coletas/`), que são prova de quantidade |
| **Classificação** | **confirmado** que não há indício. **Não comprovado** que não exista cópia externa, porque a ausência de indício não prova a ausência da cópia. Ela pode estar fora da VPS: snapshot do painel da Hostinger, ou alguém baixando pelo `/baixar-backup` |
| **Dúvida** | (a) o painel da Hostinger tem snapshot ou backup automático ligado? Com que frequência, e quantos guarda? (b) alguém baixa o `/baixar-backup`? A contagem de downloads no `access.log` não veio no resumo. (c) mesmo que baixe, essa rota só entrega o `dados-*.db`: **o `tecido.db` não tem caminho de saída sem SSH** |

## 4. WAL e SHM dos dois bancos

| | |
|---|---|
| **Evidência** | `dados.db-wal`, `dados.db-shm`, `tecido/tecido.db-wal` e `tecido/tecido.db-shm` presentes (os tamanhos não vieram no resumo) |
| **Interpretação** | **é o estado normal** com o processo rodando. Os dois bancos abrem com `journal_mode = WAL` (`db.js:9`, `tecido/nucleo/db.js:13`), e nesse modo o `-wal` e o `-shm` existem enquanto houver conexão aberta. O SQLite faz o checkpoint sozinho a cada ~1000 páginas |
| **Código** | não há tratamento de encerramento: nenhum `process.on('SIGINT'/'SIGTERM')` fecha o banco, e não existe `ecosystem` do pm2, então valem os padrões (SIGINT, depois SIGKILL em 1,6 s). No `pm2 delete` o processo morre com o WAL aberto. **Isso não corrompe**: na próxima abertura o SQLite relê o WAL. O efeito prático é só o `-wal` continuar no disco |
| **Classificação** | **confirmado** que os arquivos existem. **Não comprovado** qualquer problema: arquivo aberto não é corrupção |
| **Dúvida** | o tamanho do `-wal`. Vários MB é normal; centenas de MB indicaria checkpoint travado (um leitor que nunca solta o banco). E a integridade, que só se confere numa cópia (plano 28) |

## 5. `lotes/`: 42 arquivos, o mais antigo de 06/10

| | |
|---|---|
| **Evidência** | 42 arquivos, o mais antigo modificado em 06/10, numa coleta feita em 14/10 às 08:32 |
| **Interpretação** | a limpeza documentada é "PDFs removidos após 7 dias" (README, `docs/ARQUITETURA.md` §8). Um arquivo de 06/10 tinha, na hora da coleta, **7 dias e algumas horas**. Um `find … -mtime +7` só apaga a partir de **8 dias completos**, porque o `find` arredonda para baixo. Então o de 06/10 ainda não tinha idade para sair, e o que se vê é compatível com a limpeza funcionando |
| **Classificação** | **indício** de que a limpeza funciona |
| **Dúvida** | o comando da limpeza **não está no repositório**: ele existe só no crontab da VPS. A linha do crontab (seção 8) e a hora do arquivo mais antigo confirmam. Se aparecer arquivo de 05/10 ou mais velho numa próxima coleta, a limpeza parou |

## 6. 28 ocorrências de `Cannot find module` nos logs do PCP

| | |
|---|---|
| **Evidência** | 28 linhas com `Cannot find module` no log de erro do processo `expedicao` (o nome do módulo não sai na coleta, por desenho) |
| **Interpretação** | **existe uma fonte conhecida e inofensiva, reproduzida aqui.** O `exp_route.js` carrega o `parse.js` na subida, e o `parse.js` carrega o `pdfjs-dist`. Ao ser carregado, o pdf.js tenta o pacote opcional `canvas`, não acha e escreve **duas** linhas: `Cannot polyfill DOMMatrix … Cannot find module 'canvas'` e o mesmo para `Path2D`. Rodar `node -e "require('./parse')"` no repositório mostra as duas linhas. **28 ÷ 2 = 14 subidas do processo** desde que o arquivo de log começou, o que combina com deploys feitos por `pm2 delete && pm2 start` |
| **Classificação** | **indício** (explicação provável). **Não comprovado** que as 28 sejam todas do `canvas` |
| **Dúvida** | um deploy sem `npm install`, com módulo faltando de verdade, também escreveria `Cannot find module`, e isso derrubaria uma rota. A checagem é ler **só o nome do módulo**, sem dado nenhum (teste B3 do plano 29) |

## 7. A VPS está 9 commits atrás do `origin/main`

| | |
|---|---|
| **Evidência** | "atrás de origin/main: 9", com o `origin/main` atualizado pelo `fetch` minutos antes |
| **Interpretação** | **no histórico, o único commit da `main` que fica exatamente 9 atrás é o `f793eb7`, o merge do PR #190** ("Etiqueta feita por" em linha própria). O proprietário confirmou o deploy dele em 05/10/2026 (CLAUDE.md §8-B). Os 9 commits entre ele e a `main` são os PRs #191, #192, #193 e #194: |

```
b5fa129 Merge #194      c623a5a  9901909   ← ferramenta de coleta + teste (esta auditoria)
0388754 Merge #193      968c7de            ← CLAUDE.md / spec (registro de conferência)
b7b67d8 Merge #192      9fa3283            ← CLAUDE.md / spec (registro de conferência)
c5e379e Merge #191      8ffe50d            ← CLAUDE.md (registro de deploy)
```

`git diff --stat f793eb7 origin/main` mostra só `.gitignore`, `CLAUDE.md`,
`docs/…`, `scripts/auditoria/…` e `teste_coleta_vps.js`. **Nenhum arquivo da
aplicação mudou.**

| | |
|---|---|
| **Classificação** | **indício forte**: a VPS roda o mesmo código de aplicação da `main`, e o que falta lá é documentação e ferramenta de auditoria |
| **Dúvida** | confirmar que a linha `commit:` da seção 3 da saída é **`f793eb7`**, e que "à frente de origin/main" é **0** (ninguém comitou nada direto na VPS). Ver também quantos arquivos versionados estão "modificados no servidor": precisa ser 0 |

## 8. Portas em escuta: 3010, 8080, 4000, 3001, 2377, 7946, 32768

| Porta | O que o repositório diz | Leitura provável | Classificação |
|---|---|---|---|
| **3010** | `server.js:6` `PORT = 3010` e `app.listen(PORT)` **sem endereço**, logo escuta em todas as interfaces. O README diz que se acessa por `IP:3010` | é o PCP, e foi feito para ser acessado direto pela rede, **em HTTP puro** (CLAUDE.md §14, dívida 2) | **confirmado** que é o PCP. **Sem evidência suficiente** de que esteja aberta para a internet: falta o endereço na saída do `ss` e o estado do `ufw` |
| **3001** | README: `pontorh` (outro sistema no mesmo servidor, "não interferir") | outro sistema, fora do escopo do PCP | **confirmado** pelo README que é outro sistema |
| **3000** | README: `deccorar-ponto` | não aparece no resumo: ou não estava em escuta, ou ficou de fora do resumo | **sem evidência suficiente** |
| **8080, 4000** | nada no repositório | outros serviços na mesma VPS | **sem evidência suficiente** |
| **2377, 7946** | nada no repositório | são as portas padrão do **Docker Swarm** (2377 gerência, 7946 comunicação entre nós) | **indício** de Docker em modo Swarm na VPS de produção |
| **32768** | nada | é o começo da faixa de portas que o Linux sorteia; costuma ser porta publicada por um contêiner do Docker | **sem evidência suficiente** |

> **Porta em escuta não é porta exposta.** A coleta não mostrou se cada uma
> está em `127.0.0.1` (só por dentro) ou em `0.0.0.0`/`[::]` (todas as
> interfaces), nem se o firewall a bloqueia.
>
> ⚠️ **E com Docker o `ufw` sozinho não responde:** as portas que o Docker
> publica entram por regras próprias do iptables e passam **por fora** do
> `ufw`. Por isso, se houver Docker, a única prova de exposição é um teste
> **de fora da VPS**.

## 9. Nginx e certificados TLS

| | |
|---|---|
| **Evidência** | o resumo não traz a seção 10 (Nginx) nem a 10c (certificado) |
| **Código** | o repositório **não menciona Nginx** em lugar nenhum. A documentação descreve acesso direto por `IP:3010` e registra "Sem HTTPS — PINs trafegam em texto aberto" como dívida 2. A rota `/baixar-backup` entrega o banco inteiro, protegida por token, pelo mesmo HTTP |
| **Classificação** | **sem evidência suficiente** sobre o Nginx e o TLS da VPS. **Confirmado pelo código** que o PCP não exige HTTPS |
| **Dúvida** | existe Nginx na VPS? Atende outros sistemas (8080/4000)? Há certificado e domínio? |

## 10. Agendamentos de backup e limpeza

| | |
|---|---|
| **Evidência** | o resumo não traz a seção 8 (crontab e timers) |
| **Inferência** | o resultado dos pontos 1, 2 e 5 só é possível com o backup rodando todo dia desde pelo menos 14/09 (dados), desde 28/09 (tecido) e com a limpeza dos `lotes/` ativa |
| **Classificação** | **indício** de que os dois agendamentos existem e rodam. **Sem evidência suficiente** da linha exata, do horário e do fuso |
| **Dúvida** | (a) a linha do crontab (horário e nome, sem argumentos); (b) o fuso do servidor (seção 1): o `backup.js` dá nome ao arquivo pela data **local do servidor**; se a VPS estiver em UTC, o cron das 23:30 roda às 20:30 de São Paulo; (c) a saída do cron vai para algum log? Sem log, uma falha do backup não deixa rastro além da falta do arquivo |

---

## O que esta análise NÃO prova

- que algum banco esteja íntegro: nenhum `integrity_check` foi rodado;
- que algum backup restaure;
- que exista cópia fora da VPS;
- que o PCP esteja exposto à internet, ou que não esteja;
- que as 28 linhas de `Cannot find module` sejam todas inofensivas.

**A auditoria não está concluída.** Faltam a integridade dos bancos reais, o
inventário completo dos backups e o teste de restauração de um backup real.
O caminho para os três está nos documentos 28 e 29.

## O que pedir ao proprietário, sem nova coleta

A saída **completa** da coleta de 14/10, que ele já tem na tela ou copiada.
Em especial estas seções:

| Seção | Responde |
|---|---|
| 1 | fuso do servidor e usuário do console (root ou não) |
| 3 | `commit:` (esperado `f793eb7`), "à frente", "modificados no servidor" |
| 5 | tamanho do `-wal` dos dois bancos |
| 6 | lista das datas que faltam no tecido e tamanho da cópia mais recente |
| 8 | linhas do crontab (já saneadas pelo script) |
| 10 / 10b / 10c | Nginx, endereço de cada porta, certificado |
| 12 | contagem de downloads do `/baixar-backup` |
