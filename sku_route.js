/* Compras — Fase 0: cadastro de cor, de modelo, e a lista de pendencias.
 *
 * As tabelas `cor` e `modelo` nascem em sku_schema.js, junto com as colunas
 * novas de `skus` — o db.js chama no boot e o migrar_sku.js chama sozinho. Aqui
 * ficam so as rotas.
 *
 * Nao ha nada de compras neste arquivo: sem fornecedor, sem oferta, sem preco,
 * sem pedido. Isso e da Fase 1 em diante. O que esta fase entrega e a base de
 * dados sobre a qual a ficha tecnica por formula vai ser calculada.
 *
 * Permissoes (declaradas no permDaRota do acesso.js, nenhuma rota nasce aberta):
 *   POST/DELETE /api/cores    -> sku.cadastrar
 *   POST/DELETE /api/modelos  -> modelo.cadastrar
 *   GET /api/skus/pendencias  -> sku.cadastrar
 *   GET /api/cores, GET /api/modelos -> @logado, igual a GET /api/skus e
 *     GET /api/listas/:tipo: sao listas de apoio de tela, sem dado sensivel.
 */
module.exports = function(app, db){

  /* ── CORES ────────────────────────────────────────────────────────────────
     Lista fechada. O `codigo` e a forma canonica que aparece dentro do SKU
     (BEGE), por isso e normalizado para maiusculas sem espaco; o `nome` e o
     rotulo de tela e fica como a pessoa digitou. */
  app.get('/api/cores', (req,res)=>
    res.json(db.prepare('SELECT codigo, nome, ativa FROM cor ORDER BY codigo').all()));

  app.post('/api/cores',(req,res)=>{
    const b=req.body||{};
    const cod=String(b.codigo||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!cod) return res.status(400).json({erro:'código obrigatório'});
    const nome=(b.nome===undefined||String(b.nome).trim()==='')?null:String(b.nome).trim();
    /* COALESCE: reenviar sem o nome nao apaga o nome que ja estava la. */
    db.prepare(`INSERT INTO cor (codigo,nome,ativa) VALUES (?,?,1)
      ON CONFLICT(codigo) DO UPDATE SET nome=COALESCE(excluded.nome,cor.nome), ativa=1`).run(cod,nome);
    res.json({ok:true,codigo:cod});
  });

  /* Desativa, nao apaga: pode haver SKU apontando para ela. Mesma escolha do
     DELETE /api/listas/:id. */
  app.delete('/api/cores/:codigo',(req,res)=>{
    db.prepare('UPDATE cor SET ativa=0 WHERE codigo=?').run(String(req.params.codigo||'').toUpperCase());
    res.json({ok:true});
  });

  /* ── MODELOS ──────────────────────────────────────────────────────────────
     So cadastro nesta fase — o prefixo do SKU ('BK') virando linha. As formulas
     da ficha tecnica (tubo = (largura + 2) / 100) penduram aqui na Fase 2. */
  app.get('/api/modelos', (req,res)=>
    res.json(db.prepare('SELECT id, codigo, nome, ativo, exige_medida, sob_medida FROM modelo ORDER BY codigo').all()));

  app.post('/api/modelos',(req,res)=>{
    const b=req.body||{};
    const cod=String(b.codigo||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!cod) return res.status(400).json({erro:'código obrigatório'});
    const nome=(b.nome===undefined||String(b.nome).trim()==='')?null:String(b.nome).trim();
    /* exige_medida ausente = mantem o que esta la (o COALESCE do excluded nao
       serve: 0 e valor legitimo, nao "nao mandou"). Mesma regra para
       sob_medida: os dois sao flags onde 0 significa alguma coisa. */
    const em=('exige_medida' in b) ? (b.exige_medida?1:0) : null;
    const sm=('sob_medida' in b) ? (b.sob_medida?1:0) : null;
    db.prepare(`INSERT INTO modelo (codigo,nome,ativo,exige_medida,sob_medida) VALUES (?,?,1,COALESCE(?,1),COALESCE(?,0))
      ON CONFLICT(codigo) DO UPDATE SET nome=COALESCE(excluded.nome,modelo.nome), ativo=1,
        exige_medida=COALESCE(?,modelo.exige_medida),
        sob_medida=COALESCE(?,modelo.sob_medida)`).run(cod,nome,em,sm,em,sm);
    res.json(db.prepare('SELECT id, codigo, nome, ativo, exige_medida, sob_medida FROM modelo WHERE codigo=?').get(cod));
  });

  /* ── TECIDOS ──────────────────────────────────────────────────────────────
     Mesma forma das cores. Blackout, Screen 3%. O prefixo do SKU ('BK') era
     isto o tempo todo — nao o modelo. */
  app.get('/api/tecidos', (req,res)=>
    res.json(db.prepare('SELECT codigo, nome, ativo FROM tecido ORDER BY codigo').all()));

  app.post('/api/tecidos',(req,res)=>{
    const b=req.body||{};
    const cod=String(b.codigo||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!cod) return res.status(400).json({erro:'código obrigatório'});
    const nome=(b.nome===undefined||String(b.nome).trim()==='')?null:String(b.nome).trim();
    db.prepare(`INSERT INTO tecido (codigo,nome,ativo) VALUES (?,?,1)
      ON CONFLICT(codigo) DO UPDATE SET nome=COALESCE(excluded.nome,tecido.nome), ativo=1`).run(cod,nome);
    res.json({ok:true,codigo:cod});
  });

  app.delete('/api/tecidos/:codigo',(req,res)=>{
    db.prepare('UPDATE tecido SET ativo=0 WHERE codigo=?').run(String(req.params.codigo||'').toUpperCase());
    res.json({ok:true});
  });

  app.delete('/api/modelos/:id',(req,res)=>{
    db.prepare('UPDATE modelo SET ativo=0 WHERE id=?').run(req.params.id);
    res.json({ok:true});
  });

  /* ── PENDENCIAS ───────────────────────────────────────────────────────────
     O contador daqui e o que vai dizer quando a Fase 2 pode comecar: enquanto
     houver SKU sem medida, a ficha tecnica por formula nao fecha.

     Um SKU aparece em mais de um grupo se faltar mais de uma coisa — sao tres
     perguntas independentes, nao um funil.

     `cor_codigo` apontando para uma cor DESATIVADA nao e pendencia: ela continua
     na lista, so nao e mais oferecida para cadastro novo. Pendencia e cor nula
     ou que nao existe na tabela. */
  app.get('/api/skus/pendencias',(req,res)=>{
    const cols=`s.codigo, s.descricao, s.largura_cm, s.altura_cm, s.modelo_id, s.cor_codigo,
                s.tecido_codigo, m.codigo modelo_codigo, m.nome modelo_nome`;
    const q=(where)=>db.prepare('SELECT '+cols+' FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id'
      +' WHERE '+where+' ORDER BY s.codigo').all();

    /* Acessorio nao tem medida e nunca vai ter — cobrar dele e ruido que ensina
       a equipe a ignorar o contador. Modelo ainda NULO conta como pendente de
       medida: sem saber o que a peca e, nao da para dizer que ela nao tem. */
    /* COMPRAS.md §2: so cobra medida e modelo de quem TEM ficha tecnica. SKU de
       revenda (tem_ficha=0) e comprado pronto — nao tem modelo de fabricacao nem
       precisa de medida; o que falta nele e custo. */
    const FABRICADO='COALESCE(s.tem_ficha,1)=1';
    const SEM_MEDIDA='(s.modelo_id IS NULL OR COALESCE(m.exige_medida,1)=1)';
    const medida=q(FABRICADO+' AND '+SEM_MEDIDA+' AND (s.largura_cm IS NULL OR s.altura_cm IS NULL)');
    const modelo=q(FABRICADO+' AND s.modelo_id IS NULL');
    const cor   =q('s.cor_codigo IS NULL OR s.cor_codigo NOT IN (SELECT codigo FROM cor)');
    /* §2: revenda sem preco nenhum — nem digitado, nem cotado — e "custo
       pendente". Regra 4 do §13: custo indefinido nunca vira zero. */
    const custo=q(`COALESCE(s.tem_ficha,1)=0 AND s.custo_direto IS NULL
      AND NOT EXISTS (SELECT 1 FROM oferta o JOIN fornecedor f ON f.id=o.fornecedor_id
                      WHERE o.sku=s.codigo AND o.ativo=1 AND f.ativo=1)`);
    const todas =q('('+FABRICADO+' AND '+SEM_MEDIDA+' AND (s.largura_cm IS NULL OR s.altura_cm IS NULL))'
      +' OR ('+FABRICADO+' AND s.modelo_id IS NULL)'
      +' OR s.cor_codigo IS NULL OR s.cor_codigo NOT IN (SELECT codigo FROM cor)'
      +` OR (COALESCE(s.tem_ficha,1)=0 AND s.custo_direto IS NULL
             AND NOT EXISTS (SELECT 1 FROM oferta o JOIN fornecedor f ON f.id=o.fornecedor_id
                             WHERE o.sku=s.codigo AND o.ativo=1 AND f.ativo=1))`);
    res.json({
      total: todas.length, skus: db.prepare('SELECT COUNT(*) c FROM skus').get().c,
      medida, modelo, cor, custo
    });
  });
};
