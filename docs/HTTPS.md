# HTTPS — `https://pcp.sistemadeccorar.com.br` (fase 5-B da spec `ACESSOS-UNIFICADOS`)

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
getent hosts pcp.sistemadeccorar.com.br; curl -s -4 ifconfig.me; echo
```

Se o primeiro não aparecer ou for diferente, o apontamento (registro `A`) tem
que ser criado no provedor do domínio antes de seguir — sem isso o Let's
Encrypt recusa o certificado.

**1. Ver como o n8n está etiquetado, e se já há alguma rota para o nome** (só
lê). O primeiro serve para copiar o mesmo jeito; o segundo tem que sair **vazio**
— rota em dobro para o mesmo nome faz o Traefik escolher uma das duas sem avisar:

```bash
docker service ls --format '{{.Name}}' | grep -i n8n; docker service inspect n8n-_n8n_editor --format '{{json .Spec.Labels}}' | tr ',' '\n'
for s in $(docker service ls -q); do docker service inspect $s --format '{{.Spec.Name}} {{json .Spec.Labels}}' | grep -i sistemadeccorar; done
```

**2. Criar o serviço do PCP:**

```bash
docker service create --name pcp-https --network public \
  --label traefik.enable=true \
  --label traefik.swarm.network=public \
  --label 'traefik.http.routers.pcp-deccorar.rule=Host(`pcp.sistemadeccorar.com.br`)' \
  --label traefik.http.routers.pcp-deccorar.entrypoints=websecure \
  --label traefik.http.routers.pcp-deccorar.tls.certresolver=letsencryptresolver \
  --label traefik.http.services.pcp-deccorar.loadbalancer.server.port=3010 \
  alpine/socat tcp-listen:3010,fork,reuseaddr tcp:172.19.0.1:3010
```

Tem que terminar em `verify: Service converged`.

**3. Conferir (espere ~30 s pelo certificado):**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://pcp.sistemadeccorar.com.br/login
curl -sv -o /dev/null https://pcp.sistemadeccorar.com.br/login 2>&1 | grep -iE "issuer|expire date"
```

Esperado: `200`, emissor **Let's Encrypt**. E o teste de segurança da §10 pelo
endereço novo:

```bash
for r in / /admin /index.html /painel /operador /sobmedida /api/skus /sobmedida/api/eu /login; do printf "%-18s " $r; curl -s -o /dev/null -w "%{http_code}\n" https://pcp.sistemadeccorar.com.br$r; done
```

Telas `302`, API `401`, `/login` `200`.

**4. Conferir o que não pode ter mudado:**

```bash
curl -s -o /dev/null -w "http -> %{http_code} %{redirect_url}\n" http://pcp.sistemadeccorar.com.br/login
curl -sk -o /dev/null -w "outro nome -> %{http_code}\n" -H "Host: nao-existe.sistemadeccorar.com.br" https://187.77.62.147/login
docker service ls --format '{{.Name}} {{.Replicas}}'
```

Esperado: o http **redireciona** para `https://…/login` (301/308); um nome que
não é o do PCP leva **404** do Traefik, e não a tela do PCP; e todo serviço com
as réplicas cheias (`1/1`). Abra o n8n no navegador e confira que ele abre.

**Desfazer a etapa 1** (volta tudo como estava): `docker service rm pcp-https`

### Depois da etapa 1 — os tablets e computadores

Em cada aparelho: apagar o ícone da Tela de Início, abrir
`https://pcp.sistemadeccorar.com.br/<a estação>` no Safari, entrar com o PIN e
**Adicionar à Tela de Início** de novo. O ícone salvo guarda o endereço velho.

## Etapa 2 — fechar a porta 3010 para a internet

**Só depois de TODO aparelho estar no endereço https.** Fechar antes deixa fora
quem ainda está no `http://…:3010`.

**Antes, confira de onde vem o tráfego** (só lê), com alguém usando o sistema
pelo https. As conexões que o `pcp-https` abre têm que vir de `172.19.…`; se
vierem de outra faixa, a regra abaixo está errada e não se fecha nada:

```bash
ss -tn state established '( sport = :3010 )' | awk 'NR>1{print $4}' | cut -d: -f1 | sort | uniq -c
```

Aparecerem também IPs de fora é normal enquanto houver aparelho no endereço
velho — é exatamente quem ainda falta trocar.

```bash
ufw allow from 172.19.0.0/16 to any port 3010 proto tcp
ufw delete allow 3010/tcp
```

A primeira linha deixa o serviço `pcp-https` continuar chegando ao PCP; a
segunda tira a porta da internet. Confira de novo o passo 3.

**Desfazer a etapa 2:** `ufw allow 3010/tcp`

## O que fica para depois

A investigação do dono (`SPEC-INFRA-001`, 26/10/2026) foi lida contra este
servidor. O que valia entrou acima (o nome certo, a rota em dobro, o nome
alheio, os vizinhos e a origem antes de fechar a 3010). O que **não** entrou, e
por quê:

- **Arquivo dinâmico do Traefik** (`infra/traefik/dynamic/…`): o Traefik daqui
  não lê arquivo, e ligar isso é reiniciar o serviço dele — derruba o n8n.
- **Inventário de autenticação e permissão:** já existe e tem teste (§10 do
  `CLAUDE.md`, `teste_login.js`, `teste_acesso.js`, `teste_cobertura.js`).
- **CSP:** as telas têm o JavaScript escrito dentro do HTML; uma CSP rígida
  deixa todas em branco. É projeto próprio.
- **Monitoramento e alertas completos:** não há ferramenta no servidor; é
  projeto próprio. O pedaço barato é o aviso de certificado perto de vencer.

- **HSTS** (o navegador passa a recusar http para o nome): só depois de uma
  semana estável. Uma vez mandado, o navegador guarda — desfazer é difícil.
- **Cabeçalhos simples** (`X-Content-Type-Options`, `Referrer-Policy`,
  `frame-ancestors`): pequenos, mas cada um precisa abrir as telas para ver
  que nada quebrou.
