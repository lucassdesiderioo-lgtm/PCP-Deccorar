// Fabrica de acesso a uma tabela de cadastro simples (nome + ordem + ativo,
// opcionalmente pendurada num pai).
//
// Cada tabela continua tendo o SEU arquivo em dados/ — e la que se ve o nome
// da tabela e a coluna do pai. O que mora aqui e so o SQL repetido: seis
// copias do mesmo SELECT nao ensinam nada a ninguem e envelhecem separadas.
const db=require('../nucleo/db');

/* `extras` sao colunas que SO algumas destas tabelas tem (hoje: quem criou e
   se falta conferir). Elas entram no INSERT apenas quando o chamador manda
   valor — sem isso, um `criado_por` num INSERT de `cor`, que nao tem a coluna,
   derrubaria o cadastro inteiro. */
module.exports=function lista({tabela, pai, extras}){
  const colPai=pai||null;
  const opcionais=extras||[];

  const sel = colPai
    ? db.prepare('SELECT * FROM '+tabela+' WHERE '+colPai+'=? ORDER BY ordem, nome')
    : db.prepare('SELECT * FROM '+tabela+' ORDER BY ordem, nome');
  const selAtivos = colPai
    ? db.prepare('SELECT * FROM '+tabela+' WHERE '+colPai+'=? AND ativo=1 ORDER BY ordem, nome')
    : db.prepare('SELECT * FROM '+tabela+' WHERE ativo=1 ORDER BY ordem, nome');
  const porId=db.prepare('SELECT * FROM '+tabela+' WHERE id=?');

  return {
    tabela,
    listar:(paiId)=>colPai?sel.all(paiId):sel.all(),
    ativos:(paiId)=>colPai?selAtivos.all(paiId):selAtivos.all(),
    porId:id=>porId.get(id),
    criar(dados){
      const usados=opcionais.filter(c=>dados[c]!==undefined);
      const cols=['nome','ordem','ativo'].concat(colPai?[colPai]:[]).concat(usados);
      const vals=[dados.nome, dados.ordem||0, dados.ativo===0?0:1]
        .concat(colPai?[dados[colPai]]:[]).concat(usados.map(c=>dados[c]));
      const r=db.prepare('INSERT INTO '+tabela+'('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+')').run(...vals);
      return porId.get(r.lastInsertRowid);
    },
    atualizar(id,dados){
      const campos=[], vals=[];
      if(dados.nome!==undefined){ campos.push('nome=?'); vals.push(dados.nome); }
      if(dados.ordem!==undefined){ campos.push('ordem=?'); vals.push(dados.ordem); }
      if(dados.ativo!==undefined){ campos.push('ativo=?'); vals.push(dados.ativo?1:0); }
      if(!campos.length) return porId.get(id);
      db.prepare('UPDATE '+tabela+' SET '+campos.join(', ')+' WHERE id=?').run(...vals,id);
      return porId.get(id);
    },
    // Cadastro nao se apaga: ele se desativa. Apagar quebraria as linhas de
    // historico que apontam para ele.
    desativar(id){ db.prepare('UPDATE '+tabela+' SET ativo=0 WHERE id=?').run(id); return porId.get(id); }
  };
};
