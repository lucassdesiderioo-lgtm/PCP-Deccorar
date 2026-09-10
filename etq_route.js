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
    res.json({cadastrado:true,estoque:s.estoque,total,pendentes:pend,futuros:fut,
              pedido:p||null,peca,sob_medida:!!s.sob_medida,adiantado,coleta,
              modo:(modo==='coleta'||modo==='agencia')?modo:'todas', na_outra_lista:outra});
  });

  app.post('/api/embalar',(req,res)=>{
    const id=(req.body&&req.body.id);
    if(!id) return res.status(400).json({erro:'sem id'});
    const o=db.prepare('SELECT * FROM lote WHERE id=?').get(id);
    if(!o) return res.status(404).json({erro:'venda nao encontrada'});
    if(o.estagio==='bloqueado') return res.json({erro:'Volume bloqueado: SKU fora do cadastro.'});
    if(o.estagio!=='pendente') return res.json({erro:'Esta venda ja foi processada ('+o.estagio+').'});
    const s=db.prepare(`SELECT s.estoque, COALESCE(m.sob_medida,0) sob_medida
      FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id WHERE s.codigo=?`).get(o.codigo);
    if(!s) return res.json({erro:'SKU nao cadastrado.'});
    /* SOB MEDIDA NAO PASSA PELA TRAVA DE ESTOQUE — nem pela baixa.
       A peca e feita contra o pedido: nao existe antes da venda, nao sobra
       depois, e por isso o saldo dela e sempre zero. Cobrar estoque aqui
       recusava TODA venda sob medida, e o que a operacao fazia era imprimir
       a etiqueta pelo PDF do ML e despachar por fora — sem registro, sem
       conferencia no carregamento, e com o volume preso em `pendente` para
       sempre. A trava so protegia no papel.
       A baixa tambem sai: sem +1 na embalagem nao pode haver -1 aqui, senao
       cada venda sob medida abriria um buraco de uma peca no SKU. */
    if(!s.sob_medida && s.estoque<=0) return res.json({erro:'Sem estoque desse SKU.'});
    db.transaction(()=>{
      db.prepare("UPDATE lote SET estagio='embalado', embalado_em=datetime('now','localtime') WHERE id=?").run(id);
      if(!s.sob_medida) db.prepare('UPDATE skus SET estoque=MAX(0,estoque-1) WHERE codigo=?').run(o.codigo);
    })();
    const e=db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(o.codigo);
    /* Depois de imprimir, a tela diz pra onde a caixa vai. Sai daqui, e nao
       do que a tela guardou do bipe: e o volume gravado que manda. */
    res.json({ok:true,estoque:e?e.estoque:0,coleta:ehColeta(o)});
  });
};
