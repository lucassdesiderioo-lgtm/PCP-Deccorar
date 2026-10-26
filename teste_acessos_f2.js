/* teste_acessos_f2.js — fase 2 da spec ACESSOS-UNIFICADOS: UMA LISTA SO.
 *
 *   node teste_acessos_f2.js
 *
 * As permissoes do sob medida passam a morar na tela de Acessos do PCP, no
 * grupo "Sob medida", e o modulo deixa de traduzir AREA em PAPEL. A regra da
 * spec e uma so, e e ela que este arquivo trava:
 *
 *   NINGUEM GANHA NEM PERDE NADA NA PASSAGEM.
 *
 * Por isso o teste monta um banco no estado de ANTES (as tres chaves velhas
 * `sobmedida.cortar/cadastrar/vender` nos setores e nas excecoes), calcula com
 * a regua VELHA — copiada aqui, congelada, e nao importada do codigo que esta
 * mudando — o que cada pessoa podia, sobe o acesso.js novo (que migra) e
 * confere, pessoa a pessoa e chave a chave, que o que ela pode depois e o
 * mesmo.
 *
 * Escrito ANTES do codigo (§0, risco vermelho). Banco temporario.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

const PERMISSOES = require('./permissoes');
const SM_PERM = require('./tecido/nucleo/permissoes');
const SM_ACESSO = require('./tecido/nucleo/acesso');
const CHAVES_SM = SM_PERM.CHAVES.map(c => c.chave);
const SETORES_SM = ['serralheria','colecao','montagem','revisao','embalagem'];

/* ── A REGUA VELHA, CONGELADA (como era ate 26/10/2026) ──────────────────── */
const PAPEIS_VELHOS = {
  cortador:['modulo.entrar','cadastro.ler','endereco.criar','parametro.ler','sobra.ler','sobra.criar',
    'sobra.propor','etiqueta.imprimir','rolo.ler','rolo.entrada','rolo.encerrar','plano.calcular',
    'plano.confirmar','corte.pedir_correcao','etiqueta_producao.ler','etiqueta_producao.imprimir'],
  producao:['modulo.entrar','producao.bipar'],
  vendedor:['modulo.entrar','catalogo.ler','custo.ver','revenda.ler','pedido.ler','pedido.lancar',
    'pedido.aprovar','pedido.prazo','boleto.ler','etiqueta_producao.ler']
};
function antesDe(perms, ag){
  const tem = c => ag || perms.has(c);
  const areas = [];
  if(tem('sobmedida.cortar')) areas.push('sobmedida');
  if(tem('sobmedida.cadastrar')) areas.push('sobmedida_adm');
  if(tem('sobmedida.vender')) areas.push('sobmedida_venda');
  SETORES_SM.forEach(s => { if(tem('sobmedida.' + s)) areas.push('sobmedida_' + s); });
  const papel = areas.includes('sobmedida_adm') ? 'diretor'
              : areas.includes('sobmedida') ? 'cortador'
              : areas.includes('sobmedida_venda') ? 'vendedor'
              : SETORES_SM.some(s => areas.includes('sobmedida_' + s)) ? 'producao' : null;
  const setores = SETORES_SM.filter(s => papel === 'diretor' || areas.includes('sobmedida_' + s));
  const pode = new Set();
  if(papel) for(const k of CHAVES_SM){
    if(papel === 'diretor' || PAPEIS_VELHOS[papel].includes(k) || (k === 'producao.bipar' && setores.length)) pode.add(k);
  }
  return { entra: !!papel, pode: [...pode].sort().join(','), setores: setores.join(',') };
}

/* ── A REGUA NOVA: a conta que o portao do modulo faz de verdade ─────────── */
function depoisDe(AC, uid){
  const u = SM_ACESSO.daSessaoDoPcp({ id:uid, nome:'x' }, [...AC.permissoesDe(uid)]);
  if(!u) return { entra:false, pode:'', setores:'' };
  return { entra:true,
           pode: CHAVES_SM.filter(k => SM_PERM.pode(u, k)).sort().join(','),
           setores: (u.setores || []).join(',') };
}

/* ── o banco no estado de ANTES ─────────────────────────────────────────── */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acessos-f2-'));
const db = new Database(path.join(dir, 'teste.db'));
db.exec(`CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT,
    pin_hash TEXT, salt TEXT, areas TEXT, ativo INTEGER DEFAULT 1);
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);`);
const appFalso = () => ({ locals:{}, router:{ stack:[] }, get(){}, post(){}, delete(){} });

/* Primeiro boot com a migracao MARCADA como feita: so serve para criar as
   tabelas e os setores. Depois os setores do sob medida sao reescritos com
   o conteudo VELHO, e a marca sai — e o segundo boot que migra. */
db.prepare("INSERT INTO config (chave,valor) VALUES ('acesso_sobmedida_f2','1')").run();
require('./acesso')(appFalso(), db);
const setorId = nome => db.prepare('SELECT id FROM setores WHERE nome=?').get(nome).id;
const VELHO = {
  'Sob medida / Bancada':  ['sobmedida.cortar','painel.ver','produtividade.propria'],
  'Sob medida / Cadastros':['sobmedida.cortar','sobmedida.cadastrar'],
  'Sob medida / Venda':    ['sobmedida.vender'],
  'Sob medida / Serralheria':['sobmedida.serralheria'], 'Sob medida / Coleção':['sobmedida.colecao'],
  'Sob medida / Montagem':['sobmedida.montagem'], 'Sob medida / Revisão':['sobmedida.revisao'],
  'Sob medida / Embalagem':['sobmedida.embalagem']
};
for(const [nome, perms] of Object.entries(VELHO)){
  const id = setorId(nome);
  db.prepare('DELETE FROM setor_permissao WHERE setor_id=?').run(id);
  perms.forEach(c => db.prepare('INSERT INTO setor_permissao (setor_id,chave) VALUES (?,?)').run(id, c));
}
// E nenhum outro setor carrega chave do sob medida (como era: Admin nao carrega).
db.prepare(`DELETE FROM setor_permissao WHERE chave LIKE 'sobmedida.%'
  AND setor_id NOT IN (SELECT id FROM setores WHERE nome LIKE 'Sob medida /%')`).run();
db.prepare("DELETE FROM config WHERE chave='acesso_sobmedida_f2'").run();

const pessoa = (nome, setores, excecoes) => {
  const id = db.prepare("INSERT INTO usuarios (nome,pin_hash,salt,areas,ativo) VALUES (?,'x','y','',1)").run(nome).lastInsertRowid;
  (setores || []).forEach(s => db.prepare('INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)').run(id, setorId(s)));
  (excecoes || []).forEach(([c, concede]) =>
    db.prepare('INSERT INTO usuario_excecao (usuario_id,chave,concede) VALUES (?,?,?)').run(id, c, concede ? 1 : 0));
  return id;
};
const P = {
  bancada:   pessoa('Ana bancada',   ['Sob medida / Bancada']),
  cadastros: pessoa('Bia cadastros', ['Sob medida / Cadastros']),
  venda:     pessoa('Rui venda',     ['Sob medida / Venda']),
  embala:    pessoa('Edu embala',    ['Sob medida / Embalagem']),
  vendeEmb:  pessoa('Gil vende e embala', ['Sob medida / Venda','Sob medida / Embalagem']),
  comprador: pessoa('Caio comprador',['Comprador']),
  ag:        pessoa('Lucas',         ['Admin Geral']),
  admin:     pessoa('Ivo admin',     ['Admin']),
  excCorta:  pessoa('Lia excecao corta', [], [['sobmedida.cortar', true]]),
  semCad:    pessoa('Mel sem cadastro', ['Sob medida / Cadastros'], [['sobmedida.cadastrar', false]]),
  excSerra:  pessoa('Ney so serralheria por excecao', [], [['sobmedida.serralheria', true]]),
  cortaVende:pessoa('Oto corta e vende', ['Sob medida / Bancada'], [['sobmedida.vender', true]]),
  ninguem:   pessoa('Pio revisao ML', ['Operador / Revisão'])
};

/* O ANTES, pela regua velha, com as permissoes velhas (o resolvedor do PCP
   ainda nao mudou nada: o acesso.js novo so roda no proximo boot). */
const ehAG = id => !!db.prepare(`SELECT 1 FROM usuario_setor us JOIN setores s ON s.id=us.setor_id
  WHERE us.usuario_id=? AND s.nivel='admin_geral'`).get(id);
function permsVelhas(id){
  const s = new Set(db.prepare(`SELECT DISTINCT sp.chave FROM usuario_setor us
    JOIN setor_permissao sp ON sp.setor_id=us.setor_id WHERE us.usuario_id=?`).all(id).map(r => r.chave));
  const exc = db.prepare('SELECT chave,concede FROM usuario_excecao WHERE usuario_id=?').all(id);
  exc.forEach(e => { if(e.concede) s.add(e.chave); });
  exc.forEach(e => { if(!e.concede) s.delete(e.chave); });
  return s;
}
const ANTES = {};
for(const [k, id] of Object.entries(P)) ANTES[k] = antesDe(permsVelhas(id), ehAG(id));

/* Sanidade da regua velha: os casos que a gente conhece de cabeca. */
console.log('\n── 0. a regua velha diz o que a gente sabe ──');
ok('o diretor (Cadastros) entrava podendo descartar sobra', ANTES.cadastros.pode.includes('sobra.descartar'));
ok('a bancada entrava e nao descartava', ANTES.bancada.entra && !ANTES.bancada.pode.includes('sobra.descartar'));
ok('o comprador nao entrava', !ANTES.comprador.entra);
ok('o admin do PCP sozinho nao entrava (fase 1)', !ANTES.admin.entra);
ok('quem teve "cadastrar" revogado virava cortador', ANTES.semCad.entra && !ANTES.semCad.pode.includes('sobra.descartar')
  && ANTES.semCad.pode.includes('plano.confirmar'));
eq('quem so tinha a serralheria por excecao entrava e bipava a serralheria', ANTES.excSerra.setores, 'serralheria');

/* ── O BOOT QUE MIGRA ─────────────────────────────────────────────────── */
const app = appFalso();
require('./acesso')(app, db);
const AC = app.locals.acesso;

console.log('\n── 1. NINGUEM GANHA NEM PERDE: pessoa a pessoa, chave a chave ──');
for(const [k, id] of Object.entries(P)){
  const d = depoisDe(AC, id), a = ANTES[k];
  eq(k + ': entra no sob medida igual a antes', d.entra, a.entra);
  eq(k + ': as mesmas permissoes', d.pode, a.pode);
  eq(k + ': as mesmas bancadas', d.setores, a.setores);
}

console.log('\n── 2. UMA LISTA SO: as chaves do sob medida estao em permissoes.js ──');
const porChave = {}; PERMISSOES.forEach(p => porChave[p.chave] = p);
const faltando = CHAVES_SM.filter(k => !porChave['sobmedida.' + k]);
eq('toda chave do modulo aparece no PCP como sobmedida.<chave>', faltando.join(','), '');
const foraDoGrupo = CHAVES_SM.filter(k => porChave['sobmedida.' + k] && porChave['sobmedida.' + k].grupo !== 'Sob medida');
eq('todas no grupo "Sob medida"', foraDoGrupo.join(','), '');
const semRotulo = CHAVES_SM.filter(k => porChave['sobmedida.' + k] && !porChave['sobmedida.' + k].rotulo);
eq('todas com rotulo (e o que a tela de Acessos mostra)', semRotulo.join(','), '');
/* ⚠️ NENHUMA E NIVEL ADMIN. `sincronizarAreas` poe a area 'admin' em quem tem
   qualquer chave admin, e as rotas '@admin' do PCP liberam por isso: uma
   chave do sob medida declarada admin daria um pedaco do admin do PCP a quem
   so cuida do modulo — a armadilha #34 pela porta da lista nova. */
const admins = PERMISSOES.filter(p => p.chave.indexOf('sobmedida.') === 0 &&
  (p.nivel === 'admin' || p.nivel === 'admin_geral')).map(p => p.chave);
eq('nenhuma chave do sob medida e de nivel admin', admins.join(','), '');
for(const velha of ['sobmedida.cortar','sobmedida.cadastrar','sobmedida.vender'])
  ok(velha + ' saiu do registro (era o tradutor de papel)', !porChave[velha]);

console.log('\n── 3. as chaves velhas sumiram do banco ──');
const restos = db.prepare(`SELECT chave FROM setor_permissao WHERE chave IN ('sobmedida.cortar','sobmedida.cadastrar','sobmedida.vender')
  UNION ALL SELECT chave FROM usuario_excecao WHERE chave IN ('sobmedida.cortar','sobmedida.cadastrar','sobmedida.vender')`).all();
eq('nenhum setor nem excecao carrega chave velha', restos.length, 0);

console.log('\n── 4. os setores do sob medida carregam o pacote, e cabem no nivel deles ──');
const chavesDoSetor = nome => db.prepare('SELECT chave FROM setor_permissao WHERE setor_id=?').all(setorId(nome)).map(r => r.chave);
const NIVEL = { operacao:1, supervisor:2, admin:3, admin_geral:4 };
for(const nome of Object.keys(VELHO)){
  const nv = db.prepare('SELECT nivel FROM setores WHERE nome=?').get(nome).nivel;
  const acima = chavesDoSetor(nome).filter(c => porChave[c] && NIVEL[porChave[c].nivel] > NIVEL[nv]);
  eq(nome + ': nenhuma chave acima do nivel do setor (' + nv + ')', acima.join(','), '');
}
ok('Cadastros carrega todas as chaves do modulo',
  CHAVES_SM.every(k => chavesDoSetor('Sob medida / Cadastros').includes('sobmedida.' + k)));
ok('Bancada carrega o plano de corte e NAO o descarte de sobra',
  chavesDoSetor('Sob medida / Bancada').includes('sobmedida.plano.confirmar') &&
  !chavesDoSetor('Sob medida / Bancada').includes('sobmedida.sobra.descartar'));
ok('Venda carrega o simulador e NAO o corte',
  chavesDoSetor('Sob medida / Venda').includes('sobmedida.catalogo.ler') &&
  !chavesDoSetor('Sob medida / Venda').includes('sobmedida.plano.confirmar'));

console.log('\n── 5. a sombra `areas`: so o que o destino precisa ──');
const areas = id => (db.prepare('SELECT areas FROM usuarios WHERE id=?').get(id).areas || '').split(',').filter(Boolean);
ok('quem entra no sob medida tem a area "sobmedida" (o destino depois do PIN)',
  areas(P.bancada).includes('sobmedida') && areas(P.venda).includes('sobmedida') && areas(P.embala).includes('sobmedida'));
ok('quem nao entra nao tem', !areas(P.comprador).some(a => a.indexOf('sobmedida') === 0) &&
  !areas(P.ninguem).some(a => a.indexOf('sobmedida') === 0));
ok('a bancada NAO ganha a area "admin" do PCP', !areas(P.bancada).includes('admin'));
ok('nem o diretor do sob medida', !areas(P.cadastros).includes('admin'));

console.log('\n── 6. a migracao e um EVENTO, nao uma rotina ──');
ok('ficou marcada em config', !!db.prepare("SELECT 1 FROM config WHERE chave='acesso_sobmedida_f2'").get());
/* Quem gerencia acesso tira uma caixinha depois da migracao: ela NAO pode
   voltar no proximo boot, senao a decisao dele seria desfeita a cada restart. */
db.prepare("DELETE FROM setor_permissao WHERE setor_id=? AND chave='sobmedida.rolo.entrada'").run(setorId('Sob medida / Bancada'));
require('./acesso')(appFalso(), db);
ok('o segundo boot nao devolve a caixinha desmarcada',
  !chavesDoSetor('Sob medida / Bancada').includes('sobmedida.rolo.entrada'));

console.log('\n── 7. instalacao limpa nasce com os pacotes ──');
const db2 = new Database(path.join(dir, 'limpo.db'));
db2.exec(`CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT,
    pin_hash TEXT, salt TEXT, areas TEXT, ativo INTEGER DEFAULT 1);
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);`);
require('./acesso')(appFalso(), db2);
const doSetor2 = nome => db2.prepare(`SELECT sp.chave FROM setores s JOIN setor_permissao sp ON sp.setor_id=s.id
  WHERE s.nome=?`).all(nome).map(r => r.chave);
ok('Bancada nasce com o pacote do corte', doSetor2('Sob medida / Bancada').includes('sobmedida.plano.confirmar'));
ok('Venda nasce com o simulador', doSetor2('Sob medida / Venda').includes('sobmedida.catalogo.ler'));
ok('e nenhum setor nasce com chave velha',
  !db2.prepare("SELECT 1 FROM setor_permissao WHERE chave IN ('sobmedida.cortar','sobmedida.cadastrar','sobmedida.vender')").get());

db.close(); db2.close();
fs.rmSync(dir, { recursive:true, force:true });
console.log('\n' + (n - falhas) + ' ok, ' + falhas + ' falha(s)\n');
process.exit(falhas ? 1 : 0);
