/* O QUE ESTA PRA CARREGAR.
 *
 * Dono unico da pergunta. O carregamento a faz TRES vezes por caminhos
 * diferentes — a lista "faltam carregar", o contador do topo e o bipe da
 * etiqueta — e com reguas diferentes o pior dos tres e o bipe: o volume esta
 * na mao da pessoa, na frente do carro, e a tela responde "nao encontrado".
 * Ali nao da pra conferir nada; o que a equipe aprende e que o sistema erra.
 *
 * A REGRA: `estagio='embalado'`, SEM olhar o dia da importacao.
 *
 * Etiqueta de venda impressa e volume que ainda nao subiu no carro esta
 * FISICAMENTE na fabrica ate alguem carregar, e nao existe hora em que ele
 * deixe de estar. Enquanto as tres consultas filtravam por
 * `data=date('now','localtime')`, o volume embalado ontem e nao carregado
 * ontem sumia das tres de uma vez — e nao havia nenhuma outra tela em que ele
 * reaparecesse. Em 26/08/2026 eram os volumes #643 a #648, impressos no dia
 * anterior: fora da lista, fora do contador, e "nao encontrado" no bipe.
 *
 * Terceira porta da mesma doenca dos volumes fantasmas (§5) e da fila por
 * prazo de despacho (§7). As duas primeiras eram tela mostrando trabalho que
 * nao existe; esta e tela escondendo trabalho que existe, que e pior: o ruido
 * a equipe aprende a ignorar, mas o volume escondido ninguem procura.
 *
 * O ATRASADO NAO SE MISTURA COM O DIA. A lista sai com ele em cima e marcado:
 * um passivo antigo diluido no meio do trabalho de hoje viraria uma lista que
 * nunca zera, e lista que nunca zera e lista que ninguem le ate o fim.
 */

/* Condicao SQL sobre a tabela `lote`. Sem parametros: o ESTAGIO nao depende de
   data nenhuma, que e justamente o ponto. */
const PRA_CARREGAR = "estagio='embalado'";

/* QUEM DECIDE O PRAZO E O fila_dia.js, NAO ESTE ARQUIVO.
   "Isto vence hoje?" ja tem dono (§8, armadilha #7) e a resposta tem que ser a
   mesma na Etiqueta de Venda e aqui: se as duas telas discordassem sobre o que
   e trabalho de hoje, o volume sairia de uma e entraria na outra no mesmo dia.
   O que e desta casa e so o estagio. */
const {VENCE_HOJE} = require('./fila_dia');
const DO_DIA = PRA_CARREGAR + ' AND ' + VENCE_HOJE;

/* O mais velho primeiro. O atraso vai na frente porque e ele que corre risco
   de perder o prazo — e porque um volume que ja dormiu embalado uma vez e o
   candidato a dormir de novo. */
const ORDEM_CARGA = "COALESCE(despachar_em,data) ASC, id ASC";

/* ATRASO SE MEDE PELO PRAZO, NAO PELA DATA DE ENTRADA.
   Volume impresso ontem com despacho marcado pra semana que vem nao esta
   atrasado: esta adiantado. Marca-lo de atrasado manda a equipe por no carro
   hoje uma venda que so despacha depois — e ai a peca vai embora semanas antes
   do combinado. Foi o que aconteceu com quatro volumes em 26/08/2026 (o da
   Lucelia despacha 17/09).
   Sem prazo lido na etiqueta, a data de entrada e a melhor aproximacao: volume
   embalado num dia anterior e passivo ate prova em contrario. */
function atrasado(volume, hoje){
  if(!volume || !hoje) return false;
  const prazo = volume.despachar_em || volume.data;
  return !!(prazo && prazo < hoje);
}

/* Venda futura: existe, esta na fabrica, mas nao e da carga de hoje. Sai numa
   linha a parte na tela — nem escondida (que foi o buraco de #9) nem cobrada
   junto com o dia. */
function futuro(volume, hoje){
  return !!(volume && hoje && volume.despachar_em && volume.despachar_em > hoje);
}

/* COLETA: O CAMINHAO DO MERCADO LIVRE VEM BUSCAR (desde 10/09/2026).
   E a segunda porta de saida da fabrica, e a caixa dela NAO VAI NO CARRO. A
   modalidade e lida da etiqueta pelo parse.js (a de coleta vem sem hora na
   linha "Despachar:") e gravada em `lote.modalidade`. NULL — todo volume
   anterior a coluna, e o que nao deu pra ler — e agencia, que e o que sempre
   existiu: nao se manda pro canto da coleta um volume por falta de dado.
   Esta e a UNICA definicao de "isto e coleta?": a lista do carregamento, o
   bipe, a tarja da Etiqueta de Venda e o relogio de despacho leem daqui. Duas
   reguas mandariam a mesma caixa pro carro numa tela e pro canto na outra. */
function COLETA(alias){
  const p = alias ? alias+'.' : '';
  return `COALESCE(${p}modalidade,'agencia')='coleta'`;
}
function AGENCIA(alias){
  const p = alias ? alias+'.' : '';
  return `COALESCE(${p}modalidade,'agencia')<>'coleta'`;
}
function ehColeta(volume){
  return !!(volume && volume.modalidade === 'coleta');
}

/* ESPERANDO O CAMINHAO: bipada no carregamento (`carregado`, com a hora em
   `carregado_em`) e ainda nao levada (`retirado_em` vazio). O bipe acontece
   quando a caixa vai pro lugar reservado, nao quando o motorista chega — e e
   este conjunto que a conferencia com o motorista fecha, TODO de uma vez.
   Sem filtro por dia, pela mesma razao do PRA_CARREGAR: caixa separada ontem
   e nao retirada esta fisicamente no canto da coleta ate alguem levar. */
const AGUARDA_CAMINHAO = "estagio='carregado' AND " + COLETA() + " AND retirado_em IS NULL AND saida_id IS NULL";
/* `saida_id IS NULL` desde a fase 4 (26/09/2026): a caixa de coleta posta no
   CARRO de uma viagem a agencia aberta (troca de porta) ganha a saida da
   viagem e deixa de estar no canto — senao ela apareceria nos dois lugares, e
   entraria na conta do caminhao estando no carro. */

/* O QUE SAIU ADIANTADO (25/09/2026).
   Adiantado e o volume que saiu da fabrica ANTES da data de despacho que a
   etiqueta traz. Esta e a unica definicao — a tela do carregamento le daqui, e
   um relatorio amanha tem que ler daqui tambem.

   A SAIDA DEPENDE DA PORTA. Na agencia a caixa sai quando sobe no carro
   (`carregado_em`). Na coleta, o bipe so a leva pro canto reservado: ela sai
   quando o caminhao leva (`retirado_em`). Contar a coleta pelo bipe diria
   "saiu adiantado" de uma caixa que continua na fabrica.

   CONTA PECA, NAO CAIXA. A caixa de varias persianas (§5, #23) leva N pecas
   de uma vez; a caixa vai junto, para a diferenca aparecer quando existir.

   O FECHAMENTO A MAO NAO ENTRA SOZINHO. Os scripts do §5 carimbam a saida NA
   data do despacho (`COALESCE(despachar_em,data)` as 15:00), entao
   `despachar_em > date(saida)` nunca e verdade para eles — e e para isso que
   eles carimbam assim. Volume sem data de despacho lida nao e adiantado de
   ninguem: nao ha prazo contra o qual medir. */
function SAIDA(alias){
  const p = alias ? alias+'.' : '';
  return `CASE WHEN ${COLETA(alias)} THEN ${p}retirado_em ELSE ${p}carregado_em END`;
}
function saidasAdiantadas(db, dias){
  const n = Math.max(1, parseInt(dias,10) || 30);
  const linhas = db.prepare(`SELECT ${COLETA('l')} AS coleta,
      date(${SAIDA('l')}) AS dia,
      MAX(1, COALESCE((SELECT SUM(i.qtd) FROM lote_item i WHERE i.lote_id=l.id),1)) AS pecas
    FROM lote l
    WHERE l.estagio='carregado' AND l.despachar_em IS NOT NULL
      AND ${SAIDA('l')} IS NOT NULL
      AND l.despachar_em > date(${SAIDA('l')})
      AND date(${SAIDA('l')}) >= date('now','localtime',?)`).all('-'+(n-1)+' day');
  const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
  const r = { hoje:{pecas:0,caixas:0,agencia:0,coleta:0}, periodo:{dias:n,pecas:0,caixas:0} };
  for(const l of linhas){
    r.periodo.pecas += l.pecas; r.periodo.caixas++;
    if(l.dia === hoje){
      r.hoje.pecas += l.pecas; r.hoje.caixas++;
      if(l.coleta) r.hoje.coleta += l.pecas; else r.hoje.agencia += l.pecas;
    }
  }
  return r;
}

/* A CONFERENCIA DA PILHA (spec SAIDA-E-DUPLA-CONFERENCIA, fase 2, 26/09/2026).
   Dupla conferencia sao duas contagens por caixa: a impressao da etiqueta de
   venda (bipe 1, `impresso_por`) e a conferencia na area de expedicao (bipe 2,
   `conferido_por`). Nesta fase o bipe 2 e o bipe que o Carregamento ja tinha —
   opcao A, decidida pelo dono: na agencia conferir e por no carro seguem sendo
   o mesmo bipe ate a fase 4, que os separa. O que nasce aqui e a CONTA:

       impressas hoje 70 · conferidas 68 · faltam 2   (com nome de cada uma)

   O UNIVERSO E O DIA DA IMPRESSAO (`embalado_em`), porque e isso que torna a
   conta verificavel caixa a caixa: impressas = conferidas + faltam, sempre.
   A caixa impressa num dia anterior e ainda nao conferida NAO some (armadilha
   #9): sai numa lista a parte, `anteriores`, em cima e marcada.

   A ADIANTADA ENTRA NA PILHA (decisao 4 da spec): esta fisicamente na area e
   o motorista pode leva-la. Sai marcada, com a data do despacho.

   "SEM SEGUNDA PESSOA" E MARCA, NUNCA TRAVA (decisao 2): quem imprimiu e quem
   conferiu sao o mesmo nome. Travar, com pouca gente na expedicao, ensinaria
   a entrar com o login do colega — e ai o registro mentiria (armadilha #6).
   Caixa sem um dos dois nomes (impressa antes da fase 1, ou sem ninguem
   logado) e "sem registro": nao se sabe, e nao-saber nao vira acusacao. */
const CONFERIDA = "(conferido_em IS NOT NULL OR estagio='carregado')";
const PILHA_HOJE = "estagio IN ('embalado','carregado') AND date(embalado_em)=date('now','localtime')";
const nomeIgual = (a, b) => String(a||'').trim().toLowerCase() === String(b||'').trim().toLowerCase();
function pilhaDaArea(db){
  const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
  const cols = 'id, codigo, buyer, nf, despachar_em, modalidade, embalado_em, impresso_por, conferido_por';
  const doDia = db.prepare(`SELECT ${cols}, ${CONFERIDA} AS conferida FROM lote
    WHERE ${PILHA_HOJE} ORDER BY embalado_em, id`).all();
  const anteriores = db.prepare(`SELECT ${cols} FROM lote
    WHERE estagio='embalado' AND conferido_em IS NULL
      AND (embalado_em IS NULL OR date(embalado_em) < date('now','localtime'))
    ORDER BY embalado_em, id`).all();
  const marca = v => ({ id:v.id, codigo:v.codigo, buyer:v.buyer, nf:v.nf,
    despachar_em:v.despachar_em, embalado_em:v.embalado_em,
    coleta: ehColeta(v), adiantada: futuro(v, hoje) });
  const conferidas = doDia.filter(v => v.conferida);
  const temNome = s => String(s||'').trim() !== '';
  const semSegunda = conferidas.filter(v => temNome(v.impresso_por) && temNome(v.conferido_por)
                                        && nomeIgual(v.impresso_por, v.conferido_por));
  const semRegistro = conferidas.filter(v => !temNome(v.impresso_por) || !temNome(v.conferido_por));
  const faltam = doDia.filter(v => !v.conferida).map(marca);
  return {
    hoje: { impressas: doDia.length, conferidas: conferidas.length, faltam: faltam.length,
            sem_segunda: semSegunda.length, sem_registro: semRegistro.length },
    faltam,
    anteriores: anteriores.map(marca),
    sem_segunda: semSegunda.map(v => Object.assign(marca(v), { quem: String(v.conferido_por).trim() }))
  };
}

/* ACHAR O VOLUME PELO CODIGO BIPADO — dono unico (26/09/2026).
   O bipe do carregamento e o bipe das sobras da saida do caminhao fazem a
   mesma pergunta; duas copias achariam caixas diferentes para o mesmo codigo.
   PROCURA PELO CODIGO, NAO PELO DIA: enquanto isto era `WHERE data=hoje`, o
   volume embalado ontem respondia "nao encontrado" com a caixa na mao (#9).
   A busca larga primeiro (a chave e o codigo do ML, que e unico) e so depois
   confere o codigo exato. Devolve TODOS os que batem: entre duplicatas (§5,
   os fantasmas) quem chama decide qual manda. */
function acharVolumes(db, code){
  code = String(code||'').trim();
  if(!code) return [];
  const digits = code.replace(/\D/g,'');
  const jid = (code.match(/"id"\s*:\s*"?(\d+)/)||[])[1] || null;
  const cands = [code, digits, jid].filter(Boolean);
  const vistos = new Set(), achados = [];
  for(const c of cands){
    for(const r of db.prepare('SELECT * FROM lote WHERE packId=? OR venda=? OR codes LIKE ?').all(c,c,'%'+c+'%')){
      if(vistos.has(r.id)) continue;
      vistos.add(r.id); achados.push(r);
    }
  }
  return achados.filter(r => {
    let cs = []; try{ cs = JSON.parse(r.codes||'[]'); }catch(e){}
    cs = cs.concat([r.packId, r.venda].filter(Boolean));
    return cs.some(c => cands.includes(String(c)));
  });
}

/* A SAIDA DO CAMINHAO DA COLETA (spec SAIDA-E-DUPLA-CONFERENCIA, fase 3).
   Uma saida por caminhao, e ela so olha o que estava no canto e AINDA NAO
   TINHA SAIDA — o "Fechar coleta" de 10/09 comparava o canto inteiro, e um dia
   sem fechar estragava todos os seguintes:

       sairam = NA_SAIDA − sobras + "foi no caminhao"

   NA_SAIDA e o AGUARDA_CAMINHAO (a regua do card da tela) sem saida gravada.
   ATE A FASE 4 A AGENCIA FICA DE FORA DA CONTA: com o bipe unico (opcao A) a
   caixa de agencia conferida ja esta no CARRO, nao no chao da area — somada
   aqui, o operador teria que bipar como "sobra" uma caixa que nem esta ali. */
const NA_SAIDA = AGUARDA_CAMINHAO + " AND saida_id IS NULL";
function naSaida(db){
  const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
  return db.prepare(`SELECT id,codigo,buyer,nf,modalidade,despachar_em,carregado_em,impresso_por,conferido_por
    FROM lote WHERE ${NA_SAIDA} ORDER BY carregado_em, id`).all()
    .map(v => Object.assign(v, { antiga: !!(v.carregado_em && String(v.carregado_em).slice(0,10) < hoje) }));
}
/* "FOI NO CAMINHAO": a caixa com etiqueta impressa, FORA da conta, que o
   motorista levou mesmo assim — a de agencia na area (conferida ou nao) e a
   de coleta que foi direto da impressora. E a troca de porta da decisao 6:
   nao e erro, e o motorista levar o que esta pronto. `pendente` nunca: sem
   etiqueta a caixa nao baixou do estoque (§5, #27).
   Desde a fase 4 (decisao D2, 26/09/2026) a agencia conferida FICA NA AREA
   (`embalado` com `conferido_em`), e por isso esta aqui e nao na conta do
   caminhao: somada, obrigaria a bipar como sobra cada caixa de agencia parada
   no chao, a cada caminhao. A que ja esta no CARRO (`carregado`) nao entra:
   o caminhao nao leva o que esta dentro do carro. */
const PODE_TER_IDO = "estagio='embalado'";

/* A VIAGEM A AGENCIA (spec SAIDA-E-DUPLA-CONFERENCIA, fase 4, 26/09/2026).
   A caixa de agencia tem dois bipes (decisao D1): a area confere, o carro
   carrega. PRONTA_PRO_CARRO e o que esta na area esperando o carro: agencia,
   com etiqueta, conferida. O carro so aceita isto — e a caixa de coleta do
   canto, que e troca de porta. */
const PRONTA_PRO_CARRO = "estagio='embalado' AND conferido_em IS NOT NULL AND " + AGENCIA();
function podeTerIdo(db){
  return db.prepare(`SELECT id,codigo,buyer,nf,modalidade,estagio,despachar_em FROM lote
    WHERE ${PODE_TER_IDO} ORDER BY buyer, id`).all()
    .map(v => Object.assign(v, { coleta: ehColeta(v) }));
}

module.exports = { PRA_CARREGAR, DO_DIA, ORDEM_CARGA, atrasado, futuro,
                   COLETA, AGENCIA, ehColeta, AGUARDA_CAMINHAO,
                   SAIDA, saidasAdiantadas, pilhaDaArea, nomeIgual,
                   acharVolumes, NA_SAIDA, naSaida, PODE_TER_IDO, podeTerIdo, PRONTA_PRO_CARRO };
