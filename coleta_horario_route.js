/* coleta_horario_route.js — as rotas dos horários de saída (spec
 * HORARIOS-DE-COLETA). A conta é toda do `coleta_horario.js`; aqui só a porta.
 *
 *   GET  /api/saidas/dia?data=     o dia (coletas, agência, "sem coleta")   coleta.horario ou pdf.subir
 *   GET  /api/saidas/semana?de=    segunda a sábado                         coleta.horario
 *   GET  /api/saidas/historia?data= quem mudou o quê, e por onde             coleta.horario
 *   POST /api/saidas/dia           lançar ou corrigir o dia                 coleta.horario
 *   GET  /api/saidas/status        o relógio da bancada (fase 2) e as tarefas  quem trabalha na Expedição
 *   POST /api/saidas/conferir      o primeiro upload confere o dia (fase 3)   pdf.subir ou coleta.horario
 *   POST /api/saidas/semana/confirmar  "Confirmar semana" (fase 3)            coleta.horario
 *
 * Toda leitura chama o `garantirSemana`: a semana nasce copiada como rascunho
 * no primeiro pedido de segunda a sábado (R-HCO-12), sem cron.
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
  const sem = () => { try{ D.garantirSemana(db); }catch(e){ console.error('[saidas] cópia da semana:', e.message); } };
  app.get('/api/saidas/dia', (req, res) => responder(res, () => sem() || Object.assign(D.dia(db, String(req.query.data || R.hoje())), { pode_editar: podeEditar(req) })));
  app.get('/api/saidas/semana', (req, res) => responder(res, () => { sem(); const de = String(req.query.de || R.hoje());
    return { hoje:R.hoje(), dias:D.semana(db, de), semana:D.infoSemana(db, de) }; }));
  app.get('/api/saidas/historia', (req, res) => responder(res, () => ({ eventos:D.historia(db, String(req.query.data || R.hoje())) })));
  app.post('/api/saidas/dia', (req, res) => responder(res, () => {
    const b = req.body || {};
    const corpo = {};
    ['coletas', 'agencia', 'sem_coleta', 'motivo', 'motivo_texto'].forEach(k => { if(Object.prototype.hasOwnProperty.call(b, k)) corpo[k] = b[k]; });
    return Object.assign(D.lancar(db, String(b.data || R.hoje()), corpo, QUEM.pessoa(req), b.origem), { pode_editar: podeEditar(req) });
  }));

  app.post('/api/saidas/conferir', (req, res) => responder(res, () => { sem();
    return Object.assign(D.conferir(db, String((req.body || {}).resposta || ''), QUEM.pessoa(req)), { pode_editar: podeEditar(req) }); }));
  app.post('/api/saidas/semana/confirmar', (req, res) => responder(res, () =>
    ({ semana: D.confirmarSemana(db, String((req.body || {}).de || R.hoje()), QUEM.pessoa(req)) })));

  /* O relógio. `em_toda_tela`: quem tem nível Supervisor ou acima vê a faixa
     em qualquer tela (D5); os outros, só nas telas da Expedição. */
  app.get('/api/saidas/status', (req, res) => responder(res, () => {
    let nivel = null;
    try{ const ac = app.locals.acesso; if(ac && ac.nivelDaPessoa && req.usuario) nivel = ac.nivelDaPessoa(req.usuario.id); }catch(e){}
    let ag = false;
    try{ const ac = app.locals.acesso; ag = !!(ac && ac.ehAdminGeral && req.usuario && ac.ehAdminGeral(req.usuario.id)); }catch(e){}
    const NIV = ['operacao', 'supervisor', 'admin', 'admin_geral'];
    const pode = podeEditar(req);
    /* as tarefas são de quem corrige horário; para os outros, nenhuma */
    return Object.assign(D.status(db), { em_toda_tela: ag || NIV.indexOf(nivel) >= 1,
      pode_editar: pode, tarefas: pode ? D.tarefas(db) : [] });
  }));
};
