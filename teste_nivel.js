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
eq('linha criada por SQL direto fica sem nível gravado (vazio não corta nada)', nivelDe(novo), null);
const authTxt = require('fs').readFileSync(__dirname + '/auth.js', 'utf8');
ok('pessoa criada pela tela (auth.js criar) nasce de nível Operação', /INSERT INTO usuarios\(nome,salt,pin_hash,areas,pin_curto,nivel\) VALUES\(\?,\?,\?,\?,\?,'operacao'\)/.test(authTxt));

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
  const d = P.comparar(antes[p.nome], P.retrato(B, p));
  ok(p.nome + ': o mesmo de antes', d === '', d);
}

console.log('\n── 5. FASE 4: antes de ligar, quem perderia alguma coisa? ──');
ok('a conta do corte é do acesso.js', typeof B.AC.cortadasPeloNivel === 'function' && typeof B.AC.setoresAcimaDoNivel === 'function');
const perderiam = B.pessoas.map(p => [p.nome, (B.AC.cortadasPeloNivel ? B.AC.cortadasPeloNivel(p.id) : ['?'])]).filter(x => x[1].length);
ok('pela migração, a lista de quem perderia sai VAZIA', !perderiam.length, JSON.stringify(perderiam));
const acimaS = B.AC.setoresAcimaDoNivel ? B.AC.setoresAcimaDoNivel() : [];
const pv = acimaS.find(x => x.nome === 'Pós-venda');
ok('o setor com chave acima do nível dele entra na lista para o dono decidir', !!pv && pv.acima.indexOf('devolucao.baixar') >= 0, JSON.stringify(acimaS));
ok('   e nada foi apagado dele', B.db.prepare("SELECT COUNT(*) n FROM setor_permissao sp JOIN setores s ON s.id=sp.setor_id WHERE s.nome='Pós-venda'").get().n === 4);

console.log('\n── 6. o nível é o TETO (R-NIV-02) ──');
const edv = pessoa('Edvaldo');
B.db.prepare("INSERT INTO usuario_excecao (usuario_id,chave,concede) VALUES (?,'custo.ver',1)").run(edv.id);
ok('operador com exceção de nível Admin gravada no banco: a permissão não vale', !B.AC.permissoesDe(edv.id).has('custo.ver'));
eq('   e ele NÃO abre o Admin', B.AC.decidir(sessao(edv), '/', 'GET').ok, false);
eq('   continua abrindo a tela dele', B.AC.decidir(sessao(edv), '/operador', 'GET').ok, true);
ok('   e a exceção não foi apagada (a trava nunca apaga)', !!B.db.prepare("SELECT 1 FROM usuario_excecao WHERE usuario_id=? AND chave='custo.ver'").get(edv.id));
ok('   o relatório mostra o que está cortado', (B.AC.cortadasPeloNivel(edv.id) || []).indexOf('custo.ver') >= 0);
B.db.prepare("DELETE FROM usuario_excecao WHERE usuario_id=? AND chave='custo.ver'").run(edv.id);
const ser = pessoa('Sergio');
B.db.prepare("INSERT INTO usuario_excecao (usuario_id,chave,concede) VALUES (?,'pessoas.gerenciar',1)").run(ser.id);
eq('Supervisor, mesmo com pessoas.gerenciar no banco, não abre Acessos', B.AC.decidir(sessao(ser), '/acessos', 'GET').ok, false);
eq('   nem o Admin', B.AC.decidir(sessao(ser), '/', 'GET').ok, false);
B.db.prepare("DELETE FROM usuario_excecao WHERE usuario_id=? AND chave='pessoas.gerenciar'").run(ser.id);
const luc = pessoa('Lucas');
ok('o Admin Geral continua passando por nível em tudo', ['/', '/acessos', '/operador', '/baixar-backup'].every(r => B.AC.decidir(sessao(luc), r, 'GET').ok));

console.log('\n── 7. conceder acima do nível é RECUSADO NA HORA, dizendo por quê (R-NIV-03) ──');
r = chamar(B, 'POST', '/api/acesso/usuario/:id/excecao', { chave:'custo.ver', concede:true }, { id:edv.id }, sessao(luc));
eq('exceção de nível Admin para quem é Operação: 400', r.status, 400);
ok('   com a frase "exige nível Admin — a pessoa é nível Operação"', /exige nível Admin — a pessoa é nível Operação/.test((r.body || {}).erro || ''), JSON.stringify(r.body));
ok('   e nada foi gravado', !B.db.prepare("SELECT 1 FROM usuario_excecao WHERE usuario_id=? AND chave='custo.ver'").get(edv.id));
r = chamar(B, 'POST', '/api/acesso/usuario/:id/excecao', { chave:'painel.ver', concede:false }, { id:edv.id }, sessao(luc));
eq('revogar continua livre para qualquer nível', r.status, 200);
chamar(B, 'POST', '/api/acesso/usuario/:id/excecao', { chave:'painel.ver', limpar:true }, { id:edv.id }, sessao(luc));
r = chamar(B, 'POST', '/api/acesso/usuario/:id/excecao', { chave:'relatorios.ver', concede:true }, { id:pessoa('Paulo').id }, sessao(luc));
eq('exceção dentro do nível passa', r.status, 200);
const sid = nome => B.db.prepare('SELECT id FROM setores WHERE nome=?').get(nome).id;
const setoresDe = id => B.db.prepare('SELECT setor_id FROM usuario_setor WHERE usuario_id=? ORDER BY setor_id').all(id).map(x => x.setor_id);
const antesSet = setoresDe(edv.id);
r = chamar(B, 'POST', '/api/acesso/usuario/:id/setores', { setores:[sid('Operador / Revisão'), sid('Admin')] }, { id:edv.id }, sessao(luc));
eq('pôr quem é Operação no setor Admin: 400', r.status, 400);
ok('   com a frase, nomeando o setor', /exige nível Admin — a pessoa é nível Operação/.test((r.body || {}).erro || '') && /Admin/.test(r.body.erro), JSON.stringify(r.body));
eq('   e os setores dele não mudaram', JSON.stringify(setoresDe(edv.id)), JSON.stringify(antesSet));
r = chamar(B, 'POST', '/api/acesso/usuario/:id/setores', { setores:[sid('Operador / Revisão'), sid('Operador / Embalagem')] }, { id:edv.id }, sessao(luc));
eq('setor do nível dele passa', r.status, 200);
r = chamar(B, 'POST', '/api/acesso/usuario/:id/setores', { setores:[sid('Operador / Revisão'), sid('Pós-venda')] }, { id:edv.id }, sessao(luc));
eq('setor marcado Operação, mas com chave Admin dentro, também é recusado para quem é Operação', r.status, 400);
chamar(B, 'POST', '/api/acesso/usuario/:id/setores', { setores:[sid('Operador / Revisão')] }, { id:edv.id }, sessao(luc));
const ren = pessoa('Renato');
r = chamar(B, 'POST', '/api/acesso/usuario/:id/setores', { setores:[sid('Pós-venda'), sid('Operador / Revisão')] }, { id:ren.id }, sessao(luc));
eq('quem já está num setor não é recusado por ele ao salvar de novo', r.status, 200);

const ana = pessoa('Ana');
chamar(B, 'POST', R, { nivel:'supervisor' }, { id:ana.id }, sessao(luc));
eq('o Admin Geral baixa a Ana para Supervisor: ela deixa de abrir o Admin', B.AC.decidir(sessao(ana), '/', 'GET').ok, false);
ok('   e o setor dela não foi tocado', setoresDe(ana.id).indexOf(sid('Admin')) >= 0);
r = chamar(B, 'POST', '/api/acesso/usuario/:id/setores', { setores:[sid('Admin')] }, { id:ana.id }, sessao(luc));
eq('salvar a ficha dela com o setor que ela JÁ tem não é recusado', r.status, 200);
chamar(B, 'POST', R, { nivel:'admin' }, { id:ana.id }, sessao(luc));
eq('subindo de volta, ela abre o Admin de novo (nada se perdeu)', B.AC.decidir(sessao(ana), '/', 'GET').ok, true);

console.log('\n── 8. o setor só aceita o que cabe no nível dele (R-ALC-04) ──');
const sup = B.db.prepare("SELECT * FROM setores WHERE nome='Supervisor'").get();
const supPerms = B.db.prepare('SELECT chave FROM setor_permissao WHERE setor_id=?').all(sup.id).map(x => x.chave);
r = chamar(B, 'POST', '/api/acesso/setores', { id:sup.id, nome:sup.nome, nivel:sup.nivel, todas:true, permissoes:supPerms.concat(['custo.ver']), confirmar:true }, {}, sessao(luc));
eq('marcar no Supervisor uma chave Admin: 400', r.status, 400);
ok('   "exige nível Admin — o setor é nível Supervisor"', /exige nível Admin — o setor é nível Supervisor/.test((r.body || {}).erro || ''), JSON.stringify(r.body));
eq('   e o setor não mudou', B.db.prepare('SELECT COUNT(*) n FROM setor_permissao WHERE setor_id=?').get(sup.id).n, supPerms.length);
const pvS = B.db.prepare("SELECT * FROM setores WHERE nome='Pós-venda'").get();
const pvPerms = B.db.prepare('SELECT chave FROM setor_permissao WHERE setor_id=?').all(pvS.id).map(x => x.chave);
r = chamar(B, 'POST', '/api/acesso/setores', { id:pvS.id, nome:'Pós-venda', nivel:'operacao', todas:true, permissoes:pvPerms }, {}, sessao(luc));
eq('o setor que JÁ tinha chave acima do nível salva de novo sem perder nada', r.status + '/' + B.db.prepare('SELECT COUNT(*) n FROM setor_permissao WHERE setor_id=?').get(pvS.id).n, '200/4');
r = chamar(B, 'POST', '/api/acesso/setores', { nome:'Setor Novo', nivel:'operacao', todas:true, permissoes:['revisao.executar','custo.ver'], confirmar:true }, {}, sessao(luc));
eq('setor novo de Operação com chave Admin: 400', r.status, 400);
r = chamar(B, 'POST', '/api/acesso/setores', { nome:'Setor Novo', todas:true, permissoes:['revisao.executar'] }, {}, sessao(luc));
eq('setor novo sem nível: 400', r.status, 400);

console.log('\n── 9. a porta do Admin é o NÍVEL da pessoa ──');
const nina = pessoa('Nina');
eq('Nina (Operação, sem nada) não abre o Admin', B.AC.decidir(sessao(nina), '/', 'GET').ok, false);
chamar(B, 'POST', R, { nivel:'admin' }, { id:nina.id }, sessao(luc));
eq('o Admin Geral a sobe para Admin: ela passa a abrir a porta do Admin', B.AC.decidir(sessao(nina), '/', 'GET').ok, true);
chamar(B, 'POST', R, { nivel:'operacao' }, { id:nina.id }, sessao(luc));
eq('Ana (Admin) abre o Admin', B.AC.decidir(sessao(pessoa('Ana')), '/', 'GET').ok, true);
eq('Sergio (Supervisor) não abre', B.AC.decidir(sessao(ser), '/', 'GET').ok, false);

console.log('\n── 4. o relatório (nivel_relatorio.js) só lê ──');
(async () => {
  const fs = require('fs'), path = require('path');
  const arq = path.join(B.dir, 'p.db');
  B.db.pragma('wal_checkpoint(TRUNCATE)');
  const antesBytes = fs.readFileSync(arq);
  const rel = await require('./nivel_relatorio').relatorio(arq);
  ok('lista todas as pessoas, com o nível', rel.lista.length === B.pessoas.length + 1 && rel.lista.every(p => !!p.nivel), rel.lista.length);
  ok('   a Ana aparece como Admin', (rel.lista.find(p => /^Ana/.test(p.nome)) || {}).nivel === 'admin');
  ok('o relatório traz a lista de quem perderia (vazia) e a dos setores', Array.isArray(rel.perderia) && Array.isArray(rel.setoresAcima), JSON.stringify(rel.perderia));
  ok('e o banco de origem não foi tocado (byte a byte)', Buffer.compare(antesBytes, fs.readFileSync(arq)) === 0);
  B.fechar();
  console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('  FALHOU — o relatório estourou: ' + e.message); process.exit(1); });
