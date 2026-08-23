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
      return res.json({ok:true,id:+b.id,testes:v.testes});
    }
    const r=db.prepare(`INSERT INTO ficha_formula (modelo_id,componente_id,familia,expressao,observacao,ordem)
      VALUES (@modelo_id,@componente_id,@familia,@expressao,@observacao,@ordem)`).run(campos);
    res.json({ok:true,id:r.lastInsertRowid,testes:v.testes});
  });

  app.delete('/api/formulas/:id',(req,res)=>{
    db.prepare('DELETE FROM ficha_formula WHERE id=?').run(req.params.id);
    res.json({ok:true});
  });

  /* ── RESOLUCAO DO TECIDO ─────────────────────────────────────────────────────
     Aqui esta a divergencia consciente com o COMPRAS.md §3.

     O documento diz: filtre as bobinas que atendem a largura do SKU e escolha a
     de menor preco por metro linear, porque "voce puxa a mesma metragem linear
     de qualquer uma delas, entao o desperdicio de largura ja esta dentro do
     preco".

     Isso vale no corte NAO invertido. No corte invertido a altura da peca
     atravessa a largura da bobina, cabem varias pecas lado a lado, e a metragem
     puxada POR PECA depende de quantas cabem:

         pecas_lado_a_lado = piso(largura_bobina / altura)
         consumo_por_peca  = largura / pecas_lado_a_lado

     Numeros reais, persiana 1,80 x 1,50:
         bobina 3,20  ->  piso(320/150) = 2  ->  0,90 m a R$ 26,00/m  =  R$ 23,40
         bobina 2,80  ->  piso(280/150) = 1  ->  1,80 m a R$ 22,00/m  =  R$ 39,60

     A bobina "mais cara por metro" sai 41% mais barata por peca. A regra do
     documento escolheria a errada. Entao a escolha aqui e por CUSTO TOTAL.

     A formula continua sendo do cadastro — quem decide se o corte e invertido e
     a expressao que o comprador escreveu, nao este arquivo. Este arquivo so
     avalia a expressao uma vez por bobina candidata e compara o resultado. */
  function resolverTecido(familia, corSku, largura, altura){
    if(!corSku) return { erro:'o SKU não tem cor definida — sem ela não dá para escolher o tecido' };
    const cands=db.prepare(`SELECT c.id, c.nome, c.largura_bobina_cm,
        ( SELECT MIN(o.preco / o.fator) FROM oferta o JOIN fornecedor f ON f.id=o.fornecedor_id
          WHERE o.componente_id=c.id AND o.ativo=1 AND f.ativo=1 ) preco_linear
      FROM componente c
      WHERE c.familia=? AND c.ativo=1 AND c.largura_bobina_cm IS NOT NULL
        AND (c.cor IS NULL OR c.cor=?)
      ORDER BY c.largura_bobina_cm`).all(familia, corSku);
    if(!cands.length)
      return { erro:'não existe componente da família "'+familia+'" na cor '+corSku
                 +'. Cadastre o componente ou corrija a cor do SKU.' };
    return { candidatos:cands };
  }

  /* ── FICHA CALCULADA DE UM SKU ───────────────────────────────────────────── */
  function calcular(sku){
    const s=db.prepare(`SELECT s.*, m.nome modelo_nome, m.codigo modelo_codigo, m.exige_medida
      FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id WHERE s.codigo=?`).get(sku);
    if(!s) return { erro:'SKU não encontrado' };
    if(!s.tem_ficha) return { sku, tem_ficha:0, linhas:[], aviso:'SKU de revenda — o custo é direto, não tem ficha' };
    if(s.modelo_id==null) return { sku, linhas:[], pendencia:'modelo pendente' };
    if(s.largura_cm==null||s.altura_cm==null) return { sku, linhas:[], pendencia:'medida pendente' };

    const formulas=db.prepare(`SELECT f.*, c.nome componente_nome, c.unidade
      FROM ficha_formula f LEFT JOIN componente c ON c.id=f.componente_id
      WHERE f.modelo_id=? AND f.ativo=1 ORDER BY f.ordem, f.id`).all(s.modelo_id);
    if(!formulas.length) return { sku, linhas:[], pendencia:'ficha pendente' };

    const base={ largura:s.largura_cm, altura:s.altura_cm };
    const linhas=[]; let custo=0, indefinido=false;

    for(const f of formulas){
      const l={ formula_id:f.id, expressao:f.expressao, observacao:f.observacao };
      if(f.familia){
        const r=resolverTecido(f.familia, s.cor_codigo, s.largura_cm, s.altura_cm);
        if(r.erro){ l.erro=r.erro; indefinido=true; linhas.push(l); continue; }
        /* Avalia a expressao uma vez por bobina e escolhe pelo CUSTO da peca. */
        let melhor=null; const opcoes=[];
        for(const c of r.candidatos){
          let q;
          try{ q=F.avaliar(f.expressao, Object.assign({largura_bobina:c.largura_bobina_cm}, base)); }
          catch(e){ l.erro=e.message; indefinido=true; break; }
          const op={ componente_id:c.id, nome:c.nome, bobina_cm:c.largura_bobina_cm,
                     quantidade:q, preco_linear:c.preco_linear,
                     custo:(c.preco_linear!=null)?q*c.preco_linear:null };
          opcoes.push(op);
          if(op.custo!=null && (!melhor || op.custo<melhor.custo)) melhor=op;
        }
        if(l.erro){ linhas.push(l); continue; }
        l.opcoes=opcoes;
        if(!melhor){ l.erro='nenhuma bobina desta família tem preço cadastrado'; indefinido=true; linhas.push(l); continue; }
        Object.assign(l,{ componente_id:melhor.componente_id, componente_nome:melhor.nome,
          unidade:'m linear', quantidade:melhor.quantidade, preco_unitario:melhor.preco_linear,
          custo:melhor.custo, motivo:'bobina '+(melhor.bobina_cm/100).toFixed(2)+' m — menor custo por peça' });
        custo+=melhor.custo;
      } else {
        let q;
        try{ q=F.avaliar(f.expressao, base); }
        catch(e){ l.erro=e.message; indefinido=true; linhas.push(l); continue; }
        const pr=db.prepare(`SELECT MIN(o.preco / o.fator) p FROM oferta o
          JOIN fornecedor f2 ON f2.id=o.fornecedor_id
          WHERE o.componente_id=? AND o.ativo=1 AND f2.ativo=1`).get(f.componente_id);
        Object.assign(l,{ componente_id:f.componente_id, componente_nome:f.componente_nome,
          unidade:f.unidade, quantidade:q, preco_unitario:pr?pr.p:null,
          custo:(pr&&pr.p!=null)?q*pr.p:null });
        if(l.custo==null){ l.erro='sem preço de fornecedor cadastrado'; indefinido=true; }
        else custo+=l.custo;
      }
      linhas.push(l);
    }
    /* Regra 4: custo indefinido NUNCA vira zero. Se qualquer linha ficou sem
       preco, o total nao existe — nao e a soma parcial. */
    return { sku, modelo:s.modelo_nome||s.modelo_codigo, largura_cm:s.largura_cm,
      altura_cm:s.altura_cm, cor:s.cor_codigo, linhas,
      custo_material: indefinido ? null : custo,
      // Regra 17: enquanto a mao de obra for zero, o numero se chama assim.
      rotulo:'custo de material',
      incompleto: indefinido };
  }

  app.get('/api/ficha/:sku',(req,res)=> res.json(calcular(req.params.sku)));

  /* Materializa a ficha na `ficha_tecnica`, que e o que a montagem ja le. */
  app.post('/api/ficha/:sku/materializar',(req,res)=>{
    const f=calcular(req.params.sku);
    if(f.erro||f.pendencia) return res.status(400).json(f);
    db.transaction(()=>{
      db.prepare('DELETE FROM ficha_tecnica WHERE sku=?').run(f.sku);
      const ins=db.prepare('INSERT INTO ficha_tecnica (sku,componente_id,quantidade) VALUES (?,?,?)');
      for(const l of f.linhas) if(l.componente_id && l.quantidade!=null) ins.run(f.sku,l.componente_id,l.quantidade);
    })();
    res.json({ok:true, linhas:f.linhas.filter(l=>l.componente_id).length});
  });
};
