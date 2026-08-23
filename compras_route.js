/* Compras — Fase 1: fornecedor, componente, oferta e preco.
 *
 * COMPRAS.md §12 fase 1. O que esta fase entrega sozinha: "quanto custa o que eu
 * revendo" — o SKU marcado como comprado pronto passa a ter custo, digitado ou
 * vindo do melhor preco entre fornecedores.
 *
 * O QUE NAO ESTA AQUI, de proposito: comparacao de melhor preco (fase 2), lista
 * de compras (fase 3), pedido (fase 4) e recebimento (fase 5). Cada fase tem
 * valor sozinha — e isso que evita seis semanas sem nada funcionando.
 */
module.exports = function(app, db){

  const usuario = req => (req.usuario && req.usuario.nome) || null;

  /* Codigo repetido e erro de digitacao, nao falha de servidor. Sem isto o
     Express devolve 500 com stack trace em HTML — ilegivel para quem cadastra e
     vazando caminho de arquivo para o navegador. */
  const protegido = (res, fn, msgUnique) => {
    try{ return fn(); }
    catch(e){
      if(/UNIQUE/.test(e.message)) return res.status(409).json({erro:msgUnique});
      if(/CHECK/.test(e.message))  return res.status(400).json({erro:'dados inconsistentes para este cadastro'});
      throw e;
    }
  };
  /* Vazio vira NULL, nunca 0 nem ''. Regra 4 do §13: custo indefinido nunca vira
     zero — zero e um custo valido e mentiroso. */
  const num  = v => { const n = parseFloat(String(v==null?'':v).replace(',','.')); return Number.isFinite(n) ? n : null; };
  const txt  = v => { const t = String(v==null?'':v).trim(); return t===''?null:t; };

  /* ── FORNECEDOR ─────────────────────────────────────────────────────────── */
  app.get('/api/fornecedores',(req,res)=>
    res.json(db.prepare('SELECT * FROM fornecedor ORDER BY ativo DESC, nome').all()));

  app.post('/api/fornecedores',(req,res)=>{
    const b=req.body||{};
    const nome=txt(b.nome);
    if(!nome) return res.status(400).json({erro:'nome obrigatório'});
    const campos={ nome, cnpj:txt(b.cnpj), contato:txt(b.contato), telefone:txt(b.telefone),
      email:txt(b.email), prazo_entrega:num(b.prazo_entrega), pedido_minimo:num(b.pedido_minimo)||0,
      pagamento:txt(b.pagamento), frete_padrao:num(b.frete_padrao)||0, regime:txt(b.regime),
      whatsapp:txt(b.whatsapp), observacao:txt(b.observacao) };
    if(b.id){
      db.prepare(`UPDATE fornecedor SET nome=@nome,cnpj=@cnpj,contato=@contato,telefone=@telefone,
        email=@email,prazo_entrega=@prazo_entrega,pedido_minimo=@pedido_minimo,pagamento=@pagamento,
        frete_padrao=@frete_padrao,regime=@regime,whatsapp=@whatsapp,observacao=@observacao
        WHERE id=@id`).run(Object.assign({id:+b.id},campos));
      return res.json({ok:true,id:+b.id});
    }
    const r=db.prepare(`INSERT INTO fornecedor (nome,cnpj,contato,telefone,email,prazo_entrega,
      pedido_minimo,pagamento,frete_padrao,regime,whatsapp,observacao)
      VALUES (@nome,@cnpj,@contato,@telefone,@email,@prazo_entrega,@pedido_minimo,@pagamento,
      @frete_padrao,@regime,@whatsapp,@observacao)`).run(campos);
    res.json({ok:true,id:r.lastInsertRowid});
  });

  /* Desativa, nao apaga: ha oferta e (mais adiante) pedido apontando. */
  app.delete('/api/fornecedores/:id',(req,res)=>{
    db.prepare('UPDATE fornecedor SET ativo=0 WHERE id=?').run(req.params.id);
    res.json({ok:true});
  });

  /* ── COMPONENTE ─────────────────────────────────────────────────────────── */
  app.get('/api/componentes',(req,res)=>
    res.json(db.prepare('SELECT * FROM componente ORDER BY ativo DESC, nome').all()));

  app.post('/api/componentes',(req,res)=>{
    const b=req.body||{};
    const nome=txt(b.nome);
    if(!nome) return res.status(400).json({erro:'nome obrigatório'});
    const campos={ nome, codigo:txt(b.codigo), unidade:txt(b.unidade),
      /* §5: nasce aproveitavel. Errar para o lado seguro e comprar a embalagem
         maior, nao a menor. */
      sobra_aproveitavel: ('sobra_aproveitavel' in b) ? (b.sobra_aproveitavel?1:0) : 1,
      estoque_minimo:num(b.estoque_minimo)||0, estoque_ideal:num(b.estoque_ideal)||0,
      familia:txt(b.familia), cor:txt(b.cor)&&String(b.cor).toUpperCase(),
      largura_bobina_cm:num(b.largura_bobina_cm) };
    return protegido(res, ()=>{
      if(b.id){
        db.prepare(`UPDATE componente SET nome=@nome,codigo=@codigo,unidade=@unidade,
          sobra_aproveitavel=@sobra_aproveitavel,estoque_minimo=@estoque_minimo,
          estoque_ideal=@estoque_ideal,familia=@familia,cor=@cor,largura_bobina_cm=@largura_bobina_cm
          WHERE id=@id`).run(Object.assign({id:+b.id},campos));
        return res.json({ok:true,id:+b.id});
      }
      const r=db.prepare(`INSERT INTO componente (nome,codigo,unidade,sobra_aproveitavel,
        estoque_minimo,estoque_ideal,familia,cor,largura_bobina_cm)
        VALUES (@nome,@codigo,@unidade,@sobra_aproveitavel,@estoque_minimo,@estoque_ideal,
        @familia,@cor,@largura_bobina_cm)`).run(campos);
      res.json({ok:true,id:r.lastInsertRowid});
    }, 'já existe um componente com este código' +
       (campos.familia ? ', ou já existe esta combinação de família, cor e largura de bobina' : ''));
  });

  app.delete('/api/componentes/:id',(req,res)=>{
    db.prepare('UPDATE componente SET ativo=0 WHERE id=?').run(req.params.id);
    res.json({ok:true});
  });

  /* ── OFERTA ──────────────────────────────────────────────────────────────── */
  app.get('/api/ofertas',(req,res)=>{
    const w=[], p=[];
    if(req.query.componente_id){ w.push('o.componente_id=?'); p.push(req.query.componente_id); }
    if(req.query.sku){ w.push('o.sku=?'); p.push(req.query.sku); }
    if(req.query.fornecedor_id){ w.push('o.fornecedor_id=?'); p.push(req.query.fornecedor_id); }
    res.json(db.prepare(`SELECT o.*, f.nome fornecedor_nome, f.ativo fornecedor_ativo,
        f.prazo_entrega prazo_fornecedor, c.nome componente_nome, c.unidade unidade
      FROM oferta o
      JOIN fornecedor f ON f.id=o.fornecedor_id
      LEFT JOIN componente c ON c.id=o.componente_id
      ${w.length?'WHERE '+w.join(' AND '):''}
      ORDER BY o.ativo DESC, f.nome, o.embalagem`).all(...p));
  });

  /* Cria ou atualiza uma oferta. TODA mudanca de preco grava historico — regra 5
     do §13, sem excecao. O comprador nao digita nada a mais: edita o preco e o
     historico acontece. */
  app.post('/api/ofertas',(req,res)=>{
    const b=req.body||{};
    const forn=+b.fornecedor_id;
    const comp=b.componente_id?+b.componente_id:null;
    const sku =txt(b.sku)&&String(b.sku).trim().toUpperCase();
    const emb =txt(b.embalagem);
    const preco=num(b.preco);
    if(!forn)  return res.status(400).json({erro:'fornecedor obrigatório'});
    if(!emb)   return res.status(400).json({erro:'embalagem obrigatória'});
    if(preco==null||preco<0) return res.status(400).json({erro:'preço inválido'});
    // O CHECK do banco exige exatamente um dos dois; devolve erro legivel antes.
    if(!!comp === !!sku) return res.status(400).json({erro:'informe um componente OU um SKU, não os dois'});
    const fator=num(b.fator);
    if(fator==null||fator<=0) return res.status(400).json({erro:'fator tem que ser maior que zero'});

    const campos={ fornecedor_id:forn, componente_id:comp, sku:sku||null,
      codigo_fornec:txt(b.codigo_fornec), embalagem:emb, fator, preco,
      multiplo:num(b.multiplo)||1, qtd_minima:num(b.qtd_minima)||1,
      frete:num(b.frete)||0, prazo_entrega:num(b.prazo_entrega), quem:usuario(req) };

    try{
      const gravar = db.transaction(()=>{
        const antes = b.id ? db.prepare('SELECT preco FROM oferta WHERE id=?').get(+b.id) : null;
        let id;
        if(b.id){
          db.prepare(`UPDATE oferta SET fornecedor_id=@fornecedor_id,componente_id=@componente_id,
            sku=@sku,codigo_fornec=@codigo_fornec,embalagem=@embalagem,fator=@fator,preco=@preco,
            multiplo=@multiplo,qtd_minima=@qtd_minima,frete=@frete,prazo_entrega=@prazo_entrega,
            ativo=1,atualizado_em=datetime('now','localtime'),atualizado_por=@quem
            WHERE id=@id`).run(Object.assign({id:+b.id},campos));
          id=+b.id;
        } else {
          const r=db.prepare(`INSERT INTO oferta (fornecedor_id,componente_id,sku,codigo_fornec,
            embalagem,fator,preco,multiplo,qtd_minima,frete,prazo_entrega,atualizado_por)
            VALUES (@fornecedor_id,@componente_id,@sku,@codigo_fornec,@embalagem,@fator,@preco,
            @multiplo,@qtd_minima,@frete,@prazo_entrega,@quem)`).run(campos);
          id=r.lastInsertRowid;
        }
        const antigo = antes ? antes.preco : null;
        if(antigo===null || antigo!==preco)
          db.prepare(`INSERT INTO preco_historico (oferta_id,preco_antigo,preco_novo,variacao_pct,fonte,usuario_nome)
            VALUES (?,?,?,?,?,?)`).run(id, antigo, preco,
              (antigo!=null&&antigo>0) ? ((preco-antigo)/antigo*100) : null,
              txt(b.fonte)||'cadastro', usuario(req));
        return id;
      });
      res.json({ok:true,id:gravar()});
    }catch(e){
      // O indice unico (fornecedor, item, embalagem) e a regra: uma linha por
      // forma de comprar. Mesma embalagem duas vezes e edicao, nao oferta nova.
      if(/UNIQUE/.test(e.message))
        return res.status(409).json({erro:'já existe uma oferta deste fornecedor para este item nesta embalagem'});
      if(/CHECK/.test(e.message))
        return res.status(400).json({erro:'informe um componente OU um SKU, não os dois'});
      throw e;
    }
  });

  app.delete('/api/ofertas/:id',(req,res)=>{
    db.prepare('UPDATE oferta SET ativo=0 WHERE id=?').run(req.params.id);
    res.json({ok:true});
  });

  /* ── COMPARACAO: de quem comprar (§5) ─────────────────────────────────────
     A conta mora em compras_calc.js, sem Express e sem SQL. Aqui so se busca as
     ofertas e se devolve o resultado — a §9 e explicita em que essa logica nao
     pode existir em dois lugares. */
  const CALC = require('./compras_calc');

  function ofertasDe(componente_id, sku){
    return db.prepare(`SELECT o.*, f.nome fornecedor_nome, f.prazo_entrega prazo_fornecedor,
        f.pagamento, f.regime, f.pedido_minimo
      FROM oferta o JOIN fornecedor f ON f.id=o.fornecedor_id
      WHERE o.ativo=1 AND f.ativo=1 AND `+(componente_id?'o.componente_id=?':'o.sku=?'))
      .all(componente_id || sku);
  }

  app.get('/api/comparar',(req,res)=>{
    const cid=req.query.componente_id?+req.query.componente_id:null;
    const sku=req.query.sku||null;
    if(!cid && !sku) return res.status(400).json({erro:'informe componente_id ou sku'});
    const N=parseFloat(String(req.query.necessidade||'').replace(',','.'));
    if(!Number.isFinite(N) || N<=0) return res.status(400).json({erro:'necessidade tem que ser maior que zero'});

    const c = cid ? db.prepare('SELECT nome, unidade, sobra_aproveitavel FROM componente WHERE id=?').get(cid) : null;
    const r = CALC.comparar(ofertasDe(cid,sku), N, {
      unidade: c ? (c.unidade==='m'?'metro':'unidade') : 'unidade',
      sobra_aproveitavel: c ? c.sobra_aproveitavel : 1,
      dias_ate: req.query.dias_ate!=null && req.query.dias_ate!=='' ? +req.query.dias_ate : null
    });
    /* Pedido minimo do fornecedor aparece como aviso, com quanto falta (§5). */
    for(const l of r.linhas){
      const f=db.prepare('SELECT pedido_minimo FROM fornecedor WHERE id=?').get(l.fornecedor_id);
      if(f && f.pedido_minimo>0 && l.desembolso < f.pedido_minimo)
        l.aviso_minimo='faltam R$ '+(f.pedido_minimo-l.desembolso).toFixed(2)
          +' para o pedido mínimo deste fornecedor';
    }
    res.json(Object.assign({ item: c?c.nome:sku, unidade: c?c.unidade:'un' }, r));
  });

  /* ── HISTORICO DE PRECO ──────────────────────────────────────────────────── */
  app.get('/api/precos/historico',(req,res)=>{
    const w=[], p=[];
    if(req.query.oferta_id){ w.push('h.oferta_id=?'); p.push(req.query.oferta_id); }
    res.json(db.prepare(`SELECT h.*, f.nome fornecedor_nome, o.embalagem,
        COALESCE(c.nome, o.sku) item
      FROM preco_historico h
      LEFT JOIN oferta o ON o.id=h.oferta_id
      LEFT JOIN fornecedor f ON f.id=o.fornecedor_id
      LEFT JOIN componente c ON c.id=o.componente_id
      ${w.length?'WHERE '+w.join(' AND '):''}
      ORDER BY h.id DESC LIMIT 200`).all(...p));
  });

  /* ── CUSTO DO SKU DE REVENDA ─────────────────────────────────────────────────
     §2: o SKU tem ficha tecnica ou nao tem, e e o CADASTRO que responde. O de
     revenda pode ter `custo_direto` digitado OU fornecedores cadastrados — o
     digitado tem prioridade enquanto existir; apagando o valor, o custo passa a
     vir do melhor preco vigente. Os dois modos convivem.

     Aqui o "melhor preco" e simples: menor preco por unidade de consumo. A
     comparacao completa — multiplo, minimo, frete rateado e sobra aproveitavel —
     e a fase 2, e vai morar em dominio/compras.js. Regra do §9: custo de SKU
     nunca e calculado em duas partes do sistema, entao esta rota devolve o
     numero mas nao duplica aquela logica. */
  app.get('/api/skus/custo',(req,res)=>{
    const linhas=db.prepare(`SELECT s.codigo, s.descricao, s.tem_ficha, s.custo_direto,
        s.modelo_id, s.largura_cm, s.altura_cm, s.cor_codigo,
        ( SELECT MIN(o.preco / o.fator) FROM oferta o
          JOIN fornecedor f ON f.id=o.fornecedor_id
          WHERE o.sku=s.codigo AND o.ativo=1 AND f.ativo=1 ) custo_cotado
      FROM skus s ORDER BY s.codigo`).all();
    for(const l of linhas){
      if(l.tem_ficha){
        // Fase 2 calcula pela formula. Ate la, indefinido — nunca zero.
        l.custo = null;
        l.pendencia = l.modelo_id==null ? 'modelo pendente'
                    : (l.largura_cm==null||l.altura_cm==null) ? 'medida pendente'
                    : 'ficha pendente';
      } else {
        l.custo = (l.custo_direto!=null) ? l.custo_direto : l.custo_cotado;
        l.pendencia = (l.custo==null) ? 'custo pendente' : null;
        l.origem = (l.custo_direto!=null) ? 'digitado' : (l.custo_cotado!=null ? 'cotado' : null);
      }
    }
    res.json({
      linhas,
      pendentes: linhas.filter(l=>l.pendencia).length,
      // Regra 17: enquanto a mao de obra for zero, o numero se chama assim.
      rotulo: 'custo de material'
    });
  });
};
