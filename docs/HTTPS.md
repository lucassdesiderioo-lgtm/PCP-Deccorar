# HTTPS — o sistema em `https://pcp.sistemadeccorar.com.br`

Fase 5-B da spec `docs/specs/ACESSOS-UNIFICADOS.md` (dívida 2 do `CLAUDE.md` §14).
Até aqui o sistema abria em `http://187.77.62.147:3010`, **sem cadeado**: o PIN
viajava aberto pela rede.

O nginx atende o endereço com cadeado e repassa ao sistema, que continua na
porta 3010 da própria máquina. O certificado é o gratuito do Let's Encrypt e se
renova sozinho.

```
tablet ──https──▶ nginx (porta 443, certificado) ──▶ sistema (127.0.0.1:3010)
```

> ⚠️ **A ordem importa.** Faça o deploy do código **antes** do passo 4. O código
> novo só passa a marcar o cookie como protegido quando o pedido chega pelo
> nginx com cadeado. Pelo IP antigo, tudo continua funcionando como hoje, então
> nada quebra no meio do caminho.

---

## Passo 1 — o nome, no painel da Hostinger (5 minutos)

1. hPanel → **Domínios** → `sistemadeccorar.com.br` → **DNS / Nameservers**.
2. **Adicionar registro**:
   - Tipo: **A**
   - Nome: **`pcp`**
   - Aponta para: **`187.77.62.147`**
   - TTL: o padrão
3. Salvar.

O nome leva de alguns minutos a algumas horas para valer. Para conferir, no
Terminal do Mac:

```bash
dig +short pcp.sistemadeccorar.com.br
```

Tem que responder `187.77.62.147`. **Não siga para o passo 3 antes disso.** O
certificado só sai quando o nome já aponta para o servidor.

> Os outros sistemas da empresa seguem a mesma ideia: um nome por sistema
> (`outro.sistemadeccorar.com.br`), cada um com o próprio registro **A**.

## Passo 2 — conferir o servidor (só lê)

No terminal da VPS (Hostinger → VPS → Terminal):

```bash
which nginx certbot
sudo ss -tlnp | grep -E ':(80|443|3010) '
```

Mande a saída. Ela diz se o nginx já está instalado e o que já está ocupando
as portas 80 e 443.

## Passo 3 — instalar e ligar o nginx

> Pule a linha do `apt install` se o passo 2 mostrou que o nginx e o certbot
> já existem.

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx

sudo tee /etc/nginx/sites-available/pcp >/dev/null <<'NGINX'
server {
    listen 80;
    server_name pcp.sistemadeccorar.com.br;

    # PDF do Mercado Livre: o sistema aceita até 25 MB
    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/pcp /etc/nginx/sites-enabled/pcp
sudo nginx -t && sudo systemctl reload nginx
```

O `nginx -t` tem que dizer **`syntax is ok`** e **`test is successful`**.
Conferência: `http://pcp.sistemadeccorar.com.br/login` abre a tela de PIN,
ainda sem cadeado.

> ⚠️ **O `client_max_body_size 25m` não é enfeite.** Sem ele, o nginx recusa
> qualquer envio acima de 1 MB, e o upload do PDF do Mercado Livre falha. É a
> armadilha do `express.json()` do `CLAUDE.md` §12, agora na frente do sistema.

## Passo 4 — o certificado (o cadeado)

```bash
sudo certbot --nginx -d pcp.sistemadeccorar.com.br --redirect \
     -m <seu e-mail> --agree-tos --no-eff-email
```

- `--redirect` faz quem entrar por `http://pcp…` ir sozinho para `https://pcp…`.
- Troque `<seu e-mail>` pelo seu. Ele recebe só o aviso se a renovação automática falhar.

Conferências:

```bash
sudo certbot renew --dry-run      # a renovação automática funciona
curl -sI https://pcp.sistemadeccorar.com.br/login | head -1   # HTTP/1.1 200 OK
```

No navegador, `https://pcp.sistemadeccorar.com.br` abre **com o cadeado**.
Entre com o seu PIN. O sistema funciona igual.

## Passo 5 — os tablets e os computadores

Para o iPad, o endereço novo é **outro site**. Em cada tablet:

1. Apague o ícone antigo da estação na tela de início (o que abre pelo IP).
2. No Safari, abra **`https://pcp.sistemadeccorar.com.br/<estação>`**
   (`/operador`, `/montagem`, `/embalagem`, `/carregamento`, `/inventario` ou
   `/devolucao`) e entre com o PIN.
3. Compartilhar → **Adicionar à Tela de Início**.

Nos computadores, troque o favorito do IP pelo endereço novo. Na TV, abra
`https://pcp.sistemadeccorar.com.br/painel` e entre com o PIN uma vez.

## Passo 6 — fechar a porta antiga (depois que todos mudaram)

Enquanto a porta 3010 estiver aberta para fora, `http://187.77.62.147:3010`
continua funcionando **sem cadeado**. Feche-a só quando **todos os tablets e
computadores** já estiverem no endereço novo:

- **Hostinger → VPS → Firewall:** deixe abertas só as portas **22** (SSH),
  **80** e **443**, e tire a **3010**.

O sistema continua ouvindo a 3010 por dentro, para o nginx. Só a entrada de
fora fecha.

Conferência, no Mac: `curl -m 5 -sI http://187.77.62.147:3010/login` não
responde mais.

## Antes de fechar a porta: o cron

Confira se algum agendamento chama o sistema pelo **IP de fora**:

```bash
crontab -l | grep -c '187.77.62.147'
```

Se der mais que zero, me avise antes de fechar a porta. O que chama
`localhost:3010` continua funcionando, porque o firewall só fecha a entrada de
fora. **Não cole a linha**
aqui: ela pode carregar o token do `/baixar-backup`.
