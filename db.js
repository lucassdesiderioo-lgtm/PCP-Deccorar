const Database = require('better-sqlite3');
const db = new Database('/opt/expedicao/dados.db');
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, criado_em TEXT DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS producao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, qtd INTEGER,
    produzido INTEGER DEFAULT 0, data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS revisao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, inicio TEXT, fim TEXT,
    segundos INTEGER, data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')));
`);
module.exports = db;
