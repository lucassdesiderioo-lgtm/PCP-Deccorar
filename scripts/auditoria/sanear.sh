#!/usr/bin/env bash
# PCP Deccorar — SEGUNDA BARREIRA DA COLETA: limpa o relatório antes de ele
# tocar o disco do Mac. Lê do stdin, escreve no stdout.
#
# A primeira barreira é o `remoto_leitura.sh`, que já não imprime ambiente,
# logs nem conteúdo de configuração. Esta existe para o dia em que uma linha
# escapar: um token na URL, um e-mail, um CPF.
#
# - chave privada no meio da saída: ABORTA (código 9), sem escrever nada;
# - `token=`, `senha=`, `secret=`, `password=`, `pin_hash`, `salt`: valor mascarado;
# - e-mail e CPF: mascarados;
# - sequência de 32+ letras/números sem `/` (hash, token, chave): mascarada.
#   A barra fica de fora da classe para não engolir caminho de arquivo.
# perl, e não sed: o sed do macOS não tem o modificador I.
# No fim, uma linha diz quantas linhas tiveram máscara.

set -u
entrada="$(cat)"
if printf '%s' "$entrada" | grep -q 'PRIVATE KEY'; then
  echo "ABORTADO: apareceu uma chave privada na saída. Nada foi gravado." >&2
  exit 9
fi
printf '%s\n' "$entrada" | LC_ALL=C perl -pe '
  s/((?:token|senha|secret|password|passwd|pin_hash|salt|api[_-]?key)\s*[=:]\s*)[^\s&"]+/$1\[OMITIDO\]/gi;
  s/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[EMAIL OMITIDO]/g;
  s/\b[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}\b/[CPF OMITIDO]/g;
  s/[A-Za-z0-9+=_-]{32,}/[OMITIDO]/g;
' \
| awk '/\[(OMITIDO|EMAIL OMITIDO|CPF OMITIDO)\]/{n++} {print} END{print "\n(saneamento: " n+0 " linha(s) com valor mascarado)"}'
