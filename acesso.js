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
    // SOB MEDIDA — nascem VAZIOS, como o de montagem e os de compras:
    // ninguem e migrado para ca. A operacao sob medida e outra equipe, e
    // herdar gente por engano daria acesso de corte a quem so revisa.
    { nome:'Sob medida / Bancada',           nivel:'operacao',
      perms:['sobmedida.cortar','painel.ver','produtividade.propria'] },
    { nome:'Sob medida / Cadastros',         nivel:'admin',
      perms:['sobmedida.cortar','sobmedida.cadastrar'] },
    /* VENDA (fase 2 da SOBMEDIDA-PEDIDO-REVENDA). Nasce vazio como os dois
       de cima, e SO com a chave de vender: o vendedor nao corta. Ate esta
       fase ele entrava por 'Sob medida / Cadastros', que e da chefia — o
       setor existe justamente para ele parar de precisar daquela. */
    { nome:'Sob medida / Venda',             nivel:'operacao',
      perms:['sobmedida.vender'] },
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
  /* ⚠️ O `config` E CRIADO AQUI TAMBEM, E ISSO NAO E REDUNDANCIA (17/09/2026).
     Este arquivo GRAVA em `config` (o seed do pacote.assinar, o modo de acesso
     e a marca da migracao de areas), mas quem cria a tabela e o `mont_route`,
     que no `server.js` roda antes. Carregado sozinho — um script, um teste, uma
     ordem de require diferente amanha —, o `CREATE` nao aconteceu e os
     `try/catch` daqui engolem tudo em silencio: os seeds "rodam", nao gravam
     nada, e ninguem fica sabendo. E a mesma familia do §17 (o ALTER que morava
     no modulo errado e so pegava no segundo boot). `IF NOT EXISTS` e idempotente
     e nao muda nada onde a tabela ja existe — que e a producao. */
  db.exec("CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT);");
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

  /* ── 3-B. chave NOVA em banco que JA EXISTE ──
     O seed acima so grava as permissoes quando o setor NASCE (`changes > 0`).
     Numa instalacao limpa o setor Admin ja nasce com 'pacote.assinar' (ele
     entra por `nivel==='admin'`); em producao o setor existe ha meses, o seed
     nao mexe nele, e a chave nova nunca chegaria a ninguem — o card apareceria
     em Bloqueados e daria 403 para todo mundo, sem erro, sem log e sem
     ninguem saber por que. E a armadilha #13 por outra porta: la o acesso
     sumia sozinho, aqui ele nem chega a existir.

     Quem recebe: os setores que JA resolvem divergencia na mesma aba
     ('sku.cadastrar'). Ninguem ganha o que nao tinha — e a mesma gente, na
     mesma tela, decidindo sobre o mesmo volume retido.

     Roda UMA VEZ (marca em `config`): quem desmarcar a caixinha depois nao a
     ve voltar no proximo boot, senao a decisao de quem gerencia acesso seria
     desfeita a cada restart. */
  try{
    if(!db.prepare("SELECT 1 FROM config WHERE chave='seed_pacote_assinar'").get()){
      db.transaction(() => {
        db.prepare(`INSERT OR IGNORE INTO setor_permissao (setor_id,chave)
          SELECT setor_id,'pacote.assinar' FROM setor_permissao WHERE chave='sku.cadastrar'`).run();
        db.prepare("INSERT OR IGNORE INTO config (chave,valor) VALUES ('seed_pacote_assinar','1')").run();
      })();
    }
  }catch(e){ console.log('[acesso] seed de pacote.assinar falhou: '+e.message); }

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
  /* ⚠️ A MIGRACAO DE `areas` E DE UMA VEZ SO, E ISSO FECHA UMA ESCALADA
     (divida 17, porta A, 17/09/2026).
     `usuarios.areas` deixou de ser ENTRADA e virou SOMBRA: quem escreve nela e
     o `sincronizarAreas`, a partir das permissoes efetivas (§19, armadilha
     #13). Só que esta funcao continuava lendo `areas` como se fosse entrada —
     e `areasParaSetores` traduz `'admin'` para o setor **ADMIN GERAL**.
     A cadeia completa: um Admin concede a alguem SEM SETOR uma excecao
     qualquer de nivel admin (ver custo, por exemplo) → `sincronizarAreas`
     grava `areas='admin'` → na proxima leitura da tela esta funcao roda, ve a
     sombra e poe a pessoa no Admin Geral. Ninguem pediu isso, ninguem ve
     acontecer, e a auditoria registra so a excecao — que era pequena.
     A migracao e um evento da Fase 1, nao uma rotina: depois que ela roda,
     `areas` nao volta a ser fonte de verdade sobre setor nenhum. Marcada em
     `config`, como o backfill do `pacote.assinar` logo acima.
     Pessoa NOVA nao depende disto: a tela de Acessos cria com `{nome, pin}` e
     sem `areas`, e quem da os setores e o Admin, na mao. */
  const MIGRACAO_FEITA = 'migracao_areas_fase1';
  function migracaoEncerrada(){
    try{ return !!db.prepare("SELECT 1 FROM config WHERE chave=?").get(MIGRACAO_FEITA); }
    catch(e){ return false; }
  }
  function migrarPendentes(){
    if(migracaoEncerrada()) return { migrados:0, semMapa:[], encerrada:true };
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
    /* Fecha a migracao DEPOIS de ela ter rodado uma vez neste banco: o primeiro
       boot com este codigo ainda migra quem estava pendente, e do segundo em
       diante `areas` para de decidir setor. */
    try{ db.prepare("INSERT OR IGNORE INTO config (chave,valor) VALUES (?,'1')").run(MIGRACAO_FEITA); }catch(e){}
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
        /* ⚠️ E NAO SE CRIA UM SEGUNDO ADMIN GERAL PELA TELA (divida 17).
           A guarda acima cobria so o setor que JA EXISTE — criar um setor NOVO
           de nivel `admin_geral` passava direto, e nivel admin_geral significa
           TODAS as permissoes (o resolvedor forca isso, `permissoesDe`). Um
           Admin criava "Coordenacao", marcava o nivel mais alto, se punha
           dentro e saia com acesso total. E a mesma escalada da excecao
           intransferivel, por outra porta da mesma tela. */
        if(!existe && nivel === 'admin_geral')
          throw new Error('Não dá para criar um setor de nível Admin Geral: ele tem TODAS as permissões. '
            + 'Para dar acesso total a alguém, ponha a pessoa no setor Admin Geral que já existe.');
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
    /* ⚠️ E AQUI O ULTIMO ADMIN GERAL NAO SE TRANCA DO LADO DE FORA.
       A trava existia no `auth.js` (bloquear e excluir) e nao existia aqui —
       mas tirar o setor Admin Geral da unica pessoa que o tem produz o MESMO
       resultado: ninguem mais administra o sistema, e a recuperacao e SQL
       direto no banco. Vale so quando a lista nova nao tem nenhum setor de
       nivel admin_geral: trocar um setor por outro, mantendo o cracha, passa. */
    if(ehUltimoAdminGeral(uid)){
      const temAG = ids.length ? !!db.prepare(
        `SELECT 1 FROM setores WHERE nivel='admin_geral' AND ativo=1 AND id IN (${ids.map(()=>'?').join(',')}) LIMIT 1`
      ).get(...ids) : false;
      if(!temAG) return res.status(400).json({ erro:'Esta é a única pessoa com acesso total (Admin Geral). '+
        'Dê o setor Admin Geral a outra pessoa antes de tirar o dela — senão ninguém mais administra o sistema.' });
    }
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
    /* ⚠️ O `intransferivel` DEIXOU DE SER SO UM ROTULO (divida 17, 17/09/2026).
       As tres chaves marcadas assim em `permissoes.js` (pessoas.gerenciar,
       setores.gerenciar, auditoria.ver) sao as que MANDAM NO PROPRIO ACESSO:
       quem as tem escolhe quem tem o que, e por isso elas sao de Admin Geral e
       nao se delegam. O rotulo existia desde o inicio, nao era gravado na
       tabela nem consultado em NENHUM caminho de escrita, e a tela desenhava a
       caixinha sem `disabled` — entao um Admin podia conceder a si mesmo (ou a
       qualquer um) o poder de gerenciar acessos. A tela de Acessos virava o
       caminho mais curto entre "sou admin" e "mando em tudo", e a auditoria
       registrava uma acao legitima, porque ela ERA legitima.
       REVOGAR continua livre: tirar nao escala ninguem, e recusar tambem a
       revogacao seria trava disparando no caso seguro (armadilha #6). */
    if(!b.limpar && b.concede && infoPerm[chave].intransferivel)
      return res.status(400).json({ erro:'"'+infoPerm[chave].rotulo+'" é intransferível: '+
        'ela decide quem tem acesso a quê, então só o Admin Geral a tem, por nível. '+
        'Para dar esse poder a alguém, ponha a pessoa no setor Admin Geral.' });
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
    // Fechar a coleta com o motorista e ato da mesma bancada que bipa a caixa:
    // quem carrega e quem confere o numero na frente do caminhao.
    if(M !== 'GET' && pre('/api/coleta')) return 'carregamento.executar';
    /* O bipe das pecas da caixa de pacote (§5, #23) acontece na BANCADA da
       Etiqueta de Venda, nao no upload — e sem ele a impressao e recusada.
       Cair no `pre('/api/lote')` abaixo o deixaria em 'pdf.subir', e quem tem
       so 'etiqueta.emitir' nao conseguiria conferir NEM imprimir: a trava
       trancaria a propria bancada que ela existe para proteger. */
    if(M !== 'GET' && eq('/api/lote/conferir')) return 'etiqueta.emitir';
    if(M !== 'GET' && pre('/api/lote')) return 'pdf.subir';
    if(pre('/api/print')) return 'etiqueta.emitir';
    // Reimpressao: mesma bancada, mesma permissao de imprimir. A LEITURA tambem
    // e gateada — a lista de impressos carrega comprador, cidade e NF, que e
    // dado de cliente, nao numero de operacao.
    if(eq('/api/impressos') || eq('/api/reimprimir')) return 'etiqueta.emitir';
    /* As caixas de varias persianas (§5-B): mesma regra dos impressos, e pelo
       mesmo motivo. A lista carrega COMPRADOR e NF — dado de cliente, nao numero
       de operacao —, entao ela e da bancada que emite a etiqueta, nao de
       qualquer pessoa logada. A lista por SKU (`/api/pendentes`) nao carrega
       nome nenhum e segue como estava. */
    if(eq('/api/pendentes/varias')) return 'etiqueta.emitir';
    // Divergencia de leitura da folha: ver e do admin; RESOLVER exige a mesma
    // permissao de quem hoje destrava bloqueado cadastrando SKU — e a mesma
    // decisao, "qual peca e essa", tomada olhando o pedido no Mercado Livre.
    if(M !== 'GET' && pre('/api/divergencias')) return 'sku.cadastrar';
    if(eq('/api/divergencias')) return '@admin';
    // Etiqueta em formato desconhecido (§8-B): ver e decidir se a caixa vai
    // pro carro ou pro caminhao da coleta e da GESTAO, por regra do dono.
    if(pre('/api/modalidade')) return '@admin';
    /* Pacote (§5, armadilha #23): a terceira trava da aba Bloqueados, e a unica
       das tres com chave PROPRIA. As outras duas decidem qual peca e essa
       (sku.cadastrar) e por onde a caixa sai ('@admin'); esta decide QUANTAS
       persianas vao dentro e, com isso, quantas baixam do estoque na impressao.
       VER continua '@admin', como o resto da aba. */
    if(M !== 'GET' && pre('/api/pacote')) return 'pacote.assinar';
    if(pre('/api/pacote')) return '@admin';
    if(eq('/api/auditoria/skus')) return '@admin';
    if(M !== 'GET' && eq('/api/devolucao')) return 'devolucao.registrar';
    if(M !== 'GET' && eq('/api/devolucao/baixa')) return 'devolucao.baixar';
    if(M !== 'GET' && eq('/api/estoque')) return 'estoque.editar';
    // A aba Estoque do admin: o painel e o historico de ajustes sao leitura de
    // GESTAO, nao de operacao. O painel carrega alvo, cobertura e o que falta
    // produzir do catalogo inteiro; o historico diz quem mexeu no saldo e por
    // que. Ficam com a mesma chave da tela que os mostra ('/' e '@admin'), e
    // nao caindo no '@logado' do fim por omissao.
    /* O extrato vem ANTES da linha de escrita de `/api/estoque` la em cima? Nao
       precisa: aquela so pega `M !== 'GET'`. Aqui e leitura, e e `@admin` como
       o resto da aba — quem abre Estoque ve o livro do SKU que esta olhando. */
    if(eq('/api/estoque/painel') || eq('/api/estoque/ajustes') ||
       pre('/api/estoque/extrato')) return '@admin';
    if(M !== 'GET' && eq('/api/alvo')) return 'alvo.editar';
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
    /* `pre` e nao `eq`: a leitura das MEDIDAS de um modelo
       (/api/formulas/medidas/:id) entrou depois, e com `eq` ela nao casava
       nenhuma regra e caia no fallback de rota nao declarada. Enquanto a divida
       12(c) do §14 nao existir — registro em que rota sem permissao NASCE
       negada — cada rota nova precisa vir com a sua linha aqui, e e por isso
       que esta usa prefixo: a proxima leitura de formula ja nasce coberta. */
    if(pre('/api/formulas')) return 'compras.ver';
    if(M !== 'GET' && pre('/api/fornecedores')) return 'fornecedor.cadastrar';
    if(M !== 'GET' && pre('/api/componentes')) return 'componente.cadastrar';
    if(M !== 'GET' && pre('/api/ofertas')) return 'preco.lancar';
    // Leituras de compras: preco de fornecedor nao e leitura de operacao. Quem
    // recebe (nivel operacao) NAO VE PRECO em lugar nenhum — regra 14 do §13.
    if(eq('/api/ofertas') || eq('/api/precos/historico')) return 'compras.ver';
    if(eq('/api/comparar') || eq('/api/compras/lista')) return 'compras.ver';
    // Fase 6: a corrente venda -> peca -> material. Nao carrega preco, mas
    // carrega a ficha (quanto cada peca consome), que e informacao estrategica
    // como o custo. Fica com o resto de compras.
    if(eq('/api/compras/necessidade')) return 'compras.ver';
    if(eq('/api/custo/historico')) return 'custo.ver';
    // Pedido: criar/enviar/cancelar e do Comprador; pagar e do Financeiro; ver
    // o que esta a caminho e de OPERACAO, porque quem recebe precisa saber o que
    // vem — e por isso a leitura NAO carrega preco (regra 14 do §13).
    // Recebimento (§8): a tela e as rotas de conferencia sao de OPERACAO e nao
    // carregam preco. Lancar o preco da nota e do Comprador.
    if(eq('/recebimento')) return 'pedido.receber';
    if(eq('/api/recebimento/aguardando')) return 'pedido.ver';
    if(M !== 'GET' && /\/preco$/.test(p) && pre('/api/recebimento')) return 'preco.lancar';
    if(M !== 'GET' && eq('/api/recebimento')) return 'pedido.receber';
    if(eq('/api/recebimento/devolucoes')) return 'compras.ver';
    if(M !== 'GET' && /\/fechar$/.test(p) && pre('/api/pedidos')) return 'pedido.criar';
    if(eq('/api/pedidos/zumbis')) return 'compras.ver';
    if(M !== 'GET' && pre('/api/pedidos') && /\/pagar$/.test(p)) return 'pedido.pagar';
    if(M !== 'GET' && pre('/api/pedidos')) return 'pedido.criar';
    if(pre('/api/pedidos')) return 'pedido.ver';
    if(eq('/api/fornecedores') || eq('/api/componentes')) return 'compras.ver';
    if(M !== 'GET' && eq('/api/cruzamento/aplicar')) return 'producao.lancar';
    // contagem em dois passos (secao 9): aprovar/rejeitar o pendente exige
    // contagem.ajustar; contar e ENVIAR (que pode virar pendente) exige so
    // contagem.contar — o handler decide aplicar direto ou enfileirar.
    if(pre('/api/contagem/pendentes')) return 'contagem.ajustar';
    // §8: a lista de materiais da tela de contagem fica em 'contagem.contar' por
    // DECISAO, e nao em 'compras.ver': quem conta precisa escolher o que esta
    // contando, e a rota devolve nome, unidade e saldo — nunca preco (regra 14
    // do §13). Quem nao conta nao tem por que ver a lista.
    if(eq('/api/contagem/componentes')) return 'contagem.contar';
    if(M !== 'GET' && pre('/api/contagem')) return 'contagem.contar';
    if(M !== 'GET' && eq('/api/config/horarios')) return 'horarios.editar';
    /* `pre` e nao `eq`: o conteudo da etiqueta (/api/config/kit/etiqueta, spec
       GERADOR-ETIQUETA-KIT) e a mesma pergunta do mesmo card — o que a
       Embalagem bipa e o que vai impresso nela. Com `eq` a rota nova cairia no
       default '@logado' e qualquer pessoa logada mudaria o QR do manual, sem
       erro e sem log (§5, armadilha #23: a ponta que some em silencio). */
    if(M !== 'GET' && pre('/api/config/kit')) return 'kit.editar';
    // Ligar/desligar a conferencia dupla muda o que a expedicao e obrigada a
    // fazer — e decisao de quem responde pela operacao, nao de quem carrega.
    if(M !== 'GET' && eq('/api/config/conferencia')) return '@admin';
    /* ⚠️ ANTES do `pre('/api/kit')`, senao a impressao cai em `kit.editar` e a
       chave nova nao manda em nada — a ponta que some em silencio (§5,
       armadilha #23). Imprimir e tirar copia do que ja foi decidido; editar e
       decidir o que a Embalagem passa a bipar. */
    if(M !== 'GET' && eq('/api/kit/etiqueta/imprimir')) return 'kit.imprimir';
    if(M !== 'GET' && pre('/api/kit')) return 'kit.editar';
    if(M !== 'GET' && pre('/api/listas')) return 'listas.editar';
    if(eq('/api/rejeicao/resumo')) return 'produtividade.nominal';
    // ── leituras de gestao ──
    if(eq('/api/painel') || eq('/api/gerencial')) return 'painel.ver';
    if(pre('/api/rel')) return 'relatorios.ver';
    if(eq('/api/cruzamento') || pre('/api/planejamento') || eq('/api/fechamento')) return '@admin';

    /* ═══ AS LEITURAS QUE NÃO TINHAM DONO (dívida 16, 17/09/2026) ═══════════
       Tudo daqui pra baixo vinha caindo no antigo `return '@logado'`. Nada
       ACIMA desta linha muda de dono: as regras novas só pegam o que já era
       aberto a qualquer pessoa logada.

       ⚠️ O DONO DE UMA LEITURA É UMA **LISTA**, e isso não é frouxidão. Uma
       chave só não descreve quem lê: `/api/lote` é lido pela Etiqueta de
       Venda, pela tela de Lançar produção E pelo admin. Pior: as chaves de
       operação são de nível `operacao`, e o setor **Admin** só recebe as de
       nível `admin` — declarar a leitura pela chave da tela tiraria do próprio
       Admin a leitura da tela dele. Quem passa é quem tem QUALQUER UMA. */
    if(eq('/api/bloqueados')) return '@admin';
    // A bancada da Etiqueta de Venda: o que falta imprimir, o que vem depois,
    // o relógio do despacho e o bipe do SKU.
    if(eq('/api/pendentes') || eq('/api/pendentes/futuros') || eq('/api/fila/resumo')
       || eq('/api/expedicao/status') || pre('/api/proximo')) return ['etiqueta.emitir','@admin'];
    if(eq('/api/lote')) return ['pdf.subir','etiqueta.emitir','@admin'];
    if(eq('/api/fila') || eq('/api/montagem/hoje')) return ['embalagem.executar','etiqueta.emitir','@admin'];
    /* A FOTO DA COLETA É PROVA (§8-B), e estava legível por qualquer pessoa
       logada: é a tela do celular do motorista, com a contagem dele. */
    if(eq('/api/carregamento') || pre('/api/coleta')) return ['carregamento.executar','@admin'];
    if(pre('/api/revisao')) return ['revisao.executar','@admin'];
    /* A lista de ordens do dia: a tela vermelha do operador mostra o que foi
       lançado, e o admin mostra a mesma coisa na aba de lançar. Lançar (POST)
       continua em `producao.lancar`, declarado lá em cima. */
    if(eq('/api/producao')) return ['revisao.executar','@admin'];
    if(pre('/api/contagem')) return ['contagem.contar','@admin'];
    if(eq('/api/devolucao/pendentes')) return ['devolucao.baixar','@admin'];
    if(pre('/api/devolucao')) return ['devolucao.registrar','@admin'];

    /* ═══ LISTAS DE APOIO DE TELA: continuam abertas a quem entrou ═════════
       Cor, modelo, tecido, SKU, as listas configuráveis e o código do kit são
       o que as telas usam para montar seletor e conferir bipe. Não carregam
       preço, custo nem dado de cliente, e a Embalagem precisa do kit no
       tablet. Ficam `@logado` — mas agora DECLARADAS, não por sobra. */
    if(eq('/api/skus') || eq('/api/cores') || eq('/api/modelos') || eq('/api/tecidos')
       || pre('/api/listas') || pre('/api/config/kit')
       || eq('/api/config/horarios') || eq('/api/config/conferencia')) return '@logado';
    /* O login acontece ANTES de existir sessão, e o `/status` é healthcheck: os
       dois já passam pela lista LIVRE do auth.js sem chegar aqui. Ficam
       declarados para a varredura não acusar o que não é problema. */
    if(eq('/login') || eq('/status') || pre('/api/auth')) return '@logado';
    /* A escolha de setor é de QUALQUER SESSÃO — é a tela onde a pessoa diz onde
       vai trabalhar hoje, antes de ter qualquer coisa marcada. */
    if(eq('/setor')) return '@logado';

    /* ⚠️ O ARQUIVO DA TELA NÃO É A TELA — E FOI ISTO QUE QUASE DERRUBOU TUDO.
       Com sessão aberta, `/sku.js`, `/base.css` e as imagens passam por aqui
       como qualquer caminho: a lista LIVRE do `auth.js` tem só `/login`,
       `/login.html`, `/nav.js` e `/favicon.ico`. Negar por padrão sem esta
       linha tiraria o JavaScript de TODAS as telas — elas abririam em branco,
       com 403 no console, para todo mundo menos o Admin Geral, e o sintoma não
       se pareceria nem de longe com "mexeram na permissão".
       `.html` NÃO entra aqui de propósito: ele é tela, e cai na regra abaixo. */
    if(/\.(js|mjs|css|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot)$/i.test(p)) return '@logado';
    /* A GÊMEA `.html` VALE O MESMO QUE A TELA. `/operador` exigia
       `revisao.executar` e `/operador.html` — o mesmo arquivo, servido pelo
       `express.static` — exigia só estar logado. Ninguém navega por ela (o
       rodapé usa a rota sem extensão), então fechar não tira nada de ninguém.
       Herdar em vez de listar as dez faz a tela nova de amanhã já nascer com a
       gêmea coberta. */
    if(/\.html$/.test(p)) return permDaRota(eq('/index.html') ? '/admin' : p.slice(0, -5), M);

    /* ⚠️ E O PADRÃO PASSOU A SER **NEGAR** (dívida 16). Enquanto foi
       `return '@logado'`, rota nova nascia aberta a qualquer pessoa logada sem
       aparecer em lugar nenhum: nem erro, nem log, nem linha na cobertura — que
       era uma lista escrita à mão e ainda descartava tudo que começa com
       `/api/`, imprimindo "cobertura OK (0 sem declarar)" no boot. Um verde que
       ninguém conferiu.
       Quem esquecer de declarar descobre na hora: a rota responde 403 e o boot
       grita o nome dela. O Admin Geral continua passando por NÍVEL, antes da
       chave — uma declaração esquecida não pode trancar o dono fora do próprio
       sistema, e é ele quem vai ler o aviso. */
    return '@negado';
  }
  function temAdmin(perms){ for(const c of perms){ const i=infoPerm[c]; if(i && (i.nivel==='admin'||i.nivel==='admin_geral')) return true; } return false; }
  function ehAdminGeral(uid){
    return db.prepare(`SELECT 1 FROM usuario_setor us JOIN setores s ON s.id=us.setor_id
      WHERE us.usuario_id=? AND s.ativo=1 AND s.nivel='admin_geral' LIMIT 1`).get(uid) ? true : false;
  }
  /* "ELE E O ULTIMO ADMIN GERAL?" — a pergunta mora AQUI, ao lado de quem
     responde "ele e Admin Geral?". O `auth.js` ja fazia essa conta para nao
     deixar bloquear nem excluir o ultimo (a regra "ninguem sem acesso"), e o
     `acesso.js` nao fazia nenhuma — entao dava para se trancar do lado de fora
     pela tela de Acessos, tirando de si mesmo o setor Admin Geral. A saida
     dali e SQL direto no banco, que e o oposto do que a tela existe para ser.
     Uma segunda copia da conta divergiria no dia em que "quem e Admin Geral"
     mudasse; por isso o auth.js passou a chamar esta (17/09/2026). */
  function ehUltimoAdminGeral(uid){
    if(!ehAdminGeral(+uid)) return false;
    const outros = db.prepare('SELECT id FROM usuarios WHERE ativo=1 AND id!=?').all(+uid);
    return !outros.some(u => ehAdminGeral(u.id));
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
    ['painel.ver','painel'], ['relatorios.ver','relatorios'], ['necessidade.ver','necessidade'],
    ['pedido.receber','recebimento'],
    /* SOB MEDIDA. Sem estas duas linhas a integracao NAO FUNCIONA, e falha em
       silencio: o portao em tecido/montar.js le `usuarios.areas`, e no modo
       novo esta coluna e recalculada aqui a cada mudanca de setor. Area que
       nao esta neste mapa e apagada no primeiro salvamento — o acesso seria
       concedido na tela e sumiria sozinho depois. */
    ['sobmedida.cortar','sobmedida'], ['sobmedida.cadastrar','sobmedida_adm'],
    ['sobmedida.vender','sobmedida_venda']
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
    /* Admin Geral passa sempre, e ANTES da chave: e o que garante que uma rota
       que alguem esqueceu de declarar (hoje ela nasce '@negado') nao tranque o
       dono fora do proprio sistema — ele e quem le o aviso do boot. */
    if(ag) return { ok:true, chave:Array.isArray(req)?req[0]:req, motivo:'admin_geral' };
    const perms = permissoesDe(u.id);
    /* ROTA SEM DECLARACAO NASCE NEGADA (divida 16). O nome do motivo importa:
       na auditoria, 'rota_nao_declarada' quer dizer "falta uma linha no
       permDaRota", e nao "esta pessoa nao devia estar ali". */
    if(req === '@negado') return { ok:false, chave:'@negado', motivo:'rota_nao_declarada' };
    /* A DECLARACAO PODE SER UMA LISTA: passa quem tem QUALQUER UMA das chaves.
       E o caso das leituras com mais de um publico legitimo — a mesma tabela
       que a Etiqueta de Venda le e a que o admin le (ver o bloco das leituras
       no permDaRota). */
    const exigidas = Array.isArray(req) ? req : [req];
    const passa = (c) => c === '@logado' ? true
                       : c === '@admin'  ? temAdmin(perms)
                       : c === '@ag'     ? false
                       : perms.has(c);
    const atendida = exigidas.find(passa);
    return { ok: !!atendida, chave: atendida || exigidas[0],
             motivo: exigidas.length > 1 ? 'permissao_lista'
                   : exigidas[0] === '@admin' ? 'admin'
                   : exigidas[0] === '@ag' ? 'so_admin_geral' : 'permissao' };
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
  /* ═══ A COBERTURA VARRE O APP, E NAO UMA LISTA ESCRITA A MAO ═══════════
     Aqui morava `TODAS_ROTAS`: 49 linhas digitadas para 151 rotas reais, e o
     contador ainda descartava tudo que comecasse com `/api/` — por construcao
     nenhuma API sem dono aparecia, e o boot imprimia "cobertura OK (0 sem
     declarar)". Verde que ninguem conferiu e pior que vermelho: ele afirma com
     autoridade uma coisa que nao foi olhada.
     Hoje a lista sai do proprio Express, entao rota nova entra na conta no
     mesmo minuto em que e escrita. E o que a divida 12(c) do §14 pede.

     ⚠️ `/sobmedida` FICA DE FORA, e nao por esquecimento: aquele modulo tem
     portao proprio (`tecido/montar.js`) e o `auth.js` passa por ele ANTES do
     `decidir` — um dono so por caminho (§19). Acusar as rotas dele aqui seria
     ruido permanente na lista, e ruido permanente e o que faz a lista deixar
     de ser lida. */
  function rotasRegistradas(){
    const pilha = (app._router && app._router.stack) || (app.router && app.router.stack) || [];
    const fora = [];
    for(const camada of pilha){
      if(!camada.route || !camada.route.path) continue;
      const rota = String(camada.route.path);
      if(rota === '/sobmedida' || rota.indexOf('/sobmedida/') === 0) continue;
      for(const metodo of Object.keys(camada.route.methods || {}))
        fora.push({ metodo:metodo.toUpperCase(), rota });
    }
    return fora;
  }
  /* O `:param` vira valor de mentira porque e assim que o caminho chega em
     producao: o `permDaRota` julga `/api/coleta/foto/123`, nunca
     `/api/coleta/foto/:id`. Perguntar com o padrao responderia por uma rota
     que nao existe. */
  const comoChega = (rota) => rota.replace(/:([A-Za-z_0-9]+)\??/g, '1');
  function coberturaDeRotas(){
    const linhas = rotasRegistradas().map(r => ({
      metodo:r.metodo, rota:r.rota,
      permissao: permDaRota(comoChega(r.rota), r.metodo)
    }));
    const naoDeclaradas = linhas.filter(l => l.permissao === '@negado');
    return { total:linhas.length, nao_declaradas:naoDeclaradas.length,
             lista_nao_declaradas:naoDeclaradas.map(l => l.metodo+' '+l.rota), linhas };
  }

  app.get('/api/acesso/cobertura', (req, res) => {
    if(!soAdmin(req, res)) return;
    const c = coberturaDeRotas();
    // `sem_declarar` continua no JSON com o nome antigo: a tela de Acessos le
    // esse campo, e trocar o nome aqui apagaria o numero dela sem aviso.
    res.json(Object.assign({ sem_declarar:c.nao_declaradas }, c));
  });
  app.get('/api/acesso/auditoria', (req, res) => {
    if(!soAdmin(req, res)) return;
    const linhas = db.prepare(`SELECT usuario_nome,categoria,acao,alvo,detalhe,ip,criado_em
      FROM auditoria ORDER BY id DESC LIMIT 200`).all();
    res.json({ linhas });
  });

  /* ── O AVISO DO BOOT, AGORA SOBRE O APP INTEIRO ──────────────────────────
     ⚠️ `setImmediate` E OBRIGATORIO. Este arquivo e carregado no meio do
     `server.js`: na hora em que ele roda, o `teste_route` e o `/sobmedida`
     ainda nao registraram nada. Varrer agora contaria meio sistema e diria
     "cobertura OK" sobre o que ainda nao existe — o mesmo verde sem conferencia
     que a lista manual dava. Uma volta no laco de eventos depois, o
     `server.js` terminou de montar tudo.
     O aviso e RUIDOSO de proposito: rota nova nasce negada, e quem escreveu
     precisa ver o nome dela no log da primeira vez que subir — nao no 403 da
     bancada, tres dias depois. */
  setImmediate(() => {
    try{
      const c = coberturaDeRotas();
      console.log('[acesso] Fase 6: modo de acesso = '+modoAcesso()
        + ' — '+c.total+' rotas registradas, '
        + (c.nao_declaradas
            ? c.nao_declaradas+' SEM PERMISSAO DECLARADA (nascem NEGADAS): '+c.lista_nao_declaradas.join(', ')
            : 'todas com permissao declarada'));
    }catch(e){ console.log('[acesso] aviso de cobertura falhou: '+e.message); }
  });

  // exposto para o auth.js (Fase 3) e demais rotas (Fases 5/6)
  app.locals.acesso = { permissoesDe, compararDivergencias, AREA_CHAVE, decidir, modoAcesso, permDaRota, auditar, podePermissao, ehAdminGeral, ehUltimoAdminGeral, coberturaDeRotas };
};
