/* O RETRATO DIÁRIO DA CENTRAL DE PENDÊNCIAS (RELATORIOS-UNIFICADOS, R7,
 * decisão do dono em 08/11/2026: "(a)"). A central só sabe o número de AGORA;
 * para o relatório mostrar "bloqueados e pendências por semana" alguém tem que
 * guardar o número de cada dia. Este é o dono da tabela `pendencias_dia`.
 *
 *   uma linha por dia · o ÚLTIMO retrato do dia (o mesmo jeito do fechamento)
 *
 * Quem grava é a rota da central (`pendencias_route.js`), toda vez que alguém
 * pergunta o resumo ou o total — a bancada e a TV perguntam a cada minuto. O
 * número é o do `pendencias_dominio.resumo`, já pronto: aqui não há conta, só a
 * linha. A tabela fica FORA do modo teste (como o `fechamento`): é retrato do
 * que a central mostrou, e o dia começa vazio no deploy — antes disso é "sem
 * registro", nunca zero.
 */
function garantir(db){
  db.exec(`CREATE TABLE IF NOT EXISTS pendencias_dia (
    data TEXT PRIMARY KEY,
    total INTEGER,
    bloqueados INTEGER,
    sem_etiqueta INTEGER,
    linhas TEXT DEFAULT '{}',
    atualizado_em TEXT DEFAULT (datetime('now','localtime')))`);
}

/* Grava o retrato de hoje. Falha nunca derruba a central: vai ao log. */
function gravar(db, resumo){
  try{
    garantir(db);
    const por = {};
    (resumo.linhas || []).forEach(l => { if(l.n != null) por[l.chave] = l.n; });
    db.prepare(`INSERT INTO pendencias_dia (data,total,bloqueados,sem_etiqueta,linhas,atualizado_em)
      VALUES (date('now','localtime'),?,?,?,?,datetime('now','localtime'))
      ON CONFLICT(data) DO UPDATE SET total=excluded.total, bloqueados=excluded.bloqueados,
        sem_etiqueta=excluded.sem_etiqueta, linhas=excluded.linhas, atualizado_em=excluded.atualizado_em`)
      .run(resumo.total, por.bloqueados != null ? por.bloqueados : null, resumo.sem_etiqueta || 0, JSON.stringify(por));
  }catch(e){ console.log('[pendencias_dia] ' + (e && e.message)); }
}

function porPeriodo(db, de, ate){
  garantir(db);
  return db.prepare("SELECT data, total, bloqueados, sem_etiqueta FROM pendencias_dia WHERE data BETWEEN ? AND ? ORDER BY data")
    .all(de, ate);
}
function primeira(db){
  try{ garantir(db); return db.prepare("SELECT MIN(data) d FROM pendencias_dia").get().d || null; }catch(e){ return null; }
}

module.exports = { garantir, gravar, porPeriodo, primeira };
