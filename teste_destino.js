#!/usr/bin/env node
/* Testes do destino.js — para onde a pessoa vai (spec NAVEGACAO-E-LINGUAGEM,
 * fase 1).
 *
 *   node teste_destino.js
 *
 * O destino morava em duas copias (login.html e setor.html) e elas ja tinham
 * divergido: a do login nao reconhecia o vendedor nem a bancada do sob medida,
 * que voltavam para o login depois do PIN. Os ultimos casos varrem as telas e
 * recusam uma terceira copia.
 *
 * Nao toca no banco nem na rede.
 */
const fs=require('fs'), path=require('path');
const {destino}=require('./destino');

let ok=0, falhas=0;
const caso=(nome,fn)=>{ try{ fn(); console.log('ok      '+nome); ok++; }
                        catch(e){ console.log('FALHOU  '+nome+'\n        '+e.message); falhas++; } };
const igual=(veio,esperado,oque)=>{ if(JSON.stringify(veio)!==JSON.stringify(esperado))
  throw new Error((oque||'valor')+': esperava '+JSON.stringify(esperado)+', veio '+JSON.stringify(veio)); };
const ler=f=>fs.readFileSync(path.join(__dirname,f),'utf8');

console.log('\n── os perfis ─────────────────────────────────────────────────────────\n');

caso('SO MEDIDA PADRAO: vai direto, sem atalho para o sob medida', ()=>{
  const d=destino(['operador','montagem']);
  igual(d.padrao,'/operador','primeira tela'); igual(d.sobmedida,null,'sob medida');
  igual(d.duas,false,'duas'); igual(d.inicial,'/operador','depois do PIN');
});

caso('SO SOB MEDIDA (bancada do corte): vai direto, sem atalho', ()=>{
  const d=destino(['sobmedida']);
  igual(d.padrao,null,'padrao'); igual(d.sobmedida,'/sobmedida','sob medida');
  igual(d.duas,false,'duas'); igual(d.inicial,'/sobmedida','depois do PIN');
});

caso('O VENDEDOR so com sobmedida_venda entra no sob medida — a copia velha do login o mandava de volta ao login', ()=>{
  const d=destino(['sobmedida_venda']);
  igual(d.inicial,'/sobmedida','depois do PIN'); igual(d.duas,false,'duas');
});

caso('OS CINCO SETORES DA PRODUCAO contam como sob medida', ()=>{
  for(const a of ['sobmedida_serralheria','sobmedida_colecao','sobmedida_montagem','sobmedida_revisao','sobmedida_embalagem'])
    igual(destino([a]).inicial,'/sobmedida',a);
});

caso('AS DUAS OPERACOES: escolhe na /setor, e o atalho aparece', ()=>{
  const d=destino(['embalagem','sobmedida_venda']);
  igual(d.duas,true,'duas'); igual(d.inicial,'/setor','depois do PIN');
  igual(d.padrao,'/embalagem','atalho para a medida padrao'); igual(d.sobmedida,'/sobmedida','atalho para o sob medida');
});

caso('O ATALHO PARA A MEDIDA PADRAO NUNCA E O ADMIN para quem nao tem admin (o defeito do "← Medida padrao")', ()=>{
  igual(destino(['carregamento','sobmedida']).padrao,'/carregamento');
});

caso('ADMIN alcanca as duas: o portao do sob medida le admin como diretor', ()=>{
  const d=destino(['admin']);
  igual(d.duas,true,'duas'); igual(d.padrao,'/admin','padrao');
});

caso('A ORDEM DECIDE: admin antes de painel antes de operador', ()=>{
  igual(destino(['operador','painel']).padrao,'/painel');
  igual(destino(['operador','painel','admin']).padrao,'/admin');
});

caso('INVENTARIO e DEVOLUCAO tem destino (a /setor nao conhecia o inventario)', ()=>{
  igual(destino(['inventario']).inicial,'/inventario');
  igual(destino(['devolucao']).inicial,'/devolucao');
});

caso('AREA QUE SO PARECE sob medida nao conta (prefixo exato)', ()=>{
  igual(destino(['sobmedidaX']).sobmedida,null);
});

caso('SEM AREA NENHUMA: volta ao login, como sempre', ()=>{
  igual(destino([]).inicial,'/login'); igual(destino(undefined).inicial,'/login');
});

console.log('\n── um dono so ────────────────────────────────────────────────────────\n');

caso('O AUTH DEVOLVE o destino no /api/auth/eu e no login', ()=>{
  const s=ler('auth.js');
  if(!/require\('\.\/destino'\)/.test(s)) throw new Error('auth.js nao usa o destino.js');
  if(!/destino:destino\(u\.areas\)/.test(s)) throw new Error('/api/auth/eu sem destino');
  if(!/destino:destino\(areasU\)/.test(s)) throw new Error('login sem destino');
});

caso('LOGIN E /SETOR nao carregam lista propria de telas', ()=>{
  for(const f of ['public/login.html','public/setor.html']){
    const s=ler(f);
    if(/['"]?operador['"]?\s*:\s*['"]\/operador['"]/.test(s)) throw new Error(f+' tem copia da lista de telas');
  }
});

caso('AS DUAS BARRAS tem "Trocar setor" para /setor e leem o destino do servidor', ()=>{
  for(const f of ['public/nav.js','tecido/public/nav.js']){
    const s=ler(f);
    if(!/Trocar setor/.test(s)||!/['"]\/setor['"]/.test(s)) throw new Error(f+' sem "Trocar setor"');
    if(!/\.duas/.test(s)) throw new Error(f+' nao decide o atalho pelo destino.duas');
  }
});

caso('O SOB MEDIDA NAO TEM MAIS o "← Medida padrao" apontando para o admin', ()=>{
  const s=ler('tecido/public/nav.js');
  if(/v\.href\s*=\s*['"]\/['"]/.test(s)||/textContent\s*=\s*['"]← Medida/.test(s)) throw new Error('o link velho do rodape voltou');
});

console.log('\n'+ok+' ok, '+falhas+' falha(s)\n');
process.exit(falhas?1:0);
