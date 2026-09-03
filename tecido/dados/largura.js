// Tabela 'largura_bobina' — as larguras de rolo que a fabrica compra.
//
// Nao usa o dados/_lista porque ali a chave e `nome`, texto. Aqui a chave e um
// NUMERO, e tratar numero como texto e exatamente o defeito que este cadastro
// veio resolver: '2,5' e '2,50' sao o mesmo rolo e seriam duas linhas.
const db=require('../nucleo/db');

// Milimetro e o limite util: bobina nao se mede em decimo de milimetro, e
// arredondar aqui e o que garante que 2,5 e 2,50 caiam na MESMA linha.
const arred=v=>Math.round(Number(v)*1000)/1000;

const listar=()=>db.prepare('SELECT * FROM largura_bobina ORDER BY valor').all();
const ativos=()=>db.prepare('SELECT * FROM largura_bobina WHERE ativo=1 ORDER BY valor').all();
const porId=id=>db.prepare('SELECT * FROM largura_bobina WHERE id=?').get(id);
const porValor=v=>db.prepare('SELECT * FROM largura_bobina WHERE ROUND(valor,3)=?').get(arred(v));

// `quem` = {criado_por, conferir}. Vem preenchido quando a largura nasceu na
// bancada, no meio de uma entrada de rolo, e por isso ainda falta a chefia
// olhar. Vazio quando a propria chefia cadastrou pela tela.
function criar(valor,quem){
  const q=quem||{};
  const r=db.prepare('INSERT INTO largura_bobina(valor,criado_por,conferir) VALUES(?,?,?)')
    .run(arred(valor), q.criado_por||null, q.conferir?1:0);
  return porId(r.lastInsertRowid);
}

// Cadastro nao se apaga: desativa. Apagar quebraria a leitura de qualquer
// rolo antigo que tenha essa largura.
function ativar(id,ativo){
  db.prepare('UPDATE largura_bobina SET ativo=? WHERE id=?').run(ativo?1:0,id);
  return porId(id);
}

// Quantos rolos EM USO tem esta largura. E o que impede desativar uma largura
// que ainda descreve a prateleira.
const rolosCom=valor=>db.prepare(
  "SELECT COUNT(*) c FROM rolo WHERE status<>'encerrado' AND ROUND(largura,3)=?").get(arred(valor)).c;

module.exports={listar,ativos,porId,porValor,criar,ativar,rolosCom,arred};
