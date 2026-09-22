// O PEDIDO EM PDF — a folha que a revenda confere.
//
// ⚠️ TUDO SAI DO PEDIDO GRAVADO, nunca do catalogo. Se esta folha fosse
// montada relendo preco e ficha, ela sairia diferente do que foi enviado no
// dia em que alguem reajustasse a colecao — e quem confere e a revenda, com o
// papel na mao, semanas depois. Por isso o gerador recebe o pedido pronto do
// `dominio/pedido.js` e nao conhece o resto do modulo.
//
// ⚠️ E ELE NAO E A ETIQUETA. A etiqueta de producao (fase 4) fala com a
// bancada e traz medida de CORTE; esta folha fala com quem comprou e traz
// medida ACABADA e dinheiro. Misturar as duas poria o preco na bancada e o
// corte na mao do cliente.
const {PDFDocument, StandardFonts, rgb} = require('pdf-lib');
const {ErroDeRegra} = require('../nucleo/erros');
const u = require('../nucleo/unidade');

const MM = 72/25.4;
const A4 = {largura:210*MM, altura:297*MM};
const MARGEM = 15*MM;

/* ⚠️ A FONTE PADRAO DO PDF NAO TEM TUDO. Helvetica escreve em WinAnsi: 'ô',
   '²' e '×' existem, mas '≥', '→' e as setas nao — e `pdf-lib` nao avisa
   direito: ele estoura no meio da geracao, com a folha pela metade. Como o
   texto vem de campo livre (a observacao do pedido, o motivo de um
   cancelamento), o que nao couber vira '?' em vez de derrubar a impressao. */
const RISCO={'≥':'>=','→':'->','⚠':'!','–':'-','—':'-','“':'"','”':'"','‘':"'",'’':"'"};
const txt=v=>String(v==null?'':v)
  .replace(/[≥→⚠–—“”‘’]/g,c=>RISCO[c])
  .replace(/[^\x20-\x7E\xA0-\xFF]/g,'?');

function gerar(pedido){
  if(!pedido) throw new ErroDeRegra('pedido_inexistente','Este pedido nao existe.');
  /* ⚠️ RASCUNHO NAO VIRA PAPEL. A folha e o que a revenda confere, e um
     rascunho tem preco de hoje que muda amanha — impresso, ele vira um
     compromisso que o sistema nao assumiu. Orcamento tem tela; pedido tem
     folha. */
  if(!pedido.congelado)
    throw new ErroDeRegra('pedido_nao_enviado',
      'So o pedido enviado vira folha: no rascunho o preco ainda e o de hoje, e o papel vira '+
      'um compromisso que o sistema nao assumiu. Envie primeiro.');

  return PDFDocument.create().then(async doc=>{
    const normal=await doc.embedFont(StandardFonts.Helvetica);
    const forte =await doc.embedFont(StandardFonts.HelveticaBold);
    const preto=rgb(0,0,0), cinza=rgb(0.42,0.45,0.5), risca=rgb(0.8,0.82,0.85);

    let pag=null, y=0;
    const novaPagina=()=>{ pag=doc.addPage([A4.largura,A4.altura]); y=A4.altura-MARGEM; };
    const espaco=h=>{ if(!pag||y-h<MARGEM+14*MM) { novaPagina(); return true; } return false; };
    const linha=(t,{x=MARGEM,tam=9,fonte=normal,cor=preto,dy=4.6*MM,dir=null}={})=>{
      const s=txt(t);
      const px=dir==null?x:(A4.largura-MARGEM-fonte.widthOfTextAtSize(s,tam));
      pag.drawText(s,{x:px,y,size:tam,font:fonte,color:cor});
      y-=dy;
    };
    const regua=()=>{ pag.drawLine({start:{x:MARGEM,y:y+2*MM},end:{x:A4.largura-MARGEM,y:y+2*MM},
      thickness:0.5,color:risca}); y-=2*MM; };

    novaPagina();

    // ── Cabecalho ────────────────────────────────────────────────────────
    const titulo=(pedido.tipo==='pedido'?'Pedido ':'Orcamento ')+(pedido.numero||('#'+pedido.id));
    linha(titulo,{tam:16,fonte:forte,dy:6.5*MM});
    linha(pedido.revenda.nome_fantasia,{tam:11,fonte:forte});
    linha('Vendedor: '+(pedido.revenda.vendedor_nome||'— sem vendedor —')+
          '   ·   Enviado em '+(pedido.enviado_em||'—')+
          '   ·   '+(pedido.entrega==='retira'?'Retira na fabrica':'Entrega'),{cor:cinza});
    if(pedido.prazo)
      linha('Pronto em '+pedido.prazo.atual_extenso+
            (pedido.prazo.negociado?'  (prometido no envio: '+pedido.prazo.prometido_extenso+')':''),
            {fonte:forte});
    if(pedido.marco==='cancelado')
      linha('PEDIDO CANCELADO em '+pedido.cancelado_em+' — '+pedido.cancelado_motivo,{fonte:forte});
    regua();

    // ── As persianas ─────────────────────────────────────────────────────
    for(const item of pedido.itens){
      espaco(30*MM);
      const cabeca=(item.cancelado_em?'CANCELADA · ':'')+'Peca '+item.n+
        (item.degrau_nome?'   ·   '+item.degrau_nome:'');
      linha(cabeca,{tam:10,fonte:forte});
      linha(item.resumo||'',{cor:cinza});
      if(item.cancelado_em)
        linha('Cancelada por '+item.cancelado_por+': '+item.cancelado_motivo,{cor:cinza});
      if(item.sem_tecido&&item.sem_tecido_motivo)
        linha('Sem tecido na fabrica: '+item.sem_tecido_motivo,{cor:cinza});

      /* ⚠️ AS LINHAS DE PRECO SAEM UMA A UMA, com a conta escrita do lado.
         So o total faria a conferencia da revenda virar "confie no numero" —
         e e justamente a conferencia dela que acha o erro de digitacao da
         medida antes de a peca ser cortada. */
      for(const l of (item.linhas||[])){
        espaco(6*MM);
        linha('   '+l.nome+(l.base?'   '+l.base:''),{tam:8,cor:cinza,dy:0});
        linha('R$ '+u.emReais(l.valor_centavos),{tam:8,cor:cinza,dir:'fim',dy:4*MM});
      }
      if(!item.cancelado_em){
        linha('   Subtotal Deccorar',{tam:9,dy:0});
        linha('R$ '+(item.valor_subtotal||'—'),{tam:9,dir:'fim',dy:4.6*MM});
        if(item.valor_final!=null){
          linha('   Voce paga',{tam:9,fonte:forte,dy:0});
          linha('R$ '+item.valor_final,{tam:9,fonte:forte,dir:'fim',dy:4.6*MM});
        }
      }
      regua();
    }

    // ── O total ──────────────────────────────────────────────────────────
    espaco(30*MM);
    const p=pedido.preco;
    linha('Total Deccorar',{tam:10,dy:0});
    linha('R$ '+(p.valor_total||p.valor_piso||'—'),{tam:10,dir:'fim'});
    if(p.tabela&&p.tabela.desconto!=null)
      linha('Tabela '+p.tabela.nome+' (-'+p.tabela.desconto+'%) e desconto de '+
            p.desconto+'%, em cascata',{tam:8,cor:cinza});
    if(p.valor_revenda!=null){
      linha('TOTAL A PAGAR',{tam:13,fonte:forte,dy:0});
      linha('R$ '+p.valor_revenda,{tam:13,fonte:forte,dir:'fim',dy:6*MM});
    }
    /* ⚠️ O QUE MUDOU DEPOIS DO ENVIO APARECE, em vez de o total simplesmente
       baixar. A revenda tem a folha antiga na mao: um numero menor sem nada
       explicando vira telefonema, e o que estava certo passa a parecer erro. */
    if(p.mudou_depois_do_envio)
      linha('O envio prometia R$ '+p.valor_enviado+' — peca(s) cancelada(s) depois disso.',
            {tam:8,cor:cinza});
    if(pedido.observacao){
      regua();
      linha('Observacao: '+pedido.observacao,{tam:9,cor:cinza});
    }

    const bytes=await doc.save();
    return {arquivo:Buffer.from(bytes),
            nome:'pedido-'+(pedido.numero||pedido.id)+'.pdf'};
  });
}

module.exports={gerar};
