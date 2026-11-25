/* O CARRINHO DA CONFERÊNCIA — dono único (spec CONFERENCIA-CARRINHOS, 25/11/2026).
 *
 * A caixa conferida na 202 vai para um DESTINO: um carrinho da coleta (A, B…,
 * a lista "Carrinhos da expedição" da 902) ou o Carro da agência ('AG'). É o
 * `lote.carrinho`. A entrega leva destinos inteiros (o motorista leva o
 * carrinho inteiro, decisão do dono).
 *
 * O que este arquivo responde, e ninguém mais:
 *   - que carrinhos existem e se um código é carrinho;
 *   - para que destino vai a caixa bipada (R-CRR-02: coleta → carrinho ativo,
 *     agência → 'AG', sem modo);
 *   - o que está em cada destino, e o que está conferido SEM carrinho;
 *   - a recontagem cega e o "não achei" (que NÃO mexe no estoque);
 *   - as duas barras do dia;
 *   - a entrega (prévia e fechamento).
 *
 * ⚠️ ESTE ARQUIVO NÃO BAIXA ESTOQUE. A baixa é no bipe da conferência
 * (baixa_dominio.baixar, chamado pelo carreg_route). O "não achei" tira a caixa
 * do carrinho e a deixa conferida: ela existiu, alguém a bipou, e o saldo já
 * está certo (decisão do dono, 25/11/2026).
 *
 * ⚠️ NÃO ABRE TRANSAÇÃO (R-EST-07): quem chama abre.
 */
const { acharVolumes, ehColeta, COLETA } = require('./carga');
const { VENCE_HOJE } = require('./fila_dia');

const AG = 'AG';
const TIPO = 'carrinho_expedicao';

function garantirSchema(db){
  for(const c of ['carrinho TEXT', 'carrinho_em TEXT', 'nao_achada_em TEXT', 'nao_achada_por TEXT', 'nao_achada_por_id INTEGER'])
    try{ db.exec('ALTER TABLE lote ADD COLUMN ' + c); }catch(e){}
  db.exec(`CREATE TABLE IF NOT EXISTS carrinho_recontagem (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    carrinho TEXT NOT NULL,
    em TEXT DEFAULT (datetime('now','localtime')),
    por TEXT,
    por_id INTEGER,
    esperadas INTEGER,
    contadas INTEGER,
    bateu INTEGER DEFAULT 0,
    faltam TEXT DEFAULT '[]',
    sobraram TEXT DEFAULT '[]',
    desconhecidos TEXT DEFAULT '[]');`);
}

const norm = s => String(s == null ? '' : s).trim().toUpperCase();

/* Os carrinhos ativos da lista "Carrinhos da expedição", na ordem dela. */
function carrinhos(db){
  try{
    return db.prepare("SELECT id, valor FROM listas WHERE tipo=? AND ativo=1 ORDER BY ordem, id").all(TIPO)
      .map(r => ({ id:r.id, codigo:norm(r.valor), nome:'Carrinho ' + norm(r.valor) }))
      .filter(c => c.codigo && c.codigo !== AG);
  }catch(e){ return []; }
}
const agencia = () => ({ codigo:AG, nome:'Carro da agência' });
function existe(db, codigo){ return carrinhos(db).some(c => c.codigo === norm(codigo)); }
function nomeDe(codigo){ return norm(codigo) === AG ? 'Carro da agência' : 'Carrinho ' + norm(codigo); }

/* A etiqueta colada no carrinho: "CARRINHO-A" (o leitor pode tirar o hífen). */
function carrinhoDoBipe(code){
  const m = norm(code).replace(/\s+/g, '').match(/^CARRINHO-?([A-Z0-9]{1,8})$/);
  return m ? m[1] : null;
}

/* Para onde vai a caixa bipada. Devolve { destino } ou { erro, motivo, aviso }. */
function destinoPara(db, volume, pedido){
  if(!ehColeta(volume)) return { destino:AG };
  const c = norm(pedido);
  if(!c) return { motivo:'sem_carrinho', aviso:'Escolha o carrinho antes: bipe a etiqueta do carrinho, ou toque nele.' };
  if(c === AG || !existe(db, c)) return { motivo:'carrinho_invalido',
    aviso:'O carrinho "' + c + '" não está no cadastro "Carrinhos da expedição".' };
  return { destino:c };
}

/* CONFERIDA E AINDA NA FÁBRICA: a régua de "está num destino". A coleta
   conferida é `carregado` (o canto de antes), a agência conferida continua
   `embalado` com `conferido_em` (a área de antes). Saiu: tem saída, ou saiu_em,
   ou retirado_em. */
const NA_FABRICA = "conferido_em IS NOT NULL AND saida_id IS NULL AND saiu_em IS NULL AND retirado_em IS NULL " +
                   "AND estagio IN ('carregado','embalado') AND COALESCE(teste,0)=0";

function noDestino(db, codigo){
  return db.prepare(`SELECT * FROM lote WHERE carrinho=? AND ${NA_FABRICA} ORDER BY carrinho_em, id`).all(norm(codigo));
}
function semCarrinho(db){
  return db.prepare(`SELECT * FROM lote WHERE carrinho IS NULL AND ${NA_FABRICA} ORDER BY conferido_em, id`).all();
}
/* A pendência da 204: conferida, não achada na recontagem, e ainda sem carrinho. */
function naoAchadas(db){
  /* Banco sem a coluna (o módulo ainda não subiu nele): nenhuma caixa pode ter
     sido marcada, e zero aqui é a verdade, não a falta de conta. */
  let tem = false;
  try{ tem = db.prepare("SELECT 1 FROM pragma_table_info('lote') WHERE name='nao_achada_em'").get(); }catch(e){}
  if(!tem) return { n:0, desde:null, ids:[] };
  const l = db.prepare(`SELECT id, nao_achada_em FROM lote WHERE carrinho IS NULL AND nao_achada_em IS NOT NULL
    AND ${NA_FABRICA} ORDER BY nao_achada_em`).all();
  return { n:l.length, desde:l.length ? l[0].nao_achada_em : null, ids:l.map(x => x.id) };
}

function colocar(db, id, destino){
  db.prepare("UPDATE lote SET carrinho=?, carrinho_em=datetime('now','localtime') WHERE id=?").run(norm(destino), id);
}
const estaNaFabrica = (db, id) => !!db.prepare(`SELECT 1 FROM lote WHERE id=? AND ${NA_FABRICA}`).get(id);

/* A RECONTAGEM CEGA (R-CRR-04). A tela junta os códigos bipados e manda no
   fim; só então o servidor diz o que faltou e o que sobrou. */
function recontar(db, carrinho, codes, quem, ids){
  const c = norm(carrinho);
  const esperadas = noDestino(db, c);
  const achadas = new Map(), desconhecidos = [];
  for(const code of (Array.isArray(codes) ? codes : [])){
    const v = acharVolumes(db, String(code||'').trim()).find(x => estaNaFabrica(db, x.id));
    if(v) achadas.set(v.id, v); else if(String(code||'').trim()) desconhecidos.push(String(code).trim());
  }
  /* "Achei" na tela: a caixa que a recontagem não achou e a pessoa achou no
     carrinho entra pelo id (o código dela não está na tela). */
  for(const id of (Array.isArray(ids) ? ids : [])){
    const v = db.prepare('SELECT * FROM lote WHERE id=?').get(+id);
    if(v && estaNaFabrica(db, v.id)) achadas.set(v.id, v);
  }
  const marca = v => ({ id:v.id, buyer:v.buyer, nf:v.nf, codigo:v.codigo, carrinho:v.carrinho||null, coleta:ehColeta(v) });
  const faltam = esperadas.filter(v => !achadas.has(v.id)).map(marca);
  const sobraram = [...achadas.values()].filter(v => norm(v.carrinho) !== c).map(marca);
  const contadas = [...achadas.values()].filter(v => norm(v.carrinho) === c).length + sobraram.length;
  const bateu = !faltam.length && !sobraram.length;
  const id = db.prepare(`INSERT INTO carrinho_recontagem (carrinho, por, por_id, esperadas, contadas, bateu, faltam, sobraram, desconhecidos)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(c, quem && quem.nome || null, quem && quem.id || null, esperadas.length, contadas,
      bateu ? 1 : 0, JSON.stringify(faltam.map(x => x.id)), JSON.stringify(sobraram.map(x => x.id)),
      JSON.stringify(desconhecidos)).lastInsertRowid;
  return { id, carrinho:c, esperadas:esperadas.length, contadas, bateu, faltam, sobraram, desconhecidos };
}

function passar(db, loteId, carrinho){
  const v = db.prepare('SELECT * FROM lote WHERE id=?').get(loteId);
  if(!v || !estaNaFabrica(db, v.id)) return { ok:false, motivo:'nao_conferida', aviso:'Só se passa de carrinho a caixa conferida e ainda na fábrica.' };
  const d = destinoPara(db, v, carrinho);
  if(d.motivo) return Object.assign({ ok:false }, d);
  colocar(db, v.id, d.destino);
  return { ok:true, carrinho:d.destino };
}

function naoAchou(db, loteId, quem){
  const v = db.prepare('SELECT * FROM lote WHERE id=?').get(loteId);
  if(!v || !estaNaFabrica(db, v.id) || !v.carrinho) return { ok:false, motivo:'fora_do_carrinho', aviso:'Esta caixa não está em nenhum carrinho.' };
  db.prepare(`UPDATE lote SET carrinho=NULL, nao_achada_em=datetime('now','localtime'), nao_achada_por=?, nao_achada_por_id=? WHERE id=?`)
    .run(quem && quem.nome || null, quem && quem.id || null, v.id);
  return { ok:true, de:v.carrinho };
}

/* AS DUAS BARRAS DO DIA (§3 da spec). Nenhuma conta nova de prazo: "do dia" é
   o VENCE_HOJE do fila_dia.js (a régua da 201) para o que ainda não tem
   etiqueta; o que tem etiqueta e está na fábrica entra sempre (está ali e tem
   que sair), e o que saiu hoje conta como entregue. */
function barras(db){
  const n = s => db.prepare(s).get().n;
  const SEM_TESTE = "COALESCE(teste,0)=0";
  const semEtiqueta = n(`SELECT COUNT(*) n FROM lote WHERE estagio IN ('pendente','bloqueado') AND codigo IS NOT NULL AND ${VENCE_HOJE} AND ${SEM_TESTE}`);
  const semBipe = n(`SELECT COUNT(*) n FROM lote WHERE estagio='embalado' AND conferido_em IS NULL AND ${SEM_TESTE}`);
  const nos = n(`SELECT COUNT(*) n FROM lote WHERE ${NA_FABRICA}`);
  const SAIU_HOJE = "date(COALESCE(saiu_em, retirado_em))=date('now','localtime')";
  const entregues = n(`SELECT COUNT(*) n FROM lote WHERE estagio='carregado' AND ${SAIU_HOJE} AND ${SEM_TESTE}`);
  const total = semEtiqueta + semBipe + nos + entregues;
  const IMP_HOJE = `date(embalado_em)=date('now','localtime') AND estagio IN ('embalado','carregado') AND ${SEM_TESTE}`;
  const impressas = n(`SELECT COUNT(*) n FROM lote WHERE ${IMP_HOJE}`);
  const bipadas = n(`SELECT COUNT(*) n FROM lote WHERE ${IMP_HOJE} AND conferido_em IS NOT NULL`);
  const antes = n(`SELECT COUNT(*) n FROM lote WHERE estagio='embalado' AND conferido_em IS NULL AND date(embalado_em)<date('now','localtime') AND ${SEM_TESTE}`);
  return {
    entrega:{ total, entregues, nos_carrinhos:nos, sem_bipe:semBipe, sem_etiqueta:semEtiqueta, faltam:total - entregues },
    bipe:{ impressas, bipadas, faltam:impressas - bipadas, antes_sem_bipe:antes }
  };
}

/* A ENTREGA (R-ENT). `para`: 'motorista' (o caminhão do ML) ou 'agencia' (o
   carro, com o atendente). Carrinho de coleta só vai ao motorista; o Carro da
   agência vai aos dois (R-ENT-06). */
function previa(db, destinos){
  const ds = [...new Set((destinos||[]).map(norm).filter(Boolean))];
  const caixas = [];
  for(const d of ds) caixas.push(...noDestino(db, d));
  const soAgencia = ds.length > 0 && ds.every(d => d === AG);
  const faltamBipar = db.prepare(`SELECT id, buyer, nf, codigo, modalidade, despachar_em, impresso_por FROM lote
    WHERE estagio='embalado' AND conferido_em IS NULL AND COALESCE(teste,0)=0 ORDER BY embalado_em, id`).all()
    .filter(v => soAgencia ? !ehColeta(v) : ehColeta(v) || ds.includes(AG));
  return { destinos:ds, caixas, sistema:caixas.length, faltam_bipar:faltamBipar };
}

function validarEntrega(db, b){
  const ds = [...new Set((Array.isArray(b.destinos) ? b.destinos : []).map(norm).filter(Boolean))];
  if(!ds.length) return { motivo:'sem_destino', aviso:'Escolha o carrinho que vai ser entregue.' };
  for(const d of ds) if(d !== AG && !existe(db, d)) return { motivo:'carrinho_invalido', aviso:'O carrinho "'+d+'" não está no cadastro.' };
  const para = b.para === 'agencia' ? 'agencia' : b.para === 'motorista' ? 'motorista' : null;
  if(!para) return { motivo:'para_invalido', aviso:'Diga se a entrega é ao motorista da coleta ou à agência.' };
  if(para === 'agencia' && ds.some(d => d !== AG))
    return { motivo:'para_invalido', aviso:'Carrinho de coleta vai ao motorista do Mercado Livre, não à agência.' };
  for(const d of ds) if(!noDestino(db, d).length) return { motivo:'vazio', aviso:nomeDe(d)+' está vazio.' };
  const numero = parseInt(b.numero, 10);
  if(!(numero >= 0) || String(b.numero).trim() === '') return { motivo:'sem_numero', aviso:'Digite quantas caixas o '+(para==='agencia'?'atendente':'motorista')+' bipou.' };
  return { destinos:ds, para, numero };
}

module.exports = { AG, TIPO, garantirSchema, carrinhos, agencia, existe, nomeDe, carrinhoDoBipe, destinoPara,
  NA_FABRICA, noDestino, semCarrinho, naoAchadas, colocar, estaNaFabrica, recontar, passar, naoAchou,
  barras, previa, validarEntrega };
