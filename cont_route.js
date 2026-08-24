/* Contagem de estoque — peca acabada E material.
 *
 * COMPRAS.md §8: "a contagem de componente usa O MESMO fluxo que ja existe — o
 * operador conta, o ajuste fica pendente, o admin aprova."
 *
 * POR QUE MATERIAL ENTROU AQUI E NAO NUM MODULO NOVO: a perda de corte so
 * aparece comparando o que a ficha diz que foi consumido com o que sobrou na
 * prateleira. Sem alguem contando o material, essa comparacao nunca comeca — e
 * ela precisa de meses de historia para valer alguma coisa. Cada dia sem contar
 * e um dia que nao volta.
 *
 * A DIFERENCA ENTRE OS DOIS TIPOS e so a forma de entrar:
 *   - PECA tem etiqueta: cada bipe e +1.
 *   - MATERIAL nao tem etiqueta e nem sempre e inteiro (3,5 m de tubo). Entra
 *     pela lista, com a quantidade digitada. Cada lancamento SOMA, igual ao
 *     bipe — contou duas prateleiras, lanca duas vezes.
 *
 * Daqui para frente e o mesmo caminho: mesma sessao, mesma tela, mesma fila de
 * aprovacao. Uma mecanica so no sistema inteiro.
 *
 * REGRA 10 (§13): componente.estoque NUNCA muda por UPDATE daqui. Todo ajuste
 * de material passa por componente_dominio.movimentar(), que deixa o registro em
 * movimento_componente. E por isso que a contagem de material da para auditar e
 * a de peca (ainda) nao.
 */
const COMPONENTE = require('./componente_dominio');

module.exports=function(app,db){
  db.exec("CREATE TABLE IF NOT EXISTS contagem (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, contado_em TEXT DEFAULT (datetime('now','localtime')), sessao TEXT, teste INTEGER DEFAULT 0)");
  // contagem_pendente (secao 10) e criada em acesso.js; garantimos aqui tambem,
  // para o modulo funcionar mesmo carregado isolado. IF NOT EXISTS = idempotente.
  db.exec("CREATE TABLE IF NOT EXISTS contagem_pendente (id INTEGER PRIMARY KEY AUTOINCREMENT, sessao TEXT, codigo TEXT, contado INTEGER, sistema_era INTEGER, operacao TEXT, contado_por TEXT, criado_em TEXT DEFAULT (datetime('now','localtime')), aprovado INTEGER DEFAULT 0, aprovado_por TEXT, aprovado_em TEXT)");

  /* Colunas novas, guardadas (CLAUDE.md §17). Ficam AQUI e nao em
     compras_schema.js: as duas tabelas sao deste modulo, e o compras_schema roda
     no boot do db.js, ANTES deste arquivo — num banco novo ele nao acharia a
     tabela e as colunas so nasceriam no segundo boot.

     `qtd` existe porque material nao e contado de um em um. Linha de peca vale
     1; linha de material vale a quantidade digitada. Todo lugar que somava com
     COUNT(*) agora soma com SUM(qtd) — para peca da exatamente o mesmo numero.

     ADD COLUMN ... DEFAULT preenche as linhas que ja existem com o padrao, entao
     a contagem em andamento no momento do deploy continua valendo. */
  const colunas = function(tabela, novas){
    const tem = db.prepare('PRAGMA table_info('+tabela+')').all().map(c=>c.name);
    for(const par of novas)
      if(tem.indexOf(par[0]) < 0) db.exec('ALTER TABLE '+tabela+' ADD COLUMN '+par[0]+' '+par[1]);
  };
  colunas('contagem',          [['tipo',"TEXT DEFAULT 'sku'"],['componente_id','INTEGER'],['qtd','REAL DEFAULT 1']]);
  colunas('contagem_pendente', [['tipo',"TEXT DEFAULT 'sku'"],['componente_id','INTEGER']]);
  /* contagem_pendente.contado foi declarado INTEGER, e material pode ser 3,5 m.
     Em SQLite isso e afinidade, nao restricao: um REAL so vira INTEGER se a
     conversao for exata. 3,5 continua 3,5. Nao ha coluna a trocar — mas ha um
     `|0` a nao escrever, e por isso este comentario existe. */

  // Quem tem contagem.ajustar aplica direto ao estoque; quem so tem
  // contagem.contar deixa o ajuste PENDENTE para o admin aprovar (secao 9).
  function podeAjustar(req){
    const u = req.usuario, ac = app.locals.acesso;
    try{ if(ac && ac.podePermissao) return ac.podePermissao(u, 'contagem.ajustar'); }catch(e){}
    return !!(u && (u.areas||[]).includes('admin'));   // fallback modelo antigo
  }
  function auditar(req, acao, alvo, detalhe){
    const ac = app.locals.acesso;
    try{ if(ac && ac.auditar) ac.auditar(req, 'estoque', acao, alvo, detalhe); }catch(e){}
  }

  /* Quantidade fracionada vira dizima na soma de ponto flutuante (2,5 + 0,2 =
     2,7000000000000002). Arredonda para 3 casas: nenhum material da fabrica se
     mede em decimo de milimetro. */
  const r3 = n => Math.round((+n||0)*1000)/1000;

  /* Aceita `itens:[{tipo,codigo,componente_id}]` e tambem o `codigos:[...]`
     antigo, que so existia para SKU. Uma aba deixada aberta antes do deploy
     continua funcionando em vez de dar erro. */
  function itensDoCorpo(body){
    const b = body||{}, out = [];
    (b.itens||[]).forEach(i=>{
      if(!i) return;
      if(i.tipo==='componente' && i.componente_id)
        out.push({tipo:'componente', componente_id:+i.componente_id, codigo:String(i.codigo||'')});
      else if(i.codigo) out.push({tipo:'sku', codigo:String(i.codigo).trim().toUpperCase(), componente_id:null});
    });
    (b.codigos||[]).forEach(c=>{
      if(c) out.push({tipo:'sku', codigo:String(c).trim().toUpperCase(), componente_id:null});
    });
    return out;
  }

  const somaSku  = db.prepare("SELECT SUM(COALESCE(qtd,1)) q FROM contagem WHERE sessao=? AND codigo=? AND COALESCE(tipo,'sku')='sku'");
  const somaComp = db.prepare("SELECT SUM(COALESCE(qtd,1)) q FROM contagem WHERE sessao=? AND componente_id=? AND tipo='componente'");
  function contadoNaSessao(sessao, it){
    const r = it.tipo==='componente' ? somaComp.get(sessao, it.componente_id) : somaSku.get(sessao, it.codigo);
    return r && r.q!=null ? r3(r.q) : 0;
  }
  function sistemaAgora(it){
    if(it.tipo==='componente') return r3(COMPONENTE.saldo(db, it.componente_id).estoque);
    const s = db.prepare('SELECT estoque FROM skus WHERE codigo=?').get(it.codigo);
    return s ? s.estoque : null;
  }
  const rotulo = it => it.tipo==='componente' ? (it.codigo || ('componente #'+it.componente_id)) : it.codigo;

  /* Aplica o resultado de uma contagem ao estoque. UNICO lugar do modulo que
     escreve estoque — tanto o caminho direto quanto a aprovacao do pendente
     passam por aqui, senao as duas regras divergiriam no primeiro ajuste. */
  function aplicar(it, operacao, quantidade, contexto){
    const q = r3(quantidade);
    if(it.tipo==='componente'){
      const atual = r3(COMPONENTE.saldo(db, it.componente_id).estoque);
      const delta = operacao==='lancar' ? q : r3(q - atual);
      // Substituir por um numero igual ao que ja esta la nao e movimento nenhum;
      // gravar linha de delta zero so sujaria o extrato do material.
      if(delta === 0) return 0;
      COMPONENTE.movimentar(db, {componente_id:it.componente_id, delta, motivo:'contagem',
        referencia:(contexto&&contexto.sessao)||null, usuario_nome:(contexto&&contexto.quem)||null});
      return delta;
    }
    if(operacao==='lancar') db.prepare('UPDATE skus SET estoque=MAX(0,estoque+?) WHERE codigo=?').run(q, it.codigo);
    else                    db.prepare('UPDATE skus SET estoque=? WHERE codigo=?').run(Math.max(0,q), it.codigo);
    return q;
  }

  // enfileira o ajuste para aprovacao posterior; captura a contagem e o estoque
  // do momento, e limpa a sessao (o dado agora vive em contagem_pendente).
  function enfileirar(req, sessao, itens, operacao){
    const ins  = db.prepare("INSERT INTO contagem_pendente (sessao,codigo,contado,sistema_era,operacao,contado_por,tipo,componente_id) VALUES (?,?,?,?,?,?,?,?)");
    const quem = (req.usuario && req.usuario.nome) || '';
    let n = 0;
    db.transaction(()=>{
      itens.forEach(it=>{
        ins.run(sessao, rotulo(it), contadoNaSessao(sessao,it), sistemaAgora(it),
                operacao, quem, it.tipo, it.componente_id||null);
        n++;
      });
      db.prepare('DELETE FROM contagem WHERE sessao=?').run(sessao);
    })();
    return n;
  }

  app.post('/api/contagem/bipe',(req,res)=>{
    const cod=((req.body&&req.body.codigo)||'').trim().toUpperCase();
    const ses=((req.body&&req.body.sessao)||'').trim();
    if(!cod) return res.status(400).json({erro:'sem codigo'});
    const existe=db.prepare('SELECT codigo,descricao,cor,estoque FROM skus WHERE codigo=?').get(cod);
    /* Bipar um codigo de MATERIAL nao conta 1 unidade: a unidade de consumo do
       tubo e o metro, e "+1" ali seria 1 metro, nao 1 barra. Em vez de contar
       errado em silencio, a tela manda a pessoa para o campo certo. */
    if(!existe){
      const c=db.prepare('SELECT id,nome,unidade FROM componente WHERE UPPER(codigo)=? AND ativo=1').get(cod);
      if(c) return res.json({ok:false, codigo:cod, cadastrado:false, ehComponente:true,
        componente_id:c.id, nome:c.nome, unidade:c.unidade||'un'});
    }
    db.prepare("INSERT INTO contagem (codigo,sessao,tipo,qtd) VALUES (?,?,'sku',1)").run(cod,ses);
    const n=contadoNaSessao(ses,{tipo:'sku',codigo:cod});
    res.json({ok:true,codigo:cod,cadastrado:!!existe,contado:n,estoque:existe?existe.estoque:null,cor:existe?existe.cor:''});
  });

  /* Lista de materiais para a tela de contagem. Nome, unidade e saldo — NUNCA
     preco: quem opera nao ve preco em lugar nenhum (regra 14 do §13). */
  app.get('/api/contagem/componentes',(req,res)=>{
    res.json(db.prepare(`SELECT id,codigo,nome,COALESCE(unidade,'un') unidade,COALESCE(estoque,0) estoque
      FROM componente WHERE ativo=1 ORDER BY nome`).all());
  });

  /* Lancamento de material. SOMA a quantidade, igual ao bipe soma 1 — contou
     duas prateleiras, lanca duas vezes. Zero e um lancamento valido: e assim que
     um material que ACABOU entra na contagem em vez de ficar de fora dela. */
  app.post('/api/contagem/componente',(req,res)=>{
    const b=req.body||{};
    const id=+b.componente_id, ses=String(b.sessao||'').trim();
    const q=b.quantidade===''||b.quantidade==null ? NaN : +b.quantidade;
    if(!id) return res.status(400).json({erro:'sem componente'});
    if(!Number.isFinite(q) || q<0) return res.status(400).json({erro:'quantidade inválida'});
    const c=db.prepare("SELECT id,nome,COALESCE(unidade,'un') unidade,COALESCE(estoque,0) estoque FROM componente WHERE id=? AND ativo=1").get(id);
    if(!c) return res.status(400).json({erro:'componente não encontrado'});
    db.prepare("INSERT INTO contagem (codigo,sessao,tipo,componente_id,qtd) VALUES (?,?,'componente',?,?)")
      .run(c.nome, ses, c.id, r3(q));
    res.json({ok:true, componente_id:c.id, nome:c.nome, unidade:c.unidade,
      contado:contadoNaSessao(ses,{tipo:'componente',componente_id:c.id}), estoque:r3(c.estoque)});
  });

  // ── contagem pendente (registra ANTES do /:sessao para nao cair no param) ──
  app.get('/api/contagem/pendentes',(req,res)=>{
    const linhas=db.prepare(`SELECT p.id,p.sessao,p.codigo,p.contado,p.sistema_era,p.operacao,
        p.contado_por,p.criado_em, COALESCE(p.tipo,'sku') tipo, p.componente_id,
        CASE WHEN COALESCE(p.tipo,'sku')='componente' THEN c.estoque ELSE s.estoque END AS estoque_atual,
        CASE WHEN COALESCE(p.tipo,'sku')='componente' THEN COALESCE(c.unidade,'un') ELSE s.cor END AS cor
      FROM contagem_pendente p
      LEFT JOIN skus s ON COALESCE(p.tipo,'sku')='sku' AND s.codigo=p.codigo
      LEFT JOIN componente c ON p.tipo='componente' AND c.id=p.componente_id
      WHERE p.aprovado=0 ORDER BY p.criado_em, p.codigo`).all();
    res.json({linhas, total:linhas.length});
  });

  app.post('/api/contagem/pendentes/aprovar',(req,res)=>{
    const ids=(req.body&&req.body.ids)||[];
    if(!ids.length) return res.status(400).json({erro:'sem ids'});
    const quem=(req.usuario&&req.usuario.nome)||'';
    let n=0;
    db.transaction(()=>{
      const get=db.prepare("SELECT *, COALESCE(tipo,'sku') tipo FROM contagem_pendente WHERE id=? AND aprovado=0");
      const mark=db.prepare("UPDATE contagem_pendente SET aprovado=1,aprovado_por=?,aprovado_em=datetime('now','localtime') WHERE id=?");
      ids.forEach(id=>{
        const p=get.get(id); if(!p) return;
        const it={tipo:p.tipo, codigo:p.codigo, componente_id:p.componente_id};
        aplicar(it, p.operacao, p.contado, {sessao:p.sessao, quem});
        mark.run(quem,id); n++;
        auditar(req,'contagem_aprovada',rotulo(it),p.operacao+' contado='+p.contado+' (contou: '+p.contado_por+')');
      });
    })();
    res.json({ok:true,aprovados:n});
  });

  app.post('/api/contagem/pendentes/rejeitar',(req,res)=>{
    const ids=(req.body&&req.body.ids)||[];
    if(!ids.length) return res.status(400).json({erro:'sem ids'});
    let n=0;
    db.transaction(()=>{
      const get=db.prepare('SELECT codigo,operacao,contado,contado_por FROM contagem_pendente WHERE id=? AND aprovado=0');
      const del=db.prepare('DELETE FROM contagem_pendente WHERE id=? AND aprovado=0');
      ids.forEach(id=>{
        const p=get.get(id); if(!p) return;
        del.run(id); n++;
        auditar(req,'contagem_rejeitada',p.codigo,p.operacao+' contado='+p.contado+' (contou: '+p.contado_por+')');
      });
    })();
    res.json({ok:true,rejeitados:n});
  });

  app.get('/api/contagem/:sessao',(req,res)=>{
    const ses=req.params.sessao;
    const tot=db.prepare(`SELECT COALESCE(tipo,'sku') tipo, codigo, componente_id, SUM(COALESCE(qtd,1)) qtd
      FROM contagem WHERE sessao=? GROUP BY COALESCE(tipo,'sku'), codigo, componente_id`).all(ses);
    const linhas=[], desconhecidos=[], vistoSku={}, vistoComp={};
    let contouMaterial=false;
    tot.forEach(t=>{
      const q=r3(t.qtd);
      if(t.tipo==='componente'){
        contouMaterial=true;
        const c=db.prepare("SELECT id,nome,COALESCE(unidade,'un') unidade,COALESCE(estoque,0) estoque FROM componente WHERE id=?").get(t.componente_id);
        // Componente apagado no meio de uma contagem: aparece como desconhecido
        // em vez de sumir da tela sem explicacao.
        if(!c){ desconhecidos.push({tipo:'componente',codigo:t.codigo||('#'+t.componente_id),qtd:q}); return; }
        vistoComp[c.id]=1;
        linhas.push({tipo:'componente',componente_id:c.id,codigo:c.nome,unidade:c.unidade,
          sistema:r3(c.estoque),contado:q,dif:r3(q-c.estoque)});
      }else{
        const s=db.prepare('SELECT codigo,cor,estoque FROM skus WHERE codigo=?').get(t.codigo);
        if(!s){ desconhecidos.push({tipo:'sku',codigo:t.codigo,qtd:q}); return; }
        vistoSku[s.codigo]=1;
        linhas.push({tipo:'sku',codigo:s.codigo,cor:s.cor,sistema:s.estoque,contado:q,dif:r3(q-s.estoque)});
      }
    });
    linhas.sort((a,b)=> a.tipo===b.tipo ? String(a.codigo).localeCompare(String(b.codigo)) : (a.tipo==='sku'?-1:1));

    const naoContados=db.prepare('SELECT codigo,estoque FROM skus WHERE estoque>0 ORDER BY codigo').all()
      .filter(s=>!vistoSku[s.codigo]).map(s=>({tipo:'sku',codigo:s.codigo,sistema:s.estoque}));
    /* Material so entra em "ainda nao contados" quando a contagem JA tem
       material. Uma contagem de pecas nao deve cobrar as 22 linhas de materia
       prima — o aviso viraria ruido e o operador pararia de ler. */
    if(contouMaterial)
      db.prepare("SELECT id,nome,COALESCE(unidade,'un') unidade,COALESCE(estoque,0) estoque FROM componente WHERE ativo=1 AND estoque>0 ORDER BY nome").all()
        .filter(c=>!vistoComp[c.id])
        .forEach(c=>naoContados.push({tipo:'componente',codigo:c.nome,sistema:r3(c.estoque),unidade:c.unidade}));
    res.json({linhas,desconhecidos,naoContados});
  });

  // ajustar = SUBSTITUI (estoque := contado). Direto p/ quem tem contagem.ajustar;
  // senao vira pendente.
  app.post('/api/contagem/ajustar',(req,res)=>{
    const ses=((req.body&&req.body.sessao)||'').trim();
    const itens=itensDoCorpo(req.body);
    if(!ses||!itens.length) return res.status(400).json({erro:'faltam dados'});
    if(!podeAjustar(req)){
      const pend=enfileirar(req,ses,itens,'ajustar');
      return res.json({ok:true,pendente:pend});
    }
    const quem=(req.usuario&&req.usuario.nome)||'';
    let n=0;
    db.transaction(()=>{
      itens.forEach(it=>{
        const q=contadoNaSessao(ses,it);
        aplicar(it,'ajustar',q,{sessao:ses,quem}); n++;
        auditar(req,'contagem_ajuste',rotulo(it),'substitui -> '+q);
      });
    })();
    res.json({ok:true,ajustados:n});
  });

  // lancar = SOMA (estoque += contado). Direto p/ quem tem contagem.ajustar;
  // senao vira pendente.
  app.post('/api/contagem/lancar',(req,res)=>{
    const ses=((req.body&&req.body.sessao)||'').trim();
    const itens=itensDoCorpo(req.body);
    if(!ses||!itens.length) return res.status(400).json({erro:'faltam dados'});
    if(!podeAjustar(req)){
      const pend=enfileirar(req,ses,itens,'lancar');
      return res.json({ok:true,pendente:pend});
    }
    const quem=(req.usuario&&req.usuario.nome)||'';
    let n=0;
    db.transaction(()=>{
      itens.forEach(it=>{
        const q=contadoNaSessao(ses,it);
        aplicar(it,'lancar',q,{sessao:ses,quem}); n++;
        auditar(req,'contagem_lancamento',rotulo(it),'soma +'+q);
      });
      db.prepare('DELETE FROM contagem WHERE sessao=?').run(ses);
    })();
    res.json({ok:true,lancados:n});
  });

  app.delete('/api/contagem/:sessao',(req,res)=>{
    const n=db.prepare('DELETE FROM contagem WHERE sessao=?').run(req.params.sessao).changes;
    res.json({ok:true,apagados:n});
  });
};
