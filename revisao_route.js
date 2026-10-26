/* revisao_route.js — POST /api/revisao: registra o tempo da revisao e joga a
 * peca na fila de embalagem.
 *
 * ARMADILHA #1 (CLAUDE.md §2): revisar NAO mexe no estoque. A peca revisada
 * ainda nao esta pronta — falta embalar e conferir o kit. Ela vira +1 so na
 * embalagem (mont_route.js). Nao "conserte" isto.
 *
 * ARMADILHA #2: a resposta ainda traz `estoque`, `pedido` e `feito`. E resquicio
 * da versao em que a revisao somava estoque; a tela nao usa.
 *
 * Saiu do server.js em 20/10/2026 sem mudar uma linha, so para ter o
 * teste_revisao.js atras: o server.js abre porta e banco real.
 */
/* QUEM REVISOU (fase 4 da ACESSOS-UNIFICADOS, divida 9, 26/10/2026): a
   linha grava o id e o NOME de quem bipou — o nome como retrato, porque a
   pessoa pode mudar de nome no cadastro e a revisao de ontem continua sendo
   de quem era. As colunas nascem no CREATE do db.js; o ALTER guardado fica
   AQUI tambem porque e esta rota que grava nelas, e um banco que subiu sem
   o db.js (um teste, um script) estouraria no primeiro bipe. */
function garantirColunas(db){
  for(const c of ['usuario_id INTEGER','usuario_nome TEXT'])
    try{ db.exec('ALTER TABLE revisao ADD COLUMN '+c); }catch(e){}
}

module.exports=function(app,db){
  garantirColunas(db);
  app.post('/api/revisao',(req,res)=>{
    const {codigo,segundos=0,inicio=null,fim=null}=req.body||{};
    if(!codigo) return res.status(400).json({erro:'codigo'});
    const cod=codigo.trim().toUpperCase();
    if(!db.prepare('SELECT 1 FROM skus WHERE codigo=?').get(cod)) return res.status(404).json({erro:'SKU não cadastrado: '+cod});
    db.transaction(()=>{
      const u=req.usuario||{};
      db.prepare('INSERT INTO revisao (codigo,inicio,fim,segundos,usuario_id,usuario_nome) VALUES (?,?,?,?,?,?)')
        .run(cod,inicio,fim,Math.round(+segundos||0),u.id!=null?u.id:null,u.nome||null);
      const modo=(req.body&&req.body.modo)==='estoque'?'estoque':'hoje';
      db.prepare(`UPDATE revisao SET modo=? WHERE id=(SELECT MAX(id) FROM revisao)`).run(modo);
      db.prepare('INSERT INTO fila (codigo,modo) VALUES (?,?)').run(cod,modo);
    })();
    const est=db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(cod);
    const prog=db.prepare(`SELECT COALESCE(SUM(qtd),0) pedido, COALESCE(SUM(produzido),0) feito FROM producao WHERE codigo=? AND data=date('now','localtime')`).get(cod);
    res.json({ok:true,codigo:cod,estoque:est?est.estoque:null,pedido:prog.pedido,feito:prog.feito});
  });
};
