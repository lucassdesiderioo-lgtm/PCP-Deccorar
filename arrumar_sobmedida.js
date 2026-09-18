#!/usr/bin/env node
/* arrumar_sobmedida.js — põe a regra do sob medida de pé no CADASTRO.
 *
 *   node arrumar_sobmedida.js              # só mostra o que faria
 *   node arrumar_sobmedida.js --aplicar    # grava, com backup antes
 *
 * ── POR QUE ESTE ARQUIVO EXISTE ─────────────────────────────────────────────
 * A §7 descreve a regra do sob medida desde 25/08/2026, e o código a lê em
 * quatro lugares. Em produção ela ficou três semanas INERTE: nenhum modelo
 * tinha `sob_medida = 1` (§7, armadilha #30). Com a flag em zero, a Etiqueta de
 * Venda recusa toda venda sob medida com "Sem estoque desse SKU", e o que a
 * bancada faz então é despachar por fora — sem registro e sem conferência.
 *
 * O reparo é DADO, não código. Foi tentado pela tela em 17/09/2026 e parou no
 * meio: são quatro passos em duas telas, com caixinhas que salvam sozinhas e um
 * campo de código que é chave de upsert. O estado que sobrou tinha o modelo não
 * criado, o texto "Sob medida" parado no campo livre `cor`, um SKU vazio nascido
 * de uma edição no código, e quatro cadastros desativados por engano.
 *
 * ⚠️ REPARO DE CADASTRO FEITO A CLIQUE É O QUE PRODUZIU ESSE ESTADO. Por isso
 * ele virou script: uma transação, simulação por padrão, backup antes de gravar
 * e teste escrito antes do conserto (`teste_arrumar_sobmedida.js`).
 *
 * ⚠️ O QUE ELE NUNCA FAZ, E É A TRAVA MAIS IMPORTANTE DAQUI: marcar
 * `sob_medida` no modelo ROLO. São 29 dos 30 SKUs — a fábrica inteira sairia da
 * trava de estoque e da baixa de uma vez, e o saldo pararia de andar sem um
 * único aviso. Ele só mexe no modelo SOBMEDIDA, que ele mesmo cria.
 *
 * ⚠️ E ELE NÃO MEXE EM SALDO. Nenhuma das cinco escritas toca `skus.estoque`:
 * saldo se corrige por Admin → Estoque, que exige motivo e grava em
 * `ajuste_estoque` com quem e por quê (§18).
 */
const MODELO   = 'SOBMEDIDA';
const NOME     = 'Sob medida';
const SKU_ALVO = 'SOBMEDIDA';
const SKU_LIXO = 'BKSOBMEDIDA';

/* ⚠️ AS DEZ PORTAS QUE SEGURAM O APAGAR. Apagar um SKU que tem volume atrás
   devolve aquele volume para `bloqueado` (§6): a caixa para na expedição, e
   ninguém liga isso a um script rodado dias antes. Conferir só `lote` deixaria
   passar o SKU que tem fila, contagem ou ajuste — então são todas.
   SKU a mais é ruído na lista; SKU a menos é caixa parada. */
const REFERENCIAS = [
  ['lote','codigo'], ['lote_item','codigo'], ['fila','codigo'], ['producao','codigo'],
  ['revisao','codigo'], ['montagem','codigo'], ['contagem','codigo'], ['rejeicao','codigo'],
  ['ajuste_estoque','codigo'], ['devolucao','sku_fisico'], ['devolucao','sku_venda'],
];

/* Os quatro que foram desativados por engano em 18/09/2026. A lista é explícita
   e não "tudo que estiver em 0": reativar em massa ressuscitaria o cadastro que
   alguém desativou de propósito, e isso ninguém pediu. */
const REATIVAR_TECIDO = ['SCREEN3'];
const REATIVAR_COR    = ['BEGE','BRANCO','CINZA'];

function arrumar(db, opcoes){
  const aplicar = !!(opcoes && opcoes.aplicar);
  const acoes = [];
  let bkRetido = null;

  const existe = (t) => !!db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
  const temCol = (t,c) => existe(t) &&
    db.prepare('PRAGMA table_info(' + t + ')').all().some(x => x.name === c);

  /* ── 1. O MODELO ─────────────────────────────────────────────────────────
     Se já existir (criado pela tela, por exemplo, com as caixinhas esquecidas),
     as flags são corrigidas em vez de o script reclamar que o código já existe.
     É o mesmo caso que a #30 descreve: o modelo pode estar lá e não valer nada. */
  const mAtual = db.prepare('SELECT * FROM modelo WHERE codigo=?').get(MODELO);
  if(!mAtual) acoes.push('criar o modelo ' + MODELO + ' ("' + NOME + '") — sob medida: sim · tem medida: não');
  else if(mAtual.sob_medida !== 1 || mAtual.exige_medida !== 0 || mAtual.ativo !== 1)
    acoes.push('corrigir as flags do modelo ' + MODELO
      + ' (sob_medida ' + mAtual.sob_medida + '→1, exige_medida ' + mAtual.exige_medida
      + '→0, ativo ' + mAtual.ativo + '→1)');

  /* ── 2 e 3. O SKU ────────────────────────────────────────────────────────
     O `cor` é campo de TEXTO LIVRE, e foi nele que "Sob medida" foi parar. Ele
     é o que a tela mostra em letra grande no bipe 1 da embalagem (§4), então
     texto errado ali é conferência que ensina a equipe a ignorar a linha. */
  const sAtual = db.prepare('SELECT * FROM skus WHERE codigo=?').get(SKU_ALVO);
  const corSuja = !!sAtual && String(sAtual.cor || '').trim() !== '';
  /* ⚠️ O RELATÓRIO SÓ LISTA O QUE DE FATO MUDA, e isso não é capricho: rodar de
     novo depois de um restore, ou repetir o comando por engano, tem que dizer
     "nada a fazer". Uma lista que repete as mesmas linhas toda vez ensina a
     ignorá-la, e aí a rodada em que houver algo de verdade passa batida. */
  const precisaApontar = !!sAtual && (!mAtual || sAtual.modelo_id !== mAtual.id);
  if(precisaApontar) acoes.push('apontar o SKU ' + SKU_ALVO + ' para o modelo ' + MODELO);
  if(corSuja) acoes.push('limpar o campo cor do ' + SKU_ALVO + ' (está "' + sAtual.cor + '")');

  /* ── 4. OS DESATIVADOS POR ENGANO ────────────────────────────────────── */
  const reativar = [];
  for(const cod of REATIVAR_TECIDO){
    const t = existe('tecido') ? db.prepare('SELECT ativo FROM tecido WHERE codigo=?').get(cod) : null;
    if(t && t.ativo !== 1) reativar.push(['tecido','ativo',cod]);
  }
  for(const cod of REATIVAR_COR){
    const c = existe('cor') ? db.prepare('SELECT ativa FROM cor WHERE codigo=?').get(cod) : null;
    if(c && c.ativa !== 1) reativar.push(['cor','ativa',cod]);
  }
  for(const [t,,cod] of reativar) acoes.push('reativar ' + t + ' ' + cod);

  /* ── 5. O SKU VAZIO ──────────────────────────────────────────────────────
     Ele nasceu de uma edição no CAMPO DO CÓDIGO do Cadastro de SKU, que é chave
     de upsert: código diferente cria linha nova, não renomeia. */
  const lixo = db.prepare('SELECT * FROM skus WHERE codigo=?').get(SKU_LIXO);
  let apagarLixo = false;
  if(lixo){
    const presos = [];
    for(const [t,c] of REFERENCIAS){
      if(!temCol(t,c)) continue;
      const q = db.prepare('SELECT COUNT(*) n FROM ' + t + ' WHERE ' + c + '=?').get(SKU_LIXO);
      if(q && q.n > 0) presos.push(t + ' (' + q.n + ')');
    }
    /* Saldo é peça na prateleira. Apagar o cadastro some com o número sem deixar
       linha em `ajuste_estoque` — a porta que a armadilha #25 (§6) fechou. */
    if((+lixo.estoque || 0) !== 0) presos.push('saldo ' + lixo.estoque);
    if(presos.length){
      bkRetido = 'NÃO apaguei o ' + SKU_LIXO + ': tem ' + presos.join(', ')
        + '. Apagar o cadastro devolveria esse volume para bloqueado (§6).';
      acoes.push(bkRetido);
    } else {
      apagarLixo = true;
      acoes.push('apagar o SKU ' + SKU_LIXO + ' (vazio, sem saldo e sem nada atrás)');
    }
  }

  if(!aplicar) return { acoes, bkRetido, aplicado:false };

  /* ⚠️ AS CINCO ESCRITAS SÃO UMA TRANSAÇÃO SÓ. Com `better-sqlite3` cada
     statement auto-commita sozinho: falha no meio deixaria o modelo criado e o
     SKU ainda no Rolô — que é exatamente o estado quebrado que este script veio
     consertar, agora com a aparência de que deu certo. */
  db.transaction(() => {
    db.prepare(`INSERT INTO modelo (codigo,nome,ativo,exige_medida,sob_medida) VALUES (?,?,1,0,1)
      ON CONFLICT(codigo) DO UPDATE SET nome=?, ativo=1, exige_medida=0, sob_medida=1`)
      .run(MODELO, NOME, NOME);
    const id = db.prepare('SELECT id FROM modelo WHERE codigo=?').get(MODELO).id;

    if(precisaApontar || corSuja)
      db.prepare('UPDATE skus SET modelo_id=?, cor=? WHERE codigo=?').run(id, '', SKU_ALVO);

    for(const [t,col,cod] of reativar)
      db.prepare('UPDATE ' + t + ' SET ' + col + '=1 WHERE codigo=?').run(cod);

    if(apagarLixo) db.prepare('DELETE FROM skus WHERE codigo=?').run(SKU_LIXO);
  })();

  return { acoes, bkRetido, aplicado:true };
}

module.exports = { arrumar, MODELO, SKU_ALVO, SKU_LIXO };
if(require.main !== module) return;

/* ── A LINHA DE COMANDO ──────────────────────────────────────────────────── */
const APLICAR = process.argv.slice(2).includes('--aplicar');
const db = require('./db');
const T = s => console.log(s);

/* ⚠️ O `db.backup()` É ASSÍNCRONO, e sem o `await` ele falha DEPOIS do fim do
   script: o backup dispara, o código segue, o `db.close()` roda, e a cópia
   estoura com "database connection is not open" — com o relatório de sucesso já
   impresso na tela. Ninguém leria aquilo como "o backup não existe". Por isso
   todo o comando vive dentro deste async, igual ao `limpar_fantasmas.js`. */
(async function(){

T('');
T('╔════════════════════════════════════════════════════════════════════════╗');
T('║  ARRUMAR SOB MEDIDA — põe a regra do §7 de pé no cadastro              ║');
T('╚════════════════════════════════════════════════════════════════════════╝');

const R0 = arrumar(db, { aplicar:false });
T('');
if(!R0.acoes.length){
  T('  Nada a fazer — o cadastro já está como a §7 manda.');
  T('');
  db.close();
  return;
}
T(APLICAR ? '── O QUE VOU FAZER ──────────────────────────────────────────────────'
          : '── O QUE SERIA FEITO (simulação) ────────────────────────────────────');
for(const a of R0.acoes) T('  · ' + a);

if(!APLICAR){
  T('');
  T('  Nada foi gravado. Para valer: node arrumar_sobmedida.js --aplicar');
  T('');
  db.close();
  return;
}

/* ⚠️ `cp dados.db` produz backup VAZIO — os dados estão no -wal (§12). */
const fs = require('fs'), path = require('path');
const C = require('./caminhos');
try{ fs.mkdirSync(C.BACKUPS, {recursive:true}); }catch(e){}
const destino = path.join(C.BACKUPS,
  'antes-arrumar-sobmedida-' + new Date().toISOString().replace(/[:.]/g,'-') + '.db');
await db.backup(destino);
T('');
T('  backup -> ' + destino);

arrumar(db, { aplicar:true });

const m = db.prepare('SELECT * FROM modelo WHERE codigo=?').get(MODELO);
const s = db.prepare('SELECT modelo_id, cor, estoque FROM skus WHERE codigo=?').get(SKU_ALVO);
T('');
T('── COMO FICOU ───────────────────────────────────────────────────────');
T('  modelo ' + MODELO + ': sob medida=' + (m ? m.sob_medida : '?')
  + ' · tem medida=' + (m ? m.exige_medida : '?'));
T(s ? ('  SKU ' + SKU_ALVO + ': modelo_id=' + s.modelo_id + ' · cor="' + (s.cor||'')
       + '" · saldo=' + s.estoque)
    : ('  (não há SKU ' + SKU_ALVO + ' neste banco — só o modelo foi criado)'));
T('');
T('  CONFIRA NA ABA ESTOQUE (Admin → Estoque, busque por SO):');
T('   · o ' + SKU_ALVO + ' tem que mostrar o chip "sob medida"');
T('   · o alvo tem que cair para 0 e o "precisa" virar "ok"');
T('   · a linha dele termina em "Sob medida", não em "Rolô"');
T('');
T('  E na Etiqueta de Venda, num volume sob medida pendente: tem que IMPRIMIR,');
T('  e o saldo tem que continuar zero (sem +1 na embalagem não há −1 aqui, §7).');
T('');
db.close();

})().catch(e => { console.error('erro:', e.message, '— nada foi gravado.'); process.exit(1); });
