/* A TABELA DAS SAIDAS DA FABRICA — dono unico do CREATE.
 *
 * Spec SAIDA-E-DUPLA-CONFERENCIA (25/09/2026), §4. Cada linha e UM caminhao da
 * coleta ou UMA viagem a agencia, com o numero de quem recebeu, a foto e o que
 * o sistema sabe que saiu. Substitui o `coleta_fechamento` de 10/09, que fica
 * como historia, so leitura.
 *
 * Mora num arquivo proprio porque dois lugares precisam da tabela: o
 * carreg_route.js (que a cria no boot) e o fechar_saida_passivo.js (a limpeza
 * de uma vez so). Duas copias do CREATE divergem no primeiro ALTER.
 *
 * `tipo`: 'coleta' | 'agencia' | 'passivo'. O 'passivo' e a limpeza de
 * 25/09/2026 — as caixas que ficaram em "esperando o caminhao" porque o
 * "Fechar coleta" nao foi adotado, e que o dono confirmou que ja sairam.
 * `sobras` e `ids` sao JSON (listas de lote.id).
 */
function garantirSaida(db){
  db.exec(`CREATE TABLE IF NOT EXISTS saida (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    aberta_em TEXT DEFAULT (datetime('now','localtime')),
    fechada_em TEXT,
    fechado_por TEXT DEFAULT '',
    qtd_sistema INTEGER,
    qtd_externa INTEGER,
    divergente INTEGER DEFAULT 0,
    liberado_por TEXT,
    motivo TEXT,
    foto TEXT,
    sobras TEXT DEFAULT '[]',
    ids TEXT DEFAULT '[]',
    sem_segunda_pessoa INTEGER DEFAULT 0);`);
}

module.exports = { garantirSaida };
