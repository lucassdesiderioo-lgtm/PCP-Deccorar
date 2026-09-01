#!/usr/bin/env node
/* O resultado do inventario: o que o sistema DIZIA contra o que a prateleira TEM.
 *
 *   node comparar_inventario.js backups/antes_pecas_2026-09-01_1516.csv
 *   node comparar_inventario.js <csv> --db <caminho>
 *
 * A zeragem grava um CSV com o saldo de cada SKU no instante anterior a ela.
 * Depois da contagem lancada, a diferenca entre aquele arquivo e o saldo atual
 * e o UNICO numero que o dia de inventario produz — e o que diz o tamanho do
 * furo que existia. Sem essa comparacao, zerar e contar so troca um numero
 * desconhecido por outro.
 *
 * SO LE. Nao grava nada, nao corrige nada.
 *
 * ⚠ A COMPARACAO SO E LIMPA SE NADA ANDOU NO MEIO. Embalagem soma +1 e etiqueta
 * de venda baixa -1 — se a expedicao trabalhou entre a zeragem e a contagem,
 * parte da diferenca e trabalho, nao furo. O script conta esses movimentos e
 * avisa quando eles existem, em vez de deixar a conta parecer mais limpa do que e.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const argv = process.argv.slice(2);
const valorDe = (f, padrao) => { const i = argv.indexOf(f); return i >= 0 && argv[i+1] ? argv[i+1] : padrao; };
const CSV = argv.find(a => !a.startsWith('--') && a !== valorDe('--db', null));
const CAMINHO = valorDe('--db', '/opt/expedicao/dados.db');

if(!CSV){
  console.log('uso: node comparar_inventario.js <arquivo antes_pecas_*.csv> [--db <caminho>]');
  console.log('     o CSV e gravado pelo zerar_estoque.js, em backups/');
  process.exit(1);
}
if(!fs.existsSync(CSV)){ console.error('CSV nao encontrado: ' + CSV); process.exit(1); }
if(!fs.existsSync(CAMINHO)){ console.error('Banco nao encontrado: ' + CAMINHO); process.exit(1); }

const db = new Database(CAMINHO, {readonly:true});

/* O CSV e simples (codigo,estoque,alvo) e foi escrito por nos — mas o codigo do
   SKU pode ter virgula ou aspas (§7: etiqueta livre), entao respeitamos o
   campo entre aspas em vez de dar split cego. */
function lerCsv(txt){
  const linhas = txt.split(/\r?\n/).filter(l => l.trim() !== '');
  linhas.shift();                       // cabecalho
  return linhas.map(l => {
    const campos = []; let atual = '', dentro = false;
    for(let i = 0; i < l.length; i++){
      const c = l[i];
      if(dentro){
        if(c === '"' && l[i+1] === '"'){ atual += '"'; i++; }
        else if(c === '"') dentro = false;
        else atual += c;
      } else if(c === '"') dentro = true;
      else if(c === ','){ campos.push(atual); atual = ''; }
      else atual += c;
    }
    campos.push(atual);
    return { codigo:(campos[0]||'').trim(), estoque:+campos[1] || 0 };
  }).filter(r => r.codigo);
}

const antes = lerCsv(fs.readFileSync(CSV, 'utf8'));
const mapaAntes = {};
antes.forEach(r => mapaAntes[r.codigo.toUpperCase()] = r.estoque);

const agora = db.prepare('SELECT UPPER(codigo) c, COALESCE(estoque,0) estoque FROM skus').all();
const mapaAgora = {};
agora.forEach(r => mapaAgora[r.c] = r.estoque);

const codigos = [...new Set(Object.keys(mapaAntes).concat(Object.keys(mapaAgora)))].sort();
const linhas = codigos.map(c => {
  const a = mapaAntes[c], d = mapaAgora[c];
  return { codigo:c, sistema:(a==null?null:a), contado:(d==null?null:d),
           dif:(a==null||d==null) ? null : d - a };
});

const somaSistema = linhas.reduce((s,l)=>s+(l.sistema||0), 0);
const somaContado = linhas.reduce((s,l)=>s+(l.contado||0), 0);
const bateram   = linhas.filter(l => l.dif === 0).length;
const conferidos= linhas.filter(l => l.dif != null).length;

const T = s => console.log(s);
const linha = () => T('─'.repeat(70));

T('');
linha();
T('INVENTARIO — o que o sistema dizia x o que a prateleira tem');
linha();
T('');
T('  arquivo do "antes" : ' + path.basename(CSV));
T('  banco              : ' + CAMINHO);
T('');
T('  o sistema dizia    : ' + somaSistema + ' peca(s)');
T('  a contagem deu     : ' + somaContado + ' peca(s)');
const dif = somaContado - somaSistema;
T('  DIFERENCA          : ' + (dif > 0 ? '+' : '') + dif + ' peca(s)' +
  (somaSistema ? '   (' + (dif/somaSistema*100).toFixed(1) + '%)' : ''));
T('');
T('  SKUs conferidos    : ' + conferidos + ',  bateram exato: ' + bateram +
  (conferidos ? '  (' + (bateram/conferidos*100).toFixed(0) + '%)' : ''));

/* Movimento no meio do caminho: embalagem soma, etiqueta baixa. Se houve, parte
   da diferenca e trabalho do dia e nao furo de estoque — e quem le precisa
   saber disso antes de tirar conclusao sobre a operacao. */
const carimbo = (path.basename(CSV).match(/(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})/) || []);
if(carimbo[1]){
  const corte = carimbo[1] + ' ' + carimbo[2] + ':' + carimbo[3] + ':00';
  let emb = 0, vend = 0, ajus = 0;
  try{ emb = db.prepare('SELECT COUNT(*) n FROM montagem WHERE criado_em > ?').get(corte).n; }catch(e){}
  try{ vend= db.prepare('SELECT COUNT(*) n FROM lote WHERE embalado_em > ?').get(corte).n; }catch(e){}
  try{ ajus= db.prepare('SELECT COUNT(*) n FROM ajuste_estoque WHERE criado_em > ?').get(corte).n; }catch(e){}
  if(emb || vend || ajus){
    T('');
    T('  ⚠ houve movimento depois da zeragem (' + corte + '):');
    if(emb)  T('      ' + emb  + ' embalagem(ns)  +1 cada');
    if(vend) T('      ' + vend + ' etiqueta(s) de venda  -1 cada');
    if(ajus) T('      ' + ajus + ' ajuste(s) manual(is)');
    T('    Parte da diferenca abaixo e esse trabalho, nao furo de estoque.');
  }
}

const divergentes = linhas.filter(l => l.dif !== 0).sort((a,b) =>
  Math.abs(b.dif||0) - Math.abs(a.dif||0) || a.codigo.localeCompare(b.codigo));

if(!divergentes.length){
  T(''); T('  ✓ Todos os SKUs bateram exatamente.'); T('');
  db.close(); return;
}

T('');
linha();
T('ONDE ESTAVA A DIFERENCA  (maior primeiro)');
linha();
T('');
T('  ' + 'SKU'.padEnd(28) + 'sistema'.padStart(8) + 'contado'.padStart(9) + '   ' + 'diferenca'.padStart(10));
divergentes.forEach(l => {
  /* Sem numero dos dois lados nao ha diferenca a mostrar, e sim um caso a
     resolver: SKU que a contagem achou e o cadastro nao tem, ou o contrario. */
  const d = l.dif == null ? (l.sistema == null ? 'só na contagem' : 'sumiu do cadastro')
          : ((l.dif > 0 ? '+' : '') + l.dif);
  T('  ' + l.codigo.slice(0,27).padEnd(28) +
    String(l.sistema == null ? '—' : l.sistema).padStart(8) +
    String(l.contado == null ? '—' : l.contado).padStart(9) + '   ' +
    (l.dif == null ? d : String(d).padStart(10)));
});

const sobra = divergentes.filter(l => (l.dif||0) > 0).reduce((s,l)=>s+l.dif, 0);
const falta = divergentes.filter(l => (l.dif||0) < 0).reduce((s,l)=>s+l.dif, 0);
T('');
T('  a mais na prateleira : +' + sobra + '   (o sistema nao sabia que existiam)');
T('  a menos              : ' + falta + '   (o sistema contava peca que nao esta la)');
T('');
T('  A falta e a que custa: e ela que faz a etiqueta sair para uma prateleira');
T('  vazia. A sobra vira venda que ja podia ter saido do estoque.');
T('');
db.close();
