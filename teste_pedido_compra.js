#!/usr/bin/env node
/* FASE 2 da spec COMPRAS-E-RECEBIMENTO — fornecedor e pedido (R-CMP-11 a 21).
 *
 *   node teste_pedido_compra.js
 *
 * ⚠️ ESCRITO ANTES DO CODIGO (risco vermelho) e conferido reintroduzindo cada
 * defeito. Trava: o caminho do status (rascunho -> aguardando_aprovacao ->
 * comprado -> parcial -> recebido, cancelado antes de recebido); o `enviado` de
 * antes renomeado para `comprado`; "comprado" exige canal, numero e data; a
 * alcada (abaixo, acima, sem alcada, so o aprovador ou o Admin Geral, com
 * motivo); a compra por kg com a quantidade declarada; as parcelas e o pago
 * derivado; os anexos fora de `lotes/`; a compra rapida passando pela alcada;
 * os dados de pagamento do fornecedor so com `pedido.pagar`.
 */
const fs = require('fs'), path = require('path'), os = require('os');

/* O banco "de antes": um pedido gravado como `enviado` — o status de hoje, que
   a migracao renomeia para `comprado` uma vez so. */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-ped-'));
{
  process.env.PCP_DIR = dir;
  const Database = require('better-sqlite3');
  const pre = new Database(path.join(dir, 'dados.db'));
  pre.exec(`CREATE TABLE pedido_compra (id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT UNIQUE, fornecedor_id INTEGER,
    status TEXT DEFAULT 'rascunho', valor_previsto REAL, valor_pago REAL, frete REAL DEFAULT 0, previsao TEXT, observacao TEXT,
    criado_por TEXT, criado_em TEXT DEFAULT (datetime('now','localtime')), enviado_em TEXT, enviado_por TEXT, fechado_em TEXT,
    motivo_fecho TEXT, pago_em TEXT, pago_por TEXT, data TEXT, teste INTEGER DEFAULT 0, criado_por_id INTEGER, pago_por_id INTEGER);
    INSERT INTO pedido_compra (numero,status,valor_previsto,enviado_em) VALUES ('PC-000001','enviado',100,'2026-10-01 10:00:00');`);
  pre.close();
}
const { bancada, MODULOS } = require('./util_teste_compras');
const B = bancada({ modulos: MODULOS.concat(['material_route', 'compra_route']), reusar: dir });
const { db, get, post, del, ok, fim, secao } = B;

const AG    = { id:1, nome:'Lucas', admin_geral:true, permissoes:['alcada.definir'] };
const ANA   = { id:2, nome:'Ana', permissoes:['pedido.criar','compras.ver'] };
const BETO  = { id:3, nome:'Beto', permissoes:['pedido.criar','pedido.aprovar','compras.ver'] };
const CAIO  = { id:4, nome:'Caio', permissoes:['pedido.criar','pedido.aprovar','compras.ver'] };
const FIN   = { id:5, nome:'Fina', permissoes:['pedido.pagar','compras.ver'] };
/* `compras.valores` (R-VAL, spec ARRUMAR-O-LUGAR, 11/11/2026): o backfill a deu a
   quem tinha compras.ver — esta é a pessoa de depois do deploy. O orçamento do
   pedido (que tem preço) sem a caixinha está no teste_valor.js. */
const LEIT  = { id:6, nome:'Leo', permissoes:['compras.ver','compras.valores'] };

(async () => {
  db.exec('CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, pin_hash TEXT, salt TEXT, areas TEXT, ativo INTEGER DEFAULT 1)');
  for(const p of [AG, ANA, BETO, CAIO, FIN, LEIT])
    db.prepare('INSERT OR IGNORE INTO usuarios (id, nome, pin_hash, salt, areas, ativo) VALUES (?,?,?,?,?,1)').run(p.id, p.nome, 'x', 'y', '');

  secao('a migracao do status enviado -> comprado');
  const velho = db.prepare("SELECT * FROM pedido_compra WHERE numero='PC-000001'").get();
  ok('o pedido gravado como "enviado" agora e "comprado"', velho.status === 'comprado', () => velho.status);
  ok('e a data da compra veio do enviado_em', velho.comprado_em === '2026-10-01 10:00:00', () => velho.comprado_em);
  ok('nenhum pedido ficou "enviado"', db.prepare("SELECT COUNT(*) n FROM pedido_compra WHERE status='enviado'").get().n === 0);
  ok('a migracao roda uma vez so (marca em config)', !!db.prepare("SELECT 1 FROM config WHERE chave='cmp_status_comprado_1'").get());

  /* Cadastro de apoio: um fornecedor, um material e uma oferta. */
  const forn = (await post('/api/fornecedores', { nome:'Metal Sul', tipo:'industria', pix:'12.345.678/0001-99', banco:'Itaú', agencia:'0001', conta:'12345-6' }, AG)).corpo.id;
  const comp = (await post('/api/componentes', { nome:'Tubo 38', unidade:'un', modo_saldo:'quantidade' }, AG)).corpo.id;
  const of = (await post('/api/ofertas', { fornecedor_id:forn, componente_id:comp, embalagem:'barra', fator:1, preco:10 }, AG)).corpo;
  const ofId = of.id;

  secao('o fornecedor');
  let r = await post('/api/fornecedores', { nome:'X', tipo:'qualquer' }, AG);
  ok('tipo fora da lista e recusado', r.status === 400 && /tipo/i.test(r.corpo.erro), () => JSON.stringify(r.corpo));
  let fl = (await get('/api/fornecedores', LEIT)).corpo.find(f => f.id === forn);
  ok('quem so ve compras recebe o tipo', fl.tipo === 'industria');
  ok('e NAO recebe Pix, banco, agencia nem conta (a poda e no JSON)', !('pix' in fl) && !('banco' in fl) && !('agencia' in fl) && !('conta' in fl), () => JSON.stringify(fl));
  fl = (await get('/api/fornecedores', FIN)).corpo.find(f => f.id === forn);
  ok('quem tem pedido.pagar recebe os dados de pagamento', fl.pix === '12.345.678/0001-99' && fl.conta === '12345-6');
  r = await post('/api/fornecedores', { id:forn, telefone:'5199' }, AG);
  ok('editar o telefone NAO apaga o Pix (#33: ausente preserva)', db.prepare('SELECT pix FROM fornecedor WHERE id=?').get(forn).pix === '12.345.678/0001-99');

  secao('o pedido e a compra por kg com a quantidade declarada (R-CMP-18)');
  r = await post('/api/pedidos', { itens:[{ oferta_id:ofId, necessidade:600, unidade_compra:'kg', qtd_compra:400, preco_unid_compra:12.5, qtd_declarada:600 }] }, ANA);
  ok('cria o pedido em rascunho', r.status === 200 && r.corpo.pedidos.length === 1, () => JSON.stringify(r));
  const p1 = r.corpo.pedidos[0].id;
  const it = db.prepare('SELECT * FROM pedido_item WHERE pedido_id=?').get(p1);
  ok('o item guarda a unidade de compra, a quantidade e o preco NESSA unidade', it.unidade_compra === 'kg' && it.qtd_compra === 400 && it.preco_unid_compra === 12.5, () => JSON.stringify(it));
  ok('e a quantidade declarada na unidade da casa', it.qtd_declarada === 600);
  ok('o valor do pedido e 400 kg × R$ 12,50', Math.abs(db.prepare('SELECT valor_previsto v FROM pedido_compra WHERE id=?').get(p1).v - 5000) < 0.001,
     () => db.prepare('SELECT valor_previsto v FROM pedido_compra WHERE id=?').get(p1).v);
  ok('o que se espera receber (a caminho) e o declarado', it.qtd_consumo === 600);
  r = await post('/api/pedidos', { itens:[{ oferta_id:ofId, necessidade:10, unidade_compra:'kg', qtd_compra:-1, preco_unid_compra:1 }] }, ANA);
  ok('quantidade de compra impossivel e recusada', r.status === 400);

  secao('comprado exige canal, numero do pedido no fornecedor e data (R-CMP-16)');
  r = await post('/api/pedidos/' + p1 + '/comprar', { canal:'direto', comprado_em:'2026-11-07' }, ANA);
  ok('sem o numero externo e recusado, dizendo o que falta', r.status === 400 && /número/i.test(r.corpo.erro), () => JSON.stringify(r.corpo));
  r = await post('/api/pedidos/' + p1 + '/comprar', { canal:'pombo', numero_externo:'1', comprado_em:'2026-11-07' }, ANA);
  ok('canal fora da lista e recusado', r.status === 400 && /canal/i.test(r.corpo.erro));
  r = await post('/api/pedidos/' + p1 + '/comprar', { canal:'direto', numero_externo:'OC-77', comprado_em:'07/11/2026x' }, ANA);
  ok('data impossivel e recusada', r.status === 400 && /data/i.test(r.corpo.erro));
  ok('nada mudou', db.prepare('SELECT status FROM pedido_compra WHERE id=?').get(p1).status === 'rascunho');

  secao('a alcada (R-CMP-17)');
  r = await post('/api/compras/alcadas', { usuario_id:ANA.id, limite:1000, aprovador_id:BETO.id }, BETO);
  ok('so o Admin Geral define alcada (alcada.definir e intransferivel)', r.status === 403, () => JSON.stringify(r));
  r = await post('/api/compras/alcadas', { usuario_id:ANA.id, limite:1000, aprovador_id:BETO.id }, AG);
  ok('o Admin Geral define: Ana ate R$ 1.000, aprovador Beto', r.status === 200, () => JSON.stringify(r));
  r = await post('/api/compras/alcadas', { usuario_id:ANA.id, limite:-5, aprovador_id:BETO.id }, AG);
  ok('limite impossivel e recusado', r.status === 400);
  r = await post('/api/pedidos/' + p1 + '/comprar', { canal:'direto', numero_externo:'OC-77', comprado_em:'2026-11-07' }, ANA);
  ok('acima do limite: vai para aguardando aprovacao', r.status === 200 && db.prepare('SELECT status FROM pedido_compra WHERE id=?').get(p1).status === 'aguardando_aprovacao', () => JSON.stringify(r));
  ok('e nao aparece na fila do Recebimento', !(await get('/api/recebimento/aguardando', AG)).corpo.some(p => p.id === p1));
  r = await post('/api/pedidos/' + p1 + '/aprovar', { motivo:'ok' }, CAIO);
  ok('quem nao e o aprovador nao aprova', r.status === 403, () => JSON.stringify(r));
  r = await post('/api/pedidos/' + p1 + '/aprovar', { motivo:'' }, BETO);
  ok('o aprovador sem motivo e recusado', r.status === 400);
  r = await post('/api/pedidos/' + p1 + '/aprovar', { motivo:'preco bom, estoque baixo' }, BETO);
  const pa = db.prepare('SELECT * FROM pedido_compra WHERE id=?').get(p1);
  ok('o aprovador com motivo passa para comprado', r.status === 200 && pa.status === 'comprado', () => JSON.stringify(r));
  ok('e fica gravado quem, quando e por que', pa.aprovado_por_id === BETO.id && pa.aprovado_por === 'Beto' && pa.aprovado_em && pa.motivo_aprovacao === 'preco bom, estoque baixo' && pa.aprovacao === 'aprovado');
  ok('e a compra guarda canal, numero, data e quem comprou', pa.canal === 'direto' && pa.numero_externo === 'OC-77' && pa.comprado_em === '2026-11-07' && pa.comprado_por_id === ANA.id);
  ok('o comprado aparece na fila do Recebimento', (await get('/api/recebimento/aguardando', AG)).corpo.some(p => p.id === p1));

  const p2 = (await post('/api/pedidos', { itens:[{ oferta_id:ofId, necessidade:50 }] }, ANA)).corpo.pedidos[0].id;
  r = await post('/api/pedidos/' + p2 + '/comprar', { canal:'direto', numero_externo:'OC-78', comprado_em:'2026-11-07' }, ANA);
  ok('abaixo do limite: comprado direto, "nao precisa" de aprovacao', db.prepare('SELECT status, aprovacao FROM pedido_compra WHERE id=?').get(p2).status === 'comprado'
     && db.prepare('SELECT aprovacao FROM pedido_compra WHERE id=?').get(p2).aprovacao === 'nao_precisa');
  const p3 = (await post('/api/pedidos', { itens:[{ oferta_id:ofId, necessidade:5000 }] }, CAIO)).corpo.pedidos[0].id;
  r = await post('/api/pedidos/' + p3 + '/comprar', { canal:'direto', numero_externo:'OC-79', comprado_em:'2026-11-07' }, CAIO);
  ok('quem nao tem alcada cadastrada nao tem limite (R$ 50.000 passa)', db.prepare('SELECT status FROM pedido_compra WHERE id=?').get(p3).status === 'comprado');
  const p4 = (await post('/api/pedidos', { itens:[{ oferta_id:ofId, necessidade:500 }] }, ANA)).corpo.pedidos[0].id;
  await post('/api/pedidos/' + p4 + '/comprar', { canal:'direto', numero_externo:'OC-80', comprado_em:'2026-11-07' }, ANA);
  r = await post('/api/pedidos/' + p4 + '/aprovar', { motivo:'urgente' }, AG);
  ok('o Admin Geral aprova qualquer um', r.status === 200 && db.prepare('SELECT status FROM pedido_compra WHERE id=?').get(p4).status === 'comprado');
  r = await post('/api/pedidos/' + p4 + '/aprovar', { motivo:'de novo' }, AG);
  ok('aprovar o que nao esta aguardando e recusado (409)', r.status === 409);

  secao('o caminho do status');
  r = await post('/api/pedidos/' + p2 + '/comprar', { canal:'direto', numero_externo:'X', comprado_em:'2026-11-07' }, ANA);
  ok('comprar de novo o que ja e comprado e recusado', r.status === 409 || r.status === 400);
  r = await post('/api/pedidos/' + p2 + '/cancelar', { motivo:'fornecedor sem estoque' }, ANA);
  ok('comprado ainda se cancela (antes de recebido)', r.status === 200 && db.prepare('SELECT status FROM pedido_compra WHERE id=?').get(p2).status === 'cancelado');
  const pr = (await get('/api/pedidos?abertos=1', AG)).corpo;
  ok('a lista de abertos traz comprado e aguardando, e nao o cancelado', pr.some(p => p.id === p1) && !pr.some(p => p.id === p2));
  r = await post('/api/pedidos/' + p1 + '/enviar', { via:'whatsapp' }, ANA);
  ok('o "enviar" de antes nao existe mais como status: diz para usar "comprado"', r.status === 400 && /comprado/i.test(r.corpo.erro), () => JSON.stringify(r));

  secao('as parcelas (R-CMP-19)');
  r = await post('/api/pedidos/' + p1 + '/parcelas', { parcelas:[{ forma:'boleto', valor:2500, vencimento:'2026-12-07' }, { forma:'boleto', valor:2500, vencimento:'2027-01-07' }] }, ANA);
  ok('registra duas parcelas', r.status === 200, () => JSON.stringify(r));
  let pc = db.prepare('SELECT * FROM pagamento_parcela WHERE pedido_id=? ORDER BY numero').all(p1);
  ok('em centavos, numeradas, no formato do sm_boleto', pc.length === 2 && pc[0].valor_centavos === 250000 && pc[0].numero === 1 && pc[1].numero === 2 && pc[0].vencimento === '2026-12-07');
  r = await post('/api/pedidos/' + p1 + '/parcelas', { parcelas:[{ forma:'cheque', valor:1, vencimento:'2026-12-07' }] }, ANA);
  ok('forma fora da lista e recusada', r.status === 400);
  r = await post('/api/pedidos/' + p1 + '/parcelas', { parcelas:[{ forma:'pix', valor:0, vencimento:'2026-12-07' }] }, ANA);
  ok('parcela de valor zero e recusada', r.status === 400);
  let ped = (await get('/api/pedidos/' + p1, LEIT)).corpo;
  ok('quem so ve compras (sem custo.ver nem nota.lancar) NAO recebe as parcelas', !('parcelas' in ped), () => Object.keys(ped).join(','));
  ped = (await get('/api/pedidos/' + p1, FIN)).corpo;
  ok('quem paga recebe as parcelas', Array.isArray(ped.parcelas) && ped.parcelas.length === 2);
  r = await post('/api/parcelas/' + pc[0].id + '/pagar', {}, FIN);
  ok('paga a primeira, gravando quem e quando', r.status === 200 && !!db.prepare('SELECT pago_em FROM pagamento_parcela WHERE id=?').get(pc[0].id).pago_em
     && db.prepare('SELECT pago_por_id FROM pagamento_parcela WHERE id=?').get(pc[0].id).pago_por_id === FIN.id);
  ok('com uma em aberto, o pedido NAO esta pago', db.prepare('SELECT pago_em FROM pedido_compra WHERE id=?').get(p1).pago_em == null);
  r = await post('/api/parcelas/' + pc[0].id + '/pagar', {}, FIN);
  ok('pagar de novo e recusado (409)', r.status === 409);
  r = await del('/api/parcelas/' + pc[0].id, ANA);
  ok('parcela paga nao se apaga', r.status === 409);
  await post('/api/parcelas/' + pc[1].id + '/pagar', {}, FIN);
  ok('todas pagas: o pedido fica pago (pago_em derivado)', !!db.prepare('SELECT pago_em FROM pedido_compra WHERE id=?').get(p1).pago_em);
  r = await post('/api/pedidos/' + p3 + '/pagar', {}, FIN);
  pc = db.prepare('SELECT * FROM pagamento_parcela WHERE pedido_id=?').all(p3);
  ok('o "marcar pago" de antes vira UMA parcela paga, do valor do pedido', r.status === 200 && pc.length === 1 && pc[0].pago_em && pc[0].valor_centavos === 5000000, () => JSON.stringify(pc));

  secao('os anexos (R-CMP-20)');
  const conteudo = Buffer.from('%PDF-1.4 orcamento').toString('base64');
  r = await post('/api/compras/anexos', { pedido_id:p1, tipo:'orcamento', nome:'orc.pdf', base64:conteudo }, ANA);
  ok('anexa o orcamento', r.status === 200 && r.corpo.id > 0, () => JSON.stringify(r));
  const an = db.prepare('SELECT * FROM compra_anexo WHERE id=?').get(r.corpo.id);
  const caminhos = require('./caminhos');
  ok('o arquivo mora em ANEXOS_COMPRAS, fora de lotes/ (o cron apaga lotes/)', an && fs.existsSync(path.join(caminhos.ANEXOS_COMPRAS, an.arquivo)) && caminhos.ANEXOS_COMPRAS.indexOf(caminhos.LOTES) !== 0,
     () => caminhos.ANEXOS_COMPRAS);
  ok('e grava quem anexou', an.criado_por_id === ANA.id);
  const baixa = await B.chamar('GET', '/api/compras/anexos/' + an.id, undefined, LEIT);
  ok('o anexo se baixa de volta igual', baixa.status === 200 && String(baixa.corpo).indexOf('orcamento') >= 0);
  r = await post('/api/compras/anexos', { pedido_id:p1, tipo:'virus', nome:'a.exe', base64:conteudo }, ANA);
  ok('tipo de anexo fora da lista e recusado', r.status === 400);
  r = await post('/api/compras/anexos', { pedido_id:p1, tipo:'orcamento', nome:'../../etc/passwd', base64:conteudo }, ANA);
  ok('o nome do arquivo nao escolhe o caminho no disco', r.status === 200 && !fs.existsSync(path.join(caminhos.ANEXOS_COMPRAS, '..', '..', 'etc', 'passwd')));

  secao('a compra rapida (R-CMP-21)');
  const cafe = (await post('/api/componentes', { nome:'Café', unidade:'un', modo_saldo:'sem', vai_ficha:0 }, AG)).corpo.id;
  r = await post('/api/compras/rapida', { componente_id:cafe, quantidade:6, valor_total:90, canal:'mercado_livre', loja:'Café do Sul', numero_externo:'2000012345' }, ANA);
  ok('nasce comprada, sem fornecedor cadastrado, com a loja em texto', r.status === 200, () => JSON.stringify(r));
  const pr1 = db.prepare('SELECT * FROM pedido_compra WHERE id=?').get(r.corpo.id);
  ok('status comprado, rapida = 1, loja e canal gravados', pr1.status === 'comprado' && pr1.rapida === 1 && pr1.loja === 'Café do Sul' && pr1.canal === 'mercado_livre' && pr1.fornecedor_id == null);
  ok('a data da compra, sem dizer, e hoje', /^\d{4}-\d{2}-\d{2}/.test(pr1.comprado_em));
  const ir = db.prepare('SELECT * FROM pedido_item WHERE pedido_id=?').get(pr1.id);
  ok('o item: 6 un a R$ 15,00', ir.componente_id === cafe && ir.qtd_consumo === 6 && Math.abs(ir.preco_unit - 15) < 1e-9);
  r = await post('/api/compras/rapida', { componente_id:cafe, quantidade:100, valor_total:1500, canal:'shopee', loja:'Loja', numero_externo:'99' }, ANA);
  ok('acima da alcada, a compra rapida tambem espera aprovacao', r.status === 200 && db.prepare('SELECT status FROM pedido_compra WHERE id=?').get(r.corpo.id).status === 'aguardando_aprovacao');
  r = await post('/api/compras/rapida', { componente_id:cafe, quantidade:1, valor_total:10, canal:'mercado_livre' }, ANA);
  ok('sem o numero do pedido no marketplace e recusada', r.status === 400);
  r = await post('/api/compras/rapida', { componente_id:cafe, quantidade:1, valor_total:10, canal:'direto', numero_externo:'1' }, null);
  ok('sem login nada grava (401)', r.status === 401);

  secao('Pendencias: pedido aguardando aprovacao');
  const L = require('./pendencias_dominio').LINHAS.find(l => l.chave === 'pedido_aprovacao');
  const n = db.prepare("SELECT COUNT(*) n FROM pedido_compra WHERE status='aguardando_aprovacao'").get().n;
  ok('a central conta os pedidos aguardando, pela conta do dominio', L && L.contar(db).n === n && n > 0, () => (L ? L.contar(db).n : 'sem linha') + ' x ' + n);

  fim();
})().catch(e => { console.error(e); process.exit(1); });
