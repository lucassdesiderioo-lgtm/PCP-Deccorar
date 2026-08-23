const Database = require('better-sqlite3');
const db = new Database('/opt/expedicao/dados.db');
db.pragma('journal_mode = WAL');
db.exec(`
  /* modelo_id/largura_cm/altura_cm/cor_codigo sao a Fase 0 de Compras: medida e
     cor param de ser interpretadas do codigo do SKU e passam a ser coluna.
     Ficam NO FIM e NESTA ORDEM de proposito — e a ordem em que o ALTER do
     sku_schema.js as acrescenta no banco de producao (§17). Campo sem dado fica
     NULL: zero e um valor valido e mentiroso para medida. */
  CREATE TABLE IF NOT EXISTS skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, criado_em TEXT DEFAULT (datetime('now','localtime')),
    modelo_id INTEGER REFERENCES modelo(id), largura_cm INTEGER, altura_cm INTEGER,
    cor_codigo TEXT REFERENCES cor(codigo), tecido_codigo TEXT REFERENCES tecido(codigo));
  /* origem/urgente eram colunas so de producao, adicionadas a mao. Os defaults
     importam: server.js insere producao manual so com (codigo,qtd), e o
     cruzamento apaga por origem='ml'. Sem DEFAULT 'manual' o lancamento manual
     entraria com NULL. urgente=0 faz a linha contar como reposicao no
     /api/revisao/status, que soma urgente=1 e urgente=0 separadamente. */
  CREATE TABLE IF NOT EXISTS producao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, qtd INTEGER,
    produzido INTEGER DEFAULT 0, data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')),
    origem TEXT DEFAULT 'manual', urgente INTEGER DEFAULT 0, teste INTEGER DEFAULT 0);
  /* modo idem: o INSERT do /api/revisao nao preenche (um UPDATE logo depois
     grava 'hoje' ou 'estoque'), e st_route conta modo='hoje'. */
  CREATE TABLE IF NOT EXISTS revisao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, inicio TEXT, fim TEXT,
    segundos INTEGER, data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')),
    modo TEXT DEFAULT 'hoje', teste INTEGER DEFAULT 0);
  /* fila: elo entre REVISAO e EMBALAGEM. Fica aqui, e nao num modulo de rota,
     porque nenhum modulo e dono dela: quem insere e o server.js (revisao) e o
     dev_route.js (devolucao com destinacao 'reembalar'); quem le e consome e o
     mont_route.js (embalagem) e o ger_route.js (painel).
     ATENCAO aos defaults de revisado_em e data: nenhum INSERT preenche esses
     dois campos (ambos inserem so codigo+modo), e a tela de fila ordena por
     MIN(revisado_em). Sem o default, a linha entra com NULL e a fila perde a
     ordem de chegada. */
  CREATE TABLE IF NOT EXISTS fila (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT,
    modo TEXT DEFAULT 'hoje', situacao TEXT DEFAULT 'aguardando',
    revisado_em TEXT DEFAULT (datetime('now','localtime')), embalado_em TEXT,
    data TEXT DEFAULT (date('now','localtime')), teste INTEGER DEFAULT 0);
`);

/* A fila nasceu criada a mao direto no banco de producao, entao la o CREATE
   acima e no-op e uma eventual diferenca de colunas passaria despercebida.
   Aqui so avisamos: ALTER com default dinamico nao existe no SQLite, e uma
   coluna remendada sem o default certo e pior que um aviso no log. */
try{
  /* sem 'teste' na lista: quem cria essa coluna e o teste_route, que roda
     depois: cobrar aqui daria alarme falso todo boot. */
  var esperadas=['id','codigo','modo','situacao','revisado_em','embalado_em','data'];
  var tem=db.prepare('PRAGMA table_info(fila)').all().map(function(c){ return c.name; });
  var faltando=esperadas.filter(function(c){ return tem.indexOf(c)<0; });
  if(faltando.length) console.log('[db] ATENCAO: fila sem as colunas: '+faltando.join(', '));
}catch(e){ console.log('[db] nao consegui conferir a fila: '+e.message); }

/* Compras Fase 0: cria `cor` e `modelo` e acrescenta as colunas novas de `skus`
   no banco que ja existe. O CREATE acima cobre a instalacao limpa; este ALTER
   cobre producao, que nasceu sem elas. Idempotente. */
require('./sku_schema').garantirSchema(db);

module.exports = db;
