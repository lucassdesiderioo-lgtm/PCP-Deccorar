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
    res.json(db.prepare('SELECT id, codigo, nome, ativo FROM modelo ORDER BY codigo').all()));

  app.post('/api/modelos',(req,res)=>{
    const b=req.body||{};
    const cod=String(b.codigo||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!cod) return res.status(400).json({erro:'código obrigatório'});
    const nome=(b.nome===undefined||String(b.nome).trim()==='')?null:String(b.nome).trim();
    db.prepare(`INSERT INTO modelo (codigo,nome,ativo) VALUES (?,?,1)
      ON CONFLICT(codigo) DO UPDATE SET nome=COALESCE(excluded.nome,modelo.nome), ativo=1`).run(cod,nome);
    res.json(db.prepare('SELECT id, codigo, nome, ativo FROM modelo WHERE codigo=?').get(cod));
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
    const cols='codigo, descricao, largura_cm, altura_cm, modelo_id, cor_codigo';
    const q=(where)=>db.prepare('SELECT '+cols+' FROM skus WHERE '+where+' ORDER BY codigo').all();
    const medida=q('largura_cm IS NULL OR altura_cm IS NULL');
    const modelo=q('modelo_id IS NULL');
    const cor   =q('cor_codigo IS NULL OR cor_codigo NOT IN (SELECT codigo FROM cor)');
    const total =db.prepare(`SELECT COUNT(*) c FROM skus WHERE largura_cm IS NULL OR altura_cm IS NULL
      OR modelo_id IS NULL OR cor_codigo IS NULL OR cor_codigo NOT IN (SELECT codigo FROM cor)`).get().c;
    res.json({
      total, skus: db.prepare('SELECT COUNT(*) c FROM skus').get().c,
      medida, modelo, cor
    });
  });
};
