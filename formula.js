/* Avaliador de formula da ficha tecnica — a UNICA porta por onde uma expressao
 * do banco e executada. COMPRAS.md §13 regra 21.
 *
 * POR QUE NAO eval(): uma string vinda do banco executada como JavaScript e
 * execucao de codigo arbitrario com a permissao do servidor. Quem edita formula
 * passaria a poder ler o banco inteiro, o .session_secret e os PINs. Nao e risco
 * teorico — e uma linha de texto num campo de cadastro.
 *
 * Este avaliador e um descendente recursivo pequeno: tokeniza, aceita SO numeros,
 * as variaveis conhecidas, os operadores + - * / e as funcoes da lista, e recusa
 * qualquer outra coisa. Nao ha acesso a objeto, propriedade, chamada de metodo
 * nem literal de string. O que ele nao entende, ele rejeita — nunca ignora.
 *
 * VARIAVEIS, em centimetros inteiros:
 *   largura, altura          medidas do SKU
 *   largura_bobina           largura da bobina candidata (so em linha de tecido)
 *
 * FUNCOES: teto(x) piso(x) max(a,b,...) min(a,b,...)
 *
 * O resultado sai na UNIDADE DE CONSUMO do componente — a formula que devolve
 * metro divide por 100 explicitamente, para a conta ficar legivel no cadastro.
 */

const FUNCOES = {
  teto: a => Math.ceil(a[0]),
  piso: a => Math.floor(a[0]),
  max:  a => Math.max.apply(null, a),
  min:  a => Math.min.apply(null, a)
};
const VARIAVEIS = ['largura','altura','largura_bobina'];

class ErroFormula extends Error {}

/* ── tokenizador ───────────────────────────────────────────────────────────── */
function tokenizar(txt){
  const t = [];
  const s = String(txt == null ? '' : txt);
  let i = 0;
  while(i < s.length){
    const c = s[i];
    if(/\s/.test(c)){ i++; continue; }
    if(/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i+1] || ''))){
      let j = i;
      while(j < s.length && /[0-9.]/.test(s[j])) j++;
      const n = s.slice(i, j);
      if((n.match(/\./g) || []).length > 1) throw new ErroFormula('número inválido: ' + n);
      t.push({ tipo:'num', v:parseFloat(n) }); i = j; continue;
    }
    if(/[A-Za-z_]/.test(c)){
      let j = i;
      while(j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      const nome = s.slice(i, j);
      if(FUNCOES[nome])            t.push({ tipo:'func', v:nome });
      else if(VARIAVEIS.includes(nome)) t.push({ tipo:'var', v:nome });
      else throw new ErroFormula('não conheço "' + nome + '". Use ' + VARIAVEIS.join(', ')
             + ' ou as funções ' + Object.keys(FUNCOES).join(', '));
      i = j; continue;
    }
    if('+-*/(),'.includes(c)){ t.push({ tipo:c }); i++; continue; }
    // × e ÷ digitados de verdade, e a virgula decimal do teclado brasileiro
    if(c === '×'){ t.push({ tipo:'*' }); i++; continue; }
    if(c === '÷'){ t.push({ tipo:'/' }); i++; continue; }
    throw new ErroFormula('caractere não permitido: "' + c + '"');
  }
  return t;
}

/* ── descendente recursivo ─────────────────────────────────────────────────── */
function analisar(tokens, vars){
  let p = 0;
  const olhar = () => tokens[p];
  const comer = tipo => {
    if(!tokens[p] || tokens[p].tipo !== tipo) throw new ErroFormula('esperava "' + tipo + '" aqui');
    return tokens[p++];
  };

  function soma(){
    let v = produto();
    while(olhar() && (olhar().tipo === '+' || olhar().tipo === '-')){
      const op = tokens[p++].tipo;
      const d = produto();
      v = (op === '+') ? v + d : v - d;
    }
    return v;
  }
  function produto(){
    let v = unario();
    while(olhar() && (olhar().tipo === '*' || olhar().tipo === '/')){
      const op = tokens[p++].tipo;
      const d = unario();
      if(op === '/'){
        if(d === 0) throw new ErroFormula('divisão por zero');
        v = v / d;
      } else v = v * d;
    }
    return v;
  }
  function unario(){
    if(olhar() && olhar().tipo === '-'){ p++; return -unario(); }
    if(olhar() && olhar().tipo === '+'){ p++; return unario(); }
    return atomo();
  }
  function atomo(){
    const t = olhar();
    if(!t) throw new ErroFormula('a fórmula termina antes do esperado');
    if(t.tipo === 'num'){ p++; return t.v; }
    if(t.tipo === 'var'){
      p++;
      const v = vars[t.v];
      if(v == null || !Number.isFinite(v))
        throw new ErroFormula('"' + t.v + '" não tem valor aqui'
          + (t.v === 'largura_bobina' ? ' — essa variável só existe em linha de tecido' : ''));
      return v;
    }
    if(t.tipo === 'func'){
      p++; comer('(');
      const args = [soma()];
      while(olhar() && olhar().tipo === ','){ p++; args.push(soma()); }
      comer(')');
      return FUNCOES[t.v](args);
    }
    if(t.tipo === '('){ p++; const v = soma(); comer(')'); return v; }
    throw new ErroFormula('não esperava "' + t.tipo + '" aqui');
  }

  const r = soma();
  if(p < tokens.length) throw new ErroFormula('sobrou "' + (tokens[p].v != null ? tokens[p].v : tokens[p].tipo) + '" no fim da fórmula');
  return r;
}

/* Avalia. Lanca ErroFormula com mensagem em portugues — nunca devolve NaN. */
function avaliar(expressao, vars){
  const t = tokenizar(expressao);
  if(!t.length) throw new ErroFormula('fórmula vazia');
  const r = analisar(t, vars || {});
  if(!Number.isFinite(r)) throw new ErroFormula('o resultado não é um número');
  return r;
}

/* ── validacao de cadastro (§3: a formula e testada antes de salvar) ────────── */
/* As tres medidas do documento. A do meio e uma persiana real. */
const MEDIDAS_TESTE = [
  { largura:100, altura:100 },
  { largura:180, altura:150 },
  { largura:300, altura:250 }
];

/* Testa a expressao nas tres medidas. Devolve {ok, testes, erro}.
   Resultado zero, negativo ou absurdo NAO passa — regra do §3. Formula errada em
   cadastro vira compra errada em producao; melhor recusar na tela. */
function validar(expressao, opcoes){
  const o = opcoes || {};
  const testes = [];
  for(const m of MEDIDAS_TESTE){
    const vars = { largura:m.largura, altura:m.altura };
    if(o.largura_bobina != null) vars.largura_bobina = o.largura_bobina;
    let v;
    try{ v = avaliar(expressao, vars); }
    catch(e){ return { ok:false, erro:e.message, testes }; }
    if(v <= 0)
      return { ok:false, testes, erro:'em ' + m.largura + ' × ' + m.altura + ' o resultado é '
        + v + '. Quantidade tem que ser maior que zero — um consumo zero vira custo mentiroso.' };
    if(v > 100000)
      return { ok:false, testes, erro:'em ' + m.largura + ' × ' + m.altura + ' o resultado é '
        + v + ', o que não parece uma quantidade real. Confira se falta dividir por 100.' };
    testes.push({ largura:m.largura, altura:m.altura, resultado:v });
  }
  return { ok:true, testes };
}

module.exports = { avaliar, validar, ErroFormula, MEDIDAS_TESTE, VARIAVEIS, FUNCOES:Object.keys(FUNCOES) };
