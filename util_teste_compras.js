/* A BANCADA DE TESTE DAS FASES DA COMPRAS-E-RECEBIMENTO.
 *
 * NAO e teste (o nome nao comeca com `teste_`, entao o CI nao o roda sozinho):
 * e o que os `teste_*.js` das fases usam para subir o mesmo conjunto de rotas
 * do server.js, NA MESMA ORDEM, num banco temporario e numa porta livre.
 *
 * ⚠️ NAO sobe o server.js: a porta 3010 e fixa e, rodado no servidor, o teste
 * conversaria com a producao (a licao do teste_regras_estoque.js). Sobe um
 * Express proprio, com um "login" de mentira: o cabecalho `x-u` traz a pessoa
 * ({id, nome, permissoes}) que o auth.js poria em `req.usuario`.
 *
 * As permissoes DENTRO do handler (a poda do preco, quem aprova) perguntam ao
 * `app.locals.acesso.podePermissao`, como nas rotas de verdade. Aqui ele
 * responde pela lista do cabecalho; `admin_geral:true` passa em tudo, como no
 * acesso.js. Quem diz QUE ROTA pede QUE CHAVE continua sendo o permDaRota, e
 * isso e o teste_acesso.js / teste_cobertura.js que travam.
 */
const fs = require('fs'), os = require('os'), path = require('path');

function bancada(opcoes){
  opcoes = opcoes || {};
  const tmp = opcoes.reusar || fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-cmp-'));
  process.env.PCP_DIR = tmp;
  delete process.env.PCP_DB;
  const express = require('express');
  const db = require('./db');
  const app = express();
  app.use(express.json({ limit:'25mb' }));
  app.locals.acesso = {
    podePermissao(u, chave){ return !!u && (!!u.admin_geral || (u.permissoes || []).indexOf(chave) >= 0); },
    auditar(){}
  };
  app.use((req, res, next) => {
    const h = req.headers['x-u'];
    if(h){ try{ req.usuario = JSON.parse(h); }catch(e){} }
    next();
  });
  const mods = opcoes.modulos || [];
  for(const m of mods) require('./' + m)(app, db);
  const srv = app.listen(0);
  const porta = srv.address().port;

  async function chamar(metodo, rota, corpo, quem){
    const h = { 'Content-Type':'application/json' };
    if(quem !== null) h['x-u'] = JSON.stringify(quem || { id:1, nome:'Lucas', admin_geral:true });
    const r = await fetch('http://127.0.0.1:' + porta + rota, { method:metodo, headers:h,
      body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const tipo = r.headers.get('content-type') || '';
    const c = tipo.indexOf('json') >= 0 ? await r.json() : await r.text();
    return { status:r.status, corpo:c, tipo };
  }

  let casos = 0, falhas = 0;
  function ok(nome, cond, det){
    casos++;
    let v; try{ v = (typeof cond === 'function') ? cond() : cond; }catch(e){ v = false; det = () => 'estourou: ' + e.message; }
    if(v){ console.log('  ✓ ' + nome); }
    else{ falhas++; console.log('  ✗ ' + nome + (det ? '  — ' + (typeof det === 'function' ? det() : det) : '')); }
  }
  function fim(){
    console.log('');
    console.log(falhas ? ('FALHARAM ' + falhas + ' de ' + casos) : ('todos os ' + casos + ' casos passaram'));
    try{ srv.close(); }catch(e){}
    try{ db.close(); }catch(e){}
    try{ fs.rmSync(tmp, { recursive:true, force:true }); }catch(e){}
    process.exit(falhas ? 1 : 0);
  }
  const secao = t => console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(4, 60 - t.length)));
  return { db, app, chamar, ok, fim, secao, tmp,
    get:(r, q) => chamar('GET', r, undefined, q), post:(r, c, q) => chamar('POST', r, c, q),
    del:(r, q) => chamar('DELETE', r, undefined, q) };
}

/* A ORDEM do server.js para as rotas que as fases tocam (cad antes de compras). */
const MODULOS = ['cad_route', 'compras_route', 'ficha_route', 'pedido_route', 'receb_route'];

module.exports = { bancada, MODULOS };
