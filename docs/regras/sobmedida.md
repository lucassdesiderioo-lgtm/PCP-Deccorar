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
> [`tecido/README.md`](../../tecido/README.md). Passado para cá em quatro
> partes (21/10/2026): o módulo, o acesso, o design e a estante de tecido; o
> catálogo, a revenda, o pedido e a etiqueta de produção; o consumo, a compra,
> os setores, o bipe, a recusa, o quadro e os indicadores; e o financeiro, as
> telas e o corte em etapas.

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

### R-SMA-01 · Uma lista só: as permissões do sob medida moram na tela de Acessos do PCP
- **Regra:** desde 26/10/2026 (fase 2 da `ACESSOS-UNIFICADOS`) cada chave do módulo aparece no PCP como `sobmedida.<chave>`, no grupo "Sob medida". A lista **mora no módulo** (`tecido/nucleo/permissoes.js`, com nível e marca de sensível) e o `permissoes.js` do PCP a traz sem cópia. O portão do módulo pergunta ao resolvedor do PCP (`permissoesDe`, ligado no `server.js` como `opcoes.permissoes`) quais chaves a pessoa tem; **não há mais área virando papel** (`papelDe`, `sobmedida_adm`, `_venda` e as áreas de setor saíram). A sombra `usuarios.areas` guarda só `sobmedida`, para o destino depois do PIN.
- **Por quê:** a tradução área → papel falhou em silêncio três vezes (#13, #28, #34), e o pacote fixo obrigava a dar o módulo inteiro a quem só lança boleto.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_acessos_f2.js` (73: ninguém ganha nem perde nada na migração, pessoa a pessoa e chave a chave) · `tecido/teste/acesso.test.js` · `teste_acesso.js` (6-B).
- **Status:** em código em 26/10/2026; a migração rodou sobre um banco antigo de teste sem precisar de exceção nenhuma.
- **História:** armadilha #13; spec `ACESSOS-UNIFICADOS` fase 2.

### R-SMA-02 · Nenhuma chave do sob medida é `admin`; a chefia é `supervisor`
- **Regra:** as chaves do módulo são `operacao` (bancada, venda, produção) ou `supervisor` (o que só a chefia fazia), nunca `admin`. O setor `Sob medida / Cadastros` é `supervisor` e carrega todas, mais as cinco bancadas. O setor nativo `Admin` não carrega nenhuma.
- **Por quê:** nível admin no PCP é "admin do PCP": `sincronizarAreas` dá a área `'admin'` e as rotas `@admin` liberam. E o setor com nível menor que a chave que carrega a apaga em silêncio no próximo salvamento (a tela não desenha a caixinha).
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_acessos_f2.js` · `teste_acesso.js` (seção 6-D) · `tecido/teste/acesso.test.js`.
- **Status:** no ar desde 24/09/2026 (a chave da chefia); estendida às 41 chaves em 26/10/2026.
- **História:** armadilha #34. O defeito de tela que apaga a chave continua aberto (dívida 20 do §14).

### R-SMA-03 · A área `admin` do PCP não abre o sob medida
- **Regra:** só entra quem tem `sobmedida.modulo.entrar` ou uma bancada da produção. Comprador, Financeiro, Admin e a exceção "Ver custo" do PCP não carregam chave nenhuma do módulo e não entram. Quem pode tudo é o Admin Geral (que tem todas as chaves) e quem está em `Sob medida / Cadastros`. Quem tem admin **e** outro setor do sob medida fica com o pacote daquele setor.
- **Por quê:** o PCP grava a área `admin` em quem tem **qualquer** chave de nível admin, e lê-la como diretor dava a quem foi posto lá para comprar material o direito de lançar boleto, descartar sobra e aprovar correção de corte.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_acesso.js` (seção 6-H) · `tecido/teste/acesso.test.js` · `teste_destino.js`.
- **Status:** no ar e conferida em 21/10/2026 (fase 1, PR #212); desde 26/10/2026 garantida pela lista única, sem área.
- **História:** decisão do dono P1 de 21/10/2026.

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

## O catálogo e a persiana (fase 1)

### R-SMV-01 · `persiana.js` é o dono único de "o que esta persiana é"
- **Regra:** `tecido/dominio/persiana.js` responde o degrau da escada de tubos, os componentes com medida de corte **e** de consumo, o kit, o preço, os avisos e as recusas. O simulador, o pedido, a ficha congelada na aprovação e a etiqueta chamam essa função.
- **Por quê:** uma segunda conta faria a bancada cortar por uma régua e o cliente ser cobrado por outra (armadilha #12).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/persiana.test.js`.
- **Status:** no ar e conferida na fábrica em 22/09/2026: dez persianas reais do WhatsApp bateram no corte e depois no preço.

### R-SMV-02 · Milímetro e centavo inteiros por dentro; a porta é o `nucleo/unidade.js`
- **Regra:** medida em milímetro inteiro e dinheiro em centavo inteiro; metro com três casas e reais só por fora, convertidos pelo `tecido/nucleo/unidade.js`. A tela nunca converte com `Number(x)*1000`.
- **Por quê:** a conta da ficha empilha (o tubo tira do final, o tecido tira do tubo, a base soma no tecido) e o ruído de ponto flutuante compõe. `1,007 × 1000` dá 1006,9999… e o servidor recusa a medida certa.
- **Exceções:** o estoque de tecido (`rolo`, `sobra`) continua em metro `REAL`, e ali está certo.
- **Teste que trava:** `tecido/teste/persiana.test.js`.
- **Status:** no ar desde 22/09/2026.

### R-SMV-03 · A ficha tem os dois números por linha, e consumo e corte nunca se misturam
- **Regra:** a medida de corte vai para a etiqueta; a de consumo vai para Compras e para o custo. Dobrar a medida de corte não muda um centavo.
- **Por quê:** é a armadilha #18 do PCP (§7-B): precificar pelo corte não paga o desperdício, e cortar pelo consumo faz a peça não entrar.
- **Exceções:** na fase 1 o consumo nasce igual ao corte.
- **Teste que trava:** `tecido/teste/persiana.test.js`.
- **Status:** no ar desde 22/09/2026.

### R-SMV-04 · A coleção de venda aponta para o cadastro de tecido, e o modelo não guarda linha
- **Regra:** coleção, cor e tecido não se duplicam para a venda — a coleção aponta para o cadastro de tecido. A linha já está dentro da coleção (pela `abertura`), e o modelo não a guarda.
- **Por quê:** a segunda afirmação sobre o mesmo fato diverge no primeiro dia em que alguém editar só uma.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/catalogo_sm.test.js`.
- **Status:** no ar desde 22/09/2026.

### R-SMV-05 · O tubo sai da escada, e cada aviso e recusa diz por quê
- **Regra:** o tubo só se escolhe pela escada de degraus, e degrau que não sobe nos dois limites é recusado no cadastro. Tirar o bandô, pôr a redução de peso ou recusar a medida vêm sempre com a frase do motivo.
- **Por quê:** degrau que não sobe faz a persiana pular o tubo em silêncio. A frase é parte da regra, não texto de erro.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/catalogo_sm.test.js` · `tecido/teste/persiana.test.js`.
- **Status:** no ar desde 22/09/2026.

---

## A revenda, o preço e o prazo (fase 2)

### R-SMR-01 · O preço da revenda sai do subtotal Deccorar em cascata, arredondado uma vez, e o subtotal não se mexe
- **Regra:** `subtotal Deccorar × (1 − tabela A/B/C) × (1 − desconto da revenda)`, em cascata e nunca somados; a conta é feita em inteiro e só divide no fim. O **subtotal Deccorar** fica intocado e aparece junto com o que a revenda paga, nunca um no lugar do outro.
- **Por quê:** decisão do dono (22/09/2026). Somados, dois percentuais grandes zerariam a venda sem ninguém notar; dois arredondamentos erram um centavo que a revenda confere. O subtotal vai para faturamento, Compras, crédito e relatório.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/persiana.test.js` (reintroduzir o arredondamento por degrau reprova).
- **Status:** no ar desde 22/09/2026.

### R-SMR-02 · Tabela sem percentual é recusa com o nome do que falta, e nasce vazia, não zero
- **Regra:** as tabelas A/B/C nascem `NULL`. Sem o percentual lançado, a tela escreve *"falta lançar: tabela B"* — não mostra piso.
- **Por quê:** zero é "sem desconto", que é decisão; vazio é "ainda não se sabe". E desconto só faz o número descer: o subtotal seria um **teto**, e `≥` diria a coisa errada.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/revenda.test.js` · `tecido/teste/persiana.test.js`.
- **Status:** no ar desde 22/09/2026.

### R-SMR-03 · O prazo é conta do `prazo.js`, pela hora do ENVIO
- **Regra:** enviado até quarta 18:00 fica pronto na quinta da semana seguinte; entrega em dia não útil empurra e diz qual feriado empurrou. Os quatro números são parâmetros (fora da faixa é recusado) e os feriados são cadastro. `calcular` recebe o momento do envio; o prazo congelado não se recalcula. A tela mostra a prévia ("um pedido enviado agora fica pronto quando?").
- **Por quê:** a demora da aprovação é da Deccorar e não pode passar para a revenda; recalcular com o relógio de hoje daria outra data ao mesmo pedido.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/prazo.test.js` (os casos saem das datas da §4.9 da spec).
- **Status:** no ar desde 22/09/2026.

### R-SMR-04 · O vendedor tem setor próprio, de chaves `operacao`, e não edita revenda nem crédito
- **Regra:** o setor "Sob medida / Venda" nasce com o pacote do vendedor (simulador, catálogo de leitura, a carteira dele), todo de nível `operacao`: tem `custo.ver` e `modulo.entrar`, e **não** tem `revenda.editar` nem `credito.editar`. Desde 26/10/2026 cada uma se marca ou desmarca na tela de Acessos.
- **Por quê:** declarada como admin, a área `'admin'` viraria **diretor** no portão e devolveria o módulo inteiro (porta A da #28). Sem `custo.ver` o simulador chegaria sem o preço; sem `modulo.entrar` o módulo abriria em branco. Tabela, desconto e limite são decisão de quem responde pelo dinheiro.
- **Exceções:** nenhuma. Desde 21/10/2026 nenhuma chave de nível admin do PCP abre o sob medida como diretor (R-SMA-03).
- **Teste que trava:** `teste_acesso.js` (seção 6-B, confere o nível declarado) · `tecido/teste/acesso_operador.test.js`.
- **Status:** no ar desde 22/09/2026.

### R-SMR-05 · O vendedor é gente do PCP, e a porta de pessoas só deixa passar id e nome
- **Regra:** a revenda guarda `vendedor_usuario_id` e `vendedor_nome` como retrato. A lista chega por `nucleo/pessoas.js`, ligado no `server.js`, que remapeia para `id` e `nome`. Sem a porta ligada, recusa dizendo onde se liga — nunca lista vazia.
- **Por quê:** dois cadastros de gente são dois lugares para lembrar de desligar alguém. Lista vazia em silêncio faria alguém procurar no lugar errado.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/revenda.test.js`.
- **Status:** no ar desde 22/09/2026.

### R-SMR-06 · Campo de dinheiro tem nome do padrão de poda
- **Regra:** todo dinheiro do módulo se chama `preco_*` ou `valor_*` (ex.: `valor_limite_credito_centavos`).
- **Por quê:** a poda do `custo.js` corta por nome; um `limite_credito_centavos` ou `total_centavos` viajaria pelo fio para quem não tem `custo.ver`.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/revenda.test.js` (trava o nome certo e o errado).
- **Status:** no ar.

---

## O pedido (fase 3)

### R-SMP-01 · Congelado é congelado: preço no envio, ficha na aprovação
- **Regra:** depois do **envio** nenhuma leitura volta ao catálogo nem ao cadastro da revenda; depois da **aprovação** nem a ficha se relê — na bancada vence a etiqueta. O tubo que muda entre envio e aprovação grava linha em `sm_pedido_alteracao`.
- **Por quê:** um reajuste de terça não pode mexer no que foi vendido na segunda (armadilha #15 pela porta da venda).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/pedido.test.js` (reajustar depois do envio reprova três casos).
- **Status:** no ar e conferido em produção em 23/09/2026 (pedido 5001, com a folha na mão) · a semana em paralelo ao Decorsoft ainda não aconteceu.
- **História:** "A fase 3".

### R-SMP-02 · Aprovado não se altera, nem pelo admin: corrige-se cancelando a peça
- **Regra:** a peça errada sai **cancelada**, com motivo e quem, e fica na lista; outra é lançada.
- **Por quê:** decisão de 22/09/2026 (`DECISOES.md`). A marca "até a primeira etiqueta" seria regra inerte (dívida 18); sumir de uma lista impressa vira discussão.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/pedido.test.js`.
- **Status:** no ar desde 22/09/2026.

### R-SMP-03 · O número nasce no envio, nunca volta ao bolo e nunca desce
- **Regra:** orçamento (rascunho) não tem número e o preço dele é o de hoje, lido ao vivo — nada de preço gravado no rascunho. O envio é recusado sem `pedidoNumeroInicial` lançado. O enviado volta a rascunho mantendo o número; depois do primeiro número a peça sai cancelada, nunca apagada. A numeração é o maior entre o parâmetro e o já usado.
- **Por quê:** o plano de corte agrupa o tom único pelo texto do pedido e olha para trás: um 4272 novo colado num do Decorsoft herdaria o tom de outro cliente. Número que volta ao bolo sai duas vezes.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/pedido.test.js`.
- **Status:** no ar desde 22/09/2026.

### R-SMP-04 · A cor do tecido é obrigatória no pedido, e o `tecido_id` é gravado no lançamento
- **Regra:** o pedido não aceita item sem cor; o `tecido_id` resolvido pelo `persiana.js` é gravado, nunca reencontrado pelo nome. A lista de cores tem porta própria (`GET /api/sm/colecoes/:id/cores`, `catalogo.ler`) e só traz cor com tecido cadastrado.
- **Por quê:** a cor decide qual rolo sai da prateleira. Mandar o vendedor a `/api/cadastros` daria 403 com seletor vazio.
- **Exceções:** no simulador a cor é opcional.
- **Teste que trava:** `tecido/teste/pedido.test.js`.
- **Status:** no ar desde 22/09/2026.

### R-SMP-05 · "Sem tecido" é sinal, nunca trava
- **Regra:** o pedido de tecido que não está na estante entra, marcado, e o vendedor negocia prazo.
- **Por quê:** travar é a armadilha #6: a venda existe, e quem é recusado vende por fora.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/pedido.test.js` (caso 4.10).
- **Status:** no ar e conferido em 23/09/2026 (a peça fora da estante entrou marcada).

### R-SMP-06 · O total é a soma das peças de pé, arredondadas na peça, e as linhas de preço ficam gravadas
- **Regra:** cada peça arredonda uma vez; o total soma as peças ativas; a coluna do pedido guarda o que o envio prometeu, e os dois aparecem lado a lado quando divergem. As linhas de preço moram em `sm_pedido_item_preco`. Pedido sem peça não mostra `R$ 0,00`.
- **Por quê:** a folha impressa tem que fechar com as parcelas dela; a conferência da revenda é que acha o erro de medida antes do corte.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/pedido.test.js`. ⚠ O `R$ 0,00` do pedido vazio é de tela e **não tem teste**.
- **Status:** no ar e conferido em 23/09/2026 (`530,29 + 251,75 = 782,04` refeito contra o papel).

### R-SMP-07 · Rascunho não vira papel, e o PDF higieniza o texto
- **Regra:** `GET /api/pedidos/:id/pdf` recusa o que não foi enviado. O texto passa por um higienizador (Helvetica é WinAnsi): o caractere que a fonte não tem vira `?`.
- **Por quê:** impresso, o preço de hoje vira compromisso que o sistema não assumiu. Emoji do WhatsApp derrubava a geração no meio.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/pedido.test.js` (tirar o higienizador reprova).
- **Status:** no ar desde 22/09/2026.

### R-SMP-08 · Aprovar é duas chaves, e a fila conta dias de fábrica
- **Regra:** `pedido.aprovar` (a carteira dele) e `pedido.aprovar_qualquer` (de qualquer um, para férias). A rota de aprovar pede a **estreita**. `pedido.cancelar` não é do vendedor. A fila mostra `dias_uteis_restantes` pelo `prazo.diasUteis`, e negativo fica negativo.
- **Por quê:** a chave larga na rota tiraria do vendedor a própria fila. Três dias com feriado e fim de semana podem ser zero dias de trabalho; vencido é o que a lista existe para mostrar.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/acesso_operador.test.js` · `tecido/teste/pedido.test.js`.
- **Status:** no ar desde 22/09/2026.

---

## A etiqueta de produção (fase 4-A)

### R-SMT-01 · O código é da peça e nasce na aprovação
- **Regra:** cada componente que gera etiqueta ganha `SER-000123`, `COL-…`, `MON-…`, `REV-…`, `EMB-…` na mesma transação da ficha congelada. `atribuirCodigos` é idempotente; o `backfill_etiquetas.js` usa o mesmo caminho (com `await db.backup()`).
- **Por quê:** código novo a cada papel partiria a história da peça; código reaproveitado sairia em duas peças, e a bancada bipa a peça errada com a etiqueta certa.
- **Exceções:** os kits não geram etiqueta. São 6 etiquetas na persiana lisa e 7 com adicional (bandô e barra nunca convivem).
- **Teste que trava:** `tecido/teste/etiqueta_producao.test.js`.
- **Status:** no ar e conferido no papel em 23/09/2026 (o leitor da bancada bipou) · a medida escrita contra o tubo na mão ainda não.

### R-SMT-02 · Um contador por setor, que sobe num `UPDATE … RETURNING` e nunca devolve número
- **Regra:** cada setor conta o seu; o número sobe numa instrução só, com `UNIQUE` em `codigo_etiqueta` como segunda tranca; nem cancelamento nem backfill devolvem número.
- **Por quê:** `SELECT` + `UPDATE` separados dão o mesmo código a duas aprovações; um contador só faria o serralheiro ver saltos de dezenas.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/etiqueta_producao.test.js`.
- **Status:** no ar desde 23/09/2026.

### R-SMT-03 · O que vai escrito é a medida de CORTE, e no tubo o nome é o degrau
- **Regra:** a etiqueta e a lista do corte escrevem a medida de corte (`0,970`, não `1,000`); no tubo sai `TUBO 32 · CORTAR 0,970`. `POST /api/producao/para-cortar` devolve as peças em medida de corte, agrupadas por tecido.
- **Por quê:** armadilha #18 na bancada; Tubo 32 e Tubo 41 são peças diferentes.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/etiqueta_producao.test.js`.
- **Status:** no ar desde 23/09/2026.

### R-SMT-04 · Reimprimir sai com o mesmo código, e o aviso vem antes do botão
- **Regra:** a reimpressão grava `reimpressoes` e uma linha em `sm_etiqueta_impressao` — história, não peça. A tela avisa antes do clique e manda jogar o maço anterior fora. Só sai etiqueta de pedido aprovado e com código.
- **Por quê:** armadilha #1-B pela porta da produção. Depois do clique o aviso explicaria um maço que já saiu.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/etiqueta_producao.test.js`.
- **Status:** no ar desde 23/09/2026.

### R-SMT-05 · `etiqueta_producao.imprimir` não é `etiqueta_producao.ler`
- **Regra:** ler a lista é do vendedor também; imprimir é de quem corta.
- **Por quê:** o mesmo arranjo do `kit.imprimir` × `kit.editar` (§4).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/acesso_operador.test.js`.
- **Status:** no ar desde 23/09/2026.

### R-SMT-06 · O papel tem um desenho só, e o CODE128 é o `public/barras.js`
- **Regra:** a página é 100 × 35 mm; o código de barras ocupa a faixa inteira do rodapé (66 mm), com o código e o setor escritos à direita. A tabela CODE128 é a do `public/barras.js`, exportada pelo `etiqueta_pdf.js`.
- **Por quê:** numa coluna de 38 mm o módulo cai a 0,23 mm e a ZD220 não resolve na etiqueta amassada. Duas tabelas CODE128 são duas etiquetas no dia em que uma mudar.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/etiqueta_producao.test.js` (a página lida pelo `PDFDocument`).
- **Status:** no ar e conferido no papel em 23/09/2026.

---

## O consumo e a compra (fases 4-B e 4-C)

### R-SMU-01 · O comprometido de tecido é conta do `consumo.js`, e lê o CONSUMO, nunca o corte
- **Regra:** "quanto já está vendido e ainda não foi cortado" sai só do `dominio/consumo.js`; o `gerencial.js` compõe giro e consumo e não calcula nenhum. Só pedido **aprovado** compromete; peça cancelada sai. A medida lida é a de consumo da ficha congelada.
- **Por quê:** a medida de corte é a mais apertada, e comprar por ela compra a menos (armadilha #18). Duas contas do mesmo número divergem no dia da compra (#12).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/consumo.test.js` (dobrar a medida de corte não mexe no comprometido).
- **Status:** no ar desde 24/09/2026.
- **História:** "A fase 4-B".

### R-SMU-02 · O comprometido baixa no corte confirmado, peça a peça
- **Regra:** quem baixa é o plano **confirmado** (o corte feito); plano só calculado não baixa nada. O casamento é exato por `(pedido, tecido, medida de corte)`, e a irmã não cortada continua na conta.
- **Por quê:** número que só sobe vira número que a equipe aprende a ignorar.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/consumo.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMU-03 · O comprometido não se reparte entre bobinas, e o tecido sem rolo aparece
- **Regra:** o comprometido tem lista própria por tecido (`por_tecido`), fora da tabela tecido × largura. Tecido com venda aprovada e nenhum rolo aparece no painel, com **traço** na estante, nunca `0 m²`. O filtro da tela corta o cartão e a tabela juntos.
- **Por quê:** o pedido escolhe a cor; a largura é o plano que escolhe, na hora de cortar (armadilha #17). Zero se lê como "tinha e acabou", e a verdade é "nunca teve".
- **Exceções:** na conta de **compra** somar as bobinas é legítimo; na de cobertura, não.
- **Teste que trava:** `tecido/teste/consumo.test.js` (repartição, tecido sem rolo, filtro). ⚠ O traço no lugar do `0 m²` é de tela e **não tem teste**.
- **Status:** no ar desde 24/09/2026.

### R-SMU-04 · O "sem tecido" do envio é foto; o aviso ao vendedor é de hoje, e os dois ficam
- **Regra:** a marca gravada no envio continua; o card **Aprovados esperando tecido** olha a estante agora. O pedido entra inteiro no aviso, e a linha diz o que **este** pedido usa, com o total do tecido nomeado embaixo.
- **Por quê:** a foto explica o prazo que a revenda já ouviu; o rolo pode ter chegado ou ter sido comido por outro pedido. Escrever o total do tecido em cada pedido faria quem soma comprar o dobro.
- **Exceções:** pedido com tecido de sobra não entra no aviso.
- **Teste que trava:** `tecido/teste/consumo.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMU-05 · O tecido do sob medida não vai ao Compras do PCP; o tubo vai, e é um só
- **Regra:** o tecido tem painel, mínimo e status no `tecido.db` e fica lá. O tubo é o mesmo material da medida padrão e entra no Compras do PCP (`sobmedida_material.js` → `necessidade_dominio.js`), somando no mesmo componente, com a origem em `origem_sobmedida` (por pedido), nunca em `origem` (por SKU).
- **Por quê:** decisão do dono, 24/09/2026 — "é o mesmo tubo, e o compras deveria ser o mesmo". Comprar em dois lugares compra duas vezes; quem chega por último apagaria o outro e a fábrica compraria metade.
- **Exceções:** nenhuma.
- **Teste que trava:** `teste_compras_sobmedida.js` · `tecido/teste/material_compra.test.js`.
- **Status:** no ar desde 24/09/2026 · os quatro degraus estão apontados (Tubo 32, 38, 41 e 56) · a primeira compra pela lista ainda não foi conferida na fábrica.
- **História:** "A fase 4-C".

### R-SMU-06 · A peça sai da conta de compra quando a etiqueta do próprio tubo é impressa
- **Regra:** a linha do tubo sai quando ela é impressa (`impresso_em`); imprimir o maço da Coleção não baixa o tubo, e a irmã não impressa continua. Reimprimir não muda nada. Pedido só enviado não conta.
- **Por quê:** o pedido para em `aprovado`, e sem sinal de saída o número só subiria. O custo assumido: o maço impresso e ainda não cortado conta como produzido (horas, não dias).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/material_compra.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMU-07 · O tubo se aponta no degrau, o resto no componente, e quem converte é a unidade do PCP
- **Regra:** o componente recusa a chave `tubo` e manda à escada. Não há fator digitado: em `m` lê-se a medida de **consumo**, em `un` contam-se peças. O cadastro recusa unidade que a peça não sabe dizer (kg), material em metro em peça sem medida de consumo ou medida por largura **e** altura, e componente que não gera etiqueta.
- **Por quê:** Tubo 32 e Tubo 41 são itens diferentes. Um multiplicador digitado é a segunda régua que erra em silêncio; cada recusa evita um número que mente.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/material_compra.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMU-08 · O que falta vira pendência, nunca zero, e a lista de compras não cala
- **Regra:** degrau sem material apontado, material apagado e degrau renomeado depois do pedido viram **pendência** com o nome e o pedido. Os outros componentes não cobram vínculo. Unidade divergente entre os dois lados vira pendência dizendo as duas. Sem a porta do sob medida, a lista de compras do PCP **diz** que ele ficou de fora, com o motivo — não recusa e não cala; a porta de ida (`nucleo/materiais.js`) sem ligação recusa, nunca lista vazia. A tela agrupa a pendência pelo motivo.
- **Por quê:** uma persiana sempre tem tubo, então ele faltar é buraco na lista (regra 4 do custo). Cobrar vínculo de mão de obra seria a armadilha #6. Recusar a lista inteira deixaria o comprador sem lista por causa do outro módulo.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/material_compra.test.js` · `teste_compras_sobmedida.js` (tirar o try/catch reprova três casos).
- **Status:** no ar desde 24/09/2026.

---

## Os setores da produção (fase 5-A)

### R-SMS-01 · São cinco chaves de setor, de nível `operacao`, e os setores nascem vazios
- **Regra:** Serralheria, Coleção, Montagem, Revisão e Embalagem são cinco setores `Sob medida / …`, cada um só com a chave dele, sem ninguém migrado. As chaves são `operacao`, nunca `admin`.
- **Por quê:** o bipe grava quem fez, e uma chave só faria a recusa acusar a pessoa errada. Nível admin vira **diretor** no portão do módulo (a porta A da #28). O prefixo separa "Revisão" e "Embalagem" dos setores de mesmo nome da medida padrão.
- **Exceções:** na tela de Acessos eles saem em ordem alfabética; a ordem da fábrica é o `SETORES` do `tecido/nucleo/acesso.js`.
- **Teste que trava:** `teste_acesso.js` (seção 6-C) · `tecido/teste/acesso.test.js`.
- **Status:** no ar desde 24/09/2026 · a regra só pega quando alguém é marcado num dos cinco (armadilha #30); a marcação não foi conferida aqui.
- **História:** "A fase 5-A".

### R-SMS-02 · Setor é cadastro, chave é código
- **Regra:** nome, ordem e prefixo da etiqueta se editam em `sm_setor`; um sexto setor de produção exige chave nova no `permissoes.js`. A permissão nunca é gerada a partir do `tecido.db`.
- **Por quê:** gerar a chave do banco do sob medida acoplaria os dois bancos e furaria a porta única. Setor novo é mudança de como a fábrica trabalha.
- **Exceções:** nenhuma.
- **Teste que trava:** ⚠ **sem teste** — nada impede alguém de gerar chave a partir do cadastro.
- **Status:** no ar desde 24/09/2026.

### R-SMS-03 · A bancada vem do setor, e não das outras permissões
- **Regra:** as bancadas são as chaves `sobmedida.<setor>` que a pessoa tem, independentes das de corte e venda (`daSessaoDoPcp`). `producao.bipar` e `modulo.entrar` vêm do setor (POR_SETOR), e quem não tem setor não bipa. `Sob medida / Cadastros` carrega as cinco. Até 26/10/2026 era papel (`papelDe`) × setores (`setoresDe`), duas contas pela mesma razão.
- **Por quê:** derivar uma conta da outra daria 403 na bancada ao vendedor que também embala, com a caixinha marcada. Recusar o dono na bancada seria a armadilha #6.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/acesso.test.js` · `tecido/teste/producao.test.js` · `teste_acesso.js` (seção 6-C).
- **Status:** no ar desde 24/09/2026.

---

## O bipe da bancada (fase 5-B1)

### R-SMB-01 · As liberações são dado, e só segura quem existe e gera etiqueta
- **Regra:** a tabela `ANTES` diz o que libera o quê: tubo, base e tecido seguram a montagem; bandô e barra seguram **só** a embalagem. Componente que a persiana não leva, ou que não gera etiqueta (a redução de peso), não segura ninguém. A fila vem na ordem do prazo e diz o que fazer, na medida de corte.
- **Por quê:** cadeia de `if` esconde a regra; bandô na montagem pararia a linha por uma peça que só vai na caixa; componente sem bipe nunca termina.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/producao.test.js`.
- **Status:** no ar desde 24/09/2026 · rodado na tela com uma persiana lisa e uma com bandô · a bancada de verdade ainda não.
- **História:** "A fase 5-B1".

### R-SMB-02 · O pronto é `pronto_em`, e o `marco` não muda
- **Regra:** o pedido fica pronto quando a última persiana é embalada; grava `pronto_em` e uma linha em `sm_pedido_marco`. O `marco` continua `aprovado`. O kit não conta no pronto; peça cancelada não segura.
- **Por quê:** três lugares filtram `marco='aprovado'` — a reimpressão da etiqueta e as duas contas do comprometido e do material. Cada persiana tem duas linhas de embalagem, e a do kit nunca termina.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/producao.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMB-03 · Um campo e um bipe: o primeiro inicia, o segundo termina; na embalagem o kit é o do tipo certo
- **Regra:** o bipe grava quem; bipar o que já terminou é recusado dizendo quem fez. Na embalagem são três bipes (início · kit · fim): o kit errado é recusado dizendo qual é o certo, e kit sem código cadastrado é recusa, nunca "passou". Só a embalagem cobra kit.
- **Por quê:** dois botões são uma escolha a mais para quem está de luva. O kit prova que entrou o **certo**; não é o `public/kit_bipe.js` do PCP, que responde outra pergunta.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/producao.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMB-04 · Bipar o que não está liberado responde o que segura, com o nome do setor
- **Regra:** a recusa diz a peça, o setor (pelo **nome**, nunca a chave do banco), quem está com ela e desde quando, e lista tudo que segura. Quem não é do setor não bipa a bancada do outro.
- **Por quê:** "não aparece" vira "ninguém sabe por quê", e a equipe para de usar a tela. Chave de banco em tela é o "— Correcao de contagem" do §2.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/producao.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMB-05 · A pendência se fecha com `producao.pendencia` e com motivo
- **Regra:** a peça dada como feita sem o bipe de quem fez é fechada por quem tem `producao.pendencia` (o diretor, pelo `*`), com motivo; o fechamento grava quem, quando e por quê. A bancada não fecha a própria.
- **Por quê:** se quem bipa fechasse a própria, a trava deixaria de existir; fechamento sem porquê não é rastro.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/producao.test.js`.
- **Status:** no ar desde 24/09/2026.

---

## A recusa e o refazer (fase 5-B2)

### R-SMX-01 · O motivo aponta o componente, e volta o culpado e o que depende dele
- **Regra:** cada motivo (`sm_motivo_producao`) aponta um **componente**, e o setor sai dele. Recusar reabre o culpado e tudo que foi feito em cima dele, pelo mesmo `ANTES` lido ao contrário — nem mais, nem menos. O bandô recusado não derruba a montagem.
- **Por quê:** a serralheria faz quatro peças, e mandar "para a serralheria" refaria as quatro (armadilha #6). Uma segunda tabela de "o que vem antes" divergiria no dia em que o fluxo mudasse (#12).
- **Exceções:** diverge da letra da §4.16 da spec ("Tubo maior → Serralheria"), anotado lá.
- **Teste que trava:** `tecido/teste/recusa.test.js`.
- **Status:** no ar desde 24/09/2026 · rodado na tela · a bancada de verdade recusando uma peça ainda não.
- **História:** "A fase 5-B2".

### R-SMX-02 · Só se recusa o trabalho anterior que existe e já terminou
- **Regra:** recusar é `producao.bipar`. É recusado: o próprio trabalho, o que vem depois, a peça que esta persiana não leva, o culpado que ainda não terminou, a peça cancelada e quem não está naquela bancada. A tela só oferece os motivos que passam, e a lista vazia diz qual das três razões a esvaziou.
- **Por quê:** quem está com a peça na mão é a bancada; o que impede o abuso é o rastro. Escolha que só serve para dar erro é a armadilha #6 dentro de uma lista.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/recusa.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMX-03 · `refeitas` conta a peça física, e a `sm_recusa` guarda o retrato
- **Regra:** `refeitas` sobe só no culpado. A `sm_recusa` grava quem tinha feito, quem recusou, de onde e o nome do motivo daquele dia. A reabertura limpa o `kit_conferido_em` e desfaz o `pronto_em`; o `marco` não se mexe, e a linha `pronto` do histórico fica. A recusa que falha no meio não grava metade.
- **Por quê:** a reabertura apaga o bipe do culpado, que é o dado do indicador; sem limpar o kit, a refeita fecharia a caixa sem o terceiro bipe.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/recusa.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMX-04 · A refeita reimprime por código, com o mesmo código e a marca vermelha
- **Regra:** a reimpressão é da peça, não do maço do pedido; sai com o mesmo código e `REFAZER Nª VEZ` em vermelho. A peça volta marcada na fila, e o card **Refazer** da Produção lista só ela.
- **Por quê:** o maço inteiro deixaria etiquetas repetidas na bancada; sem a marca, duas etiquetas iguais e nada dizendo qual é a boa.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/recusa.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMX-05 · O cadastro de motivos nasce cheio, e não se mistura com o do corte
- **Regra:** a `sm_motivo_producao` nasce com os oito motivos da spec; a lista edita, acrescenta e desativa, e motivo com recusa atrás não se apaga. A bancada lê só os ativos. Ela não é a `motivo_recusa` do plano de corte.
- **Por quê:** tabela vazia faria o botão "Recusar" abrir uma lista sem nada (dívida 18). Juntar os dois cadastros estragaria os relatórios dos dois.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/recusa.test.js` (só os ativos; motivo sem nome ou de peça sem etiqueta é recusado). ⚠ Os oito semeados, a exclusão recusada com história e a separação dos dois cadastros **não têm teste**.
- **Status:** no ar desde 24/09/2026.

---

## O quadro (fase 6-A)

### R-SMQ-01 · A etapa é derivada, nunca gravada, e o quadro só lê
- **Regra:** a etapa sai de `marco` + `pronto_em` + os bipes; não há coluna `etapa` no `sm_pedido`. O `marco` não virou `pronto`. Cancelado vence todas as outras.
- **Por quê:** coluna gravada divergiria do `pronto_em` no primeiro bipe (#12); trocar o marco mudaria em silêncio os números da compra.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/kanban.test.js`.
- **Status:** no ar desde 24/09/2026.
- **História:** "A fase 6-A".

### R-SMQ-02 · As colunas são livres, as etapas não
- **Regra:** o nome é cadastro (`sm_kanban_coluna`); a etapa é a lista fechada do `dominio/kanban.js`: `edicao`, `enviado`, `aprovado`, `producao`, `pronto` e `cancelado`. Etapa que não existe é recusada dizendo quais existem; duas colunas na mesma etapa são recusadas; renomear não mexe na etapa. Não há `entregue`.
- **Por quê:** renomear "Em produção" não pode desligar nada. O mesmo pedido em dois lugares faz desconfiar da tela inteira. Coluna que nunca recebe cartão é paisagem (dívida 18).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/kanban.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMQ-03 · Pedido não some do quadro, e etapa sem pedido não vira aviso
- **Regra:** desativar a coluna faz o pedido virar **aviso** no topo, com a etapa nomeada e a contagem; reativar devolve os cartões.
- **Por quê:** o quadro responde "onde está o pedido X". Aviso que aparece todo dia sem nada atrás é paisagem.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/kanban.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMQ-04 · A barrinha não conta o kit nem a cancelada, e não existe antes da aprovação
- **Regra:** a barrinha conta o que falta por setor, sem o kit e sem peça cancelada; pedido sem ficha (antes da aprovação) não tem barrinha.
- **Por quê:** o kit nunca termina; a cancelada não é trabalho; barrinha zerada antes da ficha diria "nada foi feito" em vez de "ainda não há o que fazer".
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/kanban.test.js`.
- **Status:** no ar desde 24/09/2026.

### R-SMQ-05 · O quadro é `painel.ler`, e cartão sem valor não vale `R$ 0,00`
- **Regra:** o quadro é a fábrica toda com o valor de cada carteira, e pede `painel.ler`, nunca `pedido.ler`. O cartão sem valor lançado não mostra valor, e o total da coluna vira piso (`≥`). Cartão cancelado não leva selo de retido.
- **Por quê:** o vendedor tem `pedido.ler`. Zero se lê como "de graça" (regra 4 do custo).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/kanban.test.js`.
- **Status:** no ar desde 24/09/2026.

---

## Os indicadores (fase 6-B)

### R-SMI-01 · A régua do bipe suspeito é uma só, e o limite é cadastro
- **Regra:** `marcarSuspeitos` roda uma vez sobre a lista de bipes, e horas-homem, tempo por m² e produtividade leem a marca. Pega o bipe aberto **e** o que fechou acima de `bipeAbertoMaxHoras`. O parâmetro nasce em 2 h (chutado) e é recusado em zero, negativo ou acima de 24 h. O bipe descartado aparece, com peça, quem e quanto.
- **Por quê:** três filtros seriam três réguas (#12). O exemplo da §4.17 é de um bipe que fechou. Limite zero tornaria todo bipe suspeito.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/indicadores.test.js`.
- **Status:** no ar desde 26/09/2026 · ainda não conferido pelo dono · depende de a bancada bipar de verdade.
- **História:** "A fase 6-B".

### R-SMI-02 · Número incompleto não vira número certo
- **Regra:** a persiana com bipe descartado, incompleta ou cancelada fica fora da média de tempo e é contada à parte; o kit não entra. A produtividade é a exceção: o grão dela é o bipe.
- **Por quê:** a soma menor puxaria a média para baixo em silêncio (regra 4 do custo); cobrar a persiana inteira mediria uma pessoa pelo trabalho das outras quatro.
- **Exceções:** produtividade, como acima.
- **Teste que trava:** `tecido/teste/indicadores.test.js`.
- **Status:** no ar desde 26/09/2026.

### R-SMI-03 · O tempo por m² usa o m² real, nunca o cobrado
- **Regra:** o divisor é o m² da peça, nunca o `m2_cobrado_mm2`, que carrega o mínimo faturado de 1,5 m².
- **Por quê:** pelo cobrado a peça pequena pareceria mais rápida do que é (armadilha #18 por outra porta).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/indicadores.test.js`.
- **Status:** no ar desde 26/09/2026.

### R-SMI-04 · Prazo cumprido são dois números, e sem pedido pronto não há porcentagem
- **Regra:** prometido e negociado saem separados; pedido sem `pronto_em` não entra; sem pedido pronto a porcentagem é `null`, nunca `0%`. Prazo vencido fica negativo.
- **Por quê:** somados, o pedido empurrado pareceria entregue em dia. "Cumpriu 0%" seria uma afirmação falsa.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/indicadores.test.js`.
- **Status:** no ar desde 26/09/2026.

### R-SMI-05 · A recusa conta no setor do culpado, e a pessoa é quem tinha feito
- **Regra:** o setor sai do componente culpado, nunca do `recusado_de`; a pessoa é o `feito_por` da `sm_recusa`; o motivo sai com o nome que tinha no dia.
- **Por quê:** contar em quem recusou acusaria quem pegou o erro.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/indicadores.test.js`.
- **Status:** no ar desde 26/09/2026.

### R-SMI-06 · A aprovação é mediana, em tempo corrido, com o maior ao lado
- **Regra:** o tempo de aprovação é a **mediana** em horas corridas, por vendedor, com o maior e os dias de fábrica ao lado; só entra pedido aprovado. Os parados na aprovação são os enviados, fora do filtro de período, com os dias de fábrica restantes.
- **Por quê:** a sexta à noite envenena a média. "Horas úteis" exigiria um cadastro de expediente que não existe. Pedido parado há meses não pode sumir por causa de um recorte.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/indicadores.test.js`.
- **Status:** no ar desde 26/09/2026.

### R-SMI-07 · O vazio diz qual é, e a janela vai escrita
- **Regra:** sem bipe nenhum os blocos dizem "ninguém bipou ainda", e com bipe fora do período mandam mudar o filtro — nunca zero. A janela vem ao lado dos números. A tela é `painel.ler`, numa rota só para as sete perguntas.
- **Por quê:** os dois vazios pedem conselhos opostos (esperar ou mudar o filtro). Sete rotas teriam sete janelas.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/indicadores.test.js`. ⚠ A explicação longa aparecer uma vez só, as datas e a concordância são de tela e **não têm teste**.
- **Status:** no ar desde 26/09/2026.

---

## O financeiro (fases 6-C1, 6-C1b e 6-C1c)

### R-SMF-01 · O disponível é limite menos boletos em aberto, e mostra sem travar
- **Regra:** `disponível = limite − boletos em aberto`. Pedido de revenda estourada entra e é aprovado do mesmo jeito; o que muda é a cor e o selo **crédito estourado** no Quadro. Não há linha no domínio do pedido que leia crédito.
- **Por quê:** decisão do dono, 22/09/2026 — não se perde venda. A trava antes de a baixa ser feita de verdade seria a armadilha #6.
- **Exceções:** cartão cancelado e revenda sem limite não ganham selo.
- **Teste que trava:** `tecido/teste/boleto.test.js`.
- **Status:** no ar desde 26/09/2026 · a baixa de verdade pelo financeiro e o uso semanal pelo vendedor ainda não foram conferidos.
- **História:** "A fase 6-C1".

### R-SMF-02 · Negativo fica negativo, e sem limite o disponível é `null`
- **Regra:** o estourado não é cortado em zero. Sem limite lançado o disponível é `null`, nunca zero.
- **Por quê:** zerar apagaria o tamanho do buraco (o `MAX(0, …)` do §2 pela porta do crédito). Número indefinido não vira número certo (regra 4 do custo).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/boleto.test.js`.
- **Status:** no ar desde 26/09/2026.

### R-SMF-03 · O título é lançado à mão, e o que conta é a situação derivada
- **Regra:** o boleto nasce no banco e aqui só é lançado; o sistema nunca gera número. A `situacao` sai de `pago_em` e `cancelado_em`: pago e cancelado saem da conta; **vencido fica**, marcado, com o valor vencido à parte. Número repetido na mesma revenda é recusado; em outra revenda passa. Valor e data impossíveis são recusados dizendo o campo.
- **Por quê:** número inventado aqui seria a segunda régua contra o extrato (#12). Tirar o vencido faria o limite de quem não paga parecer mais folgado. Número repetido come o limite em dobro.
- **Exceções:** boleto de revenda inativa continua contando.
- **Teste que trava:** `tecido/teste/boleto.test.js`.
- **Status:** no ar desde 26/09/2026.

### R-SMF-04 · A baixa e o cancelamento têm rastro e caminho de volta
- **Regra:** a baixa grava quem e quando; baixar duas vezes é recusado; a baixa se desfaz com motivo. Cancelar exige motivo. Desde 26/10/2026 a baixa é **pedida** por uma pessoa e **aprovada** por outra (R-SMF-12).
- **Por quê:** sem caminho de volta o jeito vira lançar o título de novo, e a conta dobra. Trava que só acusa é trava que se contorna.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/boleto.test.js`.
- **Status:** no ar desde 26/09/2026.

### R-SMF-05 · "Aprovado sem boleto" é só de quem paga em boleto, e fica fora do disponível
- **Regra:** a linha "aprovado sem boleto" conta à parte, só para revenda que paga em boleto; PIX e cartão não têm. Enviado, orçamento e cancelado não entram. Não soma no disponível.
- **Por quê:** "nem todo pedido fazemos boleto" (dono, 26/09/2026); aviso no caso normal é a armadilha #6. É compromisso, não dívida — "os dois, mostrados separados".
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/boleto.test.js`.
- **Status:** no ar desde 26/09/2026.

### R-SMF-06 · O boleto aponta os pedidos que cobre, numa tabela de vínculo
- **Regra:** um boleto cobre N pedidos da mesma revenda, e um pedido aceita N boletos (`sm_boleto_pedido`; a coluna `pedido_id` saiu). Sem pedido nenhum ele nasce **avulso**, derivado, nunca coluna. ID e número de pedido são campos separados (`pedido_ids`, `pedido_numeros`), nunca adivinhados. Um pedido errado, de outra revenda ou cancelado derruba a lista inteira e nada é gravado; o mesmo pedido citado duas vezes conta uma.
- **Por quê:** a coluna única gravava um pedido e esquecia o resto. Números de pedido e ids se cruzam um dia, e o título iria para a venda de outra pessoa.
- **Exceções:** o avulso existe (acerto, frete), e passa marcado.
- **Teste que trava:** `tecido/teste/boleto.test.js` (casos 6-C1b).
- **Status:** no ar desde 26/09/2026.
- **História:** "A fase 6-C1b".

### R-SMF-07 · O título que soma mais que os pedidos avisa quanto, e nunca trava
- **Regra:** só o lado impossível acende: o título maior que os pedidos citados, com a tarja dizendo a diferença em reais. Parcela e avulso não avisam. A soma não usa `COALESCE(…,0)`.
- **Por quê:** o parcelamento nunca "bate", e recusá-lo pararia o caso normal. Aviso binário acendia por vinte centavos de arredondamento.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/boleto.test.js`.
- **Status:** no ar desde 26/09/2026.

### R-SMF-08 · O pedido está titulado quando os títulos ativos alcançam o valor dele
- **Regra:** a régua é o dinheiro (`TITULADO`, em `dados/boleto.js`, dono único): abaixo do valor o pedido continua cobrável e na lista de marcar, com o que falta. Título que cobre vários pedidos reparte **proporcionalmente**; título que fecha cobre todos sem centavo solto. Cancelado não titula; **pago continua titulando**. A falta é cortada em zero (o lado de cima já tem a tarja da R-SMF-07). O avulso não titula pedido nenhum.
- **Por quê:** com o `NOT EXISTS (vínculo)` a parcela 1 tirava o pedido da lista, e a parcela 2 não tinha onde ser apontada.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/boleto.test.js` (casos 6-C1c).
- **Status:** no ar e conferido em 26/09/2026 — o dono lançou a 2ª parcela do mesmo pedido e a falta caiu.
- **História:** "A fase 6-C1c".

### R-SMF-09 · O que falta titular aparece ao lado do em aberto, nunca dentro
- **Regra:** "em aberto" continua sendo só título lançado. "Sem boleto" e "parcialmente titulado" são duas linhas; a do parcial mostra a **falta**, nunca o valor cheio, e as duas dizem "fora do disponível". A linha de um título escreve "cobre R$ X de R$ Y em pedidos", e não "falta".
- **Por quê:** somar a falta mudaria o disponível sem ninguém lançar nada; somar o cheio contaria duas vezes o pedaço já titulado. Título menor é o parcelamento, e quem sabe a falta é a lista.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/boleto.test.js` (a mesma régua na lista e na contagem). ⚠ As frases das duas telas **não têm teste**.
- **Status:** no ar desde 26/09/2026.

### R-SMF-10 · A tela do financeiro lista o que marcar, e quem lê é `boleto.ler`
- **Regra:** escolhida a revenda, a tela lista os pedidos com o que falta, pelo **mesmo** critério do crédito, para marcar — nunca para digitar. A rota da lista é `boleto.ler`, nunca `pedido.ler`. `boleto.editar` não está em papel nenhum (só o diretor, pelo `*`). A tarefa semanal vem por prioridade e só com revenda que tem boleto em aberto; a data do último movimento aparece só quando é velha. Todo campo de dinheiro começa com `valor_`, e a marca `estourado` não.
- **Por quê:** digitar é onde nasce o vínculo errado; duas réguas divergem (#12). `pedido.ler` daria um seletor vazio com 403. A poda é por nome.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/boleto.test.js` (critério, prioridade, poda, chaves). ⚠ Manter a revenda escolhida depois de lançar e os selos separados no cartão do Quadro **não têm teste**.
- **Status:** no ar desde 26/09/2026.

### R-SMF-12 · Baixa de boleto e descarte de sobra são PEDIDOS por uma pessoa e APROVADOS por outra
- **Regra:** quem tem `boleto.editar` **pede** a baixa e quem tem `sobra.descartar` **pede** o descarte; aprovar é `boleto.aprovar_baixa` / `sobra.aprovar_descarte` (as duas `supervisor` e sensíveis). **Quem pediu não aprova, nem o Admin Geral** — a regra é por pessoa (id do PCP), não por nome. Enquanto pendente **nada muda**: o boleto continua em aberto e comendo o limite, a sobra continua disponível e no plano de corte. Um pedido pendente por alvo (o banco segura, índice parcial). O impossível é recusado já no pedido. Na aprovação o efeito é feito pelo dono de sempre (`boleto.baixar`, `sobra.descartar`), refeito com as guardas dele — se a sobra foi usada no meio, a aprovação é recusada e o pedido espera quem recuse. Recusar exige motivo. `pago_por` é quem pediu (quem viu o pagamento); quem aprovou fica no pedido (`sm_aprovacao`, `dominio/aprovacao.js`). Na migração, quem tinha baixar ou descartar ganhou o aprovar junto.
- **Por quê:** resposta P2 do dono (21/10/2026): "quem pede não aprova" vale também para dinheiro e para estoque de tecido, como no ajuste de estoque do PCP (R-EST-18) e na correção de corte (R-SMK-06).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/aprovacao.test.js` (8) · `teste_acessos_f2.js` (seção 8, a semeadura).
- **Status:** em código em 26/10/2026 (fase 6 da `ACESSOS-UNIFICADOS`); rodado na tela com duas pessoas.

### R-SMF-11 · NF e entrega não existem, por decisão
- **Regra:** não há coluna `entregue`, selo de NF nem faturamento no sob medida.
- **Por quê:** ninguém marca entrega, e o ERP é outro projeto; coluna que nunca recebe cartão é paisagem (dívida 18). Nasce quando o dono disser quem faz.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/kanban.test.js` ("não há etapa de ENTREGUE nem selo de NF").
- **Status:** decisão de 26/09/2026.

---

## As telas do módulo (28 e 29/09/2026)

### R-SML-01 · Dinheiro se escreve com o ponto do milhar, pelo dono único de cada lado
- **Regra:** na tela, o `dinheiro` do `ui.js`; no servidor, o `emReais` do `nucleo/unidade.js`, escrito à mão, **sem `Intl` nem `toLocaleString`**. Os dois saem iguais e são conferidos contra literais em português. Dinheiro sem valor é traço, nunca `R$ 0,00`. Nenhuma tela nova monta `R$ ` à mão; os isentos são nomeados, e o isento zumbi reprova.
- **Por quê:** a mesma revenda saía com o mesmo dinheiro de dois jeitos (#12). Node com ICU pequeno cai em en-US sem dar erro, e a folha da revenda sairia `R$ 4,785.50`.
- **Exceções:** o `emPercentual` fica sem separador.
- **Teste que trava:** `tecido/teste/dinheiro_tela.test.js`.
- **Status:** no ar desde 28/09/2026.
- **História:** "Os dois defeitos de tela do financeiro" e "o separador de milhar … era do servidor".

### R-SML-02 · O que se lê e o que pré-preenche campo são duas funções
- **Regra:** onde a tela mostra dinheiro **e** pré-preenche um campo que volta pelo `paraCentavos`, são duas funções: `reais` (lê, pelo `dinheiro`) e `paraCampo` (sem separador). Vale na ficha da revenda e no catálogo.
- **Por quê:** `4.785,50` no campo vira NaN, e a tela recusaria o valor que ela mesma escreveu.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/dinheiro_tela.test.js`.
- **Status:** no ar desde 28/09/2026 · conferido gravando o campo de verdade.

### R-SML-03 · Toda tabela rola dentro do `window.ui.rolaH(tabela)`, e a página nunca rola de lado
- **Regra:** o `rolaH` recebe a tabela e devolve o recipiente **com ela dentro**; a classe `.rolaH` mora no `base.css`, nunca na tela. Toda tabela do módulo passa por ele — inclusive a que hoje cabe —, sem lista de isentos e sem o padrão de dois passos.
- **Por quê:** `table{width:100%}` não impede a página de andar de lado. O padrão de dois passos deixou um recipiente oco, verde num caso que só olhava a classe.
- **Exceções:** página que rola por um `inline-flex` sem `wrap` (aba Endereços) não é tabela; o conserto é outro.
- **Teste que trava:** `tecido/teste/rola_tela.test.js` (roda a função num DOM de mentira). ⚠ O `inline-flex` sem `wrap` **não tem teste**.
- **Status:** no ar desde 29/09/2026 · medido nas dezesseis telas a 400 e 1440 px · o `/corte` no celular da bancada ainda não foi conferido.
- **História:** "As sete telas que rolavam de lado".

---

## O corte em etapas (spec `CORTE-EM-ETAPAS`, 01/10/2026)

### R-SMK-01 · O estoque só anda no Corte feito, e baixa o que está gravado
- **Regra:** planejar → confirmar (grava e reserva) → cortando (relógio) → **corte feito (baixa tudo junto, atômico)** → guardar. A baixa é do `plano.proposta`, nunca de um plano recalculado. `plano.confirmado` continua querendo dizer "baixou" e só vira 1 no Corte feito; a etapa mora em `etapa`. `tecido/dominio/corte.js` é o dono único.
- **Por quê:** em 01/10/2026 o Confirmar já baixava, e a sobra ficou "usada" com o rolo baixando a menos. Painel, comprometido e gerencial leem `confirmado` com o sentido de "baixou".
- **Exceções:** os cortes de antes viraram `feito` na migração 27 (R28).
- **Teste que trava:** `tecido/teste/corte_etapas.test.js`.
- **Status:** no ar desde 01/10/2026 · conferido na bancada em 02/10/2026 (prova 1 de 4).
- **História:** "O corte em etapas".

### R-SMK-02 · A reserva é a faixa de um corte aberto, sem tabela própria
- **Regra:** sobra de corte aberto não é oferecida a outro plano, que diz por quê (`reservada`); o rolo aparece com o saldo menos os metros reservados; o pedido num corte aberto conta como já cortado. Cancelar solta tudo e guarda o motivo; o cancelado não conta como cortado.
- **Por quê:** uma tabela de reserva seria a segunda afirmação sobre o mesmo fato, e a que fica para trás prende a sobra para sempre.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/corte_etapas.test.js`.
- **Status:** no ar desde 01/10/2026.

### R-SMK-03 · Um corte aberto por operador, e mexe nele quem o abriu
- **Regra:** um corte aberto por pessoa (a pendência de guardar não conta). Mexe quem abriu ou quem tem `corte.gerir`. "Voltar ao plano" apaga o corte do ②; do ③ em diante só se cancela, com motivo. O corte aberto se reencontra depois de recarregar a tela.
- **Por quê:** um "cancelado" por cada vez que alguém conferiu o resumo encheria o histórico de cortes que nunca existiram.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/corte_etapas.test.js`.
- **Status:** no ar desde 01/10/2026.

### R-SMK-04 · A sobra nascida mora em `sobra_a_guardar` até ser guardada
- **Regra:** a sobra nova não é linha de `sobra` e não entra em plano até ser guardada com medida, etiqueta e endereço juntos. A medida calculada vem escrita e a lista vem vazia. Quem tem `corte.gerir` vê as pendências de todos, com quem cortou.
- **Por quê:** sem etiqueta ninguém acha a sobra na prateleira; morando à parte, nenhuma consulta precisa lembrar de filtrá-la. Medida pré-marcada é medida que se salva sem olhar.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/corte_etapas.test.js`.
- **Status:** no ar desde 01/10/2026.

### R-SMK-05 · Durante o corte o operador muda o plano sozinho, com motivo e pela mesma conta
- **Regra:** no ③: não usar a fonte, o item saiu de outra fonte, rolo acabou e cortado errado (vira sobra marcada ou refugo medido, e o item volta). Toda edição exige motivo da lista de Motivos e vira linha em `plano_edicao`; vira restrição da entrada e o plano é recalculado pelo mesmo `plano.calcular`. Fonte onde o item não cabe é recusada, e nada muda. Só se edita o que está cortando.
- **Por quê:** conta própria da edição seria a segunda régua do plano.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/corte_correcao.test.js`.
- **Status:** no ar desde 01/10/2026.

### R-SMK-06 · Depois do Corte feito corrige-se pedindo, e quem pediu não aprova
- **Regra:** o operador pede (`corte.pedir_correcao`); pendente, nada no estoque muda. Outra pessoa aprova (`corte.aprovar_correcao`) e o sistema aplica a **diferença**: a sobra volta ao endereço, o rolo acerta como consumo, a sobra que não nasceu sai (a guardar é cancelada, a guardada vira `anulada`), o refugo é refeito. Na correção todo item tem fonte fixa. A verdade do que foi baixado é o `movimento_rolo`. Uma correção pendente por corte; bloqueada se a sobra "que não nasceu" já foi usada.
- **Por quê:** a regra das duas pessoas do §18, por analogia — confirmada pelo dono em 02/10/2026 (`DECISOES.md`). Deixar o plano escolher fonte ali inventaria um corte que ninguém fez.
- **Exceções:** os cortes de antes das etapas também se corrigem, pelo movimento (R28).
- **Teste que trava:** `tecido/teste/corte_correcao.test.js`.
- **Status:** no ar desde 01/10/2026 · a correção do corte de 01/10 foi conferida em 02/10/2026 (prova 2 de 4).

### R-SMK-07 · O tom é pela origem, e o pedido dividido entre origens se confere
- **Regra:** `tecido/dominio/tom.js` é o dono da origem de tom (o rolo; a sobra dele; a de sobra sobe até o rolo; a do mutirão é sozinha). O pedido inteiro numa fonte vence; senão divide entre fontes da mesma origem; senão entre origens diferentes, e cada fonte pede **"Conferi o tecido"** no Cortando — o Corte feito é recusado sem elas, dizendo quais, e mudar a fonte zera a conferência. Só divide se couber inteiro. O pedido já cortado só continua no **mesmo tecido**.
- **Por quê:** uma peça na sobra e duas na bobina dá duas cores na mesma janela; o pedido de duas cores mandava a segunda cor para o rolo da primeira.
- **Exceções:** peça sem pedido é livre.
- **Teste que trava:** `tecido/teste/tom.test.js`.
- **Status:** no ar desde 01/10/2026 · o caso da S-000091 foi conferido em 02/10/2026 (prova 4 de 4).

### R-SMK-08 · Toda linha diz para quem é, e o tempo por m² é das peças
- **Regra:** cada linha é **cliente final, revenda ou ML sob medida**; o Confirmar recusa linha sem tipo; a revenda vem da carteira por porta própria (`GET /api/planos/revendas`, só id e nome) e o nome fica como retrato. O relógio corre do CORTAR ao Corte feito menos as pausas; corte misturado divide o tempo pela área das peças; corte acima de `corteTempoMaxHoras` (nasce em 3 h, zero recusado) fica fora da média, e a tela diz quantos. Corte sem relógio fica fora, contado à parte.
- **Por quê:** o m² puxado do rolo faria o corte com muito desperdício parecer mais rápido. Corte sem relógio não é corte rápido.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/tempo_corte.test.js`.
- **Status:** no ar desde 01/10/2026.

### R-SMK-09 · A etiqueta da sobra se lê pela foto, e só vale o que fecha o dígito
- **Regra:** o botão 📷 dos campos de bipe de sobra lê a foto pelo `public/barras_ler.js` (mesma tabela do `barras.js`) e põe o código **no campo**, pelo caminho do bipe. Só vale o que fecha o dígito verificador; não há melhor palpite. Foto, não câmera ao vivo.
- **Por quê:** código errado lido com confiança é sobra trocada na prateleira. Câmera ao vivo pede HTTPS (dívida 2).
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/barras_ler.test.js` (imagens sintéticas).
- **Status:** no ar desde 01/10/2026 · conferido no iPad em 02/10/2026 (prova 3 de 4).

### R-SMK-10 · Entre as sobras que servem vence a de menos refugo, e a que não entrou diz por quê
- **Regra:** a ordem é condição (íntegra antes de defeito) → menor refugo → menor área. A sobra que servia e não entrou diz por quê também quando o plano usou outra (`outra_sobra`, nomeando a escolhida; a gêmea diz que é gêmea; a reservada aparece). Cada sobra usada mostra `usa · vira sobra · refugo`, somando 100, e o resumo mostra o refugo do corte ao lado da média dos últimos 30 dias (`painel.refugoMedio`), que é `null` sem corte, nunca zero. Não há limite de perda.
- **Por quê:** a menor sobra pode virar só tira de refugo; a maior pode devolver sobra nova. O caso de 01/10 era o da sobra que servia e ficou de fora sem explicação.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/plano_claro.test.js` · `tecido/teste/tom.test.js` (R4).
- **Status:** no ar desde 01/10/2026.

### R-SMK-11 · O histórico do corte acha pela sobra e diz o que foi baixado
- **Regra:** o botão **Histórico** lista os cortes (mais novo primeiro), filtra por pedido, operador e dia (dia fora do formato é recusado); a busca por sobra acha o corte que a usou e o de onde ela nasceu; o detalhe mostra a sobra marcada como usada com o status de hoje, os metros do rolo lidos do movimento, as sobras nascidas e o refugo. Não traz preço.
- **Por quê:** é por ele que se pede a correção, e a verdade do que foi baixado é o movimento.
- **Exceções:** nenhuma.
- **Teste que trava:** `tecido/teste/historico_corte.test.js`.
- **Status:** no ar desde 01/10/2026.

---

## O cadastro de produto (spec `SOBMEDIDA-CADASTRO-DE-PRODUTO`, 28/10/2026)

> Criar e duplicar produto, escolhas e cálculos como peças prontas, a Romana, o
> Painel, a etiqueta por unidade, a liberação por produto e o preço por cor.
> O porquê longo está na própria spec, no bloco STATUS e nas §5 a §8.

### R-SMN-01 · O produto novo nasce INATIVO, e só o simulador interno o calcula
- **Regra:** do zero ou duplicado, `sm_modelo.ativo=0`. O `persiana.calcular` recusa o inativo (`modelo_indisponivel`) a menos que venha `aceitaInativo`, que só a rota do simulador passa, e só para quem tem `catalogo.editar` — com a tarja *"INATIVO — a revenda não vê"* em primeiro nos avisos. A lista de modelos e o detalhe de um modelo não mostram o inativo a quem não edita o catálogo; o formulário do pedido só oferece produto ativo.
- **Por quê:** o dono confere no simulador antes de a revenda ver. Conferir depois de ativar seria conferir com a revenda já vendendo.
- **Exceções:** nenhuma — o pedido recusa o inativo mesmo vindo de quem edita o catálogo.
- **Teste que trava:** `tecido/teste/produto.test.js` (casos "nasce INATIVO", "a lista de quem VENDE", "o PEDIDO nao aceita").
- **Status:** em código (28/10/2026).

### R-SMN-02 · Duplicar copia tudo numa transação, e as colunas saem do banco
- **Regra:** `catalogo.duplicarModelo` copia, numa transação só, o modelo e as tabelas filhas (`sm_modelo_colecao`, `sm_modelo_cor_acessorio`, `sm_degrau_tubo`, `sm_ficha_linha`, `sm_faixa_suporte`, `sm_reducao_regra`, `sm_modelo_escolha`) e o preço por cor. As colunas vêm do `pragma_table_info`, nunca de uma lista escrita à mão. Cada preço de coleção copiado deixa linha em `sm_preco_historico` com `detalhe='copiado de <origem>'`. O nome proposto é *"Cópia de X"* (e *"Cópia de X 2"* se já existir).
- **Por quê:** cada fase desta spec acrescentou coluna a essas tabelas; uma lista à mão esqueceria a próxima, e a cópia sairia faltando justamente o número novo, com cara de cópia perfeita (a #25 pela porta do duplicar).
- **Exceções:** o **componente** (`sm_componente`) não se copia: ele é do sistema, e o preço do bandô por metro é um só.
- **Teste que trava:** `produto.test.js` (a cópia campo a campo, e as três conferências da §4.5 iguais no Rolô e na cópia); `produto_producao.test.js` (o preço por cor vai junto).
- **Status:** em código (28/10/2026).

### R-SMN-03 · "Cópia de…" não ativa, e ativar tem porta própria
- **Regra:** `PUT /api/sm/modelos/:id/ativo` recusa ativar nome que começa com *"Cópia de"* (`nome_de_copia`, sem olhar maiúscula). O `PUT /api/sm/modelos/:id` recusa o campo `ativo` (`ativo_por_outra_porta`). Desativar continua existindo, e é como se tira um produto de venda — nunca apagando.
- **Por quê:** um produto que sai para a revenda chamado "Cópia de Rolô" é o sinal de que ninguém conferiu, e é o nome que ela lê no orçamento.
- **Teste que trava:** `produto.test.js` ("Cópia de… NAO ativa").
- **Status:** em código (28/10/2026).

### R-SMN-04 · As escolhas são uma lista do SISTEMA, e o produto só liga
- **Regra:** `dominio/escolhas.js` tem as oito (comando, rolamento, adicional, redução, acionamento, abertura — chave `sentido` —, lado da corrente, folhas). O produto liga as que usa (`sm_modelo_escolha`). Ligada é obrigatória no pedido; desligada é **recusada pela rota** (`escolha_desligada`). O lado da corrente só existe com comando: some da tela e é recusado (`escolha_nao_se_aplica`); não liga sem o acionamento (`depende_de`), e o acionamento não desliga com ele ligado (`tem_dependente`). A migração 33 ligou as quatro do Rolô em **todo** modelo que já existia, e não pelo nome.
- **Por quê:** a tela esconder não é a regra (#26). E o Rolô não podia mudar: até a migração o código exigia as quatro de qualquer modelo.
- **Exceções:** `comando` e `rolamento` são `NOT NULL` em `sm_pedido_item`; o produto que não os liga grava `''`, que quer dizer "não se aplica" (recriar a tabela com `foreign_keys` ligado arriscaria pedido aprovado).
- **Teste que trava:** `escolhas.test.js` (11) e o `persiana.test.js` sem mudar o esperado.
- **Status:** em código (28/10/2026).

### R-SMN-05 · O cálculo é peça pronta do sistema; conta nova entra por spec
- **Regra:** `sm_modelo.calculo` é `escada` (os tubos do Rolô), `gomos` (Romana), `folhas` (Painel) ou `nenhum`. A conta mora no `persiana.js`; o produto guarda os números dela (`gomo_max_mm`, nasce 350; `transpasse_mm`, nasce 100). A referência `degrau` num produto sem escada é recusada (`referencia_sem_escada`); `folha` é palavra reservada da ficha, como `final` e `degrau`. A quantidade por referência (`quantidade_ref` = gomos, varetas, folhas, vias, lados) que o cálculo do produto não devolve é **recusada** (`quantidade_sem_calculo`), nunca zero.
- **Por quê:** a regra dos gomos é uma busca com condição, e a do painel muda de forma com a abertura — fórmula digitada na tela seria linguagem de programação no cadastro, e erro de fórmula vira persiana cortada errado (§2 da spec).
- **Teste que trava:** `romana.test.js`, `painel.test.js`.
- **Status:** em código (28/10/2026).

### R-SMN-06 · Romana: gomos ímpares, no mínimo 3, o menor que cabe no limite
- **Regra:** `n = max(3, ⌈altura ÷ limite⌉)`, e se `n` for par, `n+1`. O gomo é a divisão exata com uma casa, guardado em décimo de mm inteiro (`gomo_decimo_mm`: 333,3 → 3333). Varetas = gomos − 1. A medida exata do limite cabe (1,050 ÷ 3 = 350,0 fica em 3).
- **Por quê:** são regras do dono (27/10/2026), e não preferência. O gomo não é medida de corte de peça nenhuma — é a marcação que a montagem segue — e por isso pode ter a casa decimal.
- **Teste que trava:** `romana.test.js` (os seis casos da §5.3, escritos à mão).
- **Status:** em código (28/10/2026).

### R-SMN-07 · Painel: transpasse por encontro, e a central não transpassa no meio
- **Regra:** lateral `folha = (largura + (folhas−1)×T) ÷ folhas`; central, cada lado leva metade e faz a mesma conta com as folhas do lado. A conta é um numerador inteiro dividido uma vez — `(largura + 2·(k−1)·T) ÷ 2k` — para o arredondamento ao mm ser um só (566,67 → 567). Lateral de 2 a 5; central par, 2, 4 ou 6, recusando dizendo o porquê (`folhas_central_par`, `folhas_acima_lateral`, `folhas_acima_central`, `folhas_abaixo`). Uma via por folha (de cada lado, na central). O trilho é **uma peça só**, também na central.
- **Teste que trava:** `painel.test.js` (os nove casos da §6.4).
- **Status:** em código (28/10/2026).

### R-SMN-08 · A etiqueta é por UNIDADE, e o consumo não multiplica
- **Regra:** na aprovação, a peça que gera etiqueta vira **uma linha por unidade** em `sm_pedido_componente`, cada uma com `quantidade=1`, `unidade_k`/`unidade_n` e o seu código. A peça sem etiqueta (kit, redução) continua numa linha só, com a quantidade dela. "Gera etiqueta" é da **ficha** de cada produto (`sm_ficha_linha.gera_etiqueta`, `NULL` herda do componente).
- **Por quê:** quatro varetas são quatro etiquetas, 1/4 a 4/4, para a bancada ver se alguma ficou para trás. O Compras soma linha × quantidade, e as quatro linhas são as mesmas 4 varetas de antes — **4, e não 16**.
- **Teste que trava:** `etiqueta_unidade.test.js` ("PROVA: o consumo de vareta no Compras continua 4").
- **Status:** em código (28/10/2026).

### R-SMN-09 · As duas fontes da etiqueta, e falta de cadastro nunca trava
- **Regra:** o **cadastro de material** (Compras do PCP) dá o que a peça É — nome, marca, modelo —, congelado na aprovação (`material_nome`, `material_marca`, `material_modelo`). A **ficha** dá quanto e a quanto cortar. O tubo continua com o nome do **degrau**. Sem material ligado sai o nome do componente; campo vazio não sai no papel. A ficha mostra em âmbar o que falta (*"sem material ligado"*, *"material sem marca/modelo"*), deixando de fora o tecido, os kits e o trabalho de setor (montagem, revisão, embalagem). O insumo que pede marca ou modelo na etiqueta (o motor) avisa também no simulador.
- **Por quê:** o cadastro de material ainda está sendo arrumado aos poucos (dono, 28/10/2026); travar etiqueta, pedido ou aprovação por isso seria a #6.
- **Teste que trava:** `etiqueta_unidade.test.js`.
- **Status:** em código (28/10/2026).

### R-SMN-10 · A data de fabricação é a da PRIMEIRA impressão
- **Regra:** `sm_pedido_componente.fabricado_em` nasce no primeiro `imprimir` (`COALESCE`), e a reimpressão não o toca — ela regrava só o `impresso_em`. Os extras da etiqueta se marcam por linha da ficha (`etiqueta_extras` = `marca,modelo,fabricacao`).
- **Por quê:** a data é da peça, como o código (garantia do motor).
- **Teste que trava:** `etiqueta_unidade.test.js` e `produto_producao.test.js` (a refeita mantém a data).
- **Status:** em código (28/10/2026).

### R-SMN-11 · A liberação é uma regra por setor mais uma marca da linha
- **Regra:** a peça da serralheria ou da coleção segura a **montagem**, a menos que vá só na caixa (`libera='embalagem'`), e aí segura só a embalagem. Revisão espera a montagem; embalagem espera a revisão e o que vai só na caixa. A migração 37 marcou o bandô e a barra de toda ficha e todo pedido aprovado. A recusa anda pela mesma regra, peça a peça.
- **Por quê:** o mapa por chave (montagem esperava tubo, base e tecido) era a ficha do Rolô escrita no código, e a vareta da Romana não seguraria nada.
- **Teste que trava:** `produto_producao.test.js`, e o `producao.test.js` e o `recusa.test.js` passando sem mudar o esperado.
- **Status:** em código (28/10/2026).

### R-SMN-12 · A recusa de um insumo com várias unidades volta SÓ a unidade escolhida
- **Regra:** com mais de uma unidade, `recusar` exige `unidade` (`unidade_obrigatoria`, `unidade_inexistente`); volta ela e o que depende dela, e as outras seguem. A bancada mostra as unidades prontas para escolher; com uma unidade (todo o Rolô), a escolha continua sendo só o motivo. A refeita reimprime a mesma etiqueta — código, k/n e data —, marcada.
- **Por quê:** decisão do dono (28/10/2026): refazer quatro varetas porque uma veio torta é trabalho jogado fora.
- **Teste que trava:** `produto_producao.test.js`.
- **Status:** em código (28/10/2026).

### R-SMN-13 · O kit só é cobrado na embalagem de quem leva kit
- **Regra:** o fim da embalagem exige o bipe do kit **quando a persiana tem kit na ficha**. Sem kit, o fim passa (o simulador já avisa *"Este modelo não tem kit de instalação na ficha"*).
- **Por quê:** produto cadastrado sem kit ficaria preso na embalagem para sempre. Todo Rolô leva um dos três kits, e para ele nada muda.
- **Status:** em código (28/10/2026) — **decisão de construção, a confirmar com o dono**.

### R-SMN-14 · O preço por cor existe sem tela, e vazio não muda nada
- **Regra:** `sm_preco_cor` (coleção de venda + cor). Com linha, ela vence o preço da coleção, e a conta diz *"(preço da cor X)"*; sem linha, vale a coleção. Toda mudança deixa linha no histórico (`alvo='colecao_cor'`). Não há rota nem tela: lança-se por script, no domínio (`catalogo.definirPrecoCor`).
- **Por quê:** *"ainda não muda por cor, mas podemos já deixar certo"* (dono, 27/10/2026).
- **Teste que trava:** `produto_producao.test.js`.
- **Status:** em código (28/10/2026).

### R-SMN-15 · O cliente final é opcional, e sai ao lado da revenda
- **Regra:** `sm_pedido.cliente_final`, editado no rascunho. Preenchido, sai na etiqueta e no PDF do pedido; vazio, a etiqueta sai só com a revenda.
- **Teste que trava:** `etiqueta_unidade.test.js`.
- **Status:** em código (28/10/2026).

## O que ainda não tem teste no sob medida

R-SMM-01 (o try/catch que protege a expedição), R-SMD-01 (a paleta igual à do
PCP), R-SME-04 (sem ourela), a parte de tela da R-SMP-06 (o pedido sem peça não
mostra `R$ 0,00`), a parte de tela da R-SMU-03 (o traço no lugar do `0 m²`),
R-SMS-02 (setor é cadastro, chave é código), parte da R-SMX-05 (os oito motivos
semeados, a exclusão recusada e os dois cadastros separados), a parte de tela
da R-SMI-07, as frases da R-SMF-09, as duas partes de tela da R-SMF-10 (a
revenda que se mantém depois de lançar e os selos separados) e o `inline-flex`
da R-SML-03.

## O que NÃO fazer

> Vieram do CLAUDE.md §15 sem alteração, na ordem em que estavam. As
> referências entre parênteses (§N) apontam para a seção do CLAUDE.md onde
> a regra morava, hoje em cartão neste arquivo ou na história da área.
> Os cinco últimos vieram depois, e ganharam a referência (§19) que não
> traziam.

- ❌ Separar o sob medida de novo em outro servidor/porta — já foi, durou um
  dia, e o beco sem saída da liberação está descrito na §19
- ❌ Acrescentar área de sob medida sem pôr a linha correspondente no
  `PERM_AREA` do `acesso.js` — o acesso some sozinho, em silêncio (§19)
- ❌ Escrever cor nova no `tecido/public/base.css` sem que ela exista nas telas
  do PCP — paleta "quase igual" é o que faz parecer outro sistema (§19)
- ❌ Guardar preço no cadastro do fornecedor para multiplicar na hora de mostrar
  — o estoque comprado antes muda de valor no dia do reajuste (§19, armadilha #15)
- ❌ Dividir a média diária por uma janela maior que a história registrada — o
  número sai menor que a verdade, sem erro e sem aviso (§19, armadilha #16)
- ❌ Contar `ajuste` ou `encerramento` como saída de tecido: nenhum dos dois é
  corte (§19, armadilha #16)
- ❌ Somar as larguras de bobina do mesmo tecido numa conta de cobertura — não
  há emenda, são estoques diferentes (§19, armadilha #17)
- ❌ Pôr o estoque parado no numerador da cobertura do conjunto: a folga dobra
  justamente porque há dinheiro dormindo (§19, armadilha #17)
- ❌ Podar preço por LISTA de nomes: ela envelhece em uma semana e o campo novo
  viaja pelo fio até a bancada (§19, quem vê o quê)
- ❌ Começar a lista de medida da sobra no mínimo do refugo — o `sobra.criar`
  não exige esse mínimo, e o operador com a peça menor na mão escolheria o
  valor errado de propósito (§19, a medida vira lista)
- ❌ Deixar a bancada criar um cadastro **sem** marcá-lo para conferência, ou
  marcar **sem** ele aparecer na lista de Cadastros — meia decisão é pior que
  a trava que existia antes (§19, armadilha #14)
- ❌ Calcular "o que esta persiana é" fora do `tecido/dominio/persiana.js` — o
  simulador, o pedido, a ficha congelada e a etiqueta leem a MESMA conta (§19)
- ❌ Guardar medida do sob medida em metro `REAL` ou dinheiro em reais: é
  milímetro e centavo inteiros, e a conta da ficha EMPILHA (§19)
- ❌ Converter metro em milímetro por `Number(x)*1000` na tela: `1,007` vira
  1006,9999… e o servidor recusa, com razão, a medida que a pessoa acertou (§19)
- ❌ Somar consumo com corte no sob medida, ou usar um no lugar do outro — são
  os dois números da linha, e nunca fecham (§19, e a armadilha #18)
- ❌ Guardar `linha` no modelo de venda: ela já está dentro da coleção, e a
  segunda afirmação sobre o mesmo fato diverge (§19)
- ❌ Duplicar o cadastro de coleção, cor ou tecido para a venda — a coleção de
  venda APONTA para o cadastro de tecido (§19)
- ❌ Escolher o tubo por outro caminho que não a escada, ou cadastrar degrau que
  não sobe nos dois limites: a persiana pula o tubo em silêncio (§19)
- ❌ Tirar o bandô, pôr a redução de peso ou recusar a medida **sem dizer por
  quê** — a frase é parte da regra, não texto de erro (§19)
- ❌ Nomear campo de dinheiro fora do padrão `preco_*`/`valor_*` no sob medida:
  a poda corta por NOME, e um `total_centavos` vaza em silêncio (§19)
- ❌ Declarar tela em `tecido/nucleo/telas.js` sem a linha no `public/nav.js` —
  ela nasce sem botão, sem erro e sem log (§19)
- ❌ Somar a tabela A/B/C com o desconto da revenda em vez de aplicar em
  cascata: 10% + 5% não é 15%, e somados dois percentuais grandes zeram a
  venda sem ninguém notar (§19)
- ❌ Arredondar o preço da revenda em cada degrau: dois arredondamentos em
  cadeia erram um centavo sem regra, e é o centavo que a revenda confere (§19)
- ❌ Deixar a tabela ou o desconto da revenda encostarem no **subtotal
  Deccorar** — ele vai para faturamento, Compras, crédito e relatório (§19)
- ❌ Mostrar o subtotal Deccorar como **piso** quando falta o percentual da
  tabela: desconto só faz o número descer, então ali ele é um TETO (§19)
- ❌ Semear as tabelas A/B/C com zero por cento: zero é "sem desconto", que é
  decisão; em branco é "ainda não se sabe", e só ele cala a tela (§19)
- ❌ Declarar `sobmedida.cadastrar` como `nivel:'admin'` no PCP: nível admin
  vale como "é admin do PCP" — são as 24 rotas `@admin` e a área `'admin'`
  (§19, armadilha #34)
- ❌ Declarar um setor com nível que não caiba a chave que ele carrega: a tela
  não desenha a caixinha, o salvar regrava a lista sem ela, e a permissão some
  sem ninguém desmarcar nada (§19, armadilha #34)
- ❌ Ler "chefia do sob medida" como algo menor que diretor: o `papelDe`
  devolve `diretor` para `sobmedida_adm`, e sempre devolveu (§19, #34)
- ❌ Devolver `sobmedida.cadastrar` ao setor nativo `Admin`: a lista dele é
  calculada, e quem cadastra sob medida é o setor dedicado (§19, #34)
- ❌ Declarar `sobmedida.vender` (ou qualquer chave de venda) como `nivel:
  'admin'` no PCP — a área `'admin'` é lida como **diretor** pelo portão do
  sob medida, e o vendedor sairia com o módulo inteiro (§19)
- ❌ Dar `revenda.editar` ou `credito.editar` ao vendedor "para facilitar": a
  tabela, o desconto e o limite são decisão de quem responde pelo dinheiro (§19)
- ❌ Tirar `custo.ver` do papel do vendedor — o simulador chegaria nele sem o
  preço, que é justamente o número que ele foi buscar (§19)
- ❌ Voltar a pedir `cadastro.ler` na tela inicial ou no `/api/eu` do sob
  medida: com três papéis ela deixou de ser a chave que todos têm, e o efeito
  é tela em branco com 403 no console (§19)
- ❌ Criar um cadastro de vendedor dentro do sob medida — são dois lugares para
  lembrar de desligar alguém, e foi por isso que o módulo perdeu o dele (§19)
- ❌ Fazer a porta de pessoas devolver lista vazia quando não estiver ligada, ou
  deixar passar mais que `id` e `nome` (§19)
- ❌ Contar o prazo pela APROVAÇÃO em vez do envio, ou recalcular um prazo já
  congelado com o relógio de hoje (§19)
- ❌ Fazer o pedido ENVIADO reler o catálogo ou o cadastro da revenda: o
  reajuste de terça mudaria o que foi vendido na segunda (§19, fase 3)
- ❌ Reler a ficha de um pedido APROVADO: a persiana é cortada como a etiqueta
  dela já diz, e na bancada vence a etiqueta (§19, e a §4.11 da spec)
- ❌ Deixar o tubo mudar entre o envio e a aprovação sem gravar linha: a fábrica
  corta um tubo diferente do que foi vendido, e ninguém procura depois (§19)
- ❌ Gravar preço no rascunho do orçamento: ele envelhece calado, e quem abrir
  amanhã lê o número de ontem com cara de atual (§19, fase 3)
- ❌ Numerar o rascunho, ou deixar o envio passar com `pedidoNumeroInicial` em
  branco — o plano de corte herdaria o tom de um pedido do Decorsoft (§19)
- ❌ Fazer a numeração do pedido descer quando alguém baixar o parâmetro: quem
  manda é o MAIOR entre ele e o que já foi usado (§19, e a §4.18 da spec)
- ❌ Devolver o número ao bolo quando o pedido volta a rascunho, ou apagar peça
  de pedido que já teve número — ela sai CANCELADA, com motivo (§19)
- ❌ Alterar pedido aprovado, nem pelo admin: corrige-se cancelando a peça com
  motivo e lançando outra (§19, decisão de 22/09/2026)
- ❌ Aceitar item de pedido sem a cor do tecido, ou reencontrar o `tecido_id`
  pelo nome da cor depois — a segunda régua é a que manda o rolo errado (§19)
- ❌ Travar o pedido de tecido que não está na estante: ele entra MARCADO, e o
  vendedor negocia prazo — travar é a armadilha #6 (§19, e a §4.10 da spec)
- ❌ Somar as peças de um pedido sem arredondar na peça, ou guardar um total só:
  a folha impressa deixaria de fechar com as parcelas dela (§19)
- ❌ Declarar `pedido.aprovar_qualquer` na rota de aprovar: o vendedor perderia
  a própria fila, com 403 numa tela que abre (§19, fase 3)
- ❌ Medir a fila do vendedor em dias de calendário, ou cortar o vencido em
  zero: prazo vencido é o que a lista existe para mostrar (§19)
- ❌ Imprimir a folha de um pedido em rascunho, ou tirar o higienizador de texto
  do PDF — Helvetica é WinAnsi, e o emoji derruba a geração no meio (§19)
- ❌ Mostrar `R$ 0,00` num pedido sem peça: ele não vale nada AINDA, que é outra
  afirmação — e só a tela renderizada pega isso (§19)
- ❌ Aceitar parâmetro de prazo fora da faixa (`prazoCorteHora` por extenso, dia
  da semana 7): aceito, ele muda a conta em silêncio (§19)
- ❌ Dar o código da etiqueta de produção na IMPRESSÃO em vez da aprovação: ele
  é da peça, e código novo a cada papel parte a história dela em duas (§19)
- ❌ Tirar o número de uma etiqueta e devolvê-lo ao bolo — nem no cancelamento,
  nem no backfill: número que volta é número que sai duas vezes (§19)
- ❌ Ler o contador do setor num `SELECT` e gravar num `UPDATE` separado: a
  janela entre os dois dá o mesmo código a duas aprovações (§19)
- ❌ Usar um contador só para os cinco setores: o serralheiro leria saltos de
  dezenas entre uma etiqueta e a seguinte, sem nada explicando (§19)
- ❌ Escrever a medida ACABADA na etiqueta de produção ou na lista do corte: a
  persiana de 1,000 manda cortar 0,970, e é a armadilha #18 na bancada (§19)
- ❌ Escrever só "TUBO" na etiqueta da serralheria — o nome da peça é o degrau,
  e Tubo 32 e Tubo 41 são peças diferentes, compradas e guardadas à parte (§19)
- ❌ Estreitar o código de barras para caber texto ao lado: a 38 mm o módulo
  cai a 0,23 mm e a ZD220 não resolve na etiqueta amassada (§19)
- ❌ Escrever uma fileira de escolha própria em vez da do `base.css`: os botões
  saem idênticos, sem o azul do escolhido, e o maço sai do setor errado (§19)
- ❌ Mandar o tecido do sob medida para a lista de compras do PCP: o estoque
  dele mora no `tecido.db` e já tem painel — seria a segunda régua (§19, 4-B)
- ❌ Deixar o tubo do sob medida fora do Compras do PCP: é o MESMO material da
  medida padrão, e comprar em dois lugares compra duas vezes (§19, 4-C)
- ❌ Apontar o material do tubo no `sm_componente`: ele muda com o DEGRAU, e
  Tubo 32 e Tubo 41 são itens de estoque diferentes (§19, 4-C)
- ❌ Digitar um fator de unidade ao lado do vínculo — quem responde é a unidade
  do item do PCP, lida ao vivo; fator digitado erra em silêncio (§19, 4-C)
- ❌ Converter por chute a unidade que a peça não sabe dizer (kg), em vez de
  recusar o vínculo dizendo qual ela é (§19, 4-C)
- ❌ Ligar material a componente que não gera etiqueta: nada o tiraria da conta
  depois, e ele subiria para sempre (§19, 4-C)
- ❌ Ler a medida de CORTE no consumo de compra do sob medida — é a armadilha
  #18 pela porta do Compras, e comprar pelo corte compra A MENOS (§19, 4-C)
- ❌ Fazer o degrau sem material apontado sumir em silêncio: uma persiana sempre
  tem tubo, então ele é sempre esperado (§19, 4-C)
- ❌ Cobrar vínculo de TODO componente: a maioria é mão de obra, e seis
  pendências por peça todo dia é a armadilha #6 (§19, 4-C)
- ❌ Sobrescrever o consumo de um lado com o do outro no `necessidade_dominio`:
  os dois pedem o mesmo tubo, e a fábrica compraria metade (§19, 4-C)
- ❌ Pôr o pedido do sob medida no campo `origem` (que é por SKU) em vez do
  `origem_sobmedida` — número de pedido com cara de código de produto (§19)
- ❌ Somar quando a unidade do PCP e a do sob medida divergem: vira pendência
  dizendo as duas, nunca uma conversão que ninguém decidiu (§19, 4-C)
- ❌ Fazer a porta do sob medida RECUSAR a lista de compras quando ela não está
  ligada: o comprador ficaria sem lista por causa do outro módulo — ela DIZ
  que ele ficou de fora, com o motivo real (§19, 4-C)
- ❌ Tirar o try/catch da porta: o sob medida é montado com try/catch para não
  derrubar a expedição, e a lista de compras cai pela mesma razão (§19, 4-C)
- ❌ Escrever uma frase de tela sem acento no sob medida: ela sai numa tela do
  PCP que é toda acentuada, e aparece quebrada (§19, 4-C)
- ❌ Repetir a mesma pendência uma vez por peça na tela: o grão do domínio é a
  peça, mas a tela agrupa pelo motivo — lista que se repete ninguém lê (§19)
- ❌ Calcular o comprometido de tecido fora do `tecido/dominio/consumo.js`, ou
  deixar o `gerencial.js` somar peça de pedido por conta própria (§19, 4-B)
- ❌ Ler a medida de CORTE no comprometido: ela é a mais apertada, e comprar
  por ela compra A MENOS — a bobina acaba no meio de um pedido (§19, 4-B)
- ❌ Deixar o comprometido sem descontar o que já foi cortado: número que só
  sobe é número que a equipe aprende a ignorar (§19, 4-B)
- ❌ Baixar o comprometido por plano só CALCULADO: quem consome rolo é o plano
  confirmado (§19, 4-B)
- ❌ Repartir o comprometido entre as larguras de bobina: o pedido escolhe a
  COR, e quem escolhe a largura é o plano, na hora de cortar (§19, e a #17)
- ❌ Tirar do painel o tecido que tem venda aprovada e nenhum rolo — é
  justamente o que precisa ser comprado (§19, 4-B)
- ❌ Escrever `0 m²` na estante de um tecido que nunca teve rolo: zero se lê
  como "tinha e acabou", e ali a verdade é "nunca teve" (§19, 4-B)
- ❌ Trocar a foto do "sem tecido" do envio pelo aviso de hoje, ou o contrário:
  a foto explica o prazo que a revenda já ouviu (§19, 4-B)
- ❌ Escrever o total do TECIDO na linha de um pedido sem dizer que é do
  tecido: dois pedidos mostram o mesmo número e quem soma compra o dobro (§19)
- ❌ Fazer o filtro da tela cortar a tabela e não o cartão do resumo — dois
  recortes lado a lado é a mesma tela dizendo duas coisas (§19, 4-B)
- ❌ Declarar chave de setor da produção sob medida como `nivel:'admin'`: a
  área `admin` é lida como **diretor** pelo portão, e quem só embala sairia
  com catálogo, parâmetros e descarte (§19, 5-A — e é a #28 por cinco portas)
- ❌ Usar uma chave só para os cinco setores: o bipe grava QUEM fez, e a
  recusa da 5-B acharia a pessoa errada — régua que acusa o inocente (§19)
- ❌ Derivar os setores da pessoa do PAPEL dela: o papel é a área mais larga,
  e o vendedor que também embala levaria 403 na bancada com a caixinha
  marcada, sem ninguém entender por quê (§19, 5-A)
- ❌ Gerar permissão do PCP a partir dos setores do `tecido.db`: acopla os
  dois bancos e fura a porta única — setor é cadastro, CHAVE É CÓDIGO (§19)
- ❌ Semear gente nos setores novos de produção: herdar por engano dá bipe de
  serralheria a quem só revisa, e o bipe é o rastro (§19, 5-A)
- ❌ Tirar o prefixo "Sob medida /" dos setores: "Revisão" e "Embalagem"
  existem nos dois mundos e são trabalhos diferentes (§19, 5-A)
- ❌ Dar por pronta a fase 5 enquanto os cinco setores estiverem com
  `0 pessoa(s)`: é a #30 — a regra está escrita e não pega em ninguém (§19)
- ❌ Trocar o `marco` do pedido para `'pronto'`: três lugares filtram por
  `marco='aprovado'` — a reimpressão da etiqueta e as DUAS contas do
  comprometido e do material. O pronto é `pronto_em` (§19, 5-B1)
- ❌ Fazer bandô ou barra segurarem a MONTAGEM: eles vão na caixa, e pô-los
  lá pararia a linha por uma peça que só é necessária no fim (§19, 5-B1)
- ❌ Deixar a redução de peso — ou qualquer componente sem etiqueta — segurar
  alguém: sem bipe ela nunca termina, e a espera é eterna (§19, 5-B1)
- ❌ Contar o KIT na conta do pronto: cada persiana tem DUAS linhas de setor
  `embalagem`, e a do kit nunca é bipada (§19, 5-B1)
- ❌ Recusar um bipe sem dizer o que segura a peça: "não aparece" vira
  "ninguém sabe por quê", e a equipe para de usar a tela (§19, 5-B1)
- ❌ Deixar a bancada fechar a própria pendência, ou fechá-la sem motivo: a
  trava deixaria de existir, e fechamento sem porquê não é rastro (§19)
- ❌ Escrever uma segunda frase de "o que fazer" na tela da bancada: ela sai
  do mesmo `tarefaDe` da etiqueta, e na bancada vence a etiqueta (§19)
- ❌ Gravar a etapa do kanban numa coluna do `sm_pedido`: ela é DERIVADA, e a
  coluna divergiria do `pronto_em` no primeiro bipe (§19, 6-A)
- ❌ Trocar o `marco` para `pronto` "agora que o kanban existe" — a decisão da
  dívida 15 foi NÃO, e os três leitores continuam de pé (§19, 6-A)
- ❌ Deixar uma regra ler o NOME da coluna do quadro: o nome é cadastro, a
  etapa é código, e renomear não pode desligar nada (§19, 6-A)
- ❌ Aceitar duas colunas na mesma etapa: o mesmo pedido apareceria em dois
  lugares, e quem vê isso para de confiar na tela inteira (§19, 6-A)
- ❌ Criar coluna de `entregue` antes de existir o que marque entrega: coluna
  que nunca recebe cartão é paisagem, que é a dívida 18 (§19, 6-A)
- ❌ Deixar o pedido sumir do quadro quando a coluna é desativada: ele vira
  AVISO, com a etapa nomeada e a contagem (§19, 6-A)
- ❌ Contar o kit ou a peça cancelada na barrinha do cartão, ou desenhar
  barrinha antes da aprovação — a ficha só é explodida ali (§19, 6-A)
- ❌ Escrever `R$ 0,00` no cartão sem valor lançado: ele não vale nada AINDA,
  e o total da coluna vira PISO quando falta algum (§19, 6-A, e a regra 4)
- ❌ Declarar o quadro como `pedido.ler`: ele é a fábrica toda com o valor de
  cada carteira, e o vendedor tem essa chave (§19, 6-A)
- ❌ Pôr selo de retido em cartão cancelado — ele não espera nada (§19, 6-A)
- ❌ Filtrar o bipe suspeito em cada indicador de tempo por conta própria: a
  régua é UMA e roda uma vez sobre a lista — três filtros divergem (§19, 6-B)
- ❌ Escrever o limite do bipe no código: ele é cadastro, e nasce CHUTADO
  porque ninguém mediu a bancada ainda (§19, 6-B)
- ❌ Aceitar limite de bipe zero: com ele todo bipe vira suspeito e a tela diz
  "ninguém bipou ainda" com a fábrica trabalhando (§19, 6-B)
- ❌ Deixar a persiana com bipe descartado entrar na média: a soma dela é menor
  do que foi, e puxa a média para baixo em silêncio (§19, 6-B)
- ❌ Medir tempo por m² pelo m² COBRADO: ele carrega o mínimo faturado de
  1,5 m², e a peça pequena pareceria mais rápida do que é (§19, 6-B)
- ❌ Exigir persiana completa na PRODUTIVIDADE: o grão dela é o bipe, e cobrar
  a persiana inteira mede uma pessoa pelo trabalho das outras quatro (§19, 6-B)
- ❌ Juntar prazo prometido e negociado num número, ou escrever `0%` sem pedido
  pronto — "cumpriu zero por cento" é uma afirmação falsa (§19, 6-B)
- ❌ Contar a recusa em `recusado_de`: essa é a bancada que ACHOU o erro, e a
  pergunta é de onde ele VEIO (§19, 6-B)
- ❌ Apagar a diferença entre "ninguém bipou ainda" e "nada no período": são
  conselhos opostos — esperar ou mudar o filtro (§19, 6-B)
- ❌ Repetir a explicação do vazio nos sete blocos: vira um muro do mesmo
  parágrafo, e texto que se repete ensina a não lê-lo (§19, 6-B)
- ❌ Esticar com `flex:1` dois números que existem para serem lidos juntos —
  os percentuais do prazo iam para pontas opostas de 1100 px (§19, 6-B)
- ❌ Gerar boleto dentro do PCP: o título nasce no banco, e um número
  inventado aqui é a segunda régua contra o extrato (§19, 6-C1)
- ❌ Travar pedido por crédito estourado: mostra e não trava, e a decisão é do
  dono desde 22/09/2026 — não se perde venda (§19, 6-C1)
- ❌ Escrever zero no disponível de quem não tem limite lançado — é `null`, e
  não se estoura um limite que não existe (§19, 6-C1)
- ❌ Tirar o boleto VENCIDO da soma do em aberto: o limite de quem não paga
  pareceria mais folgado que o de quem paga em dia (§19, 6-C1)
- ❌ Aceitar número de boleto repetido na mesma revenda: é o mesmo título duas
  vezes, e ele come o limite em dobro (§19, 6-C1)
- ❌ Somar "aprovado sem boleto" no disponível: não é dívida, é compromisso
  que ainda não virou título — "os dois, mostrados separados" (§19, 6-C1)
- ❌ Deixar a baixa sem caminho de volta, ou desfazê-la sem motivo: sem ele o
  jeito vira lançar o título de novo, e aí a conta dobra (§19, 6-C1)
- ❌ Nomear campo de dinheiro do boleto sem o prefixo `valor_`, ou pôr
  `valor_` em `estourado` — a marca tem que sobreviver à poda (§19, 6-C1)
- ❌ Escrever a data do último movimento em toda revenda: o sinal é o dado
  VELHO, e a linha repetida vira paisagem (§19, 6-C1)
- ❌ Pôr dois selos no cartão do Quadro sem container: eles saem grudados, e
  nenhum teste pega — o texto está certo, a distância é que não (§19, 6-C1)
- ❌ Construir a coluna `entregue` ou o selo de NF antes de existir quem marque
  a entrega: é a coluna-paisagem que a 6-A recusou (§19, 6-C2)
- ❌ Guardar o pedido do boleto numa COLUNA: um título cobre vários pedidos, e
  a coluna grava um e esquece o resto em silêncio (§19, 6-C1b)
- ❌ Deixar `sm_boleto.pedido_id` de pé ao lado da tabela de vínculo: duas
  afirmações sobre o mesmo fato divergem no primeiro título de dois (§19)
- ❌ Adivinhar se um número é ID ou NÚMERO de pedido: os intervalos se cruzam,
  e o título vai para a venda de outra pessoa sem erro nenhum (§19, 6-C1b)
- ❌ Aceitar os pedidos certos e descartar o errado da lista: o título cobre
  menos do que quem lançou acha, e ninguém confere o que "deu certo" (§19)
- ❌ Apontar pedido CANCELADO num boleto — ele não é compromisso, e a conta
  não se explica depois (§19, 6-C1b)
- ❌ Exigir pedido em TODO boleto: acerto e frete existem, e a trava no caso
  legítimo é a #6. Ele passa marcado como AVULSO (§19, 6-C1b)
- ❌ Dar coluna ao `avulso` ou à conferência de valor: os dois são derivados,
  como a `situacao` do próprio boleto (§19, 6-C1b)
- ❌ TRAVAR o título que não bate com a soma dos pedidos: o parcelamento nunca
  bate, e recusá-lo pararia o caso normal (§19, 6-C1b)
- ❌ Deixar o aviso de valor BINÁRIO: ele acende por vinte centavos de
  arredondamento, e marca que aparece no caso normal vira paisagem (§19)
- ❌ Pôr `COALESCE(…,0)` na soma dos pedidos do título: o avulso passaria a
  "exceder" qualquer valor — é a regra 4 do custo (§19, 6-C1b)
- ❌ Escrever a lista de pedidos da tela com critério próprio: ela é a mesma
  pergunta do "aprovado sem boleto", e duas réguas divergem (§19, 6-C1b)
- ❌ Pedir `pedido.ler` na lista que a tela marca: quem lança boleto pode não
  ter, e o seletor abriria vazio com 403 no console (§19, 6-C1b)
- ❌ Deixar o lançamento resetar a revenda escolhida no formulário: quem lança
  cinco da mesma revenda manda o quinto para a errada (§19, 6-C1b)
- ❌ Dar um pedido por titulado só porque existe UM boleto apontando para ele:
  a régua é o dinheiro — a soma dos títulos ativos contra o valor do pedido
  (§19, 6-C1c)
- ❌ Tirar da lista de marcar o pedido parcialmente titulado: sem ele a
  parcela 2 não tem onde ser apontada, e o parcelamento deixa de ser
  lançável pela tela (§19, 6-C1c)
- ❌ Repartir por outro critério que não o proporcional quando um título
  cobre vários pedidos, ou escrever uma segunda conta de "quanto já foi
  titulado" fora do `TITULADO` (§19, 6-C1c)
- ❌ Somar o que falta titular dentro do "em aberto": é compromisso, não
  dívida, e o disponível mudaria de valor sem ninguém lançar nada (§19)
- ❌ Somar o valor CHEIO do pedido parcial: o pedaço que já virou título já
  está no em aberto, e o cheio o conta duas vezes (§19, 6-C1c)
- ❌ Deixar o título PAGO parar de titular: o pedido voltaria à cobrança no
  dia em que a revenda pagasse (§19, 6-C1c)
- ❌ Chamar de "falta" o que a linha de UM título mostra: título menor é o
  parcelamento, e quem sabe a falta é a lista, que olha todos (§19, 6-C1c)
- ❌ Escrever dinheiro com formatador próprio de tela no sob medida: o dono
  único é o `dinheiro` do `ui.js`, e a cópia local é a #12 em miniatura (§19)
- ❌ Pré-preencher com o `dinheiro` um campo que volta pelo `paraCentavos`: o
  ponto do milhar vira NaN, e a tela recusa o valor que ela mesma escreveu (§19)
- ❌ Usar `toLocaleString('pt-BR')` no `nucleo/unidade.js`: Node com ICU pequeno
  não dá erro, CAI em en-US, e a folha da revenda sai `R$ 4,785.50` (§19)
- ❌ Consertar o dinheiro só na tela quando ele vem escrito do servidor: o
  simulador mostra os dois na mesma linha, e um deles ficaria para trás (§19)
- ❌ Conferir o `.rolaH` só pela classe: recipiente criado e VAZIO fica verde
  com a tabela pendurada fora dele — é rodar o `rolaH` de verdade que prova (§19)
- ❌ Montar o recipiente do `.rolaH` na tela, em dois passos: quem embrulha é o
  `window.ui.rolaH(tabela)`, e ele não tem segundo passo para esquecer (§19)
- ❌ Deixar de embrulhar a tabela que HOJE cabe: o recipiente é inerte sem
  transbordo, e a lista de isentos envelhece antes da tela (§19)
- ❌ Procurar só TABELA quando a página rola de lado: um `inline-flex` sem
  `wrap` faz igual, e o `rolaH` não alcança (§19, a aba Endereços)
- ❌ Medir tela com banco VAZIO e dar a conta por feita: sem rolo, sem sobra e
  sem endereço a tela não desenha o que rola — mede-se o vazio (§19)
- ❌ Escrever varredura que lê o comentário que a explica, ou que procura
  `/100).toFixed` sem nomear o centavo: as duas acusam o inocente (§19)
- ❌ Escrever uma segunda tabela de "o que vem antes" para a recusa: o `ANTES`
  lido ao contrário já responde, e duas divergem no dia em que o fluxo mudar
  (§19, 5-B2)
- ❌ Fazer o motivo da recusa apontar o SETOR: a serralheria faz quatro peças,
  e voltar "para a serralheria" refaz as quatro (§19, 5-B2)
- ❌ Deixar o bandô recusado derrubar a montagem: ele não a segura, então não a
  derruba (§19, 5-B1 e 5-B2)
- ❌ Subir `refeitas` em tudo que foi reaberto: ela conta quantas vezes a PEÇA
  FÍSICA foi feita, e quem conta recusa é a `sm_recusa` (§19, 5-B2)
- ❌ Deixar de limpar o `kit_conferido_em` na reabertura: a persiana refeita
  fecharia a caixa sem o terceiro bipe (§19, 5-B2)
- ❌ Reimprimir o maço do pedido inteiro para refazer UMA peça: sobram
  etiquetas repetidas na bancada, que é o que a 4-A impede (§19, 5-B2)
- ❌ Oferecer à bancada o motivo que a rota vai recusar — o próprio trabalho e o
  que vem depois. Escolha que só serve para dar erro é a #6 numa lista (§19)
- ❌ Devolver lista de motivos vazia sem dizer por quê: são três razões e cada
  uma manda para um lugar diferente (§19, 5-B2)
- ❌ Reaproveitar a `motivo_recusa` do plano de corte para a recusa da produção:
  os relatórios das duas ficariam errados (§19, 5-B2, e a §4.16 da spec)
- ❌ Apagar motivo de recusa com história atrás, ou deixar o cadastro nascer
  vazio: o vazio faz o botão "Recusar" abrir uma lista sem nada (§19, 5-B2)
- ❌ Somar zero pelo rolo sem nota lançada: o total é PISO, com o `≥` na frente
  (§19)
- ❌ Cobrar "aprovado sem boleto" de quem paga em PIX ou cartão — a fábrica
  recebe dos três jeitos (dono, 26/09/2026), e aviso no caso normal é a #6
  (§19, 6-C1)
- ❌ Reabrir mais que o culpado e o que depende dele — nem menos: a mais é
  trabalho jogado fora, a menos é persiana montada sobre peça que foi pro lixo
  (§19, 5-B2)
- ❌ Trocar o `marco` para desfazer o pronto numa recusa: quem desfaz é o
  `pronto_em` — o marco é lido pela reimpressão e pelas duas contas da compra
  (§19, 5-B2)
- ❌ Dar código novo à peça refeita, ou tirar a marca vermelha do papel: o
  código é da peça, e sem a marca ficam duas etiquetas iguais na bancada
  (§19, 5-B2)
- ❌ Ativar produto que ainda se chama "Cópia de…", ou abrir o `ativo` pelo
  PUT do modelo: a porta própria é o que confere o nome (R-SMN-03)
- ❌ Escrever à mão a lista de colunas do duplicar: a próxima fase acrescenta
  uma e a cópia sai faltando ela, com cara de perfeita (R-SMN-02)
- ❌ Tirar o NOT NULL de `comando`/`rolamento` recriando `sm_pedido_item`: o
  produto que não liga a escolha grava '' (R-SMN-04)
- ❌ Aceitar fórmula digitada na tela para um produto novo: conta nova entra
  por spec, como peça pronta (R-SMN-05)
- ❌ Fazer a quantidade por referência que o cálculo não devolve virar zero: a
  peça sumiria da ficha calada (R-SMN-05)
- ❌ Gravar uma linha com quantidade 4 para peça com etiqueta: são quatro
  etiquetas, e o bipe, a recusa e o tempo são da unidade (R-SMN-08)
- ❌ Tirar medida do cadastro de material, ou nome da ficha quando há material
  ligado — e travar qualquer coisa por material incompleto (R-SMN-09)
- ❌ Usar o `impresso_em` como data de fabricação: a reimpressão o regrava
  (R-SMN-10)
- ❌ Voltar a liberar a montagem por uma lista de chaves: a vareta da Romana
  não seguraria nada (R-SMN-11)
- ❌ Devolver as quatro varetas porque uma veio torta (R-SMN-12)

