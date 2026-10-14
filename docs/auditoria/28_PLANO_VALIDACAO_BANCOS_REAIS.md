# 28 — Plano de validação dos bancos reais e do teste de restauração

> **Nada daqui roda na produção, e nada roda sem autorização explícita do
> proprietário.** Na VPS, o plano só faz duas coisas, as duas de leitura:
> listar as cópias e tirar o `sha256` delas. Todo o resto acontece no Mac, numa
> pasta isolada, sobre **cópias das cópias**.
>
> **Dado pessoal não sai do Mac.** Os bancos têm nome, endereço e CPF de
> comprador (PDFs do ML), o nome dos funcionários e o hash do PIN de cada um
> (`usuarios.salt`/`pin_hash`). As consultas abaixo devolvem **só contagens e
> verdadeiro/falso**: nenhuma linha de cliente, nenhum nome, nenhum hash.
> O que vai para o relatório são esses números.

## 0. O que este plano responde

| Pergunta | Hoje |
|---|---|
| as cópias dos dois bancos abrem e estão íntegras? | não comprovado |
| a cópia tem o esquema que o código atual espera? | não comprovado |
| os números internos fecham (livro × saldo, peças órfãs)? | não comprovado |
| o sistema SOBE a partir de uma cópia (restauração)? | nunca testado |
| quanto se perde (RPO) e quanto se demora (RTO) numa perda da VPS? | desconhecido |

## 1. Que cópia usar

**A do `backups/`, nunca o banco em uso.** O `backup.js` já copia os dois
bancos pela API de backup do SQLite (`db.backup()`, desde 28/09/2026 para o
tecido). A cópia é consistente e trazê-la não grava nada na VPS. Copiar o
`dados.db` em uso com `cp`/`scp` dá um arquivo que abre e está vazio, porque o
dado mora no `-wal` (CLAUDE.md §12).

Use a cópia **de ontem**, dos dois bancos, da mesma data:
`dados-AAAA-MM-DD.db` e `tecido-AAAA-MM-DD.db`.

## 2. ⚠️ O caminho até o Mac é uma DECISÃO do proprietário (ainda aberta)

O acesso à VPS hoje é **só pelo console do painel**, sem SSH. Isso muda tudo:

| Caminho | Leva o `dados` | Leva o `tecido` | Problema |
|---|---|---|---|
| **SSH com chave + `scp`** | sim | sim | precisa ligar o SSH por chave no painel. É o caminho **recomendado** |
| `/baixar-backup` (rota do PCP) | sim | **não** | trafega **em HTTP puro**: o token e o banco inteiro, com dados de cliente e hash de PIN, passam abertos pela internet (dívida 2). **Não recomendado** |
| gerenciador de arquivos / snapshot do painel da Hostinger | depende do painel | depende do painel | precisa conferir o que o painel oferece |
| copiar e colar pelo console | não | não | inviável para arquivo binário, e arriscado |

**Até essa decisão, a parte C deste plano fica parada.** Ela está no item D1
do documento 29.

## 3. Passo a passo (depois da autorização e do canal escolhido)

### 3.1 Na VPS — só leitura, pelo console

```bash
cd /opt/expedicao/backups
ls -1 dados-????-??-??.db tecido-????-??-??.db | tail -4     # só nomes com data
sha256sum dados-AAAA-MM-DD.db tecido-AAAA-MM-DD.db           # anotar os dois resumos
```

O `sha256sum` só lê. **Não abra os `.db` com `sqlite3` na VPS:** abrir uma
cópia em modo WAL cria `-shm`/`-wal` na pasta de backups, e isso é escrita na
produção.

### 3.2 No Mac — pasta isolada

```bash
mkdir -p ~/Deccorar-auditoria-copias/original ~/Deccorar-auditoria-copias/trabalho
chmod -R 700 ~/Deccorar-auditoria-copias
# … trazer os dois arquivos para ./original pelo canal decidido no item 2 …
cd ~/Deccorar-auditoria-copias
shasum -a 256 original/*.db          # TEM que bater com os resumos da VPS
chmod 400 original/*.db              # o original fica só leitura, para sempre
cp original/*.db trabalho/           # tudo abaixo roda na cópia de trabalho
```

> A cópia **de trabalho** existe porque até abrir em `-readonly` pode criar
> `-shm` ao lado do arquivo (a cópia herda o modo WAL). O original não pode
> mudar nem um byte: ele é a prova.

- O disco do Mac precisa estar com **FileVault** ligado.
- A pasta fica **fora** do repositório: o Git nunca a enxerga.
- Nada desta pasta vai para chat, e-mail, nuvem ou GitHub.

### 3.3 Integridade (no Mac, na cópia de trabalho)

```bash
cd ~/Deccorar-auditoria-copias/trabalho
for b in dados-*.db tecido-*.db; do
  echo "== $b"
  sqlite3 -readonly "$b" "PRAGMA integrity_check;"      # esperado: ok
  sqlite3 -readonly "$b" "PRAGMA foreign_key_check;" | wc -l   # esperado: 0 (no tecido, que liga FK)
  sqlite3 -readonly "$b" "PRAGMA page_count; PRAGMA page_size; PRAGMA journal_mode;"
done
```

| Resultado | Leitura |
|---|---|
| `integrity_check` = `ok` | a cópia está estruturalmente íntegra |
| qualquer outra linha | **parar**, e conferir a cópia de outro dia antes de concluir qualquer coisa sobre o banco em uso |
| `foreign_key_check` > 0 no tecido | dado órfão: vira achado, com a contagem por tabela (só nome de tabela, sem linha) |

### 3.4 O esquema bate com o código?

Lista **só nomes** de tabela e coluna, sem dado nenhum:

```bash
sqlite3 -readonly dados-*.db  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY 1;"   > esquema_dados.txt
sqlite3 -readonly tecido-*.db "SELECT n, nome FROM migracao ORDER BY n;"                        > migracoes_tecido.txt
```

- **Tecido:** a última migração aplicada tem que ser a última que o
  `tecido/nucleo/schema.js` conhece. Diferença quer dizer código e banco fora
  de passo.
- **Dados:** comparar com os `CREATE TABLE` dos módulos (CLAUDE.md §17). Coluna
  que o código usa e o banco não tem é dívida nova.

### 3.5 Os números fecham? (só contagens)

```sql
-- dados: o livro fecha com o saldo de cada SKU? (CLAUDE.md §2)  esperado: 0
SELECT COUNT(*) FROM skus s
 WHERE COALESCE(s.estoque,0) <> COALESCE((SELECT SUM(delta) FROM movimento_estoque m WHERE m.codigo=s.codigo),0);

-- dados: saldo negativo (é sinal, não erro, mas tem que ser conhecido)
SELECT COUNT(*) FROM skus WHERE estoque < 0;

-- dados: peças de caixa sem volume (o "lote_item órfão" do §5)
SELECT COUNT(*) FROM lote_item i LEFT JOIN lote l ON l.id=i.lote_id WHERE l.id IS NULL;

-- dados: volumes por estágio (só a contagem)
SELECT estagio, COUNT(*) FROM lote GROUP BY estagio;

-- dados: há quanto tempo o banco recebe movimento (data, sem conteúdo)
SELECT MAX(criado_em) FROM movimento_estoque;
```

> Se o nome de alguma coluna divergir (por exemplo a data do
> `movimento_estoque`), a consulta é ajustada **olhando o `CREATE TABLE` no
> código**, nunca abrindo linha de dado para descobrir.

### 3.6 Teste de restauração (no Mac, isolado)

O objetivo é provar que, **perdida a VPS, o sistema volta a subir a partir da
cópia**, e medir quanto isso demora.

```bash
# 1) um clone limpo do código que a VPS roda (f793eb7, ou a main: não há
#    diferença de código entre os dois — ver doc 27, ponto 7)
git clone <repositório> ~/Deccorar-auditoria-copias/restauro && cd ~/Deccorar-auditoria-copias/restauro
git checkout f793eb7 && npm ci

# 2) a "produção" de mentira: uma pasta só desta rodada
mkdir -p ~/Deccorar-auditoria-copias/restauro-dados/backups
cp ../trabalho/dados-*.db  ~/Deccorar-auditoria-copias/restauro-dados/dados.db
cp ../trabalho/tecido-*.db tecido/tecido.db

# 3) subir apontando para ela (caminhos.js e tecido/nucleo/caminho.js)
PCP_DIR=~/Deccorar-auditoria-copias/restauro-dados node server.js
#    em outro terminal:
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010/login   # esperado 200
for r in / /admin /api/skus /sobmedida; do curl -s -o /dev/null -w "$r %{http_code}\n" http://localhost:3010$r; done
#    esperado: telas 302, API 401 (o teste da §10)
```

| Conferir | Esperado |
|---|---|
| o servidor sobe sem erro de banco | sim. **O boot roda as migrações e grava na cópia**: é esperado, e é justamente o que um restauro de verdade faria |
| `/login` | 200 |
| telas e API sem sessão | 302 / 401 |
| `node backup.js` com o mesmo `PCP_DIR` | gera as duas cópias na pasta de mentira |
| tempo de ponta a ponta, do arquivo na mão ao `/login` 200 | anotar: é o **RTO** medido |

> ⚠️ **Não faça login com PIN de pessoa real** nessa cópia: a validação não
> precisa de sessão, e PIN de verdade não deve ser digitado fora da operação.
> ⚠️ Rode **sem acesso à internet** se possível, e com nada de saída
> configurada: a cópia não pode mandar nada a lugar nenhum.

### 3.7 O que vai para o relatório

Só: os dois `sha256` batendo, `integrity_check` `ok` ou não, as contagens do
3.5, a migração mais alta do tecido, os códigos HTTP do 3.6 e o RTO medido.

### 3.8 Depois

```bash
rm -rf ~/Deccorar-auditoria-copias      # quando a auditoria fechar
```

Registrar no relatório a data em que a pasta foi apagada.

## 4. RPO e RTO — o que já dá para dizer sem as cópias

| | Hoje, pela evidência |
|---|---|
| **RPO** (quanto se perde) se o **banco** corromper | até **24 h**: a cópia é uma vez por dia, às 23:30 |
| **RPO** se a **VPS inteira** se perder | **tudo**: as cópias moram no mesmo disco (doc 27, ponto 3), a menos que exista snapshot no painel |
| **RTO** | **desconhecido**: nunca foi medido. O passo 3.6 mede |

## 5. Critério de "validado"

A validação dos bancos só se dá por feita com **todos** estes itens:

1. `sha256` da VPS = `sha256` do Mac, para os dois arquivos;
2. `integrity_check` = `ok` nos dois;
3. `foreign_key_check` = 0 no tecido, ou cada órfão explicado;
4. esquema e migrações batendo com o código que a VPS roda;
5. livro × saldo = 0 SKUs divergentes, ou cada divergência explicada;
6. restauração no Mac com `/login` 200 e o teste da §10 passando;
7. RTO medido e anotado.

Faltando qualquer um, o item fica escrito como **não comprovado**, e não como
"provavelmente ok".
