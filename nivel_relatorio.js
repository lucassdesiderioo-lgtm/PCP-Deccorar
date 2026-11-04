#!/usr/bin/env node
/* nivel_relatorio.js — SÓ LÊ. O nível de cada pessoa e quem perderia alguma
 * coisa com a trava do nível (spec ACESSO-POR-TELA-E-NIVEL, fases 3 e 4).
 *
 *   node nivel_relatorio.js            (o banco de produção, de caminhos.js)
 *   node nivel_relatorio.js outro.db
 *
 * NÃO GRAVA NADA NO BANCO. Ele copia o banco com `db.backup()` para uma pasta
 * temporária (a cópia que o backup.js faz, nunca `cp`, por causa do WAL — §12)
 * e sobe o acesso.js EM CIMA DA CÓPIA: a migração do nível, se ainda não rodou,
 * roda na cópia, e a conta da trava é a mesma do servidor — e não uma segunda
 * régua escrita aqui (#12). A cópia é apagada no fim.
 *
 * Imprime:
 *   1. cada pessoa ativa, com o nível, os setores e de onde o nível veio
 *      (a lista para o dono ajustar pessoa a pessoa);
 *   2. quem PERDERIA alguma permissão se a trava cortasse no nível de hoje
 *      (pela migração, a lista tem que sair VAZIA);
 *   3. os setores que carregam permissão acima do nível deles (não se apaga
 *      nada: é a lista para o dono decidir, R-ALC-04).
 */
const fs = require('fs'), os = require('os'), path = require('path');
const Database = require('better-sqlite3');
const caminhos = require('./caminhos');

const NOME = { operacao:'Operação', supervisor:'Supervisor', admin:'Admin', admin_geral:'Admin Geral' };

async function relatorio(origem){
  if(!fs.existsSync(origem)) throw new Error('banco não encontrado: ' + origem);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nivel-rel-'));
  const copia = path.join(dir, 'copia.db');
  const fonte = new Database(origem, { readonly:true, fileMustExist:true });
  await fonte.backup(copia);
  fonte.close();
  const db = new Database(copia);
  const app = { locals:{}, router:{ stack:[] }, get(){}, post(){}, delete(){} };
  const log = console.log; console.log = () => {};
  /* O auth.js NAO sobe aqui: ele grava o `.session_secret` quando falta. A
     coluna `nivel` o acesso.js garante sozinho. */
  try{ require('./acesso')(app, db); } finally { console.log = log; }
  const AC = app.locals.acesso;
  const pessoas = db.prepare('SELECT id,nome,nivel,ativo FROM usuarios ORDER BY nome').all();
  const setoresDe = id => db.prepare(`SELECT s.nome FROM usuario_setor us JOIN setores s ON s.id=us.setor_id
    WHERE us.usuario_id=? AND s.ativo=1 ORDER BY s.nome`).all(id).map(s => s.nome);
  const lista = pessoas.map(p => ({ id:p.id, nome:p.nome, ativo:!!p.ativo, nivel:p.nivel || 'operacao',
    alcanca:AC.nivelAlcancado(p.id), setores:setoresDe(p.id) }));
  const perderia = typeof AC.cortadasPeloNivel === 'function'
    ? pessoas.map(p => ({ nome:p.nome, nivel:p.nivel, cortadas:AC.cortadasPeloNivel(p.id) })).filter(x => x.cortadas.length)
    : null;
  const setoresAcima = typeof AC.setoresAcimaDoNivel === 'function' ? AC.setoresAcimaDoNivel() : null;
  db.close(); fs.rmSync(dir, { recursive:true, force:true });
  return { lista, perderia, setoresAcima };
}

if(require.main === module){
  const origem = process.argv[2] || caminhos.BANCO;
  relatorio(origem).then(r => {
    console.log('\n1. O NÍVEL DE CADA PESSOA (' + r.lista.filter(p => p.ativo).length + ' ativas)\n');
    r.lista.filter(p => p.ativo).forEach(p => console.log('  ' + p.nome.padEnd(28) + (NOME[p.nivel] || p.nivel).padEnd(13)
      + (p.alcanca !== p.nivel ? ' (alcança ' + NOME[p.alcanca] + ')' : '').padEnd(22) + p.setores.join(' · ')));
    const inativas = r.lista.filter(p => !p.ativo);
    if(inativas.length) console.log('\n  inativas: ' + inativas.map(p => p.nome + ' (' + NOME[p.nivel] + ')').join(', '));
    console.log('\n2. QUEM PERDERIA ALGUMA PERMISSÃO COM A TRAVA DO NÍVEL');
    if(r.perderia === null) console.log('  (a trava do nível ainda não existe neste código)');
    else if(!r.perderia.length) console.log('  ninguém — a lista saiu vazia');
    else r.perderia.forEach(x => console.log('  ' + x.nome + ' (' + NOME[x.nivel] + '): ' + x.cortadas.join(', ')));
    console.log('\n3. SETORES COM PERMISSÃO ACIMA DO NÍVEL DELES (nada é apagado; é para decidir)');
    if(r.setoresAcima === null) console.log('  (a conta ainda não existe neste código)');
    else if(!r.setoresAcima.length) console.log('  nenhum');
    else r.setoresAcima.forEach(s => console.log('  ' + s.nome + ' (' + NOME[s.nivel] + '): ' + s.acima.join(', ')));
    console.log('');
  }).catch(e => { console.error('ERRO: ' + e.message); process.exit(1); });
}
module.exports = { relatorio };
