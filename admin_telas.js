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
const MO = require('./modulos');
const VA = require('./valor');

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
    /* O MENU ÚNICO (spec ORGANIZACAO-DO-SISTEMA, fase 3): cada tela sai com o
       módulo do ASSUNTO e o bloco declarados no mapa, e não mais pela centena
       do número (R-ORG-06, R-ORG-08). Quem decide o que entra continua sendo
       o portão. */
    /* `valor` (R-VAL): as chaves que liberam o dinheiro da tela. O nav.js
       compara com as permissões da própria pessoa e diz, uma vez, que os
       valores em R$ não aparecem para ela — quem TIRA o dinheiro é o servidor. */
    const lista = M.TELAS.filter(t => pode(t.rota)).map(t => ({ n:t.n, nome:t.nome, rota:t.rota, modulo:t.modulo, bloco:t.bloco, aba:t.aba || null, valor:t.valor || [] }));
    /* O SOB MEDIDA TEM PORTÃO PRÓPRIO (tecido/montar.js), e o menu pergunta A
       ELE, pela mesma conta: as chaves do PCP (`permissoesDe`, as que o
       server.js passa ao portão) viram o usuário de lá (`daSessaoDoPcp`), e
       cada tela vale pelo `pode` de lá. ⚠️ NÃO É "TEM A CHAVE sobmedida.X":
       quem está só num setor de bancada recebe a entrada e a bancada PELO
       SETOR (POR_SETOR), sem a chave escrita, e quem tem uma chave solta sem a
       entrada não entra. Com a régua da chave, o menu do bancadista vinha
       vazio — e desde o menu único ele é a navegação do sob medida (③ REVISÃO
       da fase 3, ORGANIZACAO-DO-SISTEMA). */
    /* a conta mora no abre_tela.js, a mesma da etiqueta das pendências */
    try{
      const AT = require('./abre_tela');
      const sm = AT.usuarioSm(ac, u);   // ele só copia o id e o nome; aqui ninguém grava autoria
      if(sm) M.telasSobMedida().forEach(t => {
        if(AT.abreSm(sm, t.rota)) lista.push({ n:t.n, nome:t.nome, rota:t.rota, modulo:t.modulo, bloco:t.bloco, aba:null, valor:t.valor || [] });
      });
    }catch(e){}
    return lista;
  }

  function servirTela(t){
    return (req, res) => {
      if(!req.usuario) return res.redirect('/login?r=' + encodeURIComponent(t.rota));
      let html;
      try{ html = fs.readFileSync(ARQ, 'utf8'); }catch(e){ return res.status(500).send('tela indisponível'); }
      const dado = '<script>window.TELA_ADMIN=' + JSON.stringify({ n:t.n, nome:t.nome, aba:t.aba || (t.cmp ? 'compras' : null), cmp:t.cmp || null, rota:t.rota })
        + ';window.ROTA_DA_ABA=' + JSON.stringify(ROTA_DA_ABA) + ';</script>';
      /* ARRUMAR-O-LUGAR fase 2: a tela que é uma aba da 501 (1101…1302) abre o
         painel de Compras com o `cmp` dela, e o compras_abas.js desenha só ela. */
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

  /* O menu por pessoa (fase 6) le daqui: as telas, o nome de cada modulo e
     as PERMISSOES DA PROPRIA PESSOA — com elas o nav.js esconde o botao de
     acao que ela nao tem (R-TEL-04). Sao as dela, e so as dela. */
  app.get('/api/telas/minhas', (req, res) => {
    const u = req.usuario, ac = app.locals.acesso;
    let perms = [], ag = false, nivelAdmin = false;
    try{ if(u && ac){ ag = !!ac.ehAdminGeral(u.id); perms = Array.from(ac.permissoesDe(u.id)).sort();
      nivelAdmin = ag || !!(ac.ehNivelAdmin && ac.ehNivelAdmin(u.id)); } }catch(e){}
    /* `modulos` é a lista dos 18, NA ORDEM do menu (a da spec, `modulos.js`);
       `blocos`, o nome de cada bloco. O desenho é o `public/menu_telas.js`,
       o mesmo nas duas operações. */
    /* `sem_valor` (R-VAL): a tela tem dinheiro e esta pessoa não vê o valor
       principal dela — a barra diz isso uma vez. Quem decide é o valor.js. */
    const comPerms = new Set(perms);
    const telas = telasDe(u).map(t => Object.assign(t, { sem_valor: VA.semValor(t, comPerms, ag) }));
    /* `nivel_admin`: a pessoa é de nível Admin ou acima — a regra '@admin' das
       ações sem chave (o segundo bipe da 906). É o nível DELA, e só isso. */
    res.json({ telas, rota_da_aba: ROTA_DA_ABA, perms: ag ? [] : perms, admin_geral: ag, nivel_admin: nivelAdmin,
      modulos: MO.MODULOS.map(m => ({ chave:m.chave, nome:m.nome })), blocos: MO.BLOCOS });
  });

  app.locals.telasDe = telasDe;
};
