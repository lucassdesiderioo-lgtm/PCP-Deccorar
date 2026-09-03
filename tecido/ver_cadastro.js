// O CADASTRO INTEIRO EM UMA TELA. So le — pode rodar em producao.
//
//   node tecido/ver_cadastro.js
//
// Existe porque conferir cadastro clicando aba por aba nao mostra o que
// importa: se a colecao esta pendurada na linha certa, se sobrou cor com
// nome de colecao dentro, se alguma linha ficou sem colecao nenhuma. Esses
// tres so aparecem olhando tudo junto — e cada um deles vira um item de
// tecido errado, que vira rolo no lugar errado.
//
// A formatacao e em JS de proposito: o SQLite nao tem operador ternario, e
// um '?' escrito dentro do SQL vira placeholder de bind.
const db=require('./nucleo/db');

const marca=x=>x.ativo?'':'   (inativa)';
const bloco=(titulo,linhas)=>{
  console.log('\n── '+titulo+' '+'─'.repeat(Math.max(0,44-titulo.length)));
  if(!linhas.length) console.log('   (vazio)');
  linhas.forEach(l=>console.log('   '+l));
};
const tabela=n=>{ try{ return db.prepare('SELECT 1 FROM '+n+' LIMIT 1').get()!==undefined||true; }
                  catch(e){ return false; } };

bloco('LINHAS', db.prepare('SELECT nome,ativo FROM linha ORDER BY nome').all()
  .map(x=>x.nome+marca(x)));

const cols=db.prepare(`SELECT l.nome linha, a.nome col, a.ativo
  FROM abertura a JOIN linha l ON l.id=a.linha_id ORDER BY l.nome, a.nome`).all();
bloco('COLECOES (por linha)', cols.map(x=>x.linha.padEnd(18)+' -> '+x.col+marca(x)));

const cores=db.prepare('SELECT nome,ativo FROM cor ORDER BY nome').all();
bloco('CORES ATIVAS', cores.filter(c=>c.ativo).map(c=>c.nome));
bloco('CORES DESATIVADAS', cores.filter(c=>!c.ativo).map(c=>c.nome));

if(tabela('largura_bobina'))
  bloco('LARGURAS DE BOBINA', db.prepare('SELECT valor,ativo FROM largura_bobina ORDER BY valor').all()
    .map(x=>x.valor.toFixed(2).replace('.',',')+' m'+marca(x)));

const tec=db.prepare(`SELECT t.codigo, l.nome linha, a.nome col, c.nome cor, t.ativo
  FROM tecido t JOIN linha l ON l.id=t.linha_id
                JOIN abertura a ON a.id=t.abertura_id
                JOIN cor c ON c.id=t.cor_id
  ORDER BY l.nome, a.nome, c.nome`).all();
bloco('ITENS DE TECIDO ('+tec.length+')',
  tec.map(x=>(x.linha+' · '+x.col+' · '+x.cor).padEnd(46)+x.codigo+marca(x)));

/* ── O QUE PODE ESTAR TORTO ────────────────────────────────────────────────
   Nao sao erros do sistema: sao coisas que so quem conhece o catalogo sabe
   dizer se estao certas. O script aponta e cala — decidir e de quem cadastra. */
const avisos=[];

// Cor com nome de colecao dentro. 'Napoles Bege' faz o sistema deixar de
// saber que aquilo E bege, e cada colecao nova repete o mesmo punhado de cores.
const nomesCol=[...new Set(cols.map(c=>c.col.toLowerCase()))];
cores.filter(c=>c.ativo).forEach(c=>{
  const bate=nomesCol.find(n=>n.length>2&&c.nome.toLowerCase().includes(n));
  if(bate) avisos.push('a cor "'+c.nome+'" carrega o nome da colecao "'+bate+'" — a colecao tem campo proprio');
});

// Linha sem colecao nenhuma nao gera item de tecido: ela some do seletor.
db.prepare('SELECT id,nome FROM linha WHERE ativo=1').all().forEach(l=>{
  if(!cols.some(c=>c.linha===l.nome&&c.ativo))
    avisos.push('a linha "'+l.nome+'" nao tem colecao ativa — nenhum item de tecido pode nascer nela');
});

// Colecao sem nenhum item ainda: pode ser so cadastro adiantado, ou o
// esquecimento de montar o item.
cols.filter(c=>c.ativo).forEach(c=>{
  if(!tec.some(t=>t.linha===c.linha&&t.col===c.col))
    avisos.push('a colecao "'+c.linha+' -> '+c.col+'" ainda nao tem nenhum item de tecido');
});

bloco('OLHAR COM ATENCAO ('+avisos.length+')', avisos);

const rolos=db.prepare('SELECT COUNT(*) c FROM rolo').get().c;
const sobras=db.prepare('SELECT COUNT(*) c FROM sobra').get().c;
console.log('\n   rolos: '+rolos+'   ·   sobras: '+sobras+'   ·   banco: '+db.arquivo+'\n');
