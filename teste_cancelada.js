#!/usr/bin/env node
/* Testes da fase 2 da spec VENDAS-E-MEDIA: a planilha so espelha as vendas
 * FUTURAS, e a venda cancelada no Mercado Livre tira o volume das listas.
 *
 *   node teste_cancelada.js
 *
 * Os casos saem do relatorio REAL do ML (26/09/2026, 4.867 linhas):
 *  - a coluna "N.o de venda" traz ora a VENDA (2000018...), ora o PACK
 *    (2000015...) — o cruzamento olha `lote.venda` e `lote.packId`;
 *  - o pacote de varios produtos vem com uma linha de CABECALHO ("Pacote de 2
 *    produtos", o numero do pack, sem SKU) e uma linha por item embaixo, cada
 *    uma com a venda dela e o Estado dela;
 *  - cancelamento de verdade sao tres frases ("Cancelada pelo comprador",
 *    "Venda cancelada. Nao envie.", "Pacote cancelado pelo Mercado Livre");
 *    devolucao e reembolso sao DEPOIS de entregue, e nao mexem em volume.
 *
 * E as tres decisoes do dono (26/09/2026): D1 A — o volume cancelado ganha
 * estagio proprio, 'cancelado'; D2 — o bipe do carregamento recusa a caixa
 * cancelada; D3 — as canceladas depois da etiqueta aparecem num card, e o
 * estoque nao volta sozinho.
 *
 * Sobe um banco temporario e chama os handlers direto. Nao toca em producao.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-canc-'));
process.env.PCP_DIR = tmp;

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra !== undefined ? '   ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };

const db = new Database(path.join(tmp, 't.db'));
db.exec(`CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0, modelo_id INTEGER);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, sob_medida INTEGER DEFAULT 0,
    exige_medida INTEGER DEFAULT 1);`);
db.prepare("INSERT INTO skus (codigo,estoque) VALUES ('BK140140BEGE',5),('BK120120BEGE',3),('BK160160BEGE',4)").run();

const rotas = {};
const auditado = [];
const app = { get:(p,...h)=>{ rotas['GET '+p]=h[h.length-1]; },
              post:(p,...h)=>{ rotas['POST '+p]=h[h.length-1]; },
              use:()=>{}, locals:{ acesso:{ auditar(req,a,b,c,d){ auditado.push([b,c,d]); } } } };
require('./exp_route')(app, db);
require('./carreg_route')(app, db);
require('./saida_route')(app, db);
require('./plan_route')(app, db);
const MEDIA = require('./media_dominio');

const chamar = (k, body, usuario) => new Promise(r => {
  if(!rotas[k]) return r({ __sem_rota:k });
  let st = 200;
  const res = { json:o=>r(Object.assign({__st:st}, o)), status(n){ st = n; return res; }, send:o=>r(o), setHeader(){} };
  try{ rotas[k]({ body:body||{}, params:{}, query:{}, headers:{}, usuario:usuario||null }, res); }
  catch(e){ r({ __st:500, __erro:String(e.message||e) }); }
});
const q1 = s => db.prepare(s).get();
const lote = id => db.prepare('SELECT * FROM lote WHERE id=?').get(id);
const hoje = q1("SELECT date('now','localtime') d").d;
const ANA = {id:1, nome:'Ana'};

/* ---- a planilha, no formato do relatorio do ML (CSV com ';') ---- */
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro',
  'outubro','novembro','dezembro'];
const diaMais = n => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const porExtenso = d => d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear() + ' 10:00 hs.';
const envioEm = n => { const d = diaMais(n); return 'Para entregar na coleta do dia ' + d.getDate() + ' de ' + MESES[d.getMonth()]; };
function linha(numero, diasAtras, estado, sku, pacote){
  const c = new Array(24).fill('');
  c[0] = numero; c[1] = porExtenso(diaMais(-diasAtras)); c[3] = estado; c[5] = pacote || 'Não'; c[22] = sku || '';
  return c.join(';');
}
function arquivo(linhas){
  const cab = new Array(24).fill('x'); cab[0] = 'N.º de venda'; cab[22] = 'SKU';
  const txt = [cab.join(';')].concat(linhas).join('\n') + '\n';
  return 'data:text/csv;base64,' + Buffer.from(txt, 'utf8').toString('base64');
}
const importar = (linhas, extra) => chamar('POST /api/planejamento/importar',
  Object.assign({ arquivo: arquivo(linhas) }, extra || {}), ANA);
const vf = id => db.prepare('SELECT * FROM venda_futura WHERE venda_id=?').get(id);

/* ---- os volumes ---- */
const vol = (buyer, estagio, campos) => {
  const c = Object.assign({ codigo:'BK140140BEGE', packId:null, venda:null, modalidade:'agencia',
    data: hoje, embalado_em: null }, campos || {});
  const codes = JSON.stringify([c.packId, c.venda].filter(Boolean));
  const id = db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,venda,codes,estagio,data,modalidade,embalado_em,despachar_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(c.codigo, buyer, 'NF'+buyer, c.packId, c.venda, codes, estagio, c.data,
      c.modalidade, c.embalado_em, hoje).lastInsertRowid;
  return id;
};

(async () => {
  /* ═════════ 1. O import espelha só as FUTURAS ═════════ */
  let r = await importar([
    linha('2000018000000001', 40, 'Entregue', 'BK140140BEGE'),
    linha('2000018000000002', 3,  'Entregue', 'BK140140BEGE'),
  ]);
  ok('arquivo sem nenhuma venda futura é RECUSADO', r.__st === 400 && r.motivo === 'sem_futura'
     && /envio futuro/.test(r.erro || ''), r);
  ok('...e nada foi gravado', !vf('2000018000000002'));

  r = await importar([
    linha('2000018000000001', 40, 'Entregue', 'BK140140BEGE'),
    linha('2000018000000002', 3,  'Entregue', 'BK140140BEGE'),
    linha('2000018000000010', 1,  envioEm(5), 'BK140140BEGE'),
    linha('2000018000000011', 1,  envioEm(6), 'BK160160BEGE'),
    linha('2000018000000012', 1,  envioEm(7), 'BK160160BEGE'),
    linha('2000018000000013', 1,  envioEm(8), 'BK120120BEGE'),
  ]);
  ok('arquivo com futura importa', r.ok === true && r.futuras === 4, r);
  ok('a venda PASSADA continua sendo gravada (a média da planilha vive até a fase 3)',
     !!vf('2000018000000002') && vf('2000018000000002').data_venda !== null, vf('2000018000000002'));

  // um recorte: só as futuras, sem as passadas
  r = await importar([
    linha('2000018000000010', 1, envioEm(5), 'BK140140BEGE'),
    linha('2000018000000011', 1, envioEm(6), 'BK160160BEGE'),
    linha('2000018000000012', 1, envioEm(7), 'BK160160BEGE'),
    linha('2000018000000013', 1, envioEm(8), 'BK120120BEGE'),
  ]);
  ok('um RECORTE não apaga a venda passada (armadilha #11)', r.ok === true && !!vf('2000018000000002')
     && !!vf('2000018000000001') && r.removidas === 0, r);

  // uma futura some do arquivo: ela sai (espelho entre as futuras)
  r = await importar([
    linha('2000018000000010', 1, envioEm(5), 'BK140140BEGE'),
    linha('2000018000000011', 1, envioEm(6), 'BK160160BEGE'),
    linha('2000018000000012', 1, envioEm(7), 'BK160160BEGE'),
  ]);
  ok('a venda FUTURA que não veio no arquivo sai', r.ok === true && !vf('2000018000000013') && r.removidas === 1, r);

  // tirar mais da metade das futuras pede confirmação
  r = await importar([ linha('2000018000000010', 1, envioEm(5), 'BK140140BEGE') ]);
  ok('tirar mais da metade das futuras pede confirmar', r.__st === 409 && r.motivo === 'confirmar'
     && r.sairiam === 2 && r.futuras_hoje === 3, r);
  ok('...e sem confirmar nada muda', !!vf('2000018000000011') && !!vf('2000018000000012'));
  r = await importar([ linha('2000018000000010', 1, envioEm(5), 'BK140140BEGE') ], { confirmar:true });
  ok('com confirmar, aplica', r.ok === true && !vf('2000018000000011') && r.removidas === 2, r);

  /* ═════════ 2. A venda cancelada, por estágio ═════════ */
  const pend   = vol('Pend',   'pendente',  { venda:'2000018100000001', packId:'2000015100000001' });
  const bloq   = vol('Bloq',   'bloqueado', { packId:'2000015100000002', venda:'2000018100000002' });
  const emb    = vol('Emb',    'embalado',  { venda:'2000018100000003', embalado_em: hoje+' 09:00:00' });
  const saiu   = vol('Saiu',   'carregado', { venda:'2000018100000004', embalado_em: hoje+' 08:00:00' });
  db.prepare("UPDATE lote SET carregado_em=datetime('now','localtime') WHERE id=?").run(saiu);
  const canto  = vol('Canto',  'carregado', { venda:'2000018100000005', modalidade:'coleta', embalado_em: hoje+' 08:00:00' });
  db.prepare("UPDATE lote SET carregado_em=datetime('now','localtime') WHERE id=?").run(canto);
  const varias = vol('Varias', 'pendente',  { venda:'2000018100000006', packId:'2000015100000006' });
  db.prepare("INSERT INTO lote_item (lote_id,codigo,qtd,origem) VALUES (?,?,?,?)").run(varias, 'BK140140BEGE', 2, 'folha');
  const pac    = vol('Pacote', 'pendente',  { venda:'2000018100000007', packId:'2000015100000007' });
  const devol  = vol('Devol',  'pendente',  { venda:'2000018100000008' });
  const vivo   = vol('Vivo',   'pendente',  { venda:'2000018100000009' });
  const estoqueAntes = q1("SELECT estoque FROM skus WHERE codigo='BK140140BEGE'").estoque;
  const volMedia = () => ((MEDIA.mediaPorSku(db, { janela: 30 }).skus.BK140140BEGE) || {}).volumes || 0;
  const mediaAntes = volMedia();

  const futura = linha('2000018000000010', 1, envioEm(5), 'BK140140BEGE');
  r = await importar([
    futura,
    linha('2000018100000001', 2, 'Cancelada pelo comprador', 'BK140140BEGE'),                  // pela VENDA
    linha('2000015100000002', 2, 'Venda cancelada. Não envie.', 'BK140140BEGE', 'Sim'),        // pelo PACK
    linha('2000018100000003', 2, 'Cancelada pelo comprador', 'BK140140BEGE'),
    linha('2000018100000004', 2, 'Cancelada pelo comprador', 'BK140140BEGE'),
    linha('2000018100000005', 2, 'Pacote cancelado pelo Mercado Livre', 'BK140140BEGE'),
    linha('2000018100000006', 2, 'Cancelada pelo comprador', 'BK140140BEGE'),
    // o pacote de varios produtos: cabecalho com o PACK, e o item cancelado com OUTRA venda
    linha('2000015100000007', 2, 'Pacote de 2 produtos', '', ''),
    linha('2000018100000070', 2, 'Entregue', 'BK140140BEGE', 'Sim'),
    linha('2000018100000071', 2, 'Cancelada pelo comprador', 'BK120120BEGE', 'Sim'),
    linha('2000018100000008', 2, 'Devolução finalizada com reembolso para o comprador', 'BK140140BEGE'),
    linha('2000018199999999', 2, 'Cancelada pelo comprador', 'BK140140BEGE'),                  // nao existe no lote
  ]);
  ok('o import com canceladas passa', r.ok === true, r);
  const c = r.canceladas_volumes || {};
  ok('o resumo diz as canceladas por estágio', c.pendente === 1 && c.bloqueado === 1 && c.embalado === 1
     && c.no_canto === 1 && c.carregado === 1 && c.varias === 2 && c.nao_achada === 1, c);

  let l = lote(pend);
  ok('pendente cancelado (achado pela VENDA) vira estagio "cancelado"', l.estagio === 'cancelado'
     && l.cancelada_estagio === 'pendente' && !!l.cancelada_em && l.cancelada_origem === 'planilha'
     && /Cancelada pelo comprador/.test(l.cancelada_motivo || ''), l);
  ok('bloqueado cancelado é achado pelo número do PACK', lote(bloq).estagio === 'cancelado'
     && lote(bloq).cancelada_estagio === 'bloqueado', lote(bloq));
  ok('o estoque NÃO mexe no cancelamento', q1("SELECT estoque FROM skus WHERE codigo='BK140140BEGE'").estoque === estoqueAntes);
  l = lote(emb);
  ok('embalado cancelado sai para "cancelado", lembrando que estava impresso', l.estagio === 'cancelado'
     && l.cancelada_estagio === 'embalado' && l.embalado_em === hoje+' 09:00:00', l);
  ok('carregado que JÁ SAIU é ignorado', lote(saiu).estagio === 'carregado' && !lote(saiu).cancelada_em, lote(saiu));
  l = lote(canto);
  ok('coleta ainda no CANTO é cancelada (está na fábrica)', l.estagio === 'cancelado' && l.cancelada_estagio === 'carregado', l);
  l = lote(varias);
  ok('caixa de VÁRIAS persianas nunca é cancelada sozinha', l.estagio === 'pendente' && !l.cancelada_em
     && l.cancelada_varias === 1, l);
  l = lote(pac);
  ok('o item cancelado de um pacote de vários produtos acha a caixa pelo CABEÇALHO', l.estagio === 'pendente'
     && l.cancelada_varias === 1 && !l.cancelada_em, l);
  ok('devolução/reembolso NÃO cancela volume', lote(devol).estagio === 'pendente' && !lote(devol).cancelada_em, lote(devol));
  ok('...mas continua fora da média da planilha', vf('2000018100000008') && vf('2000018100000008').cancelada === 1);
  ok('volume sem cancelamento não se mexe', lote(vivo).estagio === 'pendente' && !lote(vivo).cancelada_em);

  // pend, bloq, emb e canto (BK140140BEGE) cancelados; o de varias e o do pacote NAO
  ok('a média do sistema deixa de contar as 4 canceladas', mediaAntes - volMedia() === 4,
     'antes ' + mediaAntes + ' depois ' + volMedia());
  ok('...e as colunas novas existem no lote', ['cancelada_em','cancelada_origem','cancelada_estagio',
     'cancelada_motivo','cancelada_varias'].every(k => db.prepare('PRAGMA table_info(lote)').all().some(x => x.name === k)));

  // reimportar não duplica
  r = await importar([
    futura,
    linha('2000018100000001', 2, 'Cancelada pelo comprador', 'BK140140BEGE'),
    linha('2000018100000003', 2, 'Cancelada pelo comprador', 'BK140140BEGE'),
    linha('2000018100000006', 2, 'Cancelada pelo comprador', 'BK140140BEGE'),
  ]);
  const c2 = r.canceladas_volumes || {};
  ok('reimportar não marca de novo', c2.ja_marcada === 3 && !c2.pendente && !c2.embalado && !c2.varias, c2);

  /* ═════════ 3. O card: canceladas depois da etiqueta ═════════ */
  r = await chamar('GET /api/canceladas');
  const ids = (r.volumes || []).map(v => v.id);
  ok('o card lista a impressa, a do canto e as caixas de várias', ids.includes(emb) && ids.includes(canto)
     && ids.includes(varias) && ids.includes(pac), r);
  ok('...e NÃO lista a pendente cancelada (nada baixou)', !ids.includes(pend) && !ids.includes(bloq));
  const vEmb = (r.volumes || []).find(v => v.id === emb) || {};
  ok('a linha diz o que o ML disse e onde a caixa estava', /Cancelada/.test(vEmb.cancelada_motivo || '')
     && vEmb.cancelada_estagio === 'embalado', vEmb);

  /* ═════════ 4. O carregamento recusa a caixa cancelada (D2) ═════════ */
  const n0 = auditado.length;
  r = await chamar('POST /api/carregar', { code:'2000018100000003' }, ANA);
  ok('o bipe recusa a caixa cancelada', r.ok === false && r.motivo === 'cancelada'
     && /cancelada/i.test(r.aviso || '') && /não carregar/i.test(r.aviso || ''), r);
  ok('...e a recusa vai para a auditoria', auditado.length === n0 + 1 && auditado[n0][0] === 'carregar_cancelada', auditado);
  ok('...e a caixa não andou', lote(emb).estagio === 'cancelado' && !lote(emb).carregado_em);
  const d = await chamar('GET /api/carregamento');
  ok('a caixa cancelada sai das listas do carregamento', !JSON.stringify(d).includes('"Emb"')
     && !JSON.stringify(d).includes('"Canto"'), d);

  r = await chamar('POST /api/reimprimir', { id: emb }, ANA);
  ok('a reimpressão recusa a venda cancelada', !r.ok && /cancelada/i.test(r.erro || ''), r);
  const pr = await new Promise(res => {
    let st = 200; const rs = { status(n){ st = n; return rs; }, send(t){ res({ st, t }); }, json(o){ res({ st, o }); }, setHeader(){} };
    rotas['GET /api/print/:id']({ params:{ id: String(emb) }, query:{}, body:{}, headers:{} }, rs);
  });
  ok('...e a impressão também (409)', pr.st === 409 && /CANCELADA/.test(pr.t || ''), pr);

  // na viagem à agência
  const ag = vol('AgViagem', 'embalado', { venda:'2000018100000020', embalado_em: hoje+' 09:00:00' });
  db.prepare("UPDATE lote SET conferido_em=datetime('now','localtime'), conferido_por='Ana' WHERE id=?").run(ag);
  r = await chamar('POST /api/viagem/abrir', {}, ANA);
  r = await chamar('POST /api/viagem/carro', { code:'2000018100000020' }, ANA);
  ok('a caixa conferida entra no carro da viagem', r.ok === true && lote(ag).estagio === 'carregado', r);
  r = await importar([ futura, linha('2000018100000020', 1, 'Cancelada pelo comprador', 'BK140140BEGE') ]);
  l = lote(ag);
  ok('cancelada DENTRO do carro de uma viagem aberta: sai da viagem', r.ok && l.estagio === 'cancelado'
     && l.cancelada_estagio === 'carregado' && l.saida_id === null && !l.no_carro_em, l);
  ok('...e conta como "no carro" no resumo', (r.canceladas_volumes || {}).no_carro === 1, r.canceladas_volumes);
  r = await chamar('POST /api/viagem/carro', { code:'2000018100000003' }, ANA);
  ok('o bipe da viagem também recusa a cancelada', r.ok === false && r.motivo === 'cancelada', r);

  console.log('\n' + (casos - falhas) + ' de ' + casos + ' casos passaram' + (falhas ? ' — ' + falhas + ' FALHARAM' : ''));
  try{ db.close(); fs.rmSync(tmp, { recursive:true, force:true }); }catch(e){}
  process.exit(falhas ? 1 : 0);
})();
