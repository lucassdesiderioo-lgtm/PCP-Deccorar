#!/usr/bin/env node
/* O CADASTRO DE MATERIAL — a rota que cria, edita, desativa e reativa.
 *
 *   node teste_componentes.js
 *
 * ⚠️ ESCRITO ANTES DO CODIGO (secao 0, risco vermelho).
 *
 * O QUE ORIGINOU (24/09/2026): o dono foi cadastrar os tubos 38, 41 e 56 para
 * a fase 4-C e nao achou onde. Nao achou porque NAO EXISTE: `POST
 * /api/componentes` sem `id` CRIA um material, e nenhuma tela do sistema chama
 * essa rota sem id. E a divida 18 na forma "rota que nenhuma tela chama" — a
 * mesma do extrato do livro (secao 2), que ficou um dia no ar sem botao.
 *
 * E indo escrever a tela apareceu o defeito que importa mais:
 *
 *   O `UPDATE` ESCREVIA TODOS OS CAMPOS, SEMPRE. Um POST com `id` e sem
 *   `familia` APAGAVA a familia — e familia + cor + largura de bobina e
 *   exatamente como a ficha resolve QUAL TECIDO a peca usa (secao 7-B). Some a
 *   familia, some o tecido da ficha, e com ele o custo e a linha da lista de
 *   compras. Sem erro, sem log e sem nada em tela nenhuma.
 *
 *   Ninguem caiu nisso ate hoje por ACASO: o unico chamador (o `change` da
 *   tabela de minimos) reenvia todos os campos. Uma tela de cadastro escrita
 *   sem saber disso apagaria o vinculo do tecido no primeiro salvamento.
 *
 *   E a armadilha #25 / divida 15 (o `POST /api/skus` que zerava o estoque
 *   quando o corpo nao trazia `estoque`) viva noutra rota. As duas regras da
 *   secao 6 passam a valer aqui: CAMPO AUSENTE NAO E CAMPO VAZIO, e NUMERO
 *   IMPOSSIVEL E RECUSADO, NUNCA CLAMPADO.
 *
 * Sobe um Express de mentira e um banco temporario. Nao abre porta, nao toca no
 * banco de producao.
 */
const Database=require('better-sqlite3');
const fs=require('fs'), os=require('os'), path=require('path');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pcp-comp-'));
process.env.PCP_DB=path.join(tmp,'t.db');
const db=new Database(path.join(tmp,'t.db'));

/* O schema real da tabela, copiado do compras_schema.js — inclusive o indice
   UNIQUE por familia+cor+bobina, que e o que torna o tecido resolvivel. */
db.exec(`
  CREATE TABLE componente (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE, nome TEXT NOT NULL, unidade TEXT,
    estoque REAL DEFAULT 0, ativo INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now','localtime')),
    estoque_minimo REAL DEFAULT 0, estoque_ideal REAL DEFAULT 0,
    perda_pct REAL DEFAULT 0, sobra_aproveitavel INTEGER DEFAULT 1,
    familia TEXT, cor TEXT, largura_bobina_cm REAL, custo_medio REAL);
  CREATE UNIQUE INDEX idx_comp_variante
    ON componente(familia, cor, largura_bobina_cm) WHERE familia IS NOT NULL;
  CREATE TABLE fornecedor (id INTEGER PRIMARY KEY, nome TEXT, ativo INTEGER DEFAULT 1);
  CREATE TABLE oferta (id INTEGER PRIMARY KEY, fornecedor_id INTEGER,
    componente_id INTEGER, sku TEXT, embalagem TEXT, fator REAL, preco REAL,
    multiplo REAL, qtd_minima REAL, frete REAL, prazo_entrega INTEGER,
    ativo INTEGER DEFAULT 1, codigo_fornec TEXT);
  CREATE TABLE preco_historico (id INTEGER PRIMARY KEY, oferta_id INTEGER,
    preco_antigo REAL, preco_novo REAL, variacao_pct REAL, fonte TEXT,
    referencia TEXT, usuario_nome TEXT);
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '',
    cor TEXT DEFAULT '', estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1, modelo_id INTEGER);
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE modelo (id INTEGER PRIMARY KEY, nome TEXT, sob_medida INTEGER DEFAULT 0);
  CREATE TABLE venda_futura (id INTEGER PRIMARY KEY, codigo TEXT,
    data_venda TEXT, data_envio TEXT, cancelada INTEGER DEFAULT 0);
`);

/* ── UM EXPRESS DE MENTIRA ────────────────────────────────────────────────
   O `compras_route.js` so registra rotas; nao precisa de servidor de verdade
   para exercita-las. Guardar o manipulador por metodo+caminho e o bastante, e
   evita abrir porta num teste (a secao 10 existe justamente por causa disso). */
const rotas={};
const app={ get:(c,f)=>rotas['GET '+c]=f, post:(c,f)=>rotas['POST '+c]=f,
            put:(c,f)=>rotas['PUT '+c]=f, delete:(c,f)=>rotas['DELETE '+c]=f,
            use:()=>{} };
require('./compras_route')(app, db);

/* Chama a rota e devolve { status, corpo } — o mesmo que o navegador veria. */
function chamar(metodo, caminho, corpo, params){
  const f=rotas[metodo+' '+caminho];
  if(!f) throw new Error('rota nao registrada: '+metodo+' '+caminho);
  let st=200, out=null;
  const res={ status(c){ st=c; return this; }, json(o){ out=o; return this; } };
  /* ⚠️ ROTA QUE ESTOURA VIRA 500 AQUI, e nao derruba a rodada. Reintroduzindo
     o defeito do campo ausente, um POST parcial bate no NOT NULL do `nome` e
     o `protegido` relanca — sem este catch a suite MORRIA no caso 9 e os 29
     de baixo nunca rodavam, entao o defeito aparecia como "travou", nao como
     vermelho. E a mesma licao do `teste_compras_sobmedida.js`: teste que
     morre nao diz o que quebrou. */
  try{ f({body:corpo||{}, params:params||{}, query:{}, usuario:{nome:'Teste'}}, res); }
  catch(e){ return {status:500, corpo:{erro:'a rota estourou: '+e.message}}; }
  return {status:st, corpo:out};
}
const criar = c => chamar('POST','/api/componentes',c);
const ler   = id => db.prepare('SELECT * FROM componente WHERE id=?').get(id);

let casos=0, falhas=0;
function ok(oque,cond,extra){
  casos++;
  let v=false;
  try{ v=(typeof cond==='function')?cond():cond; }
  catch(e){ falhas++; console.log('  ✗ '+oque+'\n      estourou: '+e.message); return; }
  if(v){ console.log('  ✓ '+oque); return; }
  falhas++;
  let d=''; try{ d=typeof extra==='function'?extra():extra; }catch(e){ d='('+e.message+')'; }
  console.log('  ✗ '+oque+(d?'\n      '+d:''));
}

console.log('\n── criar '+'─'.repeat(52));
{
  const r=criar({nome:'Tubo 38 mm', unidade:'m'});
  ok('cria com nome e unidade', r.status===200 && r.corpo && r.corpo.ok, ()=>JSON.stringify(r));
  const c=ler(r.corpo&&r.corpo.id);
  ok('nasce ATIVO', c && c.ativo===1);
  ok('nasce com estoque zero — quem move saldo e o recebimento, nao o cadastro',
     c && (c.estoque===0||c.estoque==null));
  ok('nasce com sobra aproveitavel (§5: errar para a embalagem maior)',
     c && c.sobra_aproveitavel===1);
}
ok('sem nome, recusa 400', ()=>criar({unidade:'m'}).status===400);
ok('nome so com espaco tambem e sem nome', ()=>criar({nome:'   ',unidade:'m'}).status===400);
{
  criar({nome:'Fita X', codigo:'FX1', unidade:'m'});
  const r=criar({nome:'Outra fita', codigo:'FX1', unidade:'m'});
  ok('codigo repetido e recusado (409), nao 500', r.status===409, ()=>JSON.stringify(r));
  ok('e a recusa diz o que houve, em portugues de gente',
     ()=>/código/i.test(r.corpo.erro), ()=>String(r.corpo&&r.corpo.erro));
}

console.log('\n── CAMPO AUSENTE NAO E CAMPO VAZIO '+'─'.repeat(26));
/* O caso que originou o arquivo. Um componente de TECIDO e resolvido pela
   ficha por familia + cor + largura de bobina (secao 7-B): apagar qualquer um
   dos tres tira o tecido da ficha, e com ele o custo e a compra. */
{
  const t=criar({nome:'Blackout Sireno 3,2 BEGE', unidade:'m',
    familia:'blackout_sireno', cor:'BEGE', largura_bobina_cm:320,
    estoque_minimo:10, estoque_ideal:60});
  const id=t.corpo.id;
  /* ⚠️ O `nome` VAI no corpo, e e isso que torna o caso real: uma tela de
     cadastro manda nome, unidade e os dois numeros — e NAO manda familia, cor
     e bobina, que ela nem mostra. Sem o nome o POST era recusado por outro
     motivo ("nome obrigatório") e o caso passava sem ter olhado o defeito:
     verde pelo motivo errado, que e o que a secao 10 chama de pior que
     vermelho. Foi assim que a primeira versao deste arquivo saiu. */
  const r=chamar('POST','/api/componentes',
    {id, nome:'Blackout Sireno 3,2 BEGE', unidade:'m', estoque_minimo:25});
  ok('editar pela tela de cadastro devolve ok', r.status===200, ()=>JSON.stringify(r));
  const c=ler(id);
  ok('o minimo mudou', c.estoque_minimo===25);
  ok('⚠ a FAMILIA continua la', c.familia==='blackout_sireno', ()=>JSON.stringify(c));
  ok('⚠ a COR continua la', c.cor==='BEGE', ()=>JSON.stringify(c));
  ok('⚠ a LARGURA DE BOBINA continua la', c.largura_bobina_cm===320, ()=>JSON.stringify(c));
  ok('o nome continua la', c.nome==='Blackout Sireno 3,2 BEGE');
  ok('a unidade continua la', c.unidade==='m');
  ok('e o ideal, que nem foi citado, continua', c.estoque_ideal===60);
}
{
  /* Campo ausente preserva; campo com VAZIO apaga, e isso e decisao de quem
     editou — a mesma separacao do POST /api/config/kit/etiqueta (secao 4). */
  const t=criar({nome:'Com codigo', codigo:'CC1', unidade:'un'});
  chamar('POST','/api/componentes',{id:t.corpo.id, nome:'Com codigo', codigo:''});
  ok('mandar VAZIO de propósito apaga — ausente e vazio sao coisas diferentes',
     ler(t.corpo.id).codigo===null, ()=>JSON.stringify(ler(t.corpo.id)));
}

{
  /* E o outro lado da mesma regra: sem `nome` no corpo, o ausente preserva o
     gravado em vez de recusar. Hoje a rota exige nome em TODA escrita, o que e
     a mesma confusao entre "ausente" e "vazio" por outra ponta. */
  const t=criar({nome:'So o minimo', unidade:'un', estoque_ideal:40});
  const id=t.corpo.id;
  const r=chamar('POST','/api/componentes',{id, estoque_minimo:7});
  ok('POST so com id e um campo passa — nome ausente preserva o gravado',
     r.status===200, ()=>JSON.stringify(r));
  ok('e o nome continua', ()=>ler(id).nome==='So o minimo');
  ok('e o campo citado mudou', ()=>ler(id).estoque_minimo===7);
}

console.log('\n── numero impossivel e RECUSADO, nunca clampado '+'─'.repeat(14));
{
  const t=criar({nome:'Parafuso 4x40', unidade:'un', estoque_minimo:100, estoque_ideal:500});
  const id=t.corpo.id;
  for(const [campo,valor] of [['estoque_minimo','abc'],['estoque_minimo',-5],
                              ['estoque_ideal','x'],['estoque_ideal',-1]]){
    /* O nome vai junto pelo mesmo motivo do bloco acima: sem ele a recusa
       viria de outro lugar e o caso ficaria verde sem ter medido nada. */
    const r=chamar('POST','/api/componentes',
      Object.assign({id, nome:'Parafuso 4x40', unidade:'un'},{[campo]:valor}));
    ok('recusa '+campo+'='+JSON.stringify(valor)+' com 400', r.status===400,
       ()=>JSON.stringify(r));
    ok('  e o nome do campo aparece na recusa',
       ()=>new RegExp(campo.replace('_','.')).test(r.corpo.erro||'')
           || /mínimo|ideal/i.test(r.corpo.erro||''), ()=>String(r.corpo&&r.corpo.erro));
  }
  const c=ler(id);
  ok('⚠ e NADA foi gravado — os dois continuam como estavam',
     c.estoque_minimo===100 && c.estoque_ideal===500, ()=>JSON.stringify(c));
}
ok('zero continua valendo — "sem mínimo" e uma resposta',
   ()=>{ const t=criar({nome:'Sem minimo', unidade:'un', estoque_minimo:0});
         return ler(t.corpo.id).estoque_minimo===0; });

console.log('\n── desativar e o caminho de VOLTA '+'─'.repeat(27));
{
  const t=criar({nome:'Item que sai de linha', unidade:'un'});
  const id=t.corpo.id;
  chamar('DELETE','/api/componentes/:id',null,{id});
  ok('desativar nao apaga: a linha continua', !!ler(id));
  ok('e ela fica inativa', ler(id).ativo===0);
  const r=chamar('POST','/api/componentes',{id, nome:'Item que sai de linha', ativo:1});
  ok('reativar devolve ok', r.status===200, ()=>JSON.stringify(r));
  ok('⚠ e ele volta a ativo — desativar sem volta e meia decisao (§7)',
     ler(id).ativo===1);
  ok('o nome sobreviveu ao vaivem', ler(id).nome==='Item que sai de linha');
}
{
  /* `ativo` entra na MESMA regra do campo ausente: editar o minimo de um item
     desativado nao pode ressuscita-lo sozinho. */
  const t=criar({nome:'Fica inativo', unidade:'un'});
  const id=t.corpo.id;
  chamar('DELETE','/api/componentes/:id',null,{id});
  chamar('POST','/api/componentes',{id, nome:'Fica inativo', estoque_minimo:3});
  ok('editar sem citar `ativo` NAO reativa sozinho', ler(id).ativo===0,
     ()=>JSON.stringify(ler(id)));
}

console.log('\n── a lista que a tela le '+'─'.repeat(36));
{
  const r=chamar('GET','/api/componentes');
  const l=r.corpo||[];
  ok('a leitura devolve os inativos tambem — senao nao ha como reativar',
     l.some(c=>c.ativo===0), ()=>'ativos='+l.filter(c=>c.ativo).length+' inativos='+l.filter(c=>!c.ativo).length);
  ok('e os ativos vem primeiro', ()=>{
    const i=l.findIndex(c=>!c.ativo); return i<0 || l.slice(i).every(c=>!c.ativo); });
}

console.log('');
console.log(falhas ? ('FALHARAM '+falhas+' de '+casos)
                   : ('todos os '+casos+' casos passaram'));
try{ fs.rmSync(tmp,{recursive:true,force:true}); }catch(e){}
process.exit(falhas?1:0);
