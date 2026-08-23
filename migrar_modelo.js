#!/usr/bin/env node
/* Correcao de rumo: separa MODELO de TECIDO no cadastro que ja foi migrado.
 *
 * A migracao da Fase 0 (migrar_sku.js) usou o prefixo do codigo como modelo e
 * gravou modelo 'BK' em 24 SKUs. BK e blackout — o TECIDO. Modelo e o
 * mecanismo: Rolo. Este script conserta isso, uma vez.
 *
 * DIFERENCA IMPORTANTE em relacao ao migrar_sku.js: aquele SO PREENCHIA buraco,
 * nunca sobrescrevia. Este SOBRESCREVE `modelo_id` — e o objetivo dele. Por isso
 * o alvo e estreito: mexe apenas em SKU cujo modelo atual e exatamente 'BK', ou
 * nos tres codigos listados abaixo, que ficaram sem modelo por nao casarem com
 * a nomenclatura antiga. Nada mais e tocado.
 *
 * "Isto nao e deduzir modelo do codigo de novo?" Nao. O reaproveitamento aqui e
 * do modelo JA GRAVADO ('BK'), e os tres casos soltos estao escritos um a um,
 * com nome e sobrenome. Roda uma vez, sobre dados que nasceram antes da regra;
 * depois disso nada mais le prefixo em lugar nenhum.
 *
 * USO
 *   node migrar_modelo.js --dry [caminho.db]    relatorio, sem gravar nada
 *   node migrar_modelo.js       [caminho.db]    aplica
 */
const path = require('path');
const Database = require('better-sqlite3');
const { garantirSchema } = require('./sku_schema');

/* ── as decisoes, em um lugar so ──────────────────────────────────────────── */
const MODELOS = [
  { codigo:'ROLO',      nome:'Rolô',      exige_medida:1 },
  { codigo:'ACESSORIO', nome:'Acessório', exige_medida:0 }   // kit nao tem medida
];
const TECIDOS = [
  { codigo:'BLACKOUT', nome:'Blackout'  },
  { codigo:'SCREEN3',  nome:'Screen 3%' }
];
/* Quem hoje aponta para o modelo 'BK' e, na verdade, um rolo de blackout. */
const DE_BK = { modelo:'ROLO', tecido:'BLACKOUT' };
/* Os que ficaram sem modelo por nao casarem com a nomenclatura antiga. */
const AVULSOS = [
  { codigo:'SCREEN3-160140BEGE', modelo:'ROLO', tecido:'SCREEN3',
    largura_cm:160, altura_cm:140, cor:'BEGE' },
  { codigo:'KIT32',              modelo:'ACESSORIO' },
  { codigo:'ACESSORIOSPERSIANAS',modelo:'ACESSORIO' }
];

const args = process.argv.slice(2);
const dry  = args.indexOf('--dry') >= 0;
const alvo = args.filter(a => a.indexOf('--') !== 0)[0] || '/opt/expedicao/dados.db';

console.log('Banco : ' + path.resolve(alvo));
console.log('Modo  : ' + (dry ? 'SIMULACAO (--dry) — nada sera gravado' : 'APLICAR'));
console.log('');

const db = new Database(alvo);
const log = [];
let erro = null;

db.exec('BEGIN');
try{
  garantirSchema(db);

  const upM = db.prepare(`INSERT INTO modelo (codigo,nome,exige_medida,ativo) VALUES (@codigo,@nome,@exige_medida,1)
    ON CONFLICT(codigo) DO UPDATE SET nome=excluded.nome, exige_medida=excluded.exige_medida, ativo=1`);
  for(const m of MODELOS){ upM.run(m); log.push('modelo  ' + m.codigo + ' (' + m.nome + ') exige_medida=' + m.exige_medida); }

  const upT = db.prepare(`INSERT INTO tecido (codigo,nome,ativo) VALUES (?,?,1)
    ON CONFLICT(codigo) DO UPDATE SET nome=excluded.nome, ativo=1`);
  for(const t of TECIDOS){ upT.run(t.codigo,t.nome); log.push('tecido  ' + t.codigo + ' (' + t.nome + ')'); }

  const idDe = {};
  for(const r of db.prepare('SELECT id,codigo FROM modelo').all()) idDe[r.codigo] = r.id;

  /* ── 1. quem aponta para 'BK' vira Rolo + Blackout ───────────────────────── */
  const bk = db.prepare("SELECT id FROM modelo WHERE codigo='BK'").get();
  let migrados = 0;
  if(bk){
    const alvos = db.prepare('SELECT codigo FROM skus WHERE modelo_id=?').all(bk.id);
    const upd = db.prepare('UPDATE skus SET modelo_id=?, tecido_codigo=COALESCE(tecido_codigo,?) WHERE codigo=?');
    for(const s of alvos){ upd.run(idDe[DE_BK.modelo], DE_BK.tecido, s.codigo); migrados++; }
    /* O modelo BK nao e apagado: fica inativo. Some dos selects de cadastro novo
       e continua existindo para quem quiser entender o historico. */
    db.prepare("UPDATE modelo SET ativo=0, nome='(antigo — era o tecido, virou BLACKOUT)' WHERE codigo='BK'").run();
    log.push('');
    log.push(migrados + ' SKU(s) que apontavam para o modelo BK -> modelo Rolô + tecido Blackout');
    log.push('modelo BK desativado (nao apagado)');
  } else {
    log.push('');
    log.push('nenhum modelo BK encontrado — nada a reapontar');
  }

  /* ── 2. os tres avulsos, um a um ─────────────────────────────────────────── */
  log.push('');
  for(const a of AVULSOS){
    const s = db.prepare('SELECT codigo,largura_cm,altura_cm,cor_codigo FROM skus WHERE codigo=?').get(a.codigo);
    if(!s){ log.push('AUSENTE  ' + a.codigo + ' — nao esta no cadastro, pulado'); continue; }
    if(a.cor) db.prepare('INSERT OR IGNORE INTO cor (codigo,nome) VALUES (?,NULL)').run(a.cor);
    /* COALESCE: se alguem ja completou a mao pela tela, a mao vence. */
    db.prepare(`UPDATE skus SET modelo_id=?, tecido_codigo=COALESCE(tecido_codigo,?),
        largura_cm=COALESCE(largura_cm,?), altura_cm=COALESCE(altura_cm,?), cor_codigo=COALESCE(cor_codigo,?)
      WHERE codigo=?`).run(idDe[a.modelo], a.tecido||null,
        a.largura_cm||null, a.altura_cm||null, a.cor||null, a.codigo);
    log.push('OK       ' + a.codigo.padEnd(22) + ' -> modelo ' + a.modelo + (a.tecido ? ', tecido ' + a.tecido : '')
      + (a.largura_cm ? ', ' + a.largura_cm + 'x' + a.altura_cm + ' ' + a.cor : ''));
  }

  /* ── 3. como fica ────────────────────────────────────────────────────────── */
  log.push('');
  log.push('Cadastro depois:');
  for(const r of db.prepare(`SELECT COALESCE(m.nome,m.codigo,'(sem modelo)') modelo,
      COALESCE(s.tecido_codigo,'—') tecido, COUNT(*) n
    FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id
    GROUP BY modelo, tecido ORDER BY n DESC`).all())
    log.push('  ' + String(r.n).padStart(3) + '  ' + r.modelo.padEnd(12) + ' tecido ' + r.tecido);

  const pend = db.prepare(`SELECT COUNT(*) c FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id
    WHERE ((s.modelo_id IS NULL OR COALESCE(m.exige_medida,1)=1) AND (s.largura_cm IS NULL OR s.altura_cm IS NULL))
       OR s.modelo_id IS NULL OR s.cor_codigo IS NULL
       OR s.cor_codigo NOT IN (SELECT codigo FROM cor)`).get().c;
  log.push('');
  log.push('Pendencias de SKU depois: ' + pend);
}catch(e){ erro = e; }
db.exec((dry || erro) ? 'ROLLBACK' : 'COMMIT');

console.log(log.join('\n'));
console.log('');
if(erro){ console.error('Nada foi gravado — a transacao inteira foi desfeita.\n'); throw erro; }
console.log(dry ? 'Simulacao encerrada — nada foi gravado.' : 'Correcao aplicada.');
db.close();
