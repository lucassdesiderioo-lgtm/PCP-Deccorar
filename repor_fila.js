#!/usr/bin/env node
/* Repoe linhas na fila de embalagem — o desfazer do `limpar_fila.js`.
 *
 *   node repor_fila.js --itens "BK130130BEGE=10, BK150150BRANCO=9"
 *   node repor_fila.js --lista lista.txt
 *   node repor_fila.js --lista lista.txt --confirmar
 *   node repor_fila.js --testar          so o leitor da lista, sem banco
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
function lerLista(texto){
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
    if(!(qtd > 0)){ erros.push({linha:linha, erro:'quantidade tem que ser maior que zero'}); return; }
    itens.push({codigo:codigo, qtd:qtd});
  });
  /* O mesmo SKU citado duas vezes soma, nao vence o ultimo: "8" numa linha e
     "+2" noutra e exatamente como a lista chega quando alguem se lembra depois. */
  const juntos = [];
  itens.forEach(it => {
    const ja = juntos.filter(j => j.codigo.toUpperCase() === it.codigo.toUpperCase())[0];
    if(ja) ja.qtd += it.qtd; else juntos.push({codigo:it.codigo, qtd:it.qtd});
  });
  return {itens:juntos, erros:erros};
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
  let falhou = 0;
  casos.forEach((c,i) => {
    const r = lerLista(c[0]).itens;
    const ok = JSON.stringify(r) === JSON.stringify(c[1]);
    if(!ok){ falhou++; console.log('  FALHOU caso '+(i+1)+': '+JSON.stringify(c[0])+
      '\n    esperado ' + JSON.stringify(c[1]) + '\n    veio     ' + JSON.stringify(r)); }
  });
  const recusa = lerLista('BK130130BEGE\nBK130130BEGE - 0');
  if(recusa.itens.length || recusa.erros.length !== 2){ falhou++; console.log('  FALHOU: linha sem quantidade ou com zero tinha que virar erro'); }
  console.log('');
  console.log(falhou ? '  '+falhou+' caso(s) falharam.' : '  '+(casos.length+1)+' casos OK.');
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

const lido = lerLista(TEXTO);

console.log('');
console.log('  Banco : ' + CAMINHO);
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

const naFila = db.prepare("SELECT codigo, COUNT(*) c FROM fila WHERE situacao='aguardando' GROUP BY codigo").all();
const filaDe = {};
naFila.forEach(f => { filaDe[String(f.codigo).toUpperCase()] = f.c; });

const semCadastro = [];
let total = 0;
console.log('  A REPOR');
console.log('    ' + 'CODIGO (como sera gravado)'.padEnd(30) + 'QTD'.padStart(4) + '   ja na fila');
lido.itens.forEach(it => {
  const canon = porUpper[it.codigo.toUpperCase()];
  it.gravar = canon || null;
  if(!canon){ semCadastro.push(it.codigo); return; }
  total += it.qtd;
  const ja = filaDe[it.codigo.toUpperCase()] || 0;
  console.log('    ' + String(canon).padEnd(30) + String(it.qtd).padStart(4) + '   ' +
    (ja ? ja + (ja >= it.qtd ? '  <- ja tem tanto quanto o pedido: repetiu?' : '') : '-'));
});
console.log('    ' + ''.padEnd(30) + String(total).padStart(4) + '   linha(s) no total');

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

const n = db.transaction(() => {
  let c = 0;
  lido.itens.forEach(it => {
    for(let i = 0; i < it.qtd; i++){
      if(EM) ins.run(it.gravar, MODO, EM.length === 16 ? EM+':00' : EM, EM.slice(0,10));
      else   ins.run(it.gravar, MODO);
      c++;
    }
    /* Uma linha de auditoria por SKU, nao por peca: o que se quer saber depois
       e "quem repos o que", nao ler 100 linhas iguais. */
    if(aud) aud.run(POR, it.gravar, '+' + it.qtd + ' na fila (modo ' + MODO + ') — ' + MOTIVO);
  });
  return c;
})();

const agoraFila = db.prepare("SELECT COUNT(*) c FROM fila WHERE situacao='aguardando'").get().c;
console.log('');
console.log('  REPOSTO.');
console.log('  - ' + n + ' linha(s) inserida(s) na fila (modo ' + MODO + ')');
console.log('  - fila agora  : ' + agoraFila + ' peca(s) aguardando embalagem');
console.log('  - backup      : ' + bkp);
console.log('');
console.log('  Elas ja aparecem na tela de Embalagem. Cada uma sai de la com os tres bipes');
console.log('  de sempre (SKU, kit, SKU) — e e o terceiro que soma +1 no estoque.');
console.log('');
db.close();
})().catch(e => { console.error('erro:', e.message); process.exit(1); });
