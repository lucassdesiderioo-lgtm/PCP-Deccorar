# Coleta de auditoria da VPS — como rodar

> Ferramenta de **leitura**. Ela não muda nada na produção: não reinicia,
> não atualiza, não instala, não grava arquivo e não copia banco. Ela também
> não usa sudo. Os scripts estão em `scripts/auditoria/`, e o
> `node teste_coleta_vps.js` (75 casos) trava cada uma dessas promessas.

## 1. Antes da primeira vez: o alias SSH no Mac

O script só aceita um **nome** do seu `~/.ssh/config`. Ele não aceita
`usuario@ip` e não presume endereço, usuário nem caminho.

```bash
grep -i '^Host ' ~/.ssh/config        # mostra só os nomes, nada de chave
```

Se ainda não houver alias, acrescente no `~/.ssh/config` (com o seu editor;
**nunca mande chave ou senha pelo chat**):

```
Host deccorar-vps
    HostName <endereço da VPS>
    User <seu usuário na VPS>
    IdentityFile ~/.ssh/<sua chave>
```

Conecte uma vez à mão (`ssh deccorar-vps`) e **confira a impressão digital**
que o ssh mostrar com a do painel do provedor da VPS, antes de responder
`yes`. O script recusa servidor cuja chave não esteja no `known_hosts`. Ele
nunca aceita chave nova sozinho.

## 2. Rodar a coleta

Na pasta do repositório, no Mac:

```bash
./scripts/auditoria/coletar_vps_deccorar.sh deccorar-vps /opt/expedicao
```

- **1º argumento:** o alias do `~/.ssh/config`.
- **2º argumento:** a pasta do projeto na VPS. O CLAUDE.md diz `/opt/expedicao`,
  mas confirme antes. Se a pasta não tiver `server.js` e `caminhos.js`, a VPS
  recusa.

O script mostra o servidor, a impressão digital e os dois comandos `ssh`
completos. Ele só continua se você **digitar o alias** de novo.

**Horários proibidos** (horário de São Paulo, conferido no Mac e na VPS):

| Janela | Por quê |
|---|---|
| 23:00 – 00:15, todo dia | backup das 23:30 |
| 10:00 – 11:00, seg a sex | corte |
| 14:30 – 15:30, seg a sex | despacho |

**Resultado:** `auditoria_coletas/coleta_<alias>_<data>.txt`, com permissão
só para você (600). A pasta está no `.gitignore`. **Leia antes de mandar a
alguém.** O arquivo não tem banco, senha nem variável de ambiente, mas tem
nome do servidor e das pastas.

## 3. O que o relatório traz

1. usuário remoto, hostname, hora do servidor e de São Paulo
2. versões do Node, do SQLite (CLI), do better-sqlite3, express e pdf-lib
3. git: commit, branch, quantos arquivos foram mexidos no servidor (com os
   nomes) e quantos não são versionados. **Sem fetch**, e com
   `GIT_OPTIONAL_LOCKS=0`. Sem isso, o próprio `git status` regrava o
   `.git/index`, e o teste prova que regrava
4. pm2: nome, estado, reinícios, tempo no ar, memória. **Só se o daemon já
   estiver de pé**, porque `pm2 ping`, `ls` e `jlist` iniciam um daemon
   quando não há. O `jlist` traz o ambiente inteiro do processo, então a
   saída é filtrada antes de ser impressa
5. `dados.db`, `tecido/tecido.db`, `-wal`, `-shm`: tamanho e data. **Os bancos
   não são abertos**, e abrir um banco em WAL pode criar o `-shm`. Se o pm2
   for do mesmo usuário, mostra também quais `.db` o processo tem abertos de
   fato
6. backups: quantas cópias diárias de cada banco, a mais antiga, a mais
   recente e **quais dias dos últimos 30 ficaram sem cópia**
7. tamanho e número de arquivos de `backups/`, `lotes/` e `coletas/`. Um
   arquivo com mais de 7 dias em `lotes/` indica que o cron de limpeza parou
8. crontab: **só horário e nome** dos comandos e scripts. Um `curl` no cron
   pode levar o token do `/baixar-backup` na URL, por isso a URL é omitida.
   Lista também `/etc/cron.d`, `/etc/cron.daily` e os timers do systemd. Do
   log do backup, só contagem e a última data
9. disco e inodes
10. nginx: só as linhas `server_name`, `listen`, `proxy_pass` e
    `ssl_certificate`. Também as portas em escuta e a validade do
    certificado (`ufw` pede root e não é consultado)
11. logs do pm2 e do nginx: **só contagem** por tipo de erro (`ENOSPC`,
    `SQLITE_BUSY`, `EADDRINUSE`, `TypeError`…), nunca o texto
12. indícios de cópia externa: rclone, restic e similares no cron ou
    instalados; arquivos de configuração (só a existência, sem ler o
    conteúdo); downloads do `/baixar-backup` no access.log.
    **Indício não é prova:** só uma restauração conferida, feita a partir da
    cópia que está fora da VPS, prova backup externo

Depois disso, o `sanear.sh` passa no Mac como segunda barreira. Ele mascara
token, senha, e-mail, CPF e sequências longas. Se aparecer uma chave privada,
ele **aborta sem gravar nada**.

## 4. Etapa 3 — cópias dos bancos (SÓ COM AUTORIZAÇÃO EXPLÍCITA)

**Nada disto roda sozinho.** Só depois de ler o relatório da coleta e de
autorizar, comando por comando.

### Caminho recomendado: trazer as cópias que o servidor JÁ fez

O `backup.js` das 23:30 já copia os dois bancos pela **API de backup do
SQLite** (`db.backup()`), e não por `cp`. Desde 28/09/2026 isso inclui o
`tecido.db` (CLAUDE.md §13). Então a cópia consistente **já existe** em
`backups/`, e trazê-la não grava nada na VPS e não toca o banco em uso.

Pré-requisito: o relatório (seção 6) mostrar as duas cópias de ontem
(`dados-AAAA-MM-DD.db` e `tecido-AAAA-MM-DD.db`).

```bash
# 1. no Mac: pasta restrita FORA do repositório
mkdir -p ~/Deccorar-auditoria-copias && chmod 700 ~/Deccorar-auditoria-copias

# 2. confere o resumo (sha256) das duas cópias LÁ, só lendo
#    (troque AAAA-MM-DD pela data de ontem que o relatório mostrou)
ssh deccorar-vps 'cd /opt/expedicao/backups && sha256sum dados-AAAA-MM-DD.db tecido-AAAA-MM-DD.db'

# 3. traz as duas
scp deccorar-vps:/opt/expedicao/backups/dados-AAAA-MM-DD.db  ~/Deccorar-auditoria-copias/
scp deccorar-vps:/opt/expedicao/backups/tecido-AAAA-MM-DD.db ~/Deccorar-auditoria-copias/

# 4. confere que chegaram iguais e íntegras (no Mac)
cd ~/Deccorar-auditoria-copias && shasum -a 256 *.db
chmod 600 *.db
sqlite3 dados-AAAA-MM-DD.db  'PRAGMA integrity_check;'
sqlite3 tecido-AAAA-MM-DD.db 'PRAGMA integrity_check;'
```

Os dois resumos do passo 4 têm que ser **iguais** aos do passo 2, e o
`integrity_check` tem que responder `ok`.

### Se for preciso o dado de AGORA (não o de ontem)

Aí é preciso gerar uma cópia nova na VPS pela API de backup. Isso **grava um
arquivo no servidor** e por isso fica fora desta ferramenta: precisa de plano
e autorização à parte. Nunca use `cp dados.db` ou `scp dados.db` do banco em
uso: o dado mora no `-wal`, e a cópia sai vazia ou rasgada (CLAUDE.md §12).

### Regras das cópias

- Elas têm **dados pessoais** (clientes, CPF, endereço, hash de PIN).
- Ficam **só** em `~/Deccorar-auditoria-copias/`, num disco com FileVault.
- **Nunca** no repositório, no GitHub, no ChatGPT, por e-mail nem em nuvem.
- Apague a pasta quando a auditoria terminar.
- Restauração na VPS **nunca** faz parte da auditoria.
