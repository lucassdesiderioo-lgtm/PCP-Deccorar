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

/* `tela` (spec PENDENCIAS-NO-MENU, 12/11/2026): o número, no mapa (`telas.js`),
   da tela onde a pendência se resolve. É dele que sai o caminho da caixinha
   "Abrir em Pendências" e, na fase 2, a etiqueta do ☰ Menu. `frase`: o que a
   caixinha diz quando uma ação cria uma pendência desta linha (um, vários) —
   escrita aqui, ao lado da linha, para nenhuma tela dizer do seu jeito. */
const LINHAS = [
  { chave:'bloqueados', tela:204, frase:['pendência nova em Bloqueados (caixa retida, venda sem etiqueta ou PDF cuja conta não fecha)','pendências novas em Bloqueados (caixas retidas, vendas sem etiqueta ou PDF cuja conta não fecha)'], nome:'Bloqueados', perm:[], onde:{ aba:'blq' }, aqui:true,
    quemTexto:'os cards logo abaixo dizem quem', quemCaixa:'nível Admin',
    ajuda:'SKU fora do cadastro, dúvida na leitura, pacote, formato novo, venda sem etiqueta e PDF cuja conta não fechou',
    contar(db){ const r = require('./exp_route').bloqueados(db); return { n:r.n, desde:r.desde, sem_etiqueta:r.sem_etiqueta }; } },
  { chave:'correcoes', tela:204, nome:'Correções', perm:['correcao.executar'], onde:{ aba:'blq', ancora:'corCard' },
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
  { chave:'ajuste', tela:301, frase:['pedido de ajuste de saldo espera outra pessoa aprovar','pedidos de ajuste de saldo esperam outra pessoa aprovar'], nome:'Ajuste de saldo', perm:['estoque.aprovar_ajuste'], onde:{ aba:'est' },
    ajuda:'pedidos de ajuste esperando a segunda pessoa aprovar',
    contar(db){
      const r = require('./ajuste_dominio').contarPendentes(db);
      return { n:r.n, desde:r.desde };
    } },
  { chave:'inventario_aprovar', tela:303, frase:['SKU não teve acordo nem na 3ª contagem e espera decisão','SKUs não tiveram acordo nem na 3ª contagem e esperam decisão'], nome:'Inventário — sem acordo', perm:['contagem.resolver'], onde:{ url:'/inventario' },
    ajuda:'SKUs em que nem a 3ª contagem bateu (e os que já esperavam aprovação antes de 04/11/2026)',
    contar(db){ const r = require('./inventario_dominio').pendencias(db).aprovar; return { n:r.n, desde:r.desde }; } },
  { chave:'inventario_recontar', tela:303, nome:'Inventário — 2ª e 3ª contagem', perm:['contagem.contar','contagem.desempatar'], onde:{ url:'/inventario' },
    ajuda:'SKUs que esperam a contagem de outra pessoa (a 2ª, ou a 3ª porque as duas não bateram)',
    contar(db){ const r = require('./inventario_dominio').pendencias(db).recontar; return { n:r.n, desde:r.desde }; } },
  /* Os ajustes antigos se dividem por tela desde 11/11/2026 (ARRUMAR-O-LUGAR
     fase 2): os de peça ficam na 302, e os de material moram na 504 — cada linha
     conta o que a tela dela mostra (#12). */
  { chave:'contagem', tela:302, nome:'Contagem — ajustes de peça', perm:['contagem.ajustar'], onde:{ aba:'ct' },
    ajuda:'contagens esperando aprovação para ir ao estoque',
    contar(db){
      const l = require('./cont_route').pendentes(db).filter(x => x.tipo !== 'componente');
      return { n:l.length, desde:maisAntiga(l.map(x => x.criado_em)) };
    } },
  { chave:'contagem_material_antiga', tela:504, nome:'Ajustes antigos de material', perm:['contagem.ajustar'], onde:{ url:'/contagem-material' },
    ajuda:'da contagem de material antiga (saiu em 07/11/2026): rejeite e conte de novo na 504',
    contar(db){
      const l = require('./cont_route').pendentes(db).filter(x => x.tipo === 'componente');
      return { n:l.length, desde:maisAntiga(l.map(x => x.criado_em)) };
    } },
  { chave:'sku', tela:403, frase:['SKU ficou incompleto (falta medida, modelo, cor ou custo)','SKUs ficaram incompletos (falta medida, modelo, cor ou custo)'], nome:'SKU incompleto', perm:['sku.cadastrar'], onde:{ aba:'pend' },
    ajuda:'cadastro sem medida, modelo, cor ou custo',
    contar(db){ return { n:require('./sku_route').pendencias(db).total, desde:null }; } },
  { chave:'sobras', tela:202, frase:['caixa separada como venda cancelada espera a confirmação de outra pessoa','caixas separadas como venda cancelada esperam a confirmação de outra pessoa'], nome:'Canceladas da Conferência', perm:['cancelamento.confirmar','carregamento.executar'], onde:{ url:'/carregamento' },
    ajuda:'caixas separadas como venda cancelada esperando confirmação no ML, e canceladas no ML ainda na fábrica esperando ser separadas',
    contar(db){
      const l = require('./carreg_route').sobrasEsperando(db);
      return { n:l.length, desde:maisAntiga(l.map(x => x.cancelada_em)),
               canceladas:l.filter(x => x.de === 'cancelada').map(x => x.id) };
    } },
  /* COMPRAS-E-RECEBIMENTO fase 1 (R-CMP-05): material sem almoxarifado padrão
     não sabe para onde vai no Recebimento nem em que contagem entra. */
  { chave:'material_sem_almox', tela:1101, frase:['material ficou sem almoxarifado','materiais ficaram sem almoxarifado'], nome:'Material sem almoxarifado', perm:['componente.cadastrar'], onde:{ url:'/admin/materiais' },
    ajuda:'material cadastrado sem o almoxarifado onde ele mora',
    contar(db){ const r = require('./material_dominio').pendencias(db).sem_almoxarifado; return { n:r.n, desde:r.desde }; } },
  { chave:'pedido_aprovacao', tela:501, frase:['pedido de compra passou da alçada e espera aprovação','pedidos de compra passaram da alçada e esperam aprovação'], nome:'Pedido de compra aguardando aprovação', perm:['pedido.aprovar'], onde:{ aba:'compras' },
    ajuda:'pedido acima da alçada de quem o criou (R-CMP-17)',
    contar(db){ const r = require('./compra_dominio').pendencias(db).aguardando_aprovacao; return { n:r.n, desde:r.desde }; } },
  /* COMPRAS-E-RECEBIMENTO fase 3 (R-CMP-32/33): o retido nao entra no saldo
     ate alguem decidir; o aviso entrou e espera a ciencia. */
  { chave:'recebimento_retido', tela:1201, frase:['recebimento ficou retido e não entrou no saldo até alguém decidir','recebimentos ficaram retidos e não entraram no saldo até alguém decidir'], nome:'Recebimento retido', perm:['recebimento.liberar'], onde:{ url:'/admin/recebimento-retido' },
    ajuda:'entrega que não bateu o peso ou a quantidade declarada: aceitar, aceitar e reclamar, ou devolver',
    contar(db){ const r = require('./recebimento_dominio').pendencias(db).retido; return { n:r.n, desde:r.desde }; } },
  { chave:'recebimento_aviso', tela:1201, frase:['recebimento entrou com aviso de peso e espera ciência','recebimentos entraram com aviso de peso e esperam ciência'], nome:'Recebimento com aviso de peso', perm:['recebimento.liberar'], onde:{ url:'/admin/recebimento-retido' },
    ajuda:'entrou no saldo com o peso entre as duas tolerâncias: dar ciência',
    contar(db){ const r = require('./recebimento_dominio').pendencias(db).aviso; return { n:r.n, desde:r.desde }; } },
  /* COMPRAS-E-RECEBIMENTO fase 6 (R-CMP-42): a contagem de material que passou
     da tolerancia espera outra pessoa aprovar. */
  { chave:'contagem_material', tela:504, frase:['item da contagem passou da tolerância e espera aprovação','itens da contagem passaram da tolerância e esperam aprovação'], nome:'Contagem de material por almoxarifado', perm:['contagem.aprovar'], onde:{ url:'/contagem-material' },
    ajuda:'diferença acima da tolerância na contagem cega da 504',
    contar(db){ return require('./contagem_material_dominio').pendencias(db); } },
  /* fase 11 (R-CMP-52, R-CMP-55): o certificado vencendo/vencido, e a nota da
     Receita de fornecedor sem pedido (alguem comprou por fora). */
  { chave:'certificado', tela:1302, nome:'Certificado digital vencendo ou vencido', perm:['certificado.gerenciar'], onde:{ url:'/admin/certificado' },
    ajuda:'menos de 30 dias para vencer, ou já vencido (a busca da Receita para)',
    contar(db){ return require('./certificado_dominio').pendencias(db); } },
  { chave:'nota_sem_pedido', tela:1301, nome:'Nota da Receita sem pedido ou que não entrou', perm:['nota.lancar'], onde:{ url:'/admin/notas' },
    ajuda:'nota emitida contra a Deccorar por fornecedor sem pedido no sistema, ou documento da Receita que não entrou',
    contar(db){ return require('./dfe_dominio').pendencias(db); } },
  /* FICHAS-NO-CADASTRO-UNICO §3-G (11/11/2026): a peca refeita espera alguem
     dizer se usou material. A conta e a da tela dona (material_extra_dominio). */
  { chave:'material_extra', tela:106, frase:['peça espera decidir o material','peças esperam decidir o material'], nome:'Material extra a decidir', perm:['material.extra'], onde:{ url:'/material-extra' },
    ajuda:'peça com problema ou recusada: dizer se usou material, e baixar',
    contar(db){ return require('./material_extra_dominio').pendentes(db); } },
  { chave:'devolucoes', tela:253, frase:['devolução espera a baixa','devoluções esperam a baixa'], nome:'Devoluções', perm:['devolucao.baixar'], onde:{ aba:'dv' },
    ajuda:'devoluções esperando a baixa com reputação e motivo',
    contar(db){
      const l = require('./dev_route').pendentes(db);
      return { n:l.length, desde:maisAntiga(l.map(x => x.recebido_em || x.data)) };
    } }
];

function resumo(db){
  const linhas = LINHAS.map(L => {
    const base = { chave:L.chave, nome:L.nome, ajuda:L.ajuda, onde:L.onde, tela:L.tela,
                   quem:quem(L) };
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
function total(db, pronto){
  const r = pronto || resumo(db);   // a rota já tem o resumo (gravou o retrato do dia com ele)
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

/* Quem resolve a linha, em palavras (a mesma frase da central). */
function quem(L){ return L.quemTexto || L.perm.map(rotulo).join(' ou '); }
/* Na caixinha, fora da 204, "os cards logo abaixo" não diz nada: diz o nível. */
function quemFora(L){ return L.quemCaixa || quem(L); }

/* O que a caixinha diz: "2 caixas ficaram retidas em Bloqueados". Linha sem
   frase própria diz o nome dela. */
function frase(L, n){
  if(L.frase) return n + ' ' + (n === 1 ? L.frase[0] : L.frase[1]);
  return n + ' ' + (n === 1 ? 'pendência nova' : 'pendências novas') + ': ' + L.nome;
}

module.exports = { LINHAS, resumo, total, quem, quemFora, frase };
