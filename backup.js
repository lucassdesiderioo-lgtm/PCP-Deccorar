/* O backup diario — dos DOIS bancos.
 *
 * ⚠️ ELE COPIAVA SO O `dados.db`, E ISSO NAO DAVA ERRO NENHUM (ate 28/09/2026).
 * A fabrica tem duas operacoes (CLAUDE.md §19) e dois bancos: o `dados.db` do
 * Mercado Livre e o `tecido.db` do sob medida — pedidos da revenda, boletos,
 * as etiquetas de producao e os bipes da bancada. O cron das 23:30 rodava, a
 * saida dizia "backup ok", trinta copias se empilhavam na pasta, e metade do
 * sistema nunca foi levada. As unicas copias do tecido eram as de "antes de"
 * que o `limpar_sobras.js` e o `backfill_etiquetas.js` gravam a mao.
 *
 * Silencio assim so se descobre no dia em que o banco se perde, que e o unico
 * dia em que nao ha o que fazer.
 *
 * ⚠️ `db.backup()`, NUNCA `cp`. Os dois bancos rodam em WAL: o arquivo `.db`
 * fica com poucos KB e os dados vivem no `-wal` (§12). Copiar o arquivo produz
 * um backup que abre, parece certo e esta vazio.
 *
 * ⚠️ A ORDEM E O `dados.db` PRIMEIRO, e e decisao. Ele e quem despacha o dia;
 * se o tecido falhasse antes, uma falha dele levaria junto o backup que mais
 * importa.
 */
const Database=require('better-sqlite3'); const fs=require('fs'); const path=require('path');
const CAMINHOS=require('./caminhos');
const DIR=CAMINHOS.BACKUPS;

/* Onde o `tecido.db` fica quem responde e o modulo, pelo `nucleo/caminho.js`.
 * Repetir a conta aqui seriam duas reguas para a mesma pergunta (armadilha
 * #12), e a que erra e a deste lado: o backup ficaria verde copiando um
 * arquivo que o servidor nao usa.
 *
 * O `try` e o mesmo desenho do `server.js` com o `montar()`: um PCP sem a
 * pasta `tecido/` continua tendo backup. */
let TECIDO=null;
try{ TECIDO=require('./tecido/nucleo/caminho').BANCO; }catch(e){ TECIDO=null; }

const MANTER=30;
const d=new Date();
const st=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');

/* Uma copia e uma rotacao POR BANCO. Uma rotacao so, olhando `*.db`, deixaria
 * 30 arquivos no total — quinze dias de historia de cada um no lugar de trinta,
 * e o corte caindo no banco que por acaso ordenasse depois. */
async function copiar(origem, prefixo){
  const dest=path.join(DIR, prefixo+'-'+st+'.db');
  const db=new Database(origem,{readonly:true});
  try{ await db.backup(dest); }
  catch(e){ throw new Error('nao consegui copiar o '+prefixo+' ('+origem+'): '+e.message); }
  finally{ try{ db.close(); }catch(e){} }

  const meus=new RegExp('^'+prefixo+'-\\d{4}-\\d{2}-\\d{2}\\.db$');
  const files=fs.readdirSync(DIR).filter(f=>meus.test(f)).sort();
  while(files.length>MANTER){ fs.unlinkSync(path.join(DIR,files.shift())); }
  // Uma linha por banco, com a contagem DELE. Somar os dois faria o numero
  // dobrar no dia do deploy, e quem le "copias: 60" com o teto de 30 na cabeca
  // conclui que a rotacao parou de funcionar.
  console.log('backup ok ->',dest,'| copias:',files.length);
}

(async()=>{
  fs.mkdirSync(DIR,{recursive:true});
  await copiar(CAMINHOS.BANCO,'dados');

  /* ⚠️ AUSENCIA NAO E FALHA, MAS TAMBEM NAO E SILENCIO. Clone limpo, runner de
   * CI e um PCP sem sob medida nao tem `tecido.db`, e derrubar o backup por
   * isso seria trava disparando no caso normal (armadilha #6). Pular calado,
   * porem, e a divida 18 em pessoa — foi assim que este banco ficou um ano de
   * fora. O caminho vai escrito: "pulei o tecido" sem dizer ONDE procurei manda
   * a pessoa conferir o lugar errado. */
  if(!TECIDO){
    console.log('sem o modulo do sob medida (tecido/nucleo/caminho.js) — nada a copiar do tecido');
    return;
  }
  if(!fs.existsSync(TECIDO)){
    console.log('tecido.db nao encontrado em '+TECIDO+' — nada a copiar');
    return;
  }
  // Daqui para baixo o arquivo EXISTE: falhar agora e falha de verdade, e sai
  // diferente de zero — com o backup do PCP ja no disco.
  await copiar(TECIDO,'tecido');
})().catch(e=>{ console.error('backup erro:',e.message); process.exit(1); });
