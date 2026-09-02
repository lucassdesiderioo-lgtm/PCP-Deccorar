#!/usr/bin/env node
/* Limpa a fila de embalagem — as pecas revisadas que nunca foram embaladas.
 *
 *   node limpar_fila.js                  simula, nao muda nada
 *   node limpar_fila.js --confirmar      faz backup e apaga
 *   node limpar_fila.js --db <caminho>   outro banco (padrao /opt/expedicao/dados.db)
 *
 * QUANDO ISTO E CORRETO — E SO ENTAO
 * A `fila` guarda a peca que foi REVISADA e ainda nao foi EMBALADA. Ela nao e
 * estoque (§2: o +1 acontece na embalagem, nao na revisao), e por isso nao
 * aparece em lugar nenhum que o inventario conte. Quando esse numero cresce por
 * meses sem a peca fisica correspondente — revisao lancada e nunca embalada,
 * peca que virou outra coisa, teste que ficou —, a fila deixa de descrever a
 * bancada e vira um numero que ninguem olha.
 *
 * O lugar natural de limpar e o INVENTARIO: zerado o estoque e contada a
 * prateleira, o que estiver fisicamente no carrinho de revisao ou entra na
 * contagem como peca pronta, ou vai ser revisado de novo. Nos dois casos a fila
 * velha nao serve mais.
 *
 * ⚠ NAO LIMPE COM PECA REAL ESPERANDO EMBALAGEM. Se ha um carrinho de pecas
 * revisadas de verdade aguardando o kit, elas somem da tela de Embalagem e
 * alguem tem que revisar de novo (dois bipes) antes de embalar. Por isso a
 * simulacao mostra a IDADE das linhas: fila de meses e passivo, fila de hoje e
 * trabalho.
 *
 * O QUE ELE NAO FAZ
 *   - Nao apaga a linha `embalado`: aquilo e historia de peca que JA foi
 *     embalada e virou estoque. Some so o que esta `aguardando`.
 *   - Nao mexe em estoque. A fila nunca somou +1; apagar nao pode descontar.
 *   - Nao impede embalar depois. `POST /api/montagem` (mont_route.js) consome a
 *     linha da fila QUANDO ELA EXISTE e funciona sem ela: grava a embalagem e
 *     soma +1 igual. O que muda e o `modo`, que passa a ser 'estoque' — entao a
 *     embalagem deixa de abater a ordem do dia (`producao.produzido`).
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const argv = process.argv.slice(2);
const temFlag = f => argv.indexOf(f) >= 0;
const valorDe = (f, padrao) => { const i = argv.indexOf(f); return i >= 0 && argv[i+1] ? argv[i+1] : padrao; };

const CONFIRMAR = temFlag('--confirmar');
const CAMINHO   = valorDe('--db', '/opt/expedicao/dados.db');
const SAIDA     = valorDe('--saida', path.join(path.dirname(CAMINHO), 'backups'));

if(!fs.existsSync(CAMINHO)){
  console.error('Banco nao encontrado: ' + CAMINHO + '\nUse --db <caminho> se ele estiver em outro lugar.');
  process.exit(1);
}

(async () => {
const db = new Database(CAMINHO);
const p2 = n => String(n).padStart(2,'0');
const agora = new Date();
const CARIMBO = agora.getFullYear()+'-'+p2(agora.getMonth()+1)+'-'+p2(agora.getDate())+'_'+p2(agora.getHours())+p2(agora.getMinutes());

const linhas = db.prepare(`SELECT id, codigo, modo, revisado_em, data
  FROM fila WHERE situacao='aguardando' ORDER BY revisado_em, id`).all();

console.log('');
console.log('  Banco : ' + CAMINHO);
console.log('  Fila  : ' + linhas.length + ' peca(s) aguardando embalagem');
console.log('');
if(!linhas.length){ console.log('  Nada a limpar.'); console.log(''); db.close(); return; }

/* A IDADE E O QUE SEPARA PASSIVO DE TRABALHO. Linha de hoje quase sempre tem
   peca fisica no carrinho; linha de dois meses atras quase nunca tem. Quem
   decide e quem olha a bancada — este recorte so poe o numero na frente. */
const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
const faixa = v => {
  const d = String(v.revisado_em || v.data || '').slice(0,10);
  if(!d) return '(sem data)';
  if(d === hoje) return 'hoje';
  const dias = Math.round((new Date(hoje+'T12:00:00') - new Date(d+'T12:00:00')) / 86400000);
  if(dias <= 7)  return 'ultimos 7 dias';
  if(dias <= 30) return 'ate 30 dias';
  return 'mais de 30 dias';
};
const porFaixa = {};
linhas.forEach(l => { const f = faixa(l); porFaixa[f] = (porFaixa[f]||0) + 1; });
console.log('  POR IDADE DA REVISAO');
['hoje','ultimos 7 dias','ate 30 dias','mais de 30 dias','(sem data)']
  .filter(k => porFaixa[k])
  .forEach(k => console.log('    ' + k.padEnd(18) + porFaixa[k]));
if(porFaixa['hoje'])
  console.log('    ^ revisadas HOJE: confira o carrinho da bancada antes de apagar.');

const devol = linhas.filter(l => l.modo === 'devolucao').length;
if(devol){
  console.log('');
  console.log('  ' + devol + ' vieram de DEVOLUCAO (peca que voltou do ML para reembalar).');
  console.log('  Apagar perde o vinculo com a devolucao; a peca fisica continua na fabrica.');
}

const porSku = {};
linhas.forEach(l => { porSku[l.codigo] = (porSku[l.codigo]||0) + 1; });
const top = Object.keys(porSku).sort((a,b) => porSku[b]-porSku[a]).slice(0,10);
console.log('');
console.log('  POR SKU (10 maiores)');
top.forEach(c => console.log('    ' + String(c||'(sem codigo)').padEnd(26) + porSku[c]));
if(Object.keys(porSku).length > 10)
  console.log('    ... e mais ' + (Object.keys(porSku).length-10) + ' SKU(s)');

/* Modo teste nao impede, mas muda o que acontece depois: encerrar o teste com
   "apagar" NAO devolve estas linhas — a foto do teste cobre saldo, nao fila. */
try{
  const m = db.prepare("SELECT valor FROM config WHERE chave='modo_teste'").get();
  if(m && m.valor === '1'){
    console.log('');
    console.log('  [aviso] MODO TESTE LIGADO. Encerrar o teste com "apagar" nao traz estas');
    console.log('          linhas de volta — a foto do teste cobre saldo, nao a fila.');
  }
}catch(e){}

const jaEmbaladas = db.prepare("SELECT COUNT(*) c FROM fila WHERE situacao<>'aguardando'").get().c;
console.log('');
console.log('  Ficam intactas: ' + jaEmbaladas + ' linha(s) ja embalada(s) — historia de peca que virou estoque.');
console.log('  O estoque nao e tocado: a fila nunca somou +1, entao apagar nao desconta.');

if(!CONFIRMAR){
  console.log('');
  console.log('  SIMULACAO — nada foi apagado.');
  console.log('  Para valer: node limpar_fila.js --confirmar');
  console.log('');
  db.close(); return;
}

fs.mkdirSync(SAIDA, {recursive:true});
const bkp = path.join(SAIDA, 'antes-limpar-fila-' + CARIMBO + '.db');
await db.backup(bkp);

/* O CSV do "antes" fica ao lado do backup: ler um .db exige ferramenta, e a
   pergunta que aparece depois ("o que tinha na fila naquele dia?") merece um
   arquivo que abre no Excel. */
const csv = v => { const s = String(v==null ? '' : v); return /[",;\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
const arqCsv = path.join(SAIDA, 'antes_fila_' + CARIMBO + '.csv');
fs.writeFileSync(arqCsv, ['id,codigo,modo,revisado_em,data']
  .concat(linhas.map(l => [l.id,l.codigo,l.modo,l.revisado_em,l.data].map(csv).join(','))).join('\n') + '\n', 'utf8');

const n = db.prepare("DELETE FROM fila WHERE situacao='aguardando'").run().changes;
console.log('');
console.log('  LIMPO.');
console.log('  - ' + n + ' linha(s) apagada(s) da fila');
console.log('  - backup do banco : ' + bkp);
console.log('  - foto do antes   : ' + arqCsv);
console.log('');
console.log('  A tela de Embalagem abre vazia agora. Peca revisada de verdade que');
console.log('  tenha sobrado no carrinho precisa passar pela revisao de novo (dois');
console.log('  bipes) para voltar a aparecer la.');
console.log('');
db.close();
})().catch(e => { console.error('erro:', e.message); process.exit(1); });
