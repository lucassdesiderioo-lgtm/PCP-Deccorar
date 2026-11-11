// A LISTA DE MATERIAL DA FICHA DO SOB MEDIDA — spec FICHAS-NO-CADASTRO-UNICO
// (11/11/2026, decisao do dono; DECISOES.md). Dono unico de sm_ficha_material
// e de sm_pedido_material.
//
// As duas fichas tecnicas puxam do MESMO cadastro de material, o do PCP (tela
// 1101). A ficha deste modulo tem as PECAS (sm_ficha_linha: setor, etiqueta, o
// preco do adicional), e esta lista ao lado e o MATERIAL: o parafuso, a
// corrente, o que nao e peca de producao.
//
//   - a formula e a da ficha da 404 (formula.js do PCP, a UNICA porta que
//     avalia formula — sem eval), com largura e altura em CENTIMETROS;
//   - o `quando` e a mesma regua das pecas (o persiana.js passa o `entra`);
//   - o CUSTO soma esse material, pela conta da 404 (o melhor preco das
//     ofertas, pela porta). Sem preco, o custo e INDEFINIDO, nunca zero
//     (regra 4). O PRECO DE VENDA NAO MUDA por esta lista;
//   - a lista CONGELA na aprovacao (sm_pedido_material), como a ficha
//     explodida, e a embalagem baixa dela uma vez por peca.
//
// ⚠️ O MATERIAL NAO E O COMPONENTE. `sm_componente` continua sendo a peca de
// producao; esta lista nao mexe em etapa, setor, etiqueta nem liberacao.
const F=require('../../formula');
const {ErroDeRegra,exigir}=require('../nucleo/erros');
const db=require('../nucleo/db');
const materiais=require('../nucleo/materiais');
const PCP=require('../nucleo/material_pcp');
const dia=require('../nucleo/dia');

const QUANDOS=['sempre','bando','barra','sem_adicional','reducao',
  'com_comando','sem_comando','abertura_lateral','abertura_central'];

const listar=modelo_id=>db.prepare(
  'SELECT * FROM sm_ficha_material WHERE modelo_id=? ORDER BY ativo DESC, ordem, id').all(modelo_id);

function materialDoPcp(id){
  exigir(materiais.ligada(),'porta_de_materiais_nao_ligada',
    'A lista de materiais do PCP não está ligada neste servidor: não dá para apontar material agora.');
  const m=materiais.porId(id);
  exigir(m,'material_inexistente','O material '+id+' não existe no cadastro de material do PCP (tela 1101), ou está desativado.');
  exigir(m.vai_ficha!==0,'material_fora_da_ficha','"'+m.nome+'" não vai para a ficha técnica (é material de consumo da empresa). '+
    'Se ele vai, marque "vai para a ficha" no cadastro de material (1101).');
  return m;
}

/* A formula e conferida numa medida de exemplo: a que nao avalia (variavel
   que nao existe, divisao por zero) e recusada na hora, dizendo por que. */
function validarExpressao(expr){
  const e=String(expr==null?'':expr).trim();
  exigir(e,'formula_vazia','Escreva quanto a persiana gasta deste material (ex.: largura / 100, ou 4).');
  try{
    for(const [l,a] of [[100,100],[180,250],[40,60]]){
      const q=F.avaliar(e,{largura:l,altura:a});
      if(!Number.isFinite(q)) throw new Error('o resultado não é um número na medida '+l+' × '+a);
    }
  }catch(x){ throw new ErroDeRegra('formula_invalida','A fórmula não vale: '+x.message); }
  return e;
}
function validarQuando(q){
  const v=String(q==null||q===''?'sempre':q).trim();
  exigir(QUANDOS.includes(v),'quando_invalido','"Quando entra" tem que ser um destes: '+QUANDOS.join(', ')+'.');
  return v;
}

function criar(d){
  d=d||{};
  const modelo_id=Number(d.modelo_id);
  exigir(db.prepare('SELECT 1 FROM sm_modelo WHERE id=?').get(modelo_id),'modelo_inexistente','Produto não encontrado.');
  const m=materialDoPcp(Number(d.componente_pcp_id));
  const expressao=validarExpressao(d.expressao), quando=validarQuando(d.quando);
  const ordem=d.ordem!=null&&d.ordem!==''?Number(d.ordem):
    (db.prepare('SELECT COALESCE(MAX(ordem),0)+1 o FROM sm_ficha_material WHERE modelo_id=?').get(modelo_id).o);
  const r=db.prepare(`INSERT INTO sm_ficha_material(modelo_id,componente_pcp_id,nome,unidade,expressao,quando,ordem)
    VALUES(?,?,?,?,?,?,?)`).run(modelo_id,m.id,m.nome,m.unidade,expressao,quando,ordem);
  return db.prepare('SELECT * FROM sm_ficha_material WHERE id=?').get(r.lastInsertRowid);
}

/* Campo AUSENTE nao e campo vazio (#33): so o que veio muda. */
function editar(id,d){
  d=d||{};
  const l=db.prepare('SELECT * FROM sm_ficha_material WHERE id=?').get(Number(id));
  exigir(l,'linha_inexistente','Linha da lista de material não encontrada.');
  const tem=k=>Object.prototype.hasOwnProperty.call(d,k);
  const c={};
  if(tem('expressao')) c.expressao=validarExpressao(d.expressao);
  if(tem('quando')) c.quando=validarQuando(d.quando);
  if(tem('ordem')){ const o=Number(d.ordem); exigir(Number.isFinite(o),'ordem_invalida','A ordem tem que ser um número.'); c.ordem=o; }
  if(tem('ativo')) c.ativo=d.ativo?1:0;
  if(tem('componente_pcp_id')){ const m=materialDoPcp(Number(d.componente_pcp_id)); c.componente_pcp_id=m.id; c.nome=m.nome; c.unidade=m.unidade; }
  const k=Object.keys(c);
  if(k.length) db.prepare('UPDATE sm_ficha_material SET '+k.map(x=>x+'=?').join(', ')+' WHERE id=?').run(...k.map(x=>c[x]),l.id);
  return db.prepare('SELECT * FROM sm_ficha_material WHERE id=?').get(l.id);
}

/* O que UMA persiana gasta: a lista ativa, filtrada pelo `entra` do calculo
   (a mesma regua das pecas), avaliada em centimetros. A linha que nao avalia
   sai com `erro` e quantidade null — nunca zero. */
function calcular(modelo_id,largura_mm,altura_mm,entra){
  const vars={largura:largura_mm/10, altura:altura_mm/10};
  const out=[];
  for(const l of listar(modelo_id)){
    if(!l.ativo) continue;
    if(entra&&!entra(l.quando)) continue;
    let q=null, erro=null;
    try{ q=Math.round(F.avaliar(l.expressao,vars)*1000)/1000; }catch(e){ erro=e.message; }
    out.push({componente_pcp_id:l.componente_pcp_id, nome:l.nome, unidade:l.unidade, expressao:l.expressao,
      quando:l.quando, quantidade:q, erro});
  }
  return out;
}

/* O custo do material, pela conta da 404 (a porta). Os campos com `custo` no
   nome sao podados para quem nao tem custo.ver (a rota poda). Sem preco numa
   linha, o total e null e a linha e nomeada (regra 4). */
function custo(itens){
  const precos=PCP.custo(itens.map(i=>i.componente_pcp_id));
  const linhas=[], sem=[]; let total=0;
  for(const i of itens){
    const p=precos?precos[i.componente_pcp_id]:null;
    const v=(p!=null&&i.quantidade!=null)?Math.round(i.quantidade*p*100):null;
    if(v==null){ sem.push(i.nome||('material '+i.componente_pcp_id)); }
    else total+=v;
    linhas.push({nome:i.nome, quantidade:i.quantidade, unidade:i.unidade, custo_unitario:p, custo_centavos:v});
  }
  return {linhas, sem_custo:sem, custo_material_centavos:sem.length?null:total, custo_material_piso_centavos:total,
    sem_porta:precos==null};
}

/* Congela na aprovacao (chamado DENTRO da transacao do aprovar). */
function congelar(item_id,itens){
  db.prepare('DELETE FROM sm_pedido_material WHERE item_id=?').run(item_id);
  const ins=db.prepare('INSERT INTO sm_pedido_material(item_id,componente_pcp_id,nome,unidade,quantidade) VALUES(?,?,?,?,?)');
  for(const i of itens) if(i.quantidade!=null&&i.quantidade>0) ins.run(item_id,i.componente_pcp_id,i.nome,i.unidade,i.quantidade);
}

/* A BAIXA NA EMBALAGEM (fase 4). Chamada DEPOIS da transacao da bancada — o
   saldo e de outro banco, e a peca embalada nao pode ser desfeita porque o PCP
   tropecou (#6). Uma vez por peca: a que ja tem baixado_em nao baixa de novo
   (a embalada de novo depois de uma recusa). Falhou: fica escrito na linha e
   vira "material extra a decidir" do Supervisor. */
function baixarDaEmbalagem(item_id,usuario){
  const pend=db.prepare('SELECT * FROM sm_pedido_material WHERE item_id=? AND baixado_em IS NULL').all(item_id);
  if(!pend.length) return {baixados:[], ignorados:[], nada:true};
  const item=db.prepare(`SELECT i.n, p.numero, p.id pedido_id FROM sm_pedido_item i JOIN sm_pedido p ON p.id=i.pedido_id WHERE i.id=?`).get(item_id)||{};
  const ref='sm_item:'+item_id, desc='pedido '+(item.numero||item.pedido_id)+' · peça '+(item.n||'?');
  let r=null, falha=null;
  try{
    r=PCP.baixar({itens:pend.map(x=>({componente_id:x.componente_pcp_id, quantidade:x.quantidade})),
      referencia:ref, usuario_id:usuario&&usuario.id, usuario_nome:usuario&&usuario.nome});
  }catch(e){ falha=e.message; }
  const res=falha?('falhou: '+falha):('baixou '+r.baixados.length+', pela contagem '+r.ignorados.length);
  db.prepare('UPDATE sm_pedido_material SET baixado_em=?, baixa_resultado=? WHERE item_id=? AND baixado_em IS NULL')
    .run(dia.agora(),res,item_id);
  if(falha){
    try{ PCP.extra({origem:'falha_baixa', referencia:ref, descricao:desc, motivo:'a baixa pela ficha falhou: '+falha,
      sugestao:pend.map(x=>({componente_id:x.componente_pcp_id, nome:x.nome, unidade:x.unidade, quantidade:x.quantidade})),
      registrado_por:usuario&&usuario.nome, registrado_por_id:null}); }catch(e){ console.error('[ficha_material] material extra da falha:',e.message); }
    return {falha};
  }
  return r;
}

/* A peca RECUSADA vira "material extra a decidir" (§3-G): ela nao baixa
   sozinha, e o Supervisor diz se usou material. A sugestao e a lista
   congelada da persiana. Sem a porta, nao trava a recusa. */
function registrarRecusa(item_id,motivo,usuario){
  try{
    const item=db.prepare(`SELECT i.n, p.numero, p.id pedido_id FROM sm_pedido_item i JOIN sm_pedido p ON p.id=i.pedido_id WHERE i.id=?`).get(item_id)||{};
    const mats=db.prepare('SELECT * FROM sm_pedido_material WHERE item_id=?').all(item_id);
    return PCP.extra({referencia:'sm_item:'+item_id, descricao:'pedido '+(item.numero||item.pedido_id)+' · peça '+(item.n||'?'),
      motivo, sugestao:mats.map(x=>({componente_id:x.componente_pcp_id, nome:x.nome, unidade:x.unidade, quantidade:x.quantidade})),
      registrado_por:usuario&&usuario.nome, registrado_por_id:usuario&&usuario.id});
  }catch(e){ console.error('[ficha_material] material extra da recusa:',e.message); return null; }
}

/* Para o PCP: as linhas ativas com o nome do produto ("usado em" da 1101). */
const linhasParaPcp=()=>db.prepare(`SELECT f.componente_pcp_id componente_id, f.expressao, f.quando,
  m.nome produto, m.id produto_id FROM sm_ficha_material f JOIN sm_modelo m ON m.id=f.modelo_id
  WHERE f.ativo=1 ORDER BY m.nome, f.ordem, f.id`).all();

/* Para o PCP: o material das pecas embaladas (baixado_em) no periodo. */
const embaladoNoPeriodo=(desde,ate)=>db.prepare(`SELECT pm.componente_pcp_id componente_id, SUM(pm.quantidade) quantidade
  FROM sm_pedido_material pm JOIN sm_pedido_item i ON i.id=pm.item_id
  WHERE pm.baixado_em IS NOT NULL AND substr(pm.baixado_em,1,10) >= ? AND substr(pm.baixado_em,1,10) <= ?
    AND i.cancelado_em IS NULL
  GROUP BY pm.componente_pcp_id`).all(desde,ate);

/* Para o catalogo unico da 404 (fase 5): nome, ativo e quantas linhas de
   material — nada de preco. */
const produtosParaPcp=()=>db.prepare(`SELECT m.id, m.nome, m.ativo,
  (SELECT COUNT(*) FROM sm_ficha_material f WHERE f.modelo_id=m.id AND f.ativo=1) materiais
  FROM sm_modelo m ORDER BY m.ativo DESC, m.nome`).all();

module.exports={produtosParaPcp,QUANDOS,listar,criar,editar,calcular,custo,congelar,baixarDaEmbalagem,registrarRecusa,
  linhasParaPcp,embaladoNoPeriodo};
