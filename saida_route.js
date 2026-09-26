/* A SAÍDA DO CAMINHÃO DA COLETA — spec SAIDA-E-DUPLA-CONFERENCIA, fase 3 (26/09/2026).
 *
 * Substitui o "Fechar coleta" de 10/09/2026, que comparava o canto INTEIRO com
 * o motorista: um dia sem fechar estragava todos os seguintes, a equipe não
 * aderiu, e 399 caixas acumularam. Aqui cada caminhão é UMA saída, e ela só
 * olha o que estava no canto e ainda não tinha saída (carga.js → NA_SAIDA):
 *
 *     1. abrir           a tela entra no modo "BIPE O QUE FICOU"
 *     2. sobras          bipe do que ficou, ou "não ficou nada" — OBRIGATÓRIO
 *     3. foto + número   da tela do celular do motorista
 *     4. fechar          saíram = NA_SAIDA − sobras + "foi no caminhão"
 *
 * Bateu: cada caixa grava saida_id, saiu_em, saiu_por='coleta' e retirado_em
 * (este último mantém a conta de "Peças adiantadas" e o relatório antigo).
 * Não bateu: NADA anda, e a resposta traz as caixas com nome e NF. Liberar
 * assim mesmo é outra rota, com chave própria (`saida.liberar`, supervisor e
 * admin) e motivo — decisão 7 do dono.
 *
 * ⚠️ O PASSO DAS SOBRAS É DECLARADO, NUNCA SUPOSTO. Se fechar sem sobras
 * valesse, o operador que pula o passo diria "saiu tudo" sem saber. Ou bipa o
 * que ficou, ou toca "não ficou nada" — as duas são respostas, o silêncio não.
 *
 * ⚠️ O BIPE SÓ QUER DIZER "SOBROU". A caixa que não estava na conta e foi no
 * caminhão (a troca de porta, decisão 6) entra por BOTÃO, na lista que a
 * divergência mostra — nunca por bipe. O mesmo bipe querendo dizer duas coisas
 * conforme o estado da caixa é como se erra de luva na mão.
 *
 * ⚠️ `saiu_por` NÃO É `modalidade`. A caixa de agência que o motorista levou
 * sai com saiu_por='coleta' e continua modalidade 'agencia': a etiqueta disse
 * uma coisa, a saída disse outra, e as duas são verdade (§8-B, #21).
 *
 * Uma saída aberta por vez, guardada no banco: o tablet que recarrega a
 * reencontra com as sobras já bipadas.
 */
const fs = require('fs'), path = require('path');
const { acharVolumes, naSaida, podeTerIdo, PODE_TER_IDO, PRONTA_PRO_CARRO, nomeIgual, ehColeta } = require('./carga');
const { decodificarFoto, tipoDaFoto } = require('./foto');
const FOTOS_DIR = require('./caminhos').COLETAS;

module.exports = function(app, db){
  require('./saida_schema').garantirSaida(db);
  try{ fs.mkdirSync(FOTOS_DIR, {recursive:true}); }catch(e){}
  const auditar = (req, acao, alvo, det) => {
    try{ const ac = app.locals.acesso; if(ac && ac.auditar) ac.auditar(req, 'expedicao', acao, alvo, det); }catch(e){}
  };
  const quem = req => (req.usuario && req.usuario.nome) || '';
  const lista = s => { try{ const v = JSON.parse(s||'[]'); return Array.isArray(v) ? v : []; }catch(e){ return []; } };
  const aberta = () => db.prepare("SELECT * FROM saida WHERE tipo='coleta' AND fechada_em IS NULL ORDER BY id DESC").get() || null;

  /* O retrato da saída aberta: a conta, as caixas que saem e o que ficou. */
  function retrato(s){
    if(!s) return { saida:null };
    const sobras = lista(s.sobras), levou = lista(s.levou);
    const canto = naSaida(db);
    const noCanto = new Set(canto.map(v => v.id));
    /* Sobra que deixou de estar na conta (saiu por outra saída, voltou para o
       carro) não vale mais nada: não entra na subtração. */
    const sobrasValidas = sobras.filter(id => noCanto.has(id));
    const levouLinhas = levou.length
      ? db.prepare(`SELECT id,codigo,buyer,nf,modalidade,despachar_em,impresso_por,conferido_por FROM lote
          WHERE id IN (${levou.map(()=>'?').join(',')}) AND ${PODE_TER_IDO}`).all(...levou)
          .map(v => Object.assign(v, { troca_de_porta: v.modalidade !== 'coleta' }))
      : [];
    const saem = canto.filter(v => !sobrasValidas.includes(v.id)).concat(levouLinhas);
    const pegar = id => canto.find(v => v.id === id);
    return {
      saida: { id:s.id, tipo:s.tipo, aberta_em:s.aberta_em, aberta_por:s.aberta_por, nada_ficou: !!s.nada_ficou },
      sistema: saem.length,
      lista: saem,
      sobras: sobrasValidas.map(pegar),
      levou: levouLinhas,
      candidatos: podeTerIdo(db).filter(v => !levou.includes(v.id))
    };
  }

  app.get('/api/saida/aberta', (req, res) => res.json(retrato(aberta())));

  app.post('/api/saida/abrir', (req, res) => {
    let s = aberta();
    if(!s){
      const id = db.prepare("INSERT INTO saida (tipo, aberta_por) VALUES ('coleta', ?)").run(quem(req)).lastInsertRowid;
      s = db.prepare('SELECT * FROM saida WHERE id=?').get(id);
    }
    res.json(Object.assign({ ok:true }, retrato(s)));
  });

  const semSaida = res => res.json({ ok:false, motivo:'sem_saida',
    aviso:'Nenhuma saída de caminhão aberta. Toque em "Saída do caminhão" antes de bipar as sobras.' });

  /* O BIPE DAS SOBRAS: a caixa ficou no canto e não foi no caminhão. */
  app.post('/api/saida/sobra', (req, res) => {
    const s = aberta(); if(!s) return semSaida(res);
    const code = String((req.body && req.body.code) || '').trim();
    if(!code) return res.status(400).json({ erro:'sem codigo' });
    const batem = acharVolumes(db, code);
    if(!batem.length) return res.json({ ok:false, motivo:'nao_encontrado', lido:code });
    const conta = new Set(naSaida(db).map(v => v.id));
    const alvo = batem.find(v => conta.has(v.id));
    if(!alvo){
      const v = batem[0];
      /* A cancelada ja saiu da conta pelo import: bipa-la como sobra so
         confirma que ela ficou, que e o certo. */
      if(v.estagio === 'cancelado') return res.json({ ok:false, motivo:'cancelada', pedido:{ id:v.id, buyer:v.buyer, nf:v.nf },
        aviso:'Venda cancelada no Mercado Livre — ela já está fora da conta do caminhão. Deixe separada e avise o admin.' });
      return res.json({ ok:false, motivo:'fora_da_conta', pedido:{ id:v.id, buyer:v.buyer, nf:v.nf },
        aviso:'Esta caixa não está na conta deste caminhão (não foi bipada no canto da coleta). ' +
              'Se ela ficou aqui, não precisa fazer nada.' });
    }
    const sobras = lista(s.sobras);
    if(sobras.includes(alvo.id)) return res.json(Object.assign({ ok:false, motivo:'ja_sobra',
      pedido:{ id:alvo.id, buyer:alvo.buyer, nf:alvo.nf } }, retrato(s)));
    sobras.push(alvo.id);
    db.prepare('UPDATE saida SET sobras=?, nada_ficou=0 WHERE id=?').run(JSON.stringify(sobras), s.id);
    res.json(Object.assign({ ok:true, pedido:{ id:alvo.id, buyer:alvo.buyer, nf:alvo.nf } },
      retrato(db.prepare('SELECT * FROM saida WHERE id=?').get(s.id))));
  });
  app.post('/api/saida/sobra/tirar', (req, res) => {
    const s = aberta(); if(!s) return semSaida(res);
    const id = parseInt(req.body && req.body.id, 10);
    const sobras = lista(s.sobras).filter(x => x !== id);
    db.prepare('UPDATE saida SET sobras=? WHERE id=?').run(JSON.stringify(sobras), s.id);
    res.json(Object.assign({ ok:true }, retrato(db.prepare('SELECT * FROM saida WHERE id=?').get(s.id))));
  });

  /* "NÃO FICOU NADA": o passo das sobras respondido com o vazio. */
  app.post('/api/saida/nada', (req, res) => {
    const s = aberta(); if(!s) return semSaida(res);
    const r = retrato(s);
    if(r.sobras.length) return res.json(Object.assign({ ok:false, motivo:'tem_sobras',
      aviso:'Há sobras bipadas nesta saída. Tire-as da lista antes de dizer que não ficou nada.' }, r));
    db.prepare('UPDATE saida SET nada_ficou=1 WHERE id=?').run(s.id);
    res.json(Object.assign({ ok:true }, retrato(db.prepare('SELECT * FROM saida WHERE id=?').get(s.id))));
  });

  /* "FOI NO CAMINHÃO": a troca de porta, por botão. */
  app.post('/api/saida/levou', (req, res) => {
    const s = aberta(); if(!s) return semSaida(res);
    const id = parseInt(req.body && req.body.id, 10);
    const levou = lista(s.levou);
    if(levou.includes(id)) return res.json(Object.assign({ ok:false, motivo:'ja_levou' }, retrato(s)));
    const v = db.prepare(`SELECT id FROM lote WHERE id=? AND ${PODE_TER_IDO}`).get(id);
    if(!v) return res.json(Object.assign({ ok:false, motivo:'nao_pode',
      aviso:'Esta caixa não pode ter ido no caminhão: ou não tem etiqueta impressa, ou já saiu por outra saída.' }, retrato(s)));
    levou.push(id);
    db.prepare('UPDATE saida SET levou=? WHERE id=?').run(JSON.stringify(levou), s.id);
    res.json(Object.assign({ ok:true }, retrato(db.prepare('SELECT * FROM saida WHERE id=?').get(s.id))));
  });
  app.post('/api/saida/levou/tirar', (req, res) => {
    const s = aberta(); if(!s) return semSaida(res);
    const id = parseInt(req.body && req.body.id, 10);
    db.prepare('UPDATE saida SET levou=? WHERE id=?').run(JSON.stringify(lista(s.levou).filter(x => x !== id)), s.id);
    res.json(Object.assign({ ok:true }, retrato(db.prepare('SELECT * FROM saida WHERE id=?').get(s.id))));
  });

  app.post('/api/saida/cancelar', (req, res) => {
    const s = aberta(); if(!s) return semSaida(res);
    db.prepare('DELETE FROM saida WHERE id=? AND fechada_em IS NULL').run(s.id);
    auditar(req, 'saida_cancelada', 'saida '+s.id, 'aberta por '+(s.aberta_por||'?'));
    res.json({ ok:true });
  });

  /* O FECHAMENTO, comum às duas rotas. `liberar` só chega verdadeiro pela rota
     de liberar, que tem chave própria no permDaRota. */
  function fechar(req, res, liberar){
    const s = aberta(); if(!s) return semSaida(res);
    const b = req.body || {};
    const mot = parseInt(b.motorista, 10);
    if(!(mot >= 0)) return res.status(400).json({ erro:'informe quantas caixas o motorista bipou' });
    const r = retrato(s);
    if(!r.sobras.length && !s.nada_ficou) return res.json(Object.assign({ ok:false, motivo:'sobras',
      aviso:'Antes de fechar, bipe as caixas que FICARAM no canto — ou toque em "não ficou nada".' }, r));
    if(!r.sistema && !mot) return res.json(Object.assign({ ok:false, motivo:'vazia',
      aviso:'Esta saída não tem caixa nenhuma. Cancele a saída em vez de fechar.' }, r));
    /* SEM FOTO NÃO FECHA — antes de comparar, para a pessoa não descobrir que
       faltou a foto depois de conferir caixa a caixa (§8-B). */
    const foto = decodificarFoto(b.foto);
    if(!foto) return res.json(Object.assign({ ok:false, motivo:'sem_foto', motorista:mot,
      aviso:'Tire a foto da tela do celular do motorista mostrando quantas caixas ele bipou. Sem a foto a saída não fecha.' }, r));
    const divergente = mot !== r.sistema;
    const motivo = String(b.motivo || '').trim().slice(0, 300);
    if(divergente && !liberar){
      auditar(req, 'saida_divergente', 'saida '+s.id, 'sistema '+r.sistema+' x motorista '+mot+' — não fechou');
      return res.json(Object.assign({ ok:false, motivo:'divergente', motorista:mot }, r));
    }
    if(liberar && divergente && !motivo) return res.json(Object.assign({ ok:false, motivo:'sem_motivo', motorista:mot,
      aviso:'Para liberar o caminhão com número diferente, escreva o motivo.' }, r));
    const ids = r.lista.map(v => v.id);
    const levouIds = r.levou.map(v => v.id);
    const autor = quem(req);
    let arq = null;
    db.transaction(() => {
      /* A troca de porta sai da pilha: a caixa foi embora, então é carregada, e
         quem fechou é quem a conferiu — sem isso ela ficaria para sempre em
         "faltam conferir" na conta da pilha (fase 2). */
      const saiu = db.prepare(`UPDATE lote SET estagio='carregado',
          carregado_em=COALESCE(carregado_em, datetime('now','localtime')),
          conferido_por=CASE WHEN conferido_em IS NULL THEN ? ELSE conferido_por END,
          conferido_em=COALESCE(conferido_em, datetime('now','localtime'))
        WHERE id=? AND ${PODE_TER_IDO}`);
      for(const id of levouIds) saiu.run(autor || null, id);
      const up = db.prepare(`UPDATE lote SET saida_id=?, saiu_em=datetime('now','localtime'), saiu_por='coleta',
          retirado_em=COALESCE(retirado_em, datetime('now','localtime')) WHERE id=? AND saida_id IS NULL`);
      for(const id of ids) up.run(s.id, id);
      const sem2 = ids.length ? db.prepare(`SELECT impresso_por, conferido_por FROM lote WHERE id IN (${ids.map(()=>'?').join(',')})`)
        .all(...ids).filter(v => String(v.impresso_por||'').trim() && String(v.conferido_por||'').trim()
                              && nomeIgual(v.impresso_por, v.conferido_por)).length : 0;
      /* O arquivo leva o id da saída: acha-se a foto pela linha e a linha pela
         foto. Gravado DENTRO da transação — se o disco recusar, a saída não
         fecha e as caixas continuam no canto. */
      arq = path.join(FOTOS_DIR, 'saida-' + s.id + '.' + foto.ext);
      fs.writeFileSync(arq, foto.buf);
      db.prepare(`UPDATE saida SET fechada_em=datetime('now','localtime'), fechado_por=?, qtd_sistema=?, qtd_externa=?,
          divergente=?, liberado_por=?, motivo=?, foto=?, sobras=?, ids=?, sem_segunda_pessoa=? WHERE id=?`)
        .run(autor, r.sistema, mot, divergente?1:0, divergente ? autor : null, motivo || null, arq,
             JSON.stringify(r.sobras.map(v => v.id)), JSON.stringify(ids), sem2, s.id);
    })();
    if(divergente) auditar(req, 'saida_liberada_divergente', 'saida '+s.id,
      'sistema '+r.sistema+' / motorista '+mot+' — '+motivo);
    if(levouIds.length) auditar(req, 'saida_troca_de_porta', 'saida '+s.id, levouIds.length+' caixa(s) fora da conta foram no caminhão');
    res.json({ ok:true, id:s.id, sistema:r.sistema, motorista:mot, divergente,
      troca_de_porta: r.levou.filter(v => v.troca_de_porta).length, sobras:r.sobras.length,
      foto:'/api/saida/foto/'+s.id });
  }
  app.post('/api/saida/fechar', (req, res) => fechar(req, res, false));
  app.post('/api/saida/liberar', (req, res) => fechar(req, res, true));

  /* A prova, de volta. Só leitura: ninguém edita nem apaga foto por rota. */
  app.get('/api/saida/foto/:id', (req, res) => {
    const r = db.prepare('SELECT foto FROM saida WHERE id=?').get(req.params.id);
    if(!r || !r.foto) return res.status(404).send('sem foto');
    let ok = false; try{ ok = fs.existsSync(r.foto); }catch(e){}
    if(!ok) return res.status(410).send('a foto nao esta mais no disco');
    res.setHeader('Content-Type', tipoDaFoto(r.foto));
    res.send(fs.readFileSync(r.foto));
  });

  /* ════════════ A VIAGEM À AGÊNCIA — fase 4 (26/09/2026) ════════════
     A caixa de agência tem dois bipes (decisão D1 do dono): o da ÁREA confere
     (carreg_route.js), o do CARRO põe na viagem aberta — e só aceita caixa
     conferida. A viagem fecha com a foto da tela do atendente e o número dele:

         saíram = as caixas bipadas no carro NESTA viagem

     A caixa fica ligada à viagem pelo `saida_id` desde o bipe no carro (e
     `saiu_em` vazio até fechar): é assim que ela sai da conta do caminhão e do
     canto da coleta, e é assim que "tirar do carro" sabe o que desfazer.

     A FOTO VEM DE QUALQUER APARELHO (decisão D3): o servidor está na rede da
     fábrica e a agência não o alcança. O normal é o motorista fechar pelo
     celular quando volta, com a foto que tirou no balcão — por isso aqui a
     foto pode vir da galeria. Enquanto não fecha, a viagem fica aberta com as
     caixas no carro, e a tela avisa se ela atravessar a noite. */
  const viagemAberta = () => db.prepare("SELECT * FROM saida WHERE tipo='agencia' AND fechada_em IS NULL ORDER BY id DESC").get() || null;
  const semViagem = res => res.json({ ok:false, motivo:'sem_viagem',
    aviso:'Nenhuma viagem à agência aberta. Toque em "Viagem à agência" antes de bipar no carro.' });
  function retratoViagem(v){
    if(!v) return { viagem:null };
    const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
    const noCarro = db.prepare(`SELECT id,codigo,buyer,nf,modalidade,despachar_em,no_carro_em,no_carro_por,impresso_por,conferido_por
      FROM lote WHERE saida_id=? AND saiu_em IS NULL ORDER BY no_carro_em, id`).all(v.id)
      .map(x => Object.assign(x, { troca_de_porta: ehColeta(x) }));
    const prontas = db.prepare(`SELECT id,codigo,buyer,nf,despachar_em FROM lote WHERE ${PRONTA_PRO_CARRO}
      ORDER BY COALESCE(despachar_em,data), id`).all();
    return {
      viagem: { id:v.id, tipo:v.tipo, aberta_em:v.aberta_em, aberta_por:v.aberta_por,
                antiga: !!(v.aberta_em && String(v.aberta_em).slice(0,10) < hoje) },
      sistema: noCarro.length, lista: noCarro, prontas
    };
  }
  app.get('/api/viagem/aberta', (req, res) => res.json(retratoViagem(viagemAberta())));
  app.post('/api/viagem/abrir', (req, res) => {
    let v = viagemAberta();
    if(!v){
      const id = db.prepare("INSERT INTO saida (tipo, aberta_por) VALUES ('agencia', ?)").run(quem(req)).lastInsertRowid;
      v = db.prepare('SELECT * FROM saida WHERE id=?').get(id);
    }
    res.json(Object.assign({ ok:true }, retratoViagem(v)));
  });

  /* O BIPE NO CARRO. A ordem das recusas é a da caixa na mão: não existe,
     sem etiqueta, já saiu, já está no carro, não foi conferida. */
  app.post('/api/viagem/carro', (req, res) => {
    const v = viagemAberta(); if(!v) return semViagem(res);
    const code = String((req.body && req.body.code) || '').trim();
    if(!code) return res.status(400).json({ erro:'sem codigo' });
    const batem = acharVolumes(db, code);
    if(!batem.length) return res.json({ ok:false, motivo:'nao_encontrado', lido:code });
    const pronta = x => (x.estagio === 'embalado' && x.conferido_em && !ehColeta(x))
                     || (x.estagio === 'carregado' && ehColeta(x) && !x.retirado_em && !x.saida_id);
    const alvo = batem.find(pronta) || batem.find(x => x.saida_id === v.id && !x.saiu_em) || batem[0];
    const ped = { id:alvo.id, buyer:alvo.buyer, nf:alvo.nf, codigo:alvo.codigo };
    /* Venda cancelada no ML nao vai no carro (VENDAS-E-MEDIA fase 2, D2). */
    if(alvo.estagio === 'cancelado') return res.json({ ok:false, motivo:'cancelada', pedido:ped,
      aviso:'Venda cancelada no Mercado Livre. Não carregar: separe a caixa e avise o admin.'
            +(alvo.cancelada_motivo?' ML: “'+alvo.cancelada_motivo+'”':'') });
    if(alvo.estagio === 'bloqueado') return res.json({ ok:false, motivo:'bloqueado', pedido:ped,
      aviso:'SKU "'+(alvo.codigo||'(vazio)')+'" não está no cadastro. Não pode sair.' });
    if(alvo.estagio === 'pendente') return res.json({ ok:false, motivo:'nao_embalado', pedido:ped,
      aviso:'Esta caixa ainda não passou pela ETIQUETA DE VENDA. Imprima a etiqueta por lá antes.' });
    if(alvo.saida_id === v.id && !alvo.saiu_em) return res.json(Object.assign({ ok:false, motivo:'ja_no_carro', pedido:ped },
      retratoViagem(v)));
    if(!pronta(alvo)){
      if(alvo.estagio === 'embalado') return res.json({ ok:false, motivo:'nao_conferida', pedido:ped,
        aviso:'Esta caixa não foi conferida na área. Toque em "Conferir na área", bipe ela, e depois ponha no carro.' });
      return res.json({ ok:false, motivo:'duplicado', pedido:ped,
        aviso:'Esta caixa já saiu da fábrica (ou já foi carregada antes das viagens existirem).' });
    }
    db.prepare(`UPDATE lote SET estagio='carregado', carregado_em=COALESCE(carregado_em, datetime('now','localtime')),
        no_carro_em=datetime('now','localtime'), no_carro_por=?, saida_id=? WHERE id=?`)
      .run(quem(req) || null, v.id, alvo.id);
    res.json(Object.assign({ ok:true, pedido:ped, troca_de_porta: ehColeta(alvo) }, retratoViagem(v)));
  });

  /* TIRAR DO CARRO: desfaz o bipe. A de agência volta à área, conferida; a de
     coleta volta ao canto. Só vale para a viagem aberta. */
  app.post('/api/viagem/tirar', (req, res) => {
    const v = viagemAberta(); if(!v) return semViagem(res);
    const id = parseInt(req.body && req.body.id, 10);
    const x = db.prepare('SELECT * FROM lote WHERE id=? AND saida_id=? AND saiu_em IS NULL').get(id, v.id);
    if(!x) return res.json(Object.assign({ ok:false, motivo:'fora_do_carro' }, retratoViagem(v)));
    if(ehColeta(x)) db.prepare('UPDATE lote SET no_carro_em=NULL, no_carro_por=NULL, saida_id=NULL WHERE id=?').run(id);
    else db.prepare(`UPDATE lote SET estagio='embalado', carregado_em=NULL, no_carro_em=NULL, no_carro_por=NULL,
        saida_id=NULL WHERE id=?`).run(id);
    res.json(Object.assign({ ok:true }, retratoViagem(v)));
  });

  app.post('/api/viagem/cancelar', (req, res) => {
    const v = viagemAberta(); if(!v) return semViagem(res);
    const r = retratoViagem(v);
    if(r.sistema) return res.json(Object.assign({ ok:false, motivo:'carro_cheio',
      aviso:'Há caixas no carro desta viagem. Tire-as do carro antes de cancelar — ou feche a viagem.' }, r));
    db.prepare('DELETE FROM saida WHERE id=? AND fechada_em IS NULL').run(v.id);
    auditar(req, 'viagem_cancelada', 'saida '+v.id, 'aberta por '+(v.aberta_por||'?'));
    res.json({ ok:true });
  });

  function fecharViagem(req, res, liberar){
    const v = viagemAberta(); if(!v) return semViagem(res);
    const b = req.body || {};
    const at = parseInt(b.atendente, 10);
    if(!(at >= 0)) return res.status(400).json({ erro:'informe quantas caixas o atendente bipou' });
    const r = retratoViagem(v);
    if(!r.sistema && !at) return res.json(Object.assign({ ok:false, motivo:'vazia',
      aviso:'Esta viagem não tem caixa nenhuma. Cancele a viagem em vez de fechar.' }, r));
    const foto = decodificarFoto(b.foto);
    if(!foto) return res.json(Object.assign({ ok:false, motivo:'sem_foto', atendente:at,
      aviso:'Falta a foto da tela do atendente mostrando quantas caixas ele bipou. Sem a foto a viagem não fecha.' }, r));
    const divergente = at !== r.sistema;
    const motivo = String(b.motivo || '').trim().slice(0, 300);
    if(divergente && !liberar){
      auditar(req, 'viagem_divergente', 'saida '+v.id, 'carro '+r.sistema+' x atendente '+at+' — não fechou');
      return res.json(Object.assign({ ok:false, motivo:'divergente', atendente:at }, r));
    }
    if(liberar && divergente && !motivo) return res.json(Object.assign({ ok:false, motivo:'sem_motivo', atendente:at,
      aviso:'Para liberar a viagem com número diferente, escreva o motivo.' }, r));
    const ids = r.lista.map(x => x.id);
    const autor = quem(req);
    db.transaction(() => {
      /* `retirado_em` só na de coleta: é o que diz, para ela, que saiu da
         fábrica ("Peças adiantadas" e o canto da coleta leem dali). */
      db.prepare(`UPDATE lote SET saiu_em=datetime('now','localtime'), saiu_por='agencia',
          retirado_em=CASE WHEN COALESCE(modalidade,'agencia')='coleta' THEN COALESCE(retirado_em, datetime('now','localtime'))
                           ELSE retirado_em END
        WHERE saida_id=? AND saiu_em IS NULL`).run(v.id);
      const sem2 = r.lista.filter(x => String(x.impresso_por||'').trim() && String(x.conferido_por||'').trim()
                                    && nomeIgual(x.impresso_por, x.conferido_por)).length;
      const arq = path.join(FOTOS_DIR, 'saida-' + v.id + '.' + foto.ext);
      fs.writeFileSync(arq, foto.buf);
      db.prepare(`UPDATE saida SET fechada_em=datetime('now','localtime'), fechado_por=?, qtd_sistema=?, qtd_externa=?,
          divergente=?, liberado_por=?, motivo=?, foto=?, ids=?, sem_segunda_pessoa=? WHERE id=?`)
        .run(autor, r.sistema, at, divergente?1:0, divergente ? autor : null, motivo || null, arq,
             JSON.stringify(ids), sem2, v.id);
    })();
    if(divergente) auditar(req, 'viagem_liberada_divergente', 'saida '+v.id, 'carro '+r.sistema+' / atendente '+at+' — '+motivo);
    const troca = r.lista.filter(x => x.troca_de_porta).length;
    if(troca) auditar(req, 'viagem_troca_de_porta', 'saida '+v.id, troca+' caixa(s) de coleta foram pela agência');
    res.json({ ok:true, id:v.id, sistema:r.sistema, atendente:at, divergente, troca_de_porta:troca,
      foto:'/api/saida/foto/'+v.id });
  }
  app.post('/api/viagem/fechar', (req, res) => fecharViagem(req, res, false));
  app.post('/api/viagem/liberar', (req, res) => fecharViagem(req, res, true));
};
