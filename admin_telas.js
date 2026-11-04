/* O ADMIN VIRA TELAS (spec ACESSO-POR-TELA-E-NIVEL, fase 5, R-TEL-05).
 *
 * Até 04/11/2026 o Admin era uma porta só, `/`, com 16 abas, e qualquer pessoa
 * que entrava via as 16 — a recusa só vinha no clique, como 403. Aba não é
 * unidade de acesso. Hoje cada aba é uma tela do mapa (`telas.js`) com
 * endereço, número e permissão próprios, e quem não alcança uma tela não a vê.
 *
 *   /admin/<tela>   o `index.html` de sempre, servido com `window.TELA_ADMIN`:
 *                   a faixa de abas some, só a carga daquela tela roda, e o
 *                   caminho para outra aba vira o endereço dela.
 *   /, /admin, /index.html   A PORTA: leva cada pessoa à primeira tela do
 *                   Admin que ela alcança — e o link antigo `/admin#dv` à tela
 *                   nova da aba (#dv → /admin/devolucoes). A âncora não chega
 *                   ao servidor, então quem a lê é a página da porta.
 *   /api/telas/minhas   as telas do mapa que a pessoa abre (o menu da fase 6
 *                   e a porta leem daqui). Só número, nome, endereço e módulo.
 *
 * ⚠️ TEM QUE SER REGISTRADO DEPOIS DO `auth` E ANTES DO `express.static`
 * (armadilha #3): o `/index.html` do disco não pode sair por cima da porta.
 * O `express.static` sobe com `index:false` pela mesma razão — sem isso o `/`
 * entregaria as 16 abas direto do disco.
 *
 * Quem tranca continua sendo o `auth.js` + `decidir` (o mapa diz a permissão);
 * este arquivo só monta o que a tela mostra.
 */
const fs = require('fs'), path = require('path');
const M = require('./telas');

module.exports = function(app, db){
  const ARQ = path.join(__dirname, 'public', 'index.html');
  const PORTA = path.join(__dirname, 'views', 'admin_porta.html');
  const ADMIN = M.TELAS.filter(t => t.rota.indexOf('/admin/') === 0);
  const ROTA_DA_ABA = {}; M.TELAS.forEach(t => { if(t.aba) ROTA_DA_ABA[t.aba] = t.rota; });

  /* As telas do mapa que esta pessoa abre — pela MESMA conta do portão
     (`decidir`), e não por uma segunda régua (#12). */
  function telasDe(u){
    const ac = app.locals.acesso;
    if(!u || !ac) return [];
    const pode = r => { try{ return !!ac.decidir(u, r, 'GET').ok; }catch(e){ return false; } };
    const lista = M.TELAS.filter(t => pode(t.rota)).map(t => ({ n:t.n, nome:t.nome, rota:t.rota, modulo:M.moduloDe(t.n), aba:t.aba || null }));
    /* O sob medida tem portão próprio (tecido/montar.js): a tela aparece para
       quem tem a chave `sobmedida.<permissao>` dela — a mesma que o portão
       de lá pergunta ao `permissoesDe`. */
    try{
      const ag = ac.ehAdminGeral(u.id), perms = ac.permissoesDe(u.id);
      M.telasSobMedida().forEach(t => { if(ag || t.perms.some(c => perms.has(c))) lista.push({ n:t.n, nome:t.nome, rota:t.rota, modulo:600, aba:null }); });
    }catch(e){}
    return lista;
  }

  function servirTela(t){
    return (req, res) => {
      if(!req.usuario) return res.redirect('/login?r=' + encodeURIComponent(t.rota));
      let html;
      try{ html = fs.readFileSync(ARQ, 'utf8'); }catch(e){ return res.status(500).send('tela indisponível'); }
      const dado = '<script>window.TELA_ADMIN=' + JSON.stringify({ n:t.n, nome:t.nome, aba:t.aba, rota:t.rota })
        + ';window.ROTA_DA_ABA=' + JSON.stringify(ROTA_DA_ABA) + ';</script>';
      // antes do primeiro <script> da página: tudo abaixo já sabe qual é a tela
      const i = html.indexOf('<script');
      res.type('html').send(i >= 0 ? html.slice(0, i) + dado + html.slice(i) : html + dado);
    };
  }
  ADMIN.forEach(t => app.get(t.rota, servirTela(t)));

  const porta = (req, res) => {
    if(!req.usuario) return res.redirect('/login?r=' + encodeURIComponent(req.originalUrl || '/'));
    res.sendFile(PORTA);
  };
  app.get('/', porta); app.get('/admin', porta); app.get('/index.html', porta);

  app.get('/api/telas/minhas', (req, res) => res.json({ telas: telasDe(req.usuario), rota_da_aba: ROTA_DA_ABA }));

  app.locals.telasDe = telasDe;
};
