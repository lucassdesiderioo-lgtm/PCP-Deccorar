// Tabela 'sobra'. O SQL, e so ele — status e baixa quem move e dominio/sobra.js.
const db=require('../nucleo/db');

const CAMPOS=`s.id, s.codigo, s.tecido_id, s.largura, s.altura, s.area, s.condicao,
  s.nivel_id, s.origem, s.origem_rolo_id, s.origem_sobra_id, s.status,
  s.criado_em, s.criado_por, s.baixado_em, s.baixado_por, s.baixa_motivo,
  t.codigo AS tecido_codigo, l.nome AS linha_nome, a.nome AS abertura_nome, c.nome AS cor_nome,
  t.permite_girar,
  cs.nome AS condicao_nome, cs.aproveitavel, cs.prioridade,
  CAST(julianday('now','localtime')-julianday(s.criado_em) AS INTEGER) AS dias_parada,
  (SELECT COUNT(*) FROM sobra_correcao sc WHERE sc.sobra_id=s.id) AS correcoes`;

const DE=`FROM sobra s
  JOIN tecido t ON t.id=s.tecido_id
  JOIN linha l ON l.id=t.linha_id
  JOIN abertura a ON a.id=t.abertura_id
  JOIN cor c ON c.id=t.cor_id
  LEFT JOIN condicao_sobra cs ON cs.chave=s.condicao`;

function listar(filtro){
  const f=filtro||{};
  const onde=[], vals=[];
  if(f.tecido_id){ onde.push('s.tecido_id=?'); vals.push(f.tecido_id); }
  if(f.status){ onde.push('s.status=?'); vals.push(f.status); }
  const sql='SELECT '+CAMPOS+' '+DE+(onde.length?' WHERE '+onde.join(' AND '):'')+
    ' ORDER BY s.id DESC'+(f.limite?' LIMIT '+Number(f.limite):'');
  return db.prepare(sql).all(...vals);
}

const porId=id=>db.prepare('SELECT '+CAMPOS+' '+DE+' WHERE s.id=?').get(id);
const porCodigo=codigo=>db.prepare('SELECT '+CAMPOS+' '+DE+' WHERE s.codigo=?').get(codigo);

// As candidatas do plano de corte (fase 4). Vem ordenadas pela prioridade da
// condicao — integra primeiro, defeito parcial por ultimo — e, dentro dela,
// pela MENOR AREA: gastar o retalho pequeno antes do grande.
const candidatas=tecido_id=>db.prepare('SELECT '+CAMPOS+' '+DE+`
   WHERE s.tecido_id=? AND s.status='disponivel' AND COALESCE(cs.aproveitavel,1)=1
   ORDER BY COALESCE(cs.prioridade,0), s.area`).all(tecido_id);

function criar(d){
  const r=db.prepare(`INSERT INTO sobra
    (codigo,tecido_id,largura,altura,condicao,nivel_id,origem,origem_rolo_id,origem_sobra_id,criado_por)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
      d.codigo,d.tecido_id,d.largura,d.altura,d.condicao,d.nivel_id,
      d.origem||null,d.origem_rolo_id||null,d.origem_sobra_id||null,d.criado_por||null);
  return r.lastInsertRowid;
}

const baixar=(id,status,quando,quem,motivo)=>
  db.prepare('UPDATE sobra SET status=?, baixado_em=?, baixado_por=?, baixa_motivo=? WHERE id=?')
    .run(status,quando,quem||null,motivo||null,id);

// A correcao do que foi lancado errado. So os campos que vierem; quem decide
// o que pode mudar (e em que status) e dominio/sobra.js. 'area' e coluna
// gerada — mudar largura ou altura a refaz sozinha.
function atualizar(id,d){
  const campos=[], vals=[];
  for(const k of ['tecido_id','largura','altura','condicao','nivel_id'])
    if(d[k]!==undefined){ campos.push(k+'=?'); vals.push(d[k]); }
  if(campos.length) db.prepare('UPDATE sobra SET '+campos.join(', ')+' WHERE id=?').run(...vals,id);
}

const registrarCorrecao=c=>db.prepare(
  'INSERT INTO sobra_correcao(sobra_id,campo,de,para,usuario_nome) VALUES(?,?,?,?,?)')
  .run(c.sobra_id,c.campo,c.de==null?null:String(c.de),c.para==null?null:String(c.para),c.usuario_nome||null);

const correcoes=sobra_id=>db.prepare(
  'SELECT id, campo, de, para, usuario_nome, criado_em FROM sobra_correcao WHERE sobra_id=? ORDER BY id DESC')
  .all(sobra_id);

// O numero do painel (fase 7) e do cruzamento "sem rolo, com retalho".
const resumoPorTecido=()=>db.prepare(`
  SELECT t.id AS tecido_id, t.codigo AS tecido_codigo,
         l.nome AS linha_nome, a.nome AS abertura_nome, c.nome AS cor_nome,
         COUNT(s.id) AS sobras, COALESCE(SUM(s.area),0) AS area
    FROM tecido t
    JOIN linha l ON l.id=t.linha_id
    JOIN abertura a ON a.id=t.abertura_id
    JOIN cor c ON c.id=t.cor_id
    LEFT JOIN sobra s ON s.tecido_id=t.id AND s.status='disponivel'
   GROUP BY t.id ORDER BY l.ordem, l.nome, a.ordem, a.nome, c.ordem, c.nome`).all();

module.exports={listar,porId,porCodigo,candidatas,criar,baixar,atualizar,registrarCorrecao,correcoes,resumoPorTecido};
