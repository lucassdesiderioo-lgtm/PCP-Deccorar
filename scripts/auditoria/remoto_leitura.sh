#!/usr/bin/env bash
# PCP Deccorar — COLETA DE AUDITORIA, PARTE QUE RODA NA VPS (SÓ LEITURA).
#
# Não é para rodar à mão no servidor: quem o manda é o
# `coletar_vps_deccorar.sh`, do Mac, por `ssh <alias> bash -s -- <caminho>`.
# Ele chega pelo stdin e não é gravado em lugar nenhum da VPS.
#
# ⚠️ REGRAS QUE ESTE ARQUIVO SEGUE, E O `teste_coleta_vps.js` VARRE:
#   - nada é escrito: sem `>` para arquivo, sem rm/mv/cp/chmod/touch/tee;
#   - sem sudo, sem reiniciar/parar nada, sem git pull/fetch, sem instalar;
#   - os bancos NÃO são abertos (abrir um banco em WAL pode criar o -shm):
#     só nome, tamanho e data;
#   - git com GIT_OPTIONAL_LOCKS=0: sem ele, o próprio `git status` regrava
#     o índice (.git/index) para guardar o cache de stat;
#   - o pm2 só é consultado se o daemon JÁ estiver de pé: `pm2 ping`,
#     `pm2 ls` e `pm2 jlist` INICIAM o daemon quando ele não existe;
#   - `pm2 jlist` traz o ambiente inteiro do processo (segredos): a saída
#     passa por um filtro que deixa só nome, estado, reinícios, uptime e
#     memória — nada de env;
#   - logs viram CONTAGEM de tipos conhecidos, nunca texto;
#   - do crontab sai só o horário e o NOME dos comandos/scripts (um `curl`
#     no cron pode levar o token do /baixar-backup na URL);
#   - nada de `cat` em arquivo de configuração.
#
# Códigos de saída: 0 ok · 2 uso errado · 3 dentro da janela proibida ·
# 4 o caminho não parece o projeto.

set -u
export LC_ALL=C
export GIT_OPTIONAL_LOCKS=0
export GIT_TERMINAL_PROMPT=0

DIR="${1:-}"
if [ -z "$DIR" ] || [ "${DIR#/}" = "$DIR" ]; then
  echo "ERRO: caminho absoluto do projeto é obrigatório" >&2; exit 2
fi

# ── JANELAS PROIBIDAS (horário da fábrica, America/Sao_Paulo) ─────────────
# 23:00–00:15 todo dia (backup das 23:30); 10:00–11:00 e 14:30–15:30 de
# segunda a sexta (corte e despacho). A mesma tabela está no script do Mac,
# e o teste confere que as duas são iguais.
# COLETA_AGORA (formato DHHMM, D=1..7) existe só para o teste; o script do
# Mac não a repassa pelo ssh.
JANELAS="1-7:2300-2359 1-7:0000-0015 1-5:1000-1100 1-5:1430-1530"
agora="${COLETA_AGORA:-$(TZ=America/Sao_Paulo date +%u%H%M)}"
dia="${agora:0:1}"; hm="${agora:1:4}"
for j in $JANELAS; do
  d1="${j:0:1}"; d2="${j:2:1}"; h1="${j:4:4}"; h2="${j:9:4}"
  if [ "$dia" -ge "$d1" ] && [ "$dia" -le "$d2" ] && \
     [ "$((10#$hm))" -ge "$((10#$h1))" ] && [ "$((10#$hm))" -le "$((10#$h2))" ]; then
    echo "RECUSADO: o relógio da VPS (horário de São Paulo, dia $dia, $hm) está numa janela proibida ($j)." >&2
    exit 3
  fi
done

if [ ! -d "$DIR" ] || [ ! -f "$DIR/server.js" ] || [ ! -f "$DIR/caminhos.js" ]; then
  echo "RECUSADO: $DIR não tem server.js e caminhos.js — não parece o projeto." >&2
  exit 4
fi

sec(){ printf '\n=== %s ===\n' "$1"; }
tem(){ command -v "$1" >/dev/null 2>&1; }
info(){ # tamanho em bytes, data de modificação
  if [ -e "$1" ]; then stat -c '%s bytes · modificado %y' "$1" 2>/dev/null | sed -E 's/\.[0-9]+ / /'
  else echo "não existe"; fi
}

echo "COLETA DE AUDITORIA — PCP Deccorar (somente leitura)"
echo "projeto: $DIR"

# ── 1. IDENTIDADE ────────────────────────────────────────────────────────
sec "1. identidade e relógio"
echo "usuário remoto: $(id -un)"
echo "hostname: $(hostname 2>/dev/null)"
echo "data/hora do servidor: $(date '+%Y-%m-%d %H:%M:%S %Z (%z)')"
echo "mesma hora em São Paulo: $(TZ=America/Sao_Paulo date '+%Y-%m-%d %H:%M:%S %Z')"
echo "ligado há: $(uptime -p 2>/dev/null || echo '?')"

# ── 2. VERSÕES ───────────────────────────────────────────────────────────
sec "2. versões"
if tem node; then echo "node: $(node --version 2>/dev/null)"; else echo "node: não encontrado no PATH"; fi
if tem sqlite3; then echo "sqlite3 (CLI): $(sqlite3 --version 2>/dev/null | awk '{print $1}')"; else echo "sqlite3 (CLI): não instalado"; fi
for pk in better-sqlite3 express pdf-lib; do
  pj="$DIR/node_modules/$pk/package.json"
  if [ -f "$pj" ]; then
    echo "$pk: $(grep -m1 -E '"version"[[:space:]]*:' "$pj" | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
  else echo "$pk: não instalado em node_modules"; fi
done

# ── 3. GIT ───────────────────────────────────────────────────────────────
sec "3. git (sem fetch, sem mexer no índice)"
if tem git && [ -d "$DIR/.git" ]; then
  G(){ git -c safe.directory="$DIR" -C "$DIR" "$@" 2>/dev/null; }
  echo "commit: $(G rev-parse --short HEAD || echo '?')"
  echo "branch: $(G rev-parse --abbrev-ref HEAD || echo '?')"
  echo "data do commit: $(G log -1 --format=%cd --date=iso || echo '?')"
  echo "título do commit: $(G log -1 --format=%s | cut -c1-100)"
  br="$(G rev-parse --abbrev-ref HEAD)"
  if G rev-parse --verify -q "origin/$br" >/dev/null; then
    echo "atrás de origin/$br (pela última fetch já feita, pode estar velho): $(G rev-list --count "HEAD..origin/$br")"
    echo "à frente de origin/$br: $(G rev-list --count "origin/$br..HEAD")"
  fi
  mod="$(G status --porcelain --untracked-files=no)"
  nmod=$(printf '%s' "$mod" | grep -c . || true)
  nunt=$(G status --porcelain --untracked-files=normal | grep -c '^??' || true)
  echo "arquivos versionados modificados no servidor: $nmod"
  [ "$nmod" -gt 0 ] && printf '%s\n' "$mod" | head -20 | sed 's/^/   /'
  echo "arquivos não versionados (só a contagem): $nunt"
  echo "índice (.git/index) modificado em: $(stat -c %y "$DIR/.git/index" 2>/dev/null | cut -d. -f1)"
else
  echo "git indisponível ou $DIR não é um repositório"
fi

# ── 4. PM2 ───────────────────────────────────────────────────────────────
sec "4. pm2 (só se o daemon já estiver de pé)"
PIDS_APP=""
eu="$(id -un)"
donos="$(ps -eo user=,args= 2>/dev/null | grep -E 'PM2 v[0-9.]+: God Daemon' | grep -v grep | awk '{print $1}' | sort -u | tr '\n' ' ')"
echo "daemon PM2 rodando como: ${donos:-nenhum encontrado}"
if ! tem pm2; then
  echo "pm2: não está no PATH deste usuário"
elif ! printf ' %s ' "$donos" | grep -q " $eu "; then
  echo "pm2: o daemon não é deste usuário ($eu) — não consultado (sem sudo, e chamar pm2 aqui criaria outro daemon)"
else
  echo "pm2: $(pm2 --version 2>/dev/null | tail -1)"
  saida="$(pm2 jlist 2>/dev/null)"
  if [ -n "$saida" ]; then
    lista="$(printf '%s' "$saida" | node -e '
      let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
        let a; try{ a=JSON.parse(s.slice(s.indexOf("["))); }catch(e){ console.log("  (saída do pm2 não é JSON)"); return; }
        for(const p of a){ const e=p.pm2_env||{}, m=p.monit||{};
          const up=e.pm_uptime? Math.round((Date.now()-e.pm_uptime)/3600000)+" h":"?";
          console.log("  "+[p.name, "estado="+e.status, "reinícios="+e.restart_time, "instáveis="+e.unstable_restarts,
            "no ar há "+up, "memória="+Math.round((m.memory||0)/1048576)+" MB", "cpu="+(m.cpu||0)+"%",
            "pasta="+(e.pm_cwd||"?"), "pid="+p.pid].join(" · "));
        }
      });' 2>/dev/null)"
    printf '%s\n' "${lista:-  (não consegui ler a lista)}"
    PIDS_APP="$(printf '%s\n' "$lista" | sed -nE 's/.*pid=([0-9]+).*/\1/p' | grep -v '^0$')"
  else
    echo "  pm2 jlist não respondeu"
  fi
fi

# ── 5. BANCOS ────────────────────────────────────────────────────────────
sec "5. arquivos dos bancos (não abertos)"
for f in dados.db dados.db-wal dados.db-shm tecido/tecido.db tecido/tecido.db-wal tecido/tecido.db-shm; do
  printf '%-22s %s\n' "$f" "$(info "$DIR/$f")"
done
echo "(PCP_DB / BANCO_TECIDO podem apontar para outro lugar; o ambiente não é lido. Os arquivos abertos de fato estão abaixo, se der para ver.)"
for pid in $PIDS_APP; do
  if [ -d "/proc/$pid/fd" ]; then
    echo "bancos abertos pelo processo $pid:"
    ls -l "/proc/$pid/fd" 2>/dev/null | sed -nE 's/.* -> (.*\.db(-wal|-shm)?)$/   \1/p' | sort -u
  fi
done

# ── 6. BACKUPS ───────────────────────────────────────────────────────────
sec "6. backups"
BK="$DIR/backups"
if [ -d "$BK" ]; then
  for b in dados tecido; do
    datas="$(ls -1 "$BK" 2>/dev/null | sed -nE "s/^$b-([0-9]{4}-[0-9]{2}-[0-9]{2})\.db$/\1/p" | sort)"
    n=$(printf '%s' "$datas" | grep -c . || true)
    echo "[$b] cópias diárias ($b-AAAA-MM-DD.db): $n"
    if [ "$n" -gt 0 ]; then
      echo "   mais antiga: $(printf '%s\n' "$datas" | head -1) · mais recente: $(printf '%s\n' "$datas" | tail -1)"
      ult="$BK/$b-$(printf '%s\n' "$datas" | tail -1).db"
      echo "   a mais recente: $(info "$ult")"
      falta=""; nf=0
      for i in $(seq 1 30); do
        d=$(TZ=America/Sao_Paulo date -d "-$i day" +%F)
        printf '%s\n' "$datas" | grep -qx "$d" || { falta="$falta $d"; nf=$((nf+1)); }
      done
      echo "   dias sem cópia nos últimos 30 (ontem para trás): $nf"
      [ "$nf" -gt 0 ] && printf '%s\n' $falta | paste -sd' ' - | fold -s -w 99 | sed 's/^/      /'
    fi
  done
  echo "outros arquivos na pasta (manuais, 'antes-de', etc.): $(ls -1 "$BK" 2>/dev/null | grep -vcE '^(dados|tecido)-[0-9]{4}-[0-9]{2}-[0-9]{2}\.db$' || true)"
  echo "tamanho da pasta: $(du -sh "$BK" 2>/dev/null | cut -f1)"
else
  echo "pasta $BK não existe (PCP_BACKUPS pode apontar para outro lugar)"
fi

# ── 7. PASTAS ────────────────────────────────────────────────────────────
sec "7. tamanho das pastas"
for p in backups lotes coletas; do
  if [ -d "$DIR/$p" ]; then
    n=$(find "$DIR/$p" -type f 2>/dev/null | wc -l)
    velho=$(find "$DIR/$p" -type f -printf '%TY-%Tm-%Td\n' 2>/dev/null | sort | head -1)
    printf '%-8s %6s · %s arquivos · arquivo mais antigo de %s\n' "$p" "$(du -sh "$DIR/$p" 2>/dev/null | cut -f1)" "$n" "${velho:--}"
  else
    printf '%-8s não existe\n' "$p"
  fi
done
echo "(lotes/ com arquivo de mais de 7 dias = o cron que apaga os PDFs pode ter parado)"

# ── 8. AGENDAMENTOS ──────────────────────────────────────────────────────
sec "8. agendamentos (só horário e nome dos comandos)"
EXTERNO_CRON=""
sanear_cron(){
  awk '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    /^[A-Za-z_][A-Za-z0-9_]*=/ { print "   (variável definida no crontab: " substr($0,1,index($0,"=")-1) " — valor omitido)"; next }
    {
      if ($1 ~ /^@/) { h=$1; ini=2 } else { h=$1" "$2" "$3" "$4" "$5; ini=6 }
      cmds=""; scr=""; log_=""; url=0
      for (i=ini;i<=NF;i++) {
        w=$i
        if (w ~ /https?:\/\//) { url=1; continue }
        if (w ~ /^(node|curl|wget|find|rclone|rsync|restic|aws|gsutil|scp|borg|duplicity|b2|sqlite3|pm2|certbot|bash|sh|tar|gzip|mysqldump|pg_dump)$/ || w ~ /\/(node|curl|wget|find|rclone|rsync|restic|aws|gsutil|scp|borg|duplicity|sqlite3|pm2|certbot|tar)$/) {
          n=split(w,a,"/"); cmds=cmds" "a[n] }
        if (w ~ /\.(sh|js|py)$/) { n=split(w,a,"/"); scr=scr" "a[n] }
        if ((w==">>" || w==">") && i<NF) { n=split($(i+1),a,"/"); log_=a[n] }
        else if (w ~ /^>>?[^>&]/) { x=w; sub(/^>>?/,"",x); n=split(x,a,"/"); log_=a[n] }
      }
      printf "   %s | comandos:%s | scripts:%s", h, (cmds==""?" -":cmds), (scr==""?" -":scr)
      if (log_!="") printf " | saída em: %s", log_
      if (url) printf " | contém URL (omitida)"
      printf "\n"
    }'
}
ct="$(crontab -l 2>/dev/null)"
if [ -n "$ct" ]; then
  echo "crontab de $(id -un):"
  printf '%s\n' "$ct" | sanear_cron
  EXTERNO_CRON="$(printf '%s\n' "$ct" | grep -v '^[[:space:]]*#' | grep -oE '\b(rclone|restic|rsync|scp|aws|gsutil|borg|duplicity|b2)\b' | sort -u | tr '\n' ' ')"
  # backup.js no cron: o log dele diz se rodou
  logbk="$(printf '%s\n' "$ct" | grep -v '^[[:space:]]*#' | grep 'backup' | grep -oE '>>?[[:space:]]*[^[:space:]]+' | head -1 | sed -E 's/^>>?[[:space:]]*//')"
  if [ -n "$logbk" ]; then
    case "$logbk" in /*) ;; *) logbk="$HOME/$logbk" ;; esac
    if [ -r "$logbk" ]; then
      echo "log do backup ($(basename "$logbk")): linhas 'backup ok' = $(grep -c 'backup ok' "$logbk" 2>/dev/null || true) · linhas com erro = $(grep -ciE 'error|erro|falh' "$logbk" 2>/dev/null || true)"
      echo "   última data citada num 'backup ok': $(grep 'backup ok' "$logbk" 2>/dev/null | tail -1 | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | tail -1)"
    else
      echo "log do backup citado no crontab, mas não legível: $(basename "$logbk")"
    fi
  fi
else
  echo "crontab de $(id -un): vazio ou sem acesso"
fi
for d in /etc/cron.d /etc/cron.daily; do
  [ -d "$d" ] && echo "$d: $(ls -1 "$d" 2>/dev/null | tr '\n' ' ')"
done
if tem systemctl; then
  echo "timers do systemd (nome e próxima execução):"
  systemctl list-timers --all --no-pager --no-legend 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i ~ /\.timer$/){print "   " $i; break}}' | head -20
fi

# ── 9. DISCO ─────────────────────────────────────────────────────────────
sec "9. espaço em disco"
df -hP "$DIR" / 2>/dev/null | awk 'NR==1 || !seen[$0]++'
echo "inodes:"; df -iP "$DIR" 2>/dev/null | tail -1

# ── 10. NGINX, PORTAS, CERTIFICADO ───────────────────────────────────────
sec "10. nginx (só server_name / listen / proxy_pass / ssl_certificate)"
CERTS=""; NOMES=""
if tem nginx || [ -d /etc/nginx ]; then
  echo "versão: $(nginx -v 2>&1 | sed 's/^nginx version: //')"
  for d in /etc/nginx/sites-enabled /etc/nginx/conf.d; do
    [ -d "$d" ] || continue
    for f in "$d"/*; do
      [ -e "$f" ] || continue
      if [ -r "$f" ]; then
        echo "-- $f"
        grep -hE '^[[:space:]]*(server_name|listen|proxy_pass|ssl_certificate)[[:space:]]' "$f" 2>/dev/null | sed -E 's/^[[:space:]]+/   /'
        CERTS="$CERTS $(grep -hE '^[[:space:]]*ssl_certificate[[:space:]]' "$f" | awk '{gsub(";","",$2); print $2}')"
        NOMES="$NOMES $(grep -hE '^[[:space:]]*server_name[[:space:]]' "$f" | sed -E 's/^[[:space:]]*server_name[[:space:]]+//; s/;//')"
      else
        echo "-- $f (sem permissão de leitura)"
      fi
    done
  done
else
  echo "nginx não encontrado"
fi

sec "10b. portas em escuta (TCP)"
if tem ss; then ss -ltnH 2>/dev/null | awk '{print "   " $4}' | sort -u
else echo "ss indisponível"; fi
echo "(3010 em 0.0.0.0 ou [::] = o Node responde direto, sem passar pelo nginx; em 127.0.0.1 = só por dentro)"
echo "(firewall: 'ufw status' pede root — não consultado)"

sec "10c. certificado TLS"
if ! tem openssl; then echo "openssl indisponível"
else
  achou=0
  for c in $CERTS; do
    if [ -r "$c" ]; then
      fim=$(openssl x509 -enddate -noout -in "$c" 2>/dev/null | sed 's/notAfter=//')
      dias=$(( ( $(date -d "$fim" +%s) - $(date +%s) ) / 86400 ))
      echo "$c: vence em $fim ($dias dias)"; achou=1
    elif [ -n "$c" ]; then echo "$c: sem permissão de leitura"; fi
  done
  if [ "$achou" = 0 ]; then
    for n in $NOMES; do
      case "$n" in _|localhost|*'*'*) continue ;; esac
      fim=$(timeout 8 openssl s_client -connect 127.0.0.1:443 -servername "$n" </dev/null 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | sed 's/notAfter=//')
      if [ -n "$fim" ]; then echo "$n (pela porta 443 local): vence em $fim ($(( ( $(date -d "$fim" +%s) - $(date +%s) ) / 86400 )) dias)"; achou=1
      else echo "$n: nada respondeu TLS na 443 local"; fi
    done
  fi
  [ "$achou" = 0 ] && echo "nenhum certificado encontrado (o CLAUDE.md §14 dívida 2 diz: sem HTTPS)"
fi

# ── 11. LOGS — SÓ CONTAGENS ──────────────────────────────────────────────
sec "11. erros nos logs (só contagem por tipo)"
PADROES='ENOSPC|SQLITE_BUSY|SQLITE_CORRUPT|database is locked|database disk image is malformed|EADDRINUSE|ECONNRESET|Cannot find module|SyntaxError|TypeError|ReferenceError|UnhandledPromiseRejection|FOREIGN KEY constraint|heap out of memory|EACCES'
contar(){ # $1 arquivo
  echo "-- $(basename "$1") ($(du -h "$1" 2>/dev/null | cut -f1), modificado $(stat -c %y "$1" 2>/dev/null | cut -d. -f1))"
  printf '%s' "$PADROES" | tr '|' '\n' | while IFS= read -r p; do
    c=$(grep -cF -- "$p" "$1" 2>/dev/null || true)
    [ "${c:-0}" -gt 0 ] && printf '   %-34s %s\n' "$p" "$c"
  done
  true
}
LOGS="${PM2_HOME:-$HOME/.pm2}/logs"
if [ -d "$LOGS" ]; then
  for f in "$LOGS"/*.log; do [ -r "$f" ] && contar "$f"; done
else
  echo "pasta de logs do pm2 deste usuário não existe ($LOGS)"
fi
if [ -r /var/log/nginx/error.log ]; then
  echo "-- nginx error.log"
  for p in 'upstream timed out' 'connect() failed' 'no live upstreams' 'client intended to send too large body'; do
    printf '   %-40s %s\n' "$p" "$(grep -cF -- "$p" /var/log/nginx/error.log 2>/dev/null || true)"
  done
else
  echo "nginx error.log: não existe ou sem permissão de leitura"
fi

# ── 12. INDÍCIOS DE CÓPIA EXTERNA ────────────────────────────────────────
sec "12. indícios de cópia para fora da VPS"
echo "ATENÇÃO: INDÍCIO NÃO É PROVA. Só uma restauração conferida, feita a partir da cópia que está FORA da VPS, prova que existe backup externo."
echo "comandos de cópia citados no crontab: ${EXTERNO_CRON:-nenhum}"
for b in rclone restic borg duplicity aws gsutil b2; do tem "$b" && echo "programa instalado: $b"; done
for f in "$HOME/.config/rclone/rclone.conf" "$HOME/.aws/credentials" "$HOME/.config/restic"; do
  [ -e "$f" ] && echo "existe (conteúdo NÃO lido): ${f/#$HOME/\~}"
done
n=$(grep -c 'baixar-backup' "$DIR/server.js" 2>/dev/null || true)
echo "rota /baixar-backup citada no server.js: $n vez(es)"
if [ -r /var/log/nginx/access.log ]; then
  hits=$(grep -c 'GET /baixar-backup' /var/log/nginx/access.log 2>/dev/null || true)
  echo "downloads de /baixar-backup no access.log atual do nginx: $hits"
  [ "${hits:-0}" -gt 0 ] && echo "   último em: $(grep 'GET /baixar-backup' /var/log/nginx/access.log | tail -1 | grep -oE '\[[0-9]{2}/[A-Za-z]{3}/[0-9]{4}' | tr -d '[')"
else
  echo "nginx access.log: não existe ou sem permissão de leitura (downloads do /baixar-backup não conferidos)"
fi

echo
echo "=== fim da coleta ==="
