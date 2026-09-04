// APAGA MODELO QUE NINGUEM USA. Simula por padrao.
//
//   node limpar_modelos.js              lista o que apagaria
//   node limpar_modelos.js --aplicar    faz backup e apaga
//
// Nasceu de uma linha so: o modelo "(antigo — era o tecido, virou BLACKOUT)",
// resto da primeira migracao da Fase 0, que confundiu TECIDO com MODELO e
// gravou modelo BK em 24 SKUs (CLAUDE.md §7). Os SKUs foram corrigidos; a
// linha do modelo sobreviveu, renomeada, com zero SKU e zero ficha.
//
// ⚠️ POR QUE UM SCRIPT, E NAO UM DELETE NA MAO: porque a pergunta "ninguem
// usa?" tem que ser feita ao BANCO, e nao a memoria de quem lembra das duas
// tabelas que apontam para modelo hoje. No dia em que uma terceira apontar,
// um DELETE decorado quebra o historico em silencio — e este script, nao.
//
// A regra e a mesma do dominio/exclusao.js do modulo de tecido:
//
//   NINGUEM APONTA  ->  apaga de verdade. Nao ha historico a preservar.
//   ALGUEM APONTA   ->  recusa, DIZENDO QUEM e quantos.
const db = require('./db');
const APLICAR = process.argv.includes('--aplicar');

/* Quem aponta para `modelo`. Conferido contra o schema em 04/09/2026:
   skus.modelo_id e ficha_formula.modelo_id, e mais nada.

   A consulta do SQLite responde isso sozinha — e por isso ela vem primeiro,
   antes da lista escrita a mao. Uma lista de dependentes escrita a mao e a
   mesma divida da poda de preco por lista literal, que envelheceu em uma
   semana: o dia em que uma tabela nova apontar para modelo, este script tem
   que enxergar sem ninguem vir aqui editar. */
const dependentes = [];
db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().forEach(t => {
  try {
    const cols = db.prepare("SELECT name FROM pragma_table_info('" + t.name + "')").all();
    cols.filter(c => c.name === 'modelo_id')
        .forEach(() => dependentes.push({ tabela: t.name, coluna: 'modelo_id' }));
  } catch (e) {}
});

console.log('\ntabelas que apontam para modelo: ' +
  dependentes.map(d => d.tabela).join(', ') + '\n');

const modelos = db.prepare('SELECT id, nome FROM modelo ORDER BY nome').all();
const orfaos = [], usados = [];

modelos.forEach(m => {
  const quem = dependentes
    .map(d => ({ ...d, n: db.prepare('SELECT COUNT(*) c FROM ' + d.tabela +
                                     ' WHERE ' + d.coluna + '=?').get(m.id).c }))
    .filter(x => x.n > 0);
  (quem.length ? usados : orfaos).push({ ...m, quem });
});

console.log('── EM USO ' + '─'.repeat(44));
usados.forEach(m => console.log('   ' + String(m.id).padStart(3) + '  ' + m.nome.padEnd(34) +
  m.quem.map(q => q.n + ' em ' + q.tabela).join(', ')));
if (!usados.length) console.log('   (nenhum)');

console.log('\n── SEM NINGUEM APONTANDO ' + '─'.repeat(29));
orfaos.forEach(m => console.log('   ' + String(m.id).padStart(3) + '  ' + m.nome));
if (!orfaos.length) console.log('   (nenhum) — nada a apagar');

if (!orfaos.length) { console.log(''); process.exit(0); }

if (!APLICAR) {
  console.log('\n   SIMULACAO. Nada foi apagado.');
  console.log('   Para apagar de verdade:  node limpar_modelos.js --aplicar\n');
  process.exit(0);
}

/* BACKUP ANTES, SEMPRE — e por db.backup(), nunca `cp dados.db`: os dados
   vivem no -wal e a copia crua sai vazia (CLAUDE.md §12). */
const fs = require('fs');
const dest = '/opt/expedicao/backups/dados-antes-limpar-modelos-' +
  new Date().toISOString().slice(0, 19).replace(/[:T]/g, '') + '.db';
fs.mkdirSync('/opt/expedicao/backups', { recursive: true });

(async () => {
  const Database = require('better-sqlite3');
  const leitura = new Database('/opt/expedicao/dados.db', { readonly: true });
  await leitura.backup(dest);
  leitura.close();
  console.log('\n   backup -> ' + dest);

  const apagar = db.prepare('DELETE FROM modelo WHERE id=?');
  db.transaction(() => orfaos.forEach(m => apagar.run(m.id)))();
  console.log('   ' + orfaos.length + ' modelo(s) apagado(s): ' +
    orfaos.map(m => m.nome).join(', ') + '\n');
})().catch(e => { console.error('\n   ERRO, nada foi apagado: ' + e.message + '\n'); process.exit(1); });
