// PCP Tecido — estoque de tecido, sobras e plano de corte (operacao SOB MEDIDA).
//
// Aplicacao separada do PCP do Mercado Livre: banco proprio, porta propria,
// nenhuma integracao. O que se mantem compativel e a LINGUAGEM (unidade,
// etiqueta, endereco, movimento), para uma juncao futura.
const path=require('path');
const express=require('express');

const db=require('./nucleo/db');
const schema=require('./nucleo/schema');
const registro=require('./nucleo/registro');

const app=express();
app.use(express.json({limit:'25mb'}));

schema.aplicar(db);

// ORDEM E ARQUITETURA, NAO ESTILO. O auth entra ANTES do express.static:
// invertido, o Express entrega os .html direto do disco e qualquer pessoa
// abre a tela sem PIN. E a armadilha #3 do PCP, e ela custou caro la.
require('./nucleo/auth')(app,db);

registro.montar(app,db,[
  require('./rotas/cadastros'),
  require('./rotas/parametros'),
  require('./rotas/usuarios'),
  require('./rotas/sobras')
]);

app.use(express.static(path.join(__dirname,'public')));

const PORTA=process.env.PORTA||3020;
if(require.main===module) app.listen(PORTA,()=>console.log('[tecido] no ar na porta '+PORTA+' — banco '+db.arquivo));

module.exports=app;
