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
  ['largura_bobina_cm',  'INTEGER'],
  /* MARCA E MODELO, opcionais (spec SOBMEDIDA-CADASTRO-DE-PRODUTO, secao 8.2):
     o que a etiqueta de producao do sob medida escreve do insumo — no motor,
     o dado da garantia. Atravessam a porta de materiais do /sobmedida junto
     com id, nome e unidade. Vazio nunca trava nada: o campo so nao sai no
     papel. */
  ['marca',              'TEXT'],
  ['modelo',             'TEXT'],
  /* O CADASTRO DE MATERIAL (spec COMPRAS-E-RECEBIMENTO, fase 1, 07/11/2026):
     componente passa a ser TUDO que a empresa compra (R-CMP-01). Nenhuma destas
     colunas decide nada sozinha com o valor que ninguem escolheu (armadilha
     #30): `modo_saldo` nasce NULL e a rota exige a escolha; os que ja existiam
     recebem o que eles sao hoje no backfill de uma vez so, logo abaixo. */
  ['categoria',          'TEXT'],                  // lista `categoria_material` (R-CMP-04)
  ['vai_ficha',          'INTEGER'],               // a ficha so oferece = 1 (R-CMP-02)
  ['modo_saldo',         'TEXT'],                  // sem | quantidade | volume (R-CMP-03)
  ['almoxarifado_id',    'INTEGER'],               // onde ele mora (R-CMP-05)
  ['um_por_nivel',       'INTEGER DEFAULT 0'],     // cada nivel guarda um volume (R-CMP-06)
  ['peso_padrao_kg',     'REAL'],                  // peso de 1 unidade (R-CMP-07)
  ['tol_aviso_pct',      'REAL DEFAULT 2'],
  ['tol_retem_pct',      'REAL DEFAULT 5'],
  ['ncm',                'TEXT'],                  // 8 digitos, casa o XML (R-CMP-08)
  ['como_sai',           "TEXT DEFAULT 'contagem'"], // contagem | ficha (esperando a montagem, R-CMP-09)
  ['contagem_dias',      'INTEGER DEFAULT 30'],    // frequencia da contagem (R-CMP-42)
  ['margem_dias',        'INTEGER DEFAULT 5']      // folga do "pedir ate" (R-CMP-47)
];

const COLUNAS_SKU = [
  /* §2: nem todo SKU e fabricado. E pergunta de sim ou nao, e e o CADASTRO que
     responde — nunca a ausencia de dados. Deduzir "tem linhas na ficha => e
     fabricado" silenciaria o erro mais comum: a persiana nova sem ficha lancada
     apareceria como revenda com custo zero e ninguem notaria. */
  ['tem_ficha',    'INTEGER DEFAULT 1'],
  ['custo_direto', 'REAL']                       // so quando tem_ficha = 0
];

/* O BACKFILL DA FASE 1 (R-CMP-03): os materiais que ja existiam recebem o que
   eles sao hoje — vao para a ficha e tem saldo por quantidade; o tecido (com
   `familia`) e volume, um por nivel. UMA VEZ SO (marca em `config`): rodar de
   novo desfaria o que alguem desmarcou depois. O `config` e criado aqui
   tambem, porque este arquivo roda no boot do db.js, antes do modulo que o cria
   (a licao do §17 e da armadilha #28). */
function backfillMaterial(db){
  try{
    db.exec('CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT)');
    if(db.prepare("SELECT 1 FROM config WHERE chave='cmp_material_backfill_1'").get()) return;
    db.transaction(() => {
      db.prepare('UPDATE componente SET vai_ficha=1 WHERE vai_ficha IS NULL').run();
      db.prepare("UPDATE componente SET modo_saldo='volume', um_por_nivel=1 WHERE modo_saldo IS NULL AND familia IS NOT NULL").run();
      db.prepare("UPDATE componente SET modo_saldo='quantidade' WHERE modo_saldo IS NULL").run();
      db.prepare("UPDATE componente SET como_sai='contagem' WHERE como_sai IS NULL").run();
      /* Os dois almoxarifados que a fabrica ja tem fora do sob medida (§3 da
         spec). Os do tecido (ROLO e SOBRA) chegam pela migracao da fase 10. */
      for(const [nome, fin] of [['Comandos e montagem','comando, emenda, limitador, fita crepe'],
                                ['Expedição','parafuso, bucha, fita durex']])
        db.prepare('INSERT OR IGNORE INTO almoxarifado (nome, finalidade) VALUES (?,?)').run(nome, fin);
      db.prepare("INSERT INTO config (chave,valor) VALUES ('cmp_material_backfill_1','1')").run();
    })();
  }catch(e){ console.log('[compras] backfill do cadastro de material falhou: ' + e.message); }
}

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

    /* ── ALMOXARIFADO (spec COMPRAS-E-RECEBIMENTO, R-CMP-38, fase 1) ─────────
       Quantos a empresa quiser, criados pela tela (501, aba Almoxarifados). Na
       fase 1 so o NOME (e onde o material mora); o endereco haste -> andar ->
       nivel entra na fase 5. Com material dentro nao se apaga: desativa. */
    CREATE TABLE IF NOT EXISTS almoxarifado (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nome        TEXT NOT NULL UNIQUE COLLATE NOCASE,
      local       TEXT,
      finalidade  TEXT,
      ativo       INTEGER DEFAULT 1,
      criado_em   TEXT DEFAULT (datetime('now','localtime')),
      criado_por  TEXT,
      criado_por_id INTEGER
    );

    /* ── ALCADA POR PESSOA (COMPRAS-E-RECEBIMENTO R-CMP-17) ─────────────────
       Pedido acima do limite de quem o criou espera o aprovador (ou o Admin
       Geral). Quem nao tem linha aqui nao tem limite. */
    CREATE TABLE IF NOT EXISTS compra_alcada (
      usuario_id   INTEGER PRIMARY KEY,
      limite       REAL NOT NULL,
      aprovador_id INTEGER,
      definido_por TEXT, definido_por_id INTEGER,
      definido_em  TEXT DEFAULT (datetime('now','localtime'))
    );

    /* ── PARCELAS (R-CMP-19): o formato do sm_boleto do sob medida — valor
       em CENTAVOS, vencimento AAAA-MM-DD, pago_em/pago_por —, para o
       financeiro futuro juntar a pagar e a receber sem traducao. NAO e contas a
       pagar: nao ha lista do que vence, nem aviso. */
    CREATE TABLE IF NOT EXISTS pagamento_parcela (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id      INTEGER REFERENCES pedido_compra(id),
      nota_id        INTEGER,
      numero         INTEGER NOT NULL,
      forma          TEXT NOT NULL,      -- pix|boleto|cartao|dinheiro|transferencia
      valor_centavos INTEGER NOT NULL,
      vencimento     TEXT,
      pago_em        TEXT, pago_por TEXT, pago_por_id INTEGER,
      obs            TEXT,
      criado_em      TEXT DEFAULT (datetime('now','localtime')),
      criado_por     TEXT, criado_por_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_parcela_pedido ON pagamento_parcela(pedido_id);

    /* ── ANEXOS (R-CMP-20): o arquivo mora em caminhos.ANEXOS_COMPRAS, fora de
       lotes/ (o cron apaga). Aqui so o nome dele no disco. */
    CREATE TABLE IF NOT EXISTS compra_anexo (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id      INTEGER, nota_id INTEGER, recebimento_id INTEGER,
      tipo           TEXT NOT NULL,      -- orcamento|nota_pdf|nota_foto|xml|comprovante|outro
      nome           TEXT,               -- o nome original, so para mostrar
      arquivo        TEXT NOT NULL,      -- o nome no disco, gerado aqui
      tamanho        INTEGER,
      criado_em      TEXT DEFAULT (datetime('now','localtime')),
      criado_por     TEXT, criado_por_id INTEGER
    );

    /* ── NOTA FISCAL DE COMPRA (COMPRAS-E-RECEBIMENTO fase 4, R-CMP-22 a 26) ──
       Um pedido pode ter varias notas (entrega parcial). Compra SEM nota tambem
       e registro (sem_nota = 1), com o valor pago digitado no item. Cada nota
       grava o REGIME da data dela (R-CMP-25). origem: manual | xml | dfe. */
    CREATE TABLE IF NOT EXISTS nota_compra (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER REFERENCES pedido_compra(id),
      chave TEXT, numero TEXT, serie TEXT, emitente_cnpj TEXT, emitente_nome TEXT, emissao TEXT,
      total_produtos REAL, total_desconto REAL, total_frete REAL, total_seguro REAL, total_outras REAL,
      total_ipi REAL, total_icms REAL, total_icms_st REAL, total_nota REAL,
      sem_nota INTEGER DEFAULT 0, regime TEXT, origem TEXT DEFAULT 'manual',
      criado_em TEXT DEFAULT (datetime('now','localtime')), criado_por TEXT, criado_por_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_nota_pedido ON nota_compra(pedido_id);
    CREATE TABLE IF NOT EXISTS nota_compra_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nota_id INTEGER NOT NULL REFERENCES nota_compra(id),
      pedido_item_id INTEGER, componente_id INTEGER,
      descricao TEXT, ncm TEXT, cfop TEXT, unidade TEXT, quantidade REAL,
      valor_produto REAL, desconto REAL, frete REAL, seguro REAL, outras REAL,
      ipi REAL, icms REAL, icms_st REAL, credito_icms REAL, credito_ipi REAL,
      custo_pago REAL, custo_liquido REAL, codigo_fornecedor TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_nota_item_pi ON nota_compra_item(pedido_item_id);
    /* O credito vem de uma TABELA por regime, nao do codigo (R-CMP-25). */
    CREATE TABLE IF NOT EXISTS regra_credito (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      regime TEXT NOT NULL, imposto TEXT NOT NULL, aproveita INTEGER NOT NULL DEFAULT 0,
      vigente_desde TEXT NOT NULL,
      criado_em TEXT DEFAULT (datetime('now','localtime')), criado_por TEXT, criado_por_id INTEGER
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
      criado_em     TEXT DEFAULT (datetime('now','localtime')),
      /* COMPRAS-E-RECEBIMENTO R-CMP-12: o tipo e os dados de pagamento, que so
         viajam a quem tem pedido.pagar. */
      tipo TEXT, pix TEXT, banco TEXT, agencia TEXT, conta TEXT
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
      atualizado_por_id INTEGER,   -- quem fez, pelo id (QUEM-FEZ-E-REVISAO fase 7)
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
      data         TEXT DEFAULT (date('now','localtime')),
      usuario_id INTEGER    -- quem fez, pelo id (QUEM-FEZ-E-REVISAO fase 7)
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
      data           TEXT DEFAULT (date('now','localtime')),
      usuario_id INTEGER    -- quem fez, pelo id (QUEM-FEZ-E-REVISAO fase 7)
    );
    CREATE INDEX IF NOT EXISTS idx_custo_sku ON custo_sku_historico(sku, data);

    /* ── PEDIDO DE COMPRA (§8, §9) ────────────────────────────────────────────
       Um pedido por fornecedor: comprar 6 itens do mesmo fornecedor e UM pedido,
       nao seis. Sem aprovacao por valor — decisao explicita do §8. */
    CREATE TABLE IF NOT EXISTS pedido_compra (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      numero         TEXT UNIQUE,             -- PC-000142
      fornecedor_id  INTEGER REFERENCES fornecedor(id),
      status         TEXT DEFAULT 'rascunho', -- rascunho|enviado|parcial|recebido|cancelado
      valor_previsto REAL,
      valor_pago     REAL,
      frete          REAL DEFAULT 0,
      previsao       TEXT,
      observacao     TEXT,
      criado_por     TEXT,
      criado_em      TEXT DEFAULT (datetime('now','localtime')),
      enviado_em     TEXT,
      enviado_por    TEXT,                    -- pdf | whatsapp | outro
      fechado_em     TEXT,
      motivo_fecho   TEXT,
      pago_em        TEXT,                    -- §8: uma marca, nao contas a pagar
      pago_por       TEXT,
      data           TEXT DEFAULT (date('now','localtime')),
      teste          INTEGER DEFAULT 0,
      criado_por_id INTEGER,
      pago_por_id INTEGER,   -- quem fez, pelo id (QUEM-FEZ-E-REVISAO fase 7)
      /* COMPRAS-E-RECEBIMENTO fase 2 (R-CMP-13 a 21), na ordem do ALTER (§17) */
      canal TEXT, loja TEXT, numero_externo TEXT, comprado_em TEXT, comprado_por TEXT,
      comprado_por_id INTEGER, aprovacao TEXT, aprovado_por TEXT, aprovado_por_id INTEGER,
      aprovado_em TEXT, motivo_aprovacao TEXT, rapida INTEGER DEFAULT 0
    );

    /* Regra 9 do §13: o pedido CONGELA embalagem, fator e preco no momento em
       que e criado — mesma logica da reserva congelar a ficha tecnica. Se o
       preco do cadastro mudar amanha, o que foi pedido hoje nao muda junto. */
    CREATE TABLE IF NOT EXISTS pedido_item (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id      INTEGER REFERENCES pedido_compra(id),
      oferta_id      INTEGER REFERENCES oferta(id),
      componente_id  INTEGER REFERENCES componente(id),
      sku            TEXT,
      embalagem      TEXT,
      fator          REAL,
      preco_unit     REAL,
      qtd_embalagem  REAL,
      qtd_consumo    REAL,
      qtd_recebida   REAL DEFAULT 0,
      preco_pago     REAL,
      motivo_escolha TEXT,   -- regra 11: escolher fora do melhor preco exige motivo
      status         TEXT DEFAULT 'aberto',   -- aberto|parcial|recebido|cancelado
      /* COMPRAS-E-RECEBIMENTO R-CMP-18: a unidade em que se COMPROU (kg, un, m,
         cx), a quantidade e o preco nela, e o que o fornecedor declara na
         unidade da casa ("400 kg ≈ 600 tubos"). */
      unidade_compra TEXT, qtd_compra REAL, preco_unid_compra REAL, qtd_declarada REAL
    );
    CREATE INDEX IF NOT EXISTS idx_pedido_item_aberto ON pedido_item(componente_id, status);

    /* ── RECEBIMENTO (§8, §9) ─────────────────────────────────────────────────
       Quem pede nao e quem confere. A nota fiscal fica em NUMERO e DATA,
       digitados: e o que amarra o que chegou ao documento. Anexar PDF ou XML
       puxaria espaco, backup e uma decisao de retencao — a nota continua vivendo
       onde ja vive, e o sistema guarda o ponteiro. */
    CREATE TABLE IF NOT EXISTS recebimento (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id    INTEGER REFERENCES pedido_compra(id),
      nota_fiscal  TEXT,
      nota_data    TEXT,
      recebido_por TEXT,
      criado_em    TEXT DEFAULT (datetime('now','localtime')),
      data         TEXT DEFAULT (date('now','localtime')),
      teste        INTEGER DEFAULT 0,
      recebido_por_id INTEGER    -- quem fez, pelo id (QUEM-FEZ-E-REVISAO fase 7)
    );
    CREATE TABLE IF NOT EXISTS recebimento_item (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      recebimento_id   INTEGER REFERENCES recebimento(id),
      pedido_item_id   INTEGER REFERENCES pedido_item(id),
      qtd_embalagem    REAL,
      qtd_consumo      REAL,       -- entra no estoque
      /* Regra 28: o devolvido NAO entra no estoque e continua contando como
         "a caminho" — o fornecedor ainda deve. Dar entrada em material que foi
         embora no mesmo caminhao e o erro que mais estraga estoque novo. */
      qtd_devolvida    REAL DEFAULT 0,
      motivo_devolucao TEXT,       -- fora_medida|defeito|veio_errado|qtd_a_mais
      preco_pago       REAL,       -- lancado DEPOIS, pelo comprador
      divergencia      TEXT,       -- nenhuma|quantidade|preco|ambos
      /* COMPRAS-E-RECEBIMENTO fase 3 (R-CMP-29 a 37), na ordem do ALTER (§17):
         a contagem cega, os dois pesos, as reguas, a faixa, a decisao de quem
         libera, o fator real (kg por unidade), o lugar real e o custo da
         unidade recebida. */
      qtd_contada REAL, peso_1_kg REAL, peso_10_kg REAL, esperado_nota_kg REAL, esperado_cadastro_kg REAL,
      desvio_pct REAL, faixa TEXT, decisao TEXT, decidido_por TEXT, decidido_por_id INTEGER, decidido_em TEXT,
      motivo_decisao TEXT, fator_real REAL, almoxarifado_id INTEGER, custo_unit REAL
    );
    CREATE INDEX IF NOT EXISTS idx_receb_devol
      ON recebimento_item(motivo_devolucao) WHERE qtd_devolvida > 0;

    /* ── MOVIMENTO DE COMPONENTE (§9) ─────────────────────────────────────────
       Mesma ideia do movimento_estoque: o numero atual e conveniencia, a
       historia e a verdade. Dono unico: componente_dominio.js. */
    CREATE TABLE IF NOT EXISTS movimento_componente (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      componente_id INTEGER REFERENCES componente(id),
      delta         REAL,
      saldo_apos    REAL,
      motivo        TEXT,   -- recebimento|embalagem|perda|ajuste|contagem|devolucao
      referencia    TEXT,
      custo_unit    REAL,   -- so na entrada — alimenta o custo medio
      usuario_id    INTEGER,
      usuario_nome  TEXT,
      criado_em     TEXT DEFAULT (datetime('now','localtime')),
      data          TEXT DEFAULT (date('now','localtime')),
      teste         INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_mov_comp ON movimento_componente(componente_id, data);

    /* ── FICHA POR FORMULA (§3) ───────────────────────────────────────────────
       A decisao que reduz o projeto: a ficha nao e uma lista digitada por SKU, e
       uma FORMULA sobre a medida, lancada UMA VEZ no modelo. Com 200 SKUs e 3
       modelos sao 18 linhas em vez de 1.200 — e o SKU novo de amanha custa zero.

       componente_id OU familia, nunca os dois:
         componente_id  aponta direto (tubo, comando, parafuso)
         familia        resolve pela COR do SKU e pela largura da bobina (tecido)

       A observacao nao e enfeite: e onde fica escrito POR QUE a folga e 30 cm.
       Quando alguem perguntar daqui a um ano, a resposta esta no cadastro e nao
       na cabeca de quem cadastrou.

       ⚠️ SAO DUAS MEDIDAS, E ELAS NUNCA SE RECONCILIAM (04/09/2026).
       A coluna expressao responde QUANTO A PECA CONSOME — e o numero que vira
       custo e compra. As colunas corte_largura e corte_altura respondem A QUANTO
       A BANCADA CORTA, que e outro numero:

         tubo de uma persiana de 1,60   consome 1,60 m da barra de 6 m
                                        e a bancada corta a 1,57 (entra nas ponteiras)

       Os 3 cm de diferenca vao pro lixo. Precificar pela medida de corte faria a
       fabrica deixar de pagar por eles; cortar pela medida de precificacao faria
       o tubo nao entrar. Sao duas verdades, e por isso sao duas colunas — quem
       um dia quiser "unificar" esta cortando ou o custo ou a peca.

       No tecido a medida de corte e um RETANGULO, nao um numero: largura da peca
       por altura + folga. Por isso duas colunas e nao uma. Onde nao ha o que
       cortar (parafuso, comando pronto) as duas ficam NULL, e isso e resposta,
       nao pendencia.

       O custo NUNCA le estas colunas — ficha_dominio.js soma so a expressao, e
       ha caso travando isso no teste_ficha.js. */
    CREATE TABLE IF NOT EXISTS ficha_formula (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      modelo_id     INTEGER NOT NULL REFERENCES modelo(id),
      componente_id INTEGER REFERENCES componente(id),
      familia       TEXT,
      expressao     TEXT NOT NULL,
      observacao    TEXT,
      ordem         INTEGER DEFAULT 0,
      ativo         INTEGER DEFAULT 1,
      corte_largura TEXT,
      corte_altura  TEXT,
      corte_unidade TEXT,
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
  backfillMaterial(db);
  colunas('skus', COLUNAS_SKU);
  /* §17: coluna nova entra no CREATE do modulo dono E no ALTER, no mesmo commit,
     acrescentada NO FIM — que e onde o SQLite a coloca, e e o que mantem a ordem
     de uma instalacao limpa igual a de producao. `ficha_formula` e criada aqui
     em cima, entao o ALTER dela mora aqui: um ALTER guardado fora do modulo dono
     ja rodou antes da tabela existir uma vez (a nota do §17 sobre a
     contagem_pendente), e a coluna so nasceu no segundo boot. */
  /* QUEM FEZ, PELO ID (QUEM-FEZ-E-REVISAO fase 7, 05/11/2026): ao lado de cada
     nome que ja era gravado — quem atualizou a oferta, quem mudou o preco, quem
     criou e quem pagou o pedido, quem recebeu. No CREATE e aqui, no fim (§17).
     O `enviado_por` do pedido NAO e pessoa (pdf, whatsapp, outro). */
  colunas('oferta', [['atualizado_por_id','INTEGER']]);
  colunas('preco_historico', [['usuario_id','INTEGER']]);
  colunas('custo_sku_historico', [['usuario_id','INTEGER']]);
  colunas('pedido_compra', [['criado_por_id','INTEGER'], ['pago_por_id','INTEGER']]);
  colunas('recebimento', [['recebido_por_id','INTEGER']]);
  colunas('fornecedor', [['tipo','TEXT'],['pix','TEXT'],['banco','TEXT'],['agencia','TEXT'],['conta','TEXT']]);
  colunas('pedido_compra', [['canal','TEXT'],['loja','TEXT'],['numero_externo','TEXT'],['comprado_em','TEXT'],
    ['comprado_por','TEXT'],['comprado_por_id','INTEGER'],['aprovacao','TEXT'],['aprovado_por','TEXT'],
    ['aprovado_por_id','INTEGER'],['aprovado_em','TEXT'],['motivo_aprovacao','TEXT'],['rapida','INTEGER DEFAULT 0']]);
  colunas('recebimento_item', [['qtd_contada','REAL'],['peso_1_kg','REAL'],['peso_10_kg','REAL'],['esperado_nota_kg','REAL'],
    ['esperado_cadastro_kg','REAL'],['desvio_pct','REAL'],['faixa','TEXT'],['decisao','TEXT'],['decidido_por','TEXT'],
    ['decidido_por_id','INTEGER'],['decidido_em','TEXT'],['motivo_decisao','TEXT'],['fator_real','REAL'],['almoxarifado_id','INTEGER'],['custo_unit','REAL']]);
  colunas('pedido_item', [['unidade_compra','TEXT'],['qtd_compra','REAL'],['preco_unid_compra','REAL'],['qtd_declarada','REAL']]);
  /* R-CMP-25: o Simples Nacional nao aproveita credito — a tabela nasce com
     isso, uma vez so. Os outros regimes o contador lanca pela tela. */
  try{
    if(!db.prepare("SELECT 1 FROM config WHERE chave='cmp_regra_credito_1'").get()){
      db.transaction(() => {
        for(const imp of ['icms','ipi'])
          db.prepare("INSERT INTO regra_credito (regime, imposto, aproveita, vigente_desde, criado_por) VALUES ('simples', ?, 0, '2000-01-01', 'semente')").run(imp);
        db.prepare("INSERT OR IGNORE INTO config (chave,valor) VALUES ('regime_vigente','simples')").run();
        db.prepare("INSERT INTO config (chave,valor) VALUES ('cmp_regra_credito_1','1')").run();
      })();
    }
  }catch(e){ console.log('[compras] semente da regra de credito falhou: ' + e.message); }
  /* R-CMP-15: o status `enviado` passa a se chamar COMPRADO. Nada real foi
     lancado, mas a migracao e feita assim mesmo, uma vez so: a data da compra
     de quem ja estava `enviado` e o `enviado_em`. */
  try{
    if(!db.prepare("SELECT 1 FROM config WHERE chave='cmp_status_comprado_1'").get()){
      db.transaction(() => {
        db.prepare("UPDATE pedido_compra SET status='comprado', comprado_em=COALESCE(comprado_em, enviado_em), aprovacao=COALESCE(aprovacao,'nao_precisa') WHERE status='enviado'").run();
        db.prepare("INSERT INTO config (chave,valor) VALUES ('cmp_status_comprado_1','1')").run();
      })();
    }
  }catch(e){ console.log('[compras] migracao do status comprado falhou: ' + e.message); }
  colunas('ficha_formula', [
    ['corte_largura','TEXT'], ['corte_altura','TEXT'], ['corte_unidade','TEXT']
  ]);
  /* §8: a contagem de componente usa O MESMO fluxo que ja existe — o operador
     conta, o ajuste fica pendente, o admin aprova. Uma mecanica so no sistema
     inteiro. As colunas `tipo` e `componente_id` de contagem/contagem_pendente
     moraram aqui por um tempo, e estava errado: este arquivo roda no boot do
     db.js, ANTES de cont_route.js criar as tabelas, entao num banco novo a
     guarda nao achava a tabela e as colunas so nasciam no segundo boot. Agora
     ficam em cont_route.js, que e o dono das duas. */

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
