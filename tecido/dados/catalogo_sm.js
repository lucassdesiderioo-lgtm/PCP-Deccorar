// As oito tabelas do catalogo do sob medida. SQL e so isso — nenhuma regra,
// nenhum `if` de negocio. Quem decide e dominio/catalogo_sm.js.
const db=require('../nucleo/db');

/* A colecao de venda le o nome DE LA, do cadastro de tecido: ela aponta, nao
   duplica. E a linha vem junto porque a abertura ja pendura nela — e por
   isso que o modelo nao precisa guardar linha nenhuma. */
const COLECAO=`c.*, a.nome AS colecao_nome, a.ativo AS colecao_ativa,
  l.id AS linha_id, l.nome AS linha_nome, l.ativo AS linha_ativa,
  CASE WHEN c.ativo=1 AND a.ativo=1 AND l.ativo=1 THEN 1 ELSE 0 END AS disponivel`;
const DE_COLECAO=`FROM sm_modelo_colecao c
  JOIN abertura a ON a.id=c.abertura_id
  JOIN linha l ON l.id=a.linha_id`;

const um=(sql,...v)=>db.prepare(sql).get(...v);
const varios=(sql,...v)=>db.prepare(sql).all(...v);

module.exports={
  // ── Modelo ──────────────────────────────────────────────────────────────
  modelos:()=>varios('SELECT * FROM sm_modelo ORDER BY ordem, nome'),
  modelo:id=>um('SELECT * FROM sm_modelo WHERE id=?',id),
  modeloPorNome:nome=>um('SELECT * FROM sm_modelo WHERE nome=? COLLATE NOCASE',nome),
  criarModelo(d){
    const r=db.prepare(`INSERT INTO sm_modelo(nome,largura_max_mm,altura_max_mm,m2_max_mm2,
      m2_min_faturado_mm2,ordem,criado_por) VALUES(?,?,?,?,?,?,?)`)
      .run(d.nome,d.largura_max_mm||null,d.altura_max_mm||null,d.m2_max_mm2||null,
           d.m2_min_faturado_mm2,d.ordem||0,d.criado_por||null);
    return this.modelo(r.lastInsertRowid);
  },

  // ── Colecao de venda ────────────────────────────────────────────────────
  colecoes:modelo_id=>varios('SELECT '+COLECAO+' '+DE_COLECAO+
    ' WHERE c.modelo_id=? ORDER BY l.nome, a.ordem, a.nome',modelo_id),
  colecao:id=>um('SELECT '+COLECAO+' '+DE_COLECAO+' WHERE c.id=?',id),
  colecaoDe:(modelo_id,abertura_id)=>um('SELECT '+COLECAO+' '+DE_COLECAO+
    ' WHERE c.modelo_id=? AND c.abertura_id=?',modelo_id,abertura_id),
  criarColecao(d){
    const r=db.prepare(`INSERT INTO sm_modelo_colecao(modelo_id,abertura_id,preco_m2_centavos,
      largura_max_mm,altura_max_mm,m2_max_mm2,m2_min_faturado_mm2,ordem)
      VALUES(?,?,?,?,?,?,?,?)`).run(d.modelo_id,d.abertura_id,
      d.preco_m2_centavos==null?null:d.preco_m2_centavos,
      d.largura_max_mm==null?null:d.largura_max_mm,
      d.altura_max_mm==null?null:d.altura_max_mm,
      d.m2_max_mm2==null?null:d.m2_max_mm2,
      d.m2_min_faturado_mm2==null?null:d.m2_min_faturado_mm2, d.ordem||0);
    return this.colecao(r.lastInsertRowid);
  },
  /* ⚠️ CAMPO AUSENTE NAO E CAMPO VAZIO. So entra no UPDATE o que o chamador
     mandou — e a divida 15 do CLAUDE.md (o POST /api/skus que zerava o
     estoque quando o corpo nao trazia o campo) evitada de proposito. */
  atualizarColecao(id,d){
    const cols=['preco_m2_centavos','largura_max_mm','altura_max_mm','m2_max_mm2',
                'm2_min_faturado_mm2','ordem','ativo'];
    const campos=[],vals=[];
    cols.forEach(c=>{ if(d[c]!==undefined){ campos.push(c+'=?'); vals.push(d[c]); } });
    if(campos.length) db.prepare('UPDATE sm_modelo_colecao SET '+campos.join(', ')+' WHERE id=?').run(...vals,id);
    return this.colecao(id);
  },

  // ── Cor de acessorio ────────────────────────────────────────────────────
  coresAcessorio:modelo_id=>varios(`SELECT ca.*, c.nome AS cor_nome, c.ativo AS cor_ativa
    FROM sm_modelo_cor_acessorio ca JOIN cor c ON c.id=ca.cor_id
    WHERE ca.modelo_id=? ORDER BY ca.ordem, c.nome`,modelo_id),
  corAcessorio:(modelo_id,cor_id)=>um(`SELECT ca.*, c.nome AS cor_nome, c.ativo AS cor_ativa
    FROM sm_modelo_cor_acessorio ca JOIN cor c ON c.id=ca.cor_id
    WHERE ca.modelo_id=? AND ca.cor_id=?`,modelo_id,cor_id),
  criarCorAcessorio(d){
    db.prepare('INSERT OR IGNORE INTO sm_modelo_cor_acessorio(modelo_id,cor_id,ordem) VALUES(?,?,?)')
      .run(d.modelo_id,d.cor_id,d.ordem||0);
    return this.corAcessorio(d.modelo_id,d.cor_id);
  },

  // ── Componente ──────────────────────────────────────────────────────────
  componentes:()=>varios('SELECT * FROM sm_componente ORDER BY ordem, nome'),
  componente:id=>um('SELECT * FROM sm_componente WHERE id=?',id),
  componentePorChave:chave=>um('SELECT * FROM sm_componente WHERE chave=? COLLATE NOCASE',chave),
  atualizarComponente(id,d){
    const cols=['nome','setor','gera_etiqueta','eh_kit','usa_faixa_suporte','codigo_barras',
                'preco_centavos','unidade_cobranca','largura_max_mm','altura_max_mm','ordem','ativo'];
    const campos=[],vals=[];
    cols.forEach(c=>{ if(d[c]!==undefined){ campos.push(c+'=?'); vals.push(d[c]); } });
    if(campos.length) db.prepare('UPDATE sm_componente SET '+campos.join(', ')+' WHERE id=?').run(...vals,id);
    return this.componente(id);
  },

  // ── Escada de tubos ─────────────────────────────────────────────────────
  degraus:modelo_id=>varios('SELECT * FROM sm_degrau_tubo WHERE modelo_id=? ORDER BY ordem',modelo_id),
  degrausAtivos:modelo_id=>varios('SELECT * FROM sm_degrau_tubo WHERE modelo_id=? AND ativo=1 ORDER BY ordem',modelo_id),
  degrau:id=>um('SELECT * FROM sm_degrau_tubo WHERE id=?',id),
  criarDegrau(d){
    const r=db.prepare(`INSERT INTO sm_degrau_tubo(modelo_id,ordem,nome,largura_max_mm,m2_max_mm2,
      desconto_mm,acrescimo_altura_tecido_mm,aceita_bando,aceita_reducao) VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(d.modelo_id,d.ordem,d.nome,d.largura_max_mm,d.m2_max_mm2,d.desconto_mm,
           d.acrescimo_altura_tecido_mm,d.aceita_bando?1:0,d.aceita_reducao?1:0);
    return this.degrau(r.lastInsertRowid);
  },
  atualizarDegrau(id,d){
    const cols=['ordem','nome','largura_max_mm','m2_max_mm2','desconto_mm',
                'acrescimo_altura_tecido_mm','aceita_bando','aceita_reducao','ativo'];
    const campos=[],vals=[];
    cols.forEach(c=>{ if(d[c]!==undefined){ campos.push(c+'=?'); vals.push(d[c]); } });
    if(campos.length) db.prepare('UPDATE sm_degrau_tubo SET '+campos.join(', ')+' WHERE id=?').run(...vals,id);
    return this.degrau(id);
  },

  // ── Ficha ───────────────────────────────────────────────────────────────
  ficha:modelo_id=>varios(`SELECT f.*, c.chave, c.nome AS componente_nome, c.setor,
      c.gera_etiqueta, c.eh_kit, c.usa_faixa_suporte, c.codigo_barras,
      c.preco_centavos, c.unidade_cobranca,
      c.largura_max_mm AS componente_largura_max_mm,
      c.altura_max_mm AS componente_altura_max_mm, c.ativo AS componente_ativo
    FROM sm_ficha_linha f JOIN sm_componente c ON c.id=f.componente_id
    WHERE f.modelo_id=? ORDER BY f.ordem, c.nome`,modelo_id),
  fichaLinha:id=>um(`SELECT f.*, c.chave FROM sm_ficha_linha f
    JOIN sm_componente c ON c.id=f.componente_id WHERE f.id=?`,id),
  fichaLinhaDe:(modelo_id,chave,quando)=>um(`SELECT f.*, c.chave FROM sm_ficha_linha f
    JOIN sm_componente c ON c.id=f.componente_id
    WHERE f.modelo_id=? AND c.chave=? COLLATE NOCASE AND f.quando=?`,modelo_id,chave,quando),
  criarFichaLinha(d){
    const r=db.prepare(`INSERT INTO sm_ficha_linha(modelo_id,componente_id,ordem,quando,quantidade,
      ref_largura,ajuste_largura_mm,ref_altura,ajuste_altura_mm,
      consumo_ref_largura,consumo_ajuste_largura_mm,consumo_ref_altura,consumo_ajuste_altura_mm)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(d.modelo_id,d.componente_id,d.ordem,
      d.quando||'sempre',d.quantidade||1,
      d.ref_largura||null,d.ajuste_largura_mm==null?null:d.ajuste_largura_mm,
      d.ref_altura||null,d.ajuste_altura_mm==null?null:d.ajuste_altura_mm,
      d.consumo_ref_largura||null,d.consumo_ajuste_largura_mm==null?null:d.consumo_ajuste_largura_mm,
      d.consumo_ref_altura||null,d.consumo_ajuste_altura_mm==null?null:d.consumo_ajuste_altura_mm);
    return this.fichaLinha(r.lastInsertRowid);
  },
  atualizarFichaLinha(id,d){
    const cols=['ordem','quando','quantidade','ref_largura','ajuste_largura_mm',
                'ref_altura','ajuste_altura_mm','consumo_ref_largura','consumo_ajuste_largura_mm',
                'consumo_ref_altura','consumo_ajuste_altura_mm','ativo'];
    const campos=[],vals=[];
    cols.forEach(c=>{ if(d[c]!==undefined){ campos.push(c+'=?'); vals.push(d[c]); } });
    if(campos.length) db.prepare('UPDATE sm_ficha_linha SET '+campos.join(', ')+' WHERE id=?').run(...vals,id);
    return this.fichaLinha(id);
  },

  // ── Faixas de suporte e regra da reducao ────────────────────────────────
  faixas:modelo_id=>varios('SELECT * FROM sm_faixa_suporte WHERE modelo_id=? ORDER BY largura_max_mm',modelo_id),
  criarFaixa(d){
    const r=db.prepare('INSERT INTO sm_faixa_suporte(modelo_id,largura_max_mm,quantidade) VALUES(?,?,?)')
      .run(d.modelo_id,d.largura_max_mm,d.quantidade);
    return um('SELECT * FROM sm_faixa_suporte WHERE id=?',r.lastInsertRowid);
  },
  apagarFaixa:id=>db.prepare('DELETE FROM sm_faixa_suporte WHERE id=?').run(id),

  reducaoRegra:modelo_id=>um('SELECT * FROM sm_reducao_regra WHERE modelo_id=?',modelo_id),
  gravarReducaoRegra(d){
    db.prepare(`INSERT INTO sm_reducao_regra(modelo_id,m2_acima_mm2,largura_acima_mm)
      VALUES(?,?,?) ON CONFLICT(modelo_id) DO UPDATE SET
      m2_acima_mm2=excluded.m2_acima_mm2, largura_acima_mm=excluded.largura_acima_mm`)
      .run(d.modelo_id,d.m2_acima_mm2==null?null:d.m2_acima_mm2,
           d.largura_acima_mm==null?null:d.largura_acima_mm);
    return this.reducaoRegra(d.modelo_id);
  },

  // ── Historico de preco ──────────────────────────────────────────────────
  registrarPreco:p=>db.prepare(
    'INSERT INTO sm_preco_historico(alvo,alvo_id,de,para,usuario_nome) VALUES(?,?,?,?,?)')
    .run(p.alvo,p.alvo_id,p.de==null?null:p.de,p.para==null?null:p.para,p.usuario_nome||null),
  historicoPreco:(alvo,alvo_id)=>varios(
    'SELECT * FROM sm_preco_historico WHERE alvo=? AND alvo_id=? ORDER BY id DESC',alvo,alvo_id)
};
