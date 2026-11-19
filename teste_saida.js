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
let ultimoStatus = 200;
function montar(db, modulos){
  const rotas = {};
  const app = { get:(p,...h)=>{ rotas['GET '+p]=h[h.length-1]; },
                post:(p,...h)=>{ rotas['POST '+p]=h[h.length-1]; },
                use:()=>{}, locals:{ acesso:{ auditar(){} } } };
  for(const m of modulos) require(m)(app, db);
  const chamar = (k, body, usuario) => new Promise(r => {
    ultimoStatus = 200;
    const res = { json:o=>r(o), status(c){ ultimoStatus = c; return res; }, send:o=>r(o), setHeader(){} };
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
  /* ATÉ 05/11/2026 a impressão sem login passava com o nome vazio. Desde a fase
     3 da QUEM-FEZ-E-REVISAO (regra-mãe, spec §2.3, linha no DECISOES.md de
     04/11/2026) ela é RECUSADA, e nada é gravado. */
  await chamar('POST /api/embalar', {id:id2}, null);
  ok('sem ninguém logado a impressão é recusada (401)', ultimoStatus === 401, String(ultimoStatus));
  ok('e nada é gravado: a caixa continua pendente, sem nome inventado',
     l(id2).estagio === 'pendente' && !l(id2).impresso_por, JSON.stringify(l(id2)));
  ok('quem imprimiu fica também pelo id', l(id1).impresso_por_id === 1, JSON.stringify(l(id1).impresso_por_id));

  /* A REIMPRESSÃO GRAVA QUEM, UMA LINHA POR VEZ (fase 3). A coluna "último que
     reimprimiu" apagaria quem reimprimiu antes. */
  const reimp = id => db.prepare('SELECT * FROM lote_reimpressao WHERE lote_id=? ORDER BY id').all(id);
  const vezesAntes = l(id1).reimpressoes;
  await chamar('POST /api/reimprimir', {id:id1}, null);
  ok('reimprimir sem login é recusado (401)', ultimoStatus === 401, String(ultimoStatus));
  ok('e não conta a reimpressão', l(id1).reimpressoes === vezesAntes, String(l(id1).reimpressoes));
  await chamar('POST /api/reimprimir', {id:id1}, ANA);
  let rs = []; try{ rs = reimp(id1); }catch(e){}
  ok('cada reimpressão é uma linha, com quem reimprimiu', rs.length === 2 &&
     rs[0].usuario_id === 2 && rs[0].usuario_nome === 'Beto' && rs[1].usuario_id === 1 && rs[1].usuario_nome === 'Ana',
     JSON.stringify(rs));
  ok('e com a hora', rs.every(x => !!x.em), JSON.stringify(rs));
  ok('o contador acompanha as linhas', l(id1).reimpressoes === rs.length, l(id1).reimpressoes + ' x ' + rs.length);
  ok('e a reimpressão não troca quem imprimiu (nem o nome, nem o id)',
     l(id1).impresso_por === 'Ana' && l(id1).impresso_por_id === 1);

  // ── 3. O BIPE NO CARREGAMENTO: QUEM CONFERIU ─────────────────────────────
  r = await chamar('POST /api/carregar', {code:'9001'}, BETO);
  ok('o bipe do carregamento grava QUEM bipou e QUANDO',
     r.ok && l(id1).conferido_por === 'Beto' && !!l(id1).conferido_em, JSON.stringify(r));
  /* Desde a fase 4 (D1, 26/09/2026) a caixa de AGÊNCIA fica na área depois
     deste bipe: quem a põe no carro é o bipe da viagem. */
  ok('na agência o bipe só confere: a caixa fica na área (fase 4)',
     l(id1).estagio === 'embalado' && !l(id1).carregado_em);
  ok('quem imprimiu continua sendo quem imprimiu', l(id1).impresso_por === 'Ana');
  const antes = l(id1).conferido_em;
  r = await chamar('POST /api/carregar', {code:'9001'}, ANA);
  ok('bipar de novo é recusado (já conferida) e não troca quem conferiu',
     r.motivo === 'ja_conferida' && l(id1).conferido_por === 'Beto' && l(id1).conferido_em === antes);

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

  /* A DATA DE CORTE (22/10/2026): "esperando o caminhão" também descreve a
     caixa bipada hoje cedo, que está no canto esperando o caminhão de hoje.
     Quem sabe até quando tudo saiu é quem viu sair. */
  const recusaPassivo = o => { try{ fecharPassivo(db, o); return null; }catch(e){ return e.message; } };
  let e1 = recusaPassivo({aplicar:true});
  ok('sem --ate é recusado, e nada é gravado',
     !!e1 && /data de corte/i.test(e1) && db.prepare('SELECT COUNT(*) n FROM saida').get().n === 0 && !l(c1).saiu_em,
     e1 || 'não recusou');
  e1 = recusaPassivo({aplicar:true, ate:'24/09/2026'});
  ok('data fora do formato AAAA-MM-DD é recusada', !!e1 && /formato/i.test(e1), e1 || 'não recusou');
  e1 = recusaPassivo({aplicar:true, ate:'2999-01-01'});
  ok('data de corte depois de hoje é recusada', !!e1 && /depois de hoje/i.test(e1), e1 || 'não recusou');
  let s = fecharPassivo(db, {aplicar:false, ate:'2026-09-23'});
  ok('o corte é pelo dia do bipe pro canto: até 23/09 pega as duas de antes e deixa a de 24/09',
     s.caixas.length === 2 && [c1,c2].every(i => s.caixas.some(c => c.id === i)),
     JSON.stringify(s.caixas.map(c => c.id)));

  s = fecharPassivo(db, {aplicar:false, ate:'2026-09-24'});
  ok('simulação acha exatamente as 3 caixas esperando o caminhão',
     s.caixas.length === 3 && [c1,c2,c3].every(i => s.caixas.some(c => c.id === i)),
     JSON.stringify(s.caixas.map(c => c.id)));
  ok('simulação NÃO grava nada — nem saída, nem caixa',
     !s.saida_id && db.prepare('SELECT COUNT(*) n FROM saida').get().n === 0 && !l(c1).saiu_em && !l(c1).retirado_em);

  s = fecharPassivo(db, {aplicar:true, ate:'2026-09-24'});
  const sd = db.prepare('SELECT * FROM saida WHERE id=?').get(s.saida_id);
  const hojeBR = hoje.slice(8,10) + '/' + hoje.slice(5,7) + '/' + hoje.slice(0,4);
  ok('o motivo gravado diz o dia da rodada e a data de corte (e não "25/09/2026" fixo)',
     !!sd && sd.motivo.includes('limpeza de ' + hojeBR) && sd.motivo.includes('até 24/09/2026') &&
     (hojeBR === '25/09/2026' || !sd.motivo.includes('25/09/2026')),
     sd && sd.motivo);
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

  const s2 = fecharPassivo(db, {aplicar:true, ate:hoje});
  ok('rodar de novo não acha nada e não cria outra saída (idempotente)',
     s2.caixas.length === 0 && !s2.saida_id && db.prepare('SELECT COUNT(*) n FROM saida').get().n === 1);

  // ── 5. O SCRIPT RECUSA BANCO SEM AS COLUNAS ──────────────────────────────
  {
    const cru = new Database(path.join(tmp, 'cru.db'));
    cru.exec(`CREATE TABLE lote (id INTEGER PRIMARY KEY, estagio TEXT, modalidade TEXT,
      carregado_em TEXT, retirado_em TEXT, teste INTEGER DEFAULT 0)`);
    let erro = null;
    try{ fecharPassivo(cru, {aplicar:true, ate:'2026-09-24'}); }catch(e){ erro = e.message; }
    ok('banco sem as colunas novas é recusado dizendo para subir o servidor antes',
       !!erro && /servidor/i.test(erro), erro || 'não recusou');
    cru.close();
  }

  // ── 6. O SCRIPT: SIMULA POR PADRÃO E FAZ BACKUP ANTES ────────────────────
  const texto = fs.readFileSync(path.join(__dirname, 'fechar_saida_passivo.js'), 'utf8');
  ok('o script só grava com --aplicar', /process\.argv\.includes\(['"]--aplicar['"]\)/.test(texto));
  ok('e faz `await db.backup()` antes de gravar',
     /await\s+db\.backup\(/.test(texto) &&
     texto.indexOf('await db.backup(') < texto.lastIndexOf('fecharPassivo(db,{aplicar:true'),
     'o backup tem que vir antes da chamada que grava');
  ok('a linha de comando passa o --ate para as duas chamadas do passivo da coleta',
     /fecharPassivo\(db, *\{aplicar:false, *ate\}\)/.test(texto) && /fecharPassivo\(db, *\{aplicar:true, *ate\}\)/.test(texto));

  // ── 7. O PASSIVO DAS CAIXAS NUNCA BIPADAS (01/10/2026) ───────────────────
  /* 460 caixas de coleta e 26 de agência com a etiqueta impressa e NUNCA
     bipadas — nem pro canto, nem na área. O dono confirmou que saíram todas
     até 30/09. Elas param um passo antes do que o grupo de cima fecha
     (`embalado`, não `carregado`), e por isso aquele critério não as acha. */
  const { fecharNaoBipadas } = require('./fechar_saida_passivo');
  const dia = n => db.prepare("SELECT date('now','localtime',?) d").get((n >= 0 ? '-' + n : '+' + (-n)) + ' day').d;
  const ATE = dia(1);
  const nb = (buyer, modalidade, embalado_em, despachar_em, extra) => {
    const id = vol.run('BK140140BEGE',buyer,'3'+buyer.length,'Q'+buyer,'W'+buyer,'[]','embalado',
      embalado_em.slice(0,10), despachar_em, pdf, modalidade).lastInsertRowid;
    db.prepare('UPDATE lote SET embalado_em=? WHERE id=?').run(embalado_em, id);
    if(extra) db.prepare('UPDATE lote SET '+extra+' WHERE id=?').run(id);
    return id;
  };
  const nCol   = nb('NB Coleta',   'coleta',  dia(9)+' 09:10:00', dia(7));
  const nColAt = nb('NB Atrasada', 'coleta',  dia(6)+' 11:00:00', dia(8));          // despacho ANTES da impressão
  const nTarde = nb('NB Tarde',    'coleta',  dia(5)+' 17:20:00', dia(5));          // impressa depois das 15:00
  const nAg    = nb('NB Agencia',  'agencia', dia(4)+' 08:00:00', dia(4));
  const nNull  = nb('NB SemModal', null,      dia(3)+' 08:30:00', null);            // sem data de despacho lida
  const xHoje  = nb('X Depois',    'coleta',  dia(0)+' 08:00:00', dia(0));          // impressa DEPOIS do corte
  const xFut   = nb('X Futura',    'coleta',  dia(3)+' 08:00:00', dia(-5));         // despacho futuro: está na fábrica
  const xConf  = nb('X Conferida', 'agencia', dia(3)+' 08:00:00', dia(3), "conferido_em='"+dia(3)+" 09:00:00', conferido_por='Ana'");
  const xCarro = nb('X No Carro',  'agencia', dia(3)+' 08:00:00', dia(3), "conferido_em='"+dia(3)+" 09:00:00', no_carro_em='"+dia(3)+" 10:00:00'");
  const xTeste = nb('X Teste',     'coleta',  dia(3)+' 08:00:00', dia(3), 'teste=1');
  const xPend  = vol.run('BK140140BEGE','X Pendente','399','QP','WP','[]','pendente',dia(3),dia(3),pdf,'coleta').lastInsertRowid;
  /* A BAIXA DO PASSIVO (19/11/2026, spec LIMPEZA-SAIU-SEM-CONFERENCIA, R-PAS-02).
     Desde 22/10/2026 a baixa é na conferência: a caixa impressa e nunca
     conferida NUNCA baixou, e fechar a saída sem baixar deixava o saldo alto
     para sempre. Agora o passivo dá a baixa — só na que nunca baixou. */
  db.exec(`INSERT INTO modelo (id,codigo,nome,exige_medida,sob_medida) VALUES (2,'SOBMEDIDA','Sob medida',0,1);
    INSERT INTO skus (codigo,estoque,modelo_id) VALUES ('SOBMEDIDA',0,2);
    INSERT INTO skus (codigo,estoque,modelo_id,largura_cm,altura_cm) VALUES ('BK160140CINZA',1,1,160,140);`);
  const nJaBaix = nb('NB JaBaixou', 'coleta',  dia(4)+' 08:10:00', dia(4));
  db.prepare('UPDATE lote SET baixado_em=embalado_em WHERE id=?').run(nJaBaix);   // a de antes de 22/10
  const nVarias = nb('NB Varias',   'coleta',  dia(4)+' 08:20:00', dia(4));
  db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd) VALUES (?,'BK140140BEGE',1),(?,'BK160140CINZA',2)").run(nVarias, nVarias);
  const nSob    = nb('NB SobMedida','coleta',  dia(4)+' 08:30:00', dia(4));
  db.prepare("UPDATE lote SET codigo='SOBMEDIDA' WHERE id=?").run(nSob);
  const xCanc   = nb('X Cancelada', 'coleta',  dia(3)+' 08:00:00', dia(3), "estagio='cancelado'");
  /* A caixa de várias com um item cancelado pelo ML continua `embalado`, com
     `cancelada_varias=1`, esperando uma pessoa no card (§3): não entra. */
  const xCancV  = nb('X CancVarias','coleta',  dia(3)+' 08:00:00', dia(3), "cancelada_varias=1, cancelada_em='"+dia(2)+" 09:00:00'");
  db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd) VALUES (?,'BK140140BEGE',1),(?,'BK160140CINZA',1)").run(xCancV, xCancV);
  const fechadas = [nCol,nColAt,nTarde,nAg,nNull,nJaBaix,nVarias,nSob];
  const baixam   = [nCol,nColAt,nTarde,nAg,nNull,nVarias,nSob];   // a sob medida ganha a marca, sem mexer em saldo
  const fora = [xHoje,xFut,xConf,xCarro,xTeste,xPend,xCanc,xCancV];
  const foraAntes = fora.map(foto);
  const modAntes2 = db.prepare('SELECT id,modalidade FROM lote ORDER BY id').all();
  const BAIXA = require('./baixa_dominio');
  const saldo = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
  const SKUS = ['BK140140BEGE','BK160140CINZA','SOBMEDIDA'];
  const saldoAntes = {}, livreAntes = {};
  SKUS.forEach(c => { saldoAntes[c] = saldo(c); livreAntes[c] = BAIXA.disponivel(db, c); });
  const movAntes = db.prepare('SELECT COALESCE(MAX(id),0) m FROM movimento_estoque').get().m;
  const baixadoJa = l(nJaBaix).baixado_em;
  const saidasAntes = db.prepare('SELECT COUNT(*) n FROM saida').get().n;

  let erroAte = null;
  try{ fecharNaoBipadas(db, {aplicar:false}); }catch(e){ erroAte = e.message; }
  ok('sem data de corte é recusado: a data é decisão de quem viu as caixas saírem',
     !!erroAte && /corte|--ate/i.test(erroAte), erroAte || 'não recusou');
  erroAte = null;
  try{ fecharNaoBipadas(db, {aplicar:false, ate:'30/09'}); }catch(e){ erroAte = e.message; }
  ok('data fora do formato AAAA-MM-DD é recusada', !!erroAte, 'aceitou 30/09');
  erroAte = null;
  try{ fecharNaoBipadas(db, {aplicar:false, ate:dia(-1)}); }catch(e){ erroAte = e.message; }
  ok('corte no futuro é recusado: ninguém viu sair o que ainda nem foi impresso', !!erroAte, 'aceitou amanhã');
  erroAte = null;
  try{ fecharNaoBipadas(db, {aplicar:false, ate:dia(0)}); }catch(e){ erroAte = e.message; }
  ok('corte HOJE é recusado: a caixa impressa hoje é trabalho da conferência (L2)',
     !!erroAte && /ontem/.test(erroAte), erroAte || 'aceitou hoje');

  let sn = fecharNaoBipadas(db, {aplicar:false, ate:ATE});
  const achou = sn.caixas.map(c => c.id).sort((a,b)=>a-b);
  ok('simulação acha exatamente as ' + fechadas.length + ' nunca bipadas até o corte (a cancelada fica fora)',
     achou.join() === fechadas.slice().sort((a,b)=>a-b).join(), JSON.stringify(achou));
  ok('simulação não grava nada',
     !sn.saida_id && db.prepare('SELECT COUNT(*) n FROM saida').get().n === saidasAntes && l(nCol).estagio === 'embalado');
  ok('simulação não baixa nada: nem saldo, nem baixado_em, nem linha no livro',
     SKUS.every(c => saldo(c) === saldoAntes[c]) && !l(nCol).baixado_em &&
     db.prepare('SELECT COALESCE(MAX(id),0) m FROM movimento_estoque').get().m === movAntes);
  ok('simulação diz quais já tinham baixado e quais baixam agora',
     sn.caixas.filter(c => c.ja_baixou).map(c => c.id).join() === String(nJaBaix) &&
     sn.caixas.filter(c => !c.ja_baixou).length === fechadas.length - 1,
     JSON.stringify(sn.caixas.map(c => [c.id, c.ja_baixou])));
  const q = {}; (sn.quadro || []).forEach(x => { q[x.codigo] = x; });
  ok('o quadro por SKU conta PEÇA: 1+1+1+1+1 da BEGE e 1 dela na caixa de várias = 6; 2 da CINZA',
     q.BK140140BEGE && q.BK140140BEGE.pecas === 6 && q.BK160140CINZA && q.BK160140CINZA.pecas === 2,
     JSON.stringify(sn.quadro));
  ok('o quadro diz saldo antes, saldo depois e o livre (que não muda)',
     q.BK140140BEGE && q.BK140140BEGE.saldo_antes === saldoAntes.BK140140BEGE &&
     q.BK140140BEGE.saldo_depois === saldoAntes.BK140140BEGE - 6 &&
     q.BK140140BEGE.livre === livreAntes.BK140140BEGE, JSON.stringify(q.BK140140BEGE));
  ok('o quadro marca o SKU que fica negativo (L8)',
     q.BK160140CINZA && q.BK160140CINZA.saldo_depois === -1 && q.BK160140CINZA.negativo === true,
     JSON.stringify(q.BK160140CINZA));
  ok('sob medida não entra no quadro: não baixa (§7)', !q.SOBMEDIDA, JSON.stringify(q.SOBMEDIDA));

  sn = fecharNaoBipadas(db, {aplicar:true, ate:ATE});
  const sdn = db.prepare('SELECT * FROM saida WHERE id=?').get(sn.saida_id);
  ok('aplicar cria UMA saída passivo com as ' + fechadas.length + ' caixas',
     !!sdn && sdn.tipo === 'passivo' && sdn.qtd_sistema === fechadas.length &&
     JSON.parse(sdn.ids).sort((a,b)=>a-b).join() === fechadas.slice().sort((a,b)=>a-b).join(),
     JSON.stringify(sdn));
  ok('cada caixa vira carregada e aponta para a saída',
     fechadas.every(i => l(i).estagio === 'carregado' && l(i).saida_id === sn.saida_id));
  ok('coleta sai pela coleta e agência (e sem modalidade) pela agência',
     ['coleta','coleta','coleta'].join() === [nCol,nColAt,nTarde].map(i => l(i).saiu_por).join() &&
     l(nAg).saiu_por === 'agencia' && l(nNull).saiu_por === 'agencia',
     fechadas.map(i => l(i).saiu_por).join());
  ok('carimbo = o dia do despacho às 15:00 — nunca hoje',
     l(nCol).carregado_em === dia(7)+' 15:00:00' && l(nAg).carregado_em === dia(4)+' 15:00:00',
     l(nCol).carregado_em + ' | ' + l(nAg).carregado_em);
  ok('despacho anterior à impressão: a caixa não saiu antes de ter etiqueta',
     l(nColAt).carregado_em === dia(6)+' 15:00:00', l(nColAt).carregado_em);
  ok('impressa depois das 15:00: o carimbo não fica antes da impressão',
     l(nTarde).carregado_em === dia(5)+' 17:20:00', l(nTarde).carregado_em);
  ok('sem despacho lido: o dia da impressão, às 15:00',
     l(nNull).carregado_em === dia(3)+' 15:00:00', l(nNull).carregado_em);
  ok('saiu_em = carregado_em em todas',
     fechadas.every(i => l(i).saiu_em === l(i).carregado_em));
  ok('retirado_em só na coleta (é o que diz, para ela, que o caminhão levou)',
     [nCol,nColAt,nTarde].every(i => l(i).retirado_em === l(i).carregado_em) &&
     !l(nAg).retirado_em && !l(nNull).retirado_em);
  ok('nenhuma vai parar no "esperando o caminhão"',
     !fechadas.some(i => db.prepare(`SELECT 1 FROM lote WHERE id=? AND ${require('./carga').AGUARDA_CAMINHAO}`).get(i)));
  ok('conferido_em continua vazio: ninguém conferiu, e o campo diz isso',
     fechadas.every(i => !l(i).conferido_em && !l(i).conferido_por));
  ok('não contam como saída adiantada (saíram no dia do despacho)',
     db.prepare(`SELECT COUNT(*) n FROM lote WHERE id IN (${fechadas.join(',')})
       AND despachar_em > date(${require('./carga').SAIDA()})`).get().n === 0);
  ok('não toca em quem fica: depois do corte, despacho futuro, conferida, no carro, teste, pendente',
     fora.map(foto).join() === foraAntes.join());
  ok('não mexe em modalidade',
     JSON.stringify(db.prepare('SELECT id,modalidade FROM lote ORDER BY id').all()) === JSON.stringify(modAntes2));
  const novos = db.prepare('SELECT * FROM movimento_estoque WHERE id>? ORDER BY id').all(movAntes);
  const porRef = r => novos.filter(m => m.referencia === 'lote:' + r);
  ok('a caixa nunca baixada BAIXA: −1 por persiana, uma linha no livro (L3)',
     [nCol,nColAt,nTarde,nAg,nNull].every(i => porRef(i).length === 1 && porRef(i)[0].delta === -1 &&
       porRef(i)[0].tipo === 'conferencia' && porRef(i)[0].codigo === 'BK140140BEGE'),
     JSON.stringify(novos));
  ok('a caixa de várias persianas baixa N, uma linha por SKU',
     porRef(nVarias).length === 2 &&
     porRef(nVarias).some(m => m.codigo === 'BK140140BEGE' && m.delta === -1) &&
     porRef(nVarias).some(m => m.codigo === 'BK160140CINZA' && m.delta === -2), JSON.stringify(porRef(nVarias)));
  ok('a que já tinha baixado NÃO baixa de novo, e o baixado_em dela não muda',
     porRef(nJaBaix).length === 0 && l(nJaBaix).baixado_em === baixadoJa);
  ok('sob medida não move saldo, mas fica marcada (senão esperaria baixa para sempre)',
     porRef(nSob).length === 0 && !!l(nSob).baixado_em && saldo('SOBMEDIDA') === saldoAntes.SOBMEDIDA);
  ok('baixado_em é o CARIMBO DE SAÍDA da caixa, nunca a hora da rodada (L4)',
     baixam.every(i => l(i).baixado_em === l(i).carregado_em) &&
     l(nCol).baixado_em === dia(7)+' 15:00:00', baixam.map(i => l(i).baixado_em).join(' | '));
  ok('a linha do livro tem o motivo do passivo, e não fica sem dizer por quê',
     novos.length > 0 && novos.every(m => /passivo|sem confer/i.test(m.motivo || '')),
     JSON.stringify(novos.map(m => m.motivo)));
  ok('o saldo anda exatamente o que o livro diz (SUM(delta) das linhas novas)',
     SKUS.every(c => saldo(c) - saldoAntes[c] === novos.filter(m => m.codigo === c).reduce((a, m) => a + m.delta, 0)) &&
     saldo('BK140140BEGE') === saldoAntes.BK140140BEGE - 6 && saldo('BK160140CINZA') === -1,
     SKUS.map(c => c + ' ' + saldoAntes[c] + '→' + saldo(c)).join(', '));
  ok('o LIVRE de cada SKU é o mesmo antes e depois: a peça já não estava na prateleira',
     SKUS.every(c => BAIXA.disponivel(db, c) === livreAntes[c]),
     SKUS.map(c => c + ' ' + livreAntes[c] + '→' + BAIXA.disponivel(db, c)).join(', '));
  ok('a caixa de várias com item cancelado não baixa nem fecha: espera a pessoa no card (L6, §3)',
     porRef(xCancV).length === 0 && l(xCancV).estagio === 'embalado' && !l(xCancV).saida_id && !l(xCancV).baixado_em);
  ok('a cancelada não baixa nem fecha (L6)',
     porRef(xCanc).length === 0 && l(xCanc).estagio === 'cancelado' && !l(xCanc).baixado_em);
  const sn2 = fecharNaoBipadas(db, {aplicar:true, ate:ATE});
  ok('o resultado conta o que FECHOU e o que BAIXOU de fato, não a previsão',
     sn.fechadas === fechadas.length && sn.baixadas === baixam.length && sn.pecas_baixadas === 8,
     JSON.stringify({f:sn.fechadas, b:sn.baixadas, p:sn.pecas_baixadas}));
  ok('rodar de novo não acha nada e não cria outra saída',
     sn2.caixas.length === 0 && !sn2.saida_id &&
     db.prepare('SELECT COUNT(*) n FROM saida').get().n === saidasAntes + 1);
  ok('e não baixa nada de novo',
     db.prepare('SELECT COUNT(*) n FROM movimento_estoque WHERE id>?').get(movAntes).n === novos.length);
  ok('o script não diz mais que a baixa foi na impressão',
     !/baixa (foi|aconteceu) na impress/i.test(texto), 'ainda diz');
  ok('o script tem o modo --nao-bipadas, exige --ate e faz backup antes de gravar',
     /--nao-bipadas/.test(texto) && /--ate/.test(texto) &&
     texto.indexOf('await db.backup(') < texto.lastIndexOf('fecharNaoBipadas(db,{aplicar:true'));

  /* SKU FORA DO CADASTRO: a simulação diz, e o aplicar recusa ANTES de gravar
     qualquer coisa — o movimentar estouraria no meio e derrubaria a rodada. */
  const xSemCad = nb('X SemCadastro', 'coleta', dia(3)+' 08:00:00', dia(3));
  db.prepare("UPDATE lote SET codigo='ZZZ-SEM-CADASTRO' WHERE id=?").run(xSemCad);
  const s3 = fecharNaoBipadas(db, {aplicar:false, ate:ATE});
  const qz = (s3.quadro || []).find(x => x.codigo === 'ZZZ-SEM-CADASTRO');
  ok('simulação: SKU fora do cadastro aparece como tal, e não com saldo 0',
     !!qz && qz.sem_cadastro === true && qz.saldo_antes === null, JSON.stringify(qz));
  let erroCad = null;
  const saidas3 = db.prepare('SELECT COUNT(*) n FROM saida').get().n;
  try{ fecharNaoBipadas(db, {aplicar:true, ate:ATE}); }catch(e){ erroCad = e.message; }
  ok('aplicar com SKU fora do cadastro é recusado dizendo qual, e nada grava',
     !!erroCad && /ZZZ-SEM-CADASTRO/.test(erroCad) && /cadastre/.test(erroCad) && l(xSemCad).estagio === 'embalado' &&
     db.prepare('SELECT COUNT(*) n FROM saida').get().n === saidas3, erroCad || 'não recusou');
  db.prepare("UPDATE lote SET estagio='cancelado' WHERE id=?").run(xSemCad);

  /* A CAIXA CONFERIDA ENTRE A LEITURA E A GRAVAÇÃO: não fecha, não baixa, não
     entra nos ids da saída e não é contada no resultado. */
  const xCorrida = nb('X Corrida', 'coleta', dia(3)+' 08:00:00', dia(3));
  const nOk      = nb('NB Ok',     'coleta', dia(3)+' 08:10:00', dia(3));
  const resOrig = BAIXA.reservados;
  BAIXA.reservados = function(){ db.prepare("UPDATE lote SET conferido_em=datetime('now','localtime') WHERE id=?").run(xCorrida);
    return resOrig.apply(this, arguments); };
  let s4;
  try{ s4 = fecharNaoBipadas(db, {aplicar:true, ate:ATE}); } finally { BAIXA.reservados = resOrig; }
  const sd4 = db.prepare('SELECT * FROM saida WHERE id=?').get(s4.saida_id);
  ok('a caixa conferida no meio não fecha nem baixa, e fica fora da saída e da conta',
     l(xCorrida).estagio === 'embalado' && !l(xCorrida).baixado_em && l(nOk).estagio === 'carregado' &&
     s4.fechadas === 1 && s4.baixadas === 1 && s4.pecas_baixadas === 1 &&
     sd4.qtd_sistema === 1 && JSON.parse(sd4.ids).join() === String(nOk),
     JSON.stringify({f:s4.fechadas, b:s4.baixadas, p:s4.pecas_baixadas, sd:sd4 && [sd4.qtd_sistema, sd4.ids]}));

  /* TODAS CONFERIDAS NO MEIO: a saída passivo não nasce vazia. */
  const xSo = nb('X SoEla', 'coleta', dia(3)+' 08:00:00', dia(3));
  const saidas5 = db.prepare('SELECT COUNT(*) n FROM saida').get().n;
  BAIXA.reservados = function(){ db.prepare("UPDATE lote SET conferido_em=datetime('now','localtime') WHERE id=?").run(xSo);
    return resOrig.apply(this, arguments); };
  let s5;
  try{ s5 = fecharNaoBipadas(db, {aplicar:true, ate:ATE}); } finally { BAIXA.reservados = resOrig; }
  ok('se nenhuma caixa fechou, não fica saída passivo vazia',
     !s5.saida_id && s5.fechadas === 0 && db.prepare('SELECT COUNT(*) n FROM saida').get().n === saidas5,
     JSON.stringify({id:s5.saida_id, f:s5.fechadas}));
  ok('o aviso separa a caixa de várias que espera decisão no card da que já foi decidida',
     /cancelada_resolvida_em IS NULL/.test(texto) && /cancelada_resolvida_em IS NOT NULL/.test(texto));

  // ── 6. O MODO TESTE COBRE A REIMPRESSÃO (fase 3 da QUEM-FEZ-E-REVISAO) ────
  require('./teste_route')({ get(){}, post(){}, locals:{} }, db);
  ok('lote_reimpressao está em TABELAS: tem o gatilho do modo teste',
     !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='trg_teste_lote_reimpressao'").get());

  console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo certo') + ' — ' + casos + ' casos');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
