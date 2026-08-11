module.exports=function(app, db){
  db.exec("CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT)");
  ['revisao','producao','montagem','lote'].forEach(function(t){
    try{
      var cols=db.prepare('PRAGMA table_info('+t+')').all().map(function(c){return c.name;});
      if(cols.indexOf('teste')<0) db.exec('ALTER TABLE '+t+' ADD COLUMN teste INTEGER DEFAULT 0');
      db.exec('DROP TRIGGER IF EXISTS trg_teste_'+t);
      db.exec("CREATE TRIGGER trg_teste_"+t+" AFTER INSERT ON "+t+
              " WHEN (SELECT valor FROM config WHERE chave='modo_teste')='1'"+
              " BEGIN UPDATE "+t+" SET teste=1 WHERE id=NEW.id; END");
    }catch(e){ console.log('[teste] pulei '+t+': '+e.message); }
  });

  var get=function(k){ var r=db.prepare('SELECT valor FROM config WHERE chave=?').get(k); return r?r.valor:null; };
  var set=function(k,v){ db.prepare('INSERT INTO config(chave,valor) VALUES(?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor').run(k,String(v)); };
  var conta=function(){
    var o={};
    ['revisao','producao','montagem','lote'].forEach(function(t){
      try{ o[t]=db.prepare('SELECT COUNT(*) c FROM '+t+' WHERE teste=1').get().c; }catch(e){ o[t]=0; }
    });
    return o;
  };

  app.get('/api/teste',function(req,res){
    res.json({ativo:get('modo_teste')==='1', desde:get('teste_desde')||null, itens:conta()});
  });

  app.post('/api/teste/ligar',function(req,res){
    if(get('modo_teste')==='1') return res.json({ok:true,ja:true});
    set('teste_snapshot',JSON.stringify(db.prepare('SELECT codigo,estoque,alvo FROM skus').all()));
    set('teste_desde',new Date().toLocaleString('pt-BR'));
    set('modo_teste','1');
    res.json({ok:true});
  });

  app.post('/api/teste/limpar',function(req,res){
    var snap=[]; try{ snap=JSON.parse(get('teste_snapshot')||'[]'); }catch(e){}
    var apagados={};
    db.transaction(function(){
      ['revisao','producao','montagem','lote'].forEach(function(t){
        try{ apagados[t]=db.prepare('DELETE FROM '+t+' WHERE teste=1').run().changes; }catch(e){ apagados[t]=0; }
      });
      var up=db.prepare('UPDATE skus SET estoque=?, alvo=? WHERE codigo=?');
      snap.forEach(function(s){ up.run(s.estoque,s.alvo,s.codigo); });
      set('modo_teste','0');
    })();
    res.json({ok:true,apagados:apagados,estoqueRestaurado:snap.length});
  });

  app.post('/api/teste/manter',function(req,res){
    db.transaction(function(){
      ['revisao','producao','montagem','lote'].forEach(function(t){
        try{ db.prepare('UPDATE '+t+' SET teste=0 WHERE teste=1').run(); }catch(e){}
      });
      set('modo_teste','0');
    })();
    res.json({ok:true});
  });
};
