const {PRA_CARREGAR,ORDEM_CARGA,atrasado,futuro,ehColeta,AGENCIA,AGUARDA_CAMINHAO}=require('./carga');
const fs=require('fs'), path=require('path');
/* Onde ficam as fotos da conferencia com o motorista. Fora do git e FORA de
   lotes/ (que o cron apaga em 7 dias): a foto e prova, e prova nao expira
   junto com o PDF. Configuravel por ambiente so pro teste nao escrever em
   /opt. */
const FOTOS_DIR=process.env.PCP_COLETAS_DIR||'/opt/expedicao/coletas';
const BLOQ=require('./bloqueados');
module.exports=function(app,db){
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
  /* A foto chega como data URL (a tela ja reduziu pra ~1600 px em JPEG). Aqui
     so se confere que E imagem e que tem conteudo — foto vazia nao e prova. */
  function decodificarFoto(s){
    const m=String(s||'').match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
    if(!m) return null;
    const buf=Buffer.from(m[2].replace(/\s+/g,''),'base64');
    if(buf.length<2000) return null;
    return {ext:(m[1].toLowerCase()==='jpg'?'jpeg':m[1].toLowerCase()),buf};
  }

  // bipe da etiqueta de venda -> acha o pacote pelos codigos e marca carregado
  app.post('/api/carregar',(req,res)=>{
    let code=((req.body&&req.body.code)||'').trim();
    const skuLido=soCodigo((req.body&&req.body.sku)||'');
    if(!code) return res.status(400).json({erro:'sem codigo'});
    const digits=code.replace(/\D/g,'');
    const jid=(code.match(/"id"\s*:\s*"?(\d+)/)||[])[1]||null;
    const cands=[code, digits, jid].filter(Boolean);
    /* PROCURA O VOLUME PELO CODIGO, NAO PELO DIA (carga.js).
       Enquanto isto era `WHERE data=date('now','localtime')`, o volume
       embalado ontem e nao carregado ontem respondia "nao encontrado" hoje —
       com a caixa na mao, na frente do carro. A busca larga primeiro (a chave
       e o codigo do ML, que e unico) e so depois confere o codigo exato, que
       e a mesma comparacao de antes. */
    const vistos=new Set(); const achados=[];
    for(const c of cands){
      for(const r of db.prepare('SELECT * FROM lote WHERE packId=? OR venda=? OR codes LIKE ?').all(c,c,'%'+c+'%')){
        if(vistos.has(r.id)) continue;
        vistos.add(r.id); achados.push(r);
      }
    }
    const batem=achados.filter(r=>{
      let cs=[]; try{ cs=JSON.parse(r.codes||'[]'); }catch(e){}
      cs=cs.concat([r.packId,r.venda].filter(Boolean));
      return cs.some(c=> cands.includes(String(c)) );
    });
    /* Duplicata do mesmo codigo existe (§5, os fantasmas). Entre irmaos, o que
       esta pra carregar manda: bipar a caixa certa nao pode dar "ja carregado"
       so porque um irmao fantasma andou antes. */
    const alvo = batem.find(r=>r.estagio==='embalado') || batem[0] || null;
    if(!alvo) return res.json({ok:false,motivo:'nao_encontrado',lido:code});
    if(alvo.estagio==='bloqueado') return res.json({ok:false,motivo:'bloqueado',pedido:alvo,
        aviso:'SKU "'+(alvo.codigo||'(vazio)')+'" nao esta no cadastro. Nao pode ser carregado.'});
    if(alvo.estagio==='carregado') return res.json({ok:false,motivo:'duplicado',pedido:alvo,coleta:ehColeta(alvo)});
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
    db.prepare("UPDATE lote SET estagio='carregado', carregado_em=datetime('now','localtime') WHERE id=?").run(alvo.id);
    const p=progresso();
    /* A COLETA RESPONDE COM O NUMERO QUE O MOTORISTA VAI TER QUE BATER.
       "Esta indo N" depois de cada bipe e o que faz a pessoa saber, na hora,
       quantas caixas tem no canto — e pedir esse numero ao motorista antes de
       o caminhao sair. `carregados`/`total` continuam sendo do CARRO: a caixa
       de coleta nao entra nessa conta, senao o "12 de 12" fecharia o carro
       com caixa da agencia ainda no chao. */
    res.json({ok:true,pedido:alvo,carregados:p.carregados,total:p.total,
              coleta:ehColeta(alvo), coleta_aguardando:p.coleta.aguardando.length});
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
    const todos=db.prepare(`SELECT id,codigo,cor,buyer,nf,data,despachar_em,modalidade FROM lote
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
    const car=db.prepare(`SELECT COUNT(*) n FROM lote WHERE carregado_em IS NOT NULL
      AND date(carregado_em)=date('now','localtime') AND ${AGENCIA()}`).get().n;
    /* O canto da coleta: o que esta la esperando o caminhao (carga.js), o que
       o caminhao ja levou hoje e os fechamentos do dia, com o resultado. */
    const aguardando=db.prepare(`SELECT id,codigo,buyer,nf,data,despachar_em,carregado_em FROM lote
      WHERE ${AGUARDA_CAMINHAO} ORDER BY carregado_em ASC, id ASC`).all();
    const retiradas=db.prepare(`SELECT COUNT(*) n FROM lote WHERE retirado_em IS NOT NULL
      AND date(retirado_em)=date('now','localtime')`).get().n;
    const fechamentos=db.prepare(`SELECT id,fechado_em,fechado_por,qtd_sistema,qtd_motorista,divergente,obs,
        CASE WHEN foto IS NOT NULL THEN 1 ELSE 0 END tem_foto
      FROM coleta_fechamento WHERE date(fechado_em)=date('now','localtime') ORDER BY id DESC`).all();
    /* O BLOQUEADO COM PRAZO PRA HOJE NAO VAI NO CARRO NEM NO CAMINHAO, e a tela
       tem que dizer isso ANTES de alguem fechar a carga. Ele nunca foi impresso,
       entao nao esta em `faltam` nem na coleta — e sem esta linha "carga completa"
       seria mentira: o carro fecha com uma venda do dia parada na prateleira, e
       o cliente e o Mercado Livre e que avisam. Conta do bloqueados.js, a mesma
       da Etiqueta de Venda; a lista vem so com os de hoje, que sao os que
       importam aqui. */
    const bloq=BLOQ.resumo(db);
    const bloqueados=BLOQ.lista(db).filter(v=>v.hoje);
    return {total:car+faltam.length, carregados:car, faltam,
            atrasados:faltam.filter(f=>f.atrasado).length,
            depois, adiantadas:depois.length,
            bloqueados_total:bloq.total, bloqueados,
            coleta:{faltam:coletaFaltam, aguardando, retiradas_hoje:retiradas, fechamentos}};
  }
  // conferencia: o que falta carregar — todo `embalado`, com o atrasado marcado
  app.get('/api/carregamento',(req,res)=> res.json(progresso()));

  /* FECHAR A COLETA = o motorista disse quantas bipou, e a gente compara.
     Fecha TUDO que esta esperando o caminhao de uma vez: a coleta e um
     evento, nao caixa a caixa. Quando bate, as caixas ganham `retirado_em` e
     saem do canto. Quando nao bate, NADA anda sem alguem confirmar — a
     resposta volta com a lista das caixas pra conferir uma a uma com o
     motorista ali. Confirmar com divergencia e permitido (o caminhao nao pode
     ficar preso pra sempre), mas fica gravado com quem fechou e vai pra
     auditoria: e a decisao que precisa ter nome. */
  app.post('/api/coleta/fechar',(req,res)=>{
    const b=req.body||{};
    const mot=parseInt(b.motorista,10);
    if(!(mot>=0)) return res.status(400).json({erro:'informe quantas caixas o motorista bipou'});
    const lista=db.prepare(`SELECT id,codigo,buyer,nf,carregado_em FROM lote
      WHERE ${AGUARDA_CAMINHAO} ORDER BY carregado_em ASC, id ASC`).all();
    const n=lista.length;
    if(!n) return res.json({ok:false,motivo:'nada',aviso:'Nenhuma caixa separada pra coleta. Bipe as caixas antes de fechar.'});
    /* SEM FOTO NAO FECHA — antes mesmo de comparar. A foto e da tela do
       celular do motorista com a quantidade que ELE bipou; e ela que prova o
       numero, nao o que foi dito em voz alta. Conferida antes da divergencia
       pra pessoa nao descobrir que faltou a foto so depois de conferir 50
       caixas uma a uma. */
    const foto=decodificarFoto(b.foto);
    if(!foto) return res.json({ok:false,motivo:'sem_foto',sistema:n,motorista:mot,
      aviso:'Tire a foto da tela do celular do motorista mostrando quantas caixas ele bipou. Sem a foto a coleta nao fecha.'});
    const divergente = mot!==n;
    const quem=(req.usuario&&req.usuario.nome)||'';
    if(divergente && !b.confirmar){
      try{ const ac=app.locals.acesso; if(ac&&ac.auditar)
        ac.auditar(req,'expedicao','coleta_divergente','coleta '+n+' x motorista '+mot,
          'nao fechou — mandou conferir caixa a caixa'); }catch(e){}
      return res.json({ok:false,motivo:'divergente',sistema:n,motorista:mot,lista});
    }
    const obs=String(b.obs||'').slice(0,300);
    let fid=null, arq=null;
    db.transaction(()=>{
      fid=db.prepare(`INSERT INTO coleta_fechamento (fechado_por,qtd_sistema,qtd_motorista,divergente,obs,ids)
        VALUES (?,?,?,?,?,?)`).run(quem,n,mot,divergente?1:0,obs,JSON.stringify(lista.map(v=>v.id))).lastInsertRowid;
      /* O arquivo leva o id do fechamento no nome: acha-se a foto pela linha
         e a linha pela foto. Gravado DENTRO da transacao — se o disco recusar,
         o fechamento nao existe, e a caixa continua no canto. */
      arq=path.join(FOTOS_DIR,'coleta-'+fid+'.'+foto.ext);
      fs.writeFileSync(arq,foto.buf);
      db.prepare('UPDATE coleta_fechamento SET foto=? WHERE id=?').run(arq,fid);
      const up=db.prepare("UPDATE lote SET retirado_em=datetime('now','localtime') WHERE id=? AND retirado_em IS NULL");
      lista.forEach(v=>up.run(v.id));
    })();
    if(divergente){
      try{ const ac=app.locals.acesso; if(ac&&ac.auditar)
        ac.auditar(req,'expedicao','coleta_fechada_divergente','fechamento '+fid,
          'sistema '+n+' / motorista '+mot+(obs?' — '+obs:'')); }catch(e){}
    }
    res.json({ok:true,id:fid,sistema:n,motorista:mot,divergente,foto:'/api/coleta/foto/'+fid});
  });
  /* A prova, de volta: a foto de um fechamento. So a leitura — ninguem edita
     nem apaga foto por rota; se um dia precisar, e no disco, com nome. */
  app.get('/api/coleta/foto/:id',(req,res)=>{
    const r=db.prepare('SELECT foto FROM coleta_fechamento WHERE id=?').get(req.params.id);
    if(!r||!r.foto) return res.status(404).send('sem foto');
    let ok=false; try{ ok=fs.existsSync(r.foto); }catch(e){}
    if(!ok) return res.status(410).send('a foto nao esta mais no disco');
    res.setHeader('Content-Type', /\.png$/i.test(r.foto)?'image/png':(/\.webp$/i.test(r.foto)?'image/webp':'image/jpeg'));
    res.send(fs.readFileSync(r.foto));
  });
};
