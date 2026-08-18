/* zerar_route.js — a aba "Zerar" do admin. Fina de proposito: quem decide o que
   cada grupo apaga e o zerar.js, que o CLI usa igual. Aqui so entram as travas
   que existem por ser uma tela: permissao, confirmacao digitada, backup e
   auditoria.

   Permissao: 'sistema.zerar' (admin_geral, ver permissoes.js e acesso.js).
   No modelo antigo cai em API_ADMIN, no auth.js. */
const Z = require('./zerar');

module.exports = function(app, db){
  // previa: quanto cada grupo tem AGORA. A tela mostra isso antes de o operador
  // marcar as caixinhas — numero na frente evita apagar achando que estava vazio.
  app.get('/api/zerar', function(req, res){
    let modoTeste = false;
    try{
      const r = db.prepare("SELECT valor FROM config WHERE chave='modo_teste'").get();
      modoTeste = !!r && r.valor === '1';
    }catch(e){}
    res.json({ grupos: Z.previa(db), padrao: Z.idsPadrao(), modoTeste: modoTeste });
  });

  app.post('/api/zerar', async function(req, res){
    const b = req.body || {};
    // confirmacao digitada, nao um `confirm()` do navegador: e a unica acao do
    // sistema que apaga dado real em massa sem marcacao para voltar atras.
    if(String(b.confirmar || '').trim().toUpperCase() !== 'ZERAR')
      return res.status(400).json({ erro:'confirme digitando ZERAR' });
    const ids = Array.isArray(b.grupos) ? b.grupos : [];
    if(!ids.length) return res.status(400).json({ erro:'escolha o que zerar' });

    // backup ANTES e obrigatorio: falhou o backup, nao zera. O usuario refaz
    // depois de resolver o disco — perder o dado por falta de copia, nunca.
    let backup = null;
    try{ backup = await Z.backupAntes(db); }
    catch(e){ return res.status(500).json({ erro:'nao consegui fazer o backup, nada foi apagado: '+e.message }); }

    let r;
    try{ r = Z.zerar(db, ids); }
    catch(e){ return res.status(400).json({ erro:e.message }); }

    try{
      const ac = app.locals.acesso;
      if(ac && ac.auditar) ac.auditar(req, 'sistema', 'zerar_operacao', ids.join(','),
        Object.keys(r.apagados).map(k => k+'='+r.apagados[k]).join(' ') + ' | backup=' + backup);
    }catch(e){}

    res.json({ ok:true, backup:backup, apagados:r.apagados, rotulos:r.rotulos,
               modoTesteEncerrado:r.modoTesteEncerrado });
  });
};
