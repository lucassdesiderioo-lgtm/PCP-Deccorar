/* A LISTA DE CORTE E SEPARACAO — dono unico (spec PLANEJAMENTO-CORTE-E-SEPARACAO).
 *
 * A aba "Corte e separacao" da 401 transforma a FALTA da "O que produzir" em
 * lista de material para a bancada:
 *
 *   quantas persianas  ← demanda_dominio.aProduzir (o `precisa`, a MESMA conta
 *                        da tela azul, da TV e da compra — #12)
 *   o que cada uma usa ← ficha_dominio.calcularFicha, so as linhas MARCADAS
 *                        "vai para o planejamento da producao" na 404
 *
 * Esta conta NAO tem quantidade propria: nao le venda nem saldo (ha teste
 * varrendo). Se a falta estiver errada, o erro e do demanda_dominio, e a tela
 * azul mostra o mesmo.
 *
 * UMA REGRA SO DE AGRUPAR: o MATERIAL e a MEDIDA DE CORTE. Dela sai, sem regra
 * por tipo, o que o dono pediu em 10/11/2026:
 *   - o tecido aponta a FAMILIA e a cor do SKU escolhe o material → uma linha
 *     por cor;
 *   - tubo, base e corrente sao o mesmo material em toda cor → as cores
 *     juntam pela medida;
 *   - o kit de instalacao nao tem medida de corte → soma todas.
 * Quem decide e a ficha: se um dia o tubo tiver um material por cor, a lista
 * separa sozinha.
 *
 * A quantidade e em PECA (uma por persiana) quando a linha tem medida de
 * corte; sem medida de corte, e o consumo da ficha × persianas, na unidade da
 * linha (o kit `1` → 1 por persiana). Nenhum numero em reais sai daqui: a 401
 * nao tem `custo.ver`, e a ficha de custo e sensivel (§7-B).
 */
const FICHA = require('./ficha_dominio');

const arred = v => Math.round(v * 1000) / 1000;

function infoSku(db, codigo){
  return db.prepare(`SELECT s.codigo, s.largura_cm, s.altura_cm, s.cor_codigo,
      COALESCE(s.tem_ficha,1) tem_ficha, m.exige_medida, COALESCE(m.sob_medida,0) sob_medida
    FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id WHERE UPPER(s.codigo)=UPPER(?)`).get(codigo);
}

/* `faltas` e so para o teste: a rota chama sem nada, e a lista vem do
   demanda_dominio. */
function lista(db, faltas){
  if(!faltas) faltas = require('./demanda_dominio').aProduzir(db);
  const marcadas = db.prepare('SELECT COUNT(*) n FROM ficha_formula WHERE ativo=1 AND planejamento=1').get().n;

  const blocos = new Map();   // material (ou 'tecido') → bloco
  const ordem = {};
  db.prepare('SELECT id, ordem FROM ficha_formula').all().forEach(r => { ordem[r.id] = r.ordem || 0; });
  const fora = [];
  let persianas = 0;

  for(const f of faltas){
    const n = +f.precisa || 0;
    if(n <= 0) continue;
    const s = infoSku(db, f.codigo);
    if(!s){ fora.push({ codigo:f.codigo, qtd:n, motivo:'SKU fora do cadastro' }); continue; }
    if(s.sob_medida){ fora.push({ codigo:s.codigo, qtd:n, motivo:'sob medida — tem o plano de corte dele' }); continue; }
    if(s.exige_medida === 0){ fora.push({ codigo:s.codigo, qtd:n, motivo:'não é persiana com medida (kit ou acessório)' }); continue; }
    if(s.largura_cm == null || s.altura_cm == null){ fora.push({ codigo:s.codigo, qtd:n, motivo:'medida pendente no cadastro do SKU' }); continue; }
    if(!s.tem_ficha){ fora.push({ codigo:s.codigo, qtd:n, motivo:'SKU de revenda — sem ficha técnica' }); continue; }

    const fx = FICHA.calcularFicha(db, s.codigo);
    if(fx.pendencia || fx.erro){ fora.push({ codigo:s.codigo, qtd:n, motivo:fx.pendencia || fx.erro }); continue; }
    const doPlano = (fx.linhas || []).filter(l => l.planejamento);
    if(!doPlano.length){ fora.push({ codigo:s.codigo, qtd:n, motivo:'nenhuma linha da ficha marcada "vai para o planejamento da produção"' }); continue; }

    /* ③ REVISAO (R4): o SKU fica DENTRO ou FORA, nunca nos dois. Linha
       marcada em erro (sem tecido na cor, formula quebrada) tira o SKU inteiro
       da lista, uma vez, com os motivos juntos — senao ele contava nas
       persianas, aparecia no tubo e tambem em "ficou fora". */
    const erros = doPlano.filter(l => !l.componente_id && !l.tecido_sem_preco)
      .map(l => l.erro || 'linha sem material');
    if(erros.length){
      fora.push({ codigo:s.codigo, qtd:n, motivo:'linha da ficha com erro: ' + [...new Set(erros)].join(' · ') });
      continue;
    }

    persianas += n;
    for(const l of doPlano){
      /* O material da linha: o componente da ficha; no tecido, a bobina
         escolhida, ou (sem preco) as candidatas daquela cor. */
      let chaveMat, material, aviso = null;
      if(l.componente_id){ chaveMat = 'c' + l.componente_id; material = l.componente_nome; }
      else {
        const t = l.tecido_sem_preco;
        chaveMat = 'f' + t.familia + '|' + t.cor;
        material = t.nomes.join(' ou ');
        aviso = 'bobina não escolhida: nenhuma tem preço cadastrado';
      }
      const corte = l.corte && l.corte.texto ? l.corte.texto : null;

      /* ③ REVISAO (R3): o BLOCO e o material (ou "o tecido"), e nao a linha da
         ficha — dois modelos com o mesmo tubo somam num bloco so. A ordem do
         bloco e a MENOR `ordem` entre as linhas da ficha que o trouxeram (2ª
         rodada da revisao: a "primeira que chegou" dependia da ordem da falta). */
      const chaveBloco = l.tecido ? 'tecido' : ('c' + l.componente_id);
      let b = blocos.get(chaveBloco);
      if(!b){
        b = { formula_id:l.formula_id, tecido:!!l.tecido,
              material: l.tecido ? 'Tecido' : material, linhas:new Map(), sem_corte:false };
        blocos.set(chaveBloco, b);
      } else if((ordem[l.formula_id]||0) < (ordem[b.formula_id]||0)) b.formula_id = l.formula_id;
      if(!corte && l.corte && l.corte.erro) aviso = 'medida de corte com erro: ' + l.corte.erro;
      const chave = chaveMat + '#' + (corte || '');
      let li = b.linhas.get(chave);
      if(!li){
        li = { material, corte, cor: l.tecido ? (s.cor_codigo || null) : null,
               largura: l.corte && l.corte.largura != null ? l.corte.largura : null,
               altura:  l.corte && l.corte.altura  != null ? l.corte.altura  : null,
               qtd:0, unidade: corte ? 'peça' : (l.unidade || 'un'), aviso, indefinido:false, skus:[] };
        b.linhas.set(chave, li);
      }
      /* Com medida de corte: uma peca por persiana. Sem: o consumo da ficha.
         ③ REVISAO (R2): consumo DESCONHECIDO (o tecido sem preco nao escolhe
         bobina, entao nao ha metragem) e INDEFINIDO, nunca zero (§7-B, regra 4):
         a linha sai com quantidade vazia e o aviso. */
      let q;
      if(corte) q = n;
      else if(l.quantidade == null || isNaN(+l.quantidade)) q = null;
      else q = arred(n * (+l.quantidade));
      if(q == null){ li.indefinido = true; li.aviso = li.aviso || 'quantidade desconhecida'; }
      li.qtd = (li.indefinido || q == null) ? null : arred(li.qtd + q);
      li.skus.push({ codigo:s.codigo, qtd:q });
      if(!corte) b.sem_corte = true;
    }
  }

  const saida = [...blocos.values()].map(b => ({
    formula_id:b.formula_id, tecido:b.tecido, material:b.material,
    /* "sem medida de corte" so acusa onde ela faz falta: linha que tem
       medida em alguma persiana e nao em outra, ou bloco de tecido. O kit
       nunca tem, e isso e resposta, nao pendencia (§7-B). */
    sem_corte: b.sem_corte && (b.tecido || [...b.linhas.values()].some(x => x.corte) ||
      [...b.linhas.values()].some(x => x.unidade === 'm' || x.unidade === 'm linear')),
    linhas:[...b.linhas.values()].sort((x, y) =>
      (x.cor || '').localeCompare(y.cor || '') || (x.largura || 0) - (y.largura || 0)
      || (x.altura || 0) - (y.altura || 0) || x.material.localeCompare(y.material))
  }));

  /* A ordem dos blocos e a da ficha (a `ordem` das linhas), que e a ordem em
     que a bancada trabalha. */
  saida.sort((a, b) => ((ordem[a.formula_id]||0) - (ordem[b.formula_id]||0)) || (a.formula_id - b.formula_id));

  return { persianas, blocos:saida, fora, sem_marcadas: marcadas === 0 };
}

module.exports = { lista };
