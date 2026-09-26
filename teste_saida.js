#!/usr/bin/env node
/* Testes da fase 1 da spec SAIDA-E-DUPLA-CONFERENCIA — QUEM FEZ, e a limpeza.
 *
 *   node teste_saida.js
 *
 * A dupla conferencia (§2 da spec) sao duas contagens por logins que podem ser
 * diferentes: a impressao da etiqueta e o bipe 1, a conferencia da pilha e o
 * bipe 2. Ate aqui o sistema nao gravava QUEM fazia nenhum dos dois — e sem
 * isso nao ha "segunda pessoa" para marcar, nem nome ao lado da caixa que
 * ficou para tras.
 *
 * E a limpeza: o "Fechar coleta" de 10/09 nao foi adotado, as caixas
 * acumularam como "esperando o caminhao", e o dono confirmou (25/09/2026) que
 * todas ja sairam. O `fechar_saida_passivo.js` as fecha UMA vez, numa saida
 * `tipo='passivo'`, com a data do bipe de cada caixa — nunca a de hoje.
 *
 * Sobe um banco temporario e chama os modulos de verdade, com um `app` de
 * mentira que so guarda as rotas. Nao abre porta, nao toca no banco de producao.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-saida-'));
/* Antes de qualquer require nosso: o exp_route e o carreg_route criam pastas
   pelo caminhos.js, e elas nao podem ser as de producao. */
process.env.PCP_DIR = tmp;

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra ? '   ' + extra : '')); } };

const colunas = (db, t) => db.prepare(`SELECT name FROM pragma_table_info('${t}')`).all().map(c => c.name);
const NOVAS = ['impresso_por','conferido_por','conferido_em','no_carro_em','no_carro_por',
               'saida_id','saiu_em','saiu_por'];

/* O `app` de mentira: guarda as rotas. O `req.usuario` e quem esta logado —
   o auth.js o poe ali em producao. */
function montar(db, modulos){
  const rotas = {};
  const app = { get:(p,...h)=>{ rotas['GET '+p]=h[h.length-1]; },
                post:(p,...h)=>{ rotas['POST '+p]=h[h.length-1]; },
                use:()=>{}, locals:{ acesso:{ auditar(){} } } };
  for(const m of modulos) require(m)(app, db);
  const chamar = (k, body, usuario) => new Promise(r => {
    const res = { json:o=>r(o), status(){ return res; }, send:o=>r(o), setHeader(){} };
    rotas[k]({ body:body||{}, params:{}, query:{}, headers:{}, usuario:usuario||null }, res);
  });
  return chamar;
}

(async () => {

  // ── 1. AS COLUNAS NASCEM NO CREATE E CHEGAM PELO ALTER (§17) ─────────────
  {
    const novo = new Database(path.join(tmp, 'novo.db'));
    montar(novo, ['./exp_route']);
    const c = colunas(novo, 'lote');
    ok('instalação limpa: as colunas novas estão no CREATE de lote',
       NOVAS.every(n => c.includes(n)), 'faltam ' + NOVAS.filter(n => !c.includes(n)).join(','));

    const velho = new Database(path.join(tmp, 'velho.db'));
    velho.exec(`CREATE TABLE lote (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, estagio TEXT,
      data TEXT, embalado_em TEXT, carregado_em TEXT, modalidade TEXT, retirado_em TEXT)`);
    montar(velho, ['./exp_route']);
    const v = colunas(velho, 'lote');
    ok('banco de produção antigo: o ALTER acrescenta as colunas',
       NOVAS.every(n => v.includes(n)), 'faltam ' + NOVAS.filter(n => !v.includes(n)).join(','));
    ok('e acrescenta NO FIM, depois das que já existiam',
       v.indexOf('impresso_por') > v.indexOf('retirado_em'));
    novo.close(); velho.close();
  }

  // ── o banco dos casos seguintes ──────────────────────────────────────────
  const db = new Database(path.join(tmp, 't.db'));
  db.exec(`
    CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT,
      exige_medida INTEGER DEFAULT 1, sob_medida INTEGER DEFAULT 0);
    CREATE TABLE cor (codigo TEXT PRIMARY KEY, nome TEXT);
    CREATE TABLE tecido (codigo TEXT PRIMARY KEY, nome TEXT);
    CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
      estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER,
      largura_cm INTEGER, altura_cm INTEGER, cor_codigo TEXT, tecido_codigo TEXT);
    INSERT INTO modelo (id,codigo,nome) VALUES (1,'ROLO','Rolô');
    INSERT INTO skus (codigo,estoque,modelo_id,largura_cm,altura_cm) VALUES ('BK140140BEGE',5,1,140,140);
  `);
  require('./estoque_dominio').garantirSchema(db);
  const chamar = montar(db, ['./exp_route','./etq_route','./carreg_route']);
  const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
  const pdf = path.join(tmp, 'lote.pdf'); fs.writeFileSync(pdf, 'pdf de mentira');
  const vol = db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,venda,codes,estagio,data,despachar_em,srcfile,modalidade)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const l = id => db.prepare('SELECT * FROM lote WHERE id=?').get(id);
  const ANA = {id:1, nome:'Ana'}, BETO = {id:2, nome:'Beto'};

  // ── 2. O BIPE 1: QUEM IMPRIMIU ───────────────────────────────────────────
  const id1 = vol.run('BK140140BEGE','Cliente Um','101','9001','8001','["9001"]','pendente',hoje,hoje,pdf,null).lastInsertRowid;
  let r = await chamar('POST /api/embalar', {id:id1}, ANA);
  ok('imprimir a etiqueta de venda grava QUEM imprimiu', r.ok && l(id1).impresso_por === 'Ana',
     JSON.stringify(r) + ' / ' + l(id1).impresso_por);

  r = await chamar('POST /api/reimprimir', {id:id1}, BETO);
  ok('a reimpressão acontece…', r.ok && l(id1).reimpressoes === 1, JSON.stringify(r));
  ok('…e NÃO sobrescreve quem imprimiu (o bipe 1 é a primeira impressão)',
     l(id1).impresso_por === 'Ana', 'veio ' + l(id1).impresso_por);

  const recusa = await chamar('POST /api/embalar', {id:id1}, BETO);
  ok('imprimir de novo pelo /api/embalar é recusado e também não troca o nome',
     !!recusa.erro && l(id1).impresso_por === 'Ana');

  const id2 = vol.run('BK140140BEGE','Cliente Dois','102','9002','8002','["9002"]','pendente',hoje,hoje,pdf,null).lastInsertRowid;
  await chamar('POST /api/embalar', {id:id2}, null);
  ok('sem ninguém logado a impressão não quebra — o nome fica vazio, não inventado',
     l(id2).estagio === 'embalado' && !l(id2).impresso_por, JSON.stringify(l(id2).impresso_por));

  // ── 3. O BIPE NO CARREGAMENTO: QUEM CONFERIU ─────────────────────────────
  r = await chamar('POST /api/carregar', {code:'9001'}, BETO);
  ok('o bipe do carregamento grava QUEM bipou e QUANDO',
     r.ok && l(id1).conferido_por === 'Beto' && !!l(id1).conferido_em, JSON.stringify(r));
  ok('e continua fazendo o que sempre fez (carregado, com carregado_em)',
     l(id1).estagio === 'carregado' && !!l(id1).carregado_em);
  ok('quem imprimiu continua sendo quem imprimiu', l(id1).impresso_por === 'Ana');
  const antes = l(id1).conferido_em;
  r = await chamar('POST /api/carregar', {code:'9001'}, ANA);
  ok('bipar de novo é recusado (duplicado) e não troca quem conferiu',
     r.motivo === 'duplicado' && l(id1).conferido_por === 'Beto' && l(id1).conferido_em === antes);

  // ── 4. O SCRIPT DO PASSIVO ───────────────────────────────────────────────
  const { fecharPassivo } = require('./fechar_saida_passivo');
  /* O cenario do passivo: caixas de coleta bipadas pro canto em dias diferentes
     e nunca fechadas com o motorista — e, em volta delas, tudo o que NAO pode
     ser tocado. */
  const ins = (buyer, estagio, modalidade, carregado_em, extra) => {
    const id = vol.run('BK140140BEGE',buyer,'2'+buyer.length,'P'+buyer,'V'+buyer,'[]',estagio,hoje,
      '2026-10-08',pdf,modalidade).lastInsertRowid;
    db.prepare('UPDATE lote SET carregado_em=? WHERE id=?').run(carregado_em, id);
    if(extra) db.prepare('UPDATE lote SET '+extra+' WHERE id=?').run(id);
    return id;
  };
  const c1 = ins('Canto Um',   'carregado','coleta','2026-09-20 10:15:00');
  const c2 = ins('Canto Dois', 'carregado','coleta','2026-09-23 16:40:00');
  const c3 = ins('Canto Tres', 'carregado','coleta','2026-09-24 08:05:00');
  const jaLevada = ins('Ja Levada','carregado','coleta','2026-09-18 09:00:00',"retirado_em='2026-09-18 11:00:00'");
  const naPrat   = ins('Prateleira','embalado','coleta',null);
  const pend     = ins('Pendente',  'pendente','coleta',null);
  const carro    = ins('No Carro',  'carregado','agencia','2026-09-24 09:00:00');
  const semMod   = ins('Sem Modal', 'carregado',null,'2026-09-24 09:30:00');
  const deTeste  = ins('De Teste',  'carregado','coleta','2026-09-24 10:00:00','teste=1');
  const foto = t => JSON.stringify(db.prepare('SELECT * FROM lote WHERE id=?').get(t));
  const intocados = [jaLevada,naPrat,pend,carro,semMod,deTeste];
  const antesTudo = intocados.map(foto);
  const modAntes = db.prepare('SELECT id,modalidade FROM lote ORDER BY id').all();

  let s = fecharPassivo(db, {aplicar:false});
  ok('simulação acha exatamente as 3 caixas esperando o caminhão',
     s.caixas.length === 3 && [c1,c2,c3].every(i => s.caixas.some(c => c.id === i)),
     JSON.stringify(s.caixas.map(c => c.id)));
  ok('simulação NÃO grava nada — nem saída, nem caixa',
     !s.saida_id && db.prepare('SELECT COUNT(*) n FROM saida').get().n === 0 && !l(c1).saiu_em && !l(c1).retirado_em);

  s = fecharPassivo(db, {aplicar:true});
  const sd = db.prepare('SELECT * FROM saida WHERE id=?').get(s.saida_id);
  ok('aplicar cria UMA saída tipo passivo', !!sd && sd.tipo === 'passivo' &&
     db.prepare('SELECT COUNT(*) n FROM saida').get().n === 1, JSON.stringify(sd));
  ok('a saída guarda quantas e quais caixas',
     sd && sd.qtd_sistema === 3 && JSON.parse(sd.ids).sort().join() === [c1,c2,c3].sort().join(),
     sd && (sd.qtd_sistema + ' ' + sd.ids));
  ok('cada caixa aponta para a saída e saiu pela coleta',
     [c1,c2,c3].every(i => l(i).saida_id === s.saida_id && l(i).saiu_por === 'coleta'));
  ok('a saída de cada caixa é carimbada no carregado_em DELA — nunca hoje',
     l(c1).saiu_em === '2026-09-20 10:15:00' && l(c2).saiu_em === '2026-09-23 16:40:00' &&
     l(c3).saiu_em === '2026-09-24 08:05:00',
     [c1,c2,c3].map(i => l(i).saiu_em).join(' | '));
  ok('retirado_em recebe o mesmo carimbo (relatório antigo e o adiantado continuam lendo)',
     [c1,c2,c3].every(i => l(i).retirado_em === l(i).saiu_em));
  ok('e as caixas saem do "esperando o caminhão"',
     db.prepare(`SELECT COUNT(*) n FROM lote WHERE ${require('./carga').AGUARDA_CAMINHAO}`).get().n === 1,
     'sobra só a de teste, que o script não toca');
  ok('não toca em nada fora do passivo: já levada, prateleira, pendente, carro, sem modalidade, teste',
     intocados.map(foto).join() === antesTudo.join());
  ok('não mexe em lote.modalidade de ninguém',
     JSON.stringify(db.prepare('SELECT id,modalidade FROM lote ORDER BY id').all()) === JSON.stringify(modAntes));

  const s2 = fecharPassivo(db, {aplicar:true});
  ok('rodar de novo não acha nada e não cria outra saída (idempotente)',
     s2.caixas.length === 0 && !s2.saida_id && db.prepare('SELECT COUNT(*) n FROM saida').get().n === 1);

  // ── 5. O SCRIPT RECUSA BANCO SEM AS COLUNAS ──────────────────────────────
  {
    const cru = new Database(path.join(tmp, 'cru.db'));
    cru.exec(`CREATE TABLE lote (id INTEGER PRIMARY KEY, estagio TEXT, modalidade TEXT,
      carregado_em TEXT, retirado_em TEXT, teste INTEGER DEFAULT 0)`);
    let erro = null;
    try{ fecharPassivo(cru, {aplicar:true}); }catch(e){ erro = e.message; }
    ok('banco sem as colunas novas é recusado dizendo para subir o servidor antes',
       !!erro && /servidor/i.test(erro), erro || 'não recusou');
    cru.close();
  }

  // ── 6. O SCRIPT: SIMULA POR PADRÃO E FAZ BACKUP ANTES ────────────────────
  const texto = fs.readFileSync(path.join(__dirname, 'fechar_saida_passivo.js'), 'utf8');
  ok('o script só grava com --aplicar', /process\.argv\.includes\(['"]--aplicar['"]\)/.test(texto));
  ok('e faz `await db.backup()` antes de gravar',
     /await\s+db\.backup\(/.test(texto) &&
     texto.indexOf('await db.backup(') < texto.lastIndexOf('fecharPassivo(db,{aplicar:true})'),
     'o backup tem que vir antes da chamada que grava');

  console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo certo') + ' — ' + casos + ' casos');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
