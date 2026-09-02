// ═══════════════════════════════════════════════════════════════════════
// O ALGORITMO. Funcao PURA: numeros entram, numeros saem.
//
// Sem banco, sem HTTP, sem Express, sem require de nada que tenha estado.
// E o unico jeito de testa-lo de verdade — e ele e a unica parte dificil do
// modulo. Se este arquivo estiver certo, o resto e CRUD.
// ═══════════════════════════════════════════════════════════════════════
//
// A MECANICA FISICA, que e o que quase todo sistema de corte erra:
//
//   A largura da peca e cortada no sentido da LARGURA DA BOBINA.
//   A altura da peca e o que CORRE NO ROLO.
//
// Varias pecas ficam lado a lado na largura, e o rolo baixa so os metros
// lineares puxados. Por isso bobina mais ESTREITA pode aproveitar melhor, e
// por isso o sistema simula todas as larguras que existem em vez de escolher
// a mais larga por padrao.
//
//   3 pecas de 0,90 x 2,50        soma das larguras = 2,70
//     BOBINA 3,00          BOBINA 2,50           BOBINA 2,00
//     as 3 lado a lado     2 + 1 embaixo         2 + 1 embaixo
//     puxa 2,50 m          puxa 5,00 m           puxa 5,00 m
//     7,50 m2              12,50 m2              10,00 m2
//
// VOCABULARIO (use estes nomes; sao os da fabrica)
//   faixa         uma puxada do rolo. Largura = largura da bobina.
//                 Altura = a MAIOR altura entre as pecas que ela carrega
//   encaixe       as pecas posicionadas lado a lado dentro da faixa
//   tira lateral  o que resta da largura da faixa depois das pecas
//   resto de pe   o que resta embaixo de uma peca mais baixa que a faixa
//   consumo       soma das alturas das faixas, em metro linear

const TOL=0.001;                      // 1 mm. Medida e REAL: 0,1+0,2 nao da 0,3
const cabe=(a,b)=>a<=b+TOL;
const atinge=(a,minimo)=>a>=minimo-TOL;
const arred=v=>Math.round(v*1e6)/1e6; // corta o ruido do ponto flutuante

const PADRAO={margem:0, larguraMinimaSobra:0.80, pesoSobra:0.50, alturaMinimaSobra:0};

/**
 * @param {Array<{id, largura, altura}>} pecas
 * @param {Array<{id, fonte:'rolo'|'sobra', largura, alturaMax}>} fontes
 *        rolo  -> alturaMax = saldo do rolo (quanto ainda da para puxar)
 *        sobra -> alturaMax = altura da sobra (retangulo finito)
 *        A ORDEM da lista e a ordem de tentativa. Quem decide essa ordem e
 *        dominio/plano.js: sobra antes de rolo, sempre.
 * @param {{margem, larguraMinimaSobra, pesoSobra, alturaMinimaSobra}} params
 */
function planejar(pecas, fontes, params){
  const p={...PADRAO, ...(params||{})};

  // 1. ORDENA POR ALTURA DECRESCENTE.
  // A peca mais alta primeiro, porque e ela que define a altura da faixa.
  // Com a lista nesta ordem, toda peca que chega depois cabe na altura da
  // faixa aberta — nunca e preciso conferir isso de novo.
  const fila=(pecas||[]).map((x,i)=>({
    id:x.id===undefined?i:x.id, largura:+x.largura, altura:+x.altura, i
  })).sort((a,b)=> b.altura-a.altura || b.largura-a.largura || a.i-b.i);

  const faixas=[];
  const restantes=new Set(fila.map(x=>x.id));

  for(const fonte of (fontes||[])){
    const minhas=[];                        // faixas abertas NESTA fonte
    let alturaUsada=0;                      // quanto desta fonte ja foi puxado

    for(const peca of fila){
      if(!restantes.has(peca.id)) continue;
      if(!cabe(peca.largura,fonte.largura)) continue;   // nao cabe na largura

      // 2a. tenta uma faixa ja aberta desta fonte
      let alvo=minhas.find(f=>cabe(f.larguraUsada+(f.pecas.length?p.margem:0)+peca.largura,
                                   fonte.largura));
      // 2b. nao coube: abre faixa nova, se ainda ha altura nesta fonte
      if(!alvo){
        if(!cabe(alturaUsada+peca.altura,fonte.alturaMax)) continue;
        alvo={
          fonte:fonte.fonte, fonteId:fonte.id,
          larguraDisponivel:fonte.largura,
          altura:peca.altura,               // 3. a altura da faixa e a da PRIMEIRA peca
          larguraUsada:0, pecas:[]
        };
        minhas.push(alvo); faixas.push(alvo);
        alturaUsada=arred(alturaUsada+peca.altura);
      }
      const x=alvo.pecas.length?arred(alvo.larguraUsada+p.margem):0;
      alvo.pecas.push({id:peca.id, largura:peca.largura, altura:peca.altura, x});
      alvo.larguraUsada=arred(x+peca.largura);
      restantes.delete(peca.id);
    }

    fonte._alturaUsada=alturaUsada;         // guardado para o resto de pe da sobra
  }

  // 4. O QUE NAO COUBE VOLTA MARCADO, COM O MOTIVO. Nunca some em silencio.
  const maiorLargura=(fontes||[]).reduce((m,f)=>Math.max(m,f.largura),0);
  const naoAlocadas=fila.filter(x=>restantes.has(x.id)).map(x=>({
    id:x.id, largura:x.largura, altura:x.altura,
    motivo: !cabe(x.largura,maiorLargura)
      ? (fontes&&fontes.length
          ? 'nenhuma bobina em estoque tem largura ≥ '+fmt(x.largura)
          : 'nao ha bobina nem sobra deste tecido em estoque')
      : 'nao sobrou material: a altura disponivel nao cobre '+fmt(x.altura)+' m'
  }));

  // ── OS RESTOS DE CADA FAIXA ──────────────────────────────────────────
  //   tira lateral = (largura da faixa - largura usada) x altura da faixa
  //   resto de pe  = largura da peca x (altura da faixa - altura da peca)
  const restos=[];
  faixas.forEach((f,idx)=>{
    f.ordem=idx;
    const sobrouLargura=arred(f.larguraDisponivel-f.larguraUsada);
    if(sobrouLargura>TOL)
      restos.push({de:'tira_lateral', faixa:idx, largura:sobrouLargura, altura:f.altura});
    f.pecas.forEach(pc=>{
      const pe=arred(f.altura-pc.altura);
      if(pe>TOL) restos.push({de:'resto_de_pe', faixa:idx, largura:pc.largura, altura:pe});
    });
  });

  // ── O CONSUMO, QUE E DIFERENTE EM CADA FONTE ─────────────────────────
  // Rolo: baixa a soma das alturas das faixas, em metro linear.
  // Sobra: sai INTEIRA (R12), mesmo carregando varias pecas — entao o que ela
  // custa e a area toda dela, e o que ficou embaixo da ultima faixa e resto
  // como qualquer outro.
  let consumoLinear=0, consumoM2=0;
  for(const fonte of (fontes||[])){
    const usada=fonte._alturaUsada||0;
    delete fonte._alturaUsada;              // a funcao e pura: nao suja a entrada
    if(usada<=TOL) continue;
    if(fonte.fonte==='sobra'){
      consumoM2=arred(consumoM2+fonte.largura*fonte.alturaMax);
      const pe=arred(fonte.alturaMax-usada);
      if(pe>TOL) restos.push({de:'resto_de_pe', fonteId:fonte.id, largura:fonte.largura, altura:pe});
    } else {
      consumoLinear=arred(consumoLinear+usada);
      consumoM2=arred(consumoM2+usada*fonte.largura);
    }
  }

  // ── RESTO VIRA SOBRA OU REFUGO ───────────────────────────────────────
  // A regra e UMA SO, para as duas origens: resto com largura >= o minimo
  // vira sobra com etiqueta, venha do rolo ou de outra sobra. Os 80 cm valem
  // so para a LARGURA — altura nao tem minimo (alturaMinimaSobra nasce 0).
  const sobrasGeradas=[], refugos=[];
  for(const r of restos){
    const area=arred(r.largura*r.altura);
    if(area<=TOL) continue;
    const item={...r, area};
    if(atinge(r.largura,p.larguraMinimaSobra)&&atinge(r.altura,p.alturaMinimaSobra))
      sobrasGeradas.push(item);
    else refugos.push(item);
  }

  const areaPecas=arred(faixas.reduce((s,f)=>
    s+f.pecas.reduce((t,pc)=>t+pc.largura*pc.altura,0),0));
  const areaSobras=arred(sobrasGeradas.reduce((s,r)=>s+r.area,0));
  const areaRefugo=arred(refugos.reduce((s,r)=>s+r.area,0));

  // ── O CRITERIO ───────────────────────────────────────────────────────
  //   desperdicio = m2 consumidos - m2 das pecas - (m2 das sobras x pesoSobra)
  // pesoSobra e a unica variavel de julgamento do modulo: responde se o
  // retalho que vai pra prateleira volta a ser usado, ou encalha.
  const desperdicio=arred(consumoM2-areaPecas-areaSobras*p.pesoSobra);

  return {faixas, pecasNaoAlocadas:naoAlocadas,
    consumoLinear, consumoM2, areaPecas, areaSobras, areaRefugo,
    sobrasGeradas, refugos, desperdicio};
}

/**
 * Simula CADA largura de bobina que existe em estoque e ordena pelo criterio.
 * Nunca escolhe a mais larga por padrao — a de 2,00 bate a de 2,50 no exemplo
 * do 6.4, e e justamente por isso que a simulacao existe.
 *
 * Empate no desperdicio: vence o menor consumo linear (puxar menos rolo).
 */
function simularLarguras(pecas, larguras, params, alturaMax){
  const opcoes=(larguras||[]).map(largura=>{
    const r=planejar(pecas,[{id:'bobina-'+largura, fonte:'rolo', largura,
      alturaMax:alturaMax===undefined?Infinity:alturaMax}],params);
    return {largura, ...r};
  });
  opcoes.sort((a,b)=>
    (a.pecasNaoAlocadas.length-b.pecasNaoAlocadas.length) ||   // primeiro: quem aloca mais
    (a.desperdicio-b.desperdicio) ||
    (a.consumoLinear-b.consumoLinear) ||
    (a.largura-b.largura));
  return opcoes;
}

const fmt=v=>(Math.round(v*100)/100).toFixed(2).replace('.',',');

module.exports={planejar, simularLarguras, TOL, PADRAO};
