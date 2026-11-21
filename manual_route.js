/* manual_route.js — as seis leituras do MANUAL DO SISTEMA (spec
 * docs/specs/MANUAL-DO-SISTEMA.md, §6, fase 1, 21/11/2026).
 *
 *   GET /api/manual/minhas          as fichas das telas que a pessoa opera
 *   GET /api/manual/todas           o manual inteiro — só com `manual.ver_todas` (D8)
 *   GET /api/manual/ficha/:n        a ficha da tela n; `aqui?rota=/operador` acha pela rota (o "?")
 *   GET /api/manual/mapa            as telas (só nome e módulo) e as ligações, marcando as da pessoa
 *   GET /api/manual/glossario       os termos
 *   GET /api/manual/mudancas        as linhas de "Mudanças" das telas da pessoa, 30 dias
 *
 * "ESTA PESSOA OPERA ESTA TELA?" É A CONTA DO PORTÃO, e de mais ninguém (#12):
 * o `abre_tela.js` — o `decidir` do PCP para a medida padrão e o portão do
 * sob medida para as 6xx —, a mesma conta do ☰ Menu e da etiqueta das
 * pendências. Tela que a pessoa não opera volta SÓ nome, módulo e nível (D7):
 * nenhuma seção, nenhuma ação.
 *
 * LEITURA PURA: nenhuma rota de escrita, nenhum INSERT/UPDATE/DELETE. Por isso
 * o módulo não passa pelo `QUEM.portao` (R-ALC-09 vale para escrita) e não lê
 * o nome de quem fez — só pergunta permissão ao `req.usuario`, que é livre.
 *
 * AS FICHAS SÃO LIDAS NO BOOT (§12): editou a ficha, reinicia o servidor. O
 * valor de cada parâmetro, não: ele é lido do `config` a cada pedido, para a
 * ficha dizer o número de hoje sem ninguém mexer em arquivo.
 */
'use strict';
const MAN = require('./manual');
const AT = require('./abre_tela');

module.exports = function(app, db){
  /* lido uma vez, no boot; com problema, o boot avisa e o manual segue com o que leu */
  const L = MAN.lerTudo();
  if(L.erros.length) console.log('[manual] ' + L.erros.length + ' problema(s) ao ler docs/manual/: ' + L.erros.slice(0, 5).join(' · '));
  const probs = MAN.validar(L);
  if(probs.length) console.log('[manual] ' + probs.length + ' ficha(s) fora do formato (rode node teste_manual.js): ' + probs.slice(0, 5).join(' · '));
  const telas = MAN.telasTodas();
  const porN = {}; telas.forEach(t => { porN[t.n] = t; });

  function valorDe(chave){
    try{ const r = db.prepare('SELECT valor FROM config WHERE chave=?').get(chave); return r ? r.valor : null; }catch(e){ return null; }
  }
  /* o que esta pessoa alcança: as telas que opera e se vê todas */
  function pessoa(req){
    const u = req.usuario, ac = app.locals.acesso;
    if(!u || !ac) return null;
    const sm = AT.usuarioSm(ac, u);
    const opera = t => !!t && AT.abre(ac, u, t.rota, sm);
    let ag = false, veTodas = false;
    try{ ag = !!ac.ehAdminGeral(u.id); veTodas = ag || ac.permissoesDe(u.id).has('manual.ver_todas'); }catch(e){}
    return { u, opera, veTodas, ag };
  }
  const ctxDe = p => ({ L, telas, opera: p.opera, valorDe });
  const fichaOuResumo = (p, t) => (p.opera(t) || p.veTodas)
    ? Object.assign(MAN.montar(t.n, ctxDe(p)), { opera: p.opera(t) })
    : MAN.resumo(t);
  const semLogin = res => res.status(401).json({ erro:'sem login' });

  app.get('/api/manual/minhas', (req, res) => {
    const p = pessoa(req); if(!p) return semLogin(res);
    const minhas = telas.filter(p.opera);
    res.json({ fichas: minhas.map(t => Object.assign(MAN.montar(t.n, ctxDe(p)), { opera:true })),
      ver_todas: p.veTodas, modulos: MAN.modulos(), blocos: MAN.blocos() });
  });

  app.get('/api/manual/todas', (req, res) => {
    const p = pessoa(req); if(!p) return semLogin(res);
    if(!p.veTodas) return res.status(403).json({ erro:'ver o manual de todas as telas pede a permissão "Ver o manual de todas as telas"', chave:'manual.ver_todas' });
    res.json({ fichas: telas.map(t => Object.assign(MAN.montar(t.n, ctxDe(p)), { opera: p.opera(t) })),
      ver_todas: true, modulos: MAN.modulos(), blocos: MAN.blocos() });
  });

  app.get('/api/manual/ficha/:n', (req, res) => {
    const p = pessoa(req); if(!p) return semLogin(res);
    const n = String((req.params || {}).n || '');
    const t = n === 'aqui' ? MAN.telaPorRota((req.query || {}).rota) : porN[+n];
    if(!t) return res.status(404).json({ erro:'tela que não existe' });
    res.json(fichaOuResumo(p, t));
  });

  app.get('/api/manual/mapa', (req, res) => {
    const p = pessoa(req); if(!p) return semLogin(res);
    const ligacoes = [];
    telas.forEach(t => (t.liga || []).forEach(x => { if(typeof x === 'number' && porN[x]) ligacoes.push({ de:t.n, para:x }); }));
    res.json({ telas: telas.map(t => ({ n:t.n, nome:t.nome, modulo:t.modulo, bloco:t.bloco, nivel:t.nivel, sobmedida:!!t.sobmedida, opera: p.opera(t),
        situacao: (L.fichas.get(t.n) || {}).situacao || 'sem_ficha' })),
      ligacoes, modulos: MAN.modulos(), blocos: MAN.blocos(), ver_todas: p.veTodas });
  });

  app.get('/api/manual/glossario', (req, res) => {
    const p = pessoa(req); if(!p) return semLogin(res);
    res.json({ termos: L.glossario });
  });

  app.get('/api/manual/mudancas', (req, res) => {
    const p = pessoa(req); if(!p) return semLogin(res);
    const dias = 30;
    res.json({ dias, mudancas: MAN.mudancasRecentes(L, telas.filter(p.opera), dias) });
  });
};
