const URGENCIA = require('./urgencia');

const QUEM = require('./quem');
module.exports=function(app,db){
  /* SEM LOGIN NADA GRAVA (QUEM-FEZ-E-REVISAO fase 7, 05/11/2026): toda escrita
     registrada neste modulo passa pelo quem.js antes do handler — a de amanha
     tambem. */
  app = QUEM.portao(app, { auditar:'planejamento' });   // a linha nao tem autor: quem fez vai na auditoria

  // Fase 3 (docs/DESENHO-PLANEJAMENTO.md, secoes 5 e 9): o PDF passa a gerar
  // SO urgencia. A reposicao saiu do cruzamento — agora vem do calculo ao vivo
  // (tela azul, /api/revisao/producao). Com isso a foto_estoque perdeu a razao
  // de existir e foi removida.
  //
  // Urgencia = venda do dia com NF cujo SKU nao tem estoque. Contamos os volumes
  // ainda PENDENTES (nao embalados/expedidos) contra o estoque atual: assim o
  // numero se auto-corrige — reaplicar depois de produzir/expedir nao infla nada,
  // porque o volume ja processado sai de 'pendente' e o estoque ja baixou junto.
  // Era isso que a foto_estoque protegia; agora o proprio dado corrente resolve.
  //
  // A conta mora no `urgencia.js`, e nao aqui: o `rastrear.js --lote` faz a
  // MESMA pergunta para explicar a escada do PDF ate a tela, e com duas copias a
  // ferramenta de diagnostico confirmaria com autoridade um numero que a tela
  // nao usa (mesmo motivo do `fila_dia.js`).
  const calcular = () => URGENCIA.calcular(db);

  app.get('/api/cruzamento',(req,res)=> res.json(calcular()));

  /* Desde 05/11/2026 (PRODUCAO-SO-DO-PDF) o upload aplica sozinho, e a tela
     não tem mais o botão. A rota fica para reaplicar à mão (`producao.lancar`),
     e chama a MESMA conta do domínio. */
  app.post('/api/cruzamento/aplicar',(req,res)=>{
    const r = db.transaction(() => URGENCIA.aplicar(db))();
    res.json({ok:true,urgentes:r.urgentes,linhas:r.linhas});
  });
};
