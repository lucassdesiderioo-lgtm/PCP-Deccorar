// O TEMPO DE CORTE POR m² — dono unico desta conta (spec CORTE-EM-ETAPAS,
// fase 5, R19–R21).
//
//   tempo do corte  = do Cortar ao Corte feito, menos as pausas (R19)
//   corte misturado = o tempo e dividido entre os tipos PELA AREA (R20):
//                     se a revenda foi 60% dos m² das pecas, leva 60% do tempo
//   tempo absurdo   = acima de `corteTempoMaxHoras` o corte aparece no
//                     historico e fica FORA da media (R21), e a tela diz quantos
//
// ⚠️ O m² E O DAS PECAS QUE SAIRAM, nao o puxado do rolo. O tempo e o trabalho
// de cortar as pecas; o tecido que virou sobra ou refugo nao e o que se mede
// aqui, e somado ele faria o corte com muito desperdicio parecer mais rapido.
//
// ⚠️ CORTE SEM RELOGIO NAO E CORTE RAPIDO. Os cortes feitos antes da fase 5
// (e os de antes das etapas, R28) nao tem tempo medido: eles ficam fora, contados a parte,
// e nunca entram como zero.
const db=require('../nucleo/db');
const config=require('../nucleo/config');

const TIPOS={cliente_final:'Cliente final', revenda:'Revenda', ml:'ML sob medida', sem_tipo:'Sem tipo'};

function porTipo(diasPedidos){
  const dias=Math.max(1,Math.min(365,Number(diasPedidos)||30));
  const limiteH=config.ler('corteTempoMaxHoras');
  const limite=limiteH*3600;
  const cortes=db.prepare(`SELECT id, tempo_liquido_s, feito_em FROM plano
     WHERE etapa='feito' AND feito_em>=datetime('now','localtime',?) ORDER BY id`).all('-'+dias+' days');

  const acc={}; let considerados=0;
  const semRelogio=[], fora=[];
  const pArea=db.prepare(`SELECT COALESCE(tipo,'sem_tipo') tipo, SUM(largura*altura) area FROM plano_peca
     WHERE plano_id=? AND faixa_id IS NOT NULL GROUP BY COALESCE(tipo,'sem_tipo')`);
  for(const c of cortes){
    if(c.tempo_liquido_s==null){ semRelogio.push(c.id); continue; }
    if(c.tempo_liquido_s>limite){ fora.push({id:c.id, horas:Math.round(c.tempo_liquido_s/360)/10}); continue; }
    const areas=pArea.all(c.id);
    const total=areas.reduce((t,x)=>t+x.area,0);
    if(total<=0) continue;
    considerados++;
    for(const a of areas){
      const g=acc[a.tipo]||(acc[a.tipo]={tipo:a.tipo, nome:TIPOS[a.tipo]||a.tipo, cortes:0, area_m2:0, segundos:0});
      g.cortes++;
      g.area_m2+=a.area;
      g.segundos+=c.tempo_liquido_s*(a.area/total);    // R20 — pela area
    }
  }
  const linhas=Object.values(acc).map(g=>({...g,
    area_m2:Math.round(g.area_m2*1000)/1000,
    minutos:Math.round(g.segundos/60*10)/10,
    min_por_m2:g.area_m2>0?Math.round(g.segundos/60/g.area_m2*100)/100:null}))
    .sort((a,b)=>Object.keys(TIPOS).indexOf(a.tipo)-Object.keys(TIPOS).indexOf(b.tipo));
  linhas.forEach(l=>delete l.segundos);
  return {dias, limite_horas:limiteH, cortes:considerados,
    sem_relogio:semRelogio.length, fora_da_media:fora, linhas};
}

module.exports={porTipo, TIPOS};
