// O HISTORICO DE CORTES — dono unico da LEITURA do que foi cortado
// (spec CORTE-EM-ETAPAS, fase 1).
//
// So le. Nada aqui grava: quem move rolo e sobra continua sendo o plano.
//
// ⚠️ O DETALHE MOSTRA O STATUS DE HOJE DA SOBRA, e nao o que o plano previu.
// E a pergunta que abriu a spec: em 01/10/2026 o plano mandou parte do pedido
// para uma sobra, o tom nao bateu, o operador cortou tudo do rolo — e o
// sistema tinha dado a sobra como USADA no Confirmar. Mostrar so "o plano
// mandou para a S-000014" esconderia justamente que ela esta marcada como
// usada com o retalho inteiro na mao de alguem.
const db=require('../nucleo/db');
const {exigir}=require('../nucleo/erros');
const endereco=require('./endereco');
const etiqueta=require('./etiqueta');

const DIA=/^\d{4}-\d{2}-\d{2}$/;
const endDe=nivel_id=>nivel_id?endereco.descrever(nivel_id):'';

/* AS SOBRAS QUE NASCERAM DE UM CORTE.
   O Confirmar grava o codigo da sobra nascida na faixa (`sobra_gerada_codigo`)
   — mas so da que nasceu de uma FAIXA. O resto de pe embaixo da ultima faixa
   de uma sobra nao tem faixa, e o codigo dele nao ficou em lugar nenhum do
   plano. O que liga os dois e o que o Confirmar grava junto, na MESMA
   transacao: a origem e a fonte do corte, quem cortou, e o mesmo segundo.

   ⚠️ Esta e a regua UNICA de "de onde a sobra nasceu", e a lista, o detalhe e
   a busca por sobra leem por ela. Duas reguas dariam a mesma sobra nascida
   de um corte numa tela e de nenhum na outra. */
const pNascidas=db.prepare(`
  SELECT s.id, s.codigo, s.largura, s.altura, s.area, s.status, s.nivel_id,
         s.baixado_em, s.baixa_motivo, s.criado_em
    FROM plano p
    JOIN sobra s ON (
         s.codigo IN (SELECT sobra_gerada_codigo FROM plano_faixa
                       WHERE plano_id=p.id AND sobra_gerada_codigo IS NOT NULL)
      OR ( (s.origem_rolo_id IN (SELECT rolo_id FROM plano_faixa WHERE plano_id=p.id AND rolo_id IS NOT NULL)
         OR s.origem_sobra_id IN (SELECT sobra_id FROM plano_faixa WHERE plano_id=p.id AND sobra_id IS NOT NULL))
       AND s.criado_por IS p.usuario_nome
       AND ABS(julianday(s.criado_em)-julianday(p.criado_em))*86400 <= 5 ))
   WHERE p.id=?
   UNION
  SELECT s.id, s.codigo, s.largura, s.altura, s.area, s.status, s.nivel_id,
         s.baixado_em, s.baixa_motivo, s.criado_em
    FROM sobra s WHERE s.plano_id=?
   ORDER BY 1`);
/* A sobra guardada depois do corte (fase 2) grava o corte de onde nasceu em
   `sobra.plano_id`, e essa e a resposta direta. A regua de cima fica para os
   cortes de antes, que nao gravavam. */
const nascidas=plano_id=>pNascidas.all(plano_id,plano_id);

/* De qual corte esta sobra nasceu. A mesma regua de cima, lida do outro
   lado: o corte confirmado cujas nascidas contem esta sobra. */
function nasceuEm(s){
  if(s.plano_id) return s.plano_id;
  const cands=db.prepare(`SELECT DISTINCT p.id FROM plano p
     LEFT JOIN plano_faixa pf ON pf.plano_id=p.id
    WHERE p.etapa IS NOT NULL AND (pf.sobra_gerada_codigo=? OR pf.rolo_id=? OR pf.sobra_id=?)
    ORDER BY p.id`).all(s.codigo,s.origem_rolo_id||-1,s.origem_sobra_id||-1);
  const achado=cands.find(c=>nascidas(c.id).some(x=>x.id===s.id));
  return achado?achado.id:null;
}

/* ── A LISTA ─────────────────────────────────────────────────────────────
   Filtros: pedido (pelo comeco do numero — "4292" acha "4292-1"), dia,
   operador e sobra. Sem filtro devolve os mais recentes, o mais novo em cima. */
function listar(filtros){
  const f=filtros||{};
  const onde=['p.etapa IS NOT NULL'], vals=[];

  const pedido=String(f.pedido||'').trim();
  if(pedido){
    onde.push(`EXISTS (SELECT 1 FROM plano_peca pp WHERE pp.plano_id=p.id
                AND UPPER(pp.pedido) LIKE UPPER(?) ESCAPE '\\')`);
    vals.push(pedido.replace(/[\\%_]/g,m=>'\\'+m)+'%');
  }
  const dia=String(f.dia||'').trim();
  if(dia){
    // Data fora do formato nao vira "nada encontrado": a pessoa concluiria
    // que nao houve corte naquele dia.
    exigir(DIA.test(dia),'dia_invalido','O dia se escreve AAAA-MM-DD.');
    onde.push('p.data=?'); vals.push(dia);
  }
  const operador=String(f.operador||'').trim();
  if(operador){ onde.push('UPPER(p.usuario_nome)=UPPER(?)'); vals.push(operador); }

  let sobra=null;
  const cod=etiqueta.limpar(f.sobra);
  if(cod){
    const s=db.prepare('SELECT * FROM sobra WHERE codigo=?').get(cod);
    exigir(s,'sobra_inexistente','Nao ha sobra com o codigo '+cod+'.');
    const usadaEm=db.prepare(`SELECT DISTINCT p.id FROM plano_faixa pf JOIN plano p ON p.id=pf.plano_id
      WHERE pf.sobra_id=? AND p.etapa IS NOT NULL ORDER BY p.id`).all(s.id).map(r=>r.id);
    const nasceu=nasceuEm(s);
    sobra={id:s.id, codigo:s.codigo, largura:s.largura, altura:s.altura,
      status:s.status, endereco:endDe(s.nivel_id), nasceu_em:nasceu, usada_em:usadaEm};
    const ids=[...new Set([...(nasceu?[nasceu]:[]),...usadaEm])];
    onde.push(ids.length?'p.id IN ('+ids.map(()=>'?').join(',')+')':'0');
    vals.push(...ids);
  }

  const filtrado=pedido||dia||operador||cod;
  const limite=Math.min(Number(f.limite)||(filtrado?200:30),500);

  const cortes=db.prepare(`
    SELECT p.id, p.data, p.criado_em, p.usuario_nome, p.tecido_id,
           p.etapa, p.cortar_em, p.feito_em, p.cancelado_em, p.cancelado_motivo,
           (SELECT COUNT(*) FROM sobra_a_guardar g WHERE g.plano_id=p.id
             AND g.guardada_em IS NULL AND g.cancelada_em IS NULL) AS a_guardar,
           p.consumo_linear, p.consumo_m2, p.area_pecas, p.desperdicio,
           l.nome AS linha_nome, a.nome AS abertura_nome, c.nome AS cor_nome,
           (SELECT GROUP_CONCAT(DISTINCT pp.pedido) FROM plano_peca pp
             WHERE pp.plano_id=p.id AND pp.pedido IS NOT NULL AND pp.pedido<>'') AS pedidos,
           (SELECT COUNT(*) FROM plano_peca pp WHERE pp.plano_id=p.id) AS pecas,
           (SELECT COUNT(*) FROM plano_peca pp WHERE pp.plano_id=p.id AND pp.faixa_id IS NULL) AS pecas_sem_lugar,
           (SELECT GROUP_CONCAT(DISTINCT s.codigo) FROM plano_faixa pf JOIN sobra s ON s.id=pf.sobra_id
             WHERE pf.plano_id=p.id) AS sobras_usadas,
           (SELECT GROUP_CONCAT(DISTINCT r.codigo) FROM plano_faixa pf JOIN rolo r ON r.id=pf.rolo_id
             WHERE pf.plano_id=p.id) AS rolos,
           (SELECT ROUND(SUM(area),4) FROM refugo rf WHERE rf.plano_id=p.id) AS area_refugo
      FROM plano p
      LEFT JOIN tecido t ON t.id=p.tecido_id
      LEFT JOIN linha l ON l.id=t.linha_id
      LEFT JOIN abertura a ON a.id=t.abertura_id
      LEFT JOIN cor c ON c.id=t.cor_id
     WHERE ${onde.join(' AND ')}
     ORDER BY p.id DESC LIMIT ${limite}`).all(...vals)
    .map(c=>({...c,
      tecido_nome:[c.linha_nome,c.abertura_nome,c.cor_nome].filter(Boolean).join(' · '),
      sobras_nascidas:nascidas(c.id).length}));

  const operadores=db.prepare(`SELECT DISTINCT usuario_nome AS n FROM plano
     WHERE etapa IS NOT NULL AND usuario_nome IS NOT NULL AND usuario_nome<>'' ORDER BY usuario_nome`)
    .all().map(r=>r.n);

  return {cortes, operadores, sobra, filtrado:!!filtrado, limite};
}

/* ── O DETALHE DE UM CORTE ──────────────────────────────────────────────── */
function detalhe(id){
  const p=db.prepare(`SELECT p.*, l.nome AS linha_nome, a.nome AS abertura_nome, c.nome AS cor_nome
      FROM plano p
      LEFT JOIN tecido t ON t.id=p.tecido_id
      LEFT JOIN linha l ON l.id=t.linha_id
      LEFT JOIN abertura a ON a.id=t.abertura_id
      LEFT JOIN cor c ON c.id=t.cor_id
     WHERE p.id=? AND p.etapa IS NOT NULL`).get(Number(id));
  exigir(p,'corte_inexistente','Corte '+id+' nao encontrado.');

  const faixas=db.prepare(`SELECT pf.*, r.codigo AS rolo_codigo, s.codigo AS sobra_codigo
      FROM plano_faixa pf
      LEFT JOIN rolo r ON r.id=pf.rolo_id
      LEFT JOIN sobra s ON s.id=pf.sobra_id
     WHERE pf.plano_id=? ORDER BY pf.ordem, pf.id`).all(p.id);
  const faixaPorId=new Map(faixas.map(f=>[f.id,f]));

  const linhas=db.prepare('SELECT * FROM plano_peca WHERE plano_id=? ORDER BY ordem, id').all(p.id)
    .map(pc=>{
      const f=pc.faixa_id?faixaPorId.get(pc.faixa_id):null;
      return {ordem:pc.ordem, largura:pc.largura, altura:pc.altura, pedido:pc.pedido||null,
        fonte:f?f.fonte:null,
        fonte_codigo:f?(f.fonte==='rolo'?f.rolo_codigo:f.sobra_codigo):null,
        nao_alocada_motivo:pc.nao_alocada_motivo||null};
    });

  // Uma fonte por rolo ou sobra, por mais faixas que ela tenha levado: um rolo
  // de sete puxadas e um rolo so na prateleira.
  const fontes=[];
  for(const f of faixas){
    const chave=f.fonte+':'+(f.rolo_id||f.sobra_id);
    let g=fontes.find(x=>x.chave===chave);
    if(!g){
      g={chave, fonte:f.fonte, id:f.rolo_id||f.sobra_id,
         codigo:f.fonte==='rolo'?f.rolo_codigo:f.sobra_codigo,
         largura:f.largura_disponivel, faixas:0, metros_puxados:0, pecas:[]};
      fontes.push(g);
    }
    g.faixas++;
    if(f.fonte==='rolo') g.metros_puxados=Math.round((g.metros_puxados+f.altura)*1000)/1000;
  }
  linhas.forEach(l=>{ const g=l.fonte&&fontes.find(x=>x.fonte===l.fonte&&x.codigo===l.fonte_codigo);
    if(g) g.pecas.push(l.ordem); });

  for(const g of fontes){
    if(g.fonte==='sobra'){
      const s=db.prepare('SELECT * FROM sobra WHERE id=?').get(g.id)||{};
      g.medida={largura:s.largura, altura:s.altura};
      g.status_hoje=s.status||null;
      g.endereco=endDe(s.nivel_id);
      g.baixado_em=s.baixado_em||null;
      g.baixado_por=s.baixado_por||null;
      // O que interessa no caso de 01/10: foi ESTE corte que a deu como usada?
      g.marcada_usada_por_este=s.status==='usada'&&s.baixa_motivo==='plano '+p.id;
    } else {
      const r=db.prepare('SELECT * FROM rolo WHERE id=?').get(g.id)||{};
      const mov=db.prepare(`SELECT COALESCE(SUM(-delta),0) AS m FROM movimento_rolo
         WHERE rolo_id=? AND motivo='consumo' AND referencia=?`).get(g.id,String(p.id));
      g.metros_baixados=Math.round(mov.m*1000)/1000;
      g.saldo_hoje=r.saldo;
      g.status_hoje=r.status||null;
      g.endereco=endDe(r.nivel_id);
    }
    delete g.chave;
  }

  const sobrasNascidas=nascidas(p.id).map(s=>({codigo:s.codigo, largura:s.largura, altura:s.altura,
    area:s.area, status_hoje:s.status, endereco:endDe(s.nivel_id)}));

  const refugo=db.prepare(`SELECT largura, altura, area, motivo FROM refugo
     WHERE plano_id=? ORDER BY id`).all(p.id);

  const recusas=db.prepare(`SELECT pr.criado_em, pr.usuario_nome, pr.observacao,
         m.nome AS motivo, s.codigo AS sobra_codigo
      FROM plano_recusa pr
      LEFT JOIN motivo_recusa m ON m.id=pr.motivo_id
      LEFT JOIN sobra s ON s.id=pr.sobra_id
     WHERE pr.plano_id=? ORDER BY pr.id`).all(p.id);

  // A sobra que nasceu e ainda espera alguem guarda-la (fase 2).
  const aGuardar=db.prepare(`SELECT id, largura, altura, area, de, cortada_errada, cortado_por,
      criado_em, guardada_em, guardada_por, cancelada_em, cancelada_motivo,
      (SELECT codigo FROM sobra WHERE id=g.sobra_id) AS sobra_codigo
     FROM sobra_a_guardar g WHERE plano_id=? ORDER BY id`).all(p.id);

  return {
    id:p.id, data:p.data, criado_em:p.criado_em, usuario_nome:p.usuario_nome, origem:p.origem,
    etapa:p.etapa, cortar_em:p.cortar_em, cortar_por:p.cortar_por,
    feito_em:p.feito_em, feito_por:p.feito_por,
    cancelado_em:p.cancelado_em, cancelado_por:p.cancelado_por, cancelado_motivo:p.cancelado_motivo,
    a_guardar:aGuardar,
    tecido_nome:[p.linha_nome,p.abertura_nome,p.cor_nome].filter(Boolean).join(' · '),
    consumo_linear:p.consumo_linear, consumo_m2:p.consumo_m2, area_pecas:p.area_pecas,
    area_sobra_gerada:p.area_sobra_gerada, desperdicio:p.desperdicio,
    linhas, fontes, sobras_nascidas:sobrasNascidas, refugo, recusas
  };
}

module.exports={listar, detalhe, nascidas};
