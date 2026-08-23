/* Compras — Fase 1: fornecedor, oferta e historico de preco.
 *
 * COMPRAS.md §12: "Cadastro de fornecedor, oferta (embalagem/fator/preco),
 * tem_ficha do SKU e custo direto. Valor sozinha: responde 'quanto custa o que
 * eu revendo'."
 *
 * A peca central e a §4: UNIDADE DE CONSUMO x UNIDADE DE COMPRA. A embalagem
 * mora na OFERTA, nao no componente — o mesmo tubo e barra de 6 m num
 * fornecedor, barra de 3 m no outro e metro no terceiro. Se a embalagem morasse
 * no item, os tres nao caberiam no cadastro (regra 1 do §13).
 *
 * Idempotente, como todo schema deste projeto.
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * ATENCAO — `componente` nasce aqui em carater PROVISORIO.
 *
 * O dono dela e o PRODUCAO-MONTAGEM.md §6, que ainda nao foi implementado. O
 * COMPRAS.md §9 diz "Continua o schema do PRODUCAO-MONTAGEM.md §6" e so lista os
 * ALTERs, nunca o CREATE — ou seja, assume a tabela existindo.
 *
 * Sem ela, `oferta.componente_id` referencia uma tabela inexistente e qualquer
 * INSERT com componente estoura (foreign_keys esta LIGADA no better-sqlite3).
 *
 * As colunas abaixo sao o minimo que o proprio COMPRAS.md exige: §9 consulta
 * `c.estoque` e `c.id`, e §4 diz que `unidade` passa a ser lida como unidade de
 * consumo. Quando o §6 for implementado, o que faltar entra por ALTER — nunca
 * recriando a tabela.
 * ───────────────────────────────────────────────────────────────────────────── */
const COLUNAS_COMPONENTE = [
  ['estoque_minimo',     'REAL DEFAULT 0'],      // §7 ponto de pedido
  ['estoque_ideal',      'REAL DEFAULT 0'],
  /* §5: com sobra aproveitavel o ranking e por preco unitario; sem ela, por
     custo efetivo. Nasce em 1 porque errar para o lado seguro e comprar a
     embalagem maior, nao a menor. */
  ['sobra_aproveitavel', 'INTEGER DEFAULT 1'],
  ['custo_medio',        'REAL DEFAULT 0'],      // §6, so se move no recebimento
  ['perda_pct',          'REAL DEFAULT 0'],      // §7, medida nunca chutada
  /* §3: o componente que varia por cor E largura de bobina. Tecido blackout
     branco e bege sao itens diferentes; bobina 2,50 e 1,40 tambem. */
  ['familia',            'TEXT'],
  ['cor',                'TEXT'],
  ['largura_bobina_cm',  'INTEGER']
];

const COLUNAS_SKU = [
  /* §2: nem todo SKU e fabricado. E pergunta de sim ou nao, e e o CADASTRO que
     responde — nunca a ausencia de dados. Deduzir "tem linhas na ficha => e
     fabricado" silenciaria o erro mais comum: a persiana nova sem ficha lancada
     apareceria como revenda com custo zero e ninguem notaria. */
  ['tem_ficha',    'INTEGER DEFAULT 1'],
  ['custo_direto', 'REAL']                       // so quando tem_ficha = 0
];

function garantirSchemaCompras(db){
  db.exec(`
    /* ── COMPONENTE (provisorio — ver o aviso no topo do arquivo) ─────────── */
    CREATE TABLE IF NOT EXISTS componente (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo    TEXT UNIQUE,
      nome      TEXT NOT NULL,
      unidade   TEXT,                 -- UNIDADE DE CONSUMO: m | un | kg (§4)
      estoque   REAL DEFAULT 0,
      ativo     INTEGER DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now','localtime'))
    );

    /* ── FORNECEDOR (§9) ──────────────────────────────────────────────────── */
    CREATE TABLE IF NOT EXISTS fornecedor (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      nome          TEXT NOT NULL,
      cnpj          TEXT,
      contato       TEXT,
      telefone      TEXT,
      email         TEXT,
      prazo_entrega INTEGER,          -- dias corridos, padrao do fornecedor
      pedido_minimo REAL DEFAULT 0,   -- R$ do pedido inteiro
      pagamento     TEXT,             -- informa, NAO ordena (§5)
      frete_padrao  REAL DEFAULT 0,   -- rateado por valor entre os itens (§5)
      regime        TEXT,             -- simples|presumido|real|mei — so o aviso
      whatsapp      TEXT,             -- §8: pedido vai em PDF e texto de WhatsApp
      observacao    TEXT,
      ativo         INTEGER DEFAULT 1,
      criado_em     TEXT DEFAULT (datetime('now','localtime'))
    );

    /* ── OFERTA: fornecedor x item x embalagem (§4) ───────────────────────────
       Uma linha por FORMA DE COMPRAR. O mesmo fornecedor pode ter varias do
       mesmo item — pacote de 100 e caixa de 500 sao duas ofertas, e a maior nem
       sempre compensa. O CHECK garante que a oferta e de um componente OU de um
       SKU de revenda, nunca dos dois. */
    CREATE TABLE IF NOT EXISTS oferta (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      fornecedor_id  INTEGER NOT NULL REFERENCES fornecedor(id),
      componente_id  INTEGER REFERENCES componente(id),
      sku            TEXT REFERENCES skus(codigo),
      codigo_fornec  TEXT,                      -- o codigo dele, vai no pedido
      embalagem      TEXT NOT NULL,             -- 'barra 6 m' | 'pacote 100 un'
      fator          REAL NOT NULL DEFAULT 1,   -- un. de consumo por embalagem
      preco          REAL NOT NULL,             -- R$ por embalagem, SEM impostos
      multiplo       REAL DEFAULT 1,            -- so vende de N em N embalagens
      qtd_minima     REAL DEFAULT 1,            -- minimo de embalagens no pedido
      frete          REAL DEFAULT 0,            -- frete fixo do item, se houver
      prazo_entrega  INTEGER,                   -- sobrepoe o do fornecedor
      atualizado_em  TEXT DEFAULT (datetime('now','localtime')),
      atualizado_por TEXT,
      ativo          INTEGER DEFAULT 1,
      CHECK ( (componente_id IS NULL) <> (sku IS NULL) )
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_oferta_comp
      ON oferta(fornecedor_id, componente_id, embalagem) WHERE componente_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_oferta_sku
      ON oferta(fornecedor_id, sku, embalagem)           WHERE sku IS NOT NULL;

    /* ── HISTORICO DE PRECO (§6) ──────────────────────────────────────────────
       Regra 5 do §13: TODA mudanca de preco deixa historico, sem excecao. O
       comprador nao digita nada a mais — ele edita o preco e o historico
       acontece. Sem isto, "por que o custo subiu?" nao tem resposta. */
    CREATE TABLE IF NOT EXISTS preco_historico (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      oferta_id    INTEGER REFERENCES oferta(id),
      preco_antigo REAL,
      preco_novo   REAL NOT NULL,
      variacao_pct REAL,
      fonte        TEXT,          -- cadastro | compra | reajuste
      referencia   TEXT,          -- n do pedido, quando fonte='compra'
      usuario_nome TEXT,
      criado_em    TEXT DEFAULT (datetime('now','localtime')),
      data         TEXT DEFAULT (date('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_preco_hist ON preco_historico(oferta_id, data);

    /* ── HISTORICO DE CUSTO DO SKU (§6) ───────────────────────────────────────
       custo_mo nasce zerada de proposito: mao de obra fica fora agora, mas a
       coluna existe desde o primeiro dia para liga-la depois ser um cadastro e
       nao uma migracao. Regra 17: enquanto custo_mo for zero, o numero se chama
       "custo de material", nunca "custo do produto". */
    CREATE TABLE IF NOT EXISTS custo_sku_historico (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      sku            TEXT NOT NULL,
      custo_material REAL NOT NULL,
      custo_mo       REAL DEFAULT 0,
      custo_total    REAL NOT NULL,
      custo_medio    REAL,
      origem         TEXT,   -- ficha | direto
      motivo         TEXT,
      referencia     TEXT,
      usuario_nome   TEXT,
      criado_em      TEXT DEFAULT (datetime('now','localtime')),
      data           TEXT DEFAULT (date('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_custo_sku ON custo_sku_historico(sku, data);

    /* ── FICHA POR FORMULA (§3) ───────────────────────────────────────────────
       A decisao que reduz o projeto: a ficha nao e uma lista digitada por SKU, e
       uma FORMULA sobre a medida, lancada UMA VEZ no modelo. Com 200 SKUs e 3
       modelos sao 18 linhas em vez de 1.200 — e o SKU novo de amanha custa zero.

       componente_id OU familia, nunca os dois:
         componente_id  aponta direto (tubo, comando, parafuso)
         familia        resolve pela COR do SKU e pela largura da bobina (tecido)

       A observacao nao e enfeite: e onde fica escrito POR QUE a folga e 30 cm.
       Quando alguem perguntar daqui a um ano, a resposta esta no cadastro e nao
       na cabeca de quem cadastrou. */
    CREATE TABLE IF NOT EXISTS ficha_formula (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      modelo_id     INTEGER NOT NULL REFERENCES modelo(id),
      componente_id INTEGER REFERENCES componente(id),
      familia       TEXT,
      expressao     TEXT NOT NULL,
      observacao    TEXT,
      ordem         INTEGER DEFAULT 0,
      ativo         INTEGER DEFAULT 1,
      CHECK ( (componente_id IS NULL) <> (familia IS NULL) )
    );
    CREATE INDEX IF NOT EXISTS idx_formula_modelo ON ficha_formula(modelo_id, ordem);

    /* ── FICHA MATERIALIZADA (§3) ─────────────────────────────────────────────
       A formula do modelo + as medidas do SKU viram linhas nesta tabela. Recalculada
       quando a formula, o modelo ou as medidas mudam. Quem le a ficha continua
       lendo a ficha, sem saber que existe formula por tras — e a reserva da
       montagem continua congelando a quantidade do momento, nao a formula. */
    CREATE TABLE IF NOT EXISTS ficha_tecnica (
      sku           TEXT NOT NULL,
      componente_id INTEGER NOT NULL REFERENCES componente(id),
      quantidade    REAL NOT NULL,
      calculado_em  TEXT DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (sku, componente_id)
    );
  `);

  const colunas = function(tabela, novas){
    const tem = db.prepare('PRAGMA table_info(' + tabela + ')').all().map(function(c){ return c.name; });
    for(const par of novas){
      if(tem.indexOf(par[0]) < 0)
        db.exec('ALTER TABLE ' + tabela + ' ADD COLUMN ' + par[0] + ' ' + par[1]);
    }
  };
  colunas('componente', COLUNAS_COMPONENTE);
  colunas('skus', COLUNAS_SKU);

  /* §3: o componente resolvido por familia + cor + largura de bobina precisa ser
     unico nessa combinacao, senao a resolucao da formula fica ambigua. */
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_comp_variante
      ON componente(familia, cor, largura_bobina_cm) WHERE familia IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_comp_resolve
      ON componente(familia, cor, largura_bobina_cm, ativo);
  `);
}

module.exports = { garantirSchemaCompras, COLUNAS_COMPONENTE, COLUNAS_SKU };
