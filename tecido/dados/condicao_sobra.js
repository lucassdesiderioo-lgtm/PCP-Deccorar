// Tabela 'condicao_sobra' — integra, mancha, furo, tom fora, borda desfiada.
//
// Duas colunas fazem trabalho de verdade, e nao sao enfeite de cadastro:
//   aproveitavel = 0  tira a sobra das candidatas do plano
//   prioridade        ordena as candidatas: integra primeiro, defeito por ultimo
// E assim que "sobra com defeito parcial entra, mas por ultimo" vira regra
// viva em vez de comentario.
const db=require('../nucleo/db');

const listar=()=>db.prepare('SELECT * FROM condicao_sobra ORDER BY ordem, nome').all();
const ativas=()=>db.prepare('SELECT * FROM condicao_sobra WHERE ativo=1 ORDER BY ordem, nome').all();
const porChave=chave=>db.prepare('SELECT * FROM condicao_sobra WHERE chave=?').get(chave);

function atualizar(chave,d){
  const campos=[], vals=[];
  if(d.nome!==undefined){ campos.push('nome=?'); vals.push(d.nome); }
  if(d.aproveitavel!==undefined){ campos.push('aproveitavel=?'); vals.push(d.aproveitavel?1:0); }
  if(d.prioridade!==undefined){ campos.push('prioridade=?'); vals.push(Number(d.prioridade)||0); }
  if(d.ativo!==undefined){ campos.push('ativo=?'); vals.push(d.ativo?1:0); }
  if(campos.length) db.prepare('UPDATE condicao_sobra SET '+campos.join(', ')+' WHERE chave=?').run(...vals,chave);
  return porChave(chave);
}

module.exports={listar,ativas,porChave,atualizar};
