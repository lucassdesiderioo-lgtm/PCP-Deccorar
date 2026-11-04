#!/usr/bin/env node
/* teste_nivel.js — O NÍVEL DA PESSOA (spec ACESSO-POR-TELA-E-NIVEL, fases 3 e 4).
 *
 *   node teste_nivel.js
 *
 * Fase 3: `usuarios.nivel` existe, a migração dá a cada pessoa o MAIOR nível
 * que ela já alcança (R-NIV-05) e roda uma vez só; só o Admin Geral muda o
 * nível, e isso vai para a auditoria (R-NIV-04).
 * Fase 4: o nível é o TETO (R-NIV-02) — ver o fim do arquivo.
 */
const P = require('./perfis_acesso');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){ ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado)); }
function chamar(B, metodo, rota, corpo, params, usuario){
  const h = B.rotas[metodo + ' ' + rota];
  if(!h) throw new Error('rota nao registrada: ' + metodo + ' ' + rota);
  const out = { status:200, body:null };
  const res = { status(c){ out.status = c; return res; }, json(b){ out.body = b; return res; }, send(b){ out.body = b; return res; } };
  h({ body:corpo || {}, params:params || {}, query:{}, headers:{}, socket:{}, usuario }, res);
  return out;
}

const B = P.montar();
const nivelDe = id => (B.db.prepare('SELECT nivel FROM usuarios WHERE id=?').get(id) || {}).nivel;
const pessoa = nome => B.pessoas.find(p => p.nome.indexOf(nome) === 0);
const sessao = p => Object.assign(B.db.prepare('SELECT * FROM usuarios WHERE id=?').get(p.id), { areas:[] });

console.log('\n── 1. a coluna e a migração (fase 3) ──');
const cols = B.db.prepare("SELECT name FROM pragma_table_info('usuarios')").all().map(c => c.name);
ok('usuarios tem a coluna nivel', cols.indexOf('nivel') >= 0, cols.join(','));
ok('a migração é uma função do acesso.js', typeof B.AC.migrarNiveis === 'function');
B.db.prepare("DELETE FROM config WHERE chave='nivel_pessoa_1'").run();
B.AC.migrarNiveis();
const ESPERADO = {
  'Lucas':'admin_geral', 'Ana':'admin', 'Sergio':'supervisor', 'Carla':'admin', 'Fabio':'admin', 'Rui':'operacao',
  'Edvaldo':'operacao', 'Bia':'operacao', 'Davi':'operacao', 'Elis':'operacao', 'Tom':'operacao', 'Gil':'supervisor',
  'Vera':'operacao', 'Otto':'admin', 'Sara':'supervisor', 'Nina':'operacao', 'Paulo':'supervisor',
  'Renato':'admin', 'Lia':'admin', 'Igor':'admin'
};
for(const [nome, niv] of Object.entries(ESPERADO)) eq(nome + ' recebe o maior nível que já alcança: ' + niv, nivelDe(pessoa(nome).id), niv);
ok('a migração se marca em config', !!B.db.prepare("SELECT 1 FROM config WHERE chave='nivel_pessoa_1'").get());
B.db.prepare("UPDATE usuarios SET nivel='operacao' WHERE id=?").run(pessoa('Ana').id);
B.AC.migrarNiveis();
eq('e roda UMA vez só: o nível ajustado depois não volta', nivelDe(pessoa('Ana').id), 'operacao');
B.db.prepare("UPDATE usuarios SET nivel='admin' WHERE id=?").run(pessoa('Ana').id);
const novo = B.db.prepare("INSERT INTO usuarios (nome,pin_hash,salt) VALUES ('Novata','x','y')").run().lastInsertRowid;
eq('pessoa nova nasce de nível Operação', nivelDe(novo), 'operacao');

console.log('\n── 2. só o Admin Geral muda o nível (R-NIV-04) ──');
const R = '/api/acesso/usuario/:id/nivel';
ok('a rota existe', !!B.rotas['POST ' + R]);
let r = chamar(B, 'POST', R, { nivel:'admin' }, { id:pessoa('Edvaldo').id }, sessao(pessoa('Ana')));
eq('o Admin (não Geral) não muda nível: 403', r.status, 403);
eq('   e nada mudou', nivelDe(pessoa('Edvaldo').id), 'operacao');
r = chamar(B, 'POST', R, { nivel:'chefe' }, { id:pessoa('Edvaldo').id }, sessao(pessoa('Lucas')));
eq('nível que não existe: 400', r.status, 400);
r = chamar(B, 'POST', R, { nivel:'supervisor' }, { id:pessoa('Edvaldo').id }, sessao(pessoa('Lucas')));
eq('o Admin Geral muda: 200', r.status, 200);
eq('   e grava', nivelDe(pessoa('Edvaldo').id), 'supervisor');
const aud = B.db.prepare("SELECT * FROM auditoria WHERE acao='usuario_nivel' ORDER BY id DESC").get();
ok('   e vai para a auditoria, com o de antes e o de depois', !!aud && /operacao/.test(aud.detalhe) && /supervisor/.test(aud.detalhe), JSON.stringify(aud));
r = chamar(B, 'POST', R, { nivel:'admin' }, { id:pessoa('Lucas').id }, sessao(pessoa('Lucas')));
eq('quem está no setor Admin Geral não desce de nível por aqui: 400', r.status, 400);
eq('   e continua Admin Geral', nivelDe(pessoa('Lucas').id), 'admin_geral');
r = chamar(B, 'POST', R, { nivel:'admin' }, { id:99999 }, sessao(pessoa('Lucas')));
eq('pessoa que não existe: 404', r.status, 404);
r = chamar(B, 'GET', '/api/acesso/usuario/:id', null, { id:pessoa('Edvaldo').id }, sessao(pessoa('Lucas')));
eq('a ficha da pessoa diz o nível dela', r.body && r.body.nivel, 'supervisor');
chamar(B, 'POST', R, { nivel:'operacao' }, { id:pessoa('Edvaldo').id }, sessao(pessoa('Lucas')));

console.log('\n── 3. a fase 3 não trava nada: o retrato pessoa a pessoa não mudou ──');
const antes = JSON.parse(require('fs').readFileSync(__dirname + '/teste_mapa_antes.json', 'utf8'));
for(const p of B.pessoas){
  const a = P.retrato(B, p), e = antes[p.nome];
  ok(p.nome + ': o mesmo de antes', JSON.stringify(a) === JSON.stringify(e), JSON.stringify(e) + '\n         ' + JSON.stringify(a));
}

console.log('\n── 4. o relatório (nivel_relatorio.js) só lê ──');
(async () => {
  const fs = require('fs'), path = require('path');
  const arq = path.join(B.dir, 'p.db');
  B.db.pragma('wal_checkpoint(TRUNCATE)');
  const antesBytes = fs.readFileSync(arq);
  const rel = await require('./nivel_relatorio').relatorio(arq);
  ok('lista todas as pessoas, com o nível', rel.lista.length === B.pessoas.length + 1 && rel.lista.every(p => !!p.nivel), rel.lista.length);
  ok('   a Ana aparece como Admin', (rel.lista.find(p => /^Ana/.test(p.nome)) || {}).nivel === 'admin');
  ok('e o banco de origem não foi tocado (byte a byte)', Buffer.compare(antesBytes, fs.readFileSync(arq)) === 0);
  B.fechar();
  console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('  FALHOU — o relatório estourou: ' + e.message); process.exit(1); });
