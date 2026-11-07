#!/usr/bin/env node
/* A SIMULACAO DOS SCRIPTS DE MIGRACAO DA COMPRAS NAO GRAVA NADA (revisao do PR
 * #305). Os dois scripts rodavam o schema (garantirSchemaCompras e a migracao
 * do sob medida) nos bancos de VERDADE antes de olhar o --aplicar: a
 * "simulacao" ja mudava a estrutura dos dois bancos.
 *
 *   node teste_migrar_simula.js
 *
 * Roda cada script como o dono rodaria, em bancos vazios numa pasta
 * temporaria, e exige que, sem --aplicar, nenhum dos dois ganhe tabela.
 */
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const Database = require('better-sqlite3');
let n = 0, falhas = 0;
function ok(d, c, det){ n++; if(c) console.log('  ok  ' + n + ' — ' + d); else { falhas++; console.log('  FALHOU ' + n + ' — ' + d + (det ? '\n         ' + det : '')); } }
const tabelas = f => { const d = new Database(f, { readonly:true }); const x = d.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n; d.close(); return x; };

for(const script of ['migrar_enderecos_sobmedida.js', 'migrar_fornecedor_sobmedida.js']){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-sim-'));
  const pcp = path.join(dir, 'dados.db'), sm = path.join(dir, 'sob-medida.db');
  /* um banco "de antes": so o que existia antes das migracoes */
  const p0 = new Database(pcp); p0.exec('CREATE TABLE skus (codigo TEXT PRIMARY KEY); CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT)'); p0.close();
  new Database(sm).close();
  const antesP = tabelas(pcp), antesS = tabelas(sm);
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, script)], { env:Object.assign({}, process.env, { PCP_DIR:dir, BANCO_TECIDO:sm }), encoding:'utf8' });
  ok(script + ': sem --aplicar, o banco do PCP nao ganha tabela', tabelas(pcp) === antesP, 'tabelas: ' + antesP + ' -> ' + tabelas(pcp) + '\n' + (r.stderr || '').slice(0, 300));
  ok(script + ': nem o do sob medida', tabelas(sm) === antesS, 'tabelas: ' + antesS + ' -> ' + tabelas(sm));
  fs.rmSync(dir, { recursive:true, force:true });
}
console.log('');
console.log(falhas ? (falhas + ' de ' + n + ' FALHARAM') : ('todos os ' + n + ' casos passaram'));
process.exit(falhas ? 1 : 0);
