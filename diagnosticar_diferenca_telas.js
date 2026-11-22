#!/usr/bin/env node
/* diagnosticar_diferenca_telas.js — POR QUE A ETIQUETA DE VENDA (201) E A
 * CONFERÊNCIA (202) NÃO DÃO O MESMO NÚMERO, E SE ENTROU VENDA REPETIDA.
 *
 *   cd /opt/expedicao && node diagnosticar_diferenca_telas.js
 *   node diagnosticar_diferenca_telas.js --dias 2026-11-19,2026-11-20
 *   node diagnosticar_diferenca_telas.js --sem-pdf        # não relê os PDFs (mais rápido)
 *   node diagnosticar_diferenca_telas.js /caminho/outro.db
 *
 * ⚠️ SÓ LÊ. Copia o banco com `db.backup()` para uma pasta temporária (nunca
 * `cp`, por causa do WAL — §12) e trabalha na cópia. Os PDFs de `lotes/` são só
 * lidos. Não muda estágio, saldo nem linha nenhuma: pode rodar no expediente.
 *
 * ⚠️ AS RÉGUAS SÃO AS DAS TELAS, E NÃO CÓPIAS: a fila do dia é a do
 * `fila_dia.js`, o que está para conferir é a do `carga.js` (PRA_CARREGAR,
 * futuro, AGUARDA_CAMINHAO, pilhaDaArea) e a leitura do PDF é a do `parse.js`,
 * a mesma do upload. Diagnóstico com régua própria confirmaria com autoridade
 * um número que a tela não usa.
 *
 * Pode rodar fora da pasta do sistema (ex.: /tmp) desde que o diretório atual
 * seja o do sistema: os módulos são carregados a partir dele (ou de PCP_APP).
 *
 * O que ele mostra, nesta ordem:
 *   A. os uploads dos dias: quantas etiquetas cada PDF trouxe, quantas viraram
 *      caixa nova e quantas o upload recusou como repetidas (e de quem);
 *   B. venda, pack, envio ou NF + comprador repetidos em mais de uma caixa, no
 *      histórico inteiro;
 *   C. a conta de hoje por estágio e prazo, em CAIXAS e em PERSIANAS;
 *   D. os números das duas telas e a ponte, caixa a caixa;
 *   E. o que está fora das duas telas (bloqueados, venda sem etiqueta, PDF cuja
 *      conta não fecha, canceladas);
 *   F. a limpeza das caixas que saíram sem conferência, e o que sobrou de antigo.
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const APP = process.env.PCP_APP || process.cwd();
const req = require('module').createRequire(path.join(APP, 'server.js'));

const T = s => console.log(s === undefined ? '' : s);
const linha = () => T('─'.repeat(78));
const tit = s => { T(); linha(); T(s); linha(); };
const pad = (s, n) => String(s == null ? '' : s).padEnd(n);
const num = (s, n) => String(s == null ? '' : s).padStart(n);
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

/* PERSIANAS da caixa: a soma do lote_item; sem lote_item, 1 (§5, R-VOL-02). */
const PER = a => `MAX(1, COALESCE((SELECT SUM(i.qtd) FROM lote_item i WHERE i.lote_id=${a}.id),1))`;

function diagnosticar(db, opts){
  opts = opts || {};
  const { filaDoDia } = req('./fila_dia');
  const CG = req('./carga');
  const hoje = db.prepare("SELECT date('now','localtime') d").get().d;
  const ontem = db.prepare("SELECT date('now','localtime','-1 day') d").get().d;
  const dias = opts.dias && opts.dias.length ? opts.dias : [ontem, hoje];
  const temTabela = n => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(n);
  const pecasDe = db.prepare(`SELECT ${PER('l')} n FROM lote l WHERE l.id=?`);
  const per = id => pecasDe.get(id).n;
  const r = { hoje, dias };

  /* Estágio "de fábrica" de cada caixa, o que a pessoa enxerga. */
  const saidaAberta = new Set(temTabela('saida')
    ? db.prepare('SELECT id FROM saida WHERE fechada_em IS NULL').all().map(s => s.id) : []);
  function situacao(v){
    if(v.estagio === 'pendente') return 'pendente (falta imprimir)';
    if(v.estagio === 'bloqueado') return 'bloqueado';
    if(v.estagio === 'cancelado') return 'cancelado';
    if(v.estagio === 'embalado') return v.conferido_em ? 'conferida, na área (agência)' : 'impressa, sem conferir';
    if(v.estagio === 'carregado'){
      if(CG.ehColeta(v) && !v.retirado_em && !v.saida_id) return 'conferida, no canto da coleta';
      if(v.saida_id && saidaAberta.has(v.saida_id)) return 'no carro (viagem aberta)';
      const d = String(v.saiu_em || v.retirado_em || v.carregado_em || '').slice(0, 10);
      return d === hoje ? 'saiu hoje' : 'saiu antes de hoje';
    }
    return v.estagio || '?';
  }
  const prazo = v => !v.despachar_em ? 'sem data' : v.despachar_em < hoje ? 'atrasado'
    : v.despachar_em === hoje ? 'vence hoje' : 'adiantado';

  /* ── B. REPETIDOS NO HISTÓRICO INTEIRO ─────────────────────────────────── */
  const todos = db.prepare(`SELECT id,data,criado_em,estagio,codigo,buyer,nf,packId,venda,envio,codes,
      despachar_em,modalidade,embalado_em,conferido_em,carregado_em,retirado_em,saiu_em,saida_id,
      COALESCE(teste,0) teste FROM lote ORDER BY id`).all();
  const grupos = {};
  const pôr = (tipo, chave, v) => { if(!chave) return; const k = tipo + ':' + chave;
    (grupos[k] = grupos[k] || { tipo, chave, ids: new Set() }).ids.add(v.id); };
  const porId = new Map(todos.map(v => [v.id, v]));
  for(const v of todos){
    pôr('venda', v.venda, v); pôr('pack', v.packId, v);
    /* o envio: a coluna, ou o número de 10 a 12 dígitos dos `codes` (a régua
       do upload para o volume de antes de 12/11/2026) */
    const env = new Set(); if(v.envio) env.add(String(v.envio));
    if(!v.envio){ let cs = []; try{ cs = JSON.parse(v.codes || '[]'); }catch(e){}
      (Array.isArray(cs) ? cs : []).forEach(c => { if(/^\d{10,12}$/.test(String(c || ''))) env.add(String(c)); }); }
    env.forEach(e => pôr('envio', e, v));
    if(v.nf && v.buyer) pôr('nf+comprador', String(v.nf).trim() + ' · ' + semAcento(v.buyer), v);
  }
  const dup = Object.values(grupos).filter(g => g.ids.size > 1).map(g => {
    const vs = [...g.ids].map(i => porId.get(i));
    const vendas = new Set(vs.map(v => v.venda).filter(Boolean));
    const ativos = vs.filter(v => ['pendente','bloqueado','embalado'].includes(v.estagio) ||
      (v.estagio === 'carregado' && situacao(v) !== 'saiu antes de hoje'));
    const tocaDias = vs.some(v => dias.includes(v.data));
    let leitura = '';
    if(g.tipo === 'pack' && vendas.size === vs.length) leitura = 'mesmo pack com vendas diferentes — pode ser pacote em etiquetas separadas';
    else if(g.tipo === 'nf+comprador' && vendas.size === vs.length) leitura = 'mesma NF e comprador com vendas diferentes — a nota é do pedido (R-PDF-05), pode ser legítimo';
    else leitura = 'MESMA VENDA EM MAIS DE UMA CAIXA';
    return { tipo:g.tipo, chave:g.chave, vols:vs, tocaDias, ativos:ativos.length, leitura,
             certeza: leitura.startsWith('MESMA') };
  });
  /* Um par de caixas aparece em vários grupos (venda e pack iguais): agrupa por
     conjunto de ids para não contar a mesma duplicidade duas vezes. */
  const porConjunto = new Map();
  for(const d of dup){ const k = d.vols.map(v => v.id).sort((a,b)=>a-b).join(',');
    const ja = porConjunto.get(k);
    if(!ja) porConjunto.set(k, Object.assign({}, d, { chaves:[d.tipo + ' ' + d.chave] }));
    else { ja.chaves.push(d.tipo + ' ' + d.chave); if(d.certeza && !ja.certeza){ ja.certeza = true; ja.leitura = d.leitura; } } }
  r.repetidos = [...porConjunto.values()].sort((a,b) => (b.tocaDias-a.tocaDias) || (b.ativos-a.ativos) || (b.certeza-a.certeza));

  /* ── C. A CONTA DE HOJE, POR ESTÁGIO E PRAZO ───────────────────────────── */
  const ph = dias.map(() => '?').join(',');
  const universo = db.prepare(`SELECT l.*, ${PER('l')} pecas FROM lote l
    WHERE COALESCE(l.teste,0)=0 AND (
      l.estagio IN ('pendente','bloqueado','embalado')
      OR l.data IN (${ph}) OR l.despachar_em=?
      OR date(l.embalado_em)=? OR date(COALESCE(l.saiu_em,l.retirado_em,l.carregado_em))=?
      OR date(l.cancelada_em)=?
      OR (l.estagio='carregado' AND ${CG.AGUARDA_CAMINHAO.replace(/\b(modalidade|retirado_em|saida_id|estagio)\b/g,'l.$1')}))
    ORDER BY l.id`).all(...dias, hoje, hoje, hoje, hoje);
  const tab = {};
  for(const v of universo){
    const s = situacao(v), p = prazo(v);
    const x = tab[s] = tab[s] || {};
    const y = x[p] = x[p] || { caixas:0, pecas:0 };
    y.caixas++; y.pecas += v.pecas;
  }
  r.tabela = tab;
  const vh = universo.filter(v => v.despachar_em === hoje && v.estagio !== 'cancelado');
  r.vence_hoje = { caixas: vh.length, pecas: vh.reduce((a, v) => a + v.pecas, 0),
    por_situacao: vh.reduce((m, v) => { const s = situacao(v); m[s] = m[s] || { caixas:0, pecas:0 };
      m[s].caixas++; m[s].pecas += v.pecas; return m; }, {}) };
  const vhCanc = universo.filter(v => v.despachar_em === hoje && v.estagio === 'cancelado');
  r.vence_hoje.canceladas = { caixas: vhCanc.length, pecas: vhCanc.reduce((a, v) => a + v.pecas, 0) };

  /* ── D. AS DUAS TELAS, PELA RÉGUA DELAS ────────────────────────────────── */
  const FILA = filaDoDia('l');
  const fila = db.prepare(`SELECT l.*, ${PER('l')} pecas FROM lote l WHERE ${FILA}`).all();
  const t201 = {
    pra_imprimir: fila.length, pra_imprimir_pecas: fila.reduce((a, v) => a + v.pecas, 0),
    agencia: fila.filter(v => !CG.ehColeta(v)).length, coleta: fila.filter(v => CG.ehColeta(v)).length,
    atrasados: db.prepare(`SELECT COUNT(*) c FROM lote WHERE estagio='pendente' AND despachar_em IS NOT NULL
      AND despachar_em<date('now','localtime')`).get().c,
    futuros: db.prepare(`SELECT COUNT(*) c FROM lote WHERE estagio='pendente' AND despachar_em IS NOT NULL
      AND despachar_em>date('now','localtime')`).get().c,
    impressas_hoje: db.prepare(`SELECT COUNT(*) c FROM lote WHERE embalado_em IS NOT NULL
      AND date(embalado_em)=date('now','localtime')`).get().c
  };
  const pendSemSku = db.prepare(`SELECT COUNT(*) c FROM lote WHERE estagio='pendente' AND codigo IS NULL
    AND (despachar_em IS NULL OR despachar_em<=date('now','localtime'))`).get().c;
  t201.pendente_sem_sku_fora_da_lista = pendSemSku;
  const impHoje = db.prepare(`SELECT l.*, ${PER('l')} pecas FROM lote l WHERE l.embalado_em IS NOT NULL
    AND date(l.embalado_em)=date('now','localtime') ORDER BY l.embalado_em`).all();
  t201.impressas_hoje_pecas = impHoje.reduce((a, v) => a + v.pecas, 0);
  r.t201 = t201;

  /* a lista da 202 — o mesmo recorte do progresso() do carreg_route.js e do
     listaUnica() do carregamento.html */
  const pra = db.prepare(`SELECT l.*, ${PER('l')} pecas FROM lote l WHERE l.${CG.PRA_CARREGAR}`).all();
  const doDia = pra.filter(v => !CG.futuro(v, hoje)), depois = pra.filter(v => CG.futuro(v, hoje));
  const canto = db.prepare(`SELECT l.*, ${PER('l')} pecas FROM lote l
    WHERE ${CG.AGUARDA_CAMINHAO.replace(/\b(modalidade|retirado_em|saida_id|estagio)\b/g,'l.$1')}`).all();
  const esperando = doDia.filter(v => CG.ehColeta(v) || !v.conferido_em);
  const conferidas = doDia.filter(v => !CG.ehColeta(v) && v.conferido_em).concat(canto);
  const pilha = CG.pilhaDaArea(db);
  const soma = l => l.reduce((a, v) => a + v.pecas, 0);
  r.t202 = { esperando: esperando.length, esperando_pecas: soma(esperando),
             conferidas: conferidas.length, conferidas_pecas: soma(conferidas),
             so_despacham_depois: depois.length,
             pilha_impressas: pilha.hoje.impressas, pilha_conferidas: pilha.hoje.conferidas,
             pilha_faltam: pilha.hoje.faltam, pilha_anteriores: pilha.anteriores.length };

  /* a ponte: impressas hoje (201) × lista da 202 */
  const na202 = new Map(esperando.concat(conferidas).map(v => [v.id, v]));
  const impSet = new Set(impHoje.map(v => v.id));
  const fora202 = impHoje.filter(v => !na202.has(v.id)).map(v => Object.assign(v, {
    motivo: v.teste ? 'caixa de teste' : v.estagio === 'cancelado' ? 'cancelada depois da etiqueta'
      : CG.futuro(v, hoje) && v.estagio === 'embalado' ? 'adiantada (despacha ' + v.despachar_em + ') — vai em "só despacham depois"'
      : situacao(v) }));
  const so202 = [...na202.values()].filter(v => !impSet.has(v.id)).map(v => Object.assign(v, {
    motivo: (v.estagio === 'carregado' ? 'no canto da coleta desde ' + String(v.carregado_em || '').slice(0, 10)
      : 'impressa em ' + (String(v.embalado_em || '').slice(0, 10) || '(sem data)')) +
      (v.conferido_em && v.estagio === 'embalado' ? ', conferida em ' + String(v.conferido_em).slice(0, 10) + ' e ainda na área' : '') }));
  r.ponte = { fora202, so202, nas_duas: impHoje.filter(v => na202.has(v.id)).length };

  /* ── E. FORA DAS DUAS TELAS ────────────────────────────────────────────── */
  r.fora = {};
  r.fora.bloqueados = db.prepare(`SELECT l.id,l.data,l.buyer,l.nf,l.codigo,l.despachar_em,l.bloqueio,${PER('l')} pecas
    FROM lote l WHERE l.estagio='bloqueado' AND COALESCE(l.teste,0)=0 ORDER BY l.despachar_em, l.id`).all();
  r.fora.sem_etiqueta = temTabela('venda_sem_etiqueta') ? db.prepare(`SELECT id,venda,packId,sku,qtd,visto_em
    FROM venda_sem_etiqueta WHERE resolvida_em IS NULL AND COALESCE(teste,0)=0 ORDER BY id`).all() : null;
  r.fora.conta_aberta = temTabela('pdf_conta_aberta') ? db.prepare(`SELECT id,pdf,nfs,etiquetas,folha,sistema,resto,visto_em
    FROM pdf_conta_aberta WHERE resolvida_em IS NULL AND COALESCE(teste,0)=0 ORDER BY id`).all() : null;
  r.fora.canceladas = db.prepare(`SELECT l.id,l.data,l.buyer,l.nf,l.codigo,l.despachar_em,l.cancelada_em,
      l.cancelada_origem,l.cancelada_estagio,${PER('l')} pecas
    FROM lote l WHERE l.estagio='cancelado' AND COALESCE(l.teste,0)=0
      AND (l.data IN (${ph}) OR l.despachar_em>=? OR date(l.cancelada_em)>=?) ORDER BY l.id`).all(...dias, dias[0], dias[0]);
  r.fora.pendente_sem_sku = pendSemSku;

  /* ── F. A LIMPEZA E O QUE SOBROU DE ANTIGO ─────────────────────────────── */
  r.limpeza = temTabela('saida') ? db.prepare(`SELECT id,fechada_em,qtd_sistema,motivo FROM saida
    WHERE tipo='passivo' ORDER BY id`).all() : [];
  const corte = (() => { let c = null; r.limpeza.forEach(s => { const m = String(s.motivo || '').match(/nunca conferidas, ate (\d{4}-\d{2}-\d{2})/);
    if(m && (!c || m[1] > c)) c = m[1]; }); return c; })();
  r.corte_limpeza = corte;
  r.antigas = db.prepare(`SELECT l.id,l.data,l.buyer,l.nf,l.codigo,l.estagio,l.modalidade,l.despachar_em,l.embalado_em,
      l.conferido_em,l.carregado_em,l.no_carro_em,l.saida_id,l.cancelada_varias,${PER('l')} pecas
    FROM lote l WHERE COALESCE(l.teste,0)=0 AND (
      (l.estagio='embalado' AND (l.embalado_em IS NULL OR date(l.embalado_em)<date('now','localtime')))
      OR (${CG.AGUARDA_CAMINHAO.replace(/\b(modalidade|retirado_em|saida_id|estagio)\b/g,'l.$1')}
          AND date(l.carregado_em)<date('now','localtime')))
    ORDER BY l.embalado_em, l.id`).all().map(v => Object.assign(v, {
      situacao: situacao(v),
      porque: v.estagio === 'carregado' ? 'no canto da coleta desde ' + String(v.carregado_em).slice(0,10) + ' — o caminhão não levou, ou levou sem fechar a saída'
        : (corte && String(v.embalado_em || '').slice(0,10) <= corte)
          ? 'sobrou da limpeza: ' + (v.conferido_em ? 'estava conferida' : v.cancelada_varias ? 'caixa de várias com item cancelado' : v.no_carro_em ? 'estava no carro' : v.saida_id ? 'já ligada a uma saída' : 'motivo não identificado')
          : 'impressa depois do corte da limpeza' }));
  return r;
}

/* ── A. OS UPLOADS: relê cada PDF dos dias com o parse.js do upload ──────── */
async function uploads(db, dias){
  const LOTES = req('./caminhos').LOTES;
  const { parsePdf } = req('./parse');
  const arqs = new Map();
  try{
    for(const f of fs.readdirSync(LOTES)){
      const m = f.match(/^(\d{13})\.pdf$/i); if(!m) continue;
      const dt = db.prepare("SELECT datetime(?/1000,'unixepoch','localtime') d").get(+m[1]).d;
      if(dias.includes(dt.slice(0, 10))) arqs.set(path.join(LOTES, f), dt);
    }
  }catch(e){ T('  não consegui ler a pasta ' + LOTES + ': ' + e.message); }
  /* e o PDF citado por caixa dos dias mesmo que já tenha saído da pasta */
  db.prepare(`SELECT DISTINCT srcfile FROM lote WHERE data IN (${dias.map(()=>'?').join(',')}) AND srcfile IS NOT NULL`)
    .all(...dias).forEach(x => { if(!arqs.has(x.srcfile)) arqs.set(x.srcfile, null); });
  const achar = db.prepare(`SELECT id,data,criado_em,estagio,buyer,nf,codigo,packId,venda,srcfile FROM lote
    WHERE (? IS NOT NULL AND packId=?) OR (? IS NOT NULL AND venda=?) OR (? IS NOT NULL AND (envio=? OR codes LIKE ?))
    ORDER BY id`);
  const out = [];
  for(const [arq, dt] of [...arqs.entries()].sort((a,b) => String(a[1]).localeCompare(String(b[1])))){
    const doArq = db.prepare(`SELECT id,data,criado_em FROM lote WHERE srcfile=?`).all(arq);
    const u = { arq: path.basename(arq), quando: dt, existe: fs.existsSync(arq), etiquetas: null,
      novas: [], repetidas: [], nao_achei: [], gravadas_no_banco: doArq.length,
      religadas: doArq.filter(v => dt && v.criado_em < dt.replace(/\d\d$/, '00')).length, conta: null };
    if(u.existe){
      try{
        const orders = await parsePdf(new Uint8Array(fs.readFileSync(arq)));
        u.etiquetas = orders.length; u.conta = orders.conta || null;
        for(const o of orders){
          const e = o.envio || null;
          const vs = achar.all(o.packId||null, o.packId||null, o.venda||null, o.venda||null, e, e, e ? '%"'+e+'"%' : null);
          const nova = vs.find(v => v.srcfile === arq && dt && v.criado_em >= dt.slice(0, 16));
          const item = { pagina: o.labelPage, packId: o.packId, venda: o.venda, envio: o.envio, sku: o.sku, buyer: o.buyer, nf: o.nf, vols: vs };
          if(nova && vs.length === 1) u.novas.push(item);
          else if(nova) { item.alerta = 'virou caixa nova E já existia outra'; u.novas.push(item); }
          else if(vs.length){
            const dono = vs[0];
            if(o.packId && dono.packId === o.packId && o.venda && dono.venda && dono.venda !== o.venda)
              item.alerta = 'recusada pelo PACK, mas a VENDA é outra — pode ser venda que NÃO entrou';
            u.repetidas.push(item);
          } else u.nao_achei.push(item);
        }
      }catch(e){ u.erro = e.message; }
    }
    out.push(u);
  }
  return out;
}

/* ── IMPRESSÃO ─────────────────────────────────────────────────────────── */
const cx = v => '#' + v.id + ' ' + pad((v.buyer || '—').slice(0, 26), 26) + ' NF ' + pad(v.nf || '—', 6) +
  ' ' + pad(v.codigo || '(sem SKU)', 18) + (v.pecas > 1 ? ' [' + v.pecas + ' persianas]' : '');

function imprimir(r, ups){
  T(); T('DIAGNÓSTICO — ETIQUETA DE VENDA (201) × CONFERÊNCIA (202)   hoje ' + r.hoje + '   dias olhados: ' + r.dias.join(', '));
  T('Só leitura. Nada foi gravado.');

  tit('A. OS UPLOADS DOS DIAS — o que cada PDF trouxe e o que virou caixa');
  if(!ups) T('  (pulado: --sem-pdf)');
  else if(!ups.length) T('  Nenhum PDF encontrado para esses dias.');
  else {
    let tE=0,tN=0,tR=0,tX=0;
    for(const u of ups){
      T(); T('  ' + u.arq + (u.quando ? '   subido em ' + u.quando : '   (data do upload desconhecida)'));
      if(!u.existe){ T('     o PDF já saiu da pasta — ' + u.gravadas_no_banco + ' caixa(s) apontam para ele'); continue; }
      if(u.erro){ T('     não deu pra ler: ' + u.erro); continue; }
      tE+=u.etiquetas; tN+=u.novas.length; tR+=u.repetidas.length; tX+=u.nao_achei.length;
      T('     etiquetas no PDF        : ' + u.etiquetas);
      T('     viraram caixa NOVA      : ' + u.novas.length);
      T('     RECUSADAS como repetidas: ' + u.repetidas.length + '   (a venda/pack/envio já existia)');
      if(u.religadas) T('     religadas (venda antiga ganhou este PDF de papel): ' + u.religadas);
      if(u.nao_achei.length) T('     ⚠️ NÃO ACHEI NO BANCO   : ' + u.nao_achei.length + '   ← etiqueta que não entrou e não existe');
      if(u.conta && u.conta.semEtiqueta && u.conta.semEtiqueta.length) T('     vendas da folha sem etiqueta: ' + u.conta.semEtiqueta.length);
      const porDia = {};
      u.repetidas.forEach(i => { const d = i.vols[0].data; porDia[d] = (porDia[d]||0) + 1; });
      if(u.repetidas.length) T('     as repetidas já existiam desde: ' + Object.entries(porDia).map(([d,n]) => d + ' (' + n + ')').join(', '));
      u.repetidas.filter(i => i.alerta).concat(u.novas.filter(i => i.alerta)).forEach(i =>
        T('     ⚠️ pág ' + i.pagina + ' venda ' + (i.venda||'—') + ' pack ' + (i.packId||'—') + ' → ' + i.alerta +
          ' (caixas ' + i.vols.map(v => '#' + v.id).join(', ') + ')'));
      u.nao_achei.forEach(i => T('     ⚠️ pág ' + i.pagina + ' venda ' + (i.venda||'—') + ' pack ' + (i.packId||'—') +
        ' envio ' + (i.envio||'—') + ' ' + (i.buyer||'') + ' — não existe no banco'));
    }
    T(); T('  SOMA: ' + tE + ' etiquetas · ' + tN + ' novas · ' + tR + ' recusadas como repetidas' + (tX ? ' · ' + tX + ' NÃO ACHADAS' : ''));
    T('  (a mesma venda subida de novo é recusada pelo upload: isso NÃO infla a tela — só a soma acima)');
  }

  tit('B. VENDA REPETIDA EM MAIS DE UMA CAIXA — histórico inteiro');
  const certos = r.repetidos.filter(g => g.certeza), duvida = r.repetidos.filter(g => !g.certeza);
  const ativosCertos = certos.filter(g => g.ativos > 1 || g.tocaDias);
  T('  mesma venda (ou envio) em 2+ caixas : ' + certos.length + ' grupo(s) no histórico · ' + ativosCertos.length + ' tocam os dias olhados ou têm 2+ caixas ainda na fábrica');
  T('  mesmo pack / NF+comprador, vendas diferentes (pode ser legítimo): ' + duvida.length);
  const mostrar = (lista, max) => lista.slice(0, max).forEach(g => {
    T(); T('  ' + g.chaves.join(' · ') + (g.tocaDias ? '   ← DOS DIAS OLHADOS' : '') + (g.ativos > 1 ? '   ← ' + g.ativos + ' AINDA NA FÁBRICA' : ''));
    T('     ' + g.leitura);
    g.vols.forEach(v => T('     #' + v.id + '  entrou ' + v.data + '  ' + pad(v.estagio, 10) + ' ' + pad((v.buyer||'—').slice(0,24),24) +
      ' NF ' + pad(v.nf||'—',6) + ' ' + pad(v.codigo||'(sem SKU)',18) + ' despacha ' + (v.despachar_em||'—') + (v.teste ? ' [teste]' : '')));
  });
  if(ativosCertos.length){ T(); T('  >>> OS QUE IMPORTAM HOJE'); mostrar(ativosCertos, 60); }
  else T('  >>> Nenhuma venda repetida tocando os dias olhados ou com duas caixas na fábrica.');
  const velhos = certos.filter(g => !ativosCertos.includes(g));
  if(velhos.length){ T(); T('  (' + velhos.length + ' grupo(s) antigo(s), todas as caixas já fora da fábrica — os 5 mais recentes:)');
    mostrar(velhos.slice().sort((a,b) => Math.max(...b.vols.map(v=>v.id)) - Math.max(...a.vols.map(v=>v.id))), 5); }
  const duvAtivos = duvida.filter(g => g.ativos > 1 || g.tocaDias);
  if(duvAtivos.length){ T(); T('  >>> PACK OU NF+COMPRADOR REPETIDOS NOS DIAS (confira no ML se são vendas separadas)'); mostrar(duvAtivos, 30); }

  tit('C. A CONTA DE HOJE — caixas / persianas, por situação e prazo');
  const prazos = ['atrasado','sem data','vence hoje','adiantado'];
  T('  ' + pad('situação', 34) + prazos.map(p => num(p, 13)).join('') + num('TOTAL', 13));
  for(const [s, x] of Object.entries(r.tabela)){
    let tc=0, tp=0;
    T('  ' + pad(s, 34) + prazos.map(p => { const y = x[p]; if(!y) return num('—', 13); tc+=y.caixas; tp+=y.pecas;
      return num(y.caixas + ' / ' + y.pecas, 13); }).join('') + num(tc + ' / ' + tp, 13));
  }
  T();
  T('  DESPACHO MARCADO PARA HOJE na etiqueta (o número para comparar com o ML):');
  T('     ' + r.vence_hoje.caixas + ' caixas · ' + r.vence_hoje.pecas + ' PERSIANAS   (já sem as canceladas; ficaram de fora ' +
    r.vence_hoje.canceladas.caixas + ' caixas / ' + r.vence_hoje.canceladas.pecas + ' persianas)');
  for(const [s, y] of Object.entries(r.vence_hoje.por_situacao)) T('       ' + pad(s, 34) + y.caixas + ' caixas / ' + y.pecas + ' persianas');
  T('  ⚠️ o Mercado Livre conta UNIDADES; as duas telas contam CAIXAS. A caixa de várias persianas é 1 na tela e N no ML.');

  tit('D. AS DUAS TELAS, PELA RÉGUA DELAS, E A PONTE');
  const a = r.t201, b = r.t202;
  T('  201 Etiqueta de Venda (contam CAIXAS):');
  T('     pra imprimir agora : ' + a.pra_imprimir + '   (agência ' + a.agencia + ' · coleta ' + a.coleta + ') = ' + a.pra_imprimir_pecas + ' persianas');
  T('     fora do prazo      : ' + a.atrasados + '   ·   pra adiantar: ' + a.futuros);
  T('     impressas hoje     : ' + a.impressas_hoje + '   = ' + a.impressas_hoje_pecas + ' persianas');
  if(a.pendente_sem_sku_fora_da_lista) T('     ⚠️ pendente SEM SKU lido (não aparece em lista nenhuma): ' + a.pendente_sem_sku_fora_da_lista);
  T('  202 Conferência (contam CAIXAS):');
  T('     esperando conferência     : ' + b.esperando + '   = ' + b.esperando_pecas + ' persianas');
  T('     conferidas, esperando sair: ' + b.conferidas + '   = ' + b.conferidas_pecas + ' persianas');
  T('     só despacham depois       : ' + b.so_despacham_depois);
  T('     placar da pilha: impressas hoje ' + b.pilha_impressas + ' · conferidas ' + b.pilha_conferidas + ' · faltam ' + b.pilha_faltam +
    ' · de dias anteriores ' + b.pilha_anteriores);
  T();
  T('  A PONTE: "impressas hoje" da 201 (' + a.impressas_hoje + ') × a lista da 202 (' + (b.esperando + b.conferidas) + ')');
  T('     nas duas                         : ' + r.ponte.nas_duas);
  T('     impressas hoje e FORA da 202     : ' + r.ponte.fora202.length);
  const grp = l => l.reduce((m, v) => { (m[v.motivo] = m[v.motivo] || []).push(v); return m; }, {});
  for(const [m, vs] of Object.entries(grp(r.ponte.fora202))){ T('       ' + vs.length + ' × ' + m); vs.slice(0, 40).forEach(v => T('           ' + cx(v))); }
  T('     na 202 e NÃO impressas hoje      : ' + r.ponte.so202.length);
  for(const [m, vs] of Object.entries(grp(r.ponte.so202))){ T('       ' + vs.length + ' × ' + m); vs.slice(0, 40).forEach(v => T('           ' + cx(v))); }
  T('  conta: 201 impressas = nas duas + fora da 202   ·   202 lista = nas duas + não impressas hoje');

  tit('E. FORA DAS DUAS TELAS');
  const bl = r.fora.bloqueados;
  T('  Bloqueados (Admin → Pendências): ' + bl.length + ' caixas / ' + bl.reduce((s,v)=>s+v.pecas,0) + ' persianas');
  const blp = bl.reduce((m,v) => { const k = String(v.bloqueio||'?').split(':')[0]; m[k]=(m[k]||0)+1; return m; }, {});
  Object.entries(blp).forEach(([k,n]) => T('     ' + n + ' × ' + k));
  bl.filter(v => !v.despachar_em || v.despachar_em <= r.hoje).slice(0, 40).forEach(v => T('     ' + cx(v) + ' despacha ' + (v.despachar_em||'—')));
  if(r.fora.sem_etiqueta) { T('  Venda da folha sem etiqueta, aberta: ' + r.fora.sem_etiqueta.length +
    ' (' + r.fora.sem_etiqueta.reduce((s,v)=>s+(v.qtd||1),0) + ' persianas)');
    r.fora.sem_etiqueta.forEach(v => T('     venda ' + (v.venda||'—') + ' pack ' + (v.packId||'—') + ' ' + (v.sku||'') + ' ×' + (v.qtd||1) + ' desde ' + v.visto_em)); }
  if(r.fora.conta_aberta) { T('  PDF cuja conta não fecha, aberto: ' + r.fora.conta_aberta.length);
    r.fora.conta_aberta.forEach(v => T('     ' + v.pdf + ' NFs ' + (v.nfs||'—') + ' folha ' + v.folha + ' · sistema ' + v.sistema + ' · resto ' + v.resto)); }
  if(r.fora.pendente_sem_sku) T('  Pendente sem SKU lido (vence até hoje): ' + r.fora.pendente_sem_sku);
  const ca = r.fora.canceladas;
  T('  Canceladas ligadas aos dias: ' + ca.length + ' caixas / ' + ca.reduce((s,v)=>s+v.pecas,0) + ' persianas');
  ca.forEach(v => T('     ' + cx(v) + ' · ' + (v.cancelada_origem||'?') + ' · estava ' + (v.cancelada_estagio||'?') + ' · ' + (v.cancelada_em||'')));

  tit('F. A LIMPEZA DAS CAIXAS QUE SAÍRAM SEM CONFERÊNCIA, E O QUE SOBROU');
  if(!r.limpeza.length) T('  Nenhuma saída de passivo no banco.');
  r.limpeza.forEach(s => T('  saída #' + s.id + ' em ' + s.fechada_em + ' · ' + s.qtd_sistema + ' caixas · ' + String(s.motivo||'').slice(0, 90)));
  T('  corte da limpeza das nunca conferidas: ' + (r.corte_limpeza || '(não achei)'));
  T();
  T('  Caixas antigas ainda nas listas da 202 (impressas antes de hoje, ou no canto antes de hoje): ' + r.antigas.length +
    ' / ' + r.antigas.reduce((s,v)=>s+v.pecas,0) + ' persianas');
  const ga = r.antigas.reduce((m,v) => { (m[v.porque] = m[v.porque] || []).push(v); return m; }, {});
  for(const [m, vs] of Object.entries(ga)){
    T('     ' + vs.length + ' × ' + m);
    vs.slice(0, 40).forEach(v => T('         ' + cx(v) + ' · ' + v.situacao + ' · impressa ' + String(v.embalado_em||'—').slice(0,10) + ' · despacha ' + (v.despachar_em||'—')));
  }
  T();
}

module.exports = { diagnosticar, uploads };

if(require.main === module){
  (async () => {
    const Database = req('better-sqlite3');
    const args = process.argv.slice(2);
    const iD = args.indexOf('--dias');
    const dias = iD >= 0 ? String(args[iD+1] || '').split(',').map(s => s.trim()).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s)) : null;
    const semPdf = args.includes('--sem-pdf');
    const origem = args.find((a,i) => !a.startsWith('--') && !(iD >= 0 && i === iD+1)) || req('./caminhos').BANCO;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diferenca-telas-'));
    const copia = path.join(dir, 'copia.db');
    const fonte = new Database(origem, { readonly:true, fileMustExist:true });
    await fonte.backup(copia);
    fonte.close();
    const db = new Database(copia, { readonly:true });
    try{
      const r = diagnosticar(db, { dias });
      const ups = semPdf ? null : await uploads(db, r.dias);
      imprimir(r, ups);
    } finally {
      db.close();
      fs.rmSync(dir, { recursive:true, force:true });
    }
  })().catch(e => { console.error('erro: ' + e.stack); process.exit(1); });
}
