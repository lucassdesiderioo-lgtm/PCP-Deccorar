// Tabela 'armazem' — sao dois e so dois: ROLO e SOBRA. A chave e texto,
// nao id, porque ela e citada em regra ("rolo so endereca em ROLO") e um
// numero ali nao se leria.
const db=require('../nucleo/db');

const listar=()=>db.prepare('SELECT * FROM armazem ORDER BY ordem, chave').all();
const porChave=chave=>db.prepare('SELECT * FROM armazem WHERE chave=?').get(chave);

module.exports={listar,porChave};
