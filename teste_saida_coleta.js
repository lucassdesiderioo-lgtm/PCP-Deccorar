#!/usr/bin/env node
/* Testes da fase 3 da spec SAIDA-E-DUPLA-CONFERENCIA — a SAÍDA DO CAMINHÃO.
 *
 *   node teste_saida_coleta.js
 *
 * O "Fechar coleta" de 10/09/2026 comparava o canto INTEIRO com o motorista, e
 * um dia sem fechar estragava todos os seguintes: a equipe não aderiu, o canto
 * acumulou 399 caixas e o número nunca mais bateu. A saída nova é UMA POR
 * CAMINHÃO e só olha o que estava no canto e ainda não tinha saída:
 *
 *     saíram = (no canto, sem saída) − sobras + "foi no caminhão"
 *
 * O que estes casos travam:
 * - fechar exige o passo das sobras (bipar o que ficou, ou "não ficou nada");
 * - sem foto não fecha, e divergência não anda (nada é gravado nas caixas);
 * - dois caminhões no mesmo dia: o segundo não enxerga o que o primeiro levou,
 *   e a sobra do primeiro entra na conta do segundo;
 * - a troca de porta (caixa de agência que o motorista levou) grava
 *   `saiu_por='coleta'` e NÃO mexe na `modalidade`;
 * - liberar com divergência exige motivo, e grava quem e por quê;
 * - a rota antiga do "Fechar coleta" recusa, dizendo onde é agora.
 *
 * A permissão `saida.liberar` é conferida no teste_acesso.js — aqui a rota é
 * chamada direto, como o auth.js a chamaria depois de liberar.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-saida-col-'));
process.env.PCP_DIR = tmp;          // antes de qualquer require nosso (caminhos.js)

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
const chamar = (k, body, usuario, params) => new Promise(r => {
  if(!rotas[k]) return r({ __sem_rota:k });
  const res = { _s:200, json:o=>r(o), status(s){ res._s=s; return res; }, send:o=>r({ __send:o, status:res._s }),
                setHeader(){} };
  rotas[k]({ body:body||{}, params:params||{}, query:{}, headers:{}, usuario:usuario||null }, res);
});
const ANA = {id:1,nome:'Ana'}, BETO = {id:2,nome:'Beto'};
const FOTO = 'data:image/jpeg;base64,' + Buffer.alloc(3000, 7).toString('base64');

const q1 = s => db.prepare(s).get();
const hoje = q1("SELECT date('now','localtime') d").d;
const ontem = q1("SELECT date('now','localtime','-1 day') d").d;
const depois = q1("SELECT date('now','localtime','+5 day') d").d;
const lote = id => db.prepare('SELECT * FROM lote WHERE id=?').get(id);

/* Uma caixa de coleta no canto: impressa, bipada pro lugar reservado, esperando
   o caminhão. `quando` é a hora do bipe. */
const vol = (buyer, estagio, extra) => {
  const id = db.prepare(`INSERT INTO lote (codigo,buyer,nf,packId,codes,estagio,data,despachar_em,modalidade,
      embalado_em) VALUES ('BK140140BEGE',?,?,?,?,?,?,?,?,datetime('now','localtime'))`)
    .run(buyer, 'NF'+buyer, 'P'+buyer, JSON.stringify(['P'+buyer]), estagio, hoje, hoje, 'coleta').lastInsertRowid;
  if(extra) db.prepare('UPDATE lote SET '+extra+' WHERE id=?').run(id);
  return id;
};
const noCanto = (buyer, extra) => vol(buyer, 'carregado',
  "carregado_em=datetime('now','localtime'), conferido_em=datetime('now','localtime'), " +
  "conferido_por='Ana', impresso_por='Beto'" + (extra ? ', '+extra : ''));

(async () => {
  // ── o canto de hoje: quatro caixas ──
  const c1 = noCanto('Um'), c2 = noCanto('Dois'), c3 = noCanto('Tres'), c4 = noCanto('Quatro');
  const fut = noCanto('Futura', `despachar_em='${depois}'`);
  const mesma = noCanto('Mesma', "impresso_por='Ana'");               // Ana imprimiu e Ana conferiu
  /* Fora do canto: agência ainda na pilha (etiqueta impressa, sem bipe),
     agência no carro, coleta impressa e não bipada, e um pendente. */
  const agPilha = vol('AgPilha', 'embalado', "modalidade='agencia'");
  const agCarro = vol('AgCarro', 'carregado',
    "modalidade='agencia', carregado_em=datetime('now','localtime'), conferido_em=datetime('now','localtime'), conferido_por='Ana'");
  const colPilha = vol('ColPilha', 'embalado', null);
  const pend = vol('Pend', 'pendente', "embalado_em=NULL");

  // ── a rota antiga ──
  let r = await chamar('POST /api/coleta/fechar', {motorista:6, foto:FOTO}, ANA);
  ok('o "Fechar coleta" antigo recusa e diz onde é agora',
     r.ok === false && r.motivo === 'aposentado' && /Saída do caminhão/.test(r.aviso||''), JSON.stringify(r));
  ok('...e não mexe em caixa nenhuma', lote(c1).retirado_em === null && lote(c1).saida_id === null);

  // ── abrir ──
  r = await chamar('POST /api/saida/abrir', {}, ANA);
  ok('abrir cria a saída do caminhão', r.ok && r.saida && r.saida.id && r.saida.tipo === 'coleta', JSON.stringify(r));
  const s1 = r.saida.id;
  ok('a conta começa com as 6 caixas do canto', r.sistema === 6, JSON.stringify(r));
  r = await chamar('POST /api/saida/abrir', {}, BETO);
  ok('abrir de novo devolve a MESMA saída (uma aberta por vez)', r.ok && r.saida.id === s1);
  r = await chamar('GET /api/saida/aberta');
  ok('o tablet que recarrega acha a saída aberta', r.saida && r.saida.id === s1 && r.sistema === 6, JSON.stringify(r));

  // ── fechar sem o passo das sobras ──
  r = await chamar('POST /api/saida/fechar', {motorista:6, foto:FOTO}, ANA);
  ok('fechar sem bipar sobras nem "não ficou nada" é recusado', r.ok === false && r.motivo === 'sobras', JSON.stringify(r));

  // ── as sobras ──
  r = await chamar('POST /api/saida/sobra', {code:'PQuatro'}, ANA);
  ok('bipar uma caixa do canto a põe nas sobras', r.ok && r.sistema === 5 && r.sobras.length === 1, JSON.stringify(r));
  r = await chamar('POST /api/saida/sobra', {code:'PQuatro'}, ANA);
  ok('bipar a mesma sobra de novo não conta duas vezes', r.ok === false && r.motivo === 'ja_sobra', JSON.stringify(r));
  r = await chamar('POST /api/saida/sobra', {code:'PAgCarro'}, ANA);
  ok('caixa que não está na conta do caminhão (agência no carro) não vira sobra',
     r.ok === false && r.motivo === 'fora_da_conta' && !!r.aviso, JSON.stringify(r));
  r = await chamar('POST /api/saida/sobra', {code:'NAOEXISTE'}, ANA);
  ok('código que não existe dá nao_encontrado', r.ok === false && r.motivo === 'nao_encontrado');
  r = await chamar('POST /api/saida/nada', {}, ANA);
  ok('"não ficou nada" com sobra bipada é recusado', r.ok === false && r.motivo === 'tem_sobras', JSON.stringify(r));

  // ── sem foto, e divergência ──
  r = await chamar('POST /api/saida/fechar', {motorista:5}, ANA);
  ok('sem foto não fecha, nem batendo', r.ok === false && r.motivo === 'sem_foto', JSON.stringify(r));
  r = await chamar('POST /api/saida/fechar', {motorista:7, foto:FOTO}, ANA);
  ok('número diferente: não fecha e diz as duas contas',
     r.ok === false && r.motivo === 'divergente' && r.sistema === 5 && r.motorista === 7, JSON.stringify(r));
  ok('...e lista as caixas desta saída, com nome e NF',
     Array.isArray(r.lista) && r.lista.length === 5 && r.lista.every(v => v.buyer && v.nf), JSON.stringify(r.lista));
  /* Desde a fase 4 (D2) a agência que já está no CARRO não é candidata: o
     caminhão não leva o que está dentro do carro. */
  ok('...e oferece as impressas fora da conta, que podem ter ido no caminhão',
     Array.isArray(r.candidatos) && [agPilha, colPilha].every(i => r.candidatos.some(c => c.id === i))
     && !r.candidatos.some(c => c.id === pend) && !r.candidatos.some(c => c.id === agCarro), JSON.stringify(r.candidatos));
  ok('divergência não grava nada nas caixas', lote(c1).saida_id === null && lote(c1).retirado_em === null);
  ok('divergência vai para a auditoria', auditado.some(a => a[0] === 'saida_divergente'));

  // ── "foi no caminhão": a troca de porta ──
  r = await chamar('POST /api/saida/levou', {id:pend}, ANA);
  ok('pendente não pode ter ido no caminhão (não tem etiqueta)', r.ok === false, JSON.stringify(r));
  r = await chamar('POST /api/saida/levou', {id:agPilha}, ANA);
  ok('a caixa de agência que o motorista levou entra na conta', r.ok && r.sistema === 6, JSON.stringify(r));
  r = await chamar('POST /api/saida/levou', {id:agPilha}, ANA);
  ok('...uma vez só', r.ok === false && r.motivo === 'ja_levou', JSON.stringify(r));

  // ── liberar sem motivo, e fechar batendo ──
  r = await chamar('POST /api/saida/liberar', {motorista:7, foto:FOTO}, ANA);
  ok('liberar sem motivo é recusado', r.ok === false && r.motivo === 'sem_motivo', JSON.stringify(r));
  r = await chamar('POST /api/saida/fechar', {motorista:6, foto:FOTO}, BETO);
  ok('bateu: fecha', r.ok && r.id === s1 && r.sistema === 6 && r.divergente === false, JSON.stringify(r));
  ok('...e diz a troca de porta', r.troca_de_porta === 1, JSON.stringify(r));
  const sd = db.prepare('SELECT * FROM saida WHERE id=?').get(s1);
  ok('a saída grava quem fechou, os dois números e a hora',
     sd.fechada_em && sd.fechado_por === 'Beto' && sd.qtd_sistema === 6 && sd.qtd_externa === 6 && sd.divergente === 0,
     JSON.stringify(sd));
  ok('a foto vai para o disco com o nome da saída', !!sd.foto && fs.existsSync(sd.foto) && /saida-/.test(sd.foto));
  ok('a saída guarda as sobras e as caixas que saíram',
     JSON.parse(sd.sobras).includes(c4) && JSON.parse(sd.ids).length === 6 && JSON.parse(sd.ids).includes(agPilha));
  ok('"sem segunda pessoa" conta a caixa que Ana imprimiu e conferiu', sd.sem_segunda_pessoa === 1, sd.sem_segunda_pessoa);
  const l1 = lote(c1);
  ok('cada caixa que saiu grava a saída, a hora e a porta',
     l1.saida_id === s1 && !!l1.saiu_em && l1.saiu_por === 'coleta' && !!l1.retirado_em, JSON.stringify(l1));
  ok('a sobra ficou no canto, sem saída', lote(c4).saida_id === null && lote(c4).retirado_em === null);
  const ag = lote(agPilha);
  ok('a caixa de agência saiu pela coleta, e a modalidade NÃO mudou (decisão 6)',
     ag.saida_id === s1 && ag.saiu_por === 'coleta' && ag.modalidade === 'agencia', JSON.stringify(ag));
  ok('...e saiu da pilha: virou carregada e conferida por quem fechou',
     ag.estagio === 'carregado' && ag.conferido_por === 'Beto' && !!ag.carregado_em, JSON.stringify(ag));
  ok('as caixas de fora que ninguém marcou não se mexem', lote(agCarro).saida_id === null && lote(colPilha).estagio === 'embalado');
  r = await chamar('GET /api/carregamento');
  ok('a adiantada que o caminhão levou conta em "Peças adiantadas"', r.saiu_adiantado.hoje.coleta >= 1, JSON.stringify(r.saiu_adiantado));
  ok('a caixa de agência que foi no caminhão NÃO conta no "No carro" (só a que está no carro conta)',
     r.carregados === 1, 'carregados=' + r.carregados);
  ok('o canto agora só tem a sobra', r.coleta.aguardando.length === 1 && r.coleta.aguardando[0].id === c4);
  ok('a tela recebe as saídas do dia', Array.isArray(r.coleta.saidas_hoje) && r.coleta.saidas_hoje.length === 1
     && r.coleta.saida_aberta === null, JSON.stringify(r.coleta.saidas_hoje));
  r = await chamar('GET /api/saida/foto/:id', {}, ANA, {id:String(s1)});
  ok('a foto volta pela rota dela', !!(r && r.__send), JSON.stringify(r).slice(0,80));

  // ── o SEGUNDO caminhão do dia ──
  const c5 = noCanto('Cinco'), c6 = noCanto('Seis');
  r = await chamar('POST /api/saida/abrir', {}, ANA);
  const s2 = r.saida.id;
  ok('o segundo caminhão abre uma saída nova', s2 !== s1);
  ok('...e só enxerga o que não saiu: a sobra do primeiro e as duas novas', r.sistema === 3, JSON.stringify(r));
  r = await chamar('POST /api/saida/nada', {}, ANA);
  ok('"não ficou nada" libera o fechamento', r.ok, JSON.stringify(r));
  r = await chamar('POST /api/saida/fechar', {motorista:2, foto:FOTO}, ANA);
  ok('o motorista bipou 2 de 3: não fecha', r.ok === false && r.motivo === 'divergente');
  r = await chamar('POST /api/saida/liberar', {motorista:2, foto:FOTO, motivo:'motorista não achou a caixa do Quatro'}, BETO);
  ok('liberar com motivo fecha a saída como divergente', r.ok && r.divergente === true, JSON.stringify(r));
  const sd2 = db.prepare('SELECT * FROM saida WHERE id=?').get(s2);
  ok('...com quem liberou e por quê', sd2.divergente === 1 && sd2.liberado_por === 'Beto'
     && /Quatro/.test(sd2.motivo) && sd2.qtd_sistema === 3 && sd2.qtd_externa === 2, JSON.stringify(sd2));
  ok('...e vai para a auditoria', auditado.some(a => a[0] === 'saida_liberada_divergente'));
  ok('as três caixas saíram nesta saída', [c4,c5,c6].every(i => lote(i).saida_id === s2));

  // ── cancelar ──
  const c7 = noCanto('Sete');
  r = await chamar('POST /api/saida/abrir', {}, ANA);
  const s3 = r.saida.id;
  await chamar('POST /api/saida/sobra', {code:'PSete'}, ANA);
  r = await chamar('POST /api/saida/cancelar', {}, ANA);
  ok('cancelar desfaz a saída aberta', r.ok && !db.prepare('SELECT 1 FROM saida WHERE id=?').get(s3));
  ok('...sem tocar na caixa', lote(c7).saida_id === null && lote(c7).retirado_em === null);
  r = await chamar('POST /api/saida/sobra', {code:'PSete'}, ANA);
  ok('sem saída aberta, o bipe de sobra diz para abrir antes', r.ok === false && r.motivo === 'sem_saida', JSON.stringify(r));

  // ── a caixa esquecida de ontem ──
  const velha = noCanto('Velha', `carregado_em='${ontem} 09:00:00'`);
  r = await chamar('POST /api/saida/abrir', {}, ANA);
  ok('caixa bipada no canto ontem e sem saída entra na conta, marcada com o dia',
     r.sistema === 2 && r.lista.some(v => v.id === velha && v.antiga === true) && r.lista.some(v => v.id === c7 && !v.antiga),
     JSON.stringify(r.lista));
  await chamar('POST /api/saida/cancelar', {}, ANA);

  console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo certo') + ' — ' + casos + ' casos');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
