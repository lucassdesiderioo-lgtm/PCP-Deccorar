// CARGA DE ITENS DE TECIDO a partir de uma lista escrita a mao.
//
//   node tecido/carga_itens.js lista.txt              simula (nao grava nada)
//   node tecido/carga_itens.js lista.txt --aplicar    grava
//
// Formato — uma colecao por linha, as cores separadas por virgula:
//
//   Rolo · 3%: Bege, Branco, Cinza, Preto
//   Double Vision · Classic: Branco, Creme, Mescla
//
// SIMULA POR PADRAO, como os outros scripts da casa (limpar_fila,
// limpar_fantasmas). Trinta itens entrando de uma vez sao trinta chances de
// a lista estar errada, e desfazer cadastro depois de ter rolo apontando
// para ele e caro.
//
// NAO INVENTA CADASTRO. Cor, linha ou colecao que nao existe vira RECUSA com
// o nome escrito, nunca um cadastro novo criado em silencio: 'Mescla' que
// falta pode ser cor nova de verdade — ou 'Mesela' digitado errado, e o
// segundo caso so aparece quando alguem procura a cor na tela e nao acha.
const fs=require('fs');
const tecido=require('../tecido/dominio/tecido');
const dLinha=require('../tecido/dados/linha');
const dAbertura=require('../tecido/dados/abertura');
const dCor=require('../tecido/dados/cor');

const arquivo=process.argv[2];
const aplicar=process.argv.includes('--aplicar');

if(!arquivo){
  console.log('uso: node tecido/carga_itens.js lista.txt [--aplicar]');
  process.exit(1);
}

// Compara ignorando acento, caixa e espaco duplo — 'Rolô' e 'Rolo' sao a
// mesma linha para quem digitou a lista, e recusar por acento seria recusar
// por motivo nenhum.
const chave=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'')
  .toLowerCase().replace(/\s+/g,' ').trim();

const linhas=dLinha.listar().filter(l=>l.ativo);
const cores=dCor.listar().filter(c=>c.ativo);
const achaLinha=n=>linhas.find(l=>chave(l.nome)===chave(n));
const achaCor=n=>cores.find(c=>chave(c.nome)===chave(n));
const achaCol=(linha,n)=>dAbertura.listar(linha.id).filter(a=>a.ativo)
  .find(a=>chave(a.nome)===chave(n));

const texto=fs.readFileSync(arquivo,'utf8');
const pedidos=[], erros=[];

texto.split('\n').forEach((cru,i)=>{
  const l=cru.trim();
  if(!l||l.startsWith('#')) return;
  const corte=l.indexOf(':');
  if(corte<0) return erros.push('linha '+(i+1)+': falta o ":" antes das cores  ->  '+l);

  const esquerda=l.slice(0,corte);
  const partes=esquerda.split(/[·|]/).map(x=>x.trim()).filter(Boolean);
  if(partes.length!==2)
    return erros.push('linha '+(i+1)+': esperava "Linha · Colecao:"  ->  '+esquerda.trim());

  const linha=achaLinha(partes[0]);
  if(!linha) return erros.push('linha '+(i+1)+': a LINHA "'+partes[0]+'" nao esta cadastrada');
  const col=achaCol(linha,partes[1]);
  if(!col) return erros.push('linha '+(i+1)+': a COLECAO "'+partes[1]+'" nao existe em '+linha.nome);

  l.slice(corte+1).split(',').map(x=>x.trim()).filter(Boolean).forEach(nomeCor=>{
    const cor=achaCor(nomeCor);
    if(!cor) return erros.push('linha '+(i+1)+': a COR "'+nomeCor+'" nao esta cadastrada');
    pedidos.push({linha,col,cor});
  });
});

// ── o que ja existe nao e erro, e nem trabalho ───────────────────────────
const jaTem=new Set(tecido.listarTecidos()
  .map(t=>t.linha_id+'/'+t.abertura_id+'/'+t.cor_id));
const novos=pedidos.filter(p=>!jaTem.has(p.linha.id+'/'+p.col.id+'/'+p.cor.id));
const repetidos=pedidos.length-novos.length;

console.log('\n'+pedidos.length+' combinacao(oes) na lista'+
  (repetidos?'   ·   '+repetidos+' ja cadastrada(s)':''));

if(erros.length){
  console.log('\n── NAO DA PARA CONTINUAR ('+erros.length+') ──────────────────────');
  erros.forEach(e=>console.log('   '+e));
  console.log('\n   Cadastre o que falta na tela e rode de novo. NADA foi gravado —');
  console.log('   carga pela metade e pior que carga nenhuma: sobra a duvida de');
  console.log('   quais linhas entraram.\n');
  process.exit(1);
}

console.log('\n── VAI CADASTRAR ('+novos.length+') ─────────────────────────────');
novos.forEach(p=>console.log('   '+p.linha.nome+' · '+p.col.nome+' · '+p.cor.nome));

if(!aplicar){
  console.log('\n   SIMULACAO — nada foi gravado.');
  console.log('   Confira a lista acima e rode de novo com --aplicar\n');
  process.exit(0);
}

let ok=0;
const falhas=[];
novos.forEach(p=>{
  try{
    tecido.criarTecido({linha_id:p.linha.id, abertura_id:p.col.id, cor_id:p.cor.id});
    ok++;
  }catch(e){ falhas.push(p.linha.nome+' · '+p.col.nome+' · '+p.cor.nome+': '+e.mensagem); }
});

console.log('\n   '+ok+' item(ns) cadastrado(s).');
if(falhas.length){
  console.log('\n── RECUSADOS ('+falhas.length+') ──────────────────────────────');
  falhas.forEach(f=>console.log('   '+f));
}
console.log('\n   Confira com: node tecido/ver_cadastro.js\n');
