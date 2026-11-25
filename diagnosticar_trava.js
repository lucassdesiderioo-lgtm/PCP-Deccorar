#!/usr/bin/env node
/* QUANTAS CAIXAS TRAVARIAM A 201 (CONFERENCIA-CARRINHOS fase 3) — SÓ LÊ.
 *
 *   node diagnosticar_trava.js
 *
 * Copia o banco com db.backup() (nunca abre o de verdade para escrever) e roda
 * a MESMA régua da trava (trava_dominio.caixas) na cópia: lista cada caixa
 * impressa num dia anterior e sem conferência, por dia de impressão, com
 * cliente, NF, SKU e quem imprimiu. Rode ANTES do deploy: se sair alguma, a
 * 201 já amanhece travada. O caminho para as muito antigas é o passivo das
 * nunca conferidas (fechar_saida_passivo.js --nao-bipadas --ate …), que dá a
 * baixa; as de ontem se bipam na Conferência.
 */
const Database = require('better-sqlite3');
const fs = require('fs'), os = require('os'), path = require('path');
const caminhos = require('./caminhos');

(async () => {
  if(!fs.existsSync(caminhos.BANCO)){ console.log('banco não encontrado em ' + caminhos.BANCO); process.exit(1); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-trava-diag-'));
  const copia = path.join(tmp, 'copia.db');
  const orig = new Database(caminhos.BANCO, { readonly:true, fileMustExist:true });
  await orig.backup(copia); orig.close();
  const db = new Database(copia);
  const T = require('./trava_dominio');
  T.garantirSchema(db);   // na cópia: as colunas novas, vazias
  const cx = T.caixas(db);
  console.log('\nCAIXAS QUE TRAVARIAM A 201 HOJE: ' + cx.length + '\n');
  const porDia = {};
  cx.forEach(c => { const d = String(c.embalado_em || '').slice(0, 10); (porDia[d] = porDia[d] || []).push(c); });
  Object.keys(porDia).sort().forEach(d => {
    console.log('impressas em ' + d + ': ' + porDia[d].length);
    porDia[d].forEach(c => console.log('   #' + c.id + '  NF ' + (c.nf || '—') + '  ' + (c.codigo || '') +
      (c.pecas > 1 ? ' (' + c.pecas + ' persianas)' : '') + '  ' + (c.buyer || '') +
      '  · ' + (c.modalidade || 'agencia') + (c.adiantada ? ' · adiantada, despacho ' + c.despachar_em : '') +
      (c.impresso_por ? ' · imprimiu ' + c.impresso_por : '')));
  });
  if(!cx.length) console.log('Nenhuma: a 201 não amanhece travada.');
  db.close(); fs.rmSync(tmp, { recursive:true, force:true });
})().catch(e => { console.error(e); process.exit(1); });
