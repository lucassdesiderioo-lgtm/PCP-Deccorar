// Tabelas 'rolo' e 'movimento_rolo'. Quem move o saldo e dominio/rolo.js.
const db=require('../nucleo/db');

const CAMPOS=`r.id, r.codigo, r.tecido_id, r.largura, r.metragem_inicial, r.saldo,
  r.nivel_id, r.status, r.nf, r.fornecedor, r.criado_em, r.criado_por,
  r.saldo * r.largura AS m2,
  t.codigo AS tecido_codigo, l.nome AS linha_nome, a.nome AS abertura_nome, c.nome AS cor_nome`;
const DE=`FROM rolo r
  JOIN tecido t ON t.id=r.tecido_id
  JOIN linha l ON l.id=t.linha_id
  JOIN abertura a ON a.id=t.abertura_id
  JOIN cor c ON c.id=t.cor_id`;

const ultimoSeq=()=>{
  const r=db.prepare("SELECT codigo FROM rolo WHERE codigo LIKE 'R-%' ORDER BY id DESC LIMIT 1").get();
  return r?Number(String(r.codigo).slice(2))||0:0;
};

function listar(filtro){
  const f=filtro||{};
  const onde=[], vals=[];
  if(f.tecido_id){ onde.push('r.tecido_id=?'); vals.push(f.tecido_id); }
  if(f.status){ onde.push('r.status=?'); vals.push(f.status); }
  if(f.abertos) onde.push("r.status IN ('aberto','fechado')");
  return db.prepare('SELECT '+CAMPOS+' '+DE+(onde.length?' WHERE '+onde.join(' AND '):'')+
    ' ORDER BY r.status, r.id DESC').all(...vals);
}
const porId=id=>db.prepare('SELECT '+CAMPOS+' '+DE+' WHERE r.id=?').get(id);
const porCodigo=codigo=>db.prepare('SELECT '+CAMPOS+' '+DE+' WHERE r.codigo=?').get(codigo);

// A ordem que o plano usa para escolher o rolo dentro da largura vencedora:
// aberto antes de fechado (fecha o rolo velho antes de abrir outro) e, entre
// abertos, o de MENOR saldo.
const disponiveis=tecido_id=>db.prepare('SELECT '+CAMPOS+' '+DE+`
   WHERE r.tecido_id=? AND r.status IN ('aberto','fechado') AND r.saldo > 0.001
   ORDER BY CASE r.status WHEN 'aberto' THEN 0 ELSE 1 END, r.saldo, r.id`).all(tecido_id);

function criar(d){
  const r=db.prepare(`INSERT INTO rolo
    (codigo,tecido_id,largura,metragem_inicial,saldo,nivel_id,status,nf,fornecedor,criado_por)
    VALUES(?,?,?,?,?,?,'fechado',?,?,?)`).run(
      d.codigo,d.tecido_id,d.largura,d.metragem,d.metragem,d.nivel_id||null,
      d.nf||null,d.fornecedor||null,d.criado_por||null);
  return r.lastInsertRowid;
}

const gravarSaldo=(id,saldo,status)=>
  db.prepare('UPDATE rolo SET saldo=?, status=? WHERE id=?').run(saldo,status,id);

const movimentar=m=>db.prepare(`INSERT INTO movimento_rolo
  (rolo_id,delta,saldo_apos,motivo,referencia,observacao,usuario_nome)
  VALUES(?,?,?,?,?,?,?)`).run(
    m.rolo_id,m.delta,m.saldo_apos,m.motivo,m.referencia||null,m.observacao||null,m.usuario_nome||null);

const movimentos=rolo_id=>db.prepare(
  'SELECT * FROM movimento_rolo WHERE rolo_id=? ORDER BY id').all(rolo_id);

// R6: nao existe saldo generico por tecido. O saldo do tecido e a SOMA dos
// rolos, calculada na hora — um total guardado numa coluna e um total que
// diverge sozinho.
const saldoPorTecido=()=>db.prepare(`
  SELECT t.id AS tecido_id, t.codigo AS tecido_codigo,
         l.nome AS linha_nome, a.nome AS abertura_nome, c.nome AS cor_nome,
         COALESCE(SUM(CASE WHEN r.status IN ('aberto','fechado') THEN r.saldo END),0) AS saldo,
         COALESCE(SUM(CASE WHEN r.status IN ('aberto','fechado') THEN r.saldo*r.largura END),0) AS m2,
         SUM(CASE WHEN r.status='aberto' THEN 1 ELSE 0 END) AS abertos,
         SUM(CASE WHEN r.status='fechado' THEN 1 ELSE 0 END) AS fechados
    FROM tecido t
    JOIN linha l ON l.id=t.linha_id
    JOIN abertura a ON a.id=t.abertura_id
    JOIN cor c ON c.id=t.cor_id
    LEFT JOIN rolo r ON r.tecido_id=t.id
   GROUP BY t.id ORDER BY l.ordem, l.nome, a.ordem, a.nome, c.ordem, c.nome`).all();

// Criterio 13 da secao 10: a soma dos movimentos tem que dar o saldo.
const divergencias=()=>db.prepare(`
  SELECT r.id, r.codigo, r.saldo,
         COALESCE((SELECT SUM(delta) FROM movimento_rolo m WHERE m.rolo_id=r.id),0) AS somaDelta
    FROM rolo r
   WHERE ABS(r.saldo - COALESCE((SELECT SUM(delta) FROM movimento_rolo m WHERE m.rolo_id=r.id),0)) > 0.001`).all();

module.exports={ultimoSeq,listar,porId,porCodigo,disponiveis,criar,gravarSaldo,
  movimentar,movimentos,saldoPorTecido,divergencias};
