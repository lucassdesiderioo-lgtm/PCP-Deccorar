// Pessoas e PINs. Fica no dominio porque as travas aqui sao regra, nao tela:
// PIN curto demais e o mesmo que PIN nenhum, e desligar a ultima pessoa com
// papel de diretor tranca o sistema para todo mundo, inclusive para quem
// poderia destravar.
const crypto=require('crypto');
const db=require('../nucleo/db');
const {ErroDeRegra,exigir}=require('../nucleo/erros');
const {PAPEIS}=require('../nucleo/permissoes');
const pcp=require('../nucleo/pcp');

const hash=(pin,salt)=>crypto.scryptSync(String(pin),salt,32).toString('hex');

const listar=()=>db.prepare(
  'SELECT id,nome,papel,ativo,pcp_id,criado_em,(pin_hash<>\'\') AS tem_pin FROM usuario ORDER BY nome').all();
const porId=id=>db.prepare('SELECT id,nome,papel,ativo FROM usuario WHERE id=?').get(id);

function validar(nome,pin,papel){
  exigir(String(nome||'').trim(),'nome_vazio','Informe o nome da pessoa.');
  exigir(PAPEIS[papel],'papel_invalido','Papel invalido. Use diretor ou cortador.');
  if(pin!==undefined&&pin!==null&&pin!=='')
    exigir(/^\d{4,8}$/.test(String(pin)),'pin_invalido','O PIN e de 4 a 8 digitos, so numeros.');
}

function criar(dados){
  const nome=String(dados.nome||'').trim();
  const papel=dados.papel||'cortador';
  validar(nome,dados.pin,papel);
  // PIN so e obrigatorio para quem NAO vem do PCP. Quem vem de la ja tem
  // credencial; duplicar a senha seria duplicar o problema que o login unico
  // veio resolver.
  exigir(dados.pin||dados.pcp_id,'pin_obrigatorio',
    'Defina um PIN de 4 digitos, ou libere a pessoa a partir do cadastro do PCP.');
  if(db.prepare('SELECT id FROM usuario WHERE nome=?').get(nome))
    throw new ErroDeRegra('nome_repetido','Ja existe alguem cadastrado como "'+nome+'".');
  const salt=crypto.randomBytes(16).toString('hex');
  const r=db.prepare('INSERT INTO usuario(nome,salt,pin_hash,papel,pcp_id) VALUES(?,?,?,?,?)')
    .run(nome,salt,dados.pin?hash(dados.pin,salt):'',papel,dados.pcp_id||null);
  return porId(r.lastInsertRowid);
}

// ── LIBERAR UMA PESSOA DO PCP ────────────────────────────────────────────
// Nao cria credencial nenhuma: so diz que aquela pessoa do PCP pode usar
// este modulo, e com que papel.
function liberarDoPcp(dados){
  const pcp_id=Number(dados.pcp_id);
  exigir(pcp_id>0,'pcp_id_invalido','Escolha a pessoa na lista do PCP.');
  const papel=dados.papel||'cortador';
  exigir(PAPEIS[papel],'papel_invalido','Papel invalido.');
  const nome=String(dados.nome||'').trim();
  exigir(nome,'nome_vazio','Nome da pessoa nao veio do PCP.');

  const ja=db.prepare('SELECT id FROM usuario WHERE pcp_id=?').get(pcp_id);
  if(ja) return atualizar(ja.id,{papel,ativo:1});

  // Mesmo nome ja cadastrado com PIN proprio: vincula em vez de duplicar,
  // senao a mesma pessoa apareceria duas vezes na lista de acessos.
  const mesmoNome=db.prepare('SELECT id FROM usuario WHERE nome=? AND pcp_id IS NULL').get(nome);
  if(mesmoNome){
    db.prepare('UPDATE usuario SET pcp_id=?, papel=?, ativo=1 WHERE id=?').run(pcp_id,papel,mesmoNome.id);
    return porId(mesmoNome.id);
  }
  return criar({nome,papel,pcp_id});
}

// A lista que a tela de acessos mostra: todo mundo do PCP, com a marca de
// quem ja esta liberado aqui.
async function doPcp(){
  const gente=await pcp.pessoas();
  const aqui=new Map(listar().filter(u=>u.pcp_id).map(u=>[u.pcp_id,u]));
  return gente.map(p=>{
    const u=aqui.get(p.id);
    return {pcp_id:p.id, nome:p.nome,
      liberado:!!u&&!!u.ativo, papel:u?u.papel:null, usuario_id:u?u.id:null};
  });
}

// Trava: nunca deixar o sistema sem UM diretor ativo. Sem ela, um clique
// desatento tira de todo mundo o acesso que so um diretor pode devolver.
function sobraDiretor(idQueSai){
  return db.prepare("SELECT COUNT(*) c FROM usuario WHERE ativo=1 AND papel='diretor' AND id!=?").get(idQueSai).c>0;
}

function atualizar(id,dados){
  const u=porId(id);
  exigir(u,'usuario_inexistente','Pessoa nao encontrada.');
  const papel=dados.papel||u.papel;
  validar(dados.nome||u.nome,dados.pin,papel);

  const saindoDoPosto=(u.papel==='diretor')&&(papel!=='diretor'||dados.ativo===0||dados.ativo===false);
  if(saindoDoPosto&&!sobraDiretor(id))
    throw new ErroDeRegra('ultimo_diretor',
      'Esta e a unica pessoa com papel de diretor. De esse papel a outra pessoa antes de mudar esta.');

  if(dados.nome) db.prepare('UPDATE usuario SET nome=? WHERE id=?').run(String(dados.nome).trim(),id);
  if(dados.papel) db.prepare('UPDATE usuario SET papel=? WHERE id=?').run(papel,id);
  if(dados.ativo!==undefined) db.prepare('UPDATE usuario SET ativo=? WHERE id=?').run(dados.ativo?1:0,id);
  if(dados.pin){
    const salt=crypto.randomBytes(16).toString('hex');
    db.prepare('UPDATE usuario SET salt=?,pin_hash=? WHERE id=?').run(salt,hash(dados.pin,salt),id);
  }
  return porId(id);
}

module.exports={listar,porId,criar,atualizar,liberarDoPcp,doPcp,
  loginUnicoLigado:()=>pcp.ligado()};
