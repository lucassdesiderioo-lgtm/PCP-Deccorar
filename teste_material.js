#!/usr/bin/env node
/* FASE 1 da spec COMPRAS-E-RECEBIMENTO — o cadastro de material (R-CMP-01 a 10).
 *
 *   node teste_material.js
 *
 * ⚠️ ESCRITO ANTES DO CODIGO (risco vermelho, §0) e conferido reintroduzindo
 * cada defeito. O que trava:
 *   - tudo que se compra e material, e a ficha so oferece o que tem `vai_ficha`;
 *   - material que esta numa ficha nao se desmarca, e a recusa diz os modelos;
 *   - o modo de saldo e escolha obrigatoria para nascer (armadilha #30);
 *   - o backfill dos que ja existiam (quantidade; tecido -> volume, um por nivel);
 *   - `como_sai = 'ficha'` nao se escolhe enquanto a montagem nao existir;
 *   - as regras da #33 nas colunas novas: ausente preserva, vazio apaga,
 *     numero impossivel e recusado dizendo qual campo;
 *   - o almoxarifado padrao: cadastro pela tela, desativar em vez de apagar,
 *     e o material sem almoxarifado contado em Pendencias.
 */
const { bancada, MODULOS } = require('./util_teste_compras');

/* O BACKFILL: tres materiais que existiam ANTES da fase 1, gravados por SQL
   como o banco de producao os tem. O backfill roda no boot do modulo, entao
   eles entram antes de as rotas subirem. */
process.env.PCP_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'pcp-pre-'));
{
  const Database = require('better-sqlite3');
  const pre = new Database(require('path').join(process.env.PCP_DIR, 'dados.db'));
  pre.exec(`CREATE TABLE componente (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT UNIQUE, nome TEXT NOT NULL,
    unidade TEXT, estoque REAL DEFAULT 0, ativo INTEGER DEFAULT 1, criado_em TEXT);
    INSERT INTO componente (nome,unidade) VALUES ('Tubo 38 antigo','m');
    INSERT INTO componente (nome,unidade) VALUES ('Parafuso antigo','un');`);
  pre.exec(`ALTER TABLE componente ADD COLUMN familia TEXT; ALTER TABLE componente ADD COLUMN cor TEXT;
    ALTER TABLE componente ADD COLUMN largura_bobina_cm INTEGER;
    INSERT INTO componente (nome,unidade,familia,cor,largura_bobina_cm) VALUES ('Blackout bege 3,20','m','BLACKOUT','BEGE',320);
    INSERT INTO componente (nome,unidade,familia,cor,largura_bobina_cm,estoque) VALUES ('Blackout cinza 2,80','m','BLACKOUT','CINZA',280,40);`);
  pre.close();
}
const dirAntes = process.env.PCP_DIR;
const B = (() => {
  // a bancada cria a pasta dela; aqui reaproveitamos a do banco "de antes"
  const fs = require('fs'), path = require('path');
  const u = require('./util_teste_compras');
  const b = u.bancada({ modulos: MODULOS.concat(['material_route']) , reusar: dirAntes });
  return b;
})();
const { db, get, post, del, ok, fim, secao } = B;

const ADM = { id:1, nome:'Lucas', admin_geral:true };
const SO_LER = { id:7, nome:'Leitor', permissoes:['compras.ver'] };

(async () => {
  secao('o backfill dos materiais que ja existiam');
  const antes = db.prepare("SELECT * FROM componente ORDER BY id").all();
  ok('quem existia vai para a ficha (vai_ficha = 1)', antes.every(c => c.vai_ficha === 1), () => JSON.stringify(antes.map(c => c.vai_ficha)));
  ok('quem existia sem familia vira "quantidade"', antes.filter(c => !c.familia).every(c => c.modo_saldo === 'quantidade'));
  ok('o tecido (com familia) SEM saldo vira "volume" e um por nivel', antes.filter(c => c.familia && !(c.estoque > 0)).every(c => c.modo_saldo === 'volume' && c.um_por_nivel === 1));
  /* DECISAO DO DONO (07/11/2026, revisao do PR #305): o tecido com saldo de
     antes fica "quantidade" ate ser contado e etiquetado na 504 — virar volume
     sem volume nenhum deixaria o saldo sem os rolos que o compoem (R-CMP-39). */
  ok('o tecido COM saldo de antes fica "quantidade" (ate a contagem na 504)', antes.filter(c => c.familia && c.estoque > 0).every(c => c.modo_saldo === 'quantidade') && antes.some(c => c.familia && c.estoque > 0), () => JSON.stringify(antes.filter(c => c.familia)));
  ok('o backfill roda uma vez so (marca em config)', !!db.prepare("SELECT 1 FROM config WHERE chave='cmp_material_backfill_1'").get());
  db.prepare("UPDATE componente SET vai_ficha=0 WHERE nome='Parafuso antigo'").run();
  require('./compras_schema').garantirSchemaCompras(db);
  ok('rodar o schema de novo NAO volta a marcar o que alguem desmarcou',
     db.prepare("SELECT vai_ficha FROM componente WHERE nome='Parafuso antigo'").get().vai_ficha === 0);

  secao('a categoria');
  const cats = (await get('/api/listas/categoria_material')).corpo.map(x => x.valor);
  ok('a lista nasce com as oito categorias', ['Matéria-prima','Tecido','Embalagem','Ferramenta','Limpeza','Copa','Escritório','Manutenção'].every(c => cats.indexOf(c) >= 0), () => cats.join(','));

  secao('o almoxarifado');
  const almox = (await get('/api/almoxarifados')).corpo;
  ok('nascem "Comandos e montagem" e "Expedição"', ['Comandos e montagem','Expedição'].every(n => almox.some(a => a.nome === n)), () => JSON.stringify(almox));
  let r = await post('/api/almoxarifados', { nome:'Escritório', local:'sala da frente' }, ADM);
  ok('cria um almoxarifado novo pela rota', r.status === 200 && r.corpo.id > 0, () => JSON.stringify(r));
  const idEsc = r.corpo.id;
  r = await post('/api/almoxarifados', { nome:'  ' }, ADM);
  ok('almoxarifado sem nome e recusado', r.status === 400);
  r = await post('/api/almoxarifados', { nome:'escritório' }, ADM);
  ok('nome repetido (sem diferenca de maiuscula) e recusado', r.status === 409, () => JSON.stringify(r));
  r = await post('/api/almoxarifados', { id:idEsc, nome:'Escritório e copa' }, ADM);
  ok('renomear e editar', r.status === 200 && db.prepare('SELECT nome FROM almoxarifado WHERE id=?').get(idEsc).nome === 'Escritório e copa');
  r = await post('/api/almoxarifados', { nome:'X' }, null);
  ok('sem login nada grava (401)', r.status === 401);

  secao('nascer: o modo de saldo e escolha obrigatoria (#30)');
  r = await post('/api/componentes', { nome:'Café 500 g', unidade:'un' }, ADM);
  ok('sem modo de saldo e recusado, dizendo o campo', r.status === 400 && /modo de saldo/i.test(r.corpo.erro), () => JSON.stringify(r.corpo));
  r = await post('/api/componentes', { nome:'Café 500 g', unidade:'un', modo_saldo:'qualquer' }, ADM);
  ok('modo de saldo fora da lista e recusado', r.status === 400);
  r = await post('/api/componentes', { nome:'Café 500 g', unidade:'un', modo_saldo:'sem', categoria:'Copa',
    vai_ficha:0, almoxarifado_id:idEsc }, ADM);
  ok('cadastro rapido: nome, categoria, unidade, modo e almoxarifado bastam', r.status === 200, () => JSON.stringify(r));
  const cafe = db.prepare('SELECT * FROM componente WHERE id=?').get(r.corpo.id);
  ok('o cafe nasce fora da ficha', cafe.vai_ficha === 0);
  ok('e com os padroes da spec: tolerancias 2 e 5, contagem de 30 dias, margem de 5, sai por contagem',
     cafe.tol_aviso_pct === 2 && cafe.tol_retem_pct === 5 && cafe.contagem_dias === 30 && cafe.margem_dias === 5 && cafe.como_sai === 'contagem',
     () => JSON.stringify(cafe));
  r = await post('/api/componentes', { nome:'Tubo 41', unidade:'m', modo_saldo:'quantidade' }, ADM);
  const tubo = db.prepare('SELECT * FROM componente WHERE id=?').get(r.corpo.id);
  ok('sem dizer vai_ficha, o material nasce NA ficha (o caso da materia-prima)', tubo.vai_ficha === 1);
  ok('e sem almoxarifado: nasce, e fica em Pendencias', tubo.almoxarifado_id == null);
  r = await post('/api/componentes', { nome:'Rolo ML 2,80', unidade:'m', modo_saldo:'volume', familia:'SCREEN', cor:'CINZA', largura_bobina_cm:280 }, ADM);
  ok('o tecido em volume nasce "um por nivel"', db.prepare('SELECT um_por_nivel FROM componente WHERE id=?').get(r.corpo.id).um_por_nivel === 1);
  r = await post('/api/componentes', { nome:'Caixa de comando', unidade:'un', modo_saldo:'volume' }, ADM);
  ok('o volume que nao e tecido nasce sem "um por nivel"', db.prepare('SELECT um_por_nivel FROM componente WHERE id=?').get(r.corpo.id).um_por_nivel === 0);

  secao('como sai do estoque: "ficha" esta esperando a montagem (R-CMP-09)');
  r = await post('/api/componentes', { id:tubo.id, como_sai:'ficha' }, ADM);
  ok('"ficha" e recusada dizendo que depende da montagem', r.status === 400 && /montagem/i.test(r.corpo.erro), () => JSON.stringify(r.corpo));
  ok('e nada mudou', db.prepare('SELECT como_sai FROM componente WHERE id=?').get(tubo.id).como_sai === 'contagem');
  const opc = (await get('/api/componentes/opcoes', ADM)).corpo;
  ok('as opcoes dizem que "ficha" esta desligada, com o motivo', opc.como_sai && opc.como_sai.some(o => o.valor === 'ficha' && o.desligada && /montagem/i.test(o.motivo)), () => JSON.stringify(opc));

  secao('as regras da #33 nas colunas novas');
  db.prepare("UPDATE componente SET ncm='39169090', peso_padrao_kg=0.66, categoria='Matéria-prima' WHERE id=?").run(tubo.id);
  r = await post('/api/componentes', { id:tubo.id, estoque_minimo:10 }, ADM);
  const t2 = db.prepare('SELECT * FROM componente WHERE id=?').get(tubo.id);
  ok('editar o minimo NAO apaga ncm, peso, categoria, modo nem almoxarifado', t2.ncm === '39169090' && t2.peso_padrao_kg === 0.66 && t2.categoria === 'Matéria-prima' && t2.modo_saldo === 'quantidade', () => JSON.stringify(t2));
  r = await post('/api/componentes', { id:tubo.id, ncm:'' }, ADM);
  ok('vazio de proposito apaga o ncm', db.prepare('SELECT ncm FROM componente WHERE id=?').get(tubo.id).ncm == null);
  r = await post('/api/componentes', { id:tubo.id, ncm:'3916.90.90' }, ADM);
  ok('o ncm aceita os pontos e grava so os 8 digitos', db.prepare('SELECT ncm FROM componente WHERE id=?').get(tubo.id).ncm === '39169090');
  r = await post('/api/componentes', { id:tubo.id, ncm:'123' }, ADM);
  ok('ncm sem 8 digitos e recusado', r.status === 400 && /NCM/.test(r.corpo.erro));
  for(const [campo, rot] of [['peso_padrao_kg','peso'],['tol_aviso_pct','toler'],['tol_retem_pct','toler'],['contagem_dias','contagem'],['margem_dias','margem']]){
    r = await post('/api/componentes', { id:tubo.id, [campo]:-1 }, ADM);
    ok(campo + ' negativo e recusado dizendo qual campo (nunca clampado)', r.status === 400 && new RegExp(rot, 'i').test(r.corpo.erro), () => JSON.stringify(r.corpo));
    r = await post('/api/componentes', { id:tubo.id, [campo]:'abc' }, ADM);
    ok(campo + ' em texto e recusado', r.status === 400);
  }
  r = await post('/api/componentes', { id:tubo.id, tol_aviso_pct:8, tol_retem_pct:5 }, ADM);
  ok('a faixa de aviso nao pode passar da de reter', r.status === 400 && /aviso/i.test(r.corpo.erro));
  r = await post('/api/componentes', { id:tubo.id, modo_saldo:'' }, ADM);
  ok('o modo de saldo nao se apaga na edicao', r.status === 400 && db.prepare('SELECT modo_saldo FROM componente WHERE id=?').get(tubo.id).modo_saldo === 'quantidade');
  r = await post('/api/componentes', { id:tubo.id, modo_saldo:'volume' }, ADM);
  ok('mudar para volume depois e so marcar (R-CMP-06)', r.status === 200 && db.prepare('SELECT modo_saldo FROM componente WHERE id=?').get(tubo.id).modo_saldo === 'volume');
  await post('/api/componentes', { id:tubo.id, modo_saldo:'quantidade' }, ADM);
  r = await post('/api/componentes', { id:tubo.id, almoxarifado_id:99999 }, ADM);
  ok('almoxarifado que nao existe e recusado', r.status === 400 && /almoxarifado/i.test(r.corpo.erro));
  r = await post('/api/componentes', { id:tubo.id, almoxarifado_id:almox[0].id }, ADM);
  ok('almoxarifado que existe e aceito', r.status === 200 && db.prepare('SELECT almoxarifado_id FROM componente WHERE id=?').get(tubo.id).almoxarifado_id === almox[0].id);

  secao('a ficha tecnica so oferece o que vai_ficha (R-CMP-02)');
  db.exec("INSERT INTO modelo (nome) VALUES ('Rolô teste')");
  const mod = db.prepare("SELECT id FROM modelo WHERE nome='Rolô teste'").get().id;
  r = await post('/api/formulas', { modelo_id:mod, componente_id:cafe.id, expressao:'1' }, ADM);
  ok('a ficha recusa o cafe (vai_ficha = 0)', r.status === 400 && /ficha/i.test(r.corpo.erro), () => JSON.stringify(r));
  r = await post('/api/formulas', { modelo_id:mod, componente_id:tubo.id, expressao:'largura/100' }, ADM);
  ok('e aceita o tubo', r.status === 200, () => JSON.stringify(r));
  r = await post('/api/componentes', { id:tubo.id, vai_ficha:0 }, ADM);
  ok('o tubo que esta numa ficha nao se desmarca', r.status === 409, () => JSON.stringify(r));
  ok('e a recusa diz em quais modelos ele esta', r.corpo && /Rolô teste/.test(r.corpo.erro || ''));
  ok('e nada mudou', db.prepare('SELECT vai_ficha FROM componente WHERE id=?').get(tubo.id).vai_ficha === 1);
  r = await post('/api/componentes', { id:cafe.id, vai_ficha:1 }, ADM);
  ok('marcar de volta e livre', r.status === 200);
  await post('/api/componentes', { id:cafe.id, vai_ficha:0 }, ADM);
  const lista = (await get('/api/componentes', SO_LER)).corpo;
  ok('a lista devolve vai_ficha, modo_saldo e o nome do almoxarifado',
     lista.some(c => c.id === tubo.id && c.almoxarifado_nome === almox[0].nome && c.vai_ficha === 1));

  secao('material sem almoxarifado em Pendencias');
  const pend = require('./material_dominio').pendencias(db);
  const semAlm = db.prepare('SELECT COUNT(*) n FROM componente WHERE ativo=1 AND almoxarifado_id IS NULL').get().n;
  ok('o numero de Pendencias e o mesmo da lista da tela', pend.sem_almoxarifado.n === semAlm && semAlm > 0, () => pend.sem_almoxarifado.n + ' x ' + semAlm);
  const L = require('./pendencias_dominio').LINHAS.find(l => l.chave === 'material_sem_almox');
  ok('a central tem a linha "material sem almoxarifado"', !!L);
  ok('e ela pergunta ao dominio (sem conta propria)', L && L.contar(db).n === semAlm);
  const tela = (await get('/api/componentes/pendencias', ADM)).corpo;
  ok('a tela lista os nomes', tela.sem_almoxarifado && tela.sem_almoxarifado.itens.some(i => i.nome === 'Rolo ML 2,80'));

  secao('desativar almoxarifado com material dentro');
  r = await del('/api/almoxarifados/' + almox[0].id, ADM);
  ok('almoxarifado com material nao se apaga: desativa', r.status === 200 && db.prepare('SELECT ativo FROM almoxarifado WHERE id=?').get(almox[0].id).ativo === 0
     && !!db.prepare('SELECT 1 FROM almoxarifado WHERE id=?').get(almox[0].id));
  r = await post('/api/componentes', { id:cafe.id, almoxarifado_id:almox[0].id }, ADM);
  ok('almoxarifado desativado nao recebe material novo', r.status === 400);
  r = await post('/api/almoxarifados', { id:almox[0].id, ativo:1 }, ADM);
  ok('e se reativa', r.status === 200 && db.prepare('SELECT ativo FROM almoxarifado WHERE id=?').get(almox[0].id).ativo === 1);

  fim();
})().catch(e => { console.error(e); process.exit(1); });
