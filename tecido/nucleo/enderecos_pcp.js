// A PORTA DOS ENDERECOS DO PCP — spec COMPRAS-E-RECEBIMENTO, fase 10 (R-CMP-50).
//
// Decisao do dono, 07/11/2026: o PCP e dono do ENDERECO (almoxarifado -> haste
// -> andar -> nivel) de todos os materiais; este modulo continua dono do ROLO e
// da SOBRA, porque o corte grava rolo, sobra e plano numa transacao so. O
// `tecido.db` continua sem enxergar o `dados.db`: a lista de enderecos entra
// por esta porta, no desenho do `materiais.js`.
//
// ⚠️ AS TABELAS armazem/haste/andar/nivel DAQUI VIRAM ESPELHO. Depois da
// migracao (armazem.pcp_almox_id preenchido), quem escreve nelas e so este
// arquivo: `sincronizar` copia o que o PCP tem (nome e ativo; o que falta
// nasce com o `pcp_id`), e criar endereco pela bancada cria NO PCP primeiro e
// espelha aqui. Assim rolo, sobra, corte e "um rolo por nivel" continuam
// apontando `nivel_id` local — nada do corte mudou.
//
// ⚠️ SE A PORTA CAIR, O ENDERECO NAO SOME: o rolo e a sobra guardam o id e o
// nome do nivel do PCP (`nivel_pcp_id`, `nivel_pcp_nome`), e a tela diz que o
// endereco esta "sem atualizacao" — nunca lista vazia.
const db=require('./db');
const {ErroDeRegra}=require('./erros');

let porta=null;
const ligar=p=>{ porta=(p&&typeof p.niveis==='function')?p:null; };
const ligada=()=>!!porta;

const migrado=chave=>{
  const a=db.prepare('SELECT pcp_almox_id FROM armazem WHERE chave=?').get(chave);
  return !!(a&&a.pcp_almox_id);
};
const algumMigrado=()=>!!db.prepare('SELECT 1 FROM armazem WHERE pcp_almox_id IS NOT NULL').get();

/* Copia do PCP o que o armazem migrado tem. Nunca apaga linha local (rolo e
   sobra apontam): o nivel que sumiu do PCP so fica desativado. */
function sincronizar(){
  const arms=db.prepare('SELECT * FROM armazem WHERE pcp_almox_id IS NOT NULL').all();
  if(!arms.length) return {ok:true, migrado:false};
  if(!porta) return {ok:false, sem_atualizacao:true, motivo:'a lista de enderecos do PCP nao esta ligada neste servidor'};
  try{
    db.transaction(()=>{
      for(const a of arms){
        const t=porta.niveis(a.pcp_almox_id)||{};
        if(t.nome) db.prepare('UPDATE armazem SET pcp_nome=? WHERE chave=?').run(t.nome,a.chave);
        const hId={}, dId={};
        for(const h of (t.hastes||[])){
          let l=db.prepare('SELECT id FROM haste WHERE pcp_id=?').get(h.id);
          if(!l) l={id:db.prepare("INSERT INTO haste(armazem_chave,nome,ordem,ativo,pcp_id,criado_por,conferir) VALUES(?,?,0,?,?,'PCP',0)").run(a.chave,h.nome,h.ativo?1:0,h.id).lastInsertRowid};
          else db.prepare('UPDATE haste SET nome=?, ativo=? WHERE id=?').run(h.nome,h.ativo?1:0,l.id);
          hId[h.id]=l.id;
        }
        for(const d of (t.andares||[])){
          if(!hId[d.haste_id]) continue;
          let l=db.prepare('SELECT id FROM andar WHERE pcp_id=?').get(d.id);
          if(!l) l={id:db.prepare("INSERT INTO andar(haste_id,nome,ordem,ativo,pcp_id,criado_por,conferir) VALUES(?,?,0,?,?,'PCP',0)").run(hId[d.haste_id],d.nome,d.ativo?1:0,d.id).lastInsertRowid};
          else db.prepare('UPDATE andar SET nome=?, ativo=? WHERE id=?').run(d.nome,d.ativo?1:0,l.id);
          dId[d.id]=l.id;
        }
        for(const n of (t.niveis||[])){
          if(!dId[n.andar_id]) continue;
          const l=db.prepare('SELECT id FROM nivel WHERE pcp_id=?').get(n.id);
          if(!l) db.prepare("INSERT INTO nivel(andar_id,nome,ordem,ativo,pcp_id,criado_por,conferir) VALUES(?,?,0,?,?,'PCP',0)").run(dId[n.andar_id],n.nome,n.ativo?1:0,n.id);
          else db.prepare('UPDATE nivel SET nome=?, ativo=? WHERE id=?').run(n.nome,n.ativo?1:0,l.id);
        }
      }
    })();
    return {ok:true, migrado:true};
  }catch(e){
    return {ok:false, sem_atualizacao:true, motivo:'o PCP nao respondeu ('+(e&&e.message)+')'};
  }
}

/* Criar endereco pela bancada (R-SME-01 continua: o buraco novo aparece com o
   tubo na mao) — mas NO PCP, que e o dono, e depois o espelho. */
function criarNoPcp(armazem_chave, haste, andar, nivel){
  if(!porta||typeof porta.criar!=='function')
    throw new ErroDeRegra('enderecos_pcp_fora','O endereco agora e do PCP, e a ligacao com ele nao esta de pe neste servidor. Avise o suporte.');
  const a=db.prepare('SELECT pcp_almox_id FROM armazem WHERE chave=?').get(armazem_chave);
  porta.criar({almoxarifado_id:a.pcp_almox_id, haste, andar, nivel});
  sincronizar();
}

/* O nivel do PCP esta ocupado por um VOLUME do PCP (um rolo do ML, uma
   caixa)? Para o "cada nivel guarda um so" valer entre os dois lados. */
function ocupadoNoPcp(nivel_id){
  if(!porta||typeof porta.ocupado!=='function') return null;
  const n=db.prepare('SELECT pcp_id FROM nivel WHERE id=?').get(nivel_id);
  if(!n||!n.pcp_id) return null;
  try{ return porta.ocupado(n.pcp_id)||null; }catch(e){ return null; }
}

module.exports={ligar,ligada,migrado,algumMigrado,sincronizar,criarNoPcp,ocupadoNoPcp};
