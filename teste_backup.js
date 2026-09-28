#!/usr/bin/env node
/* Testes do backup.js — a rede de protecao dos DOIS bancos.
 *
 *   node teste_backup.js
 *
 * Ate 28/09/2026 o backup diario das 23:30 copiava so o `dados.db`. O
 * `tecido.db` — pedidos da revenda, boletos, bipes da bancada, o catalogo
 * inteiro do sob medida — nunca foi levado. As unicas copias dele eram as de
 * "antes de" que o `limpar_sobras.js` e o `backfill_etiquetas.js` fazem a mao,
 * quando alguem lembra de rodar um deles.
 *
 * O modo de falhar era o pior que existe: nada dava erro. O cron rodava, a
 * saida dizia "backup ok", trinta copias se acumulavam na pasta — e metade do
 * sistema estava de fora. So se descobre no dia em que o banco se perde, que e
 * o unico dia em que nao da para consertar.
 *
 * ⚠️ ESTE ARQUIVO FOI ESCRITO ANTES DO CONSERTO (§0, risco 🔴), e cada caso
 * foi conferido reintroduzindo o defeito que ele existe para pegar.
 *
 * Nao toca em banco nenhum de trabalho: cada caso monta os seus num diretorio
 * temporario e aponta o script para la por variavel de ambiente.
 */
const fs=require('fs'), os=require('os'), path=require('path');
const {spawnSync}=require('child_process');
const Database=require('better-sqlite3');

let ok=0, falhas=0;
const caso=(nome,fn)=>{ try{ fn(); console.log('ok      '+nome); ok++; }
                        catch(e){ console.log('FALHOU  '+nome+'\n        '+e.message); falhas++; } };
const igual=(veio,esperado,oque)=>{ if(veio!==esperado)
  throw new Error((oque||'valor')+': esperava '+JSON.stringify(esperado)+', veio '+JSON.stringify(veio)); };
const verdade=(x,oque)=>{ if(!x) throw new Error(oque||'esperava verdadeiro'); };
const contem=(texto,pedaco,oque)=>{ if(!String(texto).includes(pedaco))
  throw new Error((oque||'a saida')+' devia falar de '+JSON.stringify(pedaco)+', e veio:\n        '+String(texto).trim()); };

/* A MESMA conta de data do backup.js. Escrita aqui a mao de proposito: um
   teste que importasse a funcao do script aprovaria qualquer data, inclusive a
   errada no dia em que alguem trocasse — e a data e o nome do arquivo. */
const hoje=()=>{ const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };

let seq=0;
function pasta(){
  const p=fs.mkdtempSync(path.join(os.tmpdir(),'pcp-backup-'+(seq++)+'-'));
  return p;
}

/* Um banco de verdade, com WAL ligado e SEM checkpoint: e assim que os dois
   bancos vivem no servidor, e e por isso que `cp` nao serve — o arquivo .db
   fica com poucos KB e os dados ficam no -wal (§12). */
function bancoComWal(arquivo, tabela, quantas){
  const db=new Database(arquivo);
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE '+tabela+' (id INTEGER PRIMARY KEY, texto TEXT)');
  const ins=db.prepare('INSERT INTO '+tabela+' (texto) VALUES (?)');
  for(let i=0;i<quantas;i++) ins.run('linha '+i);
  db.close();   // fecha sem checkpoint forcado; o -wal pode continuar la
  return arquivo;
}

function contar(arquivo, tabela){
  const db=new Database(arquivo,{readonly:true});
  try{ return db.prepare('SELECT COUNT(*) c FROM '+tabela).get().c; }
  finally{ db.close(); }
}

function rodar(extra){
  const env=Object.assign({},process.env,extra);
  // As variaveis do PCP sao apagadas do ambiente herdado para o caso nao
  // depender da maquina de quem roda.
  for(const k of ['PCP_DIR','PCP_DB','PCP_BACKUPS','PCP_LOTES','PCP_COLETAS_DIR','BANCO_TECIDO'])
    if(!(k in extra)) delete env[k];
  return spawnSync(process.execPath,[path.join(__dirname,'backup.js')],
                   {env, cwd:__dirname, encoding:'utf8'});
}

console.log('\n── os dois bancos ──────────────────────────────────────────────────\n');

caso('copia o dados.db E o tecido.db, na pasta de backups', ()=>{
  const dir=pasta();
  const pcp=path.join(dir,'dados.db'), tec=path.join(dir,'tecido.db'), back=path.join(dir,'backups');
  bancoComWal(pcp,'skus',3);
  bancoComWal(tec,'sm_pedido',2);
  const r=rodar({PCP_DB:pcp, PCP_BACKUPS:back, BANCO_TECIDO:tec});
  igual(r.status,0,'o script saiu com '+r.status+' — '+(r.stderr||'').trim());
  verdade(fs.existsSync(path.join(back,'dados-'+hoje()+'.db')),'falta o backup do dados.db');
  verdade(fs.existsSync(path.join(back,'tecido-'+hoje()+'.db')),
    'falta o backup do tecido.db — e ele e metade do sistema (pedidos, boletos, bipes)');
});

caso('a copia do tecido tem os DADOS dentro, nao so o cabecalho', ()=>{
  const dir=pasta();
  const pcp=path.join(dir,'dados.db'), tec=path.join(dir,'tecido.db'), back=path.join(dir,'backups');
  bancoComWal(pcp,'skus',1);
  bancoComWal(tec,'sm_pedido',7);
  const r=rodar({PCP_DB:pcp, PCP_BACKUPS:back, BANCO_TECIDO:tec});
  igual(r.status,0,'saiu com '+r.status);
  igual(contar(path.join(back,'tecido-'+hoje()+'.db'),'sm_pedido'),7,'linhas no backup do tecido');
  /* ⚠️ ESTE E O CASO QUE SEPARA `db.backup()` DE `cp`. Com WAL os dados vivem
     no `-wal`; uma copia de arquivo traria o .db com o cabecalho e as sete
     linhas ficariam para tras, sem erro nenhum — o backup existiria, abriria,
     e estaria vazio (§12). */
});

caso('o backup do tecido vai para a pasta do caminhos.js, e so para ela', ()=>{
  const dir=pasta();
  const pcp=path.join(dir,'dados.db'), tec=path.join(dir,'tecido.db'), back=path.join(dir,'backups');
  bancoComWal(pcp,'skus',1); bancoComWal(tec,'sm_pedido',1);
  rodar({PCP_DB:pcp, PCP_BACKUPS:back, BANCO_TECIDO:tec});
  verdade(fs.existsSync(path.join(back,'tecido-'+hoje()+'.db')),'o diario mora na pasta do caminhos.js');
  verdade(!fs.existsSync(path.join(dir,'tecido','backups')),
    'o diario nao pode abrir uma segunda pasta ao lado do banco');
  /* `tecido/backups/` existe e continua existindo: la ficam os "antes de" que
     o limpar_sobras.js e o backfill_etiquetas.js gravam a mao. O DIARIO vai
     para onde o README diz que os backups ficam — dois lugares para a mesma
     pergunta e a armadilha #12, e na hora de restaurar ninguem quer procurar. */
});

console.log('\n── a rotacao, uma por banco ────────────────────────────────────────\n');

caso('guarda 30 de CADA, e uma rotacao nao come a outra', ()=>{
  const dir=pasta();
  const pcp=path.join(dir,'dados.db'), tec=path.join(dir,'tecido.db'), back=path.join(dir,'backups');
  bancoComWal(pcp,'skus',1); bancoComWal(tec,'sm_pedido',1);
  fs.mkdirSync(back,{recursive:true});
  // 35 copias velhas de cada, com datas que ordenam sozinhas
  for(let i=1;i<=35;i++){
    const d='2020-01-'+String(i).padStart(2,'0');
    const dia=i<=31?d:'2020-02-'+String(i-31).padStart(2,'0');
    fs.writeFileSync(path.join(back,'dados-'+dia+'.db'),'velho');
    fs.writeFileSync(path.join(back,'tecido-'+dia+'.db'),'velho');
  }
  const r=rodar({PCP_DB:pcp, PCP_BACKUPS:back, BANCO_TECIDO:tec});
  igual(r.status,0,'saiu com '+r.status+' — '+(r.stderr||'').trim());
  const nomes=fs.readdirSync(back);
  igual(nomes.filter(f=>/^dados-\d{4}-\d{2}-\d{2}\.db$/.test(f)).length,30,'copias do dados');
  igual(nomes.filter(f=>/^tecido-\d{4}-\d{2}-\d{2}\.db$/.test(f)).length,30,'copias do tecido');
  verdade(nomes.includes('dados-'+hoje()+'.db'),'a de hoje do dados ficou');
  verdade(nomes.includes('tecido-'+hoje()+'.db'),'a de hoje do tecido ficou');
  /* ⚠️ UMA ROTACAO SO, olhando `*.db`, deixaria 30 no TOTAL — quinze dias de
     historia de cada banco no lugar de trinta, e o corte cairia no banco que
     por acaso ordenasse depois. Cada banco conta as suas. */
});

console.log('\n── quando o tecido nao esta la, e quando ele esta quebrado ─────────\n');

caso('tecido.db AUSENTE nao derruba o backup do PCP', ()=>{
  const dir=pasta();
  const pcp=path.join(dir,'dados.db'), back=path.join(dir,'backups');
  bancoComWal(pcp,'skus',2);
  const r=rodar({PCP_DB:pcp, PCP_BACKUPS:back, BANCO_TECIDO:path.join(dir,'nao-existe.db')});
  igual(r.status,0,'clone limpo, CI e instalacao sem sob medida: ausencia nao e falha');
  igual(contar(path.join(back,'dados-'+hoje()+'.db'),'skus'),2,'o backup do PCP saiu igual');
});

caso('e ele DIZ que pulou, com o caminho onde procurou', ()=>{
  const dir=pasta();
  const pcp=path.join(dir,'dados.db'), back=path.join(dir,'backups');
  const faltante=path.join(dir,'nao-existe.db');
  bancoComWal(pcp,'skus',1);
  const r=rodar({PCP_DB:pcp, PCP_BACKUPS:back, BANCO_TECIDO:faltante});
  contem(r.stdout+r.stderr, faltante, 'a saida');
  /* ⚠️ PULAR CALADO E A DIVIDA 18 (§14) EM PESSOA: a regra existe, o codigo a
     le, e ela nao pega em nada — sem erro, sem log, sem sinal em lugar nenhum.
     E exatamente assim que o tecido.db ficou de fora por um ano. O caminho vai
     escrito porque "pulei o tecido" sem dizer ONDE procurei manda a pessoa
     conferir o lugar errado. */
});

caso('tecido.db QUEBRADO e erro de verdade — mas o do PCP ja esta salvo', ()=>{
  const dir=pasta();
  const pcp=path.join(dir,'dados.db'), tec=path.join(dir,'tecido.db'), back=path.join(dir,'backups');
  bancoComWal(pcp,'skus',4);
  fs.writeFileSync(tec,'isto nao e um banco sqlite');
  const r=rodar({PCP_DB:pcp, PCP_BACKUPS:back, BANCO_TECIDO:tec});
  verdade(r.status!==0,'banco que EXISTE e nao copia tem que sair diferente de zero');
  igual(contar(path.join(back,'dados-'+hoje()+'.db'),'skus'),4,
    'o backup do PCP tem que estar no disco ANTES de o tecido ser tentado');
  /* A ordem importa: o dados.db e o que despacha o dia. Tentar o tecido
     primeiro faria uma falha dele levar junto o backup que mais importa. */
});

console.log('\n── o que a saida diz ───────────────────────────────────────────────\n');

caso('a linha final conta os dois SEPARADOS, nunca um numero so', ()=>{
  const dir=pasta();
  const pcp=path.join(dir,'dados.db'), tec=path.join(dir,'tecido.db'), back=path.join(dir,'backups');
  bancoComWal(pcp,'skus',1); bancoComWal(tec,'sm_pedido',1);
  fs.mkdirSync(back,{recursive:true});
  for(let i=1;i<=4;i++){
    fs.writeFileSync(path.join(back,'dados-2020-01-0'+i+'.db'),'velho');
    fs.writeFileSync(path.join(back,'tecido-2020-01-0'+i+'.db'),'velho');
  }
  const r=rodar({PCP_DB:pcp, PCP_BACKUPS:back, BANCO_TECIDO:tec});
  igual(r.status,0,'saiu com '+r.status);
  const saida=r.stdout;
  verdade(new RegExp('dados-'+hoje()+'\\.db.*copias: 5').test(saida),
    'falta a linha do dados com a contagem dele: '+saida.trim());
  verdade(new RegExp('tecido-'+hoje()+'\\.db.*copias: 5').test(saida),
    'falta a linha do tecido com a contagem dele: '+saida.trim());
  verdade(!/copias:\s*10\b/.test(saida),
    'a saida somou os dois num numero so ("copias: 10") — quem le entende 10 dias de historia');
  /* ⚠️ Somar os dois faz o numero DOBRAR em silencio: a pasta passa de 30 para
     60 arquivos no dia do deploy, e quem le "copias: 60" com o teto de 30 na
     cabeca conclui que a rotacao parou de funcionar. */
});

console.log('\n── o dono unico do caminho ─────────────────────────────────────────\n');

caso('so o caminho.js resolve ONDE o tecido.db fica', ()=>{
  /* Mesma regra do caminho de producao no teste_caminhos.js, e pelo mesmo motivo:
     o caminho padrao escrito em dois lugares e duas reguas para a mesma
     pergunta, e a que fica para tras e sempre a do script — que ninguem roda
     todo dia. So o literal EM CODIGO conta; comentario pode citar a vontade. */
  const emCodigo=/['"]tecido\.db['"]/;   // so o LITERAL de caminho, fechado na aspa
  const dono=path.resolve(__dirname,'tecido','nucleo','caminho.js');
  const eu=path.resolve(__filename);
  const achados=[];
  const varrer=dir=>{
    for(const nome of fs.readdirSync(dir)){
      if(nome==='node_modules'||nome==='.git'||nome==='backups'||nome==='lotes') continue;
      const p=path.join(dir,nome);
      if(fs.statSync(p).isDirectory()){ varrer(p); continue; }
      if(!nome.endsWith('.js')) continue;
      if(path.resolve(p)===dono||path.resolve(p)===eu) continue;
      fs.readFileSync(p,'utf8').split('\n').forEach((linha,i)=>{
        if(emCodigo.test(linha)) achados.push(path.relative(__dirname,p)+':'+(i+1));
      });
    }
  };
  varrer(__dirname);
  igual(achados.length,0,'resolvem o caminho por conta propria: '+achados.join(', '));
});

caso('e o db.js do modulo le DELE, em vez de repetir a conta', ()=>{
  const fonte=fs.readFileSync(path.join(__dirname,'tecido','nucleo','db.js'),'utf8');
  verdade(/require\(['"]\.\/caminho['"]\)/.test(fonte),
    'tecido/nucleo/db.js tem que pedir o caminho ao caminho.js');
  /* Se o db.js voltasse a resolver sozinho, o backup e o servidor poderiam
     apontar para arquivos diferentes — e o backup ficaria verde copiando um
     banco que ninguem usa. */
});

console.log('');
if(falhas){ console.log(falhas+' de '+(ok+falhas)+' casos FALHARAM'); process.exit(1); }
console.log('todos os '+ok+' casos passaram');
