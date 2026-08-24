/* Ficha tecnica por formula — COMPRAS.md §3.
 *
 * Voce lanca os componentes UMA VEZ, no modelo. Todo SKU daquele modelo passa a
 * ter ficha, agora e para sempre — inclusive os que ainda nao existem.
 *
 * A resolucao do tecido tem uma diferenca importante em relacao ao documento, e
 * ela esta explicada em `resolverTecido()` mais abaixo: com CORTE INVERTIDO a
 * quantidade depende da largura da bobina, entao a escolha e por CUSTO TOTAL da
 * peca, nao por menor preco por metro linear.
 */
const F = require('./formula');
const FICHA = require('./ficha_dominio');
const CUSTO = require('./custo_dominio');

module.exports = function(app, db){

  const txt = v => { const t=String(v==null?'':v).trim(); return t===''?null:t; };

  /* ── FORMULAS DE UM MODELO ───────────────────────────────────────────────── */
  app.get('/api/formulas',(req,res)=>{
    const w=[], p=[];
    if(req.query.modelo_id){ w.push('f.modelo_id=?'); p.push(req.query.modelo_id); }
    res.json(db.prepare(`SELECT f.*, c.nome componente_nome, c.unidade
      FROM ficha_formula f LEFT JOIN componente c ON c.id=f.componente_id
      ${w.length?'WHERE '+w.join(' AND '):''}
      ORDER BY f.modelo_id, f.ordem, f.id`).all(...p));
  });

  /* Testa sem salvar. E o que alimenta a caixa de teste da tela: fórmula errada
     em cadastro vira compra errada em producao, entao ela nao salva sem mostrar
     o resultado em tres medidas (§3). */
  app.post('/api/formulas/testar',(req,res)=>{
    const b=req.body||{};
    const bob = b.largura_bobina!=null && b.largura_bobina!=='' ? +b.largura_bobina : null;
    const r = F.validar(txt(b.expressao)||'', { largura_bobina: bob });
    res.json(Object.assign({ variaveis:F.VARIAVEIS, funcoes:F.FUNCOES }, r));
  });

  app.post('/api/formulas',(req,res)=>{
    const b=req.body||{};
    const modelo=+b.modelo_id;
    if(!modelo || !db.prepare('SELECT 1 FROM modelo WHERE id=?').get(modelo))
      return res.status(400).json({erro:'modelo inválido'});
    const comp=b.componente_id?+b.componente_id:null;
    const familia=txt(b.familia);
    if(!!comp === !!familia)
      return res.status(400).json({erro:'a linha aponta um componente OU uma família de tecido, não os dois'});
    if(comp && !db.prepare('SELECT 1 FROM componente WHERE id=?').get(comp))
      return res.status(400).json({erro:'componente inválido'});
    const expr=txt(b.expressao);
    if(!expr) return res.status(400).json({erro:'fórmula obrigatória'});

    /* Linha de tecido usa `largura_bobina`, entao o teste precisa de uma bobina
       de verdade para rodar. Pega a mais estreita cadastrada naquela familia — se
       a formula funciona na mais apertada, funciona nas outras. */
    let bob=null;
    if(familia){
      const r=db.prepare(`SELECT MIN(largura_bobina_cm) b FROM componente
        WHERE familia=? AND ativo=1 AND largura_bobina_cm IS NOT NULL`).get(familia);
      bob = r && r.b;
      if(!bob) return res.status(400).json({erro:'não há componente cadastrado na família "'+familia+'" com largura de bobina'});
    }
    const v=F.validar(expr,{largura_bobina:bob});
    if(!v.ok) return res.status(400).json({erro:v.erro, testes:v.testes});

    const campos={ modelo_id:modelo, componente_id:comp, familia, expressao:expr,
      observacao:txt(b.observacao), ordem:(b.ordem!=null?+b.ordem:0) };
    if(b.id){
      db.prepare(`UPDATE ficha_formula SET modelo_id=@modelo_id,componente_id=@componente_id,
        familia=@familia,expressao=@expressao,observacao=@observacao,ordem=@ordem,ativo=1
        WHERE id=@id`).run(Object.assign({id:+b.id},campos));
      CUSTO.porModelo(db, modelo, 'fórmula alterada', {usuario_nome:(req.usuario&&req.usuario.nome)});
      return res.json({ok:true,id:+b.id,testes:v.testes});
    }
    const r=db.prepare(`INSERT INTO ficha_formula (modelo_id,componente_id,familia,expressao,observacao,ordem)
      VALUES (@modelo_id,@componente_id,@familia,@expressao,@observacao,@ordem)`).run(campos);
    CUSTO.porModelo(db, modelo, 'linha acrescentada à ficha', {usuario_nome:(req.usuario&&req.usuario.nome)});
    res.json({ok:true,id:r.lastInsertRowid,testes:v.testes});
  });

  app.delete('/api/formulas/:id',(req,res)=>{
    const f=db.prepare('SELECT modelo_id FROM ficha_formula WHERE id=?').get(req.params.id);
    db.prepare('DELETE FROM ficha_formula WHERE id=?').run(req.params.id);
    if(f) CUSTO.porModelo(db, f.modelo_id, 'linha removida da ficha', {usuario_nome:(req.usuario&&req.usuario.nome)});
    res.json({ok:true});
  });

  /* O calculo mora em ficha_dominio.js — o historico de custo precisa da MESMA
     conta, e duas copias divergiriam no primeiro ajuste (§9). */
  const calcular = sku => FICHA.calcularFicha(db, sku);

  app.get('/api/ficha/:sku',(req,res)=> res.json(calcular(req.params.sku)));

  /* Materializa a ficha na `ficha_tecnica`, que e o que a montagem ja le. */
  app.post('/api/ficha/:sku/materializar',(req,res)=>{
    const f=calcular(req.params.sku);
    if(f.erro||f.pendencia) return res.status(400).json(f);
    /* SOMA por componente antes de gravar. A ficha pode ter mais de uma linha do
       mesmo material de proposito — o parafuso que prende o suporte e o que
       prende a base sao duas linhas com razoes diferentes na observacao, e as
       duas quantidades se somam. Sem somar aqui, a segunda linha bateria na
       chave primaria (sku, componente_id) e derrubaria a gravacao inteira. */
    const somado={};
    for(const l of f.linhas) if(l.componente_id && l.quantidade!=null)
      somado[l.componente_id]=(somado[l.componente_id]||0)+l.quantidade;
    db.transaction(()=>{
      db.prepare('DELETE FROM ficha_tecnica WHERE sku=?').run(f.sku);
      const ins=db.prepare('INSERT INTO ficha_tecnica (sku,componente_id,quantidade) VALUES (?,?,?)');
      for(const id in somado) ins.run(f.sku,+id,somado[id]);
    })();
    res.json({ok:true, linhas:Object.keys(somado).length});
  });
};
