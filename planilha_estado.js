/* QUE LINHA DA PLANILHA DO ML E O QUE — PLANEJAMENTO-VENDAS-FUTURAS, fase 1.
 *
 * Dono unico da tabela §3-B da spec, que e DECISAO DO DONO (07/11/2026). Ela
 * foi tirada do relatorio real de 07/11/2026 09:59 (3.326 linhas, 40 estados
 * contando cada variacao de dia da semana): nao reclassifique estado nenhum
 * por aqui sem uma linha nova em docs/DECISOES.md.
 *
 *   grupo      venda futura   media   data de envio
 *   fabrica        sim         sim    no Estado · na Descricao · dia seguinte
 *                                         ("coleta de amanha" e "Etiqueta pronta
 *                                         para impressao": 08/11/2026)
 *   saiu           nao         sim    —
 *   entregue       nao         sim    —
 *   pos_venda      nao         sim    —   (muda a regra de antes: A4)
 *   cancelada      nao         nao    —
 *   nao_venda      nao         nao    —   (cabecalho de pacote, Estado vazio)
 *   novo           se tem data sim    —   ESTADO NOVO NAO TRAVA: conta como
 *                                         venda, e como futura se trouxer
 *                                         "dia N de mes"; o import so avisa
 *
 * ⚠️ So "cancel" cancela VOLUME (cancelada_dominio.js). Aqui a regra e mais
 * estreita de proposito: so os quatro estados da tabela sao "cancelada". Um
 * estado novo com "cancel" no texto e "novo" — conta como venda e aparece no
 * aviso do import, para o dono decidir.
 */

const MESES = { janeiro:1, fevereiro:2, marco:3, 'março':3, abril:4, maio:5,
  junho:6, julho:7, agosto:8, setembro:9, outubro:10, novembro:11, dezembro:12 };
const SEMANA = { domingo:0, segunda:1, 'terça':2, terca:2, quarta:3, quinta:4, sexta:5, 'sábado':6, sabado:6 };

const GRUPOS = ['fabrica', 'saiu', 'entregue', 'pos_venda', 'cancelada', 'nao_venda', 'novo'];
const NOME = { fabrica:'Ainda na fábrica', saiu:'Já saiu, não chegou', entregue:'Entregue',
  pos_venda:'Pós-venda', cancelada:'Cancelada', nao_venda:'Não é venda', novo:'Estado novo' };

const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

function iso(d){
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function deIso(s){ const m = String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2]-1, +m[3]) : null; }
function mais(ref, n){ const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()); d.setDate(d.getDate()+n); return d; }

/* "dia 24 de novembro" -> data, com o ano pela data do RELATORIO (a venda
   futura e sempre de semanas, nunca de meses para tras). */
function dataDoTexto(txt, ref){
  const m = String(txt||'').toLowerCase().match(/dia\s+(\d{1,2})\s+de\s+([a-zç]+)/);
  if(!m || !MESES[m[2]]) return null;
  const dia = +m[1], mes = MESES[m[2]];
  if(dia < 1 || dia > 31) return null;
  let cand = new Date(ref.getFullYear(), mes-1, dia);
  if((cand - ref) / 86400000 < -200) cand = new Date(ref.getFullYear()+1, mes-1, dia);
  if((cand - ref) / 86400000 > 200)  cand = new Date(ref.getFullYear()-1, mes-1, dia);
  return iso(cand);
}

/* "coleta que passara na segunda-feira" -> a proxima segunda A PARTIR da data
   do relatorio; relatorio tirado na segunda e o mesmo dia (a coleta passa hoje). */
function dataDaSemana(txt, ref){
  const s = String(txt||'').toLowerCase();
  if(/(^|[^a-zà-ú])hoje($|[^a-zà-ú])/.test(s)) return iso(ref);
  // `\b` nao fecha depois de "ã" no JavaScript: a fronteira e escrita a mao
  if(/(^|[^a-zà-ú])amanh[ãa]($|[^a-zà-ú])/.test(s)) return iso(mais(ref, 1));
  const m = s.match(/\b(domingo|segunda|terça|terca|quarta|quinta|sexta|sábado|sabado)\b/);
  if(!m) return null;
  const alvo = SEMANA[m[1]];
  return iso(mais(ref, (alvo - ref.getDay() + 7) % 7));
}

/* A tabela §3-B. A ordem importa: o cabecalho de pacote e o vazio antes de
   tudo; cancelada antes de pos-venda. */
function grupoDe(estado){
  const e = norm(estado).toLowerCase();
  if(!e) return 'nao_venda';
  if(/^pacote de \d+ produtos?$/.test(e)) return 'nao_venda';
  if(/^para entregar na coleta do dia \d{1,2} de [a-zç]+$/.test(e)) return 'fabrica';
  if(e === 'pronto para coleta') return 'fabrica';
  /* A planilha da tarde (08/11/2026, 17:34): o ML troca "coleta do dia N" por
     "coleta de amanhã" na véspera, e traz "Etiqueta pronta para impressão".
     As duas são venda ainda na fábrica, para amanhã (o dono, 08/11/2026). */
  if(e === 'para entregar na coleta de amanhã') return 'fabrica';
  if(e === 'etiqueta pronta para impressão') return 'fabrica';
  if(e === 'pronta para emitir nf-e da venda') return 'fabrica';
  if(e === 'a caminho' || e === 'envio reagendado' || e === 'envio atrasado') return 'saiu';
  if(e === 'entregue' || e === 'venda entregue') return 'entregue';
  if(e === 'cancelada pelo comprador' || e === 'venda cancelada. não envie.' ||
     e === 'cancelada pelo mercado livre' || e === 'pacote cancelado pelo mercado livre' ||
     e === 'cancelada') return 'cancelada';   // "Cancelada" sozinha: o dono, 08/11/2026
  /* Pos-venda: devolucao, reclamacao, mediacao, reembolso, "Devolvido no dia
     N", "Pacote nao entregue" — os 26 estados do arquivo de 07/11 (o dono
     confirmou os 26, 07/11/2026). */
  if(/^devolu|^devolvido no dia|^reclama|^media[cç][aã]o|reembols|devolveram|^pacote n[aã]o entregue/.test(e)) return 'pos_venda';
  /* Do relatório das 17:34 de 08/11/2026 (o dono, no mesmo dia). */
  if(/^seu pacote foi devolvido|^venda n[aã]o entregue$/.test(e)) return 'pos_venda';
  return 'novo';
}

/* classificar(estado, descricao, ref) — ref = Date do relatorio.
   Devolve { grupo, conhecido, media, futura, data_envio, data_confirmar }. */
function classificar(estado, descricao, ref, opcoes){
  const g = grupoDe(estado);
  const r = { grupo:g, conhecido: g !== 'novo', media: g !== 'cancelada' && g !== 'nao_venda',
              futura:false, data_envio:null, data_confirmar:0 };
  const e = norm(estado).toLowerCase();
  let proximaColeta = false;
  if(g === 'fabrica'){
    r.futura = true;
    if(e === 'para entregar na coleta de amanhã') r.data_envio = iso(mais(ref, 1));
    else if(e.startsWith('para entregar')) r.data_envio = dataDoTexto(estado, ref);
    else if(e === 'pronto para coleta' || e === 'etiqueta pronta para impressão'){
      if(!/pr[oó]xima coleta/.test(norm(descricao).toLowerCase())) r.data_envio = dataDaSemana(descricao, ref);
      /* com "próxima coleta" na frase, o dia da semana que ela cita é o da
         coleta que PASSOU (③ REVISÃO) — quem manda é a próxima coleta, abaixo */
      else proximaColeta = true;
    }
    /* "O pacote não estava pronto quando a coleta de 10:15 às 12:15 passou. Por
       favor, entregue o pacote na próxima coleta." (relatório das 10:53 de
       09/11/2026): sem dia. Decisão do dono (a): a próxima coleta LANÇADA na
       206 depois da hora do relatório — quem sabe é o coleta_horario.js, que o
       import passa em `opcoes.proximaColeta`. Sem resposta, o dia do
       relatório, "a confirmar": na dúvida, mais cedo, nunca depois. */
    if(proximaColeta){
      const pc = opcoes && typeof opcoes.proximaColeta === 'function' ? opcoes.proximaColeta() : null;
      if(pc && pc.data){ r.data_envio = pc.data; r.data_confirmar = pc.confirmar ? 1 : 0; }
      else { r.data_envio = iso(ref); r.data_confirmar = 1; }
    }
    /* NF a emitir ainda nao tem data: fica no dia seguinte, "data a confirmar".
       O Pronto para coleta sem dia na Descricao tambem — nunca some. */
    if(!r.data_envio){ r.data_envio = iso(mais(ref, 1)); r.data_confirmar = 1; }
  } else if(g === 'novo'){
    const d = dataDoTexto(estado, ref);
    if(d){ r.futura = true; r.data_envio = d; }
  }
  return r;
}

/* A data e hora do relatorio: o titulo ("Status das suas vendas em 7 de
   novembro de 2026, às 09:59 hs.") ou o nome do arquivo
   ("..._2026-11-07_09-59hs_..."). Sem nenhum dos dois, null. */
function dataDoRelatorio(linhas, nomeArquivo){
  for(const l of (linhas || []).slice(0, 12)){
    for(const c of (l || [])){
      const m = String(c||'').toLowerCase().match(/vendas em (\d{1,2}) de ([a-zç]+) de (\d{4}),? às (\d{1,2}):(\d{2})/);
      if(m && MESES[m[2]]) return { data: m[3]+'-'+String(MESES[m[2]]).padStart(2,'0')+'-'+m[1].padStart(2,'0'),
                                    hora: m[4].padStart(2,'0')+':'+m[5] };
    }
  }
  const n = String(nomeArquivo||'').match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})hs/);
  if(n) return { data: n[1]+'-'+n[2]+'-'+n[3], hora: n[4]+':'+n[5] };
  return null;
}

/* As colunas pelo cabecalho ("N.º de venda" ... ), cada uma na PRIMEIRA vez
   que aparece — o relatorio tem "Estado" de novo no endereco e tres
   "Unidades". Sem cabecalho, as posicoes do relatorio de hoje (1-based:
   1, 2, 4, 5, 6, 8, 23). */
const PADRAO = { venda:0, data:1, estado:3, descricao:4, pacote:5, unidades:7, sku:22 };
const CABECALHO = { venda:'n.º de venda', data:'data de venda', estado:'estado',
  descricao:'descrição do status', pacote:'pacote de diversos produtos', unidades:'unidades', sku:'sku' };
function colunas(linhas){
  for(const l of (linhas || []).slice(0, 12)){
    const cel = (l || []).map(c => norm(c).toLowerCase());
    if(cel.indexOf(CABECALHO.venda) < 0) continue;
    const col = {};
    for(const k in PADRAO){ const i = cel.indexOf(CABECALHO[k]); col[k] = i >= 0 ? i : PADRAO[k]; }
    return col;
  }
  return Object.assign({}, PADRAO);
}

/* Unidades: "1.0" -> 1. Vazio ou impossivel conta 1 — a linha e uma venda. */
function unidades(v){
  const n = Math.round(parseFloat(String(v == null ? '' : v).replace(',', '.')));
  return isFinite(n) && n > 0 ? n : 1;
}

module.exports = { classificar, grupoDe, dataDoRelatorio, colunas, unidades, GRUPOS, NOME, iso, deIso, mais };
