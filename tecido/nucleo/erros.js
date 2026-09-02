// Um erro de regra e uma recusa do DOMINIO, com nome tecnico e frase humana.
// O registro (nucleo/registro.js) transforma isso no envelope de resposta.
// Qualquer outro erro vira 'erro_interno' e NAO chega ao operador com stack.
class ErroDeRegra extends Error{
  constructor(motivo,mensagem){
    super(mensagem||motivo);
    this.name='ErroDeRegra';
    this.motivo=motivo;        // chave tecnica: 'codigo_repetido'
    this.mensagem=mensagem||motivo;  // texto de tela: 'A etiqueta S-000142 ja existe.'
  }
}

// Acucar para a guarda mais comum do dominio.
const exigir=(condicao,motivo,mensagem)=>{ if(!condicao) throw new ErroDeRegra(motivo,mensagem); };

// Tolerancia de 1 mm. Medida e REAL em metros, e 0.1+0.2 nao da 0.3 em ponto
// flutuante — toda comparacao de medida passa por aqui.
const TOLERANCIA=0.001;
const cabe=(a,b)=>a<=b+TOLERANCIA;          // a cabe em b
const igual=(a,b)=>Math.abs(a-b)<TOLERANCIA;
const atinge=(a,minimo)=>a>=minimo-TOLERANCIA;

module.exports={ErroDeRegra,exigir,TOLERANCIA,cabe,igual,atinge};
