# Regras — sob medida (`/sobmedida`)

> Cada cartão é **uma regra que vale hoje**, com o motivo, as exceções e o teste
> que impede alguém de desfazê-la. O porquê longo está em
> [`docs/historia/sobmedida.md`](../historia/sobmedida.md), procurando pelo
> número da armadilha.
>
> **⚠ sem teste** quer dizer que nada no código impede alguém de desfazer a
> regra sem perceber.
>
> Formato: [`README.md`](README.md). O módulo tem regras próprias também no
> [`tecido/README.md`](../../tecido/README.md). **Esta é a parte 1 de 4:** o
> módulo, o acesso, o design e a estante de tecido. Catálogo, revenda, pedido,
> produção, quadro, financeiro e o corte em etapas continuam no `CLAUDE.md` §19
> até serem passados para cá.

---

## As duas operações

| | **Medida padrão** | **Sob medida** |
|---|---|---|
| O que é | Persianas prontas, vendidas pelo Mercado Livre | Corte de tecido contra o pedido do cliente |
| Onde vive | o `CLAUDE.md` até a §18 | `tecido/`, montado em `/sobmedida` |
| Banco | `dados.db` | `tecido.db` |
| Entra pelo | mesmo PIN | mesmo PIN |

---

## O módulo

### R-SMM-01 · O sob medida é um módulo montado no mesmo servidor, dentro de um try/catch
- **Regra:** `server.js` monta o módulo depois do `teste_route` com `try{ require('./tecido/montar').montar(app); }catch(e){ /* 503 só no /sobmedida */ }`. Não há segundo servidor nem segunda porta, e não há `npm install` dentro de `tecido/` (as dependências são as da raiz).
- **Por quê:** o módulo roda migrações no boot; um `tecido.db` corrompido ou um disco cheio derrubaria, sem o try/catch, a expedição inteira. E a versão em outro servidor durou um dia: o iframe do `/admin` abria o login do outro sistema, a porta 3020 não estava no `ufw` e liberar alguém exigia já estar liberado.
- **Exceções:** nenhuma.
- **Teste que trava:** ⚠ **sem teste** — nada sobe o `server.js` com o `tecido.db` quebrado.
- **Status:** no ar desde 02/09/2026.
- **História:** "É um módulo montado" e "Por que a liberação não mora mais lá dentro".

### R-SMM-02 · O sob medida não tem cadastro de gente: a liberação é uma área do PCP
- **Regra:** quem entra no módulo é quem tem a área certa em Admin → Acessos. O portão (`tecido/montar.js`) lê `req.usuario.areas`.
- **Por quê:** dois cadastros de gente são dois lugares para lembrar de bloquear alguém; desligar no PCP e esquecer do outro é o furo que nenhum log acusa.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/acesso.test.js`.
- **Status:** no ar desde 02/09/2026.

### R-SMM-03 · O backup diário cobre o `tecido.db`
- **Regra:** o `backup.js` copia os dois bancos (§13). O caminho do `tecido.db` é do `tecido/nucleo/caminho.js`.
- **Por quê:** até 28/09/2026 o cron copiava só o `dados.db`, sem erro nenhum.
- **Exceções:** o `/baixar-backup` continua servindo só o `dados-*.db`.
- **Teste que trava:** `teste_backup.js`.
- **Status:** no ar e conferido com dado real em 28/09/2026.

---

## O acesso

### R-SMA-01 · A área do sob medida é SOMBRA: chave, setor e linha no `PERM_AREA` andam juntos
- **Regra:** `usuarios.areas` é recalculada a partir das permissões pelo `PERM_AREA` do `acesso.js`. Toda área do sob medida precisa das três pontas: a chave em `permissoes.js`, o setor em `setoresNativos` e a linha em `PERM_AREA`. `areas` é **saída**: nada a lê para decidir alguma coisa.
- **Por quê:** área fora do mapa é apagada no primeiro salvamento de acesso de qualquer pessoa — o acesso some sozinho, sem erro. E lida como entrada, ela promovia a Admin Geral (§10, armadilha #28).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/acesso.test.js` (as duas pontas) · `teste_acesso.js`.
- **Status:** no ar.
- **História:** armadilha #13.

### R-SMA-02 · A chave do cadastro do sob medida é `supervisor`, nunca `admin`
- **Regra:** `sobmedida.cadastrar` é `nivel:'supervisor'`, e o setor `Sob medida / Cadastros` também. O setor nativo `Admin` **não** a carrega (a lista dele é calculada como "toda chave de nível admin").
- **Por quê:** nível admin no PCP é "admin do PCP": `sincronizarAreas` dá a área `'admin'` e as 24 rotas `@admin` liberam. E o setor com nível menor que a chave que carrega a apaga em silêncio no próximo salvamento (a tela não desenha a caixinha). Dentro do módulo nada mudou: o `papelDe` devolve `diretor` para `sobmedida_adm`, como sempre.
- **Exceções:** as outras 23 chaves de nível admin do PCP continuam entrando no sob medida como diretor; estreitar isso é `REGRA`.
- **Teste que trava:** `teste_acesso.js` (seção 6-D) · `tecido/teste/acesso.test.js`.
- **Status:** no ar e conferida em produção em 24/09/2026 (uma pessoa saiu com `sobmedida_adm` e sem `admin`).
- **História:** armadilha #34. O defeito de tela que apaga a chave continua aberto (dívida 20 do §14).

---

## O design

### R-SMD-01 · O contexto (claro ou escuro) é por tela, e a paleta é a mesma do PCP
- **Regra:** cada tela declara o contexto em `tecido/nucleo/telas.js`, e o servidor carimba `data-contexto` no `<html>`. Os hex são **copiados** de `public/operador.html` e `public/index.html`. Cor nova no `tecido/public/base.css` só entra se existir também nas telas do PCP.
- **Por quê:** a primeira versão usou uma paleta *quase* igual, em sete cores, e o efeito era a equipe sentir que tinha entrado em outro sistema.
- **Exceções:** nenhuma.
- **Teste que trava:** ⚠ **sem teste**.
- **Status:** no ar.

---

## A estante de tecido

### R-SME-01 · A bancada cria largura de bobina e endereço, e o cadastro nasce marcado para conferir
- **Regra:** criar endereço e largura é da bancada (`endereco.criar`); o cadastro nasce com `conferir=1` e quem criou, e aparece na lista **Conferir** no topo de Cadastros (`dominio/conferir.js`). Renomear e apagar continuam com `cadastro.editar`.
- **Por quê:** com o cadastro só da supervisão, a bancada mentia — tocava a largura errada para o sistema aceitar, ou lançava o rolo sem endereço. As duas peças são obrigatórias: soltar sem marcar é soltar sem rastro, e marcar sem a lista é ninguém conferir.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/bancada.test.js`.
- **Status:** no ar desde 03/09/2026.
- **História:** armadilha #14.

### R-SME-02 · Cada nível guarda um rolo só
- **Regra:** `Haste A · Andar 1 · Nível 1` é um buraco, e nele cabe **um** tubo de tecido novo. Ele se esvazia sozinho por dois caminhos: Mover, ou Rolo acabou (rolo encerrado não ocupa).
- **Por quê:** regra do dono (15/09/2026).
- **Exceções:** a sobra não tem essa trava — retalho se acha pela etiqueta. O que já estava duplicado antes da regra não é recusado: vira checagem no painel gerencial.
- **Teste que trava:** `tecido/teste/endereco_unico.test.js`.
- **Status:** no ar desde 15/09/2026.

### R-SME-03 · Não há emenda, e a peça larga demais vira número de compra
- **Regra:** peça mais larga que toda bobina do estoque não sai; o plano devolve `falta_bobina` com quantas peças, de que largura e qual a maior que existe hoje.
- **Por quê:** sem isso a venda parada morre numa linha de texto e quem compra tecido nunca fica sabendo.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/falta_bobina.test.js`.
- **Status:** no ar.

### R-SME-04 · Não há ourela
- **Regra:** a largura cadastrada é a largura útil do rolo, e não há desconto automático.
- **Por quê:** confirmado em 03/09/2026. Se um dia houver ourela, o caminho é cadastrar a largura útil.
- **Exceções:** nenhuma.
- **Teste que trava:** ⚠ **sem teste** — é a ausência de uma conta, não uma conta.
- **Status:** confirmado em 03/09/2026.

---

## Custo, giro e o painel gerencial

### R-SMC-01 · O preço do rolo é congelado na compra, e não há tabela de preço
- **Regra:** o preço mora em `rolo.preco_m2`, gravado na entrada. O que pré-preenche a próxima entrada é o último preço realmente pago (`custo.ultimoPreco`). `tecido/dominio/custo.js` é o dono único de "quanto vale".
- **Por quê:** preço no cadastro do fornecedor, multiplicado na hora de mostrar, faz o estoque comprado antes mudar de valor no dia do reajuste — e ninguém percebe, porque o número só fica maior.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/custo.test.js`.
- **Status:** no ar desde 03/09/2026.
- **História:** armadilha #15.

### R-SMC-02 · Custo sem preço é piso; sem `custo.ver` o valor não viaja; parado é tempo sem sair
- **Regra:** rolo sem nota lançada não soma zero: o total sai como **piso** (`≥`). Quem não tem `custo.ver` não recebe os campos de dinheiro no JSON — a poda é por **padrão de nome** (`preco|valor|custo|nf|fornecedor`), nunca por lista. "Parado" é tempo sem sair, não idade.
- **Por quê:** são as regras do PCP (§7-B e §18) valendo aqui igual. Lista de nomes envelhece e deixa campo novo viajar até a bancada.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/custo.test.js` · `tecido/teste/acesso_operador.test.js`.
- **Status:** no ar.
- **História:** armadilha #15.

### R-SMC-03 · A média não divide por uma janela maior que a história
- **Regra:** `giro.janela()` corta a janela pedida no primeiro consumo registrado, e a tela escreve em âmbar quando a janela usada difere da pedida. Saída de tecido é `motivo='consumo'` e só — `ajuste` e `encerramento` não são corte. Sem consumo, a cobertura é `null`. `tecido/dominio/giro.js` é o dono único de "quanto consumiu".
- **Por quê:** 12 dias de história ÷ 30 dá um número 2,5× menor que a verdade, com cara de fato — o comprador compra para 4 m²/dia e a fábrica gasta 10.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/giro.test.js`.
- **Status:** no ar.
- **História:** armadilha #16.

### R-SMC-04 · O painel gerencial é por tecido × largura de bobina, e a cobertura do conjunto só olha o que gira
- **Regra:** o grão é tecido × largura de bobina, e todo consolidado é soma desse grão. A fonte de consumo é `movimento_rolo`, não `plano.consumo_m2` (que soma sobra também). A cobertura do conjunto **não** põe o estoque parado no numerador. O mínimo sai de `estMinDias` e `estMinSeguranca` (a margem nasce zero). `tecido/dominio/gerencial.js` é o dono de mínimo, status e faixas, e compõe o `giro.js` e o `custo.js`.
- **Por quê:** não há emenda, então somar as bobinas esconde justamente a que vai faltar. Com o parado no numerador a cobertura dobra porque há dinheiro dormindo (237 dias contra 138 na validação real).
- **Exceções:** na conta de **compra** do comprometido (fase 4-B) somar as bobinas é legítimo: a pergunta é quanto comprar, não se aquela bobina aguenta.
- **Teste que trava:** `tecido/teste/gerencial.test.js`.
- **Status:** no ar.
- **História:** armadilha #17.

---

## O que ainda não tem teste nesta parte

R-SMM-01 (o try/catch que protege a expedição), R-SMD-01 (a paleta igual à do
PCP) e R-SME-04 (sem ourela).
