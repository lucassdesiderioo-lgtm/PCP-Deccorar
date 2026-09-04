/* O calculo da ficha e do custo de um SKU — dono unico.
 *
 * COMPRAS.md §9: "custo de SKU nunca e calculado em duas partes do sistema."
 * Saiu do ficha_route.js quando o historico de custo passou a precisar da mesma
 * conta: duas copias divergiriam no primeiro ajuste, e o relatorio de evolucao
 * passaria a mentir sem ninguem notar.
 */
const F = require('./formula');

/* Resolucao do tecido: familia + cor do SKU + largura de bobina (§3).
 *
 * DIVERGENCIA CONSCIENTE com o documento, registrada no CLAUDE.md §7-B: o §3
 * manda escolher a bobina de menor preco por metro linear, argumentando que a
 * metragem puxada e a mesma em qualquer uma. Isso vale no corte NAO invertido.
 * No invertido cabem varias pecas lado a lado e a metragem POR PECA depende da
 * bobina — entao aqui a escolha e por CUSTO TOTAL da peca.
 *
 * Quem decide se o corte e invertido e a EXPRESSAO que o comprador escreveu;
 * este arquivo so avalia uma vez por bobina candidata e compara. */
function resolverTecido(db, familia, corSku){
  if(!corSku) return { erro:'o SKU não tem cor definida — sem ela não dá para escolher o tecido' };
  const cands = db.prepare(`SELECT c.id, c.nome, c.largura_bobina_cm,
      ( SELECT MIN(o.preco / o.fator) FROM oferta o JOIN fornecedor f ON f.id=o.fornecedor_id
        WHERE o.componente_id=c.id AND o.ativo=1 AND f.ativo=1 ) preco_linear
    FROM componente c
    WHERE c.familia=? AND c.ativo=1 AND c.largura_bobina_cm IS NOT NULL
      AND (c.cor IS NULL OR c.cor=?)
    ORDER BY c.largura_bobina_cm`).all(familia, corSku);
  if(!cands.length)
    return { erro:'não existe componente da família "'+familia+'" na cor '+corSku
               +'. Cadastre o componente ou corrija a cor do SKU.' };
  return { candidatos:cands };
}

/* Melhor preco por unidade de consumo de um componente. Simples de proposito:
   a comparacao completa (multiplo, minimo, frete, sobra) e do compras_calc, e
   serve para decidir A COMPRA. Aqui a pergunta e outra — quanto vale a unidade
   que a ficha consome. */
/* ⚠️ A MEDIDA DE CORTE, QUE NAO E A MEDIDA DE CONSUMO — e as duas nunca se
   reconciliam. O tubo de uma persiana de 1,60 CONSOME 1,60 m da barra de 6 m e
   e CORTADO a 1,57 (o resto entra nas ponteiras). Os 3 cm vao pro lixo: quem
   precificar pela medida de corte para de pagar por eles, e quem cortar pela
   medida de consumo faz a peca nao entrar.

   Este valor NAO SOMA CUSTO em lugar nenhum. Ele sai na ficha para a bancada
   saber a quanto cortar — hoje esse numero mora na cabeca de quem corta, que e
   a mesma doenca do SOBMEDIDA (§7): o vinculo existe na memoria e nao no
   sistema. Ha caso travando a separacao no teste_ficha.js.

   No tecido a medida e um RETANGULO (largura da peca × altura + folga), no tubo
   e um numero so. Onde nao ha o que cortar — parafuso, comando pronto — as duas
   expressoes ficam vazias, e isso e resposta, nao pendencia. */
function medidaDeCorte(f, vars){
  if(!f.corte_largura && !f.corte_altura) return null;
  const c = { unidade: f.corte_unidade || 'cm' };
  for(const par of [['corte_largura','largura'],['corte_altura','altura']]){
    if(!f[par[0]]) continue;
    try{ c[par[1]] = F.avaliar(f[par[0]], vars); }
    catch(e){ c.erro = e.message; }
  }
  const n = v => (Math.round(v*10)/10).toString().replace('.',',');
  c.texto = c.erro ? null
    : (c.largura!=null && c.altura!=null) ? n(c.largura)+' × '+n(c.altura)+' '+c.unidade
    : n(c.largura!=null?c.largura:c.altura)+' '+c.unidade;
  return c;
}

function precoUnitario(db, componente_id){
  const r = db.prepare(`SELECT MIN(o.preco / o.fator) p FROM oferta o
    JOIN fornecedor f ON f.id=o.fornecedor_id
    WHERE o.componente_id=? AND o.ativo=1 AND f.ativo=1`).get(componente_id);
  return r ? r.p : null;
}

function calcularFicha(db, sku){
  const s = db.prepare(`SELECT s.*, m.nome modelo_nome, m.codigo modelo_codigo, m.exige_medida
    FROM skus s LEFT JOIN modelo m ON m.id=s.modelo_id WHERE s.codigo=?`).get(sku);
  if(!s) return { erro:'SKU não encontrado' };

  /* §2: o de revenda tem custo direto digitado OU o melhor preco vigente das
     ofertas dele. O digitado tem prioridade enquanto existir. */
  if(!s.tem_ficha){
    const cot = db.prepare(`SELECT MIN(o.preco / o.fator) p FROM oferta o
      JOIN fornecedor f ON f.id=o.fornecedor_id
      WHERE o.sku=? AND o.ativo=1 AND f.ativo=1`).get(sku);
    const custo = (s.custo_direto != null) ? s.custo_direto : (cot ? cot.p : null);
    return { sku, tem_ficha:0, linhas:[], custo_material:custo,
      origem:(s.custo_direto!=null)?'digitado':(custo!=null?'cotado':null),
      rotulo:'custo de material', incompleto:custo==null,
      pendencia: custo==null ? 'custo pendente' : null,
      aviso:'SKU de revenda — o custo é direto, não tem ficha' };
  }

  if(s.modelo_id == null)  return { sku, linhas:[], pendencia:'modelo pendente' };

  /* Modelo com exige_medida=0 (acessorio) nao tem largura nem altura, e nunca
     vai ter: kit de 32 mm nao mede 1,80x1,50. Bloquear por medida aqui deixava
     TODO acessorio sem ficha e sem custo para sempre — foi o que jogou os dois
     kits para fora do marco zero do historico e para dentro das pendencias da
     necessidade. A formula que precisar de largura continua reclamando, uma
     linha de cada vez, com o motivo exato ("largura" não tem valor aqui).
     `!== 0` e de proposito: sem modelo ou sem a coluna, o bloqueio continua. */
  if(s.exige_medida !== 0 && (s.largura_cm == null || s.altura_cm == null))
    return { sku, linhas:[], pendencia:'medida pendente' };

  const formulas = db.prepare(`SELECT f.*, c.nome componente_nome, c.unidade
    FROM ficha_formula f LEFT JOIN componente c ON c.id=f.componente_id
    WHERE f.modelo_id=? AND f.ativo=1 ORDER BY f.ordem, f.id`).all(s.modelo_id);
  if(!formulas.length) return { sku, linhas:[], pendencia:'ficha pendente' };

  const base = { largura:s.largura_cm, altura:s.altura_cm };
  const linhas = []; let custo = 0, indefinido = false;

  for(const f of formulas){
    const l = { formula_id:f.id, expressao:f.expressao, observacao:f.observacao };
    if(f.familia){
      const r = resolverTecido(db, f.familia, s.cor_codigo);
      if(r.erro){ l.erro = r.erro; indefinido = true; linhas.push(l); continue; }
      let melhor = null; const opcoes = [];
      for(const c of r.candidatos){
        let q;
        try{ q = F.avaliar(f.expressao, Object.assign({ largura_bobina:c.largura_bobina_cm }, base)); }
        catch(e){ l.erro = e.message; indefinido = true; break; }
        const op = { componente_id:c.id, nome:c.nome, bobina_cm:c.largura_bobina_cm,
                     quantidade:q, preco_linear:c.preco_linear,
                     custo:(c.preco_linear != null) ? q * c.preco_linear : null };
        opcoes.push(op);
        if(op.custo != null && (!melhor || op.custo < melhor.custo)) melhor = op;
      }
      if(l.erro){ linhas.push(l); continue; }
      l.opcoes = opcoes;
      if(!melhor){ l.erro = 'nenhuma bobina desta família tem preço cadastrado'; indefinido = true; linhas.push(l); continue; }
      Object.assign(l, { componente_id:melhor.componente_id, componente_nome:melhor.nome,
        unidade:'m linear', quantidade:melhor.quantidade, preco_unitario:melhor.preco_linear,
        custo:melhor.custo,
        /* Vírgula, não ponto: `bobina 2.80 m` numa tela em que todo o resto
           escreve 2,80 é a paleta "quase igual" do §19 por outra porta — perto
           demais para parecer proposital, diferente o bastante para o olho ver. */
        motivo:'bobina '+(melhor.bobina_cm/100).toFixed(2).replace('.',',')+' m — menor custo por peça' });
      /* A medida de corte do tecido conhece a bobina ESCOLHIDA — e a que vai
         estar na mesa. Corte calculado sobre outra bobina cortaria a peca certa
         do rolo errado. */
      l.corte = medidaDeCorte(f, Object.assign({ largura_bobina:melhor.bobina_cm }, base));
      custo += melhor.custo;
    } else {
      let q;
      try{ q = F.avaliar(f.expressao, base); }
      catch(e){ l.erro = e.message; indefinido = true; linhas.push(l); continue; }
      const p = precoUnitario(db, f.componente_id);
      Object.assign(l, { componente_id:f.componente_id, componente_nome:f.componente_nome,
        unidade:f.unidade, quantidade:q, preco_unitario:p,
        custo:(p != null) ? q * p : null });
      /* Falta de PRECO nao pode apagar a medida de CORTE: a bancada corta o tubo
         do mesmo jeito com ou sem o fornecedor cadastrado, e uma ficha que some
         porque falta preco manda a bancada cortar de memoria. */
      l.corte = medidaDeCorte(f, base);
      if(l.custo == null){ l.erro = 'sem preço de fornecedor cadastrado'; indefinido = true; }
      else custo += l.custo;
    }
    linhas.push(l);
  }

  /* Regra 4: custo indefinido NUNCA vira zero. Se qualquer linha ficou sem
     preco, o total nao existe — nao e a soma parcial. */
  return { sku, modelo:s.modelo_nome||s.modelo_codigo, largura_cm:s.largura_cm,
    altura_cm:s.altura_cm, cor:s.cor_codigo, linhas,
    custo_material: indefinido ? null : custo,
    // Regra 17: enquanto a mao de obra for zero, o numero se chama assim.
    rotulo:'custo de material', incompleto:indefinido };
}

module.exports = { calcularFicha, resolverTecido, precoUnitario };
