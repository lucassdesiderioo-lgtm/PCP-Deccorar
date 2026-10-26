# HTTPS — `https://pcp.deccorar.com.br` (fase 5-B da spec `ACESSOS-UNIFICADOS`)

> **26/10/2026.** Passo a passo do servidor. Rode **um comando por vez** e confira
> o resultado antes do próximo. Nada aqui mexe no Traefik nem no n8n.

## Como fica

```
navegador ──https──▶ Traefik (Docker, portas 80/443, certificado Let's Encrypt)
                       └─▶ serviço pcp-https (socat, rede public)
                             └─▶ 172.19.0.1:3010  (o PCP, no pm2, como sempre)
```

- **O Traefik já é o dono das portas 80 e 443** e já tira certificado para o n8n
  (`letsencryptresolver`, desafio pela porta 80). O nginx do servidor escuta só
  em 8080 e 4000 e **não entra nisto**.
- **O Traefik não lê arquivo de configuração**, só etiqueta de serviço do Docker.
  Por isso o PCP entra por um serviço pequeno (`pcp-https`) cuja única função é
  repassar o tráfego para a porta 3010 do próprio servidor. Ligar o *file
  provider* exigiria reiniciar o Traefik — e derrubar o n8n junto.
- **`172.19.0.1` é o servidor visto de dentro do Docker** (`docker_gwbridge`).
- **O PCP sabe que veio por https** pelo cabeçalho `X-Forwarded-Proto` que o
  Traefik põe, e só então marca o cookie da sessão como `Secure` (`auth.js`,
  `teste_login.js` seção 10). Pelo endereço velho o cookie sai como antes.

## Etapa 1 — ligar o https (o endereço velho continua funcionando)

**0. O nome aponta para este servidor?** Os dois números têm que ser iguais.

```bash
getent hosts pcp.deccorar.com.br; curl -s -4 ifconfig.me; echo
```

Se o primeiro não aparecer ou for diferente, o apontamento (registro `A`) tem
que ser criado no provedor do domínio antes de seguir — sem isso o Let's
Encrypt recusa o certificado.

**1. Ver como o n8n está etiquetado** (só lê). Serve para copiar o mesmo jeito:

```bash
docker service ls --format '{{.Name}}' | grep -i n8n; docker service inspect n8n-_n8n_editor --format '{{json .Spec.Labels}}' | tr ',' '\n'
```

**2. Criar o serviço do PCP:**

```bash
docker service create --name pcp-https --network public \
  --label traefik.enable=true \
  --label traefik.swarm.network=public \
  --label 'traefik.http.routers.pcp-deccorar.rule=Host(`pcp.deccorar.com.br`)' \
  --label traefik.http.routers.pcp-deccorar.entrypoints=websecure \
  --label traefik.http.routers.pcp-deccorar.tls.certresolver=letsencryptresolver \
  --label traefik.http.services.pcp-deccorar.loadbalancer.server.port=3010 \
  alpine/socat tcp-listen:3010,fork,reuseaddr tcp:172.19.0.1:3010
```

Tem que terminar em `verify: Service converged`.

**3. Conferir (espere ~30 s pelo certificado):**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://pcp.deccorar.com.br/login
curl -sv -o /dev/null https://pcp.deccorar.com.br/login 2>&1 | grep -iE "issuer|expire date"
```

Esperado: `200`, emissor **Let's Encrypt**. E o teste de segurança da §10 pelo
endereço novo:

```bash
for r in / /admin /index.html /painel /operador /sobmedida /api/skus /sobmedida/api/eu /login; do printf "%-18s " $r; curl -s -o /dev/null -w "%{http_code}\n" https://pcp.deccorar.com.br$r; done
```

Telas `302`, API `401`, `/login` `200`.

**Desfazer a etapa 1** (volta tudo como estava): `docker service rm pcp-https`

### Depois da etapa 1 — os tablets e computadores

Em cada aparelho: apagar o ícone da Tela de Início, abrir
`https://pcp.deccorar.com.br/<a estação>` no Safari, entrar com o PIN e
**Adicionar à Tela de Início** de novo. O ícone salvo guarda o endereço velho.

## Etapa 2 — fechar a porta 3010 para a internet

**Só depois de TODO aparelho estar no endereço https.** Fechar antes deixa fora
quem ainda está no `http://…:3010`.

```bash
ufw allow from 172.19.0.0/16 to any port 3010 proto tcp
ufw delete allow 3010/tcp
```

A primeira linha deixa o serviço `pcp-https` continuar chegando ao PCP; a
segunda tira a porta da internet. Confira de novo o passo 3.

**Desfazer a etapa 2:** `ufw allow 3010/tcp`

## O que fica para depois

- **HSTS** (o navegador passa a recusar http para o nome): só depois de uma
  semana estável. Uma vez mandado, o navegador guarda — desfazer é difícil.
