/* Ficha tecnica por formula — COMPRAS.md §3.
 *
 * Voce lanca os componentes UMA VEZ, no modelo. Todo SKU daquele modelo passa a
 * ter ficha, agora e para sempre — inclusive os que ainda nao existem.
 *
 * A resolucao do tecido tem uma diferenca importante em relacao ao documento, e
 * ela esta explicada em `resolverTecido()` mais abaixo: com CORTE INVERTIDO a
 * quantidade depende da largura da bobina, entao a escolha e por CUSTO TOTAL da
 * peca, nao por menor preco por metro linear.
 */
const F = require('./formula');
const FICHA = require('./ficha_dominio');
const CUSTO = require('./custo_dominio');
const ETAPAS = require('./etapas');

const QUEM = require('./quem');
module.exports = function(app, db){
  /* SEM LOGIN NADA GRAVA (QUEM-FEZ-E-REVISAO fase 7, 05/11/2026): toda escrita
     registrada neste modulo passa pelo quem.js antes do handler — a de amanha
     tambem. */
  app = QUEM.portao(app, { auditar:'compras' });   // a linha nao tem autor: quem fez vai na auditoria


  const txt = v => { const t=String(v==null?'':v).trim(); return t===''?null:t; };

  /* O HISTÓRICO DE CUSTO NÃO DESFAZ O SALVAR (CONSERTO de 11/11/2026). A linha
     da ficha já está gravada quando o histórico roda; se ele estourar, responder
     erro faz a 404 dizer "não salvou" sobre o que salvou (foi o que aconteceu de
     07 a 11/11, com o histórico recusando o custo indefinido). O mesmo cuidado
     que a troca de preço já tinha (compras_route): o erro vai para o log. */
  function historico(modelo, motivo, req){
    try{ CUSTO.porModelo(db, modelo, motivo, {usuario_nome:QUEM.nomeDe(req), usuario_id:QUEM.idDe(req)}); }
    catch(e){
      /* E NA AUDITORIA (③ REVISÃO): só o log faria o histórico parar de novo
         sem sinal nenhum — o defeito de 07/11 só apareceu porque a 404 dava 500. */
      console.log('[ficha] histórico de custo do modelo '+modelo+' falhou ('+motivo+'): '+e.message);
      QUEM.auditar(app, req, 'compras', 'historico_custo_falhou', 'modelo '+modelo, motivo+': '+e.message);
    }
  }

  /* ── AS MEDIDAS DE TESTE VEM DO CATALOGO, NAO DE UMA LISTA FIXA ───────────
     O `formula.js` trazia 1,00×1,00 / 1,80×1,50 / 3,00×2,50 escritas no codigo.
     A ultima nao existe: a persiana mais larga do catalogo tem 1,80 e a bobina
     mais estreita tem 2,80 — 3,00 nao cabe em bobina nenhuma, e no sob medida
     nao ha emenda. Uma formula de tecido honesta reprovava ali, e para conseguir
     salvar alguem escrevia a formula errada. Trava que dispara no caso normal
     vira desvio (§7, armadilha #6).

     Sao tres, e cada uma responde a uma pergunta:
       a mais ESTREITA   e onde mais peca cabe lado a lado na bobina
       a mais COMUM      e o dia a dia da fabrica
       a mais LARGA      e onde o encaixe aperta e a conta muda

     Lista fixa envelhece calada; o catalogo se atualiza sozinho. */
  function medidasDoModelo(modelo_id){
    const linhas = db.prepare(`SELECT largura_cm l, altura_cm a, COUNT(*) n
      FROM skus WHERE modelo_id=? AND largura_cm IS NOT NULL AND altura_cm IS NOT NULL
      GROUP BY largura_cm, altura_cm`).all(modelo_id);
    if(!linhas.length) return { medidas:F.MEDIDAS_TESTE, origem:'padrão' };
    const porLargura = linhas.slice().sort((x,y)=>x.l-y.l);
    const porUso     = linhas.slice().sort((x,y)=>y.n-x.n || x.l-y.l);
    const vistas = {}, medidas = [];
    [porLargura[0], porUso[0], porLargura[porLargura.length-1]].forEach(m=>{
      const k = m.l+'x'+m.a;
      if(!vistas[k]){ vistas[k]=1; medidas.push({ largura:m.l, altura:m.a }); }
    });
    return { medidas, origem:'catálogo' };
  }

  /* Todas as bobinas cadastradas da familia. A comparacao lado a lado e o que
     mostra uma formula que IGNORA a bobina: se os dois numeros saem iguais, o
     `largura_bobina` nao esta na conta, e a escolha da bobina no ficha_dominio
     — que existe justamente para o corte invertido — vira preco por metro
     linear, que e o criterio errado (§7-B). */
  const bobinasDa = familia => db.prepare(`SELECT DISTINCT largura_bobina_cm cm
    FROM componente WHERE familia=? AND ativo=1 AND largura_bobina_cm IS NOT NULL
    ORDER BY largura_bobina_cm`).all(familia).map(r=>r.cm);

  const maisEstreita = familia => { const b=bobinasDa(familia); return b.length?b[0]:null; };

  /* ── FORMULAS DE UM MODELO ───────────────────────────────────────────────── */
  app.get('/api/formulas',(req,res)=>{
    const w=[], p=[];
    if(req.query.modelo_id){ w.push('f.modelo_id=?'); p.push(req.query.modelo_id); }
    res.json(db.prepare(`SELECT f.*, c.nome componente_nome, c.unidade
      FROM ficha_formula f LEFT JOIN componente c ON c.id=f.componente_id
      ${w.length?'WHERE '+w.join(' AND '):''}
      ORDER BY f.modelo_id, f.ordem, f.id`).all(...p));
  });

  /* Testa sem salvar. E o que alimenta a caixa de teste da tela: fórmula errada
     em cadastro vira compra errada em producao, entao ela nao salva sem mostrar
     o resultado em tres medidas (§3).

     Devolve tres coisas alem do ok/erro:
       `medidas`  quais foram usadas e de onde vieram — media sem a regua ao lado
                  e numero que engana (§19, armadilha #16)
       `bobinas`  o resultado em CADA bobina da familia, lado a lado
       `corte`    a validacao das medidas de corte, separada do consumo */
  app.post('/api/formulas/testar',(req,res)=>{
    const b=req.body||{};
    const familia = txt(b.familia);
    const bob = b.largura_bobina!=null && b.largura_bobina!=='' ? +b.largura_bobina
              : (familia ? maisEstreita(familia) : null);

    /* A barra de medida da tela manda a medida escolhida; sem ela, o catalogo. */
    let medidas=null, origem='pedidas';
    if(Array.isArray(b.medidas) && b.medidas.length)
      medidas = b.medidas.filter(m=>m && m.largura>0 && m.altura>0)
        .map(m=>({largura:+m.largura, altura:+m.altura}));
    if(!medidas || !medidas.length){
      const d = b.modelo_id ? medidasDoModelo(+b.modelo_id) : { medidas:F.MEDIDAS_TESTE, origem:'padrão' };
      medidas = d.medidas; origem = d.origem;
    }

    const expr = txt(b.expressao)||'';
    const r = F.validar(expr, { largura_bobina:bob, medidas });

    /* LADO A LADO POR BOBINA. Duas colunas iguais sao a assinatura da formula
       que nao usa `largura_bobina` — o `(altura+20)/200`, que fixa DUAS pecas
       por bobina qualquer que ela seja. */
    let bobinas = null;
    if(familia) bobinas = bobinasDa(familia).map(cm=>{
      const v = F.validar(expr, { largura_bobina:cm, medidas });
      return { cm, ok:v.ok, erro:v.erro, testes:v.testes, ignoradas:v.ignoradas };
    });

    /* A MEDIDA DE CORTE E OUTRO NUMERO, e por isso e validada a parte: ela sai
       em CENTIMETROS, entao a dica do resultado absurdo nao pode ser "falta
       dividir por 100" — aqui dividir por 100 e que seria o erro. */
    let corte = null;
    const cl = txt(b.corte_largura), ca = txt(b.corte_altura);
    if(cl || ca){
      const op = { largura_bobina:bob, medidas, dica:'A medida de corte sai em centímetros.' };
      corte = {};
      if(cl) corte.largura = F.validar(cl, op);
      if(ca) corte.altura  = F.validar(ca, op);
    }

    res.json(Object.assign({ variaveis:F.VARIAVEIS, funcoes:F.FUNCOES,
      medidas, medidas_origem:origem, bobina:bob, bobinas, corte }, r));
  });

  app.post('/api/formulas',(req,res)=>{
    const b=req.body||{};
    const modelo=+b.modelo_id;
    if(!modelo || !db.prepare('SELECT 1 FROM modelo WHERE id=?').get(modelo))
      return res.status(400).json({erro:'modelo inválido'});
    const comp=b.componente_id?+b.componente_id:null;
    const familia=txt(b.familia);
    if(!!comp === !!familia)
      return res.status(400).json({erro:'a linha aponta um componente OU uma família de tecido, não os dois'});
    if(comp && !db.prepare('SELECT 1 FROM componente WHERE id=?').get(comp))
      return res.status(400).json({erro:'componente inválido'});
    /* R-CMP-02 (COMPRAS-E-RECEBIMENTO fase 1): a ficha so aceita material com
       `vai_ficha = 1`. Cafe e estilete sao material, mas nao sao da ficha. */
    if(comp){ const v=require('./material_dominio').podeIrParaFicha(db, comp);
      if(!v.ok) return res.status(400).json({erro:v.erro}); }
    const expr=txt(b.expressao);
    if(!expr) return res.status(400).json({erro:'fórmula obrigatória'});

    /* Linha de tecido usa `largura_bobina`, entao o teste precisa de uma bobina
       de verdade para rodar. Pega a mais estreita cadastrada naquela familia — se
       a formula funciona na mais apertada, funciona nas outras. */
    let bob=null;
    if(familia){
      bob = maisEstreita(familia);
      if(!bob) return res.status(400).json({erro:'não há componente cadastrado na família "'+familia+'" com largura de bobina'});
    }
    const med = medidasDoModelo(modelo);
    const v=F.validar(expr,{largura_bobina:bob, medidas:med.medidas});
    if(!v.ok) return res.status(400).json({erro:v.erro, testes:v.testes, ignoradas:v.ignoradas});

    /* As medidas de corte passam pelo MESMO avaliador — nunca `eval()`, pela
       mesma razao de sempre: string do banco executada como JavaScript e acesso
       ao .session_secret e aos PINs. Fórmula de corte errada nao vira compra
       errada, vira PECA errada, que e pior: a compra se devolve. */
    const corteOp = { largura_bobina:bob, medidas:med.medidas,
                      dica:'A medida de corte sai em centímetros.' };
    const cl = txt(b.corte_largura), ca = txt(b.corte_altura);
    for(const par of [['corte_largura',cl],['corte_altura',ca]]){
      if(!par[1]) continue;
      const c = F.validar(par[1], corteOp);
      if(!c.ok) return res.status(400).json({erro:'medida de corte ('+
        (par[0]==='corte_largura'?'largura':'altura')+'): '+c.erro, testes:c.testes});
    }

    /* "VAI PARA O PLANEJAMENTO DA PRODUCAO" (PLANEJAMENTO-CORTE-E-SEPARACAO,
       10/11/2026). Campo AUSENTE preserva o gravado (a regra da #25): a tela
       de um tablet sem refresh manda a linha sem ele, e apagaria a marca de
       quem marcou. Valor que nao e sim/nao e recusado, nunca vira "nao". So a
       aba Corte e separacao le; nao muda custo. */
    let plan;
    if(b.planejamento !== undefined && b.planejamento !== null){
      const p = b.planejamento;
      if(p === true || p === 1 || p === '1') plan = 1;
      else if(p === false || p === 0 || p === '0') plan = 0;
      else return res.status(400).json({erro:'"vai para o planejamento da produção" tem que ser sim ou não'});
    }

    /* A ETAPA DA LINHA (PRODUCAO-MAPA-E-MOTOR fase 1, 12/11/2026). TODA linha
       tem uma etapa de preparo (o dono, 12/11/2026): a linha nova sem ela e
       recusada, o vazio de proposito tambem, e a etapa fora da lista tambem —
       e nada do envio grava. Ausente numa linha que ja tem etapa preserva (o
       tablet sem refresh nao apaga a marca); a linha antiga sem etapa so salva
       escolhendo uma. Nao muda custo. */
    /* A regra e da MEDIDA PADRAO (③ REVISAO): o modelo sob medida tem a
       bancada dele (§19), e a etapa ali seria inventada — o vazio passa. */
    const mSob = db.prepare('SELECT sob_medida FROM modelo WHERE id=?').get(modelo);
    const ehSob = !!(mSob && mSob.sob_medida);
    let etapa;
    if(b.etapa !== undefined && b.etapa !== null && !(ehSob && String(b.etapa).trim() === '')){
      const e = String(b.etapa).trim();
      if(e === '') return res.status(400).json({erro:'escolha a etapa de preparo da linha: toda linha tem uma'});
      if(!ETAPAS.valida(e)) return res.status(400).json({erro:'etapa "'+e+'" não existe — escolha uma da lista'});
      etapa = e;
    }
    /* A etapa gravada que nao existe mais nao se preserva calada: conta como falta. */
    if(etapa === undefined && !ehSob){
      const antes = b.id ? db.prepare('SELECT etapa FROM ficha_formula WHERE id=?').get(+b.id) : null;
      if(!antes || !ETAPAS.valida(antes.etapa))
        return res.status(400).json({erro:'escolha a etapa de preparo da linha: toda linha tem uma'});
    }

    const campos={ modelo_id:modelo, componente_id:comp, familia, expressao:expr,
      observacao:txt(b.observacao), ordem:(b.ordem!=null?+b.ordem:0),
      corte_largura:cl, corte_altura:ca, corte_unidade:txt(b.corte_unidade)||'cm' };
    if(b.id){
      db.prepare(`UPDATE ficha_formula SET modelo_id=@modelo_id,componente_id=@componente_id,
        familia=@familia,expressao=@expressao,observacao=@observacao,ordem=@ordem,ativo=1,
        corte_largura=@corte_largura,corte_altura=@corte_altura,corte_unidade=@corte_unidade,
        planejamento=COALESCE(@planejamento, planejamento),
        etapa=COALESCE(@etapa, etapa)
        WHERE id=@id`).run(Object.assign({id:+b.id, planejamento: plan===undefined ? null : plan,
          etapa: etapa===undefined ? null : etapa},campos));
      /* O recalculo de custo continua sendo disparado pela linha inteira, e nao
         so pela `expressao`: mexer no corte nao muda centavo, mas o carimbo de
         "quando esta ficha foi tocada" tem que valer para a linha toda. */
      historico(modelo, 'fórmula alterada', req);
      return res.json({ok:true,id:+b.id,testes:v.testes});
    }
    const r=db.prepare(`INSERT INTO ficha_formula (modelo_id,componente_id,familia,expressao,observacao,ordem,
        corte_largura,corte_altura,corte_unidade,planejamento,etapa)
      VALUES (@modelo_id,@componente_id,@familia,@expressao,@observacao,@ordem,
        @corte_largura,@corte_altura,@corte_unidade,@planejamento,@etapa)`).run(Object.assign({planejamento: plan||0,
        etapa: etapa ? etapa : null}, campos));
    historico(modelo, 'linha acrescentada à ficha', req);
    res.json({ok:true,id:r.lastInsertRowid,testes:v.testes});
  });

  /* As medidas reais de um modelo, para a barra de medida da tela. A tela
     mostrava `1,80 × 1,50` fixo na coluna de previa — a persiana critica e a
     1,80 (unica que nao encaixa duas na bobina) e a mais vendida e a 1,60, e a
     tela mostrava uma e escondia a outra. */
  /* O ROTEIRO de um modelo (PRODUCAO-MAPA-E-MOTOR fase 1): sai das linhas,
     pelo etapas.js, e vem com as opcoes para o campo Etapa da 404. Leitura:
     cai na regra das leituras da ficha (as chaves da 404). */
  app.get('/api/formulas/roteiro/:modelo_id',(req,res)=>{
    const r = ETAPAS.roteiro(db, +req.params.modelo_id);
    if(!r) return res.status(404).json({erro:'modelo não encontrado'});
    res.json({ etapas:r.etapas, sem_etapa:r.sem_etapa, motivo:r.motivo||null, opcoes:ETAPAS.DE_LINHA });
  });

  app.get('/api/formulas/medidas/:modelo_id',(req,res)=>{
    const m=+req.params.modelo_id;
    const todas=db.prepare(`SELECT largura_cm largura, altura_cm altura, COUNT(*) skus
      FROM skus WHERE modelo_id=? AND largura_cm IS NOT NULL AND altura_cm IS NOT NULL
      GROUP BY largura_cm, altura_cm ORDER BY largura_cm, altura_cm`).all(m);
    res.json(Object.assign({ todas }, medidasDoModelo(m)));
  });

  app.delete('/api/formulas/:id',(req,res)=>{
    const f=db.prepare('SELECT modelo_id FROM ficha_formula WHERE id=?').get(req.params.id);
    db.prepare('DELETE FROM ficha_formula WHERE id=?').run(req.params.id);
    if(f) historico(f.modelo_id, 'linha removida da ficha', req);
    res.json({ok:true});
  });

  /* O calculo mora em ficha_dominio.js — o historico de custo precisa da MESMA
     conta, e duas copias divergiriam no primeiro ajuste (§9). */
  const calcular = sku => FICHA.calcularFicha(db, sku);

  /* SEM custo.ver, A FICHA SAI SEM O CUSTO (R-VAL): o consumo, o material e a
     medida de corte são de quem abre a 404; o dinheiro (o custo da linha, o
     custo do material, o preço da bobina) é da caixinha de valor. */
  const CUSTO_DA_FICHA = /^(custo|preco)/;
  function semCusto(o){
    if(Array.isArray(o)) return o.map(semCusto);
    if(!o || typeof o !== 'object') return o;
    const n = {};
    for(const k of Object.keys(o)) if(!CUSTO_DA_FICHA.test(k)) n[k] = semCusto(o[k]);
    return n;
  }
  /* O CATALOGO UNICO (FICHAS-NO-CADASTRO-UNICO fase 5, decisao do dono): a 404
     lista tambem os produtos do sob medida, com o caminho para a ficha deles
     (608). So nome e ativo atravessam; sem a porta, a lista vem vazia com
     `fora`, e a tela diz. */
  app.get('/api/catalogo/sobmedida',(req,res)=>res.json(require('./sobmedida_material').produtos()));

  /* O CUSTO DA PERSIANA SOB MEDIDA NUMA MEDIDA (item 1, 11/11/2026): a 404
     confere a lista de material de um produto do sob medida, como confere a
     ficha de um SKU. Medida em centimetros (a da 404). O total separa o que
     entra SEMPRE do que depende de escolha (bando, comando...): somar tudo
     seria o custo de uma persiana que ninguem vende. Sem custo.ver, nenhum
     campo de custo viaja (a regra do valor, §23). */
  app.get('/api/catalogo/sobmedida/:id/medida',(req,res)=>{
    const num = v => (/^\d+([.,]\d+)?$/.test(String(v==null?'':v).trim()) ? +String(v).replace(',','.') : null);
    const l = num(req.query.largura), a = num(req.query.altura);
    if(!l || !a || Math.round(l*10) < 1 || Math.round(a*10) < 1) return res.status(400).json({ erro:'Digite a largura e a altura em centímetros.' });
    let r;
    try{ r = require('./sobmedida_material').naMedida(+req.params.id, Math.round(l*10), Math.round(a*10)); }
    catch(e){ return res.status(400).json({ erro:e.message }); }
    if(r.fora) return res.json({ fora:true, linhas:[] });
    let ve = false; try{ ve = !!app.locals.acesso.podePermissao(req.usuario, 'custo.ver'); }catch(e){}
    const linhas = (r.linhas || []).map(x => ({ nome:x.nome, unidade:x.unidade, quando:x.quando || 'sempre',
      quantidade:x.quantidade, erro:x.erro || null, custo_unitario:x.custo_unitario, custo_centavos:x.custo_centavos }));
    const soma = f => { let t = 0; for(const x of linhas.filter(f)){ if(x.custo_centavos == null) return null; t += x.custo_centavos; } return t; };
    /* ③ REVISAO: o que depende de escolha sai POR ESCOLHA (com comando e sem
       comando nao andam juntos; somar os dois seria uma persiana que ninguem
       vende), e a linha de escolha sem preco nao torna indefinido o que entra
       sempre. O "sem preco" do topo e so do que entra sempre. */
    const sempre = linhas.filter(x => x.quando === 'sempre');
    const grupos = [];
    for(const x of linhas) if(x.quando !== 'sempre' && grupos.indexOf(x.quando) < 0) grupos.push(x.quando);
    const out = { fora:false, largura_cm:l, altura_cm:a, linhas,
      custo_sempre_centavos:sempre.length ? soma(x => x.quando === 'sempre') : null,
      nada_sempre:!sempre.length,
      por_escolha:grupos.map(q => ({ quando:q, custo_centavos:soma(x => x.quando === q) })),
      sem_custo:sempre.filter(x => x.custo_centavos == null).map(x => x.nome) };
    if(!ve){ for(const x of linhas){ delete x.custo_unitario; delete x.custo_centavos; }
      delete out.custo_sempre_centavos; delete out.sem_custo;
      for(const g of out.por_escolha) delete g.custo_centavos; }
    res.json(out);
  });

  app.get('/api/ficha/:sku',(req,res)=>{
    const f = calcular(req.params.sku);
    let ve = false; try{ ve = !!app.locals.acesso.podePermissao(req.usuario, 'custo.ver'); }catch(e){}
    res.json(ve ? f : semCusto(f));
  });

  /* Materializa a ficha na `ficha_tecnica`, que e o que a montagem ja le. */
  app.post('/api/ficha/:sku/materializar',(req,res)=>{
    const f=calcular(req.params.sku);
    if(f.erro||f.pendencia) return res.status(400).json(f);
    /* SOMA por componente antes de gravar. A ficha pode ter mais de uma linha do
       mesmo material de proposito — o parafuso que prende o suporte e o que
       prende a base sao duas linhas com razoes diferentes na observacao, e as
       duas quantidades se somam. Sem somar aqui, a segunda linha bateria na
       chave primaria (sku, componente_id) e derrubaria a gravacao inteira. */
    const somado={};
    for(const l of f.linhas) if(l.componente_id && l.quantidade!=null)
      somado[l.componente_id]=(somado[l.componente_id]||0)+l.quantidade;
    db.transaction(()=>{
      db.prepare('DELETE FROM ficha_tecnica WHERE sku=?').run(f.sku);
      const ins=db.prepare('INSERT INTO ficha_tecnica (sku,componente_id,quantidade) VALUES (?,?,?)');
      for(const id in somado) ins.run(f.sku,+id,somado[id]);
    })();
    res.json({ok:true, linhas:Object.keys(somado).length});
  });
};
