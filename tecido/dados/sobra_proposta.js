// Tabela 'sobra_proposta' — o que a bancada apontou como errado numa sobra,
// esperando a chefia. O SQL, e so ele: quem decide o que vira correcao e
// dominio/sobra.js.
const db=require('../nucleo/db');

/* A proposta vem com o que ela PROPOE ja legivel: o nome do tecido proposto,
   o nome da condicao proposta. O 'de' (como a sobra esta hoje) e o dominio
   que monta, porque depende da sobra atual e do endereco descrito. */
const CAMPOS=`p.id, p.sobra_id, p.tecido_id, p.largura, p.altura, p.condicao, p.nivel_id,
  p.motivo, p.status, p.criado_por, p.criado_em, p.decidido_por, p.decidido_em, p.decisao_motivo,
  s.codigo AS sobra_codigo, s.status AS sobra_status,
  l.nome AS tecido_linha_nome, a.nome AS tecido_abertura_nome, c.nome AS tecido_cor_nome,
  cs.nome AS condicao_nome`;
const DE=`FROM sobra_proposta p
  JOIN sobra s ON s.id=p.sobra_id
  LEFT JOIN tecido t ON t.id=p.tecido_id
  LEFT JOIN linha l ON l.id=t.linha_id
  LEFT JOIN abertura a ON a.id=t.abertura_id
  LEFT JOIN cor c ON c.id=t.cor_id
  LEFT JOIN condicao_sobra cs ON cs.chave=p.condicao`;

function listar(filtro){
  const f=filtro||{};
  const onde=[], vals=[];
  if(f.sobra_id){ onde.push('p.sobra_id=?'); vals.push(f.sobra_id); }
  if(f.status){ onde.push('p.status=?'); vals.push(f.status); }
  // Pendente mais antiga em cima: e a que espera ha mais tempo.
  return db.prepare('SELECT '+CAMPOS+' '+DE+(onde.length?' WHERE '+onde.join(' AND '):'')+
    ' ORDER BY p.id '+(f.status==='pendente'?'ASC':'DESC')).all(...vals);
}

const porId=id=>db.prepare('SELECT '+CAMPOS+' '+DE+' WHERE p.id=?').get(id);

const pendenteDe=sobra_id=>db.prepare(
  "SELECT id FROM sobra_proposta WHERE sobra_id=? AND status='pendente' LIMIT 1").get(sobra_id);

function criar(d){
  const r=db.prepare(`INSERT INTO sobra_proposta
    (sobra_id,tecido_id,largura,altura,condicao,nivel_id,motivo,criado_por)
    VALUES(?,?,?,?,?,?,?,?)`).run(
      d.sobra_id, d.tecido_id==null?null:d.tecido_id, d.largura==null?null:d.largura,
      d.altura==null?null:d.altura, d.condicao||null, d.nivel_id==null?null:d.nivel_id,
      d.motivo||null, d.criado_por||null);
  return r.lastInsertRowid;
}

const decidir=(id,status,quem,quando,motivo)=>db.prepare(
  'UPDATE sobra_proposta SET status=?, decidido_por=?, decidido_em=?, decisao_motivo=? WHERE id=?')
  .run(status,quem||null,quando,motivo||null,id);

const quantasPendentes=()=>db.prepare(
  "SELECT COUNT(*) c FROM sobra_proposta WHERE status='pendente'").get().c;

module.exports={listar,porId,pendenteDe,criar,decidir,quantasPendentes};
