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

console.log('\n=== 1. A APROVACAO NAO PODE APAGAR O QUE ANDOU NO MEIO ===\n');

// Saldo 10, a prateleira tem 8. A contagem vira pendente (quem contou nao
// aprova) e o `sistema_era` guarda o 10.
TEM_AJUSTAR = false;
bipar('BK140140BEGE','s1',8);
chamar('POST','/api/contagem/ajustar',{sessao:'s1',codigos:['BK140140BEGE']},{id:2,nome:'Joao'});
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
bipar('BK160160CINZA','s2',3);
chamar('POST','/api/contagem/ajustar',{sessao:'s2',codigos:['BK160160CINZA']},{id:2,nome:'Joao'});
pend = pendentes();
chamar('POST','/api/contagem/pendentes/aprovar',{ids:[pend[0].id]},{id:1,nome:'Ana'});
eq('sem movimento no meio, aprovar chega no numero contado', saldo('BK160160CINZA'), 3);

// `lancar` SOMA, e ja era um delta — a trava aqui e de nao-regressao.
bipar('BK120120BEGE','s3',2);
chamar('POST','/api/contagem/lancar',{sessao:'s3',codigos:['BK120120BEGE']},{id:2,nome:'Joao'});
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

console.log('\n=== 3. O CAMINHO DIRETO NAO TEM SALDO GUARDADO, E ESTA CERTO ===\n');

/* Quem tem `contagem.ajustar` aplica no mesmo instante em que conta: nao ha
   espera, entao nao ha nada a preservar. A diferenca e contra o saldo de agora,
   e o resultado E o numero contado. */
TEM_AJUSTAR = true;
db.prepare("UPDATE skus SET estoque=9 WHERE codigo='BK160160CINZA'").run();
bipar('BK160160CINZA','s5',5);
chamar('POST','/api/contagem/ajustar',{sessao:'s5',codigos:['BK160160CINZA']},{id:1,nome:'Ana'});
eq('caminho direto: substitui pelo contado', saldo('BK160160CINZA'), 5);

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
eq('o caminho direto tambem grava (duas contagens: a pendente e a direta)', a.length, 2);
eq('   a direta assina com quem aplicou', linha('BK160160CINZA',1).usuario_nome, 'Ana');

console.log('\n=== 5. CONTAGEM QUE BATEU NAO INVENTA LINHA ===\n');

TEM_AJUSTAR = true;
db.prepare("UPDATE skus SET estoque=4 WHERE codigo='BK120120BEGE'").run();
const antesN = ajustes('BK120120BEGE').length;
bipar('BK120120BEGE','s6',4);
chamar('POST','/api/contagem/ajustar',{sessao:'s6',codigos:['BK120120BEGE']},{id:1,nome:'Ana'});
eq('bateu: o saldo nao se mexe', saldo('BK120120BEGE'), 4);
eq('bateu: nenhuma linha nova em ajuste_estoque', ajustes('BK120120BEGE').length, antesN);

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
eq('a sessao de rascunho foi limpa', db.prepare("SELECT COUNT(*) n FROM contagem WHERE sessao='s1'").get().n, 0);
const reg = db.prepare("SELECT * FROM contagem_pendente WHERE codigo='BK140140BEGE' ORDER BY id").all();
eq('a contagem pendente continua registrada depois de aprovada', reg.length, 1);
eq('   marcada como aprovada', reg[0].aprovado, 1);
const direto = db.prepare("SELECT * FROM contagem_pendente WHERE codigo='BK160160CINZA' ORDER BY id").all();
eq('o caminho DIRETO tambem deixa registro', direto.length, 2);
eq('   e ele ja nasce aprovado', direto[1].aprovado, 1);
ok('   assinado por quem aplicou', direto[1].aprovado_por === 'Ana', 'veio: '+direto[1].aprovado_por);

console.log('\n' + (falhas ? 'FALHARAM ' + falhas + ' de ' + n : 'TODOS OS ' + n + ' CASOS PASSARAM') + '\n');
db.close(); fs.rmSync(tmp, {recursive:true, force:true});
process.exit(falhas ? 1 : 0);
