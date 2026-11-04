#!/usr/bin/env node
/* teste_regras_estoque.js — as regras do estoque decididas pelo dono, de ponta
 * a ponta, com o SERVIDOR DE VERDADE.
 *
 *   node teste_regras_estoque.js
 *
 * Spec ESTOQUE-LIVRO-E-CONFERENCIA v2 (04/11/2026). Sobe o `server.js` numa
 * pasta temporaria (PCP_DIR) e numa porta livre (PCP_PORTA) — NUNCA na 3010:
 * rodado no servidor, ele conversaria com a producao. O relogio da lista do
 * dia vem de um arquivo (PCP_RELOGIO_ARQUIVO) que o teste reescreve para
 * simular dias de fabrica. As pessoas entram pelo PIN, como no tablet.
 *
 * Cada bloco trava uma regra da lista do dono (1 a 16). Os numeros no titulo
 * de cada bloco sao os da lista.
 */
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net'), crypto = require('crypto');
const Database = require('better-sqlite3');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, JSON.stringify(achado) === JSON.stringify(esperado), 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-regras-'));
const RELOGIO = path.join(tmp, 'relogio.txt');
const segredo = path.join(__dirname, '.session_secret');
const segredoExistia = fs.existsSync(segredo);
function hora(t){ fs.writeFileSync(RELOGIO, t); }
hora('2026-11-09 06:30:00');   // segunda-feira, antes das 7h

function portaLivre(){ return new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); }
const espera = ms => new Promise(r => setTimeout(r, ms));

let srv = null, base = '';
async function subir(){
  const porta = await portaLivre();
  base = 'http://127.0.0.1:' + porta;
  srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, stdio: ['ignore','pipe','pipe'],
    env: Object.assign({}, process.env, { PCP_DIR: tmp, PCP_PORTA: String(porta), PCP_RELOGIO_ARQUIVO: RELOGIO }) });
  let log = '';
  srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for(let i = 0; i < 120; i++){
    await espera(250);
    try{ const r = await fetch(base + '/login'); if(r.status === 200) return true; }catch(e){}
    if(srv.exitCode != null) break;
  }
  console.log(log.slice(-3000));
  return false;
}
function descer(){ if(srv && srv.exitCode == null) srv.kill('SIGTERM'); }
process.on('exit', () => { descer(); try{ fs.rmSync(tmp, { recursive:true, force:true }); }catch(e){} if(!segredoExistia){ try{ fs.unlinkSync(segredo); }catch(e){} } });

/* ── o cliente: uma sessao por pessoa, pelo PIN ── */
const COOKIE = {};
async function req(quem, metodo, url, corpo){
  const h = { 'Content-Type':'application/json' };
  if(quem && COOKIE[quem]) h.Cookie = COOKIE[quem];
  const r = await fetch(base + url, { method: metodo, headers: h, body: corpo ? JSON.stringify(corpo) : undefined, redirect:'manual' });
  let d = null; const t = await r.text(); try{ d = JSON.parse(t); }catch(e){ d = { _texto: t.slice(0, 200) }; }
  if(d && typeof d === 'object') d.__st = r.status;
  return d;
}
const get = (q, u) => req(q, 'GET', u);
const post = (q, u, b) => req(q, 'POST', u, b || {});
async function entrar(nome, id, pin){
  const r = await fetch(base + '/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, pin }) });
  const c = r.headers.get('set-cookie') || '';
  COOKIE[nome] = c.split(';')[0];
  return r.status;
}

(async () => {
  console.log('\n── o servidor sobe numa pasta e numa porta limpas ──');
  ok('o servidor subiu (PCP_DIR temporário, porta livre)', await subir());
  const db = new Database(path.join(tmp, 'dados.db'));
  db.pragma('busy_timeout = 5000');
  const ESTOQUE = require('./estoque_dominio');

  /* ── a fábrica de mentira: pessoas, setores, SKUs, saldo pelo livro ── */
  const setor = nome => db.prepare('SELECT id FROM setores WHERE nome=?').get(nome).id;
  const hash = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');
  const ID = {};
  function pessoa(nome, setores, excecoes){
    const salt = crypto.randomBytes(16).toString('hex');
    const id = db.prepare('INSERT INTO usuarios (nome,salt,pin_hash,areas,pin_curto) VALUES (?,?,?,?,0)')
      .run(nome, salt, hash('246810', salt), '').lastInsertRowid;
    (setores || []).forEach(s => db.prepare('INSERT INTO usuario_setor (usuario_id,setor_id) VALUES (?,?)').run(id, setor(s)));
    (excecoes || []).forEach(c => db.prepare('INSERT INTO usuario_excecao (usuario_id,chave,concede) VALUES (?,?,1)').run(id, c));
    ID[nome] = id;
  }
  pessoa('Ana',  ['Operador / Controle de Estoque']);
  pessoa('Bia',  ['Operador / Controle de Estoque']);
  pessoa('Caio', ['Operador / Controle de Estoque']);
  pessoa('Davi', ['Operador / Expedição'], ['contagem.contar']);     // a chave por EXCEÇÃO
  pessoa('Edu',  ['Operador / Expedição']);                          // imprime a etiqueta
  pessoa('Gil',  ['Operador / Expedição']);                          // confere a caixa
  pessoa('Fabi', ['Operador / Revisão','Operador / Embalagem']);
  pessoa('Lucas',['Admin Geral']);
  pessoa('Ze',   [], ['contagem.relatorio']);                         // lê o relatório, sem custo.ver e sem contar
  for(const nome of Object.keys(ID)) await entrar(nome, ID[nome], '246810');
  ok('as nove pessoas entraram pelo PIN', Object.keys(COOKIE).length === 9 && Object.values(COOKIE).every(c => /^sess=/.test(c)));

  let rolo = db.prepare("SELECT id FROM modelo WHERE COALESCE(sob_medida,0)=0 LIMIT 1").get();
  if(!rolo) rolo = { id: db.prepare("INSERT INTO modelo (codigo,nome) VALUES ('ROLOT','Rolô')").run().lastInsertRowid };
  const sm = db.prepare("INSERT INTO modelo (codigo,nome,sob_medida,exige_medida) VALUES ('SMT','Sob medida',1,0)").run().lastInsertRowid;
  const SK = {};
  function sku(letra, saldo, ativo){
    const c = 'BK1' + letra + '0140BEGE';
    db.prepare('INSERT INTO skus (codigo,descricao,cor,largura_cm,altura_cm,modelo_id) VALUES (?,?,?,?,?,?)')
      .run(c, 'Rolo teste ' + letra, 'Bege', 100, 140, rolo.id);
    if(saldo) ESTOQUE.movimentar(db, { codigo:c, delta:saldo, tipo:'abertura', referencia:'teste_regras' });
    SK[letra] = c;
  }
  'ABCDEFGHJKLMNP'.split('').forEach(l => sku(l, 5));
  sku('Q', 0);                       // vai travar na etiqueta
  /* O CADASTRO DE SKU DE PRODUCAO NAO TEM COLUNA `ativo` (o "desativar" e do
     modelo e da cor). O filtro do inventario so vale se a coluna existir —
     o teste_inventario.js trava o inativo num banco que a tem. */
  db.prepare("INSERT INTO skus (codigo,descricao,modelo_id) VALUES ('SOBMEDTESTE','Sob medida',?)").run(sm);
  // os que vendem (cobertura): A, B e C, com ritmos diferentes
  const vf = db.prepare("INSERT INTO venda_futura (codigo,data_venda) VALUES (?, date('now','localtime','-3 days'))");
  [['A',60],['B',30],['C',6]].forEach(([l,k]) => { for(let i = 0; i < k; i++) vf.run(SK[l]); });
  let lote = 0;
  function caixa(itens, extra){
    lote++;
    const pack = '20000' + String(1000000000 + lote);
    const id = db.prepare(`INSERT INTO lote (codigo,packId,venda,codes,estagio,modalidade,nf,buyer)
      VALUES (?,?,?,?,'pendente','coleta',?,?)`).run(itens[0][0], pack, pack, JSON.stringify([pack]), String(9000 + lote), 'Cliente ' + lote).lastInsertRowid;
    if(itens.length > 1 || itens[0][1] > 1) itens.forEach(([c,q]) => db.prepare('INSERT INTO lote_item (lote_id,codigo,qtd) VALUES (?,?,?)').run(id, c, q));
    return { id, pack };
  }
  const saldo = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
  const item = c => db.prepare('SELECT * FROM inventario_item WHERE codigo=? ORDER BY id DESC LIMIT 1').get(c);
  function livroBate(){
    const r = db.prepare(`SELECT s.codigo FROM skus s LEFT JOIN (SELECT codigo, SUM(delta) t FROM movimento_estoque GROUP BY codigo) m
      ON m.codigo=s.codigo WHERE COALESCE(m.t,0) <> s.estoque`).all();
    return r.length ? r.map(x => x.codigo).join(',') : true;
  }
  async function contar(quem, c, k){
    if(k === 0) return post(quem, '/api/inventario/bipe', { codigo:c, abrir:true });
    let r; for(let i = 0; i < k; i++) r = await post(quem, '/api/inventario/bipe', { codigo:c }); return r;
  }
  const terminar = (quem, c, nenhuma) => post(quem, '/api/inventario/terminar', { codigo:c, nenhuma: !!nenhuma });
  const listaDe = async quem => ((await get(quem, '/api/inventario/hoje')).itens || []).map(i => i.codigo);
  const tarja = async quem => (await get(quem, '/api/inventario/tarja')).tarja || null;
  function semSaldo(o){
    const proib = /^(saldo|estoque|saldo_na_contagem|saldo2|saldo3|contado1|contado2|contado3|diferenca)$/;
    const achou = [];
    (function v(x){ if(x && typeof x === 'object') for(const k in x){ if(proib.test(k)) achou.push(k); v(x[k]); } })(o);
    return achou;
  }

  console.log('\n── 8. antes das 7h, e no fim de semana, não há lista ──');
  eq('antes das 7h: nenhuma lista', (await listaDe('Ana')).length, 0);
  hora('2026-11-07 09:00:00');
  eq('sábado: nenhuma lista', (await listaDe('Ana')).length, 0);
  hora('2026-11-08 09:00:00');
  eq('domingo: nenhuma lista', (await listaDe('Ana')).length, 0);
  eq('e nenhum ciclo nasceu', db.prepare("SELECT COUNT(*) n FROM inventario_ciclo WHERE tipo='diario'").get().n, 0);

  console.log('\n── DIA 1 (segunda, 09/11) ──');
  hora('2026-11-09 07:02:00');
  console.log('\n── 10. o rodízio: às 7h, duas pessoas ──');
  const lA = await get('Ana', '/api/inventario/hoje');
  const c1 = db.prepare("SELECT * FROM inventario_ciclo WHERE tipo='diario' AND data='2026-11-09'").get();
  const esc1 = db.prepare('SELECT usuario_nome FROM inventario_escala WHERE ciclo_id=? ORDER BY id').all(c1.id).map(e => e.usuario_nome);
  eq('escaladas: as duas há mais tempo sem escala (todas nunca foram: ordem do nome)', esc1, ['Ana','Bia']);
  ok('o Admin Geral não entra no rodízio só pelo nível', esc1.indexOf('Lucas') < 0);
  const t1 = await tarja('Ana');
  ok('a tarja da escalada diz o nome da outra', t1 && /sua e de Bia/.test(t1.texto) && /até 10h/.test(t1.texto), t1 && t1.texto);
  eq('a tarja não aparece para quem não foi escalada', await tarja('Caio'), null);

  console.log('\n── 14. quem não tem a chave não vê, não recebe e não é escalado ──');
  eq('Zé (sem contagem.contar) não recebe a tarja', await tarja('Ze'), null);
  eq('Zé não abre a lista (403)', (await get('Ze', '/api/inventario/hoje')).__st, 403);
  ok('Zé não abre a tela /inventario', [302,403].indexOf((await get('Ze', '/inventario')).__st) >= 0);
  ok('Edu (expedição) não abre a lista', (await get('Edu', '/api/inventario/hoje')).__st === 403);

  console.log('\n── 8. a lista do dia ──');
  const lista1 = db.prepare('SELECT codigo, degrau FROM inventario_item WHERE ciclo_id=? ORDER BY ordem').all(c1.id);
  eq('8 SKUs', lista1.length, 8);
  eq('primeiro a menor cobertura: A (5÷2/dia), B (5÷1/dia), C (5÷0,2/dia)', lista1.slice(0,3).map(i => i.codigo), [SK.A, SK.B, SK.C]);
  ok('depois os nunca conferidos', lista1.slice(3).every(i => i.degrau === 3));
  ok('sob medida nunca entra', !lista1.some(i => i.codigo === 'SOBMEDTESTE'));

  console.log('\n── 7. o JSON de quem conta é cego ──');
  eq('a lista não traz saldo nem contagem', semSaldo(lA), []);
  const b1 = await contar('Ana', SK.A, 3);
  eq('o bipe diz só "você bipou N"', Object.keys(b1).filter(k => k !== '__st').sort(), ['codigo','contado','ok']);

  console.log('\n── 1. A=3, B=3, sistema=3 → confirmado, nenhuma linha ──');
  // D tem 5: tira 2 do livro antes, por ajuste — saldo 3
  ESTOQUE.movimentar(db, { codigo:SK.D, delta:-2, tipo:'ajuste', referencia:'teste' });
  await contar('Ana', SK.D, 3); await terminar('Ana', SK.D);
  eq('A=3 com 3: confirmado na primeira', item(SK.D).status, 'confirmado');
  eq('nenhuma linha de inventário no livro', db.prepare("SELECT COUNT(*) n FROM movimento_estoque WHERE codigo=? AND tipo='inventario'").get(SK.D).n, 0);

  console.log('\n── 2. A=3, B=3, sistema=5 → o saldo vira 3 sozinho ──');
  const tA = await terminar('Ana', SK.A);
  eq('o "terminei" não diz se bateu', semSaldo(tA), []);
  eq('4. a mesma pessoa é recusada como B', (await post('Ana', '/api/inventario/bipe', { codigo:SK.A })).motivo, 'mesma_pessoa');
  await contar('Bia', SK.A, 3); await terminar('Bia', SK.A);
  eq('aplicou SOZINHO, sem aprovação', item(SK.A).status, 'aplicado');
  eq('saldo 5 → 3', saldo(SK.A), 3);
  eq('nada esperando o admin', (await get('Lucas', '/api/inventario/aprovacao')).itens.length, 0);

  console.log('\n── 3. A=3, B=4 → 3ª; C=3 aplica; C=5 vai para o admin ──');
  await contar('Ana', SK.B, 3); await terminar('Ana', SK.B);
  await contar('Bia', SK.B, 4); await terminar('Bia', SK.B);
  eq('A=3, B=4: pede a 3ª', item(SK.B).status, 'terceira');
  eq('4. quem contou A não faz a C', (await post('Ana', '/api/inventario/bipe', { codigo:SK.B })).motivo, 'mesma_pessoa');
  eq('4. quem contou B não faz a C', (await post('Bia', '/api/inventario/bipe', { codigo:SK.B })).motivo, 'mesma_pessoa');
  await contar('Caio', SK.B, 3); await terminar('Caio', SK.B);
  eq('C=3 bate com A: aplica −2', [item(SK.B).status, saldo(SK.B)], ['aplicado', 3]);
  await contar('Ana', SK.C, 3); await terminar('Ana', SK.C);
  await contar('Bia', SK.C, 4); await terminar('Bia', SK.C);
  await contar('Lucas', SK.C, 5); await terminar('Lucas', SK.C);
  eq('C=5: ninguém bateu → admin; o saldo não mexe', [item(SK.C).status, saldo(SK.C)], ['aprovar', 5]);
  const fila = (await get('Lucas', '/api/inventario/aprovacao')).itens;
  eq('4. o Admin Geral que contou a C NÃO resolve', (await post('Lucas', '/api/inventario/aprovar', { id:fila[0].id, motivo:'Perda ou avaria' })).motivo, 'mesma_pessoa');
  // Davi resolve? Ele não tem contagem.resolver: a rota recusa.
  eq('sem contagem.resolver, a rota recusa', (await post('Davi', '/api/inventario/aprovar', { id:fila[0].id, motivo:'Perda ou avaria' })).__st, 403);
  db.prepare("INSERT INTO usuario_excecao (usuario_id,chave,concede) VALUES (?,'contagem.resolver',1)").run(ID.Davi);
  eq('o admin precisa de motivo', (await post('Davi', '/api/inventario/aprovar', { id:fila[0].id })).__st, 400);
  const res3 = await post('Davi', '/api/inventario/aprovar', { id:fila[0].id, motivo:'Perda ou avaria', diferenca:-1 });
  eq('com motivo, quem não contou aplica', [res3.ok, saldo(SK.C)], [true, 4]);

  console.log('\n── 5. embalagem e etiqueta ENTRE A e B não geram furo falso ──');
  const ve = caixa([[SK.E, 1]]);
  await contar('Ana', SK.E, 3); await terminar('Ana', SK.E);
  const m5 = await post('Fabi', '/api/montagem', { codigo:SK.E, kit_ok:1 });
  ok('embalar no meio funciona (+1)', m5.ok, JSON.stringify(m5));
  const tAtiva = await tarja('Bia');
  const e5 = await post('Edu', '/api/embalar', { id: ve.id });
  ok('11. com a tarja ligada (' + (tAtiva ? 'sim' : 'não') + '), embalar e imprimir etiqueta continuam funcionando', !!tAtiva && m5.ok && !e5.erro, JSON.stringify(e5));
  await contar('Bia', SK.E, 3); await terminar('Bia', SK.E);
  eq('B achou a mesma diferença (−2): aplica, sobre o saldo de agora (5 +1 −2)', [item(SK.E).status, saldo(SK.E)], ['aplicado', 4]);

  console.log('\n── 6. embalagem ou etiqueta DURANTE a contagem: conta de novo ──');
  await contar('Ana', SK.F, 2);
  await post('Fabi', '/api/montagem', { codigo:SK.F, kit_ok:1 });
  const r6 = await terminar('Ana', SK.F);
  ok('a embalagem no meio invalida a contagem: 409, "conte de novo"', r6.__st === 409 && r6.invalidada && /conte de novo/.test(r6.erro), JSON.stringify(r6));
  eq('não virou divergência nem 2ª contagem', [item(SK.F).status, item(SK.F).contado1], ['a_contar', null]);
  await contar('Ana', SK.F, 6); await terminar('Ana', SK.F);
  eq('recontada na hora: 6 com 6, confirma', item(SK.F).status, 'confirmado');
  const vg = caixa([[SK.G, 1]]);
  await contar('Ana', SK.G, 1);
  await post('Edu', '/api/embalar', { id: vg.id });
  eq('a etiqueta impressa no meio também invalida', (await terminar('Ana', SK.G)).invalidada, true);
  await contar('Ana', SK.G, 4); await terminar('Ana', SK.G);
  eq('recontando: 4 com o livre 4 (5 − 1 em caixa impressa), confirma', item(SK.G).status, 'confirmado');

  console.log('\n── 9. a recusa "sem estoque" vai para a lista de amanhã ──');
  const vq = caixa([[SK.Q, 1]]);
  hora('2026-11-09 14:00:00');
  const e9 = await post('Edu', '/api/embalar', { id: vq.id });
  ok('a Etiqueta de Venda recusa "sem estoque"', /Sem estoque/.test(e9.erro || ''), JSON.stringify(e9));
  ok('e a recusa ficou gravada', !!db.prepare('SELECT 1 FROM recusa_estoque WHERE codigo=?').get(SK.Q));
  eq('8. a lista de hoje não muda por isso', db.prepare('SELECT COUNT(*) n FROM inventario_item WHERE ciclo_id=?').get(c1.id).n, 8);

  console.log('\n── 16. as regras que não podem quebrar ──');
  const sH = saldo(SK.H);
  const rv = await post('Fabi', '/api/revisao', { codigo:SK.H, segundos:30 });
  eq('revisão não mexe no estoque', [rv.ok, saldo(SK.H)], [true, sH]);
  const vh = caixa([[SK.H, 1]]);
  await post('Edu', '/api/embalar', { id: vh.id });
  eq('a etiqueta só reserva: o saldo não muda', saldo(SK.H), sH);
  const rr = await post('Edu', '/api/reimprimir', { id: vh.id });
  eq('reimprimir não baixa', saldo(SK.H), sH);
  ok('(a reimpressão respondeu)', rr && rr.__st < 500, JSON.stringify(rr));
  const cf = await post('Gil', '/api/carregar', { code: vh.pack, sku: SK.H });
  eq('a conferência baixa uma peça', saldo(SK.H), sH - 1);
  ok('(a conferência respondeu ok)', cf.ok !== false, JSON.stringify(cf));
  const vp = caixa([[SK.J, 2]]);
  const sJ = saldo(SK.J);
  await post('Edu', '/api/lote/conferir', { id: vp.id, codigo: SK.J });
  await post('Edu', '/api/lote/conferir', { id: vp.id, codigo: SK.J });
  const ep = await post('Edu', '/api/embalar', { id: vp.id });
  ok('(a caixa de 2 imprimiu depois do bipe de cada persiana)', !ep.erro, JSON.stringify(ep));
  await post('Gil', '/api/carregar', { code: vp.pack });
  await post('Gil', '/api/carregar/peca', { lote_id: vp.id, sku: SK.J });
  const pc = await post('Gil', '/api/carregar/peca', { lote_id: vp.id, sku: SK.J });
  eq('a caixa de pacote (2 persianas) baixa POR PEÇA', saldo(SK.J), sJ - 2);
  ok('(a peça a peça respondeu)', pc.ok !== false, JSON.stringify(pc));
  const vsm = caixa([['SOBMEDTESTE', 1]]);
  const movSm = () => db.prepare("SELECT COUNT(*) n FROM movimento_estoque WHERE codigo='SOBMEDTESTE'").get().n;
  await post('Fabi', '/api/montagem', { codigo:'SOBMEDTESTE', kit_ok:1 });
  await post('Edu', '/api/embalar', { id: vsm.id });
  await post('Gil', '/api/carregar', { code: vsm.pack, sku:'SOBMEDTESTE' });
  eq('sob medida não gera movimento (embalar, imprimir, conferir)', movSm(), 0);
  const sK = saldo(SK.K);
  ok('liga o modo teste', (await post('Lucas', '/api/teste/ligar')).__st === 200);
  await post('Fabi', '/api/montagem', { codigo:SK.K, kit_ok:1 });
  eq('(em modo teste a embalagem soma)', saldo(SK.K), sK + 1);
  const ap = await post('Lucas', '/api/teste/limpar', { confirmar:true });
  eq('modo teste "apagar" restaura o saldo', saldo(SK.K), sK);
  ok('e não deixa linha de teste no livro', !db.prepare('SELECT 1 FROM movimento_estoque WHERE COALESCE(teste,0)=1').get(), JSON.stringify(ap));

  console.log('\n── 15. o livro fecha no fim do dia 1 ──');
  eq('SUM(delta) = skus.estoque para todo SKU', livroBate(), true);

  console.log('\n── DIA 2 (terça, 10/11) ──');
  hora('2026-11-10 07:03:00');
  await listaDe('Caio');
  const c2 = db.prepare("SELECT * FROM inventario_ciclo WHERE tipo='diario' AND data='2026-11-10'").get();
  const lista2 = db.prepare('SELECT codigo, degrau FROM inventario_item WHERE ciclo_id=? ORDER BY ordem, id').all(c2.id);
  const deg = lista2.map(i => i.degrau);
  ok('8. a ordem: sobrou de ontem → travou → cobertura → nunca → mais tempo', deg.every((d, i) => i === 0 || d >= deg[i - 1]), JSON.stringify(lista2));
  ok('9. o SKU que travou na etiqueta entrou (degrau 1)', lista2.some(i => i.codigo === SK.Q && i.degrau === 1), JSON.stringify(lista2));
  ok('8. o que sobrou de ontem vem primeiro (degrau 0)', lista2.filter(i => i.degrau === 0).length >= 1 && lista2[0].degrau === 0, JSON.stringify(lista2));
  ok('8. folga de 7 dias: o confirmado ontem não volta', !lista2.some(i => i.codigo === SK.D || i.codigo === SK.F));
  const esc2 = db.prepare('SELECT usuario_nome FROM inventario_escala WHERE ciclo_id=? ORDER BY id').all(c2.id).map(e => e.usuario_nome);
  eq('10. a escala de hoje: as nunca escaladas (Caio, e Davi, que tem a chave por EXCEÇÃO)', esc2, ['Caio','Davi']);
  const caioItem = (await get('Caio', '/api/inventario/hoje')).itens.find(i => i.rodada === 1);
  await contar('Caio', caioItem.codigo, 0);
  hora('2026-11-10 09:59:00');
  eq('10. antes das 10h, quem não foi escalada não conta', (await get('Ana', '/api/inventario/hoje')).itens.filter(i => i.rodada === 1).length, 0);
  hora('2026-11-10 10:01:00');
  ok('10. às 10h, com Davi sem começar, a lista abre para o setor', (await get('Ana', '/api/inventario/hoje')).itens.filter(i => i.rodada === 1).length > 0);
  const t2 = await tarja('Bia');
  ok('10. e a tarja passa a aparecer para todos', t2 && /todo o setor/.test(t2.texto), t2 && t2.texto);
  const rel2 = await get('Lucas', '/api/inventario/relatorio');
  ok('10. o relatório registra "escalada, não contou" com o nome', rel2.escala.some(e => e.nome === 'Davi' && e.nao_contou) && !rel2.escala.some(e => e.nome === 'Caio' && e.nao_contou));
  eq('15. o livro fecha no fim do dia 2', livroBate(), true);

  console.log('\n── DIA 3 (quarta, 11/11): menos de duas pessoas ──');
  for(const nome of ['Ana','Bia','Caio']) await post('Lucas', '/api/inventario/rodizio', { usuario_id:ID[nome], fora:true });
  hora('2026-11-11 07:05:00');
  await listaDe('Davi');
  const c3 = db.prepare("SELECT * FROM inventario_ciclo WHERE tipo='diario' AND data='2026-11-11'").get();
  eq('10. só Davi no rodízio: não há escala', db.prepare('SELECT COUNT(*) n FROM inventario_escala WHERE ciclo_id=?').get(c3.id).n, 0);
  const tL = await tarja('Lucas');
  ok('10. o aviso vai para quem planeja', tL && tL.tipo === 'aviso' && /só 1 pessoa/.test(tL.texto), tL && tL.texto);
  for(const nome of ['Ana','Bia','Caio']) await post('Lucas', '/api/inventario/rodizio', { usuario_id:ID[nome], fora:false });
  db.prepare('UPDATE usuarios SET ativo=0 WHERE id=?').run(ID.Bia);
  hora('2026-11-12 07:05:00');
  await listaDe('Ana');
  const c4 = db.prepare("SELECT * FROM inventario_ciclo WHERE tipo='diario' AND data='2026-11-12'").get();
  const esc4 = db.prepare('SELECT usuario_nome FROM inventario_escala WHERE ciclo_id=? ORDER BY id').all(c4.id).map(e => e.usuario_nome);
  ok('10. pessoa bloqueada fica fora da escala', esc4.length === 2 && esc4.indexOf('Bia') < 0, JSON.stringify(esc4));
  db.prepare('UPDATE usuarios SET ativo=1 WHERE id=?').run(ID.Bia);
  await entrar('Bia', ID.Bia, '246810');

  console.log('\n── 12. a quinzenal ──');
  db.prepare("UPDATE config SET valor='2026-11-01' WHERE chave='quinzenal_base'").run();
  hora('2026-11-16 07:05:00');     // segunda: o 15º dia depois de 01/11
  await listaDe('Ana');
  const q = db.prepare("SELECT * FROM inventario_ciclo WHERE tipo='quinzenal'").get();
  ok('abre sozinha no 15º dia', q && q.data === '2026-11-16');
  eq('prazo de 3 dias úteis', q && q.prazo, '2026-11-18');
  eq('suspende a diária', db.prepare("SELECT COUNT(*) n FROM inventario_ciclo WHERE tipo='diario' AND data='2026-11-16'").get().n, 0);
  hora('2026-11-17 07:05:00');
  await listaDe('Ana');
  eq('no 2º dia também não há diária', db.prepare("SELECT COUNT(*) n FROM inventario_ciclo WHERE tipo='diario' AND data='2026-11-17'").get().n, 0);
  ok('cada dia da quinzenal tem a sua escala', db.prepare("SELECT COUNT(DISTINCT data) n FROM inventario_escala WHERE ciclo_id=?").get(q.id).n === 2);
  hora('2026-11-19 07:05:00');     // quinta: depois do prazo
  await listaDe('Ana');
  eq('fim do prazo: a quinzenal fecha', db.prepare('SELECT status FROM inventario_ciclo WHERE id=?').get(q.id).status, 'fechado');
  ok('o que não terminou vira "não conferido"', db.prepare("SELECT COUNT(*) n FROM inventario_item WHERE ciclo_id=? AND status='nao_conferido'").get(q.id).n > 0);
  ok('a diária volta no dia seguinte', !!db.prepare("SELECT 1 FROM inventario_ciclo WHERE tipo='diario' AND data='2026-11-19'").get());
  eq('15. o livro fecha', livroBate(), true);

  console.log('\n── 13. a geral: zero só quando as duas pessoas confirmam ──');
  eq('abrir sem confirmar a expedição parada é recusado', (await post('Lucas', '/api/inventario/geral/abrir', {})).motivo, 'confirmar');
  const g = await post('Lucas', '/api/inventario/geral/abrir', { confirmar:true });
  ok('confirmando, abre', g.ok && g.itens > 0, JSON.stringify(g));
  const gsku = db.prepare("SELECT codigo FROM inventario_item WHERE ciclo_id=? AND codigo<>? ORDER BY codigo LIMIT 1").get(g.ciclo_id, SK.Q).codigo;
  const sg = saldo(gsku);
  await contar('Lucas', gsku, 2); await terminar('Lucas', gsku);
  eq('4. o Admin Geral que contou A não pode ser B', (await post('Lucas', '/api/inventario/bipe', { codigo:gsku })).motivo, 'mesma_pessoa');
  const p1 = await post('Caio', '/api/inventario/geral/terminar-prateleira', {});
  ok('"terminei a prateleira" pergunta quantos ficaram sem bipe', p1.confirmar && p1.n > 0, JSON.stringify(p1));
  await post('Caio', '/api/inventario/geral/terminar-prateleira', { confirmar:true });
  const outro = db.prepare("SELECT codigo FROM inventario_item WHERE ciclo_id=? AND codigo<>? AND status='recontar' ORDER BY codigo LIMIT 1").get(g.ciclo_id, gsku).codigo;
  const so = saldo(outro);
  const livreDe = c => require('./baixa_dominio').disponivel(db, c);
  eq('a zero de UMA pessoa não mexe no saldo', saldo(outro), so);
  await post('Ana', '/api/inventario/geral/terminar-prateleira', { confirmar:true });
  eq('as duas confirmaram "não tem nenhuma": a prateleira do SKU vira zero (o livre)', livreDe(outro), 0);
  ok('o SKU que Lucas contou 2: Caio (B) e Ana (C) confirmaram zero — duas de três batem, vale o zero',
     item(gsku).status === 'aplicado' && livreDe(gsku) === 0, item(gsku).status + ' livre ' + livreDe(gsku));
  eq('15. o livro fecha', livroBate(), true);

  console.log('\n── 2 e 14. o relatório de furos ──');
  const relL = await get('Lucas', '/api/inventario/relatorio');
  const furoA = relL.furos.find(f => f.codigo === SK.A);
  ok('o furo −2 de A aparece com quem contou (Ana e Bia) e o extrato', furoA && furoA.diferenca === -2 && furoA.contagens.map(c => c.por).join() === 'Ana,Bia' && furoA.extrato.length > 0);
  ok('com custo.ver (Admin Geral), o R$ viaja', 'valor_periodo' in relL);
  const relZ = await get('Ze', '/api/inventario/relatorio');
  ok('sem custo.ver, o JSON não traz R$', relZ.__st === 200 && !('valor_periodo' in relZ) && relZ.furos.every(f => !('valor_diferenca' in f)));
  eq('sem contagem.relatorio, não vê o relatório', (await get('Caio', '/api/inventario/relatorio')).__st, 403);

  console.log('\n── 15. ninguém escreve no saldo por fora ──');
  const fora = [];
  for(const f of fs.readdirSync(__dirname).filter(f => f.endsWith('.js') && !/^teste_/.test(f) && f !== 'estoque_dominio.js')){
    const s = fs.readFileSync(path.join(__dirname, f), 'utf8');
    if(/UPDATE\s+skus\s+SET\s+[^;'"`]*\bestoque\s*=/i.test(s)) fora.push(f);
  }
  eq('nenhum UPDATE skus SET estoque fora do estoque_dominio.js', fora, []);

  db.close();
  descer();
  console.log('\n' + (falhas ? falhas + ' FALHA(S) em ' + n : 'tudo certo: ' + n + ' casos'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('  FALHOU — o teste estourou: ' + (e && e.stack || e)); descer(); process.exit(1); });
