/* O MODO TESTE FOI APOSENTADO (11/11/2026): o POST /api/teste/ligar responde
 * 410. Mas um banco pode chegar ao deploy com ele LIGADO, e o "apagar" e o
 * "manter" continuam para encerrar esse. Os testes simulam esse estado com
 * isto — exatamente o que o ligar antigo gravava. NAO e teste (nao comeca com
 * `teste_`), e nenhum codigo de producao o usa.
 */
module.exports = function ligarComoAntes(db){
  const set = (k, v) => db.prepare("INSERT INTO config (chave,valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run(k, String(v));
  set('teste_snapshot', JSON.stringify(db.prepare('SELECT codigo,estoque,alvo FROM skus').all()));
  let c = '[]'; try{ c = JSON.stringify(db.prepare('SELECT id,estoque,custo_medio FROM componente').all()); }catch(e){}
  set('teste_snapshot_comp', c);
  set('teste_desde', new Date().toLocaleString('pt-BR'));
  set('modo_teste', '1');
};
