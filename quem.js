/* quem.js — DONO UNICO de "quem esta fazendo isto" (spec QUEM-FEZ-E-REVISAO §2).
 *
 * Toda acao que grava, grava junto `usuario_id` e `usuario_nome` do login ativo:
 *   - `usuario_id` e o que manda: o nome pode mudar, o id nao;
 *   - `usuario_nome` e o RETRATO do momento, para leitura humana e para a
 *     historia nao depender de a pessoa ainda existir no cadastro.
 *
 * A origem e SEMPRE o servidor (`req.usuario`, posto pelo auth.js a partir da
 * sessao do PIN) — NUNCA um campo mandado pela tela. Campo vindo da tela e
 * campo que se falsifica ou se esquece.
 *
 * Acao de operacao sem login nao grava: `exigir` responde 401. O auth.js ja
 * barra antes; esta e a outra ponta da mesma regra, para que nenhuma linha de
 * producao nasca com `usuario_id` vazio — nem num teste, nem num script, nem no
 * dia em que alguem mexer na ordem do server.js.
 */
function quem(req){
  const u = req && req.usuario;
  if(!u || u.id == null || u.id === '') return null;
  return { usuario_id: u.id, usuario_nome: u.nome != null ? String(u.nome) : null };
}

/* Para as rotas: devolve o quem, ou responde 401 e devolve null. */
function exigir(req, res){
  const q = quem(req);
  if(!q){ res.status(401).json({ erro:'Entre com o seu PIN antes — sem login nada é gravado.', motivo:'sem_login' }); return null; }
  return q;
}

/* "ESTAS DUAS SAO A MESMA PESSOA?" — dono unico da regua (QUEM-FEZ-E-REVISAO
   fase 4, 05/11/2026). E a pergunta de tres travas: quem imprimiu nao confere
   (R-SEG-01), quem conferiu nao separa a cancelada (D8) e a conta "sem segunda
   pessoa" da pilha e da saida. Cada lado e { id, nome }.
     - com o id dos DOIS lados, vale o id: quem mudou de nome no cadastro
       continua sendo a mesma pessoa, e duas pessoas de nome igual nao sao;
     - sem o id de um dos lados (a linha de antes do id), vale o nome, como
       sempre foi: sem espaco nas pontas e sem diferenca de maiuscula;
     - vazio nunca e igual a vazio: nao saber quem fez nao vira acusacao. */
const normNome = s => String(s == null ? '' : s).trim().toLowerCase();
const idOuNulo = v => (v == null || v === '' || !Number.isFinite(+v)) ? null : +v;
function mesmaPessoa(a, b){
  const ia = idOuNulo(a && a.id), ib = idOuNulo(b && b.id);
  if(ia != null && ib != null) return ia === ib;
  const na = normNome(a && a.nome), nb = normNome(b && b.nome);
  return na !== '' && nb !== '' && na === nb;
}

/* O nome e o id de quem esta fazendo isto, soltos, para quem grava numa coluna
   de nome (`recebido_por`, `resolvido_por`…) e na do id ao lado. Sem login:
   nome '' e id null — mas uma rota de escrita nunca chega aqui sem login,
   porque passou pelo `exigir` (ou pelo `portao`) antes. */
const nomeDe = req => { const q = quem(req); return q && q.usuario_nome != null ? q.usuario_nome : ''; };
const idDe = req => { const q = quem(req); return q ? q.usuario_id : null; };
/* A pessoa no formato que os dominios recebem ({id, nome}) — para passar
   adiante quem fez, em vez do `req.usuario` inteiro (que leva areas e o resto
   da sessao). Sem login, null. */
const pessoa = req => { const q = quem(req); return q ? { id: q.usuario_id, nome: q.usuario_nome } : null; };

/* A PORTA DO MODULO (fase 7, 05/11/2026). `app = QUEM.portao(app)` no comeco de
   um modulo de rotas faz TODA escrita registrada ali (post, put, patch,
   delete) passar pelo `exigir` antes do handler — inclusive a rota que alguem
   escrever amanha nesse modulo, sem lembrar de nada. As leituras e o resto do
   `app` (locals, use, get) passam direto.

   O `exigir` entra no lugar do ULTIMO handler, e nao como um middleware a
   mais na frente: o upload grande (`bigJson`) continua lendo o corpo antes, e
   os testes que chamam o handler direto (o ultimo da lista) encontram a porta.
   ⚠️ No Express 5 `bind` e um verbo HTTP do app (BIND, do WebDAV): nunca
   `v.bind(...)` aqui dentro. */
const ESCRITA = new Set(['post','put','patch','delete']);
/* `opcoes.auditar` (uma categoria da auditoria): para o modulo cuja linha NAO
   tem coluna de autor — o cadastro de SKU, de cor, de fornecedor, uma
   configuracao. A escrita que deu certo (resposta sem erro) vira uma linha na
   `auditoria`, que ja guarda `usuario_id` e `usuario_nome` (decisao de
   05/11/2026: espalhar `atualizado_por_id` por dez tabelas de cadastro seria
   schema demais para o mesmo dado). Registrar nunca derruba a acao. */
function auditar(app, req, categoria, acao, alvo, detalhe){
  try{ const ac = app && app.locals && app.locals.acesso; if(ac && ac.auditar) ac.auditar(req, categoria, acao, alvo, detalhe); }catch(e){}
}
const alvoDe = req => { const p = req.params || {}, b = req.body || {};
  const v = p.codigo || p.id || p.sku || p.tid || b.codigo || b.id || b.chave || b.nome || '';
  return String(v == null ? '' : v).slice(0, 120); };
function portao(app, opcoes){
  const cat = opcoes && opcoes.auditar;
  return new Proxy(app, {
    get(alvo, k){
      const v = alvo[k];
      if(ESCRITA.has(k) && typeof v === 'function') return function(rota, ...hs){
        if(typeof rota !== 'string' || !hs.length) return v.apply(alvo, [rota, ...hs]);
        const h = hs[hs.length-1];
        const metodo = String(k).toUpperCase();
        const comPorta = function(req, res, next){
          if(!exigir(req, res)) return;
          if(cat && res && typeof res.json === 'function'){
            const json = res.json, st = () => (res.statusCode == null ? 200 : res.statusCode);
            res.json = function(o){
              if(st() < 400 && !(o && (o.erro || o.ok === false))) auditar(alvo, req, cat, metodo + ' ' + rota, alvoDe(req), '');
              return json.apply(this, arguments);
            };
          }
          return h.call(this, req, res, next);
        };
        return v.apply(alvo, [rota, ...hs.slice(0,-1), comPorta]);
      };
      /* O resto passa COMO ESTA, sem amarrar a funcao: no Express 5 o
         `app.router` e ele mesmo uma funcao (com o `.stack` pendurado), e uma
         copia amarrada perderia o `.stack` — a cobertura do §10 deixaria de ver
         as rotas. Chamado pela porta, o metodo do Express recebe a porta como
         `this`, e tudo o que ele le ou grava nela cai no app (o `set` abaixo). */
      return v;
    },
    set(alvo, k, v){ alvo[k] = v; return true; }
  });
}

module.exports = { quem, exigir, mesmaPessoa, nomeDe, idDe, pessoa, portao, auditar };
