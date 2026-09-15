const {VENCE_HOJE,ORDEM_URGENCIA}=require('./fila_dia');
const {ehColeta,COLETA,AGENCIA}=require('./carga');
module.exports=function(app,db){
  app.get('/api/proximo/:sku',(req,res)=>{
    const sku=(req.params.sku||'').trim().toUpperCase();
    /* O FILTRO DA TELA: Todas / Agencia / Coleta (§8-B). A Etiqueta de Venda
       mostra as duas listas lado a lado e o operador escolhe em qual esta
       trabalhando — o caminhao da coleta chega numa hora, o carro da agencia
       sai em outra. Com o filtro, o bipe pega a venda mais urgente DAQUELA
       lista, e nao a mais urgente do SKU em geral; sem filtro (Todas) e o
       comportamento de sempre. A regua de "isto e coleta?" e a do carga.js. */
    const modo=String((req.query&&req.query.modo)||'').toLowerCase();
    const FM = modo==='coleta' ? ' AND '+COLETA() : (modo==='agencia' ? ' AND '+AGENCIA() : '');
    /* O QUE A PECA E, nao so o codigo dela. O leitor de codigo de barras le a
       ETIQUETA, nunca a persiana: se a peca dentro da caixa nao for o que a
       etiqueta diz, nenhum bipe no mundo percebe. Estas quatro informacoes sao
       a unica conferencia possivel contra isso — o operador olha a peca e olha
       a tela. Vem das colunas de `skus` (§7), nunca do texto do codigo. */
    const s=db.prepare(`SELECT s.codigo,s.estoque,s.largura_cm,s.altura_cm,
        COALESCE(c.nome,s.cor_codigo,s.cor) cor_nome, COALESCE(t.nome,s.tecido_codigo) tecido_nome,
        m.nome modelo_nome, COALESCE(m.exige_medida,1) exige_medida,
        COALESCE(m.sob_medida,0) sob_medida
      FROM skus s
      LEFT JOIN cor c ON c.codigo=s.cor_codigo
      LEFT JOIN tecido t ON t.codigo=s.tecido_codigo
      LEFT JOIN modelo m ON m.id=s.modelo_id
      WHERE s.codigo=?`).get(sku);
    if(!s) return res.json({cadastrado:false});
    /* MESMA REGUA DA LISTA "Faltam imprimir" (fila_dia.js): o que manda e a
       data de despacho da etiqueta, nao o dia em que o PDF entrou. Se estas
       consultas filtrassem por `data` enquanto a lista filtra por prazo, a tela
       cobraria um volume que o bipe nao acha — e o operador bipa um codigo que
       a propria tela diz que existe. */
    const total=db.prepare(`SELECT COUNT(*) c FROM lote WHERE codigo=? AND `+VENCE_HOJE+FM).get(sku).c;
    const pend=db.prepare(`SELECT COUNT(*) c FROM lote WHERE codigo=? AND estagio='pendente' AND `+VENCE_HOJE+FM).get(sku).c;
    /* Quantas vendas desse SKU ainda vao vencer. Elas nao entram no `pendentes`
       (que e a cobranca do dia) mas precisam ser contadas, porque sao o trabalho
       que da pra adiantar quando sobra peca na prateleira. */
    const fut=db.prepare(`SELECT COUNT(*) c FROM lote
      WHERE codigo=? AND estagio='pendente' AND despachar_em IS NOT NULL
        AND despachar_em>date('now','localtime')`+FM).get(sku).c;
    /* O PROXIMO VOLUME E O MAIS URGENTE — E VENDA FUTURA TAMBEM E VOLUME.
       A busca nao filtra por prazo: quem decide e a ordem. Sem data e vencido
       vem primeiro, depois hoje, e so entao o futuro. Assim o operador nunca
       adianta uma venda de setembro enquanto existe uma atrasada do mesmo SKU
       esperando — e, esgotadas as do dia, o bipe segue trabalhando em vez de
       dizer que nao ha nada.
       O que impede adiantar o que nao pode e a trava de estoque, que ja existe
       logo abaixo: sem peca na prateleira nada e impresso. E exatamente a regra
       "so se tiver estoque disponivel". */
    const p=db.prepare(`SELECT id,codigo,cor,buyer,city,nf,packId,venda,despachar_em,modalidade
      FROM lote WHERE codigo=? AND estagio='pendente'`+FM+`
      ORDER BY `+ORDEM_URGENCIA+` LIMIT 1`).get(sku);
    /* Quando o filtro nao acha nada, a tela precisa saber se e porque NAO HA
       venda desse SKU ou porque ha, mas na OUTRA lista — sao dois avisos
       diferentes ("nenhuma de coleta; tem 3 na agencia" x "SKU nao esta no
       lote"). */
    const outra = (!p && FM) ? db.prepare(`SELECT COUNT(*) c FROM lote WHERE codigo=? AND estagio='pendente'`).get(sku).c : 0;
    const hoje=db.prepare("SELECT date('now','localtime') d").get().d;
    /* Adiantado = tem prazo, e o prazo e depois de hoje. A tela usa isto pra
       avisar que a entrega nao e do dia — sem isso o operador nao teria como
       distinguir, e uma venda de setembro pareceria urgente. */
    const adiantado = !!(p && p.despachar_em && p.despachar_em>hoje);
    /* Medida so entra quando o modelo cobra medida — acessorio nao tem, e
       exibir "null x null" ensinaria o operador a ignorar a linha inteira. */
    const peca={
      medida:(s.exige_medida && s.largura_cm && s.altura_cm)?(s.largura_cm+' × '+s.altura_cm):null,
      cor:s.cor_nome||null, tecido:s.tecido_nome||null, modelo:s.modelo_nome||null
    };
    /* A tela precisa saber que e sob medida para nao anunciar "Estoque: 0"
       como se fosse falta. Zero ali e o normal, nao um alarme — e um numero
       que aparece como problema todo dia ensina a equipe a ignora-lo. */
    /* COLETA: a etiqueta sai igual, mas a caixa vai pro canto reservado e NAO
       pro carro — o caminhao do Mercado Livre vem buscar. A tela precisa dizer
       isso ANTES de imprimir, porque e quem cola a etiqueta que decide onde a
       caixa vai parar. Regua unica em carga.js. */
    const coleta = ehColeta(p);
    /* ESTA CAIXA LEVA MAIS DE UMA PERSIANA? (§5-B)
       Quando leva, a tela NAO pode imprimir direto: quem cola a etiqueta tem
       que bipar cada SKU que entra na caixa. O leitor le a etiqueta, nunca a
       persiana (§4) — e aqui sao varias persianas atras de uma etiqueta so, que
       e o lugar em que mandar a peca errada fica mais facil, nao mais dificil.
       A peca de cada item vem junto, das colunas de `skus`: e o que a bancada
       compara com o que tem na mao antes de bipar. */
    const itens = p ? db.prepare(`SELECT i.id,i.codigo,i.qtd,i.conferido_em,
        s.largura_cm,s.altura_cm, COALESCE(c.nome,s.cor_codigo,s.cor) cor_nome,
        COALESCE(t.nome,s.tecido_codigo) tecido_nome, m.nome modelo_nome,
        COALESCE(m.exige_medida,1) exige_medida
      FROM lote_item i
      LEFT JOIN skus s ON s.codigo=UPPER(i.codigo)
      LEFT JOIN cor c ON c.codigo=s.cor_codigo
      LEFT JOIN tecido t ON t.codigo=s.tecido_codigo
      LEFT JOIN modelo m ON m.id=s.modelo_id
      WHERE i.lote_id=? ORDER BY i.id`).all(p.id) : [];
    res.json({cadastrado:true,estoque:s.estoque,total,pendentes:pend,futuros:fut,
              pedido:p||null,peca,sob_medida:!!s.sob_medida,adiantado,coleta,
              /* Lista vazia e o caso normal (uma etiqueta, uma persiana) e a
                 tela nao muda em nada por causa dela. */
              itens: itens.length>1?itens:[],
              modo:(modo==='coleta'||modo==='agencia')?modo:'todas', na_outra_lista:outra});
  });

  /* O BIPE DE CADA PECA DA CAIXA, ANTES DE IMPRIMIR (§5-B).
     Um bipe por LINHA de item, nao por unidade: duas persianas iguais tem a
     mesma etiqueta de SKU, e bipar o mesmo codigo duas vezes nao prova nada a
     mais. A quantidade a tela mostra ao lado, pra conferir na mao.

     ⚠️ AQUI A LISTA APARECE, e nao e contradicao com a conferencia cega do
     carregamento (§5). La a caixa ja esta fechada e o bipe confere o que
     entrou; aqui a caixa esta sendo MONTADA, e sem a lista a bancada nao sabe
     o que buscar na prateleira. E roteiro de separacao, como a "Faltam
     imprimir" — esconder viraria adivinhacao, nao rigor. O que o sistema nao
     faz e dar a peca por conferida sem o bipe. */
  app.post('/api/lote/conferir',(req,res)=>{
    const b=req.body||{};
    const id=Number(b.id), sku=String(b.codigo||'').trim().toUpperCase();
    if(!id||!sku) return res.status(400).json({erro:'sem volume ou sem codigo'});
    const o=db.prepare('SELECT id,estagio FROM lote WHERE id=?').get(id);
    if(!o) return res.status(404).json({erro:'venda nao encontrada'});
    if(o.estagio!=='pendente') return res.json({erro:'Esta venda ja foi processada ('+o.estagio+').'});
    const itens=db.prepare('SELECT id,codigo,qtd,conferido_em FROM lote_item WHERE lote_id=? ORDER BY id').all(id);
    if(itens.length<2) return res.json({erro:'Esta caixa leva uma peca so — nao ha o que conferir.'});
    const alvo=itens.find(i=>String(i.codigo||'').toUpperCase()===sku && !i.conferido_em);
    if(!alvo){
      const jaFoi=itens.some(i=>String(i.codigo||'').toUpperCase()===sku);
      return res.json({erro: jaFoi
        ? 'Esse SKU já foi conferido nesta caixa.'
        : 'Esse SKU não é desta caixa.', faltam:itens.filter(i=>!i.conferido_em).length});
    }
    const quem=(req.usuario&&req.usuario.nome)||'';
    db.prepare(`UPDATE lote_item SET conferido_em=datetime('now','localtime'), conferido_por=?
      WHERE id=?`).run(quem,alvo.id);
    const faltam=itens.filter(i=>!i.conferido_em && i.id!==alvo.id).length;
    res.json({ok:true,codigo:alvo.codigo,qtd:alvo.qtd,faltam});
  });

  app.post('/api/embalar',(req,res)=>{
    const id=(req.body&&req.body.id);
    if(!id) return res.status(400).json({erro:'sem id'});
    const o=db.prepare('SELECT * FROM lote WHERE id=?').get(id);
    if(!o) return res.status(404).json({erro:'venda nao encontrada'});
    if(o.estagio==='bloqueado') return res.json({erro:'Volume bloqueado: SKU fora do cadastro.'});
    if(o.estagio!=='pendente') return res.json({erro:'Esta venda ja foi processada ('+o.estagio+').'});

    /* ── A CAIXA COM MAIS DE UMA PERSIANA (§5-B) ────────────────────────────
       Uma etiqueta, varias pecas. O que muda aqui e tudo o que depende de
       "quantas": a trava de estoque, a baixa e a conferencia por bipe.
       A lista sai do `lote_item`; vazia (ou com um item so) e o caso normal, e
       dali pra baixo nada muda em relacao ao que sempre existiu. */
    const itens=db.prepare('SELECT id,codigo,qtd,conferido_em FROM lote_item WHERE lote_id=? ORDER BY id').all(id);
    const pacote = itens.length>1;

    /* SEM O BIPE DE TODAS AS PECAS, NAO IMPRIME. E o mesmo desenho do kit na
       embalagem (§4): o bipe que falta recusa o passo seguinte, em vez de
       avisar e deixar passar. Aviso numa caixa com tres persianas e aviso que
       se aprende a fechar. */
    if(pacote){
      const faltam=itens.filter(i=>!i.conferido_em);
      if(faltam.length) return res.json({erro:'⚠ FALTA CONFERIR '+faltam.length+' de '+itens.length+
        ' peça(s) desta caixa. Bipe o SKU de cada persiana antes de imprimir.', faltam:faltam.length});
    }

    /* A TRAVA DE ESTOQUE VALE PARA CADA PECA, E A BAIXA TAMBEM. Cobrar so o
       `lote.codigo` numa caixa de tres persianas deixaria duas saindo da
       prateleira sem baixar — o furo silencioso que a armadilha #23 descreve. */
    const linhas = pacote ? itens.map(i=>({codigo:String(i.codigo||'').toUpperCase(), qtd:Math.max(1,i.qtd||1)}))
                          : [{codigo:o.codigo, qtd:1}];
    const dados=db.prepare(`SELECT s.codigo, s.estoque, COALESCE(m.sob_medida,0) sob_medida
      FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id WHERE s.codigo=?`);
    for(const l of linhas){
      const d=dados.get(l.codigo);
      if(!d) return res.json({erro:'SKU nao cadastrado: '+l.codigo});
      l.sob_medida=!!d.sob_medida; l.estoque=d.estoque;
    }
    const s=linhas.find(l=>l.codigo===o.codigo)||linhas[0];
    /* SOB MEDIDA NAO PASSA PELA TRAVA DE ESTOQUE — nem pela baixa.
       A peca e feita contra o pedido: nao existe antes da venda, nao sobra
       depois, e por isso o saldo dela e sempre zero. Cobrar estoque aqui
       recusava TODA venda sob medida, e o que a operacao fazia era imprimir
       a etiqueta pelo PDF do ML e despachar por fora — sem registro, sem
       conferencia no carregamento, e com o volume preso em `pendente` para
       sempre. A trava so protegia no papel.
       A baixa tambem sai: sem +1 na embalagem nao pode haver -1 aqui, senao
       cada venda sob medida abriria um buraco de uma peca no SKU. */
    /* A recusa nomeia O SKU que faltou: numa caixa de tres, "sem estoque" sem
       dizer de que peca manda a bancada procurar no escuro. */
    for(const l of linhas)
      if(!l.sob_medida && l.estoque < l.qtd)
        return res.json({erro: linhas.length>1
          ? ('Sem estoque de '+l.codigo+' (precisa de '+l.qtd+', tem '+l.estoque+').')
          : 'Sem estoque desse SKU.'});
    db.transaction(()=>{
      db.prepare("UPDATE lote SET estagio='embalado', embalado_em=datetime('now','localtime') WHERE id=?").run(id);
      const baixa=db.prepare('UPDATE skus SET estoque=MAX(0,estoque-?) WHERE codigo=?');
      for(const l of linhas) if(!l.sob_medida) baixa.run(l.qtd,l.codigo);
    })();
    const e=db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(o.codigo);
    /* Depois de imprimir, a tela diz pra onde a caixa vai. Sai daqui, e nao
       do que a tela guardou do bipe: e o volume gravado que manda. */
    res.json({ok:true,estoque:e?e.estoque:0,coleta:ehColeta(o),
      /* `pecas` so vem quando a caixa leva mais de uma: e o numero que a tela
         escreve no "Impresso ✓", pra quem fecha a caixa conferir na mao. */
      pecas: pacote ? linhas.reduce((t,l)=>t+l.qtd,0) : undefined});
  });
};
