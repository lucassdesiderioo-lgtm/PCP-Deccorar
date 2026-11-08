/* QUEM FEZ QUANTO, E EM QUANTO TEMPO (RELATORIOS-UNIFICADOS, fase 3, 08/11/2026).
 *
 * Dono único da produção POR PESSOA. A "Minha produção" (905) e a aba "Por
 * pessoa" da 904 leem daqui. Conta só o que o sistema PROVA, pelo id do login
 * gravado em cada linha (spec QUEM-FEZ-E-REVISAO, §10):
 *
 *   etapa            tabela · coluna de quem fez        tempo
 *   revisadas        revisao.usuario_id                 revisao.segundos
 *   embaladas        montagem.usuario_id                montagem.segundos
 *   etiquetas        lote.impresso_por_id               —
 *   reimpressões     lote_reimpressao.usuario_id        —
 *   conferidas       lote.conferido_por_id              —
 *   devoluções       devolucao.revisado_por_id          —
 *   contagens        inventario_item.por1/2/3_id        —
 *
 * O que parece bug e não é:
 * - SÓ QUANTIDADE E TEMPO (decisão do dono, D3). Peça com problema, revisão
 *   desfeita, bipe recusado e contagem que não bateu NÃO entram.
 * - A LINHA SEM ID NÃO É DE NINGUÉM. Revisão e embalagem ganharam o id em
 *   26/10/2026, o resto em 05/11/2026. O que veio antes sai do período como
 *   "sem registro", e nunca se atribui pelo nome (armadilha #10).
 * - QUEM EMBALOU A CAIXA DE UMA VENDA NÃO EXISTE (§9-B): a embalagem soma
 *   estoque por SKU. Aqui se contam embalagens, nunca "vendas embaladas por".
 * - O TEMPO É MEDIANA, COM O MAIOR AO LADO (a régua do Desempenho das
 *   devoluções e dos indicadores do sob medida): uma revisão esquecida aberta
 *   não esconde as outras. Tempo zero ou vazio fica fora do tempo, e conta na
 *   quantidade.
 * - O MODO TESTE FICA FORA, como em toda conta.
 * - NENHUM VALOR EM REAIS: a aba vai a quem só tem "Ver produção da equipe".
 */

const ETAPAS = [
  { chave:'revisao',     nome:'Revisadas',             tempo:true,
    sql:"SELECT usuario_id u, data d, segundos s FROM revisao WHERE usuario_id IS NOT NULL AND COALESCE(teste,0)=0 AND data BETWEEN ? AND ?" },
  { chave:'embalagem',   nome:'Embaladas',             tempo:true,
    sql:"SELECT usuario_id u, data d, segundos s FROM montagem WHERE usuario_id IS NOT NULL AND COALESCE(teste,0)=0 AND data BETWEEN ? AND ?" },
  { chave:'etiqueta',    nome:'Etiquetas impressas',
    sql:"SELECT impresso_por_id u, date(embalado_em) d FROM lote WHERE impresso_por_id IS NOT NULL AND COALESCE(teste,0)=0 AND date(embalado_em) BETWEEN ? AND ?" },
  { chave:'reimpressao', nome:'Etiquetas reimpressas',
    sql:"SELECT usuario_id u, date(em) d FROM lote_reimpressao WHERE usuario_id IS NOT NULL AND COALESCE(teste,0)=0 AND date(em) BETWEEN ? AND ?" },
  { chave:'conferencia', nome:'Caixas conferidas',
    sql:"SELECT conferido_por_id u, date(conferido_em) d FROM lote WHERE conferido_por_id IS NOT NULL AND COALESCE(teste,0)=0 AND date(conferido_em) BETWEEN ? AND ?" },
  { chave:'devolucao',   nome:'Devoluções recebidas',
    sql:"SELECT revisado_por_id u, data d FROM devolucao WHERE revisado_por_id IS NOT NULL AND COALESCE(teste,0)=0 AND data BETWEEN ? AND ?" },
  /* Cada contagem é uma linha: quem contou a 1ª, a 2ª e a 3ª do mesmo SKU são
     três trabalhos (às vezes de três pessoas). */
  { chave:'contagem',    nome:'Contagens do inventário',
    sql:"SELECT por1_id u, substr(em1,1,10) d FROM inventario_item WHERE por1_id IS NOT NULL AND COALESCE(teste,0)=0 AND substr(em1,1,10) BETWEEN ? AND ? "+
        "UNION ALL SELECT por2_id, substr(em2,1,10) FROM inventario_item WHERE por2_id IS NOT NULL AND COALESCE(teste,0)=0 AND substr(em2,1,10) BETWEEN ? AND ? "+
        "UNION ALL SELECT por3_id, substr(em3,1,10) FROM inventario_item WHERE por3_id IS NOT NULL AND COALESCE(teste,0)=0 AND substr(em3,1,10) BETWEEN ? AND ?" }
];

/* As linhas de uma etapa no período. Tabela ou coluna que não existe (banco
   antigo, módulo que não subiu) devolve vazio — e a etapa diz "sem registro". */
function linhas(db, E, de, ate){
  const args = []; for(let i = 0; i < (E.sql.match(/\?/g) || []).length; i += 2) args.push(de, ate);
  try{ return db.prepare(E.sql).all(...args); }catch(e){ return null; }
}

const mediana = v => { if(!v.length) return null; const a = v.slice().sort((x,y)=>x-y), m = a.length >> 1;
  return a.length % 2 ? a[m] : Math.round((a[m-1] + a[m]) / 2); };

function resumoEtapa(E, ls){
  const tempos = E.tempo ? ls.map(l => +l.s).filter(s => s > 0) : [];
  const o = { chave:E.chave, nome:E.nome, qtd:ls.length };
  if(E.tempo) Object.assign(o, { tempo_mediana:mediana(tempos), tempo_maior:tempos.length ? Math.max(...tempos) : null });
  return o;
}

/* O QUE UMA PESSOA FEZ no período (a "Minha produção"). Etapa em que ela não
   fez nada sai com zero — e a tela esconde a etapa zerada em que ninguém
   trabalha, nunca a de quem trabalhou. */
function daPessoa(db, uid, de, ate){
  return ETAPAS.map(E => {
    const ls = linhas(db, E, de, ate);
    if(ls == null) return { chave:E.chave, nome:E.nome, qtd:null, sem_registro:true };
    return resumoEtapa(E, ls.filter(l => +l.u === +uid));
  });
}

/* A EQUIPE no período. `comNome` decide o que viaja:
   - com nome (`produtividade.nominal`): cada pessoa, com o nome do cadastro;
   - sem nome (`produtividade.equipe`): a DISTRIBUIÇÃO — quantas pessoas, o
     total, e o menor, a mediana e o maior por pessoa. Nenhum id, nenhum nome:
     a ordem das pessoas também identificaria (a "mais rápida" é alguém). */
function daEquipe(db, de, ate, comNome){
  let nomes = {};
  if(comNome){ try{ db.prepare('SELECT id, nome FROM usuarios').all().forEach(u => nomes[u.id] = u.nome); }catch(e){} }
  return ETAPAS.map(E => {
    const ls = linhas(db, E, de, ate);
    if(ls == null) return { chave:E.chave, nome:E.nome, sem_registro:true };
    const por = new Map();
    ls.forEach(l => { const k = +l.u; if(!por.has(k)) por.set(k, []); por.get(k).push(l); });
    const pessoas = Array.from(por, ([u, lp]) => Object.assign({ u }, resumoEtapa(E, lp)));
    const qtds = pessoas.map(p => p.qtd);
    const o = { chave:E.chave, nome:E.nome, total:ls.length, pessoas:pessoas.length,
                por_pessoa: pessoas.length ? { menor:Math.min(...qtds), mediana:mediana(qtds), maior:Math.max(...qtds) } : null };
    if(E.tempo){ const t = ls.map(l => +l.s).filter(s => s > 0); o.tempo_mediana = mediana(t); }
    if(comNome) o.lista = pessoas.map(p => ({ id:p.u, nome:nomes[p.u] || ('pessoa #' + p.u), qtd:p.qtd,
        tempo_mediana:p.tempo_mediana != null ? p.tempo_mediana : undefined, tempo_maior:p.tempo_maior != null ? p.tempo_maior : undefined }))
      .sort((a,b) => b.qtd - a.qtd || String(a.nome).localeCompare(String(b.nome)));
    return o;
  });
}

/* Desde quando cada etapa tem quem fez (a primeira linha com id). */
function desde(db){
  const o = {};
  ETAPAS.forEach(E => { const ls = linhas(db, E, '0000-01-01', '9999-12-31');
    o[E.chave] = ls && ls.length ? ls.map(l => l.d).filter(Boolean).sort()[0] || null : null; });
  return o;
}

module.exports = { ETAPAS, daPessoa, daEquipe, desde, mediana };
