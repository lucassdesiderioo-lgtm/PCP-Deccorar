/* zerar.js — reset controlado da operacao ("comecar do zero").
 *
 * POR QUE EXISTE: entre o periodo de testes e o uso real, o banco fica com
 * estoque, ordens, fila e historico que nao correspondem a nada fisico. O modo
 * teste (teste_route.js) so apaga o que foi marcado como teste — o que foi
 * lancado antes dele existir, ou fora dele, fica. Este modulo apaga por grupo,
 * de forma explicita, com backup antes.
 *
 * NAO E o modo teste e nao substitui ele: aqui nao ha marcacao nem volta atras.
 * O que protege e o backup (dados-antes-de-zerar-*.db) e a confirmacao digitada.
 *
 * O QUE NUNCA E TOCADO: cadastro de SKU (codigo/descricao/cor), alvo, usuarios,
 * permissoes, setores, auditoria, listas, horarios e o codigo do kit. Zerar a
 * operacao nao pode desconfigurar o sistema — amanha cedo a fabrica tem que
 * abrir a tela e trabalhar.
 *
 * Usado por:
 *   - zerar_route.js  -> aba "Zerar" do admin (POST /api/zerar)
 *   - CLI             -> `node zerar.js` no servidor (ver rodape do arquivo)
 */

// Um grupo = uma decisao que o operador toma na tela. 'padrao' marca a caixinha
// por default: os seis primeiros sao o "recomecar a producao do zero"; lote e
// devolucao ficam de fora porque sao vendas/casos REAIS em aberto no Mercado
// Livre — apagar sem querer perde volume que o cliente esta esperando.
var GRUPOS = [
  { id:'estoque',   padrao:true,  rotulo:'Estoque',
    detalhe:'zera a quantidade de todos os SKUs (cadastro, cor e alvo continuam)',
    unidade:'peças em estoque', unidade1:'peça em estoque',
    contar:  function(db){ return db.prepare('SELECT COALESCE(SUM(estoque),0) n FROM skus').get().n; },
    limpar:  function(db){ return db.prepare('UPDATE skus SET estoque=0 WHERE estoque<>0').run().changes; } },

  { id:'producao',  padrao:true,  rotulo:'Lançamentos de produção',
    detalhe:'ordens do dia — manuais e as vindas do PDF do Mercado Livre',
    tabelas:['producao'] },

  { id:'fila',      padrao:true,  rotulo:'Fila de embalagem',
    detalhe:'peças revisadas esperando embalagem — se ficarem, viram estoque depois',
    tabelas:['fila'] },

  { id:'revisao',   padrao:true,  rotulo:'Histórico de revisão',
    detalhe:'tempos de revisão (relatórios de produtividade voltam a zero)',
    tabelas:['revisao'] },

  { id:'embalagem', padrao:true,  rotulo:'Histórico de embalagem',
    detalhe:'tempos de embalagem e conferência de kit',
    tabelas:['montagem'] },

  { id:'problemas', padrao:true,  rotulo:'Peças com problema',
    detalhe:'rejeições registradas na revisão',
    tabelas:['rejeicao'] },

  { id:'contagem',  padrao:true,  rotulo:'Contagens de estoque',
    detalhe:'bipes de contagem e ajustes que ainda esperam aprovação',
    tabelas:['contagem','contagem_pendente'] },

  { id:'expedicao', padrao:false, rotulo:'Volumes do PDF (expedição)',
    detalhe:'⚠ vendas do Mercado Livre já lançadas, inclusive as pendentes de etiqueta',
    tabelas:['lote'] },

  { id:'devolucoes',padrao:false, rotulo:'Devoluções',
    detalhe:'⚠ triagens de devolução registradas, com ou sem baixa',
    tabelas:['devolucao'] }
];

// Tabela que ainda nao existe (banco novo, modulo nunca carregado) conta 0 e nao
// derruba nada — o resto do reset continua valendo.
function contaTabela(db, t){
  try{ return db.prepare('SELECT COUNT(*) n FROM '+t).get().n; }catch(e){ return 0; }
}
function apagaTabela(db, t){
  try{ return db.prepare('DELETE FROM '+t).run().changes; }catch(e){ return 0; }
}

GRUPOS.forEach(function(g){
  if(g.tabelas){
    g.unidade  = g.unidade  || 'registros';
    g.unidade1 = g.unidade1 || 'registro';
    g.contar  = function(db){ return g.tabelas.reduce(function(s,t){ return s+contaTabela(db,t); },0); };
    g.limpar  = function(db){ return g.tabelas.reduce(function(s,t){ return s+apagaTabela(db,t); },0); };
  }
});

var PORID = {}; GRUPOS.forEach(function(g){ PORID[g.id]=g; });

function idsPadrao(){ return GRUPOS.filter(function(g){ return g.padrao; }).map(function(g){ return g.id; }); }

// Quanto cada grupo tem hoje — o que a tela mostra ANTES de o operador confirmar.
function previa(db){
  return GRUPOS.map(function(g){
    var n = g.contar(db);
    return { id:g.id, rotulo:g.rotulo, detalhe:g.detalhe, padrao:!!g.padrao,
             unidade:(n===1?g.unidade1:g.unidade), itens:n };
  });
}

// O modo teste guarda uma FOTO do estoque ao ser ligado e a restaura no
// "encerrar e apagar". Se ele ficasse ligado, essa foto (com o estoque velho)
// desfaria o zeramento na proxima limpeza de teste. Entao zerar encerra o modo
// teste e descarta a foto — os registros de teste ja foram apagados junto com o
// resto, e o que sobrar passa a valer como dado real.
function encerraTeste(db){
  try{
    var r = db.prepare("SELECT valor FROM config WHERE chave='modo_teste'").get();
    if(!r || r.valor!=='1') return false;
    db.prepare("INSERT INTO config(chave,valor) VALUES('modo_teste','0') ON CONFLICT(chave) DO UPDATE SET valor='0'").run();
    db.prepare("DELETE FROM config WHERE chave='teste_snapshot'").run();
    return true;
  }catch(e){ return false; }
}

/* Executa. `ids` = lista de grupos; tudo numa transacao so, para nao existir
   estado meio-zerado se alguma tabela falhar. Devolve o que foi apagado. */
function zerar(db, ids){
  var alvos = (ids||[]).map(function(i){ return PORID[i]; }).filter(Boolean);
  if(!alvos.length) throw new Error('nenhum grupo valido para zerar');
  var apagados = {}, teste = false;
  db.transaction(function(){
    alvos.forEach(function(g){ apagados[g.id] = g.limpar(db); });
    teste = encerraTeste(db);
  })();
  return { apagados:apagados, grupos:alvos.map(function(g){ return g.id; }),
           rotulos:alvos.reduce(function(o,g){ o[g.id]=g.rotulo; return o; },{}),
           modoTesteEncerrado:teste };
}

/* Backup antes de qualquer apagamento. db.backup() e obrigatorio: o banco roda
   em WAL, entao copiar o arquivo .db com cp gera backup vazio (CLAUDE.md §12). */
function backupAntes(db){
  var fs=require('fs'), path=require('path');
  var dir = path.join(path.dirname(db.name), 'backups');
  fs.mkdirSync(dir, {recursive:true});
  var d=new Date(), p2=function(n){ return String(n).padStart(2,'0'); };
  var st = d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate())+'-'+p2(d.getHours())+p2(d.getMinutes())+p2(d.getSeconds());
  var dest = path.join(dir, 'dados-antes-de-zerar-'+st+'.db');
  return db.backup(dest).then(function(){ return dest; });
}

module.exports = { GRUPOS:GRUPOS, idsPadrao:idsPadrao, previa:previa, zerar:zerar, backupAntes:backupAntes };

/* ─────────────────────────── CLI ───────────────────────────
   No servidor:
     cd /opt/expedicao
     node zerar.js                      # grupos padrao, mostra a previa e pergunta
     node zerar.js --tudo               # inclui expedicao e devolucoes
     node zerar.js --grupos=estoque,producao,fila
     node zerar.js --sim                # nao pergunta (uso em script)
     node zerar.js --sem-backup         # pula o backup (nao recomendado)
   Rode com o servidor no ar mesmo — o SQLite trava por transacao. Depois de
   zerar, de refresh forcado nos tablets (as telas guardam estado em memoria).
*/
if(require.main === module){
  var db = require('./db');
  var arg = function(n){ return process.argv.slice(2).find(function(a){ return a===('--'+n) || a.indexOf('--'+n+'=')===0; }); };
  var val = function(n){ var a=arg(n); return a && a.indexOf('=')>0 ? a.split('=').slice(1).join('=') : null; };

  var ids;
  if(arg('tudo')) ids = GRUPOS.map(function(g){ return g.id; });
  else if(val('grupos')) ids = val('grupos').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  else ids = idsPadrao();

  var desconhecidos = ids.filter(function(i){ return !PORID[i]; });
  if(desconhecidos.length){
    console.error('Grupo desconhecido: '+desconhecidos.join(', '));
    console.error('Validos: '+GRUPOS.map(function(g){ return g.id; }).join(', '));
    process.exit(1);
  }

  var pv = previa(db), mapa={}; pv.forEach(function(p){ mapa[p.id]=p; });
  console.log('\nBanco: '+db.name);
  console.log('\nVAI APAGAR:');
  ids.forEach(function(i){ console.log('  - '+mapa[i].rotulo+': '+mapa[i].itens+' '+mapa[i].unidade); });
  var fora = GRUPOS.filter(function(g){ return ids.indexOf(g.id)<0; });
  if(fora.length) console.log('\nNao sera tocado: '+fora.map(function(g){ return g.rotulo+' ('+mapa[g.id].itens+')'; }).join(', '));
  console.log('Cadastro de SKU, alvos, usuarios, permissoes e configuracoes permanecem.\n');

  var executa = function(){
    var passo = arg('sem-backup')
      ? Promise.resolve(null)
      : backupAntes(db).then(function(dest){ console.log('Backup: '+dest); return dest; });
    passo.then(function(){
      var r = zerar(db, ids);
      console.log('\nPronto:');
      ids.forEach(function(i){ console.log('  - '+mapa[i].rotulo+': '+r.apagados[i]); });
      if(r.modoTesteEncerrado) console.log('  - modo teste estava ligado e foi encerrado');
      console.log('');
      process.exit(0);
    }).catch(function(e){
      console.error('\nFALHOU (nada foi apagado): '+e.message);
      process.exit(1);
    });
  };

  if(arg('sim')) return executa();
  var rl = require('readline').createInterface({input:process.stdin, output:process.stdout});
  rl.question('Digite ZERAR para confirmar: ', function(resp){
    rl.close();
    if(String(resp).trim().toUpperCase()!=='ZERAR'){ console.log('Cancelado. Nada foi alterado.'); return process.exit(0); }
    executa();
  });
}
