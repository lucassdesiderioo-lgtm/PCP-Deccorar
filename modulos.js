/* OS MÓDULOS DA EMPRESA — dono único (spec ORGANIZACAO-DO-SISTEMA, fase 2,
 * 10/11/2026; cartões R-ORG em docs/regras/organizacao.md).
 *
 * Uma lista só, lida pelas duas operações: o mapa da medida padrão
 * (`telas.js`), o do sob medida (`tecido/nucleo/telas.js`) e o
 * `teste_lugar.js`. Cada tela declara `modulo` (o do ASSUNTO dela, R-ORG-02),
 * `bloco` (R-ORG-05) e `liga` (R-ORG-07).
 *
 * ⚠️ A LISTA É FECHADA (R-ORG-01): módulo novo só com aprovação do dono e
 * linha em docs/DECISOES.md. As faixas de 1000 em diante foram confirmadas
 * pelo dono em 10/11/2026.
 *
 * ⚠️ O ☰ MENU DAS DUAS OPERAÇÕES LÊ DAQUI (fase 3, menu único): os módulos
 * na ordem desta lista, e os blocos na ordem de BLOCOS. A tela de Acessos
 * continua agrupando pela centena (`moduloDe` do `telas.js`).
 */

/* tipo: 'producao' (blocos de operação), 'venda' (blocos de canal), 'misto'
   (os dois — Relatórios, decisão do dono em 10/11/2026: o relatório de produção
   sai por operação, o de venda por canal) e 'demais' (só Comum). */
const MODULOS = [
  { chave:'comercial',     nome:'Comercial',                  faixa:1000, tipo:'venda',    situacao:'existe' },
  { chave:'portal',        nome:'Portal da revenda',          faixa:1800, tipo:'demais',   situacao:'reservado' },
  { chave:'planejamento',  nome:'Planejamento',               faixa:400,  tipo:'producao', situacao:'existe' },
  { chave:'producao',      nome:'Produção',                   faixa:100,  tipo:'producao', situacao:'existe' },
  { chave:'expedicao',     nome:'Expedição',                  faixa:200,  tipo:'demais',   situacao:'existe' },
  { chave:'instalacao',    nome:'Instalação e entrega',       faixa:1500, tipo:'demais',   situacao:'reservado' },
  { chave:'posvenda',      nome:'Pós-venda',                  faixa:250,  tipo:'venda',    situacao:'existe' },
  { chave:'estoque',       nome:'Estoque de produto pronto',  faixa:300,  tipo:'producao', situacao:'existe' },
  { chave:'almoxarifado',  nome:'Almoxarifado',               faixa:1200, tipo:'producao', situacao:'existe' },
  { chave:'compras',       nome:'Compras',                    faixa:500,  tipo:'demais',   situacao:'existe' },
  { chave:'cadastros',     nome:'Cadastros',                  faixa:1100, tipo:'producao', situacao:'existe' },
  { chave:'fiscal',        nome:'Fiscal',                     faixa:1300, tipo:'demais',   situacao:'reservado' },
  { chave:'financeiro',    nome:'Financeiro',                 faixa:1400, tipo:'venda',    situacao:'existe' },   // inaugurado pela 616 no menu único (10/11/2026)
  { chave:'relatorios',    nome:'Relatórios e indicadores',   faixa:1600, tipo:'misto',    situacao:'existe' },
  { chave:'administracao', nome:'Administração',              faixa:900,  tipo:'demais',   situacao:'existe' },
  { chave:'frota',         nome:'Frota',                      faixa:700,  tipo:'demais',   situacao:'reservado' },
  { chave:'ml',            nome:'Mercado Livre (integração)', faixa:800,  tipo:'demais',   situacao:'reservado' },
  { chave:'pessoas',       nome:'Pessoas',                    faixa:1700, tipo:'demais',   situacao:'reservado' }
];

const BLOCOS = {
  medida_padrao:'Medida padrão', sob_medida:'Sob medida',
  mercado_livre:'Mercado Livre', revenda:'Revenda', consumidor_final:'Consumidor final',
  comum:'Comum'
};
const BLOCOS_DO_TIPO = {
  producao: ['medida_padrao', 'sob_medida', 'comum'],
  venda:    ['mercado_livre', 'revenda', 'consumidor_final', 'comum'],
  misto:    ['medida_padrao', 'sob_medida', 'mercado_livre', 'revenda', 'consumidor_final', 'comum'],
  demais:   ['comum']
};

/* A FAIXA 600 ESTÁ FECHADA: as 16 telas do sob medida ficam com o número
   (R-TEL-02), e nenhuma tela nova nasce nela (R-ORG-06). */
const FAIXA_FECHADA = 600;

/* OS NÚMEROS DE 10/11/2026 (a 203 vaga incluída). Tela com número daqui fica
   com ele mesmo fora da faixa do módulo (o número não muda, R-TEL-02); tela
   nova tem que nascer na faixa do módulo dela. ⚠️ ESTA LISTA NÃO CRESCE: o
   `teste_lugar.js` a compara com a de 10/11/2026. */
const NUMEROS_ANTIGOS = [101,102,103,104,105, 201,202,203,204,205,206, 251,252,253, 301,302,303,
  401,402,403,404, 501,502,503,504, 601,602,603,604,605,606,607,608,609,610,611,612,613,614,615,616,
  901,902,903,904,905];

/* O QUE ESTÁ FORA DO LUGAR HOJE (R-ORG-14, inventário do §5 da spec). Tela:
   o módulo do assunto não é o bloco em que ela aparece hoje no menu. Aba ou
   parte (`501/materiais`, `302/material`): o assunto não é o da tela.
   ⚠️ A LISTA SÓ ENCOLHE: o item arrumado que continua aqui reprova o teste, e
   o fora do lugar que não está aqui também. `spec` diz quem arruma. */
const FORA_DO_LUGAR = [
  /* ⚠️ DESDE A FASE 3 (menu único, 10/11/2026) NENHUMA TELA ESTÁ AQUI: o menu
     agrupa pelo módulo do assunto, e as 26 telas que estavam fora do lugar
     (103, 402–404, 502–504, 902, 904, 905 e as 16 do sob medida) saíram. Ficam
     as abas e as partes de outro assunto, que só se arrumam movendo-as. */
  { item:'302/material', spec:'ALMOXARIFADO-E-FISCAL' },
  { item:'902/horarios', spec:'a definir: Parâmetros, em Administração (§4-A da spec)' },
  { item:'501/materiais',    spec:'CADASTRO-DE-MATERIAL' },
  { item:'501/fornecedores', spec:'CADASTRO-DE-MATERIAL' },
  { item:'501/almox',        spec:'CADASTRO-DE-MATERIAL' },
  { item:'501/retidos',      spec:'ALMOXARIFADO-E-FISCAL' },
  { item:'501/notas',        spec:'ALMOXARIFADO-E-FISCAL' },
  { item:'501/certificado',  spec:'ALMOXARIFADO-E-FISCAL' }
];

function porChave(k){ return MODULOS.find(m => m.chave === k) || null; }
function blocosDe(k){ const m = porChave(k); return m ? BLOCOS_DO_TIPO[m.tipo] || [] : []; }
/* A faixa de um número: 200 a 249 é Expedição, 250 a 299 é Pós-venda; o resto
   vai pela centena (de 1000 em diante, pelo milhar e a centena: 1100, 1200…). */
function faixaDe(n){ n = +n; if(n >= 250 && n < 300) return 250; return Math.floor(n / 100) * 100; }
function moduloDaFaixa(n){ const f = faixaDe(n); if(f === FAIXA_FECHADA) return null; const m = MODULOS.find(x => x.faixa === f); return m ? m.chave : null; }

module.exports = { MODULOS, BLOCOS, BLOCOS_DO_TIPO, FAIXA_FECHADA, NUMEROS_ANTIGOS, FORA_DO_LUGAR,
  porChave, blocosDe, faixaDe, moduloDaFaixa };
