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

/* ── FORNECEDOR, PRECO E O RELOGIO DO GIRO ────────────────────────────────
   Estes tres nao sao cadastro, mas respondem a pergunta que se faz logo
   depois de subir a migracao 9: o que ela achou no texto livre, quanto ainda
   falta de nota, e desde quando existe historia de corte.

   O ultimo importa mais do que parece: o painel "O que sai" nao consegue
   inventar passado, e uma media de poucos dias apresentada como media do mes
   e um numero que engana com cara de fato. Aqui da para ver de quantos dias
   ele esta falando ANTES de alguem decidir compra por ele. */
const forn=db.prepare(`SELECT f.nome, f.conferir,
    (SELECT COUNT(*) FROM rolo r WHERE r.fornecedor_id=f.id) rolos
  FROM fornecedor f ORDER BY rolos DESC, f.nome`).all();
/* Texto livre que nao casou com nenhum cadastro. Nao e erro da migracao — e
   nome escrito de um jeito que nao bate com nada, e por isso precisa de olho.
   Sai AQUI dentro, e nao em `avisos`: aquele bloco ja foi impresso acima, e
   um aviso empurrado para uma lista ja escrita nao aparece em lugar nenhum. */
const orfaos=db.prepare(`SELECT DISTINCT fornecedor FROM rolo
  WHERE TRIM(COALESCE(fornecedor,''))<>'' AND fornecedor_id IS NULL`).all();

bloco('FORNECEDORES', forn.map(x=>
  x.nome.padEnd(26)+String(x.rolos).padStart(3)+' rolo(s)'+(x.conferir?'   [conferir]':''))
  .concat(orfaos.length
    ? ['','⚠ texto que NAO virou cadastro: '+orfaos.map(o=>o.fornecedor).join(' | ')]
    : []));

const r=db.prepare(`SELECT COUNT(*) t,
    SUM(CASE WHEN status<>'encerrado' THEN 1 ELSE 0 END) vivos,
    SUM(CASE WHEN status<>'encerrado' AND preco_m2 IS NULL THEN 1 ELSE 0 END) semPreco
  FROM rolo`).get();
const cortes=db.prepare(`SELECT COUNT(*) n, MIN(data) de, MAX(data) ate
  FROM movimento_rolo WHERE motivo='consumo'`).get();

bloco('ROLO, NOTA E CORTE', [
  r.t+' rolo(s), '+r.vivos+' nao encerrado(s)',
  r.semPreco
    ? r.semPreco+' sem preco lancado — o total do estoque sai como PISO (>=) ate isso zerar'
    : 'todos com preco lancado — o total do estoque e exato',
  cortes.n
    ? cortes.n+' corte(s) confirmado(s), de '+cortes.de+' ate '+cortes.ate
    : 'nenhum corte confirmado ainda — o painel "O que sai" abre vazio, e esta certo'
]);

const sobras=db.prepare('SELECT COUNT(*) c FROM sobra').get().c;
console.log('\n   rolos: '+r.t+'   ·   sobras: '+sobras+'   ·   banco: '+db.arquivo+'\n');
