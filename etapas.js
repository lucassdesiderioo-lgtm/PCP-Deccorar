/* etapas.js — DONO UNICO da lista de etapas da producao da medida padrao
 * (spec PRODUCAO-MAPA-E-MOTOR, fase 1, 12/11/2026).
 *
 * Cada linha da ficha tecnica (404) diz em que etapa o material e preparado
 * (`ficha_formula.etapa`). O ROTEIRO do modelo SAI das linhas, e nao e
 * digitado: uma lista de etapas por modelo ao lado das linhas seria uma segunda
 * verdade sobre a mesma ficha, e as duas divergiriam no primeiro ajuste (#12,
 * e a regra "nao ha coluna tipo" do §7-B).
 *
 * A etapa so e gravada e mostrada: nao muda custo, compra, baixa nem a aba
 * Corte e separacao. Etapa nova entra aqui, e em lugar nenhum mais.
 */
'use strict';

/* As de PREPARO, na ordem da fabrica. */
const PREPARO = [
  { chave:'corte_tecido',   nome:'Corte de tecido' },
  { chave:'corte_tubo',     nome:'Corte de tubo e base' },
  { chave:'kit_comando',    nome:'Kit de comando' },
  { chave:'kit_instalacao', nome:'Kit de instalação' }
];
/* As que toda persiana passa: nao se marcam na linha. */
const SEMPRE = [
  { chave:'montagem',  nome:'Montagem' },
  { chave:'revisao',   nome:'Revisão' },
  { chave:'embalagem', nome:'Embalagem' }
];
/* O que se pode marcar numa linha: as de preparo, e "sai direto na
   embalagem" (fita, caixa, etiqueta). */
const DE_LINHA = PREPARO.concat([{ chave:'embalagem', nome:'Sai direto na embalagem' }]);

const valida = c => DE_LINHA.some(e => e.chave === c);
const nomeDe = c => { const e = DE_LINHA.find(x => x.chave === c); return e ? e.nome : null; };

/* O roteiro de um modelo: as etapas de preparo que alguma linha ATIVA marca,
   na ordem da fabrica, e depois montagem, revisao e embalagem. `sem_etapa` diz
   quantas linhas ativas ainda nao foram marcadas. */
function roteiro(db, modelo_id){
  const linhas = db.prepare('SELECT etapa FROM ficha_formula WHERE modelo_id=? AND ativo=1').all(modelo_id);
  const marcadas = new Set(linhas.map(l => l.etapa).filter(Boolean));
  return {
    etapas: PREPARO.filter(e => marcadas.has(e.chave)).concat(SEMPRE),
    sem_etapa: linhas.filter(l => !l.etapa).length
  };
}

module.exports = { PREPARO, SEMPRE, DE_LINHA, valida, nomeDe, roteiro };
