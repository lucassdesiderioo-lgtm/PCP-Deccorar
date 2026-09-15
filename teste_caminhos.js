#!/usr/bin/env node
/* Testes do caminhos.js — onde os dados moram.
 *
 *   node teste_caminhos.js
 *
 * O caso que mais vale aqui e o ULTIMO: ele varre os .js do projeto e recusa
 * `/opt/expedicao` escrito em codigo fora do caminhos.js. Sem ele esta
 * arrumacao dura ate o proximo script, porque o jeito de escrever um script
 * novo e copiar o de cima — e o de cima trazia o caminho colado.
 *
 * Nao toca no banco nem na rede.
 */
const fs=require('fs'), path=require('path');

let ok=0, falhas=0;
const caso=(nome,fn)=>{ try{ fn(); console.log('ok      '+nome); ok++; }
                        catch(e){ console.log('FALHOU  '+nome+'\n        '+e.message); falhas++; } };
const igual=(veio,esperado,oque)=>{ if(veio!==esperado)
  throw new Error((oque||'valor')+': esperava '+JSON.stringify(esperado)+', veio '+JSON.stringify(veio)); };

/* O modulo le `process.env` no require, entao cada caso precisa dele fresco —
   com o cache do require, o segundo caso leria a resposta do primeiro. */
function comAmbiente(vars){
  const antes={};
  for(const k of ['PCP_DIR','PCP_DB','PCP_LOTES','PCP_COLETAS_DIR','PCP_BACKUPS']){
    antes[k]=process.env[k];
    if(vars[k]===undefined) delete process.env[k]; else process.env[k]=vars[k];
  }
  delete require.cache[require.resolve('./caminhos')];
  const c=require('./caminhos');
  for(const k in antes){ if(antes[k]===undefined) delete process.env[k]; else process.env[k]=antes[k]; }
  delete require.cache[require.resolve('./caminhos')];
  return c;
}

console.log('\n── o padrao, que e o que a producao usa ─────────────────────────────\n');

caso('SEM VARIAVEL NENHUMA o caminho e o de sempre', ()=>{
  const c=comAmbiente({});
  igual(c.BASE,'/opt/expedicao','a base');
  igual(c.BANCO,'/opt/expedicao/dados.db','o banco');
  igual(c.LOTES,'/opt/expedicao/lotes','os PDFs do ML');
  igual(c.COLETAS,'/opt/expedicao/coletas','as fotos da coleta');
  igual(c.BACKUPS,'/opt/expedicao/backups','os backups');
  /* ⚠️ ESTE E O CASO QUE PROTEGE A PRODUCAO. O deploy e `git pull && pm2
     restart` — ninguem edita variavel de ambiente no servidor. Se o padrao
     mudasse, o proximo pull apontaria para um banco VAZIO e o sintoma seria o
     pior possivel: o sistema sobe, as telas abrem, e o estoque "sumiu". */
});

console.log('\n── e o caminho que se move ─────────────────────────────────────────\n');

caso('PCP_DIR move as quatro coisas de uma vez', ()=>{
  const c=comAmbiente({PCP_DIR:'/tmp/pcp-teste'});
  igual(c.BANCO,'/tmp/pcp-teste/dados.db','banco');
  igual(c.LOTES,'/tmp/pcp-teste/lotes','lotes');
  igual(c.COLETAS,'/tmp/pcp-teste/coletas','coletas');
  igual(c.BACKUPS,'/tmp/pcp-teste/backups','backups');
  // Uma variavel so: quem quer rodar noutro lugar nao precisa saber que
  // existem quatro pastas.
});

caso('a variavel ESPECIFICA ganha da geral', ()=>{
  const c=comAmbiente({PCP_DIR:'/tmp/pcp-teste', PCP_DB:'/outro/lugar/dados.db'});
  igual(c.BANCO,'/outro/lugar/dados.db','o PCP_DB manda no banco');
  igual(c.LOTES,'/tmp/pcp-teste/lotes','e o resto segue o PCP_DIR');
  /* Se fosse ao contrario, o PCP_DIR de um teste sequestraria o PCP_DB que
     alguem passou de proposito, e o script gravaria no banco errado calado. */
});

caso('os nomes que treze scripts JA liam continuam valendo', ()=>{
  igual(comAmbiente({PCP_DB:'/x/d.db'}).BANCO,'/x/d.db','PCP_DB');
  igual(comAmbiente({PCP_LOTES:'/x/l'}).LOTES,'/x/l','PCP_LOTES');
  igual(comAmbiente({PCP_COLETAS_DIR:'/x/c'}).COLETAS,'/x/c','PCP_COLETAS_DIR');
  /* Nomes novos aqui criariam DUAS reguas para a mesma pergunta — as duas
     "certas", cada uma na sua (armadilha #12). */
});

console.log('\n── a regra que impede o literal de voltar ───────────────────────────\n');

caso('NENHUM .js escreve /opt/expedicao em codigo, fora o caminhos.js', ()=>{
  /* A regra so vale para o literal EM CODIGO — uma string que comeca no
     caminho. Comentario e texto de ajuda podem citar `/opt/expedicao` a
     vontade: eles explicam onde a coisa fica no servidor, e proibir a
     explicacao junto com o codigo seria trocar um problema por outro. */
  const emCodigo=/['"`]\/opt\/expedicao/;
  /* DOIS arquivos podem escrever o caminho, e os dois pelo mesmo motivo: sao
     os que RESPONDEM qual ele e. O `caminhos.js` guarda o padrao; este teste
     confere o padrao, e para conferir precisa dizer qual e o valor esperado —
     um teste que perguntasse ao proprio modulo qual e o padrao aprovaria
     qualquer resposta, inclusive a errada no dia em que alguem trocasse. */
  const donos=['caminhos.js','teste_caminhos.js'].map(f=>path.resolve(__dirname,f));
  const achados=[];
  const varrer=dir=>{
    for(const nome of fs.readdirSync(dir)){
      if(nome==='node_modules'||nome==='.git'||nome==='backups'||nome==='lotes') continue;
      const p=path.join(dir,nome);
      const st=fs.statSync(p);
      if(st.isDirectory()){ varrer(p); continue; }
      if(!nome.endsWith('.js')) continue;
      if(donos.includes(path.resolve(p))) continue;
      fs.readFileSync(p,'utf8').split('\n').forEach((linha,i)=>{
        if(emCodigo.test(linha)) achados.push(path.relative(__dirname,p)+':'+(i+1));
      });
    }
  };
  varrer(__dirname);
  igual(achados.length,0,'arquivos com o caminho colado: '+achados.join(', '));
  /* Este e o caso que faz a arrumacao durar. Script novo se escreve copiando o
     de cima, e ate hoje o de cima trazia `/opt/expedicao` dentro. Com este
     caso, a copia quebra o teste em vez de espalhar o problema. */
});

caso('e o caminhos.js e mesmo o unico que sabe o caminho', ()=>{
  const fonte=fs.readFileSync(path.join(__dirname,'caminhos.js'),'utf8');
  igual(/['"]\/opt\/expedicao['"]/.test(fonte),true,
    'o padrao esta escrito la, uma vez, como string');
});

console.log('');
if(falhas){ console.log(falhas+' de '+(ok+falhas)+' casos FALHARAM'); process.exit(1); }
console.log('todos os '+ok+' casos passaram');
