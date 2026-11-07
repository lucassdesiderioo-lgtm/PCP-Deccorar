/* Recebimento — COMPRAS.md §8, fase 5.
 *
 * Quem pede nao e quem confere. E o controle mais basico de compras, e sai de
 * graca porque o controle de acesso ja existe:
 *
 *   Recebimento (operacao)  ve item e quantidade, SEM PRECO. Confere e devolve.
 *   Comprador   (admin)     lanca o preco da nota e resolve divergencia.
 *
 * Regra 14 do §13: quem recebe nao ve preco em NENHUMA tela e em NENHUM PDF.
 * Quem confere quantidade vendo valor tende a confirmar o que esta escrito, e a
 * separacao entre quem pede e quem confere perde o sentido. Por isso a rota que
 * o Recebimento usa monta o JSON sem os campos de preco — nao adianta esconder
 * na tela e mandar pelo fio.
 *
 * O estoque so entra por componente_dominio.js (regra 10).
 */
const DOM = require('./componente_dominio');
const CUSTO = require('./custo_dominio');

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
  const num = v => { const n=parseFloat(String(v==null?'':v).replace(',','.')); return Number.isFinite(n)?n:null; };

  /* ── A FILA E O RECEBER (COMPRAS-E-RECEBIMENTO fase 3) ─────────────────────
     O recebimento_dominio.js e o dono: a fila sem preco e sem o esperado
     (contagem cega), os tres modos, a pesagem cega da compra por kg, as reguas,
     as faixas e a retencao. As rotas ficam aqui, no mesmo lugar e na mesma
     ordem de registro de sempre. */
  const RD = require('./recebimento_dominio');
  app.get('/api/recebimento/aguardando',(req,res)=> res.json(RD.fila(db)));
  app.post('/api/recebimento',(req,res)=>{
    let r;
    try{ r=RD.receber(db, req.body||{}, QUEM.pessoa(req)); }
    catch(e){ if(e instanceof RD.Recusa) return res.status(e.status).json({erro:e.message}); throw e; }
    auditar(req,'recebimento','pedido '+(req.body||{}).pedido_id, r.entradas+' entrada(s)'+(r.retidos?', '+r.retidos+' retido(s)':'')+(r.avisos?', '+r.avisos+' aviso(s)':''));
    res.json(Object.assign({ok:true}, r));
  });

  /* ── PRECO DA NOTA — so o Comprador (§6) ─────────────────────────────────────
     "O preco real e o que foi cobrado, nao o que estava na tabela." Lanca a
     divergencia, escreve o historico com fonte='compra', ATUALIZA o preco
     vigente da oferta e corrige o custo medio. */
  app.post('/api/recebimento/:id/preco',(req,res)=>{
    const b=req.body||{};
    const rec=db.prepare(`SELECT r.*, p.numero FROM recebimento r
      JOIN pedido_compra p ON p.id=r.pedido_id WHERE r.id=?`).get(req.params.id);
    if(!rec) return res.status(404).json({erro:'recebimento não encontrado'});
    const itens=Array.isArray(b.itens)?b.itens:[];
    if(!itens.length) return res.status(400).json({erro:'informe os preços da nota'});

    const mudancas=[];
    db.transaction(()=>{
      for(const it of itens){
        const preco=num(it.preco_pago);
        if(preco==null||preco<0) continue;
        const ri=db.prepare(`SELECT ri.*, pi.oferta_id, pi.componente_id, pi.preco_unit, pi.fator,
            COALESCE(c.nome, pi.sku) item
          FROM recebimento_item ri JOIN pedido_item pi ON pi.id=ri.pedido_item_id
          LEFT JOIN componente c ON c.id=pi.componente_id
          WHERE ri.id=? AND ri.recebimento_id=?`).get(it.recebimento_item_id, rec.id);
        if(!ri) continue;
        const antigo=ri.preco_unit;
        db.prepare('UPDATE recebimento_item SET preco_pago=?, divergencia=? WHERE id=?')
          .run(preco, preco!==antigo ? (ri.divergencia==='quantidade'?'ambos':'preco') : ri.divergencia, ri.id);
        db.prepare('UPDATE pedido_item SET preco_pago=? WHERE id=?').run(preco, ri.pedido_item_id);
        if(preco===antigo) continue;

        if(ri.oferta_id){
          db.prepare(`INSERT INTO preco_historico (oferta_id,preco_antigo,preco_novo,variacao_pct,fonte,referencia,usuario_nome,usuario_id)
            VALUES (?,?,?,?,'compra',?,?,?)`).run(ri.oferta_id, antigo, preco,
              antigo>0 ? (preco-antigo)/antigo*100 : null, rec.numero, usuario(req), QUEM.idDe(req));
          db.prepare(`UPDATE oferta SET preco=?, atualizado_em=datetime('now','localtime'),
            atualizado_por=?, atualizado_por_id=? WHERE id=?`).run(preco, usuario(req), QUEM.idDe(req), ri.oferta_id);
        }
        if(ri.componente_id && ri.qtd_consumo>0)
          DOM.corrigirCustoPago(db,{ componente_id:ri.componente_id, quantidade:ri.qtd_consumo,
            custo_antigo:antigo/(ri.fator||1), custo_novo:preco/(ri.fator||1) });

        mudancas.push({ item:ri.item, componente_id:ri.componente_id, de:antigo, para:preco,
          variacao_pct: antigo>0 ? (preco-antigo)/antigo*100 : null });
      }
    })();
    /* O preco pago virou o preco vigente -> o custo dos SKUs que usam o item
       mudou. Fora da transacao: historico nunca derruba o lancamento da nota. */
    try{ for(const m of mudancas) if(m.componente_id)
      CUSTO.porComponente(db, m.componente_id, 'preço pago na nota '+(rec.nota_fiscal||rec.numero),
        {usuario_nome:usuario(req), usuario_id:QUEM.idDe(req), referencia:rec.numero}); }catch(e){}
    for(const m of mudancas)
      auditar(req,'divergencia_de_preco',rec.numero,
        m.item+': R$ '+m.de.toFixed(2)+' -> R$ '+m.para.toFixed(2)
        +(m.variacao_pct!=null?' ('+m.variacao_pct.toFixed(1)+'%)':''));
    res.json({ok:true, mudancas});
  });

  /* ── FECHAR PARCIAL (§8) ─────────────────────────────────────────────────────
     "O pedido parcial so fecha quando alguem fecha, com um dos dois motivos."
     Se o fornecedor nao vai entregar, o saldo volta para a necessidade na mesma
     hora — e por isso o item vira 'cancelado' e para de contar como a caminho. */
  app.post('/api/pedidos/:id/fechar',(req,res)=>{
    const motivo=((req.body&&req.body.motivo)||'').trim();
    const OK=['restante chegou','fornecedor não vai entregar'];
    if(OK.indexOf(motivo)<0)
      return res.status(400).json({erro:'o motivo tem que ser um dos dois: '+OK.join(' | ')});
    const p=db.prepare('SELECT numero,status FROM pedido_compra WHERE id=?').get(req.params.id);
    if(!p) return res.status(404).json({erro:'pedido não encontrado'});
    if(p.status!=='parcial') return res.status(400).json({erro:'só pedido parcial se fecha assim'});
    db.transaction(()=>{
      db.prepare(`UPDATE pedido_compra SET status='recebido',
        fechado_em=datetime('now','localtime'), motivo_fecho=? WHERE id=?`).run(motivo,req.params.id);
      db.prepare(`UPDATE pedido_item SET status=? WHERE pedido_id=? AND status IN ('aberto','parcial')`)
        .run(motivo===OK[0]?'recebido':'cancelado', req.params.id);
    })();
    auditar(req,'pedido_parcial_fechado',p.numero,motivo);
    res.json({ok:true});
  });

  /* Pedidos parciais esquecidos seguram quantidade no "a caminho" para sempre, e
     o sistema para de mandar comprar um item que esta faltando. Um lembrete,
     nunca um fechamento automatico (§8). */
  app.get('/api/pedidos/zumbis',(req,res)=>
    res.json(db.prepare(`SELECT p.id,p.numero,f.nome fornecedor,p.enviado_em,
        CAST(julianday('now') - julianday(p.enviado_em) AS INTEGER) dias
      FROM pedido_compra p LEFT JOIN fornecedor f ON f.id=p.fornecedor_id
      WHERE p.status='parcial' AND p.enviado_em IS NOT NULL
        AND julianday('now') - julianday(p.enviado_em) > 30
      ORDER BY p.enviado_em`).all()));

  /* Qual fornecedor entrega errado — relatorio que hoje nao existe, e que sai de
     graca porque a devolucao fica registrada com motivo e fornecedor (§8). */
  app.get('/api/recebimento/devolucoes',(req,res)=>
    res.json(db.prepare(`SELECT f.nome fornecedor, ri.motivo_devolucao motivo,
        COUNT(*) vezes, SUM(ri.qtd_devolvida) qtd
      FROM recebimento_item ri
      JOIN recebimento r ON r.id=ri.recebimento_id
      JOIN pedido_compra p ON p.id=r.pedido_id
      LEFT JOIN fornecedor f ON f.id=p.fornecedor_id
      WHERE ri.qtd_devolvida > 0
      GROUP BY f.nome, ri.motivo_devolucao ORDER BY vezes DESC`).all()));
};
