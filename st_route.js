const QUEM = require('./quem');
module.exports=function(app,db){
  /* SEM LOGIN NADA GRAVA (QUEM-FEZ-E-REVISAO fase 7, 05/11/2026): toda escrita
     registrada neste modulo passa pelo quem.js antes do handler — a de amanha
     tambem. */
  app = QUEM.portao(app, { auditar:'sistema' });   // a linha nao tem autor: quem fez vai na auditoria

  const DIAS=['dom','seg','ter','qua','qui','sex','sab'];
  function cfg(chave,padrao){
    try{ const c=db.prepare('SELECT valor FROM config WHERE chave=?').get(chave); if(c&&c.valor) return c.valor; }catch(e){}
    return padrao;
  }
  /* A hora vem do relogio.js: em producao e so o relogio do servidor (o mesmo
     de antes); os testes o fixam (HORARIOS-DE-COLETA, 05/11/2026). */
  const RELOGIO=require('./relogio');
  function hoje(){
    return {d:DIAS[RELOGIO.diaSemana(RELOGIO.hoje())], hm:RELOGIO.hora()};
  }
  app.get('/api/revisao/status',(req,res)=>{
    const h=hoje();
    /* O CORTE VEM DA 206 (HORARIOS-E-FERIADOS fase 1, 12/11/2026): o da próxima
       coleta lançada, ou o último quando todos passaram. Sem coleta lançada, ou
       com o corte a conferir, é null — o padrão da semana não entra no lugar (D2). */
    const cc=require('./coleta_horario').corteDoDia(db);
    const corte=cc.proxima?cc.proxima.corte:(cc.encerrada?cc.ultimo:null);
    /* Mesma régua do tile da tela vermelha (ordem_dia.js). `urgentesFalta` é o
       que a bancada ainda tem que PRODUZIR; `atendidas` é a ordem que ficou
       aberta com a venda já fora do estoque — peça revisada na tela azul e
       embalada como estoque não abate ordem (§4), mas atende o cliente igual. */
    const r=require('./ordem_dia').resumo(db);
    res.json({corte, agora:h.hm, passouCorte:!!cc.encerrada, dia:h.d, coleta_corte:cc,
      lancado: (r.urgentes+r.reposicao)>0, urgentes:r.urgentes, reposicao:r.reposicao,
      urgentesFalta: r.urgentesFalta, atendidas: r.atendidas});
  });
  app.get('/api/expedicao/status',(req,res)=>{
    const h=hoje();
    /* A AGENCIA USA O HORARIO LANCADO DO DIA (HORARIOS-DE-COLETA, D6): quem
       sobe o PDF de agencia diz o horario que o ML mostra. Sem ele, vale o
       config de sempre, por dia da semana. */
    let lancado=null; try{ lancado=require('./coleta_horario').agenciaDeHoje(db); }catch(e){}
    const desp=lancado||cfg('despacho_'+h.d,'15:00');
    /* Mesma regua da fila (fila_dia.js). Contando por dia de importacao, o
       relogio de despacho ficava vermelho por causa de venda que so vence em
       setembro — pressa por trabalho que nao e do dia. */
    /* O RELOGIO E DA AGENCIA. A hora de despacho configurada e o limite pra
       levar o carro ate la; a coleta nao tem hora (a etiqueta dela vem sem, e
       quem manda e o caminhao do ML). Contar a coleta em `pendentes` deixaria
       o relogio vermelho por caixa que nao vai no carro — pressa por trabalho
       que nao e desse prazo. Ela sai a parte, em `pendentes_coleta`, pra tela
       dizer que existe sem alarmar. Regua unica em carga.js. */
    const {COLETA,AGENCIA}=require('./carga');
    const VH=require('./fila_dia').VENCE_HOJE;
    const pend=db.prepare("SELECT COUNT(*) c FROM lote WHERE estagio='pendente' AND "+VH+" AND "+AGENCIA()).get().c;
    const pendCol=db.prepare("SELECT COUNT(*) c FROM lote WHERE estagio='pendente' AND "+VH+" AND "+COLETA()).get().c;
    const emb=db.prepare("SELECT COUNT(*) c FROM lote WHERE data=date('now','localtime') AND estagio='embalado'").get().c;
    const car=db.prepare("SELECT COUNT(*) c FROM lote WHERE data=date('now','localtime') AND estagio='carregado'").get().c;
    let falta=0;
    const p1=desp.split(':'), p2=h.hm.split(':');
    falta=(+p1[0]*60+ +p1[1])-(+p2[0]*60+ +p2[1]);
    res.json({despacho:desp, despacho_origem:lancado?'lancado':'config', agora:h.hm, minutosRestantes:falta, passou:falta<0,
      pendentes:pend, pendentes_coleta:pendCol, embalados:emb, carregados:car});
  });
  app.get('/api/config/horarios',(req,res)=>{
    const r={};
    DIAS.forEach(d=>{ r[d]={corte:cfg('corte_'+d,'10:30'), despacho:cfg('despacho_'+d,'15:00')}; });
    res.json(r);
  });
  /* O HORÁRIO IMPOSSÍVEL É RECUSADO, E NADA GRAVA (ARRUMAR-O-LUGAR fase 3,
     11/11/2026). Até aqui "25:99" e "9h" eram descartados calados e a resposta
     dizia ok — com a tela 906 em cima, ela diria "salvo" sobre o que não
     salvou. Campo AUSENTE não é vazio: fica como estava; vazio ou fora do
     formato é 400 dizendo o dia, antes de gravar qualquer campo. */
  const NOME_DIA={dom:'domingo',seg:'segunda',ter:'terça',qua:'quarta',qui:'quinta',sex:'sexta',sab:'sábado'};
  const horaValida=s=>{ const m=/^(\d{2}):(\d{2})$/.exec(s); return !!m && +m[1]<24 && +m[2]<60; };
  app.post('/api/config/horarios',(req,res)=>{
    const b=req.body||{};
    const grava=[];
    for(const d of DIAS){
      if(!(d in b)) continue;
      if(!b[d]||typeof b[d]!=='object'||Array.isArray(b[d]))
        return res.status(400).json({erro:'Os horários de '+NOME_DIA[d]+' vêm como {corte, despacho}. Nada foi gravado.'});
      for(const campo of ['corte','despacho']){
        if(!(campo in b[d])) continue;
        const v=b[d][campo];
        if(typeof v!=='string'||!horaValida(v))
          return res.status(400).json({erro:'O '+campo+' de '+NOME_DIA[d]+' não é uma hora válida ('+JSON.stringify(v)+'): use HH:MM, de 00:00 a 23:59. Nada foi gravado.'});
        grava.push([campo+'_'+d,v]);
      }
    }
    const ins=db.prepare("INSERT INTO config (chave,valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor");
    db.transaction(()=>grava.forEach(g=>ins.run(g[0],g[1])))();
    res.json({ok:true,salvos:grava.length});
  });
};
