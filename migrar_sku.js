#!/usr/bin/env node
/* Compras — Fase 0: migracao em um passe.
 *
 * Le os SKUs que ja existem, decompoe o codigo com o parser unico do projeto
 * (public/sku.js) e preenche as colunas novas: modelo_id, largura_cm,
 * altura_cm e cor_codigo. De quebra, monta as tabelas `cor` e `modelo` a partir
 * do que encontrou.
 *
 * O QUE ELA NAO FAZ, por regra:
 *   - nao apaga nada;
 *   - nao altera nenhuma coluna que ja existia (inclusive a antiga `skus.cor`,
 *     que fica com o texto livre dela);
 *   - nao normaliza dado existente fora das colunas novas;
 *   - nao chuta. Codigo fora do padrao fica com os campos NULOS e aparece na
 *     tela de pendencias. Nunca zero: zero e um valor valido e mentiroso.
 *
 * IDEMPOTENTE: so escreve onde a coluna esta NULL, e usa INSERT OR IGNORE em
 * `cor` e `modelo`. Rodar duas vezes nao duplica nem desfaz correcao manual —
 * quem arrumou uma medida errada na tela nao a perde na segunda execucao.
 *
 * USO
 *   node migrar_sku.js --dry [caminho.db]    relatorio, sem gravar nada
 *   node migrar_sku.js       [caminho.db]    aplica
 *
 * O caminho e opcional (padrao: o banco de producao). Rode primeiro com --dry,
 * e de preferencia sobre uma COPIA — lembrando que `cp dados.db` produz backup
 * vazio por causa do WAL (§12): a copia se faz com `node backup.js`.
 */
const path = require('path');
const Database = require('better-sqlite3');
const { medidaDe } = require('./public/sku');
const { garantirSchema } = require('./sku_schema');

const args   = process.argv.slice(2);
const dry    = args.indexOf('--dry') >= 0;
const alvo   = args.filter(function(a){ return a.indexOf('--') !== 0; })[0]
             || '/opt/expedicao/dados.db';

console.log('Banco : ' + path.resolve(alvo));
console.log('Modo  : ' + (dry ? 'SIMULACAO (--dry) — nada sera gravado' : 'APLICAR'));
console.log('');

const db = new Database(alvo);
garantirSchema(db);   // a migracao roda sozinha, sem depender do boot do servidor

const skus = db.prepare('SELECT codigo, modelo_id, largura_cm, altura_cm, cor_codigo FROM skus ORDER BY codigo').all();

/* ── 1. decompor ─────────────────────────────────────────────────────────── */
const cores = new Set(), modelos = new Set(), foraDoPadrao = [];
const lidos = [];
for(const s of skus){
  const p = medidaDe(s.codigo);
  if(!p){ foraDoPadrao.push(s.codigo); continue; }
  cores.add(p.cor); modelos.add(p.fam);
  lidos.push({ sku:s, p:p });
}

/* ── 2. gravar ───────────────────────────────────────────────────────────── */
let novasCores = 0, novosModelos = 0, preenchidos = 0, jaTinham = 0;

const aplicar = db.transaction(function(){
  const insCor = db.prepare('INSERT OR IGNORE INTO cor (codigo, nome) VALUES (?, NULL)');
  const insMod = db.prepare('INSERT OR IGNORE INTO modelo (codigo, nome) VALUES (?, NULL)');
  /* `nome` fica em branco de proposito, nos dois casos: e o rotulo de tela, e
     quem cadastra preenche revisando a lista. A migracao nao inventa nome. */
  for(const c of [...cores].sort()) novasCores  += insCor.run(c).changes;
  for(const m of [...modelos].sort()) novosModelos += insMod.run(m).changes;

  const idModelo = {};
  for(const r of db.prepare('SELECT id, codigo FROM modelo').all()) idModelo[r.codigo] = r.id;

  /* COALESCE mantem o que ja estiver la: a migracao so preenche buraco. */
  const upd = db.prepare(`UPDATE skus SET
      modelo_id  = COALESCE(modelo_id,  @modelo_id),
      largura_cm = COALESCE(largura_cm, @largura_cm),
      altura_cm  = COALESCE(altura_cm,  @altura_cm),
      cor_codigo = COALESCE(cor_codigo, @cor_codigo)
    WHERE codigo = @codigo
      AND (modelo_id IS NULL OR largura_cm IS NULL OR altura_cm IS NULL OR cor_codigo IS NULL)`);

  for(const it of lidos){
    const r = upd.run({ codigo:it.sku.codigo, modelo_id:idModelo[it.p.fam] || null,
                        largura_cm:it.p.larg, altura_cm:it.p.alt, cor_codigo:it.p.cor });
    if(r.changes) preenchidos++; else jaTinham++;
  }
});

if(dry){
  /* Roda tudo e desfaz: o relatorio sai identico ao da execucao real, sem
     deixar rastro. E o unico jeito honesto de simular. */
  db.exec('BEGIN'); try{ aplicar(); } finally { db.exec('ROLLBACK'); }
} else {
  aplicar();
}

/* ── 3. relatorio ────────────────────────────────────────────────────────── */
const um = function(sql){ return db.prepare(sql).get().c; };
const estado = dry ? null : {
  completos: um(`SELECT COUNT(*) c FROM skus WHERE modelo_id IS NOT NULL AND largura_cm IS NOT NULL
                   AND altura_cm IS NOT NULL AND cor_codigo IS NOT NULL`),
  medida:    um('SELECT COUNT(*) c FROM skus WHERE largura_cm IS NULL OR altura_cm IS NULL'),
  modelo:    um('SELECT COUNT(*) c FROM skus WHERE modelo_id IS NULL'),
  cor:       um('SELECT COUNT(*) c FROM skus WHERE cor_codigo IS NULL OR cor_codigo NOT IN (SELECT codigo FROM cor)')
};

console.log('SKUs no cadastro ............ ' + skus.length);
console.log('  decompostos pelo padrao ... ' + lidos.length);
console.log('  preenchidos agora ......... ' + preenchidos);
console.log('  ja estavam preenchidos .... ' + jaTinham);
console.log('  fora do padrao (pendentes)  ' + foraDoPadrao.length);
console.log('');
console.log('Modelos distintos ........... ' + modelos.size + (dry ? '' : '  (' + novosModelos + ' novos)'));
console.log('  ' + ([...modelos].sort().join(', ') || '—'));
console.log('');
console.log('Cores distintas ............. ' + cores.size + (dry ? '' : '  (' + novasCores + ' novas)'));
console.log('  REVISE ESTA LISTA antes de dar a fase por concluida: BEGE, Bege e');
console.log('  BEGE CLARO podem ser a mesma cor escrita de tres jeitos.');
for(const c of [...cores].sort()) console.log('    - ' + c);

if(foraDoPadrao.length){
  console.log('');
  console.log('Fora do padrao — ficaram com os campos NULOS e vao aparecer em pendencias:');
  for(const c of foraDoPadrao) console.log('    - ' + c);
}

if(estado){
  console.log('');
  console.log('Estado final do cadastro:');
  console.log('  completos ................. ' + estado.completos);
  console.log('  medida pendente ........... ' + estado.medida);
  console.log('  modelo pendente ........... ' + estado.modelo);
  console.log('  cor pendente .............. ' + estado.cor);
}

console.log('');
console.log(dry ? 'Simulacao encerrada — nada foi gravado.' : 'Migracao aplicada.');
db.close();
