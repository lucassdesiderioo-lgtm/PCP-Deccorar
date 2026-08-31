#!/usr/bin/env node
/* Zeragem de estoque para inventario geral.
 *
 * POR QUE ISSO EXISTE COMO SCRIPT E NAO COMO BOTAO: zerar tudo e uma operacao
 * de inventario, nao de rotina. Um botao "zerar estoque" na tela do admin seria
 * clicado por engano um dia — e nao ha desfazer. Aqui e preciso digitar o
 * comando, com --confirmar, num terminal do servidor.
 *
 * POR QUE ZERAR ANTES DE CONTAR: a tela de Contagem so enxerga o que foi
 * bipado. Peca que ACABOU nao tem o que bipar, entao ela nunca aparece na
 * tabela e nem "Lancar" nem "Ajustar" encostam nela — o sistema continua
 * achando que tem 5. Partindo de zero, o problema desaparece: o que nao for
 * contado FICA zero, sem ninguem precisar caçar a lista de nao contados.
 *
 * DEPOIS DE ZERAR, O BOTAO E "Lancar no estoque (soma)". A partir do zero,
 * somar o contado da exatamente o contado. E "Lancar" ainda deixa contar em
 * levas: ele limpa a sessao a cada lancamento, entao da pra bipar uma
 * prateleira, lancar, e seguir pra proxima sem perder o que ja entrou.
 *
 * ⚠ ENQUANTO O ESTOQUE ESTIVER ZERADO, A ETIQUETA DE VENDA NAO SAI.
 * `POST /api/embalar` (etq_route.js) recusa com "Sem estoque desse SKU" e a
 * tela mostra "SEM ESTOQUE — bloqueado" ja no bipe. Isso e protecao, nao bug:
 * so que durante o inventario ela para a expedicao inteira. Zere com a
 * expedicao parada — antes de abrir, ou depois do despacho.
 *
 * O MATERIAL NAO E ZERADO POR UPDATE. Passa por componente_dominio.movimentar,
 * o dono unico do saldo (regra 10 do COMPRAS.md §13), e cada zeragem deixa
 * linha em movimento_componente. E o que permite auditar a zeragem depois.
 *
 * USO
 *   node zerar_estoque.js                       simula, nao muda nada
 *   node zerar_estoque.js --confirmar           zera pecas E material
 *   node zerar_estoque.js --confirmar --pecas   zera so as pecas acabadas
 *   node zerar_estoque.js --confirmar --material  zera so a materia prima
 *
 *   --db <caminho>     banco (padrao /opt/expedicao/dados.db)
 *   --saida <pasta>    onde gravar os CSV do "antes" (padrao ./backups)
 *   --forcar           ignora as travas de seguranca (leia o aviso antes)
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const COMPONENTE = require('./componente_dominio');

// ── argumentos ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const temFlag = f => argv.indexOf(f) >= 0;
const valorDe = (f, padrao) => { const i = argv.indexOf(f); return i >= 0 && argv[i+1] ? argv[i+1] : padrao; };

const CONFIRMAR = temFlag('--confirmar');
const FORCAR    = temFlag('--forcar');
const SAIDA     = valorDe('--saida', path.join(__dirname, 'backups'));
const CAMINHO   = valorDe('--db', '/opt/expedicao/dados.db');
/* Sem --pecas nem --material, faz os dois. Pedir um deles restringe ao pedido:
   quem digitou "--pecas" quis dizer "so as pecas". */
const soPecas   = temFlag('--pecas');
const soMaterial= temFlag('--material');
const FAZ_PECAS    = soPecas || !soMaterial;
const FAZ_MATERIAL = soMaterial || !soPecas;

if(!fs.existsSync(CAMINHO)){
  console.error('Banco nao encontrado: ' + CAMINHO + '\nUse --db <caminho> se ele estiver em outro lugar.');
  process.exit(1);
}

const db = new Database(CAMINHO);
db.pragma('journal_mode = WAL');

const agora = new Date();
const p2 = n => String(n).padStart(2,'0');
const DATA = agora.getFullYear()+'-'+p2(agora.getMonth()+1)+'-'+p2(agora.getDate());
const HORA = p2(agora.getHours())+p2(agora.getMinutes());
const CARIMBO = DATA + '_' + HORA;

const q3 = n => Math.round((+n||0)*1000)/1000;
const existeTabela = t => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);

// ── travas de seguranca ─────────────────────────────────────────────────────
/* Cada uma dessas ja custou dado real em algum sistema. Elas nao adivinham a
   intencao: dizem o que esta errado e param. --forcar passa por cima, e ai a
   responsabilidade e de quem digitou. */
const impedimentos = [];

/* MODO TESTE: o teste_route fotografa skus.estoque e componente.estoque ao
   ligar, e "apagar o teste" RESTAURA a foto. Zerar com o modo ligado e trabalho
   que some sozinho depois — e some em silencio. */
if(existeTabela('config')){
  const m = db.prepare("SELECT valor FROM config WHERE chave='modo_teste'").get();
  if(m && m.valor === '1')
    impedimentos.push('MODO TESTE ESTA LIGADO. Ao encerrar o teste com "apagar", o estoque volta pra foto e a zeragem some. Desligue o modo teste antes.');
}

/* Ajustes de contagem esperando aprovacao guardam `sistema_era` do momento em
   que foram enfileirados. Aprovar depois da zeragem aplicaria numeros de outro
   inventario por cima deste. */
if(existeTabela('contagem_pendente')){
  const p = db.prepare('SELECT COUNT(*) c FROM contagem_pendente WHERE aprovado=0').get().c;
  if(p) impedimentos.push(p + ' ajuste(s) de contagem aguardando aprovacao. Aprove ou rejeite na aba Contagem antes de zerar — aprovar depois aplica numeros velhos por cima.');
}

// ── avisos (nao impedem, mas mudam a hora certa de rodar) ───────────────────
const avisos = [];
if(existeTabela('lote')){
  const pend = db.prepare("SELECT COUNT(*) c FROM lote WHERE data=date('now','localtime') AND estagio='pendente'").get().c;
  if(pend) avisos.push(pend + ' venda(s) de hoje ainda pendente(s) de etiqueta. Com o estoque zerado NENHUMA delas imprime ate a contagem ser lancada.');
}
if(existeTabela('fila')){
  const fila = db.prepare("SELECT COUNT(*) c FROM fila WHERE situacao='aguardando'").get().c;
  if(fila) avisos.push(fila + ' peca(s) na fila de embalagem. Elas ainda NAO sao estoque — nao devem ser contadas na prateleira.');
}
if(existeTabela('contagem')){
  const sobra = db.prepare('SELECT COUNT(*) c FROM contagem').get().c;
  if(sobra) avisos.push(sobra + ' linha(s) de contagem em sessao aberta. Clique "Nova contagem" na aba Contagem antes de comecar, senao elas somam na sua.');
}

// ── foto do "antes" ─────────────────────────────────────────────────────────
/* Contagem sem o "antes" nao da pra auditar: a diferenca entre o que o sistema
   dizia e o que a prateleira tinha e o unico numero que este dia produz. */
const csv = v => { const s = String(v==null ? '' : v); return /[",;\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
const linhaCsv = arr => arr.map(csv).join(',');

const pecas = FAZ_PECAS
  ? db.prepare('SELECT codigo, estoque, alvo FROM skus ORDER BY codigo').all() : [];
const materiais = (FAZ_MATERIAL && existeTabela('componente'))
  ? db.prepare("SELECT id, COALESCE(codigo,'') codigo, nome, COALESCE(unidade,'un') unidade, COALESCE(estoque,0) estoque, COALESCE(custo_medio,0) custo_medio FROM componente WHERE ativo=1 ORDER BY nome").all()
  : [];

if(FAZ_MATERIAL && !existeTabela('componente'))
  avisos.push('Tabela `componente` nao existe neste banco — nada de material a zerar.');

const somaPecas = pecas.reduce((a,s)=>a+(+s.estoque||0), 0);
const comPecas  = pecas.filter(s=>(+s.estoque||0) !== 0).length;
const comMat    = materiais.filter(c=>q3(c.estoque) !== 0).length;

console.log('');
console.log('  Banco   : ' + CAMINHO);
console.log('  Data    : ' + DATA + ' ' + p2(agora.getHours()) + ':' + p2(agora.getMinutes()));
console.log('  Escopo  : ' + [FAZ_PECAS?'pecas':null, FAZ_MATERIAL?'material':null].filter(Boolean).join(' + '));
console.log('');
if(FAZ_PECAS)    console.log('  Pecas   : ' + pecas.length + ' SKU(s), ' + comPecas + ' com saldo, ' + somaPecas + ' peca(s) no total');
if(FAZ_MATERIAL) console.log('  Material: ' + materiais.length + ' componente(s) ativo(s), ' + comMat + ' com saldo');
console.log('');

avisos.forEach(a => console.log('  [aviso] ' + a));
impedimentos.forEach(i => console.log('  [PARE]  ' + i));
if(avisos.length || impedimentos.length) console.log('');

if(impedimentos.length && !FORCAR){
  console.log('  Nada foi alterado. Resolva o(s) item(ns) acima, ou use --forcar se souber o que esta fazendo.');
  console.log('');
  process.exit(2);
}

if(!CONFIRMAR){
  console.log('  SIMULACAO — nada foi alterado.');
  console.log('  Para valer: node zerar_estoque.js --confirmar' + (soPecas?' --pecas':'') + (soMaterial?' --material':''));
  console.log('');
  process.exit(0);
}

fs.mkdirSync(SAIDA, {recursive:true});
const arquivos = [];
if(FAZ_PECAS){
  const f = path.join(SAIDA, 'antes_pecas_' + CARIMBO + '.csv');
  fs.writeFileSync(f, ['codigo,estoque,alvo'].concat(pecas.map(s=>linhaCsv([s.codigo, s.estoque, s.alvo]))).join('\n') + '\n', 'utf8');
  arquivos.push(f);
}
if(FAZ_MATERIAL && materiais.length){
  const f = path.join(SAIDA, 'antes_material_' + CARIMBO + '.csv');
  fs.writeFileSync(f, ['id,codigo,nome,unidade,estoque,custo_medio'].concat(
    materiais.map(c=>linhaCsv([c.id, c.codigo, c.nome, c.unidade, c.estoque, c.custo_medio]))).join('\n') + '\n', 'utf8');
  arquivos.push(f);
}

// ── zeragem ─────────────────────────────────────────────────────────────────
let zeradasPecas = 0, zeradosMat = 0;
db.transaction(()=>{
  /* Peca: UPDATE direto, do mesmo jeito que a contagem faz (cont_route.js:120).
     skus.estoque nao tem dono unico — e a divida registrada no CLAUDE.md, e nao
     e este script que vai consertar isso. O CSV do "antes" e o que sobra de
     historia aqui, e por isso ele e gravado ANTES e nao e opcional. */
  if(FAZ_PECAS)
    zeradasPecas = db.prepare('UPDATE skus SET estoque=0 WHERE estoque<>0').run().changes;

  /* Material: NUNCA por UPDATE. movimentar() e o dono unico do saldo e deixa a
     linha em movimento_componente — com --forcar em modo teste o trigger marca
     teste=1 sozinho, entao nao ha o que passar aqui. */
  if(FAZ_MATERIAL) materiais.forEach(c=>{
    const saldo = q3(COMPONENTE.saldo(db, c.id).estoque);
    if(saldo === 0) return;                       // delta zero nao e movimento
    COMPONENTE.movimentar(db, {
      componente_id: c.id,
      delta: q3(-saldo),
      motivo: 'contagem',
      referencia: 'zeragem inventario ' + DATA,
      usuario_nome: 'zerar_estoque.js'
    });
    zeradosMat++;
  });
})();

console.log('  ZERADO.');
if(FAZ_PECAS)    console.log('  - ' + zeradasPecas + ' SKU(s) de peca zerado(s)');
if(FAZ_MATERIAL) console.log('  - ' + zeradosMat + ' componente(s) zerado(s), com movimento registrado');
arquivos.forEach(f => console.log('  - foto do antes: ' + f));
console.log('');
console.log('  PROXIMO PASSO: Admin -> aba Contagem -> "Nova contagem" -> bipe tudo');
console.log('  -> botao "Lancar no estoque (soma)".  NAO use "Ajustar" nesta rodada:');
console.log('  partindo do zero, somar o contado ja da o contado, e "Lancar" deixa');
console.log('  contar em levas sem perder o que ja entrou.');
console.log('');
db.close();
