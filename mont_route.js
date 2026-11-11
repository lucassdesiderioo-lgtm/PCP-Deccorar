/* "O que foi bipado é o kit?" tem UMA régua, e ela mora no `public/kit_bipe.js`
   desde 17/09/2026 — a tela e o servidor leem o mesmo arquivo. Duas cópias
   seriam a tela aceitando um bipe que o servidor recusa (ou o contrário) no dia
   em que uma das duas mudasse. Mesmo arranjo do `public/barras.js` e do
   `public/kit_etiqueta.js`. */
const KIT_BIPE = require('./public/kit_bipe.js');
const ESTOQUE  = require('./estoque_dominio');
const QUEM     = require('./quem');
module.exports=function(app,db){
  /* SEM LOGIN NADA GRAVA (QUEM-FEZ-E-REVISAO fase 7, 05/11/2026): toda escrita
     registrada neste modulo passa pelo quem.js antes do handler — a de amanha
     tambem. */
  app = QUEM.portao(app);

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
  db.exec("CREATE TABLE IF NOT EXISTS montagem (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, inicio TEXT, fim TEXT, segundos INTEGER, kit_ok INTEGER DEFAULT 1, data TEXT DEFAULT (date('now','localtime')), criado_em TEXT DEFAULT (datetime('now','localtime')), teste INTEGER DEFAULT 0, usuario_id INTEGER, usuario_nome TEXT, modo TEXT);");
  /* QUEM EMBALOU (fase 4 da ACESSOS-UNIFICADOS, divida 9, 26/10/2026): o id e
     o nome de quem fechou a embalagem — o nome como retrato. O ALTER guardado
     e para o banco de producao, onde a tabela ja existe sem as colunas; elas
     entram no FIM, onde o SQLite as poe (§17). */
  for(const c of ['usuario_id INTEGER','usuario_nome TEXT','modo TEXT'])
    try{ db.exec('ALTER TABLE montagem ADD COLUMN '+c); }catch(e){}
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
  //
  // ⚠️ O CODIGO DO KIT NAO PODE SER UM SKU DE PERSIANA, E A GUARDA E DAQUI.
  // O `REGRAS-DE-NEGOCIO.md` §4 sempre disse que o campo recusa um SKU — mas a
  // recusa existia so em `index.html`. Apontar o leitor para a etiqueta de uma
  // persiana e salvar fazia `kit_codigo` virar BK160160BEGE, e a partir dali
  // aquele SKU ficava INEMBALAVEL PARA SEMPRE: o `if(KIT && kitBate(code,KIT))`
  // da tela roda ANTES da busca de SKU, entao todo bipe dele passava a
  // responder "Bipe o SKU primeiro". Ninguem associaria isso a uma edicao feita
  // no Admin dias antes. (Auditoria §2.4, fechada em 17/09/2026.)
  app.post('/api/config/kit',(req,res)=>{
    const v=((req.body&&req.body.kit)||'').trim();
    if(v && db.prepare('SELECT 1 FROM skus WHERE codigo=?').get(v.toUpperCase()))
      return res.status(400).json({erro:'"'+v+'" é um SKU de persiana cadastrado. '+
        'Usar um SKU como código do kit deixa aquela persiana inembalável — na Embalagem, '+
        'o bipe dela passaria a ser lido como o kit. Bipe o QR do kit de instalação.'});
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
    /* CAMPO AUSENTE NAO E CAMPO VAZIO. Era a divida 15 do §14 (o POST
       /api/skus que zerava o estoque quando o corpo nao trazia `estoque`,
       corrigido em 17/09/2026): um POST so com o link nao pode apagar o texto
       da etiqueta. So mexe no que veio. */
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
  /* ── A EMBALAGEM: A PORTA DE ENTRADA DO ESTOQUE ──────────────────────────
     É aqui que a peça vira `+1`, e até 17/09/2026 esta era a rota menos
     protegida do sistema (dívida 14 do §14). Quatro coisas mudaram, e nenhuma
     delas é regra nova — as regras já estavam escritas no §4; o que faltava era
     elas existirem fora do navegador:

     1. AS QUATRO ESCRITAS SÃO UMA TRANSAÇÃO (montagem, fila, skus, producao).
        Com better-sqlite3 cada statement auto-commita sozinho, então falha no
        meio deixava estado impossível: peça fora da fila e fora do estoque (a
        persiana na prateleira e em lugar nenhum do sistema), ou `+1` com a
        ordem do dia ainda pedindo a peça — e aí o operador produz de novo.
     2. O SKU TEM QUE EXISTIR. Era a única rota do fluxo que gravava sem
        conferir o cadastro: o `UPDATE` pegava 0 linhas em silêncio e a resposta
        era `{ok:true, estoque:0}`. A peça sumia.
     3. O BLOQUEIO DO KIT VIROU TRAVA DE SERVIDOR. `kit_ok` vinha do corpo com
        default 1 e ninguém conferia: o "⚠ FALTOU O KIT" era um `if` do
        navegador, e kit esquecido é motivo de devolução recorrente (§4).
        ⚠️ O CÓDIGO DO KIT É CONFERIDO QUANDO VEM, E NÃO EXIGIDO — decisão do
        dono em 17/09/2026. Exigir travaria o tablet que estivesse com a página
        em cache, e trava que dispara no caso normal vira desvio (armadilha #6).
        Exigir é o passo seguinte, depois do refresh nos tablets.
     4. MODO TESTE NÃO COME A FILA REAL (dívida 1c). A fila é filtrada pelo
        mesmo `teste` do momento: em teste consome linha de teste, fora dele
        consome linha real. Antes, embalar em teste prendia a peça REAL em
        'embalado', e ela sumia quando os testes fossem apagados.

     ⚠️ O QUE **NÃO** MUDOU, E NÃO PODE MUDAR: embalar SEM a peça estar na fila
     continua somando `+1`, com `modo='estoque'`. A fila não é obrigatória para
     embalar (§4) — é isso que torna o `limpar_fila.js` seguro, e quem
     "consertar" isso trava a bancada. Há caso travando. */
  app.post('/api/montagem',(req,res)=>{
    /* QUEM EMBALOU vem do `quem.js` (QUEM-FEZ-E-REVISAO fase 2, 04/11/2026),
       o mesmo dono da revisao, e sem login NADA grava: antes, sem
       `req.usuario`, a embalagem e o +1 do livro entravam com a pessoa vazia.
       O 401 vem antes de olhar SKU e kit: quem nao esta logado nao descobre
       o que existe no cadastro. */
    const q=QUEM.exigir(req,res); if(!q) return;
    const {codigo,segundos=0,kit_ok=1,inicio=null,fim=null}=req.body||{};
    if(!codigo) return res.status(400).json({erro:'codigo'});
    const cod=codigo.trim().toUpperCase();
    if(!db.prepare('SELECT 1 FROM skus WHERE codigo=?').get(cod))
      return res.status(404).json({erro:'SKU não cadastrado: '+cod+'. Cadastre no Admin antes de embalar.'});
    /* A frase é a MESMA da bancada de propósito: quem chamar a rota por fora
       recebe o que o operador leria na tela. */
    if(!kit_ok) return res.status(400).json({erro:'⚠ FALTOU O KIT — bipe o kit antes de finalizar '+cod+'.'});
    const kitCad=cfg('kit_codigo');
    const kitLido=(req.body&&req.body.kit_codigo)||'';
    if(kitLido && kitCad && !KIT_BIPE.kitBate(kitLido,kitCad))
      return res.status(400).json({erro:'⚠ O código bipado não é o kit cadastrado. Confira o kit da caixa.'});

    // Fila do MOMENTO: em modo teste só linha de teste, fora dele só linha real.
    const emTeste = cfg('modo_teste')==='1' ? 1 : 0;
    let naFila=false, modo='estoque', abatido=false;
    try{
      db.transaction(()=>{
        const mid=db.prepare("INSERT INTO montagem (codigo,inicio,fim,segundos,kit_ok,usuario_id,usuario_nome) VALUES (?,?,?,?,1,?,?)")
          .run(cod,inicio,fim,Math.round(+segundos||0),q.usuario_id,q.usuario_nome).lastInsertRowid;
        const f=db.prepare("SELECT id,modo FROM fila WHERE codigo=? AND situacao='aguardando' AND COALESCE(teste,0)=? ORDER BY id LIMIT 1").get(cod,emTeste);
        if(f){ db.prepare("UPDATE fila SET situacao='embalado', embalado_em=datetime('now','localtime') WHERE id=?").run(f.id); naFila=true; modo=f.modo; }
        /* O modo da fila fica na linha da embalagem (FICHAS-NO-CADASTRO-UNICO):
           o "consumido por operacao" nao conta a devolucao reembalada. */
        db.prepare('UPDATE montagem SET modo=? WHERE id=?').run(naFila?modo:'estoque',mid);
        /* A PORTA DE ENTRADA DO ESTOQUE, e ela passa pelo dono unico desde a
           fase 1 do livro (21/09/2026). A referencia e a linha de `montagem`:
           daqui a um mes, o extrato do SKU responde QUAL embalagem somou esta
           peca, com a hora e o tempo de bancada ao lado. */
        /* ⚠️ SOB MEDIDA NAO SOMA (R-EST-05, CONSERTO de 04/11/2026). A peca e
           feita contra o pedido e a Conferencia nao a baixa (§7): o +1 aqui
           deixava o saldo do SOBMEDIDA 1 acima a cada embalagem, para sempre.
           Achado pelo teste_regras_estoque.js. A embalagem continua registrada
           (montagem, fila, ordem do dia) — so o saldo nao anda. Banco sem a
           tabela `modelo` (teste antigo) le como medida padrao, como antes. */
        let sobMedida=false;
        try{ const m=db.prepare('SELECT COALESCE(m.sob_medida,0) s FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id WHERE s.codigo=?').get(cod);
             sobMedida=!!(m&&m.s); }catch(e){ sobMedida=false; }
        if(!sobMedida) ESTOQUE.movimentar(db,{codigo:cod, delta:+1, tipo:'embalagem',
          referencia:'montagem:'+mid, usuario_id:q.usuario_id, usuario_nome:q.usuario_nome});
        /* ⚠️ O MATERIAL SAI AQUI, PELA FICHA (FICHAS-NO-CADASTRO-UNICO fase 4,
           decisao do dono de 11/11/2026). So o material marcado "pela ficha"
           (por quantidade, com contagem na 504) baixa; o resto continua saindo
           pela contagem. A DEVOLUCAO REEMBALADA NAO BAIXA: a peca ja existia.
           ⚠️ A BAIXA QUE FALHA NAO TRAVA A EMBALAGEM (#6): ela roda num ponto
           de salvamento proprio; se estourar, desfaz so ela, a peca embala, e
           a falha vira "material extra a decidir" para o Supervisor. */
        if(!sobMedida && modo!=='devolucao'){
          const BM=require('./baixa_material_dominio');
          let ficha={itens:[]};
          try{
            ficha=BM.daFichaPadrao(db,cod);
            db.transaction(()=>BM.baixar(db,{itens:ficha.itens, operacao:'padrao', motivo:'ficha',
              referencia:'montagem:'+mid, usuario_id:q.usuario_id, usuario_nome:q.usuario_nome, teste:emTeste}))();
            /* O material PELA FICHA cuja quantidade nao saiu (a formula que nao
               avalia neste SKU, o SKU sem medida) nao some calado (③ REVISAO):
               vira "material extra a decidir", com o motivo. */
            const semQ=(ficha.semQuantidade||[]).filter(x=>{ const c=db.prepare('SELECT como_sai FROM componente WHERE id=?').get(x.componente_id); return c&&c.como_sai==='ficha'; });
            if(semQ.length) require('./material_extra_dominio').registrar(db,{origem:'falha_baixa', operacao:'padrao',
              referencia:'montagem:'+mid, descricao:cod,
              motivo:'a ficha não deu a quantidade de: '+semQ.map(x=>{ const c=db.prepare('SELECT nome FROM componente WHERE id=?').get(x.componente_id); return (c?c.nome:'#'+x.componente_id)+' ('+x.motivo+')'; }).join(' · '),
              /* ⚠️ A SUGESTAO E SO O QUE FALTOU, SEM QUANTIDADE (③ rodada 2): o
                 resto da ficha ja baixou, e sugeri-lo faria o "baixar" sem mexer
                 tirar o tubo duas vezes. */
              sugestao:semQ.map(x=>{ const c=db.prepare('SELECT nome,unidade FROM componente WHERE id=?').get(x.componente_id)||{}; return {componente_id:x.componente_id, nome:c.nome, unidade:c.unidade, quantidade:null}; }),
              registrado_por:q.usuario_nome, registrado_por_id:null});
          }catch(e){
            console.error('[montagem] a baixa de material de '+cod+' falhou (a embalagem seguiu):', e.message);
            /* O registro da falha tambem nao trava: sem a tabela (banco velho,
               teste antigo), a falha fica so no log, e a peca embala. */
            try{ require('./material_extra_dominio').registrar(db,{origem:'falha_baixa', operacao:'padrao',
              referencia:'montagem:'+mid, descricao:cod, motivo:'a baixa pela ficha falhou: '+e.message,
              sugestao:ficha.itens, registrado_por:q.usuario_nome, registrado_por_id:null}); }
            catch(e2){ console.error('[montagem] e o material extra da falha tambem nao gravou:', e2.message); }
          }
        }
        if(modo==='hoje'){
          const r=db.prepare("SELECT id FROM producao WHERE codigo=? AND data=date('now','localtime') AND produzido<qtd ORDER BY id LIMIT 1").get(cod);
          if(r){ db.prepare('UPDATE producao SET produzido=produzido+1 WHERE id=?').run(r.id); abatido=true; }
        }
      })();
    }catch(e){
      console.error('[montagem] POST /api/montagem falhou em '+cod+':', e);
      return res.status(500).json({erro:'Não deu pra registrar a embalagem de '+cod+': '+e.message+
        ' — NADA foi gravado e a peça continua na fila. Tente de novo; se repetir, chame o suporte.'});
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
