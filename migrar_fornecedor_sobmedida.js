#!/usr/bin/env node
/* UM CADASTRO DE FORNECEDOR SO (spec COMPRAS-E-RECEBIMENTO, fase 9, R-CMP-11).
 *
 *   node migrar_fornecedor_sobmedida.js            simula: lista o que faria
 *   node migrar_fornecedor_sobmedida.js --aplicar  grava, com backup dos DOIS bancos antes
 *
 * Cada fornecedor do sob medida (`tecido.db`, tabela `fornecedor`) passa a
 * apontar para um fornecedor do PCP (`dados.db`): o de mesmo nome (sem
 * diferenca de maiuscula e de espaco), ou um novo, criado no PCP com o tipo
 * "distribuidor" em branco para alguem completar. O fornecedor do sob medida
 * NAO e apagado nem renomeado, e o texto antigo do rolo (`rolo.fornecedor`) fica
 * como estava: o rolo ganha `fornecedor_pcp_id` ao lado.
 *
 * ⚠️ SAO DOIS BANCOS E NAO HA TRANSACAO ENTRE ELES. A ordem e: backup dos dois,
 * a escrita no PCP numa transacao, depois a do sob medida numa transacao. Rodar
 * de novo e seguro: quem ja tem o vinculo e pulado, e o PCP nao ganha duplicado.
 */
const path = require('path');

const norm = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

function planejar(pcp, sm){
  const fs = sm.prepare('SELECT id, nome, ativo, fornecedor_pcp_id FROM fornecedor ORDER BY nome').all();
  const pcps = pcp.prepare('SELECT id, nome FROM fornecedor').all();
  return fs.map(f => {
    if(f.fornecedor_pcp_id && pcps.some(p => p.id === f.fornecedor_pcp_id)) return { sm_id:f.id, nome:f.nome, acao:'ja_ligado', pcp_id:f.fornecedor_pcp_id };
    const igual = pcps.find(p => norm(p.nome) === norm(f.nome));
    if(igual) return { sm_id:f.id, nome:f.nome, acao:'ligar', pcp_id:igual.id, pcp_nome:igual.nome };
    return { sm_id:f.id, nome:f.nome, acao:'criar_no_pcp', pcp_id:null };
  });
}

function aplicar(pcp, sm){
  const plano = planejar(pcp, sm);
  pcp.transaction(() => {
    /* dois do sob medida com o mesmo nome ('Ecotex' e 'ecotex', a duplicata da
       migracao antiga) viram UM do PCP */
    const criados = {};
    for(const p of plano){
      if(p.acao !== 'criar_no_pcp') continue;
      const k = norm(p.nome);
      if(!criados[k]) criados[k] = pcp.prepare("INSERT INTO fornecedor (nome, observacao) VALUES (?, 'veio do cadastro do sob medida (fase 9)')").run(p.nome.trim()).lastInsertRowid;
      p.pcp_id = criados[k];
    }
  })();
  sm.transaction(() => {
    for(const p of plano){
      if(p.acao === 'ja_ligado') continue;
      sm.prepare('UPDATE fornecedor SET fornecedor_pcp_id=? WHERE id=?').run(p.pcp_id, p.sm_id);
      sm.prepare('UPDATE rolo SET fornecedor_pcp_id=? WHERE fornecedor_id=? AND fornecedor_pcp_id IS NULL').run(p.pcp_id, p.sm_id);
    }
  })();
  return plano;
}

async function principal(){
  const Database = require('better-sqlite3');
  const caminhos = require('./caminhos');
  const BANCO_SM = require('./tecido/nucleo/caminho').BANCO;
  const fs = require('fs');
  if(!fs.existsSync(BANCO_SM)){ console.log('o banco do sob medida não existe em ' + BANCO_SM + ' — nada a migrar'); return; }
  const pcp = new Database(caminhos.BANCO), sm = new Database(BANCO_SM);
  require('./tecido/nucleo/schema').aplicar(sm);   // a coluna fornecedor_pcp_id (migracao 40)
  const aplicarAgora = process.argv.indexOf('--aplicar') >= 0;
  const plano = planejar(pcp, sm);
  console.log((aplicarAgora ? 'APLICANDO' : 'SIMULAÇÃO (nada gravado — rode com --aplicar)') + ': ' + plano.length + ' fornecedor(es) do sob medida');
  for(const p of plano) console.log('  · ' + p.nome + ' → ' + (p.acao === 'ja_ligado' ? 'já ligado ao PCP #' + p.pcp_id : p.acao === 'ligar' ? 'ligar ao PCP #' + p.pcp_id + ' (' + p.pcp_nome + ')' : 'criar no PCP'));
  if(aplicarAgora){
    fs.mkdirSync(caminhos.BACKUPS, { recursive:true });
    const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
    await pcp.backup(path.join(caminhos.BACKUPS, 'dados-antes-fornecedor-sm-' + carimbo + '.db'));
    await sm.backup(path.join(caminhos.BACKUPS, 'tecido-antes-fornecedor-sm-' + carimbo + '.db'));
    console.log('backup dos dois bancos em ' + caminhos.BACKUPS);
    const r = aplicar(pcp, sm);
    console.log('feito: ' + r.filter(x => x.acao !== 'ja_ligado').length + ' ligado(s)/criado(s); rode de novo para conferir (tem que dizer "já ligado" em todos)');
  }
  pcp.close(); sm.close();
}

if(require.main === module) principal().catch(e => { console.error(e); process.exit(1); });
module.exports = { planejar, aplicar };
