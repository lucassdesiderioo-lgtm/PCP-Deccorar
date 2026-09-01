#!/usr/bin/env node
/* Repoe linhas na fila de embalagem — o desfazer do `limpar_fila.js`.
 *
 *   node repor_fila.js --itens "BK130130BEGE=10, BK150150BRANCO=9"
 *   node repor_fila.js --lista lista.txt
 *   node repor_fila.js --lista lista.txt --confirmar
 *   node repor_fila.js --lista lista.txt --definir      o numero e o TOTAL final
 *   node repor_fila.js --testar          so a leitura e a conta, sem banco
 *
 * DUAS PERGUNTAS DIFERENTES, E A LISTA NAO DIZ QUAL DELAS E
 * "BK130130BEGE 10" tanto pode ser "acrescente 10" quanto "deixe 10 no total" —
 * e com 2 ja na fila as duas dao numeros diferentes (12 e 10). Quem digita a
 * lista sabe qual e; o script nao tem como adivinhar, entao ele nao adivinha:
 *   sem flag   ACRESCENTA   soma ao que ja esta la (peca nova revisada)
 *   --definir  DEFINE       o numero e o total final; a diferenca entra ou sai
 * O --definir e o que serve para contar o carrinho: conta-se o que existe e
 * escreve-se o que existe, sem ter que descobrir a diferenca de cabeca — e
 * subtrair de cabeca e exatamente onde a contagem erra.
 *
 * POR QUE ISTO EXISTE
 * A `fila` guarda a peca REVISADA que ainda nao foi embalada. Quem a apaga
 * (inventario, `limpar_fila.js`, um DELETE a mao) nao mexe em estoque nenhum —
 * §2: o +1 acontece na embalagem, nao na revisao. Mas a peca fisica continua no
 * carrinho, e some da tela de Embalagem. O unico caminho de volta pelo sistema
 * e revisar tudo de novo, dois bipes por peca: 100 pecas viram 200 bipes de
 * trabalho que ja foi feito. Quando isso custa caro demais, a bancada embala
 * sem a fila — e ai a embalagem entra como modo 'estoque' e deixa de abater a
 * ordem do dia, calada. E a armadilha #6 outra vez: o desvio que a equipe
 * aprende a fazer porque o sistema nao tem a porta.
 *
 * O QUE ELE NAO FAZ — E ISSO E O PONTO
 *   - NAO mexe em estoque. A fila nunca somou +1 (§2), entao repor nao pode
 *     somar. Quem soma e o bipe 3 da embalagem, quando a peca for embalada.
 *   - NAO grava revisao. A peca nao esta sendo revisada agora; o que se repara
 *     e a linha da fila que sumiu. Inventar linha em `revisao` sujaria o tempo
 *     medio e o relatorio de produtividade com trabalho que nao aconteceu.
 *   - NAO cria SKU. Fora do cadastro, recusa a lista inteira (§6) — numa lista
 *     digitada a mao, SKU desconhecido e quase sempre erro de digitacao, e
 *     inserir "o resto" esconderia justamente a linha que precisa de olho.
 *   - NAO encosta em quem ja foi embalado. So `situacao='aguardando'` entra na
 *     conta e so ela e apagada: a linha `embalado` e historia de peca que virou
 *     estoque, e apagar historia seria desfazer um +1 que aconteceu.
 *   - NAO mexe, sem --so-a-lista, no SKU que nao esta na lista. Contar dez SKUs
 *     nao e afirmar nada sobre o decimo primeiro.
 *
 * ⚠ CONFIRA O CARRINHO ANTES. Cada linha reposta e uma peca que a tela de
 * Embalagem vai cobrar. Linha sem peca fisica atras e o passivo que o
 * `limpar_fila.js` existe para fechar — repor errado e recria-lo.
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const temFlag = f => argv.indexOf(f) >= 0;
const valorDe = (f, padrao) => { const i = argv.indexOf(f); return i >= 0 && argv[i+1] ? argv[i+1] : padrao; };

const CONFIRMAR = temFlag('--confirmar');
const DEFINIR   = temFlag('--definir');
const SO_LISTA  = temFlag('--so-a-lista');
const CAMINHO   = valorDe('--db', '/opt/expedicao/dados.db');
const SAIDA     = valorDe('--saida', path.join(path.dirname(CAMINHO), 'backups'));
const MODO      = valorDe('--modo', 'estoque');
const EM        = valorDe('--em', null);
const POR       = valorDe('--por', 'script repor_fila');
const MOTIVO    = valorDe('--motivo', 'reposicao de linhas apagadas da fila');

/* ── O leitor da lista ──────────────────────────────────────────────────────
   A lista chega como a pessoa a escreveu — "bk130130bege - 8", colada do
   WhatsApp ou do caderno. Ela NAO pode ser lida quebrando por espaco: SKU tem
   espaco desde 23/08/2026 (§7, `ROLO SOB MEDIDA 137x212` e codigo valido), e
   quebrar por token transformaria esse codigo em quatro pedacos.
   Por isso a regra e ao contrario: a QUANTIDADE e o numero no fim da linha, e
   o codigo e tudo que vem antes. O separador (- = :) e opcional. */
function lerLista(texto, definir){
  const itens = [], erros = [];
  String(texto||'').split(/[\n,;]+/).forEach(bruto => {
    const linha = String(bruto).replace(/[.,;\s]+$/,'').trim();
    if(!linha || linha[0] === '#') return;
    /* Greedy nos dois: o codigo pode conter hifen e digito, entao vale o
       ULTIMO separador da linha, nunca o primeiro. */
    let m = linha.match(/^(.+)\s*[-=:]\s*(\d+)$/) || linha.match(/^(.+)\s+(\d+)$/);
    if(!m){ erros.push({linha:linha, erro:'sem quantidade'}); return; }
    const codigo = m[1].replace(/[\s-=:]+$/,'').trim();
    const qtd = parseInt(m[2],10);
    if(!codigo){ erros.push({linha:linha, erro:'sem codigo'}); return; }
    /* ZERO E LANCAMENTO VALIDO NO --definir, e so nele. Acrescentar zero nao
       quer dizer nada; mas "contei o carrinho e nao tem nenhuma" e uma
       informacao — e a unica forma de o SKU que acabou entrar na contagem em
       vez de ficar de fora dela, que e o que mantem o numero errado de pe. */
    if(qtd === 0 && !definir){ erros.push({linha:linha, erro:'zero so vale com --definir (o total final)'}); return; }
    if(!(qtd >= 0)){ erros.push({linha:linha, erro:'quantidade invalida'}); return; }
    itens.push({codigo:codigo, qtd:qtd});
  });
  const juntos = [];
  itens.forEach(it => {
    const ja = juntos.filter(j => j.codigo.toUpperCase() === it.codigo.toUpperCase())[0];
    /* Somar o SKU repetido so faz sentido quando o numero e um ACRESCIMO: "8"
       numa linha e "+2" noutra e como a lista chega quando alguem lembra de
       mais duas depois. No --definir os dois numeros sao totais finais, e dois
       totais para o mesmo SKU se contradizem — somar ali inventaria uma
       terceira resposta que ninguem escreveu. */
    if(ja && definir) erros.push({linha:it.codigo, erro:'citado duas vezes; no --definir cada numero e o total final, entao os dois se contradizem'});
    else if(ja) ja.qtd += it.qtd;
    else juntos.push({codigo:it.codigo, qtd:it.qtd});
  });
  return {itens:juntos, erros:erros};
}

/* ── A conta: do que a lista diz para o que vai mudar na fila ────────────────
   Separada do banco de proposito — e ela que o --testar exercita. `atual` e o
   que ha de `aguardando` hoje; `alvo` e onde a lista quer chegar. */
function planear(itens, filaPorUpper, opts){
  opts = opts || {};
  const acoes = [], naLista = {};
  itens.forEach(it => {
    const chave = it.codigo.toUpperCase();
    naLista[chave] = true;
    const atual = filaPorUpper[chave] || 0;
    const alvo = opts.definir ? it.qtd : atual + it.qtd;
    acoes.push({codigo:it.codigo, atual:atual, alvo:alvo, delta:alvo - atual});
  });
  /* Sem --so-a-lista o SKU ausente fica como esta: contar dez SKUs nao afirma
     nada sobre o decimo primeiro, e zerar por omissao apagaria a peca de um
     carrinho que ninguem foi conferir. */
  if(opts.definir && opts.soALista){
    Object.keys(filaPorUpper).sort().forEach(chave => {
      if(naLista[chave] || !filaPorUpper[chave]) return;
      acoes.push({codigo:(opts.nomes && opts.nomes[chave]) || chave, atual:filaPorUpper[chave],
                  alvo:0, delta:-filaPorUpper[chave], foraDaLista:true});
    });
  }
  return acoes;
}

/* ── Autoteste do leitor ────────────────────────────────────────────────────
   Sem banco: `node repor_fila.js --testar`. O caso do SKU com espaco esta aqui
   porque e o que uma leitura por token quebraria sem dar erro. */
if(temFlag('--testar')){
  const casos = [
    ['bk130130bege - 8',              [{codigo:'bk130130bege', qtd:8}]],
    ['BK160160CINZA 23',              [{codigo:'BK160160CINZA', qtd:23}]],
    ['bk150150branco=9',              [{codigo:'bk150150branco', qtd:9}]],
    ['ROLO SOB MEDIDA 137x212 - 3',   [{codigo:'ROLO SOB MEDIDA 137x212', qtd:3}]],
    ['bk130130bege - 8\nbk130130bege - 2', [{codigo:'bk130130bege', qtd:10}]],
    ['# comentario\n\nkit32 - 4',     [{codigo:'kit32', qtd:4}]],
    ['bk180150bege - 6, bk180150branco - 5',
       [{codigo:'bk180150bege', qtd:6},{codigo:'bk180150branco', qtd:5}]]
  ];
  let falhou = 0, feitos = 0;
  const confere = (nome, veio, esperado) => {
    feitos++;
    if(JSON.stringify(veio) === JSON.stringify(esperado)) return;
    falhou++;
    console.log('  FALHOU ' + nome + '\n    esperado ' + JSON.stringify(esperado) +
                '\n    veio     ' + JSON.stringify(veio));
  };

  casos.forEach((c,i) => confere('leitura ' + (i+1) + ': ' + JSON.stringify(c[0]), lerLista(c[0]).itens, c[1]));

  const recusa = lerLista('BK130130BEGE\nBK130130BEGE - 0');
  confere('linha sem quantidade e zero sem --definir viram erro',
    [recusa.itens.length, recusa.erros.length], [0, 2]);
  confere('zero vale com --definir', lerLista('BK130130BEGE - 0', true).itens,
    [{codigo:'BK130130BEGE', qtd:0}]);
  confere('SKU repetido no --definir e contradicao, nao soma',
    lerLista('bege - 8, bege - 2', true).erros.length, 1);

  /* A conta. O caso que importa e o terceiro: a fila com MAIS do que a lista
     pede tem que devolver delta negativo, senao "definir" viraria "nunca
     diminui" e o numero da tela ficaria sempre acima do carrinho. */
  const fila = {BK130130BEGE:2, BK160140CINZA:9, BK999OUTRO:4};
  confere('acrescentar soma ao que ja existe',
    planear([{codigo:'BK130130BEGE', qtd:10}], fila, {}),
    [{codigo:'BK130130BEGE', atual:2, alvo:12, delta:10}]);
  confere('definir com a fila abaixo do alvo insere a diferenca',
    planear([{codigo:'BK130130BEGE', qtd:10}], fila, {definir:true}),
    [{codigo:'BK130130BEGE', atual:2, alvo:10, delta:8}]);
  confere('definir com a fila acima do alvo apaga o excedente',
    planear([{codigo:'BK160140CINZA', qtd:5}], fila, {definir:true}),
    [{codigo:'BK160140CINZA', atual:9, alvo:5, delta:-4}]);
  confere('definir no numero que ja esta la nao mexe em nada',
    planear([{codigo:'BK130130BEGE', qtd:2}], fila, {definir:true}),
    [{codigo:'BK130130BEGE', atual:2, alvo:2, delta:0}]);
  confere('definir zero esvazia o SKU',
    planear([{codigo:'BK130130BEGE', qtd:0}], fila, {definir:true}),
    [{codigo:'BK130130BEGE', atual:2, alvo:0, delta:-2}]);
  confere('SKU fora da lista fica como esta',
    planear([{codigo:'BK130130BEGE', qtd:2}], fila, {definir:true}).length, 1);
  confere('--so-a-lista zera quem nao foi citado',
    planear([{codigo:'BK130130BEGE', qtd:2}], fila, {definir:true, soALista:true}).filter(a => a.foraDaLista),
    [{codigo:'BK160140CINZA', atual:9, alvo:0, delta:-9, foraDaLista:true},
     {codigo:'BK999OUTRO',    atual:4, alvo:0, delta:-4, foraDaLista:true}]);
  /* A lista chega minuscula e a fila esta em maiuscula: sem casar por UPPER, o
     --definir veria zero na fila e inseriria tudo de novo, dobrando o carrinho. */
  confere('a conta casa o codigo ignorando maiusculas',
    planear([{codigo:'bk130130bege', qtd:10}], fila, {definir:true})[0].delta, 8);

  console.log('');
  console.log(falhou ? '  '+falhou+' de '+feitos+' caso(s) falharam.' : '  '+feitos+' casos OK.');
  console.log('');
  process.exit(falhou ? 1 : 0);
}

const TEXTO = temFlag('--lista')
  ? (function(){ const f = valorDe('--lista',''); if(!fs.existsSync(f)){ console.error('Lista nao encontrada: '+f); process.exit(1); } return fs.readFileSync(f,'utf8'); })()
  : valorDe('--itens', '');

if(!String(TEXTO).trim()){
  console.error('Passe a lista: --itens "SKU=QTD, SKU=QTD"  ou  --lista arquivo.txt');
  process.exit(1);
}
if(MODO !== 'hoje' && MODO !== 'estoque' && MODO !== 'devolucao'){
  console.error('--modo tem que ser hoje, estoque ou devolucao (veio: '+MODO+')');
  process.exit(1);
}
if(EM && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(EM)){
  console.error('--em tem que ser "AAAA-MM-DD HH:MM" (veio: '+EM+')');
  process.exit(1);
}
if(SO_LISTA && !DEFINIR){
  console.error('--so-a-lista so faz sentido com --definir: sem ele o numero e um acrescimo,\ne "acrescente nada" nao e motivo para esvaziar a fila dos outros SKUs.');
  process.exit(1);
}
if(!fs.existsSync(CAMINHO)){
  console.error('Banco nao encontrado: ' + CAMINHO + '\nUse --db <caminho> se ele estiver em outro lugar.');
  process.exit(1);
}

const Database = require('better-sqlite3');

(async () => {
const db = new Database(CAMINHO);
const p2 = n => String(n).padStart(2,'0');
const agora = new Date();
const CARIMBO = agora.getFullYear()+'-'+p2(agora.getMonth()+1)+'-'+p2(agora.getDate())+'_'+p2(agora.getHours())+p2(agora.getMinutes());

const lido = lerLista(TEXTO, DEFINIR);

console.log('');
console.log('  Banco : ' + CAMINHO);
console.log('  Conta : ' + (DEFINIR
  ? 'DEFINIR   o numero da lista e o TOTAL final na fila'
  : 'ACRESCENTAR   o numero da lista soma ao que ja esta na fila')
  + (SO_LISTA ? '  (+ zera quem nao esta na lista)' : ''));
console.log('  Modo  : ' + MODO + (MODO==='estoque'
  ? '   (a embalagem NAO abate a ordem do dia)'
  : MODO==='hoje' ? '   (a embalagem abate a ordem do dia)' : ''));
console.log('');

if(lido.erros.length){
  console.log('  NAO ENTENDI ESTAS LINHAS');
  lido.erros.forEach(e => console.log('    ' + e.linha.padEnd(34) + e.erro));
  console.log('    ^ o formato e "CODIGO - QUANTIDADE" (o numero vai no fim).');
  console.log('');
  db.close(); process.exit(1);
}
if(!lido.itens.length){ console.log('  Lista vazia.'); console.log(''); db.close(); return; }

/* O codigo gravado e o do CADASTRO, nao o que veio digitado. `skus.codigo` e
   PRIMARY KEY TEXT — case-sensitive —, e o bipe da embalagem procura por
   igualdade. Uma linha de fila com o case errado nao seria achada pelo leitor:
   a peca apareceria na tela e o bipe diria que ela nao existe. */
const cadastro = db.prepare('SELECT codigo FROM skus').all();
const porUpper = {};
cadastro.forEach(s => { porUpper[String(s.codigo).toUpperCase()] = s.codigo; });

/* SOMA, nao atribui: o GROUP BY do SQLite e case-sensitive, entao a mesma peca
   gravada como BK130130BEGE e bk130130bege volta em DUAS linhas. Atribuir faria
   a segunda apagar a primeira, o --definir enxergaria menos fila do que existe
   e inseriria a diferenca de novo — peca a mais na tela, sem peca no carrinho. */
const naFila = db.prepare("SELECT codigo, COUNT(*) c FROM fila WHERE situacao='aguardando' GROUP BY codigo").all();
const filaDe = {};
naFila.forEach(f => { const k = String(f.codigo).toUpperCase(); filaDe[k] = (filaDe[k]||0) + f.c; });

/* O nome como ele esta NA FILA, para a linha do --so-a-lista falar do codigo
   que a pessoa vai procurar na tela, e nao de uma versao maiuscula dele. */
const nomeNaFila = {};
naFila.forEach(f => { nomeNaFila[String(f.codigo).toUpperCase()] = f.codigo; });

const semCadastro = [];
lido.itens.forEach(it => {
  const canon = porUpper[it.codigo.toUpperCase()];
  it.gravar = canon || null;
  if(!canon) semCadastro.push(it.codigo);
});

if(semCadastro.length){
  console.log('');
  console.log('  ⚠ FORA DO CADASTRO DE SKU — nada foi gravado (§6)');
  semCadastro.forEach(c => console.log('    ' + c));
  console.log('');
  console.log('  Cadastre em Admin -> Cadastro de SKU (ou corrija a digitacao) e rode de novo.');
  console.log('  A lista inteira fica de fora de proposito: numa lista digitada a mao, SKU');
  console.log('  desconhecido quase sempre e erro de digitacao, e gravar "o resto" esconderia');
  console.log('  a unica linha que precisava de olho.');
  console.log('');
  db.close(); process.exit(1);
}

/* MODO TESTE E RUINA SILENCIOSA AQUI. O trigger do teste_route marca teste=1
   em todo INSERT enquanto ele estiver ligado (§11) — as linhas nasceriam
   marcadas e sumiriam ao encerrar o teste com "apagar", sem aviso nenhum. */
try{
  const m = db.prepare("SELECT valor FROM config WHERE chave='modo_teste'").get();
  if(m && m.valor === '1'){
    console.log('');
    console.log('  ⚠ MODO TESTE LIGADO — nada foi gravado.');
    console.log('  O trigger marcaria estas linhas como teste, e encerrar o teste com');
    console.log('  "apagar" as levaria junto. Desligue o modo teste e rode de novo.');
    console.log('');
    db.close(); process.exit(1);
  }
}catch(e){}

const acoes = planear(lido.itens.map(it => ({codigo:it.gravar, qtd:it.qtd})), filaDe,
  {definir:DEFINIR, soALista:SO_LISTA, nomes:nomeNaFila});

let inserir = 0, apagar = 0;
acoes.forEach(a => { if(a.delta > 0) inserir += a.delta; else apagar += -a.delta; });

console.log('  O QUE VAI MUDAR');
console.log('    ' + 'CODIGO'.padEnd(28) + 'na fila'.padStart(8) + 'alvo'.padStart(6) + '   acao');
acoes.forEach(a => {
  const acao = a.delta > 0 ? 'insere ' + a.delta
             : a.delta < 0 ? 'APAGA ' + (-a.delta) + (a.foraDaLista ? '  <- nao esta na lista' : '')
             : 'ja esta assim';
  console.log('    ' + String(a.codigo).padEnd(28) + String(a.atual).padStart(8) +
              String(a.alvo).padStart(6) + '   ' + acao);
});
console.log('    ' + ''.padEnd(28) + ''.padStart(8) + ''.padStart(6) + '   ' +
  inserir + ' a inserir, ' + apagar + ' a apagar');

if(!inserir && !apagar){
  console.log('');
  console.log('  A fila ja esta exatamente assim — nada a fazer.');
  console.log('');
  db.close(); return;
}

/* A ORDEM DE QUEM SAI E DELIBERADA:
     1. a linha de devolucao fica por ultimo — apagar aquela perde o vinculo
        com a devolucao que mandou reembalar (§9);
     2. depois, a que NAO bate com o codigo do cadastro no case — essa e a
        linha quebrada, que aparece na tela e o bipe nao acha;
     3. entre as que sobram, sai a mais NOVA: a mais antiga e a que carrega a
        historia da peca, e e ela que a tela de Embalagem poe na frente. */
const escolher = db.prepare(`SELECT id, codigo, modo, revisado_em, data FROM fila
  WHERE situacao='aguardando' AND UPPER(codigo)=UPPER(?)
  ORDER BY (modo='devolucao') ASC, (codigo=?) ASC, revisado_em DESC, id DESC
  LIMIT ?`);

/* AS LINHAS QUE SAEM SAO ESCOLHIDAS ANTES DE PERGUNTAR, e nao depois de
   confirmar: quem decide precisa ver QUAIS sao, nao so quantas. Uma linha
   revisada hoje quase sempre tem peca no carrinho; uma de dois meses atras
   quase nunca tem — e essa diferenca nao cabe num numero. */
const aSair = [];
acoes.forEach(a => { if(a.delta < 0) escolher.all(a.codigo, a.codigo, -a.delta).forEach(l => aSair.push(l)); });

if(aSair.length){
  const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
  const faixa = l => {
    const d = String(l.revisado_em || l.data || '').slice(0,10);
    if(!d) return '(sem data)';
    if(d === hoje) return 'revisadas HOJE';
    const dias = Math.round((new Date(hoje+'T12:00:00') - new Date(d+'T12:00:00')) / 86400000);
    return dias <= 7 ? 'ultimos 7 dias' : dias <= 30 ? 'ate 30 dias' : 'mais de 30 dias';
  };
  const porFaixa = {};
  aSair.forEach(l => { const f = faixa(l); porFaixa[f] = (porFaixa[f]||0) + 1; });

  console.log('');
  console.log('  ⚠ ' + aSair.length + ' linha(s) VAO SER APAGADAS da fila. Por idade da revisao:');
  ['revisadas HOJE','ultimos 7 dias','ate 30 dias','mais de 30 dias','(sem data)']
    .filter(k => porFaixa[k]).forEach(k => console.log('    ' + k.padEnd(18) + porFaixa[k]));
  if(porFaixa['revisadas HOJE'])
    console.log('    ^ revisada hoje quase sempre tem peca no carrinho. Confira a bancada.');

  const devol = aSair.filter(l => l.modo === 'devolucao');
  if(devol.length){
    console.log('');
    console.log('  ⚠ ' + devol.length + ' delas vieram de DEVOLUCAO (peca que voltou do ML para');
    console.log('  reembalar). Apagar perde o vinculo com a devolucao (§9); a peca fisica');
    console.log('  continua na fabrica. Sao as ultimas da fila a serem escolhidas — se elas');
    console.log('  estao aqui, e porque o alvo do SKU e menor que o resto.');
    devol.slice(0,10).forEach(l => console.log('    #' + l.id + '  ' + String(l.codigo).padEnd(26) + l.revisado_em));
  }
  console.log('');
  console.log('  Sai primeiro a mais NOVA de cada SKU (a antiga carrega a historia), a de');
  console.log('  devolucao por ultimo. Nenhuma linha ja `embalado` e tocada: aquilo e peca');
  console.log('  que virou estoque. O que sair vai para um CSV ao lado do backup.');
}

/* Reposicao anterior a vista: rodar duas vezes e o erro natural deste script,
   e ele nao tem como saber sozinho se a peca ja voltou. */
try{
  const antes = db.prepare(`SELECT criado_em, alvo, detalhe FROM auditoria
    WHERE categoria='fila' AND acao='reposta' ORDER BY id DESC LIMIT 5`).all();
  if(antes.length){
    console.log('');
    console.log('  JA HOUVE REPOSICAO ANTES (5 ultimas)');
    antes.forEach(a => console.log('    ' + String(a.criado_em).slice(0,16) + '  ' +
      String(a.alvo).padEnd(24) + a.detalhe));
    console.log('    ^ confira se esta lista nao esta sendo lancada duas vezes.');
  }
}catch(e){}

console.log('');
console.log('  O estoque nao e tocado: a fila nunca somou +1 (§2). O +1 acontece quando a');
console.log('  peca for embalada, no bipe 3.');

if(!CONFIRMAR){
  console.log('');
  console.log('  SIMULACAO — nada foi gravado.');
  console.log('  Para valer: repita o comando com --confirmar');
  console.log('');
  db.close(); return;
}

fs.mkdirSync(SAIDA, {recursive:true});
const bkp = path.join(SAIDA, 'antes-repor-fila-' + CARIMBO + '.db');
await db.backup(bkp);

/* `revisado_em` e o que ordena a tela de Embalagem. Sem --em, as linhas entram
   com a hora de agora e vao para o fim da fila — que e honesto: nao sabemos
   quando a peca foi revisada de verdade. Com --em, quem sabe a data original
   poe a peca de volta no lugar dela na ordem. */
const ins = EM
  ? db.prepare("INSERT INTO fila (codigo,modo,revisado_em,data) VALUES (?,?,?,date(?))")
  : db.prepare("INSERT INTO fila (codigo,modo) VALUES (?,?)");

const aud = (function(){
  try{ db.prepare('SELECT 1 FROM auditoria LIMIT 1').get();
    return db.prepare(`INSERT INTO auditoria (usuario_id,usuario_nome,categoria,acao,alvo,detalhe,ip)
      VALUES (NULL,?,'fila','reposta',?,?,'')`);
  }catch(e){ return null; }
})();

/* O DELETE repete a condicao `aguardando` de proposito. As linhas foram
   escolhidas alguns segundos antes, para poderem ser mostradas; se nesse
   intervalo a bancada bipou o terceiro bipe de uma delas, ela virou `embalado`
   — e apagar por id apagaria a historia de uma peca que ja somou +1 no
   estoque. Assim ela apenas nao sai, e a contagem final diz a verdade. */
const del = db.prepare("DELETE FROM fila WHERE id=? AND situacao='aguardando'");

const saiu = [];
const feito = db.transaction(() => {
  let mais = 0, menos = 0;
  acoes.forEach(a => {
    if(a.delta > 0){
      for(let i = 0; i < a.delta; i++){
        if(EM) ins.run(a.codigo, MODO, EM.length === 16 ? EM+':00' : EM, EM.slice(0,10));
        else   ins.run(a.codigo, MODO);
        mais++;
      }
    }
    /* Uma linha de auditoria por SKU, nao por peca: o que se quer saber depois
       e "quem mexeu no que", nao ler 100 linhas iguais. O texto guarda de onde
       para onde — sem o "de", o numero sozinho nao deixa refazer a conta. */
    if(aud && a.delta !== 0)
      aud.run(POR, a.codigo, a.atual + ' -> ' + a.alvo + ' (' + (a.delta > 0 ? '+' : '') + a.delta +
        ') na fila' + (a.delta > 0 ? ' (modo ' + MODO + ')' : '') +
        (a.foraDaLista ? ' [fora da lista, --so-a-lista]' : '') + ' — ' + MOTIVO);
  });
  aSair.forEach(l => { if(del.run(l.id).changes){ saiu.push(l); menos++; } });
  return {mais:mais, menos:menos};
})();

if(feito.menos !== aSair.length){
  console.log('');
  console.log('  [aviso] ' + (aSair.length - feito.menos) + ' linha(s) que iam sair foram embaladas');
  console.log('          entre a escolha e a gravacao — ficaram como estao, e isso e o certo:');
  console.log('          peca embalada ja somou +1 no estoque.');
}

/* A foto do que saiu, ao lado do backup: ler um .db exige ferramenta, e a
   pergunta que vem depois ("o que tinha nessa fila?") merece um arquivo que
   abre no Excel. */
let arqCsv = null;
if(saiu.length){
  const csv = v => { const s = String(v==null ? '' : v); return /[",;\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
  arqCsv = path.join(SAIDA, 'apagadas_fila_' + CARIMBO + '.csv');
  fs.writeFileSync(arqCsv, ['id,codigo,modo,revisado_em,data']
    .concat(saiu.map(l => [l.id,l.codigo,l.modo,l.revisado_em,l.data].map(csv).join(','))).join('\n') + '\n', 'utf8');
}
const devolApagadas = saiu.filter(l => l.modo === 'devolucao').length;

const agoraFila = db.prepare("SELECT COUNT(*) c FROM fila WHERE situacao='aguardando'").get().c;
console.log('');
console.log('  PRONTO.');
if(feito.mais)  console.log('  - ' + feito.mais + ' linha(s) inserida(s) na fila (modo ' + MODO + ')');
if(feito.menos) console.log('  - ' + feito.menos + ' linha(s) apagada(s) da fila');
console.log('  - fila agora  : ' + agoraFila + ' peca(s) aguardando embalagem');
console.log('  - backup      : ' + bkp);
if(arqCsv) console.log('  - o que saiu  : ' + arqCsv);
if(devolApagadas) console.log('  - ⚠ ' + devolApagadas + ' delas vieram de DEVOLUCAO — o vinculo com a devolucao se perdeu.');
if(feito.mais){
  console.log('');
  console.log('  As novas ja aparecem na tela de Embalagem. Cada uma sai de la com os tres');
  console.log('  bipes de sempre (SKU, kit, SKU) — e e o terceiro que soma +1 no estoque.');
}
console.log('');
db.close();
})().catch(e => { console.error('erro:', e.message); process.exit(1); });
