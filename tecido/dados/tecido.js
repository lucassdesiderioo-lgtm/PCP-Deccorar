// Tabela 'tecido' — o item de estoque: linha + abertura + cor.
// Nao decide nada; quem decide (codigo gerado, duplicidade, hierarquia
// coerente) e dominio/tecido.js.
const db=require('../nucleo/db');

const CAMPOS=`t.id, t.codigo, t.linha_id, t.abertura_id, t.cor_id,
  t.largura_sugerida, t.permite_girar, t.ativo,
  /* O preco do m² do tecido — e o que da valor as sobras (area x preco).
     Dado comercial: a rota poda para quem nao tem custo.ver. */
  t.preco_m2,
  l.nome AS linha_nome, a.nome AS abertura_nome, c.nome AS cor_nome,

  /* ⚠️ 'disponivel' — O TECIDO APARECE PARA A FABRICA?
     Desativar a linha, a colecao ou a cor sempre foi entendido como "nao
     vendemos mais isto", mas as telas da bancada so olhavam t.ativo: o
     tecido continuava na entrada de rolo, no corte e nas sobras como se nada
     tivesse acontecido, e quem desativou nao tinha como perceber. Desativar
     um cadastro que nao desativa nada e pior que nao ter o botao — ele
     promete uma coisa e faz outra, em silencio.

     E DERIVADO, nao gravado, e isso e a decisao: propagar em cascata na
     escrita (desativar a cor desativa os tecidos dela) perderia a informacao
     de quem estava desativado ANTES, e reativar a cor nao teria como saber
     quais tecidos devolver. Derivando, reativar desfaz exatamente o que
     desativar fez.

     CASE em vez de AND puro porque AND com NULL devolve NULL, e uma
     coluna ativo nula deixaria o tecido num terceiro estado que nenhuma
     tela sabe ler. */
  CASE WHEN t.ativo=1 AND l.ativo=1 AND a.ativo=1 AND c.ativo=1
       THEN 1 ELSE 0 END AS disponivel,
  /* Quais dos tres estao desligados — e o que deixa a tela de cadastro
     dizer POR QUE o tecido sumiu da fabrica, em vez de so escondê-lo. */
  l.ativo AS linha_ativa, a.ativo AS abertura_ativa, c.ativo AS cor_ativa,

  /* ⚠️ AINDA TEM MATERIAL DESTE TECIDO NA FABRICA?
     Esconder um tecido que ainda tem rolo na estante ou sobra na prateleira
     nao para so de vender: para de CORTAR o que ja esta comprado, e a sobra
     que sair desse corte nao tem onde ser lancada. A bancada nao espera —
     ela lanca no tecido parecido, e a partir dali e o estoque errado que
     anda. E a armadilha #6 do CLAUDE.md, e ela nasceria calada.

     Nao e trava: quem desativa continua desativando. E o aviso que faz a
     tela de cadastro dizer o que a decisao custa, como o exclusao.js diz
     "3 rolos estao nesta haste" em vez de so recusar.

     EXISTS e nao COUNT: a pergunta e "tem ou nao tem", e o COUNT varreria as
     linhas para devolver um numero que ninguem le. */
  CASE WHEN EXISTS(SELECT 1 FROM rolo r
                    WHERE r.tecido_id=t.id AND r.status<>'encerrado' AND r.saldo>0)
         OR EXISTS(SELECT 1 FROM sobra s
                    WHERE s.tecido_id=t.id AND s.status='disponivel')
       THEN 1 ELSE 0 END AS na_fabrica`;

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
