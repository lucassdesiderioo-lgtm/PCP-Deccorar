/* Compras — Fase 0: medida, cor e modelo do produto viram COLUNA.
 *
 * Ate aqui o sistema lia `BK180150BRANCO` e deduzia largura, altura e cor em
 * tempo de execucao, em varios pontos e com mais de uma estrategia. A ficha
 * tecnica por formula (Fase 2) nao pode depender de uma string ser interpretada
 * corretamente em todo lugar — ela le uma coluna. O codigo do SKU passa a ser
 * atalho de digitacao, nao fonte da verdade.
 *
 * Por que num modulo separado: dois donos precisam do mesmo schema. O `db.js`
 * (boot do servidor) e o `migrar_sku.js`, que e script avulso e abre um banco de
 * COPIA pelo caminho, sem passar pelo db.js. Duas copias do mesmo ALTER e
 * exatamente como nasceu a divergencia que a auditoria do §17 do CLAUDE.md
 * fechou — uma copia so.
 *
 * As colunas entram no fim da tabela (§17): e onde o SQLite as coloca no ALTER,
 * e e o que mantem a ordem do banco de producao igual a de uma instalacao limpa.
 *
 * Tudo aqui e idempotente: rodar duas vezes nao duplica nem derruba nada.
 */

/* Ordem importa: e a ordem em que o ALTER as acrescenta no banco de producao, e
   tem que bater com a ordem do CREATE TABLE skus do db.js. */
const COLUNAS_SKU = [
  ['modelo_id',  'INTEGER REFERENCES modelo(id)'],
  ['largura_cm', 'INTEGER'],
  ['altura_cm',  'INTEGER'],
  /* Nao se chama `cor`: a coluna `cor` ja existe em `skus` desde sempre, com
     texto livre ('Branco', 'bege claro'). Reaproveita-la obrigaria a migracao a
     sobrescrever dado existente. Esta coluna e a cor da lista fechada; a antiga
     fica intocada e some numa fase futura, com teste. */
  ['cor_codigo', 'TEXT REFERENCES cor(codigo)']
];

function garantirSchema(db){
  db.exec(`
    /* Cor deixa de ser texto livre: SKU e (mais adiante) componente escolhem da
       mesma lista. O codigo e a forma canonica em maiusculas ('BEGE'); o nome e
       como aparece na tela ('Bege'). */
    CREATE TABLE IF NOT EXISTS cor (
      codigo TEXT PRIMARY KEY,
      nome   TEXT,
      ativa  INTEGER DEFAULT 1
    );
    /* Nesta fase modelo e so cadastro — o prefixo do SKU ('BK') virando linha.
       As formulas da ficha tecnica penduram aqui na Fase 2. */
    CREATE TABLE IF NOT EXISTS modelo (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo    TEXT UNIQUE,
      nome      TEXT,
      ativo     INTEGER DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  const tem = db.prepare('PRAGMA table_info(skus)').all().map(function(c){ return c.name; });
  for(const par of COLUNAS_SKU){
    if(tem.indexOf(par[0]) < 0)
      db.exec('ALTER TABLE skus ADD COLUMN ' + par[0] + ' ' + par[1]);
  }
}

module.exports = { garantirSchema, COLUNAS_SKU };
