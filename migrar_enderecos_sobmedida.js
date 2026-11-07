#!/usr/bin/env node
/* UM SISTEMA DE ALMOXARIFADO (spec COMPRAS-E-RECEBIMENTO, fase 10, R-CMP-50).
 *
 *   node migrar_enderecos_sobmedida.js            SIMULA: roda a migracao em
 *                                                 COPIAS dos dois bancos e mostra
 *                                                 a conferencia — nada e gravado
 *   node migrar_enderecos_sobmedida.js --aplicar  backup dos DOIS bancos, aplica e confere
 *
 * Os enderecos do sob medida (armazens ROLO e SOBRA, com as hastes, andares e
 * niveis) passam a ser do PCP: viram os almoxarifados "Tecidos novos" e
 * "Sobras de tecido", com OS MESMOS NOMES, e o id antigo guardado
 * (`origem_sm`, `origem_sm_id`). No sob medida, cada linha ganha o id do PCP
 * ao lado, e o rolo e a sobra ganham o nivel do PCP e o nome dele
 * (`nivel_pcp_id`, `nivel_pcp_nome`). Rolo, sobra e corte continuam no
 * tecido.db, apontando o MESMO `nivel_id` de sempre.
 *
 * ⚠️ A CONFERENCIA: todo rolo e toda sobra com endereco tem de continuar com o
 * MESMO endereco (o nome do nivel do PCP = o nome de antes), e a contagem por
 * endereco antes = depois. Divergencia: o script sai com erro, e os backups
 * estao na pasta de backups para voltar.
 *
 * ⚠️ DOIS BANCOS, SEM TRANSACAO ENTRE ELES: o PCP numa transacao, depois o sob
 * medida numa transacao. Rodar de novo e seguro (nada duplica).
 */
const path = require('path'), fs = require('fs'), os = require('os');
const NOME_ALMOX = { ROLO:'Tecidos novos', SOBRA:'Sobras de tecido' };

function planejar(pcp, sm){
  return sm.prepare('SELECT * FROM armazem ORDER BY ordem').all().map(a => {
    const pa = pcp.prepare('SELECT id, nome FROM almoxarifado WHERE origem_sm=?').get(a.chave);
    return { chave:a.chave, nome_sm:a.nome, almoxarifado: pa ? pa.nome : (NOME_ALMOX[a.chave] || a.nome), ja:!!(pa && a.pcp_almox_id),
      hastes: sm.prepare('SELECT COUNT(*) n FROM haste WHERE armazem_chave=?').get(a.chave).n,
      niveis: sm.prepare('SELECT COUNT(*) n FROM nivel n JOIN andar d ON d.id=n.andar_id JOIN haste h ON h.id=d.haste_id WHERE h.armazem_chave=?').get(a.chave).n,
      rolos: sm.prepare("SELECT COUNT(*) n FROM rolo r JOIN nivel n ON n.id=r.nivel_id JOIN andar d ON d.id=n.andar_id JOIN haste h ON h.id=d.haste_id WHERE h.armazem_chave=? AND r.status<>'encerrado'").get(a.chave).n,
      sobras: sm.prepare("SELECT COUNT(*) n FROM sobra s JOIN nivel n ON n.id=s.nivel_id JOIN andar d ON d.id=n.andar_id JOIN haste h ON h.id=d.haste_id WHERE h.armazem_chave=? AND s.status='disponivel'").get(a.chave).n };
  });
}

/* O endereco de cada rolo e sobra, pelo lado do sob medida (antes) e pelo do
   PCP (depois). Um mapa "tipo:id" -> "almox · haste · andar · nivel". */
function enderecosSm(sm){
  const m = {};
  const q = t => sm.prepare(`SELECT x.id, a.chave, h.nome haste, d.nome andar, n.nome nivel FROM ${t} x JOIN nivel n ON n.id=x.nivel_id
    JOIN andar d ON d.id=n.andar_id JOIN haste h ON h.id=d.haste_id JOIN armazem a ON a.chave=h.armazem_chave`).all();
  for(const t of ['rolo', 'sobra']) for(const r of q(t)) m[t + ':' + r.id] = [NOME_ALMOX[r.chave] || r.chave, r.haste, r.andar, r.nivel].join(' · ');
  return m;
}
function enderecosPcp(pcp, sm){
  const m = {};
  for(const t of ['rolo', 'sobra'])
    for(const r of sm.prepare(`SELECT id, nivel_pcp_id FROM ${t} WHERE nivel_id IS NOT NULL`).all()){
      const n = r.nivel_pcp_id ? pcp.prepare(`SELECT a.nome alm, h.nome haste, d.nome andar, n.nome nivel FROM alm_nivel n JOIN alm_andar d ON d.id=n.andar_id
        JOIN alm_haste h ON h.id=d.haste_id JOIN almoxarifado a ON a.id=h.almoxarifado_id WHERE n.id=?`).get(r.nivel_pcp_id) : null;
      m[t + ':' + r.id] = n ? [n.alm, n.haste, n.andar, n.nivel].join(' · ') : null;
    }
  return m;
}
function conferir(pcp, sm, antes){
  const depois = enderecosPcp(pcp, sm);
  const div = [];
  for(const k of Object.keys(antes)) if(antes[k] !== depois[k]) div.push(k + ': antes "' + antes[k] + '", depois "' + depois[k] + '"');
  const conta = m => { const c = {}; for(const k of Object.keys(m)) c[m[k]] = (c[m[k]] || 0) + 1; return c; };
  const ca = conta(antes), cd = conta(depois);
  for(const e of Object.keys(ca)) if(ca[e] !== cd[e]) div.push('o endereço "' + e + '" tinha ' + ca[e] + ' e ficou com ' + (cd[e] || 0));
  return { conferidos:Object.keys(antes).length, divergencias:div };
}

function aplicar(pcp, sm){
  const antes = enderecosSm(sm);
  const mapa = { haste:{}, andar:{}, nivel:{}, almox:{} };
  pcp.transaction(() => {
    for(const a of sm.prepare('SELECT * FROM armazem').all()){
      let pa = pcp.prepare('SELECT id FROM almoxarifado WHERE origem_sm=?').get(a.chave);
      if(!pa){
        const nome = NOME_ALMOX[a.chave] || a.nome;
        const ja = pcp.prepare('SELECT id, origem_sm FROM almoxarifado WHERE nome=? COLLATE NOCASE').get(nome);
        pa = ja && !ja.origem_sm ? (pcp.prepare('UPDATE almoxarifado SET origem_sm=? WHERE id=?').run(a.chave, ja.id), { id:ja.id })
          : { id:pcp.prepare("INSERT INTO almoxarifado (nome, finalidade, origem_sm) VALUES (?,?,?)").run(nome, a.chave === 'ROLO' ? 'rolos do sob medida' : 'sobras do sob medida', a.chave).lastInsertRowid };
      }
      mapa.almox[a.chave] = pa.id;
      for(const h of sm.prepare('SELECT * FROM haste WHERE armazem_chave=?').all(a.chave)){
        pcp.prepare('INSERT OR IGNORE INTO alm_haste (almoxarifado_id, nome, ordem, ativo, origem_sm_id) VALUES (?,?,?,?,?)').run(pa.id, h.nome, h.ordem || 0, h.ativo ? 1 : 0, h.id);
        const ph = pcp.prepare('SELECT id FROM alm_haste WHERE almoxarifado_id=? AND nome=?').get(pa.id, h.nome).id;
        pcp.prepare('UPDATE alm_haste SET origem_sm_id=COALESCE(origem_sm_id,?) WHERE id=?').run(h.id, ph);
        mapa.haste[h.id] = ph;
        for(const d of sm.prepare('SELECT * FROM andar WHERE haste_id=?').all(h.id)){
          pcp.prepare('INSERT OR IGNORE INTO alm_andar (haste_id, nome, ordem, ativo, origem_sm_id) VALUES (?,?,?,?,?)').run(ph, d.nome, d.ordem || 0, d.ativo ? 1 : 0, d.id);
          const pd = pcp.prepare('SELECT id FROM alm_andar WHERE haste_id=? AND nome=?').get(ph, d.nome).id;
          mapa.andar[d.id] = pd;
          for(const n of sm.prepare('SELECT * FROM nivel WHERE andar_id=?').all(d.id)){
            pcp.prepare('INSERT OR IGNORE INTO alm_nivel (andar_id, nome, ordem, ativo, origem_sm_id) VALUES (?,?,?,?,?)').run(pd, n.nome, n.ordem || 0, n.ativo ? 1 : 0, n.id);
            mapa.nivel[n.id] = pcp.prepare('SELECT id FROM alm_nivel WHERE andar_id=? AND nome=?').get(pd, n.nome).id;
          }
        }
      }
    }
  })();
  sm.transaction(() => {
    for(const ch of Object.keys(mapa.almox)){
      const nome = pcp.prepare('SELECT nome FROM almoxarifado WHERE id=?').get(mapa.almox[ch]).nome;
      sm.prepare('UPDATE armazem SET pcp_almox_id=?, pcp_nome=? WHERE chave=?').run(mapa.almox[ch], nome, ch);
    }
    for(const t of ['haste', 'andar', 'nivel']) for(const id of Object.keys(mapa[t])) sm.prepare('UPDATE ' + t + ' SET pcp_id=? WHERE id=?').run(mapa[t][id], +id);
    const nomeNivel = id => { const n = pcp.prepare(`SELECT a.nome alm, h.nome haste, d.nome andar, n.nome nivel FROM alm_nivel n JOIN alm_andar d ON d.id=n.andar_id
      JOIN alm_haste h ON h.id=d.haste_id JOIN almoxarifado a ON a.id=h.almoxarifado_id WHERE n.id=?`).get(id); return n ? [n.alm, n.haste, n.andar, n.nivel].join(' · ') : null; };
    for(const t of ['rolo', 'sobra'])
      for(const r of sm.prepare('SELECT id, nivel_id FROM ' + t + ' WHERE nivel_id IS NOT NULL').all()){
        const p = mapa.nivel[r.nivel_id];
        sm.prepare('UPDATE ' + t + ' SET nivel_pcp_id=?, nivel_pcp_nome=? WHERE id=?').run(p || null, p ? nomeNivel(p) : null, r.id);
      }
  })();
  return conferir(pcp, sm, antes);
}

async function principal(){
  const Database = require('better-sqlite3');
  const caminhos = require('./caminhos');
  const BANCO_SM = require('./tecido/nucleo/caminho').BANCO;
  if(!fs.existsSync(BANCO_SM)){ console.log('o banco do sob medida não existe em ' + BANCO_SM + ' — nada a migrar'); return; }
  const aplicarAgora = process.argv.indexOf('--aplicar') >= 0;
  let pcp = new Database(caminhos.BANCO), sm = new Database(BANCO_SM);
  require('./compras_schema').garantirSchemaCompras(pcp);
  require('./tecido/nucleo/schema').aplicar(sm);
  const plano = planejar(pcp, sm);
  console.log('O QUE VAI SER MIGRADO:');
  for(const p of plano) console.log('  · ' + p.chave + ' (' + p.nome_sm + ') → almoxarifado "' + p.almoxarifado + '"' + (p.ja ? ' (já migrado)' : '') + ': ' + p.hastes + ' haste(s), ' + p.niveis + ' nível(is), ' + p.rolos + ' rolo(s) e ' + p.sobras + ' sobra(s) com endereço');
  if(!aplicarAgora){
    /* A SIMULACAO roda a migracao em COPIAS (db.backup), e confere. */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-almox-'));
    await pcp.backup(path.join(tmp, 'dados.db')); await sm.backup(path.join(tmp, 'sob-medida.db'));
    pcp.close(); sm.close();
    const p2 = new Database(path.join(tmp, 'dados.db')), s2 = new Database(path.join(tmp, 'sob-medida.db'));
    const r = aplicar(p2, s2);
    console.log('SIMULAÇÃO (nas cópias, nada gravado): ' + r.conferidos + ' rolo(s)/sobra(s) conferido(s), ' + r.divergencias.length + ' divergência(s)');
    r.divergencias.slice(0, 30).forEach(d => console.log('  ✗ ' + d));
    p2.close(); s2.close(); fs.rmSync(tmp, { recursive:true, force:true });
    console.log(r.divergencias.length ? 'NÃO APLIQUE: há divergência.' : 'Tudo bate. Para gravar: node migrar_enderecos_sobmedida.js --aplicar');
    if(r.divergencias.length) process.exitCode = 1;
    return;
  }
  fs.mkdirSync(caminhos.BACKUPS, { recursive:true });
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  await pcp.backup(path.join(caminhos.BACKUPS, 'dados-antes-almox-' + carimbo + '.db'));
  await sm.backup(path.join(caminhos.BACKUPS, 'tecido-antes-almox-' + carimbo + '.db'));
  console.log('backup dos dois bancos em ' + caminhos.BACKUPS + ' (…-antes-almox-' + carimbo + '.db)');
  const r = aplicar(pcp, sm);
  console.log('APLICADO: ' + r.conferidos + ' rolo(s)/sobra(s) conferido(s), ' + r.divergencias.length + ' divergência(s)');
  r.divergencias.slice(0, 30).forEach(d => console.log('  ✗ ' + d));
  if(r.divergencias.length){ console.log('HÁ DIVERGÊNCIA: volte os dois backups acima (pm2 parado) e chame o suporte.'); process.exitCode = 1; }
  else console.log('Conferido: todo rolo e toda sobra continuam no mesmo endereço. Reinicie o servidor (pm2 delete/start).');
  pcp.close(); sm.close();
}

if(require.main === module) principal().catch(e => { console.error(e); process.exit(1); });
module.exports = { planejar, aplicar, conferir, enderecosSm, enderecosPcp, NOME_ALMOX };
