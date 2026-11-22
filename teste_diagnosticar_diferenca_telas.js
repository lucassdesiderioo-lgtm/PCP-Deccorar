#!/usr/bin/env node
/* teste_diagnosticar_diferenca_telas.js — confere o diagnosticar_diferenca_telas.js
   num banco temporário, com o schema do `lote` de verdade e caixas montadas à
   mão: a venda repetida, a caixa de várias, a impressa hoje que já saiu, a
   adiantada, a impressa ontem, a que sobrou da limpeza, o canto antigo, o
   bloqueado e a cancelada. O leitor do PDF é trocado por um falso. */
'use strict';
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-dif-telas-'));
process.env.PCP_DIR = tmp;
process.env.PCP_APP = __dirname;
fs.mkdirSync(path.join(tmp, 'lotes'), { recursive:true });
const arq = path.join(tmp, 't.db');
const w = new Database(arq);
const criar = fs.readFileSync(path.join(__dirname, 'exp_route.js'), 'utf8')
  .match(/CREATE TABLE IF NOT EXISTS lote \([^"]*\);/)[0];
w.exec(criar);
w.exec(`CREATE TABLE lote_item (id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER, codigo TEXT, qtd INTEGER DEFAULT 1);
  CREATE TABLE saida (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, fechada_em TEXT, qtd_sistema INTEGER, motivo TEXT);
  CREATE TABLE venda_sem_etiqueta (id INTEGER PRIMARY KEY, venda TEXT, packId TEXT, sku TEXT, qtd INTEGER, visto_em TEXT, resolvida_em TEXT, teste INTEGER DEFAULT 0);
  CREATE TABLE pdf_conta_aberta (id INTEGER PRIMARY KEY, pdf TEXT, nfs TEXT, etiquetas INTEGER, folha INTEGER, sistema INTEGER, resto INTEGER, visto_em TEXT, resolvida_em TEXT, teste INTEGER DEFAULT 0);`);
const d = o => w.prepare("SELECT date('now','localtime',?) d").get(o).d;
const hoje = d('+0 day'), ontem = d('-1 day'), antigo = d('-10 day'), fut = d('+5 day'), corteEsperado = d('-2 day');
const ins = (o) => {
  const c = Object.assign({ codigo:'BK1', buyer:'Cliente', nf:'1', estagio:'pendente', data:hoje, despachar_em:hoje }, o);
  const ks = Object.keys(c);
  return w.prepare(`INSERT INTO lote (${ks.join(',')}) VALUES (${ks.map(()=>'?').join(',')})`).run(...ks.map(k=>c[k])).lastInsertRowid;
};
const agora = hoje + ' 09:00:00';
// 1. a MESMA venda em duas caixas: impressa (entrou ontem) e pendente (entrou hoje)
const r1 = ins({ venda:'V1', packId:'P1', data:ontem, estagio:'embalado', embalado_em:agora, nf:'100', buyer:'Ana Repetida' });
const r2 = ins({ venda:'V1', packId:'P1', data:hoje, nf:'100', buyer:'Ana Repetida' });
// 2. caixa de várias, pendente, vence hoje: 1 caixa, 3 persianas
const v3 = ins({ venda:'V3', nf:'300', buyer:'Bruno Varias' });
w.prepare("INSERT INTO lote_item (lote_id,codigo,qtd) VALUES (?,?,2),(?,?,1)").run(v3,'BK1',v3,'BK2');
// 3. impressa hoje, coleta, o caminhão já levou
ins({ venda:'V4', nf:'400', estagio:'carregado', modalidade:'coleta', embalado_em:agora, conferido_em:agora,
      carregado_em:agora, retirado_em:hoje+' 11:00:00', saiu_em:hoje+' 11:00:00', saida_id:1 });
// 4. impressa hoje, adiantada
ins({ venda:'V5', nf:'500', estagio:'embalado', embalado_em:agora, despachar_em:fut });
// 5. impressa ontem, agência, sem conferir
const r6 = ins({ venda:'V6', nf:'600', estagio:'embalado', embalado_em:ontem+' 10:00:00', data:ontem });
// 6. impressa antes do corte da limpeza e que sobrou
ins({ venda:'V7', nf:'700', estagio:'embalado', embalado_em:antigo+' 10:00:00', data:antigo, despachar_em:antigo });
w.prepare("INSERT INTO saida (tipo,fechada_em,qtd_sistema,motivo) VALUES ('coleta',?,1,'x'),('passivo',?,188,?)")
  .run(hoje+' 11:00:00', ontem+' 17:10:00', 'passivo: caixas com etiqueta impressa e nunca conferidas, ate '+d('-2 day')+'; ok');
// 7. canto antigo: coleta conferida ontem, o caminhão não levou
ins({ venda:'V8', nf:'800', estagio:'carregado', modalidade:'coleta', embalado_em:ontem+' 08:00:00', conferido_em:ontem+' 09:00:00',
      carregado_em:ontem+' 09:00:00', data:ontem, despachar_em:ontem });
// 8. bloqueado, vence hoje
ins({ venda:'V9', nf:'900', estagio:'bloqueado', bloqueio:'sku_nao_cadastrado' });
// 9. cancelada hoje
ins({ venda:'V10', nf:'1000', estagio:'cancelado', cancelada_em:agora, cancelada_origem:'relatorio', cancelada_estagio:'pendente' });
// 10. mesmo pack, vendas diferentes
ins({ venda:'V11', packId:'P2', nf:'1100', buyer:'Carla' }); ins({ venda:'V12', packId:'P2', nf:'1101', buyer:'Carla' });
// 11. agência conferida hoje, na área
ins({ venda:'V13', nf:'1300', estagio:'embalado', embalado_em:agora, conferido_em:hoje+' 09:30:00' });
// 12. um PDF de hoje: V2 entrou nele, V1 veio repetida, V99 não está no banco
const ts = Date.now();
const pdf = path.join(tmp, 'lotes', ts + '.pdf'); fs.writeFileSync(pdf, 'x');
ins({ venda:'V2', nf:'200', srcfile:pdf, criado_em: w.prepare("SELECT datetime(?/1000,'unixepoch','localtime') d").get(ts+1000).d });
w.close();

/* o leitor do PDF falso, no lugar do parse.js */
require.cache[require.resolve('./parse')] = { id:'parse', filename:require.resolve('./parse'), loaded:true,
  exports:{ parsePdf: async () => Object.assign([{ venda:'V2', labelPage:1 }, { venda:'V1', packId:'P1', labelPage:2 },
    { venda:'V99', labelPage:3 }, { venda:'V77', packId:'P1', labelPage:4 }], { conta:null }) } };

let ok = 0, falhou = 0;
const caso = (nome, cond) => { if(cond) ok++; else { falhou++; console.log('  ✗ ' + nome); } };

(async () => {
  const db = new Database(arq, { readonly:true });
  const D = require('./diagnosticar_diferenca_telas');
  const r = D.diagnosticar(db, { dias:[ontem, hoje] });

  // B. repetidos
  const v1 = r.repetidos.find(g => g.vols.some(v => v.id === r1) && g.vols.some(v => v.id === r2));
  caso('1. a mesma venda em duas caixas é achada', !!v1);
  caso('2. ...com certeza, tocando os dias e as duas na fábrica', v1 && v1.certeza && v1.tocaDias && v1.ativos === 2);
  caso('3. ...e conta uma vez só (venda e pack iguais viram um grupo)', r.repetidos.filter(g => g.vols.some(v => v.id === r1)).length === 1);
  const p2 = r.repetidos.find(g => g.chaves.some(c => c === 'pack P2'));
  caso('4. mesmo pack com vendas diferentes fica como dúvida', p2 && !p2.certeza);

  // D. a 201
  caso('5. pra imprimir: a fila do dia (r2, V3, V2, V11, V12)', r.t201.pra_imprimir === 5);
  caso('6. ...em persianas, a caixa de várias conta 3', r.t201.pra_imprimir_pecas === 7);
  caso('7. impressas hoje conta caixa por embalado_em (r1, V4, V5, V13)', r.t201.impressas_hoje === 4);
  // a 202
  caso('8. esperando conferência: r1 e a impressa ontem (a adiantada não)', r.t202.esperando === 2 + 1);
  caso('9. conferidas esperando sair: V13 na área e o canto de ontem', r.t202.conferidas === 2);
  caso('10. só despacham depois: a adiantada', r.t202.so_despacham_depois === 1);
  // a ponte
  const motivos = r.ponte.fora202.map(v => v.motivo).join(' | ');
  caso('11. fora da 202: a que o caminhão levou hoje', /saiu hoje/.test(motivos));
  caso('12. fora da 202: a adiantada', /adiantada/.test(motivos));
  caso('13. na 202 e não impressa hoje: a de ontem, a antiga e o canto', r.ponte.so202.length === 3);
  caso('14. a conta da ponte fecha', r.ponte.nas_duas + r.ponte.fora202.length === r.t201.impressas_hoje
    && r.ponte.nas_duas + r.ponte.so202.length === r.t202.esperando + r.t202.conferidas);

  // C. o despacho de hoje em persianas, sem a cancelada
  caso('15. vence hoje sem cancelada, em persianas', r.vence_hoje.pecas === r.vence_hoje.caixas + 2 && r.vence_hoje.canceladas.caixas === 1);

  // E e F
  caso('16. bloqueado aparece fora das telas', r.fora.bloqueados.length === 1);
  caso('17. cancelada dos dias aparece', r.fora.canceladas.length === 1);
  caso('18. o corte da limpeza é lido do motivo', r.corte_limpeza === corteEsperado);
  const sobrou = r.antigas.find(v => v.despachar_em === antigo);
  caso('19. a que sobrou da limpeza é marcada', sobrou && /sobrou da limpeza/.test(sobrou.porque));
  caso('20. a impressa ontem é depois do corte', /depois do corte/.test((r.antigas.find(v => v.id === r6)||{}).porque || ''));
  caso('21. o canto antigo aparece', r.antigas.some(v => /canto da coleta desde/.test(v.porque)));

  // A. o PDF
  const ups = await D.uploads(db, [ontem, hoje]);
  const u = ups.find(x => x.arq === ts + '.pdf');
  caso('22. o PDF dos dias é achado', !!u);
  caso('23. V2 virou caixa nova', u && u.novas.length === 1 && u.novas[0].venda === 'V2');
  caso('24. V1 e V77 foram recusadas como repetidas', u && u.repetidas.length === 2);
  caso('25. V77: recusada pelo pack com outra venda é alertada', u && u.repetidas.some(i => i.venda === 'V77' && /NÃO entrou/.test(i.alerta||'')));
  caso('26. V99 não está no banco', u && u.nao_achei.length === 1);

  // nada foi gravado
  const antes = fs.statSync(arq).size;
  db.close();
  caso('27. o banco não foi mexido (só leitura)', fs.statSync(arq).size === antes);

  console.log((falhou ? '✗ ' : '✓ ') + ok + ' de ' + (ok + falhou) + ' casos');
  if(!process.env.MANTER) fs.rmSync(tmp, { recursive:true, force:true }); else console.log(tmp);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
