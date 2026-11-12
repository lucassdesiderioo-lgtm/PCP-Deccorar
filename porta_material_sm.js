/* AS TRES PORTAS DE IDA DO MATERIAL PARA O SOB MEDIDA — spec
 * FICHAS-NO-CADASTRO-UNICO (11/11/2026). Ligadas no montar() pelo server.js;
 * moram aqui, e nao dentro do server.js, para o teste poder chama-las.
 *
 *   custoMaterial(ids)   o custo da unidade pela conta da 404 (precoUnitario)
 *   baixarMaterial(a)    a baixa pela ficha da peca embalada la
 *   materialExtra(a)     o "material extra a decidir" da peca recusada la
 *
 * ⚠️ O SOB MEDIDA NAO TEM MODO TESTE: toda peca de la e de verdade (③ REVISAO).
 * Com o modo teste do PCP ligado, o gatilho marcaria a baixa como teste e o
 * "apagar tudo" a desfaria pela foto — e a peca, ja marcada como baixada la,
 * nunca mais baixaria. Por isso, com o modo ligado, a baixa e ADIADA (o sob
 * medida guarda a linha esperando e tenta de novo na proxima embalagem), e o
 * material extra nasce de verdade (teste=0: ele nao mexe em saldo). */
module.exports = function(db){
  const modoTeste = () => (db.prepare("SELECT valor FROM config WHERE chave='modo_teste'").get() || {}).valor === '1';
  return {
    custoMaterial(ids){
      const out = {};
      for(const id of (ids || [])) out[id] = require('./ficha_dominio').precoUnitario(db, +id);
      return out;
    },
    baixarMaterial(a){
      if(modoTeste()) return { adiado:true, motivo:'modo teste ligado no PCP' };
      return db.transaction(() => require('./baixa_material_dominio').baixar(db,
        Object.assign({ operacao:'sobmedida', motivo:'ficha' }, a, { teste:0 })))();
    },
    materialExtra(a){
      const r = require('./material_extra_dominio').registrar(db, Object.assign({ origem:'sobmedida_recusa', operacao:'sobmedida' }, a));
      if(modoTeste()) db.prepare('UPDATE material_extra SET teste=0 WHERE id=?').run(r.id);
      return r;
    }
  };
};
