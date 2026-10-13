#!/usr/bin/env bash
# PCP Deccorar — COLETA DE AUDITORIA DA VPS, RODADA DO MAC (SOMENTE LEITURA).
#
#   ./scripts/auditoria/coletar_vps_deccorar.sh <alias-ssh> <caminho-do-projeto-na-vps>
#   ex.: ./scripts/auditoria/coletar_vps_deccorar.sh deccorar-vps /opt/expedicao
#
# O que ele faz, nesta ordem, e para em qualquer dúvida:
#   1. confere os argumentos: o alias tem que ser um NOME do ~/.ssh/config
#      (nada de usuario@ip) e o caminho tem que ser absoluto e sem "..";
#   2. confere que a chave do servidor JÁ está no known_hosts e mostra a
#      impressão digital — chave desconhecida é recusa, nunca "aceitar";
#   3. recusa rodar nas janelas proibidas (backup das 23:30, corte, despacho),
#      pelo relógio do Mac aqui e pelo da VPS lá;
#   4. mostra o comando completo e pede que você digite o alias para seguir;
#   5. testa a conexão (só `true`) e depois manda o `remoto_leitura.sh` pelo
#      stdin do ssh — nada é gravado na VPS;
#   6. passa a saída pelo `sanear.sh` e grava em auditoria_coletas/ (fora do
#      Git), com permissão só para você.
#
# NÃO copia banco nenhum. NÃO guarda senha, chave nem token. NÃO usa sudo.
# Funciona com o bash 3.2 do macOS.

set -euo pipefail
umask 077

AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../.." && pwd)"
REMOTO="$AQUI/remoto_leitura.sh"
SANEAR="$AQUI/sanear.sh"
SAIDA_DIR="$RAIZ/auditoria_coletas"

# A mesma tabela do remoto_leitura.sh (o teste confere que são iguais).
JANELAS="1-7:2300-2359 1-7:0000-0015 1-5:1000-1100 1-5:1430-1530"

pare(){ echo "PAREI: $*" >&2; exit 1; }

# ── 1. argumentos ────────────────────────────────────────────────────────
[ $# -eq 2 ] || pare "uso: $0 <alias-ssh> <caminho-do-projeto-na-vps>
   o alias é um nome do seu ~/.ssh/config (veja com: grep -i '^Host ' ~/.ssh/config)"
ALIAS="$1"; CAMINHO="$2"
printf '%s' "$ALIAS" | grep -qE '^[0-9.]+$' && pare "'$ALIAS' parece um endereço IP. Use um alias do ~/.ssh/config."
printf '%s' "$ALIAS" | grep -qE '^[A-Za-z][A-Za-z0-9._-]*$' \
  || pare "o alias '$ALIAS' não é um nome simples. Use o nome do ~/.ssh/config, não usuario@endereço."
printf '%s' "$CAMINHO" | grep -qE '^/[A-Za-z0-9._/-]+$' || pare "o caminho '$CAMINHO' tem que ser absoluto e só com letras, números, . _ - /"
case "$CAMINHO" in *..*) pare "o caminho não pode ter '..'";; esac

for p in ssh ssh-keygen awk sed grep date perl; do
  command -v "$p" >/dev/null 2>&1 || pare "falta o programa '$p' neste Mac"
done
[ -r "$REMOTO" ] && [ -r "$SANEAR" ] || pare "faltam remoto_leitura.sh ou sanear.sh ao lado deste script"

CFG="$HOME/.ssh/config"
[ -r "$CFG" ] || pare "não existe $CFG. Configure o alias antes (ver docs/auditoria/COLETA_VPS.md)."
if ! awk -v a="$ALIAS" 'tolower($1)=="host"{for(i=2;i<=NF;i++) if($i==a) f=1} END{exit !f}' "$CFG"; then
  pare "o alias '$ALIAS' não está numa linha 'Host' de $CFG.
   (se ele mora num arquivo puxado por 'Include', ponha o Host direto no $CFG — o script não adivinha)"
fi

# ── 2. identidade do servidor ────────────────────────────────────────────
G="$(ssh -G "$ALIAS" 2>/dev/null)" || pare "o ssh não conseguiu ler a configuração de '$ALIAS'"
HOST="$(printf '%s\n' "$G" | awk '$1=="hostname"{print $2; exit}')"
USR="$(printf '%s\n'  "$G" | awk '$1=="user"{print $2; exit}')"
PORTA="$(printf '%s\n' "$G" | awk '$1=="port"{print $2; exit}')"
[ -n "$HOST" ] || pare "o alias não tem HostName"
[ "$HOST" != "$ALIAS" ] || pare "o alias '$ALIAS' não tem HostName próprio — confira o ~/.ssh/config"
[ "$USR" != "root" ] || echo "AVISO: o alias entra como root. A coleta continua só lendo, mas o ideal é um usuário comum." >&2
CHAVE_HOST="$HOST"; [ "${PORTA:-22}" = "22" ] || CHAVE_HOST="[$HOST]:$PORTA"
FP="$(ssh-keygen -l -F "$CHAVE_HOST" 2>/dev/null | grep -v '^#' | awk '{print $2, $NF}')" || true
[ -n "$FP" ] || pare "a chave do servidor $CHAVE_HOST não está no seu known_hosts.
   O script não aceita chave nova sozinho. Conecte uma vez à mão (ssh $ALIAS) e confira a
   impressão digital com a do painel do provedor da VPS antes de responder 'yes'."

# ── 3. janela de horário (relógio de São Paulo, aqui no Mac) ─────────────
agora="${COLETA_AGORA:-$(TZ=America/Sao_Paulo date +%u%H%M)}"
dia="${agora:0:1}"; hm="${agora:1:4}"
for j in $JANELAS; do
  d1="${j:0:1}"; d2="${j:2:1}"; h1="${j:4:4}"; h2="${j:9:4}"
  if [ "$dia" -ge "$d1" ] && [ "$dia" -le "$d2" ] && \
     [ "$((10#$hm))" -ge "$((10#$h1))" ] && [ "$((10#$hm))" -le "$((10#$h2))" ]; then
    pare "agora (São Paulo, dia $dia, $hm) é janela proibida ($j): backup das 23:30, corte ou despacho. Rode em outro horário."
  fi
done

# ── 4. mostrar e confirmar ───────────────────────────────────────────────
OPTS="-o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -o ForwardAgent=no -o ClearAllForwardings=yes -o RequestTTY=no"
CMD_REMOTO="bash -s -- '$CAMINHO'"
cat <<EOF

O QUE VAI ACONTECER
  servidor:  $ALIAS  →  ${USR:-?}@$HOST porta ${PORTA:-22}
  chave conhecida do servidor: $FP
  projeto:   $CAMINHO

  1) teste de conexão:  ssh $OPTS $ALIAS true
  2) coleta:            ssh $OPTS $ALIAS "$CMD_REMOTO" < scripts/auditoria/remoto_leitura.sh

  O passo 2 só LÊ: versões, git (sem fetch), pm2 (só se já estiver de pé), tamanho e data
  dos bancos (sem abrir), backups, pastas, crontab (só horário e nome), disco, nginx,
  portas, certificado, contagem de erros nos logs e indícios de cópia externa.
  Nada é gravado, reiniciado, instalado ou copiado. Os bancos NÃO são transferidos.

EOF
printf 'Para seguir, digite o alias (%s) e Enter; qualquer outra coisa cancela: ' "$ALIAS"
read -r resp || resp=""
[ "$resp" = "$ALIAS" ] || pare "cancelado — nada foi feito na VPS."

# ── 5. conexão e coleta ──────────────────────────────────────────────────
# shellcheck disable=SC2086
ssh $OPTS "$ALIAS" true </dev/null || pare "a conexão falhou (chave, rede ou permissão). Nada foi coletado."
echo "conexão ok. coletando..."

mkdir -p "$SAIDA_DIR"
ARQ="$SAIDA_DIR/coleta_${ALIAS}_$(date +%Y%m%d-%H%M%S).txt"
BRUTO="$(mktemp "${TMPDIR:-/tmp}/coleta.XXXXXX")"
trap 'rm -f "$BRUTO"' EXIT
set +e
# shellcheck disable=SC2086
ssh $OPTS "$ALIAS" "$CMD_REMOTO" < "$REMOTO" > "$BRUTO" 2>&1
rc=$?
set -e
case "$rc" in
  0) ;;
  3) pare "a VPS recusou: pelo relógio de lá é janela proibida. Nada foi coletado." ;;
  4) pare "a VPS recusou: '$CAMINHO' não tem server.js e caminhos.js. Confira o caminho." ;;
  *) echo "AVISO: a coleta terminou com código $rc — o relatório pode estar incompleto." >&2 ;;
esac

# O cabeçalho entra DEPOIS do saneamento: a impressão digital da chave tem
# cara de token e seria mascarada, e ela é evidência de qual servidor respondeu.
LIMPO="$(bash "$SANEAR" < "$BRUTO")" || pare "o saneamento abortou — nada foi gravado."
{
  echo "Coleta gerada no Mac em $(date '+%Y-%m-%d %H:%M:%S %Z') · alias $ALIAS · chave $FP"
  printf '%s\n' "$LIMPO"
} > "$ARQ"
chmod 600 "$ARQ"

echo
echo "pronto: $ARQ"
echo "Leia o arquivo antes de mandá-lo a alguém. Ele não tem banco, senha nem env, mas tem nomes de pastas e do servidor."
