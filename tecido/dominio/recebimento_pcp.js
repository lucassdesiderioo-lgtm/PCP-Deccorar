// O ROLO QUE NASCE PELO RECEBIMENTO DO PCP — spec COMPRAS-E-RECEBIMENTO, fase 9
// (R-CMP-11, R-CMP-49).
//
// Compra e recebimento de tecido do sob medida passam pela 501 e pela 502 do
// PCP. O recebimento la CRIA o rolo aqui, pela porta, ja com o fornecedor, a
// nota e o preco por m². O `tecido.db` continua sem enxergar o `dados.db`: o
// PCP chama esta funcao (devolvida pelo montar()), e o rolo nasce pelo MESMO
// `rolo.entrada` de sempre — dono unico do saldo do rolo.
//
// ⚠️ O FORNECEDOR E O DO PCP (R-CMP-11): o cadastro de la e o unico. Aqui a
// tabela `fornecedor` vira o espelho que o rolo, o custo e os relatorios deste
// modulo ja leem: acha-se pelo `fornecedor_pcp_id`; senao pelo nome (o
// fornecedor que ja existia e ganha o vinculo); senao nasce, ja conferido e
// vinculado. Nunca dois fornecedores para o mesmo do PCP.
//
// ⚠️ A ENTRADA DE ROLO DESTA TELA ESTA APOSENTADA (R-CMP-49/50): rolo novo so
// nasce por aqui. A rota antiga recusa dizendo o caminho.
const db=require('../nucleo/db');
const {exigir}=require('../nucleo/erros');
const rolo=require('./rolo');
const dTecido=require('../dados/tecido');

function espelharFornecedor(f){
  if(!f||f.id==null) return null;
  const pcp=+f.id, nome=String(f.nome||'').trim();
  let r=db.prepare('SELECT id FROM fornecedor WHERE fornecedor_pcp_id=?').get(pcp);
  if(r) return r.id;
  if(nome){
    r=db.prepare('SELECT id FROM fornecedor WHERE nome=? COLLATE NOCASE').get(nome);
    if(r){ db.prepare('UPDATE fornecedor SET fornecedor_pcp_id=?, ativo=1 WHERE id=?').run(pcp,r.id); return r.id; }
  }
  exigir(nome,'fornecedor_sem_nome','O fornecedor do PCP veio sem nome.');
  return db.prepare("INSERT INTO fornecedor(nome,ativo,conferir,fornecedor_pcp_id,criado_por) VALUES(?,1,0,?,'recebimento do PCP')")
    .run(nome,pcp).lastInsertRowid;
}

/* a = { tecido_id, largura (m), volumes:[{metragem}], nf, fornecedor:{id,nome},
         preco_m2, usuario_nome } — devolve os rolos criados. TUDO numa
   transacao: um recebimento de tres rolos nao vira dois. */
function criarRolos(a){
  const t=dTecido.porId(a.tecido_id);
  exigir(t,'tecido_inexistente','O tecido do sob medida '+a.tecido_id+' nao existe.');
  exigir(Array.isArray(a.volumes)&&a.volumes.length,'sem_volume','O recebimento nao trouxe rolo nenhum.');
  return db.transaction(()=>{
    const fid=espelharFornecedor(a.fornecedor);
    const preco=a.preco_m2>0?Math.round(a.preco_m2*1e6)/1e6:null;
    return a.volumes.map(v=>{
      const r=rolo.entrada({tecido_id:t.id,largura:a.largura,metragem:v.metragem,nf:a.nf||null,
        fornecedor_id:fid,fornecedor:a.fornecedor&&a.fornecedor.nome||null,preco_m2:preco},
        (a.usuario_nome||'recebimento')+' (recebimento do PCP)');
      if(a.fornecedor&&a.fornecedor.id!=null) db.prepare('UPDATE rolo SET fornecedor_pcp_id=? WHERE id=?').run(+a.fornecedor.id,r.id);
      return {id:r.id,codigo:r.codigo,metragem:r.metragem_inicial};
    });
  })();
}

/* A lista de tecidos para o cadastro de material do PCP apontar (id e nome,
   so isso). */
const tecidos=()=>dTecido.ativos().map(t=>({id:t.id,codigo:t.codigo,nome:[t.linha_nome,t.abertura_nome,t.cor_nome].join(' · ')}));

module.exports={criarRolos,espelharFornecedor,tecidos};
