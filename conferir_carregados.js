#!/usr/bin/env node
/* conferir_carregados.js — QUEM SAIU DA FÁBRICA SEM A BAIXA DO ESTOQUE.
 *
 *   node conferir_carregados.js            # todo o histórico
 *   node conferir_carregados.js 60         # só os últimos 60 dias
 *   node conferir_carregados.js --scripts  # lista também os fechados à mão
 *
 * ⚠️ ELE SÓ LÊ. Não muda estágio, não mexe em saldo, não grava linha nenhuma —
 * pode rodar em produção no meio do expediente. Corrigir saldo é decisão do
 * dono, e depende de conferir a prateleira; este arquivo existe para que essa
 * decisão seja tomada com número na mão em vez de com estimativa.
 *
 * ── O QUE ELE RESPONDE ──────────────────────────────────────────────────────
 * Até 17/09/2026 o bipe do carregamento aceitava volume `pendente` (dívida 13,
 * §5 armadilha #27): a caixa subia no carro e a peça saía da fábrica SEM o −1
 * que só a Etiqueta de Venda dá. O conserto fechou a porta; **não desfez o que
 * já passou por ela**. O saldo desses SKUs continua alto, e `skus.estoque` não
 * se reconstrói (§14) — só a contagem física o traz de volta.
 *
 * ⚠️ A MARCA QUE SEPARA OS DOIS CASOS É UMA CONVENÇÃO, NÃO UMA MEDIÇÃO — e é
 * por isso que este arquivo existe em vez de uma consulta de uma linha.
 * Volume carregado sem `embalado_em` tem DUAS origens possíveis:
 *
 *   1. o bipe que pulou a etiqueta  → o buraco da dívida 13
 *   2. `fechar_vencidos.js` / `regularizar_saida.js` → passivo fechado à MÃO,
 *      com decisão humana registrada na época (§5)
 *
 * Os dois deixam `embalado_em` vazio. O que os separa é a HORA: os scripts
 * carimbam `COALESCE(despachar_em,data) || ' 15:00:00'` — as 15:00 são o limite
 * do despacho (§8), convenção e não relógio —, enquanto o bipe grava
 * `datetime('now','localtime')`, com o segundo em que a pessoa bipou.
 *
 * Então: **um bipe feito exatamente às 15:00:00 seria lido como fechamento de
 * script.** É o único falso negativo possível, ele é raro, e está dito aqui
 * porque número de diagnóstico sem a sua margem escrita ao lado vira fato.
 */
/* ⚠️ A CLASSIFICAÇÃO MORA NUMA FUNÇÃO, NÃO DENTRO DO `console.log`.
   O número que sai daqui é o que vai guiar um ajuste de saldo à mão — 🔴 por
   definição (§0). Número assim não pode existir só como texto impresso: ele
   precisa ser conferível por teste, senão a conta que move o estoque é a única
   coisa do sistema sem ninguém olhando. `teste_carregados.js` chama esta
   função com os quatro casos montados à mão. */
const MARCA_SCRIPT = "carregado_em LIKE '% 15:00:00'";

function levantar(db, opcoes){
  const DIAS = (opcoes && opcoes.dias) || null;
  const janela = DIAS ? ` AND COALESCE(despachar_em,data) >= date('now','localtime','-${DIAS} day')` : '';
  const um = (sql) => db.prepare(sql).get().c;

  const total = um(`SELECT COUNT(*) c FROM lote WHERE estagio='carregado'${janela}`);
  const comEtiqueta = um(`SELECT COUNT(*) c FROM lote
    WHERE estagio='carregado' AND embalado_em IS NOT NULL${janela}`);
  const porScript = um(`SELECT COUNT(*) c FROM lote
    WHERE estagio='carregado' AND embalado_em IS NULL AND ${MARCA_SCRIPT}${janela}`);
  const volumes = db.prepare(`SELECT id, codigo, buyer, nf, data, despachar_em, carregado_em, modalidade
    FROM lote WHERE estagio='carregado' AND embalado_em IS NULL AND NOT ${MARCA_SCRIPT}${janela}
    ORDER BY carregado_em`).all();

  /* ⚠️ A CONTA É POR PEÇA, NÃO POR VOLUME (§5, armadilha #23): a caixa de
     pacote leva N persianas e deveria ter baixado N. E SOB MEDIDA FICA DE FORA
     — ela nunca soma +1 na embalagem (§7), então também não devia baixar:
     cobrar a baixa dela abriria um buraco em vez de fechar. */
  const pecas = new Map(); const semCadastro = []; let sobMedida = 0;
  const itensDe = db.prepare('SELECT codigo, qtd FROM lote_item WHERE lote_id=?');
  const infoSku = db.prepare(`SELECT s.codigo, s.estoque, COALESCE(m.sob_medida,0) sob_medida
    FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id WHERE s.codigo=?`);

  for(const v of volumes){
    const itens = itensDe.all(v.id);
    const linhas = itens.length
      ? itens.map(i => ({codigo:String(i.codigo||'').toUpperCase(), qtd:Math.max(1, i.qtd||1)}))
      : [{codigo:String(v.codigo||'').toUpperCase(), qtd:1}];
    let todasSobMedida = linhas.length > 0;
    for(const l of linhas){
      const s = l.codigo ? infoSku.get(l.codigo) : null;
      if(!s){ semCadastro.push({volume:v.id, codigo:l.codigo || '(vazio)'}); todasSobMedida = false; continue; }
      if(s.sob_medida) continue;
      todasSobMedida = false;
      const a = pecas.get(l.codigo) || { qtd:0, estoque:s.estoque, volumes:[] };
      a.qtd += l.qtd; if(a.volumes.indexOf(v.id) < 0) a.volumes.push(v.id); pecas.set(l.codigo, a);
    }
    if(todasSobMedida) sobMedida++;
  }
  const porSku = [...pecas.entries()].map(([codigo, a]) => Object.assign({codigo}, a))
    .sort((a,b) => b.qtd - a.qtd);
  return { total, comEtiqueta, porScript, semBaixa:volumes.length, volumes,
           porSku, pecasTotal:porSku.reduce((s,l) => s + l.qtd, 0), semCadastro, sobMedida, dias:DIAS };
}

module.exports = { levantar, MARCA_SCRIPT };
if(require.main !== module) return;

const db = require('./db');

const arg = process.argv.slice(2);
const DIAS = arg.map(a => parseInt(a, 10)).find(n => Number.isFinite(n) && n > 0) || null;
const VER_SCRIPTS = arg.includes('--scripts');

const T = s => console.log(s);
const n2 = v => String(v).padStart(4);
const janela = DIAS ? ` AND COALESCE(despachar_em,data) >= date('now','localtime','-${DIAS} day')` : '';
const R = levantar(db, { dias:DIAS });

T('');
T('╔══════════════════════════════════════════════════════════════════════════╗');
T('║  CONFERIR CARREGADOS — saiu da fábrica sem a baixa da Etiqueta de Venda  ║');
T('╚══════════════════════════════════════════════════════════════════════════╝');
T(DIAS ? `  janela: últimos ${DIAS} dias (por prazo de despacho)` : '  janela: todo o histórico');
T('  este script SÓ LÊ — nada é alterado');

/* ── 1. A CONTA GERAL ────────────────────────────────────────────────────── */
T('');
T('── 1. O QUE O BANCO DIZ ────────────────────────────────────────────────');
T(`  carregados no total ....................... ${n2(R.total)}`);
T(`  com etiqueta de venda (baixaram) .......... ${n2(R.comEtiqueta)}   ← o normal`);
T(`  fechados à mão pelos scripts do §5 ........ ${n2(R.porScript)}   ← decisão humana na época`);
T(`  SEM baixa, bipados no carregamento ........ ${n2(R.semBaixa)}   ← a dívida 13`);
if(R.total !== R.comEtiqueta + R.porScript + R.semBaixa)
  T('  (a soma não fecha — olhe o banco, pode haver estágio fora do previsto)');

if(R.volumes.length){
  T('');
  T('── 2. OS VOLUMES QUE SAÍRAM SEM BAIXAR ─────────────────────────────────');
  T('   id  │ carregado em        │ SKU                  │ cliente              │ NF');
  T('  ─────┼─────────────────────┼──────────────────────┼──────────────────────┼──────');
  for(const v of R.volumes)
    T('  ' + String(v.id).padStart(4) + ' │ ' + String(v.carregado_em || '—').padEnd(19)
      + ' │ ' + String(v.codigo || '(sem SKU)').slice(0,20).padEnd(20)
      + ' │ ' + String(v.buyer || '—').slice(0,20).padEnd(20)
      + ' │ ' + String(v.nf || '—'));
}

if(R.porSku.length){
  T('');
  T('── 3. QUANTO O SISTEMA ACHA QUE TEM A MAIS ─────────────────────────────');
  T('  SKU                  │ peças a mais │ saldo hoje │ volumes');
  T('  ─────────────────────┼──────────────┼────────────┼─────────');
  for(const l of R.porSku)
    T('  ' + l.codigo.slice(0,20).padEnd(20) + ' │ ' + n2(l.qtd).padEnd(12)
      + ' │ ' + n2(l.estoque).padEnd(10) + ' │ ' + l.volumes.join(', '));
  T('  ─────────────────────┴──────────────┴────────────┴─────────');
  T(`  total: ${R.pecasTotal} peça(s) em ${R.porSku.length} SKU(s)`);
}
if(R.semCadastro.length){
  T('');
  T('  ⚠ peças cujo SKU não está no cadastro (não entram na conta):');
  for(const s of R.semCadastro) T('     volume ' + s.volume + ' · ' + s.codigo);
}
if(R.sobMedida)
  T(`\n  ${R.sobMedida} volume(s) sob medida ficaram de fora: nunca somaram +1 (§7), nada a baixar.`);

/* ── 4. OS FECHADOS À MÃO ────────────────────────────────────────────────── */
if(VER_SCRIPTS){
  const s = db.prepare(`SELECT id, codigo, buyer, nf, carregado_em FROM lote
    WHERE estagio='carregado' AND embalado_em IS NULL AND ${MARCA_SCRIPT}${janela}
    ORDER BY carregado_em`).all();
  T('');
  T('── OS FECHADOS À MÃO PELOS SCRIPTS DO §5 ───────────────────────────────');
  T('  (decisão humana na época; NÃO são a dívida 13)');
  for(const v of s)
    T('  ' + String(v.id).padStart(4) + ' │ ' + String(v.carregado_em).padEnd(19)
      + ' │ ' + String(v.codigo || '—').slice(0,20).padEnd(20) + ' │ ' + String(v.buyer || '—'));
}

/* ── 5. O QUE FAZER ──────────────────────────────────────────────────────── */
T('');
T('── 4. O QUE FAZER COM ISSO ─────────────────────────────────────────────');
if(!R.volumes.length){
  T('  Nada. Nenhum volume saiu sem baixar — a dívida 13 não deixou passivo');
  T('  nesta janela, e a porta já está fechada desde 17/09/2026.');
}else{
  T('  ⚠️ O SALDO NÃO SE CORRIGE POR AQUI, E NEM DEVERIA.');
  T('  O número acima é o que o sistema tem A MAIS em relação ao que saiu — mas');
  T('  ele não sabe o que aconteceu DEPOIS: pode ter havido contagem, ajuste ou');
  T('  devolução no meio do caminho, e descontar por cima disso erra duas vezes.');
  T('');
  T('  O caminho honesto, na ordem:');
  T('   1. CONFIRA A PRATELEIRA desses SKUs (a contagem é o único momento em que');
  T('      o saldo volta a bater com o físico, §18).');
  T('   2. Se a contagem confirmar a sobra, corrija por Admin → Estoque, que');
  T('      EXIGE MOTIVO e grava em `ajuste_estoque` com quem, quando e por quê.');
  T('      Escreva no motivo: "volume N saiu sem etiqueta (dívida 13)".');
  T('   3. NÃO use os scripts do §5 para isso: eles carimbam SAÍDA, e a saída');
  T('      desses volumes já aconteceu — o que falta é o saldo, não o estágio.');
  T('');
  T('  E o motivo de não haver `--aplicar` aqui: um ajuste em bloco carimbaria');
  T('  um número que ninguém conferiu, na prateleira de SKUs que a fábrica move');
  T('  todo dia. Ajuste de saldo sem contagem atrás é chute com registro.');
}
T('');
db.close();
