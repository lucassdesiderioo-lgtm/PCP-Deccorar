const QUEM = require('./quem');
module.exports=function(app,db){
  /* SEM LOGIN NADA GRAVA (QUEM-FEZ-E-REVISAO fase 7, 05/11/2026): toda escrita
     registrada neste modulo passa pelo quem.js antes do handler — a de amanha
     tambem. */
  app = QUEM.portao(app, { auditar:'cadastro' });   // a linha nao tem autor: quem fez vai na auditoria

  db.exec("CREATE TABLE IF NOT EXISTS listas (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, valor TEXT, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1)");
  db.exec("CREATE TABLE IF NOT EXISTS rejeicao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, motivo TEXT, obs TEXT, segundos INTEGER, modo TEXT, usuario TEXT, data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')), teste INTEGER DEFAULT 0, usuario_id INTEGER)");
  /* QUEM-FEZ-E-REVISAO (04/11/2026): a "Peca com problema" ja gravava o NOME
     em `usuario` (fica, e historia e ha tela lendo); o id entra ao lado. */
  try{ db.exec('ALTER TABLE rejeicao ADD COLUMN usuario_id INTEGER'); }catch(e){}

  const seed=(tipo,vals)=>{
    const n=db.prepare('SELECT COUNT(*) c FROM listas WHERE tipo=?').get(tipo).c;
    if(n>0) return;
    const ins=db.prepare('INSERT INTO listas (tipo,valor,ordem) VALUES (?,?,?)');
    vals.forEach((v,i)=>ins.run(tipo,v,i));
  };
  seed('rejeicao',['Corte de tecido errado','Medida errada','Etiqueta errada','Defeito no tecido','Lado do comando trocado','Outro']);
  seed('motivo_devolucao',['Comprador se arrependeu','Enviado medida ou cor errada','Avaria no transporte','Defeito de fabricacao']);
  /* Motivos do ajuste manual de estoque. Configuraveis como os outros: a lista
     que nasce no codigo envelhece calada, e quando nao tem o motivo certo a
     pessoa escolhe qualquer um — que e o mesmo que nao ter motivo. */
  seed('ajuste_estoque',['Peca quebrada','Peca perdida','Peca encontrada','Correcao de contagem','Correcao de erro do sistema','Outro']);

  /* ⚠️ O `seed()` ACIMA SO GRAVA QUANDO A LISTA ESTA VAZIA — num banco que ja
     existe, valor novo nunca chegaria. O acrescimo e um EVENTO de uma vez so
     (marca em `config`), e so insere o valor que nao existe: quem apagar ou
     desativar um motivo depois nao o ve voltar no boot seguinte. Mesma licao
     do backfill de chave (armadilha #23). Spec DEVOLUCOES-ACOMPANHAMENTO, R12:
     a lista de motivos da baixa e a MESMA dos casos em andamento — duas
     listas partiriam o relatorio em dois. */
  const acrescentar=(marca,tipo,vals)=>{
    try{
      db.exec("CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT)");
      if(db.prepare('SELECT 1 FROM config WHERE chave=?').get(marca)) return;
      db.transaction(()=>{
        const tem=db.prepare('SELECT 1 FROM listas WHERE tipo=? AND valor=?');
        const ins=db.prepare('INSERT INTO listas (tipo,valor,ordem) VALUES (?,?,(SELECT COALESCE(MAX(ordem),-1)+1 FROM listas WHERE tipo=?))');
        vals.forEach(v=>{ if(!tem.get(tipo,v)) ins.run(tipo,v,tipo); });
        db.prepare("INSERT OR IGNORE INTO config (chave,valor) VALUES (?, '1')").run(marca);
      })();
    }catch(e){ console.log('[listas] acrescimo '+marca+' falhou: '+e.message); }
  };
  acrescentar('seed_motivos_devolucao_2','motivo_devolucao',['Falta de kit','Comando quebrado','Chegou amassada']);
  /* Os documentos que a coleta exige antes de "Documentos ao ML" (R11). Lista
     cadastravel, nasce com os dois de hoje, pelo mesmo acrescimo de uma vez so. */
  acrescentar('seed_doc_devolucao_1','doc_devolucao',['Etiqueta de coleta','Comprovante de pagamento da transportadora']);
  /* As categorias de material (COMPRAS-E-RECEBIMENTO R-CMP-04): lista editavel,
     semeada uma vez. Servem para filtrar e para a compra programada — nao
     decidem regra nenhuma. */
  acrescentar('seed_categoria_material_1','categoria_material',require('./material_dominio').CATEGORIAS);

  app.get('/api/listas/:tipo',(req,res)=>
    res.json(db.prepare('SELECT id,valor FROM listas WHERE tipo=? AND ativo=1 ORDER BY ordem,id').all(req.params.tipo)));

  app.post('/api/listas',(req,res)=>{
    const b=req.body||{};
    if(!b.tipo||!b.valor) return res.status(400).json({erro:'faltam dados'});
    const n=db.prepare('SELECT COALESCE(MAX(ordem),0)+1 o FROM listas WHERE tipo=?').get(b.tipo).o;
    db.prepare('INSERT INTO listas (tipo,valor,ordem) VALUES (?,?,?)').run(b.tipo,b.valor.trim(),n);
    res.json({ok:true});
  });

  app.delete('/api/listas/:id',(req,res)=>{
    db.prepare('UPDATE listas SET ativo=0 WHERE id=?').run(req.params.id);
    res.json({ok:true});
  });

  app.post('/api/rejeicao',(req,res)=>{
    const q=require('./quem').exigir(req,res); if(!q) return;
    const b=req.body||{};
    const cod=(b.codigo||'').trim().toUpperCase();
    if(!cod||!b.motivo) return res.status(400).json({erro:'faltam dados'});
    /* A PECA COM PROBLEMA VIRA "MATERIAL EXTRA A DECIDIR" (FICHAS-NO-CADASTRO-UNICO
       §3-G): ela volta para a producao e nao baixa material sozinha; o
       Supervisor diz no fim do dia se precisou de material (tela 106). Na
       mesma transacao: problema registrado sem a linha seria a decisao que
       nunca chega. A peca sob medida do PCP (sem ficha aqui) nao entra. */
    db.transaction(()=>{
      const rid=db.prepare('INSERT INTO rejeicao (codigo,motivo,obs,segundos,modo,usuario,usuario_id) VALUES (?,?,?,?,?,?,?)')
        .run(cod,b.motivo,b.obs||null,Math.round(+b.segundos||0),b.modo||null,q.usuario_nome,q.usuario_id).lastInsertRowid;
      let sm=false;
      try{ const m=db.prepare('SELECT COALESCE(m.sob_medida,0) s FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id WHERE s.codigo=?').get(cod); sm=!!(m&&m.s); }catch(e){ sm=false; }
      /* ⚠️ O MATERIAL EXTRA NAO TRAVA A BANCADA (#6): num ponto de salvamento
         proprio; falhou (banco sem a tabela, ficha que estoura), vai ao log e a
         peca com problema fica registrada do mesmo jeito. */
      if(!sm) try{ db.transaction(()=>require('./material_extra_dominio').registrarRevisao(db,{sku:cod, referencia:'rejeicao:'+rid,
        motivo:b.motivo+(b.obs?' — '+b.obs:''), quem:{id:q.usuario_id, nome:q.usuario_nome}}))(); }
      catch(e){ console.error('[rejeicao] o material extra de '+cod+' nao gravou (a peca com problema ficou registrada):', e.message); }
    })();
    res.json({ok:true});
  });

  app.get('/api/rejeicao/resumo',(req,res)=>{
    const de=req.query.de||null, ate=req.query.ate||null;
    let w='1=1', p=[];
    if(de){ w+=" AND data>=?"; p.push(de); }
    if(ate){ w+=" AND data<=?"; p.push(ate); }
    res.json({
      porMotivo: db.prepare('SELECT motivo, COUNT(*) qtd FROM rejeicao WHERE '+w+' GROUP BY motivo ORDER BY qtd DESC').all(...p),
      porSku: db.prepare('SELECT codigo, COUNT(*) qtd FROM rejeicao WHERE '+w+' GROUP BY codigo ORDER BY qtd DESC LIMIT 15').all(...p),
      lista: db.prepare('SELECT * FROM rejeicao WHERE '+w+' ORDER BY id DESC LIMIT 100').all(...p),
      total: db.prepare('SELECT COUNT(*) c FROM rejeicao WHERE '+w).get(...p).c
    });
  });
};
