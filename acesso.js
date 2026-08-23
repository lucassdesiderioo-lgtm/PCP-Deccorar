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
const path = require('path');

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
    // COMPRAS.md §10 — os tres papeis nascem separados mesmo sendo uma pessoa
    // so. Segregacao de funcoes: quem pede, quem confere e quem paga. Nao e
    // sobre desconfiar de ninguem, e sobre o erro honesto nao passar batido.
    // Nascem VAZIOS: ninguem e migrado (mesma regra do setor de montagem).
    { nome:'Comprador',                      nivel:'admin',
      perms:['compras.ver','fornecedor.cadastrar','preco.lancar','pedido.criar','pedido.ver',
             'custo.ver','minimo.definir','componente.cadastrar','modelo.cadastrar'] },
    // Recebimento NAO VE PRECO em lugar nenhum — nem na conferencia, nem no
    // pedido, nem no PDF. Quem confere quantidade vendo valor tende a confirmar
    // o que esta escrito, e a separacao perde o sentido.
    { nome:'Recebimento',                    nivel:'operacao',
      perms:['pedido.ver','pedido.receber','pedido.devolver'] },
    { nome:'Financeiro',                     nivel:'admin',
      perms:['pedido.ver','pedido.pagar'] },
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
    CREATE TABLE IF NOT EXISTS auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, usuario_nome TEXT,
      categoria TEXT, acao TEXT, alvo TEXT, detalhe TEXT, ip TEXT,
      criado_em TEXT DEFAULT (datetime('now','localtime')),
      data TEXT DEFAULT (date('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_auditoria_data ON auditoria(data);
    CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id);
    CREATE TABLE IF NOT EXISTS contagem_pendente (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sessao TEXT, codigo TEXT, contado INTEGER,
      sistema_era INTEGER, operacao TEXT, contado_por TEXT,
      criado_em TEXT DEFAULT (datetime('now','localtime')),
      aprovado INTEGER DEFAULT 0, aprovado_por TEXT, aprovado_em TEXT
    );
  `);

  // Auditoria (Fase 4): registra o que MUDA coisas. Nunca lanca (log nao pode
  // derrubar a acao). IP e nome ficam junto do id (sobrevive a desativacao).
  function auditar(req, categoria, acao, alvo, detalhe){
    try{
      const u = (req && req.usuario) || {};
      const ip = req ? (req.headers['x-forwarded-for'] || req.socket && req.socket.remoteAddress || '') : '';
      db.prepare(`INSERT INTO auditoria (usuario_id,usuario_nome,categoria,acao,alvo,detalhe,ip)
        VALUES (?,?,?,?,?,?,?)`).run(u.id||null, u.nome||'', categoria||'', acao||'', String(alvo==null?'':alvo), String(detalhe==null?'':detalhe), String(ip).split(',')[0].trim());
    }catch(e){}
  }

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

  // ── porteiro das telas/rotas de administracao do proprio controle de acesso.
  // Usa o modelo NOVO (Admin Geral OU permissao de nivel admin), com fallback
  // para a area 'admin' do modelo antigo — assim ninguem fica sem acesso durante
  // a transicao mesmo que os setores ainda nao tenham sido conferidos. O
  // middleware ja gateia a permissao exata de cada rota (pessoas.gerenciar,
  // setores.gerenciar, auditoria.ver); este e defesa em profundidade. ──
  function soAdmin(req, res){
    const u = req.usuario;
    let ok = false;
    try{ ok = !!u && (ehAdminGeral(u.id) || temAdmin(permissoesDe(u.id))); }catch(e){}
    if(!ok && u && (u.areas||[]).includes('admin')) ok = true;   // fallback do modelo antigo
    if(!ok){ res.status(403).json({erro:'sem_permissao'}); return false; }
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
    try{ migrarPendentes(); }catch(e){}   // usuario novo ganha os setores iniciais antes de exibir
    const uid = +req.params.id;
    const setores = db.prepare(`SELECT s.nome, s.nivel FROM usuario_setor us
      JOIN setores s ON s.id=us.setor_id WHERE us.usuario_id=? ORDER BY s.nome`).all(uid);
    res.json({ usuario_id:uid, setores, permissoes:[...permissoesDe(uid)].sort() });
  });

  // ══════════════ FASE 2 — tela de cadastro (le o registro) ══════════════
  const NIVEIS = { operacao:1, supervisor:2, admin:3, admin_geral:4 };
  const infoPerm = {}; PERMISSOES.forEach(p => infoPerm[p.chave] = p);

  app.get('/api/acesso/registro', (req, res) => {
    if(!soAdmin(req, res)) return;
    const grupos = [];
    PERMISSOES.forEach(p => {
      let g = grupos.find(x => x.grupo === p.grupo);
      if(!g){ g = { grupo:p.grupo, permissoes:[] }; grupos.push(g); }
      g.permissoes.push({ chave:p.chave, rotulo:p.rotulo, desc:p.desc, nivel:p.nivel,
        sensivel:!!p.sensivel, intransferivel:!!p.intransferivel });
    });
    res.json({ grupos, niveis:NIVEIS });
  });

  app.get('/api/acesso/setores', (req, res) => {
    if(!soAdmin(req, res)) return;
    const setores = db.prepare("SELECT id,nome,nivel,nativo,ativo FROM setores ORDER BY nivel DESC, nome").all();
    const perms = db.prepare("SELECT setor_id, chave FROM setor_permissao").all();
    const cont = db.prepare("SELECT setor_id, COUNT(*) n FROM usuario_setor GROUP BY setor_id").all();
    const pmap = {}, cmap = {};
    perms.forEach(r => { (pmap[r.setor_id] = pmap[r.setor_id] || []).push(r.chave); });
    cont.forEach(r => cmap[r.setor_id] = r.n);
    res.json(setores.map(s => ({ ...s, nativo:!!s.nativo, ativo:!!s.ativo,
      permissoes: pmap[s.id] || [], usuarios: cmap[s.id] || 0 })));
  });

  app.post('/api/acesso/setores', (req, res) => {
    if(!soAdmin(req, res)) return;
    const b = req.body || {};
    const nome = String(b.nome || '').trim();
    const nivel = String(b.nivel || '').trim();
    if(!nome) return res.status(400).json({ erro:'nome obrigatório' });
    if(!NIVEIS[nivel]) return res.status(400).json({ erro:'nível inválido' });
    // regra §5.2: o nível do setor limita as permissões marcaveis
    const perms = (Array.isArray(b.permissoes) ? b.permissoes : []).filter(c => infoPerm[c]);
    const acima = perms.filter(c => NIVEIS[infoPerm[c].nivel] > NIVEIS[nivel]);
    if(acima.length) return res.status(400).json({ erro:'permissões acima do nível do setor: '+acima.join(', ') });
    try{
      db.transaction(() => {
        let id = b.id;
        const existe = id ? db.prepare("SELECT nativo,nivel FROM setores WHERE id=?").get(id) : null;
        if(existe && existe.nivel === 'admin_geral')
          throw new Error('Admin Geral tem todas as permissões e não é editável');
        if(id){
          db.prepare("UPDATE setores SET nome=?, nivel=? WHERE id=?").run(nome, nivel, id);
        } else {
          const r = db.prepare("INSERT INTO setores (nome,nivel,nativo) VALUES (?,?,0)").run(nome, nivel);
          id = r.lastInsertRowid;
        }
        db.prepare("DELETE FROM setor_permissao WHERE setor_id=?").run(id);
        const ins = db.prepare("INSERT OR IGNORE INTO setor_permissao (setor_id,chave) VALUES (?,?)");
        perms.forEach(c => ins.run(id, c));
      })();
      // editar um setor muda as permissoes de quem pertence a ele -> ressincroniza
      // as areas (sombra) desses membros (setor novo ainda nao tem ninguem)
      if(b.id) db.prepare("SELECT usuario_id FROM usuario_setor WHERE setor_id=?").all(b.id)
        .forEach(m => sincronizarAreas(m.usuario_id));
      auditar(req, 'sistema', b.id ? 'setor_editado' : 'setor_criado', nome, perms.join(','));
      res.json({ ok:true });
    }catch(e){ res.status(400).json({ erro:String(e.message||e) }); }
  });

  app.delete('/api/acesso/setores/:id', (req, res) => {
    if(!soAdmin(req, res)) return;
    const id = +req.params.id;
    const s = db.prepare("SELECT nome,nativo FROM setores WHERE id=?").get(id);
    if(!s) return res.status(404).json({ erro:'setor não encontrado' });
    const usados = db.prepare("SELECT COUNT(*) n FROM usuario_setor WHERE setor_id=?").get(id).n;
    if(usados > 0) return res.status(400).json({ erro:'há '+usados+' pessoa(s) neste setor — mova antes de excluir' });
    if(s.nativo){ db.prepare("UPDATE setores SET ativo=0 WHERE id=?").run(id); }   // nativo só desativa
    else { db.prepare("DELETE FROM setor_permissao WHERE setor_id=?").run(id); db.prepare("DELETE FROM setores WHERE id=?").run(id); }
    auditar(req, 'sistema', s.nativo ? 'setor_desativado' : 'setor_excluido', s.nome, '');
    res.json({ ok:true });
  });

  // setores + exceções de um usuário (a tela de cadastro, §11)
  app.post('/api/acesso/usuario/:id/setores', (req, res) => {
    if(!soAdmin(req, res)) return;
    const uid = +req.params.id;
    const ids = (Array.isArray(req.body && req.body.setores) ? req.body.setores : []).map(Number).filter(Boolean);
    db.transaction(() => {
      db.prepare("DELETE FROM usuario_setor WHERE usuario_id=?").run(uid);
      const ins = db.prepare("INSERT OR IGNORE INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)");
      ids.forEach(sid => ins.run(uid, sid));
    })();
    sincronizarAreas(uid);
    auditar(req, 'sistema', 'usuario_setores', String(uid), ids.join(','));
    res.json({ ok:true, permissoes:[...permissoesDe(uid)].sort() });
  });

  app.post('/api/acesso/usuario/:id/excecao', (req, res) => {
    if(!soAdmin(req, res)) return;
    const uid = +req.params.id;
    const b = req.body || {};
    const chave = String(b.chave || '');
    if(!infoPerm[chave]) return res.status(400).json({ erro:'permissão desconhecida' });
    if(b.limpar){
      db.prepare("DELETE FROM usuario_excecao WHERE usuario_id=? AND chave=?").run(uid, chave);
    } else {
      const concede = b.concede ? 1 : 0;
      db.prepare(`INSERT INTO usuario_excecao (usuario_id,chave,concede,motivo,criado_por)
        VALUES (?,?,?,?,?) ON CONFLICT(usuario_id,chave) DO UPDATE SET concede=excluded.concede,
        motivo=excluded.motivo, criado_por=excluded.criado_por`).run(uid, chave, concede,
        String(b.motivo||''), (req.usuario && req.usuario.nome) || '');
    }
    sincronizarAreas(uid);
    auditar(req, 'sistema', 'usuario_excecao', String(uid), chave+(b.limpar?':limpa':(b.concede?':concede':':revoga')));
    res.json({ ok:true, permissoes:[...permissoesDe(uid)].sort() });
  });

  // tela de cadastro (fora de public/ p/ o static nao expor; guarda pelo admin
  // do modelo antigo). NAO precisa mexer no auth.js.
  app.get('/acessos', (req, res) => {
    const u = req.usuario;
    if(!u) return res.redirect('/login?r=' + encodeURIComponent('/acessos'));
    if(!(u.areas || []).includes('admin'))
      return res.status(403).send('<body style="font-family:system-ui;padding:40px"><h2>Sem permissão</h2><a href="/login">Entrar com outro usuário</a></body>');
    res.sendFile(path.join(__dirname, 'views', 'acessos.html'));
  });

  // ══════════════ FASE 3 — motor de decisao do modelo novo ══════════════
  // Mapa rota -> permissao. Telas e acoes sensiveis/admin sao gateadas por
  // permissao; leituras gerais de operacao ficam '@logado' (qualquer logado),
  // como hoje. '@admin' = tem alguma permissao de nivel admin+; '@ag' = Admin
  // Geral. Rota nao listada cai no default '@logado' e aparece na cobertura.
  function permDaRota(pathRaw, method){
    const p = (pathRaw || '').replace(/\/+$/,'') || '/';
    const M = (method || 'GET').toUpperCase();
    const eq = (x) => p === x;
    const pre = (x) => p === x || p.indexOf(x + '/') === 0;
    // ── telas ──
    if(eq('/') || eq('/admin') || eq('/index.html')) return '@admin';
    if(eq('/acessos')) return 'pessoas.gerenciar';
    if(eq('/operador')) return 'revisao.executar';
    if(eq('/montagem')) return 'embalagem.executar';
    if(eq('/embalagem')) return 'etiqueta.emitir';
    if(eq('/carregamento')) return 'carregamento.executar';
    if(eq('/expedicao')) return 'pdf.subir';
    if(eq('/devolucao')) return 'devolucao.registrar';
    if(eq('/painel')) return 'painel.ver';
    if(eq('/relatorios')) return 'relatorios.ver';
    if(eq('/necessidade')) return 'necessidade.ver';
    if(eq('/planejamento')) return 'planilha.importar';
    if(eq('/baixar-backup')) return '@ag';
    // ── acoes/admin por API ──
    if(pre('/api/teste')) return 'teste.operar';
    if(pre('/api/usuarios')) return 'pessoas.gerenciar';
    if(pre('/api/acesso/setores')) return 'setores.gerenciar';
    if(eq('/api/acesso/divergencias')) return 'auditoria.ver';
    if(eq('/api/acesso/auditoria') || eq('/api/acesso/cobertura')) return 'auditoria.ver';
    if(pre('/api/acesso')) return 'pessoas.gerenciar';
    if(eq('/api/backup')) return '@ag';
    if(M !== 'GET' && eq('/api/revisao')) return 'revisao.executar';
    if(M !== 'GET' && eq('/api/rejeicao')) return 'revisao.rejeitar';
    if(M !== 'GET' && eq('/api/montagem')) return 'embalagem.executar';
    if(M !== 'GET' && eq('/api/embalar')) return 'etiqueta.emitir';
    if(M !== 'GET' && eq('/api/carregar')) return 'carregamento.executar';
    if(M !== 'GET' && pre('/api/lote')) return 'pdf.subir';
    if(pre('/api/print')) return 'etiqueta.emitir';
    if(M !== 'GET' && eq('/api/devolucao')) return 'devolucao.registrar';
    if(M !== 'GET' && eq('/api/devolucao/baixa')) return 'devolucao.baixar';
    if(M !== 'GET' && eq('/api/estoque')) return 'estoque.editar';
    if(M !== 'GET' && (eq('/api/alvo') || eq('/api/necessidade/aplicar'))) return 'alvo.editar';
    if(M !== 'GET' && eq('/api/producao')) return 'producao.lancar';
    if(M !== 'GET' && pre('/api/planejamento')) return 'planilha.importar';
    if(M !== 'GET' && eq('/api/skus')) return 'sku.cadastrar';
    // Antes do DELETE generico: /api/skus/pendencias e leitura da tela de
    // cadastro, nao exclusao de SKU.
    if(eq('/api/skus/pendencias')) return 'sku.cadastrar';
    if(M === 'DELETE' && pre('/api/skus')) return 'sku.excluir';
    // Compras Fase 0. As duas leituras ficam '@logado' por DECISAO, nao por
    // omissao: sao listas de apoio de tela, sem dado sensivel, como GET
    // /api/skus e GET /api/listas/:tipo.
    if(M !== 'GET' && pre('/api/cores')) return 'sku.cadastrar';
    if(M !== 'GET' && pre('/api/tecidos')) return 'sku.cadastrar';
    if(M !== 'GET' && pre('/api/modelos')) return 'modelo.cadastrar';
    if(eq('/api/cores') || eq('/api/modelos') || eq('/api/tecidos')) return '@logado';
    // ── COMPRAS (COMPRAS.md §10) ──
    // custo.ver e sensivel: custo do produto e a informacao mais estrategica do
    // sistema. Quem opera nao enxerga, e todo acesso passa pela auditoria.
    if(eq('/api/skus/custo')) return 'custo.ver';
    // A ficha mostra consumo E custo por componente — mesma sensibilidade.
    if(pre('/api/ficha')) return 'custo.ver';
    // Quem mexe numa formula mexe no consumo de material de toda a linha.
    if(M !== 'GET' && pre('/api/formulas')) return 'modelo.cadastrar';
    if(eq('/api/formulas')) return 'compras.ver';
    if(M !== 'GET' && pre('/api/fornecedores')) return 'fornecedor.cadastrar';
    if(M !== 'GET' && pre('/api/componentes')) return 'componente.cadastrar';
    if(M !== 'GET' && pre('/api/ofertas')) return 'preco.lancar';
    // Leituras de compras: preco de fornecedor nao e leitura de operacao. Quem
    // recebe (nivel operacao) NAO VE PRECO em lugar nenhum — regra 14 do §13.
    if(eq('/api/ofertas') || eq('/api/precos/historico')) return 'compras.ver';
    if(eq('/api/comparar') || eq('/api/compras/lista')) return 'compras.ver';
    // Pedido: criar/enviar/cancelar e do Comprador; pagar e do Financeiro; ver
    // o que esta a caminho e de OPERACAO, porque quem recebe precisa saber o que
    // vem — e por isso a leitura NAO carrega preco (regra 14 do §13).
    if(M !== 'GET' && pre('/api/pedidos') && /\/pagar$/.test(p)) return 'pedido.pagar';
    if(M !== 'GET' && pre('/api/pedidos')) return 'pedido.criar';
    if(pre('/api/pedidos')) return 'pedido.ver';
    if(eq('/api/fornecedores') || eq('/api/componentes')) return 'compras.ver';
    if(M !== 'GET' && eq('/api/cruzamento/aplicar')) return 'producao.lancar';
    // contagem em dois passos (secao 9): aprovar/rejeitar o pendente exige
    // contagem.ajustar; contar e ENVIAR (que pode virar pendente) exige so
    // contagem.contar — o handler decide aplicar direto ou enfileirar.
    if(pre('/api/contagem/pendentes')) return 'contagem.ajustar';
    if(M !== 'GET' && pre('/api/contagem')) return 'contagem.contar';
    if(M !== 'GET' && eq('/api/config/horarios')) return 'horarios.editar';
    if(M !== 'GET' && eq('/api/config/kit')) return 'kit.editar';
    if(M !== 'GET' && pre('/api/kit')) return 'kit.editar';
    if(M !== 'GET' && pre('/api/listas')) return 'listas.editar';
    if(eq('/api/rejeicao/resumo')) return 'produtividade.nominal';
    // ── leituras de gestao ──
    if(eq('/api/painel') || eq('/api/gerencial')) return 'painel.ver';
    if(pre('/api/rel')) return 'relatorios.ver';
    if(eq('/api/necessidade')) return 'necessidade.ver';
    if(eq('/api/cruzamento') || pre('/api/planejamento') || eq('/api/fechamento')) return '@admin';
    // ── resto: qualquer logado (operacao le livremente, como hoje) ──
    return '@logado';
  }
  function temAdmin(perms){ for(const c of perms){ const i=infoPerm[c]; if(i && (i.nivel==='admin'||i.nivel==='admin_geral')) return true; } return false; }
  function ehAdminGeral(uid){
    return db.prepare(`SELECT 1 FROM usuario_setor us JOIN setores s ON s.id=us.setor_id
      WHERE us.usuario_id=? AND s.ativo=1 AND s.nivel='admin_geral' LIMIT 1`).get(uid) ? true : false;
  }
  // ── `areas` (modelo antigo) virou SOMBRA dos setores: nao e mais editada a
  // mao. Mantida so para o que ainda depende dela — o redirecionamento pos-login
  // (login.html), a caixa de subir PDF no admin e o fallback de emergencia.
  // Recalcula a partir das permissoes efetivas sempre que os setores/excecoes
  // de uma pessoa mudam. ──
  const PERM_AREA = [
    ['revisao.executar','operador'], ['embalagem.executar','montagem'],
    ['etiqueta.emitir','embalagem'], ['carregamento.executar','carregamento'],
    ['pdf.subir','expedicao'], ['devolucao.registrar','devolucao'],
    ['painel.ver','painel'], ['relatorios.ver','relatorios'], ['necessidade.ver','necessidade']
  ];
  function sincronizarAreas(uid){
    try{
      const ag = ehAdminGeral(uid);
      const perms = permissoesDe(uid);
      const areas = [];
      if(ag || temAdmin(perms)) areas.push('admin');   // landing /admin + fallback
      PERM_AREA.forEach(([chave,area]) => { if(ag || perms.has(chave)) areas.push(area); });
      db.prepare("UPDATE usuarios SET areas=? WHERE id=?").run(areas.join(','), uid);
    }catch(e){}
  }

  // pergunta pontual (usada por outras rotas, ex.: contagem em dois passos):
  // o usuario tem esta permissao? Admin Geral tem todas. Migra na primeira vez.
  function podePermissao(u, chave){
    if(!u) return false;
    try{
      if(!jaConferido.has(u.id)){ try{ migrarPendentes(); }catch(e){} jaConferido.add(u.id); }
      if(ehAdminGeral(u.id)) return true;
      return permissoesDe(u.id).has(chave);
    }catch(e){ return (u.areas||[]).includes('admin'); }
  }
  // decide o acesso pelo modelo NOVO. Retorna {ok, chave, motivo}.
  const jaConferido = new Set();
  function decidir(u, pathRaw, method){
    if(!u) return { ok:false, motivo:'nao_logado' };
    // usuario criado pela tela antiga entra no modelo novo antes de ser julgado
    // (idempotente; uma vez por usuario por processo — nao trava nem re-migra a toa)
    if(!jaConferido.has(u.id)){ try{ migrarPendentes(); }catch(e){} jaConferido.add(u.id); }
    const req = permDaRota(pathRaw, method);
    if(req === '@logado') return { ok:true, chave:null, motivo:'logado' };
    const ag = ehAdminGeral(u.id);
    if(ag) return { ok:true, chave:req, motivo:'admin_geral' };   // Admin Geral passa sempre
    const perms = permissoesDe(u.id);
    if(req === '@admin') return { ok: temAdmin(perms), chave:'@admin', motivo:'admin' };
    if(req === '@ag')   return { ok:false, chave:'@ag', motivo:'so_admin_geral' };
    return { ok: perms.has(req), chave:req, motivo:'permissao' };
  }

  // ── FASE 6: o modelo NOVO passa a ser o padrao permanente. Semeia 'novo' uma
  // unica vez (INSERT OR IGNORE nao sobrescreve uma escolha ja feita). O modelo
  // antigo do auth.js NAO e apagado: continua la como rede de seguranca — so
  // entra em acao se o modelo novo lancar excecao (o try/catch do middleware),
  // honrando "ninguem pode ficar sem acesso". O kill-switch (POST /api/acesso/
  // modo -> 'antigo') segue disponivel para reverter em emergencia. ──
  try{
    db.prepare("INSERT OR IGNORE INTO config (chave,valor) VALUES ('acesso_modo','novo')").run();
  }catch(e){ console.log('[acesso] seed do modo de acesso falhou: '+e.message); }

  // config do modo de acesso: 'antigo' (auth.js decide) | 'novo' (modelo novo decide)
  function modoAcesso(){
    try{ const c = db.prepare("SELECT valor FROM config WHERE chave='acesso_modo'").get(); return (c && c.valor) || 'novo'; }
    catch(e){ return 'novo'; }
  }
  app.post('/api/acesso/modo', (req, res) => {
    if(!soAdmin(req, res)) return;
    const m = (req.body && req.body.modo) === 'novo' ? 'novo' : 'antigo';
    db.prepare("INSERT INTO config (chave,valor) VALUES ('acesso_modo',?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run(m);
    auditar(req, 'sistema', 'acesso_modo', m, '');
    res.json({ ok:true, modo:m });
  });
  app.get('/api/acesso/modo', (req, res) => { if(!soAdmin(req, res)) return; res.json({ modo:modoAcesso() }); });

  // ── FASE 4: cobertura (todas as rotas x permissao declarada) e auditoria ──
  const TODAS_ROTAS = [
    ['GET','/'],['GET','/operador'],['GET','/montagem'],['GET','/embalagem'],['GET','/carregamento'],
    ['GET','/expedicao'],['GET','/devolucao'],['GET','/painel'],['GET','/relatorios'],['GET','/necessidade'],
    ['GET','/planejamento'],['GET','/acessos'],['GET','/baixar-backup'],
    ['POST','/api/revisao'],['POST','/api/rejeicao'],['POST','/api/montagem'],['POST','/api/embalar'],
    ['POST','/api/carregar'],['POST','/api/lote/upload'],['GET','/api/print/:id'],['POST','/api/devolucao'],
    ['POST','/api/devolucao/baixa'],['POST','/api/estoque'],['POST','/api/alvo'],['POST','/api/necessidade/aplicar'],
    ['POST','/api/producao'],['POST','/api/planejamento/importar'],['POST','/api/skus'],['DELETE','/api/skus/:c'],
    ['GET','/api/skus/pendencias'],['GET','/api/cores'],['POST','/api/cores'],['DELETE','/api/cores/:c'],
    ['GET','/api/modelos'],['POST','/api/modelos'],['DELETE','/api/modelos/:id'],
    ['GET','/api/tecidos'],['POST','/api/tecidos'],['DELETE','/api/tecidos/:c'],
    ['GET','/api/fornecedores'],['POST','/api/fornecedores'],['DELETE','/api/fornecedores/:id'],
    ['GET','/api/componentes'],['POST','/api/componentes'],['DELETE','/api/componentes/:id'],
    ['GET','/api/ofertas'],['POST','/api/ofertas'],['DELETE','/api/ofertas/:id'],
    ['GET','/api/precos/historico'],['GET','/api/skus/custo'],['GET','/api/comparar'],['GET','/api/compras/lista'],
    ['GET','/api/pedidos'],['POST','/api/pedidos'],['GET','/api/pedidos/:id'],
    ['GET','/api/pedidos/:id/whatsapp'],['POST','/api/pedidos/:id/enviar'],
    ['POST','/api/pedidos/:id/cancelar'],['POST','/api/pedidos/:id/pagar'],
    ['GET','/api/formulas'],['POST','/api/formulas'],['POST','/api/formulas/testar'],
    ['DELETE','/api/formulas/:id'],['GET','/api/ficha/:sku'],['POST','/api/ficha/:sku/materializar'],
    ['POST','/api/cruzamento/aplicar'],['POST','/api/contagem/bipe'],['POST','/api/contagem/ajustar'],
    ['POST','/api/contagem/lancar'],['GET','/api/contagem/pendentes'],['POST','/api/contagem/pendentes/aprovar'],
    ['POST','/api/contagem/pendentes/rejeitar'],
    ['POST','/api/config/horarios'],['POST','/api/config/kit'],['POST','/api/listas'],['GET','/api/teste'],
    ['GET','/api/usuarios'],['GET','/api/acesso/setores'],['GET','/api/acesso/divergencias'],
    ['GET','/api/painel'],['GET','/api/rel/dia'],['GET','/api/necessidade'],['GET','/api/cruzamento'],
    ['GET','/api/rejeicao/resumo'],['GET','/api/skus'],['GET','/api/fila'],['GET','/api/carregamento']
  ];
  app.get('/api/acesso/cobertura', (req, res) => {
    if(!soAdmin(req, res)) return;
    const linhas = TODAS_ROTAS.map(([m,p]) => ({ metodo:m, rota:p, permissao:permDaRota(p, m) }));
    const semDeclarar = linhas.filter(l => l.permissao === '@logado' && l.rota.indexOf('/api/') !== 0);
    res.json({ total:linhas.length, sem_declarar:semDeclarar.length, linhas });
  });
  app.get('/api/acesso/auditoria', (req, res) => {
    if(!soAdmin(req, res)) return;
    const linhas = db.prepare(`SELECT usuario_nome,categoria,acao,alvo,detalhe,ip,criado_em
      FROM auditoria ORDER BY id DESC LIMIT 200`).all();
    res.json({ linhas });
  });

  // ── FASE 6 (secao 6.4): aviso no boot de rotas sem permissao declarada. ──
  try{
    const semDeclarar = TODAS_ROTAS
      .map(([m,p]) => ({ m, p, req: permDaRota(p, m) }))
      .filter(l => l.req === '@logado' && l.p.indexOf('/api/') !== 0);
    console.log('[acesso] Fase 6: modo de acesso = '+modoAcesso()
      + ' — '+(semDeclarar.length ? semDeclarar.length+' TELA(S) SEM PERMISSAO DECLARADA: '
          + semDeclarar.map(l => l.p).join(', ') : 'cobertura de telas OK (0 sem declarar)'));
  }catch(e){ console.log('[acesso] aviso de cobertura falhou: '+e.message); }

  // exposto para o auth.js (Fase 3) e demais rotas (Fases 5/6)
  app.locals.acesso = { permissoesDe, compararDivergencias, AREA_CHAVE, decidir, modoAcesso, permDaRota, auditar, podePermissao, ehAdminGeral };
};
