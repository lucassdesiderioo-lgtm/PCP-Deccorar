#!/usr/bin/env node
/* Importa a Planilha de Materiais ML para o cadastro de Compras (Fase 1).
 *
 * Cria os 5 fornecedores, os 22 componentes e uma OFERTA por componente — a
 * forma de comprar daquele fornecedor, com a embalagem e o preco dela.
 *
 * A conversao central e a §4 do COMPRAS.md: a planilha traz "Embalagem" como um
 * numero (6, 30, 100, 1000) e "Valor embalagem" em R$. Isso e exatamente o par
 * FATOR x PRECO da oferta:
 *
 *     fator = quantas unidades de CONSUMO cabem em uma unidade de COMPRA
 *     preco = R$ por unidade de compra
 *     preco / fator = R$ por unidade de consumo   (a coluna "Valor metro / und")
 *
 * IDEMPOTENTE: fornecedor e componente entram por nome/codigo; a oferta entra
 * pelo indice unico (fornecedor, componente, embalagem). Rodar duas vezes nao
 * duplica, e o preco so gera linha de historico quando muda de verdade.
 *
 * USO
 *   node importar_compras.js --dry [caminho.db]
 *   node importar_compras.js       [caminho.db]
 */
const path = require('path');
const Database = require('better-sqlite3');
const { garantirSchema } = require('./sku_schema');
const { garantirSchemaCompras } = require('./compras_schema');

/* ─────────────────────────────────────────────────────────────────────────────
 * A planilha, transcrita.
 *
 * `un` e a UNIDADE DE CONSUMO e foi INFERIDA da natureza do item: tubo, fita,
 * corrente e tecido se gastam em metro; o resto se conta por unidade. A planilha
 * nao traz essa coluna. Confira na tela de componentes — trocar 'm' por 'un'
 * nao mexe em preco nenhum, so no rotulo e na formula que vai consumir.
 *
 * `bobina` marca as duas larguras do mesmo tecido (§3): 3,20 m e 2,80 m. Sao
 * itens de estoque DIFERENTES — preco diferente, saldo diferente —, e e por isso
 * que a resolucao da formula escolhe entre elas em vez de somar.
 * ───────────────────────────────────────────────────────────────────────────── */
const MATERIAIS = [
  // nome                                        emb.  R$ embal.  fornecedor  un    familia / bobina
  ['Tubo 32 mm',                                    6,    66.13,  'JP',      'm'],
  ['Fita dupla face 1,6 cm',                       30,    17.08,  'AC',      'm'],
  ['Fita crepe 4,8 mm',                            50,    11.45,  'ML',      'm'],
  ['Comando 32 mm',                               100,   960.00,  'JP',      'un'],
  ['Emenda branca',                               100,    28.60,  'JP',      'un'],
  ['Limitador branco',                            100,    23.03,  'JP',      'un'],
  ['Base redonda branca',                           6,    60.41,  'JP',      'un'],
  ['Fita plastica 1,5 cm',                        100,    89.00,  'AC',      'm'],
  ['Tampa base redonda branca',                   100,    56.85,  'JP',      'un'],
  ['Corrente bola 10 branca',                     250,   182.50,  'AC',      'm'],
  ['Embalagem',                                  1000,  1000.00,  'LUIZ',    'un'],
  ['Parafuso 4x40',                              1000,    46.00,  'ML',      'un'],
  ['Bucha Sem Parafuso Com Aba Anel 6 mm',       1000,    22.50,  'ML',      'un'],
  ['Etiqueta ML - 10x15',                        1000,   370.00,  'SHOPI',   'un'],
  ['Etiqueta Prod - 10x3,5',                      800,    26.00,  'ML',      'un'],
  ['Saquinho kit',                               1000,  1000.00,  'LUIZ',    'un'],
  ['Blackout Sireno 3,2',                          60,  1560.00,  'AC',      'm',  'blackout_sireno', 320],
  ['Blackout Sireno 2,8',                          60,  1320.00,  'AC',      'm',  'blackout_sireno', 280],
  ['Fita durex',                                  500,     9.00,  'ML',      'm'],
  ['Filme stretch de 50mm x 30 mic',              200,     4.60,  'ML',      'm'],
  ['Grampo',                                    25000,    23.00,  'SHOPI',   'un'],
  ['Etiqueta adesiva bolinha colorida 10 mm',   10000,    80.00,  'ML',      'un']
];

/* O nome da embalagem e descritivo — e o que vai impresso no pedido ao
   fornecedor. "6 m" diz mais que "6" na hora de conferir a entrega. */
const nomeEmbalagem = (fator, un) => fator + (un === 'm' ? ' m' : ' un');

const args = process.argv.slice(2);
const dry  = args.indexOf('--dry') >= 0;
const alvo = args.filter(a => a.indexOf('--') !== 0)[0] || '/opt/expedicao/dados.db';

console.log('Banco : ' + path.resolve(alvo));
console.log('Modo  : ' + (dry ? 'SIMULACAO (--dry) — nada sera gravado' : 'APLICAR'));
console.log('');

const db = new Database(alvo);
const log = [];
let erro = null, novosF = 0, novosC = 0, novasO = 0, precoMudou = 0, jaIguais = 0;

db.exec('BEGIN');
try{
  garantirSchema(db);
  garantirSchemaCompras(db);

  const insF = db.prepare('INSERT INTO fornecedor (nome) VALUES (?)');
  const getF = db.prepare('SELECT id FROM fornecedor WHERE nome=?');
  const idF  = nome => { const r = getF.get(nome); if(r) return r.id;
                         novosF++; return insF.run(nome).lastInsertRowid; };

  const getC = db.prepare('SELECT id, unidade FROM componente WHERE nome=?');
  const insC = db.prepare(`INSERT INTO componente (nome, unidade, familia, largura_bobina_cm)
                           VALUES (?,?,?,?)`);

  const getO = db.prepare(`SELECT id, preco FROM oferta
                           WHERE fornecedor_id=? AND componente_id=? AND embalagem=?`);
  const insO = db.prepare(`INSERT INTO oferta (fornecedor_id,componente_id,embalagem,fator,preco,atualizado_por)
                           VALUES (?,?,?,?,?,'importação da planilha')`);
  const updO = db.prepare(`UPDATE oferta SET preco=?, fator=?, ativo=1,
                             atualizado_em=datetime('now','localtime'),
                             atualizado_por='importação da planilha' WHERE id=?`);
  const insH = db.prepare(`INSERT INTO preco_historico
      (oferta_id,preco_antigo,preco_novo,variacao_pct,fonte,usuario_nome)
      VALUES (?,?,?,?,'cadastro','importação da planilha')`);

  for(const m of MATERIAIS){
    const [nome, fator, preco, forn, un, familia, bobina] = m;
    const fid = idF(forn);

    let c = getC.get(nome);
    if(!c){ const r = insC.run(nome, un, familia||null, bobina||null);
            c = { id:r.lastInsertRowid }; novosC++; }

    const emb = nomeEmbalagem(fator, un);
    const o = getO.get(fid, c.id, emb);
    if(!o){
      const r = insO.run(fid, c.id, emb, fator, preco);
      insH.run(r.lastInsertRowid, null, preco, null);
      novasO++;
      log.push('  novo   ' + nome.padEnd(42) + forn.padEnd(6) + emb.padEnd(10)
               + 'R$ ' + preco.toFixed(2).padStart(8) + '  = R$ ' + (preco/fator).toFixed(3) + '/' + un);
    } else if(o.preco !== preco){
      updO.run(preco, fator, o.id);
      insH.run(o.id, o.preco, preco, o.preco>0 ? (preco-o.preco)/o.preco*100 : null);
      precoMudou++;
      log.push('  PRECO  ' + nome.padEnd(42) + 'R$ ' + o.preco.toFixed(2) + ' -> R$ ' + preco.toFixed(2)
               + '  (' + (o.preco>0 ? ((preco-o.preco)/o.preco*100).toFixed(1)+'%' : '—') + ')');
    } else jaIguais++;
  }
}catch(e){ erro = e; }
db.exec((dry || erro) ? 'ROLLBACK' : 'COMMIT');

if(log.length) console.log(log.join('\n') + '\n');
console.log('Fornecedores novos ......... ' + novosF);
console.log('Componentes novos .......... ' + novosC);
console.log('Ofertas novas .............. ' + novasO);
console.log('Precos alterados ........... ' + precoMudou);
console.log('Ja estavam iguais .......... ' + jaIguais);
console.log('');
if(erro){ console.error('Nada foi gravado — a transacao inteira foi desfeita.\n'); throw erro; }
console.log(dry ? 'Simulacao encerrada — nada foi gravado.' : 'Importacao aplicada.');
db.close();
