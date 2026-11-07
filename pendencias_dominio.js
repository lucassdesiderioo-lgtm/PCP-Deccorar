/* pendencias_dominio.js — a central de pendências, fase 1 (spec
 * docs/arquivo/CENTRAL-DE-PENDENCIAS.md, 27/10/2026).
 *
 * O que espera uma pessoa decidir mora em sete lugares (Correções, ajuste de
 * saldo, inventário, contagem de material, SKU incompleto, sobras da
 * Conferência e devoluções), fora os cards de Bloqueados. Até aqui só se via
 * abrindo um por um: pendência que ninguém vê não é pendência, é atraso (a NF
 * 8301). Este módulo junta os NÚMEROS num lugar só, no topo da aba Pendências.
 *
 * ⚠️ NENHUMA CONTA MORA AQUI. Cada linha pergunta à função da tela dona — a
 * mesma que a tela usa para desenhar a lista dela. Uma segunda conta para o
 * mesmo número diverge no primeiro ajuste, e aí a central diz 3 onde a aba diz
 * 5 (armadilha #12). O `teste_pendencias.js` varre este arquivo atrás de SQL.
 *
 * ⚠️ SÓ NÚMERO, NUNCA DETALHE. Quem abre a central vê todas as linhas, mesmo as
 * que não pode resolver — esconder sem dizer é a pendência que some —, e por
 * isso nada aqui diz qual SKU, cliente, saldo ou valor. O detalhe fica na tela
 * dona, atrás da permissão dela.
 *
 * ⚠️ UMA LINHA QUE NÃO CONSEGUE CONTAR DIZ ISSO (`n: null`, `erro`), em vez de
 * virar zero: zero é "nada esperando", e mentir isso é o pior que a central
 * pode fazer.
 *
 * Os cards de Bloqueados NÃO entram aqui: eles estão logo abaixo, na mesma aba,
 * e a tela soma o que já desenha.
 */
const PERM = require('./permissoes');

function rotulo(chave){
  const p = PERM.find(x => x.chave === chave);
  return p ? p.rotulo : chave;
}

/* A data mais antiga entre as que já passaram. A venda futura fechada da Mesa
   tem data de amanhã em diante, e "esperando desde o mês que vem" não existe. */
function maisAntiga(datas){
  const t = new Date(), z = n => String(n).padStart(2, '0');
  const hoje = t.getFullYear() + '-' + z(t.getMonth() + 1) + '-' + z(t.getDate());   // hora local, como o banco
  const d = datas.filter(x => x && String(x).slice(0, 10) <= hoje).map(x => String(x).slice(0, 19)).sort();
  return d.length ? d[0] : null;
}

const LINHAS = [
  { chave:'bloqueados', nome:'Bloqueados', perm:[], onde:{ aba:'blq' }, aqui:true,
    quemTexto:'os cards logo abaixo dizem quem',
    ajuda:'SKU fora do cadastro, dúvida na leitura, pacote, formato novo, venda sem etiqueta e PDF cuja conta não fechou',
    contar(db){ const r = require('./exp_route').bloqueados(db); return { n:r.n, desde:r.desde, sem_etiqueta:r.sem_etiqueta }; } },
  { chave:'correcoes', nome:'Correções', perm:['correcao.executar'], onde:{ aba:'blq', ancora:'corCard' },
    ajuda:'fantasmas, vencidos, caixas sem conferência, canceladas depois da etiqueta e fila velha',
    contar(db){
      const c = require('./correcoes').contadores(db);
      let n = 0, datas = [], ids = [];
      Object.keys(c).forEach(k => {
        n += c[k].n || 0;
        (c[k].itens || []).forEach(x => {
          datas.push(x.cancelada_em || x.despachar_em || x.embalado_em || x.revisado_em || x.data);
          if(k === 'canceladas') ids.push(x.id);
        });
      });
      return { n, desde:maisAntiga(datas), canceladas:ids };
    } },
  { chave:'ajuste', nome:'Ajuste de saldo', perm:['estoque.aprovar_ajuste'], onde:{ aba:'est' },
    ajuda:'pedidos de ajuste esperando a segunda pessoa aprovar',
    contar(db){
      const r = require('./ajuste_dominio').contarPendentes(db);
      return { n:r.n, desde:r.desde };
    } },
  { chave:'inventario_aprovar', nome:'Inventário — sem acordo', perm:['contagem.resolver'], onde:{ url:'/inventario' },
    ajuda:'SKUs em que nem a 3ª contagem bateu (e os que já esperavam aprovação antes de 04/11/2026)',
    contar(db){ const r = require('./inventario_dominio').pendencias(db).aprovar; return { n:r.n, desde:r.desde }; } },
  { chave:'inventario_recontar', nome:'Inventário — 2ª e 3ª contagem', perm:['contagem.contar','contagem.desempatar'], onde:{ url:'/inventario' },
    ajuda:'SKUs que esperam a contagem de outra pessoa (a 2ª, ou a 3ª porque as duas não bateram)',
    contar(db){ const r = require('./inventario_dominio').pendencias(db).recontar; return { n:r.n, desde:r.desde }; } },
  { chave:'contagem', nome:'Contagem de material', perm:['contagem.ajustar'], onde:{ aba:'ct' },
    ajuda:'contagens esperando aprovação para ir ao estoque',
    contar(db){
      const l = require('./cont_route').pendentes(db);
      return { n:l.length, desde:maisAntiga(l.map(x => x.criado_em)) };
    } },
  { chave:'sku', nome:'SKU incompleto', perm:['sku.cadastrar'], onde:{ aba:'pend' },
    ajuda:'cadastro sem medida, modelo, cor ou custo',
    contar(db){ return { n:require('./sku_route').pendencias(db).total, desde:null }; } },
  { chave:'sobras', nome:'Canceladas da Conferência', perm:['cancelamento.confirmar','carregamento.executar'], onde:{ url:'/carregamento' },
    ajuda:'caixas separadas como venda cancelada esperando confirmação no ML, e canceladas no ML ainda na fábrica esperando ser separadas',
    contar(db){
      const l = require('./carreg_route').sobrasEsperando(db);
      return { n:l.length, desde:maisAntiga(l.map(x => x.cancelada_em)),
               canceladas:l.filter(x => x.de === 'cancelada').map(x => x.id) };
    } },
  /* COMPRAS-E-RECEBIMENTO fase 1 (R-CMP-05): material sem almoxarifado padrão
     não sabe para onde vai no Recebimento nem em que contagem entra. */
  { chave:'material_sem_almox', nome:'Material sem almoxarifado', perm:['componente.cadastrar'], onde:{ aba:'compras' },
    ajuda:'material cadastrado sem o almoxarifado onde ele mora',
    contar(db){ const r = require('./material_dominio').pendencias(db).sem_almoxarifado; return { n:r.n, desde:r.desde }; } },
  { chave:'devolucoes', nome:'Devoluções', perm:['devolucao.baixar'], onde:{ aba:'dv' },
    ajuda:'devoluções esperando a baixa com reputação e motivo',
    contar(db){
      const l = require('./dev_route').pendentes(db);
      return { n:l.length, desde:maisAntiga(l.map(x => x.recebido_em || x.data)) };
    } }
];

function resumo(db){
  const linhas = LINHAS.map(L => {
    const base = { chave:L.chave, nome:L.nome, ajuda:L.ajuda, onde:L.onde,
                   quem:L.quemTexto || L.perm.map(rotulo).join(' ou ') };
    if(L.aqui) base.aqui = true;
    try{
      const r = L.contar(db);
      if(r.sem_etiqueta != null) base._sem = r.sem_etiqueta;
      return Object.assign(base, { n:r.n, desde:r.desde, _canc:r.canceladas || [] });
    }catch(e){
      console.log('[pendencias] ' + L.chave + ': ' + (e && e.message));
      return Object.assign(base, { n:null, desde:null, erro:'não consegui contar', _canc:[] });
    }
  });
  /* A CANCELADA QUE AINDA ESTÁ NA FÁBRICA aparece em DUAS linhas, e é certo:
     ela volta pelo ↩ Sobrou da Conferência, e a Mesa registra a que não
     voltou. As duas portas resolvem a mesma caixa, então o total a conta uma
     vez só, e diz quantas estão nas duas. */
  const a = new Set((linhas.find(l => l.chave === 'correcoes') || {})._canc || []);
  const duas = ((linhas.find(l => l.chave === 'sobras') || {})._canc || []).filter(id => a.has(id)).length;
  const total = linhas.reduce((s, l) => s + (l.n || 0), 0) - duas;
  const sem = (linhas.find(l => l.chave === 'bloqueados') || {})._sem || 0;
  linhas.forEach(l => { delete l._canc; delete l._sem; });
  return { total, em_duas_linhas:duas, sem_conta:linhas.filter(l => l.n == null).length,
           sem_etiqueta:sem, linhas };
}

/* O QUE A BANCADA E A TV RECEBEM (fase 3): tres numeros e nada mais — o total
   (o mesmo do resumo), ha quantos dias espera a mais antiga e quantas vendas
   da folha estao sem etiqueta (a que pode atrasar no ML). Quem opera a
   Etiqueta de Venda ou a Conferencia nao abre o admin, e sem isto a central
   so existia para quem ja estava la. */
function total(db){
  const r = resumo(db);
  const t = new Date(), z = n => String(n).padStart(2, '0');
  const hoje = Date.parse(t.getFullYear() + '-' + z(t.getMonth() + 1) + '-' + z(t.getDate()) + 'T00:00:00');
  let dias = null;
  r.linhas.forEach(l => {
    if(!l.n || !l.desde) return;
    const d = Math.round((hoje - Date.parse(String(l.desde).slice(0, 10) + 'T00:00:00')) / 86400000);
    if(isFinite(d) && (dias == null || d > dias)) dias = Math.max(0, d);
  });
  return { total:r.total, dias, sem_etiqueta:r.sem_etiqueta };
}

module.exports = { LINHAS, resumo, total };
