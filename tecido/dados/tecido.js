// Tabela 'tecido' — o item de estoque: linha + abertura + cor.
// Nao decide nada; quem decide (codigo gerado, duplicidade, hierarquia
// coerente) e dominio/tecido.js.
const db=require('../nucleo/db');

const CAMPOS=`t.id, t.codigo, t.linha_id, t.abertura_id, t.cor_id,
  t.largura_sugerida, t.permite_girar, t.ativo,
  /* O preco do m² do tecido — e o que da valor as sobras (area x preco).
     Dado comercial: a rota poda para quem nao tem custo.ver. */
  t.preco_m2,
  l.nome AS linha_nome, a.nome AS abertura_nome, c.nome AS cor_nome`;

const DE=`FROM tecido t
  JOIN linha l ON l.id=t.linha_id
  JOIN abertura a ON a.id=t.abertura_id
  JOIN cor c ON c.id=t.cor_id`;

const listar=()=>db.prepare('SELECT '+CAMPOS+' '+DE+' ORDER BY l.ordem, l.nome, a.ordem, a.nome, c.ordem, c.nome').all();
const ativos=()=>db.prepare('SELECT '+CAMPOS+' '+DE+' WHERE t.ativo=1 ORDER BY l.ordem, l.nome, a.ordem, a.nome, c.ordem, c.nome').all();
const porId=id=>db.prepare('SELECT '+CAMPOS+' '+DE+' WHERE t.id=?').get(id);
const porCombinacao=(linha_id,abertura_id,cor_id)=>
  db.prepare('SELECT * FROM tecido WHERE linha_id=? AND abertura_id=? AND cor_id=?').get(linha_id,abertura_id,cor_id);
const porCodigo=codigo=>db.prepare('SELECT * FROM tecido WHERE codigo=?').get(codigo);

function criar(d){
  const r=db.prepare(`INSERT INTO tecido(codigo,linha_id,abertura_id,cor_id,largura_sugerida,permite_girar,ativo)
    VALUES(?,?,?,?,?,?,1)`).run(d.codigo,d.linha_id,d.abertura_id,d.cor_id,d.largura_sugerida||null,d.permite_girar?1:0);
  return porId(r.lastInsertRowid);
}

function atualizar(id,d){
  const campos=[], vals=[];
  if(d.largura_sugerida!==undefined){ campos.push('largura_sugerida=?'); vals.push(d.largura_sugerida); }
  if(d.permite_girar!==undefined){ campos.push('permite_girar=?'); vals.push(d.permite_girar?1:0); }
  if(d.ativo!==undefined){ campos.push('ativo=?'); vals.push(d.ativo?1:0); }
  if(campos.length) db.prepare('UPDATE tecido SET '+campos.join(', ')+' WHERE id=?').run(...vals,id);
  return porId(id);
}

// O preco tem porta propria: quem muda e dominio/tecido.js, com historico.
const gravarPreco=(id,preco)=>db.prepare('UPDATE tecido SET preco_m2=? WHERE id=?').run(preco,id);
const registrarPreco=p=>db.prepare(
  'INSERT INTO tecido_preco(tecido_id,de,para,usuario_nome) VALUES(?,?,?,?)')
  .run(p.tecido_id,p.de==null?null:p.de,p.para,p.usuario_nome||null);
const historicoPreco=tecido_id=>db.prepare(
  'SELECT id, de, para, usuario_nome, criado_em FROM tecido_preco WHERE tecido_id=? ORDER BY id DESC').all(tecido_id);

module.exports={listar,ativos,porId,porCombinacao,porCodigo,criar,atualizar,gravarPreco,registrarPreco,historicoPreco};
