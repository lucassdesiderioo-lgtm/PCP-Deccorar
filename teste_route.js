module.exports=function(app, db){
  db.exec("CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT)");

  // Tabelas cobertas pelo modo teste.
  // 'pk' e a coluna de chave primaria (o trigger casa por ela); hoje todas usam
  // 'id'. O campo ficou generico por causa da foto_estoque (PK='data'), que foi
  // removida na Fase 3 — o PDF nao gera mais producao, entao a foto perdeu a razao.
  // 'rotulo' e o nome mostrado na tela do admin.
  var TABELAS=[
    {nome:'revisao',      pk:'id',   rotulo:'revisao'},
    {nome:'producao',     pk:'id',   rotulo:'producao'},
    {nome:'montagem',     pk:'id',   rotulo:'embalagem'},
    {nome:'lote',         pk:'id',   rotulo:'expedicao'},
    {nome:'fila',         pk:'id',   rotulo:'fila'},
    {nome:'devolucao',    pk:'id',   rotulo:'devolucoes'},
    {nome:'rejeicao',     pk:'id',   rotulo:'problemas'},
    {nome:'contagem',          pk:'id', rotulo:'contagem'},
    {nome:'contagem_pendente', pk:'id', rotulo:'contagem (aprovacao)'},
    // A contagem de material mexe em componente.estoque, e todo movimento deixa
    // linha aqui (regra 10). Sem esta cobertura, "apagar tudo" apagaria a
    // contagem de teste e deixaria o estoque de materia prima mexido.
    {nome:'movimento_componente', pk:'id', rotulo:'movimento de material'}
  ];

  // Fase 3: foto_estoque saiu da cobertura; limpa o trigger antigo em bancos
  // que ja o tinham (num banco novo o DROP IF EXISTS e no-op).
  try{ db.exec('DROP TRIGGER IF EXISTS trg_teste_foto_estoque'); }catch(e){}

  // Quais tabelas realmente ficaram com trigger. Se alguma falhar (tabela
  // inexistente, coluna faltando), ela NAO e marcada nem limpa — e isso
  // aparece em GET /api/teste em vez de sumir num console.log.
  var COBERTAS=[], FALHOU=[];

  TABELAS.forEach(function(t){
    try{
      var cols=db.prepare('PRAGMA table_info('+t.nome+')').all().map(function(c){return c.name;});
      if(!cols.length) throw new Error('tabela nao existe');
      if(cols.indexOf(t.pk)<0) throw new Error('sem coluna '+t.pk);
      if(cols.indexOf('teste')<0) db.exec('ALTER TABLE '+t.nome+' ADD COLUMN teste INTEGER DEFAULT 0');
      db.exec('DROP TRIGGER IF EXISTS trg_teste_'+t.nome);
      db.exec("CREATE TRIGGER trg_teste_"+t.nome+" AFTER INSERT ON "+t.nome+
              " WHEN (SELECT valor FROM config WHERE chave='modo_teste')='1'"+
              " BEGIN UPDATE "+t.nome+" SET teste=1 WHERE "+t.pk+"=NEW."+t.pk+"; END");
      COBERTAS.push(t);
    }catch(e){
      FALHOU.push({tabela:t.nome,motivo:e.message});
      console.log('[teste] pulei '+t.nome+': '+e.message);
    }
  });

  var get=function(k){ var r=db.prepare('SELECT valor FROM config WHERE chave=?').get(k); return r?r.valor:null; };
  var set=function(k,v){ db.prepare('INSERT INTO config(chave,valor) VALUES(?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor').run(k,String(v)); };
  var conta=function(){
    var o={};
    COBERTAS.forEach(function(t){
      try{ o[t.nome]=db.prepare('SELECT COUNT(*) c FROM '+t.nome+' WHERE teste=1').get().c; }catch(e){ o[t.nome]=0; }
    });
    return o;
  };
  var rotulos=function(){
    var o={};
    COBERTAS.forEach(function(t){ o[t.nome]=t.rotulo; });
    return o;
  };

  app.get('/api/teste',function(req,res){
    res.json({ativo:get('modo_teste')==='1', desde:get('teste_desde')||null,
              itens:conta(), rotulos:rotulos(), naoCobertas:FALHOU});
  });

  app.post('/api/teste/ligar',function(req,res){
    if(get('modo_teste')==='1') return res.json({ok:true,ja:true});
    set('teste_snapshot',JSON.stringify(db.prepare('SELECT codigo,estoque,alvo FROM skus').all()));
    // Foto do material tambem. Apagar as linhas de movimento nao desfaz o saldo
    // — quem guarda o saldo e a coluna componente.estoque, e o custo medio anda
    // junto com ela no recebimento.
    try{ set('teste_snapshot_comp',JSON.stringify(db.prepare('SELECT id,estoque,custo_medio FROM componente').all())); }
    catch(e){ set('teste_snapshot_comp','[]'); }
    set('teste_desde',new Date().toLocaleString('pt-BR'));
    set('modo_teste','1');
    res.json({ok:true,naoCobertas:FALHOU});
  });

  app.post('/api/teste/limpar',function(req,res){
    var snap=[]; try{ snap=JSON.parse(get('teste_snapshot')||'[]'); }catch(e){}
    var snapC=[]; try{ snapC=JSON.parse(get('teste_snapshot_comp')||'[]'); }catch(e){}
    var apagados={};
    db.transaction(function(){
      COBERTAS.forEach(function(t){
        try{ apagados[t.nome]=db.prepare('DELETE FROM '+t.nome+' WHERE teste=1').run().changes; }catch(e){ apagados[t.nome]=0; }
      });
      var up=db.prepare('UPDATE skus SET estoque=?, alvo=? WHERE codigo=?');
      snap.forEach(function(s){ up.run(s.estoque,s.alvo,s.codigo); });
      try{
        var upc=db.prepare('UPDATE componente SET estoque=?, custo_medio=? WHERE id=?');
        snapC.forEach(function(c){ upc.run(c.estoque,c.custo_medio,c.id); });
      }catch(e){}
      set('modo_teste','0');
    })();
    res.json({ok:true,apagados:apagados,rotulos:rotulos(),
              estoqueRestaurado:snap.length,materialRestaurado:snapC.length});
  });

  app.post('/api/teste/manter',function(req,res){
    db.transaction(function(){
      COBERTAS.forEach(function(t){
        try{ db.prepare('UPDATE '+t.nome+' SET teste=0 WHERE teste=1').run(); }catch(e){}
      });
      set('modo_teste','0');
    })();
    res.json({ok:true});
  });
};
