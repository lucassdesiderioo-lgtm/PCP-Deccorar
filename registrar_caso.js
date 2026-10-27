#!/usr/bin/env node
/* registrar_caso.js — grava um problema de expedição no caderno de casos reais
 * (spec CONFERENCIA-DA-QUANTIDADE §4, regra R-INV-01).
 *
 *   node registrar_caso.js <pdf> <venda-ou-pack> --pecas "1xBK120120BEGE,1xBK140140BEGE"
 *        [--estagio bloqueado|pendente] [--card pacote|divergencia]
 *        [--nota "o cliente recebeu 1 de 2"] [--data AAAA-MM-DD]
 *
 * Lê o PDF do Mercado Livre, troca nome e endereço de TODO cliente do arquivo
 * (as outras etiquetas ficam: é a conta do PDF inteiro que decide, por
 * exemplo, se o irmão do pacote entra) e grava `casos/<data>-nf-<nf>.json`
 * com o texto de cada página e o que DEVIA ter saído para aquela venda.
 *
 * Depois: `node teste_casos_reais.js` roda o caso pelo upload de verdade. Caso
 * novo entra ANTES do conserto, reprovando; o conserto é o que o faz passar.
 * Caso gravado nunca se apaga.
 *
 * Só lê o PDF e escreve na pasta `casos/`. Não toca no banco.
 */
const fs=require('fs'), path=require('path');
const pdfjs=require('pdfjs-dist/legacy/build/pdf.js');
const {pageLines,tipoDaPagina,nfDaNota,itensDaFolha,itemDaFolha}=require('./folha');
const {nomeDaEtiqueta}=require('./parse');
const {mesmoCliente}=require('./nome');

const args=process.argv.slice(2);
const opt=k=>{ const i=args.indexOf('--'+k); return i>=0?args[i+1]:null; };
const soltos=args.filter((a,i)=>!a.startsWith('--') && !(i>0 && args[i-1].startsWith('--')));
const [ARQ, CHAVE_BRUTA]=soltos;
if(!ARQ || !CHAVE_BRUTA || !opt('pecas')){
  console.log('uso: node registrar_caso.js <pdf> <venda-ou-pack> --pecas "1xSKU,2xSKU"');
  console.log('        [--estagio bloqueado|pendente] [--card pacote|divergencia] [--nota "..."] [--data AAAA-MM-DD]');
  process.exit(1);
}
const CHAVE=String(CHAVE_BRUTA).replace(/\D/g,'');

/* O nome trocado é só letras, em duas palavras: é o que o leitor da folha
   reconhece como comprador quando o nome cai sozinho na linha (folha.js). */
function apelido(n){
  let s='', x=n;
  do { s=String.fromCharCode(65+(x%26))+s; x=Math.floor(x/26)-1; } while(x>=0);
  return 'Cliente '+s;
}

/* A etiqueta: o leitor usa o pack ou a venda, o "Despachar:", a NF, o nome
   (a linha antes de "Endereço:") e a cidade. O resto é endereço e sai. */
function limparEtiqueta(linhas, nome){
  const out=[]; let depoisDoEndereco=false;
  const ei=linhas.findIndex(l=>/^Endere[çc]o:/.test(l));
  /* O nome partido em duas linhas (o mesmo caso do nomeDaEtiqueta): a linha
     antes do "Endereço:" começa com "(" ou traz um ")" sem o "(". Só então a
     linha de cima também é nome — senão ela é a da NF, e não pode sair. */
  const partido=s=>/^\(/.test(s) || (s.indexOf(')')>=0 && s.indexOf('(')<0);
  const nomeEmDuas=ei>1 && partido(linhas[ei-1]||'');
  linhas.forEach((l,k)=>{
    if(k===ei-1){ out.push(nome+' (APELIDO)'); return; }
    if(nomeEmDuas && k===ei-2) return;
    if(k===ei){ out.push('Endereço: (removido)'); depoisDoEndereco=true; return; }
    if(depoisDoEndereco){
      if(/^Cidade de destino/.test(l)) out.push('Cidade de destino : (removida)');
      return;
    }
    out.push(l);
  });
  return out;
}
/* A nota: número, chave e destinatário bastam ao leitor. */
function limparNota(linhas, nome){
  return linhas.filter(l=>/Sa[ií]da|Chave|N[úu]mero|Emiss|Protocolo|DANFE|Remetente|CNPJ|^\d{20,}$|DESTINAT/i.test(l))
    .map(l=>/DESTINAT/i.test(l)?'DESTINATARIO: '+(nome||'Cliente'):l);
}

(async()=>{
  const doc=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(ARQ))}).promise;
  const pags=[];
  for(let p=1;p<=doc.numPages;p++){
    const linhas=pageLines(await (await doc.getPage(p)).getTextContent());
    pags.push({linhas, tipo:tipoDaPagina(linhas.join('\n'))});
  }
  const folha=[].concat(...pags.filter(x=>x.tipo==='control').map(x=>x.linhas));
  const itens=itensDaFolha(folha);

  /* Um apelido por cliente, o MESMO na etiqueta, na folha e na nota — senão a
     conferência do comprador (§5) acusaria no caso uma troca que não houve.
     E se no PDF real os nomes NÃO batiam, eles continuam não batendo. */
  const alias=new Map(); let n=0;
  const novo=()=>apelido(n++);
  const porNf={};
  let alvo=null;
  pags.forEach(x=>{
    if(x.tipo!=='label') return;
    const t=x.linhas.join('\n');
    const g=re=>{ const m=t.match(re); return m?m[1].replace(/\s+/g,''):null; };
    const pack=g(/Pack ID:\s*([\d ]+)/), venda=g(/Venda:\s*([\d ]+)/), nf=(t.match(/NF:\s*(\d+)/)||[])[1]||null;
    const nome=nomeDaEtiqueta(x.linhas);
    const a=(nome && alias.get(nome)) || novo();
    if(nome) alias.set(nome,a);
    const item=itemDaFolha({packId:pack,venda},itens);
    if(item && item.comprador && !alias.has(item.comprador))
      alias.set(item.comprador, mesmoCliente(nome,item.comprador)===false ? novo() : a);
    x.nome=a; if(nf) porNf[nf]=a;
    if(pack===CHAVE || venda===CHAVE) alvo={pack,venda,nf,nome:a};
  });
  if(!alvo){ console.log('Não achei a venda ou o pack '+CHAVE+' nas etiquetas deste PDF.'); process.exit(1); }
  itens.forEach(i=>{ if(i.comprador && !alias.has(i.comprador)) alias.set(i.comprador, novo()); });
  const nomesFolha=[...alias.keys()].sort((a,b)=>b.length-a.length);

  const paginas=pags.map(x=>{
    if(x.tipo==='label') return limparEtiqueta(x.linhas, x.nome);
    if(x.tipo==='danfe') return limparNota(x.linhas, porNf[nfDaNota(x.linhas.join('\n'))]);
    if(x.tipo==='control') return x.linhas.map(l=>{
      for(const nome of nomesFolha) if(l.includes(nome)) l=l.split(nome).join(alias.get(nome));
      return l;
    });
    return [];
  }).filter(p=>p.length);

  const data=opt('data')||new Date().toLocaleDateString('sv-SE');
  const caso={
    id: data+'-nf-'+(alvo.nf||CHAVE),
    data,
    registrado_em: new Date().toLocaleDateString('sv-SE'),
    o_que_aconteceu: opt('nota')||'',
    origem: 'PDF do Mercado Livre lido pelo registrar_caso.js, com nomes e endereços trocados',
    paginas,
    esperado: [{ chave: CHAVE, cliente: alvo.nome,
      pecas: String(opt('pecas')).split(',').map(s=>s.trim()).filter(Boolean),
      estagio: opt('estagio')||null, card: opt('card')||null }]
  };
  const dir=path.join(__dirname,'casos'); fs.mkdirSync(dir,{recursive:true});
  const arq=path.join(dir,caso.id+'.json');
  if(fs.existsSync(arq)){ console.log('Já existe '+path.relative(__dirname,arq)+' — caso gravado não se sobrescreve. Use outro --data ou apague à mão, se tiver certeza.'); process.exit(1); }
  fs.writeFileSync(arq, JSON.stringify(caso,null,2)+'\n');
  console.log('gravado: '+path.relative(__dirname,arq));
  console.log('  '+paginas.length+' página(s), '+alias.size+' nome(s) trocado(s), venda '+CHAVE+' = '+alvo.nome+' (NF '+(alvo.nf||'—')+')');
  console.log('  esperado: '+caso.esperado[0].pecas.join(' + ')+(caso.esperado[0].estagio?' · '+caso.esperado[0].estagio:'')+(caso.esperado[0].card?' · card '+caso.esperado[0].card:''));
  console.log('Agora: node teste_casos_reais.js');
})().catch(e=>{ console.error(e); process.exit(1); });
