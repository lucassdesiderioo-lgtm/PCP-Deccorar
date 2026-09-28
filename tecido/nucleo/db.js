// Conexao unica com o banco PROPRIO deste modulo.
// Nao ha nenhuma ligacao com o dados.db do PCP do Mercado Livre — bancos
// separados, aplicacoes separadas, por decisao de escopo.
const Database=require('better-sqlite3');

// Onde o arquivo fica e pergunta do `caminho.js` — o `backup.js` da raiz faz a
// mesma pergunta sem abrir o banco, e duas contas divergiriam em silencio.
const arquivo=require('./caminho').BANCO;
const db=new Database(arquivo);

// WAL: mesma armadilha do PCP — os dados vivem no -wal, entao backup e
// db.backup(), nunca "cp tecido.db".
db.pragma('journal_mode = WAL');
// As chaves estrangeiras do schema so valem se isto estiver ligado; o SQLite
// nasce com elas DESLIGADAS.
db.pragma('foreign_keys = ON');

db.arquivo=arquivo;
module.exports=db;
