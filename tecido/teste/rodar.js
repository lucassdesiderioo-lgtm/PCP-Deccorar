// Runner. Sem framework, sem dependencia: `npm test` roda isto.
//
// Cada arquivo *.test.js roda num PROCESSO e num BANCO proprios (teste/um.js),
// criados do zero pelo schema — o teste nunca toca no tecido.db de trabalho, a
// migracao e exercitada a cada rodada, e um arquivo nao herda o estoque que o
// outro deixou.
const fs=require('fs'), path=require('path');
const {spawnSync}=require('child_process');

const arquivos=fs.readdirSync(__dirname).filter(f=>f.endsWith('.test.js')).sort();
let ok=0, falhas=0, quebrados=[];

for(const arq of arquivos){
  const r=spawnSync(process.execPath,[path.join(__dirname,'um.js'),arq],{encoding:'utf8'});
  const saida=(r.stdout||'').split('\n');
  const placar=saida.find(l=>l.startsWith('__PLACAR__'));
  console.log(saida.filter(l=>!l.startsWith('__PLACAR__')).join('\n'));
  if(r.stderr&&r.stderr.trim()&&!placar) console.error(r.stderr.trim());
  if(placar){
    const [,o,f]=placar.split(' ');
    ok+=Number(o); falhas+=Number(f);
  } else { quebrados.push(arq); }
}

console.log('─'.repeat(60));
if(quebrados.length) console.log('arquivos que nem chegaram a rodar: '+quebrados.join(', '));
console.log(ok+' passaram, '+falhas+' falharam');
process.exit(falhas||quebrados.length?1:0);
