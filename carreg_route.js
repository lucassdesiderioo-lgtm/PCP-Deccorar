const {PRA_CARREGAR,ORDEM_CARGA,atrasado,futuro,ehColeta,AGENCIA,COLETA,AGUARDA_CAMINHAO,saidasAdiantadas,pilhaDaArea,acharVolumes,PRONTA_PRO_CARRO}=require('./carga');
const fs=require('fs'), path=require('path');
/* Onde ficam as fotos da conferencia com o motorista. Fora do git e FORA de
   lotes/ (que o cron apaga em 7 dias): a foto e prova, e prova nao expira
   junto com o PDF. Configuravel por ambiente so pro teste nao escrever em
   /opt. */
const FOTOS_DIR=require('./caminhos').COLETAS;
module.exports=function(app,db){
  /* A tabela das saidas (caminhao e agencia) tem dono proprio: o script do
     passivo tambem a cria, e duas copias do CREATE divergem. */
  require('./saida_schema').garantirSaida(db);
  /* ── CONFERENCIA DUPLA (etiqueta de venda + SKU da caixa) ──────────────────
     A ultima rede antes do carro. Bipe 1 = a etiqueta de venda JA COLADA;
     bipe 2 = o codigo de barras do SKU na propria caixa (que continua visivel,
     porque a etiqueta de venda e colada por baixo dele). Sao dois objetos
     diferentes na mesma caixa: se a etiqueta foi parar na caixa errada, os dois
     nao batem e o volume nao carrega.
     O bipe 2 e CEGO de proposito — o sistema nao mostra o SKU esperado antes,
     senao a conferencia vira confirmacao: quem ja sabe a resposta bipa o que
     for pra fechar a linha. So depois de divergir e que os dois codigos
     aparecem, e ai como alarme.
     Fica desligavel porque custa um bipe por volume, todo dia: o dono liga
     quando quiser a trava e desliga se ela atrapalhar mais do que protege. */
  const conferenciaLigada=()=>{
    try{ const c=db.prepare("SELECT valor FROM config WHERE chave='conf_carregamento'").get();
         return !!(c && String(c.valor)==='1'); }catch(e){ return false; }
  };
  const soCodigo=s=>String(s||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
  app.get('/api/config/conferencia',(req,res)=> res.json({ligada:conferenciaLigada()}));
  app.post('/api/config/conferencia',(req,res)=>{
    const v=(req.body&&req.body.ligada)?'1':'0';
    db.prepare(`INSERT INTO config (chave,valor) VALUES ('conf_carregamento',?)
      ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor`).run(v);
    res.json({ok:true,ligada:v==='1'});
  });

  /* ── A CONFERENCIA COM O MOTORISTA DA COLETA ──────────────────────────────
     O caminhao do Mercado Livre bipa cada caixa que leva. Do nosso lado, cada
     caixa foi bipada quando foi pro canto reservado. Na hora de o caminhao
     sair, os dois numeros tem que bater: 50 separadas, 50 bipadas por ele. Se
     ele bipou 49, uma caixa ficou pra tras — no canto, no carro dele sem bipe,
     ou em lugar nenhum — e e AGORA, com o motorista na frente, que isso se
     resolve. Depois que o caminhao sai, a caixa que faltou vira reclamacao
     do cliente semanas depois, sem ninguem saber por onde ela sumiu.
     Cada fechamento e uma linha aqui: quantas o sistema tinha, quantas o
     motorista disse, se bateu, e quem fechou. A divergencia fica gravada
     mesmo quando alguem decide liberar o caminhao assim mesmo — e vai pra
     auditoria, porque e o tipo de decisao que precisa ter nome.

     O NUMERO DO MOTORISTA NAO VALE FALADO: VALE FOTOGRAFADO. Regra do dono
     (09/09/2026): "nao adianta apenas o motorista falar a quantidade — temos
     que ter prova da quantidade que ele bipou no sistema dele". A tela do
     celular dele, com o numero, e fotografada pelo tablet e gravada em
     `foto` (arquivo em FOTOS_DIR). Sem foto a rota nao fecha, nem batendo:
     o dia em que a caixa sumir, o que decide e a foto, nao a memoria. */
  db.exec(`CREATE TABLE IF NOT EXISTS coleta_fechamento (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fechado_em TEXT DEFAULT (datetime('now','localtime')),
    fechado_por TEXT DEFAULT '',
    qtd_sistema INTEGER NOT NULL,
    qtd_motorista INTEGER NOT NULL,
    divergente INTEGER DEFAULT 0,
    obs TEXT DEFAULT '',
    ids TEXT DEFAULT '[]',
    foto TEXT);`);
  try{ db.exec("ALTER TABLE coleta_fechamento ADD COLUMN foto TEXT"); }catch(e){}
  try{ fs.mkdirSync(FOTOS_DIR,{recursive:true}); }catch(e){}
  const {tipoDaFoto}=require('./foto');

  // bipe da etiqueta de venda -> acha o pacote pelos codigos e marca carregado
  app.post('/api/carregar',(req,res)=>{
    let code=((req.body&&req.body.code)||'').trim();
    const skuLido=soCodigo((req.body&&req.body.sku)||'');
    if(!code) return res.status(400).json({erro:'sem codigo'});
    /* A busca do volume pelo codigo mora no carga.js (acharVolumes): a saida
       do caminhao (fase 3) bipa as sobras pela MESMA regua. */
    const batem=acharVolumes(db,code);
    /* Duplicata do mesmo codigo existe (§5, os fantasmas). Entre irmaos, o que
       esta pra carregar manda: bipar a caixa certa nao pode dar "ja carregado"
       so porque um irmao fantasma andou antes. */
    const alvo = batem.find(r=>r.estagio==='embalado') || batem[0] || null;
    if(!alvo) return res.json({ok:false,motivo:'nao_encontrado',lido:code});
    /* A VENDA CANCELADA NO ML NAO SOBE NO CARRO (VENDAS-E-MEDIA fase 2, D2).
       O import da planilha tirou a caixa das listas; se ela chegar aqui mesmo
       assim, a pessoa esta com ela na mao — a recusa diz o que fazer com ela. */
    if(alvo.estagio==='cancelado'){
      try{ const ac=app.locals.acesso;
           if(ac&&ac.auditar) ac.auditar(req,'expedicao','carregar_cancelada',
             'NF '+(alvo.nf||alvo.id), (alvo.cancelada_motivo||'cancelada')+' — bipada no carregamento'); }catch(e){}
      return res.json({ok:false,motivo:'cancelada',pedido:{id:alvo.id,buyer:alvo.buyer,nf:alvo.nf,city:alvo.city},
        aviso:'Venda cancelada no Mercado Livre. Não carregar: separe a caixa e avise o admin — ela está no card '+
              '"Canceladas depois da etiqueta".'+(alvo.cancelada_motivo?' ML: “'+alvo.cancelada_motivo+'”':'')});
    }
    if(alvo.estagio==='bloqueado') return res.json({ok:false,motivo:'bloqueado',pedido:alvo,
        aviso:'SKU "'+(alvo.codigo||'(vazio)')+'" nao esta no cadastro. Nao pode ser carregado.'});
    if(alvo.estagio==='carregado') return res.json({ok:false,motivo:'duplicado',pedido:alvo,coleta:ehColeta(alvo)});
    /* ⚠️ SO CARREGA O QUE FOI EMBALADO (divida 13, 17/09/2026).
       Ate aqui a rota recusava so 'bloqueado' e 'carregado' — entao um volume
       'pendente' virava 'carregado' e a peca saia da fabrica SEM o -1 da
       Etiqueta de Venda. O estoque ficava permanentemente acima do fisico, e
       como o cruzamento so conta 'pendente', o volume sumia tambem da conta de
       urgencia: a venda nao virava ordem e a peca nao existia no saldo. Nada
       registrava.
       `carga.js` sempre respondeu `estagio='embalado'` para "isto esta pra
       carregar?" — a lista e o contador liam de la, e so o BIPE tinha regua
       propria. Esta linha e o bipe voltando pra mesma regua.
       A RECUSA DIZ O QUE FAZER, e nao so que nao pode: a caixa esta na mao da
       pessoa, na frente do carro, e "recusado" sem caminho e o que ensina a
       equipe a empurrar do jeito que der. */
    if(alvo.estagio!=='embalado'){
      try{ const ac=app.locals.acesso;
           if(ac&&ac.auditar) ac.auditar(req,'expedicao','carregar_nao_embalado',
             'NF '+(alvo.nf||alvo.id), 'estagio '+alvo.estagio+' — bipado no carregamento'); }catch(e){}
      return res.json({ok:false,motivo:'nao_embalado',pedido:{id:alvo.id,buyer:alvo.buyer,nf:alvo.nf,city:alvo.city},
        aviso:'Esta caixa ainda nao passou pela ETIQUETA DE VENDA. Imprima a etiqueta por la '+
              '(bipando o SKU) e depois carregue — e a impressao que baixa a peca do estoque.'});
    }
    /* A CAIXA DE AGENCIA JA CONFERIDA (fase 4): ela esta na area esperando o
       carro, e bipa-la de novo aqui nao a poe no carro — isso e o bipe da
       viagem. Dizer "ja conferida" em vez de conferir outra vez impede o nome
       de quem conferiu de ser trocado por quem so esbarrou na caixa. */
    if(!ehColeta(alvo) && alvo.conferido_em){
      return res.json({ok:false,motivo:'ja_conferida',pedido:{id:alvo.id,buyer:alvo.buyer,nf:alvo.nf,city:alvo.city},
        aviso:'Esta caixa ja foi conferida e esta na area. Para por no carro, abra a Viagem a agencia e bipe por la.'});
    }
    if(conferenciaLigada()){
      const esperado=soCodigo(alvo.codigo);
      if(!esperado) return res.json({ok:false,motivo:'volume_sem_sku',
        pedido:{id:alvo.id,buyer:alvo.buyer,nf:alvo.nf},
        aviso:'Esse volume nao tem SKU no sistema. Resolva no Admin antes de carregar.'});
      /* Sem o 2o bipe o volume nao passa — e a resposta NAO leva o SKU esperado,
         pra conferencia continuar cega. */
      if(!skuLido) return res.json({ok:false,motivo:'falta_sku',
        pedido:{id:alvo.id,buyer:alvo.buyer,nf:alvo.nf,city:alvo.city}});
      if(skuLido!==esperado){
        try{ const ac=app.locals.acesso;
             if(ac&&ac.auditar) ac.auditar(req,'expedicao','sku_divergente_carregamento',
               'NF '+(alvo.nf||alvo.id), 'esperado '+alvo.codigo+' / lido '+skuLido); }catch(e){}
        return res.json({ok:false,motivo:'sku_divergente',esperado:alvo.codigo,lido:skuLido,
          pedido:{id:alvo.id,buyer:alvo.buyer,nf:alvo.nf,city:alvo.city}});
      }
    }
    /* O BIPE DA AREA E A CONFERENCIA (bipe 2). Fase 4 da spec
       SAIDA-E-DUPLA-CONFERENCIA, decisao D1 do dono (26/09/2026): a caixa de
       AGENCIA ganhou um segundo bipe. Aqui ela e so CONFERIDA e fica na area;
       quem a poe no carro e o bipe da viagem (saida_route.js), que so aceita
       caixa conferida. Na COLETA nada muda: conferir e levar pro canto, e o
       canto e o lugar de onde o caminhao leva. */
    const quemBipou=(req.usuario&&req.usuario.nome)||null;
    if(!ehColeta(alvo)){
      db.prepare(`UPDATE lote SET conferido_por=?, conferido_em=datetime('now','localtime') WHERE id=?`)
        .run(quemBipou, alvo.id);
      const p2=progresso();
      const hoje2=db.prepare("SELECT date('now','localtime') d").get().d;
      return res.json({ok:true,conferida:true,pedido:alvo,carregados:p2.carregados,total:p2.total,
        prontas:p2.carro.prontas,coleta:false,adiantado:futuro(alvo,hoje2)});
    }
    db.prepare(`UPDATE lote SET estagio='carregado', carregado_em=datetime('now','localtime'),
        conferido_por=?, conferido_em=datetime('now','localtime') WHERE id=?`)
      .run(quemBipou, alvo.id);
    const p=progresso();
    /* A COLETA RESPONDE COM O NUMERO QUE O MOTORISTA VAI TER QUE BATER.
       "Esta indo N" depois de cada bipe e o que faz a pessoa saber, na hora,
       quantas caixas tem no canto — e pedir esse numero ao motorista antes de
       o caminhao sair. `carregados`/`total` continuam sendo do CARRO: a caixa
       de coleta nao entra nessa conta, senao o "12 de 12" fecharia o carro
       com caixa da agencia ainda no chao. */
    /* ADIANTADO: a etiqueta manda despachar num dia que ainda nao chegou. O
       bipe nao recusa (adiantar e permitido), mas DIZ — quem esta com a caixa
       na mao tem que saber que ela esta saindo antes do combinado. Na coleta a
       caixa ainda vai pro canto; a conta do adiantado so anda quando o
       caminhao leva (carga.js), mas o aviso vale desde ja. */
    const hojeD=db.prepare("SELECT date('now','localtime') d").get().d;
    res.json({ok:true,pedido:alvo,carregados:p.carregados,total:p.total,
              coleta:ehColeta(alvo), coleta_aguardando:p.coleta.aguardando.length,
              adiantado:futuro(alvo,hojeD)});
  });
  /* O PROGRESSO DA CARGA — o mesmo numero pras duas rotas.
     "Carregados X de Y" e a lista tem que falar do mesmo universo, senao o
     banner diz 12 de 12 com a lista mostrando 3 faltando. Y e o que ha pra
     fazer agora (todo `embalado`, de qualquer dia) mais o que ja foi carregado
     hoje — nao o total do dia de importacao, que era o que escondia o
     atrasado.
     DUAS PORTAS DE SAIDA, DUAS LISTAS. O carro (agencia) e o canto da coleta
     sao lugares fisicos diferentes, e a caixa que vai num nao pode aparecer na
     conta do outro: coleta no "faltam carregar" mandaria a caixa pro carro, e
     agencia no "esta indo" inflaria o numero que o motorista tem que bater. */
  function progresso(){
    const hoje=db.prepare("SELECT date('now','localtime') d").get().d;
    const todos=db.prepare(`SELECT id,codigo,cor,buyer,nf,data,despachar_em,modalidade,
        CASE WHEN conferido_em IS NOT NULL THEN 1 ELSE 0 END conferida FROM lote
      WHERE ${PRA_CARREGAR} ORDER BY ${ORDEM_CARGA}`).all()
      .map(v=>Object.assign({},v,{atrasado: atrasado(v,hoje)?1:0}));
    /* A VENDA FUTURA SAI DA CARGA DE HOJE, mas nao volta a sumir (#9): vai
       numa linha a parte. Cobra-la junto mandaria por no carro hoje um volume
       que so despacha semanas depois — a etiqueta foi impressa adiantada, a
       peca ainda nao e pra sair. Vale pras duas portas. */
    const doDia=todos.filter(v=>!futuro(v,hoje));
    const depois=todos.filter(v=>futuro(v,hoje));
    const faltam=doDia.filter(v=>!ehColeta(v));
    const coletaFaltam=doDia.filter(v=>ehColeta(v));
    /* CARREGADOS HOJE conta por `carregado_em`, nao por `data` — mesma razao do
       "impressas hoje" no exp_route.js. Contando pelo dia de importacao, o
       operador bipava um volume atrasado, ele saia da lista e o contador NAO
       andava: a tela ficava dizendo que ele nao tinha feito nada. */
    /* E a caixa de agencia que o CAMINHAO levou (troca de porta, fase 3) nao
       esta no carro: ela saiu com saiu_por='coleta' e nao pode inflar o "No
       carro X de Y" — o carro fecharia com uma caixa a menos dentro. */
    /* E a de COLETA que foi no carro (troca de porta pela viagem, fase 4)
       conta: ela esta dentro do carro, e a tela da viagem a mostra la — o
       topo dizendo 2 com a viagem dizendo 3 seria a mesma tela com duas
       reguas. Ela conta pela hora em que entrou no carro (`no_carro_em`). */
    const car=db.prepare(`SELECT COUNT(*) n FROM lote WHERE
      (carregado_em IS NOT NULL AND date(carregado_em)=date('now','localtime') AND ${AGENCIA()}
        AND COALESCE(saiu_por,'')<>'coleta')
      OR (no_carro_em IS NOT NULL AND date(no_carro_em)=date('now','localtime') AND ${COLETA()})`).get().n;
    /* O canto da coleta: o que esta la esperando o caminhao (carga.js), o que
       o caminhao ja levou hoje e os fechamentos do dia, com o resultado. */
    const aguardando=db.prepare(`SELECT id,codigo,buyer,nf,data,despachar_em,carregado_em FROM lote
      WHERE ${AGUARDA_CAMINHAO} ORDER BY carregado_em ASC, id ASC`).all();
    const retiradas=db.prepare(`SELECT COUNT(*) n FROM lote WHERE retirado_em IS NOT NULL
      AND date(retirado_em)=date('now','localtime')`).get().n;
    const fechamentos=db.prepare(`SELECT id,fechado_em,fechado_por,qtd_sistema,qtd_motorista,divergente,obs,
        CASE WHEN foto IS NOT NULL THEN 1 ELSE 0 END tem_foto
      FROM coleta_fechamento WHERE date(fechado_em)=date('now','localtime') ORDER BY id DESC`).all();
    /* As SAIDAS DO CAMINHAO (fase 3): as fechadas hoje e a aberta, se houver.
       A tabela e do saida_schema.js; a conta da saida, do carga.js. */
    const saidasHoje=db.prepare(`SELECT id,fechada_em,fechado_por,qtd_sistema,qtd_externa,divergente,liberado_por,motivo,
        CASE WHEN foto IS NOT NULL THEN 1 ELSE 0 END tem_foto
      FROM saida WHERE tipo='coleta' AND fechada_em IS NOT NULL AND date(fechada_em)=date('now','localtime')
      ORDER BY id DESC`).all();
    const aberta=db.prepare(`SELECT id,aberta_em,aberta_por FROM saida WHERE tipo='coleta' AND fechada_em IS NULL
      ORDER BY id DESC`).get()||null;
    /* A VIAGEM A AGENCIA (fase 4): quantas estao prontas na area (conferidas,
       fora do carro), a viagem aberta e as fechadas hoje. */
    const prontas=db.prepare(`SELECT COUNT(*) n FROM lote WHERE ${PRONTA_PRO_CARRO}`).get().n;
    const viagensHoje=db.prepare(`SELECT id,fechada_em,fechado_por,qtd_sistema,qtd_externa,divergente,liberado_por,motivo,
        CASE WHEN foto IS NOT NULL THEN 1 ELSE 0 END tem_foto
      FROM saida WHERE tipo='agencia' AND fechada_em IS NOT NULL AND date(fechada_em)=date('now','localtime')
      ORDER BY id DESC`).all();
    const viagem=db.prepare(`SELECT id,aberta_em,aberta_por FROM saida WHERE tipo='agencia' AND fechada_em IS NULL
      ORDER BY id DESC`).get()||null;
    return {total:car+faltam.length, carregados:car, faltam,
            atrasados:faltam.filter(f=>f.atrasado).length,
            depois, adiantadas:depois.length,
            /* O que JA SAIU adiantado (hoje e nos ultimos 30 dias), em pecas.
               Nao confundir com `adiantadas`, que e o que PODE sair adiantado:
               etiqueta impressa, despacho pra frente, ainda na fabrica. */
            saiu_adiantado:saidasAdiantadas(db,30),
            coleta:{faltam:coletaFaltam, aguardando, retiradas_hoje:retiradas, fechamentos,
                    saidas_hoje:saidasHoje, saida_aberta:aberta},
            carro:{prontas, viagem_aberta:viagem, viagens_hoje:viagensHoje},
            /* A conferencia da pilha (fase 2 da spec SAIDA-E-DUPLA-CONFERENCIA):
               impressas hoje x conferidas, caixa a caixa. A conta mora no
               carga.js; aqui so vai junto. */
            pilha:pilhaDaArea(db)};
  }
  // conferencia: o que falta carregar — todo `embalado`, com o atrasado marcado
  app.get('/api/carregamento',(req,res)=> res.json(progresso()));

  /* O "FECHAR COLETA" DE 10/09/2026 FOI APOSENTADO (fase 3 da spec
     SAIDA-E-DUPLA-CONFERENCIA, 26/09/2026). Ele fechava o canto INTEIRO de uma
     vez contra o numero do motorista: um dia sem fechar estragava todos os
     seguintes, a equipe nao aderiu e 399 caixas acumularam. Agora e uma saida
     por caminhao (saida_route.js). A rota fica de pe so para RECUSAR dizendo
     onde e agora: o tablet com a pagina antiga em cache ainda chama por aqui,
     e recusa sem caminho e o que ensina a contornar a tela. Os fechamentos
     antigos continuam como historia, com a foto (rota logo abaixo). */
  app.post('/api/coleta/fechar',(req,res)=>{
    res.json({ok:false,motivo:'aposentado',
      aviso:'O "Fechar coleta" virou a Saída do caminhão: no Carregamento, card da coleta, toque em '+
            '"Saída do caminhão", bipe o que ficou e feche com a foto do motorista. '+
            'Se a tela não mostra esse botão, atualize a página.'});
  });
  /* A prova, de volta: a foto de um fechamento. So a leitura — ninguem edita
     nem apaga foto por rota; se um dia precisar, e no disco, com nome. */
  app.get('/api/coleta/foto/:id',(req,res)=>{
    const r=db.prepare('SELECT foto FROM coleta_fechamento WHERE id=?').get(req.params.id);
    if(!r||!r.foto) return res.status(404).send('sem foto');
    let ok=false; try{ ok=fs.existsSync(r.foto); }catch(e){}
    if(!ok) return res.status(410).send('a foto nao esta mais no disco');
    res.setHeader('Content-Type', tipoDaFoto(r.foto));
    res.send(fs.readFileSync(r.foto));
  });
};
