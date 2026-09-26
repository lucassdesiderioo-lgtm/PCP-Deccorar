#!/usr/bin/env node
/* Testes da fase 4 da spec SAIDA-E-DUPLA-CONFERENCIA — a VIAGEM À AGÊNCIA.
 *
 *   node teste_saida_agencia.js
 *
 * Até a fase 3 um bipe só punha a caixa de agência direto no carro (opção A),
 * e a viagem não tinha fechamento: "a agência bipou 90, levamos 90" era um
 * número na cabeça. Agora a caixa de agência tem DOIS bipes (D1, 26/09/2026):
 *
 *     área   o bipe normal do Carregamento — CONFERE, e a caixa fica na área
 *     carro  com a viagem aberta — só aceita caixa já conferida
 *
 * e a viagem fecha com a foto da tela do atendente e o número dele:
 *
 *     saíram = as caixas bipadas no carro NESTA viagem
 *
 * O que estes casos travam:
 * - caixa não conferida é recusada no carro, dizendo o que fazer;
 * - a caixa de coleta que vai pela agência é troca de porta, sai da conta do
 *   caminhão e NÃO muda a modalidade;
 * - tirar do carro desfaz o bipe, e cancelar com o carro cheio é recusado;
 * - divergência não anda, e liberar exige motivo;
 * - agência antes e depois do caminhão, e duas viagens no mesmo dia;
 * - a conta do caminhão continua só com o canto da coleta (D2), e a agência
 *   conferida na área passa a ser "pode ter ido no caminhão".
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-saida-ag-'));
process.env.PCP_DIR = tmp;

let falhas = 0, casos = 0;
const ok = (n, c, extra) => { casos++;
  if(c) console.log('ok      ' + n);
  else { falhas++; console.log('FALHOU  ' + n + (extra ? '   ' + extra : '')); } };

const db = new Database(path.join(tmp, 't.db'));
const rotas = {};
const auditado = [];
const app = { get:(p,...h)=>{ rotas['GET '+p]=h[h.length-1]; },
              post:(p,...h)=>{ rotas['POST '+p]=h[h.length-1]; },
              use:()=>{}, locals:{ acesso:{ auditar(req,a,b,c,d){ auditado.push([b,c,d]); } } } };
require('./exp_route')(app, db);
require('./carreg_route')(app, db);
require('./saida_route')(app, db);
const chamar = (k, body, usuario) => new Promise(r => {
  if(!rotas[k]) return r({ __sem_rota:k });
  const res = { json:o=>r(o), status(){ return res; }, send:o=>r(o), setHeader(){} };
  rotas[k]({ body:body||{}, params:{}, query:{}, headers:{}, usuario:usuario||null }, res);
});
const ANA = {id:1,nome:'Ana'}, BETO = {id:2,nome:'Beto'};
const FOTO = 'data:image/jpeg;base64,' + Buffer.alloc(3000, 7).toString('base64');
const q1 = s => db.prepare(s).get();
const hoje = q1("SELECT date('now','localtime') d").d;
const depois = q1("SELECT date('now','localtime','+5 day') d").d;
const lote = id => db.prepare('SELECT * FROM lote WHERE id=?').get(id);

const vol = (buyer, estagio, modalidade, extra) => {
  const id = db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,codes,estagio,data,despachar_em,modalidade,
      embalado_em,impresso_por) VALUES ('BK140140BEGE',?,?,?,?,?,?,?,?,datetime('now','localtime'),'Beto')`)
    .run(buyer, 'NF'+buyer, 'P'+buyer, JSON.stringify(['P'+buyer]), estagio, hoje, hoje, modalidade).lastInsertRowid;
  if(extra) db.prepare('UPDATE lote SET '+extra+' WHERE id=?').run(id);
  return id;
};

(async () => {
  const a1 = vol('AgUm', 'embalado', 'agencia');
  const a2 = vol('AgDois', 'embalado', null);                       // NULL é agência
  const a3 = vol('AgTres', 'embalado', 'agencia');
  const aFut = vol('AgFutura', 'embalado', 'agencia', `despachar_em='${depois}'`);
  const aSem = vol('AgSemConf', 'embalado', 'agencia');
  const c1 = vol('ColUm', 'embalado', 'coleta');
  const c2 = vol('ColDois', 'embalado', 'coleta');
  const pend = vol('Pend', 'pendente', 'agencia', 'embalado_em=NULL');

  // ── o bipe da ÁREA ──
  let r = await chamar('POST /api/carregar', {code:'PAgUm'}, ANA);
  ok('o bipe da área confere a caixa de agência', r.ok === true && r.conferida === true, JSON.stringify(r));
  let l = lote(a1);
  ok('...e ela FICA NA ÁREA: não vai para o carro (D1)',
     l.estagio === 'embalado' && l.conferido_por === 'Ana' && !!l.conferido_em && !l.no_carro_em && !l.carregado_em,
     JSON.stringify(l));
  r = await chamar('POST /api/carregar', {code:'PAgUm'}, ANA);
  ok('bipar de novo na área diz que já está conferida', r.ok === false && r.motivo === 'ja_conferida', JSON.stringify(r));
  for(const c of ['PAgDois','PAgTres','PAgFutura']) await chamar('POST /api/carregar', {code:c}, ANA);
  r = await chamar('POST /api/carregar', {code:'PColUm'}, ANA);
  ok('na coleta nada muda: conferir é levar para o canto', r.ok && r.coleta === true && lote(c1).estagio === 'carregado',
     JSON.stringify(r));
  await chamar('POST /api/carregar', {code:'PColDois'}, ANA);
  let d = await chamar('GET /api/carregamento');
  ok('o "No carro" não anda com o bipe da área', d.carregados === 0, 'carregados=' + d.carregados);
  ok('o card diz quantas estão prontas na área', d.carro && d.carro.prontas === 4, JSON.stringify(d.carro));

  // ── a viagem ──
  r = await chamar('POST /api/viagem/carro', {code:'PAgUm'}, BETO);
  ok('sem viagem aberta, o bipe no carro diz para abrir antes', r.ok === false && r.motivo === 'sem_viagem', JSON.stringify(r));
  r = await chamar('POST /api/viagem/abrir', {}, BETO);
  ok('abrir cria a viagem', r.ok && r.viagem && r.viagem.tipo === 'agencia' && r.sistema === 0, JSON.stringify(r));
  const v1 = r.viagem.id;
  r = await chamar('POST /api/viagem/abrir', {}, ANA);
  ok('abrir de novo devolve a MESMA viagem', r.ok && r.viagem.id === v1);

  r = await chamar('POST /api/viagem/carro', {code:'PAgSemConf'}, BETO);
  ok('caixa não conferida na área é RECUSADA no carro', r.ok === false && r.motivo === 'nao_conferida'
     && /área/.test(r.aviso||''), JSON.stringify(r));
  ok('...e não se mexe', lote(aSem).estagio === 'embalado' && !lote(aSem).no_carro_em);
  r = await chamar('POST /api/viagem/carro', {code:'PPend'}, BETO);
  ok('pendente é recusado no carro (não tem etiqueta)', r.ok === false && r.motivo === 'nao_embalado', JSON.stringify(r));
  r = await chamar('POST /api/viagem/carro', {code:'NADA'}, BETO);
  ok('código que não existe dá nao_encontrado', r.ok === false && r.motivo === 'nao_encontrado');

  r = await chamar('POST /api/viagem/carro', {code:'PAgUm'}, BETO);
  ok('caixa conferida entra no carro', r.ok && r.sistema === 1, JSON.stringify(r));
  l = lote(a1);
  ok('...e grava quem pôs, quando, e a viagem', l.estagio === 'carregado' && l.no_carro_por === 'Beto'
     && !!l.no_carro_em && !!l.carregado_em && l.saida_id === v1 && !l.saiu_em, JSON.stringify(l));
  r = await chamar('POST /api/viagem/carro', {code:'PAgUm'}, BETO);
  ok('bipar a mesma no carro não conta duas vezes', r.ok === false && r.motivo === 'ja_no_carro', JSON.stringify(r));
  for(const c of ['PAgDois','PAgFutura']) await chamar('POST /api/viagem/carro', {code:c}, BETO);

  // ── coleta indo pela agência ──
  r = await chamar('POST /api/viagem/carro', {code:'PColUm'}, BETO);
  ok('caixa de coleta do canto entra no carro, marcada como troca de porta', r.ok && r.troca_de_porta === true, JSON.stringify(r));
  d = await chamar('GET /api/carregamento');
  ok('...e sai do card "esperando o caminhão" enquanto está no carro',
     !d.coleta.aguardando.some(v => v.id === c1) && d.coleta.aguardando.some(v => v.id === c2),
     JSON.stringify(d.coleta.aguardando.map(v=>v.buyer)));
  r = await chamar('POST /api/saida/abrir', {}, ANA);
  ok('...e sai da conta do caminhão (ela está no carro)', !r.lista.some(v => v.id === c1) && r.lista.some(v => v.id === c2),
     JSON.stringify(r.lista.map(v=>v.buyer)));
  ok('a agência conferida na área é "pode ter ido no caminhão" (D2) — e a do carro não',
     r.candidatos.some(v => v.id === a3) && !r.candidatos.some(v => v.id === a1), JSON.stringify(r.candidatos.map(v=>v.buyer)));
  await chamar('POST /api/saida/cancelar', {}, ANA);

  // ── tirar do carro ──
  r = await chamar('POST /api/viagem/tirar', {id:c1}, BETO);
  ok('tirar a de coleta devolve ela ao canto', r.ok && lote(c1).estagio === 'carregado' && !lote(c1).saida_id
     && !lote(c1).no_carro_em && r.sistema === 3, JSON.stringify(r));
  r = await chamar('POST /api/viagem/tirar', {id:a2}, BETO);
  l = lote(a2);
  ok('tirar a de agência devolve ela à área, conferida', r.ok && l.estagio === 'embalado' && !l.carregado_em
     && !l.saida_id && !!l.conferido_em, JSON.stringify(l));
  await chamar('POST /api/viagem/carro', {code:'PColUm'}, BETO);
  r = await chamar('POST /api/viagem/cancelar', {}, BETO);
  ok('cancelar com caixa no carro é recusado', r.ok === false && r.motivo === 'carro_cheio', JSON.stringify(r));

  // ── fechar ──
  r = await chamar('POST /api/viagem/fechar', {atendente:3}, BETO);
  ok('sem foto não fecha', r.ok === false && r.motivo === 'sem_foto', JSON.stringify(r));
  r = await chamar('POST /api/viagem/fechar', {atendente:4, foto:FOTO}, BETO);
  ok('o atendente bipou 4, o carro tem 3: não fecha', r.ok === false && r.motivo === 'divergente'
     && r.sistema === 3 && r.atendente === 4 && r.lista.length === 3, JSON.stringify(r));
  ok('...e nada anda', !lote(a1).saiu_em && lote(a1).saida_id === v1);
  r = await chamar('POST /api/viagem/liberar', {atendente:4, foto:FOTO}, BETO);
  ok('liberar sem motivo é recusado', r.ok === false && r.motivo === 'sem_motivo', JSON.stringify(r));
  r = await chamar('POST /api/viagem/fechar', {atendente:3, foto:FOTO}, BETO);
  ok('bateu: fecha', r.ok && r.id === v1 && r.divergente === false && r.troca_de_porta === 1, JSON.stringify(r));
  const sd = db.prepare('SELECT * FROM saida WHERE id=?').get(v1);
  ok('a saída é da agência, com os dois números, quem fechou e a foto',
     sd.tipo === 'agencia' && sd.qtd_sistema === 3 && sd.qtd_externa === 3 && sd.fechado_por === 'Beto'
     && !!sd.foto && fs.existsSync(sd.foto), JSON.stringify(sd));
  l = lote(a1);
  ok('cada caixa grava a saída pela agência', l.saiu_por === 'agencia' && !!l.saiu_em && l.saida_id === v1, JSON.stringify(l));
  const lc = lote(c1);
  ok('a de coleta saiu pela agência, com a modalidade intacta e o retirado_em preenchido',
     lc.saiu_por === 'agencia' && lc.modalidade === 'coleta' && !!lc.retirado_em, JSON.stringify(lc));
  d = await chamar('GET /api/carregamento');
  ok('o "No carro" conta o que entrou no carro hoje — as duas de agência e a de coleta da troca de porta',
     d.carregados === 3, 'carregados=' + d.carregados);
  ok('a futura que foi no carro conta em "Peças adiantadas"', d.saiu_adiantado.hoje.agencia === 1, JSON.stringify(d.saiu_adiantado));
  ok('a tela recebe as viagens do dia, e nenhuma aberta',
     d.carro.viagens_hoje.length === 1 && d.carro.viagem_aberta === null, JSON.stringify(d.carro));
  ok('o canto da coleta não mostra mais a que foi pela agência', !d.coleta.aguardando.some(v => v.id === c1));

  // ── o caminhão DEPOIS da agência, e a segunda viagem ──
  r = await chamar('POST /api/saida/abrir', {}, ANA);
  await chamar('POST /api/saida/nada', {}, ANA);
  r = await chamar('POST /api/saida/fechar', {motorista:r.sistema, foto:FOTO}, ANA);
  ok('o caminhão fecha só com o que a agência deixou no canto', r.ok && r.sistema === 1, JSON.stringify(r));
  r = await chamar('POST /api/viagem/abrir', {}, ANA);
  const v2 = r.viagem.id;
  ok('a segunda viagem do dia começa vazia', v2 !== v1 && r.sistema === 0, JSON.stringify(r));
  r = await chamar('POST /api/viagem/carro', {code:'PAgUm'}, ANA);
  ok('caixa que já saiu não entra na segunda viagem', r.ok === false && r.motivo === 'duplicado', JSON.stringify(r));
  r = await chamar('POST /api/viagem/carro', {code:'PAgDois'}, ANA);
  ok('a que ficou na área entra na segunda', r.ok && r.sistema === 1, JSON.stringify(r));
  r = await chamar('POST /api/viagem/liberar', {atendente:0, foto:FOTO, motivo:'atendente não achou a caixa'}, ANA);
  ok('liberar com motivo fecha como divergente', r.ok && r.divergente === true, JSON.stringify(r));
  const sd2 = db.prepare('SELECT * FROM saida WHERE id=?').get(v2);
  ok('...com quem liberou e o motivo, e vai para a auditoria', sd2.divergente === 1 && sd2.liberado_por === 'Ana'
     && /achou/.test(sd2.motivo) && auditado.some(a => a[0] === 'viagem_liberada_divergente'), JSON.stringify(sd2));

  // ── viagem esquecida de um dia para o outro ──
  r = await chamar('POST /api/viagem/abrir', {}, ANA);
  const v3 = r.viagem.id;
  r = await chamar('POST /api/viagem/cancelar', {}, ANA);
  ok('cancelar a viagem vazia apaga ela', r.ok && !db.prepare('SELECT 1 FROM saida WHERE id=?').get(v3));
  r = await chamar('POST /api/viagem/abrir', {}, ANA);
  db.prepare("UPDATE saida SET aberta_em=datetime('now','localtime','-1 day') WHERE id=?").run(r.viagem.id);
  r = await chamar('GET /api/viagem/aberta');
  ok('viagem aberta desde ontem vem marcada', r.viagem && r.viagem.antiga === true, JSON.stringify(r.viagem));

  console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo certo') + ' — ' + casos + ' casos');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
