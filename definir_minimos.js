#!/usr/bin/env node
/* Ponto de pedido inicial para os componentes — COMPRAS.md §7, fase 3.
 *
 * O estoque minimo e o estoque ideal precisam existir para a lista de compras
 * ter o que responder. Eles sao decisao do comprador, mas comecar do zero
 * significa uma lista vazia que nunca avisa nada — pior que um numero
 * aproximado, porque parece que esta tudo bem.
 *
 * ENTAO O PADRAO E DERIVADO DO CONSUMO REAL, nao chutado:
 *
 *     minimo = consumo de UMA persiana x PERSIANAS_MINIMO
 *     ideal  = consumo de UMA persiana x PERSIANAS_IDEAL
 *
 * O consumo de referencia e o da persiana 1,50 x 1,50, que fica no meio da
 * linha (a menor e 1,00 x 1,00 e a maior 1,80 x 1,50). Assim o numero de cada
 * item guarda a proporcao certa entre eles: quem gasta 10 por peca nasce com
 * minimo 10 vezes maior que quem gasta 1.
 *
 * SO PREENCHE O QUE ESTIVER ZERADO. Quem ja foi ajustado a mao nao e tocado —
 * mesma regra do migrar_sku.js.
 *
 * USO
 *   node definir_minimos.js --dry [caminho.db]
 *   node definir_minimos.js       [caminho.db]
 *   node definir_minimos.js --min 30 --ideal 90   muda os multiplicadores
 */
const path = require('path');
const Database = require('better-sqlite3');
const { garantirSchemaCompras } = require('./compras_schema');

/* Consumo de uma persiana 1,50 x 1,50, direto da planilha do comprador. */
const CONSUMO = {
  'Tubo 32 mm':1.5, 'Fita dupla face 1,6 cm':1.5, 'Fita crepe 4,8 mm':1.5,
  'Comando 32 mm':1, 'Emenda branca':1, 'Limitador branco':2,
  'Base redonda branca':1.5, 'Fita plastica 1,5 cm':1.5,
  'Tampa base redonda branca':2, 'Corrente bola 10 branca':2.8,
  'Embalagem':1.6, 'Parafuso 4x40':4, 'Bucha Sem Parafuso Com Aba Anel 6 mm':4,
  'Etiqueta ML - 10x15':2, 'Etiqueta Prod - 10x3,5':5, 'Saquinho kit':1,
  'Blackout Sireno 3,2':0.85, 'Blackout Sireno 2,8':0.85,
  'Fita durex':2, 'Filme stretch de 50mm x 30 mic':5,
  'Grampo':10, 'Etiqueta adesiva bolinha colorida 10 mm':2
};

const args = process.argv.slice(2);
const dry  = args.indexOf('--dry') >= 0;
const opt  = (n,padrao) => { const i=args.indexOf('--'+n); return i>=0 ? +args[i+1] : padrao; };
const P_MIN   = opt('min', 50);     // repor quando o saldo cobrir menos de 50 persianas
const P_IDEAL = opt('ideal', 150);  // encher ate cobrir 150
const alvo = args.filter((a,i) => a.indexOf('--')!==0 && args[i-1]!=='--min' && args[i-1]!=='--ideal')[0]
          || '/opt/expedicao/dados.db';

/* Arredonda para um numero que uma pessoa escreveria: 3 -> 3, 37 -> 40,
   412 -> 400. Ponto de pedido com tres casas decimais so atrapalha a leitura. */
function redondo(v){
  if(v <= 0) return 0;
  if(v < 10) return Math.ceil(v * 2) / 2;
  const casa = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / casa) * casa;
}

console.log('Banco : ' + path.resolve(alvo));
console.log('Modo  : ' + (dry ? 'SIMULACAO (--dry) — nada sera gravado' : 'APLICAR'));
console.log('Base  : consumo de uma persiana 1,50 x 1,50 × ' + P_MIN + ' (mínimo) e × ' + P_IDEAL + ' (ideal)');
console.log('');

const db = new Database(alvo);
const log = [];
let erro = null, def = 0, jaTinha = 0, semConsumo = [];

db.exec('BEGIN');
try{
  garantirSchemaCompras(db);
  const upd = db.prepare('UPDATE componente SET estoque_minimo=?, estoque_ideal=? WHERE id=?');
  for(const c of db.prepare('SELECT id,nome,unidade,estoque_minimo,estoque_ideal FROM componente ORDER BY nome').all()){
    if(c.estoque_minimo > 0 || c.estoque_ideal > 0){ jaTinha++; continue; }
    /* O tecido colorido nasce com o nome do branco mais a cor; casa pelo prefixo. */
    const chave = Object.keys(CONSUMO).find(k => c.nome === k || c.nome.indexOf(k) === 0);
    if(!chave){ semConsumo.push(c.nome); continue; }
    const mi = redondo(CONSUMO[chave] * P_MIN), id = redondo(CONSUMO[chave] * P_IDEAL);
    upd.run(mi, id, c.id);
    def++;
    log.push('  ' + c.nome.slice(0,40).padEnd(42) + String(mi).padStart(7) + ' → ' + String(id).padStart(7)
             + '  ' + (c.unidade || ''));
  }
}catch(e){ erro = e; }
db.exec((dry || erro) ? 'ROLLBACK' : 'COMMIT');

console.log('Componente'.padEnd(44) + 'mínimo'.padStart(7) + '   ideal');
console.log('-'.repeat(66));
console.log(log.join('\n') || '  (nenhum)');
console.log('');
console.log('Definidos .................. ' + def);
console.log('Já tinham (não toquei) ..... ' + jaTinha);
if(semConsumo.length){
  console.log('Sem consumo de referência .. ' + semConsumo.length + ' — ficaram zerados:');
  for(const n of semConsumo) console.log('    - ' + n);
}
console.log('');
if(erro){ console.error('Nada foi gravado — a transacao inteira foi desfeita.\n'); throw erro; }
console.log(dry ? 'Simulacao encerrada — nada foi gravado.' : 'Aplicado. Ajuste na aba Compras quando quiser.');
db.close();
