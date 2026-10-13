/* Teste da coleta de auditoria da VPS (scripts/auditoria/).
 *
 * O que ele prova, sem VPS nenhuma:
 *   A. os scripts não têm comando proibido (sudo, restart, pull, rm, cp de
 *      banco, cat, env, redirecionamento para arquivo no lado remoto…);
 *   B. as janelas proibidas são as MESMAS nos dois scripts;
 *   C. o remoto, rodado contra um "servidor de mentira", NÃO MUDA NENHUM
 *      ARQUIVO (nem o .git/index), não chama pm2 sem daemon, não chama nada
 *      além de `pm2 jlist`/`--version`, e não deixa vazar env, token do
 *      crontab nem texto de log;
 *   D. o script do Mac recusa alias suspeito, alias fora do config, chave de
 *      servidor desconhecida, janela proibida e confirmação errada — e, quando
 *      tudo bate, grava o relatório saneado com permissão 600.
 *
 * Rode: node teste_coleta_vps.js
 */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');

let ok = 0, falhou = 0;
function caso(nome, cond, extra) {
  if (cond) { ok++; console.log('  ok  ' + nome); }
  else { falhou++; console.log('  FALHOU  ' + nome + (extra ? '\n          ' + String(extra).slice(0, 600).replace(/\n/g, '\n          ') : '')); }
}

const DIR = path.join(__dirname, 'scripts', 'auditoria');
const REMOTO = path.join(DIR, 'remoto_leitura.sh');
const LOCAL = path.join(DIR, 'coletar_vps_deccorar.sh');
const SANEAR = path.join(DIR, 'sanear.sh');

// tira comentários de linha inteira e o fim de linha depois de " #"
function codigo(arq) {
  return fs.readFileSync(arq, 'utf8').split('\n')
    .filter(l => !/^\s*#/.test(l))
    .map(l => l.replace(/\s+#\s.*$/, ''))
    .join('\n');
}
// para a varredura de comandos: tira o texto das mensagens. String entre
// aspas simples nunca é comando aqui (é programa de awk/node/regex, ou texto);
// entre aspas duplas só sai se não tiver $( ) dentro — ali há comando de verdade.
function semTexto(c) {
  return c.replace(/'[^']*'/g, "''").replace(/"(?:[^"\\\n$]|\\.|\$(?!\())*"/g, '""')
    .replace(/<<'?EOF'?[^]*?\nEOF/g, '');
}

console.log('\nA. comandos proibidos');
const rem = codigo(REMOTO), loc = codigo(LOCAL), san = codigo(SANEAR);
const remC = semTexto(rem), locC = semTexto(loc);
const PROIBIDOS = [
  [/\bsudo\b/, 'sudo'],
  [/\bpm2\s+(restart|stop|start|reload|delete|kill|save|ping|ls|list|status|flush|update|resurrect)\b/, 'pm2 que muda ou inicia daemon'],
  [/\bgit\b[^\n]*\b(pull|fetch|checkout|reset|add|commit|stash|merge|rebase|gc|clean|push)\b/, 'git que escreve'],
  [/\bgit\b[^\n]*\bconfig\b/, 'git config (grava ~/.gitconfig)'],
  [/(^|[\s;|&(])(rm|mv|cp|chmod|chown|touch|tee|truncate|dd|ln|install|apt|apt-get|npm|yum)\s/, 'comando que escreve ou instala'],
  [/\bsystemctl\s+(restart|stop|start|reload|enable|disable)\b/, 'systemctl que muda serviço'],
  [/\bnginx\s+-(s|T)\b/, 'nginx -s / -T'],
  [/\bcrontab\s+-(e|r)\b/, 'crontab -e/-r'],
  [/\b(cat|printenv)\b|(^|[\s;|&(])(env|set|export\s+-p)\s*($|[|;)])/m, 'cat / env / set (despejo)'],
  [/\bsqlite3\b[^\n]*\.db/, 'sqlite3 abrindo banco'],
  [/\bscp\b|\brsync\b[^\n]*\.db/, 'cópia de banco'],
];
for (const [re, nome] of PROIBIDOS) caso(`remoto sem ${nome}`, !re.test(remC), (remC.match(re) || [])[0]);
for (const [re, nome] of PROIBIDOS.filter(([, n]) => !/cat|escreve ou instala/.test(n))) caso(`Mac sem ${nome}`, !re.test(locC), (locC.match(re) || [])[0]);
caso('remoto sem "cat" nenhum', !/\bcat\b/.test(remC));
// redirecionamento de saída no remoto: só para /dev/null ou &2
const redir = remC.split('\n').filter(l => /(^|[^"'=<>\-])>{1,2}\s*(?!\/dev\/null|&|["'])/.test(l));
caso('remoto não redireciona saída para arquivo', redir.length === 0, redir.join('\n'));
caso('remoto usa GIT_OPTIONAL_LOCKS=0', /export GIT_OPTIONAL_LOCKS=0/.test(rem));
const pm2s = remC.match(/(^|[\s;|&(])pm2\s+[-a-z]+/gm) || [];
caso('remoto só chama pm2 jlist e --version', pm2s.length > 0 && pm2s.every(x => /pm2 (jlist|--version)$/.test(x)), pm2s.join(','));
caso('Mac exige StrictHostKeyChecking=yes e BatchMode=yes', /StrictHostKeyChecking=yes/.test(loc) && /BatchMode=yes/.test(loc));
caso('Mac não aceita chave nova (accept-new / no)', !/StrictHostKeyChecking=(no|accept-new)/.test(loc));
caso('sanear sem sed -I (não existe no macOS)', !/sed[^\n]*\/I/.test(san));

console.log('\nB. janelas iguais nos dois lados');
const jan = s => (s.match(/^JANELAS="([^"]+)"/m) || [])[1];
caso('mesma tabela de janelas', jan(rem) && jan(rem) === jan(loc), `${jan(rem)} × ${jan(loc)}`);

// ── servidor de mentira ──────────────────────────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'coleta-'));
const PROJ = path.join(TMP, 'opt', 'expedicao');
const HOME = path.join(TMP, 'home');
const BIN = path.join(TMP, 'bin');
const CHAMADAS = path.join(TMP, 'chamadas.log');
for (const d of [PROJ, HOME, BIN, path.join(PROJ, 'tecido'), path.join(PROJ, 'backups'), path.join(PROJ, 'lotes'), path.join(PROJ, 'coletas'), path.join(HOME, '.pm2', 'logs')]) fs.mkdirSync(d, { recursive: true });
const w = (p, s) => fs.writeFileSync(p, s);
w(path.join(PROJ, 'server.js'), "app.get('/baixar-backup', x)\n");
w(path.join(PROJ, 'caminhos.js'), '//\n');
w(path.join(PROJ, 'dados.db'), 'x'.repeat(4096));
w(path.join(PROJ, 'dados.db-wal'), 'y'.repeat(9000));
w(path.join(PROJ, 'tecido', 'tecido.db'), 'z'.repeat(2048));
w(path.join(PROJ, 'lotes', 'a.pdf'), 'pdf');
const ymd = d => new Date(Date.now() - d * 864e5).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const FALTAM = [3, 7, 12];
for (let i = 1; i <= 30; i++) if (!FALTAM.includes(i)) w(path.join(PROJ, 'backups', `dados-${ymd(i)}.db`), 'b');
for (let i = 1; i <= 5; i++) w(path.join(PROJ, 'backups', `tecido-${ymd(i)}.db`), 't');
w(path.join(PROJ, 'backups', 'tecido-antes-limpeza.db'), 'm');
w(path.join(HOME, '.pm2', 'logs', 'expedicao-error.log'),
  'SQLITE_BUSY: database is locked cliente Maria Souza\nSQLITE_BUSY\nENOSPC no space\nTypeError x\n');
w(path.join(HOME, 'backup.log'), 'backup ok -> /opt/expedicao/backups/dados-2026-10-12.db | copias: 30\n');
fs.mkdirSync(path.join(HOME, '.config', 'rclone'), { recursive: true });
w(path.join(HOME, '.config', 'rclone', 'rclone.conf'), '[remoto]\ntoken = SEGREDO_RCLONE_NAO_PODE_SAIR\n');
const git = a => cp.execFileSync('git', a, { cwd: PROJ, stdio: 'pipe', env: { ...process.env, HOME } });
git(['init', '-q']); git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', 'server.js', 'caminhos.js']);
git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'inicio']);
w(path.join(PROJ, 'server.js'), "app.get('/baixar-backup', x)\n// editado no servidor\n");
// deixa o mtime antigo, para o git ter motivo de querer regravar o índice
const velho = new Date(Date.now() - 3600e3); fs.utimesSync(path.join(PROJ, 'caminhos.js'), velho, velho);

const SEGREDO_ENV = 'SESSION_SECRET_valor_que_nunca_pode_aparecer_123';
const sh = (nome, corpo) => { fs.writeFileSync(path.join(BIN, nome), '#!/usr/bin/env bash\n' + corpo + '\n', { mode: 0o755 }); };
sh('pm2', `echo "pm2 $*" >> "${CHAMADAS}"
case "$1" in
  --version) echo 5.3.0 ;;
  jlist) echo '[{"name":"expedicao","pid":0,"pm2_env":{"status":"online","restart_time":4,"unstable_restarts":0,"pm_uptime":${Date.now() - 7200e3},"pm_cwd":"${PROJ}","env":{"SESSION_SECRET":"${SEGREDO_ENV}"}},"monit":{"memory":104857600,"cpu":1}}]' ;;
  *) echo "PROIBIDO: pm2 $*" >> "${CHAMADAS}"; exit 1 ;;
esac`);
sh('ps', `[ -n "\${SEM_DAEMON:-}" ] && exit 0; echo "$(id -un) PM2 v5.3.0: God Daemon (${HOME}/.pm2)"`);
sh('crontab', `[ "$1" = "-l" ] || { echo "PROIBIDO: crontab $*" >> "${CHAMADAS}"; exit 1; }
echo 'MAILTO=alguem@exemplo.com'
echo '30 23 * * * cd ${PROJ} && /usr/bin/node backup.js >> backup.log 2>&1'
echo '0 3 * * * curl -s "https://pcp.exemplo/baixar-backup?token=TOKEN_DO_CRON_NAO_PODE_SAIR" -o /x/y.db'
echo '15 4 * * * rclone copy ${PROJ}/backups remoto:pcp'`);
sh('sudo', `echo "PROIBIDO: sudo $*" >> "${CHAMADAS}"; exit 1`);

function retrato(raiz) {
  const m = {};
  (function andar(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n), st = fs.lstatSync(p);
      if (st.isDirectory()) { m[p] = 'dir'; andar(p); }
      else m[p] = st.size + ':' + st.mtimeMs + ':' + crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
    }
  })(raiz);
  return m;
}
const ENV = (extra) => ({ ...process.env, PATH: BIN + ':' + process.env.PATH, HOME, ...extra });
function rodarRemoto(agora, extra, dir) {
  return cp.spawnSync('bash', ['-s', '--', dir || PROJ], { input: fs.readFileSync(REMOTO), env: ENV({ COLETA_AGORA: agora, ...extra }), encoding: 'utf8' });
}

console.log('\nC. o lado remoto, contra o servidor de mentira');
const antesP = retrato(PROJ), antesH = retrato(HOME);
const r = rodarRemoto('31130');
const out = r.stdout + r.stderr;
caso('termina com código 0 fora da janela', r.status === 0, out.slice(-800));
const depoisP = retrato(PROJ), depoisH = retrato(HOME);
const dif = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => a[k] !== b[k]);
caso('nenhum arquivo do projeto mudou (nem o .git/index)', dif(antesP, depoisP).length === 0, dif(antesP, depoisP).join('\n'));
caso('nenhum arquivo do HOME mudou', dif(antesH, depoisH).length === 0, dif(antesH, depoisH).join('\n'));
const chamadas = fs.existsSync(CHAMADAS) ? fs.readFileSync(CHAMADAS, 'utf8') : '';
caso('nenhuma chamada proibida (pm2/crontab/sudo)', !/PROIBIDO/.test(chamadas), chamadas);
caso('o env do pm2 não vazou', !out.includes(SEGREDO_ENV) && !/SESSION_SECRET/.test(out));
caso('o pm2 aparece filtrado (nome, estado, reinícios)', /expedicao · estado=online · reinícios=4/.test(out));
caso('o token do crontab não vazou', !out.includes('TOKEN_DO_CRON'));
caso('o crontab diz que havia URL, e omite', /contém URL \(omitida\)/.test(out));
caso('o e-mail do MAILTO não vazou', !out.includes('alguem@exemplo.com') && /MAILTO — valor omitido/.test(out));
caso('o crontab mostra horário e nome do script', /30 23 \* \* \* \| comandos: node \| scripts: backup\.js \| saída em: backup\.log/.test(out), out.match(/30 23[^\n]*/));
caso('texto de log não vazou (só contagem)', !out.includes('Maria Souza') && /SQLITE_BUSY\s+2/.test(out));
caso('conteúdo do rclone.conf não vazou, só a existência', !out.includes('SEGREDO_RCLONE') && /existe \(conteúdo NÃO lido\): ~\/\.config\/rclone\/rclone\.conf/.test(out));
caso('rclone no cron aparece como indício', /comandos de cópia citados no crontab: rclone/.test(out));
caso('o aviso "indício não é prova" está lá', /INDÍCIO NÃO É PROVA/.test(out));
caso(`conta ${FALTAM.length} dias sem cópia do dados nos últimos 30`, new RegExp(`\\[dados\\][^]*?dias sem cópia nos últimos 30 \\(ontem para trás\\): ${FALTAM.length}`).test(out), out.match(/\[dados\][^]*?dias sem cópia[^\n]*/));
caso('conta 25 dias sem cópia do tecido', /\[tecido\][^]*?dias sem cópia nos últimos 30 \(ontem para trás\): 25/.test(out));
caso('acha o arquivo manual da pasta de backups', /outros arquivos na pasta[^:]*: 1/.test(out));
caso('mostra o WAL do dados.db com tamanho', /dados\.db-wal\s+9000 bytes/.test(out));
caso('git: 1 arquivo versionado modificado no servidor, com o nome', /modificados no servidor: 1\n\s+M server\.js/.test(out), out.match(/modificados[^\n]*\n[^\n]*/));
caso('log do backup lido por contagem e data', /linhas 'backup ok' = 1/.test(out) && /2026-10-12/.test(out));

const r2 = rodarRemoto('31130', { SEM_DAEMON: '1' });
const ch2 = fs.readFileSync(CHAMADAS, 'utf8');
caso('sem daemon, o pm2 NÃO é chamado (chamá-lo criaria um)', (ch2.match(/^pm2 /gm) || []).length === (chamadas.match(/^pm2 /gm) || []).length && /daemon PM2 rodando como: nenhum/.test(r2.stdout));
for (const [ag, nome] of [['32330', 'quarta 23:30 (backup)'], ['70005', 'domingo 00:05'], ['11015', 'segunda 10:15 (corte)'], ['51500', 'sexta 15:00 (despacho)']]) {
  caso(`recusa na janela: ${nome}`, rodarRemoto(ag).status === 3);
}
caso('sábado 10:30 é permitido', rodarRemoto('61030').status === 0);
caso('caminho sem server.js é recusado (código 4)', rodarRemoto('31130', {}, TMP).status === 4);

console.log('\nD. o script do Mac');
const RAIZ = path.join(TMP, 'repo'); fs.mkdirSync(path.join(RAIZ, 'scripts', 'auditoria'), { recursive: true });
for (const f of ['coletar_vps_deccorar.sh', 'remoto_leitura.sh', 'sanear.sh']) fs.copyFileSync(path.join(DIR, f), path.join(RAIZ, 'scripts', 'auditoria', f));
fs.mkdirSync(path.join(HOME, '.ssh'), { recursive: true });
w(path.join(HOME, '.ssh', 'config'), 'Host outra\n  HostName outra.test\n\nHost deccorar-vps\n  HostName exemplo.test\n  User deploy\n');
const SSHLOG = path.join(TMP, 'ssh.log');
sh('ssh', `echo "ssh $*" >> "${SSHLOG}"
if [ "$1" = "-G" ]; then
  case "$2" in deccorar-vps) printf 'hostname exemplo.test\\nuser deploy\\nport 22\\n' ;; *) printf "hostname %s\\nuser x\\nport 22\\n" "$2" ;; esac; exit 0; fi
last="\${@: -1}"; [ "$last" = "true" ] && exit 0
exec bash -c "$last"`);
sh('ssh-keygen', `[ -n "\${SEM_CHAVE:-}" ] && exit 1; echo "# Host exemplo.test found: line 1"; echo "256 SHA256:AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdEFG exemplo.test (ED25519)"`);
function rodarMac(args, entrada, extra) {
  return cp.spawnSync('bash', [path.join(RAIZ, 'scripts', 'auditoria', 'coletar_vps_deccorar.sh'), ...args], { input: entrada, env: ENV({ COLETA_AGORA: '31130', ...extra }), encoding: 'utf8' });
}
const coletas = () => fs.existsSync(path.join(RAIZ, 'auditoria_coletas')) ? fs.readdirSync(path.join(RAIZ, 'auditoria_coletas')) : [];
const sshChamado = () => fs.existsSync(SSHLOG) ? fs.readFileSync(SSHLOG, 'utf8').split('\n').filter(l => l && !/^ssh -G/.test(l)) : [];

let m = rodarMac(['deploy@1.2.3.4', PROJ], '');
caso('recusa usuario@endereço', m.status !== 0 && /não é um nome simples/.test(m.stderr));
m = rodarMac(['1.2.3.4', PROJ], '');
caso('recusa IP no lugar do alias', m.status !== 0 && /parece um endereço IP/.test(m.stderr));
m = rodarMac(['deccorar-vps', '/opt/../etc'], '');
caso('recusa caminho com ".."', m.status !== 0);
m = rodarMac(['deccorar-vps'], '');
caso('recusa sem o caminho (não presume /opt/expedicao)', m.status !== 0 && /uso:/.test(m.stderr));
m = rodarMac(['naoexiste', PROJ], 'naoexiste\n');
caso('recusa alias que não está no ~/.ssh/config', m.status !== 0 && /não está numa linha 'Host'/.test(m.stderr));
m = rodarMac(['deccorar-vps', PROJ], 'deccorar-vps\n', { SEM_CHAVE: '1' });
caso('recusa servidor com chave desconhecida', m.status !== 0 && /não está no seu known_hosts/.test(m.stderr));
m = rodarMac(['deccorar-vps', PROJ], 'deccorar-vps\n', { COLETA_AGORA: '42340' });
caso('recusa janela proibida pelo relógio do Mac', m.status !== 0 && /janela proibida/.test(m.stderr));
m = rodarMac(['deccorar-vps', PROJ], 'sim\n');
caso('confirmação errada cancela', m.status !== 0 && /cancelado/.test(m.stderr));
caso('até aqui nenhum ssh de verdade foi chamado (só -G)', sshChamado().length === 0, sshChamado().join('\n'));
caso('mostra o comando completo antes de pedir confirmação', /ssh -o BatchMode=yes[^\n]*deccorar-vps "bash -s -- '/.test(m.stdout));

m = rodarMac(['deccorar-vps', PROJ], 'deccorar-vps\n');
caso('com tudo certo, termina com 0', m.status === 0, m.stderr + m.stdout.slice(-400));
const arqs = coletas();
caso('gravou um relatório em auditoria_coletas/', arqs.length === 1, arqs.join(','));
if (arqs.length) {
  const p = path.join(RAIZ, 'auditoria_coletas', arqs[0]);
  const txt = fs.readFileSync(p, 'utf8');
  caso('o arquivo tem permissão 600', (fs.statSync(p).mode & 0o777) === 0o600, (fs.statSync(p).mode & 0o777).toString(8));
  caso('o relatório tem cabeçalho, corpo e fim', /^Coleta gerada no Mac/.test(txt) && /=== fim da coleta ===/.test(txt) && /saneamento:/.test(txt));
  caso('a impressão digital da chave ficou inteira no cabeçalho', /SHA256:AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdEFG/.test(txt));
  caso('nada sensível no relatório final', !txt.includes(SEGREDO_ENV) && !txt.includes('TOKEN_DO_CRON') && !txt.includes('Maria Souza'));
}
caso('o projeto continua intacto depois do script do Mac', dif(antesP, retrato(PROJ)).length === 0);

console.log('\nE. o saneamento');
const s1 = cp.spawnSync('bash', [SANEAR], { input: 'linha\n-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n', encoding: 'utf8' });
caso('chave privada na saída aborta com código 9 e não imprime nada', s1.status === 9 && s1.stdout === '');
const s2 = cp.spawnSync('bash', [SANEAR], { input: 'Token=abc&x senha: 1234 joao@ex.com.br 123.456.789-01 ' + 'a'.repeat(40) + '\n/opt/expedicao/backups/dados-2026-09-28.db\n', encoding: 'utf8' });
caso('mascara token, senha, e-mail, CPF e sequência longa', /Token=\[OMITIDO\]/.test(s2.stdout) && /senha: \[OMITIDO\]/.test(s2.stdout) && /\[EMAIL OMITIDO\]/.test(s2.stdout) && /\[CPF OMITIDO\]/.test(s2.stdout) && !/a{40}/.test(s2.stdout), s2.stdout);
caso('não mascara caminho de arquivo', /\/opt\/expedicao\/backups\/dados-2026-09-28\.db/.test(s2.stdout));

if (!process.env.MANTER) fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${ok} ok · ${falhou} falharam`);
process.exit(falhou ? 1 : 0);
