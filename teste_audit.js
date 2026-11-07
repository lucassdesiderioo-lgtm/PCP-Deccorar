#!/usr/bin/env node
/* Testes das vulnerabilidades do `npm audit` (CONSERTO de 07/11/2026).
 *
 *   node teste_audit.js
 *
 * Tres coisas, e cada uma fecha uma porta diferente:
 *
 *  1. TODO `getDocument` do pdf.js leva `isEvalSupported:false`. O pdfjs-dist
 *     3.11 tem a falha em que um PDF malicioso roda JavaScript (a fonte do PDF
 *     vira codigo). A troca para a versao 6 e major e mexe no texto que o
 *     parse.js le — ficou para outra tarefa. Esta opcao e a protecao que o
 *     proprio pdf.js indica, e a extracao de texto nao passa por ela. O caso
 *     varre os .js do projeto: script novo se escreve copiando o de cima, e o
 *     de cima nao tinha a opcao.
 *  2. O Express roda com proxy-addr, body-parser e qs consertados (o PCP fica
 *     atras do Traefik; o proxy-addr velho deixava falsificar o IP).
 *  3. Os locks da raiz e do tecido continuam com as MESMAS versoes (PR #306):
 *     o servidor usa o node_modules da raiz, e um lock diferente no tecido
 *     testaria uma arvore que nao roda.
 *
 * Nao toca no banco nem na rede.
 */
const fs=require('fs'), path=require('path');

let ok=0, falhas=0;
const caso=(nome,fn)=>{ try{ fn(); console.log('ok      '+nome); ok++; }
                        catch(e){ console.log('FALHOU  '+nome+'\n        '+e.message); falhas++; } };

const RAIZ=__dirname;
const FORA=new Set(['node_modules','.git','backups','lotes','docs','casos']);

function jsDoProjeto(dir, lista){
  for(const nome of fs.readdirSync(dir)){
    if(FORA.has(nome) || nome.startsWith('.')) continue;
    const p=path.join(dir,nome), st=fs.statSync(p);
    if(st.isDirectory()) jsDoProjeto(p, lista);
    else if(/\.js$/.test(nome) && !/\.bak/.test(nome)) lista.push(p);
  }
  return lista;
}

/* a chamada se acha pelo texto; o nome vai montado para este arquivo nao se achar */
const CHAMADA=new RegExp('\\.'+'get'+'Document\\s*\\(','g');

console.log('\n── 1. todo getDocument do pdf.js leva isEvalSupported:false ──────────\n');

const achados=[];
for(const arq of jsDoProjeto(RAIZ, [])){
  if(arq===__filename) continue;
  const s=fs.readFileSync(arq,'utf8');
  let m; CHAMADA.lastIndex=0;
  while((m=CHAMADA.exec(s))){
    /* o objeto de opcoes da chamada: do "(" ate o fechamento dele */
    let i=m.index+m[0].length, nivel=1;
    while(i<s.length && nivel>0){ if(s[i]==='(') nivel++; else if(s[i]===')') nivel--; i++; }
    achados.push({ arq:path.relative(RAIZ,arq), linha:s.slice(0,m.index).split('\n').length,
                   args:s.slice(m.index+m[0].length, i-1) });
  }
}

caso('a varredura acha as chamadas (sem isso o verde nao olhou nada)', ()=>{
  if(achados.length<8) throw new Error('so achou '+achados.length+' chamadas; esperava pelo menos 8');
  if(!achados.some(a=>a.arq==='parse.js')) throw new Error('nao achou a do parse.js');
});

caso('nenhuma chamada sem isEvalSupported:false', ()=>{
  const sem=achados.filter(a=>!/isEvalSupported\s*:\s*false/.test(a.args));
  if(sem.length) throw new Error('sem a protecao: '+sem.map(a=>a.arq+':'+a.linha).join(', '));
});

console.log('\n── 2. o Express roda com as versoes consertadas ──────────────────────\n');

const lockRaiz=require('./package-lock.json').packages;
const lockTecido=require('./tecido/package-lock.json').packages;
const v=s=>String(s).split('.').map(Number);
const maiorOuIgual=(a,b)=>{ const x=v(a), y=v(b); for(let i=0;i<3;i++){ if(x[i]!==y[i]) return x[i]>y[i]; } return true; };

for(const [pac,min] of [['proxy-addr','2.0.8'],['body-parser','2.4.0'],['qs','6.17.1']]){
  caso(pac+' >= '+min+' no lock da raiz', ()=>{
    const p=lockRaiz['node_modules/'+pac];
    if(!p) throw new Error(pac+' nao esta no lock');
    if(!maiorOuIgual(p.version,min)) throw new Error('veio '+p.version);
  });
}

console.log('\n── 3. os locks da raiz e do tecido tem as mesmas versoes ─────────────\n');

caso('nenhum pacote do tecido em versao diferente da raiz, nem so no tecido', ()=>{
  const dif=[];
  for(const k in lockTecido){
    if(!k) continue;
    if(!lockRaiz[k]) dif.push(k+' so no tecido');
    else if(lockRaiz[k].version!==lockTecido[k].version) dif.push(k+' '+lockTecido[k].version+' x '+lockRaiz[k].version);
  }
  if(dif.length) throw new Error(dif.join('; '));
});

console.log('\n'+ok+' ok, '+falhas+' falha(s)');
process.exit(falhas?1:0);
