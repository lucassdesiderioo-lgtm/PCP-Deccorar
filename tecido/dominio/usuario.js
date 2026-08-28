// Pessoas e PINs. Fica no dominio porque as travas aqui sao regra, nao tela:
// PIN curto demais e o mesmo que PIN nenhum, e desligar a ultima pessoa com
// papel de diretor tranca o sistema para todo mundo, inclusive para quem
// poderia destravar.
const crypto=require('crypto');
const db=require('../nucleo/db');
const {ErroDeRegra,exigir}=require('../nucleo/erros');
const {PAPEIS}=require('../nucleo/permissoes');

const hash=(pin,salt)=>crypto.scryptSync(String(pin),salt,32).toString('hex');

const listar=()=>db.prepare('SELECT id,nome,papel,ativo,criado_em FROM usuario ORDER BY nome').all();
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
  exigir(dados.pin,'pin_obrigatorio','Defina um PIN de 4 digitos para a pessoa entrar.');
  if(db.prepare('SELECT id FROM usuario WHERE nome=?').get(nome))
    throw new ErroDeRegra('nome_repetido','Ja existe alguem cadastrado como "'+nome+'".');
  const salt=crypto.randomBytes(16).toString('hex');
  const r=db.prepare('INSERT INTO usuario(nome,salt,pin_hash,papel) VALUES(?,?,?,?)')
    .run(nome,salt,hash(dados.pin,salt),papel);
  return porId(r.lastInsertRowid);
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

module.exports={listar,porId,criar,atualizar};
