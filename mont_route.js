module.exports=function(app,db){
  db.exec("CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT);");
  // Le uma chave do `config`. null = a chave NAO EXISTE (diferente de gravada
  // vazia, que e uma decisao de quem editou — ver etiquetaAtual()).
  function cfg(chave){
    const r=db.prepare('SELECT valor FROM config WHERE chave=?').get(chave);
    return r?r.valor:null;
  }
  // Registro das acoes do kit (R9 da spec). Nunca lanca: log nao derruba acao.
  // So o que ACONTECEU vira linha — recusa nao e acao, e auditoria cheia de
  // tentativa recusada enterra a troca de verdade no ruido.
  function auditar(req,acao,alvo,detalhe){
    try{ const ac=app.locals.acesso; if(ac&&ac.auditar) ac.auditar(req,'sistema',acao,alvo,detalhe); }catch(e){}
  }

  /* ⚠️ AQUI MORAVA O SEGUNDO CAMINHO DA ETIQUETA DO KIT, e ele saiu em
     17/09/2026 (spec GERADOR-ETIQUETA-KIT, R11, fase 4).
     Eram quatro rotas em `/api/kit/label`: subir uma arte pronta (PDF, PNG,
     JPG ou SVG), guardar no disco e imprimir por ela.

     O problema não era o upload: era serem DOIS. O arquivo enviado é uma
     imagem morta — o gerador acompanha o `kit_codigo`, o arquivo não. No dia
     em que alguém trocasse o código, quem imprimisse pelo upload tiraria um
     rolo que não bipa na Embalagem, e descobriria com a peça na mão, sem
     ninguém saber que havia um segundo caminho.

     NÃO RECRIE ISTO. A impressão da etiqueta do kit tem uma porta só:
     `POST /api/kit/etiqueta/imprimir`, que desenha a partir do que está
     salvo. Há caso travando (seção 12 do `teste_kit.js`).

     O arquivo já enviado e a linha `config.kit_label` NÃO foram apagados no
     deploy: o código parou de lê-los, e nada foi destruído. Limpar é `rm` na
     pasta `kit/`, com o gerador já rodando. */
  // teste vem por ultimo: e a coluna que o teste_route adicionava por ALTER
  db.exec("CREATE TABLE IF NOT EXISTS montagem (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, inicio TEXT, fim TEXT, segundos INTEGER, kit_ok INTEGER DEFAULT 1, data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')), teste INTEGER DEFAULT 0);");
  app.get('/api/config/kit',(req,res)=>{ const r=db.prepare("SELECT valor FROM config WHERE chave='kit_codigo'").get(); res.json({kit:r?r.valor:null}); });
  // Guarda o valor COMO VEIO (so trim) — o link do Drive e case-sensitive e
  // vira QR pro cliente. A conferencia na embalagem (kitBate/kitNorm) compara
  // ignorando maiusculas/simbolos, entao o casamento nao depende do case.
  //
  // TROCAR O CODIGO EXIGE `confirmar` (spec GERADOR-ETIQUETA-KIT, R8). O rolo de
  // etiquetas ja impresso com o codigo antigo para de bater no bipe da
  // Embalagem, e quem descobre isso e a bancada, com a peca na mao, sem saber
  // que alguem trocou. A guarda e no SERVIDOR, nao no `confirm()` da tela: um
  // aviso que so existe no navegador nao protege quem chama a rota por fora.
  //
  // A comparacao e do texto cru, nao normalizada: trocar KITENVIO por kitenvio
  // nao quebraria o bipe (o kitBate ignora caixa), mas confirmar de graca custa
  // um clique — e uma SEGUNDA regua de "e o mesmo codigo?" aqui divergiria da
  // do montagem.html no dia em que uma das duas mudasse, e aí a confirmacao
  // seria pulada justamente na troca que quebra.
  app.post('/api/config/kit',(req,res)=>{
    const v=((req.body&&req.body.kit)||'').trim();
    const antigo=cfg('kit_codigo');
    if(antigo!==null && antigo!==v && !(req.body&&req.body.confirmar)){
      return res.status(409).json({
        confirmar_troca:true, antigo:antigo, novo:v,
        erro:'As etiquetas já impressas com o código '+(antigo||'(nenhum)')
          +' vão parar de funcionar na Embalagem. Confirmar troca para '+(v||'(nenhum)')+'?'
      });
    }
    db.prepare("INSERT INTO config (chave,valor) VALUES ('kit_codigo',?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run(v);
    if(antigo!==v) auditar(req,'kit_codigo',v,'antes: '+(antigo===null?'(nao havia)':(antigo||'(vazio)')));
    res.json({ok:true,kit:v});
  });

  /* ── O CONTEUDO DA ETIQUETA DO KIT (spec GERADOR-ETIQUETA-KIT, fase 1) ──
     Quatro campos, quatro linhas em `config`, ao lado do kit_codigo. Um JSON
     unico caberia numa chave so, mas campo dentro de JSON nao se acha com grep
     e nao se le com sqlite3 — e a divida 12(a) do §14 ja aponta para o lado
     contrario disso (tabela `parametro`, com rotulo e unidade). */
  const ETQ_PADRAO = { linha1:'SEU MANUAL ESTÁ', linha2:'AQUI', qr_legenda:'MANUAL', link:'' };
  const ETQ_CHAVE  = { linha1:'kit_etq_linha1', linha2:'kit_etq_linha2',
                       qr_legenda:'kit_etq_qr_legenda', link:'kit_etq_link' };
  /* ⚠️ O LIMITE DAS LINHAS SAI DO DESENHO, NAO DAQUI. Ele era 20 por chute na
     fase 1; na fase 2 passou a ser MEDIDO em `public/kit_etiqueta.js`, com a
     largura real das letras na menor altura legivel — deu 16. Escrever o numero
     aqui tambem criaria duas reguas para "cabe na etiqueta?", e a do servidor
     envelheceria calada no dia em que o desenho mudasse de tamanho.
     (E o mesmo arranjo que o `tecido/dominio/etiqueta_pdf.js` ja faz com o
     `public/barras.js`: o back le o arquivo do desenho.)
     A legenda do QR continua em 10, que e numero da spec, nao da medida. */
  const DESENHO_ETQ = require('./public/kit_etiqueta.js');
  const LIMITE_LINHA = DESENHO_ETQ.limiteDeCaracteres();
  const LIMITE_LEGENDA = 10;

  function etiquetaAtual(){
    const o = {};
    for(const k of Object.keys(ETQ_CHAVE)){
      const v = cfg(ETQ_CHAVE[k]);
      // chave AUSENTE recebe o padrao; chave GRAVADA VAZIA e uma decisao de quem
      // editou (etiqueta de uma linha so) e fica como esta.
      o[k] = (v===null) ? ETQ_PADRAO[k] : v;
    }
    return o;
  }
  /* Fora do drive.google.com AVISA e deixa salvar (R4). Recusar seria trava
     disparando no caso legitimo — o manual pode estar noutro lugar, e quem
     decide isso e quem cola o link (armadilha #6). */
  function avisoDoLink(link){
    if(!link) return null;
    let host=''; try{ host=new URL(link).hostname.toLowerCase(); }catch(e){ return null; }
    if(host==='drive.google.com'||host.endsWith('.drive.google.com')) return null;
    return 'Esse link não é do Google Drive ('+host+'). Salvo assim mesmo — confira se ele abre a pasta do manual.';
  }
  function respostaEtiqueta(extra){
    const e = etiquetaAtual();
    // Pronta = da para imprimir na fase 3. Falta o codigo ou o link, a impressao
    // fica bloqueada, e a tela precisa dizer POR QUE antes de chegar la (R7).
    const falta = [];
    if(!cfg('kit_codigo')) falta.push('o Código do kit');
    if(!e.link) falta.push('o link do manual');
    return Object.assign({}, e, {
      aviso: avisoDoLink(e.link), pronta: falta.length===0, falta: falta,
      limites:{ linha:LIMITE_LINHA, legenda:LIMITE_LEGENDA }
    }, extra||{});
  }
  app.get('/api/config/kit/etiqueta',(req,res)=> res.json(respostaEtiqueta()));
  app.post('/api/config/kit/etiqueta',(req,res)=>{
    const b = req.body||{};
    /* CAMPO AUSENTE NAO E CAMPO VAZIO. E a divida 15 do §14 (o POST /api/skus
       que zera o estoque quando o corpo nao traz `estoque`): um POST so com o
       link nao pode apagar o texto da etiqueta. So mexe no que veio. */
    const vem = Object.keys(ETQ_CHAVE).filter(k => Object.prototype.hasOwnProperty.call(b,k));
    if(!vem.length) return res.status(400).json({erro:'nada para salvar'});
    const novo = {};
    for(const k of vem) novo[k] = String(b[k]==null?'':b[k]).trim();
    /* Duas cercas, e elas respondem coisas diferentes:
       1. a contagem de caracteres impede o absurdo (paragrafo colado no campo);
       2. a MEDIDA decide se cabe na etiqueta — 16 letras estreitas cabem com
          folga e 16 'M' nao cabem, entao contar caractere nunca responderia.
       A medida olha o RESULTADO (o que ja estava gravado mais o que veio), e
       nao so o campo enviado: as duas linhas dividem o mesmo tamanho de letra,
       entao a linha 1 pode deixar de caber por causa de uma linha 2 que este
       POST nem tocou. */
    for(const k of ['linha1','linha2']){
      if(novo[k]!==undefined && novo[k].length>LIMITE_LINHA)
        return res.status(400).json({erro:'A '+(k==='linha1'?'linha 1':'linha 2')+' cabe em '
          +LIMITE_LINHA+' caracteres (veio '+novo[k].length+').'});
    }
    const resultado = Object.assign({}, etiquetaAtual(), novo);
    if(!DESENHO_ETQ.capParaLinhas([resultado.linha1||'', resultado.linha2||'']).cabe)
      return res.status(400).json({erro:'Esse texto não cabe na etiqueta nem na letra menor — encurte a linha 1 ou a linha 2.'});
    if(novo.qr_legenda!==undefined && novo.qr_legenda.length>LIMITE_LEGENDA)
      return res.status(400).json({erro:'A legenda do QR cabe em '+LIMITE_LEGENDA+' caracteres (veio '+novo.qr_legenda.length+').'});
    if(novo.link!==undefined && novo.link && !/^https:\/\//i.test(novo.link))
      return res.status(400).json({erro:'O link precisa começar com https:// — é ele que vira o QR que o cliente escaneia.'});
    const gravar = db.transaction(()=>{
      const up = db.prepare("INSERT INTO config (chave,valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor");
      for(const k of vem) up.run(ETQ_CHAVE[k], novo[k]);
    });
    gravar();
    auditar(req,'kit_etiqueta_conteudo', vem.join(', '), vem.map(k=>k+'='+novo[k]).join(' · '));
    res.json(respostaEtiqueta({ok:true}));
  });

  /* ── A IMPRESSAO (fase 3) ───────────────────────────────────────────────
     Devolve o PDF pronto, no tamanho da etiqueta. O conteudo NAO vem da tela:
     e lido do banco aqui. Aceitar o texto do corpo deixaria sair um rolo
     diferente do que o card mostra e do que a Embalagem bipa — e ninguem
     compararia os dois, porque o papel some dentro da caixa.

     ⚠️ O CODIGO DE BARRAS E SEMPRE O `kit_codigo` SALVO. Nao ha campo para
     ele, de proposito: um segundo campo e exatamente o que faz o impresso sair
     diferente do que a bancada bipa (§4). */
  const KIT_PDF = require('./kit_pdf.js');
  app.post('/api/kit/etiqueta/imprimir', async (req,res)=>{
    const quantidade = Math.trunc(Number((req.body||{}).quantidade));
    const conteudo = Object.assign({ codigo: cfg('kit_codigo') || '' }, etiquetaAtual());
    const v = KIT_PDF.conferir(conteudo, quantidade);
    // 409 e nao 400: o corpo esta bem formado, o que falta e o CADASTRO — e a
    // tela precisa saber a diferenca para mandar preencher o card em vez de
    // dizer que a quantidade esta errada.
    if(!v.pronta) return res.status(409).json({ erro:v.problemas[0], problemas:v.problemas });
    let pdf;
    try{ pdf = await KIT_PDF.gerar(conteudo, quantidade); }
    catch(e){ return res.status(500).json({ erro:'Não deu para gerar o PDF: '+e.message }); }
    /* R9 — QUEM IMPRIMIU, QUANDO E QUANTAS. O rolo impresso e um objeto fisico
       que circula pela fabrica por meses; sem registro, ninguem responde de
       que dia e aquele rolo quando o codigo mudar. O codigo vai no detalhe
       justamente para isso. */
    auditar(req,'kit_etiqueta_impressa', String(quantidade)+' etiqueta(s)',
      'código '+conteudo.codigo+' · link '+conteudo.link);
    res.json({ tipo:'pdf', quantidade,
      nome:'etiquetas-kit-'+quantidade+'.pdf',
      arquivo: pdf.toString('base64') });
  });
  app.post('/api/montagem',(req,res)=>{
    const {codigo,segundos=0,kit_ok=1,inicio=null,fim=null}=req.body||{};
    if(!codigo) return res.status(400).json({erro:'codigo'});
    const cod=codigo.trim().toUpperCase();
    db.prepare("INSERT INTO montagem (codigo,inicio,fim,segundos,kit_ok) VALUES (?,?,?,?,?)").run(cod,inicio,fim,Math.round(+segundos||0),kit_ok?1:0);
    const f=db.prepare("SELECT id,modo FROM fila WHERE codigo=? AND situacao='aguardando' ORDER BY id LIMIT 1").get(cod);
    let naFila=false, modo='estoque';
    if(f){ db.prepare("UPDATE fila SET situacao='embalado', embalado_em=datetime('now','localtime') WHERE id=?").run(f.id); naFila=true; modo=f.modo; }
    db.prepare('UPDATE skus SET estoque=estoque+1 WHERE codigo=?').run(cod);
    let abatido=false;
    if(modo==='hoje'){
      const r=db.prepare("SELECT id FROM producao WHERE codigo=? AND data=date('now','localtime') AND produzido<qtd ORDER BY id LIMIT 1").get(cod);
      if(r){ db.prepare('UPDATE producao SET produzido=produzido+1 WHERE id=?').run(r.id); abatido=true; }
    }
    const est=db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(cod);
    const prog=db.prepare("SELECT COUNT(*) n FROM montagem WHERE data=date('now','localtime')").get();
    res.json({ok:true,total_hoje:prog.n,naFila:naFila,abatido:abatido,estoque:est?est.estoque:0});
  });
  app.get('/api/fila',(req,res)=>{
    res.json(db.prepare(`SELECT f.codigo, s.cor, COUNT(*) qtd, MIN(f.revisado_em) desde
      FROM fila f LEFT JOIN skus s ON s.codigo=f.codigo
      WHERE f.situacao='aguardando' GROUP BY f.codigo ORDER BY desde`).all());
  });
  app.get('/api/montagem/hoje',(req,res)=> res.json(db.prepare("SELECT codigo, COUNT(*) qtd, ROUND(AVG(segundos)) tmedio FROM montagem WHERE data=date('now','localtime') GROUP BY codigo ORDER BY qtd DESC").all()));
};
