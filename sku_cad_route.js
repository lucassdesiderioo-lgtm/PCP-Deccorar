/* sku_cad_route.js — o cadastro de SKU (GET, POST e DELETE /api/skus).
 *
 * Morava dentro do `server.js` ate 17/09/2026. Saiu de la por um motivo
 * pratico: o `server.js` abre porta e banco real, entao nenhum teste do projeto
 * consegue carrega-lo — e esta e a rota que apagava saldo em silencio. Rota que
 * mexe em estoque e nao da para testar e divida que so fecha no susto.
 * O `require` ficou EXATAMENTE onde as rotas estavam, para a ordem de registro
 * no Express nao mudar.
 *
 * ⚠️ ESTA ROTA MEXE EM `skus.estoque`, e por isso tem tres regras que parecem
 * exagero e nao sao (divida 15 do §14, fechada aqui):
 *
 *  1. CAMPO AUSENTE NAO E CAMPO VAZIO — vale para os QUATRO campos soltos
 *     (`descricao`, `cor`, `estoque`, `alvo`), nao so para as medidas. Antes,
 *     `estoque` e `alvo` tinham ZERO como padrao do corpo e o upsert gravava
 *     `excluded.estoque`: um POST so com codigo e descricao APAGAVA O SALDO.
 *     Sem erro, sem log, sem motivo e sem linha em `ajuste_estoque` — que e o
 *     unico lugar onde saldo mexido a mao deixa rastro (§18). A tela do admin
 *     reenvia os valores e por isso nunca caiu nisso; a API caia.
 *
 *  2. NUMERO IMPOSSIVEL E RECUSADO, NUNCA CLAMPADO. `+estoque||0` aceitava
 *     negativo e engolia fracao e texto virando zero. Clampar em zero seria a
 *     regra 1 outra vez por outra porta: o saldo sumiria em silencio. Quem
 *     manda numero que nao e peca leva 400 com o nome do campo, e o que esta
 *     gravado nao se mexe. Para MANTER o saldo, o jeito e nao mandar o campo.
 *
 *  3. AS DUAS ESCRITAS SAO UMA TRANSACAO SO, e falha e 500. O destravamento
 *     dos volumes (§6) ficava fora de transacao e dentro de um `catch(e){}`
 *     VAZIO: falhou, a API respondia `{ok:true}` e os volumes seguiam
 *     bloqueados sem nenhum sinal — ninguem tinha como saber que a trava nao
 *     abriu. A resposta passou a dizer QUANTOS volumes soltou: "ok:true" nao
 *     distingue "soltei tres" de "nao soltei nada".
 */
module.exports = function(app, db){

/* Vai junto o NOME de cor, tecido e modelo. As colunas de `skus` guardam o
   codigo ('BEGE'), e quem confere a peca na bancada precisa ler a palavra. Sao
   campos a MAIS: tudo que existia continua igual, e nenhuma tela que so lia
   `codigo`/`estoque` muda de comportamento. */
app.get('/api/skus', (req,res)=> res.json(db.prepare(`SELECT s.*,
    c.nome cor_nome, t.nome tecido_nome, m.nome modelo_nome,
    COALESCE(m.exige_medida,1) exige_medida
  FROM skus s
  LEFT JOIN cor c ON c.codigo=s.cor_codigo
  LEFT JOIN tecido t ON t.codigo=s.tecido_codigo
  LEFT JOIN modelo m ON m.id=s.modelo_id
  ORDER BY s.codigo`).all()));
/* Compras Fase 0: o que a tela grava e o que esta NOS CAMPOS, nunca o que o
   codigo do SKU diz. Quem cadastra corrige o preenchimento automatico, e um SKU
   fora da nomenclatura salva normalmente com as medidas digitadas a mao.

   Medida vazia vira NULL, nunca 0 — e por isso que <=0 tambem vira NULL: um
   zero gravado passaria batido pela tela de pendencias e viraria uma mentira
   silenciosa na formula da ficha tecnica. Melhor a linha aparecer como pendente.

   Campo AUSENTE do corpo nao e o mesmo que campo VAZIO: ausente preserva o que
   ja esta no banco. Sem isso, qualquer chamador antigo que so mande
   codigo/descricao/cor apagaria a medida de um SKU ja migrado. */
const cmDe = v => { const n = parseInt(v,10); return (Number.isFinite(n) && n>0) ? n : null; };
/* Quantidade de PECA: inteiro de 0 pra cima, e so isso. Devolve null para tudo
   que nao for peca — vazio, nulo, fracao, negativo, texto — e quem chama
   recusa. Meia persiana nao existe, e saldo negativo tambem nao: as duas outras
   portas do saldo (o ajuste manual e a etiqueta de venda) ja cortam em zero. */
const pecasDe = v => {
  if(v===null || v===undefined) return null;
  const s=String(v).trim();
  if(!/^\d+$/.test(s)) return null;
  const n=parseInt(s,10);
  return Number.isFinite(n) ? n : null;
};
app.post('/api/skus', (req,res)=>{
  const b=req.body||{};
  const {codigo}=b;
  if(!codigo||!codigo.trim()) return res.status(400).json({erro:'código obrigatório'});
  const cod=codigo.trim().toUpperCase();
  const atual=db.prepare('SELECT descricao,cor,estoque,alvo,modelo_id,largura_cm,altura_cm,cor_codigo,tecido_codigo,tem_ficha,custo_direto FROM skus WHERE codigo=?').get(cod)||{};
  const manda=(k,novo)=> (k in b) ? novo : (atual[k]===undefined?null:atual[k]);

  /* Os quatro campos soltos, pela mesma regra das medidas (regra 1 do topo).
     O SKU NOVO nasce com o padrao de sempre: texto vazio e zero. */
  const txtDe=(k)=> (k in b) ? String(b[k]==null?'':b[k]) : (atual[k]===undefined?'':atual[k]);
  const desc=txtDe('descricao'), corTxt=txtDe('cor');

  const recusados=[];
  const qtdDe=(k)=>{
    if(!(k in b)) return atual[k]===undefined ? 0 : (+atual[k]||0);
    const q=pecasDe(b[k]);
    if(q===null){ recusados.push(k); return 0; }
    return q;
  };
  const estoqueFim=qtdDe('estoque'), alvoFim=qtdDe('alvo');
  if(recusados.length)
    return res.status(400).json({erro:recusados.join(' e ')+
      ': informe um número inteiro de peças, de 0 pra cima. Para manter o que está gravado, não mande o campo.'});

  let modeloId=null;
  if('modelo_id' in b){
    const id=parseInt(b.modelo_id,10);
    // id que nao existe vira NULL: o SKU aparece em pendencias em vez de apontar
    // para um modelo fantasma.
    modeloId=Number.isFinite(id)&&db.prepare('SELECT 1 FROM modelo WHERE id=?').get(id) ? id : null;
  } else modeloId=atual.modelo_id===undefined?null:atual.modelo_id;

  let corCod=null;
  if('cor_codigo' in b){
    // Mesmo tratamento do modelo: cor que nao esta na lista vira NULL e o SKU
    // aparece em pendencias. Nao e so higiene — as colunas novas sao as
    // primeiras FKs do schema e o better-sqlite3 liga foreign_keys por padrao,
    // entao um codigo desconhecido derrubaria o INSERT com 500. Cadastro nunca
    // bloqueia (§3 do CLAUDE.md): registra o que da e sinaliza o que falta.
    const c=String(b.cor_codigo||'').trim().toUpperCase();
    corCod=(c&&db.prepare('SELECT 1 FROM cor WHERE codigo=?').get(c))?c:null;
  } else corCod=atual.cor_codigo===undefined?null:atual.cor_codigo;

  let tecCod=null;
  if('tecido_codigo' in b){
    const t=String(b.tecido_codigo||'').trim().toUpperCase();
    tecCod=(t&&db.prepare('SELECT 1 FROM tecido WHERE codigo=?').get(t))?t:null;
  } else tecCod=atual.tecido_codigo===undefined?null:atual.tecido_codigo;

  /* COMPRAS.md §2: o SKU tem ficha tecnica ou nao tem, e e o CADASTRO que
     responde — nunca a ausencia de dados. Deduzir "sem ficha => e revenda"
     silenciaria o erro mais comum: a persiana nova sem ficha lancada apareceria
     como revenda com custo zero e ninguem notaria. */
  const temFicha = ('tem_ficha' in b) ? (b.tem_ficha?1:0)
                 : (atual.tem_ficha===undefined?1:atual.tem_ficha);
  let custoDireto = ('custo_direto' in b) ? (function(){
        const n=parseFloat(String(b.custo_direto==null?'':b.custo_direto).replace(',','.'));
        return (Number.isFinite(n)&&n>=0)?n:null;   // vazio nunca vira zero
      })() : (atual.custo_direto===undefined?null:atual.custo_direto);
  /* §2, tabela de erros: "tem_ficha = 0 com modelo apontado" e bloqueado no
     cadastro. Produto comprado pronto nao tem modelo de fabricacao.
     Mas so e contradicao quando as DUAS coisas vem na mesma requisicao. Se o SKU
     ja tinha modelo e agora esta virando revenda, o modelo simplesmente deixa de
     fazer sentido — recusar ali seria um beco sem saida: nao haveria como fazer
     a transicao sem editar duas vezes. */
  if(!temFicha){
    if(('modelo_id' in b) && modeloId!=null)
      return res.status(400).json({erro:'SKU de revenda não pode ter modelo — ele não é fabricado aqui'});
    modeloId=null;
  }
  if(temFicha) custoDireto=null;   // custo_direto so existe quando tem_ficha = 0

  const gravar=db.prepare(`INSERT INTO skus (codigo,descricao,cor,estoque,alvo,modelo_id,largura_cm,altura_cm,cor_codigo,tecido_codigo,tem_ficha,custo_direto)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(codigo) DO UPDATE SET descricao=excluded.descricao,cor=excluded.cor,estoque=excluded.estoque,alvo=excluded.alvo,
      modelo_id=excluded.modelo_id,largura_cm=excluded.largura_cm,altura_cm=excluded.altura_cm,
      cor_codigo=excluded.cor_codigo,tecido_codigo=excluded.tecido_codigo,
      tem_ficha=excluded.tem_ficha,custo_direto=excluded.custo_direto`);
  /* Cadastrar o SKU libera os volumes retidos por ele (§6) — mas NUNCA os
     retidos por divergencia de leitura da folha. Ali a duvida nao e se o SKU
     existe, e sim QUAL peca o cliente comprou: as duas leituras do PDF
     discordaram. Sem esta guarda, cadastrar um SKU qualquer soltaria um volume
     que ninguem conferiu. Esses saem so pelo POST /api/divergencias/resolver,
     depois de alguem olhar o pedido no Mercado Livre.
     O mesmo vale pro volume retido por MODALIDADE (§8-B): a etiqueta veio num
     formato que o sistema nao reconhece, e cadastrar SKU nao diz se a caixa vai
     pro carro ou pro canto da coleta. Sai so pelo POST /api/modalidade/resolver.
     E pro retido por PACOTE (§5-B): a etiqueta leva mais de uma persiana, e
     cadastrar um SKU nao responde QUANTAS vao na caixa nem quais. Soltar aqui
     mandaria a caixa embora com a peca a mais nao conferida — que e exatamente
     o buraco que a trava existe pra fechar. Sai so pelo
     POST /api/pacote/resolver, com a gestao assinando peca por peca.

     AS DUAS ESCRITAS ANDAM JUNTAS (regra 3 do topo). Meio caminho aqui e SKU
     cadastrado com os volumes dele ainda bloqueados, e a tela dizendo que deu
     certo — o volume some da lista de quem cadastrou e ninguem vai procura-lo.
     Rollback e `nao gravei, tente de novo`, que a pessoa resolve; `ok:true`
     mentindo, ninguem resolve porque ninguem fica sabendo. */
  let destravados=0;
  try{
    db.transaction(()=>{
      gravar.run(cod,desc,corTxt,estoqueFim,alvoFim,
        modeloId, manda('largura_cm',cmDe(b.largura_cm)), manda('altura_cm',cmDe(b.altura_cm)), corCod, tecCod,
        temFicha, custoDireto);
      destravados=db.prepare(`UPDATE lote SET estagio='pendente' WHERE estagio='bloqueado' AND codigo=?
        AND COALESCE(bloqueio,'') NOT LIKE 'divergencia%' AND COALESCE(bloqueio,'') NOT LIKE 'modalidade%'
        AND COALESCE(bloqueio,'') NOT LIKE 'pacote%'`).run(cod).changes;
    })();
  }catch(e){
    console.error('[skus] POST /api/skus falhou em '+cod+':', e);
    return res.status(500).json({erro:'não consegui gravar o SKU '+cod+': '+e.message+
      ' — nada foi gravado. Tente de novo; se repetir, chame o suporte.'});
  }
  res.json({ok:true,destravados});
});
app.delete('/api/skus/:codigo',(req,res)=>{ db.prepare('DELETE FROM skus WHERE codigo=?').run(req.params.codigo); res.json({ok:true}); });

};
