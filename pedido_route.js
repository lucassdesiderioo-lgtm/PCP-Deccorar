/* Pedido de compra — COMPRAS.md §8, fase 4.
 *
 * Fecha o ciclo da decisao: a lista diz o que falta, a comparacao diz de quem
 * comprar, e aqui isso vira um pedido por fornecedor.
 *
 * Duas regras do §13 mandam neste arquivo:
 *   9  — o pedido CONGELA embalagem, fator e preco no momento em que e criado.
 *        Se o preco do cadastro mudar amanha, o que foi pedido hoje nao muda.
 *   11 — escolher fora do melhor preco EXIGE motivo, e o motivo vai para a
 *        auditoria. Nao e burocracia: e a unica forma de, tres meses depois,
 *        saber por que se pagou mais caro naquele dia.
 *
 * Sem aprovacao por valor — decisao explicita do §8. Quem compra, compra.
 */
const CALC = require('./compras_calc');
const D = require('./compra_dominio');

const QUEM = require('./quem');
module.exports = function(app, db){
  /* SEM LOGIN NADA GRAVA (QUEM-FEZ-E-REVISAO fase 7, 05/11/2026): toda escrita
     registrada neste modulo passa pelo quem.js antes do handler — a de amanha
     tambem. */
  app = QUEM.portao(app);


  const usuario = req => QUEM.nomeDe(req) || null;   // quem fez: do quem.js
  const auditar = (req,acao,alvo,det) => {
    try{ const ac=app.locals.acesso; if(ac&&ac.auditar) ac.auditar(req,'compras',acao,alvo,det); }catch(e){}
  };

  function proximoNumero(){
    const r=db.prepare("SELECT numero FROM pedido_compra WHERE numero LIKE 'PC-%' ORDER BY id DESC LIMIT 1").get();
    const n=r ? (parseInt(String(r.numero).replace(/\D/g,''),10)||0)+1 : 1;
    return 'PC-' + String(n).padStart(6,'0');
  }

  /* ── CRIAR ───────────────────────────────────────────────────────────────────
     Recebe itens já escolhidos: {oferta_id, necessidade, motivo_escolha}.
     A quantidade em embalagens é recalculada aqui, não vem do cliente — quem
     sabe subir para o múltiplo e respeitar o mínimo é o compras_calc. */
  app.post('/api/pedidos',(req,res)=>{
    const b=req.body||{};
    const itens=Array.isArray(b.itens)?b.itens:[];
    if(!itens.length) return res.status(400).json({erro:'o pedido está vazio'});

    const prep=[];
    for(const it of itens){
      const o=db.prepare(`SELECT o.*, f.nome fornecedor_nome, f.id fid, f.frete_padrao
        FROM oferta o JOIN fornecedor f ON f.id=o.fornecedor_id
        WHERE o.id=? AND o.ativo=1 AND f.ativo=1`).get(it.oferta_id);
      if(!o) return res.status(400).json({erro:'oferta '+it.oferta_id+' não existe ou está inativa'});
      const N=parseFloat(String(it.necessidade||'').replace(',','.'));
      if(!Number.isFinite(N)||N<=0) return res.status(400).json({erro:'quantidade inválida em '+(o.embalagem||'')});
      /* COMPRA POR KG COM QUANTIDADE DECLARADA (COMPRAS-E-RECEBIMENTO R-CMP-18):
         o item guarda a unidade em que se comprou, a quantidade e o preco
         nela, e o que o fornecedor declara na unidade da casa. O pedido vale
         qtd_compra x preco; o "a caminho" e o declarado. */
      let kg=null;
      if(it.qtd_compra!=null && it.qtd_compra!==''){
        const qc=parseFloat(String(it.qtd_compra).replace(',','.')), pu=parseFloat(String(it.preco_unid_compra).replace(',','.'));
        const qd=(it.qtd_declarada==null||it.qtd_declarada==='')?null:parseFloat(String(it.qtd_declarada).replace(',','.'));
        const un=String(it.unidade_compra||'').trim();
        if(!un) return res.status(400).json({erro:'diga a unidade de compra (kg, un, m, cx…) de '+o.embalagem});
        if(!Number.isFinite(qc)||qc<=0) return res.status(400).json({erro:'a quantidade de compra tem que ser maior que zero em '+o.embalagem});
        if(!Number.isFinite(pu)||pu<0) return res.status(400).json({erro:'o preço por '+un+' tem que ser um número maior ou igual a zero'});
        if(qd!==null && !(Number.isFinite(qd)&&qd>0)) return res.status(400).json({erro:'a quantidade declarada tem que ser maior que zero'});
        kg={un, qc, pu, qd};
      }
      prep.push({ oferta:o, calc:CALC.avaliarOferta(o,N), motivo:(it.motivo_escolha||'').trim()||null, kg });
    }
    /* Um pedido POR FORNECEDOR. Itens de fornecedores diferentes viram pedidos
       diferentes na mesma chamada — e o que a tela faz ao "gerar por fornecedor". */
    const grupos={};
    for(const p of prep){ (grupos[p.oferta.fid]=grupos[p.oferta.fid]||[]).push(p); }

    const criados=[];
    db.transaction(()=>{
      for(const fid in grupos){
        const lista=grupos[fid];
        const forn=db.prepare('SELECT nome, frete_padrao, pedido_minimo FROM fornecedor WHERE id=?').get(fid);
        const frete=+(b.frete!=null?b.frete:forn.frete_padrao)||0;
        const valor=lista.reduce((s,p)=>s+(p.kg ? p.kg.qc*p.kg.pu : p.calc.embalagens*p.calc.preco_embalagem),0)+frete;
        const numero=proximoNumero();
        const r=db.prepare(`INSERT INTO pedido_compra (numero,fornecedor_id,valor_previsto,frete,observacao,criado_por,criado_por_id)
          VALUES (?,?,?,?,?,?,?)`).run(numero,+fid,valor,frete,(b.observacao||'').trim()||null,usuario(req),QUEM.idDe(req));
        const ins=db.prepare(`INSERT INTO pedido_item (pedido_id,oferta_id,componente_id,sku,embalagem,fator,
          preco_unit,qtd_embalagem,qtd_consumo,motivo_escolha,unidade_compra,qtd_compra,preco_unid_compra,qtd_declarada)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        for(const p of lista){
          if(p.kg){
            /* fator = unidades da casa por unidade de compra, pelo DECLARADO;
               sem declarado, o fator da oferta. */
            const fator = p.kg.qd ? p.kg.qd/p.kg.qc : (p.oferta.fator||1);
            ins.run(r.lastInsertRowid, p.oferta.id, p.oferta.componente_id, p.oferta.sku,
              p.oferta.embalagem, fator, p.kg.pu, p.kg.qc, p.kg.qd!=null ? p.kg.qd : p.kg.qc*fator, p.motivo,
              p.kg.un, p.kg.qc, p.kg.pu, p.kg.qd);
          }else ins.run(r.lastInsertRowid, p.oferta.id, p.oferta.componente_id, p.oferta.sku,
            p.oferta.embalagem, p.oferta.fator, p.oferta.preco,
            p.calc.embalagens, p.calc.qtd_comprada, p.motivo, null, null, null, null);
        }
        criados.push({id:r.lastInsertRowid, numero, fornecedor:forn.nome, itens:lista.length, valor});
        auditar(req,'pedido_criado',numero,forn.nome+' · R$ '+valor.toFixed(2)+' · '+lista.length+' item(ns)');
        for(const p of lista) if(p.motivo)
          auditar(req,'escolha_fora_do_melhor_preco',numero,
            (p.oferta.fornecedor_nome||'')+' · '+p.oferta.embalagem+' · motivo: '+p.motivo);
      }
    })();
    res.json({ok:true, pedidos:criados});
  });

  /* ── LER ─────────────────────────────────────────────────────────────────── */
  app.get('/api/pedidos',(req,res)=>{
    const w=[], p=[];
    if(req.query.status){ w.push('p.status=?'); p.push(req.query.status); }
    if(req.query.abertos==='1'){ w.push("p.status IN ('rascunho','aguardando_aprovacao','comprado','parcial')"); }
    res.json(db.prepare(`SELECT p.*, f.nome fornecedor_nome,
        (SELECT COUNT(*) FROM pedido_item i WHERE i.pedido_id=p.id) itens
      FROM pedido_compra p LEFT JOIN fornecedor f ON f.id=p.fornecedor_id
      ${w.length?'WHERE '+w.join(' AND '):''} ORDER BY p.id DESC LIMIT 200`).all(...p));
  });

  function pedidoCompleto(id){
    const p=db.prepare(`SELECT p.*, f.nome fornecedor_nome, f.telefone, f.whatsapp, f.email,
        f.contato, f.pagamento, f.prazo_entrega
      FROM pedido_compra p LEFT JOIN fornecedor f ON f.id=p.fornecedor_id WHERE p.id=?`).get(id);
    if(!p) return null;
    p.itens=db.prepare(`SELECT i.*, COALESCE(c.nome, i.sku) item, c.unidade, o.codigo_fornec
      FROM pedido_item i LEFT JOIN componente c ON c.id=i.componente_id
      LEFT JOIN oferta o ON o.id=i.oferta_id
      WHERE i.pedido_id=? ORDER BY i.id`).all(id);
    /* Frete rateado por valor entre os itens do pedido — o segundo momento do
       rateio do §5, agora que o pedido inteiro existe. */
    p.itens=CALC.ratearFrete(p.itens.map(i=>Object.assign({},i,{
      desembolso:i.qtd_embalagem*i.preco_unit, qtd_comprada:i.qtd_consumo })), p.frete||0);
    return p;
  }
  const pode=(req,chave)=>{ try{ return !!app.locals.acesso.podePermissao(req.usuario,chave); }catch(e){ return false; } };
  app.get('/api/pedidos/:id',(req,res)=>{
    const p=pedidoCompleto(+req.params.id);
    if(!p) return res.status(404).json({erro:'pedido não encontrado'});
    /* AS PARCELAS SO VIAJAM A QUEM TEM custo.ver, nota.lancar OU pedido.pagar
       (COMPRAS-E-RECEBIMENTO R-CMP-27): a poda e no JSON, nao na tela. */
    if(pode(req,'custo.ver')||pode(req,'nota.lancar')||pode(req,'pedido.pagar')) p.parcelas=D.parcelasDe(db,p.id);
    const a=D.alcadaDe(db,p.criado_por_id);
    p.alcada=a?{limite:a.limite, aprovador_id:a.aprovador_id}:null;
    try{ p.anexos=db.prepare('SELECT id,tipo,nome,criado_em,criado_por FROM compra_anexo WHERE pedido_id=? ORDER BY id').all(p.id); }catch(e){ p.anexos=[]; }
    res.json(p);
  });

  /* ── TEXTO DE WHATSAPP ───────────────────────────────────────────────────────
     §8: "texto pronto para colar no WhatsApp, que e como a maior parte dos
     fornecedores pequenos realmente recebe pedido". Envio por e-mail direto do
     servidor exige configuracao e nao destrava nada hoje. */
  app.get('/api/pedidos/:id/whatsapp',(req,res)=>{
    const p=pedidoCompleto(+req.params.id);
    if(!p) return res.status(404).json({erro:'pedido não encontrado'});
    const l=[];
    l.push('*Pedido ' + p.numero + '* — Deccorar');
    if(p.contato) l.push('A/C ' + p.contato);
    l.push('');
    for(const i of p.itens){
      const un=i.unidade==='m'?'m':'un';
      l.push('• ' + i.item + (i.codigo_fornec?' (ref. '+i.codigo_fornec+')':''));
      l.push('   ' + (+i.qtd_embalagem) + ' × ' + i.embalagem
             + '  =  ' + (+i.qtd_consumo) + ' ' + un);
    }
    l.push('');
    l.push('Total: R$ ' + (p.valor_previsto||0).toFixed(2).replace('.',','));
    if(p.frete>0) l.push('(frete de R$ ' + p.frete.toFixed(2).replace('.',',') + ' incluso)');
    if(p.pagamento) l.push('Pagamento: ' + p.pagamento);
    if(p.observacao) { l.push(''); l.push(p.observacao); }
    res.json({ texto:l.join('\n'), whatsapp:p.whatsapp||p.telefone||null, numero:p.numero });
  });

  /* ── ENVIAR / CANCELAR ───────────────────────────────────────────────────── */
  /* O STATUS `enviado` VIROU `comprado` (COMPRAS-E-RECEBIMENTO R-CMP-15/16):
     "comprado" exige canal, numero do pedido no fornecedor e data, e passa pela
     alcada — e isso e o POST /api/pedidos/:id/comprar (compra_route.js). Esta
     rota fica para a tela antiga num tablet com cache, e diz o caminho. */
  app.post('/api/pedidos/:id/enviar',(req,res)=>
    res.status(400).json({erro:'o pedido agora passa para "comprado", com o canal, o número do pedido no fornecedor e a data da compra — use "Comprado" na tela de Pedidos'}));

  app.post('/api/pedidos/:id/cancelar',(req,res)=>{
    const motivo=((req.body&&req.body.motivo)||'').trim();
    if(!motivo) return res.status(400).json({erro:'diga por que está cancelando — vai para a auditoria'});
    const p=db.prepare('SELECT numero,status FROM pedido_compra WHERE id=?').get(req.params.id);
    if(!p) return res.status(404).json({erro:'pedido não encontrado'});
    if(p.status==='recebido') return res.status(400).json({erro:'pedido já recebido não se cancela'});
    if(p.status==='cancelado') return res.status(409).json({erro:'este pedido já está cancelado'});
    db.transaction(()=>{
      db.prepare(`UPDATE pedido_compra SET status='cancelado',
        fechado_em=datetime('now','localtime'), motivo_fecho=? WHERE id=?`).run(motivo,req.params.id);
      db.prepare("UPDATE pedido_item SET status='cancelado' WHERE pedido_id=?").run(req.params.id);
    })();
    auditar(req,'pedido_cancelado',p.numero,motivo);
    res.json({ok:true});
  });

  /* §8: marca de pago. NAO e contas a pagar — sem vencimento, sem fluxo de
     caixa, sem conciliacao. Existe para o ciclo fechar e para o papel Financeiro
     ter o que fazer desde o primeiro dia. */
  app.post('/api/pedidos/:id/pagar',(req,res)=>{
    const p=db.prepare('SELECT numero FROM pedido_compra WHERE id=?').get(req.params.id);
    if(!p) return res.status(404).json({erro:'pedido não encontrado'});
    /* O pago virou DERIVADO das parcelas (R-CMP-19): sem parcela, este botao
       grava uma parcela paga do valor do pedido; com parcelas, paga as abertas. */
    D.pagarTudo(db, req.params.id, QUEM.pessoa(req));
    auditar(req,'pedido_pago',p.numero,'');
    res.json({ok:true});
  });
};
