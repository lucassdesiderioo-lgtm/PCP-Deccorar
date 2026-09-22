// Tabelas sm_revenda, sm_revenda_endereco, sm_revenda_contato,
// sm_tabela_preco e sm_forma_pagamento. So SQL — quem decide e
// dominio/revenda.js.
const db=require('../nucleo/db');

/* `limite_vencido` e DERIVADO, e nao gravado. Guardar um "vencido=1" numa
   coluna obrigaria alguem a virar essa chave todo dia de madrugada, e no dia
   em que a rotina falhasse a lista apareceria vazia dizendo que esta tudo em
   dia — que e o pior jeito de errar. Derivando, a resposta e sempre de hoje.

   Revenda que nunca teve limite revisado NAO e vencida: ela nao tem limite
   nenhum, e cobrar revisao de quem nao tem limite e ruido que faz a lista
   deixar de ser lida. */
const CAMPOS=`r.*,
  t.nome AS tabela_nome, t.desconto_centesimos AS tabela_desconto_centesimos,
  f.nome AS forma_pagamento_nome,
  CASE WHEN r.valor_limite_credito_centavos IS NOT NULL
        AND r.limite_revisado_em IS NOT NULL
        AND date(r.limite_revisado_em,'+'||(SELECT valor FROM parametro WHERE chave='creditoRevisaoMeses')||' months')
            < date('now','localtime')
       THEN 1 ELSE 0 END AS limite_vencido`;

const DE=`FROM sm_revenda r
  LEFT JOIN sm_tabela_preco t ON t.id=r.tabela_id
  LEFT JOIN sm_forma_pagamento f ON f.id=r.forma_pagamento_id`;

const listar=filtro=>{
  const f=filtro||{};
  const onde=[], vals=[];
  if(f.ativo!==undefined){ onde.push('r.ativo=?'); vals.push(f.ativo?1:0); }
  if(f.vendedor_usuario_id!==undefined){
    if(f.vendedor_usuario_id===null) onde.push('r.vendedor_usuario_id IS NULL');
    else { onde.push('r.vendedor_usuario_id=?'); vals.push(f.vendedor_usuario_id); }
  }
  return db.prepare('SELECT '+CAMPOS+' '+DE+
    (onde.length?' WHERE '+onde.join(' AND '):'')+
    ' ORDER BY r.ativo DESC, r.nome_fantasia').all(...vals);
};

const porId=id=>db.prepare('SELECT '+CAMPOS+' '+DE+' WHERE r.id=?').get(id);
const porNome=nome=>db.prepare('SELECT * FROM sm_revenda WHERE nome_fantasia=? COLLATE NOCASE').get(nome);

const COLUNAS=['razao_social','nome_fantasia','cnpj','fiscal_cep','fiscal_logradouro',
  'fiscal_numero','fiscal_complemento','fiscal_bairro','fiscal_cidade','fiscal_uf',
  'vendedor_usuario_id','vendedor_nome','tabela_id','desconto_centesimos',
  'forma_pagamento_id','entrega','valor_limite_credito_centavos','limite_revisado_em',
  'observacao','ativo'];

function criar(d){
  const cols=COLUNAS.filter(c=>d[c]!==undefined);
  const r=db.prepare('INSERT INTO sm_revenda('+cols.concat('criado_por').join(',')+
    ') VALUES('+cols.map(()=>'?').join(',')+',?)')
    .run(...cols.map(c=>d[c]), d.criado_por||null);
  return porId(r.lastInsertRowid);
}

function atualizar(id,d){
  const cols=COLUNAS.filter(c=>d[c]!==undefined);
  if(cols.length)
    db.prepare('UPDATE sm_revenda SET '+cols.map(c=>c+'=?').join(', ')+' WHERE id=?')
      .run(...cols.map(c=>d[c]), id);
  return porId(id);
}

const vencidos=()=>listar().filter(r=>r.limite_vencido===1);

// ── Enderecos ─────────────────────────────────────────────────────────────
const enderecos=revenda_id=>db.prepare(
  'SELECT * FROM sm_revenda_endereco WHERE revenda_id=? ORDER BY padrao DESC, apelido').all(revenda_id);
const endereco=(revenda_id,id)=>db.prepare(
  'SELECT * FROM sm_revenda_endereco WHERE id=? AND revenda_id=?').get(id,revenda_id);
const enderecoPorApelido=(revenda_id,apelido)=>db.prepare(
  'SELECT * FROM sm_revenda_endereco WHERE revenda_id=? AND apelido=? COLLATE NOCASE').get(revenda_id,apelido);

const COL_END=['apelido','cep','logradouro','numero','complemento','bairro','cidade','uf','padrao','ativo'];

const tirarPadrao=revenda_id=>db.prepare(
  'UPDATE sm_revenda_endereco SET padrao=0 WHERE revenda_id=?').run(revenda_id);

function criarEndereco(d){
  const cols=COL_END.filter(c=>d[c]!==undefined);
  const r=db.prepare('INSERT INTO sm_revenda_endereco(revenda_id,'+cols.join(',')+
    ') VALUES(?,'+cols.map(()=>'?').join(',')+')').run(d.revenda_id,...cols.map(c=>d[c]));
  return endereco(d.revenda_id,r.lastInsertRowid);
}
function atualizarEndereco(revenda_id,id,d){
  const cols=COL_END.filter(c=>d[c]!==undefined);
  if(cols.length)
    db.prepare('UPDATE sm_revenda_endereco SET '+cols.map(c=>c+'=?').join(', ')+
      ' WHERE id=? AND revenda_id=?').run(...cols.map(c=>d[c]), id, revenda_id);
  return endereco(revenda_id,id);
}
const apagarEndereco=(revenda_id,id)=>db.prepare(
  'DELETE FROM sm_revenda_endereco WHERE id=? AND revenda_id=?').run(id,revenda_id);

// ── Contatos ──────────────────────────────────────────────────────────────
const contatos=revenda_id=>db.prepare(
  'SELECT * FROM sm_revenda_contato WHERE revenda_id=? ORDER BY principal DESC, nome').all(revenda_id);
const contato=(revenda_id,id)=>db.prepare(
  'SELECT * FROM sm_revenda_contato WHERE id=? AND revenda_id=?').get(id,revenda_id);

const COL_CON=['nome','papel','telefone','email','principal','ativo'];

function criarContato(d){
  const cols=COL_CON.filter(c=>d[c]!==undefined);
  const r=db.prepare('INSERT INTO sm_revenda_contato(revenda_id,'+cols.join(',')+
    ') VALUES(?,'+cols.map(()=>'?').join(',')+')').run(d.revenda_id,...cols.map(c=>d[c]));
  return contato(d.revenda_id,r.lastInsertRowid);
}
function atualizarContato(revenda_id,id,d){
  const cols=COL_CON.filter(c=>d[c]!==undefined);
  if(cols.length)
    db.prepare('UPDATE sm_revenda_contato SET '+cols.map(c=>c+'=?').join(', ')+
      ' WHERE id=? AND revenda_id=?').run(...cols.map(c=>d[c]), id, revenda_id);
  return contato(revenda_id,id);
}
const apagarContato=(revenda_id,id)=>db.prepare(
  'DELETE FROM sm_revenda_contato WHERE id=? AND revenda_id=?').run(id,revenda_id);

// ── Tabelas A/B/C e formas de pagamento ───────────────────────────────────
const tabelas=()=>db.prepare('SELECT * FROM sm_tabela_preco ORDER BY ordem, nome').all();
const tabela=id=>db.prepare('SELECT * FROM sm_tabela_preco WHERE id=?').get(id);
const gravarDescontoTabela=(id,v)=>db.prepare(
  'UPDATE sm_tabela_preco SET desconto_centesimos=? WHERE id=?').run(v,id);

const formasPagamento=()=>db.prepare('SELECT * FROM sm_forma_pagamento ORDER BY ordem, nome').all();
const formaPagamento=id=>db.prepare('SELECT * FROM sm_forma_pagamento WHERE id=?').get(id);

/* O historico mora na MESMA sm_preco_historico do catalogo, com alvo
   'tabela' e 'revenda'. Uma segunda tabela de historico seria um segundo
   lugar para procurar quando a pergunta e sempre a mesma: desde quando este
   numero e este? */
const registrarPreco=p=>db.prepare(
  'INSERT INTO sm_preco_historico(alvo,alvo_id,de,para,usuario_nome) VALUES(?,?,?,?,?)')
  .run(p.alvo,p.alvo_id,p.de==null?null:p.de,p.para==null?null:p.para,p.usuario_nome||null);
const historico=(alvo,alvo_id)=>db.prepare(
  'SELECT * FROM sm_preco_historico WHERE alvo=? AND alvo_id=? ORDER BY id DESC').all(alvo,alvo_id);

module.exports={listar,porId,porNome,criar,atualizar,vencidos,
  enderecos,endereco,enderecoPorApelido,criarEndereco,atualizarEndereco,apagarEndereco,tirarPadrao,
  contatos,contato,criarContato,atualizarContato,apagarContato,
  tabelas,tabela,gravarDescontoTabela,formasPagamento,formaPagamento,
  registrarPreco,historico};
