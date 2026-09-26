#!/usr/bin/env node
/* teste_contagem.js — a contagem de estoque, e os tres defeitos da fase 0.
 *
 *   node teste_contagem.js
 *
 * O QUE ORIGINOU ESTES TESTES (fase 0 da spec ESTOQUE-LIVRO-E-CONFERENCIA,
 * 21/09/2026). Os tres sao da mesma familia: a contagem e o unico momento em
 * que `skus.estoque` volta a bater com a prateleira (§18), e ela fazia isso
 * escrevendo por cima, sem rastro e sem dizer quando.
 *
 *  1. A APROVACAO APAGAVA O QUE ANDOU NO MEIO. Contar e aprovar sao dois
 *     momentos, e entre eles a fabrica nao para: embala, imprime etiqueta. O
 *     `enfileirar` ja guardava o saldo do momento da contagem em
 *     `sistema_era` — e a aprovacao NAO USAVA: fazia `estoque := contado`.
 *     Contou 8 com 10 no sistema, embalou 2 enquanto esperava o admin, e a
 *     aprovacao gravava 8. As duas persianas embaladas no meio sumiam do
 *     saldo, sem erro e sem aviso.
 *     A conta certa e a DIFERENCA que a contagem achou (`contado -
 *     sistema_era`) aplicada sobre o saldo de AGORA — o que a §5.4 da spec
 *     chama de saldo guardado.
 *
 *  2. NAO SOBRAVA RASTRO. O caminho da peca mexia em `skus.estoque` por
 *     `UPDATE` e nao gravava linha nenhuma em `ajuste_estoque`, que e o unico
 *     lugar onde saldo mexido fora da operacao deixa marca (§18). O de
 *     MATERIAL sempre gravou (passa pelo `componente_dominio`, regra 10 do
 *     §13) — a peca era a metade sem auditoria.
 *
 *  3. A IDADE DA CONFERENCIA MENTIA. Esse caso NAO mora aqui: ele precisa do
 *     `est_route` junto e esta no `teste_estoque.js` (secao 10-B), de ponta a
 *     ponta pelo fluxo real. Aqui fica a metade que este modulo responde: a
 *     contagem aprovada deixa a linha de pe em `contagem_pendente`, inclusive
 *     no caminho direto, que antes nao passava por la.
 *
 * Sobe um banco temporario e chama os handlers direto, com um `app` de mentira
 * que so guarda as rotas. Nao abre porta, nao toca no banco de producao.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');

let n = 0, falhas = 0;
function ok(desc, cond, detalhe){
  n++;
  if(cond) console.log('  ok  ' + n + ' — ' + desc);
  else { falhas++; console.log('  FALHOU ' + n + ' — ' + desc + (detalhe ? '\n         ' + detalhe : '')); }
}
function eq(desc, achado, esperado){
  ok(desc, achado === esperado, 'esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(achado));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-contagem-'));
const db = new Database(path.join(tmp, 't.db'));

/* Copia consciente do CREATE dos donos de cada tabela: o teste tem que subir
   sem o db.js, que aponta para a pasta do servidor (§13). `contagem` e
   `contagem_pendente` NAO entram aqui — quem as cria e o proprio cont_route,
   e e isso que se quer exercitar. */
db.exec(`
  CREATE TABLE skus (codigo TEXT PRIMARY KEY, descricao TEXT DEFAULT '', cor TEXT DEFAULT '',
    estoque INTEGER DEFAULT 0, alvo INTEGER DEFAULT 0);
  CREATE TABLE ajuste_estoque (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, antes INTEGER,
    depois INTEGER, delta INTEGER, motivo TEXT, obs TEXT, usuario_id INTEGER, usuario_nome TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')), data TEXT DEFAULT (date('now','localtime')),
    teste INTEGER DEFAULT 0);
  CREATE TABLE auditoria (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, usuario_nome TEXT,
    categoria TEXT, acao TEXT, alvo TEXT, detalhe TEXT, ip TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')), data TEXT DEFAULT (date('now','localtime')));
  INSERT INTO skus (codigo,descricao,estoque) VALUES ('BK140140BEGE','Rolo 1,40',10),
    ('BK160160CINZA','Rolo 1,60',4), ('BK120120BEGE','Rolo 1,20',6);
`);
require('./compras_schema').garantirSchemaCompras(db);   // componente + movimento_componente
db.prepare("INSERT INTO componente (codigo,nome,unidade,estoque,ativo) VALUES ('TUBO32','Tubo 32 mm','m',10,1)").run();

/* `permissoes` e quem decide se a contagem aplica direto ou vira pendente.
   O teste troca esse valor para exercitar os dois caminhos. */
let TEM_AJUSTAR = false;
const auditadas = [];
const rotas = {};
const app = {
  locals:{ acesso:{
    podePermissao(u, chave){ return chave==='contagem.ajustar' ? TEM_AJUSTAR : true; },
    auditar(req, cat, acao, alvo, detalhe){ auditadas.push({cat,acao,alvo,detalhe}); }
  }},
  get(p,h){ rotas['GET '+p]=h; }, post(p,h){ rotas['POST '+p]=h; }, delete(p,h){ rotas['DELETE '+p]=h; }
};
/* O livro de movimentos de pe (fase 1, 21/09/2026). Em producao quem chama
   isto e o `db.js`; aqui, que sobe sem ele, o teste chama — e a abertura
   carimba o saldo semeado como linha inicial, igual ao deploy. */
require('./estoque_dominio').garantirSchema(db);
require('./cont_route')(app, db);
// A coluna que o teste_route acrescenta no boot (§11: contagem_pendente e uma
// das 11 tabelas cobertas). Sem ela, contagem em modo teste sujaria a idade.
try{ db.exec('ALTER TABLE contagem_pendente ADD COLUMN teste INTEGER DEFAULT 0'); }catch(e){}

function chamar(metodo, rota, corpo, quem){
  const h = rotas[metodo+' '+rota];
  if(!h) throw new Error('rota nao registrada: '+metodo+' '+rota);
  const out = { status:200, body:null };
  const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; return res; },
                send(b){ out.body=b; return res; } };
  h({ body: corpo||{}, params:{}, headers:{}, usuario: quem||{id:1,nome:'Ana'} }, res);
  return out;
}
const saldo   = c => db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(c).estoque;
const material= () => db.prepare('SELECT estoque FROM componente WHERE codigo=?').get('TUBO32').estoque;
/* `ajustes(...)[0]` num teste que esta REPROVANDO devolve undefined e derruba o
   arquivo no meio — e ai os casos de baixo nao rodam e o relatorio esconde o
   tamanho do estrago. `linha()` devolve um objeto vazio: o caso falha dizendo o
   que faltou, e os proximos continuam. */
const ajustes = c => db.prepare('SELECT * FROM ajuste_estoque WHERE codigo=? ORDER BY id').all(c);
const linha   = (c,i) => ajustes(c)[i||0] || {};
const bipar   = (cod, ses, vezes) => { for(let i=0;i<vezes;i++) chamar('POST','/api/contagem/bipe',{codigo:cod,sessao:ses}); };
const pendentes = () => chamar('GET','/api/contagem/pendentes').body.linhas;
/* A CONTAGEM DE PECA NAO ENTRA MAIS POR AQUI (fase 2 da conferencia,
   26/09/2026): ela e do inventario_route, as cegas. O que sobra neste modulo,
   para peca, e DRENAR a fila que ja existia no deploy — contagens feitas pela
   regra antiga, que nao tem outro caminho para sair. Os casos abaixo semeiam
   essa fila como o `enfileirar` antigo gravava, e conferem que a aprovacao
   dela continua certa (a diferenca contra o sistema_era, e o rastro). */
function pendenteAntigo(codigo, contado, sistemaEra, operacao, quem){
  return db.prepare(`INSERT INTO contagem_pendente (sessao,codigo,contado,sistema_era,operacao,contado_por,tipo)
    VALUES ('legado',?,?,?,?,?,'sku')`).run(codigo, contado, sistemaEra, operacao||'ajustar', quem||'Joao').lastInsertRowid;
}

console.log('\n=== 0. A CONTAGEM DE PECA SAIU DESTA TELA ===\n');

let r0 = chamar('POST','/api/contagem/bipe',{codigo:'BK140140BEGE',sessao:'x'});
eq('bipar SKU aqui e recusado', r0.status, 409);
eq('   dizendo para onde ir', r0.body.motivo, 'use_inventario');
ok('   e sem mostrar o saldo', !('estoque' in (r0.body||{})), JSON.stringify(r0.body));
eq('   e nada foi contado', db.prepare("SELECT COUNT(*) n FROM contagem WHERE sessao='x'").get().n, 0);
r0 = chamar('POST','/api/contagem/ajustar',{sessao:'x',itens:[{tipo:'sku',codigo:'BK140140BEGE'},{tipo:'componente',componente_id:1,codigo:'Tubo 32 mm'}]});
eq('ajustar com SKU no corpo e recusado INTEIRO', r0.status, 409);
r0 = chamar('POST','/api/contagem/lancar',{sessao:'x',codigos:['BK140140BEGE']});
eq('lancar SKU tambem', r0.status, 409);
eq('   e o saldo nao andou', db.prepare("SELECT estoque FROM skus WHERE codigo='BK140140BEGE'").get().estoque, 10);
r0 = chamar('POST','/api/contagem/bipe',{codigo:'TUBO32',sessao:'x'});
ok('bipar codigo de MATERIAL continua mandando para o campo certo', r0.body.ehComponente === true);

console.log('\n=== 1. A APROVACAO NAO PODE APAGAR O QUE ANDOU NO MEIO ===\n');

// Saldo 10, a prateleira tem 8. A contagem vira pendente (quem contou nao
// aprova) e o `sistema_era` guarda o 10.
TEM_AJUSTAR = false;
pendenteAntigo('BK140140BEGE', 8, 10);
let pend = pendentes();
eq('a contagem virou pendente, com o saldo do momento guardado', pend.length, 1);
eq('   sistema_era = 10', pend[0].sistema_era, 10);
eq('   contado = 8', pend[0].contado, 8);
eq('   e o saldo ainda nao andou', saldo('BK140140BEGE'), 10);

// A fabrica nao para: duas peças sao embaladas enquanto o admin nao aprova.
db.prepare("UPDATE skus SET estoque=estoque+2 WHERE codigo='BK140140BEGE'").run();
eq('duas embalagens no meio levam o saldo a 12', saldo('BK140140BEGE'), 12);

chamar('POST','/api/contagem/pendentes/aprovar',{ids:[pend[0].id]},{id:1,nome:'Ana'});
eq('APROVAR aplica a DIFERENCA (8-10) sobre o saldo de agora, e nao o numero contado',
   saldo('BK140140BEGE'), 10);

// Sem nada andando no meio, a diferenca leva ao numero contado — e e isso que
// faz o caso acima ser um conserto, e nao uma conta nova.
pendenteAntigo('BK160160CINZA', 3, 4);
pend = pendentes();
chamar('POST','/api/contagem/pendentes/aprovar',{ids:[pend[0].id]},{id:1,nome:'Ana'});
eq('sem movimento no meio, aprovar chega no numero contado', saldo('BK160160CINZA'), 3);

// `lancar` SOMA, e ja era um delta — a trava aqui e de nao-regressao.
pendenteAntigo('BK120120BEGE', 2, 6, 'lancar');
pend = pendentes();
db.prepare("UPDATE skus SET estoque=estoque+1 WHERE codigo='BK120120BEGE'").run();  // 6 -> 7
chamar('POST','/api/contagem/pendentes/aprovar',{ids:[pend[0].id]},{id:1,nome:'Ana'});
eq('`lancar` continua SOMANDO ao saldo de agora (7+2)', saldo('BK120120BEGE'), 9);

console.log('\n=== 2. A MESMA REGRA VALE PARA MATERIAL ===\n');

chamar('POST','/api/contagem/componente',{sessao:'s4',componente_id:1,quantidade:8});
chamar('POST','/api/contagem/ajustar',{sessao:'s4',itens:[{tipo:'componente',componente_id:1,codigo:'Tubo 32 mm'}]},{id:2,nome:'Joao'});
pend = pendentes();
eq('material tambem guarda o saldo do momento', pend[0].sistema_era, 10);
db.prepare("UPDATE componente SET estoque=estoque+2 WHERE codigo='TUBO32'").run();
chamar('POST','/api/contagem/pendentes/aprovar',{ids:[pend[0].id]},{id:1,nome:'Ana'});
eq('material: aprovar aplica a diferenca, nao o numero contado', material(), 10);

console.log('\n=== 4. TODA CONTAGEM DE PECA DEIXA RASTRO EM `ajuste_estoque` ===\n');

let a = ajustes('BK140140BEGE');
eq('a aprovacao do caso 1 gravou UMA linha', a.length, 1);
eq('   antes = o saldo de quando a contagem foi aplicada', linha('BK140140BEGE').antes, 12);
eq('   depois = o saldo resultante', linha('BK140140BEGE').depois, 10);
eq('   delta = a diferenca que a contagem achou', linha('BK140140BEGE').delta, -2);
ok('   o motivo diz que veio de contagem', /contagem/i.test(linha('BK140140BEGE').motivo||''), 'motivo: '+linha('BK140140BEGE').motivo);
eq('   quem APROVOU assina a linha', linha('BK140140BEGE').usuario_nome, 'Ana');
ok('   a observacao diz quem CONTOU e o que foi contado',
   /Joao/.test(linha('BK140140BEGE').obs||'') && /8/.test(linha('BK140140BEGE').obs||''), 'obs: '+linha('BK140140BEGE').obs);

a = ajustes('BK120120BEGE');
eq('`lancar` tambem deixa rastro', a.length, 1);
eq('   delta do lancamento', linha('BK120120BEGE').delta, 2);

a = ajustes('BK160160CINZA');
eq('a aprovacao do pendente antigo grava a sua linha', a.length, 1);

console.log('\n=== 6. MATERIAL NAO ENTRA EM `ajuste_estoque` ===\n');

/* Ele tem o livro dele (`movimento_componente`, regra 10 do §13). Gravar nos
   dois lugares seria a mesma historia contada duas vezes, e a aba Estoque, que
   le `ajuste_estoque` por SKU, passaria a mostrar tubo. */
eq('a contagem de material nao gravou em ajuste_estoque',
   db.prepare("SELECT COUNT(*) n FROM ajuste_estoque WHERE codigo LIKE 'Tubo%'").get().n, 0);
ok('e gravou no livro do material',
   db.prepare("SELECT COUNT(*) n FROM movimento_componente WHERE motivo='contagem'").get().n > 0);

console.log('\n=== 7. A CONTAGEM APROVADA FICA DE PE (a idade le dali) ===\n');

/* `contagem` e rascunho: o `enfileirar` e o `lancar` apagam a sessao. Quem
   sobrevive e `contagem_pendente` — e por isso o caminho DIRETO tambem passou a
   gravar la, ja aprovado. Sem isso, metade das contagens nao deixava data. */
const reg = db.prepare("SELECT * FROM contagem_pendente WHERE codigo='BK140140BEGE' ORDER BY id").all();
eq('a contagem pendente continua registrada depois de aprovada', reg.length, 1);
eq('   marcada como aprovada', reg[0].aprovado, 1);
/* O caminho DIRETO de material tambem deixa registro, ja aprovado. */
TEM_AJUSTAR = true;
chamar('POST','/api/contagem/componente',{sessao:'s9',componente_id:1,quantidade:4});
chamar('POST','/api/contagem/ajustar',{sessao:'s9',itens:[{tipo:'componente',componente_id:1,codigo:'Tubo 32 mm'}]},{id:1,nome:'Ana'});
const direto = db.prepare("SELECT * FROM contagem_pendente WHERE tipo='componente' ORDER BY id").all();
eq('o caminho DIRETO de material deixa registro', direto.length, 2);
eq('   e ele ja nasce aprovado', direto[1].aprovado, 1);
ok('   assinado por quem aplicou', direto[1].aprovado_por === 'Ana', 'veio: '+direto[1].aprovado_por);
eq('   e o saldo do material e o contado', material(), 4);

console.log('\n' + (falhas ? 'FALHARAM ' + falhas + ' de ' + n : 'TODOS OS ' + n + ' CASOS PASSARAM') + '\n');
db.close(); fs.rmSync(tmp, {recursive:true, force:true});
process.exit(falhas ? 1 : 0);
