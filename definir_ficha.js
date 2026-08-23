#!/usr/bin/env node
/* Lanca a ficha do modelo Rolo — COMPRAS.md §3.
 *
 * As formulas NAO foram inventadas: cada uma foi derivada das oito colunas de
 * medida da planilha do comprador (1,80x1,50 ate 1,00x1,00) e conferida contra
 * as oito. A coluna "bate" abaixo diz em quantas das oito cada uma fecha.
 *
 * Isto e conveniencia de cadastro, nao decisao: tudo aqui e editavel na aba
 * Ficha tecnica, com o teste de tres medidas ao lado. O script existe para nao
 * obrigar ninguem a digitar 21 linhas a mao.
 *
 * SO LANCA SE O MODELO ESTIVER SEM FICHA. Modelo que ja tem linha nao e tocado —
 * ajuste manual nunca e desfeito.
 *
 * USO
 *   node definir_ficha.js --dry [caminho.db]
 *   node definir_ficha.js       [caminho.db]
 */
const path = require('path');
const Database = require('better-sqlite3');
const F = require('./formula');
const { garantirSchema } = require('./sku_schema');
const { garantirSchemaCompras } = require('./compras_schema');

const MODELO = 'ROLO';

/* [ componente (prefixo do nome), expressao, por que, bate em N das 8 ] */
const FICHA = [
  ['Tubo 32 mm',                'largura / 100',           'a largura da peça, sem folga', 8],
  ['Fita dupla face 1,6 cm',    'largura / 100',           null, 8],
  ['Fita crepe 4,8 mm',         'largura / 100',           null, 8],
  ['Comando 32 mm',             '1',                       null, 8],
  ['Emenda branca',             '1',                       null, 8],
  ['Limitador branco',          '2',                       'um de cada lado', 8],
  ['Base redonda branca',       'largura / 100',           'consumida por metro, não por unidade', 8],
  ['Fita plastica 1,5 cm',      'largura / 100',           null, 7],
  ['Tampa base redonda branca', '2',                       null, 8],
  ['Corrente bola 10 branca',   '(2 * altura - 20) / 100', 'desce e volta pela altura, menos 20 cm que não chegam ao chão', 8],
  ['Embalagem',                 '(largura + 10) / 100',    null, 6],
  ['Parafuso 4x40',             '4',                       null, 8],
  ['Bucha Sem Parafuso',        '4',                       null, 8],
  ['Etiqueta ML - 10x15',       '2',                       null, 8],
  ['Etiqueta Prod - 10x3,5',    '5',                       null, 8],
  ['Saquinho kit',              '1',                       null, 8],
  ['Fita durex',                '2',                       null, 8],
  ['Filme stretch',             '5',                       null, 8],
  ['Grampo',                    '10',                      null, 8],
  ['Etiqueta adesiva bolinha',  '2',                       null, 8]
];
/* O tecido nao aponta um componente: aponta a FAMILIA, e a cor do SKU mais a
   largura da bobina decidem qual item de estoque sai. */
const TECIDO = ['blackout_sireno', '(altura + 20) / 200',
  'bainha e volta no tubo; duas peças saem de uma largura de bobina', 6];

const args = process.argv.slice(2);
const dry  = args.indexOf('--dry') >= 0;
const alvo = args.filter(a => a.indexOf('--') !== 0)[0] || '/opt/expedicao/dados.db';

console.log('Banco : ' + path.resolve(alvo));
console.log('Modo  : ' + (dry ? 'SIMULACAO (--dry) — nada sera gravado' : 'APLICAR'));
console.log('');

const db = new Database(alvo);
const log = [];
let erro = null, lancadas = 0, semComponente = [];

db.exec('BEGIN');
try{
  garantirSchema(db); garantirSchemaCompras(db);
  const m = db.prepare('SELECT id, nome FROM modelo WHERE codigo=?').get(MODELO);
  if(!m) throw new Error('o modelo ' + MODELO + ' não existe — rode o migrar_modelo.js antes');

  const jaTem = db.prepare('SELECT COUNT(*) c FROM ficha_formula WHERE modelo_id=?').get(m.id).c;
  if(jaTem){
    console.log('O modelo ' + (m.nome||MODELO) + ' já tem ' + jaTem + ' linha(s) de ficha.');
    console.log('Não vou tocar — ajuste manual nunca é desfeito. Edite na aba Ficha técnica.');
    console.log('');
    db.exec('ROLLBACK'); db.close(); process.exit(0);
  }

  const ins = db.prepare(`INSERT INTO ficha_formula (modelo_id,componente_id,familia,expressao,observacao,ordem)
    VALUES (?,?,?,?,?,?)`);
  const acha = db.prepare("SELECT id, nome, unidade FROM componente WHERE nome LIKE ? AND ativo=1 ORDER BY id LIMIT 1");

  let ordem = 0;
  for(const [pref, expr, obs, bate] of FICHA){
    const c = acha.get(pref + '%');
    if(!c){ semComponente.push(pref); continue; }
    const v = F.validar(expr);
    if(!v.ok) throw new Error(pref + ': ' + v.erro);
    ins.run(m.id, c.id, null, expr, obs, ordem++);
    lancadas++;
    const ref = v.testes.find(t => t.largura===180 && t.altura===150);
    log.push('  ' + c.nome.slice(0,34).padEnd(36) + expr.padEnd(26)
      + String(ref.resultado).padStart(7) + ' ' + (c.unidade||'').padEnd(4)
      + (bate<8 ? '  ⚠ fecha em ' + bate + ' das 8' : ''));
  }

  /* Testa a linha do tecido na bobina mais estreita — se funciona na apertada,
     funciona nas outras. */
  const bob = db.prepare(`SELECT MIN(largura_bobina_cm) b FROM componente
    WHERE familia=? AND ativo=1 AND largura_bobina_cm IS NOT NULL`).get(TECIDO[0]);
  if(!bob || !bob.b) semComponente.push('tecido da família ' + TECIDO[0]);
  else {
    const v = F.validar(TECIDO[1], { largura_bobina: bob.b });
    if(!v.ok) throw new Error('tecido: ' + v.erro);
    ins.run(m.id, null, TECIDO[0], TECIDO[1], TECIDO[2], 99);
    lancadas++;
    const ref = v.testes.find(t => t.largura===180 && t.altura===150);
    log.push('  ' + ('tecido · ' + TECIDO[0]).padEnd(36) + TECIDO[1].padEnd(26)
      + String(ref.resultado).padStart(7) + ' m   ⚠ fecha em ' + TECIDO[3] + ' das 8');
  }
}catch(e){ erro = e; }
db.exec((dry || erro) ? 'ROLLBACK' : 'COMMIT');

console.log('Material'.padEnd(36) + 'fórmula'.padEnd(26) + '1,80×1,50');
console.log('-'.repeat(80));
console.log(log.join('\n') || '  (nenhuma)');
console.log('');
console.log('Linhas lançadas ............ ' + lancadas);
if(semComponente.length){
  console.log('SEM COMPONENTE no cadastro . ' + semComponente.length + ' — não entraram:');
  for(const n of semComponente) console.log('    - ' + n);
}
console.log('');
console.log('As marcadas com ⚠ não fecham nas oito medidas da planilha. São as três que');
console.log('ficaram em aberto — confira e ajuste na aba Ficha técnica.');
console.log('');
if(erro){ console.error('Nada foi gravado — a transacao inteira foi desfeita.\n'); throw erro; }
console.log(dry ? 'Simulacao encerrada — nada foi gravado.' : 'Ficha lançada. Confira em Admin → Ficha técnica.');
db.close();
