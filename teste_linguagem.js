#!/usr/bin/env node
/* As duas regras da spec NAVEGACAO-E-LINGUAGEM, travadas (fase 3).
 *
 *   node teste_linguagem.js
 *
 * REGRA B — texto que quem usa o sistema VE nao nomeia hierarquia: chefia,
 * chefe, patrao, dono, gestao. Varre as telas (public/, views/,
 * tecido/public/), as mensagens das rotas e dos dominios, os nomes de
 * permissao e o que os scripts escrevem no terminal. Comentario fica de fora,
 * e "dono unico" (o arquivo responsavel por uma conta) e excecao explicita.
 *
 * REGRA A — toda tela interna carrega a barra (nav.js) DA SUA operacao. Sem
 * ela a tela nasce sem "Trocar setor" e sem o atalho, e a pessoa so sai pelo
 * login, que era o defeito que a fase 1 consertou.
 *
 * Sem estes casos as duas regras duram ate a proxima tela, porque tela nova se
 * escreve copiando a de cima. O modelo e o `teste_caminhos.js`.
 *
 * Nao toca no banco nem na rede.
 */
const fs = require('fs'), path = require('path');
const {textoVisivel} = require('./texto_visivel');

let ok = 0, falhas = 0;
const caso = (nome, fn) => { try{ fn(); console.log('ok      ' + nome); ok++; }
                             catch(e){ console.log('FALHOU  ' + nome + '\n        ' + e.message.split('\n').join('\n        ')); falhas++; } };
const RAIZ = __dirname;
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

const PROIBIDA = /chefia|chefe|patr[aã]o|\bgest[aã]o\b|\bdon[oa]s?\b/i;
// "dono unico" e o nome tecnico do arquivo que responde por uma conta, e a
// spec o deixa de fora. O resto da frase continua sendo conferido.
const semExcecao = (t) => t.replace(/dono [úu]nico/gi, '');

/* EXCECOES, uma a uma e com o motivo. Excecao que deixa de existir no codigo
   reprova (caso "nenhuma excecao zumbi"): lista que so cresce vira o lugar
   onde o texto proibido entra sem ninguem ver. */
const EXCECOES = [
  {arquivo:'exp_route.js', trecho:"'gestao'",
   motivo:"valor gravado em lote_item.origem; e dado, nao texto de tela (spec §4)"},
  {arquivo:'tecido/nucleo/schema.js', trecho:'a bancada cadastra o que falta, e a chefia confere depois',
   motivo:'nome da migracao 8, ja aplicada; e historia do banco (spec §4)'},
  {arquivo:'tecido/nucleo/schema.js', trecho:'a bancada aponta o erro da sobra, e a chefia aceita',
   motivo:'nome da migracao 13, ja aplicada'},
  {arquivo:'tecido/nucleo/schema.js', trecho:'a producao bipada — inicio, fim, kit e a pendencia que a chefia fecha',
   motivo:'nome da migracao 21, ja aplicada'},
];

function arquivos(dir, filtro, acc){
  acc = acc || [];
  for(const f of fs.readdirSync(path.join(RAIZ, dir))){
    if(f === 'node_modules' || f === '.git' || f === 'docs') continue;
    const rel = path.join(dir, f);
    if(fs.statSync(path.join(RAIZ, rel)).isDirectory()) arquivos(rel, filtro, acc);
    else if(filtro(rel)) acc.push(rel.split(path.sep).join('/'));
  }
  return acc;
}

/* Tudo que pode chegar a quem usa: telas, rotas, dominios, permissoes e
   scripts. Os testes ficam de fora — o nome do caso e para quem desenvolve,
   nao para a fabrica. O `teste_route.js` NAO e teste (e o modulo do modo
   teste, §11) e entra. */
const ehTeste = (f) => (/(^|\/)teste_[^/]*\.js$/.test(f) && !/(^|\/)teste_route\.js$/.test(f))
                    || /^tecido\/teste\//.test(f);
const VARRIDOS = arquivos('.', (f) => /\.(js|html)$/.test(f) && !ehTeste(f.replace(/^\.\//, '')))
  .map((f) => f.replace(/^\.\//, ''));

function achados(){
  const out = [];
  for(const f of VARRIDOS){
    for(const x of textoVisivel(f, ler(f))){
      if(!PROIBIDA.test(semExcecao(x.texto))) continue;
      if(EXCECOES.some((e) => e.arquivo === f && x.texto.includes(e.trecho))) continue;
      out.push(f + ':' + x.linha + '  ' + x.texto.trim().replace(/\s+/g, ' ').slice(0, 110));
    }
  }
  return out;
}

console.log('\n── o leitor de texto visivel ────────────────────────────────────────\n');

caso('COMENTARIO nao conta, e STRING conta', () => {
  const r = textoVisivel('x.js', "// a chefia decide\n/* o dono */\nconst a='aguardando chefia';").map((x) => x.texto);
  if(r.length !== 1 || r[0] !== 'aguardando chefia') throw new Error('veio ' + JSON.stringify(r));
});

caso("REGEX com aspas dentro nao abre string (o leitor improvisado da fase 2 se perdia aqui)", () => {
  const src = "const q=s.replace(/'/g,'');\n// o dono disse\nconst t=\"Enviar para aprovação\";";
  const r = textoVisivel('x.js', src).map((x) => x.texto);
  if(r.some((t) => /dono/.test(t))) throw new Error('leu o comentario como string: ' + JSON.stringify(r));
  if(!r.includes('Enviar para aprovação')) throw new Error('perdeu a string depois do regex: ' + JSON.stringify(r));
});

caso('DIVISAO nao vira regex', () => {
  const r = textoVisivel('x.js', "const m=a/2, n=b/4;\nconst t='chefia';").map((x) => x.texto);
  if(!r.includes('chefia')) throw new Error('a divisao engoliu a string: ' + JSON.stringify(r));
});

caso('HTML: texto conta, comentario e <style> nao', () => {
  const src = '<!-- a gestao -->\n<style>.chefe{}</style>\n<p>Fale com o dono</p>\n<script>var x=1; // patrao\n</script>';
  const r = textoVisivel('x.html', src).map((x) => x.texto.trim()).filter(Boolean);
  if(r.length !== 1 || !/dono/.test(r[0])) throw new Error('veio ' + JSON.stringify(r));
});

caso('SQL em template: o comentario /* */ dele nao conta, o resto conta', () => {
  const r = textoVisivel('x.js', "db.exec(`/* a chefia */ CREATE TABLE t(a); -- ok`);").map((x) => x.texto);
  if(r.some((t) => /chefia/.test(t))) throw new Error('veio ' + JSON.stringify(r));
});

caso('"dono unico" passa, e o resto da frase continua conferido', () => {
  if(PROIBIDA.test(semExcecao('o dono único do saldo'))) throw new Error('acusou dono unico');
  if(!PROIBIDA.test(semExcecao('o dono único, e a chefia decide'))) throw new Error('deixou passar a chefia');
});

console.log('\n── regra B: nenhum texto visivel nomeia hierarquia ──────────────────\n');

caso('a varredura alcanca as telas das duas operacoes, as rotas e os scripts', () => {
  for(const f of ['public/nav.js', 'public/embalagem.html', 'views/acessos.html', 'tecido/public/telas/sobras.html',
                  'tecido/dominio/producao.js', 'tecido/nucleo/permissoes.js', 'permissoes.js', 'rastrear.js'])
    if(!VARRIDOS.includes(f)) throw new Error(f + ' ficou fora da varredura');
  if(VARRIDOS.some(ehTeste)) throw new Error('teste entrou na varredura');
});

caso('nenhum texto de tela, mensagem, permissao ou script com chefia, chefe, patrao, dono ou gestao', () => {
  const a = achados();
  if(a.length) throw new Error(a.length + ' texto(s) — troque pela ETAPA ("Aguardando aprovação") ou pelo NIVEL ' +
    '(Operação, Supervisor, Admin, Admin Geral):\n' + a.join('\n'));
});

caso('nenhuma excecao zumbi: cada uma ainda existe no arquivo que ela cita', () => {
  const mortas = EXCECOES.filter((e) => !ler(e.arquivo).includes(e.trecho));
  if(mortas.length) throw new Error('tire da lista: ' + mortas.map((e) => e.arquivo + ' "' + e.trecho + '"').join('; '));
});

console.log('\n── regra A: toda tela interna tem a barra da sua operacao ───────────\n');

/* Ficam fora, por regra da spec: o login, a propria /setor e o portal da
   revenda (quando existir — ele entra AQUI, com o caminho, no dia em que
   nascer). */
const SEM_BARRA = ['public/login.html', 'public/setor.html'];

caso('medida padrao (public/ e views/): toda tela carrega o /nav.js', () => {
  const telas = arquivos('public', (f) => /\.html$/.test(f)).concat(arquivos('views', (f) => /\.html$/.test(f)))
    .filter((f) => !SEM_BARRA.includes(f));
  if(telas.length < 10) throw new Error('so achou ' + telas.length + ' telas — a varredura encolheu');
  const sem = telas.filter((f) => !/<script[^>]+src="\/nav\.js"/.test(ler(f)));
  if(sem.length) throw new Error('sem a barra: ' + sem.join(', '));
});

caso('sob medida (tecido/public/telas/): toda tela carrega o /sobmedida/nav.js, e nao o do PCP', () => {
  const telas = arquivos('tecido/public/telas', (f) => /\.html$/.test(f));
  if(telas.length < 10) throw new Error('so achou ' + telas.length + ' telas');
  const sem = telas.filter((f) => !/<script[^>]+src="\/sobmedida\/nav\.js"/.test(ler(f)));
  const errada = telas.filter((f) => /<script[^>]+src="\/nav\.js"/.test(ler(f)));
  if(sem.length) throw new Error('sem a barra: ' + sem.join(', '));
  if(errada.length) throw new Error('com a barra da OUTRA operacao: ' + errada.join(', '));
});

caso('as excecoes da barra existem e continuam SEM barra (login e /setor)', () => {
  for(const f of SEM_BARRA){
    if(!fs.existsSync(path.join(RAIZ, f))) throw new Error(f + ' nao existe mais — tire da lista');
    if(/src="\/nav\.js"/.test(ler(f))) throw new Error(f + ' passou a ter barra; a spec diz que fica fora');
  }
});

caso('as duas barras tem "Trocar setor" (a fase 1 nao pode sair por acidente)', () => {
  for(const f of ['public/nav.js', 'tecido/public/nav.js'])
    if(!/Trocar setor/.test(ler(f)) || !/['"]\/setor['"]/.test(ler(f))) throw new Error(f + ' sem "Trocar setor"');
});

console.log('\n' + ok + ' ok, ' + falhas + ' falha(s)\n');
process.exit(falhas ? 1 : 0);
