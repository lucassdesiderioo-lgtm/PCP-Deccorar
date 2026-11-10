/* O MAPA DE TELAS DA MEDIDA PADRÃO — dono único (spec ACESSO-POR-TELA-E-NIVEL,
 * fase 2, 04/11/2026). Uma tela = uma linha (R-TEL-01).
 *
 * Até aqui "que telas existem" estava escrito em quatro lugares: o rodapé
 * (`public/nav.js`), "para onde a pessoa vai" (`destino.js`), a trava do
 * servidor (`permDaRota` no `acesso.js`) e a `/setor`. Tela nova exigia lembrar
 * de todos. Hoje a trava do servidor e o `destino.js` leem daqui; o menu por
 * pessoa (fase 6) e a tela de Acessos (fase 7) também.
 *
 * Cada linha:
 *   n       o NÚMERO. A centena é o módulo onde a tela nasceu; o número NUNCA
 *           muda e NUNCA é reaproveitado — tela que sai deixa o número vago
 *           (R-TEL-02). "Libera a 204 para o Renato" não tem ambiguidade.
 *   nome    como aparece no menu e na tela de Acessos
 *   rota    o endereço
 *   nivel   o nível mínimo da PESSOA para abrir (R-NIV-01)
 *   onde    tablet · computador · TV
 *   perms   as permissões que abrem a tela — passa quem tem QUALQUER UMA.
 *           '@admin' quer dizer "qualquer pessoa de nível Admin" (a regra de
 *           hoje das abas que todo Admin vê: Estoque, Pendências, Problemas).
 *   area    a área-sombra que leva a pessoa até aqui depois do PIN (destino.js)
 *   aba     a aba do Admin antigo (`/admin#<aba>`) que esta tela substitui
 *
 * ⚠️ TELA NOVA NASCE SÓ PARA O ADMIN GERAL (R-TEL-03, R-ALC-06): a linha entra
 * aqui com uma permissão nova, que nenhum setor tem; o Admin Geral passa por
 * nível, e o dono marca o setor na tela de Acessos depois da entrega. Tela fora
 * do mapa não abre (o `permDaRota` termina em '@negado'), e o `teste_mapa.js`
 * reprova `.html` em `public/` sem linha aqui.
 *
 * ⚠️ OS NÍVEIS SÃO OS DE HOJE, E NÃO OS DA PROPOSTA DA SPEC, onde divergem
 * (§4: "vale o nível de hoje, ninguém perde nada"): 104 Problemas e 204
 * Pendências ficam Admin (a proposta era Supervisor), e o 401 Planejamento fica
 * Admin abrindo com `planilha.importar` (decisão D1 (b) do dono, 04/11/2026).
 */
const MODULOS = {
  100:'Produção', 200:'Expedição', 250:'Devoluções', 300:'Estoque', 400:'Planejamento',
  500:'Compras', 600:'Sob medida', 700:'Frota', 800:'Mercado Livre', 900:'Sistema'
};

const TELAS = [
  // ── 100 · Produção ──
  { n:101, nome:'Revisão',               rota:'/operador',      nivel:'operacao',   onde:'tablet',     perms:['revisao.executar'],      area:'operador',
    modulo:'producao', bloco:'medida_padrao', liga:[401, 102, 'skus'] },
  { n:102, nome:'Embalagem',             rota:'/montagem',      nivel:'operacao',   onde:'tablet',     perms:['embalagem.executar'],    area:'montagem',
    modulo:'producao', bloco:'medida_padrao', liga:[101, 201, 'skus', 'estoque de peça'] },
  /* A 103 é o LUGAR ÚNICO de subir o PDF desde 05/11/2026 (decisão do dono,
     D1 (a) e D2): abre com `pdf.subir` também, e por isso é de nível Operação;
     herdou da 203 a área de chegada `expedicao`. A lista "Lançar para produção"
     continua escondida de quem não tem `producao.lancar` (data-perm).
     Desde 05/11/2026 (spec PRODUCAO-SO-DO-PDF, D3) ela se chama "Subir PDF de
     vendas": a lista de lançar à mão saiu. `producao.lancar` continua abrindo
     a tela (tirá-la mudaria quem abre — #13), sem lista nenhuma. */
  { n:103, nome:'Subir PDF de vendas',   rota:'/admin/producao', nivel:'operacao',  onde:'computador', perms:['producao.lancar','pdf.subir'], area:'expedicao', aba:'prod',
    modulo:'comercial', bloco:'mercado_livre', liga:[201, 401, 'lote (vendas do PDF)'] },
  { n:104, nome:'Problemas',             rota:'/admin/problemas', nivel:'admin',    onde:'computador', perms:['@admin'],                aba:'pb',
    modulo:'producao', bloco:'medida_padrao', liga:[101] },
  { n:105, nome:'Painel da TV',          rota:'/painel',        nivel:'operacao',   onde:'TV',         perms:['painel.ver'],            area:'painel',
    modulo:'producao', bloco:'medida_padrao', liga:[101, 102, 201, 401] },
  // ── 200 · Expedição ──
  { n:201, nome:'Etiqueta de Venda',     rota:'/embalagem',     nivel:'operacao',   onde:'tablet',     perms:['etiqueta.emitir'],       area:'embalagem',
    modulo:'expedicao', bloco:'comum', liga:[103, 102, 202, 'lote'] },
  { n:202, nome:'Conferência',           rota:'/carregamento',  nivel:'operacao',   onde:'tablet',     perms:['carregamento.executar'], area:'carregamento',
    modulo:'expedicao', bloco:'comum', liga:[201, 'estoque de peça', 'saida'] },
  // 203 Subir PDF (/expedicao) SAIU em 05/11/2026: o upload é só na 103 (D2). O número fica vago.
  { n:204, nome:'Pendências',            rota:'/admin/pendencias', nivel:'admin',   onde:'computador', perms:['@admin'],                aba:'blq',
    modulo:'expedicao', bloco:'comum', liga:[103, 205, 253, 301, 302] },
  { n:205, nome:'Correções',             rota:'/admin/correcoes', nivel:'admin',    onde:'computador', perms:['correcao.executar'],     aba:'cor',
    modulo:'expedicao', bloco:'comum', liga:[201, 202, 204] },
  { n:206, nome:'Horários de coleta',    rota:'/coleta-horarios', nivel:'supervisor', onde:'computador', perms:['coleta.horario'],
    modulo:'expedicao', bloco:'comum', liga:[103, 201, 202] },   // Operação não edita horário (05/11/2026)
  // ── 250 · Devoluções (bloco dentro da Expedição; a porta é /devolucoes) ──
  { n:251, nome:'Devoluções — receber',  rota:'/devolucao',     nivel:'operacao',   onde:'tablet',     perms:['devolucao.registrar'],   area:'devolucao',
    modulo:'posvenda', bloco:'mercado_livre', liga:[252, 253, 102] },
  { n:252, nome:'Devoluções — em andamento', rota:'/devolucao-casos', nivel:'supervisor', onde:'computador',
    perms:['devolucao.acompanhar','devolucao.lancar','devolucao.dinheiro'], area:'devolucao_casos',
    modulo:'posvenda', bloco:'mercado_livre', liga:[251, 253, 'lote'] },
  { n:253, nome:'Devoluções — baixa',    rota:'/admin/devolucoes', nivel:'admin',   onde:'computador', perms:['devolucao.baixar'],      aba:'dv',
    modulo:'posvenda', bloco:'mercado_livre', liga:[251, 252] },
  // ── 300 · Estoque ──
  { n:301, nome:'Estoque',               rota:'/admin/estoque', nivel:'admin',      onde:'computador', perms:['@admin'],                aba:'est',
    modulo:'estoque', bloco:'medida_padrao', liga:[102, 202, 302, 'skus'] },
  { n:302, nome:'Contagem',              rota:'/admin/contagem', nivel:'admin',     onde:'computador',
    perms:['contagem.planejar','contagem.resolver','contagem.relatorio','contagem.ajustar','contagem.aprovar'], aba:'ct',
    modulo:'estoque', bloco:'medida_padrao', liga:[303, 301, 504],
    partes:[{ id:'material', nome:'Material (cartão que leva à 504 e ajustes antigos aguardando aprovação)', modulo:'almoxarifado' }] },
  { n:303, nome:'Inventário',            rota:'/inventario',    nivel:'operacao',   onde:'tablet',     perms:['contagem.contar','contagem.desempatar'], area:'inventario',
    modulo:'estoque', bloco:'medida_padrao', liga:[302, 301] },
  // ── 400 · Planejamento ──
  { n:401, nome:'Planejamento',          rota:'/planejamento',  nivel:'admin',      onde:'computador', perms:['planilha.importar'],     area:'necessidade', aba:'plan',
    modulo:'planejamento', bloco:'medida_padrao', liga:[101, 404, 'venda_futura (planilha do ML)'] },
  { n:402, nome:'Cadastro de SKU',       rota:'/admin/skus',    nivel:'admin',      onde:'computador', perms:['sku.cadastrar','sku.excluir','modelo.cadastrar'], aba:'cad',
    modulo:'cadastros', bloco:'medida_padrao', liga:[403, 404, 'skus'] },
  { n:403, nome:'SKU incompleto',        rota:'/admin/sku-incompleto', nivel:'admin', onde:'computador', perms:['sku.cadastrar'],      aba:'pend',
    modulo:'cadastros', bloco:'medida_padrao', liga:[402] },
  { n:404, nome:'Ficha técnica',         rota:'/admin/ficha',   nivel:'admin',      onde:'computador', perms:['modelo.cadastrar','custo.ver','compras.ver'], aba:'ficha',
    modulo:'cadastros', bloco:'medida_padrao', liga:[402, 401, 501, 'componente'] },
  // ── 500 · Compras ──
  { n:501, nome:'Compras',               rota:'/admin/compras', nivel:'admin',      onde:'computador',
    perms:['compras.ver','fornecedor.cadastrar','preco.lancar','pedido.criar','pedido.pagar','componente.cadastrar','almoxarifado.cadastrar','certificado.gerenciar'], aba:'compras',
    modulo:'compras', bloco:'comum', liga:[404, 502, 'componente', 'fornecedor'],
    abas:[
      { id:'lista',        nome:'Lista de compras',   modulo:'compras' },
      { id:'pedidos',      nome:'Pedidos',            modulo:'compras' },
      { id:'rapida',       nome:'Compra rápida',      modulo:'compras' },
      { id:'programada',   nome:'Compra programada',  modulo:'compras' },
      { id:'materiais',    nome:'Materiais',          modulo:'cadastros' },
      { id:'fornecedores', nome:'Fornecedores',       modulo:'cadastros' },
      { id:'almox',        nome:'Almoxarifados',      modulo:'cadastros' },
      { id:'retidos',      nome:'Recebimento retido', modulo:'almoxarifado' },
      { id:'notas',        nome:'Notas',              modulo:'fiscal' },
      { id:'certificado',  nome:'Certificado',        modulo:'fiscal' }] },
  { n:502, nome:'Recebimento',           rota:'/recebimento',   nivel:'operacao',   onde:'tablet',     perms:['pedido.receber'],        area:'recebimento',
    modulo:'almoxarifado', bloco:'comum', liga:[501, 503, 'componente'] },
  // COMPRAS-E-RECEBIMENTO fase 5: guardar, mover e abrir volume por bipe (a chave nasce só para o Admin Geral, R-ALC-06)
  { n:503, nome:'Almoxarifado',          rota:'/almoxarifado',  nivel:'operacao',   onde:'tablet',     perms:['volume.movimentar'],  area:'almoxarifado',
    modulo:'almoxarifado', bloco:'comum', liga:[502, 504, 'almoxarifado (endereços)'] },
  // COMPRAS-E-RECEBIMENTO fase 6: a contagem de material por almoxarifado (as chaves de contagem que ja existem)
  { n:504, nome:'Contagem de material',  rota:'/contagem-material', nivel:'operacao', onde:'tablet',  perms:['contagem.contar'],
    modulo:'almoxarifado', bloco:'comum', liga:[503, 302, 'componente'] },
  // ── 600 · Sob medida: as telas moram em tecido/nucleo/telas.js (numero e nivel la) ──
  // ── 700 · Frota e 800 · Mercado Livre: reservados para as specs deles ──
  // ── 900 · Sistema ──
  { n:901, nome:'Acessos',               rota:'/acessos',       nivel:'admin_geral', onde:'computador', perms:['pessoas.gerenciar'],    aba:'acs',
    modulo:'administracao', bloco:'comum', liga:['usuarios', 'setores'] },
  { n:902, nome:'Cadastros',             rota:'/admin/cadastros', nivel:'admin',    onde:'computador', perms:['listas.editar','kit.editar','kit.imprimir','horarios.editar'], aba:'cd',
    modulo:'cadastros', bloco:'comum', liga:[102, 206, 'listas'],
    partes:[{ id:'horarios', nome:'Horários de corte e despacho', modulo:'administracao' }] },
  { n:903, nome:'Modo teste',            rota:'/admin/teste',   nivel:'admin',      onde:'computador', perms:['teste.operar'],          aba:'tst',
    modulo:'administracao', bloco:'comum', liga:['todas as tabelas do modo teste'] },
  { n:904, nome:'Relatórios',            rota:'/relatorios',    nivel:'supervisor', onde:'computador', perms:['relatorios.ver'],        area:'relatorios', aba:'rel',
    modulo:'relatorios', bloco:'comum', liga:[401, 301, 252, 615, 'pendencias_dia'] },
  // RELATORIOS-UNIFICADOS (08/11/2026): o que a pessoa logada fez. Nível Operação, do tablet ou do computador (D4).
  { n:905, nome:'Minha produção',        rota:'/minha-producao', nivel:'operacao',  onde:'tablet',     perms:['produtividade.propria'],
    modulo:'relatorios', bloco:'medida_padrao', liga:[101, 102, 201, 202] }
];

/* A ORDEM DE CHEGADA depois do PIN (destino.js): a primeira tela que a pessoa
   alcança decide. É a ordem que existia no `PADRAO`, e mudá-la mudaria para
   onde cada pessoa vai de manhã — por isso ela é uma lista própria, e não a
   ordem do mapa. O Admin (a porta '/admin') vem primeiro, como sempre. */
const CHEGADA = [105, 101, 102, 201, 202, 103, 904, 401, 502, 303, 251, 252, 503];   // a 503 no fim: quem só tem volume.movimentar (revisão do PR #305)   // a 103 no lugar da 203 (05/11/2026)

const NIVEIS = ['operacao', 'supervisor', 'admin', 'admin_geral'];
const NOME_NIVEL = { operacao:'Operação', supervisor:'Supervisor', admin:'Admin', admin_geral:'Admin Geral' };
const ordemNivel = n => NIVEIS.indexOf(n);

function porNumero(n){ return TELAS.find(t => t.n === +n) || null; }
function porRota(r){ return TELAS.find(t => t.rota === r) || null; }
function moduloDe(n){ const c = Math.floor(+n / 100) * 100; return (+n >= 250 && +n < 300) ? 250 : c; }

/* O MÓDULO DE HOJE (spec ORGANIZACAO-DO-SISTEMA, fase 2): o bloco do menu em
   que a tela aparece hoje, pela centena (`moduloDe`), traduzido para a lista
   única de módulos (`modulos.js`). O 600 "Sob medida" não é módulo de assunto
   (null). Cada tela declara o módulo do ASSUNTO em `modulo`; o
   `teste_lugar.js` compara os dois para achar o que está fora do lugar.
   ⚠️ O MENU CONTINUA LENDO `moduloDe`: nesta fase ninguém vê diferença. Quando
   o menu único (fase 3) passar a agrupar por `modulo`, esta conta muda junto. */
const MENU_HOJE = { 100:'producao', 200:'expedicao', 250:'posvenda', 300:'estoque', 400:'planejamento',
  500:'compras', 600:null, 900:'administracao' };
function moduloHoje(n){ const k = moduloDe(n); return Object.prototype.hasOwnProperty.call(MENU_HOJE, k) ? MENU_HOJE[k] : null; }

/* As telas do sob medida, com o número e o nível delas (tecido/nucleo/telas.js). */
function telasSobMedida(){
  let T = {};
  try{ T = require('./tecido/nucleo/telas').TELAS; }catch(e){ return []; }
  const out = [];
  for(const [rota, t] of Object.entries(T)){
    if(t.apelido) continue;
    out.push({ n:t.numero, nome:t.nome, rota:'/sobmedida' + (rota === '/' ? '' : rota), nivel:t.nivel,
      onde:t.contexto === 'operacao' ? 'tablet' : 'computador', perms:['sobmedida.' + t.permissao], sobmedida:true });
  }
  return out.sort((a, b) => a.n - b.n);
}

module.exports = { TELAS, MODULOS, CHEGADA, NIVEIS, NOME_NIVEL, ordemNivel, porNumero, porRota, moduloDe, moduloHoje, MENU_HOJE, telasSobMedida };
