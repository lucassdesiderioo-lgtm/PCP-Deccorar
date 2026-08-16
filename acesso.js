/* Controle de Acesso — FASE 1 (docs/CONTROLE-DE-ACESSO.md, secao 13).
 *
 * NAO altera comportamento nenhum. O modelo ANTIGO (auth.js, por area) continua
 * decidindo todo o acesso. Este modulo so:
 *   1. cria as tabelas novas (secao 10);
 *   2. sincroniza o registro permissoes.js -> tabela `permissoes`;
 *   3. semeia os setores nativos (secao 5);
 *   4. MIGRA os usuarios atuais (usuarios.areas -> setores), em transacao e a
 *      prova de falha — se der erro, o modelo antigo segue funcionando e
 *      ninguem fica sem acesso (a coluna `areas` nunca e tocada);
 *   5. roda o modelo NOVO em paralelo e REGISTRA as DIVERGENCIAS (matriz
 *      usuario x area) para conferencia antes da troca (Fase 3).
 *
 * auth.js fica intocado de proposito: assim o modelo antigo e o teste de
 * seguranca da secao 10 sao garantidamente identicos.
 */
const PERMISSOES = require('./permissoes');

// Modelo antigo (area) -> permissao equivalente no modelo novo, para comparar
// a MESMA tela nos dois modelos. A area 'admin' fica de fora: e o hub do admin,
// sem uma permissao unica que a represente.
const AREA_CHAVE = {
  operador:     'revisao.executar',
  montagem:     'embalagem.executar',
  embalagem:    'etiqueta.emitir',
  carregamento: 'carregamento.executar',
  expedicao:    'pdf.subir',
  devolucao:    'devolucao.registrar',
  painel:       'painel.ver',
  relatorios:   'relatorios.ver',
  necessidade:  'necessidade.ver'
};

// Setores nativos (secao 5). Admin Geral tem TODAS por definicao (o resolvedor
// forca isso), entao a lista dele aqui e so o seed inicial.
function setoresNativos(){
  const admin = PERMISSOES.filter(p => p.nivel === 'admin').map(p => p.chave);
  return [
    { nome:'Operador / Revisão',             nivel:'operacao',
      perms:['revisao.executar','revisao.rejeitar','devolucao.registrar','painel.ver','produtividade.propria'] },
    { nome:'Operador / Embalagem',           nivel:'operacao',
      perms:['embalagem.executar','painel.ver','produtividade.propria'] },
    { nome:'Operador / Expedição',           nivel:'operacao',
      perms:['pdf.subir','etiqueta.emitir','carregamento.executar','painel.ver','produtividade.propria'] },
    { nome:'Operador / Controle de Estoque', nivel:'operacao',
      perms:['contagem.contar','painel.ver','produtividade.propria'] },
    { nome:'Supervisor',                     nivel:'supervisor',
      perms:['painel.ver','produtividade.propria','produtividade.equipe','relatorios.ver','necessidade.ver'] },
    { nome:'Admin',                          nivel:'admin', perms: admin },
    { nome:'Admin Geral',                    nivel:'admin_geral', perms: PERMISSOES.map(p => p.chave) }
  ];
}

module.exports = function(app, db){
  // ── 1. TABELAS (secao 10 — as do modelo de permissao; auditoria e
  //    contagem_pendente ficam para as Fases 4 e 5). acesso_divergencia e o
  //    log da comparacao paralela desta fase. ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS permissoes (
      chave TEXT PRIMARY KEY, grupo TEXT, rotulo TEXT, descricao TEXT,
      nivel TEXT, sensivel INTEGER DEFAULT 0, ordem INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS setores (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT UNIQUE, nivel TEXT,
      nativo INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS setor_permissao (
      setor_id INTEGER, chave TEXT, PRIMARY KEY (setor_id, chave)
    );
    CREATE TABLE IF NOT EXISTS usuario_setor (
      usuario_id INTEGER, setor_id INTEGER, PRIMARY KEY (usuario_id, setor_id)
    );
    CREATE TABLE IF NOT EXISTS usuario_excecao (
      usuario_id INTEGER, chave TEXT, concede INTEGER, motivo TEXT,
      criado_por TEXT, criado_em TEXT DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (usuario_id, chave)
    );
    CREATE TABLE IF NOT EXISTS acesso_divergencia (
      id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, usuario_nome TEXT,
      area TEXT, chave TEXT, antigo INTEGER, novo INTEGER,
      criado_em TEXT DEFAULT (datetime('now','localtime')),
      data TEXT DEFAULT (date('now','localtime'))
    );
  `);

  // ── 2. sincroniza o registro permissoes.js -> tabela `permissoes` ──
  try{
    const up = db.prepare(`INSERT INTO permissoes (chave,grupo,rotulo,descricao,nivel,sensivel,ordem)
      VALUES (@chave,@grupo,@rotulo,@descricao,@nivel,@sensivel,@ordem)
      ON CONFLICT(chave) DO UPDATE SET grupo=excluded.grupo, rotulo=excluded.rotulo,
        descricao=excluded.descricao, nivel=excluded.nivel, sensivel=excluded.sensivel, ordem=excluded.ordem`);
    const vistas = new Set();
    db.transaction(() => {
      PERMISSOES.forEach((p, i) => {
        up.run({ chave:p.chave, grupo:p.grupo||'', rotulo:p.rotulo||'', descricao:p.desc||'',
                 nivel:p.nivel||'admin', sensivel:p.sensivel?1:0, ordem:i });
        vistas.add(p.chave);
      });
      for(const r of db.prepare('SELECT chave FROM permissoes').all())
        if(!vistas.has(r.chave)) db.prepare('DELETE FROM permissoes WHERE chave=?').run(r.chave);
    })();
  }catch(e){ console.log('[acesso] sync do registro falhou: '+e.message); }

  // ── 3. setores nativos (semeia so quando nascem; edicao futura fica na Fase 2) ──
  try{
    const insS  = db.prepare("INSERT OR IGNORE INTO setores (nome,nivel,nativo) VALUES (?,?,1)");
    const getS  = db.prepare("SELECT id FROM setores WHERE nome=?");
    const insSP = db.prepare("INSERT OR IGNORE INTO setor_permissao (setor_id,chave) VALUES (?,?)");
    db.transaction(() => {
      for(const s of setoresNativos()){
        const r = insS.run(s.nome, s.nivel);
        const id = getS.get(s.nome).id;
        if(r.changes > 0) for(const c of s.perms) insSP.run(id, c);
      }
    })();
  }catch(e){ console.log('[acesso] seed de setores falhou: '+e.message); }

  // ── resolvedor do modelo NOVO: permissoes efetivas de um usuario (secao 2) ──
  function permissoesDe(uid){
    const setores = db.prepare(`SELECT s.nivel FROM usuario_setor us
      JOIN setores s ON s.id=us.setor_id WHERE us.usuario_id=? AND s.ativo=1`).all(uid);
    // Admin Geral => TODAS, sempre (secao 14, regra 1)
    if(setores.some(s => s.nivel === 'admin_geral')) return new Set(PERMISSOES.map(p => p.chave));
    const efetivas = new Set();
    db.prepare(`SELECT DISTINCT sp.chave FROM usuario_setor us
      JOIN setor_permissao sp ON sp.setor_id=us.setor_id
      JOIN setores s ON s.id=us.setor_id
      WHERE us.usuario_id=? AND s.ativo=1`).all(uid).forEach(r => efetivas.add(r.chave));
    // excecoes: concede soma; revoga sempre vence (secao 2)
    const exc = db.prepare("SELECT chave,concede FROM usuario_excecao WHERE usuario_id=?").all(uid);
    exc.forEach(e => { if(e.concede) efetivas.add(e.chave); });
    exc.forEach(e => { if(!e.concede) efetivas.delete(e.chave); });
    return efetivas;
  }

  // ── 4. MIGRACAO dos usuarios atuais (secao 12), transacional e a prova de falha ──
  function areasParaSetores(areas){
    const set = new Set(areas.split(',').map(s => s.trim()).filter(Boolean));
    const alvo = [];
    if(set.has('admin')) alvo.push('Admin Geral');           // admin antigo => Admin Geral
    if(set.has('operador')) alvo.push('Operador / Revisão');
    if(set.has('montagem')) alvo.push('Operador / Embalagem');
    if(set.has('embalagem') || set.has('expedicao') || set.has('carregamento')) alvo.push('Operador / Expedição');
    if(set.has('relatorios') || set.has('necessidade')) alvo.push('Supervisor');
    // painel: coberto pelos setores acima (todos tem painel.ver); sem setor proprio
    return alvo;
  }
  // Migra so quem ainda nao tem setor (idempotente): pega os usuarios atuais no
  // boot e tambem qualquer usuario criado depois (pela tela antiga), mantendo o
  // modelo novo em dia sem tocar em quem ja foi ajustado a mao (Fase 2+).
  function migrarPendentes(){
    const usuarios = db.prepare("SELECT id,nome,areas FROM usuarios").all();
    const getS   = db.prepare("SELECT id FROM setores WHERE nome=?");
    const jaTem  = db.prepare("SELECT 1 FROM usuario_setor WHERE usuario_id=? LIMIT 1");
    const insUS  = db.prepare("INSERT OR IGNORE INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)");
    let migrados = 0; const semMapa = [];
    db.transaction(() => {
      for(const u of usuarios){
        if(jaTem.get(u.id)) continue;                        // ja migrado: nao mexe (Fase 2+)
        const nomes = areasParaSetores(u.areas || '');
        if(!nomes.length){ if((u.areas||'').trim()) semMapa.push(u.nome); continue; }
        for(const nome of nomes){ const s = getS.get(nome); if(s) insUS.run(u.id, s.id); }
        migrados++;
      }
    })();
    return { migrados, semMapa };
  }
  try{
    const r = migrarPendentes();
    console.log('[acesso] Fase 1: '+PERMISSOES.length+' permissoes, '
      + db.prepare("SELECT COUNT(*) c FROM setores").get().c + ' setores, '
      + r.migrados + ' usuarios migrados'
      + (r.semMapa.length ? ' (sem mapa: '+r.semMapa.join(', ')+')' : ''));
  }catch(e){ console.log('[acesso] MIGRACAO falhou — modelo antigo mantido, ninguem sem acesso: '+e.message); }

  // ── 5. comparacao PARALELA: registra divergencias (antigo x novo) por usuario/area ──
  function compararDivergencias(){
    try{ migrarPendentes(); }catch(e){}   // usuarios novos entram no modelo novo antes de comparar
    const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
    const usuarios = db.prepare("SELECT id,nome,areas FROM usuarios WHERE ativo=1").all();
    const del = db.prepare("DELETE FROM acesso_divergencia WHERE data=?");
    const ins = db.prepare(`INSERT INTO acesso_divergencia (usuario_id,usuario_nome,area,chave,antigo,novo,data)
      VALUES (?,?,?,?,?,?,?)`);
    let n = 0;
    db.transaction(() => {
      del.run(hoje);
      for(const u of usuarios){
        const areas = new Set((u.areas||'').split(',').map(s => s.trim()).filter(Boolean));
        const temAdmin = areas.has('admin');
        const perms = permissoesDe(u.id);
        for(const area in AREA_CHAVE){
          const chave  = AREA_CHAVE[area];
          const antigo = (temAdmin || areas.has(area)) ? 1 : 0;   // modelo antigo: admin OU a area
          const novo   = perms.has(chave) ? 1 : 0;                // modelo novo: tem a permissao
          if(antigo !== novo){ ins.run(u.id, u.nome, area, chave, antigo, novo, hoje); n++; }
        }
      }
    })();
    return n;
  }
  try{
    const d = compararDivergencias();
    console.log('[acesso] comparacao paralela: '+d+' divergencia(s) hoje (modelo novo NAO decide nada ainda — Fase 3)');
  }catch(e){ console.log('[acesso] comparacao paralela falhou: '+e.message); }

  // ── leitura (so Admin Geral do modelo ANTIGO, via area 'admin') ──
  function soAdmin(req, res){
    const u = req.usuario;
    if(!u || !(u.areas||[]).includes('admin')){ res.status(403).json({erro:'sem_permissao'}); return false; }
    return true;
  }
  app.get('/api/acesso/divergencias', (req, res) => {
    if(!soAdmin(req, res)) return;
    let total = 0; try{ total = compararDivergencias(); }catch(e){}
    const linhas = db.prepare(`SELECT usuario_nome, area, chave, antigo, novo FROM acesso_divergencia
      WHERE data=date('now','localtime') ORDER BY usuario_nome, area`).all();
    res.json({ total, linhas, obs:'modelo antigo decide o acesso; o novo roda em paralelo (Fase 1)' });
  });
  app.get('/api/acesso/usuario/:id', (req, res) => {
    if(!soAdmin(req, res)) return;
    const uid = +req.params.id;
    const setores = db.prepare(`SELECT s.nome, s.nivel FROM usuario_setor us
      JOIN setores s ON s.id=us.setor_id WHERE us.usuario_id=? ORDER BY s.nome`).all(uid);
    res.json({ usuario_id:uid, setores, permissoes:[...permissoesDe(uid)].sort() });
  });

  // exposto para as proximas fases (a Fase 3 e quem passa a decidir por aqui)
  app.locals.acesso = { permissoesDe, compararDivergencias, AREA_CHAVE };
};
