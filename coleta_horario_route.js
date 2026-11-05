/* coleta_horario_route.js — as rotas dos horários de saída (spec
 * HORARIOS-DE-COLETA). A conta é toda do `coleta_horario.js`; aqui só a porta.
 *
 *   GET  /api/saidas/dia?data=     o dia (coletas, agência, "sem coleta")   coleta.horario ou pdf.subir
 *   GET  /api/saidas/semana?de=    segunda a sábado                         coleta.horario
 *   GET  /api/saidas/historia?data= quem mudou o quê, e por onde             coleta.horario
 *   POST /api/saidas/dia           lançar ou corrigir o dia                 coleta.horario
 *   GET  /api/saidas/status        o relógio da bancada (fase 2)            quem trabalha na Expedição
 *
 * Toda escrita passa pelo `quem.js` (`QUEM.portao`): sem login, 401.
 */
const QUEM = require('./quem');
const D = require('./coleta_horario');

module.exports = function(app, db){
  D.garantirSchema(db);
  app = QUEM.portao(app);
  const R = require('./relogio');

  const responder = (res, f) => {
    try{ res.json(f()); }
    catch(e){ if(e && e.status) return res.status(e.status).json({ erro:e.message });
      console.error(e); res.status(500).json({ erro:String(e.message || e) }); }
  };

  /* `pode_editar`: quem é Operação vê o dia (para escolher a saída no upload)
     e não corrige horário; a tela trava os campos, e a rota de gravar recusa. */
  const podeEditar = req => { try{ const ac = app.locals.acesso; return !!(ac && ac.podePermissao && ac.podePermissao(req.usuario, 'coleta.horario')); }catch(e){ return false; } };
  app.get('/api/saidas/dia', (req, res) => responder(res, () => Object.assign(D.dia(db, String(req.query.data || R.hoje())), { pode_editar: podeEditar(req) })));
  app.get('/api/saidas/semana', (req, res) => responder(res, () => ({ hoje:R.hoje(), dias:D.semana(db, String(req.query.de || R.hoje())) })));
  app.get('/api/saidas/historia', (req, res) => responder(res, () => ({ eventos:D.historia(db, String(req.query.data || R.hoje())) })));
  app.post('/api/saidas/dia', (req, res) => responder(res, () => {
    const b = req.body || {};
    const corpo = {};
    ['coletas', 'agencia', 'sem_coleta'].forEach(k => { if(Object.prototype.hasOwnProperty.call(b, k)) corpo[k] = b[k]; });
    return Object.assign(D.lancar(db, String(b.data || R.hoje()), corpo, QUEM.pessoa(req), b.origem), { pode_editar: podeEditar(req) });
  }));

  /* O relógio. `em_toda_tela`: quem tem nível Supervisor ou acima vê a faixa
     em qualquer tela (D5); os outros, só nas telas da Expedição. */
  app.get('/api/saidas/status', (req, res) => responder(res, () => {
    let nivel = null;
    try{ const ac = app.locals.acesso; if(ac && ac.nivelDaPessoa && req.usuario) nivel = ac.nivelDaPessoa(req.usuario.id); }catch(e){}
    let ag = false;
    try{ const ac = app.locals.acesso; ag = !!(ac && ac.ehAdminGeral && req.usuario && ac.ehAdminGeral(req.usuario.id)); }catch(e){}
    const NIV = ['operacao', 'supervisor', 'admin', 'admin_geral'];
    return Object.assign(D.status(db), { em_toda_tela: ag || NIV.indexOf(nivel) >= 1 });
  }));
};
