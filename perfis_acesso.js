/* PERFIS DE TESTE DO ACESSO (spec ACESSO-POR-TELA-E-NIVEL, fases 2 a 4).
 *
 * Um banco de exemplo com as pessoas que a fabrica tem de verdade — uma por
 * setor nativo — e os casos que costumam esconder defeito: exceção que concede
 * acima do setor, exceção que revoga, duas pessoas em dois setores, setor
 * criado à mão com chave acima do nível dele, ninguém em setor nenhum.
 *
 * Serve a uma pergunta: "o que cada pessoa abre?". O `teste_mapa.js` grava a
 * resposta de ANTES (teste_mapa_antes.json) e compara depois de cada fase —
 * "ninguém ganha nem perde" se prova pessoa a pessoa, e não por amostra.
 * Também é a base dos quatro logins do Playwright do fim.
 */
const fs = require('fs'), os = require('os'), path = require('path');
const Database = require('better-sqlite3');

// As telas da medida padrão como existem HOJE (antes do mapa) — e as novas
// do Admin, que só passam a responder na fase 5.
const ROTAS = ['/', '/admin', '/index.html', '/acessos', '/operador', '/operador.html',
  '/montagem', '/embalagem', '/carregamento', '/expedicao', '/devolucao', '/devolucao-casos',
  '/devolucoes', '/painel', '/relatorios', '/planejamento', '/inventario', '/recebimento',
  '/setor', '/baixar-backup'];

const PERFIS = [
  { nome:'Lucas (Admin Geral)',       setores:['Admin Geral'] },
  { nome:'Ana (Admin)',               setores:['Admin'] },
  { nome:'Sergio (Supervisor)',       setores:['Supervisor'] },
  { nome:'Carla (Comprador)',         setores:['Comprador'] },
  { nome:'Fabio (Financeiro)',        setores:['Financeiro'] },
  { nome:'Rui (Recebimento)',         setores:['Recebimento'] },
  { nome:'Edvaldo (Revisão)',         setores:['Operador / Revisão'] },
  { nome:'Bia (Embalagem)',           setores:['Operador / Embalagem'] },
  { nome:'Davi (Expedição)',          setores:['Operador / Expedição'] },
  { nome:'Elis (Estoque)',            setores:['Operador / Controle de Estoque'] },
  { nome:'Tom (SM Bancada)',          setores:['Sob medida / Bancada'] },
  { nome:'Gil (SM Cadastros)',        setores:['Sob medida / Cadastros'] },
  { nome:'Vera (SM Venda)',           setores:['Sob medida / Venda'] },
  { nome:'Otto (Revisão + custo)',    setores:['Operador / Revisão'], concede:['custo.ver'] },
  { nome:'Sara (Supervisor − rel.)',  setores:['Supervisor'], revoga:['relatorios.ver'] },
  { nome:'Nina (sem setor)',          setores:[] },
  { nome:'Paulo (Expedição + Sup.)',  setores:['Operador / Expedição','Supervisor'] },
  { nome:'Renato (Pós-venda)',        setores:['Pós-venda'] },
  { nome:'Lia (só dinheiro)',         setores:[], concede:['devolucao.dinheiro'] },
  { nome:'Igor (Sup. + baixa)',       setores:['Supervisor'], concede:['devolucao.baixar'] }
];
// Setor feito à mão em produção: nível operação com chave de nível Admin
// (a R-ACE-03 deixava; a fase 4 não apaga, lista).
const SETORES_EXTRAS = [
  { nome:'Pós-venda', nivel:'operacao', perms:['devolucao.registrar','devolucao.acompanhar','devolucao.baixar','devolucao.lancar'] }
];

function montar(){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perfis-'));
  const db = new Database(path.join(dir, 'p.db'));
  db.exec(`CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT,
      pin_hash TEXT, salt TEXT, areas TEXT DEFAULT '', ativo INTEGER DEFAULT 1, pin_curto INTEGER DEFAULT 0);
    CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
    INSERT INTO config (chave,valor) VALUES ('migracao_areas_fase1','1');`);
  const rotas = {}, pilha = [];
  const reg = (m,p,h) => { rotas[m+' '+p] = h; pilha.push({ route:{ path:p, methods:{ [m.toLowerCase()]:true } } }); };
  const app = { locals:{}, router:{ stack:pilha },
    get(p,h){ reg('GET',p,h); }, post(p,h){ reg('POST',p,h); }, delete(p,h){ reg('DELETE',p,h); } };
  const log = console.log; console.log = () => {};
  try{ require('./acesso')(app, db); } finally { console.log = log; }
  const sid = n => (db.prepare('SELECT id FROM setores WHERE nome=?').get(n) || {}).id;
  for(const s of SETORES_EXTRAS){
    const r = db.prepare('INSERT INTO setores (nome,nivel,nativo) VALUES (?,?,0)').run(s.nome, s.nivel);
    s.perms.forEach(c => db.prepare('INSERT INTO setor_permissao (setor_id,chave) VALUES (?,?)').run(r.lastInsertRowid, c));
  }
  const pessoas = [];
  for(const p of PERFIS){
    const id = db.prepare("INSERT INTO usuarios (nome,pin_hash,salt) VALUES (?,'x','y')").run(p.nome).lastInsertRowid;
    p.setores.forEach(n => { const s = sid(n); if(!s) throw new Error('setor que não existe: '+n);
      db.prepare('INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)').run(id, s); });
    (p.concede||[]).forEach(c => db.prepare('INSERT INTO usuario_excecao (usuario_id,chave,concede) VALUES (?,?,1)').run(id, c));
    (p.revoga||[]).forEach(c => db.prepare('INSERT INTO usuario_excecao (usuario_id,chave,concede) VALUES (?,?,0)').run(id, c));
    app.locals.acesso.sincronizarAreas(id);
    pessoas.push(Object.assign({ id }, p));
  }
  return { db, dir, app, rotas, AC: app.locals.acesso, pessoas,
    fechar(){ try{ db.close(); }catch(e){} fs.rmSync(dir, { recursive:true, force:true }); } };
}

/* O retrato de uma pessoa: as telas que ela abre, as permissões efetivas e
   para onde vai depois do PIN. */
function retrato(B, p, rotas){
  const u = B.db.prepare('SELECT * FROM usuarios WHERE id=?').get(p.id);
  const abre = (rotas || ROTAS).filter(r => B.AC.decidir(u, r, 'GET').ok);
  const perms = Array.from(B.AC.permissoesDe(p.id)).sort();
  const destino = require('./destino').destino((u.areas||'').split(',').filter(Boolean));
  return { abre, perms, destino: destino.inicial };
}

module.exports = { montar, retrato, PERFIS, ROTAS, SETORES_EXTRAS };
