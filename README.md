# PCP Deccorar

Sistema de Planejamento e Controle da Produção para fabricação e expedição de
persianas vendidas no Mercado Livre.

Controla o caminho completo de uma peça — da ordem de produção ao carregamento no
veículo — com rastreamento de tempo em cada posto, conferência por leitor de código
de barras e travas que impedem envio errado.

---

## Fluxo da operação

```
   PDF do Mercado Livre
            │
            ▼
   ┌─────────────────┐
   │ Ordem do dia    │  urgente (sem estoque) │ reposição (com estoque)
   └────────┬────────┘
            ▼
      ┌──────────┐   2 bipes (início/fim), cronômetro
      │ REVISÃO  │   🔴 hoje  🔵 estoque  🟡 devoluções
      └────┬─────┘
           ▼
      ┌──────────┐
      │  FILA    │   aguardando embalagem
      └────┬─────┘
           ▼
      ┌──────────┐   3 bipes (SKU → kit → SKU)
      │EMBALAGEM │   +1 no estoque
      └────┬─────┘
           ▼
      ┌──────────┐
      │ ESTOQUE  │
      └────┬─────┘
           ▼
   ┌────────────────┐   bipe do SKU → puxa a venda → imprime
   │ETIQUETA VENDA  │   −1 no estoque
   └───────┬────────┘
           ▼
   ┌────────────────┐   bipe da etiqueta → confere no veículo
   │ CARREGAMENTO   │
   └────────────────┘
```

> **Regra central:** a peça só vira estoque **depois de embalada com o kit
> conferido**, e só sai do estoque **quando a etiqueta de venda é impressa**.

---

## Telas

| Rota | Nome | Área exigida | Quem usa |
|---|---|---|---|
| `/` `/admin` | Admin | `admin` | Gestão |
| `/operador` | Estação de Revisão | `operador` | Revisor (tablet) |
| `/devolucao` | Devoluções | `devolucao` | Revisor (tablet) |
| `/montagem` | Embalagem | `montagem` | Embalador (tablet) |
| `/embalagem` | Etiqueta de Venda | `embalagem` | Expedição (PC) |
| `/expedicao` | Subir PDFs | `expedicao` | Gestão |
| `/carregamento` | Carregamento | `carregamento` | Carregador (tablet) |
| `/painel` | Painel do dia | `painel` | Todos |
| `/relatorios` | Relatórios + Gerencial | `relatorios` | Gestão |
| `/necessidade` | Necessidade (ABC) | `necessidade` | Gestão |
| `/login` | Login | livre | Todos |

**Abas do Admin:** Lançar produção · Estoque & Necessidade · Cadastro de SKU ·
Necessidade (ABC) · Relatórios · Pessoas & Acessos · Cadastros · Devoluções ·
Problemas · Contagem · Bloqueados · Modo teste

**Atalhos:** `Alt+1` a `Alt+9` trocam de tela · `Alt+0` sai do sistema.
Exigem a tecla Alt — leitores de código de barras digitam números soltos e por
isso nunca disparam atalho por acidente.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 22 |
| Servidor | Express |
| Banco | SQLite (`better-sqlite3`), modo WAL |
| Frontend | HTML + JavaScript puro, sem framework |
| Gráficos | Chart.js 4.4.1 (CDN) |
| Código de barras | JsBarcode (CDN), CODE128B |
| PDF | `pdfjs-dist` (leitura) + `pdf-lib` (montagem para impressão) |
| Processo | PM2 |
| Sessão | Cookie assinado HMAC-SHA256 · PIN com `scrypt` + salt |

Sem build. Sem transpilação. O que está no repositório é o que roda.

---

## Ambiente

| Item | Valor |
|---|---|
| Servidor | Hostinger VPS · Ubuntu 24.04 LTS |
| IP | `187.77.62.147` |
| Porta | `3010` |
| Diretório | `/opt/expedicao/` |
| Processo PM2 | `expedicao` |
| Banco | `/opt/expedicao/dados.db` |
| Backups | `/opt/expedicao/backups/` (diário, 23:30) |
| PDFs recebidos | `/opt/expedicao/lotes/` (limpeza automática em 7 dias) |

**Outros processos no mesmo servidor — não interferir:**
`deccorar-ponto` (porta 3000) · `pontorh` (porta 3001)

---

## Fluxo de trabalho

```
  Mac (Claude Code)  ──push──▶  GitHub (privado)  ──pull──▶  Servidor
```

O servidor **só recebe**. Nunca editar código direto nele.

### Deploy

```bash
# No Mac
git add -A
git commit -m "descrição da mudança"
git push

# No servidor
cd /opt/expedicao
git pull
node --check server.js
pm2 restart expedicao
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010/login   # espera 200
```

### Rollback

```bash
cd /opt/expedicao
git log --oneline -5
git checkout <hash-anterior> -- arquivo.js
pm2 restart expedicao
```

---

## Comandos de operação

```bash
# Estado dos processos
pm2 list

# Logs (sempre --nostream, senão trava o terminal)
pm2 logs expedicao --lines 30 --nostream

# Reinício limpo (quando o restart não pega a alteração)
cd /opt/expedicao && pm2 delete expedicao && pm2 start server.js --name expedicao

# Backup manual — use SEMPRE este, nunca `cp dados.db`
cd /opt/expedicao && node backup.js

# Restaurar um backup
pm2 stop expedicao
cp /opt/expedicao/backups/dados-AAAA-MM-DD.db /opt/expedicao/dados.db
pm2 start expedicao
```

### Diagnóstico: tela não abre

```bash
pm2 list                                                   # processo online?
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010/ROTA
grep -n "ROTA" /opt/expedicao/server.js                    # a rota existe?
```

`200` = servidor OK, problema no navegador · `404` = rota faltando ·
sem resposta = processo caiu (ver logs)

---

## Segurança

- Sessão: cookie assinado (HMAC-SHA256), segredo em `.session_secret` (fora do Git)
- PIN: hash `scrypt` com salt individual — **não é recuperável**
- Permissões por área, verificadas antes de servir qualquer tela ou API
- Bloqueio temporário após 5 PINs errados

**Teste obrigatório após mexer em `auth.js` ou `server.js`:**

```bash
for r in / /admin /index.html /painel /operador /api/skus; do
  printf "%-14s " "$r"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010$r
done
```

Esperado: `302` nas telas, `401` na API. Qualquer `200` é furo.

⚠️ **O sistema roda em HTTP puro.** Os PINs trafegam em texto aberto. Aceitável
na rede interna; **não** expor à internet sem HTTPS. Ninguém deve usar aqui um PIN
que use em outro lugar.

---

## Documentação

| Arquivo | Conteúdo |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | **Leia primeiro.** Regras que parecem bugs e não são, armadilhas, protocolo |
| [`docs/REGRAS-DE-NEGOCIO.md`](docs/REGRAS-DE-NEGOCIO.md) | O fluxo completo com todas as exceções |
| [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) | Banco de dados, rotas, dependências |

---

## Nunca versionar

`.session_secret` · `dados.db*` · `backups/` · `lotes/` · `node_modules/`

O `.gitignore` cobre todos. O banco contém hashes de PIN dos funcionários e dados
pessoais de compradores (nome, cidade, NF); os PDFs em `lotes/` idem.
